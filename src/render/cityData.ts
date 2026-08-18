import type { Aabb, Vec3 } from '../core/drone'

export type BuildingModule = {
  id: string
  position: Vec3
  size: Vec3
  color: string
  roof: string
  sign?: { text: string; color: string; side: 'x' | 'z' }
}

export type DistrictOffset = { x: number; z: number }

export type PullableCarSeed = {
  id: string
  position: Vec3
  rotation: number
  color: string
}

export const MAP_RADIUS = 300
export const MAP_HALF_EXTENT = MAP_RADIUS
export const MAP_SIZE = MAP_HALF_EXTENT * 2
export const DISTRICT_OFFSETS: DistrictOffset[] = [
  { x: 0, z: 0 },
  { x: 185, z: 0 },
  { x: 131, z: 131 },
  { x: 0, z: 185 },
  { x: -131, z: 131 },
  { x: -185, z: 0 },
  { x: -131, z: -131 },
  { x: 0, z: -185 },
  { x: 131, z: -131 },
]

const BASE_BUILDINGS: BuildingModule[] = [
  { id: 'b1', position: { x: -68, y: 10, z: -58 }, size: { x: 34, y: 20, z: 38 }, color: '#ef6b68', roof: '#c84864', sign: { text: 'RAMEN', color: '#ffe66b', side: 'z' } },
  { id: 'b2', position: { x: -25, y: 16, z: -60 }, size: { x: 28, y: 32, z: 34 }, color: '#42a6c8', roof: '#267899', sign: { text: 'HOTEL', color: '#ff7bbf', side: 'x' } },
  { id: 'b3', position: { x: 22, y: 8, z: -62 }, size: { x: 30, y: 16, z: 34 }, color: '#f4b34f', roof: '#ce773f', sign: { text: 'ARCADE', color: '#78ffcf', side: 'z' } },
  { id: 'b4', position: { x: 68, y: 13, z: -58 }, size: { x: 34, y: 26, z: 38 }, color: '#9b70cf', roof: '#694aa6', sign: { text: 'CAFE 24', color: '#ffdb5d', side: 'x' } },
  { id: 'b5', position: { x: -68, y: 14, z: 55 }, size: { x: 35, y: 28, z: 36 }, color: '#69bd77', roof: '#44885c', sign: { text: 'MARKET', color: '#ffef74', side: 'x' } },
  { id: 'b6', position: { x: -22, y: 7, z: 60 }, size: { x: 30, y: 14, z: 32 }, color: '#ef8264', roof: '#c84f4b', sign: { text: 'DINER', color: '#72eaff', side: 'z' } },
  { id: 'b7', position: { x: 25, y: 12, z: 60 }, size: { x: 30, y: 24, z: 34 }, color: '#4faabd', roof: '#33738e', sign: { text: 'VIDEO', color: '#ff74a9', side: 'z' } },
  { id: 'b8', position: { x: 70, y: 17, z: 58 }, size: { x: 32, y: 34, z: 38 }, color: '#e6b24d', roof: '#bb733e', sign: { text: 'SKY', color: '#81ffd1', side: 'x' } },
  { id: 'b9', position: { x: -70, y: 9, z: 2 }, size: { x: 30, y: 18, z: 25 }, color: '#d66e94', roof: '#954d83', sign: { text: 'CLINIC', color: '#f6ff7c', side: 'x' } },
  { id: 'b10', position: { x: 70, y: 10, z: 3 }, size: { x: 30, y: 20, z: 25 }, color: '#6bb8d8', roof: '#3d7d9e', sign: { text: 'DEPOT', color: '#ffcf62', side: 'x' } },
]

export const BUILDINGS: BuildingModule[] = DISTRICT_OFFSETS.flatMap((offset, districtIndex) =>
  BASE_BUILDINGS.map((building) => ({
    ...building,
    id: `${building.id}-d${districtIndex}`,
    position: {
      x: building.position.x + offset.x,
      y: building.position.y,
      z: building.position.z + offset.z,
    },
  })),
)

const BASE_PARKED_CARS = [
  { x: -12, z: -34, horizontal: false },
  { x: 12, z: -57, horizontal: false },
  { x: -12, z: 69, horizontal: false },
  { x: -42, z: -12, horizontal: true },
  { x: 31, z: 12, horizontal: true },
  { x: 72, z: 12, horizontal: true },
] as const

const CAR_COLORS = ['#ff5d74', '#62d7ff', '#ffd15d', '#9c75ff'] as const

export const PULLABLE_CARS: PullableCarSeed[] = DISTRICT_OFFSETS.flatMap((offset, districtIndex) =>
  BASE_PARKED_CARS.map((car, carIndex) => ({
    id: `traffic-d${districtIndex}-c${carIndex}`,
    position: { x: car.x + offset.x, y: 0.65, z: car.z + offset.z },
    rotation: car.horizontal ? Math.PI / 2 : 0,
    color: CAR_COLORS[carIndex % CAR_COLORS.length],
  })),
)

const bridgeColliders = DISTRICT_OFFSETS.flatMap((offset): Aabb[] => [
  { minX: offset.x - 9, maxX: offset.x + 9, minY: 3.6, maxY: 4.4, minZ: offset.z - 2, maxZ: offset.z + 2 },
  { minX: offset.x - 9.4, maxX: offset.x - 8.6, minY: 0, maxY: 4, minZ: offset.z - 2, maxZ: offset.z + 2 },
  { minX: offset.x + 8.6, maxX: offset.x + 9.4, minY: 0, maxY: 4, minZ: offset.z - 2, maxZ: offset.z + 2 },
])

export const CITY_COLLIDERS: Aabb[] = [
  ...BUILDINGS.map((building) => ({
    minX: building.position.x - building.size.x / 2,
    maxX: building.position.x + building.size.x / 2,
    minY: 0,
    maxY: building.position.y + building.size.y / 2,
    minZ: building.position.z - building.size.z / 2,
    maxZ: building.position.z + building.size.z / 2,
  })),
  ...bridgeColliders,
]
