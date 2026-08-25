/**
 * Where the reticle sits, for a mouse and for a finger.
 *
 * A cursor and a thumb do not point the same way. The cursor is always on
 * screen, so the reticle can simply live under it - an absolute mapping from
 * the pixel to the viewport. A finger is only on the glass while it drags, and
 * it lands wherever the thumb happens to reach, so the same absolute mapping
 * snaps the reticle onto the thumb and then parks it on top of the fire button
 * the moment the other hand joins in. Touch therefore aims relatively: a drag
 * pushes the reticle as far as the finger travelled, and the reticle keeps that
 * spot once the finger lifts, which is what leaves the other hand free to fire.
 */

/** Normalised viewport point: -1 at the left/top edge, +1 at the right/bottom. */
export type AimPoint = { x: number; y: number }

/** A point in CSS pixels, as a pointer event reports it. */
export type ScreenPoint = { x: number; y: number }

/** The rectangle a drag is measured against, in CSS pixels. */
export type AimBounds = { left: number; top: number; width: number; height: number }

/**
 * How far the reticle travels for a given finger travel.
 *
 * 1 would be a literal drag - the reticle keeps pace with the fingertip and
 * never overtakes it. That reads well but puts the screen edge a half-screen
 * swipe away, which no thumb reaches in one go. At 1.4 a swipe across roughly a
 * third of the screen carries the reticle from the centre to the edge, and the
 * reticle still moves with the finger rather than away from it.
 */
export const TOUCH_AIM_GAIN = 1.4

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

/**
 * The touch mapping: move the reticle by as much as the finger moved.
 *
 * `from` is where the finger was on the previous event, not where the drag
 * started, so the caller advances it every move and a drag that runs into the
 * clamp does not bank up travel it has to undo before the reticle turns around.
 */
export function dragAim(
  aim: AimPoint,
  from: ScreenPoint,
  to: ScreenPoint,
  bounds: Pick<AimBounds, 'width' | 'height'>,
  gain = TOUCH_AIM_GAIN,
): AimPoint {
  return {
    x: clampAxis(aim.x + ((to.x - from.x) / halfExtent(bounds.width)) * gain),
    y: clampAxis(aim.y + ((to.y - from.y) / halfExtent(bounds.height)) * gain),
  }
}

/**
 * How far off centre the reticle has to sit before the craft turns.
 *
 * A cursor is never exactly centred and a thumb never lets go on a clean zero,
 * so without a dead band the ship drifts in whichever direction the last pixel
 * happened to fall.
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

/**
 * Who owns the yaw when a touch HUD is on screen.
 *
 * The movement stick wins while a thumb is on it - that is the control the
 * player is deliberately holding. The moment it returns to rest the aim drag
 * takes over, so a swipe turns the craft towards the reticle exactly as a mouse
 * does on a desktop. Handing the drag the yaw unconditionally would fight the
 * stick; handing the stick a resting zero would freeze the gaze, which is the
 * bug this exists to prevent.
 */
export function steerWithStick(stick: number, aim: number): number {
  return stick !== 0 ? stick : aim
}
