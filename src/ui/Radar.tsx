import { useEffect, useRef } from 'react'
import { useGame } from '../GameContext'
import { mysteryCirclesNear, type MysteryCircleSite } from '../core/world'
import { projectToRadar } from './radarProjection'

/**
 * Threat radar.
 *
 * Drawn to a canvas from an animation frame rather than rendered as React
 * elements: contacts move every frame, and re-rendering that many nodes at
 * speed costs far more than painting them.
 *
 * It used to plot every contact in the city - crowds, traffic, loose beam
 * cargo, tankers - in four colours. On a 112px dial over a populated block
 * that is several hundred dots, and the handful that could actually kill you
 * were buried in them: the radar answered "what is around me" when the only
 * question worth a glance mid-flight is "what is shooting at me". So it plots
 * hostiles and nothing else. Everything it dropped is still visible out of
 * the window, in far more detail than a dot could give.
 *
 * Two things that are not contacts also stay. The objective marker is the
 * arrow that says where the mission is, and without it a checkpoint run has no
 * heading at all. Mystery circles are painted on the ground and cannot be seen
 * from above the rooftops at all, so the dial is the only place a player can
 * learn one is nearby - which is the whole point of flying through them.
 *
 * Oriented to the craft's heading rather than north. The question being asked
 * is "what is in front of me", and a north-up radar makes the player do the
 * rotation in their head while flying.
 */

const RADAR_RANGE = 170

/**
 * The circle's own art, at dial size.
 *
 * The same file the ground decals use, so it is already in the browser cache
 * by the time the radar wants it and costs nothing to draw here.
 */
const MYSTERY_ICON = typeof Image === 'undefined' ? null : Object.assign(new Image(), { src: '/landmarks/mystery-circle.png' })
/**
 * Drawn at about twice its true footprint. To scale a circle is eight pixels
 * across, and eight pixels of that fine gold line work is a smudge; at sixteen
 * it is recognisably the thing painted on the ground below.
 */
const MYSTERY_ICON_SIZE = 16

const COLORS = {
  hostile: '#ff4d6d',
  mine: '#ff2f5a',
  mission: '#fff06d',
  checkpoint: '#b7ff63',
}

export function Radar() {
  const { runtime } = useGame()
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
    // Reused every frame; the sweep fills it rather than allocating.
    const circles: MysteryCircleSite[] = []

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

      // Ground first, so a hostile is never hidden under a landmark.
      if (MYSTERY_ICON?.complete && MYSTERY_ICON.naturalWidth > 0) {
        for (const circle of mysteryCirclesNear(player, RADAR_RANGE, circles)) {
          const { px, py } = projectToRadar(circle.x - player.x, circle.z - player.z, heading, center, scale)
          // The art is pale gold and the dial's middle is a pale green, so the
          // icon gets a dark disc to sit on rather than fading into the sweep.
          context.fillStyle = 'rgba(18,26,44,.58)'
          context.beginPath()
          context.arc(px, py, MYSTERY_ICON_SIZE / 2 + 1, 0, Math.PI * 2)
          context.fill()
          context.drawImage(MYSTERY_ICON, px - MYSTERY_ICON_SIZE / 2, py - MYSTERY_ICON_SIZE / 2, MYSTERY_ICON_SIZE, MYSTERY_ICON_SIZE)
        }
      }

      // Hostiles only. Drones and fighters read a touch larger than they did
      // now that nothing crowds them, because a lone 2px dot on an empty dial
      // is easy to miss in the corner of an eye.
      for (const enemy of game.enemies.slots) {
        if (!enemy.active) continue
        // Every drone is a mine, and a mine is the one contact on the sweep
        // that is standing still waiting to be flown into.
        const mine = enemy.kind === 'drone'
        dot(
          enemy.position.x,
          enemy.position.z,
          mine ? COLORS.mine : COLORS.hostile,
          enemy.kind === 'boss' ? 5 : enemy.kind === 'drone' ? 2.5 : 3,
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
      {/* Two things on the dial, two swatches: what to avoid, and what to
          go and fly through. */}
      <div className="radar-key">
        <i style={{ background: COLORS.hostile }} />
        <i className="radar-key-mystery" />
      </div>
    </div>
  )
}
