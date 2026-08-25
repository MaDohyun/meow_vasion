/**
 * The floor an overloaded craft's top speed falls to, however greedy it gets.
 *
 * Under half, so overload is unmistakable, but never a standstill: the answer
 * to being overloaded is to fly somewhere and finish the meal, and a craft
 * that cannot move cannot do that. It is the same shape of promise the lake
 * makes (see LAKE_BEAM_SPEED_SCALE) - a heavy penalty you can always fly out
 * of.
 */
export const OVERLOAD_CRUISE_FLOOR = 0.45

/**
 * Top speed while over the rated load, as a share of the craft's own.
 *
 * This is where the beam's cost lives now. Holding the beam used to cost speed
 * by itself, which priced the verb rather than the greed: a pass over an empty
 * street with the cone open was billed exactly like a pass that came away with
 * three cars. Nothing is charged for opening the beam any more. What you are
 * charged for is what you are still carrying, and only once it is past what
 * the hull is rated to lift.
 *
 * Measured against capacity rather than in absolute mass, because capacity
 * grows with the craft: "twice what you are rated for" has to mean the same
 * thing to the opening saucer and to one at the ceiling, or the rule would
 * read as a tax on growing.
 *
 * The curve is continuous at the line - exactly at capacity this returns 1 -
 * so the penalty eases in as the gauge fills rather than snapping on at the
 * moment it pins. Ballast drag is still charged underneath it (see
 * BALLAST_DRAG); that is the gentle, always-on half of the same idea, and this
 * is the half the alarm is about.
 */
export function overloadCruiseScale(hangingWeight: number, liftCapacity: number) {
  const capacity = Math.max(0.001, liftCapacity)
  const excess = Math.max(0, hangingWeight - capacity) / capacity
  return OVERLOAD_CRUISE_FLOOR + (1 - OVERLOAD_CRUISE_FLOOR) / (1 + excess)
}
