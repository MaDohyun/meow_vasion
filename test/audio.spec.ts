import { describe, expect, it } from 'vitest'
import { BGM_BASE_TEMPO, bgmTempoForWave, getAudioVolumes, setBgmVolume, setSfxVolume } from '../src/audio'

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

describe('audio volume settings', () => {
  it('updates BGM and sound-effect volume independently', () => {
    const original = getAudioVolumes()
    try {
      setBgmVolume(0.35)
      setSfxVolume(0.7)
      expect(getAudioVolumes()).toEqual({ bgm: 0.35, sfx: 0.7 })
    } finally {
      setBgmVolume(original.bgm)
      setSfxVolume(original.sfx)
    }
  })

  it('clamps volume values to the supported range', () => {
    const original = getAudioVolumes()
    try {
      setBgmVolume(-1)
      setSfxVolume(5)
      expect(getAudioVolumes()).toEqual({ bgm: 0, sfx: 1 })
    } finally {
      setBgmVolume(original.bgm)
      setSfxVolume(original.sfx)
    }
  })
})
