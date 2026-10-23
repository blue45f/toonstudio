/**
 * Studio 3D 포즈 라이브러리 — 통합 목록·검색 기준·중복 정리(순수 데이터 계층).
 *
 * 데생 인형 포즈 라이브러리(studio-mannequin-poses)와 웹툰 포즈 프리셋
 * (studio-3d-advanced-poses-library)은 검색창·필터를 따로 두면서 검색 기준도 달랐다.
 * 한쪽은 이름·설명·태그를 이어 붙인 문자열의 부분 일치, 다른 쪽은 공백을 지운 부분
 * 일치라서 '검'이 '검지'(가리키기·OK 사인)를 찾았고 '주먹'은 한 라이브러리에서만
 * 걸렸다. 이 모듈이 두 라이브러리의 단일 검색 기준이다.
 *
 * 검색 기준(모든 검색창 공통):
 * - 검색어는 공백으로 나눈 낱말을 모두 만족해야 한다(AND).
 * - 한 글자 낱말(예: '검', '손')은 같은 낱말이나 '낱말 + 조사'(검을·손에)에만 맞는다.
 *   '검'이 '검지'를 찾는 식의 동음 접두 오탐을 막는다.
 * - 두 글자 이상 낱말은 이름·태그·분류에서는 부분 일치, 설명에서는 낱말 앞부분 일치다.
 * - 동의어 사전(칼↔검, 주먹↔펀치, 포옹↔안기·허그 …)으로 같은 뜻의 다른 말도 찾는다.
 *
 * 중복 정리: 두 라이브러리에 같은 포즈가 이름만 조금 바꿔 들어 있다(손잡고 걷기·어깨에
 * 기대기·바닥 양반다리·귓속말 …). 통합 목록의 '전체'에서는 데생 인형 판 하나만 보이고,
 * 숨긴 웹툰 판의 이름·태그는 남은 카드의 검색어로 흡수된다. '웹툰 프리셋' 출처를 고르면
 * 웹툰 프리셋 23개를 그대로 볼 수 있다. 데이터는 바꾸지 않는다(표시 계층 정리).
 *
 * Three.js·React import 없음 — 결정적이고 단위 테스트 가능하다.
 */

import {
  ADVANCED_WEBTOON_POSES,
  WEBTOON_POSE_CATEGORY_META,
  type CharacterFullBodyPosePreset,
  type CharacterPoseCategory,
} from "./studio-3d-advanced-poses-library";
import {
  STUDIO_MANNEQUIN_POSE_CATEGORIES,
  STUDIO_MANNEQUIN_POSE_PRESETS,
  studioMannequinPosePresetScope,
  type StudioMannequinPoseCategory,
  type StudioMannequinPosePreset,
} from "./studio-mannequin-poses";

// ── 검색 기준 ────────────────────────────────────────────────────────────────

/** 검색용 정규화: 호환 문자 통일·소문자·구두점을 공백으로·연속 공백 정리. */
export function normalizeStudioPoseSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[()[\]{}·•,./\\|:;!?'"`~@#$%^&*+=<>_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function words(value: string): string[] {
  const normalized = normalizeStudioPoseSearchText(value);
  return normalized ? normalized.split(" ") : [];
}

/** 한 글자 낱말 뒤에 붙어도 같은 낱말로 보는 조사(검을·손에·발로 …). */
const KOREAN_PARTICLES: ReadonlySet<string> = new Set([
  "은", "는", "이", "가", "을", "를", "의", "에", "로", "으로", "와", "과", "도", "만",
  "에서", "에게", "처럼", "까지", "부터", "랑", "이랑", "하고",
]);

/**
 * 같은 뜻의 다른 말. 키·값 모두 정규화된 낱말이다. 검색 낱말은 자신과 동의어 중
 * 하나만 맞으면 된다. 웹툰 작가가 실제로 치는 말 위주로 좁게 유지한다.
 */
const STUDIO_POSE_SEARCH_SYNONYMS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  검: ["칼", "검술", "sword"],
  칼: ["검", "검술"],
  sword: ["검", "칼"],
  주먹: ["펀치", "fist"],
  펀치: ["주먹", "punch"],
  포옹: ["안기", "허그", "끌어안기", "hug"],
  안기: ["포옹", "허그", "끌어안기"],
  허그: ["포옹", "안기", "백허그"],
  hug: ["포옹", "안기"],
  킥: ["발차기", "kick"],
  발차기: ["킥", "kick"],
  kick: ["킥", "발차기"],
  인사: ["손흔들기", "경례", "고개숙이기"],
  놀람: ["깜짝", "경악", "충격"],
  충격: ["놀람", "경악"],
  슬픔: ["좌절", "절망"],
  좌절: ["절망"],
  절망: ["좌절"],
  화: ["분노"],
  분노: ["화"],
  기쁨: ["환호"],
  브이: ["v", "피스"],
  피스: ["브이", "v"],
  전화: ["통화", "스마트폰", "휴대폰"],
  휴대폰: ["스마트폰", "전화"],
  핸드폰: ["스마트폰", "휴대폰", "전화"],
  마법: ["시전", "주문", "영창"],
  달리기: ["질주", "뛰기"],
  뛰기: ["달리기", "질주"],
  걷기: ["보행"],
  연인: ["커플", "로맨스"],
  커플: ["연인", "2인"],
  앉기: ["앉은", "좌식"],
});

/** 미리 정규화해 둔 검색 색인. 라이브러리 항목마다 한 번만 만든다. */
export interface StudioPoseSearchIndex {
  /** 이름·태그·분류·영문 이름·id 조각 낱말(부분 일치 대상). */
  readonly primaryWords: readonly string[];
  /**
   * 주요 항목마다 공백을 지워 '|'로 이은 문자열('손잡고걷기'처럼 붙여 친 검색어용).
   * 검색 낱말에는 '|'가 남지 않으므로 서로 다른 항목(태그 둘)을 가로지르는 오탐이 없다.
   */
  readonly primaryJoined: string;
  /** 설명 낱말(앞부분 일치 대상). */
  readonly secondaryWords: readonly string[];
}

export function buildStudioPoseSearchIndex(parts: {
  readonly primary: readonly string[];
  readonly secondary?: readonly string[];
}): StudioPoseSearchIndex {
  const primaryWords = Array.from(new Set(parts.primary.flatMap(words)));
  const secondaryWords = Array.from(new Set((parts.secondary ?? []).flatMap(words)));
  return Object.freeze({
    primaryWords: Object.freeze(primaryWords),
    primaryJoined: parts.primary.map((part) => words(part).join("")).join("|"),
    secondaryWords: Object.freeze(secondaryWords),
  });
}

function isSingleCharacter(token: string): boolean {
  return Array.from(token).length === 1;
}

function wordMatchesExactly(word: string, token: string): boolean {
  if (word === token) return true;
  return word.startsWith(token) && KOREAN_PARTICLES.has(word.slice(token.length));
}

function alternativeMatches(index: StudioPoseSearchIndex, alternative: string): boolean {
  if (isSingleCharacter(alternative)) {
    return (
      index.primaryWords.some((word) => wordMatchesExactly(word, alternative))
      || index.secondaryWords.some((word) => wordMatchesExactly(word, alternative))
    );
  }
  return (
    index.primaryWords.some((word) => word.includes(alternative))
    || index.primaryJoined.includes(alternative)
    || index.secondaryWords.some((word) => word.startsWith(alternative))
  );
}

/** 검색 낱말 하나가 색인에 맞는지(동의어 포함). */
export function studioPoseSearchTokenMatches(index: StudioPoseSearchIndex, token: string): boolean {
  const alternatives = [token, ...(STUDIO_POSE_SEARCH_SYNONYMS[token] ?? [])];
  return alternatives.some((alternative) => alternativeMatches(index, alternative));
}

/** 검색어 전체가 색인에 맞는지. 빈 검색어는 언제나 맞는다. */
export function matchesStudioPoseSearch(index: StudioPoseSearchIndex, query: string): boolean {
  const tokens = words(query);
  return tokens.every((token) => studioPoseSearchTokenMatches(index, token));
}

// ── 통합 목록 ────────────────────────────────────────────────────────────────

/**
 * 통합 라이브러리의 출처: 웹툰 포즈 프리셋 · 데생 인형 전신 포즈 · 손 전용 포즈.
 * 출처 이름은 분류 이름('웹툰 연출' 등)과 겹치지 않게 짓는다 — 같은 이름의 칩이 두 줄에 있으면 헷갈린다.
 */
export type StudioPoseLibrarySource = "webtoon" | "library" | "hand";

export const STUDIO_POSE_LIBRARY_SOURCES: readonly {
  readonly id: StudioPoseLibrarySource;
  readonly label: string;
  readonly description: string;
}[] = Object.freeze([
  { id: "webtoon", label: "웹툰 프리셋", description: "웹툰 장면용 연출 프리셋(웹툰 포즈 프리셋 라이브러리)" },
  { id: "library", label: "데생 인형", description: "데생 인형 전신 포즈" },
  { id: "hand", label: "손", description: "몸 포즈는 두고 손 모양만 바꾸는 포즈" },
]);

/** 웹툰 프리셋 분류 → 통합(데생 인형) 분류. 드라마틱 컷은 '웹툰 연출'로 모은다. */
const WEBTOON_TO_LIBRARY_CATEGORY: Readonly<Record<CharacterPoseCategory, StudioMannequinPoseCategory>> =
  Object.freeze({
    action: "action",
    daily: "daily",
    dialogue: "dialogue",
    couple: "couple",
    sitting: "sitting",
    dramatic: "webtoon",
    emotion: "emotion",
  });

/**
 * 같은 포즈의 웹툰 판 → 데생 인형 판. '전체'에서는 데생 인형 판만 보이고 웹툰 판의
 * 이름·태그는 그 카드의 검색어로 흡수된다. 키와 값 모두 실제 프리셋 id여야 한다(테스트가 고정).
 */
export const STUDIO_POSE_LIBRARY_DUPLICATES: Readonly<Record<string, string>> = Object.freeze({
  "action-hero-landing": "hero-landing",
  "action-dynamic-jump-kick": "kick-flying",
  "action-spell-cast": "action-spell-cast",
  "dramatic-shock-stepback": "surprised",
  "dramatic-kneeling-despair": "emotion-despair-kneel",
  "dramatic-romantic-hug": "couple-hug-front",
  "dialogue-explaining-gesture": "dialogue-explain",
  "dialogue-listening-nod": "dialogue-listen",
  "dialogue-whisper-secret": "dialogue-whisper",
  "couple-hand-hold": "couple-hand-hold-walk",
  "couple-shoulder-lean": "couple-shoulder-lean",
  "sitting-floor-cross-legged": "sit-floor-cross",
  "sitting-desk-slump": "sit-desk",
  "sitting-mech-pilot": "sit-mech-pilot",
});

interface StudioPoseLibraryEntryBase {
  /** 목록 전체에서 유일한 키. `webtoon:<id>` 또는 `mannequin:<id>`. */
  readonly key: string;
  readonly presetId: string;
  readonly source: StudioPoseLibrarySource;
  /** 카드에 보이는 한국어 이름(웹툰 이름의 괄호 속 영문은 뺀다). */
  readonly label: string;
  /** 원래 이름 전체(툴팁용). */
  readonly fullName: string;
  readonly category: StudioMannequinPoseCategory;
  readonly figures: 1 | 2;
  /** '전체'에서 이 카드에 합쳐진 다른 라이브러리 판의 이름. */
  readonly mergedNames: readonly string[];
  /** 다른 라이브러리 판과 겹쳐 '전체'에서 숨기는 항목인지(웹툰 판만 해당). */
  readonly duplicateOf: string | null;
  readonly searchIndex: StudioPoseSearchIndex;
}

export type StudioPoseLibraryEntry =
  | (StudioPoseLibraryEntryBase & {
      readonly kind: "webtoon";
      readonly webtoonPreset: CharacterFullBodyPosePreset;
    })
  | (StudioPoseLibraryEntryBase & {
      readonly kind: "mannequin";
      readonly mannequinPreset: StudioMannequinPosePreset;
    });

/** 웹툰 프리셋 이름의 괄호 속 영문을 뺀 표시 이름. */
export function studioWebtoonPoseDisplayName(fullName: string): string {
  const parenIndex = fullName.indexOf(" (");
  return parenIndex > 0 ? fullName.slice(0, parenIndex) : fullName;
}

const LIBRARY_CATEGORY_LABEL = new Map(
  STUDIO_MANNEQUIN_POSE_CATEGORIES.map((meta) => [meta.id, meta.label] as const),
);
const WEBTOON_CATEGORY_LABEL = new Map(
  WEBTOON_POSE_CATEGORY_META.map((meta) => [meta.id, meta.label] as const),
);

export function studioPoseLibraryCategoryLabel(category: StudioMannequinPoseCategory): string {
  return LIBRARY_CATEGORY_LABEL.get(category) ?? category;
}

function figureWord(figures: 1 | 2): string {
  return figures === 2 ? "2인" : "1인";
}

/** 웹툰 프리셋 하나의 검색 색인(웹툰 프리셋 그리드도 같은 기준으로 쓴다). */
export function buildStudioWebtoonPoseSearchIndex(
  preset: CharacterFullBodyPosePreset,
  extraPrimary: readonly string[] = [],
): StudioPoseSearchIndex {
  return buildStudioPoseSearchIndex({
    primary: [
      preset.name,
      ...preset.tags,
      preset.id,
      WEBTOON_CATEGORY_LABEL.get(preset.category) ?? "",
      studioPoseLibraryCategoryLabel(WEBTOON_TO_LIBRARY_CATEGORY[preset.category]),
      figureWord(preset.figures),
      ...extraPrimary,
    ],
    secondary: [preset.description],
  });
}

function buildMannequinSearchIndex(
  preset: StudioMannequinPosePreset,
  extraPrimary: readonly string[],
  extraSecondary: readonly string[],
): StudioPoseSearchIndex {
  const handOnly = studioMannequinPosePresetScope(preset) === "hand-only";
  return buildStudioPoseSearchIndex({
    primary: [
      preset.label,
      ...(preset.tags ?? []),
      preset.id,
      studioPoseLibraryCategoryLabel(preset.category),
      figureWord(preset.figures ?? 1),
      ...(handOnly ? ["손만", "손 전용"] : []),
      ...extraPrimary,
    ],
    secondary: [preset.description ?? "", ...extraSecondary],
  });
}

function buildStudioPoseLibraryEntries(): readonly StudioPoseLibraryEntry[] {
  const webtoonById = new Map(ADVANCED_WEBTOON_POSES.map((preset) => [preset.id, preset] as const));
  // 데생 인형 판 id → 그 판에 흡수되는 웹툰 판들.
  const mergedWebtoonByMannequin = new Map<string, CharacterFullBodyPosePreset[]>();
  for (const [webtoonId, mannequinId] of Object.entries(STUDIO_POSE_LIBRARY_DUPLICATES)) {
    const webtoon = webtoonById.get(webtoonId);
    if (!webtoon) continue;
    const list = mergedWebtoonByMannequin.get(mannequinId) ?? [];
    list.push(webtoon);
    mergedWebtoonByMannequin.set(mannequinId, list);
  }
  const mannequinIds = new Set(STUDIO_MANNEQUIN_POSE_PRESETS.map((preset) => preset.id));

  const mannequinEntries: StudioPoseLibraryEntry[] = STUDIO_MANNEQUIN_POSE_PRESETS.map((preset) => {
    const merged = mergedWebtoonByMannequin.get(preset.id) ?? [];
    const handOnly = studioMannequinPosePresetScope(preset) === "hand-only";
    return {
      kind: "mannequin" as const,
      key: `mannequin:${preset.id}`,
      presetId: preset.id,
      source: handOnly ? ("hand" as const) : ("library" as const),
      label: preset.label,
      fullName: preset.label,
      category: preset.category,
      figures: preset.figures ?? 1,
      mergedNames: merged.map((webtoon) => studioWebtoonPoseDisplayName(webtoon.name)),
      duplicateOf: null,
      searchIndex: buildMannequinSearchIndex(
        preset,
        merged.flatMap((webtoon) => [webtoon.name, ...webtoon.tags]),
        merged.map((webtoon) => webtoon.description),
      ),
      mannequinPreset: preset,
    };
  });

  const webtoonEntries: StudioPoseLibraryEntry[] = ADVANCED_WEBTOON_POSES.map((preset) => {
    const twin = STUDIO_POSE_LIBRARY_DUPLICATES[preset.id];
    return {
      kind: "webtoon" as const,
      key: `webtoon:${preset.id}`,
      presetId: preset.id,
      source: "webtoon" as const,
      label: studioWebtoonPoseDisplayName(preset.name),
      fullName: preset.name,
      category: WEBTOON_TO_LIBRARY_CATEGORY[preset.category],
      figures: preset.figures,
      mergedNames: [],
      duplicateOf: twin && mannequinIds.has(twin) ? twin : null,
      searchIndex: buildStudioWebtoonPoseSearchIndex(preset),
      webtoonPreset: preset,
    };
  });

  // 분류 순서대로 묶고, 같은 분류 안에서는 데생 인형 → 웹툰 순(각 라이브러리 원래 순서 유지).
  const ordered: StudioPoseLibraryEntry[] = [];
  for (const { id } of STUDIO_MANNEQUIN_POSE_CATEGORIES) {
    ordered.push(...mannequinEntries.filter((entry) => entry.category === id));
    ordered.push(...webtoonEntries.filter((entry) => entry.category === id));
  }
  return Object.freeze(ordered);
}

/** 통합 포즈 라이브러리 전체 항목(분류 순서). */
export const STUDIO_POSE_LIBRARY_ENTRIES: readonly StudioPoseLibraryEntry[] =
  buildStudioPoseLibraryEntries();

const ENTRY_BY_KEY = new Map(STUDIO_POSE_LIBRARY_ENTRIES.map((entry) => [entry.key, entry] as const));

export function getStudioPoseLibraryEntry(key: string): StudioPoseLibraryEntry | undefined {
  return ENTRY_BY_KEY.get(key);
}

export function studioPoseLibraryEntryKey(kind: "webtoon" | "mannequin", presetId: string): string {
  return `${kind}:${presetId}`;
}

export interface StudioPoseLibraryFilter {
  /** "all"이면 출처 무관(다른 판과 겹치는 웹툰 판은 숨긴다). */
  readonly source?: StudioPoseLibrarySource | "all";
  readonly category?: StudioMannequinPoseCategory | "all";
  readonly figures?: 1 | 2 | "all";
  readonly query?: string;
}

function entryPassesFilter(entry: StudioPoseLibraryEntry, filter: StudioPoseLibraryFilter): boolean {
  const source = filter.source ?? "all";
  if (source === "all" ? entry.duplicateOf !== null : entry.source !== source) return false;
  const category = filter.category ?? "all";
  if (category !== "all" && entry.category !== category) return false;
  const figures = filter.figures ?? "all";
  if (figures !== "all" && entry.figures !== figures) return false;
  return matchesStudioPoseSearch(entry.searchIndex, filter.query ?? "");
}

/** 출처 × 분류 × 인원 × 검색어(AND). 빈 필터는 '전체'(중복 정리) 목록을 돌려준다. */
export function filterStudioPoseLibrary(
  filter: StudioPoseLibraryFilter = {},
): StudioPoseLibraryEntry[] {
  return STUDIO_POSE_LIBRARY_ENTRIES.filter((entry) => entryPassesFilter(entry, filter));
}

/** 출처 칩 개수 — 출처 외 조건(분류·인원·검색어)을 적용한 결과 수. */
export function countStudioPoseLibraryBySource(
  filter: Omit<StudioPoseLibraryFilter, "source"> = {},
): Readonly<Record<StudioPoseLibrarySource | "all", number>> {
  const counts: Record<StudioPoseLibrarySource | "all", number> = { all: 0, webtoon: 0, library: 0, hand: 0 };
  for (const source of ["all", "webtoon", "library", "hand"] as const) {
    counts[source] = filterStudioPoseLibrary({ ...filter, source }).length;
  }
  return Object.freeze(counts);
}

/** 분류 칩 개수 — 분류 외 조건(출처·인원·검색어)을 적용한 결과 수. 없는 분류는 0. */
export function countStudioPoseLibraryByCategory(
  filter: Omit<StudioPoseLibraryFilter, "category"> = {},
): Readonly<Record<StudioMannequinPoseCategory, number>> {
  const counts = Object.fromEntries(
    STUDIO_MANNEQUIN_POSE_CATEGORIES.map((meta) => [meta.id, 0]),
  ) as Record<StudioMannequinPoseCategory, number>;
  for (const entry of filterStudioPoseLibrary({ ...filter, category: "all" })) counts[entry.category] += 1;
  return Object.freeze(counts);
}
