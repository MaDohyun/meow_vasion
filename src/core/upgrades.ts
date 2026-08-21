/**
 * Upgrade cards.
 *
 * Absorbing is the whole run, so the run's rewards hang off it: every so many
 * bodies the game stops and offers three cards, and one of them is taken. It
 * is the only place in the run where the player decides what kind of craft
 * they are flying rather than just how well they fly it.
 *
 * Stopping matters. A card that slid past while drones were converging would
 * be taken by whichever hand was already moving, which is not a choice. The
 * simulation freezes entirely until one is picked.
 *
 * Pure data and arithmetic - no React, no Three.js. The wording lives in
 * `src/i18n.ts`; this file only knows ids, levels and multipliers.
 */

export type UpgradeId =
  | 'beam-reach'
  | 'beam-radius'
  | 'beam-grip'
  | 'laser-power'
  | 'thrust'
  | 'turbo'
  | 'hull'

export type UpgradeDefinition = {
  id: UpgradeId
  /** Multiplier added per level. Level 2 of a 0.2 step is 1.4x. */
  step: number
  /**
   * Where a card stops being offered.
   *
   * Every upgrade has one. Without a cap the correct play is to pour every
   * card into whichever stat compounds best, and the other six become a tax on
   * not getting the one you wanted.
   */
  maxLevel: number
}

export const UPGRADE_DEFINITIONS: Record<UpgradeId, UpgradeDefinition> = {
  'beam-reach': { id: 'beam-reach', step: 0.18, maxLevel: 5 },
  'beam-radius': { id: 'beam-radius', step: 0.12, maxLevel: 5 },
  'beam-grip': { id: 'beam-grip', step: 0.16, maxLevel: 5 },
  'laser-power': { id: 'laser-power', step: 0.45, maxLevel: 4 },
  thrust: { id: 'thrust', step: 0.1, maxLevel: 4 },
  turbo: { id: 'turbo', step: 0.2, maxLevel: 4 },
  hull: { id: 'hull', step: 0.16, maxLevel: 4 },
}

export const UPGRADE_IDS = Object.keys(UPGRADE_DEFINITIONS) as UpgradeId[]

/** Cards shown per offer. */
export const UPGRADE_CHOICES = 3

/**
 * Absorptions before the first card, and how much further each one is than the
 * last: 10, 28, 54, 88, 130 and so on.
 *
 * The first is deliberately cheap. A system the player does not know exists
 * cannot be played around, and the only way to learn this one is to be handed
 * a card early.
 */
export const UPGRADE_FIRST_THRESHOLD = 10
export const UPGRADE_THRESHOLD_GROWTH = 8

export type UpgradeState = {
  levels: Record<UpgradeId, number>
  /** How many cards have been taken. Drives the next threshold. */
  taken: number
  /** Absorption count that opens the next offer. */
  nextAt: number
  /** The three ids currently on screen, empty when nothing is being offered. */
  offered: UpgradeId[]
  randomState: number
}

export function createUpgradeState(seed = 1): UpgradeState {
  const levels = {} as Record<UpgradeId, number>
  for (const id of UPGRADE_IDS) levels[id] = 0
  return {
    levels,
    taken: 0,
    nextAt: UPGRADE_FIRST_THRESHOLD,
    offered: [],
    randomState: seed >>> 0 || 1,
  }
}

/** How many more absorptions the offer after `taken` cards costs. */
export function upgradeStep(taken: number) {
  return UPGRADE_FIRST_THRESHOLD + UPGRADE_THRESHOLD_GROWTH * taken
}

function random(state: UpgradeState) {
  let value = state.randomState || 1
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  state.randomState = value >>> 0 || 1
  return state.randomState / 0xffffffff
}

export function isUpgradeMaxed(state: UpgradeState, id: UpgradeId) {
  return state.levels[id] >= UPGRADE_DEFINITIONS[id].maxLevel
}

/**
 * Three distinct ids that still have room to grow.
 *
 * Rolled from the state's own generator rather than Math.random so an offer is
 * reproducible - the same run replays to the same cards, and the roll can be
 * tested.
 */
export function rollUpgradeChoices(state: UpgradeState) {
  const pool = UPGRADE_IDS.filter((id) => !isUpgradeMaxed(state, id))
  const picked: UpgradeId[] = []
  while (picked.length < UPGRADE_CHOICES && picked.length < pool.length) {
    const candidate = pool[Math.floor(random(state) * pool.length) % pool.length]!
    if (!picked.includes(candidate)) picked.push(candidate)
  }
  state.offered = picked
  return picked
}

export function applyUpgrade(state: UpgradeState, id: UpgradeId) {
  if (isUpgradeMaxed(state, id)) return false
  state.levels[id] += 1
  state.taken += 1
  state.nextAt += upgradeStep(state.taken)
  state.offered = []
  return true
}

/** 1 at level zero, rising by the definition's step. Always >= 1: an upgrade
 *  never makes anything worse, so callers that need a reduction divide. */
export function upgradeMultiplier(state: UpgradeState, id: UpgradeId) {
  return 1 + state.levels[id] * UPGRADE_DEFINITIONS[id].step
}

/** True when this many absorptions has earned a card that has not been taken. */
export function isUpgradeDue(state: UpgradeState, absorbed: number) {
  return absorbed >= state.nextAt && pendingUpgradePool(state) > 0
}

/** Nothing left to offer means nothing left to stop the game for. */
export function pendingUpgradePool(state: UpgradeState) {
  return UPGRADE_IDS.filter((id) => !isUpgradeMaxed(state, id)).length
}
