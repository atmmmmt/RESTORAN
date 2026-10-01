/**
 * WebAR Product Virtual Try-On — public entry point.
 *
 * A host store imports from here and nothing deeper. Everything exported is
 * either tree-shakeable or lazy, so importing this file costs almost nothing
 * until a viewer is actually opened.
 */

export { default as VirtualTryOnButton, VirtualTryOnBadge } from './components/VirtualTryOnButton'

export { useTryOnCalibration } from './hooks/useTryOnCalibration'
export { default as virtualTryOnApi } from './services/virtualTryOnApi'

export {
  TRY_ON_TYPES, BODY_TRACKED_TYPES, SPACE_TYPES,
  TYPE_LABELS, DEFAULT_TRY_ON, getTryOnMode,
} from './types/virtualTryOn.types'

export {
  DEFAULT_STORE_CONFIG, buildStoreConfig, isTypeAllowed,
  resolveTheme, resolveDirection, resolveLocale,
} from './config/storeConfig'

export { createTranslator, STRINGS } from './config/i18n'
export { getDeviceSupport, resolveExperience, supportsWebXR } from './utils/deviceSupport'
export { vtoAnalytics, VTO_EVENTS } from './services/analytics'
