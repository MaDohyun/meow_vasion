import type { Vec3 } from './drone'

export function fighterOrbitPosition(player: Vec3, elapsed: number, index: number): Vec3 {
  const angle = elapsed * (0.55 + index * 0.07) + index * 2.25
  const radius = 12 + index * 3.5
  return {
    x: player.x + Math.sin(angle) * radius,
    y: Math.min(128, player.y + 4.5 + index * 1.1 + Math.sin(angle * 1.7)),
    z: player.z + Math.cos(angle) * radius,
  }
}
