/**
 * Wave 138 — 멀티 플랫폼 웹툰 출고 규격 프리셋, 원고 보호 영역 모델 및 행 시각 에너지 정규화.
 *
 * 네이버웹툰·카카오페이지·LINE WEBTOON·픽코마·스튜디오 고해상도 아카이브 5종 출고 규격과
 * 캐릭터 얼굴·말풍선·효과음·컷 경계선·여백 안전대 보호 영역 정규화를 제공한다.
 */

export type PlatformSlicePresetId =
  | "naver-webtoon-kr"
  | "kakao-page-kr"
  | "line-webtoon-global"
  | "piccoma-jp"
  | "studio-hd-archive";

export type SliceImageFormat = "jpeg" | "webp" | "png";

export type ProtectedSpanKind =
  | "character-face"
  | "dialogue-balloon"
  | "sfx-lettering"
  | "panel-border-seam"
  | "gutter-safe-band";

export type SliceAuditGrade = "PASS" | "WARN" | "FAIL";

export type SliceStrategy = "naive-fixed" | "dp-smart";

export interface PlatformSlicePreset {
  readonly id: PlatformSlicePresetId;
  readonly nameKo: string;
  readonly regionKo: string;
  readonly targetWidthPx: number;
  readonly maxSliceHeightPx: number;
  readonly minSliceHeightPx: number;
  readonly preferredSliceHeightPx: number;
  readonly maxBytesPerSlice: number;
  readonly maxTotalEpisodeBytes: number;
  readonly maxSliceCount: number;
  readonly allowedFormats: readonly SliceImageFormat[];
  readonly defaultFormat: SliceImageFormat;
  readonly colorProfile: string;
  readonly qualityLadder: readonly number[];
  readonly filePrefix: string;
}

export interface ProtectedSpan {
  readonly id: string;
  readonly kind: ProtectedSpanKind;
  readonly startY: number;
  readonly endY: number;
  readonly labelKo?: string;
  /** 보호 우선순위(1~5, 기본 3). */
  readonly priority?: number;
  /** 가로 폭 점유 비율(0~1, 기본 0.65). */
  readonly horizontalCoverage?: number;
  /** 시각 밀도 보정(0~1, 선택). */
  readonly complexityDensity?: number;
}

export interface ScaledProtectedSpan {
  readonly id: string;
  readonly kind: ProtectedSpanKind;
  readonly masterStartY: number;
  readonly masterEndY: number;
  readonly startY: number;
  readonly endY: number;
  readonly heightPx: number;
  readonly labelKo: string;
  readonly priority: number;
  readonly horizontalCoverage: number;
  readonly complexityDensity: number;
  /** 단일 보호 영역 자체가 플랫폼 최대 슬라이스 높이를 초과하는지 여부. */
  readonly isOversized: boolean;
}

export interface VerticalManuscriptInput {
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly masterWidthPx: number;
  readonly masterHeightPx: number;
  readonly protectedSpans: readonly ProtectedSpan[];
  /** 선택 입력: 행별 시각 에너지 밀도 배열(0~1). 미지정 시 보호 영역 기반 결정론 생성. */
  readonly rowVisualEnergy?: readonly number[];
  /** 컬러·스크린톤 복잡도 승수(기본 1.0, 범위 0.25~4.0). */
  readonly averageColorComplexity?: number;
  /** 허용 포맷 내에서 강제할 출력 포맷(선택). */
  readonly formatOverride?: SliceImageFormat;
}

export interface NormalizedManuscriptForPlatform {
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly masterWidthPx: number;
  readonly masterHeightPx: number;
  readonly scaleRatio: number;
  readonly scaledWidthPx: number;
  readonly scaledHeightPx: number;
  readonly format: SliceImageFormat;
  readonly averageColorComplexity: number;
  readonly scaledSpans: readonly ScaledProtectedSpan[];
  readonly normalizedRowEnergy: readonly number[];
  readonly oversizedSpanIds: readonly string[];
}

export interface SliceCutViolation {
  readonly cutY: number;
  readonly masterCutY: number;
  readonly spanId: string;
  readonly spanKind: ProtectedSpanKind;
  readonly labelKo: string;
  readonly penetrationRatio: number;
  readonly severity: "critical" | "warning";
  readonly forcedOversized: boolean;
}

export interface SlicePlanItem {
  readonly index: number;
  readonly fileName: string;
  readonly startY: number;
  readonly endY: number;
  readonly heightPx: number;
  readonly widthPx: number;
  readonly masterStartY: number;
  readonly masterEndY: number;
  readonly cutEnergyAtEnd: number;
  readonly cutInGutterBand: boolean;
  readonly format: SliceImageFormat;
  readonly selectedQuality: number;
  readonly estimatedBytes: number;
  readonly qualitySteppedDown: boolean;
  readonly exceedsSliceByteLimit: boolean;
  readonly forcedOversizedCut: boolean;
  readonly traversedSpanIds: readonly string[];
}

export interface PlatformSliceBudgetSummary {
  readonly totalSlices: number;
  readonly maxSliceCount: number;
  readonly exceedsSliceCountLimit: boolean;
  readonly totalEstimatedBytes: number;
  readonly maxTotalEpisodeBytes: number;
  readonly totalBudgetUtilizationRatio: number;
  readonly exceedsTotalByteLimit: boolean;
  readonly maxSingleSliceBytes: number;
  readonly maxBytesPerSlice: number;
  readonly exceedsAnySliceByteLimit: boolean;
  readonly lowestSelectedQuality: number;
  readonly qualityStepDownCount: number;
  readonly budgetWarningsKo: readonly string[];
}

export interface PlatformSlicePlan {
  readonly platformId: PlatformSlicePresetId;
  readonly preset: PlatformSlicePreset;
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly strategy: SliceStrategy;
  readonly masterWidthPx: number;
  readonly masterHeightPx: number;
  readonly scaleRatio: number;
  readonly scaledWidthPx: number;
  readonly scaledHeightPx: number;
  readonly slices: readonly SlicePlanItem[];
  readonly cutPositionsY: readonly number[];
  readonly scaledProtectedSpans: readonly ScaledProtectedSpan[];
  readonly normalizedRowEnergy: readonly number[];
  readonly violations: readonly SliceCutViolation[];
  readonly criticalCutCount: number;
  readonly avoidableCriticalCutCount: number;
  readonly faceCutCount: number;
  readonly balloonCutCount: number;
  readonly sfxCutCount: number;
  readonly panelSeamCutCount: number;
  readonly gutterAlignedCutCount: number;
  readonly forcedOversizedCutCount: number;
  readonly totalCutEnergy: number;
  readonly totalCost: number;
  readonly budget: PlatformSliceBudgetSummary;
  readonly auditGrade: SliceAuditGrade;
  readonly warningsKo: readonly string[];
}

export interface NaiveVsSmartSliceComparison {
  readonly platformId: PlatformSlicePresetId;
  readonly preset: PlatformSlicePreset;
  readonly naive: PlatformSlicePlan;
  readonly smart: PlatformSlicePlan;
  readonly preventedCriticalCuts: number;
  readonly preventedFaceCuts: number;
  readonly preventedBalloonCuts: number;
  readonly preventedSfxCuts: number;
  readonly cutEnergyReductionRatio: number;
  readonly gutterAlignmentGainCount: number;
  readonly improvedZeroCriticalCuts: boolean;
  readonly summaryKo: string;
}

export interface MultiPlatformBundleAggregate {
  readonly totalPlatformCount: number;
  readonly passCount: number;
  readonly warnCount: number;
  readonly failCount: number;
  readonly totalNaiveCriticalCuts: number;
  readonly totalSmartCriticalCuts: number;
  readonly totalPreventedCriticalCuts: number;
  readonly totalSmartSliceFiles: number;
  readonly totalSmartEstimatedBytes: number;
  readonly overallGrade: SliceAuditGrade;
}

export interface MultiPlatformSliceBundle {
  readonly episodeId: string;
  readonly episodeTitleKo: string;
  readonly masterWidthPx: number;
  readonly masterHeightPx: number;
  readonly generatedAtIso?: string;
  readonly platformIds: readonly PlatformSlicePresetId[];
  readonly plansByPlatform: Readonly<Partial<Record<PlatformSlicePresetId, PlatformSlicePlan>>>;
  readonly comparisonsByPlatform: Readonly<
    Partial<Record<PlatformSlicePresetId, NaiveVsSmartSliceComparison>>
  >;
  readonly aggregate: MultiPlatformBundleAggregate;
  readonly manifestCanonicalJson: string;
  readonly manifestSha256Hex: string;
}

export const PLATFORM_SLICE_PRESET_IDS: readonly PlatformSlicePresetId[] = [
  "naver-webtoon-kr",
  "kakao-page-kr",
  "line-webtoon-global",
  "piccoma-jp",
  "studio-hd-archive",
];

const ONE_MB = 1024 * 1024;

export const PLATFORM_SLICE_PRESETS: Readonly<Record<PlatformSlicePresetId, PlatformSlicePreset>> =
  {
    "naver-webtoon-kr": {
      id: "naver-webtoon-kr",
      nameKo: "네이버웹툰 한국",
      regionKo: "대한민국",
      targetWidthPx: 800,
      maxSliceHeightPx: 1600,
      minSliceHeightPx: 320,
      preferredSliceHeightPx: 1280,
      maxBytesPerSlice: 2 * ONE_MB,
      maxTotalEpisodeBytes: 20 * ONE_MB,
      maxSliceCount: 100,
      allowedFormats: ["jpeg", "png"],
      defaultFormat: "jpeg",
      colorProfile: "sRGB IEC61966-2.1",
      qualityLadder: [92, 88, 84, 78],
      filePrefix: "naver_kr",
    },
    "kakao-page-kr": {
      id: "kakao-page-kr",
      nameKo: "카카오페이지 · 카카오웹툰",
      regionKo: "대한민국",
      targetWidthPx: 720,
      maxSliceHeightPx: 1440,
      minSliceHeightPx: 300,
      preferredSliceHeightPx: 1180,
      maxBytesPerSlice: 2 * ONE_MB,
      maxTotalEpisodeBytes: 25 * ONE_MB,
      maxSliceCount: 120,
      allowedFormats: ["jpeg", "webp", "png"],
      defaultFormat: "jpeg",
      colorProfile: "sRGB IEC61966-2.1",
      qualityLadder: [92, 88, 84, 78],
      filePrefix: "kakao_kr",
    },
    "line-webtoon-global": {
      id: "line-webtoon-global",
      nameKo: "LINE WEBTOON 글로벌",
      regionKo: "북미 · 글로벌",
      targetWidthPx: 800,
      maxSliceHeightPx: 1280,
      minSliceHeightPx: 280,
      preferredSliceHeightPx: 1080,
      maxBytesPerSlice: 2 * ONE_MB,
      maxTotalEpisodeBytes: 20 * ONE_MB,
      maxSliceCount: 100,
      allowedFormats: ["jpeg"],
      defaultFormat: "jpeg",
      colorProfile: "sRGB IEC61966-2.1",
      qualityLadder: [92, 88, 84, 78],
      filePrefix: "line_global",
    },
    "piccoma-jp": {
      id: "piccoma-jp",
      nameKo: "픽코마 일본 스마툰",
      regionKo: "일본",
      targetWidthPx: 760,
      maxSliceHeightPx: 1500,
      minSliceHeightPx: 300,
      preferredSliceHeightPx: 1200,
      maxBytesPerSlice: Math.round(1.5 * ONE_MB),
      maxTotalEpisodeBytes: 18 * ONE_MB,
      maxSliceCount: 120,
      allowedFormats: ["webp", "jpeg"],
      defaultFormat: "webp",
      colorProfile: "sRGB IEC61966-2.1",
      qualityLadder: [92, 88, 84, 78],
      filePrefix: "piccoma_jp",
    },
    "studio-hd-archive": {
      id: "studio-hd-archive",
      nameKo: "스튜디오 마스터 HD 아카이브",
      regionKo: "사내 마스터 보관",
      targetWidthPx: 1600,
      maxSliceHeightPx: 3200,
      minSliceHeightPx: 640,
      preferredSliceHeightPx: 2560,
      maxBytesPerSlice: 8 * ONE_MB,
      maxTotalEpisodeBytes: 120 * ONE_MB,
      maxSliceCount: 80,
      allowedFormats: ["png", "webp", "jpeg"],
      defaultFormat: "png",
      colorProfile: "Display P3 / sRGB-Tagged",
      qualityLadder: [100, 95, 92, 88],
      filePrefix: "studio_hd",
    },
  };

/** 플랫폼 ID에 해당하는 출고 규격 프리셋을 반환한다. */
export function getPlatformSlicePreset(id: PlatformSlicePresetId): PlatformSlicePreset {
  return PLATFORM_SLICE_PRESETS[id];
}

/** 비유한수를 안전하게 걸러내고 `[min, max]` 범위로 고정한다. */
export function clampFinite(value: number, min: number, max: number, fallback = min): number {
  if (!Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

const DEFAULT_SPAN_LABELS_KO: Readonly<Record<ProtectedSpanKind, string>> = {
  "character-face": "캐릭터 얼굴",
  "dialogue-balloon": "대사 말풍선",
  "sfx-lettering": "효과음 레터링",
  "panel-border-seam": "컷 테두리 경계",
  "gutter-safe-band": "여백 안전대",
};

const SPAN_ENERGY_CONTRIBUTIONS: Readonly<Record<ProtectedSpanKind, number>> = {
  "character-face": 0.72,
  "dialogue-balloon": 0.56,
  "sfx-lettering": 0.48,
  "panel-border-seam": 0.34,
  "gutter-safe-band": -0.16,
};

const BASELINE_CANVAS_ENERGY = 0.18;

/**
 * 축소된 세로 원고 높이에 맞춘 행별 시각 에너지 프로파일(0~1)을 결정론적으로 생성하거나 리샘플링한다.
 */
export function buildDeterministicRowEnergyProfile(
  scaledHeightPx: number,
  scaledSpans: readonly ScaledProtectedSpan[],
  inputRowEnergy?: readonly number[],
): readonly number[] {
  const height = Math.max(1, Math.round(scaledHeightPx));
  const profile = new Float64Array(height);

  if (inputRowEnergy !== undefined && inputRowEnergy.length > 0) {
    const srcLen = inputRowEnergy.length;
    if (srcLen === height) {
      for (let y = 0; y < height; y += 1) {
        profile[y] = clampFinite(inputRowEnergy[y], 0, 1, BASELINE_CANVAS_ENERGY);
      }
    } else if (srcLen > height) {
      // 다운스케일 시 매핑된 원본 행 구간의 평균 에너지를 보존한다.
      for (let y = 0; y < height; y += 1) {
        const srcStart = Math.floor((y * srcLen) / height);
        const srcEnd = Math.max(srcStart + 1, Math.floor(((y + 1) * srcLen) / height));
        let sum = 0;
        let count = 0;
        for (let s = srcStart; s < srcEnd && s < srcLen; s += 1) {
          sum += clampFinite(inputRowEnergy[s], 0, 1, BASELINE_CANVAS_ENERGY);
          count += 1;
        }
        profile[y] = count > 0 ? sum / count : BASELINE_CANVAS_ENERGY;
      }
    } else {
      // 업스케일 시 선형 보간으로 부드럽게 확장한다.
      for (let y = 0; y < height; y += 1) {
        const pos = srcLen === 1 ? 0 : (y * (srcLen - 1)) / Math.max(1, height - 1);
        const idx0 = Math.floor(pos);
        const idx1 = Math.min(srcLen - 1, idx0 + 1);
        const t = pos - idx0;
        const v0 = clampFinite(inputRowEnergy[idx0], 0, 1, BASELINE_CANVAS_ENERGY);
        const v1 = clampFinite(inputRowEnergy[idx1], 0, 1, BASELINE_CANVAS_ENERGY);
        profile[y] = clampFinite(v0 + (v1 - v0) * t, 0, 1, BASELINE_CANVAS_ENERGY);
      }
    }
    return Array.from(profile);
  }

  for (let y = 0; y < height; y += 1) {
    profile[y] = BASELINE_CANVAS_ENERGY;
  }

  for (let i = 0; i < scaledSpans.length; i += 1) {
    const span = scaledSpans[i];
    const start = Math.max(0, Math.min(height, span.startY));
    const end = Math.max(start, Math.min(height, span.endY));
    const spanH = Math.max(1, end - start);
    const contrib = SPAN_ENERGY_CONTRIBUTIONS[span.kind];

    if (span.kind === "gutter-safe-band") {
      for (let y = start; y < end; y += 1) {
        const u = (y + 0.5 - start) / spanH;
        const centerWeight = 1 - Math.abs(u - 0.5) * 1.4;
        const target = Math.max(0.015, BASELINE_CANVAS_ENERGY + contrib * Math.max(0.3, centerWeight));
        if (target < profile[y]) {
          profile[y] = target;
        }
      }
      continue;
    }

    const densityBoost = 0.75 + 0.5 * span.complexityDensity;
    const coverageBoost = 0.65 + 0.35 * span.horizontalCoverage;
    for (let y = start; y < end; y += 1) {
      const u = (y + 0.5 - start) / spanH;
      const bell = 0.68 + 0.32 * Math.sin(Math.PI * clampFinite(u, 0, 1, 0.5));
      const next = profile[y] + contrib * densityBoost * coverageBoost * bell;
      profile[y] = next > 1 ? 1 : next;
    }
  }

  return Array.from(profile);
}

/**
 * 마스터 원고 크기·보호 영역·행 에너지를 대상 플랫폼 너비 규격에 맞춰 정규화한다.
 */
export function normalizeManuscriptForPlatform(
  manuscript: VerticalManuscriptInput,
  preset: PlatformSlicePreset,
): NormalizedManuscriptForPlatform {
  const masterWidthPx = Math.max(64, Math.round(clampFinite(manuscript.masterWidthPx, 64, 16384, 1600)));
  const masterHeightPx = Math.max(
    1,
    Math.round(clampFinite(manuscript.masterHeightPx, 1, 500_000, 1600)),
  );
  const scaledWidthPx = Math.max(64, Math.round(clampFinite(preset.targetWidthPx, 64, 16384, 800)));
  const scaleRatio = scaledWidthPx / masterWidthPx;
  const scaledHeightPx = Math.max(1, Math.round(masterHeightPx * scaleRatio));

  const format: SliceImageFormat =
    manuscript.formatOverride !== undefined &&
    preset.allowedFormats.indexOf(manuscript.formatOverride) >= 0
      ? manuscript.formatOverride
      : preset.defaultFormat;

  const averageColorComplexity = clampFinite(manuscript.averageColorComplexity ?? 1.0, 0.25, 4.0, 1.0);

  const scaledSpans: ScaledProtectedSpan[] = [];
  const oversizedSpanIds: string[] = [];

  for (let i = 0; i < manuscript.protectedSpans.length; i += 1) {
    const raw = manuscript.protectedSpans[i];
    const rawStart = clampFinite(raw.startY, 0, masterHeightPx, 0);
    const rawEnd = clampFinite(raw.endY, 0, masterHeightPx, rawStart);
    const masterStartY = Math.min(rawStart, rawEnd);
    const masterEndY = Math.max(rawStart, rawEnd);
    if (masterEndY - masterStartY <= 0) {
      continue;
    }

    const startY = Math.max(0, Math.min(scaledHeightPx - 1, Math.floor(masterStartY * scaleRatio)));
    const endY = Math.max(
      startY + 1,
      Math.min(scaledHeightPx, Math.ceil(masterEndY * scaleRatio)),
    );
    const heightPx = endY - startY;
    const isOversized = raw.kind !== "gutter-safe-band" && heightPx >= preset.maxSliceHeightPx;
    if (isOversized) {
      oversizedSpanIds.push(raw.id);
    }

    scaledSpans.push({
      id: raw.id,
      kind: raw.kind,
      masterStartY,
      masterEndY,
      startY,
      endY,
      heightPx,
      labelKo: raw.labelKo !== undefined && raw.labelKo.trim().length > 0
        ? raw.labelKo.trim()
        : `${DEFAULT_SPAN_LABELS_KO[raw.kind]} #${String(i + 1)}`,
      priority: Math.round(clampFinite(raw.priority ?? 3, 1, 5, 3)),
      horizontalCoverage: clampFinite(raw.horizontalCoverage ?? 0.65, 0.1, 1.0, 0.65),
      complexityDensity: clampFinite(raw.complexityDensity ?? 0.6, 0.0, 1.0, 0.6),
      isOversized,
    });
  }

  scaledSpans.sort((a, b) => a.startY - b.startY || a.endY - b.endY || a.id.localeCompare(b.id));

  const normalizedRowEnergy = buildDeterministicRowEnergyProfile(
    scaledHeightPx,
    scaledSpans,
    manuscript.rowVisualEnergy,
  );

  return {
    episodeId: manuscript.episodeId.trim().length > 0 ? manuscript.episodeId.trim() : "episode-unnamed",
    episodeTitleKo:
      manuscript.episodeTitleKo.trim().length > 0 ? manuscript.episodeTitleKo.trim() : "제목 미지정 회차",
    masterWidthPx,
    masterHeightPx,
    scaleRatio,
    scaledWidthPx,
    scaledHeightPx,
    format,
    averageColorComplexity,
    scaledSpans,
    normalizedRowEnergy,
    oversizedSpanIds,
  };
}

/**
 * 슬라이스 면적·시각 에너지·포맷·품질 계단을 반영해 인코딩 바이트 크기를 결정론적으로 추정한다.
 */
export function estimateSliceEncodedBytes(
  widthPx: number,
  heightPx: number,
  meanEnergy: number,
  format: SliceImageFormat,
  quality: number,
  complexityMultiplier: number,
): number {
  const safeW = Math.max(1, Math.round(clampFinite(widthPx, 1, 32768, 800)));
  const safeH = Math.max(1, Math.round(clampFinite(heightPx, 1, 32768, 1000)));
  const energy = clampFinite(meanEnergy, 0, 1, 0.25);
  const complexity = clampFinite(complexityMultiplier, 0.25, 4.0, 1.0);
  const q = clampFinite(quality, 50, 100, 92);
  const pixels = safeW * safeH;

  if (format === "png") {
    const pngQualityFactor = q >= 100 ? 1.0 : 0.45 + 0.55 * (q / 100);
    const bpp = 4.6 * (0.42 + 1.28 * energy) * complexity * pngQualityFactor;
    return Math.max(2048, Math.round((pixels * bpp) / 8 + 2048));
  }

  const qualityScale = Math.pow(1.062, q - 92);
  const jpegBaseBpp = 1.65 * (0.55 + 1.15 * energy) * complexity * qualityScale;
  if (format === "webp") {
    return Math.max(512, Math.round((pixels * jpegBaseBpp * 0.76) / 8 + 512));
  }

  return Math.max(1024, Math.round((pixels * jpegBaseBpp) / 8 + 1024));
}
