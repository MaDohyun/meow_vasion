export const LAKE_ABSORPTION_LITRES_PER_SECOND = 50
export const LAKE_BEAM_SPEED_SCALE = 0.1

export function stepLakeAbsorption(totalLitres: number, dt: number, beamActive: boolean, overLake: boolean) {
  const active = beamActive && overLake
  return {
    litres: Math.max(0, totalLitres) + (active ? Math.max(0, dt) * LAKE_ABSORPTION_LITRES_PER_SECOND : 0),
    absorbed: active ? Math.max(0, dt) * LAKE_ABSORPTION_LITRES_PER_SECOND : 0,
    speedScale: active ? LAKE_BEAM_SPEED_SCALE : 1,
  }
}
