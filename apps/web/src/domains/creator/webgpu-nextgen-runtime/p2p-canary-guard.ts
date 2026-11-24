/**
 * P2P 분산 CRDT 델타 메시(Vector-Clock 인과 전달 · 비순차 버퍼링 · 0-충돌 수렴) 및
 * 카나리 자동 롤백 오라클 통합 파사드 (`p2p-canary-guard.ts`).
 */

import {
  compactCrdtOperations,
  decodeCrdtDeltaPacket,
  encodeCrdtDeltaPacket,
  type CrdtDeltaPacket,
  type CrdtSyncOperation,
  type P2pTransportKind,
} from "./p2p-crdt-wire";
import { computeCrc32, computeFnv1a32 } from "./zero-copy-tile-ring";

export {
  compactCrdtOperations,
  decodeCrdtDeltaPacket,
  encodeCrdtDeltaPacket,
  type CompactBatchResult,
  type CrdtDeltaPacket,
  type CrdtSyncOperation,
  type DecodedCrdtWireResult,
  type EncodedCrdtWireFrame,
  type P2pTransportKind,
} from "./p2p-crdt-wire";

export {
  CANARY_TELEMETRY_PRESETS,
  DEFAULT_CANARY_SLO_THRESHOLDS,
  evaluateCanaryReleaseHealth,
  type CanaryDerivedMetrics,
  type CanaryHealthEvaluation,
  type CanaryMetricKey,
  type CanaryPresetScenario,
  type CanaryReleaseDecision,
  type CanarySloThresholds,
  type CanaryTelemetrySnapshot,
  type CanaryTriggerReason,
  type CanaryTriggerSeverity,
} from "./canary-rollback-oracle";

export interface CrdtApplyOutcome {
  readonly status: "applied" | "buffered-out-of-order" | "duplicate";
  readonly packetId: string;
  readonly drainedBufferedCount: number;
  readonly pendingBufferSize: number;
  readonly stateDigestHex: string;
}

export interface CrdtEntityStamp {
  readonly lamport: number;
  readonly originPeerId: string;
  readonly opId: string;
}

export interface ConvergedStrokeState {
  readonly entityId: string;
  readonly layerId: string;
  readonly brushId: string;
  readonly pointCount: number;
  readonly pressureAvg: number;
  readonly erased: boolean;
  readonly stamp: CrdtEntityStamp;
}

export interface ConvergedSceneNodeState {
  readonly entityId: string;
  readonly position: readonly [number, number, number];
  readonly rotationDeg: readonly [number, number, number];
  readonly scale: number;
  readonly maxLod: 0 | 1 | 2 | 3 | null;
  readonly stamp: CrdtEntityStamp;
}

export interface P2pMeshPeerSnapshot {
  readonly peerId: string;
  readonly lamportClock: number;
  readonly vectorClock: Readonly<Record<string, number>>;
  readonly appliedPacketCount: number;
  readonly pendingBufferSize: number;
  readonly activeStrokeCount: number;
  readonly erasedStrokeCount: number;
  readonly sceneNodeCount: number;
  readonly stateDigestHex: string;
}

export interface P2pMeshConvergenceReport {
  readonly transport: P2pTransportKind;
  readonly emittedPacketCount: number;
  readonly duplicatePacketsInjected: number;
  readonly outOfOrderDeliveriesSimulated: number;
  readonly totalRawBytes: number;
  readonly totalWireBytes: number;
  readonly compactionSavedBytes: number;
  readonly compactionSavingsPct: number;
  readonly unresolvedConflictCount: number;
  readonly allPeersConverged: boolean;
  readonly convergedDigestHex: string;
  readonly peerSnapshots: readonly P2pMeshPeerSnapshot[];
}

const utf8Encoder = new TextEncoder();

function compareStamps(a: CrdtEntityStamp, b: CrdtEntityStamp): number {
  if (a.lamport !== b.lamport) return a.lamport - b.lamport;
  if (a.originPeerId !== b.originPeerId) return a.originPeerId < b.originPeerId ? -1 : 1;
  if (a.opId !== b.opId) return a.opId < b.opId ? -1 : 1;
  return 0;
}

/**
 * Vector-Clock 인과 전달 · 비순차 버퍼링 · 0-충돌 LWW 수렴을 수행하는 P2P CRDT 피어 노드.
 */
export class P2pCrdtDeltaMesh {
  readonly peerId: string;
  readonly transport: P2pTransportKind;

  private lamportClock = 0;
  private readonly peerClocks = new Map<string, number>();
  private readonly appliedPacketIds = new Set<string>();
  private readonly pendingInbound = new Map<string, CrdtDeltaPacket>();
  private readonly strokeRecords = new Map<string, ConvergedStrokeState>();
  private readonly sceneNodeRecords = new Map<string, ConvergedSceneNodeState>();

  constructor(peerId: string, transport: P2pTransportKind = "webtransport-stream") {
    this.peerId = peerId;
    this.transport = transport;
    this.peerClocks.set(peerId, 0);
  }

  /** 로컬 작업 배치를 인과 벡터 시계에 커밋하고 전송용 압축 CRDT 델타 패킷을 생성한다. */
  commitLocalBatch(operations: readonly CrdtSyncOperation[]): CrdtDeltaPacket {
    const compacted = compactCrdtOperations(operations);
    const nextSeq = (this.peerClocks.get(this.peerId) ?? 0) + 1;
    this.peerClocks.set(this.peerId, nextSeq);
    this.lamportClock += 1;

    const vectorClockSnapshot: Record<string, number> = {};
    for (const [pid, seq] of this.peerClocks.entries()) {
      vectorClockSnapshot[pid] = seq;
    }

    const packet: CrdtDeltaPacket = {
      packetId: `${this.peerId}#${nextSeq}`,
      originPeerId: this.peerId,
      originSeq: nextSeq,
      lamportClock: this.lamportClock,
      transport: this.transport,
      compacted: compacted.droppedRedundantCount > 0,
      vectorClock: vectorClockSnapshot,
      operations: compacted.compactedOps,
    };

    this.appliedPacketIds.add(packet.packetId);
    this.applyOperationsDeterministic(packet);
    return packet;
  }

  private isCausallyReady(packet: CrdtDeltaPacket): boolean {
    const currentOriginSeq = this.peerClocks.get(packet.originPeerId) ?? 0;
    if (packet.originSeq !== currentOriginSeq + 1) {
      return false;
    }
    for (const [depPeerId, depSeq] of Object.entries(packet.vectorClock)) {
      if (depPeerId === packet.originPeerId) continue;
      const localDepSeq = this.peerClocks.get(depPeerId) ?? 0;
      if (localDepSeq < depSeq) {
        return false;
      }
    }
    return true;
  }

  private applyPacketCommitted(packet: CrdtDeltaPacket): void {
    this.appliedPacketIds.add(packet.packetId);
    this.lamportClock = Math.max(this.lamportClock, packet.lamportClock) + 1;
    this.peerClocks.set(packet.originPeerId, packet.originSeq);
    for (const [pid, seq] of Object.entries(packet.vectorClock)) {
      const prev = this.peerClocks.get(pid) ?? 0;
      if (seq > prev) {
        this.peerClocks.set(pid, seq);
      }
    }
    this.applyOperationsDeterministic(packet);
  }

  private applyOperationsDeterministic(packet: CrdtDeltaPacket): void {
    for (const op of packet.operations) {
      const stamp: CrdtEntityStamp = {
        lamport: packet.lamportClock,
        originPeerId: packet.originPeerId,
        opId: op.opId,
      };

      if (op.kind === "stroke-append") {
        const existing = this.strokeRecords.get(op.entityId);
        if (!existing || compareStamps(stamp, existing.stamp) > 0) {
          this.strokeRecords.set(op.entityId, {
            entityId: op.entityId,
            layerId: op.layerId,
            brushId: op.brushId,
            pointCount: op.pointCount,
            pressureAvg: op.pressureAvg,
            erased: false,
            stamp,
          });
        }
      } else if (op.kind === "stroke-erase") {
        const existing = this.strokeRecords.get(op.entityId);
        if (!existing || compareStamps(stamp, existing.stamp) > 0) {
          this.strokeRecords.set(op.entityId, {
            entityId: op.entityId,
            layerId: op.layerId,
            brushId: existing?.brushId ?? "erased",
            pointCount: existing?.pointCount ?? 0,
            pressureAvg: existing?.pressureAvg ?? 0,
            erased: true,
            stamp,
          });
        }
      } else if (op.kind === "scene-transform") {
        const existing = this.sceneNodeRecords.get(op.entityId);
        if (!existing || compareStamps(stamp, existing.stamp) > 0) {
          this.sceneNodeRecords.set(op.entityId, {
            entityId: op.entityId,
            position: op.position,
            rotationDeg: op.rotationDeg,
            scale: op.scale,
            maxLod: existing?.maxLod ?? null,
            stamp,
          });
        }
      } else if (op.kind === "lod-override") {
        const existing = this.sceneNodeRecords.get(op.entityId);
        if (!existing || compareStamps(stamp, existing.stamp) > 0) {
          this.sceneNodeRecords.set(op.entityId, {
            entityId: op.entityId,
            position: existing?.position ?? [0, 0, 0],
            rotationDeg: existing?.rotationDeg ?? [0, 0, 0],
            scale: existing?.scale ?? 1,
            maxLod: op.maxLod,
            stamp,
          });
        }
      }
    }
  }

  /**
   * 원격 CRDT 델타 패킷을 수신한다.
   * 선행 인과 패킷이 아직 도착하지 않았으면 `pendingInbound`에 보류했다가 충족 즉시 순서대로 배출한다.
   */
  receivePacket(packet: CrdtDeltaPacket): CrdtApplyOutcome {
    const knownOriginSeq = this.peerClocks.get(packet.originPeerId) ?? 0;
    if (this.appliedPacketIds.has(packet.packetId) || packet.originSeq <= knownOriginSeq) {
      return {
        status: "duplicate",
        packetId: packet.packetId,
        drainedBufferedCount: 0,
        pendingBufferSize: this.pendingInbound.size,
        stateDigestHex: this.computeStateDigest(),
      };
    }

    if (!this.isCausallyReady(packet)) {
      this.pendingInbound.set(packet.packetId, packet);
      return {
        status: "buffered-out-of-order",
        packetId: packet.packetId,
        drainedBufferedCount: 0,
        pendingBufferSize: this.pendingInbound.size,
        stateDigestHex: this.computeStateDigest(),
      };
    }

    this.applyPacketCommitted(packet);
    let drainedBufferedCount = 0;
    let progressed = true;
    while (progressed) {
      progressed = false;
      const readyKeys: string[] = [];
      for (const [key, buffered] of this.pendingInbound.entries()) {
        if (this.isCausallyReady(buffered)) {
          readyKeys.push(key);
        }
      }
      readyKeys.sort();
      for (const key of readyKeys) {
        const buffered = this.pendingInbound.get(key);
        if (!buffered) continue;
        this.pendingInbound.delete(key);
        this.applyPacketCommitted(buffered);
        drainedBufferedCount += 1;
        progressed = true;
      }
    }

    return {
      status: "applied",
      packetId: packet.packetId,
      drainedBufferedCount,
      pendingBufferSize: this.pendingInbound.size,
      stateDigestHex: this.computeStateDigest(),
    };
  }

  /** 수렴된 스트로크 및 3D 씬 노드 상태를 결정론적 해시(CRC32+FNV-1a 16자리 16진수)로 요약한다. */
  computeStateDigest(): string {
    const strokes = Array.from(this.strokeRecords.values()).sort((a, b) =>
      a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0,
    );
    const nodes = Array.from(this.sceneNodeRecords.values()).sort((a, b) =>
      a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0,
    );
    const canonical = utf8Encoder.encode(JSON.stringify({ strokes, nodes }));
    const crc = computeCrc32(canonical).toString(16).padStart(8, "0");
    const fnv = computeFnv1a32(canonical).toString(16).padStart(8, "0");
    return `${crc}${fnv}`;
  }

  getSnapshot(): P2pMeshPeerSnapshot {
    const vc: Record<string, number> = {};
    for (const [pid, seq] of this.peerClocks.entries()) {
      vc[pid] = seq;
    }
    let activeStrokeCount = 0;
    let erasedStrokeCount = 0;
    for (const record of this.strokeRecords.values()) {
      if (record.erased) erasedStrokeCount += 1;
      else activeStrokeCount += 1;
    }
    return {
      peerId: this.peerId,
      lamportClock: this.lamportClock,
      vectorClock: vc,
      appliedPacketCount: this.appliedPacketIds.size,
      pendingBufferSize: this.pendingInbound.size,
      activeStrokeCount,
      erasedStrokeCount,
      sceneNodeCount: this.sceneNodeRecords.size,
      stateDigestHex: this.computeStateDigest(),
    };
  }
}

/**
 * 3개 협업 피어(`studio-host`, `ipad-ink`, `desktop-3d`) 간 비순차 도착·중복 패킷·바이너리 압축
 * 시나리오를 실행하고 충돌 0건·동일 상태 다이제스트 수렴을 검증한다.
 */
export function runP2pMeshConvergenceScenario(
  transport: P2pTransportKind = "webtransport-stream",
): P2pMeshConvergenceReport {
  const host = new P2pCrdtDeltaMesh("studio-host", transport);
  const ipad = new P2pCrdtDeltaMesh("ipad-ink", transport);
  const desktop3d = new P2pCrdtDeltaMesh("desktop-3d", transport);

  const pHost1 = host.commitLocalBatch([
    {
      kind: "stroke-append",
      opId: "op-h-1",
      entityId: "stroke-panel-outline-01",
      layerId: "ink-main",
      brushId: "gpen-pro",
      pointCount: 48,
      pressureAvg: 0.74,
    },
    {
      kind: "stroke-append",
      opId: "op-h-2",
      entityId: "stroke-temp-guide",
      layerId: "ink-main",
      brushId: "pencil-hb",
      pointCount: 16,
      pressureAvg: 0.41,
    },
    {
      kind: "stroke-erase",
      opId: "op-h-3",
      entityId: "stroke-temp-guide",
      layerId: "ink-main",
    },
  ]);

  const pHost2 = host.commitLocalBatch([
    {
      kind: "scene-transform",
      opId: "op-h-4",
      entityId: "hero-character",
      position: [0.1, 0, -4.0],
      rotationDeg: [0, 12, 0],
      scale: 1,
    },
    {
      kind: "scene-transform",
      opId: "op-h-5",
      entityId: "hero-character",
      position: [0.25, 0, -4.1],
      rotationDeg: [0, 18, 0],
      scale: 1,
    },
    {
      kind: "scene-transform",
      opId: "op-h-6",
      entityId: "hero-character",
      position: [0.4, 0, -4.2],
      rotationDeg: [0, 24, 0],
      scale: 1.02,
    },
  ]);

  const pIpad1 = ipad.commitLocalBatch([
    {
      kind: "stroke-append",
      opId: "op-i-1",
      entityId: "stroke-hair-highlight-02",
      layerId: "ink-highlight",
      brushId: "taper-pen",
      pointCount: 34,
      pressureAvg: 0.62,
    },
  ]);

  const pDesk1 = desktop3d.commitLocalBatch([
    {
      kind: "scene-transform",
      opId: "op-d-1",
      entityId: "hero-character",
      position: [0.45, 0, -4.15],
      rotationDeg: [0, 28, 0],
      scale: 1.02,
    },
    {
      kind: "lod-override",
      opId: "op-d-2",
      entityId: "interior-atelier-bg",
      maxLod: 2,
    },
    {
      kind: "lod-override",
      opId: "op-d-3",
      entityId: "interior-atelier-bg",
      maxLod: 1,
    },
  ]);

  const packets = [pHost1, pHost2, pIpad1, pDesk1];
  let totalRawBytes = 0;
  let totalWireBytes = 0;

  const decodedPackets: CrdtDeltaPacket[] = [];
  for (const pkt of packets) {
    const encoded = encodeCrdtDeltaPacket(pkt, { enableCompaction: true });
    totalRawBytes += encoded.rawUncompactedBytes;
    totalWireBytes += encoded.wireBytes;
    const decoded = decodeCrdtDeltaPacket(encoded.bytes);
    if (decoded.ok && decoded.packet) {
      decodedPackets.push(decoded.packet);
    }
  }

  const [dHost1, dHost2, dIpad1, dDesk1] = decodedPackets;
  let outOfOrderDeliveriesSimulated = 0;
  let duplicatePacketsInjected = 0;

  if (dHost1 && dHost2 && dIpad1 && dDesk1) {
    const oooIpad = ipad.receivePacket(dHost2);
    if (oooIpad.status === "buffered-out-of-order") outOfOrderDeliveriesSimulated += 1;
    ipad.receivePacket(dDesk1);
    ipad.receivePacket(dHost1);
    const dupIpad = ipad.receivePacket(dHost2);
    if (dupIpad.status === "duplicate") duplicatePacketsInjected += 1;

    const oooDesk = desktop3d.receivePacket(dHost2);
    if (oooDesk.status === "buffered-out-of-order") outOfOrderDeliveriesSimulated += 1;
    desktop3d.receivePacket(dIpad1);
    desktop3d.receivePacket(dHost1);
    const dupDesk = desktop3d.receivePacket(dIpad1);
    if (dupDesk.status === "duplicate") duplicatePacketsInjected += 1;

    host.receivePacket(dDesk1);
    host.receivePacket(dIpad1);
  }

  const peerSnapshots = [host.getSnapshot(), ipad.getSnapshot(), desktop3d.getSnapshot()];
  const convergedDigestHex = peerSnapshots[0]?.stateDigestHex ?? "";
  const allPeersConverged = peerSnapshots.every(
    (snap) => snap.stateDigestHex === convergedDigestHex && snap.pendingBufferSize === 0,
  );
  const compactionSavedBytes = Math.max(0, totalRawBytes - totalWireBytes);
  const compactionSavingsPct =
    totalRawBytes > 0 ? Number(((compactionSavedBytes / totalRawBytes) * 100).toFixed(1)) : 0;

  return {
    transport,
    emittedPacketCount: packets.length,
    duplicatePacketsInjected,
    outOfOrderDeliveriesSimulated,
    totalRawBytes,
    totalWireBytes,
    compactionSavedBytes,
    compactionSavingsPct,
    unresolvedConflictCount: allPeersConverged ? 0 : 1,
    allPeersConverged,
    convergedDigestHex,
    peerSnapshots,
  };
}
