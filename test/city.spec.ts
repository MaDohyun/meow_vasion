import { describe, expect, it } from 'vitest'
import { BUILDINGS, CITY_COLLIDERS, DISTRICT_OFFSETS, MAP_RADIUS, PULLABLE_CARS } from '../src/render/cityData'

describe('torus city tile', () => {
  it('places nine dense districts inside one reusable world tile', () => {
    expect(DISTRICT_OFFSETS).toHaveLength(9)
    expect(BUILDINGS).toHaveLength(90)
    expect(new Set(BUILDINGS.map((building) => building.id)).size).toBe(90)
    for (const building of BUILDINGS) {
      expect(Math.hypot(building.position.x, building.position.z)).toBeLessThan(MAP_RADIUS)
    }
  })

  it('builds collision geometry for every district', () => {
    expect(CITY_COLLIDERS.length).toBeGreaterThanOrEqual(BUILDINGS.length + DISTRICT_OFFSETS.length * 3)
  })

  it('spawns individually pullable traffic throughout every district', () => {
    expect(PULLABLE_CARS).toHaveLength(DISTRICT_OFFSETS.length * 6)
    expect(new Set(PULLABLE_CARS.map((car) => car.id))).toHaveLength(PULLABLE_CARS.length)
  })
})
