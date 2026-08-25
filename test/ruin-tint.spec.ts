import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { BUILDING_STYLES } from '../src/core/world'
import { RUIN_MIN_LUMINANCE, RUIN_SHADE, ruinLuminance, tintRuin } from '../src/render/ruinTint'

/**
 * Rubble has to stay a pile, not a hole.
 *
 * The ruin pool tints each instance from the facade it fell off, and the urban
 * neutrals in BUILDING_STYLES sit low enough that a plain scale - applied in
 * linear space, then run through the scene's ACES toe - put them on #201e1d
 * against a #a6988e lot. On screen that is a black cut-out. The floor here is
 * what stops that, so it is worth a test per style rather than a spot check:
 * a new dark facade added to the palette should fail this, not ship.
 */
describe('ruin tint', () => {
  const color = new THREE.Color()

  it('keeps every facade in the palette off the black floor', () => {
    for (const style of BUILDING_STYLES) {
      const luminance = ruinLuminance(tintRuin(color, style.color))
      expect(luminance, `${style.color} collapsed to black`).toBeGreaterThanOrEqual(RUIN_MIN_LUMINANCE - 1e-6)
    }
  })

  it('lifts the darkest slate well clear of where a flat scale left it', () => {
    const flat = ruinLuminance(color.set('#1F2833').multiplyScalar(RUIN_SHADE))
    const lifted = ruinLuminance(tintRuin(color, '#1F2833'))
    expect(flat).toBeLessThan(RUIN_MIN_LUMINANCE)
    expect(lifted).toBeGreaterThan(flat * 4)
  })

  it('leaves a facade that already clears the floor on its own hue', () => {
    // Only the darks get dusted; a teal ruin still reads teal, which is the
    // whole reason the floor is a floor and not a blanket mix toward grey.
    const tinted = tintRuin(color, '#8ec9d8').clone()
    const plain = color.set('#8ec9d8').multiplyScalar(RUIN_SHADE)
    expect(tinted.getHexString()).toBe(plain.getHexString())
    expect(tinted.b).toBeGreaterThan(tinted.r)
  })
})
