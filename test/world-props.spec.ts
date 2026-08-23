import { describe, expect, it } from 'vitest'
import { beamLiftScale } from '../src/core/beam'
import { busStopAnchor } from '../src/core/cityLandmarks'
import {
  busStopsAround,
  isWorldPropCarried,
  PARK_BENCH_CLEARANCE,
  PARK_TREE_SPACING,
  TREE_VARIANT_ROUND,
  TREE_VARIANT_SLENDER,
  WORLD_PROP_MASS,
  parkBenchesAround,
  parkTreesAround,
  trashBinsAround,
  utilityPolesAround,
  worldPropMass,
  worldPropsAround,
} from '../src/core/worldProps'
import { BUILDING_PODIUM_SPREAD, createActiveWorld, getProceduralCell, WORLD_CELL_SIZE, worldCellCoord } from '../src/core/world'

/** Distance from a ground point to the building's rendered ground footprint
 *  (podium bulge included); zero when the point is inside it. */
function buildingFootprintDistance(x: number, z: number) {
  const cell = getProceduralCell(worldCellCoord(x), worldCellCoord(z))
  const building = cell.building
  if (!building) return Number.POSITIVE_INFINITY
  const bulge = building.form === 'podium' ? BUILDING_PODIUM_SPREAD : 1
  const dx = Math.abs(x - building.position.x) - (building.size.x / 2) * bulge
  const dz = Math.abs(z - building.position.z) - (building.size.z / 2) * bulge
  return Math.max(dx, dz)
}

describe('beam-capable city dressing', () => {
  it('keeps the requested weight ladder', () => {
    expect(WORLD_PROP_MASS['rooftop-structure']).toBe(5)
    expect(WORLD_PROP_MASS.tree).toBe(3)
    expect(WORLD_PROP_MASS['park-bench']).toBe(3)
    expect(WORLD_PROP_MASS['bus-stop']).toBe(5)
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

  it('chooses exactly one round or slender tree per spawn point at even odds', () => {
    const trees = parkTreesAround({ x: 0, z: 0 }, 40)
    const ids = new Set(trees.map((tree) => tree.id))
    const positions = new Set(trees.map((tree) => `${tree.position.x.toFixed(6)}:${tree.position.z.toFixed(6)}`))
    const round = trees.filter((tree) => tree.variant === TREE_VARIANT_ROUND).length
    const slender = trees.filter((tree) => tree.variant === TREE_VARIANT_SLENDER).length

    expect(ids.size).toBe(trees.length)
    expect(positions.size).toBe(trees.length)
    expect(new Set(trees.map((tree) => tree.variant))).toEqual(new Set([TREE_VARIANT_ROUND, TREE_VARIANT_SLENDER]))
    expect(round / trees.length).toBeGreaterThan(0.45)
    expect(slender / trees.length).toBeGreaterThan(0.45)
    for (const variant of [TREE_VARIANT_ROUND, TREE_VARIANT_SLENDER]) {
      const tree = trees.find((candidate) => candidate.variant === variant)
      expect(tree).toBeDefined()
      expect(worldPropMass(tree!)).toBe(3)
    }
  })

  it('spaces park trees off each other and off the cell bench', () => {
    // Three trees rolled independently around one small ring used to land on
    // the same spot, or on the fixed-offset bench, which read as a prop
    // spawning twice.
    const trees = parkTreesAround({ x: 0, z: 0 }, 12)
    const benches = parkBenchesAround({ x: 0, z: 0 }, 12)
    expect(trees.length).toBeGreaterThan(20)
    for (const bench of benches) {
      for (const tree of trees.filter((candidate) => candidate.id.startsWith(bench.id.replace('park-bench:', 'tree:park:')))) {
        expect(Math.hypot(tree.position.x - bench.position.x, tree.position.z - bench.position.z))
          .toBeGreaterThanOrEqual(PARK_BENCH_CLEARANCE)
      }
    }
    for (const tree of trees) {
      const cellKey = tree.id.slice(0, tree.id.lastIndexOf(':'))
      for (const other of trees) {
        if (other === tree || !other.id.startsWith(`${cellKey}:`)) continue
        expect(Math.hypot(tree.position.x - other.position.x, tree.position.z - other.position.z))
          .toBeGreaterThanOrEqual(PARK_TREE_SPACING)
      }
    }
  })

  it('registers park benches and bus stops as deterministic beam props', () => {
    const world = createActiveWorld({ x: 0, z: 0 })
    const benches = parkBenchesAround({ x: 0, z: 0 })
    const stops = busStopsAround(world)
    const props = worldPropsAround(world, { x: 0, z: 0 })

    expect(benches.length).toBeGreaterThan(0)
    expect(stops.length).toBeGreaterThan(0)
    expect(parkBenchesAround({ x: 0, z: 0 }).map((bench) => bench.id)).toEqual(benches.map((bench) => bench.id))
    expect(busStopsAround(world).map((stop) => stop.id)).toEqual(stops.map((stop) => stop.id))
    expect(benches.every((bench) => bench.kind === 'park-bench' && worldPropMass(bench) === 3)).toBe(true)
    expect(stops.every((stop) => stop.kind === 'bus-stop' && worldPropMass(stop) === 5)).toBe(true)
    expect(props.some((prop) => prop.kind === 'park-bench')).toBe(true)
    expect(props.some((prop) => prop.kind === 'bus-stop')).toBe(true)
  })

  it('hands a world prop from the static pool to the lifted pool only while actually lifted', () => {
    const object = { active: true, tether: 0, absorbing: false }
    expect(isWorldPropCarried(object)).toBe(false)
    // Merely touching the beam is not carrying: a prop too heavy for the
    // craft's current grip sits still with tether at 0 the whole time it is
    // inside the cone, and must stay on the (correctly lit) static pool
    // rather than flip to the lifted pool's unlit copy at the same spot.
    expect(isWorldPropCarried({ ...object, tether: 0.5 })).toBe(true)
    expect(isWorldPropCarried({ ...object, absorbing: true })).toBe(true)
    expect(isWorldPropCarried({ ...object, active: false, absorbing: true })).toBe(false)
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

  it('keeps street furniture out of buildings, shelters and parked cars', () => {
    // Sweep several districts: no lamp or bin may stand inside a building's
    // rendered ground footprint (podium bulge included), a bus shelter, or a
    // kerbside parked car - the overlaps players actually saw.
    for (const centre of [{ x: 0, z: 0 }, { x: 400, z: -300 }, { x: -700, z: 900 }]) {
      const furniture = [...utilityPolesAround(centre, 8), ...trashBinsAround(centre, 8)]
      expect(furniture.length).toBeGreaterThan(0)
      for (const item of furniture) {
        const { x, z } = item.position
        expect(buildingFootprintDistance(x, z)).toBeGreaterThan(0)
        const cell = getProceduralCell(worldCellCoord(x), worldCellCoord(z))
        if (cell.car) {
          expect(Math.hypot(x - cell.car.position.x, z - cell.car.position.z)).toBeGreaterThan(3)
        }
        const stop = cell.building ? busStopAnchor(cell.building) : null
        if (stop) expect(Math.hypot(x - stop.x, z - stop.z)).toBeGreaterThan(4)
      }
    }
  })

  it('keeps every bus shelter on the pavement interior', () => {
    // A shelter pushed past a face close to the road used to land on the
    // carriageway or the lamp line; those anchors are dropped now.
    for (let cellZ = -20; cellZ <= 20; cellZ += 1) {
      for (let cellX = -20; cellX <= 20; cellX += 1) {
        const building = getProceduralCell(cellX, cellZ).building
        if (!building) continue
        const stop = busStopAnchor(building)
        if (!stop) continue
        const localX = stop.x - cellX * WORLD_CELL_SIZE
        const localZ = stop.z - cellZ * WORLD_CELL_SIZE
        expect(localX).toBeGreaterThanOrEqual(6)
        expect(localX).toBeLessThanOrEqual(WORLD_CELL_SIZE - 6)
        expect(localZ).toBeGreaterThanOrEqual(6)
        expect(localZ).toBeLessThanOrEqual(WORLD_CELL_SIZE - 6)
      }
    }
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
