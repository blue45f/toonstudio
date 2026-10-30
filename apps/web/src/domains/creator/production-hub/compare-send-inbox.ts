/**
 * 에디터 "비교로 보내기" 수신함 (잔여 배선 ④의 공유 계약).
 *
 * 에디터(StudioCuttoonEditorHost)는 작품(workId)과 현재 페이지는 알지만
 * 제작 관리의 프로젝트·회차 id는 모른다. 반대로 회차 룸은 workId를 안다.
 * 그래서 전송 채널은 실제 로그인 소유자와 workId로 나눈 로컬 수신함으로 정한다:
 *
 *   에디터: 현재 캔버스 캡처(data URL) → writeCompareSendInbox(scope, entry)
 *   비교 탭: peekCompareSendInbox(scope) → 비교 초안 저장·재확인 → 정확한 원문 항목만 ACK
 *
 * 항목은 compare-review-model의 reference 소스로 변환된다(에디터에서 보낸
 * 캔버스는 "레퍼런스"로서 비교 풀에 들어간다는 FLAGSHIP §4의 원래 설계).
 * 서버 저장이 생기면 같은 항목 형태를 그대로 계약으로 이관할 수 있다.
 * data URL은 로컬 저장소 용량을 지키기 위해 상한을 두고, 넘는 항목은 명시적으로 거부한다.
 */

import { getAuthUserId, listeners, type Session } from "@/domains/auth/public/session/auth-session-state";

import { compareSourceKey, poolItemFromReference, type ComparePoolItem } from "./compare-review-model";
import { isProductionReviewLocalOwnerCurrent, productionReviewLocalOwner,
  type ProductionReviewLocalOwner } from "./production-review-local-state";

export const COMPARE_SEND_INBOX_PREFIX = "toonstudio.compare-send-inbox.";
const SCOPED_PREFIX = "toonstudio.compare-send-inbox-scoped.v1:";
/** 수신함에 쌓아 둘 최대 항목 수(오래된 것부터 버려진다). */
export const COMPARE_SEND_INBOX_LIMIT = 8;
/** data URL 1건의 최대 길이. 로컬 저장소(통상 5MB) 안에서 안전하게 잡은 값. */
export const COMPARE_SEND_IMAGE_MAX_LENGTH = 2_500_000;

export interface CompareSendInboxEntry {
  readonly id: string;
  /** 에디터 페이지 id. 같은 페이지를 다시 보내면 항목이 교체된다. */
  readonly pageId: string;
  readonly pageLabel: string;
  readonly imageUrl: string;
  readonly sentAt: string;
}

export interface CompareSendInboxScope {
  readonly owner: ProductionReviewLocalOwner;
  readonly workId: string;
}
export function compareSendInboxScope(userId: string | null, workId: string, isDemo = false): CompareSendInboxScope {
  return { owner: productionReviewLocalOwner(userId, isDemo), workId };
}
function scopeKey(scope: CompareSendInboxScope): string {
  return JSON.stringify([scope.owner.kind, scope.owner.kind === "account" ? scope.owner.userId : scope.owner.mode, scope.workId]);
}
export function compareSendInboxKey(scope: CompareSendInboxScope): string {
  return SCOPED_PREFIX + encodeURIComponent(scopeKey(scope));
}

/** 에디터 전송 항목이 속할 가상 보드 id. reference 소스의 정체성(boardId::itemId)이 된다. */
export function compareSendBoardId(workId: string): string {
  return `editor-send:${workId}`;
}

function isEntry(value: unknown): value is CompareSendInboxEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === "string" && entry.id.length > 0
    && typeof entry.pageId === "string" && entry.pageId.length > 0
    && typeof entry.pageLabel === "string"
    && typeof entry.imageUrl === "string" && entry.imageUrl.startsWith("data:image/")
    && entry.imageUrl.length <= COMPARE_SEND_IMAGE_MAX_LENGTH
    && typeof entry.sentAt === "string";
}

/** 저장 문자열을 방어적으로 복원한다. 깨진 값·형식 밖 항목은 버린다. */
export function parseCompareSendInbox(raw: string | null): CompareSendInboxEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isEntry).slice(-COMPARE_SEND_INBOX_LIMIT);
  } catch {
    return [];
  }
}

export type AddCompareSendResult =
  | { readonly ok: true; readonly entries: readonly CompareSendInboxEntry[] }
  | { readonly ok: false; readonly reason: "image-too-large" | "not-an-image" };

/**
 * 항목을 더한 새 항목 목록을 돌려준다(순수 함수 — 저장은 호출자 몫).
 * 같은 pageId의 기존 항목은 새 항목으로 교체되고, 상한을 넘으면 오래된 것부터 빠진다.
 */
export function addCompareSendInboxEntry(
  entries: readonly CompareSendInboxEntry[],
  entry: CompareSendInboxEntry,
): AddCompareSendResult {
  if (!entry.imageUrl.startsWith("data:image/")) return { ok: false, reason: "not-an-image" };
  if (entry.imageUrl.length > COMPARE_SEND_IMAGE_MAX_LENGTH) return { ok: false, reason: "image-too-large" };
  const next = [...entries.filter((candidate) => candidate.pageId !== entry.pageId), entry];
  return { ok: true, entries: next.slice(-COMPARE_SEND_INBOX_LIMIT) };
}

/** 수신함 항목들을 비교 풀의 reference 항목으로 바꾼다. */
export function compareSendInboxToPoolItems(
  entries: readonly CompareSendInboxEntry[],
  workId: string,
): ComparePoolItem[] {
  const boardId = compareSendBoardId(workId);
  return entries.map((entry) => poolItemFromReference({
    boardId,
    itemId: entry.id,
    label: entry.pageLabel,
    imageUrl: entry.imageUrl,
    addedBy: "editor",
    addedAt: entry.sentAt,
  }));
}

/** Storage 최소 형태(localStorage와 테스트용 가짜가 함께 만족한다). */
export interface CompareSendStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 동일 origin의 모든 송신·수신 확인이 같은 범위의 배타 잠금을 공유해야 한다. */
export interface CompareSendInboxLockProvider {
  request<T>(name: string, options: { readonly mode: "exclusive"; readonly signal?: AbortSignal },
    operation: () => T | Promise<T>): Promise<T>;
}
export interface CompareSendInboxMutationOptions {
  readonly signal?: AbortSignal;
  readonly locks?: CompareSendInboxLockProvider | null;
}

function snapshotScope(scope: CompareSendInboxScope): CompareSendInboxScope {
  return { workId: scope.workId, owner: scope.owner.kind === "account"
    ? { kind: "account", userId: scope.owner.userId } : { kind: "guest", mode: scope.owner.mode } };
}
function snapshotEntry(entry: CompareSendInboxEntry): CompareSendInboxEntry {
  return { id: entry.id, pageId: entry.pageId, pageLabel: entry.pageLabel, imageUrl: entry.imageUrl, sentAt: entry.sentAt };
}

async function withInboxMutation<T>(scope: CompareSendInboxScope, options: CompareSendInboxMutationOptions,
  failure: (scopeChanged: boolean) => T, operation: (canMutate: () => boolean, failed: () => T) => T): Promise<T> {
  const signal = options.signal;
  if (!isProductionReviewLocalOwnerCurrent(scope.owner)) return failure(true);
  if (signal?.aborted) return failure(false);
  const controller = new AbortController(), initialUserId = getAuthUserId();
  let scopeChanged = false;
  const onSession = (session: Session) => {
    if ((session?.user.id ?? null) !== initialUserId) {
      scopeChanged = true;
      controller.abort();
    }
  };
  const onAbort = () => controller.abort();
  const canMutate = () => {
    if (!isProductionReviewLocalOwnerCurrent(scope.owner)) { scopeChanged = true; controller.abort(); }
    return !controller.signal.aborted && !scopeChanged;
  };
  listeners.add(onSession);
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    const locks = options.locks !== undefined ? options.locks
      : typeof navigator !== "undefined" && typeof navigator.locks?.request === "function"
        ? { request: <R>(name: string, lockOptions: { readonly mode: "exclusive"; readonly signal?: AbortSignal },
          callback: () => R | Promise<R>) => navigator.locks.request(name, lockOptions, callback) } : null;
    if (!locks || !canMutate()) return failure(scopeChanged);
    return await locks.request(compareSendInboxKey(scope), { mode: "exclusive", signal: controller.signal }, () => {
      if (!canMutate()) return failure(scopeChanged);
      return operation(canMutate, () => failure(scopeChanged));
    });
  } catch {
    return failure(scopeChanged);
  } finally {
    listeners.delete(onSession);
    signal?.removeEventListener("abort", onAbort);
  }
}

function readScopedEntries(raw: string | null, scope: CompareSendInboxScope): CompareSendInboxEntry[] | null {
  if (raw === null) return [];
  const envelope: unknown = JSON.parse(raw);
  if (envelope === null || typeof envelope !== "object" || Array.isArray(envelope)) return null;
  const value = envelope as Record<string, unknown>;
  if (value.version !== 1 || value.scope !== scopeKey(scope) || typeof value.payload !== "string") return null;
  const entries: unknown = JSON.parse(value.payload);
  if (!Array.isArray(entries) || entries.length > COMPARE_SEND_INBOX_LIMIT || !entries.every(isEntry)
    || entries.some((entry) => Object.keys(entry).some((key) => !["id", "pageId", "pageLabel", "imageUrl", "sentAt"].includes(key)))) return null;
  return entries;
}

function writeScopedEntries(storage: CompareSendStorage, scope: CompareSendInboxScope,
  entries: readonly CompareSendInboxEntry[], canMutate: () => boolean): boolean {
  const serialized = JSON.stringify({ version: 1, scope: scopeKey(scope), payload: JSON.stringify(entries) });
  if (!canMutate()) return false;
  storage.setItem(compareSendInboxKey(scope), serialized);
  return true;
}

/** 렌더 초기화에서도 읽기만 한다. 전달 확인 전에는 수신함 원문을 건드리지 않는다. */
export function peekCompareSendInbox(storage: CompareSendStorage, scope: CompareSendInboxScope): CompareSendInboxEntry[] {
  if (!isProductionReviewLocalOwnerCurrent(scope.owner)) return [];
  try {
    const entries = readScopedEntries(storage.getItem(compareSendInboxKey(scope)), scope);
    return isProductionReviewLocalOwnerCurrent(scope.owner) ? entries ?? [] : [];
  } catch { return []; }
}

function sameEntry(left: CompareSendInboxEntry, right: CompareSendInboxEntry): boolean {
  return left.id === right.id && left.pageId === right.pageId && left.pageLabel === right.pageLabel
    && left.imageUrl === right.imageUrl && left.sentAt === right.sentAt;
}

/** 송신과 같은 잠금 안에서 정확한 원문만 정리해 새 전송본·교체본을 보존한다. */
export async function acknowledgeCompareSendInbox(storage: CompareSendStorage, scope: CompareSendInboxScope,
  delivered: readonly CompareSendInboxEntry[], options: CompareSendInboxMutationOptions = {}): Promise<boolean> {
  const capturedScope = snapshotScope(scope), capturedDelivered = delivered.map(snapshotEntry);
  return withInboxMutation(capturedScope, options, () => false, (canMutate) => {
    const entries = readScopedEntries(storage.getItem(compareSendInboxKey(capturedScope)), capturedScope);
    if (entries === null || !canMutate()) return false;
    const remaining = entries.filter((candidate) => !capturedDelivered.some((entry) => sameEntry(entry, candidate)));
    return remaining.length === entries.length || writeScopedEntries(storage, capturedScope, remaining, canMutate);
  });
}

/** 실제 비교 pool이 원래 reference의 이미지·라벨·시각을 보존한 경우에만 전달 확인 대상으로 삼는다. */
export function compareSendInboxEntryInPool(entry: CompareSendInboxEntry, workId: string, pool: readonly ComparePoolItem[]): boolean {
  const id = compareSourceKey({ kind: "reference", boardId: compareSendBoardId(workId), itemId: entry.id });
  return pool.some((item) => item.id === id && item.source.kind === "reference" && item.source.boardId === compareSendBoardId(workId)
    && item.source.itemId === entry.id && item.label === entry.pageLabel && item.imageUrl === entry.imageUrl
    && item.addedBy === "editor" && item.addedAt === entry.sentAt && item.rightsNote === undefined);
}

/** 에디터 측 기록. 저장 실패(용량 등)는 throw하지 않고 결과로 알린다. */
export async function writeCompareSendInbox(
  storage: CompareSendStorage,
  scope: CompareSendInboxScope,
  entry: CompareSendInboxEntry,
  options: CompareSendInboxMutationOptions = {},
): Promise<AddCompareSendResult | { readonly ok: false; readonly reason: "storage-failed" | "scope-changed" }> {
  const capturedScope = snapshotScope(scope), capturedEntry = snapshotEntry(entry);
  return withInboxMutation<AddCompareSendResult | { readonly ok: false; readonly reason: "storage-failed" | "scope-changed" }>(
    capturedScope, options, (changed) => ({ ok: false, reason: changed ? "scope-changed" : "storage-failed" }), (canMutate, failed) => {
      const entries = readScopedEntries(storage.getItem(compareSendInboxKey(capturedScope)), capturedScope);
      if (entries === null) return { ok: false, reason: "storage-failed" };
      if (!canMutate()) return failed();
      const added = addCompareSendInboxEntry(entries, capturedEntry);
      if (!added.ok) return added;
      return writeScopedEntries(storage, capturedScope, added.entries, canMutate) ? added : failed();
    });
}

/** 회차 룸 측 소비: 읽고 비운다. 한 번 풀에 들어간 전송본이 다음 방문에 중복되지 않게 한다. */
export async function consumeCompareSendInbox(
  storage: CompareSendStorage,
  scope: CompareSendInboxScope,
  options: CompareSendInboxMutationOptions = {},
): Promise<CompareSendInboxEntry[]> {
  const capturedScope = snapshotScope(scope);
  return withInboxMutation<CompareSendInboxEntry[]>(capturedScope, options, () => [], (canMutate) => {
    const key = compareSendInboxKey(capturedScope), entries = readScopedEntries(storage.getItem(key), capturedScope);
    if (entries === null || !canMutate()) return [];
    if (entries.length) {
      try { storage.removeItem(key); } catch { /* 기존 소비 계약대로 원문은 남기고 읽은 항목을 반환한다. */ }
    }
    return entries;
  });
}
