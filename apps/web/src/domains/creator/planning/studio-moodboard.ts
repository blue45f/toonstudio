/**
 * 기획 무드보드 모델 + 프로젝트 단위 저장소 + 이미지 참조 해석.
 *
 * 배경 (REPORT §2.3 — Milanote 무드보드·Miro 보드): 기획 표면에 무드보드가 없었다.
 * 초안 drafts/moodboard-model.ts(보드/카드/이동/직렬화 검증 완료)를 정본으로 가져오되,
 * 배선에 필요한 만큼만 강화했다.
 *
 * 원칙:
 * - 카드는 이미지를 "복사"하지 않고 참조(ref)만 든다. 실제 이미지 주소 해석은
 *   개인/프로젝트 에셋 카탈로그를 받는 해석기(resolveMoodboardCardImage)가 한다.
 * - 직렬화는 버전 필드를 포함하고, 역직렬화·저장소 읽기는 검증 실패 시
 *   null 이 아니라 사유를 돌려준다(fail-closed). 깨진 카드 참조·중복 배치·
 *   어느 열에도 없는 카드는 사유와 함께 거부한다 — 배치가 그대로 복원되는
 *   것이 판정 기준이라, 조용히 고쳐 저장하지 않는다.
 * - 저장소는 기획 스토어(studio-planning-store)와 같은 방식: 프로젝트별
 *   localStorage 키 + 업데이트 이벤트.
 */
import type { StudioProjectDiagnosticSourceStorage } from "../studio-project-diagnostic-source-store";

export type MoodboardCardKind = "image" | "note" | "link" | "todo";

export interface MoodboardCard {
  readonly id: string;
  readonly kind: MoodboardCardKind;
  /** image: 에셋/레퍼런스 참조, link: URL. note/todo는 비움. */
  readonly ref?: string;
  readonly text?: string;
  /** todo 전용. */
  readonly done?: boolean;
}

export interface MoodboardColumn {
  readonly id: string;
  readonly title: string;
  readonly cardIds: readonly string[];
}

export interface Moodboard {
  readonly version: 1;
  readonly id: string;
  readonly projectId?: string;
  readonly title: string;
  readonly columns: readonly MoodboardColumn[];
  readonly cards: Readonly<Record<string, MoodboardCard>>;
}

export const MOODBOARD_MAX_COLUMNS = 12;
export const MOODBOARD_MAX_CARDS = 200;

const CARD_KINDS: readonly MoodboardCardKind[] = ["image", "note", "link", "todo"];

export function createMoodboard(input: {
  id: string;
  title: string;
  projectId?: string;
  columnTitles?: readonly string[];
}): Moodboard {
  const titles = input.columnTitles ?? ["레퍼런스", "메모", "할 일"];
  return {
    version: 1,
    id: input.id,
    projectId: input.projectId,
    title: input.title,
    columns: titles.map((title, i) => ({ id: `${input.id}-col-${i}`, title, cardIds: [] })),
    cards: {},
  };
}

/** 열이 없거나 이미 있는 카드 id면 보드를 그대로 돌려준다(조용한 중복 배치 방지). */
export function addMoodboardCard(
  board: Moodboard,
  columnId: string,
  card: MoodboardCard,
): Moodboard {
  if (!board.columns.some((col) => col.id === columnId)) return board;
  if (board.cards[card.id]) return board;
  if (Object.keys(board.cards).length >= MOODBOARD_MAX_CARDS) return board;
  return {
    ...board,
    cards: { ...board.cards, [card.id]: card },
    columns: board.columns.map((col) =>
      col.id === columnId ? { ...col, cardIds: [...col.cardIds, card.id] } : col,
    ),
  };
}

export function addMoodboardColumn(
  board: Moodboard,
  column: MoodboardColumn,
): Moodboard {
  if (board.columns.some((col) => col.id === column.id)) return board;
  if (board.columns.length >= MOODBOARD_MAX_COLUMNS) return board;
  return { ...board, columns: [...board.columns, { ...column, cardIds: [...column.cardIds] }] };
}

export function removeMoodboardCard(board: Moodboard, cardId: string): Moodboard {
  if (!board.cards[cardId]) return board;
  const cards = { ...board.cards };
  delete cards[cardId];
  return {
    ...board,
    cards,
    columns: board.columns.map((col) => ({
      ...col,
      cardIds: col.cardIds.filter((id) => id !== cardId),
    })),
  };
}

export function moveMoodboardCard(
  board: Moodboard,
  cardId: string,
  toColumnId: string,
  toIndex: number,
): Moodboard {
  if (!board.cards[cardId]) return board;
  if (!board.columns.some((col) => col.id === toColumnId)) return board;
  const columns = board.columns.map((col) => ({
    ...col,
    cardIds: col.cardIds.filter((id) => id !== cardId),
  }));
  return {
    ...board,
    columns: columns.map((col) => {
      if (col.id !== toColumnId) return col;
      const next = [...col.cardIds];
      next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, cardId);
      return { ...col, cardIds: next };
    }),
  };
}

export function toggleMoodboardTodo(board: Moodboard, cardId: string): Moodboard {
  const card = board.cards[cardId];
  if (!card || card.kind !== "todo") return board;
  return { ...board, cards: { ...board.cards, [cardId]: { ...card, done: !card.done } } };
}

export function moodboardSummary(board: Moodboard): {
  total: number;
  byKind: Record<MoodboardCardKind, number>;
  todosOpen: number;
} {
  const byKind: Record<MoodboardCardKind, number> = { image: 0, note: 0, link: 0, todo: 0 };
  let todosOpen = 0;
  for (const card of Object.values(board.cards)) {
    byKind[card.kind] += 1;
    if (card.kind === "todo" && !card.done) todosOpen += 1;
  }
  return { total: Object.keys(board.cards).length, byKind, todosOpen };
}

export function serializeMoodboard(board: Moodboard): string {
  return JSON.stringify(board);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateCard(cardId: string, raw: unknown): string | null {
  if (!isRecord(raw)) return `카드 ${cardId}의 형식이 아니에요.`;
  if (raw.id !== cardId) return `카드 ${cardId}의 id가 키와 달라요.`;
  if (typeof raw.kind !== "string" || !(CARD_KINDS as readonly string[]).includes(raw.kind)) {
    return `카드 ${cardId}의 종류를 알 수 없어요.`;
  }
  if (raw.ref !== undefined && typeof raw.ref !== "string") {
    return `카드 ${cardId}의 참조 형식이 아니에요.`;
  }
  if (raw.text !== undefined && typeof raw.text !== "string") {
    return `카드 ${cardId}의 내용 형식이 아니에요.`;
  }
  if (raw.done !== undefined && typeof raw.done !== "boolean") {
    return `카드 ${cardId}의 완료 표시 형식이 아니에요.`;
  }
  if (raw.kind === "image" && (typeof raw.ref !== "string" || !raw.ref.trim())) {
    return `이미지 카드 ${cardId}에 참조가 없어요.`;
  }
  if (raw.kind === "link" && (typeof raw.ref !== "string" || !isHttpUrl(raw.ref))) {
    return `링크 카드 ${cardId}의 주소가 올바르지 않아요.`;
  }
  if ((raw.kind === "note" || raw.kind === "todo") && (typeof raw.text !== "string" || !raw.text.trim())) {
    return `카드 ${cardId}의 내용이 비어 있어요.`;
  }
  return null;
}

export function deserializeMoodboard(
  raw: string,
): { ok: true; board: Moodboard } | { ok: false; reason: string } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "JSON 파싱 실패" };
  }
  if (!isRecord(data)) return { ok: false, reason: "무드보드 형식이 아니에요." };
  const b = data as Partial<Moodboard>;
  if (
    b.version !== 1
    || typeof b.id !== "string" || !b.id.trim()
    || typeof b.title !== "string"
    || (b.projectId !== undefined && typeof b.projectId !== "string")
    || !Array.isArray(b.columns)
    || !isRecord(b.cards)
  ) {
    return { ok: false, reason: "무드보드 형식이 아니에요." };
  }
  if (b.columns.length === 0 || b.columns.length > MOODBOARD_MAX_COLUMNS) {
    return { ok: false, reason: "무드보드 열 개수가 올바르지 않아요." };
  }
  const cardIds = Object.keys(b.cards);
  if (cardIds.length > MOODBOARD_MAX_CARDS) {
    return { ok: false, reason: "무드보드 카드가 너무 많아요." };
  }
  for (const cardId of cardIds) {
    const problem = validateCard(cardId, (b.cards as Record<string, unknown>)[cardId]);
    if (problem) return { ok: false, reason: problem };
  }
  // 열 검증: id 중복·깨진 참조·중복 배치를 전부 거부한다.
  const columnIds = new Set<string>();
  const placed = new Set<string>();
  for (const col of b.columns as readonly MoodboardColumn[]) {
    if (!isRecord(col) || typeof col.id !== "string" || !col.id.trim() || typeof col.title !== "string" || !Array.isArray(col.cardIds)) {
      return { ok: false, reason: "무드보드 열 형식이 아니에요." };
    }
    if (columnIds.has(col.id)) return { ok: false, reason: `열 ${col.id}가 중복돼요.` };
    columnIds.add(col.id);
    for (const id of col.cardIds) {
      if (typeof id !== "string" || !(id in (b.cards as Record<string, unknown>))) {
        return { ok: false, reason: `카드 ${id}가 없어요.` };
      }
      if (placed.has(id)) return { ok: false, reason: `카드 ${id}가 두 곳에 배치돼 있어요.` };
      placed.add(id);
    }
  }
  for (const cardId of cardIds) {
    if (!placed.has(cardId)) {
      return { ok: false, reason: `카드 ${cardId}가 어느 열에도 없어요.` };
    }
  }
  return { ok: true, board: b as Moodboard };
}

/* ------------------------------------------------------------------ */
/* 이미지 참조 해석 — 개인/프로젝트 에셋 카탈로그                        */
/* ------------------------------------------------------------------ */

export type MoodboardAssetScope = "personal" | "project";

/**
 * 호스트가 넘기는 에셋 카탈로그 항목. 무드보드는 이 목록으로 ref를 해석만 하고,
 * 에셋 자체(파일·권리·저장)를 소유하지 않는다.
 * ref 표기: `personal:<assetId>` / `project:<assetId>` 범위 지정,
 * 접두 없는 id는 project → personal 순으로 찾고, http(s) URL은 외부 이미지로 그대로 쓴다.
 */
export interface MoodboardAssetCatalogEntry {
  readonly refId: string;
  readonly scope: MoodboardAssetScope;
  readonly label?: string;
  readonly imageUrl?: string;
}

export type MoodboardImageResolution =
  | {
      readonly status: "resolved";
      readonly imageUrl: string;
      readonly label: string;
      readonly scope: MoodboardAssetScope | "external";
    }
  | { readonly status: "broken"; readonly reason: string }
  | { readonly status: "not-image" };

export function resolveMoodboardCardImage(
  card: MoodboardCard,
  catalog: readonly MoodboardAssetCatalogEntry[],
): MoodboardImageResolution {
  if (card.kind !== "image") return { status: "not-image" };
  const ref = card.ref?.trim() ?? "";
  if (!ref) return { status: "broken", reason: "이미지 참조가 비어 있어요." };
  if (isHttpUrl(ref)) {
    return { status: "resolved", imageUrl: ref, label: card.text?.trim() || ref, scope: "external" };
  }
  const scoped = /^(personal|project):(.+)$/.exec(ref);
  const wantedScope = scoped ? (scoped[1] as MoodboardAssetScope) : null;
  const assetId = scoped ? scoped[2]! : ref;
  const scopes: readonly MoodboardAssetScope[] = wantedScope ? [wantedScope] : ["project", "personal"];
  for (const scope of scopes) {
    const entry = catalog.find((item) => item.refId === assetId && item.scope === scope);
    if (!entry) continue;
    if (!entry.imageUrl) {
      return { status: "broken", reason: `에셋 ${assetId}의 이미지 주소를 해석할 수 없어요.` };
    }
    return {
      status: "resolved",
      imageUrl: entry.imageUrl,
      label: entry.label?.trim() || card.text?.trim() || assetId,
      scope,
    };
  }
  return {
    status: "broken",
    reason: wantedScope
      ? `${wantedScope === "project" ? "프로젝트" : "개인"} 에셋 ${assetId}를 찾을 수 없어요.`
      : `에셋 ${assetId}를 찾을 수 없어요.`,
  };
}

/* ------------------------------------------------------------------ */
/* 프로젝트 단위 저장소                                                 */
/* ------------------------------------------------------------------ */

export const STUDIO_MOODBOARD_UPDATED_EVENT = "toonspectrum:studio:moodboard-updated";

export interface StudioMoodboardEventTarget {
  dispatchEvent(event: Event): boolean;
}

function storageKey(projectId: string): string {
  return `toonstudio:moodboard:v1:${encodeURIComponent(projectId)}`;
}

export function studioMoodboardStorageKey(projectId: string): string {
  if (!projectId.trim()) throw new Error("Project id is required.");
  return storageKey(projectId);
}

function requireProjectId(projectId: string): string {
  const normalized = projectId.trim();
  if (!normalized || normalized === "." || normalized === ".." || normalized.includes("\\")) {
    throw new Error("A valid Studio project id is required.");
  }
  return normalized;
}

/** 처음 여는 프로젝트의 기본 보드 — 기획 기본 열 3개로 시작한다. */
export function createDefaultStudioProjectMoodboard(projectId: string): Moodboard {
  const normalizedProjectId = requireProjectId(projectId);
  return createMoodboard({
    id: `${normalizedProjectId}:moodboard`,
    title: "기획 무드보드",
    projectId: normalizedProjectId,
  });
}

/**
 * 저장된 보드를 읽는다. 저장본이 없으면 null, 깨졌으면 사유와 함께 거부한다 —
 * 깨진 저장본을 기본 보드로 조용히 덮지 않는 것이 fail-closed 계약이다.
 */
export function readStudioProjectMoodboard(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
): { ok: true; board: Moodboard } | { ok: false; reason: string } | null {
  if (!projectId.trim()) return null;
  const raw = storage.getItem(storageKey(projectId));
  if (raw === null) return null;
  const parsed = deserializeMoodboard(raw);
  if (!parsed.ok) return parsed;
  if (parsed.board.projectId !== undefined && parsed.board.projectId !== projectId) {
    return { ok: false, reason: "다른 프로젝트의 무드보드예요." };
  }
  return parsed;
}

export function saveStudioProjectMoodboard(
  storage: StudioProjectDiagnosticSourceStorage,
  board: Moodboard,
  target?: StudioMoodboardEventTarget,
): Moodboard {
  if (!board.projectId) throw new Error("A project-scoped moodboard is required.");
  const normalizedProjectId = requireProjectId(board.projectId);
  const checked = deserializeMoodboard(serializeMoodboard(board));
  if (!checked.ok) throw new Error(checked.reason);
  storage.setItem(storageKey(normalizedProjectId), serializeMoodboard(checked.board));
  target?.dispatchEvent(new CustomEvent(STUDIO_MOODBOARD_UPDATED_EVENT, { detail: checked.board }));
  return checked.board;
}

/** 저장된 보드를 돌려주고, 없으면 기본 보드를 만들어 저장한 뒤 돌려준다. 깨진 저장본은 사유와 함께 던진다. */
export function ensureStudioProjectMoodboard(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
): Moodboard {
  const normalizedProjectId = requireProjectId(projectId);
  const current = readStudioProjectMoodboard(storage, normalizedProjectId);
  if (current?.ok) return current.board;
  if (current && !current.ok) throw new Error(current.reason);
  const initial = createDefaultStudioProjectMoodboard(normalizedProjectId);
  return saveStudioProjectMoodboard(storage, initial);
}
