'use strict';

const mongoose = require('mongoose');
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const schema = new mongoose.Schema({
  openingTime: { type: String, default: '10:00', match: [TIME, 'صيغة الوقت HH:MM'] },
  closingTime: { type: String, default: '04:00', match: [TIME, 'صيغة الوقت HH:MM'] },
}, { timestamps: true });

schema.statics.getSingleton = async function () {
  let doc = await this.findOne();
  if (!doc) doc = await this.create({});
  return doc;
};

module.exports = mongoose.model('BusinessSettings', schema);
module.exports.TIME = TIME;
