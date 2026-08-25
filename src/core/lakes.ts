export const LAKE_ABSORPTION_LITRES_PER_SECOND = 50
// The floor the drag ramps down to at full depth: half speed.
//
// It was 0.2, and on top of that the runtime multiplied the craft's velocity
// by this every frame as well - a per-frame damping, not a speed limit, which
// at sixty hertz pinned the craft to the spot. Pumping water read as the beam
// being broken rather than as water being heavy. The runtime now scales the
// throttle only (one honest top-speed cap), and the floor is the number the
// general quotes: half speed, still flying, still able to leave.
export const LAKE_BEAM_SPEED_SCALE = 0.5
// Metres of shore-to-craft distance before the drag reaches its floor. Short
// enough that a real lake (2-4 cells) has room to reach it away from every
// edge, long enough that stepping just past the shoreline barely slows you.
export const LAKE_SLOWDOWN_RAMP_DISTANCE = 12

export function stepLakeAbsorption(totalLitres: number, dt: number, beamActive: boolean, depthIntoLake: number) {
  const overLake = depthIntoLake > 0
  const active = beamActive && overLake
  const depthFactor = Math.min(1, Math.max(0, depthIntoLake) / LAKE_SLOWDOWN_RAMP_DISTANCE)
  return {
    litres: Math.max(0, totalLitres) + (active ? Math.max(0, dt) * LAKE_ABSORPTION_LITRES_PER_SECOND : 0),
    absorbed: active ? Math.max(0, dt) * LAKE_ABSORPTION_LITRES_PER_SECOND : 0,
    speedScale: active ? 1 - (1 - LAKE_BEAM_SPEED_SCALE) * depthFactor : 1,
    anchored: active,
  }
}

/**
 * Points per litre pumped.
 *
 * Water paid nothing at all before this: the beam ran, the meter for mission
 * two climbed, and the score sat still. That reads as the one beam use in the
 * game that is not worth doing, which is a strange thing to build a rung of
 * the ladder out of.
 *
 * A tenth of a point per litre is five a second - about one pedestrian every
 * second and a half at the opening size, and a rounding error by the time the
 * craft is eating towers. That is the whole intent: the number moves while the
 * pilot holds the beam on water, and never enough to make sitting in a lake a
 * better plan than eating the city.
 *
 * Deliberately NOT scaled by the size multiplier, unlike every other beam
 * payout. Water comes in at a flat 50 L/s whatever the craft weighs, so the
 * multiplier would be pure profit with no extra work behind it - at the size
 * cap it would pay 75 a second and turn the sample rung into a swim.
 */
export const LAKE_SCORE_PER_LITRE = 0.1

/**
 * Whole points owed for crossing from one running litre total to the next.
 *
 * Floors on both sides rather than paying `litres * rate` per frame, because
 * the score is an integer and a fraction of a point per frame either rounds
 * away to nothing or, rounded up, pays a point every frame. The remainder
 * lives in the litre total itself, so nothing extra has to be carried.
 */
export function lakeScorePayout(previousLitres: number, nextLitres: number) {
  const before = Math.floor(Math.max(0, previousLitres) * LAKE_SCORE_PER_LITRE)
  const after = Math.floor(Math.max(0, nextLitres) * LAKE_SCORE_PER_LITRE)
  return Math.max(0, after - before)
}
