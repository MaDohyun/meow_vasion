import * as THREE from 'three'
import { ENTITY, FX } from '../constants/palette'
import type { CrowdKind } from '../core/crowds'
import type { EnemyKind } from '../core/enemies'
import { applyNightVisibility } from './nightVisibility'

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
 *
 * Crowds and cars keep a small flat emissive because their glow colours are
 * near-neutral - they lift a body without recolouring it, and a pedestrian is
 * two pixels of silhouette on a dark street. Enemies carry none: they are big
 * enough to find by shape, and every glow tried on them read as a marker
 * pasted over the city. See `nightVisibility` for what is left.
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

export const crowdMaterial: Record<CrowdKind, THREE.Material> = {
  pedestrian: applyPedestrianOutfits(applyNightVisibility(
    withGlowRamp(new THREE.MeshToonMaterial({ vertexColors: true, emissive: new THREE.Color(PEDESTRIAN_VISIBILITY_GLOW) }), 0.015, 0.16),
    { rimColor: PEDESTRIAN_VISIBILITY_GLOW, rim: [0.056, 0.16], lift: [0.01, 0.12], rimPower: 2.8 },
  ) as THREE.MeshToonMaterial),
  cat: applyNightVisibility(
    withGlowRamp(new THREE.MeshToonMaterial({ vertexColors: true, emissive: new THREE.Color(CAT_VISIBILITY_GLOW) }), 0.02, 0.22),
    { rimColor: CAT_VISIBILITY_GLOW, rim: [0.07, 0.2], lift: [0.01, 0.14], rimPower: 2.8 },
  ),
}

/**
 * Enemies are lit by the scene, and nothing else.
 *
 * They used to carry a family-coloured emissive that climbed to 0.74 at night,
 * then - after that was found to repaint every model gold - a hue-preserving
 * lift, baked running lights and a halo. All of it is gone. The glow read as
 * markers pasted over the city rather than as craft flying through it, and a
 * sky full of them was tiring to look at.
 *
 * What is left is the aiming warning, which is not decoration: it is the only
 * thing that says a helicopter has locked on, and it is completely absent until
 * one has. The battleship stays out of even that - it fires almost
 * continuously, so an always-on warning would say nothing, and its telegraph is
 * the turret ring and the aim line instead.
 */
function makeEnemyMaterial(kind: EnemyKind) {
  return applyNightVisibility(
    new THREE.MeshToonMaterial({ vertexColors: true }),
    { alert: kind !== 'boss' },
  )
}

/** Mines draw from `drone`: they are the drone family's only member, and
 *  sharing this keeps their behaviour identical to everything else. */
export const enemyMaterial: Record<EnemyKind, THREE.Material> = {
  drone: makeEnemyMaterial('drone'),
  helicopter: makeEnemyMaterial('helicopter'),
  fighter: makeEnemyMaterial('fighter'),
  'anti-air': makeEnemyMaterial('anti-air'),
  boss: makeEnemyMaterial('boss'),
}

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

/**
 * The red shell around anything that answers contact with a detonation.
 *
 * Written for the mine field and shared with the gas stations, which follow
 * the same rule: the sphere is the promise of a blast, drawn at the size of
 * one. Brightness rides a per-instance `aCharge` attribute - a low breathing
 * idle, a hard climbing value while a fuse runs.
 */
export const BLAST_FIELD_VERTEX = `
attribute float aCharge;
varying vec3 vViewNormal;
varying vec3 vViewPosition;
varying float vCharge;
void main() {
  vCharge = aCharge;
  vec4 world = instanceMatrix * vec4(position, 1.0);
  vec4 view = modelViewMatrix * world;
  vViewNormal = normalize(normalMatrix * (mat3(instanceMatrix) * normal));
  vViewPosition = view.xyz;
  gl_Position = projectionMatrix * view;
}
`

export const BLAST_FIELD_FRAGMENT = `
varying vec3 vViewNormal;
varying vec3 vViewPosition;
varying float vCharge;

void main() {
  // A plain red bubble, not a shield.
  //
  // This carried a hex lattice, which is the visual language of something that
  // stops shots - the wrong promise entirely for a line that means "inside
  // this you die". Without it there is nothing to read but the shape and the
  // colour, which is all the warning needs to say.
  //
  // Face-on it is a thin haze, so the thing inside stays visible; edge-on the
  // fresnel closes it into a hard sphere, which is what makes the boundary
  // itself legible from outside.
  //
  // The face-on term is deliberately thin. The mine sits at the centre of this
  // sphere, so every bit of it is red laid over the model - which is most of
  // why a drone read as a red object rather than a grey frame with gold rotors
  // and a maroon warhead. The rim carries the extra instead: that is where the
  // blast radius actually is, and it is what has to be read from outside.
  float facing = abs(dot(normalize(vViewNormal), normalize(-vViewPosition)));
  float rim = pow(1.0 - facing, 2.2);

  float alpha = (rim * 0.92 + 0.042) * vCharge;
  // Runs white-hot as the fuse closes rather than just brighter red.
  vec3 tint = mix(vec3(1.0, 0.17, 0.24), vec3(1.0, 0.78, 0.6), clamp(vCharge - 1.0, 0.0, 1.0));
  gl_FragColor = vec4(tint * (0.6 + vCharge * 0.9), clamp(alpha, 0.0, 1.0));
}
`

export function makeBlastFieldMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: BLAST_FIELD_VERTEX,
    fragmentShader: BLAST_FIELD_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
}
