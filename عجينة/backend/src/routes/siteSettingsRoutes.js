'use strict';

const router       = require('express').Router();
const { protect, requireAdmin } = require('../middleware/auth');
const SiteSettings = require('../models/SiteSettings');
const cache        = require('../middleware/cache');
const cacheService = require('../services/cacheService');
const instagram    = require('../services/instagramService');
const instagramPosts = require('../services/instagramPostsService');

const THIRTY_MIN = 30 * 60 * 1000;

/* Public settings never carry Instagram internals: the token is excluded at
   the schema level, and the cached feed is served by its own endpoint. */
function publicView(doc) {
  const out = doc.toObject();
  delete out.instagramToken;
  delete out.instagramCache;
  return out;
}

/* ── GET /api/site-settings — public (no auth) — cached ── */
router.get('/', cache('site-settings', THIRTY_MIN), async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const settings = await SiteSettings.getSingleton();
  res.json({ success: true, settings: publicView(settings) });
});

/* ── GET /api/site-settings/instagram-feed — public ──
   Latest posts, straight from Instagram (cached server-side for 30 min).
   Never fails: without a connected account it returns an empty list. */
router.get('/instagram-feed', async (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300');
  const feed = await instagram.getFeed();
  res.json({ success: true, connected: feed.connected, posts: feed.posts.slice(0, 12) });
});

/* ── PUT /api/site-settings — admin only ── */
router.put('/', protect, requireAdmin, async (req, res) => {
  const { heroImage, waNumber, siteName, tagline, instagramUrl, beholdFeedId, comingSoonEnabled } = req.body;

  const $set = {};
  if (heroImage          !== undefined) $set.heroImage          = heroImage;
  if (waNumber           !== undefined) $set.waNumber           = waNumber;
  if (siteName           !== undefined) $set.siteName           = siteName;
  if (tagline            !== undefined) $set.tagline            = tagline;
  if (instagramUrl       !== undefined) $set.instagramUrl       = instagramUrl;
  if (beholdFeedId       !== undefined) $set.beholdFeedId       = beholdFeedId;
  if (comingSoonEnabled  !== undefined) $set.comingSoonEnabled  = comingSoonEnabled;

  /* Post links as pasted — full URLs, "reel/CODE" or bare codes. Order is
     kept (it is the display order), duplicates dropped, capped at 12. */
  if (req.body.instagramPosts !== undefined) {
    /* Posts already on the list keep the cover and video we copied for them —
       only genuinely new ones need fetching. */
    const current = await SiteSettings.findOne().lean();
    const known = new Map((current?.instagramPosts || []).map(p => [p.code, p]));

    const seen = new Set();
    $set.instagramPosts = (Array.isArray(req.body.instagramPosts) ? req.body.instagramPosts : [])
      .map(x => {
        const raw = typeof x === 'string' ? x : `${x?.kind || 'p'}/${x?.code || ''}`;
        const m = String(raw).trim().match(/(?:^|\/)(p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})/) ||
                  String(raw).trim().match(/^()([A-Za-z0-9_-]{5,})$/);
        if (!m) return null;
        return { ...(known.get(m[2]) || {}), kind: /^reel/.test(m[1]) ? 'reel' : 'p', code: m[2] };
      })
      .filter(p => p && !seen.has(p.code) && seen.add(p.code))
      .slice(0, 12);
  }

  console.log('💾 SiteSettings update:', JSON.stringify($set));

  const settings = await SiteSettings.findOneAndUpdate(
    {},
    { $set },
    { upsert: true, new: true, runValidators: true }
  );

  cacheService.del('site-settings');

  if (req.body.instagramPosts !== undefined) {
    instagramPosts.syncPosts().catch(err => console.warn('⚠️  مزامنة منشورات انستغرام:', err.message));
  }

  res.json({ success: true, settings: publicView(settings), message: 'تم حفظ إعدادات الموقع بنجاح' });
});

/* ── Instagram connection — admin only ── */

router.get('/instagram-status', protect, requireAdmin, async (req, res) => {
  const s = await SiteSettings.findOne().select('+instagramToken');
  res.json({
    success:   true,
    connected: !!s?.instagramToken,
    username:  s?.instagramUser || '',
    expiresAt: s?.instagramTokenExpiresAt || null,
    fetchedAt: s?.instagramCache?.fetchedAt || null,
    postCount: s?.instagramCache?.posts?.length || 0,
    error:     s?.instagramCache?.error || '',
  });
});

/* Paste a long-lived token. It is checked against Instagram before it is
   stored, and the feed is fetched straight away so the site fills now. */
router.put('/instagram-token', protect, requireAdmin, async (req, res) => {
  const token = String(req.body?.token || '').trim();
  if (!token) return res.status(400).json({ success: false, message: 'الصق مفتاح الوصول أولاً' });

  let me;
  try {
    me = await instagram.verifyToken(token);
  } catch (err) {
    return res.status(400).json({ success: false, message: 'المفتاح غير صالح: ' + err.message });
  }

  const s = await SiteSettings.getSingleton();
  s.instagramToken = token;
  s.instagramUser  = me.username || '';
  /* Long-lived tokens last 60 days; the service refreshes it 10 days early. */
  s.instagramTokenExpiresAt = new Date(Date.now() + 59 * 24 * 60 * 60 * 1000);
  s.instagramCache = { posts: [], fetchedAt: null, error: '' };
  await s.save();

  const feed = await instagram.getFeed();
  res.json({
    success:   true,
    username:  me.username,
    postCount: feed.posts.length,
    message:   `تم ربط حساب @${me.username} — ${feed.posts.length} منشور`,
  });
});

router.delete('/instagram-token', protect, requireAdmin, async (req, res) => {
  await SiteSettings.updateOne({}, {
    $set: {
      instagramToken: '', instagramUser: '', instagramTokenExpiresAt: null,
      instagramCache: { posts: [], fetchedAt: null, error: '' },
    },
  });
  res.json({ success: true, message: 'تم فصل حساب الانستغرام' });
});

/* ── POST /api/site-settings/instagram-posts/sync — admin ──
   Fetch cover + video for the chosen posts now, and wait for the result.
   { force: true } re-fetches posts that already have them. */
router.post('/instagram-posts/sync', protect, requireAdmin, async (req, res) => {
  const results = await instagramPosts.syncPosts({ force: !!req.body?.force });
  const ok = results.filter(r => r.status === 'ok').length;
  res.json({ success: true, results, message: `جاهز ${ok} من ${results.length} منشور` });
});

module.exports = router;
