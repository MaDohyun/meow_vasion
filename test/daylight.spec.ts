import { describe, expect, it } from 'vitest'
import {
  DAYLIGHT_KEYFRAMES,
  DAYLIGHT_START_HOUR,
  DAY_CYCLE_SECONDS,
  createDaylightSample,
  daylightClock,
  daylightProgress,
  sampleDaylight,
} from '../src/core/daylight'

describe('evening to night cycle', () => {
  it('opens with the sun already low and ends in full night', () => {
    const start = sampleDaylight(0)
    expect(start.phase).toBe('golden')
    // Low, but still up: this is six in the evening, not dusk.
    expect(start.sunAltitude).toBeGreaterThan(0)
    expect(start.sunAltitude).toBeLessThan(0.4)
    expect(start.starIntensity).toBe(0)
    expect(start.sunOpacity).toBe(1)
    expect(start.moonOpacity).toBe(0)

    const end = sampleDaylight(DAY_CYCLE_SECONDS)
    expect(end.phase).toBe('night')
    expect(end.nightFactor).toBe(1)
    expect(end.sunOpacity).toBe(0)
    expect(end.moonOpacity).toBe(1)
  })

  it('finishes the cycle before the run does, so the last waves play at night', () => {
    // Wave 7 (COUNTER-UFO) arrives at 150s; the run target is 180s.
    expect(DAY_CYCLE_SECONDS).toBeLessThan(150)
    expect(sampleDaylight(150).nightFactor).toBe(1)
  })

  it('holds at night rather than looping back round to evening', () => {
    expect(daylightProgress(DAY_CYCLE_SECONDS * 4)).toBe(1)
    expect(sampleDaylight(600).phase).toBe('night')
  })

  it('darkens monotonically and never lights both bodies at once', () => {
    let previousNight = -1
    let previousMoon = Number.NEGATIVE_INFINITY
    for (let elapsed = 0; elapsed <= DAY_CYCLE_SECONDS; elapsed += 2) {
      const sample = sampleDaylight(elapsed)
      expect(sample.nightFactor).toBeGreaterThanOrEqual(previousNight - 1e-9)
      // The moon only ever climbs; a dip would read as it bouncing at the horizon.
      expect(sample.moonAltitude).toBeGreaterThanOrEqual(previousMoon - 1e-9)
      expect(Math.min(sample.sunOpacity, sample.moonOpacity)).toBeLessThan(0.9)
      previousNight = sample.nightFactor
      previousMoon = sample.moonAltitude
    }
  })

  it('only ever lowers the sun, because the run starts after noon', () => {
    // The cycle used to climb to a midday peak first. Starting at six means
    // the sun has nowhere to go but down, and a rise anywhere in the sweep
    // would read as the clock running backwards.
    let previous = Number.POSITIVE_INFINITY
    for (let elapsed = 0; elapsed <= DAY_CYCLE_SECONDS; elapsed += 2) {
      const altitude = sampleDaylight(elapsed).sunAltitude
      expect(altitude).toBeLessThanOrEqual(previous + 1e-9)
      previous = altitude
    }
    const night = sampleDaylight(DAY_CYCLE_SECONDS)
    expect(night.sunAltitude).toBeLessThan(0)
    expect(night.moonAltitude).toBeGreaterThan(0)
  })

  it('never shows a daylight sky', () => {
    // The whole point of moving the start: no frame of the run is a bright
    // blue afternoon. The sun is dimming from the first second.
    expect(sampleDaylight(0).sunIntensity).toBeLessThan(1.4)
    for (const keyframe of DAYLIGHT_KEYFRAMES) {
      expect(keyframe.phase).not.toBe('day')
    }
  })

  it('lights some windows from the start and only ever adds more', () => {
    // A city at six already has lights on. Opening at a flat zero made the
    // first minute the one stretch of the run with no warmth anywhere in it.
    expect(sampleDaylight(0).nightFactor).toBeGreaterThan(0)
    expect(sampleDaylight(0).nightFactor).toBeLessThan(0.2)
  })

  it('runs a city clock from six in the evening', () => {
    expect(DAYLIGHT_START_HOUR).toBe(18)
    expect(daylightClock(0)).toBe('18:00')
    expect(daylightClock(20)).toBe('18:20')
    // The sky settles at the end of the cycle; the clock keeps going to the
    // end of the run so it does not visibly freeze.
    expect(daylightClock(DAY_CYCLE_SECONDS)).toBe('20:20')
    expect(daylightClock(180)).toBe('21:00')
  })

  it('reuses a caller-supplied sample so the frame loop does not allocate', () => {
    const held = createDaylightSample()
    const returned = sampleDaylight(70, held)
    expect(returned).toBe(held)
    sampleDaylight(DAY_CYCLE_SECONDS, held)
    expect(held.phase).toBe('night')
  })

  it('keeps keyframes ordered and spanning the whole cycle', () => {
    expect(DAYLIGHT_KEYFRAMES[0]!.at).toBe(0)
    expect(DAYLIGHT_KEYFRAMES[DAYLIGHT_KEYFRAMES.length - 1]!.at).toBe(1)
    for (let index = 1; index < DAYLIGHT_KEYFRAMES.length; index += 1) {
      expect(DAYLIGHT_KEYFRAMES[index]!.at).toBeGreaterThan(DAYLIGHT_KEYFRAMES[index - 1]!.at)
    }
    for (const keyframe of DAYLIGHT_KEYFRAMES) {
      for (const hex of Object.values(keyframe.colors)) {
        expect(hex).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })
})
