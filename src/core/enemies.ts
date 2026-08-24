import type { BeamObject } from './beam'
import type { Aabb, Vec3 } from './drone'
import { seedForWorldCell, type ProceduralBuilding } from './world'

export type EnemyKind = 'drone' | 'helicopter' | 'fighter' | 'anti-air' | 'boss'
export type EnemyMode = 'roam' | 'chase' | 'strafe' | 'outbound' | 'fixed'
export type EnemyProjectileKind = 'rifle' | 'shell' | 'missile' | 'rocket' | 'boss-beam' | 'orb'

/**
 * When each wave lands, in seconds.
 *
 * One wave per unit, and no filler. There used to be eight stages for six
 * units, so two of them said nothing new - a second helicopter wave and a
 * second drone wave that only moved a number. A stage the player cannot name
 * afterwards is a stage the bulletin announcing it cannot make interesting
 * either, so each one now introduces exactly one thing and the news band has
 * exactly one thing to report.
 *
 * The opening stage sends nothing, on purpose. It is the sighting: the city
 * has noticed the craft and has not answered yet, and the bulletin that goes
 * out during it says exactly that. Drones in the sky before the bulletin that
 * announces them made the report read as a recap of something the player had
 * already been dodging for half a minute.
 *
 * Spaced across the run rather than packed into its front half: the last wave
 * lands with two minutes still on the clock, which is the boss fight.
 */
export const ENEMY_WAVE_STAGES = [
  { at: 0, tempo: 0, label: 'UFO SIGHTED', targets: {} },
  { at: 30, tempo: 1, label: 'DRONE MINES', targets: { drone: 14 } },
  { at: 70, tempo: 2, label: 'HELICOPTERS UP', targets: { drone: 20, helicopter: 8 } },
  { at: 110, tempo: 3, label: 'FIGHTERS SCRAMBLED', targets: { drone: 25, helicopter: 11, fighter: 4 } },
  { at: 145, tempo: 4, label: 'AA NETWORK', targets: { drone: 30, helicopter: 12, fighter: 5, 'anti-air': 6 } },
  { at: 180, tempo: 5, label: 'SKY DREADNOUGHT', targets: { drone: 34, helicopter: 14, fighter: 6, 'anti-air': 6, boss: 1 } },
] as const

/**
 * When the anti-air network comes online.
 *
 * The emplacements are bolted to buildings rather than handed out by the
 * spawner, so they need the wave time as a figure of their own - read back off
 * the table rather than written out again, so moving the wave moves the
 * network with it.
 */
export const ANTI_AIR_WAVE_AT = ENEMY_WAVE_STAGES.find(
  (stage) => ((stage.targets as Partial<Record<EnemyKind, number>>)['anti-air'] ?? 0) > 0,
)!.at

export const ENEMY_TIER: Record<EnemyKind, number> = {
  drone: 0,
  helicopter: 2,
  fighter: 4,
  'anti-air': 5,
  boss: 7,
}

export const ENEMY_MAX_HP: Record<EnemyKind, number> = {
  drone: 1,
  helicopter: 3,
  fighter: 4,
  // Down from 10. A static emplacement that soaked ten hits read as
  // invincible and got ignored; four makes clearing a rooftop before the
  // next lock lands an actual play.
  'anti-air': 4,
  // Fifty seconds of fighting. An unupgraded laser can just about do it; a
  // maxed laser-power does it with time to spare, which is the whole point of
  // putting a laser-only target in the game.
  boss: 64,
}

export const ENEMY_CAPS: Record<EnemyKind, number> = {
  drone: 34,
  helicopter: 14,
  fighter: 6,
  'anti-air': 6,
  boss: 1,
}

export const ENEMY_MAX_PROJECTILES = 96

/**
 * Earth's last resort: a flying capital ship.
 *
 * The final wave used to send up an oversized saucer - a bigger copy of the
 * thing the player has spent five minutes growing. Nothing about that reads as
 * humanity's last card. A battleship does: it is the largest thing people
 * actually build, it is the wrong shape for this game's sky, and it cannot be
 * eaten. The only answer to it is the laser, which is what finally gives the
 * laser-power card something to be for.
 *
 * The hull is long rather than round, so these are lengths along its own axis:
 * turrets sit down one flank, the main gun sits at the bow.
 */
export const BATTLESHIP_LENGTH = 74
export const BATTLESHIP_BEAM_WIDTH = 16
/** How high it holds station. Above the drone ceiling, so it is always
 *  overhead rather than something you can climb past. */
export const BATTLESHIP_ALTITUDE = 96
/** Big enough that the whole ship fits on screen when it is beside you. */
export const BATTLESHIP_ORBIT = 118
/** Turret positions along the hull, as a fraction of half-length from the
 *  centre: negative is aft. Fired in this order, so the broadside walks from
 *  stern to bow instead of arriving as one lump. */
export const BATTLESHIP_TURRETS = [-0.74, -0.44, -0.15, 0.16, 0.45, 0.72] as const
/** Seconds between turrets inside one broadside, and the reload after it.
 *  The reload is the window the player shoots back in - remove it and the
 *  fight is a wall of shells with no rhythm. */
export const BATTLESHIP_TURRET_GAP = 0.34
export const BATTLESHIP_RELOAD = 4.4
/** Every third broadside is replaced by the bow gun: a long telegraph, a
 *  visible aim line, and a shot that hurts. */
export const BATTLESHIP_MAIN_GUN_EVERY = 3
export const BATTLESHIP_MAIN_GUN_TELEGRAPH = 1.9

/**
 * Drones are suicide drones: no weapons, no pursuit, they only detonate on
 * contact. Every one of them hangs motionless in the air as a mine, and is the
 * reward for reading the sky before flying through it.
 *
 * There used to be a second population - `outbound` drones that committed to a
 * straight line past the player at spawn and never adjusted - and it was the
 * weaker half of the idea. A passer is across the screen in a couple of
 * seconds, carries none of the red warning shell that makes a mine fair to fly
 * into, and reads as traffic rather than as a hazard. What is left is the half
 * that has to be looked at and flown around.
 */
/**
 * Helicopters are ambush chasers.
 *
 * Each one owns the patch of sky it spawned in: it drifts slowly around that
 * anchor, holding its altitude band, until the player crosses its detection
 * range. Then it commits - full speed, straight at the craft, altitude
 * included - and rams. Its guns are gone: the collision is the attack, so the
 * threat it makes is spatial, like the mines, rather than another stream of
 * projectiles on top of the fighters and the anti-air network.
 *
 * A ram that connects peels off rather than grinding: the helicopter breaks
 * back out past its own detection range and settles into a patrol there, so
 * one collision is one hit, not a lawnmower parked on the hull.
 */
export const HELICOPTER_ROAM_SPEED = 3.5
export const HELICOPTER_ROAM_RADIUS = 26
/**
 * Halved by design from 42, which sat above cruise (30) and ran down any
 * player who would not spend boost. At 21 the ram no longer catches a craft
 * that keeps moving at all: the helicopter is a zone threat now - it punishes
 * hovering, beam work and careless approaches into its patch of sky, and a
 * player under way simply outruns it.
 */
export const HELICOPTER_CHASE_SPEED = 21
export const HELICOPTER_DETECT_RANGE = 52
/**
 * Past this the chase breaks and the helicopter settles where it lost you,
 * owning that patch of sky instead of commuting home. From the moment a chase
 * starts at the detect range, one tank of boost opens this gap.
 */
export const HELICOPTER_GIVE_UP_RANGE = 78
/**
 * How far a connected ram carries the helicopter back out before it patrols
 * again. Past the detect range, so a ram is never immediately followed by a
 * second lock-on the player had no room to refuse.
 */
export const HELICOPTER_PEEL_RANGE = 58

/**
 * The bullet curtain.
 *
 * Everything else this roster fires is a sniper's answer - one fast, lead-aimed
 * shot that must outrun the craft or it can never land. Orbs are the opposite
 * weapon: slow, unaimed, and many. They are deliberately below cruising speed,
 * because an orb is not meant to be outrun - it is meant to be seen, read, and
 * flown between. The pattern is the attack, not the pellet.
 *
 * Fighters carry a forward fan of them: a fast straight pass, and a spread of
 * orbs down its own nose whenever the player sits inside its view cone. The
 * battleship scatters full rings of them in every direction instead - a halo
 * that makes closing in on the hull a navigation problem, while the bow gun
 * stays the aimed, telegraphed threat at range.
 */
export const ORB_SPEED = 16
export const ORB_HIT_RADIUS = 0.7
/** How long a fighter's orb lives - about ninety metres of reach. */
export const FIGHTER_ORB_LIFE = 5.5
/** Seconds between fan bursts while the player stays in the cone. */
export const FIGHTER_ORB_INTERVAL = 2
/** Half-angle of the view cone the fan answers: the player has to be within
 *  thirty degrees of the fighter's own nose. */
export const FIGHTER_ORB_CONE = Math.PI / 6
export const FIGHTER_ORB_RANGE = 90
/** Orbs per fan, and the angle between neighbours - about ±24 degrees. */
export const FIGHTER_ORB_FAN = 5
const FIGHTER_ORB_FAN_STEP = 0.21
/** A fighter crosses the sky in one straight line, well above cruise: the
 *  pass is the manoeuvre, the fan is the attack. */
export const FIGHTER_PASS_SPEED = 40

/** Battleship orbs travel a little harder - they have an escort's ground to
 *  cover - but still under cruise, so the halo is flown through, not fled. */
export const BATTLESHIP_ORB_SPEED = 20
export const BATTLESHIP_ORB_LIFE = 8
/** Orbs per ring, and rings per flurry. The second ring is offset half a
 *  spacing so the pair weaves a net rather than retracing the first. */
export const BATTLESHIP_ORB_RING_COUNT = 12
export const BATTLESHIP_ORB_RINGS = 2

/**
 * How far a mine reaches, and how long it holds before going off.
 *
 * One number for the trigger, the blast and the warning field drawn around it:
 * the red shell a player sees IS the kill radius, so approaching it is the same
 * event as arming it. Two numbers here would mean the shell lies about one or
 * the other.
 */
export const DRONE_MINE_BLAST_RADIUS = 9
/**
 * Three tenths of a second, which at cruising speed is about the width of the
 * shell itself.
 *
 * It used to be 2.4, and a mine was a noise the player flew away from rather
 * than a thing that went off. This is short enough that crossing the shell is
 * the decision - break away the instant it is touched and the craft is clear;
 * fly through it and the blast is already going up. Reading the shell before
 * touching it is the whole point of drawing it a full second's flight wide.
 */
export const DRONE_MINE_FUSE = 0.3

/** Mines are bigger than a passing drone; a hazard that holds still has to be
 *  spotted from a distance rather than discovered by hitting it. */
export const DRONE_MINE_HIT_RADIUS = 1.6
export const DRONE_MINE_MODEL_SCALE = 1.25

/**
 * Where mines are seeded, as a distance band from the player.
 *
 * They used to spawn on the same shell as everything else - a ring at 78 to 92
 * metres - so the sky had one crust of mines the player crossed in about three
 * seconds and then clear air until the ring rebuilt. Spread across a band, and
 * weighted toward where the player is pointed, the population is spaced out
 * along the direction of travel instead of stacked at one range.
 */
const MINE_SPAWN_NEAR = 46
const MINE_SPAWN_FAR = 205
/** Share of mines seeded into the forward arc rather than anywhere around. */
const MINE_FORWARD_SHARE = 0.72
const MINE_FORWARD_ARC = 1.7

/** Mines drift up and down a little so they read as alive, not as scenery. */
const MINE_BOB = 1.4

/**
 * How fast a mine closes once the craft is inside its blast radius.
 *
 * A fifth of cruising speed: it cannot catch anyone, and it is not meant to.
 * What it does is take back some of the ground a player needs to cover in the
 * three tenths of a second the fuse gives them, so reacting at the shell is no
 * longer the same as being clear of it. Outside the radius it does not move at
 * all - a mine that followed you across the map would just be a tax on having
 * been seen, which is the reason drones never chase in the first place.
 */
const MINE_CREEP_SPEED = 6
const AIR_DESPAWN_DISTANCE = 240

// Helicopters own an altitude band and patrol in it, so an unprovoked sky
// still reads as layers rather than as a swarm. Only a locked-on chase leaves
// the band - it has to, or a ram could never land - and losing the chase puts
// the helicopter back on its shelf. Mines are seeded across the whole range
// instead: there is no altitude that is clear of them, only altitudes the
// player has already read.
export function helicopterBandForSlot(slot: number) {
  return 19 + (slot % 4) * 4.5
}

// Body-contact damage. The drone figure is also what its blast does, since a
// mine going off is the only way a drone ever touches the craft.
export const ENEMY_CONTACT_DAMAGE: Record<EnemyKind, number> = {
  // Detonating on you is the drone's entire purpose, so it costs more than
  // brushing something that was only in the way.
  drone: 5,
  helicopter: 4,
  fighter: 5,
  'anti-air': 4,
  boss: 8,
}

export type EnemySlot = BeamObject & {
  kind: EnemyKind
  slot: number
  generation: number
  active: boolean
  hp: number
  maxHp: number
  /** 1 the instant a laser lands, fading over a fifth of a second. Drives the
   *  render tint so every hit answers visibly, like buildings already do. */
  hurt: number
  position: Vec3
  velocity: Vec3
  target: Vec3
  phase: number
  age: number
  radius: number
  hitRadius: number
  respawn: number
  sourceId: string | null
  mode: EnemyMode
  attackTimer: number
  telegraph: number
  aiming: boolean
  /**
   * Where the shot will leave from, frozen when the enemy starts aiming.
   *
   * The intercept is solved from this point, so firing from anywhere else
   * makes the shot travel a different distance than the solution assumed and
   * arrive beside the target - a fighter that flew a few metres during its own
   * telegraph missed by exactly that much, every time. It also makes the aim
   * line honest: the line the player saw is the line the shot takes.
   */
  muzzle: Vec3
  /** How long this shot's telegraph was, so the warning can fill over the
   *  actual wait rather than over a per-kind guess. */
  telegraphLength: number
  /**
   * Battleship only. Which turret fires next, how many are left in this
   * broadside, and how many broadsides have gone by - the third is replaced
   * by the bow gun.
   */
  turret: number
  burstLeft: number
  volley: number
  /** Drone mines arm on proximity and cannot be disarmed once the fuse starts. */
  mineArmed: boolean
  mineFuse: number
  /**
   * Helicopters patrol around this home point rather than travelling. It is
   * wherever the slot spawned, re-anchored wherever a chase ends, so a
   * helicopter that followed you and lost you owns the new patch of sky
   * instead of commuting back across the map.
   */
  anchor: Vec3
}

export type EnemyProjectile = {
  id: string
  active: boolean
  kind: EnemyProjectileKind
  position: Vec3
  velocity: Vec3
  life: number
  damage: number
  radius: number
}

export type EnemyState = {
  slots: EnemySlot[]
  projectiles: EnemyProjectile[]
  destroyedAntiAir: Set<string>
  waveStage: number
  spawnTimer: number
  randomState: number
  contactKills: number
  /** How many helicopters rammed the hull this tick, so the caller can put
   *  the blast shake on a ram without mistaking a scrape for one. */
  helicopterRams: number
  /** Kind of the last projectile that connected, so the caller can price the
   *  hit by weapon rather than by a raw damage number. */
  lastHitKind: EnemyProjectileKind | null
  /** Where the last suicide drone detonated, for the explosion effect. */
  lastContactPoint: Vec3
  /** A mine explosion is consumed by the game loop after all enemy movement. */
  mineExplosion: { position: Vec3; radius: number; damage: number } | null
}

const ORDER: EnemyKind[] = ['drone', 'helicopter', 'fighter', 'anti-air', 'boss']

/**
 * Who gets the next free spawn.
 *
 * This was a fixed priority list with the newest, scariest unit at the front
 * and drones at the back, which is exactly backwards once the roster is big.
 * The spawner hands out a few units a second; the heavy end of the list is
 * small and fills immediately, and everything behind it only gets a slot on
 * the ticks when nothing ahead of it needs one. By the fighter wave a player
 * flying one heading met fighters and helicopters and no drones at all - the
 * wave table said dozens of drones and the sky delivered none, because they
 * were last in the queue and something ahead of them was always dying.
 *
 * The queue is by shortfall now, as a share of each kind's own target, so
 * every population fills at the same rate and stays there. A wave adding
 * fighters no longer starves the mines the earlier waves introduced: it just
 * adds fighters to the mix, which is what the table already said it did.
 */
function neediestKind(state: EnemyState, elapsed: number) {
  let best: EnemyKind | null = null
  let bestShare = 0
  let bestShort = 0
  for (const kind of ORDER) {
    if (kind === 'anti-air') continue
    const target = targetForKind(kind, elapsed)
    if (target <= 0) continue
    const short = target - activeCount(state, kind)
    if (short <= 0) continue
    // The boss is one unit and the fight does not start without it.
    if (kind === 'boss') return kind
    const share = short / target
    if (share > bestShare || (share === bestShare && short > bestShort)) {
      best = kind
      bestShare = share
      bestShort = short
    }
  }
  return best
}

export const ENEMY_DIAMETER: Record<EnemyKind, number> = {
  drone: 1.6,
  helicopter: 4.6,
  fighter: 4.4,
  'anti-air': 5.2,
  boss: 13.6,
}

const ENEMY_MASS: Record<EnemyKind, number> = {
  drone: 3,
  helicopter: 4,
  fighter: 4,
  'anti-air': 7,
  boss: 12,
}

export function waveStageForTime(elapsed: number) {
  let stage = 0
  for (let index = 0; index < ENEMY_WAVE_STAGES.length; index += 1) {
    if (elapsed >= ENEMY_WAVE_STAGES[index]!.at) stage = index
    else break
  }
  return stage
}

export function waveTempoForTime(elapsed: number) {
  return ENEMY_WAVE_STAGES[waveStageForTime(elapsed)]!.tempo
}

export function waveLabelForTime(elapsed: number) {
  return ENEMY_WAVE_STAGES[waveStageForTime(elapsed)]!.label
}

function random(state: EnemyState) {
  let value = state.randomState || 1
  value ^= value << 13
  value ^= value >>> 17
  value ^= value << 5
  state.randomState = value >>> 0 || 1
  return state.randomState / 0xffffffff
}

function targetForKind(kind: EnemyKind, elapsed: number) {
  const stage = ENEMY_WAVE_STAGES[waveStageForTime(elapsed)]!
  const targets = stage.targets as Partial<Record<EnemyKind, number>>
  return Math.min(ENEMY_CAPS[kind], targets[kind] ?? 0)
}

function activeCount(state: EnemyState, kind: EnemyKind) {
  let count = 0
  for (const enemy of state.slots) if (enemy.active && enemy.kind === kind) count += 1
  return count
}

function makeProjectile(slot: number): EnemyProjectile {
  return {
    id: `enemy-projectile:${slot}`,
    active: false,
    kind: 'rifle',
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    life: 0,
    damage: 0,
    radius: 0.35,
  }
}

function makeSlot(kind: EnemyKind, slot: number): EnemySlot {
  return {
    id: `enemy:${kind}:${slot}:0`,
    kind,
    slot,
    generation: 0,
    active: false,
    mass: ENEMY_MASS[kind],
    color: '#ff3355',
    hp: ENEMY_MAX_HP[kind],
    maxHp: ENEMY_MAX_HP[kind],
    hurt: 0,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    angularVelocity: { x: 0, y: 0, z: 0 },
    inBeam: false,
    tether: 0,
    playerTouched: false,
    destroying: false,
    destroyTimer: 0,
    explosionPending: false,
    absorbing: false,
    absorbTimer: 0,
    diameter: ENEMY_DIAMETER[kind],
    scoreValue: kind === 'boss' ? 1200 : kind === 'fighter' ? 140 : kind === 'helicopter' ? 80 : 35,
    // No enemy is food, but the mine is the one thing the beam may touch: it
    // can be caught and dragged, and what a dragged bomb does is go off - the
    // arming and strike rules in stepEnemies fire exactly as if it was flown
    // into. Everything else stays immune - the battleship most of all, which
    // is not "too big to eat yet" but simply not food, however far the craft
    // has grown.
    beamImmune: kind !== 'drone',
    freePhysics: false,
    target: { x: 0, y: 0, z: 0 },
    phase: slot / Math.max(1, ENEMY_CAPS[kind]) * Math.PI * 2,
    age: 0,
    radius: 80,
    hitRadius: 1,
    respawn: 0,
    sourceId: null,
    mode: 'roam',
    attackTimer: 1,
    telegraph: 0,
    aiming: false,
    muzzle: { x: 0, y: 0, z: 0 },
    telegraphLength: 1,
    turret: 0,
    burstLeft: 0,
    volley: 0,
    mineArmed: false,
    mineFuse: 0,
    anchor: { x: 0, y: 0, z: 0 },
  }
}

export function createEnemyState(seed = 0x91eab7): EnemyState {
  const slots: EnemySlot[] = []
  for (const kind of ORDER) for (let slot = 0; slot < ENEMY_CAPS[kind]; slot += 1) slots.push(makeSlot(kind, slot))
  const projectiles = Array.from({ length: ENEMY_MAX_PROJECTILES }, (_, slot) => makeProjectile(slot))
  return { slots, projectiles, destroyedAntiAir: new Set<string>(), waveStage: 0, spawnTimer: 0, randomState: seed >>> 0 || 1, contactKills: 0, helicopterRams: 0, lastHitKind: null, lastContactPoint: { x: 0, y: 0, z: 0 }, mineExplosion: null } satisfies EnemyState
}

export function isAntiAirBuilding(building: Pick<ProceduralBuilding, 'cellX' | 'cellZ'>) {
  return seedForWorldCell(building.cellX, building.cellZ, 0xa17a1) % 5 === 0
}

function resetSlot(enemy: EnemySlot, player: Vec3, heading: number, state: EnemyState) {
  enemy.generation += 1
  enemy.id = `enemy:${enemy.kind}:${enemy.slot}:${enemy.generation}`
  enemy.hp = enemy.maxHp
  enemy.hurt = 0
  enemy.active = true
  enemy.sourceId = null
  enemy.age = 0
  enemy.telegraph = 0
  enemy.aiming = false
  enemy.inBeam = false
  enemy.tether = 0
  enemy.playerTouched = false
  enemy.destroying = false
  enemy.destroyTimer = 0
  enemy.explosionPending = false
  enemy.absorbing = false
  enemy.absorbTimer = 0
  enemy.rotation.x = 0
  enemy.rotation.y = 0
  enemy.rotation.z = 0
  enemy.angularVelocity.x = 0
  enemy.angularVelocity.y = 0
  enemy.angularVelocity.z = 0
  enemy.phase = heading + (enemy.slot + 1) * 2.399963
  enemy.mode = enemy.kind === 'fighter' ? 'strafe' : enemy.kind === 'anti-air' ? 'fixed' : enemy.kind === 'boss' ? 'chase' : 'roam'
  enemy.radius = enemy.kind === 'fighter' ? 110 : enemy.kind === 'boss' ? BATTLESHIP_ORBIT : enemy.kind === 'helicopter' ? 92 : 82
  enemy.hitRadius = enemy.kind === 'drone' ? DRONE_MINE_HIT_RADIUS : enemy.kind === 'helicopter' ? 2.4 : enemy.kind === 'fighter' ? 2.2 : enemy.kind === 'anti-air' ? 2.2 : 9.5
  enemy.attackTimer = enemy.kind === 'boss' ? 3.2 : 0.7 + (enemy.slot % 5) * 0.22
  enemy.turret = 0
  enemy.burstLeft = 0
  enemy.volley = 0
  enemy.mineArmed = false
  enemy.mineFuse = 0
  enemy.velocity.x = 0
  enemy.velocity.y = 0
  enemy.velocity.z = 0
  const angle = heading + (enemy.slot + 1) * 2.399963 + (random(state) - 0.5) * 0.3
  const distance = enemy.kind === 'fighter' ? 118 : enemy.kind === 'boss' ? BATTLESHIP_ORBIT : 78 + (enemy.slot % 3) * 7
  enemy.position.x = player.x + Math.sin(angle) * distance
  enemy.position.z = player.z + Math.cos(angle) * distance
  enemy.position.y = enemy.kind === 'helicopter'
    ? helicopterBandForSlot(enemy.slot)
    : enemy.kind === 'boss'
      ? BATTLESHIP_ALTITUDE
      : Math.min(118, Math.max(8, player.y + 10))
  if (enemy.kind === 'drone') {
    enemy.mode = 'fixed'
    // Spread along a band and weighted forward, rather than dropped on the
    // shared spawn shell: a player holding one heading keeps meeting them.
    const forward = random(state) < MINE_FORWARD_SHARE
    const bearing = heading + (random(state) - 0.5) * (forward ? MINE_FORWARD_ARC : Math.PI * 2)
    const range = MINE_SPAWN_NEAR + random(state) * (MINE_SPAWN_FAR - MINE_SPAWN_NEAR)
    enemy.position.x = player.x + Math.sin(bearing) * range
    enemy.position.z = player.z + Math.cos(bearing) * range
    // Mines are seeded across the whole altitude range, including right in the
    // band a player skimming the rooftops would use.
    enemy.position.y = 4 + random(state) * 26
  } else if (enemy.kind === 'fighter') {
    // Commit to one straight line through a point near the player, and never
    // adjust it: what crosses the sky is an attack run, not an escort. The
    // velocity is real velocity - fighters are the one kind that flies on it.
    const aimX = player.x + (random(state) - 0.5) * 36
    const aimZ = player.z + (random(state) - 0.5) * 36
    const bearing = Math.atan2(aimX - enemy.position.x, aimZ - enemy.position.z)
    enemy.velocity.x = Math.sin(bearing) * FIGHTER_PASS_SPEED
    enemy.velocity.z = Math.cos(bearing) * FIGHTER_PASS_SPEED
    enemy.rotation.y = bearing
  }
  // Where the slot spawned is the patch of sky it patrols. Only helicopters
  // read it, but it costs nothing to keep honest for everyone.
  enemy.anchor.x = enemy.position.x
  enemy.anchor.y = enemy.position.y
  enemy.anchor.z = enemy.position.z
  enemy.target.x = player.x + (random(state) - 0.5) * 24
  enemy.target.y = enemy.position.y
  enemy.target.z = player.z + (random(state) - 0.5) * 24
}

function spawnOne(state: EnemyState, kind: EnemyKind, player: Vec3, heading: number) {
  const slot = state.slots.find((item) => item.kind === kind && !item.active && item.respawn <= 0)
  if (!slot) return false
  resetSlot(slot, player, heading, state)
  return true
}

/** How many hovering mines the sky should hold right now. Every drone is a
 *  mine, so this is simply the drone budget. */
export function mineTargetForTime(elapsed: number) {
  return targetForKind('drone', elapsed)
}

/**
 * How fast the spawner can hand out units, and how many it may catch up with
 * in one tick.
 *
 * The roster grew to something like a hundred and fifty units at the last
 * wave while the cadence stayed where it was set for a much smaller one, so
 * the sky could never actually reach the table: refilling it from empty took
 * the better part of a minute, and a player moving at cruise leaves units
 * behind faster than that. The steady state is still whatever the wave table
 * says - only the time to get there changes.
 */
const SPAWN_BURST_LIMIT = 8

function spawnIntervalForStage(stage: number) {
  return Math.max(0.03, 0.2 - stage * 0.022)
}

export function syncEnemyTiers(state: EnemyState, elapsed: number, player: Vec3, heading: number, dt: number) {
  const stage = waveStageForTime(elapsed)
  const stageChanged = stage > state.waveStage
  state.waveStage = stage
  state.spawnTimer -= Math.min(Math.max(0, dt), 0.05)
  if (stageChanged) state.spawnTimer = 0
  // Nothing in the sky: get the first pair out without waiting on the
  // cadence, so the drone wave lands with the bulletin that announces it
  // rather than trickling in behind it. Drones are the first wave's only
  // unit, so their count is the whole test - it does not need to name a kind
  // a later wave might drop.
  const initialBurst = state.spawnTimer <= 0 && activeEnemyCount(state, 'drone') === 0
  for (const enemy of state.slots) {
    if (enemy.respawn > 0) enemy.respawn = Math.max(0, enemy.respawn - dt)
    const target = targetForKind(enemy.kind, elapsed)
    if (target === 0 && enemy.active && enemy.kind !== 'anti-air') enemy.active = false
  }
  let spawned = 0
  while ((state.spawnTimer <= 0 || (initialBurst && spawned < 2)) && spawned < SPAWN_BURST_LIMIT) {
    const kind = neediestKind(state, elapsed)
    if (!kind) break
    if (!spawnOne(state, kind, player, heading)) break
    spawned += 1
    state.spawnTimer += spawnIntervalForStage(stage)
  }
  return state
}

export function syncAntiAirEnemies(state: EnemyState, elapsed: number, buildings: ProceduralBuilding[]) {
  const target = targetForKind('anti-air', elapsed)
  for (const enemy of state.slots) {
    if (enemy.kind !== 'anti-air' || !enemy.active || !enemy.sourceId) continue
    let found = false
    for (const building of buildings) if (building.id === enemy.sourceId) { found = true; break }
    if (!found || elapsed < ANTI_AIR_WAVE_AT) enemy.active = false
  }
  if (elapsed < ANTI_AIR_WAVE_AT) return
  for (const building of buildings) {
    if (activeCount(state, 'anti-air') >= target) break
    if (!isAntiAirBuilding(building) || state.destroyedAntiAir.has(building.id)) continue
    let exists = false
    for (const enemy of state.slots) if (enemy.kind === 'anti-air' && enemy.active && enemy.sourceId === building.id) { exists = true; break }
    if (exists) continue
    const slot = state.slots.find((enemy) => enemy.kind === 'anti-air' && !enemy.active && enemy.respawn <= 0)
    if (!slot) break
    slot.generation += 1
    slot.id = `enemy:anti-air:${slot.slot}:${slot.generation}`
    slot.active = true
    slot.hp = slot.maxHp
    slot.hurt = 0
    slot.sourceId = building.id
    slot.mode = 'fixed'
    slot.beamImmune = true
    slot.inBeam = false
    slot.tether = 0
    slot.absorbing = false
    slot.position.x = building.position.x
    slot.position.y = building.size.y + 2.3
    slot.position.z = building.position.z
    slot.hitRadius = 2.2
    slot.attackTimer = 1.4
  }
}

function distanceToPlayer(enemy: EnemySlot, player: Vec3) {
  return Math.hypot(enemy.position.x - player.x, enemy.position.y - player.y, enemy.position.z - player.z)
}

/**
 * Shot speeds.
 *
 * Every aimed shot is above the craft's cruising speed of 30, and that is the
 * whole reason they changed. They used to sit between 16 and 25 - slower than
 * the thing they were shooting at - which means no interception solution
 * exists at all: a fleeing target simply outruns the bullet. Combined with
 * aiming at where the player *was*, the real rule of the game was "stand still
 * and die, move in any direction at all and be immortal", and beam ballast,
 * the only speed penalty in the game, was protecting nothing.
 *
 * Turbo (54) still outruns most of them. That is deliberate: turbo is a
 * resource, and spending it to outrun a shell is a fair play.
 *
 * The orb is the one deliberate exception: it is a curtain round, not a
 * sniper's, and it is dodged by reading the pattern rather than outrun - so it
 * sits below cruise on purpose. See the bullet-curtain block above.
 */
export const PROJECTILE_SPEED: Record<EnemyProjectileKind, number> = {
  rifle: 58,
  shell: 46,
  missile: 52,
  rocket: 44,
  'boss-beam': 40,
  orb: ORB_SPEED,
}

/**
 * How well each enemy leads a moving target, 0 (shoots where you are) to 1
 * (shoots exactly where you will be).
 *
 * Only the units that actually aim carry a real figure now: the anti-air
 * network and the battleship's bow gun, both at full lead, because by the
 * time either is on the field flying straight is supposed to be fatal. The
 * rest of the roster attacks without aiming at all - contact, rams, and
 * curtains of orbs - so their entries are zero and exist only because the
 * table is keyed by every kind.
 *
 * A lower tier still leads the target properly - it just puts the shot down
 * beside the answer. Scaling the lead instead was the first attempt and it was
 * wrong: an eighty-percent lead is a twenty-percent shortfall, which at a
 * hundred metres is a twenty-metre miss every single time, so a low tier
 * could never hit anything at all. Aiming at the right place with a bounded
 * error makes a low tier look like a near miss rather than like an enemy that
 * cannot shoot.
 */
export const AIM_ERROR_METRES = 16

export const LEAD_ACCURACY: Record<EnemyKind, number> = {
  drone: 0,
  helicopter: 0,
  fighter: 0,
  'anti-air': 1,
  boss: 1,
}

/**
 * Where to shoot so a shot travelling at `speed` meets a target moving at
 * `velocity`.
 *
 * Solves the quadratic for time-to-intercept. When there is no solution - the
 * target is outrunning the shot - it returns null and the caller fires at the
 * target's current position instead, because an enemy that holds its fire
 * whenever the maths fails just goes mute.
 */
export function interceptTime(toTarget: Vec3, velocity: Vec3, speed: number) {
  const a = velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z - speed * speed
  const b = 2 * (toTarget.x * velocity.x + toTarget.y * velocity.y + toTarget.z * velocity.z)
  const c = toTarget.x * toTarget.x + toTarget.y * toTarget.y + toTarget.z * toTarget.z
  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) < 1e-6) return null
    const linear = -c / b
    return linear > 0 ? linear : null
  }
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return null
  const root = Math.sqrt(discriminant)
  const first = (-b + root) / (2 * a)
  const second = (-b - root) / (2 * a)
  const candidates = [first, second].filter((value) => value > 0)
  if (candidates.length === 0) return null
  return Math.min(...candidates)
}

function aimProjectile(state: EnemyState, enemy: EnemySlot, player: Vec3, playerVelocity: Vec3, kind: EnemyProjectileKind, speed: number, damage: number, telegraph: number, muzzle?: Vec3) {
  enemy.telegraph = telegraph
  enemy.telegraphLength = Math.max(0.01, telegraph)
  enemy.aiming = true
  const accuracy = LEAD_ACCURACY[enemy.kind]
  // Most enemies shoot from where they are. The battleship shoots from
  // whichever turret is next, which is what turns one big gun into a broadside.
  enemy.muzzle.x = muzzle ? muzzle.x : enemy.position.x
  enemy.muzzle.y = muzzle ? muzzle.y : enemy.position.y
  enemy.muzzle.z = muzzle ? muzzle.z : enemy.position.z
  // The shot leaves after the telegraph, so the prediction has to cover the
  // wait as well as the flight. Leading only for flight time leaves every shot
  // a telegraph's worth of travel behind - at cruising speed that is fifteen
  // metres of error against a target one metre wide, which is why simply
  // predicting was not enough on its own.
  const atFire = {
    x: player.x + playerVelocity.x * telegraph,
    y: player.y + playerVelocity.y * telegraph,
    z: player.z + playerVelocity.z * telegraph,
  }
  const toTarget = {
    x: atFire.x - enemy.muzzle.x,
    y: atFire.y - enemy.muzzle.y,
    z: atFire.z - enemy.muzzle.z,
  }
  // Predicted at aim time, not at fire time. The telegraph window is the whole
  // dodge: change course inside it and the prediction is wrong, hold course and
  // the shot arrives.
  const flight = interceptTime(toTarget, playerVelocity, speed) ?? 0
  const lead = telegraph + flight
  // Full lead, then a bounded scatter for anything below the top tier. The
  // scatter is in metres and does not grow with range, so a low tier is
  // inaccurate rather than useless.
  const spread = (1 - accuracy) * AIM_ERROR_METRES
  enemy.target.x = player.x + playerVelocity.x * lead + (random(state) - 0.5) * 2 * spread
  enemy.target.y = player.y + playerVelocity.y * lead + (random(state) - 0.5) * spread
  enemy.target.z = player.z + playerVelocity.z * lead + (random(state) - 0.5) * 2 * spread
  if (kind === 'rocket') {
    enemy.target.x += (enemy.slot % 3 - 1) * 13
    enemy.target.z += ((enemy.slot + 1) % 3 - 1) * 13
  }
  enemy.velocity.x = speed
  enemy.velocity.y = damage
  enemy.velocity.z = kind === 'boss-beam' ? 1 : 0
  return state
}

/**
 * The anti-air judgement: a three-second orange lock, then a stream.
 *
 * One missile after a 0.8s wink was over before it could be read - at high
 * altitude the network was a damage table, not a mechanic. Three seconds of
 * lock puts the whole exchange in the player's hands: the orange aim point
 * marks the one spot the gun is committed to, and when the lock expires five
 * rounds rattle into exactly that spot in quick succession. Leave the point
 * inside the window and the whole string sails past; sit on it and the
 * stream keeps arriving. A stream rather than a scatter, so the punishment
 * for ignoring the mark reads as one sustained answer, not bad luck.
 */
export const ANTI_AIR_TELEGRAPH = 3
export const ANTI_AIR_BARRAGE_SHOTS = 5
/** Seconds between rounds of the stream - five shots in about half a second. */
export const ANTI_AIR_BARRAGE_INTERVAL = 0.13
/** The reload after the stream, which is where the counterattack lives. */
export const ANTI_AIR_RELOAD = 3.8
/** Each round of the stream is big - a shell you watch coming, not a tracer.
 *  Three seconds of blinking beam promise something heavy on the way. */
export const ANTI_AIR_SHELL_RADIUS = 1.5

function fireProjectile(state: EnemyState, enemy: EnemySlot, kind: EnemyProjectileKind) {
  const projectile = state.projectiles.find((item) => !item.active)
  if (!projectile) return false
  const dx = enemy.target.x - enemy.muzzle.x
  const dy = enemy.target.y - enemy.muzzle.y
  const dz = enemy.target.z - enemy.muzzle.z
  const distance = Math.max(0.001, Math.hypot(dx, dy, dz))
  const speed = enemy.velocity.x
  projectile.active = true
  projectile.kind = kind
  projectile.position.x = enemy.muzzle.x
  projectile.position.y = enemy.muzzle.y
  projectile.position.z = enemy.muzzle.z
  projectile.velocity.x = dx / distance * speed
  projectile.velocity.y = dy / distance * speed
  projectile.velocity.z = dz / distance * speed
  projectile.life = kind === 'boss-beam' ? 4 : 5.5
  projectile.damage = enemy.velocity.y
  projectile.radius = kind === 'missile' ? ANTI_AIR_SHELL_RADIUS : kind === 'shell' ? 0.85 : kind === 'boss-beam' ? 1.1 : 0.45
  return true
}

/**
 * A mine holds station until the craft is inside the radius it kills in, and
 * then creeps. The bob is cosmetic; the hazard is where it is.
 *
 * No chase mode, here or anywhere. On an endless map, letting air units latch
 * onto the player removes the point of flying anywhere: the same drones stay
 * glued to you and repositioning stops being a decision.
 */
function stepDroneMine(enemy: EnemySlot, player: Vec3, d: number) {
  enemy.age += d
  const dx = player.x - enemy.position.x
  const dy = player.y - enemy.target.y
  const dz = player.z - enemy.position.z
  const reach = Math.hypot(dx, dy, dz)
  if (reach <= DRONE_MINE_BLAST_RADIUS && reach > 0.0001) {
    const step = Math.min(MINE_CREEP_SPEED * d, reach)
    enemy.position.x += dx / reach * step
    enemy.position.z += dz / reach * step
    enemy.target.y += dy / reach * step
  }
  enemy.position.y = enemy.target.y + Math.sin(enemy.age * 1.3 + enemy.phase) * MINE_BOB
  // Mines are only cleared by leaving them far behind, never by waiting.
  if (!enemy.mineArmed && distanceToPlayer(enemy, player) > AIR_DESPAWN_DISTANCE) enemy.active = false
}

/**
 * Roam, chase, peel off. `phase` doubles as the travel heading in every mode,
 * which is also what the renderer faces the fuselage along - a patrolling
 * helicopter looks where it is going, not at the player it has not seen.
 */
function stepHelicopter(enemy: EnemySlot, player: Vec3, d: number) {
  enemy.age += d
  const distance = distanceToPlayer(enemy, player)
  if (enemy.mode === 'chase') {
    if (distance > HELICOPTER_GIVE_UP_RANGE) {
      enemy.mode = 'roam'
      enemy.anchor.x = enemy.position.x
      enemy.anchor.z = enemy.position.z
    } else if (distance > 0.001) {
      // Straight at the craft, altitude included: a ram that respected the
      // altitude band could never land. Losing the chase is what puts the
      // helicopter back on its shelf.
      const step = Math.min(HELICOPTER_CHASE_SPEED * d, distance)
      enemy.position.x += (player.x - enemy.position.x) / distance * step
      enemy.position.y += (player.y - enemy.position.y) / distance * step
      enemy.position.z += (player.z - enemy.position.z) / distance * step
      enemy.position.y = Math.max(2.2, enemy.position.y)
      enemy.phase = Math.atan2(player.x - enemy.position.x, player.z - enemy.position.z)
    }
  } else if (enemy.mode === 'outbound') {
    // The break-away after a connected ram: straight out and back up to the
    // band, until the gap is too wide for an immediate second lock-on.
    let awayX = enemy.position.x - player.x
    let awayZ = enemy.position.z - player.z
    const away = Math.hypot(awayX, awayZ)
    if (away < 0.5) {
      // Directly underneath or on top of the craft there is no outward
      // bearing to read, so it keeps flying the way it was already facing.
      awayX = Math.sin(enemy.phase)
      awayZ = Math.cos(enemy.phase)
    } else {
      awayX /= away
      awayZ /= away
    }
    enemy.position.x += awayX * HELICOPTER_CHASE_SPEED * 0.85 * d
    enemy.position.z += awayZ * HELICOPTER_CHASE_SPEED * 0.85 * d
    enemy.phase = Math.atan2(awayX, awayZ)
    const band = helicopterBandForSlot(enemy.slot)
    enemy.position.y += (band - enemy.position.y) * (1 - Math.exp(-1.4 * d))
    if (distanceToPlayer(enemy, player) >= HELICOPTER_PEEL_RANGE) {
      enemy.mode = 'roam'
      enemy.anchor.x = enemy.position.x
      enemy.anchor.z = enemy.position.z
    }
  } else if (distance <= HELICOPTER_DETECT_RANGE) {
    enemy.mode = 'chase'
  } else {
    // Patrol: a lazy weave around the anchor, held in the altitude band.
    const toAnchorX = enemy.anchor.x - enemy.position.x
    const toAnchorZ = enemy.anchor.z - enemy.position.z
    if (Math.hypot(toAnchorX, toAnchorZ) > HELICOPTER_ROAM_RADIUS) {
      // Shortest-way turn back toward home, so the patrol orbits the anchor
      // instead of wandering off with the weave.
      const home = Math.atan2(toAnchorX, toAnchorZ)
      const delta = Math.atan2(Math.sin(home - enemy.phase), Math.cos(home - enemy.phase))
      enemy.phase += delta * Math.min(1, 2.4 * d)
    } else {
      enemy.phase += Math.sin(enemy.age * 0.6 + enemy.slot * 1.7) * 0.7 * d
    }
    enemy.position.x += Math.sin(enemy.phase) * HELICOPTER_ROAM_SPEED * d
    enemy.position.z += Math.cos(enemy.phase) * HELICOPTER_ROAM_SPEED * d
    const band = helicopterBandForSlot(enemy.slot)
    enemy.position.y += (band - enemy.position.y) * (1 - Math.exp(-1.4 * d))
  }
  // The lock-on borrows the aiming tint: the same red an enemy shows when a
  // shot is coming is shown when a ram is.
  enemy.aiming = enemy.mode === 'chase'
  // A chase can never reach this range - only a patrol left far behind can,
  // and an abandoned patrol is exactly what despawning is for.
  if (enemy.mode !== 'chase' && distance > AIR_DESPAWN_DISTANCE) enemy.active = false
}

/**
 * The battleship holds station and turns, rather than chasing.
 *
 * The old boss sat eight metres above the player's head, which made a
 * thirteen-metre saucer impossible to see and identical in behaviour to a
 * helicopter. A capital ship should be somewhere else in the sky: high, wide
 * of you, and slow enough that its arc is readable. It circles at a distance
 * so its flank - where the turrets are - faces the player, and its bow points
 * along its own travel, because a ship crabbing sideways does not read as a
 * ship.
 */
function stepBattleship(enemy: EnemySlot, player: Vec3, d: number) {
  enemy.age += d
  // Circle the player, closing the radius only if they have run.
  const toPlayerX = player.x - enemy.position.x
  const toPlayerZ = player.z - enemy.position.z
  const range = Math.max(0.001, Math.hypot(toPlayerX, toPlayerZ))
  enemy.phase += d * 0.11
  const desiredX = player.x + Math.sin(enemy.phase) * BATTLESHIP_ORBIT
  const desiredZ = player.z + Math.cos(enemy.phase) * BATTLESHIP_ORBIT
  // Slow. Outrunning it has to be possible; staying ahead of it forever must
  // not be, or the last fifty seconds are a chase with no fight in them.
  const closing = 1 - Math.exp(-(range > BATTLESHIP_ORBIT * 1.8 ? 0.42 : 0.16) * d)
  const previousX = enemy.position.x
  const previousZ = enemy.position.z
  enemy.position.x += (desiredX - enemy.position.x) * closing
  enemy.position.z += (desiredZ - enemy.position.z) * closing
  enemy.position.y += (BATTLESHIP_ALTITUDE - enemy.position.y) * (1 - Math.exp(-0.5 * d))
  const travelX = enemy.position.x - previousX
  const travelZ = enemy.position.z - previousZ
  if (Math.hypot(travelX, travelZ) > 1e-4) {
    const heading = Math.atan2(travelX, travelZ)
    // Shortest-way turn, so crossing the +/-PI seam does not spin the hull.
    const delta = Math.atan2(Math.sin(heading - enemy.rotation.y), Math.cos(heading - enemy.rotation.y))
    enemy.rotation.y += delta * (1 - Math.exp(-1.6 * d))
  }
  // A slow list into the turn. Purely cosmetic, and the only thing that makes
  // the hull look like it has mass.
  enemy.rotation.z += (-0.12 - enemy.rotation.z) * (1 - Math.exp(-0.8 * d))
}

/** World position of one of the ship's turrets, along its own hull axis. */
export function battleshipTurretPoint(enemy: EnemySlot, index: number, into: Vec3) {
  const along = BATTLESHIP_TURRETS[index % BATTLESHIP_TURRETS.length] ?? 0
  const offset = along * BATTLESHIP_LENGTH / 2
  const sine = Math.sin(enemy.rotation.y)
  const cosine = Math.cos(enemy.rotation.y)
  into.x = enemy.position.x + sine * offset
  into.y = enemy.position.y - 1.4
  into.z = enemy.position.z + cosine * offset
  return into
}

/**
 * A fighter is a straight line. It enters on one bearing, holds it at pass
 * speed, and leaves; the spawner hands out the next run. Everything readable
 * about it - where it points, when it can hurt you - follows from that line.
 */
function stepFighter(enemy: EnemySlot, player: Vec3, d: number) {
  enemy.age += d
  enemy.position.x += enemy.velocity.x * d
  enemy.position.z += enemy.velocity.z * d
  if (distanceToPlayer(enemy, player) > AIR_DESPAWN_DISTANCE) enemy.active = false
}

/**
 * One orb of the curtain, fired on a bearing rather than at a solution:
 * nothing here reads the player's velocity, which is what makes the pattern
 * fair - it goes where it was pointed, and it was pointed where you were.
 */
function fireOrb(state: EnemyState, origin: Vec3, bearing: number, speed: number, climb: number, life: number) {
  const projectile = state.projectiles.find((item) => !item.active)
  if (!projectile) return false
  projectile.active = true
  projectile.kind = 'orb'
  projectile.position.x = origin.x
  projectile.position.y = origin.y
  projectile.position.z = origin.z
  projectile.velocity.x = Math.sin(bearing) * speed
  projectile.velocity.y = climb
  projectile.velocity.z = Math.cos(bearing) * speed
  projectile.life = life
  projectile.damage = 1
  projectile.radius = ORB_HIT_RADIUS
  return true
}

/**
 * The fighter's fan: a spread of slow orbs down its own nose, only when the
 * player is inside its view cone. The fan is centred on the fighter's heading,
 * not on the player - being in the cone is what makes the heading dangerous,
 * and sidestepping out of it is the dodge.
 */
function fireFighterFan(state: EnemyState, enemy: EnemySlot, player: Vec3) {
  if (distanceToPlayer(enemy, player) > FIGHTER_ORB_RANGE) return false
  const forward = Math.max(0.001, Math.hypot(enemy.velocity.x, enemy.velocity.z))
  const toPlayerX = player.x - enemy.position.x
  const toPlayerZ = player.z - enemy.position.z
  const flat = Math.max(0.001, Math.hypot(toPlayerX, toPlayerZ))
  const facing = (enemy.velocity.x * toPlayerX + enemy.velocity.z * toPlayerZ) / (forward * flat)
  if (facing < Math.cos(FIGHTER_ORB_CONE)) return false
  const bearing = Math.atan2(enemy.velocity.x, enemy.velocity.z)
  // Enough vertical drift to arrive at the player's altitude over the flight,
  // bounded so the fan stays a wall and never turns into a dive.
  const climb = Math.max(-6, Math.min(6, (player.y - enemy.position.y) / Math.max(1, flat / ORB_SPEED)))
  for (let index = 0; index < FIGHTER_ORB_FAN; index += 1) {
    const offset = (index - (FIGHTER_ORB_FAN - 1) / 2) * FIGHTER_ORB_FAN_STEP
    fireOrb(state, enemy.position, bearing + offset, ORB_SPEED, climb, FIGHTER_ORB_LIFE)
  }
  return true
}

/**
 * One full ring of the battleship's halo, every direction at once. Successive
 * rings are rotated - the second by half a spacing, each flurry by its own
 * offset - so over a fight the gaps themselves travel and no bearing stays a
 * permanently safe lane.
 */
function fireBattleshipRing(state: EnemyState, enemy: EnemySlot, player: Vec3) {
  const climb = Math.max(-14, Math.min(2, (player.y + 2 - enemy.position.y) / BATTLESHIP_ORB_LIFE))
  const offset = enemy.volley * 0.9 + enemy.turret * (Math.PI / BATTLESHIP_ORB_RING_COUNT)
  for (let index = 0; index < BATTLESHIP_ORB_RING_COUNT; index += 1) {
    const bearing = offset + index / BATTLESHIP_ORB_RING_COUNT * Math.PI * 2
    fireOrb(state, enemy.position, bearing, BATTLESHIP_ORB_SPEED, climb, BATTLESHIP_ORB_LIFE)
  }
}

const STILL: Vec3 = { x: 0, y: 0, z: 0 }

const TURRET_POINT: Vec3 = { x: 0, y: 0, z: 0 }

/**
 * A flurry of orb rings, then a reload; every third cycle, the bow gun.
 *
 * The aimed broadside is gone: the ship's ordinary fire is now the halo -
 * rings of slow orbs scattered in every direction, which turn the air around
 * the hull into a navigation problem rather than a marksman's duel. The bow
 * gun keeps its long telegraph and its aim line, so the one shot that is
 * actually pointed at the player is still the one they were shown first. And
 * it is the reload, not the flurry, that is the actual fight: that gap is
 * when the laser gets used.
 */
function stepBattleshipGuns(state: EnemyState, enemy: EnemySlot, player: Vec3, playerVelocity: Vec3, d: number) {
  if (enemy.telegraph > 0) {
    enemy.telegraph = Math.max(0, enemy.telegraph - d)
    if (enemy.telegraph > 0) return
    // Only the bow gun telegraphs now; the rings announce themselves by being
    // slow enough to watch arrive.
    fireProjectile(state, enemy, 'boss-beam')
    enemy.aiming = false
    enemy.attackTimer = BATTLESHIP_RELOAD
    return
  }
  if (enemy.attackTimer > 0) return
  if (enemy.burstLeft <= 0) {
    enemy.volley += 1
    if (enemy.volley % BATTLESHIP_MAIN_GUN_EVERY === 0) {
      // The bow gun. Long telegraph and a visible aim line, so it is always a
      // shot the player was shown before it left.
      battleshipTurretPoint(enemy, BATTLESHIP_TURRETS.length - 1, TURRET_POINT)
      aimProjectile(state, enemy, player, playerVelocity, 'boss-beam', PROJECTILE_SPEED['boss-beam'], 7, BATTLESHIP_MAIN_GUN_TELEGRAPH, TURRET_POINT)
      return
    }
    enemy.burstLeft = BATTLESHIP_ORB_RINGS
    enemy.turret = 0
  }
  fireBattleshipRing(state, enemy, player)
  enemy.turret += 1
  enemy.burstLeft -= 1
  enemy.attackTimer = enemy.burstLeft > 0 ? BATTLESHIP_TURRET_GAP : BATTLESHIP_RELOAD
}

export function stepEnemies(state: EnemyState, player: Vec3, dt: number, playerVelocity: Vec3 = STILL, playerRadius = 1.4) {
  const d = Math.min(Math.max(0, dt), 0.05)
  state.mineExplosion = null
  for (const enemy of state.slots) {
    if (!enemy.active) continue
    // Same fade the building flash uses, so every laser answer reads alike.
    enemy.hurt = Math.max(0, enemy.hurt - d * 5)
    if (enemy.kind === 'drone') {
      const distance = distanceToPlayer(enemy, player)
      // Hitting the casing sets it off there and then. The fuse is what a
      // player gets for entering the field and having a moment to leave it;
      // flying into the thing itself is not something to be given a moment
      // for, and a mine that sat ticking under the hull for a third of a
      // second read as a dud rather than as a hit.
      const struck = distance <= enemy.hitRadius + playerRadius
      // One arming rule, on the beam or off it. A mine reeled in by the beam
      // crosses the radius-9 field like any other approach, arms there, and
      // the fuse does the rest - catching a bomb does not make it politer.
      if (!enemy.mineArmed && (struck || distance <= DRONE_MINE_BLAST_RADIUS)) {
        enemy.mineArmed = true
        enemy.mineFuse = DRONE_MINE_FUSE
      }
      if (struck) enemy.mineFuse = 0
      if (enemy.mineArmed) {
        enemy.mineFuse -= d
        if (enemy.mineFuse <= 0) {
          state.mineExplosion = { position: { ...enemy.position }, radius: DRONE_MINE_BLAST_RADIUS, damage: ENEMY_CONTACT_DAMAGE.drone }
          enemy.active = false
          enemy.respawn = 4.5
          continue
        }
      }
    }
    if (enemy.absorbing || enemy.inBeam || enemy.tether > 0.02) {
      enemy.aiming = false
      enemy.telegraph = 0
      continue
    }
    if (enemy.kind === 'anti-air') {
      enemy.aiming = player.y >= 28 && distanceToPlayer(enemy, player) <= 145
    } else if (enemy.kind === 'boss') stepBattleship(enemy, player, d)
    else if (enemy.kind === 'fighter') stepFighter(enemy, player, d)
    else if (enemy.kind === 'drone') stepDroneMine(enemy, player, d)
    else stepHelicopter(enemy, player, d)

    enemy.attackTimer -= d
    if (enemy.kind === 'boss') { stepBattleshipGuns(state, enemy, player, playerVelocity, d); continue }
    if (enemy.kind === 'fighter') {
      // Curtain fire, not marksmanship: no telegraph and no lead. The orbs
      // are slow enough to be their own warning, and the cadence only counts
      // bursts that actually left - the timer waits, cocked, until the player
      // crosses into the cone.
      if (enemy.attackTimer <= 0 && fireFighterFan(state, enemy, player)) enemy.attackTimer = FIGHTER_ORB_INTERVAL
      continue
    }
    // Drones and helicopters never reach the aimed-fire path: both deal
    // contact damage only. Drones because thirty-odd of them firing would
    // bury the screen in projectiles; helicopters because the ram is the
    // whole attack. That leaves the anti-air network as the sky's one
    // remaining sniper.
    if (enemy.telegraph > 0) {
      enemy.telegraph = Math.max(0, enemy.telegraph - d)
      if (enemy.telegraph <= 0) {
        if (enemy.kind === 'anti-air') {
          // First round leaves the moment the lock expires; the rest of the
          // stream follows on the burst timer below, all at the locked point.
          fireProjectile(state, enemy, 'missile')
          enemy.burstLeft = ANTI_AIR_BARRAGE_SHOTS - 1
        }
        enemy.aiming = false
        enemy.attackTimer = enemy.kind === 'anti-air' ? ANTI_AIR_BARRAGE_INTERVAL : 3.8
      }
    } else if (enemy.kind === 'anti-air' && enemy.burstLeft > 0) {
      if (enemy.attackTimer <= 0) {
        fireProjectile(state, enemy, 'missile')
        enemy.burstLeft -= 1
        enemy.attackTimer = enemy.burstLeft > 0 ? ANTI_AIR_BARRAGE_INTERVAL : ANTI_AIR_RELOAD
      }
    } else if (enemy.attackTimer <= 0) {
      if (enemy.kind === 'anti-air' && player.y >= 28 && distanceToPlayer(enemy, player) < 145) {
        aimProjectile(state, enemy, player, playerVelocity, 'missile', PROJECTILE_SPEED.missile, 10, ANTI_AIR_TELEGRAPH)
      }
    }
  }
  return state
}

/** True once the orb's shell overlaps the box: it dies on the wall face
 *  rather than sinking half a body into it. */
function orbBlocked(projectile: EnemyProjectile, colliders: Aabb[]) {
  const { x, y, z } = projectile.position
  const reach = projectile.radius
  for (const box of colliders) {
    if (
      x > box.minX - reach && x < box.maxX + reach &&
      y > box.minY - reach && y < box.maxY + reach &&
      z > box.minZ - reach && z < box.maxZ + reach
    ) return true
  }
  return false
}

/**
 * `colliders` is the caller's building pool. Only orbs die on it: a curtain
 * round is slow enough that flying it into a wall - or putting a wall between
 * yourself and the fan - is a decision the player visibly makes, so buildings
 * are real cover from it. The aimed shots keep passing through: their fairness
 * is the telegraph, and letting a tower blank the anti-air network would turn
 * every rooftop into an off switch for the late game.
 */
export function stepEnemyProjectiles(state: EnemyState, player: Vec3, dt: number, playerRadius = 1.25, colliders: Aabb[] = []) {
  const d = Math.min(Math.max(0, dt), 0.05)
  let damage = 0
  state.lastHitKind = null
  for (const projectile of state.projectiles) {
    if (!projectile.active) continue
    projectile.position.x += projectile.velocity.x * d
    projectile.position.y += projectile.velocity.y * d
    projectile.position.z += projectile.velocity.z * d
    projectile.life -= d
    if (projectile.kind === 'orb' && colliders.length > 0 && orbBlocked(projectile, colliders)) {
      projectile.active = false
      continue
    }
    const distance = Math.hypot(projectile.position.x - player.x, projectile.position.y - player.y, projectile.position.z - player.z)
    if (distance <= projectile.radius + playerRadius) {
      projectile.active = false
      // Worst hit wins rather than the sum: a burst arriving on one frame
      // should not price out as a single catastrophic blow.
      if (!state.lastHitKind || projectile.damage > damage) state.lastHitKind = projectile.kind
      damage += projectile.damage
    } else if (projectile.life <= 0 || distance > 260) projectile.active = false
  }
  return damage
}

export function hitEnemy(state: EnemyState, id: string, damage = 1) {
  for (const enemy of state.slots) {
    if (!enemy.active || enemy.absorbing || enemy.id !== id) continue
    enemy.hurt = 1
    enemy.hp = Math.max(0, enemy.hp - damage)
    if (enemy.hp > 0) return { hit: true, destroyed: false, kind: enemy.kind, enemy }
    enemy.active = false
    if (enemy.kind === 'anti-air' && enemy.sourceId) state.destroyedAntiAir.add(enemy.sourceId)
    else enemy.respawn = enemy.kind === 'boss' ? 999 : 4.5
    return { hit: true, destroyed: true, kind: enemy.kind, enemy }
  }
  return { hit: false, destroyed: false, kind: null, enemy: null }
}

export function activeEnemyCount(state: EnemyState, kind?: EnemyKind) {
  let count = 0
  for (const enemy of state.slots) if (enemy.active && (!kind || enemy.kind === kind)) count += 1
  return count
}

export function nearbyEnemyThreats(state: EnemyState, player: Vec3) {
  let count = 0
  for (const enemy of state.slots) {
    if (!enemy.active || enemy.absorbing || enemy.inBeam || enemy.tether > 0.02) continue
    const range = enemy.kind === 'anti-air' ? 145 : enemy.kind === 'drone' ? 32 : enemy.kind === 'helicopter' ? HELICOPTER_DETECT_RANGE : enemy.hitRadius + 2.4
    if (distanceToPlayer(enemy, player) <= range) count += 1
  }
  return count
}

// Returns the worst single contact damage for this tick and, as a side effect,
// destroys any drone the player flew through. Damage is a max rather than a sum
// so a dense pack cannot stack into an instant kill.
export function resolveEnemyContacts(state: EnemyState, player: Vec3, playerRadius = 1.4) {
  let damage = 0
  state.contactKills = 0
  state.helicopterRams = 0
  for (const enemy of state.slots) {
    if (!enemy.active || enemy.absorbing || enemy.inBeam || enemy.tether > 0.02) continue
    if (distanceToPlayer(enemy, player) > enemy.hitRadius + playerRadius) continue
    const contact = ENEMY_CONTACT_DAMAGE[enemy.kind]
    if (contact > damage) damage = contact
    if (enemy.kind === 'helicopter') {
      // A ram is one hit: connect, break away, patrol, re-engage. Left in
      // chase mode it would sit inside the hull re-hitting on every damage
      // window, which is a grind rather than an attack that can be dodged.
      state.helicopterRams += 1
      enemy.mode = 'outbound'
      continue
    }
    if (enemy.kind !== 'drone') continue
    state.lastContactPoint.x = enemy.position.x
    state.lastContactPoint.y = enemy.position.y
    state.lastContactPoint.z = enemy.position.z
    enemy.active = false
    enemy.hp = 0
    enemy.respawn = 4.5
    state.contactKills += 1
  }
  return damage
}
