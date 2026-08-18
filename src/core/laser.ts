import type { Aabb, Vec3 } from './drone'

export const LASER_MAX_PROJECTILES = 18
export const LASER_PROJECTILE_SPEED = 68
export const LASER_PROJECTILE_LIFETIME = 1.15

export type LaserProjectile = {
  id: string
  active: boolean
  position: Vec3
  velocity: Vec3
  life: number
}

export function createLaserPool(): LaserProjectile[] {
  return Array.from({ length: LASER_MAX_PROJECTILES }, (_, slot) => ({
    id: `laser:${slot}`,
    active: false,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    life: 0,
  }))
}

export function laserDirection(heading: number, pitch: number): Vec3 {
  const horizontal = Math.cos(pitch)
  return {
    x: Math.sin(heading) * horizontal,
    y: Math.sin(pitch),
    z: Math.cos(heading) * horizontal,
  }
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
  const length = Math.max(0.001, Math.hypot(direction.x, direction.y, direction.z))
  const x = direction.x / length
  const y = direction.y / length
  const z = direction.z / length
  projectile.active = true
  projectile.position.x = origin.x + x * 2.3
  projectile.position.y = origin.y + y * 2.3
  projectile.position.z = origin.z + z * 2.3
  projectile.velocity.x = x * LASER_PROJECTILE_SPEED + inheritedVelocity.x * 0.35
  projectile.velocity.y = y * LASER_PROJECTILE_SPEED + inheritedVelocity.y * 0.35
  projectile.velocity.z = z * LASER_PROJECTILE_SPEED + inheritedVelocity.z * 0.35
  projectile.life = LASER_PROJECTILE_LIFETIME
  return projectile
}

function hitsCollider(position: Vec3, colliders: Aabb[]) {
  for (const box of colliders) {
    if (
      position.x >= box.minX && position.x <= box.maxX &&
      position.y >= box.minY && position.y <= box.maxY &&
      position.z >= box.minZ && position.z <= box.maxZ
    ) return true
  }
  return false
}

export function stepLaserProjectiles(pool: LaserProjectile[], colliders: Aabb[], dt: number) {
  const d = Math.min(Math.max(0, dt), 0.05)
  let impacts = 0
  for (const projectile of pool) {
    if (!projectile.active) continue
    projectile.life -= d
    projectile.position.x += projectile.velocity.x * d
    projectile.position.y += projectile.velocity.y * d
    projectile.position.z += projectile.velocity.z * d
    if (projectile.life <= 0 || projectile.position.y <= 0.1 || hitsCollider(projectile.position, colliders)) {
      if (projectile.life > 0) impacts += 1
      projectile.active = false
      projectile.life = 0
    }
  }
  return impacts
}
