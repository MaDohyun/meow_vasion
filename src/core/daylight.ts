/**
 * Evening-to-night cycle for a run.
 *
 * The run escalates on a clock - wave stages arrive at fixed elapsed times - so
 * the sky is put on the same clock. You can see how deep into the run you are
 * without looking at a number.
 *
 * It starts at six in the evening, not at dawn. This game is at its best in the
 * dark: lit windows, streetlights, and additive beams and explosions all need a
 * background that has stopped competing with them. A cycle that opened in
 * morning light spent the whole first half of the run - the half where a player
 * forms their impression of the game - under a bright blue sky, and only
 * reached the good picture once they were too busy being shot at to look at it.
 * So the sun is already low when the run begins, and the arc is sunset to
 * night rather than dawn to night.
 *
 * The cycle still finishes before the run does. The last waves are the ones
 * that need full night, not a sky mid-transition.
 *
 * Pure data and scalars only - no Three.js. The render layer turns the hex
 * strings into colours and does the interpolation in linear space, so this file
 * stays testable.
 */

export type DaylightPhase = 'golden' | 'dusk' | 'night'

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
   *  at the distance it is while the sun is still up. */
  fogNear: number
  fogFar: number
}

/**
 * Seconds for a full evening-to-night sweep. Shorter than the 180s run so the
 * final waves play out under a settled night sky instead of mid-transition.
 */
export const DAY_CYCLE_SECONDS = 140

/** The hour the run opens on. */
export const DAYLIGHT_START_HOUR = 18

/** One real second is one minute of city time. Chosen so the numbers land
 *  where the design does: the sky settles into night at 20:20, which is the
 *  end of the cycle, and the run runs out at 21:00. */
export const DAYLIGHT_MINUTES_PER_SECOND = 1

/** Wall-clock time in the city, as `HH:MM`. Runs off elapsed seconds rather
 *  than off cycle progress so it keeps ticking after the sky has settled. */
export function daylightClock(elapsed: number) {
  const minutes = DAYLIGHT_START_HOUR * 60 + Math.max(0, elapsed) * DAYLIGHT_MINUTES_PER_SECOND
  const hour = Math.floor(minutes / 60) % 24
  const minute = Math.floor(minutes % 60)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export const DAYLIGHT_KEYFRAMES: DaylightKeyframe[] = [
  {
    at: 0,
    phase: 'golden',
    label: 'EVENING',
    colors: {
      background: '#c9a385',
      horizon: '#ffcf9c',
      middle: '#b79ba7',
      top: '#5c6aa6',
      fog: '#c3a396',
      ambient: '#ffeed6',
      hemiSky: '#ffe3c2',
      hemiGround: '#8f6a6a',
      sun: '#ffd79a',
      cloud: '#ffe4c6',
    },
    ambientIntensity: 0.5,
    hemiIntensity: 0.72,
    sunIntensity: 1.3,
    sunAltitude: 0.2,
    moonAltitude: -0.55,
    sunOpacity: 1,
    moonOpacity: 0,
    // The city is already switching its lights on at six. Starting at a flat
    // zero would make the first minute the only one with no warmth in it.
    nightFactor: 0.09,
    starIntensity: 0,
    fogNear: 200,
    fogFar: 700,
  },
  {
    at: 0.26,
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
    nightFactor: 0.26,
    starIntensity: 0.05,
    fogNear: 190,
    fogFar: 660,
  },
  {
    at: 0.55,
    phase: 'dusk',
    label: 'DUSK',
    colors: {
      background: '#3d3a6a',
      horizon: '#8a5570',
      middle: '#37396d',
      top: '#1a1f45',
      fog: '#45406f',
      ambient: '#a9a6d8',
      hemiSky: '#8a86c4',
      hemiGround: '#2f2740',
      sun: '#ff7a5c',
      cloud: '#6a5885',
    },
    ambientIntensity: 0.28,
    hemiIntensity: 0.4,
    sunIntensity: 0.65,
    sunAltitude: -0.1,
    moonAltitude: 0.1,
    sunOpacity: 0.5,
    moonOpacity: 0.7,
    nightFactor: 0.6,
    starIntensity: 0.42,
    fogNear: 175,
    fogFar: 620,
  },
  {
    at: 0.8,
    phase: 'night',
    label: 'NIGHTFALL',
    colors: {
      background: '#16193c',
      horizon: '#3b4a78',
      middle: '#1b2350',
      top: '#0b0f26',
      fog: '#222f56',
      ambient: '#7686bd',
      hemiSky: '#59709f',
      hemiGround: '#1d2134',
      sun: '#d99a86',
      cloud: '#3a4468',
    },
    ambientIntensity: 0.18,
    hemiIntensity: 0.27,
    sunIntensity: 0.42,
    sunAltitude: -0.4,
    moonAltitude: 0.45,
    sunOpacity: 0.1,
    moonOpacity: 0.95,
    nightFactor: 0.87,
    starIntensity: 0.8,
    fogNear: 160,
    fogFar: 585,
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
