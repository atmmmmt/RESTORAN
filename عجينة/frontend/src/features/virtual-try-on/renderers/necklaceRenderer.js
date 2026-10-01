/**
 * Necklace renderer — the most calibration-sensitive of the set.
 *
 * There is no landmark where a necklace actually sits: the chain rests below
 * the throat, between the chin and the shoulder line, and the exact drop
 * depends on chain length, which only the product data knows. So this
 * renderer leans harder on the saved offsets than the others, and it also
 * respects customer nudges because automatic placement will sometimes be
 * a centimetre off in a way only the wearer can judge.
 */

import { createBaseRenderer } from './baseRenderer'

/* Necklace width against shoulder span. A chain spans far less than the
   shoulders, so this is well under 1. */
const SHOULDER_TO_NECKLACE = 0.55

/* Confidence below this means the shoulders are half out of frame; better to
   hide than to draw a chain in the wrong place. */
const MIN_CONFIDENCE = 0.55

export function createNecklaceRenderer(deps) {
  const base = createBaseRenderer(deps)

  return {
    ...base,

    update(tracking) {
      if (!tracking || !tracking.detected || !tracking.position) {
        base.updateVisibility(false)
        return
      }

      // Pose confidence drops sharply when the customer turns or leans; a
      // necklace drawn from a bad shoulder read looks worse than none.
      if ((tracking.confidence ?? 1) < MIN_CONFIDENCE) {
        base.updateVisibility(false)
        return
      }

      const world = base.toWorld(tracking.position)
      base.applyPositionOffset(world)

      // Only roll — a necklace hangs under gravity and shouldn't pitch or
      // yaw with the head the way glasses do.
      base.applyRotation({ roll: -tracking.roll })

      base.applyScale(tracking.width, SHOULDER_TO_NECKLACE)
      base.updateVisibility(tracking.visible)
    },
  }
}
