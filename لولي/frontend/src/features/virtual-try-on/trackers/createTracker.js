/**
 * MediaPipe Tasks Vision loader shared by all three trackers.
 *
 * The WASM runtime is several megabytes, so it is imported dynamically and
 * only once per session. A product that needs no body tracking (furniture,
 * food, anything space-placed) never reaches this file at all.
 */

/* Pinned so a CDN-side release can't silently change tracking behaviour
   between deploys. Bump deliberately after testing. */
const WASM_ROOT  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const MODEL_ROOT = 'https://storage.googleapis.com/mediapipe-models'

export const MODEL_URLS = {
  hand: `${MODEL_ROOT}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
  face: `${MODEL_ROOT}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
  pose: `${MODEL_ROOT}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
}

let visionPromise = null

/** Resolve the FilesetResolver once and share it. */
export function loadVision() {
  if (!visionPromise) {
    visionPromise = (async () => {
      const tasks = await import('@mediapipe/tasks-vision')
      const fileset = await tasks.FilesetResolver.forVisionTasks(WASM_ROOT)
      return { tasks, fileset }
    })()
  }
  return visionPromise
}

/**
 * Build a landmarker for the given kind.
 *
 * `lowPerformance` drops to CPU and a single tracked subject — GPU delegate
 * on a weak Android is often slower than CPU once the compositor is fighting
 * the camera feed for the same resources.
 */
export async function createLandmarker(kind, { lowPerformance = false } = {}) {
  const { tasks, fileset } = await loadVision()

  const baseOptions = {
    modelAssetPath: MODEL_URLS[kind],
    delegate: lowPerformance ? 'CPU' : 'GPU',
  }
  const common = { baseOptions, runningMode: 'VIDEO' }

  switch (kind) {
    case 'hand':
      return tasks.HandLandmarker.createFromOptions(fileset, {
        ...common,
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })

    case 'face':
      return tasks.FaceLandmarker.createFromOptions(fileset, {
        ...common,
        numFaces: 1,
        // Blendshapes and the transform matrix cost time we don't need —
        // placement is derived from raw landmarks.
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })

    case 'pose':
      return tasks.PoseLandmarker.createFromOptions(fileset, {
        ...common,
        numPoses: 1,
        outputSegmentationMasks: false,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })

    default:
      throw new Error(`نوع تتبّع غير معروف: ${kind}`)
  }
}

/**
 * Shape MediaPipe's per-kind result into one common structure so renderers
 * don't each need to know which task produced their landmarks.
 */
export function normalizeResult(kind, result) {
  if (!result) return { detected: false, subjects: [] }

  if (kind === 'hand') {
    const list = result.landmarks || []
    return {
      detected: list.length > 0,
      subjects: list.map((landmarks, i) => ({
        landmarks,
        worldLandmarks: result.worldLandmarks?.[i] || null,
        // MediaPipe labels handedness from the camera's point of view; the
        // front camera is mirrored, so this is flipped at the call site.
        handedness: result.handedness?.[i]?.[0]?.categoryName?.toLowerCase() || null,
        score: result.handedness?.[i]?.[0]?.score ?? 1,
      })),
    }
  }

  if (kind === 'face') {
    const list = result.faceLandmarks || []
    return {
      detected: list.length > 0,
      subjects: list.map(landmarks => ({ landmarks, score: 1 })),
    }
  }

  if (kind === 'pose') {
    const list = result.landmarks || []
    return {
      detected: list.length > 0,
      subjects: list.map((landmarks, i) => ({
        landmarks,
        worldLandmarks: result.worldLandmarks?.[i] || null,
        score: 1,
      })),
    }
  }

  return { detected: false, subjects: [] }
}

/** Release the WASM-side allocation; skipping this leaks across opens. */
export function closeLandmarker(landmarker) {
  try { landmarker?.close?.() } catch { /* already closed */ }
}
