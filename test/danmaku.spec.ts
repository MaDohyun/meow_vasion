import { describe, expect, it } from 'vitest'
import { DRONE_DEFAULTS, type Aabb } from '../src/core/drone'
import {
  ANTI_AIR_ORB_INTERVAL,
  ANTI_AIR_ORB_RANGE,
  ANTI_AIR_ORB_SPEED,
  FIGHTER_ORB_INTERVAL,
  FIGHTER_ORB_RANGE,
  FIGHTER_PASS_SPEED,
  ORB_HIT_RADIUS,
  ORB_SPEED,
  createEnemyState,
  stepEnemies,
  stepEnemyProjectiles,
} from '../src/core/enemies'

/** A fighter placed by hand on a known bearing, timer cocked. */
function attackRun(position: { x: number; y: number; z: number }, bearing: number) {
  const state = createEnemyState(0xf16)
  const fighter = state.slots.find((slot) => slot.kind === 'fighter')!
  fighter.active = true
  fighter.position = { ...position }
  fighter.velocity = { x: Math.sin(bearing) * FIGHTER_PASS_SPEED, y: 0, z: Math.cos(bearing) * FIGHTER_PASS_SPEED }
  fighter.rotation.y = bearing
  fighter.attackTimer = 0
  return { state, fighter }
}

/** One emplaced gun, timer cocked, with nothing else on the field. */
function emplacement(position: { x: number; y: number; z: number }) {
  const state = createEnemyState(0xaa7)
  const gun = state.slots.find((slot) => slot.kind === 'anti-air')!
  gun.active = true
  gun.mode = 'fixed'
  gun.position = { ...position }
  gun.hitRadius = 2.2
  gun.attackTimer = 0
  return { state, gun }
}

const activeOrbs = (state: ReturnType<typeof createEnemyState>) =>
  state.projectiles.filter((projectile) => projectile.active && projectile.kind === 'orb')

describe('fighter curtain fire', () => {
  it('crosses the sky in one fast straight line', () => {
    // The pass is the manoeuvre: no strafe legs, no turning toward anyone.
    // Faster than cruise so it reads as an attack run, and the player meets
    // it rather than chasing its tail.
    expect(FIGHTER_PASS_SPEED).toBeGreaterThan(DRONE_DEFAULTS.maxSpeed)
    const { state, fighter } = attackRun({ x: 0, y: 20, z: -100 }, 0)
    const player = { x: 120, y: 20, z: 0 }
    for (let tick = 0; tick < 60 * 3; tick += 1) stepEnemies(state, player, 1 / 60)
    expect(fighter.position.x).toBeCloseTo(0, 3)
    expect(fighter.position.z).toBeCloseTo(-100 + FIGHTER_PASS_SPEED * 3, 0)
  })

  it('sends one orb per cooldown at anything inside its range', () => {
    // One round, not a fan: the cooldown is the whole cadence.
    const { state } = attackRun({ x: 0, y: 20, z: 0 }, 0)
    stepEnemies(state, { x: 0, y: 20, z: 50 }, 1 / 60)
    expect(activeOrbs(state)).toHaveLength(1)
  })

  it('shoots from any bearing, not only down its own nose', () => {
    // The view cone is gone. It gated the old fan on something the player
    // could not see, so a fighter was either silent or spat a wall; range is
    // the only question now, and it is one the player can answer by leaving.
    const beside = attackRun({ x: 0, y: 20, z: 0 }, 0)
    stepEnemies(beside.state, { x: 35, y: 20, z: 35 }, 1 / 60)
    expect(activeOrbs(beside.state)).toHaveLength(1)

    const behind = attackRun({ x: 0, y: 20, z: 0 }, 0)
    stepEnemies(behind.state, { x: 0, y: 20, z: -50 }, 1 / 60)
    expect(activeOrbs(behind.state)).toHaveLength(1)
  })

  it('holds its fire past its own range', () => {
    const { state } = attackRun({ x: 0, y: 20, z: 0 }, 0)
    stepEnemies(state, { x: 0, y: 20, z: FIGHTER_ORB_RANGE + 20 }, 1 / 60)
    expect(activeOrbs(state)).toHaveLength(0)
  })

  it('holds its cadence while the player stays in range', () => {
    const { state, fighter } = attackRun({ x: 0, y: 20, z: 0 }, 0)
    const player = { x: 0, y: 20, z: 40 }
    const shots: number[] = []
    let previous = 0
    for (let tick = 0; tick < 60 * 9; tick += 1) {
      // Ride along forty metres ahead, so range never lapses and the cadence
      // is the only thing being measured.
      player.z = fighter.position.z + 40
      stepEnemies(state, player, 1 / 60)
      const count = activeOrbs(state).length
      if (count > previous) shots.push(tick / 60)
      previous = count
    }
    expect(shots.length).toBeGreaterThanOrEqual(5)
    for (let index = 1; index < shots.length; index += 1) {
      expect(shots[index]! - shots[index - 1]!).toBeGreaterThan(FIGHTER_ORB_INTERVAL - 0.1)
    }
  })

  it('aims at where the craft is, never at where it will be', () => {
    // No lead anywhere in the curtain: the round goes down the bearing it was
    // pointed, so a craft that keeps moving is never met by its own future.
    const { state, fighter } = attackRun({ x: 0, y: 20, z: 0 }, 0)
    const player = { x: 30, y: 26, z: 40 }
    // A fat lead figure to be wrong by: the craft is crossing at cruise, so a
    // led shot would sit metres off this bearing.
    stepEnemies(state, player, 1 / 60, { x: 0, y: 0, z: 40 })
    const orb = activeOrbs(state)[0]!
    const dx = player.x - fighter.position.x
    const dy = player.y - fighter.position.y
    const dz = player.z - fighter.position.z
    const range = Math.hypot(dx, dy, dz)
    expect(orb.velocity.x).toBeCloseTo(dx / range * ORB_SPEED, 4)
    expect(orb.velocity.y).toBeCloseTo(dy / range * ORB_SPEED, 4)
    expect(orb.velocity.z).toBeCloseTo(dz / range * ORB_SPEED, 4)
  })

  it('drifts slower than the craft cruises, so orbs are dodged, not outrun', () => {
    const { state } = attackRun({ x: 0, y: 20, z: 0 }, 0)
    stepEnemies(state, { x: 0, y: 26, z: 50 }, 1 / 60)
    for (const orb of activeOrbs(state)) {
      expect(Math.hypot(orb.velocity.x, orb.velocity.y, orb.velocity.z)).toBeCloseTo(ORB_SPEED, 3)
    }
    expect(ORB_SPEED).toBeLessThan(DRONE_DEFAULTS.maxSpeed)
    expect(ANTI_AIR_ORB_SPEED).toBeLessThan(DRONE_DEFAULTS.maxSpeed)
  })

  it('dies on a building, so cover is real cover', () => {
    // A curtain round is slow enough that putting a wall between yourself and
    // the gun is a decision the player visibly makes - so the wall honours it.
    const wall: Aabb = { minX: -12, maxX: 12, minY: 0, maxY: 40, minZ: 20, maxZ: 24 }
    const hidden = { x: 0, y: 20, z: 30 }
    const hitsBehindWall = (colliders: Aabb[]) => {
      const { state } = attackRun({ x: 0, y: 20, z: 0 }, 0)
      // Bait one round out from behind the wall, then watch only that round:
      // the fighter itself flies clear of the building within the second, and
      // what is being measured is whether the wall stops what it fired.
      stepEnemies(state, hidden, 1 / 60)
      let hits = 0
      for (let tick = 0; tick < 60 * 4; tick += 1) {
        if (stepEnemyProjectiles(state, hidden, 1 / 60, 1.05, colliders) > 0) hits += 1
      }
      return hits
    }
    // The same parked spot: open air is hit, cover is not.
    expect(hitsBehindWall([])).toBeGreaterThan(0)
    expect(hitsBehindWall([wall])).toBe(0)
  })
})

describe('anti-air curtain fire', () => {
  it('fires one orb per cooldown at a craft inside its range', () => {
    const { state } = emplacement({ x: 0, y: 30, z: 0 })
    const player = { x: 0, y: 40, z: 60 }
    stepEnemies(state, player, 1 / 60)
    expect(activeOrbs(state)).toHaveLength(1)
    // Nothing else leaves until the cooldown is up: no lock, no stream.
    for (let tick = 0; tick < Math.floor(ANTI_AIR_ORB_INTERVAL * 60) - 4; tick += 1) {
      stepEnemies(state, player, 1 / 60)
    }
    expect(activeOrbs(state)).toHaveLength(1)
    for (let tick = 0; tick < 8; tick += 1) stepEnemies(state, player, 1 / 60)
    expect(activeOrbs(state)).toHaveLength(2)
  })

  it('never locks on: no telegraph, no aim line, no lead', () => {
    // The three-second lock and the blinking beam were a second grammar for
    // one verb. What is left is a gun that shoots at where you are.
    const { state, gun } = emplacement({ x: 0, y: 30, z: 0 })
    const player = { x: 0, y: 40, z: 60 }
    const velocity = { x: 0, y: 0, z: 25 }
    for (let tick = 0; tick < 60 * 6; tick += 1) {
      stepEnemies(state, player, 1 / 60, velocity)
      expect(gun.aiming).toBe(false)
      expect(gun.telegraph).toBe(0)
    }
    for (const orb of activeOrbs(state)) {
      // Straight at the craft's own position, so the bearing is exact.
      const range = Math.hypot(player.x, player.y - 30, player.z)
      expect(orb.velocity.z / ANTI_AIR_ORB_SPEED).toBeCloseTo(player.z / range, 4)
    }
  })

  it('holds its fire past its range, and at anything below the emplacement', () => {
    const far = emplacement({ x: 0, y: 30, z: 0 })
    for (let tick = 0; tick < 60; tick += 1) {
      stepEnemies(far.state, { x: 0, y: 40, z: ANTI_AIR_ORB_RANGE + 15 }, 1 / 60)
    }
    expect(activeOrbs(far.state)).toHaveLength(0)

    // A rooftop gun cannot shoot down through its own building.
    const below = emplacement({ x: 0, y: 30, z: 0 })
    for (let tick = 0; tick < 60; tick += 1) stepEnemies(below.state, { x: 0, y: 12, z: 40 }, 1 / 60)
    expect(activeOrbs(below.state)).toHaveLength(0)
  })

  it('reaches the far edge of its range before it burns out', () => {
    // A round that dies short of the envelope would make the range a lie.
    const { state } = emplacement({ x: 0, y: 30, z: 0 })
    const player = { x: 0, y: 30, z: ANTI_AIR_ORB_RANGE - 1 }
    stepEnemies(state, player, 1 / 60)
    let hits = 0
    for (let tick = 0; tick < 60 * 8; tick += 1) {
      if (stepEnemyProjectiles(state, player, 1 / 60, 1.05) > 0) hits += 1
    }
    expect(hits).toBe(1)
  })
})

describe('a round that connects', () => {
  it('bursts and is spent, and says where, so the hull can answer', () => {
    const state = createEnemyState(0x0b)
    const player = { x: 0, y: 20, z: 0 }
    const orb = state.projectiles[0]!
    orb.active = true
    orb.kind = 'orb'
    orb.position = { x: 0, y: 20, z: 6 }
    orb.velocity = { x: 0, y: 0, z: -ORB_SPEED }
    orb.life = 4
    orb.damage = 1
    orb.radius = ORB_HIT_RADIUS
    let damage = 0
    for (let tick = 0; tick < 60 && damage === 0; tick += 1) {
      damage = stepEnemyProjectiles(state, player, 1 / 60, 1.05)
    }
    expect(damage).toBeGreaterThan(0)
    expect(state.projectileHit).toBe(true)
    expect(state.lastHitKind).toBe('orb')
    // Spent on contact: it does not carry on through the hull.
    expect(orb.active).toBe(false)
    // And the burst point is on the round, at the hull, for the effect.
    expect(Math.hypot(state.lastHitPoint.x - player.x, state.lastHitPoint.y - player.y, state.lastHitPoint.z - player.z))
      .toBeLessThanOrEqual(ORB_HIT_RADIUS + 1.05 + 0.1)
  })
})
