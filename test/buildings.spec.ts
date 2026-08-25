import { describe, expect, it } from 'vitest'
import {
  buildingBulk,
  buildingMass,
  createActiveWorld,
  getProceduralCell,
  updateActiveWorld,
  type ProceduralBuilding,
} from '../src/core/world'
import { NEWS_TOWER_MIN_HEIGHT, buildingNeonSignLayout, canAbsorbBuilding, hasBuildingNeonSign, isNewsTower, isSpecialBuilding } from '../src/core/cityLandmarks'
import { RUIN_BEAM_MASS, createBuildingRuin, ruinBulk } from '../src/core/buildings'
import { beamLiftScale, isAbsorbable } from '../src/core/beam'
import { BEAM_STRENGTH_MAX, SIZE_MATURE, SIZE_START, sizeProfile, ufoDiameter } from '../src/core/size'

const canEat = (building: ProceduralBuilding, strength: number) =>
  canAbsorbBuilding(building, strength)

function everyBuilding() {
  const buildings: ProceduralBuilding[] = []
  for (let cellX = -12; cellX <= 12; cellX += 1) {
    for (let cellZ = -12; cellZ <= 12; cellZ += 1) {
      const cell = getProceduralCell(cellX, cellZ)
      if (cell.building) buildings.push(cell.building)
    }
  }
  return buildings
}

describe('eating buildings', () => {
  it('puts deterministic neon signs only on a random subset of ordinary buildings', () => {
    const buildings = everyBuilding()
    const ordinary = buildings.filter((building) => !isSpecialBuilding(building))
    const special = buildings.filter(isSpecialBuilding)
    const signed = ordinary.filter(hasBuildingNeonSign)

    expect(ordinary.length).toBeGreaterThan(0)
    expect(special.length).toBeGreaterThan(0)
    expect(signed.length).toBeGreaterThan(0)
    expect(signed.length).toBeLessThan(ordinary.length)
    expect(signed.length / ordinary.length).toBeGreaterThan(0.64)
    expect(signed.length / ordinary.length).toBeLessThan(0.76)
    expect(special.some(hasBuildingNeonSign)).toBe(false)
    expect(new Set(signed.map(buildingNeonSignLayout))).toEqual(new Set(['horizontal', 'vertical']))
    expect(special.some((building) => buildingNeonSignLayout(building) !== null)).toBe(false)
    const decisions = new Map(buildings.map((building) => [building.id, hasBuildingNeonSign(building)]))
    for (const building of everyBuilding()) expect(hasBuildingNeonSign(building)).toBe(decisions.get(building.id))
  })

  it('maps the four existing height bands to weights 8 through 11', () => {
    const buildings = everyBuilding()
    const masses = buildings.map(buildingMass).sort((a, b) => a - b)
    const lightest = masses[0]!
    const heaviest = masses[masses.length - 1]!
    expect(lightest).toBe(8)
    expect(heaviest).toBe(11)
    // And taller always means heavier.
    const short = buildings.reduce((a, b) => (a.size.y < b.size.y ? a : b))
    const tall = buildings.reduce((a, b) => (a.size.y > b.size.y ? a : b))
    expect(buildingMass(tall)).toBeGreaterThan(buildingMass(short))
  })

  it('opens buildings by integer strength, low-rise first and towers last', () => {
    const buildings = everyBuilding().filter((building) => !isNewsTower(building))
    const short = buildings.reduce((a, b) => (a.size.y < b.size.y ? a : b))
    const tall = buildings.reduce((a, b) => (a.size.y > b.size.y ? a : b))

    expect(buildings.some((building) => canEat(building, 1))).toBe(false)
    // The whole ladder lives on size now: the lightest block opens partway up
    // the 1..12 rungs, the tallest near the top of it - no card required.
    expect(canEat(short, buildingMass(short) - 2)).toBe(false)
    expect(canEat(short, buildingMass(short) - 1)).toBe(true)
    expect(canEat(tall, buildingMass(tall) - 2)).toBe(false)
    expect(canEat(tall, buildingMass(tall) - 1)).toBe(true)
    expect(canEat(tall, BEAM_STRENGTH_MAX)).toBe(true)
    expect(buildingMass(short)).toBeLessThan(buildingMass(tall))
  })

  it('charges a news tower by its height like any other block', () => {
    // It used to be the one building the beam could never take, which made
    // the rule about what a building is rather than what it weighs. Height
    // charges for it instead: a news tower is at least NEWS_TOWER_MIN_HEIGHT
    // tall, so it is always at the top of the city ladder.
    const towers = everyBuilding().filter(isNewsTower)
    expect(towers.length).toBeGreaterThan(0)
    for (const tower of towers) {
      expect(tower.size.y).toBeGreaterThanOrEqual(NEWS_TOWER_MIN_HEIGHT)
      expect(buildingMass(tower)).toBeGreaterThanOrEqual(10)
      expect(canEat(tower, buildingMass(tower) - 2), tower.id).toBe(false)
      expect(canEat(tower, buildingMass(tower) - 1), tower.id).toBe(true)
    }
  })

  it('prices rubble under the block it came from', () => {
    // Clearing a lot the player emptied themselves is tidying, not a second
    // demolition: what is left after a building comes down has to be liftable
    // long before the building was.
    const buildings = everyBuilding()
    const ruins = buildings.map(createBuildingRuin)
    for (const [index, ruin] of ruins.entries()) {
      expect(RUIN_BEAM_MASS).toBeLessThan(buildingMass(buildings[index]!))
      // Ninety percent of the footprint, and never taller than four metres -
      // which is why ruinBulk measures width alone.
      expect(ruinBulk(ruin)).toBeCloseTo(Math.max(buildings[index]!.size.x, buildings[index]!.size.z) * 0.9)
      expect(ruin.size.y).toBeLessThan(4)
    }
    // Both gates, against real craft: the opening saucer can neither shift a
    // pile nor fit one through itself, and both open around a fifth of the way
    // up the run.
    const widest = ruins.reduce((left, right) => (ruinBulk(left) > ruinBulk(right) ? left : right))
    const clears = (size: number) =>
      beamLiftScale(RUIN_BEAM_MASS, sizeProfile(size).beamStrength) > 0
      && isAbsorbable('ruin', ruinBulk(widest), ufoDiameter(size))
    expect(clears(SIZE_START)).toBe(false)
    expect(clears(SIZE_START + (SIZE_MATURE - SIZE_START) * 0.3)).toBe(true)
  })

  it('keeps an eaten building gone as the city streams', () => {
    // Seeing a block you swallowed still standing on the way back would undo
    // the whole act.
    const start = { x: 0, z: 0 }
    const world = createActiveWorld(start)
    const victim = world.buildings[0]!
    const eaten = new Set([victim.id])

    const rebuilt = updateActiveWorld(world, start, true, eaten)
    expect(rebuilt.buildings.some((building) => building.id === victim.id)).toBe(false)
    expect(rebuilt.distantBuildings.some((building) => building.id === victim.id)).toBe(false)

    // Fly a long way off and come back.
    const away = updateActiveWorld(rebuilt, { x: 900, z: 900 }, true, eaten)
    const back = updateActiveWorld(away, start, true, eaten)
    expect(back.buildings.some((building) => building.id === victim.id)).toBe(false)
    // The rest of the city is still there.
    expect(back.buildings.length).toBeGreaterThan(20)
  })

  it('measures a tower as bulkier than a shop of the same plan', () => {
    const shop = { size: { x: 20, y: 8, z: 20 } } as ProceduralBuilding
    const tower = { size: { x: 20, y: 80, z: 20 } } as ProceduralBuilding
    expect(buildingBulk(tower)).toBeGreaterThan(buildingBulk(shop))
    // But height counts at a discount: a tower is tall, not genuinely bulky.
    expect(buildingBulk(tower)).toBeLessThan(tower.size.y)
  })
})
