import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  computeSha256Sri,
  InMemoryCacheStorage,
  PwaBaseAssetPinner,
  type PwaBaseAssetDescriptor,
} from "../wasm64-offline-pwa";
import { srgbToOklch } from "../wasm64-publish-continuity-resilience";
import { sha256HexFromBytes } from "../wasm64-supergap-global-ip-branch";
import { verifyHybridPostQuantumProvenance } from "../wasm64-supergap-security-ops-hw";
import {
  auditSuperGapPlatformReadiness,
  runCreatorDrawToPublishPipeline,
  runThermalAdaptiveFeedbackCycle,
  SUPER_GAP_35_CAPABILITY_REGISTRY,
  ThermalAdaptiveRuntimeLoop,
  WASM64_CORE_EXPECTED_EXPORTS,
  WASM64_EXTENDED_EXPECTED_C_ABI_FUNCTIONS,
  WASM64_EXTENDED_EXPECTED_EXPORTS,
  type CreatorDrawToPublishInput,
  type PipelineStylusStrokeInput,
  type RawStylusStrokePoint,
  type ThermalFeedbackFrameInput,
} from "./index";

function createTremorCalibrationStrokes(count: number): readonly (readonly RawStylusStrokePoint[])[] {
  const strokes: RawStylusStrokePoint[][] = [];
  for (let s = 0; s < count; s += 1) {
    const pts: RawStylusStrokePoint[] = [];
    const baseY = 20 + (s % 5) * 18;
    for (let i = 0; i < 48; i += 1) {
      const tSec = i / 120;
      const tremor = Math.sin(2 * Math.PI * 8.5 * tSec + s * 0.4) * 1.45;
      pts.push({
        x: 10 + i * 2.1,
        y: baseY + tremor,
        timestampMs: s * 600 + i * (1000 / 120),
        pressure: 0.55 + 0.25 * Math.sin(i * 0.2),
        tiltXDeg: 14,
        tiltYDeg: 9,
      });
    }
    strokes.push(pts);
  }
  return strokes;
}

function makeNoisySegment(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  steps: number,
  tStartMs: number,
  tremorAmp: number,
): RawStylusStrokePoint[] {
  const pts: RawStylusStrokePoint[] = [];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.max(1e-6, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  for (let i = 0; i <= steps; i += 1) {
    const u = i / steps;
    const envelope = Math.sin(Math.PI * u);
    const wave = Math.sin(2 * Math.PI * 8.5 * (i / 120)) * tremorAmp * envelope;
    pts.push({
      x: x0 + dx * u + nx * wave,
      y: y0 + dy * u + ny * wave,
      timestampMs: tStartMs + i * (1000 / 120),
      pressure: 0.45 + 0.4 * envelope,
      tiltXDeg: 16,
      tiltYDeg: 10,
    });
  }
  return pts;
}

/** 4변 중 우상단 코너에 의도적 5px 틈새가 있는 캐릭터 패널 선화 스트로크를 생성한다. */
function createGappedCharacterStrokes(): readonly PipelineStylusStrokeInput[] {
  return [
    { id: "contour-top", samples: makeNoisySegment(14, 14, 76, 14, 48, 0, 1.8) },
    { id: "contour-right", samples: makeNoisySegment(81, 17, 81, 80, 48, 500, 1.8) },
    { id: "contour-bottom", samples: makeNoisySegment(81, 80, 14, 80, 48, 1000, 1.8) },
    { id: "contour-left", samples: makeNoisySegment(14, 80, 14, 14, 48, 1500, 1.8) },
  ];
}

function buildDrawToPublishFixture(
  overrides: Partial<CreatorDrawToPublishInput> = {},
): CreatorDrawToPublishInput {
  const hairSrgb = { r: 242, g: 199, b: 184 };
  const hairOklch = srgbToOklch(hairSrgb.r, hairSrgb.g, hairSrgb.b);

  return {
    workId: "work-yeonhwa-chronicles",
    seriesId: "series-yeonhwa-s1",
    episodeId: "ep-014",
    episodeTitle: "제14화 · 새벽의 화실",
    cutId: "cut-014-01",
    creatorId: "creator-hjunkim",
    watermarkSecretKey: "toonstudio-local-zero-cost-wm-key-2026",
    canvasWidth: 96,
    canvasHeight: 96,
    calibrationStrokes: createTremorCalibrationStrokes(10),
    activeStrokes: createGappedCharacterStrokes(),
    brushPresetId: "ink-gpen",
    maxGapPx: 14,
    lineRasterWidthPx: 2.5,
    flatPaletteRgba: [[hairSrgb.r / 255, hairSrgb.g / 255, hairSrgb.b / 255, 1]],
    characterReference: {
      characterId: "char-yeonhwa",
      characterName: "연화",
      regions: [
        {
          regionId: "yeonhwa-hair",
          labelKo: "주인공 머리카락",
          role: "hair",
          dominantOklch: hairOklch,
          expectedAspectRatio: 1.0,
          referenceBox: { x: 20, y: 20, width: 54, height: 54 },
          maxDeltaEWarning: 0.08,
          maxDeltaECritical: 0.16,
        },
      ],
    },
    episodeCuts: [
      {
        cutId: "cut-014-01",
        widthPx: 800,
        heightPx: 1200,
        gutterAfterPx: 120,
        meanLuminance: 0.62,
        contrastRatio: 7.4,
        visualEntropy: 0.72,
        hasImpactHook: true,
        shotScale: "closeup",
        balloons: [
          {
            balloonId: "b1",
            text: "이번 컷은 0원 로컬 파이프라인으로 끝까지 완성한다.",
            x: 80,
            y: 120,
            width: 280,
            height: 110,
            orderIndex: 0,
          },
        ],
      },
      {
        cutId: "cut-014-02",
        widthPx: 800,
        heightPx: 1150,
        gutterAfterPx: 110,
        meanLuminance: 0.45,
        contrastRatio: 8.2,
        visualEntropy: 0.76,
        hasImpactHook: true,
        shotScale: "medium",
        balloons: [
          {
            balloonId: "b2",
            text: "선화 틈새가 자동으로 닫히고 워터마크와 양자내성 서명까지 봉인됐어!",
            x: 420,
            y: 260,
            width: 300,
            height: 120,
            orderIndex: 1,
          },
        ],
      },
    ],
    publishTargets: ["print-book-cmyk-pdfx4", "epub3-fixed-layout", "naver-webtoon-800"],
    printPaperProfile: "coated-fogra39",
    publishRightsBom: {
      workId: "work-yeonhwa-chronicles",
      episodeId: "ep-014",
      title: "제14화 · 새벽의 화실",
      language: "ko",
      publisherName: "ToonStudio Indie Press",
      generatedAtIso: "2026-11-26T12:00:00.000Z",
      royaltySplits: [
        { creatorId: "creator-hjunkim", displayName: "김작가", role: "art", sharePercent: 75 },
        { creatorId: "creator-colorist", displayName: "이채색", role: "coloring", sharePercent: 25 },
      ],
      assets: [
        {
          assetId: "font-pretendard",
          name: "Pretendard Studio",
          kind: "font",
          licenseCode: "OFL-1.1",
          commercialAllowed: true,
          attributionRequired: false,
        },
        {
          assetId: "brush-gpen-pro",
          name: "ToonStudio G-Pen",
          kind: "brush",
          licenseCode: "CC0-1.0",
          commercialAllowed: true,
          attributionRequired: false,
        },
      ],
    },
    derivativeRightsAssets: [
      {
        assetId: "art-yeonhwa-ep14",
        assetName: "연화 14화 원고 아트워크",
        category: "character-art",
        licenseSpdx: "Proprietary-Creator-Owned",
        rightsHolder: "creator-hjunkim",
        commercialMerchAllowed: true,
        audioBroadcastAllowed: true,
        model3dDerivativeAllowed: true,
        attributionRequired: false,
      },
    ],
    derivativeRoyaltySplits: [
      { partyId: "creator-hjunkim", displayName: "김작가", role: "creator", sharePercent: 80 },
      { partyId: "creator-colorist", displayName: "이채색", role: "colorist", sharePercent: 20 },
    ],
    trailerHighlights: [
      {
        cutId: "cut-014-01",
        title: "새벽의 화실 오프닝",
        subtitleText: "단 한 번의 펜터치로 시작되는 이야기",
        voiceoverLine: "새벽의 화실에서 마지막 컷이 완성된다.",
        speakerName: "연화",
        sfxLabel: "펜촉 긁힘",
        emphasisWeight: 1.4,
      },
      {
        cutId: "cut-014-02",
        title: "클라이맥스 전개",
        subtitleText: "지금 바로 다음 화를 확인하세요",
        voiceoverLine: "모든 단서가 하나의 컷으로 모였다.",
        speakerName: "연화",
        sfxLabel: "심장 박동",
        emphasisWeight: 1.6,
      },
    ],
    sealedAtIso: "2026-11-26T12:00:00.000Z",
    ...overrides,
  };
}

describe("wasm64-supergap-runtime-hub: 통합 엔드투엔드 런타임 허브", () => {
  it("Creator Draw-to-Publish 전체 파이프라인이 실데이터로 무오류·50ms 이내 완주한다", async () => {
    const fixture = buildDrawToPublishFixture();
    // WebCrypto JIT 웜업 후 실측(CI/로컬 모두 결정적 서브-50ms 검증)
    const warmup = await runCreatorDrawToPublishPipeline(fixture);
    expect(warmup.allGatesPassed).toBe(true);

    const result = await runCreatorDrawToPublishPipeline(fixture);

    // 전체 게이트·무비용·서브-50ms 실행 확인
    expect(result.allGatesPassed).toBe(true);
    expect(result.aiTokensUsed).toBe(0);
    expect(result.serverCostKrw).toBe(0);
    expect(result.totalElapsedMs).toBeLessThan(50);

    // Stage 1: FFT 손떨림 보정(#4) + 적응형 브러시 다이나믹스
    expect(result.stage1.calibrationProfile.analyzedStrokeCount).toBe(10);
    expect(result.stage1.calibrationProfile.spectrum.dominantTremorHz).toBeGreaterThan(3);
    expect(result.stage1.filteredJitterRmsPx).toBeLessThan(result.stage1.rawJitterRmsPx);
    expect(result.stage1.meanEffectiveRadiusPx).toBeGreaterThan(0);
    expect(result.stage1.meanInkFlow).toBeGreaterThan(0.3);
    expect(result.stage1.meanOpacity).toBeGreaterThan(0.5);

    // Stage 2: 벡터 틈새 폐합 & 무토큰 오토플랫(#3)
    expect(result.stage2.autoFlat.bridges.length).toBeGreaterThanOrEqual(1);
    expect(result.stage2.autoFlat.enclosedRegionCount).toBeGreaterThan(
      result.stage2.autoFlat.enclosedRegionCountBeforeGapClose,
    );
    expect(result.stage2.filledPixelCount).toBeGreaterThan(2500);
    expect(result.stage2.inkBarrierPixelCount).toBeGreaterThan(300);

    // Stage 3: 캐릭터 연속성 Diff & 모바일 10초 이탈 히트맵(#10)
    expect(result.stage3.finalContinuity.passed).toBe(true);
    expect(result.stage3.retentionHeatmap.first10SecRetentionScore).toBeGreaterThan(40);
    expect(result.stage3.retentionHeatmap.overallRetentionScore).toBeGreaterThan(40);

    // Stage 4: 비가시성 워터마크(PSNR >= 42 dB) + 양자내성 WOTS+/ECDSA 하이브리드 봉인(#14)
    expect(result.stage4.watermarkPsnrCompliant).toBe(true);
    expect(result.stage4.watermarkImprint.psnrDb).toBeGreaterThanOrEqual(42);
    expect(result.stage4.watermarkExtract.verified).toBe(true);
    expect(result.stage4.watermarkExtract.creatorMatches).toBe(true);
    expect(result.stage4.watermarkExtract.digestMatches).toBe(true);
    expect(result.stage4.hybridProvenanceVerification.valid).toBe(true);
    expect(result.stage4.hybridProvenanceVerification.postQuantumWotsValid).toBe(true);
    expect(result.stage4.hybridProvenanceVerification.classicalEcdsaValid).toBe(true);

    // 1바이트 위변조 시 양자내성 하이브리드 봉인이 즉시 거부하는지 확인
    const tampered = new Uint8Array(result.stage4.watermarkImprint.watermarkedRgba);
    tampered[0] = (tampered[0] + 1) & 0xff;
    const tamperedReport = await verifyHybridPostQuantumProvenance(
      result.stage4.hybridProvenanceSeal,
      tampered,
    );
    expect(tamperedReport.valid).toBe(false);
    expect(tamperedReport.contentDigestValid).toBe(false);

    // Stage 5: CMYK PDF/X-4 · EPUB3 · 플랫폼 규격 패키저 + IP 파생 번들(#35)
    expect(result.stage5.allPublishTargetsPassed).toBe(true);
    const pdfPkg = result.stage5.publishResults["print-book-cmyk-pdfx4"];
    const epubPkg = result.stage5.publishResults["epub3-fixed-layout"];
    const naverPkg = result.stage5.publishResults["naver-webtoon-800"];
    expect(pdfPkg?.artifact?.kind).toBe("print-book-cmyk-pdfx4");
    expect(epubPkg?.artifact?.kind).toBe("epub3-fixed-layout");
    expect(naverPkg?.artifact?.kind).toBe("webtoon-scroll");
    if (pdfPkg?.artifact?.kind === "print-book-cmyk-pdfx4") {
      expect(pdfPkg.artifact.pdfBytes.byteLength).toBeGreaterThan(200);
      expect(pdfPkg.artifact.serverCostKrw).toBe(0);
    }
    if (epubPkg?.artifact?.kind === "epub3-fixed-layout") {
      expect(epubPkg.artifact.archiveBytes[0]).toBe(0x50);
      expect(epubPkg.artifact.archiveBytes[1]).toBe(0x4b);
    }

    expect(result.stage5.ipDerivativeBundle.ok).toBe(true);
    expect(result.stage5.ipDerivativeBundle.deliverables.characterSprites.length).toBe(1);
    expect(result.stage5.ipDerivativeBundle.deliverables.turntableCamera.keyframes.length).toBeGreaterThan(8);
    expect(result.stage5.ipDerivativeBundle.deliverables.audioToonTrailer.webvttCaptions).toContain("WEBVTT");
    expect(result.stage5.ipBundleSealVerification.valid).toBe(true);
  });

  it("캐릭터 색상 연속성 드리프트 감지 시 OKLCH 원클릭 자동 보정 후 재검증 및 출판 봉인을 완료한다", async () => {
    // 의도적으로 기준 시트 머리색을 짙은 청색으로 지정해 Stage 3 드리프트를 유발
    const driftedRefOklch = srgbToOklch(65, 112, 224);
    const fixture = buildDrawToPublishFixture({
      autoApplyContinuityFix: true,
      characterReference: {
        characterId: "char-yeonhwa",
        characterName: "연화",
        regions: [
          {
            regionId: "yeonhwa-hair",
            labelKo: "주인공 머리카락",
            role: "hair",
            dominantOklch: driftedRefOklch,
            expectedAspectRatio: 1.0,
            referenceBox: { x: 20, y: 20, width: 54, height: 54 },
            maxDeltaEWarning: 0.05,
            maxDeltaECritical: 0.12,
          },
        ],
      },
    });

    const result = await runCreatorDrawToPublishPipeline(fixture);
    expect(result.stage3.initialContinuity.warningPins.length).toBeGreaterThan(0);
    expect(result.stage3.continuityAutoFixApplied).toBe(true);
    expect(result.stage3.finalContinuity.regionDiffs[0].colorDeltaE).toBeLessThan(
      result.stage3.initialContinuity.regionDiffs[0].colorDeltaE,
    );
    expect(result.stage4.watermarkExtract.verified).toBe(true);
    expect(result.stage4.hybridProvenanceVerification.valid).toBe(true);
  });

  it("Thermal-Adaptive GPU/물리 피드백 루프가 발열·저전력 변화에 따라 VRS·SVT·XPBD·포비에이티드·VRAM 예산을 동적 협조 제어한다", () => {
    const loop = new ThermalAdaptiveRuntimeLoop({
      pacerOptions: { windowSize: 8, stepDownStreakRequired: 2, stepUpStreakRequired: 5 },
      baseTransientVramBudgetBytes: 128 * 1024 * 1024,
      canvasWidthPx: 4096,
      canvasHeightPx: 4096,
    });

    // 1) 정상 120Hz 구간
    const nominal = loop.stepFrame({
      cutId: "cut-01",
      frameMs: 6.4,
      heapUsedBytes: 42 * 1024 * 1024,
      vramUsedBytes: 110 * 1024 * 1024,
      timestampMs: 1000,
      batteryLevel: 0.92,
      charging: true,
      thermalState: "nominal",
    });
    expect(nominal.liveControls.profileId).toBe("ultra-120hz");
    expect(nominal.liveControls.vrsRate).toBe("1x1");
    expect(nominal.liveControls.svtMipBias).toBe(0);
    expect(nominal.liveControls.xpbdSubsteps).toBe(8);
    expect(nominal.xpbdMetrics.hasNonFinite).toBe(false);
    expect(nominal.renderGraphBudget.culledPassCount).toBeGreaterThanOrEqual(1);
    expect(nominal.renderGraphBudget.aliasingReductionPercent).toBeGreaterThan(25);
    expect(nominal.renderGraphBudget.virtualTilePlan.withinBudget).toBe(true);

    // 2) 발열·프레임 드리프트·저배터리 구간 → 다단계 하향 전이 확인
    let hotCycle = nominal;
    for (let i = 0; i < 10; i += 1) {
      hotCycle = loop.stepFrame({
        cutId: "cut-boss-fight",
        frameMs: 14.5 + i * 0.9,
        heapUsedBytes: 48 * 1024 * 1024,
        vramUsedBytes: 460 * 1024 * 1024,
        timestampMs: 1100 + i * 16,
        batteryLevel: 0.14,
        charging: false,
        lowPowerMode: true,
        thermalState: i >= 6 ? "critical" : "serious",
      });
    }
    expect(hotCycle.telemetryGate.status).toBe("fail");
    expect(hotCycle.telemetryGate.primaryCulpritCutId).toBe("cut-boss-fight");
    expect(hotCycle.liveControls.profileId).toBe("battery-saver-45hz");
    expect(hotCycle.liveControls.vrsRate).toBe("4x2");
    expect(hotCycle.liveControls.svtMipBias).toBeGreaterThan(nominal.liveControls.svtMipBias);
    expect(hotCycle.liveControls.xpbdSubsteps).toBe(2);
    expect(hotCycle.xpbdMetrics.substepsExecuted).toBeLessThanOrEqual(2);
    expect(hotCycle.liveControls.effectiveTransientVramBudgetBytes).toBeLessThan(
      nominal.liveControls.effectiveTransientVramBudgetBytes,
    );
    expect(hotCycle.foveatedSchedule.deferredTileCount).toBeGreaterThanOrEqual(
      nominal.foveatedSchedule.deferredTileCount,
    );
    expect(hotCycle.renderGraphBudget.virtualTilePlan.withinBudget).toBe(true);

    // 3) NaN/Infinity 비정상 텔레메트리 주입 시 하드닝 가드로 유한값 유지 확인
    const corrupted = loop.stepFrame({
      cutId: "cut-corrupt",
      frameMs: Number.NaN,
      heapUsedBytes: Number.POSITIVE_INFINITY,
      vramUsedBytes: Number.NaN,
      timestampMs: 2000,
      batteryLevel: Number.NaN,
      thermalState: "nominal",
    });
    expect(Number.isFinite(corrupted.pacerDirective.rollingMeanFrameMs)).toBe(true);
    expect(Number.isFinite(corrupted.telemetryGate.frameTiming.p99Ms)).toBe(true);
    expect(corrupted.xpbdMetrics.hasNonFinite).toBe(false);

    // 4) 냉각·충전 복구 구간 → 히스테리시스 상향 복구 확인
    const cooldownFrames: ThermalFeedbackFrameInput[] = [];
    for (let i = 0; i < 12; i += 1) {
      cooldownFrames.push({
        cutId: "cut-calm",
        frameMs: 5.5,
        heapUsedBytes: 44 * 1024 * 1024,
        vramUsedBytes: 96 * 1024 * 1024,
        timestampMs: 3000 + i * 16,
        batteryLevel: 0.9,
        charging: true,
        lowPowerMode: false,
        thermalState: "nominal",
      });
    }
    const batch = runThermalAdaptiveFeedbackCycle(cooldownFrames, {
      pacerOptions: {
        initialProfileId: "battery-saver-45hz",
        windowSize: 6,
        stepUpStreakRequired: 4,
      },
    });
    expect(batch.transitionCount).toBeGreaterThanOrEqual(1);
    expect(batch.finalCycle?.liveControls.profileId).not.toBe("battery-saver-45hz");
    expect(batch.serverCostKrw).toBe(0);
  });

  it("Cold-Boot & 35-Capability / 62-ABI 준비 매트릭스가 실제 컴파일된 WASM64 바이너리와 PWA 핀 무결성을 100점으로 검증한다", async () => {
    const repoRoot = path.resolve(process.cwd());
    const coreWasmPath = path.join(repoRoot, "apps/web/public/wasm/studio-wasm64-drawing-core.wasm");
    const extWasmPath = path.join(repoRoot, "apps/web/public/wasm/studio-wasm64-extended-suite.wasm");
    const coreBytes = new Uint8Array(fs.readFileSync(coreWasmPath));
    const extBytes = new Uint8Array(fs.readFileSync(extWasmPath));

    const coreSri = await computeSha256Sri(coreBytes);
    const extSri = await computeSha256Sri(extBytes);
    const coreShaHex = sha256HexFromBytes(coreBytes);
    const extShaHex = sha256HexFromBytes(extBytes);
    const shellBytes = new TextEncoder().encode("<!doctype html><title>ToonStudio</title>");
    const fontBytes = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 1, 0, 0, 1, 2, 3, 4]);
    const shellShaHex = sha256HexFromBytes(shellBytes);
    const fontShaHex = sha256HexFromBytes(fontBytes);

    const descriptors: readonly PwaBaseAssetDescriptor[] = [
      { url: "/wasm/studio-wasm64-drawing-core.wasm", kind: "wasm", integrity: coreSri },
      { url: "/wasm/studio-wasm64-extended-suite.wasm", kind: "wasm", integrity: extSri },
    ];
    const assetPayloadByUrl = new Map<string, { bytes: Uint8Array; contentType: string }>([
      ["/wasm/studio-wasm64-drawing-core.wasm", { bytes: coreBytes, contentType: "application/wasm" }],
      ["/wasm/studio-wasm64-extended-suite.wasm", { bytes: extBytes, contentType: "application/wasm" }],
    ]);

    const cacheStorage = new InMemoryCacheStorage();
    const pinner = new PwaBaseAssetPinner({
      assets: descriptors,
      buildTag: "supergap-e2e-20261126",
      cacheStorage,
      storageManager: {
        estimate: async () => ({ quota: 2 * 1024 * 1024 * 1024, usage: 1024 * 1024 }),
        persist: async () => true,
        persisted: async () => true,
      },
      fetchFn: (async (input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const hit = assetPayloadByUrl.get(url);
        if (!hit) return new Response("not found", { status: 404 });
        const body = new Uint8Array(hit.bytes.byteLength);
        body.set(hit.bytes);
        return new Response(body.buffer, { status: 200, headers: { "content-type": hit.contentType } });
      }) as typeof fetch,
    });

    const pinResult = await pinner.pinAll();
    expect(pinResult.ok).toBe(true);

    const report = await auditSuperGapPlatformReadiness({
      wasmBridge: { coreWasmBytes: coreBytes, extendedSuiteWasmBytes: extBytes },
      pwaPinner: pinner,
      pwaDescriptors: descriptors,
      measuredEagerGraphImpactBytes: 0,
      coldBootSnapshot: {
        serviceWorkerActive: true,
        opfsWritable: true,
        sqliteJournalHealthy: true,
        webCryptoSubtleAvailable: true,
        cachedAssets: [
          {
            assetPath: "/index.html",
            kind: "app-shell",
            cached: true,
            expectedSha256Hex: shellShaHex,
            actualSha256Hex: shellShaHex,
            byteLength: shellBytes.byteLength,
          },
          {
            assetPath: "/wasm/studio-wasm64-drawing-core.wasm",
            kind: "wasm",
            cached: true,
            expectedSha256Hex: coreShaHex,
            actualSha256Hex: coreShaHex,
            byteLength: coreBytes.byteLength,
          },
          {
            assetPath: "/wasm/studio-wasm64-extended-suite.wasm",
            kind: "wasm",
            cached: true,
            expectedSha256Hex: extShaHex,
            actualSha256Hex: extShaHex,
            byteLength: extBytes.byteLength,
          },
          {
            assetPath: "/fonts/pretendard-studio.woff2",
            kind: "font",
            cached: true,
            expectedSha256Hex: fontShaHex,
            actualSha256Hex: fontShaHex,
            byteLength: fontBytes.byteLength,
          },
        ],
        externalBootUrls: [],
        estimatedAvailableStorageBytes: 1024 * 1024 * 1024,
      },
    });

    expect(report.overallReady).toBe(true);
    expect(report.readinessScore).toBe(100);
    expect(report.capabilities.registeredCount).toBe(35);
    expect(report.capabilities.uniqueIdeaCount).toBe(35);
    expect(report.capabilities.pillarsCovered).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I"]);
    expect(SUPER_GAP_35_CAPABILITY_REGISTRY.length).toBe(35);

    expect(report.wasm64Bridge.coreExportCount).toBe(WASM64_CORE_EXPECTED_EXPORTS);
    expect(report.wasm64Bridge.extendedExportCount).toBe(WASM64_EXTENDED_EXPECTED_EXPORTS);
    expect(report.wasm64Bridge.extendedFunctionExportCount).toBe(WASM64_EXTENDED_EXPECTED_C_ABI_FUNCTIONS);
    expect(report.wasm64Bridge.all62ExtendedExportsAvailable).toBe(true);

    expect(report.offlinePwaPin.pinnerEvaluated).toBe(true);
    expect(report.offlinePwaPin.integrityVerified).toBe(true);
    expect(report.coldBoot.readyForAirplaneMode).toBe(true);
    expect(report.zeroServerCompliance.compliant).toBe(true);
    expect(report.zeroServerCompliance.serverCostKrw).toBe(0);
    expect(report.zeroServerCompliance.aiTokensUsed).toBe(0);
    expect(report.zeroServerCompliance.eagerGraphImpactBytes).toBe(0);
    expect(report.issues).toHaveLength(0);
    expect(report.elapsedMs).toBeLessThan(100);

    // Fail-closed: 외부 CDN URL 및 손상된 WASM 해시 유입 시 즉시 차단
    const degraded = await auditSuperGapPlatformReadiness({
      measuredEagerGraphImpactBytes: 0,
      coldBootSnapshot: {
        serviceWorkerActive: true,
        opfsWritable: true,
        sqliteJournalHealthy: true,
        webCryptoSubtleAvailable: true,
        cachedAssets: [
          {
            assetPath: "/wasm/studio-wasm64-extended-suite.wasm",
            kind: "wasm",
            cached: true,
            expectedSha256Hex: extShaHex,
            actualSha256Hex: "0".repeat(64),
            byteLength: extBytes.byteLength,
          },
        ],
        externalBootUrls: ["https://cdn.example.invalid/boot.js"],
        estimatedAvailableStorageBytes: 512 * 1024 * 1024,
      },
    });
    expect(degraded.overallReady).toBe(false);
    expect(degraded.coldBoot.readyForAirplaneMode).toBe(false);
    expect(degraded.zeroServerCompliance.compliant).toBe(false);
    expect(degraded.issues.length).toBeGreaterThan(0);
  });

  it("Studio 초기 진입점(main.tsx · studio-legacy-editor-adapter.tsx)에 정적 import를 유입시키지 않는다(0B eager impact)", () => {
    const repoRoot = path.resolve(process.cwd());
    const entryPaths = [
      path.join(repoRoot, "apps/web/src/main.tsx"),
      path.join(repoRoot, "apps/web/src/domains/creator/studio-legacy-editor-adapter.tsx"),
    ];
    for (let i = 0; i < entryPaths.length; i += 1) {
      const p = entryPaths[i];
      if (!fs.existsSync(p)) continue;
      const src = fs.readFileSync(p, "utf8");
      expect(src).not.toContain("wasm64-supergap-runtime-hub");
    }
  });
});
