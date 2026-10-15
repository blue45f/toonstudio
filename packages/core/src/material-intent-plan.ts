/**
 * 자연어 소재 계획기 — 문장 하나("비 오는 골목 야경")를 "어떤 종류의 자료를, 어느 제공처에서,
 * 어떤 검색어로 찾을지"의 계획(SearchPlan)으로 바꾼다.
 *
 * 규칙 기반이며 결정적이다. AI·네트워크·시간·난수에 의존하지 않고, 같은 입력은 언제나 같은 계획을 낸다.
 * 새 검색 엔진이 아니다. 한글→영문 번역은 reference-query-language 의 제한 어휘를 그대로 쓰고
 * (material-intent-lexicon 이 그 사전을 호출한다), 사전에 없는 낱말은 지우지 않고 `unresolved` 로
 * 드러낸 채 원문을 검색어에 보존한다. 제공처 호출은 이 모듈이 하지 않는다 — 호출 여부는 UI 가
 * 사용자의 명시적 행동으로만 결정한다.
 *
 * 입력은 NFKC 로 정규화하고 80자(REFERENCE_QUERY_MAX_LENGTH)로 자른다.
 */
import {
  genericDictionaryConcept,
  isMaterialEnglishStopWord,
  isMaterialFunctionalWord,
  MATERIAL_LEXICON,
  MATERIAL_WEATHER_CITIES,
} from "./material-intent-lexicon";
import { REFERENCE_QUERY_MAX_LENGTH, resolveGbifSpeciesAlias } from "./reference-query-language";

import type { ResourceProvider } from "./creator-resources";
import type {
  MaterialCueAxis,
  MaterialCueConcept,
  MaterialCueKind,
  MaterialLensId,
  MaterialLensWeights,
  MaterialMarketKind,
  MaterialMarketLicense,
} from "./material-intent-lexicon";

export type {
  MaterialCueAxis,
  MaterialCueKind,
  MaterialLensId,
  MaterialMarketKind,
  MaterialMarketLicense,
} from "./material-intent-lexicon";
export { MATERIAL_WEATHER_CITIES } from "./material-intent-lexicon";

export const MATERIAL_INTENT_MAX_LENGTH = REFERENCE_QUERY_MAX_LENGTH;

/** 렌즈가 호출할 수 있는 제공처. 모두 /api/creator-resources/search 가 이미 지원하는 값이다. */
export type MaterialLensProvider = Extract<
  ResourceProvider,
  | "polyhaven" | "ambientcg"
  | "met" | "aic" | "cleveland" | "rijksmuseum" | "vam"
  | "internetarchive" | "wikimedia" | "smithsonian" | "europeana" | "dpla"
  | "kheritage" | "tourapi" | "korean"
  | "metweather" | "gbif" | "googlefonts"
>;

export interface MaterialLensDefinition {
  readonly id: MaterialLensId;
  readonly label: string;
  readonly labelEn: string;
  /** 우선순위 순서. 마켓·내 라이브러리는 제공처 호출이 없어 비어 있다. */
  readonly providers: readonly MaterialLensProvider[];
  /** 사용자가 제출한 직후 먼저 호출하는 제공처 수. 나머지는 사용자가 "다른 제공처에서도 찾기"를 눌러야 한다. */
  readonly initialProviders: number;
}

/** 제출 한 번에 나가는 제공처 호출을 서버의 분당 20회 제한 안에서 작게 유지하기 위한 렌즈별 선두 제공처 수. */
export const MATERIAL_LENS_DEFINITIONS: readonly MaterialLensDefinition[] = Object.freeze([
  { id: "3d-material", label: "3D·재질 소재", labelEn: "3D & materials", providers: ["polyhaven", "ambientcg"], initialProviders: 2 },
  { id: "reference-art", label: "미술·복식 레퍼런스", labelEn: "Art & costume references", providers: ["met", "aic", "cleveland", "rijksmuseum", "vam"], initialProviders: 2 },
  { id: "photo-archive", label: "사진·역사 아카이브", labelEn: "Photo & history archives", providers: ["internetarchive", "wikimedia", "smithsonian", "europeana", "dpla"], initialProviders: 1 },
  { id: "korean-place", label: "한국 장소·고증", labelEn: "Korean places & heritage", providers: ["kheritage", "tourapi", "korean"], initialProviders: 2 },
  { id: "weather-light", label: "날씨·빛 참고", labelEn: "Weather & light", providers: ["metweather"], initialProviders: 1 },
  { id: "creature", label: "생물·크리처", labelEn: "Creatures & species", providers: ["gbif"], initialProviders: 1 },
  { id: "font", label: "폰트·레터링", labelEn: "Fonts & lettering", providers: ["googlefonts"], initialProviders: 1 },
  { id: "market-resource", label: "마켓 리소스", labelEn: "Market resources", providers: [], initialProviders: 0 },
  { id: "my-library", label: "내 라이브러리", labelEn: "My library", providers: [], initialProviders: 0 },
]);

const LENS_BY_ID: ReadonlyMap<MaterialLensId, MaterialLensDefinition> = new Map(
  MATERIAL_LENS_DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function materialLensDefinition(id: MaterialLensId): MaterialLensDefinition {
  const definition = LENS_BY_ID.get(id);
  if (!definition) throw new Error(`알 수 없는 소재 렌즈: ${id}`);
  return definition;
}

/** 마켓에서 실제로 존재함이 확인된 공개 태그. 이 밖의 낱말은 태그가 아니라 검색어로만 보낸다. */
export const MATERIAL_MARKET_TAGS: readonly string[] = Object.freeze(["학교", "소품", "3D", "배경"]);

export interface MaterialIntentCue {
  readonly id: string;
  /** 대표 한글 표기 */
  readonly label: string;
  /** 문장에서 실제로 일치한 첫 표현 */
  readonly surface: string;
  /** 영문 인덱스 제공처에 보내는 검색어 */
  readonly term: string;
  readonly kind: MaterialCueKind;
  /** 이 단서가 가리키는 렌즈 */
  readonly lenses: readonly MaterialLensId[];
  /** 사용자가 끈 단서. 점수·검색어·충돌 판정에서 빠진다. */
  readonly excluded: boolean;
  /** 분위기처럼 검색어에는 쓰지 않는 보조 단서 */
  readonly neutral: boolean;
}

export interface MaterialIntentLens {
  readonly id: MaterialLensId;
  readonly label: string;
  readonly labelEn: string;
  readonly providers: readonly MaterialLensProvider[];
  /** 렌즈의 대표 검색어. 제공처별로 다르면 providerQueries 가 우선한다. */
  readonly providerQuery: string;
  /** 제공처별로 실제 보낼 검색어. 키가 없는 제공처는 보낼 검색어를 만들 수 없는 곳이다. */
  readonly providerQueries: Readonly<Partial<Record<MaterialLensProvider, string>>>;
  readonly reason: string;
  readonly reasonEn: string;
  /** 0~1. 근거 단서의 세기와 충돌 여부로 정한 상대 신호이며 정확도 보증이 아니다. */
  readonly confidence: number;
  /** 이 렌즈를 고른 근거 단서 id */
  readonly cueIds: readonly string[];
  /** 렌즈를 쓰려면 사용자가 더 알려야 하는 것. 날씨·빛은 지원 도시가 필요하다. */
  readonly requires?: "city";
}

export interface MaterialMarketPlan {
  readonly kind?: MaterialMarketKind;
  readonly license?: MaterialMarketLicense;
  /** MATERIAL_MARKET_TAGS 안의 태그만. 마켓 URL 은 첫 태그 하나만 필터로 쓴다. */
  readonly tags: readonly string[];
  /** 마켓 검색어(한글 낱말, 최대 80자) */
  readonly query: string;
}

export interface MaterialIntentConflict {
  readonly axis: MaterialCueAxis;
  readonly cueIds: readonly string[];
  readonly message: string;
  readonly messageEn: string;
}

export type MaterialIntentStatus = "empty" | "ready" | "fallback";

export interface MaterialIntentPlan {
  readonly version: 1;
  /** NFKC 정규화·공백 정리·80자 상한을 적용한 입력 */
  readonly input: string;
  readonly truncated: boolean;
  /** 80자 상한을 적용하기 전의 정규화된 길이 */
  readonly originalLength: number;
  readonly status: MaterialIntentStatus;
  readonly cues: readonly MaterialIntentCue[];
  readonly lenses: readonly MaterialIntentLens[];
  /** 근거는 있지만 기준에 못 미쳐 고르지 않은 렌즈. 사용자가 켜 볼 수 있다. */
  readonly alternatives: readonly MaterialIntentLens[];
  readonly market: MaterialMarketPlan;
  readonly myLibrary: { readonly keywords: readonly string[] };
  /** 사전에 없어 번역하지 못한 한글 낱말. 지우지 않고 검색어에 그대로 보존한다. */
  readonly unresolved: readonly string[];
  /** 영문 고유명사처럼 번역이 필요 없어 그대로 보내는 낱말 */
  readonly passthrough: readonly string[];
  readonly conflicts: readonly MaterialIntentConflict[];
}

export interface MaterialIntentPlanOptions {
  /** 사용자가 끈 단서 id(`MaterialIntentCue.id` 또는 `free:낱말`). */
  readonly exclude?: readonly string[];
}

/** 렌즈가 실제로 제공처를 호출할 수 있는지(보낼 검색어가 하나라도 있는지) */
export function isSearchableLens(lens: MaterialIntentLens): boolean {
  return lens.providers.length > 0 && Object.keys(lens.providerQueries).length > 0;
}

// ── 입력 정규화 ──────────────────────────────────────────────────────────

const INPUT_GUARD_LENGTH = 10_000;
const HANGUL = /\p{Script=Hangul}/u;

function stripControlCharacters(value: string): string {
  let output = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    output += code < 32 || code === 127 ? " " : character;
  }
  return output;
}

/** 서로게이트 쌍을 가르지 않고, 가능하면 낱말 경계에서 자른다. */
function capLength(value: string, limit: number): string {
  if (value.length <= limit) return value;
  let cut = value.slice(0, limit);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  const boundary = cut.lastIndexOf(" ");
  if (boundary >= Math.floor(limit / 2) && value.charAt(cut.length) !== " ") cut = cut.slice(0, boundary);
  return cut.trim();
}

export interface NormalizedMaterialInput {
  readonly text: string;
  readonly truncated: boolean;
  readonly originalLength: number;
}

export function normalizeMaterialIntentInput(input: string): NormalizedMaterialInput {
  const bounded = input.length > INPUT_GUARD_LENGTH ? input.slice(0, INPUT_GUARD_LENGTH) : input;
  const normalized = stripControlCharacters(bounded.normalize("NFKC")).replace(/\s+/gu, " ").trim();
  const text = capLength(normalized, MATERIAL_INTENT_MAX_LENGTH);
  return { text, truncated: normalized.length > MATERIAL_INTENT_MAX_LENGTH, originalLength: normalized.length };
}

// ── 토큰화·단서 일치 ─────────────────────────────────────────────────────

interface Token {
  readonly text: string;
  readonly lower: string;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(/[\p{L}\p{N}]+(?:[.\-'’][\p{L}\p{N}]+)*/gu)) {
    tokens.push({ text: match[0], lower: match[0].toLowerCase() });
  }
  return tokens;
}

/** 긴 조사부터 시도한다. 사전에 있는 어간에만 적용해 이름 속 글자를 잘못 떼지 않는다. */
const PARTICLES: readonly string[] = [
  "에서", "으로", "에게", "까지", "부터", "처럼", "보다", "한테", "이랑",
  "의", "을", "를", "은", "는", "이", "가", "에", "와", "과", "도", "로", "만", "랑",
];
/** 떼어도 이름이 깨질 위험이 거의 없는 두 글자 조사. 사전에 없는 낱말을 정리할 때만 쓴다. */
const SAFE_PARTICLES: readonly string[] = ["에서", "으로", "에게", "까지", "부터", "처럼", "보다", "한테"];

function lookupExact(phrase: string): MaterialCueConcept | undefined {
  const lower = phrase.toLowerCase();
  return MATERIAL_LEXICON.bySurface.get(lower)
    ?? MATERIAL_LEXICON.byCompact.get(lower.replace(/\s+/gu, ""))
    ?? MATERIAL_LEXICON.byEnglish.get(lower);
}

function lookupWithParticle(phrase: string): MaterialCueConcept | undefined {
  const direct = lookupExact(phrase);
  if (direct) return direct;
  for (const particle of PARTICLES) {
    if (phrase.length <= particle.length || !phrase.endsWith(particle)) continue;
    const stem = lookupExact(phrase.slice(0, -particle.length));
    if (stem) return stem;
  }
  return undefined;
}

function stripSafeParticle(token: string): string {
  for (const particle of SAFE_PARTICLES) {
    if (token.length - particle.length >= 2 && token.endsWith(particle)) return token.slice(0, -particle.length);
  }
  return token;
}

type EraModifier = "early" | "mid" | "late";
const ERA_MODIFIERS: ReadonlyMap<string, EraModifier> = new Map([
  ["초", "early"], ["초반", "early"], ["초기", "early"], ["전기", "early"],
  ["중", "mid"], ["중반", "mid"], ["중기", "mid"],
  ["말", "late"], ["말기", "late"], ["후반", "late"], ["후기", "late"],
]);
const ERA_MODIFIER_LABEL: Readonly<Record<EraModifier, string>> = { early: "초", mid: "중반", late: "말" };

const DECADE_FEEDS: MaterialLensWeights = { "photo-archive": 3, "reference-art": 2, "korean-place": 1 };
const MODERN_CENTURY_FEEDS: MaterialLensWeights = { "photo-archive": 3, "reference-art": 2 };
const OLD_ERA_FEEDS: MaterialLensWeights = { "reference-art": 3, "photo-archive": 1 };

function eraConcept(label: string, term: string, value: string, feeds: MaterialLensWeights): MaterialCueConcept {
  return { id: `era:${label}`, kind: "era", ko: label, term, feeds, axis: "era", value };
}

function ordinal(value: number): string {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  switch (value % 10) {
    case 1: return `${value}st`;
    case 2: return `${value}nd`;
    case 3: return `${value}rd`;
    default: return `${value}th`;
  }
}

function decadeConcept(year: number, label: string): MaterialCueConcept | null {
  if (year < 1000 || year > 2090 || year % 10 !== 0) return null;
  return eraConcept(label, `${year}s`, `decade-${year}`, year >= 1840 ? DECADE_FEEDS : OLD_ERA_FEEDS);
}

function centuryConcept(century: number, label: string): MaterialCueConcept | null {
  if (!Number.isInteger(century) || century < 1 || century > 21) return null;
  return eraConcept(label, `${ordinal(century)} century`, `century-${century}`, century >= 19 ? MODERN_CENTURY_FEEDS : OLD_ERA_FEEDS);
}

/** 숫자로 적은 시대(1980년대·80년대·1980s·1945년·19세기)를 단서로 올린다. 모호한 두 자리(20년대)는 올리지 않는다. */
function numericEra(token: string): MaterialCueConcept | null {
  let match = /^(\d{4})년대$/u.exec(token);
  if (match?.[1]) return decadeConcept(Number(match[1]), token);
  match = /^(\d{2})년대$/u.exec(token);
  if (match?.[1]) {
    const short = Number(match[1]);
    // 00·10·20년대는 1900년대인지 2000년대인지 알 수 없어 올리지 않는다(미지원 낱말로 남는다).
    return short >= 30 ? decadeConcept(1900 + short, token) : null;
  }
  match = /^(\d{4})s$/u.exec(token);
  if (match?.[1]) return decadeConcept(Number(match[1]), token);
  match = /^(\d{2})s$/u.exec(token);
  if (match?.[1]) {
    const short = Number(match[1]);
    return short >= 30 ? decadeConcept(1900 + short, token) : null;
  }
  match = /^(\d{4})년$/u.exec(token);
  if (match?.[1]) {
    const year = Number(match[1]);
    if (year < 1000 || year > 2100) return null;
    return eraConcept(token, String(year), `year-${year}`, year >= 1840 ? DECADE_FEEDS : OLD_ERA_FEEDS);
  }
  match = /^(\d{1,2})세기$/u.exec(token);
  if (match?.[1]) return centuryConcept(Number(match[1]), token);
  return null;
}

function applyEraModifier(concept: MaterialCueConcept, modifier: EraModifier): MaterialCueConcept {
  return {
    ...concept,
    ko: `${concept.ko} ${ERA_MODIFIER_LABEL[modifier]}`,
    term: `${modifier} ${concept.term}`,
  };
}

/**
 * 띄어쓰기 없이 붙여 쓴 긴 낱말("비오는골목야경")을 사전 표면형만으로 빈틈없이 나눌 수 있을 때만 나눈다.
 * 한 조각이라도 사전 밖이면 나누지 않는다 — 임의의 이름을 조각내지 않는다는 reference-query-language 의 원칙과 같다.
 */
function segmentCompound(token: string): string[] | null {
  const length = token.length;
  if (length < 4 || length > 24 || !/^\p{Script=Hangul}+$/u.test(token)) return null;
  const best: (number | undefined)[] = Array.from({ length: length + 1 }, () => undefined);
  const previous: number[] = Array.from({ length: length + 1 }, () => 0);
  best[0] = 0;
  for (let end = 2; end <= length; end += 1) {
    for (let start = 0; start <= end - 2; start += 1) {
      const base = best[start];
      if (base === undefined) continue;
      const part = token.slice(start, end);
      if (!MATERIAL_LEXICON.bySurface.has(part) && !MATERIAL_LEXICON.byCompact.has(part) && !isMaterialFunctionalWord(part)) continue;
      const current = best[end];
      if (current === undefined || base + 1 < current) {
        best[end] = base + 1;
        previous[end] = start;
      }
    }
  }
  if (best[length] === undefined) return null;
  const parts: string[] = [];
  for (let end = length; end > 0; end = previous[end] ?? 0) parts.unshift(token.slice(previous[end] ?? 0, end));
  return parts.length >= 2 ? parts : null;
}

function expandCompounds(tokens: readonly Token[]): Token[] {
  const expanded: Token[] = [];
  for (const token of tokens) {
    const known = lookupWithParticle(token.text) !== undefined
      || numericEra(token.lower) !== null
      || isMaterialFunctionalWord(token.lower);
    const parts = known ? null : segmentCompound(token.text);
    if (parts) for (const part of parts) expanded.push({ text: part, lower: part.toLowerCase() });
    else expanded.push(token);
  }
  return expanded;
}

interface Segment {
  readonly concept: MaterialCueConcept;
  readonly surface: string;
  readonly position: number;
  readonly modifier?: EraModifier;
}

interface FreeToken {
  readonly text: string;
  readonly hangul: boolean;
  readonly position: number;
}

interface MatchResult {
  readonly segments: readonly Segment[];
  readonly free: readonly FreeToken[];
}

/** 숫자만이거나 "3명"·"10마리"처럼 수량을 말하는 낱말. 연대("20년대")는 모호함을 드러내려고 수량으로 보지 않는다. */
function isQuantity(token: string): boolean {
  return /^\d+$/u.test(token) || /^\d+(?!년대)\p{Script=Hangul}{1,2}$/u.test(token);
}

function matchTokens(tokens: readonly Token[]): MatchResult {
  const segments: Segment[] = [];
  const free: FreeToken[] = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token) break;
    let concept: MaterialCueConcept | null | undefined = numericEra(token.lower);
    let consumed = 1;
    let surface = token.text;
    if (!concept && /^\d{1,2}(?:st|nd|rd|th)$/u.test(token.lower) && tokens[index + 1]?.lower === "century") {
      concept = centuryConcept(Number(token.lower.replace(/\D/gu, "")), `${token.text} century`);
      consumed = 2;
      surface = `${token.text} century`;
    }
    if (!concept) {
      for (let length = Math.min(4, tokens.length - index); length >= 1 && !concept; length -= 1) {
        const phrase = tokens.slice(index, index + length).map((entry) => entry.text).join(" ");
        const found = length === 1
          ? lookupWithParticle(phrase) ?? genericDictionaryConcept(phrase) ?? genericDictionaryConcept(stripSafeParticle(phrase))
          : lookupWithParticle(phrase);
        if (found) {
          concept = found;
          consumed = length;
          surface = phrase;
        }
      }
    }
    if (concept) {
      let modifier: EraModifier | undefined;
      const next = tokens[index + consumed];
      if (concept.kind === "era" && next) {
        modifier = ERA_MODIFIERS.get(next.lower);
        if (modifier) consumed += 1;
      }
      segments.push({ concept, surface, position: index, ...(modifier ? { modifier } : {}) });
      index += consumed;
      continue;
    }
    const position = index;
    index += 1;
    const lower = token.lower;
    if (isQuantity(lower) || isMaterialFunctionalWord(lower) || isMaterialEnglishStopWord(lower)) continue;
    if (HANGUL.test(token.text)) {
      const cleaned = stripSafeParticle(token.text);
      if (cleaned.length >= 2) free.push({ text: cleaned, hangul: true, position });
    } else {
      free.push({ text: token.text, hangul: false, position });
    }
  }
  return { segments, free };
}

// ── 점수·렌즈 선택 ───────────────────────────────────────────────────────

/** 렌즈 점수가 이 값보다 작으면 고르지 않는다. */
const LENS_MIN_SCORE = 2;
/** 가장 높은 렌즈 점수 대비 이 비율보다 작으면 고르지 않는다(약한 곁다리 렌즈 제거). */
const LENS_RELATIVE_FLOOR = 0.35;
const MAX_FREE_TOKENS = 2;
/** 고른 렌즈가 모두 제공처를 부를 수 없을 때 대안에서 올리는 렌즈의 최대 수 */
const MAX_PROMOTED_LENSES = 1;
/** 사용자가 켜 볼 수 있는 대안 렌즈 칩의 최대 수 */
const MAX_ALTERNATIVE_LENSES = 3;

const LENS_ORDER: readonly MaterialLensId[] = MATERIAL_LENS_DEFINITIONS.map((definition) => definition.id);
const CONTENT_KINDS: ReadonlySet<MaterialCueKind> = new Set([
  "place", "nature", "material", "state", "texture", "prop", "armor", "costume", "figure", "art", "myth",
  "creature", "plant", "weather", "time", "light", "season", "era", "style", "heritage", "city",
  "foreign-place", "historic", "photo", "noun",
]);
/** 영문 인덱스 렌즈 검색어에 "주제 낱말"로 곁들일 수 있는 단서 종류 */
const SUBJECT_KINDS: ReadonlySet<MaterialCueKind> = new Set([
  "creature", "plant", "figure", "costume", "armor", "myth", "prop", "place", "nature", "material",
  "heritage", "city", "foreign-place", "art", "noun",
]);
/** 주제를 꾸미는 분위기·시간·날씨 계열 단서 */
const MODIFIER_KINDS: ReadonlySet<MaterialCueKind> = new Set(["time", "weather", "light", "season", "state", "style"]);
/** 3D 모델을 찾는다고 말했을 때("고양이 3D 모델") 모델의 주제가 될 수 있는 단서 종류 */
const THREE_D_SUBJECT_KINDS: ReadonlySet<MaterialCueKind> = new Set([
  "creature", "figure", "costume", "armor", "myth", "heritage", "plant", "prop", "place", "nature", "material",
]);
/** 3D 제공처에서는 종류·형식을 말하는 단서의 영문 낱말이 검색어를 오히려 좁혀 버리므로 검색어에서 뺀다. */
const THREE_D_TYPE_KINDS: ReadonlySet<MaterialCueKind> = new Set(["three-d", "texture"]);

interface ActiveCue {
  readonly cue: MaterialIntentCue;
  readonly concept: MaterialCueConcept;
  /** 문장 안 위치(토큰 순번) */
  readonly order: number;
}

function weightFor(concept: MaterialCueConcept, lens: MaterialLensId): number {
  return concept.feeds[lens] ?? 0;
}

function scoreLens(cues: readonly ActiveCue[], lens: MaterialLensId): number {
  return cues.reduce((sum, entry) => sum + weightFor(entry.concept, lens), 0);
}

function pickTop(
  cues: readonly ActiveCue[],
  weightOf: (entry: ActiveCue) => number,
  limit: number,
): ActiveCue[] {
  const candidates = cues.filter((entry) => weightOf(entry) > 0 && !entry.cue.neutral);
  return [...candidates]
    .sort((left, right) => weightOf(right) - weightOf(left) || left.order - right.order)
    .slice(0, limit)
    .sort((left, right) => left.order - right.order);
}

/**
 * 낱말 목록을 검색어 하나로 합친다. 대소문자만 다른 중복과, 더 긴 낱말에 통째로 들어 있는 짧은 낱말은 버리고,
 * 80자를 넘으면 뒤쪽 낱말부터 덜어 낸다(제공처 검색어 상한과 같다).
 */
function joinQuery(parts: readonly string[]): string {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  const kept = unique.filter((part, index) => !unique.some((other, otherIndex) => (
    otherIndex !== index && other.length > part.length && ` ${other.toLowerCase()} `.includes(` ${part.toLowerCase()} `)
  )));
  while (kept.length > 1 && kept.join(" ").length > MATERIAL_INTENT_MAX_LENGTH) kept.pop();
  return kept.join(" ").slice(0, MATERIAL_INTENT_MAX_LENGTH).trim();
}

function validProviderQuery(value: string): boolean {
  return value.length >= 2 && value.length <= MATERIAL_INTENT_MAX_LENGTH;
}

interface QueryContext {
  readonly active: readonly ActiveCue[];
  readonly freeTokens: readonly FreeToken[];
}

/** 영문 인덱스 제공처 검색어: 렌즈에 맞는 단서를 세기순으로 고르고, 사전 밖 낱말은 문장 위치대로 곁들인다. */
function englishQuery(
  context: QueryContext,
  limit: number,
  weightOf: (entry: ActiveCue) => number,
): string {
  const items: { position: number; text: string }[] = [
    ...pickTop(context.active, weightOf, limit).map((entry) => ({ position: entry.order, text: entry.concept.term })),
    ...context.freeTokens.slice(0, MAX_FREE_TOKENS).map((entry) => ({ position: entry.position, text: entry.text })),
  ];
  return joinQuery(items.sort((left, right) => left.position - right.position).map((item) => item.text));
}

/** 렌즈가 직접 가리키는 단서 + 주제·분위기 단서(곁들임, 세기 1) */
function withSubjects(lens: MaterialLensId): (entry: ActiveCue) => number {
  return (entry) => {
    const own = weightFor(entry.concept, lens);
    if (own > 0) return own;
    return SUBJECT_KINDS.has(entry.concept.kind) || MODIFIER_KINDS.has(entry.concept.kind) ? 1 : 0;
  };
}

function threeDMaterialQuery(context: QueryContext): string {
  const wantsModel = context.active.some((entry) => entry.concept.kind === "three-d");
  const weightOf = (entry: ActiveCue): number => {
    if (THREE_D_TYPE_KINDS.has(entry.concept.kind)) return 0;
    const own = weightFor(entry.concept, "3d-material");
    return own > 0 ? own : wantsModel && THREE_D_SUBJECT_KINDS.has(entry.concept.kind) ? 2 : 0;
  };
  return englishQuery(context, 2, weightOf);
}

const KOREAN_PLACE_KINDS: readonly MaterialCueKind[] = ["heritage", "city", "place"];

function koreanLabels(context: QueryContext, kinds: readonly MaterialCueKind[]): string[] {
  return context.active.filter((entry) => kinds.includes(entry.concept.kind)).map((entry) => entry.concept.ko);
}

function firstKorean(context: QueryContext, kinds: readonly MaterialCueKind[]): string {
  for (const kind of kinds) {
    const found = context.active.find((entry) => entry.concept.kind === kind);
    if (found) return found.concept.ko;
  }
  return "";
}

type LensQueries = Partial<Record<MaterialLensProvider, string>>;

function assignQuery(target: LensQueries, provider: MaterialLensProvider, query: string): void {
  if (validProviderQuery(query)) target[provider] = query;
}

function buildProviderQueries(lens: MaterialLensId, context: QueryContext): { queries: LensQueries; requires?: "city" } {
  const queries: LensQueries = {};
  switch (lens) {
    case "3d-material": {
      const query = threeDMaterialQuery(context);
      assignQuery(queries, "polyhaven", query);
      assignQuery(queries, "ambientcg", query);
      return { queries };
    }
    case "reference-art": {
      const query = englishQuery(context, 3, withSubjects(lens));
      for (const provider of ["met", "aic", "cleveland", "rijksmuseum", "vam"] as const) assignQuery(queries, provider, query);
      return { queries };
    }
    case "photo-archive": {
      const query = englishQuery(context, 4, withSubjects(lens));
      for (const provider of ["internetarchive", "smithsonian", "europeana", "dpla"] as const) assignQuery(queries, provider, query);
      // wikimedia 는 문서 제목 하나의 조회 추이를 보는 한글 네이티브 제공처다.
      assignQuery(queries, "wikimedia", firstKorean(context, ["city", "heritage", "foreign-place", "era", "place"]));
      return { queries };
    }
    case "korean-place": {
      assignQuery(queries, "kheritage", firstKorean(context, ["heritage", "city", "place"]));
      assignQuery(queries, "tourapi", joinQuery(koreanLabels(context, KOREAN_PLACE_KINDS).slice(0, 2)));
      assignQuery(queries, "korean", firstKorean(context, ["place", "heritage", "city"]));
      return { queries };
    }
    case "weather-light": {
      const city = context.active.find((entry) => MATERIAL_WEATHER_CITIES.includes(entry.concept.ko))?.concept.ko;
      if (city) {
        queries.metweather = city;
        return { queries };
      }
      return { queries, requires: "city" };
    }
    case "creature": {
      const found = context.active.find((entry) => entry.concept.kind === "creature")
        ?? context.active.find((entry) => entry.concept.kind === "plant");
      if (!found) return { queries };
      // GBIF 는 질의 전체가 한글 별칭표의 키일 때만 서버가 학명으로 풀어 준다.
      assignQuery(queries, "gbif", resolveGbifSpeciesAlias(found.concept.ko) !== null ? found.concept.ko : found.concept.term);
      return { queries };
    }
    case "font": {
      const style = context.active.find((entry) => entry.concept.kind === "font-style");
      // Google Fonts 검색은 낱말을 모두 만족하는 곳만 남기므로 한글 지원 + 스타일 한 가지로 좁힌다.
      assignQuery(queries, "googlefonts", joinQuery(["korean", style?.concept.term ?? ""]));
      return { queries };
    }
    default:
      return { queries };
  }
}

// ── 마켓·내 라이브러리 ───────────────────────────────────────────────────

const MARKET_TAG_PRIORITY: readonly string[] = ["학교", "소품", "3D", "배경"];
const MARKET_QUERY_KINDS: ReadonlySet<MaterialCueKind> = new Set([
  "place", "nature", "material", "prop", "armor", "costume", "figure", "art", "myth", "creature", "plant",
  "weather", "time", "light", "season", "heritage", "city", "foreign-place", "style", "noun",
]);

function maxWeight(concept: MaterialCueConcept): number {
  return Math.max(0, ...Object.values(concept.feeds));
}

function buildMarketPlan(active: readonly ActiveCue[], freeTokens: readonly FreeToken[]): MaterialMarketPlan {
  const kindCue = active.find((entry) => entry.concept.marketKind);
  const licenseCue = active.find((entry) => entry.concept.marketLicense);
  const tagSet = new Set<string>();
  for (const entry of active) {
    const tag = entry.concept.marketTag;
    if (tag && MATERIAL_MARKET_TAGS.includes(tag)) tagSet.add(tag);
  }
  let kind: MaterialMarketKind | undefined = kindCue?.concept.marketKind;
  // 마켓의 2D 하위 분류(배경·소품·학교)는 모두 asset 종류 아래에 있다.
  if (!kind && [...tagSet].some((tag) => tag === "학교" || tag === "소품" || tag === "배경")) kind = "asset";
  let tags = MARKET_TAG_PRIORITY.filter((tag) => tagSet.has(tag));
  // 3D 에셋 아래에서 확인된 태그는 소품과 3D 뿐이다. 나머지는 검색어로 돌린다.
  const spilled: string[] = [];
  if (kind === "3d-asset") {
    spilled.push(...tags.filter((tag) => tag !== "소품" && tag !== "3D"));
    tags = tags.filter((tag) => tag === "소품" || tag === "3D");
  }
  const labels = active
    .filter((entry) => MARKET_QUERY_KINDS.has(entry.concept.kind) && !entry.cue.neutral)
    .filter((entry) => !MATERIAL_MARKET_TAGS.includes(entry.concept.ko));
  const specific = labels.length > 1 ? labels.filter((entry) => entry.concept.ko.length > 1) : labels;
  const strongest = [...specific]
    .sort((left, right) => maxWeight(right.concept) - maxWeight(left.concept) || left.order - right.order)
    .slice(0, 3)
    .map((entry) => ({ position: entry.order, text: entry.concept.ko }));
  // 사전에 없는 낱말도 마켓 검색어에는 그대로 남긴다(마켓은 한글 이름·태그로 찾으므로 버리면 사용자의 말이 사라진다).
  const preserved = freeTokens.slice(0, MAX_FREE_TOKENS).map((entry) => ({ position: entry.position, text: entry.text }));
  const ordered = [...strongest, ...preserved].sort((left, right) => left.position - right.position).map((item) => item.text);
  return {
    ...(kind ? { kind } : {}),
    ...(licenseCue?.concept.marketLicense ? { license: licenseCue.concept.marketLicense } : {}),
    tags,
    query: joinQuery([...ordered, ...spilled]),
  };
}

function buildLibraryKeywords(active: readonly ActiveCue[]): string[] {
  const content = active.filter((entry) => CONTENT_KINDS.has(entry.concept.kind) && !entry.cue.neutral);
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const value of [...content.map((entry) => entry.concept.ko), ...content.map((entry) => entry.concept.term)]) {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    keywords.push(value);
    if (keywords.length >= 8) break;
  }
  return keywords;
}

// ── 충돌 ────────────────────────────────────────────────────────────────

/** 같은 축에서 함께 쓰기 어려운 값 쌍. 순서는 상관없다. */
const OPPOSING_VALUES: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  time: [["night", "day"], ["dawn", "dusk"]],
  weather: [["clear", "rain"], ["clear", "snow"], ["clear", "fog"], ["clear", "overcast"], ["clear", "storm"], ["rain", "snow"]],
};
/** 서로 다른 값이 둘 이상 나오면 모두 충돌로 보는 축 */
const EXCLUSIVE_AXES: ReadonlySet<MaterialCueAxis> = new Set(["season", "era", "market-kind", "license"]);
const AXIS_ORDER: readonly MaterialCueAxis[] = ["time", "weather", "season", "era", "market-kind", "license"];

function opposing(axis: string, left: string, right: string): boolean {
  return (OPPOSING_VALUES[axis] ?? []).some(([a, b]) => (a === left && b === right) || (a === right && b === left));
}

function conflictMessages(labels: readonly string[], terms: readonly string[]): { message: string; messageEn: string } {
  return {
    message: `${labels.map((label) => `‘${label}’`).join(" · ")} — 서로 어긋나는 단서예요. 필요한 쪽만 켜 두세요.`,
    messageEn: `${terms.map((term) => `‘${term}’`).join(" · ")} — these cues pull in different directions. Keep only the one you need.`,
  };
}

function conflictOf(axis: MaterialCueAxis, entries: readonly ActiveCue[]): MaterialIntentConflict {
  return {
    axis,
    cueIds: entries.map((entry) => entry.cue.id),
    ...conflictMessages(entries.map((entry) => entry.concept.ko), entries.map((entry) => entry.concept.term)),
  };
}

function detectConflicts(active: readonly ActiveCue[]): MaterialIntentConflict[] {
  const conflicts: MaterialIntentConflict[] = [];
  const keyOf = (entry: ActiveCue): string => (entry.concept.marketKind ? `kind:${entry.concept.marketKind}` : entry.concept.value ?? "");
  for (const axis of AXIS_ORDER) {
    const values = new Map<string, ActiveCue>();
    for (const entry of active) {
      const key = keyOf(entry);
      if (entry.concept.axis === axis && key && !values.has(key)) values.set(key, entry);
    }
    const distinct = [...values.values()];
    if (distinct.length < 2) continue;
    if (EXCLUSIVE_AXES.has(axis)) {
      conflicts.push(conflictOf(axis, distinct));
      continue;
    }
    const clashing = new Map<string, ActiveCue>();
    distinct.forEach((left, leftIndex) => {
      distinct.slice(leftIndex + 1).forEach((right) => {
        if (!opposing(axis, keyOf(left), keyOf(right))) return;
        clashing.set(left.cue.id, left);
        clashing.set(right.cue.id, right);
      });
    });
    if (clashing.size >= 2) conflicts.push(conflictOf(axis, [...clashing.values()]));
  }
  // 계절과 날씨가 어긋나는 대표 조합(여름의 눈)은 축이 달라도 하나의 충돌로 알린다.
  const summer = active.find((entry) => entry.concept.axis === "season" && entry.concept.value === "summer");
  const snow = active.find((entry) => entry.concept.axis === "weather" && entry.concept.value === "snow");
  if (summer && snow) conflicts.push(conflictOf("season", [summer, snow]));
  return conflicts;
}

// ── 계획 조립 ───────────────────────────────────────────────────────────

const EMPTY_MARKET: MaterialMarketPlan = Object.freeze({ tags: Object.freeze([]) as readonly string[], query: "" });

function roundConfidence(score: number, conflicts: number): number {
  const base = score / (score + 4) - conflicts * 0.1;
  return Math.round(Math.min(0.95, Math.max(0.2, base)) * 100) / 100;
}

function buildReason(cues: readonly ActiveCue[]): { reason: string; reasonEn: string } {
  const shown = cues.slice(0, 4);
  return {
    reason: `${shown.map((entry) => `‘${entry.concept.ko}’`).join(", ")} 단서에서 골랐어요.`,
    reasonEn: `Picked from the cues ${shown.map((entry) => `‘${entry.concept.term}’`).join(", ")}.`,
  };
}

interface LensOverride {
  readonly reason: string;
  readonly reasonEn: string;
  readonly confidence: number;
}

function lensFrom(
  id: MaterialLensId,
  score: number,
  evidence: readonly ActiveCue[],
  context: QueryContext,
  conflicts: readonly MaterialIntentConflict[],
  override?: LensOverride,
): MaterialIntentLens {
  const definition = materialLensDefinition(id);
  const { queries, requires } = buildProviderQueries(id, context);
  const primary = definition.providers.map((provider) => queries[provider]).find((query) => Boolean(query)) ?? "";
  const evidenceIds = new Set(evidence.map((entry) => entry.cue.id));
  const clashes = conflicts.filter((conflict) => conflict.cueIds.some((cueId) => evidenceIds.has(cueId))).length;
  const described = override ?? { ...buildReason(evidence), confidence: roundConfidence(score, clashes) };
  return {
    id,
    label: definition.label,
    labelEn: definition.labelEn,
    providers: definition.providers,
    providerQuery: primary,
    providerQueries: queries,
    reason: described.reason,
    reasonEn: described.reasonEn,
    confidence: described.confidence,
    cueIds: evidence.map((entry) => entry.cue.id),
    ...(requires ? { requires } : {}),
  };
}

function emptyPlan(normalized: NormalizedMaterialInput): MaterialIntentPlan {
  return {
    version: 1,
    input: normalized.text,
    truncated: normalized.truncated,
    originalLength: normalized.originalLength,
    status: "empty",
    cues: [],
    lenses: [],
    alternatives: [],
    market: EMPTY_MARKET,
    myLibrary: { keywords: [] },
    unresolved: [],
    passthrough: [],
    conflicts: [],
  };
}

export function planMaterialIntent(input: string, options: MaterialIntentPlanOptions = {}): MaterialIntentPlan {
  const normalized = normalizeMaterialIntentInput(input);
  if (!normalized.text) return emptyPlan(normalized);

  const excluded = new Set(options.exclude ?? []);
  const { segments, free } = matchTokens(expandCompounds(tokenize(normalized.text)));

  // 같은 단서가 여러 번 나와도 하나로 합친다(첫 위치 유지).
  const cues: MaterialIntentCue[] = [];
  const active: ActiveCue[] = [];
  const seen = new Set<string>();
  for (const segment of segments) {
    const concept = segment.modifier ? applyEraModifier(segment.concept, segment.modifier) : segment.concept;
    const id = segment.concept.id;
    if (seen.has(id)) continue;
    seen.add(id);
    const cue: MaterialIntentCue = {
      id,
      label: concept.ko,
      surface: segment.surface,
      term: concept.term,
      kind: concept.kind,
      lenses: LENS_ORDER.filter((lens) => weightFor(concept, lens) > 0),
      excluded: excluded.has(id),
      neutral: Boolean(concept.neutral),
    };
    cues.push(cue);
    if (!cue.excluded) active.push({ cue, concept, order: segment.position });
  }

  const unresolved: string[] = [];
  const passthrough: string[] = [];
  const activeFree: FreeToken[] = [];
  for (const token of free) {
    const target = token.hangul ? unresolved : passthrough;
    if (!target.includes(token.text)) target.push(token.text);
    if (!excluded.has(`free:${token.text}`) && !activeFree.some((entry) => entry.text === token.text)) activeFree.push(token);
  }

  const context: QueryContext = { active, freeTokens: activeFree };
  const conflicts = detectConflicts(active);
  const scores = new Map<MaterialLensId, number>(LENS_ORDER.map((lens) => [lens, scoreLens(active, lens)] as const));
  const evidenceFor = (lens: MaterialLensId): ActiveCue[] => active.filter((entry) => weightFor(entry.concept, lens) > 0);
  const build = (lens: MaterialLensId): MaterialIntentLens => lensFrom(lens, scores.get(lens) ?? 0, evidenceFor(lens), context, conflicts);

  const top = Math.max(0, ...scores.values());
  const threshold = Math.max(LENS_MIN_SCORE, top * LENS_RELATIVE_FLOOR);
  // 시대 단서만으로는 렌즈를 세우지 않는다("1980년대"만으로 미술 렌즈를 켜지 않는다).
  const hasSubstance = (lens: MaterialLensId): boolean => evidenceFor(lens).some((entry) => entry.concept.kind !== "era");
  const byScore = (left: MaterialLensId, right: MaterialLensId): number => (
    (scores.get(right) ?? 0) - (scores.get(left) ?? 0) || LENS_ORDER.indexOf(left) - LENS_ORDER.indexOf(right)
  );
  const selectedIds = LENS_ORDER.filter((lens) => (scores.get(lens) ?? 0) >= threshold && hasSubstance(lens)).sort(byScore);
  const alternativeIds = LENS_ORDER.filter((lens) => !selectedIds.includes(lens) && (scores.get(lens) ?? 0) > 0).sort(byScore);

  // 제공처가 있는 렌즈인데 보낼 검색어도, 더 받아야 할 정보(도시)도 없으면 쓸 수 없으므로 후보에서 뺀다.
  const usable = (lens: MaterialIntentLens): boolean => lens.providers.length === 0 || isSearchableLens(lens) || lens.requires !== undefined;
  let lenses = selectedIds.map(build).filter(usable);
  let alternatives = alternativeIds.map(build).filter(usable).slice(0, MAX_ALTERNATIVE_LENSES);

  // 고른 렌즈가 하나도 제공처를 부를 수 없으면(예: "비" 한 낱말 → 도시가 필요한 날씨 렌즈뿐) 근거가 있는 대안을 올린다.
  if (!lenses.some(isSearchableLens)) {
    const promoted = alternatives.filter(isSearchableLens).slice(0, MAX_PROMOTED_LENSES);
    lenses = [...lenses, ...promoted];
    alternatives = alternatives.filter((lens) => !promoted.includes(lens));
  }

  const base = {
    version: 1 as const,
    input: normalized.text,
    truncated: normalized.truncated,
    originalLength: normalized.originalLength,
    cues,
    market: buildMarketPlan(active, activeFree),
    myLibrary: { keywords: buildLibraryKeywords(active) },
    unresolved,
    passthrough,
    conflicts,
  };

  if (lenses.length > 0) return { ...base, status: "ready", lenses, alternatives };

  // 인식한 단서로 렌즈를 세우지 못했다. 입력한 낱말이 남아 있으면 지우지 않고 기본 렌즈로 그대로 찾는다.
  if (activeFree.length > 0) {
    const fallbackLens = lensFrom("reference-art", 0, [], context, conflicts, {
      reason: "인식한 단서가 없어 입력한 낱말을 그대로 찾아요.",
      reasonEn: "No cues were recognised, so your words are searched as typed.",
      confidence: 0.2,
    });
    if (isSearchableLens(fallbackLens)) return { ...base, status: "fallback", lenses: [fallbackLens], alternatives: [] };
  }
  return { ...base, status: "empty", lenses: [], alternatives };
}

/** 마켓 `/market/browse` 의 URL 필터. 마켓은 태그를 하나만 받으므로 나머지는 검색어로 돌린다. */
export interface MaterialMarketParams {
  readonly q?: string;
  readonly kind?: MaterialMarketKind;
  readonly license?: MaterialMarketLicense;
  readonly tag?: string;
}

export function materialMarketParams(market: MaterialMarketPlan): MaterialMarketParams {
  const [tag, ...restTags] = market.tags;
  const query = joinQuery([market.query, ...restTags]);
  return {
    ...(query ? { q: query } : {}),
    ...(market.kind ? { kind: market.kind } : {}),
    ...(market.license ? { license: market.license } : {}),
    ...(tag ? { tag } : {}),
  };
}
