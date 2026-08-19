import { Edges } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useGame } from '../GameContext'
import { beamProfile, beamVisualLength } from '../core/beam'
import { CAT_MAX, CROWD_ABSORB_TIME, PEDESTRIAN_MAX, type CrowdKind } from '../core/crowds'
import { ENEMY_CAPS, type EnemyKind } from '../core/enemies'
import {
  LASER_MAX_PROJECTILES,
  LASER_MAX_BURSTS,
} from '../core/laser'
import { WEAPON_POOL_CAPS, type WeaponProjectileKind } from '../core/weapons'
import { TRAFFIC_MAX_CARS } from '../core/traffic'
import { WORLD_MAX_CARS } from '../core/world'
import { City } from './City'
import { PostFx } from './PostFx'

const roundedCarBodyGeometry = new RoundedBoxGeometry(1.8, 0.62, 3.1, 2, 0.15)
const roundedCarCabinGeometry = new RoundedBoxGeometry(1.55, 0.62, 1.55, 2, 0.18)
const beamRingGeometry = new THREE.RingGeometry(0.9, 1, 28)
const BEAM_RING_COUNT = 5

function coloredPart(geometry: THREE.BufferGeometry, color: string) {
  const result = geometry.index ? geometry.toNonIndexed() : geometry
  if (result !== geometry) geometry.dispose()
  const tint = new THREE.Color(color)
  const colors = new Float32Array(result.getAttribute('position').count * 3)
  for (let index = 0; index < colors.length; index += 3) {
    colors[index] = tint.r
    colors[index + 1] = tint.g
    colors[index + 2] = tint.b
  }
  result.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return result
}

function mergeModel(parts: THREE.BufferGeometry[]) {
  const geometry = mergeGeometries(parts, false)
  for (const part of parts) part.dispose()
  if (!geometry) throw new Error('Unable to merge procedural model geometry')
  geometry.computeBoundingSphere()
  return geometry
}

function pedestrianGeometry() {
  return mergeModel([
    coloredPart(new THREE.CapsuleGeometry(0.34, 0.72, 4, 8), '#ee6f9f'),
    coloredPart(new THREE.SphereGeometry(0.34, 8, 6).translate(0, 0.92, 0), '#f4b98d'),
    coloredPart(new THREE.BoxGeometry(0.2, 0.7, 0.24).translate(-0.2, -0.68, 0), '#38547e'),
    coloredPart(new THREE.BoxGeometry(0.2, 0.7, 0.24).translate(0.2, -0.68, 0), '#38547e'),
    coloredPart(new THREE.BoxGeometry(0.15, 0.82, 0.17).rotateZ(0.34).translate(-0.46, 0.02, 0), '#f4b98d'),
    coloredPart(new THREE.BoxGeometry(0.15, 0.82, 0.17).rotateZ(-0.34).translate(0.46, 0.02, 0), '#f4b98d'),
  ])
}

function catGeometry() {
  return mergeModel([
    coloredPart(new THREE.BoxGeometry(0.76, 0.5, 1.16), '#d98b45'),
    coloredPart(new THREE.BoxGeometry(0.64, 0.58, 0.54).translate(0, 0.2, 0.68), '#efb85d'),
    coloredPart(new THREE.ConeGeometry(0.15, 0.4, 4).rotateZ(-0.18).translate(-0.23, 0.58, 0.7), '#efb85d'),
    coloredPart(new THREE.ConeGeometry(0.15, 0.4, 4).rotateZ(0.18).translate(0.23, 0.58, 0.7), '#efb85d'),
    coloredPart(new THREE.CylinderGeometry(0.08, 0.11, 1.08, 6).rotateX(-0.65).translate(0, 0.1, -0.82), '#d98b45'),
    ...[-0.25, 0.25].flatMap((x) => [-0.32, 0.32].map((z) =>
      coloredPart(new THREE.BoxGeometry(0.13, 0.42, 0.14).translate(x, -0.4, z), '#d98b45'),
    )),
  ])
}

function soldierGeometry() {
  return mergeModel([
    coloredPart(new THREE.CapsuleGeometry(0.4, 0.85, 4, 7), '#ba535e'),
    coloredPart(new THREE.SphereGeometry(0.34, 8, 6).translate(0, 0.98, 0), '#d9a06f'),
    coloredPart(new THREE.SphereGeometry(0.37, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.08, 0), '#574d68'),
    coloredPart(new THREE.BoxGeometry(0.2, 0.75, 0.22).translate(-0.22, -0.72, 0), '#4e4660'),
    coloredPart(new THREE.BoxGeometry(0.2, 0.75, 0.22).translate(0.22, -0.72, 0), '#4e4660'),
    coloredPart(new THREE.BoxGeometry(0.16, 0.16, 1.35).rotateX(-0.08).translate(0.46, 0.12, 0.45), '#272b39'),
    coloredPart(new THREE.BoxGeometry(0.18, 0.42, 0.16).rotateZ(-0.35).translate(0.4, -0.04, 0.04), '#d9a06f'),
  ])
}

function helicopterGeometry() {
  return mergeModel([
    coloredPart(new THREE.CapsuleGeometry(0.72, 2.1, 5, 9).rotateX(Math.PI / 2), '#6f608b'),
    coloredPart(new THREE.SphereGeometry(0.76, 10, 7).scale(1, 0.72, 1.08).translate(0, 0.02, 1.25), '#8ed8df'),
    coloredPart(new THREE.BoxGeometry(0.38, 0.38, 3.2).translate(0, 0.12, -2.35), '#5a526c'),
    coloredPart(new THREE.BoxGeometry(6.4, 0.12, 0.22).translate(0, 0.92, 0), '#332f45'),
    coloredPart(new THREE.BoxGeometry(0.22, 0.12, 6.4).translate(0, 0.92, 0), '#332f45'),
    coloredPart(new THREE.BoxGeometry(0.12, 1.9, 0.18).translate(0.08, 0.32, -4), '#332f45'),
    coloredPart(new THREE.BoxGeometry(0.12, 0.18, 1.9).translate(0.08, 0.32, -4), '#332f45'),
  ])
}

function antiAirGeometry() {
  return mergeModel([
    coloredPart(new THREE.CylinderGeometry(1.12, 1.28, 1.2, 8).translate(0, 0.45, 0), '#514d62'),
    coloredPart(new THREE.SphereGeometry(0.78, 8, 5).scale(1, 0.65, 1).translate(0, 1.22, 0), '#736481'),
    coloredPart(new THREE.CylinderGeometry(0.13, 0.18, 2.8, 7).rotateX(Math.PI / 2).rotateZ(-0.16).translate(-0.26, 1.62, 1.25), '#282b38'),
    coloredPart(new THREE.CylinderGeometry(0.13, 0.18, 2.8, 7).rotateX(Math.PI / 2).rotateZ(0.16).translate(0.26, 1.62, 1.25), '#282b38'),
  ])
}

function fighterGeometry() {
  return mergeModel([
    coloredPart(new THREE.ConeGeometry(0.68, 4.5, 7).rotateX(Math.PI / 2), '#e9e1da'),
    coloredPart(new THREE.BoxGeometry(4.8, 0.14, 1.45).translate(0, -0.08, -0.28), '#cf7087'),
    coloredPart(new THREE.BoxGeometry(1.7, 0.12, 1).translate(0, 0.02, -1.72), '#76628f'),
    coloredPart(new THREE.BoxGeometry(0.16, 1.15, 0.92).translate(0, 0.48, -1.72), '#655678'),
    coloredPart(new THREE.SphereGeometry(0.34, 8, 5).scale(0.8, 0.55, 1.5).translate(0, 0.42, 0.78), '#77dce8'),
  ])
}

function droneGeometry() {
  return mergeModel([
    coloredPart(new THREE.SphereGeometry(0.58, 8, 6).scale(1.2, 0.62, 1.2), '#5b83a6'),
    coloredPart(new THREE.ConeGeometry(0.3, 0.68, 6).translate(0, 0.42, 0), '#8ee8e8'),
    coloredPart(new THREE.BoxGeometry(1.65, 0.08, 0.16), '#ffcf68'),
  ])
}

function policeGeometry() {
  return mergeModel([
    coloredPart(new THREE.CapsuleGeometry(0.28, 0.62, 4, 7), '#4670a0'),
    coloredPart(new THREE.SphereGeometry(0.25, 7, 5).translate(0, 0.78, 0), '#d9a06f'),
    coloredPart(new THREE.BoxGeometry(0.15, 0.56, 0.17).translate(-0.17, -0.55, 0), '#253958'),
    coloredPart(new THREE.BoxGeometry(0.15, 0.56, 0.17).translate(0.17, -0.55, 0), '#253958'),
  ])
}

function policeCarGeometry() {
  return mergeModel([
    coloredPart(new RoundedBoxGeometry(1.8, 0.58, 3.2, 2, 0.15), '#e9e4ce'),
    coloredPart(new RoundedBoxGeometry(1.42, 0.56, 1.45, 2, 0.16).translate(0, 0.52, -0.12), '#6d91a5'),
    coloredPart(new THREE.BoxGeometry(0.88, 0.12, 0.24).translate(0, 0.85, -0.12), '#ff5269'),
  ])
}

function tankGeometry() {
  return mergeModel([
    coloredPart(new RoundedBoxGeometry(3.4, 0.9, 4.6, 2, 0.2), '#596453'),
    coloredPart(new THREE.CylinderGeometry(1.2, 1.2, 0.82, 10).translate(0, 0.86, 0), '#7d8360'),
    coloredPart(new THREE.CylinderGeometry(0.16, 0.2, 3.9, 8).rotateX(Math.PI / 2).translate(0, 1.08, 1.55), '#343b35'),
  ])
}

function bossGeometry() {
  return mergeModel([
    coloredPart(new THREE.SphereGeometry(6.3, 18, 10).scale(1.25, 0.42, 1.25), '#4c5561'),
    coloredPart(new THREE.SphereGeometry(3.1, 14, 8).scale(1.05, 0.72, 1.05).translate(0, 1.8, 0), '#a65c67'),
    coloredPart(new THREE.CylinderGeometry(4.4, 3.4, 0.62, 18).translate(0, -0.8, 0), '#252e3a'),
    coloredPart(new THREE.BoxGeometry(0.22, 0.22, 8).translate(0, -0.48, 0), '#f3b24d'),
  ])
}

declare global {
  interface Window {
    __BEAM_BANDIT_METRICS__?: {
      activeBuildings: number
      activeCars: number
      activeTraffic: number
      activeLaserProjectiles: number
      activeEnemies: number
      activeEnemyProjectiles: number
      laserShotsFired: number
      weaponShotsFired: number
      activeWeaponProjectiles: number
      selectedWeapon: string
      height: number
      visibleMeshPools: number
    }
  }
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
      if (!object.active) continue
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
  const profile = beamProfile(snapshot.boostActive)
  const length = Math.max(0.8, beamVisualLength(runtime.current.drone.position.y, profile.maxDrop))
  const radius = profile.baseRadius + length * profile.coneSpread
  useFrame(() => {
    if (!root.current) return
    const position = runtime.current.drone.position
    root.current.position.set(position.x, position.y, position.z)
    root.current.visible = snapshot.beamActive
  })
  const color = snapshot.boostActive ? '#69f7ff' : '#8fffe1'
  return (
    <group ref={root} position={[runtime.current.drone.position.x, runtime.current.drone.position.y, runtime.current.drone.position.z]}>
      <mesh position-y={-length / 2} renderOrder={2}>
        <coneGeometry args={[radius, length, 24, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={snapshot.boostActive ? 0.38 : 0.28} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <BeamFlowRings length={length} radius={radius} boosting={snapshot.boostActive} />
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
    const threatShake = snapshot.waveStage * 0.028
    cameraPosition.x += Math.sin(game.sessionTime * 71) * threatShake
    cameraPosition.y += Math.cos(game.sessionTime * 59) * threatShake * 0.6
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
      </group>
    </group>
  )
}

const crowdGeometry: Record<CrowdKind, THREE.BufferGeometry> = {
  pedestrian: pedestrianGeometry(),
  cat: catGeometry(),
}

function CrowdPool({ kind }: { kind: CrowdKind }) {
  const { runtime, snapshot } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Euler(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const pale = useMemo(() => new THREE.Color('#fff8df'), [])
  useFrame(({ clock }) => {
    if (!ref.current) return
    let count = 0
    for (const object of runtime.current.crowds.objects) {
      if (!object.active || object.kind !== kind) continue
      position.set(object.position.x, object.position.y, object.position.z)
      rotation.set(object.rotation.x, object.rotation.y, object.rotation.z)
      quaternion.setFromEuler(rotation)
      const bounce = object.inBeam ? 1 : 1 + Math.sin(clock.elapsedTime * 8 + object.slot) * 0.04
      const targetScale = snapshot.beamTargetId === object.id ? 1.38 : 1.16
      const absorbScale = object.absorbing ? Math.max(0.04, object.absorbTimer / CROWD_ABSORB_TIME) : 1
      scale.set(targetScale * absorbScale, targetScale * bounce * absorbScale, targetScale * absorbScale)
      matrix.compose(position, quaternion, scale)
      ref.current.setMatrixAt(count, matrix)
      if (snapshot.beamTargetId === object.id) color.set('#fff36d')
      else color.set(object.color).lerp(pale, 0.72)
      ref.current.setColorAt(count, color)
      count += 1
    }
    ref.current.count = count
    ref.current.instanceMatrix.needsUpdate = true
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[crowdGeometry[kind], undefined, kind === 'cat' ? CAT_MAX : PEDESTRIAN_MAX]} frustumCulled={false}>
      <meshToonMaterial vertexColors emissive={kind === 'cat' ? '#3d2418' : '#37192d'} emissiveIntensity={0.2} />
    </instancedMesh>
  )
}

function CrowdPools() {
  return <group><CrowdPool kind="pedestrian" /><CrowdPool kind="cat" /></group>
}

const enemyGeometry: Record<EnemyKind, THREE.BufferGeometry> = {
  drone: droneGeometry(),
  police: policeGeometry(),
  'police-car': policeCarGeometry(),
  soldier: soldierGeometry(),
  helicopter: helicopterGeometry(),
  'anti-air': antiAirGeometry(),
  fighter: fighterGeometry(),
  tank: tankGeometry(),
  boss: bossGeometry(),
}

function EnemyPool({ kind }: { kind: EnemyKind }) {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const scale = useMemo(() => new THREE.Vector3(1, 1, 1), [])
  const rotation = useMemo(() => new THREE.Euler(), [])
  const color = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const player = runtime.current.drone.position
    let count = 0
    for (const enemy of runtime.current.enemies.slots) {
      if (!enemy.active || enemy.kind !== kind) continue
      position.set(enemy.position.x, enemy.position.y, enemy.position.z)
      const yaw = Math.atan2(player.x - enemy.position.x, player.z - enemy.position.z)
      const horizontalDistance = Math.hypot(player.x - enemy.position.x, player.z - enemy.position.z)
      const groundUnit = kind === 'police' || kind === 'police-car' || kind === 'soldier' || kind === 'tank'
      const lookUp = groundUnit && player.y > 5.5 && horizontalDistance < 60
      const pitch = lookUp ? -Math.atan2(Math.max(0, player.y - enemy.position.y), Math.max(0.1, horizontalDistance)) : 0
      rotation.set(pitch, yaw, kind === 'fighter' ? Math.sin(enemy.phase) * 0.22 : 0)
      quaternion.setFromEuler(rotation)
      const size = kind === 'drone' ? 0.45 : kind === 'police' ? 0.82 : kind === 'police-car' ? 1.05 : kind === 'soldier' ? 1.08 : kind === 'helicopter' ? 0.82 : kind === 'fighter' ? 1.18 : kind === 'tank' ? 1.45 : kind === 'anti-air' ? 2.35 : 1.8
      scale.setScalar(size)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(count, matrix)
      if (enemy.aiming) color.set('#ff6573')
      else if (kind === 'drone') color.set('#68e4ec')
      else if (kind === 'police' || kind === 'police-car') color.set('#e9edf0')
      else if (kind === 'tank' || kind === 'anti-air') color.set('#7f8765')
      else if (kind === 'boss') color.set('#a85d69')
      else color.setRGB(0.84 + (enemy.slot % 3) * 0.07, 0.84 + (enemy.slot % 3) * 0.07, 0.84 + (enemy.slot % 3) * 0.07)
      mesh.setColorAt(count, color)
      count += 1
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[enemyGeometry[kind], undefined, ENEMY_CAPS[kind]]} frustumCulled={false}>
      <meshToonMaterial vertexColors emissive={kind === 'boss' ? '#641d35' : kind === 'drone' ? '#154f66' : '#171525'} emissiveIntensity={kind === 'boss' ? 0.42 : 0.22} />
    </instancedMesh>
  )
}

function EnemyPools() {
  return (
    <group>
      <EnemyPool kind="drone" />
      <EnemyPool kind="police" />
      <EnemyPool kind="police-car" />
      <EnemyPool kind="soldier" />
      <EnemyPool kind="helicopter" />
      <EnemyPool kind="anti-air" />
      <EnemyPool kind="fighter" />
      <EnemyPool kind="tank" />
      <EnemyPool kind="boss" />
    </group>
  )
}

const ENEMY_WARNING_CAPACITY = Object.values(ENEMY_CAPS).reduce((sum, value) => sum + value, 0)

function EnemyWarnings() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const quaternion = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), [])
  const color = useMemo(() => new THREE.Color(), [])
  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    let count = 0
    for (const enemy of runtime.current.enemies.slots) {
      if (!enemy.active || enemy.telegraph <= 0) continue
      position.set(enemy.position.x, Math.max(0.08, enemy.position.y - 0.6), enemy.position.z)
      const pulse = 1 + Math.sin(clock.elapsedTime * 18) * 0.12
      scale.setScalar((enemy.kind === 'boss' ? 4 : enemy.kind === 'anti-air' ? 2.2 : 1.25) * pulse)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(count, matrix)
      color.set(enemy.kind === 'anti-air' ? '#ffdf5c' : enemy.kind === 'boss' ? '#ff5f7c' : '#fff3a3')
      mesh.setColorAt(count, color)
      count += 1
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, ENEMY_WARNING_CAPACITY]} frustumCulled={false} renderOrder={4}>
      <ringGeometry args={[0.82, 1, 20]} />
      <meshBasicMaterial vertexColors transparent opacity={0.76} depthWrite={false} side={THREE.DoubleSide} />
    </instancedMesh>
  )
}

function EnemyProjectiles() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const color = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    let count = 0
    for (const projectile of runtime.current.enemies.projectiles) {
      if (!projectile.active) continue
      position.set(projectile.position.x, projectile.position.y, projectile.position.z)
      const size = projectile.kind === 'boss-beam' ? 1.35 : projectile.kind === 'missile' ? 0.95 : projectile.kind === 'shell' ? 0.8 : 0.48
      scale.setScalar(size)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(count, matrix)
      color.set(projectile.kind === 'boss-beam' ? '#ff5f7c' : projectile.kind === 'missile' ? '#ffe05f' : projectile.kind === 'shell' ? '#ff9c54' : projectile.kind === 'rocket' ? '#ff78bd' : '#fff5c7')
      mesh.setColorAt(count, color)
      count += 1
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, 96]} frustumCulled={false} renderOrder={5}>
      <sphereGeometry args={[1, 6, 4]} />
      <meshBasicMaterial vertexColors transparent opacity={0.94} depthWrite={false} blending={THREE.AdditiveBlending} />
    </instancedMesh>
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
  const side = useMemo(() => new THREE.Vector3(), [])
  const facing = useMemo(() => new THREE.Vector3(), [])
  const normal = useMemo(() => new THREE.Vector3(), [])
  const basis = useMemo(() => new THREE.Matrix4(), [])
  const geometry = useMemo(() => {
    const result = new THREE.BufferGeometry()
    result.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.7, -0.5, 0, 0.7, -0.5, 0, 0.12, 0.5, 0, -0.12, 0.5, 0,
      0, -0.5, -0.7, 0, -0.5, 0.7, 0, 0.5, 0.12, 0, 0.5, -0.12,
    ], 3))
    result.setAttribute('uv', new THREE.Float32BufferAttribute([
      0, 0, 1, 0, 1, 1, 0, 1,
      0, 0, 1, 0, 1, 1, 0, 1,
    ], 2))
    result.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
    return result
  }, [])
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ff4f9d',
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  }), [])
  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])
  useFrame(({ camera }) => {
    if (!ref.current) return
    let count = 0
    for (const projectile of runtime.current.laserProjectiles) {
      if (!projectile.active) continue
      direction.set(projectile.direction.x, projectile.direction.y, projectile.direction.z).normalize()
      position.set(
        projectile.position.x + direction.x * projectile.distance / 2,
        projectile.position.y + direction.y * projectile.distance / 2,
        projectile.position.z + direction.z * projectile.distance / 2,
      )
      facing.copy(camera.position).sub(position).normalize()
      side.crossVectors(direction, facing)
      if (side.lengthSq() < 0.0001) side.set(1, 0, 0)
      else side.normalize()
      normal.crossVectors(side, direction).normalize()
      basis.makeBasis(side, direction, normal)
      quaternion.setFromRotationMatrix(basis)
      scale.set(1.35, projectile.distance, 1.35)
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

const WEAPON_PROJECTILE_KINDS: WeaponProjectileKind[] = ['missile', 'scatter', 'satellite', 'bomb']

function weaponProjectileColor(kind: WeaponProjectileKind) {
  if (kind === 'missile') return '#ffe05f'
  if (kind === 'scatter') return '#ff76c4'
  if (kind === 'satellite') return '#69f7ff'
  return '#ff9d58'
}

function WeaponProjectilePool({ kind }: { kind: WeaponProjectileKind }) {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const direction = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const axis = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const geometry = useMemo(() => {
    if (kind === 'missile') return new THREE.ConeGeometry(0.34, 1.7, 6)
    if (kind === 'scatter') return new THREE.IcosahedronGeometry(0.42, 0)
    if (kind === 'satellite') return new THREE.TorusGeometry(0.72, 0.16, 6, 10)
    return new THREE.SphereGeometry(0.52, 8, 6)
  }, [kind])
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: weaponProjectileColor(kind),
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }), [kind])
  const color = useMemo(() => new THREE.Color(weaponProjectileColor(kind)), [kind])
  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])
  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    let count = 0
    for (const projectile of runtime.current.weapons.projectiles) {
      if (!projectile.active || projectile.kind !== kind) continue
      position.set(projectile.position.x, projectile.position.y, projectile.position.z)
      direction.set(projectile.direction.x, projectile.direction.y, projectile.direction.z)
      if (kind === 'missile') quaternion.setFromUnitVectors(axis, direction.normalize())
      else if (kind === 'satellite') quaternion.setFromAxisAngle(direction.set(0, 1, 0), clock.elapsedTime * 3 + projectile.slot)
      else quaternion.identity()
      if (kind === 'missile') scale.set(1, 1, 1)
      else if (kind === 'scatter') scale.setScalar(1 + Math.sin(clock.elapsedTime * 18 + projectile.slot) * 0.16)
      else if (kind === 'satellite') scale.setScalar(1 + Math.sin(clock.elapsedTime * 10 + projectile.slot) * 0.12)
      else scale.setScalar(1 + Math.sin(clock.elapsedTime * 12 + projectile.slot) * 0.1)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(count, matrix)
      mesh.setColorAt(count, color)
      count += 1
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[geometry, material, WEAPON_POOL_CAPS[kind]]} frustumCulled={false} renderOrder={5} />
}

function WeaponProjectiles() {
  return <group>{WEAPON_PROJECTILE_KINDS.map((kind) => <WeaponProjectilePool key={kind} kind={kind} />)}</group>
}

function LaserBursts() {
  const { runtime } = useGame()
  const rings = useRef<THREE.InstancedMesh>(null)
  const sparks = useRef<THREE.InstancedMesh>(null)
  const flashes = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const spin = useMemo(() => new THREE.Quaternion(), [])
  const forward = useMemo(() => new THREE.Vector3(0, 0, 1), [])
  useFrame(({ camera }) => {
    if (!rings.current || !sparks.current || !flashes.current) return
    let count = 0
    for (const burst of runtime.current.laserBursts) {
      if (!burst.active) continue
      const remaining = burst.life / burst.duration
      const ringSize = burst.kind === 'muzzle'
        ? 0.35 + remaining * 0.9
        : 0.25 + (1 - remaining) * 2.35
      position.set(burst.position.x, burst.position.y, burst.position.z)
      scale.setScalar(ringSize)
      matrix.compose(position, camera.quaternion, scale)
      rings.current.setMatrixAt(count, matrix)
      rings.current.setColorAt(count, color.set(burst.color).multiplyScalar(0.45 + remaining * 0.85))

      quaternion.copy(camera.quaternion)
      spin.setFromAxisAngle(forward, count * 1.91 + (1 - remaining) * 1.4)
      quaternion.multiply(spin)
      scale.set(0.12 + remaining * 0.14, 0.8 + (1 - remaining) * 2.8, 0.12)
      matrix.compose(position, quaternion, scale)
      sparks.current.setMatrixAt(count, matrix)
      sparks.current.setColorAt(count, color.set(burst.color).multiplyScalar(0.75 + remaining * 0.5))

      scale.setScalar((burst.kind === 'muzzle' ? 0.5 : 1.25) * remaining)
      matrix.compose(position, camera.quaternion, scale)
      flashes.current.setMatrixAt(count, matrix)
      flashes.current.setColorAt(count, color.set(burst.color).multiplyScalar(0.7 + remaining))
      count += 1
    }
    for (const mesh of [rings.current, sparks.current, flashes.current]) {
      mesh.count = count
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  })
  return (
    <group>
      <instancedMesh ref={rings} args={[undefined, undefined, LASER_MAX_BURSTS]} frustumCulled={false} renderOrder={6}>
        <ringGeometry args={[0.62, 1, 24]} />
        <meshBasicMaterial vertexColors transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={sparks} args={[undefined, undefined, LASER_MAX_BURSTS]} frustumCulled={false} renderOrder={7}>
        <tetrahedronGeometry args={[1, 0]} />
        <meshBasicMaterial vertexColors transparent opacity={0.86} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={flashes} args={[undefined, undefined, LASER_MAX_BURSTS]} frustumCulled={false} renderOrder={8}>
        <circleGeometry args={[1, 12]} />
        <meshBasicMaterial vertexColors transparent opacity={0.78} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} toneMapped={false} />
      </instancedMesh>
    </group>
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
    if (targetLight.current) {
      targetLight.current.position.set(drone.position.x, drone.position.y - 2.2, drone.position.z)
      targetLight.current.intensity = snapshot.beamActive ? 5.5 : 0
      targetLight.current.color.set(snapshot.boostActive ? '#69f7ff' : '#fff5bd')
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
      activeEnemies: runtime.current.enemies.slots.filter((enemy) => enemy.active).length,
      activeEnemyProjectiles: runtime.current.enemies.projectiles.filter((projectile) => projectile.active).length,
      laserShotsFired: runtime.current.laserShotsFired,
      weaponShotsFired: runtime.current.weapons.shotsFired,
      activeWeaponProjectiles: runtime.current.weapons.projectiles.filter((projectile) => projectile.active).length,
      selectedWeapon: runtime.current.selectedWeapon,
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
      <CrowdPools />
      <EnemyPools />
      <EnemyWarnings />
      <EnemyProjectiles />
      <WeaponProjectiles />
      <LaserProjectiles />
      <LaserBursts />
      <TractorBeam />
      <Ufo />
      <PostFx speed={snapshot.speed} impact={snapshot.impactFlash} />
    </>
  )
}
