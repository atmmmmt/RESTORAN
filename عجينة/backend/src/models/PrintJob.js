'use strict';

const mongoose = require('mongoose');

const printJobSchema = new mongoose.Schema({
  tenant: { type: String, default: 'ajeena', index: true },
  centerId: { type: mongoose.Schema.Types.ObjectId, ref: 'SalesCenter', default: null, index: true },
  deviceId: { type: String, required: true, trim: true, index: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  status: {
    type: String,
    enum: ['pending', 'claimed', 'done', 'failed'],
    default: 'pending',
    index: true,
  },
  claimedAt: Date,
  claimExpiresAt: Date,
  completedAt: Date,
  resultMessage: { type: String, default: '' },
}, { timestamps: true });

printJobSchema.index({ createdAt: 1 }, { expireAfterSeconds: 86400 });
printJobSchema.index({ deviceId: 1, status: 1, createdAt: 1 });

module.exports = mongoose.model('PrintJob', printJobSchema);
