'use strict';

const mongoose = require('mongoose');

const idempotencyRecordSchema = new mongoose.Schema({
  scope: { type: String, required: true, unique: true, index: true },
  key: { type: String, required: true },
  method: { type: String, required: true },
  path: { type: String, required: true },
  state: { type: String, enum: ['pending', 'completed'], default: 'pending' },
  statusCode: { type: Number, default: 200 },
  responseBody: { type: mongoose.Schema.Types.Mixed, default: null },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

module.exports = mongoose.model('IdempotencyRecord', idempotencyRecordSchema);
