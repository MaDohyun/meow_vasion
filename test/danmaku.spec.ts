import { describe, expect, it } from 'vitest'
import { DRONE_DEFAULTS, type Aabb } from '../src/core/drone'
import {
  FIGHTER_ORB_FAN,
  FIGHTER_ORB_INTERVAL,
  FIGHTER_PASS_SPEED,
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

const activeOrbs = (state: ReturnType<typeof createEnemyState>) =>
  state.projectiles.filter((projectile) => projectile.active && projectile.kind === 'orb')

describe('fighter curtain fire', () => {
  it('crosses the sky in one fast straight line', () => {
    // The pass is the manoeuvre: no strafe legs, no turning toward anyone.
    // Faster than cruise so it reads as an attack run, and the player meets
    // its cone rather than chasing its tail.
    expect(FIGHTER_PASS_SPEED).toBeGreaterThan(DRONE_DEFAULTS.maxSpeed)
    const { state, fighter } = attackRun({ x: 0, y: 20, z: -100 }, 0)
    const player = { x: 120, y: 20, z: 0 }
    for (let tick = 0; tick < 60 * 3; tick += 1) stepEnemies(state, player, 1 / 60)
    expect(fighter.position.x).toBeCloseTo(0, 3)
    expect(fighter.position.z).toBeCloseTo(-100 + FIGHTER_PASS_SPEED * 3, 0)
  })

  it('fans orbs only at a player inside its thirty-degree view cone', () => {
    // Dead ahead: the fan leaves at once.
    const ahead = attackRun({ x: 0, y: 20, z: 0 }, 0)
    stepEnemies(ahead.state, { x: 0, y: 20, z: 50 }, 1 / 60)
    expect(activeOrbs(ahead.state)).toHaveLength(FIGHTER_ORB_FAN)

    // Forty-five degrees off the nose: in range, in view, and still silent -
    // the cone is the trigger, not the distance.
    const beside = attackRun({ x: 0, y: 20, z: 0 }, 0)
    for (let tick = 0; tick < 60 * 3; tick += 1) stepEnemies(beside.state, { x: 50, y: 20, z: 50 }, 1 / 60)
    expect(activeOrbs(beside.state)).toHaveLength(0)

    // Behind: nothing, however long it flies.
    const behind = attackRun({ x: 0, y: 20, z: 0 }, 0)
    for (let tick = 0; tick < 60 * 3; tick += 1) stepEnemies(behind.state, { x: 0, y: 20, z: -50 }, 1 / 60)
    expect(activeOrbs(behind.state)).toHaveLength(0)
  })

  it('holds a two-second cadence while the player camps the cone', () => {
    const { state, fighter } = attackRun({ x: 0, y: 20, z: 0 }, 0)
    const player = { x: 0, y: 20, z: 40 }
    const bursts: number[] = []
    let previous = 0
    for (let tick = 0; tick < 60 * 9; tick += 1) {
      // Ride along forty metres ahead, so the cone never loses the player and
      // the cadence is the only thing being measured.
      player.z = fighter.position.z + 40
      stepEnemies(state, player, 1 / 60)
      const count = activeOrbs(state).length
      if (count > previous) bursts.push(tick / 60)
      previous = count
    }
    expect(bursts.length).toBeGreaterThanOrEqual(4)
    expect(bursts.length).toBeLessThanOrEqual(6)
    for (let index = 1; index < bursts.length; index += 1) {
      expect(bursts[index]! - bursts[index - 1]!).toBeGreaterThan(FIGHTER_ORB_INTERVAL - 0.1)
    }
  })

  it('drifts its orbs slower than the craft cruises, so they are dodged, not outrun', () => {
    const { state } = attackRun({ x: 0, y: 20, z: 0 }, 0)
    stepEnemies(state, { x: 0, y: 26, z: 50 }, 1 / 60)
    const orbs = activeOrbs(state)
    expect(orbs.length).toBeGreaterThan(0)
    for (const orb of orbs) {
      expect(Math.hypot(orb.velocity.x, orb.velocity.z)).toBeCloseTo(ORB_SPEED, 3)
      expect(ORB_SPEED).toBeLessThan(DRONE_DEFAULTS.maxSpeed)
      // The climb is a drift toward the player's altitude, never a dive.
      expect(Math.abs(orb.velocity.y)).toBeLessThanOrEqual(6)
    }
  })

  it('spreads the fan wide enough that it is a wall, not a rifle', () => {
    const { state } = attackRun({ x: 0, y: 20, z: 0 }, 0)
    stepEnemies(state, { x: 0, y: 20, z: 50 }, 1 / 60)
    const bearings = activeOrbs(state).map((orb) => Math.atan2(orb.velocity.x, orb.velocity.z))
    const spread = Math.max(...bearings) - Math.min(...bearings)
    expect(spread).toBeGreaterThan(0.6)
    // And it is centred on the fighter's own nose, which is what makes
    // stepping out of the cone the dodge.
    const centre = bearings.reduce((sum, value) => sum + value, 0) / bearings.length
    expect(Math.abs(centre)).toBeLessThan(0.01)
  })

  it('lets a small craft thread lanes a grown one cannot', () => {
    // Size is the cost of growing, and the curtain prices it with plain
    // geometry: the fan is lanes with gaps, and the gaps only fit a hull that
    // has stayed small. Parked off the centre lane at thirty metres, the
    // nearest orbs pass about three metres away - outside a small craft's
    // reach, inside a grown one's.
    const orbHits = (hitRadius: number) => {
      const { state } = attackRun({ x: 0, y: 20, z: 0 }, 0)
      // Bait the single burst from dead ahead, then park between the lanes.
      stepEnemies(state, { x: 0, y: 20, z: 30 }, 1 / 60)
      const parked = { x: 3.1, y: 20, z: 30 }
      let hits = 0
      for (let tick = 0; tick < 60 * 4; tick += 1) {
        if (stepEnemyProjectiles(state, parked, 1 / 60, hitRadius) > 0) hits += 1
      }
      return hits
    }
    expect(orbHits(1.05)).toBe(0)
    expect(orbHits(3.26)).toBeGreaterThan(0)
  })

  it('dies on a building, so cover is real cover', () => {
    // A curtain round is slow enough that putting a wall between yourself and
    // the fan is a decision the player visibly makes - so the wall honours it.
    const wall: Aabb = { minX: -12, maxX: 12, minY: 0, maxY: 40, minZ: 20, maxZ: 24 }
    const hidden = { x: 0, y: 20, z: 30 }
    const hitsBehindWall = (colliders: Aabb[]) => {
      const { state } = attackRun({ x: 0, y: 20, z: 0 }, 0)
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
