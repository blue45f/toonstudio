import type { Title } from "@/shared/lib/types";

/**
 * 기억으로 작품 찾기 — 순수 모델.
 *
 * 제목이 기억나지 않을 때 쓰는 도구라서 **확신이 없는 채로** 결과를 내야 한다. 그래서 결과마다 "어느 단서가 어디와
 * 맞았는지"(근거)와 세 단계의 확신(확인된 일치·추정 일치·약한 후보)을 함께 돌려주고, 아무것도 맞지 않으면 못 찾았다고
 * 말한다. 점수는 정렬에만 쓰고 사용자에게 퍼센트로 보여 주지 않는다 — 시놉시스가 서비스가 직접 쓴 1~3문장
 * 요약이라 점수가 정확도처럼 읽히면 안 된다.
 *
 * 서버 검색은 토큰별 합산(OR) 점수 방식이라 후보를 넓게 가져오고, 여기서는 가져온 작품을 다시 단서와 대조해
 * 근거를 만든다. 입력은 브라우저에서만 쓰이며 어디에도 저장하지 않는다.
 */

export type MemoryTitleKnowledge = "exact" | "partial" | "unknown";
export type MemoryEra = "any" | "before-2010" | "2011-2015" | "2016-2020" | "2021-later";

export interface MemoryClues {
  readonly titleKnowledge: MemoryTitleKnowledge;
  /** 기억하는 제목(또는 조각). `unknown` 이면 쓰지 않는다. */
  readonly titleText: string;
  /** 기억나는 장면이나 줄거리. 필수. */
  readonly scene: string;
  readonly era: MemoryEra;
}

export const MEMORY_SCENE_MAX_LENGTH = 400;
export const MEMORY_TITLE_MAX_LENGTH = 60;
export const MEMORY_RESULT_LIMIT = 12;
const MAX_SCENE_TOKENS = 8;
const MAX_QUERY_LENGTH = 480;

const ERA_RANGE: Record<Exclude<MemoryEra, "any">, readonly [number, number]> = {
  "before-2010": [0, 2010],
  "2011-2015": [2011, 2015],
  "2016-2020": [2016, 2020],
  "2021-later": [2021, 9999],
};

/** 거의 모든 소개에 나오는 말은 단서가 못 된다 — 걸러 내지 않으면 "겹치는 단서"가 부풀려진다. */
const STOPWORDS: ReadonlySet<string> = new Set([
  "장면", "내용", "이야기", "웹툰", "만화", "웹소설", "소설", "나오는", "나오던", "나왔던", "있는", "있던", "없는",
  "하는", "했던", "그리고", "그런데", "그래서", "어떤", "어느", "주인공", "남자", "여자", "사람", "나중에",
  "마지막", "처음", "거기서", "뭔가", "아마", "정도", "같은", "비슷한", "기억", "기억나는", "제목", "작품",
]);

/** 한국어 조사는 붙여 쓰므로 "학교에서" 는 소개의 "학교" 와 안 맞는다 — 조사를 뗀 형태도 함께 시도한다. */
const TRAILING_PARTICLE = /(?:에서|으로|이랑|한테|에게|까지|부터|처럼|은|는|이|가|을|를|에|의|도|로|와|과|랑)$/u;

export interface MemoryToken {
  /** 사용자가 쓴 그대로의 말. 근거 표시에 쓴다. */
  readonly clue: string;
  /** 대조에 쓰는 소문자 형태(조사를 뗀 것 포함). */
  readonly stems: readonly string[];
}

function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function titleFragment(clues: MemoryClues): string {
  if (clues.titleKnowledge === "unknown") return "";
  return clues.titleText.trim().slice(0, MEMORY_TITLE_MAX_LENGTH);
}

function stemsOf(token: string): string[] {
  const stems = [token];
  const stripped = token.replace(TRAILING_PARTICLE, "");
  if (stripped !== token && stripped.length >= 2 && !STOPWORDS.has(stripped)) stems.push(stripped);
  return stems;
}

export function sceneTokens(scene: string): MemoryToken[] {
  const pieces = scene.normalize("NFKC").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const seen = new Set<string>();
  const tokens: MemoryToken[] = [];
  for (const piece of pieces) {
    const lower = piece.toLowerCase();
    // 조사가 붙은 불용어("주인공이")도 불용어다. 한 글자 낱말은 부분 일치가 너무 넓어("비"→"비밀") 단서로 쓰지 않는다.
    const bare = lower.replace(TRAILING_PARTICLE, "");
    if (lower.length < 2 || STOPWORDS.has(lower) || STOPWORDS.has(bare) || /^\d+$/u.test(lower) || seen.has(lower)) continue;
    seen.add(lower);
    tokens.push({ clue: piece, stems: stemsOf(lower) });
    if (tokens.length >= MAX_SCENE_TOKENS) break;
  }
  return tokens;
}

export type MemoryCluesProblem = "scene-empty" | "scene-no-keywords";

/** 검색을 돌릴 수 있는 입력인가. 장면이 비었거나 의미 있는 낱말이 하나도 없으면 문제를 말한다. */
export function memoryCluesProblem(clues: MemoryClues): MemoryCluesProblem | null {
  if (clues.scene.trim().length === 0) return "scene-empty";
  if (sceneTokens(clues.scene).length === 0) return "scene-no-keywords";
  return null;
}

/** 서버 검색에 보낼 질의. 조사를 뗀 형태까지 넣어 서버의 단어 단위 일치가 놓치지 않게 한다. */
export function buildMemorySearchQuery(clues: MemoryClues): string {
  const words: string[] = [];
  const seen = new Set<string>();
  const add = (word: string) => {
    const key = word.toLowerCase();
    if (!word || seen.has(key)) return;
    seen.add(key);
    words.push(word);
  };
  add(titleFragment(clues));
  for (const token of sceneTokens(clues.scene)) {
    add(token.clue);
    for (const stem of token.stems) add(stem);
  }
  return words.join(" ").slice(0, MAX_QUERY_LENGTH).trim();
}

export type MemoryMatchLevel = "confirmed" | "probable" | "weak";
export type MemoryReasonField = "title" | "altTitle" | "author" | "tag" | "genre" | "synopsis" | "year";

export interface MemoryMatchReason {
  readonly field: MemoryReasonField;
  /** 맞은 단서(사용자가 쓴 말). 시기는 시기 이름. */
  readonly clue: string;
}

export interface MemoryMatch {
  readonly title: Title;
  readonly level: MemoryMatchLevel;
  /** 정렬 전용. 사용자에게 보이지 않는다. */
  readonly score: number;
  readonly reasons: readonly MemoryMatchReason[];
}

const LEVEL_ORDER: Record<MemoryMatchLevel, number> = { confirmed: 0, probable: 1, weak: 2 };

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => needle.length > 0 && haystack.includes(needle));
}

/** 한 작품을 단서와 대조한다. 단서가 하나도 맞지 않으면 null(시기만 맞는 것도 근거가 못 된다). */
export function explainMemoryMatch(
  title: Title,
  clues: MemoryClues,
  tokens: readonly MemoryToken[] = sceneTokens(clues.scene),
): MemoryMatch | null {
  const reasons: MemoryMatchReason[] = [];
  let score = 0;
  let confirmed = false;

  const nTitle = normalize(title.title);
  const nAlts = (title.altTitles ?? []).map(normalize);
  const nPeople = [title.author, title.artist ?? ""].map(normalize).filter(Boolean);

  const fragmentText = titleFragment(clues);
  const fragment = normalize(fragmentText);
  if (fragment.length >= 2) {
    if (nTitle === fragment) {
      confirmed = true;
      score += 140;
      reasons.push({ field: "title", clue: fragmentText });
    } else if (nTitle.includes(fragment)) {
      confirmed = true;
      score += 100;
      reasons.push({ field: "title", clue: fragmentText });
    } else if (nAlts.some((alt) => alt === fragment || alt.includes(fragment))) {
      confirmed = true;
      score += 90;
      reasons.push({ field: "altTitle", clue: fragmentText });
    }
  }

  const nTags = title.tags.map(normalize);
  const nGenres = title.genres.map(normalize);
  const nSynopsis = normalize(title.synopsis ?? "");
  let matchedTokens = 0;
  let strongTokenMatch = false;
  for (const token of tokens) {
    const stems = token.stems.map(normalize);
    if (includesAny(nTitle, stems)) {
      score += 40;
      strongTokenMatch = true;
      reasons.push({ field: "title", clue: token.clue });
    } else if (nAlts.some((alt) => includesAny(alt, stems))) {
      score += 30;
      strongTokenMatch = true;
      reasons.push({ field: "altTitle", clue: token.clue });
    } else if (nPeople.some((person) => includesAny(person, stems))) {
      score += 24;
      strongTokenMatch = true;
      reasons.push({ field: "author", clue: token.clue });
    } else if (nTags.some((tag) => includesAny(tag, stems))) {
      score += 14;
      reasons.push({ field: "tag", clue: token.clue });
    } else if (nGenres.some((genre) => includesAny(genre, stems))) {
      score += 10;
      reasons.push({ field: "genre", clue: token.clue });
    } else if (includesAny(nSynopsis, stems)) {
      score += 8;
      reasons.push({ field: "synopsis", clue: token.clue });
    } else {
      continue;
    }
    matchedTokens += 1;
  }

  if (reasons.length === 0) return null;

  if (clues.era !== "any") {
    const [from, to] = ERA_RANGE[clues.era];
    if (title.releaseYear >= from - 1 && title.releaseYear <= to + 1) {
      score += 4;
      reasons.push({ field: "year", clue: clues.era });
    }
  }

  const level: MemoryMatchLevel = confirmed
    ? "confirmed"
    : matchedTokens >= 2 || strongTokenMatch
      ? "probable"
      : "weak";
  return { title, level, score, reasons };
}

/** 가져온 작품을 단서와 대조해 근거 있는 것만 남기고, 확신 단계 → 점수 순으로 정렬해 자른다. */
export function rankMemoryMatches(
  items: readonly Title[],
  clues: MemoryClues,
  limit: number = MEMORY_RESULT_LIMIT,
): MemoryMatch[] {
  const tokens = sceneTokens(clues.scene);
  const matches: MemoryMatch[] = [];
  for (const item of items) {
    const match = explainMemoryMatch(item, clues, tokens);
    if (match) matches.push(match);
  }
  matches.sort(
    (a, b) =>
      LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
      b.score - a.score ||
      a.title.title.localeCompare(b.title.title, "ko"),
  );
  return matches.slice(0, Math.max(0, limit));
}

export type MemoryOutcome = MemoryMatchLevel | "none";

/** 결과 전체를 한 줄로 말할 때 쓰는 단계: 가장 확실한 후보의 단계를 따른다. */
export function summarizeMemoryOutcome(matches: readonly MemoryMatch[]): MemoryOutcome {
  if (matches.some((match) => match.level === "confirmed")) return "confirmed";
  if (matches.some((match) => match.level === "probable")) return "probable";
  if (matches.length > 0) return "weak";
  return "none";
}
