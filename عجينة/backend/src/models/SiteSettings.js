'use strict';

const mongoose = require('mongoose');

const siteSettingsSchema = new mongoose.Schema(
  {
    heroImage:    { type: String, default: '' },
    waNumber:     { type: String, default: '' },
    siteName:     { type: String, default: "Loli's Kitchen" },
    tagline:      { type: String, default: 'بنكهة بيتية أصيلة' },
    instagramUrl: { type: String, default: '' },  // e.g. https://www.instagram.com/3ajineh.w.t7ineh/
    /* Legacy: the feed used to come from Behold.so. Kept so old documents
       still validate; nothing reads it any more. */
    beholdFeedId:      { type: String,  default: '' },
    comingSoonEnabled: { type: Boolean, default: false },

    /* ── Instagram, read directly from graph.instagram.com ──
       The access token is a credential for the owner's account: it is never
       selected by default, so no query that feeds a public response can leak
       it by accident. See services/instagramService.js. */
    instagramToken:          { type: String, default: '', select: false },
    instagramUser:           { type: String, default: '' },
    instagramTokenExpiresAt: { type: Date },
    /* Last good copy of the feed — survives restarts and Instagram outages. */
    instagramCache: {
      posts:     { type: [mongoose.Schema.Types.Mixed], default: [] },
      fetchedAt: { type: Date },
      error:     { type: String, default: '' },
    },

    /* Posts chosen by hand, shown with Instagram's official per-post embed.
       Works with no token at all — the profile itself cannot be read without
       one, but a single post's embed is public and may be framed. Order is
       display order, so pinned posts go first. */
    instagramPosts: {
      type: [{
        kind:     { type: String, enum: ['p', 'reel'], default: 'p' },
        code:     String,
        /* Cover and video copied to our Cloudinary — Instagram's CDN links
           are signed and expire within days, ours do not. Empty until the
           background sync has fetched them; the storefront then falls back
           to the embed for that one post. */
        cover:    { type: String, default: '' },
        video:    { type: String, default: '' },
        error:    { type: String, default: '' },
        syncedAt: { type: Date },
        _id: false,
      }],
      default: [],
    },
  },
  { timestamps: true }
);

/* Singleton — always work with the first (and only) document */
siteSettingsSchema.statics.getSingleton = async function () {
  let doc = await this.findOne();
  if (!doc) doc = await this.create({});
  return doc;
};

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
