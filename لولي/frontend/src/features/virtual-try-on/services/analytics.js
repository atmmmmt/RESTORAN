/**
 * Anonymous analytics for WebAR Virtual Try-On.
 *
 * Deliberately narrow: counts and durations only. No landmark data, no frame
 * data, no image ever leaves the device through this path — the spec forbids
 * it and the events below are enough to answer "is this feature working?".
 *
 * Events are handed to whatever sink the host store already uses (gtag,
 * dataLayer, Plausible) and are dropped silently if none exists.
 */

export const VTO_EVENTS = {
  BUTTON_CLICKED:      'vto_button_clicked',
  PERMISSION_ACCEPTED: 'vto_camera_permission_accepted',
  PERMISSION_REJECTED: 'vto_camera_permission_rejected',
  TRACKING_STARTED:    'vto_tracking_started',
  TRACKING_FAILED:     'vto_tracking_failed',
  PHOTO_CAPTURED:      'vto_photo_captured',
  ADDED_TO_CART:       'vto_added_to_cart',
  SESSION_ENDED:       'vto_session_duration',
  PRODUCT_CHANGED:     'vto_product_changed',
  EXPERIENCE_RESOLVED: 'vto_experience_resolved',
  UNSUPPORTED:         'vto_unsupported_device',
}

/** Coarse device/browser descriptors — nothing that identifies a person. */
function deviceContext() {
  const ua = navigator.userAgent
  const platform = /iPad|iPhone|iPod/.test(ua) ? 'ios'
    : /Android/i.test(ua) ? 'android'
      : /Mobi/i.test(ua) ? 'mobile-other' : 'desktop'
  const browser = /crios|chrome/i.test(ua) ? 'chrome'
    : /fxios|firefox/i.test(ua) ? 'firefox'
      : /safari/i.test(ua) ? 'safari'
        : /edg/i.test(ua) ? 'edge' : 'other'
  return { device_type: platform, browser }
}

function emit(event, payload) {
  const data = { ...deviceContext(), ...payload }

  try {
    if (typeof window.gtag === 'function') {
      window.gtag('event', event, data)
    } else if (Array.isArray(window.dataLayer)) {
      window.dataLayer.push({ event, ...data })
    } else if (typeof window.plausible === 'function') {
      window.plausible(event, { props: data })
    } else if (import.meta.env?.DEV) {
      console.debug(`[VTO] ${event}`, data)
    }
  } catch {
    // Analytics must never be able to break the viewer.
  }
}

export const vtoAnalytics = {
  buttonClicked: (productId, type, experience) =>
    emit(VTO_EVENTS.BUTTON_CLICKED, { product_id: productId, try_on_type: type, experience }),

  experienceResolved: (experience, reason) =>
    emit(VTO_EVENTS.EXPERIENCE_RESOLVED, { experience, reason }),

  permissionAccepted: productId =>
    emit(VTO_EVENTS.PERMISSION_ACCEPTED, { product_id: productId }),

  permissionRejected: (productId, code) =>
    emit(VTO_EVENTS.PERMISSION_REJECTED, { product_id: productId, reason: code }),

  trackingStarted: (productId, tracker) =>
    emit(VTO_EVENTS.TRACKING_STARTED, { product_id: productId, tracker }),

  trackingFailed: (productId, tracker, reason) =>
    emit(VTO_EVENTS.TRACKING_FAILED, { product_id: productId, tracker, reason }),

  photoCaptured: productId =>
    emit(VTO_EVENTS.PHOTO_CAPTURED, { product_id: productId }),

  addedToCart: (productId, experience) =>
    emit(VTO_EVENTS.ADDED_TO_CART, { product_id: productId, experience }),

  productChanged: (fromId, toId) =>
    emit(VTO_EVENTS.PRODUCT_CHANGED, { from_product: fromId, to_product: toId }),

  unsupported: reason => emit(VTO_EVENTS.UNSUPPORTED, { reason }),

  sessionEnded: (productId, seconds, experience) =>
    emit(VTO_EVENTS.SESSION_ENDED, {
      product_id: productId,
      duration_seconds: Math.round(seconds),
      experience,
    }),
}

/** Small stopwatch for session duration. */
export function createSessionTimer() {
  const start = performance.now()
  return { elapsedSeconds: () => (performance.now() - start) / 1000 }
}
