import { describe, expect, it } from 'vitest'
import { beamLiftScale } from '../src/core/beam'
import { WORLD_PROP_MASS, parkTreesAround, trashBinsAround, utilityPolesAround, worldPropsAround } from '../src/core/worldProps'
import { createActiveWorld, WORLD_CELL_SIZE } from '../src/core/world'

describe('beam-capable city dressing', () => {
  it('keeps the requested weight ladder', () => {
    expect(WORLD_PROP_MASS['rooftop-structure']).toBe(5)
    expect(WORLD_PROP_MASS.tree).toBe(4)
    expect(WORLD_PROP_MASS['utility-pole']).toBe(3)
    expect(WORLD_PROP_MASS['power-pylon']).toBe(6)
    expect(WORLD_PROP_MASS.communications).toBe(11)
    // A medium craft can lift the roof kit while the heavier host building
    // remains in place, which is the intended separate-object behaviour.
    expect(beamLiftScale(WORLD_PROP_MASS['rooftop-structure'], 5)).toBeGreaterThan(0)
    expect(beamLiftScale(8, 5)).toBe(0)
  })

  it('reuses deterministic park transforms for the beam and render pools', () => {
    const first = parkTreesAround({ x: 0, z: 0 })
    const second = parkTreesAround({ x: 0, z: 0 })
    expect(first.length).toBeGreaterThan(0)
    expect(first.map((tree) => tree.id)).toEqual(second.map((tree) => tree.id))
    expect(first.every((tree) => tree.kind === 'tree' && tree.height > 0 && tree.crown > 0)).toBe(true)
  })

  it('places sparse kerbside trash bins off the carriageway at weight two', () => {
    expect(WORLD_PROP_MASS['trash-bin']).toBe(2)
    const bins = trashBinsAround({ x: 0, z: 0 })
    const again = trashBinsAround({ x: 0, z: 0 })
    expect(bins.length).toBeGreaterThan(0)
    expect(bins.map((bin) => bin.id)).toEqual(again.map((bin) => bin.id))
    // Rarer than the street lamps, and never on the road strip itself: every
    // bin sits behind the lamp line (4.6m) against the building fronts.
    expect(bins.length).toBeLessThan(utilityPolesAround({ x: 0, z: 0 }).length)
    for (const bin of bins) {
      const offsetX = ((bin.position.x % WORLD_CELL_SIZE) + WORLD_CELL_SIZE) % WORLD_CELL_SIZE
      const offsetZ = ((bin.position.z % WORLD_CELL_SIZE) + WORLD_CELL_SIZE) % WORLD_CELL_SIZE
      expect(Math.min(offsetX, offsetZ)).toBeGreaterThan(4.6)
    }
    const props = worldPropsAround(createActiveWorld({ x: 0, z: 0 }), { x: 0, z: 0 })
    expect(props.some((prop) => prop.kind === 'trash-bin')).toBe(true)
  })

  it('includes rooftop props separately from their host buildings', () => {
    const world = createActiveWorld({ x: 0, z: 0 })
    const props = worldPropsAround(world, { x: 0, z: 0 })
    const roof = props.find((prop) => prop.kind === 'rooftop-structure')
    expect(roof).toBeDefined()
    expect(roof?.buildingId).toMatch(/^building:/)
    expect(roof?.id).toMatch(/^roof:building:/)
  })
})
