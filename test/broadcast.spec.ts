import { describe, expect, it } from 'vitest'
import {
  BROADCAST_CLOSE_SECONDS,
  BROADCAST_COUNT,
  BROADCAST_OPEN_SECONDS,
  BROADCAST_SECONDS,
  broadcastPhase,
  broadcastProgress,
  broadcastStageForTime,
} from '../src/core/broadcast'
import { ENEMY_WAVE_STAGES } from '../src/core/enemies'
import { LANGUAGES, STRINGS, bulletinFor } from '../src/i18n'

describe('wave bulletins', () => {
  it('has one bulletin per wave stage in every language', () => {
    expect(BROADCAST_COUNT).toBe(ENEMY_WAVE_STAGES.length)
    for (const language of LANGUAGES) {
      expect(STRINGS[language].broadcast).toHaveLength(BROADCAST_COUNT)
      expect(STRINGS[language].breakingFlag).toBeTruthy()
      for (let stage = 0; stage < BROADCAST_COUNT; stage += 1) {
        const bulletin = bulletinFor(STRINGS[language], stage)
        expect(bulletin.headline, `${language}.${stage}.headline`).toBeTruthy()
        expect(bulletin.line, `${language}.${stage}.line`).toBeTruthy()
      }
    }
  })

  it('says something different at every stage', () => {
    // Eight bulletins that all read the same would be worse than none: the
    // player would learn to stop reading the band after the second one.
    for (const language of LANGUAGES) {
      const headlines = STRINGS[language].broadcast.map((bulletin) => bulletin.headline)
      const lines = STRINGS[language].broadcast.map((bulletin) => bulletin.line)
      expect(new Set(headlines).size).toBe(BROADCAST_COUNT)
      expect(new Set(lines).size).toBe(BROADCAST_COUNT)
    }
  })

  it('translates rather than copying English through', () => {
    expect(STRINGS.ko.breakingFlag).not.toBe(STRINGS.en.breakingFlag)
    expect(STRINGS.ja.breakingFlag).not.toBe(STRINGS.en.breakingFlag)
    expect(bulletinFor(STRINGS.ko, 4).line).not.toBe(bulletinFor(STRINGS.en, 4).line)
  })

  it('announces a wave only once it has actually started', () => {
    // The bulletin reads off the same boundaries as the spawner, so it can
    // never report fighters that are not in the air yet.
    for (let stage = 0; stage < ENEMY_WAVE_STAGES.length; stage += 1) {
      const at = ENEMY_WAVE_STAGES[stage]!.at
      expect(broadcastStageForTime(at)).toBe(stage)
      if (at > 0) expect(broadcastStageForTime(at - 0.01)).toBe(stage - 1)
    }
  })

  it('names the drones at the start and the fighters when they scramble', () => {
    // The two moments the design leans on: the drones already hanging in the
    // sky when the run opens, and the scramble at 90 seconds.
    expect(bulletinFor(STRINGS.ko, broadcastStageForTime(0)).line).toContain('자폭 드론')
    expect(bulletinFor(STRINGS.ko, broadcastStageForTime(90)).line).toContain('전투기')
    expect(bulletinFor(STRINGS.en, broadcastStageForTime(90)).line.toLowerCase()).toContain('fighter')
  })

  it('slides in, holds, then slides out', () => {
    expect(broadcastPhase(0)).toBe('off')
    expect(broadcastPhase(BROADCAST_SECONDS)).toBe('opening')
    expect(broadcastPhase(BROADCAST_SECONDS - BROADCAST_OPEN_SECONDS * 0.5)).toBe('opening')
    expect(broadcastPhase(BROADCAST_SECONDS * 0.5)).toBe('holding')
    expect(broadcastPhase(BROADCAST_CLOSE_SECONDS * 0.5)).toBe('closing')
  })

  it('runs the countdown bar from full to empty', () => {
    expect(broadcastProgress(BROADCAST_SECONDS)).toBe(0)
    expect(broadcastProgress(0)).toBe(1)
    expect(broadcastProgress(BROADCAST_SECONDS * 0.5)).toBeCloseTo(0.5)
    // Clamped, because the runtime may publish a stale frame either side.
    expect(broadcastProgress(-1)).toBe(1)
    expect(broadcastProgress(BROADCAST_SECONDS * 2)).toBe(0)
  })

  it('clears before the next wave can arrive', () => {
    // Bulletins must not overlap: the tightest gap in the wave table is the
    // one that decides how long a band may stay on air.
    let tightest = Infinity
    for (let stage = 1; stage < ENEMY_WAVE_STAGES.length; stage += 1) {
      tightest = Math.min(tightest, ENEMY_WAVE_STAGES[stage]!.at - ENEMY_WAVE_STAGES[stage - 1]!.at)
    }
    expect(BROADCAST_SECONDS).toBeLessThan(tightest)
  })
})
