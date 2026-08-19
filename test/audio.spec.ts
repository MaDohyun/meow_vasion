import { describe, expect, it } from 'vitest'
import { BGM_BASE_TEMPO, bgmTempoForThreat } from '../src/audio'

describe('procedural chase music', () => {
  it('starts brisk and raises tempo with threat level', () => {
    expect(bgmTempoForThreat(0)).toBe(BGM_BASE_TEMPO)
    expect(bgmTempoForThreat(3)).toBe(BGM_BASE_TEMPO + 15)
    expect(bgmTempoForThreat(5)).toBe(BGM_BASE_TEMPO + 25)
  })

  it('clamps invalid threat levels to the supported five-step range', () => {
    expect(bgmTempoForThreat(-10)).toBe(BGM_BASE_TEMPO)
    expect(bgmTempoForThreat(99)).toBe(BGM_BASE_TEMPO + 25)
  })
})
