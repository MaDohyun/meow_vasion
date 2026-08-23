import type { UpgradeId } from './core/upgrades'
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
 */

export const LANGUAGES = ['ko', 'ja', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

export const LANGUAGE_LABELS: Record<Language, string> = {
  ko: '한국어',
  ja: '日本語',
  en: 'English',
}

export const DEFAULT_LANGUAGE: Language = 'ko'

type Strings = {
  titleKicker: string
  titleLine1: string
  titleLine2: string
  tagline: string
  start: string
  options: string
  close: string
  howTo: string
  howToTitle: string
  howToMove: string
  howToAim: string
  graphics: string
  qualityHigh: string
  qualityLow: string
  language: string
  bgmVolume: string
  sfxVolume: string
  controlFly: string
  controlStrafe: string
  controlAim: string
  controlBeam: string
  controlLaser: string
  controlBoost: string
  mass: string
  massHint: string
  collapseAt: string
  hull: string
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
  drag: string
  slowdown: string
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
  tutorialBriefing: readonly TutorialBriefingStep[]
  missionStageComplete: (previous: number, next: number) => string
  reconComplete: string
  shield: string
  radar: string
  survivedTitle: string
  collapsedTitle: string
  survivedLead: string
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
  breakingFlag: string
  broadcast: BulletinSet
  upgradeTitle: string
  upgradeLead: string
  upgradeHint: string
  upgradeLevel: string
  upgradeMaxed: string
  upgrades: Record<UpgradeId, UpgradeCopy>
}

export type TutorialBriefingStep = {
  lines: readonly string[]
  wait?: 'beam'
  auto?: number
}

/** One upgrade card's wording. The card itself is data in core/upgrades. */
export type UpgradeCopy = { name: string; detail: string }

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
type BulletinSet = readonly [Bulletin, Bulletin, Bulletin, Bulletin, Bulletin, Bulletin, Bulletin, Bulletin]

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
    start: '게임 시작',
    options: '옵션',
    close: '닫기',
    howTo: '하는 방법',
    howToTitle: 'UFO CONTROLS',
    howToMove: '이동',
    howToAim: '마우스 조준',
    graphics: '그래픽',
    qualityHigh: '높음',
    qualityLow: '낮음',
    language: '언어',
    bgmVolume: 'BGM',
    sfxVolume: '효과음',
    controlFly: '보는 방향으로 비행',
    controlStrafe: '좌우 이동',
    controlAim: '조종 · 조준',
    controlBeam: '빔 유지 · 흡수',
    controlLaser: '레이저',
    controlBoost: '터보',
    mass: '질량',
    massHint: '사람은 흡수하고, 고양이는 구출해서 커지세요',
    collapseAt: '붕괴',
    hull: '선체',
    bossName: '공중전함',
    repairing: '수리 중',
    ceiling: '상승 한계',
    overloaded: '과적',
    overloadAlarm: '무게가 높습니다. 고도 유지 불가. 무게를 줄이세요.',
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
    drag: '항력',
    slowdown: '감속',
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
      'absorb-water': '호수 물 쪽 빨아보기',
      'ruin-buildings': '건물을 폐허로 리모델링',
      'destroy-gas-station': '주유소 불꽃놀이',
      'destroy-comms': '지구 통신 끊어놓기',
      'destroy-drones': '드론은 Q 연속 레이저로 톡톡',
      'destroy-fighters': '전투기 격추하기',
      'absorb-rooftop-structures': '옥상 구조물 흡수하기',
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
    briefingSkip: '건너뛰기',
    tutorialBriefing: [
      { lines: ['대원, 작전에 들어간다. 대원의 임무는 지구라는 별의 정찰대 임무다.', '지구에서 많은 샘플을 가지고 돌아오도록!'] },
      { lines: ['E 버튼을 누르면 빔 조작을 통해 고양이 동무를 구출하거나 물체를 흡수할 수 있다.', '우리 우주선은 물체를 흡수할수록 몸집이 커지니 가능한 한 많은 물체를 흡수하도록!'] },
      { lines: ['Q 버튼을 누르면 레이저를 쏘아 적을 무찌를 수 있다!', '위급할 때 쓰도록!'] },
      { lines: ['스페이스 버튼을 누르면 우주선의 터보를 쓸 수 있다!', '하지만 쓸 수 있는 시간은 정해져 있으니 주의해서 쓰도록!'] },
      { lines: ['대원, 첫 임무다. 저 고양이를 구출해 봐. E 키를 꾹 누르고 있으면 돼.'], wait: 'beam' },
      { lines: ['좋아, 합격이다.', '명심해라, 대원. 너무 많은 물건을 흡수하려고 하면 우주선이 추락하고 만다.'], auto: 4.6 },
      { lines: ['왼쪽에 대원이 달성해야 할 임무들을 표시해 두었다.', '아 참, 대원을 위해 우리 동지들의 표식을 지구 곳곳에 준비했으니 발견하면 지나가 보도록!', '그럼 행운을 빈다.'], auto: 5.2 },
    ],
    missionStageComplete: (previous, next) => `미션 ${previous} 완료 · 미션 ${next}, 골라서 해!`,
    reconComplete: '지구 정찰 완료 · 장군님 퇴근 준비 끝!',
    shield: '쉴드',
    radar: '주변 탐지 · 실시간',
    survivedTitle: '지구 정찰 완료',
    collapsedTitle: '지구가 좀 치네?',
    survivedLead: '장군님이 보고서를 대충 읽고 아주 만족했습니다',
    collapsedLead: '정찰은 망했지만 고양이 얘기는 건졌습니다',
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
    bandArmorNote: '전차 사격권',
    bandAaNote: '대공 미사일 사격권',
    msgRunStart: '대원, 저 고양이부터 구출해 봐. E키면 돼.',
    msgAbsorbedPerson: (reward) => `사람 흡수 · +${reward}`,
    msgAbsorbedCat: (reward) => `고양이 구출 · +${reward}`,
    msgAbsorbedObject: (reward) => `대형 오브젝트 흡수 · +${reward}`,
    msgEnemyDown: (reward) => `적 격추 · +${reward}`,
    msgCarLaunched: '자동차 파괴 · +50',
    msgTurbo: '터보 가동',
    msgTurboOverload: '터보 과부하 · 잠시 사용 불가',
    breakingFlag: '속보',
    broadcast: [
      { headline: '미확인 비행물체 도심 출현', line: '속보입니다. 미확인 비행물체가 도심 상공에 출현했습니다.\n정부는 요격을 위해 자폭 드론을 배치했습니다.' },
      { headline: '자폭 드론 대규모 접근', line: '속보입니다. 대규모 자폭 드론 편대가\n도심 상공으로 접근하고 있습니다.' },
      { headline: '공격 헬기 투입', line: '속보입니다. 공격 헬기가 상공에 투입됐습니다.\n시민 여러분은 실내로 대피하십시오.' },
      { headline: '공중 대응 강화', line: '속보입니다. 공격 헬기 편대가 증원돼\n도심 전역을 봉쇄하고 있습니다.' },
      { headline: '전투기 긴급 발진', line: '속보입니다. 공군이 UFO 격추를 위해\n전투기를 긴급 발진시켰습니다.' },
      { headline: '대공 방어망 가동', line: '속보입니다. 도심 전역에 대공 방어망이 가동됐습니다.\n저공 비행체를 요격합니다.' },
      { headline: '기갑 부대 진입', line: '속보입니다. 기갑 부대가\n시내로 진입했습니다.' },
      { headline: '공중전함 출격', line: '속보입니다. 군이 최종 병기 공중전함을 출격시켰습니다.\n하늘을 뒤덮은 함체가 도심으로 향하고 있습니다.' },
    ],
    upgradeTitle: '강화 선택',
    upgradeLead: '흡수한 만큼 기체가 진화합니다. 하나를 고르세요.',
    upgradeHint: '클릭 또는 1 / 2 / 3',
    upgradeLevel: 'Lv',
    upgradeMaxed: '최대',
    upgrades: {
      'laser-power': { name: '레이저 위력', detail: '한 단계마다 피해량 +20%. 지구 건물도 이제 얌전하지 않습니다.' },
      shield: { name: '쉴드', detail: '선체 앞에 초록 쉴드 1칸. 맞지 않으면 알아서 다시 찹니다.' },
      'beam-radius': { name: '빔 범위', detail: '빔 반경 +15%. 기체가 커져도 범위는 이 카드로만 늘어납니다.' },
      'beam-grip': { name: '빔 흡수력', detail: '흡수력 +1. 숫자가 무게보다 높을수록 덜 낑낑댑니다.' },
      lift: { name: '양력', detail: '들고 버틸 수 있는 총 무게 +2. 욕심도 비행 기술입니다.' },
      speed: { name: '속도', detail: '기본 최고속도가 소폭 올라갑니다.' },
      'turbo-recharge': { name: '터보 게이지', detail: '터보 재충전 속도가 빨라집니다.' },
      'turbo-capacity': { name: '터보 양', detail: '터보 지속시간 +1.5초. 도망은 길수록 좋습니다.' },
      turn: { name: '회전력', detail: '마우스 추종 회전 응답 +15%.' },
    },
  },
  ja: {
    titleKicker: 'MEOWVASION',
    titleLine1: 'しんりゃく',
    titleLine2: 'するにゃん',
    tagline: 'できるだけ長く生き延びて街を破壊しよう',
    start: 'ゲーム開始',
    options: 'オプション',
    close: '閉じる',
    howTo: '遊び方',
    howToTitle: 'UFO CONTROLS',
    howToMove: '移動',
    howToAim: 'マウス照準',
    graphics: 'グラフィック',
    qualityHigh: '高',
    qualityLow: '低',
    language: '言語',
    bgmVolume: 'BGM',
    sfxVolume: '効果音',
    controlFly: '見ている方向へ飛行',
    controlStrafe: '左右移動',
    controlAim: '操縦・照準',
    controlBeam: 'ビーム維持・吸収',
    controlLaser: 'レーザー',
    controlBoost: 'ターボ',
    mass: '質量',
    massHint: '人は吸収、猫は救出して大きくなろう',
    collapseAt: '崩壊',
    hull: '船体',
    bossName: '空中戦艦',
    repairing: '修理中',
    ceiling: '上昇限界',
    overloaded: '過積載',
    overloadAlarm: '重量超過。高度を維持できません。重量を減らしてください。',
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
    drag: '抗力',
    slowdown: '減速',
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
      'absorb-water': '湖の水を吸い上げる',
      'ruin-buildings': '建物を廃墟にリフォーム',
      'destroy-gas-station': 'ガソリンスタンド花火',
      'destroy-comms': '地球の通信を断つ',
      'destroy-drones': 'ドローンをQの連続レーザーで撃つ',
      'destroy-fighters': '戦闘機を撃墜する',
      'absorb-rooftop-structures': '屋上設備を吸収する',
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
    briefingSkip: 'スキップ',
    tutorialBriefing: [
      { lines: ['隊員、作戦を開始する。君の任務は地球という星の偵察だ。', '地球からできるだけ多くのサンプルを持ち帰れ！'] },
      { lines: ['Eボタンでビームを操作し、仲間の猫を救出したり物体を吸収できる。', '物体を吸収するほど機体は大きくなる。できるだけ多く吸収しろ！'] },
      { lines: ['Qボタンでレーザーを撃ち、敵を倒せる！', '緊急時に使うんだ！'] },
      { lines: ['スペースボタンで機体のターボを使える！', '使える時間には限りがある。慎重に使え！'] },
      { lines: ['隊員、最初の任務だ。あの猫を救出しろ。Eキーを長押しだ。'], wait: 'beam' },
      { lines: ['よし、合格だ。', 'いいか、物体を吸収しすぎると宇宙船は墜落する。'], auto: 4.6 },
      { lines: ['左側に達成すべき任務を表示している。', 'そうだ、仲間の印を地球各地に用意した。見つけたら通過してみろ！', '幸運を祈る。'], auto: 5.2 },
    ],
    missionStageComplete: (previous, next) => `ミッション${previous}完了 · ミッション${next}、好きなものを選べ！`,
    reconComplete: '地球偵察完了 · 将軍も帰宅準備完了！',
    shield: 'シールド',
    radar: '周辺探知・リアルタイム',
    survivedTitle: '地球偵察完了',
    collapsedTitle: '地球、意外とやるな',
    survivedLead: '将軍は報告書を半分しか読まず、大満足です',
    collapsedLead: '偵察は失敗。でも猫の話は持ち帰れます',
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
    bandArmorNote: '戦車の射程',
    bandAaNote: '対空ミサイルの射程',
    msgRunStart: '隊員、まずあの猫を救出しろ。Eキーだ。',
    msgAbsorbedPerson: (reward) => `人を吸収 · +${reward}`,
    msgAbsorbedCat: (reward) => `猫を救出 · +${reward}`,
    msgAbsorbedObject: (reward) => `大型オブジェクト吸収 · +${reward}`,
    msgEnemyDown: (reward) => `敵を撃破 · +${reward}`,
    msgCarLaunched: '車を破壊 · +50',
    msgTurbo: 'ターボ作動',
    msgTurboOverload: 'ターボ過負荷 · 一時使用不可',
    breakingFlag: '速報',
    broadcast: [
      { headline: '未確認飛行物体が都心に出現', line: '速報です。未確認飛行物体が都心の上空に出現しました。\n政府は迎撃のため自爆ドローンを配備しました。' },
      { headline: '自爆ドローンの大群が接近', line: '速報です。自爆ドローンの大編隊が\n都心上空へ接近しています。' },
      { headline: '攻撃ヘリを投入', line: '速報です。攻撃ヘリが上空に投入されました。\n市民の皆さまは屋内に避難してください。' },
      { headline: '航空対応を強化', line: '速報です。攻撃ヘリ部隊が増援され、\n都心全域を封鎖しています。' },
      { headline: '戦闘機が緊急発進', line: '速報です。空軍がUFO撃墜のため、\n戦闘機を緊急発進させました。' },
      { headline: '対空防衛網が稼働', line: '速報です。都心全域で対空防衛網が稼働しました。\n低空の飛行体を迎撃します。' },
      { headline: '機甲部隊が市内に進入', line: '速報です。機甲部隊が\n市内に進入しました。' },
      { headline: '空中戦艦が出撃', line: '速報です。軍が最終兵器の空中戦艦を出撃させました。\n空を覆う艦体が都心へ向かっています。' },
    ],
    upgradeTitle: '強化選択',
    upgradeLead: '吸収した分だけ機体が進化します。ひとつ選んでください。',
    upgradeHint: 'クリック または 1 / 2 / 3',
    upgradeLevel: 'Lv',
    upgradeMaxed: '最大',
    upgrades: {
      'laser-power': { name: 'レーザー威力', detail: 'レベルごとにダメージ+20%。' },
      shield: { name: 'シールド', detail: '船体の前に再生するシールドを1つ追加。' },
      'beam-radius': { name: 'ビーム範囲', detail: 'ビーム半径+15%。' },
      'beam-grip': { name: '吸引力', detail: '整数の吸引力+1。' },
      lift: { name: '揚力', detail: '運べる総重量+2。' },
      speed: { name: '速度', detail: '基本最高速度が少し上がります。' },
      'turbo-recharge': { name: 'ターボ充填', detail: 'ターボの回復が速くなります。' },
      'turbo-capacity': { name: 'ターボ容量', detail: 'ターボ持続時間+1.5秒。' },
      turn: { name: '旋回力', detail: 'マウス追従の旋回応答+15%。' },
    },
  },
  en: {
    titleKicker: 'ALIEN RECON CAT-BOT',
    titleLine1: 'MEOW',
    titleLine2: 'VASION',
    tagline: 'Survive as long as you can and tear the city apart',
    start: 'START SURVIVAL',
    options: 'OPTIONS',
    close: 'CLOSE',
    howTo: 'HOW TO PLAY',
    howToTitle: 'UFO CONTROLS',
    howToMove: 'MOVE',
    howToAim: 'MOUSE AIM',
    graphics: 'GRAPHICS',
    qualityHigh: 'HIGH',
    qualityLow: 'LOW',
    language: 'LANGUAGE',
    bgmVolume: 'BGM',
    sfxVolume: 'SOUND EFFECTS',
    controlFly: 'FLY WHERE YOU LOOK',
    controlStrafe: 'RIGHT / LEFT',
    controlAim: 'STEER / AIM',
    controlBeam: 'HOLD BEAM · ABSORB',
    controlLaser: 'LASER',
    controlBoost: 'TURBO BOOST',
    mass: 'MASS',
    massHint: 'ABSORB PEOPLE, RESCUE CATS, GROW',
    collapseAt: 'COLLAPSE',
    hull: 'HULL',
    bossName: 'SKY DREADNOUGHT',
    repairing: 'REPAIRING',
    ceiling: 'CEILING',
    overloaded: 'OVERLOADED',
    overloadAlarm: 'WEIGHT TOO HIGH. LOSING ALTITUDE. REDUCE YOUR LOAD.',
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
    drag: 'DRAG',
    slowdown: 'SLOWDOWN',
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
      'absorb-water': 'SUCK UP LAKE WATER',
      'ruin-buildings': 'REMODEL BUILDINGS INTO RUINS',
      'destroy-gas-station': 'GAS STATION FIREWORKS',
      'destroy-comms': 'CUT EARTH COMMUNICATIONS',
      'destroy-drones': 'TAP DRONES WITH Q LASERS',
      'destroy-fighters': 'SHOOT DOWN FIGHTERS',
      'absorb-rooftop-structures': 'ABSORB ROOFTOP STRUCTURES',
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
    briefingSkip: 'SKIP',
    tutorialBriefing: [
      { lines: ['Pilot, begin the operation. Your mission is to recon the planet called Earth.', 'Bring back as many samples from Earth as you can!'] },
      { lines: ['Press E to use the beam to rescue allied cats or absorb objects.', 'The craft grows as it absorbs objects, so absorb as many as possible!'] },
      { lines: ['Press Q to fire the laser and defeat enemies!', 'Save it for emergencies!'] },
      { lines: ['Press SPACE to use the craft\'s turbo!', 'Turbo time is limited, so use it carefully!'] },
      { lines: ['Pilot, this is your first mission. Rescue that cat. HOLD E.'], wait: 'beam' },
      { lines: ['Good, you pass.', 'Remember: absorb too much and the spacecraft will crash.'], auto: 4.6 },
      { lines: ['Your objectives are displayed on the left.', 'We placed allied marks all over Earth. Pass through them when you find them!', 'Good luck.'], auto: 5.2 },
    ],
    missionStageComplete: (previous, next) => `MISSION ${previous} COMPLETE · MISSION ${next}, PICK YOUR OBJECTIVES!`,
    reconComplete: 'EARTH RECON COMPLETE · THE GENERAL IS READY TO CLOCK OUT!',
    shield: 'SHIELD',
    radar: 'LOCAL GRID · LIVE',
    survivedTitle: 'EARTH RECON COMPLETE',
    collapsedTitle: 'EARTH HAD NOTES',
    survivedLead: 'The general skimmed the report and loved every word',
    collapsedLead: 'Recon failed, but at least you brought back the cat story',
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
    bandArmor: 'ARMOR BAND',
    bandAa: 'AA BAND',
    bandGroundNote: 'GROUND UNITS LIVE',
    bandArmorNote: 'TANKS LIVE',
    bandAaNote: 'MISSILES LIVE',
    msgRunStart: 'PILOT, RESCUE THAT CAT FIRST. HOLD E.',
    msgAbsorbedPerson: (reward) => `PERSON ABSORBED · +${reward}`,
    msgAbsorbedCat: (reward) => `CAT RESCUED · +${reward}`,
    msgAbsorbedObject: (reward) => `LARGE OBJECT ABSORBED · +${reward}`,
    msgEnemyDown: (reward) => `ENEMY DOWN · +${reward}`,
    msgCarLaunched: 'CAR LAUNCHED · +50',
    msgTurbo: 'TURBO ENGAGED',
    msgTurboOverload: 'TURBO OVERLOAD · OFFLINE BRIEFLY',
    breakingFlag: 'BREAKING',
    broadcast: [
      { headline: 'UFO SIGHTED OVER THE CITY', line: 'Breaking news. An unidentified craft has appeared over the city.\nThe government has deployed suicide drones to intercept it.' },
      { headline: 'DRONE SWARM INBOUND', line: 'Breaking news. A large formation of suicide drones\nis closing on the city centre.' },
      { headline: 'ATTACK HELICOPTERS UP', line: 'Breaking news. Attack helicopters are now airborne.\nResidents are urged to stay indoors.' },
      { headline: 'AIR RESPONSE ESCALATES', line: 'Breaking news. Reinforced helicopter formations\nare locking down the downtown districts.' },
      { headline: 'FIGHTERS SCRAMBLED', line: 'Breaking news. The air force has scrambled fighters\nto shoot the UFO down.' },
      { headline: 'AIR DEFENCE ONLINE', line: 'Breaking news. The city-wide air defence network is online\nand engaging low-flying craft.' },
      { headline: 'ARMOUR ROLLS IN', line: 'Breaking news. Armoured units\nhave entered the city.' },
      { headline: 'SKY DREADNOUGHT LAUNCHED', line: 'Breaking news. The military has launched its last resort.\nA flying battleship is now bearing down on the city centre.' },
    ],
    upgradeTitle: 'UPGRADE',
    upgradeLead: 'What you absorbed has changed the craft. Take one.',
    upgradeHint: 'click or 1 / 2 / 3',
    upgradeLevel: 'Lv',
    upgradeMaxed: 'MAX',
    upgrades: {
      'laser-power': { name: 'LASER POWER', detail: '+20% damage per level.' },
      shield: { name: 'SHIELD', detail: 'Adds one regenerating shield pip ahead of the hull.' },
      'beam-radius': { name: 'BEAM RANGE', detail: '+15% beam radius.' },
      'beam-grip': { name: 'PULL STRENGTH', detail: '+1 integer pull strength.' },
      lift: { name: 'LIFT', detail: '+2 total hanging-weight capacity.' },
      speed: { name: 'SPEED', detail: 'A small increase to base top speed.' },
      'turbo-recharge': { name: 'TURBO RECHARGE', detail: 'Refills turbo faster.' },
      'turbo-capacity': { name: 'TURBO CAPACITY', detail: '+1.5 seconds of turbo.' },
      turn: { name: 'TURN RESPONSE', detail: '+15% mouse-following turn response.' },
    },
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
