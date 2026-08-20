import { describe, expect, it } from 'vitest'
import { DEFAULT_LANGUAGE, LANGUAGES, LANGUAGE_LABELS, STRINGS } from '../src/i18n'

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
        const rendered = typeof value === 'function' ? value(42) : value
        expect(rendered, `${language}.${key}`).toBeTruthy()
        expect(typeof rendered).toBe('string')
      }
    }
  })

  it('actually translates rather than copying English through', () => {
    expect(STRINGS.ko.start).not.toBe(STRINGS.en.start)
    expect(STRINGS.ja.start).not.toBe(STRINGS.en.start)
    expect(STRINGS.ko.collapsedTitle).not.toBe(STRINGS.en.collapsedTitle)
    expect(STRINGS.ko.msgImpact).not.toBe(STRINGS.en.msgImpact)
  })
})
