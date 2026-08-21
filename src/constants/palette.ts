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
  BACKGROUND: '#666b8b',
  /** Just above the skyline — the city's own light bouncing off the air. */
  HORIZON: '#d5a9b9',
  /** Mid sky. */
  MIDDLE: '#8488ad',
  /** Straight up, the darkest part. */
  TOP: '#555b82',
  /** Distance fog. Matches the horizon so buildings dissolve into the sky. */
  FOG: '#a4a5ba',
  MOON: '#fff2d8',
  MOON_HALO: '#d7c8dd',
  STAR: '#fff5dc',
  CLOUD: '#cbc3d3',
} as const

export const LIGHT = {
  /** Cool skylight fill. */
  AMBIENT: '#d8d4df',
  HEMI_SKY: '#c8d4df',
  HEMI_GROUND: '#777180',
  /** The moon stands in for the sun; low and cold. */
  MOON: '#f7deca',
} as const

// Surfaces are authored at daylight brightness. Night is produced by dropping
// the lights, not by baking darkness in - a night-baked texture cannot be lifted
// back to daylight, which is what the day-to-night cycle needs it to do.
export const GROUND = {
  BASE: '#c2cda8',
  ROAD: '#a3a1aa',
  ROAD_MARKING: '#f0d38f',
  CROSSWALK: '#e8e5de',
  BUILDING_PAD: '#cfc3b9',
  PARK_GRASS: '#a9cf78',
  FORECOURT: '#cfc9b6',
  TRANSIT_PAD: '#c9c4bd',
  PARKING_LOT: '#aaa9ae',
  UTILITY_PAD: '#bdaf9c',
  grass: '#bfda96',
  parking: '#bbb9b7',
  sand: '#e5d3aa',
  plaza: '#dfd0c6',
  pond: '#a8d6d5',
  vacant: '#cdd19f',
} as const

export const BUILDING = {
  /** Daylight wall tone. The night look comes from the lights, not from here. */
  FACADE_WALL: '#e5ddcf',
  FACADE_SEAM: 'rgba(74,67,82,.10)',
  FACADE_BASE: '#c3b5bd',
  ROOF: '#d8d0c1',
  /** Lit and unlit windows. The lit ones are the whole night skyline. */
  WINDOW_LIT: '#d8c891',
  WINDOW_LIT_HOT: '#f5e8c7',
  WINDOW_COOL: '#a9cbd0',
  /** Unlit glass in the colour map. Windows only look lit through the emissive
   *  map, so they read as plain glass while the sun is still up. */
  WINDOW_DARK: '#9caaab',
  WINDOW_DIM: '#c8cec7',
  /** Blinking obstruction light on tall roofs. */
  BEACON: '#df6673',
  DISTANT: '#b9b5bd',
  DISTANT_FAR: '#9e9dab',
  STORE_BAND: '#71c9ae',
  STORE_TRIM: '#fff0b0',
  TRANSIT: '#78aebc',
  TRANSIT_DARK: '#5f6875',
  PARK_LEAF: '#78b977',
  PARK_TRUNK: '#9d795f',
  PARK_BENCH: '#c58b68',
  PYLON: '#898a96',
} as const

/** Emissive tints per entity family. Kept distinct on purpose: a single enemy
 *  colour would erase the type read the wave design depends on. */
export const ENTITY = {
  UFO_HULL: '#e3d3bf',
  UFO_DOME: '#88d6df',
  UFO_RIM: '#9cd8c6',
  UFO_POOL: '#8fcdb6',
  PEDESTRIAN_GLOW: '#e887aa',
  CAT_GLOW: '#e9ae62',
  DRONE_GLOW: '#63b8d2',
  POLICE_GLOW: '#708fc9',
  POLICE_CAR_GLOW: '#d86678',
  SOLDIER_GLOW: '#aebc69',
  HELICOPTER_GLOW: '#d9b45b',
  FIGHTER_GLOW: '#d98958',
  ANTI_AIR_GLOW: '#d96070',
  TANK_GLOW: '#7dbb8d',
  BOSS_GLOW: '#d96f9f',
} as const

export const FX = {
  STREETLIGHT: '#e8cca0',
  STREETLIGHT_CONE: '#dfbd87',
  HEADLIGHT: '#eee2c5',
  TAILLIGHT: '#db6a66',
  SIREN_RED: '#dc596a',
  SIREN_BLUE: '#6488c8',
  WARNING: '#df5f72',
} as const
