import { describe, expect, it } from 'vitest'
import { LANGUAGES, STRINGS } from '../src/i18n'
import { endingForTimeUp, isVictory, type RunEnding } from '../src/core/ending'
import { shouldCrashFromOverload } from '../src/core/overload'

describe('how a run is reported', () => {
  it('splits the clock running out by whether the mission was finished', () => {
    expect(endingForTimeUp(true)).toBe('recon')
    expect(endingForTimeUp(false)).toBe('missionFailed')
  })

  it('counts only the finished recon as a win', () => {
    expect(isVictory('recon')).toBe(true)
    // Flying the whole window is the price of entry, not the prize.
    expect(isVictory('missionFailed')).toBe(false)
    expect(isVictory('downed')).toBe(false)
    // Going down under the load is still going down.
    expect(isVictory('crushed')).toBe(false)
  })

  it('gives every ending its own words, in every language', () => {
    const endings: RunEnding[] = ['recon', 'missionFailed', 'downed', 'crushed']
    for (const language of LANGUAGES) {
      const t = STRINGS[language]
      const copy = {
        recon: [t.survivedTitle, t.survivedLead],
        missionFailed: [t.missionFailedTitle, t.missionFailedLead],
        downed: [t.collapsedTitle, t.collapsedLead],
        crushed: [t.crushedTitle, t.crushedLead],
      }
      for (const ending of endings) {
        for (const line of copy[ending]) expect(line.trim().length).toBeGreaterThan(0)
      }
      // Outlasting the clock without the mission must not read as a shoot-down,
      // and neither must riding your own haul into the ground.
      expect(new Set(endings.flatMap((ending) => copy[ending])).size).toBe(endings.length * 2)
    }
  })

  it('says the load was what came down, not the city', () => {
    // The crash the overload rule fires is the one the crushed screen reports,
    // so its words have to name the weight rather than an attacker.
    expect(shouldCrashFromOverload(true, 12, 10, 1)).toBe(true)
    for (const language of LANGUAGES) {
      const t = STRINGS[language]
      const said = `${t.crushedTitle} ${t.crushedLead}`
      expect(said).not.toBe(`${t.collapsedTitle} ${t.collapsedLead}`)
      expect(/무게|重|weight|outweigh|load/i.test(said)).toBe(true)
    }
  })
})
