import { describe, expect, it } from 'vitest'
import {
  BATTLESHIP_DOWN_BROADCAST_STAGE,
  BATTLESHIP_EATEN_BROADCAST_STAGE,
  BROADCAST_CLOSE_SECONDS,
  BROADCAST_COUNT,
  BROADCAST_OPENING_AT,
  BROADCAST_OPEN_SECONDS,
  BROADCAST_SECONDS,
  broadcastPhase,
  broadcastProgress,
  broadcastStageForTime,
} from '../src/core/broadcast'
import { ENEMY_WAVE_STAGES } from '../src/core/enemies'
import { LANGUAGES, STRINGS, bulletinFor } from '../src/i18n'

describe('wave bulletins', () => {
  it('has one bulletin per wave stage and both battleship results in every language', () => {
    expect(BATTLESHIP_DOWN_BROADCAST_STAGE).toBe(ENEMY_WAVE_STAGES.length)
    expect(BATTLESHIP_EATEN_BROADCAST_STAGE).toBe(ENEMY_WAVE_STAGES.length + 1)
    expect(BROADCAST_COUNT).toBe(ENEMY_WAVE_STAGES.length + 2)
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

  it('reports the battleship down and Earth\'s final defence collapsed', () => {
    const korean = bulletinFor(STRINGS.ko, BATTLESHIP_DOWN_BROADCAST_STAGE)
    const japanese = bulletinFor(STRINGS.ja, BATTLESHIP_DOWN_BROADCAST_STAGE)
    const english = bulletinFor(STRINGS.en, BATTLESHIP_DOWN_BROADCAST_STAGE)
    expect(korean.headline).toBe('공중전함 격추 · 최종 방어선 붕괴')
    expect(korean.line).toContain('공중전함이 격추됐습니다')
    expect(korean.line).toContain('막을 수단은… 남아 있지 않습니다')
    expect(japanese.line).toContain('最後の盾')
    expect(japanese.line).toContain('空中戦艦')
    expect(english.headline).toContain('FINAL DEFENCE COLLAPSES')
    expect(english.line.toLowerCase()).toContain('nothing left')
  })

  it('reports a swallowed battleship in its own words, not the shoot-down card', () => {
    // Both endings collapse the same defence line, but the newsroom saw what
    // happened: a ship that was eaten must not be reported as shot down.
    for (const language of LANGUAGES) {
      const down = bulletinFor(STRINGS[language], BATTLESHIP_DOWN_BROADCAST_STAGE)
      const eaten = bulletinFor(STRINGS[language], BATTLESHIP_EATEN_BROADCAST_STAGE)
      expect(eaten.headline, language).not.toBe(down.headline)
      expect(eaten.line, language).not.toBe(down.line)
    }
    expect(bulletinFor(STRINGS.ko, BATTLESHIP_EATEN_BROADCAST_STAGE).line).toContain('삼켜졌습니다')
    expect(bulletinFor(STRINGS.ja, BATTLESHIP_EATEN_BROADCAST_STAGE).line).toContain('呑み込まれました')
    expect(bulletinFor(STRINGS.en, BATTLESHIP_EATEN_BROADCAST_STAGE).line.toLowerCase()).toContain('swallowed')
  })

  it('says something different at every stage', () => {
    // Six bulletins that all read the same would be worse than none: the
    // player would learn to stop reading the band after the second one.
    for (const language of LANGUAGES) {
      const headlines = STRINGS[language].broadcast.map((bulletin) => bulletin.headline)
      const lines = STRINGS[language].broadcast.map((bulletin) => bulletin.line)
      expect(new Set(headlines).size).toBe(BROADCAST_COUNT)
      expect(new Set(lines).size).toBe(BROADCAST_COUNT)
    }
  })

  it('breaks every bulletin into exactly two authored lines', () => {
    // The card is sized for two lines. Where the break falls is a writing
    // decision made per language, so it lives in the string rather than being
    // left to the browser - and a bulletin that loses its break would silently
    // reflow into one long line or spill out of the card.
    for (const language of LANGUAGES) {
      for (const [stage, bulletin] of STRINGS[language].broadcast.entries()) {
        const lines = bulletin.line.split('\n')
        expect(lines, `${language}.${stage}`).toHaveLength(2)
        for (const line of lines) {
          expect(line.trim(), `${language}.${stage}`).toBeTruthy()
          // Headlines stay on one line, so they must not carry a break.
          expect(bulletin.headline).not.toContain('\n')
        }
      }
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

  it('opens on the sighting itself, not on the response to it', () => {
    // The first card is a news programme's first item: the event happened, and
    // the public is told to be careful. What the government sends is the next
    // card - one wave introduces one unit, and one bulletin names it.
    const opening = STRINGS.ko.broadcast[0]
    expect(opening.line).toContain('미확인 비행체')
    expect(opening.line).not.toContain('자폭 드론')
    expect(STRINGS.ja.broadcast[0].line).toContain('未確認飛行物体')
    expect(STRINGS.en.broadcast[0].line.toLowerCase()).toContain('appeared')
    // And the drones are the card after it, where their wave is.
    expect(STRINGS.ko.broadcast[1].line).toContain('자폭 드론')
    expect(STRINGS.en.broadcast[1].line.toLowerCase()).toContain('drone')
  })

  it('names each unit on the wave that brings it', () => {
    // Read off the wave table rather than pinned to a second: the bulletin has
    // to name whatever that wave actually is, whenever it happens to arrive.
    const named: [number, string, string][] = [
      [2, '헬기', 'helicopter'],
      [3, '전투기', 'fighter'],
      [4, '공중전함', 'battleship'],
    ]
    for (const [stage, korean, english] of named) {
      const at = ENEMY_WAVE_STAGES[stage]!.at
      expect(bulletinFor(STRINGS.ko, broadcastStageForTime(at)).line, korean).toContain(korean)
      expect(bulletinFor(STRINGS.en, broadcastStageForTime(at)).line.toLowerCase(), english).toContain(english)
    }
  })

  it('gets the opening card on and off air before the first wave', () => {
    // The opening report is time-triggered, not raised by a wave boundary, so
    // nothing stops it colliding with wave 1 except this margin.
    expect(BROADCAST_OPENING_AT).toBeGreaterThan(0)
    expect(BROADCAST_OPENING_AT + BROADCAST_SECONDS).toBeLessThan(ENEMY_WAVE_STAGES[1]!.at)
    // And it must still land inside the stage it reports on.
    expect(broadcastStageForTime(BROADCAST_OPENING_AT)).toBe(0)
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
