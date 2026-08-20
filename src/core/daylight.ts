/**
 * Day-to-night cycle for a run.
 *
 * The run escalates on a clock - wave stages arrive at fixed elapsed times - so
 * the sky is put on the same clock. Starting in morning light and ending in full
 * night gives the difficulty curve a visual reading the HUD cannot: you can see
 * how deep into the run you are without looking at a number.
 *
 * The cycle finishes before the run does, on purpose. The last waves are the
 * ones that need the night: a lit craft against a dark city is far easier to
 * track than one lost in a bright skyline, and additive beams and explosions
 * only read properly once the background stops competing with them.
 *
 * Pure data and scalars only - no Three.js. The render layer turns the hex
 * strings into colours and does the interpolation in linear space, so this file
 * stays testable.
 */

export type DaylightPhase = 'morning' | 'day' | 'golden' | 'dusk' | 'night'

export type DaylightColors = {
  background: string
  horizon: string
  middle: string
  top: string
  fog: string
  ambient: string
  hemiSky: string
  hemiGround: string
  sun: string
  cloud: string
}

export type DaylightKeyframe = {
  /** Position in the cycle, 0 at run start and 1 at full night. */
  at: number
  phase: DaylightPhase
  label: string
  colors: DaylightColors
  ambientIntensity: number
  hemiIntensity: number
  sunIntensity: number
  /** Radians above the horizon. Negative means set. */
  sunAltitude: number
  moonAltitude: number
  sunOpacity: number
  moonOpacity: number
  /**
   * Drives every emissive surface in the city. Lit windows, streetlights and
   * beacons are wrong in daylight, so they ramp in as this rises rather than
   * being switched on at a threshold.
   */
  nightFactor: number
  starIntensity: number
  /** Fog start/end. Night pulls the far plane in; the horizon is not visible
   *  at the distance a clear morning is. */
  fogNear: number
  fogFar: number
}

/**
 * Seconds for a full morning-to-night sweep. Shorter than the 180s run so the
 * final waves play out under a settled night sky instead of mid-transition.
 */
export const DAY_CYCLE_SECONDS = 140

export const DAYLIGHT_KEYFRAMES: DaylightKeyframe[] = [
  {
    at: 0,
    phase: 'morning',
    label: 'MORNING',
    colors: {
      background: '#a8d9d5',
      horizon: '#ffd0ac',
      middle: '#9ccbd4',
      top: '#5f8ec0',
      fog: '#a8c9c7',
      ambient: '#f2fff4',
      hemiSky: '#e2f7ef',
      hemiGround: '#c99598',
      sun: '#ffe7bd',
      cloud: '#fff1da',
    },
    ambientIntensity: 0.58,
    hemiIntensity: 0.85,
    sunIntensity: 1.45,
    sunAltitude: 0.22,
    moonAltitude: -1,
    sunOpacity: 1,
    moonOpacity: 0,
    nightFactor: 0,
    starIntensity: 0,
    fogNear: 200,
    fogFar: 700,
  },
  {
    at: 0.32,
    phase: 'day',
    label: 'MIDDAY',
    colors: {
      background: '#8fcbdc',
      horizon: '#cfe9e2',
      middle: '#89bfda',
      top: '#4f7fbe',
      fog: '#9dc4cd',
      ambient: '#f6fffb',
      hemiSky: '#dff4ff',
      hemiGround: '#b3a08f',
      sun: '#fff6d8',
      cloud: '#ffffff',
    },
    ambientIntensity: 0.66,
    hemiIntensity: 0.95,
    sunIntensity: 1.7,
    sunAltitude: 0.85,
    moonAltitude: -0.9,
    sunOpacity: 1,
    moonOpacity: 0,
    nightFactor: 0,
    starIntensity: 0,
    fogNear: 220,
    fogFar: 760,
  },
  {
    at: 0.58,
    phase: 'golden',
    label: 'SUNSET',
    colors: {
      background: '#e58a6e',
      horizon: '#ffb072',
      middle: '#d0776f',
      top: '#4a4f8f',
      fog: '#d98a70',
      ambient: '#ffd9b8',
      hemiSky: '#ffc79a',
      hemiGround: '#6b4a58',
      sun: '#ff9c4d',
      cloud: '#ffc9a1',
    },
    ambientIntensity: 0.44,
    hemiIntensity: 0.62,
    sunIntensity: 1.05,
    sunAltitude: 0.06,
    moonAltitude: -0.18,
    sunOpacity: 1,
    moonOpacity: 0.25,
    nightFactor: 0.22,
    starIntensity: 0.05,
    fogNear: 190,
    fogFar: 660,
  },
  {
    at: 0.8,
    phase: 'dusk',
    label: 'DUSK',
    colors: {
      background: '#2c2f5e',
      horizon: '#6b4a7d',
      middle: '#2f3566',
      top: '#141a3c',
      fog: '#3a3a68',
      ambient: '#9a9ad0',
      hemiSky: '#7b7cbb',
      hemiGround: '#2a2438',
      sun: '#ff7a5c',
      cloud: '#5b4d78',
    },
    ambientIntensity: 0.24,
    hemiIntensity: 0.34,
    sunIntensity: 0.55,
    sunAltitude: -0.16,
    moonAltitude: 0.2,
    sunOpacity: 0.35,
    moonOpacity: 0.8,
    nightFactor: 0.68,
    starIntensity: 0.55,
    fogNear: 170,
    fogFar: 600,
  },
  {
    at: 1,
    phase: 'night',
    label: 'NIGHT',
    colors: {
      background: '#0a1024',
      horizon: '#243a63',
      middle: '#111c3d',
      top: '#060a18',
      fog: '#152444',
      ambient: '#5d74ad',
      hemiSky: '#41598f',
      hemiGround: '#161a2c',
      sun: '#b9caff',
      cloud: '#2a3352',
    },
    ambientIntensity: 0.13,
    hemiIntensity: 0.2,
    sunIntensity: 0.3,
    sunAltitude: -0.7,
    moonAltitude: 0.72,
    sunOpacity: 0,
    moonOpacity: 1,
    nightFactor: 1,
    starIntensity: 1,
    fogNear: 150,
    fogFar: 560,
  },
]

export type DaylightSample = {
  from: DaylightKeyframe
  to: DaylightKeyframe
  /** 0..1 between `from` and `to`; the render layer uses this to mix colours. */
  blend: number
  phase: DaylightPhase
  label: string
  progress: number
  ambientIntensity: number
  hemiIntensity: number
  sunIntensity: number
  sunAltitude: number
  moonAltitude: number
  sunOpacity: number
  moonOpacity: number
  nightFactor: number
  starIntensity: number
  fogNear: number
  fogFar: number
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t
}

/** Smoothstep, so a keyframe boundary is not a visible crease in the sky. */
function ease(t: number) {
  return t * t * (3 - 2 * t)
}

export function daylightProgress(elapsed: number) {
  return Math.min(1, Math.max(0, elapsed / DAY_CYCLE_SECONDS))
}

/** Allocation-free sample holder for callers that tick every frame. */
export function createDaylightSample(): DaylightSample {
  return sampleDaylight(0)
}

/**
 * Pass `out` to reuse a sample across frames. The render loop runs this every
 * tick and the codebase avoids per-tick allocation throughout.
 */
export function sampleDaylight(elapsed: number, out?: DaylightSample): DaylightSample {
  const progress = daylightProgress(elapsed)
  let index = 0
  for (let i = 0; i < DAYLIGHT_KEYFRAMES.length - 1; i += 1) {
    if (progress >= DAYLIGHT_KEYFRAMES[i]!.at) index = i
    else break
  }
  const from = DAYLIGHT_KEYFRAMES[index]!
  const to = DAYLIGHT_KEYFRAMES[Math.min(index + 1, DAYLIGHT_KEYFRAMES.length - 1)]!
  const span = to.at - from.at
  const blend = span <= 0 ? 1 : ease(Math.min(1, Math.max(0, (progress - from.at) / span)))
  const target = out ?? ({} as DaylightSample)
  return Object.assign(target, {
    from,
    to,
    blend,
    // The label flips at the halfway point rather than easing, so the HUD reads
    // one phase name at a time.
    phase: blend < 0.5 ? from.phase : to.phase,
    label: blend < 0.5 ? from.label : to.label,
    progress,
    ambientIntensity: mix(from.ambientIntensity, to.ambientIntensity, blend),
    hemiIntensity: mix(from.hemiIntensity, to.hemiIntensity, blend),
    sunIntensity: mix(from.sunIntensity, to.sunIntensity, blend),
    sunAltitude: mix(from.sunAltitude, to.sunAltitude, blend),
    moonAltitude: mix(from.moonAltitude, to.moonAltitude, blend),
    sunOpacity: mix(from.sunOpacity, to.sunOpacity, blend),
    moonOpacity: mix(from.moonOpacity, to.moonOpacity, blend),
    nightFactor: mix(from.nightFactor, to.nightFactor, blend),
    starIntensity: mix(from.starIntensity, to.starIntensity, blend),
    fogNear: mix(from.fogNear, to.fogNear, blend),
    fogFar: mix(from.fogFar, to.fogFar, blend),
  })
}
