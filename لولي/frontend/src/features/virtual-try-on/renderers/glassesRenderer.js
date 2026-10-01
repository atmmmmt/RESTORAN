/**
 * Glasses renderer.
 *
 * Anchored on the nose bridge and scaled from the eye span, then rotated on
 * all three axes so the frame stays believable as the head turns — glasses
 * are the one accessory where a wrong yaw is immediately obvious.
 */

import { createBaseRenderer } from './baseRenderer'

/* Frame width relative to outer-eye-corner distance. Real frames overhang
   the eyes noticeably, so this is well above 1. */
const EYE_SPAN_TO_FRAME = 2.1

export function createGlassesRenderer(deps) {
  const base = createBaseRenderer(deps)

  return {
    ...base,

    update(tracking) {
      if (!tracking || !tracking.detected || !tracking.position) {
        base.updateVisibility(false)
        return
      }

      const world = base.toWorld(tracking.position)
      base.applyPositionOffset(world)

      base.applyRotation({
        roll: -tracking.roll,
        yaw: tracking.yaw ?? 0,
        pitch: tracking.pitch ?? 0,
      })

      base.applyScale(tracking.width, EYE_SPAN_TO_FRAME)
      base.updateVisibility(tracking.visible)
    },
  }
}
