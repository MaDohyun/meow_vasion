import { describe, expect, it } from 'vitest'
import {
  BOON_DEFINITIONS,
  BOON_HOVER_MAX,
  BOON_HOVER_MIN,
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
import { type BeamField, type BeamObject, stepBeamObjects } from '../src/core/beam'
import { createDroneState, stepDrone } from '../src/core/drone'
import { mysteryCircleForCell, mysteryCirclesNear, worldCellCenter, worldCellCoord, type MysteryCircleSite, type ProceduralBuilding } from '../src/core/world'

/** Levels a state to the cap on the given stats. */
function maxOut(state = createBoonState(), ids = BOON_IDS) {
  for (const id of ids) state.levels[id] = BOON_DEFINITIONS[id].maxLevel
  return state
}

describe('mystery-circle boon pickups', () => {
  it('keeps the promised caps: laser five, handling two, the rest three each', () => {
    expect(BOON_IDS).toEqual([
      'laser-power', 'speed', 'turn-rate', 'beam-pull', 'turbo-recharge', 'turbo-capacity',
    ])
    expect(BOON_DEFINITIONS['laser-power'].maxLevel).toBe(5)
    expect(BOON_DEFINITIONS.speed.maxLevel).toBe(3)
    expect(BOON_DEFINITIONS['turn-rate'].maxLevel).toBe(2)
    expect(BOON_DEFINITIONS['beam-pull'].maxLevel).toBe(2)
    expect(BOON_DEFINITIONS['turbo-recharge'].maxLevel).toBe(3)
    expect(BOON_DEFINITIONS['turbo-capacity'].maxLevel).toBe(3)
    // A maxed laser exactly doubles damage; maxed turbo adds 4.5 seconds.
    expect(1 + BOON_DEFINITIONS['laser-power'].step * 5).toBeCloseTo(2)
    expect(BOON_DEFINITIONS['turbo-capacity'].step * 3).toBeCloseTo(4.5)
  })

  it('keeps the two handling stats small enough to read as tuning', () => {
    // Yaw is what the dodge is made of and beam pull feeds the haul spring
    // twice, so both caps are deliberately modest: a fifth quicker round a
    // corner, and about half again as fast on the haul.
    const state = maxOut()
    expect(boonMultiplier(state, 'turn-rate')).toBeCloseTo(1.2)
    const pull = boonMultiplier(state, 'beam-pull')
    expect(pull).toBeCloseTo(1.24)
    expect(pull * pull).toBeGreaterThan(1.5)
    expect(pull * pull).toBeLessThan(1.6)
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

  it('patches the craft once every stat is capped', () => {
    // The only life a circle gives back. Flying through one is a speed pit
    // stop; this costs a whole item and only exists because a capped run has
    // nothing left to raise.
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
    const state = maxOut(createBoonState(), ['speed', 'turn-rate', 'beam-pull', 'turbo-recharge', 'turbo-capacity'])
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

  it('turns exactly a fifth quicker at a maxed turn-rate, through stepDrone', () => {
    // GameContext feeds the pickup through stepDrone's own yaw lever, whose
    // coefficient is 0.15 per level, so the bonus is divided by it. Get the
    // divide wrong and the stat quietly lands somewhere else entirely - this
    // pins the promised 20% to the number the flight model actually turns at.
    const maxed = maxOut(createBoonState(), ['turn-rate'])
    const flat = { throttle: 1, steer: 1, vertical: 0, special: false }
    const upgrades = { speed: 0, stability: 0, rack: 0, special: 'none' as const }
    const yawAfter = (stability: number) => {
      let state = createDroneState()
      for (let frame = 0; frame < 60; frame += 1) {
        state = stepDrone(state, flat, 1 / 60, 0, { ...upgrades, stability })
      }
      return state.yawVelocity
    }
    const base = yawAfter(0)
    const upgraded = yawAfter(boonBonus(maxed, 'turn-rate') / 0.15)
    expect(upgraded / base).toBeCloseTo(1.2, 5)
  })

  it('hauls a caught load faster at a maxed beam-pull', () => {
    // Pull is the one beam property a pickup raises - radius and reach stay
    // pure hull. It feeds the haul spring twice, so a 1.24 multiplier is felt
    // as roughly half again the climb rate.
    const maxed = maxOut(createBoonState(), ['beam-pull'])
    const car = (): BeamObject => ({
      id: 'car-1', kind: 'car', mass: 2.4, color: '#ff5d74',
      position: { x: 0, y: 0.65, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 },
      active: true, inBeam: false, tether: 0, playerTouched: false,
      destroying: false, destroyTimer: 0, explosionPending: false,
      absorbing: false, absorbTimer: 0,
    })
    const field = (gripScale: number): BeamField => ({
      active: true, boosting: false,
      position: { x: 0, y: 7, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
      gripScale,
    })
    const climb = (gripScale: number) => {
      const objects = [car()]
      for (let frame = 0; frame < 20; frame += 1) stepBeamObjects(objects, field(gripScale), 1 / 60)
      return objects[0]!.position.y
    }
    expect(boonMultiplier(maxed, 'beam-pull')).toBeCloseTo(1.24)
    expect(climb(boonMultiplier(maxed, 'beam-pull'))).toBeGreaterThan(climb(1))
  })

  it('hangs every box inside the 50-80m band, per-circle at its own height', () => {
    for (const id of ['mystery:5:5', 'mystery:6:5', 'mystery:-3:12']) {
      for (const time of [0, 1.3, 7.7, 42]) {
        const y = boonHoverY(time, id)
        expect(y).toBeGreaterThanOrEqual(BOON_HOVER_MIN)
        expect(y).toBeLessThanOrEqual(BOON_HOVER_MAX)
      }
    }
    // Two circles neither share a height nor bob in lockstep - both come off
    // the id hash, so a skyline of boxes reads as scattered treasure.
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
