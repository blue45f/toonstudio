import { SYNC_STUDIO_SURFACES } from "./studio-offline-first-sync-bridge";

export type OfflineSyncLegacySource = "local-storage" | "indexeddb";
export type OfflineSyncLegacyErrorCode = "unavailable" | "format" | "scope" | "size";
export const OFFLINE_SYNC_LEGACY_MAX_BYTES = 8 * 1024 * 1024;
const DATABASE_NAME = "toonstudio_offline_sync_v1";

export class OfflineSyncLegacyExportError extends Error {
  constructor(readonly code: OfflineSyncLegacyErrorCode) {
    super(`이전 동기화 사본을 내보낼 수 없습니다: ${code}`);
    this.name = "OfflineSyncLegacyExportError";
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function integer(value: unknown): value is number {
  return nonnegative(value) && Number.isSafeInteger(value);
}
function scalarMap(value: unknown): boolean {
  return object(value) && Object.values(value).every((item) => item === null
    || typeof item === "string" || typeof item === "boolean" || (typeof item === "number" && Number.isFinite(item)));
}
function entity(value: unknown): value is Record<string, unknown> {
  return object(value) && SYNC_STUDIO_SURFACES.some((surface) => surface === value.surface)
    && typeof value.entityId === "string" && value.entityId.length > 0;
}
function record(value: unknown): value is Record<string, unknown> {
  return entity(value) && integer(value.lamport) && nonnegative(value.updatedAtMs)
    && typeof value.actorId === "string" && scalarMap(value.payload);
}
function operation(value: unknown): boolean {
  return entity(value) && typeof value.opId === "string" && typeof value.actorId === "string"
    && scalarMap(value.patch) && integer(value.lamport) && nonnegative(value.createdAtMs)
    && ["pending", "retrying", "synced", "failed"].some((status) => status === value.status)
    && integer(value.retryCount) && integer(value.maxRetries) && nonnegative(value.nextRetryAtMs)
    && (value.lastError === undefined || typeof value.lastError === "string");
}
function conflict(value: unknown): boolean {
  return entity(value) && typeof value.conflictId === "string" && nonnegative(value.detectedAtMs)
    && Array.isArray(value.conflictingFields) && value.conflictingFields.every((field) => typeof field === "string")
    && record(value.localRecord) && record(value.remoteRecord)
    && [value.localRecord, value.remoteRecord].every((item) => item.surface === value.surface && item.entityId === value.entityId)
    && ["merged", "local-wins", "remote-wins", "pending-manual"].some((resolution) => resolution === value.resolution)
    && (value.resolvedRecord === null || (record(value.resolvedRecord)
      && value.resolvedRecord.surface === value.surface && value.resolvedRecord.entityId === value.entityId));
}

/** 내용을 적용하거나 정규화하지 않고, 해당 작품의 이전 사본인지 확인한 원문만 반환한다. */
export function validateOfflineSyncLegacySnapshot(raw: unknown, projectId: string): string {
  if (typeof raw !== "string") throw new OfflineSyncLegacyExportError("format");
  if (raw.length > OFFLINE_SYNC_LEGACY_MAX_BYTES || new TextEncoder().encode(raw).byteLength > OFFLINE_SYNC_LEGACY_MAX_BYTES) {
    throw new OfflineSyncLegacyExportError("size");
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new OfflineSyncLegacyExportError("format"); }
  if (!object(parsed) || parsed.schemaVersion !== 1 || parsed.authority !== "local-first") throw new OfflineSyncLegacyExportError("format");
  if (parsed.projectId !== projectId) throw new OfflineSyncLegacyExportError("scope");
  if (!integer(parsed.lamportClock) || !integer(parsed.syncedOpCount)
    || !(parsed.lastSyncedAtMs === null || nonnegative(parsed.lastSyncedAtMs))
    || !["online", "offline", "degraded"].some((status) => status === parsed.networkStatus)
    || !["memory", "local-storage", "indexeddb-mirror"].some((backend) => backend === parsed.storageBackend)
    || !object(parsed.records) || !Object.entries(parsed.records).every(([key, value]) => record(value) && key === `${value.surface}::${value.entityId}`)
    || !Array.isArray(parsed.queue) || !parsed.queue.every(operation)
    || !Array.isArray(parsed.conflicts) || !parsed.conflicts.every(conflict)) throw new OfflineSyncLegacyExportError("format");
  return raw;
}

function readIndexedDbSnapshot(key: string): Promise<unknown> {
  const factory: IDBFactory | undefined = globalThis.indexedDB;
  if (!factory || typeof factory.databases !== "function") return Promise.reject(new OfflineSyncLegacyExportError("unavailable"));
  return new Promise((resolve, reject) => {
    let settled = false;
    let database: IDBDatabase | undefined;
    const finish = (value: unknown, failed = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      database?.close();
      if (failed) reject(new OfflineSyncLegacyExportError("unavailable"));
      else resolve(value);
    };
    const timer = setTimeout(() => finish(null, true), 5_000);
    // 없는 DB는 만들지 않는다. 확인 뒤 삭제된 경우에도 upgrade transaction을 중단한다.
    void Promise.resolve().then(() => factory.databases()).then((entries) => {
      if (settled) return;
      if (!entries.some((entry) => entry.name === DATABASE_NAME)) { finish(null); return; }
      const request = factory.open(DATABASE_NAME);
      request.onupgradeneeded = () => { request.transaction?.abort(); finish(null, true); };
      request.onblocked = () => finish(null, true);
      request.onerror = () => finish(null, true);
      request.onsuccess = () => {
        database = request.result;
        if (settled) { database.close(); return; }
        try {
          const transaction = database.transaction("snapshots", "readonly");
          const read = transaction.objectStore("snapshots").get(key);
          let value: unknown = null;
          read.onsuccess = () => { value = read.result ?? null; };
          transaction.oncomplete = () => finish(value);
          transaction.onabort = () => finish(null, true);
          transaction.onerror = () => finish(null, true);
        } catch { finish(null, true); }
      };
    }).catch(() => finish(null, true));
  });
}

/** 명시적인 사용자 내보내기에서만 호출한다. 자동 탐색·이관·쓰기·삭제를 수행하지 않는다. */
export async function readOfflineSyncLegacySnapshot(projectId: string, source: OfflineSyncLegacySource): Promise<string | null> {
  if (!projectId.trim()) throw new OfflineSyncLegacyExportError("scope");
  const key = `toonstudio:local-first-sync:v1:project:${projectId}`;
  let raw: unknown;
  try {
    raw = source === "local-storage" ? window.localStorage.getItem(key) : await readIndexedDbSnapshot(key);
  } catch { throw new OfflineSyncLegacyExportError("unavailable"); }
  return raw === null ? null : validateOfflineSyncLegacySnapshot(raw, projectId);
}
