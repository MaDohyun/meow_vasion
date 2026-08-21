const RUN_SECONDS = 300
import { describe, expect, it } from 'vitest'
import {
  DAYLIGHT_KEYFRAMES,
  DAYLIGHT_START_HOUR,
  DAY_CYCLE_SECONDS,
  createDaylightSample,
  daylightClock,
  daylightHour,
  daylightLap,
  daylightProgress,
  sampleDaylight,
} from '../src/core/daylight'

/** Where a series turns, so a shape can be asserted rather than a direction. */
function turningPoints(read: (elapsed: number) => number) {
  const values: number[] = []
  // Exclusive of the wrap point: sampling both ends of a closed ring counts
  // the seam as a turn.
  for (let elapsed = 0; elapsed < DAY_CYCLE_SECONDS; elapsed += 1) values.push(read(elapsed))
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

describe('the turning sky', () => {
  it('opens with the sun already low and closes back on the same evening', () => {
    const start = sampleDaylight(0)
    expect(start.phase).toBe('golden')
    // Low, but still up: this is six in the evening, not dusk.
    expect(start.sunAltitude).toBeGreaterThan(0)
    expect(start.sunAltitude).toBeLessThan(0.4)
    expect(start.starIntensity).toBe(0)
    expect(start.sunOpacity).toBe(1)
    expect(start.moonOpacity).toBe(0)

    // The ring closes on the keyframe it opened with, which is what lets the
    // cycle wrap instead of stopping.
    const first = DAYLIGHT_KEYFRAMES[0]!
    const last = DAYLIGHT_KEYFRAMES[DAYLIGHT_KEYFRAMES.length - 1]!
    expect(last.phase).toBe(first.phase)
    expect(last.label).toBe(first.label)
    expect(last.nightFactor).toBeCloseTo(first.nightFactor, 6)
    expect(last.sunAltitude).toBeCloseTo(first.sunAltitude, 6)
    expect(last.colors).toEqual(first.colors)
  })

  it('runs the whole way round: evening, night, dawn, morning, noon, afternoon', () => {
    // Moving the start to evening was about reaching the dark sooner, not
    // about cutting the day in half. A sky that darkens and then sits still
    // for the last stretch has stopped telling the time.
    const labels = new Set<string>()
    for (let elapsed = 0; elapsed <= DAY_CYCLE_SECONDS; elapsed += 1) {
      labels.add(sampleDaylight(elapsed).label)
    }
    for (const label of ['EVENING', 'SUNSET', 'DUSK', 'NIGHT', 'LATE NIGHT', 'DAWN', 'MORNING', 'MIDDAY', 'AFTERNOON']) {
      expect(labels, label).toContain(label)
    }
  })

  it('gives a run two nights instead of one slow half-day', () => {
    // Halved so the light is always visibly on the move. Over a five-minute
    // run the sky goes fully dark twice.
    const nights: number[] = []
    let wasDark = false
    for (let elapsed = 0; elapsed <= RUN_SECONDS; elapsed += 1) {
      const dark = sampleDaylight(elapsed).nightFactor > 0.9
      if (dark && !wasDark) nights.push(elapsed)
      wasDark = dark
    }
    expect(nights.length).toBe(2)
    expect(DAY_CYCLE_SECONDS * 2).toBe(RUN_SECONDS)
  })

  it('wraps instead of stopping, and shows the same sky each lap', () => {
    // A cycle that ended at noon had to either sit still for the rest of the
    // run or snap back. Carrying it through the afternoon closes the ring.
    expect(daylightProgress(DAY_CYCLE_SECONDS)).toBe(0)
    expect(daylightProgress(DAY_CYCLE_SECONDS * 4)).toBe(0)
    for (const offset of [0, 17, 61, 133]) {
      const first = sampleDaylight(offset)
      const second = sampleDaylight(offset + DAY_CYCLE_SECONDS * 3)
      expect(second.label, `${offset}s`).toBe(first.label)
      expect(second.nightFactor).toBeCloseTo(first.nightFactor, 6)
    }
  })

  it('darkens once per lap and never lights both bodies at once', () => {
    // One night per turn, not several. A full day now falls to dark and comes
    // back to light, so the series turns exactly twice - the trough at night
    // and the peak at noon. Anything more is the sky flickering between states
    // rather than turning.
    expect(turningPoints((elapsed) => sampleDaylight(elapsed).nightFactor)).toBe(2)
    expect(turningPoints((elapsed) => sampleDaylight(elapsed).starIntensity)).toBeLessThanOrEqual(2)
    for (let elapsed = 0; elapsed <= DAY_CYCLE_SECONDS; elapsed += 1) {
      const sample = sampleDaylight(elapsed)
      expect(Math.min(sample.sunOpacity, sample.moonOpacity), `${elapsed}s`).toBeLessThan(0.9)
    }
  })

  it('sets the sun once and raises it once per lap', () => {
    // Down through the night, up over the day, and starting down again as the
    // ring closes: two turns for one whole day.
    expect(turningPoints((elapsed) => sampleDaylight(elapsed).sunAltitude)).toBe(2)
    expect(sampleDaylight(DAY_CYCLE_SECONDS * 0.4).sunAltitude).toBeLessThan(0)
    expect(sampleDaylight(DAY_CYCLE_SECONDS * 0.8).sunAltitude).toBeGreaterThan(0)
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

  it('runs a city clock from six in the evening round the whole day', () => {
    expect(DAYLIGHT_START_HOUR).toBe(18)
    expect(daylightClock(0)).toBe('18:00')
    // A full lap is a full day, so the clock comes back to where it started.
    expect(daylightClock(DAY_CYCLE_SECONDS - 0.001)).toBe('17:59')
    expect(daylightClock(DAY_CYCLE_SECONDS)).toBe('18:00')
  })

  it('reads the clock off the sky rather than off a fixed rate', () => {
    // The cycle is not evenly paced - night takes a third of the run on its
    // own - so a clock ticking at a constant rate would put a morning time on
    // a screen that is plainly still dark.
    // The closing keyframe is the opening one seen from the far side of the
    // ring, so its hour reads as zero rather than twenty-four.
    for (const keyframe of DAYLIGHT_KEYFRAMES.slice(0, -1)) {
      const elapsed = keyframe.at * DAY_CYCLE_SECONDS
      expect(daylightHour(elapsed), keyframe.label).toBeCloseTo(keyframe.hour, 5)
    }
    const closing = DAYLIGHT_KEYFRAMES[DAYLIGHT_KEYFRAMES.length - 1]!
    expect(closing.hour).toBe(24)
    expect(daylightHour(DAY_CYCLE_SECONDS)).toBe(0)
    // Time only moves forward inside a lap. Across laps it starts over, which
    // is a new day rather than the clock running backwards.
    let previous = -1
    for (let elapsed = 0; elapsed < DAY_CYCLE_SECONDS; elapsed += 1) {
      const hour = daylightHour(elapsed)
      expect(hour).toBeGreaterThanOrEqual(previous - 1e-9)
      previous = hour
    }
    expect(daylightLap(0)).toBe(0)
    expect(daylightLap(DAY_CYCLE_SECONDS * 1.5)).toBe(1)
  })

  it('fits two whole laps into a run', () => {
    // RUN_SECONDS in GameContext, kept as a literal rather than importing a
    // React module into a data test. Whole laps matter: a partial one would
    // end the run mid-transition.
    expect(RUN_SECONDS).toBe(300)
    expect(RUN_SECONDS % DAY_CYCLE_SECONDS).toBe(0)
  })

  it('reuses a caller-supplied sample so the frame loop does not allocate', () => {
    const held = createDaylightSample()
    const returned = sampleDaylight(70, held)
    expect(returned).toBe(held)
    sampleDaylight(DAY_CYCLE_SECONDS * 0.8, held)
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
