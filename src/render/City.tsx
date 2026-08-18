import { Edges, Text } from '@react-three/drei'
import { useMemo } from 'react'
import * as THREE from 'three'
import { BUILDINGS } from './cityData'

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
  const seed = Number(building.id.slice(1))
  const facadeTexture = useMemo(() => makeFacadeTexture(building.color, seed), [building.color, seed])
  const roofTexture = useMemo(() => makeRoofTexture(building.roof, seed), [building.roof, seed])
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
        {building.id === 'b6' && (
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

function Traffic() {
  const parked: Array<[number, number, number, boolean]> = [
    [-12, 0.65, -34, false], [12, 0.65, -57, false], [-12, 0.65, 69, false],
    [-42, 0.65, -12, true], [31, 0.65, 12, true], [72, 0.65, 12, true],
  ]
  return (
    <group>
      {parked.map(([x, y, z, horizontal], index) => (
        <group key={index} position={[x, y, z]}>
          <mesh castShadow>
            <boxGeometry args={[horizontal ? 3.8 : 1.95, 1.15, horizontal ? 1.95 : 3.8]} />
            <meshToonMaterial color={['#ff5d74', '#62d7ff', '#ffd15d', '#9c75ff'][index % 4]} gradientMap={toonGradient} />
            <Edges color="#382f43" />
          </mesh>
          <mesh position={[0, 0.68, 0]}>
            <boxGeometry args={[horizontal ? 2.1 : 1.65, 0.58, horizontal ? 1.65 : 2.1]} />
            <meshToonMaterial color="#d5f4ec" gradientMap={toonGradient} />
          </mesh>
        </group>
      ))}
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

function DistantSkyline() {
  const blocks = useMemo(() => Array.from({ length: 28 }, (_, index) => {
    const side = index % 4
    const offset = -92 + Math.floor(index / 4) * 28
    const height = 18 + (index * 17 % 30)
    const position: [number, number, number] = side === 0 ? [-118, height / 2, offset]
      : side === 1 ? [118, height / 2, offset]
      : side === 2 ? [offset, height / 2, -118]
      : [offset, height / 2, 118]
    return { position, height, width: 14 + index % 4 * 3 }
  }), [])
  return (
    <group>
      {blocks.map((block, index) => (
        <mesh key={index} position={block.position}>
          <boxGeometry args={[block.width, block.height, block.width]} />
          <meshToonMaterial color={['#426c78', '#4d657d', '#596d78'][index % 3]} gradientMap={toonGradient} />
        </mesh>
      ))}
    </group>
  )
}

export function City() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[205, 205]} />
        <meshToonMaterial color="#8a8b75" gradientMap={toonGradient} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.012} receiveShadow>
        <planeGeometry args={[200, 25]} />
        <meshToonMaterial color="#324e63" gradientMap={toonGradient} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.014} receiveShadow>
        <planeGeometry args={[25, 200]} />
        <meshToonMaterial color="#324e63" gradientMap={toonGradient} />
      </mesh>
      <RoadMarkings />
      {BUILDINGS.map((building) => (
        <mesh key={`walk-${building.id}`} position={[building.position.x, 0.14, building.position.z]} receiveShadow>
          <boxGeometry args={[building.size.x + 4, 0.28, building.size.z + 4]} />
          <meshToonMaterial color="#c9b889" gradientMap={toonGradient} />
          <Edges color="#6d6160" />
        </mesh>
      ))}
      {BUILDINGS.map((building) => <Building key={building.id} building={building} />)}
      <Traffic />
      <StreetLights />
      <DistantSkyline />
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
