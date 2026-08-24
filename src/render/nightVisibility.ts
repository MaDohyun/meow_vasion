import * as THREE from 'three'

/**
 * Two small shader additions for lit materials: a night lift, and an alert.
 *
 * Neither is decoration. Both exist because something would otherwise be
 * unreadable, and both are written so they cannot change what colour a surface
 * is - only how much of its own light it gives back.
 *
 * This file used to carry a third job: a family-coloured glow on every enemy,
 * with running lights baked into the models and a halo drawn around each craft.
 * It is gone. Enemies are lit by the scene like everything else in the city,
 * which is what makes them look like objects in it rather than like markers
 * over it.
 */

/** A day value and a night value for one term. */
export type NightRamp = readonly [day: number, night: number]

export type NightVisibilityOptions = {
  /**
   * Share of the surface's own colour re-emitted back out, so a body does not
   * disappear into an unlit street. `diffuseColor` already carries the baked
   * vertex colour and the instance tint at this point in the shader, which is
   * what makes this hue-preserving: only value moves.
   */
  lift?: NightRamp
  /** Fresnel rim, for picking a silhouette out of a dark background. */
  rimColor?: string
  rim?: NightRamp
  rimPower?: number
  /** Turns on the per-instance `aAlert` channel. See ALERT below. */
  alert?: boolean
}

/**
 * What an enemy about to fire looks like.
 *
 * It used to be `instanceColor = #ff6573`, which multiplies through every baked
 * vertex colour: the whole model came out one flat red. On a helicopter that is
 * not a flash but a state - `aiming` is true for the entire chase - so a
 * helicopter that had seen the player was simply a red helicopter from then on.
 *
 * So the warning is lit rather than painted: the edge burns and a thin wash
 * reaches the body, enough that the silhouette reads hostile and far too little
 * to repaint it. Constants rather than day/night ramps, because a warning has
 * to read at noon as well as at midnight.
 */
const ALERT = {
  color: '#ff5a6e',
  /** Flat wash over the whole body. Deliberately small. */
  body: 0.1,
  /**
   * Fresnel edge. The exponent matters more than the strength: most of a
   * helicopter is a capsule, so a soft falloff grazes almost all of it and the
   * "edge" quietly becomes the whole body again. Kept tight so it outlines.
   */
  rim: 1.05,
  rimPower: 2.7,
} as const

/** Live uniforms, so the cycle can move these without a recompile. */
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
  const liftRamp = options.lift
  const rimRamp = options.rim && options.rimColor ? options.rim : undefined
  const rimColor = new THREE.Color(options.rimColor ?? '#ffffff')
  const rimPower = options.rimPower ?? 2.6
  const useAlert = options.alert === true
  const alertColor = new THREE.Color(ALERT.color)
  const previousCompile = material.onBeforeCompile
  const previousCacheKey = material.customProgramCacheKey.bind(material)

  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer)
    if (liftRamp) {
      const lift = { value: nightRamp(liftRamp, currentNightFactor) }
      shader.uniforms.uNightLift = lift
      rampedUniforms.push({ uniform: lift, ramp: liftRamp })
    }
    if (rimRamp) {
      const rim = { value: nightRamp(rimRamp, currentNightFactor) }
      shader.uniforms.uRimColor = { value: rimColor }
      shader.uniforms.uRimStrength = rim
      shader.uniforms.uRimPower = { value: rimPower }
      rampedUniforms.push({ uniform: rim, ramp: rimRamp })
    }
    if (useAlert) {
      shader.uniforms.uAlertColor = { value: alertColor }
      // Per instance, not per vertex: which enemy is aiming changes every
      // frame, and the model is shared by the whole pool.
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute float aAlert;
          varying float vAlert;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vAlert = aAlert;`)
    }

    // Patched into `emissivemap_fragment` because `totalEmissiveRadiance` and
    // `diffuseColor` are both in scope there and it lands before tone mapping,
    // so all of this behaves like the rest of the scene's emissive surfaces.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${liftRamp ? 'uniform float uNightLift;' : ''}
        ${rimRamp ? 'uniform vec3 uRimColor;\n        uniform float uRimStrength;\n        uniform float uRimPower;' : ''}
        ${useAlert ? 'uniform vec3 uAlertColor;\n        varying float vAlert;' : ''}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float facing = abs(dot(normalize(vNormal), normalize(vViewPosition)));
          ${liftRamp ? `
          // The surface re-emitting itself. Hue is whatever the model already
          // is, so nothing gets recoloured on the way into the night. Rolled
          // off against the surface's own brightness, because the lift exists
          // to rescue what the dark swallows: a near-black panel needs all of
          // it, an already-pale one only loses its shading to it.
          float ownLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          totalEmissiveRadiance += diffuseColor.rgb * uNightLift * (1.0 - 0.55 * ownLuma);` : ''}
          ${rimRamp ? 'totalEmissiveRadiance += uRimColor * pow(1.0 - facing, uRimPower) * uRimStrength;' : ''}
          ${useAlert ? `
          // About to fire: lit, not repainted. See ALERT above.
          totalEmissiveRadiance += uAlertColor * vAlert * (
            ${ALERT.body.toFixed(3)}
            + pow(1.0 - facing, ${ALERT.rimPower.toFixed(2)}) * ${ALERT.rim.toFixed(3)}
          );` : ''}
        }`)
  }
  // Keeps this variant from sharing a compiled program with an unpatched
  // material of the same type, or with a differently tuned sibling.
  material.customProgramCacheKey = () =>
    `${previousCacheKey()}-night-${liftRamp?.join(':') ?? 'nolift'}-${rimRamp ? `${options.rimColor}:${rimRamp.join(':')}:${rimPower}` : 'norim'}-${useAlert ? 'alert' : 'noalert'}`
  return material
}
