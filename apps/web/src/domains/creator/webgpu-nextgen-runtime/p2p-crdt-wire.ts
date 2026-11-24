/**
 * P2P WebRTC DataChannel · WebTransport용 CRDT 바이너리 델타 패킷화기 및 자동 압축기.
 */

import { computeCrc32, computeFnv1a32 } from "./zero-copy-tile-ring";

export type P2pTransportKind = "webrtc-datachannel" | "webtransport-stream";

export type CrdtSyncOperation =
  | {
      readonly kind: "stroke-append";
      readonly opId: string;
      readonly entityId: string;
      readonly layerId: string;
      readonly brushId: string;
      readonly pointCount: number;
      readonly pressureAvg: number;
    }
  | {
      readonly kind: "stroke-erase";
      readonly opId: string;
      readonly entityId: string;
      readonly layerId: string;
    }
  | {
      readonly kind: "scene-transform";
      readonly opId: string;
      readonly entityId: string;
      readonly position: readonly [number, number, number];
      readonly rotationDeg: readonly [number, number, number];
      readonly scale: number;
    }
  | {
      readonly kind: "lod-override";
      readonly opId: string;
      readonly entityId: string;
      readonly maxLod: 0 | 1 | 2 | 3;
    };

export interface CrdtDeltaPacket {
  readonly packetId: string;
  readonly originPeerId: string;
  readonly originSeq: number;
  readonly lamportClock: number;
  readonly transport: P2pTransportKind;
  readonly compacted: boolean;
  readonly vectorClock: Readonly<Record<string, number>>;
  readonly operations: readonly CrdtSyncOperation[];
}

export interface CompactBatchResult {
  readonly compactedOps: readonly CrdtSyncOperation[];
  readonly droppedRedundantCount: number;
}

export interface EncodedCrdtWireFrame {
  readonly bytes: Uint8Array;
  readonly rawUncompactedBytes: number;
  readonly wireBytes: number;
  readonly savedBytes: number;
  readonly compactionRatio: number;
  readonly crc32: number;
  readonly fnv1a32: number;
}

export interface DecodedCrdtWireResult {
  readonly ok: boolean;
  readonly errorReason: string | null;
  readonly packet: CrdtDeltaPacket | null;
}

const CRDT_WIRE_MAGIC_0 = 0x54; // 'T'
const CRDT_WIRE_MAGIC_1 = 0x50; // 'P'
const CRDT_WIRE_VERSION = 1;
const CRDT_WIRE_HEADER_BYTES = 16;
const CRDT_WIRE_TRAILER_BYTES = 8;

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

/**
 * 동일 엔티티에 대한 연속 트랜스폼/LOD 갱신과 생성 직후 삭제된 스트로크를 자동 압축한다.
 */
export function compactCrdtOperations(ops: readonly CrdtSyncOperation[]): CompactBatchResult {
  const latestTransformIndex = new Map<string, number>();
  const latestLodIndex = new Map<string, number>();
  const erasedStrokeIds = new Set<string>();

  for (let i = 0; i < ops.length; i += 1) {
    const op = ops[i];
    if (!op) continue;
    if (op.kind === "scene-transform") {
      latestTransformIndex.set(op.entityId, i);
    } else if (op.kind === "lod-override") {
      latestLodIndex.set(op.entityId, i);
    } else if (op.kind === "stroke-erase") {
      erasedStrokeIds.add(op.entityId);
    }
  }

  const compactedOps: CrdtSyncOperation[] = [];
  for (let i = 0; i < ops.length; i += 1) {
    const op = ops[i];
    if (!op) continue;
    if (op.kind === "scene-transform" && latestTransformIndex.get(op.entityId) !== i) {
      continue;
    }
    if (op.kind === "lod-override" && latestLodIndex.get(op.entityId) !== i) {
      continue;
    }
    if (op.kind === "stroke-append" && erasedStrokeIds.has(op.entityId)) {
      continue;
    }
    compactedOps.push(op);
  }

  return {
    compactedOps,
    droppedRedundantCount: ops.length - compactedOps.length,
  };
}

function packCompactJson(packet: CrdtDeltaPacket, operations: readonly CrdtSyncOperation[]): Uint8Array {
  const compactPayload = {
    i: packet.packetId,
    p: packet.originPeerId,
    vc: packet.vectorClock,
    o: operations.map((op) => {
      if (op.kind === "stroke-append") {
        return ["sa", op.opId, op.entityId, op.layerId, op.brushId, op.pointCount, op.pressureAvg];
      }
      if (op.kind === "stroke-erase") {
        return ["se", op.opId, op.entityId, op.layerId];
      }
      if (op.kind === "scene-transform") {
        return ["st", op.opId, op.entityId, op.position, op.rotationDeg, op.scale];
      }
      return ["lo", op.opId, op.entityId, op.maxLod];
    }),
  };
  return utf8Encoder.encode(JSON.stringify(compactPayload));
}

/**
 * WebRTC DataChannel / WebTransport 전송용 바이너리 CRDT 델타 프레임을 인코딩한다.
 * `[Magic(2) | Ver(1) | Flags(1) | Seq(4) | Lamport(4) | Len(4) | Payload(Len) | CRC32(4) | FNV1a(4)]`
 */
export function encodeCrdtDeltaPacket(
  packet: CrdtDeltaPacket,
  options: { readonly enableCompaction?: boolean } = {},
): EncodedCrdtWireFrame {
  const enableCompaction = options.enableCompaction !== false;
  const rawPayloadBytes = utf8Encoder.encode(JSON.stringify(packet));
  const rawUncompactedBytes =
    CRDT_WIRE_HEADER_BYTES + rawPayloadBytes.byteLength + CRDT_WIRE_TRAILER_BYTES;

  const compaction = enableCompaction
    ? compactCrdtOperations(packet.operations)
    : { compactedOps: packet.operations, droppedRedundantCount: 0 };
  const payloadBytes = packCompactJson(packet, compaction.compactedOps);

  const totalLength = CRDT_WIRE_HEADER_BYTES + payloadBytes.byteLength + CRDT_WIRE_TRAILER_BYTES;
  const frame = new Uint8Array(totalLength);
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);

  const transportBit = packet.transport === "webtransport-stream" ? 0x01 : 0x00;
  const compactedBit = compaction.droppedRedundantCount > 0 || packet.compacted ? 0x02 : 0x00;

  frame[0] = CRDT_WIRE_MAGIC_0;
  frame[1] = CRDT_WIRE_MAGIC_1;
  frame[2] = CRDT_WIRE_VERSION;
  frame[3] = transportBit | compactedBit;
  view.setUint32(4, packet.originSeq >>> 0, true);
  view.setUint32(8, packet.lamportClock >>> 0, true);
  view.setUint32(12, payloadBytes.byteLength >>> 0, true);
  frame.set(payloadBytes, CRDT_WIRE_HEADER_BYTES);

  const checksumEnd = CRDT_WIRE_HEADER_BYTES + payloadBytes.byteLength;
  const crc32 = computeCrc32(frame, checksumEnd);
  const fnv1a32 = computeFnv1a32(frame, checksumEnd);
  view.setUint32(checksumEnd, crc32, true);
  view.setUint32(checksumEnd + 4, fnv1a32, true);

  const savedBytes = Math.max(0, rawUncompactedBytes - totalLength);
  const compactionRatio =
    rawUncompactedBytes > 0 ? Number((totalLength / rawUncompactedBytes).toFixed(4)) : 1;

  return {
    bytes: frame,
    rawUncompactedBytes,
    wireBytes: totalLength,
    savedBytes,
    compactionRatio,
    crc32,
    fnv1a32,
  };
}

/** 바이너리 CRDT 델타 프레임을 무결성 검증(CRC32 + FNV-1a) 후 디코딩한다. */
export function decodeCrdtDeltaPacket(frame: Uint8Array): DecodedCrdtWireResult {
  if (frame.byteLength < CRDT_WIRE_HEADER_BYTES + CRDT_WIRE_TRAILER_BYTES) {
    return { ok: false, errorReason: "frame-too-short", packet: null };
  }
  if (frame[0] !== CRDT_WIRE_MAGIC_0 || frame[1] !== CRDT_WIRE_MAGIC_1) {
    return { ok: false, errorReason: "invalid-magic", packet: null };
  }
  if (frame[2] !== CRDT_WIRE_VERSION) {
    return { ok: false, errorReason: "unsupported-version", packet: null };
  }

  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  const flags = frame[3] ?? 0;
  const originSeq = view.getUint32(4, true);
  const lamportClock = view.getUint32(8, true);
  const payloadLen = view.getUint32(12, true);
  const expectedTotal = CRDT_WIRE_HEADER_BYTES + payloadLen + CRDT_WIRE_TRAILER_BYTES;
  if (expectedTotal !== frame.byteLength) {
    return { ok: false, errorReason: "payload-length-mismatch", packet: null };
  }

  const checksumEnd = CRDT_WIRE_HEADER_BYTES + payloadLen;
  const expectedCrc32 = view.getUint32(checksumEnd, true);
  const expectedFnv1a32 = view.getUint32(checksumEnd + 4, true);
  const actualCrc32 = computeCrc32(frame, checksumEnd);
  const actualFnv1a32 = computeFnv1a32(frame, checksumEnd);
  if (actualCrc32 !== expectedCrc32 || actualFnv1a32 !== expectedFnv1a32) {
    return { ok: false, errorReason: "checksum-mismatch", packet: null };
  }

  try {
    const payloadSlice = frame.subarray(CRDT_WIRE_HEADER_BYTES, checksumEnd);
    const parsed = JSON.parse(utf8Decoder.decode(payloadSlice)) as {
      readonly i?: unknown;
      readonly p?: unknown;
      readonly vc?: unknown;
      readonly o?: unknown;
    };
    if (
      typeof parsed.i !== "string" ||
      typeof parsed.p !== "string" ||
      typeof parsed.vc !== "object" ||
      parsed.vc === null ||
      !Array.isArray(parsed.o)
    ) {
      return { ok: false, errorReason: "malformed-payload", packet: null };
    }

    const vectorClock: Record<string, number> = {};
    for (const [key, val] of Object.entries(parsed.vc as Record<string, unknown>)) {
      if (typeof val === "number" && Number.isFinite(val)) {
        vectorClock[key] = Math.max(0, Math.floor(val));
      }
    }

    const operations: CrdtSyncOperation[] = [];
    for (const tuple of parsed.o) {
      if (!Array.isArray(tuple) || typeof tuple[0] !== "string") continue;
      const tag = tuple[0];
      if (tag === "sa" && tuple.length >= 7) {
        operations.push({
          kind: "stroke-append",
          opId: String(tuple[1]),
          entityId: String(tuple[2]),
          layerId: String(tuple[3]),
          brushId: String(tuple[4]),
          pointCount: Number(tuple[5]),
          pressureAvg: Number(tuple[6]),
        });
      } else if (tag === "se" && tuple.length >= 4) {
        operations.push({
          kind: "stroke-erase",
          opId: String(tuple[1]),
          entityId: String(tuple[2]),
          layerId: String(tuple[3]),
        });
      } else if (
        tag === "st" &&
        tuple.length >= 6 &&
        Array.isArray(tuple[3]) &&
        Array.isArray(tuple[4])
      ) {
        const pos = tuple[3] as readonly number[];
        const rot = tuple[4] as readonly number[];
        operations.push({
          kind: "scene-transform",
          opId: String(tuple[1]),
          entityId: String(tuple[2]),
          position: [Number(pos[0] ?? 0), Number(pos[1] ?? 0), Number(pos[2] ?? 0)],
          rotationDeg: [Number(rot[0] ?? 0), Number(rot[1] ?? 0), Number(rot[2] ?? 0)],
          scale: Number(tuple[5]),
        });
      } else if (tag === "lo" && tuple.length >= 4) {
        const clampedLod = Math.max(0, Math.min(3, Math.floor(Number(tuple[3])))) as 0 | 1 | 2 | 3;
        operations.push({
          kind: "lod-override",
          opId: String(tuple[1]),
          entityId: String(tuple[2]),
          maxLod: clampedLod,
        });
      }
    }

    const transport: P2pTransportKind =
      (flags & 0x01) !== 0 ? "webtransport-stream" : "webrtc-datachannel";

    return {
      ok: true,
      errorReason: null,
      packet: {
        packetId: parsed.i,
        originPeerId: parsed.p,
        originSeq,
        lamportClock,
        transport,
        compacted: (flags & 0x02) !== 0,
        vectorClock,
        operations,
      },
    };
  } catch {
    return { ok: false, errorReason: "json-parse-failed", packet: null };
  }
}
