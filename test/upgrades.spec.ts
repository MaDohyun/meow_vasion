import { describe, expect, it } from 'vitest'
import {
  UPGRADE_CHOICES,
  UPGRADE_DEFINITIONS,
  UPGRADE_IDS,
  applyUpgrade,
  createUpgradeState,
  isUpgradeDue,
  isUpgradeMaxed,
  rollUpgradeChoices,
  upgradeMultiplier,
  upgradeStep,
} from '../src/core/upgrades'
import { LANGUAGES, STRINGS } from '../src/i18n'

describe('upgrade cards', () => {
  it('offers three distinct cards', () => {
    const state = createUpgradeState(7)
    const choices = rollUpgradeChoices(state)
    expect(choices).toHaveLength(UPGRADE_CHOICES)
    expect(new Set(choices).size).toBe(UPGRADE_CHOICES)
    for (const id of choices) expect(UPGRADE_IDS).toContain(id)
  })

  it('rolls the same cards from the same seed', () => {
    // Deterministic so an offer can be reasoned about and tested. Math.random
    // here would also mean a card could change under the player between the
    // frame that rolled it and the frame that drew it.
    const first = rollUpgradeChoices(createUpgradeState(1234))
    const second = rollUpgradeChoices(createUpgradeState(1234))
    expect(second).toEqual(first)
  })

  it('never offers a card that is already maxed', () => {
    const state = createUpgradeState(3)
    for (let level = 0; level < UPGRADE_DEFINITIONS.thrust.maxLevel; level += 1) {
      applyUpgrade(state, 'thrust')
    }
    expect(isUpgradeMaxed(state, 'thrust')).toBe(true)
    for (let roll = 0; roll < 60; roll += 1) {
      expect(rollUpgradeChoices(state)).not.toContain('thrust')
    }
  })

  it('caps every upgrade so one stat cannot swallow the run', () => {
    // Without caps the correct play is to pour every card into whichever stat
    // compounds best, and the other six become a tax on not drawing it.
    for (const id of UPGRADE_IDS) {
      const state = createUpgradeState()
      for (let attempt = 0; attempt < 40; attempt += 1) applyUpgrade(state, id)
      expect(state.levels[id], id).toBe(UPGRADE_DEFINITIONS[id].maxLevel)
      expect(applyUpgrade(state, id)).toBe(false)
    }
  })

  it('raises the stat it names and leaves the others alone', () => {
    const state = createUpgradeState()
    expect(upgradeMultiplier(state, 'beam-reach')).toBe(1)
    applyUpgrade(state, 'beam-reach')
    expect(upgradeMultiplier(state, 'beam-reach')).toBeGreaterThan(1)
    expect(upgradeMultiplier(state, 'beam-radius')).toBe(1)
    expect(upgradeMultiplier(state, 'hull')).toBe(1)
  })

  it('never returns a multiplier below one', () => {
    // Callers that want a reduction divide by it. A value under one would mean
    // taking a card could make the craft worse.
    for (const id of UPGRADE_IDS) {
      const state = createUpgradeState()
      for (let level = 0; level <= UPGRADE_DEFINITIONS[id].maxLevel; level += 1) {
        expect(upgradeMultiplier(state, id), id).toBeGreaterThanOrEqual(1)
        applyUpgrade(state, id)
      }
    }
  })

  it('hands out the first card early and then spaces them out', () => {
    // A system the player does not know exists cannot be played around, and
    // the only way to learn this one is to be handed a card early.
    const state = createUpgradeState()
    expect(state.nextAt).toBeLessThanOrEqual(12)
    expect(isUpgradeDue(state, state.nextAt - 1)).toBe(false)
    expect(isUpgradeDue(state, state.nextAt)).toBe(true)

    const gaps: number[] = []
    for (let card = 0; card < 5; card += 1) {
      const before = state.nextAt
      rollUpgradeChoices(state)
      applyUpgrade(state, state.offered[0]!)
      gaps.push(state.nextAt - before)
    }
    for (let index = 1; index < gaps.length; index += 1) {
      expect(gaps[index]!, `gap ${index}`).toBeGreaterThan(gaps[index - 1]!)
    }
    expect(upgradeStep(0)).toBeLessThan(upgradeStep(5))
  })

  it('stops offering once everything is maxed', () => {
    const state = createUpgradeState()
    for (const id of UPGRADE_IDS) {
      for (let level = 0; level < UPGRADE_DEFINITIONS[id].maxLevel; level += 1) applyUpgrade(state, id)
    }
    expect(isUpgradeDue(state, 100000)).toBe(false)
  })

  it('has wording for every card in every language', () => {
    for (const language of LANGUAGES) {
      for (const id of UPGRADE_IDS) {
        const copy = STRINGS[language].upgrades[id]
        expect(copy?.name, `${language}.${id}.name`).toBeTruthy()
        expect(copy?.detail, `${language}.${id}.detail`).toBeTruthy()
      }
      expect(STRINGS[language].upgradeTitle).toBeTruthy()
      expect(STRINGS[language].upgradeHint).toBeTruthy()
    }
    expect(STRINGS.ko.upgrades.thrust.name).not.toBe(STRINGS.en.upgrades.thrust.name)
  })
})
