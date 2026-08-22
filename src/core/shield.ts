/** Shield is an upgrade-only layer in front of the existing hull damage. */
export const SHIELD_REGEN_DELAY = 4
export const SHIELD_REGEN_RATE = 0.5

export type ShieldState = {
  current: number
  max: number
  sinceHit: number
}

export function createShieldState(): ShieldState {
  return { current: 0, max: 0, sinceHit: SHIELD_REGEN_DELAY }
}

export function setShieldCapacity(state: ShieldState, capacity: number) {
  const next = Math.max(0, Math.floor(capacity))
  const gained = Math.max(0, next - state.max)
  state.max = next
  state.current = Math.min(next, state.current + gained)
  return state
}

/** Returns the damage that still reaches the hull. */
export function absorbShieldDamage(state: ShieldState, damage: number) {
  const incoming = Math.max(0, damage)
  state.sinceHit = 0
  const absorbed = Math.min(state.current, incoming)
  state.current -= absorbed
  return incoming - absorbed
}

export function stepShield(state: ShieldState, dt: number) {
  const d = Math.max(0, dt)
  const before = state.sinceHit
  state.sinceHit += d
  if (state.sinceHit < SHIELD_REGEN_DELAY || state.current >= state.max) return state.current
  const regeneratingFor = Math.max(0, state.sinceHit - Math.max(before, SHIELD_REGEN_DELAY))
  state.current = Math.min(state.max, state.current + SHIELD_REGEN_RATE * regeneratingFor)
  return state.current
}

export function shieldRatio(state: ShieldState) {
  return state.max <= 0 ? 0 : Math.max(0, Math.min(1, state.current / state.max))
}

export function isShieldRegenerating(state: ShieldState) {
  return state.max > 0 && state.current < state.max && state.sinceHit >= SHIELD_REGEN_DELAY
}
