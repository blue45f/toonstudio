/**
 * Wave 143 — 자동 폰트·행간 피팅, 탐욕 vs 마름모 DP 비교기 및 5개국어 일괄 배치 식자 컴파일러.
 */

import {
  DEFAULT_CLOUD_LOBE_DEPTH_RATIO,
  DEFAULT_CORNER_RADIUS_PX,
  DEFAULT_FONT_SIZE_PX,
  DEFAULT_FONT_STEP_PX,
  DEFAULT_MAX_FONT_SIZE_PX,
  DEFAULT_MIN_FONT_SIZE_PX,
  DEFAULT_SAFE_PADDING_PX,
  DEFAULT_SPIKE_DEPTH_RATIO,
  DEFAULT_TARGET_DIAMOND_FILL_RATIO,
  clampNumber,
  computeBalloonChordWidthPx,
  resolveBalloonFitOptions,
  resolveBalloonGeometry,
  resolveBalloonTypesetOptions,
  round2,
} from "./balloon-chord-geometry";
import {
  ALL_SUPPORTED_TYPESET_LOCALES,
  BALLOON_FIT_STATUS_LABELS_KO,
  LOCALE_LABELS_KO,
  type BalloonAutoFitResult,
  type BalloonFitOptions,
  type BalloonFitStatus,
  type BalloonGeometrySpec,
  type BalloonLayoutResult,
  type BalloonTypesetOptions,
  type CompiledLocalizedBalloon,
  type CompiledMultilingualBalloonBatch,
  type GreedyVsDiamondComparison,
  type LocaleBatchSummary,
  type MultilingualDialogueEntry,
  type ResolvedBalloonFitOptions,
  type ResolvedBalloonGeometrySpec,
  type SupportedTypesetLocale,
} from "./balloon-typeset-types";
import { layoutBalloonGreedyBaseline, typesetBalloonDiamondOptimal } from "./diamond-dp-solver";
import { getLocaleKinsokuRuleSet } from "./multilingual-kinsoku-metrics";
import { computeTypesetManifestSha256Hex } from "./typeset-sha256";

export {
  DEFAULT_CLOUD_LOBE_DEPTH_RATIO,
  DEFAULT_CORNER_RADIUS_PX,
  DEFAULT_FONT_SIZE_PX,
  DEFAULT_FONT_STEP_PX,
  DEFAULT_MAX_FONT_SIZE_PX,
  DEFAULT_MIN_FONT_SIZE_PX,
  DEFAULT_SAFE_PADDING_PX,
  DEFAULT_SPIKE_DEPTH_RATIO,
  DEFAULT_TARGET_DIAMOND_FILL_RATIO,
  computeBalloonChordWidthPx,
  layoutBalloonGreedyBaseline,
  resolveBalloonFitOptions,
  resolveBalloonGeometry,
  resolveBalloonTypesetOptions,
  typesetBalloonDiamondOptimal,
};

function findMinimumExpansionScale(
  text: string,
  locale: SupportedTypesetLocale,
  geom: ResolvedBalloonGeometrySpec,
  minFontSizePx: number,
  minLineHeightRatio: number,
  fitOpts: ResolvedBalloonFitOptions,
): number {
  let lo = 1.0;
  let hi = 1.15;

  const fitsAtScale = (scale: number): boolean => {
    const scaledGeom: BalloonGeometrySpec = {
      kind: geom.kind,
      widthPx: geom.widthPx * scale,
      heightPx: geom.heightPx * scale,
      safePaddingPx: geom.safePaddingPx,
      cornerRadiusPx: geom.cornerRadiusPx,
      spikeDepthRatio: geom.spikeDepthRatio,
      cloudLobeDepthRatio: geom.cloudLobeDepthRatio,
    };
    const layout = typesetBalloonDiamondOptimal(text, locale, scaledGeom, {
      fontSizePx: minFontSizePx,
      lineHeightRatio: minLineHeightRatio,
      letterSpacingEm: fitOpts.letterSpacingEm,
      targetDiamondFillRatio: fitOpts.targetDiamondFillRatio,
      allowWordHyphenation: fitOpts.allowWordHyphenation,
      allowKoreanSyllableSplit: fitOpts.allowKoreanSyllableSplit,
    });
    return layout.audit.overflowLineCount === 0;
  };

  while (hi < 6.0 && !fitsAtScale(hi)) {
    lo = hi;
    hi = Math.min(6.0, hi * 1.45);
  }

  for (let iter = 0; iter < 14; iter += 1) {
    const mid = (lo + hi) / 2;
    if (fitsAtScale(mid)) hi = mid;
    else lo = mid;
  }

  return Math.max(1.05, round2(Math.ceil(hi * 100) / 100));
}

/**
 * 허용 폰트·행간 범위 내에서 오버플로우 0건·금칙 위반 0건·최적 마름모 실루엣을 자동 탐색한다.
 * 최소 폰트에서도 넘치면 `balloon-expansion-required`와 최소 확대 배율(`recommendedBalloonScale`)을 보고한다.
 */
export function fitDialogueIntoBalloon(
  text: string,
  locale: SupportedTypesetLocale,
  geometrySpec: BalloonGeometrySpec,
  options?: BalloonFitOptions,
): BalloonAutoFitResult {
  const geom = resolveBalloonGeometry(geometrySpec);
  const fitOpts = resolveBalloonFitOptions(locale, options);
  const rule = getLocaleKinsokuRuleSet(locale);

  const defaultLH = clampNumber(
    rule.defaultLineHeightRatio,
    fitOpts.minLineHeightRatio,
    fitOpts.maxLineHeightRatio,
    fitOpts.minLineHeightRatio,
  );
  const midLH = round2((defaultLH + fitOpts.minLineHeightRatio) / 2);
  const lineHeights: number[] = [round2(defaultLH)];
  if (Math.abs(midLH - defaultLH) >= 0.02) lineHeights.push(midLH);
  if (Math.abs(fitOpts.minLineHeightRatio - defaultLH) >= 0.02) lineHeights.push(fitOpts.minLineHeightRatio);

  const fontCandidates: number[] = [];
  for (let f = fitOpts.preferredFontSizePx; f >= fitOpts.minFontSizePx - 1e-6; f -= fitOpts.fontStepPx) {
    fontCandidates.push(round2(Math.max(fitOpts.minFontSizePx, f)));
  }
  if (fontCandidates.length === 0 || fontCandidates[fontCandidates.length - 1] !== fitOpts.minFontSizePx) {
    fontCandidates.push(fitOpts.minFontSizePx);
  }

  let searchedCandidatesCount = 0;
  let bestClean: BalloonLayoutResult | null = null;
  let bestCleanScore = Number.NEGATIVE_INFINITY;
  let bestZeroOverflow: BalloonLayoutResult | null = null;
  let bestZeroOverflowScore = Number.NEGATIVE_INFINITY;
  let minFontFallback: BalloonLayoutResult | null = null;

  for (let fIdx = 0; fIdx < fontCandidates.length; fIdx += 1) {
    const fontSizePx = fontCandidates[fIdx];
    if (fontSizePx === undefined) continue;

    for (let lhIdx = 0; lhIdx < lineHeights.length; lhIdx += 1) {
      const lineHeightRatio = lineHeights[lhIdx];
      if (lineHeightRatio === undefined) continue;
      searchedCandidatesCount += 1;

      const layout = typesetBalloonDiamondOptimal(text, locale, geom, {
        fontSizePx,
        lineHeightRatio,
        letterSpacingEm: fitOpts.letterSpacingEm,
        targetDiamondFillRatio: fitOpts.targetDiamondFillRatio,
        allowWordHyphenation: fitOpts.allowWordHyphenation,
        allowKoreanSyllableSplit: fitOpts.allowKoreanSyllableSplit,
      });

      const fontRatio = fontSizePx / Math.max(1, fitOpts.preferredFontSizePx);
      const lhComfortBonus = lhIdx === 0 ? 4 : lhIdx === 1 ? 1.5 : 0;
      const compositeScore = layout.diamondFitScore + fontRatio * 24 + lhComfortBonus;

      if (layout.audit.isClean) {
        if (compositeScore > bestCleanScore) {
          bestCleanScore = compositeScore;
          bestClean = layout;
        }
        if (lhIdx === 0) break;
      } else if (
        layout.audit.overflowLineCount === 0 &&
        layout.audit.lineStartKinsokuCount === 0 &&
        layout.audit.lineEndKinsokuCount === 0
      ) {
        if (compositeScore > bestZeroOverflowScore) {
          bestZeroOverflowScore = compositeScore;
          bestZeroOverflow = layout;
        }
      }

      if (fIdx === fontCandidates.length - 1 && lhIdx === lineHeights.length - 1) {
        minFontFallback = layout;
      }
    }

    if (bestClean && bestClean.fontSizePx >= fitOpts.preferredFontSizePx - 0.5 && bestClean.diamondFitScore >= 82) {
      break;
    }
  }

  const chosen =
    bestClean ??
    bestZeroOverflow ??
    minFontFallback ??
    typesetBalloonDiamondOptimal(text, locale, geom, {
      fontSizePx: fitOpts.minFontSizePx,
      lineHeightRatio: fitOpts.minLineHeightRatio,
    });

  const needsExpansion = chosen.audit.overflowLineCount > 0;
  let status: BalloonFitStatus;
  let recommendedBalloonScale = 1;
  let diagnosticsKo: string;

  if (needsExpansion) {
    status = "balloon-expansion-required";
    recommendedBalloonScale = findMinimumExpansionScale(
      text,
      locale,
      geom,
      fitOpts.minFontSizePx,
      fitOpts.minLineHeightRatio,
      fitOpts,
    );
    diagnosticsKo =
      `${LOCALE_LABELS_KO[locale]} 최소 폰트(${fitOpts.minFontSizePx}px)에서도 ` +
      `${chosen.audit.maxOverflowPx.toFixed(1)}px 넘침 — 말풍선 ${recommendedBalloonScale.toFixed(2)}배 확대 필요`;
  } else if (chosen.fontSizePx < fitOpts.preferredFontSizePx - 0.01) {
    status = "fitted-with-shrink";
    diagnosticsKo =
      `${LOCALE_LABELS_KO[locale]} 폰트 ${fitOpts.preferredFontSizePx}px → ${chosen.fontSizePx}px 자동 축소로 ` +
      `오버플로우 0건·마름모 적합도 ${chosen.diamondFitScore}점 달성`;
  } else {
    status = "optimal-fit";
    diagnosticsKo =
      `${LOCALE_LABELS_KO[locale]} 기준 폰트 ${chosen.fontSizePx}px 유지 · 오버플로우 0건 · ` +
      `마름모 적합도 ${chosen.diamondFitScore}점 (${BALLOON_FIT_STATUS_LABELS_KO[status]})`;
  }

  return {
    status,
    layout: chosen,
    recommendedBalloonScale,
    fontScaleAppliedRatio: round2(chosen.fontSizePx / Math.max(1, fitOpts.preferredFontSizePx)),
    searchedCandidatesCount,
    diagnosticsKo,
  };
}

/** 동일 조건에서 단순 탐욕적 줄바꿈과 마름모꼴 Knuth-Plass DP 결과를 비교한다. */
export function compareGreedyVsDiamondTypeset(
  text: string,
  locale: SupportedTypesetLocale,
  geometrySpec: BalloonGeometrySpec,
  options?: BalloonTypesetOptions,
): GreedyVsDiamondComparison {
  const geom = resolveBalloonGeometry(geometrySpec);
  const resolved = resolveBalloonTypesetOptions(locale, options);
  const greedy = layoutBalloonGreedyBaseline(text, locale, geom, resolved);
  const diamond = typesetBalloonDiamondOptimal(text, locale, geom, resolved);

  const diamondFitScoreGain = round2(diamond.diamondFitScore - greedy.diamondFitScore);
  const symmetryScoreGain = round2(diamond.symmetryScore - greedy.symmetryScore);
  const overflowReductionCount = greedy.audit.overflowLineCount - diamond.audit.overflowLineCount;
  const greedyKinsoku = greedy.audit.lineStartKinsokuCount + greedy.audit.lineEndKinsokuCount;
  const diamondKinsoku = diamond.audit.lineStartKinsokuCount + diamond.audit.lineEndKinsokuCount;
  const kinsokuViolationReductionCount = greedyKinsoku - diamondKinsoku;
  const widowReductionCount = greedy.audit.widowCount - diamond.audit.widowCount;
  const totalViolationReductionCount = greedy.audit.totalViolationCount - diamond.audit.totalViolationCount;

  const sign = diamondFitScoreGain >= 0 ? "+" : "";
  const summaryKo =
    `${LOCALE_LABELS_KO[locale]} 마름모 DP 비교: 적합도 ${greedy.diamondFitScore} → ${diamond.diamondFitScore} ` +
    `(${sign}${diamondFitScoreGain}점), 오버플로우 ${greedy.audit.overflowLineCount} → ${diamond.audit.overflowLineCount}건, ` +
    `금칙 위반 ${greedyKinsoku} → ${diamondKinsoku}건, 고아행 ${greedy.audit.widowCount} → ${diamond.audit.widowCount}건`;

  return {
    locale,
    geometry: geom,
    fontSizePx: resolved.fontSizePx,
    greedy,
    diamond,
    diamondFitScoreGain,
    symmetryScoreGain,
    overflowReductionCount,
    kinsokuViolationReductionCount,
    widowReductionCount,
    totalViolationReductionCount,
    summaryKo,
  };
}

/**
 * 5개국어(한/일/영/불/스) 말풍선 대사 묶음을 일괄 피팅·비교 컴파일하고
 * 키 순서 무관 FIPS 180-4 SHA-256 매니페스트 지문을 생성한다.
 */
export function compileMultilingualBalloonBatch(
  episodeTitleKo: string,
  entries: readonly MultilingualDialogueEntry[],
  defaultFitOptions?: BalloonFitOptions,
): CompiledMultilingualBalloonBatch {
  const safeTitle = episodeTitleKo.trim().length > 0 ? episodeTitleKo.trim() : "제목 미지정 회차";
  const balloons: CompiledLocalizedBalloon[] = [];

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!entry) continue;
    const panelId = entry.panelId ?? `P${String(i + 1).padStart(2, "0")}`;
    const speakerKo = entry.speakerKo ?? "화자";
    const mergedFitOpts: BalloonFitOptions = { ...defaultFitOptions, ...entry.fitOptions };

    for (let l = 0; l < ALL_SUPPORTED_TYPESET_LOCALES.length; l += 1) {
      const locale = ALL_SUPPORTED_TYPESET_LOCALES[l];
      if (!locale) continue;
      const sourceText = entry.textsByLocale[locale];
      if (sourceText === undefined || sourceText.trim().length === 0) continue;

      const fit = fitDialogueIntoBalloon(sourceText, locale, entry.geometry, mergedFitOpts);
      const comparison = compareGreedyVsDiamondTypeset(sourceText, locale, entry.geometry, {
        fontSizePx: fit.layout.fontSizePx,
        lineHeightRatio: fit.layout.lineHeightRatio,
        letterSpacingEm: mergedFitOpts.letterSpacingEm,
        targetDiamondFillRatio: mergedFitOpts.targetDiamondFillRatio,
        allowWordHyphenation: mergedFitOpts.allowWordHyphenation,
        allowKoreanSyllableSplit: mergedFitOpts.allowKoreanSyllableSplit,
      });

      balloons.push({ balloonId: entry.balloonId, panelId, speakerKo, locale, sourceText, fit, comparison });
    }
  }

  const localeSummaries: LocaleBatchSummary[] = [];
  for (let l = 0; l < ALL_SUPPORTED_TYPESET_LOCALES.length; l += 1) {
    const locale = ALL_SUPPORTED_TYPESET_LOCALES[l];
    if (!locale) continue;
    const subset = balloons.filter((item) => item.locale === locale);
    if (subset.length === 0) continue;

    let zeroOverflowCount = 0;
    let zeroViolationCount = 0;
    let expansionRequiredCount = 0;
    let sumDiamond = 0;
    let sumFont = 0;
    let maxScale = 1;

    for (let j = 0; j < subset.length; j += 1) {
      const item = subset[j];
      if (!item) continue;
      if (item.fit.layout.audit.overflowLineCount === 0) zeroOverflowCount += 1;
      if (item.fit.layout.audit.isClean) zeroViolationCount += 1;
      if (item.fit.status === "balloon-expansion-required") expansionRequiredCount += 1;
      sumDiamond += item.fit.layout.diamondFitScore;
      sumFont += item.fit.layout.fontSizePx;
      if (item.fit.recommendedBalloonScale > maxScale) maxScale = item.fit.recommendedBalloonScale;
    }

    localeSummaries.push({
      locale,
      balloonCount: subset.length,
      zeroOverflowCount,
      zeroViolationCount,
      expansionRequiredCount,
      averageDiamondFitScore: round2(sumDiamond / subset.length),
      averageFontSizePx: round2(sumFont / subset.length),
      maxRecommendedBalloonScale: round2(maxScale),
    });
  }

  let totalOverflowCount = 0;
  let totalKinsokuViolationCount = 0;
  let totalWidowCount = 0;
  let expansionRequiredCount = 0;
  let sumDiamondScore = 0;
  let sumGreedyScore = 0;

  for (let i = 0; i < balloons.length; i += 1) {
    const item = balloons[i];
    if (!item) continue;
    totalOverflowCount += item.fit.layout.audit.overflowLineCount;
    totalKinsokuViolationCount +=
      item.fit.layout.audit.lineStartKinsokuCount + item.fit.layout.audit.lineEndKinsokuCount;
    totalWidowCount += item.fit.layout.audit.widowCount;
    if (item.fit.status === "balloon-expansion-required") expansionRequiredCount += 1;
    sumDiamondScore += item.fit.layout.diamondFitScore;
    sumGreedyScore += item.comparison.greedy.diamondFitScore;
  }

  const count = balloons.length;
  const averageDiamondFitScore = count > 0 ? round2(sumDiamondScore / count) : 100;
  const averageGreedyDiamondFitScore = count > 0 ? round2(sumGreedyScore / count) : 100;
  const averageDiamondScoreGain = round2(averageDiamondFitScore - averageGreedyDiamondFitScore);

  const typesetManifestSha256Hex = computeTypesetManifestSha256Hex({
    schema: "toonstudio.wave143.multilingual-balloon-knuth-plass.v1",
    episodeTitleKo: safeTitle,
    balloons: balloons.map((item) => ({
      balloonId: item.balloonId,
      panelId: item.panelId,
      speakerKo: item.speakerKo,
      locale: item.locale,
      sourceText: item.sourceText,
      geometry: item.fit.layout.geometry,
      status: item.fit.status,
      fontSizePx: item.fit.layout.fontSizePx,
      lineHeightRatio: item.fit.layout.lineHeightRatio,
      recommendedBalloonScale: item.fit.recommendedBalloonScale,
      diamondFitScore: item.fit.layout.diamondFitScore,
      lines: item.fit.layout.lines.map((line) => ({
        text: line.text,
        widthPx: line.widthPx,
        availableChordWidthPx: line.availableChordWidthPx,
      })),
    })),
  });

  return {
    episodeTitleKo: safeTitle,
    balloons,
    localeSummaries,
    totalBalloonVariants: count,
    totalOverflowCount,
    totalKinsokuViolationCount,
    totalWidowCount,
    expansionRequiredCount,
    averageDiamondFitScore,
    averageGreedyDiamondFitScore,
    averageDiamondScoreGain,
    typesetManifestSha256Hex,
  };
}
