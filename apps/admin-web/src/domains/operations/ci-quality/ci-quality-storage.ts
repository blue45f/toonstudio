import { createQualityBoard, exportQualityBoardJson, parseQualityBoardJson } from "./ci-quality-model";

import type { QualityBoard } from "./ci-quality-model";

export interface QualityStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export type StorageLike = QualityStorage;
export interface QualityLoadResult { board: QualityBoard | null; error: string | null; source: string | null | undefined }
export type QualitySaveResult = { ok: true; error: null; source: string } | { ok: false; error: string; conflict: boolean };

export function getQualityStorageKey(userIdentity: string): string {
  if (!userIdentity.trim() || userIdentity.length > 256) throw new Error("관리자 사용자 식별자를 확인할 수 없습니다.");
  return `toonstudio:admin:ci-quality:v1:${encodeURIComponent(userIdentity)}`;
}
function resolveStorage(storage?: QualityStorage | null): QualityStorage {
  const selected = storage === undefined ? globalThis.localStorage : storage;
  if (!selected) throw new Error("이 브라우저의 로컬 저장소를 사용할 수 없습니다.");
  return selected;
}
function storageError(cause: unknown, action: string): string {
  const detail = cause instanceof Error ? cause.message : "저장소 접근 실패";
  return `${action} 못했습니다. 원본을 자동으로 덮어쓰지 않습니다. JSON 백업을 이용하세요. (${detail})`;
}
export function loadQualityBoard(userIdentity: string, storage?: QualityStorage | null, now = Date.now()): QualityLoadResult {
  let source: string | null | undefined;
  try {
    const key = getQualityStorageKey(userIdentity);
    source = resolveStorage(storage).getItem(key);
    return { board: source === null ? createQualityBoard(now) : parseQualityBoardJson(source, now), error: null, source };
  } catch (cause) { return { board: null, error: storageError(cause, "보드를 읽지"), source }; }
}
export function saveQualityBoard(userIdentity: string, board: QualityBoard, expectedSource: string | null | undefined, storage?: QualityStorage | null, now = Date.now()): QualitySaveResult {
  try {
    const key = getQualityStorageKey(userIdentity);
    const encoded = exportQualityBoardJson({ ...board, snapshotAt: new Date(now).toISOString() }, now);
    if (expectedSource === undefined) throw new Error("저장된 원본을 먼저 다시 읽어야 합니다.");
    const selected = resolveStorage(storage);
    // 다른 창에서 저장한 기록을 오래된 화면의 전체 보드로 덮어쓰지 않는다.
    if (selected.getItem(key) !== expectedSource) return { ok: false, conflict: true, error: "다른 창에서 저장된 기록이 변경되었습니다. 현재 화면은 저장하지 않았습니다. JSON으로 백업한 뒤 최신 저장본을 다시 읽으세요." };
    selected.setItem(key, encoded);
    return { ok: true, error: null, source: encoded };
  } catch (cause) { return { ok: false, error: storageError(cause, "보드를 저장하지"), conflict: false }; }
}

export const getCiQualityStorageKey = getQualityStorageKey;
