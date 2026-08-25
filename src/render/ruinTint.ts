import * as THREE from 'three'

/**
 * What a collapsed block settles to.
 *
 * A ruin is its building's own colour, darkened - and the urban neutrals in
 * BUILDING_STYLES (#1F2833, #263238, #37474F) have nowhere left to go. Three
 * things stack on them. The scale is applied in linear space, so it bites far
 * harder than the hex suggests. The scene tone maps through ACES at exposure
 * 1.12 (App.tsx), whose toe compresses the bottom of the range to almost
 * nothing. And a standing tower of the same slate only stays legible because
 * its facade picks up an emissive lift at night - rubble has no windows to
 * light, so nothing catches it on the way down. Measured off a real frame, a
 * #1F2833 ruin landed on #201e1d against a #a6988e lot: a hole cut in the
 * ground, not a pile of it.
 *
 * So the scale alone cannot be the whole rule - any factor gentle enough to
 * save the slate washes out the pale styles. Instead the scale runs first and
 * then anything still under a luminance floor is raised toward one concrete
 * tone. Luminance is linear in the channels, so the mix that lands exactly on
 * the floor is closed form rather than a search. Colours already above it -
 * the teals, the pinks, the concrete whites - come through untouched and keep
 * their hue, while the four dark styles converge on the same grey. Broken
 * concrete is the same grey whatever the facade was painted.
 */
export const RUIN_DUST = new THREE.Color('#8f8c86')
export const RUIN_SHADE = 0.55
export const RUIN_MIN_LUMINANCE = 0.2
export const ruinLuminance = (color: THREE.Color) => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722
const RUIN_DUST_LUMINANCE = ruinLuminance(RUIN_DUST)

export function tintRuin(color: THREE.Color, facade: string) {
  color.set(facade).multiplyScalar(RUIN_SHADE)
  const luminance = ruinLuminance(color)
  if (luminance >= RUIN_MIN_LUMINANCE) return color
  const reach = (RUIN_MIN_LUMINANCE - luminance) / (RUIN_DUST_LUMINANCE - luminance)
  return color.lerp(RUIN_DUST, Math.min(1, Math.max(0, reach)))
}
