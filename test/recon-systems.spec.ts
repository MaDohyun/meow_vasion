import { describe, expect, it } from 'vitest'
import { BUILDING_SCORE, buildingDestructionScore, buildingMaxHealth, createBuildingRuin, damageBuilding, ruinCollider } from '../src/core/buildings'
import {
  LAKE_ABSORPTION_LITRES_PER_SECOND,
  LAKE_BEAM_SPEED_SCALE,
  LAKE_CELL_CAPACITY,
  LAKE_DRAIN_SIZE_GAIN,
  LAKE_SCORE_PER_LITRE,
  createLakeDrainState,
  drawFromLakeCell,
  lakeCellDrained,
  lakeCellKey,
  lakeCellRemaining,
  lakeScorePayout,
  stepLakeAbsorption,
} from '../src/core/lakes'
import { MISSION_TARGETS } from '../src/core/missions'
import { SIZE_GAIN, growSizeBy } from '../src/core/size'
import { shouldCrashFromOverload } from '../src/core/overload'
import type { ProceduralBuilding } from '../src/core/world'

const building = (height: number): ProceduralBuilding => ({
  id: `building:${height}`, cellX: 0, cellZ: 0,
  position: { x: 0, y: height / 2, z: 0 }, size: { x: 20, y: height, z: 20 },
  color: '#fff', roof: '#fff', sign: { text: 'SKY', color: '#fff', side: 'z' },
  facade: 0, floors: 1, entrance: 0, form: 'plain', roofOverhang: 1, roofThickness: 1,
})

describe('recon overhaul support systems', () => {
  it('absorbs lake water only while beaming and never returns ballast', () => {
    expect(stepLakeAbsorption(0, 1, false, 20)).toEqual({ litres: 0, absorbed: 0, speedScale: 1, anchored: false })
    const active = stepLakeAbsorption(20, 2, true, 20)
    expect(active.litres).toBe(120)
    expect(active.absorbed).toBe(100)
    // Half speed, not a standstill: the craft can still leave the lake.
    expect(LAKE_BEAM_SPEED_SCALE).toBe(0.5)
    expect(active.speedScale).toBeCloseTo(LAKE_BEAM_SPEED_SCALE)
    expect(active.anchored).toBe(true)
    expect('ballast' in active).toBe(false)
    expect(stepLakeAbsorption(active.litres, 1, true, 0).speedScale).toBe(1)
  })

  it('ramps the lake speed penalty in from the shore instead of snapping at the edge', () => {
    // Right at the shoreline (depth 0) the beam is not "over" the lake yet.
    expect(stepLakeAbsorption(0, 1, true, 0).anchored).toBe(false)
    // A step past the shore barely slows the craft...
    const shallow = stepLakeAbsorption(0, 1, true, 1)
    expect(shallow.anchored).toBe(true)
    expect(shallow.speedScale).toBeGreaterThan(0.9)
    // ...and it keeps easing down as the craft pushes toward open water,
    // bottoming out at the 80%-slower floor only once fully out from shore.
    const mid = stepLakeAbsorption(0, 1, true, 6)
    expect(mid.speedScale).toBeLessThan(shallow.speedScale)
    expect(mid.speedScale).toBeGreaterThan(LAKE_BEAM_SPEED_SCALE)
    const deep = stepLakeAbsorption(0, 1, true, 30)
    expect(deep.speedScale).toBeCloseTo(LAKE_BEAM_SPEED_SCALE)
  })

  it('pays whole points for pumped water without ever paying a frame twice', () => {
    // A sixtieth of a second of pumping is 0.83 litres, and a fraction of a
    // litre never pays on its own: the payout waits for the whole litre to
    // land, whatever the frame boundaries were on the way there.
    expect(lakeScorePayout(0, 0.83)).toBe(0)
    expect(lakeScorePayout(0.83, 1.66)).toBe(1)
    expect(lakeScorePayout(1.66, 2.49)).toBe(1)
    expect(lakeScorePayout(2.49, 3.32)).toBe(1)
    // Four frames, 3.32 litres, three points - the fourth is still owed.
    expect(lakeScorePayout(0, 3.32)).toBe(3)
    // Sixty frames of pumping pay exactly what one long step of the same
    // duration pays - no drift, no free point at the seams.
    let litres = 0
    let framed = 0
    for (let frame = 0; frame < 60; frame += 1) {
      const next = stepLakeAbsorption(litres, 1 / 60, true, 20)
      framed += lakeScorePayout(litres, next.litres)
      litres = next.litres
    }
    expect(litres).toBeCloseTo(LAKE_ABSORPTION_LITRES_PER_SECOND)
    expect(framed).toBe(lakeScorePayout(0, LAKE_ABSORPTION_LITRES_PER_SECOND))
    // A point a litre, so a second of held beam is the 50 litres it pumped.
    expect(LAKE_SCORE_PER_LITRE).toBe(1)
    expect(framed).toBe(LAKE_ABSORPTION_LITRES_PER_SECOND)
    // Never negative, and a still craft owes nothing.
    expect(lakeScorePayout(200, 200)).toBe(0)
    expect(lakeScorePayout(200, 0)).toBe(0)
  })

  it('empties a lake tile after its capacity and never refills it', () => {
    const lakes = createLakeDrainState()
    const key = lakeCellKey(3, -7)
    expect(lakeCellRemaining(lakes, key)).toBe(LAKE_CELL_CAPACITY)
    expect(lakeCellDrained(lakes, key)).toBe(false)

    // Five seconds of held beam at 50 L/s is exactly one tile.
    let litres = 0
    let drained = false
    let seconds = 0
    while (!drained && seconds < 60) {
      const remaining = lakeCellRemaining(lakes, key)
      const step = stepLakeAbsorption(litres, 1 / 60, true, 20, remaining)
      drained = drawFromLakeCell(lakes, key, step.absorbed)
      litres = step.litres
      seconds += 1 / 60
    }
    expect(drained).toBe(true)
    expect(seconds).toBeCloseTo(LAKE_CELL_CAPACITY / LAKE_ABSORPTION_LITRES_PER_SECOND, 1)
    // Never over-draws: the last frame is clipped to what the tile had left.
    expect(litres).toBe(LAKE_CELL_CAPACITY)
    expect(lakeCellRemaining(lakes, key)).toBe(0)
    expect(lakeCellDrained(lakes, key)).toBe(true)

    // Dry for the rest of the run. Holding the beam over it takes nothing,
    // and the drain never reports a second time - the growth is paid once.
    expect(stepLakeAbsorption(litres, 1, true, 20, lakeCellRemaining(lakes, key)).absorbed).toBe(0)
    expect(drawFromLakeCell(lakes, key, 500)).toBe(false)
    expect(lakeCellRemaining(lakes, key)).toBe(0)

    // A neighbouring tile is untouched: the lake drains a cell at a time.
    expect(lakeCellDrained(lakes, lakeCellKey(4, -7))).toBe(false)
  })

  it('prices a lake tile so the water rung cannot be finished standing still', () => {
    // The rung asks for more than one tile holds, so the pilot has to drain
    // one and move to the next. This is the whole reason for the capacity.
    expect(MISSION_TARGETS['absorb-water']).toBeGreaterThan(LAKE_CELL_CAPACITY)
    // ...but not so much more that it needs a third tile, which would be a
    // fetch quest rather than a lesson about drag.
    expect(MISSION_TARGETS['absorb-water']).toBeLessThanOrEqual(LAKE_CELL_CAPACITY * 2)
    // A tile is a bounded meal however long anyone parks on it.
    expect(LAKE_CELL_CAPACITY * LAKE_SCORE_PER_LITRE).toBe(250)
  })

  it('grows the hull for a drained tile at a rate the city still beats', () => {
    // Bigger than a cat, smaller than the largest tower absorbBeamObject can
    // pay - a tile costs five seconds pinned at half speed.
    expect(LAKE_DRAIN_SIZE_GAIN).toBeGreaterThan(SIZE_GAIN.cat)
    expect(LAKE_DRAIN_SIZE_GAIN).toBeLessThan(0.2)

    // Fifteen seconds of pumping is an average three-tile lake. Fifteen
    // seconds of eating the city at the rate test/feeding.spec.ts measures
    // (about 0.8 pedestrians a second) has to stay ahead of it, or the lake
    // becomes the better way to grow and the core loop moves into the water.
    const lakeSize = growSizeBy(growSizeBy(growSizeBy(1, LAKE_DRAIN_SIZE_GAIN), LAKE_DRAIN_SIZE_GAIN), LAKE_DRAIN_SIZE_GAIN)
    let citySize = 1
    for (let bite = 0; bite < 12; bite += 1) citySize = growSizeBy(citySize, SIZE_GAIN.pedestrian)
    expect(lakeSize).toBeGreaterThan(1.3)
    expect(citySize).toBeGreaterThan(lakeSize)
  })

  it('crashes only with beam on, overload and ground contact together', () => {
    expect(shouldCrashFromOverload(true, 12, 10, 1)).toBe(true)
    expect(shouldCrashFromOverload(false, 12, 10, 1)).toBe(false)
    expect(shouldCrashFromOverload(true, 10, 10, 1)).toBe(false)
    expect(shouldCrashFromOverload(true, 12, 10, 2)).toBe(false)
  })

  it('pays more for the towers that take more shooting', () => {
    const buildings = [building(12), building(30), building(52), building(78)]
    const scores = buildings.map(buildingDestructionScore)
    // Strictly rising with the hit tiers, so "shoot the big one" is always the
    // better answer on mission four's wrecking gauge.
    expect(scores).toEqual([...scores].sort((left, right) => left - right))
    expect(new Set(scores).size).toBe(scores.length)
    expect(scores[0]).toBe(BUILDING_SCORE.low)
    expect(scores[3]).toBe(BUILDING_SCORE.supertall)
    const hits = buildings.map(buildingMaxHealth)
    expect(scores[3]! / scores[0]!).toBeGreaterThan(hits[3]! / hits[0]!)
  })

  it('uses four hit tiers and leaves a low fly-over ruin collider', () => {
    const buildings = [building(12), building(30), building(52), building(78)]
    expect(buildings.map(buildingMaxHealth)).toEqual([4, 5, 6, 7])
    const health = new Map<string, number>()
    const target = buildings[2]!
    for (let hit = 0; hit < 5; hit += 1) expect(damageBuilding(health, target).destroyed).toBe(false)
    expect(damageBuilding(health, target).destroyed).toBe(true)
    const ruin = createBuildingRuin(target)
    expect(ruin.size.y).toBeLessThan(target.size.y / 10)
    expect(ruinCollider(ruin).maxY).toBe(ruin.size.y)
  })
})
