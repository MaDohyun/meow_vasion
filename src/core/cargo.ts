export type CargoState = {
  id: number
  stability: number
  recovered: boolean
}

export type StabilityForces = {
  horizontalAcceleration: number
  angularVelocity: number
  tiltDegrees: number
  verticalAccelerationSpike: number
  calm: boolean
  multiplier?: number
}

export const MAX_BASE_CARGO = 6
export const IMPULSE_PER_BOX = 3.5

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export function createCargo(count: number, startId = 0): CargoState[] {
  return Array.from({ length: count }, (_, index) => ({
    id: startId + index,
    stability: 1,
    recovered: false,
  }))
}

export function updateCargoStability(
  cargo: readonly CargoState[],
  forces: StabilityForces,
  dt: number,
  recoveryRate = 0.6,
): { cargo: CargoState[]; detached: CargoState[] } {
  const d = Math.min(0.05, Math.max(0, dt))
  const multiplier = forces.multiplier ?? 1
  const next = cargo.map((box, layer) => {
    const drain = (
      Math.abs(forces.horizontalAcceleration) * 0.045 +
      Math.abs(forces.angularVelocity) * 0.03 +
      Math.max(0, forces.tiltDegrees - 12) * 0.02 +
      Math.abs(forces.verticalAccelerationSpike) * 0.035
    ) * d * (1 + layer * 0.35) * multiplier
    const recovery = forces.calm ? recoveryRate * d : 0
    return { ...box, stability: clamp01(box.stability - drain + recovery) }
  })
  const firstFailed = next.findIndex((box) => box.stability <= 0)
  if (firstFailed < 0) return { cargo: next, detached: [] }
  return {
    cargo: next.slice(0, firstFailed),
    detached: next.slice(firstFailed),
  }
}

export function detachFromImpact(
  cargo: readonly CargoState[],
  impulse: number,
  magneticReduction = 0,
): { cargo: CargoState[]; detached: CargoState[] } {
  if (cargo.length === 0 || impulse <= 0.75) return { cargo: [...cargo], detached: [] }
  const raw = Math.max(1, Math.floor(impulse / IMPULSE_PER_BOX))
  const count = Math.min(cargo.length, Math.max(0, raw - magneticReduction))
  if (count === 0) return { cargo: [...cargo], detached: [] }
  return {
    cargo: cargo.slice(0, cargo.length - count),
    detached: cargo.slice(cargo.length - count),
  }
}

export function cargoGrade(droppedEver: boolean, brokenCount: number) {
  if (brokenCount > 0) return 'ROUGH' as const
  if (droppedEver) return 'GOOD' as const
  return 'PERFECT' as const
}
