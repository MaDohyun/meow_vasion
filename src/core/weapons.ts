import type { Vec3 } from './drone'

/** Weapons that can be equipped at the beginning of a survival run. */
export type WeaponId = 'homing-missile' | 'scatter-burst' | 'orbit-satellite' | 'drop-bomb'
export type WeaponProjectileKind = 'missile' | 'scatter' | 'satellite' | 'bomb'

export type WeaponDefinition = {
  id: WeaponId
  label: string
  shortLabel: string
  description: string
  cooldown: number
  damage: number
  range: number
  projectileSpeed: number
  lifetime: number
  projectileKind: WeaponProjectileKind
  projectileCount: number
  spread: number
  orbitRadius: number
  orbitSpeed: number
  blastRadius: number
}

/**
 * Weapon balance lives in data so adding a new automatic weapon does not
 * require changing the simulation loop or the renderer.
 */
export const WEAPON_DEFINITIONS: Record<WeaponId, WeaponDefinition> = {
  'homing-missile': {
    id: 'homing-missile',
    label: '유도 미사일',
    shortLabel: 'MISSILE',
    description: '가장 가까운 적을 끝까지 추적합니다. 느리지만 안정적입니다.',
    cooldown: 1.35,
    damage: 2.5,
    range: 190,
    projectileSpeed: 34,
    lifetime: 5.6,
    projectileKind: 'missile',
    projectileCount: 1,
    spread: 0,
    orbitRadius: 0,
    orbitSpeed: 0,
    blastRadius: 0,
  },
  'scatter-burst': {
    id: 'scatter-burst',
    label: '확산탄',
    shortLabel: 'SCATTER',
    description: 'UFO 주변으로 탄막을 퍼뜨립니다. 포위될수록 강해집니다.',
    cooldown: 1.1,
    damage: 0.8,
    range: 82,
    projectileSpeed: 29,
    lifetime: 1.8,
    projectileKind: 'scatter',
    projectileCount: 8,
    spread: Math.PI * 2,
    orbitRadius: 0,
    orbitSpeed: 0,
    blastRadius: 0,
  },
  'orbit-satellite': {
    id: 'orbit-satellite',
    label: '궤도 위성',
    shortLabel: 'ORBIT',
    description: 'UFO 주변을 도는 위성이 가까이 붙은 적을 자동으로 때립니다.',
    cooldown: 0.4,
    damage: 1.4,
    range: 7.5,
    projectileSpeed: 0,
    lifetime: 9999,
    projectileKind: 'satellite',
    projectileCount: 3,
    spread: 0,
    orbitRadius: 4.2,
    orbitSpeed: 2.1,
    blastRadius: 0,
  },
  'drop-bomb': {
    id: 'drop-bomb',
    label: '낙하 폭탄',
    shortLabel: 'BOMB',
    description: 'UFO 아래로 떨어져 지면을 폭발시킵니다. 저공 비행에 특화됩니다.',
    cooldown: 2.25,
    damage: 5,
    range: 130,
    projectileSpeed: 22,
    lifetime: 3.8,
    projectileKind: 'bomb',
    projectileCount: 1,
    spread: 0,
    orbitRadius: 0,
    orbitSpeed: 0,
    blastRadius: 9,
  },
}

export const WEAPON_IDS: WeaponId[] = [
  'homing-missile',
  'scatter-burst',
  'orbit-satellite',
  'drop-bomb',
]

export const WEAPON_POOL_CAPS: Record<WeaponProjectileKind, number> = {
  missile: 12,
  scatter: 40,
  satellite: 4,
  bomb: 8,
}

export type WeaponTarget = {
  id: string
  center: Vec3
  radius: number
}

export type WeaponProjectile = {
  id: string
  slot: number
  active: boolean
  weapon: WeaponId
  kind: WeaponProjectileKind
  position: Vec3
  direction: Vec3
  velocity: Vec3
  targetId: string | null
  life: number
  damage: number
  radius: number
  angle: number
  hitCooldown: number
}

export type WeaponState = {
  equipped: WeaponId[]
  projectiles: WeaponProjectile[]
  cooldowns: Record<WeaponId, number>
  shotsFired: number
}

export type WeaponView = {
  position: Vec3
  heading: number
  pitch: number
  targets: readonly WeaponTarget[]
}

export type WeaponHitHandler = (targetId: string, damage: number, weapon: WeaponId) => void

const PROJECTILE_KINDS: WeaponProjectileKind[] = ['missile', 'scatter', 'satellite', 'bomb']

function makeProjectile(kind: WeaponProjectileKind, slot: number): WeaponProjectile {
  return {
    id: `weapon:${kind}:${slot}`,
    slot,
    active: false,
    weapon: 'homing-missile',
    kind,
    position: { x: 0, y: 0, z: 0 },
    direction: { x: 0, y: 0, z: 1 },
    velocity: { x: 0, y: 0, z: 0 },
    targetId: null,
    life: 0,
    damage: 0,
    radius: 0.6,
    angle: 0,
    hitCooldown: 0,
  }
}

function emptyCooldowns(): Record<WeaponId, number> {
  return {
    'homing-missile': 0,
    'scatter-burst': 0,
    'orbit-satellite': 0,
    'drop-bomb': 0,
  }
}

export function createWeaponState(initialWeapon: WeaponId = 'homing-missile'): WeaponState {
  const projectiles: WeaponProjectile[] = []
  for (const kind of PROJECTILE_KINDS) {
    for (let slot = 0; slot < WEAPON_POOL_CAPS[kind]; slot += 1) projectiles.push(makeProjectile(kind, slot))
  }
  return {
    equipped: [initialWeapon],
    projectiles,
    cooldowns: emptyCooldowns(),
    shotsFired: 0,
  }
}

export function equipWeapon(state: WeaponState, weapon: WeaponId) {
  for (const equipped of state.equipped) if (equipped === weapon) return state
  state.equipped.push(weapon)
  return state
}

export function selectWeapon(state: WeaponState, weapon: WeaponId) {
  state.equipped.length = 0
  state.equipped.push(weapon)
  for (const id of WEAPON_IDS) state.cooldowns[id] = 0
  for (const projectile of state.projectiles) projectile.active = false
  return state
}

function targetById(targets: readonly WeaponTarget[], id: string | null) {
  if (!id) return null
  for (const target of targets) if (target.id === id) return target
  return null
}

export function nearestWeaponTarget(targets: readonly WeaponTarget[], origin: Vec3, range = Number.POSITIVE_INFINITY) {
  const rangeSquared = range * range
  let nearest: WeaponTarget | null = null
  let nearestDistance = rangeSquared
  for (const target of targets) {
    const dx = target.center.x - origin.x
    const dy = target.center.y - origin.y
    const dz = target.center.z - origin.z
    const distance = dx * dx + dy * dy + dz * dz
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = target
    }
  }
  return nearest
}

function freeProjectile(state: WeaponState, kind: WeaponProjectileKind) {
  let oldest: WeaponProjectile | null = null
  for (const projectile of state.projectiles) {
    if (projectile.kind !== kind) continue
    if (!projectile.active) return projectile
    if (!oldest || projectile.life < oldest.life) oldest = projectile
  }
  return oldest
}

function resetProjectile(projectile: WeaponProjectile, definition: WeaponDefinition, view: WeaponView) {
  projectile.active = true
  projectile.weapon = definition.id
  projectile.targetId = null
  projectile.position.x = view.position.x
  projectile.position.y = view.position.y
  projectile.position.z = view.position.z
  projectile.velocity.x = 0
  projectile.velocity.y = 0
  projectile.velocity.z = 0
  projectile.direction.x = 0
  projectile.direction.y = 0
  projectile.direction.z = 1
  projectile.life = definition.lifetime
  projectile.damage = definition.damage
  projectile.angle = 0
  projectile.hitCooldown = 0
}

function setDirection(projectile: WeaponProjectile, x: number, y: number, z: number, speed: number) {
  const length = Math.max(0.000001, Math.hypot(x, y, z))
  const directionX = x / length
  const directionY = y / length
  const directionZ = z / length
  projectile.direction.x = directionX
  projectile.direction.y = directionY
  projectile.direction.z = directionZ
  projectile.velocity.x = directionX * speed
  projectile.velocity.y = directionY * speed
  projectile.velocity.z = directionZ * speed
}

function fireMissile(state: WeaponState, definition: WeaponDefinition, view: WeaponView) {
  const target = nearestWeaponTarget(view.targets, view.position, definition.range)
  if (!target) return false
  const projectile = freeProjectile(state, definition.projectileKind)
  if (!projectile) return false
  resetProjectile(projectile, definition, view)
  projectile.targetId = target.id
  projectile.radius = 0.8
  setDirection(projectile, target.center.x - view.position.x, target.center.y - view.position.y, target.center.z - view.position.z, definition.projectileSpeed)
  return true
}

function fireScatter(state: WeaponState, definition: WeaponDefinition, view: WeaponView) {
  let fired = 0
  const horizontal = Math.cos(view.pitch * 0.35)
  for (let index = 0; index < definition.projectileCount; index += 1) {
    const projectile = freeProjectile(state, definition.projectileKind)
    if (!projectile) break
    resetProjectile(projectile, definition, view)
    const angle = view.heading + (index / definition.projectileCount) * definition.spread
    const lift = Math.sin((index % 3 - 1) * 0.14)
    projectile.radius = 0.42
    setDirection(projectile, Math.sin(angle) * horizontal, lift, Math.cos(angle) * horizontal, definition.projectileSpeed)
    fired += 1
  }
  return fired > 0
}

function fireSatellites(state: WeaponState, definition: WeaponDefinition, view: WeaponView) {
  let fired = 0
  for (let index = 0; index < definition.projectileCount; index += 1) {
    let occupied = false
    for (const projectile of state.projectiles) {
      if (projectile.active && projectile.kind === definition.projectileKind && projectile.slot === index) { occupied = true; break }
    }
    if (occupied) continue
    const projectile = state.projectiles.find((item) => item.kind === definition.projectileKind && !item.active)
    if (!projectile) break
    resetProjectile(projectile, definition, view)
    projectile.angle = index / definition.projectileCount * Math.PI * 2
    projectile.radius = 1.15
    projectile.life = definition.lifetime
    fired += 1
  }
  return fired > 0
}

function fireBomb(state: WeaponState, definition: WeaponDefinition, view: WeaponView) {
  const target = nearestWeaponTarget(view.targets, view.position, definition.range)
  if (!target) return false
  const projectile = freeProjectile(state, definition.projectileKind)
  if (!projectile) return false
  resetProjectile(projectile, definition, view)
  projectile.targetId = target.id
  projectile.radius = definition.blastRadius
  projectile.velocity.y = -definition.projectileSpeed
  return true
}

function fireWeapon(state: WeaponState, definition: WeaponDefinition, view: WeaponView) {
  if (definition.projectileKind === 'missile') return fireMissile(state, definition, view)
  if (definition.projectileKind === 'scatter') return fireScatter(state, definition, view)
  if (definition.projectileKind === 'satellite') return fireSatellites(state, definition, view)
  return fireBomb(state, definition, view)
}

function hitDistance(projectile: WeaponProjectile, target: WeaponTarget) {
  return Math.hypot(
    projectile.position.x - target.center.x,
    projectile.position.y - target.center.y,
    projectile.position.z - target.center.z,
  )
}

function stepSatellite(projectile: WeaponProjectile, definition: WeaponDefinition, view: WeaponView, d: number, onHit?: WeaponHitHandler) {
  projectile.angle += definition.orbitSpeed * d
  projectile.position.x = view.position.x + Math.sin(projectile.angle) * definition.orbitRadius
  projectile.position.y = view.position.y + 1.1 + Math.sin(projectile.angle * 1.7) * 0.4
  projectile.position.z = view.position.z + Math.cos(projectile.angle) * definition.orbitRadius
  projectile.hitCooldown = Math.max(0, projectile.hitCooldown - d)
  if (projectile.hitCooldown > 0 || !onHit) return
  for (const target of view.targets) {
    if (hitDistance(projectile, target) > projectile.radius + target.radius) continue
    onHit(target.id, projectile.damage, projectile.weapon)
    projectile.hitCooldown = 0.3
    break
  }
}

function stepMovingProjectile(projectile: WeaponProjectile, definition: WeaponDefinition, view: WeaponView, d: number, onHit?: WeaponHitHandler) {
  if (projectile.kind === 'missile') {
    const target = targetById(view.targets, projectile.targetId)
    if (target) setDirection(projectile, target.center.x - projectile.position.x, target.center.y - projectile.position.y, target.center.z - projectile.position.z, definition.projectileSpeed)
  }
  projectile.position.x += projectile.velocity.x * d
  projectile.position.y += projectile.velocity.y * d
  projectile.position.z += projectile.velocity.z * d
  projectile.life = Math.max(0, projectile.life - d)

  if (projectile.kind === 'bomb' && (projectile.position.y <= 0.6 || projectile.life <= 0)) {
    if (onHit) {
      for (const target of view.targets) {
        if (Math.hypot(projectile.position.x - target.center.x, projectile.position.z - target.center.z) <= projectile.radius + target.radius) onHit(target.id, projectile.damage, projectile.weapon)
      }
    }
    projectile.active = false
    return
  }

  if (onHit) {
    for (const target of view.targets) {
      if (projectile.kind === 'missile' && target.id !== projectile.targetId) continue
      if (hitDistance(projectile, target) > projectile.radius + target.radius) continue
      onHit(target.id, projectile.damage, projectile.weapon)
      projectile.active = false
      return
    }
  }
  if (projectile.life <= 0) projectile.active = false
}

export function stepWeapons(state: WeaponState, view: WeaponView, dt: number, onHit?: WeaponHitHandler) {
  const d = Math.min(Math.max(0, dt), 0.05)
  for (const projectile of state.projectiles) {
    if (!projectile.active) continue
    const definition = WEAPON_DEFINITIONS[projectile.weapon]
    if (projectile.kind === 'satellite') stepSatellite(projectile, definition, view, d, onHit)
    else stepMovingProjectile(projectile, definition, view, d, onHit)
  }

  for (const weapon of state.equipped) {
    const definition = WEAPON_DEFINITIONS[weapon]
    state.cooldowns[weapon] = Math.max(0, state.cooldowns[weapon] - d)
    if (state.cooldowns[weapon] > 0) continue
    if (fireWeapon(state, definition, view)) {
      state.cooldowns[weapon] = definition.cooldown
      state.shotsFired += 1
    } else {
      // Keep looking for a target without creating a burst of retries when the
      // pool is full or the wave has not spawned an enemy yet.
      state.cooldowns[weapon] = 0.12
    }
  }
  return state
}

export function activeWeaponProjectileCount(state: WeaponState, kind?: WeaponProjectileKind) {
  let count = 0
  for (const projectile of state.projectiles) if (projectile.active && (!kind || projectile.kind === kind)) count += 1
  return count
}
