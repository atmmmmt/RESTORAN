/**
 * Capability probing for WebAR Virtual Try-On.
 *
 * Everything here is cheap and synchronous where possible — it runs before
 * any heavy library is fetched, so the module can decide which experience to
 * offer (or skip entirely) without paying for a download first.
 */

let cached = null

/** WebGL is the hard floor: no context, no 3D of any kind. */
function detectWebGL() {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
    if (!gl) return { supported: false, version: 0 }
    const version = canvas.getContext('webgl2') ? 2 : 1
    // Free the context immediately; browsers cap how many can exist at once.
    const lose = gl.getExtension('WEBGL_lose_context')
    if (lose) lose.loseContext()
    return { supported: true, version }
  } catch {
    return { supported: false, version: 0 }
  }
}

const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent)
  // iPadOS 13+ reports as desktop Safari; touch points give it away.
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const isAndroid = () => /Android/i.test(navigator.userAgent)

const isSafari = () =>
  /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent)

/**
 * Rough performance tier. Device memory and core count are the only signals
 * browsers expose; both are absent on iOS, so Apple devices fall back to
 * "medium" rather than being wrongly demoted.
 */
function detectPerformanceTier() {
  const mem = navigator.deviceMemory        // GB, Chromium only
  const cores = navigator.hardwareConcurrency

  if (mem !== undefined) {
    if (mem <= 2) return 'low'
    if (mem <= 4) return 'medium'
    return 'high'
  }
  if (cores !== undefined) {
    if (cores <= 2) return 'low'
    if (cores <= 4) return 'medium'
    return 'high'
  }
  return 'medium'
}

/** Chrome on Android hands AR off to Scene Viewer via an intent URL. */
const supportsSceneViewer = () => isAndroid()

/** Safari on iOS renders USDZ through AR Quick Look using an <a rel="ar">. */
function supportsQuickLook() {
  if (!isIOS()) return false
  const a = document.createElement('a')
  return a.relList && a.relList.supports && a.relList.supports('ar')
}

/** True WebXR immersive-ar — checked lazily since it needs an await. */
export async function supportsWebXR() {
  try {
    if (!navigator.xr || !navigator.xr.isSessionSupported) return false
    return await navigator.xr.isSessionSupported('immersive-ar')
  } catch {
    return false
  }
}

/**
 * getUserMedia presence. Note this says nothing about permission — only that
 * the API exists and the page is in a secure context, which the browser
 * requires before it will even prompt.
 */
function detectCamera() {
  const secure = window.isSecureContext
    || location.protocol === 'https:'
    || location.hostname === 'localhost'
    || location.hostname === '127.0.0.1'
  const api = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
  return { available: api && secure, secureContext: secure, apiPresent: api }
}

/**
 * Full capability report. Cached — the answers can't change within a page
 * load, and this is called from render paths.
 */
export function getDeviceSupport() {
  if (cached) return cached

  const webgl = detectWebGL()
  const camera = detectCamera()
  const tier = detectPerformanceTier()

  cached = {
    webgl: webgl.supported,
    webglVersion: webgl.version,
    camera: camera.available,
    cameraSecureContext: camera.secureContext,
    cameraApiPresent: camera.apiPresent,
    ios: isIOS(),
    android: isAndroid(),
    safari: isSafari(),
    mobile: isIOS() || isAndroid() || /Mobi/i.test(navigator.userAgent),
    quickLook: supportsQuickLook(),
    sceneViewer: supportsSceneViewer(),
    performanceTier: tier,
    lowPerformance: tier === 'low',
    // Respect the OS-level motion preference in every animation we run.
    reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  }
  return cached
}

/**
 * Decide what the customer actually gets, honouring the spec's fallback
 * order: live try-on → environment AR → 3D viewer → images.
 *
 * @param {{ mode:string, model3DUrl:string, iosModelUrl:string, previewImageUrl:string }} config
 * @returns {{ experience:'live'|'space-ar'|'viewer-3d'|'image', reason:string }}
 */
export function resolveExperience(config) {
  const d = getDeviceSupport()

  if (!config || !config.model3DUrl) {
    return { experience: 'image', reason: 'no-model' }
  }
  if (!d.webgl) {
    return { experience: 'image', reason: 'no-webgl' }
  }

  if (config.mode === 'body') {
    // Live try-on needs a camera, a secure origin and enough headroom to run
    // tracking and rendering at the same time.
    if (d.camera && !d.lowPerformance) return { experience: 'live', reason: 'ok' }
    if (!d.camera) return { experience: 'viewer-3d', reason: 'no-camera' }
    return { experience: 'viewer-3d', reason: 'low-performance' }
  }

  if (config.mode === 'space') {
    if (d.quickLook && config.iosModelUrl) return { experience: 'space-ar', reason: 'quick-look' }
    if (d.sceneViewer) return { experience: 'space-ar', reason: 'scene-viewer' }
    return { experience: 'viewer-3d', reason: 'no-native-ar' }
  }

  return { experience: 'viewer-3d', reason: 'default' }
}

/** Exposed for tests and for the admin "why is this hidden?" hint. */
export const _internals = { detectWebGL, detectPerformanceTier, isIOS, isAndroid }
