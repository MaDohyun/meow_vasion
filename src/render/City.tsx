import { BEAM_ABSORB_TIME } from '../core/beam'
import { useFrame } from '@react-three/fiber'
import { memo, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useGame } from '../GameContext'
import { BUILDING, FX, GROUND } from '../constants/palette'
import { radialGlowTexture } from './textures'
import { CityLandmarks, applyLandmarkDaylight } from './CityLandmarks'
import {
  buildingNeonSignLayout,
  groundLandmarkForCell,
  isNewsTower,
  isConvenienceStore,
} from '../core/cityLandmarks'
import {
  isWorldPropDisplaced,
  isWorldPropHidden,
  trashBinsAround,
  utilityPolesAround,
  worldPropVisibilityKey,
  worldPropsAround,
  STREETLIGHT_RADIUS_CELLS,
  TREE_VARIANT_ROUND,
  TREE_VARIANT_SLENDER,
} from '../core/worldProps'
import {
  BUILDING_SIGN_LABELS,
  BUILDING_SIGN_COLORS,
  ENTRANCE_VARIANTS,
  groundCellsAround,
  WORLD_CELL_SIZE,
  WORLD_GROUND_RADIUS_CELLS,
  WORLD_MAX_BUILDINGS,
  BUILDING_PODIUM_SPREAD,
  WORLD_MAX_DISTANT_BUILDINGS,
  WORLD_SPAWN_RADIUS,
  WORLD_LOD_RADIUS,
  WORLD_REMOVE_RADIUS,
  seedForWorldCell,
  lakeClusterForCell,
  parkClusterForCell,
  sameLandmarkCluster,
  type ActiveWorld,
  type BuildingHeightTier,
  type BuildingSpecialty,
  type GroundVariant,
} from '../core/world'

const toonGradient = (() => {
  // A narrow, bright ramp keeps shaded faces pastel instead of turning them
  // into heavy colour blocks. Geometry and lighting behaviour stay unchanged;
  // this is the soft, low-contrast toy-diorama finish.
  const data = new Uint8Array([204, 222, 240, 255])
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RedFormat)
  texture.needsUpdate = true
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  return texture
})()

const roundedBuildingGeometry = new RoundedBoxGeometry(1, 1, 1, 2, 0.032)
const roundedRoofGeometry = new RoundedBoxGeometry(1, 1, 1, 2, 0.11)

function pixelTexture(draw: (context: CanvasRenderingContext2D) => void, width = 64, height = 64) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  draw(context)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  return texture
}

// Sixteen facade variants in a 4x4 atlas. A per-instance slot picks one, so a
// street does not read as one building copied along the block - see facadeSlot
// below.
//
// The sixteen are deliberately different window *types*, not sixteen phase
// shifts of one grid. Four variants that differed only in which panes were lit
// still gave every building the same window size, the same bay spacing and the
// same rhythm, and the eye reads those before it reads which lights are on.
const FACADE_TILES = 4
const FACADE_TILE = 64
const FACADE_SIZE = FACADE_TILE * FACADE_TILES

/** One tile is three storeys. Buildings tile it vertically by height, so a
 *  tower gets many floors and a shop gets one - see ProceduralBuilding.floors. */
const FACADE_TILE_ROWS = 3

type FacadeKind = 'grid' | 'ribbon' | 'vertical' | 'paired' | 'stagger'

type FacadeStyle = {
  kind: FacadeKind
  /** Window bays across the tile. */
  columns: number
  /** How often a pane is lit, and where the pattern starts. */
  litStride: number
  litOffset: number
  /** Blank one bay as a service riser, which breaks the mirror symmetry a
   *  regular grid otherwise has. */
  riser: boolean
}

const FACADE_STYLES: FacadeStyle[] = [
  { kind: 'grid', columns: 5, litStride: 3, litOffset: 0, riser: false },
  { kind: 'grid', columns: 4, litStride: 4, litOffset: 1, riser: true },
  { kind: 'grid', columns: 6, litStride: 5, litOffset: 2, riser: false },
  { kind: 'grid', columns: 3, litStride: 2, litOffset: 0, riser: false },
  { kind: 'ribbon', columns: 5, litStride: 2, litOffset: 0, riser: false },
  { kind: 'ribbon', columns: 7, litStride: 3, litOffset: 1, riser: false },
  { kind: 'ribbon', columns: 6, litStride: 4, litOffset: 2, riser: true },
  { kind: 'vertical', columns: 5, litStride: 3, litOffset: 1, riser: false },
  { kind: 'vertical', columns: 7, litStride: 4, litOffset: 0, riser: false },
  { kind: 'vertical', columns: 4, litStride: 2, litOffset: 1, riser: true },
  { kind: 'paired', columns: 6, litStride: 3, litOffset: 0, riser: false },
  { kind: 'paired', columns: 4, litStride: 5, litOffset: 2, riser: false },
  { kind: 'paired', columns: 8, litStride: 4, litOffset: 1, riser: true },
  { kind: 'stagger', columns: 5, litStride: 3, litOffset: 2, riser: false },
  { kind: 'stagger', columns: 4, litStride: 2, litOffset: 0, riser: false },
  { kind: 'stagger', columns: 6, litStride: 5, litOffset: 1, riser: true },
]

type Pane = { x: number; y: number; w: number; h: number; lit: boolean; cool: boolean }

/**
 * Window panes for one tile, laid out once and walked by both the colour map
 * and the emissive map so the glow lands exactly on the lit panes.
 */
function facadePanes(tile: number, emit: (pane: Pane) => void) {
  const style = FACADE_STYLES[tile]!
  const originX = (tile % FACADE_TILES) * FACADE_TILE
  const originY = Math.floor(tile / FACADE_TILES) * FACADE_TILE
  // Every tile keeps a slab line at the bottom of each storey, so tiling the
  // texture up a tower reads as floors stacking rather than as a pattern
  // repeating.
  const storey = FACADE_TILE / FACADE_TILE_ROWS
  const bay = FACADE_TILE / style.columns
  const riserBay = style.riser ? (tile * 3) % style.columns : -1

  const litAt = (row: number, column: number) =>
    (row * 7 + column * 5 + style.litOffset) % style.litStride === 0
  const coolAt = (row: number, column: number) => (row + column + tile) % 4 === 0

  for (let row = 0; row < FACADE_TILE_ROWS; row += 1) {
    const top = originY + row * storey + 2
    const usable = storey - 5
    if (style.kind === 'ribbon') {
      // One horizontal band per storey, cut by thin mullions. Reads as a
      // post-war office block rather than as punched windows.
      const h = Math.max(5, Math.round(usable * 0.58))
      const y = Math.round(top + (usable - h) * 0.5)
      for (let column = 0; column < style.columns; column += 1) {
        if (column === riserBay) continue
        const x = Math.round(originX + column * bay + 1.5)
        const w = Math.max(3, Math.round(bay - 3))
        emit({ x, y, w, h, lit: litAt(row, column), cool: coolAt(row, column) })
      }
      continue
    }
    if (style.kind === 'vertical') {
      // Tall narrow slots running most of the storey height.
      const h = Math.max(5, Math.round(usable * 0.82))
      const y = Math.round(top + (usable - h) * 0.5)
      for (let column = 0; column < style.columns; column += 1) {
        if (column === riserBay) continue
        const w = Math.max(2, Math.round(bay * 0.4))
        const x = Math.round(originX + column * bay + (bay - w) * 0.5)
        emit({ x, y, w, h, lit: litAt(row, column), cool: coolAt(row, column) })
      }
      continue
    }
    if (style.kind === 'paired') {
      // Two narrow panes sharing a mullion, repeated across the bay.
      const h = Math.max(4, Math.round(usable * 0.62))
      const y = Math.round(top + (usable - h) * 0.5)
      for (let column = 0; column < style.columns; column += 1) {
        if (column === riserBay) continue
        const w = Math.max(2, Math.round(bay * 0.34))
        const left = originX + column * bay + bay * 0.12
        const lit = litAt(row, column)
        emit({ x: Math.round(left), y, w, h, lit, cool: coolAt(row, column) })
        emit({ x: Math.round(left + w + 2), y, w, h, lit, cool: coolAt(row, column + 1) })
      }
      continue
    }
    // grid and stagger share a pane shape; stagger offsets alternate storeys by
    // half a bay so the vertical lines never run the height of the building.
    const h = Math.max(4, Math.round(usable * 0.66))
    const y = Math.round(top + (usable - h) * 0.5)
    const shift = style.kind === 'stagger' && row % 2 === 1 ? bay * 0.5 : 0
    for (let column = 0; column < style.columns; column += 1) {
      if (column === riserBay) continue
      const w = Math.max(3, Math.round(bay * 0.62))
      const x = Math.round(originX + column * bay + (bay - w) * 0.5 + shift)
      if (x + w > originX + FACADE_TILE) continue
      emit({ x, y, w, h, lit: litAt(row, column), cool: coolAt(row, column) })
    }
  }
}

const facadeTexture = pixelTexture((context) => {
  context.fillStyle = BUILDING.FACADE_WALL
  context.fillRect(0, 0, FACADE_SIZE, FACADE_SIZE)
  const storey = FACADE_TILE / FACADE_TILE_ROWS
  for (let tile = 0; tile < FACADE_TILES * FACADE_TILES; tile += 1) {
    const originX = (tile % FACADE_TILES) * FACADE_TILE
    const originY = Math.floor(tile / FACADE_TILES) * FACADE_TILE
    // Slab line under each storey. This is what survives tiling: the seam a
    // repeating texture always has is drawn on purpose as a floor edge.
    context.fillStyle = BUILDING.FACADE_SEAM
    for (let row = 0; row <= FACADE_TILE_ROWS; row += 1) {
      context.fillRect(originX, originY + Math.round(row * storey) - 1, FACADE_TILE, 1)
    }
    facadePanes(tile, ({ x, y, w, h }) => {
      context.fillStyle = BUILDING.WINDOW_DARK
      context.fillRect(x, y, w, h)
      context.fillStyle = BUILDING.WINDOW_DIM
      context.fillRect(x + 1, y, Math.max(1, Math.round(w * 0.3)), 1)
    })
  }
}, FACADE_SIZE, FACADE_SIZE)

// Black everywhere except the lit panes. Fed to emissiveMap so the walls stay
// unlit while the windows carry the glow.
const facadeEmissiveTexture = pixelTexture((context) => {
  context.fillStyle = '#000000'
  context.fillRect(0, 0, FACADE_SIZE, FACADE_SIZE)
  for (let tile = 0; tile < FACADE_TILES * FACADE_TILES; tile += 1) {
    facadePanes(tile, ({ x, y, w, h, lit, cool }) => {
      if (!lit) return
      context.fillStyle = cool ? BUILDING.WINDOW_COOL : BUILDING.WINDOW_LIT
      context.fillRect(x, y, w, h)
      context.fillStyle = BUILDING.WINDOW_LIT_HOT
      context.fillRect(x + 1, y, Math.max(1, Math.round(w * 0.3)), 1)
    })
  }
}, FACADE_SIZE, FACADE_SIZE)

const roofTexture = pixelTexture((context) => {
  context.fillStyle = BUILDING.ROOF
  context.fillRect(0, 0, 64, 64)
  context.strokeStyle = 'rgba(150,175,225,.10)'
  for (let value = 0; value <= 64; value += 8) {
    context.beginPath(); context.moveTo(value, 0); context.lineTo(value, 64); context.stroke()
    context.beginPath(); context.moveTo(0, value); context.lineTo(64, value); context.stroke()
  }
})

const lotTexture = pixelTexture((context) => {
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, 64, 64)
  context.strokeStyle = 'rgba(0,0,0,.30)'
  context.lineWidth = 1
  for (let value = 0; value <= 64; value += 8) {
    context.beginPath(); context.moveTo(value, 0); context.lineTo(value, 64); context.stroke()
    context.beginPath(); context.moveTo(0, value); context.lineTo(64, value); context.stroke()
  }
  for (let index = 0; index < 96; index += 1) {
    const x = index * 29 % 64
    const y = index * 47 % 64
    context.fillStyle = index % 3 === 0 ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.07)'
    context.fillRect(x, y, 1, 1)
  }
})

// Repeating asphalt for the base plane. UVs are locked to world space by
// GroundBase so the pattern streams past instead of travelling with the player,
// which is most of the speed read at ground level.
const asphaltTexture = pixelTexture((context) => {
  context.fillStyle = GROUND.BASE
  context.fillRect(0, 0, 64, 64)
  for (let index = 0; index < 220; index += 1) {
    const x = index * 37 % 64
    const y = index * 23 % 64
    context.fillStyle = index % 5 === 0 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.07)'
    context.fillRect(x, y, 1, 1)
  }
})

/**
 * The road tile, pavements included.
 *
 * The strip is nine metres across the carriageway plus a footpath each side,
 * which is exactly the gap the generator leaves between cell boundary and
 * building edge - so a pavement meets the wall instead of stopping short or
 * disappearing under it. Painting the footpath into this texture rather than
 * instancing it separately keeps the whole street at the two draw calls the
 * road pool already spends.
 *
 * The 32-pixel axis runs across the street: rows 0-5 and 26-31 are pavement,
 * the kerb sits on rows 6 and 25, and the carriageway fills the middle.
 */
/** Carriageway plus a footpath each side - the full gap between the cell
 *  boundary and the building setback, so nothing shows through between them. */
const ROAD_STRIP_WIDTH = 9

const roadTexture = pixelTexture((context) => {
  context.fillStyle = GROUND.ROAD
  context.fillRect(0, 0, 128, 32)
  for (let index = 0; index < 180; index += 1) {
    const x = index * 37 % 128
    const y = 7 + index * 19 % 18
    context.fillStyle = index % 4 === 0 ? 'rgba(255,255,255,.09)' : 'rgba(0,0,0,.07)'
    context.fillRect(x, y, index % 5 === 0 ? 2 : 1, 1)
  }
  // Centre line only. At night this is what makes the road shape readable.
  //
  // Crosswalks used to be painted in here, which meant one in the middle of
  // every single road tile - the ground turned into a field of white stripes.
  // Anything drawn into a repeating texture repeats everywhere by definition,
  // so they moved out to their own sparse pool below.
  context.fillStyle = GROUND.ROAD_MARKING
  for (let x = 18; x < 112; x += 22) context.fillRect(x, 15, 12, 2)
  // The footpath stops short of both ends of the tile. A tile spans exactly
  // one cell, so its ends sit on the junctions - run the pavement the whole
  // length and every crossing street gets a grey band painted straight across
  // its carriageway, cutting the lane markings in half. JUNCTION is half the
  // width of the crossing strip, in texels along the tile.
  const JUNCTION = 17
  const PATH_START = JUNCTION
  const PATH_LENGTH = 128 - JUNCTION * 2
  context.fillStyle = GROUND.PAVEMENT
  context.fillRect(PATH_START, 0, PATH_LENGTH, 6)
  context.fillRect(PATH_START, 26, PATH_LENGTH, 6)
  // Paving slabs. Faint, and only across the footpath, so the seams read as
  // texture at flying height rather than as a second set of lane markings.
  context.fillStyle = 'rgba(0,0,0,.06)'
  for (let x = PATH_START; x < PATH_START + PATH_LENGTH; x += 8) {
    context.fillRect(x, 0, 1, 6)
    context.fillRect(x, 26, 1, 6)
  }
  context.fillStyle = GROUND.KERB
  context.fillRect(PATH_START, 6, PATH_LENGTH, 1)
  context.fillRect(PATH_START, 25, PATH_LENGTH, 1)
}, 128, 32)

const crosswalkTexture = pixelTexture((context) => {
  context.clearRect(0, 0, 32, 32)
  context.fillStyle = GROUND.CROSSWALK
  for (let x = 2; x < 30; x += 7) context.fillRect(x, 4, 4, 24)
}, 32, 32)

// Materials the daylight cycle drives. They are module-level because every
// pooled instance shares one, so the cycle updates a handful of objects per
// frame rather than walking the scene.
const cityDaylightMaterials = {
  facade: null as THREE.MeshToonMaterial | null,
  roof: null as THREE.MeshToonMaterial | null,
  distant: null as THREE.MeshToonMaterial | null,
  lot: null as THREE.MeshToonMaterial | null,
  groundBase: null as THREE.MeshToonMaterial | null,
  streetPole: null as THREE.MeshToonMaterial | null,
  streetlight: null as THREE.MeshBasicMaterial | null,
  streetPool: null as THREE.MeshBasicMaterial | null,
  beacon: null as THREE.MeshBasicMaterial | null,
  road: null as THREE.MeshBasicMaterial | null,
  horizontalNeonSign: null as THREE.ShaderMaterial | null,
  verticalNeonSign: null as THREE.ShaderMaterial | null,
}

/**
 * Surfaces are authored at daylight brightness and darkened by the lights, so
 * the cycle only has to handle the emissive side here: lit windows, streetlights
 * and beacons are wrong while there is still light in the sky, and ramp in with nightFactor rather
 * than switching on at a threshold.
 *
 * Roads are the exception. Their material is unlit, so the cycle dims it by hand
 * or the asphalt would stay noon-bright at midnight.
 */
export function applyCityDaylight(nightFactor: number) {
  const materials = cityDaylightMaterials
  // Keep the diorama readable throughout the cycle. Night is a soft storybook
  // twilight rather than a black stage covered in isolated neon points.
  if (materials.road) materials.road.color.setScalar(1 - nightFactor * 0.16)
  if (materials.facade) materials.facade.emissiveIntensity = 0.02 + 1.12 * nightFactor
  if (materials.distant) materials.distant.emissiveIntensity = 0.01 + 0.78 * nightFactor
  if (materials.streetPole) materials.streetPole.emissiveIntensity = 0.015 + nightFactor * 0.08
  if (materials.streetlight) materials.streetlight.opacity = 0.1 + Math.pow(nightFactor, 1.25) * 0.9
  if (materials.streetPool) materials.streetPool.opacity = 0.012 + Math.pow(nightFactor, 1.35) * 0.42
  if (materials.beacon) materials.beacon.opacity = 0.2 + nightFactor * 0.78
  const neonStrength = 0.16 + nightFactor * 1.48
  if (materials.horizontalNeonSign) materials.horizontalNeonSign.uniforms.glowStrength!.value = neonStrength
  if (materials.verticalNeonSign) materials.verticalNeonSign.uniforms.glowStrength!.value = neonStrength
  applyLandmarkDaylight(nightFactor)
}

const distantWindowTexture = pixelTexture((context) => {
  context.fillStyle = '#000000'
  context.fillRect(0, 0, 32, 32)
  for (let row = 0; row < 16; row += 1) {
    for (let column = 0; column < 10; column += 1) {
      if ((row * 5 + column * 3) % 7 !== 0) continue
      context.fillStyle = (row + column) % 5 === 0 ? BUILDING.WINDOW_COOL : BUILDING.WINDOW_LIT
      context.fillRect(2 + column * 3, 2 + row * 2, 2, 1)
    }
  }
}, 32, 32)

const SIGN_COLUMNS = 4
const SIGN_ROWS = Math.ceil(BUILDING_SIGN_LABELS.length / SIGN_COLUMNS)
const signAtlas = pixelTexture((context) => {
  const slotWidth = context.canvas.width / SIGN_COLUMNS
  const slotHeight = context.canvas.height / SIGN_ROWS
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = 'bold 22px monospace'
  BUILDING_SIGN_LABELS.forEach((label, index) => {
    const x = index % SIGN_COLUMNS * slotWidth
    const y = Math.floor(index / SIGN_COLUMNS) * slotHeight
    context.fillStyle = '#302942'
    context.fillRect(x, y, slotWidth, slotHeight)
    const color = BUILDING_SIGN_COLORS[index % BUILDING_SIGN_COLORS.length]!
    context.strokeStyle = color
    context.lineWidth = 4
    context.strokeRect(x + 3, y + 3, slotWidth - 6, slotHeight - 6)
    context.fillStyle = color
    context.fillText(label, x + slotWidth / 2, y + slotHeight / 2)
  })
}, 512, 384)

// Text and border only. The shader adds this map as emission, so the lettering
// glows without adding point lights or changing the scene's fixed light count.
const signGlowAtlas = pixelTexture((context) => {
  const slotWidth = context.canvas.width / SIGN_COLUMNS
  const slotHeight = context.canvas.height / SIGN_ROWS
  context.fillStyle = '#000000'
  context.fillRect(0, 0, context.canvas.width, context.canvas.height)
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = 'bold 22px monospace'
  BUILDING_SIGN_LABELS.forEach((label, index) => {
    const x = index % SIGN_COLUMNS * slotWidth
    const y = Math.floor(index / SIGN_COLUMNS) * slotHeight
    const color = BUILDING_SIGN_COLORS[index % BUILDING_SIGN_COLORS.length]!
    context.save()
    context.shadowColor = color
    context.shadowBlur = 10
    context.strokeStyle = color
    context.lineWidth = 3
    context.strokeRect(x + 6, y + 6, slotWidth - 12, slotHeight - 12)
    context.fillStyle = color
    context.fillText(label, x + slotWidth / 2, y + slotHeight / 2)
    context.restore()
  })
}, 512, 384)

const VERTICAL_SIGN_COLUMNS = 3
const VERTICAL_SIGN_DESIGNS = ['HORSE', 'BEER', '24H', 'NOVA', 'PAW', 'BAR'] as const
const VERTICAL_SIGN_ROWS = Math.ceil(VERTICAL_SIGN_DESIGNS.length / VERTICAL_SIGN_COLUMNS)
const VERTICAL_SIGN_COLORS = ['#69bfff', '#ffe66b', '#ff69c7', '#5fffd4', '#c8ff69', '#ff8d66'] as const

function drawVerticalNeonDesign(
  context: CanvasRenderingContext2D,
  design: typeof VERTICAL_SIGN_DESIGNS[number],
  index: number,
  glowOnly: boolean,
) {
  const slotWidth = context.canvas.width / VERTICAL_SIGN_COLUMNS
  const slotHeight = context.canvas.height / VERTICAL_SIGN_ROWS
  const x = index % VERTICAL_SIGN_COLUMNS * slotWidth
  const y = Math.floor(index / VERTICAL_SIGN_COLUMNS) * slotHeight
  const color = VERTICAL_SIGN_COLORS[index % VERTICAL_SIGN_COLORS.length]!
  const cx = x + slotWidth / 2

  context.save()
  if (!glowOnly) {
    context.fillStyle = '#241d36'
    context.fillRect(x, y, slotWidth, slotHeight)
  }
  context.strokeStyle = color
  context.fillStyle = color
  context.lineWidth = 5
  context.lineCap = 'round'
  context.lineJoin = 'round'
  if (glowOnly) {
    context.shadowColor = color
    context.shadowBlur = 13
  }
  context.strokeRect(x + 7, y + 7, slotWidth - 14, slotHeight - 14)

  if (design === 'HORSE') {
    context.beginPath()
    context.moveTo(cx - 30, y + 82)
    context.lineTo(cx - 23, y + 38)
    context.lineTo(cx - 7, y + 55)
    context.lineTo(cx + 12, y + 38)
    context.lineTo(cx + 27, y + 80)
    context.quadraticCurveTo(cx + 29, y + 132, cx + 8, y + 160)
    context.lineTo(cx - 13, y + 160)
    context.quadraticCurveTo(cx - 31, y + 130, cx - 30, y + 82)
    context.stroke()
    context.beginPath()
    context.arc(cx - 11, y + 92, 4, 0, Math.PI * 2)
    context.arc(cx + 11, y + 92, 4, 0, Math.PI * 2)
    context.fill()
    context.font = 'bold 21px monospace'
    context.textAlign = 'center'
    context.fillText('HORSE', cx, y + 211)
  } else if (design === 'BEER') {
    context.strokeRect(cx - 28, y + 60, 54, 105)
    context.beginPath()
    context.arc(cx + 27, y + 108, 24, -Math.PI / 2, Math.PI / 2)
    context.stroke()
    for (const [dx, dy, radius] of [[-22, 56, 12], [0, 49, 15], [22, 56, 12]] as const) {
      context.beginPath()
      context.arc(cx + dx, y + dy, radius, 0, Math.PI * 2)
      context.stroke()
    }
    context.font = 'bold 25px monospace'
    context.textAlign = 'center'
    context.fillText('BEER', cx, y + 211)
  } else if (design === '24H') {
    context.font = 'bold 66px monospace'
    context.textAlign = 'center'
    context.fillText('24', cx, y + 116)
    context.font = 'bold 56px monospace'
    context.fillText('H', cx, y + 185)
  } else if (design === 'NOVA') {
    context.font = 'bold 47px monospace'
    context.textAlign = 'center'
    ;['N', 'O', 'V', 'A'].forEach((letter, letterIndex) => {
      context.fillText(letter, cx, y + 58 + letterIndex * 46)
    })
  } else if (design === 'PAW') {
    context.beginPath()
    context.ellipse(cx, y + 128, 34, 29, 0, 0, Math.PI * 2)
    context.stroke()
    for (const [dx, dy] of [[-32, 85], [-11, 69], [13, 69], [34, 88]] as const) {
      context.beginPath()
      context.arc(cx + dx, y + dy, 11, 0, Math.PI * 2)
      context.stroke()
    }
    context.font = 'bold 27px monospace'
    context.textAlign = 'center'
    context.fillText('PAW', cx, y + 210)
  } else {
    context.beginPath()
    context.moveTo(cx - 38, y + 60)
    context.lineTo(cx + 38, y + 60)
    context.lineTo(cx, y + 121)
    context.closePath()
    context.stroke()
    context.beginPath()
    context.moveTo(cx, y + 121)
    context.lineTo(cx, y + 160)
    context.moveTo(cx - 24, y + 160)
    context.lineTo(cx + 24, y + 160)
    context.stroke()
    context.font = 'bold 30px monospace'
    context.textAlign = 'center'
    context.fillText('BAR', cx, y + 211)
  }
  context.restore()
}

const verticalSignAtlas = pixelTexture((context) => {
  VERTICAL_SIGN_DESIGNS.forEach((design, index) => drawVerticalNeonDesign(context, design, index, false))
}, 384, 512)

const verticalSignGlowAtlas = pixelTexture((context) => {
  context.fillStyle = '#000000'
  context.fillRect(0, 0, context.canvas.width, context.canvas.height)
  VERTICAL_SIGN_DESIGNS.forEach((design, index) => drawVerticalNeonDesign(context, design, index, true))
}, 384, 512)

function createNeonSignMaterial(
  map: THREE.Texture,
  glowMap: THREE.Texture,
  columns: number,
  rows: number,
) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: map },
      glowMap: { value: glowMap },
      glowStrength: { value: 0.45 },
    },
    vertexShader: `
      attribute float signSlot;
      varying vec2 vAtlasUv;
      void main() {
        float column = mod(signSlot, ${columns.toFixed(1)});
        float row = floor(signSlot / ${columns.toFixed(1)});
        vAtlasUv = vec2((uv.x + column) / ${columns.toFixed(1)}, (uv.y + (${(rows - 1).toFixed(1)} - row)) / ${rows.toFixed(1)});
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform sampler2D glowMap;
      uniform float glowStrength;
      varying vec2 vAtlasUv;
      void main() {
        vec3 panel = texture2D(map, vAtlasUv).rgb;
        vec3 emission = texture2D(glowMap, vAtlasUv).rgb;
        gl_FragColor = vec4(panel + emission * glowStrength, 1.0);
      }
    `,
    toneMapped: false,
  })
}

const distantBuildingMaterial = (() => {
  const material = new THREE.MeshToonMaterial({
    color: '#ffffff',
    gradientMap: toonGradient,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: distantWindowTexture,
    emissiveIntensity: 0.18,
  })
  cityDaylightMaterials.distant = material
  return material
})()

function DistantBuildingPool() {
  const { runtime } = useGame()
  const silhouettes = useRef<THREE.InstancedMesh>(null)
  const lastKey = useRef('')
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const nearColor = useMemo(() => new THREE.Color(BUILDING.DISTANT), [])
  const farColor = useMemo(() => new THREE.Color(BUILDING.DISTANT_FAR), [])

  useFrame(() => {
    if (!silhouettes.current) return
    const world = runtime.current.world
    if (world.key === lastKey.current) return
    lastKey.current = world.key
    world.distantBuildings.forEach((building, index) => {
      position.set(building.position.x, building.position.y, building.position.z)
      scale.set(building.size.x, building.size.y, building.size.z)
      matrix.compose(position, rotation, scale)
      silhouettes.current!.setMatrixAt(index, matrix)
      const distance = Math.hypot(
        building.position.x - runtime.current.drone.position.x,
        building.position.z - runtime.current.drone.position.z,
      )
      const fade = THREE.MathUtils.clamp((distance - WORLD_SPAWN_RADIUS) / (WORLD_LOD_RADIUS - WORLD_SPAWN_RADIUS), 0, 1)
      silhouettes.current!.setColorAt(index, color.lerpColors(nearColor, farColor, fade))
    })
    silhouettes.current.count = world.distantBuildings.length
    silhouettes.current.instanceMatrix.needsUpdate = true
    if (silhouettes.current.instanceColor) silhouettes.current.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={silhouettes} args={[roundedBuildingGeometry, undefined, WORLD_MAX_DISTANT_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
      {/* Speckled window light on the horizon. A coarse dot pattern is enough
          at this distance and keeps the skyline from reading as a flat wall. */}
      <primitive object={distantBuildingMaterial} attach="material" />
    </instancedMesh>
  )
}

const GROUND_CELL_COUNT = (WORLD_GROUND_RADIUS_CELLS * 2 + 1) ** 2
const GROUND_SPAN = WORLD_CELL_SIZE * (WORLD_GROUND_RADIUS_CELLS * 2 + 1)
const GROUND_COLORS: Record<GroundVariant, string> = {
  grass: GROUND.grass,
  parking: GROUND.parking,
  sand: GROUND.sand,
  plaza: GROUND.plaza,
  pond: GROUND.pond,
  vacant: GROUND.vacant,
}

// The base plane is its own mesh so its UVs can be pinned to world space. As one
// instance among the lot tiles it had to share their material, and a shared map
// offset would have dragged every tile with it.
function GroundBase() {
  const { runtime } = useGame()
  const mesh = useRef<THREE.Mesh>(null)
  const map = useMemo(() => {
    const texture = asphaltTexture.clone()
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.repeat.set(GROUND_SPAN / 8, GROUND_SPAN / 8)
    texture.needsUpdate = true
    return texture
  }, [])
  useFrame(() => {
    if (!mesh.current) return
    const drone = runtime.current.drone.position
    mesh.current.position.set(drone.x, -0.014, drone.z)
    // Scroll the texture against the movement so the ground reads as passing
    // underneath rather than being dragged along.
    map.offset.set(drone.x / 8, -drone.z / 8)
  })
  const material = useMemo(() => {
    const created = new THREE.MeshToonMaterial({ color: '#ffffff', map, gradientMap: toonGradient })
    cityDaylightMaterials.groundBase = created
    return created
  }, [map])
  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} frustumCulled={false} material={material}>
      <planeGeometry args={[GROUND_SPAN, GROUND_SPAN]} />
    </mesh>
  )
}

const lotMaterial = (() => {
  // No vertexColors: this plane geometry carries no per-vertex colour
  // attribute, and turning the flag on makes the shader multiply by one that
  // isn't there - every lot came out solid black instead of tinted. Instance
  // tinting from setColorAt below works on its own; see RoofStructurePool
  // for the same pitfall documented in more detail.
  const material = new THREE.MeshToonMaterial({ color: '#ffffff', map: lotTexture, gradientMap: toonGradient })
  cityDaylightMaterials.lot = material
  return material
})()

/** Few enough segments that the edge has facets rather than reading as a
 *  perfect circle, which would look just as authored as the square did. */
const PARK_SEGMENTS = 11

// Scene-lit like the other ground tiles, so it needs no entry in the daylight
// table - the lights carry it through the cycle.
const parkMaterial = new THREE.MeshToonMaterial({ color: GROUND.PARK_GRASS, map: lotTexture, gradientMap: toonGradient })

const roadMaterial = (() => {
  const material = new THREE.MeshBasicMaterial({ color: '#ffffff', map: roadTexture })
  cityDaylightMaterials.road = material
  return material
})()

function GroundPool() {
  const { runtime } = useGame()
  const lots = useRef<THREE.InstancedMesh>(null)
  const roads = useRef<THREE.InstancedMesh>(null)
  const parks = useRef<THREE.InstancedMesh>(null)
  const parkEuler = useMemo(() => new THREE.Euler(), [])
  const parkQuaternion = useMemo(() => new THREE.Quaternion(), [])
  const lastKey = useRef('')
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const planeRotation = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), [])
  const verticalRoadRotation = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2)), [])
  const color = useMemo(() => new THREE.Color(), [])

  useFrame(() => {
    if (!lots.current || !roads.current || !parks.current) return
    const drone = runtime.current.drone.position
    const world = runtime.current.world
    const key = `${world.cellX}:${world.cellZ}`
    if (key === lastKey.current) return
    lastKey.current = key
    const cells = groundCellsAround(drone)
    let lotSlot = 0
    let roadSlot = 0
    let parkSlot = 0
    cells.forEach((cell) => {
      const centerX = (cell.cellX + 0.5) * WORLD_CELL_SIZE
      const centerZ = (cell.cellZ + 0.5) * WORLD_CELL_SIZE
      const landmark = groundLandmarkForCell(cell)
      const ordinaryLot = cell.ground === 'parking' || cell.ground === 'plaza' || cell.ground === 'pond'
      // Parks moved out to their own rounded pool: a lawn is the one ground
      // tile whose edge is not a property line, and squaring it off was what
      // made the whole city read as graph paper.
      const hasLot = Boolean(cell.building || (landmark && landmark !== 'park') || (ordinaryLot && cell.seed % 100 < 45))
      if (hasLot && lotSlot < GROUND_CELL_COUNT) {
        // Every building gets the same paved interior tile. The procedural
        // ground choice still exists for open cells, but grass or pond no
        // longer peeks out from underneath a tower footprint.
        const colorValue = cell.building
          ? GROUND.BUILDING_PAD
          : landmark === 'park'
            ? GROUND.PARK_GRASS
            : landmark === 'parking-lot'
              ? GROUND.PARKING_LOT
              : landmark === 'power-pylon'
                ? GROUND.UTILITY_PAD
                : landmark === 'gas-station'
                  ? GROUND.FORECOURT
                  : landmark === 'subway'
                    ? GROUND.TRANSIT_PAD
                    : GROUND_COLORS[cell.ground]
        const authoredLot = Boolean(cell.building || landmark)
        const lotSize = authoredLot ? WORLD_CELL_SIZE - 8.2 : WORLD_CELL_SIZE - 5 - (cell.seed >>> 9) % 5
        const jitterX = authoredLot ? 0 : ((cell.seed >>> 17) % 5) - 2
        const jitterZ = authoredLot ? 0 : ((cell.seed >>> 22) % 5) - 2
        position.set(centerX + jitterX, 0, centerZ + jitterZ)
        scale.set(lotSize, lotSize, 1)
        matrix.compose(position, planeRotation, scale)
        lots.current!.setMatrixAt(lotSlot, matrix)
        lots.current!.setColorAt(lotSlot, color.set(colorValue))
        lotSlot += 1
      }

      if (landmark === 'park' && parkSlot < GROUND_CELL_COUNT) {
        // Rotated per cell so no two lawns present the same flat side to the
        // street, and squashed a little on one axis so the outline is a
        // rounded plot rather than a drawn circle.
        const spin = ((cell.seed >>> 11) % 360) / 180 * Math.PI
        const squash = 0.82 + ((cell.seed >>> 19) % 30) / 100
        parkQuaternion.setFromEuler(parkEuler.set(-Math.PI / 2, 0, spin))
        position.set(centerX, 0.004, centerZ)
        scale.set(WORLD_CELL_SIZE - 5.4, (WORLD_CELL_SIZE - 5.4) * squash, 1)
        matrix.compose(position, parkQuaternion, scale)
        parks.current!.setMatrixAt(parkSlot, matrix)
        parkSlot += 1
      }

      // A lake/park cluster is one continuous landmark, not a row of tiles.
      // Suppress only its internal seams; outer boundaries still keep their
      // normal road edge so the landmark reads as a deliberate block.
      const southInternal = sameLandmarkCluster(cell.cellX, cell.cellZ, cell.cellX, cell.cellZ - 1)
      const westInternal = sameLandmarkCluster(cell.cellX, cell.cellZ, cell.cellX - 1, cell.cellZ)
      if (!southInternal) {
        position.set(centerX, 0.018, cell.cellZ * WORLD_CELL_SIZE)
        scale.set(WORLD_CELL_SIZE + 0.2, ROAD_STRIP_WIDTH, 1)
        matrix.compose(position, planeRotation, scale)
        roads.current!.setMatrixAt(roadSlot, matrix)
        roadSlot += 1
      }
      if (!westInternal) {
        position.set(cell.cellX * WORLD_CELL_SIZE, 0.02, centerZ)
        scale.set(WORLD_CELL_SIZE + 0.2, ROAD_STRIP_WIDTH, 1)
        matrix.compose(position, verticalRoadRotation, scale)
        roads.current!.setMatrixAt(roadSlot, matrix)
        roadSlot += 1
      }
    })
    lots.current.count = lotSlot
    roads.current.count = roadSlot
    parks.current!.count = parkSlot
    lots.current.instanceMatrix.needsUpdate = true
    roads.current.instanceMatrix.needsUpdate = true
    parks.current!.instanceMatrix.needsUpdate = true
    if (lots.current.instanceColor) lots.current.instanceColor.needsUpdate = true
  })

  return (
    <group>
      <GroundBase />
      <instancedMesh ref={lots} args={[undefined, undefined, GROUND_CELL_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <planeGeometry args={[1, 1]} />
        <primitive object={lotMaterial} attach="material" />
      </instancedMesh>
      <instancedMesh ref={roads} args={[undefined, undefined, GROUND_CELL_COUNT * 2]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <planeGeometry args={[1, 1]} />
        <primitive object={roadMaterial} attach="material" />
      </instancedMesh>
      <instancedMesh ref={parks} args={[undefined, undefined, GROUND_CELL_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <circleGeometry args={[0.5, PARK_SEGMENTS]} />
        <primitive object={parkMaterial} attach="material" />
      </instancedMesh>
    </group>
  )
}

const waterTexture = pixelTexture((context) => {
  context.fillStyle = '#76cfda'
  context.fillRect(0, 0, 64, 64)
  context.strokeStyle = 'rgba(225,255,245,.55)'
  context.lineWidth = 3
  for (let y = 7; y < 64; y += 13) {
    context.beginPath()
    for (let x = -8; x <= 72; x += 8) {
      const wave = y + Math.sin((x + y) * 0.22) * 2
      if (x === -8) context.moveTo(x, wave)
      else context.lineTo(x, wave)
    }
    context.stroke()
  }
})
waterTexture.wrapS = THREE.RepeatWrapping
waterTexture.wrapT = THREE.RepeatWrapping
waterTexture.needsUpdate = true

function WaterPool() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const lastKey = useRef('')
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), [])
  const material = useMemo(() => new THREE.MeshBasicMaterial({ map: waterTexture, transparent: true, opacity: 0.82, depthWrite: false }), [])

  useFrame((_, dt) => {
    const mesh = ref.current
    if (!mesh) return
    waterTexture.offset.x = (waterTexture.offset.x + dt * 0.035) % 1
    waterTexture.offset.y = (waterTexture.offset.y + dt * 0.018) % 1
    const world = runtime.current.world
    const key = `${world.cellX}:${world.cellZ}`
    if (lastKey.current === key) return
    lastKey.current = key
    let slot = 0
    // One tile per actual lake cell, not the cluster's bounding box - a
    // bounding box fills in corners an L-shaped cluster never claims, and
    // flattens the four-in-a-row shape into a long rectangle that reads as a
    // river instead of a lake. Each tile keeps the usual margin on any edge
    // that faces open ground, but drops to zero on edges that face another
    // cell in the same cluster, so neighbouring tiles butt up with no seam.
    const margin = 4.25
    for (const cell of groundCellsAround(runtime.current.drone.position)) {
      if (!lakeClusterForCell(cell.cellX, cell.cellZ)) continue
      if (slot >= GROUND_CELL_COUNT) break
      const westOpen = !sameLandmarkCluster(cell.cellX, cell.cellZ, cell.cellX - 1, cell.cellZ)
      const eastOpen = !sameLandmarkCluster(cell.cellX, cell.cellZ, cell.cellX + 1, cell.cellZ)
      const southOpen = !sameLandmarkCluster(cell.cellX, cell.cellZ, cell.cellX, cell.cellZ - 1)
      const northOpen = !sameLandmarkCluster(cell.cellX, cell.cellZ, cell.cellX, cell.cellZ + 1)
      const minX = cell.cellX * WORLD_CELL_SIZE + (westOpen ? margin : 0)
      const maxX = (cell.cellX + 1) * WORLD_CELL_SIZE - (eastOpen ? margin : 0)
      const minZ = cell.cellZ * WORLD_CELL_SIZE + (southOpen ? margin : 0)
      const maxZ = (cell.cellZ + 1) * WORLD_CELL_SIZE - (northOpen ? margin : 0)
      position.set((minX + maxX) * 0.5, 0.055, (minZ + maxZ) * 0.5)
      scale.set(maxX - minX, maxZ - minZ, 1)
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(slot, matrix)
      slot += 1
    }
    mesh.count = slot
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, material, GROUND_CELL_COUNT]} frustumCulled={false} renderOrder={2} onUpdate={(mesh) => { mesh.count = 0 }}>
      <planeGeometry args={[1, 1]} />
    </instancedMesh>
  )
}

/**
 * Ground-floor fronts.
 *
 * No building had a way of meeting the street: the facade ran to the pavement
 * and stopped, so a tower looked less like a tower than like a box someone had
 * cut off at the bottom. Six fronts in a 3x2 atlas, one per building, on the
 * same face as its sign - the shop's door belongs under the shop's sign.
 *
 * Drawn unlit on purpose. A shopfront at night is the one thing on the street
 * that should be brighter than what is around it.
 */
const ENTRANCE_COLUMNS = 3
const ENTRANCE_ROWS = 2
const ENTRANCE_TILE = 128

const entranceAtlas = pixelTexture((context) => {
  const w = ENTRANCE_TILE
  const h = ENTRANCE_TILE
  for (let variant = 0; variant < ENTRANCE_VARIANTS; variant += 1) {
    const ox = (variant % ENTRANCE_COLUMNS) * w
    const oy = Math.floor(variant / ENTRANCE_COLUMNS) * h
    context.fillStyle = '#cfc4bd'
    context.fillRect(ox, oy, w, h)
    context.fillStyle = 'rgba(60,52,66,.18)'
    context.fillRect(ox, oy + h - 6, w, 6)

    if (variant === 0) {
      // Glass lobby: a wide bright opening with a revolving door in the middle.
      context.fillStyle = '#f3e6b6'
      context.fillRect(ox + 12, oy + 22, w - 24, h - 34)
      context.fillStyle = '#6d6478'
      context.fillRect(ox + w / 2 - 4, oy + 22, 8, h - 34)
      context.fillRect(ox + 12, oy + 22, w - 24, 4)
    } else if (variant === 1) {
      // Shutter down. Slats, and a dark strip of pavement under them.
      context.fillStyle = '#8e93a1'
      context.fillRect(ox + 10, oy + 26, w - 20, h - 38)
      context.fillStyle = 'rgba(45,42,58,.35)'
      for (let y = oy + 30; y < oy + h - 14; y += 7) context.fillRect(ox + 10, y, w - 20, 3)
    } else if (variant === 2) {
      // Awning over a shopfront.
      context.fillStyle = '#f6dfa8'
      context.fillRect(ox + 16, oy + 42, w - 32, h - 52)
      context.fillStyle = '#4a4358'
      context.fillRect(ox + w / 2 - 13, oy + 62, 26, h - 72)
      context.fillStyle = '#e0705f'
      context.fillRect(ox + 8, oy + 26, w - 16, 16)
      context.fillStyle = '#f6efdd'
      for (let x = ox + 8; x < ox + w - 8; x += 20) context.fillRect(x, oy + 26, 10, 16)
    } else if (variant === 3) {
      // Double doors in a stone surround.
      context.fillStyle = '#b3a99f'
      context.fillRect(ox + 22, oy + 20, w - 44, h - 26)
      context.fillStyle = '#5d5570'
      context.fillRect(ox + 32, oy + 34, w - 64, h - 44)
      context.fillStyle = '#f0d9a4'
      context.fillRect(ox + w / 2 - 1, oy + 34, 2, h - 44)
      context.fillRect(ox + 22, oy + 20, w - 44, 5)
    } else if (variant === 4) {
      // Arcade: a colonnade you can see the dark through.
      context.fillStyle = '#2f2b3f'
      context.fillRect(ox + 8, oy + 30, w - 16, h - 40)
      context.fillStyle = '#cfc4bd'
      for (let x = ox + 8; x < ox + w - 12; x += 24) context.fillRect(x, oy + 30, 9, h - 40)
      context.fillStyle = '#cfc4bd'
      context.fillRect(ox + 8, oy + 30, w - 16, 6)
    } else {
      // Vehicle entrance, with the hazard chevrons that always mark one.
      context.fillStyle = '#3a3547'
      context.fillRect(ox + 18, oy + 34, w - 36, h - 44)
      context.fillStyle = '#e8c65c'
      for (let x = ox + 18; x < ox + w - 18; x += 16) context.fillRect(x, oy + 34, 7, 6)
      context.fillStyle = '#8e93a1'
      context.fillRect(ox + 18, oy + 28, w - 36, 6)
    }
  }
}, ENTRANCE_TILE * ENTRANCE_COLUMNS, ENTRANCE_TILE * ENTRANCE_ROWS)

const ENTRANCE_HEIGHT = 4.6

/** How far a podium stands proud of its tower, and how tall it is. Declared
 *  here because the ground-floor front has to sit on the podium's face when
 *  there is one. */
const PODIUM_SPREAD = BUILDING_PODIUM_SPREAD
const PODIUM_HEIGHT = 5.4

function EntrancePool() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const lastKey = useRef('')
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const sideRotation = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), [])
  const slots = useMemo(() => new Float32Array(WORLD_MAX_BUILDINGS), [])
  const geometry = useMemo(() => {
    const plane = new THREE.PlaneGeometry(1, 1)
    plane.setAttribute('entranceSlot', new THREE.InstancedBufferAttribute(slots, 1))
    return plane
  }, [slots])
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { map: { value: entranceAtlas } },
    vertexShader: `
      attribute float entranceSlot;
      varying vec2 vAtlasUv;
      void main() {
        float column = mod(entranceSlot, ${ENTRANCE_COLUMNS.toFixed(1)});
        float row = floor(entranceSlot / ${ENTRANCE_COLUMNS.toFixed(1)});
        vAtlasUv = vec2((uv.x + column) / ${ENTRANCE_COLUMNS.toFixed(1)}, (uv.y + (${(ENTRANCE_ROWS - 1).toFixed(1)} - row)) / ${ENTRANCE_ROWS.toFixed(1)});
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      varying vec2 vAtlasUv;
      void main() { gl_FragColor = texture2D(map, vAtlasUv); }
    `,
    side: THREE.DoubleSide,
  }), [])

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const world = runtime.current.world
    if (world.key === lastKey.current) return
    lastKey.current = world.key
    world.buildings.forEach((building, index) => {
      const onX = building.sign.side === 'x'
      // A podium stands proud of the tower, so the front has to sit on its
      // face rather than on the tower's or it ends up buried.
      const bulge = building.form === 'podium' ? PODIUM_SPREAD : 1
      const width = Math.min(13, (onX ? building.size.z : building.size.x) * bulge * 0.72)
      position.set(
        building.position.x + (onX ? (building.size.x * bulge) / 2 + 0.16 : 0),
        ENTRANCE_HEIGHT / 2,
        building.position.z + (!onX ? (building.size.z * bulge) / 2 + 0.16 : 0),
      )
      scale.set(width, ENTRANCE_HEIGHT, 1)
      matrix.compose(position, onX ? sideRotation : rotation, scale)
      mesh.setMatrixAt(index, matrix)
      slots[index] = building.entrance
    })
    mesh.count = world.buildings.length
    mesh.instanceMatrix.needsUpdate = true
    geometry.getAttribute('entranceSlot').needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[geometry, material, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }} />
}

/**
 * Podiums and setbacks: the two places a silhouette actually varies.
 *
 * Kept as plain solids rather than as more facade, which is also how they
 * usually are - a retail base is stone and a crown is plant. That means one
 * simple material and one draw call each, instead of dragging the atlas
 * attributes onto two more geometries.
 */
// Not registered for daylight modulation: these are unlit solids like the roof
// slabs, and their read comes from the sun, not from windows.
// Use a neutral base so each instanced rooftop piece keeps its authored paint
// instead of being pushed back toward the old ochre tone by material
// multiplication. Urban neutral tints dominate, with only a few warm accents.
const massingMaterial = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: toonGradient })

// Podiums are stone/masonry bases; setbacks are plant/mechanical crowns.
// Kept as separate palettes so the same building reads correctly top and
// bottom: warm light stone at street level, zinc-grey plant on the roof.
// Duplicated entries weight the distribution.
const PODIUM_TINTS = [
  '#C6C1B6', '#C6C1B6',
  '#D8D3C8',
  '#B4BCC2', '#B4BCC2',
  '#B5A392',
  '#9AA4AB',
] as const

const SETBACK_TINTS = [
  '#BCC2C6', '#BCC2C6',
  '#9AA4AB', '#9AA4AB',
  '#8B939A',
  '#6B7885',
  '#CBC6BA',
] as const

function MassingPool({ form }: { form: 'podium' | 'setback' }) {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const lastKey = useRef('')
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const color = useMemo(() => new THREE.Color(), [])

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const world = runtime.current.world
    if (world.key === lastKey.current) return
    lastKey.current = world.key
    let slot = 0
    for (const building of world.buildings) {
      if (building.form !== form) continue
      // News towers already carry a crown of their own; a second step on top
      // would fight it.
      if (form === 'setback' && isNewsTower(building)) continue
      if (form === 'podium') {
        position.set(building.position.x, PODIUM_HEIGHT / 2, building.position.z)
        scale.set(building.size.x * PODIUM_SPREAD, PODIUM_HEIGHT, building.size.z * PODIUM_SPREAD)
      } else {
        const height = Math.min(9, Math.max(3.4, building.size.y * 0.13))
        position.set(building.position.x, building.size.y + building.roofThickness + height / 2, building.position.z)
        scale.set(building.size.x * 0.62, height, building.size.z * 0.62)
      }
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(slot, matrix)
      // Setback/podium caps use their own light architectural palette. Never
      // inherit the facade roof colour here: some facade variants are cyan and
      // would make an entire rooftop read as a chunk of sky.
      const tints = form === 'podium' ? PODIUM_TINTS : SETBACK_TINTS
      const tint = tints[seedForWorldCell(building.cellX, building.cellZ, 0x6d455) % tints.length]!
      mesh.setColorAt(slot, color.set(tint))
      slot += 1
    }
    mesh.count = slot
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[roundedRoofGeometry, massingMaterial, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }} />
}

// Special building silhouettes are authored in a unit footprint and placed on
// top of the shared facade body. Each family has one merged geometry and one
// fixed instanced pool, so recognisable landmarks do not multiply draw calls
// with the number of buildings in view.
// Factory silhouette: a pale processing hall, service tanks, pipe racks and
// three stacks of different heights. The geometry stays compact so it reads as
// an industrial roof installation rather than another building tower.
const factoryGeometry = mergeGeometries([
  new THREE.BoxGeometry(0.98, 0.1, 0.94).translate(0, 0.05, 0),
  new THREE.BoxGeometry(0.72, 0.28, 0.54).translate(-0.08, 0.24, 0.04),
  new THREE.BoxGeometry(0.46, 0.22, 0.32).translate(0.24, 0.46, -0.16),
  new THREE.CylinderGeometry(0.14, 0.19, 0.34, 8).translate(-0.28, 0.48, 0.16),
  new THREE.CylinderGeometry(0.11, 0.15, 0.28, 8).translate(0.28, 0.42, -0.18),
  new THREE.BoxGeometry(0.08, 0.52, 0.08).translate(0.36, 0.43, 0.18),
  // Tall stacks. Their tips line up with the smoke sources below.
  new THREE.CylinderGeometry(0.105, 0.16, 1.1, 8).translate(-0.28, 0.82, 0.16),
  new THREE.CylinderGeometry(0.09, 0.14, 0.88, 8).translate(0.27, 0.7, -0.18),
  new THREE.CylinderGeometry(0.07, 0.11, 0.66, 8).translate(0.38, 0.55, 0.18),
  new THREE.CylinderGeometry(0.14, 0.14, 0.06, 8).translate(-0.28, 1.38, 0.16),
  new THREE.CylinderGeometry(0.12, 0.12, 0.06, 8).translate(0.27, 1.15, -0.18),
  new THREE.CylinderGeometry(0.095, 0.095, 0.05, 8).translate(0.38, 0.9, 0.18),
], false)!

const departmentStoreGeometry = mergeGeometries([
  new THREE.BoxGeometry(1.04, 0.09, 1.04).translate(0, 0.045, 0),
  new THREE.BoxGeometry(0.88, 0.13, 0.88).translate(0, 0.15, 0),
  new THREE.BoxGeometry(0.7, 0.16, 0.7).translate(0, 0.29, 0),
  new THREE.BoxGeometry(0.98, 0.07, 0.12).translate(0, 0.18, 0.53),
  new THREE.BoxGeometry(0.74, 0.08, 0.1).translate(0, 0.35, 0.39),
], false)!

const specialBuildingMaterial = {
  factory: new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: toonGradient }),
  'department-store': new THREE.MeshToonMaterial({ color: '#d2ad67', gradientMap: toonGradient }),
} satisfies Record<BuildingSpecialty, THREE.MeshToonMaterial>

const FACTORY_SMOKE_PUFFS_PER_CHIMNEY = 2
const FACTORY_SMOKE_CHIMNEYS = [
  { x: -0.28, z: 0.16, height: 1.42 },
  { x: 0.27, z: -0.18, height: 1.18 },
  { x: 0.38, z: 0.18, height: 0.92 },
] as const
const FACTORY_SMOKE_CAPACITY = WORLD_MAX_BUILDINGS * FACTORY_SMOKE_CHIMNEYS.length * FACTORY_SMOKE_PUFFS_PER_CHIMNEY
const factorySmokeGeometry = new THREE.SphereGeometry(0.5, 7, 5)
const factorySmokeMaterial = new THREE.MeshBasicMaterial({
  color: '#f1eee7',
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
})

function FactorySmokePool() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const color = useMemo(() => new THREE.Color(), [])

  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    const time = clock.elapsedTime
    let slot = 0
    for (const building of runtime.current.world.buildings) {
      if (building.specialty !== 'factory') continue
      const attachmentHeight = Math.min(14, Math.max(6, building.size.y * 0.26))
      const baseY = building.position.y + building.size.y / 2 + building.roofThickness
      const seed = seedForWorldCell(building.cellX, building.cellZ, 0x5a0ce)
      for (let chimney = 0; chimney < FACTORY_SMOKE_CHIMNEYS.length; chimney += 1) {
        const source = FACTORY_SMOKE_CHIMNEYS[chimney]!
        for (let puff = 0; puff < FACTORY_SMOKE_PUFFS_PER_CHIMNEY; puff += 1) {
          const phase = ((seed + chimney * 37 + puff * 71) >>> 0) / 0xffffffff
          const progress = (time * (0.12 + chimney * 0.015) + phase) % 1
          const sway = Math.sin(time * 0.9 + phase * Math.PI * 2) * (0.35 + progress * 0.9)
          const drift = Math.cos(time * 0.72 + phase * Math.PI * 2) * (0.28 + progress * 0.7)
          position.set(
            building.position.x + source.x * building.size.x * 0.76 + sway,
            baseY + attachmentHeight * (source.height + progress * 0.75),
            building.position.z + source.z * building.size.z * 0.76 + drift,
          )
          const puffScale = (0.42 + progress * 0.62) * (0.86 + 0.12 * Math.sin(phase * 19))
          scale.set(puffScale * 1.15, puffScale * 0.72, puffScale)
          matrix.compose(position, rotation, scale)
          mesh.setMatrixAt(slot, matrix)
          mesh.setColorAt(slot, color.setScalar(0.82 + 0.1 * Math.sin(phase * 13 + time)))
          slot += 1
        }
      }
    }
    mesh.count = slot
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[factorySmokeGeometry, factorySmokeMaterial, FACTORY_SMOKE_CAPACITY]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }} />
}

function SpecialBuildingPool({ specialty }: { specialty: BuildingSpecialty }) {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const lastKey = useRef('')
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const roofTint = useMemo(() => new THREE.Color(BUILDING.ROOF), [])

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const world = runtime.current.world
    if (world.key === lastKey.current) return
    lastKey.current = world.key
    let slot = 0
    for (const building of world.buildings) {
      if (building.specialty !== specialty) continue
      // Geometry is authored from y=0 to y=1, so its origin sits exactly on
      // the roof. Limit the added detail height so a high-rise host does not
      // turn a small factory crown into an accidental second tower.
      const attachmentHeight = Math.min(14, Math.max(6, building.size.y * 0.26))
      position.set(
        building.position.x,
        building.position.y + building.size.y / 2 + building.roofThickness,
        building.position.z,
      )
      const footprint = specialty === 'factory' ? 0.76 : 0.9
      scale.set(building.size.x * footprint, attachmentHeight, building.size.z * footprint)
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(slot, matrix)
      mesh.setColorAt(slot, color.set(specialty === 'factory' ? '#e8e4db' : '#d2ad67').lerp(roofTint, 0.18))
      slot += 1
    }
    mesh.count = slot
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={ref}
      args={[specialty === 'factory' ? factoryGeometry : departmentStoreGeometry, specialBuildingMaterial[specialty], WORLD_MAX_BUILDINGS]}
      frustumCulled={false}
      onUpdate={(mesh) => { mesh.count = 0 }}
    />
  )
}

const roofMaterial = (() => {
  const material = new THREE.MeshToonMaterial({ color: '#ffffff', map: roofTexture, gradientMap: toonGradient })
  cityDaylightMaterials.roof = material
  return material
})()

/**
 * The facade material, shared out so a building being carried off in the beam
 * is still drawn as the building it was rather than as a grey box.
 */
const sharedFacade: { material: THREE.MeshToonMaterial | null; geometry: THREE.BufferGeometry | null } = {
  material: null,
  geometry: null,
}

/** At most a handful are ever in the air at once. */
const LIFTED_BUILDING_CAPACITY = 8

function LiftedBuildingPool() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const euler = useMemo(() => new THREE.Euler(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const pastelWall = useMemo(() => new THREE.Color(BUILDING.FACADE_WALL), [])
  const slots = useMemo(() => new Float32Array(LIFTED_BUILDING_CAPACITY), [])
  const floors = useMemo(() => new Float32Array(LIFTED_BUILDING_CAPACITY), [])
  const geometry = useMemo(() => {
    const clone = roundedBuildingGeometry.clone()
    clone.setAttribute('facadeSlot', new THREE.InstancedBufferAttribute(slots, 1))
    clone.setAttribute('facadeFloors', new THREE.InstancedBufferAttribute(floors, 1))
    return clone
  }, [floors, slots])

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    let count = 0
    for (const object of runtime.current.beamObjects) {
      if (!object.active || object.kind !== 'building' || !object.scale) continue
      if (count >= LIFTED_BUILDING_CAPACITY) break
      // Shrinks into the craft as it is swallowed, the same as everything else.
      const swallow = object.absorbing ? Math.max(0.05, object.absorbTimer / BEAM_ABSORB_TIME) : 1
      position.set(object.position.x, object.position.y, object.position.z)
      euler.set(object.rotation.x, object.rotation.y, object.rotation.z)
      rotation.setFromEuler(euler)
      scale.set(object.scale.x * swallow, object.scale.y * swallow, object.scale.z * swallow)
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(count, matrix)
      mesh.setColorAt(count, color.set(object.color).lerp(pastelWall, 0.52))
      slots[count] = object.facade ?? 0
      floors[count] = object.floors ?? 1
      count += 1
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    geometry.getAttribute('facadeSlot').needsUpdate = true
    geometry.getAttribute('facadeFloors').needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return sharedFacade.material
    ? <instancedMesh ref={ref} args={[geometry, sharedFacade.material, LIFTED_BUILDING_CAPACITY]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }} />
    : null
}

function BuildingPool() {
  const { runtime } = useGame()
  const bodies = useRef<THREE.InstancedMesh>(null)
  const roofs = useRef<THREE.InstancedMesh>(null)
  const signs = useRef<THREE.InstancedMesh>(null)
  const verticalSigns = useRef<THREE.InstancedMesh>(null)
  const shadows = useRef<THREE.InstancedMesh>(null)
  const lastKey = useRef('')
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const planeRotation = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), [])
  const sideRotation = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), [])
  const color = useMemo(() => new THREE.Color(), [])
  const pastelWall = useMemo(() => new THREE.Color(BUILDING.FACADE_WALL), [])
  const pastelRoof = useMemo(() => new THREE.Color(BUILDING.ROOF), [])
  const hitTint = useMemo(() => new THREE.Color(BUILDING.LASER_HIT), [])
  /** Where each building sits in the instanced pool, so a hit can find it
   *  without walking the world list every frame. */
  const bodySlots = useRef(new Map<string, number>())
  /** Buildings whose colour is currently overridden, so it can be put back
   *  exactly once when the flash ends. */
  const litBodies = useRef(new Set<string>())
  const facadeSlots = useMemo(() => new Float32Array(WORLD_MAX_BUILDINGS), [])
  const facadeFloors = useMemo(() => new Float32Array(WORLD_MAX_BUILDINGS), [])
  const bodyGeometry = useMemo(() => {
    const geometry = roundedBuildingGeometry.clone()
    geometry.setAttribute('facadeSlot', new THREE.InstancedBufferAttribute(facadeSlots, 1))
    geometry.setAttribute('facadeFloors', new THREE.InstancedBufferAttribute(facadeFloors, 1))
    return geometry
  }, [facadeFloors, facadeSlots])
  // Windows glow through emissiveMap while the walls stay unlit. The atlas slot
  // is patched in rather than baked into UVs so all buildings keep sharing one
  // geometry and one draw call.
  const bodyMaterial = useMemo(() => {
    const material = new THREE.MeshToonMaterial({
      color: '#ffffff',
      map: facadeTexture,
      gradientMap: toonGradient,
      emissive: new THREE.Color('#ffffff'),
      emissiveMap: facadeEmissiveTexture,
      emissiveIntensity: 0.42,
    })
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float facadeSlot;\nattribute float facadeFloors;\nvarying float vFacadeSlot;\nvarying float vFacadeFloors;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFacadeSlot = facadeSlot;\nvFacadeFloors = facadeFloors;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying float vFacadeSlot;
          varying float vFacadeFloors;
          vec2 facadeAtlasUv(vec2 uv) {
            float tiles = ${FACADE_TILES.toFixed(1)};
            float column = mod(vFacadeSlot, tiles);
            float row = floor(vFacadeSlot / tiles);
            // Tiling vertically by the instance's floor count is what gives the
            // city a consistent storey height: without it one tile is stretched
            // over the whole face and a tower shows the same number of window
            // rows as a shop.
            vec2 tiled = vec2(uv.x, uv.y * vFacadeFloors);
            return (fract(tiled) + vec2(column, row)) / tiles;
          }`)
        .replace('#include <map_fragment>', `
          #ifdef USE_MAP
            diffuseColor *= texture2D(map, facadeAtlasUv(vMapUv));
          #endif
        `)
        .replace('#include <emissivemap_fragment>', `
          #ifdef USE_EMISSIVEMAP
            totalEmissiveRadiance *= texture2D(emissiveMap, facadeAtlasUv(vEmissiveMapUv)).rgb;
          #endif
        `)
    }
    // Distinguishes this program from any other toon material in the scene.
    material.customProgramCacheKey = () => 'facade-atlas'
    cityDaylightMaterials.facade = material
    sharedFacade.material = material
    sharedFacade.geometry = roundedBuildingGeometry
    return material
  }, [])
  const signSlots = useMemo(() => new Float32Array(WORLD_MAX_BUILDINGS), [])
  const signGeometry = useMemo(() => {
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    geometry.setAttribute('signSlot', new THREE.InstancedBufferAttribute(signSlots, 1))
    return geometry
  }, [signSlots])
  const verticalSignSlots = useMemo(() => new Float32Array(WORLD_MAX_BUILDINGS), [])
  const verticalSignGeometry = useMemo(() => {
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    geometry.setAttribute('signSlot', new THREE.InstancedBufferAttribute(verticalSignSlots, 1))
    return geometry
  }, [verticalSignSlots])
  const signMaterial = useMemo(() => {
    const material = createNeonSignMaterial(signAtlas, signGlowAtlas, SIGN_COLUMNS, SIGN_ROWS)
    cityDaylightMaterials.horizontalNeonSign = material
    return material
  }, [])
  const verticalSignMaterial = useMemo(() => {
    const material = createNeonSignMaterial(
      verticalSignAtlas,
      verticalSignGlowAtlas,
      VERTICAL_SIGN_COLUMNS,
      VERTICAL_SIGN_ROWS,
    )
    cityDaylightMaterials.verticalNeonSign = material
    return material
  }, [])

  /**
   * Light a building that has just been shot.
   *
   * Only the handful currently flashing are touched, and each is put back to
   * its own wall colour exactly once when its flash ends - repainting the whole
   * pool every frame would undo the point of caching it on the world key.
   */
  const paintLaserHits = (world: ActiveWorld) => {
    const mesh = bodies.current
    if (!mesh) return
    const flashes = runtime.current.buildingHitFlash
    let dirty = false
    const baseColour = (index: number) => color.set(world.buildings[index]!.color).lerp(pastelWall, 0.42)
    for (const id of litBodies.current) {
      if (flashes.has(id)) continue
      const index = bodySlots.current.get(id)
      if (index !== undefined && world.buildings[index]) {
        mesh.setColorAt(index, baseColour(index))
        dirty = true
      }
      litBodies.current.delete(id)
    }
    for (const [id, flash] of flashes) {
      const index = bodySlots.current.get(id)
      if (index === undefined || !world.buildings[index]) continue
      // Deliberately light. The tower has to answer the shot without turning
      // into a red block, which would read as it being on fire rather than hit.
      mesh.setColorAt(index, baseColour(index).lerp(hitTint, Math.min(1, flash) * 0.5))
      litBodies.current.add(id)
      dirty = true
    }
    if (dirty && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }

  useFrame(() => {
    if (!bodies.current || !roofs.current || !signs.current || !verticalSigns.current || !shadows.current) return
    const world = runtime.current.world
    // The laser flash runs every frame; the rest of the pool only rebuilds when
    // the streamed world changes, so it comes first and does its own repaint.
    paintLaserHits(world)
    if (world.key === lastKey.current) return
    lastKey.current = world.key
    bodySlots.current.clear()
    litBodies.current.forEach((id) => litBodies.current.delete(id))
    world.buildings.forEach((building, index) => {
      bodySlots.current.set(building.id, index)
      position.set(building.position.x, building.position.y, building.position.z)
      scale.set(building.size.x, building.size.y, building.size.z)
      matrix.compose(position, rotation, scale)
      bodies.current!.setMatrixAt(index, matrix)
      // World generation still chooses the building family. Only the displayed
      // tint is lifted toward a shared warm neutral, keeping that variation
      // without the saturated red/teal walls dominating the playfield.
      bodies.current!.setColorAt(index, color.set(building.color).lerp(pastelWall, 0.52))
      facadeSlots[index] = building.facade
      facadeFloors[index] = building.floors

      // Cornice proportions vary per building. Free variation: an identical
      // roof lip on every box is one more thing that made them read as copies.
      const slab = building.roofThickness
      position.set(building.position.x, building.size.y + slab / 2, building.position.z)
      scale.set(building.size.x * building.roofOverhang, slab, building.size.z * building.roofOverhang)
      matrix.compose(position, rotation, scale)
      roofs.current!.setMatrixAt(index, matrix)
      roofs.current!.setColorAt(index, color.set(building.roof).lerp(pastelRoof, 0.52))

      const signOnX = building.sign.side === 'x'
      const neonLayout = buildingNeonSignLayout(building)
      const neonSeed = seedForWorldCell(building.cellX, building.cellZ, 0x4e30a)
      const signWidth = Math.min(12, (signOnX ? building.size.z : building.size.x) * (0.38 + (neonSeed % 17) / 100))
      const signHeight = 2.6 + ((neonSeed >>> 9) % 11) / 10
      const signHeightRatio = 0.34 + ((neonSeed >>> 15) % 27) / 100
      position.set(
        building.position.x + (signOnX ? building.size.x / 2 + 0.22 : 0),
        Math.min(building.size.y - 2.5, Math.max(4.2, building.size.y * signHeightRatio)),
        building.position.z + (!signOnX ? building.size.z / 2 + 0.22 : 0),
      )
      scale.set(
        neonLayout === 'horizontal' ? signWidth : 0,
        neonLayout === 'horizontal' ? signHeight : 0,
        neonLayout === 'horizontal' ? 0.32 : 0,
      )
      matrix.compose(position, signOnX ? sideRotation : rotation, scale)
      signs.current!.setMatrixAt(index, matrix)
      signSlots[index] = Math.max(0, BUILDING_SIGN_LABELS.indexOf(building.sign.text as typeof BUILDING_SIGN_LABELS[number]))

      const faceSpan = signOnX ? building.size.z : building.size.x
      const verticalWidth = Math.min(4.4, Math.max(3, faceSpan * 0.21))
      const verticalHeight = Math.min(11.5, Math.max(4.8, building.size.y * 0.44))
      const edgeRoom = Math.max(0, faceSpan / 2 - verticalWidth / 2 - 0.9)
      const alongOffset = (((neonSeed >>> 20) % 201) / 100 - 1) * edgeRoom
      const verticalY = Math.min(
        building.size.y - verticalHeight / 2 - 0.65,
        Math.max(verticalHeight / 2 + 0.65, building.size.y * signHeightRatio),
      )
      position.set(
        building.position.x + (signOnX ? building.size.x / 2 + 0.23 : alongOffset),
        verticalY,
        building.position.z + (!signOnX ? building.size.z / 2 + 0.23 : alongOffset),
      )
      scale.set(
        neonLayout === 'vertical' ? verticalWidth : 0,
        neonLayout === 'vertical' ? verticalHeight : 0,
        neonLayout === 'vertical' ? 0.34 : 0,
      )
      matrix.compose(position, signOnX ? sideRotation : rotation, scale)
      verticalSigns.current!.setMatrixAt(index, matrix)
      verticalSignSlots[index] = (neonSeed >>> 24) % VERTICAL_SIGN_DESIGNS.length

      position.set(building.position.x + 1.1, 0.035, building.position.z + 1.2)
      scale.set(building.size.x * 0.88, building.size.z * 0.88, 1)
      matrix.compose(position, planeRotation, scale)
      shadows.current!.setMatrixAt(index, matrix)
    })
    for (const mesh of [bodies.current, roofs.current, signs.current, verticalSigns.current, shadows.current]) {
      mesh.count = world.buildings.length
      mesh.instanceMatrix.needsUpdate = true
    }
    signGeometry.getAttribute('signSlot').needsUpdate = true
    verticalSignGeometry.getAttribute('signSlot').needsUpdate = true
    bodyGeometry.getAttribute('facadeSlot').needsUpdate = true
    bodyGeometry.getAttribute('facadeFloors').needsUpdate = true
    if (bodies.current.instanceColor) bodies.current.instanceColor.needsUpdate = true
    if (roofs.current.instanceColor) roofs.current.instanceColor.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={shadows} args={[undefined, undefined, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <planeGeometry args={[1, 1]} />
        {/* Barely there at night. A daytime-strength blob reads as a brown
            puddle once the ground goes dark. */}
        <meshBasicMaterial color="#5f5a68" transparent opacity={0.16} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={bodies} args={[bodyGeometry, bodyMaterial, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }} />
      <instancedMesh ref={roofs} args={[roundedRoofGeometry, roofMaterial, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }} />
      <instancedMesh ref={signs} args={[signGeometry, signMaterial, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }} />
      <instancedMesh ref={verticalSigns} args={[verticalSignGeometry, verticalSignMaterial, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }} />
    </group>
  )
}


// Streetlights and roof beacons use emissive geometry rather than individual
// point lights. Their fixed pools keep the light count stable, while the pole,
// glowing fixture, and ground falloff still make each lamp read as a source.
const STREETLIGHT_CELLS = (STREETLIGHT_RADIUS_CELLS * 2 + 1) ** 2
const STREETLIGHT_COUNT = STREETLIGHT_CELLS * 2

const streetLightPoleGeometry = (() => mergeGeometries([
  new THREE.CylinderGeometry(0.16, 0.24, 4.95, 7).translate(0, 2.48, 0),
  new THREE.CylinderGeometry(0.44, 0.5, 0.16, 8).translate(0, 0.08, 0),
  // The short arm reaches over the carriageway, so the lit fixture no longer
  // appears as an unexplained floating square above its own pool.
  new THREE.BoxGeometry(0.15, 0.15, 1.12).translate(0, 4.92, 0.56),
  new THREE.BoxGeometry(0.48, 0.28, 0.62).translate(0, 4.78, 1.16),
], false)!)()

const streetLightPoleMaterial = (() => {
  const material = new THREE.MeshToonMaterial({
    color: '#55606b',
    emissive: '#1b2430',
    emissiveIntensity: 0.02,
    gradientMap: toonGradient,
  })
  cityDaylightMaterials.streetPole = material
  return material
})()

const streetLightHeadMaterial = (() => {
  const material = new THREE.MeshBasicMaterial({ color: FX.STREETLIGHT, transparent: true, opacity: 1, toneMapped: false })
  cityDaylightMaterials.streetlight = material
  return material
})()

const streetLightPoolMaterial = (() => {
  const material = new THREE.MeshBasicMaterial({
    color: FX.STREETLIGHT_CONE,
    map: radialGlowTexture,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  cityDaylightMaterials.streetPool = material
  return material
})()

function StreetLightPool() {
  const { runtime } = useGame()
  const poles = useRef<THREE.InstancedMesh>(null)
  const heads = useRef<THREE.InstancedMesh>(null)
  const pools = useRef<THREE.InstancedMesh>(null)
  const lastKey = useRef('')
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const fixturePosition = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const planeRotation = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), [])

  useFrame(() => {
    if (!poles.current || !heads.current || !pools.current) return
    const world = runtime.current.world
    const key = `${world.cellX}:${world.cellZ}|${worldPropVisibilityKey(runtime.current.destroyedWorldProps, runtime.current.beamObjects)}`
    if (key === lastKey.current) return
    lastKey.current = key
    let slot = 0
    for (const prop of utilityPolesAround(runtime.current.drone.position)) {
      if (slot >= STREETLIGHT_COUNT) break
      if (isWorldPropHidden(prop.id, runtime.current.destroyedWorldProps, runtime.current.beamObjects)) continue
      rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, prop.rotation)
      position.set(prop.position.x, prop.position.y, prop.position.z)
      scale.setScalar(1)
      matrix.compose(position, rotation, scale)
      poles.current.setMatrixAt(slot, matrix)

      fixturePosition.set(0, 4.78, 1.16).applyQuaternion(rotation).add(position)
      matrix.compose(fixturePosition, rotation, scale)
      heads.current.setMatrixAt(slot, matrix)
      position.set(prop.position.x, 0.045, prop.position.z)
      scale.set(9.5, 9.5, 1)
      matrix.compose(position, planeRotation, scale)
      pools.current.setMatrixAt(slot, matrix)
      slot += 1
    }
    poles.current.count = slot
    heads.current.count = slot
    pools.current.count = slot
    poles.current.instanceMatrix.needsUpdate = true
    heads.current.instanceMatrix.needsUpdate = true
    pools.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={poles} args={[streetLightPoleGeometry, streetLightPoleMaterial, STREETLIGHT_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }} />
      <instancedMesh ref={heads} args={[undefined, undefined, STREETLIGHT_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <boxGeometry args={[0.52, 0.26, 0.62]} />
        <primitive object={streetLightHeadMaterial} attach="material" />
      </instancedMesh>
      <instancedMesh ref={pools} args={[undefined, undefined, STREETLIGHT_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <circleGeometry args={[0.5, 24]} />
        <primitive object={streetLightPoolMaterial} attach="material" />
      </instancedMesh>
    </group>
  )
}

const beaconMaterial = (() => {
  // No vertexColors - same pitfall as the lot/ruin materials above: this
  // sphere geometry carries no per-vertex colour attribute, so the flag
  // would zero out the pulsing setColorAt tint instead of applying it.
  const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, toneMapped: false })
  cityDaylightMaterials.beacon = material
  return material
})()

// Crosswalks sit at a minority of intersections, chosen by cell hash so the
// layout is deterministic and does not shimmer as cells stream in and out.
const CROSSWALK_RADIUS_CELLS = 4
const CROSSWALK_CELLS = (CROSSWALK_RADIUS_CELLS * 2 + 1) ** 2
const CROSSWALK_SHARE = 5

function CrosswalkPool() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const lastKey = useRef('')
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const flat = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), [])
  const flatTurned = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2)), [])

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const world = runtime.current.world
    const key = `${world.cellX}:${world.cellZ}`
    if (key === lastKey.current) return
    lastKey.current = key
    let slot = 0
    for (let dz = -CROSSWALK_RADIUS_CELLS; dz <= CROSSWALK_RADIUS_CELLS; dz += 1) {
      for (let dx = -CROSSWALK_RADIUS_CELLS; dx <= CROSSWALK_RADIUS_CELLS; dx += 1) {
        if (slot >= CROSSWALK_CELLS) break
        const cellX = world.cellX + dx
        const cellZ = world.cellZ + dz
        // Park and lake tiles carry no road strip underneath,
        // so a crossing here would paint stripes straight onto open grass/water.
        if (parkClusterForCell(cellX, cellZ) || lakeClusterForCell(cellX, cellZ)) continue
        const seed = seedForWorldCell(cellX, cellZ, 0xc7085)
        if (seed % 100 >= CROSSWALK_SHARE * 4) continue
        const acrossX = seed % 2 === 0
        position.set(
          cellX * WORLD_CELL_SIZE + (acrossX ? 7 : 0),
          0.03,
          cellZ * WORLD_CELL_SIZE + (acrossX ? 0 : 7),
        )
        // Kerb to kerb. The road tile carries pavements now, so a crossing
        // sized to the old full-width strip would paint stripes over them.
        scale.set(7.2, 5.6, 1)
        matrix.compose(position, acrossX ? flatTurned : flat, scale)
        mesh.setMatrixAt(slot, matrix)
        slot += 1
      }
    }
    mesh.count = slot
    mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, CROSSWALK_CELLS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={crosswalkTexture} transparent depthWrite={false} />
    </instancedMesh>
  )
}

const BEACON_MIN_HEIGHT = 26

function RoofBeaconPool() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(0.85, 0.85, 0.85), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const base = useMemo(() => new THREE.Color(BUILDING.BEACON), [])
  const phases = useRef<number[]>([])
  const elapsed = useRef(0)
  const lastKey = useRef('')

  useFrame((_, dt) => {
    const mesh = ref.current
    if (!mesh) return
    const world = runtime.current.world
    if (world.key !== lastKey.current) {
      lastKey.current = world.key
      let slot = 0
      phases.current.length = 0
      for (const building of world.buildings) {
        if (building.size.y < BEACON_MIN_HEIGHT) continue
        position.set(building.position.x, building.size.y + building.roofThickness + 0.7, building.position.z)
        matrix.compose(position, rotation, scale)
        mesh.setMatrixAt(slot, matrix)
        phases.current.push(seedForWorldCell(building.cellX, building.cellZ, 0xbeac04) % 100 / 100 * Math.PI * 2)
        slot += 1
      }
      mesh.count = slot
      mesh.instanceMatrix.needsUpdate = true
    }
    // Throttled: a beacon blink does not need per-frame resolution, and this
    // loop touches every tall building on screen.
    elapsed.current += dt
    if (elapsed.current < 0.08) return
    elapsed.current = 0
    for (let index = 0; index < mesh.count; index += 1) {
      const pulse = 0.25 + 0.75 * Math.pow(Math.max(0, Math.sin(performance.now() * 0.0016 + phases.current[index]!)), 6)
      mesh.setColorAt(index, color.copy(base).multiplyScalar(pulse))
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
      <sphereGeometry args={[0.5, 6, 4]} />
      <primitive object={beaconMaterial} attach="material" />
    </instancedMesh>
  )
}


// Every building is a box, so the skyline reads as one shape repeated. Rooftop
// clutter is the cheapest way to break that up: the parts are merged into a
// single geometry per variant, so a variant costs one draw call no matter how
// many buildings use it.
const ROOF_STRUCTURE_VARIANTS = 4

function roofStructureGeometry(variant: number) {
  const parts: THREE.BufferGeometry[] = []
  const push = (geometry: THREE.BufferGeometry, x: number, y: number, z: number) => {
    geometry.translate(x, y, z)
    parts.push(geometry)
  }
  // Stair housing, present on every variant so there is always a hard edge
  // breaking the roofline.
  push(new THREE.BoxGeometry(2.6, 2.2, 2.6), -1.4, 1.1, 1.2)
  if (variant === 0) {
    push(new THREE.CylinderGeometry(1.15, 1.15, 2.4, 8), 1.8, 1.2, -1.4)
    push(new THREE.CylinderGeometry(0.12, 0.12, 3.4, 4), 1.8, 4.1, -1.4)
  } else if (variant === 1) {
    push(new THREE.BoxGeometry(4.4, 1.1, 3.2), 0.9, 0.55, -1.1)
    push(new THREE.CylinderGeometry(0.1, 0.1, 6.2, 4), 2.4, 3.6, -1.1)
  } else if (variant === 2) {
    // Stepped cap: a second, smaller slab set back from the edges.
    push(new THREE.BoxGeometry(6.2, 1.8, 6.2), 0, 0.9, 0)
    push(new THREE.BoxGeometry(3.4, 1.5, 3.4), 0.4, 2.5, -0.4)
  } else {
    push(new THREE.BoxGeometry(1.1, 4.6, 1.1), 2.2, 2.3, 1.9)
    push(new THREE.BoxGeometry(1.1, 3.2, 1.1), -2.3, 1.6, -2.0)
    push(new THREE.CylinderGeometry(0.09, 0.09, 4.2, 4), 0.2, 2.1, -2.4)
  }
  return mergeGeometries(parts, false)!
}

const roofStructureGeometries = Array.from({ length: ROOF_STRUCTURE_VARIANTS }, (_, index) => roofStructureGeometry(index))

/** Paints one part a flat colour so several can be merged into a single
 *  instanced mesh and still read as separate materials. */
function tintedPart(geometry: THREE.BufferGeometry, colorValue: string) {
  const result = geometry.index ? geometry.toNonIndexed() : geometry
  if (result !== geometry) geometry.dispose()
  const tint = new THREE.Color(colorValue)
  const colors = new Float32Array(result.getAttribute('position').count * 3)
  for (let index = 0; index < colors.length; index += 3) {
    colors[index] = tint.r
    colors[index + 1] = tint.g
    colors[index + 2] = tint.b
  }
  result.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return result
}

const TREE_BASE_HEIGHT = 2.8
const TREE_BASE_CROWN = 2.2

/**
 * The tree the lifted pool draws, in the two colours the static pool uses.
 *
 * It used to be one flat green for the whole model, which was survivable while
 * a tree was only ever on this pool for the second or two it spent in the beam.
 * A dropped tree now stays on this pool where it fell, for the rest of the run,
 * so it has to look like the trees still standing next to it.
 */
function liftedTreeGeometry(variant: number) {
  const trunk = tintedPart(new THREE.CylinderGeometry(
    TREE_BASE_CROWN * 0.3,
    TREE_BASE_CROWN * 0.34,
    TREE_BASE_HEIGHT,
    7,
  ).translate(0, TREE_BASE_HEIGHT / 2, 0), BUILDING.PARK_TRUNK)
  const crown = tintedPart(variant === TREE_VARIANT_SLENDER
    ? new THREE.ConeGeometry(
      TREE_BASE_CROWN * 0.72,
      TREE_BASE_CROWN * 2.4,
      8,
    ).translate(0, TREE_BASE_HEIGHT + TREE_BASE_CROWN * 0.95, 0)
    : new THREE.IcosahedronGeometry(TREE_BASE_CROWN, 1)
      .translate(0, TREE_BASE_HEIGHT + TREE_BASE_CROWN * 0.65, 0), BUILDING.PARK_LEAF)
  return mergeGeometries([trunk, crown], false)!
}

const liftedTreeGeometries = [
  liftedTreeGeometry(TREE_VARIANT_ROUND),
  liftedTreeGeometry(TREE_VARIANT_SLENDER),
]
const liftedUtilityGeometry = mergeGeometries([
  streetLightPoleGeometry,
  new THREE.BoxGeometry(0.52, 0.26, 0.62).translate(0, 4.78, 1.16),
], false)!

const LIFTED_WORLD_PROP_CAPACITY = WORLD_MAX_BUILDINGS * 3

function LiftedRoofStructurePool({ variant }: { variant: number }) {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const euler = useMemo(() => new THREE.Euler(), [])
  const color = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    let count = 0
    for (const object of runtime.current.beamObjects) {
      if (!object.active || object.kind !== 'rooftop-structure' || object.worldProp?.variant !== variant) continue
      if (count >= LIFTED_WORLD_PROP_CAPACITY) break
      const swallow = object.absorbing ? Math.max(0.05, object.absorbTimer / BEAM_ABSORB_TIME) : 1
      position.set(object.position.x, object.position.y, object.position.z)
      euler.set(object.rotation.x, object.rotation.y, object.rotation.z)
      rotation.setFromEuler(euler)
      scale.set(object.scale?.x ?? 1, object.scale?.y ?? 1, object.scale?.z ?? 1).multiplyScalar(swallow)
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(count, matrix)
      mesh.setColorAt(count, color.set(object.color))
      count += 1
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[roofStructureGeometries[variant], undefined, LIFTED_WORLD_PROP_CAPACITY]} frustumCulled={false} renderOrder={2} onUpdate={(mesh) => { mesh.count = 0 }}>
    <meshToonMaterial color="#ffffff" gradientMap={toonGradient} />
  </instancedMesh>
}

function LiftedTreePool({ variant }: { variant: number }) {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const euler = useMemo(() => new THREE.Euler(), [])
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    let count = 0
    for (const object of runtime.current.beamObjects) {
      if (!isWorldPropDisplaced(object) || object.kind !== 'tree' || object.worldProp?.variant !== variant) continue
      if (count >= LIFTED_WORLD_PROP_CAPACITY) break
      const swallow = object.absorbing ? Math.max(0.05, object.absorbTimer / BEAM_ABSORB_TIME) : 1
      position.set(object.position.x, object.position.y, object.position.z)
      euler.set(object.rotation.x, object.rotation.y, object.rotation.z)
      rotation.setFromEuler(euler)
      const height = object.worldProp.height ?? 2.8
      const crown = object.worldProp.crown ?? 2.2
      scale.set(crown / TREE_BASE_CROWN, height / TREE_BASE_HEIGHT, crown / TREE_BASE_CROWN).multiplyScalar(swallow)
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(count, matrix)
      count += 1
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[liftedTreeGeometries[variant], undefined, LIFTED_WORLD_PROP_CAPACITY]} frustumCulled={false} renderOrder={2} onUpdate={(mesh) => { mesh.count = 0 }}>
    <meshToonMaterial vertexColors />
  </instancedMesh>
}

function LiftedUtilityPolePool() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const euler = useMemo(() => new THREE.Euler(), [])
  const color = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    let count = 0
    for (const object of runtime.current.beamObjects) {
      if (!object.active || object.kind !== 'utility-pole') continue
      if (count >= LIFTED_WORLD_PROP_CAPACITY) break
      const swallow = object.absorbing ? Math.max(0.05, object.absorbTimer / BEAM_ABSORB_TIME) : 1
      position.set(object.position.x, object.position.y, object.position.z)
      euler.set(object.rotation.x, object.rotation.y, object.rotation.z)
      rotation.setFromEuler(euler)
      scale.set(object.scale?.x ?? 1, object.scale?.y ?? 1, object.scale?.z ?? 1).multiplyScalar(swallow)
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(count, matrix)
      mesh.setColorAt(count, color.set('#59616a'))
      count += 1
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[liftedUtilityGeometry, undefined, LIFTED_WORLD_PROP_CAPACITY]} frustumCulled={false} renderOrder={2} onUpdate={(mesh) => { mesh.count = 0 }}>
    <meshToonMaterial color="#ffffff" />
  </instancedMesh>
}

// The kerbside sorting station follows the reference bins: warm taupe general
// waste on the left and bright teal recycling on the right. Front faces +z
// before the per-spot rotation.
const trashBinGeometry = mergeGeometries([
  tintedPart(new THREE.BoxGeometry(0.7, 0.06, 0.54).translate(-0.36, 0.03, 0), '#5d554b'),
  tintedPart(new THREE.BoxGeometry(0.7, 0.06, 0.54).translate(0.36, 0.03, 0), '#08776e'),
  tintedPart(new THREE.BoxGeometry(0.66, 1.0, 0.56).translate(-0.36, 0.53, 0), '#756b5e'),
  tintedPart(new THREE.BoxGeometry(0.66, 1.0, 0.56).translate(0.36, 0.53, 0), '#079b8d'),
  tintedPart(new THREE.BoxGeometry(0.7, 0.1, 0.6).translate(-0.36, 1.06, 0), '#918473'),
  tintedPart(new THREE.BoxGeometry(0.7, 0.1, 0.6).translate(0.36, 1.06, 0), '#12b6a3'),
  tintedPart(new THREE.BoxGeometry(0.34, 0.12, 0.04).translate(-0.36, 0.86, 0.28), '#24211e'),
  tintedPart(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 8).rotateX(Math.PI / 2).translate(0.22, 0.87, 0.28), '#063f3b'),
  tintedPart(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 8).rotateX(Math.PI / 2).translate(0.5, 0.87, 0.28), '#063f3b'),
  tintedPart(new THREE.BoxGeometry(0.42, 0.28, 0.03).translate(-0.36, 0.5, 0.285), '#ddd5c8'),
  tintedPart(new THREE.BoxGeometry(0.42, 0.28, 0.03).translate(0.36, 0.5, 0.285), '#d8eee8'),
], false)!

const trashBinMaterial = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient })

const TRASH_BIN_COUNT = 90

function TrashBinPool() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const lastKey = useRef('')
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(1, 1, 1), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const world = runtime.current.world
    const key = `${world.cellX}:${world.cellZ}|${worldPropVisibilityKey(runtime.current.destroyedWorldProps, runtime.current.beamObjects)}`
    if (key === lastKey.current) return
    lastKey.current = key
    let slot = 0
    for (const prop of trashBinsAround(runtime.current.drone.position)) {
      if (slot >= TRASH_BIN_COUNT) break
      if (isWorldPropHidden(prop.id, runtime.current.destroyedWorldProps, runtime.current.beamObjects)) continue
      rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, prop.rotation)
      position.set(prop.position.x, prop.position.y, prop.position.z)
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(slot, matrix)
      slot += 1
    }
    mesh.count = slot
    mesh.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[trashBinGeometry, trashBinMaterial, TRASH_BIN_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }} />
}

function LiftedTrashBinPool() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const euler = useMemo(() => new THREE.Euler(), [])
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    let count = 0
    for (const object of runtime.current.beamObjects) {
      if (!object.active || object.kind !== 'trash-bin') continue
      if (count >= LIFTED_WORLD_PROP_CAPACITY) break
      const swallow = object.absorbing ? Math.max(0.05, object.absorbTimer / BEAM_ABSORB_TIME) : 1
      position.set(object.position.x, object.position.y, object.position.z)
      euler.set(object.rotation.x, object.rotation.y, object.rotation.z)
      rotation.setFromEuler(euler)
      scale.set(object.scale?.x ?? 1, object.scale?.y ?? 1, object.scale?.z ?? 1).multiplyScalar(swallow)
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(count, matrix)
      count += 1
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[trashBinGeometry, trashBinMaterial, LIFTED_WORLD_PROP_CAPACITY]} frustumCulled={false} renderOrder={2} onUpdate={(mesh) => { mesh.count = 0 }} />
}

/**
 * Litter fluttering around a bin while the beam carries it.
 *
 * Purely visual: the flecks are computed fresh each frame from the clock and
 * the particle index, so nothing is simulated, nothing lands, and nothing is
 * left behind - each fleck swirls outward and down from the carried bin and
 * fades out at the end of its short cycle.
 */
const TRASH_SCATTER_PER_BIN = 12
const TRASH_SCATTER_MAX_BINS = 4
const TRASH_SCATTER_CAPACITY = TRASH_SCATTER_PER_BIN * TRASH_SCATTER_MAX_BINS
const trashScatterColors = ['#e8e4d8', '#c9d18a', '#8fc7d8', '#e0a4b8', '#b9a27c']

function TrashScatterPool() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const euler = useMemo(() => new THREE.Euler(), [])
  const color = useMemo(() => new THREE.Color(), [])
  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    let count = 0
    const time = clock.elapsedTime
    for (const object of runtime.current.beamObjects) {
      if (!object.active || object.kind !== 'trash-bin') continue
      if (!(object.inBeam || object.tether > 0.02)) continue
      if (count + TRASH_SCATTER_PER_BIN > TRASH_SCATTER_CAPACITY) break
      for (let fleck = 0; fleck < TRASH_SCATTER_PER_BIN; fleck += 1) {
        const phase = (fleck * 0.618) % 1
        const cycle = 1.1 + (fleck % 3) * 0.35
        const life = (time / cycle + phase) % 1
        const angle = phase * Math.PI * 2 + time * (1.6 + (fleck % 4) * 0.55)
        // Spill out and flutter down below the carried bin, into the beam
        // cone the chase camera can actually see under the hull - swirling
        // above the bin instead put every fleck behind the saucer's own
        // silhouette. Large enough to read from the chase camera.
        const radius = 0.4 + life * 2.2
        position.set(
          object.position.x + Math.cos(angle) * radius,
          object.position.y + 0.6 - life * 3.1,
          object.position.z + Math.sin(angle) * radius,
        )
        euler.set(angle * 2.1, angle * 1.3, life * 8)
        rotation.setFromEuler(euler)
        const size = (1 - life) * 0.34 + 0.1
        scale.set(size, size * 0.45, size * 1.5)
        matrix.compose(position, rotation, scale)
        mesh.setMatrixAt(count, matrix)
        mesh.setColorAt(count, color.set(trashScatterColors[fleck % trashScatterColors.length]!))
        count += 1
      }
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[undefined, undefined, TRASH_SCATTER_CAPACITY]} frustumCulled={false} renderOrder={3} onUpdate={(mesh) => { mesh.count = 0 }}>
    <boxGeometry args={[1, 1, 1]} />
    <meshBasicMaterial toneMapped={false} />
  </instancedMesh>
}

// Low-rise roofs (including the rare mega-mart/hotel) now carry the same
// compact prop kit; the extra silhouette detail matters most from the top-down
// camera and costs no additional pool beyond the four existing variants.
function RoofStructurePool({ variant }: { variant: number }) {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const lastKey = useRef('')
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const euler = useMemo(() => new THREE.Euler(), [])
  const color = useMemo(() => new THREE.Color(), [])
  // Rooftop plant reads as galvanised metal and dull concrete: zinc greys
  // dominate, with a muted waterproofing green and a dark duct tone as
  // occasional detail. Duplicated entries weight the distribution. Kept light
  // enough that the pastel toon ramp never crushes them into black blocks.
  const structureTints = [
    '#BCC2C6', '#BCC2C6',
    '#A3AAAF', '#A3AAAF',
    '#8B939A',
    '#CBC6BA',
    '#6E7880',
    '#8A9384',
  ] as const

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const world = runtime.current.world
    const visibility = worldPropVisibilityKey(runtime.current.destroyedWorldProps, runtime.current.beamObjects)
    const key = `${world.key}|${visibility}`
    if (key === lastKey.current) return
    lastKey.current = key
    let slot = 0
    for (const prop of worldPropsAround(world, runtime.current.drone.position)) {
      if (prop.kind !== 'rooftop-structure' || prop.variant !== variant) continue
      if (isWorldPropHidden(prop.id, runtime.current.destroyedWorldProps, runtime.current.beamObjects)) continue
      position.set(prop.position.x, prop.position.y, prop.position.z)
      euler.set(0, prop.rotation, 0)
      rotation.setFromEuler(euler)
      scale.set(prop.scale.x, prop.scale.y, prop.scale.z)
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(slot, matrix)
      // Roof props get a light metal/stone tint independent of the building's
      // facade palette, so no cyan roof variant can leak into the skyline.
      mesh.setColorAt(slot, color.set(structureTints[(slot + variant) % structureTints.length]!))
      slot += 1
    }
    mesh.count = slot
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[roofStructureGeometries[variant], undefined, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
      {/* No vertexColors: these parts are plain box/cylinder geometry with no
          colour attribute, and enabling it makes the shader read one that is
          not there - the rooftops rendered solid black. The tint arrives via
          setColorAt, which works independently of this flag. */}
      <meshToonMaterial color="#ffffff" gradientMap={toonGradient} />
    </instancedMesh>
  )
}

const RUIN_TIERS: BuildingHeightTier[] = ['low', 'mid', 'high', 'supertall']
const ruinGeometries = RUIN_TIERS.map((_, tier) => {
  const rise = 0.55 + tier * 0.13
  return mergeGeometries([
    new THREE.BoxGeometry(0.48, rise, 0.38).translate(-0.23, rise / 2, -0.18),
    new THREE.BoxGeometry(0.34, rise * 0.58, 0.46).translate(0.28, rise * 0.29, 0.19),
    new THREE.BoxGeometry(0.26, rise * 0.36, 0.28).translate(0.05, rise * 0.18, -0.32),
  ], false)!
})

function RuinPool() {
  const { runtime } = useGame()
  const refs = [
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
    useRef<THREE.InstancedMesh>(null),
  ]
  const lastKey = useRef('')
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const color = useMemo(() => new THREE.Color(), [])

  useFrame(() => {
    if (refs.some((ref) => !ref.current)) return
    const game = runtime.current
    const key = `${game.world.key}:${game.ruinedBuildings.size}`
    if (key === lastKey.current) return
    lastKey.current = key
    const counts = [0, 0, 0, 0]
    for (const ruin of game.ruinedBuildings.values()) {
      if (Math.hypot(ruin.position.x - game.drone.position.x, ruin.position.z - game.drone.position.z) > WORLD_REMOVE_RADIUS) continue
      const tier = RUIN_TIERS.indexOf(ruin.tier)
      const mesh = refs[tier]!.current!
      const slot = counts[tier]!
      position.set(ruin.position.x, 0, ruin.position.z)
      scale.set(ruin.size.x, ruin.size.y, ruin.size.z)
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(slot, matrix)
      mesh.setColorAt(slot, color.set(ruin.color).multiplyScalar(0.52))
      counts[tier] = slot + 1
    }
    refs.forEach((ref, tier) => {
      const mesh = ref.current!
      mesh.count = counts[tier]!
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    })
  })

  return (
    <group>
      {RUIN_TIERS.map((tier, index) => (
        <instancedMesh key={tier} ref={refs[index]} args={[ruinGeometries[index], undefined, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
          {/* No vertexColors - same pitfall as RoofStructurePool below: these
              merged box geometries carry no per-vertex colour attribute, so
              the flag zeroes the shader's colour instead of tinting it.
              setColorAt's instance colour applies on its own. */}
          <meshToonMaterial gradientMap={toonGradient} />
        </instancedMesh>
      ))}
    </group>
  )
}

export const City = memo(function City() {
  return (
    <group>
      <GroundPool />
      <WaterPool />
      <BuildingPool />
      <SpecialBuildingPool specialty="factory" />
      <SpecialBuildingPool specialty="department-store" />
      <FactorySmokePool />
      <RuinPool />
      <LiftedBuildingPool />
      <MassingPool form="podium" />
      <MassingPool form="setback" />
      <EntrancePool />
      <CityLandmarks />
      {Array.from({ length: ROOF_STRUCTURE_VARIANTS }, (_, variant) => (
        <RoofStructurePool key={variant} variant={variant} />
      ))}
      {Array.from({ length: ROOF_STRUCTURE_VARIANTS }, (_, variant) => (
        <LiftedRoofStructurePool key={`lifted-${variant}`} variant={variant} />
      ))}
      <LiftedTreePool variant={TREE_VARIANT_ROUND} />
      <LiftedTreePool variant={TREE_VARIANT_SLENDER} />
      <LiftedUtilityPolePool />
      <TrashBinPool />
      <LiftedTrashBinPool />
      <TrashScatterPool />
      <CrosswalkPool />
      <StreetLightPool />
      <RoofBeaconPool />
      <DistantBuildingPool />
    </group>
  )
})
