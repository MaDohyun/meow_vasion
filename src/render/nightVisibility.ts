import * as THREE from 'three'

/**
 * How a body stays findable after dark without being repainted by the dark.
 *
 * The old answer was a family-coloured emissive that climbed with the night: a
 * helicopter carried a gold glow, a fighter an orange one, and the ramp ran to
 * 0.74 at full night. Emissive is added flat across the whole surface, and at
 * that end of the ramp it was several times the lit body underneath - so every
 * helicopter became one flat gold shape and every fighter an orange one. The
 * models' own colours, which are the only thing separating a cockpit from a
 * rotor from a tail boom, were gone exactly when the player needed them.
 *
 * The night lift here re-emits the surface's *own* colour instead of a shared
 * one. `diffuseColor` already carries the baked vertex colour and the instance
 * tint at this point in the shader, so hue is preserved exactly and only value
 * moves: a body gets brighter as the city goes dark rather than changing
 * colour.
 *
 * The family read moves to two places that cannot swamp a body:
 *
 * - a fresnel rim, which only lands at grazing angles, and
 * - lamps - small parts tagged with `aLamp` in the geometry that burn far
 *   above the rest of the model, so each craft carries its own running lights.
 *   They keep their baked colour too, which is what lets one model carry a red
 *   port light, a green starboard one and an amber beacon. Being far brighter
 *   than the body is also what pushes them past the post pass's bright-pass
 *   threshold, so a two-pixel lamp blooms into something readable at distance.
 *   That bloom is the "light source" part: no new scene light is involved, and
 *   the light count every material's program is keyed on never changes.
 *
 * All three ride the same day/night pair through `setNightVisibility`, so
 * "darker sky, more of its own light" is one rule applied three times instead
 * of three ramps to keep in step by hand.
 */

/** A day value and a night value for one term. */
export type NightRamp = readonly [day: number, night: number]

export type NightVisibilityOptions = {
  /** Fresnel rim colour. The family read, kept at the edge. */
  rimColor: string
  rim?: NightRamp
  rimPower?: number
  /** Share of the surface's own colour re-emitted back out. */
  lift?: NightRamp
  /** Brightness multiplier for parts tagged `aLamp`. Omit for a model with no
   *  lamps: the attribute is only declared when this is asked for. */
  lamp?: NightRamp
}

const DEFAULT_RIM: NightRamp = [0.1, 0.34]
const DEFAULT_LIFT: NightRamp = [0.04, 0.6]

/** Live uniforms, so the cycle can move all of this without a recompile. */
type RampedUniform = { uniform: { value: number }; ramp: NightRamp }

const rampedUniforms: RampedUniform[] = []

/**
 * Where the cycle currently is.
 *
 * Materials compile lazily - the first time something wearing one is drawn -
 * so a material can join the scene long after the last time the sky moved.
 * Seeding its uniforms from here rather than from the ramp's night end means a
 * craft that first appears at noon appears lit for noon, instead of staying on
 * night values until the cycle happens to tick past the update threshold.
 */
let currentNightFactor = 1

/** Where a ramp sits at this point of the cycle. Exported for the test, which
 *  is the only way to check these curves without a GPU. */
export function nightRamp(ramp: NightRamp, nightFactor: number) {
  const t = Math.max(0, Math.min(1, nightFactor))
  return ramp[0] + (ramp[1] - ramp[0]) * t
}

export function setNightVisibility(nightFactor: number) {
  currentNightFactor = Math.max(0, Math.min(1, nightFactor))
  for (const entry of rampedUniforms) entry.uniform.value = nightRamp(entry.ramp, currentNightFactor)
}

export function applyNightVisibility<T extends THREE.Material>(material: T, options: NightVisibilityOptions) {
  const rimRamp = options.rim ?? DEFAULT_RIM
  const liftRamp = options.lift ?? DEFAULT_LIFT
  const lampRamp = options.lamp
  const rimColor = new THREE.Color(options.rimColor)
  const rimPower = options.rimPower ?? 2.6
  const previousCompile = material.onBeforeCompile
  const previousCacheKey = material.customProgramCacheKey.bind(material)

  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer)
    const rim = { value: nightRamp(rimRamp, currentNightFactor) }
    const lift = { value: nightRamp(liftRamp, currentNightFactor) }
    const lamp = { value: lampRamp ? nightRamp(lampRamp, currentNightFactor) : 0 }
    shader.uniforms.uRimColor = { value: rimColor }
    shader.uniforms.uRimStrength = rim
    shader.uniforms.uRimPower = { value: rimPower }
    shader.uniforms.uNightLift = lift
    rampedUniforms.push({ uniform: rim, ramp: rimRamp }, { uniform: lift, ramp: liftRamp })
    if (lampRamp) {
      shader.uniforms.uLampStrength = lamp
      rampedUniforms.push({ uniform: lamp, ramp: lampRamp })
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute float aLamp;
          varying float vLamp;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vLamp = aLamp;`)
    }

    // Patched into `emissivemap_fragment` because `totalEmissiveRadiance` and
    // `diffuseColor` are both in scope there and it lands before tone mapping,
    // so all of this behaves like the rest of the scene's emissive surfaces.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uRimColor;
        uniform float uRimStrength;
        uniform float uRimPower;
        uniform float uNightLift;
        ${lampRamp ? 'uniform float uLampStrength;\n        varying float vLamp;' : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // The surface re-emitting itself. Hue is whatever the model already
          // is, so nothing gets recoloured on the way into the night.
          //
          // Rolled off against the surface's own brightness, because the lift
          // exists to rescue what the dark swallows. A near-black tail boom
          // needs all of it; a cream nose cone is already the brightest thing
          // on the model, and giving it the same lift only blows the shading
          // off it and turns the whole nose into one white blob.
          float ownLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          totalEmissiveRadiance += diffuseColor.rgb * uNightLift * (1.0 - 0.55 * ownLuma);
          ${lampRamp ? 'totalEmissiveRadiance += diffuseColor.rgb * vLamp * uLampStrength;' : ''}
          float facing = abs(dot(normalize(vNormal), normalize(vViewPosition)));
          totalEmissiveRadiance += uRimColor * pow(1.0 - facing, uRimPower) * uRimStrength;
        }`)
  }
  // Keeps this variant from sharing a compiled program with an unpatched
  // material of the same type, or with a differently tuned sibling.
  material.customProgramCacheKey = () =>
    `${previousCacheKey()}-night-${options.rimColor}-${rimRamp.join(':')}-${liftRamp.join(':')}-${lampRamp?.join(':') ?? 'nolamp'}-${rimPower}`
  return material
}
