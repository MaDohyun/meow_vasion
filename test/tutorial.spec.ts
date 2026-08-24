import { describe, expect, it } from 'vitest'
import { beamProfile, isInsideBeam, type BeamField } from '../src/core/beam'
import { TUTORIAL_CAT, TUTORIAL_SPAWN } from '../src/core/world'
import { LANGUAGES, STRINGS, type TutorialControl } from '../src/i18n'

/** The beam as it stands the moment the tutorial hands E over: no upgrades
 *  bought, no turbo, the craft parked where it spawned. */
function openingBeam(boosting = false): BeamField {
  return {
    active: true,
    boosting,
    position: { ...TUTORIAL_SPAWN },
    velocity: { x: 0, y: 0, z: 0 },
    radiusScale: 1,
    reachScale: 1,
    gripStrength: 1,
    colliders: [],
  }
}

function gapToCat() {
  return Math.hypot(TUTORIAL_SPAWN.x - TUTORIAL_CAT.x, TUTORIAL_SPAWN.z - TUTORIAL_CAT.z)
}

describe('the opening park', () => {
  it('parks the craft back from the cat, but never out of beam reach', () => {
    // The craft used to hover almost on top of the cat, which hid the one
    // thing the tutorial is pointing at under the hull. Backing off is only
    // safe while the cone still covers the cat: a cat the beam cannot touch is
    // a tutorial nobody can finish, and flight is locked until it is aboard.
    expect(gapToCat()).toBeGreaterThan(4.5)
    expect(isInsideBeam({ position: { ...TUTORIAL_CAT } }, openingBeam())).toBe(true)
  })

  it('leaves real margin at that gap rather than sitting on the cone edge', () => {
    // Measured against the cone rather than against a copy of the numbers, so
    // retuning beamProfile moves this test with it.
    const profile = beamProfile(false, 1, 1)
    const drop = TUTORIAL_SPAWN.y - TUTORIAL_CAT.y
    const reach = profile.baseRadius + drop * profile.coneSpread
    expect(drop).toBeLessThan(profile.maxDrop)
    expect(reach - gapToCat()).toBeGreaterThan(1)
  })

  it('keeps hold of the cat all the way up, however the cone narrows', () => {
    // The cone is at its widest at the cat's altitude and narrows as the cat
    // rises, so a gap inside the cone at ground level can be outside it
    // halfway up. The beam does not let go - grip lapses only once the beam is
    // off - but the tutorial should not need that rule to work, so the gap
    // stays inside even the narrowest ring the cat passes through.
    const profile = beamProfile(false, 1, 1)
    expect(profile.baseRadius).toBeGreaterThan(gapToCat())
  })
})

describe('what the briefing promises about turbo', () => {
  it('really does make the beam wider, longer and stronger', () => {
    // The general tells the pilot to hold E with turbo on. If that stopped
    // being true the tutorial would be teaching a lie.
    const plain = beamProfile(false, 1, 1)
    const boosted = beamProfile(true, 1, 1)
    expect(boosted.baseRadius).toBeGreaterThan(plain.baseRadius)
    expect(boosted.coneSpread).toBeGreaterThan(plain.coneSpread)
    expect(boosted.maxDrop).toBeGreaterThan(plain.maxDrop)
    expect(boosted.spring).toBeGreaterThan(plain.spring)
    expect(boosted.response).toBeGreaterThan(plain.response)
  })

  it('reaches the cat with turbo on too', () => {
    expect(isInsideBeam({ position: { ...TUTORIAL_CAT } }, openingBeam(true))).toBe(true)
  })
})

describe('the briefing script', () => {
  const reference = STRINGS.en.tutorialBriefing

  it('teaches the laser and turbo by hand before asking for the cat', () => {
    // Order matters: the cat step is the tutorial's gate, and anything taught
    // after it is taught to a player who has already left the park.
    const waits = reference.map((step) => step.wait).filter(Boolean)
    expect(waits).toEqual(['laser', 'turbo', 'beam'])
  })

  it('keeps every language on the same script', () => {
    // A translation that drops a hands-on step leaves that control locked for
    // the whole tutorial, since the step is what unlocks it.
    for (const language of LANGUAGES) {
      const steps = STRINGS[language].tutorialBriefing
      expect(steps, language).toHaveLength(reference.length)
      steps.forEach((step, index) => {
        expect(step.wait, `${language}.${index}.wait`).toBe(reference[index]!.wait)
        expect(step.auto, `${language}.${index}.auto`).toBe(reference[index]!.auto)
        expect(step.lines.length, `${language}.${index}.lines`).toBeGreaterThan(0)
        for (const line of step.lines) expect(line.trim(), `${language}.${index}`).toBeTruthy()
      })
    }
  })

  it('names the key on every hands-on step, in every language', () => {
    // A step that waits and does not say what for is the tutorial complaint
    // this whole change is answering.
    const controls: TutorialControl[] = ['beam', 'laser', 'turbo']
    for (const language of LANGUAGES) {
      for (const control of controls) {
        expect(STRINGS[language].briefingWaitHint[control], `${language}.${control}`).toBeTruthy()
      }
    }
  })

  it('never leaves a step that can neither be clicked, waited out nor acted on', () => {
    for (const language of LANGUAGES) {
      for (const [index, step] of STRINGS[language].tutorialBriefing.entries()) {
        const stuck = step.wait && step.auto
        expect(stuck, `${language}.${index}`).toBeFalsy()
      }
    }
  })
})
