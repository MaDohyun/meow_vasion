import { describe, expect, it } from 'vitest'
import { BUILDING_SCORE, buildingDestructionScore, buildingMaxHealth, createBuildingRuin, damageBuilding, ruinCollider } from '../src/core/buildings'
import {
  LAKE_ABSORPTION_LITRES_PER_SECOND,
  LAKE_BEAM_SPEED_SCALE,
  LAKE_CELL_CAPACITY_MAX,
  LAKE_CELL_CAPACITY_MIN,
  LAKE_SCORE_PER_LITRE,
  createLakeDrainState,
  drawFromLakeCell,
  lakeCellCapacity,
  lakeCellDrained,
  lakeCellRemaining,
  lakeDrainSizeGain,
  lakeScorePayout,
  stepLakeAbsorption,
  LAKE_DRAIN_SIZE_GAIN_PER_LITRE,
} from '../src/core/lakes'
import { MISSION_TARGETS } from '../src/core/missions'
import { SIZE_GAIN } from '../src/core/size'
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
    // Fractions of a point never ship: the payout is what floor() crossed, so
    // the split across frames always sums to the same total as one long step.
    // At a point a litre a sixtieth of a second is 0.83 points, so most frames
    // pay one and the rest pay nothing rather than every frame paying 0.83.
    expect(lakeScorePayout(0, 0.83)).toBe(0)
    expect(lakeScorePayout(0.83, 1.66)).toBe(1)
    expect(lakeScorePayout(1.66, 2.49)).toBe(1)
    expect(lakeScorePayout(2.49, 3.32)).toBe(1)
    // Four frames, 3.32 litres: three points banked, the fourth still owed.
    expect(lakeScorePayout(0, 3.32)).toBe(3)
    // A tenth of a litre owes nothing at all on its own.
    expect(lakeScorePayout(0, 0.1)).toBe(0)
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
    expect(framed).toBe(LAKE_ABSORPTION_LITRES_PER_SECOND * LAKE_SCORE_PER_LITRE)
    // Never negative, and a still craft owes nothing.
    expect(lakeScorePayout(200, 200)).toBe(0)
    expect(lakeScorePayout(200, 0)).toBe(0)
  })

  it('empties a lake tile after its capacity and never refills it', () => {
    const lakes = createLakeDrainState()
    const [cellX, cellZ] = [3, -7]
    const capacity = lakeCellCapacity(cellX, cellZ)
    expect(lakeCellRemaining(lakes, cellX, cellZ)).toBe(capacity)
    expect(lakeCellDrained(lakes, cellX, cellZ)).toBe(false)

    let litres = 0
    let drained = false
    let seconds = 0
    while (!drained && seconds < 60) {
      const remaining = lakeCellRemaining(lakes, cellX, cellZ)
      const step = stepLakeAbsorption(litres, 1 / 60, true, 20, remaining)
      drained = drawFromLakeCell(lakes, cellX, cellZ, step.absorbed)
      litres = step.litres
      seconds += 1 / 60
    }
    expect(drained).toBe(true)
    expect(seconds).toBeCloseTo(capacity / LAKE_ABSORPTION_LITRES_PER_SECOND, 1)
    // Never over-draws: the last frame is clipped to what the tile had left.
    expect(litres).toBeCloseTo(capacity, 6)
    expect(lakeCellRemaining(lakes, cellX, cellZ)).toBe(0)
    expect(lakeCellDrained(lakes, cellX, cellZ)).toBe(true)

    // Dry for the rest of the run. Holding the beam over it takes nothing,
    // and the drain never reports a second time - the growth is paid once.
    expect(stepLakeAbsorption(litres, 1, true, 20, lakeCellRemaining(lakes, cellX, cellZ)).absorbed).toBe(0)
    expect(drawFromLakeCell(lakes, cellX, cellZ, 500)).toBe(false)
    expect(lakeCellRemaining(lakes, cellX, cellZ)).toBe(0)

    // A neighbouring tile is untouched: the lake drains a cell at a time.
    expect(lakeCellDrained(lakes, cellX + 1, cellZ)).toBe(false)
  })

  it('rolls every tile a capacity from its own coordinates, and only its own', () => {
    // The world stores no terrain, so a tile's depth has to come back the same
    // after the pilot leaves the district and returns. A capacity that
    // re-rolled would refill a tile that had already been half drunk.
    for (let cellX = -40; cellX <= 40; cellX += 1) {
      for (let cellZ = -40; cellZ <= 40; cellZ += 7) {
        const capacity = lakeCellCapacity(cellX, cellZ)
        expect(capacity).toBeGreaterThanOrEqual(LAKE_CELL_CAPACITY_MIN)
        expect(capacity).toBeLessThanOrEqual(LAKE_CELL_CAPACITY_MAX)
        expect(lakeCellCapacity(cellX, cellZ)).toBe(capacity)
      }
    }
    // Actually varied, not a constant wearing a function's clothes.
    const seen = new Set<number>()
    for (let cellX = 0; cellX < 200; cellX += 1) seen.add(lakeCellCapacity(cellX, 11))
    expect(seen.size).toBeGreaterThan(80)
    // The shallowest tile in the world still finishes the water rung alone.
    expect(LAKE_CELL_CAPACITY_MIN).toBeGreaterThanOrEqual(MISSION_TARGETS['absorb-water'])
  })

  it('grows the hull per tile at a rate the city still beats per second', () => {
    // The honest comparison is per second of play, not per tile: a deep tile
    // grows more only because it took longer to drink.
    const cityPerSecond = Math.pow(1 + SIZE_GAIN.pedestrian, 0.8) - 1
    for (const capacity of [LAKE_CELL_CAPACITY_MIN, 400, LAKE_CELL_CAPACITY_MAX]) {
      const gain = capacity * LAKE_DRAIN_SIZE_GAIN_PER_LITRE
      const seconds = capacity / LAKE_ABSORPTION_LITRES_PER_SECOND
      const lakePerSecond = Math.pow(1 + gain, 1 / seconds) - 1
      // Water is a real meal - bigger than a cat, never bigger than the
      // largest tower absorbBeamObject can pay.
      expect(gain).toBeGreaterThan(SIZE_GAIN.cat)
      expect(gain).toBeLessThanOrEqual(0.2)
      // ...but eating the city stays the faster way to grow, at every roll.
      expect(lakePerSecond).toBeLessThan(cityPerSecond)
      expect(lakePerSecond).toBeGreaterThan(cityPerSecond * 0.5)
    }
    // The gain a tile actually pays is the one derived from its capacity.
    expect(lakeDrainSizeGain(3, -7)).toBeCloseTo(lakeCellCapacity(3, -7) * LAKE_DRAIN_SIZE_GAIN_PER_LITRE, 10)
  })

  it('prices a lake as a budget rather than a rate', () => {
    // Water pays well per second precisely because it runs out: the most any
    // one tile can ever pay is fixed, however long anyone parks on it.
    expect(LAKE_SCORE_PER_LITRE).toBe(1)
    expect(LAKE_CELL_CAPACITY_MAX * LAKE_SCORE_PER_LITRE).toBe(500)
    expect(LAKE_CELL_CAPACITY_MIN * LAKE_SCORE_PER_LITRE).toBe(300)
    // And the richest lake the world can build stays under the sample rung,
    // so water is a detour worth taking rather than a rung worth skipping.
    expect(LAKE_CELL_CAPACITY_MAX * 4 * LAKE_SCORE_PER_LITRE).toBeLessThan(MISSION_TARGETS['absorb-samples'])
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
