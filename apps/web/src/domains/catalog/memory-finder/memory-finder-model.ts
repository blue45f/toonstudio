import type { Title } from "@/shared/lib/types";

/**
 * 기억으로 작품 찾기 — 순수 모델.
 *
 * 제목이 기억나지 않을 때 쓰는 도구라서 **확신이 없는 채로** 결과를 내야 한다. 그래서 결과마다 "어느 단서가 어디와
 * 맞았는지"(근거)와 세 단계의 확신(확인된 일치·추정 일치·약한 후보)을 함께 돌려주고, 아무것도 맞지 않으면 못 찾았다고
 * 말한다. 점수는 정렬에만 쓰고 사용자에게 퍼센트로 보여 주지 않는다.
 *
 * 비교에 쓰는 데이터는 믿을 만한 것만 쓴다(2026-10-16 저장소 카탈로그 스냅샷 60,234편을 직접 세어 확인):
 *  - 소개의 83.7%는 "{제목} · 네이버 시리즈 인기 웹소설." 같은 출처 표기뿐인 자동 문구다 → 비교에서 뺀다.
 *    (그대로 두면 "네이버"·"인기" 같은 낱말이 가짜 근거가 된다.)
 *  - 출시 연도는 58.5%가 2022, 네이버웹툰은 전부 2024인 자리표시값이다 → 시기 단서는 받지 않는다.
 *  - 다른 이름(altTitles)은 한 편도 채워져 있지 않다 → 있으면 쓰되 없는 것을 전제로 하지 않는다.
 *
 * 서버 검색은 낱말별 합산(OR) 점수라 후보를 넓게 가져오고, 여기서는 가져온 작품을 다시 단서와 대조해 근거를 만든다.
 * 입력은 브라우저에서만 쓰이며 어디에도 저장하지 않는다.
 */

export type MemoryTitleKnowledge = "exact" | "partial" | "unknown";

export interface MemoryClues {
  readonly titleKnowledge: MemoryTitleKnowledge;
  /** 기억하는 제목(또는 조각). `unknown` 이면 쓰지 않는다. */
  readonly titleText: string;
  /** 기억나는 장면이나 줄거리. 필수. */
  readonly scene: string;
}

export const MEMORY_SCENE_MAX_LENGTH = 400;
export const MEMORY_TITLE_MAX_LENGTH = 60;
export const MEMORY_RESULT_LIMIT = 12;
export const MEMORY_MAX_SCENE_TOKENS = 8;
const MAX_QUERY_LENGTH = 480;
/** "{제목} · {출처 표기}" 자동 문구의 출처 표기 쪽 최대 길이(실제 17종은 모두 18자 이하). */
const TEMPLATE_REST_MAX_LENGTH = 30;
/** 띄어쓰기를 무시해야만 맞는 제목 조각은 이 글자 수부터 확인으로 친다(그 아래는 우연 일치가 흔하다). */
const SPACE_INSENSITIVE_CONFIRM_LENGTH = 4;

/**
 * 어디에나 나오는 말은 단서가 못 된다 — 걸러 내지 않으면 "겹치는 단서"가 부풀려진다.
 * 서술형 소개 5,935편에서 가장 흔한 낱말과 일반 기능어를 모았다(내용어인 "회귀"·"학원" 같은 말은 넣지 않는다).
 */
const STOPWORDS: ReadonlySet<string> = new Set(
  `장면 내용 이야기 부분 느낌 생각 기억 기억나는 기억나요 제목 작품 만화 웹툰 웹소설 소설 주인공 남주 여주 남자 여자 사람 순간
   그녀 그는 그가 그를 그의 그들 우리 우리는 나는 내가 나를 나의 너는 네가 너를 이런 저런 그런 이렇게 그렇게 어떤 어느
   무슨 어떻게 무엇 누구 어디 언제 거기 여기 저기 거기서 이것 그것 저것
   그리고 그런데 그래서 하지만 그러나 그러면 그래도 근데 그냥 정말 진짜 너무 매우 아주 조금 많이 모두 다시 이제 결국
   계속 갑자기 먼저 나중에 처음 마지막 항상 가끔 자주 이미 아직 벌써 과연 어쩌면 아마 혹시 정도 뭔가 뭔지
   있는 있던 있다 있었다 있습니다 없는 없던 없다 없이 하는 하던 했던 한다 했다 하고 하며 되는 되던 된다 되었다 되어 되고
   오는 가는 쓰는 보는 나오는 나오던 나왔던 같은 같이 비슷한 다른 모든 많은 아닌 아니 않는 않은 않고 못한 위해 위한 통해 대한
   함께 가장 가진 하나 하면서
   the a an and or of to in on at for with from by is are was were be been it its this that these those he she they them his her
   their who what when where why how you we my your our as but if then so not no do does did has have had about into out up down
   over under again story stories manga webtoon novel comic book series scene plot there here some any very just also than too can
   will would could should`
    .split(/\s+/u)
    .filter(Boolean),
);

/**
 * 한국어 조사·어미는 붙여 쓰므로 "학교에서는" 은 소개의 "학교" 와 안 맞는다 — 뗀 형태도 함께 시도한다.
 * 겹조사를 먼저 적어 짧은 조사보다 앞서 맞게 한다. 형태소 분석이 아니라서 "고양이"→"고양"처럼 어긋난 형태도 생길 수
 * 있지만, 근거 칩에는 실제로 맞은 형태가 그대로 보이므로 틀린 근거를 알아볼 수 있다.
 */
const TRAILING_PARTICLE =
  /(?:에서는|에서도|에서만|으로는|으로도|으로만|에게는|에게도|한테는|한테도|까지는|까지도|부터는|부터도|이라는|이라고|에서|으로|이랑|한테|에게|까지|부터|처럼|보다|라는|라고|은|는|이|가|을|를|에|의|도|로|와|과|랑)$/u;
/** "복수하는"→"복수", "회귀해서"→"회귀" 처럼 명사+하다/되다 활용을 명사로 되돌린다. */
const TRAILING_ENDING = /(?:하는|하던|했던|한다|했다|해서|하고|하며|하면|하게|하지|되는|되던|된다|됐다|돼서|인데|이라서)$/u;

export interface MemoryToken {
  /** 사용자가 쓴 그대로의 말. */
  readonly clue: string;
  /** 대조에 쓰는 소문자 형태. 첫째가 쓴 그대로이고 나머지는 조사·어미를 뗀 형태다. */
  readonly stems: readonly string[];
}

/** 띄어쓰기·문장부호를 한 칸 공백으로 접은 소문자 문자열. 낱말 경계는 지키고 표기 차이만 지운다. */
function fold(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, " ").trim();
}

function compact(folded: string): string {
  return folded.replace(/ /gu, "");
}

function titleFragment(clues: MemoryClues): string {
  if (clues.titleKnowledge === "unknown") return "";
  return clues.titleText.trim().slice(0, MEMORY_TITLE_MAX_LENGTH);
}

/** 한글 자모(ㅠㅠ·ㅋㅋ)만 있는 말은 낱말이 아니다. */
function hasWordLetter(text: string): boolean {
  for (const character of text) {
    if (!/\p{L}/u.test(character)) continue;
    const code = character.codePointAt(0) ?? 0;
    const isLoneJamo = (code >= 0x3131 && code <= 0x318e) || (code >= 0x1100 && code <= 0x11ff);
    if (!isLoneJamo) return true;
  }
  return false;
}

function stemCandidates(token: string): string[] {
  const candidates = [token];
  // 활용형은 명사로만 되돌린다 — 어미를 뗀 뒤 조사까지 또 떼면 "복수하" 같은 없는 말이 생긴다.
  const withoutEnding = token.replace(TRAILING_ENDING, "");
  const stripped = withoutEnding !== token ? withoutEnding : token.replace(TRAILING_PARTICLE, "");
  if (stripped && stripped !== token) candidates.push(stripped);
  return candidates;
}

function shortest(values: readonly string[]): string {
  return values.reduce((best, value) => (value.length < best.length ? value : best), values[0] ?? "");
}

export function sceneTokenInfo(scene: string): { readonly tokens: MemoryToken[]; readonly truncated: boolean } {
  const pieces = scene.normalize("NFKC").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const seen = new Set<string>();
  const all: MemoryToken[] = [];
  for (const piece of pieces) {
    const lower = piece.toLowerCase();
    if (lower.length < 2 || /^\d+$/u.test(lower) || !hasWordLetter(lower)) continue;
    // 조사가 붙은 불용어("주인공이")·활용형("웹소설인데")도 불용어다. 한 글자 낱말은 부분 일치가 너무 넓어("비"→"비밀") 쓰지 않는다.
    const candidates = stemCandidates(lower);
    if (candidates.some((candidate) => STOPWORDS.has(candidate))) continue;
    const stems = candidates.filter((candidate) => candidate.length >= 2);
    // "우산을"·"우산이"는 같은 낱말이다 — 뗀 형태가 같으면 하나로 센다(둘로 세면 단서가 부풀려진다).
    const key = shortest(stems);
    if (seen.has(key)) continue;
    seen.add(key);
    all.push({ clue: piece, stems });
  }
  return { tokens: all.slice(0, MEMORY_MAX_SCENE_TOKENS), truncated: all.length > MEMORY_MAX_SCENE_TOKENS };
}

export function sceneTokens(scene: string): MemoryToken[] {
  return sceneTokenInfo(scene).tokens;
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

/**
 * 대조에 쓸 소개 글. "{제목} · {출처 표기}" 로만 이루어진 자동 문구는 장면에 대해 아무것도 말하지 않으므로 빈 문자열로
 * 돌려주고, 제목 머리말이 붙은 서술형은 머리말을 뗀다(제목 낱말이 소개 근거로 이중 집계되지 않게).
 */
export function usableSynopsis(title: Pick<Title, "title" | "synopsis">): string {
  const raw = (title.synopsis ?? "").trim();
  if (!raw) return "";
  const prefix = `${title.title} · `;
  if (!raw.startsWith(prefix)) return raw;
  const rest = raw.slice(prefix.length).trim();
  return rest.length <= TEMPLATE_REST_MAX_LENGTH && !rest.includes("·") ? "" : rest;
}

export type MemoryMatchLevel = "confirmed" | "probable" | "weak";
export type MemoryReasonField = "title" | "titleSpaced" | "altTitle" | "tag" | "genre" | "synopsis" | "author";

export interface MemoryMatchReason {
  readonly field: MemoryReasonField;
  /** 실제로 맞은 문자열. 조사를 떼고 맞았으면 뗀 형태다. */
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

/** 영문·숫자 낱말은 낱말 시작에서만 맞춘다("art" 가 "party" 에 맞으면 안 된다). 한글은 합성어 안쪽도 맞춘다. */
function hasStem(haystack: string, stem: string): boolean {
  if (!haystack || !stem) return false;
  if (/^[a-z0-9]+$/u.test(stem)) return haystack.startsWith(stem) || haystack.includes(` ${stem}`);
  return haystack.includes(stem);
}

function firstStem(haystack: string, stems: readonly string[]): string | null {
  for (const stem of stems) if (hasStem(haystack, stem)) return stem;
  return null;
}

type FragmentHit = "equal" | "word" | "spaced-long" | "spaced-short";

/** 제목 조각(접은 형태)이 대상 문자열과 어떻게 맞는가. 띄어쓰기를 무시해야만 맞는 경우를 따로 가린다. */
function classifyFragment(fragment: string, target: string): FragmentHit | null {
  const flat = compact(fragment);
  if (flat.length < 2 || !target) return null;
  const targetFlat = compact(target);
  if (targetFlat === flat) return "equal";
  if (target.includes(fragment)) return "word";
  if (targetFlat.includes(flat)) return flat.length >= SPACE_INSENSITIVE_CONFIRM_LENGTH ? "spaced-long" : "spaced-short";
  return null;
}

interface FragmentEvidence {
  readonly level: "confirmed" | "probable";
  readonly reason: MemoryMatchReason;
  readonly score: number;
}

const FRAGMENT_SCORE: Record<FragmentHit, number> = { equal: 140, word: 100, "spaced-long": 70, "spaced-short": 50 };

function fragmentEvidence(
  clues: MemoryClues,
  fragmentText: string,
  folded: { readonly title: string; readonly alts: readonly string[] },
): FragmentEvidence | null {
  if (clues.titleKnowledge === "unknown") return null;
  const fragment = fold(fragmentText);
  let best: FragmentEvidence | null = null;
  const consider = (hit: FragmentHit | null, isAlt: boolean) => {
    if (!hit) return;
    // "정확히 기억해요" 는 같은 제목일 때만 확인한다 — 제목에 들어 있기만 한 것(속편·부제)은 추정이다.
    const confirmed =
      clues.titleKnowledge === "exact" ? hit === "equal" : hit === "equal" || hit === "word" || hit === "spaced-long";
    const field: MemoryReasonField = isAlt ? "altTitle" : hit === "spaced-long" || hit === "spaced-short" ? "titleSpaced" : "title";
    const candidate: FragmentEvidence = {
      level: confirmed ? "confirmed" : "probable",
      reason: { field, clue: fragmentText },
      score: FRAGMENT_SCORE[hit] - (isAlt ? 10 : 0),
    };
    if (!best || candidate.score > best.score) best = candidate;
  };
  consider(classifyFragment(fragment, folded.title), false);
  for (const alt of folded.alts) consider(classifyFragment(fragment, alt), true);
  return best;
}

const TOKEN_SCORE: Record<MemoryReasonField, number> = {
  title: 40,
  titleSpaced: 40,
  altTitle: 30,
  tag: 16,
  synopsis: 8,
  genre: 3,
  author: 3,
};
/** 서로 다른 낱말이 둘 이상 겹쳤는지 셀 때 쳐 주는 칸. 장르·작가 이름은 변별력이 낮아 세지 않는다. */
const COUNTED_FIELDS: ReadonlySet<MemoryReasonField> = new Set(["title", "altTitle", "tag", "synopsis"]);

/** 한 작품을 단서와 대조한다. 근거가 하나도 없으면 null(장르만 겹친 것도 근거가 못 된다). */
export function explainMemoryMatch(
  title: Title,
  clues: MemoryClues,
  tokens: readonly MemoryToken[] = sceneTokens(clues.scene),
): MemoryMatch | null {
  const foldedTitle = fold(title.title);
  const foldedAlts = (title.altTitles ?? []).map(fold);
  const foldedTags = title.tags.map(fold);
  const foldedGenres = title.genres.map(fold);
  const foldedSynopsis = fold(usableSynopsis(title));
  const foldedPeople = [title.author, title.artist ?? ""].map(fold).filter(Boolean);

  const reasons: MemoryMatchReason[] = [];
  let score = 0;

  const fragmentText = titleFragment(clues);
  const fragment = fragmentText ? fragmentEvidence(clues, fragmentText, { title: foldedTitle, alts: foldedAlts }) : null;
  if (fragment) {
    reasons.push(fragment.reason);
    score += fragment.score;
  }

  const tokenReasons: MemoryMatchReason[] = [];
  for (const token of tokens) {
    const stems = token.stems;
    const found =
      pick("title", firstStem(foldedTitle, stems)) ??
      pick("altTitle", firstOver(foldedAlts, stems)) ??
      pick("tag", firstOver(foldedTags, stems)) ??
      pick("synopsis", firstStem(foldedSynopsis, stems)) ??
      pick("genre", firstOver(foldedGenres, stems)) ??
      pick("author", firstOver(foldedPeople, stems));
    if (found) tokenReasons.push(found);
  }

  // 같은 낱말의 앞부분("마법")과 전체("마법사")가 따로 맞았으면 더 긴 쪽만 근거로 둔다.
  const kept = tokenReasons.filter(
    (reason) => !tokenReasons.some((other) => other !== reason && other.clue.length > reason.clue.length && other.clue.includes(reason.clue)),
  );
  let counted = 0;
  for (const reason of kept) {
    reasons.push(reason);
    score += TOKEN_SCORE[reason.field];
    if (COUNTED_FIELDS.has(reason.field)) counted += 1;
  }
  if (counted > 1) score += (counted - 1) * 20;

  const hasEvidence = fragment !== null || counted > 0 || kept.some((reason) => reason.field === "author");
  if (!hasEvidence) return null;

  const level: MemoryMatchLevel =
    fragment?.level === "confirmed" ? "confirmed" : fragment !== null || counted >= 2 ? "probable" : "weak";
  return { title, level, score, reasons };
}

function pick(field: MemoryReasonField, clue: string | null): MemoryMatchReason | null {
  return clue === null ? null : { field, clue };
}

function firstOver(haystacks: readonly string[], stems: readonly string[]): string | null {
  for (const haystack of haystacks) {
    const hit = firstStem(haystack, stems);
    if (hit !== null) return hit;
  }
  return null;
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

/** 단계별 편수. 머리말의 편수는 가장 확실한 단계만 센다 — 단계를 섞어 세면 "찾았어요 (12편)"이 부풀려진다. */
export function countMemoryLevels(matches: readonly MemoryMatch[]): Record<MemoryMatchLevel, number> {
  const counts: Record<MemoryMatchLevel, number> = { confirmed: 0, probable: 0, weak: 0 };
  for (const match of matches) counts[match.level] += 1;
  return counts;
}
