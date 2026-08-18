import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createDroneState, stepDrone, collideDrone, type DroneInput, type DroneState, type Vec3 } from './core/drone'
import {
  channelTarget,
  generateMission,
  isMissionComplete,
  nearestBeamTarget,
  type Mission,
  type MissionTarget,
  type TargetKind,
} from './core/missions'
import { CITY_COLLIDERS } from './render/cityData'
import { tone, unlockAudio } from './audio'

export type GamePhase = 'intro' | 'playing' | 'results'

export type CarriedTarget = {
  id: string
  label: string
  kind: TargetKind
  color: string
}

export type DroppedCaptive = CarriedTarget & {
  position: Vec3
  velocity: Vec3
  age: number
}

export type GameRuntime = {
  drone: DroneState
  mission: Mission
  missionIndex: number
  sessionTime: number
  score: number
  completedMissions: number
  chain: number
  chainWindow: number
  wanted: number
  maxWanted: number
  heat: number
  calmTime: number
  health: number
  sinceHit: number
  damageCooldown: number
  turbo: number
  aimX: number
  aimY: number
  beamActive: boolean
  beamTargetId: string | null
  laserActive: boolean
  laserFlash: number
  laserCooldown: number
  fighterDamage: number
  fighterRespawns: number[]
  fightersDown: number
  fighterAttackTimer: number
  policeAttackTimer: number
  fiveStarTimer: number | null
  carried: CarriedTarget[]
  dropped: DroppedCaptive[]
  phase: GamePhase
  message: string
  messageTime: number
  impactFlash: number
  collisionCooldown: number
  resultTitle: string
  victory: boolean
}

export type GameSnapshot = {
  phase: GamePhase
  speed: number
  height: number
  mission: Mission
  sessionTime: number
  score: number
  completedMissions: number
  chain: number
  chainWindow: number
  wanted: number
  maxWanted: number
  heat: number
  health: number
  turbo: number
  boostActive: boolean
  aimX: number
  aimY: number
  beamActive: boolean
  beamAvailable: boolean
  beamTargetId: string | null
  laserActive: boolean
  laserFlash: number
  activeFighters: number
  fightersDown: number
  fiveStarTimer: number | null
  carried: CarriedTarget[]
  dropped: DroppedCaptive[]
  message: string
  impactFlash: number
  resultTitle: string
  victory: boolean
}

export type PlayerInput = DroneInput & {
  beam: boolean
  laser: boolean
}

type MobileInput = PlayerInput & { active: boolean }

type GameContextValue = {
  runtime: React.MutableRefObject<GameRuntime>
  snapshot: GameSnapshot
  readInput: () => PlayerInput
  advance: (dt: number) => void
  start: () => void
  restart: () => void
  setMobileInput: (input: Partial<MobileInput>) => void
}

const GameContext = createContext<GameContextValue | null>(null)

const UFO_UPGRADES = { speed: 0.45, stability: 0, rack: 0, special: 'none' as const }

function makeRuntime(): GameRuntime {
  const drone = createDroneState()
  drone.position = { x: 0, y: 2.8, z: 54.5 }
  drone.heading = Math.PI
  return {
    drone,
    mission: generateMission(0),
    missionIndex: 0,
    sessionTime: 180,
    score: 0,
    completedMissions: 0,
    chain: 1,
    chainWindow: 0,
    wanted: 0,
    maxWanted: 0,
    heat: 0,
    calmTime: 0,
    health: 3,
    sinceHit: 99,
    damageCooldown: 0,
    turbo: 1,
    aimX: 0,
    aimY: 0,
    beamActive: false,
    beamTargetId: null,
    laserActive: false,
    laserFlash: 0,
    laserCooldown: 0,
    fighterDamage: 0,
    fighterRespawns: [],
    fightersDown: 0,
    fighterAttackTimer: 5.5,
    policeAttackTimer: 6.5,
    fiveStarTimer: null,
    carried: [],
    dropped: [],
    phase: 'intro',
    message: 'FIRST CONTACT: CATTLE CLASSIFIED',
    messageTime: 4,
    impactFlash: 0,
    collisionCooldown: 0,
    resultTitle: '',
    victory: false,
  }
}

function copyMission(mission: Mission): Mission {
  return {
    ...mission,
    targets: mission.targets.map((target) => ({ ...target, position: { ...target.position } })),
  }
}

function activeFighterCount(game: GameRuntime) {
  return Math.max(0, Math.min(3, game.wanted) - game.fighterRespawns.length)
}

function snapshotOf(game: GameRuntime): GameSnapshot {
  return {
    phase: game.phase,
    speed: Math.hypot(game.drone.velocity.x, game.drone.velocity.y, game.drone.velocity.z),
    height: game.drone.position.y,
    mission: copyMission(game.mission),
    sessionTime: game.sessionTime,
    score: game.score,
    completedMissions: game.completedMissions,
    chain: game.chain,
    chainWindow: game.chainWindow,
    wanted: game.wanted,
    maxWanted: game.maxWanted,
    heat: game.heat,
    health: game.health,
    turbo: game.turbo,
    boostActive: game.drone.boostRemaining > 0,
    aimX: game.aimX,
    aimY: game.aimY,
    beamActive: game.beamActive,
    beamAvailable: game.drone.boostRemaining <= 0.08,
    beamTargetId: game.beamTargetId,
    laserActive: game.laserActive,
    laserFlash: game.laserFlash,
    activeFighters: activeFighterCount(game),
    fightersDown: game.fightersDown,
    fiveStarTimer: game.fiveStarTimer,
    carried: game.carried.map((item) => ({ ...item })),
    dropped: game.dropped.map((item) => ({ ...item, position: { ...item.position }, velocity: { ...item.velocity } })),
    message: game.messageTime > 0 ? game.message : '',
    impactFlash: game.impactFlash,
    resultTitle: game.resultTitle,
    victory: game.victory,
  }
}

function endRun(game: GameRuntime, title: string, victory: boolean) {
  game.phase = 'results'
  game.resultTitle = title
  game.victory = victory
  game.beamActive = false
  game.laserActive = false
  game.message = title
  game.messageTime = 10
}

function raiseWanted(game: GameRuntime) {
  if (game.wanted >= 5) return
  game.wanted += 1
  game.maxWanted = Math.max(game.maxWanted, game.wanted)
  game.fighterAttackTimer = Math.max(game.fighterAttackTimer, 2.2)
  if (game.wanted === 5 && game.fiveStarTimer === null) {
    game.fiveStarTimer = 18
    game.message = 'FIVE STARS — SURVIVE 18 SECONDS!'
    game.messageTime = 3
  }
}

function dropCaptive(game: GameRuntime) {
  const captive = game.carried.pop()
  if (!captive) return
  const angle = game.drone.heading + Math.PI * 0.7
  game.dropped.push({
    ...captive,
    position: { ...game.drone.position, y: game.drone.position.y - 0.6 },
    velocity: {
      x: game.drone.velocity.x * 0.35 + Math.sin(angle) * 2,
      y: 2.3,
      z: game.drone.velocity.z * 0.35 + Math.cos(angle) * 2,
    },
    age: 0,
  })
}

function damage(game: GameRuntime, source: 'POLICE' | 'FIGHTER' | 'BUILDING') {
  if (game.damageCooldown > 0 || game.phase !== 'playing') return
  game.health = Math.max(0, game.health - 1)
  game.sinceHit = 0
  game.damageCooldown = 1.05
  game.impactFlash = 1
  dropCaptive(game)
  game.message = `${source} HIT — SHIELD ${game.health}/3`
  game.messageTime = 1.8
  tone(source === 'BUILDING' ? 'impact' : 'warning')
  if ('vibrate' in navigator) navigator.vibrate?.([35, 20, 35])
  if (game.health <= 0) endRun(game, 'UFO IMPOUNDED', false)
}

function secureTarget(game: GameRuntime, target: MissionTarget) {
  if (target.kind === 'cow' || target.kind === 'tourist') {
    game.carried.push({ id: target.id, label: target.label, kind: target.kind, color: target.color })
    if (game.carried.length > 4) game.carried.shift()
    game.message = `${target.label} ACQUIRED`
    tone('pickup')
  } else if (target.kind === 'billboard') {
    game.message = `${target.label} DOWNLOADED`
    tone('upgrade')
  } else {
    game.message = `${target.label} OVERCOOKED`
    tone('impact')
  }
  game.messageTime = 1.2
  game.score += 55 * game.chain
}

function finishMission(game: GameRuntime) {
  const chained = game.completedMissions > 0 && game.chainWindow > 0
  game.chain = chained ? Math.min(5, game.chain + 1) : 1
  game.chainWindow = 32
  game.completedMissions += 1
  const reward = (450 + game.mission.targets.length * 75) * game.chain
  game.score += reward
  raiseWanted(game)
  game.heat = Math.max(game.heat, 0.18)
  game.missionIndex += 1
  game.mission = generateMission(game.missionIndex)
  if (game.wanted < 5) {
    game.message = `MISSION COMPLETE · STAR ${game.wanted} · CHAIN x${game.chain}`
    game.messageTime = 2.8
  }
  tone('delivery')
}

export function GameProvider({ children }: { children: ReactNode }) {
  const runtime = useRef(makeRuntime())
  const [snapshot, setSnapshot] = useState(() => snapshotOf(runtime.current))
  const keys = useRef<Record<string, boolean>>({})
  const pointer = useRef({ x: 0, y: 0 })
  const mobile = useRef<MobileInput>({
    throttle: 0,
    steer: 0,
    vertical: 0,
    special: false,
    beam: false,
    laser: false,
    active: false,
  })
  const publishAccumulator = useRef(0)

  const publish = useCallback(() => setSnapshot(snapshotOf(runtime.current)), [])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      keys.current[event.code] = true
      if (event.key.length === 1) keys.current[`Key${event.key.toUpperCase()}`] = true
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault()
    }
    const up = (event: KeyboardEvent) => {
      keys.current[event.code] = false
      if (event.key.length === 1) keys.current[`Key${event.key.toUpperCase()}`] = false
    }
    const move = (event: PointerEvent) => {
      pointer.current.x = Math.max(-1, Math.min(1, event.clientX / Math.max(1, window.innerWidth) * 2 - 1))
      pointer.current.y = Math.max(-1, Math.min(1, event.clientY / Math.max(1, window.innerHeight) * 2 - 1))
    }
    const leave = () => { pointer.current.x = 0; pointer.current.y = 0 }
    window.addEventListener('keydown', down, { passive: false })
    window.addEventListener('keyup', up)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerdown', move)
    document.documentElement.addEventListener('mouseleave', leave)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', move)
      document.documentElement.removeEventListener('mouseleave', leave)
    }
  }, [])

  const readInput = useCallback((): PlayerInput => {
    const pointerMagnitude = Math.abs(pointer.current.x)
    const mouseSteer = pointerMagnitude < 0.08
      ? 0
      : -Math.sign(pointer.current.x) * Math.pow((pointerMagnitude - 0.08) / 0.92, 1.18)
    const keyboard: PlayerInput = {
      throttle: (keys.current.KeyW || keys.current.ArrowUp ? 1 : 0) - (keys.current.KeyS || keys.current.ArrowDown ? 1 : 0),
      steer: mouseSteer,
      strafe: (keys.current.KeyD || keys.current.ArrowRight ? 1 : 0) - (keys.current.KeyA || keys.current.ArrowLeft ? 1 : 0),
      lookPitch: -pointer.current.y,
      vertical: 0,
      special: Boolean(keys.current.Space),
      beam: Boolean(keys.current.KeyE),
      laser: Boolean(keys.current.KeyQ),
    }
    return mobile.current.active ? {
      throttle: mobile.current.throttle,
      steer: mobile.current.steer,
      strafe: mobile.current.strafe ?? 0,
      lookPitch: mobile.current.lookPitch ?? 0,
      vertical: mobile.current.vertical,
      special: mobile.current.special,
      beam: mobile.current.beam,
      laser: mobile.current.laser,
    } : keyboard
  }, [])

  const advance = useCallback((dt: number) => {
    const game = runtime.current
    if (game.phase !== 'playing') return
    const d = Math.min(dt, 0.05)
    const input = readInput()
    game.aimX = pointer.current.x
    game.aimY = pointer.current.y
    game.sessionTime = Math.max(0, game.sessionTime - d)
    game.messageTime = Math.max(0, game.messageTime - d)
    game.impactFlash = Math.max(0, game.impactFlash - d * 5)
    game.collisionCooldown = Math.max(0, game.collisionCooldown - d)
    game.damageCooldown = Math.max(0, game.damageCooldown - d)
    game.laserCooldown = Math.max(0, game.laserCooldown - d)
    game.laserFlash = Math.max(0, game.laserFlash - d)
    game.chainWindow = Math.max(0, game.chainWindow - d)
    game.sinceHit += d

    const turboActive = input.special && game.turbo > 0.02
    if (turboActive) {
      if (game.drone.boostRemaining <= 0) {
        game.message = 'TURBO ENGAGED — BEAM OFFLINE'
        game.messageTime = 1.2
        tone('upgrade')
      }
      game.turbo = Math.max(0, game.turbo - d * 0.31)
      game.drone.boostRemaining = Math.max(game.drone.boostRemaining, 0.12)
    } else {
      game.turbo = Math.min(1, game.turbo + d * 0.13)
    }

    const flightInput: DroneInput = { ...input, special: false }
    const stepped = stepDrone(game.drone, flightInput, d, game.carried.length, UFO_UPGRADES)
    const collision = collideDrone(stepped, CITY_COLLIDERS)
    game.drone = collision.state
    if (collision.hit && collision.impulse > 2.5 && game.collisionCooldown <= 0) {
      game.collisionCooldown = 0.45
      damage(game, 'BUILDING')
    }

    const beamUsable = !input.special && !turboActive && game.drone.boostRemaining <= 0.08
    game.beamActive = input.beam && beamUsable
    game.beamTargetId = null
    if (game.beamActive) {
      const target = nearestBeamTarget(game.mission, game.drone.position)
      if (target) {
        game.beamTargetId = target.id
        const result = channelTarget(game.mission, target.id, d)
        if (game.completedMissions > 0) {
          const altitudeFactor = game.drone.position.y < 4 ? 0.56 : 1
          game.heat += d * (target.kind === 'patrol' ? 0.17 : 0.08) * altitudeFactor
        }
        if (result.completed && result.target) {
          secureTarget(game, result.target)
          game.beamTargetId = null
          if (isMissionComplete(game.mission)) finishMission(game)
        }
      }
    }

    game.fighterRespawns = game.fighterRespawns.map((time) => time - d).filter((time) => time > 0)
    const fighters = activeFighterCount(game)
    game.laserActive = input.laser
    if (game.laserActive && game.laserCooldown <= 0) {
      game.laserCooldown = 0.27
      game.laserFlash = 0.12
      game.heat += d * 1.8
      tone('pickup')
      if (fighters > 0) {
        game.fighterDamage += 1
        if (game.fighterDamage >= 4) {
          game.fighterDamage = 0
          game.fighterRespawns.push(4.8)
          game.fightersDown += 1
          game.fighterAttackTimer = Math.max(game.fighterAttackTimer, 3.2)
          game.score += 180 * game.chain
          game.message = 'FIGHTER POPPED · +180'
          game.messageTime = 1.4
          tone('upgrade')
        }
      }
    }

    if (game.completedMissions > 0 && game.wanted < 5 && game.heat >= 1) {
      game.heat = 0.25
      raiseWanted(game)
      game.message = `HEAT SPIKE — STAR ${game.wanted}`
      game.messageTime = 2
      tone('warning')
    }

    const horizontalSpeed = Math.hypot(game.drone.velocity.x, game.drone.velocity.z)
    if (game.fiveStarTimer === null && game.wanted > 0 && game.drone.position.y < 3.4 && horizontalSpeed < 4 && !game.beamActive && !game.laserActive && !turboActive) {
      game.calmTime += d
      game.heat = Math.max(0, game.heat - d * 0.09)
      if (game.calmTime >= 7) {
        game.calmTime = 0
        game.wanted = Math.max(0, game.wanted - 1)
        game.message = 'LOST THE COPS — HEAT DOWN'
        game.messageTime = 2
      }
    } else {
      game.calmTime = Math.max(0, game.calmTime - d * 2)
    }

    if (fighters > 0) {
      game.fighterAttackTimer -= d * (game.drone.position.y >= 6 ? 1.25 : 0.42)
      if (game.fighterAttackTimer <= 0) {
        damage(game, 'FIGHTER')
        game.fighterAttackTimer = Math.max(2.7, 5.2 - game.wanted * 0.38)
      }
    } else {
      game.fighterAttackTimer = Math.max(game.fighterAttackTimer, 1.8)
    }

    if (game.wanted >= 2 && game.drone.position.y < 3.2) {
      game.policeAttackTimer -= d
      if (game.policeAttackTimer <= 0) {
        damage(game, 'POLICE')
        game.policeAttackTimer = Math.max(3.3, 6.2 - game.wanted * 0.42)
      }
    } else {
      game.policeAttackTimer = Math.max(game.policeAttackTimer, 2)
    }

    if (game.health < 3 && game.sinceHit >= 8) {
      game.health = 3
      game.sinceHit = 0
      game.message = 'SHIELD RESTORED'
      game.messageTime = 1.8
      tone('upgrade')
    }

    game.dropped = game.dropped.filter((item) => {
      item.age += d
      item.velocity.y -= 9.8 * d
      item.position.x += item.velocity.x * d
      item.position.y += item.velocity.y * d
      item.position.z += item.velocity.z * d
      if (item.position.y < 0.65) {
        item.position.y = 0.65
        item.velocity.y = Math.abs(item.velocity.y) * 0.25
        item.velocity.x *= Math.pow(0.72, d * 60)
        item.velocity.z *= Math.pow(0.72, d * 60)
      }
      return item.age < 7
    })

    if (game.fiveStarTimer !== null) {
      game.fiveStarTimer = Math.max(0, game.fiveStarTimer - d)
      if (game.fiveStarTimer <= 0) endRun(game, 'FIVE-STAR GETAWAY', true)
    } else if (game.sessionTime <= 0) {
      endRun(game, 'RAID COMPLETE', true)
    }

    publishAccumulator.current += d
    if (publishAccumulator.current >= 0.06 || (game.phase as GamePhase) === 'results') {
      publishAccumulator.current = 0
      publish()
    }
  }, [publish, readInput])

  const start = useCallback(() => {
    unlockAudio()
    const game = runtime.current
    game.phase = 'playing'
    game.message = 'HOLD E ABOVE A TARGET'
    game.messageTime = 3
    publish()
  }, [publish])

  const restart = useCallback(() => {
    runtime.current = makeRuntime()
    runtime.current.phase = 'playing'
    runtime.current.message = 'NEW RAID — FIND THE GREEN TARGETS'
    runtime.current.messageTime = 3
    publish()
  }, [publish])

  const setMobileInput = useCallback((input: Partial<MobileInput>) => {
    Object.assign(mobile.current, input)
  }, [])

  const value = useMemo<GameContextValue>(() => ({
    runtime,
    snapshot,
    readInput,
    advance,
    start,
    restart,
    setMobileInput,
  }), [advance, readInput, restart, setMobileInput, snapshot, start])

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame() {
  const value = useContext(GameContext)
  if (!value) throw new Error('useGame must be used inside GameProvider')
  return value
}
