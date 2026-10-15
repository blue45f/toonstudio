/**
 * 무드보드 웹 수집 + 기획 인계 (순수 모델).
 *
 * 배경 (REPORT G5 — Milanote 웹 클리퍼·보드 중첩):
 * - 기존 무드보드(studio-moodboard)는 보드/카드/저장만 있고, 웹에서 가져오는
 *   경로는 종류를 고르고 주소를 입력해 제출하는 폼뿐이었다. 붙여넣기 1동작으로
 *   카드가 생기는 수집 동선과, 카드를 기획 필드로 넘기는 인계가 없었다.
 *
 * 원칙:
 * - 수집은 네트워크를 타지 않는다. 붙여넣은 텍스트에서 http(s) URL만 뽑아
 *   카드로 만든다 — 페이지 제목·본문을 긁어오지 않는다(비용·권리 문제 없음).
 *   이미지 확장자 URL은 이미지 카드, 나머지는 링크 카드다.
 * - 같은 URL이 보드에 이미 있으면 중복 카드를 만들지 않는다.
 * - 인계는 비파괴다: 카드를 지우거나 옮기지 않고, 초안 + 출처 카드 목록
 *   (sourceCards)을 함께 돌려준다. 표면은 출처를 초안 옆에 남겨 보여줄 수
 *   있고, 링크/이미지 카드의 URL은 초안 문장에도 그대로 들어가 남는다.
 * - 인계 병합은 빈 칸만 채운다(apply*). 이미 쓴 기획 문장을 무드보드
 *   초안으로 덮지 않는다 — 콘티 비트→시놉시스 선례와 같은 계약.
 */
import {
  addMoodboardCard,
  type Moodboard,
  type MoodboardCard,
  type MoodboardCardKind,
} from "./studio-moodboard";
import type { EpisodePlanWithSynopsis } from "./studio-episode-synopsis";
import type { StudioStoryCharacterProfile } from "./studio-character-profile";

/* ------------------------------------------------------------------ */
/* 웹 수집 — 붙여넣은 텍스트에서 URL 카드 만들기                        */
/* ------------------------------------------------------------------ */

const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".svg",
]);

function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** 붙여넣은 텍스트에서 http(s) URL을 순서대로 뽑는다. 중복·끝 구두점은 정리한다. */
export function extractUrlsFromPastedText(text: string): readonly string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/[^\s<>"'`]+/g)) {
    let candidate = match[0];
    while (candidate.length > 0 && /[.,;:!?)\]}]/.test(candidate.at(-1) ?? "")) {
      candidate = candidate.slice(0, -1);
    }
    if (!candidate || !parseHttpUrl(candidate) || seen.has(candidate)) continue;
    seen.add(candidate);
    found.push(candidate);
  }
  return Object.freeze(found);
}

export function isMoodboardImageUrl(value: string): boolean {
  const url = parseHttpUrl(value);
  if (!url) return false;
  const path = url.pathname.toLowerCase();
  const dot = path.lastIndexOf(".");
  return dot >= 0 && IMAGE_EXTENSIONS.has(path.slice(dot));
}

export function classifyCollectedUrl(value: string): "image" | "link" {
  return isMoodboardImageUrl(value) ? "image" : "link";
}

/** 카드에 보일 짧은 이름 — 이미지: 파일 이름(확장자 제외), 링크: 호스트 이름. */
export function collectedUrlLabel(value: string): string {
  const url = parseHttpUrl(value);
  if (!url) return value;
  if (isMoodboardImageUrl(value)) {
    const segment = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      decoded = segment;
    }
    const stem = decoded.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
    return stem || url.hostname;
  }
  return url.hostname;
}

export function cardFromCollectedUrl(url: string, id: string): MoodboardCard {
  const kind = classifyCollectedUrl(url);
  return { id, kind, ref: url, text: collectedUrlLabel(url) };
}

export function cardsFromPastedText(
  text: string,
  createId: () => string,
): readonly MoodboardCard[] {
  return Object.freeze(extractUrlsFromPastedText(text).map((url) => cardFromCollectedUrl(url, createId())));
}

export interface MoodboardCollectResult {
  readonly board: Moodboard;
  readonly addedCardIds: readonly string[];
  /** 이미 보드에 있거나 상한 등으로 건너뛴 URL. */
  readonly skippedUrls: readonly string[];
  /** 붙여넣은 텍스트에서 찾은 URL 수. 0이면 URL이 없던 것이다. */
  readonly foundUrlCount: number;
}

/**
 * 붙여넣은 텍스트를 열 하나에 수집한다. URL이 없으면 보드는 그대로다.
 * 이미 있는 URL·중복은 건너뛰고, 어떤 열에도 못 넣은 URL은 skippedUrls로 알린다.
 */
export function collectPastedTextIntoBoard(
  board: Moodboard,
  columnId: string,
  text: string,
  createId: () => string,
): MoodboardCollectResult {
  const urls = extractUrlsFromPastedText(text);
  if (urls.length === 0) {
    return { board, addedCardIds: [], skippedUrls: [], foundUrlCount: 0 };
  }
  if (!board.columns.some((col) => col.id === columnId)) {
    return { board, addedCardIds: [], skippedUrls: urls, foundUrlCount: urls.length };
  }
  const existingRefs = new Set(
    Object.values(board.cards).map((card) => card.ref).filter(Boolean),
  );
  let next = board;
  const added: string[] = [];
  const skipped: string[] = [];
  for (const url of urls) {
    if (existingRefs.has(url)) {
      skipped.push(url);
      continue;
    }
    const card = cardFromCollectedUrl(url, createId());
    const withCard = addMoodboardCard(next, columnId, card);
    if (withCard === next) {
      skipped.push(url);
      continue;
    }
    next = withCard;
    existingRefs.add(url);
    added.push(card.id);
  }
  return { board: next, addedCardIds: added, skippedUrls: skipped, foundUrlCount: urls.length };
}

/* ------------------------------------------------------------------ */
/* 기획 인계 — 선택한 카드에서 초안 + 출처 만들기                       */
/* ------------------------------------------------------------------ */

export interface MoodboardHandoffSource {
  readonly cardId: string;
  readonly kind: MoodboardCardKind;
  readonly ref?: string;
  readonly text?: string;
  /** 표면에 그대로 보여줄 한 줄 이름. */
  readonly label: string;
}

export function moodboardCardLabel(card: MoodboardCard): string {
  return card.text?.trim() || card.ref?.trim() || card.id;
}

/** 초안 문장에 들어가는 카드 한 줄. 링크·이미지는 URL이 문장 안에 남아 출처가 된다. */
export function moodboardCardDisplayLine(card: MoodboardCard): string {
  const label = moodboardCardLabel(card);
  if (card.kind === "image") {
    return card.ref && label !== card.ref ? `이미지 참고: ${label} (${card.ref})` : `이미지 참고: ${label}`;
  }
  if (card.kind === "link") {
    return card.ref && label !== card.ref ? `${label} (${card.ref})` : label;
  }
  return card.text?.trim() ?? label;
}

/** 선택한 카드를 보드 배치 순서(열 순서 → 열 안 순서)로 돌려준다. 모르는 id는 무시한다. */
export function selectedMoodboardCardsInBoardOrder(
  board: Moodboard,
  cardIds: readonly string[],
): readonly MoodboardCard[] {
  const wanted = new Set(cardIds);
  const ordered: MoodboardCard[] = [];
  for (const column of board.columns) {
    for (const cardId of column.cardIds) {
      const card = board.cards[cardId];
      if (card && wanted.has(card.id)) ordered.push(card);
    }
  }
  return Object.freeze(ordered);
}

function sourcesOf(cards: readonly MoodboardCard[]): readonly MoodboardHandoffSource[] {
  return Object.freeze(
    cards.map((card) => ({
      cardId: card.id,
      kind: card.kind,
      ...(card.ref !== undefined ? { ref: card.ref } : {}),
      ...(card.text !== undefined ? { text: card.text } : {}),
      label: moodboardCardLabel(card),
    })),
  );
}

/* 회차 플랜 인계 */

export interface EpisodePlanDraftFromMoodboard {
  readonly episodeId?: string;
  /** 첫 메모/할 일 카드의 첫 문장. 그런 카드가 없으면 빈 문자열(지어내지 않음). */
  readonly goal: string;
  /** 선택한 카드 전체를 보드 순서로 이은 줄거리 초안. */
  readonly synopsis: string;
  readonly sourceCards: readonly MoodboardHandoffSource[];
  readonly sourceCardIds: readonly string[];
}

function firstSentence(text: string): string {
  const line = text.split("\n").map((part) => part.trim()).find(Boolean) ?? "";
  const match = /^.*?[.!?。](?=\s|$)/.exec(line);
  return (match ? match[0] : line).trim();
}

export function deriveEpisodePlanDraftFromMoodboard(
  board: Moodboard,
  cardIds: readonly string[],
  episodeId?: string,
): EpisodePlanDraftFromMoodboard {
  const cards = selectedMoodboardCardsInBoardOrder(board, cardIds);
  const goalCard = cards.find(
    (card) => (card.kind === "note" || card.kind === "todo") && card.text?.trim(),
  );
  return Object.freeze({
    ...(episodeId !== undefined ? { episodeId } : {}),
    goal: goalCard?.text ? firstSentence(goalCard.text) : "",
    synopsis: cards.map(moodboardCardDisplayLine).filter(Boolean).join("\n"),
    sourceCards: sourcesOf(cards),
    sourceCardIds: Object.freeze(cards.map((card) => card.id)),
  });
}

/** 빈 goal/synopsis만 무드보드 초안으로 채운다. 기존 문장은 절대 덮지 않는다. */
export function applyEpisodePlanDraftFromMoodboard<T extends EpisodePlanWithSynopsis>(
  plan: T,
  draft: EpisodePlanDraftFromMoodboard,
): T {
  return {
    ...plan,
    goal: plan.goal?.trim() ? plan.goal : draft.goal || plan.goal,
    synopsis: plan.synopsis?.trim() ? plan.synopsis : draft.synopsis || plan.synopsis,
  };
}

/* 캐릭터 시트 인계 */

export interface CharacterProfileDraftFromMoodboard {
  readonly characterId: string;
  readonly personality: string;
  readonly speechStyle: string;
  /** 메모·링크 카드 → 배경 이야기. */
  readonly background: string;
  /** 할 일 카드 → 바라는 것(욕망·목표). */
  readonly motivation: string;
  readonly signatureLines: readonly string[];
  /** 이미지 카드 → 외형 메모. */
  readonly appearanceNotes: string;
  readonly sourceCards: readonly MoodboardHandoffSource[];
  readonly sourceCardIds: readonly string[];
}

export function deriveCharacterProfileDraftFromMoodboard(
  board: Moodboard,
  cardIds: readonly string[],
  characterId: string,
): CharacterProfileDraftFromMoodboard {
  const cards = selectedMoodboardCardsInBoardOrder(board, cardIds);
  const linesOf = (kinds: readonly MoodboardCardKind[]) =>
    cards
      .filter((card) => kinds.includes(card.kind))
      .map(moodboardCardDisplayLine)
      .filter(Boolean)
      .join("\n");
  return Object.freeze({
    characterId,
    personality: "",
    speechStyle: "",
    background: linesOf(["note", "link"]),
    motivation: cards
      .filter((card) => card.kind === "todo")
      .map((card) => card.text?.trim() ?? "")
      .filter(Boolean)
      .join("\n"),
    signatureLines: Object.freeze([]),
    appearanceNotes: linesOf(["image"]),
    sourceCards: sourcesOf(cards),
    sourceCardIds: Object.freeze(cards.map((card) => card.id)),
  });
}

function appendLine(existing: string, addition: string): string {
  if (!addition.trim()) return existing;
  if (!existing.trim()) return addition;
  if (existing.includes(addition)) return existing;
  return `${existing}\n${addition}`;
}

/**
 * 캐릭터 시트 초안을 기존 시트에 병합한다. 채워진 칸은 덮지 않고,
 * 배경·외형·목표처럼 이어 붙일 수 있는 칸만 빈 칸이면 채우고
 * 내용이 있으면 출처 줄을 아래에 덧붙인다(출처가 시트 안에도 남는다).
 */
export function applyCharacterProfileDraftFromMoodboard(
  existing: StudioStoryCharacterProfile | null,
  draft: CharacterProfileDraftFromMoodboard,
): StudioStoryCharacterProfile {
  const base: StudioStoryCharacterProfile = existing ?? {
    characterId: draft.characterId,
    personality: "",
    speechStyle: "",
    background: "",
    motivation: "",
    signatureLines: [],
    appearanceNotes: "",
  };
  return {
    ...base,
    characterId: draft.characterId,
    background: appendLine(base.background, draft.background),
    motivation: appendLine(base.motivation, draft.motivation),
    appearanceNotes: appendLine(base.appearanceNotes, draft.appearanceNotes),
  };
}

/** 패널이 한 번에 올리는 인계 묶음 — 대상에 따라 초안 종류가 갈린다. */
export type MoodboardPlanningHandoff =
  | { readonly target: "episode-plan"; readonly draft: EpisodePlanDraftFromMoodboard }
  | { readonly target: "character-sheet"; readonly draft: CharacterProfileDraftFromMoodboard };
