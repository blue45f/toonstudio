import { describe, expect, it } from "vitest";
import {
  analyzeNarrativeReadingFlow,
  AUDIO_WORKLET_QUANTUM_FRAMES,
  computeFoveatedTilePrioritySchedule,
  create3dgsNprPassDescriptor,
  decodeInstanceSlabRecord,
  DEFAULT_MOBILE_VIEWPORT_HEIGHT_PX,
  DEFAULT_MOBILE_VIEWPORT_WIDTH_PX,
  HapticBrushFrictionEngine,
  injectPublishingComplianceMetadata,
  INSTANCE_SLAB_STRIDE_BYTES,
  MultiInstancingVirtualizer,
  SmartLicenseGuardian,
  sort3dgsSplatsByCameraDepth,
  SubMsAudioWorkletRingBuffer,
  WebGpu3dgsSplatSorter,
  WGSL_3DGS_NPR_COMPOSITE,
  WGSL_MULTI_INSTANCE_CULL_BATCH,
  type GaussianSplat3d,
  type InstanceTransformInput,
  type LicensedAssetEntry,
  type PaperSubstrateKind,
  type SplatCameraParams,
  type VirtualizerCameraContext,
} from "./index";

/* -------------------------------------------------------------------------- */
/* 1. Foveated Tile Priority & WebGPU 64B Multi-Instancing + Haptic Brush     */
/* -------------------------------------------------------------------------- */

describe("Foveated Priority Renderer & WebGPU Multi-Instancing Virtualizer", () => {
  it("시선·펜촉 중심 타일을 최우선 포비얼(1x1, LOD 0)로 배치하고 주변부 타일을 점진 지연한다", () => {
    const schedule = computeFoveatedTilePrioritySchedule({
      viewportWidthPx: 1920,
      viewportHeightPx: 1080,
      focusX: 960,
      focusY: 540,
      tileSizePx: 128,
      velocityX: 1500,
      velocityY: -600,
      lookaheadMs: 20,
    });

    expect(schedule.serverCostKrw).toBe(0);
    expect(schedule.cols).toBe(15);
    expect(schedule.rows).toBe(9);
    expect(schedule.tiles).toHaveLength(135);
    expect(schedule.predictedFocusX).toBeCloseTo(990, 1);
    expect(schedule.predictedFocusY).toBeCloseTo(528, 1);

    // 선두 타일은 반드시 포비얼 링 · LOD 0 · 1x1 · 즉시 처리 버킷이어야 한다.
    const topTile = schedule.tiles[0];
    expect(topTile.ring).toBe("foveal");
    expect(topTile.recommendedLod).toBe(0);
    expect(topTile.shadingRate).toBe("1x1");
    expect(topTile.bucket).toBe("immediate");

    // 우선순위 점수는 단조 비증가해야 하며, 마지막 타일은 주변부 지연 버킷이다.
    for (let i = 1; i < schedule.tiles.length; i += 1) {
      expect(schedule.tiles[i - 1].priorityScore).toBeGreaterThanOrEqual(schedule.tiles[i].priorityScore);
    }
    const lastTile = schedule.tiles[schedule.tiles.length - 1];
    expect(lastTile.ring).toBe("peripheral");
    expect(lastTile.shadingRate).toBe("4x4");
    expect(lastTile.bucket).toBe("deferred-next-frame");
    expect(schedule.ringCounts.foveal).toBeGreaterThan(0);
    expect(schedule.ringCounts.parafoveal).toBeGreaterThan(0);
    expect(schedule.ringCounts.peripheral).toBeGreaterThan(schedule.ringCounts.foveal);
    expect(schedule.deferredTileCount).toBeGreaterThan(0);
    expect(schedule.estimatedShadingSavingsPercent).toBeGreaterThan(55);
  });

  it("5,000개 3D 인스턴스를 64바이트 슬랩으로 배치 압축하고 포비얼 중심 LOD 승격을 수행한다", () => {
    const virtualizer = new MultiInstancingVirtualizer();
    const meshIds = ["prop-streetlamp", "prop-sakura-tree", "prop-cafe-chair", "prop-signboard", "fx-petal"];
    meshIds.forEach((id, idx) => virtualizer.registerMeshIndexCount(id, 480 + idx * 120));

    const inputs: InstanceTransformInput[] = [];
    for (let i = 0; i < 5000; i += 1) {
      const col = (i % 100) - 50;
      const row = Math.floor(i / 100);
      // 4,500개는 카메라 전방 프러스텀 부근, 500개는 카메라 후방(컬링 검증용)
      const z = i < 4500 ? -(8 + row * 1.65) : 12 + (i - 4500) * 0.2;
      const x = col * 0.55;
      const y = ((i * 7) % 13) - 6;
      inputs.push({
        instanceId: `inst-${i}`,
        meshAssetId: meshIds[i % meshIds.length],
        materialSlot: i % 2,
        position: [x, y, z],
        rotationQuat: [0, Math.sin(i * 0.1), 0, Math.cos(i * 0.1)],
        scale: [1, 1 + (i % 3) * 0.15, 1],
        boundingRadius: 1.1,
        colorTintRgba: [0.85, 0.9, 0.95, 1],
        baseLod: 1,
      });
    }
    expect(virtualizer.upsertInstances(inputs)).toBe(5000);

    const camera: VirtualizerCameraContext = {
      cameraPosition: [0, 0, 0],
      cameraForward: [0, 0, -1],
      verticalFovDeg: 60,
      nearPlane: 0.5,
      farPlane: 140,
      viewportWidthPx: 1920,
      viewportHeightPx: 1080,
      focusX: 960,
      focusY: 540,
      fovealRadiusPx: 220,
      parafovealRadiusPx: 500,
    };

    const frame = virtualizer.buildBatchedDrawFrame(camera);
    expect(frame.serverCostKrw).toBe(0);
    expect(frame.totalSubmitted).toBe(5000);
    expect(frame.visibleCount).toBeGreaterThan(2500);
    expect(frame.culledCount).toBeGreaterThanOrEqual(500);
    expect(frame.strideBytes).toBe(INSTANCE_SLAB_STRIDE_BYTES);
    expect(frame.slabBuffer.byteLength).toBe(frame.visibleCount * 64);
    expect(frame.fovealPromotedCount).toBeGreaterThan(50);
    expect(frame.drawCallCount).toBeLessThanOrEqual(40);
    expect(frame.drawCallReductionRatio).toBeGreaterThan(0.98);

    // 64바이트 슬랩 바이너리 디코딩 무결성 및 포비얼 승격(LOD 0 포함) 검증
    let decodedPromoted = 0;
    let decodedLod0Promoted = 0;
    for (let i = 0; i < frame.visibleCount; i += 1) {
      const rec = decodeInstanceSlabRecord(frame.slabBuffer, i);
      expect(rec.boundingRadius).toBeCloseTo(1.1, 4);
      expect(rec.colorTintRgba[3]).toBeCloseTo(1, 4);
      if (rec.fovealPromoted) {
        decodedPromoted += 1;
        expect(rec.ringCode).toBe(0);
        if (rec.lodLevel === 0) { decodedLod0Promoted += 1; }
      }
    }
    expect(decodedPromoted).toBe(frame.fovealPromotedCount);
    expect(decodedLod0Promoted).toBeGreaterThan(0);

    // 배치 총합과 IndirectDraw 인자 검증
    const batchedTotal = frame.batches.reduce((acc, b) => acc + b.instanceCount, 0);
    expect(batchedTotal).toBe(frame.visibleCount);
    expect(frame.batches[0].indirectDrawArgs).toHaveLength(5);
    expect(frame.batches[0].indirectDrawArgs[1]).toBe(frame.batches[0].instanceCount);

    // WGSL 컴퓨트 셰이더 핵심 구조 검증
    expect(WGSL_MULTI_INSTANCE_CULL_BATCH).toContain("struct InstanceSlab");
    expect(WGSL_MULTI_INSTANCE_CULL_BATCH).toContain("@compute @workgroup_size(64)");
    expect(WGSL_MULTI_INSTANCE_CULL_BATCH).toContain("atomicAdd(&indirect_draws[batch_idx].instance_count, 1u)");
  });
});

describe("HapticBrushFrictionEngine", () => {
  it("4종 지면(kent < hot-press < cold-press < canvas) 간 마찰력과 햅틱 강도를 물리적으로 변조한다", () => {
    const substrates: readonly PaperSubstrateKind[] = ["kent", "hot-press", "cold-press", "canvas"];
    const avgFrictions: number[] = [];
    const avgIntensities: number[] = [];

    for (const substrate of substrates) {
      const engine = new HapticBrushFrictionEngine({ substrate, brushTip: "pencil-2b" });
      let frictionSum = 0;
      let intensitySum = 0;
      const sampleCount = 24;
      for (let i = 0; i < sampleCount; i += 1) {
        const f = engine.sampleStylusFriction({
          xPx: 100 + i * 7.5,
          yPx: 200 + i * 2.1,
          pressure: 0.65,
          tiltXDeg: 28,
          tiltYDeg: 10,
          twistDeg: 45,
          velocityPxPerSec: 180,
          timestampMs: i * 16,
        });
        frictionSum += f.frictionForceN;
        intensitySum += f.applePencilHapticIntensity;
      }
      avgFrictions.push(frictionSum / sampleCount);
      avgIntensities.push(intensitySum / sampleCount);
      expect(engine.getAccumulatedStrokeMm()).toBeGreaterThan(10);
    }

    expect(avgFrictions[0]).toBeLessThan(avgFrictions[1]);
    expect(avgFrictions[1]).toBeLessThan(avgFrictions[2]);
    expect(avgFrictions[2]).toBeLessThan(avgFrictions[3]);
    expect(avgIntensities[0]).toBeLessThan(avgIntensities[3]);
  });

  it("평붓 배럴롤 회전·기울기 변화와 쓰로틀 Web Vibration / 오디오 촉각 폴백을 정확히 처리한다", () => {
    const engine = new HapticBrushFrictionEngine({
      substrate: "canvas",
      brushTip: "flat-bristle",
      minDispatchIntervalMs: 30,
    });

    // 수평 스트로크(방향 0 rad) 기준: 배럴롤 0도(정렬) vs 90도(직교 넓은 면) 비교
    engine.sampleStylusFriction({ xPx: 50, yPx: 100, pressure: 0.7, tiltXDeg: 0, tiltYDeg: 0, twistDeg: 0, velocityPxPerSec: 120, timestampMs: 0 });
    const aligned = engine.sampleStylusFriction({ xPx: 80, yPx: 100, pressure: 0.7, tiltXDeg: 0, tiltYDeg: 0, twistDeg: 0, velocityPxPerSec: 120, timestampMs: 40 });
    const broadside = engine.sampleStylusFriction({ xPx: 110, yPx: 100, pressure: 0.7, tiltXDeg: 45, tiltYDeg: 0, twistDeg: 90, velocityPxPerSec: 120, timestampMs: 80 });

    expect(broadside.barrelRollDragFactor).toBeGreaterThan(aligned.barrelRollDragFactor);
    expect(broadside.contactAreaMultiplier).toBeGreaterThan(aligned.contactAreaMultiplier);
    expect(broadside.audioCue.gainLinear).toBeGreaterThan(0);

    // Web Vibration 목(mock) 디스패치 + 메인 스레드 스터터 방지 쓰로틀 검증
    const calls: Array<number | number[]> = [];
    const mockVibrator = {
      vibrate: (pattern: number | number[]): boolean => { calls.push(pattern); return true; },
    };

    const firstDispatch = engine.dispatchHapticFeedback(aligned, { vibrator: mockVibrator });
    expect(firstDispatch.dispatched).toBe(true);
    expect(firstDispatch.backend).toBe("web-vibration");
    expect(calls).toHaveLength(1);

    // 직후 5ms 뒤 호출은 쓰로틀되어 무시되어야 한다.
    const rapidFrame = engine.sampleStylusFriction({ xPx: 120, yPx: 100, pressure: 0.7, tiltXDeg: 20, tiltYDeg: 0, twistDeg: 90, velocityPxPerSec: 120, timestampMs: 45 });
    const throttled = engine.dispatchHapticFeedback(rapidFrame, { vibrator: mockVibrator });
    expect(throttled.dispatched).toBe(false);
    expect(throttled.backend).toBe("throttled");

    // Vibration API 미지원 시 안전하게 오디오 촉각 폴백으로 전환한다.
    const laterFrame = engine.sampleStylusFriction({ xPx: 150, yPx: 100, pressure: 0.7, tiltXDeg: 20, tiltYDeg: 0, twistDeg: 90, velocityPxPerSec: 120, timestampMs: 200 });
    const fallback = engine.dispatchHapticFeedback(laterFrame, { vibrator: null });
    expect(fallback.dispatched).toBe(true);
    expect(fallback.backend).toBe("audio-tactile-fallback");
  });

  it("저속 고압 캔버스 스트로크에서 스틱-슬립 마이크로 펄스 버스트와 무압력 침묵 상태를 구분한다", () => {
    const engine = new HapticBrushFrictionEngine({ substrate: "canvas", brushTip: "charcoal" });
    let burstDetected = false;
    for (let i = 0; i < 32; i += 1) {
      const f = engine.sampleStylusFriction({
        xPx: 10 + i * 2.5,
        yPx: 20 + i * 1.1,
        pressure: 0.8,
        tiltXDeg: 35,
        tiltYDeg: 15,
        twistDeg: 30,
        velocityPxPerSec: 95,
        timestampMs: i * 16,
      });
      if (f.stickSlipBurst && f.vibrationPatternMs.length === 3) {
        burstDetected = true;
      }
    }
    expect(burstDetected).toBe(true);

    const hover = engine.sampleStylusFriction({
      xPx: 100, yPx: 100, pressure: 0, tiltXDeg: 0, tiltYDeg: 0, twistDeg: 0, velocityPxPerSec: 0, timestampMs: 800,
    });
    expect(hover.frictionForceN).toBe(0);
    expect(engine.dispatchHapticFeedback(hover).backend).toBe("silent");
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Narrative Eye-Flow Analyzer & Smart License Guardian + Compliance       */
/* -------------------------------------------------------------------------- */

describe("Narrative Eye-Flow & Scroll-Pacing Optimizer", () => {
  it("정상 한국어 세로 웹툰 배치는 역행·교차 0건과 TTS 일관성·모바일 가독성을 통과한다", () => {
    const report = analyzeNarrativeReadingFlow({
      locale: "ko",
      canvasWidthPx: 800,
      cuts: [
        { cutId: "cut-1", index: 0, x: 0, y: 0, width: 800, height: 950, sceneTempo: "dialogue" },
        { cutId: "cut-2", index: 1, x: 0, y: 1200, width: 800, height: 1050, sceneTempo: "action" },
        { cutId: "cut-3", index: 2, x: 0, y: 2950, width: 800, height: 900, sceneTempo: "reveal" },
      ],
      balloons: [
        { balloonId: "b1", cutId: "cut-1", speakerId: "hero", text: "오늘 밤 시계탑에서 만나자.", x: 90, y: 120, width: 260, height: 110, authoredReadingOrder: 1, ttsSequenceOrder: 1, fontSizePx: 28 },
        { balloonId: "b2", cutId: "cut-1", speakerId: "rival", text: "늦지 마라.", x: 460, y: 460, width: 230, height: 100, authoredReadingOrder: 2, ttsSequenceOrder: 2, fontSizePx: 28 },
        { balloonId: "b3", cutId: "cut-2", speakerId: "hero", text: "벌써 도착해 있었군!", x: 140, y: 1450, width: 280, height: 110, authoredReadingOrder: 3, ttsSequenceOrder: 3, fontSizePx: 30 },
        { balloonId: "b4", cutId: "cut-3", speakerId: "boss", text: "함정에 걸렸다.", x: 420, y: 3180, width: 250, height: 105, authoredReadingOrder: 4, ttsSequenceOrder: 4, fontSizePx: 30 },
      ],
    });

    expect(report.serverCostKrw).toBe(0);
    expect(report.horizontalDirection).toBe("ltr");
    expect(report.mobileViewport.widthPx).toBe(DEFAULT_MOBILE_VIEWPORT_WIDTH_PX);
    expect(report.mobileViewport.heightPx).toBe(DEFAULT_MOBILE_VIEWPORT_HEIGHT_PX);
    expect(report.backtrackCount).toBe(0);
    expect(report.crossoverCount).toBe(0);
    expect(report.ttsOrderConsistent).toBe(true);
    expect(report.mobileReadabilityPass).toBe(true);
    expect(report.flowScore0To100).toBe(100);
    expect(report.gutterMetrics).toHaveLength(2);
    expect(report.gutterMetrics[1].classification).toBe("dramatic-pause");
  });

  it("말풍선 X자 교차·상향 역행·TTS 불일치·모바일(390×844) 텍스트 과밀을 탐지하고 재배치 힌트를 생성한다", () => {
    const denseSentence = "이 대사는 한 모바일 화면에 과도한 텍스트와 말풍선 면적이 몰렸을 때 가독성 경고가 발생하는지 검증하기 위한 긴 대사입니다.";
    const report = analyzeNarrativeReadingFlow({
      locale: "ko",
      canvasWidthPx: 800,
      cuts: [
        { cutId: "c1", index: 0, x: 0, y: 0, width: 800, height: 1100, sceneTempo: "dialogue" },
        { cutId: "c2", index: 1, x: 0, y: 1120, width: 800, height: 900, sceneTempo: "reveal" },
      ],
      balloons: [
        // 1(좌상) -> 2(우하) 선분과 3(우상) -> 4(좌하) 선분이 X자로 교차 + 2->3 상향 역행 발생
        { balloonId: "b1", cutId: "c1", speakerId: "a", text: denseSentence, x: 40, y: 80, width: 340, height: 220, authoredReadingOrder: 1, ttsSequenceOrder: 1, fontSizePx: 26 },
        { balloonId: "b2", cutId: "c1", speakerId: "b", text: denseSentence, x: 420, y: 540, width: 340, height: 220, authoredReadingOrder: 2, ttsSequenceOrder: 4, fontSizePx: 26 },
        { balloonId: "b3", cutId: "c1", speakerId: "a", text: denseSentence, x: 420, y: 120, width: 340, height: 220, authoredReadingOrder: 3, ttsSequenceOrder: 2, fontSizePx: 18 },
        { balloonId: "b4", cutId: "c1", speakerId: "b", text: denseSentence, x: 40, y: 560, width: 340, height: 220, authoredReadingOrder: 4, ttsSequenceOrder: 3, fontSizePx: 26 },
      ],
    });

    const issueKinds = new Set(report.issues.map((i) => i.kind));
    expect(report.crossoverCount).toBeGreaterThanOrEqual(1);
    expect(report.backtrackCount).toBeGreaterThanOrEqual(1);
    expect(report.ttsOrderConsistent).toBe(false);
    expect(report.mobileReadabilityPass).toBe(false);
    expect(issueKinds.has("gaze-crossover")).toBe(true);
    expect(issueKinds.has("upward-backtrack")).toBe(true);
    expect(issueKinds.has("tts-order-mismatch")).toBe(true);
    expect(issueKinds.has("mobile-text-overdense")).toBe(true);
    expect(issueKinds.has("mobile-font-too-small")).toBe(true);
    expect(issueKinds.has("gutter-too-cramped")).toBe(true);
    expect(issueKinds.has("reveal-gutter-too-short")).toBe(true);
    expect(report.repositionHints.length).toBeGreaterThanOrEqual(3);
    expect(report.repositionHints.some((h) => h.reason === "gaze-crossover" && (h.deltaX !== 0 || h.deltaY !== 0))).toBe(true);
    expect(report.flowScore0To100).toBeLessThan(40);
  });

  it("일본어(ja) 로케일은 동일 수직 밴드에서 우→좌(RTL) 시선 스캔 순서를 기본 예측한다", () => {
    const report = analyzeNarrativeReadingFlow({
      locale: "ja",
      canvasWidthPx: 800,
      cuts: [{ cutId: "jp-1", index: 0, x: 0, y: 0, width: 800, height: 900 }],
      balloons: [
        { balloonId: "left", cutId: "jp-1", speakerId: "a", text: "左のセリフ", x: 80, y: 200, width: 220, height: 100, authoredReadingOrder: 2 },
        { balloonId: "right", cutId: "jp-1", speakerId: "b", text: "右のセリフ", x: 500, y: 210, width: 220, height: 100, authoredReadingOrder: 1 },
      ],
    });

    expect(report.horizontalDirection).toBe("rtl");
    expect(report.predictedGazePath[0].balloonId).toBe("right");
    expect(report.predictedGazePath[1].balloonId).toBe("left");
    expect(report.ttsOrderConsistent).toBe(true);
  });
});

describe("SmartLicenseGuardian & Publishing Compliance Metadata Injector", () => {
  const sampleAssets: readonly LicensedAssetEntry[] = [
    {
      assetId: "font-pretendard-pro",
      displayName: "Pretendard Pro Webtoon",
      assetKind: "font",
      vendor: "ORION Foundry",
      licenseName: "Commercial Webtoon & Print Seat",
      allowedScopes: ["webtoon-free", "paid-preview", "print-book", "global-translation"],
      commercialAllowed: true,
      expiresAtIso: "2026-12-10",
      seatLimit: 5,
      activeSeats: 2,
      fontEmbeddingPermission: "editable",
      subsetAllowed: true,
      attributionRequired: true,
      attributionText: "Font: Pretendard Pro (ORION Foundry)",
    },
    {
      assetId: "font-fan-personal-only",
      displayName: "FanBrush Personal Free",
      assetKind: "font",
      vendor: "IndieType",
      licenseName: "Non-Commercial Personal Use Only",
      allowedScopes: ["webtoon-free"],
      commercialAllowed: false,
      expiresAtIso: null,
      fontEmbeddingPermission: "restricted-no-embed",
      subsetAllowed: false,
    },
    {
      assetId: "prop-cafe-3d-expired",
      displayName: "Seoul Cafe Interior 3D Pack",
      assetKind: "3d-prop",
      vendor: "Acon3D Studio",
      licenseName: "Annual Studio Seat",
      allowedScopes: ["webtoon-free", "paid-preview", "print-book"],
      commercialAllowed: true,
      expiresAtIso: "2026-10-01",
      seatLimit: 2,
      activeSeats: 3,
    },
  ];

  it("유료 미리보기·EPUB 내보내기에서 만료·비상업·좌석초과·임베딩금지 에셋을 내보내기 직전 하드 차단한다", () => {
    const guardian = new SmartLicenseGuardian();
    guardian.registerAssets(sampleAssets);

    const audit = guardian.auditForExport({
      targetScope: "paid-preview",
      usedAssetIds: ["font-pretendard-pro", "font-fan-personal-only", "prop-cafe-3d-expired", "missing-bgm-01"],
      evaluationDateIso: "2026-11-26",
      exportFormat: "epub",
      embedFonts: true,
      subsetFonts: true,
    });

    expect(audit.serverCostKrw).toBe(0);
    expect(audit.exportAllowed).toBe(false);
    const reasons = new Set(audit.blockingViolations.map((v) => v.reason));
    expect(reasons.has("non-commercial-restricted")).toBe(true);
    expect(reasons.has("scope-not-covered")).toBe(true);
    expect(reasons.has("license-expired")).toBe(true);
    expect(reasons.has("seat-limit-exceeded")).toBe(true);
    expect(reasons.has("font-embedding-prohibited")).toBe(true);
    expect(reasons.has("font-subset-prohibited")).toBe(true);
    expect(reasons.has("unregistered-asset")).toBe(true);

    // 차단된 감사 결과로는 메타데이터 주입이 실행되지 않고 blocked: true를 반환한다.
    const blockedResult = injectPublishingComplianceMetadata({
      workId: "work-001",
      episodeId: "ep-12",
      episodeTitle: "시계탑의 비밀 12화",
      creatorName: "김작가",
      auditReport: audit,
      createdAtIso: "2026-11-26T10:00:00Z",
    });
    expect(blockedResult.blocked).toBe(true);
    expect(blockedResult.injected).toBe(false);
    expect(blockedResult.pngItxtChunk.byteLength).toBe(0);
    expect(blockedResult.blockingReasons.length).toBe(audit.blockingViolations.length);

    expect(() =>
      injectPublishingComplianceMetadata({
        workId: "work-001",
        episodeId: "ep-12",
        episodeTitle: "시계탑의 비밀 12화",
        creatorName: "김작가",
        auditReport: audit,
        createdAtIso: "2026-11-26T10:00:00Z",
        strictThrowOnBlocked: true,
      }),
    ).toThrow(/차단/);
  });

  it("권리 심사 통과 시 XMP·PNG iTXt(CRC-32 + IEND 전 삽입)·EPUB OPF·C2PA 헤더를 자동 주입한다", () => {
    const guardian = new SmartLicenseGuardian();
    guardian.registerAssets(sampleAssets);

    const audit = guardian.auditForExport({
      targetScope: "paid-preview",
      usedAssetIds: ["font-pretendard-pro"],
      evaluationDateIso: "2026-11-26",
      exportFormat: "png",
      embedFonts: true,
      subsetFonts: true,
    });

    expect(audit.exportAllowed).toBe(true);
    expect(audit.clearedAssets).toHaveLength(1);
    expect(audit.minimumDaysRemaining).toBe(14);
    expect(audit.warnings.some((w) => w.reason === "expiring-soon")).toBe(true);
    expect(audit.requiredAttributions).toContain("Font: Pretendard Pro (ORION Foundry)");

    // 최소 유효 PNG 스트림(시그니처 + IEND 청크)에 iTXt 청크 자동 삽입 검증
    const minimalPng = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10,
      0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
    ]);

    const injected = injectPublishingComplianceMetadata({
      workId: "work-001",
      episodeId: "ep-12",
      episodeTitle: "시계탑의 비밀 <특별편>",
      creatorName: "김작가",
      publisherName: "ToonStudio Press",
      auditReport: audit,
      createdAtIso: "2026-11-26T10:00:00Z",
      aiAssistDeclared: false,
      rawPngBytes: minimalPng,
    });

    expect(injected.blocked).toBe(false);
    expect(injected.injected).toBe(true);
    expect(injected.rightsBomDigestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(injected.xmpPacketXml).toContain("xmpRights:Marked>True</xmpRights:Marked>");
    expect(injected.xmpPacketXml).toContain("&lt;특별편&gt;");
    expect(injected.xmpPacketXml).toContain(injected.rightsBomDigestSha256);
    expect(injected.epubOpfMetadataXml).toContain(`<meta property="toonstudio:rightsScope">paid-preview</meta>`);
    expect(injected.c2paManifestHeader.assertions).toHaveLength(3);
    expect(injected.c2paManifestHeader.rightsBomDigestSha256).toBe(injected.rightsBomDigestSha256);

    // PNG iTXt 청크 헤더 타입 및 IEND 직전 삽입 바이트 길이 검증
    expect(String.fromCharCode(...injected.pngItxtChunk.subarray(4, 8))).toBe("iTXt");
    expect(injected.pngItxtCrc32Hex).toMatch(/^[0-9a-f]{8}$/);
    expect(injected.injectedPngBytes).toBeDefined();
    if (injected.injectedPngBytes) {
      expect(injected.injectedPngBytes.length).toBe(minimalPng.length + injected.pngItxtChunk.length);
      const tailType = String.fromCharCode(...injected.injectedPngBytes.subarray(injected.injectedPngBytes.length - 8, injected.injectedPngBytes.length - 4));
      expect(tailType).toBe("IEND");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* 3. Sub-ms AudioWorklet Ring Buffer & WebGPU 3DGS Radix Sort + NPR Bridge   */
/* -------------------------------------------------------------------------- */

describe("SubMsAudioWorkletRingBuffer", () => {
  it("SharedArrayBuffer Lock-Free 스테레오 64퀀텀(8,192프레임) 왕복에서 언더런 0·샘플 100% 일치를 보장한다", () => {
    const producer = SubMsAudioWorkletRingBuffer.create({
      capacityFrames: 512,
      channelCount: 2,
      sampleRateHz: 48000,
      layout: "interleaved",
    });
    const workletConsumer = SubMsAudioWorkletRingBuffer.attach(producer.buffer);

    expect(producer.usesSharedArrayBuffer).toBe(true);
    expect(workletConsumer.usesSharedArrayBuffer).toBe(true);

    const writeChunk = new Float32Array(AUDIO_WORKLET_QUANTUM_FRAMES * 2);
    const readChunk = new Float32Array(AUDIO_WORKLET_QUANTUM_FRAMES * 2);
    const totalQuanta = 64; // 512프레임 버퍼를 16회 랩어라운드

    for (let q = 0; q < totalQuanta; q += 1) {
      for (let f = 0; f < AUDIO_WORKLET_QUANTUM_FRAMES; f += 1) {
        const globalFrame = q * AUDIO_WORKLET_QUANTUM_FRAMES + f;
        writeChunk[f * 2] = Math.sin(globalFrame * 0.05);
        writeChunk[f * 2 + 1] = Math.cos(globalFrame * 0.03);
      }
      const wRes = producer.writeInterleaved(writeChunk);
      expect(wRes.framesWritten).toBe(AUDIO_WORKLET_QUANTUM_FRAMES);
      expect(wRes.overrun).toBe(false);

      const rRes = workletConsumer.readQuantumInterleaved(readChunk);
      expect(rRes.framesRead).toBe(AUDIO_WORKLET_QUANTUM_FRAMES);
      expect(rRes.underrun).toBe(false);

      for (let i = 0; i < writeChunk.length; i += 1) {
        expect(readChunk[i]).toBeCloseTo(writeChunk[i], 6);
      }
    }

    const telemetry = workletConsumer.getAvSyncTelemetry();
    expect(telemetry.serverCostKrw).toBe(0);
    expect(telemetry.quantumDurationMs).toBeCloseTo(2.6667, 3);
    expect(telemetry.totalFramesWritten).toBe(totalQuanta * AUDIO_WORKLET_QUANTUM_FRAMES);
    expect(telemetry.totalFramesRead).toBe(totalQuanta * AUDIO_WORKLET_QUANTUM_FRAMES);
    expect(telemetry.underrunCount).toBe(0);
    expect(telemetry.overrunCount).toBe(0);
    expect(producer.getAvSyncTelemetry().maxWriteLatencyMs).toBeLessThan(process.env.CI ? 100 : 10);
  });

  it("non-SAB ArrayBuffer 플래너 폴백·언더런 무음 채움·A/V 클럭 드리프트 보정 재생률을 검증한다", () => {
    const ring = SubMsAudioWorkletRingBuffer.create({
      capacityFrames: 512,
      channelCount: 2,
      sampleRateHz: 48000,
      layout: "planar",
      forceFallbackArrayBuffer: true,
    });
    expect(ring.usesSharedArrayBuffer).toBe(false);

    const leftIn = new Float32Array(256);
    const rightIn = new Float32Array(256);
    for (let i = 0; i < 256; i += 1) {
      leftIn[i] = (i + 1) / 256;
      rightIn[i] = -(i + 1) / 256;
    }
    expect(ring.writePlanar([leftIn, rightIn]).framesWritten).toBe(256);

    const outL = new Float32Array(128);
    const outR = new Float32Array(128);
    expect(ring.readQuantumPlanar([outL, outR]).underrun).toBe(false);
    expect(outL[0]).toBeCloseTo(1 / 256, 6);
    expect(outR[127]).toBeCloseTo(-128 / 256, 6);

    // 두 번째 128프레임 소비 후 빈 버퍼에서 읽으면 언더런과 무음(0) 채움이 발생한다.
    expect(ring.readQuantumPlanar([outL, outR]).underrun).toBe(false);
    const underrunRes = ring.readQuantumPlanar([outL, outR]);
    expect(underrunRes.underrun).toBe(true);
    expect(underrunRes.framesZeroFilled).toBe(128);
    expect(outL[0]).toBe(0);
    expect(outR[127]).toBe(0);

    // 드리프트 관측: 오디오 클럭이 비디오보다 빠르게 앞서면 보정 재생률이 1.0 미만으로 내려간다.
    ring.recordAvSyncObservation(5.0);
    // 추가 480프레임(10ms) 소비 시 비디오는 9.5ms만 진행(+50,000ppm -> 클램프 드리프트)
    for (let k = 0; k < 4; k += 1) {
      ring.writePlanar([leftIn.subarray(0, 128), rightIn.subarray(0, 128)]);
      ring.readQuantumPlanar([outL, outR]);
    }
    const synced = ring.recordAvSyncObservation(26.0);
    expect(synced.underrunCount).toBe(1);
    expect(synced.recommendedPlaybackRate).toBeGreaterThanOrEqual(0.995);
    expect(synced.recommendedPlaybackRate).toBeLessThanOrEqual(1.005);
  });

  it("인터리브 기록 ↔ 플래너 퀀텀 읽기 교차 변환과 용량 초과 오버런 감지를 정확히 처리한다", () => {
    const ring = SubMsAudioWorkletRingBuffer.create({
      capacityFrames: 512,
      channelCount: 2,
      sampleRateHz: 48000,
      layout: "interleaved",
    });
    const interleaved = new Float32Array(511 * 2);
    for (let i = 0; i < 511; i += 1) {
      interleaved[i * 2] = i * 0.001;
      interleaved[i * 2 + 1] = -i * 0.001;
    }
    const first = ring.writeInterleaved(interleaved);
    expect(first.framesWritten).toBe(511);
    expect(first.overrun).toBe(false);

    // 이미 가득 찬 링 버퍼에 추가 기록하면 오버런으로 기록된다.
    const overflow = ring.writeInterleaved(new Float32Array(32 * 2));
    expect(overflow.overrun).toBe(true);
    expect(overflow.framesWritten).toBe(0);
    expect(overflow.framesDropped).toBe(32);

    const planarL = new Float32Array(128);
    const planarR = new Float32Array(128);
    const read = ring.readQuantumPlanar([planarL, planarR]);
    expect(read.framesRead).toBe(128);
    expect(planarL[77]).toBeCloseTo(0.077, 6);
    expect(planarR[77]).toBeCloseTo(-0.077, 6);
    expect(ring.getAvSyncTelemetry().overrunCount).toBe(1);
  });
});

describe("WebGpu3dgsSplatSorter & WGSL NPR Composite", () => {
  function generateDeterministicSplats(count: number): GaussianSplat3d[] {
    const splats: GaussianSplat3d[] = [];
    let seed = 0x13579bdf;
    const nextRand = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };

    for (let i = 0; i < count; i += 1) {
      // 일부는 카메라 뒤(z > 0) 및 저투명도(컬링 대상)로 섞는다.
      const behind = i % 19 === 0;
      const transparent = i % 23 === 0;
      const z = behind ? 2 + nextRand() * 10 : -(1.2 + nextRand() * 75);
      const spread = Math.abs(z) * 0.42;
      splats.push({
        splatId: i,
        position: [(nextRand() * 2 - 1) * spread, (nextRand() * 2 - 1) * spread * 0.6, z],
        scale: [0.08 + nextRand() * 0.3, 0.08 + nextRand() * 0.3, 0.08 + nextRand() * 0.3],
        rotationQuat: [nextRand() - 0.5, nextRand() - 0.5, nextRand() - 0.5, 1],
        opacity: transparent ? 0.002 : 0.25 + nextRand() * 0.75,
        baseColorRgb: [nextRand(), nextRand(), nextRand()],
      });
    }
    return splats;
  }

  it("4,096개 3DGS 스플랫을 32비트/16비트 Radix 정렬로 정확한 뒤→앞 깊이 순 정렬 및 공분산 투영한다", () => {
    const splats = generateDeterministicSplats(4096);
    const camera: SplatCameraParams = {
      position: [0, 0, 0],
      forward: [0, 0, -1],
      verticalFovDeg: 55,
      nearPlane: 0.5,
      farPlane: 100,
      viewportWidthPx: 1280,
      viewportHeightPx: 720,
    };

    const sorter = new WebGpu3dgsSplatSorter({ keyBitWidth: 32, minOpacityThreshold: 0.01 });
    const res32 = sorter.sortForCamera(splats, camera);

    expect(res32.serverCostKrw).toBe(0);
    expect(res32.radixPassCount).toBe(4);
    expect(res32.visibleCount).toBeGreaterThan(2800);
    expect(res32.culledCount).toBeGreaterThan(300);

    // 32비트 Radix 정렬 결과의 뒤→앞(내림차순 깊이) 엄격 단조성 검증
    for (let i = 1; i < res32.visibleCount; i += 1) {
      expect(res32.sortedDepths[i - 1]).toBeGreaterThanOrEqual(res32.sortedDepths[i]);
      expect(res32.sortedKeys[i - 1]).toBeLessThanOrEqual(res32.sortedKeys[i]);
    }

    // 참조 JS 내림차순 정렬과 인덱스 100% 동등성(parity) 검증
    const expectedIds = [...res32.projectedSplats]
      .sort((a, b) => (b.viewDepth !== a.viewDepth ? b.viewDepth - a.viewDepth : a.sourceIndex - b.sourceIndex))
      .map((p) => p.sourceIndex);
    expect(Array.from(res32.sortedSourceIndices)).toEqual(expectedIds);

    // 2D 공분산 양의 정부호(positive-definite) 및 화면 바운드 클램핑 검증
    for (let i = 0; i < Math.min(200, res32.projectedSplats.length); i += 1) {
      const p = res32.projectedSplats[i];
      const [cxx, cxy, cyy] = p.cov2d;
      expect(cxx).toBeGreaterThan(0);
      expect(cyy).toBeGreaterThan(0);
      expect(cxx * cyy - cxy * cxy).toBeGreaterThan(0);
      expect(p.screenRadiusPx).toBeGreaterThanOrEqual(1);
      expect(p.boundsPx[0]).toBeGreaterThanOrEqual(0);
      expect(p.boundsPx[2]).toBeLessThanOrEqual(1280);
    }

    // 16비트 2패스 Radix 정렬도 정확한 키 단조성과 빠른 정렬을 보장한다.
    const res16 = sort3dgsSplatsByCameraDepth(splats, camera, { keyBitWidth: 16 });
    expect(res16.radixPassCount).toBe(2);
    expect(res16.visibleCount).toBe(res32.visibleCount);
    for (let i = 1; i < res16.visibleCount; i += 1) {
      expect(res16.sortedKeys[i - 1]).toBeLessThanOrEqual(res16.sortedKeys[i]);
    }

    // 3DGS -> 웹툰 셀/잉크/스크린톤 NPR 패스 디스크립터 & WGSL 검증
    const nprPass = create3dgsNprPassDescriptor({
      viewportWidthPx: 1280,
      viewportHeightPx: 720,
      celBandCount: 4,
      inkEdgeThreshold: 0.2,
      screentoneFrequency: 0.8,
    });
    expect(nprPass.uniformBytes).toBe(48);
    expect(nprPass.uniformBufferData.byteLength).toBe(48);
    expect(nprPass.dispatchWorkgroups).toEqual([160, 90, 1]);
    expect(WGSL_3DGS_NPR_COMPOSITE).toContain("fn cs_splat_npr_composite");
    expect(WGSL_3DGS_NPR_COMPOSITE).toContain("textureStore(dst_npr_tex");
    expect(sorter.buildNprCompositePass({ viewportWidthPx: 800, viewportHeightPx: 600 }).serverCostKrw).toBe(0);
  });

  it("전체 프러스텀 밖·빈 스플랫 입력에도 오류 없이 0건 결과를 반환한다", () => {
    const camera: SplatCameraParams = {
      position: [0, 0, 0],
      forward: [0, 0, -1],
      verticalFovDeg: 55,
      nearPlane: 0.5,
      farPlane: 50,
      viewportWidthPx: 1280,
      viewportHeightPx: 720,
    };
    const behindOnly: readonly GaussianSplat3d[] = [
      { splatId: 1, position: [0, 0, 10], scale: [0.2, 0.2, 0.2], rotationQuat: [0, 0, 0, 1], opacity: 0.9, baseColorRgb: [0.5, 0.5, 0.5] },
      { splatId: 2, position: [0, 0, -5], scale: [0.2, 0.2, 0.2], rotationQuat: [0, 0, 0, 1], opacity: 0.001, baseColorRgb: [0.5, 0.5, 0.5] },
    ];
    const res = sort3dgsSplatsByCameraDepth(behindOnly, camera);
    expect(res.visibleCount).toBe(0);
    expect(res.culledCount).toBe(2);
    expect(res.sortedSourceIndices).toHaveLength(0);
  });
});
