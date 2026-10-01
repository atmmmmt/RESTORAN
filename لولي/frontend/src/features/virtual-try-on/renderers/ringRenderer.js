/**
 * Ring renderer.
 *
 * The ring is threaded onto the finger between the knuckle and the first
 * joint, rotated to follow the bone, and scaled from the estimated finger
 * width so it looks the same size on a small hand and a large one.
 */

import { createBaseRenderer } from './baseRenderer'

/* A normalised model is 1 unit across; a ring should span roughly the
   finger's width plus a little for the band. Tuned against real hands. */
const FINGER_TO_MODEL = 2.6

export function createRingRenderer(deps) {
  const base = createBaseRenderer(deps)

  return {
    ...base,

    /**
     * @param {Object} tracking result from handTracker.detect()
     */
    update(tracking) {
      if (!tracking || !tracking.detected) {
        base.updateVisibility(false)
        return
      }

      const world = base.toWorld(tracking.position)
      base.applyPositionOffset(world)

      // Roll follows the finger; the model's own axis alignment is corrected
      // by the admin's rotation offset once per product.
      base.applyRotation({ roll: -tracking.roll })

      base.applyScale(tracking.width, FINGER_TO_MODEL)
      base.updateVisibility(tracking.visible)
    },
  }
}
