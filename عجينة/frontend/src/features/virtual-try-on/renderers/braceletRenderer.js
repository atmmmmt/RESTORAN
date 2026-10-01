/**
 * Bracelet and watch renderer.
 *
 * Both sit on the wrist; the only real difference is how far back from the
 * joint they rest and how they're scaled, so one renderer covers both and
 * takes the mode as an argument.
 */

import { createBaseRenderer } from './baseRenderer'

/* Scaled from hand span across the knuckles. A watch face reads smaller
   than a bangle at the same wrist, hence the two ratios. */
const RATIOS = { bracelet: 1.5, watch: 1.15 }

export function createBraceletRenderer(deps, mode = 'bracelet') {
  const base = createBaseRenderer(deps)
  const ratio = RATIOS[mode] ?? RATIOS.bracelet

  return {
    ...base,

    update(tracking) {
      if (!tracking || !tracking.detected) {
        base.updateVisibility(false)
        return
      }

      const world = base.toWorld(tracking.position)
      base.applyPositionOffset(world)

      // The band's axis runs along the forearm — perpendicular to the roll
      // the tracker reports, hence the quarter turn.
      base.applyRotation({ roll: -tracking.roll + Math.PI / 2 })

      base.applyScale(tracking.width, ratio)
      base.updateVisibility(tracking.visible)
    },
  }
}
