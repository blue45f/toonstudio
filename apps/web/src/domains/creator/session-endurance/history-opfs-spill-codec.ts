/**
 * OPFS 히스토리 스필 저장소의 순수 타입·상수·델타 패치·CRC-32 코덱 모듈.
 */

import { calculateStudioCrc32 } from "../studio-crc32";
import {
  isStudioOpfsCodec,
  type StudioOpfsCodec,
  type StudioOpfsCompressionScope,
} from "../studio-opfs-compression";
import { StudioOpfsError, type StudioOpfsFileSystem } from "../studio-opfs-filesystem";

export const HISTORY_SPILL_SCHEMA_VERSION = 1 as const;
export const HISTORY_SPILL_DEFAULT_MAX_RAM_BYTES = 16 * 1024 * 1024;
export const HISTORY_SPILL_DEFAULT_BATCH_SIZE = 32;
export const HISTORY_SPILL_DEFAULT_MIN_HOT_STEPS = 8;
export const HISTORY_SPILL_DEFAULT_MAX_HYDRATED_SEGMENTS = 2;
export const HISTORY_SPILL_RAM_WARNING_RATIO = 0.78;
export const HISTORY_SPILL_RAM_CRITICAL_RATIO = 0.94;

export type HistoryJsonPrimitive = string | number | boolean | null;
export type HistoryJsonValue =
  | HistoryJsonPrimitive
  | readonly HistoryJsonValue[]
  | { readonly [key: string]: HistoryJsonValue };

export interface HistorySpillStateRecord {
  readonly [key: string]: HistoryJsonValue;
}

export interface HistoryStatePatch {
  readonly set: Readonly<Record<string, HistoryJsonValue>>;
  readonly deleted: readonly string[];
}

export interface HistoryDeltaEntry {
  readonly sequence: number;
  readonly label: string;
  readonly cutId: string | null;
  readonly timestampMs: number;
  readonly forward: HistoryStatePatch;
  readonly inverse: HistoryStatePatch;
  readonly estimatedBytes: number;
}

export interface HistorySpillSegmentMeta {
  readonly segmentId: number;
  readonly path: string;
  readonly fromSequence: number;
  readonly toSequence: number;
  readonly stepCount: number;
  readonly codec: StudioOpfsCodec;
  readonly originalBytes: number;
  readonly storedBytes: number;
  readonly crc32: number;
}

export interface HistoryCheckpointMetadata {
  readonly schemaVersion: typeof HISTORY_SPILL_SCHEMA_VERSION;
  readonly sessionId: string;
  readonly cursorSequence: number;
  readonly latestSequence: number;
  readonly anchorSequence: number;
  readonly nextSegmentId: number;
  readonly anchorPath: string;
  readonly anchorCodec: StudioOpfsCodec;
  readonly anchorOriginalBytes: number;
  readonly anchorStoredBytes: number;
  readonly anchorCrc32: number;
  readonly hotTailPath: string;
  readonly hotTailCrc32: number;
  readonly hotTailStepCount: number;
  readonly segments: readonly HistorySpillSegmentMeta[];
  readonly savedAtMs: number;
}

export interface HistoryStepPushInput {
  readonly label: string;
  readonly nextState: HistorySpillStateRecord;
  readonly cutId?: string | null;
  readonly timestampMs?: number;
}

export interface HistoryStepSummary {
  readonly sequence: number;
  readonly label: string;
  readonly spilledInThisPush: number;
  readonly deltaBytes: number;
  readonly ramBytes: number;
}

export interface HistoryNavigationResult {
  readonly moved: boolean;
  readonly sequence: number;
  readonly label: string | null;
  readonly hydratedFromOpfs: boolean;
  readonly state: HistorySpillStateRecord;
}

export interface HistoryRestoreResult {
  readonly restored: boolean;
  readonly reason: "restored" | "no-checkpoint";
  readonly restoredSteps: number;
  readonly cursorSequence: number;
  readonly spilledSteps: number;
  readonly state: HistorySpillStateRecord;
}

export type HistorySpillHealthStatus = "healthy" | "warning" | "critical";
export type HistorySpillDurability = "durable" | "memory-only";

export interface HistoryOpfsSpillSnapshot {
  readonly sessionId: string;
  readonly durability: HistorySpillDurability;
  readonly durabilityReason: string;
  readonly ramBytes: number;
  readonly hotRamBytes: number;
  readonly hydratedCacheBytes: number;
  readonly ramBudgetBytes: number;
  readonly ramUtilizationRatio: number;
  readonly spilledBytes: number;
  readonly spilledOriginalBytes: number;
  readonly compressionSavingRatio: number;
  readonly hotStepCount: number;
  readonly spilledStepCount: number;
  readonly segmentCount: number;
  readonly totalStepCount: number;
  readonly cursorSequence: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly spillCount: number;
  readonly hydrateCount: number;
  readonly lastCheckpointAtMs: number | null;
  readonly status: HistorySpillHealthStatus;
}

export interface HistoryOpfsSpillStoreOptions {
  readonly sessionId?: string;
  readonly initialState?: HistorySpillStateRecord;
  readonly fs?: StudioOpfsFileSystem;
  readonly durability?: HistorySpillDurability;
  readonly durabilityReason?: string;
  readonly maxRamBytes?: number;
  readonly spillBatchSize?: number;
  readonly minHotSteps?: number;
  readonly maxHydratedColdSegments?: number;
  readonly autoCheckpoint?: boolean;
  readonly compressionScope?: StudioOpfsCompressionScope;
  readonly now?: () => number;
}

export interface HistoryOpfsSpillStore {
  pushStep(input: HistoryStepPushInput): Promise<HistoryStepSummary>;
  undo(): Promise<HistoryNavigationResult>;
  redo(): Promise<HistoryNavigationResult>;
  flushCheckpoint(): Promise<HistoryCheckpointMetadata>;
  restoreFromCheckpoint(): Promise<HistoryRestoreResult>;
  getCurrentState(): HistorySpillStateRecord;
  getSnapshot(): HistoryOpfsSpillSnapshot;
  subscribe(listener: () => void): () => void;
  clear(): Promise<void>;
}

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });

export function encodeHistoryJsonBytes(value: unknown): Uint8Array {
  return TEXT_ENCODER.encode(JSON.stringify(value));
}

export function decodeHistoryJsonBytes(bytes: Uint8Array, errorMessage: string): unknown {
  try {
    return JSON.parse(TEXT_DECODER.decode(bytes)) as unknown;
  } catch (cause) {
    throw new StudioOpfsError("CORRUPT_ENTRY", errorMessage, cause);
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidJsonValue(value: unknown): value is HistoryJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isValidJsonValue);
  if (isPlainRecord(value)) return Object.values(value).every(isValidJsonValue);
  return false;
}

export function cloneHistoryJsonValue(value: HistoryJsonValue): HistoryJsonValue {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => cloneHistoryJsonValue(item));
  const out: Record<string, HistoryJsonValue> = {};
  for (const [key, item] of Object.entries(value as Record<string, HistoryJsonValue>)) {
    out[key] = cloneHistoryJsonValue(item);
  }
  return out;
}

export function cloneHistoryStateRecord(state: HistorySpillStateRecord): HistorySpillStateRecord {
  const out: Record<string, HistoryJsonValue> = {};
  for (const [key, value] of Object.entries(state)) {
    out[key] = cloneHistoryJsonValue(value);
  }
  return out;
}

function equalJsonValue(a: HistoryJsonValue | undefined, b: HistoryJsonValue | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a === null || b === null) return false;
  if (typeof a !== typeof b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!equalJsonValue(a[i], b[i])) return false;
    }
    return true;
  }
  const objA = a as Record<string, HistoryJsonValue>;
  const objB = b as Record<string, HistoryJsonValue>;
  const keysA = Object.keys(objA);
  if (keysA.length !== Object.keys(objB).length) return false;
  return keysA.every((key) => key in objB && equalJsonValue(objA[key], objB[key]));
}

export function computeHistoryStateDelta(
  previous: HistorySpillStateRecord,
  next: HistorySpillStateRecord,
): { readonly forward: HistoryStatePatch; readonly inverse: HistoryStatePatch } {
  const forwardSet: Record<string, HistoryJsonValue> = {};
  const forwardDeleted: string[] = [];
  const inverseSet: Record<string, HistoryJsonValue> = {};
  const inverseDeleted: string[] = [];

  for (const [key, nextValue] of Object.entries(next)) {
    if (!(key in previous)) {
      forwardSet[key] = cloneHistoryJsonValue(nextValue);
      inverseDeleted.push(key);
    } else if (!equalJsonValue(previous[key], nextValue)) {
      forwardSet[key] = cloneHistoryJsonValue(nextValue);
      inverseSet[key] = cloneHistoryJsonValue(previous[key]!);
    }
  }

  for (const [key, prevValue] of Object.entries(previous)) {
    if (!(key in next)) {
      forwardDeleted.push(key);
      inverseSet[key] = cloneHistoryJsonValue(prevValue);
    }
  }

  return {
    forward: Object.freeze({ set: Object.freeze(forwardSet), deleted: Object.freeze(forwardDeleted) }),
    inverse: Object.freeze({ set: Object.freeze(inverseSet), deleted: Object.freeze(inverseDeleted) }),
  };
}

export function applyHistoryStatePatch(
  base: HistorySpillStateRecord,
  patch: HistoryStatePatch,
): HistorySpillStateRecord {
  const next: Record<string, HistoryJsonValue> = { ...base };
  for (const key of patch.deleted) delete next[key];
  for (const [key, value] of Object.entries(patch.set)) {
    next[key] = cloneHistoryJsonValue(value);
  }
  return next;
}

export function buildSafeHistorySessionSlug(sessionId: string): string {
  const normalized = sessionId.trim() || "default";
  const prefix = normalized
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^[^a-z0-9]+/u, "")
    .slice(0, 20) || "s";
  const hash = calculateStudioCrc32(TEXT_ENCODER.encode(normalized))
    .toString(16)
    .padStart(8, "0");
  return `${prefix}-${hash}`;
}

function parsePatch(raw: unknown): HistoryStatePatch {
  if (!isPlainRecord(raw) || !isPlainRecord(raw.set) || !Array.isArray(raw.deleted)) {
    throw new StudioOpfsError("CORRUPT_ENTRY", "히스토리 델타 패치 형식이 손상됐습니다.");
  }
  const set: Record<string, HistoryJsonValue> = {};
  for (const [key, value] of Object.entries(raw.set)) {
    if (!isValidJsonValue(value)) {
      throw new StudioOpfsError("CORRUPT_ENTRY", "히스토리 패치 값에 허용되지 않은 데이터가 있습니다.");
    }
    set[key] = value;
  }
  const deleted: string[] = [];
  for (const item of raw.deleted) {
    if (typeof item !== "string") {
      throw new StudioOpfsError("CORRUPT_ENTRY", "히스토리 삭제 키 목록이 손상됐습니다.");
    }
    deleted.push(item);
  }
  return Object.freeze({ set: Object.freeze(set), deleted: Object.freeze(deleted) });
}

export function parseHistoryDeltaEntries(raw: unknown): HistoryDeltaEntry[] {
  if (!Array.isArray(raw)) {
    throw new StudioOpfsError("CORRUPT_ENTRY", "히스토리 델타 배열이 손상됐습니다.");
  }
  return raw.map((item) => {
    if (
      !isPlainRecord(item)
      || typeof item.sequence !== "number"
      || !Number.isSafeInteger(item.sequence)
      || item.sequence < 1
      || typeof item.label !== "string"
      || (item.cutId !== null && typeof item.cutId !== "string")
      || typeof item.timestampMs !== "number"
      || typeof item.estimatedBytes !== "number"
    ) {
      throw new StudioOpfsError("CORRUPT_ENTRY", "히스토리 델타 항목 형식이 올바르지 않습니다.");
    }
    return Object.freeze({
      sequence: item.sequence,
      label: item.label,
      cutId: item.cutId,
      timestampMs: item.timestampMs,
      forward: parsePatch(item.forward),
      inverse: parsePatch(item.inverse),
      estimatedBytes: Math.max(0, Math.round(item.estimatedBytes)),
    });
  });
}

export function parseHistoryStateRecord(raw: unknown): HistorySpillStateRecord {
  if (!isPlainRecord(raw)) {
    throw new StudioOpfsError("CORRUPT_ENTRY", "히스토리 앵커 스냅샷이 객체가 아닙니다.");
  }
  const out: Record<string, HistoryJsonValue> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!isValidJsonValue(value)) {
      throw new StudioOpfsError("CORRUPT_ENTRY", "히스토리 앵커 스냅샷에 손상된 필드가 있습니다.");
    }
    out[key] = value;
  }
  return out;
}

function parseSegmentMeta(raw: unknown): HistorySpillSegmentMeta {
  if (
    !isPlainRecord(raw)
    || typeof raw.segmentId !== "number"
    || typeof raw.path !== "string"
    || typeof raw.fromSequence !== "number"
    || typeof raw.toSequence !== "number"
    || typeof raw.stepCount !== "number"
    || !isStudioOpfsCodec(raw.codec)
    || typeof raw.originalBytes !== "number"
    || typeof raw.storedBytes !== "number"
    || typeof raw.crc32 !== "number"
  ) {
    throw new StudioOpfsError("CORRUPT_ENTRY", "OPFS 스필 세그먼트 메타데이터가 손상됐습니다.");
  }
  return Object.freeze({
    segmentId: raw.segmentId,
    path: raw.path,
    fromSequence: raw.fromSequence,
    toSequence: raw.toSequence,
    stepCount: raw.stepCount,
    codec: raw.codec,
    originalBytes: raw.originalBytes,
    storedBytes: raw.storedBytes,
    crc32: raw.crc32,
  });
}

export function parseHistoryCheckpointMetadata(raw: unknown): HistoryCheckpointMetadata {
  if (!isPlainRecord(raw) || !isPlainRecord(raw.payload) || typeof raw.manifestCrc32 !== "number") {
    throw new StudioOpfsError("CORRUPT_ENTRY", "체크포인트 봉투가 손상됐습니다.");
  }
  const payload = raw.payload;
  const expectedCrc = calculateStudioCrc32(encodeHistoryJsonBytes(payload));
  if (expectedCrc !== raw.manifestCrc32) {
    throw new StudioOpfsError("INTEGRITY_FAILED", "체크포인트 메타데이터 무결성(CRC-32) 검증에 실패했습니다.");
  }
  if (
    payload.schemaVersion !== HISTORY_SPILL_SCHEMA_VERSION
    || typeof payload.sessionId !== "string"
    || typeof payload.cursorSequence !== "number"
    || typeof payload.latestSequence !== "number"
    || typeof payload.anchorSequence !== "number"
    || typeof payload.nextSegmentId !== "number"
    || typeof payload.anchorPath !== "string"
    || !isStudioOpfsCodec(payload.anchorCodec)
    || typeof payload.anchorOriginalBytes !== "number"
    || typeof payload.anchorStoredBytes !== "number"
    || typeof payload.anchorCrc32 !== "number"
    || typeof payload.hotTailPath !== "string"
    || typeof payload.hotTailCrc32 !== "number"
    || typeof payload.hotTailStepCount !== "number"
    || !Array.isArray(payload.segments)
    || typeof payload.savedAtMs !== "number"
  ) {
    throw new StudioOpfsError("CORRUPT_ENTRY", "체크포인트 메타데이터 스키마가 호환되지 않습니다.");
  }

  return Object.freeze({
    schemaVersion: HISTORY_SPILL_SCHEMA_VERSION,
    sessionId: payload.sessionId,
    cursorSequence: payload.cursorSequence,
    latestSequence: payload.latestSequence,
    anchorSequence: payload.anchorSequence,
    nextSegmentId: payload.nextSegmentId,
    anchorPath: payload.anchorPath,
    anchorCodec: payload.anchorCodec,
    anchorOriginalBytes: payload.anchorOriginalBytes,
    anchorStoredBytes: payload.anchorStoredBytes,
    anchorCrc32: payload.anchorCrc32,
    hotTailPath: payload.hotTailPath,
    hotTailCrc32: payload.hotTailCrc32,
    hotTailStepCount: payload.hotTailStepCount,
    segments: Object.freeze(payload.segments.map(parseSegmentMeta)),
    savedAtMs: payload.savedAtMs,
  });
}
