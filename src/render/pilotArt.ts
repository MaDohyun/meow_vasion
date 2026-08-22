import type { CSSProperties } from 'react'
import type { PilotExpression } from '../core/pilot'

export const PILOT_EXPRESSIONS: PilotExpression[] = [
  'normal', 'blink', 'focus', 'excited',
  'boost', 'surprise', 'sweat', 'scream',
  'glare', 'victory', 'defeat',
]

export const PILOT_ATLAS_COLUMNS = 4
export const PILOT_ATLAS_ROWS = 3
const FRAME_WIDTH = 128
const FRAME_HEIGHT = 96

export const pilotAtlasCanvas = document.createElement('canvas')
pilotAtlasCanvas.width = FRAME_WIDTH * PILOT_ATLAS_COLUMNS
pilotAtlasCanvas.height = FRAME_HEIGHT * PILOT_ATLAS_ROWS
const context = pilotAtlasCanvas.getContext('2d')!

function line(x1: number, y1: number, x2: number, y2: number, width = 6, color = '#123245') {
  context.strokeStyle = color
  context.lineWidth = width
  context.lineCap = 'round'
  context.beginPath()
  context.moveTo(x1, y1)
  context.lineTo(x2, y2)
  context.stroke()
}

function star(cx: number, cy: number, outer: number, inner: number, color: string) {
  context.fillStyle = color
  context.beginPath()
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? outer : inner
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    const x = cx + Math.cos(angle) * r
    const y = cy + Math.sin(angle) * r
    if (i === 0) context.moveTo(x, y)
    else context.lineTo(x, y)
  }
  context.closePath()
  context.fill()
}

/**
 * The pilot is a recon cat-bot, not a human in a helmet - see the "침략할거냥"
 * (Meowvasion) rename. The many game-logic expressions in PilotExpression
 * still drive priority/holding in core/pilot.ts unchanged; here they collapse
 * onto four faces the reference art actually specifies (calm, angry-attack,
 * happy-boost, startled-hit), so every trigger gets one of those four looks
 * instead of needing eleven bespoke drawings.
 */
type Mood = 'neutral' | 'angry' | 'happy' | 'hurt'

function moodFor(expression: PilotExpression): Mood {
  switch (expression) {
    case 'glare':
    case 'focus':
    case 'scream':
      return 'angry'
    case 'boost':
    case 'excited':
    case 'victory':
      return 'happy'
    case 'surprise':
    case 'sweat':
    case 'defeat':
      return 'hurt'
    default:
      return 'neutral'
  }
}

const SHELL = '#69c7bf'
const SHELL_DARK = '#4a9c96'
const SHELL_LIGHT = '#8fe0d8'
const EAR_INNER = '#f2a49a'
const OUTLINE = '#123245'
const VISOR = '#0d2430'
const GLOW = '#8ff0ef'
const GOLD = '#f4c04a'
const NODE = '#e8735a'

function drawHead(mood: Mood) {
  // Ears first, so the head shell's rounded top overlaps their base and only
  // the tips read as "growing out of" the helmet.
  for (const side of [-1, 1] as const) {
    context.fillStyle = SHELL
    context.beginPath()
    context.moveTo(64 + side * 16, 26)
    context.lineTo(64 + side * 46, 0)
    context.lineTo(64 + side * 20, 16)
    context.closePath()
    context.fill()
    context.strokeStyle = OUTLINE
    context.lineWidth = 5
    context.stroke()
    context.fillStyle = EAR_INNER
    context.beginPath()
    context.moveTo(64 + side * 21, 21)
    context.lineTo(64 + side * 38, 6)
    context.lineTo(64 + side * 24, 15)
    context.closePath()
    context.fill()
  }

  // Helmet shell.
  context.fillStyle = SHELL
  context.beginPath()
  context.roundRect(18, 14, 92, 76, 30)
  context.fill()
  context.strokeStyle = OUTLINE
  context.lineWidth = 6
  context.stroke()
  // Shine.
  context.strokeStyle = SHELL_LIGHT
  context.lineWidth = 4
  context.beginPath()
  context.arc(46, 32, 16, Math.PI * 1.1, Math.PI * 1.6)
  context.stroke()

  // Antenna: a thin stalk with a star on top, matching the recon-ship motif.
  line(96, 14, 104, 0, 4, OUTLINE)
  star(104, -2, 7, 3, GOLD)

  // Side module: a small ear-cup with an accent node, echoing the reference
  // card's side detail instead of the old pilot's plain earpiece.
  context.fillStyle = SHELL_DARK
  context.beginPath()
  context.arc(22, 52, 11, 0, Math.PI * 2)
  context.fill()
  context.strokeStyle = OUTLINE
  context.lineWidth = 4
  context.stroke()
  star(22, 52, 6, 2.6, GOLD)
  line(14, 42, 8, 28, 4, OUTLINE)
  context.fillStyle = NODE
  context.beginPath()
  context.arc(8, 25, 6, 0, Math.PI * 2)
  context.fill()
  context.strokeStyle = OUTLINE
  context.lineWidth = 3
  context.stroke()

  // Visor screen.
  context.fillStyle = VISOR
  context.beginPath()
  context.roundRect(35, 34, 58, 44, 17)
  context.fill()
  context.strokeStyle = OUTLINE
  context.lineWidth = 5
  context.stroke()

  drawFace(mood)
}

function drawFace(mood: Mood) {
  context.fillStyle = GLOW
  context.strokeStyle = GLOW
  if (mood === 'neutral') {
    context.fillRect(49, 49, 7, 12)
    context.fillRect(72, 49, 7, 12)
    line(58, 68, 70, 68, 5, GLOW)
  } else if (mood === 'angry') {
    // Slanted claw-mark eyes, an alert V-brow read at this size.
    context.beginPath(); context.moveTo(47, 46); context.lineTo(61, 55); context.lineTo(47, 58); context.closePath(); context.fill()
    context.beginPath(); context.moveTo(81, 46); context.lineTo(67, 55); context.lineTo(81, 58); context.closePath(); context.fill()
    line(58, 70, 64, 66, 5, GLOW)
    line(64, 66, 70, 70, 5, GLOW)
  } else if (mood === 'happy') {
    // Closed, upward "^ ^" eyes and an open cheer of a mouth.
    line(46, 55, 55, 47, 6, GLOW)
    line(55, 47, 64, 55, 6, GLOW)
    line(64, 55, 73, 47, 6, GLOW)
    line(73, 47, 82, 55, 6, GLOW)
    context.lineWidth = 5
    context.beginPath()
    context.arc(64, 60, 13, 0.15, Math.PI - 0.15)
    context.stroke()
  } else {
    // Wide, startled eyes and a small round "o" of a mouth.
    context.beginPath(); context.arc(53, 53, 8, 0, Math.PI * 2); context.fill()
    context.beginPath(); context.arc(75, 53, 8, 0, Math.PI * 2); context.fill()
    context.beginPath(); context.arc(64, 71, 6, 0, Math.PI * 2); context.fill()
  }
}

function drawFrame(expression: PilotExpression, index: number) {
  const originX = (index % PILOT_ATLAS_COLUMNS) * FRAME_WIDTH
  const originY = Math.floor(index / PILOT_ATLAS_COLUMNS) * FRAME_HEIGHT
  context.save()
  context.translate(originX, originY)
  context.fillStyle = '#0f2436'
  context.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT)
  context.fillStyle = '#1c3a4d'
  for (let x = 4; x < FRAME_WIDTH; x += 16) context.fillRect(x, 7, 7, 3)

  const mood = moodFor(expression)
  drawHead(mood)

  if (mood === 'happy') {
    // Motion lines beside the head, the same cue 'boost' always carried.
    line(2, 30, 13, 30, 4, GOLD)
    line(0, 46, 12, 46, 4, GOLD)
    line(4, 63, 15, 63, 4, GOLD)
  } else if (mood === 'hurt') {
    context.fillStyle = GOLD
    context.beginPath()
    context.moveTo(108, 34); context.lineTo(116, 50); context.lineTo(100, 50); context.closePath()
    context.fill()
  }
  context.restore()
}

PILOT_EXPRESSIONS.forEach(drawFrame)
export const pilotAtlasDataUrl = pilotAtlasCanvas.toDataURL('image/png')

export function pilotFrameIndex(expression: PilotExpression) {
  return Math.max(0, PILOT_EXPRESSIONS.indexOf(expression))
}

export function pilotFrameStyle(expression: PilotExpression): CSSProperties {
  const index = pilotFrameIndex(expression)
  const column = index % PILOT_ATLAS_COLUMNS
  const row = Math.floor(index / PILOT_ATLAS_COLUMNS)
  return {
    backgroundImage: `url(${pilotAtlasDataUrl})`,
    backgroundSize: `${PILOT_ATLAS_COLUMNS * 100}% ${PILOT_ATLAS_ROWS * 100}%`,
    backgroundPosition: `${column / (PILOT_ATLAS_COLUMNS - 1) * 100}% ${row / (PILOT_ATLAS_ROWS - 1) * 100}%`,
  }
}
