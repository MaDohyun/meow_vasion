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
