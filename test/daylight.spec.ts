import { describe, expect, it } from 'vitest'
import {
  DAYLIGHT_KEYFRAMES,
  DAYLIGHT_START_HOUR,
  DAY_CYCLE_SECONDS,
  createDaylightSample,
  daylightClock,
  daylightHour,
  daylightProgress,
  sampleDaylight,
} from '../src/core/daylight'

/** Where a series turns, so a shape can be asserted rather than a direction. */
function turningPoints(read: (elapsed: number) => number) {
  const values: number[] = []
  for (let elapsed = 0; elapsed <= DAY_CYCLE_SECONDS; elapsed += 1) values.push(read(elapsed))
  let turns = 0
  let direction = 0
  for (let index = 1; index < values.length; index += 1) {
    const delta = values[index]! - values[index - 1]!
    if (Math.abs(delta) < 1e-6) continue
    const next = delta > 0 ? 1 : -1
    if (direction !== 0 && next !== direction) turns += 1
    direction = next
  }
  return turns
}

describe('evening to noon cycle', () => {
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
    expect(end.phase).toBe('day')
    expect(end.nightFactor).toBe(0)
    expect(end.sunOpacity).toBe(1)
    expect(end.moonOpacity).toBe(0)
  })

  it('runs the whole way round: evening, night, dawn, morning, noon', () => {
    // Moving the start to evening was about reaching the dark sooner, not
    // about cutting the day in half. A sky that darkens and then sits still
    // for the last stretch has stopped telling the time.
    const labels = new Set<string>()
    for (let elapsed = 0; elapsed <= DAY_CYCLE_SECONDS; elapsed += 1) {
      labels.add(sampleDaylight(elapsed).label)
    }
    for (const label of ['EVENING', 'SUNSET', 'DUSK', 'NIGHT', 'LATE NIGHT', 'DAWN', 'MORNING', 'MIDDAY']) {
      expect(labels, label).toContain(label)
    }
  })

  it('holds the middle third of the run at full night', () => {
    // Waves three, four and five arrive at 70s, 90s and 110s, and all of them
    // are meant to land in the dark.
    for (const elapsed of [70, 90, 110]) {
      expect(sampleDaylight(elapsed).nightFactor, `${elapsed}s`).toBeGreaterThan(0.95)
    }
  })

  it('brings the sun up as the final wave arrives', () => {
    // Wave 7 (COUNTER-UFO) is at 150s. The last assault and the sunrise are
    // supposed to be the same moment.
    const finalWave = sampleDaylight(150)
    expect(finalWave.phase).toBe('dawn')
    expect(finalWave.nightFactor).toBeLessThan(0.95)
    expect(finalWave.sunAltitude).toBeGreaterThan(sampleDaylight(120).sunAltitude)
  })

  it('holds at noon rather than looping back round to evening', () => {
    expect(daylightProgress(DAY_CYCLE_SECONDS * 4)).toBe(1)
    expect(sampleDaylight(600).phase).toBe('day')
  })

  it('darkens once and lightens once, and never lights both bodies at once', () => {
    // One peak, not several. The cycle turns exactly where the sun does, so
    // more than one turn means the sky is flickering between states.
    expect(turningPoints((elapsed) => sampleDaylight(elapsed).nightFactor)).toBe(1)
    expect(turningPoints((elapsed) => sampleDaylight(elapsed).moonAltitude)).toBe(1)
    expect(turningPoints((elapsed) => sampleDaylight(elapsed).starIntensity)).toBe(1)
    // The sun and moon trade places twice now - at dusk and again at dawn - so
    // this gets checked on both handovers.
    for (let elapsed = 0; elapsed <= DAY_CYCLE_SECONDS; elapsed += 1) {
      const sample = sampleDaylight(elapsed)
      expect(Math.min(sample.sunOpacity, sample.moonOpacity), `${elapsed}s`).toBeLessThan(0.9)
    }
  })

  it('sets the sun once and raises it once', () => {
    // It used to climb to a midday peak and set. Starting at six inverts that:
    // one trough, no second dip.
    expect(turningPoints((elapsed) => sampleDaylight(elapsed).sunAltitude)).toBe(1)
    expect(sampleDaylight(DAY_CYCLE_SECONDS * 0.5).sunAltitude).toBeLessThan(0)
    expect(sampleDaylight(DAY_CYCLE_SECONDS).sunAltitude).toBeGreaterThan(0)
  })

  it('opens on evening rather than on daylight', () => {
    // The first frames must not be a bright blue afternoon; that was the whole
    // reason for moving the start.
    expect(sampleDaylight(0).sunIntensity).toBeLessThan(1.4)
    expect(sampleDaylight(0).phase).toBe('golden')
    expect(sampleDaylight(DAY_CYCLE_SECONDS * 0.15).nightFactor).toBeGreaterThan(0.2)
  })

  it('lights some windows from the start and only ever adds more', () => {
    // A city at six already has lights on. Opening at a flat zero made the
    // first minute the one stretch of the run with no warmth anywhere in it.
    expect(sampleDaylight(0).nightFactor).toBeGreaterThan(0)
    expect(sampleDaylight(0).nightFactor).toBeLessThan(0.2)
  })

  it('runs a city clock from six in the evening round to noon', () => {
    expect(DAYLIGHT_START_HOUR).toBe(18)
    expect(daylightClock(0)).toBe('18:00')
    expect(daylightClock(DAY_CYCLE_SECONDS)).toBe('12:00')
  })

  it('reads the clock off the sky rather than off a fixed rate', () => {
    // The cycle is not evenly paced - night takes a third of the run on its
    // own - so a clock ticking at a constant rate would put a morning time on
    // a screen that is plainly still dark.
    for (const keyframe of DAYLIGHT_KEYFRAMES) {
      const elapsed = keyframe.at * DAY_CYCLE_SECONDS
      expect(daylightHour(elapsed), keyframe.label).toBeCloseTo(keyframe.hour, 5)
    }
    // Midnight is the one place it may appear to go backwards, and only
    // because the display wraps at 24.
    let previous = -1
    for (let elapsed = 0; elapsed <= DAY_CYCLE_SECONDS; elapsed += 1) {
      const hour = daylightHour(elapsed)
      expect(hour).toBeGreaterThanOrEqual(previous - 1e-9)
      previous = hour
    }
  })

  it('matches the cycle to the run length so noon lands as the clock runs out', () => {
    // RUN_SECONDS in GameContext. Kept as a literal here rather than importing
    // a React module into a data test.
    expect(DAY_CYCLE_SECONDS).toBe(180)
  })

  it('reuses a caller-supplied sample so the frame loop does not allocate', () => {
    const held = createDaylightSample()
    const returned = sampleDaylight(70, held)
    expect(returned).toBe(held)
    sampleDaylight(DAY_CYCLE_SECONDS, held)
    expect(held.phase).toBe('day')
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
