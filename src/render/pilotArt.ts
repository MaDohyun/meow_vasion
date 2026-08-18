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

function line(x1: number, y1: number, x2: number, y2: number, width = 6, color = '#343044') {
  context.strokeStyle = color
  context.lineWidth = width
  context.lineCap = 'square'
  context.beginPath()
  context.moveTo(x1, y1)
  context.lineTo(x2, y2)
  context.stroke()
}

function drawFrame(expression: PilotExpression, index: number) {
  const originX = index % PILOT_ATLAS_COLUMNS * FRAME_WIDTH
  const originY = Math.floor(index / PILOT_ATLAS_COLUMNS) * FRAME_HEIGHT
  context.save()
  context.translate(originX, originY)
  context.fillStyle = '#3e3855'
  context.fillRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT)
  context.fillStyle = '#58506e'
  for (let x = 4; x < FRAME_WIDTH; x += 16) context.fillRect(x, 7, 7, 3)
  context.fillStyle = '#f4d7aa'
  context.beginPath()
  context.moveTo(31, 23)
  context.lineTo(91, 17)
  context.lineTo(105, 40)
  context.lineTo(94, 80)
  context.lineTo(38, 84)
  context.lineTo(22, 55)
  context.closePath()
  context.fill()
  context.strokeStyle = '#343044'
  context.lineWidth = 6
  context.stroke()
  line(78, 19, 91, 3, 5, '#343044')
  context.fillStyle = '#b9df78'
  context.beginPath(); context.arc(94, 4, 6, 0, Math.PI * 2); context.fill()
  context.strokeStyle = '#343044'; context.lineWidth = 3; context.stroke()
  context.fillStyle = '#ef8d96'
  context.fillRect(20, 55, 10, 16)

  const eyeY = expression === 'surprise' || expression === 'scream' ? 43 : 44
  if (expression === 'blink') {
    line(39, eyeY, 54, eyeY, 5)
    line(73, eyeY, 88, eyeY, 5)
  } else if (expression === 'focus' || expression === 'glare') {
    line(38, eyeY - 4, 55, eyeY + 2, 6)
    line(72, eyeY + 2, 90, eyeY - 5, 6)
  } else if (expression === 'excited' || expression === 'victory') {
    line(38, eyeY + 2, 47, eyeY - 5, 5)
    line(47, eyeY - 5, 56, eyeY + 2, 5)
    line(72, eyeY + 2, 81, eyeY - 5, 5)
    line(81, eyeY - 5, 90, eyeY + 2, 5)
  } else {
    context.fillStyle = '#343044'
    context.fillRect(41, eyeY - 6, expression === 'surprise' || expression === 'scream' ? 10 : 8, expression === 'surprise' || expression === 'scream' ? 14 : 11)
    context.fillRect(76, eyeY - 6, expression === 'surprise' || expression === 'scream' ? 10 : 8, expression === 'surprise' || expression === 'scream' ? 14 : 11)
  }

  if (expression === 'scream' || expression === 'surprise') {
    context.fillStyle = '#343044'
    context.beginPath(); context.arc(64, 67, expression === 'scream' ? 12 : 8, 0, Math.PI * 2); context.fill()
  } else if (expression === 'defeat') {
    line(52, 72, 64, 65, 5)
    line(64, 65, 78, 72, 5)
  } else if (expression === 'excited' || expression === 'victory' || expression === 'boost') {
    context.strokeStyle = '#343044'; context.lineWidth = 5
    context.beginPath(); context.arc(64, 57, 16, 0.2, Math.PI - 0.2); context.stroke()
  } else {
    line(54, 67, 75, 67, 5)
  }
  if (expression === 'sweat') {
    context.fillStyle = '#b9df78'
    context.beginPath(); context.moveTo(103, 37); context.lineTo(111, 55); context.lineTo(97, 55); context.closePath(); context.fill()
  }
  if (expression === 'boost') {
    line(7, 31, 18, 31, 4, '#f1b870')
    line(4, 47, 17, 47, 4, '#f1b870')
    line(9, 64, 19, 64, 4, '#f1b870')
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
