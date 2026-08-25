import { describe, expect, it } from 'vitest'
import { BUILDING_SCORE, buildingDestructionScore, buildingMaxHealth, createBuildingRuin, damageBuilding, ruinCollider } from '../src/core/buildings'
import { LAKE_BEAM_SPEED_SCALE, stepLakeAbsorption } from '../src/core/lakes'
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
