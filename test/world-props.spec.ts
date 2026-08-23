import { describe, expect, it } from 'vitest'
import { beamLiftScale } from '../src/core/beam'
import { WORLD_PROP_MASS, parkTreesAround, worldPropsAround } from '../src/core/worldProps'
import { createActiveWorld } from '../src/core/world'

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

  it('includes rooftop props separately from their host buildings', () => {
    const world = createActiveWorld({ x: 0, z: 0 })
    const props = worldPropsAround(world, { x: 0, z: 0 })
    const roof = props.find((prop) => prop.kind === 'rooftop-structure')
    expect(roof).toBeDefined()
    expect(roof?.buildingId).toMatch(/^building:/)
    expect(roof?.id).toMatch(/^roof:building:/)
  })
})
