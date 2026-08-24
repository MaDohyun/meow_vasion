/**
 * Health - the run's survival resource.
 *
 * Size used to be health: absorbing grew it, hits shrank it, and dropping
 * below a floor ended the run. That put one resource in charge of two jobs and
 * broke all three of the things it touched.
 *
 * It undid the best part of the game. Growing is the fun; a hit that shrinks
 * you is not punishing a mistake, it is rewinding progress.
 *
 * It made a small craft impossible. Start was 1.0 and death was 0.62, so there
 * was no room underneath - "start as a saucer that can barely swallow one
 * person" could not be expressed.
 *
 * And once shots could actually land (see lead aiming), it turned growth into
 * a trap: a bigger craft is a bigger target, a bigger target takes more hits,
 * more hits meant getting smaller, which is a spiral that punishes playing well.
 *
 * So health is its own thing now. Size only ever goes up; health goes down and
 * comes back.
 */

export const MAX_HEALTH = 5

/**
 * Damage per source, in pips.
 *
 * The ordering is inherited from the size losses this replaced, and the rule
 * behind it is unchanged: **the things you can see coming cost the most**.
 * Being surprised should never be the expensive mistake, because there is no
 * skill that answers it.
 */
export const HEALTH_LOSS = {
  // Half a heart, and the sky's only bullet.
  //
  // Every gun outside the boss fires the orb now, so this one figure prices
  // the whole curtain. It is the cheapest hit in the game because it is the
  // most visible one: a slow round is on screen for seconds before it
  // arrives, and a player who is still in front of it chose to be. It is also
  // small enough that being clipped is a correction rather than a disaster -
  // four of them cost what one anti-air shell used to, and the shells were
  // the reason altitude read as a damage table.
  orb: 0.5,
  building: 0.5,
  contact: 1,
  // The battleship's bow gun: the one aimed, telegraphed shot left, and the
  // only one that costs more than a scrape. It is shown to the player before
  // it leaves, so it is allowed to hurt.
  'boss-beam': 1.5,
  explosive: 2.5,
} as const

export type HealthLossKind = keyof typeof HEALTH_LOSS

/** Quiet seconds before the craft starts patching itself up. */
export const REGEN_DELAY = 6
/** Pips per second once it does. A full bar takes a while: disengaging has to
 *  be a decision with a cost, not a pause button. */
export const REGEN_RATE = 0.22

export type HealthState = {
  current: number
  max: number
  /** Seconds since the last hit. Regeneration waits on this. */
  sinceHit: number
}

export function createHealthState(): HealthState {
  return { current: MAX_HEALTH, max: MAX_HEALTH, sinceHit: REGEN_DELAY }
}

export function damageHealth(state: HealthState, kind: HealthLossKind) {
  state.current = Math.max(0, state.current - HEALTH_LOSS[kind])
  state.sinceHit = 0
  return state.current
}

/**
 * @param regenScale multiplier from the regeneration upgrade.
 */
export function stepHealth(state: HealthState, dt: number, regenScale = 1) {
  const d = Math.max(0, dt)
  state.sinceHit += d
  if (state.sinceHit < REGEN_DELAY) return state.current
  state.current = Math.min(state.max, state.current + REGEN_RATE * regenScale * d)
  return state.current
}

export function healHealth(state: HealthState, pips: number) {
  state.current = Math.min(state.max, state.current + Math.max(0, pips))
  return state.current
}

/**
 * Raises the ceiling and grants the new pips already filled - a heart earned
 * by growing arrives full, the way the old shield pips did. Never lowers:
 * size never falls, and neither does anything size paid for.
 */
export function raiseHealthMax(state: HealthState, max: number) {
  const next = Math.max(state.max, max)
  state.current += next - state.max
  state.max = next
  return state
}

export function isDead(state: HealthState) {
  return state.current <= 0
}

/** 0..1, for the bar. */
export function healthRatio(state: HealthState) {
  return state.max <= 0 ? 0 : Math.max(0, Math.min(1, state.current / state.max))
}

/** True while the craft is patching itself up, so the HUD can say so. */
export function isRegenerating(state: HealthState) {
  return state.sinceHit >= REGEN_DELAY && state.current < state.max
}
