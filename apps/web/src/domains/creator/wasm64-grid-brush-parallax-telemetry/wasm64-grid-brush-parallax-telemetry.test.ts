import { describe, expect, it } from "vitest";
import {
  AdaptiveBrushDynamicsSolver,
  applyParallaxUvMatrix3x3,
  AutonomousFrameTelemetryGate,
  BRUSH_DYNAMICS_PRESETS,
  buildMerkleProof,
  computeDisocclusionPadding,
  computeMerkleRootHex,
  computeTileChecksum64,
  createOfflineAvCollabPacket,
  decodeAvCollabPacketBinary,
  DEFAULT_PARALLAX_CAMERA_CONSTRAINTS,
  DepthParallaxEpisodeExporter,
  encodeAvCollabPacketBinary,
  evaluateParallaxUvMatrix,
  fnv1a64Hex,
  fnv1a64StringHex,
  generateDisocclusionEdgeFillRgba,
  P2pGridRenderCoordinator,
  PARALLAX_MANIFEST_SCHEMA_VERSION,
  PARALLAX_ZERO_SERVER_TAG,
  RealTimeAssetStreamPipeline,
  TARGET_120HZ_FRAME_BUDGET_MS,
  upscaleLineArtCrisp2xCpu,
  upscaleLineArtCrispCpu,
  validateLineArtUpscalerWgslSource,
  verifyMerkleProof,
  WGSL_LINEART_SUPER_RES_2X,
  type GridRenderPassKind,
  type HotSwapDeltaEvent,
  type MerklePeerReplicaSource,
} from "./index";

const ENCODER = new TextEncoder();

function makeTilePixels(width: number, height: number, seed: number): Uint8Array {
  const bytes = new Uint8Array(width * height * 4);
  for (let i = 0; i < bytes.length; i += 4) {
    bytes[i] = (seed + i) & 0xff;
    bytes[i + 1] = (seed * 3 + i) & 0xff;
    bytes[i + 2] = (seed * 7 + i) & 0xff;
    bytes[i + 3] = 255;
  }
  return bytes;
}

function makeDiagonalLineArtGray(size: number): Uint8Array {
  const pixels = new Uint8Array(size * size);
  pixels.fill(255);
  for (let y = 0; y < size; y += 1) pixels[y * size + (size - 1 - y)] = 0;
  return pixels;
}

describe("FNV-1a 64비트 해시 및 머클 무결성 트리", () => {
  it("표준 FNV-1a 64비트 공식 테스트 벡터와 비트 단위로 일치한다", () => {
    expect(fnv1a64StringHex("")).toBe("cbf29ce484222325");
    expect(fnv1a64StringHex("a")).toBe("af63dc4c8601ec8c");
    expect(fnv1a64StringHex("foobar")).toBe("85944171f73967e8");
  });

  it("머클 포함 증명을 검증하고 변조된 리프 해시를 거부한다", () => {
    const leaves = ["alpha", "beta", "gamma", "delta", "epsilon"].map(fnv1a64StringHex);
    const root = computeMerkleRootHex(leaves);
    for (let i = 0; i < leaves.length; i += 1) {
      const proof = buildMerkleProof(leaves, i);
      expect(verifyMerkleProof(leaves[i], proof, root)).toBe(true);
      expect(verifyMerkleProof(fnv1a64StringHex(`tampered-${i}`), proof, root)).toBe(false);
    }
  });
});

describe("P2pGridRenderCoordinator (분산 타일 렌더 · 작업 훔치기 · 장애조치 · 무서버 AV 협업)", () => {
  it("3개 이기종 피어 간 성능 가중치 분할과 유휴 고속 피어의 꼬리 작업 훔치기로 전체 타일을 완료한다", () => {
    const coordinator = new P2pGridRenderCoordinator({ tileTimeoutMs: 4000, maxRetries: 3 });
    coordinator.registerPeer({ peerId: "peer-desktop-gpu", displayName: "데스크톱 GPU", computeScore: 4.0, maxConcurrentTiles: 2, supportsWebGpu: true, rttMs: 2 });
    coordinator.registerPeer({ peerId: "peer-laptop", displayName: "노트북", computeScore: 2.2, maxConcurrentTiles: 1, supportsWebGpu: true, rttMs: 5 });
    coordinator.registerPeer({ peerId: "peer-tablet", displayName: "태블릿", computeScore: 1.5, maxConcurrentTiles: 1, supportsWebGpu: false, rttMs: 12 });

    const tiles = coordinator.enqueueFrameGrid({
      jobId: "frame-042", frameWidth: 384, frameHeight: 256, tileSize: 64, renderPass: "gi-diffuse",
    });
    expect(tiles).toHaveLength(24);

    // 초기 가중치 분배 확인: 고속 데스크톱이 가장 많고 태블릿에도 대기 타일이 배정됨
    const initialStates = new Map(coordinator.getPeerStates().map((p) => [p.peerId, p]));
    expect(initialStates.get("peer-desktop-gpu")!.localQueueDepth).toBeGreaterThan(initialStates.get("peer-tablet")!.localQueueDepth);
    expect(initialStates.get("peer-tablet")!.localQueueDepth).toBeGreaterThanOrEqual(3);

    const tileMeta = new Map(tiles.map((t) => [t.tileId, t]));
    const inFlight = new Map<string, { peerId: string; attempt: number }>();
    const stolenVictims: string[] = [];

    let now = 1000;
    for (let step = 0; step < 30; step += 1) {
      for (const a of coordinator.dispatchAvailableWork(now)) {
        inFlight.set(a.tileId, { peerId: a.peerId, attempt: a.attempt });
        if (a.stolenFromPeerId !== null) stolenVictims.push(a.stolenFromPeerId);
      }
      if (inFlight.size === 0) break;

      // 데스크톱·노트북은 매 틱 완료, 태블릿은 6틱에 1건 완료 -> 데스크톱이 태블릿 꼬리 작업을 훔친다
      for (const [tileId, active] of Array.from(inFlight.entries())) {
        if (active.peerId === "peer-tablet" && step % 6 !== 5) continue;
        const desc = tileMeta.get(tileId)!;
        const pixels = makeTilePixels(desc.width, desc.height, step + 1);
        const res = coordinator.submitTileResult({
          tileId, peerId: active.peerId, attempt: active.attempt,
          width: desc.width, height: desc.height, renderPass: desc.renderPass, pixels,
          claimedChecksumHex: computeTileChecksum64(tileId, desc.width, desc.height, pixels, desc.renderPass),
          renderDurationMs: 18,
        });
        expect(res.accepted).toBe(true);
        inFlight.delete(tileId);
      }
      now += 40;
    }

    const stats = coordinator.getStats();
    expect(stats.verifiedTiles).toBe(24);
    expect(stats.failedTiles).toBe(0);
    expect(stats.stealEventsCount).toBeGreaterThan(0);
    expect(stolenVictims).toContain("peer-tablet");
    const desktopState = coordinator.getPeerStates().find((p) => p.peerId === "peer-desktop-gpu");
    expect(desktopState?.stolenTilesExecuted).toBeGreaterThan(0);
  });

  it("워커 타임아웃 발생 시 다른 건강한 피어로 자동 재할당하고 지연된 구 제출을 거부한다", () => {
    const coordinator = new P2pGridRenderCoordinator({ tileTimeoutMs: 500, maxRetries: 3 });
    coordinator.registerPeer({ peerId: "peer-alpha", displayName: "알파", computeScore: 3.0, maxConcurrentTiles: 1, supportsWebGpu: true, rttMs: 3 });
    coordinator.registerPeer({ peerId: "peer-beta", displayName: "베타", computeScore: 2.5, maxConcurrentTiles: 1, supportsWebGpu: true, rttMs: 4 });

    const tiles = coordinator.enqueueFrameGrid({ jobId: "timeout-job", frameWidth: 64, frameHeight: 32, tileSize: 32, renderPass: "lineart-ink" });
    const firstWave = coordinator.dispatchAvailableWork(1000);
    expect(firstWave).toHaveLength(2);

    const [fastAssign, stalledAssign] = firstWave;
    const fastDesc = tiles.find((t) => t.tileId === fastAssign.tileId)!;
    const fastPixels = makeTilePixels(fastDesc.width, fastDesc.height, 11);
    expect(
      coordinator.submitTileResult({
        tileId: fastAssign.tileId, peerId: fastAssign.peerId, attempt: fastAssign.attempt,
        width: fastDesc.width, height: fastDesc.height, renderPass: fastDesc.renderPass, pixels: fastPixels,
        claimedChecksumHex: computeTileChecksum64(fastAssign.tileId, fastDesc.width, fastDesc.height, fastPixels, fastDesc.renderPass),
        renderDurationMs: 25,
      }).accepted,
    ).toBe(true);

    const failovers = coordinator.sweepTimeouts(1600);
    expect(failovers).toHaveLength(1);
    expect(failovers[0]).toMatchObject({ tileId: stalledAssign.tileId, timedOutPeerId: stalledAssign.peerId, requeued: true });

    const secondWave = coordinator.dispatchAvailableWork(1610);
    expect(secondWave).toHaveLength(1);
    expect(secondWave[0].peerId).not.toBe(stalledAssign.peerId);
    expect(secondWave[0].attempt).toBe(2);

    const stalledDesc = tiles.find((t) => t.tileId === stalledAssign.tileId)!;
    const validPixels = makeTilePixels(stalledDesc.width, stalledDesc.height, 22);
    const validHash = computeTileChecksum64(stalledAssign.tileId, stalledDesc.width, stalledDesc.height, validPixels, stalledDesc.renderPass);

    const lateReject = coordinator.submitTileResult({
      tileId: stalledAssign.tileId, peerId: stalledAssign.peerId, attempt: stalledAssign.attempt,
      width: stalledDesc.width, height: stalledDesc.height, renderPass: stalledDesc.renderPass,
      pixels: validPixels, claimedChecksumHex: validHash, renderDurationMs: 700,
    });
    expect(lateReject.accepted).toBe(false);
    expect(lateReject.reason).toBe("not-assigned-to-peer");

    const recovered = coordinator.submitTileResult({
      tileId: secondWave[0].tileId, peerId: secondWave[0].peerId, attempt: secondWave[0].attempt,
      width: stalledDesc.width, height: stalledDesc.height, renderPass: stalledDesc.renderPass,
      pixels: validPixels, claimedChecksumHex: validHash, renderDurationMs: 21,
    });
    expect(recovered.accepted).toBe(true);
    expect(coordinator.getStats()).toMatchObject({ verifiedTiles: 2, timeoutFailoversCount: 1 });
  });

  it("손상된 타일 결과를 64비트 FNV-1a 체크섬으로 자동 거부·격리하고 정상 피어로 복구한다", () => {
    const coordinator = new P2pGridRenderCoordinator({ tileTimeoutMs: 2000, maxRetries: 3, quarantineRejectionLimit: 2 });
    coordinator.registerPeer({ peerId: "peer-faulty", displayName: "오염 노드", computeScore: 5.0, maxConcurrentTiles: 2, supportsWebGpu: true, rttMs: 1 });
    coordinator.registerPeer({ peerId: "peer-clean", displayName: "정상 노드", computeScore: 2.0, maxConcurrentTiles: 2, supportsWebGpu: true, rttMs: 4 });

    const pass: GridRenderPassKind = "screentone-filter";
    const tiles = coordinator.enqueueFrameGrid({ jobId: "verify-job", frameWidth: 64, frameHeight: 32, tileSize: 32, renderPass: pass });
    const faultyAssigns = coordinator.dispatchAvailableWork(100).filter((a) => a.peerId === "peer-faulty");
    expect(faultyAssigns.length).toBeGreaterThanOrEqual(1);

    for (const fa of faultyAssigns) {
      const desc = tiles.find((t) => t.tileId === fa.tileId)!;
      const cleanPixels = makeTilePixels(desc.width, desc.height, 9);
      const corruptedPixels = new Uint8Array(cleanPixels);
      corruptedPixels[12] ^= 0xff;
      const rejectRes = coordinator.submitTileResult({
        tileId: fa.tileId, peerId: "peer-faulty", attempt: fa.attempt,
        width: desc.width, height: desc.height, renderPass: pass, pixels: corruptedPixels,
        claimedChecksumHex: computeTileChecksum64(fa.tileId, desc.width, desc.height, cleanPixels, pass),
        renderDurationMs: 10,
      });
      expect(rejectRes).toMatchObject({ accepted: false, reason: "checksum-mismatch", requeued: true });
    }

    for (let guard = 0; coordinator.getStats().verifiedTiles < tiles.length && guard < 10; guard += 1) {
      for (const a of coordinator.dispatchAvailableWork(200 + guard * 20)) {
        expect(a.peerId).toBe("peer-clean");
        const desc = tiles.find((t) => t.tileId === a.tileId)!;
        const pixels = makeTilePixels(desc.width, desc.height, 77);
        expect(
          coordinator.submitTileResult({
            tileId: a.tileId, peerId: a.peerId, attempt: a.attempt,
            width: desc.width, height: desc.height, renderPass: pass, pixels,
            claimedChecksumHex: computeTileChecksum64(a.tileId, desc.width, desc.height, pixels, pass),
            renderDurationMs: 15,
          }).accepted,
        ).toBe(true);
      }
    }

    expect(coordinator.getStats().verifiedTiles).toBe(tiles.length);
    const faultyState = coordinator.getPeerStates().find((p) => p.peerId === "peer-faulty");
    expect(faultyState?.rejectedTiles).toBeGreaterThanOrEqual(1);
    if (faultyAssigns.length >= 2) expect(faultyState?.quarantined).toBe(true);
  });

  it("무서버 오프라인 AV 협업 동기화 패킷의 바이너리 직렬화·병합·변조 차단을 수행한다", () => {
    const coordA = new P2pGridRenderCoordinator();
    const coordB = new P2pGridRenderCoordinator();
    const packet = coordA.emitLocalCollabPacket({
      peerId: "peer-director", cutId: "cut-04", playheadMs: 12450.5, playing: true,
      audioCueId: "sfx-thunder-02", audioGainDb: -3.5, cursorX: 412.25, cursorY: 780.75,
      annotationHash: fnv1a64StringHex("arrow-highlight-1"), sentAtMs: 5000,
    });

    const wireBytes = encodeAvCollabPacketBinary(packet);
    const decoded = decodeAvCollabPacketBinary(wireBytes);
    expect(decoded?.audioCueId).toBe("sfx-thunder-02");
    expect(coordB.applyCollabSyncPacket(decoded!).accepted).toBe(true);
    expect(coordB.applyCollabSyncPacket(decoded!)).toMatchObject({ accepted: false, reason: "stale-clock" });

    const forged = { ...createOfflineAvCollabPacket({ ...packet, lamportClock: packet.lamportClock + 1 }), playheadMs: 99999 };
    expect(coordB.applyCollabSyncPacket(forged)).toMatchObject({ accepted: false, reason: "checksum-mismatch" });

    const corruptedWire = new Uint8Array(wireBytes);
    corruptedWire[corruptedWire.length - 4] ^= 0x55;
    expect(decodeAvCollabPacketBinary(corruptedWire)).toBeNull();
  });
});

describe("RealTimeAssetStreamPipeline (반응형 DAG 핫스왑 · 머클 자가치유)", () => {
  it("material -> prop3d -> cut -> episode 반응형 DAG 핫스왑을 위상 순서로 전파하고 locked 핀을 보존한다", () => {
    const pipeline = new RealTimeAssetStreamPipeline("studio-node-a");
    const events: HotSwapDeltaEvent[] = [];
    const unsubscribe = pipeline.subscribeHotSwap((ev) => events.push(ev));

    pipeline.registerAsset({ assetId: "mat-wood-oak", kind: "material", payload: ENCODER.encode("oak-pbr-v1") });
    pipeline.registerAsset({ assetId: "prop-desk", kind: "prop3d", payload: ENCODER.encode("desk-mesh-v1"), dependencies: [{ dependencyId: "mat-wood-oak", pinMode: "floating" }] });
    pipeline.registerAsset({ assetId: "cut-01-live", kind: "cut", payload: ENCODER.encode("cut-01-scene"), dependencies: [{ dependencyId: "prop-desk", pinMode: "floating" }] });
    pipeline.registerAsset({ assetId: "cut-02-locked", kind: "cut", payload: ENCODER.encode("cut-02-final"), dependencies: [{ dependencyId: "prop-desk", pinMode: "locked" }] });
    pipeline.registerAsset({
      assetId: "ep-01", kind: "episode", payload: ENCODER.encode("episode-01"),
      dependencies: [{ dependencyId: "cut-01-live", pinMode: "floating" }, { dependencyId: "cut-02-locked", pinMode: "floating" }],
    });

    const delta = pipeline.publishHotSwap("mat-wood-oak", ENCODER.encode("oak-pbr-v2-warm"), 2000);
    unsubscribe();

    expect(events).toHaveLength(1);
    expect(delta.affectedAssetIds).toEqual(["prop-desk", "cut-01-live", "ep-01"]);
    expect(delta.skippedLockedAssetIds).toEqual(["cut-02-locked"]);
    expect(pipeline.getAssetNode("cut-02-locked")?.dependencies[0].pinnedVersion).toBe(1);
    expect(pipeline.getAssetNode("cut-01-live")?.dependencies[0].pinnedVersion).toBe(2);
  });

  it("DAG 계층 위반과 변조된 원격 CRDT 업데이트를 차단한다", () => {
    const pipeline = new RealTimeAssetStreamPipeline("studio-node-b");
    pipeline.registerAsset({ assetId: "ep-root", kind: "episode", payload: ENCODER.encode("ep") });
    expect(() =>
      pipeline.registerAsset({ assetId: "mat-illegal", kind: "material", payload: ENCODER.encode("mat"), dependencies: [{ dependencyId: "ep-root" }] }),
    ).toThrow(/DAG 계층 위반/);

    expect(
      pipeline.mergeRemoteCrdtUpdate({
        assetId: "ep-root", lamportClock: 10, replicaId: "peer-z",
        payload: ENCODER.encode("tampered-ep"), claimedContentHash: "deadbeefcafebabe",
      }),
    ).toMatchObject({ applied: false, reason: "hash-mismatch" });
  });

  it("로컬 캐시 손상을 머클 루트로 탐지하고 오염 피어를 거른 뒤 정상 피어에서 자가치유한다", () => {
    const pipeline = new RealTimeAssetStreamPipeline("studio-local");
    const matBytes = ENCODER.encode("material-toon-ink-v3");
    const propBytes = ENCODER.encode("prop-classroom-window-mesh");
    const cutBytes = ENCODER.encode("cut-12-layout");

    pipeline.registerAsset({ assetId: "mat-ink", kind: "material", payload: matBytes });
    pipeline.registerAsset({ assetId: "prop-window", kind: "prop3d", payload: propBytes, dependencies: [{ dependencyId: "mat-ink" }] });
    pipeline.registerAsset({ assetId: "cut-12", kind: "cut", payload: cutBytes, dependencies: [{ dependencyId: "prop-window" }] });

    const cleanRoot = pipeline.getMerkleRootHex();
    pipeline.writeRawLocalCacheForTest("mat-ink", ENCODER.encode("CORRUPTED_MAT"));
    pipeline.writeRawLocalCacheForTest("prop-window", ENCODER.encode("CORRUPTED_PROP"));

    const brokenAudit = pipeline.auditIntegrity();
    expect(brokenAudit.healthy).toBe(false);
    expect(brokenAudit.actualMerkleRootHex).not.toBe(cleanRoot);
    expect(brokenAudit.corruptedAssetIds).toEqual(["mat-ink", "prop-window"]);

    const poisonedPeer: MerklePeerReplicaSource = { peerId: "peer-poisoned", fetchAssetBytes: () => ENCODER.encode("MALICIOUS") };
    const healthyPeer: MerklePeerReplicaSource = {
      peerId: "peer-lan-backup",
      fetchAssetBytes: (id) => (id === "mat-ink" ? matBytes : id === "prop-window" ? propBytes : null),
    };

    const healReport = pipeline.selfHealFromPeers([poisonedPeer, healthyPeer]);
    expect(healReport).toMatchObject({
      fullyHealed: true, rejectedPeerPayloads: 2,
      healedAssetIds: ["mat-ink", "prop-window"], verifiedMerkleRootHex: cleanRoot,
    });
    expect(healReport.recoveredFromPeerIds["mat-ink"]).toBe("peer-lan-backup");
    expect(fnv1a64Hex(pipeline.getLocalPayload("mat-ink")!)).toBe(fnv1a64Hex(matBytes));
    expect(pipeline.auditIntegrity().healthy).toBe(true);
  });
});

describe("AdaptiveBrushDynamicsSolver & WebGPU 선화 초해상도 업스케일러", () => {
  it("4종 프리셋의 필압·속도·기울기 물리 응답과 프리셋 특성을 정확히 반영한다", () => {
    expect(Object.keys(BRUSH_DYNAMICS_PRESETS)).toHaveLength(4);

    const gpen = new AdaptiveBrushDynamicsSolver({ presetId: "ink-gpen" });
    const light = gpen.evaluateSample({ x: 0, y: 0, timestampMs: 0, pressure: 0.15, tiltXDeg: 5, tiltYDeg: 0 });
    const heavySlow = gpen.evaluateSample({ x: 4, y: 0, timestampMs: 50, pressure: 0.92, tiltXDeg: 5, tiltYDeg: 0 });
    const heavyFast = gpen.evaluateSample({ x: 120, y: 0, timestampMs: 100, pressure: 0.92, tiltXDeg: 5, tiltYDeg: 0 });

    expect(heavySlow.effectiveRadiusPx).toBeGreaterThan(light.effectiveRadiusPx);
    expect(heavySlow.inkFlow).toBeGreaterThan(light.inkFlow);
    expect(heavySlow.opacity).toBeGreaterThan(light.opacity);
    expect(heavyFast.velocityPxPerSec).toBeGreaterThan(heavySlow.velocityPxPerSec);
    expect(heavyFast.effectiveRadiusPx).toBeLessThan(heavySlow.effectiveRadiusPx);

    const water = new AdaptiveBrushDynamicsSolver({ presetId: "watercolor-wet" });
    water.evaluateSample({ x: 0, y: 0, timestampMs: 0, pressure: 0.7, tiltXDeg: 10, tiltYDeg: 5 });
    const waterSlow = water.evaluateSample({ x: 2, y: 0, timestampMs: 40, pressure: 0.7, tiltXDeg: 10, tiltYDeg: 5 });
    const waterFast = water.evaluateSample({ x: 100, y: 0, timestampMs: 80, pressure: 0.7, tiltXDeg: 10, tiltYDeg: 5 });
    expect(waterSlow.wetCapillaryBleed).toBeGreaterThan(heavySlow.wetCapillaryBleed * 4);
    expect(waterFast.wetCapillaryBleed).toBeLessThan(waterSlow.wetCapillaryBleed);

    const charcoal = new AdaptiveBrushDynamicsSolver({ presetId: "charcoal-dry" });
    const upright = charcoal.evaluateSample({ x: 0, y: 0, timestampMs: 0, pressure: 0.65, tiltXDeg: 0, tiltYDeg: 0 });
    const tilted = charcoal.evaluateSample({ x: 8, y: 0, timestampMs: 30, pressure: 0.65, tiltXDeg: 55, tiltYDeg: 20 });
    expect(tilted.bristleSpread).toBeGreaterThan(upright.bristleSpread);
    expect(tilted.aspectRatio).toBeGreaterThan(upright.aspectRatio);
    expect(tilted.paperToothDrag).toBeGreaterThan(heavySlow.paperToothDrag * 3);

    const marker = new AdaptiveBrushDynamicsSolver({ presetId: "screentone-marker" });
    expect(marker.evaluateSample({ x: 0, y: 0, timestampMs: 0, pressure: 0.7, tiltXDeg: 45, tiltYDeg: 0 }).aspectRatio).toBeGreaterThan(2.0);
  });

  it("선택적 WebNN 잔차 훅을 안전 범위(±0.25)로 클램프해 적용한다", () => {
    const sample = { x: 10, y: 10, timestampMs: 16, pressure: 0.6, tiltXDeg: 15, tiltYDeg: 10 };
    const baseOut = new AdaptiveBrushDynamicsSolver({ presetId: "watercolor-wet" }).evaluateSample(sample);
    const hookedOut = new AdaptiveBrushDynamicsSolver({
      presetId: "watercolor-wet",
      webnnResidualHook: () => ({ bristleSpreadDelta: 99, inkFlowDelta: -99, capillaryBleedDelta: Number.NaN, opacityDelta: 0.12 }),
    }).evaluateSample(sample);

    expect(baseOut.webnnApplied).toBe(false);
    expect(hookedOut.webnnApplied).toBe(true);
    expect(hookedOut.bristleSpread - baseOut.bristleSpread).toBeLessThanOrEqual(0.250001);
    expect(hookedOut.inkFlow).toBeGreaterThanOrEqual(0.05);
    expect(Number.isFinite(hookedOut.wetCapillaryBleed)).toBe(true);
  });

  it("WGSL 선화 초해상도 셰이더 정적 검증을 통과하고 잘못된 소스를 거부한다", () => {
    expect(validateLineArtUpscalerWgslSource(WGSL_LINEART_SUPER_RES_2X)).toMatchObject({
      valid: true, hasComputeEntry: true, hasWorkgroup16x16: true, bindingCount: 3, balancedBraces: true, hasForbiddenGlslBuiltins: false,
    });
    const invalid = validateLineArtUpscalerWgslSource("fn broken() { let d = hypot(1.0, 2.0); ");
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("2×/4× 선화 초해상도 CPU 구현이 링잉 헤일로 0건으로 대각선 에지 선명도를 높인다", () => {
    const srcSize = 12;
    const srcGray = makeDiagonalLineArtGray(srcSize);
    const up2x = upscaleLineArtCrisp2xCpu({ width: srcSize, height: srcSize, channels: 1, pixels: srcGray });

    expect(up2x).toMatchObject({ width: 24, height: 24, ringingOvershootCount: 0 });
    expect(up2x.edgeSharpnessGain).toBeGreaterThan(1.1);
    expect(up2x.diagonalContinuityScore).toBeGreaterThan(0.8);

    for (let oy = 0; oy < up2x.height; oy += 1) {
      const iy = oy >> 1;
      const ny = Math.max(0, Math.min(srcSize - 1, iy + ((oy & 1) === 1 ? 1 : -1)));
      for (let ox = 0; ox < up2x.width; ox += 1) {
        const ix = ox >> 1;
        const nx = Math.max(0, Math.min(srcSize - 1, ix + ((ox & 1) === 1 ? 1 : -1)));
        const lo = Math.min(srcGray[iy * srcSize + ix], srcGray[iy * srcSize + nx], srcGray[ny * srcSize + ix], srcGray[ny * srcSize + nx]);
        const hi = Math.max(srcGray[iy * srcSize + ix], srcGray[iy * srcSize + nx], srcGray[ny * srcSize + ix], srcGray[ny * srcSize + nx]);
        const val = up2x.pixels[oy * up2x.width + ox];
        expect(val).toBeGreaterThanOrEqual(lo);
        expect(val).toBeLessThanOrEqual(hi);
      }
    }

    const rgbaSrc = new Uint8Array(8 * 8 * 4);
    for (let i = 0; i < 64; i += 1) {
      const v = i % 9 === 0 ? 15 : 240;
      rgbaSrc[i * 4] = v; rgbaSrc[i * 4 + 1] = v; rgbaSrc[i * 4 + 2] = v; rgbaSrc[i * 4 + 3] = 255;
    }
    const up4x = upscaleLineArtCrispCpu(
      { width: 8, height: 8, channels: 4, pixels: rgbaSrc }, 4,
      { webnnRefinerHook: ({ blendedValue }) => blendedValue * 2.5 - 120 },
    );
    expect(up4x).toMatchObject({ width: 32, height: 32, scale: 4, webnnRefined: true, ringingOvershootCount: 0 });
  });
});

describe("DepthParallaxEpisodeExporter (2.5D 깊이 시차 매니페스트 & UV 행렬)", () => {
  it("깊이별 시차 UV 이동 방향·초점면 무이동·자이로 클램프·reducedMotion 폴백을 정확히 계산한다", () => {
    const constraints = DEFAULT_PARALLAX_CAMERA_CONSTRAINTS;
    const fgPad = computeDisocclusionPadding(800, 1200, 0.1, constraints);
    const focalPad = computeDisocclusionPadding(800, 1200, 0.5, constraints);
    const bgPad = computeDisocclusionPadding(800, 1200, 0.9, constraints);
    expect(focalPad).toMatchObject({ padX: 0, padY: 0 });
    expect(fgPad.padX).toBeGreaterThan(0);

    const extremePose = { gyroPitchDeg: 90, gyroRollDeg: 90, scrollProgress: 1.0 };
    const fgEval = evaluateParallaxUvMatrix({ layerId: "fg", depthNormalized: 0.1, disocclusionPadding: fgPad }, extremePose, constraints);
    const focalEval = evaluateParallaxUvMatrix({ layerId: "mid", depthNormalized: 0.5, disocclusionPadding: focalPad }, extremePose, constraints);
    const bgEval = evaluateParallaxUvMatrix({ layerId: "bg", depthNormalized: 0.9, disocclusionPadding: bgPad }, extremePose, constraints);

    expect(fgEval.clampedNormYaw).toBe(1);
    expect(focalEval).toMatchObject({ shiftU: 0, shiftV: 0 });
    expect(fgEval.shiftU).toBeGreaterThan(0);
    expect(bgEval.shiftU).toBeLessThan(0);
    expect(Math.abs(fgEval.shiftU + bgEval.shiftU)).toBeLessThan(1e-9);

    for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
      const [fu, fv] = applyParallaxUvMatrix3x3(fgEval.uvMatrix3x3, u, v);
      expect(fu).toBeGreaterThanOrEqual(0);
      expect(fu).toBeLessThanOrEqual(1);
      expect(fv).toBeGreaterThanOrEqual(0);
      expect(fv).toBeLessThanOrEqual(1);
    }

    const reducedEval = evaluateParallaxUvMatrix(
      { layerId: "fg", depthNormalized: 0.1, disocclusionPadding: fgPad },
      { ...extremePose, reducedMotion: true }, constraints,
    );
    expect(reducedEval).toMatchObject({ shiftU: 0, shiftV: 0 });
  });

  it("디스오클루전 외곽 보간 패딩과 무서버 인터랙티브 매니페스트 무결성을 검증한다", () => {
    const srcRgba = makeTilePixels(16, 16, 33);
    const filled = generateDisocclusionEdgeFillRgba(srcRgba, 16, 16, 3, 4);
    expect(filled).toMatchObject({ paddedWidth: 22, paddedHeight: 24 });
    expect(filled.pixels[3]).toBe(255);
    expect(filled.pixels[filled.pixels.length - 1]).toBe(255);

    const exporter = new DepthParallaxEpisodeExporter();
    const manifest = exporter.exportManifest({
      episodeId: "ep-101-parallax", title: "비 오는 골목 2.5D 시차 화", exportedAtIso: "2026-11-26T10:00:00.000Z",
      cuts: [{
        cutId: "cut-01", cutIndex: 0, aspectRatio: 9 / 16,
        layers: [
          { layerId: "layer-rain-fg", cutId: "cut-01", label: "근경 빗방울", width: 16, height: 16, depthNormalized: 0.12, assetRef: "cas://rain-fg", rgbaPixels: srcRgba },
          { layerId: "layer-sky-bg", cutId: "cut-01", label: "원경 야경", width: 16, height: 16, depthNormalized: 0.92, assetRef: "cas://sky-bg" },
          { layerId: "layer-hero-focal", cutId: "cut-01", label: "인물 초점면", width: 16, height: 16, depthNormalized: 0.5, assetRef: "cas://hero-mid" },
        ],
      }],
    });

    expect(manifest).toMatchObject({ schemaVersion: PARALLAX_MANIFEST_SCHEMA_VERSION, serverDependency: PARALLAX_ZERO_SERVER_TAG, totalLayers: 3 });
    expect(manifest.cuts[0].layers.map((l) => l.layerId)).toEqual(["layer-sky-bg", "layer-hero-focal", "layer-rain-fg"]);
    expect(exporter.verifyManifestIntegrity(manifest).valid).toBe(true);
    expect(exporter.verifyManifestIntegrity({ ...manifest, title: "변조된 제목" }).valid).toBe(false);
  });
});

describe("AutonomousFrameTelemetryGate (자율 120Hz 프레임 텔레메트리 & 컷 귀속 회귀 게이트)", () => {
  it("정상 120Hz 워크로드와 톱니형 GC 힙 패턴에서 통과하며 힙 누수 오탐을 내지 않는다", () => {
    const gate = new AutonomousFrameTelemetryGate({ ringCapacity: 64, frameBudgetMs: TARGET_120HZ_FRAME_BUDGET_MS, vramBudgetBytes: 256 * 1024 * 1024 });
    for (let i = 0; i < 80; i += 1) {
      gate.recordFrame({
        frameMs: 5.2 + (i % 5) * 0.45, heapUsedBytes: 40 * 1024 * 1024 + (i % 10) * 180 * 1024,
        vramUsedBytes: 120 * 1024 * 1024, cutId: i % 2 === 0 ? "cut-01" : "cut-02", timestampMs: i * 8.33,
      });
    }

    const report = gate.evaluateGate();
    expect(report).toMatchObject({ status: "pass", sampleCount: 64, totalFramesRecorded: 80, primaryCulpritCutId: null });
    expect(report.frameTiming.meets120HzTarget).toBe(true);
    expect(report.frameTiming.p99Ms).toBeLessThanOrEqual(TARGET_120HZ_FRAME_BUDGET_MS);
    expect(report.heapLeak.detected).toBe(false);
    expect(report.vram.budgetExceeded).toBe(false);
    expect(report.vram.headroomBytes).toBeGreaterThan(100 * 1024 * 1024);
  });

  it("특정 컷의 120Hz P99 프레임 회귀를 탐지하고 원인 컷을 자동 귀속한다", () => {
    const gate = new AutonomousFrameTelemetryGate({ ringCapacity: 128 });
    for (let i = 0; i < 100; i += 1) {
      const heavy = i >= 80 && i < 95;
      gate.recordFrame({
        frameMs: heavy ? 14.8 : 5.6, heapUsedBytes: 48 * 1024 * 1024,
        vramUsedBytes: 160 * 1024 * 1024, cutId: heavy ? "cut-07-explosion" : "cut-01-dialogue", timestampMs: i * 8.33,
      });
    }

    const report = gate.evaluateGate();
    expect(report).toMatchObject({ status: "fail", primaryCulpritCutId: "cut-07-explosion" });
    expect(report.frameTiming.meets120HzTarget).toBe(false);
    expect(report.frameTiming.p99Ms).toBeGreaterThan(TARGET_120HZ_FRAME_BUDGET_MS);
    expect(report.regressions.some((r) => r.code === "frame-p99-regression")).toBe(true);
  });

  it("지속적 단조 힙 누수와 VRAM 예산 초과를 탐지해 각각의 원인 컷을 정확히 귀속한다", () => {
    const leakGate = new AutonomousFrameTelemetryGate({ ringCapacity: 128, maxHeapSlopeBytesPerSec: 256 * 1024 });
    let heap = 64 * 1024 * 1024;
    for (let i = 0; i < 60; i += 1) {
      const leaking = i % 2 === 1;
      if (leaking) heap += 64 * 1024;
      leakGate.recordFrame({
        frameMs: 6.1, heapUsedBytes: heap, vramUsedBytes: 150 * 1024 * 1024,
        cutId: leaking ? "cut-05-particles" : "cut-04-static", timestampMs: i * 16.6,
      });
    }
    const leakReport = leakGate.evaluateGate();
    expect(leakReport).toMatchObject({ status: "fail", primaryCulpritCutId: "cut-05-particles" });
    expect(leakReport.heapLeak.detected).toBe(true);
    expect(leakReport.heapLeak.rSquared).toBeGreaterThan(0.95);

    const vramGate = new AutonomousFrameTelemetryGate({ ringCapacity: 64, vramBudgetBytes: 256 * 1024 * 1024 });
    for (let i = 0; i < 30; i += 1) {
      const heavyVram = i >= 20;
      vramGate.recordFrame({
        frameMs: 6.4, heapUsedBytes: 50 * 1024 * 1024,
        vramUsedBytes: heavyVram ? 310 * 1024 * 1024 : 110 * 1024 * 1024,
        cutId: heavyVram ? "cut-09-4k-atlas" : "cut-08-normal", timestampMs: i * 8.33,
      });
    }
    const vramReport = vramGate.evaluateGate();
    expect(vramReport).toMatchObject({ status: "fail", primaryCulpritCutId: "cut-09-4k-atlas" });
    expect(vramReport.vram.budgetExceeded).toBe(true);
    expect(vramReport.vram.pressureLevel).toBe("critical");
    expect(vramReport.vram.headroomBytes).toBeLessThan(0);
  });
});
