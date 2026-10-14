/**
 * 팀 플레이북 — 순수 모델 + 저장소 (REPORT T-2).
 *
 * 문제: "이 작품은 배경에 톤 2종만 쓴다" 같은 팀 규칙이 사람 머리와 채팅
 * 로그에만 있어, 새 협업자가 올 때마다 같은 실수와 같은 지적이 반복된다.
 *
 * 이 모듈은 프로젝트 단위 규칙 카드(제목·내용·근거 핀 링크·관련 공정)를
 * 쌓는 저장소를 제공하고, 관련 공정을 열 때 그 규칙만 골라 돌려주는
 * 참조 도출을 제공한다. 위키가 아니라 "작업 지점에 붙는 규칙"이 형태다.
 *
 * 유입 경로:
 * - 수동 등록: 팀이 직접 규칙을 적는다 (source: "manual").
 * - R-2 승격: 검수 핀 패턴 리포트(buildPinPatternPlaybookCard)가 만든
 *   규칙 카드 초안이 여기로 들어온다 (source: "pin-pattern").
 *   같은 유형의 승격이 다시 오면 새 카드를 만들지 않고 기존 카드를
 *   갱신한다 — 플레이북이 중복 카드로 부풀지 않게 하기 위해서다.
 *
 * 원칙:
 * - 보관(archived)된 카드는 참조에서 제외한다. 삭제가 아니라 보관인
 *   이유는 근거 핀 링크와 이력을 잃지 않기 위해서다.
 * - processKeys가 빈 카드는 "전 공정 공통" 규칙이다.
 * - 공정 매칭은 canonicalProductionProcessKey로 정규화한다
 *   (레거시 "story" → "story-lock", "thumbnail" → "storyboard").
 * - 저장 방식은 foreshadow 장부와 같은 관례(프로젝트별 localStorage 키,
 *   파서로 검증한 스냅샷, 업데이트 이벤트)를 따른다.
 */
import { canonicalProductionProcessKey } from "@toonstudio/contracts/production-workflow";

import type { StudioProjectDiagnosticSourceStorage } from "../studio-project-diagnostic-source-store";
import type { BilingualLabel } from "./production-labels";
import type {
  PinPatternCategoryId,
  PinPatternPlaybookCard,
} from "./pin-pattern-report-model";

export const PLAYBOOK_CARD_SOURCES = ["manual", "pin-pattern"] as const;

export type PlaybookCardSource = (typeof PLAYBOOK_CARD_SOURCES)[number];

export interface PlaybookRuleCard {
  readonly id: string;
  readonly projectId: string;
  readonly title: BilingualLabel;
  readonly body: BilingualLabel;
  /** 관련 공정 키 (canonical). 빈 배열 = 전 공정 공통 규칙. */
  readonly processKeys: readonly string[];
  /** 근거 검수 핀 스레드 id. 수동 카드는 보통 비어 있다. */
  readonly evidenceThreadIds: readonly string[];
  readonly source: PlaybookCardSource;
  /** R-2 승격 카드의 핀 패턴 유형. 수동 카드는 null. */
  readonly categoryId: PinPatternCategoryId | null;
  /** R-2 승격 근거가 된 반복 횟수. 수동 카드는 null. */
  readonly occurrences: number | null;
  readonly archived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * R-2 핀 패턴 유형 → 관련 공정 매핑.
 * 승격 카드가 어느 공정 화면에서 참조로 떠야 하는지를 정한다.
 * "other"는 특정 공정을 가릴 근거가 없어 전 공정 공통(빈 배열)으로 둔다.
 */
export const PLAYBOOK_PROCESS_KEYS_BY_CATEGORY: Readonly<
  Record<PinPatternCategoryId, readonly string[]>
> = Object.freeze({
  anatomy: Object.freeze(["storyboard", "line-art"]),
  balloon: Object.freeze(["lettering"]),
  dialogue: Object.freeze(["lettering", "joint-proof"]),
  color: Object.freeze(["color"]),
  background: Object.freeze(["background"]),
  expression: Object.freeze(["storyboard", "line-art"]),
  composition: Object.freeze(["storyboard"]),
  continuity: Object.freeze(["story-lock", "line-art", "background", "color"]),
  sfx: Object.freeze(["lettering"]),
  other: Object.freeze([]),
});

function requireText(value: string, message: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

function requireTimestamp(now: string): string {
  if (!Number.isFinite(Date.parse(now))) {
    throw new Error("A valid playbook timestamp is required.");
  }
  return now;
}

function normalizeProcessKeys(processKeys: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const key of processKeys) {
    const canonical = canonicalProductionProcessKey(key.trim());
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    normalized.push(canonical);
  }
  return Object.freeze(normalized);
}

function dedupeStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.filter((value) => value.length > 0))]);
}

export interface CreateManualPlaybookCardInput {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly body: string;
  readonly processKeys?: readonly string[];
  readonly evidenceThreadIds?: readonly string[];
  readonly now: string;
}

/** 수동 규칙 카드 — 제목·내용은 작성 언어를 양쪽 라벨에 그대로 쓴다. */
export function createManualPlaybookCard(
  input: CreateManualPlaybookCardInput,
): PlaybookRuleCard {
  const title = requireText(input.title, "A playbook card requires a title.");
  const body = requireText(input.body, "A playbook card requires a body.");
  requireText(input.id, "A playbook card requires an id.");
  requireText(input.projectId, "A playbook card requires a project id.");
  requireTimestamp(input.now);
  return Object.freeze({
    id: input.id,
    projectId: input.projectId,
    title: Object.freeze({ ko: title, en: title }),
    body: Object.freeze({ ko: body, en: body }),
    processKeys: normalizeProcessKeys(input.processKeys ?? []),
    evidenceThreadIds: dedupeStrings(input.evidenceThreadIds ?? []),
    source: "manual" as const,
    categoryId: null,
    occurrences: null,
    archived: false,
    createdAt: input.now,
    updatedAt: input.now,
  });
}

/**
 * R-2 승격 초안(PinPatternPlaybookCard) → 플레이북 카드 변환.
 * 관련 공정은 유형 매핑(PLAYBOOK_PROCESS_KEYS_BY_CATEGORY)이 정한다.
 */
export function playbookCardFromPinPattern(
  draft: PinPatternPlaybookCard,
  input: { readonly id: string; readonly projectId: string; readonly now: string },
): PlaybookRuleCard {
  requireText(input.id, "A playbook card requires an id.");
  requireText(input.projectId, "A playbook card requires a project id.");
  requireTimestamp(input.now);
  return Object.freeze({
    id: input.id,
    projectId: input.projectId,
    title: Object.freeze({ ...draft.title }),
    body: Object.freeze({ ...draft.body }),
    processKeys: PLAYBOOK_PROCESS_KEYS_BY_CATEGORY[draft.categoryId] ?? Object.freeze([]),
    evidenceThreadIds: dedupeStrings(draft.evidenceThreadIds),
    source: "pin-pattern" as const,
    categoryId: draft.categoryId,
    occurrences: draft.occurrences,
    archived: false,
    createdAt: input.now,
    updatedAt: input.now,
  });
}

/** id 기준으로 교체하거나 끝에 붙인다 — 등록·수정의 유일한 경로. */
export function upsertPlaybookCard(
  cards: readonly PlaybookRuleCard[],
  card: PlaybookRuleCard,
): readonly PlaybookRuleCard[] {
  const exists = cards.some((entry) => entry.id === card.id);
  return Object.freeze(
    exists
      ? cards.map((entry) => (entry.id === card.id ? card : entry))
      : [...cards, card],
  );
}

export interface PromotePinPatternResult {
  readonly cards: readonly PlaybookRuleCard[];
  readonly card: PlaybookRuleCard;
  /** true = 새 카드 생성, false = 같은 유형의 기존 승격 카드를 갱신. */
  readonly created: boolean;
}

/**
 * R-2 승격 유입 — 멱등하다.
 * 같은 categoryId의 pin-pattern 카드가 이미 있으면(보관 포함) 제목·본문·
 * 근거 스레드·반복 횟수를 최신 초안으로 갱신하고 보관 상태는 유지한다.
 * 보관된 카드를 승격이 몰래 되살리지 않는다 — 되살리기는 팀의 명시
 * 조작(setPlaybookCardArchived)만 한다.
 */
export function promotePinPatternCard(
  cards: readonly PlaybookRuleCard[],
  draft: PinPatternPlaybookCard,
  input: { readonly id: string; readonly projectId: string; readonly now: string },
): PromotePinPatternResult {
  requireTimestamp(input.now);
  const existing = cards.find(
    (entry) => entry.source === "pin-pattern" && entry.categoryId === draft.categoryId,
  );
  if (!existing) {
    const card = playbookCardFromPinPattern(draft, input);
    return Object.freeze({ cards: upsertPlaybookCard(cards, card), card, created: true });
  }
  const merged: PlaybookRuleCard = Object.freeze({
    ...existing,
    title: Object.freeze({ ...draft.title }),
    body: Object.freeze({ ...draft.body }),
    processKeys: PLAYBOOK_PROCESS_KEYS_BY_CATEGORY[draft.categoryId] ?? Object.freeze([]),
    evidenceThreadIds: dedupeStrings([
      ...existing.evidenceThreadIds,
      ...draft.evidenceThreadIds,
    ]),
    occurrences: draft.occurrences,
    updatedAt: input.now,
  });
  return Object.freeze({
    cards: upsertPlaybookCard(cards, merged),
    card: merged,
    created: false,
  });
}

/** 보관/복원의 유일한 경로. 참조 표시 여부는 이 플래그만으로 갈린다. */
export function setPlaybookCardArchived(
  cards: readonly PlaybookRuleCard[],
  cardId: string,
  archived: boolean,
  updatedAt: string,
): readonly PlaybookRuleCard[] {
  requireTimestamp(updatedAt);
  return Object.freeze(
    cards.map((card) =>
      card.id === cardId
        ? Object.freeze({ ...card, archived, updatedAt })
        : card,
    ),
  );
}

/**
 * 공정 참조 도출 — 관련 공정 화면·에디터가 여는 바로 그 함수.
 * 보관되지 않은 카드 중 ① 그 공정을 명시한 카드와 ② 전 공정 공통
 * 카드를 돌려준다. 순서는 R-2 승격(근거가 쌓인 규칙) 먼저, 그다음
 * 최신 갱신순이다. 해당 없으면 빈 배열 — 호출부는 빈 배열이면
 * 아무것도 렌더하지 않아 "조용히 참조로 뜨는" 형태를 유지한다.
 */
export function playbookCardsForProcess(
  cards: readonly PlaybookRuleCard[],
  processKey: string,
): readonly PlaybookRuleCard[] {
  const canonical = canonicalProductionProcessKey(processKey.trim());
  const relevant = cards.filter((card) => {
    if (card.archived) return false;
    if (card.processKeys.length === 0) return true;
    return card.processKeys.some(
      (key) => canonicalProductionProcessKey(key) === canonical,
    );
  });
  return Object.freeze(
    [...relevant].sort((a, b) => {
      const sourceRank = (card: PlaybookRuleCard) =>
        card.source === "pin-pattern" ? 0 : 1;
      const rankDiff = sourceRank(a) - sourceRank(b);
      if (rankDiff !== 0) return rankDiff;
      return b.updatedAt.localeCompare(a.updatedAt);
    }),
  );
}

/** 프로젝트 표면 요약 — 카드 수와 공정별 참조 수를 한 번에 센다. */
export interface PlaybookDigest {
  readonly activeCount: number;
  readonly archivedCount: number;
  readonly promotedCount: number;
  readonly countsByProcess: Readonly<Record<string, number>>;
}

export function derivePlaybookDigest(
  cards: readonly PlaybookRuleCard[],
  processKeys: readonly string[],
): PlaybookDigest {
  const countsByProcess: Record<string, number> = {};
  for (const key of processKeys) {
    const canonical = canonicalProductionProcessKey(key);
    countsByProcess[canonical] = playbookCardsForProcess(cards, canonical).length;
  }
  return Object.freeze({
    activeCount: cards.filter((card) => !card.archived).length,
    archivedCount: cards.filter((card) => card.archived).length,
    promotedCount: cards.filter(
      (card) => !card.archived && card.source === "pin-pattern",
    ).length,
    countsByProcess: Object.freeze(countsByProcess),
  });
}

/* ------------------------------------------------------------------ */
/* 저장소 (foreshadow 장부와 같은 관례)                                 */
/* ------------------------------------------------------------------ */

export const STUDIO_PLAYBOOK_UPDATED_EVENT = "toonspectrum:studio:playbook-updated";

export interface StudioPlaybookState {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly cards: readonly PlaybookRuleCard[];
}

export interface StudioPlaybookEventTarget {
  dispatchEvent(event: Event): boolean;
}

function storageKey(projectId: string): string {
  return `toonstudio:playbook:v1:${encodeURIComponent(projectId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function plainClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requireProjectId(projectId: string): string {
  const normalized = projectId.trim();
  if (!normalized || normalized === "." || normalized === ".." || normalized.includes("\\")) {
    throw new Error("A valid Studio project id is required.");
  }
  return normalized;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isBilingualLabel(value: unknown): value is BilingualLabel {
  return (
    isRecord(value) &&
    typeof value.ko === "string" &&
    value.ko.length > 0 &&
    typeof value.en === "string" &&
    value.en.length > 0
  );
}

function isCardLike(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.projectId === "string" &&
    value.projectId.length > 0 &&
    isBilingualLabel(value.title) &&
    isBilingualLabel(value.body) &&
    isStringArray(value.processKeys) &&
    isStringArray(value.evidenceThreadIds) &&
    (PLAYBOOK_CARD_SOURCES as readonly string[]).includes(value.source as string) &&
    (value.categoryId === null || typeof value.categoryId === "string") &&
    (value.occurrences === null ||
      (typeof value.occurrences === "number" && Number.isFinite(value.occurrences))) &&
    typeof value.archived === "boolean" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string"
  );
}

export function parseStudioPlaybook(
  value: unknown,
  expectedProjectId?: string,
): StudioPlaybookState | null {
  if (!isRecord(value)) return null;
  if (
    value.schemaVersion !== 1 ||
    typeof value.projectId !== "string" ||
    !value.projectId.trim() ||
    (expectedProjectId !== undefined && value.projectId !== expectedProjectId) ||
    !Array.isArray(value.cards) ||
    !value.cards.every(isCardLike) ||
    !value.cards.every(
      (card) => isRecord(card) && card.projectId === value.projectId,
    )
  ) {
    return null;
  }
  return Object.freeze(plainClone(value) as unknown as StudioPlaybookState);
}

export function readStudioPlaybook(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
): StudioPlaybookState | null {
  if (!projectId.trim()) return null;
  const raw = storage.getItem(storageKey(projectId));
  if (raw === null) return null;
  try {
    return parseStudioPlaybook(JSON.parse(raw) as unknown, projectId);
  } catch {
    return null;
  }
}

export function writeStudioPlaybook(
  storage: StudioProjectDiagnosticSourceStorage,
  state: StudioPlaybookState,
  target?: StudioPlaybookEventTarget,
): StudioPlaybookState {
  const parsed = parseStudioPlaybook(state, state.projectId);
  if (!parsed) throw new Error("A structurally valid playbook state is required.");
  storage.setItem(storageKey(state.projectId), JSON.stringify(parsed));
  target?.dispatchEvent(
    new CustomEvent(STUDIO_PLAYBOOK_UPDATED_EVENT, { detail: parsed }),
  );
  return parsed;
}

/** 저장된 플레이북을 돌려주고, 없으면 빈 플레이북을 만들어 저장한 뒤 돌려준다. */
export function ensureStudioPlaybook(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
): StudioPlaybookState {
  const normalizedProjectId = requireProjectId(projectId);
  const current = readStudioPlaybook(storage, normalizedProjectId);
  if (current) return current;
  const initial: StudioPlaybookState = Object.freeze({
    schemaVersion: 1,
    projectId: normalizedProjectId,
    cards: Object.freeze([]),
  });
  return writeStudioPlaybook(storage, initial);
}
