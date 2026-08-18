import { Edges, Text } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { memo, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useGame } from '../GameContext'
import { generateSkylineBlocks, SKYLINE_MAX_BLOCKS, skylineCellKey } from '../core/skyline'
import { renderOffsetsAround } from '../core/torus'
import { BUILDINGS, DISTRICT_OFFSETS, MAP_SIZE } from './cityData'

const toonGradient = (() => {
  const data = new Uint8Array([45, 125, 210, 255])
  const texture = new THREE.DataTexture(data, 4, 1, THREE.RedFormat)
  texture.needsUpdate = true
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  return texture
})()

function pixelTexture(draw: (context: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')!
  draw(context)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  return texture
}

function makeFacadeTexture(base: string, seed: number) {
  return pixelTexture((context) => {
    context.fillStyle = base
    context.fillRect(0, 0, 64, 64)
    context.fillStyle = 'rgba(45,35,62,.18)'
    for (let y = 0; y < 64; y += 8) context.fillRect(0, y, 64, 1)
    for (let row = 0; row < 6; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        const lit = (row * 7 + column * 5 + seed) % 5 === 0
        context.fillStyle = lit ? '#ffe98a' : (row + column + seed) % 3 === 0 ? '#284b65' : '#183548'
        context.fillRect(5 + column * 12, 6 + row * 9, 7, 5)
        context.fillStyle = lit ? '#fff8c5' : '#416b7c'
        context.fillRect(6 + column * 12, 6 + row * 9, 2, 1)
      }
    }
    context.fillStyle = 'rgba(255,255,255,.18)'
    context.fillRect((seed * 7) % 52, 0, 2, 64)
    context.fillStyle = '#29243e'
    context.fillRect(0, 59, 64, 5)
  })
}

function makeRoofTexture(base: string, seed: number) {
  return pixelTexture((context) => {
    context.fillStyle = base
    context.fillRect(0, 0, 64, 64)
    context.strokeStyle = 'rgba(255,255,255,.14)'
    context.lineWidth = 1
    for (let value = 0; value <= 64; value += 8) {
      context.beginPath(); context.moveTo(value, 0); context.lineTo(value, 64); context.stroke()
      context.beginPath(); context.moveTo(0, value); context.lineTo(64, value); context.stroke()
    }
    context.fillStyle = 'rgba(45,35,62,.22)'
    context.fillRect(5 + seed * 3 % 40, 8 + seed * 5 % 38, 14, 9)
  })
}

const facadeTextures = new Map<string, THREE.CanvasTexture>()
const roofTextures = new Map<string, THREE.CanvasTexture>()
const SKYLINE_COLORS = ['#426c78', '#4d657d', '#596d78', '#3f6172', '#59657f'] as const

function sharedFacadeTexture(base: string, seed: number) {
  const key = `${base}:${seed}`
  const cached = facadeTextures.get(key)
  if (cached) return cached
  const texture = makeFacadeTexture(base, seed)
  facadeTextures.set(key, texture)
  return texture
}

function sharedRoofTexture(base: string, seed: number) {
  const key = `${base}:${seed}`
  const cached = roofTextures.get(key)
  if (cached) return cached
  const texture = makeRoofTexture(base, seed)
  roofTextures.set(key, texture)
  return texture
}

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
    <instancedMesh ref={skyline} args={[undefined, undefined, SKYLINE_MAX_BLOCKS]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshToonMaterial color="#ffffff" gradientMap={toonGradient} fog />
    </instancedMesh>
  )
}

function RoadMarkings() {
  const stripes = useMemo(() => {
    const result: Array<[number, number, number, number]> = []
    for (let i = -8; i <= 8; i += 1) {
      result.push([i * 11, 0, 2.6, 0.32])
      result.push([0, i * 11, 0.32, 2.6])
    }
    return result
  }, [])
  return (
    <group position-y={0.022}>
      {stripes.map(([x, z, sx, sz], index) => (
        <mesh key={index} rotation-x={-Math.PI / 2} position={[x, 0, z]}>
          <planeGeometry args={[sx, sz]} />
          <meshBasicMaterial color="#fff0b5" transparent opacity={0.68} />
        </mesh>
      ))}
      {Array.from({ length: 8 }, (_, index) => (
        <group key={`cross-${index}`}>
          <mesh rotation-x={-Math.PI / 2} position={[-9.5 + index * 2.7, 0.01, -17]}>
            <planeGeometry args={[1.45, 7]} />
            <meshBasicMaterial color="#f6e7b2" transparent opacity={0.8} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position={[-17, 0.01, -9.5 + index * 2.7]}>
            <planeGeometry args={[7, 1.45]} />
            <meshBasicMaterial color="#f6e7b2" transparent opacity={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function Building({ building }: { building: (typeof BUILDINGS)[number] }) {
  const seed = Number(building.id.match(/\d+/)?.[0] ?? 1)
  const facadeTexture = useMemo(() => sharedFacadeTexture(building.color, seed), [building.color, seed])
  const roofTexture = useMemo(() => sharedRoofTexture(building.roof, seed), [building.roof, seed])
  const signRotation: [number, number, number] = building.sign?.side === 'x'
    ? [0, -Math.PI / 2, 0]
    : [0, 0, 0]
  const signPosition: [number, number, number] = building.sign?.side === 'x'
    ? [building.size.x / 2 + 0.03, building.size.y * 0.18, 0]
    : [0, building.size.y * 0.18, building.size.z / 2 + 0.03]
  return (
    <group position={[building.position.x, building.position.y, building.position.z]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[building.size.x, building.size.y, building.size.z]} />
        <meshToonMaterial color="#ffffff" map={facadeTexture} gradientMap={toonGradient} />
        <Edges threshold={12} color="#332b45" />
      </mesh>
      <mesh position-y={building.size.y / 2 + 0.35}>
        <boxGeometry args={[building.size.x * 0.94, 0.7, building.size.z * 0.94]} />
        <meshToonMaterial color="#ffffff" map={roofTexture} gradientMap={toonGradient} />
        <Edges color="#44374e" />
      </mesh>
      <group position-y={building.size.y / 2 + 0.9}>
        <mesh position={[0, 0.25, -building.size.z * 0.43]}>
          <boxGeometry args={[building.size.x * 0.88, 0.65, 0.35]} />
          <meshToonMaterial color={building.roof} />
        </mesh>
        <mesh position={[0, 0.25, building.size.z * 0.43]}>
          <boxGeometry args={[building.size.x * 0.88, 0.65, 0.35]} />
          <meshToonMaterial color={building.roof} />
        </mesh>
        <mesh position={[-building.size.x * 0.43, 0.25, 0]}>
          <boxGeometry args={[0.35, 0.65, building.size.z * 0.88]} />
          <meshToonMaterial color={building.roof} />
        </mesh>
        <mesh position={[building.size.x * 0.43, 0.25, 0]}>
          <boxGeometry args={[0.35, 0.65, building.size.z * 0.88]} />
          <meshToonMaterial color={building.roof} />
        </mesh>
        {seed % 2 === 0 ? (
          <group position={[building.size.x * 0.18, 1.4, -building.size.z * 0.12]}>
            <mesh castShadow>
              <cylinderGeometry args={[2.3, 2.6, 2.8, 12]} />
              <meshToonMaterial color="#d4e6d6" gradientMap={toonGradient} />
              <Edges color="#4f5360" />
            </mesh>
            <mesh position-y={1.7}>
              <cylinderGeometry args={[0.16, 0.16, 1.2, 6]} />
              <meshBasicMaterial color="#4e4154" />
            </mesh>
          </group>
        ) : (
          <group position={[-building.size.x * 0.18, 1.1, building.size.z * 0.12]}>
            <mesh castShadow>
              <boxGeometry args={[4.5, 2.2, 3.2]} />
              <meshToonMaterial color="#9fc2b8" gradientMap={toonGradient} />
              <Edges color="#46505c" />
            </mesh>
            <mesh position={[0, 0, 1.62]}>
              <circleGeometry args={[0.75, 12]} />
              <meshBasicMaterial color="#4c5260" />
            </mesh>
          </group>
        )}
        {building.id.startsWith('b6-') && (
          <mesh rotation-x={Math.PI / 2} position-y={0.42}>
            <torusGeometry args={[4.2, 0.32, 6, 24]} />
            <meshBasicMaterial color="#ffe36e" />
          </mesh>
        )}
      </group>
      {building.sign && (
        <group position={signPosition} rotation={signRotation}>
          <mesh castShadow>
            <boxGeometry args={[Math.min(14, building.size.x * 0.58), 4.4, 0.28]} />
            <meshToonMaterial color="#302942" emissive="#161122" emissiveIntensity={0.5} />
            <Edges color={building.sign.color} />
          </mesh>
          <Text position-z={0.17} fontSize={1.65} color={building.sign.color} anchorX="center" anchorY="middle">
            {building.sign.text}
          </Text>
        </group>
      )}
      <mesh position={[0, -building.size.y / 2 + 2.2, building.size.z / 2 + 0.9]} castShadow>
        <boxGeometry args={[building.size.x * 0.72, 0.35, 2]} />
        <meshToonMaterial color={seed % 2 === 0 ? '#ffdf69' : '#5ce0e8'} />
        <Edges color="#473650" />
      </mesh>
    </group>
  )
}

function StreetLights() {
  const positions = [-78, -43, -5, 33, 76]
  return (
    <group>
      {positions.flatMap((value, index) => [
        <group key={`x-${value}`} position={[value, 0, 16]}>
          <mesh position-y={2.5}><cylinderGeometry args={[0.08, 0.12, 5, 6]} /><meshBasicMaterial color="#3a344a" /></mesh>
          <mesh position={[0.45, 5, 0]}><boxGeometry args={[1.1, 0.22, 0.4]} /><meshBasicMaterial color="#fff2a1" /></mesh>
        </group>,
        <group key={`z-${value}`} position={[-16, 0, value]} rotation-y={Math.PI / 2}>
          <mesh position-y={2.5}><cylinderGeometry args={[0.08, 0.12, 5, 6]} /><meshBasicMaterial color="#3a344a" /></mesh>
          <mesh position={[0.45, 5, 0]}><boxGeometry args={[1.1, 0.22, 0.4]} /><meshBasicMaterial color="#fff2a1" /></mesh>
        </group>,
      ])}
    </group>
  )
}

const DISTRICT_BUILDINGS = DISTRICT_OFFSETS.map((_, districtIndex) =>
  BUILDINGS.filter((building) => building.id.endsWith(`-d${districtIndex}`)),
)

function District({
  offset,
  districtIndex,
  register,
}: {
  offset: (typeof DISTRICT_OFFSETS)[number]
  districtIndex: number
  register: (group: THREE.Group | null) => void
}) {
  const buildings = DISTRICT_BUILDINGS[districtIndex] ?? []
  return (
    <group ref={register} position={[offset.x, 0, offset.z]}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.024} receiveShadow>
        <planeGeometry args={[190, 25]} />
        <meshToonMaterial color="#324e63" gradientMap={toonGradient} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.026} receiveShadow>
        <planeGeometry args={[25, 190]} />
        <meshToonMaterial color="#324e63" gradientMap={toonGradient} />
      </mesh>
      <RoadMarkings />
      <group position={[-offset.x, 0, -offset.z]}>
        {buildings.map((building) => (
          <mesh key={`walk-${building.id}`} position={[building.position.x, 0.14, building.position.z]} receiveShadow>
            <boxGeometry args={[building.size.x + 4, 0.28, building.size.z + 4]} />
            <meshToonMaterial color="#c9b889" gradientMap={toonGradient} />
            <Edges color="#6d6160" />
          </mesh>
        ))}
        {buildings.map((building) => <Building key={building.id} building={building} />)}
      </group>
      <StreetLights />
      <mesh position={[0, 4, 0]}>
        <boxGeometry args={[18, 0.8, 4]} />
        <meshToonMaterial color="#d9c9a6" gradientMap={toonGradient} />
        <Edges color="#53485d" />
      </mesh>
      <mesh position={[-9, 2, 0]}>
        <boxGeometry args={[0.8, 4, 4]} />
        <meshToonMaterial color="#d9c9a6" gradientMap={toonGradient} />
      </mesh>
      <mesh position={[9, 2, 0]}>
        <boxGeometry args={[0.8, 4, 4]} />
        <meshToonMaterial color="#d9c9a6" gradientMap={toonGradient} />
      </mesh>
    </group>
  )
}

function CityTile({
  slot,
  offset,
  registerTile,
  registerDistrict,
}: {
  slot: number
  offset: { x: number; z: number }
  registerTile: (group: THREE.Group | null) => void
  registerDistrict: (districtIndex: number, group: THREE.Group | null) => void
}) {
  return (
    <group ref={registerTile} position={[offset.x, 0, offset.z]}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.01} receiveShadow>
        <planeGeometry args={[MAP_SIZE + 2, MAP_SIZE + 2]} />
        <meshToonMaterial color="#8a8b75" gradientMap={toonGradient} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.022} receiveShadow>
        <ringGeometry args={[164, 196, 64]} />
        <meshToonMaterial color="#324e63" gradientMap={toonGradient} />
      </mesh>
      {DISTRICT_OFFSETS.map((districtOffset, districtIndex) => (
        <District
          key={districtIndex}
          offset={districtOffset}
          districtIndex={districtIndex}
          register={(group) => registerDistrict(slot * DISTRICT_OFFSETS.length + districtIndex, group)}
        />
      ))}
    </group>
  )
}

export const City = memo(function City({ tileX, tileZ }: { tileX: number; tileZ: number }) {
  const tileGroups = useRef<Array<THREE.Group | null>>([])
  const districtGroups = useRef<Array<THREE.Group | null>>([])
  const frustum = useMemo(() => new THREE.Frustum(), [])
  const projection = useMemo(() => new THREE.Matrix4(), [])
  const tileBox = useMemo(() => new THREE.Box3(), [])
  const districtSphere = useMemo(() => new THREE.Sphere(new THREE.Vector3(), 112), [])
  const cameraPoint = useMemo(() => new THREE.Vector3(), [])
  const offsets = useMemo(
    () => renderOffsetsAround({ x: tileX * MAP_SIZE, z: tileZ * MAP_SIZE }, MAP_SIZE),
    [tileX, tileZ],
  )
  useFrame(({ camera }) => {
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(projection)
    cameraPoint.copy(camera.position)
    offsets.forEach((offset, slot) => {
      const tile = tileGroups.current[slot]
      tileBox.min.set(offset.x - MAP_SIZE / 2, -1, offset.z - MAP_SIZE / 2)
      tileBox.max.set(offset.x + MAP_SIZE / 2, 55, offset.z + MAP_SIZE / 2)
      const tileVisible = tileBox.distanceToPoint(cameraPoint) < 545 && frustum.intersectsBox(tileBox)
      if (tile) tile.visible = tileVisible
      for (let districtIndex = 0; districtIndex < DISTRICT_OFFSETS.length; districtIndex += 1) {
        const district = districtGroups.current[slot * DISTRICT_OFFSETS.length + districtIndex]
        const local = DISTRICT_OFFSETS[districtIndex]!
        districtSphere.center.set(offset.x + local.x, 20, offset.z + local.z)
        if (district) district.visible = tileVisible && cameraPoint.distanceTo(districtSphere.center) < 530 && frustum.intersectsSphere(districtSphere)
      }
    })
  })
  return (
    <group>
      <DistantSkyline />
      {offsets.map((offset, slot) => (
        <CityTile
          key={slot}
          slot={slot}
          offset={offset}
          registerTile={(group) => { tileGroups.current[slot] = group }}
          registerDistrict={(index, group) => { districtGroups.current[index] = group }}
        />
      ))}
    </group>
  )
})
