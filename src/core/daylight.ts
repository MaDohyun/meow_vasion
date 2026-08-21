/**
 * Day cycle for a run.
 *
 * The run escalates on a clock - wave stages arrive at fixed elapsed times - so
 * the sky is put on the same clock. You can see how deep into the run you are
 * without looking at a number.
 *
 * It starts at six in the evening, not at dawn. This game is at its best in the
 * dark: lit windows, streetlights, and additive beams and explosions all need a
 * background that has stopped competing with them. A cycle that opened in
 * morning light spent the whole first half of the run - the half where a player
 * forms their impression of the game - under a bright blue sky.
 *
 * And it does not stop. The cycle runs evening, night, dawn, morning, noon,
 * afternoon and back to evening, and then goes round again - a five minute run
 * sees two nights. It used to take the whole run to get round once, which made
 * the sky change too slowly to notice; at half the length the light is always
 * visibly on the move.
 *
 * The loop closes, which is the part that matters. A cycle that ends at noon
 * has to either stop there - a sky sitting still for half the run - or snap
 * back to evening. Carrying it through the afternoon means the last keyframe
 * hands off to the first and progress can simply wrap.
 *
 * Pure data and scalars only - no Three.js. The render layer turns the hex
 * strings into colours and does the interpolation in linear space, so this file
 * stays testable.
 */

export type DaylightPhase = 'golden' | 'dusk' | 'night' | 'dawn' | 'morning' | 'day'

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
  /**
   * City time at this keyframe, in hours since the run opened at six.
   *
   * Carried as data rather than derived from a constant rate because the cycle
   * is not evenly paced - night takes a third of the run on its own. A clock
   * ticking at a fixed rate would put an eight-in-the-morning reading on a
   * screen that is plainly still dark.
   */
  hour: number
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
 * Seconds for one full turn of the sky. Half the run length, so a five minute
 * run sees two nights.
 */
export const DAY_CYCLE_SECONDS = 150

/** The hour the run opens on. */
export const DAYLIGHT_START_HOUR = 18

export const DAYLIGHT_KEYFRAMES: DaylightKeyframe[] = [
  {
    at: 0,
    phase: 'golden',
    label: 'EVENING',
    hour: 0,
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
    at: 0.07,
    phase: 'golden',
    label: 'SUNSET',
    hour: 1,
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
    at: 0.15,
    phase: 'dusk',
    label: 'DUSK',
    hour: 2,
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
    at: 0.24,
    phase: 'night',
    label: 'NIGHT',
    hour: 3.5,
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
    sunOpacity: 0.08,
    moonOpacity: 0.95,
    // By the time the label says NIGHT it has to look like night; the walk on
    // to LATE NIGHT is the sky getting deeper, not the lights coming on.
    nightFactor: 0.96,
    starIntensity: 0.9,
    fogNear: 160,
    fogFar: 585,
  },
  {
    // The deepest point, and the longest stretch on screen. Waves three, four
    // and five all arrive between here and the keyframe before it.
    at: 0.53,
    phase: 'night',
    label: 'LATE NIGHT',
    hour: 9.5,
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
    moonAltitude: 0.8,
    sunOpacity: 0,
    moonOpacity: 1,
    nightFactor: 1,
    starIntensity: 1,
    fogNear: 150,
    fogFar: 560,
  },
  {
    // Around 144 seconds, which is where the final wave is coming from. The
    // last assault and the sunrise are meant to land together.
    at: 0.64,
    phase: 'dawn',
    label: 'DAWN',
    hour: 11.5,
    colors: {
      background: '#4a4a72',
      horizon: '#e08b86',
      middle: '#4d5182',
      top: '#232a55',
      fog: '#57567f',
      ambient: '#b9b2cf',
      hemiSky: '#9a9ec8',
      hemiGround: '#3b3348',
      sun: '#ffb08a',
      cloud: '#8d7d97',
    },
    ambientIntensity: 0.3,
    hemiIntensity: 0.42,
    sunIntensity: 0.7,
    sunAltitude: -0.05,
    moonAltitude: 0.22,
    sunOpacity: 0.45,
    moonOpacity: 0.6,
    nightFactor: 0.62,
    starIntensity: 0.3,
    fogNear: 175,
    fogFar: 615,
  },
  {
    at: 0.73,
    phase: 'morning',
    label: 'MORNING',
    hour: 14,
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
    sunAltitude: 0.3,
    moonAltitude: -0.4,
    sunOpacity: 1,
    moonOpacity: 0,
    nightFactor: 0.14,
    starIntensity: 0,
    fogNear: 200,
    fogFar: 700,
  },
  {
    at: 0.8,
    phase: 'day',
    label: 'MIDDAY',
    hour: 18,
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
    at: 0.9,
    phase: 'day',
    label: 'AFTERNOON',
    hour: 21,
    colors: {
      background: '#a7c9d2',
      horizon: '#f0dcbd',
      middle: '#9db9cf',
      top: '#5a7fb4',
      fog: '#adbfc4',
      ambient: '#fff8e8',
      hemiSky: '#e8f2fa',
      hemiGround: '#bfa38d',
      sun: '#ffeec2',
      cloud: '#fff4e3',
    },
    ambientIntensity: 0.6,
    hemiIntensity: 0.88,
    sunIntensity: 1.55,
    sunAltitude: 0.6,
    moonAltitude: -0.95,
    sunOpacity: 1,
    moonOpacity: 0,
    nightFactor: 0.02,
    starIntensity: 0,
    fogNear: 210,
    fogFar: 730,
  },
  {
    // Closes the ring. Identical to the opening keyframe so the last handoff
    // is seamless and the cycle can simply wrap round to it.
    at: 1,
    phase: 'golden',
    label: 'EVENING',
    hour: 24,
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
    nightFactor: 0.09,
    starIntensity: 0,
    fogNear: 200,
    fogFar: 700,
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
  /** Hours since the run opened at six. */
  hour: number
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t
}

/** Smoothstep, so a keyframe boundary is not a visible crease in the sky. */
function ease(t: number) {
  return t * t * (3 - 2 * t)
}

/**
 * Position in the cycle, wrapping rather than clamping.
 *
 * It used to stop at 1 and hold the last keyframe forever. Now that the
 * keyframes carry on through the afternoon and back to evening, the sky can
 * just keep turning, and the same point in two different laps is the same sky.
 */
export function daylightProgress(elapsed: number) {
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0
  const laps = elapsed / DAY_CYCLE_SECONDS
  return laps - Math.floor(laps)
}

/** Whole turns of the sky completed. */
export function daylightLap(elapsed: number) {
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0
  return Math.floor(elapsed / DAY_CYCLE_SECONDS)
}

/** Allocation-free sample holder for callers that tick every frame. */
export function createDaylightSample(): DaylightSample {
  return sampleDaylight(0)
}

/**
 * Pass `out` to reuse a sample across frames. The render loop runs this every
 * tick and the codebase avoids per-tick allocation throughout.
 */
/**
 * Which pair of keyframes a moment falls between, and how far. Shared by the
 * full sample and by the clock so the two can never disagree about what time
 * the sky is showing.
 */
function keyframeSpan(elapsed: number) {
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
  return { progress, from, to, blend }
}

/** Hours since the run opened. Read off the same interpolation as the sky. */
export function daylightHour(elapsed: number) {
  const { from, to, blend } = keyframeSpan(elapsed)
  return mix(from.hour, to.hour, blend)
}

/** City time as `HH:MM`, wrapping past midnight. */
export function daylightClock(elapsed: number) {
  const minutes = (DAYLIGHT_START_HOUR + daylightHour(elapsed)) * 60
  const hour = Math.floor(minutes / 60) % 24
  const minute = Math.floor(minutes % 60)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function sampleDaylight(elapsed: number, out?: DaylightSample): DaylightSample {
  const { progress, from, to, blend } = keyframeSpan(elapsed)
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
    hour: mix(from.hour, to.hour, blend),
  })
}
