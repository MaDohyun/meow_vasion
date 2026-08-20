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

export const GROUND = {
  BASE: '#1d2436',
  ROAD: '#232a3a',
  ROAD_MARKING: '#f0e6b4',
  CROSSWALK: '#e8edf5',
  grass: '#26382c',
  parking: '#2a2f3c',
  sand: '#3a3427',
  plaza: '#31303e',
  pond: '#16303c',
  vacant: '#2b2c26',
} as const

export const BUILDING = {
  /** Multiplied over the per-building tint to sink facades into the dark. */
  FACADE_WALL: '#2b3145',
  FACADE_SEAM: 'rgba(8,10,20,.45)',
  FACADE_BASE: '#171b28',
  ROOF: '#262c3e',
  /** Lit and unlit windows. The lit ones are the whole night skyline. */
  WINDOW_LIT: '#ffe6a6',
  WINDOW_LIT_HOT: '#fffbe8',
  WINDOW_COOL: '#9fdcff',
  WINDOW_DARK: '#1b2231',
  WINDOW_DIM: '#28303f',
  /** Blinking obstruction light on tall roofs. */
  BEACON: '#ff5566',
  DISTANT: '#1b2540',
  DISTANT_FAR: '#141c33',
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
