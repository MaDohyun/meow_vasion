export const LAKE_ABSORPTION_LITRES_PER_SECOND = 50
// The floor the drag ramps down to at full depth - 80% slower, a laboured
// crawl, not the near-total stop a flat 0.1 scale read as.
export const LAKE_BEAM_SPEED_SCALE = 0.2
// Metres of shore-to-craft distance before the drag reaches its floor. Short
// enough that a real lake (2-4 cells) has room to reach it away from every
// edge, long enough that stepping just past the shoreline barely slows you.
export const LAKE_SLOWDOWN_RAMP_DISTANCE = 12

export function stepLakeAbsorption(totalLitres: number, dt: number, beamActive: boolean, depthIntoLake: number) {
  const overLake = depthIntoLake > 0
  const active = beamActive && overLake
  const depthFactor = Math.min(1, Math.max(0, depthIntoLake) / LAKE_SLOWDOWN_RAMP_DISTANCE)
  return {
    litres: Math.max(0, totalLitres) + (active ? Math.max(0, dt) * LAKE_ABSORPTION_LITRES_PER_SECOND : 0),
    absorbed: active ? Math.max(0, dt) * LAKE_ABSORPTION_LITRES_PER_SECOND : 0,
    speedScale: active ? 1 - (1 - LAKE_BEAM_SPEED_SCALE) * depthFactor : 1,
    anchored: active,
  }
}
