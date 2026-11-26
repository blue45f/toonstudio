import { describe, expect, it } from "vitest";

import {
  DEFAULT_MSDF_PX_RANGE,
  DEFAULT_MSDF_TILE_SIZE,
  InMemoryBroadcastHub,
  InMemoryLockManager,
  InMemorySharedWorkerRelay,
  MSDF_UNIFORM_BYTES,
  MsdfGlyphAtlas,
  StudioMultiWindowSyncCoordinator,
  VRS_MASK_BALLOON_TEXT,
  VRS_MASK_CHARACTER_FACE,
  VRS_MASK_LINE_ART,
  VRS_RATE_1X1,
  VRS_RATE_2X2,
  VRS_RATE_4X4,
  VRS_UNIFORM_BYTES,
  WGSL_COMPUTE_VRS_TILE_CLASSIFIER,
  WGSL_MSDF_KOREAN_TEXT_RASTER,
  applyWarpToLocalUv,
  buildKoreanGlyphContours,
  classifyVrsTileRatesCpu,
  createPerspectiveSfxWarpMatrix,
  evaluateMsdfSampleCpu,
  extrudeVectorPlanToManifoldMesh,
  generateGlyphMsdfTile,
  invertMatrix3x3,
  median3,
  packMsdfUniforms,
  packVrsClassifierUniforms,
  validateManifoldMeshTopology,
  validateMsdfWgslShader,
  validateVrsWgslShader,
  type StateDeltaFrameMessage,
} from "./index";

function createSyntheticWebtoonFrame(width: number, height: number): {
  readonly rgba: Uint8ClampedArray;
  readonly mask: Uint8Array;
} {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const mask = new Uint8Array(width * height);

  // 1) 전체 배경: 평탄한 웹툰 하늘/여백 (4×4 타일 유도)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      rgba[idx] = 236;
      rgba[idx + 1] = 242;
      rgba[idx + 2] = 250;
      rgba[idx + 3] = 255;
    }
  }

  // 2) 중간 디테일 영역: 완만한 셀 그라데이션 (2×2 타일 유도, x: 0..width, y: 55%..75%)
  const gradY0 = Math.floor(height * 0.5625);
  const gradY1 = Math.floor(height * 0.75);
  for (let y = gradY0; y < gradY1; y += 1) {
    const shade = Math.round(140 + ((y - gradY0) % 16) * 4.5);
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      rgba[idx] = shade;
      rgba[idx + 1] = shade;
      rgba[idx + 2] = Math.min(255, shade + 10);
      rgba[idx + 3] = 255;
    }
  }

  // 3) 고디테일 선화 영역: 고대비 격자 선화 (1×1 타일 유도, 좌하단 일부)
  for (let y = Math.floor(height * 0.78); y < Math.floor(height * 0.94); y += 1) {
    for (let x = 32; x < 160; x += 1) {
      const isInk = (x + y) % 4 === 0 || (x - y + 512) % 5 === 0;
      const v = isInk ? 18 : 248;
      const idx = (y * width + x) * 4;
      rgba[idx] = v;
      rgba[idx + 1] = v;
      rgba[idx + 2] = v;
      rgba[idx + 3] = 255;
      if (isInk) {
        mask[y * width + x] = VRS_MASK_LINE_ART;
      }
    }
  }

  // 4) 말풍선 한글 텍스트 및 캐릭터 얼굴 보호 마스크 (평탄 배경이어도 1×1 강제 보존)
  for (let y = 48; y < 96; y += 1) {
    for (let x = 320; x < 416; x += 1) {
      mask[y * width + x] = VRS_MASK_BALLOON_TEXT;
    }
  }
  for (let y = 160; y < 224; y += 1) {
    for (let x = 208; x < 272; x += 1) {
      mask[y * width + x] = VRS_MASK_CHARACTER_FACE;
    }
  }

  return { rgba, mask };
}

describe("Module 1: Multi-window BroadcastChannel / SharedWorker + Web Locks sync", () => {
  it("coordinates 3 studio windows at 60fps with coalescing and transport deduplication", () => {
    let clockMs = 1000;
    const now = (): number => clockMs;
    const hub = new InMemoryBroadcastHub();
    const relay = new InMemorySharedWorkerRelay();
    const lockManager = new InMemoryLockManager();

    const ref3dFrames: StateDeltaFrameMessage[] = [];
    const timelineFrames: StateDeltaFrameMessage[] = [];

    const mainWin = new StudioMultiWindowSyncCoordinator({
      windowId: "win-main",
      role: "main-canvas",
      now,
      broadcastChannel: hub.createChannel(),
      sharedWorkerPort: relay.connectPort(),
      lockManager,
    });
    const ref3dWin = new StudioMultiWindowSyncCoordinator({
      windowId: "win-ref3d",
      role: "reference-3d-popout",
      now,
      broadcastChannel: hub.createChannel(),
      sharedWorkerPort: relay.connectPort(),
      lockManager,
      onRemoteDelta: (frame) => ref3dFrames.push(frame),
    });
    const timelineWin = new StudioMultiWindowSyncCoordinator({
      windowId: "win-timeline",
      role: "timeline-navigator",
      now,
      broadcastChannel: hub.createChannel(),
      sharedWorkerPort: relay.connectPort(),
      lockManager,
      onRemoteDelta: (frame) => timelineFrames.push(frame),
    });

    mainWin.start();
    ref3dWin.start();
    timelineWin.start();

    expect(mainWin.getActivePeers().map((p) => p.windowId)).toEqual([
      "win-main",
      "win-timeline",
      "win-ref3d",
    ]);
    expect(mainWin.isLeader()).toBe(true);
    expect(ref3dWin.getLeaderWindowId()).toBe("win-main");
    expect(timelineWin.getLeaderWindowId()).toBe("win-main");

    // 1) 첫 번째 카메라 업데이트는 즉시 전송(프레임 1)
    const flushed1 = mainWin.publishCameraDelta({
      panX: 120,
      panY: -40,
      zoom: 1.5,
      rotationRad: 0,
      camera3dPos: [0, 1.6, 4.2],
      camera3dTarget: [0, 1.2, 0],
      fovDeg: 45,
      revision: 1,
    });
    expect(flushed1).toBe(true);

    // 2) 16.67ms 예산 내 연속 8회 고빈도 입력은 단일 프레임으로 병합(coalescing)
    for (let step = 2; step <= 9; step += 1) {
      clockMs += 1.5;
      const sentNow = mainWin.publishCameraDelta({
        panX: 120 + step * 10,
        panY: -40 - step * 2,
        zoom: 1.5 + step * 0.05,
        rotationRad: 0.01 * step,
        revision: step,
      });
      expect(sentNow).toBe(false);
    }
    mainWin.publishSelectionDelta({
      selectedNodeIds: ["char-rig-01", "balloon-sfx-07"],
      selectedBoneId: "head",
      bounds: [10, 20, 210, 320],
      revision: 1,
    });
    mainWin.publishActiveLayerDelta({
      activeLayerId: "layer-ink-main",
      activeFrameIndex: 14,
      activeCutId: "cut-04",
      opacity: 1,
      revision: 1,
    });

    // 16.67ms 경과 후 플러시 -> 병합된 단일 프레임이 3D 팝아웃·타임라인 창에 정확히 1회만 적용(이중 채널 중복 제거)
    clockMs += 6;
    const frame2 = mainWin.flushPendingFrame();
    expect(frame2).not.toBeNull();
    expect(frame2?.coalescedCount).toBe(10);
    expect(ref3dFrames).toHaveLength(2);
    expect(timelineFrames).toHaveLength(2);

    expect(ref3dWin.getLatestState().camera?.revision).toBe(9);
    expect(ref3dWin.getLatestState().selection?.selectedBoneId).toBe("head");
    expect(timelineWin.getLatestState().activeLayer?.activeFrameIndex).toBe(14);
    // BroadcastChannel + SharedWorker 이중 수신 시 중복 프레임이 정확히 제거됨
    expect(ref3dWin.getTelemetry().duplicateFramesDropped).toBe(2);
    expect(mainWin.getTelemetry().eventsCoalesced).toBe(9);

    mainWin.close();
    ref3dWin.close();
    timelineWin.close();
  });

  it("prevents concurrent OPFS/SQLite-WASM write collisions via Web Locks exclusive leases", async () => {
    let clockMs = 5000;
    const hub = new InMemoryBroadcastHub();
    const lockManager = new InMemoryLockManager();
    const receivedCommits: number[] = [];

    const mainWin = new StudioMultiWindowSyncCoordinator({
      windowId: "win-main",
      role: "main-canvas",
      now: () => clockMs,
      broadcastChannel: hub.createChannel(),
      lockManager,
    });
    const ref3dWin = new StudioMultiWindowSyncCoordinator({
      windowId: "win-ref3d",
      role: "reference-3d-popout",
      now: () => clockMs,
      broadcastChannel: hub.createChannel(),
      lockManager,
      onOpfsCommit: (c) => receivedCommits.push(c.walEpoch),
    });
    const timelineWin = new StudioMultiWindowSyncCoordinator({
      windowId: "win-timeline",
      role: "timeline-navigator",
      now: () => clockMs,
      broadcastChannel: hub.createChannel(),
      lockManager,
    });

    mainWin.start();
    ref3dWin.start();
    timelineWin.start();

    let activeWriters = 0;
    let peakWriters = 0;
    const writeLog: string[] = [];

    const runSerializedWrite = async (
      coord: StudioMultiWindowSyncCoordinator,
      opName: string,
      ticks: number,
    ) => {
      return await coord.withExclusiveOpfsWriteLease(
        opName,
        async (ctx) => {
          activeWriters += 1;
          peakWriters = Math.max(peakWriters, activeWriters);
          writeLog.push(`begin:${ctx.windowId}:${ctx.fencingToken}`);
          for (let i = 0; i < ticks; i += 1) {
            clockMs += 2;
            await Promise.resolve();
          }
          // 다른 창이 ifAvailable로 즉시 잠금 시도하면 안전하게 거절되어야 함
          if (coord === mainWin) {
            const probe = await ref3dWin.withExclusiveOpfsWriteLease(
              "nonblocking-autosave-probe",
              () => "should-not-run",
              { ifAvailable: true },
            );
            expect(probe.acquired).toBe(false);
          }
          writeLog.push(`end:${ctx.windowId}:${ctx.fencingToken}`);
          activeWriters -= 1;
          return ctx.fencingToken;
        },
        { bytesWrittenHint: 4096 },
      );
    };

    const [r1, r2, r3] = await Promise.all([
      runSerializedWrite(mainWin, "commit-stroke-batch", 3),
      runSerializedWrite(ref3dWin, "commit-3d-pose-keyframe", 2),
      runSerializedWrite(timelineWin, "commit-cut-reorder", 2),
    ]);

    expect(peakWriters).toBe(1);
    expect(lockManager.getStats().peakConcurrentExclusiveHolders).toBe(1);
    expect(lockManager.getStats().totalWaitCount).toBeGreaterThanOrEqual(2);
    expect(lockManager.getStats().totalUnavailableRejections).toBe(1);
    expect([r1.acquired, r2.acquired, r3.acquired]).toEqual([true, true, true]);
    expect([r1.fencingToken, r2.fencingToken, r3.fencingToken]).toEqual([1, 2, 3]);
    expect(writeLog).toEqual([
      "begin:win-main:1",
      "end:win-main:1",
      "begin:win-ref3d:2",
      "end:win-ref3d:2",
      "begin:win-timeline:3",
      "end:win-timeline:3",
    ]);
    expect(mainWin.getTelemetry().overlapViolations).toBe(0);
    expect(ref3dWin.getTelemetry().overlapViolations).toBe(0);
    expect(timelineWin.getTelemetry().overlapViolations).toBe(0);
    expect(timelineWin.getLatestState().walEpoch).toBe(3);
    expect(receivedCommits.length).toBeGreaterThanOrEqual(2);

    mainWin.close();
    ref3dWin.close();
    timelineWin.close();
  });

  it("performs deterministic leader failover on graceful close and stale-tab heartbeat pruning", () => {
    let clockMs = 10_000;
    const hub = new InMemoryBroadcastHub();
    const leaderHistory: string[] = [];

    const mainWin = new StudioMultiWindowSyncCoordinator({
      windowId: "win-main",
      role: "main-canvas",
      now: () => clockMs,
      broadcastChannel: hub.createChannel(),
      stalePeerTimeoutMs: 3000,
    });
    const timelineWin = new StudioMultiWindowSyncCoordinator({
      windowId: "win-timeline",
      role: "timeline-navigator",
      now: () => clockMs,
      broadcastChannel: hub.createChannel(),
      stalePeerTimeoutMs: 3000,
    });
    const ref3dWin = new StudioMultiWindowSyncCoordinator({
      windowId: "win-ref3d",
      role: "reference-3d-popout",
      now: () => clockMs,
      broadcastChannel: hub.createChannel(),
      stalePeerTimeoutMs: 3000,
      onLeaderChange: (leaderId) => leaderHistory.push(leaderId),
    });

    mainWin.start();
    timelineWin.start();
    ref3dWin.start();
    expect(ref3dWin.getLeaderWindowId()).toBe("win-main");

    // 1) 메인 창 정상 종료 -> 타임라인 창으로 즉시 페일오버
    mainWin.close();
    expect(timelineWin.isLeader()).toBe(true);
    expect(ref3dWin.getLeaderWindowId()).toBe("win-timeline");

    // 2) 타임라인 창이 비정상 크래시(하트비트 중단) -> 3.5초 경과 후 만료 정리 -> 3D 팝아웃 창이 리더 승계
    clockMs += 3500;
    const pruned = ref3dWin.pruneStalePeers();
    expect(pruned).toEqual(["win-timeline"]);
    expect(ref3dWin.isLeader()).toBe(true);
    expect(ref3dWin.getActivePeers().map((p) => p.windowId)).toEqual(["win-ref3d"]);
    expect(leaderHistory).toContain("win-timeline");
    expect(leaderHistory[leaderHistory.length - 1]).toBe("win-ref3d");

    timelineWin.close();
    ref3dWin.close();
  });
});

describe("Module 2: WebGPU MSDF Korean font & SFX rasterizer", () => {
  it("validates WGSL MSDF shader structure and 128-byte uniform packing", () => {
    const validation = validateMsdfWgslShader(WGSL_MSDF_KOREAN_TEXT_RASTER);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.hasVertexEntry).toBe(true);
    expect(validation.hasFragmentEntry).toBe(true);
    expect(validation.hasMedian3).toBe(true);
    expect(validation.hasScreenPxRange).toBe(true);
    expect(validation.hasInkStroke).toBe(true);
    expect(validation.hasDropShadow).toBe(true);
    expect(validation.hasPerspectiveWarp).toBe(true);
    expect(validation.bindings).toHaveLength(3);

    const warp = createPerspectiveSfxWarpMatrix({
      skewX: 0.25,
      perspectiveX: 0.12,
      rotationRad: -0.08,
    });
    const packed = packMsdfUniforms(
      { zoomScale: 50, strokeWidthNorm: 0.18, warpMatrix: warp },
      512,
      512,
      4,
    );
    expect(packed.byteLength).toBe(MSDF_UNIFORM_BYTES);
    expect(packed[0]).toBe(512);
    expect(packed[2]).toBe(4);
    expect(packed[3]).toBe(50);

    // 역행렬 원근 워프 왕복 검증
    const inv = invertMatrix3x3(warp);
    const [u1, v1] = applyWarpToLocalUv(0.65, 0.35, warp);
    const [uBack, vBack] = applyWarpToLocalUv(u1, v1, inv);
    expect(uBack).toBeCloseTo(0.65, 5);
    expect(vBack).toBeCloseTo(0.35, 5);
  });

  it("preserves sharp 90-degree corner accuracy via median(r,g,b) across 1x / 10x / 50x zoom", () => {
    const squareContour = [
      [
        { x: 0.25, y: 0.25 },
        { x: 0.75, y: 0.25 },
        { x: 0.75, y: 0.75 },
        { x: 0.25, y: 0.75 },
      ],
    ] as const;

    const tile = generateGlyphMsdfTile("□", squareContour, {
      tileSize: DEFAULT_MSDF_TILE_SIZE,
      pxRange: DEFAULT_MSDF_PX_RANGE,
    });
    expect(tile.coloredEdgeCount).toBe(4);
    expect(median3(0.2, 0.8, 0.5)).toBeCloseTo(0.5, 6);

    // 정확히 90도 직각 꼭짓점 (0.25, 0.25)에서 MSDF median(r,g,b)는 단일 채널 SDF보다 모서리 오차가 크게 작아야 함
    const cornerEval = evaluateMsdfSampleCpu(tile, 0.25, 0.25, { zoomScale: 50 });
    expect(Math.abs(cornerEval.msdfSignedDistance)).toBeLessThan(0.02);
    expect(Math.abs(cornerEval.msdfSignedDistance)).toBeLessThan(
      Math.abs(cornerEval.singleChannelSignedDistance),
    );

    // 1x -> 10x -> 50x 배율에서 스크린 공간 픽셀 범위(screenPxRange)가 선형 확대되어 에지 선명도 유지
    const zooms = [1, 10, 50] as const;
    const transitionWidthsUv: number[] = [];
    for (const zoomScale of zooms) {
      const inside = evaluateMsdfSampleCpu(tile, 0.5, 0.5, { zoomScale, strokeWidthNorm: 0.16 });
      const outside = evaluateMsdfSampleCpu(tile, 0.05, 0.05, { zoomScale, strokeWidthNorm: 0.16 });
      const nearStroke = evaluateMsdfSampleCpu(tile, 0.235, 0.5, {
        zoomScale,
        strokeWidthNorm: 0.2,
      });
      const shadowSample = evaluateMsdfSampleCpu(tile, 0.79, 0.79, {
        zoomScale,
        strokeWidthNorm: 0.14,
        shadowOffsetUv: [0.06, 0.06],
        shadowSoftnessNorm: 0.15,
      });

      expect(inside.fillAlpha).toBe(1);
      expect(outside.fillAlpha).toBe(0);
      expect(nearStroke.strokeAlpha).toBeGreaterThan(nearStroke.fillAlpha);
      expect(shadowSample.shadowAlpha).toBeGreaterThan(0);

      // 0.1..0.9 알파 전이 폭을 UV 공간에서 스캔해 고배율일수록 물리적 선명도 상승 검증
      let minU = 1;
      let maxU = 0;
      const samples = 400;
      for (let i = 0; i <= samples; i += 1) {
        const u = 0.22 + (0.06 * i) / samples;
        const ev = evaluateMsdfSampleCpu(tile, u, 0.5, { zoomScale });
        if (ev.fillAlpha > 0.05 && ev.fillAlpha < 0.95) {
          minU = Math.min(minU, u);
          maxU = Math.max(maxU, u);
        }
      }
      transitionWidthsUv.push(Math.max(0, maxU - minU));
    }

    expect(transitionWidthsUv[1] ?? 1).toBeLessThan(transitionWidthsUv[0] ?? 0);
    expect(transitionWidthsUv[2] ?? 1).toBeLessThan(transitionWidthsUv[1] ?? 0);
  });

  it("packs Korean Hangul SFX and ASCII glyphs cleanly into MsdfGlyphAtlas", () => {
    const atlas = new MsdfGlyphAtlas({
      atlasWidth: 256,
      atlasHeight: 256,
      tileSize: 32,
      paddingPx: 2,
      pxRange: 4,
    });
    const slots = atlas.ensureText("쾅!! 두근두근 화르륵 A0!");
    expect(slots.length).toBeGreaterThanOrEqual(10);

    const stats = atlas.getStats();
    expect(stats.packedCount).toBe(9); // 고유 9글자: 쾅, !, 두, 근, 화, 르, 륵, A, 0 (중복 글리프는 캐시 재사용)
    expect(stats.occupancyRatio).toBeGreaterThan(0);
    expect(stats.bytesAllocated).toBe(256 * 256 * 4);

    // 캐시 히트 검증 및 슬롯 비겹침 검증
    const slotKwangA = atlas.ensureGlyph("쾅");
    const slotKwangB = atlas.ensureGlyph("쾅");
    expect(slotKwangA).toEqual(slotKwangB);
    expect(slotKwangA.advanceEm).toBe(1.0);
    expect(atlas.getSlot("!")?.advanceEm).toBe(0.62);

    const tileKwang = atlas.getTile("쾅");
    expect(tileKwang).toBeDefined();
    expect(buildKoreanGlyphContours("쾅").length).toBeGreaterThanOrEqual(3);
    if (tileKwang) {
      const center = evaluateMsdfSampleCpu(tileKwang, 0.5, 0.5, { zoomScale: 10 });
      const border = evaluateMsdfSampleCpu(tileKwang, 0.02, 0.02, { zoomScale: 10 });
      expect(border.fillAlpha).toBe(0);
      expect(center.screenPxRange).toBeCloseTo(40, 4);
    }
  });
});

describe("Module 3A: WebGPU Compute Tile-Level VRS Classifier", () => {
  it("validates VRS WGSL shader and reduces shading invocations by >= 50% while preserving 1x1 on protected tiles", () => {
    const wgslCheck = validateVrsWgslShader(WGSL_COMPUTE_VRS_TILE_CLASSIFIER);
    expect(wgslCheck.valid).toBe(true);
    expect(wgslCheck.workgroupSize).toEqual([16, 16, 1]);
    expect(wgslCheck.usesWorkgroupMemory).toBe(true);
    expect(wgslCheck.usesWorkgroupBarrier).toBe(true);
    expect(wgslCheck.bindings).toHaveLength(4);

    const uniformBuf = packVrsClassifierUniforms(512, 512);
    expect(uniformBuf.byteLength).toBe(VRS_UNIFORM_BYTES);

    const { rgba, mask } = createSyntheticWebtoonFrame(512, 512);
    const result = classifyVrsTileRatesCpu({
      width: 512,
      height: 512,
      rgba,
      semanticMask: mask,
    });

    expect(result.totalTiles).toBe(32 * 32);
    expect(result.rate1x1Count).toBeGreaterThan(0);
    expect(result.rate2x2Count).toBeGreaterThan(0);
    expect(result.rate4x4Count).toBeGreaterThan(0);
    expect(result.protectedMaskTileCount).toBeGreaterThan(0);
    // 선화·말풍선·얼굴 보호 타일은 100% 1×1 풀 레이트 보존
    expect(result.protectedMaskPreserved1x1Count).toBe(result.protectedMaskTileCount);
    // 대표 웹툰 컷 프레임에서 셰이딩 호출 수 50% 이상 절감 검증
    expect(result.invocationSavingsPercent).toBeGreaterThanOrEqual(50);

    // 평탄 하늘 타일(0, 0)은 4×4, 말풍선 텍스트 타일(20, 3)은 1×1 확인
    expect(result.tileRates[0]).toBe(VRS_RATE_4X4);
    expect(result.tileRates[3 * result.tilesX + 20]).toBe(VRS_RATE_1X1);
    // 셀 그라데이션 행(18)은 2×2 확인
    expect(result.tileRates[18 * result.tilesX + 2]).toBe(VRS_RATE_2X2);
  });
});

describe("Module 3B: On-Device 2D Vector Floorplan -> 3D Manifold Architectural CAD Converter", () => {
  it("extrudes concave polygon, door/window wall, and stairs into a strictly watertight manifold mesh grounded at Y=0", () => {
    const mesh = extrudeVectorPlanToManifoldMesh({
      uvMetersPerTile: 1.0,
      groundToZeroY: true,
      elements: [
        // 1) 오목(L자) 건축 바닥 슬래브: 면적 = 4*4 - 2*2 = 12m², 높이 0.2m -> 부피 2.4m³
        {
          kind: "polygon",
          id: "floor-l-slab",
          materialSlot: "floor",
          elevationYM: 0,
          heightM: 0.2,
          points: [
            { x: 0, z: 0 },
            { x: 4, z: 0 },
            { x: 4, z: 2 },
            { x: 2, z: 2 },
            { x: 2, z: 4 },
            { x: 0, z: 4 },
          ],
        },
        // 2) 문(0.9×2.1m) + 창문(1.2×1.2m) 개구부가 뚫린 5m 외벽:
        // 총 면적 5*2.8 = 14m², 개구부 1.89 + 1.44 = 3.33m² -> 순면적 10.67m² * 두께 0.2m = 2.134m³
        {
          kind: "wall",
          id: "exterior-wall-south",
          materialSlot: "wall",
          start: { x: 0, z: -1 },
          end: { x: 5, z: -1 },
          thicknessM: 0.2,
          heightM: 2.8,
          elevationYM: 0,
          openings: [
            { kind: "door", offsetAlongM: 0.6, widthM: 0.9, sillHeightM: 0, openingHeightM: 2.1 },
            { kind: "window", offsetAlongM: 2.4, widthM: 1.2, sillHeightM: 0.9, openingHeightM: 1.2 },
          ],
        },
        // 3) 6단 계단: 너비 1.2m, 수평 1.8m, 높이 1.2m -> 셀 21/36 * (1.2*1.8*1.2) = 1.512m³
        {
          kind: "stairs",
          id: "main-stairs",
          materialSlot: "stairs",
          origin: { x: 6, z: 0 },
          yawRad: 0,
          widthM: 1.2,
          runM: 1.8,
          heightM: 1.2,
          stepCount: 6,
          elevationYM: 0,
        },
      ],
    });

    expect(mesh.triangleCount).toBeGreaterThan(80);
    expect(mesh.materialRanges).toHaveLength(3);
    expect(mesh.bounds.minY).toBe(0);
    expect(mesh.bounds.maxY).toBeCloseTo(2.8, 5);

    // 핵심 수밀·다양체·DCC 품질 게이트 검증
    expect(mesh.audit.watertight).toBe(true);
    expect(mesh.audit.manifold).toBe(true);
    expect(mesh.audit.boundaryEdgeCount).toBe(0);
    expect(mesh.audit.nonManifoldEdgeCount).toBe(0);
    expect(mesh.audit.oppositeOrientationMismatchCount).toBe(0);
    expect(mesh.audit.degenerateTriangleCount).toBe(0);
    expect(mesh.audit.looseVertexCount).toBe(0);
    expect(mesh.audit.invalidNormalCount).toBe(0);
    expect(mesh.audit.degenerateUvTriangleCount).toBe(0);
    expect(mesh.audit.groundedAtZeroY).toBe(true);

    // 이론 부피 검증: 2.4 + 2.134 + 1.512 = 6.046 m³ (외향 와인딩 + 개구부 정확도 교차 확인)
    expect(mesh.audit.signedVolumeM3).toBeCloseTo(6.046, 3);
  });

  it("grounds elevated floorplan elements cleanly to Y=0 when groundToZeroY is enabled", () => {
    const mesh = extrudeVectorPlanToManifoldMesh({
      groundToZeroY: true,
      elements: [
        {
          kind: "polygon",
          id: "floating-prop-box",
          materialSlot: "prop",
          elevationYM: 1.25,
          heightM: 0.8,
          points: [
            { x: 0, z: 0 },
            { x: 1, z: 0 },
            { x: 1, z: 1 },
            { x: 0, z: 1 },
          ],
        },
      ],
    });

    expect(mesh.bounds.minY).toBe(0);
    expect(mesh.bounds.maxY).toBeCloseTo(0.8, 5);
    expect(mesh.audit.manifold).toBe(true);
    expect(mesh.audit.groundedAtZeroY).toBe(true);
    expect(mesh.audit.signedVolumeM3).toBeCloseTo(0.8, 4);
  });

  it("detects open-boundary non-manifold meshes and rejects invalid CAD/WGSL/sync edge cases", async () => {
    // 1) SharedWorker 단독 릴레이 + Web Locks query() 검증
    const relay = new InMemorySharedWorkerRelay();
    const lockManager = new InMemoryLockManager();
    const wA = new StudioMultiWindowSyncCoordinator({
      windowId: "sw-a",
      role: "main-canvas",
      broadcastChannel: null,
      sharedWorkerPort: relay.connectPort(),
      lockManager,
    });
    const wB = new StudioMultiWindowSyncCoordinator({
      windowId: "sw-b",
      role: "reference-3d-popout",
      broadcastChannel: null,
      sharedWorkerPort: relay.connectPort(),
      lockManager,
    });
    wA.start();
    wB.start();
    expect(wA.getTelemetry().transport).toBe("shared-worker");
    wA.publishActiveLayerDelta({ activeLayerId: "layer-sfx", activeFrameIndex: 7, revision: 1 });
    expect(wB.getLatestState().activeLayer?.activeLayerId).toBe("layer-sfx");

    const leaseSnap = await wA.withExclusiveOpfsWriteLease("snapshot-check", async () => {
      const q = await lockManager.query();
      return q.held.length;
    });
    expect(leaseSnap.value).toBe(1);
    wA.close();
    wB.close();

    // 2) 잘못된 WGSL 셰이더 및 극단 배율(0.25x~100x) 경계 검증
    expect(validateMsdfWgslShader("fn broken() {").valid).toBe(false);
    expect(validateVrsWgslShader("@compute @workgroup_size(8, 8) fn main() {}").valid).toBe(false);
    const tile = generateGlyphMsdfTile("ㄱ", buildKoreanGlyphContours("ㄱ"));
    const lowZoom = evaluateMsdfSampleCpu(tile, 0.5, 0.5, { zoomScale: 0.25 });
    const highZoom = evaluateMsdfSampleCpu(tile, 0.5, 0.5, { zoomScale: 100 });
    expect(lowZoom.screenPxRange).toBeGreaterThanOrEqual(1);
    expect(highZoom.screenPxRange).toBeCloseTo(400, 3);

    // 3) 열린 단일 삼각형은 수밀 감사에서 경계 엣지 3개로 정확히 적발되어야 함
    const openAudit = validateManifoldMeshTopology(
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]),
      new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
      new Float32Array([0, 0, 1, 0, 0, 1]),
      new Uint32Array([0, 1, 2]),
    );
    expect(openAudit.watertight).toBe(false);
    expect(openAudit.manifold).toBe(false);
    expect(openAudit.boundaryEdgeCount).toBe(3);

    // 4) 빈 평면도 및 면적 0 폴리곤 거부 검증
    expect(() => extrudeVectorPlanToManifoldMesh({ elements: [] })).toThrow();
  });
});
