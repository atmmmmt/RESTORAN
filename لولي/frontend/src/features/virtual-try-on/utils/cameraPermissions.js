/**
 * Camera permission handling for WebAR Virtual Try-On.
 *
 * The module never opens a camera on page load. `requestCamera` is called
 * only from a direct user gesture, after the privacy screen has explained
 * why access is needed — that is both the spec's requirement and what
 * browsers expect before they'll show a prompt at all.
 */

export const PERMISSION_STATE = {
  UNKNOWN: 'unknown',
  PROMPT: 'prompt',
  GRANTED: 'granted',
  DENIED: 'denied',
  UNSUPPORTED: 'unsupported',
  INSECURE: 'insecure',
}

/**
 * Read the current permission without triggering a prompt.
 * The Permissions API isn't available everywhere (notably older Safari),
 * so an unknown answer is normal and simply means "we'll find out on ask".
 */
export async function queryCameraPermission() {
  if (!navigator.mediaDevices?.getUserMedia) return PERMISSION_STATE.UNSUPPORTED

  const secure = window.isSecureContext
    || location.protocol === 'https:'
    || ['localhost', '127.0.0.1'].includes(location.hostname)
  if (!secure) return PERMISSION_STATE.INSECURE

  try {
    if (!navigator.permissions?.query) return PERMISSION_STATE.UNKNOWN
    const status = await navigator.permissions.query({ name: 'camera' })
    return status.state === 'granted' ? PERMISSION_STATE.GRANTED
      : status.state === 'denied' ? PERMISSION_STATE.DENIED
        : PERMISSION_STATE.PROMPT
  } catch {
    // Firefox throws for an unsupported permission name — not an error here.
    return PERMISSION_STATE.UNKNOWN
  }
}

/** Map a getUserMedia rejection onto something we can show a human. */
export function classifyCameraError(err) {
  const name = err?.name || ''
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return { code: 'denied', recoverable: true }
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return { code: 'no-camera', recoverable: false }
    case 'NotReadableError':
    case 'TrackStartError':
      // Another app or tab already owns the device.
      return { code: 'in-use', recoverable: true }
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return { code: 'constraints', recoverable: true }
    case 'SecurityError':
      return { code: 'insecure', recoverable: false }
    case 'AbortError':
      return { code: 'aborted', recoverable: true }
    default:
      return { code: 'unknown', recoverable: true }
  }
}

/**
 * Open a camera stream.
 *
 * @param {Object}  opts
 * @param {'user'|'environment'} opts.facingMode
 * @param {boolean} opts.lowPerformance  drop to 480p on weak devices
 * @returns {Promise<{ ok:boolean, stream?:MediaStream, code?:string, error?:Error }>}
 */
export async function requestCamera({ facingMode = 'user', lowPerformance = false } = {}) {
  if (!navigator.mediaDevices?.getUserMedia) {
    return { ok: false, code: 'unsupported' }
  }

  // `ideal` rather than `exact` so a device with one camera still works
  // instead of hard-failing with OverconstrainedError.
  const constraints = {
    audio: false,
    video: {
      facingMode: { ideal: facingMode },
      width:  { ideal: lowPerformance ? 640 : 1280 },
      height: { ideal: lowPerformance ? 480 : 720 },
      frameRate: { ideal: lowPerformance ? 24 : 30 },
    },
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    return { ok: true, stream }
  } catch (err) {
    const { code } = classifyCameraError(err)

    // A device that can't meet the resolution hints still deserves a try.
    if (code === 'constraints') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
        return { ok: true, stream, degraded: true }
      } catch (retryErr) {
        return { ok: false, code: classifyCameraError(retryErr).code, error: retryErr }
      }
    }

    return { ok: false, code, error: err }
  }
}

/**
 * Release every track. Called on close, on unmount and on camera switch —
 * leaving a track live keeps the recording indicator on, which customers
 * rightly read as the site still watching them.
 */
export function stopStream(stream) {
  if (!stream) return
  for (const track of stream.getTracks()) {
    try { track.stop() } catch { /* already ended */ }
  }
}

/** Are there several cameras to switch between? */
export async function hasMultipleCameras() {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return false
    const devices = await navigator.mediaDevices.enumerateDevices()
    return devices.filter(d => d.kind === 'videoinput').length > 1
  } catch {
    return false
  }
}
