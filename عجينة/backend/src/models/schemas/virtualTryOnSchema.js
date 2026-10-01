'use strict';

/**
 * WebAR Product Virtual Try-On — shared sub-schema.
 *
 * Lives on its own so any store's Product model can embed it with one line
 * and stay in step with the module. Every field carries a safe default, so
 * products created before this feature existed keep loading untouched — no
 * migration required. `enabled: false` means the storefront ignores it
 * entirely and ships no AR code to the browser.
 */

const mongoose = require('mongoose');

/** Every tracking mode the module knows about. */
const TRY_ON_TYPES = [
  'none',
  'ring',
  'bracelet',
  'watch',
  'necklace',
  'earrings',
  'glasses',
  'clothing',
  'furniture',
  'generic-space',
];

/**
 * Types that need live body tracking (MediaPipe) versus types that only need
 * surface placement. The storefront uses this to decide which bundle to
 * lazy-load, so a bakery never downloads hand-tracking code.
 */
const BODY_TRACKED_TYPES = ['ring', 'bracelet', 'watch', 'necklace', 'earrings', 'glasses', 'clothing'];
const SPACE_TYPES        = ['furniture', 'generic-space'];

const vec3 = (d = 0) => ({
  x: { type: Number, default: d },
  y: { type: Number, default: d },
  z: { type: Number, default: d },
});

const virtualTryOnSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    type:    { type: String, enum: TRY_ON_TYPES, default: 'none' },

    /* ── Assets ──────────────────────────────────────────────
       model3DUrl    GLB/GLTF — web + Android (Scene Viewer)
       iosModelUrl   USDZ     — Apple AR Quick Look
       previewImageUrl        — last-resort fallback image      */
    model3DUrl:      { type: String, trim: true, default: '' },
    model3DPublicId: { type: String, trim: true, default: '' },
    model3DBytes:    { type: Number, default: 0 },
    iosModelUrl:      { type: String, trim: true, default: '' },
    iosModelPublicId: { type: String, trim: true, default: '' },
    iosModelBytes:    { type: Number, default: 0 },
    previewImageUrl:      { type: String, trim: true, default: '' },
    previewImagePublicId: { type: String, trim: true, default: '' },

    /* ── Calibration ─────────────────────────────────────── */
    scale:          { type: Number, default: 1, min: 0.01, max: 100 },
    positionOffset: vec3(0),
    rotationOffset: vec3(0),          // degrees — friendlier for admins than radians
    minimumScale:   { type: Number, default: 0.1, min: 0.01 },
    maximumScale:   { type: Number, default: 5,   min: 0.01 },

    /* ── Behaviour ───────────────────────────────────────── */
    targetHand:        { type: String, enum: ['left', 'right', 'both'], default: 'both' },
    targetSide:        { type: String, enum: ['left', 'right', 'both'], default: 'both' }, // earrings
    trackingSmoothing: { type: Number, default: 0.5, min: 0, max: 0.99 },

    showShadow:            { type: Boolean, default: true },
    enableOcclusion:       { type: Boolean, default: false },
    allowManualAdjustment: { type: Boolean, default: true },

    /* Placement hint for space AR — model-viewer needs to know whether the
       piece belongs on the floor or on a table/wall. */
    placement: { type: String, enum: ['floor', 'wall'], default: 'floor' },

    status: { type: String, enum: ['draft', 'processing', 'ready', 'disabled'], default: 'draft' },

    /* ── Audit ───────────────────────────────────────────── */
    lastCalibratedAt: { type: Date },
    lastCalibratedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

/**
 * True only when the customer can actually be shown something.
 * The storefront must never render a try-on button that opens an empty scene.
 */
virtualTryOnSchema.virtual('isViewable').get(function () {
  return !!(this.enabled && this.type !== 'none' && this.status === 'ready' && this.model3DUrl);
});

virtualTryOnSchema.set('toJSON',   { virtuals: true });
virtualTryOnSchema.set('toObject', { virtuals: true });

module.exports = {
  virtualTryOnSchema,
  TRY_ON_TYPES,
  BODY_TRACKED_TYPES,
  SPACE_TYPES,
};
