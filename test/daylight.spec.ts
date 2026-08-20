import { describe, expect, it } from 'vitest'
import {
  DAYLIGHT_KEYFRAMES,
  DAY_CYCLE_SECONDS,
  createDaylightSample,
  daylightProgress,
  sampleDaylight,
} from '../src/core/daylight'

describe('day to night cycle', () => {
  it('starts in morning light and ends in full night', () => {
    const start = sampleDaylight(0)
    expect(start.phase).toBe('morning')
    expect(start.nightFactor).toBe(0)
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

  it('holds at night rather than looping back to morning', () => {
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

  it('arcs the sun up before it sets', () => {
    // A real morning climbs to noon first; going straight down would read as
    // the run starting at afternoon.
    const morning = sampleDaylight(0)
    const noon = sampleDaylight(DAY_CYCLE_SECONDS * 0.32)
    const night = sampleDaylight(DAY_CYCLE_SECONDS)
    expect(noon.sunAltitude).toBeGreaterThan(morning.sunAltitude)
    expect(night.sunAltitude).toBeLessThan(0)
    expect(night.moonAltitude).toBeGreaterThan(0)
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
