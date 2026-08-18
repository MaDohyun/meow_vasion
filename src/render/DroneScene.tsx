import { Edges } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useGame, type CarriedTarget } from '../GameContext'
import { beamProfile } from '../core/beam'
import type { MissionTarget, TargetKind } from '../core/missions'
import { WORLD_MAX_CARS } from '../core/world'
import { City } from './City'
import { PostFx } from './PostFx'

declare global {
  interface Window {
    __BEAM_BANDIT_METRICS__?: {
      activeBuildings: number
      activeCars: number
      visibleMeshPools: number
    }
  }
}

function Cow({ color = '#f4eee0' }: { color?: string }) {
  return (
    <group scale={0.72}>
      <mesh><boxGeometry args={[1.35, 0.72, 0.7]} /><meshToonMaterial color={color} /><Edges color="#342d45" /></mesh>
      <mesh position={[0, 0.43, 0]}><boxGeometry args={[0.65, 0.13, 0.72]} /><meshToonMaterial color="#3b3348" /></mesh>
      <group position={[0, 0.02, 0.62]}>
        <mesh><boxGeometry args={[0.72, 0.62, 0.58]} /><meshToonMaterial color="#fff7df" /><Edges color="#342d45" /></mesh>
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
      <mesh position-y={0.54}><sphereGeometry args={[0.34, 9, 6]} /><meshToonMaterial color="#f4b98d" /><Edges color="#3b2f42" /></mesh>
      <mesh><capsuleGeometry args={[0.34, 0.7, 4, 8]} /><meshToonMaterial color={color} /><Edges color="#3b2f42" /></mesh>
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
  return (
    <group scale={0.8}>
      <mesh><boxGeometry args={[1.8, 0.62, 3.1]} /><meshToonMaterial color={color} /><Edges color="#342d45" /></mesh>
      <mesh position={[0, 0.53, -0.15]}><boxGeometry args={[1.55, 0.62, 1.55]} /><meshToonMaterial color="#9ee4e5" /><Edges color="#342d45" /></mesh>
      <mesh position={[0, 0.9, -0.15]}><boxGeometry args={[0.95, 0.16, 0.28]} /><meshBasicMaterial color={police ? '#ff4f73' : '#ffce55'} /></mesh>
      <mesh position={[-0.29, 0.91, -0.15]}><boxGeometry args={[0.28, 0.19, 0.32]} /><meshBasicMaterial color="#61dcff" /></mesh>
      <mesh position={[0.29, 0.91, -0.15]}><boxGeometry args={[0.28, 0.19, 0.32]} /><meshBasicMaterial color="#ff536d" /></mesh>
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
      <instancedMesh ref={shadow} args={[undefined, undefined, WORLD_MAX_CARS]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#28313d" transparent opacity={0.32} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={body} args={[undefined, undefined, WORLD_MAX_CARS]} frustumCulled={false}>
        <boxGeometry args={[1.8, 0.62, 3.1]} />
        <meshToonMaterial />
      </instancedMesh>
      <instancedMesh ref={cabin} args={[undefined, undefined, WORLD_MAX_CARS]} frustumCulled={false}>
        <boxGeometry args={[1.55, 0.62, 1.55]} />
        <meshToonMaterial color="#9ee4e5" />
      </instancedMesh>
      <instancedMesh ref={lightbar} args={[undefined, undefined, WORLD_MAX_CARS]} frustumCulled={false}>
        <boxGeometry args={[0.95, 0.16, 0.28]} />
        <meshBasicMaterial color="#ffce55" />
      </instancedMesh>
      <instancedMesh ref={glow} args={[undefined, undefined, WORLD_MAX_CARS]} frustumCulled={false} renderOrder={3}>
        <ringGeometry args={[1.25, 1.55, 18]} />
        <meshBasicMaterial color="#a7fff0" transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} />
      </instancedMesh>
    </group>
  )
}

function ScanNode({ color }: { color: string }) {
  return (
    <group>
      <mesh position-y={1.2}><boxGeometry args={[2.2, 2.1, 0.3]} /><meshToonMaterial color="#332d4d" /><Edges color={color} /></mesh>
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
  })
  if (!snapshot.beamActive) return null
  const color = target?.color ?? '#8fffe1'
  return (
    <group ref={root} position={[runtime.current.drone.position.x, runtime.current.drone.position.y, runtime.current.drone.position.z]}>
      <group position-y={-0.42}>
      <mesh position-y={-length / 2} renderOrder={2}>
        <coneGeometry args={[radius, length, 24, 1, true]} />
        <meshBasicMaterial color={snapshot.boostActive ? '#69f7ff' : color} transparent opacity={snapshot.boostActive ? 0.38 : target ? 0.34 : 0.24} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {[0.28, 0.56, 0.84].map((ratio) => (
        <mesh key={ratio} position-y={-length * ratio} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[radius * ratio * 0.78, radius * ratio * 0.78 + 0.16, 22]} />
          <meshBasicMaterial color="#efffff" transparent opacity={0.48} depthWrite={false} />
        </mesh>
      ))}
      </group>
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
    }
    if (rim.current) rim.current.rotation.y += dt * (snapshot.beamActive ? 7 : 2.8)

    const heading = game.drone.heading
    const pitch = game.drone.pitch
    const horizontalForward = Math.cos(pitch)
    const forwardX = Math.sin(heading) * horizontalForward
    const forwardY = Math.sin(pitch)
    const forwardZ = Math.cos(heading) * horizontalForward
    const speedRatio = Math.min(1, snapshot.speed / 22)
    const altitudeView = Math.max(0, game.drone.position.y - 6) * 0.12
    const distance = 7.8 + speedRatio * 3.3 + altitudeView
    cameraPosition.set(
      game.drone.position.x - forwardX * distance,
      Math.max(1, game.drone.position.y + 3.6 + speedRatio * 1.1 + altitudeView - forwardY * distance * 0.72),
      game.drone.position.z - forwardZ * distance,
    )
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
      <mesh rotation-x={Math.PI / 2}><coneGeometry args={[0.42, 3.1, 7]} /><meshToonMaterial color="#e7edf0" /><Edges color="#332b43" /></mesh>
      <mesh position={[0, 0, -0.35]}><boxGeometry args={[3.1, 0.13, 1.1]} /><meshToonMaterial color="#ff5b77" /><Edges color="#332b43" /></mesh>
      <mesh position={[0, 0.4, -1]}><boxGeometry args={[0.14, 0.85, 0.8]} /><meshToonMaterial color="#665084" /></mesh>
      <mesh position={[0, 0, -1.7]}><circleGeometry args={[0.25, 8]} /><meshBasicMaterial color="#64eaff" /></mesh>
    </group>
  )
}

function Fighters() {
  const { runtime, snapshot } = useGame()
  const group = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!group.current) return
    const player = runtime.current.drone.position
    group.current.children.forEach((fighter, index) => {
      const angle = clock.elapsedTime * (0.55 + index * 0.07) + index * 2.25
      const radius = 12 + index * 3.5
      fighter.position.set(
        player.x + Math.sin(angle) * radius,
        Math.min(88, player.y + 4.5 + index * 1.1 + Math.sin(angle * 1.7)),
        player.z + Math.cos(angle) * radius,
      )
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

function LaserRay() {
  const { runtime, snapshot } = useGame()
  const ref = useRef<THREE.Mesh>(null)
  const { camera } = useThree()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const pointer = useMemo(() => new THREE.Vector2(), [])
  const start = useMemo(() => new THREE.Vector3(), [])
  const aimPoint = useMemo(() => new THREE.Vector3(), [])
  const end = useMemo(() => new THREE.Vector3(), [])
  const direction = useMemo(() => new THREE.Vector3(), [])
  const midpoint = useMemo(() => new THREE.Vector3(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  useFrame(() => {
    if (!ref.current) return
    const drone = runtime.current.drone
    start.set(drone.position.x, drone.position.y, drone.position.z)
    pointer.set(runtime.current.aimX, -runtime.current.aimY)
    raycaster.setFromCamera(pointer, camera)
    aimPoint.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, 60)
    direction.subVectors(aimPoint, start).normalize()
    end.copy(start).addScaledVector(direction, 38)
    direction.subVectors(end, start)
    midpoint.addVectors(start, end).multiplyScalar(0.5)
    ref.current.position.copy(midpoint)
    ref.current.scale.y = direction.length()
    ref.current.quaternion.setFromUnitVectors(up, direction.normalize())
  })
  if (!snapshot.laserActive) return null
  return (
    <mesh ref={ref}>
      <cylinderGeometry args={[0.07, 0.16, 1, 6]} />
      <meshBasicMaterial color="#ffef6a" />
    </mesh>
  )
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
    window.__BEAM_BANDIT_METRICS__ = {
      activeBuildings: runtime.current.world.buildings.length,
      activeCars: runtime.current.beamObjects.length,
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
      <color attach="background" args={['#68cbd0']} />
      <fog attach="fog" args={['#66aaa8', 110, 260]} />
      <ambientLight color="#d8fbf2" intensity={1.15} />
      <hemisphereLight args={['#c4fbff', '#c35d69', 1.75]} />
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
            fragmentShader={`varying vec3 vPosition; void main(){ float h=normalize(vPosition).y; vec3 horizon=vec3(1.0,.48,.46); vec3 middle=vec3(.30,.72,.76); vec3 top=vec3(.16,.35,.58); vec3 c=mix(horizon,middle,smoothstep(-.18,.20,h)); c=mix(c,top,smoothstep(.20,.82,h)); gl_FragColor=vec4(c,1.0); }`}
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
      <WorldTick />
      <FixedEffectLights />
      <PerformanceProbe />
      <City />
      <PullableCars />
      <MissionTargets />
      <DroppedCaptives />
      <GroundPolice />
      <Fighters />
      <LaserRay />
      <TractorBeam />
      <Ufo />
      <PostFx speed={snapshot.speed} impact={snapshot.impactFlash} />
    </>
  )
}
