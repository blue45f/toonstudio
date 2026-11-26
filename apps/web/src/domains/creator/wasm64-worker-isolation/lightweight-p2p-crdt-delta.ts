/**
 * 경량 28바이트 바이너리 P2P CRDT 스트로크 델타 코덱 및 결정론적 로그.
 *
 * - 고정 28바이트 Little-Endian 패킷(JSON ~180~240B 대비 약 85% 대역폭 절감)으로
 *   WebRTC DataChannel P2P 협업 트래픽과 Cloudflare Durable Objects 동기화 부하를 절감한다.
 * - Lamport 논리 시계와 `(lamportTs, peerId, opSeq)` 전순서 타이브레이커로
 *   교환법칙(`merge(A, B) === merge(B, A)`), 결합법칙, 멱등성(중복 패킷 무효화)을 보장한다.
 *
 * 패킷 레이아웃(28B LE):
 *  [0] version(hi4=1)|kind(lo4) · [1] layerIndex(u8) · [2..3] peerId(u16) ·
 *  [4..7] lamportTs(u32) · [8..11] opSeq(u32) · [12..15] strokeId(u32) ·
 *  [16..19] x(f32) · [20..23] y(f32) · [24..25] pressure(u16) · [26..27] brushWidth(Q10.6 u16)
 */

export const CRDT_STROKE_OP_BYTE_LENGTH = 28;
export const CRDT_PACKET_VERSION = 1;
export const CRDT_PRESSURE_SCALE = 65535;
export const CRDT_BRUSH_WIDTH_SCALE = 64;
export const CRDT_MAX_BRUSH_WIDTH = 65535 / CRDT_BRUSH_WIDTH_SCALE;

export const CrdtStrokeOpKind = {
  StrokeBegin: 0,
  StrokePoint: 1,
  StrokeEnd: 2,
  StrokeUndo: 3,
  StrokeRedo: 4,
  LayerClear: 5,
} as const;

export type CrdtStrokeOpKindValue = (typeof CrdtStrokeOpKind)[keyof typeof CrdtStrokeOpKind];

const CRDT_OP_KIND_NAMES: Record<CrdtStrokeOpKindValue, string> = {
  [CrdtStrokeOpKind.StrokeBegin]: "stroke-begin",
  [CrdtStrokeOpKind.StrokePoint]: "stroke-point",
  [CrdtStrokeOpKind.StrokeEnd]: "stroke-end",
  [CrdtStrokeOpKind.StrokeUndo]: "stroke-undo",
  [CrdtStrokeOpKind.StrokeRedo]: "stroke-redo",
  [CrdtStrokeOpKind.LayerClear]: "layer-clear",
};

export interface CrdtStrokeOp {
  readonly kind: CrdtStrokeOpKindValue;
  readonly layerIndex: number;
  readonly peerId: number;
  readonly lamportTs: number;
  readonly opSeq: number;
  readonly strokeId: number;
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly brushWidth: number;
}

export interface CrdtLocalStrokeOpInput {
  readonly kind: CrdtStrokeOpKindValue;
  readonly layerIndex?: number;
  readonly strokeId: number;
  readonly x?: number;
  readonly y?: number;
  readonly pressure?: number;
  readonly brushWidth?: number;
}

export interface CrdtMaterializedPoint {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly brushWidth: number;
  readonly lamportTs: number;
  readonly peerId: number;
  readonly opSeq: number;
}

export interface CrdtMaterializedStroke {
  readonly strokeId: number;
  readonly layerIndex: number;
  readonly peerId: number;
  readonly startedAtLamportTs: number;
  readonly ended: boolean;
  readonly active: boolean;
  readonly points: readonly CrdtMaterializedPoint[];
}

export interface CrdtBandwidthReport {
  readonly opCount: number;
  readonly binaryBytes: number;
  readonly jsonBytes: number;
  readonly bytesSaved: number;
  readonly compressionRatio: number;
  readonly reductionPercent: number;
}

function assertUintRange(value: number, max: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new RangeError(`${label} must be an integer in [0, ${max}] (got ${value})`);
  }
}

function assertFiniteFloat(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite (got ${value})`);
  return Object.is(value, -0) ? 0 : value;
}

const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

export function compareCrdtStrokeOps(a: CrdtStrokeOp, b: CrdtStrokeOp): number {
  if (a.lamportTs !== b.lamportTs) return a.lamportTs - b.lamportTs;
  if (a.peerId !== b.peerId) return a.peerId - b.peerId;
  return a.opSeq - b.opSeq;
}

export function getCrdtStrokeOpKey(
  op: Pick<CrdtStrokeOp, "lamportTs" | "peerId" | "opSeq">,
): string {
  return `${op.lamportTs}:${op.peerId}:${op.opSeq}`;
}

export function encodeCrdtStrokeOp(
  op: CrdtStrokeOp,
  target?: Uint8Array,
  byteOffset = 0,
): Uint8Array {
  assertUintRange(op.kind, CrdtStrokeOpKind.LayerClear, "kind");
  assertUintRange(op.layerIndex, 0xff, "layerIndex");
  assertUintRange(op.peerId, 0xffff, "peerId");
  assertUintRange(op.lamportTs, 0xffffffff, "lamportTs");
  assertUintRange(op.opSeq, 0xffffffff, "opSeq");
  assertUintRange(op.strokeId, 0xffffffff, "strokeId");

  const x = assertFiniteFloat(op.x, "x");
  const y = assertFiniteFloat(op.y, "y");
  const pressure = clamp(assertFiniteFloat(op.pressure, "pressure"), 0, 1);
  const brushWidth = clamp(assertFiniteFloat(op.brushWidth, "brushWidth"), 0, CRDT_MAX_BRUSH_WIDTH);
  const out = target ?? new Uint8Array(CRDT_STROKE_OP_BYTE_LENGTH);
  if (!Number.isInteger(byteOffset) || byteOffset < 0 || byteOffset + CRDT_STROKE_OP_BYTE_LENGTH > out.byteLength) {
    throw new RangeError(`Target buffer too small for 28B packet at offset ${byteOffset}`);
  }

  const view = new DataView(out.buffer, out.byteOffset + byteOffset, CRDT_STROKE_OP_BYTE_LENGTH);
  view.setUint8(0, ((CRDT_PACKET_VERSION & 0x0f) << 4) | (op.kind & 0x0f));
  view.setUint8(1, op.layerIndex);
  view.setUint16(2, op.peerId, true);
  view.setUint32(4, op.lamportTs, true);
  view.setUint32(8, op.opSeq, true);
  view.setUint32(12, op.strokeId, true);
  view.setFloat32(16, x, true);
  view.setFloat32(20, y, true);
  view.setUint16(24, Math.round(pressure * CRDT_PRESSURE_SCALE), true);
  view.setUint16(26, Math.round(brushWidth * CRDT_BRUSH_WIDTH_SCALE), true);
  return target ? out.subarray(byteOffset, byteOffset + CRDT_STROKE_OP_BYTE_LENGTH) : out;
}

export function decodeCrdtStrokeOp(bytes: Uint8Array, byteOffset = 0): CrdtStrokeOp {
  if (!Number.isInteger(byteOffset) || byteOffset < 0 || byteOffset + CRDT_STROKE_OP_BYTE_LENGTH > bytes.byteLength) {
    throw new RangeError(`Invalid 28B CRDT packet slice at offset ${byteOffset} (len ${bytes.byteLength})`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset + byteOffset, CRDT_STROKE_OP_BYTE_LENGTH);
  const header = view.getUint8(0);
  const version = (header >>> 4) & 0x0f;
  if (version !== CRDT_PACKET_VERSION) throw new RangeError(`Unsupported CRDT packet version: ${version}`);
  const rawKind = header & 0x0f;
  if (rawKind > CrdtStrokeOpKind.LayerClear) throw new RangeError(`Unknown CRDT stroke op kind: ${rawKind}`);
  const rawX = view.getFloat32(16, true);
  const rawY = view.getFloat32(20, true);
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
    throw new RangeError(`Non-finite decoded CRDT coordinates (${rawX}, ${rawY})`);
  }
  return {
    kind: rawKind as CrdtStrokeOpKindValue,
    layerIndex: view.getUint8(1),
    peerId: view.getUint16(2, true),
    lamportTs: view.getUint32(4, true),
    opSeq: view.getUint32(8, true),
    strokeId: view.getUint32(12, true),
    x: Object.is(rawX, -0) ? 0 : rawX,
    y: Object.is(rawY, -0) ? 0 : rawY,
    pressure: view.getUint16(24, true) / CRDT_PRESSURE_SCALE,
    brushWidth: view.getUint16(26, true) / CRDT_BRUSH_WIDTH_SCALE,
  };
}

export function encodeCrdtStrokeBatch(ops: readonly CrdtStrokeOp[]): Uint8Array {
  const out = new Uint8Array(ops.length * CRDT_STROKE_OP_BYTE_LENGTH);
  for (let i = 0; i < ops.length; i += 1) {
    const op = ops[i];
    if (op) encodeCrdtStrokeOp(op, out, i * CRDT_STROKE_OP_BYTE_LENGTH);
  }
  return out;
}

export function decodeCrdtStrokeBatch(bytes: Uint8Array): CrdtStrokeOp[] {
  if (bytes.byteLength % CRDT_STROKE_OP_BYTE_LENGTH !== 0) {
    throw new RangeError(`CRDT batch byteLength (${bytes.byteLength}) must be a multiple of 28`);
  }
  const count = bytes.byteLength / CRDT_STROKE_OP_BYTE_LENGTH;
  const ops: CrdtStrokeOp[] = new Array<CrdtStrokeOp>(count);
  for (let i = 0; i < count; i += 1) ops[i] = decodeCrdtStrokeOp(bytes, i * CRDT_STROKE_OP_BYTE_LENGTH);
  return ops;
}

export function serializeCrdtOpAsJsonBaseline(op: CrdtStrokeOp): string {
  return JSON.stringify({
    version: CRDT_PACKET_VERSION,
    kind: CRDT_OP_KIND_NAMES[op.kind],
    layerIndex: op.layerIndex,
    peerId: `peer-${op.peerId}`,
    lamportTs: op.lamportTs,
    opSeq: op.opSeq,
    strokeId: `stroke-${op.strokeId}`,
    x: Number(op.x.toFixed(3)),
    y: Number(op.y.toFixed(3)),
    pressure: Number(op.pressure.toFixed(5)),
    brushWidth: Number(op.brushWidth.toFixed(3)),
  });
}

export function measureCrdtBandwidthSavings(ops: readonly CrdtStrokeOp[]): CrdtBandwidthReport {
  const binaryBytes = ops.length * CRDT_STROKE_OP_BYTE_LENGTH;
  const jsonBytes = new TextEncoder().encode(`[${ops.map(serializeCrdtOpAsJsonBaseline).join(",")}]`).byteLength;
  const bytesSaved = Math.max(0, jsonBytes - binaryBytes);
  return {
    opCount: ops.length,
    binaryBytes,
    jsonBytes,
    bytesSaved,
    compressionRatio: jsonBytes > 0 ? binaryBytes / jsonBytes : 1,
    reductionPercent: jsonBytes > 0 ? (bytesSaved / jsonBytes) * 100 : 0,
  };
}

export class LightweightCrdtStrokeLog {
  private readonly peerId: number;
  private lamportClock: number;
  private localOpSeq = 0;
  private readonly orderedOps: CrdtStrokeOp[] = [];
  private readonly seenKeys = new Set<string>();
  private readonly peerMaxSeq = new Map<number, number>();

  constructor(peerId: number, initialLamportTs = 0) {
    assertUintRange(peerId, 0xffff, "peerId");
    assertUintRange(initialLamportTs, 0xffffffff, "initialLamportTs");
    this.peerId = peerId;
    this.lamportClock = initialLamportTs;
  }

  getPeerId(): number { return this.peerId; }
  getLamportClock(): number { return this.lamportClock; }
  getLocalOpSeq(): number { return this.localOpSeq; }
  size(): number { return this.orderedOps.length; }
  getOrderedOps(): readonly CrdtStrokeOp[] { return this.orderedOps; }
  exportCanonicalBinary(): Uint8Array { return encodeCrdtStrokeBatch(this.orderedOps); }
  getPeerSeqVector(): ReadonlyMap<number, number> { return new Map(this.peerMaxSeq); }

  createLocalOp(input: CrdtLocalStrokeOpInput): { readonly op: CrdtStrokeOp; readonly packet: Uint8Array } {
    this.lamportClock += 1;
    this.localOpSeq += 1;
    const packet = encodeCrdtStrokeOp({
      kind: input.kind, layerIndex: input.layerIndex ?? 0, peerId: this.peerId,
      lamportTs: this.lamportClock, opSeq: this.localOpSeq, strokeId: input.strokeId,
      x: input.x ?? 0, y: input.y ?? 0, pressure: input.pressure ?? 0.5, brushWidth: input.brushWidth ?? 4,
    });
    const canonical = decodeCrdtStrokeOp(packet);
    this.ingestCanonicalOp(canonical);
    return { op: canonical, packet };
  }

  applyRemoteOp(op: CrdtStrokeOp): boolean {
    return this.ingestCanonicalOp(decodeCrdtStrokeOp(encodeCrdtStrokeOp(op)));
  }

  applyRemotePacket(packet: Uint8Array, byteOffset = 0): boolean {
    return this.ingestCanonicalOp(decodeCrdtStrokeOp(packet, byteOffset));
  }

  applyRemoteBatch(batchBytes: Uint8Array): number {
    let applied = 0;
    for (const op of decodeCrdtStrokeBatch(batchBytes)) {
      if (this.ingestCanonicalOp(op)) applied += 1;
    }
    return applied;
  }

  merge(other: LightweightCrdtStrokeLog): number {
    if (other.lamportClock > this.lamportClock) this.lamportClock = other.lamportClock;
    let applied = 0;
    for (const op of other.orderedOps) if (this.ingestCanonicalOp(op)) applied += 1;
    return applied;
  }

  static mergeLogs(a: LightweightCrdtStrokeLog, b: LightweightCrdtStrokeLog, targetPeerId = 0): LightweightCrdtStrokeLog {
    const merged = new LightweightCrdtStrokeLog(targetPeerId);
    merged.merge(a);
    merged.merge(b);
    return merged;
  }

  exportDeltaForVector(knownPeerSeqs: ReadonlyMap<number, number>): Uint8Array {
    const delta: CrdtStrokeOp[] = [];
    for (const op of this.orderedOps) {
      if (op.opSeq > (knownPeerSeqs.get(op.peerId) ?? 0)) delta.push(op);
    }
    return encodeCrdtStrokeBatch(delta);
  }

  materializeStrokes(): readonly CrdtMaterializedStroke[] {
    const strokes = new Map<string, {
      strokeId: number; layerIndex: number; peerId: number;
      startedAtLamportTs: number; ended: boolean; active: boolean; points: CrdtMaterializedPoint[];
    }>();
    for (const op of this.orderedOps) {
      if (op.kind === CrdtStrokeOpKind.LayerClear) {
        for (const s of strokes.values()) if (s.layerIndex === op.layerIndex) s.active = false;
        continue;
      }
      const key = `${op.peerId}:${op.strokeId}`;
      let s = strokes.get(key);
      if (!s) {
        s = { strokeId: op.strokeId, layerIndex: op.layerIndex, peerId: op.peerId, startedAtLamportTs: op.lamportTs, ended: false, active: true, points: [] };
        strokes.set(key, s);
      }
      if (op.kind === CrdtStrokeOpKind.StrokeBegin || op.kind === CrdtStrokeOpKind.StrokePoint) {
        s.points.push({ x: op.x, y: op.y, pressure: op.pressure, brushWidth: op.brushWidth, lamportTs: op.lamportTs, peerId: op.peerId, opSeq: op.opSeq });
      } else if (op.kind === CrdtStrokeOpKind.StrokeEnd) s.ended = true;
      else if (op.kind === CrdtStrokeOpKind.StrokeUndo) s.active = false;
      else if (op.kind === CrdtStrokeOpKind.StrokeRedo) s.active = true;
    }
    return Array.from(strokes.values()).sort((a, b) =>
      a.startedAtLamportTs !== b.startedAtLamportTs ? a.startedAtLamportTs - b.startedAtLamportTs
        : a.peerId !== b.peerId ? a.peerId - b.peerId : a.strokeId - b.strokeId,
    );
  }

  private ingestCanonicalOp(op: CrdtStrokeOp): boolean {
    if (op.lamportTs > this.lamportClock) this.lamportClock = op.lamportTs;
    const key = getCrdtStrokeOpKey(op);
    if (this.seenKeys.has(key)) return false;
    this.seenKeys.add(key);

    if (op.opSeq > (this.peerMaxSeq.get(op.peerId) ?? 0)) this.peerMaxSeq.set(op.peerId, op.opSeq);
    if (op.peerId === this.peerId && op.opSeq > this.localOpSeq) this.localOpSeq = op.opSeq;

    const len = this.orderedOps.length;
    const last = len > 0 ? this.orderedOps[len - 1] : undefined;
    if (!last || compareCrdtStrokeOps(last, op) < 0) {
      this.orderedOps.push(op);
      return true;
    }
    let low = 0;
    let high = len;
    while (low < high) {
      const mid = (low + high) >>> 1;
      const midOp = this.orderedOps[mid];
      if (midOp && compareCrdtStrokeOps(midOp, op) < 0) low = mid + 1;
      else high = mid;
    }
    this.orderedOps.splice(low, 0, op);
    return true;
  }
}
