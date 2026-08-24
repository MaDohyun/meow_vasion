/**
 * World offset to radar pixel.
 *
 * Split out and tested because getting a rotation sign wrong looks *almost*
 * right - contacts move, just the wrong way - and that is easy to stare past.
 * The first version rotated by -heading as if this were a standard maths frame,
 * and the radar ran backwards.
 *
 * The craft's actual basis, from the flight model:
 *
 *   forward = ( sin h,  cos h )
 *   right   = ( cos h, -sin h )
 *
 * So rather than guess a rotation matrix, project the offset onto that basis
 * directly. Screen y grows downward, hence the negation on the forward term.
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
  const right = dx * cos - dz * sin
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
