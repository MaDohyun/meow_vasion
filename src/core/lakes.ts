export const LAKE_ABSORPTION_LITRES_PER_SECOND = 50
// The floor the drag ramps down to at full depth: half speed.
//
// It was 0.2, and on top of that the runtime multiplied the craft's velocity
// by this every frame as well - a per-frame damping, not a speed limit, which
// at sixty hertz pinned the craft to the spot. Pumping water read as the beam
// being broken rather than as water being heavy. The runtime now scales the
// throttle only (one honest top-speed cap), and the floor is the number the
// general quotes: half speed, still flying, still able to leave.
export const LAKE_BEAM_SPEED_SCALE = 0.5
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
