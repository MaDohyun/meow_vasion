import { useFrame } from '@react-three/fiber'
import { memo, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useGame } from '../GameContext'
import { BUILDING, FX, GROUND } from '../constants/palette'
import { radialGlowTexture } from './textures'
import {
  BUILDING_SIGN_LABELS,
  BUILDING_SIGN_COLORS,
  groundCellsAround,
  WORLD_CELL_SIZE,
  WORLD_GROUND_RADIUS_CELLS,
  WORLD_MAX_BUILDINGS,
  WORLD_MAX_DISTANT_BUILDINGS,
  WORLD_SPAWN_RADIUS,
  WORLD_LOD_RADIUS,
  seedForWorldCell,
  type GroundVariant,
} from '../core/world'

const toonGradient = (() => {
  const data = new Uint8Array([96, 158, 218, 255])
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
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  return texture
}

// Four facade variants in a 2x2 atlas. A per-instance slot picks one, so the
// skyline does not read as the same building repeated - see facadeSlot below.
const FACADE_TILES = 2
const FACADE_TILE = 64
const FACADE_SIZE = FACADE_TILE * FACADE_TILES

// Window rows/columns are laid out once and reused by both the colour map and
// the emissive map, so the glow lands exactly on the lit panes.
function forEachWindow(callback: (x: number, y: number, lit: boolean, cool: boolean, variant: number) => void) {
  for (let tile = 0; tile < FACADE_TILES * FACADE_TILES; tile += 1) {
    const originX = (tile % FACADE_TILES) * FACADE_TILE
    const originY = Math.floor(tile / FACADE_TILES) * FACADE_TILE
    for (let row = 0; row < 6; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        // A different stride per variant keeps the four patterns from lining up.
        const stride = [6, 4, 5, 3][tile]!
        const offset = [0, 2, 1, 3][tile]!
        const lit = (row * 7 + column * 5 + offset) % stride === 0
        const cool = lit && (row + column + tile) % 4 === 0
        callback(originX + 5 + column * 12, originY + 6 + row * 9, lit, cool, tile)
      }
    }
  }
}

const facadeTexture = pixelTexture((context) => {
  context.fillStyle = BUILDING.FACADE_WALL
  context.fillRect(0, 0, FACADE_SIZE, FACADE_SIZE)
  context.fillStyle = BUILDING.FACADE_SEAM
  for (let y = 0; y < FACADE_SIZE; y += 8) context.fillRect(0, y, FACADE_SIZE, 1)
  forEachWindow((x, y) => {
    context.fillStyle = BUILDING.WINDOW_DARK
    context.fillRect(x, y, 7, 5)
    context.fillStyle = BUILDING.WINDOW_DIM
    context.fillRect(x + 1, y, 2, 1)
  })
  // Street-level band stays dark so the base of every tower grounds into night.
  for (let tile = 0; tile < FACADE_TILES; tile += 1) {
    context.fillStyle = BUILDING.FACADE_BASE
    context.fillRect(0, tile * FACADE_TILE + 59, FACADE_SIZE, 5)
  }
}, FACADE_SIZE, FACADE_SIZE)

// Black everywhere except the lit panes. Fed to emissiveMap so the walls stay
// unlit while the windows carry the glow.
const facadeEmissiveTexture = pixelTexture((context) => {
  context.fillStyle = '#000000'
  context.fillRect(0, 0, FACADE_SIZE, FACADE_SIZE)
  forEachWindow((x, y, lit, cool) => {
    if (!lit) return
    context.fillStyle = cool ? BUILDING.WINDOW_COOL : BUILDING.WINDOW_LIT
    context.fillRect(x, y, 7, 5)
    context.fillStyle = BUILDING.WINDOW_LIT_HOT
    context.fillRect(x + 1, y, 2, 1)
  })
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
    context.fillStyle = index % 3 === 0 ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.16)'
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
    context.fillStyle = index % 5 === 0 ? 'rgba(180,205,255,.10)' : 'rgba(0,0,0,.22)'
    context.fillRect(x, y, 1, 1)
  }
})

const roadTexture = pixelTexture((context) => {
  context.fillStyle = GROUND.ROAD
  context.fillRect(0, 0, 128, 32)
  for (let index = 0; index < 180; index += 1) {
    const x = index * 37 % 128
    const y = index * 19 % 32
    context.fillStyle = index % 4 === 0 ? 'rgba(190,215,255,.14)' : 'rgba(0,0,0,.22)'
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
  // Kerb lines, dimmed right down: they used to be brighter than the lane
  // markings and landed on every tile seam.
  context.fillStyle = 'rgba(232,237,245,.26)'
  for (let y = 4; y < 30; y += 9) {
    context.fillRect(4, y, 8, 1)
    context.fillRect(116, y, 8, 1)
  }
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
  streetlight: null as THREE.MeshBasicMaterial | null,
  streetPool: null as THREE.MeshBasicMaterial | null,
  beacon: null as THREE.MeshBasicMaterial | null,
  road: null as THREE.MeshBasicMaterial | null,
}

/**
 * Surfaces are authored at daylight brightness and darkened by the lights, so
 * the cycle only has to handle the emissive side here: lit windows, streetlights
 * and beacons are wrong under a midday sky and ramp in with nightFactor rather
 * than switching on at a threshold.
 *
 * Roads are the exception. Their material is unlit, so the cycle dims it by hand
 * or the asphalt would stay noon-bright at midnight.
 */
export function applyCityDaylight(nightFactor: number) {
  const materials = cityDaylightMaterials
  if (materials.road) materials.road.color.setScalar(1 - nightFactor * 0.62)
  if (materials.facade) materials.facade.emissiveIntensity = 1.5 * nightFactor
  if (materials.distant) materials.distant.emissiveIntensity = 0.85 * nightFactor
  if (materials.streetlight) materials.streetlight.opacity = nightFactor
  if (materials.streetPool) materials.streetPool.opacity = 0.34 * nightFactor
  if (materials.beacon) materials.beacon.opacity = nightFactor
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
    context.strokeStyle = BUILDING_SIGN_COLORS[index % BUILDING_SIGN_COLORS.length]!
    context.lineWidth = 5
    context.strokeRect(x + 3, y + 3, slotWidth - 6, slotHeight - 6)
    context.fillStyle = BUILDING_SIGN_COLORS[index % BUILDING_SIGN_COLORS.length]!
    context.fillText(label, x + slotWidth / 2, y + slotHeight / 2)
  })
}, 512, 384)

const distantBuildingMaterial = (() => {
  const material = new THREE.MeshToonMaterial({
    color: '#ffffff',
    gradientMap: toonGradient,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: distantWindowTexture,
    emissiveIntensity: 0.85,
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
  const material = new THREE.MeshToonMaterial({ color: '#ffffff', map: lotTexture, gradientMap: toonGradient })
  cityDaylightMaterials.lot = material
  return material
})()

const roadMaterial = (() => {
  const material = new THREE.MeshBasicMaterial({ color: '#ffffff', map: roadTexture })
  cityDaylightMaterials.road = material
  return material
})()

function GroundPool() {
  const { runtime } = useGame()
  const lots = useRef<THREE.InstancedMesh>(null)
  const roads = useRef<THREE.InstancedMesh>(null)
  const lastKey = useRef('')
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const planeRotation = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), [])
  const verticalRoadRotation = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2)), [])
  const color = useMemo(() => new THREE.Color(), [])

  useFrame(() => {
    if (!lots.current || !roads.current) return
    const drone = runtime.current.drone.position
    const world = runtime.current.world
    const key = `${world.cellX}:${world.cellZ}`
    if (key === lastKey.current) return
    lastKey.current = key
    const cells = groundCellsAround(drone)
    let lotSlot = 0
    let roadSlot = 0
    cells.forEach((cell) => {
      const centerX = (cell.cellX + 0.5) * WORLD_CELL_SIZE
      const centerZ = (cell.cellZ + 0.5) * WORLD_CELL_SIZE
      const definedLot = cell.ground === 'parking' || cell.ground === 'plaza' || cell.ground === 'pond'
      // Lowered from 68%: at night the tile grid was the most obvious thing on
      // the ground, which is the opposite of what should draw the eye.
      if (definedLot && cell.seed % 100 < 45 && lotSlot < GROUND_CELL_COUNT) {
        const lotSize = WORLD_CELL_SIZE - 5 - (cell.seed >>> 9) % 5
        const jitterX = ((cell.seed >>> 17) % 5) - 2
        const jitterZ = ((cell.seed >>> 22) % 5) - 2
        position.set(centerX + jitterX, 0, centerZ + jitterZ)
        scale.set(lotSize, lotSize, 1)
        matrix.compose(position, planeRotation, scale)
        lots.current!.setMatrixAt(lotSlot, matrix)
        lots.current!.setColorAt(lotSlot, color.set(GROUND_COLORS[cell.ground]))
        lotSlot += 1
      }

      position.set(centerX, 0.018, cell.cellZ * WORLD_CELL_SIZE)
      scale.set(WORLD_CELL_SIZE + 0.2, 7.5, 1)
      matrix.compose(position, planeRotation, scale)
      roads.current!.setMatrixAt(roadSlot, matrix)
      roadSlot += 1
      position.set(cell.cellX * WORLD_CELL_SIZE, 0.02, centerZ)
      scale.set(WORLD_CELL_SIZE + 0.2, 7.5, 1)
      matrix.compose(position, verticalRoadRotation, scale)
      roads.current!.setMatrixAt(roadSlot, matrix)
      roadSlot += 1
    })
    lots.current.count = lotSlot
    roads.current.count = roadSlot
    lots.current.instanceMatrix.needsUpdate = true
    roads.current.instanceMatrix.needsUpdate = true
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
    </group>
  )
}

const roofMaterial = (() => {
  const material = new THREE.MeshToonMaterial({ color: '#ffffff', map: roofTexture, gradientMap: toonGradient })
  cityDaylightMaterials.roof = material
  return material
})()

function BuildingPool() {
  const { runtime } = useGame()
  const bodies = useRef<THREE.InstancedMesh>(null)
  const roofs = useRef<THREE.InstancedMesh>(null)
  const signs = useRef<THREE.InstancedMesh>(null)
  const shadows = useRef<THREE.InstancedMesh>(null)
  const lastKey = useRef('')
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const planeRotation = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), [])
  const sideRotation = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), [])
  const color = useMemo(() => new THREE.Color(), [])
  const facadeSlots = useMemo(() => new Float32Array(WORLD_MAX_BUILDINGS), [])
  const bodyGeometry = useMemo(() => {
    const geometry = roundedBuildingGeometry.clone()
    geometry.setAttribute('facadeSlot', new THREE.InstancedBufferAttribute(facadeSlots, 1))
    return geometry
  }, [facadeSlots])
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
      emissiveIntensity: 1.35,
    })
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float facadeSlot;\nvarying float vFacadeSlot;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFacadeSlot = facadeSlot;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying float vFacadeSlot;
          vec2 facadeAtlasUv(vec2 uv) {
            float tiles = ${FACADE_TILES.toFixed(1)};
            float column = mod(vFacadeSlot, tiles);
            float row = floor(vFacadeSlot / tiles);
            return (fract(uv) + vec2(column, row)) / tiles;
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
    return material
  }, [])
  const signSlots = useMemo(() => new Float32Array(WORLD_MAX_BUILDINGS), [])
  const signGeometry = useMemo(() => {
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    geometry.setAttribute('signSlot', new THREE.InstancedBufferAttribute(signSlots, 1))
    return geometry
  }, [signSlots])
  const signMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { map: { value: signAtlas } },
    vertexShader: `
      attribute float signSlot;
      varying vec2 vAtlasUv;
      void main() {
        float column = mod(signSlot, ${SIGN_COLUMNS.toFixed(1)});
        float row = floor(signSlot / ${SIGN_COLUMNS.toFixed(1)});
        vAtlasUv = vec2((uv.x + column) / ${SIGN_COLUMNS.toFixed(1)}, (uv.y + (${(SIGN_ROWS - 1).toFixed(1)} - row)) / ${SIGN_ROWS.toFixed(1)});
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      varying vec2 vAtlasUv;
      void main() { gl_FragColor = texture2D(map, vAtlasUv); }
    `,
  }), [])

  useFrame(() => {
    if (!bodies.current || !roofs.current || !signs.current || !shadows.current) return
    const world = runtime.current.world
    if (world.key === lastKey.current) return
    lastKey.current = world.key
    world.buildings.forEach((building, index) => {
      position.set(building.position.x, building.position.y, building.position.z)
      scale.set(building.size.x, building.size.y, building.size.z)
      matrix.compose(position, rotation, scale)
      bodies.current!.setMatrixAt(index, matrix)
      bodies.current!.setColorAt(index, color.set(building.color))
      facadeSlots[index] = seedForWorldCell(building.cellX, building.cellZ, 0xfacade) % (FACADE_TILES * FACADE_TILES)

      position.set(building.position.x, building.size.y + 0.38, building.position.z)
      scale.set(building.size.x * 0.94, 0.76, building.size.z * 0.94)
      matrix.compose(position, rotation, scale)
      roofs.current!.setMatrixAt(index, matrix)
      roofs.current!.setColorAt(index, color.set(building.roof))

      const signOnX = building.sign.side === 'x'
      position.set(
        building.position.x + (signOnX ? building.size.x / 2 + 0.22 : 0),
        Math.min(building.size.y - 2.5, Math.max(4.2, building.size.y * 0.46)),
        building.position.z + (!signOnX ? building.size.z / 2 + 0.22 : 0),
      )
      scale.set(Math.min(13, (signOnX ? building.size.z : building.size.x) * 0.62), 3.8, 0.32)
      matrix.compose(position, signOnX ? sideRotation : rotation, scale)
      signs.current!.setMatrixAt(index, matrix)
      signSlots[index] = Math.max(0, BUILDING_SIGN_LABELS.indexOf(building.sign.text as typeof BUILDING_SIGN_LABELS[number]))

      position.set(building.position.x + 1.1, 0.035, building.position.z + 1.2)
      scale.set(building.size.x * 0.88, building.size.z * 0.88, 1)
      matrix.compose(position, planeRotation, scale)
      shadows.current!.setMatrixAt(index, matrix)
    })
    for (const mesh of [bodies.current, roofs.current, signs.current, shadows.current]) {
      mesh.count = world.buildings.length
      mesh.instanceMatrix.needsUpdate = true
    }
    signGeometry.getAttribute('signSlot').needsUpdate = true
    bodyGeometry.getAttribute('facadeSlot').needsUpdate = true
    if (bodies.current.instanceColor) bodies.current.instanceColor.needsUpdate = true
    if (roofs.current.instanceColor) roofs.current.instanceColor.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={shadows} args={[undefined, undefined, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <planeGeometry args={[1, 1]} />
        {/* Barely there at night. A daytime-strength blob reads as a brown
            puddle once the ground goes dark. */}
        <meshBasicMaterial color="#05070f" transparent opacity={0.30} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={bodies} args={[bodyGeometry, bodyMaterial, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }} />
      <instancedMesh ref={roofs} args={[roundedRoofGeometry, roofMaterial, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }} />
      <instancedMesh ref={signs} args={[signGeometry, signMaterial, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }} />
    </group>
  )
}


// Streetlights and roof beacons are emissive geometry, not lights. Adding real
// point lights would change the scene light count and force a full material
// recompile, which is a visible stall.
const STREETLIGHT_RADIUS_CELLS = 5
const STREETLIGHT_CELLS = (STREETLIGHT_RADIUS_CELLS * 2 + 1) ** 2
const STREETLIGHT_COUNT = STREETLIGHT_CELLS * 2

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
    opacity: 0.34,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  cityDaylightMaterials.streetPool = material
  return material
})()

function StreetLightPool() {
  const { runtime } = useGame()
  const heads = useRef<THREE.InstancedMesh>(null)
  const pools = useRef<THREE.InstancedMesh>(null)
  const lastKey = useRef('')
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const planeRotation = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), [])

  useFrame(() => {
    if (!heads.current || !pools.current) return
    const world = runtime.current.world
    const key = `${world.cellX}:${world.cellZ}`
    if (key === lastKey.current) return
    lastKey.current = key
    let slot = 0
    for (let dz = -STREETLIGHT_RADIUS_CELLS; dz <= STREETLIGHT_RADIUS_CELLS; dz += 1) {
      for (let dx = -STREETLIGHT_RADIUS_CELLS; dx <= STREETLIGHT_RADIUS_CELLS; dx += 1) {
        const cellX = world.cellX + dx
        const cellZ = world.cellZ + dz
        // One lamp on each of the cell's two roads, set back to the kerb.
        const spots: [number, number][] = [
          [cellX * WORLD_CELL_SIZE + 4.6, (cellZ + 0.5) * WORLD_CELL_SIZE],
          [(cellX + 0.5) * WORLD_CELL_SIZE, cellZ * WORLD_CELL_SIZE + 4.6],
        ]
        for (const [x, z] of spots) {
          if (slot >= STREETLIGHT_COUNT) break
          position.set(x, 6.2, z)
          scale.set(0.9, 0.34, 0.9)
          matrix.compose(position, rotation, scale)
          heads.current!.setMatrixAt(slot, matrix)
          position.set(x, 0.045, z)
          scale.set(11, 11, 1)
          matrix.compose(position, planeRotation, scale)
          pools.current!.setMatrixAt(slot, matrix)
          slot += 1
        }
      }
    }
    heads.current.count = slot
    pools.current.count = slot
    heads.current.instanceMatrix.needsUpdate = true
    pools.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={heads} args={[undefined, undefined, STREETLIGHT_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <boxGeometry args={[1, 1, 1]} />
        <primitive object={streetLightHeadMaterial} attach="material" />
      </instancedMesh>
      <instancedMesh ref={pools} args={[undefined, undefined, STREETLIGHT_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <circleGeometry args={[0.5, 14]} />
        <primitive object={streetLightPoolMaterial} attach="material" />
      </instancedMesh>
    </group>
  )
}

const beaconMaterial = (() => {
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 1, toneMapped: false })
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
        const seed = seedForWorldCell(cellX, cellZ, 0xc7085)
        if (seed % 100 >= CROSSWALK_SHARE * 4) continue
        const acrossX = seed % 2 === 0
        position.set(
          cellX * WORLD_CELL_SIZE + (acrossX ? 7 : 0),
          0.03,
          cellZ * WORLD_CELL_SIZE + (acrossX ? 0 : 7),
        )
        scale.set(7.2, 6.4, 1)
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
        position.set(building.position.x, building.size.y + 1.1, building.position.z)
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

const ROOF_STRUCTURE_MIN_HEIGHT = 14

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

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const world = runtime.current.world
    if (world.key === lastKey.current) return
    lastKey.current = world.key
    let slot = 0
    for (const building of world.buildings) {
      if (building.size.y < ROOF_STRUCTURE_MIN_HEIGHT) continue
      const seed = seedForWorldCell(building.cellX, building.cellZ, 0x700f7)
      if (seed % ROOF_STRUCTURE_VARIANTS !== variant) continue
      position.set(building.position.x, building.size.y + 0.7, building.position.z)
      euler.set(0, (seed >>> 5) % 4 * Math.PI / 2, 0)
      rotation.setFromEuler(euler)
      // Keep the clutter inside the roof footprint on narrow buildings.
      const fit = Math.min(1, Math.min(building.size.x, building.size.z) / 9)
      scale.setScalar(0.55 + fit * 0.55)
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(slot, matrix)
      mesh.setColorAt(slot, color.set(building.roof))
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
      <meshToonMaterial gradientMap={toonGradient} />
    </instancedMesh>
  )
}

export const City = memo(function City() {
  return (
    <group>
      <GroundPool />
      <BuildingPool />
      {Array.from({ length: ROOF_STRUCTURE_VARIANTS }, (_, variant) => (
        <RoofStructurePool key={variant} variant={variant} />
      ))}
      <CrosswalkPool />
      <StreetLightPool />
      <RoofBeaconPool />
      <DistantBuildingPool />
    </group>
  )
})
