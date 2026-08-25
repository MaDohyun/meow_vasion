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

/**
 * One frame of pumping.
 *
 * `cellRemaining` is what the tile underneath still holds. It only ever bites
 * on the last frame of a tile - the runtime hands a depth of 0 for a tile
 * already dry, so an empty lake bed is simply not water as far as the beam,
 * the drag and the mission are concerned. Defaulting it to Infinity keeps the
 * function readable as "how much would flow" for anyone calling it without a
 * tile in hand.
 */
export function stepLakeAbsorption(
  totalLitres: number,
  dt: number,
  beamActive: boolean,
  depthIntoLake: number,
  cellRemaining = Infinity,
) {
  const overLake = depthIntoLake > 0
  const active = beamActive && overLake
  const depthFactor = Math.min(1, Math.max(0, depthIntoLake) / LAKE_SLOWDOWN_RAMP_DISTANCE)
  const wanted = active ? Math.max(0, dt) * LAKE_ABSORPTION_LITRES_PER_SECOND : 0
  const absorbed = Math.min(wanted, Math.max(0, cellRemaining))
  return {
    litres: Math.max(0, totalLitres) + absorbed,
    absorbed,
    speedScale: active ? 1 - (1 - LAKE_BEAM_SPEED_SCALE) * depthFactor : 1,
    anchored: active,
  }
}

/**
 * Litres one lake tile holds before its water is gone for the rest of the run.
 *
 * Five seconds of held beam at 50 L/s. Two things are priced into that number.
 * The water rung asks for 300 litres, so it cannot be finished standing on one
 * tile - the pilot drains one, moves, and finishes on the next, which is the
 * house rule about sitting still applied to the one surface that most invites
 * it. And a tile is a bounded meal: a lake is 2-4 tiles, so the best a body of
 * water can ever pay is 500-1000 points, however long anyone parks on it.
 *
 * No refill. A drained tile stays drained for the run, which is what makes
 * the number a budget rather than a rate limit.
 */
export const LAKE_CELL_CAPACITY = 250

/**
 * Hull growth for draining one tile dry, as a fraction of current size.
 *
 * Paid on the tile, not on the litre. Water is the one thing the beam takes in
 * continuously, and growing continuously would mean a size pulse on every
 * frame of a five-second pump - the readout would strobe rather than react.
 * Draining a tile is the swallow, and it lands the way swallowing anything
 * else does: once, with a pop.
 *
 * Sized between the two ends of the existing ladder. A cat is +5.8% and the
 * largest tower `absorbBeamObject` can grow you by is +20%, so a tile sits
 * nearer the tower - it costs five seconds pinned at half speed in the one
 * place the craft cannot run from. An average three-tile lake compounds to
 * about +40%, which is still under what fifteen seconds of eating the city
 * pays; the lake is the safer-looking, slower option, not the better one.
 */
export const LAKE_DRAIN_SIZE_GAIN = 0.12

/** Litres drawn per lake tile, keyed by cell. Absent means untouched. */
export type LakeDrainState = { drawn: Map<string, number> }

export function createLakeDrainState(): LakeDrainState {
  return { drawn: new Map() }
}

export function lakeCellKey(cellX: number, cellZ: number) {
  return `${cellX}:${cellZ}`
}

/** What the tile still holds. Zero once it is dry. */
export function lakeCellRemaining(state: LakeDrainState, key: string) {
  return Math.max(0, LAKE_CELL_CAPACITY - (state.drawn.get(key) ?? 0))
}

export function lakeCellDrained(state: LakeDrainState, key: string) {
  return lakeCellRemaining(state, key) <= 0
}

/**
 * Banks litres against a tile. Returns true only on the draw that empties it,
 * so the caller can pay the growth once rather than every frame after.
 */
export function drawFromLakeCell(state: LakeDrainState, key: string, litres: number) {
  if (!(litres > 0)) return false
  const before = state.drawn.get(key) ?? 0
  if (before >= LAKE_CELL_CAPACITY) return false
  const after = Math.min(LAKE_CELL_CAPACITY, before + litres)
  state.drawn.set(key, after)
  return after >= LAKE_CELL_CAPACITY
}

/**
 * Points per litre pumped.
 *
 * Water paid nothing at all before this: the beam ran, the meter for mission
 * two climbed, and the score sat still. That reads as the one beam use in the
 * game that is not worth doing, which is a strange thing to build a rung of
 * the ladder out of.
 *
 * A point a litre is fifty a second - the water rung pays 300 on its own, and
 * the sample rung's 3000 is a minute of held beam over open water. That is a
 * real rate rather than a trickle, and it is set deliberately: a lake is the
 * one place the craft cannot run from, so the pilot is buying the score with
 * half their top speed and whatever the sky sends while they sit there.
 *
 * Deliberately NOT scaled by the size multiplier, unlike every other beam
 * payout. Water comes in at a flat 50 L/s whatever the craft weighs, so the
 * multiplier would be pure profit with no extra work behind it - at the size
 * cap it would pay 750 a second, which is the whole run in twenty seconds.
 */
export const LAKE_SCORE_PER_LITRE = 1

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
