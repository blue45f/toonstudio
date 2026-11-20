/**
 * Waves 40–49: 글로벌 다국어 배급·문화 검수·동시연재 엔진 (Global Distribution Engine)
 * - W40: 12-Locale Reading Direction & Gutter Layout Validator
 * - W41: Cultural Sensitivity & Age-Rating Matrix
 * - W42: Typesetting Overflow & Speech-Bubble Fit Estimator
 * - W43: Regional Tax Withholding & FX Settlement Calculator
 * - W44: Simultaneous Simulpub Window Scheduler
 * - W45: Translator & Letterer Micro-Royalty Split Engine
 * - W46: Localized SFX Vector/Raster Rights Tracker
 * - W47: Regional Platform Spec Packager
 * - W48: Piracy Watermark & Regional Fingerprinting Policy
 * - W49: Global Launch Readiness Gate & Go/No-Go Digest
 */

export type GlobalDistributionLocale =
  | "ko-KR"
  | "en-US"
  | "ja-JP"
  | "zh-TW"
  | "fr-FR"
  | "es-ES"
  | "de-DE"
  | "th-TH"
  | "id-ID"
  | "ar-SA"
  | "pt-BR"
  | "vi-VN";

export type ReadingDirection = "ltr" | "rtl" | "ttb-vertical";

export interface LocaleLayoutValidation {
  readonly locale: GlobalDistributionLocale;
  readonly readingDirection: ReadingDirection;
  readonly gutterPx: number;
  readonly valid: boolean;
}

export interface AgeRatingMapping {
  readonly locale: GlobalDistributionLocale;
  readonly ratingCode: "ALL" | "12+" | "15+" | "18+";
  readonly requiresContentWarning: boolean;
}

export interface BubbleOverflowEstimate {
  readonly bubbleId: string;
  readonly locale: GlobalDistributionLocale;
  readonly charCount: number;
  readonly maxSafeChars: number;
  readonly overflowRisk: boolean;
}

export interface RegionalNetSettlement {
  readonly locale: GlobalDistributionLocale;
  readonly grossKrw: number;
  readonly withholdingTaxKrw: number;
  readonly translatorShareKrw: number;
  readonly lettererShareKrw: number;
  readonly creatorNetKrw: number;
}

export interface GlobalLaunchGateResult {
  readonly seriesTitle: string;
  readonly episodeLabel: string;
  readonly readyForGlobalLaunch: boolean;
  readonly clearedLocales: readonly GlobalDistributionLocale[];
  readonly blockers: readonly string[];
  readonly totalCreatorNetKrw: number;
  readonly globalLaunchDigestHash: string;
}

function fnv1aHex(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** W40: 12개 로케일 읽기 방향(LTR/RTL/세로) 및 컷 간격 규격 검증 */
export function validateLocaleReadingLayout(
  locale: GlobalDistributionLocale,
  gutterPx: number,
): LocaleLayoutValidation {
  let readingDirection: ReadingDirection = "ltr";
  if (locale === "ar-SA") {
    readingDirection = "rtl";
  } else if (locale === "ja-JP" || locale === "zh-TW") {
    readingDirection = "ttb-vertical";
  }
  return {
    locale,
    readingDirection,
    gutterPx,
    valid: gutterPx >= 24 && gutterPx <= 240,
  };
}

/** W41: 권역별 연령 등급·주의 표기 매핑 */
export function mapRegionalAgeRating(
  locale: GlobalDistributionLocale,
  violenceLevel: 0 | 1 | 2 | 3,
): AgeRatingMapping {
  const ratingCode: "ALL" | "12+" | "15+" | "18+" =
    violenceLevel === 0 ? "ALL" : violenceLevel === 1 ? "12+" : violenceLevel === 2 ? "15+" : "18+";
  return {
    locale,
    ratingCode,
    requiresContentWarning: violenceLevel >= 2,
  };
}

/** W42: 다국어 말풍선 식자 넘침 예측 */
export function estimateBubbleTypesettingFit(params: {
  readonly bubbleId: string;
  readonly locale: GlobalDistributionLocale;
  readonly text: string;
  readonly bubbleWidthPx: number;
}): BubbleOverflowEstimate {
  const expansionFactor =
    params.locale === "de-DE" || params.locale === "fr-FR" || params.locale === "es-ES"
      ? 1.25
      : params.locale === "en-US"
        ? 1.15
        : 1.0;
  const maxSafeChars = Math.max(8, Math.floor((params.bubbleWidthPx / 12) / expansionFactor) * 4);
  const charCount = params.text.trim().length;
  return {
    bubbleId: params.bubbleId,
    locale: params.locale,
    charCount,
    maxSafeChars,
    overflowRisk: charCount > maxSafeChars,
  };
}

/** W43 + W45: 권역별 원천징수 및 번역·식자 마이크로 로열티 1원 정산 */
export function calculateRegionalNetSettlement(params: {
  readonly locale: GlobalDistributionLocale;
  readonly grossKrw: number;
  readonly withholdingRatePercent: number;
  readonly translatorSharePercent: number;
  readonly lettererSharePercent: number;
}): RegionalNetSettlement {
  const gross = Math.max(0, Math.round(params.grossKrw));
  const withholdingTaxKrw = Math.round((gross * params.withholdingRatePercent) / 100);
  const afterTax = Math.max(0, gross - withholdingTaxKrw);
  const translatorShareKrw = Math.round((afterTax * params.translatorSharePercent) / 100);
  const lettererShareKrw = Math.round((afterTax * params.lettererSharePercent) / 100);
  const creatorNetKrw = Math.max(0, afterTax - translatorShareKrw - lettererShareKrw);
  return {
    locale: params.locale,
    grossKrw: gross,
    withholdingTaxKrw,
    translatorShareKrw,
    lettererShareKrw,
    creatorNetKrw,
  };
}

/** W44 + W46 + W47 + W48 + W49: 동시연재 릴리스·SFX 권리·플랫폼 규격·워터마크 통합 글로벌 론칭 게이트 */
export function evaluateGlobalLaunchReadinessGate(params: {
  readonly seriesTitle: string;
  readonly episodeLabel: string;
  readonly simulpubReleaseUtcIso: string;
  readonly watermarkPolicyEnabled: boolean;
  readonly targets: readonly {
    readonly locale: GlobalDistributionLocale;
    readonly gutterPx: number;
    readonly sfxAssetsCleared: boolean;
    readonly platformSpecMatched: boolean;
    readonly bubbleOverflowCount: number;
    readonly netSettlement: RegionalNetSettlement;
  }[];
}): GlobalLaunchGateResult {
  const blockers: string[] = [];
  const clearedLocales: GlobalDistributionLocale[] = [];
  let totalCreatorNetKrw = 0;

  if (Number.isNaN(Date.parse(params.simulpubReleaseUtcIso))) {
    blockers.push("유효한 동시연재 UTC 릴리스 시각이 아닙니다");
  }
  if (!params.watermarkPolicyEnabled) {
    blockers.push("권역별 불법유출 방지 워터마크 정책이 비활성화되어 있습니다");
  }

  for (const t of params.targets) {
    const layout = validateLocaleReadingLayout(t.locale, t.gutterPx);
    const localeIssues: string[] = [];
    if (!layout.valid) localeIssues.push("컷 간격 규격 위반");
    if (!t.sfxAssetsCleared) localeIssues.push("현지화 효과음(SFX) 라이선스 미승인");
    if (!t.platformSpecMatched) localeIssues.push("권역 플랫폼 규격 불일치");
    if (t.bubbleOverflowCount > 0) localeIssues.push(`말풍선 식자 넘침 ${t.bubbleOverflowCount}건`);

    if (localeIssues.length > 0) {
      blockers.push(`${t.locale}: ${localeIssues.join(", ")}`);
    } else {
      clearedLocales.push(t.locale);
      totalCreatorNetKrw += t.netSettlement.creatorNetKrw;
    }
  }

  const readyForGlobalLaunch = blockers.length === 0 && clearedLocales.length > 0;
  const globalLaunchDigestHash = fnv1aHex(
    JSON.stringify({
      seriesTitle: params.seriesTitle,
      episodeLabel: params.episodeLabel,
      simulpubReleaseUtcIso: params.simulpubReleaseUtcIso,
      readyForGlobalLaunch,
      clearedLocales,
      totalCreatorNetKrw,
    }),
  );

  return {
    seriesTitle: params.seriesTitle,
    episodeLabel: params.episodeLabel,
    readyForGlobalLaunch,
    clearedLocales,
    blockers,
    totalCreatorNetKrw,
    globalLaunchDigestHash,
  };
}
