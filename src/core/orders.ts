import type { Vec3 } from './drone'

export type DeliveryPoint = {
  id: string
  name: string
  position: Vec3
  color: string
}

export type Order = {
  id: number
  pickup: DeliveryPoint
  destination: DeliveryPoint
  cargoCount: number
  timeLimit: number
  seed: number
}

export const PICKUPS: DeliveryPoint[] = [
  { id: 'ramen', name: 'RAMEN LAB', position: { x: -45, y: 1.4, z: -58 }, color: '#ff4c7c' },
  { id: 'market', name: 'MINI MART', position: { x: 47, y: 1.4, z: 58 }, color: '#4ce8ff' },
  { id: 'izakaya', name: 'IZAKAYA 8', position: { x: -22, y: 15.2, z: 60 }, color: '#ffc84c' },
]

export const DESTINATIONS: DeliveryPoint[] = [
  { id: 'loft', name: 'ROOFTOP LOFT', position: { x: 68, y: 27, z: -58 }, color: '#8cff66' },
  { id: 'arcade', name: 'ARCADE', position: { x: 22, y: 17, z: -62 }, color: '#c96cff' },
  { id: 'station', name: 'STATION', position: { x: 0, y: 1.4, z: -86 }, color: '#49d9ff' },
  { id: 'clinic', name: 'CLINIC', position: { x: -70, y: 19.5, z: 2 }, color: '#ff6688' },
  { id: 'studio', name: 'STUDIO', position: { x: -22, y: 15.5, z: 60 }, color: '#ffdc55' },
  { id: 'garden', name: 'SKY GARDEN', position: { x: 70, y: 35.5, z: 58 }, color: '#69ef9b' },
]

export function mulberry32(seed: number) {
  return () => {
    let t = seed += 0x6d2b79f5
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function generateOrder(seed: number, level: number): Order {
  const random = mulberry32(seed)
  const pickup = PICKUPS[Math.floor(random() * PICKUPS.length)] ?? PICKUPS[0]!
  let destination = DESTINATIONS[Math.floor(random() * DESTINATIONS.length)] ?? DESTINATIONS[0]!
  if (Math.hypot(destination.position.x - pickup.position.x, destination.position.z - pickup.position.z) < 50) {
    destination = DESTINATIONS[(DESTINATIONS.indexOf(destination) + 2) % DESTINATIONS.length] ?? DESTINATIONS[0]!
  }
  const cargoCount = Math.min(6, 2 + Math.floor(level / 2) + Math.floor(random() * 2))
  const distance = Math.hypot(
    destination.position.x - pickup.position.x,
    destination.position.z - pickup.position.z,
  )
  const timeLimit = Math.max(24, Math.round(distance / 5.2 + 15 - level * 0.8))
  return { id: seed, pickup, destination, cargoCount, timeLimit, seed }
}

export function distanceToPoint(position: Vec3, point: DeliveryPoint) {
  return Math.hypot(
    position.x - point.position.x,
    position.y - point.position.y,
    position.z - point.position.z,
  )
}
