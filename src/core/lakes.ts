import { lakeClusterForCell, seedForWorldCell } from './world'

export const LAKE_ABSORPTION_LITRES_PER_SECOND = 50
// The floor the drag ramps down to at full depth: two fifths of top speed.
//
// It was half, and water took another fifth off that. Water pays well now and
// drains a whole lake in one sitting, so what it costs has to be felt for the
// whole sitting rather than noticed once on the way in.
//
// It is still a top-speed cap and not a per-frame damping. An earlier version
// multiplied the craft's velocity by this every frame as well, which at sixty
// hertz pinned it to the spot - pumping read as the beam being broken rather
// than as water being heavy. The runtime scales the throttle only, so the
// craft still accelerates, steers and strafes; it just tops out low. However
// heavy it gets, the pilot can always fly out of the lake.
export const LAKE_BEAM_SPEED_SCALE = 0.4
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
 * The range one lake tile holds, in litres. Rolled per cell, never stored.
 *
 * A fixed number made every tile the same five seconds, and a lake read as a
 * row of identical tanks. Rolling it means the pilot cannot know from above
 * which tile is the deep one - a lake is worth flying along rather than
 * measuring, and a fat tile is something to be glad about rather than a number
 * to count out.
 *
 * The floor is the water rung's own target, so even the shallowest tile in the
 * world can finish that rung on its own.
 */
export const LAKE_CELL_CAPACITY_MIN = 300
export const LAKE_CELL_CAPACITY_MAX = 500

/**
 * Litres this tile holds before its water is gone for the rest of the run.
 *
 * Derived from the cell's coordinates like everything else in this world, not
 * from Math.random and not from stored terrain: leaving a district and coming
 * back has to find the same lake, and a capacity that re-rolled on the way
 * back would quietly refill a tile the pilot had already half drunk.
 *
 * The salt is this module's own, so how deep a tile is stays independent of
 * everything else the cell's seed already decides.
 */
export function lakeCellCapacity(cellX: number, cellZ: number) {
  const span = LAKE_CELL_CAPACITY_MAX - LAKE_CELL_CAPACITY_MIN + 1
  return LAKE_CELL_CAPACITY_MIN + (seedForWorldCell(cellX, cellZ, 0x7a1e) % span)
}

/**
 * Hull growth for draining a tile dry, as a fraction of current size per litre
 * the tile held.
 *
 * Paid on the tile, not on the litre. Water is the one thing the beam takes in
 * continuously, and growing continuously would mean a size pulse on every
 * frame of a pump - the readout would strobe rather than react. Draining a
 * tile is the swallow, and it lands the way swallowing anything else does:
 * once, with a pop.
 *
 * Scaled by what the tile actually held, so a deep tile is a bigger meal in
 * every sense rather than only a longer one. Across the capacity range that
 * puts a tile between +9% and +15%: the bottom sits well above a cat (+4.3%)
 * and the top stays under the largest tower `absorbBeamObject` can pay (+20%).
 *
 * Per second of held beam it comes out a flat ~1.4% whatever the tile rolled,
 * against roughly 2.1% for eating the city at the rate test/feeding.spec.ts
 * measures. The lake is deliberately about two thirds of the city's rate - a
 * safer-looking, finite option, never the better one.
 *
 * It came down from 0.0004 with the city's own rate rather than on its own
 * account: this number is only ever meaningful next to SIZE_GAIN, and leaving
 * it while the city slowed would have quietly made water the better meal.
 */
export const LAKE_DRAIN_SIZE_GAIN_PER_LITRE = 0.0003

/** Growth for draining this particular tile. */
export function lakeDrainSizeGain(cellX: number, cellZ: number) {
  return lakeCellCapacity(cellX, cellZ) * LAKE_DRAIN_SIZE_GAIN_PER_LITRE
}

/**
 * Litres drawn per lake tile, and the lakes that have gone dry.
 *
 * Two structures because they answer two questions. `drawn` is how far into
 * the tile under the beam the pilot has got; `dryClusters` is which bodies of
 * water no longer exist. Emptying one tile empties the lake it belongs to, so
 * the second is not derivable from the first.
 */
export type LakeDrainState = { drawn: Map<string, number>; dryClusters: Set<string> }

export function createLakeDrainState(): LakeDrainState {
  return { drawn: new Map(), dryClusters: new Set() }
}

export function lakeCellKey(cellX: number, cellZ: number) {
  return `${cellX}:${cellZ}`
}

/**
 * What the tile still holds. Zero once it, or the lake it is joined to, is dry.
 *
 * Water does not sit in tiles, it sits in a lake - so drinking one tile to the
 * bottom takes the tiles touching it with it. The alternative was a lake that
 * empties a square at a time and leaves a checkerboard of puddles standing at
 * the same level, which is not what draining looks like.
 *
 * The pilot is paid for the litres they actually pumped, so a lake is worth
 * one tile however many tiles it has. That is the cost of the rule and it is
 * the right way round: the tiles vanish for free, they do not pay for free.
 */
export function lakeCellRemaining(state: LakeDrainState, cellX: number, cellZ: number) {
  const cluster = lakeClusterForCell(cellX, cellZ)
  if (cluster !== null && state.dryClusters.has(cluster)) return 0
  const drawn = state.drawn.get(lakeCellKey(cellX, cellZ)) ?? 0
  return Math.max(0, lakeCellCapacity(cellX, cellZ) - drawn)
}

export function lakeCellDrained(state: LakeDrainState, cellX: number, cellZ: number) {
  return lakeCellRemaining(state, cellX, cellZ) <= 0
}

/**
 * Banks litres against a tile. Returns true only on the draw that empties it,
 * so the caller can pay the growth once rather than every frame after.
 *
 * The draw that empties the tile empties its whole lake with it.
 */
export function drawFromLakeCell(state: LakeDrainState, cellX: number, cellZ: number, litres: number) {
  if (!(litres > 0)) return false
  if (lakeCellRemaining(state, cellX, cellZ) <= 0) return false
  const capacity = lakeCellCapacity(cellX, cellZ)
  const key = lakeCellKey(cellX, cellZ)
  const after = Math.min(capacity, (state.drawn.get(key) ?? 0) + litres)
  state.drawn.set(key, after)
  if (after < capacity) return false
  const cluster = lakeClusterForCell(cellX, cellZ)
  if (cluster !== null) state.dryClusters.add(cluster)
  return true
}

/**
 * Points per litre pumped.
 *
 * Water paid nothing at all before this: the beam ran, the meter for mission
 * two climbed, and the score sat still. That reads as the one beam use in the
 * game that is not worth doing, which is a strange thing to build a rung of
 * the ladder out of.
 *
 * A point a litre is fifty a second: 300 to 500 for the one tile a lake gets
 * drunk from, in six to ten seconds of held beam. It was two a litre and that
 * was too much - the general sells water as research data worth diverting for,
 * and at double this a lake cleared most of the sample rung on its own. A
 * detour worth taking should not also be a rung worth skipping.
 *
 * The rate can be a real one rather than a trickle because the supply is not a
 * rate at all, it is a budget - and a small one. Draining a tile takes its
 * whole lake with it, so a body of water pays for the single tile the pilot
 * actually pumped and is a dry basin from then on. What they spend for it is
 * three fifths of their top speed in the one place the craft cannot run from.
 *
 * Deliberately NOT scaled by the size multiplier, unlike every other beam
 * payout. Water comes in at a flat 50 L/s whatever the craft weighs, so the
 * multiplier would be pure profit with no extra work behind it - at the size
 * cap it would pay 750 a second.
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
