/**
 * Studio Scene Fallback Structurer — 규칙 기반 문장→장면 슬롯 구조화기.
 *
 * 바이브 투닝 Scene JSON 파이프라인의 설계 포인트인 "파싱 실패에 대비한 규칙
 * 기반 폴백"을 우리 쪽 정본으로 구현한 것이다. AI 제공자가 없거나, 연결됐어도
 * 실패/형식 오류를 내면 이 구조화기가 문장 1개를 슬롯 문서로 바꿔 최소 동작
 * (빈 캔버스에 장면 초안이 올라가는 것)을 보장한다. 네트워크·난수·시계
 * 의존성이 전혀 없는 순수·결정적 함수다 — 같은 문장은 항상 같은 문서.
 *
 * 규칙 개요 (전부 한국어 문장 기준):
 *  1. 『…』·[…] 구간은 나레이션으로 먼저 떼어 낸다.
 *  2. 인용부호("…" “…” ‘…’ 「…」) 구간은 대사. 앞뒤 절에서 화자(명단 이름
 *     우선)와 발화 동사(말했다/외쳤다/속삭였다/생각했다…)를 찾아 variantHint를
 *     정한다.
 *  3. 남은 산문에서 장소 사전→배경 쿼리, 시간대·날씨→배경 키워드,
 *     명단 이름·역할명사→캐릭터 슬롯(근처 포즈/표정/위치 단어), 소품 사전→
 *     소품 슬롯, 의성어 사전→효과음 슬롯을 뽑는다.
 *  4. 어떤 사전에도 걸리지 않은 서술 절(서술 종결로 끝나고 길이가 충분한)은
 *     나레이션으로 보존한다 — 입력 문장이 슬롯 어딘가에 반드시 남는다.
 *  5. 끝내 배경을 못 찾으면 background=null + 경고. 지어내지 않는다.
 *     조립 단계가 무채색 프레임으로 받아 준다.
 */

import {
  STUDIO_SCENE_MAX_CHARACTERS,
  STUDIO_SCENE_MAX_DIALOGUES,
  STUDIO_SCENE_MAX_NARRATIONS,
  STUDIO_SCENE_MAX_PROPS,
  STUDIO_SCENE_MAX_SFX,
  type StudioSceneBackgroundSlot,
  type StudioSceneCharacterPosition,
  type StudioSceneCharacterSlot,
  type StudioSceneDialogueSlot,
  type StudioSceneDialogueVariantHint,
  type StudioSceneEnvironment,
  type StudioScenePropSlot,
  type StudioSceneSfxSlot,
  type StudioSceneSlotDocument,
  type StudioSceneTimeOfDay,
} from "./studio-scene-slot-contract";

export interface StudioSceneFallbackOptions {
  /** 프로젝트 캐릭터 명단 — 화자 귀속과 캐릭터 슬롯의 1순위 근거. */
  readonly characterNames?: readonly string[];
  /** 배경을 못 찾을 때 쓸 기본 배경 쿼리(호스트 설정). 없으면 null 유지. */
  readonly defaultBackgroundQuery?: string;
}

// ---------------------------------------------------------------------------
// 사전 — 조정 지점은 이 파일 한 곳. 전부 [패턴, …] 결정적 순서.
// ---------------------------------------------------------------------------

interface LocationRule {
  readonly patterns: readonly string[];
  readonly query: string;
  readonly keywords: readonly string[];
  readonly environment: StudioSceneEnvironment;
}

// 구체적인 장소부터(옥상·교실이 학교보다 먼저) — 배열 순서가 우선순위다.
const LOCATION_RULES: readonly LocationRule[] = [
  { patterns: ["교실", "학원"], query: "교실", keywords: ["교실", "학교", "학원", "classroom", "school"], environment: "실내" },
  { patterns: ["학교"], query: "학교", keywords: ["학교", "교실", "school"], environment: "실외" },
  { patterns: ["카페", "커피숍"], query: "카페", keywords: ["카페", "cafe", "coffee"], environment: "실내" },
  { patterns: ["옥상", "지붕 위"], query: "옥상", keywords: ["옥상", "rooftop"], environment: "실외" },
  { patterns: ["횡단보도", "신호등", "거리", "골목", "대로"], query: "도심 거리", keywords: ["거리", "골목", "도시", "street", "city"], environment: "실외" },
  { patterns: ["침실", "자취방", "방 안", "방에서", "방에"], query: "방", keywords: ["방", "침실", "bedroom", "room"], environment: "실내" },
  { patterns: ["거실"], query: "거실", keywords: ["거실", "집", "living room"], environment: "실내" },
  { patterns: ["사무실", "오피스", "회사"], query: "사무실", keywords: ["사무실", "회사", "office"], environment: "실내" },
  { patterns: ["공원"], query: "공원", keywords: ["공원", "park"], environment: "실외" },
  { patterns: ["바닷가", "해변", "바다"], query: "해변", keywords: ["해변", "바다", "beach", "sea"], environment: "실외" },
  { patterns: ["숲", "산속", "산길"], query: "숲", keywords: ["숲", "산", "forest"], environment: "실외" },
  { patterns: ["궁궐", "궁전", "왕궁"], query: "궁궐", keywords: ["궁궐", "궁전", "palace"], environment: "실외" },
  { patterns: ["기차역", "지하철역", "역 앞", "플랫폼"], query: "역", keywords: ["역", "station"], environment: "실내" },
  { patterns: ["편의점"], query: "편의점", keywords: ["편의점", "convenience store"], environment: "실내" },
  { patterns: ["병원"], query: "병원", keywords: ["병원", "hospital"], environment: "실내" },
  { patterns: ["도서관"], query: "도서관", keywords: ["도서관", "library"], environment: "실내" },
  { patterns: ["운동장"], query: "운동장", keywords: ["운동장", "학교", "playground"], environment: "실외" },
  { patterns: ["시장"], query: "시장", keywords: ["시장", "market"], environment: "실외" },
  { patterns: ["교정"], query: "학교 교정", keywords: ["학교", "교정", "school"], environment: "실외" },
];

const TIME_RULES: readonly { patterns: readonly string[]; timeOfDay: StudioSceneTimeOfDay }[] = [
  { patterns: ["새벽"], timeOfDay: "새벽" },
  { patterns: ["아침", "오전"], timeOfDay: "아침" },
  { patterns: ["노을", "황혼", "석양", "해질녘", "해 질 녘"], timeOfDay: "노을" },
  { patterns: ["한밤중", "밤중", "밤하늘", "밤"], timeOfDay: "밤" },
  { patterns: ["한낮", "오후", "낮"], timeOfDay: "낮" },
];

const MOOD_KEYWORD_RULES: readonly { patterns: readonly string[]; keyword: string }[] = [
  { patterns: ["비 오", "비가", "빗소리", "장마", "소나기"], keyword: "비" },
  { patterns: ["눈 내리", "눈이", "눈길", "함박눈"], keyword: "눈" },
  { patterns: ["벚꽃"], keyword: "벚꽃" },
  { patterns: ["안개"], keyword: "안개" },
];

const POSE_RULES: readonly { patterns: readonly string[]; pose: string }[] = [
  { patterns: ["기대어", "기댄", "기대"], pose: "기댄" },
  { patterns: ["고개 숙", "고개를 숙"], pose: "고개 숙인" },
  { patterns: ["손을 흔들", "손 흔들"], pose: "손 흔드는" },
  { patterns: ["바라보", "쳐다보", "응시"], pose: "바라보는" },
  { patterns: ["앉아", "앉은", "앉았"], pose: "앉은" },
  { patterns: ["서 있", "서서", "서 있는", "선 채"], pose: "서 있는" },
  { patterns: ["달려", "달리", "뛰어", "뛰는", "달렸"], pose: "달리는" },
  { patterns: ["걸어", "걷는", "걸었", "걷고"], pose: "걷는" },
  { patterns: ["누워", "누운", "누웠"], pose: "누운" },
  { patterns: ["무릎 꿇", "꿇"], pose: "무릎 꿇은" },
];

const EXPRESSION_RULES: readonly { patterns: readonly string[]; expression: string }[] = [
  { patterns: ["미소", "웃으며", "웃는", "웃었", "웃음"], expression: "기쁨" },
  { patterns: ["울며", "우는", "눈물", "울었"], expression: "슬픔" },
  { patterns: ["화나", "분노", "노려"], expression: "화남" },
  { patterns: ["놀란", "놀라", "깜짝"], expression: "놀람" },
  { patterns: ["부끄", "수줍"], expression: "수줍음" },
  { patterns: ["당황"], expression: "당황" },
];

const POSITION_WORDS: readonly { patterns: readonly string[]; position: StudioSceneCharacterPosition }[] = [
  { patterns: ["왼쪽"], position: "left" },
  { patterns: ["오른쪽"], position: "right" },
  { patterns: ["가운데", "중앙"], position: "center" },
  { patterns: ["맨 앞", "앞쪽"], position: "foreground" },
  { patterns: ["뒤쪽", "맨 뒤"], position: "background" },
];

// 긴 패턴부터 매칭해 "책상"이 "책"으로 이중 계산되지 않게 한다.
const PROP_RULES: readonly { patterns: readonly string[]; query: string; keywords: readonly string[] }[] = [
  { patterns: ["휴대폰", "핸드폰"], query: "휴대폰", keywords: ["휴대폰", "폰", "phone"] },
  { patterns: ["꽃다발"], query: "꽃다발", keywords: ["꽃다발", "꽃", "bouquet"] },
  { patterns: ["책상"], query: "책상", keywords: ["책상", "desk"] },
  { patterns: ["테이블"], query: "테이블", keywords: ["테이블", "table"] },
  { patterns: ["우산"], query: "우산", keywords: ["우산", "umbrella"] },
  { patterns: ["가방"], query: "가방", keywords: ["가방", "bag"] },
  { patterns: ["자전거"], query: "자전거", keywords: ["자전거", "bicycle"] },
  { patterns: ["자동차"], query: "자동차", keywords: ["자동차", "차", "car"] },
  { patterns: ["편지"], query: "편지", keywords: ["편지", "letter"] },
  { patterns: ["케이크"], query: "케이크", keywords: ["케이크", "cake"] },
  { patterns: ["커피"], query: "커피", keywords: ["커피", "coffee"] },
  { patterns: ["연필"], query: "연필", keywords: ["연필", "pencil"] },
  { patterns: ["노트"], query: "노트", keywords: ["노트", "notebook"] },
  { patterns: ["책"], query: "책", keywords: ["책", "book"] },
  { patterns: ["꽃"], query: "꽃", keywords: ["꽃", "flower"] },
  { patterns: ["검", "칼"], query: "검", keywords: ["검", "칼", "sword"] },
  { patterns: ["지팡이"], query: "지팡이", keywords: ["지팡이", "staff"] },
  { patterns: ["의자"], query: "의자", keywords: ["의자", "chair"] },
  { patterns: ["안경"], query: "안경", keywords: ["안경", "glasses"] },
  { patterns: ["모자"], query: "모자", keywords: ["모자", "hat"] },
  { patterns: ["열쇠"], query: "열쇠", keywords: ["열쇠", "key"] },
  { patterns: ["양초", "촛불"], query: "양초", keywords: ["양초", "촛불", "candle"] },
  { patterns: ["거울"], query: "거울", keywords: ["거울", "mirror"] },
  { patterns: ["시계"], query: "시계", keywords: ["시계", "clock"] },
  { patterns: ["상자"], query: "상자", keywords: ["상자", "box"] },
];

/** 명단이 없을 때 캐릭터 슬롯이 될 수 있는 역할 명사. */
const ROLE_NOUNS: readonly string[] = [
  "마법사", "기사", "공주", "왕자", "선생님", "학생", "소년", "소녀",
  "청년", "남자", "여자", "노인", "아이", "형사", "의사", "점원", "배달부",
];

interface SpeechVerbRule {
  readonly patterns: readonly string[];
  readonly variantHint: StudioSceneDialogueVariantHint;
}
const SPEECH_VERB_RULES: readonly SpeechVerbRule[] = [
  { patterns: ["외쳤다", "외치", "소리쳤다", "소리치", "고함"], variantHint: "shout" },
  { patterns: ["속삭였다", "속삭이", "귓속말"], variantHint: "whisper" },
  { patterns: ["생각했다", "생각하", "혼잣말"], variantHint: "thought" },
  { patterns: ["말했다", "말하", "물었다", "묻", "대답했다", "대답하", "중얼"], variantHint: "speech" },
];
const ALL_SPEECH_PATTERNS: readonly string[] = SPEECH_VERB_RULES.flatMap((r) => [
  ...r.patterns,
]);

const SFX_RULES: readonly { patterns: readonly string[]; emphasis: "normal" | "strong" }[] = [
  { patterns: ["쾅", "쿵", "팡"], emphasis: "strong" },
  { patterns: ["두근", "바스락", "철컥", "똑똑", "쨍그랑", "휘익", "사각사각"], emphasis: "normal" },
];

/** 서술 절로 인정하는 종결 — 이걸로 끝나면 나레이션 후보가 된다. */
const NARRATIVE_ENDING = /(였다|었다|이었다|이다|인 것이다|노 것이다|—|…)$/;

// ---------------------------------------------------------------------------
// 내부 헬퍼
// ---------------------------------------------------------------------------

function includesAny(text: string, patterns: readonly string[]): boolean {
  return patterns.some((p) => text.includes(p));
}

/** 이름 뒤 조사/어미를 떼고 핵심 이름만 남긴다(예: "지훈이" → "지훈"). */
const NAME_TRAILING = /(이|가|은|는|을|를|도|만|와|과|의)$/;

interface QuotedSpan {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

const QUOTE_PAIRS: readonly (readonly [string, string])[] = [
  ["“", "”"],
  ["\"", "\""],
  ["‘", "’"],
  ["'", "'"],
  ["「", "」"],
];

function extractQuotes(text: string): QuotedSpan[] {
  const spans: QuotedSpan[] = [];
  const claimed: [number, number][] = [];
  for (const [open, close] of QUOTE_PAIRS) {
    let cursor = 0;
    while (cursor < text.length) {
      const start = text.indexOf(open, cursor);
      if (start < 0) break;
      const end = text.indexOf(close, start + open.length);
      if (end < 0) break;
      const overlaps = claimed.some(([s, e]) => start < e && end + close.length > s);
      if (!overlaps) {
        const inner = text.slice(start + open.length, end).trim();
        if (inner) {
          spans.push({ text: inner, start, end: end + close.length });
          claimed.push([start, end + close.length]);
        }
      }
      cursor = end + close.length;
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

function removeSpans(text: string, spans: readonly { start: number; end: number }[]): string {
  let out = text;
  const sorted = [...spans].sort((a, b) => b.start - a.start);
  for (const s of sorted) out = out.slice(0, s.start) + " " + out.slice(s.end);
  return out;
}

/**
 * 대사 앞뒤 창에서 화자를 찾는다. 우선순위는 "발화 동사에 붙은 이름"이
 * 최우선이다 — 앞 절에 등장한 다른 인물이 화자로 오인되지 않게.
 *  1. 인용 뒤 "이름+조사+발화동사" (한국어 후행 귀속이 가장 흔하다)
 *  2. 인용 앞 "이름+조사 … 발화동사"로 끝나는 절
 *  3. 명단 이름이 뒤 창 → 앞 창 순으로 등장
 *  4. "지훈:" 콜론 표기
 */
function findSpeaker(
  windowBefore: string,
  windowAfter: string,
  roster: readonly string[]
): string | undefined {
  const verbAlt = ALL_SPEECH_PATTERNS.join("|");
  const afterRe = new RegExp(
    `^\\s*(?:라고|며|고)?\\s*([가-힣A-Za-z0-9_]{2,8})(?:이|가)\\s*(?:${verbAlt})`
  );
  const after = windowAfter.match(afterRe);
  if (after) return after[1].replace(NAME_TRAILING, "");
  const beforeRe = new RegExp(
    `([가-힣A-Za-z0-9_]{2,8})(?:이|가|은|는)\\s+[^"“”'‘’「」]{0,14}(?:${verbAlt})[.!?…]*\\s*$`
  );
  const before = windowBefore.match(beforeRe);
  if (before) return before[1].replace(NAME_TRAILING, "");
  for (const name of roster) {
    if (windowAfter.includes(name)) return name;
  }
  for (const name of roster) {
    if (windowBefore.includes(name)) return name;
  }
  const colon = windowBefore.match(/([가-힣A-Za-z0-9_]{2,8})\s*:\s*$/);
  if (colon) return colon[1];
  return undefined;
}

function findVariantHint(windowBefore: string, windowAfter: string): StudioSceneDialogueVariantHint {
  const haystack = windowAfter.slice(0, 30) + " " + windowBefore.slice(-30);
  for (const rule of SPEECH_VERB_RULES) {
    if (includesAny(haystack, rule.patterns)) return rule.variantHint;
  }
  return "speech";
}

function findPoseNear(text: string): string | undefined {
  for (const rule of POSE_RULES) {
    if (includesAny(text, rule.patterns)) return rule.pose;
  }
  return undefined;
}

function findExpressionNear(text: string): string | undefined {
  for (const rule of EXPRESSION_RULES) {
    if (includesAny(text, rule.patterns)) return rule.expression;
  }
  return undefined;
}

function findPositionNear(text: string): StudioSceneCharacterPosition | undefined {
  for (const rule of POSITION_WORDS) {
    if (includesAny(text, rule.patterns)) return rule.position;
  }
  return undefined;
}

const DEFAULT_POSITION_ORDER: readonly StudioSceneCharacterPosition[] = [
  "left",
  "right",
  "center",
  "foreground",
];

// ---------------------------------------------------------------------------
// 구조화기 본체
// ---------------------------------------------------------------------------

/**
 * 문장 1개를 슬롯 문서로 구조화한다(규칙 기반 폴백).
 * 어떤 입력에도 문서를 돌려준다 — 최악의 경우 원문을 나레이션으로 보존하고
 * 경고를 단 빈 슬롯 문서다. throw하지 않는다.
 */
export function structureSentenceToSceneFallback(
  sentence: string,
  options: StudioSceneFallbackOptions = {}
): StudioSceneSlotDocument {
  const warnings: string[] = [];
  const original = (sentence ?? "").replace(/\s+/g, " ").trim();
  const roster = (options.characterNames ?? []).map((n) => n.trim()).filter(Boolean);

  if (!original) {
    return {
      version: 1,
      sentence: "",
      source: "fallback",
      background: null,
      characters: [],
      props: [],
      dialogues: [],
      narrations: [],
      sfx: [],
      warnings: ["empty-sentence"],
    };
  }

  // 1) 나레이션 구간(『…』·[…])을 먼저 떼어 낸다.
  const narrations: { text: string }[] = [];
  const narrationSpans: QuotedSpan[] = [];
  for (const [open, close] of [["『", "』"], ["[", "]"]] as const) {
    let cursor = 0;
    while (cursor < original.length) {
      const start = original.indexOf(open, cursor);
      if (start < 0) break;
      const end = original.indexOf(close, start + 1);
      if (end < 0) break;
      const inner = original.slice(start + 1, end).trim();
      if (inner && narrations.length < STUDIO_SCENE_MAX_NARRATIONS) {
        narrations.push({ text: inner });
      }
      narrationSpans.push({ text: inner, start, end: end + 1 });
      cursor = end + 1;
    }
  }
  const withoutNarration = removeSpans(original, narrationSpans);

  // 2) 대사 구간.
  const quotes = extractQuotes(withoutNarration);
  const dialogues: StudioSceneDialogueSlot[] = [];
  for (const quote of quotes) {
    if (dialogues.length >= STUDIO_SCENE_MAX_DIALOGUES) break;
    const windowBefore = withoutNarration.slice(Math.max(0, quote.start - 48), quote.start);
    const windowAfter = withoutNarration.slice(quote.end, quote.end + 48);
    const speaker = findSpeaker(windowBefore, windowAfter, roster);
    dialogues.push({
      text: quote.text,
      ...(speaker ? { speaker } : {}),
      variantHint: findVariantHint(windowBefore, windowAfter),
    });
  }
  const prose = removeSpans(withoutNarration, quotes).replace(/\s+/g, " ").trim();

  // 3) 배경 — 장소 사전(우선순위 순), 시간대, 날씨·분위기 키워드.
  let background: StudioSceneBackgroundSlot | null = null;
  {
    const keywords: string[] = [];
    let primary: LocationRule | null = null;
    for (const rule of LOCATION_RULES) {
      if (includesAny(prose, rule.patterns) || includesAny(original, rule.patterns)) {
        if (!primary) primary = rule;
        for (const kw of rule.keywords) if (!keywords.includes(kw)) keywords.push(kw);
      }
    }
    let timeOfDay: StudioSceneTimeOfDay | undefined;
    for (const rule of TIME_RULES) {
      if (includesAny(prose, rule.patterns)) {
        timeOfDay = rule.timeOfDay;
        if (!keywords.includes(rule.timeOfDay)) keywords.push(rule.timeOfDay);
        break;
      }
    }
    for (const rule of MOOD_KEYWORD_RULES) {
      if (includesAny(prose, rule.patterns) && !keywords.includes(rule.keyword)) {
        keywords.push(rule.keyword);
      }
    }
    if (primary) {
      const timePrefix = timeOfDay && timeOfDay !== "낮" ? `${timeOfDay} ` : "";
      // 쿼리에 시간대를 접두해 "노을 옥상"처럼 검색 친화적으로 만든다(이미 들어 있으면 유지).
      const query = primary.query.includes(timeOfDay ?? "")
        ? primary.query
        : `${timePrefix}${primary.query}`.trim();
      background = {
        query,
        keywords: keywords.slice(0, 8),
        ...(timeOfDay ? { timeOfDay } : {}),
        environment: primary.environment,
      };
    } else if (options.defaultBackgroundQuery?.trim()) {
      background = { query: options.defaultBackgroundQuery.trim(), keywords: [] };
      warnings.push("background-from-default");
    } else {
      warnings.push("background-not-found");
    }
  }

  // 4) 캐릭터 — 명단 이름 + 대사 화자 + 역할 명사.
  const characterLabels: { label: string; index: number }[] = [];
  const seenLabels = new Set<string>();
  const addLabel = (label: string, index: number) => {
    if (!label || seenLabels.has(label)) return;
    seenLabels.add(label);
    characterLabels.push({ label, index });
  };
  for (const name of roster) {
    const idx = prose.indexOf(name);
    if (idx >= 0) addLabel(name, idx);
  }
  for (const d of dialogues) {
    if (d.speaker) addLabel(d.speaker, prose.indexOf(d.speaker));
  }
  for (const noun of ROLE_NOUNS) {
    const idx = prose.indexOf(noun);
    if (idx >= 0) addLabel(noun, idx);
  }
  characterLabels.sort((a, b) => a.index - b.index);

  const characters: StudioSceneCharacterSlot[] = characterLabels
    .slice(0, STUDIO_SCENE_MAX_CHARACTERS)
    .map(({ label, index }, order) => {
      // 포즈·표정은 이름 뒤 절에서(주어 뒤에 서술이 오는 한국어 어순),
      // 위치 단어는 이름 앞뒤 모두에서 찾는다. 창을 좁혀 옆 캐릭터의
      // 서술이 새어 들어오지 않게 한다.
      const beforeWin = index >= 0 ? prose.slice(Math.max(0, index - 16), index) : "";
      const afterWin =
        index >= 0 ? prose.slice(index + label.length, index + label.length + 24) : prose;
      const pose = findPoseNear(afterWin) ?? findPoseNear(beforeWin);
      const expression = findExpressionNear(afterWin) ?? findExpressionNear(beforeWin);
      const position =
        findPositionNear(beforeWin) ??
        findPositionNear(afterWin) ??
        DEFAULT_POSITION_ORDER[order] ??
        "center";
      return {
        label,
        query: pose ? `${label} ${pose}` : label,
        ...(pose ? { pose } : {}),
        ...(expression ? { expression } : {}),
        position,
        scale: 1,
        facing: "front" as const,
      };
    });
  if (characters.length === 0) warnings.push("characters-not-found");
  if (roster.length === 0 && dialogues.some((d) => !d.speaker)) {
    warnings.push("speaker-unresolved");
  }

  // 5) 소품 — 구간 점유 방식으로 이중 계산 방지.
  const props: StudioScenePropSlot[] = [];
  {
    const claimed: [number, number][] = [];
    for (const rule of PROP_RULES) {
      if (props.length >= STUDIO_SCENE_MAX_PROPS) break;
      for (const pattern of rule.patterns) {
        const idx = prose.indexOf(pattern);
        if (idx < 0) continue;
        const end = idx + pattern.length;
        if (claimed.some(([s, e]) => idx < e && end > s)) continue;
        claimed.push([idx, end]);
        props.push({ query: rule.query, keywords: rule.keywords, position: "bottom", scale: 1 });
        break;
      }
    }
  }

  // 6) 효과음 — 의성어 토큰.
  const sfx: StudioSceneSfxSlot[] = [];
  for (const rule of SFX_RULES) {
    for (const pattern of rule.patterns) {
      if (sfx.length >= STUDIO_SCENE_MAX_SFX) break;
      if (prose.includes(pattern) && !sfx.some((s) => s.text === pattern)) {
        sfx.push({ text: pattern, emphasis: rule.emphasis });
      }
    }
  }

  // 7) 남은 서술 절 → 나레이션 보존.
  if (narrations.length < STUDIO_SCENE_MAX_NARRATIONS) {
    const clauses = prose
      .split(/(?<=[.!?…])\s+/)
      .map((c) => c.trim())
      .filter(Boolean);
    for (const clause of clauses) {
      if (narrations.length >= STUDIO_SCENE_MAX_NARRATIONS) break;
      const bare = clause.replace(/[.!?…]+$/, "");
      if (bare.length < 8) continue;
      if (!NARRATIVE_ENDING.test(bare)) continue;
      const hasSceneHit =
        includesAny(bare, LOCATION_RULES.flatMap((r) => [...r.patterns])) ||
        characterLabels.some((c) => bare.includes(c.label)) ||
        props.some((p) => bare.includes(p.query)) ||
        includesAny(bare, ALL_SPEECH_PATTERNS);
      if (hasSceneHit) continue;
      if (!narrations.some((n) => n.text === bare)) narrations.push({ text: bare });
    }
  }
  // 최후 보존: 슬롯이 전부 비면 원문 자체를 나레이션으로 남긴다.
  const nothingFound =
    !background &&
    characters.length === 0 &&
    props.length === 0 &&
    dialogues.length === 0 &&
    narrations.length === 0 &&
    sfx.length === 0;
  if (nothingFound) {
    narrations.push({ text: original });
    warnings.push("sentence-preserved-as-narration");
  }

  return {
    version: 1,
    sentence: original,
    source: "fallback",
    background,
    characters,
    props,
    dialogues,
    narrations,
    sfx,
    warnings,
  };
}
