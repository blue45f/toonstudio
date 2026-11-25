// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ALL_TILE_KEYS, BASE_STUDIO_EPOCH_MS, CRDT_NETWORK_SCENARIOS, CRDT_PEER_ROLES,
  STUDIO_LAYER_IDS, StudioDistributedCrdtSyncPanel, TILE_RGBA_BYTES, TILE_SIZE_PX,
  applyLocalStrokeOp, calculateBandwidthBudget, coalesceDirtyTileFrame, compareHlc,
  createClusterForScenario, createCrdtPeerState, createDeterministicReversedDuplicateStream,
  deserializeDeltaPacket, exportCrdtSyncSnapshotJson, flushPeerCoalescedFrame,
  fnv1a32Hex, fnv1a64Hex, formatHlc, makeTileKey, mergeRemoteOps, receiveHlcRemote,
  reconcileClusterOutOfOrder, runConcurrentBurstOnCluster, serializeDeltaPacket,
  setPeerNetworkLink, tickHlcLocal, verifyCrdtConvergenceLaws,
  type HlcTimestamp, type PeerId, type TileStrokeOp,
} from "./index";

afterEach(cleanup);

function generatePermutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += 1) {
    const head = items[i];
    if (head === undefined) continue;
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const perm of generatePermutations(rest)) result.push([head, ...perm]);
  }
  return result;
}

function buildFourPeerConcurrentTileOps(): readonly TileStrokeOp[] {
  const peerIds: readonly PeerId[] = ["lead-artist", "lineart-assist", "color-assist", "lettering-assist"];
  const ops: TileStrokeOp[] = [];
  for (let i = 0; i < peerIds.length; i += 1) {
    const pid = peerIds[i];
    if (!pid) continue;
    const p0 = createCrdtPeerState(pid, { initialPhysicalMs: BASE_STUDIO_EPOCH_MS + 10 });
    const r1 = applyLocalStrokeOp(p0, {
      tileX: 1, tileY: 1, layerId: "layer-ink", physicalNowMs: BASE_STUDIO_EPOCH_MS + 50 + i * 5, strokeSeed: `same-layer-${i}`,
    });
    const r2 = applyLocalStrokeOp(r1.peer, {
      tileX: 1, tileY: 1, physicalNowMs: BASE_STUDIO_EPOCH_MS + 70 + i * 5, strokeSeed: `own-layer-${i}`,
    });
    ops.push(r1.op, r2.op);
  }
  return ops;
}

describe("1. 하이브리드 논리 시계(HLC) & 엄격 전순서 규약", () => {
  it("물리 시계가 전진하면 tickHlcLocal이 물리 시계를 갱신하고 논리 카운터를 0으로 초기화한다", () => {
    const c0: HlcTimestamp = { physicalMs: BASE_STUDIO_EPOCH_MS, logical: 4, nodeId: "lead-artist" };
    const c1 = tickHlcLocal(c0, BASE_STUDIO_EPOCH_MS + 25);
    expect(c1).toEqual({ physicalMs: BASE_STUDIO_EPOCH_MS + 25, logical: 0, nodeId: "lead-artist" });
  });

  it("물리 시계가 정체되거나 역행해도 tickHlcLocal이 논리 카운터를 단조 증가시킨다", () => {
    const c0: HlcTimestamp = { physicalMs: BASE_STUDIO_EPOCH_MS + 100, logical: 2, nodeId: "lineart-assist" };
    const same = tickHlcLocal(c0, BASE_STUDIO_EPOCH_MS + 100);
    const backward = tickHlcLocal(same, BASE_STUDIO_EPOCH_MS + 20);
    expect(same).toEqual({ physicalMs: BASE_STUDIO_EPOCH_MS + 100, logical: 3, nodeId: "lineart-assist" });
    expect(backward).toEqual({ physicalMs: BASE_STUDIO_EPOCH_MS + 100, logical: 4, nodeId: "lineart-assist" });
    expect(compareHlc(c0, same)).toBe(-1);
    expect(compareHlc(same, backward)).toBe(-1);
  });

  it("원격 HLC가 앞설 때 receiveHlcRemote가 원격 물리 시계를 흡수하고 logical+1을 유지한다", () => {
    const local: HlcTimestamp = { physicalMs: BASE_STUDIO_EPOCH_MS, logical: 1, nodeId: "lead-artist" };
    const remote: HlcTimestamp = { physicalMs: BASE_STUDIO_EPOCH_MS + 80, logical: 5, nodeId: "color-assist" };
    const next = receiveHlcRemote(local, remote, BASE_STUDIO_EPOCH_MS + 10);
    expect(next).toEqual({ physicalMs: BASE_STUDIO_EPOCH_MS + 80, logical: 6, nodeId: "lead-artist" });
    expect(compareHlc(remote, next)).toBe(-1);
  });

  it("동일 물리 시계에서 receiveHlcRemote가 max(local.logical, remote.logical)+1로 인과 순서를 보존한다", () => {
    const local: HlcTimestamp = { physicalMs: BASE_STUDIO_EPOCH_MS + 50, logical: 3, nodeId: "lead-artist" };
    const remote: HlcTimestamp = { physicalMs: BASE_STUDIO_EPOCH_MS + 50, logical: 9, nodeId: "lettering-assist" };
    const next = receiveHlcRemote(local, remote, BASE_STUDIO_EPOCH_MS + 40);
    expect(next).toEqual({ physicalMs: BASE_STUDIO_EPOCH_MS + 50, logical: 10, nodeId: "lead-artist" });
  });

  it("compareHlc가 동일 (physicalMs, logical)에서 nodeId 사전순으로 엄격 전순서·추이성을 보장한다", () => {
    const a: HlcTimestamp = { physicalMs: 1000, logical: 2, nodeId: "color-assist" };
    const b: HlcTimestamp = { physicalMs: 1000, logical: 2, nodeId: "lead-artist" };
    const c: HlcTimestamp = { physicalMs: 1000, logical: 2, nodeId: "lineart-assist" };
    expect(compareHlc(a, b)).toBe(-1);
    expect(compareHlc(b, c)).toBe(-1);
    expect(compareHlc(a, c)).toBe(-1);
    expect(compareHlc(b, a)).toBe(1);
    expect(compareHlc(a, a)).toBe(0);
    expect(formatHlc(a)).toBe("1000:2@color-assist");
  });

  it("NaN·Infinity·음수 시계 입력에서도 HLC와 FNV-1a 해시가 유한·결정론적으로 유지된다", () => {
    const base: HlcTimestamp = { physicalMs: BASE_STUDIO_EPOCH_MS, logical: 0, nodeId: "lead-artist" };
    expect(tickHlcLocal(base, Number.NaN).physicalMs).toBe(BASE_STUDIO_EPOCH_MS);
    expect(receiveHlcRemote(base, base, Number.POSITIVE_INFINITY).logical).toBe(1);
    expect(fnv1a32Hex("tile-sync")).toHaveLength(8);
    expect(fnv1a64Hex("tile-sync")).toHaveLength(16);
    expect(fnv1a64Hex("tile-sync")).toBe(fnv1a64Hex("tile-sync"));
  });
});

describe("2. CRDT 교환법칙·결합법칙·멱등성 100% 수학적 수렴 증명", () => {
  it("교환법칙(Commutative): merge(A, B)와 merge(B, A)가 동일 타일 충돌에서도 비트 단위 동일 FNV-1a 해시에 수렴한다", () => {
    const ops = buildFourPeerConcurrentTileOps();
    const opsA = ops.slice(0, 4);
    const opsB = ops.slice(4);
    const ab = mergeRemoteOps(mergeRemoteOps(createCrdtPeerState("lead-artist"), opsA).peer, opsB).peer;
    const ba = mergeRemoteOps(mergeRemoteOps(createCrdtPeerState("color-assist"), opsB).peer, opsA).peer;
    expect(ab.stateHash).toBe(ba.stateHash);
    expect(ab.tiles["tile:1:1"].tileDigest).toBe(ba.tiles["tile:1:1"].tileDigest);
    expect(ab.tiles["tile:1:1"].winningOpId).toBe(ba.tiles["tile:1:1"].winningOpId);
  });

  it("결합법칙(Associative): merge(merge(A, B), C)와 merge(A, merge(B, C))가 정확히 동일한 FNV-1a 해시에 수렴한다", () => {
    const ops = buildFourPeerConcurrentTileOps();
    const gA = ops.filter((_, i) => i % 3 === 0);
    const gB = ops.filter((_, i) => i % 3 === 1);
    const gC = ops.filter((_, i) => i % 3 === 2);

    const left = mergeRemoteOps(mergeRemoteOps(mergeRemoteOps(createCrdtPeerState("lead-artist"), gA).peer, gB).peer, gC).peer;
    const bc = mergeRemoteOps(mergeRemoteOps(createCrdtPeerState("lineart-assist"), gB).peer, gC).peer;
    const right = mergeRemoteOps(mergeRemoteOps(createCrdtPeerState("lettering-assist"), gA).peer, bc.opLog).peer;
    expect(left.stateHash).toBe(right.stateHash);
    expect(left.opLog.map((o) => o.opId)).toEqual(right.opLog.map((o) => o.opId));
  });

  it("멱등성(Idempotent): 동일 원격 패킷을 3회 중복 병합해도 상태 해시와 opLog 길이가 변하지 않고 중복 건수를 정확히 집계한다", () => {
    const ops = buildFourPeerConcurrentTileOps();
    const m1 = mergeRemoteOps(createCrdtPeerState("lead-artist"), ops);
    const m2 = mergeRemoteOps(m1.peer, ops);
    const m3 = mergeRemoteOps(m2.peer, [...ops, ...ops]);
    expect(m1.stateHashChanged).toBe(true);
    expect(m2.stateHashChanged).toBe(false);
    expect(m2.duplicateCount).toBe(ops.length);
    expect(m3.duplicateCount).toBe(ops.length * 2);
    expect(m3.peer.stateHash).toBe(m1.peer.stateHash);
    expect(m3.peer.opLog).toHaveLength(ops.length);
    expect(m3.peer.metrics.duplicateOpsIgnored).toBe(ops.length * 3);
  });

  it("4피어 동시 동일 타일 편집의 모든 24가지(4!) 도착 순열이 단 1개의 정규 FNV-1a 해시에 수렴한다", () => {
    const fourOps = buildFourPeerConcurrentTileOps().slice(0, 4);
    const perms = generatePermutations(fourOps);
    expect(perms).toHaveLength(24);
    const hashes = new Set<string>();
    for (const perm of perms) {
      hashes.add(mergeRemoteOps(createCrdtPeerState("lead-artist"), perm).peer.stateHash);
    }
    expect(hashes.size).toBe(1);
  });

  it("역순·중복 패킷 폭풍 수신 시에도 순서대로 받은 피어와 FNV-1a 해시가 100% 일치하고 outOfOrder 건수를 기록한다", () => {
    const ops = buildFourPeerConcurrentTileOps();
    const ordered = mergeRemoteOps(createCrdtPeerState("lead-artist"), ops).peer;
    const storm = createDeterministicReversedDuplicateStream(ops);
    const chaotic = mergeRemoteOps(createCrdtPeerState("lineart-assist"), storm);
    expect(chaotic.peer.stateHash).toBe(ordered.stateHash);
    expect(chaotic.outOfOrderCount).toBeGreaterThan(0);
    expect(chaotic.duplicateCount).toBeGreaterThan(0);
  });

  it("오프라인 분기(Partition) 후 재연결 병합 시 OPFS 큐가 비워지고 4피어 모두 동일 FNV-1a 해시로 수렴한다", () => {
    const partitioned = createClusterForScenario("offline-partition", 4);
    const offlinePeers = partitioned.filter((p) => p.isOffline);
    expect(offlinePeers).toHaveLength(2);
    expect(offlinePeers.every((p) => p.transportChannel === "opfs-offline-queue")).toBe(true);
    expect(offlinePeers.every((p) => p.offlineOutbox.length === 1)).toBe(true);

    const uniquePreHashes = new Set(partitioned.map((p) => p.stateHash));
    expect(uniquePreHashes.size).toBeGreaterThan(1);

    const reconciled = reconcileClusterOutOfOrder(partitioned, "webrtc-datachannel");
    expect(reconciled.allPeersConverged).toBe(true);
    expect(new Set(reconciled.peers.map((p) => p.stateHash)).size).toBe(1);
    expect(reconciled.peers.every((p) => p.offlineOutbox.length === 0 && !p.isOffline)).toBe(true);
  });

  it("LWW-Element-Set Add/Erase가 역순 수신에서도 최신 HLC 기준으로 타일 레이어 가시성을 결정론적으로 수렴한다", () => {
    const p1 = createCrdtPeerState("lead-artist", { initialPhysicalMs: BASE_STUDIO_EPOCH_MS });
    const add1 = applyLocalStrokeOp(p1, { tileX: 2, tileY: 2, layerId: "layer-ink", kind: "stroke-add", physicalNowMs: BASE_STUDIO_EPOCH_MS + 10 });
    const erase = applyLocalStrokeOp(add1.peer, { tileX: 2, tileY: 2, layerId: "layer-ink", kind: "stroke-erase", physicalNowMs: BASE_STUDIO_EPOCH_MS + 30 });
    const reAdd = applyLocalStrokeOp(erase.peer, { tileX: 2, tileY: 2, layerId: "layer-ink", kind: "stroke-add", physicalNowMs: BASE_STUDIO_EPOCH_MS + 60 });

    const erasedA = mergeRemoteOps(createCrdtPeerState("color-assist"), [add1.op, erase.op]).peer;
    const erasedB = mergeRemoteOps(createCrdtPeerState("lettering-assist"), [erase.op, add1.op]).peer;
    expect(erasedA.tiles["tile:2:2"].activeLayers["layer-ink"].isVisible).toBe(false);
    expect(erasedB.tiles["tile:2:2"].activeLayers["layer-ink"].isVisible).toBe(false);
    expect(erasedA.stateHash).toBe(erasedB.stateHash);

    const restoredA = mergeRemoteOps(erasedA, [reAdd.op]).peer;
    const restoredB = mergeRemoteOps(createCrdtPeerState("lineart-assist"), [reAdd.op, erase.op, add1.op]).peer;
    expect(restoredA.tiles["tile:2:2"].activeLayers["layer-ink"].isVisible).toBe(true);
    expect(restoredA.stateHash).toBe(restoredB.stateHash);
  });

  it("verifyCrdtConvergenceLaws가 교환·결합·멱등·역순중복 4대 법칙 통과와 4피어 동일 해시를 증명한다", () => {
    const proof = verifyCrdtConvergenceLaws(buildFourPeerConcurrentTileOps());
    expect(proof.commutativePassed).toBe(true);
    expect(proof.associativePassed).toBe(true);
    expect(proof.idempotentPassed).toBe(true);
    expect(proof.outOfOrderAndDuplicatePassed).toBe(true);
    expect(proof.allLawsVerified).toBe(true);
    expect(new Set(Object.values(proof.peerHashes)).size).toBe(1);
    expect(proof.canonicalHash).toMatch(/^fnv1a-[0-9a-f]{16}$/u);
  });
});

describe("3. 낙관적 0ms 로컬 렌더 & GPU 더티 타일 코얼레싱(coalesceDirtyTileFrame)", () => {
  it("applyLocalStrokeOp가 온라인·오프라인 모두 0ms 낙관적 로컬 렌더를 보장하고 오프라인 시 OPFS 큐에 적재한다", () => {
    const online = createCrdtPeerState("lead-artist", { transportChannel: "webrtc-datachannel", isOffline: false });
    const resOnline = applyLocalStrokeOp(online, { tileX: 0, tileY: 0 });
    expect(resOnline.optimisticRenderLatencyMs).toBe(0);
    expect(resOnline.syncPath).toBe("webrtc-datachannel");
    expect(resOnline.peer.offlineOutbox).toHaveLength(0);

    const offline = setPeerNetworkLink(online, "opfs-offline-queue", true);
    const resOffline = applyLocalStrokeOp(offline, { tileX: 0, tileY: 1 });
    expect(resOffline.optimisticRenderLatencyMs).toBe(0);
    expect(resOffline.syncPath).toBe("opfs-offline-queue");
    expect(resOffline.peer.offlineOutbox).toHaveLength(1);
  });

  it("1프레임 내 40개 스트로크 폭주를 4개 256×256 타일로 코얼레싱해 GPU 드로우콜을 90.0% 절감한다", () => {
    const cluster = createClusterForScenario("lan-normal", 4);
    const burst = runConcurrentBurstOnCluster(cluster, "lan-normal", 40);
    expect(burst.coalesceReport.tileSizePx).toBe(TILE_SIZE_PX);
    expect(burst.coalesceReport.inputOpCount).toBe(40);
    expect(burst.coalesceReport.naiveDrawCalls).toBe(40);
    expect(burst.coalesceReport.coalescedDrawCalls).toBe(4);
    expect(burst.coalesceReport.savedDrawCalls).toBe(36);
    expect(burst.coalesceReport.coalescingReductionPct).toBe(90);
    expect(burst.coalesceReport.optimisticLocalLatencyMs).toBe(0);
    expect(burst.coalesceReport.withinFrameBudget).toBe(true);
    expect(burst.coalesceReport.dirtyTiles.every((t) => t.compositePassCount === 1 && t.coalescedUploadBytes === TILE_RGBA_BYTES)).toBe(true);
  });

  it("동일 프레임 내 중복 op가 유입되어도 coalesceDirtyTileFrame이 opId 기준으로 중복 제거 후 병합한다", () => {
    const ops = buildFourPeerConcurrentTileOps();
    const report = coalesceDirtyTileFrame([...ops, ...ops]);
    expect(report.inputOpCount).toBe(ops.length * 2);
    expect(report.uniqueOpCount).toBe(ops.length);
    expect(report.duplicateInFrameCount).toBe(ops.length);
    expect(report.coalescedDrawCalls).toBe(1);
    expect(report.dirtyTiles[0]?.tileKey).toBe("tile:1:1");
  });

  it("빈 op 배열 입력 시 드로우콜 0·절감률 0%·프레임 예산 충족을 안전하게 반환한다", () => {
    const empty = coalesceDirtyTileFrame([], { targetFps: 120 });
    expect(empty.coalescedDrawCalls).toBe(0);
    expect(empty.coalescingReductionPct).toBe(0);
    expect(empty.frameBudgetMs).toBe(8.33);
    expect(empty.withinFrameBudget).toBe(true);
  });

  it("16개 전체 캔버스 타일 폭주 시 정규 타일 순서(0,0..3,3)와 flushPeerCoalescedFrame 큐 비우기가 정확하다", () => {
    let peer = createCrdtPeerState("lead-artist");
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        peer = applyLocalStrokeOp(peer, { tileX: x, tileY: y, strokeSeed: `grid-${x}-${y}` }).peer;
      }
    }
    const { peer: flushed, report } = flushPeerCoalescedFrame(peer);
    expect(report.dirtyTiles.map((t) => t.tileKey)).toEqual(ALL_TILE_KEYS);
    expect(flushed.pendingDirtyOps).toHaveLength(0);
    expect(flushed.metrics.lastCoalescedFrame?.coalescedDrawCalls).toBe(16);
  });

  it("범위 밖·음수·NaN 타일 좌표 입력을 0..3 경계로 안전하게 보정한다", () => {
    expect(makeTileKey(-5, 99)).toBe("tile:0:3");
    expect(makeTileKey(Number.NaN, Number.POSITIVE_INFINITY)).toBe("tile:0:0");
    const res = applyLocalStrokeOp(createCrdtPeerState("lead-artist"), { tileX: -10, tileY: 50, pointCount: -3, opacityQ8: 999 });
    expect(res.op.tileKey).toBe("tile:0:3");
    expect(res.op.pointCount).toBe(1);
    expect(res.op.opacityQ8).toBe(255);
  });
});

describe("4. 압축 델타 패킷 직렬화 · 대역폭 예산 · JSON 스냅샷 내보내기", () => {
  it("serializeDeltaPacket과 deserializeDeltaPacket이 무손실 왕복 직렬화되고 위변조 체크섬을 차단한다", () => {
    const ops = buildFourPeerConcurrentTileOps();
    const packet = serializeDeltaPacket(ops, "webrtc-datachannel");
    expect(packet.packetVersion).toBe("toonstudio.crdt-delta.v1");
    expect(packet.compressedDeltaBytes).toBeLessThan(packet.rawJsonBytes);
    expect(packet.compressedDeltaBytes).toBeLessThan(packet.fullTileRawBytes);
    expect(packet.compressionRatio).toBeGreaterThan(4);

    const decoded = deserializeDeltaPacket(packet);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.ops.map((o) => o.opId)).toEqual([...ops].sort((a, b) => compareHlc(a.hlc, b.hlc)).map((o) => o.opId));

    const tampered = deserializeDeltaPacket({ ...packet, encodedPayload: `${packet.encodedPayload}x` });
    expect(tampered.ok).toBe(false);
    if (!tampered.ok) expect(tampered.reason).toBe("checksum-mismatch");
  });

  it("calculateBandwidthBudget이 JSON·풀타일 대비 절감률과 60Hz Kbps 예산을 정확히 계산한다", () => {
    const ops = buildFourPeerConcurrentTileOps();
    const budget = calculateBandwidthBudget(ops, "websocket-relay", 512);
    expect(budget.transportChannel).toBe("websocket-relay");
    expect(budget.jsonSavingsPct).toBeGreaterThan(75);
    expect(budget.tileUploadSavingsPct).toBeGreaterThan(99);
    expect(budget.withinBudget).toBe(true);
  });

  it("exportCrdtSyncSnapshotJson이 스키마 v1·현재/목표 경계·전송 경로 분류·피어 해시를 정직하게 직렬화한다", () => {
    const peers = createClusterForScenario("offline-partition", 4);
    const proof = verifyCrdtConvergenceLaws([]);
    const { json, snapshot } = exportCrdtSyncSnapshotJson({
      scenarioId: "offline-partition", peers, lastCoalesceReport: null, proof,
    });
    const parsed = JSON.parse(json) as { schema: string; totalOfflineQueueDepth: number };
    expect(parsed.schema).toBe("toonstudio.crdt-tile-sync-snapshot.v1");
    expect(snapshot.runtimeBoundary.currentKo).toContain("현재:");
    expect(snapshot.runtimeBoundary.targetKo).toContain("목표:");
    expect(snapshot.transportBreakdown["webrtc-datachannel"]).toBe(2);
    expect(snapshot.transportBreakdown["opfs-offline-queue"]).toBe(2);
    expect(parsed.totalOfflineQueueDepth).toBe(2);
    expect(snapshot.convergence.allPeersConverged).toBe(false);
  });

  it("동일 타일 동시 충돌 시나리오가 자동 해결 충돌 건수(>0)와 100% 피어 수렴을 동시에 기록한다", () => {
    const peers = createClusterForScenario("same-tile-conflict", 4);
    const burst = runConcurrentBurstOnCluster(peers, "same-tile-conflict", 40);
    expect(burst.allPeersConverged).toBe(true);
    expect(burst.peers[0]?.tiles["tile:1:1"].concurrentConflictCount).toBeGreaterThan(0);
    expect(burst.peers[0]?.metrics.conflictAutoResolvedCount).toBeGreaterThan(0);
    expect(burst.coalesceReport.coalescedDrawCalls).toBe(2);
    expect(burst.coalesceReport.coalescingReductionPct).toBe(95);
  });

  it("카탈로그 상수(4피어·4레이어·4시나리오·16타일)가 중복 없이 정의된다", () => {
    expect(CRDT_PEER_ROLES).toHaveLength(4);
    expect(STUDIO_LAYER_IDS).toHaveLength(4);
    expect(CRDT_NETWORK_SCENARIOS).toHaveLength(4);
    expect(ALL_TILE_KEYS).toHaveLength(16);
  });
});

describe("5. StudioDistributedCrdtSyncPanel — 렌더링, 로케일, 시나리오 전환", () => {
  it("props 없이 기본 렌더링되며 4피어·한글 UI·FNV-1a 100% 일치 배지·SVG 도해를 표시한다", () => {
    render(<StudioDistributedCrdtSyncPanel />);
    expect(screen.getByTestId("studio-distributed-crdt-sync-panel")).toBeTruthy();
    expect(screen.getByTestId("convergence-status-badge").textContent).toContain("4/4 피어 FNV-1a 100% 일치");
    expect(screen.getByTestId("crdt-tile-hlc-svg")).toBeTruthy();
    expect(screen.getAllByTestId(/^peer-hash-row-/u)).toHaveLength(4);
    expect(screen.getByTestId("peer-transport-lead-artist").textContent).toBe("WebRTC DataChannel");
  });

  it("선택적 props(initialPeerCount=2, initialNetworkMode, className)를 정확히 반영한다", () => {
    render(<StudioDistributedCrdtSyncPanel initialPeerCount={2} initialNetworkMode="jitter-reorder" className="custom-sync-class" />);
    expect(screen.getByTestId("studio-distributed-crdt-sync-panel").className).toContain("custom-sync-class");
    expect(screen.getAllByTestId(/^peer-hash-row-/u)).toHaveLength(2);
    expect(screen.getByTestId("peer-transport-lead-artist").textContent).toBe("WebSocket Relay");
  });

  it("4종 네트워크 시나리오 전환 시 전송 경로(WebRTC / WS Relay / OPFS Queue)가 정직하게 전환된다", () => {
    render(<StudioDistributedCrdtSyncPanel />);
    fireEvent.click(screen.getByTestId("scenario-btn-jitter-reorder"));
    expect(screen.getByTestId("peer-transport-lead-artist").textContent).toBe("WebSocket Relay");

    fireEvent.click(screen.getByTestId("scenario-btn-offline-partition"));
    expect(screen.getByTestId("peer-transport-color-assist").textContent).toBe("OPFS Offline Queue");
    expect(screen.getByTestId("convergence-status-badge").textContent).toContain("오프라인 분기 중");

    fireEvent.click(screen.getByTestId("scenario-btn-same-tile-conflict"));
    expect(screen.getByTestId("convergence-status-badge").textContent).toContain("100% 일치");
    expect(Number(screen.getByTestId("kpi-conflicts-count").textContent)).toBeGreaterThan(0);
  });

  it("피어 역할 버튼과 256×256 포커스 타일 버튼의 선택 상태(aria-pressed)를 전환한다", () => {
    render(<StudioDistributedCrdtSyncPanel />);
    const colorBtn = screen.getByTestId("peer-select-color-assist");
    fireEvent.click(colorBtn);
    expect(colorBtn.getAttribute("aria-pressed")).toBe("true");
    const tileBtn = screen.getByTestId("tile-select-2-2");
    fireEvent.click(tileBtn);
    expect(tileBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("영문 로케일(locale='en')에서 헤더·시나리오·SVG 제목·상태 배지가 영문으로 전환된다", () => {
    render(<StudioDistributedCrdtSyncPanel locale="en" />);
    expect(screen.getByTestId("convergence-status-badge").textContent).toContain("4/4 Peers FNV-1a 100% Match");
    expect(screen.getByTestId("crdt-tile-hlc-svg").textContent).toContain("4×4 METADATA TILE CONFLICT & COALESCING MODEL");
    expect(screen.getByTestId("scenario-btn-offline-partition").textContent).toContain("Offline Partition & Reconnect");
  });
});

describe("6. StudioDistributedCrdtSyncPanel — 인터랙티브 동기화·코얼레싱·수렴 증명·JSON 내보내기", () => {
  it("로컬 스트로크 0ms 그리기 클릭 시 상태가 갱신되고 onStateChange 콜백이 호출된다", () => {
    const onStateChange = vi.fn();
    render(<StudioDistributedCrdtSyncPanel onStateChange={onStateChange} />);
    const beforeHash = screen.getByTestId("peer-hash-lead-artist").textContent;
    fireEvent.click(screen.getByTestId("draw-local-stroke-btn"));
    expect(screen.getByTestId("peer-hash-lead-artist").textContent).not.toBe(beforeHash);
    expect(screen.getByTestId("crdt-panel-status").textContent).toContain("메타데이터 병합 모형 완료");
    expect(onStateChange).toHaveBeenCalledWith(expect.objectContaining({ allPeersConverged: true, activePeerCount: 4 }));
  });

  it("4피어 동시 스트로크 폭주(40 op) 실행 시 코얼레싱 절감률 90.0%를 즉시 갱신한다", () => {
    render(<StudioDistributedCrdtSyncPanel />);
    fireEvent.click(screen.getByTestId("burst-40-ops-btn"));
    expect(screen.getByTestId("kpi-coalesce-pct").textContent).toBe("90.0%");
    expect(screen.getByTestId("crdt-panel-status").textContent).toContain("40개 예제 메타데이터 생성");
  });

  it("오프라인 분기 상태에서 원격 역순·중복 병합 실행 시 OPFS 큐가 0이 되고 4피어 FNV-1a 해시가 100% 일치한다", () => {
    render(<StudioDistributedCrdtSyncPanel initialNetworkMode="offline-partition" />);
    expect(Number(screen.getByTestId("kpi-offline-queue").textContent)).toBe(2);
    expect(screen.getByTestId("convergence-status-badge").textContent).toContain("오프라인 분기 중");

    fireEvent.click(screen.getByTestId("reconcile-merge-btn"));
    expect(Number(screen.getByTestId("kpi-offline-queue").textContent)).toBe(0);
    expect(screen.getByTestId("convergence-status-badge").textContent).toContain("4/4 피어 FNV-1a 100% 일치");
    const h0 = screen.getByTestId("peer-hash-lead-artist").textContent;
    expect(screen.getByTestId("peer-hash-color-assist").textContent).toBe(h0);
    expect(screen.getByTestId("peer-hash-lettering-assist").textContent).toBe(h0);
  });

  it("교환·결합·멱등 수렴 증명 실행 버튼이 4/4 예제 검사 통과 배지를 표시한다", () => {
    render(<StudioDistributedCrdtSyncPanel />);
    fireEvent.click(screen.getByTestId("verify-convergence-btn"));
    expect(screen.getByTestId("kpi-proof-badge").textContent).toContain("4/4 예제 검사 통과");
    expect(screen.getByTestId("crdt-panel-status").textContent).toContain("교환·결합·멱등·역순중복 4/4 통과");
  });

  it("JSON 복사·내보내기 클릭 시 onExportJson이 v1 스키마를 전달하고 미리보기 토글이 동작한다", async () => {
    const onExportJson = vi.fn();
    render(<StudioDistributedCrdtSyncPanel onExportJson={onExportJson} />);
    fireEvent.click(screen.getByTestId("export-crdt-json-btn"));
    await waitFor(() => expect(onExportJson).toHaveBeenCalledTimes(1));
    const [jsonArg] = onExportJson.mock.calls[0] as [string];
    expect(jsonArg).toContain("toonstudio.crdt-tile-sync-snapshot.v1");
    expect(screen.getByTestId("crdt-json-preview").textContent).toContain("WebRTC DataChannel");

    fireEvent.click(screen.getByTestId("toggle-crdt-preview-btn"));
    expect(screen.queryByTestId("crdt-json-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("reset-crdt-panel-btn"));
    expect(screen.getByTestId("crdt-panel-status").textContent).toContain("정상 LAN");
  });
});

describe("7. 코드 위생 · 탈-바이올렛 OKLCH · Calm Atelier 하네스 계약 자가 검증", () => {
  it("소유 4개 파일 줄 수 제한(engine<=750, panel<=680, 전체<=800)과 금지 패턴 0건을 충족한다", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "crdt-tile-sync-engine.ts",
      "StudioDistributedCrdtSyncPanel.tsx",
      "index.ts",
      "crdt-tile-sync.test.tsx",
      "crdt-boundaries.test.tsx",
      "crdt-sync-boundaries.ts",
    ];
    for (const file of required) expect(existsSync(path.join(dir, file))).toBe(true);
    expect(readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f)).sort()).toEqual([...required].sort());

    for (const file of required) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lines = src.split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(800);
      if (file === "crdt-tile-sync-engine.ts") expect(lines).toBeLessThanOrEqual(750);
      if (file === "StudioDistributedCrdtSyncPanel.tsx") expect(lines).toBeLessThanOrEqual(680);

      if (file !== "crdt-tile-sync.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("Sparkles");
        expect(src).not.toContain("하는 것을 가능하게 합니다");
        expect(src).not.toContain("직관적인 경험을 제공합니다");
        expect(src).not.toContain("원활한 워크플로우를 보장합니다");
      }

      if (file === "StudioDistributedCrdtSyncPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
      }
    }
  });

  it("패널 내 모든 oklch() 색상이 바이올렛 휴 대역(270~320도)을 0% 배제한다", () => {
    const panelSrc = readFileSync(path.resolve(import.meta.dirname, "StudioDistributedCrdtSyncPanel.tsx"), "utf8");
    const matches = [...panelSrc.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s*\)/gu)];
    expect(matches.length).toBeGreaterThanOrEqual(5);
    for (const match of matches) {
      const hue = Number(match[1]);
      expect(hue < 270 || hue > 320).toBe(true);
    }
  });

  it("렌더된 패널의 모든 버튼이 min-h-11 접근성 터치 타깃을 충족한다", () => {
    const { container } = render(<StudioDistributedCrdtSyncPanel />);
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.length).toBeGreaterThanOrEqual(16);
    for (const btn of buttons) expect(btn.className).toContain("min-h-11");
  });

  it("공개 배럴(index.ts)이 Wave 56B 핵심 API와 제어판을 빠짐없이 재수출한다", () => {
    expect(typeof createCrdtPeerState).toBe("function");
    expect(typeof applyLocalStrokeOp).toBe("function");
    expect(typeof mergeRemoteOps).toBe("function");
    expect(typeof coalesceDirtyTileFrame).toBe("function");
    expect(typeof exportCrdtSyncSnapshotJson).toBe("function");
    expect(typeof StudioDistributedCrdtSyncPanel).toBe("function");
  });
});
