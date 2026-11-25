// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  DEFAULT_RING_CAPACITY,
  FRAME_PIPELINE_STAGE_IDS,
  JANK_THRESHOLD_120HZ_MS,
  JANK_THRESHOLD_60HZ_MS,
  MAX_RING_CAPACITY,
  MIN_RING_CAPACITY,
  PERF_DOCTOR_SCENARIO_IDS,
  StudioPerfDoctorPanel,
  analyzeFrameTimeRing,
  applyGuardrailPrescription,
  createFrameTimeRingBuffer,
  createPerfDoctorScenario,
  diagnoseStudioRuntimeHealth,
  pushFrameSample,
  pushFrameSamples,
  readFrameSamplesChronological,
  recommendAdaptiveGuardrail,
  type FrameTimeSampleInput,
  type StudioRuntimeTelemetryInput,
} from "./index";

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const MODULE_DIR = resolve(process.cwd(), "apps/web/src/domains/creator/studio-perf-doctor");
const MB = 1024 * 1024;

function makeTelemetry(overrides?: {
  vram?: Partial<StudioRuntimeTelemetryInput["vram"]>;
  tileCache?: Partial<StudioRuntimeTelemetryInput["tileCache"]>;
  opfsWal?: Partial<StudioRuntimeTelemetryInput["opfsWal"]>;
  canvasContext?: StudioRuntimeTelemetryInput["canvasContext"];
  frameAnalysis?: StudioRuntimeTelemetryInput["frameAnalysis"];
}): StudioRuntimeTelemetryInput {
  return {
    vram: {
      allocatedMb: 900,
      budgetMb: 2048,
      textureAtlasMb: 500,
      renderTargetMb: 260,
      stagingBufferMb: 140,
      deviceLostCount: 0,
      backend: "webgpu",
      ...overrides?.vram,
    },
    tileCache: {
      tileHits: 4800,
      tileMisses: 200,
      residentTiles: 500,
      maxResidentTiles: 1024,
      evictionsPerSec: 2,
      dirtyTilesQueued: 4,
      tileSizePx: 256,
      ...overrides?.tileCache,
    },
    opfsWal: {
      usedBytes: 300 * MB,
      quotaBytes: 1024 * MB,
      walSizeBytes: 5 * MB,
      walFramesPending: 40,
      lastCheckpointDelayMs: 16,
      avgCheckpointDelayMs: 12,
      checkpointBlocked: false,
      ...overrides?.opfsWal,
    },
    canvasContext: overrides?.canvasContext,
    frameAnalysis: overrides?.frameAnalysis,
  };
}

describe("Wave 41E — 실시간 120Hz 프레임타임 프로파일러 · 런타임 헬스 진단 · 적응형 가드레일", () => {
  it("1. 고정 길이 링버퍼는 용량 경계를 클램핑하고 불변 쓰기 및 순환 덮어쓰기 시간순 읽기를 보장한다", () => {
    expect(createFrameTimeRingBuffer(4).capacity).toBe(MIN_RING_CAPACITY);
    expect(createFrameTimeRingBuffer(99999).capacity).toBe(MAX_RING_CAPACITY);
    expect(createFrameTimeRingBuffer().capacity).toBe(DEFAULT_RING_CAPACITY);

    const initial = createFrameTimeRingBuffer(16);
    const batch: FrameTimeSampleInput[] = Array.from({ length: 22 }, (_, i) => ({
      totalMs: 4 + i * 0.2,
      stages: { input: 0.5, brushWasm: 1.5, webgpuComposite: 1.2, uiReact: 0.5 },
    }));
    const filled = pushFrameSamples(initial, batch);

    expect(initial.size).toBe(0);
    expect(filled.size).toBe(16);
    expect(filled.totalRecorded).toBe(22);
    expect(filled.writeIndex).toBe(6);

    const chronological = readFrameSamplesChronological(filled);
    expect(chronological).toHaveLength(16);
    expect(chronological[0]?.frameIndex).toBe(7);
    expect(chronological[15]?.frameIndex).toBe(22);

    const next = pushFrameSample(filled, {
      totalMs: 7.5,
      stages: { input: 0.6, brushWasm: 3.1, webgpuComposite: 2.5, uiReact: 0.8 },
    });
    expect(next.totalRecorded).toBe(23);
    expect(readFrameSamplesChronological(next)[0]?.frameIndex).toBe(8);
    expect(readFrameSamplesChronological(next)[15]?.frameIndex).toBe(23);
  });

  it("2. 빈 링버퍼와 비정상(NaN/음수/합계 미달) 샘플을 안전하게 정규화한다", () => {
    const empty = createFrameTimeRingBuffer(32);
    const emptyAnalysis = analyzeFrameTimeRing(empty);
    expect(emptyAnalysis.sampleCount).toBe(0);
    expect(emptyAnalysis.averageFps).toBe(0);
    expect(emptyAnalysis.onePercentLowFps).toBe(0);
    expect(emptyAnalysis.withinTargetBudget).toBe(true);
    expect(emptyAnalysis.grade).toBe("optimal");

    const dirty = pushFrameSample(empty, {
      totalMs: 1.0,
      stages: { input: -2, brushWasm: Number.NaN, webgpuComposite: 3.5, uiReact: 1.5 },
    });
    const sample = readFrameSamplesChronological(dirty)[0];
    expect(sample?.stages.input).toBe(0);
    expect(sample?.stages.brushWasm).toBe(0);
    expect(sample?.totalMs).toBe(5);
  });

  it("3. analyzeFrameTimeRing은 p50/p95/p99 백분위 단조성과 평균 FPS 및 1% low FPS를 정확히 계산한다", () => {
    let ring = createFrameTimeRingBuffer(100);
    const samples: FrameTimeSampleInput[] = Array.from({ length: 100 }, (_, i) => {
      const totalMs = i === 99 ? 25.0 : 5.0;
      return {
        totalMs,
        stages: { input: 0.5, brushWasm: totalMs - 2.0, webgpuComposite: 1.0, uiReact: 0.5 },
      };
    });
    ring = pushFrameSamples(ring, samples);
    const res = analyzeFrameTimeRing(ring, { targetHz: 120 });

    expect(res.minMs).toBeLessThanOrEqual(res.p50Ms);
    expect(res.p50Ms).toBeLessThanOrEqual(res.p95Ms);
    expect(res.p95Ms).toBeLessThanOrEqual(res.p99Ms);
    expect(res.p99Ms).toBeLessThanOrEqual(res.maxMs);
    expect(res.p50Ms).toBe(5);
    expect(res.p95Ms).toBe(5);
    expect(res.maxMs).toBe(25);
    expect(res.onePercentLowFps).toBe(40);
    expect(res.averageFps).toBeGreaterThan(res.onePercentLowFps);
  });

  it("4. > 8.33ms 경계값과 경미/중간/심각 쟁크 스파이크 분류·연속 스트릭·상위 스파이크 정렬이 정확하다", () => {
    const ring = pushFrameSamples(createFrameTimeRingBuffer(32), [
      { totalMs: 8.33, stages: { input: 0.5, brushWasm: 4.0, webgpuComposite: 3.0, uiReact: 0.83 } },
      { totalMs: 8.34, stages: { input: 0.5, brushWasm: 4.5, webgpuComposite: 2.5, uiReact: 0.84 } },
      { totalMs: 14.0, stages: { input: 0.6, brushWasm: 9.2, webgpuComposite: 3.0, uiReact: 1.2 } },
      { totalMs: 24.5, stages: { input: 0.7, brushWasm: 3.0, webgpuComposite: 19.3, uiReact: 1.5 } },
      { totalMs: 6.2, stages: { input: 0.5, brushWasm: 2.8, webgpuComposite: 2.1, uiReact: 0.8 } },
    ]);
    const res = analyzeFrameTimeRing(ring, { targetHz: 120 });

    expect(res.jank.thresholdMs).toBe(JANK_THRESHOLD_120HZ_MS);
    expect(res.jank.over833MsCount).toBe(3);
    expect(res.jank.totalSpikes).toBe(3);
    expect(res.jank.minorCount).toBe(1);
    expect(res.jank.moderateCount).toBe(1);
    expect(res.jank.severeCount).toBe(1);
    expect(res.jank.longestStreak).toBe(3);
    expect(res.jank.topSpikes[0]?.totalMs).toBe(24.5);
    expect(res.jank.topSpikes[0]?.severity).toBe("severe");
    expect(res.jank.topSpikes[0]?.dominantStage).toBe("webgpuComposite");
    expect(res.jank.topSpikes[1]?.dominantStage).toBe("brushWasm");
  });

  it("5. 120Hz와 60Hz 목표 주사율 전환 시 예산(8.33ms vs 16.67ms)과 판정이 정확히 달라진다", () => {
    const ring = pushFrameSamples(
      createFrameTimeRingBuffer(32),
      Array.from({ length: 24 }, () => ({
        totalMs: 11.4,
        stages: { input: 0.8, brushWasm: 5.2, webgpuComposite: 4.1, uiReact: 1.0 },
      })),
    );
    const hz120 = analyzeFrameTimeRing(ring, { targetHz: 120 });
    const hz60 = analyzeFrameTimeRing(ring, { targetHz: 60 });

    expect(hz120.budgetMs).toBe(JANK_THRESHOLD_120HZ_MS);
    expect(hz120.withinTargetBudget).toBe(false);
    expect(hz120.jank.totalSpikes).toBe(24);

    expect(hz60.budgetMs).toBe(JANK_THRESHOLD_60HZ_MS);
    expect(hz60.withinTargetBudget).toBe(true);
    expect(hz60.jank.totalSpikes).toBe(0);
    expect(hz60.jank.over833MsCount).toBe(24);
  });

  it("6. 4개 파이프라인 스테이지(input/brushWasm/webgpuComposite/uiReact) 비중 합계와 지배 스테이지가 정확하다", () => {
    const ring = pushFrameSamples(
      createFrameTimeRingBuffer(32),
      Array.from({ length: 20 }, () => ({
        totalMs: 10.0,
        stages: { input: 1.0, brushWasm: 5.0, webgpuComposite: 2.5, uiReact: 1.0 },
      })),
    );
    const res = analyzeFrameTimeRing(ring, { targetHz: 120 });
    expect(res.dominantStage).toBe("brushWasm");
    expect(res.stages.input.sharePct).toBe(10);
    expect(res.stages.brushWasm.sharePct).toBe(50);
    expect(res.stages.webgpuComposite.sharePct).toBe(25);
    expect(res.stages.uiReact.sharePct).toBe(10);
    expect(res.overheadSharePct).toBe(5);
    expect(res.stages.brushWasm.spikeAttributionCount).toBe(20);

    const totalPct =
      FRAME_PIPELINE_STAGE_IDS.reduce((acc, id) => acc + res.stages[id].sharePct, 0) + res.overheadSharePct;
    expect(totalPct).toBeCloseTo(100, 1);
  });

  it("7. 프레임타임 히스토그램 구간 합계가 전체 샘플 수와 일치하며 예산 초과 플래그가 정확하다", () => {
    const snap = createPerfDoctorScenario("vram-tile-pressure");
    const res120 = analyzeFrameTimeRing(snap.ring, { targetHz: 120 });
    const countSum = res120.histogram.reduce((acc, bin) => acc + bin.count, 0);
    expect(countSum).toBe(res120.sampleCount);
    expect(res120.histogram.find((b) => b.id === "bin-6-833")?.isOverBudget).toBe(false);
    expect(res120.histogram.find((b) => b.id === "bin-833-125")?.isOverBudget).toBe(true);

    const res60 = analyzeFrameTimeRing(snap.ring, { targetHz: 60 });
    expect(res60.histogram.find((b) => b.id === "bin-833-125")?.isOverBudget).toBe(false);
    expect(res60.histogram.find((b) => b.id === "bin-1667-25")?.isOverBudget).toBe(true);
  });

  it("8. diagnoseStudioRuntimeHealth는 GPU VRAM 압박 등급(nominal/warm/pressure/critical)과 deviceLost를 정확히 분류한다", () => {
    expect(diagnoseStudioRuntimeHealth(makeTelemetry({ vram: { allocatedMb: 1000, budgetMb: 2048 } })).vram.level).toBe("nominal");
    expect(diagnoseStudioRuntimeHealth(makeTelemetry({ vram: { allocatedMb: 1350, budgetMb: 2048 } })).vram.level).toBe("warm");
    expect(diagnoseStudioRuntimeHealth(makeTelemetry({ vram: { allocatedMb: 1650, budgetMb: 2048 } })).vram.level).toBe("pressure");
    expect(diagnoseStudioRuntimeHealth(makeTelemetry({ vram: { allocatedMb: 1900, budgetMb: 2048 } })).vram.level).toBe("critical");

    const lost = diagnoseStudioRuntimeHealth(makeTelemetry({ vram: { allocatedMb: 400, budgetMb: 2048, deviceLostCount: 1 } }));
    expect(lost.vram.level).toBe("critical");
    expect(lost.requiresIntervention).toBe(true);
  });

  it("9. 희소 타일 캐시 히트율·점유율·스래싱 감지와 조회 0건 안전 폴백을 검증한다", () => {
    const emptyLookup = diagnoseStudioRuntimeHealth(makeTelemetry({ tileCache: { tileHits: 0, tileMisses: 0 } }));
    expect(emptyLookup.tileCache.hitRatePct).toBe(100);
    expect(emptyLookup.tileCache.thrashingDetected).toBe(false);

    const thrash = diagnoseStudioRuntimeHealth(
      makeTelemetry({
        tileCache: { tileHits: 650, tileMisses: 350, residentTiles: 990, maxResidentTiles: 1024, evictionsPerSec: 44, dirtyTilesQueued: 102 },
      }),
    );
    expect(thrash.tileCache.hitRatePct).toBe(65);
    expect(thrash.tileCache.thrashingDetected).toBe(true);
    expect(thrash.tileCache.level).toBe("critical");
  });

  it("10. OPFS 할당량 및 SQLite WAL 체크포인트 지연·차단 진단과 PASSIVE/FULL/TRUNCATE 권장 모드를 검증한다", () => {
    const nominal = diagnoseStudioRuntimeHealth(makeTelemetry());
    expect(nominal.opfsWal.level).toBe("nominal");
    expect(nominal.opfsWal.recommendedCheckpointMode).toBe("PASSIVE");

    const pressure = diagnoseStudioRuntimeHealth(
      makeTelemetry({ opfsWal: { usedBytes: 810 * MB, walFramesPending: 850, lastCheckpointDelayMs: 175 } }),
    );
    expect(pressure.opfsWal.level).toBe("pressure");
    expect(pressure.opfsWal.recommendedCheckpointMode).toBe("FULL");

    const blocked = diagnoseStudioRuntimeHealth(
      makeTelemetry({ opfsWal: { usedBytes: 940 * MB, walFramesPending: 1650, lastCheckpointDelayMs: 380, checkpointBlocked: true } }),
    );
    expect(blocked.opfsWal.level).toBe("critical");
    expect(blocked.opfsWal.recommendedCheckpointMode).toBe("TRUNCATE");
  });

  it("11. 종합 헬스 점수와 병목 심각도 정렬(critical 우선) 및 프레임 분석 연동을 검증한다", () => {
    const snap = createPerfDoctorScenario("critical-opfs-stall");
    const frameAnalysis = analyzeFrameTimeRing(snap.ring, { targetHz: 120 });
    const diag = diagnoseStudioRuntimeHealth({ ...snap.telemetry, frameAnalysis });

    expect(diag.overallLevel).toBe("critical");
    expect(diag.healthScore).toBeLessThan(48);
    expect(diag.healthGrade).toBe("D");
    expect(diag.bottlenecks.length).toBeGreaterThanOrEqual(4);
    expect(diag.bottlenecks[0]?.severity).toBe("critical");
    expect(diag.requiresIntervention).toBe(true);
  });

  it("12. recommendAdaptiveGuardrail은 화질 무손실 단계를 우선 배치하고 압박 등급별 에스컬레이션을 산출한다", () => {
    const nominalSnap = createPerfDoctorScenario("nominal-120hz");
    const nominalFrame = analyzeFrameTimeRing(nominalSnap.ring, { targetHz: 120 });
    const nominalDiag = diagnoseStudioRuntimeHealth({ ...nominalSnap.telemetry, frameAnalysis: nominalFrame });
    const nominalReport = recommendAdaptiveGuardrail({ diagnosis: nominalDiag, frameAnalysis: nominalFrame });
    expect(nominalReport.escalationTier).toBe(0);
    expect(nominalReport.smooth120Hz.strokeResolutionScale).toBe(1);

    const critSnap = createPerfDoctorScenario("critical-opfs-stall");
    const critFrame = analyzeFrameTimeRing(critSnap.ring, { targetHz: 120 });
    const critDiag = diagnoseStudioRuntimeHealth({ ...critSnap.telemetry, frameAnalysis: critFrame });
    const critReport = recommendAdaptiveGuardrail({ diagnosis: critDiag, frameAnalysis: critFrame });
    expect(critReport.escalationTier).toBe(3);
    expect(critReport.smooth120Hz.steps[0]?.visualImpact).toBe("zero");
    expect(critReport.smooth120Hz.steps[1]?.visualImpact).toBe("zero");
    expect(critReport.smooth120Hz.steps[2]?.visualImpact).toBe("preview-only");
  });

  it("13. 120Hz 유지 우선 vs 4K 정밀 우선 프로파일 비교가 주사율·스트로크/커밋 해상도·화질 지수를 대조한다", () => {
    const snap = createPerfDoctorScenario("vram-tile-pressure");
    const frame = analyzeFrameTimeRing(snap.ring, { targetHz: 120 });
    const diag = diagnoseStudioRuntimeHealth({ ...snap.telemetry, frameAnalysis: frame });
    const report = recommendAdaptiveGuardrail({
      diagnosis: diag,
      frameAnalysis: frame,
      canvasContext: snap.telemetry.canvasContext,
    });

    expect(report.smooth120Hz.targetRefreshHz).toBe(120);
    expect(report.smooth120Hz.strokeResolutionScale).toBeLessThan(1);
    expect(report.smooth120Hz.commitResolutionScale).toBe(1);

    expect(report.precision4K.targetRefreshHz).toBe(60);
    expect(report.precision4K.strokeResolutionScale).toBe(1);
    expect(report.precision4K.commitResolutionScale).toBe(1);
    expect(report.precision4K.visualFidelityScore).toBeGreaterThan(report.smooth120Hz.visualFidelityScore);
    expect(report.comparisonRows).toHaveLength(5);
  });

  it("14. recommendAdaptiveGuardrail의 자동 추천 프로파일은 4K 임계 VRAM(GPU 지배)과 브러시 지배 상황을 구분한다", () => {
    const gpuCrit = createPerfDoctorScenario("critical-opfs-stall");
    const gpuFrame = analyzeFrameTimeRing(gpuCrit.ring, { targetHz: 120 });
    const gpuDiag = diagnoseStudioRuntimeHealth({ ...gpuCrit.telemetry, frameAnalysis: gpuFrame });
    const gpuReport = recommendAdaptiveGuardrail({
      diagnosis: gpuDiag,
      frameAnalysis: gpuFrame,
      canvasContext: gpuCrit.telemetry.canvasContext,
    });
    expect(gpuReport.autoRecommendedProfile).toBe("precision-4k");

    const brushWarm = createPerfDoctorScenario("brush-jank-warm");
    const brushFrame = analyzeFrameTimeRing(brushWarm.ring, { targetHz: 120 });
    const brushDiag = diagnoseStudioRuntimeHealth({ ...brushWarm.telemetry, frameAnalysis: brushFrame });
    const brushReport = recommendAdaptiveGuardrail({
      diagnosis: brushDiag,
      frameAnalysis: brushFrame,
      canvasContext: brushWarm.telemetry.canvasContext,
    });
    expect(brushReport.autoRecommendedProfile).toBe("smooth-120hz");
  });

  it("15. applyGuardrailPrescription은 p99·VRAM·타일 히트율·WAL 지연·헬스 점수를 결정론적으로 개선한다", () => {
    const snap = createPerfDoctorScenario("critical-opfs-stall");
    const frame = analyzeFrameTimeRing(snap.ring, { targetHz: 120 });
    const diag = diagnoseStudioRuntimeHealth({ ...snap.telemetry, frameAnalysis: frame });
    const report = recommendAdaptiveGuardrail({ diagnosis: diag, frameAnalysis: frame, preferredProfile: "smooth-120hz" });

    const applied = applyGuardrailPrescription(snap, report.smooth120Hz);
    expect(applied.appliedStepIds).toHaveLength(3);
    expect(applied.deltas.p99DeltaMs).toBeLessThan(0);
    expect(applied.deltas.vramPctDelta).toBeLessThan(0);
    expect(applied.deltas.tileHitPctDelta).toBeGreaterThan(0);
    expect(applied.deltas.walDelayDeltaMs).toBeLessThan(0);
    expect(applied.deltas.healthScoreDelta).toBeGreaterThan(0);
    expect(applied.afterDiagnosis.opfsWal.checkpointBlocked).toBe(false);
  });

  it("16. applyGuardrailPrescription에서 단일 WAL 단계만 선택하면 VRAM은 유지하고 WAL 지연만 해소하며 빈 선택은 무변경이다", () => {
    const snap = createPerfDoctorScenario("vram-tile-pressure");
    const frame = analyzeFrameTimeRing(snap.ring, { targetHz: 120 });
    const diag = diagnoseStudioRuntimeHealth({ ...snap.telemetry, frameAnalysis: frame });
    const report = recommendAdaptiveGuardrail({ diagnosis: diag, frameAnalysis: frame, preferredProfile: "smooth-120hz" });

    const walOnly = applyGuardrailPrescription(snap, report.smooth120Hz, ["smooth-120hz-wal-checkpoint"]);
    expect(walOnly.deltas.walDelayDeltaMs).toBeLessThan(0);
    expect(walOnly.deltas.vramPctDelta).toBe(0);

    const noop = applyGuardrailPrescription(snap, report.smooth120Hz, []);
    expect(noop.appliedStepIds).toHaveLength(0);
    expect(noop.deltas.p99DeltaMs).toBe(0);
    expect(noop.deltas.vramPctDelta).toBe(0);
  });

  it("17. 4종 결정론 시나리오(nominal -> warm -> pressure -> critical)가 재현 가능하며 압박 등급이 단조 상승한다", () => {
    expect(PERF_DOCTOR_SCENARIO_IDS).toEqual([
      "nominal-120hz",
      "brush-jank-warm",
      "vram-tile-pressure",
      "critical-opfs-stall",
    ]);
    const levels = PERF_DOCTOR_SCENARIO_IDS.map((id) => {
      const s1 = createPerfDoctorScenario(id);
      const s2 = createPerfDoctorScenario(id);
      expect(analyzeFrameTimeRing(s1.ring)).toEqual(analyzeFrameTimeRing(s2.ring));
      return diagnoseStudioRuntimeHealth({ ...s1.telemetry, frameAnalysis: analyzeFrameTimeRing(s1.ring) }).overallLevel;
    });
    expect(levels).toEqual(["nominal", "warm", "pressure", "critical"]);
  });

  it("18. StudioPerfDoctorPanel은 Props 없이 단독 렌더링되며 탭 1에 120Hz KPI·히스토그램·4스테이지 분해를 표시한다", () => {
    render(<StudioPerfDoctorPanel />);

    expect(screen.getByTestId("studio-perf-doctor-panel")).toBeTruthy();
    expect(screen.getByTestId("panel-frametime-profiler")).toBeTruthy();
    expect(screen.getByTestId("metric-p50").textContent).toContain("ms");
    expect(screen.getByTestId("metric-p95").textContent).toContain("ms");
    expect(screen.getByTestId("metric-p99").textContent).toContain("ms");
    expect(screen.getByTestId("metric-1pct-low-fps").textContent).toMatch(/\d+\.\d/);
    expect(screen.getByTestId("frametime-histogram")).toBeTruthy();

    for (const stageId of FRAME_PIPELINE_STAGE_IDS) {
      expect(screen.getByTestId(`stage-row-${stageId}`)).toBeTruthy();
    }
  });

  it("19. 탭 1에서 시나리오 전환·60Hz 전환·쟁크 스파이크 주입·초기화가 실시간 반영되고 콜백을 호출한다", () => {
    const onDiagnosisChange = vi.fn();
    render(<StudioPerfDoctorPanel initialScenarioId="nominal-120hz" onDiagnosisChange={onDiagnosisChange} />);

    expect(screen.getByTestId("metric-frame-grade").textContent).toBe("optimal");

    fireEvent.click(screen.getByTestId("btn-inject-gpu-stall"));
    expect(Number(screen.getByTestId("spike-severe-count").textContent)).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByTestId("btn-hz-60"));
    expect(screen.getByTestId("btn-hz-60").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("btn-scenario-critical-opfs-stall"));
    expect(screen.getByTestId("vram-pressure-badge").textContent).toContain("critical");

    fireEvent.click(screen.getByTestId("btn-reset-ring"));
    expect(onDiagnosisChange).toHaveBeenCalled();
  });

  it("20. 탭 2에서 VRAM·타일·OPFS WAL 진단, 120Hz vs 4K 프로파일 전환, 단계 토글, 1클릭 처방 적용 및 되돌리기가 동작한다", () => {
    const onGuardrailApplied = vi.fn();
    render(
      <StudioPerfDoctorPanel
        initialTab="runtime-health"
        initialScenarioId="critical-opfs-stall"
        onGuardrailApplied={onGuardrailApplied}
      />,
    );

    expect(screen.getByTestId("panel-runtime-health")).toBeTruthy();
    expect(screen.getByTestId("vram-level-pill").textContent).toContain("critical");
    expect(screen.getByTestId("wal-mode-pill").textContent).toBe("TRUNCATE");

    const beforeVram = screen.getByTestId("vram-usage-text").textContent;
    fireEvent.click(screen.getByTestId("btn-profile-precision-4k"));
    expect(screen.getByTestId("btn-profile-precision-4k").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("btn-apply-guardrail"));
    expect(onGuardrailApplied).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("guardrail-applied-banner").textContent).toContain("4K 정밀 우선");
    expect(screen.getByTestId("vram-usage-text").textContent).not.toBe(beforeVram);

    fireEvent.click(screen.getByTestId("btn-revert-guardrail"));
    expect(screen.getByTestId("vram-usage-text").textContent).toBe(beforeVram);
    expect(screen.queryByTestId("guardrail-applied-banner")).toBeNull();
  });

  it("21. 영문 로케일 단독 렌더링과 탭 ARIA 접근성 연결(tablist/tab/tabpanel)이 올바르게 동작한다", () => {
    render(<StudioPerfDoctorPanel locale="en" />);

    const tab1 = screen.getByTestId("tab-frametime-profiler");
    const tab2 = screen.getByTestId("tab-runtime-health");
    expect(tab1.getAttribute("role")).toBe("tab");
    expect(tab1.getAttribute("aria-selected")).toBe("true");
    expect(tab2.getAttribute("aria-selected")).toBe("false");

    fireEvent.click(tab2);
    expect(tab2.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("btn-apply-guardrail").textContent).toContain("Calculate Guardrail Example");
    expect(screen.getByTestId("panel-runtime-health").getAttribute("role")).toBe("tabpanel");
  });

  it("22. 모듈 4개 파일 전체가 엄격 정적 위생 규칙(800줄·시맨틱 토큰 전용·무스토리지·무BigInt·props 규칙)을 준수한다", () => {
    const files = [
      "realtime-perf-profiler.ts",
      "StudioPerfDoctorPanel.tsx",
      "index.ts",
      "studio-perf-doctor.test.tsx",
    ];
    const storageRe = new RegExp(["local", "Storage", "|", "session", "Storage"].join(""));
    const bigintHexRe = new RegExp(["0x[0-9a-fA-F]+", "n\\b"].join(""));
    const privateStoreRe = new RegExp(["private\\s+", "(?:readonly\\s+)?", "store\\b"].join(""));
    const rawColorRe = new RegExp(["#[0-9a-fA-F]{3,8}\\b", "|\\brgba?\\s*\\(", "|\\bhsla?\\s*\\("].join(""));

    for (const file of files) {
      const content = readFileSync(resolve(MODULE_DIR, file), "utf8");
      expect(content.split("\n").length, `${file} 800줄 제한 위반`).toBeLessThanOrEqual(800);
      expect(storageRe.test(content), `${file} 브라우저 스토리지 금지 위반`).toBe(false);
      expect(bigintHexRe.test(content), `${file} 0x...n BigInt 리터럴 금지 위반`).toBe(false);
      expect(privateStoreRe.test(content), `${file} private Map 금지 위반`).toBe(false);
    }

    const panelSrc = readFileSync(resolve(MODULE_DIR, "StudioPerfDoctorPanel.tsx"), "utf8");
    expect(rawColorRe.test(panelSrc), "UI panel must contain zero raw hex/rgb/hsl colors").toBe(false);
    expect(panelSrc.includes("[word-break:keep-all]")).toBe(true);
    expect(panelSrc.includes("tabular-nums")).toBe(true);
    expect(panelSrc.includes("min-h-11")).toBe(true);
    expect(/:\s*StudioPerfDoctorPanelProps\s*=\s*\{\s*\}/.test(panelSrc)).toBe(false);
  });
});
