/**
 * 비교 검수 고정본(스냅샷) 순수 모델 — FLAGSHIP §8 5단계(외부 검수·스냅샷 재현).
 *
 * 고정 검수본(ExternalReviewAccess)이 만들어지는 순간의 비교 구성(소스 풀·페인·모드·
 * 동기화/반전/오프셋)과 그 위에 꽂혀 있던 비교 핀을 하나의 불변 스냅샷으로 묶는다.
 * 외부 검수 링크를 연 사람은 계정 없이도 이 스냅샷만으로 같은 비교 화면을 재현하고,
 * 권한(comment)이 있으면 핀을 더 꽂을 수 있다 — 저장 경로는 이 모델이 소유한다:
 *  1) 이 기기(localStorage)에 즉시 저장(새로고침·재방문에도 유지)
 *  2) 검수 응답 제출 시 comparePinsJson으로 서버에 함께 전송(ExternalReviewResponse)
 *
 * 고정 원칙: 스냅샷은 검수본 생성 시점의 복사본이다. 이후 회차 룸에서 비교 구성을
 * 바꿔도 이미 발송된 링크의 화면은 바뀌지 않는다(그래서 "고정" 검수본이다).
 * 좌표·오프셋은 전부 정규화 좌표라 해상도와 무관하게 재현된다(비교 모델과 같은 규칙).
 */

import type { StudioCommentActor, StudioCommentAnchor, StudioCommentsDocument, StudioCommentThread } from "../studio-comments";
import { createEmptyStudioCommentsDocument } from "../studio-comments";
import {
  createCompareImageAnchor,
  parseCompareSession,
  serializeCompareSession,
  type CompareSession,
} from "./compare-review-model";
import { MANUSCRIPT_PIN_URGENT_PREFIX } from "./manuscript-pin-feedback-model";

// ── 스냅샷 형태 ─────────────────────────────────────────────────────────

/** 스냅샷에 남기는 핀 답글(표시·맥락 재현에 필요한 최소 정보). */
export interface CompareSnapshotPinReply {
  readonly id: string;
  readonly authorName: string;
  readonly body: string;
  readonly createdAt: string;
}

/**
 * 스냅샷에 남기는 비교 핀. 본문은 긴급 접두사를 포함한 원본 그대로 저장한다 —
 * 상태(긴급/해결) 판정이 원고 핀과 같은 규칙(resolvePinStatusFromThread)으로 재현되게.
 */
export interface CompareSnapshotPin {
  readonly threadId: string;
  readonly poolItemId: string;
  readonly pairedPoolItemId: string | null;
  readonly x: number;
  readonly y: number;
  readonly body: string;
  readonly resolved: boolean;
  readonly authorName: string;
  readonly assigneeName: string | null;
  readonly createdAt: string;
  readonly replies: readonly CompareSnapshotPinReply[];
}

export interface CompareReviewSnapshot {
  readonly version: 1;
  /** 고정 검수본(ExternalReviewAccess) id. URL 단독 재현 시에는 빈 문자열일 수 있다. */
  readonly reviewId: string;
  readonly episodeId: string;
  /** 비교 구성 전체(풀·페인·모드·동기화·오프셋·반전). */
  readonly session: CompareSession;
  readonly pins: readonly CompareSnapshotPin[];
  readonly capturedAt: string;
  readonly capturedBy: string;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCompareImageAnchor(anchor: StudioCommentThread["anchor"]): anchor is {
  type: "compare-image";
  poolItemId: string;
  x: number;
  y: number;
  pairedPoolItemId?: string;
} {
  return (anchor as { type?: string }).type === "compare-image";
}

// ── 생성 (회차 룸 → 고정 검수본) ────────────────────────────────────────

/**
 * 현재 비교 세션 + 댓글 문서에서 고정본 스냅샷을 만든다.
 * 핀은 세션 풀에 실제로 있는 소스의 것만 담는다(풀 밖 핀은 재현할 화면이 없다).
 * 답글·담당자·해결 상태까지 복사해 외부 화면에서도 맥락이 그대로 보이게 한다.
 */
export function createCompareReviewSnapshot(input: {
  readonly reviewId: string;
  readonly session: CompareSession;
  readonly comments: StudioCommentsDocument;
  readonly capturedAt: string;
  readonly capturedBy: string;
}): CompareReviewSnapshot {
  const poolIds = new Set(input.session.pool.map((item) => item.id));
  const threads = [...input.comments.threads].sort((a, b) => {
    const byTime = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  });
  const pins: CompareSnapshotPin[] = [];
  for (const thread of threads) {
    if (!isCompareImageAnchor(thread.anchor)) continue;
    if (!poolIds.has(thread.anchor.poolItemId)) continue;
    pins.push({
      threadId: thread.id,
      poolItemId: thread.anchor.poolItemId,
      pairedPoolItemId:
        thread.anchor.pairedPoolItemId && poolIds.has(thread.anchor.pairedPoolItemId)
          ? thread.anchor.pairedPoolItemId
          : null,
      x: clamp01(thread.anchor.x),
      y: clamp01(thread.anchor.y),
      body: thread.body,
      resolved: thread.resolved === true,
      authorName: thread.author.displayName,
      assigneeName: thread.assignee?.displayName ?? null,
      createdAt: thread.createdAt,
      replies: thread.replies.map((reply) => ({
        id: reply.id,
        authorName: reply.author.displayName,
        body: reply.body,
        createdAt: reply.createdAt,
      })),
    });
  }
  return {
    version: 1,
    reviewId: input.reviewId,
    episodeId: input.session.episodeId,
    session: input.session,
    pins,
    capturedAt: input.capturedAt,
    capturedBy: input.capturedBy,
  };
}

// ── 직렬화·복원 (고정 검수본 저장 필드 compareSnapshotJson의 포맷) ──────

export function serializeCompareReviewSnapshot(snapshot: CompareReviewSnapshot): string {
  return JSON.stringify(snapshot);
}

function parseSnapshotPin(value: unknown, poolIds: ReadonlySet<string>): CompareSnapshotPin | null {
  if (!isRecord(value)) return null;
  if (typeof value.threadId !== "string" || value.threadId.length === 0) return null;
  if (typeof value.poolItemId !== "string" || !poolIds.has(value.poolItemId)) return null;
  if (typeof value.body !== "string" || typeof value.createdAt !== "string") return null;
  const replies = Array.isArray(value.replies)
    ? value.replies.flatMap((reply): CompareSnapshotPinReply[] => {
        if (!isRecord(reply)) return [];
        if (typeof reply.id !== "string" || typeof reply.body !== "string" || typeof reply.createdAt !== "string") return [];
        return [{
          id: reply.id,
          authorName: typeof reply.authorName === "string" ? reply.authorName : "",
          body: reply.body,
          createdAt: reply.createdAt,
        }];
      })
    : [];
  return {
    threadId: value.threadId,
    poolItemId: value.poolItemId,
    pairedPoolItemId:
      typeof value.pairedPoolItemId === "string" && poolIds.has(value.pairedPoolItemId)
        ? value.pairedPoolItemId
        : null,
    x: clamp01(typeof value.x === "number" ? value.x : 0),
    y: clamp01(typeof value.y === "number" ? value.y : 0),
    body: value.body,
    resolved: value.resolved === true,
    authorName: typeof value.authorName === "string" ? value.authorName : "",
    assigneeName: typeof value.assigneeName === "string" ? value.assigneeName : null,
    createdAt: value.createdAt,
    replies,
  };
}

/**
 * 저장된 스냅샷을 방어적으로 복원한다. 형식이 깨졌거나 기대한 검수본·회차가 아니면
 * null — 외부 검수 페이지는 스냅샷이 없을 때 기존 제출본 화면으로 조용히 폴백한다.
 * 세션 복원은 비교 모델의 방어 파서(parseCompareSession)에 위임한다.
 */
export function parseCompareReviewSnapshot(
  raw: string | null | undefined,
  expected?: { readonly reviewId?: string; readonly episodeId?: string },
): CompareReviewSnapshot | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.version !== 1) return null;
  if (typeof parsed.episodeId !== "string" || parsed.episodeId.length === 0) return null;
  if (expected?.episodeId && parsed.episodeId !== expected.episodeId) return null;
  const reviewId = typeof parsed.reviewId === "string" ? parsed.reviewId : "";
  if (expected?.reviewId && reviewId !== expected.reviewId) return null;
  if (!isRecord(parsed.session)) return null;
  const session = parseCompareSession(JSON.stringify(parsed.session), parsed.episodeId);
  if (session.pool.length === 0) return null;
  const poolIds = new Set(session.pool.map((item) => item.id));
  const pins = Array.isArray(parsed.pins)
    ? parsed.pins.flatMap((pin) => {
        const parsedPin = parseSnapshotPin(pin, poolIds);
        return parsedPin ? [parsedPin] : [];
      })
    : [];
  return {
    version: 1,
    reviewId,
    episodeId: parsed.episodeId,
    session,
    pins,
    capturedAt: typeof parsed.capturedAt === "string" ? parsed.capturedAt : "",
    capturedBy: typeof parsed.capturedBy === "string" ? parsed.capturedBy : "",
  };
}

// ── URL 단독 재현 (?compare= 파라미터) ──────────────────────────────────

/** 외부 검수 링크에 비교 스냅샷을 실을 때 쓰는 쿼리 파라미터 이름. */
export const COMPARE_SNAPSHOT_URL_PARAM = "compare";

/**
 * URL 길이 상한. 이보다 크면 링크가 잘리거나 브라우저·프록시가 거부할 수 있어
 * URL 경로는 포기하고 고정 검수본 저장 필드(compareSnapshotJson) 경로를 쓴다.
 */
export const COMPARE_SNAPSHOT_URL_MAX_LENGTH = 7_500;

/**
 * URL에 실을 수 있는 형태로 스냅샷을 다듬는다: data: URL 이미지는 링크에 넣을 수
 * 없으므로 imageUrl을 비우고(플레이스홀더로 표시) 원본이 있었다는 사실만 남긴다.
 */
export function toUrlSafeCompareSnapshot(snapshot: CompareReviewSnapshot): CompareReviewSnapshot {
  const pool = snapshot.session.pool.map((item) =>
    item.imageUrl && item.imageUrl.startsWith("data:")
      ? { ...item, imageUrl: null }
      : item,
  );
  return { ...snapshot, session: { ...snapshot.session, pool } };
}

function base64UrlEncodeUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecodeUtf8(value: string): string | null {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * 스냅샷을 ?compare= 값(base64url)으로 인코딩한다. 너무 크면 null —
 * 호출 측은 그 경우 저장 필드 경로를 안내해야 한다(조용히 잘린 링크를 만들지 않는다).
 */
export function encodeCompareSnapshotForUrl(snapshot: CompareReviewSnapshot): string | null {
  const encoded = base64UrlEncodeUtf8(serializeCompareReviewSnapshot(toUrlSafeCompareSnapshot(snapshot)));
  return encoded.length <= COMPARE_SNAPSHOT_URL_MAX_LENGTH ? encoded : null;
}

/** ?compare= 값에서 스냅샷을 복원한다. 실패하면 null(기존 화면 폴백). */
export function decodeCompareSnapshotFromUrl(
  value: string | null | undefined,
  expected?: { readonly reviewId?: string; readonly episodeId?: string },
): CompareReviewSnapshot | null {
  if (!value) return null;
  const json = base64UrlDecodeUtf8(value);
  if (json === null) return null;
  return parseCompareReviewSnapshot(json, expected);
}

/** 외부 검수 경로에 스냅샷 파라미터를 붙인 전체 URL을 만든다. 인코딩 불가 시 null. */
export function buildExternalCompareReviewUrl(
  basePath: string,
  snapshot: CompareReviewSnapshot,
  token?: string,
): string | null {
  const encoded = encodeCompareSnapshotForUrl(snapshot);
  if (encoded === null) return null;
  const params = new URLSearchParams();
  if (token) params.set("token", token);
  params.set(COMPARE_SNAPSHOT_URL_PARAM, encoded);
  return `${basePath}?${params.toString()}`;
}

// ── 스냅샷 ↔ 댓글 문서 (외부 화면의 핀 렌더·작성 공용 체계) ────────────

function snapshotPinToThread(pin: CompareSnapshotPin): StudioCommentThread {
  const anchor = createCompareImageAnchor(
    pin.poolItemId,
    { x: pin.x, y: pin.y },
    pin.pairedPoolItemId ?? undefined,
  ) as unknown as StudioCommentAnchor;
  const author: StudioCommentActor = { displayName: pin.authorName || "검수자" };
  return {
    id: pin.threadId,
    anchor,
    author,
    body: pin.body,
    mentions: [],
    createdAt: pin.createdAt,
    updatedAt: pin.createdAt,
    replies: pin.replies.map((reply) => ({
      id: reply.id,
      author: { displayName: reply.authorName || "검수자" } as StudioCommentActor,
      body: reply.body,
      mentions: [],
      createdAt: reply.createdAt,
      updatedAt: reply.createdAt,
    })),
    resolved: pin.resolved,
    ...(pin.resolved ? { resolvedAt: pin.createdAt } : {}),
    ...(pin.assigneeName ? { assignee: { displayName: pin.assigneeName } as StudioCommentActor } : {}),
  } as StudioCommentThread;
}

/**
 * 스냅샷 핀을 댓글 문서로 되살린다. 비교 뷰어(CompareReviewViewer)가 원고 핀과
 * 같은 체계로 렌더·집계·게이트 계산을 그대로 수행할 수 있게 하는 변환이다.
 */
export function snapshotToCommentsDocument(snapshot: CompareReviewSnapshot): StudioCommentsDocument {
  const empty = createEmptyStudioCommentsDocument();
  return { ...empty, threads: snapshot.pins.map(snapshotPinToThread) };
}

/** 댓글 문서에서 비교 핀만 스냅샷 핀 형태로 다시 뽑는다(저장·제출용). */
export function commentsDocumentToSnapshotPins(
  document: StudioCommentsDocument,
  poolIds: ReadonlySet<string>,
): CompareSnapshotPin[] {
  const pins: CompareSnapshotPin[] = [];
  const threads = [...document.threads].sort((a, b) => {
    const byTime = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  });
  for (const thread of threads) {
    if (!isCompareImageAnchor(thread.anchor)) continue;
    if (!poolIds.has(thread.anchor.poolItemId)) continue;
    pins.push({
      threadId: thread.id,
      poolItemId: thread.anchor.poolItemId,
      pairedPoolItemId: thread.anchor.pairedPoolItemId ?? null,
      x: clamp01(thread.anchor.x),
      y: clamp01(thread.anchor.y),
      body: thread.body,
      resolved: thread.resolved === true,
      authorName: thread.author.displayName,
      assigneeName: thread.assignee?.displayName ?? null,
      createdAt: thread.createdAt,
      replies: thread.replies.map((reply) => ({
        id: reply.id,
        authorName: reply.author.displayName,
        body: reply.body,
        createdAt: reply.createdAt,
      })),
    });
  }
  return pins;
}

/**
 * 외부 검수자가 쓴 핀을 제출 페이로드(comparePinsJson)로 직렬화한다.
 * 스냅샷 원본 핀과 threadId가 겹치면 최신 문서 쪽(해결·답글 반영)을 남긴다.
 */
export function serializeExternalComparePins(
  document: StudioCommentsDocument,
  session: CompareSession,
): string {
  const poolIds = new Set(session.pool.map((item) => item.id));
  return JSON.stringify(commentsDocumentToSnapshotPins(document, poolIds));
}

/** comparePinsJson(제출로 저장된 핀)을 방어적으로 복원한다. */
export function parseExternalComparePins(
  raw: string | null | undefined,
  session: CompareSession,
): CompareSnapshotPin[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const poolIds = new Set(session.pool.map((item) => item.id));
  return parsed.flatMap((pin) => {
    const parsedPin = parseSnapshotPin(pin, poolIds);
    return parsedPin ? [parsedPin] : [];
  });
}

/**
 * 이미 있는 댓글 문서에 스냅샷 핀들을 합친다. 같은 threadId는 문서 쪽이 최신이라
 * 유지하고, 없는 핀만 뒤에 붙인다(서버에 저장된 제출 핀·로컬 저장 핀 복원용).
 */
export function mergeSnapshotPinsIntoDocument(
  document: StudioCommentsDocument,
  pins: readonly CompareSnapshotPin[],
): StudioCommentsDocument {
  const existing = new Set(document.threads.map((thread) => thread.id));
  const additions = pins.filter((pin) => !existing.has(pin.threadId)).map(snapshotPinToThread);
  if (additions.length === 0) return document;
  return { ...document, threads: [...document.threads, ...additions] };
}

// ── 외부 핀 추가 (저장 가능한 형태로) ───────────────────────────────────

export interface ExternalComparePinInput {
  readonly poolItemId: string;
  readonly pairedPoolItemId?: string | null;
  readonly x: number;
  readonly y: number;
  readonly body: string;
  readonly urgent?: boolean;
  readonly authorName: string;
}

/**
 * 외부 검수 화면에서 새 핀을 스냅샷에 추가한 새 스냅샷을 돌려준다(불변).
 * threadId는 호출 측이 발급한다(중복이면 기존 스냅샷을 그대로 돌려준다).
 * 긴급은 원고 핀과 같은 본문 접두사 규칙으로 인코딩한다.
 */
export function addPinToCompareSnapshot(
  snapshot: CompareReviewSnapshot,
  input: ExternalComparePinInput & { readonly threadId: string; readonly createdAt: string },
): CompareReviewSnapshot {
  const poolItemIds = new Set(snapshot.session.pool.map((item) => item.id));
  if (!poolItemIds.has(input.poolItemId)) return snapshot;
  if (snapshot.pins.some((pin) => pin.threadId === input.threadId)) return snapshot;
  const body = input.urgent && !input.body.startsWith(MANUSCRIPT_PIN_URGENT_PREFIX)
    ? `${MANUSCRIPT_PIN_URGENT_PREFIX}${input.body}`
    : input.body;
  const pin: CompareSnapshotPin = {
    threadId: input.threadId,
    poolItemId: input.poolItemId,
    pairedPoolItemId:
      input.pairedPoolItemId && poolItemIds.has(input.pairedPoolItemId) && input.pairedPoolItemId !== input.poolItemId
        ? input.pairedPoolItemId
        : null,
    x: clamp01(input.x),
    y: clamp01(input.y),
    body,
    resolved: false,
    authorName: input.authorName,
    assigneeName: null,
    createdAt: input.createdAt,
    replies: [],
  };
  return { ...snapshot, pins: [...snapshot.pins, pin] };
}

/** 스냅샷 세션을 그대로 돌려준다(외부 화면 초기화용 별칭 — 의도를 코드에 남긴다). */
export function snapshotToCompareSession(snapshot: CompareReviewSnapshot): CompareSession {
  return snapshot.session;
}

export { serializeCompareSession };
