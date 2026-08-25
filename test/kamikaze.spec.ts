import { describe, expect, it } from 'vitest'
import { DRONE_DEFAULTS } from '../src/core/drone'
import { SIZE_MAX, sizeProfile } from '../src/core/size'
import {
  DRONE_MINE_BLAST_RADIUS,
  DRONE_MINE_FUSE,
  DRONE_MINE_HIT_RADIUS,
  ENEMY_CONTACT_DAMAGE,
  ENEMY_WAVE_STAGES,
  createEnemyState,
  mineTargetForTime,
  resolveEnemyContacts,
  stepEnemies,
  syncEnemyTiers,
} from '../src/core/enemies'

function droneWave() {
  const state = createEnemyState(0x51de)
  const player = { x: 0, y: 12, z: 0 }
  // A wave deep enough to have a real mine population, named off the table
  // rather than pinned to a second so respacing the run carries it along.
  const at = ENEMY_WAVE_STAGES[3]!.at
  for (let tick = 0; tick < 400; tick += 1) syncEnemyTiers(state, at, player, 0, 0.05)
  return { state, player, drones: state.slots.filter((enemy) => enemy.kind === 'drone' && enemy.active) }
}

describe('suicide drones', () => {
  it('spawns every drone as a hovering mine', () => {
    // There is no passing-drone population any more. A passer crossed the
    // screen in a couple of seconds and carried none of the warning shell that
    // makes a mine fair, so the whole budget goes to the half that has to be
    // looked at and flown around.
    const { drones } = droneWave()
    expect(drones.length).toBe(mineTargetForTime(ENEMY_WAVE_STAGES[3]!.at))
    expect(drones.every((drone) => drone.mode === 'fixed')).toBe(true)
    expect(drones.every((drone) => drone.hitRadius === DRONE_MINE_HIT_RADIUS)).toBe(true)
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
        enemy.active && enemy.kind === 'drone'
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

    // Measured to the hull, not to the craft's centre. The blast field is ten
    // metres of air around the mine, and a grown saucer's hull is wider than
    // that on its own - so where the field starts has to be a hull radius
    // further out, or a craft big enough would be through the field before it
    // counted as having entered it.
    const hull = 1.4

    // Just outside: nothing happens, however long the player loiters.
    const outside = { x: 0, y: 20, z: DRONE_MINE_BLAST_RADIUS + hull + 0.5 }
    for (let tick = 0; tick < 200; tick += 1) stepEnemies(state, outside, 1 / 60, undefined, hull)
    expect(mine.mineArmed).toBe(false)
    expect(mine.active).toBe(true)

    // Just inside: armed at once, and it holds for the fuse before going off.
    const inside = { x: 0, y: 20, z: DRONE_MINE_BLAST_RADIUS + hull - 0.5 }
    stepEnemies(state, inside, 1 / 60, undefined, hull)
    expect(mine.mineArmed).toBe(true)
    expect(mine.mineFuse).toBeGreaterThan(DRONE_MINE_FUSE - 0.1)
    // Backing off does not disarm it.
    for (let tick = 0; tick < Math.round(DRONE_MINE_FUSE * 60) - 4; tick += 1) {
      stepEnemies(state, { x: 0, y: 20, z: 400 }, 1 / 60, undefined, hull)
      expect(state.mineExplosion, `${tick}`).toBe(null)
    }
    for (let tick = 0; tick < 8 && state.mineExplosion === null; tick += 1) {
      stepEnemies(state, { x: 0, y: 20, z: 400 }, 1 / 60, undefined, hull)
    }
    expect(state.mineExplosion?.radius).toBe(DRONE_MINE_BLAST_RADIUS)
    expect(mine.active).toBe(false)
  })

  it('still arms and detonates against a craft far wider than its own blast', () => {
    // The bug this pins: at the size cap the hull radius is 15.75 and the
    // blast is 10, so the mine went off against the hull at a centre distance
    // already outside its own blast - and every check that measured from the
    // centre then found nothing there. Mines could not hurt a grown craft at
    // all, which is the half of the run where they matter least and the half
    // where the player has most to lose.
    const hull = sizeProfile(SIZE_MAX).hitRadius
    expect(hull).toBeGreaterThan(DRONE_MINE_BLAST_RADIUS)
    const state = createEnemyState()
    const mine = state.slots.find((enemy) => enemy.kind === 'drone')!
    mine.active = true
    mine.mode = 'fixed'
    mine.position = { x: 0, y: 20, z: 0 }
    mine.target = { x: 0, y: 20, z: 0 }
    mine.hitRadius = DRONE_MINE_HIT_RADIUS

    // The hull crosses into the field long before the centre would.
    const approaching = { x: 0, y: 20, z: DRONE_MINE_BLAST_RADIUS + hull - 1 }
    stepEnemies(state, approaching, 1 / 60, undefined, hull)
    expect(mine.mineArmed).toBe(true)

    for (let tick = 0; tick < 60 && state.mineExplosion === null; tick += 1) {
      stepEnemies(state, approaching, 1 / 60, undefined, hull)
    }
    const blast = state.mineExplosion
    expect(blast).not.toBe(null)
    // And the blast it hands the game reaches the hull, which is what the
    // damage check has to measure against: centre-to-centre it does not.
    const centreDistance = Math.hypot(blast!.position.z - approaching.z)
    expect(centreDistance).toBeGreaterThan(blast!.radius)
    expect(centreDistance).toBeLessThanOrEqual(blast!.radius + hull)
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

  it('holds a mine on its spot while the player stays out of its radius', () => {
    const { state } = droneWave()
    const mine = state.slots.find((enemy) => enemy.active && enemy.kind === 'drone')!
    const startX = mine.position.x
    const startZ = mine.position.z
    // Fly the player around outside the blast radius; a mine must not follow.
    // Chasing across the map would make it a tax on having been seen, which is
    // the reason no drone in the game chases.
    for (let tick = 0; tick < 300; tick += 1) {
      const angle = tick * 0.05
      stepEnemies(state, {
        x: mine.position.x + Math.cos(angle) * (DRONE_MINE_BLAST_RADIUS + 6),
        y: mine.position.y,
        z: mine.position.z + Math.sin(angle) * (DRONE_MINE_BLAST_RADIUS + 6),
      }, 1 / 60)
    }
    expect(Math.abs(mine.position.x - startX)).toBeLessThan(0.001)
    expect(Math.abs(mine.position.z - startZ)).toBeLessThan(0.001)
  })

  it('creeps at the player once they are inside the radius, and stops when they leave', () => {
    // The fuse alone let a player who reacted at the shell simply back out
    // along the way they came. Now the ground they have to give back is moving
    // too - slowly, and only from inside.
    const state = createEnemyState()
    const mine = state.slots.find((enemy) => enemy.kind === 'drone')!
    mine.active = true
    mine.mode = 'fixed'
    mine.hitRadius = DRONE_MINE_HIT_RADIUS
    mine.position = { x: 0, y: 20, z: 0 }
    mine.target = { x: 0, y: 20, z: 0 }
    // Being inside the radius also lights the fuse, and this is about the
    // movement rule rather than the fuse, so it is held open. The countdown
    // has its own test above.
    const hold = () => { mine.mineFuse = DRONE_MINE_FUSE }
    // Kept short and started at the very edge: creep long enough from inside
    // and the mine simply reaches the craft, which is the contact case above.
    const inside = { x: 0, y: 20, z: DRONE_MINE_BLAST_RADIUS - 0.5 }
    const startZ = mine.position.z
    const seconds = 0.5
    for (let tick = 0; tick < seconds * 60; tick += 1) { hold(); stepEnemies(state, inside, 1 / 60) }
    expect(mine.active).toBe(true)
    const closed = mine.position.z - startZ
    expect(closed).toBeGreaterThan(1)
    // Slow: it takes ground back, it does not run anybody down. A quarter of
    // cruising speed at the very most.
    expect(closed / seconds).toBeLessThan(DRONE_DEFAULTS.maxSpeed * 0.25)

    // Step back outside and it stops dead where it is.
    const held = mine.position.z
    const outside = { x: 0, y: 20, z: DRONE_MINE_BLAST_RADIUS * 4 }
    for (let tick = 0; tick < 120; tick += 1) { hold(); stepEnemies(state, outside, 1 / 60) }
    expect(mine.active).toBe(true)
    expect(Math.abs(mine.position.z - held)).toBeLessThan(0.001)
  })

  it('detonates on contact and reports where, and hits harder than a helicopter', () => {
    expect(ENEMY_CONTACT_DAMAGE.drone).toBeGreaterThan(ENEMY_CONTACT_DAMAGE.helicopter)
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
