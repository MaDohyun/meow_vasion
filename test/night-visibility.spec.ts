import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  applyNightVisibility,
  nightRamp,
  setNightVisibility,
  type NightRamp,
} from '../src/render/nightVisibility'
import { enemyMaterial } from '../src/render/entityMaterials'
import { ENEMY_CAPS, type EnemyKind } from '../src/core/enemies'

const KINDS = Object.keys(ENEMY_CAPS) as EnemyKind[]

/**
 * Runs a material's shader patch the way three.js would, minus the GPU.
 *
 * The uniforms only exist once a material compiles, so this is the only way to
 * see what these materials actually do.
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

describe('night lift', () => {
  it('interpolates between the day and night ends and clamps outside them', () => {
    const ramp: NightRamp = [0.2, 1.2]
    expect(nightRamp(ramp, 0)).toBeCloseTo(0.2)
    expect(nightRamp(ramp, 1)).toBeCloseTo(1.2)
    expect(nightRamp(ramp, 0.5)).toBeCloseTo(0.7)
    expect(nightRamp(ramp, -3)).toBeCloseTo(0.2)
    expect(nightRamp(ramp, 9)).toBeCloseTo(1.2)
  })

  it('re-emits the surface own colour rather than a shared tint', () => {
    const shader = compile(applyNightVisibility(new THREE.MeshToonMaterial({ vertexColors: true }), {
      lift: [0.01, 0.14],
      rimColor: '#b8c2bf',
      rim: [0.05, 0.16],
    }))
    // The lift multiplies what the surface already is, so a body cannot be
    // recoloured on its way into the night...
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance += diffuseColor.rgb * uNightLift')
    // ...and it rolls off against the surface's own brightness, so an
    // already-pale panel does not lose its shading to it.
    expect(shader.fragmentShader).toContain('(1.0 - 0.55 * ownLuma)')
  })

  it('emits nothing at all for a term that was not asked for', () => {
    const shader = compile(applyNightVisibility(new THREE.MeshToonMaterial(), {}))
    expect(shader.fragmentShader).not.toContain('uNightLift')
    expect(shader.fragmentShader).not.toContain('uRimColor')
    expect(shader.fragmentShader).not.toContain('uAlertColor')
    expect(shader.vertexShader).not.toContain('aAlert')
  })

  it('moves every registered term from one call, in step', () => {
    const shader = compile(applyNightVisibility(new THREE.MeshToonMaterial({ vertexColors: true }), {
      lift: [0.02, 0.2],
      rimColor: '#c3ceca',
      rim: [0.07, 0.2],
    }))
    setNightVisibility(0)
    expect(shader.uniforms.uNightLift!.value).toBeCloseTo(0.02)
    expect(shader.uniforms.uRimStrength!.value).toBeCloseTo(0.07)
    setNightVisibility(1)
    expect(shader.uniforms.uNightLift!.value).toBeCloseTo(0.2)
    expect(shader.uniforms.uRimStrength!.value).toBeCloseTo(0.2)
    setNightVisibility(0.5)
    expect(shader.uniforms.uNightLift!.value).toBeCloseTo(0.11)
  })

  it('seeds a material that compiles mid-run from where the cycle already is', () => {
    setNightVisibility(0.25)
    const material = applyNightVisibility(new THREE.MeshToonMaterial(), { lift: [0, 1] })
    expect(compile(material).uniforms.uNightLift!.value).toBeCloseTo(0.25)
  })
})

describe('enemies are lit by the scene and nothing else', () => {
  it('carries no glow of any kind', () => {
    for (const kind of KINDS) {
      const material = enemyMaterial[kind] as THREE.MeshToonMaterial
      const shader = compile(material)
      // No emissive at all: no family tint, no night lift, no rim, no lamps.
      // Every one of those was tried and every one read as a marker pasted
      // over the city rather than as a craft flying through it.
      expect(material.emissiveIntensity).toBe(1)
      expect(material.emissive.getHex()).toBe(0x000000)
      expect(shader.fragmentShader).not.toContain('uNightLift')
      expect(shader.fragmentShader).not.toContain('uRimColor')
      expect(shader.fragmentShader).not.toContain('uLampStrength')
      expect(shader.vertexShader).not.toContain('aLamp')
    }
  })

  it('keeps the aiming warning, which is a signal rather than decoration', () => {
    for (const kind of KINDS) {
      const shader = compile(enemyMaterial[kind])
      // The battleship is out of it on purpose: it fires almost continuously,
      // so a warning that is always on says nothing.
      if (kind === 'boss') {
        expect(shader.fragmentShader).not.toContain('uAlertColor')
        continue
      }
      expect(shader.vertexShader).toContain('attribute float aAlert;')
      expect(shader.fragmentShader).toContain('totalEmissiveRadiance += uAlertColor * vAlert')
      // Added, never multiplied. Multiplying is what the old instance-colour
      // warning did, and it turned a chasing helicopter into a red one.
      expect(shader.fragmentShader).not.toContain('diffuseColor.rgb *= uAlertColor')
      // And it is absent until an enemy actually locks on: `vAlert` gates the
      // whole term, so a patrolling enemy renders exactly like an unpatched one.
      expect(shader.fragmentShader).not.toMatch(/uAlertColor \* \(/)
    }
  })
})
