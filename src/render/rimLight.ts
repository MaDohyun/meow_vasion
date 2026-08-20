import * as THREE from 'three'

/**
 * Adds a fresnel rim term to a lit material's emissive output.
 *
 * At night an unlit silhouette against a dark city is just a hole. A rim picks
 * out the edge of every body cheaply, without adding a light (which would change
 * the scene light count and recompile every material) and without a second pass.
 *
 * Patched into `emissivemap_fragment` because `totalEmissiveRadiance` is already
 * in scope there and it lands before tone mapping, so the rim behaves like the
 * rest of the emissive surfaces in the scene.
 */
/**
 * Live rim uniforms, so the cycle can dial the effect back in daylight where a
 * bright sky already separates silhouettes and a rim just looks like a halo.
 */
const rimStrengthUniforms: { uniform: { value: number }; base: number }[] = []

export function setRimNightFactor(nightFactor: number) {
  for (const entry of rimStrengthUniforms) {
    entry.uniform.value = entry.base * (0.35 + nightFactor * 0.65)
  }
}

export function applyRimLight(material: THREE.Material, color: string, strength = 0.55, power = 2.6) {
  const rim = new THREE.Color(color)
  material.onBeforeCompile = (shader) => {
    const strengthUniform = { value: strength }
    shader.uniforms.uRimColor = { value: rim }
    shader.uniforms.uRimStrength = strengthUniform
    shader.uniforms.uRimPower = { value: power }
    rimStrengthUniforms.push({ uniform: strengthUniform, base: strength })
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uRimColor;
        uniform float uRimStrength;
        uniform float uRimPower;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float facing = abs(dot(normalize(vNormal), normalize(vViewPosition)));
          totalEmissiveRadiance += uRimColor * pow(1.0 - facing, uRimPower) * uRimStrength;
        }`)
  }
  // Keeps this variant from sharing a compiled program with an unpatched
  // material of the same type.
  material.customProgramCacheKey = () => `rim-${color}-${strength}-${power}`
  return material
}
