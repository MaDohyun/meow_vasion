/**
 * World offset to radar pixel.
 *
 * Split out and tested because getting a rotation sign wrong looks *almost*
 * right - contacts move, just the wrong way - and that is easy to stare past.
 * The first version rotated by -heading as if this were a standard maths frame,
 * and the radar ran backwards.
 *
 * The craft flies a left-handed (x, z) frame, so the screen basis has to be
 * read off the chase camera rather than assumed:
 *
 *   forward = ( sin h,  cos h )
 *   screen right = ( -cos h, sin h )
 *
 * Forward is the flight model's own heading vector. Screen right comes from
 * the chase rig in DroneScene: it sits at position - forward * distance and
 * looks along forward with world up, and three's lookAt builds the camera's
 * x axis as normalize(up x (eye - target)) = normalize(up x -forward), which
 * lands on (-cos h, sin h). Steering agrees - `aimSteer` negates the pointer,
 * so dragging right *decreases* the heading, and d(forward)/d(-h) is exactly
 * (-cos h, sin h).
 *
 * Note this is NOT the vector `drone.ts` calls `rightX`/`rightZ`. That one is
 * ( cos h, -sin h ), the negative of the above - it pairs with a strafe input
 * that reads +1 from the *left* key, so the flight model is self-consistent
 * and only its naming misleads. The radar used to project onto that vector
 * and so drew every contact on the wrong side of the dial: at heading 0 the
 * craft faces +z, +x is out the left window, and the dial put it on the right.
 *
 * Screen y grows downward, hence the negation on the forward term.
 */
export function projectToRadar(
  dx: number,
  dz: number,
  heading: number,
  center: number,
  scale: number,
) {
  const sin = Math.sin(heading)
  const cos = Math.cos(heading)
  const forward = dx * sin + dz * cos
  const right = dz * sin - dx * cos
  return { px: center + right * scale, py: center - forward * scale }
}

/**
 * Pull a projected point back to the dial's rim when it falls outside it.
 *
 * Two marks need this and neither may simply be dropped: the objective, which
 * is the run's heading, and the dreadnought, which orbits at 118 and pursues
 * to 177 - further out than the 170 the sweep covers. A contact that leaves
 * the dial has not stopped mattering, and the direction it left in is the
 * whole answer, so it rides the rim instead of blinking out.
 */
export function clampToRadarRim(px: number, py: number, center: number, edge: number) {
  const offsetX = px - center
  const offsetY = py - center
  const length = Math.hypot(offsetX, offsetY)
  const angle = Math.atan2(offsetY, offsetX)
  if (length <= edge) return { px, py, angle, clamped: false }
  const factor = edge / length
  return { px: center + offsetX * factor, py: center + offsetY * factor, angle, clamped: true }
}
