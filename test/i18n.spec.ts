import { describe, expect, it } from 'vitest'
import { DEFAULT_LANGUAGE, LANGUAGES, LANGUAGE_LABELS, STRINGS } from '../src/i18n'
import { MISSION_DEBRIEF_IDS, MISSION_ORDER } from '../src/core/missions'

describe('interface languages', () => {
  it('defaults to Korean', () => {
    expect(DEFAULT_LANGUAGE).toBe('ko')
    expect(LANGUAGES[0]).toBe('ko')
  })

  it('gives every language the complete string set', () => {
    // A missing key would render as a blank label rather than an error, so the
    // shape is asserted rather than trusted.
    const reference = Object.keys(STRINGS[DEFAULT_LANGUAGE]).sort()
    for (const language of LANGUAGES) {
      expect(Object.keys(STRINGS[language]).sort()).toEqual(reference)
      for (const [key, value] of Object.entries(STRINGS[language])) {
        expect(value, `${language}.${key}`).toBeTruthy()
      }
    }
  })

  it('labels each language in its own script', () => {
    expect(LANGUAGE_LABELS.ko).toBe('한국어')
    expect(LANGUAGE_LABELS.ja).toBe('日本語')
    expect(LANGUAGE_LABELS.en).toBe('English')
  })

  it('covers every mid-run callout in every language', () => {
    // Callouts are stored as keys, so a language missing one would render as
    // undefined in the middle of the screen.
    const keys = (Object.keys(STRINGS.en) as (keyof typeof STRINGS.en)[]).filter((key) => key.startsWith('msg'))
    expect(keys.length).toBeGreaterThan(5)
    for (const language of LANGUAGES) {
      for (const key of keys) {
        const value = STRINGS[language][key]
        const rendered = typeof value === 'function'
          ? (() => {
              const invoke = value as (first: number, second?: number) => string
              return value.length >= 2 ? invoke(1, 2) : invoke(42)
            })()
          : value
        expect(rendered, `${language}.${key}`).toBeTruthy()
        expect(typeof rendered).toBe('string')
      }
    }
  })

  it('actually translates rather than copying English through', () => {
    expect(STRINGS.ko.start).not.toBe(STRINGS.en.start)
    expect(STRINGS.ja.start).not.toBe(STRINGS.en.start)
    expect(STRINGS.ko.collapsedTitle).not.toBe(STRINGS.en.collapsedTitle)
    expect(STRINGS.ko.msgCarLaunched).not.toBe(STRINGS.en.msgCarLaunched)
  })

  it('translates mission objectives and tutorial briefing copy', () => {
    expect(STRINGS.ja.mission).not.toBe(STRINGS.en.mission)
    expect(STRINGS.ja.missionCopy['visit-mystery-circle']).not.toBe(STRINGS.en.missionCopy['visit-mystery-circle'])
    expect(STRINGS.ja.tutorialMissionLead).not.toBe(STRINGS.ko.tutorialMissionLead)
    expect(STRINGS.en.tutorialBriefing[0]?.lines[0]).not.toBe(STRINGS.ko.tutorialBriefing[0]?.lines[0])
    expect(STRINGS.en.missionStageComplete(1, 2)).not.toBe(STRINGS.ko.missionStageComplete(1, 2))
  })

  it('gives every debriefed mission the general\'s words, in every language', () => {
    // A debrief freezes the game, so a missing one would freeze it over an
    // empty box with nothing to click but the same empty box.
    for (const language of LANGUAGES) {
      for (const id of MISSION_DEBRIEF_IDS) {
        const lines = STRINGS[language].missionDebrief[id]
        expect(lines.length, `${language}.${id}`).toBeGreaterThan(0)
        for (const line of lines) expect(line.trim(), `${language}.${id}`).toBeTruthy()
      }
    }
    expect(STRINGS.ko.missionDebrief['absorb-water'][0]).not.toBe(STRINGS.en.missionDebrief['absorb-water'][0])
  })

  it('names every objective on the ladder, in every language', () => {
    for (const language of LANGUAGES) {
      for (const id of MISSION_ORDER) {
        expect(STRINGS[language].missionCopy[id].trim(), `${language}.${id}`).toBeTruthy()
      }
    }
  })
})
