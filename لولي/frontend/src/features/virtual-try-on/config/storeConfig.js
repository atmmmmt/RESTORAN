/**
 * Multi-store configuration for WebAR Virtual Try-On.
 *
 * The module ships with neutral defaults and reads its look from CSS custom
 * properties, so dropping it into another store means supplying a config
 * object — never editing the module. Nothing here names a specific brand.
 */

import { SPACE_TYPES } from '../types/virtualTryOn.types'

/** @type {import('../types/virtualTryOn.types').VirtualTryOnStoreConfig} */
export const DEFAULT_STORE_CONFIG = {
  enabled: true,
  supportedTypes: ['furniture', 'generic-space'],
  primaryButtonLabel: '',      // empty = derive from product type
  secondaryButtonLabel: '',
  cameraPrivacyMessage: '',    // empty = use the localized default
  themeMode: 'inherit',
  allowCustomerCapture: true,
  allowSharing: true,
  showAddToCartInsideViewer: true,
}

/**
 * Theme tokens are read from the page rather than hardcoded, so the viewer
 * inherits whatever the host store already uses for colour and radius.
 */
export function resolveTheme(themeMode = 'inherit') {
  const root = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null
  const read = (name, fallback) => {
    const v = root?.getPropertyValue(name)?.trim()
    return v || fallback
  }

  const dark = themeMode === 'dark'
    || (themeMode === 'inherit'
      && typeof document !== 'undefined'
      && document.documentElement.dataset.theme === 'dark')

  return {
    dark,
    primary:    read('--vto-primary',    '#C18A4A'),
    onPrimary:  read('--vto-on-primary', '#F6EFE6'),
    surface:    read('--vto-surface',    dark ? '#1A1512' : '#FFFFFF'),
    onSurface:  read('--vto-on-surface', dark ? '#F4EDE4' : '#20160F'),
    muted:      read('--vto-muted',      dark ? 'rgba(244,237,228,0.6)' : '#7A6855'),
    accent:     read('--vto-accent',     '#EAD9C2'),
    radius:     read('--vto-radius',     '1rem'),
    fontHeading: read('--font-heading', 'inherit'),
    fontBody:    read('--font-body', 'inherit'),
  }
}

/** RTL/LTR is taken from the document so the module never guesses. */
export function resolveDirection() {
  if (typeof document === 'undefined') return 'rtl'
  return document.documentElement.dir || document.body.dir || 'rtl'
}

export function resolveLocale() {
  if (typeof document === 'undefined') return 'ar'
  const lang = document.documentElement.lang || 'ar'
  return lang.startsWith('en') ? 'en' : 'ar'
}

/** Merge a store's overrides over the defaults. */
export function buildStoreConfig(overrides = {}) {
  return { ...DEFAULT_STORE_CONFIG, ...overrides }
}

/**
 * Is this product's try-on allowed by the store?
 * A store selling only food has no reason to expose ring tracking even if a
 * product row somehow carries that type.
 */
export function isTypeAllowed(config, type) {
  if (!config?.enabled) return false
  if (!type || type === 'none') return false
  return (config.supportedTypes || []).includes(type)
}

export { SPACE_TYPES }
