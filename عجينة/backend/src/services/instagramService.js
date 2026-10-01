'use strict';

/**
 * Latest Instagram posts, fetched straight from Instagram — no Behold or any
 * other feed service in between.
 *
 * Uses the official "Instagram API with Instagram Login" (graph.instagram.com)
 * with a long-lived access token the owner pastes into Settings once. Reading
 * the public profile without a token is not an option: from a server Instagram
 * answers 401 "require_login" immediately.
 *
 * - Posts are cached for 30 minutes, and the last good copy is kept in the
 *   database so a restart or an Instagram outage still shows the feed.
 * - Long-lived tokens last 60 days; this refreshes the token itself when it
 *   is within 10 days of expiring, so nobody has to remember to.
 * - The token never leaves the server: the public endpoint returns posts only.
 */

const SiteSettings = require('../models/SiteSettings');

const GRAPH          = 'https://graph.instagram.com';
const FIELDS         = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
const CACHE_MS       = 30 * 60 * 1000;
const REFRESH_WITHIN = 10 * 24 * 60 * 60 * 1000;
const LIMIT          = 12;

async function graph(pathname, params) {
  const url = `${GRAPH}${pathname}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `Instagram HTTP ${res.status}`);
  }
  return json;
}

/** Check a token and return the account it belongs to. */
async function verifyToken(token) {
  const me = await graph('/me', { fields: 'user_id,username,account_type', access_token: token });
  return { username: me.username, accountType: me.account_type };
}

/** Swap a token for a fresh 60-day one. Only works on long-lived tokens. */
async function refreshToken(token) {
  const r = await graph('/refresh_access_token', { grant_type: 'ig_refresh_token', access_token: token });
  return { token: r.access_token, expiresAt: new Date(Date.now() + (r.expires_in || 0) * 1000) };
}

const toPost = m => ({
  id:        m.id,
  caption:   (m.caption || '').slice(0, 300),
  type:      m.media_type,                                  // IMAGE | VIDEO | CAROUSEL_ALBUM
  image:     m.media_type === 'VIDEO' ? (m.thumbnail_url || m.media_url) : m.media_url,
  permalink: m.permalink,
  timestamp: m.timestamp,
});

let inflight = null;   // concurrent visitors share one Instagram request

async function loadFresh(settings) {
  let token = settings.instagramToken;

  /* Keep the token alive. A failed refresh is not fatal while it still works. */
  const exp = settings.instagramTokenExpiresAt?.getTime();
  if (exp && exp - Date.now() < REFRESH_WITHIN) {
    try {
      const r = await refreshToken(token);
      token = r.token;
      settings.instagramToken = r.token;
      settings.instagramTokenExpiresAt = r.expiresAt;
    } catch (err) {
      console.warn('⚠️  تعذّر تجديد مفتاح انستغرام:', err.message);
    }
  }

  const media = await graph('/me/media', { fields: FIELDS, limit: LIMIT, access_token: token });
  const posts = (media.data || []).filter(m => m.media_url || m.thumbnail_url).map(toPost);

  settings.instagramCache = { posts, fetchedAt: new Date(), error: '' };
  await settings.save();
  return posts;
}

/**
 * Posts for the storefront. Never throws: on any failure it falls back to the
 * last good copy (or an empty list), so the homepage cannot break over this.
 */
async function getFeed() {
  const settings = await SiteSettings.findOne().select('+instagramToken');
  if (!settings?.instagramToken) return { connected: false, posts: [] };

  const cache = settings.instagramCache || {};
  const age = cache.fetchedAt ? Date.now() - new Date(cache.fetchedAt).getTime() : Infinity;
  if (age < CACHE_MS && cache.posts?.length) {
    return { connected: true, posts: cache.posts, fetchedAt: cache.fetchedAt };
  }

  try {
    inflight ||= loadFresh(settings).finally(() => { inflight = null; });
    const posts = await inflight;
    return { connected: true, posts, fetchedAt: new Date() };
  } catch (err) {
    console.warn('⚠️  تعذّر جلب منشورات انستغرام:', err.message);
    await SiteSettings.updateOne({ _id: settings._id }, { $set: { 'instagramCache.error': err.message } });
    return { connected: true, stale: true, posts: cache.posts || [], fetchedAt: cache.fetchedAt };
  }
}

module.exports = { getFeed, verifyToken, refreshToken };
