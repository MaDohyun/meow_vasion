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
