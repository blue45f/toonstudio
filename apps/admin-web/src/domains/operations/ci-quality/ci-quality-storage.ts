import { createQualityBoard, exportQualityBoardJson, parseQualityBoardJson } from "./ci-quality-model";

import type { QualityBoard } from "./ci-quality-model";

export interface QualityStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
export type StorageLike = QualityStorage;
export interface QualityLoadResult { board: QualityBoard | null; error: string | null }
export interface QualitySaveResult { ok: boolean; error: string | null }

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
  try {
    const key = getQualityStorageKey(userIdentity);
    const raw = resolveStorage(storage).getItem(key);
    return { board: raw === null ? createQualityBoard(now) : parseQualityBoardJson(raw, now), error: null };
  } catch (cause) { return { board: null, error: storageError(cause, "보드를 읽지") }; }
}
export function saveQualityBoard(userIdentity: string, board: QualityBoard, storage?: QualityStorage | null, now = Date.now()): QualitySaveResult {
  try {
    const key = getQualityStorageKey(userIdentity);
    const encoded = exportQualityBoardJson({ ...board, snapshotAt: new Date(now).toISOString() }, now);
    resolveStorage(storage).setItem(key, encoded);
    return { ok: true, error: null };
  } catch (cause) { return { ok: false, error: storageError(cause, "보드를 저장하지") }; }
}

export const getCiQualityStorageKey = getQualityStorageKey;
