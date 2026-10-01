/**
 * Face tracking for glasses and earrings.
 *
 * The Face Landmarker returns a 478-point mesh; we only need a handful of
 * reference points, and the heavy blendshape outputs are switched off in
 * createTracker for the frame budget.
 */

import { createLandmarker, normalizeResult, closeLandmarker } from './createTracker'
import {
  computeGlassesPlacement, computeEarringPlacement, assessQuality,
  distance2D, FACE,
} from '../utils/landmarkMath'
import { Vec3Filter, MovingAverage, PresenceGate, filterParamsFromSmoothing } from '../utils/smoothing'

export function createFaceTracker({ smoothing = 0.5, lowPerformance = false } = {}) {
  let landmarker = null
  let lastVideoTime = -1

  const params = filterParamsFromSmoothing(smoothing)
  const mainFilter = new Vec3Filter(params)
  const leftFilter = new Vec3Filter(params)
  const rightFilter = new Vec3Filter(params)
  const widthFilter = new MovingAverage(Math.min(smoothing + 0.2, 0.95))
  const rollFilter = new MovingAverage(smoothing)
  const yawFilter = new MovingAverage(smoothing)
  const pitchFilter = new MovingAverage(smoothing)
  const gate = new PresenceGate({ showAfter: 2, hideAfter: 8 })

  return {
    kind: 'face',

    async init() {
      landmarker = await createLandmarker('face', { lowPerformance })
      return true
    },

    /**
     * @param {HTMLVideoElement} video
     * @param {{ mode:'glasses'|'earrings', side:'left'|'right'|'both' }} opts
     */
    detect(video, { mode = 'glasses', side = 'both' } = {}) {
      if (!landmarker || !video || video.readyState < 2) {
        return { detected: false, visible: gate.update(false), quality: 'none', hint: 'not-found' }
      }
      if (video.currentTime === lastVideoTime) return null
      lastVideoTime = video.currentTime

      const raw = landmarker.detectForVideo(video, performance.now())
      const { detected, subjects } = normalizeResult('face', raw)

      if (!detected || !subjects[0]) {
        return { detected: false, visible: gate.update(false), quality: 'none', hint: 'not-found' }
      }

      const lm = subjects[0].landmarks
      const t = performance.now() / 1000

      // Face width across the ears drives both scale and the distance hint.
      const faceWidth = distance2D(lm[FACE.LEFT_EAR], lm[FACE.RIGHT_EAR])
      const centreX = (lm[FACE.LEFT_EAR].x + lm[FACE.RIGHT_EAR].x) / 2
      const centred = 1 - Math.min(Math.abs(centreX - 0.5) * 2, 1)
      const { quality, hint } = assessQuality({ detected: true, size: faceWidth, centred, confidence: 1 })

      if (mode === 'earrings') {
        const placement = computeEarringPlacement(lm, side)
        if (!placement) {
          return { detected: false, visible: gate.update(false), quality: 'none', hint: 'not-found' }
        }
        return {
          detected: true,
          visible: gate.update(true),
          left:  placement.left  ? leftFilter.filter(placement.left, t)  : null,
          right: placement.right ? rightFilter.filter(placement.right, t) : null,
          width: widthFilter.next(placement.width),
          roll: rollFilter.next(placement.roll),
          quality, hint, landmarks: lm,
        }
      }

      const placement = computeGlassesPlacement(lm)
      if (!placement) {
        return { detected: false, visible: gate.update(false), quality: 'none', hint: 'not-found' }
      }

      return {
        detected: true,
        visible: gate.update(true),
        position: mainFilter.filter(placement.position, t),
        width: widthFilter.next(placement.width),
        roll: rollFilter.next(placement.roll),
        yaw: yawFilter.next(placement.yaw),
        pitch: pitchFilter.next(placement.pitch),
        quality, hint, landmarks: lm,
      }
    },

    reset() {
      mainFilter.reset(); leftFilter.reset(); rightFilter.reset()
      widthFilter.reset(); rollFilter.reset(); yawFilter.reset(); pitchFilter.reset()
      gate.reset()
      lastVideoTime = -1
    },

    dispose() {
      closeLandmarker(landmarker)
      landmarker = null
    },
  }
}
