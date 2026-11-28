/**
 * Wave 138 — 동적 계획법(DP) 최적 절단선 솔버, 단순 고정 높이 분할 비교기 및 멀티 플랫폼 일괄 컴파일러.
 *
 * - 1px 누락·중복 없는 단조 연속 무손실 분할(`slice[0].startY === 0`, `slice[i].endY === slice[i+1].startY`,
 *   `last.endY === scaledHeightPx`, 모든 슬라이스 높이 `<= maxSliceHeightPx`)을 수학적으로 보장한다.
 * - 캐릭터 얼굴·대사 말풍선·효과음 관통 절단에는 초대형 페널티를, 여백 안전대 중앙에는 보너스를 부여해
 *   피할 수 있는 치명 절단을 0건으로 차단한다.
 * - 단일 보호 영역이 플랫폼 최대 높이를 초과하는 초대형 스플래시 예외에서는 최저 시각 에너지 행을 선택하고
 *   명시적 경고와 함께 분할을 완수한다.
 */

import {
  PLATFORM_SLICE_PRESET_IDS,
  clampFinite,
  getPlatformSlicePreset,
  normalizeManuscriptForPlatform,
  type MultiPlatformSliceBundle,
  type NaiveVsSmartSliceComparison,
  type NormalizedManuscriptForPlatform,
  type PlatformSlicePlan,
  type PlatformSlicePreset,
  type PlatformSlicePresetId,
  type ProtectedSpanKind,
  type ScaledProtectedSpan,
  type SliceAuditGrade,
  type SliceImageFormat,
  type VerticalManuscriptInput,
} from "./platform-slice-types";
import { canonicalJsonStringify, sha256HexSync } from "./sha256-slice-manifest";
import { finalizePlanFromCutPoints, sampleCutRowEnergy } from "./slice-budget-and-audit";

export interface SmartSliceSolverOptions {
  /** 허용 포맷 내에서 플랫폼별 출력 포맷 강제 지정(선택). */
  readonly formatOverride?: SliceImageFormat;
}

export interface MultiPlatformBundleOptions {
  /** 컴파일할 플랫폼 목록(생략 시 5종 전체). */
  readonly platformIds?: readonly PlatformSlicePresetId[];
  /** 플랫폼별 출력 포맷 오버라이드(선택). */
  readonly formatOverrides?: Readonly<Partial<Record<PlatformSlicePresetId, SliceImageFormat>>>;
  /** 테스트·특수 출고 계약용 플랫폼 프리셋 부분 오버라이드(선택). */
  readonly presetOverrides?: Readonly<
    Partial<Record<PlatformSlicePresetId, Partial<PlatformSlicePreset>>>
  >;
  /** 매니페스트 및 QA 브리프에 기록할 ISO 날짜/시각(선택). */
  readonly generatedAtIso?: string;
}

const PENALTY_BY_SPAN_KIND: Readonly<Record<ProtectedSpanKind, number>> = {
  "character-face": 1_000_000,
  "dialogue-balloon": 900_000,
  "sfx-lettering": 350_000,
  "panel-border-seam": 14_000,
  "gutter-safe-band": 0,
};

const EDGE_HUG_PENALTY_BY_KIND: Readonly<Record<ProtectedSpanKind, number>> = {
  "character-face": 3.5,
  "dialogue-balloon": 3.0,
  "sfx-lettering": 1.8,
  "panel-border-seam": 0.8,
  "gutter-safe-band": 0,
};

function resolvePreset(
  platformOrPreset: PlatformSlicePresetId | PlatformSlicePreset,
): PlatformSlicePreset {
  return typeof platformOrPreset === "string"
    ? getPlatformSlicePreset(platformOrPreset)
    : platformOrPreset;
}

function evaluateCutPointCost(
  y: number,
  scaledHeightPx: number,
  spans: readonly ScaledProtectedSpan[],
  rowEnergy: readonly number[],
): number {
  if (y <= 0 || y >= scaledHeightPx) return 0;

  const energy = sampleCutRowEnergy(rowEnergy, y);
  let cost = energy * 60;
  let bestGutterBonus = 0;

  for (let i = 0; i < spans.length; i += 1) {
    const span = spans[i];
    if (span.kind === "gutter-safe-band") {
      if (span.startY <= y && y <= span.endY) {
        const center = (span.startY + span.endY) * 0.5;
        const halfW = Math.max(1, (span.endY - span.startY) * 0.5);
        const centerProximity = 1 - Math.min(1, Math.abs(y - center) / halfW);
        const bonus = 36 + 24 * centerProximity;
        if (bonus > bestGutterBonus) bestGutterBonus = bonus;
      }
      continue;
    }

    if (span.startY < y && y < span.endY) {
      const basePenalty = PENALTY_BY_SPAN_KIND[span.kind];
      const priorityWeight = 0.7 + 0.15 * span.priority;
      const spanH = Math.max(1, span.endY - span.startY);
      const penetrationRatio = (2 * Math.min(y - span.startY, span.endY - y)) / spanH;

      if (span.isOversized) {
        // 초대형 보호 영역 내부의 불가피한 절단: 절단 횟수를 최소화하면서 최저 시각 에너지 행을 선택한다.
        cost += basePenalty * priorityWeight + energy * 40_000 + 250 * penetrationRatio;
      } else {
        cost += basePenalty * priorityWeight * (0.55 + 0.45 * penetrationRatio);
      }
    } else if (y === span.startY || y === span.endY) {
      cost += EDGE_HUG_PENALTY_BY_KIND[span.kind];
    }
  }

  return cost - bestGutterBonus;
}

function evaluateSliceHeightCost(
  heightPx: number,
  isSingleFullSlice: boolean,
  preset: PlatformSlicePreset,
): number {
  if (isSingleFullSlice) return 0;

  const maxH = Math.max(1, preset.maxSliceHeightPx);
  const minH = Math.max(1, Math.min(preset.minSliceHeightPx, maxH));
  const prefH = clampFinite(preset.preferredSliceHeightPx, minH, maxH, Math.round(maxH * 0.8));

  let cost = 28.0;
  if (heightPx < minH) {
    const deficit = (minH - heightPx) / Math.max(1, minH);
    cost += 220 + 1800 * deficit * deficit;
  }

  const dev = (heightPx - prefH) / maxH;
  cost += 18 * dev * dev;
  return cost;
}

function addCandidate(set: Set<number>, y: number, height: number): void {
  const clamped = Math.round(y);
  if (clamped >= 0 && clamped <= height) set.add(clamped);
}

function findLowestEnergyRowInWindow(
  rowEnergy: readonly number[],
  winStart: number,
  winEnd: number,
): number {
  let bestY = Math.round((winStart + winEnd) * 0.5);
  let bestEnergy = Number.POSITIVE_INFINITY;
  const center = (winStart + winEnd) * 0.5;

  for (let y = winStart; y <= winEnd; y += 1) {
    const e = sampleCutRowEnergy(rowEnergy, y);
    if (
      e < bestEnergy - 1e-9 ||
      (Math.abs(e - bestEnergy) <= 1e-9 && Math.abs(y - center) < Math.abs(bestY - center))
    ) {
      bestEnergy = e;
      bestY = y;
    }
  }
  return bestY;
}

function buildSmartCandidateCutPositions(
  normalized: NormalizedManuscriptForPlatform,
  preset: PlatformSlicePreset,
): readonly number[] {
  const height = normalized.scaledHeightPx;
  const maxH = Math.max(1, Math.round(preset.maxSliceHeightPx));

  // 소규모 테스트/단편 원고는 전 픽셀 정확 DP로 탐색한다.
  if (height <= 600) {
    const all: number[] = [];
    for (let y = 0; y <= height; y += 1) all.push(y);
    return all;
  }

  const candidates = new Set<number>();
  candidates.add(0);
  candidates.add(height);

  // 연속 후보 간격을 maxH 이하로 보장하는 규칙 격자 앵커.
  const stride = Math.max(1, Math.min(16, Math.floor(maxH / 8)));
  for (let y = stride; y < height; y += stride) candidates.add(y);

  // 보호 영역 경계 및 여백 안전대 핵심 분할 지점.
  for (let i = 0; i < normalized.scaledSpans.length; i += 1) {
    const span = normalized.scaledSpans[i];
    addCandidate(candidates, span.startY, height);
    addCandidate(candidates, span.endY, height);
    addCandidate(candidates, span.startY - 1, height);
    addCandidate(candidates, span.endY + 1, height);

    if (span.kind === "gutter-safe-band") {
      const spanH = span.endY - span.startY;
      addCandidate(candidates, span.startY + spanH * 0.25, height);
      addCandidate(candidates, span.startY + spanH * 0.5, height);
      addCandidate(candidates, span.startY + spanH * 0.75, height);
      if (span.endY - 1 >= span.startY + 1) {
        addCandidate(
          candidates,
          findLowestEnergyRowInWindow(normalized.normalizedRowEnergy, span.startY, span.endY),
          height,
        );
      }
    } else if (span.isOversized) {
      // 초대형 스플래시 내부는 촘촘한 구간별 최저 에너지 행을 후보에 등록한다.
      const fineWin = Math.max(2, Math.min(16, Math.floor(maxH / 16)));
      for (let wStart = span.startY + 1; wStart < span.endY; wStart += fineWin) {
        const wEnd = Math.min(span.endY - 1, wStart + fineWin - 1);
        if (wStart <= wEnd) {
          addCandidate(
            candidates,
            findLowestEnergyRowInWindow(normalized.normalizedRowEnergy, wStart, wEnd),
            height,
          );
        }
      }
    }
  }

  // 전체 세로 스트립의 구간별 최저 시각 에너지 극소점 추가.
  const energyWin = Math.max(4, Math.min(32, Math.floor(maxH / 6)));
  for (let wStart = 1; wStart < height; wStart += energyWin) {
    const wEnd = Math.min(height - 1, wStart + energyWin - 1);
    if (wStart <= wEnd) {
      addCandidate(
        candidates,
        findLowestEnergyRowInWindow(normalized.normalizedRowEnergy, wStart, wEnd),
        height,
      );
    }
  }

  return Array.from(candidates).sort((a, b) => a - b);
}

/**
 * 기준 비교용 단순 고정 높이 분할(Naive Fixed-Height Slicer) 계획을 생성한다.
 */
export function planNaiveFixedHeightSlices(
  manuscript: VerticalManuscriptInput,
  platformOrPreset: PlatformSlicePresetId | PlatformSlicePreset,
  options?: SmartSliceSolverOptions,
): PlatformSlicePlan {
  const preset = resolvePreset(platformOrPreset);
  const input: VerticalManuscriptInput =
    options?.formatOverride !== undefined
      ? { ...manuscript, formatOverride: options.formatOverride }
      : manuscript;
  const normalized = normalizeManuscriptForPlatform(input, preset);
  const maxH = Math.max(1, Math.round(preset.maxSliceHeightPx));

  const internalCuts: number[] = [];
  for (let y = maxH; y < normalized.scaledHeightPx; y += maxH) {
    internalCuts.push(y);
  }

  let totalCost = 0;
  let prev = 0;
  const allBounds = [...internalCuts, normalized.scaledHeightPx];
  for (let i = 0; i < allBounds.length; i += 1) {
    const endY = allBounds[i];
    const isSingle = prev === 0 && endY === normalized.scaledHeightPx;
    totalCost += evaluateSliceHeightCost(endY - prev, isSingle, preset);
    if (endY < normalized.scaledHeightPx) {
      totalCost += evaluateCutPointCost(
        endY,
        normalized.scaledHeightPx,
        normalized.scaledSpans,
        normalized.normalizedRowEnergy,
      );
    }
    prev = endY;
  }

  return finalizePlanFromCutPoints(normalized, preset, "naive-fixed", internalCuts, totalCost);
}

/**
 * 동적 계획법(DP)으로 얼굴·말풍선·효과음 절단을 차단하고 최저 시각 에너지·여백 중앙을 선택하는
 * 최적 세로 슬라이스 출고 계획을 컴파일한다.
 */
export function compileSmartPlatformSlices(
  manuscript: VerticalManuscriptInput,
  platformOrPreset: PlatformSlicePresetId | PlatformSlicePreset,
  options?: SmartSliceSolverOptions,
): PlatformSlicePlan {
  const preset = resolvePreset(platformOrPreset);
  const input: VerticalManuscriptInput =
    options?.formatOverride !== undefined
      ? { ...manuscript, formatOverride: options.formatOverride }
      : manuscript;
  const normalized = normalizeManuscriptForPlatform(input, preset);
  const maxH = Math.max(1, Math.round(preset.maxSliceHeightPx));
  const candidates = buildSmartCandidateCutPositions(normalized, preset);
  const count = candidates.length;

  const cutCosts = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    cutCosts[i] = evaluateCutPointCost(
      candidates[i],
      normalized.scaledHeightPx,
      normalized.scaledSpans,
      normalized.normalizedRowEnergy,
    );
  }

  const dp = new Float64Array(count);
  const parent = new Int32Array(count);
  dp.fill(Number.POSITIVE_INFINITY);
  parent.fill(-1);
  dp[0] = 0;

  let leftWindow = 0;
  for (let j = 1; j < count; j += 1) {
    const endY = candidates[j];
    while (leftWindow < j && endY - candidates[leftWindow] > maxH) {
      leftWindow += 1;
    }

    let bestCost = Number.POSITIVE_INFINITY;
    let bestPrev = -1;
    const endCutCost = cutCosts[j];

    for (let i = leftWindow; i < j; i += 1) {
      const prevCost = dp[i];
      if (!Number.isFinite(prevCost)) continue;
      const startY = candidates[i];
      const sliceH = endY - startY;
      const isSingle = startY === 0 && endY === normalized.scaledHeightPx;
      const candidateCost = prevCost + evaluateSliceHeightCost(sliceH, isSingle, preset) + endCutCost;

      if (candidateCost < bestCost - 1e-9) {
        bestCost = candidateCost;
        bestPrev = i;
      }
    }

    dp[j] = bestCost;
    parent[j] = bestPrev;
  }

  // 역추적으로 최적 절단선 복원.
  const reversedInternalCuts: number[] = [];
  let cursor = count - 1;
  while (cursor > 0) {
    const prevIdx = parent[cursor];
    if (prevIdx < 0) {
      return planNaiveFixedHeightSlices(input, preset, options);
    }
    if (prevIdx > 0) reversedInternalCuts.push(candidates[prevIdx]);
    cursor = prevIdx;
  }

  reversedInternalCuts.reverse();
  return finalizePlanFromCutPoints(
    normalized,
    preset,
    "dp-smart",
    reversedInternalCuts,
    dp[count - 1],
  );
}

/**
 * 단순 고정 높이 분할과 DP 스마트 리패킹 결과를 동일 플랫폼 규격에서 정량 비교한다.
 */
export function compareNaiveVsSmartSlices(
  manuscript: VerticalManuscriptInput,
  platformOrPreset: PlatformSlicePresetId | PlatformSlicePreset,
  options?: SmartSliceSolverOptions,
): NaiveVsSmartSliceComparison {
  const preset = resolvePreset(platformOrPreset);
  const naive = planNaiveFixedHeightSlices(manuscript, preset, options);
  const smart = compileSmartPlatformSlices(manuscript, preset, options);

  const preventedCriticalCuts = naive.criticalCutCount - smart.criticalCutCount;
  const preventedFaceCuts = naive.faceCutCount - smart.faceCutCount;
  const preventedBalloonCuts = naive.balloonCutCount - smart.balloonCutCount;
  const preventedSfxCuts = naive.sfxCutCount - smart.sfxCutCount;
  const cutEnergyReductionRatio =
    naive.totalCutEnergy > 1e-6
      ? (naive.totalCutEnergy - smart.totalCutEnergy) / naive.totalCutEnergy
      : 0;
  const gutterAlignmentGainCount = smart.gutterAlignedCutCount - naive.gutterAlignedCutCount;
  const improvedZeroCriticalCuts = naive.criticalCutCount > 0 && smart.criticalCutCount === 0;

  let summaryKo: string;
  if (improvedZeroCriticalCuts) {
    summaryKo = `${preset.nameKo}(${String(preset.targetWidthPx)}×${String(preset.maxSliceHeightPx)}px): 고정 분할 시 발생하던 치명 절단 ${String(naive.criticalCutCount)}건(얼굴 ${String(naive.faceCutCount)} · 말풍선 ${String(naive.balloonCutCount)} · 효과음 ${String(naive.sfxCutCount)})을 DP 탐색으로 0건까지 차단했습니다.`;
  } else if (preventedCriticalCuts > 0) {
    summaryKo = `${preset.nameKo}(${String(preset.targetWidthPx)}×${String(preset.maxSliceHeightPx)}px): 치명 절단을 ${String(naive.criticalCutCount)}건에서 ${String(smart.criticalCutCount)}건으로 ${String(preventedCriticalCuts)}건 줄였습니다.`;
  } else if (smart.criticalCutCount === 0) {
    summaryKo = `${preset.nameKo}(${String(preset.targetWidthPx)}×${String(preset.maxSliceHeightPx)}px): 얼굴·말풍선 절단 0건을 유지하며 여백 정렬 절단 ${String(smart.gutterAlignedCutCount)}곳을 확보했습니다.`;
  } else {
    summaryKo = `${preset.nameKo}(${String(preset.targetWidthPx)}×${String(preset.maxSliceHeightPx)}px): 초대형 보호 영역 제약으로 불가피한 절단 ${String(smart.forcedOversizedCutCount)}건을 최저 에너지 행으로 유도했습니다.`;
  }

  return {
    platformId: preset.id,
    preset,
    naive,
    smart,
    preventedCriticalCuts,
    preventedFaceCuts,
    preventedBalloonCuts,
    preventedSfxCuts,
    cutEnergyReductionRatio,
    gutterAlignmentGainCount,
    improvedZeroCriticalCuts,
    summaryKo,
  };
}

/**
 * 단일 웹툰 마스터 원고를 다중 플랫폼 규격에 맞춰 일괄 컴파일하고 FIPS 180-4 SHA-256 매니페스트를 생성한다.
 */
export function compileMultiPlatformSliceBundle(
  manuscript: VerticalManuscriptInput,
  options?: MultiPlatformBundleOptions,
): MultiPlatformSliceBundle {
  const requestedIds =
    options?.platformIds !== undefined && options.platformIds.length > 0
      ? options.platformIds
      : PLATFORM_SLICE_PRESET_IDS;

  const platformIds: PlatformSlicePresetId[] = [];
  for (let i = 0; i < requestedIds.length; i += 1) {
    if (platformIds.indexOf(requestedIds[i]) < 0) platformIds.push(requestedIds[i]);
  }

  const plansByPlatform: Partial<Record<PlatformSlicePresetId, PlatformSlicePlan>> = {};
  const comparisonsByPlatform: Partial<
    Record<PlatformSlicePresetId, NaiveVsSmartSliceComparison>
  > = {};

  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;
  let totalNaiveCriticalCuts = 0;
  let totalSmartCriticalCuts = 0;
  let totalPreventedCriticalCuts = 0;
  let totalSmartSliceFiles = 0;
  let totalSmartEstimatedBytes = 0;
  const manifestPlatforms: unknown[] = [];

  for (let i = 0; i < platformIds.length; i += 1) {
    const pid = platformIds[i];
    const basePreset = getPlatformSlicePreset(pid);
    const override = options?.presetOverrides?.[pid];
    const effectivePreset: PlatformSlicePreset =
      override !== undefined ? { ...basePreset, ...override, id: pid } : basePreset;
    const formatOverride = options?.formatOverrides?.[pid];

    const comparison = compareNaiveVsSmartSlices(
      manuscript,
      effectivePreset,
      formatOverride !== undefined ? { formatOverride } : undefined,
    );

    plansByPlatform[pid] = comparison.smart;
    comparisonsByPlatform[pid] = comparison;

    if (comparison.smart.auditGrade === "PASS") passCount += 1;
    else if (comparison.smart.auditGrade === "WARN") warnCount += 1;
    else failCount += 1;

    totalNaiveCriticalCuts += comparison.naive.criticalCutCount;
    totalSmartCriticalCuts += comparison.smart.criticalCutCount;
    totalPreventedCriticalCuts += comparison.preventedCriticalCuts;
    totalSmartSliceFiles += comparison.smart.slices.length;
    totalSmartEstimatedBytes += comparison.smart.budget.totalEstimatedBytes;

    manifestPlatforms.push({
      platformId: pid,
      targetWidthPx: comparison.smart.scaledWidthPx,
      scaledHeightPx: comparison.smart.scaledHeightPx,
      maxSliceHeightPx: effectivePreset.maxSliceHeightPx,
      colorProfile: effectivePreset.colorProfile,
      auditGrade: comparison.smart.auditGrade,
      naiveCriticalCuts: comparison.naive.criticalCutCount,
      smartCriticalCuts: comparison.smart.criticalCutCount,
      totalEstimatedBytes: comparison.smart.budget.totalEstimatedBytes,
      lowestSelectedQuality: comparison.smart.budget.lowestSelectedQuality,
      slices: comparison.smart.slices.map((s) => ({
        index: s.index,
        fileName: s.fileName,
        startY: s.startY,
        endY: s.endY,
        widthPx: s.widthPx,
        heightPx: s.heightPx,
        format: s.format,
        quality: s.selectedQuality,
        estimatedBytes: s.estimatedBytes,
      })),
    });
  }

  const overallGrade: SliceAuditGrade =
    failCount > 0 ? "FAIL" : warnCount > 0 ? "WARN" : "PASS";
  const firstPlan = plansByPlatform[platformIds[0]];
  const episodeId = firstPlan !== undefined ? firstPlan.episodeId : manuscript.episodeId;
  const episodeTitleKo =
    firstPlan !== undefined ? firstPlan.episodeTitleKo : manuscript.episodeTitleKo;
  const masterWidthPx = firstPlan !== undefined ? firstPlan.masterWidthPx : manuscript.masterWidthPx;
  const masterHeightPx =
    firstPlan !== undefined ? firstPlan.masterHeightPx : manuscript.masterHeightPx;

  const manifestPayload: Record<string, unknown> = {
    schemaVersion: "toonstudio.wave138.smart-vertical-slice-manifest.v1",
    episodeId,
    episodeTitleKo,
    masterWidthPx,
    masterHeightPx,
    platformIds,
    platforms: manifestPlatforms,
  };
  if (options?.generatedAtIso !== undefined) {
    manifestPayload.generatedAtIso = options.generatedAtIso;
  }

  const manifestCanonicalJson = canonicalJsonStringify(manifestPayload);
  const manifestSha256Hex = sha256HexSync(manifestCanonicalJson);

  return {
    episodeId,
    episodeTitleKo,
    masterWidthPx,
    masterHeightPx,
    generatedAtIso: options?.generatedAtIso,
    platformIds,
    plansByPlatform,
    comparisonsByPlatform,
    aggregate: {
      totalPlatformCount: platformIds.length,
      passCount,
      warnCount,
      failCount,
      totalNaiveCriticalCuts,
      totalSmartCriticalCuts,
      totalPreventedCriticalCuts,
      totalSmartSliceFiles,
      totalSmartEstimatedBytes,
      overallGrade,
    },
    manifestCanonicalJson,
    manifestSha256Hex,
  };
}
