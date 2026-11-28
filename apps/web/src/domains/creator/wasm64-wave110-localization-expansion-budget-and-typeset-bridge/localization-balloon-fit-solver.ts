/**
 * Wave 110 — 다국어 웹툰 번역 텍스트 팽창 예산·말풍선 피팅 솔버.
 *
 * - 한국어 마스터 대사로부터 7개 글로벌 로케일별 번역 글자 수·면적 예산을 사전 산출한다.
 * - 번역된 대사를 마스터 말풍선 내부 경계에 피팅하고 5단계 보정 등급을 판정한다.
 */

import {
  ALL_LOCALIZATION_LOCALES,
  LOCALIZATION_LOCALE_PROFILES,
  MATRIX_DISPLAY_LOCALE_ORDER,
  estimateGlyphAdvanceEm,
  measureTextWidthPx,
  type BalloonInteriorShape,
  type BalloonRemediationTier,
  type LocaleShortCode,
  type LocaleTypographyProfile,
  type LocalizationTargetLocale,
  type ScriptFamily,
} from "./localization-locale-profiles-and-crypto";
import {
  computeRecommendedMaxCharsForBalloon,
  findBestFitInBalloonBox,
  hasMultiClauseBreakOpportunity,
  tryLayoutInsideBalloon,
} from "./localization-balloon-wrap-geometry";

export {
  ALL_LOCALIZATION_LOCALES,
  LOCALIZATION_LOCALE_PROFILES,
  MATRIX_DISPLAY_LOCALE_ORDER,
  estimateGlyphAdvanceEm,
};
export type {
  BalloonInteriorShape,
  BalloonRemediationTier,
  LocaleShortCode,
  LocaleTypographyProfile,
  LocalizationTargetLocale,
  ScriptFamily,
};

export interface ExpansionBudgetOptions {
  readonly nominalFontSizePx?: number;
  readonly masterInnerWidthPx?: number;
  readonly masterInnerHeightPx?: number;
  readonly balloonShape?: BalloonInteriorShape;
}

export interface LocaleExpansionBudgetEntry {
  readonly locale: LocalizationTargetLocale;
  readonly shortCode: LocaleShortCode;
  readonly labelKo: string;
  readonly direction: "ltr" | "rtl";
  readonly isRtl: boolean;
  readonly supportsVerticalTypeset: boolean;
  readonly effectiveCharExpansionRatio: number;
  readonly effectiveAreaExpansionRatio: number;
  readonly expectedCharCountMin: number;
  readonly expectedCharCountNominal: number;
  readonly expectedCharCountMax: number;
  readonly expectedPixelAreaPx2: number;
  readonly recommendedBalloonWidthPx: number;
  readonly recommendedBalloonHeightPx: number;
  readonly recommendedHeadroomPercent: number;
  readonly overflowRisk: "low" | "moderate" | "high";
}

export interface CrossLocaleExpansionBudgetReport {
  readonly sourceText: string;
  readonly sourceCharCount: number;
  readonly shortTextBoostApplied: number;
  readonly masterPixelAreaPx2: number;
  readonly masterBalloonUsableAreaPx2: number;
  readonly locales: readonly LocaleExpansionBudgetEntry[];
  readonly highestExpansionLocale: LocalizationTargetLocale;
  readonly maxRecommendedHeadroomPercent: number;
}

export interface LocalizedDialogueBalloonEntry {
  readonly balloonId: string;
  readonly cutId: string;
  readonly panelId?: string;
  readonly speakerId?: string;
  readonly locale: LocalizationTargetLocale;
  readonly sourceKoText?: string;
  readonly translatedText: string;
  readonly balloonShape?: BalloonInteriorShape;
  readonly innerWidthPx: number;
  readonly innerHeightPx: number;
  readonly nominalFontSizePx: number;
  readonly minReadableFontPx: number;
  readonly canvasWidthPx: number;
  readonly maxSafeExpansionPercent?: number;
  readonly obstacleClearancePx?: number;
  readonly allowLinkedSubBalloonSplit?: boolean;
}

export interface BalloonFitAuditOptions {
  readonly episodeId?: string;
  readonly episodeTitle?: string;
  readonly defaultMaxSafeExpansionPercent?: number;
}

export interface BalloonFitAuditResult {
  readonly balloonId: string;
  readonly cutId: string;
  readonly panelId: string;
  readonly speakerId: string;
  readonly locale: LocalizationTargetLocale;
  readonly shortCode: LocaleShortCode;
  readonly direction: "ltr" | "rtl";
  readonly balloonShape: BalloonInteriorShape;
  readonly actualChars: number;
  readonly wrappedLines: readonly string[];
  readonly lineCount: number;
  readonly remediationTier: BalloonRemediationTier;
  readonly nominalFontSizePx: number;
  readonly minReadableFontPx: number;
  readonly resolvedFontSizePx: number;
  readonly resolvedTrackingEm: number;
  readonly requiredBalloonExpansionPercent: number;
  readonly recommendedBalloonWidthPx: number;
  readonly recommendedBalloonHeightPx: number;
  readonly recommendedMaxChars: number | null;
  readonly recommendedSplitCount: number;
  readonly severeOverflow: boolean;
  readonly mobileLegibilityPassed: boolean;
  readonly areaUtilizationRatio: number;
}

export interface LocaleBalloonFitSummary {
  readonly locale: LocalizationTargetLocale;
  readonly shortCode: LocaleShortCode;
  readonly totalBalloons: number;
  readonly fitsCleanlyCount: number;
  readonly microTightenCount: number;
  readonly expandBalloonMarginCount: number;
  readonly splitSubBalloonCount: number;
  readonly shortenCopyCount: number;
  readonly severeOverflowCount: number;
  readonly fitRatePercent: number;
  readonly mobileLegibilityPassRate: number;
  readonly averageAreaUtilizationRatio: number;
}

export interface LocalizationBalloonFitReport {
  readonly episodeId: string;
  readonly episodeTitle: string;
  readonly totalBalloons: number;
  readonly cutIds: readonly string[];
  readonly targetLocales: readonly LocalizationTargetLocale[];
  readonly fitRatePercent: number;
  readonly severeOverflowCount: number;
  readonly mobileLegibilityPassRate: number;
  readonly perLocaleSummaries: readonly LocaleBalloonFitSummary[];
  readonly results: readonly BalloonFitAuditResult[];
}

function safeFinite(value: number | undefined, fallback: number): number {
  return value === undefined || !Number.isFinite(value) ? fallback : value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function shapeUsableAreaFactor(shape: BalloonInteriorShape): number {
  if (shape === "rounded-rect") return 0.9;
  if (shape === "burst") return 0.62;
  return Math.PI / 4;
}

/**
 * 한국어 마스터 대사로부터 7개 글로벌 로케일별 번역 글자 수·픽셀 면적·말풍선 여유 예산을 산정한다.
 */
export function estimateCrossLocaleExpansionBudget(
  koreanSourceText: string,
  targetLocales?: readonly LocalizationTargetLocale[],
  options?: ExpansionBudgetOptions,
): CrossLocaleExpansionBudgetReport {
  const normalizedSource = koreanSourceText.replace(/\s+/g, " ").trim();
  const sourceCharCount = normalizedSource.length;
  const nominalFontSizePx = clamp(safeFinite(options?.nominalFontSizePx, 24), 10, 96);
  const masterInnerWidthPx = clamp(safeFinite(options?.masterInnerWidthPx, 220), 40, 2000);
  const masterInnerHeightPx = clamp(safeFinite(options?.masterInnerHeightPx, 160), 40, 2000);
  const balloonShape: BalloonInteriorShape = options?.balloonShape ?? "ellipse";

  const requestedLocales: LocalizationTargetLocale[] = [];
  const rawList =
    targetLocales && targetLocales.length > 0 ? targetLocales : ALL_LOCALIZATION_LOCALES;
  for (let i = 0; i < rawList.length; i += 1) {
    const loc = rawList[i];
    if (LOCALIZATION_LOCALE_PROFILES[loc] && requestedLocales.indexOf(loc) < 0) {
      requestedLocales.push(loc);
    }
  }
  if (requestedLocales.length === 0) requestedLocales.push("ko-KR");

  const shortTextBoostApplied =
    sourceCharCount === 0
      ? 1.0
      : sourceCharCount < 6
        ? 1.2
        : sourceCharCount < 12
          ? roundTo(1 + ((12 - sourceCharCount) / 12) * 0.2, 3)
          : 1.0;

  const koProfile = LOCALIZATION_LOCALE_PROFILES["ko-KR"];
  const sourceSingleLineWidth = measureTextWidthPx(normalizedSource, nominalFontSizePx, 0, koProfile);
  const masterPixelAreaPx2 = roundTo(
    sourceSingleLineWidth * nominalFontSizePx * koProfile.lineHeightRatio,
    2,
  );
  const masterBalloonUsableAreaPx2 = roundTo(
    masterInnerWidthPx * masterInnerHeightPx * shapeUsableAreaFactor(balloonShape),
    2,
  );

  const entries: LocaleExpansionBudgetEntry[] = [];
  let highestExpansionLocale: LocalizationTargetLocale = requestedLocales[0];
  let highestAreaRatio = -1;
  let maxRecommendedHeadroomPercent = 0;

  for (let i = 0; i < requestedLocales.length; i += 1) {
    const loc = requestedLocales[i];
    const profile = LOCALIZATION_LOCALE_PROFILES[loc];
    const boost = loc === "ko-KR" ? 1.0 : shortTextBoostApplied;
    const effectiveCharExpansionRatio = roundTo(profile.charExpansionRatio * boost, 3);
    const effectiveAreaExpansionRatio = roundTo(
      profile.areaExpansionRatio * (1 + (boost - 1) * 0.65),
      3,
    );

    const expectedCharCountNominal =
      sourceCharCount === 0 ? 0 : Math.max(1, Math.round(sourceCharCount * effectiveCharExpansionRatio));
    const expectedCharCountMin =
      sourceCharCount === 0 ? 0 : Math.max(1, Math.floor(expectedCharCountNominal * 0.85));
    const expectedCharCountMax =
      sourceCharCount === 0 ? 0 : Math.max(expectedCharCountNominal, Math.ceil(expectedCharCountNominal * 1.18));

    const expectedPixelAreaPx2 = roundTo(masterPixelAreaPx2 * effectiveAreaExpansionRatio, 2);
    const linearScale = Math.sqrt(Math.max(1, effectiveAreaExpansionRatio));
    const recommendedHeadroomPercent = roundTo(Math.max(0, (linearScale - 1) * 100), 1);
    const projectedRatio =
      masterBalloonUsableAreaPx2 > 0 ? expectedPixelAreaPx2 / masterBalloonUsableAreaPx2 : 0;
    const overflowRisk: "low" | "moderate" | "high" =
      projectedRatio >= 0.92 || effectiveAreaExpansionRatio >= 1.55
        ? "high"
        : projectedRatio >= 0.68 || effectiveAreaExpansionRatio >= 1.25
          ? "moderate"
          : "low";

    if (effectiveAreaExpansionRatio > highestAreaRatio) {
      highestAreaRatio = effectiveAreaExpansionRatio;
      highestExpansionLocale = loc;
    }
    if (recommendedHeadroomPercent > maxRecommendedHeadroomPercent) {
      maxRecommendedHeadroomPercent = recommendedHeadroomPercent;
    }

    entries.push({
      locale: loc,
      shortCode: profile.shortCode,
      labelKo: profile.labelKo,
      direction: profile.direction,
      isRtl: profile.isRtl,
      supportsVerticalTypeset: profile.supportsVerticalTypeset,
      effectiveCharExpansionRatio,
      effectiveAreaExpansionRatio,
      expectedCharCountMin,
      expectedCharCountNominal,
      expectedCharCountMax,
      expectedPixelAreaPx2,
      recommendedBalloonWidthPx: Math.round(masterInnerWidthPx * linearScale),
      recommendedBalloonHeightPx: Math.round(masterInnerHeightPx * linearScale),
      recommendedHeadroomPercent,
      overflowRisk,
    });
  }

  return {
    sourceText: normalizedSource,
    sourceCharCount,
    shortTextBoostApplied,
    masterPixelAreaPx2,
    masterBalloonUsableAreaPx2,
    locales: entries,
    highestExpansionLocale,
    maxRecommendedHeadroomPercent,
  };
}

function solveSingleBalloon(
  entry: LocalizedDialogueBalloonEntry,
  profile: LocaleTypographyProfile,
  defaultMaxExpand: number,
): BalloonFitAuditResult {
  const shape: BalloonInteriorShape = entry.balloonShape ?? "ellipse";
  const innerWidthPx = clamp(safeFinite(entry.innerWidthPx, 160), 24, 2400);
  const innerHeightPx = clamp(safeFinite(entry.innerHeightPx, 110), 24, 2400);
  const nominalFontSizePx = clamp(safeFinite(entry.nominalFontSizePx, 22), 8, 120);
  const minReadableFontPx = clamp(safeFinite(entry.minReadableFontPx, 14), 8, nominalFontSizePx);
  const canvasWidthPx = clamp(safeFinite(entry.canvasWidthPx, 800), 320, 4000);
  const mobileFloorPx = Math.max(
    minReadableFontPx,
    roundTo(canvasWidthPx * profile.minMobileFontRatioOfCanvas, 1),
  );
  const configuredExpand = clamp(safeFinite(entry.maxSafeExpansionPercent, defaultMaxExpand), 0, 25);
  const clearanceExpand =
    entry.obstacleClearancePx !== undefined
      ? clamp(
          ((Math.max(0, safeFinite(entry.obstacleClearancePx, 0)) * 2) /
            Math.max(1, Math.min(innerWidthPx, innerHeightPx))) *
            100,
          0,
          25,
        )
      : 25;
  const effectiveMaxExpandPct = Math.min(configuredExpand, clearanceExpand);

  const normalizedText = entry.translatedText.trim();
  const actualChars = normalizedText.length;
  const usableArea = innerWidthPx * innerHeightPx * shapeUsableAreaFactor(shape);

  const makeResult = (params: {
    readonly tier: BalloonRemediationTier;
    readonly lines: readonly string[];
    readonly fontPx: number;
    readonly trackEm: number;
    readonly expandPct: number;
    readonly maxChars: number | null;
    readonly splitCount: number;
    readonly severe: boolean;
    readonly mobilePass: boolean;
    readonly usedArea: number;
    readonly areaCap: number;
  }): BalloonFitAuditResult => {
    const scale = 1 + params.expandPct / 100;
    return {
      balloonId: entry.balloonId,
      cutId: entry.cutId,
      panelId: entry.panelId ?? entry.cutId,
      speakerId: entry.speakerId ?? "unknown",
      locale: entry.locale,
      shortCode: profile.shortCode,
      direction: profile.direction,
      balloonShape: shape,
      actualChars,
      wrappedLines: params.lines,
      lineCount: params.lines.length,
      remediationTier: params.tier,
      nominalFontSizePx,
      minReadableFontPx,
      resolvedFontSizePx: params.fontPx,
      resolvedTrackingEm: params.trackEm,
      requiredBalloonExpansionPercent: params.expandPct,
      recommendedBalloonWidthPx: Math.round(innerWidthPx * scale),
      recommendedBalloonHeightPx: Math.round(innerHeightPx * scale),
      recommendedMaxChars: params.maxChars,
      recommendedSplitCount: params.splitCount,
      severeOverflow: params.severe,
      mobileLegibilityPassed: params.mobilePass,
      areaUtilizationRatio: roundTo(params.areaCap > 0 ? params.usedArea / params.areaCap : 0, 3),
    };
  };

  // 1단계: 마스터 원형 피팅
  const nominal = tryLayoutInsideBalloon(
    normalizedText,
    nominalFontSizePx,
    0,
    innerWidthPx,
    innerHeightPx,
    shape,
    profile,
  );
  if (nominal.fits) {
    return makeResult({
      tier: "fits-cleanly",
      lines: nominal.lines,
      fontPx: nominalFontSizePx,
      trackEm: 0,
      expandPct: 0,
      maxChars: null,
      splitCount: 1,
      severe: false,
      mobilePass: nominalFontSizePx >= mobileFloorPx,
      usedArea: nominal.maxLineWidthPx * nominal.lines.length * nominalFontSizePx * profile.lineHeightRatio,
      areaCap: usableArea,
    });
  }

  // 2단계: 자간·폰트 가독 하한 내 미세 조정
  const micro = findBestFitInBalloonBox(
    normalizedText,
    nominalFontSizePx,
    minReadableFontPx,
    innerWidthPx,
    innerHeightPx,
    shape,
    profile,
  );
  if (micro) {
    return makeResult({
      tier: "micro-tighten-tracking",
      lines: micro.lines,
      fontPx: micro.fontSizePx,
      trackEm: micro.trackingEm,
      expandPct: 0,
      maxChars: null,
      splitCount: 1,
      severe: false,
      mobilePass: micro.fontSizePx >= mobileFloorPx,
      usedArea: micro.maxLineWidthPx * micro.lines.length * micro.fontSizePx * profile.lineHeightRatio,
      areaCap: usableArea,
    });
  }

  // 3단계: 장애물 비침범 범위(<= 25%) 내 말풍선 여백 확장
  if (effectiveMaxExpandPct > 0) {
    const pcts: number[] = [];
    for (let p = 5; p < effectiveMaxExpandPct; p += 2.5) pcts.push(roundTo(p, 1));
    pcts.push(roundTo(effectiveMaxExpandPct, 1));
    for (let i = 0; i < pcts.length; i += 1) {
      const pct = pcts[i];
      const scale = 1 + pct / 100;
      const fit = findBestFitInBalloonBox(
        normalizedText,
        nominalFontSizePx,
        minReadableFontPx,
        innerWidthPx * scale,
        innerHeightPx * scale,
        shape,
        profile,
      );
      if (fit) {
        return makeResult({
          tier: "expand-balloon-margin",
          lines: fit.lines,
          fontPx: fit.fontSizePx,
          trackEm: fit.trackingEm,
          expandPct: pct,
          maxChars: null,
          splitCount: 1,
          severe: false,
          mobilePass: fit.fontSizePx >= mobileFloorPx,
          usedArea: fit.maxLineWidthPx * fit.lines.length * fit.fontSizePx * profile.lineHeightRatio,
          areaCap: usableArea * scale * scale,
        });
      }
    }
  }

  // 4단계: 심각 넘침 — 연결 보조 말풍선 분할 또는 번역문 축약 권고
  const recommendedMaxChars = computeRecommendedMaxCharsForBalloon(
    normalizedText,
    minReadableFontPx,
    innerWidthPx,
    innerHeightPx,
    shape,
    profile,
  );
  const canSplit =
    entry.allowLinkedSubBalloonSplit !== false &&
    hasMultiClauseBreakOpportunity(normalizedText) &&
    innerHeightPx >= minReadableFontPx * 2.4 &&
    actualChars >= Math.max(24, Math.ceil(recommendedMaxChars * 1.35));
  const rawW = measureTextWidthPx(normalizedText, minReadableFontPx, profile.minTrackingEm, profile);

  return makeResult({
    tier: canSplit ? "split-into-linked-sub-balloon" : "shorten-translation-copy",
    lines: normalizedText.length === 0 ? [] : normalizedText.split(/\r?\n/),
    fontPx: minReadableFontPx,
    trackEm: profile.minTrackingEm,
    expandPct: roundTo(effectiveMaxExpandPct, 1),
    maxChars: recommendedMaxChars,
    splitCount: canSplit ? Math.max(2, Math.min(4, Math.ceil(actualChars / Math.max(1, recommendedMaxChars)))) : 1,
    severe: true,
    mobilePass: false,
    usedArea: rawW * minReadableFontPx * profile.lineHeightRatio,
    areaCap: usableArea,
  });
}

/**
 * 다국어 번역 말풍선 목록을 마스터 말풍선 기하·가독 하한 기준으로 피팅 감사한다.
 */
export function auditAndFitLocalizedDialogueBalloons(
  balloonEntries: readonly LocalizedDialogueBalloonEntry[],
  options?: BalloonFitAuditOptions,
): LocalizationBalloonFitReport {
  const episodeId = options?.episodeId ?? "EP-LOCALIZATION";
  const episodeTitle = options?.episodeTitle ?? "다국어 식자 피팅 감사";
  const defaultMaxExpand = clamp(safeFinite(options?.defaultMaxSafeExpansionPercent, 25), 0, 25);

  const results: BalloonFitAuditResult[] = [];
  const cutIds: string[] = [];
  const localeOrder: LocalizationTargetLocale[] = [];

  for (let i = 0; i < balloonEntries.length; i += 1) {
    const entry = balloonEntries[i];
    const profile = LOCALIZATION_LOCALE_PROFILES[entry.locale];
    if (!profile) continue;
    if (cutIds.indexOf(entry.cutId) < 0) cutIds.push(entry.cutId);
    if (localeOrder.indexOf(entry.locale) < 0) localeOrder.push(entry.locale);
    results.push(solveSingleBalloon(entry, profile, defaultMaxExpand));
  }

  const perLocaleSummaries: LocaleBalloonFitSummary[] = [];
  let totalFitMaster = 0;
  let totalSevere = 0;
  let totalMobilePass = 0;

  for (let li = 0; li < localeOrder.length; li += 1) {
    const loc = localeOrder[li];
    const profile = LOCALIZATION_LOCALE_PROFILES[loc];
    let count = 0;
    let clean = 0;
    let micro = 0;
    let expand = 0;
    let split = 0;
    let shorten = 0;
    let mobilePass = 0;
    let utilSum = 0;

    for (let ri = 0; ri < results.length; ri += 1) {
      const r = results[ri];
      if (r.locale !== loc) continue;
      count += 1;
      utilSum += r.areaUtilizationRatio;
      if (r.mobileLegibilityPassed) mobilePass += 1;
      if (r.remediationTier === "fits-cleanly") clean += 1;
      else if (r.remediationTier === "micro-tighten-tracking") micro += 1;
      else if (r.remediationTier === "expand-balloon-margin") expand += 1;
      else if (r.remediationTier === "split-into-linked-sub-balloon") split += 1;
      else shorten += 1;
    }

    const severeCount = split + shorten;
    const fitCount = clean + micro;
    totalFitMaster += fitCount;
    totalSevere += severeCount;
    totalMobilePass += mobilePass;

    perLocaleSummaries.push({
      locale: loc,
      shortCode: profile.shortCode,
      totalBalloons: count,
      fitsCleanlyCount: clean,
      microTightenCount: micro,
      expandBalloonMarginCount: expand,
      splitSubBalloonCount: split,
      shortenCopyCount: shorten,
      severeOverflowCount: severeCount,
      fitRatePercent: count > 0 ? roundTo((fitCount / count) * 100, 1) : 100,
      mobileLegibilityPassRate: count > 0 ? roundTo((mobilePass / count) * 100, 1) : 100,
      averageAreaUtilizationRatio: count > 0 ? roundTo(utilSum / count, 3) : 0,
    });
  }

  const totalBalloons = results.length;
  return {
    episodeId,
    episodeTitle,
    totalBalloons,
    cutIds,
    targetLocales: localeOrder,
    fitRatePercent: totalBalloons > 0 ? roundTo((totalFitMaster / totalBalloons) * 100, 1) : 100,
    severeOverflowCount: totalSevere,
    mobileLegibilityPassRate:
      totalBalloons > 0 ? roundTo((totalMobilePass / totalBalloons) * 100, 1) : 100,
    perLocaleSummaries,
    results,
  };
}
