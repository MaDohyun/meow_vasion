import { describe, expect, it } from 'vitest'
import { getProceduralCell, type ProceduralBuilding } from '../src/core/world'
import {
  groundLandmarkForCell,
  hasBusStop,
  NEWS_SCREEN_HEIGHT,
  NEWS_SCREEN_MOUNT_MARGIN,
  NEWS_TOWER_MIN_HEIGHT,
  isNewsTower,
  isConvenienceStore,
  newsScreenMount,
  parkingCarsAround,
} from '../src/core/cityLandmarks'

describe('render-only city landmarks', () => {
  it('classifies the same cell and building identically every time', () => {
    for (const [x, z] of [[0, 0], [18, -7], [-43, 26]] as const) {
      const first = getProceduralCell(x, z)
      const second = getProceduralCell(x, z)
      expect(groundLandmarkForCell(first)).toBe(groundLandmarkForCell(second))
      if (first.building && second.building) {
        expect(isConvenienceStore(first.building)).toBe(isConvenienceStore(second.building))
        expect(isNewsTower(first.building)).toBe(isNewsTower(second.building))
        expect(hasBusStop(first.building)).toBe(hasBusStop(second.building))
      }
    }
  })

  it('keeps landmarks scarce while retaining every type, car parks aside', () => {
    const counts = new Map<string, number>()
    let cells = 0
    for (let z = -70; z <= 70; z += 1) {
      for (let x = -70; x <= 70; x += 1) {
        cells += 1
        const landmark = groundLandmarkForCell(getProceduralCell(x, z))
        if (landmark) counts.set(landmark, (counts.get(landmark) ?? 0) + 1)
      }
    }
    for (const kind of ['park', 'subway', 'parking-lot', 'power-pylon']) {
      expect(counts.get(kind) ?? 0).toBeGreaterThan(20)
    }
    // Car parks are the exception, and deliberately so: they are the densest
    // food in the city and at the old rate a whole run could pass without one
    // coming into view. They are still under one cell in forty.
    expect((counts.get('parking-lot') ?? 0) / cells).toBeGreaterThan(0.012)
    expect((counts.get('parking-lot') ?? 0) / cells).toBeLessThan(0.025)
    expect((counts.get('power-pylon') ?? 0) / cells).toBeLessThan(0.008)
  })

  it('attaches bus stops only to occupied building cells', () => {
    let stops = 0
    for (let z = -70; z <= 70; z += 1) {
      for (let x = -70; x <= 70; x += 1) {
        const cell = getProceduralCell(x, z)
        if (!cell.building || !hasBusStop(cell.building)) continue
        stops += 1
        expect(cell.kind).toBe('building')
      }
    }
    expect(stops).toBeGreaterThan(100)
  })

  it('uses only genuinely low and high buildings for the two facade features', () => {
    let stores = 0
    let tall = 0
    let warningScreens = 0
    for (let z = -70; z <= 70; z += 1) {
      for (let x = -70; x <= 70; x += 1) {
        const building = getProceduralCell(x, z).building
        if (!building) continue
        if (isConvenienceStore(building)) {
          stores += 1
          expect(building.size.y).toBeLessThanOrEqual(11.5)
        }
        if (isNewsTower(building)) {
          warningScreens += 1
          expect(building.size.y).toBeGreaterThanOrEqual(NEWS_TOWER_MIN_HEIGHT)
        }
        tall += 1
      }
    }
    expect(stores).toBeGreaterThan(100)
    // News towers are landmarks, so rarity is the property worth pinning. The
    // screen used to go on more than half of every tall building, which put
    // about eight in a single district - at that rate it is street furniture.
    expect(warningScreens).toBeGreaterThan(0)
    expect(warningScreens / tall).toBeLessThan(0.05)
  })

  it('keeps at least three interactive cars in every generated parking lot', () => {
    const extraCars = parkingCarsAround({ x: 0, z: 0 }, 12)
    const lots = new Map<string, number>()
    for (const car of extraCars) {
      const key = `${car.cellX}:${car.cellZ}`
      lots.set(key, (lots.get(key) ?? 0) + 1)
      expect(car.id.startsWith('parking-car:')).toBe(true)
    }
    expect(lots.size).toBeGreaterThan(0)
    for (const count of lots.values()) expect(count).toBeGreaterThanOrEqual(3)
  })
})

describe('news screen mounting', () => {
  const tower = (height: number): ProceduralBuilding => ({
    id: 'b', cellX: 0, cellZ: 0,
    position: { x: 0, y: height / 2, z: 0 },
    size: { x: 20, y: height, z: 20 },
    color: '#ffffff', roof: '#ffffff',
    sign: { text: 'SKY', color: '#ffffff', side: 'z' },
    facade: 0, floors: 1, entrance: 0, form: 'plain',
    roofOverhang: 1, roofThickness: 0.8,
  })

  it('keeps the blank cladding inside the building at every tower height', () => {
    // A band poking through the roof or down into the pavement is a worse
    // artefact than the windows it was added to hide.
    for (let height = NEWS_TOWER_MIN_HEIGHT; height <= 120; height += 1) {
      const mount = newsScreenMount(tower(height))
      expect(mount.centre - mount.height / 2, `${height}m bottom`).toBeGreaterThan(0)
      expect(mount.centre + mount.height / 2, `${height}m top`).toBeLessThan(height)
    }
  })

  it('runs the cladding past the screen so it reads as a mounting', () => {
    // Flush with the screen, the band is invisible and all that shows is that
    // the windows disappeared.
    const mount = newsScreenMount(tower(NEWS_TOWER_MIN_HEIGHT))
    expect(NEWS_SCREEN_MOUNT_MARGIN).toBeGreaterThan(1)
    expect(mount.height).toBe(NEWS_SCREEN_HEIGHT + NEWS_SCREEN_MOUNT_MARGIN * 2)
  })
})
