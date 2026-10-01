/**
 * Earrings renderer.
 *
 * Unlike the other renderers this one drives up to two objects, since a pair
 * hangs independently on each lobe. The base model is cloned once at
 * construction so left and right can be positioned separately.
 */

import { createBaseRenderer } from './baseRenderer'

/* Earrings are small relative to the face — this ratio is against the full
   ear-to-ear width, so it is deliberately low. */
const FACE_WIDTH_TO_EARRING = 0.35

export function createEarringsRenderer(deps) {
  const { THREE, object, calibration, viewport } = deps

  // One wrapper holding a left and right copy keeps the base renderer's
  // fade/offset logic working unchanged on the pair as a unit.
  const group = new THREE.Group()
  const left = object
  const right = object.clone(true)
  group.add(left)
  group.add(right)

  const base = createBaseRenderer({ THREE, object: group, calibration, viewport })

  return {
    ...base,
    object: group,

    update(tracking) {
      if (!tracking || !tracking.detected) {
        base.updateVisibility(false)
        return
      }

      // The wrapper stays at the origin; each side is placed in local space
      // so one offset value still applies to both.
      base.applyPositionOffset({ x: 0, y: 0, z: 0 })
      base.applyRotation({ roll: -tracking.roll })

      const scale = base.applyScale(tracking.width, FACE_WIDTH_TO_EARRING)

      // The parent's scale is already applied, so divide it out to keep the
      // per-side placement in world units.
      const place = (node, point) => {
        if (!point) { node.visible = false; return }
        node.visible = true
        const w = base.toWorld(point)
        const o = calibration.positionOffset || { x: 0, y: 0, z: 0 }
        node.position.set((w.x + o.x) / scale, (w.y + o.y) / scale, (w.z + o.z) / scale)
      }

      place(left, tracking.left)
      place(right, tracking.right)

      base.updateVisibility(tracking.visible)
    },
  }
}
