import { sizeCameraLift, ufoDiameter } from '../core/size'
import { Edges } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useGame } from '../GameContext'
import { BUILDING, ENTITY, FX, LIGHT, SKY } from '../constants/palette'
import {
  applyEntityDaylight,
  carBodyMaterial,
  carCabinMaterial,
  carLampMaterial,
  carShadowMaterial,
  crowdMaterial,
  ENEMY_GLOW,
  ENEMY_HALO,
  enemyHaloOpacity,
  enemyMaterial,
  makeBlastFieldMaterial,
} from './entityMaterials'
import {
  SHAKE_CAMERA_PITCH,
  SHAKE_CAMERA_ROLL,
  SHAKE_CAMERA_YAW,
  SHAKE_CRAFT_OFFSET,
  SHAKE_CRAFT_ROLL,
  createShakeSample,
  sampleShake,
} from '../core/shake'
import { setNightVisibility } from './nightVisibility'
import { entityHaloTexture, orbFlareTexture, radialGlowTexture } from './textures'
import { BEAM_ABSORB_TIME, beamLiftScale, beamObjectDiameter, beamProfile, beamVisualLength, type BeamObject } from '../core/beam'
import { CAT_MAX, CROWD_ABSORB_TIME, PEDESTRIAN_MAX, pedestrianOutfitForSlot, type CrowdKind } from '../core/crowds'
import { HAZARD_MAX } from '../core/hazards'
import { type DaylightKeyframe, type DaylightSample } from '../core/daylight'
import {
  BATTLESHIP_BEAM_WIDTH,
  BATTLESHIP_LENGTH,
  BATTLESHIP_TURRETS,
  ENEMY_CAPS,
  ENEMY_MAX_PROJECTILES,
  DRONE_MINE_BLAST_RADIUS,
  DRONE_MINE_FUSE,
  DRONE_MINE_MODEL_SCALE,
  type EnemyKind,
} from '../core/enemies'
import {
  LASER_MAX_PROJECTILES,
  LASER_MAX_BURSTS,
} from '../core/laser'
import {
  FIREBALL_MAX,
  FIREBALL_PUFFS,
  fireballPuffCentre,
  fireballPuffProgress,
  fireballPuffRadius,
} from '../core/fireball'
import { TRAFFIC_MAX_CARS } from '../core/traffic'
import { WORLD_MAX_CARS } from '../core/world'
import { City, applyCityDaylight } from './City'
import { PostFx } from './PostFx'

const roundedCarBodyGeometry = new RoundedBoxGeometry(1.8, 0.62, 3.1, 2, 0.15)
const roundedCarCabinGeometry = new RoundedBoxGeometry(1.55, 0.62, 1.55, 2, 0.18)
const beamRingGeometry = new THREE.RingGeometry(0.9, 1, 28)
const BEAM_RING_COUNT = 5
/**
 * How far above the craft the chase camera's eye sits, before speed, altitude
 * and size add their own lift.
 */
const CHASE_EYE_HEIGHT = 3.6

/**
 * How far the whole chase rig sits below where it used to.
 *
 * Taken off the eye and the look-at point alike, so the camera's angle is
 * untouched and only the frame slides down: the craft rides a little higher on
 * screen and more of the street it is reaching into comes into view. Dropping
 * the eye alone would have tilted the camera up at the sky instead, which is
 * backwards for a game whose only verb points at the ground - and it would
 * have changed how flying reads, which this deliberately does not.
 */
const CHASE_RIG_DROP = 0.6

/**
 * How fast the hull strobes red while a hit flash is fading, in radians per
 * second - about five blinks a second, so the flash's own third of a second
 * carries two of them. Fast enough to read as an alarm rather than a pulse,
 * slow enough that a 60Hz frame catches both halves of every cycle.
 */
const IMPACT_BLINK_RATE = 32

const BEAM_TARGET_RING_CAPACITY = WORLD_MAX_CARS + TRAFFIC_MAX_CARS + 8 + PEDESTRIAN_MAX + CAT_MAX + HAZARD_MAX + Object.values(ENEMY_CAPS).reduce((sum, count) => sum + count, 0)
const beamTargetRingMaterial = new THREE.MeshBasicMaterial({
  color: '#a7fff0',
  transparent: true,
  opacity: 0.82,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
})

/**
 * One part of a merged model: its colour baked into the vertices, plus how
 * much of a lamp it is.
 *
 * `lamp` is what makes a part a light rather than a surface. The night
 * material multiplies the part's own colour by it and adds the result on top
 * of the lit shading, so a value near 1 burns far past everything around it
 * and reads as a running light, while 0 - every ordinary panel - is untouched.
 * It rides the geometry rather than a second material because these models are
 * a single merged `InstancedMesh` each; a separate lamp mesh would be a second
 * draw call per family for a handful of triangles.
 *
 * Lamps are painted pale rather than saturated on purpose. Tone mapping rolls
 * a bright saturated colour off into that same colour, so a hot red lamp just
 * looks like flat red paint; a pale one goes white-hot at the core and lets
 * the post pass's bright filter catch it, which is what gives the lamp a
 * bloom instead of an outline. The saturated family colour lives in the halo
 * around the craft, where there is room for it.
 */
function coloredPart(geometry: THREE.BufferGeometry, color: string, lamp = 0) {
  const result = geometry.index ? geometry.toNonIndexed() : geometry
  if (result !== geometry) geometry.dispose()
  const tint = new THREE.Color(color)
  const count = result.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let index = 0; index < colors.length; index += 3) {
    colors[index] = tint.r
    colors[index + 1] = tint.g
    colors[index + 2] = tint.b
  }
  result.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  // Every part carries the attribute, lamp or not: `mergeGeometries` needs one
  // attribute set across the whole model.
  result.setAttribute('aLamp', new THREE.BufferAttribute(new Float32Array(count).fill(lamp), 1))
  return result
}

/** Pale lamp colours. See `coloredPart` for why they are not saturated. */
const LAMP = {
  /** Port and starboard running lights, in the colours aircraft use. */
  PORT: '#ffd8dd',
  STARBOARD: '#d6ffe0',
  /** Anti-collision strobe and tail beacon. */
  BEACON: '#fff0cf',
  /** Exhaust and drive glow. */
  DRIVE: '#cdeeff',
  /** The one warning lamp: an armed fuse, a tracking gun. */
  ALERT: '#ffd7cd',
} as const

function unindexedPart(geometry: THREE.BufferGeometry) {
  if (!geometry.index) return geometry
  const result = geometry.toNonIndexed()
  geometry.dispose()
  return result
}

function mergeModel(parts: THREE.BufferGeometry[]) {
  const geometry = mergeGeometries(parts, false)
  for (const part of parts) part.dispose()
  if (!geometry) throw new Error('Unable to merge procedural model geometry')
  geometry.computeBoundingSphere()
  return geometry
}

// Dark "button eyes" for the crowd - vertex-colored near-black, so they read
// as dark dots under every instance tint instead of getting washed out by it
// (instance color multiplies the vertex color, and near-zero stays near-zero).
const EYE_COLOR = '#1e1728'

function eyePair(radius: number, x: number, y: number, z: number) {
  return [-x, x].map((eyeX) => coloredPart(new THREE.SphereGeometry(radius, 6, 5).translate(eyeX, y, z), EYE_COLOR))
}

const PEDESTRIAN_SKIN = '#efb184'
const PEDESTRIAN_HAIR = '#2b2430'
const PEDESTRIAN_SHOE = '#282630'
const PEDESTRIAN_TOP_VARIANT_OFFSET = 1
const PEDESTRIAN_BOTTOM_VARIANT_OFFSET = 11

/** Part tags let one instanced material colour tops and bottoms independently. */
function pedestrianPart(
  geometry: THREE.BufferGeometry,
  colorValue: string,
  outfitPart: 0 | 1 | 2 | 3,
  outfitVariant = 0,
) {
  const result = coloredPart(geometry, colorValue)
  const count = result.getAttribute('position').count
  const parts = new Float32Array(count)
  const variants = new Float32Array(count)
  parts.fill(outfitPart)
  variants.fill(outfitVariant)
  result.setAttribute('outfitPart', new THREE.BufferAttribute(parts, 1))
  result.setAttribute('outfitVariant', new THREE.BufferAttribute(variants, 1))
  return result
}

function pedestrianEyes() {
  return [-0.13, 0.13].map((x) => pedestrianPart(
    new THREE.SphereGeometry(0.055, 6, 5).translate(x, 0.99, 0.32),
    EYE_COLOR,
    0,
  ))
}

function pedestrianArmParts(style: number, sleeveLength: number, handY: number) {
  const variant = PEDESTRIAN_TOP_VARIANT_OFFSET + style
  return [-1, 1].flatMap((side) => [
    pedestrianPart(
      new THREE.BoxGeometry(0.18, sleeveLength, 0.2)
        .rotateZ(side * -0.28)
        .translate(side * 0.44, 0.12 - sleeveLength * 0.22, 0),
      '#ffffff',
      1,
      variant,
    ),
    pedestrianPart(
      new THREE.SphereGeometry(0.105, 6, 5).translate(side * 0.52, handY, 0),
      PEDESTRIAN_SKIN,
      0,
      variant,
    ),
  ])
}

function pedestrianGeometry() {
  const parts = [
    // Head, hair and eyes never inherit clothing tints, so skin stays a
    // natural peach even when a bright top and dark trousers are combined.
    pedestrianPart(new THREE.SphereGeometry(0.34, 8, 6).translate(0, 0.96, 0), PEDESTRIAN_SKIN, 0),
    pedestrianPart(
      new THREE.SphereGeometry(0.355, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.07, 0),
      PEDESTRIAN_HAIR,
      0,
    ),
    ...pedestrianEyes(),

    // Top 0: short-sleeved T-shirt with exposed forearms.
    pedestrianPart(new THREE.CapsuleGeometry(0.34, 0.62, 4, 8).translate(0, 0.04, 0), '#ffffff', 1, 1),
    ...pedestrianArmParts(0, 0.3, -0.28),
    ...[-1, 1].map((side) => pedestrianPart(
      new THREE.BoxGeometry(0.13, 0.38, 0.16).rotateZ(side * -0.28).translate(side * 0.49, -0.11, 0),
      PEDESTRIAN_SKIN,
      0,
      1,
    )),

    // Top 1: relaxed knit with long sleeves and a visible undershirt hem.
    pedestrianPart(new THREE.CapsuleGeometry(0.37, 0.68, 4, 8).translate(0, 0.02, 0), '#ffffff', 1, 2),
    ...pedestrianArmParts(1, 0.78, -0.35),
    pedestrianPart(new THREE.BoxGeometry(0.55, 0.08, 0.05).translate(0, -0.53, 0.31), '#f2eee3', 3, 2),

    // Top 2: suit jacket, pale shirt, lapels and tie.
    pedestrianPart(new THREE.CapsuleGeometry(0.36, 0.72, 4, 8).translate(0, 0.03, 0), '#ffffff', 1, 3),
    ...pedestrianArmParts(2, 0.8, -0.36),
    pedestrianPart(new THREE.BoxGeometry(0.17, 0.55, 0.045).translate(0, 0.12, 0.35), '#eee9df', 0, 3),
    pedestrianPart(new THREE.BoxGeometry(0.11, 0.38, 0.045).rotateZ(-0.38).translate(-0.09, 0.27, 0.37), '#d9d3ca', 0, 3),
    pedestrianPart(new THREE.BoxGeometry(0.11, 0.38, 0.045).rotateZ(0.38).translate(0.09, 0.27, 0.37), '#d9d3ca', 0, 3),
    pedestrianPart(new THREE.ConeGeometry(0.07, 0.34, 3).translate(0, 0.16, 0.39), '#463348', 3, 3),

    // Top 3: long city coat with a bright scarf.
    pedestrianPart(new THREE.CapsuleGeometry(0.41, 0.94, 4, 8).translate(0, -0.08, 0), '#ffffff', 1, 4),
    ...pedestrianArmParts(3, 0.86, -0.39),
    pedestrianPart(new THREE.TorusGeometry(0.2, 0.055, 4, 8).rotateX(Math.PI / 2).translate(0, 0.58, 0), '#ffffff', 3, 4),
    pedestrianPart(new THREE.BoxGeometry(0.13, 0.47, 0.055).translate(0.11, 0.31, 0.4), '#ffffff', 3, 4),

    // Bottom 0: slim suit trousers.
    ...[-1, 1].flatMap((side) => [
      pedestrianPart(new THREE.BoxGeometry(0.18, 0.76, 0.22).translate(side * 0.15, -0.8, 0), '#ffffff', 2, 11),
      pedestrianPart(new THREE.BoxGeometry(0.22, 0.15, 0.34).translate(side * 0.15, -1.2, 0.07), PEDESTRIAN_SHOE, 0, 11),
    ]),

    // Bottom 1: the wide black trousers from the streetwear reference.
    ...[-1, 1].flatMap((side) => [
      pedestrianPart(new THREE.BoxGeometry(0.31, 0.82, 0.29).translate(side * 0.17, -0.81, 0), '#ffffff', 2, 12),
      pedestrianPart(new THREE.BoxGeometry(0.3, 0.15, 0.38).translate(side * 0.17, -1.24, 0.08), PEDESTRIAN_SHOE, 0, 12),
    ]),

    // Bottom 2: straight jeans with contrasting cuffs.
    ...[-1, 1].flatMap((side) => [
      pedestrianPart(new THREE.BoxGeometry(0.23, 0.71, 0.25).translate(side * 0.16, -0.77, 0), '#ffffff', 2, 13),
      pedestrianPart(new THREE.BoxGeometry(0.245, 0.09, 0.27).translate(side * 0.16, -1.1, 0), '#ffffff', 3, 13),
      pedestrianPart(new THREE.BoxGeometry(0.25, 0.15, 0.35).translate(side * 0.16, -1.21, 0.08), PEDESTRIAN_SHOE, 0, 13),
    ]),

    // Bottom 3: skirt, bare legs and compact shoes.
    pedestrianPart(new THREE.CylinderGeometry(0.29, 0.43, 0.62, 7).translate(0, -0.56, 0), '#ffffff', 2, 14),
    ...[-1, 1].flatMap((side) => [
      pedestrianPart(new THREE.BoxGeometry(0.13, 0.42, 0.15).translate(side * 0.14, -0.99, 0), PEDESTRIAN_SKIN, 0, 14),
      pedestrianPart(new THREE.BoxGeometry(0.2, 0.14, 0.32).translate(side * 0.14, -1.22, 0.07), PEDESTRIAN_SHOE, 0, 14),
    ]),
  ]
  const geometry = mergeModel(parts)
  geometry.setAttribute('outfitTopStyle', new THREE.InstancedBufferAttribute(new Float32Array(PEDESTRIAN_MAX), 1).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('outfitBottomStyle', new THREE.InstancedBufferAttribute(new Float32Array(PEDESTRIAN_MAX), 1).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('outfitTopTint', new THREE.InstancedBufferAttribute(new Float32Array(PEDESTRIAN_MAX * 3), 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('outfitBottomTint', new THREE.InstancedBufferAttribute(new Float32Array(PEDESTRIAN_MAX * 3), 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('outfitDetailTint', new THREE.InstancedBufferAttribute(new Float32Array(PEDESTRIAN_MAX * 3), 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('outfitBeamLit', new THREE.InstancedBufferAttribute(new Float32Array(PEDESTRIAN_MAX), 1).setUsage(THREE.DynamicDrawUsage))
  return geometry
}

/**
 * A cat, and it has to read as much smaller than a person.
 *
 * It was drawn at very nearly pedestrian size, which threw away the thing that
 * makes it worth chasing: small, quick and awkward to catch, and paid better
 * for exactly that. If the two are the same size on screen the difference is
 * just a colour.
 */
const CAT_SCALE = 0.52

function catGeometry() {
  return mergeModel([
    // The base is pale so the instance tint can produce either a tuxedo
    // (white with dark patches) or an orange tabby without another mesh pool.
    coloredPart(new THREE.BoxGeometry(0.76, 0.5, 1.16), '#fff7e7'),
    coloredPart(new THREE.BoxGeometry(0.64, 0.58, 0.54).translate(0, 0.2, 0.68), '#fff7e7'),
    coloredPart(new THREE.ConeGeometry(0.15, 0.4, 4).rotateZ(-0.18).translate(-0.23, 0.58, 0.7), '#fff7e7'),
    coloredPart(new THREE.ConeGeometry(0.15, 0.4, 4).rotateZ(0.18).translate(0.23, 0.58, 0.7), '#fff7e7'),
    coloredPart(new THREE.CylinderGeometry(0.08, 0.11, 1.08, 6).rotateX(-0.65).translate(0, 0.1, -0.82), '#fff7e7'),
    // A few broad low-poly patches read as a black-and-white coat at a
    // distance. On orange instances they become warm brown tabby markings.
    coloredPart(new THREE.BoxGeometry(0.38, 0.24, 0.035).translate(-0.16, 0.03, 0.594), '#25232c'),
    coloredPart(new THREE.BoxGeometry(0.24, 0.18, 0.035).translate(0.17, 0.16, 0.594), '#25232c'),
    coloredPart(new THREE.BoxGeometry(0.19, 0.14, 0.035).translate(-0.17, 0.29, 0.956), '#25232c'),
    coloredPart(new THREE.BoxGeometry(0.14, 0.09, 0.035).translate(0.19, 0.37, 0.956), '#25232c'),
    ...[-0.25, 0.25].flatMap((x) => [-0.32, 0.32].map((z) =>
      coloredPart(new THREE.BoxGeometry(0.13, 0.42, 0.14).translate(x, -0.4, z), '#fff7e7'),
    )),
    ...eyePair(0.065, 0.14, 0.28, 0.97),
  ]).scale(CAT_SCALE, CAT_SCALE, CAT_SCALE).translate(0, -0.34 * (1 - CAT_SCALE), 0)
}

function helicopterGeometry() {
  return mergeModel([
    coloredPart(new THREE.CapsuleGeometry(0.72, 2.1, 5, 9).rotateX(Math.PI / 2), '#6f608b'),
    coloredPart(new THREE.SphereGeometry(0.76, 10, 7).scale(1, 0.72, 1.08).translate(0, 0.02, 1.25), '#8ed8df', 0.3),
    coloredPart(new THREE.BoxGeometry(0.38, 0.38, 3.2).translate(0, 0.12, -2.35), '#5a526c'),
    coloredPart(new THREE.BoxGeometry(6.4, 0.12, 0.22).translate(0, 0.92, 0), '#332f45'),
    coloredPart(new THREE.BoxGeometry(0.22, 0.12, 6.4).translate(0, 0.92, 0), '#332f45'),
    coloredPart(new THREE.BoxGeometry(0.12, 1.9, 0.18).translate(0.08, 0.32, -4), '#332f45'),
    coloredPart(new THREE.BoxGeometry(0.12, 0.18, 1.9).translate(0.08, 0.32, -4), '#332f45'),
    // Running lights: red to port, green to starboard, an amber beacon on the
    // fin and a strobe under the belly. Four points of light in a fixed
    // arrangement is how a helicopter is told from a fighter at night, and it
    // survives a distance where the hull is four pixels of purple.
    coloredPart(new THREE.SphereGeometry(0.13, 6, 5).translate(-0.7, -0.04, 0.18), LAMP.PORT, 1),
    coloredPart(new THREE.SphereGeometry(0.13, 6, 5).translate(0.7, -0.04, 0.18), LAMP.STARBOARD, 1),
    coloredPart(new THREE.SphereGeometry(0.12, 6, 5).translate(0.08, 1.28, -4), LAMP.BEACON, 1),
    coloredPart(new THREE.SphereGeometry(0.11, 6, 5).translate(0, -0.62, 0.1), LAMP.BEACON, 0.9),
  ])
}

function antiAirGeometry() {
  return mergeModel([
    coloredPart(new THREE.CylinderGeometry(1.12, 1.28, 1.2, 8).translate(0, 0.45, 0), '#514d62'),
    coloredPart(new THREE.SphereGeometry(0.78, 8, 5).scale(1, 0.65, 1).translate(0, 1.22, 0), '#736481'),
    coloredPart(new THREE.CylinderGeometry(0.13, 0.18, 2.8, 7).rotateX(Math.PI / 2).rotateZ(-0.16).translate(-0.26, 1.62, 1.25), '#282b38'),
    coloredPart(new THREE.CylinderGeometry(0.13, 0.18, 2.8, 7).rotateX(Math.PI / 2).rotateZ(0.16).translate(0.26, 1.62, 1.25), '#282b38'),
    // An emplacement sits on a roof, which is the busiest surface in the city
    // at night. A warning lamp on the mount and two on the base rim are what
    // separate it from the plant and aerials it is standing among.
    coloredPart(new THREE.SphereGeometry(0.17, 7, 5).translate(0, 1.84, -0.15), LAMP.ALERT, 1),
    coloredPart(new THREE.SphereGeometry(0.11, 6, 5).translate(-0.94, 1.02, 0.42), LAMP.BEACON, 0.7),
    coloredPart(new THREE.SphereGeometry(0.11, 6, 5).translate(0.94, 1.02, 0.42), LAMP.BEACON, 0.7),
  ])
}

function fighterGeometry() {
  return mergeModel([
    coloredPart(new THREE.ConeGeometry(0.68, 4.5, 7).rotateX(Math.PI / 2), '#e9e1da'),
    coloredPart(new THREE.BoxGeometry(4.8, 0.14, 1.45).translate(0, -0.08, -0.28), '#cf7087'),
    coloredPart(new THREE.BoxGeometry(1.7, 0.12, 1).translate(0, 0.02, -1.72), '#76628f'),
    coloredPart(new THREE.BoxGeometry(0.16, 1.15, 0.92).translate(0, 0.48, -1.72), '#655678'),
    coloredPart(new THREE.SphereGeometry(0.34, 8, 5).scale(0.8, 0.55, 1.5).translate(0, 0.42, 0.78), '#77dce8', 0.34),
    // Wingtips and a burner. A fighter only ever shows the player one straight
    // pass, so its night read is a wide pair of tip lights with a hot exhaust
    // trailing behind them - which is also the direction it is going.
    coloredPart(new THREE.SphereGeometry(0.14, 6, 5).translate(-2.32, -0.06, -0.28), LAMP.PORT, 1),
    coloredPart(new THREE.SphereGeometry(0.14, 6, 5).translate(2.32, -0.06, -0.28), LAMP.STARBOARD, 1),
    coloredPart(new THREE.CylinderGeometry(0.38, 0.3, 0.16, 9).rotateX(Math.PI / 2).translate(0, 0, -2.3), LAMP.DRIVE, 0.75),
  ])
}

// Every drone is a proximity mine. The cross-frame and four propellers make
// its silhouette readable before the red fuse pulse; the suspended bomb gives
// the armed state a clear centre of mass.
const mineGeometry = mergeModel([
  coloredPart(new THREE.BoxGeometry(2.1, 0.12, 0.18), '#596273'),
  coloredPart(new THREE.BoxGeometry(0.18, 0.12, 2.1), '#596273'),
  coloredPart(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 8).translate(-1.18, 0.02, 0), '#d4a24b'),
  coloredPart(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 8).translate(1.18, 0.02, 0), '#d4a24b'),
  coloredPart(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 8).translate(0, 0.02, -1.18), '#d4a24b'),
  coloredPart(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 8).translate(0, 0.02, 1.18), '#d4a24b'),
  coloredPart(new THREE.CylinderGeometry(0.38, 0.48, 0.76, 8).translate(0, -0.62, 0), '#7e3a4b'),
  // The fuse. The one lamp on the model, so the thing the eye is drawn to is
  // the part that decides whether the mine is about to go off.
  coloredPart(new THREE.SphereGeometry(0.13, 6, 4).translate(0, -0.18, 0), LAMP.ALERT, 1),
  // Rotor-tip pips. Faint, but they draw the mine's cross at a range where the
  // frame itself is a couple of pixels.
  ...[[-1.18, 0], [1.18, 0], [0, -1.18], [0, 1.18]].map(([x, z]) =>
    coloredPart(new THREE.SphereGeometry(0.075, 5, 4).translate(x, 0.09, z), LAMP.BEACON, 0.55),
  ),
])

/**
 * What an armed mine turns into. Idle mines are left alone.
 *
 * The instance tint used to hold every mine at roughly this red the whole time
 * it existed, which multiplied straight through the baked vertex colours - the
 * grey frame, the gold rotor caps and the maroon warhead all came out as one
 * red object. Reserving the red for the armed state gives the model its own
 * colours back and makes the flash mean something: red is a fuse running, not
 * "this is a mine".
 */
const mineArmedTint = new THREE.Color('#ff4a5c')

/** Idle mines sit just under white so the baked colours come through as
 *  authored, matching what the other enemy pools write. */
const mineIdleTint = 0.86

/**
 * Earth's last resort - a flying capital ship, built along +Z so the hull's
 * length lines up with the heading the simulation turns it to.
 *
 * It replaces the oversized saucer the final wave used to send. A bigger copy
 * of the player's own craft says nothing; a warship in the sky says the city
 * has stopped improvising. Everything here is in service of one silhouette
 * read at a hundred metres: long hull, raked bow, a tower amidships, engines
 * aft, and a row of turrets down each flank - the same six positions the
 * broadside walks along, so the shots visibly come from the guns.
 */
function bossGeometry() {
  const half = BATTLESHIP_LENGTH / 2
  const width = BATTLESHIP_BEAM_WIDTH
  return mergeModel([
    // Hull: a slab, a chamfered underside, and a bow wedge.
    coloredPart(new RoundedBoxGeometry(width, 6.2, BATTLESHIP_LENGTH * 0.86, 2, 0.9), '#5a6572'),
    coloredPart(new RoundedBoxGeometry(width * 0.74, 3.4, BATTLESHIP_LENGTH * 0.8, 2, 0.7).translate(0, -3.6, -1), '#3d4652'),
    coloredPart(new THREE.ConeGeometry(width * 0.5, 15, 4).rotateX(Math.PI / 2).rotateZ(Math.PI / 4).scale(1, 0.42, 1).translate(0, -0.3, half * 0.86 + 5.4), '#5a6572'),
    // Deck line, so the hull has a top edge instead of reading as one block.
    coloredPart(new THREE.BoxGeometry(width * 0.9, 0.5, BATTLESHIP_LENGTH * 0.84).translate(0, 3.2, 0), '#6e7a88'),
    // Tower amidships: bridge, mast, and a sensor drum.
    coloredPart(new RoundedBoxGeometry(width * 0.42, 7, 12, 2, 0.5).translate(0, 6.4, -3), '#4a5462'),
    coloredPart(new RoundedBoxGeometry(width * 0.3, 4.2, 7.4, 2, 0.4).translate(0, 11.4, -2), '#59636f'),
    coloredPart(new THREE.CylinderGeometry(0.5, 0.7, 9, 6).translate(0, 17, -2), '#2b3340'),
    coloredPart(new THREE.SphereGeometry(1.7, 10, 7).translate(0, 14.4, -2), '#8fa6b8'),
    // Engines aft: nozzles plus the glow bar that keeps it visible at night.
    ...[-1, 1].map((side) =>
      coloredPart(new THREE.CylinderGeometry(2.5, 2.9, 5, 10).rotateX(Math.PI / 2).translate(side * width * 0.26, -0.6, -half * 0.86 - 1.6), '#333c49'),
    ),
    coloredPart(new THREE.BoxGeometry(width * 0.66, 1, 0.8).translate(0, -0.6, -half * 0.86 - 4.1), '#7ad4ff', 0.8),
    // Anti-gravity strip down the keel. The ship has to be legible from
    // underneath - that is the angle the player spends the fight at.
    coloredPart(new THREE.BoxGeometry(2.2, 0.5, BATTLESHIP_LENGTH * 0.7).translate(0, -5.2, 0), '#7ad4ff', 0.55),
    // Turrets, at exactly the positions the guns fire from.
    ...BATTLESHIP_TURRETS.flatMap((along, index) => {
      const z = along * half
      const side = index % 2 === 0 ? -1 : 1
      const barrel = index === BATTLESHIP_TURRETS.length - 1 ? 9 : 6
      return [
        coloredPart(new THREE.CylinderGeometry(2.1, 2.4, 1.8, 10).translate(side * width * 0.26, 3.9, z), '#6b7a8a'),
        coloredPart(new THREE.BoxGeometry(2.6, 1.9, 3).translate(side * width * 0.26, 5, z), '#48525f'),
        coloredPart(new THREE.CylinderGeometry(0.42, 0.5, barrel, 7).rotateZ(Math.PI / 2).translate(side * (width * 0.26 + barrel * 0.5), 5.2, z), '#2b3340'),
      ]
    }),
    // Hazard stripes along the flanks, the one warm colour on the ship.
    ...[-1, 1].map((side) =>
      coloredPart(new THREE.BoxGeometry(0.4, 0.7, BATTLESHIP_LENGTH * 0.6).translate(side * width * 0.5, 1.4, 0), '#f3b24d'),
    ),
    // Masthead and running lights. A ship this size is found by its lights
    // long before its hull resolves, and they are the only part of it that
    // says which way it is pointing from directly underneath.
    coloredPart(new THREE.SphereGeometry(0.7, 7, 5).translate(0, 21.6, -2), LAMP.BEACON, 1),
    coloredPart(new THREE.SphereGeometry(0.6, 7, 5).translate(-width * 0.5, 3.6, half * 0.55), LAMP.PORT, 1),
    coloredPart(new THREE.SphereGeometry(0.6, 7, 5).translate(width * 0.5, 3.6, half * 0.55), LAMP.STARBOARD, 1),
    coloredPart(new THREE.SphereGeometry(0.55, 7, 5).translate(0, 3.6, -half * 0.8), LAMP.BEACON, 0.9),
  ])
}

declare global {
  interface Window {
    /** Dev-only live pose, refreshed every frame (the metrics block below is
     *  throttled to 0.5s, which is too coarse to steer a scripted flight). */
    __BEAM_BANDIT_POSE__?: { x: number; y: number; z: number; heading: number }
    __BEAM_BANDIT_METRICS__?: {
      activeBuildings: number
      activeCars: number
      activeTraffic: number
      activeLaserProjectiles: number
      activeEnemies: number
      activeCrowds: number
      beamedCrowds: number
      activeHazards: number
      ballast: number
      absorbedCount: number
      size: number
      activeEnemyProjectiles: number
      laserShotsFired: number
      /** Pickup levels, so a boon's effect can be verified from outside. */
      boonLevels: Record<string, number>
      beamReachScale: number
      height: number
      missionStage: number
      remainingTime: number
      tutorialCats: number
      visibleMeshPools: number
    }
  }
}

function PullableCars() {
  const { runtime } = useGame()
  const body = useRef<THREE.InstancedMesh>(null)
  const cabin = useRef<THREE.InstancedMesh>(null)
  const lightbar = useRef<THREE.InstancedMesh>(null)
  const glow = useRef<THREE.InstancedMesh>(null)
  const shadow = useRef<THREE.InstancedMesh>(null)
  const base = useMemo(() => new THREE.Matrix4(), [])
  const local = useMemo(() => new THREE.Matrix4(), [])
  const composed = useMemo(() => new THREE.Matrix4(), [])
  const projection = useMemo(() => new THREE.Matrix4(), [])
  const frustum = useMemo(() => new THREE.Frustum(), [])
  const sphere = useMemo(() => new THREE.Sphere(new THREE.Vector3(), 2.2), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(0.8, 0.8, 0.8), [])
  const glowScale = useMemo(() => new THREE.Vector3(), [])
  const shadowScale = useMemo(() => new THREE.Vector3(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const planeQuaternion = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), [])
  const euler = useMemo(() => new THREE.Euler(), [])
  const color = useMemo(() => new THREE.Color(), [])

  useFrame(({ camera }) => {
    if (!body.current || !cabin.current || !lightbar.current || !glow.current || !shadow.current) return
    projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(projection)
    let visibleCount = 0
    let glowCount = 0
    for (const object of runtime.current.beamObjects) {
      // beamObjects also carries buildings and every piece of city dressing
      // (trees, lamps, bins, benches, shelters). Those own their own render
      // pools; drawing them here stamped a full car body, cabin, lightbar and
      // ground shadow onto each one, which read as a car jammed into the prop.
      if (!object.active || object.kind !== 'car') continue
      position.set(object.position.x, object.position.y, object.position.z)
      if (camera.position.distanceToSquared(position) > 180 * 180) continue
      sphere.center.copy(position)
      if (!frustum.intersectsSphere(sphere)) continue

      euler.set(object.rotation.x, object.rotation.y, object.rotation.z)
      quaternion.setFromEuler(euler)
      const absorbScale = object.absorbing ? Math.max(0.04, object.absorbTimer / BEAM_ABSORB_TIME) : 1
      scale.setScalar(0.8 * absorbScale)
      base.compose(position, quaternion, scale)
      body.current.setMatrixAt(visibleCount, base)
      body.current.setColorAt(visibleCount, color.set(object.color))

      local.makeTranslation(0, 0.53, -0.15)
      cabin.current.setMatrixAt(visibleCount, composed.copy(base).multiply(local))
      local.makeTranslation(0, 0.9, -0.15)
      lightbar.current.setMatrixAt(visibleCount, composed.copy(base).multiply(local))

      position.set(object.position.x + 0.25, 0.035, object.position.z + 0.28)
      shadowScale.set(2.25, 3.25, 1)
      composed.compose(position, planeQuaternion, shadowScale)
      shadow.current.setMatrixAt(visibleCount, composed)

      if (object.tether > 0.02) {
        glowScale.setScalar(0.8 + object.tether * 0.35)
        local.makeRotationX(-Math.PI / 2)
        local.setPosition(0, -0.31, 0)
        composed.copy(base).multiply(local).scale(glowScale)
        glow.current.setMatrixAt(glowCount, composed)
        glowCount += 1
      }
      visibleCount += 1
    }

    for (const mesh of [body.current, cabin.current, lightbar.current, shadow.current]) {
      mesh.count = visibleCount
      mesh.instanceMatrix.needsUpdate = true
    }
    if (body.current.instanceColor) body.current.instanceColor.needsUpdate = true
    glow.current.count = glowCount
    glow.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={shadow} args={[undefined, undefined, WORLD_MAX_CARS + TRAFFIC_MAX_CARS]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <primitive object={carShadowMaterial} attach="material" />
      </instancedMesh>
      <instancedMesh ref={body} args={[roundedCarBodyGeometry, carBodyMaterial, WORLD_MAX_CARS + TRAFFIC_MAX_CARS]} frustumCulled={false} />
      <instancedMesh ref={cabin} args={[roundedCarCabinGeometry, carCabinMaterial, WORLD_MAX_CARS + TRAFFIC_MAX_CARS]} frustumCulled={false} />
      <instancedMesh ref={lightbar} args={[undefined, undefined, WORLD_MAX_CARS + TRAFFIC_MAX_CARS]} frustumCulled={false}>
        <boxGeometry args={[0.95, 0.16, 0.28]} />
        <primitive object={carLampMaterial} attach="material" />
      </instancedMesh>
      <instancedMesh ref={glow} args={[undefined, undefined, WORLD_MAX_CARS + TRAFFIC_MAX_CARS]} frustumCulled={false} renderOrder={3}>
        <ringGeometry args={[1.25, 1.55, 18]} />
        <meshBasicMaterial color="#a7fff0" transparent opacity={0.9} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

/**
 * A shared cyan target ring for every object the beam can actually lift.
 * Cars keep their existing ring in PullableCars; the common pool covers people,
 * cats, heavy vehicles, buildings and liftable enemies without allocating a
 * mesh per target. Objects above the current grip band stay unmarked so the
 * effect never promises a pull the craft cannot perform.
 *
 * Lift, not swallow. The ring marks what the beam can move, which is the
 * weight ladder's question; whether the thing will then fit through the hull
 * is a separate one (see maxAbsorbDiameter in GameContext). A ringed load
 * wider than the craft is carried rather than eaten - honest, because the
 * promise the ring makes is the pull, and the pull happens.
 */
function BeamTargetRings() {
  const { runtime, snapshot } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), [])

  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    let count = 0
    const draw = (object: BeamObject) => {
      if (count >= BEAM_TARGET_RING_CAPACITY) return
      if (!object.active || object.kind === 'car' || object.absorbing || object.beamImmune || !object.inBeam) return
      if (beamLiftScale(object.mass, snapshot.beamStrength) <= 0) return
      const pulse = 1 + Math.sin(clock.elapsedTime * 8 + count * 0.7) * 0.1
      const diameter = beamObjectDiameter(object)
      const radius = Math.min(4.8, Math.max(0.78, diameter * 0.34)) * pulse
      const groundY = object.kind === 'building' && object.scale
        ? Math.max(0.05, object.position.y - object.scale.y / 2 - 0.05)
        : object.position.y <= 1.5
          ? 0.05
          : object.position.y - Math.min(0.2, diameter * 0.1)
      position.set(object.position.x, groundY, object.position.z)
      scale.set(radius, radius, radius)
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(count, matrix)
      count += 1
    }
    for (const object of runtime.current.beamObjects) draw(object)
    for (const object of runtime.current.crowds.objects) draw(object)
    for (const object of runtime.current.hazards.objects) draw(object)
    for (const object of runtime.current.enemies.slots) draw(object)
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    beamTargetRingMaterial.opacity = 0.68 + (Math.sin(clock.elapsedTime * 8) + 1) * 0.1
  })

  return (
    <instancedMesh ref={ref} args={[beamRingGeometry, beamTargetRingMaterial, BEAM_TARGET_RING_CAPACITY]} frustumCulled={false} renderOrder={3} />
  )
}

function DrivingTraffic() {
  const { runtime } = useGame()
  const body = useRef<THREE.InstancedMesh>(null)
  const cabin = useRef<THREE.InstancedMesh>(null)
  const lamps = useRef<THREE.InstancedMesh>(null)
  const shadows = useRef<THREE.InstancedMesh>(null)
  const base = useMemo(() => new THREE.Matrix4(), [])
  const local = useMemo(() => new THREE.Matrix4(), [])
  const composed = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const scale = useMemo(() => new THREE.Vector3(0.8, 0.8, 0.8), [])
  const shadowScale = useMemo(() => new THREE.Vector3(2.25, 3.25, 1), [])
  const planeQuaternion = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), [])
  const color = useMemo(() => new THREE.Color(), [])

  useFrame(() => {
    if (!body.current || !cabin.current || !lamps.current || !shadows.current) return
    let count = 0
    for (const car of runtime.current.traffic.cars) {
      if (!car.active) continue
      position.set(car.position.x, car.position.y, car.position.z)
      quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, car.rotation)
      base.compose(position, quaternion, scale)
      body.current.setMatrixAt(count, base)
      body.current.setColorAt(count, color.set(car.color))
      local.makeTranslation(0, 0.53, -0.15)
      cabin.current.setMatrixAt(count, composed.copy(base).multiply(local))
      local.makeTranslation(0, 0.9, -0.15)
      lamps.current.setMatrixAt(count, composed.copy(base).multiply(local))
      position.set(car.position.x + 0.2, 0.035, car.position.z + 0.25)
      composed.compose(position, planeQuaternion, shadowScale)
      shadows.current.setMatrixAt(count, composed)
      count += 1
    }
    for (const mesh of [body.current, cabin.current, lamps.current, shadows.current]) {
      mesh.count = count
      mesh.instanceMatrix.needsUpdate = true
    }
    if (body.current.instanceColor) body.current.instanceColor.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={shadows} args={[undefined, undefined, TRAFFIC_MAX_CARS]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <primitive object={carShadowMaterial} attach="material" />
      </instancedMesh>
      <instancedMesh ref={body} args={[roundedCarBodyGeometry, carBodyMaterial, TRAFFIC_MAX_CARS]} frustumCulled={false} />
      <instancedMesh ref={cabin} args={[roundedCarCabinGeometry, carCabinMaterial, TRAFFIC_MAX_CARS]} frustumCulled={false} />
      <instancedMesh ref={lamps} args={[undefined, undefined, TRAFFIC_MAX_CARS]} frustumCulled={false}>
        <boxGeometry args={[0.95, 0.16, 0.28]} />
        <primitive object={carLampMaterial} attach="material" />
      </instancedMesh>
    </group>
  )
}

function ScanNode({ color }: { color: string }) {
  return (
    <group>
      <mesh position-y={1.2}><boxGeometry args={[2.2, 2.1, 0.3]} /><meshToonMaterial color="#514967" emissive={color} emissiveIntensity={0.08} /></mesh>
      <mesh position={[0, 1.2, 0.18]}><planeGeometry args={[1.72, 1.4]} /><meshBasicMaterial color={color} /></mesh>
      <mesh position-y={0.15}><cylinderGeometry args={[0.18, 0.26, 1.6, 6]} /><meshToonMaterial color="#61536d" /></mesh>
    </group>
  )
}

function BeamFlowRings({ length, radius, boosting }: { length: number; radius: number; boosting: boolean }) {
  const rings = useRef<Array<THREE.Mesh | null>>([])
  const elapsed = useRef(0)
  useFrame((_, dt) => {
    elapsed.current += dt
    const speed = boosting ? 0.62 : 0.32
    rings.current.forEach((ring, index) => {
      if (!ring) return
      const phase = (elapsed.current * speed + index / BEAM_RING_COUNT) % 1
      const ratio = Math.pow(1 - phase, 0.72)
      const sectionRadius = Math.max(0.16, radius * ratio * 0.78)
      ring.position.y = -length * ratio
      ring.scale.setScalar(sectionRadius)
      const edgeFade = Math.min(1, ratio / 0.12, (1 - ratio) / 0.12)
      const material = ring.material as THREE.MeshBasicMaterial
      material.opacity = Math.max(0, edgeFade) * (boosting ? 0.74 : 0.52)
    })
  })
  return (
    <group>
      {Array.from({ length: BEAM_RING_COUNT }, (_, index) => (
        <mesh
          key={index}
          ref={(mesh) => { rings.current[index] = mesh }}
          geometry={beamRingGeometry}
          rotation-x={-Math.PI / 2}
          renderOrder={3}
        >
          <meshBasicMaterial color="#efffff" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

function TractorBeam() {
  const { runtime, snapshot } = useGame()
  const root = useRef<THREE.Group>(null)
  // Same scales the physics uses. These were left at their defaults, so the
  // drawn beam never widened or lengthened with the craft while the pickup
  // volume did - the visible beam and the beam that actually catches things
  // were two different shapes. beamRadiusScale IS the size profile's aperture
  // now, so it is applied once, not multiplied in twice.
  const profile = beamProfile(snapshot.boostActive, snapshot.beamRadiusScale, snapshot.beamReachScale)
  const length = Math.max(0.8, beamVisualLength(runtime.current.drone.position.y, profile.maxDrop))
  const radius = profile.baseRadius + length * profile.coneSpread
  useFrame(() => {
    if (!root.current) return
    const position = runtime.current.drone.position
    root.current.position.set(position.x, position.y, position.z)
    root.current.visible = snapshot.beamActive
  })
  const color = snapshot.boostActive ? '#69f7ff' : '#8fffe1'
  return (
    <group ref={root} position={[runtime.current.drone.position.x, runtime.current.drone.position.y, runtime.current.drone.position.z]}>
      <mesh position-y={-length / 2} renderOrder={2}>
        <coneGeometry args={[radius, length, 24, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={snapshot.boostActive ? 0.38 : 0.28} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
      <BeamFlowRings length={length} radius={radius} boosting={snapshot.boostActive} />
    </group>
  )
}

function PilotModel() {
  return (
    <group position={[0, 0.35, 0.05]} scale={0.52}>
      <mesh position-y={-0.14} rotation-z={0.08}>
        <boxGeometry args={[0.78, 0.72, 0.48]} />
        <meshToonMaterial color="#ef8d96" />
      </mesh>
      <mesh position={[0.04, 0.45, 0]} rotation-z={-0.05}>
        <octahedronGeometry args={[0.48, 0]} />
        <meshToonMaterial color="#f4d7aa" />
      </mesh>
      <mesh position={[-0.18, 0.47, 0.42]}><boxGeometry args={[0.11, 0.16, 0.08]} /><meshBasicMaterial color="#343044" /></mesh>
      <mesh position={[0.2, 0.47, 0.42]}><boxGeometry args={[0.11, 0.16, 0.08]} /><meshBasicMaterial color="#343044" /></mesh>
      <mesh position={[0.34, 0.94, 0]} rotation-z={-0.42}><cylinderGeometry args={[0.035, 0.045, 0.55, 5]} /><meshToonMaterial color="#6f627d" /></mesh>
      <mesh position={[0.47, 1.18, 0]}><octahedronGeometry args={[0.11, 0]} /><meshBasicMaterial color="#b9df78" /></mesh>
      <mesh position={[-0.52, -0.08, 0]} rotation-z={-0.34}><boxGeometry args={[0.18, 0.64, 0.2]} /><meshToonMaterial color="#e7b26f" /></mesh>
      <mesh position={[0.5, -0.04, 0]} rotation-z={0.18}><boxGeometry args={[0.18, 0.56, 0.2]} /><meshToonMaterial color="#b9df78" /></mesh>
    </group>
  )
}

// A soft pool of light on the ground under the craft. Blob shadows read as
// nothing at night, but altitude and horizontal position still have to be
// legible, and a pool that shrinks and brightens as you descend does both.
function UfoGroundPool() {
  const { runtime, snapshot } = useGame()
  const ref = useRef<THREE.Mesh>(null)
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const drone = runtime.current.drone.position
    mesh.position.set(drone.x, 0.06, drone.z)
    const altitude = Math.max(0, drone.y)
    const spread = 2.4 * runtime.current.sizeProfile.size + altitude * 0.34
    mesh.scale.setScalar(spread)
    const material = mesh.material as THREE.MeshBasicMaterial
    // Reads as a cast light at night and as nothing much at noon, which is
    // exactly when a glowing puddle on lit tarmac would look wrong.
    const nightFactor = runtime.current.daylight.nightFactor
    material.opacity = Math.max(0.05, 0.42 - altitude * 0.0035)
      * (snapshot.beamActive ? 1.5 : 1)
      * (0.18 + nightFactor * 0.82)
  })
  return (
    <mesh ref={ref} rotation-x={-Math.PI / 2} frustumCulled={false} renderOrder={-1}>
      <circleGeometry args={[1, 28]} />
      <meshBasicMaterial
        color={ENTITY.UFO_POOL}
        map={radialGlowTexture}
        transparent
        opacity={0.18}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  )
}

/**
 * The saucer's own night glow.
 *
 * The ground pool underneath it says where the craft is over the street; this
 * says where the craft is in the sky. It rides the same rule as the enemies -
 * nothing at noon, brightest at the floor of the night - so the whole scene
 * gains its light from one place as the cycle runs down.
 *
 * Kept outside the craft's group on purpose: that group carries the hull's
 * pitch, yaw and roll, and a billboard has to face the camera regardless of
 * what the ship is doing.
 */
function UfoNightGlow() {
  const { runtime, snapshot } = useGame()
  const { camera } = useThree()
  const ref = useRef<THREE.Mesh>(null)
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const game = runtime.current
    mesh.position.set(game.drone.position.x, game.drone.position.y, game.drone.position.z)
    mesh.quaternion.copy(camera.quaternion)
    mesh.scale.setScalar(4.6 * game.sizeProfile.size)
    const material = mesh.material as THREE.MeshBasicMaterial
    const nightFactor = game.daylight.nightFactor
    material.opacity = nightFactor * nightFactor * (snapshot.beamActive ? 0.42 : 0.3)
    mesh.visible = material.opacity > 0.002
  })
  return (
    <mesh ref={ref} frustumCulled={false} renderOrder={2}>
      <planeGeometry args={[2, 2]} />
      <meshBasicMaterial
        color={ENTITY.UFO_RIM}
        map={entityHaloTexture}
        transparent
        opacity={0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  )
}

function Ufo() {
  const { runtime, snapshot } = useGame()
  const root = useRef<THREE.Group>(null)
  const rim = useRef<THREE.Group>(null)
  const hullMaterial = useRef<THREE.MeshToonMaterial>(null)
  const domeMaterial = useRef<THREE.MeshToonMaterial>(null)
  const smoothedCameraPull = useRef<number | null>(null)
  const cameraTarget = useMemo(() => new THREE.Vector3(), [])
  const cameraPosition = useMemo(() => new THREE.Vector3(), [])
  const hullBaseColor = useMemo(() => new THREE.Color(ENTITY.UFO_HULL), [])
  const hullImpactColor = useMemo(() => new THREE.Color('#ff4d4d'), [])
  const hullMysteryColor = useMemo(() => new THREE.Color('#ffd45e'), [])
  const hullColor = useMemo(() => new THREE.Color(), [])
  const domeBaseColor = useMemo(() => new THREE.Color(ENTITY.UFO_DOME), [])
  const domeMysteryColor = useMemo(() => new THREE.Color('#ffe59b'), [])
  const domeColor = useMemo(() => new THREE.Color(), [])
  const shake = useMemo(() => createShakeSample(), [])
  const { camera } = useThree()

  useFrame((_, dt) => {
    const game = runtime.current
    // One sample drives both the hull and the camera, so the craft rattling
    // and the frame rattling are the same blast rather than two effects that
    // happen to overlap. Zero unless something just went off - see core/shake.
    sampleShake(game.shake, shake)
    if (root.current) {
      // Offset in hull radii: the shake is a share of the craft, so growing
      // does not turn a rattle into a lurch.
      const craftShake = SHAKE_CRAFT_OFFSET * game.sizeProfile.size
      root.current.position.set(
        game.drone.position.x + shake.x * craftShake,
        game.drone.position.y + shake.y * craftShake,
        game.drone.position.z + shake.z * craftShake,
      )
      root.current.rotation.x = -game.drone.pitch + shake.pitch * SHAKE_CRAFT_ROLL
      root.current.rotation.y = game.drone.heading + shake.yaw * SHAKE_CRAFT_ROLL
      root.current.rotation.z = game.drone.visualTilt * 0.72 + shake.roll * SHAKE_CRAFT_ROLL
      const pickupPop = Math.sin((1 - snapshot.pickupPulse) * Math.PI) * snapshot.pickupPulse
      // The craft IS the health bar: its size is the run's only resource, so it
      // has to be read off the body rather than a gauge.
      root.current.scale.setScalar(game.sizeProfile.size * (1 + pickupPop * 0.12))
    }
    if (rim.current) rim.current.rotation.y += dt * (snapshot.beamActive ? 7 : 2.8)

    // The player should be readable without becoming a glowing white disc.
    // Keep a small, stable self-light in both daytime and nighttime.
    //
    // Read off the runtime rather than the snapshot: the snapshot is published
    // about sixteen times a second, which is slower than the blink below and
    // would sample it into a stutter.
    const impact = Math.max(0, Math.min(1, game.impactFlash))
    // Blink, not fade. A tint that only slides back to hull grey reads as the
    // light changing; strobing it on the way out is what says "that hit me",
    // and every hit now runs through here - orb, shell, ram, bow gun or mine.
    const impactBlink = impact * (0.6 + 0.4 * Math.sin(game.pilotClock * IMPACT_BLINK_RATE))
    const mysteryFlash = Math.max(0, Math.min(1, game.mysteryFlash / 0.65))
    const goldFlash = mysteryFlash * (0.78 + 0.22 * (0.5 + 0.5 * Math.sin(game.pilotClock * 24)))
    // The craft lights itself further the darker the sky gets. Both emissives
    // are the craft's *own* colour, so this is the hull turning its lights up
    // rather than anything being tinted onto it - the same rule the enemies
    // follow, applied to the one thing on screen that must never be lost.
    const nightFactor = game.daylight.nightFactor
    if (hullMaterial.current) {
      hullColor.copy(hullBaseColor).lerp(hullImpactColor, impactBlink)
      hullColor.lerp(hullMysteryColor, goldFlash)
      hullMaterial.current.color.copy(hullColor)
      hullMaterial.current.emissive.copy(hullColor)
      hullMaterial.current.emissiveIntensity = 0.2 + nightFactor * 0.34 + impactBlink * 1.8 + goldFlash * 2.2
    }
    if (domeMaterial.current) {
      domeColor.copy(domeBaseColor).lerp(domeMysteryColor, goldFlash)
      domeMaterial.current.color.copy(domeColor)
      domeMaterial.current.emissive.copy(domeColor)
      domeMaterial.current.emissiveIntensity = 0.18 + nightFactor * 0.3 + goldFlash * 1.7
    }

    const heading = game.drone.heading
    const pitch = game.drone.pitch
    const horizontalForward = Math.cos(pitch)
    const forwardX = Math.sin(heading) * horizontalForward
    const forwardY = Math.sin(pitch)
    const forwardZ = Math.cos(heading) * horizontalForward
    const speedRatio = Math.min(1, snapshot.speed / 30)
    const altitudeView = Math.max(0, game.drone.position.y - 6) * 0.12
    const sizeLift = sizeCameraLift(game.sizeProfile.size)
    // Pull back with size, or a grown craft fills the screen and hides the
    // bodies it is trying to reach.
    // Size changes are discrete gameplay events. Smooth the derived pull-back
    // separately before smoothing the camera position, otherwise a big meal or
    // hit makes the chase rig surge even though position.lerp is enabled.
    if (smoothedCameraPull.current === null) smoothedCameraPull.current = game.sizeProfile.cameraDistance
    const pullBlend = 1 - Math.exp(-1.35 * dt)
    smoothedCameraPull.current += (game.sizeProfile.cameraDistance - smoothedCameraPull.current) * pullBlend
    // The size term already carries the whole resting distance; speed and
    // altitude are the only things added on top of it here.
    const distance = smoothedCameraPull.current + speedRatio * 3.3 + altitudeView
    cameraPosition.set(
      game.drone.position.x - forwardX * distance,
      Math.max(1, game.drone.position.y + CHASE_EYE_HEIGHT - CHASE_RIG_DROP + speedRatio * 1.1 + altitudeView + sizeLift - forwardY * distance * 0.72),
      game.drone.position.z - forwardZ * distance,
    )
    camera.position.lerp(cameraPosition, 1 - Math.exp(-3.2 * dt))
    cameraTarget.set(
      game.drone.position.x + forwardX * (5.5 + speedRatio * 3),
      game.drone.position.y - CHASE_RIG_DROP + forwardY * (5.5 + speedRatio * 3),
      game.drone.position.z + forwardZ * (5.5 + speedRatio * 3),
    )
    camera.lookAt(cameraTarget)
    // Rotate after the look-at rather than shoving the chase position around:
    // the position is lerped, which would eat most of a short kick, and
    // rolling the frame reads as the hit without ever moving the rig off the
    // craft. lookAt rewrites the quaternion every frame, so this cannot drift.
    if (shake.yaw !== 0 || shake.pitch !== 0 || shake.roll !== 0) {
      camera.rotateX(shake.pitch * SHAKE_CAMERA_PITCH)
      camera.rotateY(shake.yaw * SHAKE_CAMERA_YAW)
      camera.rotateZ(shake.roll * SHAKE_CAMERA_ROLL)
    }
    if (camera instanceof THREE.PerspectiveCamera) {
      const targetFov = game.drone.boostRemaining > 0 ? 82 : 58 + speedRatio * 11
      camera.fov += (targetFov - camera.fov) * (1 - Math.exp(-5 * dt))
      camera.updateProjectionMatrix()
    }
  })

  return (
    <group ref={root}>
      <group scale={1.08}>
        <PilotModel />
        {/* The hull carries its own emissive so the craft never sinks into the
            night city. Finding yourself instantly is the whole readability bar. */}
        <mesh scale={[1, 0.32, 1]}>
          <sphereGeometry args={[1.72, 20, 10]} />
          <meshToonMaterial ref={hullMaterial} color={ENTITY.UFO_HULL} emissive={ENTITY.UFO_HULL} emissiveIntensity={0.2} />
          <Edges threshold={15} color="#5a5170" />
        </mesh>
        <mesh position-y={0.25} scale={[1, 0.55, 1]}>
          <sphereGeometry args={[0.82, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshToonMaterial ref={domeMaterial} color={ENTITY.UFO_DOME} emissive={ENTITY.UFO_DOME} emissiveIntensity={0.36} transparent opacity={0.9} />
          <Edges threshold={15} color="#432f6b" />
        </mesh>
        {/* Cat ears - the one silhouette change the "침략할거냥" (Meowvasion)
            redesign actually needs to read as the pilot's ship rather than a
            generic saucer. Two-part like the pilot's own ears: an outer shell
            cone and a smaller inset pink one. */}
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 0.62, 0.62, 0.15]} rotation={[0.5, 0, side * -0.35]}>
            <mesh>
              <coneGeometry args={[0.26, 0.5, 3]} />
              <meshToonMaterial color={ENTITY.UFO_HULL} emissive={ENTITY.UFO_HULL} emissiveIntensity={0.15} />
              <Edges threshold={15} color="#123245" />
            </mesh>
            <mesh position={[0, -0.02, 0.06]} scale={0.55}>
              <coneGeometry args={[0.26, 0.5, 3]} />
              <meshBasicMaterial color={ENTITY.UFO_EAR_INNER} />
            </mesh>
          </group>
        ))}
        {/* Antenna: a thin stalk with a small gold star-like tip, echoing the
            pilot portrait's own antenna so the ship reads as the same craft. */}
        <group position={[0, 0.92, -0.1]}>
          <mesh position-y={0.14}>
            <cylinderGeometry args={[0.02, 0.02, 0.28, 5]} />
            <meshBasicMaterial color="#123245" />
          </mesh>
          <mesh position-y={0.3} rotation-y={Math.PI / 4}>
            <octahedronGeometry args={[0.09, 0]} />
            <meshBasicMaterial color={ENTITY.UFO_ACCENT} toneMapped={false} />
          </mesh>
        </group>
        <mesh position-y={-0.2}>
          <cylinderGeometry args={[1.35, 1.03, 0.32, 18]} />
          <meshToonMaterial color={ENTITY.UFO_TRIM} emissive="#8a7638" emissiveIntensity={0.12} />
          <Edges color="#2b243f" />
        </mesh>
        <mesh position-y={-0.39} rotation-x={Math.PI / 2}>
          <ringGeometry args={[0.47, 0.92, 22]} />
          <meshBasicMaterial color={snapshot.beamActive ? '#baffdc' : '#ffcb63'} toneMapped={false} />
        </mesh>
        <group ref={rim}>
          {Array.from({ length: 10 }, (_, index) => {
            const angle = index / 10 * Math.PI * 2
            return (
              <mesh key={index} position={[Math.sin(angle) * 1.43, -0.05, Math.cos(angle) * 1.43]}>
                <sphereGeometry args={[0.12, 6, 4]} />
                <meshBasicMaterial color={index % 2 ? '#67f2ff' : '#ff6fae'} toneMapped={false} />
              </mesh>
            )
          })}
        </group>
        <mesh position={[0, 0, 1.48]} rotation-x={Math.PI / 2}>
          <coneGeometry args={[0.25, 0.62, 5]} />
          <meshBasicMaterial color="#ffdd67" />
        </mesh>
        {snapshot.boostActive && (
          <group position={[0, -0.02, -1.85]} rotation-x={Math.PI / 2}>
            {[-0.62, 0.62].map((x) => (
              <group key={x} position-x={x}>
                <mesh>
                  <coneGeometry args={[0.24, 2.2, 8]} />
                  <meshBasicMaterial color="#69f7ff" transparent opacity={0.82} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
                </mesh>
                <mesh position-y={0.34}>
                  <coneGeometry args={[0.13, 1.35, 7]} />
                  <meshBasicMaterial color="#fff26d" transparent opacity={0.95} depthWrite={false} />
                </mesh>
              </group>
            ))}
          </group>
        )}
      </group>
    </group>
  )
}

// Crowd and enemy bodies are absorb targets and threats respectively, so both
// have to stay findable in the dark. Each family keeps its own rim colour: one
// shared colour would erase the type read the wave design depends on.
const crowdGeometry: Record<CrowdKind, THREE.BufferGeometry> = {
  pedestrian: pedestrianGeometry(),
  cat: catGeometry(),
}

// Tops and bottoms are picked independently. Dark suit/coat colours sit beside
// casual knits and tees, while trousers include black, denim and warmer cloth.
const pedestrianTopColors = [
  '#343744', '#3d5a83', '#566d4e', '#875466',
  '#dfd0ae', '#ca7c4c', '#448d86', '#7d89b3',
].map((value) => new THREE.Color(value))
const pedestrianBottomColors = [
  '#30323c', '#3c4459', '#58708c', '#5c5047',
  '#827a72', '#292b33', '#79886e', '#73596b',
].map((value) => new THREE.Color(value))
const pedestrianDetailColors = [
  '#f0eadc', '#a9c8d8', '#e6b84d', '#d66b67', '#77b7a0', '#a98bbb',
].map((value) => new THREE.Color(value))
// Keep the three feline coats in one fixed InstancedMesh. The pale tint leaves
// the vertex-coloured dark patches black on the tuxedo cat and turns them into
// warm brown or charcoal tabby stripes on the orange and gray cats.
const catStyleColors = ['#fffaf2', '#f29c4c', '#a8afb8'] as const
// The opening cat is the one thing the tutorial points at, so it always wears
// the orange coat. The gray coat its pooled slot happened to land on read as
// park scenery, and a player who cannot pick the cat out cannot start.
const TUTORIAL_CAT_COAT = 1
const beamReflectionColor = new THREE.Color('#8fffe1')

function CrowdPool({ kind }: { kind: CrowdKind }) {
  const { runtime, snapshot } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Euler(), [])
  const color = useMemo(() => new THREE.Color(), [])
  useFrame(({ clock }) => {
    if (!ref.current) return
    const topStyleAttribute = kind === 'pedestrian' ? crowdGeometry.pedestrian.getAttribute('outfitTopStyle') as THREE.InstancedBufferAttribute : null
    const bottomStyleAttribute = kind === 'pedestrian' ? crowdGeometry.pedestrian.getAttribute('outfitBottomStyle') as THREE.InstancedBufferAttribute : null
    const topTintAttribute = kind === 'pedestrian' ? crowdGeometry.pedestrian.getAttribute('outfitTopTint') as THREE.InstancedBufferAttribute : null
    const bottomTintAttribute = kind === 'pedestrian' ? crowdGeometry.pedestrian.getAttribute('outfitBottomTint') as THREE.InstancedBufferAttribute : null
    const detailTintAttribute = kind === 'pedestrian' ? crowdGeometry.pedestrian.getAttribute('outfitDetailTint') as THREE.InstancedBufferAttribute : null
    const beamLitAttribute = kind === 'pedestrian' ? crowdGeometry.pedestrian.getAttribute('outfitBeamLit') as THREE.InstancedBufferAttribute : null
    let count = 0
    for (const object of runtime.current.crowds.objects) {
      if (!object.active || object.kind !== kind) continue
      position.set(object.position.x, object.position.y, object.position.z)
      rotation.set(object.rotation.x, object.rotation.y, object.rotation.z)
      quaternion.setFromEuler(rotation)
      const bounce = object.inBeam ? 1 : 1 + Math.sin(clock.elapsedTime * 8 + object.slot) * 0.04
      const outfit = kind === 'pedestrian' ? pedestrianOutfitForSlot(object.slot, object.generation) : null
      // Crowds read as a city only when an intersection contains many small
      // bodies, rather than a few oversized figures competing with the UFO.
      const targetScale = (snapshot.beamTargetId === object.id ? 1.38 : 1.16)
        * (kind === 'pedestrian' ? (0.94 + (outfit?.topStyle ?? 0) * 0.025) * 0.5 : 1)
      const absorbScale = object.absorbing ? Math.max(0.04, object.absorbTimer / CROWD_ABSORB_TIME) : 1
      scale.set(targetScale * absorbScale, targetScale * bounce * absorbScale, targetScale * absorbScale)
      matrix.compose(position, quaternion, scale)
      ref.current.setMatrixAt(count, matrix)
      if (kind === 'pedestrian' && outfit) {
        const topPalette = outfit.topStyle === 2
          ? outfit.topPalette % 4
          : outfit.topPalette
        topStyleAttribute!.setX(count, outfit.topStyle)
        bottomStyleAttribute!.setX(count, outfit.bottomStyle)
        const topTint = pedestrianTopColors[topPalette]!
        const bottomTint = pedestrianBottomColors[outfit.bottomPalette]!
        const detailTint = pedestrianDetailColors[outfit.detailPalette]!
        topTintAttribute!.setXYZ(count, topTint.r, topTint.g, topTint.b)
        bottomTintAttribute!.setXYZ(count, bottomTint.r, bottomTint.g, bottomTint.b)
        detailTintAttribute!.setXYZ(count, detailTint.r, detailTint.g, detailTint.b)
        beamLitAttribute!.setX(count, snapshot.beamTargetId === object.id ? 1 : 0)
      } else {
        // Rotate coats when a pooled slot is reused, then retain that coat
        // under the beam. A restrained mint reflection communicates capture
        // without replacing every cat with the old flat yellow highlight.
        const coat = object.id.startsWith('tutorial-cat')
          ? TUTORIAL_CAT_COAT
          : (object.slot + object.generation * 2) % catStyleColors.length
        color.set(catStyleColors[coat]!)
        if (snapshot.beamTargetId === object.id) color.lerp(beamReflectionColor, 0.15)
        ref.current.setColorAt(count, color)
      }
      count += 1
    }
    ref.current.count = count
    ref.current.instanceMatrix.needsUpdate = true
    if (kind === 'pedestrian') {
      topStyleAttribute!.needsUpdate = true
      bottomStyleAttribute!.needsUpdate = true
      topTintAttribute!.needsUpdate = true
      bottomTintAttribute!.needsUpdate = true
      detailTintAttribute!.needsUpdate = true
      beamLitAttribute!.needsUpdate = true
    } else if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[crowdGeometry[kind], crowdMaterial[kind], kind === 'cat' ? CAT_MAX : PEDESTRIAN_MAX]} frustumCulled={false} />
  )
}

// A tanker about 2.5 times the footprint of a normal car, on a fixed pooled
// geometry shared by every ambient hazard.
//
// Painted like a vehicle rather than like a hazard. It previously wore a
// pulsing red-and-orange striped shader, which read as a glowing bomb on
// wheels - the silhouette was already a tanker but nothing about the surface
// said so. The danger cue moved off the paintwork and onto the marker floating
// above it, which is what the player actually needs to see from a distance.
const tankerGeometry = mergeModel([
  coloredPart(new RoundedBoxGeometry(2.65, 1.65, 2.15, 2, 0.18).translate(0, 0.05, -2.45), '#d8443f'),
  coloredPart(new THREE.BoxGeometry(2.3, 0.9, 0.18).translate(0, 0.25, -3.5), '#1d2436'),
  coloredPart(new THREE.CylinderGeometry(1.25, 1.25, 4.8, 14).rotateX(Math.PI / 2).translate(0, 0.28, 0.85), '#e9e6dc'),
  // End caps and a waist band, so the tank reads as a pressure vessel rather
  // than a plain tube.
  coloredPart(new THREE.CylinderGeometry(1.28, 1.28, 0.22, 14).rotateX(Math.PI / 2).translate(0, 0.28, -1.45), '#b9b3a5'),
  coloredPart(new THREE.CylinderGeometry(1.28, 1.28, 0.22, 14).rotateX(Math.PI / 2).translate(0, 0.28, 3.1), '#b9b3a5'),
  coloredPart(new THREE.CylinderGeometry(1.3, 1.3, 0.3, 14).rotateX(Math.PI / 2).translate(0, 0.28, 0.85), '#c8483c'),
  coloredPart(new THREE.CylinderGeometry(0.34, 0.34, 0.42, 8).translate(0, 1.5, 0.5), '#8f8a7e'),
  coloredPart(new THREE.BoxGeometry(2.55, 0.28, 5.3).translate(0, -0.72, 0.45), '#2b3242'),
  ...[-1.05, 1.05].flatMap((x) => [-2.15, 1.85].map((z) =>
    coloredPart(new THREE.CylinderGeometry(0.53, 0.53, 0.32, 10).rotateZ(Math.PI / 2).translate(x, -0.78, z), '#191d2a'),
  )),
])

// The truck. Deliberately the tanker's opposite in silhouette: a square box
// body where the tanker has a cylinder, so at flying height the two are told
// apart by shape alone rather than by reading a colour.
const truckGeometry = mergeModel([
  coloredPart(new RoundedBoxGeometry(2.5, 1.75, 2.3, 2, 0.18).translate(0, 0.1, -2.4), '#3f6fa8'),
  coloredPart(new THREE.BoxGeometry(2.2, 0.85, 0.18).translate(0, 0.32, -3.45), '#1d2436'),
  coloredPart(new RoundedBoxGeometry(2.7, 2.5, 5.3, 2, 0.12).translate(0, 0.66, 0.95), '#e2e6ec'),
  // A rib every so often down the box, and a roll-up door at the back.
  ...[-0.8, 0.6, 2.0].map((z) =>
    coloredPart(new THREE.BoxGeometry(2.78, 2.56, 0.14).translate(0, 0.66, z), '#c8cedb'),
  ),
  coloredPart(new THREE.BoxGeometry(2.4, 2.0, 0.12).translate(0, 0.56, 3.62), '#aeb6c6'),
  coloredPart(new THREE.BoxGeometry(2.55, 0.28, 5.6).translate(0, -0.68, 0.6), '#2b3242'),
  ...[-1.05, 1.05].flatMap((x) => [-2.1, 1.5, 2.7].map((z) =>
    coloredPart(new THREE.CylinderGeometry(0.53, 0.53, 0.32, 10).rotateZ(Math.PI / 2).translate(x, -0.78, z), '#191d2a'),
  )),
])

const hazardTankerMaterial = new THREE.MeshToonMaterial({
  vertexColors: true,
  emissive: new THREE.Color('#5a3320'),
  emissiveIntensity: 0.18,
})

// Cooler and dimmer than the tanker's, so the two do not glow alike at night.
const hazardTruckMaterial = new THREE.MeshToonMaterial({
  vertexColors: true,
  emissive: new THREE.Color('#243347'),
  emissiveIntensity: 0.14,
})

/**
/**
 * Tankers. No floating marker above them any more.
 *
 * There used to be a bobbing red exclamation mark. The tanker already reads as
 * a tanker from its silhouette, and the moment the beam takes hold its weight
 * announces itself far more clearly than a symbol could - a piece of UI
 * hovering in the world matched nothing else in this game.
 */
function HazardPool() {
  const { runtime } = useGame()
  const bodies = useRef<THREE.InstancedMesh>(null)
  const trucks = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const euler = useMemo(() => new THREE.Euler(), [])

  useFrame(() => {
    const body = bodies.current
    const truck = trucks.current
    if (!body || !truck) return
    let tankers = 0
    let boxes = 0
    for (const hazard of runtime.current.hazards.objects) {
      if (!hazard.active) continue
      position.set(hazard.position.x, hazard.position.y, hazard.position.z)
      euler.set(hazard.rotation.x, hazard.rotation.y, hazard.rotation.z)
      quaternion.setFromEuler(euler)
      const absorbScale = hazard.absorbing ? Math.max(0.04, hazard.absorbTimer / BEAM_ABSORB_TIME) : 1
      scale.setScalar(absorbScale)
      matrix.compose(position, quaternion, scale)
      if (hazard.kind === 'truck') {
        truck.setMatrixAt(boxes, matrix)
        boxes += 1
      } else {
        body.setMatrixAt(tankers, matrix)
        tankers += 1
      }
    }
    body.count = tankers
    truck.count = boxes
    body.instanceMatrix.needsUpdate = true
    truck.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={bodies} args={[tankerGeometry, hazardTankerMaterial, HAZARD_MAX]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }} />
      <instancedMesh ref={trucks} args={[truckGeometry, hazardTruckMaterial, HAZARD_MAX]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }} />
    </group>
  )
}

function CrowdPools() {
  return <group><CrowdPool kind="pedestrian" /><CrowdPool kind="cat" /></group>
}

/**
 * A bobbing arrow over the tutorial's one cat. The opening park fills in with
 * ordinary crowd members almost immediately, and without a marker the cat the
 * mission text refers to was one indistinguishable body among many.
 */
function TutorialCatMarker() {
  const { runtime, snapshot } = useGame()
  const group = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!group.current) return
    const cat = runtime.current.crowds.objects.find((object) => object.active && object.id.startsWith('tutorial-cat'))
    if (!cat) { group.current.visible = false; return }
    group.current.visible = true
    group.current.position.set(cat.position.x, cat.position.y + 2.1 + Math.sin(clock.elapsedTime * 3) * 0.18, cat.position.z)
  })
  if (!snapshot.tutorial) return null
  return (
    <group ref={group}>
      <mesh rotation-x={Math.PI}>
        <coneGeometry args={[0.32, 0.6, 4]} />
        <meshBasicMaterial color="#ffe05f" toneMapped={false} />
        <Edges threshold={15} color="#2b243f" />
      </mesh>
    </group>
  )
}

/**
 * The red shell around a mine: what it will destroy, drawn at exactly that size.
 *
 * A mine used to announce itself only by its own pulse, which is a couple of
 * metres of model against a whole sky - by the time it was read, the player was
 * usually already inside the trigger. This draws DRONE_MINE_BLAST_RADIUS
 * directly, so the rule is legible without being explained: what is inside the
 * shell dies, and crossing it is the same act as arming the fuse.
 *
 * It breathes rather than sitting on, so a field of mines does not turn the sky
 * into a wall of red. Once armed it stops breathing and goes hard and fast,
 * brightening as the fuse runs down. The shell itself lives in
 * entityMaterials, shared with the gas stations' own explosive warning.
 */
function MineBlastFieldPool() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const charge = useMemo(() => new THREE.InstancedBufferAttribute(new Float32Array(ENEMY_CAPS.drone), 1), [])
  const geometry = useMemo(() => {
    const sphere = new THREE.SphereGeometry(1, 28, 18)
    sphere.setAttribute('aCharge', charge)
    return sphere
  }, [charge])
  const material = useMemo(() => makeBlastFieldMaterial(), [])

  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    let count = 0
    for (const enemy of runtime.current.enemies.slots) {
      if (!enemy.active || enemy.kind !== 'drone') continue
      position.set(enemy.position.x, enemy.position.y, enemy.position.z)
      scale.setScalar(DRONE_MINE_BLAST_RADIUS)
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(count, matrix)
      // Idle: a slow swell in and out, each mine on its own phase so a cluster
      // does not blink in unison. Armed: hard, fast, and climbing.
      const fuse = enemy.mineArmed ? 1 - Math.max(0, enemy.mineFuse) / DRONE_MINE_FUSE : 0
      const breath = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 0.85 + enemy.phase * 3.1)
      // Idle is deliberately faint now: a field of these is the biggest red
      // thing in the sky, and at the old amplitude an unarmed mine read as a
      // red ball rather than as a boundary drawn around a grey one. The armed
      // end is untouched - that is the half that has to be impossible to miss.
      charge.array[count] = enemy.mineArmed
        ? (0.85 + fuse * 0.95) * (0.86 + 0.14 * Math.sin(clock.elapsedTime * 19))
        : 0.07 + breath * breath * 0.34
      count += 1
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    charge.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={ref}
      args={[geometry, material, ENEMY_CAPS.drone]}
      frustumCulled={false}
      renderOrder={4}
    />
  )
}

function MinePool() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const alert = enemyAlert.drone
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const rotation = useMemo(() => new THREE.Euler(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const color = useMemo(() => new THREE.Color(), [])
  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    let count = 0
    for (const enemy of runtime.current.enemies.slots) {
      if (!enemy.active || enemy.kind !== 'drone') continue
      position.set(enemy.position.x, enemy.position.y, enemy.position.z)
      rotation.set(0, enemy.phase + clock.elapsedTime * 0.15, Math.sin(clock.elapsedTime * 1.3 + enemy.phase) * 0.04)
      quaternion.setFromEuler(rotation)
      const pulse = enemy.mineArmed ? 1 + Math.sin(clock.elapsedTime * 15) * 0.1 : 1
      scale.setScalar(DRONE_MINE_MODEL_SCALE * pulse)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(count, matrix)
      const armed = enemy.mineArmed ? 0.5 + 0.5 * Math.sin(clock.elapsedTime * 15) ** 2 : 0
      color.setRGB(mineIdleTint, mineIdleTint, mineIdleTint).lerp(mineArmedTint, armed * 0.55)
      mesh.setColorAt(count, color)
      alert.array[count] = armed
      count += 1
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    alert.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[mineGeometry, enemyMaterial.drone, ENEMY_CAPS.drone]} frustumCulled={false} />
}

/** Same red the building flash uses, so "that took a hit" reads identically
 *  on everything the laser can touch. */
const enemyHitTint = new THREE.Color(BUILDING.LASER_HIT)

/** Enemies drawn from a shared model pool. Drones are not among them: every
 *  drone is a mine, and MinePool draws those with their own model and fuse
 *  pulse. */
type PooledEnemyKind = Exclude<EnemyKind, 'drone'>

const enemyGeometry: Record<PooledEnemyKind, THREE.BufferGeometry> = {
  helicopter: helicopterGeometry(),
  'anti-air': antiAirGeometry(),
  fighter: fighterGeometry(),
  boss: bossGeometry(),
}

/**
 * Which instances in a pool are about to fire.
 *
 * The lock-on warning used to be written into the instance colour, which
 * multiplies through the baked vertex colours and turned a chasing helicopter
 * into a solid red one for as long as the chase lasted. This carries the same
 * state as its own channel instead, so `nightVisibility` can light the warning
 * on the edge and the lamps and leave the model's colours alone.
 *
 * Built alongside the models at module scope: each pool owns exactly one
 * `InstancedMesh` over exactly one of these, and the sizes are the same fixed
 * caps everything else in the render tree is built from.
 */
function alertAttribute(capacity: number) {
  return new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1)
}

const enemyAlert: Record<EnemyKind, THREE.InstancedBufferAttribute> = {
  drone: alertAttribute(ENEMY_CAPS.drone),
  helicopter: alertAttribute(ENEMY_CAPS.helicopter),
  fighter: alertAttribute(ENEMY_CAPS.fighter),
  'anti-air': alertAttribute(ENEMY_CAPS['anti-air']),
  boss: alertAttribute(ENEMY_CAPS.boss),
}
for (const kind of Object.keys(enemyGeometry) as PooledEnemyKind[]) {
  enemyGeometry[kind].setAttribute('aAlert', enemyAlert[kind])
}
mineGeometry.setAttribute('aAlert', enemyAlert.drone)

function EnemyPool({ kind }: { kind: PooledEnemyKind }) {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const alert = enemyAlert[kind]
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const scale = useMemo(() => new THREE.Vector3(1, 1, 1), [])
  const rotation = useMemo(() => new THREE.Euler(), [])
  const color = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const player = runtime.current.drone.position
    let count = 0
    for (const enemy of runtime.current.enemies.slots) {
      if (!enemy.active || enemy.kind !== kind) continue
      position.set(enemy.position.x, enemy.position.y, enemy.position.z)
      const yaw = Math.atan2(player.x - enemy.position.x, player.z - enemy.position.z)
      // The battleship steers itself: its heading is its course, not a stare
      // at the player. Facing the player would put a seventy-metre hull
      // bow-on and hide the whole broadside.
      if (kind === 'boss') rotation.set(0, enemy.rotation.y, enemy.rotation.z)
      else if (enemy.inBeam || enemy.tether > 0.02 || enemy.absorbing) rotation.set(enemy.rotation.x, enemy.rotation.y, enemy.rotation.z)
      // A helicopter faces where it is flying: on patrol that is its weave
      // around the anchor, and the moment the nose snaps onto the player is
      // the lock-on being legible. Its `phase` is its travel heading.
      else if (kind === 'helicopter') rotation.set(0, enemy.phase, 0)
      // A fighter holds one straight pass, so it faces its own course - the
      // whole point of its view-cone fan is that where it points is readable.
      else if (kind === 'fighter') rotation.set(0, enemy.rotation.y, Math.sin(enemy.phase) * 0.22)
      else rotation.set(0, yaw, 0)
      quaternion.setFromEuler(rotation)
      // The battleship's geometry is authored at true scale, so it is the one
      // pool that must not be scaled - the turret positions the guns fire from
      // are in world metres.
      const size = kind === 'boss' ? 1 : kind === 'helicopter' ? 0.82 : kind === 'fighter' ? 1.18 : kind === 'anti-air' ? 2.35 : 1.8
      const absorbScale = enemy.absorbing ? Math.max(0.04, enemy.absorbTimer / BEAM_ABSORB_TIME) : 1
      scale.setScalar(size * absorbScale)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(count, matrix)
      // The lock-on no longer touches the instance colour. `aiming` is a state,
      // not a flash - a helicopter holds it for the whole chase - and writing
      // red here multiplied through every baked vertex colour and left one flat
      // red shape. It goes out on the alert channel instead, which lights the
      // edge and the running lights and leaves the paint alone. The battleship
      // stays out of it entirely: it fires almost continuously, so an
      // always-on warning says nothing.
      if (kind === 'anti-air') color.set('#7f8765')
      else if (kind === 'boss') color.set('#eef2f6')
      else color.setRGB(0.84 + (enemy.slot % 3) * 0.07, 0.84 + (enemy.slot % 3) * 0.07, 0.84 + (enemy.slot % 3) * 0.07)
      // A laser hit still answers on the body, because that one *is* a flash:
      // it lasts a moment and has to be unmistakable. Lighter than it was, now
      // that the alert channel carries the sustained warning.
      if (enemy.hurt > 0) color.lerp(enemyHitTint, Math.min(1, enemy.hurt) * (kind === 'boss' ? 0.3 : 0.5))
      mesh.setColorAt(count, color)
      alert.array[count] = enemy.aiming && kind !== 'boss' ? 1 : 0
      count += 1
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    alert.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[enemyGeometry[kind], enemyMaterial[kind], ENEMY_CAPS[kind]]} frustumCulled={false} />
  )
}

/**
 * The light an enemy carries after dark.
 *
 * Lamps on the models give each craft bright points; this gives those points
 * something to sit inside. It is one additive puff of the family colour per
 * enemy, billboarded at the craft, off while the sun is up and strongest at
 * the floor of the night - so the darker the sky gets, the more each enemy
 * lights itself, which is the only way a purple helicopter stays findable
 * against a near-black city without being repainted gold.
 *
 * It is a glow, not a light: three.js keys every shader program on the scene's
 * light count, so a real light per enemy would recompile every material in the
 * city the moment a wave spawned. One pooled instanced quad costs a single
 * draw call and nothing else.
 */
const enemyHaloGeometry = new THREE.PlaneGeometry(2, 2)
const enemyHaloMaterial = new THREE.MeshBasicMaterial({
  map: entityHaloTexture,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
})
const ENEMY_HALO_CAPACITY = Object.values(ENEMY_CAPS).reduce((sum, count) => sum + count, 0)

function EnemyHaloPool() {
  const { runtime } = useGame()
  const { camera } = useThree()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const color = useMemo(() => new THREE.Color(), [])
  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    const nightFactor = runtime.current.daylight.nightFactor
    enemyHaloMaterial.opacity = enemyHaloOpacity(nightFactor)
    if (enemyHaloMaterial.opacity <= 0.001) {
      mesh.count = 0
      return
    }
    let count = 0
    for (const enemy of runtime.current.enemies.slots) {
      if (!enemy.active) continue
      const halo = ENEMY_HALO[enemy.kind]
      position.set(enemy.position.x, enemy.position.y + halo.height, enemy.position.z)
      // Shrinks with a craft being swallowed, so the glow leaves with the
      // thing that was casting it instead of hanging in the air.
      const absorbing = enemy.absorbing ? Math.max(0.04, enemy.absorbTimer / BEAM_ABSORB_TIME) : 1
      scale.setScalar(halo.radius * absorbing)
      matrix.compose(position, camera.quaternion, scale)
      mesh.setMatrixAt(count, matrix)
      // An armed mine pulses its halo with its fuse, so the warning is the
      // same beat on the model and around it.
      const pulse = enemy.kind === 'drone' && enemy.mineArmed
        ? 1.5 + 0.9 * Math.sin(clock.elapsedTime * 15) ** 2
        : 1
      color.set(ENEMY_GLOW[enemy.kind]).multiplyScalar(halo.strength * pulse)
      mesh.setColorAt(count, color)
      count += 1
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh
      ref={ref}
      args={[enemyHaloGeometry, enemyHaloMaterial, ENEMY_HALO_CAPACITY]}
      frustumCulled={false}
      renderOrder={3}
    />
  )
}

function EnemyPools() {
  return (
    <group>
      <EnemyPool kind="helicopter" />
      <EnemyPool kind="anti-air" />
      <EnemyPool kind="fighter" />
      <EnemyPool kind="boss" />
      <MinePool />
      <MineBlastFieldPool />
      <EnemyHaloPool />
    </group>
  )
}

const ENEMY_WARNING_CAPACITY = Object.values(ENEMY_CAPS).reduce((sum, value) => sum + value, 0)

/**
 * The charge ring under a gun that is about to fire, which is now only ever
 * the battleship's bow gun - nothing else in the roster telegraphs. The ring
 * goes round the turret that is charging rather than on the street below it: a
 * mark ninety metres under the ship points at nothing the player can act on.
 */
function EnemyWarnings() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const quaternion = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), [])
  const color = useMemo(() => new THREE.Color(), [])
  useFrame(({ clock }) => {
    const mesh = ref.current
    if (!mesh) return
    let count = 0
    for (const enemy of runtime.current.enemies.slots) {
      if (!enemy.active || enemy.telegraph <= 0) continue
      // The ship telegraphs two different things and they want different
      // marks. The bow gun gets a ring around the turret that is charging - a
      // mark on the street ninety metres below the hull points at nothing the
      // player can act on. The flak stream gets an orange aim point at the
      // locked target instead, because that stream lands up in the sky and the
      // warning has to be exactly where the rounds will arrive.
      const locked = enemy.flakLeft > 0
      if (locked) position.set(enemy.target.x, enemy.target.y, enemy.target.z)
      else position.set(enemy.muzzle.x, enemy.muzzle.y, enemy.muzzle.z)
      const pulse = 1 + Math.sin(clock.elapsedTime * 18) * 0.12
      scale.setScalar(3.4 * pulse)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(count, matrix)
      color.set(locked ? '#ff9a3d' : '#ff5f7c')
      mesh.setColorAt(count, color)
      count += 1
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, ENEMY_WARNING_CAPACITY]} frustumCulled={false} renderOrder={4}>
      <ringGeometry args={[0.82, 1, 20]} />
      {/* No vertexColors - the same pitfall City.tsx documents on its lot and
          beacon materials: this ring geometry carries no per-vertex colour
          attribute, so the flag makes the shader multiply by one that isn't
          there and the whole warning comes out black. The per-ring colour is
          setColorAt above, which works on its own; it is the flag that has to
          go, not the tint. Not tone-mapped: this is the player's only warning
          and must not dim with the rest of the scene at night. */}
      <meshBasicMaterial transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} />
    </instancedMesh>
  )
}

/**
 * The aim line: where a shot is about to go.
 *
 * The ring on the turret says the bow gun is charging. It does not say at
 * what, and at the range this fight is held that is most of the warning
 * missing. The line runs from the muzzle to the point the shot is predicted to
 * meet the craft, so getting off it is the dodge.
 *
 * Only the battleship draws one. It is the last weapon in the game that aims;
 * everything else fires the curtain, which announces itself by being slow.
 *
 * It exists only while the enemy is aiming. Once the shot leaves, the line goes
 * with it: a trajectory drawn after the fact is information arriving too late
 * to use, and at these speeds it would only clutter the screen. Everything the
 * player gets to decide happens inside the telegraph.
 */
const AIM_LINE_CAPACITY = ENEMY_WARNING_CAPACITY

function EnemyAimLines() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const axis = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const direction = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    let count = 0
    for (const enemy of runtime.current.enemies.slots) {
      if (!enemy.active || !enemy.aiming || enemy.telegraph <= 0) continue
      // Drawn from the frozen muzzle, which is exactly where the shot will
      // leave from - so the line the player reacts to is the line they get.
      direction.set(
        enemy.target.x - enemy.muzzle.x,
        enemy.target.y - enemy.muzzle.y,
        enemy.target.z - enemy.muzzle.z,
      )
      const length = direction.length()
      if (length < 0.5) continue
      direction.divideScalar(length)
      quaternion.setFromUnitVectors(axis, direction)
      position.set(
        enemy.muzzle.x + direction.x * length * 0.5,
        enemy.muzzle.y + direction.y * length * 0.5,
        enemy.muzzle.z + direction.z * length * 0.5,
      )
      // Thickens as the telegraph runs out, so "about to fire" is legible
      // without reading a number. Measured against this shot's own telegraph -
      // the bow gun waits far longer than a turret did, and a fixed per-kind
      // figure would show both as the same warning.
      const charge = Math.min(1, Math.max(0, 1 - enemy.telegraph / enemy.telegraphLength))
      const girth = 0.09 + charge * 0.16
      scale.set(girth, length, girth)
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(count, matrix)
      count += 1
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, AIM_LINE_CAPACITY]} frustumCulled={false} renderOrder={4}>
      <cylinderGeometry args={[1, 1, 1, 5]} />
      {/* No vertexColors: plain cylinder geometry, no per-vertex colour
          attribute - see the ring above. Additive on top of that would have
          made the line not merely wrong but invisible, since black adds
          nothing. Like the ring, it must not dim with the night. */}
      <meshBasicMaterial color="#ff5f7c" transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </instancedMesh>
  )
}

function EnemyProjectiles() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const travel = useMemo(() => new THREE.Vector3(), [])
  const shotAxis = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    let count = 0
    for (const projectile of runtime.current.enemies.projectiles) {
      // Orbs live in their own pool: they are slow curtain rounds, and the
      // additive tracer look that suits the bow gun washes out against a
      // bright sky exactly when a curtain most needs to be readable. With the
      // rest of the roster on curtain fire, the bow gun is all that is left
      // here - one shell at a time, and the only shot the player was warned
      // about before it left.
      if (!projectile.active || projectile.kind === 'orb') continue
      position.set(projectile.position.x, projectile.position.y, projectile.position.z)
      const size = 1.35
      // Stretched along travel rather than a round dot: at these speeds a
      // sphere gives no sense of which way a shot is going, and which way it
      // is going is the only thing the player can act on once it is out.
      travel.set(projectile.velocity.x, projectile.velocity.y, projectile.velocity.z)
      const speed = travel.length()
      if (speed > 0.001) {
        travel.divideScalar(speed)
        quaternion.setFromUnitVectors(shotAxis, travel)
        scale.set(size, size * (1 + speed * 0.05), size)
      } else {
        quaternion.identity()
        scale.setScalar(size)
      }
      matrix.compose(position, quaternion, scale)
      mesh.setMatrixAt(count, matrix)
      count += 1
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, ENEMY_MAX_PROJECTILES]} frustumCulled={false} renderOrder={5}>
      <sphereGeometry args={[1, 6, 4]} />
      {/* No vertexColors: plain sphere geometry, no per-vertex colour
          attribute - see EnemyWarnings above. Additive blending on a black
          result is an invisible shot, which is what this was. One weapon is
          left in this pool, so the material carries its colour outright. */}
      <meshBasicMaterial color="#ff5f7c" transparent opacity={0.94} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
    </instancedMesh>
  )
}

/**
 * The curtain rounds.
 *
 * Every gun outside the boss fires this now, so it is the single thing the
 * player reads the sky by, and it earns a real picture rather than a dot: a
 * white-hot centre with fire curling off it, tinted a soft red. See
 * `orbFlareTexture` for the drawing; here it is a camera-facing quad with a
 * slow per-orb spin, so the filaments turn as the round travels and it reads
 * as burning rather than as a decal being carried through the air.
 *
 * Red because red is the only colour the city's fire has ever been - the mine
 * shells, the boss's bow gun, the hull flash - and muted rather than hot,
 * because a saturated red at the size of a full curtain turns the screen into
 * an alarm. It should look like something burning at a distance; what carries
 * the urgency is how many of them there are.
 *
 * Two fixed 96-slot instanced meshes, reusing the projectile pool's own slots:
 * the flare, and an opaque core inside it. Deliberately NOT additive, unlike
 * every other shot. Additive blending buys glow at night and pays for it at
 * noon - against a bright sky it converges on white-on-white, which is how the
 * first pass of these was on screen for five seconds at a time without being
 * seen at all. A normal-blended opaque core is visible against anything the
 * sky can be.
 */
/**
 * How big the round draws, against a hit radius of 0.7.
 *
 * The flare is wider than what it can hit, and has to be: the filaments are
 * haze, and haze is how the eye finds a slow round against a city. What must
 * not happen is the dense part of the sprite over-claiming - a player dodges
 * what they can see, so if the solid centre were as wide as the whole quad
 * every near miss would read as a hit that failed to register. The bright core
 * is roughly the hitbox; everything past it fades.
 */
const ORB_FLARE_SIZE = 3.1
const ORB_CORE_SIZE = 0.46

function OrbPool() {
  const { runtime } = useGame()
  const flareRef = useRef<THREE.InstancedMesh>(null)
  const coreRef = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const identity = useMemo(() => new THREE.Quaternion(), [])
  const facing = useMemo(() => new THREE.Quaternion(), [])
  const spin = useMemo(() => new THREE.Quaternion(), [])
  const viewAxis = useMemo(() => new THREE.Vector3(0, 0, 1), [])
  useFrame(({ clock, camera }) => {
    const flare = flareRef.current
    const core = coreRef.current
    if (!flare || !core) return
    const time = clock.elapsedTime
    const projectiles = runtime.current.enemies.projectiles
    let count = 0
    for (let slot = 0; slot < projectiles.length; slot += 1) {
      const projectile = projectiles[slot]!
      if (!projectile.active || projectile.kind !== 'orb') continue
      position.set(projectile.position.x, projectile.position.y, projectile.position.z)
      // Each round breathes and turns on its own phase, keyed to its pool slot
      // rather than to its place in this frame's list - otherwise every orb's
      // look would shuffle the moment one ahead of it in the pool expired.
      const pulse = 1 + Math.sin(time * 7 + slot * 1.7) * 0.12
      // Billboard, then roll about the view axis: the quad always faces the
      // camera and the fire on it rotates. Alternating direction by slot stops
      // a whole ring of them from turning like one gear.
      spin.setFromAxisAngle(viewAxis, time * (slot % 2 === 0 ? 0.9 : -0.72) + slot * 0.8)
      facing.copy(camera.quaternion).multiply(spin)
      scale.setScalar(ORB_FLARE_SIZE * pulse)
      matrix.compose(position, facing, scale)
      flare.setMatrixAt(count, matrix)
      scale.setScalar(ORB_CORE_SIZE * pulse)
      matrix.compose(position, identity, scale)
      core.setMatrixAt(count, matrix)
      count += 1
    }
    flare.count = count
    core.count = count
    flare.instanceMatrix.needsUpdate = true
    core.instanceMatrix.needsUpdate = true
  })
  return (
    <group>
      <instancedMesh ref={flareRef} args={[undefined, undefined, ENEMY_MAX_PROJECTILES]} frustumCulled={false} renderOrder={5}>
        <planeGeometry args={[1, 1]} />
        {/* White, because the colour is already in the texture: the flare
            cools from white at the core to a soft red at the tips, and that
            gradient is what makes it read as burning. A flat per-instance tint
            over the whole sprite would flatten it back into a decal - and with
            vertexColors on a plane that carries no colour attribute it would
            do worse than that and come out black. See EnemyWarnings. */}
        <meshBasicMaterial
          map={orbFlareTexture}
          transparent
          opacity={0.92}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh ref={coreRef} args={[undefined, undefined, ENEMY_MAX_PROJECTILES]} frustumCulled={false} renderOrder={6}>
        <sphereGeometry args={[1, 8, 6]} />
        {/* A hard little centre inside the flare, for the distances where the
            sprite is a handful of pixels and its own white core has been
            filtered down to a smudge. Solid and depth-sorted, so an orb behind
            a tower is behind it. */}
        <meshBasicMaterial color="#ffece9" toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

function LaserProjectiles() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const direction = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const side = useMemo(() => new THREE.Vector3(), [])
  const facing = useMemo(() => new THREE.Vector3(), [])
  const normal = useMemo(() => new THREE.Vector3(), [])
  const basis = useMemo(() => new THREE.Matrix4(), [])
  const geometry = useMemo(() => {
    const result = new THREE.BufferGeometry()
    result.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.7, -0.5, 0, 0.7, -0.5, 0, 0.12, 0.5, 0, -0.12, 0.5, 0,
      0, -0.5, -0.7, 0, -0.5, 0.7, 0, 0.5, 0.12, 0, 0.5, -0.12,
    ], 3))
    result.setAttribute('uv', new THREE.Float32BufferAttribute([
      0, 0, 1, 0, 1, 1, 0, 1,
      0, 0, 1, 0, 1, 1, 0, 1,
    ], 2))
    result.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7])
    return result
  }, [])
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ff4f9d',
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  }), [])
  useEffect(() => () => {
    geometry.dispose()
    material.dispose()
  }, [geometry, material])
  useFrame(({ camera }) => {
    if (!ref.current) return
    let count = 0
    for (const projectile of runtime.current.laserProjectiles) {
      if (!projectile.active) continue
      direction.set(projectile.direction.x, projectile.direction.y, projectile.direction.z).normalize()
      position.set(
        projectile.position.x + direction.x * projectile.distance / 2,
        projectile.position.y + direction.y * projectile.distance / 2,
        projectile.position.z + direction.z * projectile.distance / 2,
      )
      facing.copy(camera.position).sub(position).normalize()
      side.crossVectors(direction, facing)
      if (side.lengthSq() < 0.0001) side.set(1, 0, 0)
      else side.normalize()
      normal.crossVectors(side, direction).normalize()
      basis.makeBasis(side, direction, normal)
      quaternion.setFromRotationMatrix(basis)
      scale.set(1.35, projectile.distance, 1.35)
      matrix.compose(position, quaternion, scale)
      ref.current.setMatrixAt(count, matrix)
      count += 1
    }
    ref.current.count = count
    ref.current.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={ref} args={[geometry, material, LASER_MAX_PROJECTILES]} frustumCulled={false} renderOrder={5} />
  )
}

/**
 * The billowing blast a mine leaves behind.
 *
 * One lumpy lobe geometry, instanced once per puff, with the puff's own life
 * fed in per instance. Everything that makes it read as fire is in the ramp:
 * white-hot at the moment a lobe erupts, flame within a third of its life,
 * ember, then smoke - and because the lobes are staggered (see core/fireball),
 * the outer ones are still erupting white through the gaps while the first
 * ones are already going dark. That is the "driven from inside" look; scaling
 * a single sphere up cannot produce it.
 *
 * The hot end is deliberately far above 1.0 so the bloom pass in PostFx picks
 * it up and the core blows out, while the smoke stays under the threshold and
 * settles into the night instead of glowing.
 */
const fireballVertex = `
attribute float aLife;
attribute float aSeed;
varying float vLife;
varying float vSeed;
varying vec3 vWorldNormal;
varying vec3 vViewNormal;
varying vec3 vViewPosition;
varying vec3 vLocal;
void main() {
  vLife = aLife;
  vSeed = aSeed;
  vLocal = position;
  vec3 instanced = mat3(instanceMatrix) * normal;
  vWorldNormal = normalize(instanced);
  vViewNormal = normalize(normalMatrix * instanced);
  vec4 view = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  vViewPosition = view.xyz;
  gl_Position = projectionMatrix * view;
}
`

const fireballFragment = `
varying float vLife;
varying float vSeed;
varying vec3 vWorldNormal;
varying vec3 vViewNormal;
varying vec3 vViewPosition;
varying vec3 vLocal;

void main() {
  float life = clamp(vLife, 0.0, 1.0);

  // Cheap smooth mottling so a lobe has creases instead of reading as a ball.
  float mottle = 0.74 + 0.26
    * sin(vLocal.x * 6.1 + vSeed)
    * sin(vLocal.y * 5.3 + vSeed * 1.7)
    * sin(vLocal.z * 6.7 + vSeed * 2.3);

  // Kept in the city's own amber, not pushed to white.
  //
  // Bloom in PostFx keys on luminance, so the way to make a core glow is to
  // put it over the threshold - but raising all three channels to get there
  // clips to white and the fire loses its colour, which is what turned the
  // middle of a blast into a flat blown-out disc. Red and green carry it
  // instead and blue is held well down, so the core saturates to the warm
  // yellow the streetlights and signs already use and blooms on hue rather
  // than on white.
  vec3 core  = vec3(1.72, 1.16, 0.34);
  vec3 flame = vec3(1.78, 0.70, 0.10);
  vec3 ember = vec3(0.62, 0.15, 0.035);
  vec3 smoke = vec3(0.16, 0.145, 0.14);
  vec3 tint = life < 0.18
    ? mix(core, flame, life / 0.18)
    : life < 0.56
      ? mix(flame, ember, (life - 0.18) / 0.38)
      : mix(ember, smoke, (life - 0.56) / 0.44);

  // Lit from above, which is what separates the crowns of the lobes from the
  // shadowed undersides and gives the cluster its depth.
  float up = clamp(vWorldNormal.y * 0.5 + 0.5, 0.0, 1.0);
  tint *= mottle * (0.46 + up * 0.74);

  // A hot edge while it is young: the fire wrapping around each lobe.
  float facing = abs(dot(normalize(vViewNormal), normalize(-vViewPosition)));
  tint += flame * pow(1.0 - facing, 3.0) * (1.0 - life) * 0.45;

  float birth = smoothstep(0.0, 0.07, life);
  float death = 1.0 - smoothstep(0.68, 1.0, life);
  float alpha = birth * death * mix(1.0, 0.62, smoothstep(0.5, 1.0, life));
  gl_FragColor = vec4(tint, alpha);
}
`

/** A lobe: a sphere pushed around by two octaves of smooth noise, so the
 *  silhouette is cauliflower rather than a ball. */
const fireballPuffGeometry = (() => {
  const geometry = new THREE.IcosahedronGeometry(1, 3)
  const positions = geometry.getAttribute('position')
  const vertex = new THREE.Vector3()
  for (let index = 0; index < positions.count; index += 1) {
    vertex.fromBufferAttribute(positions, index)
    const coarse = Math.sin(vertex.x * 2.4) * Math.sin(vertex.y * 2.1 + 1.3) * Math.sin(vertex.z * 2.7 + 2.1)
    const fine = Math.sin(vertex.x * 6.3 + 0.7) * Math.sin(vertex.y * 5.9 + 2.4) * Math.sin(vertex.z * 6.7 + 4.2)
    vertex.multiplyScalar(1 + coarse * 0.26 + fine * 0.1)
    positions.setXYZ(index, vertex.x, vertex.y, vertex.z)
  }
  geometry.computeVertexNormals()
  return geometry
})()

const FIREBALL_CAPACITY = FIREBALL_MAX * FIREBALL_PUFFS

function FireballPool() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const centre = useMemo(() => ({ x: 0, y: 0, z: 0 }), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const euler = useMemo(() => new THREE.Euler(), [])
  const life = useMemo(() => new THREE.InstancedBufferAttribute(new Float32Array(FIREBALL_CAPACITY), 1), [])
  const seed = useMemo(() => new THREE.InstancedBufferAttribute(new Float32Array(FIREBALL_CAPACITY), 1), [])
  const geometry = useMemo(() => {
    const lobe = fireballPuffGeometry.clone()
    lobe.setAttribute('aLife', life)
    lobe.setAttribute('aSeed', seed)
    return lobe
  }, [life, seed])
  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: fireballVertex,
    fragmentShader: fireballFragment,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  }), [])

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    let count = 0
    for (const fireball of runtime.current.fireballs) {
      if (!fireball.active) continue
      for (let index = 0; index < fireball.puffCount; index += 1) {
        const puff = fireball.puffs[index]!
        if (count >= FIREBALL_CAPACITY) break
        const progress = fireballPuffProgress(fireball, puff)
        // Not erupted yet, or already gone. Drawing either would put a lobe
        // at full size on frame one and leave a smoke ball hanging after.
        if (progress < 0 || progress > 1) continue
        fireballPuffCentre(fireball, puff, progress, centre)
        position.set(centre.x, centre.y, centre.z)
        euler.set(puff.seed * 1.7, puff.seed * 2.3, puff.seed * 0.9)
        rotation.setFromEuler(euler)
        const radius = fireballPuffRadius(fireball, puff, progress)
        scale.set(radius, radius * (0.86 + (puff.seed % 1) * 0.28), radius)
        matrix.compose(position, rotation, scale)
        mesh.setMatrixAt(count, matrix)
        life.array[count] = progress
        seed.array[count] = puff.seed
        count += 1
      }
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    life.needsUpdate = true
    seed.needsUpdate = true
  })

  return (
    <instancedMesh ref={ref} args={[geometry, material, FIREBALL_CAPACITY]} frustumCulled={false} renderOrder={6} onUpdate={(mesh) => { mesh.count = 0 }} />
  )
}

/** How much bigger a landing round reads than it used to. */
const IMPACT_BURST_SCALE = 1.5

function LaserBursts() {
  const { runtime } = useGame()
  const rings = useRef<THREE.InstancedMesh>(null)
  const sparks = useRef<THREE.InstancedMesh>(null)
  const flashes = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const quaternion = useMemo(() => new THREE.Quaternion(), [])
  const spin = useMemo(() => new THREE.Quaternion(), [])
  const forward = useMemo(() => new THREE.Vector3(0, 0, 1), [])
  useFrame(({ camera }) => {
    if (!rings.current || !sparks.current || !flashes.current) return
    let count = 0
    for (const burst of runtime.current.laserBursts) {
      if (!burst.active) continue
      const remaining = burst.life / burst.duration
      // The impact half is half again the size it was: a round landing on a
      // tower has to be visible against the tower.
      const hit = burst.kind === 'muzzle' ? 1 : IMPACT_BURST_SCALE
      const ringSize = burst.kind === 'muzzle'
        ? 0.35 + remaining * 0.9
        : (0.25 + (1 - remaining) * 2.35) * hit
      position.set(burst.position.x, burst.position.y, burst.position.z)
      scale.setScalar(ringSize)
      matrix.compose(position, camera.quaternion, scale)
      rings.current.setMatrixAt(count, matrix)
      rings.current.setColorAt(count, color.set(burst.color).multiplyScalar(0.45 + remaining * 0.85))

      quaternion.copy(camera.quaternion)
      spin.setFromAxisAngle(forward, count * 1.91 + (1 - remaining) * 1.4)
      quaternion.multiply(spin)
      scale.set((0.12 + remaining * 0.14) * hit, (0.8 + (1 - remaining) * 2.8) * hit, 0.12 * hit)
      matrix.compose(position, quaternion, scale)
      sparks.current.setMatrixAt(count, matrix)
      sparks.current.setColorAt(count, color.set(burst.color).multiplyScalar(0.75 + remaining * 0.5))

      scale.setScalar((burst.kind === 'muzzle' ? 0.5 : 1.25 * IMPACT_BURST_SCALE) * remaining)
      matrix.compose(position, camera.quaternion, scale)
      flashes.current.setMatrixAt(count, matrix)
      flashes.current.setColorAt(count, color.set(burst.color).multiplyScalar(0.7 + remaining))
      count += 1
    }
    for (const mesh of [rings.current, sparks.current, flashes.current]) {
      mesh.count = count
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  })
  return (
    <group>
      {/* No vertexColors on any of the three - the pitfall City.tsx documents
          on its lot and beacon materials, and the reason these bursts were not
          on screen at all: ring, tetrahedron and circle geometry carry no
          per-vertex colour attribute, so the flag makes the shader multiply by
          one that is not there and every burst comes out black, which under
          additive blending is nothing whatsoever. The per-burst colour is
          setColorAt below, and that works on its own - it is the flag, not the
          tint, that has to go. Every call site passes its own colour, from the
          laser scoring a wall to a curtain round bursting on the hull. */}
      <instancedMesh ref={rings} args={[undefined, undefined, LASER_MAX_BURSTS]} frustumCulled={false} renderOrder={6}>
        <ringGeometry args={[0.62, 1, 24]} />
        <meshBasicMaterial transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={sparks} args={[undefined, undefined, LASER_MAX_BURSTS]} frustumCulled={false} renderOrder={7}>
        <tetrahedronGeometry args={[1, 0]} />
        <meshBasicMaterial transparent opacity={0.86} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={flashes} args={[undefined, undefined, LASER_MAX_BURSTS]} frustumCulled={false} renderOrder={8}>
        <circleGeometry args={[1, 12]} />
        <meshBasicMaterial transparent opacity={0.78} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} toneMapped={false} />
      </instancedMesh>
    </group>
  )
}

function LaserAimController() {
  const { runtime } = useGame()
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const pointer = useMemo(() => new THREE.Vector2(), [])
  useFrame(({ camera }) => {
    const game = runtime.current
    pointer.set(game.aimX, -game.aimY)
    raycaster.setFromCamera(pointer, camera)
    game.laserAimOrigin.x = raycaster.ray.origin.x
    game.laserAimOrigin.y = raycaster.ray.origin.y
    game.laserAimOrigin.z = raycaster.ray.origin.z
    game.laserAimDirection.x = raycaster.ray.direction.x
    game.laserAimDirection.y = raycaster.ray.direction.y
    game.laserAimDirection.z = raycaster.ray.direction.z
  }, -2)
  return null
}

function WorldTick() {
  const { advance } = useGame()
  useFrame((_, dt) => advance(dt), -1)
  return null
}

function FixedEffectLights() {
  const { runtime, snapshot } = useGame()
  const ufoLight = useRef<THREE.PointLight>(null)
  const boostLight = useRef<THREE.PointLight>(null)
  const targetLight = useRef<THREE.PointLight>(null)
  useFrame(() => {
    const drone = runtime.current.drone
    if (ufoLight.current) {
      ufoLight.current.position.set(drone.position.x, drone.position.y - 1.1, drone.position.z)
      // Only the intensity moves with the cycle - the slot itself is mounted
      // for the whole run, so the scene's light count never changes and no
      // material gets recompiled when the sky does.
      const nightFactor = runtime.current.daylight.nightFactor
      ufoLight.current.intensity = (snapshot.beamActive ? 1.35 : 0.32) + nightFactor * 0.62
      ufoLight.current.color.set(ENTITY.UFO_RIM)
    }
    if (boostLight.current) {
      boostLight.current.position.set(
        drone.position.x - Math.sin(drone.heading) * 2.4,
        drone.position.y,
        drone.position.z - Math.cos(drone.heading) * 2.4,
      )
      boostLight.current.intensity = snapshot.boostActive ? 4.6 : 0
    }
    if (targetLight.current) {
      targetLight.current.position.set(drone.position.x, drone.position.y - 2.2, drone.position.z)
      targetLight.current.intensity = snapshot.beamActive ? 3.2 : 0
      targetLight.current.color.set(ENTITY.UFO_POOL)
    }
  })
  return (
    <group>
      <pointLight ref={ufoLight} color={ENTITY.UFO_RIM} intensity={0.32} distance={8} />
      <pointLight ref={boostLight} color={ENTITY.UFO_DOME} intensity={0} distance={8} />
      <pointLight ref={targetLight} color={ENTITY.UFO_POOL} intensity={0} distance={10} />
    </group>
  )
}

/**
 * Pushes the cycle into every shared material once per frame. Centralised so
 * there is one place that knows what "night" does to the scene, instead of a
 * dozen components each sampling the clock.
 */
function DaylightMaterials() {
  const { runtime } = useGame()
  const applied = useRef(-1)
  useFrame(() => {
    const nightFactor = runtime.current.daylight.nightFactor
    // Skip when nothing moved: the cycle is slow and these writes touch
    // materials shared by every pooled instance.
    if (Math.abs(nightFactor - applied.current) < 0.002) return
    applied.current = nightFactor
    applyCityDaylight(nightFactor)
    applyEntityDaylight(nightFactor)
    setNightVisibility(nightFactor)
  })
  return null
}

function PerformanceProbe() {
  const { runtime } = useGame()
  const elapsed = useRef(0)
  useFrame(({ gl, scene }, dt) => {
    if (!import.meta.env.DEV) return
    const pose = (window.__BEAM_BANDIT_POSE__ ??= { x: 0, y: 0, z: 0, heading: 0 })
    pose.x = runtime.current.drone.position.x
    pose.y = runtime.current.drone.position.y
    pose.z = runtime.current.drone.position.z
    pose.heading = runtime.current.drone.heading
    elapsed.current += dt
    if (elapsed.current < 0.5) return
    elapsed.current = 0
    let visibleMeshPools = 0
    scene.traverse((object) => {
      if ((object as THREE.Mesh).isMesh && object.visible) visibleMeshPools += 1
    })
    const activeTraffic = runtime.current.traffic.cars.filter((car) => car.active).length
    window.__BEAM_BANDIT_METRICS__ = {
      activeBuildings: runtime.current.world.buildings.length,
      activeCars: runtime.current.beamObjects.length + activeTraffic,
      activeTraffic,
      activeLaserProjectiles: runtime.current.laserProjectiles.filter((projectile) => projectile.active).length,
      activeEnemies: runtime.current.enemies.slots.filter((enemy) => enemy.active).length,
      activeCrowds: runtime.current.crowds.objects.filter((object) => object.active).length,
      beamedCrowds: runtime.current.crowds.objects.filter((object) => object.active && object.inBeam).length,
      activeHazards: runtime.current.hazards.objects.filter((object) => object.active).length,
      ballast: runtime.current.ballast,
      absorbedCount: runtime.current.absorbedCount,
      size: runtime.current.size,
      activeEnemyProjectiles: runtime.current.enemies.projectiles.filter((projectile) => projectile.active).length,
      laserShotsFired: runtime.current.laserShotsFired,
      boonLevels: { ...runtime.current.boons.levels },
      beamReachScale: runtime.current.sizeProfile.beamReach,
      height: runtime.current.drone.position.y,
      missionStage: runtime.current.mission.stage,
      remainingTime: runtime.current.remainingTime,
      tutorialCats: runtime.current.crowds.objects.filter((object) => object.active && object.kind === 'cat').length,
      visibleMeshPools,
    }
    gl.domElement.dataset.renderMetrics = JSON.stringify(window.__BEAM_BANDIT_METRICS__)
  })
  return null
}

const skyUniforms = {
  uHorizon: { value: new THREE.Color(SKY.HORIZON) },
  uMiddle: { value: new THREE.Color(SKY.MIDDLE) },
  uTop: { value: new THREE.Color(SKY.TOP) },
  uStar: { value: new THREE.Color(SKY.STAR) },
  uStarIntensity: { value: 1 },
  uTime: { value: 0 },
  uNightFactor: { value: 0 },
}

const skyVertexShader = `
  varying vec3 vPosition;
  void main() {
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// Stars are drawn inside the sky shader rather than as geometry: a starfield
// mesh would be another draw call and another pool to cull, and this costs a
// hash per pixel on a dome that is already being shaded. uStarIntensity fades
// them in as the run turns to night.
const skyFragmentShader = `
  uniform vec3 uHorizon;
  uniform vec3 uMiddle;
  uniform vec3 uTop;
  uniform vec3 uStar;
  uniform float uStarIntensity;
  uniform float uTime;
  uniform float uNightFactor;
  varying vec3 vPosition;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec3 direction = normalize(vPosition);
    float h = direction.y;
    vec3 color = mix(uHorizon, uMiddle, smoothstep(-0.10, 0.28, h));
    color = mix(color, uTop, smoothstep(0.28, 0.88, h));

    // A restrained aurora keeps the night sky alive without becoming another
    // object or light. It is sinusoidal in the dome direction and fades out
    // completely through the daylight factor.
    float band = smoothstep(0.18, 0.72, h) * (1.0 - smoothstep(0.72, 0.96, h));
    float wave = 0.5 + 0.5 * sin(direction.x * 5.0 + sin(direction.z * 3.0 + uTime * 0.05) * 2.0 + uTime * 0.12);
    vec3 auroraColor = mix(vec3(0.12, 0.78, 0.62), vec3(0.52, 0.30, 0.88), smoothstep(0.22, 0.8, wave));
    color += auroraColor * band * wave * uNightFactor * 0.16;

    // Cell the dome, keep one candidate star per cell, and only light the few
    // that clear the threshold. Fades out near the horizon so the city glow
    // does not end up full of stars sitting behind buildings.
    if (uStarIntensity > 0.001) {
      vec2 cell = floor(direction.xz * 78.0 / max(0.25, abs(direction.y) + 0.35));
      float pick = hash(cell);
      float star = smoothstep(0.9955, 1.0, pick);
      float twinkle = 0.65 + 0.35 * sin(uTime * 1.7 + pick * 90.0);
      color += uStar * star * twinkle * smoothstep(0.02, 0.35, h) * uStarIntensity;
    }
    gl_FragColor = vec4(color, 1.0);
  }
`

/**
 * Scratch colours for the sky mix. Module scope on purpose: this runs every
 * frame and the whole render layer is written to avoid per-tick allocation.
 */
const daylightScratch = {
  background: new THREE.Color(),
  fog: new THREE.Color(),
  ambient: new THREE.Color(),
  hemiSky: new THREE.Color(),
  hemiGround: new THREE.Color(),
  sun: new THREE.Color(),
  cloud: new THREE.Color(),
  from: new THREE.Color(),
  to: new THREE.Color(),
}

/** Keyframe hex strings parsed once into linear-space colours. Mixing there
 *  rather than in sRGB keeps a sunset from going muddy through the midpoint. */
const daylightColorCache = new Map<string, THREE.Color>()
function cachedColor(hex: string) {
  let color = daylightColorCache.get(hex)
  if (!color) {
    color = new THREE.Color(hex)
    daylightColorCache.set(hex, color)
  }
  return color
}

// Render-only comfort targets. The day-cycle timing remains untouched; its
// darkest phase is simply graded toward a bright pastel twilight so the scene
// never turns into black silhouettes and isolated neon dots.
const comfortNightTarget: Record<keyof DaylightKeyframe['colors'], string> = {
  background: SKY.BACKGROUND,
  horizon: SKY.HORIZON,
  middle: SKY.MIDDLE,
  top: SKY.TOP,
  fog: SKY.FOG,
  ambient: LIGHT.AMBIENT,
  hemiSky: LIGHT.HEMI_SKY,
  hemiGround: LIGHT.HEMI_GROUND,
  sun: LIGHT.MOON,
  cloud: SKY.CLOUD,
}

function mixDaylight(
  out: THREE.Color,
  sample: DaylightSample,
  channel: keyof DaylightKeyframe['colors'],
) {
  out.lerpColors(cachedColor(sample.from.colors[channel]), cachedColor(sample.to.colors[channel]), sample.blend)
  // Preserve the cycle and its phase cues, but keep every phase inside the same
  // gentle storybook grade. The visual blend has no effect on the cycle clock
  // or any gameplay system that reads it.
  return out.lerp(cachedColor(comfortNightTarget[channel]), 0.18 + sample.nightFactor * 0.82)
}

const SUN_DISTANCE = 330

function Sky() {
  const { runtime } = useGame()
  const skyRoot = useRef<THREE.Group>(null)
  const keyLight = useRef<THREE.DirectionalLight>(null)
  const ambient = useRef<THREE.AmbientLight>(null)
  const hemisphere = useRef<THREE.HemisphereLight>(null)
  const sunBody = useRef<THREE.Mesh>(null)
  const sunHalo = useRef<THREE.Mesh>(null)
  const moonBody = useRef<THREE.Mesh>(null)
  const moonHalo = useRef<THREE.Mesh>(null)
  const cloudRoot = useRef<THREE.Group>(null)
  const lightTarget = useMemo(() => new THREE.Object3D(), [])
  const clouds = useMemo(() => [
    [-62, 38, -90, 1.4], [45, 50, -115, 1.8], [82, 33, -65, 1.1],
    [-95, 48, 15, 1.5], [18, 55, 88, 1.3], [-40, 31, 105, 1.1],
  ] as [number, number, number, number][], [])

  useFrame(({ camera, clock, scene }) => {
    skyUniforms.uTime.value = clock.elapsedTime
    if (skyRoot.current) skyRoot.current.position.set(camera.position.x, 0, camera.position.z)
    lightTarget.position.set(camera.position.x, 0, camera.position.z)
    lightTarget.updateMatrixWorld()

    const sample = runtime.current.daylight

    mixDaylight(skyUniforms.uHorizon.value, sample, 'horizon')
    mixDaylight(skyUniforms.uMiddle.value, sample, 'middle')
    mixDaylight(skyUniforms.uTop.value, sample, 'top')
    skyUniforms.uStarIntensity.value = sample.starIntensity * 0.32
    skyUniforms.uNightFactor.value = sample.nightFactor

    if (scene.background instanceof THREE.Color) {
      scene.background.copy(mixDaylight(daylightScratch.background, sample, 'background'))
    }
    if (scene.fog instanceof THREE.Fog) {
      // Fog is the final pixel of the horizon, so use the same mixed horizon
      // colour as the sky instead of letting the keyframe fog drift apart.
      scene.fog.color.copy(mixDaylight(daylightScratch.fog, sample, 'horizon'))
      // The horizon opens up with the craft. Free at the shader level, and the
      // extra skyline it uncovers is one instanced draw.
      const reach = runtime.current.sizeProfile.viewDistance
      scene.fog.near = Math.max(210, sample.fogNear) * reach
      scene.fog.far = Math.max(650, sample.fogFar) * reach
    }

    if (ambient.current) {
      ambient.current.color.copy(mixDaylight(daylightScratch.ambient, sample, 'ambient'))
      ambient.current.intensity = Math.max(0.38, sample.ambientIntensity * (1 - sample.nightFactor * 0.25))
    }
    if (hemisphere.current) {
      hemisphere.current.color.copy(mixDaylight(daylightScratch.hemiSky, sample, 'hemiSky'))
      hemisphere.current.groundColor.copy(mixDaylight(daylightScratch.hemiGround, sample, 'hemiGround'))
      hemisphere.current.intensity = Math.max(0.56, sample.hemiIntensity)
    }

    // One directional light for the whole cycle: it is the sun while the sun is
    // up and the moon afterwards. Adding a second would change the scene light
    // count and force every material to recompile mid-run.
    const bodyAltitude = sample.sunOpacity >= sample.moonOpacity ? sample.sunAltitude : sample.moonAltitude
    if (keyLight.current) {
      keyLight.current.color.copy(mixDaylight(daylightScratch.sun, sample, 'sun'))
      keyLight.current.intensity = Math.max(0.96, sample.sunIntensity + sample.nightFactor * 0.16)
      keyLight.current.position.set(
        camera.position.x - Math.cos(bodyAltitude) * 90,
        Math.max(12, Math.sin(bodyAltitude) * 120 + 40),
        camera.position.z + 60,
      )
    }

    // Sun and moon ride the same arc half a turn apart, so one sets as the
    // other rises.
    const place = (mesh: THREE.Mesh | null, altitude: number, side: number) => {
      if (!mesh) return
      mesh.position.set(
        Math.cos(altitude) * SUN_DISTANCE * side,
        Math.sin(altitude) * SUN_DISTANCE,
        -SUN_DISTANCE * 0.55,
      )
    }
    place(sunBody.current, sample.sunAltitude, -1)
    place(sunHalo.current, sample.sunAltitude, -1)
    place(moonBody.current, sample.moonAltitude, 1)
    place(moonHalo.current, sample.moonAltitude, 1)
    const fade = (mesh: THREE.Mesh | null, opacity: number, scale = 1) => {
      if (!mesh) return
      const material = mesh.material as THREE.MeshBasicMaterial
      material.opacity = opacity * scale
      mesh.visible = opacity > 0.01
    }
    if (sunBody.current) (sunBody.current.material as THREE.MeshBasicMaterial).color.copy(mixDaylight(daylightScratch.sun, sample, 'sun'))
    fade(sunBody.current, sample.sunOpacity)
    fade(sunHalo.current, sample.sunOpacity, 0.3)
    fade(moonBody.current, sample.moonOpacity)
    fade(moonHalo.current, sample.moonOpacity, 0.2)

    if (cloudRoot.current) {
      mixDaylight(daylightScratch.cloud, sample, 'cloud')
      cloudRoot.current.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (!mesh.isMesh) return
        const material = mesh.material as THREE.MeshBasicMaterial
        material.color.copy(daylightScratch.cloud)
        material.opacity = 0.72 - sample.nightFactor * 0.08
      })
    }
  })

  return (
    <>
      <color attach="background" args={[SKY.BACKGROUND]} />
      <fog attach="fog" args={[SKY.FOG, 150, 560]} />
      {/* The light COUNT is fixed on purpose. three.js keys shader programs on
          it, so adding a lamp here would recompile every material in the scene.
          Night is built from emissive surfaces instead - see the palette notes. */}
      <ambientLight ref={ambient} color={LIGHT.AMBIENT} intensity={0.52} />
      <hemisphereLight ref={hemisphere} args={[LIGHT.HEMI_SKY, LIGHT.HEMI_GROUND, 0.72]} />
      <directionalLight
        ref={keyLight}
        target={lightTarget}
        position={[60, 90, -120]}
        color={LIGHT.MOON}
        intensity={0.85}
      />
      <primitive object={lightTarget} />
      <group ref={skyRoot}>
        <mesh scale={390} renderOrder={-10}>
          <sphereGeometry args={[1, 32, 18]} />
          <shaderMaterial
            side={THREE.BackSide}
            depthWrite={false}
            uniforms={skyUniforms}
            vertexShader={skyVertexShader}
            fragmentShader={skyFragmentShader}
          />
        </mesh>
        <mesh ref={sunHalo}>
          <circleGeometry args={[96, 40]} />
          <meshBasicMaterial color="#ffcf8a" transparent opacity={0.3} fog={false} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh ref={sunBody}>
          <circleGeometry args={[46, 44]} />
          <meshBasicMaterial color="#ffe7bd" transparent fog={false} toneMapped={false} />
        </mesh>
        <mesh ref={moonHalo}>
          <circleGeometry args={[70, 40]} />
          <meshBasicMaterial color={SKY.MOON_HALO} transparent opacity={0.16} fog={false} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh ref={moonBody}>
          <circleGeometry args={[34, 40]} />
          <meshBasicMaterial color={SKY.MOON} transparent fog={false} toneMapped={false} />
        </mesh>
        <group ref={cloudRoot}>
          {clouds.map(([x, y, z, scale], index) => (
            <group key={index} position={[x, y, z]} scale={scale}>
              {([[-5, 0, 0, 5], [0, 1.4, 0, 7], [6, 0, 0, 4.5], [1, -1.2, 0, 6]] as [number, number, number, number][]).map((part, partIndex) => (
                <mesh key={partIndex} position={[part[0], part[1], part[2]]} scale={[part[3], part[3] * 0.42, 1]}>
                  <sphereGeometry args={[1, 10, 6]} />
                  <meshBasicMaterial color={SKY.CLOUD} transparent opacity={0.72} fog />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      </group>
    </>
  )
}

function MissionCheckpoint() {
  const { runtime } = useGame()
  const ref = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const group = ref.current
    if (!group) return
    const checkpoint = runtime.current.checkpoint
    group.visible = Boolean(checkpoint)
    if (!checkpoint) return
    group.position.set(checkpoint.x, checkpoint.y, checkpoint.z)
    group.lookAt(runtime.current.drone.position.x, checkpoint.y, runtime.current.drone.position.z)
    const pulse = 1 + Math.sin(clock.elapsedTime * 5) * 0.08
    group.scale.setScalar(pulse)
  })
  return (
    <group ref={ref} visible={false}>
      <mesh>
        <torusGeometry args={[4.2, 0.42, 8, 28]} />
        <meshBasicMaterial color="#b7ff63" transparent opacity={0.9} toneMapped={false} />
      </mesh>
      <mesh scale={0.83}>
        <torusGeometry args={[4.2, 0.12, 6, 28]} />
        <meshBasicMaterial color="#fff5c7" transparent opacity={0.78} toneMapped={false} />
      </mesh>
    </group>
  )
}

export function DroneScene() {
  const { snapshot, quality } = useGame()
  return (
    <>
      <Sky />
      <LaserAimController />
      <WorldTick />
      <DaylightMaterials />
      <FixedEffectLights />
      <PerformanceProbe />
      <City />
      <MissionCheckpoint />
      <PullableCars />
      <BeamTargetRings />
      <DrivingTraffic />
      <CrowdPools />
      <TutorialCatMarker />
      <HazardPool />
      <EnemyPools />
      <EnemyWarnings />
      <EnemyAimLines />
      <EnemyProjectiles />
      <OrbPool />
      <LaserProjectiles />
      <LaserBursts />
      <FireballPool />
      <TractorBeam />
      <UfoGroundPool />
      <UfoNightGlow />
      <Ufo />
      <PostFx speed={snapshot.speed} impact={snapshot.impactFlash} impactKind={snapshot.impactKind} quality={quality} />
    </>
  )
}
