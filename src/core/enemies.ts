import type { BeamObject } from './beam'
import type { Aabb, Vec3 } from './drone'

export type EnemyKind = 'drone' | 'helicopter' | 'fighter' | 'boss'
export type EnemyMode = 'roam' | 'chase' | 'strafe' | 'outbound' | 'fixed'
export type EnemyProjectileKind = 'orb'

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
 * lands with two minutes and twenty seconds still on the clock, which is the
 * boss fight.
 *
 * The dreadnought used to launch at a hundred and eighty and now launches
 * twenty seconds earlier. The fighter wave before it was holding the sky on
 * its own for seventy seconds - long enough for the stage to stop introducing
 * anything and start repeating itself - while the fight everyone waits for was
 * the shortest thing in the run. Moving the launch spends those twenty seconds
 * where they read: the ship arrives while the fighter wave is still new, and
 * the fight it opens is a fifth longer.
 *
 * The two units that chase - the helicopter and the fighter - then went back
 * fifteen seconds each, because the run was reading as hard rather than as
 * fast. The mines are the one wave a new player can be in the sky with and
 * still be learning the beam: they do not follow, so the only skill they ask
 * for is not flying into one. Everything after them asks for evasion, so the
 * unhurried stretch is the one worth lengthening - it runs fifty-five seconds
 * now instead of forty, and the helicopters get forty on their own before the
 * fighters arrive.
 *
 * The same two are also a fifth thinner - helicopters 8/11/14 and fighters
 * 4/6 became 6/9/11 and 3/5 - while the mines keep every number they had.
 * Difficulty was being read off the things that hunt you, not off how full the
 * sky is, so the cut lands on those and the sky stays as busy as it looked.
 * See WAVE_RAMP_SECONDS for the third change in the same direction: none of
 * these numbers arrives all at once any more.
 */
export const ENEMY_WAVE_STAGES = [
  { at: 0, tempo: 0, label: 'UFO SIGHTED', targets: {} },
  { at: 30, tempo: 1, label: 'DRONE MINES', targets: { drone: 14 } },
  { at: 85, tempo: 2, label: 'HELICOPTERS UP', targets: { drone: 20, helicopter: 6 } },
  { at: 125, tempo: 3, label: 'FIGHTERS SCRAMBLED', targets: { drone: 25, helicopter: 9, fighter: 3 } },
  { at: 160, tempo: 4, label: 'SKY BATTLESHIP', targets: { drone: 34, helicopter: 11, fighter: 5, boss: 1 } },
] as const

/**
 * When the dreadnought's wave lands, read off the table above.
 *
 * Exported because the sky is on the same clock as the waves - see
 * `daylight.ts`, where nightfall is pinned to this second rather than written
 * out again as a number that has to be remembered when the wave moves.
 */
export const BATTLESHIP_LAUNCH_SECONDS = ENEMY_WAVE_STAGES.reduce(
  (found, stage) => ((stage.targets as Partial<Record<EnemyKind, number>>).boss ?? 0) > 0 ? stage.at : found,
  ENEMY_WAVE_STAGES[ENEMY_WAVE_STAGES.length - 1]!.at,
)

export const ENEMY_TIER: Record<EnemyKind, number> = {
  drone: 0,
  helicopter: 2,
  fighter: 4,
  boss: 7,
}

export const ENEMY_MAX_HP: Record<EnemyKind, number> = {
  drone: 1,
  helicopter: 3,
  fighter: 4,
  // Fifty seconds of fighting. An unupgraded laser can just about do it; a
  // maxed laser-power does it with time to spare, which is the whole point of
  // putting a laser-only target in the game.
  boss: 64,
}

/**
 * Pool sizes, which are no longer the same thing as the wave targets.
 *
 * They used to be identical, and that was fine while the spawner was the only
 * thing that put a unit in the sky. The dreadnought is a carrier as well as a
 * gun platform - see BATTLESHIP_ESCORT_INTERVAL - so the last wave has a
 * second source of drones, helicopters and fighters, and a cap sitting exactly
 * on the wave target would have left it nothing to launch. The headroom here
 * is that hangar: the wave table still says what the sky settles at, and the
 * difference is what the ship is allowed to add on top of it.
 */
export const ENEMY_CAPS: Record<EnemyKind, number> = {
  drone: 42,
  helicopter: 20,
  fighter: 10,
  boss: 1,
}

/**
 * The shared shot pool.
 *
 * Up from 96, which the halo alone can now spend: the ship's rings are three
 * elevation layers deep rather than one flat circle, and a full flurry is
 * seventy-odd orbs in the air at once. At 96 the last layers of a flurry were
 * simply never fired - `fireOrb` finds no free slot and returns quietly - and
 * and with the pool empty the fighters went mute too, so the biggest moment of
 * the fight was also the quietest. The pool has to hold
 * the loudest thing the game can do plus everything still shooting around it.
 */
export const ENEMY_MAX_PROJECTILES = 160

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
/**
 * How far the ship may fall behind before it stops keeping station and simply
 * runs the player down.
 *
 * Station-keeping is an exponential approach at 0.42 a second, which is a
 * following distance rather than a speed: a craft holding cruise opens about
 * seventy metres of gap on it, and a craft on turbo opens twice that and keeps
 * it. Flying one heading therefore used to delete the boss - it never
 * despawned, it just fell off the back of the screen and stayed there, and the
 * final wave became an empty sky. Past this range the ship stops trailing and
 * closes at a real speed instead.
 */
export const BATTLESHIP_PURSUIT_RANGE = BATTLESHIP_ORBIT * 1.5
/**
 * Where a pursuit ends. Well inside the range that starts one, so the ship
 * closes all the way back to fighting distance instead of releasing the moment
 * it scrapes past the threshold and immediately falling behind again - without
 * the gap between the two figures the chase is a permanent shudder at maximum
 * range rather than something that arrives.
 */
export const BATTLESHIP_STATION_RANGE = BATTLESHIP_ORBIT * 1.15
/**
 * Above turbo (54), so no amount of running takes the ship out of sight -
 * being run down by a thing that large is the point of it. It only ever
 * applies outside the pursuit range, so it is a closing dash rather than the
 * ship's speed: back at station it is slow again.
 */
export const BATTLESHIP_PURSUIT_SPEED = 64
/**
 * ...and never less than this much faster than whatever the craft is actually
 * doing. A fixed dash only closes by the difference between two numbers, so
 * against turbo it would crawl in at ten metres a second and every future
 * speed boon would quietly be a way of beating the boss again. Reading the
 * craft's own speed makes the pursuit close at a share of it instead, which is
 * a promise that holds however fast the player gets.
 */
export const BATTLESHIP_PURSUIT_MARGIN = 1.45

/**
 * The dreadnought is a carrier as well as a gun platform.
 *
 * On its own it was one big target circling at a fixed range while the sky
 * around it slowly emptied - the earlier waves' units get left behind as the
 * player repositions, and nothing replaces them, so the last two minutes drift
 * toward a duel with a single slow ship. Every ten seconds it now launches:
 * mines into the air under its keel, one helicopter off the flank the player
 * is on, and a fighter pointed straight at them. The wave table still decides
 * what the sky holds by itself; this is what the ship adds to it, and it is
 * why ENEMY_CAPS sits above the wave targets.
 */
export const BATTLESHIP_ESCORT_INTERVAL = 10
export const BATTLESHIP_ESCORT_MINES = 3
export const BATTLESHIP_ESCORT_HELICOPTERS = 1
export const BATTLESHIP_ESCORT_FIGHTERS = 1
/** How wide a ring around the hull escorts appear on, and how far under the
 *  keel they are dropped into: a curtain hanging beneath the ship rather than
 *  a clump beside it. */
export const BATTLESHIP_ESCORT_RADIUS = 30
export const BATTLESHIP_ESCORT_DROP = 68

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
 * projectiles on top of the fighters' curtains.
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
 * The bullet curtain, and now the roster's only round.
 *
 * Every gun in the sky fires the same thing: a slow glowing orb, deliberately
 * below the craft's cruising speed, because an orb is not meant to be outrun -
 * it is meant to be seen, read, and flown around. One weapon means one thing
 * to learn. The player no longer has to tell a rifle round from a shell from a
 * missile at a glance and price each one differently; they read the sky by
 * where the orbs are and where they are going, which is the only question a
 * curtain ever asks.
 *
 * The lead-aimed, telegraphed shot is gone with them, and so is every unit
 * that fired one. Aiming was a second grammar bolted onto the first: a gun
 * locked for three seconds, drew a line, and streamed heavy rounds down it, so
 * the answer to it was reading a warning rather than reading the air. Nothing
 * in the sky aims now, and the dodge is the same dodge everywhere - move, and
 * keep moving.
 *
 * Fighters fire one orb at a time down the bearing to the craft. The
 * battleship scatters full rings in every direction and on three pitches - a
 * halo that makes closing on the hull a navigation problem - and that halo is
 * its whole armoury, which is the reason the ship reads as a boss and not as a
 * large fighter: it fills the air rather than out-shooting you.
 */
/**
 * How fast a curtain round travels: less than half the craft's cruise of 30,
 * and under its slowest useful throttle.
 *
 * This is the number the whole design rests on. A round the player can outfly
 * is a round they can read, and reading it is the game: at fourteen metres a
 * second an orb crosses the gap from a fighter's nose to where you are hanging
 * over a rooftop in about four seconds, which is long enough to see it leave,
 * decide, and be somewhere else. Nothing about a hit should ever be a surprise
 * - if the player is where the orb is, they had seconds to not be.
 *
 * It also means a craft under way is essentially safe from anything shot at it
 * from range, and that is correct. The curtain is not there to tax travelling;
 * it is there to price hovering, beam work, and flying into a nest of guns
 * without looking.
 */
export const ORB_SPEED = 14
export const ORB_HIT_RADIUS = 0.7
/** Long enough to cross the fighter's whole range and no further, so a missed
 *  round dies in the air rather than sailing on across the city. */
export const FIGHTER_ORB_LIFE = 5.4
/**
 * Seconds between a fighter's shots.
 *
 * It used to be two seconds for a fan of five, gated on the player sitting
 * inside a thirty-degree view cone off the fighter's nose - so a fighter was
 * either silent or spat a wall, depending on something the player could not
 * see. One orb on a shorter cooldown, from any bearing, spends the same
 * ammunition as a steady drizzle: a single fighter is a nuisance you fly past
 * and a squadron is weather.
 *
 * Doubled from 1.4 with the rest of the difficulty pass. The drizzle was the
 * right shape and there was simply too much of it once several fighters were
 * up: the gate is range, not aim, so a squadron's shots all land in the same
 * few seconds a player spends inside it. Halving each fighter's rate halves
 * that without touching the thing that makes the shots readable - one slow orb
 * per fighter, no lead, no warning line.
 */
export const FIGHTER_ORB_INTERVAL = 2.8
export const FIGHTER_ORB_RANGE = 70
/** A fighter crosses the sky in one straight line, well above cruise: the
 *  pass is the manoeuvre, the orb is the attack. */
export const FIGHTER_PASS_SPEED = 40

/** Battleship orbs travel a little harder - they have an escort's ground to
 *  cover - but still at half the craft's cruise, so the halo is flown through,
 *  not fled. */
export const BATTLESHIP_ORB_SPEED = 16
export const BATTLESHIP_ORB_LIFE = 8
/** Orbs per ring, and rings per flurry. The second ring is offset half a
 *  spacing so the pair weaves a net rather than retracing the first. */
export const BATTLESHIP_ORB_RING_COUNT = 12
export const BATTLESHIP_ORB_RINGS = 2
/**
 * Elevation layers in one ring: below the hull, level with it, and above.
 *
 * A single flat ring is only a wall on the map. In the air it is a disc, and a
 * disc is dodged by doing the one thing this game makes easiest - changing
 * altitude - so the halo asked nothing of a player who simply climbed or dived
 * through the gap above and below it. Three tilted shells make the same volley
 * a shape rather than a line: there is no longer an altitude that is free, and
 * threading the ship's airspace costs a decision in every axis.
 *
 * Radians of pitch, gentle on purpose - steeper than this and the outer layers
 * spend their whole life arriving at the ground or the ceiling rather than at
 * the player.
 */
export const BATTLESHIP_ORB_PITCHES = [-0.34, 0, 0.34] as const

/**
 * How far a mine reaches, and how long it holds before going off.
 *
 * One number for the trigger, the blast and the warning field drawn around it:
 * the red shell a player sees IS the kill radius, so approaching it is the same
 * event as arming it. Two numbers here would mean the shell lies about one or
 * the other.
 *
 * Nudged from 9 to 10. A tenth wider is not a different rule - a mine is still
 * something read and flown around rather than survived - but the shell is that
 * much easier to pick out of a busy sky at speed, and the blast covers what the
 * player was told it would cover with a little less room to clip the edge of it
 * and walk away. Everything downstream is sized off this one value, so the
 * field, the fire and the damage all move together.
 */
export const DRONE_MINE_BLAST_RADIUS = 10
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
   * Battleship only. Which ring of the flurry comes next, how many are left in
   * it, and how many flurries have gone by. The last two both nudge the halo's
   * bearing offset, so no ring ever retraces the one before it.
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
  waveStage: number
  spawnTimer: number
  /** Seconds until the dreadnought's next launch. Held at a full interval
   *  whenever there is no ship, so the first escorts arrive ten seconds after
   *  it does rather than alongside it. */
  escortTimer: number
  randomState: number
  contactKills: number
  /** How many helicopters rammed the hull this tick, so the caller can put
   *  the blast shake on a ram without mistaking a scrape for one. */
  helicopterRams: number
  /** Kind of the last projectile that connected, so the caller can price the
   *  hit by weapon rather than by a raw damage number. */
  lastHitKind: EnemyProjectileKind | null
  /**
   * Where the last projectile burst against the hull.
   *
   * The caller puts the hit effect there. It is set on every connection, not
   * only on the ones that cost health: the craft has a second of grace after
   * a hit, and a round that vanishes into an invulnerable hull with nothing
   * to show for it reads as the shot passing through.
   */
  lastHitPoint: Vec3
  /** True on any tick a projectile burst against the hull, whatever the
   *  damage window said. */
  projectileHit: boolean
  /** Where the last suicide drone detonated, for the explosion effect. */
  lastContactPoint: Vec3
  /** A mine explosion is consumed by the game loop after all enemy movement. */
  mineExplosion: { position: Vec3; radius: number; damage: number } | null
}

const ORDER: EnemyKind[] = ['drone', 'helicopter', 'fighter', 'boss']

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
  boss: 13.6,
}

const ENEMY_MASS: Record<EnemyKind, number> = {
  drone: 3,
  helicopter: 4,
  fighter: 4,
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

/**
 * How long a wave takes to reach the population its table entry names.
 *
 * A wave used to be a step: the stage boundary moved the target, and the
 * spawner - which can hand out eight units in a single tick - had the whole
 * squadron in the sky about three seconds later. Eight helicopters appearing
 * at once is the moment the run was being called hard, and it is a different
 * complaint from the one the wave times answer: pushing a wave back buys time
 * before it, not time inside it.
 *
 * So a wave now arrives at half strength and fills to its table entry over
 * this window. The bulletin still announces something that is actually in the
 * sky - the half that lands on the boundary is the news - and the rest joins
 * while the player is already flying against it.
 *
 * Shorter than the tightest gap in the wave table, so one wave always finishes
 * arriving before the next one starts.
 */
export const WAVE_RAMP_SECONDS = 20

/** What share of a wave lands on its own boundary. The rest is the ramp. */
export const WAVE_RAMP_OPENING = 0.5

/**
 * The population a kind should hold right now, ramp included.
 *
 * Read per kind rather than per stage: a wave that adds helicopters usually
 * raises the mine count too, and there is no reason for the mines to step
 * while the helicopters ease in. Every kind fills from where the previous
 * stage left it to where this one wants it.
 *
 * The dreadnought is exempt in practice rather than by a branch: half of one
 * ship rounds to one, so the ship is whole on the second it launches. Nothing
 * else in the table is small enough for that to matter.
 */
export function waveTargetForKind(kind: EnemyKind, elapsed: number) {
  const index = waveStageForTime(elapsed)
  const stage = ENEMY_WAVE_STAGES[index]!
  const previous = index > 0 ? ENEMY_WAVE_STAGES[index - 1]! : null
  const full = (stage.targets as Partial<Record<EnemyKind, number>>)[kind] ?? 0
  const held = previous ? ((previous.targets as Partial<Record<EnemyKind, number>>)[kind] ?? 0) : 0
  if (full <= held) return Math.min(ENEMY_CAPS[kind], full)
  const opening = held + (full - held) * WAVE_RAMP_OPENING
  const progress = Math.max(0, Math.min(1, (elapsed - stage.at) / WAVE_RAMP_SECONDS))
  return Math.min(ENEMY_CAPS[kind], Math.round(opening + (full - opening) * progress))
}

function targetForKind(kind: EnemyKind, elapsed: number) {
  return waveTargetForKind(kind, elapsed)
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
    kind: 'orb',
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
  return { slots, projectiles, waveStage: 0, spawnTimer: 0, escortTimer: BATTLESHIP_ESCORT_INTERVAL, randomState: seed >>> 0 || 1, contactKills: 0, helicopterRams: 0, lastHitKind: null, lastHitPoint: { x: 0, y: 0, z: 0 }, projectileHit: false, lastContactPoint: { x: 0, y: 0, z: 0 }, mineExplosion: null } satisfies EnemyState
}

function resetSlot(enemy: EnemySlot, player: Vec3, heading: number, state: EnemyState) {
  enemy.generation += 1
  enemy.id = `enemy:${enemy.kind}:${enemy.slot}:${enemy.generation}`
  enemy.hp = enemy.maxHp
  enemy.hurt = 0
  enemy.active = true
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
  enemy.mode = enemy.kind === 'fighter' ? 'strafe' : enemy.kind === 'boss' ? 'chase' : 'roam'
  enemy.radius = enemy.kind === 'fighter' ? 110 : enemy.kind === 'boss' ? BATTLESHIP_ORBIT : enemy.kind === 'helicopter' ? 92 : 82
  enemy.hitRadius = enemy.kind === 'drone' ? DRONE_MINE_HIT_RADIUS : enemy.kind === 'helicopter' ? 2.4 : enemy.kind === 'fighter' ? 2.2 : 9.5
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

/**
 * One unit launched off the dreadnought rather than handed out by the spawner.
 *
 * It is an ordinary spawn that is then moved: `resetSlot` owns everything
 * about a fresh unit and there is no version of that worth keeping twice, so
 * this reaches into the result and changes only the two things the ship
 * decides - where it appears and, for a fighter, which way it is pointed.
 *
 * The ring is biased toward the flank the player is on, so what launches comes
 * out from between the ship and the craft instead of from behind the hull
 * where it would spend its first seconds invisible.
 */
function spawnEscort(state: EnemyState, kind: EnemyKind, ship: EnemySlot, player: Vec3, heading: number) {
  const slot = state.slots.find((item) => item.kind === kind && !item.active && item.respawn <= 0)
  if (!slot) return false
  resetSlot(slot, player, heading, state)
  const toPlayer = Math.atan2(player.x - ship.position.x, player.z - ship.position.z)
  const bearing = toPlayer + (random(state) - 0.5) * Math.PI
  const range = BATTLESHIP_ESCORT_RADIUS * (0.5 + random(state) * 0.8)
  slot.position.x = ship.position.x + Math.sin(bearing) * range
  slot.position.z = ship.position.z + Math.cos(bearing) * range
  // Dropped into the air under the keel rather than parked alongside: the
  // curtain hangs in the sky the player has to cross to reach the ship.
  slot.position.y = Math.max(8, ship.position.y - BATTLESHIP_ESCORT_DROP * (0.2 + random(state) * 0.8))
  if (kind === 'drone') {
    // A mine hangs off `target.y` and bobs around it; the position alone is
    // this frame's pose and would be overwritten on the next step.
    slot.target.y = slot.position.y
  } else if (kind === 'fighter') {
    // Pointed straight at the craft as it leaves the deck. The pass does the
    // rest - a fighter never adjusts once it is flying.
    const run = Math.atan2(player.x - slot.position.x, player.z - slot.position.z)
    slot.velocity.x = Math.sin(run) * FIGHTER_PASS_SPEED
    slot.velocity.z = Math.cos(run) * FIGHTER_PASS_SPEED
    slot.rotation.y = run
  }
  // Where it was launched is the patch of sky it owns, same as any other
  // spawn - a helicopter deployed off the flank patrols there.
  slot.anchor.x = slot.position.x
  slot.anchor.y = slot.position.y
  slot.anchor.z = slot.position.z
  return true
}

/**
 * The dreadnought's launch cycle: mines, a helicopter and a fighter, every ten
 * seconds for as long as it is in the sky.
 *
 * Run from the spawner rather than from the ship's own step, because it is a
 * spawn and every other spawn in the game happens here - it obeys the same
 * pools, the same free-slot rule, and the same caps. If the pool for a kind is
 * full the launch for that kind simply does not happen, which is the cap doing
 * its job rather than a case to handle.
 */
function stepBattleshipEscort(state: EnemyState, player: Vec3, heading: number, dt: number) {
  const ship = state.slots.find((enemy) => enemy.kind === 'boss' && enemy.active)
  if (!ship) {
    state.escortTimer = BATTLESHIP_ESCORT_INTERVAL
    return
  }
  state.escortTimer -= Math.min(Math.max(0, dt), 0.05)
  if (state.escortTimer > 0) return
  state.escortTimer += BATTLESHIP_ESCORT_INTERVAL
  for (let index = 0; index < BATTLESHIP_ESCORT_MINES; index += 1) spawnEscort(state, 'drone', ship, player, heading)
  for (let index = 0; index < BATTLESHIP_ESCORT_HELICOPTERS; index += 1) spawnEscort(state, 'helicopter', ship, player, heading)
  for (let index = 0; index < BATTLESHIP_ESCORT_FIGHTERS; index += 1) spawnEscort(state, 'fighter', ship, player, heading)
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
    if (target === 0 && enemy.active) enemy.active = false
  }
  let spawned = 0
  while ((state.spawnTimer <= 0 || (initialBurst && spawned < 2)) && spawned < SPAWN_BURST_LIMIT) {
    const kind = neediestKind(state, elapsed)
    if (!kind) break
    if (!spawnOne(state, kind, player, heading)) break
    spawned += 1
    state.spawnTimer += spawnIntervalForStage(stage)
  }
  stepBattleshipEscort(state, player, heading, dt)
  return state
}

function distanceToPlayer(enemy: EnemySlot, player: Vec3) {
  return Math.hypot(enemy.position.x - player.x, enemy.position.y - player.y, enemy.position.z - player.z)
}

/**
 * Shot speeds.
 *
 * Two entries, because there are two weapons left. The bow gun is the aimed
 * one and sits above the craft's cruising speed of 30, which is what makes an
 * interception solution exist at all: a shot slower than its target can never
 * catch a fleeing craft, however well it was aimed. Turbo (54) still outruns
 * it, and that is deliberate - turbo is a resource, and spending it to outrun
 * the boss's one aimed shell is a fair play.
 *
 * The orb goes the other way on purpose. It is a curtain round, dodged by
 * reading the air rather than outrun, so it sits below cruise. See the
 * bullet-curtain block above.
 */
export const PROJECTILE_SPEED: Record<EnemyProjectileKind, number> = {
  orb: ORB_SPEED,
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
 * The battleship holds station and turns - until the player runs, and then it
 * runs them down.
 *
 * The old boss sat eight metres above the player's head, which made a
 * thirteen-metre saucer impossible to see and identical in behaviour to a
 * helicopter. A capital ship should be somewhere else in the sky: high, wide
 * of you, and slow enough that its arc is readable. It circles at a distance
 * so its flank - where the turrets are - faces the player, and its bow points
 * along its own travel, because a ship crabbing sideways does not read as a
 * ship.
 *
 * Station-keeping alone was not enough to keep it on screen. An exponential
 * approach is a following distance, not a speed: hold any heading and the gap
 * settles wherever the craft's own speed puts it, so a player who simply flew
 * away had a boss that fell behind the horizon and never came back - the fight
 * was over without either side having done anything. Outside
 * `BATTLESHIP_PURSUIT_RANGE` the ship drops station-keeping and closes at a
 * speed that beats turbo, which makes running a way of choosing where the
 * fight happens rather than a way of ending it.
 */
function stepBattleship(enemy: EnemySlot, player: Vec3, playerVelocity: Vec3, d: number) {
  enemy.age += d
  // Circle the player, closing the radius only if they have run.
  const toPlayerX = player.x - enemy.position.x
  const toPlayerZ = player.z - enemy.position.z
  const range = Math.max(0.001, Math.hypot(toPlayerX, toPlayerZ))
  enemy.phase += d * 0.11
  const desiredX = player.x + Math.sin(enemy.phase) * BATTLESHIP_ORBIT
  const desiredZ = player.z + Math.cos(enemy.phase) * BATTLESHIP_ORBIT
  const previousX = enemy.position.x
  const previousZ = enemy.position.z
  // `chase` is the pursuit; `roam` is station-keeping. Which threshold applies
  // depends on which one it is already doing, and that hysteresis is the whole
  // difference between a ship that arrives and one that hangs at maximum range.
  enemy.mode = (enemy.mode === 'chase' ? range > BATTLESHIP_STATION_RANGE : range > BATTLESHIP_PURSUIT_RANGE) ? 'chase' : 'roam'
  if (enemy.mode === 'chase') {
    // Run down, not lerp: a lerp is a following distance, and a following
    // distance is exactly what a fleeing player stretches. Capped by the gap
    // so it arrives on the station point instead of overshooting past it.
    const fleeing = Math.hypot(playerVelocity.x, playerVelocity.z)
    const dash = Math.max(BATTLESHIP_PURSUIT_SPEED, fleeing * BATTLESHIP_PURSUIT_MARGIN)
    const gapX = desiredX - enemy.position.x
    const gapZ = desiredZ - enemy.position.z
    const gap = Math.max(0.001, Math.hypot(gapX, gapZ))
    const step = Math.min(gap, dash * d)
    enemy.position.x += gapX / gap * step
    enemy.position.z += gapZ / gap * step
  } else {
    // Slow, once it is where it wants to be. The fight is meant to be fought
    // at this range, and a ship that snapped to station would have no arc to
    // read.
    const closing = 1 - Math.exp(-0.16 * d)
    enemy.position.x += (desiredX - enemy.position.x) * closing
    enemy.position.z += (desiredZ - enemy.position.z) * closing
  }
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
 * One orb sent straight down the line to the craft.
 *
 * Where it is now, not where it will be: this is the whole of what a gun does
 * here. There is no lead and no telegraph, because the round is slow enough
 * that its own flight is the warning - a player who is still on the line four
 * seconds later chose to be.
 *
 * Returns false when the pool is full, so a caller can keep its cooldown
 * cocked rather than spending it on a shot that never left.
 */
function fireOrbAt(state: EnemyState, origin: Vec3, target: Vec3, speed: number, life: number) {
  const projectile = state.projectiles.find((item) => !item.active)
  if (!projectile) return false
  const dx = target.x - origin.x
  const dy = target.y - origin.y
  const dz = target.z - origin.z
  const distance = Math.max(0.001, Math.hypot(dx, dy, dz))
  projectile.active = true
  projectile.kind = 'orb'
  projectile.position.x = origin.x
  projectile.position.y = origin.y
  projectile.position.z = origin.z
  projectile.velocity.x = dx / distance * speed
  projectile.velocity.y = dy / distance * speed
  projectile.velocity.z = dz / distance * speed
  projectile.life = life
  projectile.damage = 1
  projectile.radius = ORB_HIT_RADIUS
  return true
}

/**
 * One full ring of the battleship's halo: every bearing at once, on three
 * pitches at once. Successive rings are rotated - the second by half a
 * spacing, each flurry by its own offset, each layer by a third of one - so
 * over a fight the gaps themselves travel and no bearing and no altitude stays
 * a permanently safe lane.
 */
function fireBattleshipRing(state: EnemyState, enemy: EnemySlot, player: Vec3) {
  const climb = Math.max(-14, Math.min(2, (player.y + 2 - enemy.position.y) / BATTLESHIP_ORB_LIFE))
  const offset = enemy.volley * 0.9 + enemy.turret * (Math.PI / BATTLESHIP_ORB_RING_COUNT)
  const spacing = Math.PI * 2 / BATTLESHIP_ORB_RING_COUNT
  for (let layer = 0; layer < BATTLESHIP_ORB_PITCHES.length; layer += 1) {
    const pitch = BATTLESHIP_ORB_PITCHES[layer]!
    // The layers are staggered around the compass as well as up and down, so
    // the three shells never line up into vertical lanes to fly between.
    const bearingOffset = offset + layer * spacing / BATTLESHIP_ORB_PITCHES.length
    // Tilting the shot, not adding to it: the speed is the same in every
    // layer, so the halo stays a sphere expanding at one rate and the top and
    // bottom layers are still slower than cruise.
    const flat = Math.cos(pitch) * BATTLESHIP_ORB_SPEED
    const rise = Math.sin(pitch) * BATTLESHIP_ORB_SPEED
    for (let index = 0; index < BATTLESHIP_ORB_RING_COUNT; index += 1) {
      fireOrb(state, enemy.position, bearingOffset + index * spacing, flat, climb + rise, BATTLESHIP_ORB_LIFE)
    }
  }
}

const STILL: Vec3 = { x: 0, y: 0, z: 0 }

/**
 * A flurry of orb rings, then a reload. That is the ship's whole armoury.
 *
 * It carried two aimed moves as well - a telegraphed bow gun and a
 * lock-and-stream flak battery - and between them and the rooftop network the
 * late game asked the player to read three separate warnings while threading a
 * curtain. The curtain is the better half of the fight and the one that reads
 * at a glance, so it is the half that stayed: rings of slow orbs scattered in
 * every direction and on three pitches, which turn the air around the hull
 * into a navigation problem rather than a marksman's duel.
 *
 * Nothing the ship fires is aimed at the player any more, and nothing it fires
 * needs a telegraph - a curtain slow enough to be flown through is its own
 * warning. It is the reload, not the flurry, that is the actual fight: that
 * gap is when the laser gets used.
 */
function stepBattleshipGuns(state: EnemyState, enemy: EnemySlot, player: Vec3, d: number) {
  enemy.attackTimer -= d
  if (enemy.attackTimer > 0) return
  if (enemy.burstLeft <= 0) {
    enemy.volley += 1
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
      // crosses the blast field like any other approach, arms there, and
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
    if (enemy.kind === 'boss') stepBattleship(enemy, player, playerVelocity, d)
    else if (enemy.kind === 'fighter') stepFighter(enemy, player, d)
    else if (enemy.kind === 'drone') stepDroneMine(enemy, player, d)
    else stepHelicopter(enemy, player, d)

    if (enemy.kind === 'boss') { stepBattleshipGuns(state, enemy, player, d); continue }
    enemy.attackTimer -= d
    // Drones and helicopters never fire at all: both deal contact damage only.
    // Drones because thirty-odd of them shooting would bury the screen;
    // helicopters because the ram is the whole attack. That leaves the fighter
    // as the sky's only gun outside the ship's own halo.
    if (enemy.attackTimer > 0) continue
    if (enemy.kind !== 'fighter') continue
    // The cadence only counts shots that actually left: with the pool full the
    // timer stays cocked rather than quietly eating the shot.
    if (distanceToPlayer(enemy, player) > FIGHTER_ORB_RANGE) continue
    if (fireOrbAt(state, enemy.position, player, ORB_SPEED, FIGHTER_ORB_LIFE)) enemy.attackTimer = FIGHTER_ORB_INTERVAL
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
 * is that they are slow enough to be seen coming, and the buildings are what
 * a player uses to answer them.
 */
export function stepEnemyProjectiles(state: EnemyState, player: Vec3, dt: number, playerRadius = 1.25, colliders: Aabb[] = []) {
  const d = Math.min(Math.max(0, dt), 0.05)
  let damage = 0
  state.lastHitKind = null
  state.projectileHit = false
  for (const projectile of state.projectiles) {
    if (!projectile.active) continue
    projectile.position.x += projectile.velocity.x * d
    projectile.position.y += projectile.velocity.y * d
    projectile.position.z += projectile.velocity.z * d
    projectile.life -= d
    // Under the street it can hit nothing and be seen by nobody. The ship's
    // lower orb layer is aimed downward on purpose, so without this a third of
    // every flurry would spend its full eight-second life travelling through
    // the ground with a pool slot held open behind it.
    if (projectile.position.y < 0) {
      projectile.active = false
      continue
    }
    if (projectile.kind === 'orb' && colliders.length > 0 && orbBlocked(projectile, colliders)) {
      projectile.active = false
      continue
    }
    const distance = Math.hypot(projectile.position.x - player.x, projectile.position.y - player.y, projectile.position.z - player.z)
    if (distance <= projectile.radius + playerRadius) {
      // A round that touches the hull is spent, always. The craft's damage
      // window can decide the hit costs nothing, but nothing about that makes
      // the orb keep flying - it burst, and the caller puts a flash where.
      projectile.active = false
      state.projectileHit = true
      state.lastHitPoint.x = projectile.position.x
      state.lastHitPoint.y = projectile.position.y
      state.lastHitPoint.z = projectile.position.z
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
    enemy.respawn = enemy.kind === 'boss' ? 999 : 4.5
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
    const range = enemy.kind === 'drone' ? 32 : enemy.kind === 'helicopter' ? HELICOPTER_DETECT_RANGE : enemy.hitRadius + 2.4
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
