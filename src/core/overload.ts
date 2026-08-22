export const OVERLOAD_GROUND_HEIGHT = 1.6

/** A crash needs all three conditions; releasing E is always an escape. */
export function shouldCrashFromOverload(
  beamActive: boolean,
  hangingWeight: number,
  liftCapacity: number,
  height: number,
) {
  return beamActive && hangingWeight > liftCapacity && height <= OVERLOAD_GROUND_HEIGHT
}
