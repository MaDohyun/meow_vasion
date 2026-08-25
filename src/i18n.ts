import type { GeneralWordId, MissionQuestId } from './core/missions'
import type { RunEnding } from './core/ending'
import type { EnemyKind } from './core/enemies'
/**
 * UI strings, in one dictionary.
 *
 * Kept together rather than scattered through components so a language can be
 * proof-read in one pass, and so a missing key is a type error at build time
 * instead of a blank label at run time - every language must supply the full
 * set, which `Record<Language, Strings>` enforces.
 *
 * Mid-run callouts are stored on the runtime as a key plus a number and
 * translated here at render time. The simulation has no business knowing what
 * language the player reads.
 *
 * Wave bulletins work the same way: the runtime stores which wave went on air
 * and nothing else, and the words are picked here - once for the HUD band and
 * once, per frame, for the anchor's caption bar on the city's news towers.
 *
 * Wave names ("DRONE SWARM" and friends) stay in English on purpose: they
 * are stylised arcade labels, closer to proper nouns than to sentences.
 *
 * A few strings carry `[[double brackets]]` around the part that must not be
 * skimmed past - "the weight will crash you", "a building hit costs you life".
 * `<RichText>` renders those in the warning colour. The brackets live in the
 * string rather than in the component because which words matter is a
 * translation decision: Korean, Japanese and English put the verb in
 * different places, and only the translator knows where the warning lands.
 *
 * Two names are fixed across all three languages, because the run has one of
 * each and a second name for either reads as a second thing:
 *
 * - The five hearts are **life** - 생명력 / ライフ / LIFE. Never "hull": that
 *   word belongs to the craft's body, which only ever grows.
 * - The final wave's ship is the **sky battleship** - 공중전함 / 空中戦艦 /
 *   SKY BATTLESHIP, shortened to BATTLESHIP only in the radar legend, which
 *   is half a dial wide. Never "dreadnought".
 * - The ship the player flies is the **craft** - 기체 / 機体 / the craft -
 *   every time the general speaks of it, in a briefing, a debrief or an
 *   ending line. He commands the fleet it came from, so he would no sooner
 *   call it "UFO" (or 우주선 / 宇宙船) than a pilot would call their own jet
 *   an unidentified object. "UFO" belongs to Earth's half of the script -
 *   the news bulletins - and to the how-to panel, which speaks to the player
 *   rather than to the pilot.
 *
 * `test/i18n.spec.ts` holds all three to that.
 */

export const LANGUAGES = ['ko', 'ja', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

export const LANGUAGE_LABELS: Record<Language, string> = {
  ko: '한국어',
  ja: '日本語',
  en: 'English',
}

export const DEFAULT_LANGUAGE: Language = 'ko'

export type Strings = {
  titleKicker: string
  titleLine1: string
  titleLine2: string
  tagline: string
  /** The lobby's standing order, shown under the title. The run is a timed
   *  recon sortie rather than an open-ended sandbox, and the lobby is the only
   *  place a player can read that before the clock is already running. */
  lobbyOrdersTag: string
  lobbyOrders: string
  start: string
  options: string
  close: string
  howTo: string
  enemyIntel: string
  enemyIntelEyebrow: string
  enemyIntelTitle: string
  enemyIntelLead: string
  enemyIntelAppears: string
  enemyIntelNames: Record<EnemyKind, string>
  enemyIntelCopy: Record<EnemyKind, string>
  /** The developer drill, which only appears where the dev entrances are on.
   *  Translated like everything else: whoever is testing the game reads the
   *  lobby in their own language too. */
  devDrill: string
  devRunNote: string
  howToTitle: string
  howToMove: string
  howToAim: string
  graphics: string
  qualityHigh: string
  qualityLow: string
  language: string
  bgmVolume: string
  sfxVolume: string
  soundBlocked: string
  /** Both hands are named, because the machine the player brought is not
   *  knowable: a mouse has the two buttons every player already knows, and a
   *  laptop trackpad cannot hold one down while the same fingers steer. */
  keyLeftClick: string
  keyRightClick: string
  /** The craft flies itself; these name what the player still decides. */
  controlFly: string
  controlAim: string
  controlBeam: string
  controlLaser: string
  /** The laser's one piece of help, which the manual has to say out loud
   *  because the player only meets it by happening to point at a fighter. */
  controlAutoAim: string
  controlBoost: string
  /** Labels on the three touch fire buttons. Short enough to sit inside a
   *  thumb-sized circle, which is why they are not the control-card lines. */
  touchTurbo: string
  touchLaser: string
  touchBeam: string
  /** The in-run control card: its heading, and the label on the button that
   *  calls it back once it has folded itself away. */
  tipTitle: string
  tipToggle: string
  mass: string
  massHint: string
  collapseAt: string
  life: string
  /** Contact damage is the one hazard nothing on screen announces, so it is
   *  said in words: on the vitals card, in the manual and in the briefing. */
  hazardBuildings: string
  overloadHint: string
  bossName: string
  repairing: string
  ceiling: string
  overloaded: string
  overloadAlarm: string
  waterAlarm: string
  clock: string
  score: string
  wave: string
  run: string
  beam: string
  beamSearching: string
  beamReady: string
  beamLocked: string
  beamPulling: string
  beamAmplified: string
  /** The ballast gauge. It reads as weight rather than as drag because that
   *  is what fills it and what the overload warning names - the slowdown is
   *  the symptom, not the thing on the bar. Past full the craft both slows and
   *  sinks; what it no longer does is end the run when it reaches the road. */
  weight: string
  turbo: string
  turboActive: string
  live: string
  speed: string
  altitude: string
  threats: string
  pilotCam: string
  tutorialPressE: string
  hold: string
  mission: string
  missionCopy: Record<MissionQuestId, string>
  /**
   * The general's word after each of the first four missions, plus the field
   * advisories he raises unprompted, one paragraph per line.
   *
   * These freeze the game while they are on screen, so they are written to be
   * read once and remembered: each one names a rule the pilot has just met by
   * doing it rather than by being told about it in the opening briefing. The
   * one exception is `drone-mine`, which is said *before* the lesson can be
   * paid for - the mine teaches itself at the cost of five life otherwise.
   */
  missionDebrief: Record<GeneralWordId, readonly string[]>
  /** The general's closing word on the results screen, one per ending. */
  endingRemark: Record<RunEnding, string>
  tutorialMissionEyebrow: string
  tutorialMissionLead: string
  tutorialMissionAction: string
  briefingTitle: string
  briefingContinue: string
  briefingSkip: string
  /** What to press, shown on a hands-on briefing step in place of the
   *  "click to continue" hint. */
  briefingWaitHint: Record<TutorialControl, string>
  tutorialBriefing: readonly TutorialBriefingStep[]
  missionStageComplete: (previous: number, next: number) => string
  reconComplete: string
  radar: string
  /** The dial's legend. Named rather than left as coloured squares: three
   *  swatches is exactly where a key stops being self-evident. */
  radarKeyHostile: string
  radarKeyBoss: string
  radarKeyWater: string
  radarKeyCircle: string
  survivedTitle: string
  missionFailedTitle: string
  collapsedTitle: string
  survivedLead: string
  missionFailedLead: string
  collapsedLead: string
  finalScore: string
  statSurvived: string
  statMass: string
  statAbsorbed: string
  statWave: string
  retry: string
  /** Ranking board: the results-screen button, the name form and the table. */
  rankingOpen: string
  rankingTitle: string
  rankingLead: string
  rankingNameLabel: string
  rankingNamePlaceholder: string
  rankingSubmit: string
  rankingSending: string
  rankingClose: string
  rankingTryAgain: string
  rankingLoading: string
  rankingEmpty: string
  rankingFailed: string
  rankingLocalNote: string
  rankingSaved: (rank: number) => string
  rankingSavedOffBoard: string
  rankingNameRequired: string
  rankingColRank: string
  rankingColName: string
  rankingColScore: string
  rankingColTime: string
  rankingYou: string
  msgAbsorbedPerson: (reward: number) => string
  msgAbsorbedCat: (reward: number) => string
  msgAbsorbedObject: (reward: number) => string
  msgEnemyDown: (reward: number) => string
  /** Any road vehicle the laser kills - car, truck or tanker. They are not
   *  worth the same, so the callout takes the score rather than quoting a
   *  car's price at a tanker. */
  msgVehicleDestroyed: (reward: number) => string
  /** A lake pumped dry: draining one tile takes the whole body of water with
   *  it, and the craft grew for it. Said once, on the frame it empties. */
  msgLakeDrained: string
  msgTurbo: string
  msgTurboOverload: string
  /**
   * The mystery-circle pickup callouts. One per stat, one for the patch a
   * fully-upgraded craft gets instead, one for the score fallback.
   *
   * No level number in any of them: every stat caps at one level (see
   * core/boons), so "Lv.1" would be printed on all eight and would never say
   * anything. The callout names the stat, which is the whole of what a player
   * needs off a two-second line.
   */
  msgBoonLaser: string
  msgBoonSpeed: string
  msgBoonTurnRate: string
  msgBoonBeamRadius: string
  msgBoonBeamReach: string
  msgBoonBeamPull: string
  msgBoonTurboRecharge: string
  msgBoonTurboCapacity: string
  msgBoonHeal: string
  msgBoonScore: (reward: number) => string
  /** Flying through a circle: surge and a turbo refill, never a repair. */
  msgMysteryCircle: string
  breakingFlag: string
  broadcast: BulletinSet
}

/**
 * The controls the opening briefing hands over, one line at a time.
 *
 * A step carrying a `wait` is a hands-on step: it unlocks that control, says
 * so, and does not move on until the player has actually used it. Reading that
 * the laser exists and firing it once are different amounts of learning, and
 * the second one is the one that sticks.
 */
export type TutorialControl = 'beam' | 'laser' | 'turbo'

export type TutorialBriefingStep = {
  lines: readonly string[]
  wait?: TutorialControl
  auto?: number
}

/**
 * One wave bulletin: a short headline for the caption bar on the city's news
 * screens, and the sentence the anchor reads, which is what the player
 * actually gets to read on the HUD card.
 *
 * The line carries its own newline. Where a broadcast caption breaks is a
 * writing decision, not a layout one - Korean, Japanese and English put their
 * clauses in different places, so leaving it to the browser would break one
 * language mid-phrase to suit another's width. Every line here is split by
 * hand at a clause boundary, and the card renders it with `pre-line`.
 */
export type Bulletin = {
  headline: string
  line: string
}

/** Exactly one bulletin per wave stage. A tuple rather than an array so a
 *  language that forgets a stage fails to compile. */
type BulletinSet = readonly [Bulletin, Bulletin, Bulletin, Bulletin, Bulletin]

/** Keys the simulation may raise as a mid-run callout. */
export type MessageKey = {
  [K in keyof Strings]: K extends `msg${string}` ? K : never
}[keyof Strings]

export function bulletinFor(strings: Strings, stage: number): Bulletin {
  return strings.broadcast[Math.min(strings.broadcast.length - 1, Math.max(0, stage))]!
}

export function formatMessage(strings: Strings, key: MessageKey, arg: number) {
  const value = strings[key]
  return typeof value === 'function' ? value(arg) : value
}

export const STRINGS: Record<Language, Strings> = {
  ko: {
    titleKicker: 'MEOWVASION',
    titleLine1: '침략할',
    titleLine2: '거냥',
    tagline: '5분 안에 지구 정찰을 끝내고 유유히 튀세요',
    lobbyOrdersTag: '작전 명령',
    lobbyOrders: '5분 동안 정찰대 임무를 완수하라!',
    start: '게임 시작',
    options: '옵션',
    close: '닫기',
    howTo: '하는 방법',
    enemyIntel: '적 도감',
    enemyIntelEyebrow: '지구 방위군 // 위협 자료',
    enemyIntelTitle: '조금 이상한 적들',
    enemyIntelLead: '정찰 시간이 흐를수록 투입되는 적들의 최초 등장 시각과 관측된 행동입니다.',
    enemyIntelAppears: '최초 등장',
    enemyIntelNames: {
      drone: '자폭 드론',
      helicopter: '공격 헬리콥터',
      fighter: '전투기',
      boss: '공중전함',
    },
    enemyIntelCopy: {
      drone: '공중에 멈춰 있다가 기체가 가까이 오면 잠시 후 폭발한다. 빔에 닿아도 그 자리에서 불이 붙으니 레이저로 먼저 없애자.',
      helicopter: '기체가 가까이 오면 갑자기 달려들어 충돌한다. 한 번 들이받으면 물러났다가 다시 순찰한다. 왜 굳이 들이받는지는 미스터리.',
      fighter: '하늘을 빠르게 가로지르며, 기체가 가까이 있으면 현재 위치를 향해 느린 에너지 볼트를 한 발씩 발사한다.',
      boss: '지구의 최종 병기. 사방과 위아래로 느린 에너지 볼트를 흩뿌리고, 주기적으로 자폭 드론·헬리콥터·전투기를 주변에 띄운다.',
    },
    devDrill: '공중전함 모드',
    devRunNote: '공중전함 모드로 시작한 판은 랭킹에 올리지 않습니다.',
    howToTitle: 'UFO 조작법',
    howToMove: '자동 전진',
    howToAim: '마우스로 방향 조종',
    graphics: '그래픽',
    qualityHigh: '높음',
    qualityLow: '낮음',
    language: '언어',
    bgmVolume: 'BGM',
    sfxVolume: '효과음',
    soundBlocked: '소리 켜기',
    keyLeftClick: '좌클릭',
    keyRightClick: '우클릭',
    controlFly: '보는 방향으로 자동 비행',
    controlAim: '조종 · 조준',
    controlBeam: '빔 유지 · 흡수',
    controlLaser: '레이저',
    controlAutoAim: '적에 가까이 대면 자동 조준',
    controlBoost: '터보',
    touchTurbo: '터보',
    touchLaser: '레이저',
    touchBeam: '빔',
    tipTitle: '조작법',
    tipToggle: '조작법 다시 보기',
    mass: '질량',
    massHint: '빔으로 물체를 흡수해서 커지세요',
    collapseAt: '붕괴',
    life: '생명력',
    hazardBuildings: '건물에 부딪히면 [[생명력 감소]]',
    overloadHint: '무게가 가득 차면 [[느려지고 가라앉음]]',
    bossName: '공중전함',
    repairing: '수리 중',
    ceiling: '상승 한계',
    overloaded: '과적',
    overloadAlarm: '[[무게 초과 · 감속 · 하강]]',
    waterAlarm: '호수 물을 빨아들이는 중 · 속도 저하',
    clock: '남은 시간',
    score: '점수',
    wave: '웨이브',
    run: '경과',
    beam: '빔',
    beamSearching: '탐색 중',
    beamReady: '대기',
    beamLocked: '포착',
    beamPulling: '견인',
    beamAmplified: '증폭',
    weight: '무게',
    turbo: '터보',
    turboActive: '작동',
    live: '활성',
    speed: '속도',
    altitude: '고도',
    threats: '위협',
    pilotCam: '파일럿',
    tutorialPressE: '눌러서 구출',
    hold: '누르고 있기',
    mission: '미션',
    missionCopy: {
      'visit-mystery-circle': '미스터리 서클로 날아가 보기',
      'absorb-water': '빔으로 호수 물 흡수하기 (리터)',
      'absorb-samples': '빔으로 지구의 표본 흡수하기 (흡수 점수)',
      'wreck-city': '레이저로 도시를 난장판으로 만들기 (파괴 점수)',
      'final-sweep': '남은 시간 동안 점수 올리며 살아남기',
    },
    missionDebrief: {
      'visit-mystery-circle': [
        '잘 찾았다, 대원. 그게 우리 동지들이 지구에 남겨 둔 미스터리 서클이다.',
        '서클을 통과하면 기체가 순간적으로 [[가속]]하고 [[터보 게이지가 가득]] 찬다.',
        '서클 위에는 능력치를 올려 주는 부품 아이템도 떠 있으니 반드시 챙겨라.',
        '정찰 내내 서클을 경유해서 날아라. 그게 살아 돌아오는 길이다.',
      ],
      'absorb-water': [
        '물을 퍼 올렸군, 대원.',
        '물 타일 위에서 빔을 쓰면 [[기체의 속도가 대폭 저하된다]]. 물이 그만큼 무겁기 때문이다.',
        '하지만 물은 소중한 지구의 연구 데이터다. 많은 스코어를 얻을 수 있으니 보인다면 적극 흡수하도록.',
        '대신 한 칸을 [[끝까지 비우면 그 호수 전체가 말라 없어지고 만다]]. 유의하도록!',
      ],
      'absorb-samples': [
        '잘했다! 표본 수집 임무는 완수다.',
        '하지만 여기서 멈추지 마라. 계속해서 가능한 한 최대한 많이 빔으로 지구의 표본을 흡수해서 돌아오도록!',
        '많이 삼킬수록 기체도 커진다. 그게 곧 대원의 힘이다.',
      ],
      'wreck-city': [
        '잘했다! 도시 파괴 임무도 완수다.',
        '하지만 여기서 멈추지 마라. 계속해서 가능한 한 많이 레이저로 도시를 난장판으로 만들어서, 우리가 침략하기 쉽도록 해 놓고 돌아오도록!',
        '지구인들이 다시 세우기 전에 최대한 부숴라.',
      ],
      'drone-mine': [
        '대원, 앞에 붉은 구체가 보이나? 지구인들이 뿌린 자폭 드론이다.',
        '조심해라. 저건 가까이 가거나 빔에 닿으면 [[잠시 후 그 자리에서 폭발한다]]. 끌려오지는 않지만 가까이에 있다면 충분히 위험하다.',
        '안전한 순서는 하나다. 레이저(Q 또는 좌클릭)로 드론을 먼저 지우고, 그 다음에 빔(W 또는 우클릭)으로 그 일대를 훑어라.',
      ],
    },
    endingRemark: {
      recon: '완벽한 정찰이었다, 대원. 지구는 이제 우리 손안이다. 귀환을 허가한다!',
      missionFailed: '연료를 다 쓰고도 임무를 못 끝냈군, 대원. 다음 정찰에선 시간을 아껴 써라.',
      downed: '대원! 대원?! ……기체가 격추됐다. 표본은 됐으니 일단 살아서 돌아와라.',
    },
    tutorialMissionEyebrow: '장군의 첫 무전',
    tutorialMissionLead: '“대원, 공원에 남은 동포 고양이부터 구출해 봐.”',
    tutorialMissionAction: '트랙터 빔으로 고양이 구출',
    briefingTitle: '장군의 무전',
    briefingContinue: '화면을 클릭해서 계속',
    briefingSkip: '튜토리얼 건너뛰기',
    briefingWaitHint: { beam: 'W 또는 우클릭 꾹 누르기', laser: 'Q 또는 좌클릭', turbo: '스페이스를 누르기' },
    tutorialBriefing: [
      { lines: ['대원, 작전에 들어간다. 대원의 임무는 지구라는 별의 정찰대 임무다.', '기체의 연료를 전부 쓰는 [[5분]] 동안, 지구에서 최대한 많은 임무를 수행하고 돌아오도록!'] },
      { lines: ['먼저 조종이다.', '[[마우스로 조준점을 움직이면 기체가 그쪽을 보고, 보는 방향 그대로 나아간다]].', '위를 보면 올라가고 아래를 보면 내려간다. 대원이 정할 것은 방향 하나뿐이다.'] },
      { lines: ['W 버튼이나 마우스 우클릭으로 빔을 켜서 고양이 동무를 구출하거나 물체를 흡수할 수 있다.', '우리 기체는 물체를 흡수할수록 몸집이 커지니 가능한 한 많은 물체를 흡수하도록!', '그리고 [[몸집이 커질수록 빔의 힘도 세져서 더 크고 무거운 물체까지 흡수]]할 수 있게 된다.'] },
      { lines: ['Q 버튼이나 마우스 좌클릭으로 레이저를 쏘아 적을 무찌를 수 있다!', '말로만 들어서는 모른다. 지금 한 번 눌러 봐.'], wait: 'laser' },
      { lines: ['좋다, 그게 레이저다. 위급할 때 쓰도록!', '다음은 터보다. 스페이스를 누르면 기체가 훨씬 빨라진다. 지금 눌러 봐.'], wait: 'turbo' },
      { lines: ['그거다! 터보는 쓸 수 있는 시간이 정해져 있으니 주의해서 쓰도록!', '그리고 터보를 켠 채로 빔을 켜면 더 굵고 멀리, 더 강하게 나간다. 기억해 둬라.'] },
      { lines: ['대원, 첫 임무다. 저 고양이를 구출해 봐. W 키나 마우스 우클릭을 꾹 누르고 있으면 된다.', '터보를 같이 켜면 빔이 커져서 훨씬 수월할 거다.'], wait: 'beam' },
      { lines: ['좋아, 합격이다.', '명심해라, 대원. 빔에 너무 많이 매달면 [[무게 때문에 느려지고 고도가 내려간다]].', '그리고 비행 중 [[건물에 부딪혀도 생명력이 깎인다]]. 건물은 피해서 날아라!'], auto: 6.4 },
      { lines: ['왼쪽에 임무를 하나씩 띄워 둔다. 전부 다섯 개, 순서대로 처리해라.', '첫 임무 목표는 기체 위의 화살표가 가리키고 있으니 그쪽으로 날아가 봐.', '그럼 행운을 빈다.'], auto: 5.2 },
    ],
    missionStageComplete: (previous, next) => `미션 ${previous} 완료 · 다음은 미션 ${next}!`,
    reconComplete: '지구 정찰 완료 · 장군님 퇴근 준비 끝!',
    radar: '주변 탐지 · 실시간',
    radarKeyHostile: '적',
    radarKeyBoss: '공중전함',
    radarKeyWater: '호수',
    radarKeyCircle: '서클',
    survivedTitle: '지구 정찰 완료',
    missionFailedTitle: '정찰 임무 실패',
    collapsedTitle: '지구가 좀 치네?',
    survivedLead: '지구 정찰에 성공했습니다, 냐앗호!',
    missionFailedLead: '시간 내에 미션을 완수하지 못해서 지구 정찰 임무에 실패했습니다.',
    collapsedLead: '격추당해 정찰은 망했지만, 고양이 얘기는 건졌습니다',
    finalScore: '최종 점수',
    statSurvived: '생존 시간',
    statMass: '최종 질량',
    statAbsorbed: '흡수',
    statWave: '웨이브',
    retry: '다시 하기',
    rankingOpen: '랭킹 등록',
    rankingTitle: '명예의 전당',
    rankingLead: '이름을 남기면 이번 기록이 랭킹에 올라갑니다',
    rankingNameLabel: '이름',
    rankingNamePlaceholder: '이름 (최대 12자)',
    rankingSubmit: '기록하기',
    rankingSending: '전송 중...',
    rankingClose: '닫기',
    rankingTryAgain: '다시 시도',
    rankingLoading: '랭킹 불러오는 중...',
    rankingEmpty: '아직 기록이 없습니다. 첫 번째가 되어보세요!',
    rankingFailed: '기록을 전송하지 못했습니다. 다시 시도해 주세요.',
    rankingLocalNote: '시트가 연결되지 않아 이 브라우저에만 저장했습니다',
    rankingSaved: (rank: number) => `${rank}위로 기록했습니다!`,
    rankingSavedOffBoard: '기록했습니다! 아직 순위권에는 들지 못했어요.',
    rankingNameRequired: '이름을 한 글자 이상 적어주세요',
    rankingColRank: '순위',
    rankingColName: '이름',
    rankingColScore: '점수',
    rankingColTime: '시간',
    rankingYou: '나',
    msgAbsorbedPerson: (reward) => `사람 흡수 · +${reward}`,
    msgAbsorbedCat: (reward) => `고양이 구출 · +${reward}`,
    msgAbsorbedObject: (reward) => `대형 오브젝트 흡수 · +${reward}`,
    msgEnemyDown: (reward) => `적 격추 · +${reward}`,
    msgVehicleDestroyed: (reward) => `차량 파괴 · +${reward}`,
    msgLakeDrained: '호수 고갈 · 기체 성장',
    msgTurbo: '터보 가동',
    msgTurboOverload: '터보 과부하 · 잠시 사용 불가',
    msgBoonLaser: '레이저 위력 강화',
    msgBoonSpeed: '속도 강화',
    msgBoonTurnRate: '회전력 강화',
    msgBoonBeamRadius: '빔 범위 확대',
    msgBoonBeamReach: '빔 사거리 연장',
    msgBoonBeamPull: '빔 흡수 속도 강화',
    msgBoonTurboRecharge: '터보 게이지 충전 강화',
    msgBoonTurboCapacity: '터보 양 증가',
    msgBoonHeal: '생명력 회복',
    msgBoonScore: (reward) => `보너스 +${reward}`,
    msgMysteryCircle: '미스터리 서클 · 가속 · 터보 충전',
    breakingFlag: '속보',
    broadcast: [
      { headline: '미확인 비행체 도심 상공 출현', line: '속보입니다. 미확인 비행체가 도심 상공에 나타났습니다.\n시민 여러분은 각별히 주의하시기 바랍니다.' },
      { headline: '자폭 드론 투입', line: '속보입니다. 정부가 미확인 비행체를 격추하기 위해\n자폭 드론을 도심 상공에 살포했습니다.' },
      { headline: '공격 헬기 투입', line: '속보입니다. 군이 공격 헬기를 상공에 투입했습니다.\n시민 여러분은 실내로 대피하십시오.' },
      { headline: '전투기 긴급 발진', line: '속보입니다. 공군이 미확인 비행체 격추를 위해\n전투기를 긴급 발진시켰습니다.' },
      { headline: '공중전함 출격', line: '속보입니다. 더는 두고 볼 수 없다며 군이\n최종 병기 공중전함을 출격시켰습니다.' },
    ],
  },
  ja: {
    titleKicker: 'MEOWVASION',
    titleLine1: 'しんりゃく',
    titleLine2: 'するにゃん',
    tagline: '5分で地球の偵察を終えて、悠々と逃げ帰ろう',
    lobbyOrdersTag: '作戦命令',
    lobbyOrders: '5分間で偵察隊の任務を完遂せよ！',
    start: 'ゲーム開始',
    options: 'オプション',
    close: '閉じる',
    howTo: '遊び方',
    enemyIntel: '敵図鑑',
    enemyIntelEyebrow: '地球防衛軍 // 脅威資料',
    enemyIntelTitle: 'ちょっと変な敵たち',
    enemyIntelLead: '偵察時間の経過とともに投入される敵の、初出時刻と観測済みの行動です。',
    enemyIntelAppears: '初出',
    enemyIntelNames: {
      drone: '自爆ドローン',
      helicopter: '攻撃ヘリコプター',
      fighter: '戦闘機',
      boss: '空中戦艦',
    },
    enemyIntelCopy: {
      drone: '空中で静止し、機体が近づくと少しして爆発する。ビームに触れてもその場で点火するので、先にレーザーで片づけよう。',
      helicopter: '機体が近づくと突然突進して体当たりする。一度ぶつかると離れてから哨戒へ戻る。なぜそこまで体当たりしたがるのかは謎。',
      fighter: '空を高速で横切り、機体が近くにいると現在位置へ向けて遅いエネルギーボルトを一発ずつ撃つ。',
      boss: '地球の最終兵器。全方向と上下へ遅いエネルギーボルトをばら撒き、定期的に自爆ドローン・ヘリコプター・戦闘機を周囲へ展開する。',
    },
    devDrill: '空中戦艦モード',
    devRunNote: '空中戦艦モードで始めたプレイはランキングに登録されません。',
    howToTitle: 'UFO操作方法',
    howToMove: '自動前進',
    howToAim: 'マウスで方向転換',
    graphics: 'グラフィック',
    qualityHigh: '高',
    qualityLow: '低',
    language: '言語',
    bgmVolume: 'BGM',
    sfxVolume: '効果音',
    soundBlocked: 'サウンドをオン',
    keyLeftClick: '左クリック',
    keyRightClick: '右クリック',
    controlFly: '見ている方向へ自動飛行',
    controlAim: '操縦 · 照準',
    controlBeam: 'ビーム維持 · 吸収',
    controlLaser: 'レーザー',
    controlAutoAim: '敵に近づけると自動照準',
    controlBoost: 'ターボ',
    touchTurbo: 'ターボ',
    touchLaser: 'レーザー',
    touchBeam: 'ビーム',
    tipTitle: '操作方法',
    tipToggle: '操作方法をもう一度見る',
    mass: '質量',
    massHint: 'ビームで物体を吸収して大きくなろう',
    collapseAt: '崩壊',
    life: 'ライフ',
    hazardBuildings: '建物にぶつかると[[ライフが減る]]',
    overloadHint: '積載オーバーで[[減速 · 高度低下]]',
    bossName: '空中戦艦',
    repairing: '修理中',
    ceiling: '上昇限界',
    overloaded: '過積載',
    overloadAlarm: '[[重量超過 · 減速 · 高度低下]]',
    waterAlarm: '湖の水を吸収中 · 速度低下',
    clock: '残り時間',
    score: 'スコア',
    wave: 'ウェーブ',
    run: '経過',
    beam: 'ビーム',
    beamSearching: '探索中',
    beamReady: '待機',
    beamLocked: '捕捉',
    beamPulling: '牽引',
    beamAmplified: '増幅',
    weight: '重さ',
    turbo: 'ターボ',
    turboActive: '作動',
    live: '稼働',
    speed: '速度',
    altitude: '高度',
    threats: '脅威',
    pilotCam: 'パイロット',
    tutorialPressE: '押して救出',
    hold: '長押し',
    mission: 'ミッション',
    missionCopy: {
      'visit-mystery-circle': 'ミステリーサークルまで飛んでみる',
      'absorb-water': 'ビームで湖の水を吸収する (リットル)',
      'absorb-samples': 'ビームで地球の標本を吸収する (吸収スコア)',
      'wreck-city': 'レーザーで街をめちゃくちゃにする (破壊スコア)',
      'final-sweep': '残り時間でスコアを稼ぎながら生き残る',
    },
    missionDebrief: {
      'visit-mystery-circle': [
        'よく見つけた、隊員。それは仲間たちが地球に残したミステリーサークルだ。',
        'サークルを通過すると機体が一瞬[[加速]]し、[[ターボゲージが満タン]]になる。',
        'サークルの上には能力を上げる部品アイテムも浮いている。必ず回収しろ。',
        '偵察の間はサークルを経由して飛べ。それが生きて帰る道だ。',
      ],
      'absorb-water': [
        '水を汲み上げたな、隊員。',
        '水タイルの上でビームを使うと[[機体の速度が大幅に低下する]]。それだけ水が重いということだ。',
        'だが水は貴重な地球の研究データだ。多くのスコアが得られる、見つけたら積極的に吸収しろ。',
        'ただし一枚を[[飲み干すとその湖全体が涸れて消えてしまう]]。留意するように！',
      ],
      'absorb-samples': [
        'よくやった！ 標本収集の任務は完了だ。',
        'だがここで止まるな。引き続き、できる限り多くの地球の標本をビームで吸収して帰還しろ！',
        '多く飲み込むほど機体も大きくなる。それがそのまま君の力だ。',
      ],
      'wreck-city': [
        'よくやった！ 都市破壊の任務も完了だ。',
        'だがここで止まるな。引き続き、できる限りレーザーで街をめちゃくちゃにして、我々が侵略しやすい状態にしてから帰還しろ！',
        '地球人が建て直す前に壊せるだけ壊せ。',
      ],
      'drone-mine': [
        '隊員、前方の赤い球が見えるか。地球人がばら撒いた自爆ドローンだ。',
        '気をつけろ。あれは近づくかビームに触れると、[[少ししてその場で爆発する]]。引き寄せられはしないが、近くにいれば十分危険だ。',
        '安全な手順はひとつだけだ。まずレーザー（Qまたは左クリック）でドローンを消し、それからビーム（Wまたは右クリック）でその一帯を吸い上げろ。',
      ],
    },
    endingRemark: {
      recon: '完璧な偵察だった、隊員。地球はもう我々のものだ。帰還を許可する！',
      missionFailed: '燃料を使い切って任務は未完了か、隊員。次の偵察では時間を大事に使え。',
      downed: '隊員！ 隊員？！ ……機体が撃墜された。標本はもういい。まずは生きて帰ってこい。',
    },
    tutorialMissionEyebrow: '将軍の最初の通信',
    tutorialMissionLead: '「隊員、公園に残った仲間の猫から救出してみろ」',
    tutorialMissionAction: 'トラクタービームで猫を救出',
    briefingTitle: '将軍の通信',
    briefingContinue: '画面をクリックして続ける',
    briefingSkip: 'チュートリアルをスキップ',
    briefingWaitHint: { beam: 'W か右クリックを長押し', laser: 'Q か左クリック', turbo: 'スペースを押す' },
    tutorialBriefing: [
      { lines: ['隊員、作戦を開始する。君の任務は地球という星の偵察だ。', '機体の燃料を使い切る[[5分]]の間に、地球でできる限り多くの任務をこなして帰還しろ！'] },
      { lines: ['まずは操縦だ。', '[[マウスで照準を動かせば機体はそちらを向き、向いた方向へそのまま進む]]。', '上を見れば上がり、下を見れば下がる。決めるのは方向ひとつだけだ。'] },
      { lines: ['Wボタンか右クリックでビームを操作し、仲間の猫を救出したり物体を吸収したりできる。', '物体を吸収するほど機体は大きくなる。できるだけ多く吸収しろ！', 'そして[[機体が大きくなるほどビームも強くなり、より大きく重い物体まで吸収できる]]ようになる。'] },
      { lines: ['Qボタンか左クリックでレーザーを撃って敵を倒せる！', '言葉だけではわからん。今すぐ一度押してみろ。'], wait: 'laser' },
      { lines: ['よし、それがレーザーだ。緊急時に使え！', '次はターボだ。スペースを押せば機体が一気に速くなる。今、押してみろ。'], wait: 'turbo' },
      { lines: ['それだ！ ターボは使える時間に限りがある。慎重に使え！', 'そしてターボ中にビームを使うと、太く、遠く、強くなる。覚えておけ。'] },
      { lines: ['隊員、最初の任務だ。あの猫を救出しろ。Wキーか右クリックを長押しだ。', 'ターボも一緒に使えばビームが広がって楽になるぞ。'], wait: 'beam' },
      { lines: ['よし、合格だ。', 'いいか、ビームに吊るしすぎると[[重量で速度が落ち、高度も下がる]]。', 'それと飛行中に[[建物にぶつかってもライフが減る]]。建物は避けて飛べ！'], auto: 6.4 },
      { lines: ['左側に任務を一つずつ表示する。全部で五つ、順番に片付けろ。', '最初の目標は機体の上の矢印が指している。その方向へ飛べ。', '幸運を祈る。'], auto: 5.2 },
    ],
    missionStageComplete: (previous, next) => `ミッション${previous}完了 · 次はミッション${next}！`,
    reconComplete: '地球偵察完了 · 将軍も帰宅準備完了！',
    radar: '周辺探知 · リアルタイム',
    radarKeyHostile: '敵',
    radarKeyBoss: '空中戦艦',
    radarKeyWater: '湖',
    radarKeyCircle: 'サークル',
    survivedTitle: '地球偵察完了',
    missionFailedTitle: '偵察任務 失敗',
    collapsedTitle: '地球、意外とやるな',
    survivedLead: '地球偵察に成功しました、ニャッホー！',
    missionFailedLead: '時間内にミッションを達成できず、地球偵察任務は失敗しました。',
    collapsedLead: '撃墜されて偵察は失敗しましたが、猫の話だけは持ち帰れました',
    finalScore: '最終スコア',
    statSurvived: '生存時間',
    statMass: '最終質量',
    statAbsorbed: '吸収',
    statWave: 'ウェーブ',
    retry: 'もう一度',
    rankingOpen: 'ランキング登録',
    rankingTitle: '名誉の殿堂',
    rankingLead: '名前を残すと、今回の記録がランキングに載ります',
    rankingNameLabel: '名前',
    rankingNamePlaceholder: '名前 (12文字まで)',
    rankingSubmit: '登録する',
    rankingSending: '送信中...',
    rankingClose: '閉じる',
    rankingTryAgain: '再試行',
    rankingLoading: 'ランキング読み込み中...',
    rankingEmpty: 'まだ記録がありません。最初の一人になりましょう！',
    rankingFailed: '記録を送信できませんでした。もう一度お試しください。',
    rankingLocalNote: 'シート未接続のため、このブラウザにのみ保存しました',
    rankingSaved: (rank: number) => `${rank}位で登録しました！`,
    rankingSavedOffBoard: '登録しました！ 今回はランキング圏外でした。',
    rankingNameRequired: '名前を1文字以上入力してください',
    rankingColRank: '順位',
    rankingColName: '名前',
    rankingColScore: 'スコア',
    rankingColTime: '時間',
    rankingYou: '自分',
    msgAbsorbedPerson: (reward) => `人を吸収 · +${reward}`,
    msgAbsorbedCat: (reward) => `猫を救出 · +${reward}`,
    msgAbsorbedObject: (reward) => `大型オブジェクト吸収 · +${reward}`,
    msgEnemyDown: (reward) => `敵を撃破 · +${reward}`,
    msgVehicleDestroyed: (reward) => `車両を破壊 · +${reward}`,
    msgLakeDrained: '湖を干上がらせた · 機体が成長',
    msgTurbo: 'ターボ作動',
    msgTurboOverload: 'ターボ過負荷 · 一時使用不可',
    msgBoonLaser: 'レーザー威力 強化',
    msgBoonSpeed: '速度 強化',
    msgBoonTurnRate: '旋回力 強化',
    msgBoonBeamRadius: 'ビーム範囲 拡大',
    msgBoonBeamReach: 'ビーム射程 延長',
    msgBoonBeamPull: 'ビーム吸収速度 強化',
    msgBoonTurboRecharge: 'ターボ充填 強化',
    msgBoonTurboCapacity: 'ターボ容量 増加',
    msgBoonHeal: 'ライフを回復',
    msgBoonScore: (reward) => `ボーナス +${reward}`,
    msgMysteryCircle: 'ミステリーサークル · 加速 · ターボ満タン',
    breakingFlag: '速報',
    broadcast: [
      { headline: '未確認飛行物体が都心上空に出現', line: '速報です。未確認飛行物体が都心の上空に現れました。\n市民の皆さまは十分ご注意ください。' },
      { headline: '自爆ドローンを投入', line: '速報です。政府は未確認飛行物体を撃墜するため、\n自爆ドローンを都心上空に散布しました。' },
      { headline: '攻撃ヘリを投入', line: '速報です。軍が攻撃ヘリを上空に投入しました。\n市民の皆さまは屋内に避難してください。' },
      { headline: '戦闘機が緊急発進', line: '速報です。空軍が未確認飛行物体の撃墜のため、\n戦闘機を緊急発進させました。' },
      { headline: '空中戦艦が出撃', line: '速報です。もはや看過できないとして、軍が\n最終兵器の空中戦艦を出撃させました。' },
    ],
  },
  en: {
    titleKicker: 'ALIEN RECON CAT-BOT',
    titleLine1: 'MEOW',
    titleLine2: 'VASION',
    tagline: 'Finish the Earth recon inside five minutes, then slip away',
    lobbyOrdersTag: 'STANDING ORDERS',
    lobbyOrders: 'Complete the recon squad mission within 5 minutes!',
    start: 'START RECON',
    options: 'OPTIONS',
    close: 'CLOSE',
    howTo: 'HOW TO PLAY',
    enemyIntel: 'ENEMY INTEL',
    enemyIntelEyebrow: 'EARTH DEFENCE // THREAT FILES',
    enemyIntelTitle: 'SOME SLIGHTLY ODD ENEMIES',
    enemyIntelLead: 'First sightings and observed behaviour for each threat deployed as the recon clock advances.',
    enemyIntelAppears: 'FIRST SEEN',
    enemyIntelNames: {
      drone: 'SUICIDE DRONE',
      helicopter: 'ATTACK HELICOPTER',
      fighter: 'FIGHTER',
      boss: 'SKY BATTLESHIP',
    },
    enemyIntelCopy: {
      drone: 'Hangs motionless, then explodes shortly after the craft gets close. The beam also lights it in place, so clear it with the laser first.',
      helicopter: 'Suddenly charges and rams when the craft comes near. After one hit it backs off and returns to patrol. Why it insists on ramming remains a mystery.',
      fighter: 'Cuts quickly across the sky and fires slow energy bolts one at a time toward the craft’s current position whenever it is nearby.',
      boss: 'Earth’s final weapon. It scatters slow energy bolts in every direction, above and below, and regularly deploys suicide drones, helicopters and fighters around itself.',
    },
    devDrill: 'SKY BATTLESHIP MODE',
    devRunNote: 'A sky battleship mode run is not ranked.',
    howToTitle: 'UFO CONTROLS',
    howToMove: 'AUTO FORWARD',
    howToAim: 'STEER WITH THE MOUSE',
    graphics: 'GRAPHICS',
    qualityHigh: 'HIGH',
    qualityLow: 'LOW',
    language: 'LANGUAGE',
    bgmVolume: 'BGM',
    sfxVolume: 'SOUND EFFECTS',
    soundBlocked: 'TAP FOR SOUND',
    keyLeftClick: 'L-CLICK',
    keyRightClick: 'R-CLICK',
    controlFly: 'ALWAYS FLYING WHERE YOU LOOK',
    controlAim: 'STEER / AIM',
    controlBeam: 'HOLD BEAM · ABSORB',
    controlLaser: 'LASER',
    controlAutoAim: 'AUTO-AIM NEAR A TARGET',
    controlBoost: 'TURBO',
    touchTurbo: 'TURBO',
    touchLaser: 'LASER',
    touchBeam: 'BEAM',
    tipTitle: 'CONTROLS',
    tipToggle: 'Show the controls again',
    mass: 'MASS',
    massHint: 'ABSORB OBJECTS WITH THE BEAM AND GROW',
    collapseAt: 'COLLAPSE',
    life: 'LIFE',
    hazardBuildings: 'HITTING A BUILDING [[COSTS YOU LIFE]]',
    overloadHint: 'WEIGHT FULL MEANS [[SLOW AND SINKING]]',
    bossName: 'SKY BATTLESHIP',
    repairing: 'REPAIRING',
    ceiling: 'CEILING',
    overloaded: 'OVERLOADED',
    overloadAlarm: '[[OVERWEIGHT · SLOW AND SINKING]]',
    waterAlarm: 'DRAWING LAKE WATER · SLOWED',
    clock: 'CLOCK',
    score: 'SCORE',
    wave: 'WAVE',
    run: 'RUN',
    beam: 'BEAM',
    beamSearching: 'SEARCHING',
    beamReady: 'READY',
    beamLocked: 'LOCKED',
    beamPulling: 'PULLING',
    beamAmplified: 'AMPLIFIED',
    weight: 'WEIGHT',
    turbo: 'TURBO',
    turboActive: 'ACTIVE',
    live: 'LIVE',
    speed: 'SPEED',
    altitude: 'ALT',
    threats: 'THREATS',
    pilotCam: 'PILOT CAM',
    tutorialPressE: 'HOLD TO RESCUE',
    hold: 'HOLD',
    mission: 'MISSION',
    missionCopy: {
      'visit-mystery-circle': 'FLY OUT TO A MYSTERY CIRCLE',
      'absorb-water': 'ABSORB LAKE WATER WITH THE BEAM (LITRES)',
      'absorb-samples': 'ABSORB EARTH SAMPLES WITH THE BEAM (ABSORB SCORE)',
      'wreck-city': 'WRECK THE CITY WITH THE LASER (DESTRUCTION SCORE)',
      'final-sweep': 'SURVIVE THE REMAINING TIME AND RUN UP THE SCORE',
    },
    missionDebrief: {
      'visit-mystery-circle': [
        'Good find, pilot. That is a mystery circle our comrades left on Earth.',
        'Fly through one and the craft [[surges forward]] while the [[turbo gauge refills]].',
        'An upgrade part that raises your stats hovers over every circle. Always take it.',
        'Route the whole recon through the circles. That is how you get home.',
      ],
      'absorb-water': [
        'Water pumped, pilot.',
        'Running the beam over a water tile [[slows the craft down badly]]. Water is that heavy.',
        'But water is precious Earth research data. It is worth a great deal of score - absorb it wherever you see it.',
        'Only know that draining one tile [[takes the whole lake with it, for good]]. Bear that in mind!',
      ],
      'absorb-samples': [
        'Well done! The sample collection mission is complete.',
        'But do not stop here. Keep absorbing as many Earth samples as you possibly can with the beam before you come home!',
        'The more you swallow, the bigger the craft gets. That size is your strength.',
      ],
      'wreck-city': [
        'Well done! The city demolition mission is complete too.',
        'But do not stop here. Keep tearing the city apart with the laser so the invasion is easy for us, and then come home!',
        'Break everything you can before the humans rebuild it.',
      ],
      'drone-mine': [
        'Pilot, that red sphere ahead of you - that is one of the suicide drones the humans seeded.',
        'Careful. Get close or touch it with the beam and it [[explodes in place a moment later]]. It will not be pulled in, but it is still dangerous if you are nearby.',
        'There is one safe order. Clear the drone with the laser (Q or left-click) first, then sweep the area with the beam (W or right-click).',
      ],
    },
    endingRemark: {
      recon: 'A flawless recon, pilot. Earth is ours now. You are cleared to return!',
      missionFailed: 'Out of fuel with the job half done, pilot. Spend the clock better next time.',
      downed: 'Pilot! Pilot?! ...The craft is down. Forget the samples - just get home alive.',
    },
    tutorialMissionEyebrow: "THE GENERAL'S FIRST TRANSMISSION",
    tutorialMissionLead: '“Pilot, start by rescuing the allied cat left in the park.”',
    tutorialMissionAction: 'RESCUE THE CAT WITH THE TRACTOR BEAM',
    briefingTitle: "THE GENERAL'S TRANSMISSION",
    briefingContinue: 'CLICK THE SCREEN TO CONTINUE',
    briefingSkip: 'SKIP TUTORIAL',
    briefingWaitHint: { beam: 'HOLD W OR RIGHT-CLICK', laser: 'PRESS Q OR LEFT-CLICK', turbo: 'PRESS SPACE' },
    tutorialBriefing: [
      { lines: ['Pilot, begin the operation. Your mission is to recon the planet called Earth.', 'You have [[five minutes]] - one full tank - so run as many missions on Earth as you can and come home!'] },
      { lines: ['Flying first.', '[[Move the reticle with the mouse and the craft looks that way, then flies that way]].', 'Look up to climb, look down to dive. All you ever choose is where to point.'] },
      { lines: ['Press W, or right-click, to run the beam and rescue allied cats or absorb objects.', 'The craft grows as it absorbs objects, so absorb as many as possible!', 'And [[the bigger the craft, the stronger the beam - bigger, heavier things become food]].'] },
      { lines: ['Press Q, or left-click, to fire the laser and defeat enemies!', 'Being told is not the same as knowing. Press it once, right now.'], wait: 'laser' },
      { lines: ['Good, that is the laser. Save it for emergencies!', 'Turbo is next. SPACE makes the craft far faster. Press it now.'], wait: 'turbo' },
      { lines: ['That is it! Turbo time is limited, so use it carefully!', 'And running the beam while turbo is on makes it wider, longer and stronger. Remember that.'] },
      { lines: ['Pilot, this is your first mission. Rescue that cat. HOLD W, or hold right-click.', 'Run turbo at the same time and the wider beam makes it far easier.'], wait: 'beam' },
      { lines: ['Good, you pass.', 'Remember: hang too much off the beam and [[the weight slows you and drags you down]].', 'And in flight, [[hitting a building costs you life]]. Fly around them!'], auto: 6.4 },
      { lines: ['Your objectives appear on the left, one at a time. Five of them, in order.', 'The arrow above your craft points at the first one. Fly that way.', 'Good luck.'], auto: 5.2 },
    ],
    missionStageComplete: (previous, next) => `MISSION ${previous} COMPLETE · MISSION ${next} IS UP!`,
    reconComplete: 'EARTH RECON COMPLETE · THE GENERAL IS READY TO CLOCK OUT!',
    radar: 'LOCAL GRID · LIVE',
    radarKeyHostile: 'HOSTILE',
    radarKeyBoss: 'BATTLESHIP',
    radarKeyWater: 'LAKE',
    radarKeyCircle: 'CIRCLE',
    survivedTitle: 'EARTH RECON COMPLETE',
    missionFailedTitle: 'RECON MISSION FAILED',
    collapsedTitle: 'NOT BAD, EARTH',
    survivedLead: 'Earth recon successful. Meow-hoo!',
    missionFailedLead: 'The clock ran out with the mission unfinished. Earth recon failed.',
    collapsedLead: 'Shot down, so the recon failed - but at least you brought back the cat story',
    finalScore: 'FINAL SCORE',
    statSurvived: 'SURVIVED',
    statMass: 'FINAL MASS',
    statAbsorbed: 'ABSORBED',
    statWave: 'WAVE',
    retry: 'FLY AGAIN',
    rankingOpen: 'SUBMIT SCORE',
    rankingTitle: 'HALL OF FAME',
    rankingLead: 'Sign this run and it goes on the board',
    rankingNameLabel: 'NAME',
    rankingNamePlaceholder: 'NAME (12 CHARS MAX)',
    rankingSubmit: 'RECORD IT',
    rankingSending: 'SENDING...',
    rankingClose: 'CLOSE',
    rankingTryAgain: 'TRY AGAIN',
    rankingLoading: 'LOADING BOARD...',
    rankingEmpty: 'NO RECORDS YET. BE THE FIRST!',
    rankingFailed: 'COULD NOT SEND THE RECORD. TRY AGAIN.',
    rankingLocalNote: 'NO SHEET CONNECTED - SAVED TO THIS BROWSER ONLY',
    rankingSaved: (rank: number) => `RECORDED AT #${rank}!`,
    rankingSavedOffBoard: 'RECORDED! JUST OFF THE BOARD THIS TIME.',
    rankingNameRequired: 'ENTER AT LEAST ONE CHARACTER',
    rankingColRank: 'RANK',
    rankingColName: 'NAME',
    rankingColScore: 'SCORE',
    rankingColTime: 'TIME',
    rankingYou: 'YOU',
    msgAbsorbedPerson: (reward) => `PERSON ABSORBED · +${reward}`,
    msgAbsorbedCat: (reward) => `CAT RESCUED · +${reward}`,
    msgAbsorbedObject: (reward) => `LARGE OBJECT ABSORBED · +${reward}`,
    msgEnemyDown: (reward) => `ENEMY DOWN · +${reward}`,
    msgVehicleDestroyed: (reward) => `VEHICLE DESTROYED · +${reward}`,
    msgLakeDrained: 'LAKE DRAINED · CRAFT GREW',
    msgTurbo: 'TURBO ENGAGED',
    msgTurboOverload: 'TURBO OVERLOAD · OFFLINE BRIEFLY',
    msgBoonLaser: 'LASER POWER UP',
    msgBoonSpeed: 'SPEED UP',
    msgBoonTurnRate: 'TURN RATE UP',
    msgBoonBeamRadius: 'BEAM SPREAD UP',
    msgBoonBeamReach: 'BEAM RANGE UP',
    msgBoonBeamPull: 'BEAM PULL UP',
    msgBoonTurboRecharge: 'TURBO RECHARGE UP',
    msgBoonTurboCapacity: 'TURBO CAPACITY UP',
    msgBoonHeal: 'LIFE RESTORED',
    msgBoonScore: (reward) => `BONUS +${reward}`,
    msgMysteryCircle: 'MYSTERY CIRCLE · SURGE · TURBO REFILLED',
    breakingFlag: 'BREAKING',
    broadcast: [
      { headline: 'UFO SIGHTED OVER THE CITY', line: 'Breaking news. An unidentified craft has appeared over the city.\nResidents are urged to take care.' },
      { headline: 'SUICIDE DRONES DEPLOYED', line: 'Breaking news. The government has seeded the sky with suicide\ndrones to bring the unidentified craft down.' },
      { headline: 'ATTACK HELICOPTERS UP', line: 'Breaking news. The military has put attack helicopters\nin the air. Residents are urged to stay indoors.' },
      { headline: 'FIGHTERS SCRAMBLED', line: 'Breaking news. The air force has scrambled fighters\nto shoot the unidentified craft down.' },
      { headline: 'SKY BATTLESHIP LAUNCHED', line: 'Breaking news. Unwilling to stand by any longer, the military\nhas launched its last resort - the sky battleship.' },
    ],
  },
}

export function readStoredLanguage(): Language {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE
  try {
    const stored = window.localStorage.getItem('ufo-attack-language')
    return LANGUAGES.includes(stored as Language) ? (stored as Language) : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

export function storeLanguage(language: Language) {
  try {
    window.localStorage.setItem('ufo-attack-language', language)
  } catch {
    // Losing the preference is not worth failing the switch.
  }
}
