import type { Aabb } from './drone'
import { buildingHeightTier, type BuildingHeightTier, type ProceduralBuilding } from './world'

export const BUILDING_HITS: Record<BuildingHeightTier, number> = {
  low: 4,
  mid: 5,
  high: 6,
  supertall: 7,
}

export type BuildingRuin = {
  id: string
  cellX: number
  cellZ: number
  position: { x: number; y: number; z: number }
  size: { x: number; y: number; z: number }
  tier: BuildingHeightTier
  color: string
}

export function buildingMaxHealth(building: ProceduralBuilding) {
  return BUILDING_HITS[buildingHeightTier(building)]
}

export function damageBuilding(
  health: Map<string, number>,
  building: ProceduralBuilding,
  damage = 1,
) {
  const maximum = buildingMaxHealth(building)
  const before = health.get(building.id) ?? maximum
  const after = Math.max(0, before - Math.max(0, damage))
  health.set(building.id, after)
  return { hit: damage > 0, destroyed: after <= 0, health: after, maxHealth: maximum }
}

export function createBuildingRuin(building: ProceduralBuilding): BuildingRuin {
  const tier = buildingHeightTier(building)
  const height = tier === 'low' ? 2.1 : tier === 'mid' ? 2.7 : tier === 'high' ? 3.3 : 3.9
  return {
    id: building.id,
    cellX: building.cellX,
    cellZ: building.cellZ,
    position: { x: building.position.x, y: height / 2, z: building.position.z },
    size: { x: building.size.x * 0.9, y: height, z: building.size.z * 0.9 },
    tier,
    color: building.color,
  }
}

export function ruinCollider(ruin: BuildingRuin): Aabb {
  return {
    id: `ruin:${ruin.id}`,
    minX: ruin.position.x - ruin.size.x / 2,
    maxX: ruin.position.x + ruin.size.x / 2,
    minY: 0,
    maxY: ruin.size.y,
    minZ: ruin.position.z - ruin.size.z / 2,
    maxZ: ruin.position.z + ruin.size.z / 2,
  }
}
