/**
 * Wave 107 — 다국어 웹툰 폰트 서브세팅·무두부(Zero-Tofu) 폴백 감사 엔진.
 *
 * - 5개 글로벌 연재 로캘(`ko-KR`, `ja-JP`, `en-US`, `fr-FR`, `ar-SA`)과
 *   명시적 쓰기 방향(`horizontal-ltr`, `vertical-rl`, `horizontal-rtl`)을 지원한다.
 * - `codePointAt` 기반 서로게이트 페어 안전 순회로 에피소드 대사의 모든 비공백
 *   유니코드 코드포인트를 폴백 체인 `[primaryFont, ...fallbackFonts]`에서 해석한다.
 * - Fail-Closed 출고 게이트: 두부 결손(`tofuCount > 0`), 빈 폴백 체인, 또는
 *   실제 사용 폰트의 임베딩/상업 연재 라이선스 미허용 시 `releaseReady = false`.
 * - 외부 의존성 없는 순수 동기 ES2017 FIPS 180-4 SHA-256 서브셋 매니페스트 해시를 생성한다.
 */

import { canonicalizeTypographyJson, sha256TypographyHex } from "./typography-manifest-sha256";

export { canonicalizeTypographyJson, sha256TypographyHex } from "./typography-manifest-sha256";

export type SerializationLocaleCode = "ko-KR" | "ja-JP" | "en-US" | "fr-FR" | "ar-SA";

export type LocaleWritingDirection = "horizontal-ltr" | "vertical-rl" | "horizontal-rtl";

export type CodePointRange = readonly [number, number];

export interface SerializationLocaleProfile {
  readonly locale: SerializationLocaleCode;
  readonly labelKo: string;
  readonly scriptTag: "Hang" | "Jpan" | "Latn" | "Arab";
  readonly writingDirection: LocaleWritingDirection;
  readonly isRtl: boolean;
  readonly defaultVertical: boolean;
}

export interface ComicFontDescriptor {
  readonly fontId: string;
  readonly familyName: string;
  readonly fullFontBytes: number;
  readonly avgBytesPerGlyph: number;
  readonly headerOverheadBytes: number;
  readonly supportedCodePointRanges: readonly CodePointRange[];
  readonly explicitCodePoints?: readonly number[];
  readonly embeddingLicenseAllowed: boolean;
  readonly commercialWebtoonAllowed: boolean;
  readonly licenseName?: string;
  readonly formatTag?: "woff2" | "otf" | "ttf";
  readonly locales?: readonly SerializationLocaleCode[];
}

export interface EpisodeLocalizedDialogueLine {
  readonly bubbleId: string;
  readonly panelId?: string;
  readonly speaker?: string;
  readonly text: string;
}

export interface EpisodeFontAuditInput {
  readonly episodeId: string;
  readonly episodeTitle?: string;
  readonly locale: SerializationLocaleCode;
  readonly dialogueLines: readonly EpisodeLocalizedDialogueLine[];
  readonly fallbackChain: readonly ComicFontDescriptor[];
  readonly writingDirectionOverride?: LocaleWritingDirection;
}

export interface MissingTofuEntry {
  readonly codePoint: number;
  readonly hexCode: string;
  readonly character: string;
  readonly occurrenceCount: number;
  readonly bubbleIds: readonly string[];
}

export interface FontSubsetPlanEntry {
  readonly fontId: string;
  readonly familyName: string;
  readonly chainIndex: number;
  readonly isUsed: boolean;
  readonly usedGlyphCount: number;
  readonly usedCodePoints: readonly number[];
  readonly usedUnicodeRangeCss: string;
  readonly fullFontBytes: number;
  readonly estimatedSubsetWoff2Bytes: number;
  readonly subsetSavingsBytes: number;
  readonly subsetSavingsPercent: number;
  readonly embeddingLicenseAllowed: boolean;
  readonly commercialWebtoonAllowed: boolean;
  readonly licenseCompliant: boolean;
  readonly licenseName: string;
}

export type FontAuditBlockingCode =
  | "EMPTY_FALLBACK_CHAIN"
  | "MISSING_TOFU_GLYPHS"
  | "EMBEDDING_LICENSE_DENIED"
  | "COMMERCIAL_WEBTOON_LICENSE_DENIED";

export interface FontLicenseViolation {
  readonly fontId: string;
  readonly familyName: string;
  readonly code: "EMBEDDING_LICENSE_DENIED" | "COMMERCIAL_WEBTOON_LICENSE_DENIED";
  readonly usedGlyphCount: number;
  readonly messageKo: string;
}

export interface FontAuditBlockingReason {
  readonly code: FontAuditBlockingCode;
  readonly messageKo: string;
  readonly fontId?: string;
  readonly count?: number;
}

export interface EpisodeFontSubsetAuditResult {
  readonly episodeId: string;
  readonly episodeTitle: string;
  readonly locale: SerializationLocaleCode;
  readonly localeProfile: SerializationLocaleProfile;
  readonly writingDirection: LocaleWritingDirection;
  readonly isRtl: boolean;
  readonly dialogueLineCount: number;
  readonly totalNonWhitespaceCodePoints: number;
  readonly uniqueCodePointCount: number;
  readonly coveredUniqueCodePointCount: number;
  readonly tofuCount: number;
  readonly totalTofuOccurrences: number;
  readonly missingTofuChars: readonly MissingTofuEntry[];
  readonly fontPlans: readonly FontSubsetPlanEntry[];
  readonly usedFontCount: number;
  readonly totalFullFontBytes: number;
  readonly totalChainFullFontBytes: number;
  readonly totalSubsetWoff2Bytes: number;
  readonly subsetSavingsBytes: number;
  readonly subsetSavingsPercent: number;
  readonly licenseViolations: readonly FontLicenseViolation[];
  readonly blockingReasons: readonly FontAuditBlockingReason[];
  readonly releaseReady: boolean;
  readonly subsetManifestSha256: string;
}

export interface MultiLocaleEpisodeBundleEntry {
  readonly locale: SerializationLocaleCode;
  readonly dialogueLines: readonly EpisodeLocalizedDialogueLine[];
  readonly fallbackChain?: readonly ComicFontDescriptor[];
}

export interface MultiLocaleEpisodeAuditReport {
  readonly episodeId: string;
  readonly episodeTitle: string;
  readonly localeReports: readonly EpisodeFontSubsetAuditResult[];
  readonly totalTofuCount: number;
  readonly totalFullFontBytes: number;
  readonly totalSubsetWoff2Bytes: number;
  readonly overallSubsetSavingsPercent: number;
  readonly allLocalesReleaseReady: boolean;
  readonly bundleManifestSha256: string;
}

export const SERIALIZATION_LOCALE_CODES: readonly SerializationLocaleCode[] = [
  "ko-KR",
  "ja-JP",
  "en-US",
  "fr-FR",
  "ar-SA",
];

export const SERIALIZATION_LOCALE_PROFILES: Readonly<
  Record<SerializationLocaleCode, SerializationLocaleProfile>
> = {
  "ko-KR": {
    locale: "ko-KR",
    labelKo: "한국어 (대한민국)",
    scriptTag: "Hang",
    writingDirection: "horizontal-ltr",
    isRtl: false,
    defaultVertical: false,
  },
  "ja-JP": {
    locale: "ja-JP",
    labelKo: "일본어 (일본 · 세로쓰기)",
    scriptTag: "Jpan",
    writingDirection: "vertical-rl",
    isRtl: false,
    defaultVertical: true,
  },
  "en-US": {
    locale: "en-US",
    labelKo: "영어 (미국)",
    scriptTag: "Latn",
    writingDirection: "horizontal-ltr",
    isRtl: false,
    defaultVertical: false,
  },
  "fr-FR": {
    locale: "fr-FR",
    labelKo: "프랑스어 (프랑스)",
    scriptTag: "Latn",
    writingDirection: "horizontal-ltr",
    isRtl: false,
    defaultVertical: false,
  },
  "ar-SA": {
    locale: "ar-SA",
    labelKo: "아랍어 (사우디아라비아 · RTL)",
    scriptTag: "Arab",
    writingDirection: "horizontal-rtl",
    isRtl: true,
    defaultVertical: false,
  },
};

export const DEFAULT_COMIC_FONT_REGISTRY: Readonly<Record<string, ComicFontDescriptor>> = {
  "ko-nanum-comic": {
    fontId: "ko-nanum-comic",
    familyName: "Nanum Webtoon Gothic",
    fullFontBytes: 18_400_000,
    avgBytesPerGlyph: 220,
    headerOverheadBytes: 4_096,
    supportedCodePointRanges: [
      [0x0021, 0x007e], [0x1100, 0x11ff], [0x2010, 0x2027],
      [0x3001, 0x301f], [0x3130, 0x318f], [0xac00, 0xd7a3], [0xff01, 0xff5e],
    ],
    embeddingLicenseAllowed: true,
    commercialWebtoonAllowed: true,
    licenseName: "SIL OFL 1.1",
    formatTag: "woff2",
    locales: ["ko-KR"],
  },
  "ja-antique-manga": {
    fontId: "ja-antique-manga",
    familyName: "Toon Antique Mincho-Gothic",
    fullFontBytes: 19_200_000,
    avgBytesPerGlyph: 245,
    headerOverheadBytes: 4_608,
    supportedCodePointRanges: [
      [0x0021, 0x007e], [0x2010, 0x2027], [0x3001, 0x303f],
      [0x3040, 0x309f], [0x30a0, 0x30ff], [0x4e00, 0x9fff], [0xff01, 0xffef],
    ],
    embeddingLicenseAllowed: true,
    commercialWebtoonAllowed: true,
    licenseName: "SIL OFL 1.1",
    formatTag: "woff2",
    locales: ["ja-JP"],
  },
  "latn-comic-dialogue": {
    fontId: "latn-comic-dialogue",
    familyName: "Atelier Comic Sans Pro",
    fullFontBytes: 1_850_000,
    avgBytesPerGlyph: 140,
    headerOverheadBytes: 2_400,
    supportedCodePointRanges: [
      [0x0021, 0x007e], [0x00a1, 0x00ff], [0x0100, 0x017f],
      [0x2010, 0x203a], [0x20ac, 0x20ac],
    ],
    embeddingLicenseAllowed: true,
    commercialWebtoonAllowed: true,
    licenseName: "SIL OFL 1.1",
    formatTag: "woff2",
    locales: ["en-US", "fr-FR"],
  },
  "ar-naskh-webtoon": {
    fontId: "ar-naskh-webtoon",
    familyName: "Atelier Naskh Comic",
    fullFontBytes: 3_600_000,
    avgBytesPerGlyph: 185,
    headerOverheadBytes: 3_072,
    supportedCodePointRanges: [
      [0x0021, 0x007e], [0x0600, 0x06ff], [0x0750, 0x077f],
      [0x2010, 0x2027], [0xfb50, 0xfdff], [0xfe70, 0xfefe],
    ],
    embeddingLicenseAllowed: true,
    commercialWebtoonAllowed: true,
    licenseName: "SIL OFL 1.1",
    formatTag: "woff2",
    locales: ["ar-SA"],
  },
  "fallback-comic-symbols": {
    fontId: "fallback-comic-symbols",
    familyName: "Toon Universal Comic Symbols",
    fullFontBytes: 6_400_000,
    avgBytesPerGlyph: 195,
    headerOverheadBytes: 2_800,
    supportedCodePointRanges: [
      [0x00a1, 0x00ff], [0x2000, 0x206f], [0x2190, 0x27bf],
      [0x3001, 0x303f], [0xff01, 0xffef], [0x1f300, 0x1f64f],
    ],
    embeddingLicenseAllowed: true,
    commercialWebtoonAllowed: true,
    licenseName: "Apache-2.0 / OFL",
    formatTag: "woff2",
    locales: ["ko-KR", "ja-JP", "en-US", "fr-FR", "ar-SA"],
  },
};

function roundPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;
}

function sanitizeNonNegativeInt(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value);
}

/** 코드포인트를 `U+XXXX` 또는 5~6자리 확장 `U+2000B` 형식으로 표기한다. */
export function formatUnicodeHex(codePoint: number): string {
  const safe = sanitizeNonNegativeInt(codePoint);
  const hex = safe.toString(16).toUpperCase();
  return `U+${hex.length < 4 ? hex.padStart(4, "0") : hex}`;
}

/** 공백·줄바꿈·비가시 제어 문자인지 판별한다. */
export function isWhitespaceOrIgnorableCodePoint(codePoint: number): boolean {
  if (codePoint <= 0x20) return true;
  if (codePoint >= 0x7f && codePoint <= 0x9f) return true;
  if (codePoint === 0x00a0 || codePoint === 0x061c || codePoint === 0x1680) return true;
  if (codePoint >= 0x2000 && codePoint <= 0x200f) return true;
  if (codePoint === 0x2028 || codePoint === 0x2029 || codePoint === 0x202f) return true;
  return codePoint === 0x205f || codePoint === 0x3000 || codePoint === 0xfeff;
}

/** 서로게이트 페어를 안전하게 유지하며 문자열의 유니코드 코드포인트 배열을 추출한다. */
export function extractUnicodeCodePoints(text: string): number[] {
  const result: number[] = [];
  let index = 0;
  while (index < text.length) {
    const cp = text.codePointAt(index);
    if (cp === undefined) break;
    result.push(cp);
    index += cp > 0xffff ? 2 : 1;
  }
  return result;
}

/** 정렬된 코드포인트 목록을 CSS `unicode-range` 표기로 압축한다. */
export function formatCssUnicodeRange(sortedCodePoints: readonly number[]): string {
  if (sortedCodePoints.length === 0) return "";
  const segments: string[] = [];
  let rangeStart = sortedCodePoints[0];
  let rangeEnd = sortedCodePoints[0];

  const flushRange = (): void => {
    segments.push(
      rangeStart === rangeEnd
        ? formatUnicodeHex(rangeStart)
        : `${formatUnicodeHex(rangeStart)}-${rangeEnd.toString(16).toUpperCase().padStart(4, "0")}`,
    );
  };

  for (let i = 1; i < sortedCodePoints.length; i += 1) {
    const current = sortedCodePoints[i];
    if (current === rangeEnd + 1) {
      rangeEnd = current;
    } else if (current > rangeEnd) {
      flushRange();
      rangeStart = current;
      rangeEnd = current;
    }
  }
  flushRange();
  return segments.join(", ");
}

/** 단일 폰트 디스크립터가 특정 유니코드 코드포인트를 지원하는지 확인한다. */
export function fontSupportsCodePoint(font: ComicFontDescriptor, codePoint: number): boolean {
  if (!Number.isInteger(codePoint) || codePoint < 0) return false;
  for (let i = 0; i < font.supportedCodePointRanges.length; i += 1) {
    const range = font.supportedCodePointRanges[i];
    if (codePoint >= range[0] && codePoint <= range[1]) return true;
  }
  if (font.explicitCodePoints !== undefined) {
    for (let i = 0; i < font.explicitCodePoints.length; i += 1) {
      if (font.explicitCodePoints[i] === codePoint) return true;
    }
  }
  return false;
}

/** 지정 로캘의 프로필(쓰기 방향·RTL 여부·스크립트)을 반환한다. */
export function getSerializationLocaleProfile(
  locale: SerializationLocaleCode,
): SerializationLocaleProfile {
  return SERIALIZATION_LOCALE_PROFILES[locale];
}

/** 로캘별 기본 무두부(Zero-Tofu) 웹툰 폰트 폴백 체인을 반환한다. */
export function createDefaultComicFontChainForLocale(
  locale: SerializationLocaleCode,
): readonly ComicFontDescriptor[] {
  const symbols = DEFAULT_COMIC_FONT_REGISTRY["fallback-comic-symbols"];
  switch (locale) {
    case "ko-KR":
      return [DEFAULT_COMIC_FONT_REGISTRY["ko-nanum-comic"], symbols];
    case "ja-JP":
      return [DEFAULT_COMIC_FONT_REGISTRY["ja-antique-manga"], symbols];
    case "en-US":
    case "fr-FR":
      return [DEFAULT_COMIC_FONT_REGISTRY["latn-comic-dialogue"], symbols];
    case "ar-SA":
      return [DEFAULT_COMIC_FONT_REGISTRY["ar-naskh-webtoon"], symbols];
  }
}

interface CodePointUsageRecord {
  occurrenceCount: number;
  bubbleIds: Set<string>;
}

/**
 * 에피소드 다국어 대사의 모든 글리프를 폴백 체인으로 해석해 무두부(Zero-Tofu)
 * 커버리지, WOFF2 서브셋 용량 절감률, 임베딩·상업 라이선스 준수, SHA-256 해시를 감사한다.
 */
export function auditEpisodeFontFallbackAndSubset(
  input: EpisodeFontAuditInput,
): EpisodeFontSubsetAuditResult {
  const localeProfile = getSerializationLocaleProfile(input.locale);
  const writingDirection = input.writingDirectionOverride ?? localeProfile.writingDirection;
  const isRtl = writingDirection === "horizontal-rtl";
  const episodeTitle = input.episodeTitle ?? input.episodeId;

  const usageByCodePoint = new Map<number, CodePointUsageRecord>();
  let totalNonWhitespaceCodePoints = 0;

  for (let lineIdx = 0; lineIdx < input.dialogueLines.length; lineIdx += 1) {
    const line = input.dialogueLines[lineIdx];
    const points = extractUnicodeCodePoints(line.text);
    for (let p = 0; p < points.length; p += 1) {
      const cp = points[p];
      if (isWhitespaceOrIgnorableCodePoint(cp)) continue;
      totalNonWhitespaceCodePoints += 1;
      const existing = usageByCodePoint.get(cp);
      if (existing !== undefined) {
        existing.occurrenceCount += 1;
        existing.bubbleIds.add(line.bubbleId);
      } else {
        const bubbleSet = new Set<string>();
        bubbleSet.add(line.bubbleId);
        usageByCodePoint.set(cp, { occurrenceCount: 1, bubbleIds: bubbleSet });
      }
    }
  }

  const sortedUniqueCodePoints = Array.from(usageByCodePoint.keys()).sort((a, b) => a - b);
  const assignedByFontIndex: number[][] = input.fallbackChain.map(() => []);
  const missingTofuChars: MissingTofuEntry[] = [];
  let totalTofuOccurrences = 0;
  let coveredUniqueCodePointCount = 0;

  for (let i = 0; i < sortedUniqueCodePoints.length; i += 1) {
    const cp = sortedUniqueCodePoints[i];
    let resolvedIndex = -1;
    for (let f = 0; f < input.fallbackChain.length; f += 1) {
      if (fontSupportsCodePoint(input.fallbackChain[f], cp)) {
        resolvedIndex = f;
        break;
      }
    }
    if (resolvedIndex >= 0) {
      assignedByFontIndex[resolvedIndex].push(cp);
      coveredUniqueCodePointCount += 1;
    } else {
      const usage = usageByCodePoint.get(cp);
      const occ = usage !== undefined ? usage.occurrenceCount : 1;
      const bubbles = usage !== undefined ? Array.from(usage.bubbleIds).sort() : [];
      totalTofuOccurrences += occ;
      missingTofuChars.push({
        codePoint: cp,
        hexCode: formatUnicodeHex(cp),
        character: String.fromCodePoint(cp),
        occurrenceCount: occ,
        bubbleIds: bubbles,
      });
    }
  }

  const fontPlans: FontSubsetPlanEntry[] = [];
  const licenseViolations: FontLicenseViolation[] = [];
  let usedFontCount = 0;
  let totalFullFontBytes = 0;
  let totalChainFullFontBytes = 0;
  let totalSubsetWoff2Bytes = 0;

  for (let f = 0; f < input.fallbackChain.length; f += 1) {
    const font = input.fallbackChain[f];
    const usedCodePoints = assignedByFontIndex[f];
    const usedGlyphCount = usedCodePoints.length;
    const isUsed = usedGlyphCount > 0;
    const fullFontBytes = sanitizeNonNegativeInt(font.fullFontBytes);
    const headerBytes = sanitizeNonNegativeInt(font.headerOverheadBytes);
    const avgBytes = Math.max(0, Number.isFinite(font.avgBytesPerGlyph) ? font.avgBytesPerGlyph : 0);
    totalChainFullFontBytes += fullFontBytes;

    const rawSubsetEstimate = isUsed ? Math.round(headerBytes + usedGlyphCount * avgBytes) : 0;
    const estimatedSubsetWoff2Bytes = isUsed
      ? fullFontBytes > 0
        ? Math.min(fullFontBytes, rawSubsetEstimate)
        : rawSubsetEstimate
      : 0;
    const subsetSavingsBytes = isUsed ? Math.max(0, fullFontBytes - estimatedSubsetWoff2Bytes) : 0;
    const subsetSavingsPercent =
      isUsed && fullFontBytes > 0 ? roundPercent((subsetSavingsBytes / fullFontBytes) * 100) : 0;
    const licenseCompliant = font.embeddingLicenseAllowed && font.commercialWebtoonAllowed;

    if (isUsed) {
      usedFontCount += 1;
      totalFullFontBytes += fullFontBytes;
      totalSubsetWoff2Bytes += estimatedSubsetWoff2Bytes;
      if (!font.embeddingLicenseAllowed) {
        licenseViolations.push({
          fontId: font.fontId,
          familyName: font.familyName,
          code: "EMBEDDING_LICENSE_DENIED",
          usedGlyphCount,
          messageKo: `${font.familyName}(${font.fontId}) 폰트에 웹폰트 서브셋 임베딩 허용 권한이 없습니다.`,
        });
      }
      if (!font.commercialWebtoonAllowed) {
        licenseViolations.push({
          fontId: font.fontId,
          familyName: font.familyName,
          code: "COMMERCIAL_WEBTOON_LICENSE_DENIED",
          usedGlyphCount,
          messageKo: `${font.familyName}(${font.fontId}) 폰트는 상업 웹툰 연재 배포가 허용되지 않았습니다.`,
        });
      }
    }

    fontPlans.push({
      fontId: font.fontId,
      familyName: font.familyName,
      chainIndex: f,
      isUsed,
      usedGlyphCount,
      usedCodePoints,
      usedUnicodeRangeCss: formatCssUnicodeRange(usedCodePoints),
      fullFontBytes,
      estimatedSubsetWoff2Bytes,
      subsetSavingsBytes,
      subsetSavingsPercent,
      embeddingLicenseAllowed: font.embeddingLicenseAllowed,
      commercialWebtoonAllowed: font.commercialWebtoonAllowed,
      licenseCompliant,
      licenseName: font.licenseName ?? "미기재",
    });
  }

  const subsetSavingsBytes = Math.max(0, totalFullFontBytes - totalSubsetWoff2Bytes);
  const subsetSavingsPercent =
    totalFullFontBytes > 0 ? roundPercent((subsetSavingsBytes / totalFullFontBytes) * 100) : 0;

  const blockingReasons: FontAuditBlockingReason[] = [];
  if (input.fallbackChain.length === 0) {
    blockingReasons.push({
      code: "EMPTY_FALLBACK_CHAIN",
      messageKo: "폰트 폴백 체인이 비어 있어 글리프를 해석할 수 없습니다.",
    });
  }
  if (missingTofuChars.length > 0) {
    blockingReasons.push({
      code: "MISSING_TOFU_GLYPHS",
      count: missingTofuChars.length,
      messageKo: `미지원 두부(Tofu) 문자 ${missingTofuChars.length}종(총 ${totalTofuOccurrences}회)이 검출되어 출고를 차단합니다.`,
    });
  }
  for (let i = 0; i < licenseViolations.length; i += 1) {
    const v = licenseViolations[i];
    blockingReasons.push({ code: v.code, fontId: v.fontId, count: v.usedGlyphCount, messageKo: v.messageKo });
  }

  const releaseReady =
    input.fallbackChain.length > 0 &&
    missingTofuChars.length === 0 &&
    licenseViolations.length === 0 &&
    blockingReasons.length === 0;

  const manifestPayload = {
    episodeId: input.episodeId,
    locale: input.locale,
    writingDirection,
    usedFonts: fontPlans
      .filter((entry) => entry.isUsed)
      .map((entry) => ({
        fontId: entry.fontId,
        usedCodePoints: entry.usedCodePoints,
        estimatedSubsetWoff2Bytes: entry.estimatedSubsetWoff2Bytes,
        embeddingLicenseAllowed: entry.embeddingLicenseAllowed,
        commercialWebtoonAllowed: entry.commercialWebtoonAllowed,
      })),
    missingCodePoints: missingTofuChars.map((entry) => entry.codePoint),
    releaseReady,
  };

  return {
    episodeId: input.episodeId,
    episodeTitle,
    locale: input.locale,
    localeProfile,
    writingDirection,
    isRtl,
    dialogueLineCount: input.dialogueLines.length,
    totalNonWhitespaceCodePoints,
    uniqueCodePointCount: sortedUniqueCodePoints.length,
    coveredUniqueCodePointCount,
    tofuCount: missingTofuChars.length,
    totalTofuOccurrences,
    missingTofuChars,
    fontPlans,
    usedFontCount,
    totalFullFontBytes,
    totalChainFullFontBytes,
    totalSubsetWoff2Bytes,
    subsetSavingsBytes,
    subsetSavingsPercent,
    licenseViolations,
    blockingReasons,
    releaseReady,
    subsetManifestSha256: sha256TypographyHex(canonicalizeTypographyJson(manifestPayload)),
  };
}

/** 5개 연재 로캘 등 다국어 번들을 일괄 감사하고 통합 서브셋 SHA-256 매니페스트를 생성한다. */
export function auditMultiLocaleEpisodeBundle(
  episodeId: string,
  episodeTitle: string,
  entries: readonly MultiLocaleEpisodeBundleEntry[],
): MultiLocaleEpisodeAuditReport {
  const localeReports: EpisodeFontSubsetAuditResult[] = [];
  let totalTofuCount = 0;
  let totalFullFontBytes = 0;
  let totalSubsetWoff2Bytes = 0;
  let allLocalesReleaseReady = entries.length > 0;

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const report = auditEpisodeFontFallbackAndSubset({
      episodeId,
      episodeTitle,
      locale: entry.locale,
      dialogueLines: entry.dialogueLines,
      fallbackChain: entry.fallbackChain ?? createDefaultComicFontChainForLocale(entry.locale),
    });
    localeReports.push(report);
    totalTofuCount += report.tofuCount;
    totalFullFontBytes += report.totalFullFontBytes;
    totalSubsetWoff2Bytes += report.totalSubsetWoff2Bytes;
    if (!report.releaseReady) allLocalesReleaseReady = false;
  }

  const overallSubsetSavingsPercent =
    totalFullFontBytes > 0
      ? roundPercent(((totalFullFontBytes - totalSubsetWoff2Bytes) / totalFullFontBytes) * 100)
      : 0;

  const bundlePayload = {
    episodeId,
    locales: localeReports.map((r) => ({
      locale: r.locale,
      releaseReady: r.releaseReady,
      subsetManifestSha256: r.subsetManifestSha256,
    })),
  };

  return {
    episodeId,
    episodeTitle,
    localeReports,
    totalTofuCount,
    totalFullFontBytes,
    totalSubsetWoff2Bytes,
    overallSubsetSavingsPercent,
    allLocalesReleaseReady,
    bundleManifestSha256: sha256TypographyHex(canonicalizeTypographyJson(bundlePayload)),
  };
}
