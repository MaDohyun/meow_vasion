import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  applyNightVisibility,
  nightRamp,
  setNightVisibility,
  type NightRamp,
} from '../src/render/nightVisibility'
import { ENEMY_HALO, applyEntityDaylight, enemyHaloOpacity, enemyMaterial } from '../src/render/entityMaterials'
import { ENEMY_CAPS, type EnemyKind } from '../src/core/enemies'

const KINDS = Object.keys(ENEMY_CAPS) as EnemyKind[]

/**
 * Runs a material's shader patch the way three.js would, minus the GPU.
 *
 * The uniforms only exist once a material compiles, so this is the only way to
 * see what the cycle is actually pushing into them.
 */
function compile(material: THREE.Material) {
  const shader = {
    uniforms: {} as Record<string, { value: number }>,
    vertexShader: '#include <common>\n#include <begin_vertex>\n#include <color_vertex>',
    fragmentShader: '#include <common>\n#include <emissivemap_fragment>',
  }
  material.onBeforeCompile(
    shader as unknown as THREE.WebGLProgramParametersWithUniforms,
    null as unknown as THREE.WebGLRenderer,
  )
  return shader
}

describe('night visibility ramps', () => {
  it('interpolates between the day and night ends and clamps outside them', () => {
    const ramp: NightRamp = [0.2, 1.2]
    expect(nightRamp(ramp, 0)).toBeCloseTo(0.2)
    expect(nightRamp(ramp, 1)).toBeCloseTo(1.2)
    expect(nightRamp(ramp, 0.5)).toBeCloseTo(0.7)
    expect(nightRamp(ramp, -3)).toBeCloseTo(0.2)
    expect(nightRamp(ramp, 9)).toBeCloseTo(1.2)
  })

  it('re-emits the surface own colour rather than a shared tint', () => {
    const material = applyNightVisibility(new THREE.MeshToonMaterial({ vertexColors: true }), {
      rimColor: '#63b8d2',
      lift: [0.05, 0.6],
      lamp: [0.4, 3],
    })
    const shader = compile(material)
    // The whole point: the lift multiplies what the surface already is, so a
    // body cannot be recoloured on the way into the night.
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance += diffuseColor.rgb * uNightLift')
    // ...and it is rolled off against the surface's own brightness, so an
    // already-pale panel does not blow out while a dark one is rescued.
    expect(shader.fragmentShader).toContain('(1.0 - 0.55 * ownLuma)')
    expect(shader.fragmentShader).toContain('diffuseColor.rgb * vLamp * uLampStrength')
    expect(shader.vertexShader).toContain('vLamp = aLamp;')
  })

  it('declares the lamp attribute only for models that carry lamps', () => {
    const plain = applyNightVisibility(new THREE.MeshToonMaterial(), { rimColor: '#b8c2bf' })
    const shader = compile(plain)
    expect(shader.vertexShader).not.toContain('aLamp')
    expect(shader.fragmentShader).not.toContain('uLampStrength')
  })

  it('drives every registered term from one call, in step', () => {
    const material = applyNightVisibility(new THREE.MeshToonMaterial({ vertexColors: true }), {
      rimColor: '#d9b45b',
      rim: [0.1, 0.34],
      lift: [0.05, 0.66],
      lamp: [0.45, 3.4],
    })
    const shader = compile(material)
    setNightVisibility(0)
    expect(shader.uniforms.uNightLift!.value).toBeCloseTo(0.05)
    expect(shader.uniforms.uRimStrength!.value).toBeCloseTo(0.1)
    expect(shader.uniforms.uLampStrength!.value).toBeCloseTo(0.45)
    setNightVisibility(1)
    expect(shader.uniforms.uNightLift!.value).toBeCloseTo(0.66)
    expect(shader.uniforms.uRimStrength!.value).toBeCloseTo(0.34)
    expect(shader.uniforms.uLampStrength!.value).toBeCloseTo(3.4)
    // Every term rises with the night, so "darker sky, more of its own light"
    // never turns into one of them running the other way.
    setNightVisibility(0.5)
    expect(shader.uniforms.uNightLift!.value).toBeGreaterThan(0.05)
    expect(shader.uniforms.uNightLift!.value).toBeLessThan(0.66)
  })

  it('seeds a material that compiles mid-run from where the cycle already is', () => {
    setNightVisibility(0.25)
    const material = applyNightVisibility(new THREE.MeshToonMaterial(), {
      rimColor: '#d9b45b',
      lift: [0, 1],
    })
    expect(compile(material).uniforms.uNightLift!.value).toBeCloseTo(0.25)
  })
})

describe('enemies keep their colours after dark', () => {
  it('keeps the shared family tint far below the model own colour at night', () => {
    applyEntityDaylight(1)
    setNightVisibility(1)
    for (const kind of KINDS) {
      const material = enemyMaterial[kind] as THREE.MeshToonMaterial
      const shader = compile(material)
      // This is the gold-wash regression. A family-coloured emissive added flat
      // across a whole body at anything near the old 0.74 repaints the model;
      // it has to stay a whisper next to the lift, which preserves hue.
      expect(material.emissiveIntensity).toBeLessThan(0.15)
      expect(shader.uniforms.uNightLift!.value).toBeGreaterThan(material.emissiveIntensity * 3)
      // Lamps have to burn past the body they are mounted on, or they read as
      // paint rather than as light.
      expect(shader.uniforms.uLampStrength!.value).toBeGreaterThan(1)
    }
  })

  it('lifts every family more at night than in daylight', () => {
    for (const kind of KINDS) {
      const shader = compile(enemyMaterial[kind])
      setNightVisibility(0)
      const day = { lift: shader.uniforms.uNightLift!.value, lamp: shader.uniforms.uLampStrength!.value }
      setNightVisibility(1)
      expect(shader.uniforms.uNightLift!.value).toBeGreaterThan(day.lift)
      expect(shader.uniforms.uLampStrength!.value).toBeGreaterThan(day.lamp)
    }
  })
})

describe('enemy night halo', () => {
  it('is absent in daylight and arrives with the night', () => {
    expect(enemyHaloOpacity(0)).toBe(0)
    expect(enemyHaloOpacity(0.5)).toBeLessThan(enemyHaloOpacity(1))
    expect(enemyHaloOpacity(1)).toBeGreaterThan(0.5)
    // Squared, so the early evening does not already look like midnight.
    expect(enemyHaloOpacity(0.5)).toBeLessThan(enemyHaloOpacity(1) / 2)
  })

  it('clamps outside the cycle rather than running negative or past full', () => {
    expect(enemyHaloOpacity(-1)).toBe(0)
    expect(enemyHaloOpacity(4)).toBeCloseTo(enemyHaloOpacity(1))
  })

  it('gives every enemy family a halo big enough to sit outside its hull', () => {
    for (const kind of KINDS) {
      const halo = ENEMY_HALO[kind]
      expect(halo.radius).toBeGreaterThan(0)
      expect(halo.strength).toBeGreaterThan(0)
      expect(halo.height).toBeGreaterThanOrEqual(0)
    }
    // A mine already carries a blast shell; it must not add the brightest
    // halo in the set on top of it.
    expect(ENEMY_HALO.drone.strength).toBeLessThan(ENEMY_HALO.helicopter.strength)
    // The battleship is seventy metres of hull - its halo has to cover it.
    expect(ENEMY_HALO.boss.radius).toBeGreaterThan(ENEMY_HALO.fighter.radius)
  })
})
