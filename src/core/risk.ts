import type { BeamObject } from './beam'
import type { Vec3 } from './drone'
import type { TrafficCar } from './traffic'
import type { ProceduralBuilding } from './world'

export const STARTING_SCORE = 900
export const SCORE_DRAIN_PER_SECOND = 13
export const MISSION_BASE_REWARD = 480
export const ENEMY_BASE_REWARD = 180
export const TARGET_BASE_REWARD = 45

export const WANTED_SCORE_MULTIPLIERS = [1, 1.45, 2.05, 2.85, 4, 5.5] as const

export type DensityCache = {
  buildings: number
  pedestrians: number
  vehicles: number
  normalized: number
  heatMultiplier: number
}

export function createDensityCache(): DensityCache {
  return { buildings: 0, pedestrians: 0, vehicles: 0, normalized: 0, heatMultiplier: 1 }
}

export function wantedScoreMultiplier(wanted: number) {
  const level = Math.max(0, Math.min(5, Math.floor(wanted)))
  return WANTED_SCORE_MULTIPLIERS[level]!
}

export function scoreReward(base: number, wanted: number, chain: number) {
  return Math.round(base * wantedScoreMultiplier(wanted) * Math.max(1, chain))
}

export function drainScore(score: number, seconds: number) {
  return Math.max(0, score - SCORE_DRAIN_PER_SECOND * Math.max(0, seconds))
}

export function updateDensityCache(
  cache: DensityCache,
  player: Vec3,
  buildings: ProceduralBuilding[],
  nearbyPedestrians: number,
  beamObjects: BeamObject[],
  trafficCars: TrafficCar[],
) {
  let buildingCount = 0
  let vehicleCount = 0
  for (const building of buildings) {
    if (Math.hypot(building.position.x - player.x, building.position.z - player.z) <= 82) buildingCount += 1
  }
  for (const object of beamObjects) {
    if (object.active && object.kind === 'car' && Math.hypot(object.position.x - player.x, object.position.z - player.z) <= 52) vehicleCount += 1
  }
  for (const car of trafficCars) {
    if (car.active && Math.hypot(car.position.x - player.x, car.position.z - player.z) <= 52) vehicleCount += 1
  }
  cache.buildings = buildingCount
  cache.pedestrians = nearbyPedestrians
  cache.vehicles = vehicleCount
  cache.normalized = Math.min(1,
    Math.min(1, buildingCount / 12) * 0.55
    + Math.min(1, nearbyPedestrians / 12) * 0.3
    + Math.min(1, vehicleCount / 18) * 0.15,
  )
  cache.heatMultiplier = 1 + cache.normalized * 2.2
  return cache
}
