/**
 * Wave 138 — 절단선 위반 평가, 플랫폼 용량 예산 품질 계단(`92 → 88 → 84 → 78`) 자동 조정 및 최종 계획 조립기.
 */

import {
  clampFinite,
  estimateSliceEncodedBytes,
  type NormalizedManuscriptForPlatform,
  type PlatformSliceBudgetSummary,
  type PlatformSlicePlan,
  type PlatformSlicePreset,
  type ProtectedSpanKind,
  type ScaledProtectedSpan,
  type SliceAuditGrade,
  type SliceCutViolation,
  type SliceImageFormat,
  type SlicePlanItem,
  type SliceStrategy,
} from "./platform-slice-types";

export function isCriticalSpanKind(kind: ProtectedSpanKind): boolean {
  return kind === "character-face" || kind === "dialogue-balloon" || kind === "sfx-lettering";
}

function padSliceIndex(indexOneBased: number): string {
  const raw = String(indexOneBased);
  if (raw.length >= 3) return raw;
  if (raw.length === 2) return `0${raw}`;
  return `00${raw}`;
}

function formatExtension(format: SliceImageFormat): string {
  return format === "jpeg" ? "jpg" : format;
}

export function sampleCutRowEnergy(rowEnergy: readonly number[], y: number): number {
  const len = rowEnergy.length;
  if (len === 0) return 0.18;
  const idx = Math.max(0, Math.min(len - 1, Math.round(y)));
  return clampFinite(rowEnergy[idx], 0, 1, 0.18);
}

function buildEnergyPrefixSums(rowEnergy: readonly number[]): Float64Array {
  const prefix = new Float64Array(rowEnergy.length + 1);
  for (let i = 0; i < rowEnergy.length; i += 1) {
    prefix[i + 1] = prefix[i] + clampFinite(rowEnergy[i], 0, 1, 0.18);
  }
  return prefix;
}

function meanSliceEnergy(prefix: Float64Array, startY: number, endY: number): number {
  const s = Math.max(0, Math.min(prefix.length - 1, startY));
  const e = Math.max(s + 1, Math.min(prefix.length - 1, endY));
  return (prefix[e] - prefix[s]) / Math.max(1, e - s);
}

function isCutInsideGutterBand(y: number, spans: readonly ScaledProtectedSpan[]): boolean {
  for (let i = 0; i < spans.length; i += 1) {
    const span = spans[i];
    if (span.kind === "gutter-safe-band" && span.startY <= y && y <= span.endY) {
      return true;
    }
  }
  return false;
}

function evaluateCutViolationsAt(
  cutY: number,
  scaleRatio: number,
  spans: readonly ScaledProtectedSpan[],
): readonly SliceCutViolation[] {
  const violations: SliceCutViolation[] = [];
  const masterCutY = Math.round(cutY / Math.max(1e-6, scaleRatio));

  for (let i = 0; i < spans.length; i += 1) {
    const span = spans[i];
    if (span.kind === "gutter-safe-band") continue;
    if (span.startY < cutY && cutY < span.endY) {
      const spanH = Math.max(1, span.endY - span.startY);
      const minSide = Math.min(cutY - span.startY, span.endY - cutY);
      const penetrationRatio = clampFinite((2 * minSide) / spanH, 0, 1, 0.5);
      violations.push({
        cutY,
        masterCutY,
        spanId: span.id,
        spanKind: span.kind,
        labelKo: span.labelKo,
        penetrationRatio,
        severity: isCriticalSpanKind(span.kind) ? "critical" : "warning",
        forcedOversized: span.isOversized,
      });
    }
  }

  return violations;
}

interface MutableSliceDraft {
  readonly index: number;
  readonly fileName: string;
  readonly startY: number;
  readonly endY: number;
  readonly heightPx: number;
  readonly widthPx: number;
  readonly masterStartY: number;
  readonly masterEndY: number;
  readonly meanEnergy: number;
  readonly cutEnergyAtEnd: number;
  readonly cutInGutterBand: boolean;
  readonly format: SliceImageFormat;
  readonly forcedOversizedCut: boolean;
  readonly traversedSpanIds: readonly string[];
  ladderIdx: number;
  selectedQuality: number;
  estimatedBytes: number;
}

/**
 * 결정된 내부 절단선 시퀀스를 무손실 슬라이스 목록·품질 계단 조정·용량 예산 요약·QA 감사 판정으로 조립한다.
 */
export function finalizePlanFromCutPoints(
  normalized: NormalizedManuscriptForPlatform,
  preset: PlatformSlicePreset,
  strategy: SliceStrategy,
  internalCutsY: readonly number[],
  totalCost: number,
): PlatformSlicePlan {
  const height = normalized.scaledHeightPx;
  const energyPrefix = buildEnergyPrefixSums(normalized.normalizedRowEnergy);
  const ladder = preset.qualityLadder.length > 0 ? preset.qualityLadder : [92, 88, 84, 78];
  const ext = formatExtension(normalized.format);

  // 경계 좌표 시퀀스: [0, cut_1, cut_2, ..., scaledHeightPx]
  const boundaries: number[] = [0];
  for (let i = 0; i < internalCutsY.length; i += 1) {
    const y = Math.round(internalCutsY[i]);
    if (y > boundaries[boundaries.length - 1] && y < height) {
      boundaries.push(y);
    }
  }
  boundaries.push(height);

  const violations: SliceCutViolation[] = [];
  let gutterAlignedCutCount = 0;
  let totalCutEnergy = 0;
  let forcedOversizedCutCount = 0;
  const drafts: MutableSliceDraft[] = [];

  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const startY = boundaries[i];
    const endY = boundaries[i + 1];
    const isInternalEnd = endY < height;
    const cutViolations = isInternalEnd
      ? evaluateCutViolationsAt(endY, normalized.scaleRatio, normalized.scaledSpans)
      : [];

    let forcedOversizedHere = false;
    for (let v = 0; v < cutViolations.length; v += 1) {
      violations.push(cutViolations[v]);
      if (cutViolations[v].forcedOversized) forcedOversizedHere = true;
    }
    if (forcedOversizedHere) forcedOversizedCutCount += 1;

    const cutEnergy = isInternalEnd ? sampleCutRowEnergy(normalized.normalizedRowEnergy, endY) : 0;
    if (isInternalEnd) totalCutEnergy += cutEnergy;
    const inGutter = isInternalEnd && isCutInsideGutterBand(endY, normalized.scaledSpans);
    if (inGutter) gutterAlignedCutCount += 1;

    const traversedSpanIds: string[] = [];
    for (let s = 0; s < normalized.scaledSpans.length; s += 1) {
      const sp = normalized.scaledSpans[s];
      if (sp.kind !== "gutter-safe-band" && sp.endY > startY && sp.startY < endY) {
        traversedSpanIds.push(sp.id);
      }
    }

    const sliceMeanEnergy = meanSliceEnergy(energyPrefix, startY, endY);
    const initialQuality = ladder[0];
    const initialBytes = estimateSliceEncodedBytes(
      normalized.scaledWidthPx,
      endY - startY,
      sliceMeanEnergy,
      normalized.format,
      initialQuality,
      normalized.averageColorComplexity,
    );

    const draft: MutableSliceDraft = {
      index: i,
      fileName: `${preset.filePrefix}_${normalized.episodeId}_slice_${padSliceIndex(i + 1)}.${ext}`,
      startY,
      endY,
      heightPx: endY - startY,
      widthPx: normalized.scaledWidthPx,
      masterStartY: Math.round(startY / Math.max(1e-6, normalized.scaleRatio)),
      masterEndY:
        endY === height
          ? normalized.masterHeightPx
          : Math.round(endY / Math.max(1e-6, normalized.scaleRatio)),
      meanEnergy: sliceMeanEnergy,
      cutEnergyAtEnd: cutEnergy,
      cutInGutterBand: inGutter,
      format: normalized.format,
      forcedOversizedCut: forcedOversizedHere,
      traversedSpanIds,
      ladderIdx: 0,
      selectedQuality: initialQuality,
      estimatedBytes: initialBytes,
    };

    // 1단계: 슬라이스당 최대 바이트 상한 초과 시 품질 계단 하향 조정.
    while (draft.estimatedBytes > preset.maxBytesPerSlice && draft.ladderIdx + 1 < ladder.length) {
      draft.ladderIdx += 1;
      draft.selectedQuality = ladder[draft.ladderIdx];
      draft.estimatedBytes = estimateSliceEncodedBytes(
        draft.widthPx,
        draft.heightPx,
        draft.meanEnergy,
        draft.format,
        draft.selectedQuality,
        normalized.averageColorComplexity,
      );
    }

    drafts.push(draft);
  }

  // 2단계: 회차 전체 용량 예산 초과 시 가장 용량이 큰 슬라이스부터 품질 계단 단계적 하향.
  let totalEstimatedBytes = drafts.reduce((acc, item) => acc + item.estimatedBytes, 0);
  while (totalEstimatedBytes > preset.maxTotalEpisodeBytes) {
    let heaviestIdx = -1;
    let heaviestBytes = -1;
    for (let i = 0; i < drafts.length; i += 1) {
      if (drafts[i].ladderIdx + 1 < ladder.length && drafts[i].estimatedBytes > heaviestBytes) {
        heaviestBytes = drafts[i].estimatedBytes;
        heaviestIdx = i;
      }
    }
    if (heaviestIdx < 0) break;

    const target = drafts[heaviestIdx];
    const prevBytes = target.estimatedBytes;
    target.ladderIdx += 1;
    target.selectedQuality = ladder[target.ladderIdx];
    target.estimatedBytes = estimateSliceEncodedBytes(
      target.widthPx,
      target.heightPx,
      target.meanEnergy,
      target.format,
      target.selectedQuality,
      normalized.averageColorComplexity,
    );
    totalEstimatedBytes += target.estimatedBytes - prevBytes;
  }

  const slices: SlicePlanItem[] = [];
  let maxSingleSliceBytes = 0;
  let exceedsAnySliceByteLimit = false;
  let lowestSelectedQuality = ladder[0];
  let qualityStepDownCount = 0;

  for (let i = 0; i < drafts.length; i += 1) {
    const d = drafts[i];
    const exceedsSlice = d.estimatedBytes > preset.maxBytesPerSlice;
    if (exceedsSlice) exceedsAnySliceByteLimit = true;
    if (d.estimatedBytes > maxSingleSliceBytes) maxSingleSliceBytes = d.estimatedBytes;
    if (d.selectedQuality < lowestSelectedQuality) lowestSelectedQuality = d.selectedQuality;
    if (d.ladderIdx > 0) qualityStepDownCount += 1;

    slices.push({
      index: d.index,
      fileName: d.fileName,
      startY: d.startY,
      endY: d.endY,
      heightPx: d.heightPx,
      widthPx: d.widthPx,
      masterStartY: d.masterStartY,
      masterEndY: d.masterEndY,
      cutEnergyAtEnd: d.cutEnergyAtEnd,
      cutInGutterBand: d.cutInGutterBand,
      format: d.format,
      selectedQuality: d.selectedQuality,
      estimatedBytes: d.estimatedBytes,
      qualitySteppedDown: d.ladderIdx > 0,
      exceedsSliceByteLimit: exceedsSlice,
      forcedOversizedCut: d.forcedOversizedCut,
      traversedSpanIds: d.traversedSpanIds,
    });
  }

  const exceedsTotalByteLimit = totalEstimatedBytes > preset.maxTotalEpisodeBytes;
  const exceedsSliceCountLimit = slices.length > preset.maxSliceCount;
  const budgetWarningsKo: string[] = [];

  if (exceedsAnySliceByteLimit) {
    budgetWarningsKo.push(
      `일부 슬라이스가 최저 품질(Q${String(lowestSelectedQuality)})에서도 파일당 용량 상한(${(preset.maxBytesPerSlice / (1024 * 1024)).toFixed(2)}MB)을 넘깁니다.`,
    );
  }
  if (exceedsTotalByteLimit) {
    budgetWarningsKo.push(
      `회차 총 예상 용량(${(totalEstimatedBytes / (1024 * 1024)).toFixed(2)}MB)이 ${preset.nameKo} 상한(${(preset.maxTotalEpisodeBytes / (1024 * 1024)).toFixed(2)}MB)을 초과합니다.`,
    );
  }
  if (exceedsSliceCountLimit) {
    budgetWarningsKo.push(
      `분할 파일 수(${String(slices.length)}장)가 ${preset.nameKo} 허용 상한(${String(preset.maxSliceCount)}장)을 넘깁니다.`,
    );
  }
  if (qualityStepDownCount > 0 && !exceedsAnySliceByteLimit && !exceedsTotalByteLimit) {
    budgetWarningsKo.push(
      `용량 상한을 맞추기 위해 ${String(qualityStepDownCount)}개 슬라이스의 압축 품질을 자동 조정했습니다(최저 Q${String(lowestSelectedQuality)}).`,
    );
  }

  const budget: PlatformSliceBudgetSummary = {
    totalSlices: slices.length,
    maxSliceCount: preset.maxSliceCount,
    exceedsSliceCountLimit,
    totalEstimatedBytes,
    maxTotalEpisodeBytes: preset.maxTotalEpisodeBytes,
    totalBudgetUtilizationRatio: totalEstimatedBytes / Math.max(1, preset.maxTotalEpisodeBytes),
    exceedsTotalByteLimit,
    maxSingleSliceBytes,
    maxBytesPerSlice: preset.maxBytesPerSlice,
    exceedsAnySliceByteLimit,
    lowestSelectedQuality,
    qualityStepDownCount,
    budgetWarningsKo,
  };

  let criticalCutCount = 0;
  let avoidableCriticalCutCount = 0;
  let faceCutCount = 0;
  let balloonCutCount = 0;
  let sfxCutCount = 0;
  let panelSeamCutCount = 0;

  for (let i = 0; i < violations.length; i += 1) {
    const v = violations[i];
    if (v.severity === "critical") {
      criticalCutCount += 1;
      if (!v.forcedOversized) avoidableCriticalCutCount += 1;
    }
    if (v.spanKind === "character-face") faceCutCount += 1;
    else if (v.spanKind === "dialogue-balloon") balloonCutCount += 1;
    else if (v.spanKind === "sfx-lettering") sfxCutCount += 1;
    else if (v.spanKind === "panel-border-seam") panelSeamCutCount += 1;
  }

  const warningsKo: string[] = [...budgetWarningsKo];
  if (avoidableCriticalCutCount > 0) {
    warningsKo.push(
      `얼굴·말풍선·효과음 치명 절단 ${String(avoidableCriticalCutCount)}건이 감지되었습니다(얼굴 ${String(faceCutCount)} · 말풍선 ${String(balloonCutCount)} · 효과음 ${String(sfxCutCount)}).`,
    );
  }
  if (forcedOversizedCutCount > 0) {
    warningsKo.push(
      `플랫폼 최대 슬라이스 높이(${String(preset.maxSliceHeightPx)}px)를 넘는 초대형 스플래시 영역에서 저에너지 행 기준 불가피한 절단 ${String(forcedOversizedCutCount)}건을 수행했습니다.`,
    );
  }
  if (panelSeamCutCount > 0) {
    warningsKo.push(
      `컷 테두리 경계선 관통 절단 ${String(panelSeamCutCount)}건이 있어 출고 전 확인을 권장합니다.`,
    );
  }

  let auditGrade: SliceAuditGrade = "PASS";
  if (
    avoidableCriticalCutCount > 0 ||
    exceedsAnySliceByteLimit ||
    exceedsTotalByteLimit ||
    exceedsSliceCountLimit
  ) {
    auditGrade = "FAIL";
  } else if (forcedOversizedCutCount > 0 || qualityStepDownCount > 0 || panelSeamCutCount > 0) {
    auditGrade = "WARN";
  }

  return {
    platformId: preset.id,
    preset,
    episodeId: normalized.episodeId,
    episodeTitleKo: normalized.episodeTitleKo,
    strategy,
    masterWidthPx: normalized.masterWidthPx,
    masterHeightPx: normalized.masterHeightPx,
    scaleRatio: normalized.scaleRatio,
    scaledWidthPx: normalized.scaledWidthPx,
    scaledHeightPx: normalized.scaledHeightPx,
    slices,
    cutPositionsY: boundaries.slice(1, boundaries.length - 1),
    scaledProtectedSpans: normalized.scaledSpans,
    normalizedRowEnergy: normalized.normalizedRowEnergy,
    violations,
    criticalCutCount,
    avoidableCriticalCutCount,
    faceCutCount,
    balloonCutCount,
    sfxCutCount,
    panelSeamCutCount,
    gutterAlignedCutCount,
    forcedOversizedCutCount,
    totalCutEnergy,
    totalCost,
    budget,
    auditGrade,
    warningsKo,
  };
}
