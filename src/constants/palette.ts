// Single source of truth for scene colour.
//
// The city runs at night. Everything here is grouped by the job the colour
// does, not by the object that happens to use it, so a mood change is an edit
// in one place instead of a hunt through the render tree.
//
// Two rules hold this together:
//
// 1. Background reads dark, interactive reads bright. Darkening the sky is only
//    half a night scene; anything the player has to react to has to stay legible
//    against it, which is why the ENTITY and FX groups stay saturated.
// 2. Night light comes from emissive materials, never from new lights. three.js
//    keys shader programs on the light count, so adding one recompiles every
//    material in the scene. Windows, lamps, signs and beacons are all emissive
//    surfaces pretending to be light sources.

export const SKY = {
  /** Clear colour behind everything. */
  BACKGROUND: '#0a1024',
  /** Just above the skyline — the city's own light bouncing off the air. */
  HORIZON: '#243a63',
  /** Mid sky. */
  MIDDLE: '#111c3d',
  /** Straight up, the darkest part. */
  TOP: '#060a18',
  /** Distance fog. Matches the horizon so buildings dissolve into the sky. */
  FOG: '#152444',
  MOON: '#f4f1e4',
  MOON_HALO: '#93a6d8',
  STAR: '#dfe8ff',
  CLOUD: '#2a3352',
} as const

export const LIGHT = {
  /** Cool skylight fill. */
  AMBIENT: '#5d74ad',
  HEMI_SKY: '#41598f',
  HEMI_GROUND: '#161a2c',
  /** The moon stands in for the sun; low and cold. */
  MOON: '#b9caff',
} as const

// Surfaces are authored at daylight brightness. Night is produced by dropping
// the lights, not by baking darkness in - a night-baked texture cannot be lifted
// back to daylight, which is what the day-to-night cycle needs it to do.
export const GROUND = {
  BASE: '#8d9384',
  ROAD: '#6f7887',
  ROAD_MARKING: '#ffe7a3',
  CROSSWALK: '#f3f6fa',
  grass: '#a9c99d',
  parking: '#b8b4ad',
  sand: '#e5d2a6',
  plaza: '#d6c5b6',
  pond: '#9fc8cb',
  vacant: '#c7c39f',
} as const

export const BUILDING = {
  /** Daylight wall tone. The night look comes from the lights, not from here. */
  FACADE_WALL: '#e7e3cf',
  FACADE_SEAM: 'rgba(40,32,58,.16)',
  FACADE_BASE: '#8d8494',
  ROOF: '#ded9c4',
  /** Lit and unlit windows. The lit ones are the whole night skyline. */
  WINDOW_LIT: '#ffe6a6',
  WINDOW_LIT_HOT: '#fffbe8',
  WINDOW_COOL: '#9fdcff',
  /** Unlit glass in the colour map. Windows only look lit through the emissive
   *  map, so they read as plain glass under a midday sky. */
  WINDOW_DARK: '#5b7480',
  WINDOW_DIM: '#8ea3aa',
  /** Blinking obstruction light on tall roofs. */
  BEACON: '#ff5566',
  DISTANT: '#9fb0bd',
  DISTANT_FAR: '#8b9cab',
} as const

/** Emissive tints per entity family. Kept distinct on purpose: a single enemy
 *  colour would erase the type read the wave design depends on. */
export const ENTITY = {
  UFO_HULL: '#d8c9b5',
  UFO_DOME: '#8ef2ff',
  UFO_RIM: '#a8ffdf',
  UFO_POOL: '#7ef2c4',
  PEDESTRIAN_GLOW: '#ff8bb4',
  CAT_GLOW: '#ffc36d',
  DRONE_GLOW: '#3fd0ff',
  POLICE_GLOW: '#5b8cff',
  POLICE_CAR_GLOW: '#ff4d6d',
  SOLDIER_GLOW: '#c8d46a',
  HELICOPTER_GLOW: '#ffd24d',
  FIGHTER_GLOW: '#ff7a3d',
  ANTI_AIR_GLOW: '#ff3b5c',
  TANK_GLOW: '#8affa0',
  BOSS_GLOW: '#ff5aa8',
} as const

export const FX = {
  STREETLIGHT: '#ffd99a',
  STREETLIGHT_CONE: '#ffca70',
  HEADLIGHT: '#fff2c8',
  TAILLIGHT: '#ff5b52',
  SIREN_RED: '#ff3355',
  SIREN_BLUE: '#3f7bff',
  WARNING: '#ff4d6d',
} as const
