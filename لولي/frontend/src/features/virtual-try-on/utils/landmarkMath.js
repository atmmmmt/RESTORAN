/**
 * Geometry helpers for turning MediaPipe landmarks into 3D transforms.
 *
 * MediaPipe returns normalised coordinates: x and y in [0,1] across the
 * frame, z roughly in the same unit as x with the origin near the subject.
 * Everything here converts those into the metres-ish space Three.js uses and
 * derives the position, scale and orientation each renderer needs.
 */

/* ── MediaPipe landmark indices ─────────────────────────────
   Named so the renderers read as anatomy rather than magic numbers. */

export const HAND = {
  WRIST: 0,
  THUMB_CMC: 1, THUMB_MCP: 2, THUMB_IP: 3, THUMB_TIP: 4,
  INDEX_MCP: 5, INDEX_PIP: 6, INDEX_DIP: 7, INDEX_TIP: 8,
  MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_DIP: 11, MIDDLE_TIP: 12,
  RING_MCP: 13, RING_PIP: 14, RING_DIP: 15, RING_TIP: 16,
  PINKY_MCP: 17, PINKY_PIP: 18, PINKY_DIP: 19, PINKY_TIP: 20,
}

/** Base/middle joint pairs per finger — a ring sits between them. */
export const FINGER_JOINTS = {
  thumb:  { mcp: HAND.THUMB_CMC,  pip: HAND.THUMB_MCP,  tip: HAND.THUMB_TIP },
  index:  { mcp: HAND.INDEX_MCP,  pip: HAND.INDEX_PIP,  tip: HAND.INDEX_TIP },
  middle: { mcp: HAND.MIDDLE_MCP, pip: HAND.MIDDLE_PIP, tip: HAND.MIDDLE_TIP },
  ring:   { mcp: HAND.RING_MCP,   pip: HAND.RING_PIP,   tip: HAND.RING_TIP },
  pinky:  { mcp: HAND.PINKY_MCP,  pip: HAND.PINKY_PIP,  tip: HAND.PINKY_TIP },
}

/* Face Landmarker (478-point mesh) reference points. */
export const FACE = {
  NOSE_TIP: 1,
  NOSE_BRIDGE: 168,
  LEFT_EYE_OUTER: 33,
  LEFT_EYE_INNER: 133,
  RIGHT_EYE_OUTER: 263,
  RIGHT_EYE_INNER: 362,
  LEFT_EAR: 234,
  RIGHT_EAR: 454,
  LEFT_EARLOBE: 132,
  RIGHT_EARLOBE: 361,
  CHIN: 152,
  FOREHEAD: 10,
}

/* Pose Landmarker (33-point) reference points. */
export const POSE = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  MOUTH_LEFT: 9,
  MOUTH_RIGHT: 10,
}

/* ── Vector helpers ─────────────────────────────────────── */

export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) })
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: (a.z ?? 0) + (b.z ?? 0) })
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s, z: (a.z ?? 0) * s })

export const midpoint = (a, b) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
  z: ((a.z ?? 0) + (b.z ?? 0)) / 2,
})

export const length = v => Math.hypot(v.x, v.y, v.z ?? 0)

/** 2D distance — the reliable one, since MediaPipe z is only relative. */
export const distance2D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

export const distance3D = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0))

export function normalize(v) {
  const l = length(v)
  return l < 1e-6 ? { x: 0, y: 0, z: 0 } : { x: v.x / l, y: v.y / l, z: (v.z ?? 0) / l }
}

export const cross = (a, b) => ({
  x: a.y * (b.z ?? 0) - (a.z ?? 0) * b.y,
  y: (a.z ?? 0) * b.x - a.x * (b.z ?? 0),
  z: a.x * b.y - a.y * b.x,
})

export const dot = (a, b) => a.x * b.x + a.y * b.y + (a.z ?? 0) * (b.z ?? 0)

/**
 * Normalised landmark → Three.js world coordinates.
 *
 * MediaPipe's origin is the frame's top-left with y growing downward; Three
 * puts the origin at the centre with y growing upward, hence the flip.
 * `mirrored` undoes the horizontal flip we apply to the front camera preview
 * so the overlay lands on the same side the customer sees.
 */
export function landmarkToWorld(lm, { aspect = 1, depth = 1, mirrored = false } = {}) {
  const x = (mirrored ? (1 - lm.x) : lm.x) - 0.5
  const y = 0.5 - lm.y
  return {
    x: x * 2 * aspect * depth,
    y: y * 2 * depth,
    z: -(lm.z ?? 0) * depth,
  }
}

/** Signed angle of b→a in the image plane, radians. */
export const angleBetween2D = (a, b) => Math.atan2(a.y - b.y, a.x - b.x)

export const degToRad = d => (d * Math.PI) / 180
export const radToDeg = r => (r * 180) / Math.PI

export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi)

/* ── Derived measurements ───────────────────────────────── */

/**
 * Ring placement: sit between the knuckle (MCP) and the first joint (PIP) of
 * the chosen finger, oriented along the bone.
 *
 * Width is estimated from the neighbouring knuckle spacing rather than the
 * finger itself — MediaPipe gives joint centres, not silhouette edges, so
 * knuckle pitch is the closest usable proxy for how wide the finger is.
 */
export function computeFingerPlacement(landmarks, finger = 'ring') {
  const joints = FINGER_JOINTS[finger] || FINGER_JOINTS.ring
  const mcp = landmarks[joints.mcp]
  const pip = landmarks[joints.pip]
  if (!mcp || !pip) return null

  // Slightly above the knuckle is where a ring actually rests.
  const position = {
    x: mcp.x + (pip.x - mcp.x) * 0.35,
    y: mcp.y + (pip.y - mcp.y) * 0.35,
    z: (mcp.z ?? 0) + ((pip.z ?? 0) - (mcp.z ?? 0)) * 0.35,
  }

  const direction = normalize(sub(pip, mcp))
  const roll = angleBetween2D(pip, mcp)

  const neighbours = {
    thumb: [HAND.THUMB_CMC, HAND.INDEX_MCP],
    index: [HAND.INDEX_MCP, HAND.MIDDLE_MCP],
    middle: [HAND.INDEX_MCP, HAND.RING_MCP],
    ring: [HAND.MIDDLE_MCP, HAND.PINKY_MCP],
    pinky: [HAND.RING_MCP, HAND.PINKY_MCP],
  }[finger] || [HAND.MIDDLE_MCP, HAND.PINKY_MCP]

  const spread = distance2D(landmarks[neighbours[0]], landmarks[neighbours[1]])
  // Two knuckle gaps ≈ finger width for the middle fingers; halve it.
  const width = finger === 'middle' || finger === 'ring' ? spread / 2 : spread

  return { position, direction, roll, width, segmentLength: distance2D(mcp, pip) }
}

/**
 * Wrist placement for bracelets and watches.
 *
 * The wrist landmark is the joint centre; the band sits just below it, back
 * along the forearm. Width comes from the span across the knuckles, which
 * tracks hand size and therefore wrist size closely enough.
 */
export function computeWristPlacement(landmarks) {
  const wrist = landmarks[HAND.WRIST]
  const indexMcp = landmarks[HAND.INDEX_MCP]
  const pinkyMcp = landmarks[HAND.PINKY_MCP]
  if (!wrist || !indexMcp || !pinkyMcp) return null

  const palmCentre = midpoint(indexMcp, pinkyMcp)
  const forearm = normalize(sub(wrist, palmCentre))

  // Step back from the joint so the band isn't sunk into the hand.
  const offset = distance2D(wrist, palmCentre) * 0.25
  const position = {
    x: wrist.x + forearm.x * offset,
    y: wrist.y + forearm.y * offset,
    z: (wrist.z ?? 0) + forearm.z * offset,
  }

  const across = distance2D(indexMcp, pinkyMcp)
  return {
    position,
    direction: forearm,
    roll: angleBetween2D(palmCentre, wrist),
    width: across * 1.05,
    handSpan: across,
  }
}

/**
 * Glasses placement from eye and nose landmarks.
 * Yaw is inferred from how far the nose sits off the eye midpoint, which is
 * a stable cue without needing a full head-pose solve.
 */
export function computeGlassesPlacement(landmarks) {
  const le = landmarks[FACE.LEFT_EYE_OUTER]
  const re = landmarks[FACE.RIGHT_EYE_OUTER]
  const bridge = landmarks[FACE.NOSE_BRIDGE] || landmarks[FACE.NOSE_TIP]
  if (!le || !re || !bridge) return null

  const eyeMid = midpoint(le, re)
  const eyeSpan = distance2D(le, re)

  const roll = angleBetween2D(re, le)
  const yaw = clamp((bridge.x - eyeMid.x) / Math.max(eyeSpan, 1e-4), -1, 1) * (Math.PI / 4)

  const chin = landmarks[FACE.CHIN]
  const brow = landmarks[FACE.FOREHEAD]
  const pitch = chin && brow
    ? clamp((bridge.y - midpoint(chin, brow).y) / Math.max(distance2D(chin, brow), 1e-4), -1, 1) * (Math.PI / 6)
    : 0

  return {
    position: { x: bridge.x, y: bridge.y, z: bridge.z ?? 0 },
    width: eyeSpan,
    roll, yaw, pitch,
  }
}

/**
 * Earring anchor points. The mesh has no lobe vertex, so we take the ear
 * landmark and drop a fraction of face height to reach where a lobe hangs.
 */
export function computeEarringPlacement(landmarks, side = 'both') {
  const leftEar = landmarks[FACE.LEFT_EAR]
  const rightEar = landmarks[FACE.RIGHT_EAR]
  const chin = landmarks[FACE.CHIN]
  const brow = landmarks[FACE.FOREHEAD]
  if (!leftEar || !rightEar) return null

  const faceHeight = chin && brow ? distance2D(chin, brow) : distance2D(leftEar, rightEar)
  const drop = faceHeight * 0.06
  const faceWidth = distance2D(leftEar, rightEar)
  const roll = angleBetween2D(rightEar, leftEar)

  const at = ear => ({ x: ear.x, y: ear.y + drop, z: ear.z ?? 0 })

  return {
    left:  side === 'right' ? null : at(leftEar),
    right: side === 'left' ? null : at(rightEar),
    width: faceWidth,
    roll,
  }
}

/**
 * Necklace placement — the fiddliest of the set, which is why the schema
 * exposes per-product offsets for it.
 *
 * Shoulders give a stable width and a reliable horizontal centre; the chin
 * gives the top of the neck. The chain sits between the two, biased toward
 * the shoulder line so the pendant lands on the chest rather than the throat.
 */
export function computeNecklacePlacement(poseLandmarks, faceLandmarks = null) {
  const ls = poseLandmarks?.[POSE.LEFT_SHOULDER]
  const rs = poseLandmarks?.[POSE.RIGHT_SHOULDER]
  if (!ls || !rs) return null

  // Low visibility means the torso is out of frame or occluded.
  const visible = Math.min(ls.visibility ?? 1, rs.visibility ?? 1)
  if (visible < 0.5) return null

  const shoulderMid = midpoint(ls, rs)
  const shoulderWidth = distance2D(ls, rs)

  const chin = faceLandmarks?.[FACE.CHIN] || poseLandmarks[POSE.NOSE]
  const neckTop = chin
    ? { x: (chin.x + shoulderMid.x) / 2, y: chin.y + (shoulderMid.y - chin.y) * 0.55, z: chin.z ?? 0 }
    : { ...shoulderMid, y: shoulderMid.y - shoulderWidth * 0.15 }

  const position = {
    x: shoulderMid.x + (neckTop.x - shoulderMid.x) * 0.3,
    y: shoulderMid.y + (neckTop.y - shoulderMid.y) * 0.3,
    z: (shoulderMid.z ?? 0),
  }

  return {
    position,
    width: shoulderWidth,
    roll: angleBetween2D(ls, rs),
    shoulderMid,
    neckTop,
    confidence: visible,
  }
}

/** Torso box for clothing — centre, width and height from shoulders and hips. */
export function computeTorsoPlacement(poseLandmarks) {
  const ls = poseLandmarks?.[POSE.LEFT_SHOULDER]
  const rs = poseLandmarks?.[POSE.RIGHT_SHOULDER]
  const lh = poseLandmarks?.[POSE.LEFT_HIP]
  const rh = poseLandmarks?.[POSE.RIGHT_HIP]
  if (!ls || !rs) return null

  const shoulderMid = midpoint(ls, rs)
  const hipMid = lh && rh ? midpoint(lh, rh) : null
  const width = distance2D(ls, rs)
  const height = hipMid ? distance2D(shoulderMid, hipMid) : width * 1.5

  return {
    position: hipMid ? midpoint(shoulderMid, hipMid) : shoulderMid,
    width,
    height,
    roll: angleBetween2D(ls, rs),
    confidence: Math.min(ls.visibility ?? 1, rs.visibility ?? 1),
  }
}

/**
 * Tracking quality from how well the subject fills the frame.
 * Feeds the on-screen signal bar and the "move closer" hint.
 */
export function assessQuality({ detected, size = 0, centred = 1, confidence = 1 }) {
  if (!detected) return { quality: 'none', hint: 'not-found' }
  if (size < 0.10) return { quality: 'poor', hint: 'too-far' }
  if (size > 0.75) return { quality: 'poor', hint: 'too-close' }
  if (centred < 0.4) return { quality: 'poor', hint: 'off-centre' }
  if (confidence < 0.6 || size < 0.16) return { quality: 'good', hint: 'ok' }
  return { quality: 'strong', hint: 'locked' }
}
