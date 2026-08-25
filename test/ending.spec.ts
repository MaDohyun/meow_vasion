import { describe, expect, it } from 'vitest'
import { LANGUAGES, STRINGS } from '../src/i18n'
import { endingForTimeUp, isVictory, type RunEnding } from '../src/core/ending'

const ENDINGS: RunEnding[] = ['recon', 'missionFailed', 'downed']

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
  })

  it('leaves being shot down as the only ending that stops the run early', () => {
    // The overload crash is gone. The sinking that led to it is not - an
    // overloaded craft still loses its climb and rides down - it simply has no
    // floor that ends the run any more. Pinning the list keeps a fourth screen
    // from creeping back in without the ending copy and the general's word for
    // it.
    expect(ENDINGS).toHaveLength(3)
    expect(ENDINGS.filter((ending) => !['recon', 'missionFailed'].includes(ending))).toEqual(['downed'])
  })

  it('gives every ending its own words, in every language', () => {
    for (const language of LANGUAGES) {
      const t = STRINGS[language]
      const copy = {
        recon: [t.survivedTitle, t.survivedLead],
        missionFailed: [t.missionFailedTitle, t.missionFailedLead],
        downed: [t.collapsedTitle, t.collapsedLead],
      }
      for (const ending of ENDINGS) {
        for (const line of copy[ending]) expect(line.trim().length).toBeGreaterThan(0)
      }
      // Outlasting the clock without the mission must not read as a shoot-down.
      expect(new Set(ENDINGS.flatMap((ending) => copy[ending])).size).toBe(ENDINGS.length * 2)
    }
  })

  it('lets the general sign off on every ending, in every language', () => {
    // He gives the orders at the start of the run, so he grades them at the
    // end of it - including the two he is not happy about.
    for (const language of LANGUAGES) {
      const remarks = ENDINGS.map((ending) => STRINGS[language].endingRemark[ending])
      for (const remark of remarks) expect(remark.trim().length, language).toBeGreaterThan(0)
      expect(new Set(remarks).size, language).toBe(ENDINGS.length)
    }
    expect(STRINGS.ko.endingRemark.recon).not.toBe(STRINGS.en.endingRemark.recon)
  })
})
