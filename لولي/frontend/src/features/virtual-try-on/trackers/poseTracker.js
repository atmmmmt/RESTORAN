/**
 * Pose tracking for necklaces and clothing.
 *
 * Necklaces are the hardest case in the whole module: the anchor point sits
 * between the chin and the shoulder line, an area with no landmark of its
 * own, and shoulder detection degrades badly the moment the customer leans
 * or turns. Hence the heavier presence gate and the confidence value passed
 * through to the UI so the customer is told to adjust rather than shown a
 * necklace floating in the wrong place.
 */

import { createLandmarker, normalizeResult, closeLandmarker } from './createTracker'
import {
  computeNecklacePlacement, computeTorsoPlacement, assessQuality,
  distance2D, POSE,
} from '../utils/landmarkMath'
import { Vec3Filter, MovingAverage, PresenceGate, filterParamsFromSmoothing } from '../utils/smoothing'

export function createPoseTracker({ smoothing = 0.6, lowPerformance = false } = {}) {
  let landmarker = null
  let lastVideoTime = -1

  // Necklaces get more damping by default — shoulder landmarks are noisier
  // than finger joints and the pendant magnifies any wobble.
  const params = filterParamsFromSmoothing(Math.max(smoothing, 0.55))
  const posFilter = new Vec3Filter(params)
  const widthFilter = new MovingAverage(0.85)
  const rollFilter = new MovingAverage(Math.max(smoothing, 0.6))
  const gate = new PresenceGate({ showAfter: 3, hideAfter: 10 })

  return {
    kind: 'pose',

    async init() {
      landmarker = await createLandmarker('pose', { lowPerformance })
      return true
    },

    /**
     * @param {HTMLVideoElement} video
     * @param {{ mode:'necklace'|'clothing', faceLandmarks:Array|null }} opts
     */
    detect(video, { mode = 'necklace', faceLandmarks = null } = {}) {
      if (!landmarker || !video || video.readyState < 2) {
        return { detected: false, visible: gate.update(false), quality: 'none', hint: 'not-found' }
      }
      if (video.currentTime === lastVideoTime) return null
      lastVideoTime = video.currentTime

      const raw = landmarker.detectForVideo(video, performance.now())
      const { detected, subjects } = normalizeResult('pose', raw)

      if (!detected || !subjects[0]) {
        return { detected: false, visible: gate.update(false), quality: 'none', hint: 'not-found' }
      }

      const lm = subjects[0].landmarks
      const t = performance.now() / 1000

      const placement = mode === 'clothing'
        ? computeTorsoPlacement(lm)
        : computeNecklacePlacement(lm, faceLandmarks)

      // Shoulders out of frame or too low-confidence to trust.
      if (!placement) {
        return { detected: false, visible: gate.update(false), quality: 'none', hint: 'not-found' }
      }

      const shoulderSpan = distance2D(lm[POSE.LEFT_SHOULDER], lm[POSE.RIGHT_SHOULDER])
      const centreX = (lm[POSE.LEFT_SHOULDER].x + lm[POSE.RIGHT_SHOULDER].x) / 2
      const centred = 1 - Math.min(Math.abs(centreX - 0.5) * 2, 1)

      // A necklace needs the customer noticeably closer than a ring does,
      // so the "too far" threshold is raised for this tracker.
      const { quality, hint } = assessQuality({
        detected: true,
        size: shoulderSpan < 0.22 ? 0.05 : shoulderSpan,
        centred,
        confidence: placement.confidence ?? 1,
      })

      return {
        detected: true,
        visible: gate.update(true),
        position: posFilter.filter(placement.position, t),
        width: widthFilter.next(placement.width),
        height: placement.height,
        roll: rollFilter.next(placement.roll),
        confidence: placement.confidence ?? 1,
        quality, hint, landmarks: lm,
      }
    },

    reset() {
      posFilter.reset(); widthFilter.reset(); rollFilter.reset(); gate.reset()
      lastVideoTime = -1
    },

    dispose() {
      closeLandmarker(landmarker)
      landmarker = null
    },
  }
}
