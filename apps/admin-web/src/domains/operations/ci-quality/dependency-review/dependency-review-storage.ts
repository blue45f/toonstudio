import { exportDependencyReviewBoard, parseReviewJson, validateDependencyReviewBoard } from "./dependency-review-model";
import { createDependencyReviewBoard } from "./dependency-review-seed";

import type { DependencyReviewBoard } from "./dependency-review-types";

export interface DependencyReviewStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export interface DependencyReviewLoad { board: DependencyReviewBoard | null; error: string | null; source: string | null | undefined }
export type DependencyReviewSave = { ok: true; error: null; source: string } | { ok: false; error: string; conflict: boolean };

export function getDependencyReviewStorageKey(userIdentity: string): string {
  if (!userIdentity.trim() || userIdentity.length > 256) throw new Error("인증된 관리자 식별자를 확인하세요.");
  return `toonstudio:admin:dependency-review:v1:${encodeURIComponent(userIdentity)}`;
}
function getStorage(storage?: DependencyReviewStorage | null): DependencyReviewStorage {
  const selected = storage === undefined ? globalThis.localStorage : storage;
  if (!selected) throw new Error("브라우저 저장소를 사용할 수 없습니다.");
  return selected;
}
function message(cause: unknown): string { return cause instanceof Error ? cause.message : "저장소 접근 오류"; }
export function loadDependencyReviewBoard(userIdentity: string, storage?: DependencyReviewStorage | null, now = Date.now()): DependencyReviewLoad {
  let source: string | null | undefined;
  try {
    source = getStorage(storage).getItem(getDependencyReviewStorageKey(userIdentity));
    const board = source === null ? createDependencyReviewBoard(now) : validateDependencyReviewBoard(parseReviewJson(source), now);
    return { board, source, error: null };
  } catch (cause) {
    return { board: null, source, error: `의존성 기록을 읽지 못했습니다. 원본은 보존합니다. (${message(cause)})` };
  }
}
export function saveDependencyReviewBoard(userIdentity: string, board: DependencyReviewBoard, expectedSource: string | null | undefined, storage?: DependencyReviewStorage | null, now = Date.now()): DependencyReviewSave {
  try {
    const key = getDependencyReviewStorageKey(userIdentity);
    const encoded = exportDependencyReviewBoard(board, now);
    if (expectedSource === undefined) throw new Error("저장소 원본을 먼저 다시 읽어야 합니다.");
    const selected = getStorage(storage);
    if (selected.getItem(key) !== expectedSource) return { ok: false, conflict: true, error: "다른 탭에서 의존성 기록이 변경되었습니다. 현재 초안을 JSON으로 백업한 뒤 최신 저장본을 다시 읽으세요." };
    selected.setItem(key, encoded);
    return { ok: true, error: null, source: encoded };
  } catch (cause) {
    return { ok: false, conflict: false, error: `의존성 기록을 저장하지 못했습니다. 현재 초안을 JSON으로 백업하세요. (${message(cause)})` };
  }
}
