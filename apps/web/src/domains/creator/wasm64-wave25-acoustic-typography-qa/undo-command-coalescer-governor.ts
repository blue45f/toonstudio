/**
 * 장시간 작업 세션용 실행 취소(Undo/Redo) 미세 스크럽 병합기 및 128 MiB OPFS 콜드 스필 거버너.
 *
 * - 슬라이더 드래그(`slider-scrub`), 기즈모 조작(`gizmo-transform`), 카메라 궤도 회전(`camera-orbit`)처럼
 *   `coalesceWindowMs`(`<= 180ms`) 안에 동일 `(layerId, propertyKey)`로 쏟아지는 연속 이벤트를
 *   단일 원자적 실행 취소 단계로 병합하되, 브러시 획(`brush-stroke`)·컷 분할(`cut-split`)·도구 전환·
 *   스트로크 종료 배리어는 절대 넘어서 병합하지 않는다.
 * - 최신 `hotWindowSteps`(`64`단계)는 무손실 해상도로 유지하고, 그보다 오래된 미세 조정 구간은
 *   구조적 이정표(`cut-split` 등)를 고정한 채 로그 간격(`2^k`) 핵심 키프레임으로 솎아낸다.
 * - 상주 RAM 상한(`maxRamBytes`, 기본 `128 MiB`) 초과 시 가장 오래된 단계부터 순수 메모리 기반
 *   OPFS 콜드 스필 디스크립터(FNV-1a / SHA-256 해시, 바이트 길이, 가역 복원 슬라이스 명세)로 전환한다.
 */

export const CONTINUOUS_SCRUB_COMMAND_KINDS = Object.freeze(["slider-scrub", "gizmo-transform", "camera-orbit"] as const);
export type ContinuousScrubCommandKind = (typeof CONTINUOUS_SCRUB_COMMAND_KINDS)[number];
export const DISCRETE_BARRIER_COMMAND_KINDS = Object.freeze(["brush-stroke", "cut-split", "layer-structural"] as const);
export type DiscreteBarrierCommandKind = (typeof DISCRETE_BARRIER_COMMAND_KINDS)[number];
export const STUDIO_UNDO_COMMAND_KINDS = Object.freeze([
  "slider-scrub", "gizmo-transform", "camera-orbit", "brush-stroke", "cut-split", "layer-structural",
] as const);
export type StudioUndoCommandKind = (typeof STUDIO_UNDO_COMMAND_KINDS)[number];

export const DEFAULT_COALESCE_WINDOW_MS = 160 as const;
export const MAX_COALESCE_WINDOW_MS = 180 as const;
export const DEFAULT_HOT_WINDOW_STEPS = 64 as const;
/** 기본 실행 취소 상주 RAM 상한: 정확히 `128 MiB` (`134,217,728` bytes). */
export const DEFAULT_MAX_UNDO_RAM_BYTES = 134_217_728 as const;
export type UndoRetentionTier = "hot-lossless" | "logarithmic-milestone" | "opfs-cold-spilled";

export interface UndoableStudioCommand {
  readonly commandId: string;
  readonly kind: StudioUndoCommandKind;
  readonly toolId: string;
  readonly layerId: string;
  readonly propertyKey: string;
  readonly timestampMs: number;
  readonly beforePayload: Uint8Array | string;
  readonly afterPayload: Uint8Array | string;
  readonly explicitBarrierBefore?: boolean;
  readonly explicitStrokeEndBarrier?: boolean;
  readonly isStructuralMilestone?: boolean;
}

export interface ColdSpillRestorePlan {
  readonly chunkId: string;
  readonly virtualOpfsPath: string;
  readonly beforeSliceOffset: number;
  readonly beforeSliceLength: number;
  readonly afterSliceOffset: number;
  readonly afterSliceLength: number;
  readonly auxEntryCount: number;
  readonly expectedFnv1a32Hex: string;
  readonly expectedSha256Hex: string;
}

export interface OpfsColdSpillChunkDescriptor {
  readonly chunkId: string;
  readonly stepId: string;
  readonly virtualOpfsPath: string;
  readonly byteLength: number;
  readonly beforeByteLength: number;
  readonly afterByteLength: number;
  readonly fnv1a32Hex: string;
  readonly sha256Hex: string;
  readonly restorePlan: ColdSpillRestorePlan;
}

export interface EmittedOpfsSpillPacket {
  readonly descriptor: OpfsColdSpillChunkDescriptor;
  readonly framedChunkBytes: Uint8Array;
}

export interface PropertyStateSnapshot {
  readonly targetKey: string;
  readonly beforeBytes: Uint8Array;
  readonly afterBytes: Uint8Array;
}

export interface UndoStepSummary {
  readonly stepId: string;
  readonly kind: StudioUndoCommandKind;
  readonly toolId: string;
  readonly layerId: string;
  readonly propertyKey: string;
  readonly startedAtMs: number;
  readonly updatedAtMs: number;
  readonly coalescedEventCount: number;
  readonly representedGestureCount: number;
  readonly isPinnedMilestone: boolean;
  readonly sealedByBarrier: boolean;
  readonly retentionTier: UndoRetentionTier;
  readonly isColdSpilled: boolean;
  readonly residentRamBytes: number;
  readonly coldDescriptor: OpfsColdSpillChunkDescriptor | null;
}

export interface PushUndoCommandResult {
  readonly mergedIntoExistingStep: boolean;
  readonly activeStepId: string;
  readonly undoDepth: number;
  readonly residentRamBytes: number;
  readonly logarithmicThinnedNow: number;
  readonly emittedSpillPackets: readonly EmittedOpfsSpillPacket[];
}

export type UndoReplayOutcome =
  | {
      readonly status: "applied"; readonly stepId: string; readonly kind: StudioUndoCommandKind;
      readonly layerId: string; readonly propertyKey: string; readonly beforeBytes: Uint8Array;
      readonly afterBytes: Uint8Array; readonly compoundSnapshots: readonly PropertyStateSnapshot[];
    }
  | { readonly status: "requires-cold-restore"; readonly stepId: string; readonly coldDescriptor: OpfsColdSpillChunkDescriptor };

export interface ColdRestoreVerificationResult {
  readonly stepId: string; readonly restoredByteLength: number; readonly verifiedSha256Hex: string;
  readonly verifiedFnv1a32Hex: string; readonly residentRamBytesAfterRestore: number;
  readonly cascadedSpillPackets: readonly EmittedOpfsSpillPacket[];
}

export interface UndoGovernorOptions {
  readonly coalesceWindowMs?: number; readonly hotWindowSteps?: number;
  readonly maxRamBytes?: number; readonly virtualOpfsDirectory?: string;
}

export interface UndoGovernorSnapshot {
  readonly undoDepth: number; readonly redoDepth: number; readonly totalCommandsIngested: number;
  readonly coalescedMergeCount: number; readonly logarithmicThinMergeCount: number;
  readonly stackReductionRatio: number; readonly residentRamBytes: number; readonly maxRamBytes: number;
  readonly coldSpilledStepCount: number; readonly coldSpilledTotalBytes: number;
  readonly pinnedMilestoneCount: number; readonly hotLosslessStepCount: number;
  readonly steps: readonly UndoStepSummary[];
}

const UTF8_ENCODER = new TextEncoder();
const UTF8_DECODER = new TextDecoder();
const CHUNK_MAGIC = new Uint8Array([0x54, 0x53, 0x55, 0x35]); // "TSU5"

const SHA256_INIT = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/**
 * 결정론적 32비트 FNV-1a 해시를 8자리 16진 문자열로 계산한다.
 */
export function computeFnv1a32Hex(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i] ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * 외부 런타임 의존성이나 BigInt 리터럴 없이 순수 32비트 연산으로 표준 SHA-256 해시를 계산한다.
 */
export function computeSha256Hex(bytes: Uint8Array): string {
  const bitLengthLow = (bytes.length << 3) >>> 0;
  const bitLengthHigh = Math.floor(bytes.length / 0x20000000) >>> 0;
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes, 0);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  view.setUint32(paddedLength - 8, bitLengthHigh, false);
  view.setUint32(paddedLength - 4, bitLengthLow, false);

  const state = new Uint32Array(SHA256_INIT);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = state;
    a = a ?? 0; b = b ?? 0; c = c ?? 0; d = d ?? 0; e = e ?? 0; f = f ?? 0; g = g ?? 0; h = h ?? 0;

    for (let i = 0; i < 64; i += 1) {
      const sum1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + sum1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const sum0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (sum0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }

    const deltas = [a, b, c, d, e, f, g, h];
    for (let j = 0; j < 8; j += 1) state[j] = ((state[j] ?? 0) + (deltas[j] ?? 0)) >>> 0;
  }

  let hex = "";
  for (let i = 0; i < 8; i += 1) hex += (state[i] ?? 0).toString(16).padStart(8, "0");
  return hex;
}

export function isContinuousScrubKind(kind: StudioUndoCommandKind): kind is ContinuousScrubCommandKind {
  return kind === "slider-scrub" || kind === "gizmo-transform" || kind === "camera-orbit";
}

function toOwnedBytes(payload: Uint8Array | string): Uint8Array {
  if (typeof payload === "string") return UTF8_ENCODER.encode(payload);
  const copy = new Uint8Array(payload.byteLength);
  copy.set(payload);
  return copy;
}

function makeTargetKey(layerId: string, propertyKey: string): string {
  return `${layerId}\u0000${propertyKey}`;
}

interface InternalUndoStep {
  readonly stepId: string;
  readonly sequenceNumber: number;
  readonly kind: StudioUndoCommandKind;
  readonly toolId: string;
  readonly layerId: string;
  readonly propertyKey: string;
  readonly startedAtMs: number;
  updatedAtMs: number;
  coalescedEventCount: number;
  representedGestureCount: number;
  readonly isPinnedMilestone: boolean;
  sealedByBarrier: boolean;
  retentionTier: UndoRetentionTier;
  isColdSpilled: boolean;
  beforeBytes: Uint8Array | null;
  afterBytes: Uint8Array | null;
  compoundMap: Map<string, PropertyStateSnapshot> | null;
  residentRamBytes: number;
  coldDescriptor: OpfsColdSpillChunkDescriptor | null;
}

function computeStepResidentBytes(
  beforeBytes: Uint8Array | null,
  afterBytes: Uint8Array | null,
  compoundMap: Map<string, PropertyStateSnapshot> | null,
): number {
  if (!beforeBytes || !afterBytes) return 0;
  if (!compoundMap || compoundMap.size <= 1) return beforeBytes.byteLength + afterBytes.byteLength;
  let sum = 0;
  for (const snap of compoundMap.values()) {
    sum += snap.beforeBytes.byteLength + snap.afterBytes.byteLength;
  }
  return sum;
}

function buildColdSpillPacket(step: InternalUndoStep, virtualOpfsDirectory: string): EmittedOpfsSpillPacket {
  const beforeBytes = step.beforeBytes ?? new Uint8Array(0);
  const afterBytes = step.afterBytes ?? new Uint8Array(0);
  const auxList: Array<{ readonly keyBytes: Uint8Array; readonly snap: PropertyStateSnapshot }> = [];

  if (step.compoundMap && step.compoundMap.size > 1) {
    for (const snap of step.compoundMap.values()) {
      auxList.push({ keyBytes: UTF8_ENCODER.encode(snap.targetKey), snap });
    }
  }

  let auxByteLength = 0;
  for (const item of auxList) {
    auxByteLength += 2 + item.keyBytes.byteLength + 4 + item.snap.beforeBytes.byteLength + 4 + item.snap.afterBytes.byteLength;
  }

  const totalLength = 4 + 4 + beforeBytes.byteLength + 4 + afterBytes.byteLength + 4 + auxByteLength;
  const framed = new Uint8Array(totalLength);
  const view = new DataView(framed.buffer);

  framed.set(CHUNK_MAGIC, 0);
  view.setUint32(4, beforeBytes.byteLength, false);
  const beforeSliceOffset = 8;
  framed.set(beforeBytes, beforeSliceOffset);

  const afterLengthOffset = beforeSliceOffset + beforeBytes.byteLength;
  view.setUint32(afterLengthOffset, afterBytes.byteLength, false);
  const afterSliceOffset = afterLengthOffset + 4;
  framed.set(afterBytes, afterSliceOffset);

  let cursor = afterSliceOffset + afterBytes.byteLength;
  view.setUint32(cursor, auxList.length, false);
  cursor += 4;

  for (const item of auxList) {
    view.setUint16(cursor, item.keyBytes.byteLength, false);
    cursor += 2;
    framed.set(item.keyBytes, cursor);
    cursor += item.keyBytes.byteLength;
    view.setUint32(cursor, item.snap.beforeBytes.byteLength, false);
    cursor += 4;
    framed.set(item.snap.beforeBytes, cursor);
    cursor += item.snap.beforeBytes.byteLength;
    view.setUint32(cursor, item.snap.afterBytes.byteLength, false);
    cursor += 4;
    framed.set(item.snap.afterBytes, cursor);
    cursor += item.snap.afterBytes.byteLength;
  }

  const fnv1a32Hex = computeFnv1a32Hex(framed);
  const sha256Hex = computeSha256Hex(framed);
  const chunkId = `undo-cold-${step.sequenceNumber}-${fnv1a32Hex}`;
  const virtualOpfsPath = `${virtualOpfsDirectory}/${chunkId}-${sha256Hex.slice(0, 16)}.bin`;

  const restorePlan: ColdSpillRestorePlan = {
    chunkId, virtualOpfsPath, beforeSliceOffset, beforeSliceLength: beforeBytes.byteLength,
    afterSliceOffset, afterSliceLength: afterBytes.byteLength, auxEntryCount: auxList.length,
    expectedFnv1a32Hex: fnv1a32Hex, expectedSha256Hex: sha256Hex,
  };
  return {
    descriptor: {
      chunkId, stepId: step.stepId, virtualOpfsPath, byteLength: totalLength,
      beforeByteLength: beforeBytes.byteLength, afterByteLength: afterBytes.byteLength,
      fnv1a32Hex, sha256Hex, restorePlan,
    },
    framedChunkBytes: framed,
  };
}

function trimTrailingSlashes(pathValue: string): string {
  let end = pathValue.length;
  while (end > 0 && pathValue.charCodeAt(end - 1) === 0x2f) end -= 1;
  return end === 0 ? "/toonstudio-opfs/undo-cold" : pathValue.slice(0, end);
}

/**
 * 미세 조작 병합, 로그 간격 솎아내기, 128 MiB RAM 상한 콜드 스필을 통합 집행하는 실행 취소 거버너.
 */
export class UndoCommandCoalescerGovernor {
  private readonly coalesceWindowMs: number;
  private readonly hotWindowSteps: number;
  private readonly maxRamBytes: number;
  private readonly virtualOpfsDirectory: string;
  private readonly undoStack: InternalUndoStep[] = [];
  private readonly redoStack: InternalUndoStep[] = [];
  private nextSequenceNumber = 1;
  private totalCommandsIngested = 0;
  private coalescedMergeCount = 0;
  private logarithmicThinMergeCount = 0;
  private residentRamBytes = 0;

  public constructor(options?: UndoGovernorOptions) {
    const requestedWindow = options?.coalesceWindowMs ?? DEFAULT_COALESCE_WINDOW_MS;
    this.coalesceWindowMs = Math.max(0, Math.min(MAX_COALESCE_WINDOW_MS, Math.round(requestedWindow)));
    this.hotWindowSteps = Math.max(1, Math.round(options?.hotWindowSteps ?? DEFAULT_HOT_WINDOW_STEPS));
    this.maxRamBytes = Math.max(0, Math.round(options?.maxRamBytes ?? DEFAULT_MAX_UNDO_RAM_BYTES));
    this.virtualOpfsDirectory = trimTrailingSlashes(options?.virtualOpfsDirectory ?? "/toonstudio-opfs/undo-cold");
  }

  /** 현재 진행 중인 연속 제스처에 명시적 배리어를 세워 다음 입력이 새 실행 취소 단계로 분리되게 한다. */
  public sealActiveGesture(): void {
    const top = this.undoStack[this.undoStack.length - 1];
    if (top) top.sealedByBarrier = true;
  }

  /** 새 편집 명령을 기록하고 병합·로그 솎아내기·콜드 스필 정책을 동기적으로 적용한다. */
  public pushCommand(command: UndoableStudioCommand): PushUndoCommandResult {
    this.totalCommandsIngested += 1;
    this.clearRedoStack();

    const beforeBytes = toOwnedBytes(command.beforePayload);
    const afterBytes = toOwnedBytes(command.afterPayload);
    const top = this.undoStack[this.undoStack.length - 1];

    if (top && this.canCoalesceWithTop(top, command)) {
      this.residentRamBytes -= top.residentRamBytes;
      top.afterBytes = afterBytes;
      const targetKey = makeTargetKey(top.layerId, top.propertyKey);
      if (top.compoundMap) {
        const existing = top.compoundMap.get(targetKey);
        top.compoundMap.set(targetKey, {
          targetKey,
          beforeBytes: existing ? existing.beforeBytes : (top.beforeBytes ?? beforeBytes),
          afterBytes,
        });
      }
      top.updatedAtMs = command.timestampMs;
      top.coalescedEventCount += 1;
      if (command.explicitStrokeEndBarrier === true) top.sealedByBarrier = true;
      top.residentRamBytes = computeStepResidentBytes(top.beforeBytes, top.afterBytes, top.compoundMap);
      this.residentRamBytes += top.residentRamBytes;
      this.coalescedMergeCount += 1;

      return {
        mergedIntoExistingStep: true, activeStepId: top.stepId, undoDepth: this.undoStack.length,
        residentRamBytes: this.residentRamBytes, logarithmicThinnedNow: 0,
        emittedSpillPackets: this.enforceRamCeiling(),
      };
    }

    if (top) top.sealedByBarrier = true;
    const isDiscrete = !isContinuousScrubKind(command.kind);
    const isPinnedMilestone =
      command.isStructuralMilestone === true || command.kind === "cut-split" || command.kind === "layer-structural";
    const targetKey = makeTargetKey(command.layerId, command.propertyKey);
    const compoundMap = new Map<string, PropertyStateSnapshot>([[targetKey, { targetKey, beforeBytes, afterBytes }]]);
    const stepBytes = computeStepResidentBytes(beforeBytes, afterBytes, compoundMap);

    const newStep: InternalUndoStep = {
      stepId: command.commandId, sequenceNumber: this.nextSequenceNumber, kind: command.kind,
      toolId: command.toolId, layerId: command.layerId, propertyKey: command.propertyKey,
      startedAtMs: command.timestampMs, updatedAtMs: command.timestampMs,
      coalescedEventCount: 1, representedGestureCount: 1, isPinnedMilestone,
      sealedByBarrier: isDiscrete || command.explicitStrokeEndBarrier === true,
      retentionTier: "hot-lossless", isColdSpilled: false, beforeBytes, afterBytes,
      compoundMap, residentRamBytes: stepBytes, coldDescriptor: null,
    };
    this.nextSequenceNumber += 1;
    this.undoStack.push(newStep);
    this.residentRamBytes += stepBytes;

    const logarithmicThinnedNow = this.thinOlderMicroAdjustments();
    const emittedSpillPackets = this.enforceRamCeiling();
    return {
      mergedIntoExistingStep: false, activeStepId: newStep.stepId, undoDepth: this.undoStack.length,
      residentRamBytes: this.residentRamBytes, logarithmicThinnedNow, emittedSpillPackets,
    };
  }

  /** 최상단 실행 취소 단계를 역적용한다. 콜드 스필된 단계라면 복원 요청 명세를 반환한다. */
  public undo(): UndoReplayOutcome | null {
    return this.popReplayStep(this.undoStack, this.redoStack);
  }

  /** 가장 최근에 취소한 단계를 다시 적용(Redo)한다. */
  public redo(): UndoReplayOutcome | null {
    return this.popReplayStep(this.redoStack, this.undoStack);
  }

  private popReplayStep(source: InternalUndoStep[], dest: InternalUndoStep[]): UndoReplayOutcome | null {
    const top = source[source.length - 1];
    if (!top) return null;
    top.sealedByBarrier = true;
    if (top.isColdSpilled || !top.beforeBytes || !top.afterBytes) {
      return top.coldDescriptor
        ? { status: "requires-cold-restore", stepId: top.stepId, coldDescriptor: top.coldDescriptor }
        : null;
    }
    source.pop();
    dest.push(top);
    return {
      status: "applied", stepId: top.stepId, kind: top.kind, layerId: top.layerId, propertyKey: top.propertyKey,
      beforeBytes: toOwnedBytes(top.beforeBytes), afterBytes: toOwnedBytes(top.afterBytes),
      compoundSnapshots: top.compoundMap ? Array.from(top.compoundMap.values()) : [],
    };
  }

  /** 외부 OPFS 워커가 읽어온 청크 바이트의 FNV-1a·SHA-256 무결성을 검증하고 콜드 단계를 무손실 복원한다. */
  public rehydrateColdStep(stepId: string, framedChunkBytes: Uint8Array): ColdRestoreVerificationResult {
    const target =
      this.undoStack.find((s) => s.stepId === stepId) ?? this.redoStack.find((s) => s.stepId === stepId);

    if (!target || !target.coldDescriptor) {
      throw new Error(`콜드 스필된 실행 취소 단계를 찾을 수 없습니다: ${stepId}`);
    }

    const plan = target.coldDescriptor.restorePlan;
    if (framedChunkBytes.byteLength !== target.coldDescriptor.byteLength) {
      throw new Error(`콜드 청크 길이 불일치: 예상 ${target.coldDescriptor.byteLength}B, 실제 ${framedChunkBytes.byteLength}B`);
    }
    for (let m = 0; m < 4; m += 1) {
      if (framedChunkBytes[m] !== CHUNK_MAGIC[m]) throw new Error(`콜드 청크 매직 헤더 손상: ${stepId}`);
    }

    const actualFnv1a = computeFnv1a32Hex(framedChunkBytes);
    const actualSha256 = computeSha256Hex(framedChunkBytes);
    if (actualFnv1a !== plan.expectedFnv1a32Hex || actualSha256 !== plan.expectedSha256Hex) {
      throw new Error(`콜드 청크 해시 무결성 검증 실패: ${stepId}`);
    }

    const beforeBytes = framedChunkBytes.slice(plan.beforeSliceOffset, plan.beforeSliceOffset + plan.beforeSliceLength);
    const afterBytes = framedChunkBytes.slice(plan.afterSliceOffset, plan.afterSliceOffset + plan.afterSliceLength);

    const view = new DataView(framedChunkBytes.buffer, framedChunkBytes.byteOffset, framedChunkBytes.byteLength);
    let cursor = plan.afterSliceOffset + plan.afterSliceLength;
    const auxCount = view.getUint32(cursor, false);
    cursor += 4;

    const compoundMap = new Map<string, PropertyStateSnapshot>();
    if (auxCount === 0) {
      const primaryKey = makeTargetKey(target.layerId, target.propertyKey);
      compoundMap.set(primaryKey, { targetKey: primaryKey, beforeBytes, afterBytes });
    } else {
      for (let idx = 0; idx < auxCount; idx += 1) {
        const keyLen = view.getUint16(cursor, false);
        cursor += 2;
        const targetKey = UTF8_DECODER.decode(framedChunkBytes.subarray(cursor, cursor + keyLen));
        cursor += keyLen;
        const bLen = view.getUint32(cursor, false);
        cursor += 4;
        const bBytes = framedChunkBytes.slice(cursor, cursor + bLen);
        cursor += bLen;
        const aLen = view.getUint32(cursor, false);
        cursor += 4;
        const aBytes = framedChunkBytes.slice(cursor, cursor + aLen);
        cursor += aLen;
        compoundMap.set(targetKey, { targetKey, beforeBytes: bBytes, afterBytes: aBytes });
      }
    }

    const restoredBytes = computeStepResidentBytes(beforeBytes, afterBytes, compoundMap);
    target.beforeBytes = beforeBytes;
    target.afterBytes = afterBytes;
    target.compoundMap = compoundMap;
    target.isColdSpilled = false;
    target.retentionTier = target.representedGestureCount > 1 ? "logarithmic-milestone" : "hot-lossless";
    target.residentRamBytes = restoredBytes;
    this.residentRamBytes += restoredBytes;

    const cascadedSpillPackets = this.enforceRamCeiling(stepId);
    return {
      stepId, restoredByteLength: restoredBytes, verifiedSha256Hex: actualSha256,
      verifiedFnv1a32Hex: actualFnv1a, residentRamBytesAfterRestore: this.residentRamBytes,
      cascadedSpillPackets,
    };
  }

  /** 현재 스택 깊이, 병합률, 상주 RAM 바이트, 콜드 스필 통계를 스냅샷으로 반환한다. */
  public getSnapshot(): UndoGovernorSnapshot {
    let coldSpilledStepCount = 0;
    let coldSpilledTotalBytes = 0;
    let pinnedMilestoneCount = 0;
    let hotLosslessStepCount = 0;

    const summaries: UndoStepSummary[] = this.undoStack.map((step) => {
      if (step.isColdSpilled && step.coldDescriptor) {
        coldSpilledStepCount += 1;
        coldSpilledTotalBytes += step.coldDescriptor.byteLength;
      }
      if (step.isPinnedMilestone) pinnedMilestoneCount += 1;
      if (step.retentionTier === "hot-lossless" && !step.isColdSpilled) hotLosslessStepCount += 1;
      return {
        stepId: step.stepId, kind: step.kind, toolId: step.toolId,
        layerId: step.layerId, propertyKey: step.propertyKey,
        startedAtMs: step.startedAtMs, updatedAtMs: step.updatedAtMs,
        coalescedEventCount: step.coalescedEventCount, representedGestureCount: step.representedGestureCount,
        isPinnedMilestone: step.isPinnedMilestone, sealedByBarrier: step.sealedByBarrier,
        retentionTier: step.retentionTier, isColdSpilled: step.isColdSpilled,
        residentRamBytes: step.residentRamBytes, coldDescriptor: step.coldDescriptor,
      };
    });

    const stackReductionRatio =
      this.totalCommandsIngested > 0
        ? Math.max(0, Math.round(((this.totalCommandsIngested - this.undoStack.length) / this.totalCommandsIngested) * 1_000_000) / 1_000_000)
        : 0;

    return {
      undoDepth: this.undoStack.length, redoDepth: this.redoStack.length,
      totalCommandsIngested: this.totalCommandsIngested, coalescedMergeCount: this.coalescedMergeCount,
      logarithmicThinMergeCount: this.logarithmicThinMergeCount, stackReductionRatio,
      residentRamBytes: this.residentRamBytes, maxRamBytes: this.maxRamBytes,
      coldSpilledStepCount, coldSpilledTotalBytes, pinnedMilestoneCount,
      hotLosslessStepCount, steps: summaries,
    };
  }

  private canCoalesceWithTop(top: InternalUndoStep, incoming: UndoableStudioCommand): boolean {
    if (top.isColdSpilled || top.sealedByBarrier || incoming.explicitBarrierBefore === true) return false;
    if (!isContinuousScrubKind(top.kind) || !isContinuousScrubKind(incoming.kind)) return false;
    if (top.kind !== incoming.kind || top.toolId !== incoming.toolId || top.layerId !== incoming.layerId || top.propertyKey !== incoming.propertyKey) {
      return false;
    }
    const deltaMs = incoming.timestampMs - top.updatedAtMs;
    return deltaMs >= 0 && deltaMs <= this.coalesceWindowMs;
  }

  private clearRedoStack(): void {
    for (const step of this.redoStack) this.residentRamBytes -= step.residentRamBytes;
    this.redoStack.length = 0;
  }

  private canThinMergePair(left: InternalUndoStep, right: InternalUndoStep): boolean {
    return !left.isColdSpilled && !right.isColdSpilled && !left.isPinnedMilestone && !right.isPinnedMilestone &&
      isContinuousScrubKind(left.kind) && isContinuousScrubKind(right.kind);
  }

  private thinOlderMicroAdjustments(): number {
    let mergedNow = 0;
    if (this.undoStack.length - this.hotWindowSteps <= 1) return 0;

    let i = 0;
    while (i + 1 < this.undoStack.length - this.hotWindowSteps) {
      const left = this.undoStack[i];
      const right = this.undoStack[i + 1];
      if (!left || !right || !this.canThinMergePair(left, right)) {
        i += 1;
        continue;
      }
      const ageFromHead = this.undoStack.length - 1 - i;
      const logBucketExp = Math.min(6, Math.floor(Math.log2(Math.max(1, ageFromHead / this.hotWindowSteps))) + 1);
      if (left.representedGestureCount + right.representedGestureCount > 1 << logBucketExp) {
        i += 1;
        continue;
      }

      this.residentRamBytes -= left.residentRamBytes + right.residentRamBytes;
      const mergedMap = new Map<string, PropertyStateSnapshot>(left.compoundMap ?? []);
      if (right.compoundMap) {
        for (const [k, v] of right.compoundMap.entries()) {
          const prev = mergedMap.get(k);
          mergedMap.set(k, { targetKey: k, beforeBytes: prev ? prev.beforeBytes : v.beforeBytes, afterBytes: v.afterBytes });
        }
      }
      const primarySnap = mergedMap.get(makeTargetKey(left.layerId, left.propertyKey));
      if (primarySnap) {
        left.beforeBytes = primarySnap.beforeBytes;
        left.afterBytes = primarySnap.afterBytes;
      }
      left.compoundMap = mergedMap;
      left.updatedAtMs = right.updatedAtMs;
      left.coalescedEventCount += right.coalescedEventCount;
      left.representedGestureCount += right.representedGestureCount;
      left.retentionTier = "logarithmic-milestone";
      left.sealedByBarrier = true;
      left.residentRamBytes = computeStepResidentBytes(left.beforeBytes, left.afterBytes, left.compoundMap);
      this.residentRamBytes += left.residentRamBytes;

      this.undoStack.splice(i + 1, 1);
      mergedNow += 1;
      this.logarithmicThinMergeCount += 1;
    }
    return mergedNow;
  }

  private enforceRamCeiling(protectedStepId?: string): EmittedOpfsSpillPacket[] {
    const packets: EmittedOpfsSpillPacket[] = [];
    for (const stack of [this.undoStack, this.redoStack]) {
      for (let i = 0; i < stack.length && this.residentRamBytes > this.maxRamBytes; i += 1) {
        const candidate = stack[i];
        if (!candidate || candidate.isColdSpilled || candidate.stepId === protectedStepId) continue;
        packets.push(this.spillStepToColdDescriptor(candidate));
      }
    }
    if (this.residentRamBytes > this.maxRamBytes && protectedStepId !== undefined) {
      const protectedStep =
        this.undoStack.find((s) => s.stepId === protectedStepId && !s.isColdSpilled) ??
        this.redoStack.find((s) => s.stepId === protectedStepId && !s.isColdSpilled);
      if (protectedStep) packets.push(this.spillStepToColdDescriptor(protectedStep));
    }
    return packets;
  }

  private spillStepToColdDescriptor(step: InternalUndoStep): EmittedOpfsSpillPacket {
    const packet = buildColdSpillPacket(step, this.virtualOpfsDirectory);
    this.residentRamBytes -= step.residentRamBytes;
    step.beforeBytes = null;
    step.afterBytes = null;
    step.compoundMap = null;
    step.residentRamBytes = 0;
    step.isColdSpilled = true;
    step.retentionTier = "opfs-cold-spilled";
    step.coldDescriptor = packet.descriptor;
    step.sealedByBarrier = true;
    return packet;
  }
}
