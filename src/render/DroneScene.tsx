import { Edges } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { useGame, type CarriedTarget } from '../GameContext'
import { beamProfile } from '../core/beam'
import { fighterOrbitPosition } from '../core/combat'
import {
  LASER_MAX_PROJECTILES,
  LASER_MAX_BURSTS,
  LASER_PROJECTILE_LIFETIME,
  LASER_PROJECTILE_SPEED,
  LASER_VISUAL_LENGTH,
} from '../core/laser'
import type { MissionTarget, TargetKind } from '../core/missions'
import { TRAFFIC_MAX_CARS } from '../core/traffic'
import { WORLD_MAX_CARS } from '../core/world'
import { City } from './City'
import {
  PILOT_ATLAS_COLUMNS,
  PILOT_ATLAS_ROWS,
  pilotAtlasCanvas,
  pilotFrameIndex,
} from './pilotArt'
import { PostFx } from './PostFx'

const roundedCarBodyGeometry = new RoundedBoxGeometry(1.8, 0.62, 3.1, 2, 0.15)
const roundedCarCabinGeometry = new RoundedBoxGeometry(1.55, 0.62, 1.55, 2, 0.18)
const beamRingGeometry = new THREE.RingGeometry(0.9, 1, 28)
const BEAM_RING_COUNT = 5

declare global {
  interface Window {
    __BEAM_BANDIT_METRICS__?: {
      activeBuildings: number
      activeCars: number
      activeTraffic: number
      activeLaserProjectiles: number
      laserShotsFired: number
      height: number
      visibleMeshPools: number
    }
  }
}

function Cow({ color = '#f4eee0' }: { color?: string }) {
  return (
    <group scale={0.72}>
      <mesh><boxGeometry args={[1.35, 0.72, 0.7]} /><meshToonMaterial color={color} /></mesh>
      <mesh position={[0, 0.43, 0]}><boxGeometry args={[0.65, 0.13, 0.72]} /><meshToonMaterial color="#3b3348" /></mesh>
      <group position={[0, 0.02, 0.62]}>
        <mesh><boxGeometry args={[0.72, 0.62, 0.58]} /><meshToonMaterial color="#fff7df" /></mesh>
        <mesh position={[-0.4, 0.31, 0]} rotation-z={0.5}><coneGeometry args={[0.13, 0.35, 5]} /><meshToonMaterial color="#ffcf68" /></mesh>
        <mesh position={[0.4, 0.31, 0]} rotation-z={-0.5}><coneGeometry args={[0.13, 0.35, 5]} /><meshToonMaterial color="#ffcf68" /></mesh>
        <mesh position={[-0.19, 0.1, 0.3]}><sphereGeometry args={[0.06, 6, 4]} /><meshBasicMaterial color="#191526" /></mesh>
        <mesh position={[0.19, 0.1, 0.3]}><sphereGeometry args={[0.06, 6, 4]} /><meshBasicMaterial color="#191526" /></mesh>
      </group>
      {[-0.43, 0.43].flatMap((x) => [-0.23, 0.23].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, -0.57, z]}><boxGeometry args={[0.16, 0.55, 0.16]} /><meshToonMaterial color="#eee0c7" /></mesh>
      )))}
    </group>
  )
}

function Tourist({ color = '#ff79b8' }: { color?: string }) {
  return (
    <group scale={0.72}>
      <mesh position-y={0.54}><sphereGeometry args={[0.34, 9, 6]} /><meshToonMaterial color="#f4b98d" /></mesh>
      <mesh><capsuleGeometry args={[0.34, 0.7, 4, 8]} /><meshToonMaterial color={color} /></mesh>
      <mesh position={[-0.22, -0.74, 0]}><boxGeometry args={[0.18, 0.65, 0.2]} /><meshToonMaterial color="#374c78" /></mesh>
      <mesh position={[0.22, -0.74, 0]}><boxGeometry args={[0.18, 0.65, 0.2]} /><meshToonMaterial color="#374c78" /></mesh>
      <mesh position={[0.43, 0.03, 0]} rotation-z={-0.35}><boxGeometry args={[0.14, 0.78, 0.14]} /><meshToonMaterial color="#f4b98d" /></mesh>
      <mesh position={[-0.43, 0.03, 0]} rotation-z={0.35}><boxGeometry args={[0.14, 0.78, 0.14]} /><meshToonMaterial color="#f4b98d" /></mesh>
    </group>
  )
}

function PersonOrCow({ kind, color }: { kind: TargetKind; color?: string }) {
  return kind === 'cow' ? <Cow color={color} /> : <Tourist color={color} />
}

function PatrolCar({ color = '#f1f1da', police = false }: { color?: string; police?: boolean }) {
  const blueSiren = useRef<THREE.MeshBasicMaterial>(null)
  const redSiren = useRef<THREE.MeshBasicMaterial>(null)
  useFrame(({ clock }) => {
    if (!police || !blueSiren.current || !redSiren.current) return
    const alternate = Math.sin(clock.elapsedTime * 18) > 0
    blueSiren.current.opacity = alternate ? 1 : 0.18
    redSiren.current.opacity = alternate ? 0.18 : 1
  })
  return (
    <group scale={0.8}>
      <mesh geometry={roundedCarBodyGeometry}><meshToonMaterial color={color} /></mesh>
      <mesh geometry={roundedCarCabinGeometry} position={[0, 0.53, -0.15]}><meshToonMaterial color="#b7dfe0" /></mesh>
      <mesh position={[0, 0.9, -0.15]}><boxGeometry args={[0.95, 0.16, 0.28]} /><meshBasicMaterial color={police ? '#ff4f73' : '#ffce55'} /></mesh>
      <mesh position={[-0.29, 0.91, -0.15]}><boxGeometry args={[0.28, 0.19, 0.32]} /><meshBasicMaterial ref={blueSiren} color="#8edcea" transparent opacity={1} toneMapped={false} /></mesh>
      <mesh position={[0.29, 0.91, -0.15]}><boxGeometry args={[0.28, 0.19, 0.32]} /><meshBasicMaterial ref={redSiren} color="#ef8d96" transparent opacity={0.18} toneMapped={false} /></mesh>
      {police && <mesh position={[0, 0.86, -0.15]} rotation-x={Math.PI / 2}><ringGeometry args={[0.52, 0.78, 12]} /><meshBasicMaterial color="#f5c7d0" transparent opacity={0.38} depthWrite={false} blending={THREE.AdditiveBlending} /></mesh>}
      {[-0.76, 0.76].flatMap((x) => [-0.92, 0.92].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, -0.26, z]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.27, 0.27, 0.18, 8]} /><meshToonMaterial color="#252334" /></mesh>
      )))}
    </group>
  )
}

function PullableCars() {
  const { runtime } = useGame()
  const body = useRef<THREE.InstancedMesh>(null)
  const cabin = useRef<THREE.InstancedMesh>(null)
  const lightbar = useRef<THREE.InstancedMesh>(null)
  const glow = useRef<THREE.InstancedMesh>(null)
  const shadow = useRef<THREE.InstancedMesh>(null)
  const base = useMemo(() => new THREE.Matrix4(), [])
  const local = useMemo(() => new THREE.Matrix4(), [])
  const composed = useMemo(() => new THREE.Matrix4(), [])
  const projection = useMemo(() => new THREE.Matrix4(), [])
  const frustum = useMemo(() => new THREE.Frustum(), [])
  const sphere = useMemo(() => new THREE.Sphere(new THREE.Vector3(), 2.2), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(0.8, 0.8, 0.8), [])
  const glowScale = useMemo(() => new THREE.Vector3(), [])
  const shadowScale = useMemo(() => new THREE.Vector3(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const planeQuaternion = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), [])
  const euler = useMemo(() => new THREE.Euler(), [])
  const color = useMemo(() => new THREE.Color(), [])

  useFrame(({ camera }) => {
    if (!body.current || !cabin.current || !lightbar.current || !glow.current || !shadow.current) return
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(projection)
    let visibleCount = 0
    let glowCount = 0
    for (const object of runtime.current.beamObjects) {
      position.set(object.position.x, object.position.y, object.position.z)
      if (camera.position.distanceToSquared(position) > 180 * 180) continue
      sphere.center.copy(position)
      if (!frustum.intersectsSphere(sphere)) continue

      euler.set(object.rotation.x, object.rotation.y, object.rotation.z)
      quaternion.setFromEuler(euler)
      base.compose(position, quaternion, scale)
      body.current.setMatrixAt(visibleCount, base)
      body.current.setColorAt(visibleCount, color.set(object.color))

      local.makeTranslation(0, 0.53, -0.15)
      cabin.current.setMatrixAt(visibleCount, composed.copy(base).multiply(local))
      local.makeTranslation(0, 0.9, -0.15)
      lightbar.current.setMatrixAt(visibleCount, composed.copy(base).multiply(local))

      position.set(object.position.x + 0.25, 0.035, object.position.z + 0.28)
      shadowScale.set(2.25, 3.25, 1)
      composed.compose(position, planeQuaternion, shadowScale)
      shadow.current.setMatrixAt(visibleCount, composed)

      if (object.tether > 0.02) {
        glowScale.setScalar(0.8 + object.tether * 0.35)
        local.makeRotationX(-Math.PI / 2)
        local.setPosition(0, -0.31, 0)
        composed.copy(base).multiply(local).scale(glowScale)
        glow.current.setMatrixAt(glowCount, composed)
        glowCount += 1
      }
      visibleCount += 1
    }

    for (const mesh of [body.current, cabin.current, lightbar.current, shadow.current]) {
      mesh.count = visibleCount
      mesh.instanceMatrix.needsUpdate = true
    }
    if (body.current.instanceColor) body.current.instanceColor.needsUpdate = true
    glow.current.count = glowCount
    glow.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={shadow} args={[undefined, undefined, WORLD_MAX_CARS + TRAFFIC_MAX_CARS]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#28313d" transparent opacity={0.32} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={body} args={[roundedCarBodyGeometry, undefined, WORLD_MAX_CARS + TRAFFIC_MAX_CARS]} frustumCulled={false}>
        <meshToonMaterial />
      </instancedMesh>
      <instancedMesh ref={cabin} args={[roundedCarCabinGeometry, undefined, WORLD_MAX_CARS + TRAFFIC_MAX_CARS]} frustumCulled={false}>
        <meshToonMaterial color="#b7dfe0" />
      </instancedMesh>
      <instancedMesh ref={lightbar} args={[undefined, undefined, WORLD_MAX_CARS + TRAFFIC_MAX_CARS]} frustumCulled={false}>
        <boxGeometry args={[0.95, 0.16, 0.28]} />
        <meshBasicMaterial color="#ffce55" />
      </instancedMesh>
      <instancedMesh ref={glow} args={[undefined, undefined, WORLD_MAX_CARS + TRAFFIC_MAX_CARS]} frustumCulled={false} renderOrder={3}>
        <ringGeometry args={[1.25, 1.55, 18]} />
        <meshBasicMaterial color="#a7fff0" transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} />
      </instancedMesh>
    </group>
  )
}

function DrivingTraffic() {
  const { runtime } = useGame()
  const body = useRef<THREE.InstancedMesh>(null)
  const cabin = useRef<THREE.InstancedMesh>(null)
  const lamps = useRef<THREE.InstancedMesh>(null)
  const shadows = useRef<THREE.InstancedMesh>(null)
  const base = useMemo(() => new THREE.Matrix4(), [])
  const local = useMemo(() => new THREE.Matrix4(), [])
  const composed = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const scale = useMemo(() => new THREE.Vector3(0.8, 0.8, 0.8), [])
  const shadowScale = useMemo(() => new THREE.Vector3(2.25, 3.25, 1), [])
  const planeQuaternion = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), [])
  const color = useMemo(() => new THREE.Color(), [])

  useFrame(() => {
    if (!body.current || !cabin.current || !lamps.current || !shadows.current) return
    let count = 0
    for (const car of runtime.current.traffic.cars) {
      if (!car.active) continue
      position.set(car.position.x, car.position.y, car.position.z)
      quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, car.rotation)
      base.compose(position, quaternion, scale)
      body.current.setMatrixAt(count, base)
      body.current.setColorAt(count, color.set(car.color))
      local.makeTranslation(0, 0.53, -0.15)
      cabin.current.setMatrixAt(count, composed.copy(base).multiply(local))
      local.makeTranslation(0, 0.9, -0.15)
      lamps.current.setMatrixAt(count, composed.copy(base).multiply(local))
      position.set(car.position.x + 0.2, 0.035, car.position.z + 0.25)
      composed.compose(position, planeQuaternion, shadowScale)
      shadows.current.setMatrixAt(count, composed)
      count += 1
    }
    for (const mesh of [body.current, cabin.current, lamps.current, shadows.current]) {
      mesh.count = count
      mesh.instanceMatrix.needsUpdate = true
    }
    if (body.current.instanceColor) body.current.instanceColor.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={shadows} args={[undefined, undefined, TRAFFIC_MAX_CARS]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#28313d" transparent opacity={0.3} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={body} args={[roundedCarBodyGeometry, undefined, TRAFFIC_MAX_CARS]} frustumCulled={false}>
        <meshToonMaterial />
      </instancedMesh>
      <instancedMesh ref={cabin} args={[roundedCarCabinGeometry, undefined, TRAFFIC_MAX_CARS]} frustumCulled={false}>
        <meshToonMaterial color="#b7dfe0" />
      </instancedMesh>
      <instancedMesh ref={lamps} args={[undefined, undefined, TRAFFIC_MAX_CARS]} frustumCulled={false}>
        <boxGeometry args={[0.95, 0.16, 0.28]} />
        <meshBasicMaterial color="#ffce55" />
      </instancedMesh>
    </group>
  )
}

function ScanNode({ color }: { color: string }) {
  return (
    <group>
      <mesh position-y={1.2}><boxGeometry args={[2.2, 2.1, 0.3]} /><meshToonMaterial color="#514967" emissive={color} emissiveIntensity={0.08} /></mesh>
      <mesh position={[0, 1.2, 0.18]}><planeGeometry args={[1.72, 1.4]} /><meshBasicMaterial color={color} /></mesh>
      <mesh position-y={0.15}><cylinderGeometry args={[0.18, 0.26, 1.6, 6]} /><meshToonMaterial color="#61536d" /></mesh>
    </group>
  )
}

function TargetActor({ target, selected }: { target: MissionTarget; selected: boolean }) {
  const marker = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!marker.current) return
    marker.current.rotation.y = clock.elapsedTime * 0.65
    const pulse = selected ? 1.12 + Math.sin(clock.elapsedTime * 14) * 0.08 : 1
    marker.current.scale.setScalar(pulse)
  })
  if (!target.active) return null
  const progress = Math.max(0.03, target.progress)
  return (
    <group position={[target.position.x, target.position.y, target.position.z]}>
      <group ref={marker} position-y={0.05}>
        <mesh rotation-x={-Math.PI / 2}>
          <ringGeometry args={[1.75, 2.25, 24, 1, 0, Math.PI * 2 * progress]} />
          <meshBasicMaterial color={target.color} transparent opacity={0.95} side={THREE.DoubleSide} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2}>
          <ringGeometry args={[2.36, 2.48, 24]} />
          <meshBasicMaterial color="#fff5bd" transparent opacity={0.7} side={THREE.DoubleSide} />
        </mesh>
      </group>
      {target.kind === 'cow' || target.kind === 'tourist'
        ? <PersonOrCow kind={target.kind} />
        : target.kind === 'patrol'
          ? <PatrolCar color="#f6ead7" />
          : <ScanNode color={target.color} />}
      <mesh position-y={16}>
        <octahedronGeometry args={[1.15]} />
        <meshBasicMaterial color={target.color} />
      </mesh>
      <mesh position-y={8}>
        <cylinderGeometry args={[0.07, 0.18, 14, 6]} />
        <meshBasicMaterial color={target.color} transparent opacity={0.46} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  )
}

function MissionTargets() {
  const { snapshot } = useGame()
  return (
    <group>
      {snapshot.mission.targets.map((target) => (
        <TargetActor key={target.id} target={target} selected={snapshot.beamTargetId === target.id} />
      ))}
    </group>
  )
}

function TetheredCaptive({ captive, index }: { captive: CarriedTarget; index: number }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.rotation.z = Math.sin(clock.elapsedTime * 3.8 + index * 1.7) * 0.16
    ref.current.rotation.x = Math.cos(clock.elapsedTime * 3.2 + index) * 0.09
  })
  const offsetX = (index - 1.5) * 0.46
  const length = 1.6 + (index % 2) * 0.4
  return (
    <group position-x={offsetX}>
      <mesh position-y={-length / 2 - 0.52}><cylinderGeometry args={[0.018, 0.018, length, 5]} /><meshBasicMaterial color="#b8ffef" transparent opacity={0.72} /></mesh>
      <group ref={ref} position-y={-length - 0.7} scale={0.54}>
        <PersonOrCow kind={captive.kind} color={captive.color} />
      </group>
    </group>
  )
}

function BeamFlowRings({ length, radius, boosting }: { length: number; radius: number; boosting: boolean }) {
  const rings = useRef<Array<THREE.Mesh | null>>([])
  const elapsed = useRef(0)
  useFrame((_, dt) => {
    elapsed.current += dt
    const speed = boosting ? 0.62 : 0.32
    rings.current.forEach((ring, index) => {
      if (!ring) return
      const phase = (elapsed.current * speed + index / BEAM_RING_COUNT) % 1
      const ratio = Math.pow(1 - phase, 0.72)
      const sectionRadius = Math.max(0.16, radius * ratio * 0.78)
      ring.position.y = -length * ratio
      ring.scale.setScalar(sectionRadius)
      const edgeFade = Math.min(1, ratio / 0.12, (1 - ratio) / 0.12)
      const material = ring.material as THREE.MeshBasicMaterial
      material.opacity = Math.max(0, edgeFade) * (boosting ? 0.74 : 0.52)
    })
  })
  return (
    <group>
      {Array.from({ length: BEAM_RING_COUNT }, (_, index) => (
        <mesh
          key={index}
          ref={(mesh) => { rings.current[index] = mesh }}
          geometry={beamRingGeometry}
          rotation-x={-Math.PI / 2}
          renderOrder={3}
        >
          <meshBasicMaterial color="#efffff" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  )
}

function TractorBeam() {
  const { runtime, snapshot } = useGame()
  const root = useRef<THREE.Group>(null)
  const target = snapshot.mission.targets.find((item) => item.id === snapshot.beamTargetId)
  const profile = beamProfile(snapshot.boostActive)
  const length = Math.max(1.2, Math.min(profile.maxDrop, runtime.current.drone.position.y - (target?.position.y ?? 0.15) - 0.35))
  const radius = profile.baseRadius + length * profile.coneSpread
  useFrame(() => {
    if (!root.current) return
    const position = runtime.current.drone.position
    root.current.position.set(position.x, position.y, position.z)
    root.current.visible = snapshot.beamActive
  })
  const color = target?.color ?? '#8fffe1'
  return (
    <group ref={root} position={[runtime.current.drone.position.x, runtime.current.drone.position.y, runtime.current.drone.position.z]}>
      <group position-y={-0.42}>
      <mesh position-y={-length / 2} renderOrder={2}>
        <coneGeometry args={[radius, length, 24, 1, true]} />
        <meshBasicMaterial color={snapshot.boostActive ? '#69f7ff' : color} transparent opacity={snapshot.boostActive ? 0.38 : target ? 0.34 : 0.24} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <BeamFlowRings length={length} radius={radius} boosting={snapshot.boostActive} />
      </group>
    </group>
  )
}

function PilotModel() {
  return (
    <group position={[0, 0.35, 0.05]} scale={0.52}>
      <mesh position-y={-0.14} rotation-z={0.08}>
        <boxGeometry args={[0.78, 0.72, 0.48]} />
        <meshToonMaterial color="#ef8d96" />
      </mesh>
      <mesh position={[0.04, 0.45, 0]} rotation-z={-0.05}>
        <octahedronGeometry args={[0.48, 0]} />
        <meshToonMaterial color="#f4d7aa" />
      </mesh>
      <mesh position={[-0.18, 0.47, 0.42]}><boxGeometry args={[0.11, 0.16, 0.08]} /><meshBasicMaterial color="#343044" /></mesh>
      <mesh position={[0.2, 0.47, 0.42]}><boxGeometry args={[0.11, 0.16, 0.08]} /><meshBasicMaterial color="#343044" /></mesh>
      <mesh position={[0.34, 0.94, 0]} rotation-z={-0.42}><cylinderGeometry args={[0.035, 0.045, 0.55, 5]} /><meshToonMaterial color="#6f627d" /></mesh>
      <mesh position={[0.47, 1.18, 0]}><octahedronGeometry args={[0.11, 0]} /><meshBasicMaterial color="#b9df78" /></mesh>
      <mesh position={[-0.52, -0.08, 0]} rotation-z={-0.34}><boxGeometry args={[0.18, 0.64, 0.2]} /><meshToonMaterial color="#e7b26f" /></mesh>
      <mesh position={[0.5, -0.04, 0]} rotation-z={0.18}><boxGeometry args={[0.18, 0.56, 0.2]} /><meshToonMaterial color="#b9df78" /></mesh>
    </group>
  )
}

function PilotScreen() {
  const { snapshot } = useGame()
  const texture = useMemo(() => {
    const result = new THREE.CanvasTexture(pilotAtlasCanvas)
    result.colorSpace = THREE.SRGBColorSpace
    result.magFilter = THREE.NearestFilter
    result.minFilter = THREE.NearestFilter
    result.generateMipmaps = false
    result.repeat.set(1 / PILOT_ATLAS_COLUMNS, 1 / PILOT_ATLAS_ROWS)
    return result
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  useEffect(() => {
    const index = pilotFrameIndex(snapshot.pilotExpression)
    const column = index % PILOT_ATLAS_COLUMNS
    const row = Math.floor(index / PILOT_ATLAS_COLUMNS)
    texture.offset.set(column / PILOT_ATLAS_COLUMNS, (PILOT_ATLAS_ROWS - row - 1) / PILOT_ATLAS_ROWS)
    texture.needsUpdate = true
  }, [snapshot.pilotExpression, texture])
  return (
    <group position={[0, 0.68, -1.08]} rotation={[0.06, Math.PI, 0]}>
      <mesh>
        <boxGeometry args={[1.26, 0.96, 0.12]} />
        <meshToonMaterial color="#4f465f" />
      </mesh>
      <mesh position-z={0.065}>
        <planeGeometry args={[1.08, 0.78]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <mesh position={[0.5, -0.39, 0.072]}><circleGeometry args={[0.045, 8]} /><meshBasicMaterial color="#b9df78" /></mesh>
    </group>
  )
}

function Ufo() {
  const { runtime, snapshot } = useGame()
  const root = useRef<THREE.Group>(null)
  const rim = useRef<THREE.Group>(null)
  const cameraTarget = useMemo(() => new THREE.Vector3(), [])
  const cameraPosition = useMemo(() => new THREE.Vector3(), [])
  const { camera } = useThree()

  useFrame((_, dt) => {
    const game = runtime.current
    if (root.current) {
      root.current.position.set(game.drone.position.x, game.drone.position.y, game.drone.position.z)
      root.current.rotation.x = -game.drone.pitch
      root.current.rotation.y = game.drone.heading
      root.current.rotation.z = game.drone.visualTilt * 0.72
      const pickupPop = Math.sin((1 - snapshot.pickupPulse) * Math.PI) * snapshot.pickupPulse
      root.current.scale.setScalar(1 + pickupPop * 0.12)
    }
    if (rim.current) rim.current.rotation.y += dt * (snapshot.beamActive ? 7 : 2.8)

    const heading = game.drone.heading
    const pitch = game.drone.pitch
    const horizontalForward = Math.cos(pitch)
    const forwardX = Math.sin(heading) * horizontalForward
    const forwardY = Math.sin(pitch)
    const forwardZ = Math.cos(heading) * horizontalForward
    const speedRatio = Math.min(1, snapshot.speed / 30)
    const altitudeView = Math.max(0, game.drone.position.y - 6) * 0.12
    const distance = 7.8 + speedRatio * 3.3 + altitudeView
    cameraPosition.set(
      game.drone.position.x - forwardX * distance,
      Math.max(1, game.drone.position.y + 3.6 + speedRatio * 1.1 + altitudeView - forwardY * distance * 0.72),
      game.drone.position.z - forwardZ * distance,
    )
    const wantedShake = snapshot.wantedPulse * 0.22
    cameraPosition.x += Math.sin(game.sessionTime * 71) * wantedShake
    cameraPosition.y += Math.cos(game.sessionTime * 59) * wantedShake * 0.6
    camera.position.lerp(cameraPosition, 1 - Math.exp(-5.5 * dt))
    cameraTarget.set(
      game.drone.position.x + forwardX * (5.5 + speedRatio * 3),
      game.drone.position.y + forwardY * (5.5 + speedRatio * 3),
      game.drone.position.z + forwardZ * (5.5 + speedRatio * 3),
    )
    camera.lookAt(cameraTarget)
    if (camera instanceof THREE.PerspectiveCamera) {
      const targetFov = game.drone.boostRemaining > 0 ? 82 : 58 + speedRatio * 11
      camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-5 * dt))
      camera.updateProjectionMatrix()
    }
  })

  return (
    <group ref={root}>
      <group scale={1.08}>
        <PilotModel />
        <mesh scale={[1, 0.32, 1]}>
          <sphereGeometry args={[1.72, 20, 10]} />
          <meshToonMaterial color="#d8c9b5" />
          <Edges threshold={15} color="#322b48" />
        </mesh>
        <mesh position-y={0.25} scale={[1, 0.55, 1]}>
          <sphereGeometry args={[0.82, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshToonMaterial color="#8ce8e8" emissive="#326f89" emissiveIntensity={0.55} transparent opacity={0.86} />
          <Edges threshold={15} color="#432f6b" />
        </mesh>
        <mesh position-y={-0.2}>
          <cylinderGeometry args={[1.35, 1.03, 0.32, 18]} />
          <meshToonMaterial color="#5d4a83" emissive="#38215d" emissiveIntensity={0.45} />
          <Edges color="#2b243f" />
        </mesh>
        <mesh position-y={-0.39} rotation-x={Math.PI / 2}>
          <ringGeometry args={[0.47, 0.92, 22]} />
          <meshBasicMaterial color={snapshot.beamActive ? '#baffdc' : '#ffcb63'} />
        </mesh>
        <group ref={rim}>
          {Array.from({ length: 10 }, (_, index) => {
            const angle = index / 10 * Math.PI * 2
            return (
              <mesh key={index} position={[Math.sin(angle) * 1.43, -0.05, Math.cos(angle) * 1.43]}>
                <sphereGeometry args={[0.12, 6, 4]} />
                <meshBasicMaterial color={index % 2 ? '#67f2ff' : '#ff6fae'} />
              </mesh>
            )
          })}
        </group>
        <mesh position={[0, 0, 1.48]} rotation-x={Math.PI / 2}>
          <coneGeometry args={[0.25, 0.62, 5]} />
          <meshBasicMaterial color="#ffdd67" />
        </mesh>
        <PilotScreen />
        {snapshot.boostActive && (
          <group position={[0, -0.02, -1.85]} rotation-x={Math.PI / 2}>
            {[-0.62, 0.62].map((x) => (
              <group key={x} position-x={x}>
                <mesh>
                  <coneGeometry args={[0.24, 2.2, 8]} />
                  <meshBasicMaterial color="#69f7ff" transparent opacity={0.82} depthWrite={false} blending={THREE.AdditiveBlending} />
                </mesh>
                <mesh position-y={0.34}>
                  <coneGeometry args={[0.13, 1.35, 7]} />
                  <meshBasicMaterial color="#fff26d" transparent opacity={0.95} depthWrite={false} />
                </mesh>
              </group>
            ))}
          </group>
        )}
        {snapshot.carried.map((captive, index) => <TetheredCaptive key={captive.id} captive={captive} index={index} />)}
      </group>
    </group>
  )
}

function DroppedCaptives() {
  const { snapshot } = useGame()
  return (
    <group>
      {snapshot.dropped.map((item) => (
        <group key={item.id} position={[item.position.x, item.position.y, item.position.z]} rotation={[item.age * 1.4, item.age, item.age * 0.7]}>
          <PersonOrCow kind={item.kind} color={item.color} />
          <mesh position-y={1.4} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[0.7, 0.85, 16]} />
            <meshBasicMaterial color="#ffec6d" transparent opacity={Math.max(0.1, 1 - item.age / 7)} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function FighterJet() {
  return (
    <group scale={0.9}>
      <mesh rotation-x={Math.PI / 2}><coneGeometry args={[0.42, 3.1, 7]} /><meshToonMaterial color="#ece3dd" /></mesh>
      <mesh position={[0, 0, -0.35]}><boxGeometry args={[3.1, 0.13, 1.1]} /><meshToonMaterial color="#e88d9d" /></mesh>
      <mesh position={[0, 0.4, -1]}><boxGeometry args={[0.14, 0.85, 0.8]} /><meshToonMaterial color="#665084" /></mesh>
      <mesh position={[0, 0, -1.7]}><circleGeometry args={[0.25, 8]} /><meshBasicMaterial color="#64eaff" /></mesh>
    </group>
  )
}

function Fighters() {
  const { runtime, snapshot } = useGame()
  const group = useRef<THREE.Group>(null)
  useFrame(() => {
    if (!group.current) return
    const player = runtime.current.drone.position
    group.current.children.forEach((fighter, index) => {
      const angle = runtime.current.sessionTime * (0.55 + index * 0.07) + index * 2.25
      const position = fighterOrbitPosition(player, runtime.current.sessionTime, index)
      fighter.position.set(position.x, position.y, position.z)
      fighter.rotation.y = Math.atan2(player.x - fighter.position.x, player.z - fighter.position.z)
      fighter.rotation.z = Math.sin(angle) * 0.28
    })
  })
  return (
    <group ref={group}>
      {Array.from({ length: snapshot.activeFighters }, (_, index) => <group key={index}><FighterJet /></group>)}
    </group>
  )
}

function GroundPolice() {
  const { snapshot } = useGame()
  const positions: Array<[number, number, number, number]> = [
    [-5, 0.68, 13, 0], [5, 0.68, -22, Math.PI], [-31, 0.68, 5, Math.PI / 2], [43, 0.68, -5, -Math.PI / 2],
  ]
  const count = snapshot.wanted >= 2 ? Math.min(4, snapshot.wanted - 1) : 0
  return (
    <group position={[snapshot.position.x, 0, snapshot.position.z]}>
      {positions.slice(0, count).map(([x, y, z, rotation], index) => (
        <group key={index} position={[x, y, z]} rotation-y={rotation}>
          <PatrolCar police color="#e7ecdc" />
        </group>
      ))}
    </group>
  )
}

function LaserProjectiles() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const direction = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const geometry = useMemo(() => {
    const result = new THREE.CylinderGeometry(0.07, 0.22, 1, 8, 1, true)
    const phases = new Float32Array(LASER_MAX_PROJECTILES)
    for (let index = 0; index < phases.length; index += 1) phases[index] = (index * 0.61803398875) % 1
    result.setAttribute('beamPhase', new THREE.InstancedBufferAttribute(phases, 1))
    return result
  }, [])
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float beamPhase;
      varying float vRadial;
      varying float vLength;
      varying float vPhase;
      void main() {
        float expectedRadius = mix(.22, .07, uv.y);
        vRadial = clamp(length(position.xz) / max(.001, expectedRadius), 0.0, 1.0);
        vLength = uv.y;
        vPhase = beamPhase;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying float vRadial;
      varying float vLength;
      varying float vPhase;
      void main() {
        float core = 1.0 - smoothstep(.04, .34, vRadial);
        float glow = 1.0 - smoothstep(.18, 1.0, vRadial);
        float tail = smoothstep(0.0, .20, vLength);
        float energy = .78 + .22 * sin(vLength * 23.0 - uTime * 18.0 + vPhase * 6.28318);
        vec3 outerColor = vec3(.98, .27, .62);
        vec3 hotColor = vec3(1.0, .99, .78);
        vec3 color = mix(outerColor, hotColor, core) * (energy + core * .7) * mix(.58, 1.22, vLength);
        float alpha = glow * tail * (.52 + core * .48);
        if (alpha < .015) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }), [])
  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])
  useFrame(({ clock }) => {
    if (!ref.current) return
    material.uniforms.uTime!.value = clock.elapsedTime
    let count = 0
    for (const projectile of runtime.current.laserProjectiles) {
      if (!projectile.active) continue
      direction.set(projectile.direction.x, projectile.direction.y, projectile.direction.z).normalize()
      const travelled = (LASER_PROJECTILE_LIFETIME - projectile.life) * LASER_PROJECTILE_SPEED + 2.3
      const visibleLength = Math.min(LASER_VISUAL_LENGTH, travelled)
      position.set(
        projectile.position.x - direction.x * visibleLength / 2,
        projectile.position.y - direction.y * visibleLength / 2,
        projectile.position.z - direction.z * visibleLength / 2,
      )
      quaternion.setFromUnitVectors(up, direction)
      scale.set(1, visibleLength, 1)
      matrix.compose(position, quaternion, scale)
      ref.current.setMatrixAt(count, matrix)
      count += 1
    }
    ref.current.count = count
    ref.current.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[geometry, material, LASER_MAX_PROJECTILES]} frustumCulled={false} renderOrder={5} />
  )
}

function LaserBursts() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const color = useMemo(() => new THREE.Color(), [])
  useFrame(({ camera }) => {
    if (!ref.current) return
    let count = 0
    for (const burst of runtime.current.laserBursts) {
      if (!burst.active) continue
      const remaining = burst.life / burst.duration
      const size = burst.kind === 'muzzle'
        ? 0.35 + remaining * 0.9
        : 0.25 + (1 - remaining) * 2.35
      position.set(burst.position.x, burst.position.y, burst.position.z)
      scale.setScalar(size)
      matrix.compose(position, camera.quaternion, scale)
      ref.current.setMatrixAt(count, matrix)
      ref.current.setColorAt(count, color.set(burst.kind === 'muzzle' ? '#fff3a3' : '#ff79bd').multiplyScalar(0.45 + remaining * 0.85))
      count += 1
    }
    ref.current.count = count
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, LASER_MAX_BURSTS]} frustumCulled={false} renderOrder={6}>
      <ringGeometry args={[0.62, 1, 24]} />
      <meshBasicMaterial vertexColors transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} toneMapped={false} />
    </instancedMesh>
  )
}

function LaserAimController() {
  const { runtime } = useGame()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const pointer = useMemo(() => new THREE.Vector2(), [])
  useFrame(({ camera }) => {
    const game = runtime.current
    pointer.set(game.aimX, -game.aimY)
    raycaster.setFromCamera(pointer, camera)
    game.laserAimOrigin.x = raycaster.ray.origin.x
    game.laserAimOrigin.y = raycaster.ray.origin.y
    game.laserAimOrigin.z = raycaster.ray.origin.z
    game.laserAimDirection.x = raycaster.ray.direction.x
    game.laserAimDirection.y = raycaster.ray.direction.y
    game.laserAimDirection.z = raycaster.ray.direction.z
  }, -2)
  return null
}

function WorldTick() {
  const { advance } = useGame()
  useFrame((_, dt) => advance(dt), -1)
  return null
}

function FixedEffectLights() {
  const { runtime, snapshot } = useGame()
  const ufoLight = useRef<THREE.PointLight>(null)
  const boostLight = useRef<THREE.PointLight>(null)
  const targetLight = useRef<THREE.PointLight>(null)
  useFrame(() => {
    const drone = runtime.current.drone
    if (ufoLight.current) {
      ufoLight.current.position.set(drone.position.x, drone.position.y - 1.1, drone.position.z)
      ufoLight.current.intensity = snapshot.beamActive ? 8 : 1.6
      ufoLight.current.color.set(snapshot.boostActive ? '#69f7ff' : '#a8ffdf')
    }
    if (boostLight.current) {
      boostLight.current.position.set(
        drone.position.x - Math.sin(drone.heading) * 2.4,
        drone.position.y,
        drone.position.z - Math.cos(drone.heading) * 2.4,
      )
      boostLight.current.intensity = snapshot.boostActive ? 9 : 0
    }
    const target = snapshot.mission.targets.find((item) => item.id === snapshot.beamTargetId)
      ?? snapshot.mission.targets.find((item) => item.active)
    if (targetLight.current) {
      targetLight.current.position.set(target?.position.x ?? drone.position.x, (target?.position.y ?? 0) + 2.1, target?.position.z ?? drone.position.z)
      targetLight.current.intensity = target ? (snapshot.beamTargetId === target.id ? 8 : 2.5) : 0
      targetLight.current.color.set(target?.color ?? '#fff5bd')
    }
  })
  return (
    <group>
      <pointLight ref={ufoLight} color="#a8ffdf" intensity={1.6} distance={10} />
      <pointLight ref={boostLight} color="#64efff" intensity={0} distance={8} />
      <pointLight ref={targetLight} color="#c9ff67" intensity={2.5} distance={10} />
    </group>
  )
}

function PerformanceProbe() {
  const { runtime } = useGame()
  const elapsed = useRef(0)
  useFrame(({ gl, scene }, dt) => {
    if (!import.meta.env.DEV) return
    elapsed.current += dt
    if (elapsed.current < 0.5) return
    elapsed.current = 0
    let visibleMeshPools = 0
    scene.traverse((object) => {
      if ((object as THREE.Mesh).isMesh && object.visible) visibleMeshPools += 1
    })
    const activeTraffic = runtime.current.traffic.cars.filter((car) => car.active).length
    window.__BEAM_BANDIT_METRICS__ = {
      activeBuildings: runtime.current.world.buildings.length,
      activeCars: runtime.current.beamObjects.length + activeTraffic,
      activeTraffic,
      activeLaserProjectiles: runtime.current.laserProjectiles.filter((projectile) => projectile.active).length,
      laserShotsFired: runtime.current.laserShotsFired,
      height: runtime.current.drone.position.y,
      visibleMeshPools,
    }
    gl.domElement.dataset.renderMetrics = JSON.stringify(window.__BEAM_BANDIT_METRICS__)
  })
  return null
}

function Sky() {
  const skyRoot = useRef<THREE.Group>(null)
  const sunLight = useRef<THREE.DirectionalLight>(null)
  const lightTarget = useMemo(() => new THREE.Object3D(), [])
  const clouds = useMemo(() => [
    [-62, 38, -90, 1.4], [45, 50, -115, 1.8], [82, 33, -65, 1.1],
    [-95, 48, 15, 1.5], [18, 55, 88, 1.3], [-40, 31, 105, 1.1],
  ] as [number, number, number, number][], [])
  useFrame(({ camera }) => {
    if (skyRoot.current) skyRoot.current.position.set(camera.position.x, 0, camera.position.z)
    lightTarget.position.set(camera.position.x, 0, camera.position.z)
    lightTarget.updateMatrixWorld()
    if (sunLight.current) sunLight.current.position.set(camera.position.x - 45, 70, camera.position.z + 35)
  })
  return (
    <>
      <color attach="background" args={['#a8d9d5']} />
      <fog attach="fog" args={['#a8c9c7', 180, 650]} />
      <ambientLight color="#f2fff4" intensity={1.2} />
      <hemisphereLight args={['#e2f7ef', '#c99598', 1.65]} />
      <directionalLight
        ref={sunLight}
        target={lightTarget}
        position={[-45, 70, 35]}
        color="#fff0c4"
        intensity={3.15}
      />
      <primitive object={lightTarget} />
      <group ref={skyRoot}>
        <mesh scale={390} renderOrder={-10}>
          <sphereGeometry args={[1, 32, 18]} />
          <shaderMaterial
            side={THREE.BackSide}
            depthWrite={false}
            vertexShader={`varying vec3 vPosition; void main(){ vPosition=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`}
            fragmentShader={`varying vec3 vPosition; void main(){ float h=normalize(vPosition).y; vec3 horizon=vec3(1.0,.73,.69); vec3 middle=vec3(.59,.80,.79); vec3 top=vec3(.46,.59,.73); vec3 c=mix(horizon,middle,smoothstep(-.18,.20,h)); c=mix(c,top,smoothstep(.20,.82,h)); gl_FragColor=vec4(c,1.0); }`}
          />
        </mesh>
        <group position={[70, 125, -320]}>
          <mesh><circleGeometry args={[58, 48]} /><meshBasicMaterial color="#ffe36f" fog={false} /></mesh>
          <mesh position-z={-0.2}><ringGeometry args={[64, 76, 48]} /><meshBasicMaterial color="#ff8e68" transparent opacity={0.25} fog={false} /></mesh>
        </group>
        {clouds.map(([x, y, z, scale], index) => (
          <group key={index} position={[x, y, z]} scale={scale}>
            {([[-5, 0, 0, 5], [0, 1.4, 0, 7], [6, 0, 0, 4.5], [1, -1.2, 0, 6]] as [number, number, number, number][]).map((part, partIndex) => (
              <mesh key={partIndex} position={[part[0], part[1], part[2]]} scale={[part[3], part[3] * 0.42, 1]}>
                <sphereGeometry args={[1, 10, 6]} />
                <meshBasicMaterial color="#fff1da" transparent opacity={0.72} fog />
              </mesh>
            ))}
          </group>
        ))}
      </group>
    </>
  )
}

export function DroneScene() {
  const { snapshot } = useGame()
  return (
    <>
      <Sky />
      <LaserAimController />
      <WorldTick />
      <FixedEffectLights />
      <PerformanceProbe />
      <City />
      <PullableCars />
      <DrivingTraffic />
      <MissionTargets />
      <DroppedCaptives />
      <GroundPolice />
      <Fighters />
      <LaserProjectiles />
      <LaserBursts />
      <TractorBeam />
      <Ufo />
      <PostFx speed={snapshot.speed} impact={snapshot.impactFlash} />
    </>
  )
}
