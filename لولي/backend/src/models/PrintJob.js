'use strict';

const mongoose = require('mongoose');

const printJobSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, trim: true, index: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['pending', 'claimed', 'done', 'failed'], default: 'pending', index: true },
  result: { type: mongoose.Schema.Types.Mixed, default: {} },
  claimedAt: Date,
  claimExpiresAt: Date,
  completedAt: Date,
}, { timestamps: true });

printJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });
printJobSchema.index({ deviceId: 1, status: 1, createdAt: 1 });

module.exports = mongoose.model('PrintJob', printJobSchema);
