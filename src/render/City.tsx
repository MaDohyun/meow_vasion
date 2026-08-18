import { useFrame } from '@react-three/fiber'
import { memo, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useGame } from '../GameContext'
import { generateSkylineBlocks, SKYLINE_MAX_BLOCKS, skylineCellKey } from '../core/skyline'
import {
  BUILDING_SIGN_LABELS,
  BUILDING_SIGN_COLORS,
  groundCellsAround,
  WORLD_CELL_SIZE,
  WORLD_GROUND_RADIUS_CELLS,
  WORLD_MAX_BUILDINGS,
} from '../core/world'

const toonGradient = (() => {
  const data = new Uint8Array([45, 125, 210, 255])
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RedFormat)
  texture.needsUpdate = true
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  return texture
})()

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

const facadeTexture = pixelTexture((context) => {
  context.fillStyle = '#e7e3cf'
  context.fillRect(0, 0, 64, 64)
  context.fillStyle = 'rgba(40,32,58,.16)'
  for (let y = 0; y < 64; y += 8) context.fillRect(0, y, 64, 1)
  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      const lit = (row * 7 + column * 5) % 6 === 0
      context.fillStyle = lit ? '#fff0a2' : (row + column) % 3 === 0 ? '#33576a' : '#19394c'
      context.fillRect(5 + column * 12, 6 + row * 9, 7, 5)
      context.fillStyle = lit ? '#fffbd1' : '#52798a'
      context.fillRect(6 + column * 12, 6 + row * 9, 2, 1)
    }
  }
  context.fillStyle = '#332b45'
  context.fillRect(0, 59, 64, 5)
})

const roofTexture = pixelTexture((context) => {
  context.fillStyle = '#e7e3cf'
  context.fillRect(0, 0, 64, 64)
  context.strokeStyle = 'rgba(255,255,255,.24)'
  for (let value = 0; value <= 64; value += 8) {
    context.beginPath(); context.moveTo(value, 0); context.lineTo(value, 64); context.stroke()
    context.beginPath(); context.moveTo(0, value); context.lineTo(64, value); context.stroke()
  }
})

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

const SKYLINE_COLORS = ['#426c78', '#4d657d', '#596d78', '#3f6172', '#59657f'] as const

function DistantSkyline() {
  const { runtime } = useGame()
  const skyline = useRef<THREE.InstancedMesh>(null)
  const lastCell = useRef('')
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const color = useMemo(() => new THREE.Color(), [])

  useFrame(() => {
    if (!skyline.current) return
    const drone = runtime.current.drone
    const cell = skylineCellKey(drone.position.x, drone.position.z, drone.heading)
    if (cell.key === lastCell.current) return
    lastCell.current = cell.key
    const blocks = generateSkylineBlocks(drone.position.x, drone.position.z, drone.heading)
    blocks.forEach((block, index) => {
      position.set(block.x, block.height / 2, block.z)
      scale.set(block.width, block.height, block.depth)
      matrix.compose(position, rotation, scale)
      skyline.current!.setMatrixAt(index, matrix)
      skyline.current!.setColorAt(index, color.set(SKYLINE_COLORS[block.colorIndex] ?? SKYLINE_COLORS[0]))
    })
    skyline.current.count = blocks.length
    skyline.current.instanceMatrix.needsUpdate = true
    if (skyline.current.instanceColor) skyline.current.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh ref={skyline} args={[undefined, undefined, SKYLINE_MAX_BLOCKS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
      <boxGeometry args={[1, 1, 1]} />
      <meshToonMaterial color="#ffffff" gradientMap={toonGradient} fog />
    </instancedMesh>
  )
}

const GROUND_CELL_COUNT = (WORLD_GROUND_RADIUS_CELLS * 2 + 1) ** 2

function GroundPool() {
  const { runtime } = useGame()
  const lots = useRef<THREE.InstancedMesh>(null)
  const roads = useRef<THREE.InstancedMesh>(null)
  const lastKey = useRef('')
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const planeRotation = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), [])
  const color = useMemo(() => new THREE.Color(), [])

  useFrame(() => {
    if (!lots.current || !roads.current) return
    const drone = runtime.current.drone.position
    const world = runtime.current.world
    const key = `${world.cellX}:${world.cellZ}`
    if (key === lastKey.current) return
    lastKey.current = key
    const cells = groundCellsAround(drone)
    let roadSlot = 0
    cells.forEach((cell, index) => {
      const centerX = (cell.cellX + 0.5) * WORLD_CELL_SIZE
      const centerZ = (cell.cellZ + 0.5) * WORLD_CELL_SIZE
      position.set(centerX, 0, centerZ)
      scale.set(WORLD_CELL_SIZE + 0.08, WORLD_CELL_SIZE + 0.08, 1)
      matrix.compose(position, planeRotation, scale)
      lots.current!.setMatrixAt(index, matrix)
      const lotColor = cell.kind === 'intersection' ? '#7c806f' : cell.kind === 'empty' ? '#96936f' : '#aaa077'
      lots.current!.setColorAt(index, color.set(lotColor))

      position.set(centerX, 0.018, cell.cellZ * WORLD_CELL_SIZE)
      scale.set(WORLD_CELL_SIZE + 0.2, 7.5, 1)
      matrix.compose(position, planeRotation, scale)
      roads.current!.setMatrixAt(roadSlot, matrix)
      roadSlot += 1
      position.set(cell.cellX * WORLD_CELL_SIZE, 0.02, centerZ)
      scale.set(7.5, WORLD_CELL_SIZE + 0.2, 1)
      matrix.compose(position, planeRotation, scale)
      roads.current!.setMatrixAt(roadSlot, matrix)
      roadSlot += 1
    })
    lots.current.count = cells.length
    roads.current.count = roadSlot
    lots.current.instanceMatrix.needsUpdate = true
    roads.current.instanceMatrix.needsUpdate = true
    if (lots.current.instanceColor) lots.current.instanceColor.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={lots} args={[undefined, undefined, GROUND_CELL_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <planeGeometry args={[1, 1]} />
        <meshToonMaterial gradientMap={toonGradient} />
      </instancedMesh>
      <instancedMesh ref={roads} args={[undefined, undefined, GROUND_CELL_COUNT * 2]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#334e61" />
      </instancedMesh>
    </group>
  )
}

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
    if (bodies.current.instanceColor) bodies.current.instanceColor.needsUpdate = true
    if (roofs.current.instanceColor) roofs.current.instanceColor.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={shadows} args={[undefined, undefined, WORLD_MAX_BUILDINGS]} frustumCulled onUpdate={(mesh) => { mesh.count = 0 }}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#28313d" transparent opacity={0.28} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={bodies} args={[undefined, undefined, WORLD_MAX_BUILDINGS]} frustumCulled onUpdate={(mesh) => { mesh.count = 0 }}>
        <boxGeometry args={[1, 1, 1]} />
        <meshToonMaterial color="#ffffff" map={facadeTexture} gradientMap={toonGradient} />
      </instancedMesh>
      <instancedMesh ref={roofs} args={[undefined, undefined, WORLD_MAX_BUILDINGS]} frustumCulled onUpdate={(mesh) => { mesh.count = 0 }}>
        <boxGeometry args={[1, 1, 1]} />
        <meshToonMaterial color="#ffffff" map={roofTexture} gradientMap={toonGradient} />
      </instancedMesh>
      <instancedMesh ref={signs} args={[signGeometry, signMaterial, WORLD_MAX_BUILDINGS]} frustumCulled onUpdate={(mesh) => { mesh.count = 0 }} />
    </group>
  )
}

export const City = memo(function City() {
  return (
    <group>
      <GroundPool />
      <BuildingPool />
      <DistantSkyline />
    </group>
  )
})
