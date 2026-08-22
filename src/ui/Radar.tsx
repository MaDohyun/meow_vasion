import { useEffect, useRef } from 'react'
import { useGame } from '../GameContext'
import { isDroneMine } from '../core/enemies'
import { projectToRadar } from './radarProjection'

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
  mission: '#fff06d',
  checkpoint: '#b7ff63',
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

    const draw = () => {
      frame = requestAnimationFrame(draw)
      const game = runtime.current
      const player = game.drone.position
      const heading = game.drone.heading
      context.clearRect(0, 0, size, size)

      // Nothing on here blinks. An earlier version pulsed the alpha of mines
      // and explosives to mark them out, but on a two-pixel dot a swing between
      // 0.45 and 1.0 twice a second reads as the contact vanishing and coming
      // back - it looked like the radar was leaking objects while the player sat
      // still. A dashboard has to hold still to be read.
      const dot = (x: number, z: number, color: string, radius: number, hollow = false) => {
        const dx = x - player.x
        const dz = z - player.z
        if (Math.hypot(dx, dz) > RADAR_RANGE) return
        const { px, py } = projectToRadar(dx, dz, heading, center, scale)
        if (hollow) {
          // Mines are marked by shape instead: an outline reads as "parked
          // hazard" next to the solid squares of things that are moving.
          context.strokeStyle = color
          context.lineWidth = 1.5
          context.strokeRect(px - radius, py - radius, radius * 2, radius * 2)
          return
        }
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
        // Trucks share the pool but not the warning colour - they are freight,
        // and painting them orange would undo the point of thinning the tankers
        // out in the first place.
        const truck = hazard.kind === 'truck'
        dot(hazard.position.x, hazard.position.z, truck ? COLORS.inert : COLORS.explosive, truck ? 2 : 2.5)
      }
      for (const enemy of game.enemies.slots) {
        if (!enemy.active) continue
        const mine = isDroneMine(enemy)
        dot(
          enemy.position.x,
          enemy.position.z,
          mine ? COLORS.mine : COLORS.hostile,
          enemy.kind === 'boss' ? 4 : enemy.kind === 'drone' ? 2 : 2.5,
          mine,
        )
      }

      const missionMarker = game.checkpoint ?? game.missionTarget
      if (missionMarker) {
        const dx = missionMarker.x - player.x
        const dz = missionMarker.z - player.z
        const projected = projectToRadar(dx, dz, heading, center, scale)
        const edge = center - 8
        const offsetX = projected.px - center
        const offsetY = projected.py - center
        const length = Math.hypot(offsetX, offsetY)
        const factor = length > edge ? edge / length : 1
        const px = center + offsetX * factor
        const py = center + offsetY * factor
        const color = game.checkpoint ? COLORS.checkpoint : COLORS.mission
        context.fillStyle = color
        context.strokeStyle = '#fff5c7'
        context.lineWidth = 1
        context.beginPath()
        if (length > edge) {
          const angle = Math.atan2(offsetY, offsetX)
          context.moveTo(px + Math.cos(angle) * 5, py + Math.sin(angle) * 5)
          context.lineTo(px + Math.cos(angle + 2.45) * 4, py + Math.sin(angle + 2.45) * 4)
          context.lineTo(px + Math.cos(angle - 2.45) * 4, py + Math.sin(angle - 2.45) * 4)
          context.closePath()
        } else context.arc(px, py, game.checkpoint ? 4 : 3.5, 0, Math.PI * 2)
        context.fill()
        context.stroke()
      }

      // The craft last, so nothing can cover it.
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
