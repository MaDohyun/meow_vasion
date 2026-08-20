import { useEffect, useRef } from 'react'
import { useGame } from '../GameContext'
import { isDroneMine } from '../core/enemies'

/**
 * Local contact radar.
 *
 * Drawn to a canvas from an animation frame rather than rendered as React
 * elements: there are dozens of contacts moving every frame, and re-rendering
 * that many nodes at speed costs far more than painting them.
 *
 * Colour carries the meaning, and the three groups map to the three decisions
 * the player is making at any moment:
 *
 *   green  - living. Absorb these; this is the score.
 *   amber  - inert. Cars and the like cannot be absorbed, so beaming one only
 *            hangs weight off the craft. Caution, not danger.
 *   orange - explosive. Inert too, but it detonates if it reaches you, so it
 *            sits between "junk" and "threat" and is drawn that way, pulsing.
 *   red    - hostile.
 *
 * Oriented to the craft's heading rather than north. The question being asked
 * is "what is in front of me", and a north-up radar makes the player do the
 * rotation in their head while flying.
 */

const RADAR_RANGE = 170
const COLORS = {
  living: '#7cf08a',
  inert: '#ffcf5c',
  explosive: '#ff8a3d',
  hostile: '#ff4d6d',
  mine: '#ff2f5a',
}

export function Radar() {
  const { runtime, t } = useGame()
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const context = element.getContext('2d')
    if (!context) return
    const size = element.width
    const center = size / 2
    const scale = center / RADAR_RANGE
    let frame = 0

    const plot = (x: number, z: number, sin: number, cos: number) => {
      // Rotate into craft space so forward is up.
      const rx = x * cos - z * sin
      const rz = x * sin + z * cos
      return { px: center + rx * scale, py: center - rz * scale }
    }

    const draw = () => {
      frame = requestAnimationFrame(draw)
      const game = runtime.current
      const player = game.drone.position
      const heading = game.drone.heading
      const sin = Math.sin(-heading)
      const cos = Math.cos(-heading)
      context.clearRect(0, 0, size, size)

      const pulse = 0.45 + 0.55 * Math.abs(Math.sin(performance.now() * 0.006))
      const dot = (x: number, z: number, color: string, radius: number, alpha = 1) => {
        const dx = x - player.x
        const dz = z - player.z
        if (Math.hypot(dx, dz) > RADAR_RANGE) return
        const { px, py } = plot(dx, dz, sin, cos)
        context.globalAlpha = alpha
        context.fillStyle = color
        context.fillRect(px - radius, py - radius, radius * 2, radius * 2)
      }

      for (const object of game.crowds.objects) {
        if (!object.active) continue
        dot(object.position.x, object.position.z, COLORS.living, object.kind === 'cat' ? 1.5 : 2)
      }
      for (const car of game.traffic.cars) {
        if (!car.active) continue
        dot(car.position.x, car.position.z, COLORS.inert, 2)
      }
      for (const object of game.beamObjects) {
        if (!object.active) continue
        dot(object.position.x, object.position.z, COLORS.inert, 2)
      }
      for (const hazard of game.hazards.objects) {
        if (!hazard.active) continue
        dot(hazard.position.x, hazard.position.z, COLORS.explosive, 2.5, pulse)
      }
      for (const enemy of game.enemies.slots) {
        if (!enemy.active) continue
        const mine = isDroneMine(enemy)
        dot(
          enemy.position.x,
          enemy.position.z,
          mine ? COLORS.mine : COLORS.hostile,
          enemy.kind === 'boss' ? 4 : enemy.kind === 'drone' ? 2 : 2.5,
          mine ? pulse : 1,
        )
      }

      // The craft last, so nothing can cover it.
      context.globalAlpha = 1
      context.fillStyle = '#ffffff'
      context.beginPath()
      context.moveTo(center, center - 5)
      context.lineTo(center - 3.5, center + 4)
      context.lineTo(center + 3.5, center + 4)
      context.closePath()
      context.fill()
    }

    frame = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(frame)
  }, [runtime])

  return (
    <div className="planet-radar">
      <div className="radar-orbit" />
      <canvas ref={canvas} width={112} height={112} className="radar-canvas" />
      <span className="radar-label">{t.radar}</span>
      <div className="radar-key">
        <i style={{ background: COLORS.living }} />
        <i style={{ background: COLORS.inert }} />
        <i style={{ background: COLORS.explosive }} />
        <i style={{ background: COLORS.hostile }} />
      </div>
    </div>
  )
}
