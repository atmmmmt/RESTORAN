'use strict';

const crypto   = require('crypto');
const mongoose = require('mongoose');

/**
 * One fingerprint terminal, bound to one branch.
 *
 * The server can no longer dial these units directly: it runs in a data
 * centre while the terminals sit on private LANs behind NAT, and every
 * branch numbers its LAN 192.168.1.x — so the addresses are not even
 * unique between branches. Instead a small agent runs inside each branch,
 * authenticates with `agentKey`, and pushes punches out to us.
 *
 * `deviceIp` is therefore advisory: it tells the *agent* which box on its
 * own LAN to talk to, and is never dialled from here.
 */
const attendanceDeviceSchema = new mongoose.Schema(
  {
    /* null = head office / single-branch setups */
    centerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalesCenter',
      default: null,
      unique: true,
    },
    name: { type: String, trim: true, default: '' },

    /* ── Where the agent finds the terminal on its own LAN ── */
    deviceIp:      { type: String, trim: true, default: '192.168.1.201' },
    devicePort:    { type: Number, default: 4370 },
    deviceTimeout: { type: Number, default: 10000 },

    /* ── Agent credential ──────────────────────────────────
       Stored hashed. The plaintext is shown once, at creation, and then
       lives only in the branch's agent config — a leaked database dump
       must not hand out the ability to post fake attendance. */
    agentKeyHash: { type: String, default: '', select: false },
    agentKeyHint: { type: String, default: '' },   // last 4 chars, to tell keys apart

    /* ── Health, reported by the agent ── */
    agentVersion:   { type: String, default: '' },
    lastSeenAt:     { type: Date },
    lastSyncAt:     { type: Date },
    lastSyncCount:  { type: Number, default: 0 },
    deviceReachable: { type: Boolean, default: false },
    lastError:      { type: String, default: '' },

    /* Terminals the agent last saw on its own LAN. The server cannot scan a
       branch network, so this is the only way the dashboard can offer a
       pick-list instead of asking someone to read an IP off a device screen. */
    discovered:     { type: [String], default: [] },
    discoveredAt:   { type: Date },

    deviceSerial:  { type: String, trim: true, default: '' },
    deviceVersion: { type: String, trim: true, default: '' },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

/* ── Agent key helpers ─────────────────────────────────────
   A plain SHA-256 is the right tool here, unlike for passwords: the key is
   32 bytes of machine-generated randomness, so there is nothing to brute
   force, and lookups happen on every agent poll. */
function hashKey(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex');
}

attendanceDeviceSchema.statics.hashKey = hashKey;

attendanceDeviceSchema.statics.generateKey = function () {
  return crypto.randomBytes(24).toString('base64url');
};

/** Resolve an agent key to its device, or null. */
attendanceDeviceSchema.statics.findByAgentKey = function (key) {
  if (!key) return null;
  return this.findOne({ agentKeyHash: hashKey(key), isActive: true });
};

attendanceDeviceSchema.methods.setAgentKey = function (key) {
  this.agentKeyHash = hashKey(key);
  this.agentKeyHint = String(key).slice(-4);
};

module.exports = mongoose.model('AttendanceDevice', attendanceDeviceSchema);
