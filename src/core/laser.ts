import type { Aabb, Vec3 } from './drone'

export const LASER_MAX_PROJECTILES = 18
export const LASER_PROJECTILE_LIFETIME = 0.14
export const LASER_FALLBACK_DISTANCE = 300
export const LASER_MAX_BURSTS = 12

export type LaserTargetKind = 'fighter' | 'car' | 'landmark' | 'building' | 'ground'

export type LaserSphereTarget = {
  id: string
  kind: Extract<LaserTargetKind, 'fighter' | 'car' | 'landmark'>
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
  distance: number
  life: number
  phase: number
}

export type LaserBurst = {
  id: string
  active: boolean
  kind: 'muzzle' | 'impact'
  position: Vec3
  life: number
  duration: number
  color: string
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
      targetId = box.id ?? null
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
    distance: 0,
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
    color: '#ff79bd',
  }))
}

export function triggerLaserBurst(pool: LaserBurst[], kind: LaserBurst['kind'], position: Vec3, color = kind === 'muzzle' ? '#fff3a3' : '#ff79bd') {
  const burst = pool.find((item) => !item.active)
    ?? pool.reduce((oldest, item) => item.life < oldest.life ? item : oldest)
  burst.active = true
  burst.kind = kind
  burst.position.x = position.x
  burst.position.y = position.y
  burst.position.z = position.z
  burst.duration = kind === 'muzzle' ? 0.12 : 0.28
  burst.life = burst.duration
  burst.color = color
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

export function fireLaserBeam(
  pool: LaserProjectile[],
  origin: Vec3,
  hitPoint: Vec3,
) {
  const projectile = pool.find((item) => !item.active)
    ?? pool.reduce((oldest, item) => item.life < oldest.life ? item : oldest)
  const offset = {
    x: hitPoint.x - origin.x,
    y: hitPoint.y - origin.y,
    z: hitPoint.z - origin.z,
  }
  const totalDistance = Math.hypot(offset.x, offset.y, offset.z)
  const aim = normalized(offset)
  const muzzleOffset = Math.min(2.3, totalDistance * 0.2)
  projectile.active = true
  projectile.position.x = origin.x + aim.x * muzzleOffset
  projectile.position.y = origin.y + aim.y * muzzleOffset
  projectile.position.z = origin.z + aim.z * muzzleOffset
  projectile.direction.x = aim.x
  projectile.direction.y = aim.y
  projectile.direction.z = aim.z
  projectile.velocity.x = 0
  projectile.velocity.y = 0
  projectile.velocity.z = 0
  projectile.distance = Math.max(0.1, totalDistance - muzzleOffset)
  projectile.life = LASER_PROJECTILE_LIFETIME
  return projectile
}
export function stepLaserProjectiles(pool: LaserProjectile[], dt: number) {
  const d = Math.min(Math.max(0, dt), 0.05)
  for (const projectile of pool) {
    if (!projectile.active) continue
    projectile.life = Math.max(0, projectile.life - d)
    if (projectile.life <= 0) {
      projectile.active = false
      projectile.life = 0
    }
  }
  return pool
}
