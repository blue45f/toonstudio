/**
 * 에디터 "비교로 보내기" 수신함 (잔여 배선 ④의 공유 계약).
 *
 * 에디터(StudioCuttoonEditorHost)는 작품(workId)과 현재 페이지는 알지만
 * 제작 관리의 프로젝트·회차 id는 모른다. 반대로 회차 룸은 workId를 안다.
 * 그래서 전송 채널은 workId 키의 로컬 수신함으로 정한다:
 *
 *   에디터: 현재 캔버스 캡처(data URL) → addToCompareSendInbox(workId, entry)
 *   회차 룸: 마운트 시 consumeCompareSendInbox(workId) → reference 풀 항목으로 합류 → 비움
 *
 * 항목은 compare-review-model의 reference 소스로 변환된다(에디터에서 보낸
 * 캔버스는 "레퍼런스"로서 비교 풀에 들어간다는 FLAGSHIP §4의 원래 설계).
 * 서버 저장이 생기면 같은 항목 형태를 그대로 계약으로 이관할 수 있다.
 * data URL은 로컬 저장소 용량을 지키기 위해 상한을 두고, 넘는 항목은 명시적으로 거부한다.
 */

import { poolItemFromReference, type ComparePoolItem } from "./compare-review-model";

export const COMPARE_SEND_INBOX_PREFIX = "toonstudio.compare-send-inbox.";
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

export function compareSendInboxKey(workId: string): string {
  return `${COMPARE_SEND_INBOX_PREFIX}${workId}`;
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

/** 에디터 측 기록. 저장 실패(용량 등)는 throw하지 않고 결과로 알린다. */
export function writeCompareSendInbox(
  storage: CompareSendStorage,
  workId: string,
  entry: CompareSendInboxEntry,
): AddCompareSendResult | { readonly ok: false; readonly reason: "storage-failed" } {
  const added = addCompareSendInboxEntry(parseCompareSendInbox(storage.getItem(compareSendInboxKey(workId))), entry);
  if (!added.ok) return added;
  try {
    storage.setItem(compareSendInboxKey(workId), JSON.stringify(added.entries));
  } catch {
    return { ok: false, reason: "storage-failed" };
  }
  return added;
}

/** 회차 룸 측 소비: 읽고 비운다. 한 번 풀에 들어간 전송본이 다음 방문에 중복되지 않게 한다. */
export function consumeCompareSendInbox(
  storage: CompareSendStorage,
  workId: string,
): CompareSendInboxEntry[] {
  const key = compareSendInboxKey(workId);
  const entries = parseCompareSendInbox(storage.getItem(key));
  if (entries.length) {
    try { storage.removeItem(key); } catch { /* 비우기 실패는 중복 방지가 약해질 뿐 비교를 막지 않는다 */ }
  }
  return entries;
}
