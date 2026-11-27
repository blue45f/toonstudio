/**
 * Wave-33: 하이브리드 레이어 트리 + 64x64 서브타일 실시간 동시 편집 CRDT 병합 엔진.
 *
 * 태블릿 선화 작가와 데스크톱 채색·식자 어시스턴트가 동일 컷을 오프라인·실시간으로 동시 편집할 때:
 * 1) Base-62 사전순 분수 인덱스(Lexicographic Fractional Indexing) 기반 무충돌 Z-order 삽입·재배치,
 * 2) Lamport 타임스탬프 + 작성자 ID + opId 전순서 기반 LWW 레이어 속성 레지스터 및 무사이클 폴더 이동,
 * 3) 64x64 서브타일 소프트 의도 잠금(Soft Intent Lease)과 무순서(Out-of-Order)·멱등(Idempotent)
 *    정수 프리멀티플라이드 픽셀 패치 로그 수렴을 보장한다.
 */

import type { WebGpuBlendMode } from "./webgpu-dirty-tile-mipmap-compositor";

export const CRDT_SUBTILE_SIZE_PX = 64;
export const DEFAULT_SOFT_LEASE_TTL_MS = 2_000;

/** UTF-16 코드 유닛 순으로 엄격 단조 증가하는 Base-62 분수 인덱스 알파벳('0'..'9' < 'A'..'Z' < 'a'..'z'). */
export const FRACTIONAL_INDEX_DIGITS =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

const BASE = FRACTIONAL_INDEX_DIGITS.length;
const ZERO_CHAR = FRACTIONAL_INDEX_DIGITS[0] ?? "0";
const MID_CHAR = FRACTIONAL_INDEX_DIGITS[Math.floor(BASE / 2)] ?? "V";

export type CollabActorRole = "line-art" | "coloring" | "lettering" | "assistant";
export type CollabLayerKind = "raster" | "group";
export type SubtilePatchMode = "alpha-over" | "erase" | "replace";

export interface CausalStamp {
  readonly lamport: number;
  readonly actorId: string;
  readonly opId: string;
}

export interface LayerMutablePatch {
  readonly name?: string;
  readonly opacity?: number;
  readonly blendMode?: WebGpuBlendMode;
  readonly visible?: boolean;
  readonly locked?: boolean;
  readonly clippingMask?: boolean;
  readonly zOrderKey?: string;
}

export interface CreateLayerOperation extends CausalStamp {
  readonly kind: "create-layer";
  readonly layerId: string;
  readonly layerKind: CollabLayerKind;
  readonly parentId: string | null;
  readonly name: string;
  readonly zOrderKey: string;
  readonly opacity?: number;
  readonly blendMode?: WebGpuBlendMode;
  readonly visible?: boolean;
  readonly locked?: boolean;
  readonly clippingMask?: boolean;
}

export interface UpdateLayerPropsOperation extends CausalStamp {
  readonly kind: "update-layer-props";
  readonly layerId: string;
  readonly patch: LayerMutablePatch;
}

export interface MoveLayerOperation extends CausalStamp {
  readonly kind: "move-layer";
  readonly layerId: string;
  readonly targetParentId: string | null;
  readonly targetZOrderKey?: string;
}

export interface DeleteLayerOperation extends CausalStamp {
  readonly kind: "delete-layer";
  readonly layerId: string;
  readonly deleted: boolean;
}

export interface SubtilePixelDelta {
  readonly localX: number;
  readonly localY: number;
  /** 프리멀티플라이드 RGBA (0..255). */
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export interface SubtilePatchOperation extends CausalStamp {
  readonly kind: "subtile-patch";
  readonly layerId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly patchMode: SubtilePatchMode;
  readonly pixels: ReadonlyArray<SubtilePixelDelta>;
}

export interface SubtileLeaseOperation extends CausalStamp {
  readonly kind: "subtile-lease";
  readonly layerId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly role: CollabActorRole;
  readonly acquiredAtMs: number;
  readonly expiresAtMs: number;
  readonly released?: boolean;
}

export type CrdtCollabOperation =
  | CreateLayerOperation
  | DeleteLayerOperation
  | MoveLayerOperation
  | SubtileLeaseOperation
  | SubtilePatchOperation
  | UpdateLayerPropsOperation;

export interface CollabLayerSnapshot {
  readonly layerId: string;
  readonly layerKind: CollabLayerKind;
  readonly parentId: string | null;
  readonly name: string;
  readonly zOrderKey: string;
  readonly opacity: number;
  readonly blendMode: WebGpuBlendMode;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly clippingMask: boolean;
  readonly deleted: boolean;
}

export interface SoftSubtileIntentLease {
  readonly layerId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly actorId: string;
  readonly role: CollabActorRole;
  readonly acquiredAtMs: number;
  readonly expiresAtMs: number;
  readonly stamp: CausalStamp;
}

export interface SoftLeaseAcquireResult {
  readonly status: "granted" | "soft-conflict";
  readonly operation: SubtileLeaseOperation;
  readonly conflictingLeases: ReadonlyArray<SoftSubtileIntentLease>;
}

/** 로케일 영향 없는 순수 UTF-16 코드 유닛 사전순 비교 함수. */
export function compareCodeUnitStrings(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Lamport 타임스탬프 -> actorId -> opId 순의 엄격 전순서(Strict Total Order) 비교 함수. */
export function compareCausalOrder(a: CausalStamp, b: CausalStamp): number {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport;
  const actorCmp = compareCodeUnitStrings(a.actorId, b.actorId);
  return actorCmp !== 0 ? actorCmp : compareCodeUnitStrings(a.opId, b.opId);
}

function digitIndexOf(ch: string): number {
  const idx = FRACTIONAL_INDEX_DIGITS.indexOf(ch);
  if (idx < 0) throw new RangeError(`유효하지 않은 분수 인덱스 문자입니다: "${ch}"`);
  return idx;
}

function normalizeFractionalKey(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined || raw.length === 0) return null;
  for (let i = 0; i < raw.length; i += 1) digitIndexOf(raw[i] ?? "");
  let end = raw.length;
  while (end > 0 && raw[end - 1] === ZERO_CHAR) end -= 1;
  if (end === 0) throw new RangeError(`분수 인덱스는 모두 '${ZERO_CHAR}'으로만 구성될 수 없습니다: "${raw}"`);
  return raw.slice(0, end);
}

function midpointBetweenNormalized(lower: string | null, upper: string | null): string {
  if (lower === null && upper === null) return MID_CHAR;

  if (lower === null && upper !== null) {
    const firstUpper = digitIndexOf(upper[0] ?? ZERO_CHAR);
    if (firstUpper > 1) return FRACTIONAL_INDEX_DIGITS[Math.floor(firstUpper / 2)] ?? MID_CHAR;
    if (firstUpper === 1) {
      return ZERO_CHAR + midpointBetweenNormalized(null, upper.length > 1 ? upper.slice(1) : null);
    }
    return ZERO_CHAR + midpointBetweenNormalized(null, upper.slice(1));
  }

  if (lower !== null && upper === null) {
    const firstLower = digitIndexOf(lower[0] ?? ZERO_CHAR);
    if (firstLower < BASE - 1) {
      return FRACTIONAL_INDEX_DIGITS[Math.floor((firstLower + BASE) / 2)] ?? MID_CHAR;
    }
    return (
      (FRACTIONAL_INDEX_DIGITS[BASE - 1] ?? "z") +
      midpointBetweenNormalized(lower.length > 1 ? lower.slice(1) : null, null)
    );
  }

  const lo = lower ?? "";
  const hi = upper ?? "";
  let prefixLen = 0;
  const minLen = Math.min(lo.length, hi.length);
  while (prefixLen < minLen && lo[prefixLen] === hi[prefixLen]) prefixLen += 1;

  const sharedPrefix = lo.slice(0, prefixLen);
  if (prefixLen === lo.length) {
    return sharedPrefix + midpointBetweenNormalized(null, hi.slice(prefixLen));
  }

  const loDigit = digitIndexOf(lo[prefixLen] ?? ZERO_CHAR);
  const hiDigit = digitIndexOf(hi[prefixLen] ?? ZERO_CHAR);
  if (hiDigit - loDigit > 1) {
    return sharedPrefix + (FRACTIONAL_INDEX_DIGITS[Math.floor((loDigit + hiDigit) / 2)] ?? MID_CHAR);
  }
  const loRest = prefixLen + 1 < lo.length ? lo.slice(prefixLen + 1) : null;
  return sharedPrefix + (lo[prefixLen] ?? ZERO_CHAR) + midpointBetweenNormalized(loRest, null);
}

/**
 * 두 사전순 분수 인덱스 `lowerKey < upperKey` 사이에 엄격히 위치하는 새 분수 인덱스를 생성한다.
 * 반환 문자열은 절대 말미 `'0'`으로 끝나지 않으며 `lowerKey < result < upperKey`를 만족한다.
 */
export function generateFractionalKeyBetween(lowerKey: string | null, upperKey: string | null): string {
  const lo = normalizeFractionalKey(lowerKey);
  const hi = normalizeFractionalKey(upperKey);
  if (lo !== null && hi !== null && compareCodeUnitStrings(lo, hi) >= 0) {
    throw new RangeError(`분수 인덱스 하한("${lo}")은 상한("${hi}")보다 사전순으로 작아야 합니다.`);
  }
  return midpointBetweenNormalized(lo, hi);
}

/** 초기 레이어 스택 구성을 위해 균등 정렬된 `count`개의 분수 인덱스를 결정론적으로 생성한다. */
export function generateSequentialFractionalKeys(
  count: number,
  lowerKey: string | null = null,
  upperKey: string | null = null,
): ReadonlyArray<string> {
  const n = Math.max(0, Math.floor(count));
  if (n === 0) return [];
  if (n === 1) return [generateFractionalKeyBetween(lowerKey, upperKey)];
  const midIdx = Math.floor(n / 2);
  const midKey = generateFractionalKeyBetween(lowerKey, upperKey);
  return [
    ...generateSequentialFractionalKeys(midIdx, lowerKey, midKey),
    midKey,
    ...generateSequentialFractionalKeys(n - midIdx - 1, midKey, upperKey),
  ];
}

function div255Exact(product: number): number {
  const t = product + 0x80;
  return (t + (t >>> 8)) >>> 8;
}

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampOpacity(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(1, value));
}

function writePremulPixel(buf: Uint8Array, idx: number, r: number, g: number, b: number, a: number): void {
  buf[idx] = r;
  buf[idx + 1] = g;
  buf[idx + 2] = b;
  buf[idx + 3] = a;
}

/** 부동소수점 오차가 없는 정수 프리멀티플라이드 Porter-Duff 64x64 서브타일 패치 적용기. */
export function applySubtilePatchToBuffer(targetRgba64x64: Uint8Array, op: SubtilePatchOperation): void {
  for (const px of op.pixels) {
    if (px.localX < 0 || px.localY < 0 || px.localX >= CRDT_SUBTILE_SIZE_PX || px.localY >= CRDT_SUBTILE_SIZE_PX) {
      continue;
    }
    const idx = (px.localY * CRDT_SUBTILE_SIZE_PX + px.localX) * 4;
    const srcA = clampByte(px.a);
    const srcR = Math.min(srcA, clampByte(px.r));
    const srcG = Math.min(srcA, clampByte(px.g));
    const srcB = Math.min(srcA, clampByte(px.b));

    if (op.patchMode === "replace") {
      writePremulPixel(targetRgba64x64, idx, srcR, srcG, srcB, srcA);
      continue;
    }
    if (srcA === 0) continue;

    const dstR = targetRgba64x64[idx] ?? 0;
    const dstG = targetRgba64x64[idx + 1] ?? 0;
    const dstB = targetRgba64x64[idx + 2] ?? 0;
    const dstA = targetRgba64x64[idx + 3] ?? 0;

    if (op.patchMode === "erase") {
      const keep = 255 - srcA;
      writePremulPixel(
        targetRgba64x64,
        idx,
        div255Exact(dstR * keep),
        div255Exact(dstG * keep),
        div255Exact(dstB * keep),
        div255Exact(dstA * keep),
      );
      continue;
    }
    if (srcA === 255) {
      writePremulPixel(targetRgba64x64, idx, srcR, srcG, srcB, 255);
      continue;
    }
    const invSrcA = 255 - srcA;
    const outA = Math.min(255, srcA + div255Exact(dstA * invSrcA));
    writePremulPixel(
      targetRgba64x64,
      idx,
      Math.min(outA, srcR + div255Exact(dstR * invSrcA)),
      Math.min(outA, srcG + div255Exact(dstG * invSrcA)),
      Math.min(outA, srcB + div255Exact(dstB * invSrcA)),
      outA,
    );
  }
}

interface LwwField<T> {
  value: T;
  stamp: CausalStamp;
}

interface InternalLayerRecord {
  readonly layerId: string;
  layerKind: LwwField<CollabLayerKind>;
  createdStamp: CausalStamp;
  initialParentId: LwwField<string | null>;
  resolvedParentId: string | null;
  name: LwwField<string>;
  zOrderKey: LwwField<string>;
  opacity: LwwField<number>;
  blendMode: LwwField<WebGpuBlendMode>;
  visible: LwwField<boolean>;
  locked: LwwField<boolean>;
  clippingMask: LwwField<boolean>;
  deleted: LwwField<boolean>;
}

interface InternalSubtileLog {
  ops: SubtilePatchOperation[];
  dirtyCache: boolean;
  materialized: Uint8Array;
}

interface InternalLeaseSlot {
  layerId: string;
  tileX: number;
  tileY: number;
  actorId: string;
  role: CollabActorRole;
  acquiredAtMs: number;
  expiresAtMs: number;
  released: boolean;
  stamp: CausalStamp;
}

function updateLwwField<T>(field: LwwField<T>, nextValue: T, nextStamp: CausalStamp): void {
  if (compareCausalOrder(nextStamp, field.stamp) > 0) {
    field.value = nextValue;
    field.stamp = { lamport: nextStamp.lamport, actorId: nextStamp.actorId, opId: nextStamp.opId };
  }
}

function fnv1aMixBytes(hashHi: number, hashLo: number, byte: number): [number, number] {
  const xLo = (hashLo ^ (byte & 0xff)) >>> 0;
  const xHi = hashHi >>> 0;
  const prodLo = Math.imul(xLo, 0x000001b3) >>> 0;
  const carry = Math.floor((xLo * 0x000001b3) / 0x1_0000_0000) >>> 0;
  const prodHi = (Math.imul(xHi, 0x000001b3) + Math.imul(xLo, 0x00000100) + carry) >>> 0;
  return [prodHi, prodLo];
}

function fnv1aMixString(hashHi: number, hashLo: number, text: string): [number, number] {
  let hi = hashHi;
  let lo = hashLo;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    [hi, lo] = fnv1aMixBytes(hi, lo, code & 0xff);
    [hi, lo] = fnv1aMixBytes(hi, lo, (code >>> 8) & 0xff);
  }
  return fnv1aMixBytes(hi, lo, 0x1f);
}

/**
 * 동시 편집 레이어 트리 + 64x64 서브타일 CRDT 상태 엔진.
 * 오퍼레이션 입력 순서와 무관하게(교환·결합·멱등성) 전 피어가 100% 동일한 상태로 수렴한다.
 */
export class CrdtLayerSubtileCollabEngine {
  public readonly localActorId: string;

  private lamportClock = 0;
  private localSeq = 0;
  private readonly seenOpIds = new Set<string>();
  private readonly layers = new Map<string, InternalLayerRecord>();
  private readonly moveHistory: MoveLayerOperation[] = [];
  private treeMovesDirty = false;
  private readonly subtileLogs = new Map<string, InternalSubtileLog>();
  private readonly leases = new Map<string, InternalLeaseSlot>();

  public constructor(localActorId: string) {
    this.localActorId = localActorId.trim() || "anonymous-actor";
  }

  public get currentLamport(): number {
    return this.lamportClock;
  }

  public get appliedOperationCount(): number {
    return this.seenOpIds.size;
  }

  /** 로컬 편집 오퍼레이션 생성을 위한 단조 증가 인과 스탬프 발급. */
  public nextCausalStamp(): CausalStamp {
    this.lamportClock += 1;
    this.localSeq += 1;
    return {
      lamport: this.lamportClock,
      actorId: this.localActorId,
      opId: `${this.localActorId}:${this.lamportClock}:${this.localSeq}`,
    };
  }

  /** 단일 CRDT 오퍼레이션을 멱등하게 병합한다. 이미 적용된 `opId`는 즉시 무시된다. */
  public applyOperation(op: CrdtCollabOperation): boolean {
    if (this.seenOpIds.has(op.opId)) return false;
    this.seenOpIds.add(op.opId);
    if (op.lamport > this.lamportClock) this.lamportClock = op.lamport;

    if (op.kind === "create-layer") this.applyCreateLayer(op);
    else if (op.kind === "update-layer-props") this.applyUpdateLayerProps(op);
    else if (op.kind === "move-layer") this.applyMoveLayer(op);
    else if (op.kind === "delete-layer") this.applyDeleteLayer(op);
    else if (op.kind === "subtile-patch") this.applySubtilePatch(op);
    else this.applySubtileLease(op);
    return true;
  }

  /** 오프라인 큐 또는 원격 피어 배치 오퍼레이션을 일괄 병합한다. */
  public applyOperations(ops: Iterable<CrdtCollabOperation>): number {
    let applied = 0;
    for (const op of ops) {
      if (this.applyOperation(op)) applied += 1;
    }
    return applied;
  }

  /** 64x64 서브타일 로컬 소프트 의도 잠금(Soft Intent Lease)을 요청·발급한다. */
  public acquireSubtileIntentLease(params: {
    readonly layerId: string;
    readonly tileX: number;
    readonly tileY: number;
    readonly role: CollabActorRole;
    readonly nowMs: number;
    readonly ttlMs?: number;
  }): SoftLeaseAcquireResult {
    const ttl = Math.max(100, Math.floor(params.ttlMs ?? DEFAULT_SOFT_LEASE_TTL_MS));
    const active = this.getActiveSubtileLeases(params.layerId, params.tileX, params.tileY, params.nowMs);
    const conflicts = active.filter((lease) => lease.actorId !== this.localActorId);
    const operation: SubtileLeaseOperation = {
      ...this.nextCausalStamp(),
      kind: "subtile-lease",
      layerId: params.layerId,
      tileX: Math.floor(params.tileX),
      tileY: Math.floor(params.tileY),
      role: params.role,
      acquiredAtMs: params.nowMs,
      expiresAtMs: params.nowMs + ttl,
      released: false,
    };
    this.applyOperation(operation);
    return {
      status: conflicts.length > 0 ? "soft-conflict" : "granted",
      operation,
      conflictingLeases: conflicts,
    };
  }

  /** 지정 시각 `nowMs` 기준 만료되지 않은 서브타일 의도 잠금 목록을 결정론적 순서로 조회한다. */
  public getActiveSubtileLeases(
    layerId: string,
    tileX: number,
    tileY: number,
    nowMs: number,
  ): ReadonlyArray<SoftSubtileIntentLease> {
    const prefix = `${layerId}:${Math.floor(tileX)}:${Math.floor(tileY)}:`;
    const active: SoftSubtileIntentLease[] = [];
    for (const [key, slot] of this.leases.entries()) {
      if (!key.startsWith(prefix) || slot.released || nowMs >= slot.expiresAtMs) continue;
      active.push({
        layerId: slot.layerId,
        tileX: slot.tileX,
        tileY: slot.tileY,
        actorId: slot.actorId,
        role: slot.role,
        acquiredAtMs: slot.acquiredAtMs,
        expiresAtMs: slot.expiresAtMs,
        stamp: slot.stamp,
      });
    }
    return active.sort((a, b) => compareCodeUnitStrings(a.actorId, b.actorId));
  }

  /** 무사이클 계층 트리를 깊이 우선·Z-order(하단 -> 상단) 순으로 정렬한 스냅샷 목록을 반환한다. */
  public getOrderedLayers(options?: { readonly includeDeleted?: boolean }): ReadonlyArray<CollabLayerSnapshot> {
    this.ensureTreeMovesResolved();
    const includeDeleted = options?.includeDeleted ?? false;
    const childrenByParent = new Map<string | null, InternalLayerRecord[]>();

    for (const rec of this.layers.values()) {
      const parent =
        rec.resolvedParentId !== null && this.layers.has(rec.resolvedParentId) ? rec.resolvedParentId : null;
      const bucket = childrenByParent.get(parent) ?? [];
      bucket.push(rec);
      childrenByParent.set(parent, bucket);
    }

    for (const bucket of childrenByParent.values()) {
      bucket.sort(
        (a, b) =>
          compareCodeUnitStrings(a.zOrderKey.value, b.zOrderKey.value) ||
          compareCausalOrder(a.createdStamp, b.createdStamp) ||
          compareCodeUnitStrings(a.layerId, b.layerId),
      );
    }

    const ordered: CollabLayerSnapshot[] = [];
    const visit = (parentId: string | null): void => {
      for (const rec of childrenByParent.get(parentId) ?? []) {
        if (includeDeleted || !rec.deleted.value) ordered.push(this.toSnapshot(rec));
        visit(rec.layerId);
      }
    };
    visit(null);
    return ordered;
  }

  public getLayerSnapshot(layerId: string): CollabLayerSnapshot | null {
    this.ensureTreeMovesResolved();
    const rec = this.layers.get(layerId);
    return rec ? this.toSnapshot(rec) : null;
  }

  /** 지정 레이어의 (tileX, tileY) 64x64 서브타일 픽셀 버퍼(16,384B 복사본)를 반환한다. */
  public readSubtilePixels(layerId: string, tileX: number, tileY: number): Uint8Array {
    const entry = this.subtileLogs.get(`${layerId}:${Math.floor(tileX)}:${Math.floor(tileY)}`);
    if (!entry) return new Uint8Array(CRDT_SUBTILE_SIZE_PX * CRDT_SUBTILE_SIZE_PX * 4);
    this.materializeSubtileIfNeeded(entry);
    return entry.materialized.slice();
  }

  /** 레이어 트리 구조·LWW 속성·모든 서브타일 픽셀 바이트를 통합 해싱한 64비트 결정론적 상태 요약값. */
  public computeStateDigestHex(): string {
    let hi = 0xcbf29ce4;
    let lo = 0x84222325;
    for (const layer of this.getOrderedLayers({ includeDeleted: true })) {
      const meta = `${layer.layerId}|${layer.layerKind}|${layer.parentId ?? "<root>"}|${layer.name}|${layer.zOrderKey}|${layer.opacity.toFixed(6)}|${layer.blendMode}|${layer.visible ? 1 : 0}|${layer.locked ? 1 : 0}|${layer.clippingMask ? 1 : 0}|${layer.deleted ? 1 : 0}`;
      [hi, lo] = fnv1aMixString(hi, lo, meta);
    }

    for (const key of [...this.subtileLogs.keys()].sort(compareCodeUnitStrings)) {
      const entry = this.subtileLogs.get(key);
      if (!entry) continue;
      this.materializeSubtileIfNeeded(entry);
      if (!entry.materialized.some((byte) => byte !== 0)) continue;
      [hi, lo] = fnv1aMixString(hi, lo, key);
      for (let i = 0; i < entry.materialized.length; i += 1) {
        [hi, lo] = fnv1aMixBytes(hi, lo, entry.materialized[i] ?? 0);
      }
    }
    return `${hi.toString(16).padStart(8, "0")}${lo.toString(16).padStart(8, "0")}`;
  }

  private ensurePlaceholderLayer(layerId: string, stamp: CausalStamp): InternalLayerRecord {
    const existing = this.layers.get(layerId);
    if (existing) return existing;
    const z: CausalStamp = { lamport: -1, actorId: "", opId: "" };
    const created: InternalLayerRecord = {
      layerId,
      layerKind: { value: "raster", stamp: z },
      createdStamp: stamp,
      initialParentId: { value: null, stamp: z },
      resolvedParentId: null,
      name: { value: layerId, stamp: z },
      zOrderKey: { value: MID_CHAR, stamp: z },
      opacity: { value: 1, stamp: z },
      blendMode: { value: "normal", stamp: z },
      visible: { value: true, stamp: z },
      locked: { value: false, stamp: z },
      clippingMask: { value: false, stamp: z },
      deleted: { value: false, stamp: z },
    };
    this.layers.set(layerId, created);
    return created;
  }

  private applyCreateLayer(op: CreateLayerOperation): void {
    const stamp: CausalStamp = { lamport: op.lamport, actorId: op.actorId, opId: op.opId };
    const rec = this.ensurePlaceholderLayer(op.layerId, stamp);
    if (compareCausalOrder(stamp, rec.createdStamp) < 0) rec.createdStamp = stamp;
    updateLwwField(rec.layerKind, op.layerKind, op);
    updateLwwField(rec.initialParentId, op.parentId, op);
    updateLwwField(rec.name, op.name, op);
    updateLwwField(rec.zOrderKey, normalizeFractionalKey(op.zOrderKey) ?? MID_CHAR, op);
    updateLwwField(rec.opacity, clampOpacity(op.opacity), op);
    updateLwwField(rec.blendMode, op.blendMode ?? "normal", op);
    updateLwwField(rec.visible, op.visible ?? true, op);
    updateLwwField(rec.locked, op.locked ?? false, op);
    updateLwwField(rec.clippingMask, op.clippingMask ?? false, op);
    this.treeMovesDirty = true;
  }

  private applyUpdateLayerProps(op: UpdateLayerPropsOperation): void {
    const rec = this.ensurePlaceholderLayer(op.layerId, op);
    const { patch } = op;
    if (patch.name !== undefined) updateLwwField(rec.name, patch.name, op);
    if (patch.opacity !== undefined) updateLwwField(rec.opacity, clampOpacity(patch.opacity), op);
    if (patch.blendMode !== undefined) updateLwwField(rec.blendMode, patch.blendMode, op);
    if (patch.visible !== undefined) updateLwwField(rec.visible, patch.visible, op);
    if (patch.locked !== undefined) updateLwwField(rec.locked, patch.locked, op);
    if (patch.clippingMask !== undefined) updateLwwField(rec.clippingMask, patch.clippingMask, op);
    if (patch.zOrderKey !== undefined) {
      updateLwwField(rec.zOrderKey, normalizeFractionalKey(patch.zOrderKey) ?? MID_CHAR, op);
    }
  }

  private applyMoveLayer(op: MoveLayerOperation): void {
    const rec = this.ensurePlaceholderLayer(op.layerId, op);
    if (op.targetZOrderKey !== undefined) {
      updateLwwField(rec.zOrderKey, normalizeFractionalKey(op.targetZOrderKey) ?? MID_CHAR, op);
    }
    this.moveHistory.push(op);
    this.moveHistory.sort(compareCausalOrder);
    this.treeMovesDirty = true;
  }

  private applyDeleteLayer(op: DeleteLayerOperation): void {
    updateLwwField(this.ensurePlaceholderLayer(op.layerId, op).deleted, op.deleted, op);
  }

  private applySubtilePatch(op: SubtilePatchOperation): void {
    const key = `${op.layerId}:${Math.floor(op.tileX)}:${Math.floor(op.tileY)}`;
    let entry = this.subtileLogs.get(key);
    if (!entry) {
      entry = { ops: [], dirtyCache: false, materialized: new Uint8Array(CRDT_SUBTILE_SIZE_PX * CRDT_SUBTILE_SIZE_PX * 4) };
      this.subtileLogs.set(key, entry);
    }
    const lastOp = entry.ops[entry.ops.length - 1];
    entry.ops.push(op);
    if (!lastOp || compareCausalOrder(lastOp, op) < 0) {
      if (!entry.dirtyCache) applySubtilePatchToBuffer(entry.materialized, op);
    } else {
      entry.ops.sort(compareCausalOrder);
      entry.dirtyCache = true;
    }
  }

  private applySubtileLease(op: SubtileLeaseOperation): void {
    const tx = Math.floor(op.tileX);
    const ty = Math.floor(op.tileY);
    const key = `${op.layerId}:${tx}:${ty}:${op.actorId}`;
    const existing = this.leases.get(key);
    if (existing && compareCausalOrder(op, existing.stamp) <= 0) return;
    this.leases.set(key, {
      layerId: op.layerId, tileX: tx, tileY: ty, actorId: op.actorId, role: op.role,
      acquiredAtMs: op.acquiredAtMs, expiresAtMs: op.expiresAtMs, released: op.released ?? false,
      stamp: { lamport: op.lamport, actorId: op.actorId, opId: op.opId },
    });
  }

  private materializeSubtileIfNeeded(entry: InternalSubtileLog): void {
    if (!entry.dirtyCache) return;
    entry.materialized.fill(0);
    for (const op of entry.ops) applySubtilePatchToBuffer(entry.materialized, op);
    entry.dirtyCache = false;
  }

  /** Kleppmann 전순서 트리 이동 재생: 사이클을 유발하는 동시 교차 이동을 거부하여 무사이클 포리스트로 수렴시킨다. */
  private ensureTreeMovesResolved(): void {
    if (!this.treeMovesDirty) return;
    const parentMap = new Map<string, string | null>();
    const initialEntries = [...this.layers.values()].sort((a, b) => compareCausalOrder(a.createdStamp, b.createdStamp));
    const wouldIntroduceCycle = (childId: string, candidateParentId: string | null): boolean => {
      if (candidateParentId === null) return false;
      let cursor: string | null = candidateParentId;
      for (let guard = 0; cursor !== null && guard <= this.layers.size + 1; guard += 1) {
        if (cursor === childId) return true;
        cursor = parentMap.get(cursor) ?? null;
      }
      return cursor !== null;
    };

    for (const rec of initialEntries) parentMap.set(rec.layerId, null);
    for (const rec of initialEntries) {
      const c = rec.initialParentId.value;
      if (c !== null && this.layers.has(c) && !wouldIntroduceCycle(rec.layerId, c)) parentMap.set(rec.layerId, c);
    }
    for (const move of this.moveHistory) {
      if (!this.layers.has(move.layerId)) continue;
      if (move.targetParentId === null) parentMap.set(move.layerId, null);
      else if (this.layers.has(move.targetParentId) && !wouldIntroduceCycle(move.layerId, move.targetParentId)) {
        parentMap.set(move.layerId, move.targetParentId);
      }
    }
    for (const [layerId, rec] of this.layers.entries()) rec.resolvedParentId = parentMap.get(layerId) ?? null;
    this.treeMovesDirty = false;
  }

  private toSnapshot(rec: InternalLayerRecord): CollabLayerSnapshot {
    return {
      layerId: rec.layerId, layerKind: rec.layerKind.value, parentId: rec.resolvedParentId,
      name: rec.name.value, zOrderKey: rec.zOrderKey.value, opacity: rec.opacity.value,
      blendMode: rec.blendMode.value, visible: rec.visible.value, locked: rec.locked.value,
      clippingMask: rec.clippingMask.value, deleted: rec.deleted.value,
    };
  }
}
