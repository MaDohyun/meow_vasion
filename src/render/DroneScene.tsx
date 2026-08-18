import { Edges } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useGame, type CarriedTarget } from '../GameContext'
import type { MissionTarget, TargetKind } from '../core/missions'
import { City } from './City'
import { PostFx } from './PostFx'

function Cow({ color = '#f4eee0' }: { color?: string }) {
  return (
    <group scale={0.72}>
      <mesh castShadow><boxGeometry args={[1.35, 0.72, 0.7]} /><meshToonMaterial color={color} /><Edges color="#342d45" /></mesh>
      <mesh position={[0, 0.43, 0]}><boxGeometry args={[0.65, 0.13, 0.72]} /><meshToonMaterial color="#3b3348" /></mesh>
      <group position={[0, 0.02, 0.62]}>
        <mesh castShadow><boxGeometry args={[0.72, 0.62, 0.58]} /><meshToonMaterial color="#fff7df" /><Edges color="#342d45" /></mesh>
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
      <mesh position-y={0.54} castShadow><sphereGeometry args={[0.34, 9, 6]} /><meshToonMaterial color="#f4b98d" /><Edges color="#3b2f42" /></mesh>
      <mesh castShadow><capsuleGeometry args={[0.34, 0.7, 4, 8]} /><meshToonMaterial color={color} /><Edges color="#3b2f42" /></mesh>
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
      <mesh castShadow><boxGeometry args={[1.8, 0.62, 3.1]} /><meshToonMaterial color={color} /><Edges color="#342d45" /></mesh>
      <mesh position={[0, 0.53, -0.15]} castShadow><boxGeometry args={[1.55, 0.62, 1.55]} /><meshToonMaterial color="#9ee4e5" /><Edges color="#342d45" /></mesh>
      <mesh position={[0, 0.9, -0.15]}><boxGeometry args={[0.95, 0.16, 0.28]} /><meshBasicMaterial color={police ? '#ff4f73' : '#ffce55'} /></mesh>
      <mesh position={[-0.29, 0.91, -0.15]}><boxGeometry args={[0.28, 0.19, 0.32]} /><meshBasicMaterial color="#61dcff" /></mesh>
      <mesh position={[0.29, 0.91, -0.15]}><boxGeometry args={[0.28, 0.19, 0.32]} /><meshBasicMaterial color="#ff536d" /></mesh>
      {[-0.76, 0.76].flatMap((x) => [-0.92, 0.92].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, -0.26, z]} rotation-z={Math.PI / 2}><cylinderGeometry args={[0.27, 0.27, 0.18, 8]} /><meshToonMaterial color="#252334" /></mesh>
      )))}
    </group>
  )
}

function ScanNode({ color }: { color: string }) {
  return (
    <group>
      <mesh position-y={1.2} castShadow><boxGeometry args={[2.2, 2.1, 0.3]} /><meshToonMaterial color="#332d4d" /><Edges color={color} /></mesh>
      <mesh position={[0, 1.2, 0.18]}><planeGeometry args={[1.72, 1.4]} /><meshBasicMaterial color={color} /></mesh>
      <mesh position-y={0.15}><cylinderGeometry args={[0.18, 0.26, 1.6, 6]} /><meshToonMaterial color="#61536d" /></mesh>
      <pointLight position={[0, 1.2, 0.5]} color={color} intensity={4} distance={5} />
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
      <mesh position-y={3.8}>
        <octahedronGeometry args={[0.43]} />
        <meshBasicMaterial color={target.color} />
      </mesh>
      <pointLight position-y={2.1} color={target.color} intensity={selected ? 13 : 5} distance={9} />
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
  const length = Math.max(1.2, runtime.current.drone.position.y - (target?.position.y ?? 0.15) - 0.35)
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
        <coneGeometry args={[3.5 + length * 0.09, length, 24, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={target ? 0.34 : 0.24} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {[0.28, 0.56, 0.84].map((ratio) => (
        <mesh key={ratio} position-y={-length * ratio} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[1.2 + ratio * 1.25, 1.28 + ratio * 1.3, 22]} />
          <meshBasicMaterial color="#efffff" transparent opacity={0.48} depthWrite={false} />
        </mesh>
      ))}
      <pointLight position-y={-Math.min(3, length / 2)} color={color} intensity={10} distance={10} />
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
        <mesh castShadow scale={[1, 0.32, 1]}>
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
            <pointLight color="#64efff" intensity={10} distance={7} />
          </group>
        )}
        <pointLight position={[0, -0.25, 0]} color="#a8ffdf" intensity={6} distance={6} />
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
      <mesh castShadow rotation-x={Math.PI / 2}><coneGeometry args={[0.42, 3.1, 7]} /><meshToonMaterial color="#e7edf0" /><Edges color="#332b43" /></mesh>
      <mesh position={[0, 0, -0.35]} castShadow><boxGeometry args={[3.1, 0.13, 1.1]} /><meshToonMaterial color="#ff5b77" /><Edges color="#332b43" /></mesh>
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
        Math.min(17, player.y + 4.5 + index * 1.1 + Math.sin(angle * 1.7)),
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
    <group>
      {positions.slice(0, count).map(([x, y, z, rotation], index) => (
        <group key={index} position={[x, y, z]} rotation-y={rotation}>
          <PatrolCar police color="#e7ecdc" />
          <pointLight position={[0, 2, 0]} color={index % 2 ? '#ff4568' : '#5beaff'} intensity={8} distance={8} />
        </group>
      ))}
    </group>
  )
}

function LaserRay() {
  const { runtime, snapshot } = useGame()
  const ref = useRef<THREE.Mesh>(null)
  const direction = useMemo(() => new THREE.Vector3(), [])
  const midpoint = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    if (!ref.current) return
    const drone = runtime.current.drone
    const start = new THREE.Vector3(drone.position.x, drone.position.y, drone.position.z)
    const horizontalForward = Math.cos(drone.pitch)
    const end = new THREE.Vector3(
      start.x + Math.sin(drone.heading) * horizontalForward * 17,
      Math.max(0.5, Math.min(18, start.y + Math.sin(drone.pitch) * 17)),
      start.z + Math.cos(drone.heading) * horizontalForward * 17,
    )
    direction.subVectors(end, start)
    midpoint.addVectors(start, end).multiplyScalar(0.5)
    ref.current.position.copy(midpoint)
    ref.current.scale.y = direction.length()
    ref.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize())
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

function Sky() {
  const clouds = useMemo(() => [
    [-62, 38, -90, 1.4], [45, 50, -115, 1.8], [82, 33, -65, 1.1],
    [-95, 48, 15, 1.5], [18, 55, 88, 1.3], [-40, 31, 105, 1.1],
  ] as [number, number, number, number][], [])
  return (
    <>
      <color attach="background" args={['#68cbd0']} />
      <fog attach="fog" args={['#66aaa8', 88, 225]} />
      <mesh scale={230} renderOrder={-10}>
        <sphereGeometry args={[1, 32, 18]} />
        <shaderMaterial
          side={THREE.BackSide}
          depthWrite={false}
          vertexShader={`varying vec3 vPosition; void main(){ vPosition=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`}
          fragmentShader={`varying vec3 vPosition; void main(){ float h=normalize(vPosition).y; vec3 horizon=vec3(1.0,.48,.46); vec3 middle=vec3(.30,.72,.76); vec3 top=vec3(.16,.35,.58); vec3 c=mix(horizon,middle,smoothstep(-.18,.20,h)); c=mix(c,top,smoothstep(.20,.82,h)); gl_FragColor=vec4(c,1.0); }`}
        />
      </mesh>
      <hemisphereLight args={['#c4fbff', '#c35d69', 1.75]} />
      <directionalLight
        position={[-45, 70, 35]}
        color="#fff0c4"
        intensity={3.15}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-42}
        shadow-camera-right={42}
        shadow-camera-top={42}
        shadow-camera-bottom={-42}
      />
      <group position={[18, 47, -150]}>
        <mesh><circleGeometry args={[28, 40]} /><meshBasicMaterial color="#ffe36f" fog={false} /></mesh>
        <mesh position-z={-0.2}><ringGeometry args={[31, 39, 40]} /><meshBasicMaterial color="#ff8e68" transparent opacity={0.25} fog={false} /></mesh>
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
    </>
  )
}

export function DroneScene() {
  const { snapshot } = useGame()
  return (
    <>
      <Sky />
      <WorldTick />
      <City />
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
