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
import { BATTLESHIP_LAUNCH_SECONDS } from '../src/core/enemies'

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
  it('opens in the dark and closes back on the same night', () => {
    const start = sampleDaylight(0)
    expect(start.phase).toBe('night')
    // Sun well down, moon and stars up: the run starts after nightfall.
    expect(start.sunAltitude).toBeLessThan(-0.4)
    expect(start.starIntensity).toBeGreaterThan(0.9)
    expect(start.sunOpacity).toBeLessThan(0.1)
    expect(start.moonOpacity).toBeGreaterThan(0.9)

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

  it('runs the whole way round: night, dawn, morning, noon, afternoon, dusk', () => {
    // Opening in the dark was about the first and last frames, not about
    // cutting the day out. A sky that darkens and then sits still for the last
    // stretch has stopped telling the time.
    const labels = new Set<string>()
    for (let elapsed = 0; elapsed <= DAY_CYCLE_SECONDS; elapsed += 1) {
      labels.add(sampleDaylight(elapsed).label)
    }
    for (const label of ['EVENING', 'SUNSET', 'DUSK', 'NIGHT', 'LATE NIGHT', 'DAWN', 'MORNING', 'MIDDAY', 'AFTERNOON']) {
      expect(labels, label).toContain(label)
    }
  })

  it('spends one day between two dark ends rather than idling in either', () => {
    // Dark, then a whole day, then dark again - and the light visibly on the
    // move the entire time in between.
    let dark = 0
    let light = 0
    for (let elapsed = 0; elapsed <= RUN_SECONDS; elapsed += 1) {
      const night = sampleDaylight(elapsed).nightFactor
      if (night > 0.9) dark += 1
      if (night < 0.1) light += 1
    }
    expect(dark).toBeGreaterThan(RUN_SECONDS * 0.3)
    expect(light).toBeGreaterThan(RUN_SECONDS * 0.05)
    // Exactly one stretch of daylight, in the middle: the ring is one lap now,
    // so a second one would mean the sky is turning twice as fast as intended.
    let spells = 0
    let wasLight = false
    for (let elapsed = 0; elapsed <= RUN_SECONDS; elapsed += 1) {
      const isLight = sampleDaylight(elapsed).nightFactor < 0.1
      if (isLight && !wasLight) spells += 1
      wasLight = isLight
    }
    expect(spells).toBe(1)
  })

  it('spends the longest stretch of a lap getting darker, not sitting dark', () => {
    // The ask was for night to have room to deepen. NIGHT already looks like
    // night, so the walk on to LATE NIGHT has to be the widest span in the
    // cycle and has to keep dropping the whole way rather than flattening out.
    const spans = DAYLIGHT_KEYFRAMES.slice(1).map((keyframe, index) => ({
      label: keyframe.label,
      width: keyframe.at - DAYLIGHT_KEYFRAMES[index]!.at,
    }))
    const widest = spans.reduce((best, span) => (span.width > best.width ? span : best))
    // The closing night: from nightfall to the end of the run, a third of the
    // lap on its own, and the whole boss fight is inside it.
    expect(widest.label).toBe('NIGHT')
    expect(widest.width).toBeGreaterThan(0.3)

    const nightfall = DAYLIGHT_KEYFRAMES.filter((keyframe) => keyframe.label === 'NIGHT')[1]!
    const seam = DAYLIGHT_KEYFRAMES[DAYLIGHT_KEYFRAMES.length - 1]!
    expect(seam.ambientIntensity).toBeLessThan(nightfall.ambientIntensity * 0.6)
    expect(seam.hemiIntensity).toBeLessThan(nightfall.hemiIntensity * 0.6)
    expect(seam.fogFar).toBeLessThan(nightfall.fogFar)
    // And it is falling the whole way, not arriving dark and holding.
    let previous = Number.POSITIVE_INFINITY
    for (let at = nightfall.at; at <= 1 + 1e-9; at += 0.01) {
      const ambient = sampleDaylight(Math.min(at, 1) * DAY_CYCLE_SECONDS).ambientIntensity
      expect(ambient).toBeLessThanOrEqual(previous + 1e-9)
      previous = ambient
    }
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
    expect(sampleDaylight(DAY_CYCLE_SECONDS * 0.35).sunAltitude).toBeGreaterThan(0)
    expect(sampleDaylight(DAY_CYCLE_SECONDS * 0.8).sunAltitude).toBeLessThan(0)
  })

  it('opens on night rather than on daylight', () => {
    // The first frames must not be a bright blue afternoon; that was the whole
    // reason for moving the start, twice.
    expect(sampleDaylight(0).sunIntensity).toBeLessThan(0.4)
    expect(sampleDaylight(0).phase).toBe('night')
    expect(sampleDaylight(DAY_CYCLE_SECONDS * 0.12).nightFactor).toBeGreaterThan(0.9)
  })

  it('opens with the city already fully lit', () => {
    // Every window, streetlight and beacon is driven off nightFactor, and the
    // run opens after dark, so they are all on from the first frame.
    expect(sampleDaylight(0).nightFactor).toBeGreaterThan(0.9)
  })

  it('runs a city clock from nine at night round the whole day', () => {
    expect(DAYLIGHT_START_HOUR).toBe(21)
    expect(daylightClock(0)).toBe('21:00')
    // A full lap is a full day, so the clock comes back to where it started.
    expect(daylightClock(DAY_CYCLE_SECONDS - 0.001)).toBe('20:59')
    expect(daylightClock(DAY_CYCLE_SECONDS)).toBe('21:00')
  })

  it('reads the clock off the sky rather than off a fixed rate', () => {
    // The cycle is not evenly paced - the closing night takes a third of the
    // run on its own - so a clock ticking at a constant rate would put a
    // morning time on a screen that is plainly still dark.
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

  it('ends the run on the darkest sky it has', () => {
    // RUN_SECONDS in GameContext, kept as a literal rather than importing a
    // React module into a data test. The sky turns a shade faster than the run
    // so the last frame carries past the ring's seam and lands on the floor of
    // the night rather than back on the sky the run opened with.
    expect(RUN_SECONDS).toBe(300)
    expect(DAY_CYCLE_SECONDS).toBeLessThan(RUN_SECONDS)
    expect(daylightLap(RUN_SECONDS)).toBe(1)

    const floor = DAYLIGHT_KEYFRAMES.reduce((best, keyframe) =>
      (keyframe.ambientIntensity < best.ambientIntensity ? keyframe : best))
    const ending = sampleDaylight(RUN_SECONDS)
    expect(floor.label).toBe('LATE NIGHT')
    expect(ending.label).toBe('LATE NIGHT')
    expect(ending.ambientIntensity).toBeCloseTo(floor.ambientIntensity, 6)
    expect(ending.nightFactor).toBeCloseTo(1, 6)
    expect(ending.starIntensity).toBeCloseTo(1, 6)
    // Darker than the sky it opened on, which was already night.
    expect(ending.ambientIntensity).toBeLessThan(sampleDaylight(0).ambientIntensity)

    // The dreadnought launches on the nightfall keyframe itself - read off the
    // wave table, because that pinning is the thing under test - and the fight
    // from there to the end only ever gets darker.
    expect(BATTLESHIP_LAUNCH_SECONDS).toBe(160)
    const boss = sampleDaylight(BATTLESHIP_LAUNCH_SECONDS)
    expect(boss.phase).toBe('night')
    expect(boss.label).toBe('NIGHT')
    expect(boss.nightFactor).toBeGreaterThan(0.9)
    let previous = Number.POSITIVE_INFINITY
    for (let elapsed = BATTLESHIP_LAUNCH_SECONDS; elapsed <= RUN_SECONDS; elapsed += 2) {
      const sample = sampleDaylight(elapsed)
      expect(sample.phase, `${elapsed}s`).toBe('night')
      expect(sample.ambientIntensity, `${elapsed}s`).toBeLessThanOrEqual(previous + 1e-9)
      previous = sample.ambientIntensity
    }
  })

  it('reuses a caller-supplied sample so the frame loop does not allocate', () => {
    const held = createDaylightSample()
    const returned = sampleDaylight(70, held)
    expect(returned).toBe(held)
    sampleDaylight(DAY_CYCLE_SECONDS * 0.35, held)
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
