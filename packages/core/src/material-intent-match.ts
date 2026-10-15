/**
 * 자연어 소재 계획기의 앞 단계 — 입력 정규화, 토큰화, 연대·복합어 풀이, 사전 맞춤.
 * material-intent-plan.ts 가 800줄 상한을 넘지 않도록 분리했다. 동작은 그대로이고 결정적이다.
 */
import {
  genericDictionaryConcept,
  isMaterialEnglishStopWord,
  isMaterialFunctionalWord,
  MATERIAL_LEXICON,
} from "./material-intent-lexicon";
import { REFERENCE_QUERY_MAX_LENGTH } from "./reference-query-language";

import type {
  MaterialCueConcept,
  MaterialCueKind,
  MaterialLensWeights,
} from "./material-intent-lexicon";

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
  const text = capLength(normalized, REFERENCE_QUERY_MAX_LENGTH);
  return { text, truncated: normalized.length > REFERENCE_QUERY_MAX_LENGTH, originalLength: normalized.length };
}

// ── 토큰화·단서 일치 ─────────────────────────────────────────────────────

interface Token {
  readonly text: string;
  readonly lower: string;
}

export function tokenize(text: string): Token[] {
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

export function applyEraModifier(concept: MaterialCueConcept, modifier: EraModifier): MaterialCueConcept {
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

export function expandCompounds(tokens: readonly Token[]): Token[] {
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

export interface FreeToken {
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

/** "나무" 바로 뒤에 이런 종류의 낱말이 오면 나무(tree)가 아니라 목재(wood)를 말한 것이다("나무 의자"). */
const WOOD_TARGET_KINDS: ReadonlySet<MaterialCueKind> = new Set(["prop", "armor", "place", "material"]);
const TREE_CONCEPT_ID = "plant:나무";
const WOOD_SURFACE = "원목";
/** "나무로 만든 의자"처럼 재료를 말하는 구문에서 재료와 대상 사이에 오는 낱말 */
const WOOD_BRIDGE_WORDS: ReadonlySet<string> = new Set(["만든", "된", "만들어진"]);

/**
 * 기본 사전은 "나무" 를 tree 로만 번역한다. 그러나 "나무 의자·나무 문·나무 벽"의 나무는 재질이라, tree 로 보내면
 * 3D 제공처(모든 낱말이 맞아야 함)에서 결과가 비어 버린다. 사용자가 한글 "나무" 를 썼고 바로 뒤 낱말이
 * 가구·무기·건축·재질이면(또는 "나무로 만든 의자"처럼 재료 구문이면) 목재 단서로 읽는다.
 * "나무 아래 의자"처럼 사이에 다른 낱말이 있거나 영어로 쓴 "tree house" 는 나무 그대로다.
 */
function woodForTree(
  concept: MaterialCueConcept,
  surface: string,
  tokens: readonly Token[],
  nextIndex: number,
): MaterialCueConcept {
  if (concept.id !== TREE_CONCEPT_ID) return concept;
  const madeOf = surface === "나무로";
  if (surface !== "나무" && !madeOf) return concept;
  let targetIndex = nextIndex;
  if (madeOf) {
    if (!WOOD_BRIDGE_WORDS.has(tokens[targetIndex]?.text ?? "")) return concept;
    targetIndex += 1;
  }
  const target = tokens[targetIndex];
  const following = target ? lookupWithParticle(target.text) : undefined;
  if (!following || following.id === TREE_CONCEPT_ID || !WOOD_TARGET_KINDS.has(following.kind)) return concept;
  const wood = MATERIAL_LEXICON.bySurface.get(WOOD_SURFACE);
  // 사용자가 쓴 표기("나무")를 마켓 검색어·내 라이브러리 키워드에 그대로 남기려고 대표 표기만 이어받는다.
  return wood ? { ...wood, ko: "나무" } : concept;
}

export function matchTokens(tokens: readonly Token[]): MatchResult {
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
      concept = woodForTree(concept, surface, tokens, index + consumed);
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
