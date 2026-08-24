import * as THREE from 'three'

/**
 * Soft radial falloff used by every ground light pool - streetlights and the
 * UFO's own pool. A hard-edged circle reads as a painted puddle rather than
 * light, and the falloff is what sells it as a glow.
 *
 * Built once at module scope: these are shared by pooled instanced meshes, so
 * there is no per-frame or per-instance allocation.
 */
export const radialGlowTexture = (() => {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.45, 'rgba(255,255,255,.42)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
})()

/**
 * The curtain round, as a picture.
 *
 * An orb used to be two spheres - a pale core inside an amber shell - and at
 * the size these things are on screen that is a dot. It read as a bullet,
 * which is the one thing it is not: the round is slow, it is meant to be
 * looked at for whole seconds, and what it should look like in that time is a
 * ball of burning plasma with the fire still coming off it.
 *
 * So the shape is drawn once here and billboarded: a white-hot centre with
 * filaments curling away from it. Three things make it read as fire rather
 * than as a star or a flower. The filaments taper - they are filled ribbons,
 * wide where they leave the core and nearly nothing at the tip, because a
 * constant-width stroke reads as wire. They hook at the end and stop, rather
 * than curling back to where they started, which is what a closed loop does
 * and it turns the whole thing into a pretzel. And they cool along their
 * length, white at the core and deep red at the tip, so the eye reads outward
 * flow.
 *
 * The colour ramp is baked in for that last reason: one flat tint over the
 * whole sprite cannot be white in the middle and red at the edge, and that
 * gradient is the entire difference between something burning and something
 * drawn.
 */
export const orbFlareTexture = (() => {
  const size = 128
  const half = size / 2
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')!

  /** A point on a cubic bezier, and the unit normal there. */
  function sample(points: number[][], t: number) {
    const [p0, p1, p2, p3] = points as [number[], number[], number[], number[]]
    const u = 1 - t
    const a = u * u * u
    const b = 3 * u * u * t
    const c = 3 * u * t * t
    const d = t * t * t
    const x = a * p0[0]! + b * p1[0]! + c * p2[0]! + d * p3[0]!
    const y = a * p0[1]! + b * p1[1]! + c * p2[1]! + d * p3[1]!
    const da = 3 * u * u
    const db = 6 * u * t
    const dc = 3 * t * t
    const tx = da * (p1[0]! - p0[0]!) + db * (p2[0]! - p1[0]!) + dc * (p3[0]! - p2[0]!)
    const ty = da * (p1[1]! - p0[1]!) + db * (p2[1]! - p1[1]!) + dc * (p3[1]! - p2[1]!)
    const length = Math.max(0.0001, Math.hypot(tx, ty))
    return { x, y, nx: -ty / length, ny: tx / length }
  }

  // The core, and the haze it sits in. The stops are tight at the centre so
  // the white survives being scaled down to a handful of pixels, and long in
  // the tail so the filaments look like they are coming out of something.
  const glow = context.createRadialGradient(half, half, 0, half, half, half)
  glow.addColorStop(0, 'rgba(255,255,255,1)')
  glow.addColorStop(0.13, 'rgba(255,252,250,.97)')
  glow.addColorStop(0.22, 'rgba(255,199,186,.6)')
  glow.addColorStop(0.36, 'rgba(238,100,92,.28)')
  glow.addColorStop(0.66, 'rgba(198,50,54,.1)')
  glow.addColorStop(1, 'rgba(170,40,44,0)')
  context.fillStyle = glow
  context.fillRect(0, 0, size, size)

  // Eleven filaments, at uneven lengths and alternating handedness, so the
  // ring of them reads as fire rather than as a cog. Odd rather than even for
  // the same reason: an even count lines every tongue up with its opposite,
  // and four fat ones is a pinwheel. Many thin tongues is a corona.
  const petals = 11
  const steps = 18
  for (let index = 0; index < petals; index += 1) {
    const long = index % 2 === 0
    const reach = half * (long ? 0.9 : 0.66)
    const curl = long ? 1 : -1
    const width = half * (long ? 0.085 : 0.065)
    // The spine: out along its own axis, then a hook across at the tip. It
    // stops there - a tongue of flame ends in the air.
    const spine = [
      [half * 0.1, 0],
      [reach * 0.5, curl * reach * 0.04],
      [reach * 0.95, curl * reach * 0.24],
      [reach * 0.78, curl * reach * 0.6],
    ]
    context.save()
    context.translate(half, half)
    context.rotate(index / petals * Math.PI * 2 + (long ? 0 : 0.22))
    // White at the root, red at the tip: the round is cooling as it flows out.
    const heat = context.createLinearGradient(0, 0, reach, 0)
    heat.addColorStop(0, 'rgba(255,252,250,.95)')
    heat.addColorStop(0.3, 'rgba(255,178,164,.8)')
    heat.addColorStop(0.7, 'rgba(232,86,80,.6)')
    heat.addColorStop(1, 'rgba(198,44,50,.3)')
    context.fillStyle = heat
    context.beginPath()
    // Down one side of the spine and back up the other, with the half-width
    // falling away to almost nothing - the taper is what makes it a flame.
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps
      const point = sample(spine, t)
      const girth = width * (1 - t) ** 1.4 + width * 0.08
      const x = point.x + point.nx * girth
      const y = point.y + point.ny * girth
      if (step === 0) context.moveTo(x, y)
      else context.lineTo(x, y)
    }
    for (let step = steps; step >= 0; step -= 1) {
      const t = step / steps
      const point = sample(spine, t)
      const girth = width * (1 - t) ** 1.4 + width * 0.08
      context.lineTo(point.x - point.nx * girth, point.y - point.ny * girth)
    }
    context.closePath()
    context.fill()
    context.restore()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
})()

/**
 * The halo drawn around a craft at night - hollow in the middle on purpose.
 *
 * A plain radial glow is brightest at its centre, which is exactly where the
 * craft is: pointed at an enemy it becomes a coloured wash over the hull, which
 * is the repainting this whole effect exists to avoid. Fading the core back to
 * almost nothing and putting the peak out at half the radius puts the light
 * just outside the silhouette instead, so the body keeps its own colours and
 * the family colour is read from the air around it.
 */
export const entityHaloTexture = (() => {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,.10)')
  gradient.addColorStop(0.3, 'rgba(255,255,255,.55)')
  gradient.addColorStop(0.5, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.72, 'rgba(255,255,255,.42)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
})()
