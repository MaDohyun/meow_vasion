import { describe, expect, it } from 'vitest'
import { DEFAULT_LANGUAGE, LANGUAGES, LANGUAGE_LABELS, STRINGS } from '../src/i18n'
import { GENERAL_WORD_IDS, MISSION_ORDER, MISSION_RUN_SECONDS } from '../src/core/missions'
import { LAKE_CELL_CAPACITY_MAX, LAKE_CELL_CAPACITY_MIN } from '../src/core/lakes'

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
    expect(STRINGS.ko.msgVehicleDestroyed(50)).not.toBe(STRINGS.en.msgVehicleDestroyed(50))
  })

  it('states the lobby standing order in every language, and states it truthfully', () => {
    // The order names a number of minutes. If the run length is ever retuned
    // the lobby would keep promising the old one, so the copy is checked
    // against the clock rather than against itself.
    const minutes = MISSION_RUN_SECONDS / 60
    expect(Number.isInteger(minutes)).toBe(true)
    for (const language of LANGUAGES) {
      expect(STRINGS[language].lobbyOrdersTag).toBeTruthy()
      expect(STRINGS[language].lobbyOrders).toContain(String(minutes))
    }
    expect(STRINGS.ko.lobbyOrders).not.toBe(STRINGS.en.lobbyOrders)
    expect(STRINGS.ja.lobbyOrders).not.toBe(STRINGS.en.lobbyOrders)
  })

  it('translates mission objectives and tutorial briefing copy', () => {
    expect(STRINGS.ja.mission).not.toBe(STRINGS.en.mission)
    expect(STRINGS.ja.missionCopy['visit-mystery-circle']).not.toBe(STRINGS.en.missionCopy['visit-mystery-circle'])
    expect(STRINGS.ja.tutorialMissionLead).not.toBe(STRINGS.ko.tutorialMissionLead)
    expect(STRINGS.en.tutorialBriefing[0]?.lines[0]).not.toBe(STRINGS.ko.tutorialBriefing[0]?.lines[0])
    expect(STRINGS.en.missionStageComplete(1, 2)).not.toBe(STRINGS.ko.missionStageComplete(1, 2))
  })

  it('gives every debrief and field advisory the general\'s words, in every language', () => {
    // Either one freezes the game, so a missing one would freeze it over an
    // empty box with nothing to click but the same empty box.
    expect(GENERAL_WORD_IDS).toContain('drone-mine')
    expect(GENERAL_WORD_IDS).toContain('battleship-down')
    for (const language of LANGUAGES) {
      for (const id of GENERAL_WORD_IDS) {
        const lines = STRINGS[language].missionDebrief[id]
        expect(lines.length, `${language}.${id}`).toBeGreaterThan(0)
        for (const line of lines) expect(line.trim(), `${language}.${id}`).toBeTruthy()
      }
    }
    expect(STRINGS.ko.missionDebrief['absorb-water'][0]).not.toBe(STRINGS.en.missionDebrief['absorb-water'][0])
    expect(STRINGS.ko.missionDebrief['drone-mine'][0]).not.toBe(STRINGS.ja.missionDebrief['drone-mine'][0])
  })

  it('gives the fleet a victory order and Earth a breaking loss report', () => {
    for (const language of LANGUAGES) {
      const fleet = STRINGS[language].missionDebrief['battleship-down'].join(' ')
      const earth = STRINGS[language].broadcast.at(-1)!
      expect(fleet, `${language}: fleet report`).toBeTruthy()
      expect(earth.headline, `${language}: Earth headline`).toBeTruthy()
    }
    expect(STRINGS.ko.missionDebrief['battleship-down'].join(' ')).toContain('지구의 마지막 저항이 꺾였다')
    expect(STRINGS.ko.missionDebrief['battleship-down'].join(' ')).toContain('남은 연료를 다 쓸 때까지')
    expect(STRINGS.ko.broadcast.at(-1)!.headline).toBe('공중전함 격추 · 최종 방어선 붕괴')
    expect(STRINGS.ko.broadcast.at(-1)!.line).toContain('막을 수단은… 남아 있지 않습니다')
    expect(STRINGS.en.missionDebrief['battleship-down'].join(' ').toLowerCase()).toContain('last resistance')
    expect(STRINGS.en.broadcast.at(-1)!.headline).toContain('COLLAPSES')
  })

  it('tells the drone-mine warning the same way in all three languages', () => {
    // The warning exists to name the beam's one exception and the safe order
    // around it: laser first, beam after. It must name the visible controls,
    // and it must not resurrect the old behaviour where the beam pulled the
    // mine into the craft instead of lighting its fuse in place.
    for (const language of LANGUAGES) {
      const lines = STRINGS[language].missionDebrief['drone-mine'].join(' ')
      expect(lines, `${language}: laser`).toMatch(/Q/)
      expect(lines, `${language}: beam`).toMatch(/W/)
      // And the part that must not be skimmed past is marked for RichText.
      expect(lines, `${language}: emphasis`).toMatch(/\[\[.+\]\]/)
    }
  })

  /** Every rendered string in one language, flattened - the term guards below
   *  have to see the debriefs and bulletins too, not just the flat labels. */
  function everyString(language: (typeof LANGUAGES)[number]) {
    const out: string[] = []
    const walk = (value: unknown) => {
      if (typeof value === 'string') out.push(value)
      else if (typeof value === 'function') out.push(String((value as (n: number) => string)(1)))
      else if (Array.isArray(value)) value.forEach(walk)
      else if (value && typeof value === 'object') Object.values(value).forEach(walk)
    }
    walk(STRINGS[language])
    return out
  }

  it('calls the five hearts life, and never the hull', () => {
    // The gauge had two names - 선체/船体/HULL on the hazard lines and the heal
    // callouts, 생명력/ライフ/life in the general's debrief - so the same pickup
    // read as repairing one thing and refilling another. "Hull" is retired:
    // the craft's body only ever grows, and growth is not what a heart shows.
    const retired: Record<string, RegExp> = { ko: /선체/, ja: /船体/, en: /\bhull\b/i }
    for (const language of LANGUAGES) {
      for (const line of everyString(language)) {
        expect(line, `${language}: "${line}"`).not.toMatch(retired[language]!)
      }
    }
    expect(STRINGS.ko.life).toBe('생명력')
    expect(STRINGS.ja.life).toBe('ライフ')
    expect(STRINGS.en.life).toBe('LIFE')
  })

  it('gives the final wave one ship name in each language', () => {
    // English had four: SKY DREADNOUGHT, Dreadnought, BATTLESHIP and "a flying
    // battleship" - two of them inside the same bulletin card.
    const named: Record<string, RegExp> = { ko: /공중전함/, ja: /空中戦艦/, en: /battleship/i }
    for (const language of LANGUAGES) {
      const strings = STRINGS[language]
      const boss = named[language]!
      for (const line of [strings.bossName, strings.radarKeyBoss, strings.devDrill, strings.broadcast[4].headline, strings.broadcast[4].line]) {
        expect(line, `${language}: "${line}"`).toMatch(boss)
      }
      // The one word that must not come back, in any string of any language.
      for (const line of everyString(language)) expect(line).not.toMatch(/dreadnought/i)
    }
  })

  it('lets the general call his own ship the craft, never a UFO', () => {
    // He commands the fleet that built it. Korean had it three ways at once -
    // UFO in the briefing, 우주선 in the tutorial, 기체 everywhere else - so
    // the general's own voice is checked line by line. The word survives where
    // Earth is the one talking (the news bulletins) and in the how-to panel,
    // which addresses the player rather than the pilot.
    const retired: Record<string, RegExp> = { ko: /UFO|우주선/, ja: /UFO|宇宙船/, en: /\bUFO\b/i }
    const kept: Record<string, RegExp> = { ko: /기체/, ja: /機体/, en: /craft/i }
    for (const language of LANGUAGES) {
      const strings = STRINGS[language]
      const general = [
        strings.tutorialMissionLead,
        ...strings.tutorialBriefing.flatMap((beat) => beat.lines),
        ...GENERAL_WORD_IDS.flatMap((id) => strings.missionDebrief[id]),
        ...Object.values(strings.endingRemark),
      ]
      for (const line of general) {
        expect(line, `${language}: "${line}"`).not.toMatch(retired[language]!)
      }
      expect(general.some((line) => kept[language]!.test(line)), language).toBe(true)
    }
  })

  it('never quotes a fixed tile capacity, which no tile has', () => {
    // A tile's capacity is rolled per cell now, so any litre figure in the
    // general's script would be right about one tile and wrong about the rest.
    // He talks about what happens, not about how much.
    for (const language of LANGUAGES) {
      const lines = STRINGS[language].missionDebrief['absorb-water'].join(' ')
      for (let litres = LAKE_CELL_CAPACITY_MIN; litres <= LAKE_CELL_CAPACITY_MAX; litres += 1) {
        expect(lines, `${language} quotes ${litres}`).not.toContain(String(litres))
      }
    }
  })

  it('names every objective on the ladder, in every language', () => {
    for (const language of LANGUAGES) {
      for (const id of MISSION_ORDER) {
        expect(STRINGS[language].missionCopy[id].trim(), `${language}.${id}`).toBeTruthy()
      }
    }
  })
})
