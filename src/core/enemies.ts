import type { Vec3 } from './drone'
import { seedForWorldCell, WORLD_CELL_SIZE, type ProceduralBuilding } from './world'

export type EnemyKind = 'drone' | 'police' | 'police-car' | 'helicopter' | 'soldier' | 'fighter' | 'anti-air' | 'tank' | 'boss'
export type EnemyMode = 'roam' | 'chase' | 'ground' | 'strafe' | 'outbound' | 'fixed'
export type EnemyProjectileKind = 'rifle' | 'shell' | 'missile' | 'rocket' | 'boss-beam'

export const ENEMY_WAVE_STAGES = [
  { at: 0, tempo: 0, label: 'RECON DRONES', targets: { drone: 2 } },
  { at: 20, tempo: 1, label: 'POLICE DISPATCH', targets: { drone: 8, police: 6, 'police-car': 2 } },
  { at: 45, tempo: 2, label: 'AIR SUPPORT', targets: { drone: 14, police: 10, 'police-car': 4, helicopter: 4 } },
  { at: 70, tempo: 3, label: 'MILITARY DEPLOYMENT', targets: { drone: 24, police: 14, 'police-car': 6, helicopter: 7, soldier: 18 } },
  { at: 90, tempo: 4, label: 'FIGHTER SCRAMBLE', targets: { drone: 30, police: 16, 'police-car': 8, helicopter: 9, soldier: 24, fighter: 3 } },
  { at: 110, tempo: 5, label: 'AA NETWORK', targets: { drone: 32, police: 18, 'police-car': 9, helicopter: 11, soldier: 26, fighter: 4, 'anti-air': 5 } },
  { at: 130, tempo: 6, label: 'ARMORED RESPONSE', targets: { drone: 34, police: 19, 'police-car': 10, helicopter: 12, soldier: 28, fighter: 5, 'anti-air': 6, tank: 7 } },
  { at: 150, tempo: 7, label: 'COUNTER-UFO', targets: { drone: 36, police: 20, 'police-car': 10, helicopter: 14, soldier: 30, fighter: 6, 'anti-air': 6, tank: 8, boss: 1 } },
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

// Air units travel on a heading fixed at spawn. Drones hold a straight line;
// helicopters keep a slow yaw so the sky does not read as parallel tracks.
const AIR_TRAVEL_SPEED: Record<'drone' | 'helicopter', number> = { drone: 12, helicopter: 15 }
const AIR_TURN_RATE: Record<'drone' | 'helicopter', number> = { drone: 0.05, helicopter: 0.22 }
const AIR_DESPAWN_DISTANCE = 240

// Each air type owns an altitude band and stays in it. Climbing out of a band
// has to be a real escape, which it is not if the enemy follows you up.
export function airBandForSlot(kind: 'drone' | 'helicopter', slot: number) {
  return kind === 'drone' ? 5 + (slot % 5) * 3.2 : 19 + (slot % 4) * 4.5
}

// Body-contact damage. Drones are the only unit that dies on contact, which is
// what makes ploughing through a swarm a real choice instead of a death.
export const ENEMY_CONTACT_DAMAGE: Record<EnemyKind, number> = {
  drone: 3,
  police: 2,
  'police-car': 3,
  helicopter: 4,
  soldier: 2,
  fighter: 5,
  'anti-air': 4,
  tank: 5,
  boss: 8,
}

export type EnemySlot = {
  id: string
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
}

const ORDER: EnemyKind[] = ['drone', 'police', 'police-car', 'helicopter', 'soldier', 'fighter', 'anti-air', 'tank', 'boss']
const SPAWN_ORDER: EnemyKind[] = ['boss', 'tank', 'anti-air', 'fighter', 'soldier', 'helicopter', 'police-car', 'police', 'drone']

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
    hp: ENEMY_MAX_HP[kind],
    maxHp: ENEMY_MAX_HP[kind],
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
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
  }
}

export function createEnemyState(seed = 0x91eab7) {
  const slots: EnemySlot[] = []
  for (const kind of ORDER) for (let slot = 0; slot < ENEMY_CAPS[kind]; slot += 1) slots.push(makeSlot(kind, slot))
  const projectiles = Array.from({ length: ENEMY_MAX_PROJECTILES }, (_, slot) => makeProjectile(slot))
  return { slots, projectiles, destroyedAntiAir: new Set<string>(), waveStage: 0, spawnTimer: 0, randomState: seed >>> 0 || 1, contactKills: 0 } satisfies EnemyState
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
  if (enemy.kind === 'drone' || enemy.kind === 'helicopter') {
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

function aimProjectile(state: EnemyState, enemy: EnemySlot, player: Vec3, kind: EnemyProjectileKind, speed: number, damage: number, telegraph: number) {
  enemy.telegraph = telegraph
  enemy.aiming = true
  enemy.target.x = player.x
  enemy.target.y = player.y
  enemy.target.z = player.z
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
  const dx = enemy.target.x - enemy.position.x
  const dy = enemy.target.y - enemy.position.y
  const dz = enemy.target.z - enemy.position.z
  const distance = Math.max(0.001, Math.hypot(dx, dy, dz))
  const speed = enemy.velocity.x
  projectile.active = true
  projectile.kind = kind
  projectile.position.x = enemy.position.x
  projectile.position.y = enemy.position.y
  projectile.position.z = enemy.position.z
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
  const kind = enemy.kind === 'drone' ? 'drone' : 'helicopter'
  const speed = AIR_TRAVEL_SPEED[kind]
  enemy.position.x += Math.sin(enemy.phase) * speed * d
  enemy.position.z += Math.cos(enemy.phase) * speed * d
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

export function stepEnemies(state: EnemyState, player: Vec3, dt: number) {
  const d = Math.min(Math.max(0, dt), 0.05)
  for (const enemy of state.slots) {
    if (!enemy.active) continue
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
        const speed = kind === 'rifle' ? 22 : kind === 'shell' ? 18 : kind === 'missile' ? 25 : kind === 'rocket' ? 24 : 16
        const damage = kind === 'rifle' ? 2 : kind === 'shell' ? (enemy.kind === 'tank' ? 5 : 4) : kind === 'missile' ? 10 : kind === 'rocket' ? 3 : 7
        aimProjectile(state, enemy, player, kind, speed, damage, enemy.kind === 'boss' ? 1.1 : enemy.kind === 'anti-air' ? 0.8 : enemy.kind === 'helicopter' ? 0.45 : 0.52)
      }
    }
  }
  return state
}

export function stepEnemyProjectiles(state: EnemyState, player: Vec3, dt: number) {
  const d = Math.min(Math.max(0, dt), 0.05)
  let damage = 0
  for (const projectile of state.projectiles) {
    if (!projectile.active) continue
    projectile.position.x += projectile.velocity.x * d
    projectile.position.y += projectile.velocity.y * d
    projectile.position.z += projectile.velocity.z * d
    projectile.life -= d
    const distance = Math.hypot(projectile.position.x - player.x, projectile.position.y - player.y, projectile.position.z - player.z)
    if (distance <= projectile.radius + 1.25) {
      projectile.active = false
      damage += projectile.damage
    } else if (projectile.life <= 0 || distance > 260) projectile.active = false
  }
  return damage
}

export function hitEnemy(state: EnemyState, id: string, damage = 1) {
  for (const enemy of state.slots) {
    if (!enemy.active || enemy.id !== id) continue
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
    if (!enemy.active) continue
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
    if (!enemy.active) continue
    if (distanceToPlayer(enemy, player) > enemy.hitRadius + playerRadius) continue
    const contact = ENEMY_CONTACT_DAMAGE[enemy.kind]
    if (contact > damage) damage = contact
    if (enemy.kind !== 'drone') continue
    enemy.active = false
    enemy.hp = 0
    enemy.respawn = 4.5
    state.contactKills += 1
  }
  return damage
}
