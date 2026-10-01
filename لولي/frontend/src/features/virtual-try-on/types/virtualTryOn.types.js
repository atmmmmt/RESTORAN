/**
 * WebAR Product Virtual Try-On — shared types and constants.
 *
 * The project is plain JS, so the TypeScript contract from the spec is
 * expressed here as JSDoc typedefs (editors still get full autocomplete and
 * checking) plus runtime constants the rest of the module imports.
 *
 * @typedef {'none'|'ring'|'bracelet'|'watch'|'necklace'|'earrings'|'glasses'|'clothing'|'furniture'|'generic-space'} TryOnType
 * @typedef {'draft'|'processing'|'ready'|'disabled'} TryOnStatus
 * @typedef {'body'|'space'|'none'} TryOnMode
 *
 * @typedef {{ x:number, y:number, z:number }} Vec3
 *
 * @typedef {Object} VirtualTryOnConfig
 * @property {boolean}   enabled
 * @property {TryOnType} type
 * @property {TryOnStatus} status
 * @property {boolean}   isViewable
 * @property {TryOnMode} mode
 * @property {string}    model3DUrl
 * @property {string}    iosModelUrl
 * @property {string}    previewImageUrl
 * @property {number}    scale
 * @property {Vec3}      positionOffset
 * @property {Vec3}      rotationOffset
 * @property {number}    minimumScale
 * @property {number}    maximumScale
 * @property {'left'|'right'|'both'} targetHand
 * @property {'left'|'right'|'both'} targetSide
 * @property {number}    trackingSmoothing
 * @property {boolean}   showShadow
 * @property {boolean}   enableOcclusion
 * @property {boolean}   allowManualAdjustment
 * @property {'floor'|'wall'} placement
 *
 * @typedef {Object} VirtualTryOnStoreConfig
 * @property {boolean}  enabled
 * @property {TryOnType[]} supportedTypes
 * @property {string}   primaryButtonLabel
 * @property {string}   [secondaryButtonLabel]
 * @property {string}   cameraPrivacyMessage
 * @property {'inherit'|'light'|'dark'} themeMode
 * @property {boolean}  allowCustomerCapture
 * @property {boolean}  allowSharing
 * @property {boolean}  showAddToCartInsideViewer
 */

export const TRY_ON_TYPES = [
  'none', 'ring', 'bracelet', 'watch', 'necklace',
  'earrings', 'glasses', 'clothing', 'furniture', 'generic-space',
]

/** Types needing live body tracking — these pull in MediaPipe. */
export const BODY_TRACKED_TYPES = [
  'ring', 'bracelet', 'watch', 'necklace', 'earrings', 'glasses', 'clothing',
]

/** Types needing only surface placement — handled by <model-viewer>. */
export const SPACE_TYPES = ['furniture', 'generic-space']

/** Which MediaPipe task each body type needs, so we load one, not all three. */
export const TRACKER_BY_TYPE = {
  ring:     'hand',
  bracelet: 'hand',
  watch:    'hand',
  glasses:  'face',
  earrings: 'face',
  necklace: 'pose',
  clothing: 'pose',
}

export const getTryOnMode = type =>
  BODY_TRACKED_TYPES.includes(type) ? 'body'
    : SPACE_TYPES.includes(type) ? 'space'
      : 'none'

/** Customer-facing labels per product family, in both languages. */
export const TYPE_LABELS = {
  ring:            { ar: 'جرّبي الخاتم',        en: 'Try the ring' },
  bracelet:        { ar: 'جرّبي الإسورة',       en: 'Try the bracelet' },
  watch:           { ar: 'جرّب الساعة',         en: 'Try the watch' },
  necklace:        { ar: 'جرّبي القلادة',       en: 'Try the necklace' },
  earrings:        { ar: 'جرّبي الأقراط',       en: 'Try the earrings' },
  glasses:         { ar: 'جرّب النظارة',        en: 'Try the glasses' },
  clothing:        { ar: 'جرّب القطعة',         en: 'Try it on' },
  furniture:       { ar: 'شاهد المنتج في مساحتك', en: 'View in Your Space' },
  'generic-space': { ar: 'شاهده على طاولتك',    en: 'View in Your Space' },
}

/** Defaults mirroring the Mongoose schema — used for optimistic UI. */
export const DEFAULT_TRY_ON = {
  enabled: false,
  type: 'none',
  status: 'draft',
  isViewable: false,
  mode: 'none',
  model3DUrl: '',
  iosModelUrl: '',
  previewImageUrl: '',
  scale: 1,
  positionOffset: { x: 0, y: 0, z: 0 },
  rotationOffset: { x: 0, y: 0, z: 0 },
  minimumScale: 0.1,
  maximumScale: 5,
  targetHand: 'both',
  targetSide: 'both',
  trackingSmoothing: 0.5,
  showShadow: true,
  enableOcclusion: false,
  allowManualAdjustment: true,
  placement: 'floor',
}

/** Tracking quality buckets shown to the customer as a signal bar. */
export const TRACKING_QUALITY = {
  NONE:   'none',
  POOR:   'poor',
  GOOD:   'good',
  STRONG: 'strong',
}
