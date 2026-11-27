/**
 * 글로벌 에피소드 다국어 일괄 리플로우 검증 및 SVG·캔버스 렌더 지시서 출고 패키저.
 *
 * - 에피소드 전체 컷의 다국어 대사 묶음(`ko`, `en`, `ja`, `zh-Hans`, `zh-Hant`, `es`, `fr`)을
 *   단일 패스로 리플로우·충돌 회피 검증한다.
 * - 동일 컷 내 이미 배치된 말풍선을 후속 말풍선의 동적 Keepout으로 누적 등록해
 *   다국어 확장 시 말풍선끼리 겹치는 사고를 방지한다.
 * - 언어별 폰트 서브셋 매니페스트, 가독성·오버플로 품질 리포트, 결정론적 SVG 마크업 및
 *   Canvas 2D 렌더 연산 목록을 담은 `GlobalLocalizationExportManifest`를 생성한다.
 */

import {
  reflowLocalizedSpeechBalloon,
  type AdaptiveBalloonReflowResult,
  type BalloonGeometrySpec,
  type CutFrameBounds,
  type KeepoutRect,
  type ReflowWarningCode,
} from "./adaptive-balloon-reflow-solver";
import {
  MULTILINGUAL_TYPOGRAPHY_PROFILES,
  type SupportedL10nLocale,
  type TypographyWritingMode,
} from "./multilingual-typography-metrics";

export interface EpisodeBalloonL10nSpec {
  readonly balloonId: string;
  readonly readingOrder: number;
  readonly speakerId?: string;
  readonly geometry: BalloonGeometrySpec;
  readonly baseFontSizePx: number;
  readonly baseFontWeight?: number;
  readonly baseLineHeightRatio?: number;
  readonly baseLetterSpacingEm?: number;
  readonly sourceText: string;
  /** 대상 로캘별 번역 대사 사전. 누락된 로캘은 원문으로 폴백하며 경고 기록. */
  readonly localizedTexts: Readonly<Partial<Record<SupportedL10nLocale, string>>>;
  /** 로캘별 쓰기 방향 수동 지정(예: 일본어 가로 웹툰/세로 출판 전환). */
  readonly localeWritingModes?: Readonly<Partial<Record<SupportedL10nLocale, TypographyWritingMode>>>;
}

export interface EpisodeCutL10nSpec {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly cutBounds: CutFrameBounds;
  readonly keepoutRects: readonly KeepoutRect[];
  readonly balloons: readonly EpisodeBalloonL10nSpec[];
}

export interface GlobalEpisodeL10nInput {
  readonly episodeId: string;
  readonly episodeTitle: string;
  readonly sourceLocale?: SupportedL10nLocale;
  readonly targetLocales: readonly SupportedL10nLocale[];
  readonly mobileReferenceWidthPx?: number;
  readonly cuts: readonly EpisodeCutL10nSpec[];
  /** 매니페스트 생성 시각(결정론적 테스트를 위해 생략 시 고정 표기 사용). */
  readonly generatedAtIso?: string;
}

export interface LocaleFontManifestEntry {
  readonly locale: SupportedL10nLocale;
  readonly displayNameKo: string;
  readonly primaryFontFamily: string;
  readonly fallbackFontFamilies: readonly string[];
  readonly requiredFontWeights: readonly number[];
  readonly writingModesUsed: readonly TypographyWritingMode[];
  readonly minFontSizePxUsed: number;
  readonly maxFontSizePxUsed: number;
  /** 에피소드 대사 전체에서 실제 등장한 고유 코드포인트 수(WOFF2 서브셋 용량 추정 기준). */
  readonly uniqueGlyphCount: number;
  readonly unicodeRangeHints: readonly string[];
}

export type Canvas2DRenderOp =
  | { readonly op: "save" }
  | {
      readonly op: "draw-balloon-contour";
      readonly contour: BalloonGeometrySpec["contour"];
      readonly centerX: number;
      readonly centerY: number;
      readonly radiusX: number;
      readonly radiusY: number;
      readonly fillToken: string;
      readonly strokeToken: string;
      readonly strokeWidthPx: number;
    }
  | {
      readonly op: "draw-balloon-tail";
      readonly anchorX: number;
      readonly anchorY: number;
      readonly tipX: number;
      readonly tipY: number;
      readonly fillToken: string;
      readonly strokeToken: string;
    }
  | {
      readonly op: "set-typography";
      readonly fontFamily: string;
      readonly fontSizePx: number;
      readonly fontWeight: number;
      readonly letterSpacingEm: number;
      readonly writingMode: TypographyWritingMode;
      readonly inkToken: string;
    }
  | {
      readonly op: "draw-text-line";
      readonly lineIndex: number;
      readonly text: string;
      readonly x: number;
      readonly y: number;
      readonly writingMode: TypographyWritingMode;
    }
  | { readonly op: "restore" };

export interface BalloonRenderInstruction {
  readonly cutId: string;
  readonly balloonId: string;
  readonly readingOrder: number;
  readonly locale: SupportedL10nLocale;
  readonly writingMode: TypographyWritingMode;
  readonly usedFallbackSourceText: boolean;
  readonly reflow: AdaptiveBalloonReflowResult;
  readonly svgGroupMarkup: string;
  readonly canvas2dOps: readonly Canvas2DRenderOp[];
}

export interface CutRenderDirective {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly cutBounds: CutFrameBounds;
  readonly balloons: readonly BalloonRenderInstruction[];
  readonly svgOverlayDocument: string;
}

export interface LocaleEpisodeWarningItem {
  readonly cutId: string;
  readonly balloonId: string;
  readonly code: ReflowWarningCode | "MISSING_LOCALIZED_TEXT_FALLBACK";
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
}

export interface LocaleL10nQualityReport {
  readonly locale: SupportedL10nLocale;
  readonly totalBalloons: number;
  readonly fittedWithoutExpansionCount: number;
  readonly expandedBalloonCount: number;
  readonly repositionedBalloonCount: number;
  readonly overflowBalloonCount: number;
  readonly readabilityFloorWarningCount: number;
  readonly keepoutResidualCount: number;
  readonly missingTranslationFallbackCount: number;
  readonly averageExpansionRatio: number;
  readonly maxExpansionRatio: number;
  readonly minFontSizePxUsed: number;
  readonly averageReadabilityScore: number;
  readonly status: "ready" | "needs-review" | "blocked-overflow";
  readonly warnings: readonly LocaleEpisodeWarningItem[];
}

export interface LocaleLocalizationPackage {
  readonly locale: SupportedL10nLocale;
  readonly fontManifest: LocaleFontManifestEntry;
  readonly qualityReport: LocaleL10nQualityReport;
  readonly cuts: readonly CutRenderDirective[];
}

export interface GlobalLocalizationSummary {
  readonly totalCuts: number;
  readonly totalSourceBalloons: number;
  readonly totalLocalizedInstances: number;
  readonly readyLocales: readonly SupportedL10nLocale[];
  readonly reviewLocales: readonly SupportedL10nLocale[];
  readonly blockedLocales: readonly SupportedL10nLocale[];
  readonly totalWarnings: number;
  readonly totalOverflows: number;
  readonly overallReleaseGate: "pass" | "pass-with-warnings" | "fail-overflow";
}

export interface GlobalLocalizationExportManifest {
  readonly schemaVersion: "wave59.global-l10n-manifest.v1";
  readonly episodeId: string;
  readonly episodeTitle: string;
  readonly sourceLocale: SupportedL10nLocale;
  readonly targetLocales: readonly SupportedL10nLocale[];
  readonly mobileReferenceWidthPx: number;
  readonly generatedAtIso: string;
  readonly packages: readonly LocaleLocalizationPackage[];
  readonly packagesByLocale: Readonly<Partial<Record<SupportedL10nLocale, LocaleLocalizationPackage>>>;
  readonly summary: GlobalLocalizationSummary;
  /** 매니페스트 내용 기반 결정론적 64비트 이중 FNV-1a 16진수 다이제스트. */
  readonly manifestChecksum: string;
}

const DEFAULT_GENERATED_AT_ISO = "1970-01-01T00:00:00.000Z";
const BALLOON_FILL_TOKEN = "var(--toon-balloon-surface)";
const BALLOON_STROKE_TOKEN = "var(--toon-balloon-stroke)";
const BALLOON_INK_TOKEN = "var(--toon-balloon-ink)";

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** ES2017 호환 이중 레인 32비트 FNV-1a 해시(64비트 16진수 다이제스트, BigInt 리터럴 미사용). */
function computeDeterministicChecksumHex(payload: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x050c5d1f;
  for (let i = 0; i < payload.length; i += 1) {
    const code = payload.charCodeAt(i);
    h1 ^= code & 0xff;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= (code >>> 8) ^ (code & 0xff) ^ (i & 0xff);
    h2 = Math.imul(h2, 0x01000193);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, "0");
  const part2 = (h2 >>> 0).toString(16).padStart(8, "0");
  return `${part1}${part2}`;
}

function classifyUnicodeRangeHints(codePoints: readonly number[]): readonly string[] {
  const ranges = new Set<string>();
  for (const cp of codePoints) {
    if (cp >= 0x0020 && cp <= 0x007f) ranges.add("U+0020-007F");
    else if (cp >= 0x00a0 && cp <= 0x00ff) ranges.add("U+00A0-00FF");
    else if (cp >= 0x3000 && cp <= 0x303f) ranges.add("U+3000-303F");
    else if (cp >= 0x3040 && cp <= 0x309f) ranges.add("U+3040-309F");
    else if (cp >= 0x30a0 && cp <= 0x30ff) ranges.add("U+30A0-30FF");
    else if (cp >= 0x4e00 && cp <= 0x9fff) ranges.add("U+4E00-9FFF");
    else if (cp >= 0xac00 && cp <= 0xd7a3) ranges.add("U+AC00-D7A3");
    else if (cp >= 0xff00 && cp <= 0xffef) ranges.add("U+FF00-FFEF");
  }
  return Array.from(ranges).sort();
}

function buildBalloonRenderDirectives(params: {
  readonly cutId: string;
  readonly balloonId: string;
  readonly readingOrder: number;
  readonly locale: SupportedL10nLocale;
  readonly usedFallbackSourceText: boolean;
  readonly reflow: AdaptiveBalloonReflowResult;
}): BalloonRenderInstruction {
  const { cutId, balloonId, readingOrder, locale, usedFallbackSourceText, reflow } = params;
  const geom = reflow.geometryDelta.resolvedGeometry;
  const profile = MULTILINGUAL_TYPOGRAPHY_PROFILES[locale];
  const primaryFont = profile.recommendedFontStack[0] ?? "sans-serif";
  const typo = reflow.resolvedTypography;
  const writingMode = reflow.writingMode;

  const canvas2dOps: Canvas2DRenderOp[] = [
    { op: "save" },
    {
      op: "draw-balloon-contour",
      contour: geom.contour,
      centerX: geom.centerX,
      centerY: geom.centerY,
      radiusX: geom.radiusX,
      radiusY: geom.radiusY,
      fillToken: BALLOON_FILL_TOKEN,
      strokeToken: BALLOON_STROKE_TOKEN,
      strokeWidthPx: 2,
    },
  ];

  let shapeSvg: string;
  if (geom.contour === "rectangle" || geom.contour === "rounded-rect") {
    const rxAttr = geom.contour === "rounded-rect" ? Math.min(18, geom.radiusX * 0.18).toFixed(1) : "0";
    shapeSvg = `<rect x="${(geom.centerX - geom.radiusX).toFixed(2)}" y="${(geom.centerY - geom.radiusY).toFixed(2)}" width="${(geom.radiusX * 2).toFixed(2)}" height="${(geom.radiusY * 2).toFixed(2)}" rx="${rxAttr}" fill="${BALLOON_FILL_TOKEN}" stroke="${BALLOON_STROKE_TOKEN}" stroke-width="2" />`;
  } else {
    shapeSvg = `<ellipse cx="${geom.centerX.toFixed(2)}" cy="${geom.centerY.toFixed(2)}" rx="${geom.radiusX.toFixed(2)}" ry="${geom.radiusY.toFixed(2)}" fill="${BALLOON_FILL_TOKEN}" stroke="${BALLOON_STROKE_TOKEN}" stroke-width="2" />`;
  }

  let tailSvg = "";
  if (geom.tailTip) {
    canvas2dOps.push({
      op: "draw-balloon-tail",
      anchorX: geom.centerX,
      anchorY: geom.centerY + geom.radiusY * 0.72,
      tipX: geom.tailTip.x,
      tipY: geom.tailTip.y,
      fillToken: BALLOON_FILL_TOKEN,
      strokeToken: BALLOON_STROKE_TOKEN,
    });
    tailSvg = `<path d="M ${(geom.centerX - 10).toFixed(2)} ${(geom.centerY + geom.radiusY * 0.72).toFixed(2)} L ${geom.tailTip.x.toFixed(2)} ${geom.tailTip.y.toFixed(2)} L ${(geom.centerX + 10).toFixed(2)} ${(geom.centerY + geom.radiusY * 0.72).toFixed(2)} Z" fill="${BALLOON_FILL_TOKEN}" stroke="${BALLOON_STROKE_TOKEN}" stroke-width="2" />`;
  }

  canvas2dOps.push({
    op: "set-typography",
    fontFamily: primaryFont,
    fontSizePx: typo.fontSizePx,
    fontWeight: typo.fontWeight,
    letterSpacingEm: typo.letterSpacingEm,
    writingMode,
    inkToken: BALLOON_INK_TOKEN,
  });

  const textElements: string[] = [];
  for (const line of reflow.layout.lines) {
    const absX = Number((geom.centerX + line.centerOffsetXPx).toFixed(2));
    const absY = Number((geom.centerY + line.centerOffsetYPx).toFixed(2));
    canvas2dOps.push({
      op: "draw-text-line",
      lineIndex: line.lineIndex,
      text: line.text,
      x: absX,
      y: absY,
      writingMode,
    });
    textElements.push(
      `<text x="${absX.toFixed(2)}" y="${absY.toFixed(2)}" font-family="${escapeXml(primaryFont)}" font-size="${typo.fontSizePx.toFixed(2)}" font-weight="${typo.fontWeight}" letter-spacing="${typo.letterSpacingEm.toFixed(4)}em" writing-mode="${writingMode}" text-anchor="middle" dominant-baseline="central" fill="${BALLOON_INK_TOKEN}">${escapeXml(line.text)}</text>`
    );
  }

  canvas2dOps.push({ op: "restore" });

  const svgGroupMarkup = `<g data-cut-id="${escapeXml(cutId)}" data-balloon-id="${escapeXml(balloonId)}" data-locale="${escapeXml(locale)}" data-writing-mode="${writingMode}">${tailSvg}${shapeSvg}${textElements.join("")}</g>`;

  return {
    cutId,
    balloonId,
    readingOrder,
    locale,
    writingMode,
    usedFallbackSourceText,
    reflow,
    svgGroupMarkup,
    canvas2dOps,
  };
}

/** 에피소드 전체 컷의 다국어 대사를 일괄 리플로우·검증하고 글로벌 출고 매니페스트를 생성한다. */
export function buildGlobalLocalizationBundle(
  input: GlobalEpisodeL10nInput
): GlobalLocalizationExportManifest {
  const sourceLocale: SupportedL10nLocale = input.sourceLocale ?? "ko";
  const mobileReferenceWidthPx = input.mobileReferenceWidthPx ?? 800;
  const generatedAtIso = input.generatedAtIso ?? DEFAULT_GENERATED_AT_ISO;

  // 로캘 중복 제거 후 입력 순서 보존(결정론적 출고 패키지 구성)
  const uniqueLocales: SupportedL10nLocale[] = [];
  for (const loc of input.targetLocales) {
    if (!uniqueLocales.includes(loc)) uniqueLocales.push(loc);
  }

  const orderedCuts = [...input.cuts].sort((a, b) => a.cutIndex - b.cutIndex || a.cutId.localeCompare(b.cutId));
  const totalSourceBalloons = orderedCuts.reduce((sum, cut) => sum + cut.balloons.length, 0);

  const packages: LocaleLocalizationPackage[] = [];
  const packagesByLocale: Partial<Record<SupportedL10nLocale, LocaleLocalizationPackage>> = {};

  const readyLocales: SupportedL10nLocale[] = [];
  const reviewLocales: SupportedL10nLocale[] = [];
  const blockedLocales: SupportedL10nLocale[] = [];
  let totalWarnings = 0;
  let totalOverflows = 0;

  for (const locale of uniqueLocales) {
    const profile = MULTILINGUAL_TYPOGRAPHY_PROFILES[locale];
    const cutDirectives: CutRenderDirective[] = [];
    const localeWarnings: LocaleEpisodeWarningItem[] = [];
    const usedWeights = new Set<number>();
    const usedWritingModes = new Set<TypographyWritingMode>();
    const uniqueCodePoints = new Set<number>();

    let fittedWithoutExpansionCount = 0;
    let expandedBalloonCount = 0;
    let repositionedBalloonCount = 0;
    let overflowBalloonCount = 0;
    let readabilityFloorWarningCount = 0;
    let keepoutResidualCount = 0;
    let missingTranslationFallbackCount = 0;
    let expansionRatioSum = 0;
    let maxExpansionRatio = 0;
    let minFontSizePxUsed = Number.POSITIVE_INFINITY;
    let maxFontSizePxUsed = 0;
    let readabilityScoreSum = 0;
    let localeBalloonCount = 0;

    for (const cut of orderedCuts) {
      const orderedBalloons = [...cut.balloons].sort(
        (a, b) => a.readingOrder - b.readingOrder || a.balloonId.localeCompare(b.balloonId)
      );
      const accumulatedKeepouts: KeepoutRect[] = [...cut.keepoutRects];
      const renderedBalloons: BalloonRenderInstruction[] = [];

      for (const balloonSpec of orderedBalloons) {
        const localizedRaw = balloonSpec.localizedTexts[locale];
        const hasTranslation = typeof localizedRaw === "string" && localizedRaw.trim().length > 0;
        const targetText = hasTranslation ? localizedRaw : balloonSpec.sourceText;
        const usedFallbackSourceText = !hasTranslation && locale !== sourceLocale;

        if (usedFallbackSourceText) {
          missingTranslationFallbackCount += 1;
          localeWarnings.push({
            cutId: cut.cutId,
            balloonId: balloonSpec.balloonId,
            code: "MISSING_LOCALIZED_TEXT_FALLBACK",
            severity: "warning",
            message: `${locale} 번역 대사가 비어 있어 원문(${sourceLocale})으로 폴백했습니다.`,
          });
        }

        const reflow = reflowLocalizedSpeechBalloon(balloonSpec.geometry, {
          sourceLocale,
          sourceText: balloonSpec.sourceText,
          targetLocale: locale,
          targetText,
          writingMode: balloonSpec.localeWritingModes?.[locale],
          baseFontSizePx: balloonSpec.baseFontSizePx,
          baseFontWeight: balloonSpec.baseFontWeight,
          baseLineHeightRatio: balloonSpec.baseLineHeightRatio,
          baseLetterSpacingEm: balloonSpec.baseLetterSpacingEm,
          mobileReferenceWidthPx,
          cutBounds: cut.cutBounds,
          keepoutRects: accumulatedKeepouts,
        });

        // 확정된 말풍선 영역을 후속 말풍선 배치용 동적 Keepout으로 등록해 말풍선 간 겹침 차단
        const resolvedGeom = reflow.geometryDelta.resolvedGeometry;
        accumulatedKeepouts.push({
          id: `placed-${balloonSpec.balloonId}`,
          kind: "other-balloon",
          x: resolvedGeom.centerX - resolvedGeom.radiusX,
          y: resolvedGeom.centerY - resolvedGeom.radiusY,
          width: resolvedGeom.radiusX * 2,
          height: resolvedGeom.radiusY * 2,
          priority: 6,
          marginPx: 6,
        });

        localeBalloonCount += 1;
        usedWeights.add(reflow.resolvedTypography.fontWeight);
        usedWritingModes.add(reflow.writingMode);
        for (const ch of Array.from(targetText)) {
          const cp = ch.codePointAt(0);
          if (cp !== undefined && cp > 0x20) uniqueCodePoints.add(cp);
        }

        if (reflow.status === "fitted") fittedWithoutExpansionCount += 1;
        if (reflow.geometryDelta.expanded) expandedBalloonCount += 1;
        if (reflow.geometryDelta.repositioned) repositionedBalloonCount += 1;
        if (reflow.status === "overflow") overflowBalloonCount += 1;
        if (reflow.collisionResolution.residualOverlapAreaPx2 > 0.1) keepoutResidualCount += 1;

        expansionRatioSum += reflow.expansion.expansionRatio;
        if (reflow.expansion.expansionRatio > maxExpansionRatio) {
          maxExpansionRatio = reflow.expansion.expansionRatio;
        }
        if (reflow.resolvedTypography.fontSizePx < minFontSizePxUsed) {
          minFontSizePxUsed = reflow.resolvedTypography.fontSizePx;
        }
        if (reflow.resolvedTypography.fontSizePx > maxFontSizePxUsed) {
          maxFontSizePxUsed = reflow.resolvedTypography.fontSizePx;
        }
        readabilityScoreSum += reflow.readabilityScore;

        for (const warn of reflow.warnings) {
          if (
            warn.code === "MOBILE_READABILITY_FLOOR_HIT" ||
            warn.code === "MOBILE_READABILITY_BELOW_FLOOR"
          ) {
            readabilityFloorWarningCount += 1;
          }
          localeWarnings.push({
            cutId: cut.cutId,
            balloonId: balloonSpec.balloonId,
            code: warn.code,
            severity: warn.severity,
            message: warn.message,
          });
        }

        renderedBalloons.push(
          buildBalloonRenderDirectives({
            cutId: cut.cutId,
            balloonId: balloonSpec.balloonId,
            readingOrder: balloonSpec.readingOrder,
            locale,
            usedFallbackSourceText,
            reflow,
          })
        );
      }

      const svgOverlayDocument = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${cut.cutBounds.x} ${cut.cutBounds.y} ${cut.cutBounds.width} ${cut.cutBounds.height}" data-cut-id="${escapeXml(cut.cutId)}" data-locale="${escapeXml(locale)}">${renderedBalloons.map((b) => b.svgGroupMarkup).join("")}</svg>`;

      cutDirectives.push({
        cutId: cut.cutId,
        cutIndex: cut.cutIndex,
        cutBounds: cut.cutBounds,
        balloons: renderedBalloons,
        svgOverlayDocument,
      });
    }

    const sortedCodePoints = Array.from(uniqueCodePoints).sort((a, b) => a - b);
    const fontManifest: LocaleFontManifestEntry = {
      locale,
      displayNameKo: profile.displayNameKo,
      primaryFontFamily: profile.recommendedFontStack[0] ?? "sans-serif",
      fallbackFontFamilies: profile.recommendedFontStack.slice(1),
      requiredFontWeights: Array.from(usedWeights).sort((a, b) => a - b),
      writingModesUsed: Array.from(usedWritingModes).sort(),
      minFontSizePxUsed: Number.isFinite(minFontSizePxUsed) ? Number(minFontSizePxUsed.toFixed(2)) : 0,
      maxFontSizePxUsed: Number(maxFontSizePxUsed.toFixed(2)),
      uniqueGlyphCount: sortedCodePoints.length,
      unicodeRangeHints: classifyUnicodeRangeHints(sortedCodePoints),
    };

    const hasReviewWarning = localeWarnings.some((w) => w.severity === "warning" || w.severity === "error");
    const localeStatus: LocaleL10nQualityReport["status"] =
      overflowBalloonCount > 0 ? "blocked-overflow" : hasReviewWarning ? "needs-review" : "ready";

    if (localeStatus === "ready") readyLocales.push(locale);
    else if (localeStatus === "needs-review") reviewLocales.push(locale);
    else blockedLocales.push(locale);

    totalWarnings += localeWarnings.filter((w) => w.severity !== "info").length;
    totalOverflows += overflowBalloonCount;

    const qualityReport: LocaleL10nQualityReport = {
      locale,
      totalBalloons: localeBalloonCount,
      fittedWithoutExpansionCount,
      expandedBalloonCount,
      repositionedBalloonCount,
      overflowBalloonCount,
      readabilityFloorWarningCount,
      keepoutResidualCount,
      missingTranslationFallbackCount,
      averageExpansionRatio:
        localeBalloonCount > 0 ? Number((expansionRatioSum / localeBalloonCount).toFixed(3)) : 1,
      maxExpansionRatio: Number(maxExpansionRatio.toFixed(3)),
      minFontSizePxUsed: Number.isFinite(minFontSizePxUsed) ? Number(minFontSizePxUsed.toFixed(2)) : 0,
      averageReadabilityScore:
        localeBalloonCount > 0 ? Number((readabilityScoreSum / localeBalloonCount).toFixed(1)) : 100,
      status: localeStatus,
      warnings: localeWarnings,
    };

    const pkg: LocaleLocalizationPackage = {
      locale,
      fontManifest,
      qualityReport,
      cuts: cutDirectives,
    };
    packages.push(pkg);
    packagesByLocale[locale] = pkg;
  }

  const summary: GlobalLocalizationSummary = {
    totalCuts: orderedCuts.length,
    totalSourceBalloons,
    totalLocalizedInstances: totalSourceBalloons * uniqueLocales.length,
    readyLocales,
    reviewLocales,
    blockedLocales,
    totalWarnings,
    totalOverflows,
    overallReleaseGate:
      totalOverflows > 0
        ? "fail-overflow"
        : totalWarnings > 0
          ? "pass-with-warnings"
          : "pass",
  };

  // 타임스탬프를 제외한 순수 구조 페이로드로 결정론적 체크섬 계산
  const canonicalPayload = JSON.stringify({
    schemaVersion: "wave59.global-l10n-manifest.v1",
    episodeId: input.episodeId,
    sourceLocale,
    targetLocales: uniqueLocales,
    mobileReferenceWidthPx,
    packages,
    summary,
  });

  return {
    schemaVersion: "wave59.global-l10n-manifest.v1",
    episodeId: input.episodeId,
    episodeTitle: input.episodeTitle,
    sourceLocale,
    targetLocales: uniqueLocales,
    mobileReferenceWidthPx,
    generatedAtIso,
    packages,
    packagesByLocale,
    summary,
    manifestChecksum: computeDeterministicChecksumHex(canonicalPayload),
  };
}
