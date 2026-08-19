import { describe, expect, it } from 'vitest'
import {
  MISSION_BASE_REWARD,
  SCORE_DRAIN_PER_SECOND,
  STARTING_SCORE,
  WANTED_SCORE_MULTIPLIERS,
  createDensityCache,
  drainScore,
  scoreReward,
  updateDensityCache,
  wantedScoreMultiplier,
} from '../src/core/risk'
import { getProceduralCell } from '../src/core/world'

describe('score pressure, risk reward, and cached city density', () => {
  it('uses score depletion as the run clock and reaches exactly zero', () => {
    expect(drainScore(STARTING_SCORE, 1)).toBe(STARTING_SCORE - SCORE_DRAIN_PER_SECOND)
    expect(drainScore(5, 10)).toBe(0)
  })

  it('makes high wanted levels a large, visible reward multiplier', () => {
    expect(wantedScoreMultiplier(0)).toBe(1)
    expect(wantedScoreMultiplier(5)).toBe(WANTED_SCORE_MULTIPLIERS[5])
    expect(wantedScoreMultiplier(5)).toBeGreaterThan(wantedScoreMultiplier(1) * 3)
    expect(scoreReward(MISSION_BASE_REWARD, 5, 3)).toBeGreaterThan(scoreReward(MISSION_BASE_REWARD, 1, 3) * 3)
  })

  it('makes one low-risk mission worth tens of seconds of score drain', () => {
    const reward = scoreReward(MISSION_BASE_REWARD, 0, 1)
    expect(reward / SCORE_DRAIN_PER_SECOND).toBeGreaterThan(30)
  })

  it('updates one reusable density cache and raises heat pressure downtown', () => {
    const cache = createDensityCache()
    const buildings = []
    for (let z = -8; z <= 8; z += 1) {
      for (let x = -8; x <= 8; x += 1) {
        const building = getProceduralCell(x, z).building
        if (building) buildings.push(building)
      }
    }
    const same = updateDensityCache(cache, { x: 0, y: 3, z: 0 }, buildings, 12, [], [])
    expect(same).toBe(cache)
    expect(cache.buildings).toBeGreaterThan(0)
    expect(cache.heatMultiplier).toBeGreaterThan(1.5)
    updateDensityCache(cache, { x: 10000, y: 3, z: 10000 }, buildings, 0, [], [])
    expect(cache.heatMultiplier).toBe(1)
  })
})
