import type { UpgradeId } from './core/upgrades'
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
 * Wave names ("POLICE DISPATCH" and friends) stay in English on purpose: they
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
  graphics: string
  qualityHigh: string
  qualityLow: string
  language: string
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
  msgImpact: string
  msgDetonated: string
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
    graphics: '그래픽',
    qualityHigh: '높음',
    qualityLow: '낮음',
    language: '언어',
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
    msgImpact: '피격 · 질량 감소',
    msgDetonated: '폭발물 기폭 · 질량 감소',
    msgCarLaunched: '자동차 파괴 · +50',
    msgTurbo: '터보 가동',
    msgTurboOverload: '터보 과부하 · 잠시 사용 불가',
    breakingFlag: '속보',
    broadcast: [
      { headline: '미확인 비행물체 도심 출현', line: '속보입니다. 미확인 비행물체가 도심 상공에 출현했습니다.\n정부는 요격을 위해 자폭 드론을 배치했습니다.' },
      { headline: '경찰 총력 대응', line: '속보입니다. 경찰이 전 병력에 비상을 걸고\n도심으로 향하고 있습니다.' },
      { headline: '경찰 헬기 투입', line: '속보입니다. 경찰 헬기가 상공에 투입됐습니다.\n시민 여러분은 실내로 대피하십시오.' },
      { headline: '군 병력 도심 전개', line: '속보입니다. 군 병력이\n도심 전역에 전개됐습니다.' },
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
    graphics: 'グラフィック',
    qualityHigh: '高',
    qualityLow: '低',
    language: '言語',
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
    msgImpact: '被弾 · 質量減少',
    msgDetonated: '爆発物が起爆 · 質量減少',
    msgCarLaunched: '車を破壊 · +50',
    msgTurbo: 'ターボ作動',
    msgTurboOverload: 'ターボ過負荷 · 一時使用不可',
    breakingFlag: '速報',
    broadcast: [
      { headline: '未確認飛行物体が都心に出現', line: '速報です。未確認飛行物体が都心の上空に出現しました。\n政府は迎撃のため自爆ドローンを配備しました。' },
      { headline: '警察が総力対応', line: '速報です。警察が全部隊に非常態勢を敷き、\n都心へ向かっています。' },
      { headline: '警察ヘリを投入', line: '速報です。警察ヘリが上空に投入されました。\n市民の皆さまは屋内に避難してください。' },
      { headline: '軍部隊が都心に展開', line: '速報です。軍の部隊が\n都心全域に展開しました。' },
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
    graphics: 'GRAPHICS',
    qualityHigh: 'HIGH',
    qualityLow: 'LOW',
    language: 'LANGUAGE',
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
    bandGround: 'GROUND BAND',
    bandArmor: 'ARMOR BAND',
    bandAa: 'AA BAND',
    bandGroundNote: 'GROUND UNITS LIVE',
    bandArmorNote: 'TANKS LIVE',
    bandAaNote: 'MISSILES LIVE',
    msgRunStart: 'SOLDIER, RESCUE THAT CAT FIRST. HOLD E.',
    msgAbsorbedPerson: (reward) => `PERSON ABSORBED · +${reward}`,
    msgAbsorbedCat: (reward) => `CAT RESCUED · +${reward}`,
    msgAbsorbedObject: (reward) => `LARGE OBJECT ABSORBED · +${reward}`,
    msgEnemyDown: (reward) => `ENEMY DOWN · +${reward}`,
    msgImpact: 'IMPACT · SIZE DOWN',
    msgDetonated: 'EXPLOSIVE DETONATED · SIZE DOWN',
    msgCarLaunched: 'CAR LAUNCHED · +50',
    msgTurbo: 'TURBO ENGAGED',
    msgTurboOverload: 'TURBO OVERLOAD · OFFLINE BRIEFLY',
    breakingFlag: 'BREAKING',
    broadcast: [
      { headline: 'UFO SIGHTED OVER THE CITY', line: 'Breaking news. An unidentified craft has appeared over the city.\nThe government has deployed suicide drones to intercept it.' },
      { headline: 'POLICE ON FULL ALERT', line: 'Breaking news. Police have called up every available unit\nand are moving into the city centre.' },
      { headline: 'POLICE HELICOPTERS UP', line: 'Breaking news. Police helicopters are now airborne.\nResidents are urged to stay indoors.' },
      { headline: 'ARMY DEPLOYS DOWNTOWN', line: 'Breaking news. Army units have deployed\nacross the downtown districts.' },
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
