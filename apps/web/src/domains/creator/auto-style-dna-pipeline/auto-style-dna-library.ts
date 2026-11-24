/**
 * 완전 자동화 로컬 스타일 DNA 버전 라이브러리 · 실시간 화풍 이탈 감지 · 원클릭 자동 보정 엔진.
 *
 * 완성 컷 RGBA 버퍼를 수동 설정 없이 로컬 라이브러리에 버전 기록하고,
 * 새 컷/에피소드의 ΔE·그림자 색온도·대비·선화 굵기·스크린톤 이탈을 계측해
 * `autoHarmonizeFrameToStyleDna`로 Oklab/OKLCH 픽셀 단위 자동 보정을 수행한다.
 */

import {
  angularHueDiffDeg,
  clampStyleScalar,
  classifySwatchRole,
  computeFnv1a64Hex,
  computeOklabDeltaE100,
  estimateShadowKelvinFromHue,
  extractAutoStyleMetricsFromRgba,
  formatOklchCss,
  INK_LIGHTNESS_MAX,
  oklabToOklch,
  oklabToSrgb,
  oklchToOklab,
  roundStyle3,
  SHADOW_L_MAX,
  SHADOW_L_MIN,
  srgbToOklab,
  type AutoStyleFrameBuffer,
  type ContrastStepsProfile,
  type ExtractedFrameStyleMetrics,
  type LineworkThicknessProfile,
  type OklabColor,
  type OklchPaletteSwatch,
  type ScreentoneDensityProfile,
  type ShadowTemperatureProfile,
} from "./auto-style-dna-color-extract";

export {
  angularHueDiffDeg,
  computeOklabDeltaE100,
  createSyntheticStyleFrame,
  extractAutoStyleMetricsFromRgba,
  formatOklchCss,
  linearToSrgbByte,
  oklabToOklch,
  oklabToSrgb,
  oklchToOklab,
  srgbByteToLinear,
  srgbToOklab,
  type AutoStyleFrameBuffer,
  type ContrastStepsProfile,
  type ExtractedFrameStyleMetrics,
  type LineworkThicknessHistogram,
  type LineworkThicknessProfile,
  type OklabColor,
  type OklchColor,
  type OklchPaletteSwatch,
  type PaletteSwatchRole,
  type ScreentoneDensityProfile,
  type ScreentonePatternKind,
  type ShadowTemperatureProfile,
  type SyntheticStylePresetId,
} from "./auto-style-dna-color-extract";

export interface ArtistStyleDnaProfile {
  readonly seriesId: string;
  readonly seriesTitle: string;
  readonly artistName: string;
  readonly version: number;
  readonly sampleCount: number;
  readonly updatedAtIso: string;
  readonly dnaFingerprint: string;
  readonly linework: LineworkThicknessProfile;
  readonly dominantPalette: readonly OklchPaletteSwatch[];
  readonly shadowTemperature: ShadowTemperatureProfile;
  readonly contrast: ContrastStepsProfile;
  readonly screentone: ScreentoneDensityProfile;
}

export interface StyleDnaVersionRecord {
  readonly version: number;
  readonly sourceFrameId: string;
  readonly episodeId: string;
  readonly recordedAtIso: string;
  readonly note: string;
  readonly deltaFromPreviousE: number;
  readonly profile: ArtistStyleDnaProfile;
}

export type StyleDriftMetricKey =
  | "palette-delta-e"
  | "shadow-temperature"
  | "contrast-range"
  | "linework-thickness"
  | "screentone-density";

export type StyleDriftSeverity = "aligned" | "minor-drift" | "major-drift";

export interface StyleDriftAlert {
  readonly metric: StyleDriftMetricKey;
  readonly severity: "warn" | "critical";
  readonly measured: number;
  readonly target: number;
  readonly delta: number;
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface StyleHarmonizationRecipe {
  readonly luminanceOffset: number;
  readonly contrastGain: number;
  readonly shadowShiftA: number;
  readonly shadowShiftB: number;
  readonly palettePullStrength: number;
  readonly lineThicknessAdjust: "none" | "thicken" | "thin";
  readonly screentoneAdjust: "none" | "boost" | "dampen";
}

export interface StyleDriftReport {
  readonly seriesId: string;
  readonly dnaVersion: number;
  readonly candidateFrameId: string;
  readonly paletteDeltaE: number;
  readonly shadowHueDeltaDeg: number;
  readonly shadowDeltaE: number;
  readonly contrastRangeDelta: number;
  readonly midtoneLightnessDelta: number;
  readonly lineThicknessRatio: number;
  readonly screentoneDensityDelta: number;
  readonly consistencyScore: number;
  readonly severity: StyleDriftSeverity;
  readonly needsAutoFix: boolean;
  readonly alerts: readonly StyleDriftAlert[];
  readonly recipe: StyleHarmonizationRecipe;
  readonly candidateMetrics: ExtractedFrameStyleMetrics;
}

export interface StyleHarmonizationOptions {
  readonly strength?: number;
  readonly harmonizeLinework?: boolean;
}

export interface StyleHarmonizationResult {
  readonly harmonizedFrame: AutoStyleFrameBuffer;
  readonly beforeDrift: StyleDriftReport;
  readonly afterDrift: StyleDriftReport;
  readonly deltaEReduction: number;
  readonly shadowDeltaEReduction: number;
  readonly contrastDriftReduction: number;
  readonly scoreImprovement: number;
  readonly modifiedPixelCount: number;
  readonly appliedStrength: number;
}

export interface StyleDnaLibrarySnapshot {
  readonly formatVersion: 1;
  readonly checksumHex: string;
  readonly series: readonly {
    readonly seriesId: string;
    readonly history: readonly StyleDnaVersionRecord[];
  }[];
}

const DEFAULT_TIMESTAMP_ISO = "2026-11-24T00:00:00.000Z";

const blendNumeric = (prev: number, next: number, prevWeight: number): number =>
  roundStyle3((prev * prevWeight + next) / (prevWeight + 1));

function mergeDominantPalettes(
  prev: readonly OklchPaletteSwatch[],
  next: readonly OklchPaletteSwatch[],
  prevWeight: number,
): readonly OklchPaletteSwatch[] {
  const count = Math.min(5, Math.max(prev.length, next.length));
  const merged: OklchPaletteSwatch[] = [];
  for (let i = 0; i < count; i += 1) {
    const p = prev[i] ?? next[i];
    const n = next[i] ?? prev[i];
    if (!p || !n) continue;
    const pLab = oklchToOklab(p);
    const nLab = oklchToOklab(n);
    const lch = oklabToOklch({
      L: (pLab.L * prevWeight + nLab.L) / (prevWeight + 1),
      a: (pLab.a * prevWeight + nLab.a) / (prevWeight + 1),
      b: (pLab.b * prevWeight + nLab.b) / (prevWeight + 1),
    });
    merged.push({
      L: roundStyle3(lch.L),
      C: roundStyle3(lch.C),
      H: roundStyle3(lch.H),
      share: roundStyle3((p.share * prevWeight + n.share) / (prevWeight + 1)),
      role: classifySwatchRole(lch, i),
      cssOklch: formatOklchCss(lch),
    });
  }
  const shareSum = merged.reduce((acc, s) => acc + s.share, 0) || 1;
  return merged.map((s) => ({ ...s, share: roundStyle3(s.share / shareSum) }));
}

function computeDnaFingerprint(
  seriesId: string,
  version: number,
  m: Pick<ArtistStyleDnaProfile, "linework" | "shadowTemperature" | "contrast" | "screentone">,
): string {
  return computeFnv1a64Hex(
    [
      seriesId,
      version,
      m.linework.meanPx,
      m.shadowTemperature.meanHueDeg,
      m.shadowTemperature.meanChroma,
      m.contrast.dynamicRange,
      m.contrast.p50L,
      m.screentone.coverageRatio,
    ].join("|"),
  );
}

/** 로컬 스타일 DNA 버전 관리 라이브러리 (순수 메모리 + 체크섬 JSON 스냅샷, Web Storage 미사용). */
export class LocalStyleDnaLibrary {
  private readonly histories = new Map<string, StyleDnaVersionRecord[]>();

  public ingestCompletedFrame(
    seriesId: string,
    frame: AutoStyleFrameBuffer,
    options?: {
      readonly seriesTitle?: string;
      readonly artistName?: string;
      readonly recordedAtIso?: string;
      readonly note?: string;
    },
  ): StyleDnaVersionRecord {
    const metrics = extractAutoStyleMetricsFromRgba(frame);
    const existing = this.histories.get(seriesId) ?? [];
    const latest = existing[existing.length - 1];
    const nextVersion = existing.length + 1;
    const recordedAtIso = options?.recordedAtIso ?? DEFAULT_TIMESTAMP_ISO;

    let profile: ArtistStyleDnaProfile;
    let deltaFromPreviousE = 0;

    if (!latest) {
      profile = {
        seriesId,
        seriesTitle: options?.seriesTitle ?? seriesId,
        artistName: options?.artistName ?? "Atelier Creator",
        version: nextVersion,
        sampleCount: 1,
        updatedAtIso: recordedAtIso,
        dnaFingerprint: computeDnaFingerprint(seriesId, nextVersion, metrics),
        linework: metrics.linework,
        dominantPalette: metrics.dominantPalette,
        shadowTemperature: metrics.shadowTemperature,
        contrast: metrics.contrast,
        screentone: metrics.screentone,
      };
    } else {
      const prev = latest.profile;
      const w = prev.sampleCount;
      deltaFromPreviousE = roundStyle3(
        computeOklabDeltaE100(
          { L: prev.shadowTemperature.meanLightness, a: prev.shadowTemperature.meanA, b: prev.shadowTemperature.meanB },
          { L: metrics.shadowTemperature.meanLightness, a: metrics.shadowTemperature.meanA, b: metrics.shadowTemperature.meanB },
        ),
      );
      const mergedShadowA = blendNumeric(prev.shadowTemperature.meanA, metrics.shadowTemperature.meanA, w);
      const mergedShadowB = blendNumeric(prev.shadowTemperature.meanB, metrics.shadowTemperature.meanB, w);
      const mergedShadowL = blendNumeric(prev.shadowTemperature.meanLightness, metrics.shadowTemperature.meanLightness, w);
      const mergedShadowLch = oklabToOklch({ L: mergedShadowL, a: mergedShadowA, b: mergedShadowB });
      const mergedTemp = estimateShadowKelvinFromHue(mergedShadowLch.H, mergedShadowLch.C);

      const linework: LineworkThicknessProfile = {
        meanPx: blendNumeric(prev.linework.meanPx, metrics.linework.meanPx, w),
        medianPx: blendNumeric(prev.linework.medianPx, metrics.linework.medianPx, w),
        p10Px: blendNumeric(prev.linework.p10Px, metrics.linework.p10Px, w),
        p90Px: blendNumeric(prev.linework.p90Px, metrics.linework.p90Px, w),
        stdDevPx: blendNumeric(prev.linework.stdDevPx, metrics.linework.stdDevPx, w),
        inkCoverageRatio: blendNumeric(prev.linework.inkCoverageRatio, metrics.linework.inkCoverageRatio, w),
        taperVarianceRatio: blendNumeric(prev.linework.taperVarianceRatio, metrics.linework.taperVarianceRatio, w),
        sampledLinePixels: prev.linework.sampledLinePixels + metrics.linework.sampledLinePixels,
        histogram: {
          hairlineCount: prev.linework.histogram.hairlineCount + metrics.linework.histogram.hairlineCount,
          mediumCount: prev.linework.histogram.mediumCount + metrics.linework.histogram.mediumCount,
          boldCount: prev.linework.histogram.boldCount + metrics.linework.histogram.boldCount,
          heavyCount: prev.linework.histogram.heavyCount + metrics.linework.histogram.heavyCount,
        },
      };
      const contrast: ContrastStepsProfile = {
        p05L: blendNumeric(prev.contrast.p05L, metrics.contrast.p05L, w),
        p25L: blendNumeric(prev.contrast.p25L, metrics.contrast.p25L, w),
        p50L: blendNumeric(prev.contrast.p50L, metrics.contrast.p50L, w),
        p75L: blendNumeric(prev.contrast.p75L, metrics.contrast.p75L, w),
        p95L: blendNumeric(prev.contrast.p95L, metrics.contrast.p95L, w),
        dynamicRange: blendNumeric(prev.contrast.dynamicRange, metrics.contrast.dynamicRange, w),
        midtoneContrast: blendNumeric(prev.contrast.midtoneContrast, metrics.contrast.midtoneContrast, w),
        rmsContrast: blendNumeric(prev.contrast.rmsContrast, metrics.contrast.rmsContrast, w),
        detectedToneSteps: Math.round((prev.contrast.detectedToneSteps * w + metrics.contrast.detectedToneSteps) / (w + 1)),
      };
      const screentone: ScreentoneDensityProfile = {
        coverageRatio: blendNumeric(prev.screentone.coverageRatio, metrics.screentone.coverageRatio, w),
        meanDotDensity: blendNumeric(prev.screentone.meanDotDensity, metrics.screentone.meanDotDensity, w),
        alternatingRateX: blendNumeric(prev.screentone.alternatingRateX, metrics.screentone.alternatingRateX, w),
        alternatingRateY: blendNumeric(prev.screentone.alternatingRateY, metrics.screentone.alternatingRateY, w),
        estimatedLpiFrequency: blendNumeric(prev.screentone.estimatedLpiFrequency, metrics.screentone.estimatedLpiFrequency, w),
        patternKind: metrics.screentone.coverageRatio > prev.screentone.coverageRatio
          ? metrics.screentone.patternKind
          : prev.screentone.patternKind,
      };
      const shadowTemperature: ShadowTemperatureProfile = {
        meanLightness: roundStyle3(mergedShadowLch.L),
        meanChroma: roundStyle3(mergedShadowLch.C),
        meanHueDeg: roundStyle3(mergedShadowLch.H),
        meanA: mergedShadowA,
        meanB: mergedShadowB,
        coolWarmIndex: mergedTemp.coolWarmIndex,
        estimatedKelvin: mergedTemp.kelvin,
        highlightMeanLightness: blendNumeric(prev.shadowTemperature.highlightMeanLightness, metrics.shadowTemperature.highlightMeanLightness, w),
        highlightMeanHueDeg: blendNumeric(prev.shadowTemperature.highlightMeanHueDeg, metrics.shadowTemperature.highlightMeanHueDeg, w),
        shadowPixelRatio: blendNumeric(prev.shadowTemperature.shadowPixelRatio, metrics.shadowTemperature.shadowPixelRatio, w),
        cssOklch: formatOklchCss(mergedShadowLch),
      };

      profile = {
        seriesId,
        seriesTitle: options?.seriesTitle ?? prev.seriesTitle,
        artistName: options?.artistName ?? prev.artistName,
        version: nextVersion,
        sampleCount: prev.sampleCount + 1,
        updatedAtIso: recordedAtIso,
        dnaFingerprint: computeDnaFingerprint(seriesId, nextVersion, { linework, shadowTemperature, contrast, screentone }),
        linework,
        dominantPalette: mergeDominantPalettes(prev.dominantPalette, metrics.dominantPalette, w),
        shadowTemperature,
        contrast,
        screentone,
      };
    }

    const record: StyleDnaVersionRecord = {
      version: nextVersion,
      sourceFrameId: frame.frameId,
      episodeId: frame.episodeId ?? "ep-01",
      recordedAtIso,
      note: options?.note ?? `자동 화풍 추출 v${nextVersion} (${frame.frameId})`,
      deltaFromPreviousE,
      profile,
    };
    this.histories.set(seriesId, [...existing, record]);
    return record;
  }

  public getLatestDna(seriesId: string): ArtistStyleDnaProfile | null {
    const history = this.histories.get(seriesId);
    return history && history.length > 0 ? (history[history.length - 1]?.profile ?? null) : null;
  }

  public getVersionHistory(seriesId: string): readonly StyleDnaVersionRecord[] {
    return [...(this.histories.get(seriesId) ?? [])];
  }

  public listSeriesIds(): readonly string[] {
    return Array.from(this.histories.keys());
  }

  public rollbackToVersion(seriesId: string, targetVersion: number, recordedAtIso = DEFAULT_TIMESTAMP_ISO): StyleDnaVersionRecord | null {
    const history = this.histories.get(seriesId);
    const found = history?.find((entry) => entry.version === targetVersion);
    if (!history || !found) return null;
    const nextVersion = history.length + 1;
    const restored: ArtistStyleDnaProfile = {
      ...found.profile,
      version: nextVersion,
      updatedAtIso: recordedAtIso,
      dnaFingerprint: computeDnaFingerprint(seriesId, nextVersion, found.profile),
    };
    const record: StyleDnaVersionRecord = {
      version: nextVersion,
      sourceFrameId: found.sourceFrameId,
      episodeId: found.episodeId,
      recordedAtIso,
      note: `v${targetVersion} 스냅샷 복원 → v${nextVersion}`,
      deltaFromPreviousE: 0,
      profile: restored,
    };
    this.histories.set(seriesId, [...history, record]);
    return record;
  }

  public exportSnapshotJson(): string {
    const series = Array.from(this.histories.entries()).map(([seriesId, history]) => ({ seriesId, history: [...history] }));
    const snapshot: StyleDnaLibrarySnapshot = {
      formatVersion: 1,
      checksumHex: computeFnv1a64Hex(JSON.stringify(series)),
      series,
    };
    return JSON.stringify(snapshot);
  }

  public static fromSnapshotJson(rawJson: string): LocalStyleDnaLibrary {
    const parsed = JSON.parse(rawJson) as StyleDnaLibrarySnapshot;
    if (parsed.formatVersion !== 1 || !Array.isArray(parsed.series)) {
      throw new Error("Unsupported Style DNA snapshot format");
    }
    if (parsed.checksumHex !== computeFnv1a64Hex(JSON.stringify(parsed.series))) {
      throw new Error("Style DNA snapshot integrity checksum mismatch");
    }
    const lib = new LocalStyleDnaLibrary();
    for (const entry of parsed.series) lib.histories.set(entry.seriesId, [...entry.history]);
    return lib;
  }
}

/** 새 컷 RGBA 버퍼와 작가 스타일 DNA 간의 실시간 화풍 이탈(Drift ΔE/대비/그림자/선굵기/스크린톤)을 감지한다. */
export function detectStyleDrift(dna: ArtistStyleDnaProfile, candidate: AutoStyleFrameBuffer): StyleDriftReport {
  const cm = extractAutoStyleMetricsFromRgba(candidate);

  let weightedDe = 0;
  let weightSum = 0;
  for (const cSwatch of cm.dominantPalette) {
    const cLab = oklchToOklab(cSwatch);
    let minDe = Number.POSITIVE_INFINITY;
    for (const dSwatch of dna.dominantPalette) {
      const de = computeOklabDeltaE100(cLab, oklchToOklab(dSwatch));
      if (de < minDe) minDe = de;
    }
    if (Number.isFinite(minDe)) {
      weightedDe += minDe * cSwatch.share;
      weightSum += cSwatch.share;
    }
  }

  const paletteDeltaE = roundStyle3(weightSum > 0 ? weightedDe / weightSum : 0);
  const shadowHueDeltaDeg = roundStyle3(angularHueDiffDeg(cm.shadowTemperature.meanHueDeg, dna.shadowTemperature.meanHueDeg));
  const shadowDeltaE = roundStyle3(
    computeOklabDeltaE100(
      { L: cm.shadowTemperature.meanLightness, a: cm.shadowTemperature.meanA, b: cm.shadowTemperature.meanB },
      { L: dna.shadowTemperature.meanLightness, a: dna.shadowTemperature.meanA, b: dna.shadowTemperature.meanB },
    ),
  );
  const contrastRangeDelta = roundStyle3(Math.abs(cm.contrast.dynamicRange - dna.contrast.dynamicRange));
  const midtoneLightnessDelta = roundStyle3(Math.abs(cm.contrast.p50L - dna.contrast.p50L));
  const lineThicknessRatio = roundStyle3(cm.linework.meanPx / Math.max(0.5, dna.linework.meanPx));
  const screentoneDensityDelta = roundStyle3(Math.abs(cm.screentone.coverageRatio - dna.screentone.coverageRatio));

  const alerts: StyleDriftAlert[] = [];
  if (paletteDeltaE > 4.5) {
    alerts.push({
      metric: "palette-delta-e",
      severity: paletteDeltaE > 9 ? "critical" : "warn",
      measured: paletteDeltaE,
      target: 3.5,
      delta: roundStyle3(paletteDeltaE - 3.5),
      messageKo: `주조 OKLCH 팔레트 색차 ΔE ${paletteDeltaE.toFixed(1)} 이탈 (권장 ≤ 4.5)`,
      messageEn: `Dominant OKLCH palette drift ΔE ${paletteDeltaE.toFixed(1)} (target ≤ 4.5)`,
    });
  }
  if (shadowDeltaE > 4.0 || shadowHueDeltaDeg > 28) {
    alerts.push({
      metric: "shadow-temperature",
      severity: shadowDeltaE > 8 || shadowHueDeltaDeg > 55 ? "critical" : "warn",
      measured: cm.shadowTemperature.estimatedKelvin,
      target: dna.shadowTemperature.estimatedKelvin,
      delta: Math.round(cm.shadowTemperature.estimatedKelvin - dna.shadowTemperature.estimatedKelvin),
      messageKo: `그림자 색온도 ${cm.shadowTemperature.estimatedKelvin}K ↔ DNA ${dna.shadowTemperature.estimatedKelvin}K (각도차 ${shadowHueDeltaDeg.toFixed(0)}°)`,
      messageEn: `Shadow temperature ${cm.shadowTemperature.estimatedKelvin}K vs DNA ${dna.shadowTemperature.estimatedKelvin}K (${shadowHueDeltaDeg.toFixed(0)}° hue shift)`,
    });
  }
  if (contrastRangeDelta > 0.08 || midtoneLightnessDelta > 0.06) {
    alerts.push({
      metric: "contrast-range",
      severity: contrastRangeDelta > 0.16 ? "critical" : "warn",
      measured: cm.contrast.dynamicRange,
      target: dna.contrast.dynamicRange,
      delta: roundStyle3(cm.contrast.dynamicRange - dna.contrast.dynamicRange),
      messageKo: `명암 다이내믹 레인지 ${(cm.contrast.dynamicRange * 100).toFixed(0)}% ↔ DNA ${(dna.contrast.dynamicRange * 100).toFixed(0)}%`,
      messageEn: `Luminance contrast range ${(cm.contrast.dynamicRange * 100).toFixed(0)}% vs DNA ${(dna.contrast.dynamicRange * 100).toFixed(0)}%`,
    });
  }
  if (lineThicknessRatio < 0.78 || lineThicknessRatio > 1.28) {
    alerts.push({
      metric: "linework-thickness",
      severity: lineThicknessRatio < 0.65 || lineThicknessRatio > 1.45 ? "critical" : "warn",
      measured: cm.linework.meanPx,
      target: dna.linework.meanPx,
      delta: roundStyle3(cm.linework.meanPx - dna.linework.meanPx),
      messageKo: `선화 평균 굵기 ${cm.linework.meanPx.toFixed(2)}px ↔ DNA ${dna.linework.meanPx.toFixed(2)}px (×${lineThicknessRatio.toFixed(2)})`,
      messageEn: `Mean lineweight ${cm.linework.meanPx.toFixed(2)}px vs DNA ${dna.linework.meanPx.toFixed(2)}px (×${lineThicknessRatio.toFixed(2)})`,
    });
  }
  if (screentoneDensityDelta > 0.06) {
    alerts.push({
      metric: "screentone-density",
      severity: screentoneDensityDelta > 0.14 ? "critical" : "warn",
      measured: cm.screentone.coverageRatio,
      target: dna.screentone.coverageRatio,
      delta: roundStyle3(cm.screentone.coverageRatio - dna.screentone.coverageRatio),
      messageKo: `스크린톤 점유율 ${(cm.screentone.coverageRatio * 100).toFixed(1)}% ↔ DNA ${(dna.screentone.coverageRatio * 100).toFixed(1)}%`,
      messageEn: `Screentone coverage ${(cm.screentone.coverageRatio * 100).toFixed(1)}% vs DNA ${(dna.screentone.coverageRatio * 100).toFixed(1)}%`,
    });
  }

  const penalty =
    paletteDeltaE * 2.4 +
    shadowDeltaE * 2.2 +
    contrastRangeDelta * 95 +
    midtoneLightnessDelta * 60 +
    Math.abs(1 - lineThicknessRatio) * 18 +
    screentoneDensityDelta * 45;
  const consistencyScore = Math.round(clampStyleScalar(100 - penalty, 0, 100));
  const severity: StyleDriftSeverity =
    consistencyScore >= 82 && alerts.length === 0 ? "aligned" : consistencyScore >= 60 ? "minor-drift" : "major-drift";

  return {
    seriesId: dna.seriesId,
    dnaVersion: dna.version,
    candidateFrameId: candidate.frameId,
    paletteDeltaE,
    shadowHueDeltaDeg,
    shadowDeltaE,
    contrastRangeDelta,
    midtoneLightnessDelta,
    lineThicknessRatio,
    screentoneDensityDelta,
    consistencyScore,
    severity,
    needsAutoFix: severity !== "aligned",
    alerts,
    recipe: {
      luminanceOffset: roundStyle3(dna.contrast.p50L - cm.contrast.p50L),
      contrastGain: roundStyle3(clampStyleScalar(dna.contrast.dynamicRange / Math.max(0.08, cm.contrast.dynamicRange), 0.6, 1.85)),
      shadowShiftA: roundStyle3(dna.shadowTemperature.meanA - cm.shadowTemperature.meanA),
      shadowShiftB: roundStyle3(dna.shadowTemperature.meanB - cm.shadowTemperature.meanB),
      palettePullStrength: paletteDeltaE > 4.5 ? 0.72 : 0.35,
      lineThicknessAdjust: lineThicknessRatio < 0.78 ? "thicken" : lineThicknessRatio > 1.28 ? "thin" : "none",
      screentoneAdjust: screentoneDensityDelta <= 0.06 ? "none" : cm.screentone.coverageRatio < dna.screentone.coverageRatio ? "boost" : "dampen",
    },
    candidateMetrics: cm,
  };
}

/** 원클릭 자동 화풍 보정: RGBA 픽셀 버퍼를 Oklab/OKLCH에서 직접 보정하고 사후 드리프트를 재검증한다. */
export function autoHarmonizeFrameToStyleDna(
  dna: ArtistStyleDnaProfile,
  candidate: AutoStyleFrameBuffer,
  options?: StyleHarmonizationOptions,
): StyleHarmonizationResult {
  const beforeDrift = detectStyleDrift(dna, candidate);
  const strength = clampStyleScalar(options?.strength ?? 0.9, 0.1, 1.0);
  const { width, height, rgba } = candidate;
  const output = new Uint8ClampedArray(rgba);
  const dnaLabs: readonly OklabColor[] = dna.dominantPalette.map((s) => oklchToOklab(s));
  const candC = beforeDrift.candidateMetrics.contrast;
  const dnaC = dna.contrast;
  const candShadow = beforeDrift.candidateMetrics.shadowTemperature;
  const dnaShadow = dna.shadowTemperature;
  const lowSlope = clampStyleScalar((dnaC.p50L - dnaC.p05L) / Math.max(0.05, candC.p50L - candC.p05L), 0.55, 1.85);
  const highSlope = clampStyleScalar((dnaC.p95L - dnaC.p50L) / Math.max(0.05, candC.p95L - candC.p50L), 0.55, 1.85);
  const palettePull = clampStyleScalar(beforeDrift.recipe.palettePullStrength * strength, 0, 0.9);

  let modifiedPixelCount = 0;
  const pixelCount = width * height;
  const inkFlags = new Uint8Array(pixelCount);

  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    const r = rgba[off] ?? 0;
    const g = rgba[off + 1] ?? 0;
    const b = rgba[off + 2] ?? 0;
    if ((rgba[off + 3] ?? 0) < 128) continue;

    const lab = srgbToOklab(r, g, b);
    if (lab.L <= INK_LIGHTNESS_MAX && Math.hypot(lab.a, lab.b) <= 0.085) {
      inkFlags[i] = 1;
      continue;
    }

    // 1) 구간별 앵커(p05-p50-p95) 명암 대비 리매핑
    const mappedL = clampStyleScalar(
      lab.L <= candC.p50L
        ? dnaC.p50L + (lab.L - candC.p50L) * lowSlope
        : dnaC.p50L + (lab.L - candC.p50L) * highSlope,
      0.04,
      0.985,
    );
    let nextL = lab.L + (mappedL - lab.L) * strength;
    let nextA = lab.a;
    let nextB = lab.b;

    const inShadowBand =
      (lab.L >= SHADOW_L_MIN && lab.L <= SHADOW_L_MAX) ||
      (nextL >= SHADOW_L_MIN && nextL <= SHADOW_L_MAX);

    if (inShadowBand) {
      // 2) 그림자 대역 전용 색온도·명도 정렬 (악센트 스와치 간섭 차단)
      const targetShadowL = clampStyleScalar(dnaShadow.meanLightness + (lab.L - candShadow.meanLightness) * 0.45, SHADOW_L_MIN + 0.02, SHADOW_L_MAX - 0.02);
      const targetShadowA = dnaShadow.meanA + (lab.a - candShadow.meanA) * 0.25;
      const targetShadowB = dnaShadow.meanB + (lab.b - candShadow.meanB) * 0.25;
      const shadowBlend = clampStyleScalar(0.85 * strength, 0, 0.92);
      nextL = nextL + (targetShadowL - nextL) * shadowBlend;
      nextA = nextA + (targetShadowA - nextA) * shadowBlend;
      nextB = nextB + (targetShadowB - nextB) * shadowBlend;
    } else if (dnaLabs.length > 0 && palettePull > 0) {
      // 3) 비그림자 영역: 명도 유사도 우선 최근접 DNA 주조 팔레트 정렬
      let nearest = dnaLabs[0];
      let bestDistSq = Number.POSITIVE_INFINITY;
      for (const target of dnaLabs) {
        const dSq = (nextL - target.L) ** 2 * 4.5 + (nextA - target.a) ** 2 + (nextB - target.b) ** 2;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          nearest = target;
        }
      }
      if (nearest) {
        nextA += (nearest.a - nextA) * palettePull;
        nextB += (nearest.b - nextB) * palettePull;
        nextL += (nearest.L - nextL) * (palettePull * 0.45);
      }
    }

    const [nr, ng, nb] = oklabToSrgb(clampStyleScalar(nextL, 0.03, 0.99), nextA, nextB);
    if (nr !== r || ng !== g || nb !== b) {
      output[off] = nr;
      output[off + 1] = ng;
      output[off + 2] = nb;
      modifiedPixelCount += 1;
    }
  }

  if ((options?.harmonizeLinework ?? true) && beforeDrift.recipe.lineThicknessAdjust === "thicken") {
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const idx = y * width + x;
        if (inkFlags[idx] === 1) continue;
        if (inkFlags[idx - 1] === 1 || inkFlags[idx - width] === 1) {
          const off = idx * 4;
          if ((output[off + 3] ?? 0) >= 128) {
            output[off] = Math.round((output[off] ?? 0) * 0.25);
            output[off + 1] = Math.round((output[off + 1] ?? 0) * 0.25);
            output[off + 2] = Math.round((output[off + 2] ?? 0) * 0.25);
            modifiedPixelCount += 1;
          }
        }
      }
    }
  }

  const harmonizedFrame: AutoStyleFrameBuffer = {
    frameId: `${candidate.frameId}:harmonized`,
    episodeId: candidate.episodeId,
    width,
    height,
    rgba: output,
  };
  const afterDrift = detectStyleDrift(dna, harmonizedFrame);

  return {
    harmonizedFrame,
    beforeDrift,
    afterDrift,
    deltaEReduction: roundStyle3(beforeDrift.paletteDeltaE - afterDrift.paletteDeltaE),
    shadowDeltaEReduction: roundStyle3(beforeDrift.shadowDeltaE - afterDrift.shadowDeltaE),
    contrastDriftReduction: roundStyle3(beforeDrift.contrastRangeDelta - afterDrift.contrastRangeDelta),
    scoreImprovement: afterDrift.consistencyScore - beforeDrift.consistencyScore,
    modifiedPixelCount,
    appliedStrength: roundStyle3(strength),
  };
}
