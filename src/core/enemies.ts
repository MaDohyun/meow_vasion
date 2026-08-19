import type { Vec3 } from './drone'
import { seedForWorldCell, type ProceduralBuilding } from './world'

export type EnemyKind = 'soldier' | 'helicopter' | 'anti-air' | 'fighter' | 'balloon'

export const ENEMY_TIER: Record<EnemyKind, number> = {
  soldier: 1,
  helicopter: 2,
  'anti-air': 3,
  fighter: 4,
  balloon: 5,
}

export const ENEMY_MAX_HP: Record<EnemyKind, number> = {
  soldier: 1,
  helicopter: 1,
  'anti-air': 10,
  fighter: 4,
  balloon: 15,
}

export const ENEMY_CAPS: Record<EnemyKind, number> = {
  soldier: 8,
  helicopter: 3,
  'anti-air': 12,
  fighter: 3,
  balloon: 1,
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
  phase: number
  radius: number
  respawn: number
  sourceId: string | null
}

export type EnemyState = {
  slots: EnemySlot[]
  destroyedAntiAir: Set<string>
}

const ORDER: EnemyKind[] = ['soldier', 'helicopter', 'anti-air', 'fighter', 'balloon']

export function createEnemyState(): EnemyState {
  const slots: EnemySlot[] = []
  for (const kind of ORDER) {
    for (let slot = 0; slot < ENEMY_CAPS[kind]; slot += 1) {
      slots.push({
        id: `enemy:${kind}:${slot}:0`,
        kind,
        slot,
        generation: 0,
        active: false,
        hp: ENEMY_MAX_HP[kind],
        maxHp: ENEMY_MAX_HP[kind],
        position: { x: 0, y: 0, z: 0 },
        phase: slot / Math.max(1, ENEMY_CAPS[kind]) * Math.PI * 2,
        radius: 24 + slot * 3.5,
        respawn: 0,
        sourceId: null,
      })
    }
  }
  return { slots, destroyedAntiAir: new Set<string>() }
}

export function isAntiAirBuilding(building: Pick<ProceduralBuilding, 'cellX' | 'cellZ'>) {
  return seedForWorldCell(building.cellX, building.cellZ, 0xa17a1) % 13 === 0
}

function spawnPursuer(enemy: EnemySlot, player: Vec3, heading: number) {
  enemy.generation += 1
  enemy.id = `enemy:${enemy.kind}:${enemy.slot}:${enemy.generation}`
  enemy.hp = enemy.maxHp
  enemy.active = true
  enemy.sourceId = null
  enemy.phase = heading + Math.PI + (enemy.slot - (ENEMY_CAPS[enemy.kind] - 1) / 2) * 0.28
  enemy.radius = enemy.kind === 'balloon' ? 42 : enemy.kind === 'fighter' ? 36 : 28 + enemy.slot * 3
  enemy.position.x = player.x + Math.sin(enemy.phase) * enemy.radius
  enemy.position.z = player.z + Math.cos(enemy.phase) * enemy.radius
  enemy.position.y = enemy.kind === 'soldier'
    ? 0.9
    : Math.min(124, player.y + (enemy.kind === 'balloon' ? 13 : enemy.kind === 'fighter' ? 8 : 5))
}

export function syncEnemyTiers(state: EnemyState, wanted: number, player: Vec3, heading: number, dt: number) {
  for (const enemy of state.slots) {
    if (enemy.kind === 'anti-air') continue
    if (ENEMY_TIER[enemy.kind] > wanted) {
      enemy.active = false
      continue
    }
    if (enemy.active) continue
    enemy.respawn = Math.max(0, enemy.respawn - dt)
    if (enemy.respawn <= 0) spawnPursuer(enemy, player, heading)
  }
}

export function syncAntiAirEnemies(state: EnemyState, wanted: number, buildings: ProceduralBuilding[]) {
  for (const enemy of state.slots) {
    if (enemy.kind !== 'anti-air' || !enemy.active || !enemy.sourceId) continue
    let found = false
    for (const building of buildings) {
      if (building.id === enemy.sourceId) { found = true; break }
    }
    if (!found || wanted < 3) enemy.active = false
  }
  if (wanted < 3) return
  for (const building of buildings) {
    if (!isAntiAirBuilding(building) || state.destroyedAntiAir.has(building.id)) continue
    let exists = false
    for (const enemy of state.slots) {
      if (enemy.kind === 'anti-air' && enemy.active && enemy.sourceId === building.id) { exists = true; break }
    }
    if (exists) continue
    const slot = state.slots.find((enemy) => enemy.kind === 'anti-air' && !enemy.active)
    if (!slot) break
    slot.generation += 1
    slot.id = `enemy:anti-air:${slot.slot}:${slot.generation}`
    slot.active = true
    slot.hp = slot.maxHp
    slot.sourceId = building.id
    slot.position.x = building.position.x
    slot.position.y = building.size.y + 2.3
    slot.position.z = building.position.z
  }
}

export function stepEnemies(state: EnemyState, player: Vec3, dt: number) {
  const d = Math.min(Math.max(0, dt), 0.05)
  for (const enemy of state.slots) {
    if (!enemy.active || enemy.kind === 'anti-air') continue
    const rate = enemy.kind === 'fighter' ? 0.78 : enemy.kind === 'helicopter' ? 0.4 : enemy.kind === 'balloon' ? 0.14 : 0.2
    enemy.phase += d * rate
    const desiredX = player.x + Math.sin(enemy.phase) * enemy.radius
    const desiredZ = player.z + Math.cos(enemy.phase) * enemy.radius
    const response = enemy.kind === 'fighter' ? 2.4 : enemy.kind === 'soldier' ? 1.1 : 1.5
    const blend = 1 - Math.exp(-response * d)
    enemy.position.x += (desiredX - enemy.position.x) * blend
    enemy.position.z += (desiredZ - enemy.position.z) * blend
    const desiredY = enemy.kind === 'soldier' ? 0.9 : Math.min(124, player.y + (enemy.kind === 'balloon' ? 13 : enemy.kind === 'fighter' ? 8 : 5))
    enemy.position.y += (desiredY - enemy.position.y) * blend
  }
}

export function hitEnemy(state: EnemyState, id: string, damage = 1) {
  for (const enemy of state.slots) {
    if (!enemy.active || enemy.id !== id) continue
    enemy.hp = Math.max(0, enemy.hp - damage)
    if (enemy.hp > 0) return { hit: true, destroyed: false, kind: enemy.kind, enemy }
    enemy.active = false
    if (enemy.kind === 'anti-air' && enemy.sourceId) state.destroyedAntiAir.add(enemy.sourceId)
    else enemy.respawn = enemy.kind === 'balloon' ? 12 : 5
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
    const range = enemy.kind === 'anti-air' ? 92 : enemy.kind === 'soldier' ? 45 : 120
    if (Math.hypot(enemy.position.x - player.x, enemy.position.y - player.y, enemy.position.z - player.z) <= range) count += 1
  }
  return count
}
