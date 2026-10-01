/**
 * Shared plumbing for every try-on renderer.
 *
 * A renderer's job is narrow: take one tracker result plus the product's
 * saved calibration, and write a position/rotation/scale onto a Three.js
 * object. Camera setup, model loading and the animation loop all live
 * elsewhere, so renderers stay small enough to reason about individually.
 */

import { degToRad, landmarkToWorld } from '../utils/landmarkMath'
import { FadeValue } from '../utils/smoothing'

/**
 * @param {Object} deps
 * @param {Object} deps.THREE
 * @param {Object} deps.object      the normalized model wrapper
 * @param {Object} deps.calibration the product's virtualTryOn config
 * @param {Object} deps.viewport    { aspect, depth, mirrored }
 */
export function createBaseRenderer({ THREE, object, calibration, viewport }) {
  const fade = new FadeValue(0.18)

  // Manual nudges the customer makes on top of the admin's calibration.
  const manual = { x: 0, y: 0, z: 0, scale: 1, rotation: 0 }

  /* Materials start opaque; fading requires transparency, so flip it once
     up front rather than every frame. */
  object.traverse(node => {
    if (!node.isMesh) return
    const list = Array.isArray(node.material) ? node.material : [node.material]
    for (const m of list) {
      if (!m) continue
      m.transparent = true
      m.depthWrite = true
    }
  })

  function setOpacity(value) {
    object.traverse(node => {
      if (!node.isMesh) return
      const list = Array.isArray(node.material) ? node.material : [node.material]
      for (const m of list) if (m) m.opacity = value
    })
  }

  return {
    object,
    manual,

    /** Convert a normalised landmark into the scene's world space. */
    toWorld(point) {
      return landmarkToWorld(point, viewport)
    },

    /** Apply the admin's saved position offset, in world units. */
    applyPositionOffset(vec) {
      const o = calibration.positionOffset || { x: 0, y: 0, z: 0 }
      object.position.set(
        vec.x + o.x + manual.x,
        vec.y + o.y + manual.y,
        vec.z + o.z + manual.z
      )
    },

    /** Roll/yaw/pitch in radians, plus the admin's rotation offset in degrees. */
    applyRotation({ roll = 0, yaw = 0, pitch = 0 } = {}) {
      const r = calibration.rotationOffset || { x: 0, y: 0, z: 0 }
      object.rotation.set(
        pitch + degToRad(r.x),
        yaw + degToRad(r.y),
        roll + degToRad(r.z) + manual.rotation
      )
    },

    /**
     * Scale from a measured landmark distance, clamped to the product's
     * allowed range so a bad frame can't briefly balloon the model.
     */
    applyScale(measured, referenceRatio = 1) {
      const base = (measured || 0) * referenceRatio * (calibration.scale ?? 1) * manual.scale
      const min = calibration.minimumScale ?? 0.1
      const max = calibration.maximumScale ?? 5
      const clamped = Math.min(Math.max(base, min), max)
      object.scale.setScalar(clamped)
      return clamped
    },

    /** Ease in/out with tracking presence instead of popping. */
    updateVisibility(visible) {
      const opacity = fade.update(visible ? 1 : 0)
      setOpacity(opacity)
      // Below a threshold the object is invisible anyway — skip drawing it.
      object.visible = opacity > 0.02
      return opacity
    },

    /** Customer-side nudge, used when allowManualAdjustment is on. */
    adjust(delta) {
      manual.x += delta.x ?? 0
      manual.y += delta.y ?? 0
      manual.z += delta.z ?? 0
      manual.scale = Math.min(Math.max(manual.scale * (delta.scaleFactor ?? 1), 0.4), 2.5)
      manual.rotation += delta.rotation ?? 0
    },

    resetManual() {
      manual.x = 0; manual.y = 0; manual.z = 0
      manual.scale = 1; manual.rotation = 0
    },

    hide() {
      fade.reset(0)
      setOpacity(0)
      object.visible = false
    },
  }
}
