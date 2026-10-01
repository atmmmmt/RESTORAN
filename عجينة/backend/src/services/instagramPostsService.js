'use strict';

/**
 * Cover image and video for the posts chosen in Settings — no token.
 *
 * Instagram will not let a server read the profile, but each post's public
 * embed page, when requested the way a browser frames it, carries the post's
 * `display_url` (cover) and `video_url` (mp4). We read those once and copy
 * both to our own Cloudinary: Instagram's CDN links are signed and expire
 * within days, and serving our copy lets the storefront use its own player
 * instead of Instagram's embed (which shows the account's follower count and
 * cannot be told to stop when another video starts).
 */

const SiteSettings = require('../models/SiteSettings');
const cloudinary   = require('../config/cloudinary');
const cacheService = require('./cacheService');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/* The embed only includes the media when asked for as an iframe; a plain
   request gets "X-Frame-Options: DENY" and a stripped page. */
const EMBED_HEADERS = {
  'User-Agent':      UA,
  'Accept-Language': 'ar,en;q=0.8',
  'Sec-Fetch-Dest':  'iframe',
  'Sec-Fetch-Mode':  'navigate',
  'Sec-Fetch-Site':  'cross-site',
  Referer:           'https://ajineh-w-tahineh.com/',
};

/**
 * Fetch the embed page with curl rather than Node's fetch.
 *
 * Instagram answers this URL with one of two pages: the real one carrying the
 * post's media, or an empty app shell. From the same server, with the same
 * headers, curl gets the real page (~280KB) and Node's fetch always gets the
 * shell (~700KB) — so what Instagram is sorting on is the client's TLS/HTTP
 * fingerprint, which no header can change. fetch stays as a fallback for
 * hosts without curl, where it will simply find nothing to extract.
 */
async function fetchEmbed(kind, code) {
  const url = `https://www.instagram.com/${kind === 'reel' ? 'reel' : 'p'}/${code}/embed/`;

  const { execFile } = require('child_process');
  const { promisify } = require('util');

  const args = ['-sL', '--compressed', '-m', '25'];
  for (const [k, v] of Object.entries(EMBED_HEADERS)) args.push('-H', `${k}: ${v}`);
  args.push(url);

  try {
    const { stdout } = await promisify(execFile)('curl', args, { maxBuffer: 32 * 1024 * 1024 });
    if (stdout && stdout.length) return stdout;
    throw new Error('صفحة فارغة من انستغرام');
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;          // curl ran and failed — real error
    const res = await fetch(url, { headers: EMBED_HEADERS, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Instagram HTTP ${res.status}`);
    return res.text();
  }
}

/* The URLs sit inside JSON that is itself inside a string, so slashes and
   ampersands arrive escaped once or twice ("\\\/", "\\u0026"). */
function unescapeDeep(s) {
  let prev;
  do {
    prev = s;
    s = s.replace(/\\+\//g, '/').replace(/\\+u0026/gi, '&').replace(/&amp;/g, '&');
  } while (s !== prev);
  return s;
}

function pick(html, key) {
  const re = new RegExp(String.raw`${key}\\*"\s*:\s*\\*"(https:[^"]+?)\\*"`);
  const m = html.match(re);
  return m ? unescapeDeep(m[1]) : null;
}

/* Fallback for posts without the JSON blob: the cover <img> itself. */
function coverFromImg(html) {
  const m = html.match(/EmbeddedMediaImage"[^>]*?\ssrc="([^"]+)"/);
  return m ? unescapeDeep(m[1]) : null;
}

async function rehost(url, code, type) {
  const r = await cloudinary.uploader.upload(url, {
    folder:        'luliz/instagram',
    public_id:     `${code}-${type}`,
    overwrite:     true,
    resource_type: type === 'video' ? 'video' : 'image',
  });
  return r.secure_url;
}

let running = null;   // one sync at a time; callers share the result

/**
 * Fill in cover + video for every chosen post that lacks them (or all of
 * them with `force`). Slow on purpose — a pause between posts keeps us from
 * looking like a scraper hammering Instagram.
 */
function syncPosts({ force = false } = {}) {
  if (running) return running;

  running = (async () => {
    const s = await SiteSettings.getSingleton();
    const results = [];

    for (const p of s.instagramPosts || []) {
      if (!force && p.cover && (p.video || p.kind !== 'reel')) {
        results.push({ code: p.code, status: 'ok', cached: true });
        continue;
      }

      const where = { _id: s._id, 'instagramPosts.code': p.code };
      try {
        const html  = await fetchEmbed(p.kind, p.code);
        const cSrc  = pick(html, 'display_url') || coverFromImg(html);
        const vSrc  = pick(html, 'video_url');
        if (!cSrc) throw new Error('لم يُعثر على غلاف في صفحة المنشور');

        const cover = await rehost(cSrc, p.code, 'cover');
        const video = vSrc ? await rehost(vSrc, p.code, 'video') : '';

        await SiteSettings.updateOne(where, { $set: {
          'instagramPosts.$.cover': cover,
          'instagramPosts.$.video': video,
          'instagramPosts.$.error': '',
          'instagramPosts.$.syncedAt': new Date(),
        } });
        results.push({ code: p.code, status: 'ok', video: !!video });
      } catch (err) {
        await SiteSettings.updateOne(where, { $set: { 'instagramPosts.$.error': String(err.message).slice(0, 200) } });
        results.push({ code: p.code, status: 'error', message: err.message });
      }

      await new Promise(r => setTimeout(r, 1500));
    }

    cacheService.del('site-settings');
    return results;
  })().finally(() => { running = null; });

  return running;
}

module.exports = { syncPosts, fetchEmbed, pick };
