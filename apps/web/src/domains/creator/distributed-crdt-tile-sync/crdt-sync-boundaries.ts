/** 메모리 CRDT 예제의 입력·시계·패킷 경계. 실제 전송이나 압축은 수행하지 않는다. */
import type { CrdtDeltaPacket, HlcTimestamp, PeerId, StudioLayerId, StrokeOpKind, SyncTransportChannel, TileKey, TileStrokeOp } from "./crdt-tile-sync-engine";

export const CRDT_SYNC_LIMITS = { maxOps: 4096, maxBatchOps: 8192, maxPacketBytes: 1024 * 1024 } as const;
const TILE_RGBA_BYTES = 256 * 256 * 4;
const FNV1A_OFFSET_A = 2166136261;
const FNV1A_OFFSET_B = 2654435761;
const FNV1A_PRIME = 16777619;
const round2 = (value: number): number => Math.round(value * 100) / 100;
const safeInt = (n: number, max = Number.MAX_SAFE_INTEGER, min = 0): boolean => Number.isSafeInteger(n) && n >= min && n <= max;
export const isPeerId = (v: string): v is PeerId => ["lead-artist", "lineart-assist", "color-assist", "lettering-assist"].includes(v);
function safeText(v: string, max: number): boolean {
  return typeof v === "string" && v.length > 0 && v.length <= max && !v.includes("|") && Array.from(v).every((c) => c.charCodeAt(0) >= 32);
}
export function assertLocalStrokeText(brushCode: string, seed: string | undefined): void {
  if (!safeText(brushCode, 128) || (seed !== undefined && (typeof seed !== "string" || seed.length > 4096))) throw new RangeError("invalid-local-stroke-text");
}
function assertClock(clock: HlcTimestamp): void {
  if (!safeInt(clock.physicalMs) || !safeInt(clock.logical) || !isPeerId(clock.nodeId)) throw new RangeError("invalid-hlc");
}
function advanceClock(physicalMs: number, logical: number, nodeId: PeerId): HlcTimestamp {
  if (logical < Number.MAX_SAFE_INTEGER) return { physicalMs, logical: logical + 1, nodeId };
  if (physicalMs < Number.MAX_SAFE_INTEGER) return { physicalMs: physicalMs + 1, logical: 0, nodeId };
  throw new RangeError("hlc-capacity-exceeded");
}
export function assertTileOp(op: TileStrokeOp): void {
  assertClock(op.hlc);
  if (!isPeerId(op.authorId) || op.hlc.nodeId !== op.authorId || !parseLayerId(op.layerId) || !parseStrokeKind(op.kind)
    || !safeInt(op.tileX, 3) || !safeInt(op.tileY, 3) || op.tileKey !== `tile:${op.tileX}:${op.tileY}`
    || !safeInt(op.pointCount, 512, 1) || !safeInt(op.opacityQ8, 255)
    || !safeInt(op.rawJsonBytes, 1000000, 1) || !safeInt(op.payloadBytes, 1000000, 1)
    || !safeText(op.opId, 256) || !safeText(op.brushCode, 128) || !safeText(op.strokeHash, 128)) throw new RangeError("invalid-tile-op");
}
function operationSignature(op: TileStrokeOp): string {
  return [op.opId, op.authorId, op.layerId, op.tileX, op.tileY, op.hlc.physicalMs, op.hlc.logical, op.hlc.nodeId, op.kind, op.brushCode, op.strokeHash, op.pointCount, op.opacityQ8, op.rawJsonBytes, op.payloadBytes].join("|");
}
export function assertOperationBatch(ops: readonly TileStrokeOp[]): void {
  if (!Array.isArray(ops) || ops.length > CRDT_SYNC_LIMITS.maxBatchOps) throw new RangeError("operation-batch-capacity-exceeded");
  const byId = new Map<string, string>();
  for (const op of ops) {
    assertTileOp(op);
    const signature = operationSignature(op);
    const existing = byId.get(op.opId);
    if (existing !== undefined && existing !== signature) throw new Error("conflicting-operation-id");
    byId.set(op.opId, signature);
  }
}
export function collectUniqueOps(groups: readonly (readonly TileStrokeOp[])[]): readonly TileStrokeOp[] {
  const byId = new Map<string, TileStrokeOp>();
  for (const group of groups) {
    assertOperationBatch(group);
    for (const op of group) {
      const existing = byId.get(op.opId);
      if (existing) assertOperationBatch([existing, op]);
      byId.set(op.opId, op);
      if (byId.size > CRDT_SYNC_LIMITS.maxOps) throw new RangeError("peer-capacity-exceeded");
    }
  }
  return Array.from(byId.values());
}
function packetSize(payload: string): number { return new TextEncoder().encode(payload).byteLength; }
function fnv1aLane(input: string, offset: number): string {
  let hash = offset;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, FNV1A_PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
export const fnv1a32Hex = (input: string): string => fnv1aLane(input, FNV1A_OFFSET_A);
export const fnv1a64Hex = (input: string): string => `${fnv1aLane(input, FNV1A_OFFSET_A)}${fnv1aLane(`${input}|lane-b`, FNV1A_OFFSET_B)}`;

export function compareHlc(a: HlcTimestamp, b: HlcTimestamp): -1 | 0 | 1 {
  assertClock(a); assertClock(b);
  if (a.physicalMs !== b.physicalMs) return a.physicalMs < b.physicalMs ? -1 : 1;
  if (a.logical !== b.logical) return a.logical < b.logical ? -1 : 1;
  if (a.nodeId !== b.nodeId) return a.nodeId < b.nodeId ? -1 : 1;
  return 0;
}
export const formatHlc = (hlc: HlcTimestamp): string => `${hlc.physicalMs}:${hlc.logical}@${hlc.nodeId}`;

export function tickHlcLocal(clock: HlcTimestamp, nowPhysicalMs: number): HlcTimestamp {
  assertClock(clock);
  const safeNow = Number.isFinite(nowPhysicalMs) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(nowPhysicalMs))) : clock.physicalMs;
  return safeNow > clock.physicalMs ? { physicalMs: safeNow, logical: 0, nodeId: clock.nodeId } : advanceClock(clock.physicalMs, clock.logical, clock.nodeId);
}
export function receiveHlcRemote(localClock: HlcTimestamp, remoteHlc: HlcTimestamp, nowPhysicalMs: number): HlcTimestamp {
  assertClock(localClock); assertClock(remoteHlc);
  const safeNow = Number.isFinite(nowPhysicalMs) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(nowPhysicalMs))) : localClock.physicalMs;
  const physicalMs = Math.max(localClock.physicalMs, remoteHlc.physicalMs, safeNow);
  if (physicalMs > localClock.physicalMs && physicalMs > remoteHlc.physicalMs) return { physicalMs, logical: 0, nodeId: localClock.nodeId };
  const logical = physicalMs === localClock.physicalMs && physicalMs === remoteHlc.physicalMs ? Math.max(localClock.logical, remoteHlc.logical) : physicalMs === localClock.physicalMs ? localClock.logical : remoteHlc.logical;
  return advanceClock(physicalMs, logical, localClock.nodeId);
}

export function compareTileStrokeOp(a: TileStrokeOp, b: TileStrokeOp): number {
  const hlcCmp = compareHlc(a.hlc, b.hlc);
  return hlcCmp !== 0 ? hlcCmp : a.opId === b.opId ? 0 : a.opId < b.opId ? -1 : 1;
}

export function serializeDeltaPacket(ops: readonly TileStrokeOp[], transportChannel: SyncTransportChannel): CrdtDeltaPacket {
  assertOperationBatch(ops);
  if (!["webrtc-datachannel", "websocket-relay", "opfs-offline-queue"].includes(transportChannel)) throw new Error("invalid-transport");
  if (ops.length > CRDT_SYNC_LIMITS.maxOps) throw new RangeError("packet-operation-capacity-exceeded");
  const sorted = [...ops].sort(compareTileStrokeOp);
  let rawJsonBytes = 0;
  let compressedDeltaBytes = 0;
  const distinctTiles = new Set<TileKey>();
  const lines: string[] = [];
  for (const op of sorted) {
    rawJsonBytes += op.rawJsonBytes;
    compressedDeltaBytes += op.payloadBytes;
    distinctTiles.add(op.tileKey);
    lines.push([op.opId, op.authorId, op.layerId, op.tileX, op.tileY, op.hlc.physicalMs, op.hlc.logical, op.hlc.nodeId, op.kind, op.brushCode, op.strokeHash, op.pointCount, op.opacityQ8, op.rawJsonBytes, op.payloadBytes].join("|"));
  }
  const encodedPayload = lines.join("\n");
  if (packetSize(encodedPayload) > CRDT_SYNC_LIMITS.maxPacketBytes) throw new RangeError("packet-size-exceeded");
  return {
    compressionApplied: false, accountingKind: "modeled-uncompressed-metadata", encodedPayloadBytes: packetSize(encodedPayload),
    packetVersion: "toonstudio.crdt-delta.v1", transportChannel, opCount: sorted.length, rawJsonBytes, compressedDeltaBytes,
    fullTileRawBytes: distinctTiles.size * TILE_RGBA_BYTES, compressionRatio: compressedDeltaBytes > 0 ? round2(rawJsonBytes / compressedDeltaBytes) : 1,
    packetHash: fnv1a64Hex(`${transportChannel}|${sorted.length}|${encodedPayload}`), encodedPayload,
  };
}

function parsePeerId(raw: string | undefined): PeerId | null {
  return raw === "lead-artist" || raw === "lineart-assist" || raw === "color-assist" || raw === "lettering-assist" ? raw : null;
}
function parseLayerId(raw: string | undefined): StudioLayerId | null {
  return raw === "layer-storyboard" || raw === "layer-ink" || raw === "layer-color" || raw === "layer-sfx-text" ? raw : null;
}
function parseStrokeKind(raw: string | undefined): StrokeOpKind | null {
  return raw === "stroke-add" || raw === "stroke-erase" || raw === "tile-fill" ? raw : null;
}

export function deserializeDeltaPacket(packet: CrdtDeltaPacket): { readonly ok: true; readonly ops: readonly TileStrokeOp[] } | { readonly ok: false; readonly reason: string } {
  if (packet.packetVersion !== "toonstudio.crdt-delta.v1" || typeof packet.encodedPayload !== "string"
    || packet.encodedPayload.length > CRDT_SYNC_LIMITS.maxPacketBytes || packetSize(packet.encodedPayload) > CRDT_SYNC_LIMITS.maxPacketBytes
    || !safeInt(packet.opCount, CRDT_SYNC_LIMITS.maxOps)) return { ok: false, reason: "invalid-packet-boundary" };
  if (fnv1a64Hex(`${packet.transportChannel}|${packet.opCount}|${packet.encodedPayload}`) !== packet.packetHash) return { ok: false, reason: "checksum-mismatch" };
  const ops: TileStrokeOp[] = [];
  try {
    for (const line of packet.encodedPayload ? packet.encodedPayload.split("\n") : []) {
      const p = line.split("|");
      const authorId = parsePeerId(p[1]); const layerId = parseLayerId(p[2]);
      const nodeId = parsePeerId(p[7]); const kind = parseStrokeKind(p[8]);
      if (p.length !== 15 || !authorId || !layerId || !nodeId || !kind) return { ok: false, reason: "malformed-delta-frame" };
      const numbers = [3, 4, 5, 6, 11, 12, 13, 14].map((i) => Number(p[i]));
      if (numbers.some((n) => !Number.isSafeInteger(n)) || [3, 4, 5, 6, 11, 12, 13, 14].some((i) => p[i]?.trim() === "")) return { ok: false, reason: "invalid-delta-number" };
      const tileX = Number(p[3]); const tileY = Number(p[4]);
      ops.push({ opId: p[0] ?? "", authorId, layerId, tileX, tileY, tileKey: `tile:${tileX}:${tileY}`,
        hlc: { physicalMs: Number(p[5]), logical: Number(p[6]), nodeId }, kind, brushCode: p[9] ?? "", strokeHash: p[10] ?? "",
        pointCount: Number(p[11]), opacityQ8: Number(p[12]), rawJsonBytes: Number(p[13]), payloadBytes: Number(p[14]) });
    }
    const expected = serializeDeltaPacket(ops, packet.transportChannel);
    if (["opCount", "rawJsonBytes", "compressedDeltaBytes", "fullTileRawBytes", "compressionRatio"].some((key) => Reflect.get(expected, key) !== Reflect.get(packet, key))) return { ok: false, reason: "packet-metadata-mismatch" };
    return { ok: true, ops };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "invalid-delta-frame" };
  }
}
