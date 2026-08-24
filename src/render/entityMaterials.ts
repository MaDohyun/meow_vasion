import * as THREE from 'three'
import { ENTITY, FX } from '../constants/palette'
import type { CrowdKind } from '../core/crowds'
import type { EnemyKind } from '../core/enemies'
import { applyNightVisibility, type NightRamp } from './nightVisibility'

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
 * Crowds and cars keep a flat emissive because their glow colours are already
 * near-neutral - they lift a body without recolouring it. The enemies could
 * not: their glows are family colours, and a family colour added flat at night
 * strength repaints the whole model. Those moved to `nightVisibility`, which
 * re-emits each surface's own colour instead. See that file for why.
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
export const ENEMY_GLOW: Record<EnemyKind, string> = {
  drone: ENTITY.DRONE_GLOW,
  helicopter: ENTITY.HELICOPTER_GLOW,
  fighter: ENTITY.FIGHTER_GLOW,
  'anti-air': ENTITY.ANTI_AIR_GLOW,
  boss: ENTITY.BOSS_GLOW,
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
 * What the night does to an enemy, in one place.
 *
 * `flat` is the only term still tinted by the family colour across the whole
 * body, and it is now a whisper - it used to run to 0.74, which is where the
 * gold wash came from. The visibility budget it was carrying moved to `lift`,
 * which re-emits the model's own colours, and to `lamp`, which lights the
 * running lights tagged in the geometry. All three rise with the night, so a
 * darker sky means an enemy carries more of its own light, not a different
 * colour.
 */
const ENEMY_NIGHT: Record<'small' | 'boss', { flat: NightRamp; lift: NightRamp; rim: NightRamp; lamp: NightRamp }> = {
  small: { flat: [0.03, 0.1], lift: [0.05, 0.72], rim: [0.1, 0.34], lamp: [0.4, 2.6] },
  // The battleship is deliberately the least emissive thing in the enemy set.
  // Everything else is a small silhouette that has to stay findable at night
  // by glowing; the ship is enormous and finds itself, so glow here only
  // erases its panelling, turrets and stripes - the only reason it reads as a
  // ship at all. Its lamps do the night work instead.
  boss: { flat: [0.03, 0.07], lift: [0.04, 0.38], rim: [0.1, 0.3], lamp: [0.35, 2.4] },
}

function makeEnemyMaterial(kind: EnemyKind) {
  const night = ENEMY_NIGHT[kind === 'boss' ? 'boss' : 'small']
  return applyNightVisibility(
    withGlowRamp(
      new THREE.MeshToonMaterial({ vertexColors: true, emissive: new THREE.Color(ENEMY_GLOW[kind]) }),
      night.flat[0],
      night.flat[1],
    ),
    { rimColor: ENEMY_GLOW[kind], rim: night.rim, lift: night.lift, lamp: night.lamp, rimPower: 2.8 },
  )
}

/** Mines draw from `drone`: they are the drone family's only member, and
 *  sharing this keeps their night behaviour identical to everything else. */
export const enemyMaterial: Record<EnemyKind, THREE.Material> = {
  drone: makeEnemyMaterial('drone'),
  helicopter: makeEnemyMaterial('helicopter'),
  fighter: makeEnemyMaterial('fighter'),
  'anti-air': makeEnemyMaterial('anti-air'),
  boss: makeEnemyMaterial('boss'),
}

/**
 * The halo each enemy carries after dark, in world metres and in strength.
 *
 * Lamps are small and bloom is a post-pass luxury that only fires on
 * near-white pixels, so the family colour needs somewhere it can be seen from
 * a distance without being painted onto the hull. This is that somewhere: an
 * additive puff of the family colour around the craft, off at noon and
 * strongest at the floor of the night. It is drawn from one pooled instanced
 * quad, so the whole effect is a single draw call and no new scene light -
 * which is the only way to add light here without recompiling every material
 * in the scene.
 */
export const ENEMY_HALO: Record<EnemyKind, { radius: number; strength: number; height: number }> = {
  // A mine already carries its blast shell, so its halo only has to say
  // "something is hanging there", not "look at this".
  drone: { radius: 2.8, strength: 0.3, height: 0 },
  helicopter: { radius: 5.4, strength: 0.5, height: 0 },
  fighter: { radius: 6.2, strength: 0.46, height: 0 },
  // The emplacement's position is its footing on the roof; its mount and lamp
  // are most of three metres above that.
  'anti-air': { radius: 6, strength: 0.44, height: 2.8 },
  // Seventy metres of hull. The radius is set so the ring clears the beam
  // rather than landing on the deck, and the strength is the lowest in the
  // set - anything more and the fight is played inside a blue cloud.
  boss: { radius: 44, strength: 0.3, height: 2 },
}

/** How the halo comes in across the cycle. Squared, so it is genuinely absent
 *  in daylight and only really arrives once the sky has committed to night. */
export function enemyHaloOpacity(nightFactor: number) {
  const t = Math.max(0, Math.min(1, nightFactor))
  return t * t * 0.92
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
