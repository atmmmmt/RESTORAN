'use strict';

const mongoose = require('mongoose');

const siteSettingsSchema = new mongoose.Schema(
  {
    heroImage:    { type: String, default: '' },
    waNumber:     { type: String, default: '' },
    siteName:     { type: String, default: "Loli's Kitchen" },
    tagline:      { type: String, default: 'بنكهة بيتية أصيلة' },
    instagramUrl: { type: String, default: '' },  // e.g. https://instagram.com/loliskitchen
    beholdFeedId:      { type: String,  default: '' },
    comingSoonEnabled: { type: Boolean, default: false },
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
