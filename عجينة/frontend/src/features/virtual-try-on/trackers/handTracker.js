/**
 * Hand tracking for rings, bracelets and watches.
 *
 * Wraps the MediaPipe Hand Landmarker and turns its raw output into the
 * placement each renderer needs — already filtered, already gated on
 * presence, so the render loop just reads a transform.
 */

import { createLandmarker, normalizeResult, closeLandmarker } from './createTracker'
import { computeFingerPlacement, computeWristPlacement, assessQuality, distance2D, HAND } from '../utils/landmarkMath'
import { Vec3Filter, MovingAverage, PresenceGate, filterParamsFromSmoothing } from '../utils/smoothing'

export function createHandTracker({ smoothing = 0.5, lowPerformance = false } = {}) {
  let landmarker = null
  let lastVideoTime = -1

  const params = filterParamsFromSmoothing(smoothing)
  const posFilter = new Vec3Filter(params)
  const widthFilter = new MovingAverage(Math.min(smoothing + 0.2, 0.95))
  const rollFilter = new MovingAverage(smoothing)
  const gate = new PresenceGate({ showAfter: 2, hideAfter: 6 })

  return {
    kind: 'hand',

    async init() {
      landmarker = await createLandmarker('hand', { lowPerformance })
      return true
    },

    /**
     * @param {HTMLVideoElement} video
     * @param {Object} opts
     * @param {'ring'|'bracelet'|'watch'} opts.mode
     * @param {string} opts.finger        which finger a ring goes on
     * @param {'left'|'right'|'both'} opts.targetHand
     * @param {boolean} opts.mirrored     front camera preview is flipped
     */
    detect(video, { mode = 'ring', finger = 'ring', targetHand = 'both', mirrored = true } = {}) {
      if (!landmarker || !video || video.readyState < 2) {
        return { detected: false, visible: gate.update(false), quality: 'none', hint: 'not-found' }
      }

      // MediaPipe throws if the same frame timestamp is submitted twice.
      if (video.currentTime === lastVideoTime) return null
      lastVideoTime = video.currentTime

      const raw = landmarker.detectForVideo(video, performance.now())
      const { detected, subjects } = normalizeResult('hand', raw)

      let chosen = subjects[0] || null
      if (detected && targetHand !== 'both') {
        // The mirrored preview inverts what MediaPipe calls left/right, so
        // undo that before matching the admin's choice.
        const match = subjects.find(s => {
          const side = mirrored
            ? (s.handedness === 'left' ? 'right' : 'left')
            : s.handedness
          return side === targetHand
        })
        chosen = match || null
      }

      if (!chosen) {
        return { detected: false, visible: gate.update(false), quality: 'none', hint: 'not-found' }
      }

      const lm = chosen.landmarks
      const placement = mode === 'ring'
        ? computeFingerPlacement(lm, finger)
        : computeWristPlacement(lm)

      if (!placement) {
        return { detected: false, visible: gate.update(false), quality: 'none', hint: 'not-found' }
      }

      const t = performance.now() / 1000
      const position = posFilter.filter(placement.position, t)
      const width = widthFilter.next(placement.width)
      const roll = rollFilter.next(placement.roll)

      // Hand span versus frame width tells us how close the customer is.
      const span = distance2D(lm[HAND.WRIST], lm[HAND.MIDDLE_TIP])
      const centre = 1 - Math.min(Math.abs(position.x - 0.5) * 2, 1)
      const { quality, hint } = assessQuality({
        detected: true, size: span, centred: centre, confidence: chosen.score,
      })

      return {
        detected: true,
        visible: gate.update(true),
        position,
        width,
        roll,
        direction: placement.direction,
        handedness: chosen.handedness,
        quality,
        hint,
        landmarks: lm,
      }
    },

    /** Called when the customer switches finger/hand — drop stale history. */
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
