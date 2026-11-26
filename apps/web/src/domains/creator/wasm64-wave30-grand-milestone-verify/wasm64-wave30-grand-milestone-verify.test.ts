import { describe, expect, it } from "vitest";

import {
  auditWaveCapabilityCatalog,
  computePreflightSha256Hex,
  createCleanEpisodePreflightInput,
  evaluateEpisodeMasterPreflightGate,
  getWaveCapabilityDescriptor,
  listWaveDescriptorsByDomain,
  listWaveDescriptorsByMaturity,
  PREFLIGHT_CATEGORIES,
  PREFLIGHT_CHECKS_PER_CATEGORY,
  PREFLIGHT_TOTAL_CHECKS,
  resolveHardwareExecutionTier,
  SUPERGAP_TOTAL_WAVES,
  SUPERGAP_WAVE_DOMAINS,
  SUPERGAP_WAVES_1_TO_30_CATALOG,
  TabletThermalBatteryGovernor,
  THERMAL_STATES,
  type DeviceCapabilityProbe,
  type SuperGapWaveDescriptor,
} from "./index";

describe("supergap-wave-capability-registry (Waves 1–30 순수 디스크립터 & 3계층 폴백 리졸버)", () => {
  it("Waves 1..30 전 항목이 누락·중복 없이 순서대로 등록되고 서버 비용 ₩0·초기 번들 0B를 보장한다", () => {
    const audit = auditWaveCapabilityCatalog();
    expect(audit.isValid).toBe(true);
    expect(audit.totalWaves).toBe(SUPERGAP_TOTAL_WAVES);
    expect(audit.sequentialCoverageComplete).toBe(true);
    expect(audit.missingWaveNumbers).toHaveLength(0);
    expect(audit.duplicateWaveNumbers).toHaveLength(0);
    expect(audit.duplicateDirectories).toHaveLength(0);
    expect(audit.nonZeroCostWaveNumbers).toHaveLength(0);
    expect(audit.idleBudgetViolationWaveNumbers).toHaveLength(0);
    expect(audit.catalogDigestFnv1a32Hex).toHaveLength(8);

    for (let w = 1; w <= SUPERGAP_TOTAL_WAVES; w += 1) {
      const descriptor = getWaveCapabilityDescriptor(w);
      expect(descriptor).toBeDefined();
      expect(descriptor?.waveNumber).toBe(w);
      expect(descriptor?.runtimeCostKrw).toBe(0);
      expect(descriptor?.eagerBundleBytes).toBe(0);
      expect(descriptor?.portableFallbackGuaranteed).toBe(true);
      expect(descriptor?.idleBudgetMs).toBeGreaterThan(0);
      expect(descriptor?.idleBudgetMs).toBeLessThanOrEqual(2.0);
    }

    expect(getWaveCapabilityDescriptor(0)).toBeUndefined();
    expect(getWaveCapabilityDescriptor(31)).toBeUndefined();

    const domainTotal = SUPERGAP_WAVE_DOMAINS.reduce(
      (acc, domain) => acc + listWaveDescriptorsByDomain(domain).length,
      0,
    );
    expect(domainTotal).toBe(30);
    expect(
      listWaveDescriptorsByMaturity("live").length +
        listWaveDescriptorsByMaturity("experimental").length,
    ).toBe(30);
  });

  it("손상된 카탈로그 입력에 대해 누락 번호와 유휴 예산 초과를 정확히 검출한다", () => {
    const mutated: SuperGapWaveDescriptor[] = SUPERGAP_WAVES_1_TO_30_CATALOG.slice(0, 29).map(
      (entry, idx) => (idx === 3 ? { ...entry, idleBudgetMs: 4.5 } : entry),
    );
    const report = auditWaveCapabilityCatalog(mutated);
    expect(report.isValid).toBe(false);
    expect(report.sequentialCoverageComplete).toBe(false);
    expect(report.missingWaveNumbers).toContain(30);
    expect(report.idleBudgetViolationWaveNumbers).toContain(4);
  });

  it("기기 하드웨어 프로브에 따라 tier-1, tier-2, tier-3 폴백과 한국어 사유를 결정론적으로 선택한다", () => {
    const tier1Probe: DeviceCapabilityProbe = {
      webgpu: true,
      wasmSimd128: true,
      wasmMemory64: true,
      opfsSyncHandle: true,
      webCodecs: true,
      sharedArrayBuffer: true,
      deviceMemoryGb: 16,
    };
    const res1 = resolveHardwareExecutionTier(tier1Probe);
    const res1Repeat = resolveHardwareExecutionTier(tier1Probe);
    expect(res1.selectedTier).toBe("tier-1-webgpu-wasm64");
    expect(res1.isFullTier1Hardware).toBe(true);
    expect(res1.missingForTier1Ko).toHaveLength(0);
    expect(res1.fallbackReasonsKo).toHaveLength(0);
    expect(res1.subsystemRouting.renderBackend).toBe("webgpu-compute");
    expect(res1.subsystemRouting.wasmMemoryModel).toBe("wasm64-linear-16gib");
    expect(res1.resolutionDigestFnv1a32Hex).toBe(res1Repeat.resolutionDigestFnv1a32Hex);
    expect(res1.waveExecutionPlan).toHaveLength(30);
    expect(res1.waveExecutionPlan.every((w) => w.runtimeCostKrw === 0)).toBe(true);

    const tier2Probe: DeviceCapabilityProbe = {
      webgpu: false,
      wasmSimd128: true,
      wasmMemory64: false,
      opfsSyncHandle: true,
      webCodecs: true,
      sharedArrayBuffer: false,
      deviceMemoryGb: 6,
    };
    const res2 = resolveHardwareExecutionTier(tier2Probe);
    expect(res2.selectedTier).toBe("tier-2-webgl2-simd");
    expect(res2.missingForTier1Ko.length).toBeGreaterThanOrEqual(3);
    expect(res2.explanationKo).toContain("2계층");
    expect(res2.subsystemRouting.renderBackend).toBe("webgl2-instanced");
    expect(res2.subsystemRouting.workerPoolTopology).toBe("message-port-transferable");

    const tier3Probe: DeviceCapabilityProbe = {
      webgpu: false,
      wasmSimd128: false,
      wasmMemory64: false,
      opfsSyncHandle: false,
      webCodecs: false,
      sharedArrayBuffer: false,
      deviceMemoryGb: 2,
      webgl2: false,
    };
    const res3 = resolveHardwareExecutionTier(tier3Probe);
    expect(res3.selectedTier).toBe("tier-3-canvas2d-portable");
    expect(res3.missingForTier2Ko.length).toBeGreaterThanOrEqual(2);
    expect(res3.explanationKo).toContain("3계층");
    expect(res3.subsystemRouting.renderBackend).toBe("canvas2d-tile-cpu");
    expect(res3.waveExecutionPlan.every((w) => w.executionMode === "portable-canvas2d-scalar")).toBe(
      true,
    );
  });

  it("WebCodecs만 미지원인 고사양 기기에서는 1계층 그래픽 가속을 유지하고 영상 인코더만 폴백한다", () => {
    const res = resolveHardwareExecutionTier({
      webgpu: true,
      wasmSimd128: true,
      wasmMemory64: true,
      opfsSyncHandle: true,
      webCodecs: false,
      sharedArrayBuffer: true,
      deviceMemoryGb: 12,
    });
    expect(res.selectedTier).toBe("tier-1-webgpu-wasm64");
    expect(res.isFullTier1Hardware).toBe(false);
    expect(res.subsystemRouting.videoMuxBackend).toBe("wasm-software-frame-encoder");
    expect(res.fallbackReasonsKo.some((reason) => reason.includes("WebCodecs"))).toBe(true);
  });
});

describe("episode-master-preflight-gate (6개 범주 × 6개 = 36항목 마스터 출고 게이트)", () => {
  it("정상 스튜디오 회차는 6개 범주 36개 전 항목(36/36)을 통과하고 결정론적 해시 지문을 생성한다", () => {
    // FIPS 180-4 표준 벡터("abc") 검증
    expect(computePreflightSha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );

    const cleanInput = createCleanEpisodePreflightInput();
    const reportA = evaluateEpisodeMasterPreflightGate(cleanInput);
    const reportB = evaluateEpisodeMasterPreflightGate(cleanInput);

    expect(reportA.totalChecks).toBe(PREFLIGHT_TOTAL_CHECKS);
    expect(reportA.checks).toHaveLength(36);
    expect(reportA.passedCount).toBe(36);
    expect(reportA.warningCount).toBe(0);
    expect(reportA.blockedCount).toBe(0);
    expect(reportA.overallSeverity).toBe("pass");
    expect(reportA.canPublishMaster).toBe(true);
    expect(reportA.blockingReasonsKo).toHaveLength(0);
    expect(reportA.recommendedFixesKo).toHaveLength(0);

    for (let i = 0; i < 36; i += 1) {
      expect(reportA.checks[i]?.globalCheckIndex).toBe(i + 1);
    }

    for (const category of PREFLIGHT_CATEGORIES) {
      const summary = reportA.categorySummaries[category];
      expect(summary.totalChecks).toBe(PREFLIGHT_CHECKS_PER_CATEGORY);
      expect(summary.passedCount).toBe(6);
      expect(summary.categorySeverity).toBe("pass");
    }

    expect(reportA.readinessDigestFnv1a32Hex).toHaveLength(8);
    expect(reportA.readinessDigestSha256Hex).toHaveLength(64);
    expect(reportA.readinessDigestSha256Hex).toBe(reportB.readinessDigestSha256Hex);
  });

  it("단행본 CMYK 잉크 총량(TAC > 300%) 초과 시 출고를 즉시 차단하고 한국어 사유를 반환한다", () => {
    const clean = createCleanEpisodePreflightInput();
    const report = evaluateEpisodeMasterPreflightGate({
      ...clean,
      print: { ...clean.print, maxTacPercent: 318.5 },
    });

    expect(report.canPublishMaster).toBe(false);
    expect(report.overallSeverity).toBe("block");
    expect(report.blockedCount).toBe(1);
    expect(report.categorySummaries["print-cmyk-bleed"].categorySeverity).toBe("block");
    expect(
      report.blockingReasonsKo.some(
        (reason) =>
          reason.includes("print-cmyk-bleed.01-total-area-coverage") &&
          reason.includes("출고 차단 사유:"),
      ),
    ).toBe(true);
  });

  it("오디오툰 트루피크(truePeak > -1.0 dBTP) 초과 시 클리핑 위험으로 출고를 차단한다", () => {
    const clean = createCleanEpisodePreflightInput();
    const report = evaluateEpisodeMasterPreflightGate({
      ...clean,
      audio: { ...clean.audio, truePeakDbtp: -0.35 },
    });

    expect(report.canPublishMaster).toBe(false);
    expect(report.blockedCount).toBe(1);
    expect(report.categorySummaries["audio-lufs-truepeak"].blockedCount).toBe(1);
    expect(
      report.blockingReasonsKo.some((reason) =>
        reason.includes("audio-lufs-truepeak.02-true-peak-ceiling"),
      ),
    ).toBe(true);
  });

  it("상업 라이선스 미보유 폰트 포함 시 Rights BOM 범주에서 출고를 차단한다", () => {
    const clean = createCleanEpisodePreflightInput();
    const report = evaluateEpisodeMasterPreflightGate({
      ...clean,
      rightsBom: {
        ...clean.rightsBom,
        fonts: [
          { fontFamily: "Pretendard Std", licenseState: "commercial-verified" },
          { fontFamily: "개인전용무료손글씨체", licenseState: "unlicensed" },
        ],
      },
    });

    expect(report.canPublishMaster).toBe(false);
    expect(report.categorySummaries["rights-bom-provenance"].categorySeverity).toBe("block");
    expect(
      report.blockingReasonsKo.some(
        (reason) =>
          reason.includes("font-commercial-license") && reason.includes("개인전용무료손글씨체"),
      ),
    ).toBe(true);
  });

  it("개인정보(이메일·휴대전화·주민번호·로컬 경로·GPS·시크릿 접두어) 유출을 선형 스캐너로 차단한다", () => {
    const clean = createCleanEpisodePreflightInput();
    const syntheticToken = ["sk", "proj", "leakcheck"].join("-");
    const report = evaluateEpisodeMasterPreflightGate({
      ...clean,
      pii: {
        metadataFields: [
          "authorContact: creator.kim@studio.example",
          "urgentPhone: 010-2345-6789",
          "taxIdMemo: 920815-1234567",
          "linkedBrush: /Users/creator/Documents/brush.abr",
          `debugToken: ${syntheticToken}`,
        ],
        exifGpsCoordinateCount: 2,
        unscrubbedHiddenMemoCount: 1,
      },
    });

    expect(report.canPublishMaster).toBe(false);
    expect(report.categorySummaries["pii-zero-leak"].blockedCount).toBe(6);
    expect(report.blockedCount).toBe(6);
  });

  it("경계선 경고 항목만 존재할 때는 출고를 허용하되 권장 보완 사항을 빠짐없이 안내한다", () => {
    const clean = createCleanEpisodePreflightInput();
    const report = evaluateEpisodeMasterPreflightGate({
      ...clean,
      portal: { ...clean.portal, canvasWidthPx: 760 },
      print: { ...clean.print, maxTacPercent: 294 },
      audio: { ...clean.audio, truePeakDbtp: -1.08 },
    });

    expect(report.canPublishMaster).toBe(true);
    expect(report.overallSeverity).toBe("warn");
    expect(report.blockedCount).toBe(0);
    expect(report.warningCount).toBe(3);
    expect(report.recommendedFixesKo).toHaveLength(3);
    expect(report.recommendedFixesKo.every((hint) => hint.includes("권장 보완 사항:"))).toBe(true);
  });
});

describe("tablet-thermal-battery-governor (발열·배터리 품질 거버너 & 펜 샘플링 무감쇠 불변식)", () => {
  it("발열 단계 상승(nominal -> critical)에 따라 백그라운드 예산을 점진 감축하고 critical에서 0ms로 차단한다", () => {
    const governor = new TabletThermalBatteryGovernor();
    const snapshots = THERMAL_STATES.map((thermalState) =>
      governor.evaluate({
        thermalState,
        batteryLevel: 0.82,
        isCharging: false,
        frameTimeEwmaMs: 9.0,
        isStylusDown: false,
      }),
    );

    const [nominal, fair, serious, critical] = snapshots;
    expect(nominal?.pressureLevel).toBe(0);
    expect(fair?.pressureLevel).toBe(1);
    expect(serious?.pressureLevel).toBe(2);
    expect(critical?.pressureLevel).toBe(3);

    expect(nominal?.idleBackgroundBudgetMs).toBeGreaterThan(fair?.idleBackgroundBudgetMs ?? 0);
    expect(fair?.idleBackgroundBudgetMs).toBeGreaterThan(serious?.idleBackgroundBudgetMs ?? 0);
    expect(serious?.idleBackgroundBudgetMs).toBeGreaterThan(0);
    expect(critical?.idleBackgroundBudgetMs).toBe(0);

    expect(nominal?.viewportPixelRatio).toBeGreaterThan(critical?.viewportPixelRatio ?? 2);
    expect(nominal?.shadowCascadeCount).toBe(4);
    expect(critical?.shadowCascadeCount).toBe(0);
    expect(critical?.ambientParticleScale).toBe(0);
    expect(critical?.targetCanvasHz).toBe(30);
  });

  it("모든 발열·배터리·프레임 지연·펜 접촉 조합에서 stylusSamplingUnthrottled === true를 보장한다", () => {
    const governor = new TabletThermalBatteryGovernor();
    const batteries = [1.0, 0.25, 0.12, 0.03];
    const frameTimes = [7.5, 16.5, 24.0, 42.0];

    for (const thermalState of THERMAL_STATES) {
      for (const batteryLevel of batteries) {
        for (const isCharging of [true, false]) {
          for (const frameTimeEwmaMs of frameTimes) {
            for (const isStylusDown of [false, true]) {
              const budget = governor.evaluate({
                thermalState,
                batteryLevel,
                isCharging,
                frameTimeEwmaMs,
                isStylusDown,
              });
              expect(budget.stylusSamplingUnthrottled).toBe(true);
              expect(budget.coalescedPointerCaptureActive).toBe(true);
              expect(budget.droppedStylusSampleCount).toBe(0);
            }
          }
        }
      }
    }
  });

  it("임계값 주변의 단발성 프레임·배터리 지터에는 진동하지 않고 연속 과부하에만 전이한다", () => {
    const governor = new TabletThermalBatteryGovernor({
      metricEscalationConfirmTicks: 2,
      recoveryHoldTicks: 3,
    });

    // 14.0ms 경계 주변을 매 프레임 위아래로 흔드는 지터 시퀀스 -> 전이 0회 유지
    const jitterFrames = [13.5, 14.4, 13.7, 14.3, 13.6, 14.5, 13.4, 14.2];
    for (const frameTimeEwmaMs of jitterFrames) {
      const budget = governor.evaluate({
        thermalState: "nominal",
        batteryLevel: 0.55,
        isCharging: false,
        frameTimeEwmaMs,
        isStylusDown: false,
      });
      expect(budget.pressureLevel).toBe(0);
      expect(budget.levelTransitionCount).toBe(0);
    }

    // 2틱 연속 과부하 입력 시 비로소 1단계 감축으로 안정 전이
    governor.evaluate({
      thermalState: "nominal",
      batteryLevel: 0.55,
      isCharging: false,
      frameTimeEwmaMs: 16.2,
      isStylusDown: false,
    });
    const confirmed = governor.evaluate({
      thermalState: "nominal",
      batteryLevel: 0.55,
      isCharging: false,
      frameTimeEwmaMs: 16.4,
      isStylusDown: false,
    });
    expect(confirmed.pressureLevel).toBe(1);
    expect(confirmed.levelTransitionCount).toBe(1);
  });

  it("critical 진입 후 펜 드로잉 중에는 해상도 복귀를 보류하고 펜을 뗀 뒤 단계별로 복귀한다", () => {
    const governor = new TabletThermalBatteryGovernor({ recoveryHoldTicks: 3 });

    const emergency = governor.evaluate({
      thermalState: "critical",
      batteryLevel: 0.85,
      isCharging: true,
      frameTimeEwmaMs: 28.0,
      isStylusDown: true,
    });
    expect(emergency.pressureLevel).toBe(3);
    expect(emergency.idleBackgroundBudgetMs).toBe(0);
    expect(emergency.stylusSamplingUnthrottled).toBe(true);

    // 온도가 nominal로 식었더라도 펜이 캔버스에 닿아 있는 동안에는 프레임버퍼 재할당 복귀를 보류한다
    for (let i = 0; i < 4; i += 1) {
      const drawingBudget = governor.evaluate({
        thermalState: "nominal",
        batteryLevel: 0.85,
        isCharging: true,
        frameTimeEwmaMs: 8.2,
        isStylusDown: true,
      });
      expect(drawingBudget.pressureLevel).toBe(3);
      expect(drawingBudget.midStrokeResolutionLocked).toBe(true);
      expect(drawingBudget.stylusSamplingUnthrottled).toBe(true);
    }

    // 펜을 뗀 뒤 3틱 연속 안정 구간을 거치면 3 -> 2로 정확히 한 단계만 완만하게 복귀한다
    const calm1 = governor.evaluate({
      thermalState: "nominal",
      batteryLevel: 0.85,
      isCharging: true,
      frameTimeEwmaMs: 8.2,
      isStylusDown: false,
    });
    const calm2 = governor.evaluate({
      thermalState: "nominal",
      batteryLevel: 0.85,
      isCharging: true,
      frameTimeEwmaMs: 8.1,
      isStylusDown: false,
    });
    const recoveredOneStep = governor.evaluate({
      thermalState: "nominal",
      batteryLevel: 0.85,
      isCharging: true,
      frameTimeEwmaMs: 8.0,
      isStylusDown: false,
    });

    expect(calm1.pressureLevel).toBe(3);
    expect(calm2.pressureLevel).toBe(3);
    expect(recoveredOneStep.pressureLevel).toBe(2);
    expect(recoveredOneStep.stylusSamplingUnthrottled).toBe(true);
  });
});
