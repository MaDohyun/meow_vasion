import { describe, expect, it } from 'vitest'
import { BGM_BASE_TEMPO, bgmTempoForWave } from '../src/audio'

describe('procedural chase music', () => {
  it('starts brisk and raises tempo with wave stage', () => {
    expect(bgmTempoForWave(0)).toBe(BGM_BASE_TEMPO)
    expect(bgmTempoForWave(3)).toBe(BGM_BASE_TEMPO + 15)
    expect(bgmTempoForWave(7)).toBe(BGM_BASE_TEMPO + 35)
  })

  it('clamps invalid wave stages to the supported boss-wave range', () => {
    expect(bgmTempoForWave(-10)).toBe(BGM_BASE_TEMPO)
    expect(bgmTempoForWave(99)).toBe(BGM_BASE_TEMPO + 35)
  })
})
