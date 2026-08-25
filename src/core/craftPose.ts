/**
 * The angles that put the hull where the flight model says it is pointing.
 *
 * Yaw, pitch and roll are not three independent dials - the order they are
 * applied in decides what each one means. Three.js defaults an Euler to `XYZ`,
 * which applies pitch about the *world* X axis after the heading has already
 * turned the craft, so pitch only reads as pitch while the craft happens to be
 * flying up or down the Z axis. Fly a quarter turn away from that and the same
 * angle rolls the saucer instead: the nose stays level, one rim dips, and a
 * mouse pulled straight up lifts the right-hand side. A wall is what usually
 * made it obvious - `WALL_DEFLECT_RATE` swings the heading off the axis in a
 * fraction of a second, so a scrape left the craft flying banked.
 *
 * `YXZ` is the aircraft order: heading about world up, then pitch about the
 * craft's own wing axis, then the bank about its own nose. Under it the model's
 * nose (+Z) lands exactly on the forward vector the simulation integrates, at
 * every heading.
 */
export const CRAFT_ROTATION_ORDER = 'YXZ' as const

export type CraftEuler = { x: number; y: number; z: number; order: typeof CRAFT_ROTATION_ORDER }

/**
 * `pitch` is the flight model's, positive nose-up; the renderer's X axis runs
 * the other way, which is the sign flip here. `tilt` is the visual bank, and it
 * is a look rather than a flight axis - it never reaches the forward vector.
 */
export function craftEuler(heading: number, pitch: number, tilt: number): CraftEuler {
  return { x: -pitch, y: heading, z: tilt, order: CRAFT_ROTATION_ORDER }
}

/** Where the nose points, straight off the flight model. The renderer has to
 *  agree with this at every heading, which is what the pose test checks. */
export function craftForward(heading: number, pitch: number) {
  const horizontal = Math.cos(pitch)
  return {
    x: Math.sin(heading) * horizontal,
    y: Math.sin(pitch),
    z: Math.cos(heading) * horizontal,
  }
}
