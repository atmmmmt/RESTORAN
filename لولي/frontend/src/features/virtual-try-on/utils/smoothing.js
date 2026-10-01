/**
 * Landmark smoothing for WebAR Virtual Try-On.
 *
 * MediaPipe output jitters by a few pixels every frame even when the subject
 * is perfectly still. Rendered raw, a ring visibly buzzes on the finger. The
 * filters here trade a little latency for a steady image.
 *
 * The default is the One Euro filter: it smooths hard while the subject is
 * still and loosens as movement speeds up, so we avoid the usual trade-off
 * where killing jitter also adds a rubber-band lag to fast motion.
 */

/** Linear interpolation — the primitive everything else builds on. */
export const lerp = (a, b, t) => a + (b - a) * t

export const lerpVec3 = (a, b, t) => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  z: lerp(a.z ?? 0, b.z ?? 0, t),
})

/**
 * Exponential moving average. Cheap, predictable, and enough for values that
 * don't need to feel instant (scale, opacity).
 *
 * `factor` is the schema's trackingSmoothing: 0 = raw, 0.99 = very heavy.
 */
export class MovingAverage {
  constructor(factor = 0.5) {
    this.factor = Math.min(Math.max(factor, 0), 0.99)
    this.value = null
  }

  next(sample) {
    if (sample == null || Number.isNaN(sample)) return this.value
    if (this.value === null) { this.value = sample; return sample }
    this.value = lerp(sample, this.value, this.factor)
    return this.value
  }

  reset() { this.value = null }
}

/**
 * One Euro filter — Casiez, Roussel & Vogel (2012).
 *
 * Adaptive cutoff: slow movement gets a low cutoff (heavy smoothing), fast
 * movement raises the cutoff so the value keeps up with the hand.
 */
export class OneEuroFilter {
  /**
   * @param {number} minCutoff lower = steadier when still
   * @param {number} beta      higher = more responsive when moving fast
   * @param {number} dCutoff   cutoff for the derivative estimate
   */
  constructor({ minCutoff = 1.0, beta = 0.02, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.dCutoff = dCutoff
    this.reset()
  }

  reset() {
    this.xPrev = null
    this.dxPrev = 0
    this.tPrev = null
  }

  static alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff)
    return 1 / (1 + tau / dt)
  }

  /**
   * @param {number} x  raw sample
   * @param {number} t  timestamp in seconds
   */
  filter(x, t) {
    if (x == null || Number.isNaN(x)) return this.xPrev

    if (this.tPrev === null) {
      this.tPrev = t
      this.xPrev = x
      return x
    }

    // Guard against a zero or negative dt from a stalled/backwards clock.
    const dt = Math.max(t - this.tPrev, 1e-3)
    this.tPrev = t

    // Derivative, itself low-pass filtered before it steers the cutoff.
    const dx = (x - this.xPrev) / dt
    const aD = OneEuroFilter.alpha(this.dCutoff, dt)
    const dxHat = lerp(this.dxPrev, dx, aD)
    this.dxPrev = dxHat

    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat)
    const a = OneEuroFilter.alpha(cutoff, dt)
    const xHat = lerp(this.xPrev, x, a)
    this.xPrev = xHat
    return xHat
  }
}

/** Three One Euro filters ganged together for a 3D point. */
export class Vec3Filter {
  constructor(opts) {
    this.x = new OneEuroFilter(opts)
    this.y = new OneEuroFilter(opts)
    this.z = new OneEuroFilter(opts)
  }

  filter(v, t) {
    return {
      x: this.x.filter(v.x, t),
      y: this.y.filter(v.y, t),
      z: this.z.filter(v.z ?? 0, t),
    }
  }

  reset() { this.x.reset(); this.y.reset(); this.z.reset() }
}

/**
 * Translate the admin's 0..1 smoothing dial into filter parameters.
 * At 0 the filter is nearly transparent; at 0.99 it is heavily damped.
 */
export function filterParamsFromSmoothing(smoothing = 0.5) {
  const s = Math.min(Math.max(smoothing, 0), 0.99)
  return {
    minCutoff: lerp(4.0, 0.15, s),   // steadier as the dial rises
    beta: lerp(0.5, 0.005, s),       // less speed compensation when heavy
    dCutoff: 1.0,
  }
}

/**
 * Hysteresis around tracking presence.
 *
 * Detection flickers off for a frame or two constantly. Hiding the product on
 * the first miss makes it strobe, so we require several consecutive misses
 * before hiding and a couple of hits before showing again.
 */
export class PresenceGate {
  constructor({ showAfter = 2, hideAfter = 6 } = {}) {
    this.showAfter = showAfter
    this.hideAfter = hideAfter
    this.hits = 0
    this.misses = 0
    this.visible = false
  }

  update(detected) {
    if (detected) {
      this.hits++
      this.misses = 0
      if (!this.visible && this.hits >= this.showAfter) this.visible = true
    } else {
      this.misses++
      this.hits = 0
      if (this.visible && this.misses >= this.hideAfter) this.visible = false
    }
    return this.visible
  }

  reset() { this.hits = 0; this.misses = 0; this.visible = false }
}

/** Ease opacity toward the target so appear/disappear is a fade, not a pop. */
export class FadeValue {
  constructor(speed = 0.15) { this.speed = speed; this.value = 0 }
  update(target) { this.value = lerp(this.value, target, this.speed); return this.value }
  reset(v = 0) { this.value = v }
}
