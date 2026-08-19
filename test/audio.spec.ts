import { describe, expect, it } from 'vitest'
import { BGM_BASE_TEMPO, bgmTempoForWanted } from '../src/audio'

describe('procedural chase music', () => {
  it('starts brisk and raises tempo with wanted level', () => {
    expect(bgmTempoForWanted(0)).toBe(BGM_BASE_TEMPO)
    expect(bgmTempoForWanted(3)).toBe(BGM_BASE_TEMPO + 15)
    expect(bgmTempoForWanted(5)).toBe(BGM_BASE_TEMPO + 25)
  })

  it('clamps invalid wanted levels to the supported five-star range', () => {
    expect(bgmTempoForWanted(-10)).toBe(BGM_BASE_TEMPO)
    expect(bgmTempoForWanted(99)).toBe(BGM_BASE_TEMPO + 25)
  })
})
