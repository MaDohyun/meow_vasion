import { useFrame } from '@react-three/fiber'
import { memo, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { useGame } from '../GameContext'
import { BEAM_ABSORB_TIME } from '../core/beam'
import { bulletinFor } from '../i18n'
import { BUILDING, GROUND } from '../constants/palette'
import {
  groundLandmarkForCell,
  isNewsTower,
  isConvenienceStore,
  landmarkId,
  newsScreenMount,
  NEWS_SCREEN_HEIGHT,
} from '../core/cityLandmarks'
import {
  groundCellsAround,
  mysteryCircleForCell,
  seedForWorldCell,
  WORLD_CELL_SIZE,
  WORLD_MAX_BUILDINGS,
} from '../core/world'
import { BOON_COLORS, BOON_HEAL_COLOR, boonForCircle, boonHoverY } from '../core/boons'
import {
  busStopsAround,
  isWorldPropDisplaced,
  isWorldPropHidden,
  parkBenchesAround,
  parkTreesAround,
  worldPropVisibilityKey,
  worldPropsAround,
  LANDMARK_CELL_COUNT,
  LANDMARK_RADIUS_CELLS,
  LAKE_SHORE_TREE_CAPACITY,
  PARK_TREE_COUNT,
  TREE_VARIANT_SLENDER,
} from '../core/worldProps'

// The news anchor is the player-supplied portrait (public/broadcast/anchor.png),
// not code-drawn - see drawAnchor below. Loaded once at module scope since
// every news tower screen shares the one texture already.
const anchorImage = new Image()
anchorImage.src = '/broadcast/anchor.png'

// The sighting footage in the inset - also the player-supplied art, not
// code-drawn. A still frame rather than the old animated saucer, same
// reasoning as the anchor photo: it cannot be redrawn into new poses, so it
// is dropped in as-is instead of half-animated.
const ufoSightingImage = new Image()
ufoSightingImage.src = '/broadcast/ufo-sighting.webp'

const MYSTERY_MARK_WIDTH = 25.5
const MYSTERY_MARK_DEPTH = 23.3
const MYSTERY_BEACON_HEIGHT = 68
const MYSTERY_PARTICLES_PER_CIRCLE = 106
const MYSTERY_PARTICLE_CAPACITY = LANDMARK_CELL_COUNT * MYSTERY_PARTICLES_PER_CIRCLE

function canvasTexture(
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void,
  width = 512,
  height = 256,
) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  draw(context, width, height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.magFilter = THREE.LinearFilter
  texture.minFilter = THREE.LinearMipmapLinearFilter
  texture.generateMipmaps = true
  return texture
}

const convenienceStoreTexture = canvasTexture((context, width, height) => {
  context.fillStyle = '#fff2bd'
  context.fillRect(0, 0, width, height)
  context.fillStyle = '#64bba6'
  context.fillRect(0, 0, width, 42)
  context.fillRect(0, height - 42, width, 42)
  context.fillStyle = '#4b5365'
  context.font = '900 70px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('MINI MART', width / 2, height / 2 - 10)
  context.font = '700 31px sans-serif'
  context.fillStyle = '#e57882'
  context.fillText('OPEN 24 HOURS', width / 2, height / 2 + 60)
})

/**
 * A news broadcast, told entirely through composition - no writing anywhere.
 *
 * A studio backdrop, an anchor in the lower third, an over-shoulder inset, and
 * a blank lower band are enough that anyone reads "news" instantly, in any
 * language. The UFO footage that used to fill the whole screen now plays inside
 * the inset, which is what makes the anchor the subject and the sighting the
 * story rather than the other way round.
 *
 * The anchor moves a little - a slow sway, an occasional blink. Perfectly still
 * would read as a photograph on a wall; more than this would pull the eye away
 * from the city.
 *
 * The caption bar is normally blank. Standing text on a screen that is always
 * there stops being read within a minute, so the only time words appear is
 * while a wave bulletin is on air: for those few seconds the headline goes in
 * the bar, a BREAKING flag goes beside it, and the anchor's mouth opens and
 * closes. Then it empties again.
 */
function drawUfoNewsFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  headline: string | null = null,
  flag = '',
) {
  // Studio backdrop, lit rather than dark. A screen on the side of a building
  // has to be brighter than the building for the eye to read it as a screen;
  // the old navy set went the same value as the night city around it and read
  // as a hole punched in the wall.
  const backdrop = context.createLinearGradient(0, 0, 0, height)
  backdrop.addColorStop(0, '#f7f4ea')
  backdrop.addColorStop(1, '#dfdccf')
  context.fillStyle = backdrop
  context.fillRect(0, 0, width, height)
  context.strokeStyle = 'rgba(96,110,140,.10)'
  context.lineWidth = 2
  for (let x = 0; x < width; x += 54) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke()
  }
  // A desk band across the lower half, so the anchor is sitting at something.
  context.fillStyle = '#c9c4b4'
  context.fillRect(0, height * 0.66, width, height * 0.09)

  // Over-shoulder inset, upper right. The sighting footage lives here.
  const insetX = width * 0.5
  const insetY = height * 0.12
  const insetW = width * 0.42
  const insetH = height * 0.38
  context.fillStyle = '#0a1a2c'
  context.fillRect(insetX, insetY, insetW, insetH)
  context.save()
  context.beginPath()
  context.rect(insetX, insetY, insetW, insetH)
  context.clip()
  drawUfoFootage(context, insetX, insetY, insetW, insetH, time)
  context.restore()
  context.strokeStyle = '#3b4463'
  context.lineWidth = 5
  context.strokeRect(insetX, insetY, insetW, insetH)

  drawAnchor(context, width, height, time, headline !== null)

  // Lower third: the caption bar, plus a blank ticker beneath. The bar grows a
  // little while a bulletin runs so the screen visibly switches to breaking
  // coverage even at the distance these towers are usually seen from.
  const barY = headline ? height * 0.715 : height * 0.74
  const barH = headline ? height * 0.135 : height * 0.11
  context.fillStyle = '#ef5265'
  context.fillRect(0, barY, width, barH)
  if (headline) {
    // BREAKING flag, then the headline. Sized off the canvas so the 512px
    // texture and any future resolution lay out the same.
    const pad = width * 0.035
    context.font = `900 ${Math.round(height * 0.045)}px system-ui, sans-serif`
    const flagW = context.measureText(flag).width + pad
    context.fillStyle = '#141a34'
    context.fillRect(pad, barY + barH * 0.22, flagW, barH * 0.56)
    context.fillStyle = '#ffe05f'
    context.textBaseline = 'middle'
    context.fillText(flag, pad + pad * 0.5, barY + barH * 0.5)
    context.fillStyle = '#fff5c7'
    context.font = `900 ${Math.round(height * 0.052)}px system-ui, sans-serif`
    context.fillText(headline, pad * 1.6 + flagW, barY + barH * 0.5, width - pad * 2.6 - flagW)
    context.textBaseline = 'alphabetic'
  } else {
    context.fillStyle = 'rgba(255,241,189,.85)'
    context.fillRect(width * 0.05, height * 0.775, width * 0.44, height * 0.035)
  }
  // Ticker in light grey with dark ticks. A dark bar would put the one heavy
  // block on the screen at the very bottom and tip the whole panel forward.
  context.fillStyle = '#e6e2d6'
  context.fillRect(0, height * 0.85, width, height * 0.15)
  context.fillStyle = 'rgba(58,66,92,.5)'
  for (let x = width * 0.04; x < width * 0.92; x += width * 0.13) {
    context.fillRect(x, height * 0.895, width * 0.09, height * 0.028)
  }

  // Live dot, the one thing allowed to pulse - it is a lamp, not information.
  context.fillStyle = `rgba(219,54,68,${0.55 + Math.sin(time * 4) * 0.35})`
  context.beginPath(); context.arc(width * 0.06, height * 0.07, 12, 0, Math.PI * 2); context.fill()
}

/**
 * The sighting footage, drawn into whatever rectangle it is given - the
 * reference art, cover-fit so it fills the inset without stretching. The
 * caller already clips to this rectangle, so overflow from the fit is cut
 * off there rather than needing a second clip here.
 */
function drawUfoFootage(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  _time: number,
) {
  if (!ufoSightingImage.complete || ufoSightingImage.naturalWidth === 0) {
    context.fillStyle = '#16234a'
    context.fillRect(x, y, w, h)
    return
  }
  const scale = Math.max(w / ufoSightingImage.naturalWidth, h / ufoSightingImage.naturalHeight)
  const drawW = ufoSightingImage.naturalWidth * scale
  const drawH = ufoSightingImage.naturalHeight * scale
  context.drawImage(ufoSightingImage, x + (w - drawW) / 2, y + (h - drawH) / 2, drawW, drawH)
}

/**
 * Head and shoulders, lower left - the reference photo drawn straight in.
 * A live photo cannot blink or open its mouth the way the old silhouette
 * drawing did, so this keeps only the sway: enough that the screen still
 * reads as live video rather than a poster, without inventing motion the
 * source art does not have.
 */
function drawAnchor(context: CanvasRenderingContext2D, width: number, height: number, time: number, _talking = false) {
  if (!anchorImage.complete || anchorImage.naturalWidth === 0) return
  const sway = Math.sin(time * 0.9) * width * 0.006
  const cx = width * 0.3 + sway
  // Shoulders have to clear the caption bar - 0.74 normally, 0.715 while a
  // bulletin is on air - or the figure gets swallowed by it.
  const shoulderY = height * 0.72
  const bustW = width * 0.46
  const bustH = bustW * (anchorImage.naturalHeight / anchorImage.naturalWidth)
  context.drawImage(anchorImage, cx - bustW / 2, shoulderY - bustH * 0.94, bustW, bustH)
}

const ufoWarningTexture = canvasTexture((context, width, height) => drawUfoNewsFrame(context, width, height, 0), 512, 512)

const metroTexture = canvasTexture((context, width, height) => {
  context.fillStyle = '#f3df8e'
  context.fillRect(0, 0, width, height)
  context.fillStyle = '#537f9d'
  context.beginPath()
  context.arc(90, height / 2, 60, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = '#fff6d8'
  context.font = '900 74px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('M', 90, height / 2 + 2)
  context.fillStyle = '#40485d'
  context.font = '900 64px sans-serif'
  context.fillText('METRO', 325, height / 2)
})

const busTexture = canvasTexture((context, width, height) => {
  context.fillStyle = '#6aaec0'
  context.fillRect(0, 0, width, height)
  context.fillStyle = '#fff1c5'
  context.font = '900 100px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('BUS', width / 2, height / 2)
})

const parkingLinesTexture = canvasTexture((context, width, height) => {
  context.clearRect(0, 0, width, height)
  context.strokeStyle = 'rgba(255,245,205,.9)'
  context.lineWidth = 8
  context.strokeRect(14, 14, width - 28, height - 28)
  for (let x = 44; x < width - 20; x += 88) {
    context.beginPath()
    context.moveTo(x, 18)
    context.lineTo(x, height - 18)
    context.stroke()
  }
  context.fillStyle = 'rgba(105,140,173,.9)'
  context.beginPath()
  context.arc(width - 55, 55, 29, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = '#fff8dc'
  context.font = '900 38px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('P', width - 55, 57)
})

type LandmarkGlowRamp = {
  material: THREE.MeshToonMaterial
  day: number
  night: number
}

const landmarkGlowRamps: LandmarkGlowRamp[] = []

function withLandmarkGlow(material: THREE.MeshToonMaterial, day: number, night: number) {
  landmarkGlowRamps.push({ material, day, night })
  return material
}

const mysteryCircleTexture = new THREE.TextureLoader().load('/landmarks/mystery-circle.png')
mysteryCircleTexture.colorSpace = THREE.SRGBColorSpace
mysteryCircleTexture.magFilter = THREE.LinearFilter
mysteryCircleTexture.minFilter = THREE.LinearMipmapLinearFilter

const mysteryCircleMaterial = withLandmarkGlow(new THREE.MeshToonMaterial({
  color: '#fff7d5',
  map: mysteryCircleTexture,
  emissive: new THREE.Color('#fff0a4'),
  emissiveMap: mysteryCircleTexture,
  transparent: true,
  opacity: 0.74,
  depthWrite: false,
  side: THREE.DoubleSide,
}), 0.04, 1.3)

const mysteryParticlePositions = new Float32Array(MYSTERY_PARTICLE_CAPACITY * 3)
const mysteryParticleColors = new Float32Array(MYSTERY_PARTICLE_CAPACITY * 3)
const mysteryParticleGeometry = new THREE.BufferGeometry()
const mysteryParticlePositionAttribute = new THREE.BufferAttribute(mysteryParticlePositions, 3)
const mysteryParticleColorAttribute = new THREE.BufferAttribute(mysteryParticleColors, 3)
mysteryParticlePositionAttribute.setUsage(THREE.DynamicDrawUsage)
mysteryParticleColorAttribute.setUsage(THREE.DynamicDrawUsage)
mysteryParticleGeometry.setAttribute('position', mysteryParticlePositionAttribute)
mysteryParticleGeometry.setAttribute('color', mysteryParticleColorAttribute)
mysteryParticleGeometry.setDrawRange(0, 0)

/**
 * The pickup saucer hovering over an unclaimed circle: a flattened hull with
 * a little dome, one merged geometry so the whole pool is a single draw. The
 * stat it grants is said with instance colour (see core/boons BOON_COLORS);
 * a soft uniform emissive keeps it readable inside the night-time beacon.
 */
const boonSaucerGeometry = mergeGeometries([
  new THREE.SphereGeometry(1.55, 14, 10).scale(1, 0.4, 1),
  new THREE.SphereGeometry(0.72, 12, 8).translate(0, 0.42, 0),
], false)!
const boonSaucerMaterial = new THREE.MeshToonMaterial({
  color: '#ffffff',
  emissive: new THREE.Color('#5a4618'),
  emissiveIntensity: 0.6,
})

/** Laser answer on a landmark, in the buildings' own hit red. Instance
 *  colours multiply the material, so white is "untouched". */
const landmarkHitTint = new THREE.Color(BUILDING.LASER_HIT)
const landmarkBaseTint = new THREE.Color('#ffffff')

const mysteryParticleMaterial = new THREE.PointsMaterial({
  color: '#ffe7a2',
  size: 0.28,
  vertexColors: true,
  transparent: true,
  opacity: 0.14,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  sizeAttenuation: true,
})

const storeBandMaterial = withLandmarkGlow(new THREE.MeshToonMaterial({
  color: BUILDING.STORE_BAND,
  emissive: new THREE.Color(BUILDING.STORE_BAND),
}), 0.04, 0.68)

function displayMaterial(map: THREE.Texture, night: number, day = 0.05) {
  return withLandmarkGlow(new THREE.MeshToonMaterial({
    color: '#ffffff',
    map,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: map,
  }), day, night)
}

/**
 * Blank cladding for the storey the news screen is mounted on.
 *
 * A screen stuck straight onto a window grid reads as a poster taped over
 * glass, not as part of the building - and it got worse once the facade
 * started tiling by height and the windows got denser. Real facade screens are
 * mounted on solid wall; the wall is made solid here.
 *
 * Not registered for the night glow: this is wall. A band that lit up would be
 * competing with the screen bolted to it.
 */
const screenMountMaterial = new THREE.MeshToonMaterial({ color: '#ffffff' })

const storeSignMaterial = displayMaterial(convenienceStoreTexture, 0.9)
// Dimmer than the old dark set needed. The texture is now mostly light, so the
// same emissive multiplier that used to lift a navy studio to "lit screen"
// blows a white one out to a flat white panel.
const warningScreenMaterial = displayMaterial(ufoWarningTexture, 0.52, 0.2)

/**
 * A forecourt: canopy on posts with a pump island under it. Gives the tankers
 * an origin, so a truck full of fuel reads as belonging to the city rather than
 * as a hazard that wandered in from nowhere.
 */
const gasStationGeometry = mergeGeometries([
  // Canopy and its posts.
  new THREE.BoxGeometry(13, 0.9, 9).translate(0, 5.6, 0),
  new THREE.BoxGeometry(13.4, 0.5, 9.4).translate(0, 5.05, 0),
  ...[-5.4, 5.4].flatMap((x) => [-3.6, 3.6].map((z) =>
    new THREE.CylinderGeometry(0.32, 0.32, 5.1, 8).translate(x, 2.55, z),
  )),
  // Pump island.
  new THREE.BoxGeometry(7.4, 0.4, 3).translate(0, 0.2, 0),
  ...[-2.2, 2.2].map((x) => new THREE.BoxGeometry(1, 2.1, 1.2).translate(x, 1.4, 0)),
  // Kiosk off to one side.
  new THREE.BoxGeometry(6, 3.4, 5).translate(-9.5, 1.7, 0),
], false)!

const gasStationMaterial = withLandmarkGlow(
  new THREE.MeshToonMaterial({ color: '#e4e0d2', emissive: new THREE.Color('#ffcf6a') }),
  0.04,
  0.5,
)

const gasStationCanopyMaterial = withLandmarkGlow(
  new THREE.MeshToonMaterial({ color: '#d8443f', emissive: new THREE.Color('#ff6a4d') }),
  0.05,
  0.55,
)

const gasStationBandGeometry = new THREE.BoxGeometry(13.6, 0.55, 9.6)

const metroSignMaterial = displayMaterial(metroTexture, 0.85)
const busSignMaterial = displayMaterial(busTexture, 0.75)

export function applyLandmarkDaylight(nightFactor: number) {
  for (const ramp of landmarkGlowRamps) {
    ramp.material.emissiveIntensity = ramp.day + (ramp.night - ramp.day) * nightFactor
  }
}

function setPoolCount(mesh: THREE.InstancedMesh | null, count: number, colors = false) {
  if (!mesh) return
  mesh.count = count
  mesh.instanceMatrix.needsUpdate = true
  if (colors && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
}

function BuildingFeaturePool() {
  const { runtime, t } = useGame()
  const storeBands = useRef<THREE.InstancedMesh>(null)
  const storeSigns = useRef<THREE.InstancedMesh>(null)
  const warningScreens = useRef<THREE.InstancedMesh>(null)
  const screenMounts = useRef<THREE.InstancedMesh>(null)
  const lastKey = useRef('')
  const lastNewsFrame = useRef(-1)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const color = useMemo(() => new THREE.Color(), [])
  const mountNeutral = useMemo(() => new THREE.Color(BUILDING.FACADE_WALL), [])
  const sideRotation = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), [])

  useFrame(({ clock }) => {
    if (!storeBands.current || !storeSigns.current || !warningScreens.current) return
    if (!screenMounts.current) return
    const newsFrame = Math.floor(clock.elapsedTime * 12)
    if (newsFrame !== lastNewsFrame.current) {
      lastNewsFrame.current = newsFrame
      const canvas = ufoWarningTexture.image as HTMLCanvasElement
      const context = canvas.getContext('2d')
      if (context) {
        // One 512px texture serves every news tower, so the bulletin is read
        // straight off the runtime here rather than pushed in per building.
        // Localised at draw time, which is why switching language in the
        // options changes the city's screens within a frame.
        const game = runtime.current
        const onAir = game.broadcastTime > 0
        drawUfoNewsFrame(
          context,
          canvas.width,
          canvas.height,
          clock.elapsedTime,
          onAir ? bulletinFor(t, game.broadcastStage).headline : null,
          t.breakingFlag,
        )
        ufoWarningTexture.needsUpdate = true
      }
    }
    const world = runtime.current.world
    if (world.key === lastKey.current) return
    lastKey.current = world.key
    let storeCount = 0
    let warningCount = 0
    for (const building of world.buildings) {
      const signOnX = building.sign.side === 'x'
      if (isConvenienceStore(building)) {
        position.set(building.position.x, Math.min(3.35, building.size.y * 0.43), building.position.z)
        scale.set(building.size.x * 1.025, 1.25, building.size.z * 1.025)
        matrix.compose(position, rotation, scale)
        storeBands.current.setMatrixAt(storeCount, matrix)

        position.set(
          building.position.x + (signOnX ? building.size.x / 2 + 0.35 : 0),
          Math.min(4.25, building.size.y * 0.56),
          building.position.z + (!signOnX ? building.size.z / 2 + 0.35 : 0),
        )
        scale.set(Math.min(11, (signOnX ? building.size.z : building.size.x) * 0.68), 2.35, 0.26)
        matrix.compose(position, signOnX ? sideRotation : rotation, scale)
        storeSigns.current.setMatrixAt(storeCount, matrix)
        storeCount += 1
      }

      if (isNewsTower(building)) {
        const mount = newsScreenMount(building)
        // Wraps all four faces. Blanking only the face the screen is on would
        // just move the problem to wherever the player happens to fly.
        position.set(building.position.x, mount.centre, building.position.z)
        scale.set(building.size.x * 1.02, mount.height, building.size.z * 1.02)
        matrix.compose(position, rotation, scale)
        screenMounts.current.setMatrixAt(warningCount, matrix)
        screenMounts.current.setColorAt(warningCount, color.set(building.color).lerp(mountNeutral, 0.5).multiplyScalar(0.92))

        // The screen sits proud of the band, which is itself proud of the wall.
        position.set(
          building.position.x + (signOnX ? building.size.x / 2 + 0.42 : 0),
          mount.centre,
          building.position.z + (!signOnX ? building.size.z / 2 + 0.42 : 0),
        )
        scale.set(Math.min(15, (signOnX ? building.size.z : building.size.x) * 0.78), NEWS_SCREEN_HEIGHT, 0.34)
        matrix.compose(position, signOnX ? sideRotation : rotation, scale)
        warningScreens.current.setMatrixAt(warningCount, matrix)
        warningCount += 1
      }
    }
    setPoolCount(storeBands.current, storeCount)
    setPoolCount(storeSigns.current, storeCount)
    setPoolCount(warningScreens.current, warningCount)
    setPoolCount(screenMounts.current, warningCount, true)
  })

  return (
    <group>
      <instancedMesh ref={storeBands} args={[undefined, storeBandMaterial, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={storeSigns} args={[undefined, storeSignMaterial, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={screenMounts} args={[undefined, screenMountMaterial, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={warningScreens} args={[undefined, warningScreenMaterial, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
    </group>
  )
}

const benchGeometry = (() => {
  const seat = new THREE.BoxGeometry(3.4, 0.35, 1).translate(0, 0.8, 0)
  const back = new THREE.BoxGeometry(3.4, 1.25, 0.28).translate(0, 1.35, 0.38)
  const left = new THREE.BoxGeometry(0.28, 0.8, 0.8).translate(-1.25, 0.4, 0)
  const right = new THREE.BoxGeometry(0.28, 0.8, 0.8).translate(1.25, 0.4, 0)
  return mergeGeometries([seat, back, left, right], false)!
})()

function LiftedParkBenchPool() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const euler = useMemo(() => new THREE.Euler(), [])

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    let count = 0
    for (const object of runtime.current.beamObjects) {
      if (!isWorldPropDisplaced(object) || object.kind !== 'park-bench') continue
      if (count >= LANDMARK_CELL_COUNT) break
      const swallow = object.absorbing ? Math.max(0.05, object.absorbTimer / BEAM_ABSORB_TIME) : 1
      position.set(object.position.x, object.position.y, object.position.z)
      euler.set(object.rotation.x, object.rotation.y, object.rotation.z)
      rotation.setFromEuler(euler)
      scale.set(object.scale?.x ?? 1, object.scale?.y ?? 1, object.scale?.z ?? 1).multiplyScalar(swallow)
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(count, matrix)
      count += 1
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[benchGeometry, undefined, LANDMARK_CELL_COUNT]} frustumCulled={false} renderOrder={2} onUpdate={(mesh) => { mesh.count = 0 }}>
    <meshToonMaterial color={BUILDING.PARK_BENCH} />
  </instancedMesh>
}

function ParkPool() {
  const { runtime } = useGame()
  const trunks = useRef<THREE.InstancedMesh>(null)
  const roundCrowns = useRef<THREE.InstancedMesh>(null)
  const slenderCrowns = useRef<THREE.InstancedMesh>(null)
  const benches = useRef<THREE.InstancedMesh>(null)
  const lastKey = useRef('')
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const euler = useMemo(() => new THREE.Euler(), [])

  useFrame(() => {
    const trunkMesh = trunks.current
    const roundCrownMesh = roundCrowns.current
    const slenderCrownMesh = slenderCrowns.current
    if (!trunkMesh || !roundCrownMesh || !slenderCrownMesh || !benches.current) return
    const world = runtime.current.world
    const key = `${world.cellX}:${world.cellZ}|${worldPropVisibilityKey(runtime.current.destroyedWorldProps, runtime.current.beamObjects)}`
    if (key === lastKey.current) return
    lastKey.current = key
    let treeCount = 0
    let roundCrownCount = 0
    let slenderCrownCount = 0
    let parkCount = 0
    const writeTree = (tree: ReturnType<typeof parkTreesAround>[number]) => {
      if (isWorldPropHidden(tree.id, runtime.current.destroyedWorldProps, runtime.current.beamObjects)) return
      const height = tree.height ?? 2.8
      const crown = tree.crown ?? 2.2
      position.set(tree.position.x, height / 2, tree.position.z)
      scale.set(crown * 0.3, height, crown * 0.3)
      matrix.compose(position, rotation, scale)
      trunkMesh.setMatrixAt(treeCount, matrix)
      treeCount += 1

      const slender = tree.variant === TREE_VARIANT_SLENDER
      position.set(tree.position.x, height + crown * (slender ? 0.95 : 0.65), tree.position.z)
      scale.set(
        crown * (slender ? 0.72 : 1),
        crown * (slender ? 1.2 : 1),
        crown * (slender ? 0.72 : 1),
      )
      matrix.compose(position, rotation, scale)
      if (slender) {
        slenderCrownMesh.setMatrixAt(slenderCrownCount, matrix)
        slenderCrownCount += 1
      } else {
        roundCrownMesh.setMatrixAt(roundCrownCount, matrix)
        roundCrownCount += 1
      }
    }
    for (const tree of parkTreesAround(runtime.current.drone.position)) {
      writeTree(tree)
    }
    for (const bench of parkBenchesAround(runtime.current.drone.position)) {
      if (isWorldPropHidden(bench.id, runtime.current.destroyedWorldProps, runtime.current.beamObjects)) continue
      position.set(bench.position.x, bench.position.y, bench.position.z)
      euler.set(0, bench.rotation, 0)
      rotation.setFromEuler(euler)
      scale.set(bench.scale.x, bench.scale.y, bench.scale.z)
      matrix.compose(position, rotation, scale)
      benches.current.setMatrixAt(parkCount, matrix)
      parkCount += 1
    }
    // The lake is no longer an abrupt sheet of water in a dense city. These
    // small dry-bank trees reuse the same fixed instanced meshes as park trees
    // and stay inset from all road strips.
    for (const tree of worldPropsAround(runtime.current.world, runtime.current.drone.position).filter((prop) => prop.kind === 'tree' && prop.id.startsWith('tree:lake:'))) {
      if (treeCount >= LANDMARK_CELL_COUNT * PARK_TREE_COUNT + LAKE_SHORE_TREE_CAPACITY) break
      writeTree(tree as ReturnType<typeof parkTreesAround>[number])
    }
    setPoolCount(trunkMesh, treeCount)
    setPoolCount(roundCrownMesh, roundCrownCount)
    setPoolCount(slenderCrownMesh, slenderCrownCount)
    setPoolCount(benches.current, parkCount)
  })

  return (
    <group>
      <instancedMesh ref={trunks} args={[undefined, undefined, LANDMARK_CELL_COUNT * PARK_TREE_COUNT + LAKE_SHORE_TREE_CAPACITY]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <cylinderGeometry args={[0.5, 0.62, 1, 7]} />
        <meshToonMaterial color={BUILDING.PARK_TRUNK} />
      </instancedMesh>
      <instancedMesh ref={roundCrowns} args={[undefined, undefined, LANDMARK_CELL_COUNT * PARK_TREE_COUNT + LAKE_SHORE_TREE_CAPACITY]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <icosahedronGeometry args={[1, 1]} />
        <meshToonMaterial color={BUILDING.PARK_LEAF} />
      </instancedMesh>
      <instancedMesh ref={slenderCrowns} args={[undefined, undefined, LANDMARK_CELL_COUNT * PARK_TREE_COUNT + LAKE_SHORE_TREE_CAPACITY]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <coneGeometry args={[1, 2, 8]} />
        <meshToonMaterial color={BUILDING.PARK_LEAF} />
      </instancedMesh>
      <instancedMesh ref={benches} args={[benchGeometry, undefined, LANDMARK_CELL_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <meshToonMaterial color={BUILDING.PARK_BENCH} />
      </instancedMesh>
      <LiftedParkBenchPool />
    </group>
  )
}

function MysteryCirclePool() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const lastKey = useRef('')
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const euler = useMemo(() => new THREE.Euler(), [])

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const world = runtime.current.world
    const key = `${world.cellX}:${world.cellZ}`
    if (key === lastKey.current) return
    lastKey.current = key
    let count = 0
    for (const cell of groundCellsAround(runtime.current.drone.position, LANDMARK_RADIUS_CELLS)) {
      if (groundLandmarkForCell(cell) !== 'mystery-circle') continue
      const centerX = (cell.cellX + 0.5) * WORLD_CELL_SIZE
      const centerZ = (cell.cellZ + 0.5) * WORLD_CELL_SIZE
      const seed = seedForWorldCell(cell.cellX, cell.cellZ, 0x6d797374)
      const yaw = ((seed >>> 11) % 360) / 180 * Math.PI
      euler.set(-Math.PI / 2, 0, yaw)
      rotation.setFromEuler(euler)
      position.set(centerX, 0.075, centerZ)
      scale.set(MYSTERY_MARK_WIDTH, MYSTERY_MARK_DEPTH, 1)
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(count, matrix)
      count += 1
      if (count >= LANDMARK_CELL_COUNT) break
    }
    setPoolCount(mesh, count)
  })

  return (
    <instancedMesh ref={ref} args={[undefined, mysteryCircleMaterial, LANDMARK_CELL_COUNT]} frustumCulled={false} renderOrder={3} onUpdate={(mesh) => { mesh.count = 0 }}>
      <planeGeometry args={[1, 1]} />
    </instancedMesh>
  )
}

function MysterySignalPool() {
  const { runtime } = useGame()

  useFrame(({ clock }) => {
    const game = runtime.current
    const night = game.daylight.nightFactor
    mysteryParticleMaterial.opacity = 0.12 + night * 0.88
    mysteryParticleMaterial.size = 0.2 + night * 0.32

    let count = 0
    for (const cell of groundCellsAround(game.drone.position, LANDMARK_RADIUS_CELLS)) {
      if (groundLandmarkForCell(cell) !== 'mystery-circle') continue
      const centerX = (cell.cellX + 0.5) * WORLD_CELL_SIZE
      const centerZ = (cell.cellZ + 0.5) * WORLD_CELL_SIZE
      const seed = seedForWorldCell(cell.cellX, cell.cellZ, 0x6d797374)
      const seedPhase = (seed % 997) * 0.013
      for (let particle = 0; particle < MYSTERY_PARTICLES_PER_CIRCLE; particle += 1) {
        // Bias the distribution upward so the signal grows denser toward the
        // high-rise end of the inverted frustum instead of looking hollow at
        // the top.
        const rawT = (particle + 0.5) / MYSTERY_PARTICLES_PER_CIRCLE
        const t = Math.pow(rawT, 0.72)
        const height = 0.8 + t * MYSTERY_BEACON_HEIGHT
        const pulse = 0.82 + Math.sin(clock.elapsedTime * 1.8 + seedPhase + particle * 0.63) * 0.18
        const radius = (1.8 + t * 10.8) * pulse
        const angle = seedPhase + particle * 2.399963 + clock.elapsedTime * (0.08 + (1 - t) * 0.08)
        const slot = count * 3
        mysteryParticlePositions[slot] = centerX + Math.cos(angle) * radius
        mysteryParticlePositions[slot + 1] = height
        mysteryParticlePositions[slot + 2] = centerZ + Math.sin(angle) * radius
        const shimmer = 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(clock.elapsedTime * 3.2 + seedPhase + particle))
        mysteryParticleColors[slot] = shimmer
        mysteryParticleColors[slot + 1] = shimmer * 0.72
        mysteryParticleColors[slot + 2] = shimmer * 0.32
        count += 1
      }
    }
    mysteryParticleGeometry.setDrawRange(0, count)
    mysteryParticlePositionAttribute.needsUpdate = true
    mysteryParticleColorAttribute.needsUpdate = true
  })

  return <points geometry={mysteryParticleGeometry} material={mysteryParticleMaterial} frustumCulled={false} renderOrder={4} />
}

/**
 * One pickup saucer per circle that has not been eaten yet.
 *
 * Bob height comes from core/boons fed with the runtime's own clock, so the
 * item is drawn exactly where the simulation will eat it. Colour is looked up
 * per frame rather than cached: when a stat maxes out mid-run, a circle that
 * carried it re-deals to whatever is still open, and the item has to show it.
 */
function BoonPickupPool() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(1, 1, 1), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const euler = useMemo(() => new THREE.Euler(), [])
  const color = useMemo(() => new THREE.Color(), [])

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const game = runtime.current
    let count = 0
    for (const cell of groundCellsAround(game.drone.position, LANDMARK_RADIUS_CELLS)) {
      if (groundLandmarkForCell(cell) !== 'mystery-circle') continue
      const id = mysteryCircleForCell(cell.cellX, cell.cellZ)
      if (!id || game.boons.claimed.has(id)) continue
      const centerX = (cell.cellX + 0.5) * WORLD_CELL_SIZE
      const centerZ = (cell.cellZ + 0.5) * WORLD_CELL_SIZE
      const seed = seedForWorldCell(cell.cellX, cell.cellZ, 0x626f6f6e)
      euler.set(0, game.sessionTime * 1.6 + (seed % 628) / 100, 0)
      rotation.setFromEuler(euler)
      position.set(centerX, boonHoverY(game.sessionTime, id), centerZ)
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(count, matrix)
      const boon = boonForCircle(game.boons, id)
      mesh.setColorAt(count, color.set(boon ? BOON_COLORS[boon] : BOON_HEAL_COLOR))
      count += 1
      if (count >= LANDMARK_CELL_COUNT) break
    }
    setPoolCount(mesh, count, true)
  })

  return <instancedMesh ref={ref} args={[boonSaucerGeometry, boonSaucerMaterial, LANDMARK_CELL_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }} />
}

function mergedBoxes(parts: [number, number, number, number, number, number][]) {
  return mergeGeometries(parts.map(([sx, sy, sz, x, y, z]) => new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z)), false)!
}

const subwayGeometry = mergedBoxes([
  [8.4, 0.7, 5.8, 0, 0.35, 0],
  [8.8, 0.35, 6.2, 0, 3.4, 0],
  [0.4, 3, 0.4, -3.7, 1.8, -2.5],
  [0.4, 3, 0.4, 3.7, 1.8, -2.5],
  [0.4, 3, 0.4, -3.7, 1.8, 2.5],
  [0.4, 3, 0.4, 3.7, 1.8, 2.5],
])

const busStopGeometry = mergedBoxes([
  [7.2, 0.32, 3.2, 0, 3.2, 0],
  [0.3, 3.1, 0.3, -3.1, 1.6, -1.25],
  [0.3, 3.1, 0.3, 3.1, 1.6, -1.25],
  [0.3, 3.1, 0.3, -3.1, 1.6, 1.25],
  [0.3, 3.1, 0.3, 3.1, 1.6, 1.25],
  [4.8, 0.35, 0.9, 0, 0.9, 0.45],
])

function LiftedBusStopPool() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const euler = useMemo(() => new THREE.Euler(), [])

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    let count = 0
    for (const object of runtime.current.beamObjects) {
      if (!isWorldPropDisplaced(object) || object.kind !== 'bus-stop') continue
      if (count >= WORLD_MAX_BUILDINGS) break
      const swallow = object.absorbing ? Math.max(0.05, object.absorbTimer / BEAM_ABSORB_TIME) : 1
      position.set(object.position.x, object.position.y, object.position.z)
      euler.set(object.rotation.x, object.rotation.y, object.rotation.z)
      rotation.setFromEuler(euler)
      scale.set(object.scale?.x ?? 1, object.scale?.y ?? 1, object.scale?.z ?? 1).multiplyScalar(swallow)
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(count, matrix)
      count += 1
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[busStopGeometry, undefined, WORLD_MAX_BUILDINGS]} frustumCulled={false} renderOrder={2} onUpdate={(mesh) => { mesh.count = 0 }}>
    <meshToonMaterial color={BUILDING.TRANSIT} />
  </instancedMesh>
}

function cylinderBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number) {
  const direction = end.clone().sub(start)
  const geometry = new THREE.CylinderGeometry(radius, radius, direction.length(), 5)
  geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()))
  geometry.translate((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2)
  return geometry
}

const pylonGeometry = (() => {
  const parts: THREE.BufferGeometry[] = []
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      parts.push(cylinderBetween(new THREE.Vector3(x * 3.2, 0, z * 3.2), new THREE.Vector3(x * 0.65, 11, z * 0.65), 0.18))
    }
  }
  parts.push(...[
    cylinderBetween(new THREE.Vector3(-3.2, 0.5, -3.2), new THREE.Vector3(3.2, 0.5, 3.2), 0.12),
    cylinderBetween(new THREE.Vector3(-3.2, 0.5, 3.2), new THREE.Vector3(3.2, 0.5, -3.2), 0.12),
    cylinderBetween(new THREE.Vector3(-4.8, 8.1, 0), new THREE.Vector3(4.8, 8.1, 0), 0.18),
    cylinderBetween(new THREE.Vector3(-3.5, 10.4, 0), new THREE.Vector3(3.5, 10.4, 0), 0.16),
    cylinderBetween(new THREE.Vector3(0, 8.1, -2.8), new THREE.Vector3(0, 8.1, 2.8), 0.14),
  ])
  return mergeGeometries(parts, false)!
})()

// A full-height lattice mast reads as a communications tower even from the
// aerial camera: tapered legs, broadcast rings, a central antenna and a
// beacon cap. It is deliberately high-rise scale rather than a small utility
// prop, while the one merged geometry keeps the landmark in a fixed pool.
function communicationsLegPoint(sideX: number, sideZ: number, t: number) {
  const spread = 5 + (1.1 - 5) * t
  return new THREE.Vector3(sideX * spread, 3 + 44 * t, sideZ * spread)
}

function communicationsGeometryFor(paint: 'red' | 'white') {
  const parts: THREE.BufferGeometry[] = []
  if (paint === 'red') {
    parts.push(
      new THREE.CylinderGeometry(2.8, 4.8, 3.4, 8).translate(0, 1.7, 0),
      new THREE.CylinderGeometry(0.46, 0.54, 12.5, 8).translate(0, 9.25, 0),
      new THREE.CylinderGeometry(0.46, 0.54, 12.5, 8).translate(0, 34.25, 0),
      new THREE.TorusGeometry(4.5, 0.18, 6, 16).rotateX(Math.PI / 2).translate(0, 42, 0),
      new THREE.SphereGeometry(0.8, 8, 4).translate(0, 62, 0),
    )
  } else {
    parts.push(
      new THREE.CylinderGeometry(0.46, 0.54, 12.5, 8).translate(0, 21.75, 0),
      new THREE.CylinderGeometry(0.46, 0.62, 12.5, 8).translate(0, 46.75, 0),
      new THREE.CylinderGeometry(0.2, 0.32, 9, 6).translate(0, 57.5, 0),
      new THREE.TorusGeometry(5.6, 0.22, 6, 16).rotateX(Math.PI / 2).translate(0, 24, 0),
      new THREE.TorusGeometry(3.2, 0.15, 6, 14).rotateX(Math.PI / 2).translate(0, 54, 0),
    )
  }
  for (const sideX of [-1, 1]) {
    for (const sideZ of [-1, 1]) {
      for (let segment = 0; segment < 4; segment += 1) {
        if ((segment % 2 === 0 ? 'red' : 'white') !== paint) continue
        parts.push(cylinderBetween(
          communicationsLegPoint(sideX, sideZ, segment / 4),
          communicationsLegPoint(sideX, sideZ, (segment + 1) / 4),
          0.22,
        ))
      }
    }
  }
  // Alternating braces keep the red/white bands visible from above instead of
  // leaving the paint pattern only on the four vertical legs.
  if (paint === 'red') {
    parts.push(
      cylinderBetween(new THREE.Vector3(-3.8, 32, -3.8), new THREE.Vector3(3.8, 32, 3.8), 0.13),
      cylinderBetween(new THREE.Vector3(-3.8, 32, 3.8), new THREE.Vector3(3.8, 32, -3.8), 0.13),
    )
  } else {
    parts.push(
      cylinderBetween(new THREE.Vector3(-3.8, 16, -3.8), new THREE.Vector3(3.8, 16, 3.8), 0.13),
      cylinderBetween(new THREE.Vector3(-3.8, 16, 3.8), new THREE.Vector3(3.8, 16, -3.8), 0.13),
    )
  }
  return mergeGeometries(parts, false)!
}

const communicationsRedGeometry = communicationsGeometryFor('red')
const communicationsWhiteGeometry = communicationsGeometryFor('white')
const communicationsRedMaterial = withLandmarkGlow(
  new THREE.MeshToonMaterial({ color: '#c74747', emissive: new THREE.Color('#4d2027') }),
  0.03,
  0.16,
)
const communicationsWhiteMaterial = withLandmarkGlow(
  new THREE.MeshToonMaterial({ color: '#f1eee5', emissive: new THREE.Color('#5b574f') }),
  0.03,
  0.18,
)

function LiftedPowerPylonPool() {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const euler = useMemo(() => new THREE.Euler(), [])
  const color = useMemo(() => new THREE.Color(), [])
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    let count = 0
    for (const object of runtime.current.beamObjects) {
      if (!object.active || object.kind !== 'power-pylon') continue
      if (count >= LANDMARK_CELL_COUNT) break
      const swallow = object.absorbing ? Math.max(0.05, object.absorbTimer / BEAM_ABSORB_TIME) : 1
      position.set(object.position.x, object.position.y, object.position.z)
      euler.set(object.rotation.x, object.rotation.y, object.rotation.z)
      rotation.setFromEuler(euler)
      scale.set(object.scale?.x ?? 1, object.scale?.y ?? 1, object.scale?.z ?? 1).multiplyScalar(swallow)
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(count, matrix)
      mesh.setColorAt(count, color.set('#f2f1e7'))
      count += 1
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[pylonGeometry, undefined, LANDMARK_CELL_COUNT]} frustumCulled={false} renderOrder={2} onUpdate={(mesh) => { mesh.count = 0 }}>
    <meshToonMaterial color="#ffffff" />
  </instancedMesh>
}

function LiftedCommunicationsPool({ paint }: { paint: 'red' | 'white' }) {
  const { runtime } = useGame()
  const ref = useRef<THREE.InstancedMesh>(null)
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const euler = useMemo(() => new THREE.Euler(), [])
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    let count = 0
    for (const object of runtime.current.beamObjects) {
      if (!object.active || object.kind !== 'communications') continue
      if (count >= LANDMARK_CELL_COUNT) break
      const swallow = object.absorbing ? Math.max(0.05, object.absorbTimer / BEAM_ABSORB_TIME) : 1
      position.set(object.position.x, object.position.y, object.position.z)
      euler.set(object.rotation.x, object.rotation.y, object.rotation.z)
      rotation.setFromEuler(euler)
      scale.set(object.scale?.x ?? 1, object.scale?.y ?? 1, object.scale?.z ?? 1).multiplyScalar(swallow)
      matrix.compose(position, rotation, scale)
      mesh.setMatrixAt(count, matrix)
      count += 1
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
  })
  return <instancedMesh ref={ref} args={[paint === 'red' ? communicationsRedGeometry : communicationsWhiteGeometry, paint === 'red' ? communicationsRedMaterial : communicationsWhiteMaterial, LANDMARK_CELL_COUNT]} frustumCulled={false} renderOrder={2} onUpdate={(mesh) => { mesh.count = 0 }} />
}

function TransitUtilityPool() {
  const { runtime } = useGame()
  const subway = useRef<THREE.InstancedMesh>(null)
  const subwayOpenings = useRef<THREE.InstancedMesh>(null)
  const subwaySigns = useRef<THREE.InstancedMesh>(null)
  const busStops = useRef<THREE.InstancedMesh>(null)
  const busSigns = useRef<THREE.InstancedMesh>(null)
  const pylons = useRef<THREE.InstancedMesh>(null)
  const gasStations = useRef<THREE.InstancedMesh>(null)
  const gasBands = useRef<THREE.InstancedMesh>(null)
  const communicationsRed = useRef<THREE.InstancedMesh>(null)
  const communicationsWhite = useRef<THREE.InstancedMesh>(null)
  const lastKey = useRef('')
  /** Landmark id → instance index, so the per-frame laser flash can paint the
   *  one station or mast that was just shot without a pool rebuild. */
  const gasSlots = useRef(new Map<string, number>())
  const commSlots = useRef(new Map<string, number>())
  const litLandmarks = useRef(new Set<string>())
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(1, 1, 1), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const euler = useMemo(() => new THREE.Euler(), [])
  const color = useMemo(() => new THREE.Color(), [])

  useFrame(() => {
    if (!subway.current || !subwayOpenings.current || !subwaySigns.current || !busStops.current || !busSigns.current || !pylons.current) return
    if (!gasStations.current || !gasBands.current || !communicationsRed.current || !communicationsWhite.current) return
    // The laser flash runs every frame; the pool below only rebuilds when the
    // streamed world (or a demolition) changes. Same split City.tsx uses for
    // the building flash.
    const flashMeshes = (id: string): [THREE.InstancedMesh, number][] => {
      const gasIndex = gasSlots.current.get(id)
      if (gasIndex !== undefined) return [[gasStations.current!, gasIndex], [gasBands.current!, gasIndex]]
      const commIndex = commSlots.current.get(id)
      if (commIndex !== undefined) return [[communicationsRed.current!, commIndex], [communicationsWhite.current!, commIndex]]
      return []
    }
    const flashes = runtime.current.landmarkHitFlash
    let flashDirty = false
    for (const id of litLandmarks.current) {
      if (flashes.has(id)) continue
      for (const [mesh, index] of flashMeshes(id)) { mesh.setColorAt(index, landmarkBaseTint); flashDirty = true }
      litLandmarks.current.delete(id)
    }
    for (const [id, flash] of flashes) {
      const targets = flashMeshes(id)
      if (!targets.length) continue
      color.copy(landmarkBaseTint).lerp(landmarkHitTint, Math.min(1, flash) * 0.7)
      for (const [mesh, index] of targets) mesh.setColorAt(index, color)
      litLandmarks.current.add(id)
      flashDirty = true
    }
    if (flashDirty) {
      for (const mesh of [gasStations.current, gasBands.current, communicationsRed.current, communicationsWhite.current]) {
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      }
    }
    const world = runtime.current.world
    const key = `${world.cellX}:${world.cellZ}:${runtime.current.destroyedLandmarks.size}|${worldPropVisibilityKey(runtime.current.destroyedWorldProps, runtime.current.beamObjects)}`
    if (key === lastKey.current) return
    lastKey.current = key
    gasSlots.current.clear()
    commSlots.current.clear()
    litLandmarks.current.clear()
    let subwayCount = 0
    let busCount = 0
    let pylonCount = 0
    let gasCount = 0
    let communicationsCount = 0
    for (const cell of groundCellsAround(runtime.current.drone.position, LANDMARK_RADIUS_CELLS)) {
      const landmark = groundLandmarkForCell(cell)
      if (landmark !== 'subway' && landmark !== 'power-pylon' && landmark !== 'gas-station' && landmark !== 'communications') continue
      if ((landmark === 'gas-station' || landmark === 'communications') && runtime.current.destroyedLandmarks.has(landmarkId(landmark, cell.cellX, cell.cellZ))) continue
      const centerX = (cell.cellX + 0.5) * WORLD_CELL_SIZE
      const centerZ = (cell.cellZ + 0.5) * WORLD_CELL_SIZE
      const seed = seedForWorldCell(cell.cellX, cell.cellZ, 0x7a4517)
      euler.set(0, (seed % 4) * Math.PI / 2, 0)
      rotation.setFromEuler(euler)
      scale.set(1, 1, 1)

      if (landmark === 'subway') {
        position.set(centerX, 0, centerZ)
        matrix.compose(position, rotation, scale)
        subway.current.setMatrixAt(subwayCount, matrix)
        position.set(centerX, 1.7, centerZ + 2.95)
        scale.set(6.4, 2.5, 0.3)
        matrix.compose(position, rotation, scale)
        subwayOpenings.current.setMatrixAt(subwayCount, matrix)
        position.set(centerX, 4.35, centerZ + 3.12)
        scale.set(6.9, 1.6, 0.24)
        matrix.compose(position, rotation, scale)
        subwaySigns.current.setMatrixAt(subwayCount, matrix)
        subwayCount += 1
      } else if (landmark === 'gas-station') {
        position.set(centerX, 0, centerZ)
        scale.setScalar(1)
        matrix.compose(position, rotation, scale)
        gasStations.current.setMatrixAt(gasCount, matrix)
        position.set(centerX, 5.35, centerZ)
        matrix.compose(position, rotation, scale)
        gasBands.current.setMatrixAt(gasCount, matrix)
        gasSlots.current.set(landmarkId(landmark, cell.cellX, cell.cellZ), gasCount)
        // Whole pool back to white on rebuild: the first setColorAt call
        // creates a zeroed buffer, and an uninitialised instance draws black.
        gasStations.current.setColorAt(gasCount, landmarkBaseTint)
        gasBands.current.setColorAt(gasCount, landmarkBaseTint)
        gasCount += 1
      } else if (landmark === 'communications') {
        const id = landmarkId(landmark, cell.cellX, cell.cellZ)
        if (isWorldPropHidden(id, runtime.current.destroyedWorldProps, runtime.current.beamObjects)) continue
        position.set(centerX, 0, centerZ)
        scale.setScalar(1)
        matrix.compose(position, rotation, scale)
        communicationsRed.current.setMatrixAt(communicationsCount, matrix)
        communicationsWhite.current.setMatrixAt(communicationsCount, matrix)
        commSlots.current.set(id, communicationsCount)
        communicationsRed.current.setColorAt(communicationsCount, landmarkBaseTint)
        communicationsWhite.current.setColorAt(communicationsCount, landmarkBaseTint)
        communicationsCount += 1
      } else {
        const id = `power-pylon:${cell.cellX}:${cell.cellZ}`
        if (isWorldPropHidden(id, runtime.current.destroyedWorldProps, runtime.current.beamObjects)) continue
        position.set(centerX, 0, centerZ)
        scale.setScalar(1)
        matrix.compose(position, rotation, scale)
        pylons.current.setMatrixAt(pylonCount, matrix)
        pylonCount += 1
      }
    }
    for (const stop of busStopsAround(world)) {
      if (isWorldPropHidden(stop.id, runtime.current.destroyedWorldProps, runtime.current.beamObjects)) continue
      const onX = stop.rotation === Math.PI / 2
      const side = stop.variant === 1 ? 1 : -1
      const { x, z } = stop.position
      euler.set(0, stop.rotation, 0)
      rotation.setFromEuler(euler)
      position.set(x, 0, z)
      scale.set(stop.scale.x, stop.scale.y, stop.scale.z)
      matrix.compose(position, rotation, scale)
      busStops.current.setMatrixAt(busCount, matrix)
      position.set(x, 3.4, z + (onX ? 1.4 : side * 1.4))
      scale.set(3.8, 1.05, 0.18)
      matrix.compose(position, rotation, scale)
      busSigns.current.setMatrixAt(busCount, matrix)
      busCount += 1
    }
    for (const mesh of [subway.current, subwayOpenings.current, subwaySigns.current]) setPoolCount(mesh, subwayCount)
    for (const mesh of [busStops.current, busSigns.current]) setPoolCount(mesh, busCount)
    setPoolCount(pylons.current, pylonCount)
    setPoolCount(gasStations.current, gasCount, true)
    setPoolCount(gasBands.current, gasCount, true)
    setPoolCount(communicationsRed.current, communicationsCount, true)
    setPoolCount(communicationsWhite.current, communicationsCount, true)
  })

  return (
    <group>
      <instancedMesh ref={subway} args={[subwayGeometry, undefined, LANDMARK_CELL_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <meshToonMaterial color={BUILDING.TRANSIT} />
      </instancedMesh>
      <instancedMesh ref={subwayOpenings} args={[undefined, undefined, LANDMARK_CELL_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <boxGeometry args={[1, 1, 1]} />
        <meshToonMaterial color={BUILDING.TRANSIT_DARK} />
      </instancedMesh>
      <instancedMesh ref={subwaySigns} args={[undefined, metroSignMaterial, LANDMARK_CELL_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={busStops} args={[busStopGeometry, undefined, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <meshToonMaterial color={BUILDING.TRANSIT} />
      </instancedMesh>
      <instancedMesh ref={busSigns} args={[undefined, busSignMaterial, WORLD_MAX_BUILDINGS]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <instancedMesh ref={pylons} args={[pylonGeometry, undefined, LANDMARK_CELL_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }}>
        <meshToonMaterial color={BUILDING.PYLON} />
      </instancedMesh>
      <instancedMesh ref={gasStations} args={[gasStationGeometry, gasStationMaterial, LANDMARK_CELL_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }} />
      <instancedMesh ref={gasBands} args={[gasStationBandGeometry, gasStationCanopyMaterial, LANDMARK_CELL_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }} />
      <instancedMesh ref={communicationsRed} args={[communicationsRedGeometry, communicationsRedMaterial, LANDMARK_CELL_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }} />
      <instancedMesh ref={communicationsWhite} args={[communicationsWhiteGeometry, communicationsWhiteMaterial, LANDMARK_CELL_COUNT]} frustumCulled={false} onUpdate={(mesh) => { mesh.count = 0 }} />
      <LiftedPowerPylonPool />
      <LiftedCommunicationsPool paint="red" />
      <LiftedCommunicationsPool paint="white" />
      <LiftedBusStopPool />
    </group>
  )
}

function ParkingLotPool() {
  const { runtime } = useGame()
  const markings = useRef<THREE.InstancedMesh>(null)
  const lastKey = useRef('')
  const matrix = useMemo(() => new THREE.Matrix4(), [])
  const position = useMemo(() => new THREE.Vector3(), [])
  const scale = useMemo(() => new THREE.Vector3(), [])
  const rotation = useMemo(() => new THREE.Quaternion(), [])
  const planeRotation = useMemo(() => new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), [])

  useFrame(() => {
    if (!markings.current) return
    const world = runtime.current.world
    const key = `${world.cellX}:${world.cellZ}`
    if (key === lastKey.current) return
    lastKey.current = key
    let lotCount = 0
    for (const cell of groundCellsAround(runtime.current.drone.position, LANDMARK_RADIUS_CELLS)) {
      if (groundLandmarkForCell(cell) !== 'parking-lot') continue
      const centerX = (cell.cellX + 0.5) * WORLD_CELL_SIZE
      const centerZ = (cell.cellZ + 0.5) * WORLD_CELL_SIZE
      const seed = seedForWorldCell(cell.cellX, cell.cellZ, 0x9a4c)
      const yaw = seed % 2 === 0 ? 0 : Math.PI / 2
      rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw)

      position.set(centerX, 0.045, centerZ)
      scale.set(24, 24, 1)
      matrix.compose(position, planeRotation, scale)
      markings.current.setMatrixAt(lotCount, matrix)
      lotCount += 1

    }
    setPoolCount(markings.current, lotCount)
  })

  return (
    <group>
      <instancedMesh ref={markings} args={[undefined, undefined, LANDMARK_CELL_COUNT]} frustumCulled={false} renderOrder={1} onUpdate={(mesh) => { mesh.count = 0 }}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={parkingLinesTexture} transparent depthWrite={false} />
      </instancedMesh>
    </group>
  )
}

export const CityLandmarks = memo(function CityLandmarks() {
  return (
    <group>
      <BuildingFeaturePool />
      <ParkPool />
      <MysteryCirclePool />
      <MysterySignalPool />
      <BoonPickupPool />
      <TransitUtilityPool />
      <ParkingLotPool />
    </group>
  )
})
