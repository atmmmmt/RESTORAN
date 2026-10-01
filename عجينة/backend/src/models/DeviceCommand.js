'use strict';

const mongoose = require('mongoose');

/**
 * A job for a branch agent to run against its fingerprint terminal.
 *
 * The dashboard used to call the terminal straight from the request handler.
 * It cannot any more — nothing here can open a socket into a branch LAN — so
 * those actions become rows the branch's agent picks up on its next poll and
 * reports back on. The dashboard shows the result when it lands rather than
 * blocking on the round trip.
 */
const TYPES = [
  'push-user',          // create/update the employee on the terminal
  'delete-user',
  'clear-fingerprints',
  'start-enroll',       // put the terminal into enrolment mode for a finger
  'sync-time',
  'get-info',
  'get-users',
  'scan-network',      // sweep the branch LAN for terminals on port 4370
];

const deviceCommandSchema = new mongoose.Schema(
  {
    deviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AttendanceDevice',
      required: true,
      index: true,
    },
    type:    { type: String, enum: TYPES, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },

    status: {
      type: String,
      enum: ['pending', 'running', 'done', 'failed', 'expired'],
      default: 'pending',
      index: true,
    },

    result:  { type: mongoose.Schema.Types.Mixed, default: null },
    message: { type: String, default: '' },

    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    claimedAt:   { type: Date },
    finishedAt:  { type: Date },

    /* An agent that dies mid-job would otherwise strand the row in
       'running' forever; the poll route reclaims anything older than this. */
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 10 * 60 * 1000),
    },
  },
  { timestamps: true }
);

deviceCommandSchema.index({ deviceId: 1, status: 1, createdAt: 1 });

deviceCommandSchema.statics.TYPES = TYPES;

module.exports = mongoose.model('DeviceCommand', deviceCommandSchema);
