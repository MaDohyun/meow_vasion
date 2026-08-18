import type { Aabb, Vec3 } from './drone'

export const LASER_MAX_PROJECTILES = 18
export const LASER_PROJECTILE_SPEED = 92
export const LASER_PROJECTILE_LIFETIME = 3.5
export const LASER_VISUAL_LENGTH = 32
export const LASER_FALLBACK_DISTANCE = 300
export const LASER_MAX_BURSTS = 12

export type LaserTargetKind = 'fighter' | 'car' | 'building' | 'ground'

export type LaserSphereTarget = {
  id: string
  kind: Extract<LaserTargetKind, 'fighter' | 'car'>
  center: Vec3
  radius: number
}

export type LaserRay = {
  origin: Vec3
  direction: Vec3
}

export type LaserAim = {
  point: Vec3
  distance: number
  targetId: string | null
  targetKind: LaserTargetKind | null
}

export type LaserProjectile = {
  id: string
  active: boolean
  position: Vec3
  direction: Vec3
  velocity: Vec3
  life: number
  phase: number
}

export type LaserImpact = {
  position: Vec3
  targetId: string | null
  targetKind: LaserTargetKind
}

export type LaserBurst = {
  id: string
  active: boolean
  kind: 'muzzle' | 'impact'
  position: Vec3
  life: number
  duration: number
}

export type LaserCollisionWorld = {
  colliders: Aabb[]
  spheres?: LaserSphereTarget[]
}

function normalized(vector: Vec3): Vec3 {
  const length = Math.max(0.000001, Math.hypot(vector.x, vector.y, vector.z))
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length }
}

function pointAlong(origin: Vec3, direction: Vec3, distance: number): Vec3 {
  return {
    x: origin.x + direction.x * distance,
    y: origin.y + direction.y * distance,
    z: origin.z + direction.z * distance,
  }
}

export function rayAabbDistance(ray: LaserRay, box: Aabb, maxDistance = Number.POSITIVE_INFINITY) {
  const direction = normalized(ray.direction)
  let near = 0
  let far = maxDistance
  const axes: Array<['x' | 'y' | 'z', number, number]> = [
    ['x', box.minX, box.maxX],
    ['y', box.minY, box.maxY],
    ['z', box.minZ, box.maxZ],
  ]
  for (const [axis, minimum, maximum] of axes) {
    const value = direction[axis]
    const origin = ray.origin[axis]
    if (Math.abs(value) < 0.000001) {
      if (origin < minimum || origin > maximum) return null
      continue
    }
    const inverse = 1 / value
    let first = (minimum - origin) * inverse
    let second = (maximum - origin) * inverse
    if (first > second) [first, second] = [second, first]
    near = Math.max(near, first)
    far = Math.min(far, second)
    if (near > far) return null
  }
  return near >= 0 && near <= maxDistance ? near : null
}

export function raySphereDistance(ray: LaserRay, sphere: LaserSphereTarget, maxDistance = Number.POSITIVE_INFINITY) {
  const direction = normalized(ray.direction)
  const offsetX = ray.origin.x - sphere.center.x
  const offsetY = ray.origin.y - sphere.center.y
  const offsetZ = ray.origin.z - sphere.center.z
  const projection = offsetX * direction.x + offsetY * direction.y + offsetZ * direction.z
  const constant = offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ - sphere.radius * sphere.radius
  const discriminant = projection * projection - constant
  if (discriminant < 0) return null
  const root = Math.sqrt(discriminant)
  const near = -projection - root
  const far = -projection + root
  const distance = near >= 0 ? near : far >= 0 ? far : null
  return distance !== null && distance <= maxDistance ? distance : null
}

function rayGroundDistance(ray: LaserRay, maxDistance = Number.POSITIVE_INFINITY) {
  const direction = normalized(ray.direction)
  if (direction.y >= -0.000001) return null
  const distance = -ray.origin.y / direction.y
  return distance >= 0 && distance <= maxDistance ? distance : null
}

export function resolveLaserAim(
  ray: LaserRay,
  colliders: Aabb[],
  spheres: LaserSphereTarget[] = [],
  fallbackDistance = LASER_FALLBACK_DISTANCE,
): LaserAim {
  const direction = normalized(ray.direction)
  let distance = fallbackDistance
  let targetId: string | null = null
  let targetKind: LaserTargetKind | null = null
  const groundDistance = rayGroundDistance({ origin: ray.origin, direction }, distance)
  if (groundDistance !== null) {
    distance = groundDistance
    targetKind = 'ground'
  }
  for (const box of colliders) {
    const hit = rayAabbDistance({ origin: ray.origin, direction }, box, distance)
    if (hit !== null && hit < distance) {
      distance = hit
      targetId = null
      targetKind = 'building'
    }
  }
  for (const sphere of spheres) {
    const hit = raySphereDistance({ origin: ray.origin, direction }, sphere, distance)
    if (hit !== null && hit < distance) {
      distance = hit
      targetId = sphere.id
      targetKind = sphere.kind
    }
  }
  return { point: pointAlong(ray.origin, direction, distance), distance, targetId, targetKind }
}

export function createLaserPool(): LaserProjectile[] {
  return Array.from({ length: LASER_MAX_PROJECTILES }, (_, slot) => ({
    id: `laser:${slot}`,
    active: false,
    position: { x: 0, y: 0, z: 0 },
    direction: { x: 0, y: 0, z: 1 },
    velocity: { x: 0, y: 0, z: 0 },
    life: 0,
    phase: slot / LASER_MAX_PROJECTILES,
  }))
}

export function createLaserBurstPool(): LaserBurst[] {
  return Array.from({ length: LASER_MAX_BURSTS }, (_, slot) => ({
    id: `laser-burst:${slot}`,
    active: false,
    kind: 'impact',
    position: { x: 0, y: 0, z: 0 },
    life: 0,
    duration: 0.22,
  }))
}

export function triggerLaserBurst(pool: LaserBurst[], kind: LaserBurst['kind'], position: Vec3) {
  const burst = pool.find((item) => !item.active)
    ?? pool.reduce((oldest, item) => item.life < oldest.life ? item : oldest)
  burst.active = true
  burst.kind = kind
  burst.position = { ...position }
  burst.duration = kind === 'muzzle' ? 0.12 : 0.28
  burst.life = burst.duration
  return burst
}

export function stepLaserBursts(pool: LaserBurst[], dt: number) {
  const d = Math.min(Math.max(0, dt), 0.05)
  for (const burst of pool) {
    if (!burst.active) continue
    burst.life = Math.max(0, burst.life - d)
    if (burst.life <= 0) burst.active = false
  }
  return pool
}

export function laserDirection(heading: number, pitch: number): Vec3 {
  const horizontal = Math.cos(pitch)
  return {
    x: Math.sin(heading) * horizontal,
    y: Math.sin(pitch),
    z: Math.cos(heading) * horizontal,
  }
}

export function directionToLaserAim(origin: Vec3, aim: LaserAim): Vec3 {
  return normalized({
    x: aim.point.x - origin.x,
    y: aim.point.y - origin.y,
    z: aim.point.z - origin.z,
  })
}

export function laserRisingEdge(pressed: boolean, wasPressed: boolean) {
  return pressed && !wasPressed
}

export function fireLaserProjectile(
  pool: LaserProjectile[],
  origin: Vec3,
  direction: Vec3,
  inheritedVelocity: Vec3,
) {
  const projectile = pool.find((item) => !item.active)
    ?? pool.reduce((oldest, item) => item.life < oldest.life ? item : oldest)
  const aim = normalized(direction)
  projectile.active = true
  projectile.position.x = origin.x + aim.x * 2.3
  projectile.position.y = origin.y + aim.y * 2.3
  projectile.position.z = origin.z + aim.z * 2.3
  projectile.direction.x = aim.x
  projectile.direction.y = aim.y
  projectile.direction.z = aim.z
  projectile.velocity.x = aim.x * LASER_PROJECTILE_SPEED + inheritedVelocity.x * 0.18
  projectile.velocity.y = aim.y * LASER_PROJECTILE_SPEED + inheritedVelocity.y * 0.18
  projectile.velocity.z = aim.z * LASER_PROJECTILE_SPEED + inheritedVelocity.z * 0.18
  projectile.life = LASER_PROJECTILE_LIFETIME
  return projectile
}

function nearestSegmentImpact(
  start: Vec3,
  end: Vec3,
  world: LaserCollisionWorld,
): LaserImpact | null {
  const delta = { x: end.x - start.x, y: end.y - start.y, z: end.z - start.z }
  const length = Math.hypot(delta.x, delta.y, delta.z)
  if (length < 0.000001) return null
  const ray = { origin: start, direction: delta }
  let nearest = length + 0.000001
  let result: LaserImpact | null = null
  if (end.y <= 0.1 && delta.y < 0) {
    const distance = (0.1 - start.y) / (delta.y / length)
    if (distance >= 0 && distance <= length) {
      nearest = distance
      result = { position: pointAlong(start, normalized(delta), distance), targetId: null, targetKind: 'ground' }
    }
  }
  for (const box of world.colliders) {
    const distance = rayAabbDistance(ray, box, nearest)
    if (distance !== null && distance < nearest) {
      nearest = distance
      result = { position: pointAlong(start, normalized(delta), distance), targetId: null, targetKind: 'building' }
    }
  }
  for (const sphere of world.spheres ?? []) {
    const distance = raySphereDistance(ray, sphere, nearest)
    if (distance !== null && distance < nearest) {
      nearest = distance
      result = { position: pointAlong(start, normalized(delta), distance), targetId: sphere.id, targetKind: sphere.kind }
    }
  }
  return result
}

export function stepLaserProjectiles(pool: LaserProjectile[], world: LaserCollisionWorld, dt: number) {
  const d = Math.min(Math.max(0, dt), 0.05)
  const impacts: LaserImpact[] = []
  for (const projectile of pool) {
    if (!projectile.active) continue
    projectile.life -= d
    const previous = { ...projectile.position }
    const next = {
      x: projectile.position.x + projectile.velocity.x * d,
      y: projectile.position.y + projectile.velocity.y * d,
      z: projectile.position.z + projectile.velocity.z * d,
    }
    const impact = nearestSegmentImpact(previous, next, world)
    if (impact) {
      projectile.position = { ...impact.position }
      projectile.active = false
      projectile.life = 0
      impacts.push(impact)
    } else {
      projectile.position = next
      if (projectile.life <= 0) {
        projectile.active = false
        projectile.life = 0
      }
    }
  }
  return impacts
}
