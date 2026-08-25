import type { MissionQuestId } from './core/missions'
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
 * skimmed past - "the weight will crash you", "a building hit damages the
 * hull". `<RichText>` renders those in the warning colour. The brackets live
 * in the string rather than in the component because which words matter is a
 * translation decision: Korean, Japanese and English put the verb in
 * different places, and only the translator knows where the warning lands.
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
  controlFly: string
  controlStrafe: string
  controlAim: string
  controlMove: string
  controlBeam: string
  controlLaser: string
  controlBoost: string
  /** The in-run control card: its heading, and the label on the button that
   *  calls it back once it has folded itself away. */
  tipTitle: string
  tipToggle: string
  mass: string
  massHint: string
  collapseAt: string
  hull: string
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
   *  the symptom, not the thing on the bar. */
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
  crushedTitle: string
  crushedLead: string
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
  bandGround: string
  bandArmor: string
  bandAa: string
  bandGroundNote: string
  bandArmorNote: string
  bandAaNote: string
  msgRunStart: string
  msgAbsorbedPerson: (reward: number) => string
  msgAbsorbedCat: (reward: number) => string
  msgAbsorbedObject: (reward: number) => string
  msgEnemyDown: (reward: number) => string
  msgCarLaunched: string
  msgTurbo: string
  msgTurboOverload: string
  /** The mystery-circle pickup callouts. One per stat, one for the heal a
   *  fully-upgraded craft gets instead, one for the score fallback. */
  msgBoonLaser: (level: number) => string
  msgBoonSpeed: (level: number) => string
  msgBoonTurboRecharge: (level: number) => string
  msgBoonTurboCapacity: (level: number) => string
  msgBoonHeal: string
  msgBoonScore: (reward: number) => string
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
    lobbyOrders: '5분 동안 정찰대 임무를 완수하세요!',
    start: '게임 시작',
    options: '옵션',
    close: '닫기',
    howTo: '하는 방법',
    devDrill: '개발자 모드 · 전함으로',
    devRunNote: '개발자 모드로 시작한 판은 랭킹에 올리지 않습니다.',
    howToTitle: 'UFO CONTROLS',
    howToMove: '이동',
    howToAim: '마우스 조준',
    graphics: '그래픽',
    qualityHigh: '높음',
    qualityLow: '낮음',
    language: '언어',
    bgmVolume: 'BGM',
    sfxVolume: '효과음',
    soundBlocked: '소리 켜기',
    controlFly: '보는 방향으로 비행',
    controlStrafe: '좌우 이동',
    controlAim: '조종 · 조준',
    controlMove: '이동',
    controlBeam: '빔 유지 · 흡수',
    controlLaser: '레이저',
    controlBoost: '터보',
    tipTitle: '조작법',
    tipToggle: '조작법 다시 보기',
    mass: '질량',
    massHint: '사람은 흡수하고, 고양이는 구출해서 커지세요',
    collapseAt: '붕괴',
    hull: '선체',
    life: '생명',
    hazardBuildings: '건물에 부딪히면 [[선체 손상]]',
    overloadHint: '무게가 가득 차면 [[추락]]',
    bossName: '공중전함',
    repairing: '수리 중',
    ceiling: '상승 한계',
    overloaded: '과적',
    overloadAlarm: '[[무게 초과 · 추락 위험]] 무게를 줄이세요!',
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
      'capture-cats': '동포 고양이 구출! (아직 지구에 남은 동료가 있어)',
      'capture-people': '지구인 표본 챙기기',
      'destroy-cars': '승용차를 깡통으로 만들기',
      'destroy-trucks': '트럭 해체 쇼',
      'destroy-tankers': '유조차 불꽃놀이',
      'absorb-water': '호수 물 쪽 빨아보기',
      'ruin-buildings': '건물을 폐허로 리모델링',
      'destroy-comms': '지구 통신 끊어놓기',
      'destroy-drones': '드론은 Q 연속 레이저로 톡톡',
      'destroy-fighters': '전투기 격추하기',
      'absorb-rooftop-structures': '옥상 구조물 흡수하기',
      'absorb-trees': '나무 쏙쏙 뽑아 먹기',
      'absorb-streetlights': '가로등 뽑아 챙기기',
      'pass-mystery-circles': '서로 다른 미스터리 서클 지나가기',
      'air-checkpoints': '원모양 체크포인트 3번 통과하기',
      'destroy-battleship': '저 큰 전함 치우기',
      'reach-score': '보고서용 점수 채우기',
      'survive-final': '퇴근 시간까지 버티기',
    },
    tutorialMissionEyebrow: '장군의 첫 무전',
    tutorialMissionLead: '“대원, 공원에 남은 동포 고양이부터 구출해 봐.”',
    tutorialMissionAction: '트랙터 빔으로 고양이 구출',
    briefingTitle: '장군의 무전',
    briefingContinue: '화면을 클릭해서 계속',
    briefingSkip: '튜토리얼 건너뛰기',
    briefingWaitHint: { beam: 'E 를 꾹 누르기', laser: 'Q 를 누르기', turbo: '스페이스 를 누르기' },
    tutorialBriefing: [
      { lines: ['대원, 작전에 들어간다. 대원의 임무는 지구라는 별의 정찰대 임무다.', '지구에서 많은 샘플을 가지고 돌아오도록!'] },
      { lines: ['E 버튼을 누르면 빔 조작을 통해 고양이 동무를 구출하거나 물체를 흡수할 수 있다.', '우리 우주선은 물체를 흡수할수록 몸집이 커지니 가능한 한 많은 물체를 흡수하도록!'] },
      { lines: ['Q 버튼을 누르면 레이저를 쏘아 적을 무찌를 수 있다!', '말로만 들어서는 모른다. 지금 Q를 한 번 눌러 봐.'], wait: 'laser' },
      { lines: ['좋다, 그게 레이저다. 위급할 때 쓰도록!', '다음은 터보다. 스페이스를 누르면 우주선이 훨씬 빨라진다. 지금 눌러 봐.'], wait: 'turbo' },
      { lines: ['그거다! 터보는 쓸 수 있는 시간이 정해져 있으니 주의해서 쓰도록!', '그리고 터보를 켠 채로 E를 누르면 빔이 더 굵고 멀리, 더 강하게 나간다. 기억해 둬라.'] },
      { lines: ['대원, 첫 임무다. 저 고양이를 구출해 봐. E 키를 꾹 누르고 있으면 된다.', '터보를 같이 켜면 빔이 커져서 훨씬 수월할 거다.'], wait: 'beam' },
      { lines: ['좋아, 합격이다.', '명심해라, 대원. 너무 많은 물건을 흡수하면 [[무게 때문에 우주선이 추락한다]].', '그리고 비행 중 [[건물에 부딪혀도 선체가 손상된다]]. 건물은 피해서 날아라!'], auto: 6.4 },
      { lines: ['왼쪽에 대원이 달성해야 할 임무들을 표시해 두었다.', '아 참, 대원을 위해 우리 동지들의 표식을 지구 곳곳에 준비했으니 발견하면 지나가 보도록!', '그럼 행운을 빈다.'], auto: 5.2 },
    ],
    missionStageComplete: (previous, next) => `미션 ${previous} 완료 · 미션 ${next}, 골라서 해!`,
    reconComplete: '지구 정찰 완료 · 장군님 퇴근 준비 끝!',
    radar: '주변 탐지 · 실시간',
    radarKeyHostile: '적',
    radarKeyBoss: '공중전함',
    radarKeyWater: '호수',
    radarKeyCircle: '서클',
    survivedTitle: '지구 정찰 완료',
    missionFailedTitle: '정찰 임무 실패',
    collapsedTitle: '지구가 좀 치네?',
    survivedLead: '지구 정찰에 성공했습니다 냐앗호!',
    missionFailedLead: '시간내에 미션을 완수하지 못해서 지구 정찰 임무에 실패했습니다.',
    collapsedLead: '정찰은 망했지만 고양이 얘기는 건졌습니다',
    crushedTitle: '무게에 눌려 추락',
    crushedLead: '빔에 매단 짐이 출력을 이겼습니다. 끝내 무게를 감당하지 못한 접시는 짐과 함께 지면에 처박혔습니다.',
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
    bandGround: '지상 고도',
    bandArmor: '중간 고도',
    bandAa: '고공',
    bandGroundNote: '지상군 사격권',
    bandArmorNote: '전투기 사격권',
    bandAaNote: '대공 미사일 사격권',
    msgRunStart: '대원, 저 고양이부터 구출해 봐. E키면 돼.',
    msgAbsorbedPerson: (reward) => `사람 흡수 · +${reward}`,
    msgAbsorbedCat: (reward) => `고양이 구출 · +${reward}`,
    msgAbsorbedObject: (reward) => `대형 오브젝트 흡수 · +${reward}`,
    msgEnemyDown: (reward) => `적 격추 · +${reward}`,
    msgCarLaunched: '자동차 파괴 · +50',
    msgTurbo: '터보 가동',
    msgTurboOverload: '터보 과부하 · 잠시 사용 불가',
    msgBoonLaser: (level) => `레이저 위력 Lv.${level}`,
    msgBoonSpeed: (level) => `속도 Lv.${level}`,
    msgBoonTurboRecharge: (level) => `터보 게이지 충전 Lv.${level}`,
    msgBoonTurboCapacity: (level) => `터보 양 Lv.${level}`,
    msgBoonHeal: '선체 회복',
    msgBoonScore: (reward) => `보너스 +${reward}`,
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
    tagline: 'できるだけ長く生き延びて街を破壊しよう',
    lobbyOrdersTag: '作戦命令',
    lobbyOrders: '5分間で偵察隊の任務を完遂せよ！',
    start: 'ゲーム開始',
    options: 'オプション',
    close: '閉じる',
    howTo: '遊び方',
    devDrill: '開発者モード · 戦艦へ',
    devRunNote: '開発者モードで始めたプレイはランキングに登録されません。',
    howToTitle: 'UFO CONTROLS',
    howToMove: '移動',
    howToAim: 'マウス照準',
    graphics: 'グラフィック',
    qualityHigh: '高',
    qualityLow: '低',
    language: '言語',
    bgmVolume: 'BGM',
    sfxVolume: '効果音',
    soundBlocked: 'サウンドをオン',
    controlFly: '見ている方向へ飛行',
    controlStrafe: '左右移動',
    controlAim: '操縦・照準',
    controlMove: '移動',
    controlBeam: 'ビーム維持・吸収',
    controlLaser: 'レーザー',
    controlBoost: 'ターボ',
    tipTitle: '操作方法',
    tipToggle: '操作方法をもう一度見る',
    mass: '質量',
    massHint: '人は吸収、猫は救出して大きくなろう',
    collapseAt: '崩壊',
    hull: '船体',
    life: 'ライフ',
    hazardBuildings: '建物にぶつかると[[船体が損傷]]',
    overloadHint: '重さが満タンで[[墜落]]',
    bossName: '空中戦艦',
    repairing: '修理中',
    ceiling: '上昇限界',
    overloaded: '過積載',
    overloadAlarm: '[[重量超過・墜落の危険]] 重量を減らせ！',
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
      'capture-cats': '仲間の猫を救出！ (まだ地球に仲間がいる)',
      'capture-people': '地球人の標本を集める',
      'destroy-cars': '乗用車をブリキにする',
      'destroy-trucks': 'トラック解体ショー',
      'destroy-tankers': 'タンクローリー花火',
      'absorb-water': '湖の水を吸い上げる',
      'ruin-buildings': '建物を廃墟にリフォーム',
      'destroy-comms': '地球の通信を断つ',
      'destroy-drones': 'ドローンをQの連続レーザーで撃つ',
      'destroy-fighters': '戦闘機を撃墜する',
      'absorb-rooftop-structures': '屋上設備を吸収する',
      'absorb-trees': '木を引き抜いて吸収する',
      'absorb-streetlights': '街灯を抜いて回収する',
      'pass-mystery-circles': '別々のミステリーサークルを通過する',
      'air-checkpoints': '円形チェックポイントを3回通過する',
      'destroy-battleship': 'あの大きな戦艦を片付ける',
      'reach-score': '報告用スコアを稼ぐ',
      'survive-final': '退勤時間まで生き残る',
    },
    tutorialMissionEyebrow: '将軍の最初の通信',
    tutorialMissionLead: '「隊員、公園に残った仲間の猫から救出してみろ。」',
    tutorialMissionAction: 'トラクタービームで猫を救出',
    briefingTitle: '将軍の通信',
    briefingContinue: '画面をクリックして続ける',
    briefingSkip: 'チュートリアルをスキップ',
    briefingWaitHint: { beam: 'E を長押し', laser: 'Q を押す', turbo: 'スペース を押す' },
    tutorialBriefing: [
      { lines: ['隊員、作戦を開始する。君の任務は地球という星の偵察だ。', '地球からできるだけ多くのサンプルを持ち帰れ！'] },
      { lines: ['Eボタンでビームを操作し、仲間の猫を救出したり物体を吸収できる。', '物体を吸収するほど機体は大きくなる。できるだけ多く吸収しろ！'] },
      { lines: ['Qボタンでレーザーを撃ち、敵を倒せる！', '口で言ってもわからん。今すぐQを一度押してみろ。'], wait: 'laser' },
      { lines: ['よし、それがレーザーだ。緊急時に使え！', '次はターボだ。スペースを押せば機体が一気に速くなる。今、押してみろ。'], wait: 'turbo' },
      { lines: ['それだ！ ターボは使える時間に限りがある。慎重に使え！', 'そしてターボ中にEを押すと、ビームが太く、遠く、強くなる。覚えておけ。'] },
      { lines: ['隊員、最初の任務だ。あの猫を救出しろ。Eキーを長押しだ。', 'ターボも一緒に使えばビームが広がって楽になるぞ。'], wait: 'beam' },
      { lines: ['よし、合格だ。', 'いいか、物体を吸収しすぎると[[重量で宇宙船が墜落する]]。', 'それと飛行中に[[建物にぶつかっても船体が損傷する]]。建物は避けて飛べ！'], auto: 6.4 },
      { lines: ['左側に達成すべき任務を表示している。', 'そうだ、仲間の印を地球各地に用意した。見つけたら通過してみろ！', '幸運を祈る。'], auto: 5.2 },
    ],
    missionStageComplete: (previous, next) => `ミッション${previous}完了 · ミッション${next}、好きなものを選べ！`,
    reconComplete: '地球偵察完了 · 将軍も帰宅準備完了！',
    radar: '周辺探知・リアルタイム',
    radarKeyHostile: '敵',
    radarKeyBoss: '空中戦艦',
    radarKeyWater: '湖',
    radarKeyCircle: 'サークル',
    survivedTitle: '地球偵察完了',
    missionFailedTitle: '偵察任務 失敗',
    collapsedTitle: '地球、意外とやるな',
    survivedLead: '地球偵察に成功しました、ニャッホー！',
    missionFailedLead: '時間内にミッションを達成できず、地球偵察任務は失敗しました。',
    collapsedLead: '偵察は失敗。でも猫の話は持ち帰れます',
    crushedTitle: '重量に負けて墜落',
    crushedLead: 'ビームに吊るした荷が出力を上回りました。重さに耐えきれず、機体は荷ごと地面に突っ込みました。',
    finalScore: '最終スコア',
    statSurvived: '生存時間',
    statMass: '最終質量',
    statAbsorbed: '吸収',
    statWave: 'ウェーブ',
    retry: 'もう一度',
    rankingOpen: 'ランキング登録',
    rankingTitle: '殿堂',
    rankingLead: '名前を残すと、今回の記録がランキングに載ります',
    rankingNameLabel: '名前',
    rankingNamePlaceholder: '名前 (12文字まで)',
    rankingSubmit: '登録する',
    rankingSending: '送信中...',
    rankingClose: '閉じる',
    rankingTryAgain: '再試行',
    rankingLoading: 'ランキング読み込み中...',
    rankingEmpty: 'まだ記録がありません。最初の一人になりましょう!',
    rankingFailed: '記録を送信できませんでした。もう一度お試しください。',
    rankingLocalNote: 'シート未接続のため、このブラウザにのみ保存しました',
    rankingSaved: (rank: number) => `${rank}位で登録しました!`,
    rankingSavedOffBoard: '登録しました! 今回はランク圏外です。',
    rankingNameRequired: '名前を1文字以上入力してください',
    rankingColRank: '順位',
    rankingColName: '名前',
    rankingColScore: 'スコア',
    rankingColTime: '時間',
    rankingYou: '自分',
    bandGround: '地上高度',
    bandArmor: '中間高度',
    bandAa: '高高度',
    bandGroundNote: '地上部隊の射程',
    bandArmorNote: '戦闘機の射程',
    bandAaNote: '対空ミサイルの射程',
    msgRunStart: '隊員、まずあの猫を救出しろ。Eキーだ。',
    msgAbsorbedPerson: (reward) => `人を吸収 · +${reward}`,
    msgAbsorbedCat: (reward) => `猫を救出 · +${reward}`,
    msgAbsorbedObject: (reward) => `大型オブジェクト吸収 · +${reward}`,
    msgEnemyDown: (reward) => `敵を撃破 · +${reward}`,
    msgCarLaunched: '車を破壊 · +50',
    msgTurbo: 'ターボ作動',
    msgTurboOverload: 'ターボ過負荷 · 一時使用不可',
    msgBoonLaser: (level) => `レーザー威力 Lv.${level}`,
    msgBoonSpeed: (level) => `速度 Lv.${level}`,
    msgBoonTurboRecharge: (level) => `ターボ充填 Lv.${level}`,
    msgBoonTurboCapacity: (level) => `ターボ容量 Lv.${level}`,
    msgBoonHeal: '船体を回復',
    msgBoonScore: (reward) => `ボーナス +${reward}`,
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
    tagline: 'Survive as long as you can and tear the city apart',
    lobbyOrdersTag: 'STANDING ORDERS',
    lobbyOrders: 'Complete the recon squad mission within 5 minutes!',
    start: 'START SURVIVAL',
    options: 'OPTIONS',
    close: 'CLOSE',
    howTo: 'HOW TO PLAY',
    devDrill: 'DEV · JUMP TO BATTLESHIP',
    devRunNote: 'A developer drill run is not ranked.',
    howToTitle: 'UFO CONTROLS',
    howToMove: 'MOVE',
    howToAim: 'MOUSE AIM',
    graphics: 'GRAPHICS',
    qualityHigh: 'HIGH',
    qualityLow: 'LOW',
    language: 'LANGUAGE',
    bgmVolume: 'BGM',
    sfxVolume: 'SOUND EFFECTS',
    soundBlocked: 'TAP FOR SOUND',
    controlFly: 'FLY WHERE YOU LOOK',
    controlStrafe: 'RIGHT / LEFT',
    controlAim: 'STEER / AIM',
    controlMove: 'MOVE',
    controlBeam: 'HOLD BEAM · ABSORB',
    controlLaser: 'LASER',
    controlBoost: 'TURBO BOOST',
    tipTitle: 'CONTROLS',
    tipToggle: 'Show the controls again',
    mass: 'MASS',
    massHint: 'ABSORB PEOPLE, RESCUE CATS, GROW',
    collapseAt: 'COLLAPSE',
    hull: 'HULL',
    life: 'LIFE',
    hazardBuildings: 'HITTING A BUILDING [[DAMAGES THE HULL]]',
    overloadHint: 'WEIGHT FULL MEANS [[A CRASH]]',
    bossName: 'SKY DREADNOUGHT',
    repairing: 'REPAIRING',
    ceiling: 'CEILING',
    overloaded: 'OVERLOADED',
    overloadAlarm: '[[OVERWEIGHT · ABOUT TO CRASH]] DROP SOME CARGO!',
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
      'capture-cats': 'RESCUE ALLIED CATS! (YOUR CREW IS STILL DOWN THERE)',
      'capture-people': 'COLLECT HUMAN SAMPLES',
      'destroy-cars': 'TURN SEDANS INTO SCRAP',
      'destroy-trucks': 'PUT ON A TRUCK DISASSEMBLY SHOW',
      'destroy-tankers': 'TANKER TRUCK FIREWORKS',
      'absorb-water': 'SUCK UP LAKE WATER',
      'ruin-buildings': 'REMODEL BUILDINGS INTO RUINS',
      'destroy-comms': 'CUT EARTH COMMUNICATIONS',
      'destroy-drones': 'TAP DRONES WITH Q LASERS',
      'destroy-fighters': 'SHOOT DOWN FIGHTERS',
      'absorb-rooftop-structures': 'ABSORB ROOFTOP STRUCTURES',
      'absorb-trees': 'UPROOT AND EAT TREES',
      'absorb-streetlights': 'PLUCK UP STREETLIGHTS',
      'pass-mystery-circles': 'PASS THROUGH DIFFERENT MYSTERY CIRCLES',
      'air-checkpoints': 'PASS THROUGH 3 ROUND CHECKPOINTS',
      'destroy-battleship': 'TAKE OUT THAT BIG BATTLESHIP',
      'reach-score': 'FILL THE REPORT SCORE',
      'survive-final': 'SURVIVE UNTIL QUITTING TIME',
    },
    tutorialMissionEyebrow: "THE GENERAL'S FIRST TRANSMISSION",
    tutorialMissionLead: '“Pilot, start by rescuing the allied cat left in the park.”',
    tutorialMissionAction: 'RESCUE THE CAT WITH THE TRACTOR BEAM',
    briefingTitle: "THE GENERAL'S TRANSMISSION",
    briefingContinue: 'CLICK THE SCREEN TO CONTINUE',
    briefingSkip: 'SKIP TUTORIAL',
    briefingWaitHint: { beam: 'HOLD E', laser: 'PRESS Q', turbo: 'PRESS SPACE' },
    tutorialBriefing: [
      { lines: ['Pilot, begin the operation. Your mission is to recon the planet called Earth.', 'Bring back as many samples from Earth as you can!'] },
      { lines: ['Press E to use the beam to rescue allied cats or absorb objects.', 'The craft grows as it absorbs objects, so absorb as many as possible!'] },
      { lines: ['Press Q to fire the laser and defeat enemies!', 'Being told is not the same as knowing. Press Q once, right now.'], wait: 'laser' },
      { lines: ['Good, that is the laser. Save it for emergencies!', 'Turbo is next. SPACE makes the craft far faster. Press it now.'], wait: 'turbo' },
      { lines: ['That is it! Turbo time is limited, so use it carefully!', 'And holding E while turbo is on makes the beam wider, longer and stronger. Remember that.'] },
      { lines: ['Pilot, this is your first mission. Rescue that cat. HOLD E.', 'Run turbo at the same time and the wider beam makes it far easier.'], wait: 'beam' },
      { lines: ['Good, you pass.', 'Remember: absorb too much and [[the weight will crash the craft]].', 'And in flight, [[hitting a building damages the hull]]. Fly around them!'], auto: 6.4 },
      { lines: ['Your objectives are displayed on the left.', 'We placed allied marks all over Earth. Pass through them when you find them!', 'Good luck.'], auto: 5.2 },
    ],
    missionStageComplete: (previous, next) => `MISSION ${previous} COMPLETE · MISSION ${next}, PICK YOUR OBJECTIVES!`,
    reconComplete: 'EARTH RECON COMPLETE · THE GENERAL IS READY TO CLOCK OUT!',
    radar: 'LOCAL GRID · LIVE',
    radarKeyHostile: 'Hostile',
    radarKeyBoss: 'Dreadnought',
    radarKeyWater: 'Lake',
    radarKeyCircle: 'Circle',
    survivedTitle: 'EARTH RECON COMPLETE',
    missionFailedTitle: 'RECON MISSION FAILED',
    collapsedTitle: 'EARTH HAD NOTES',
    survivedLead: 'Earth recon successful. Meow-hoo!',
    missionFailedLead: 'The clock ran out with the mission unfinished. Earth recon failed.',
    collapsedLead: 'Recon failed, but at least you brought back the cat story',
    crushedTitle: 'CRUSHED BY THE LOAD',
    crushedLead: 'What hung off the beam outweighed the engines. The craft could not carry it, and rode the load into the ground.',
    finalScore: 'FINAL SCORE',
    statSurvived: 'SURVIVED',
    statMass: 'FINAL MASS',
    statAbsorbed: 'ABSORBED',
    statWave: 'WAVE',
    retry: 'RAID AGAIN',
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
    bandGround: 'GROUND BAND',
    bandArmor: 'MID BAND',
    bandAa: 'AA BAND',
    bandGroundNote: 'GROUND UNITS LIVE',
    bandArmorNote: 'FIGHTERS LIVE',
    bandAaNote: 'MISSILES LIVE',
    msgRunStart: 'PILOT, RESCUE THAT CAT FIRST. HOLD E.',
    msgAbsorbedPerson: (reward) => `PERSON ABSORBED · +${reward}`,
    msgAbsorbedCat: (reward) => `CAT RESCUED · +${reward}`,
    msgAbsorbedObject: (reward) => `LARGE OBJECT ABSORBED · +${reward}`,
    msgEnemyDown: (reward) => `ENEMY DOWN · +${reward}`,
    msgCarLaunched: 'CAR LAUNCHED · +50',
    msgTurbo: 'TURBO ENGAGED',
    msgTurboOverload: 'TURBO OVERLOAD · OFFLINE BRIEFLY',
    msgBoonLaser: (level) => `LASER POWER LV.${level}`,
    msgBoonSpeed: (level) => `SPEED LV.${level}`,
    msgBoonTurboRecharge: (level) => `TURBO RECHARGE LV.${level}`,
    msgBoonTurboCapacity: (level) => `TURBO CAPACITY LV.${level}`,
    msgBoonHeal: 'HULL RESTORED',
    msgBoonScore: (reward) => `BONUS +${reward}`,
    breakingFlag: 'BREAKING',
    broadcast: [
      { headline: 'UFO SIGHTED OVER THE CITY', line: 'Breaking news. An unidentified craft has appeared over the city.\nResidents are urged to take care.' },
      { headline: 'SUICIDE DRONES DEPLOYED', line: 'Breaking news. The government has seeded the sky with suicide\ndrones to bring the unidentified craft down.' },
      { headline: 'ATTACK HELICOPTERS UP', line: 'Breaking news. The military has put attack helicopters\nin the air. Residents are urged to stay indoors.' },
      { headline: 'FIGHTERS SCRAMBLED', line: 'Breaking news. The air force has scrambled fighters\nto shoot the unidentified craft down.' },
      { headline: 'SKY DREADNOUGHT LAUNCHED', line: 'Breaking news. Unwilling to stand by any longer, the military\nhas launched its last resort - a flying battleship.' },
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
