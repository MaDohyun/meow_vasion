import type { BeamObject } from './beam'
import type { Vec3 } from './drone'
import { seedForWorldCell, WORLD_CELL_SIZE, type ProceduralBuilding } from './world'

export type EnemyKind = 'drone' | 'police' | 'police-car' | 'helicopter' | 'soldier' | 'fighter' | 'anti-air' | 'tank' | 'boss'
export type EnemyMode = 'roam' | 'chase' | 'ground' | 'strafe' | 'outbound' | 'fixed'
export type EnemyProjectileKind = 'rifle' | 'shell' | 'missile' | 'rocket' | 'boss-beam'

/**
 * When each wave lands, in seconds.
 *
 * Spaced across the run rather than fixed: these were once packed into the
 * first 150 seconds of a 180-second round, and stretching the round without
 * stretching these would have meant every enemy in the game had arrived by the
 * halfway mark with nothing new for the rest of it. The last wave lands with
 * fifty seconds still on the clock, which is the boss fight.
 */
export const ENEMY_WAVE_STAGES = [
  { at: 0, tempo: 0, label: 'RECON DRONES', targets: { drone: 2 } },
  { at: 35, tempo: 1, label: 'POLICE DISPATCH', targets: { drone: 8, police: 6, 'police-car': 2 } },
  { at: 75, tempo: 2, label: 'AIR SUPPORT', targets: { drone: 14, police: 10, 'police-car': 4, helicopter: 4 } },
  { at: 115, tempo: 3, label: 'MILITARY DEPLOYMENT', targets: { drone: 24, police: 14, 'police-car': 6, helicopter: 7, soldier: 18 } },
  { at: 150, tempo: 4, label: 'FIGHTER SCRAMBLE', targets: { drone: 30, police: 16, 'police-car': 8, helicopter: 9, soldier: 24, fighter: 3 } },
  { at: 185, tempo: 5, label: 'AA NETWORK', targets: { drone: 32, police: 18, 'police-car': 9, helicopter: 11, soldier: 26, fighter: 4, 'anti-air': 5 } },
  { at: 220, tempo: 6, label: 'ARMORED RESPONSE', targets: { drone: 34, police: 19, 'police-car': 10, helicopter: 12, soldier: 28, fighter: 5, 'anti-air': 6, tank: 7 } },
  { at: 250, tempo: 7, label: 'COUNTER-UFO', targets: { drone: 36, police: 20, 'police-car': 10, helicopter: 14, soldier: 30, fighter: 6, 'anti-air': 6, tank: 8, boss: 1 } },
] as const

export const ENEMY_TIER: Record<EnemyKind, number> = {
  drone: 0,
  police: 1,
  'police-car': 1,
  helicopter: 2,
  soldier: 3,
  fighter: 4,
  'anti-air': 5,
  tank: 6,
  boss: 7,
}

export const ENEMY_MAX_HP: Record<EnemyKind, number> = {
  drone: 1,
  police: 1,
  'police-car': 1,
  helicopter: 3,
  soldier: 1,
  fighter: 4,
  'anti-air': 10,
  tank: 8,
  boss: 25,
}

export const ENEMY_CAPS: Record<EnemyKind, number> = {
  drone: 36,
  police: 20,
  'police-car': 10,
  helicopter: 14,
  soldier: 30,
  fighter: 6,
  'anti-air': 6,
  tank: 8,
  boss: 1,
}

export const ENEMY_MAX_PROJECTILES = 96

/**
 * Drones are suicide drones: no weapons, no pursuit, they only detonate on
 * contact. Two populations, decided at spawn:
 *
 * - `fixed` ones hang motionless in the air. They are mines, and the reward for
 *   reading the sky before flying through it.
 * - `outbound` ones commit to a straight line through a point picked near the
 *   player AT SPAWN and never adjust. The line is fixed, so it can be read and
 *   sidestepped; a homing version would just be a tax on being seen.
 *
 * Helicopters keep a slow yaw so the sky does not read as parallel tracks.
 */
const AIR_TRAVEL_SPEED: Record<'drone' | 'helicopter', number> = { drone: 19, helicopter: 15 }
/** Share of drones that hover as mines rather than making a pass. */
export const DRONE_MINE_SHARE = 0.4
/** Mines drift up and down a little so they read as alive, not as scenery. */
const MINE_BOB = 1.4
const AIR_TURN_RATE: Record<'drone' | 'helicopter', number> = { drone: 0.05, helicopter: 0.22 }
const AIR_DESPAWN_DISTANCE = 240

// Each air type owns an altitude band and stays in it. Climbing out of a band
// has to be a real escape, which it is not if the enemy follows you up.
export function airBandForSlot(kind: 'drone' | 'helicopter', slot: number) {
  return kind === 'drone' ? 5 + (slot % 5) * 3.2 : 19 + (slot % 4) * 4.5
}

export function isDroneMine(enemy: EnemySlot) {
  return enemy.kind === 'drone' && enemy.mode === 'fixed'
}

// Body-contact damage. Drones are the only unit that dies on contact, which is
// what makes ploughing through a swarm a real choice instead of a death.
export const ENEMY_CONTACT_DAMAGE: Record<EnemyKind, number> = {
  // Detonating on you is the drone's entire purpose, so it costs more than
  // brushing a vehicle.
  drone: 5,
  police: 2,
  'police-car': 3,
  helicopter: 4,
  soldier: 2,
  fighter: 5,
  'anti-air': 4,
  tank: 5,
  boss: 8,
}

export type EnemySlot = BeamObject & {
  kind: EnemyKind
  slot: number
  generation: number
  active: boolean
  hp: number
  maxHp: number
  position: Vec3
  velocity: Vec3
  target: Vec3
  phase: number
  age: number
  radius: number
  hitRadius: number
  respawn: number
  sourceId: string | null
  mode: EnemyMode
  roadAxis: 'x' | 'z'
  roadDirection: -1 | 1
  attackTimer: number
  telegraph: number
  aiming: boolean
  /**
   * Where the shot will leave from, frozen when the enemy starts aiming.
   *
   * The intercept is solved from this point, so firing from anywhere else
   * makes the shot travel a different distance than the solution assumed and
   * arrive beside the target - a tank that walked a few metres during its own
   * telegraph missed by exactly that much, every time. It also makes the aim
   * line honest: the line the player saw is the line the shot takes.
   */
  muzzle: Vec3
}

export type EnemyProjectile = {
  id: string
  active: boolean
  kind: EnemyProjectileKind
  position: Vec3
  velocity: Vec3
  life: number
  damage: number
  radius: number
}

export type EnemyState = {
  slots: EnemySlot[]
  projectiles: EnemyProjectile[]
  destroyedAntiAir: Set<string>
  waveStage: number
  spawnTimer: number
  randomState: number
  contactKills: number
  /** Kind of the last projectile that connected, so the caller can price the
   *  hit by weapon rather than by a raw damage number. */
  lastHitKind: EnemyProjectileKind | null
  /** Where the last suicide drone detonated, for the explosion effect. */
  lastContactPoint: Vec3
}

const ORDER: EnemyKind[] = ['drone', 'police', 'police-car', 'helicopter', 'soldier', 'fighter', 'anti-air', 'tank', 'boss']
const SPAWN_ORDER: EnemyKind[] = ['boss', 'tank', 'anti-air', 'fighter', 'soldier', 'helicopter', 'police-car', 'police', 'drone']

export const ENEMY_DIAMETER: Record<EnemyKind, number> = {
  drone: 1.6,
  police: 1.35,
  'police-car': 3.2,
  helicopter: 4.6,
  soldier: 1.55,
  fighter: 4.4,
  'anti-air': 5.2,
  tank: 4.8,
  boss: 13.6,
}

const ENEMY_MASS: Record<EnemyKind, number> = {
  drone: 0.7,
  police: 0.4,
  'police-car': 2.8,
  helicopter: 4.1,
  soldier: 0.55,
  fighter: 3.8,
  'anti-air': 7,
  tank: 6.4,
  boss: 20,
}

export function waveStageForTime(elapsed: number) {
  let stage = 0
  for (let index = 0; index < ENEMY_WAVE_STAGES.length; index += 1) {
    if (elapsed >= ENEMY_WAVE_STAGES[index]!.at) stage = index
    else break
  }
  return stage
}

export function waveTempoForTime(elapsed: number) {
  return ENEMY_WAVE_STAGES[waveStageForTime(elapsed)]!.tempo
}

export function waveLabelForTime(elapsed: number) {
  return ENEMY_WAVE_STAGES[waveStageForTime(elapsed)]!.label
}

function random(state: EnemyState) {
  let value = state.randomState || 1
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  state.randomState = value >>> 0 || 1
  return state.randomState / 0xffffffff
}

function targetForKind(kind: EnemyKind, elapsed: number) {
  const stage = ENEMY_WAVE_STAGES[waveStageForTime(elapsed)]!
  const targets = stage.targets as Partial<Record<EnemyKind, number>>
  return Math.min(ENEMY_CAPS[kind], targets[kind] ?? 0)
}

function activeCount(state: EnemyState, kind: EnemyKind) {
  let count = 0
  for (const enemy of state.slots) if (enemy.active && enemy.kind === kind) count += 1
  return count
}

function makeProjectile(slot: number): EnemyProjectile {
  return {
    id: `enemy-projectile:${slot}`,
    active: false,
    kind: 'rifle',
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    life: 0,
    damage: 0,
    radius: 0.35,
  }
}

function makeSlot(kind: EnemyKind, slot: number): EnemySlot {
  return {
    id: `enemy:${kind}:${slot}:0`,
    kind,
    slot,
    generation: 0,
    active: false,
    mass: ENEMY_MASS[kind],
    color: '#ff3355',
    hp: ENEMY_MAX_HP[kind],
    maxHp: ENEMY_MAX_HP[kind],
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
    inBeam: false,
    tether: 0,
    playerTouched: false,
    destroying: false,
    destroyTimer: 0,
    explosionPending: false,
    absorbing: false,
    absorbTimer: 0,
    diameter: ENEMY_DIAMETER[kind],
    scoreValue: kind === 'boss' ? 1200 : kind === 'tank' ? 260 : kind === 'fighter' ? 140 : kind === 'helicopter' ? 80 : kind === 'police-car' ? 55 : 35,
    beamImmune: kind === 'anti-air',
    freePhysics: false,
    target: { x: 0, y: 0, z: 0 },
    phase: slot / Math.max(1, ENEMY_CAPS[kind]) * Math.PI * 2,
    age: 0,
    radius: 80,
    hitRadius: 1,
    respawn: 0,
    sourceId: null,
    mode: 'roam',
    roadAxis: slot % 2 === 0 ? 'x' : 'z',
    roadDirection: slot % 2 === 0 ? 1 : -1,
    attackTimer: 1,
    telegraph: 0,
    aiming: false,
    muzzle: { x: 0, y: 0, z: 0 },
  }
}

export function createEnemyState(seed = 0x91eab7) {
  const slots: EnemySlot[] = []
  for (const kind of ORDER) for (let slot = 0; slot < ENEMY_CAPS[kind]; slot += 1) slots.push(makeSlot(kind, slot))
  const projectiles = Array.from({ length: ENEMY_MAX_PROJECTILES }, (_, slot) => makeProjectile(slot))
  return { slots, projectiles, destroyedAntiAir: new Set<string>(), waveStage: 0, spawnTimer: 0, randomState: seed >>> 0 || 1, contactKills: 0, lastHitKind: null, lastContactPoint: { x: 0, y: 0, z: 0 } } satisfies EnemyState
}

export function isAntiAirBuilding(building: Pick<ProceduralBuilding, 'cellX' | 'cellZ'>) {
  return seedForWorldCell(building.cellX, building.cellZ, 0xa17a1) % 5 === 0
}

function resetSlot(enemy: EnemySlot, player: Vec3, heading: number, state: EnemyState) {
  enemy.generation += 1
  enemy.id = `enemy:${enemy.kind}:${enemy.slot}:${enemy.generation}`
  enemy.hp = enemy.maxHp
  enemy.active = true
  enemy.sourceId = null
  enemy.age = 0
  enemy.telegraph = 0
  enemy.aiming = false
  enemy.inBeam = false
  enemy.tether = 0
  enemy.playerTouched = false
  enemy.destroying = false
  enemy.destroyTimer = 0
  enemy.explosionPending = false
  enemy.absorbing = false
  enemy.absorbTimer = 0
  enemy.rotation.x = 0
  enemy.rotation.y = 0
  enemy.rotation.z = 0
  enemy.angularVelocity.x = 0
  enemy.angularVelocity.y = 0
  enemy.angularVelocity.z = 0
  enemy.phase = heading + (enemy.slot + 1) * 2.399963
  enemy.mode = enemy.kind === 'fighter' ? 'strafe' : enemy.kind === 'anti-air' ? 'fixed' : enemy.kind === 'police' || enemy.kind === 'police-car' || enemy.kind === 'soldier' || enemy.kind === 'tank' ? 'ground' : enemy.kind === 'boss' ? 'chase' : 'roam'
  enemy.radius = enemy.kind === 'fighter' ? 110 : enemy.kind === 'boss' ? 78 : enemy.kind === 'helicopter' ? 92 : 82
  enemy.hitRadius = enemy.kind === 'drone' ? 0.75 : enemy.kind === 'police' ? 0.9 : enemy.kind === 'police-car' ? 1.8 : enemy.kind === 'soldier' ? 1.1 : enemy.kind === 'helicopter' ? 2.4 : enemy.kind === 'fighter' ? 2.2 : enemy.kind === 'tank' ? 2.8 : enemy.kind === 'anti-air' ? 2.2 : 6.8
  enemy.attackTimer = 0.7 + (enemy.slot % 5) * 0.22
  enemy.velocity.x = 0
  enemy.velocity.y = 0
  enemy.velocity.z = 0
  const angle = heading + (enemy.slot + 1) * 2.399963 + (random(state) - 0.5) * 0.3
  const distance = enemy.kind === 'fighter' ? 118 : enemy.kind === 'boss' ? 92 : 78 + (enemy.slot % 3) * 7
  if (enemy.mode === 'ground') {
    enemy.roadAxis = enemy.slot % 2 === 0 ? 'x' : 'z'
    enemy.roadDirection = enemy.slot % 3 === 0 ? -1 : 1
    const lane = (enemy.slot % 2 === 0 ? -1 : 1) * (3.2 + (enemy.slot % 3) * 0.7)
    if (enemy.roadAxis === 'x') {
      enemy.position.x = player.x + Math.cos(angle) * distance
      enemy.position.z = Math.round(player.z / WORLD_CELL_SIZE) * WORLD_CELL_SIZE + lane
    } else {
      enemy.position.x = Math.round(player.x / WORLD_CELL_SIZE) * WORLD_CELL_SIZE + lane
      enemy.position.z = player.z + Math.sin(angle) * distance
    }
    enemy.position.y = enemy.kind === 'tank' ? 1.2 : 0.8
  } else {
    enemy.position.x = player.x + Math.sin(angle) * distance
    enemy.position.z = player.z + Math.cos(angle) * distance
    enemy.position.y = enemy.kind === 'drone' || enemy.kind === 'helicopter'
      ? airBandForSlot(enemy.kind, enemy.slot)
      : Math.min(118, Math.max(8, player.y + 10))
  }
  if (enemy.kind === 'drone') {
    // Decided once, here. A drone never converts between the two.
    enemy.mode = random(state) < DRONE_MINE_SHARE ? 'fixed' : 'outbound'
    if (enemy.mode === 'fixed') {
      // Mines are seeded across the whole altitude range, including right in the
      // band a player skimming the rooftops would use.
      enemy.position.y = 4 + random(state) * 26
    } else {
      // The pass line is locked to a point near where the player is NOW. It is
      // not updated afterwards, so it can be read and stepped out of.
      const aimX = player.x + (random(state) - 0.5) * 34
      const aimZ = player.z + (random(state) - 0.5) * 34
      enemy.phase = Math.atan2(aimX - enemy.position.x, aimZ - enemy.position.z)
      enemy.target.x = aimX
      enemy.target.z = aimZ
      enemy.target.y = enemy.position.y
    }
  } else if (enemy.kind === 'helicopter') {
    // Aim the travel heading at a scattered point near the player so the path
    // crosses the play area once and then carries on past it.
    const aimX = player.x + (random(state) - 0.5) * 46
    const aimZ = player.z + (random(state) - 0.5) * 46
    enemy.phase = Math.atan2(aimX - enemy.position.x, aimZ - enemy.position.z)
  }
  enemy.target.x = player.x + (random(state) - 0.5) * 24
  enemy.target.y = enemy.position.y
  enemy.target.z = player.z + (random(state) - 0.5) * 24
}

function spawnOne(state: EnemyState, kind: EnemyKind, player: Vec3, heading: number) {
  const slot = state.slots.find((item) => item.kind === kind && !item.active && item.respawn <= 0)
  if (!slot) return false
  resetSlot(slot, player, heading, state)
  return true
}

export function syncEnemyTiers(state: EnemyState, elapsed: number, player: Vec3, heading: number, dt: number) {
  const stage = waveStageForTime(elapsed)
  const stageChanged = stage > state.waveStage
  state.waveStage = stage
  state.spawnTimer -= Math.min(Math.max(0, dt), 0.05)
  if (stageChanged) state.spawnTimer = 0
  const initialBurst = state.spawnTimer <= 0 && activeEnemyCount(state, 'drone') === 0 && activeEnemyCount(state, 'police') === 0
  for (const enemy of state.slots) {
    if (enemy.respawn > 0) enemy.respawn = Math.max(0, enemy.respawn - dt)
    const target = targetForKind(enemy.kind, elapsed)
    if (target === 0 && enemy.active && enemy.kind !== 'anti-air') enemy.active = false
  }
  let spawned = 0
  const burstLimit = stage === 0 ? 2 : 4
  while ((state.spawnTimer <= 0 || (initialBurst && spawned < 2)) && spawned < burstLimit) {
    let didSpawn = false
    for (const kind of SPAWN_ORDER) {
      if (kind === 'anti-air') continue
      if (activeCount(state, kind) >= targetForKind(kind, elapsed)) continue
      if (spawnOne(state, kind, player, heading)) { didSpawn = true; spawned += 1; break }
    }
    if (!didSpawn) break
    state.spawnTimer += Math.max(0.055, 0.42 - stage * 0.038)
  }
  return state
}

export function syncAntiAirEnemies(state: EnemyState, elapsed: number, buildings: ProceduralBuilding[]) {
  const target = targetForKind('anti-air', elapsed)
  for (const enemy of state.slots) {
    if (enemy.kind !== 'anti-air' || !enemy.active || !enemy.sourceId) continue
    let found = false
    for (const building of buildings) if (building.id === enemy.sourceId) { found = true; break }
    if (!found || elapsed < 110) enemy.active = false
  }
  if (elapsed < 110) return
  for (const building of buildings) {
    if (activeCount(state, 'anti-air') >= target) break
    if (!isAntiAirBuilding(building) || state.destroyedAntiAir.has(building.id)) continue
    let exists = false
    for (const enemy of state.slots) if (enemy.kind === 'anti-air' && enemy.active && enemy.sourceId === building.id) { exists = true; break }
    if (exists) continue
    const slot = state.slots.find((enemy) => enemy.kind === 'anti-air' && !enemy.active && enemy.respawn <= 0)
    if (!slot) break
    slot.generation += 1
    slot.id = `enemy:anti-air:${slot.slot}:${slot.generation}`
    slot.active = true
    slot.hp = slot.maxHp
    slot.sourceId = building.id
    slot.mode = 'fixed'
    slot.beamImmune = true
    slot.inBeam = false
    slot.tether = 0
    slot.absorbing = false
    slot.position.x = building.position.x
    slot.position.y = building.size.y + 2.3
    slot.position.z = building.position.z
    slot.hitRadius = 2.2
    slot.attackTimer = 1.4
  }
}

function distanceToPlayer(enemy: EnemySlot, player: Vec3) {
  return Math.hypot(enemy.position.x - player.x, enemy.position.y - player.y, enemy.position.z - player.z)
}

/**
 * Shot speeds.
 *
 * Every one of these is above the craft's cruising speed of 30, and that is the
 * whole reason they changed. They used to sit between 16 and 25 - slower than
 * the thing they were shooting at - which means no interception solution
 * exists at all: a fleeing target simply outruns the bullet. Combined with
 * aiming at where the player *was*, the real rule of the game was "stand still
 * and die, move in any direction at all and be immortal", and beam ballast,
 * the only speed penalty in the game, was protecting nothing.
 *
 * Turbo (54) still outruns most of them. That is deliberate: turbo is a
 * resource, and spending it to outrun a shell is a fair play.
 */
export const PROJECTILE_SPEED: Record<EnemyProjectileKind, number> = {
  rifle: 58,
  shell: 46,
  missile: 52,
  rocket: 44,
  'boss-beam': 40,
}

/**
 * How well each enemy leads a moving target, 0 (shoots where you are) to 1
 * (shoots exactly where you will be).
 *
 * Tiered rather than uniform, because the wave ladder is the difficulty curve:
 * police and infantry miss often enough that the first minute teaches the rule
 * without punishing it, and by the time the anti-air network is up, flying
 * straight is fatal.
 *
 * A lower tier still leads the target properly - it just puts the shot down
 * beside the answer. Scaling the lead instead was the first attempt and it was
 * wrong: an eighty-percent lead is a twenty-percent shortfall, which at a
 * hundred metres is a twenty-metre miss every single time, so a tank could
 * never hit anything at all. Aiming at the right place with a bounded error
 * makes a low tier look like a near miss rather than like an enemy that cannot
 * shoot.
 */
export const AIM_ERROR_METRES = 16

export const LEAD_ACCURACY: Record<EnemyKind, number> = {
  drone: 0,
  police: 0.45,
  'police-car': 0.6,
  soldier: 0.45,
  helicopter: 0.62,
  fighter: 0.82,
  tank: 0.8,
  'anti-air': 1,
  boss: 1,
}

/**
 * Where to shoot so a shot travelling at `speed` meets a target moving at
 * `velocity`.
 *
 * Solves the quadratic for time-to-intercept. When there is no solution - the
 * target is outrunning the shot - it returns null and the caller fires at the
 * target's current position instead, because an enemy that holds its fire
 * whenever the maths fails just goes mute.
 */
export function interceptTime(toTarget: Vec3, velocity: Vec3, speed: number) {
  const a = velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z - speed * speed
  const b = 2 * (toTarget.x * velocity.x + toTarget.y * velocity.y + toTarget.z * velocity.z)
  const c = toTarget.x * toTarget.x + toTarget.y * toTarget.y + toTarget.z * toTarget.z
  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) < 1e-6) return null
    const linear = -c / b
    return linear > 0 ? linear : null
  }
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return null
  const root = Math.sqrt(discriminant)
  const first = (-b + root) / (2 * a)
  const second = (-b - root) / (2 * a)
  const candidates = [first, second].filter((value) => value > 0)
  if (candidates.length === 0) return null
  return Math.min(...candidates)
}

function aimProjectile(state: EnemyState, enemy: EnemySlot, player: Vec3, playerVelocity: Vec3, kind: EnemyProjectileKind, speed: number, damage: number, telegraph: number) {
  enemy.telegraph = telegraph
  enemy.aiming = true
  const accuracy = LEAD_ACCURACY[enemy.kind]
  enemy.muzzle.x = enemy.position.x
  enemy.muzzle.y = enemy.position.y
  enemy.muzzle.z = enemy.position.z
  // The shot leaves after the telegraph, so the prediction has to cover the
  // wait as well as the flight. Leading only for flight time leaves every shot
  // a telegraph's worth of travel behind - at cruising speed that is fifteen
  // metres of error against a target one metre wide, which is why simply
  // predicting was not enough on its own.
  const atFire = {
    x: player.x + playerVelocity.x * telegraph,
    y: player.y + playerVelocity.y * telegraph,
    z: player.z + playerVelocity.z * telegraph,
  }
  const toTarget = {
    x: atFire.x - enemy.muzzle.x,
    y: atFire.y - enemy.muzzle.y,
    z: atFire.z - enemy.muzzle.z,
  }
  // Predicted at aim time, not at fire time. The telegraph window is the whole
  // dodge: change course inside it and the prediction is wrong, hold course and
  // the shot arrives.
  const flight = interceptTime(toTarget, playerVelocity, speed) ?? 0
  const lead = telegraph + flight
  // Full lead, then a bounded scatter for anything below the top tier. The
  // scatter is in metres and does not grow with range, so a low tier is
  // inaccurate rather than useless.
  const spread = (1 - accuracy) * AIM_ERROR_METRES
  enemy.target.x = player.x + playerVelocity.x * lead + (random(state) - 0.5) * 2 * spread
  enemy.target.y = player.y + playerVelocity.y * lead + (random(state) - 0.5) * spread
  enemy.target.z = player.z + playerVelocity.z * lead + (random(state) - 0.5) * 2 * spread
  if (kind === 'rocket') {
    enemy.target.x += (enemy.slot % 3 - 1) * 13
    enemy.target.z += ((enemy.slot + 1) % 3 - 1) * 13
  }
  enemy.velocity.x = speed
  enemy.velocity.y = damage
  enemy.velocity.z = kind === 'boss-beam' ? 1 : 0
  return state
}

function fireProjectile(state: EnemyState, enemy: EnemySlot, kind: EnemyProjectileKind) {
  const projectile = state.projectiles.find((item) => !item.active)
  if (!projectile) return false
  const dx = enemy.target.x - enemy.muzzle.x
  const dy = enemy.target.y - enemy.muzzle.y
  const dz = enemy.target.z - enemy.muzzle.z
  const distance = Math.max(0.001, Math.hypot(dx, dy, dz))
  const speed = enemy.velocity.x
  projectile.active = true
  projectile.kind = kind
  projectile.position.x = enemy.muzzle.x
  projectile.position.y = enemy.muzzle.y
  projectile.position.z = enemy.muzzle.z
  projectile.velocity.x = dx / distance * speed
  projectile.velocity.y = dy / distance * speed
  projectile.velocity.z = dz / distance * speed
  projectile.life = kind === 'boss-beam' ? 4 : 5.5
  projectile.damage = enemy.velocity.y
  projectile.radius = kind === 'missile' || kind === 'shell' ? 0.85 : kind === 'boss-beam' ? 1.1 : 0.45
  return true
}

function stepAirEnemy(enemy: EnemySlot, player: Vec3, d: number) {
  // No chase mode. On an endless map, letting air units latch onto the player
  // removes the point of flying anywhere: the same drones stay glued to you and
  // repositioning stops being a decision.
  enemy.age += d
  if (isDroneMine(enemy)) {
    // Holds station. The bob is cosmetic; the hazard is that it does not move.
    enemy.position.y = enemy.target.y + Math.sin(enemy.age * 1.3 + enemy.phase) * MINE_BOB
    // Mines are only cleared by leaving them far behind, never by waiting.
    if (distanceToPlayer(enemy, player) > AIR_DESPAWN_DISTANCE) enemy.active = false
    return
  }
  const kind = enemy.kind === 'drone' ? 'drone' : 'helicopter'
  const speed = AIR_TRAVEL_SPEED[kind]
  enemy.position.x += Math.sin(enemy.phase) * speed * d
  enemy.position.z += Math.cos(enemy.phase) * speed * d
  if (enemy.kind === 'drone') {
    // Dead straight, and no altitude tracking: the line committed to at spawn is
    // the line it flies, which is what makes it dodgeable.
    if (distanceToPlayer(enemy, player) > AIR_DESPAWN_DISTANCE) enemy.active = false
    return
  }
  enemy.phase += d * AIR_TURN_RATE[kind]
  const band = airBandForSlot(kind, enemy.slot)
  enemy.position.y += (band - enemy.position.y) * (1 - Math.exp(-1.4 * d))
  if (distanceToPlayer(enemy, player) > AIR_DESPAWN_DISTANCE) enemy.active = false
}

function stepGroundEnemy(enemy: EnemySlot, player: Vec3, d: number) {
  const speed = enemy.kind === 'tank' ? 4.2 : enemy.kind === 'police-car' ? 11 : enemy.kind === 'soldier' ? 7.2 : 8.4
  enemy.position[enemy.roadAxis] += speed * enemy.roadDirection * d
  enemy.position.y = enemy.kind === 'tank' ? 1.2 : 0.8
  if (distanceToPlayer(enemy, player) > 230) enemy.active = false
}

function stepFighter(enemy: EnemySlot, player: Vec3, d: number) {
  enemy.age += d
  if (enemy.mode === 'strafe') {
    const dx = enemy.target.x - enemy.position.x
    const dz = enemy.target.z - enemy.position.z
    const distance = Math.max(0.001, Math.hypot(dx, dz))
    enemy.position.x += dx / distance * 24 * d
    enemy.position.z += dz / distance * 24 * d
    enemy.position.y += (Math.max(8, player.y + 7) - enemy.position.y) * (1 - Math.exp(-2 * d))
    if (distance < 5 || enemy.age > 4.8) {
      enemy.mode = 'outbound'
      const directionX = enemy.position.x - player.x
      const directionZ = enemy.position.z - player.z
      const length = Math.max(1, Math.hypot(directionX, directionZ))
      enemy.target.x = player.x + directionX / length * 150
      enemy.target.z = player.z + directionZ / length * 150
    }
  } else {
    const dx = enemy.target.x - enemy.position.x
    const dz = enemy.target.z - enemy.position.z
    const distance = Math.max(0.001, Math.hypot(dx, dz))
    enemy.position.x += dx / distance * 24 * d
    enemy.position.z += dz / distance * 24 * d
    if (enemy.age > 10 || distance < 5) enemy.active = false
  }
}

const STILL: Vec3 = { x: 0, y: 0, z: 0 }

export function stepEnemies(state: EnemyState, player: Vec3, dt: number, playerVelocity: Vec3 = STILL) {
  const d = Math.min(Math.max(0, dt), 0.05)
  for (const enemy of state.slots) {
    if (!enemy.active) continue
    if (enemy.absorbing || enemy.inBeam || enemy.tether > 0.02) {
      enemy.aiming = false
      enemy.telegraph = 0
      continue
    }
    if (enemy.kind === 'anti-air') {
      enemy.aiming = player.y >= 28 && distanceToPlayer(enemy, player) <= 145
    } else if (enemy.kind === 'fighter') stepFighter(enemy, player, d)
    else if (enemy.kind === 'drone' || enemy.kind === 'helicopter') stepAirEnemy(enemy, player, d)
    else if (enemy.kind === 'police' || enemy.kind === 'police-car' || enemy.kind === 'soldier' || enemy.kind === 'tank') stepGroundEnemy(enemy, player, d)
    else {
      const distance = distanceToPlayer(enemy, player)
      const desiredX = player.x + Math.sin(enemy.phase) * 66
      const desiredZ = player.z + Math.cos(enemy.phase) * 66
      const blend = 1 - Math.exp(-0.48 * d)
      enemy.position.x += (desiredX - enemy.position.x) * blend
      enemy.position.z += (desiredZ - enemy.position.z) * blend
      enemy.position.y += (Math.max(8, player.y + 8) - enemy.position.y) * (1 - Math.exp(-0.6 * d))
      enemy.phase += d * 0.18
      if (distance > 170) enemy.position.y += (player.y - enemy.position.y) * d
    }

    enemy.attackTimer -= d
    if (enemy.telegraph > 0) {
      enemy.telegraph = Math.max(0, enemy.telegraph - d)
      if (enemy.telegraph <= 0) {
        if (enemy.kind === 'police' || enemy.kind === 'soldier' || enemy.kind === 'helicopter') fireProjectile(state, enemy, 'rifle')
        else if (enemy.kind === 'police-car') fireProjectile(state, enemy, 'shell')
        else if (enemy.kind === 'tank') fireProjectile(state, enemy, 'shell')
        else if (enemy.kind === 'anti-air') fireProjectile(state, enemy, 'missile')
        else if (enemy.kind === 'fighter') fireProjectile(state, enemy, 'rocket')
        else if (enemy.kind === 'boss') fireProjectile(state, enemy, enemy.slot % 2 === 0 ? 'boss-beam' : 'missile')
        enemy.aiming = false
        enemy.attackTimer = enemy.kind === 'boss' ? 2.5 : enemy.kind === 'anti-air' ? 3.8 : enemy.kind === 'tank' ? 2.8 : enemy.kind === 'helicopter' ? 1.6 : 2.2
      }
    } else if (enemy.attackTimer <= 0) {
      const distance = distanceToPlayer(enemy, player)
      const low = player.y <= 5.5
      const middle = player.y > 5.5 && player.y < 28
      const high = player.y >= 28
      // Drones are deliberately absent here: they deal contact damage only.
      // Thirty-six of them firing would bury the screen in projectiles.
      const canAttack = (enemy.kind === 'police' || enemy.kind === 'soldier') ? low && distance < 48
        : enemy.kind === 'police-car' ? low && distance < 58
          : enemy.kind === 'helicopter' ? !high && distance < 78
            : enemy.kind === 'tank' ? middle && distance < 100
              : enemy.kind === 'anti-air' ? high && distance < 145
                : enemy.kind === 'boss' || enemy.kind === 'fighter'
      if (canAttack) {
        const kind = enemy.kind === 'police' || enemy.kind === 'soldier' || enemy.kind === 'helicopter' ? 'rifle' : enemy.kind === 'police-car' || enemy.kind === 'tank' ? 'shell' : enemy.kind === 'anti-air' ? 'missile' : enemy.kind === 'fighter' ? 'rocket' : 'boss-beam'
        const speed = PROJECTILE_SPEED[kind]
        const damage = kind === 'rifle' ? 2 : kind === 'shell' ? (enemy.kind === 'tank' ? 5 : 4) : kind === 'missile' ? 10 : kind === 'rocket' ? 3 : 7
        aimProjectile(state, enemy, player, playerVelocity, kind, speed, damage, enemy.kind === 'boss' ? 1.1 : enemy.kind === 'anti-air' ? 0.8 : enemy.kind === 'helicopter' ? 0.45 : 0.52)
      }
    }
  }
  return state
}

export function stepEnemyProjectiles(state: EnemyState, player: Vec3, dt: number, playerRadius = 1.25) {
  const d = Math.min(Math.max(0, dt), 0.05)
  let damage = 0
  state.lastHitKind = null
  for (const projectile of state.projectiles) {
    if (!projectile.active) continue
    projectile.position.x += projectile.velocity.x * d
    projectile.position.y += projectile.velocity.y * d
    projectile.position.z += projectile.velocity.z * d
    projectile.life -= d
    const distance = Math.hypot(projectile.position.x - player.x, projectile.position.y - player.y, projectile.position.z - player.z)
    if (distance <= projectile.radius + playerRadius) {
      projectile.active = false
      // Worst hit wins rather than the sum: a burst arriving on one frame
      // should not price out as a single catastrophic blow.
      if (!state.lastHitKind || projectile.damage > damage) state.lastHitKind = projectile.kind
      damage += projectile.damage
    } else if (projectile.life <= 0 || distance > 260) projectile.active = false
  }
  return damage
}

export function hitEnemy(state: EnemyState, id: string, damage = 1) {
  for (const enemy of state.slots) {
    if (!enemy.active || enemy.absorbing || enemy.id !== id) continue
    enemy.hp = Math.max(0, enemy.hp - damage)
    if (enemy.hp > 0) return { hit: true, destroyed: false, kind: enemy.kind, enemy }
    enemy.active = false
    if (enemy.kind === 'anti-air' && enemy.sourceId) state.destroyedAntiAir.add(enemy.sourceId)
    else enemy.respawn = enemy.kind === 'boss' ? 999 : 4.5
    return { hit: true, destroyed: true, kind: enemy.kind, enemy }
  }
  return { hit: false, destroyed: false, kind: null, enemy: null }
}

export function activeEnemyCount(state: EnemyState, kind?: EnemyKind) {
  let count = 0
  for (const enemy of state.slots) if (enemy.active && (!kind || enemy.kind === kind)) count += 1
  return count
}

export function nearbyEnemyThreats(state: EnemyState, player: Vec3) {
  let count = 0
  for (const enemy of state.slots) {
    if (!enemy.active || enemy.absorbing || enemy.inBeam || enemy.tether > 0.02) continue
    const range = enemy.kind === 'anti-air' ? 145 : enemy.kind === 'drone' ? 32 : enemy.kind === 'helicopter' ? 42 : enemy.hitRadius + 2.4
    if (distanceToPlayer(enemy, player) <= range) count += 1
  }
  return count
}

// Returns the worst single contact damage for this tick and, as a side effect,
// destroys any drone the player flew through. Damage is a max rather than a sum
// so a dense pack cannot stack into an instant kill.
export function resolveEnemyContacts(state: EnemyState, player: Vec3, playerRadius = 1.4) {
  let damage = 0
  state.contactKills = 0
  for (const enemy of state.slots) {
    if (!enemy.active || enemy.absorbing || enemy.inBeam || enemy.tether > 0.02) continue
    if (distanceToPlayer(enemy, player) > enemy.hitRadius + playerRadius) continue
    const contact = ENEMY_CONTACT_DAMAGE[enemy.kind]
    if (contact > damage) damage = contact
    if (enemy.kind !== 'drone') continue
    state.lastContactPoint.x = enemy.position.x
    state.lastContactPoint.y = enemy.position.y
    state.lastContactPoint.z = enemy.position.z
    enemy.active = false
    enemy.hp = 0
    enemy.respawn = 4.5
    state.contactKills += 1
  }
  return damage
}
