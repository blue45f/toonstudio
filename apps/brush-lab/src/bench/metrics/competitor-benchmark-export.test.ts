import { describe, expect, it } from "vitest";

import { QUADRATIC_PIGMENT_MODEL } from "../../engine/pigment/quadratic-pigment-model";

import { brushLabBenchmarkBundleFileName, createBrushLabBenchmarkBundleV2 } from "./competitor-benchmark-export";
import {
  runBrushLabCompetitorQualityBenchmark,
  runLongDurationDrawingSoakBenchmark,
  runMultiEngineBrushMatrixBenchmark,
  selectOptimalServiceBrushConfiguration,
} from "./competitor-quality-bench";

describe("브러시 벤치마크 JSON v2", () => {
  const seed = 20261027;
  const input = {
    exportedAt: "2026-10-29T00:00:00.000Z",
    seed,
    optimalProfile: selectOptimalServiceBrushConfiguration(seed),
    summaryReport: runBrushLabCompetitorQualityBenchmark(seed),
    engineMatrix: runMultiEngineBrushMatrixBenchmark(seed),
    soakHorizons: runLongDurationDrawingSoakBenchmark(),
  };

  it("명시한 v2 파일명·스키마와 원산지 미확인 모델 분류를 내보내며 수치는 그대로 직렬화한다", () => {
    const bundle = createBrushLabBenchmarkBundleV2(input);
    const roundTrip: unknown = JSON.parse(JSON.stringify(bundle));
    expect(brushLabBenchmarkBundleFileName(seed)).toBe("brush-lab-service-promotion-benchmark-v2-20261027.json");
    expect(roundTrip).toEqual(bundle);
    expect(bundle.schemaVersion).toBe(2);
    expect(bundle.exportedAt).toBe(input.exportedAt);
    expect(bundle.localPigmentModel).toEqual(QUADRATIC_PIGMENT_MODEL);
    expect(bundle.summaryReport).toBe(input.summaryReport);
    expect(bundle.engineMatrix).toBe(input.engineMatrix);
    expect(bundle.soakHorizons).toBe(input.soakHorizons);
  });

  it("v2 지표 키를 고정하고 로컬 모델의 기존 수치와 비승격 상태를 함께 보존한다", () => {
    const bundle = createBrushLabBenchmarkBundleV2(input);
    expect(Object.keys(bundle.summaryReport).sort()).toEqual([
      "reaEvidenceId", "reaNotExaminedCount", "reaWave36EvidenceId", "reaWave36RelevantFiles", "reaWave36NotExaminedCount",
      "paperSeamScore", "grainContrastPreservationRatio", "pressureGrainSpearman", "pressureWidthSpearman",
      "bezierSmoothedJitterRmsPx", "ggxSpecularHighlightBrdf", "rybGreenComplementRgb", "fluidDivergenceReductionDelta",
      "ghostWashMudEliminationGain01", "spectral38ChromaPreservationGain01", "quadraticPigmentEndpointIdentityError",
      "p5BrushGrownVertexCount", "p5BrushSuperGaussianPressure01", "lazyBrushOutsideDeadZone", "seant23CubicFlatness",
      "webgpuZeroCopyHotPathMapAsyncCount", "webgpuCpuDrawCallLoopCount", "compositeQualityScore100", "promotionGatePassed",
    ].sort());
    expect(bundle.summaryReport.quadraticPigmentEndpointIdentityError).toBe(0);
    expect(bundle.engineMatrix).toHaveLength(12);
    expect(bundle.engineMatrix.find((row) => row.engineId === QUADRATIC_PIGMENT_MODEL.id)).toMatchObject({
      promotedToService: false,
      p50FrameMs: 0.44,
      p95FrameMs: 0.79,
      throughputDabsPerSec: 2_390_000,
      compositeScore100: 99.5,
    });
    expect(bundle.optimalProfile.selectedPrimaryEngineId).toBe("sumi-webgpu-zero-copy-indirect");
  });
});
