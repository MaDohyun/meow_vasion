/**
 * Where the desktop reticle sits and how the mobile direction stick maps to
 * the craft's gaze. Both paths stay pure so input tests do not need a canvas or
 * a React event.
 */

/** Normalised viewport point: -1 at the left/top edge, +1 at the right/bottom. */
export type AimPoint = { x: number; y: number }

/** A point or displacement in CSS pixels, as a pointer event reports it. */
export type ScreenPoint = { x: number; y: number }

/** The rectangle an absolute pointer is measured against, in CSS pixels. */
export type AimBounds = { left: number; top: number; width: number; height: number }

const clampAxis = (value: number) => (value < -1 ? -1 : value > 1 ? 1 : value)

/** Guards against a zero-sized canvas during the first layout pass. */
const halfExtent = (size: number) => Math.max(1, size) / 2

/** The mouse mapping: the reticle is wherever the cursor is. */
export function absoluteAim(point: ScreenPoint, bounds: AimBounds): AimPoint {
  return {
    x: clampAxis((point.x - bounds.left) / halfExtent(bounds.width) - 1),
    y: clampAxis((point.y - bounds.top) / halfExtent(bounds.height) - 1),
  }
}

/** The thumb travel available inside the 112px mobile stick. */
export const DIRECTION_STICK_RADIUS = 44

export type DirectionStick = {
  x: number
  y: number
  steer: number
  lookPitch: number
}

/**
 * Clamps a thumb displacement to the circular stick gate and turns it into
 * flight input. Screen Y grows downward, while positive pitch points the nose
 * up, so both gaze axes invert their matching screen coordinate.
 */
export function directionStick(dx: number, dy: number, radius = DIRECTION_STICK_RADIUS): DirectionStick {
  const safeRadius = Math.max(1, radius)
  const length = Math.hypot(dx, dy)
  const scale = length > safeRadius ? safeRadius / length : 1
  const x = dx * scale
  const y = dy * scale
  return {
    x,
    y,
    steer: x === 0 ? 0 : -x / safeRadius,
    lookPitch: y === 0 ? 0 : -y / safeRadius,
  }
}

/**
 * How far off centre the reticle has to sit before the craft turns.
 *
 * A cursor is never exactly centred, so without a dead band the ship drifts in
 * whichever direction the last pixel happened to fall.
 */
export const AIM_STEER_DEADZONE = 0.08

/**
 * The yaw the reticle asks for: the craft turns towards where it is looking.
 *
 * The curve is eased rather than linear so the first degrees past the dead band
 * are a lean and the edge of the screen is a hard turn.
 */
export function aimSteer(x: number, deadzone = AIM_STEER_DEADZONE): number {
  const magnitude = Math.abs(x)
  if (magnitude < deadzone) return 0
  return -Math.sign(x) * Math.pow((magnitude - deadzone) / (1 - deadzone), 1.18)
}
