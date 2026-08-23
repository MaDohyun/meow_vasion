import { describe, expect, it } from 'vitest'
import {
  DRONE_MINE_BLAST_RADIUS,
  DRONE_MINE_FUSE,
  DRONE_MINE_HIT_RADIUS,
  ENEMY_CONTACT_DAMAGE,
  ENEMY_WAVE_STAGES,
  createEnemyState,
  isDroneMine,
  mineTargetForTime,
  resolveEnemyContacts,
  stepEnemies,
  syncEnemyTiers,
} from '../src/core/enemies'

function droneWave() {
  const state = createEnemyState(0x51de)
  const player = { x: 0, y: 12, z: 0 }
  // A wave deep enough to have a real drone population, named off the table
  // rather than pinned to a second so respacing the run carries it along.
  const at = ENEMY_WAVE_STAGES[3]!.at
  for (let tick = 0; tick < 400; tick += 1) syncEnemyTiers(state, at, player, 0, 0.05)
  return { state, player, drones: state.slots.filter((enemy) => enemy.kind === 'drone' && enemy.active) }
}

describe('suicide drones', () => {
  it('splits into hovering mines and one-way passers', () => {
    const { drones } = droneWave()
    const mines = drones.filter(isDroneMine)
    expect(drones.length).toBeGreaterThan(8)
    expect(mines.length).toBeGreaterThan(0)
    expect(mines.length).toBeLessThan(drones.length)
    // Mines are a quota, not a share of whatever the drone budget happens to
    // be: the hovering population is the same whether or not the passers are
    // mid-cycle, which is what keeps them findable early in a run.
    expect(mines.length).toBe(mineTargetForTime(ENEMY_WAVE_STAGES[3]!.at))
  })

  it('keeps mines in front of a player who holds one heading', () => {
    // The complaint this answers: fly one direction and you would cross a
    // single crust of mines and then meet nothing. They are seeded across a
    // band and weighted toward the heading, so the population travels with the
    // player instead of being left behind.
    const state = createEnemyState(0x51de)
    const at = ENEMY_WAVE_STAGES[3]!.at
    let player = { x: 0, y: 12, z: 0 }
    const nearby: number[] = []
    for (let tick = 0; tick < 1500; tick += 1) {
      player = { x: 0, y: 12, z: tick * 0.5 }
      syncEnemyTiers(state, at, player, 0, 0.05)
      stepEnemies(state, player, 0.05)
      if (tick < 600 || tick % 100 !== 0) continue
      nearby.push(state.slots.filter((enemy) =>
        enemy.active && isDroneMine(enemy)
        && Math.hypot(enemy.position.x - player.x, enemy.position.z - player.z) < 150).length)
    }
    // Six hundred metres of straight flight later, and at every sample along
    // the way, there are still mines in reach.
    expect(nearby.length).toBeGreaterThan(5)
    expect(Math.min(...nearby)).toBeGreaterThan(3)
  })

  it('arms at exactly the radius it destroys, so the warning shell cannot lie', () => {
    const state = createEnemyState()
    const mine = state.slots.find((enemy) => enemy.kind === 'drone')!
    mine.active = true
    mine.mode = 'fixed'
    mine.position = { x: 0, y: 20, z: 0 }
    mine.target = { x: 0, y: 20, z: 0 }
    mine.hitRadius = DRONE_MINE_HIT_RADIUS

    // Just outside: nothing happens, however long the player loiters.
    const outside = { x: 0, y: 20, z: DRONE_MINE_BLAST_RADIUS + 0.5 }
    for (let tick = 0; tick < 200; tick += 1) stepEnemies(state, outside, 1 / 60)
    expect(mine.mineArmed).toBe(false)
    expect(mine.active).toBe(true)

    // Just inside: armed at once, and it holds for the fuse before going off.
    const inside = { x: 0, y: 20, z: DRONE_MINE_BLAST_RADIUS - 0.5 }
    stepEnemies(state, inside, 1 / 60)
    expect(mine.mineArmed).toBe(true)
    expect(mine.mineFuse).toBeGreaterThan(DRONE_MINE_FUSE - 0.1)
    // Backing off does not disarm it.
    for (let tick = 0; tick < Math.round(DRONE_MINE_FUSE * 60) - 4; tick += 1) {
      stepEnemies(state, { x: 0, y: 20, z: 400 }, 1 / 60)
      expect(state.mineExplosion, `${tick}`).toBe(null)
    }
    for (let tick = 0; tick < 8 && state.mineExplosion === null; tick += 1) {
      stepEnemies(state, { x: 0, y: 20, z: 400 }, 1 / 60)
    }
    expect(state.mineExplosion?.radius).toBe(DRONE_MINE_BLAST_RADIUS)
    expect(mine.active).toBe(false)
  })

  it('goes off the instant the hull touches it, with no fuse to run', () => {
    // The fuse is what a player gets for entering the field and having a
    // moment to leave it. Flying into the casing is not something to be given
    // a moment for - a mine ticking under the hull for a third of a second
    // read as a dud rather than as a hit.
    const state = createEnemyState()
    const mine = state.slots.find((enemy) => enemy.kind === 'drone')!
    mine.active = true
    mine.mode = 'fixed'
    mine.hitRadius = DRONE_MINE_HIT_RADIUS
    mine.position = { x: 0, y: 20, z: 0 }
    mine.target = { x: 0, y: 20, z: 0 }

    const craftRadius = 1.4
    stepEnemies(state, { x: 0, y: 20, z: mine.hitRadius + craftRadius - 0.1 }, 1 / 60, undefined, craftRadius)
    expect(state.mineExplosion?.radius).toBe(DRONE_MINE_BLAST_RADIUS)
    expect(mine.active).toBe(false)
  })

  it('makes a hovering mine bigger than a drone that is only passing through', () => {
    const { state } = droneWave()
    const mine = state.slots.find((enemy) => enemy.active && isDroneMine(enemy))!
    const passer = state.slots.find((enemy) => enemy.active && enemy.kind === 'drone' && !isDroneMine(enemy))!
    expect(mine.hitRadius).toBe(DRONE_MINE_HIT_RADIUS)
    expect(mine.hitRadius).toBeGreaterThan(passer.hitRadius)
  })

  it('holds a mine on its spot no matter where the player goes', () => {
    const { state } = droneWave()
    const mine = state.slots.find((enemy) => enemy.active && isDroneMine(enemy))!
    const startX = mine.position.x
    const startZ = mine.position.z
    // Fly the player right past it; a mine must not follow.
    for (let tick = 0; tick < 300; tick += 1) {
      stepEnemies(state, { x: tick * 0.4, y: 12, z: tick * 0.2 }, 1 / 60)
    }
    expect(Math.abs(mine.position.x - startX)).toBeLessThan(0.001)
    expect(Math.abs(mine.position.z - startZ)).toBeLessThan(0.001)
  })

  it('flies a passer dead straight, so its line can be read and dodged', () => {
    const { state, player } = droneWave()
    const drone = state.slots.find((enemy) => enemy.active && enemy.kind === 'drone' && !isDroneMine(enemy))!
    const heading = drone.phase
    const startY = drone.position.y
    const from = { x: drone.position.x, z: drone.position.z }
    for (let tick = 0; tick < 90; tick += 1) stepEnemies(state, player, 1 / 60)
    // Heading fixed at spawn and never revised - no homing, no altitude chase.
    expect(drone.phase).toBe(heading)
    expect(drone.position.y).toBe(startY)
    const travelled = Math.atan2(drone.position.x - from.x, drone.position.z - from.z)
    expect(Math.abs(Math.atan2(Math.sin(travelled - heading), Math.cos(travelled - heading)))).toBeLessThan(0.01)
  })

  it('does not chase the player upward', () => {
    const { state } = droneWave()
    const drone = state.slots.find((enemy) => enemy.active && enemy.kind === 'drone' && !isDroneMine(enemy))!
    const startY = drone.position.y
    for (let tick = 0; tick < 240; tick += 1) stepEnemies(state, { x: 0, y: 110, z: 0 }, 1 / 60)
    expect(drone.position.y).toBe(startY)
  })

  it('detonates on contact and reports where, and hits harder than a vehicle', () => {
    expect(ENEMY_CONTACT_DAMAGE.drone).toBeGreaterThan(ENEMY_CONTACT_DAMAGE['police-car'])
    const state = createEnemyState()
    const drone = state.slots.find((enemy) => enemy.kind === 'drone')!
    drone.active = true
    drone.hitRadius = 0.75
    drone.position = { x: 4, y: 9, z: -2 }
    const damage = resolveEnemyContacts(state, { x: 4, y: 9, z: -2 })
    expect(damage).toBe(ENEMY_CONTACT_DAMAGE.drone)
    expect(drone.active).toBe(false)
    expect(state.contactKills).toBe(1)
    expect(state.lastContactPoint).toEqual({ x: 4, y: 9, z: -2 })
  })

  it('never shoots', () => {
    const { state, player } = droneWave()
    for (const enemy of state.slots) if (enemy.kind !== 'drone') enemy.active = false
    for (let tick = 0; tick < 600; tick += 1) stepEnemies(state, player, 1 / 60)
    expect(state.projectiles.some((projectile) => projectile.active)).toBe(false)
  })
})
