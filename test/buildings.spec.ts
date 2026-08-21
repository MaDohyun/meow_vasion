import { describe, expect, it } from 'vitest'
import {
  buildingBulk,
  buildingMass,
  createActiveWorld,
  getProceduralCell,
  updateActiveWorld,
  type ProceduralBuilding,
} from '../src/core/world'
import { canAbsorbBuilding, isNewsTower } from '../src/core/cityLandmarks'
import { SIZE_MAX, SIZE_START, ufoDiameter } from '../src/core/size'

const canEat = (building: ProceduralBuilding, size: number) =>
  canAbsorbBuilding(building, ufoDiameter(size))

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
  it('spreads mass between a shop and a tower without snapping the ladder', () => {
    // Straight volume makes a ninety-metre tower tens of thousands of times a
    // seven-metre shop, which ends the ladder rather than extending it. The
    // root flattens that into a handful of rungs, and those rungs are what the
    // back half of a run is reaching for.
    const buildings = everyBuilding()
    const masses = buildings.map(buildingMass).sort((a, b) => a - b)
    const lightest = masses[0]!
    const heaviest = masses[masses.length - 1]!
    expect(heaviest / lightest).toBeGreaterThan(6)
    expect(heaviest / lightest).toBeLessThan(60)
    // And taller always means heavier.
    const short = buildings.reduce((a, b) => (a.size.y < b.size.y ? a : b))
    const tall = buildings.reduce((a, b) => (a.size.y > b.size.y ? a : b))
    expect(buildingMass(tall)).toBeGreaterThan(buildingMass(short))
  })

  it('opens buildings up in order, low-rise first and towers last', () => {
    const buildings = everyBuilding().filter((building) => !isNewsTower(building))
    const short = buildings.reduce((a, b) => (a.size.y < b.size.y ? a : b))
    const tall = buildings.reduce((a, b) => (a.size.y > b.size.y ? a : b))

    // Nothing at all at the starting size: the opening craft is two metres
    // across and a building is twenty.
    expect(buildings.some((building) => canEat(building, SIZE_START))).toBe(false)
    // Everything by the ceiling, or the last rung is unreachable.
    expect(canEat(tall, SIZE_MAX)).toBe(true)
    // And the short one comes first.
    const firstSize = (building: ProceduralBuilding) => {
      for (let size = SIZE_START; size <= SIZE_MAX; size += 0.1) if (canEat(building, size)) return size
      return Infinity
    }
    expect(firstSize(short)).toBeLessThan(firstSize(tall))
    expect(firstSize(short)).toBeGreaterThan(SIZE_MAX * 0.15)
  })

  it('never lets a news tower be eaten', () => {
    // A city you can strip to nothing is a duller one, and the broadcast
    // screens are this game's voice.
    const towers = everyBuilding().filter(isNewsTower)
    expect(towers.length).toBeGreaterThan(0)
    for (const tower of towers) expect(canEat(tower, SIZE_MAX)).toBe(false)
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
