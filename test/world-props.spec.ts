import { describe, expect, it } from 'vitest'
import { beamLiftScale, beamProfile, isAbsorbable } from '../src/core/beam'
import { DRONE_CEILING, SIZE_MAX, SIZE_START, sizeProfile, ufoDiameter } from '../src/core/size'
import { busStopAnchor } from '../src/core/cityLandmarks'
import {
  busStopsAround,
  isWorldPropDisplaced,
  lakeShorePropsAround,
  LAKE_SHORE_PROP_RADIUS_CELLS,
  LANDMARK_RADIUS_CELLS,
  SHORE_ROCK_SINK,
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

/** Lakes are a landmark, not a fixture: walk out until one is in range rather
 *  than pinning a coordinate that a world-gen tweak would invalidate. */
function shoreCentre() {
  for (let step = 0; step < 60; step += 1) {
    const centre = { x: step * WORLD_CELL_SIZE * 3, z: step * WORLD_CELL_SIZE }
    if (lakeShorePropsAround(centre, LAKE_SHORE_PROP_RADIUS_CELLS).length > 0) return centre
  }
  throw new Error('no lake shore found')
}

function findShore() {
  return lakeShorePropsAround(shoreCentre(), LAKE_SHORE_PROP_RADIUS_CELLS)
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
    expect(WORLD_PROP_MASS.subway).toBe(7)
    expect(WORLD_PROP_MASS['shore-rock']).toBe(1)
    expect(WORLD_PROP_MASS['shore-reed']).toBe(1)
    // A medium craft can lift the roof kit while the heavier host building
    // remains in place, which is the intended separate-object behaviour.
    expect(beamLiftScale(WORLD_PROP_MASS['rooftop-structure'], 5)).toBeGreaterThan(0)
    expect(beamLiftScale(8, 5)).toBe(0)
  })

  it('registers subway entrances as weight-seven beam props', () => {
    // A subway cell rolls on roughly one empty cell in twenty, so the search
    // widens until one is in range rather than pinning a magic coordinate.
    let subways: ReturnType<typeof worldPropsAround> = []
    for (let step = 0; step < 40 && subways.length === 0; step += 1) {
      const centre = { x: step * WORLD_CELL_SIZE * 6, z: 0 }
      subways = worldPropsAround(createActiveWorld(centre), centre)
        .filter((prop) => prop.kind === 'subway')
    }
    expect(subways.length).toBeGreaterThan(0)
    expect(worldPropMass(subways[0]!)).toBe(7)
    // On the same ladder as everything else: liftable one strength step under
    // its weight, out of reach below that.
    expect(beamLiftScale(WORLD_PROP_MASS.subway, 6)).toBeGreaterThan(0)
    expect(beamLiftScale(WORLD_PROP_MASS.subway, 5)).toBe(0)
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

  it('leaves a prop on the static pool until it is off its spot', () => {
    const worldProp = parkTreesAround({ x: 0, z: 0 })[0]!
    const home = worldProp.position
    const resting = { active: true, absorbing: false, position: { ...home }, worldProp }

    // Standing where the world put it - including all the time a beam too weak
    // to lift it is playing over it, which never moves it a millimetre.
    expect(isWorldPropDisplaced(resting)).toBe(false)
    expect(isWorldPropDisplaced({ ...resting, position: { ...home, y: home.y + 0.05 } })).toBe(false)

    // Lifted, and - the bug this replaced tether for - still off its spot after
    // the beam lets go. Keying on tether handed a tree that was still falling
    // back to the static pool, which drew it at the spot it was taken from, so
    // it looked like it teleported home mid-drop.
    expect(isWorldPropDisplaced({ ...resting, position: { ...home, y: home.y + 9 } })).toBe(true)
    expect(isWorldPropDisplaced({ ...resting, position: { ...home, x: home.x + 24 } })).toBe(true)
    expect(isWorldPropDisplaced({ ...resting, absorbing: true })).toBe(true)
    expect(isWorldPropDisplaced({ ...resting, active: false, absorbing: true })).toBe(false)

    // Cars and crowds ride the same list and have no spot to be off.
    expect(isWorldPropDisplaced({ active: true, absorbing: false, position: { x: 9, y: 1, z: 9 } })).toBe(false)
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

  it('makes the lakeside boulders and reeds the opening craft\'s first scenery', () => {
    // A pond at weight one is the one place a brand-new saucer can practise
    // the verb on something that is not a body. Both gates have to open at
    // once for that to be true: the weight ladder and the hull.
    const shore = findShore()
    expect(shore.length).toBeGreaterThan(0)
    const opening = sizeProfile(SIZE_START)
    for (const piece of shore) {
      expect(worldPropMass(piece)).toBe(1)
      expect(beamLiftScale(worldPropMass(piece), opening.beamStrength), piece.id).toBeGreaterThan(0)
      expect(isAbsorbable(piece.kind, undefined, ufoDiameter(SIZE_START)), piece.id).toBe(true)
    }
    expect(shore.some((piece) => piece.kind === 'shore-rock')).toBe(true)
    expect(shore.some((piece) => piece.kind === 'shore-reed')).toBe(true)
  })

  it('hands the shore the same transforms to the beam and to both render pools', () => {
    // Two pools draw each piece - the static one where the world put it, the
    // lifted one once the beam has it - so a piece whose id or transform moved
    // between the lists would visibly change shape at the hand-off.
    const centre = shoreCentre()
    const first = lakeShorePropsAround(centre)
    const second = lakeShorePropsAround(centre)
    expect(first.length).toBeGreaterThan(0)
    expect(first).toEqual(second)
    expect(new Set(first.map((piece) => piece.id)).size).toBe(first.length)
    for (const piece of first) {
      // Nothing is left at a default: the generator bakes the whole transform.
      expect(piece.scale.x).toBeGreaterThan(0)
      expect(piece.scale.y).toBeGreaterThan(0)
      expect(piece.scale.z).toBeGreaterThan(0)
      // A boulder is sunk to the waist, a reed clump stands on the mud.
      if (piece.kind === 'shore-rock') expect(piece.position.y).toBeCloseTo(piece.scale.x * SHORE_ROCK_SINK)
      else expect(piece.position.y).toBeCloseTo(0.02)
    }
  })

  it('simulates the shore nearer than it draws it, and never inside the beam', () => {
    // Every piece that becomes a beam object is stepped every frame, and one
    // lake district has hundreds of them. The near list is what the beam can
    // actually reach; the far list is what the eye can see.
    const centre = shoreCentre()
    expect(LAKE_SHORE_PROP_RADIUS_CELLS).toBeLessThan(LANDMARK_RADIUS_CELLS)
    const near = lakeShorePropsAround(centre, LAKE_SHORE_PROP_RADIUS_CELLS)
    const far = lakeShorePropsAround(centre)
    // The near list is always a subset of what is drawn - never a piece the
    // eye cannot see - and a district with lakes at its edge really does hold
    // pieces back.
    const drawn = new Set(far.map((piece) => piece.id))
    for (const piece of near) expect(drawn.has(piece.id), piece.id).toBe(true)
    let held = 0
    for (let step = 0; step < 30; step += 1) {
      const spot = { x: step * WORLD_CELL_SIZE * 2, z: step * WORLD_CELL_SIZE * 5 }
      held += lakeShorePropsAround(spot).length - lakeShorePropsAround(spot, LAKE_SHORE_PROP_RADIUS_CELLS).length
    }
    expect(held).toBeGreaterThan(0)

    // The gap has to sit outside the widest cone the game can produce: the
    // boosted beam at the craft's absolute ceiling, which is the one case
    // where the cone reaches furthest sideways at ground level.
    const profile = beamProfile(true, sizeProfile(SIZE_MAX).beamScale, sizeProfile(SIZE_MAX).beamReach)
    const widest = profile.baseRadius + Math.min(profile.maxDrop, DRONE_CEILING) * profile.coneSpread
    expect(LAKE_SHORE_PROP_RADIUS_CELLS * WORLD_CELL_SIZE).toBeGreaterThan(widest)

    const props = worldPropsAround(createActiveWorld(centre), centre)
    expect(props.filter((prop) => prop.kind === 'shore-rock' || prop.kind === 'shore-reed')).toEqual(near)
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
