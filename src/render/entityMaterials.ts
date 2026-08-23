import * as THREE from 'three'
import { ENTITY, FX } from '../constants/palette'
import type { CrowdKind } from '../core/crowds'
import type { EnemyKind } from '../core/enemies'
import { applyRimLight } from './rimLight'

/**
 * Materials for everything the player has to spot: crowds, enemies and cars.
 *
 * They live together because they answer one question - can this be picked out
 * of the background right now? - and the answer changes across the run. A body
 * that reads fine against a sunlit street is a silhouette against a night one,
 * so each of these carries a small self-glow that rises as the sky darkens.
 *
 * The glow is deliberately small at noon. It exists to stop things vanishing,
 * not to make the city look like it is full of lanterns at midday.
 */

type GlowRamp = { material: THREE.MeshToonMaterial; day: number; night: number }

const glowRamps: GlowRamp[] = []
/** Neutral visibility lift for pedestrians. A saturated shared emissive colour
 *  would wash every independently coloured outfit into the same hue at night. */
const PEDESTRIAN_VISIBILITY_GLOW = '#b8c2bf'
/** Cats share one material across three coat colours, so their night light also
 *  has to stay neutral. Slightly stronger than a pedestrian because the model
 *  is much smaller on screen. */
const CAT_VISIBILITY_GLOW = '#c3ceca'

function withGlowRamp(material: THREE.MeshToonMaterial, day: number, night: number) {
  glowRamps.push({ material, day, night })
  return material
}

/**
 * Keeps the pedestrian family in one draw call while selecting independently
 * modelled tops and bottoms per instance. Skin, hair and shoes keep their baked
 * vertex colours; only tagged clothing vertices receive the instance tints.
 */
function applyPedestrianOutfits(material: THREE.MeshToonMaterial) {
  const previousCompile = material.onBeforeCompile
  const previousCacheKey = material.customProgramCacheKey.bind(material)
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float outfitPart;
        attribute float outfitVariant;
        attribute float outfitTopStyle;
        attribute float outfitBottomStyle;
        attribute vec3 outfitTopTint;
        attribute vec3 outfitBottomTint;
        attribute vec3 outfitDetailTint;
        attribute float outfitBeamLit;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float outfitVisible = 1.0;
        if (outfitVariant > 0.5 && outfitVariant < 10.5) {
          outfitVisible = 1.0 - step(0.5, abs(outfitTopStyle - (outfitVariant - 1.0)));
        } else if (outfitVariant >= 10.5) {
          outfitVisible = 1.0 - step(0.5, abs(outfitBottomStyle - (outfitVariant - 11.0)));
        }
        transformed *= outfitVisible;`)
      .replace('#include <color_vertex>', `#include <color_vertex>
        #ifdef USE_COLOR
          if (outfitPart > 0.5 && outfitPart < 1.5) vColor = outfitTopTint;
          else if (outfitPart >= 1.5 && outfitPart < 2.5) vColor = outfitBottomTint;
          else if (outfitPart >= 2.5) vColor = outfitDetailTint;
          // A restrained reflection of the mint tractor beam. The previous
          // yellow 90% mix replaced every outfit colour; 15% keeps the outfit
          // readable while making the captured person feel beam-lit.
          vColor = mix(vColor, vec3(0.56, 1.0, 0.88), outfitBeamLit * 0.15);
        #endif`)
  }
  material.customProgramCacheKey = () => `${previousCacheKey()}-pedestrian-outfits-v1`
  return material
}

/** Every enemy family keeps its own glow colour. A single shared colour would
 *  erase the type read the wave design depends on. */
const ENEMY_GLOW: Record<EnemyKind, string> = {
  drone: ENTITY.DRONE_GLOW,
  helicopter: ENTITY.HELICOPTER_GLOW,
  fighter: ENTITY.FIGHTER_GLOW,
  'anti-air': ENTITY.ANTI_AIR_GLOW,
  boss: ENTITY.BOSS_GLOW,
}

export const crowdMaterial: Record<CrowdKind, THREE.Material> = {
  pedestrian: applyPedestrianOutfits(applyRimLight(
    withGlowRamp(new THREE.MeshToonMaterial({ vertexColors: true, emissive: new THREE.Color(PEDESTRIAN_VISIBILITY_GLOW) }), 0.015, 0.16),
    PEDESTRIAN_VISIBILITY_GLOW,
    0.16,
    2.8,
  ) as THREE.MeshToonMaterial),
  cat: applyRimLight(
    withGlowRamp(new THREE.MeshToonMaterial({ vertexColors: true, emissive: new THREE.Color(CAT_VISIBILITY_GLOW) }), 0.02, 0.22),
    CAT_VISIBILITY_GLOW,
    0.2,
    2.8,
  ),
}

export const enemyMaterial = Object.fromEntries(
  (Object.keys(ENEMY_GLOW) as EnemyKind[]).map((kind) => [
    kind,
    applyRimLight(
      withGlowRamp(
        new THREE.MeshToonMaterial({ vertexColors: true, emissive: new THREE.Color(ENEMY_GLOW[kind]) }),
        // The battleship is deliberately the least emissive thing in the
        // enemy set. Everything else is a small silhouette that has to stay
        // findable at night by glowing; the ship is enormous and finds itself,
        // so glow here only erases its panelling, turrets and stripes - the
        // only reason it reads as a ship at all.
        kind === 'boss' ? 0.05 : 0.04,
        kind === 'boss' ? 0.42 : 0.74,
      ),
      ENEMY_GLOW[kind],
      kind === 'boss' ? 0.34 : 0.3,
      2.8,
    ),
  ]),
) as Record<EnemyKind, THREE.Material>

// Cars are the bulkiest beam target on the street, and with no emissive at all
// they were the first thing to disappear once the lights came down.
export const carBodyMaterial = withGlowRamp(
  new THREE.MeshToonMaterial({ emissive: new THREE.Color('#d7d2ca') }),
  0.01,
  0.3,
)

export const carCabinMaterial = withGlowRamp(
  new THREE.MeshToonMaterial({ color: '#a9c4c5', emissive: new THREE.Color('#779da5') }),
  0.02,
  0.44,
)

/** Headlights. Dim rather than off in daylight, so the shape still reads. */
export const carLampMaterial = new THREE.MeshBasicMaterial({
  color: FX.HEADLIGHT,
  transparent: true,
  opacity: 1,
  toneMapped: false,
})

/**
 * Contact shadows under vehicles. These run opposite to the glow: a daylight
 * blob on a dark street reads as a stain, not a shadow.
 */
export const carShadowMaterial = new THREE.MeshBasicMaterial({
  color: '#5f5a68',
  transparent: true,
  opacity: 0.18,
  depthWrite: false,
})

export function applyEntityDaylight(nightFactor: number) {
  for (const ramp of glowRamps) {
    ramp.material.emissiveIntensity = ramp.day + (ramp.night - ramp.day) * nightFactor
  }
  carLampMaterial.opacity = 0.2 + nightFactor * 0.72
  carShadowMaterial.opacity = 0.18 - nightFactor * 0.05
}
