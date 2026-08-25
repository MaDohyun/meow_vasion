import { useEffect, useRef } from 'react'
import { useGame } from '../GameContext'
import { WORLD_CELL_SIZE, lakeCellsNear, mysteryCirclesNear, type LakeCell, type MysteryCircleSite } from '../core/world'
import { lakeCellDrained } from '../core/lakes'
import { clampToRadarRim, projectToRadar } from './radarProjection'

/**
 * Threat radar.
 *
 * Drawn to a canvas from an animation frame rather than rendered as React
 * elements: contacts move every frame, and re-rendering that many nodes at
 * speed costs far more than painting them.
 *
 * It used to plot every contact in the city - crowds, traffic, loose beam
 * cargo, tankers - in four colours. On a small dial over a populated block
 * that is several hundred dots, and the handful that could actually kill you
 * were buried in them: the radar answered "what is around me" when the only
 * question worth a glance mid-flight is "what is shooting at me". So it plots
 * hostiles, and the two destinations a player cannot find any other way.
 *
 * What is on it, and why each thing earns its pixels:
 *
 * - Hostiles, because they are the only contacts that end a run.
 * - The dreadnought, marked apart from them. It is the one hostile a player
 *   routes around rather than through, it is the size of a city block, and it
 *   orbits further out than the sweep reaches - so as a 5px square in the same
 *   red as a helicopter it was both easy to miss and, half the time, simply
 *   absent. It gets its own shape, its own colour and a place on the rim.
 * - Lakes, because water is a mission objective and a trap in the same tile.
 *   From above the rooftops a lake reads as one more dark block, so the dial
 *   is the only place a player can route to one on purpose - and the only
 *   warning that the surface which drags the craft to a crawl is ahead.
 * - Mystery circles, which are painted flat on the ground and cannot be seen
 *   from flight altitude at all. One whose pickup is spent greys rather than
 *   vanishing: what is left there is still a surge, a turbo refill and a full
 *   hull, so "I have had the item off this one" is the fact worth showing, and
 *   dropping it would only send the player back to check.
 * - The objective marker, which during mission one is the circle the arrow
 *   over the hull points at - read off the same runtime field, so the dial and
 *   the arrow can never disagree.
 *
 * Everything the radar dropped is still visible out of the window, in far more
 * detail than a dot could give.
 *
 * Oriented to the craft's heading rather than north, because the question
 * being asked is "what is in front of me" - a north-up dial makes the player
 * do that rotation in their head while flying. The rim carries a north tick so
 * the rotation is still readable when it matters.
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
/** Opacity for a circle this run has already used up. */
const MYSTERY_SPENT_ALPHA = 0.3

const COLORS = {
  hostile: '#ff4d6d',
  mine: '#ff2f5a',
  mission: '#fff06d',
  water: '#2ad0e0',
  // The warm end of the boss bar's own gradient, so the mark on the dial and
  // the health bar overhead are recognisably the same ship. Far enough from
  // both the hostile red and the objective yellow to be told apart at 7px.
  battleship: '#ff8f3d',
}

/** Half-width of the dreadnought diamond, on the dial and out at the rim. */
const BATTLESHIP_MARK = 6

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
    // Reused every frame; the sweeps fill them rather than allocating.
    const circles: MysteryCircleSite[] = []
    const lakes: LakeCell[] = []

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

      // Water first and flat: it is terrain, and everything else has to read
      // on top of it. Each tile is drawn as the projected quad of its own
      // world cell rather than as a rotated square, so neighbouring cells of
      // one lake share exact edges and the cluster paints as a single body of
      // water instead of four tiles with seams between them.
      context.fillStyle = COLORS.water
      context.globalAlpha = 0.85
      for (const cell of lakeCellsNear(player, RADAR_RANGE, lakes)) {
        // A drained tile is no longer somewhere to route to for water, and
        // painting it blue would send the pilot back to a dry basin.
        if (lakeCellDrained(game.lakes, cell.cellX, cell.cellZ)) continue
        const x0 = cell.cellX * WORLD_CELL_SIZE - player.x
        const z0 = cell.cellZ * WORLD_CELL_SIZE - player.z
        const x1 = x0 + WORLD_CELL_SIZE
        const z1 = z0 + WORLD_CELL_SIZE
        const a = projectToRadar(x0, z0, heading, center, scale)
        const b = projectToRadar(x1, z0, heading, center, scale)
        const c = projectToRadar(x1, z1, heading, center, scale)
        const d = projectToRadar(x0, z1, heading, center, scale)
        context.beginPath()
        context.moveTo(a.px, a.py)
        context.lineTo(b.px, b.py)
        context.lineTo(c.px, c.py)
        context.lineTo(d.px, d.py)
        context.closePath()
        context.fill()
      }
      context.globalAlpha = 1

      // Ground landmarks next, so a hostile is never hidden under one.
      if (MYSTERY_ICON?.complete && MYSTERY_ICON.naturalWidth > 0) {
        for (const circle of mysteryCirclesNear(player, RADAR_RANGE, circles)) {
          const { px, py } = projectToRadar(circle.x - player.x, circle.z - player.z, heading, center, scale)
          // Greyed once its pickup is eaten, not merely flown over: a circle
          // still holding its boon is still a destination, visited or not.
          const spent = game.boons.claimed.has(circle.id)
          context.globalAlpha = spent ? MYSTERY_SPENT_ALPHA : 1
          // The art is pale gold and the dial's middle is a pale green, so the
          // icon gets a dark disc to sit on rather than fading into the sweep.
          context.fillStyle = 'rgba(18,26,44,.58)'
          context.beginPath()
          context.arc(px, py, MYSTERY_ICON_SIZE / 2 + 1, 0, Math.PI * 2)
          context.fill()
          context.drawImage(MYSTERY_ICON, px - MYSTERY_ICON_SIZE / 2, py - MYSTERY_ICON_SIZE / 2, MYSTERY_ICON_SIZE, MYSTERY_ICON_SIZE)
        }
        // Left set, the whole rest of the sweep would inherit it.
        context.globalAlpha = 1
      }

      // Hostiles only. Drones and fighters read a touch larger than they did
      // now that nothing crowds them, because a lone 2px dot on an empty dial
      // is easy to miss in the corner of an eye.
      for (const enemy of game.enemies.slots) {
        if (!enemy.active || enemy.kind === 'boss') continue
        // Every drone is a mine, and a mine is the one contact on the sweep
        // that is standing still waiting to be flown into.
        const mine = enemy.kind === 'drone'
        dot(
          enemy.position.x,
          enemy.position.z,
          mine ? COLORS.mine : COLORS.hostile,
          enemy.kind === 'drone' ? 2.5 : 3,
          mine,
        )
      }

      // The dreadnought, over the top of the rest of the sweep. A diamond in
      // a ring: the only rotated mark on a dial of squares, and the ring gives
      // it a size no 3px contact can be confused with. Hollow once it is past
      // the sweep's edge, so "out there, that way" never reads as "here".
      for (const enemy of game.enemies.slots) {
        if (!enemy.active || enemy.kind !== 'boss') continue
        const projected = projectToRadar(
          enemy.position.x - player.x,
          enemy.position.z - player.z,
          heading,
          center,
          scale,
        )
        const { px, py, clamped } = clampToRadarRim(projected.px, projected.py, center, center - 11)
        context.fillStyle = COLORS.battleship
        context.strokeStyle = COLORS.battleship
        context.lineWidth = 1.6
        context.beginPath()
        context.moveTo(px, py - BATTLESHIP_MARK)
        context.lineTo(px + BATTLESHIP_MARK, py)
        context.lineTo(px, py + BATTLESHIP_MARK)
        context.lineTo(px - BATTLESHIP_MARK, py)
        context.closePath()
        if (clamped) context.stroke()
        else {
          context.fill()
          context.strokeStyle = '#fff2d8'
          context.lineWidth = 1
          context.stroke()
        }
        context.strokeStyle = COLORS.battleship
        context.lineWidth = 1.2
        context.globalAlpha = clamped ? 0.55 : 0.9
        context.beginPath()
        context.arc(px, py, BATTLESHIP_MARK + 3.4, 0, Math.PI * 2)
        context.stroke()
        context.globalAlpha = 1
      }

      const missionMarker = game.missionTarget
      if (missionMarker) {
        const dx = missionMarker.x - player.x
        const dz = missionMarker.z - player.z
        const projected = projectToRadar(dx, dz, heading, center, scale)
        const { px, py, angle, clamped } = clampToRadarRim(projected.px, projected.py, center, center - 8)
        context.fillStyle = COLORS.mission
        context.strokeStyle = '#fff5c7'
        context.lineWidth = 1
        context.beginPath()
        if (clamped) {
          context.moveTo(px + Math.cos(angle) * 5, py + Math.sin(angle) * 5)
          context.lineTo(px + Math.cos(angle + 2.45) * 4, py + Math.sin(angle + 2.45) * 4)
          context.lineTo(px + Math.cos(angle - 2.45) * 4, py + Math.sin(angle - 2.45) * 4)
          context.closePath()
        } else context.arc(px, py, 3.5, 0, Math.PI * 2)
        context.fill()
        context.stroke()
      }

      // North, as a tick on the rim. A heading-up dial is the right one to fly
      // by, but it also means the city never sits still on it; one mark that
      // does tells the player which way they have turned without asking them
      // to give up the "ahead is up" reading they are steering with.
      {
        const north = projectToRadar(0, 1, heading, center, scale)
        const angle = Math.atan2(north.py - center, north.px - center)
        const rim = center - 7
        const nx = center + Math.cos(angle) * rim
        const ny = center + Math.sin(angle) * rim
        context.fillStyle = 'rgba(255,245,199,.85)'
        context.beginPath()
        context.arc(nx, ny, 2.6, 0, Math.PI * 2)
        context.fill()
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
    <div className="planet-radar" aria-label={t.radar}>
      <div className="radar-dial">
        <div className="radar-orbit" />
        <canvas ref={canvas} width={148} height={148} className="radar-canvas" />
      </div>
      {/* Four things on the dial, four swatches: what to avoid, the one thing
          to avoid hardest, what to drink, and what to go and fly through. Each
          one is named rather than left as a coloured square to decode, and the
          key sits under the dial rather than over it - the strip it used to
          cover is what is directly behind the craft. */}
      <div className="radar-key">
        <span><i style={{ background: COLORS.hostile }} />{t.radarKeyHostile}</span>
        <span><i className="radar-key-boss" style={{ background: COLORS.battleship }} />{t.radarKeyBoss}</span>
        <span><i style={{ background: COLORS.water }} />{t.radarKeyWater}</span>
        <span><i className="radar-key-mystery" />{t.radarKeyCircle}</span>
      </div>
    </div>
  )
}
