/**
 * VRM 텍스처 페인트 런타임의 오류·예산·히스토리 스택·스냅샷 순수 로직.
 *
 * `studio-vrm-texture-paint-runtime.ts`에서 상태 머신과 무관한 순수 계산·불변 스냅샷 조립·
 * 히스토리 체크포인트/제거 규칙을 분리해 런타임 파일 크기를 줄이고 단위 검증을 쉽게 유지한다.
 */
import type * as THREE from "three";

import {
  STUDIO_VRM_TEXTURE_MAX_TEXELS,
  isStudioVrmTextureSize,
  type StudioVrmTextureRect,
  type StudioVrmTextureSize,
} from "./studio-vrm-texture-uv";

import type { StudioVrmPaintMaterialViewSnapshot } from "./studio-vrm-paint-material-view";
import type { StudioVrmTexturePaintChannel } from "./studio-vrm-texture-paint-channel";
import type { StudioVrmTextureUndoEntry } from "./studio-vrm-texture-undo";

export const RGBA_CHANNELS = 4;
export const DEFAULT_TARGET_RGBA_BYTES = STUDIO_VRM_TEXTURE_MAX_TEXELS * RGBA_CHANNELS;

export const STUDIO_VRM_TEXTURE_PAINT_TARGET_RESIDENT_RGBA_COPIES = 4;
export const STUDIO_VRM_TEXTURE_PAINT_STANDARD_GEOMETRY_MAX_TRIANGLES = 100_000;
export const DEFAULT_HISTORY_BYTES = 32 * 1024 * 1024;
export const DEFAULT_TARGET_RESIDENT_BYTES =
  DEFAULT_TARGET_RGBA_BYTES * STUDIO_VRM_TEXTURE_PAINT_TARGET_RESIDENT_RGBA_COPIES;

export const DEFAULT_STUDIO_VRM_TEXTURE_PAINT_RUNTIME_LIMITS = Object.freeze({
  maxTargetResidentBytes: DEFAULT_TARGET_RESIDENT_BYTES,
  maxAggregateResidentBytes: DEFAULT_TARGET_RESIDENT_BYTES * 2 + DEFAULT_HISTORY_BYTES,
  maxGeometryIndexTriangles: STUDIO_VRM_TEXTURE_PAINT_STANDARD_GEOMETRY_MAX_TRIANGLES,
  /** @deprecated Logical RGBA compatibility alias. Prefer maxTargetResidentBytes. */
  maxTargetRgbaBytes: DEFAULT_TARGET_RGBA_BYTES,
  /** @deprecated Logical RGBA compatibility alias. Prefer maxAggregateResidentBytes. */
  maxAggregateRgbaBytes: DEFAULT_TARGET_RGBA_BYTES * 2,
  maxConcurrentReads: 2,
  maxHistoryEntries: 32,
  maxHistoryBytes: DEFAULT_HISTORY_BYTES,
  maxStrokeSamples: 2048,
  undoTileSize: 64,
});

export type StudioVrmTexturePaintRuntimeStatus =
  | "idle"
  | "invalid"
  | "loading"
  | "ready"
  | "painting"
  | "disposed";

export type StudioVrmTexturePaintRuntimeErrorCode =
  | "aggregate-rgba-budget"
  | "binding-conflict"
  | "binding-missing"
  | "canvas-unavailable"
  | "channel-unsupported"
  | "disposed"
  | "fill-memory-budget"
  | "fill-worker-failed"
  | "fill-worker-unavailable"
  | "history-budget"
  | "hit-outside-scene"
  | "invalid-dimensions"
  | "invalid-pointer"
  | "invalid-style"
  | "map-missing"
  | "material-missing"
  | "mesh-missing"
  | "pointer-active"
  | "pointer-mismatch"
  | "read-concurrency-budget"
  | "source-changed"
  | "source-compressed"
  | "source-read-aborted"
  | "source-read-active"
  | "source-unreadable"
  | "stale-completion"
  | "stroke-sample-budget"
  | "surface-operation-invalid"
  | "surface-session-invalid"
  | "target-invalid"
  | "target-mismatch"
  | "target-rgba-budget"
  | "uv-missing";

/**
 * D4 구조화 방출 (R14, 2026-10-23): 런타임 오류는 {code, params}만 방출한다.
 * 표시 문구는 표시 지점(status-i18n/studio-producer-error-i18n-vrm-paint의
 * vrmPaintRuntime 구간 리졸버)에서만 해석한다.
 */
export interface StudioVrmTexturePaintRuntimeError {
  readonly code: StudioVrmTexturePaintRuntimeErrorCode;
  readonly params?: Readonly<Record<string, string>>;
}

export type StudioVrmTexturePaintRuntimeGuidanceCode = "geometry-triangle-budget";

export interface StudioVrmTexturePaintRuntimeGuidance {
  readonly code: StudioVrmTexturePaintRuntimeGuidanceCode;
  readonly params: Readonly<Record<string, string>>;
  readonly triangleCount: number;
  readonly maxTriangles: number;
}

export type StudioVrmTexturePaintRuntimeResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: StudioVrmTexturePaintRuntimeError }>;

export interface StudioVrmTexturePaintTargetSnapshot {
  readonly channel: StudioVrmTexturePaintChannel;
  readonly id: string;
  readonly sourceTextureUuid: string;
  readonly paintedTextureUuid: string;
  readonly sourceName: string;
  readonly width: number;
  readonly height: number;
  readonly rgbaBytes: number;
  readonly residentBytes: number;
  readonly bindingCount: number;
  readonly valid: boolean;
  readonly invalidReason: "canvas-unavailable" | null;
}

export interface StudioVrmTexturePaintHistorySnapshot {
  readonly undoCount: number;
  readonly redoCount: number;
  readonly retainedBytes: number;
  readonly maxEntries: number;
  readonly maxBytes: number;
}

export interface StudioVrmTexturePaintRuntimeSnapshot {
  readonly channel: StudioVrmTexturePaintChannel;
  readonly supportedChannels: readonly StudioVrmTexturePaintChannel[];
  readonly materials: readonly StudioVrmPaintMaterialViewSnapshot[];
  readonly selectedMaterialId: string | null;
  readonly soloMaterialId: string | null;
  readonly status: StudioVrmTexturePaintRuntimeStatus;
  readonly activeOperation:
    | "fill"
    | "sample"
    | "stroke"
    | "stroke-read"
    | "surface-brush"
    | "surface-read"
    | null;
  readonly activePointerId: number | null;
  readonly activeTargetId: string | null;
  readonly activeTarget: Readonly<Pick<
    StudioVrmTexturePaintTargetSnapshot,
    "bindingCount" | "height" | "id" | "invalidReason" | "sourceName" | "valid" | "width"
  >> | null;
  /** @deprecated Logical RGBA sum retained for telemetry compatibility. */
  readonly aggregateRgbaBytes: number;
  readonly aggregateTargetResidentBytes: number;
  /** Prepared target resident bytes plus currently retained history. */
  readonly residentBytes: number;
  readonly maxResidentBytes: number;
  readonly targets: readonly StudioVrmTexturePaintTargetSnapshot[];
  readonly history: StudioVrmTexturePaintHistorySnapshot;
  readonly error: StudioVrmTexturePaintRuntimeError | null;
  readonly guidance: StudioVrmTexturePaintRuntimeGuidance | null;
}

export class StudioVrmTexturePaintFault extends Error {
  constructor(readonly code: StudioVrmTexturePaintRuntimeErrorCode) {
    super(code);
    this.name = "StudioVrmTexturePaintFault";
  }
}

/** D4: 코드 집합만 유지한다 — 문구는 vrmPaintRuntime 리졸버 구간이 소유한다. */
const ERROR_CODES: Readonly<ReadonlySet<StudioVrmTexturePaintRuntimeErrorCode>> =
  Object.freeze(new Set<StudioVrmTexturePaintRuntimeErrorCode>([
    "aggregate-rgba-budget",
    "binding-conflict",
    "binding-missing",
    "canvas-unavailable",
    "channel-unsupported",
    "disposed",
    "fill-memory-budget",
    "fill-worker-failed",
    "fill-worker-unavailable",
    "history-budget",
    "hit-outside-scene",
    "invalid-dimensions",
    "invalid-pointer",
    "invalid-style",
    "map-missing",
    "material-missing",
    "mesh-missing",
    "pointer-active",
    "pointer-mismatch",
    "read-concurrency-budget",
    "source-changed",
    "source-compressed",
    "source-read-aborted",
    "source-read-active",
    "source-unreadable",
    "stale-completion",
    "stroke-sample-budget",
    "surface-operation-invalid",
    "surface-session-invalid",
    "target-invalid",
    "target-mismatch",
    "target-rgba-budget",
    "uv-missing",
  ]));

export function frozenError(
  code: StudioVrmTexturePaintRuntimeErrorCode,
): StudioVrmTexturePaintRuntimeError {
  if (!ERROR_CODES.has(code)) throw new StudioVrmTexturePaintFault(code);
  return Object.freeze({ code });
}

export function frozenGeometryBudgetGuidance(
  triangleCount: number,
  maxTriangles: number,
): StudioVrmTexturePaintRuntimeGuidance {
  return Object.freeze({
    code: "geometry-triangle-budget",
    params: Object.freeze({
      triangleCount: String(triangleCount),
      maxTriangles: String(maxTriangles),
    }),
    triangleCount,
    maxTriangles,
  });
}

export function success<T>(value: T): StudioVrmTexturePaintRuntimeResult<T> {
  return Object.freeze({ ok: true as const, value });
}

export function failure<T>(
  code: StudioVrmTexturePaintRuntimeErrorCode,
): StudioVrmTexturePaintRuntimeResult<T> {
  return Object.freeze({ ok: false as const, error: frozenError(code) });
}

/**
 * Canonical chart identity used at the package provider boundary. Type tags
 * prevent a numeric provider id (`1`) from colliding with a textual id
 * (`"1"`); non-finite and empty identities are rejected.
 */
export function canonicalizeStudioVrmSurfaceIslandId(value: unknown): string | null {
  if (typeof value === "string") return value.length > 0 ? `string:${value}` : null;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `number:${Object.is(value, -0) ? "-0" : String(value)}`;
}

export function boundedInteger(value: unknown, fallback: number, minimum: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum
    ? Math.floor(value)
    : fallback;
}

export function boundedByteBudget(value: unknown, fallback: number): number {
  return Math.min(
    Number.MAX_SAFE_INTEGER,
    boundedInteger(value, fallback, 1),
  );
}

export function saturatedByteSum(...values: readonly number[]): number {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < 0) return Number.MAX_SAFE_INTEGER;
    if (total > Number.MAX_SAFE_INTEGER - value) return Number.MAX_SAFE_INTEGER;
    total += value;
  }
  return total;
}

export function logicalRgbaToResidentBytes(rgbaBytes: number): number {
  if (!Number.isSafeInteger(rgbaBytes) || rgbaBytes < 0) return Number.MAX_SAFE_INTEGER;
  if (
    rgbaBytes
    > Math.floor(
      Number.MAX_SAFE_INTEGER / STUDIO_VRM_TEXTURE_PAINT_TARGET_RESIDENT_RGBA_COPIES,
    )
  ) {
    return Number.MAX_SAFE_INTEGER;
  }
  return rgbaBytes * STUDIO_VRM_TEXTURE_PAINT_TARGET_RESIDENT_RGBA_COPIES;
}

/**
 * 보수적으로 유지되는 네 개의 RGBA 사본(원본, ImageData, Canvas, GPU)을 계산한다.
 * 실제 버퍼를 만들지 않으므로 2K/4K 사전 입장 검사에도 안전하게 사용할 수 있다.
 */
export function estimateStudioVrmTexturePaintTargetResidentBytes(
  size: Readonly<{ width: number; height: number }>,
): number | null {
  if (!isStudioVrmTextureSize(size)) return null;
  return logicalRgbaToResidentBytes(size.width * size.height * RGBA_CHANNELS);
}

export interface HistoryTargetRef {
  readonly valid: boolean;
}

export interface HistoryRecordBase<TTarget extends HistoryTargetRef> {
  readonly target: TTarget;
  readonly bytes: number;
}

export interface StrokeHistoryRecordBase<TTarget extends HistoryTargetRef>
  extends HistoryRecordBase<TTarget> {
  readonly kind: "stroke";
  readonly entry: StudioVrmTextureUndoEntry;
}

export interface FillHistoryRecordBase<TTarget extends HistoryTargetRef>
  extends HistoryRecordBase<TTarget> {
  readonly kind: "fill";
  /** LSB-first mask local to `rect`, not the full atlas. */
  readonly bitMask: Uint8Array;
  /** RGB before values in local-mask scan order. Alpha is intentionally preserved. */
  readonly beforeRgb: Uint8Array;
  readonly fillRgb: Readonly<{ readonly r: number; readonly g: number; readonly b: number }>;
  readonly rect: StudioVrmTextureRect;
}

export interface HistoryStackState<TRecord extends HistoryRecordBase<HistoryTargetRef>> {
  past: TRecord[];
  future: TRecord[];
  bytes: number;
}

export interface HistoryCheckpointState<TRecord extends HistoryRecordBase<HistoryTargetRef>> {
  readonly past: readonly TRecord[];
  readonly future: readonly TRecord[];
}

export function clearFutureHistoryStack<TRecord extends HistoryRecordBase<HistoryTargetRef>>(
  state: HistoryStackState<TRecord>,
): void {
  for (const record of state.future) state.bytes -= record.bytes;
  state.future = [];
}

export function captureHistoryCheckpointStack<TRecord extends HistoryRecordBase<HistoryTargetRef>>(
  state: HistoryStackState<TRecord>,
): HistoryCheckpointState<TRecord> {
  return {
    past: state.past.slice(),
    future: state.future.slice(),
  };
}

export function restoreHistoryCheckpointStack<TRecord extends HistoryRecordBase<HistoryTargetRef>>(
  state: HistoryStackState<TRecord>,
  checkpoint: HistoryCheckpointState<TRecord>,
): void {
  // A failed canvas upload can invalidate one target. Restore every still-valid record while
  // deliberately omitting records that can no longer be replayed safely.
  state.past = checkpoint.past.filter((record) => record.target.valid);
  state.future = checkpoint.future.filter((record) => record.target.valid);
  state.bytes = 0;
  for (const record of state.past) state.bytes += record.bytes;
  for (const record of state.future) state.bytes += record.bytes;
}

export function admitHistoryPeakStack<TRecord extends HistoryRecordBase<HistoryTargetRef>>(
  state: HistoryStackState<TRecord>,
  requiredPeakBytes: number,
  maxHistoryBytes: number,
): boolean {
  if (
    !Number.isSafeInteger(requiredPeakBytes)
    || requiredPeakBytes < 0
    || requiredPeakBytes > maxHistoryBytes
  ) {
    return false;
  }
  const retainedHistoryLimit = maxHistoryBytes - requiredPeakBytes;
  while (state.bytes > retainedHistoryLimit) {
    // 새 획이 완료되면 redo branch는 어차피 무효화된다. 가장 가까운 redo를 최대한
    // 보존하도록 먼 redo부터, 그 다음 가장 오래된 undo부터 필요한 만큼만 제거한다.
    const record = state.future.shift() ?? state.past.shift();
    if (!record) break;
    state.bytes -= record.bytes;
  }
  state.bytes = Math.max(0, state.bytes);
  return state.bytes <= retainedHistoryLimit;
}

export function evictHistoryStack<TRecord extends HistoryRecordBase<HistoryTargetRef>>(
  state: HistoryStackState<TRecord>,
  maxHistoryEntries: number,
  maxHistoryBytes: number,
): void {
  while (state.past.length + state.future.length > maxHistoryEntries) {
    const evicted = state.past.shift() ?? state.future.shift();
    if (!evicted) break;
    state.bytes -= evicted.bytes;
  }
  while (state.bytes > maxHistoryBytes) {
    const evicted = state.past.shift() ?? state.future.shift();
    if (!evicted) break;
    state.bytes -= evicted.bytes;
  }
  state.bytes = Math.max(0, state.bytes);
}

export function removeTargetHistoryStack<
  TTarget extends HistoryTargetRef,
  TRecord extends HistoryRecordBase<TTarget>,
>(state: HistoryStackState<TRecord>, target: TTarget): void {
  state.past = state.past.filter((record) => record.target !== target);
  state.future = state.future.filter((record) => record.target !== target);
  state.bytes = 0;
  for (const record of state.past) state.bytes += record.bytes;
  for (const record of state.future) state.bytes += record.bytes;
}

export interface SnapshotTargetLike {
  readonly channel: StudioVrmTexturePaintChannel;
  readonly id: string;
  readonly originalTexture: Pick<THREE.Texture, "uuid" | "name">;
  readonly paintedTexture: Pick<THREE.Texture, "uuid">;
  readonly size: StudioVrmTextureSize;
  readonly rgbaBytes: number;
  readonly residentBytes: number;
  readonly bindings: ReadonlyMap<unknown, unknown>;
  readonly valid: boolean;
  readonly invalidReason: "canvas-unavailable" | null;
}

export interface BuildTexturePaintSnapshotInput {
  readonly selectedChannel: StudioVrmTexturePaintChannel;
  readonly supportedPaintChannels: readonly StudioVrmTexturePaintChannel[];
  readonly materials: readonly StudioVrmPaintMaterialViewSnapshot[];
  readonly selectedMaterialId: string | null;
  readonly soloMaterialId: string | null;
  readonly disposed: boolean;
  readonly hasSampling: boolean;
  readonly hasFilling: boolean;
  readonly pendingPointerId: number | null;
  readonly activePointerId: number | null;
  readonly surfaceSessionState: "none" | "reading" | "active";
  readonly selectedTarget: SnapshotTargetLike | null;
  readonly targets: readonly SnapshotTargetLike[];
  readonly aggregateRgbaBytes: number;
  readonly aggregateTargetResidentBytes: number;
  readonly presentationBytes: number;
  readonly maxAggregateResidentBytes: number;
  readonly historyPastCount: number;
  readonly historyFutureCount: number;
  readonly historyBytes: number;
  readonly maxHistoryEntries: number;
  readonly maxHistoryBytes: number;
  readonly lastError: StudioVrmTexturePaintRuntimeError | null;
  readonly lastGuidance: StudioVrmTexturePaintRuntimeGuidance | null;
}

export function buildTexturePaintRuntimeSnapshot(
  input: BuildTexturePaintSnapshotInput,
): StudioVrmTexturePaintRuntimeSnapshot {
  const targetSnapshots = input.targets.map((target) => Object.freeze({
    channel: target.channel,
    id: target.id,
    sourceTextureUuid: target.originalTexture.uuid,
    paintedTextureUuid: target.paintedTexture.uuid,
    sourceName: target.originalTexture.name,
    width: target.size.width,
    height: target.size.height,
    rgbaBytes: target.rgbaBytes,
    residentBytes: target.residentBytes,
    bindingCount: target.bindings.size,
    valid: target.valid,
    invalidReason: target.invalidReason,
  }));
  const hasPending = input.pendingPointerId !== null;
  const hasActive = input.activePointerId !== null;
  const status: StudioVrmTexturePaintRuntimeStatus = input.disposed
    ? "disposed"
    : input.hasSampling || input.hasFilling || hasPending || input.surfaceSessionState === "reading"
      ? "loading"
      : hasActive || input.surfaceSessionState === "active"
        ? "painting"
        : input.selectedTarget && !input.selectedTarget.valid
          ? "invalid"
          : input.selectedTarget
            ? "ready"
            : "idle";
  const activeTarget = input.selectedTarget
    ? Object.freeze({
        id: input.selectedTarget.id,
        sourceName: input.selectedTarget.originalTexture.name,
        width: input.selectedTarget.size.width,
        height: input.selectedTarget.size.height,
        bindingCount: input.selectedTarget.bindings.size,
        valid: input.selectedTarget.valid,
        invalidReason: input.selectedTarget.invalidReason,
      })
    : null;
  const activeOperation = input.hasSampling
    ? "sample"
    : input.hasFilling
      ? "fill"
      : hasPending
        ? "stroke-read"
        : hasActive
          ? "stroke"
          : input.surfaceSessionState === "active"
            ? "surface-brush"
            : input.surfaceSessionState === "reading"
              ? "surface-read"
              : null;
  return Object.freeze({
    channel: input.selectedChannel,
    supportedChannels:
      input.materials.find((material) => material.id === input.selectedMaterialId)?.supportedChannels
      ?? input.supportedPaintChannels,
    materials: input.materials,
    selectedMaterialId: input.selectedMaterialId,
    soloMaterialId: input.soloMaterialId,
    status,
    activeOperation,
    activePointerId: input.pendingPointerId ?? input.activePointerId ?? null,
    activeTargetId: input.selectedTarget?.id ?? null,
    activeTarget,
    aggregateRgbaBytes: input.aggregateRgbaBytes,
    aggregateTargetResidentBytes: input.aggregateTargetResidentBytes,
    residentBytes: saturatedByteSum(
      input.presentationBytes,
      input.aggregateTargetResidentBytes,
      input.historyBytes,
    ),
    maxResidentBytes: input.maxAggregateResidentBytes,
    targets: Object.freeze(targetSnapshots),
    history: Object.freeze({
      undoCount: input.historyPastCount,
      redoCount: input.historyFutureCount,
      retainedBytes: input.historyBytes,
      maxEntries: input.maxHistoryEntries,
      maxBytes: input.maxHistoryBytes,
    }),
    error: input.lastError,
    guidance: input.lastGuidance,
  });
}
