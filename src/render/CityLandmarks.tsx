import { useFrame } from '@react-three/fiber'
import { memo, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useGame } from '../GameContext'
import { BUILDING, GROUND } from '../constants/palette'
import {
  groundLandmarkForCell,
  hasBusStop,
  isNewsTower,
  isConvenienceStore,
} from '../core/cityLandmarks'
import {
  groundCellsAround,
  seedForWorldCell,
  WORLD_CELL_SIZE,
  WORLD_MAX_BUILDINGS,
} from '../core/world'

const LANDMARK_RADIUS_CELLS = 6
const LANDMARK_CELL_COUNT = (LANDMARK_RADIUS_CELLS * 2 + 1) ** 2
const PARK_TREE_COUNT = 3

function canvasTexture(
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void,
  width = 512,
  height = 256,
) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  draw(context, width, height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  return texture
}

const convenienceStoreTexture = canvasTexture((context, width, height) => {
  context.fillStyle = '#fff2bd'
  context.fillRect(0, 0, width, height)
  context.fillStyle = '#64bba6'
  context.fillRect(0, 0, width, 42)
  context.fillRect(0, height - 42, width, 42)
  context.fillStyle = '#4b5365'
  context.font = '900 70px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('MINI MART', width / 2, height / 2 - 10)
  context.font = '700 31px sans-serif'
  context.fillStyle = '#e57882'
  context.fillText('OPEN 24 HOURS', width / 2, height / 2 + 60)
})

/**
 * A news broadcast, told entirely through composition - no writing anywhere.
 *
 * A studio backdrop, an anchor in the lower third, an over-shoulder inset, and
 * a blank lower band are enough that anyone reads "news" instantly, in any
 * language. The UFO footage that used to fill the whole screen now plays inside
 * the inset, which is what makes the anchor the subject and the sighting the
 * story rather than the other way round.
 *
 * The anchor moves a little - a slow sway, an occasional blink. Perfectly still
 * would read as a photograph on a wall; more than this would pull the eye away
 * from the city.
 */
function drawUfoNewsFrame(context: CanvasRenderingContext2D, width: number, height: number, time: number) {
  // Studio backdrop.
  const backdrop = context.createLinearGradient(0, 0, 0, height)
  backdrop.addColorStop(0, '#1b2450')
  backdrop.addColorStop(1, '#0d1230')
  context.fillStyle = backdrop
  context.fillRect(0, 0, width, height)
  context.strokeStyle = 'rgba(116,219,228,.10)'
  context.lineWidth = 2
  for (let x = 0; x < width; x += 54) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke()
  }

  // Over-shoulder inset, upper right. The sighting footage lives here.
  const insetX = width * 0.5
  const insetY = height * 0.12
  const insetW = width * 0.42
  const insetH = height * 0.38
  context.fillStyle = '#0a1a2c'
  context.fillRect(insetX, insetY, insetW, insetH)
  context.save()
  context.beginPath()
  context.rect(insetX, insetY, insetW, insetH)
  context.clip()
  drawUfoFootage(context, insetX, insetY, insetW, insetH, time)
  context.restore()
  context.strokeStyle = '#f2e2a8'
  context.lineWidth = 5
  context.strokeRect(insetX, insetY, insetW, insetH)

  drawAnchor(context, width, height, time)

  // Lower third: a caption bar with no caption, plus a blank ticker beneath.
  context.fillStyle = '#ef5265'
  context.fillRect(0, height * 0.74, width, height * 0.11)
  context.fillStyle = 'rgba(255,241,189,.85)'
  context.fillRect(width * 0.05, height * 0.775, width * 0.44, height * 0.035)
  context.fillStyle = '#101634'
  context.fillRect(0, height * 0.85, width, height * 0.15)
  context.fillStyle = 'rgba(255,241,189,.55)'
  for (let x = width * 0.04; x < width * 0.92; x += width * 0.13) {
    context.fillRect(x, height * 0.895, width * 0.09, height * 0.028)
  }

  // Live dot, the one thing allowed to pulse - it is a lamp, not information.
  context.fillStyle = `rgba(255,120,120,${0.55 + Math.sin(time * 4) * 0.35})`
  context.beginPath(); context.arc(width * 0.06, height * 0.07, 12, 0, Math.PI * 2); context.fill()
}

/** The sighting footage, drawn into whatever rectangle it is given. */
function drawUfoFootage(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  time: number,
) {
  const sky = context.createLinearGradient(0, y, 0, y + h)
  sky.addColorStop(0, '#16234a')
  sky.addColorStop(1, '#31406b')
  context.fillStyle = sky
  context.fillRect(x, y, w, h)
  // Rooftops along the bottom, so the footage reads as shot over a city.
  context.fillStyle = '#0b1024'
  for (let index = 0; index < 7; index += 1) {
    const bw = w / 7
    const bh = h * (0.16 + ((index * 37) % 11) / 40)
    context.fillRect(x + index * bw, y + h - bh, bw - 3, bh)
  }
  const ufoX = x + w * (0.3 + (0.5 + Math.sin(time * 0.82) * 0.5) * 0.4)
  const ufoY = y + h * 0.42 + Math.sin(time * 2.8) * h * 0.05
  const scale = w / 420
  context.save()
  context.translate(ufoX, ufoY)
  context.scale(scale, scale)
  context.rotate(Math.sin(time * 2.2) * 0.08)
  context.fillStyle = 'rgba(100,225,235,.22)'
  context.beginPath(); context.ellipse(0, 16, 92, 30, 0, 0, Math.PI * 2); context.fill()
  context.fillStyle = '#f4d69c'
  context.beginPath(); context.ellipse(0, 0, 72, 24, 0, 0, Math.PI * 2); context.fill()
  context.fillStyle = '#78d6df'
  context.beginPath(); context.ellipse(0, -13, 31, 22, 0, Math.PI, Math.PI * 2); context.fill()
  context.strokeStyle = '#6b527e'
  context.lineWidth = 6
  context.beginPath(); context.ellipse(0, 0, 72, 24, 0, 0, Math.PI * 2); context.stroke()
  for (let index = 0; index < 7; index += 1) {
    const angle = index / 7 * Math.PI * 2
    context.fillStyle = index % 2 ? '#66e8ee' : '#f6779f'
    context.beginPath(); context.arc(Math.cos(angle) * 53, 7 + Math.sin(angle) * 13, 5, 0, Math.PI * 2); context.fill()
  }
  context.restore()
}

/** Head and shoulders, lower left. Silhouette only - features would fight the
 *  pixel scale this is seen at. */
function drawAnchor(context: CanvasRenderingContext2D, width: number, height: number, time: number) {
  const sway = Math.sin(time * 0.9) * width * 0.006
  const nod = Math.sin(time * 1.4) * height * 0.004
  const cx = width * 0.3 + sway
  // Shoulders have to clear the caption bar at 0.74, or only a floating head
  // shows above it and the figure stops reading as a person at a desk.
  const shoulderY = height * 0.72
  context.save()

  // Shoulders, cut off by the caption bar.
  context.fillStyle = '#2f3a63'
  context.beginPath()
  context.ellipse(cx, shoulderY, width * 0.235, height * 0.2, 0, Math.PI, Math.PI * 2)
  context.fill()
  // Collar and tie, which is most of what says "presenter".
  context.fillStyle = '#e7ecf7'
  context.beginPath()
  context.moveTo(cx - width * 0.062, shoulderY - height * 0.115)
  context.lineTo(cx, shoulderY - height * 0.01)
  context.lineTo(cx + width * 0.062, shoulderY - height * 0.115)
  context.closePath()
  context.fill()
  context.fillStyle = '#ef5265'
  context.fillRect(cx - width * 0.013, shoulderY - height * 0.1, width * 0.026, height * 0.1)

  // Head.
  const headY = shoulderY - height * 0.185 + nod
  context.fillStyle = '#e8b48c'
  context.beginPath()
  context.ellipse(cx, headY, width * 0.085, height * 0.105, 0, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = '#2a2036'
  context.beginPath()
  context.ellipse(cx, headY - height * 0.05, width * 0.092, height * 0.066, 0, Math.PI, Math.PI * 2)
  context.fill()
  // Eyes close briefly on a slow cycle, which is what keeps it from reading as
  // a still image.
  const blink = Math.sin(time * 0.7) > 0.965 ? 0.18 : 1
  context.fillStyle = '#2a2036'
  for (const side of [-1, 1]) {
    context.beginPath()
    context.ellipse(cx + side * width * 0.031, headY + height * 0.005, width * 0.011, height * 0.014 * blink, 0, 0, Math.PI * 2)
    context.fill()
  }
  context.restore()
}

const ufoWarningTexture = canvasTexture((context, width, height) => drawUfoNewsFrame(context, width, height, 0), 512, 512)

const metroTexture = canvasTexture((context, width, height) => {
  context.fillStyle = '#f3df8e'
  context.fillRect(0, 0, width, height)
  context.fillStyle = '#537f9d'
  context.beginPath()
  context.arc(90, height / 2, 60, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = '#fff6d8'
  context.font = '900 74px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('M', 90, height / 2 + 2)
  context.fillStyle = '#40485d'
  context.font = '900 64px sans-serif'
  context.fillText('METRO', 325, height / 2)
})

const busTexture = canvasTexture((context, width, height) => {
  context.fillStyle = '#6aaec0'
  context.fillRect(0, 0, width, height)
  context.fillStyle = '#fff1c5'
  context.font = '900 100px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('BUS', width / 2, height / 2)
})

const parkingLinesTexture = canvasTexture((context, width, height) => {
  context.clearRect(0, 0, width, height)
  context.strokeStyle = 'rgba(255,245,205,.9)'
  context.lineWidth = 8
  context.strokeRect(14, 14, width - 28, height - 28)
  for (let x = 44; x < width - 20; x += 88) {
    context.beginPath()
    context.moveTo(x, 18)
    context.lineTo(x, height - 18)
    context.stroke()
  }
  context.fillStyle = 'rgba(105,140,173,.9)'
  context.beginPath()
  context.arc(width - 55, 55, 29, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = '#fff8dc'
  context.font = '900 38px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('P', width - 55, 57)
})

type LandmarkGlowRamp = {
  material: THREE.MeshToonMaterial
  day: number
  night: number
}

const landmarkGlowRamps: LandmarkGlowRamp[] = []

function withLandmarkGlow(material: THREE.MeshToonMaterial, day: number, night: number) {
  landmarkGlowRamps.push({ material, day, night })
  return material
}

const storeBandMaterial = withLandmarkGlow(new THREE.MeshToonMaterial({
  color: BUILDING.STORE_BAND,
  emissive: new THREE.Color(BUILDING.STORE_BAND),
}), 0.04, 0.68)

function displayMaterial(map: THREE.Texture, night: number, day = 0.05) {
  return withLandmarkGlow(new THREE.MeshToonMaterial({
    color: '#ffffff',
    map,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: map,
  }), day, night)
}

const storeSignMaterial = displayMaterial(convenienceStoreTexture, 0.9)
const warningScreenMaterial = displayMaterial(ufoWarningTexture, 1.35, 0.58)

/**
 * A crown for the news towers: two setbacks and a spire, sitting on the host
 * roof. Built as a separate merged piece rather than by changing the building
 * itself, so the tower gains a distinct silhouette without disturbing the
 * collision boxes the whole city shares.
 */
const newsTowerCrownGeometry = mergeGeometries([
  new THREE.BoxGeometry(0.74, 0.1, 0.74).translate(0, 0.05, 0),
  new THREE.BoxGeometry(0.56, 0.12, 0.56).translate(0, 0.16, 0),
  new THREE.BoxGeometry(0.34, 0.14, 0.34).translate(0, 0.29, 0),
  new THREE.CylinderGeometry(0.03, 0.06, 0.42, 6).translate(0, 0.57, 0),
  new THREE.CylinderGeometry(0.012, 0.012, 0.22, 4).translate(0, 0.88, 0),
], false)!

/**
 * A forecourt: canopy on posts with a pump island under it. Gives the tankers
 * an origin, so a truck full of fuel reads as belonging to the city rather than
 * as a hazard that wandered in from nowhere.
 */
const gasStationGeometry = mergeGeometries([
  // Canopy and its posts.
  new THREE.BoxGeometry(13, 0.9, 9).translate(0, 5.6, 0),
  new THREE.BoxGeometry(13.4, 0.5, 9.4).translate(0, 5.05, 0),
  ...[-5.4, 5.4].flatMap((x) => [-3.6, 3.6].map((z) =>
    new THREE.CylinderGeometry(0.32, 0.32, 5.1, 8).translate(x, 2.55, z),
  )),
  // Pump island.
  new THREE.BoxGeometry(7.4, 0.4, 3).translate(0, 0.2, 0),
  ...[-2.2, 2.2].map((x) => new THREE.BoxGeometry(1, 2.1, 1.2).translate(x, 1.4, 0)),
  // Kiosk off to one side.
  new THREE.BoxGeometry(6, 3.4, 5).translate(-9.5, 1.7, 0),
], false)!

const gasStationMaterial = withLandmarkGlow(
  new THREE.MeshToonMaterial({ color: '#e4e0d2', emissive: new THREE.Color('#ffcf6a') }),
  0.04,
  0.5,
)

const gasStationCanopyMaterial = withLandmarkGlow(
  new THREE.MeshToonMaterial({ color: '#d8443f', emissive: new THREE.Color('#ff6a4d') }),
  0.05,
  0.55,
)

const gasStationBandGeometry = new THREE.BoxGeometry(13.6, 0.55, 9.6)

const newsTowerCrownMaterial = withLandmarkGlow(
  new THREE.MeshToonMaterial({ color: '#8fb6cf', emissive: new THREE.Color('#7fd8ff') }),
  0.05,
  0.7,
)
const metroSignMaterial = displayMaterial(metroTexture, 0.85)
const busSignMaterial = displayMaterial(busTexture, 0.75)

export function applyLandmarkDaylight(nightFactor: number) {
  for (const ramp of landmarkGlowRamps) {
    ramp.material.emissiveIntensity = ramp.day + (ramp.night - ramp.day) * nightFactor
  }
}

function setPoolCount(mesh: THREE.InstancedMesh | null, count: number, colors = false) {
  if (!mesh) return
  mesh.count = count
  mesh.instanceMatrix.needsUpdate = true
  if (colors && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

function BuildingFeaturePool() {
  const { runtime } = useGame()
  const storeBands = useRef<THREE.InstancedMesh>(null)
  const storeSigns = useRef<THREE.InstancedMesh>(null)
  const warningScreens = useRef<THREE.InstancedMesh>(null)
  const towerCrowns = useRef<THREE.InstancedMesh>(null)
  const lastKey = useRef('')
  const lastNewsFrame = useRef(-1)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const sideRotation = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), [])

  useFrame(({ clock }) => {
    if (!storeBands.current || !storeSigns.current || !warningScreens.current || !towerCrowns.current) return
    const newsFrame = Math.floor(clock.elapsedTime * 12)
    if (newsFrame !== lastNewsFrame.current) {
      lastNewsFrame.current = newsFrame
      const canvas = ufoWarningTexture.image as HTMLCanvasElement
      const context = canvas.getContext('2d')
      if (context) {
        drawUfoNewsFrame(context, canvas.width, canvas.height, clock.elapsedTime)
        ufoWarningTexture.needsUpdate = true
      }
    }
    const world = runtime.current.world
    if (world.key === lastKey.current) return
    lastKey.current = world.key
    let storeCount = 0
    let warningCount = 0
    for (const building of world.buildings) {
      const signOnX = building.sign.side === 'x'
      if (isConvenienceStore(building)) {
        position.set(building.position.x, Math.min(3.35, building.size.y * 0.43), building.position.z)
        scale.set(building.size.x * 1.025, 1.25, building.size.z * 1.025)
        matrix.compose(position, rotation, scale)
        storeBands.current.setMatrixAt(storeCount, matrix)

        position.set(
          building.position.x + (signOnX ? building.size.x / 2 + 0.35 : 0),
          Math.min(4.25, building.size.y * 0.56),
          building.position.z + (!signOnX ? building.size.z / 2 + 0.35 : 0),
        )
        scale.set(Math.min(11, (signOnX ? building.size.z : building.size.x) * 0.68), 2.35, 0.26)
        matrix.compose(position, signOnX ? sideRotation : rotation, scale)
        storeSigns.current.setMatrixAt(storeCount, matrix)
        storeCount += 1
      }

      if (isNewsTower(building)) {
        position.set(
          building.position.x + (signOnX ? building.size.x / 2 + 0.42 : 0),
          Math.max(12, building.size.y * 0.62),
          building.position.z + (!signOnX ? building.size.z / 2 + 0.42 : 0),
        )
        scale.set(Math.min(15, (signOnX ? building.size.z : building.size.x) * 0.78), 15, 0.34)
        matrix.compose(position, signOnX ? sideRotation : rotation, scale)
        warningScreens.current.setMatrixAt(warningCount, matrix)
        // Crown scales with the host footprint so a wide tower does not get a
        // toy hat and a narrow one does not get a slab.
        const span = Math.max(building.size.x, building.size.z)
        position.set(building.position.x, building.size.y, building.position.z)
        scale.set(span, span, span)
        matrix.compose(position, rotation, scale)
        towerCrowns.current.setMatrixAt(warningCount, matrix)
        warningCount += 1
      }
    }
    setPoolCount(storeBands.current, storeCount)
    setPoolCount(storeSigns.current, storeCount)
    setPoolCount(warningScreens.current, warningCount)
    setPoolCount(towerCrowns.current, warningCount)
  })

  return (
    <group>
      <instancedMesh ref={storeBands} args={[undefined, storeBandMaterial, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={storeSigns} args={[undefined, storeSignMaterial, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={warningScreens} args={[undefined, warningScreenMaterial, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={towerCrowns} args={[newsTowerCrownGeometry, newsTowerCrownMaterial, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }} />
    </group>
  )
}

const benchGeometry = (() => {
  const seat = new THREE.BoxGeometry(3.4, 0.35, 1).translate(0, 0.8, 0)
  const back = new THREE.BoxGeometry(3.4, 1.25, 0.28).translate(0, 1.35, 0.38)
  const left = new THREE.BoxGeometry(0.28, 0.8, 0.8).translate(-1.25, 0.4, 0)
  const right = new THREE.BoxGeometry(0.28, 0.8, 0.8).translate(1.25, 0.4, 0)
  return mergeGeometries([seat, back, left, right], false)!
})()

function ParkPool() {
  const { runtime } = useGame()
  const trunks = useRef<THREE.InstancedMesh>(null)
  const crowns = useRef<THREE.InstancedMesh>(null)
  const benches = useRef<THREE.InstancedMesh>(null)
  const lastKey = useRef('')
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const euler = useMemo(() => new THREE.Euler(), [])

  useFrame(() => {
    if (!trunks.current || !crowns.current || !benches.current) return
    const world = runtime.current.world
    const key = `${world.cellX}:${world.cellZ}`
    if (key === lastKey.current) return
    lastKey.current = key
    let treeCount = 0
    let parkCount = 0
    for (const cell of groundCellsAround(runtime.current.drone.position, LANDMARK_RADIUS_CELLS)) {
      if (groundLandmarkForCell(cell) !== 'park') continue
      const centerX = (cell.cellX + 0.5) * WORLD_CELL_SIZE
      const centerZ = (cell.cellZ + 0.5) * WORLD_CELL_SIZE
      for (let tree = 0; tree < PARK_TREE_COUNT; tree += 1) {
        const seed = seedForWorldCell(cell.cellX, cell.cellZ, 0x7ee00 + tree)
        const angle = (seed % 1000) / 1000 * Math.PI * 2
        const radius = 4.5 + ((seed >>> 12) % 55) / 10
        const x = centerX + Math.cos(angle) * radius
        const z = centerZ + Math.sin(angle) * radius
        const height = 2.7 + ((seed >>> 19) % 8) * 0.12
        position.set(x, height / 2, z)
        scale.set(0.72, height, 0.72)
        matrix.compose(position, rotation, scale)
        trunks.current.setMatrixAt(treeCount, matrix)
        position.set(x, height + 1.45, z)
        scale.setScalar(2.2 + ((seed >>> 23) % 5) * 0.16)
        matrix.compose(position, rotation, scale)
        crowns.current.setMatrixAt(treeCount, matrix)
        treeCount += 1
      }
      const benchSeed = seedForWorldCell(cell.cellX, cell.cellZ, 0xbec44)
      position.set(centerX, 0, centerZ + 3.5)
      euler.set(0, (benchSeed % 4) * Math.PI / 2, 0)
      rotation.setFromEuler(euler)
      scale.setScalar(1)
      matrix.compose(position, rotation, scale)
      benches.current.setMatrixAt(parkCount, matrix)
      parkCount += 1
    }
    setPoolCount(trunks.current, treeCount)
    setPoolCount(crowns.current, treeCount)
    setPoolCount(benches.current, parkCount)
  })

  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, LANDMARK_CELL_COUNT * PARK_TREE_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <cylinderGeometry args={[0.5, 0.62, 1, 7]} />
        <meshToonMaterial color={BUILDING.PARK_TRUNK} />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, LANDMARK_CELL_COUNT * PARK_TREE_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <icosahedronGeometry args={[1, 1]} />
        <meshToonMaterial color={BUILDING.PARK_LEAF} />
      </instancedMesh>
      <instancedMesh ref={benches} args={[benchGeometry, undefined, LANDMARK_CELL_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <meshToonMaterial color={BUILDING.PARK_BENCH} />
      </instancedMesh>
    </group>
  )
}

function mergedBoxes(parts: [number, number, number, number, number, number][]) {
  return mergeGeometries(parts.map(([sx, sy, sz, x, y, z]) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z)), false)!
}

const subwayGeometry = mergedBoxes([
  [8.4, 0.7, 5.8, 0, 0.35, 0],
  [8.8, 0.35, 6.2, 0, 3.4, 0],
  [0.4, 3, 0.4, -3.7, 1.8, -2.5],
  [0.4, 3, 0.4, 3.7, 1.8, -2.5],
  [0.4, 3, 0.4, -3.7, 1.8, 2.5],
  [0.4, 3, 0.4, 3.7, 1.8, 2.5],
])

const busStopGeometry = mergedBoxes([
  [7.2, 0.32, 3.2, 0, 3.2, 0],
  [0.3, 3.1, 0.3, -3.1, 1.6, -1.25],
  [0.3, 3.1, 0.3, 3.1, 1.6, -1.25],
  [0.3, 3.1, 0.3, -3.1, 1.6, 1.25],
  [0.3, 3.1, 0.3, 3.1, 1.6, 1.25],
  [4.8, 0.35, 0.9, 0, 0.9, 0.45],
])

function cylinderBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number) {
  const direction = end.clone().sub(start)
  const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), 5)
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()))
  geometry.translate((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2)
  return geometry
}

const pylonGeometry = (() => {
  const parts: THREE.BufferGeometry[] = []
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      parts.push(cylinderBetween(new THREE.Vector3(x * 3.2, 0, z * 3.2), new THREE.Vector3(x * 0.65, 11, z * 0.65), 0.18))
    }
  }
  parts.push(...[
    cylinderBetween(new THREE.Vector3(-3.2, 0.5, -3.2), new THREE.Vector3(3.2, 0.5, 3.2), 0.12),
    cylinderBetween(new THREE.Vector3(-3.2, 0.5, 3.2), new THREE.Vector3(3.2, 0.5, -3.2), 0.12),
    cylinderBetween(new THREE.Vector3(-4.8, 8.1, 0), new THREE.Vector3(4.8, 8.1, 0), 0.18),
    cylinderBetween(new THREE.Vector3(-3.5, 10.4, 0), new THREE.Vector3(3.5, 10.4, 0), 0.16),
    cylinderBetween(new THREE.Vector3(0, 8.1, -2.8), new THREE.Vector3(0, 8.1, 2.8), 0.14),
  ])
  return mergeGeometries(parts, false)!
})()

function TransitUtilityPool() {
  const { runtime } = useGame()
  const subway = useRef<THREE.InstancedMesh>(null)
  const subwayOpenings = useRef<THREE.InstancedMesh>(null)
  const subwaySigns = useRef<THREE.InstancedMesh>(null)
  const busStops = useRef<THREE.InstancedMesh>(null)
  const busSigns = useRef<THREE.InstancedMesh>(null)
  const pylons = useRef<THREE.InstancedMesh>(null)
  const gasStations = useRef<THREE.InstancedMesh>(null)
  const gasBands = useRef<THREE.InstancedMesh>(null)
  const lastKey = useRef('')
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(1, 1, 1), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const euler = useMemo(() => new THREE.Euler(), [])

  useFrame(() => {
    if (!subway.current || !subwayOpenings.current || !subwaySigns.current || !busStops.current || !busSigns.current || !pylons.current) return
    if (!gasStations.current || !gasBands.current) return
    const world = runtime.current.world
    const key = `${world.cellX}:${world.cellZ}`
    if (key === lastKey.current) return
    lastKey.current = key
    let subwayCount = 0
    let busCount = 0
    let pylonCount = 0
    let gasCount = 0
    for (const cell of groundCellsAround(runtime.current.drone.position, LANDMARK_RADIUS_CELLS)) {
      const landmark = groundLandmarkForCell(cell)
      if (landmark !== 'subway' && landmark !== 'power-pylon' && landmark !== 'gas-station') continue
      const centerX = (cell.cellX + 0.5) * WORLD_CELL_SIZE
      const centerZ = (cell.cellZ + 0.5) * WORLD_CELL_SIZE
      const seed = seedForWorldCell(cell.cellX, cell.cellZ, 0x7a4517)
      euler.set(0, (seed % 4) * Math.PI / 2, 0)
      rotation.setFromEuler(euler)
      scale.set(1, 1, 1)

      if (landmark === 'subway') {
        position.set(centerX, 0, centerZ)
        matrix.compose(position, rotation, scale)
        subway.current.setMatrixAt(subwayCount, matrix)
        position.set(centerX, 1.7, centerZ + 2.95)
        scale.set(6.4, 2.5, 0.3)
        matrix.compose(position, rotation, scale)
        subwayOpenings.current.setMatrixAt(subwayCount, matrix)
        position.set(centerX, 4.35, centerZ + 3.12)
        scale.set(6.9, 1.6, 0.24)
        matrix.compose(position, rotation, scale)
        subwaySigns.current.setMatrixAt(subwayCount, matrix)
        subwayCount += 1
      } else if (landmark === 'gas-station') {
        position.set(centerX, 0, centerZ)
        scale.setScalar(1)
        matrix.compose(position, rotation, scale)
        gasStations.current.setMatrixAt(gasCount, matrix)
        position.set(centerX, 5.35, centerZ)
        matrix.compose(position, rotation, scale)
        gasBands.current.setMatrixAt(gasCount, matrix)
        gasCount += 1
      } else {
        position.set(centerX, 0, centerZ)
        scale.setScalar(1)
        matrix.compose(position, rotation, scale)
        pylons.current.setMatrixAt(pylonCount, matrix)
        pylonCount += 1
      }
    }
    for (const building of world.buildings) {
      if (!hasBusStop(building)) continue
      const onX = building.sign.side === 'x'
      const seed = seedForWorldCell(building.cellX, building.cellZ, 0xb0570)
      const side = seed % 2 === 0 ? -1 : 1
      const yaw = onX ? Math.PI / 2 : 0
      euler.set(0, yaw, 0)
      rotation.setFromEuler(euler)
      const x = building.position.x + (onX ? side * (building.size.x / 2 + 3.5) : 0)
      const z = building.position.z + (!onX ? side * (building.size.z / 2 + 3.5) : 0)
      position.set(x, 0, z)
      scale.set(0.82, 0.82, 0.82)
      matrix.compose(position, rotation, scale)
      busStops.current.setMatrixAt(busCount, matrix)
      position.set(x, 3.4, z + (onX ? 1.4 : side * 1.4))
      scale.set(3.8, 1.05, 0.18)
      matrix.compose(position, rotation, scale)
      busSigns.current.setMatrixAt(busCount, matrix)
      busCount += 1
    }
    for (const mesh of [subway.current, subwayOpenings.current, subwaySigns.current]) setPoolCount(mesh, subwayCount)
    for (const mesh of [busStops.current, busSigns.current]) setPoolCount(mesh, busCount)
    setPoolCount(pylons.current, pylonCount)
    setPoolCount(gasStations.current, gasCount)
    setPoolCount(gasBands.current, gasCount)
  })

  return (
    <group>
      <instancedMesh ref={subway} args={[subwayGeometry, undefined, LANDMARK_CELL_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <meshToonMaterial color={BUILDING.TRANSIT} />
      </instancedMesh>
      <instancedMesh ref={subwayOpenings} args={[undefined, undefined, LANDMARK_CELL_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <boxGeometry args={[1, 1, 1]} />
        <meshToonMaterial color={BUILDING.TRANSIT_DARK} />
      </instancedMesh>
      <instancedMesh ref={subwaySigns} args={[undefined, metroSignMaterial, LANDMARK_CELL_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={busStops} args={[busStopGeometry, undefined, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <meshToonMaterial color={BUILDING.TRANSIT} />
      </instancedMesh>
      <instancedMesh ref={busSigns} args={[undefined, busSignMaterial, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={pylons} args={[pylonGeometry, undefined, LANDMARK_CELL_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <meshToonMaterial color={BUILDING.PYLON} />
      </instancedMesh>
      <instancedMesh ref={gasStations} args={[gasStationGeometry, gasStationMaterial, LANDMARK_CELL_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }} />
      <instancedMesh ref={gasBands} args={[gasStationBandGeometry, gasStationCanopyMaterial, LANDMARK_CELL_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }} />
    </group>
  )
}

function ParkingLotPool() {
  const { runtime } = useGame()
  const markings = useRef<THREE.InstancedMesh>(null)
  const lastKey = useRef('')
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const planeRotation = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), [])

  useFrame(() => {
    if (!markings.current) return
    const world = runtime.current.world
    const key = `${world.cellX}:${world.cellZ}`
    if (key === lastKey.current) return
    lastKey.current = key
    let lotCount = 0
    for (const cell of groundCellsAround(runtime.current.drone.position, LANDMARK_RADIUS_CELLS)) {
      if (groundLandmarkForCell(cell) !== 'parking-lot') continue
      const centerX = (cell.cellX + 0.5) * WORLD_CELL_SIZE
      const centerZ = (cell.cellZ + 0.5) * WORLD_CELL_SIZE
      const seed = seedForWorldCell(cell.cellX, cell.cellZ, 0x9a4c)
      const yaw = seed % 2 === 0 ? 0 : Math.PI / 2
      rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw)

      position.set(centerX, 0.045, centerZ)
      scale.set(24, 24, 1)
      matrix.compose(position, planeRotation, scale)
      markings.current.setMatrixAt(lotCount, matrix)
      lotCount += 1

    }
    setPoolCount(markings.current, lotCount)
  })

  return (
    <group>
      <instancedMesh ref={markings} args={[undefined, undefined, LANDMARK_CELL_COUNT]} frustumCulled={false} renderOrder={1} onUpdate={(mesh) => { mesh.count = 0 }}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={parkingLinesTexture} transparent depthWrite={false} />
      </instancedMesh>
    </group>
  )
}

export const CityLandmarks = memo(function CityLandmarks() {
  return (
    <group>
      <BuildingFeaturePool />
      <ParkPool />
      <TransitUtilityPool />
      <ParkingLotPool />
    </group>
  )
})
