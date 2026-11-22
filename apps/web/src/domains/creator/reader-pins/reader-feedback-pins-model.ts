/**
 * 독자·어시스턴트 오탈자·작화 피드백 핀 수집 & 컷 점프 엔진.
 *
 * 컷 좌표 (x, y)와 4종 카테고리(오탈자·작화수정·말풍선·연출제안),
 * 상태(열림·해결됨) 핀 목록을 관리하며 JSON 공유·병합과 원클릭 컷 점프 타깃 계산을 제공한다.
 */

export const READER_FEEDBACK_PIN_CATEGORIES = [
  "typo",
  "art-fix",
  "balloon",
  "direction",
] as const;
export type ReaderFeedbackPinCategory = (typeof READER_FEEDBACK_PIN_CATEGORIES)[number];

export const READER_FEEDBACK_PIN_CATEGORY_LABELS: Readonly<
  Record<ReaderFeedbackPinCategory, string>
> = {
  typo: "오탈자",
  "art-fix": "작화수정",
  balloon: "말풍선",
  direction: "연출제안",
};

export const READER_FEEDBACK_PIN_STATUSES = ["open", "resolved"] as const;
export type ReaderFeedbackPinStatus = (typeof READER_FEEDBACK_PIN_STATUSES)[number];

export const READER_FEEDBACK_PIN_STATUS_LABELS: Readonly<Record<ReaderFeedbackPinStatus, string>> =
  {
    open: "열림",
    resolved: "해결됨",
  };

export const READER_FEEDBACK_AUTHOR_ROLES = [
  "reader",
  "assistant",
  "editor",
  "author",
] as const;
export type ReaderFeedbackAuthorRole = (typeof READER_FEEDBACK_AUTHOR_ROLES)[number];

export const READER_FEEDBACK_AUTHOR_ROLE_LABELS: Readonly<
  Record<ReaderFeedbackAuthorRole, string>
> = {
  reader: "독자",
  assistant: "어시스턴트",
  editor: "편집자",
  author: "작가",
};

export interface ReaderFeedbackPin {
  readonly id: string;
  readonly pageId: string;
  /** 1-based 컷 번호. */
  readonly cutIndex: number;
  /** 컷/페이지 내 정규화 X 좌표 (0~1). */
  readonly x: number;
  /** 컷/페이지 내 정규화 Y 좌표 (0~1). */
  readonly y: number;
  readonly category: ReaderFeedbackPinCategory;
  readonly status: ReaderFeedbackPinStatus;
  readonly authorRole: ReaderFeedbackAuthorRole;
  readonly authorName: string;
  readonly comment: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateReaderFeedbackPinInput {
  readonly id?: string;
  readonly pageId: string;
  readonly cutIndex?: number;
  readonly x: number;
  readonly y: number;
  readonly category: ReaderFeedbackPinCategory;
  readonly status?: ReaderFeedbackPinStatus;
  readonly authorRole?: ReaderFeedbackAuthorRole;
  readonly authorName?: string;
  readonly comment: string;
  readonly nowIso?: string;
}

export interface ReaderFeedbackPinFilter {
  readonly category?: ReaderFeedbackPinCategory | "all";
  readonly status?: ReaderFeedbackPinStatus | "all";
  readonly pageId?: string | "all";
  readonly query?: string;
}

export interface ReaderFeedbackPinSummary {
  readonly total: number;
  readonly openCount: number;
  readonly resolvedCount: number;
  readonly byCategory: Readonly<Record<ReaderFeedbackPinCategory, number>>;
}

export interface ReaderFeedbackPinJumpTarget {
  readonly pinId: string;
  readonly pageId: string;
  readonly cutIndex: number;
  readonly x: number;
  readonly y: number;
  readonly xPercent: number;
  readonly yPercent: number;
}

export interface ReaderFeedbackPinsShareEnvelope {
  readonly schemaVersion: 1;
  readonly kind: "toonstudio.reader-feedback-pins";
  readonly exportedAt: string;
  readonly episodeLabel?: string;
  readonly pins: readonly ReaderFeedbackPin[];
}

export type ParseReaderFeedbackPinsResult =
  | { readonly ok: true; readonly pins: readonly ReaderFeedbackPin[]; readonly episodeLabel?: string }
  | { readonly ok: false; readonly errorKo: string };

export interface MergeReaderFeedbackPinsResult {
  readonly merged: readonly ReaderFeedbackPin[];
  readonly addedCount: number;
  readonly updatedCount: number;
  readonly skippedDuplicateCount: number;
}

const MAX_COMMENT_LENGTH = 400;
const MAX_AUTHOR_NAME_LENGTH = 48;
const SHARE_ENVELOPE_KIND = "toonstudio.reader-feedback-pins";

export function clampNormalizedCoordinate(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  const clamped = Math.min(1, Math.max(0, value));
  return Math.round(clamped * 1000) / 1000;
}

function normalizeCutIndex(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(1, Math.trunc(value));
}

function isCategory(value: unknown): value is ReaderFeedbackPinCategory {
  return (
    typeof value === "string"
    && (READER_FEEDBACK_PIN_CATEGORIES as readonly string[]).includes(value)
  );
}

function isStatus(value: unknown): value is ReaderFeedbackPinStatus {
  return (
    typeof value === "string"
    && (READER_FEEDBACK_PIN_STATUSES as readonly string[]).includes(value)
  );
}

function isAuthorRole(value: unknown): value is ReaderFeedbackAuthorRole {
  return (
    typeof value === "string"
    && (READER_FEEDBACK_AUTHOR_ROLES as readonly string[]).includes(value)
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createPinId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `pin-${globalThis.crypto.randomUUID()}`;
  }
  return `pin-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
}

function normalizeIsoTimestamp(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim().length > 0 && !Number.isNaN(Date.parse(value))) {
    return value.trim();
  }
  return fallback;
}

export function createReaderFeedbackPin(input: CreateReaderFeedbackPinInput): ReaderFeedbackPin {
  const pageId = input.pageId.trim();
  if (!pageId) {
    throw new Error("피드백 핀에는 페이지 식별자가 필요합니다.");
  }
  const comment = input.comment.trim().slice(0, MAX_COMMENT_LENGTH);
  if (!comment) {
    throw new Error("피드백 내용을 입력해 주세요.");
  }
  const now = normalizeIsoTimestamp(input.nowIso, new Date().toISOString());
  const role: ReaderFeedbackAuthorRole = input.authorRole ?? "assistant";
  const authorName =
    (input.authorName?.trim() || READER_FEEDBACK_AUTHOR_ROLE_LABELS[role]).slice(
      0,
      MAX_AUTHOR_NAME_LENGTH,
    );

  return {
    id: input.id?.trim() || createPinId(),
    pageId,
    cutIndex: normalizeCutIndex(input.cutIndex),
    x: clampNormalizedCoordinate(input.x),
    y: clampNormalizedCoordinate(input.y),
    category: input.category,
    status: input.status ?? "open",
    authorRole: role,
    authorName,
    comment,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateReaderFeedbackPinStatus(
  pins: readonly ReaderFeedbackPin[],
  pinId: string,
  status: ReaderFeedbackPinStatus,
  nowIso = new Date().toISOString(),
): readonly ReaderFeedbackPin[] {
  const safeNow = normalizeIsoTimestamp(nowIso, new Date().toISOString());
  return pins.map((pin) =>
    pin.id === pinId && pin.status !== status
      ? { ...pin, status, updatedAt: safeNow }
      : pin,
  );
}

export function removeReaderFeedbackPin(
  pins: readonly ReaderFeedbackPin[],
  pinId: string,
): readonly ReaderFeedbackPin[] {
  return pins.filter((pin) => pin.id !== pinId);
}

export function filterReaderFeedbackPins(
  pins: readonly ReaderFeedbackPin[],
  filter: ReaderFeedbackPinFilter,
): readonly ReaderFeedbackPin[] {
  const normalizedQuery = (filter.query ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ko-KR");
  return pins.filter((pin) => {
    if (filter.category && filter.category !== "all" && pin.category !== filter.category) {
      return false;
    }
    if (filter.status && filter.status !== "all" && pin.status !== filter.status) {
      return false;
    }
    if (filter.pageId && filter.pageId !== "all" && pin.pageId !== filter.pageId) {
      return false;
    }
    if (normalizedQuery.length === 0) return true;
    const haystack = [
      pin.comment,
      pin.authorName,
      READER_FEEDBACK_PIN_CATEGORY_LABELS[pin.category],
      READER_FEEDBACK_PIN_STATUS_LABELS[pin.status],
      READER_FEEDBACK_AUTHOR_ROLE_LABELS[pin.authorRole],
      `${pin.cutIndex}컷`,
    ]
      .join(" ")
      .normalize("NFKC")
      .toLocaleLowerCase("ko-KR");
    return haystack.includes(normalizedQuery);
  });
}

export function summarizeReaderFeedbackPins(
  pins: readonly ReaderFeedbackPin[],
): ReaderFeedbackPinSummary {
  const byCategory: Record<ReaderFeedbackPinCategory, number> = {
    typo: 0,
    "art-fix": 0,
    balloon: 0,
    direction: 0,
  };
  let openCount = 0;
  let resolvedCount = 0;
  for (const pin of pins) {
    byCategory[pin.category] += 1;
    if (pin.status === "open") openCount += 1;
    else resolvedCount += 1;
  }
  return {
    total: pins.length,
    openCount,
    resolvedCount,
    byCategory,
  };
}

export function resolveReaderFeedbackPinJumpTarget(
  pin: ReaderFeedbackPin,
): ReaderFeedbackPinJumpTarget {
  const x = clampNormalizedCoordinate(pin.x);
  const y = clampNormalizedCoordinate(pin.y);
  return {
    pinId: pin.id,
    pageId: pin.pageId,
    cutIndex: normalizeCutIndex(pin.cutIndex),
    x,
    y,
    xPercent: Math.round(x * 100),
    yPercent: Math.round(y * 100),
  };
}

export function exportReaderFeedbackPinsJson(
  pins: readonly ReaderFeedbackPin[],
  options: { readonly episodeLabel?: string; readonly exportedAt?: string } = {},
): string {
  const envelope: ReaderFeedbackPinsShareEnvelope = {
    schemaVersion: 1,
    kind: SHARE_ENVELOPE_KIND,
    exportedAt: normalizeIsoTimestamp(options.exportedAt, new Date().toISOString()),
    ...(options.episodeLabel?.trim() ? { episodeLabel: options.episodeLabel.trim() } : {}),
    pins: [...pins],
  };
  return `${JSON.stringify(envelope, null, 2)}\n`;
}

function parsePinEntry(
  raw: unknown,
  index: number,
  fallbackIso: string,
): { readonly ok: true; readonly pin: ReaderFeedbackPin } | { readonly ok: false; readonly errorKo: string } {
  if (!isPlainRecord(raw)) {
    return { ok: false, errorKo: `${index + 1}번째 핀 항목이 객체 형식이 아닙니다.` };
  }
  const pageId = typeof raw.pageId === "string" ? raw.pageId.trim() : "";
  if (!pageId) {
    return { ok: false, errorKo: `${index + 1}번째 핀에 pageId가 비어 있습니다.` };
  }
  const comment = typeof raw.comment === "string" ? raw.comment.trim() : "";
  if (!comment) {
    return { ok: false, errorKo: `${index + 1}번째 핀에 피드백 내용이 없습니다.` };
  }
  if (!isCategory(raw.category)) {
    return { ok: false, errorKo: `${index + 1}번째 핀의 분류 값이 올바르지 않습니다.` };
  }
  const status: ReaderFeedbackPinStatus = raw.status === undefined ? "open" : isStatus(raw.status) ? raw.status : "open";
  if (raw.status !== undefined && !isStatus(raw.status)) {
    return { ok: false, errorKo: `${index + 1}번째 핀의 상태 값이 올바르지 않습니다.` };
  }
  if (typeof raw.x !== "number" || !Number.isFinite(raw.x) || typeof raw.y !== "number" || !Number.isFinite(raw.y)) {
    return { ok: false, errorKo: `${index + 1}번째 핀의 좌표(x, y)가 유효한 숫자가 아닙니다.` };
  }
  const role: ReaderFeedbackAuthorRole = isAuthorRole(raw.authorRole) ? raw.authorRole : "reader";
  const createdAt = normalizeIsoTimestamp(raw.createdAt, fallbackIso);
  const updatedAt = normalizeIsoTimestamp(raw.updatedAt, createdAt);
  const authorName =
    typeof raw.authorName === "string" && raw.authorName.trim().length > 0
      ? raw.authorName.trim().slice(0, MAX_AUTHOR_NAME_LENGTH)
      : READER_FEEDBACK_AUTHOR_ROLE_LABELS[role];
  const id = typeof raw.id === "string" && raw.id.trim().length > 0 ? raw.id.trim() : createPinId();

  return {
    ok: true,
    pin: {
      id,
      pageId,
      cutIndex: normalizeCutIndex(typeof raw.cutIndex === "number" ? raw.cutIndex : 1),
      x: clampNormalizedCoordinate(raw.x),
      y: clampNormalizedCoordinate(raw.y),
      category: raw.category,
      status,
      authorRole: role,
      authorName,
      comment: comment.slice(0, MAX_COMMENT_LENGTH),
      createdAt,
      updatedAt,
    },
  };
}

export function parseReaderFeedbackPinsJson(rawText: string): ParseReaderFeedbackPinsResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { ok: false, errorKo: "가져올 피드백 핀 JSON을 입력해 주세요." };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, errorKo: "JSON 형식을 해석할 수 없습니다. 따옴표와 괄호를 확인해 주세요." };
  }

  let rawPins: unknown;
  let episodeLabel: string | undefined;
  const fallbackIso = new Date().toISOString();

  if (Array.isArray(parsed)) {
    rawPins = parsed;
  } else if (isPlainRecord(parsed)) {
    if (parsed.kind !== undefined && parsed.kind !== SHARE_ENVELOPE_KIND) {
      return { ok: false, errorKo: "지원하지 않는 피드백 핀 공유 문서 형식입니다." };
    }
    if (parsed.schemaVersion !== undefined && parsed.schemaVersion !== 1) {
      return { ok: false, errorKo: "지원하지 않는 피드백 핀 스키마 버전입니다." };
    }
    rawPins = parsed.pins;
    if (typeof parsed.episodeLabel === "string" && parsed.episodeLabel.trim().length > 0) {
      episodeLabel = parsed.episodeLabel.trim();
    }
  } else {
    return { ok: false, errorKo: "피드백 핀 목록은 JSON 객체 또는 배열이어야 합니다." };
  }

  if (!Array.isArray(rawPins)) {
    return { ok: false, errorKo: "JSON 문서에 pins 배열이 없습니다." };
  }

  const pins: ReaderFeedbackPin[] = [];
  for (let i = 0; i < rawPins.length; i += 1) {
    const entry = parsePinEntry(rawPins[i], i, fallbackIso);
    if (!entry.ok) return entry;
    pins.push(entry.pin);
  }
  return { ok: true, pins, ...(episodeLabel ? { episodeLabel } : {}) };
}

function pinFingerprint(pin: ReaderFeedbackPin): string {
  const xBucket = Math.round(pin.x * 100);
  const yBucket = Math.round(pin.y * 100);
  const text = pin.comment.normalize("NFKC").trim().toLocaleLowerCase("ko-KR");
  return `${pin.pageId}|${pin.cutIndex}|${xBucket}|${yBucket}|${pin.category}|${text}`;
}

function timestampMs(iso: string): number {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * 기존 핀 목록과 외부 공유(독자·어시스턴트) 핀 목록을 결정적으로 병합한다.
 * - 동일 ID는 `updatedAt`이 더 최신인 항목을 채택한다.
 * - 다른 ID라도 같은 페이지·컷·좌표·분류·내용이면 중복 삽입을 막는다.
 */
export function mergeReaderFeedbackPins(
  existing: readonly ReaderFeedbackPin[],
  incoming: readonly ReaderFeedbackPin[],
): MergeReaderFeedbackPinsResult {
  const byId = new Map<string, ReaderFeedbackPin>();
  const fingerprints = new Set<string>();
  const orderedIds: string[] = [];

  for (const pin of existing) {
    byId.set(pin.id, pin);
    fingerprints.add(pinFingerprint(pin));
    orderedIds.push(pin.id);
  }

  let addedCount = 0;
  let updatedCount = 0;
  let skippedDuplicateCount = 0;

  for (const candidate of incoming) {
    const current = byId.get(candidate.id);
    if (current) {
      const currentTime = timestampMs(current.updatedAt);
      const nextTime = timestampMs(candidate.updatedAt);
      const changed =
        current.status !== candidate.status
        || current.comment !== candidate.comment
        || current.category !== candidate.category
        || current.x !== candidate.x
        || current.y !== candidate.y
        || current.cutIndex !== candidate.cutIndex;

      if (changed && nextTime >= currentTime) {
        fingerprints.delete(pinFingerprint(current));
        byId.set(candidate.id, candidate);
        fingerprints.add(pinFingerprint(candidate));
        updatedCount += 1;
      } else {
        skippedDuplicateCount += 1;
      }
      continue;
    }

    const fp = pinFingerprint(candidate);
    if (fingerprints.has(fp)) {
      skippedDuplicateCount += 1;
      continue;
    }

    byId.set(candidate.id, candidate);
    fingerprints.add(fp);
    orderedIds.push(candidate.id);
    addedCount += 1;
  }

  const merged = orderedIds
    .map((id) => byId.get(id))
    .filter((pin): pin is ReaderFeedbackPin => pin !== undefined);

  return {
    merged,
    addedCount,
    updatedCount,
    skippedDuplicateCount,
  };
}
