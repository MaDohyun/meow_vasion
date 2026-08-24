import { describe, expect, it } from 'vitest'
import {
  BOON_BOB_AMPLITUDE,
  BOON_DEFINITIONS,
  BOON_HOVER_HEIGHT,
  BOON_IDS,
  allBoonsMaxed,
  boonBonus,
  boonForCircle,
  boonHoverY,
  boonMultiplier,
  claimBoon,
  createBoonState,
  isBoonMaxed,
} from '../src/core/boons'
import { buildingMaxHealth, damageBuilding } from '../src/core/buildings'
import { mysteryCircleForCell, mysteryCirclesNear, worldCellCenter, worldCellCoord, type MysteryCircleSite, type ProceduralBuilding } from '../src/core/world'

/** Levels a state to the cap on the given stats. */
function maxOut(state = createBoonState(), ids = BOON_IDS) {
  for (const id of ids) state.levels[id] = BOON_DEFINITIONS[id].maxLevel
  return state
}

describe('mystery-circle boon pickups', () => {
  it('keeps the promised caps: laser five, the flight stats three each', () => {
    expect(BOON_IDS).toEqual(['laser-power', 'speed', 'turbo-recharge', 'turbo-capacity'])
    expect(BOON_DEFINITIONS['laser-power'].maxLevel).toBe(5)
    expect(BOON_DEFINITIONS.speed.maxLevel).toBe(3)
    expect(BOON_DEFINITIONS['turbo-recharge'].maxLevel).toBe(3)
    expect(BOON_DEFINITIONS['turbo-capacity'].maxLevel).toBe(3)
    // A maxed laser exactly doubles damage; maxed turbo adds 4.5 seconds.
    expect(1 + BOON_DEFINITIONS['laser-power'].step * 5).toBeCloseTo(2)
    expect(BOON_DEFINITIONS['turbo-capacity'].step * 3).toBeCloseTo(4.5)
  })

  it('grants one level per circle and never the same circle twice', () => {
    const state = createBoonState()
    const first = claimBoon(state, 'mystery:3:9')
    expect(first).not.toBeNull()
    expect(first!.kind).toBe('stat')
    if (first!.kind === 'stat') {
      expect(state.levels[first!.id]).toBe(1)
      expect(first!.level).toBe(1)
    }
    // The circle is spent: a second pass over it gives nothing.
    expect(claimBoon(state, 'mystery:3:9')).toBeNull()
  })

  it('deals each circle a stable stat and skips maxed ones', () => {
    const state = createBoonState()
    const id = 'mystery:12:-4'
    // Deterministic: the same circle answers the same until levels change.
    expect(boonForCircle(state, id)).toBe(boonForCircle(state, id))
    const dealt = boonForCircle(state, id)!
    state.levels[dealt] = BOON_DEFINITIONS[dealt].maxLevel
    expect(boonForCircle(state, id)).not.toBe(dealt)
  })

  it('heals once every stat is capped', () => {
    const state = maxOut()
    expect(allBoonsMaxed(state)).toBe(true)
    expect(boonForCircle(state, 'mystery:0:0')).toBeNull()
    expect(claimBoon(state, 'mystery:0:0')).toEqual({ kind: 'heal' })
  })

  it('reports multipliers and bonuses off the level times the step', () => {
    const state = createBoonState()
    expect(boonMultiplier(state, 'laser-power')).toBe(1)
    expect(boonBonus(state, 'turbo-capacity')).toBe(0)
    state.levels['laser-power'] = 3
    state.levels['turbo-capacity'] = 2
    expect(boonMultiplier(state, 'laser-power')).toBeCloseTo(1.6)
    expect(boonBonus(state, 'turbo-capacity')).toBeCloseTo(3)
    expect(isBoonMaxed(state, 'laser-power')).toBe(false)
  })

  it('feeds laser pickups straight into shots-to-destroy', () => {
    // The exact chain GameContext runs on a hit: claimBoon raises the level,
    // boonMultiplier turns it into damage, damageBuilding spends it. Max the
    // other stats first so every circle deals laser, then eat five.
    const state = maxOut(createBoonState(), ['speed', 'turbo-recharge', 'turbo-capacity'])
    for (let circle = 0; circle < 5; circle += 1) {
      const claim = claimBoon(state, `mystery:${circle}:0`)
      expect(claim).toEqual({ kind: 'stat', id: 'laser-power', level: circle + 1 })
    }
    expect(boonMultiplier(state, 'laser-power')).toBeCloseTo(2)

    const tower: ProceduralBuilding = {
      id: 'building:test', cellX: 0, cellZ: 0,
      position: { x: 0, y: 35, z: 0 }, size: { x: 20, y: 70, z: 20 },
      color: '#fff', roof: '#fff', sign: { text: 'SKY', color: '#fff', side: 'z' },
      facade: 0, floors: 1, entrance: 0, form: 'plain', roofOverhang: 1, roofThickness: 1,
    }
    const shotsToDestroy = (damage: number) => {
      const health = new Map<string, number>()
      let shots = 0
      while (!damageBuilding(health, tower, damage).destroyed) shots += 1
      return shots + 1
    }
    // A maxed laser halves the supertall block: seven hits become four.
    expect(shotsToDestroy(1)).toBe(buildingMaxHealth(tower))
    expect(shotsToDestroy(boonMultiplier(state, 'laser-power'))).toBe(Math.ceil(buildingMaxHealth(tower) / 2))
  })

  it('bobs the item inside its promised band, per-circle out of phase', () => {
    for (const time of [0, 1.3, 7.7, 42]) {
      const y = boonHoverY(time, 'mystery:5:5')
      expect(y).toBeGreaterThanOrEqual(BOON_HOVER_HEIGHT - BOON_BOB_AMPLITUDE)
      expect(y).toBeLessThanOrEqual(BOON_HOVER_HEIGHT + BOON_BOB_AMPLITUDE)
    }
    // Two circles do not bob in lockstep - the phase comes from the id.
    expect(boonHoverY(1, 'mystery:5:5')).not.toBeCloseTo(boonHoverY(1, 'mystery:6:5'), 5)
  })
})

describe('circles indexed for the radar and the pickup pool', () => {
  it('finds the same circles the ground query reports, inside the radius', () => {
    // Sweep out until some sector actually rolled a circle - placement is
    // deterministic but sparse, so the test walks rather than assumes.
    const hits = mysteryCirclesNear({ x: 0, z: 0 }, 900)
    expect(hits.length).toBeGreaterThan(0)
    for (const hit of hits) {
      expect(Math.hypot(hit.x, hit.z)).toBeLessThanOrEqual(900)
      // The hit's centre cell agrees with the authoritative per-cell query.
      const cellX = worldCellCoord(hit.x)
      const cellZ = worldCellCoord(hit.z)
      expect(mysteryCircleForCell(cellX, cellZ)).toBe(hit.id)
      expect(worldCellCenter(cellX)).toBe(hit.x)
      expect(worldCellCenter(cellZ)).toBe(hit.z)
    }
    // A tight radius strictly narrows the set, and the reuse buffer refills
    // in place rather than accumulating.
    const buffer: MysteryCircleSite[] = []
    const near = mysteryCirclesNear({ x: 0, z: 0 }, 250, buffer)
    expect(near).toBe(buffer)
    expect(near.length).toBeLessThanOrEqual(hits.length)
    for (const hit of near) expect(hits.map((entry: MysteryCircleSite) => entry.id)).toContain(hit.id)
  })
})
