/**
 * UFO-boom pickups ("UFO부붐") - the run's only stat upgrades.
 *
 * The card screen is gone. Stopping the run to pick one of three random cards
 * meant the stats you wanted arrived on the deck's schedule, not yours, and a
 * five-minute run never came close to the caps anyway. The body stats now ride
 * on hull size (see core/size); the four flight-and-fight stats here are
 * earned by flying somewhere: each mystery circle hovers one glowing saucer
 * item over its beacon, and eating it grants one level of whatever that
 * circle carries.
 *
 * That turns the upgrade economy into a routing question - the circles are
 * deterministic landmarks, the item's colour says what it gives from a
 * distance, and the circle's own turbo refill makes the trip toward the next
 * one partly self-funding.
 *
 * Once every stat is capped a pickup patches the hull instead, and with the
 * hull full it pays score - a late-run circle is never a dead landmark.
 *
 * Pure data and arithmetic - no React, no Three.js. Wording lives in
 * `src/i18n.ts`; the bob math lives here so the simulation eats the item at
 * exactly the height the render layer draws it.
 */

export type BoonId = 'laser-power' | 'speed' | 'turbo-recharge' | 'turbo-capacity'

export type BoonDefinition = {
  id: BoonId
  /** Value added per level - a multiplier step for rates, seconds for turbo
   *  capacity. */
  step: number
  /**
   * Where the stat stops. Without a cap the correct play is to farm circles
   * forever; with one, a run that clears all fourteen levels has actually
   * finished something and the pickups move on to healing.
   */
  maxLevel: number
}

export const BOON_DEFINITIONS: Record<BoonId, BoonDefinition> = {
  'laser-power': { id: 'laser-power', step: 0.2, maxLevel: 5 },
  speed: { id: 'speed', step: 0.08, maxLevel: 3 },
  'turbo-recharge': { id: 'turbo-recharge', step: 0.2, maxLevel: 3 },
  'turbo-capacity': { id: 'turbo-capacity', step: 1.5, maxLevel: 3 },
}

export const BOON_IDS = Object.keys(BOON_DEFINITIONS) as BoonId[]

export type BoonState = {
  levels: Record<BoonId, number>
  /** Ids of circles whose item has been eaten this run. One item per circle:
   *  a circle is a place you have been, not a farm you park on. */
  claimed: Set<string>
}

export function createBoonState(): BoonState {
  const levels = {} as Record<BoonId, number>
  for (const id of BOON_IDS) levels[id] = 0
  return { levels, claimed: new Set() }
}

export function isBoonMaxed(state: BoonState, id: BoonId) {
  return state.levels[id] >= BOON_DEFINITIONS[id].maxLevel
}

export function allBoonsMaxed(state: BoonState) {
  return BOON_IDS.every((id) => isBoonMaxed(state, id))
}

/** 1 at level zero, rising by the definition's step. Always >= 1: a pickup
 *  never makes anything worse, so callers that need a reduction divide. */
export function boonMultiplier(state: BoonState, id: BoonId) {
  return 1 + state.levels[id] * BOON_DEFINITIONS[id].step
}

/** Flat additive stats (turbo seconds) use the raw level times step. */
export function boonBonus(state: BoonState, id: BoonId) {
  return state.levels[id] * BOON_DEFINITIONS[id].step
}

/** FNV-1a, same recipe the beam uses to seed per-object wobble. */
function hashCircleId(id: string) {
  let hash = 2166136261
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/**
 * Which stat the item over a circle grants, or null when everything is capped
 * and the pickup falls through to healing.
 *
 * Hashed from the circle's id rather than rolled at claim time, so the render
 * layer can colour the item before it is eaten and a player can read "that
 * one is a laser" from across the district. When a stat maxes out, circles
 * that carried it re-deal themselves over what is still open - the item's
 * colour updates live, which is the honest thing for it to show.
 */
export function boonForCircle(state: BoonState, circleId: string): BoonId | null {
  const open = BOON_IDS.filter((id) => !isBoonMaxed(state, id))
  if (open.length === 0) return null
  return open[hashCircleId(circleId) % open.length]!
}

export type BoonClaim = { kind: 'stat'; id: BoonId; level: number } | { kind: 'heal' }

/** Eats the item over a circle. Null when this circle already gave its item. */
export function claimBoon(state: BoonState, circleId: string): BoonClaim | null {
  if (state.claimed.has(circleId)) return null
  state.claimed.add(circleId)
  const id = boonForCircle(state, circleId)
  if (!id) return { kind: 'heal' }
  state.levels[id] += 1
  return { kind: 'stat', id, level: state.levels[id] }
}

/**
 * The item hangs high over the circle's centre, somewhere in the 50-80m band
 * - each circle at its own hashed height so a skyline of them reads as
 * scattered treasure rather than a row of lamps. Up there it is visible from
 * across the district, and it is also a growth goal: the opening saucer's
 * ceiling (~31m) cannot reach it, a craft around size 1.5 clears 50m, and
 * size ~3.5 clears the top of the band - so the sky fills with boxes you can
 * see before you can have them.
 */
export const BOON_HOVER_MIN = 50
export const BOON_HOVER_MAX = 80
export const BOON_BOB_AMPLITUDE = 3
export const BOON_BOB_SPEED = 1.5

/** One function for the simulation and the render layer, fed the runtime's
 *  own clock, so the item is eaten exactly where it is drawn. */
export function boonHoverY(time: number, circleId: string) {
  const hash = hashCircleId(circleId)
  const base = BOON_HOVER_MIN + BOON_BOB_AMPLITUDE
    + hash % (BOON_HOVER_MAX - BOON_HOVER_MIN - BOON_BOB_AMPLITUDE * 2)
  return base + Math.sin(time * BOON_BOB_SPEED + (hash % 628) / 100) * BOON_BOB_AMPLITUDE
}

/** Generous on purpose: the approach is the skill being asked for, not the
 *  final half-metre. Both grow a little with the hull's hit radius, and both
 *  are sized to the box - a big target that reads big should catch big. */
export const BOON_PICKUP_RADIUS = 8
export const BOON_PICKUP_VERTICAL = 6

/** What a pickup is worth once every stat is capped: a meaningful patch, not
 *  a full repair - free full heals would defang the late waves. */
export const BOON_HEAL_PIPS = 1.5
/** And with the hull already full, score - scaled by size like every other
 *  reward - so no circle is ever worth nothing. */
export const BOON_FULL_SCORE = 150

/** Item colours, shared by the pickup mesh and anything else that wants to
 *  say "that circle carries a laser". */
export const BOON_COLORS: Record<BoonId, string> = {
  'laser-power': '#ff557f',
  speed: '#6deeff',
  'turbo-recharge': '#ffd24d',
  'turbo-capacity': '#ff8a45',
}
export const BOON_HEAL_COLOR = '#63ff8f'
