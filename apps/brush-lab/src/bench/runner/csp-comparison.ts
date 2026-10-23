/**
 * CSP(Clip Studio Paint) 기준선 비교 러너.
 *
 * 모든 프리셋 × 모든 레인을 측정하고 cpu-reference를 CSP 기준선 대역에 매핑해
 * "어떤 레인이 CSP 체감 품질·성능에 가장 가까운지"를 스코어링한다.
 *
 * 측정 항목(기존 runFixture 재사용):
 *   - 품질: deltaE99, fuzzyMismatchPct(참조 레인 대비), grainContrastPreservation,
 *     seamScore, edgeStaircaseEnergy, pressureMonotonicity, edgeTransitionWidthPx,
 *     taperWidthError
 *   - 성능: frameP95Ms, dabsPerSecond
 *
 * 출력:
 *   - 매트릭스(프리셋 × 레인): CSP 스코어(0~1)·품질·성능 측정치
 *   - CSP 기준선 달성 레인(종합 스코어 ≥ 0.8)
 *   - 프리셋·가족별 최적 레인 추천
 */

import { PRESET_CATALOG } from "../../engine/presets/catalog";
import { normalizeProgram } from "../../engine/presets/program-schema";
import { LANE_REGISTRY, laneById } from "../../lanes/registry";
import { buildAllFixtures } from "../fixtures/stroke-fixtures";
import {
  cspOverallScore,
  cspScoreOf,
  cspSuperiorityRatioOf,
  type CspSuperiorityDimensionScores,
} from "../metrics/csp-baseline";
import { computeFamilyMetrics } from "../metrics/family-metrics";

import { runFixture, type RunResult } from "./run-fixture";

import type { Clock } from "../../engine/core/types";
import type { BrushProgram, BrushFamily } from "../../engine/presets/program-schema";
import type { LaneId, LaneKind, LaneStatus } from "../../lanes/lane";
import type { StrokeFixture } from "../fixtures/stroke-fixtures";


/** CSP 비교 측정 단위(단일 레인·단일 프리셋·단일 픽스처). */
export interface CspMeasureResult {
  laneId: LaneId;
  laneKind: LaneKind;
  laneStatus: LaneStatus;
  presetId: string;
  fixtureId: string;
  width: number;
  height: number;
  /** 품질 지표(품질 스코어 계산용). */
  qualityMetrics: Record<string, number | null>;
  /** 성능 지표(성능 스코어 계산용). */
  perfMetrics: {
    frameP95Ms: number | null;
    dabsPerSecond: number | null;
    elapsedMs: number | null;
  };
  /** CSP 기준선 스코어(0~1). null이면 측정 불가. */
  qualityScore: number | null;
  perfScore: number | null;
  overallScore: number | null;
  /** CSP 기준선(1.0x) 대비 무제한 우위 배율(>= 2.0x 목표 검증용). */
  superiorityRatio?: CspSuperiorityDimensionScores | null;
  /** 미지원 사유(null이면 지원). */
  unavailableReason: string | null;
}

/** 단일 프리셋 전체 레인 CSP 비교 결과. */
export interface CspBrushComparison {
  presetId: string;
  presetName: string;
  family: BrushFamily;
  description: string;
  results: CspMeasureResult[];
  /** CSP 종합 스코어 기준 달성 레인(내림차순). */
  cspQualifiedLanes: LaneId[];
  /** 이 프리셋 추천 레인(CSP 스코어 기준). */
  recommendedLane: LaneId | null;
  /** 추천 이유(한글). */
  recommendationReasonKo: string | null;
}

/** 전체 CSP 비교 결과. */
export interface CspComparisonReport {
  generatedAt: string;
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
    cpuCount: number;
  };
  comparisons: CspBrushComparison[];
  familyRecommendations: Record<BrushFamily, CspFamilyRecommendation>;
  summary: {
    totalPresets: number;
    totalLanes: number;
    totalMeasurements: number;
    successfulMeasurements: number;
    cspQualifiedMeasurements: number;
    cspQualifiedRate: number;
    topOverallLanes: Array<{ laneId: LaneId; wins: number }>;
  };
}

/** 가족별 CSP 추천 상세. */
export interface CspFamilyRecommendation {
  family: BrushFamily;
  presetCount: number;
  recommendedLane: LaneId | null;
  laneName: string;
  avgOverallScore: number | null;
  alternatives: Array<{ laneId: LaneId; avgOverallScore: number | null }>;
}

/** 소규모 캔버스(측정 속도 우선). */
const TEST_CANVAS_SIZE = 256;

/** 테스트용 시드. */
const TEST_SEED = 42;

/** 테스트할 픽스처(대표 2종). */
const TEST_FIXTURE_IDS: readonly string[] = ["zigzag", "spiral"];

/** 단일 렌더링 측정(CSP 비교용). */
async function measureSingleEngine(
  laneId: LaneId,
  preset: BrushProgram,
  fixture: StrokeFixture,
  clock: Clock,
): Promise<CspMeasureResult> {
  const laneDesc = laneById(laneId);
  const env = {
    width: TEST_CANVAS_SIZE,
    height: TEST_CANVAS_SIZE,
    dpr: 1,
    clock,
    userAgent: "csp-benchmark",
  };

  let result: RunResult;
  try {
    result = await runFixture({
      lane: laneDesc.create(),
      env: env as unknown as Parameters<typeof runFixture>[0]["env"],
      fixture,
      program: preset,
      seed: TEST_SEED,
      frameMs: 16.67,
      speed: 1,
      disposeLane: true,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      laneId,
      laneKind: laneDesc.kind,
      laneStatus: laneDesc.status,
      presetId: preset.id,
      fixtureId: fixture.id,
      width: TEST_CANVAS_SIZE,
      height: TEST_CANVAS_SIZE,
      qualityMetrics: {},
      perfMetrics: { frameP95Ms: null, dabsPerSecond: null, elapsedMs: null },
      qualityScore: null,
      perfScore: null,
      overallScore: null,
      superiorityRatio: null,
      unavailableReason: msg,
    };
  }

  const familyMetrics = computeFamilyMetrics(preset.family, {
    out: result.image,
    fixture,
    program: preset,
    linear: result.linear ?? null,
  });

  // 성능 지표 추출
  const frameTimes = result.receipt.frameTimesMs;
  let frameP95Ms: number | null = null;
  if (frameTimes.length > 0) {
    const sorted = [...frameTimes].sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * 0.95) - 1;
    frameP95Ms = sorted[Math.max(0, idx)] ?? null;
  }
  const dabsPerSecond =
    result.receipt.dabCount > 0 && result.elapsedMs > 0
      ? (result.receipt.dabCount * 1000) / result.elapsedMs
      : null;

  // 품질 스코어: familyMetrics를 CSP 기준선 테이블로 정규화
  const normalizedQualityScores = cspScoreOf(
    preset.family,
    TEST_CANVAS_SIZE,
    TEST_CANVAS_SIZE,
    familyMetrics as Record<string, number | null>,
  );
  const qualityScore = cspOverallScore(normalizedQualityScores);

  // 성능 스코어: frameP95Ms, dabsPerSecond
  const perfMetricsObj: Record<string, number | null> = {
    ...(familyMetrics as Record<string, number | null>),
    frameP95Ms,
    dabsPerSecond,
  };
  const normalizedPerfScores = cspScoreOf(
    preset.family,
    TEST_CANVAS_SIZE,
    TEST_CANVAS_SIZE,
    perfMetricsObj,
  );
  const perfScoreVal = cspOverallScore(normalizedPerfScores);

  const overallScore =
    qualityScore !== null && perfScoreVal !== null
      ? (qualityScore + perfScoreVal) / 2
      : qualityScore ?? perfScoreVal ?? null;

  const superiorityRatio = cspSuperiorityRatioOf(
    preset.family,
    TEST_CANVAS_SIZE,
    TEST_CANVAS_SIZE,
    perfMetricsObj,
  );

  return {
    laneId,
    laneKind: laneDesc.kind,
    laneStatus: laneDesc.status,
    presetId: preset.id,
    fixtureId: fixture.id,
    width: TEST_CANVAS_SIZE,
    height: TEST_CANVAS_SIZE,
    qualityMetrics: familyMetrics as Record<string, number | null>,
    perfMetrics: { frameP95Ms, dabsPerSecond, elapsedMs: result.elapsedMs },
    qualityScore,
    perfScore: perfScoreVal,
    overallScore,
    superiorityRatio,
    unavailableReason: null,
  };
}

/** 단일 프리셋 전체 레인 CSP 비교 측정. */
async function measureSingleBrush(preset: BrushProgram, clock: Clock): Promise<CspBrushComparison> {
  const results: CspMeasureResult[] = [];

  for (const laneDesc of LANE_REGISTRY) {
    const laneId = laneDesc.id;
    const fixtures = laneId === "cpu-reference" ? TEST_FIXTURE_IDS : [TEST_FIXTURE_IDS[0]];

    for (const fixtureId of fixtures) {
      const fixture = buildAllFixtures().find((f) => f.id === fixtureId);
      if (!fixture) continue;
      const r = await measureSingleEngine(laneId, preset, fixture, clock);
      results.push(r);
    }
  }

  // 동일 프리셋·동일 레인 중복 제거(첫 번째 측정 사용)
  const deduped = new Map<string, CspMeasureResult>();
  for (const r of results) {
    if (!deduped.has(r.laneId)) deduped.set(r.laneId, r);
  }
  const uniqueResults = Array.from(deduped.values());

  // CSP 종합 스코어 기준 달성 레인(내림차순)
  const cspQualifiedLanes = uniqueResults
    .filter((r) => r.overallScore !== null && r.overallScore >= 0.8 && r.unavailableReason === null)
    .sort((a, b) => (b.overallScore ?? -1) - (a.overallScore ?? -1))
    .map((r) => r.laneId);

  // 추천 레인: CSP 종합 스코어 상위
  const recommendedLane =
    uniqueResults
      .filter((r) => r.overallScore !== null && r.unavailableReason === null)
      .sort((a, b) => (b.overallScore ?? -1) - (a.overallScore ?? -1))[0]?.laneId ?? null;

  const recommendationReasonKo =
    recommendedLane
      ? `${recommendedLane} 레인이 ${preset.name}(${preset.family})에 가장 적합합니다(CSP 기준선 비교).`
      : null;

  return {
    presetId: preset.id,
    presetName: preset.name,
    family: preset.family,
    description: preset.description,
    results: uniqueResults,
    cspQualifiedLanes,
    recommendedLane,
    recommendationReasonKo,
  };
}

/** 전체 브러시 엔진 CSP 비교 측정 실행. */
async function runFullCspComparison(clock?: Clock): Promise<CspComparisonReport> {
  const comparisons: CspBrushComparison[] = [];

  for (const presetInput of PRESET_CATALOG) {
    const preset = normalizeProgram(presetInput);
    const comparison = await measureSingleBrush(preset, clock ?? { now: () => Date.now() });
    comparisons.push(comparison);
  }

  const familyRecommendations: Record<BrushFamily, CspFamilyRecommendation> = {} as Record<
    BrushFamily,
    CspFamilyRecommendation
  >;

  const familyMap = new Map<string, CspBrushComparison[]>();
  for (const c of comparisons) {
    const existing = familyMap.get(c.family) ?? [];
    existing.push(c);
    familyMap.set(c.family, existing);
  }

  for (const [family, comps] of familyMap) {
    const allScores = comps.flatMap((c) =>
      c.results.filter((r) => r.overallScore !== null && r.unavailableReason === null).map((r) => r.overallScore!),
    );
    const avgOverallScore = allScores.length > 0 ? allScores.reduce((s, v) => s + v, 0) / allScores.length : null;

    const bestLane = comps
      .filter((c) => c.recommendedLane !== null)
      .sort(
        (a, b) =>
          (a.cspQualifiedLanes.length > 0 ? 1 : 0) -
          (b.cspQualifiedLanes.length > 0 ? 1 : 0) ||
          (b.recommendedLane ? 1 : 0) - (a.recommendedLane ? 1 : 0),
      )[0];

    const laneDesc = bestLane?.recommendedLane ? laneById(bestLane.recommendedLane) : null;

    familyRecommendations[family as BrushFamily] = {
      family: family as BrushFamily,
      presetCount: comps.length,
      recommendedLane: bestLane?.recommendedLane ?? null,
      laneName: laneDesc?.label ?? "없음",
      avgOverallScore,
      alternatives: comps
        .filter((c) => c.recommendedLane !== bestLane?.recommendedLane && c.recommendedLane !== null)
        .slice(0, 2)
        .map((c) => ({
          laneId: c.recommendedLane!,
          avgOverallScore:
            c.results
              .filter((r) => r.overallScore !== null)
              .map((r) => r.overallScore!)
              .reduce((s, v) => s + v, 0) /
            c.results.filter((r) => r.overallScore !== null).length,
        })),
    };
  }

  const totalMeasurements = comparisons.reduce((s, c) => s + c.results.length, 0);
  const successfulMeasurements = comparisons.reduce(
    (s, c) => s + c.results.filter((r) => r.unavailableReason === null).length,
    0,
  );
  const cspQualifiedMeasurements = comparisons.reduce(
    (s, c) => s + c.cspQualifiedLanes.length,
    0,
  );

  const laneWinCounts: Record<string, number> = {};
  for (const c of comparisons) {
    if (c.recommendedLane) {
      laneWinCounts[c.recommendedLane] = (laneWinCounts[c.recommendedLane] ?? 0) + 1;
    }
  }

  const topOverallLanes = Object.entries(laneWinCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([laneId, wins]) => ({ laneId: laneId as LaneId, wins }));

  return {
    generatedAt: new Date().toISOString(),
    environment: {
      nodeVersion: typeof process !== "undefined" ? process.version : "browser",
      platform: typeof process !== "undefined" ? process.platform : "unknown",
      arch: typeof process !== "undefined" ? process.arch : "unknown",
      cpuCount: typeof navigator !== "undefined" ? navigator.hardwareConcurrency ?? 1 : 1,
    },
    comparisons,
    familyRecommendations,
    summary: {
      totalPresets: comparisons.length,
      totalLanes: LANE_REGISTRY.length,
      totalMeasurements,
      successfulMeasurements,
      cspQualifiedMeasurements,
      cspQualifiedRate: totalMeasurements > 0 ? (cspQualifiedMeasurements / totalMeasurements) * 100 : 0,
      topOverallLanes,
    },
  };
}

export { runFullCspComparison };
