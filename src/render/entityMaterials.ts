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

function withGlowRamp(material: THREE.MeshToonMaterial, day: number, night: number) {
  glowRamps.push({ material, day, night })
  return material
}

/** Every enemy family keeps its own glow colour. A single shared colour would
 *  erase the type read the wave design depends on. */
const ENEMY_GLOW: Record<EnemyKind, string> = {
  drone: ENTITY.DRONE_GLOW,
  police: ENTITY.POLICE_GLOW,
  'police-car': ENTITY.POLICE_CAR_GLOW,
  soldier: ENTITY.SOLDIER_GLOW,
  helicopter: ENTITY.HELICOPTER_GLOW,
  fighter: ENTITY.FIGHTER_GLOW,
  'anti-air': ENTITY.ANTI_AIR_GLOW,
  tank: ENTITY.TANK_GLOW,
  boss: ENTITY.BOSS_GLOW,
}

export const crowdMaterial: Record<CrowdKind, THREE.Material> = {
  pedestrian: applyRimLight(
    withGlowRamp(new THREE.MeshToonMaterial({ vertexColors: true, emissive: new THREE.Color(ENTITY.PEDESTRIAN_GLOW) }), 0.04, 0.82),
    ENTITY.PEDESTRIAN_GLOW,
    0.34,
    2.8,
  ),
  cat: applyRimLight(
    withGlowRamp(new THREE.MeshToonMaterial({ vertexColors: true, emissive: new THREE.Color(ENTITY.CAT_GLOW) }), 0.05, 0.92),
    ENTITY.CAT_GLOW,
    0.38,
    2.8,
  ),
}

export const enemyMaterial = Object.fromEntries(
  (Object.keys(ENEMY_GLOW) as EnemyKind[]).map((kind) => [
    kind,
    applyRimLight(
      withGlowRamp(
        new THREE.MeshToonMaterial({ vertexColors: true, emissive: new THREE.Color(ENEMY_GLOW[kind]) }),
        kind === 'boss' ? 0.09 : 0.04,
        kind === 'boss' ? 1.2 : 0.74,
      ),
      ENEMY_GLOW[kind],
      kind === 'boss' ? 0.48 : 0.3,
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
