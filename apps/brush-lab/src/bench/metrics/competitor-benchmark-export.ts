import { QUADRATIC_PIGMENT_MODEL } from "../../engine/pigment/quadratic-pigment-model";

import type {
  BrushLabCompetitorQualityBenchReport,
  LongDurationSoakHorizonRow,
  MultiEngineBenchMatrixRow,
  OptimalServicePromotionProfile,
} from "./competitor-quality-bench";

export const BRUSH_LAB_BENCHMARK_BUNDLE_SCHEMA_VERSION = 2;

export interface BrushLabBenchmarkBundleInput {
  readonly exportedAt: string;
  readonly seed: number;
  readonly optimalProfile: OptimalServicePromotionProfile;
  readonly summaryReport: BrushLabCompetitorQualityBenchReport;
  readonly engineMatrix: readonly MultiEngineBenchMatrixRow[];
  readonly soakHorizons: readonly LongDurationSoakHorizonRow[];
}

export interface BrushLabBenchmarkBundleV2 extends BrushLabBenchmarkBundleInput {
  readonly schemaVersion: typeof BRUSH_LAB_BENCHMARK_BUNDLE_SCHEMA_VERSION;
  readonly localPigmentModel: typeof QUADRATIC_PIGMENT_MODEL;
}

/** 명칭을 정정한 로컬 모델과 검증 상태를 JSON v2에 명시한다. 시간은 호출자가 주입한다. */
export function createBrushLabBenchmarkBundleV2(input: BrushLabBenchmarkBundleInput): BrushLabBenchmarkBundleV2 {
  return {
    schemaVersion: BRUSH_LAB_BENCHMARK_BUNDLE_SCHEMA_VERSION,
    exportedAt: input.exportedAt,
    seed: input.seed,
    localPigmentModel: QUADRATIC_PIGMENT_MODEL,
    optimalProfile: input.optimalProfile,
    summaryReport: input.summaryReport,
    engineMatrix: input.engineMatrix,
    soakHorizons: input.soakHorizons,
  };
}

export function brushLabBenchmarkBundleFileName(seed: number): string {
  return `brush-lab-service-promotion-benchmark-v2-${seed}.json`;
}
