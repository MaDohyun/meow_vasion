/**
 * 침략할거냥 랭킹 백엔드 (Google Apps Script)
 *
 * 이 파일은 저장소에서는 실행되지 않습니다. 랭킹을 담을 구글 스프레드시트에
 * 붙여넣어 웹 앱으로 배포하면, 게임이 그 URL로 기록을 보내고 읽어옵니다.
 * 설치 방법은 README의 "랭킹 · 구글 스프레드시트 연동"을 보세요.
 *
 * 설계 메모
 * - 시트가 곧 데이터베이스입니다. 한 행이 한 기록이고, 첫 행은 헤더입니다.
 *   사람이 시트를 직접 열어 정렬하거나 지워도 게임이 깨지지 않아야 하므로,
 *   읽을 때마다 값을 다시 검증하고 다시 정렬합니다.
 * - 클라이언트(src/core/leaderboard.ts)와 같은 규칙으로 이름을 다듬고 같은
 *   기준으로 정렬합니다. 한쪽만 고치면 두 화면이 서로 다른 순위를 보여주므로
 *   규칙을 바꿀 때는 반드시 양쪽을 같이 고쳐야 합니다.
 * - Apps Script 웹 앱은 OPTIONS(프리플라이트)에 응답하지 않습니다. 그래서
 *   게임은 JSON을 text/plain으로 보내고, 여기서는 e.postData.contents를 직접
 *   파싱합니다.
 */

/** 기록이 쌓이는 시트 이름. 없으면 처음 요청 때 헤더와 함께 만들어집니다. */
var SHEET_NAME = 'ranking'
/** 한 번에 돌려주는 최대 행 수. 게임 화면이 보여주는 양과 같습니다. */
var DEFAULT_LIMIT = 20
var MAX_LIMIT = 100
/** 이름 길이 상한. src/core/leaderboard.ts의 NAME_MAX_LENGTH와 같아야 합니다. */
var NAME_MAX_LENGTH = 12

/**
 * 로그로 남겨 두는 최대 기록 수. 이보다 많아지면 점수가 낮은 쪽부터 지웁니다.
 *
 * 상한이 필요한 이유는 두 가지입니다. 하나는 순위표가 시트 전체를 읽어 정렬
 * 하므로 행이 무한히 늘면 응답이 느려진다는 것이고, 다른 하나는 이 주소가
 * 공개라 누구나 기록을 밀어 넣을 수 있다는 것입니다. 상한이 없으면 장난으로
 * 보낸 수천 건이 시트를 채우고 순위표를 망가뜨립니다.
 *
 * 모든 판을 하나도 빠짐없이 남기고 싶다면 0으로 두세요. 대신 시트가 계속
 * 커지고, MAX_SCAN_ROWS를 넘어가면 넘친 만큼은 순위 계산에서 빠집니다.
 */
var MAX_STORED_ROWS = 2000
/** 정리를 시작하는 지점. 매번 정리하지 않으려고 여유를 둡니다. */
var PRUNE_TRIGGER_ROWS = 2400
/** 한 번에 읽는 행의 안전 상한. 위 정리 지점보다 넉넉히 높게 둡니다. */
var MAX_SCAN_ROWS = 10000

/**
 * 받아들이는 점수의 천장.
 *
 * 자물쇠가 아니라 과속방지턱입니다. 주소가 공개라 누구든 점수를 지어내 보낼
 * 수 있고 그건 서버 없이는 막을 수 없습니다. 다만 천장이 있으면 조작을 해도
 * "그럴듯한 점수"까지만 올라가서, 9999999999 같은 값이 1위에 박혀 순위표
 * 자체를 못 쓰게 되는 일은 없습니다. 실제 플레이로 닿을 수 있는 값보다 훨씬
 * 높게 잡았으니 정상 기록이 걸릴 일은 없습니다.
 */
var MAX_SCORE = 10000000
/** 생존 시간과 웨이브도 같은 이유로 현실적인 범위로 자릅니다. */
var MAX_SURVIVAL_TIME = 86400
var MAX_WAVE_STAGE = 99
/** 정상 본문은 200바이트 남짓입니다. 그보다 훨씬 큰 것은 읽지 않습니다. */
var MAX_BODY_BYTES = 4096

var HEADERS = ['recordedAt', 'name', 'score', 'survivalTime', 'waveStage', 'victory', 'savedAtIso']

/** 랭킹을 읽습니다. GET /exec?limit=20 */
function doGet(e) {
  try {
    var limit = clampLimit(e && e.parameter ? e.parameter.limit : null)
    return json({ ok: true, entries: readEntries(limit) })
  } catch (error) {
    return json({ ok: false, error: String(error) })
  }
}

/** 기록을 남깁니다. 본문은 JSON 한 덩어리입니다. */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) return json({ ok: false, error: 'empty body' })
    if (e.postData.contents.length > MAX_BODY_BYTES) return json({ ok: false, error: 'body too large' })
    var body = JSON.parse(e.postData.contents)
    var name = sanitizeName(body.name)
    if (!name) return json({ ok: false, error: 'name required' })

    var entry = {
      recordedAt: clamp(toInteger(body.recordedAt, Date.now()), 0, 4102444800000),
      name: name,
      score: clamp(toInteger(body.score, 0), 0, MAX_SCORE),
      survivalTime: clamp(toNumber(body.survivalTime, 0), 0, MAX_SURVIVAL_TIME),
      waveStage: clamp(toInteger(body.waveStage, 0), 0, MAX_WAVE_STAGE),
      victory: body.victory === true || body.victory === 'true',
    }

    // 잠금은 "찾아보고 없으면 쓴다"를 한 덩어리로 묶기 위한 것입니다. 게임은
    // 응답이 늦으면 다시 보낼 수 있고, 그때 두 요청이 겹치면 검사를 둘 다
    // 통과해 행이 두 개 생깁니다. 그러면 플레이어 한 명이 순위표를 두 줄
    // 차지합니다. recordedAt은 게임이 만든 밀리초 단위 시각이라 같은 기록의
    // 재전송인지 새 기록인지 구별하는 열쇠가 됩니다.
    var lock = LockService.getScriptLock()
    lock.waitLock(20000)
    try {
      var sheet = getSheet()
      if (!hasEntry(sheet, entry)) {
        sheet.appendRow([
          entry.recordedAt,
          // 이름만 글자로 고정합니다. 아래 textCell 주석을 보세요.
          textCell(entry.name),
          entry.score,
          entry.survivalTime,
          entry.waveStage,
          entry.victory,
          new Date().toISOString(),
        ])
        pruneIfNeeded(sheet)
        SpreadsheetApp.flush()
      }
    } finally {
      lock.releaseLock()
    }

    var limit = clampLimit(body.limit)
    var entries = readEntries(limit)
    return json({ ok: true, entries: entries, rank: rankOf(entries, entry) })
  } catch (error) {
    return json({ ok: false, error: String(error) })
  }
}

function getSheet() {
  var book = SpreadsheetApp.getActiveSpreadsheet()
  var sheet = book.getSheetByName(SHEET_NAME)
  if (!sheet) {
    sheet = book.insertSheet(SHEET_NAME)
    sheet.appendRow(HEADERS)
    sheet.setFrozenRows(1)
    // 이름 칸은 처음부터 "일반 텍스트" 서식으로 둡니다. textCell과 함께
    // 쓰는 이중 잠금이고, 시트를 사람이 직접 편집할 때도 적용됩니다.
    sheet.getRange('B:B').setNumberFormat('@')
  }
  return sheet
}

/**
 * 이름을 수식이 아니라 글자로 저장합니다.
 *
 * 스프레드시트는 `=`, `+`, `-`, `@`로 시작하는 문자열을 수식으로 읽습니다.
 * 이름은 플레이어가 자유롭게 적는 값이므로, 그대로 넣으면 남이 적은 글자가
 * 내 시트에서 실행되는 셀이 됩니다. 앞에 작은따옴표를 붙이면 시트가 "이건
 * 글자다"로 받아들이고, 다시 읽을 때 따옴표는 빠지므로 순위표에 보이는
 * 이름은 플레이어가 적은 그대로입니다.
 *
 * 남는 구멍이 하나 있습니다. 시트를 CSV로 내려받아 엑셀에서 열면 따옴표가
 * 사라진 뒤라 엑셀이 다시 수식으로 읽습니다. 이름이 12자로 잘려 있어 의미
 * 있는 수식이 들어갈 자리가 없다는 점이 실질적인 방어선이므로,
 * NAME_MAX_LENGTH를 늘릴 때는 이 점을 같이 따져봐야 합니다.
 */
function textCell(value) {
  if (typeof value !== 'string') return value
  return /^[=+\-@\t\r]/.test(value) ? "'" + value : value
}

/**
 * 로그가 너무 길어지면 점수가 낮은 쪽부터 지웁니다.
 *
 * 순위표는 시트 전체를 읽어 정렬하므로, 상한이 없으면 기록이 쌓일수록 느려
 * 지고 결국 MAX_SCAN_ROWS를 넘겨 새 기록이 순위 계산에서 빠집니다. 주소가
 * 공개라 아무나 기록을 밀어 넣을 수 있다는 점을 생각하면 그 상태는 남이
 * 만들어 낼 수도 있는 상태입니다.
 *
 * 다시 쓸 때도 이름은 textCell을 거칩니다. 읽어 온 값은 이미 따옴표가 빠진
 * 상태라, 그대로 되돌려 쓰면 이번에는 수식으로 저장되기 때문입니다.
 */
function pruneIfNeeded(sheet) {
  if (MAX_STORED_ROWS <= 0) return
  var count = sheet.getLastRow() - 1
  if (count <= PRUNE_TRIGGER_ROWS) return

  var range = sheet.getRange(2, 1, count, HEADERS.length)
  var values = range.getValues()
  var rows = []
  for (var i = 0; i < values.length; i++) {
    var score = Number(values[i][2])
    if (!sanitizeName(values[i][1]) || !isFinite(score)) continue
    rows.push({
      raw: values[i],
      score: score,
      survivalTime: toNumber(values[i][3], 0),
      recordedAt: toInteger(values[i][0], 0),
    })
  }
  rows.sort(compareEntries)

  var keep = []
  for (var k = 0; k < rows.length && k < MAX_STORED_ROWS; k++) {
    var raw = rows[k].raw
    raw[1] = textCell(raw[1])
    keep.push(raw)
  }
  range.clearContent()
  if (keep.length) sheet.getRange(2, 1, keep.length, HEADERS.length).setValues(keep)
}

/**
 * 이 기록이 이미 시트에 있는지 봅니다.
 *
 * 마지막 몇 줄만 보지 않고 전체를 훑습니다. 정리(pruneIfNeeded)가 돌면 방금
 * 넣은 줄도 점수 순으로 자리를 옮기기 때문에, "최근 줄"이라는 가정이 정리
 * 직후에 깨지고 재전송이 중복 행으로 남습니다. 로그는 MAX_STORED_ROWS로
 * 묶여 있으므로 전체를 읽어도 호출 한 번입니다.
 */
function hasEntry(sheet, entry) {
  var lastRow = sheet.getLastRow()
  if (lastRow < 2) return false
  var span = Math.min(lastRow - 1, MAX_SCAN_ROWS)
  var values = sheet.getRange(2, 1, span, 2).getValues()
  for (var i = 0; i < values.length; i++) {
    if (toInteger(values[i][0], 0) === entry.recordedAt && sanitizeName(values[i][1]) === entry.name) return true
  }
  return false
}

/**
 * 시트를 읽어 정렬된 랭킹으로 만듭니다.
 *
 * 값이 이상한 행은 고치지 않고 버립니다. 손으로 편집한 시트에서 점수 칸에
 * 글자가 들어가면 0점짜리 유령 기록이 순위표에 남는데, 그건 게임의 버그처럼
 * 보이기 때문입니다.
 */
function readEntries(limit) {
  var sheet = getSheet()
  var lastRow = sheet.getLastRow()
  if (lastRow < 2) return []
  var rows = Math.min(lastRow - 1, MAX_SCAN_ROWS)
  var values = sheet.getRange(2, 1, rows, HEADERS.length).getValues()

  var entries = []
  for (var i = 0; i < values.length; i++) {
    var row = values[i]
    var name = sanitizeName(row[1])
    if (!name) continue
    var score = Number(row[2])
    if (!isFinite(score)) continue
    // 쓸 때와 같은 천장을 읽을 때도 적용합니다. 시트를 손으로 고쳐 넣은 값과
    // 천장을 올리기 전에 저장된 값이 순위표를 밀어내지 않게 하기 위해서입니다.
    entries.push({
      recordedAt: toInteger(row[0], 0),
      name: name,
      score: clamp(Math.floor(score), 0, MAX_SCORE),
      survivalTime: clamp(toNumber(row[3], 0), 0, MAX_SURVIVAL_TIME),
      waveStage: clamp(toInteger(row[4], 0), 0, MAX_WAVE_STAGE),
      victory: row[5] === true || row[5] === 'true' || row[5] === 'TRUE',
    })
  }

  entries.sort(compareEntries)
  return entries.slice(0, limit)
}

/** 점수 → 생존 시간 → 먼저 기록한 쪽. 클라이언트와 같은 순서입니다. */
function compareEntries(a, b) {
  if (b.score !== a.score) return b.score - a.score
  if (b.survivalTime !== a.survivalTime) return b.survivalTime - a.survivalTime
  return a.recordedAt - b.recordedAt
}

function rankOf(entries, entry) {
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].recordedAt === entry.recordedAt && entries[i].name === entry.name) return i + 1
  }
  return null
}

/**
 * 이름 다듬기. src/core/leaderboard.ts의 sanitizeName과 같은 규칙입니다.
 *
 * Apps Script(Rhino 계열)에는 코드 포인트 단위 잘라내기가 없어 서로게이트
 * 쌍을 직접 살핍니다. 이모지 한 글자가 반쪽만 남아 깨진 문자로 저장되는 것을
 * 막기 위한 처리입니다.
 */
function sanitizeName(raw) {
  if (raw === null || raw === undefined) return ''
  var text = String(raw)
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^\s+|\s+$/g, '')

  var out = ''
  var counted = 0
  for (var i = 0; i < text.length && counted < NAME_MAX_LENGTH; i++) {
    var code = text.charCodeAt(i)
    var pair = code >= 0xd800 && code <= 0xdbff && i + 1 < text.length
    out += pair ? text.substr(i, 2) : text.charAt(i)
    if (pair) i++
    counted++
  }
  return out
}

function clampLimit(value) {
  var limit = Math.floor(Number(value))
  if (!isFinite(limit) || limit <= 0) return DEFAULT_LIMIT
  return Math.min(limit, MAX_LIMIT)
}

function toNumber(value, fallback) {
  var number = Number(value)
  return isFinite(number) ? number : fallback
}

function clamp(value, low, high) {
  if (!isFinite(value)) return low
  return Math.min(high, Math.max(low, value))
}

function toInteger(value, fallback) {
  return Math.floor(toNumber(value, fallback))
}

function json(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON)
}
