/**
 * 다국어 웹툰 식자 오버플로우·일본어 세로쓰기 구두점·SFX 배경 복원 감사 엔진 및
 * 플랫폼 납품 0-Defect 출고 게이트(규격·용량·sRGB·Rights BOM·금칙어/상표·치명결함·붉은펜) 판정기.
 */

import {
  WEBTOON_PLATFORM_SPECS,
  type WebtoonPlatformId,
  type WebtoonPlatformSpec,
} from "./smart-safe-slice-and-mobile-qa";

export type LetteringTargetLang = "EN" | "JA" | "ID" | "ES" | "TH";

export interface LanguageWidthFactorSpec {
  readonly lang: LetteringTargetLang;
  readonly labelKo: string;
  readonly labelEn: string;
  /** 한국어 원문 대비 평균 문장 폭 팽창 계수 */
  readonly koWidthMultiplier: number;
  /** 단어 줄바꿈/성조 스택 여백 보정 계수 */
  readonly wrapSlackFactor: number;
  readonly lineHeightFactor: number;
  readonly defaultVertical: boolean;
}

export const MULTILINGUAL_WIDTH_FACTORS: Readonly<Record<LetteringTargetLang, LanguageWidthFactorSpec>> = {
  EN: { lang: "EN", labelKo: "영어 (EN)", labelEn: "English (EN)", koWidthMultiplier: 1.32, wrapSlackFactor: 1.18, lineHeightFactor: 1.35, defaultVertical: false },
  JA: { lang: "JA", labelKo: "일본어 (JA)", labelEn: "Japanese (JA)", koWidthMultiplier: 1.08, wrapSlackFactor: 1.05, lineHeightFactor: 1.35, defaultVertical: true },
  ID: { lang: "ID", labelKo: "인도네시아어 (ID)", labelEn: "Indonesian (ID)", koWidthMultiplier: 1.45, wrapSlackFactor: 1.24, lineHeightFactor: 1.35, defaultVertical: false },
  ES: { lang: "ES", labelKo: "스페인어 (ES)", labelEn: "Spanish (ES)", koWidthMultiplier: 1.38, wrapSlackFactor: 1.2, lineHeightFactor: 1.35, defaultVertical: false },
  TH: { lang: "TH", labelKo: "태국어 (TH)", labelEn: "Thai (TH)", koWidthMultiplier: 1.22, wrapSlackFactor: 1.14, lineHeightFactor: 1.55, defaultVertical: false },
};

export const LETTERING_TARGET_LANGS: readonly LetteringTargetLang[] = ["EN", "JA", "ID", "ES", "TH"];

export type LetteringIssueCode = "overflow" | "vertical-punct" | "sfx-inpaint-missing";
export type LetteringIssueSeverity = "critical" | "warning";

export interface MultilingualLetteringEntry {
  readonly id: string;
  readonly cutNumber: number;
  readonly kind: "balloon" | "sfx";
  readonly sourceKo: string;
  readonly targetLang: LetteringTargetLang;
  readonly translatedText: string;
  readonly balloonWidthPx: number;
  readonly balloonHeightPx: number;
  readonly fontSizePx: number;
  /** 세로쓰기 여부 (JA 말풍선 기본값 true, 그 외 기본값 false) */
  readonly isVertical?: boolean;
  /** OpenType vert 세로 구두점 회전 적용 여부 (기본값 true) */
  readonly verticalGlyphRotationApplied?: boolean;
  /** SFX 배경 복원(인페인팅) 완료 여부 */
  readonly inpaintReady?: boolean;
}

export interface LetteringAuditIssue {
  readonly id: string;
  readonly entryId: string;
  readonly cutNumber: number;
  readonly targetLang: LetteringTargetLang;
  readonly kind: "balloon" | "sfx";
  readonly code: LetteringIssueCode;
  readonly severity: LetteringIssueSeverity;
  readonly occupancyRatio: number;
  readonly expansionFactorVsKo: number;
  readonly messageKo: string;
  readonly messageEn: string;
  readonly suggestionKo: string;
  readonly suggestionEn: string;
}

export interface LetteringEntryMetric {
  readonly entryId: string;
  readonly cutNumber: number;
  readonly targetLang: LetteringTargetLang;
  readonly kind: "balloon" | "sfx";
  readonly requiredEm: number;
  readonly capacityEm: number;
  readonly occupancyRatio: number;
  readonly expansionFactorVsKo: number;
  readonly issueCodes: readonly LetteringIssueCode[];
}

export interface MultilingualLetteringAuditResult {
  readonly auditedEntryCount: number;
  readonly issues: readonly LetteringAuditIssue[];
  readonly countsByCode: Readonly<Record<LetteringIssueCode, number>>;
  readonly countsByLang: Readonly<Record<LetteringTargetLang, number>>;
  readonly entryMetrics: readonly LetteringEntryMetric[];
  readonly criticalCount: number;
  readonly warningCount: number;
  readonly passed: boolean;
}

function measureVisualEmUnits(text: string): number {
  let total = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === "\n" || ch === "\r") continue;
    if (ch === " " || ch === "\t") {
      total += 0.32;
      continue;
    }
    // 태국어 결합 모음·성조 부호는 가로 폭을 차지하지 않는다.
    if (code === 0x0e31 || (code >= 0x0e34 && code <= 0x0e3a) || (code >= 0x0e47 && code <= 0x0e4e)) continue;
    if (code >= 0x0e00 && code <= 0x0e7f) {
      total += 0.68;
      continue;
    }
    if (
      (code >= 0x1100 && code <= 0x11ff) ||
      (code >= 0x3000 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0xff00 && code <= 0xffef) ||
      ch === "…" ||
      ch === "—"
    ) {
      total += 1.0;
      continue;
    }
    total += code >= 0x41 && code <= 0x5a ? 0.68 : 0.56;
  }
  return total;
}

function computeBalloonCapacityEm(
  widthPx: number,
  heightPx: number,
  fontSizePx: number,
  lineHeightFactor: number,
  isVertical: boolean,
): number {
  const safeFont = Number.isFinite(fontSizePx) && fontSizePx > 0 ? fontSizePx : 18;
  const safeW = Number.isFinite(widthPx) && widthPx > 0 ? widthPx : safeFont * 4;
  const safeH = Number.isFinite(heightPx) && heightPx > 0 ? heightPx : safeFont * 4;

  if (isVertical) {
    const usableHeight = Math.max(safeFont, safeH * 0.84);
    const maxCols = Math.max(1, Math.floor((safeW * 0.82) / (safeFont * lineHeightFactor)));
    return (usableHeight / safeFont) * maxCols;
  }
  const usableWidth = Math.max(safeFont, safeW * 0.82);
  const maxLines = Math.max(1, Math.floor((safeH * 0.82) / (safeFont * lineHeightFactor)));
  return (usableWidth / safeFont) * maxLines;
}

function hasOddContiguousRun(text: string, targetChar: string): boolean {
  let run = 0;
  for (const ch of text) {
    if (ch === targetChar) {
      run += 1;
    } else {
      if (run % 2 === 1) return true;
      run = 0;
    }
  }
  return run % 2 === 1;
}

function inspectJapaneseVerticalPunctuation(
  text: string,
  verticalGlyphRotationApplied: boolean,
): { readonly hasIssue: boolean; readonly reasonsKo: readonly string[]; readonly reasonsEn: readonly string[] } {
  const reasonsKo: string[] = [];
  const reasonsEn: string[] = [];

  if (/["“”]/u.test(text)) {
    reasonsKo.push("가로 따옴표 대신 세로 낫표「」 사용 필요");
    reasonsEn.push("Replace horizontal quotes with Japanese corner brackets 「」");
  }
  if (/\.{2,}/u.test(text)) {
    reasonsKo.push("ASCII 마침표(...) 대신 2배 말줄임표(……) 사용 필요");
    reasonsEn.push("Replace ASCII dots (...) with paired vertical ellipsis (……)");
  }
  if (/--+|~~+/u.test(text)) {
    reasonsKo.push("ASCII 대시(--) 대신 2배 전각 대시(——) 사용 필요");
    reasonsEn.push("Replace ASCII dashes (--) with paired em-dash (——)");
  }
  if (/[()[\]]/u.test(text)) {
    reasonsKo.push("반각 괄호 대신 전각/세로 괄호 사용 필요");
    reasonsEn.push("Replace half-width brackets with vertical-safe full-width brackets");
  }

  const openCorner = (text.match(/「/gu) ?? []).length;
  const closeCorner = (text.match(/」/gu) ?? []).length;
  const openDouble = (text.match(/『/gu) ?? []).length;
  const closeDouble = (text.match(/』/gu) ?? []).length;
  if (openCorner !== closeCorner || openDouble !== closeDouble) {
    reasonsKo.push("낫표「」·『』 여닫힘 짝 불일치");
    reasonsEn.push("Unmatched Japanese corner brackets 「」 / 『』");
  }

  if (hasOddContiguousRun(text, "…")) {
    reasonsKo.push("단독 말줄임표(…) 발견 — 일본어 세로쓰기는 2연속(……) 권장");
    reasonsEn.push("Single ellipsis (…) found — Japanese vertical standard uses paired ……");
  }
  if (hasOddContiguousRun(text, "—")) {
    reasonsKo.push("단독 대시(—) 발견 — 일본어 세로쓰기는 2연속(——) 권장");
    reasonsEn.push("Single em-dash (—) found — Japanese vertical standard uses paired ——");
  }
  if (!verticalGlyphRotationApplied && /[「」『』…—ー]/u.test(text)) {
    reasonsKo.push("「」…— 구두점의 OpenType vert 세로 회전 미적용");
    reasonsEn.push("OpenType vert rotation missing for 「」…— vertical punctuation");
  }
  return { hasIssue: reasonsKo.length > 0, reasonsKo, reasonsEn };
}

/**
 * 일본어 세로쓰기 구두점 오류를 표준 「」 · …… · —— 형식으로 자동 교정한다.
 */
export function normalizeJapaneseVerticalPunctuation(text: string): string {
  let fixed = text
    .replace(/“([^”]+)”/gu, "「$1」")
    .replace(/"([^"]+)"/gu, "「$1」")
    .replace(/\.{2,}/gu, "……")
    .replace(/--+/gu, "——")
    .replace(/\(/gu, "（")
    .replace(/\)/gu, "）")
    .replace(/\[/gu, "「")
    .replace(/\]/gu, "」");

  fixed = fixed.replace(/…+/gu, (match) => (match.length % 2 === 1 ? `${match}…` : match));
  fixed = fixed.replace(/—+/gu, (match) => (match.length % 2 === 1 ? `${match}—` : match));

  const openCorner = (fixed.match(/「/gu) ?? []).length;
  const closeCorner = (fixed.match(/」/gu) ?? []).length;
  if (openCorner > closeCorner) {
    fixed = `${fixed}${"」".repeat(openCorner - closeCorner)}`;
  }
  return fixed;
}

/**
 * KO 원문 대비 EN/JA/ID/ES/TH 번역문의 글자 폭 팽창 오버플로우,
 * 일본어 세로쓰기 구두점(「」…—), SFX 배경 복원(inpaintReady) 누락을 일괄 검수한다.
 */
export function auditMultilingualLetteringOverflow(
  entries: readonly MultilingualLetteringEntry[],
): MultilingualLetteringAuditResult {
  const issues: LetteringAuditIssue[] = [];
  const entryMetrics: LetteringEntryMetric[] = [];
  const countsByCode: Record<LetteringIssueCode, number> = {
    overflow: 0,
    "vertical-punct": 0,
    "sfx-inpaint-missing": 0,
  };
  const countsByLang: Record<LetteringTargetLang, number> = { EN: 0, JA: 0, ID: 0, ES: 0, TH: 0 };

  for (const entry of entries) {
    const langSpec = MULTILINGUAL_WIDTH_FACTORS[entry.targetLang];
    const isVertical = entry.isVertical ?? (entry.kind === "balloon" && langSpec.defaultVertical);
    const sourceKoEm = measureVisualEmUnits(entry.sourceKo);
    const translatedRawEm = measureVisualEmUnits(entry.translatedText);
    const requiredEm = Number((translatedRawEm * langSpec.wrapSlackFactor).toFixed(2));
    const capacityEm = Number(
      computeBalloonCapacityEm(
        entry.balloonWidthPx,
        entry.balloonHeightPx,
        entry.fontSizePx,
        langSpec.lineHeightFactor,
        isVertical,
      ).toFixed(2),
    );
    const occupancyRatio = capacityEm > 0 ? Number((requiredEm / capacityEm).toFixed(2)) : 0;
    const expansionFactorVsKo = sourceKoEm > 0
      ? Number((requiredEm / sourceKoEm).toFixed(2))
      : langSpec.koWidthMultiplier;
    const entryCodes: LetteringIssueCode[] = [];

    if (occupancyRatio > 1.0) {
      const overflowPct = Math.round((occupancyRatio - 1) * 100);
      const recommendedFontPx = Math.max(11, Math.floor(entry.fontSizePx / Math.sqrt(occupancyRatio)));
      countsByCode.overflow += 1;
      countsByLang[entry.targetLang] += 1;
      entryCodes.push("overflow");
      issues.push({
        id: `overflow-${entry.id}-${entry.targetLang}`,
        entryId: entry.id,
        cutNumber: entry.cutNumber,
        targetLang: entry.targetLang,
        kind: entry.kind,
        code: "overflow",
        severity: occupancyRatio > 1.25 ? "critical" : "warning",
        occupancyRatio,
        expansionFactorVsKo,
        messageKo: `컷 #${entry.cutNumber} [${entry.targetLang}] 말풍선 수용량 ${Math.round(occupancyRatio * 100)}% (+${overflowPct}% 넘침 · KO 대비 ${expansionFactorVsKo}배)`,
        messageEn: `Cut #${entry.cutNumber} [${entry.targetLang}] balloon fill ${Math.round(occupancyRatio * 100)}% (+${overflowPct}% overflow · ${expansionFactorVsKo}x vs KO)`,
        suggestionKo: `말풍선 너비를 약 ${Math.min(60, Math.max(15, overflowPct))}% 확장하거나 폰트를 ${recommendedFontPx}px로 조정하세요.`,
        suggestionEn: `Expand balloon width by ~${Math.min(60, Math.max(15, overflowPct))}% or adjust font size to ${recommendedFontPx}px.`,
      });
    }

    if (entry.targetLang === "JA" && isVertical) {
      const punctCheck = inspectJapaneseVerticalPunctuation(
        entry.translatedText,
        entry.verticalGlyphRotationApplied ?? true,
      );
      if (punctCheck.hasIssue) {
        countsByCode["vertical-punct"] += 1;
        countsByLang.JA += 1;
        entryCodes.push("vertical-punct");
        issues.push({
          id: `vertical-punct-${entry.id}-JA`,
          entryId: entry.id,
          cutNumber: entry.cutNumber,
          targetLang: "JA",
          kind: entry.kind,
          code: "vertical-punct",
          severity: "warning",
          occupancyRatio,
          expansionFactorVsKo,
          messageKo: `컷 #${entry.cutNumber} [JA 세로쓰기] ${punctCheck.reasonsKo.join(" / ")}`,
          messageEn: `Cut #${entry.cutNumber} [JA Vertical] ${punctCheck.reasonsEn.join(" / ")}`,
          suggestionKo: `일본어 세로쓰기 표준 구두점(「」 · …… · ——)과 OpenType vert 회전을 적용하세요.`,
          suggestionEn: `Apply Japanese vertical punctuation standard (「」, ……, ——) with OpenType vert rotation.`,
        });
      }
    }

    if (entry.kind === "sfx" && entry.inpaintReady !== true) {
      countsByCode["sfx-inpaint-missing"] += 1;
      countsByLang[entry.targetLang] += 1;
      entryCodes.push("sfx-inpaint-missing");
      issues.push({
        id: `sfx-inpaint-${entry.id}-${entry.targetLang}`,
        entryId: entry.id,
        cutNumber: entry.cutNumber,
        targetLang: entry.targetLang,
        kind: "sfx",
        code: "sfx-inpaint-missing",
        severity: "critical",
        occupancyRatio,
        expansionFactorVsKo,
        messageKo: `컷 #${entry.cutNumber} [${entry.targetLang} SFX] 원문 효과음 제거 및 배경 복원(inpaintReady) 누락`,
        messageEn: `Cut #${entry.cutNumber} [${entry.targetLang} SFX] Missing source SFX cleanup & background inpainting (inpaintReady=false)`,
        suggestionKo: `번역 SFX 배치 전에 원본 한글 효과음 영역의 배경 인페인팅을 완료하고 검수 체크를 활성화하세요.`,
        suggestionEn: `Complete background restoration behind the Korean SFX before placing translated lettering.`,
      });
    }

    entryMetrics.push({
      entryId: entry.id,
      cutNumber: entry.cutNumber,
      targetLang: entry.targetLang,
      kind: entry.kind,
      requiredEm,
      capacityEm,
      occupancyRatio,
      expansionFactorVsKo,
      issueCodes: entryCodes,
    });
  }

  const criticalCount = issues.filter((item) => item.severity === "critical").length;
  return {
    auditedEntryCount: entries.length,
    issues,
    countsByCode,
    countsByLang,
    entryMetrics,
    criticalCount,
    warningCount: issues.length - criticalCount,
    passed: issues.length === 0,
  };
}

// ============================================================================
// 0-Defect 플랫폼 출고 게이트 (규격 · 용량 · sRGB · Rights BOM · 금칙어/상표 · 결함/붉은펜)
// ============================================================================

export type ExportColorSpace = "sRGB" | "CMYK" | "Display-P3" | "AdobeRGB" | "Unknown";
export type RightsBomLicenseType = "commercial-cleared" | "cc0" | "personal-only" | "unverified" | "restricted";

export interface RightsBomAssetRecord {
  readonly assetId: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly licenseType: RightsBomLicenseType;
  readonly commercialAllowed: boolean;
}

export interface ZeroDefectPlatformGateInput {
  readonly platformId: WebtoonPlatformId;
  readonly exportWidthPx: number;
  readonly maxSliceHeightPx?: number;
  readonly maxSliceFileSizeMb: number;
  readonly colorSpace: ExportColorSpace;
  readonly sliceAccidentCount?: number;
  readonly rightsBomAssets: readonly RightsBomAssetRecord[];
  readonly textSamples: readonly string[];
  readonly customRestrictedKeywords?: readonly string[];
  readonly criticalDefectCount: number;
  readonly missedRedpenCount: number;
  readonly warningCount?: number;
}

export type ZeroDefectGateCheckId =
  | "platform-dimensions"
  | "file-size-limit"
  | "color-space-srgb"
  | "rights-bom-clearance"
  | "restricted-keywords"
  | "critical-defects-zero"
  | "redpen-missed-zero";

export interface ZeroDefectGateCheckItem {
  readonly id: ZeroDefectGateCheckId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly passed: boolean;
  readonly blocking: boolean;
  readonly weight: number;
  readonly reasonKo: string;
  readonly reasonEn: string;
}

export interface ZeroDefectPlatformGateResult {
  readonly platform: WebtoonPlatformSpec;
  readonly readyToShip: boolean;
  readonly score: number;
  readonly passedCheckCount: number;
  readonly totalCheckCount: number;
  readonly blockingFailureCount: number;
  readonly checks: readonly ZeroDefectGateCheckItem[];
  readonly blockingReasonsKo: readonly string[];
  readonly blockingReasonsEn: readonly string[];
  readonly matchedRestrictedKeywords: readonly string[];
  readonly unauthorizedAssets: readonly RightsBomAssetRecord[];
}

export const DEFAULT_RESTRICTED_TRADEMARK_KEYWORDS: readonly string[] = [
  "스타벅스", "코카콜라", "아이폰", "나이키", "구찌", "디즈니", "포켓몬",
  "Starbucks", "Coca-Cola", "iPhone", "Nike", "Gucci", "Disney", "Pokemon",
  "FIXME", "TODO", "샘플워터마크", "SAMPLE_WATERMARK",
];

function isAssetCommercialCleared(asset: RightsBomAssetRecord): boolean {
  return asset.commercialAllowed && (asset.licenseType === "commercial-cleared" || asset.licenseType === "cc0");
}

function scanRestrictedKeywords(
  textSamples: readonly string[],
  customKeywords: readonly string[] = [],
): readonly string[] {
  const lexicon = [...DEFAULT_RESTRICTED_TRADEMARK_KEYWORDS, ...customKeywords]
    .map((kw) => kw.trim())
    .filter((kw) => kw.length > 0);
  const combined = textSamples.join("\n").toLowerCase();
  const matched: string[] = [];
  const seen = new Set<string>();

  for (const keyword of lexicon) {
    const normalized = keyword.toLowerCase();
    if (!seen.has(normalized) && combined.includes(normalized)) {
      seen.add(normalized);
      matched.push(keyword);
    }
  }
  return matched;
}

/**
 * 플랫폼 납품 규격(가로폭·슬라이스 높이·용량·sRGB), Rights BOM 상업 라이선스,
 * 금칙어/상표 의심 키워드, 치명 결함 0건, 붉은펜 누락 0건을 종합 판정한다.
 */
export function evaluateZeroDefectPlatformGate(
  input: ZeroDefectPlatformGateInput,
): ZeroDefectPlatformGateResult {
  const platform = WEBTOON_PLATFORM_SPECS[input.platformId];
  const safeWidth = Number.isFinite(input.exportWidthPx) ? Math.round(input.exportWidthPx) : 0;
  const safeHeight = input.maxSliceHeightPx !== undefined && Number.isFinite(input.maxSliceHeightPx)
    ? Math.round(input.maxSliceHeightPx)
    : platform.maxSliceHeightPx;
  const safeFileSizeMb = Number.isFinite(input.maxSliceFileSizeMb) ? Number(input.maxSliceFileSizeMb.toFixed(2)) : 0;
  const safeSliceAccidents = Math.max(0, Math.round(input.sliceAccidentCount ?? 0));
  const safeCriticalDefects = Math.max(0, Math.round(input.criticalDefectCount));
  const safeMissedRedpen = Math.max(0, Math.round(input.missedRedpenCount));
  const safeWarnings = Math.max(0, Math.round(input.warningCount ?? 0));

  const widthOk = safeWidth === platform.widthPx;
  const heightOk = safeHeight > 0 && safeHeight <= platform.maxSliceHeightPx;
  const sliceAccidentOk = safeSliceAccidents === 0;
  const dimensionsOk = widthOk && heightOk && sliceAccidentOk;
  const fileSizeOk = safeFileSizeMb > 0 && safeFileSizeMb <= platform.maxFileSizeMb;
  const colorSpaceOk = input.colorSpace === platform.requiredColorSpace;
  const unauthorizedAssets = input.rightsBomAssets.filter((asset) => !isAssetCommercialCleared(asset));
  const rightsBomOk = unauthorizedAssets.length === 0;
  const matchedRestrictedKeywords = scanRestrictedKeywords(input.textSamples, input.customRestrictedKeywords);
  const keywordsOk = matchedRestrictedKeywords.length === 0;
  const criticalDefectsOk = safeCriticalDefects === 0;
  const redpenOk = safeMissedRedpen === 0;

  const dimFailKo: string[] = [];
  const dimFailEn: string[] = [];
  if (!widthOk) {
    dimFailKo.push(`가로폭 ${safeWidth}px (필수 ${platform.widthPx}px)`);
    dimFailEn.push(`width ${safeWidth}px (expected ${platform.widthPx}px)`);
  }
  if (!heightOk) {
    dimFailKo.push(`최대 슬라이스 높이 ${safeHeight}px (한도 ${platform.maxSliceHeightPx}px)`);
    dimFailEn.push(`max slice height ${safeHeight}px (limit ${platform.maxSliceHeightPx}px)`);
  }
  if (!sliceAccidentOk) {
    dimFailKo.push(`분할선 절단 사고 ${safeSliceAccidents}건`);
    dimFailEn.push(`${safeSliceAccidents} slice-cut accident(s)`);
  }

  const checks: readonly ZeroDefectGateCheckItem[] = [
    {
      id: "platform-dimensions",
      labelKo: "플랫폼 가로폭 · 슬라이스 규격",
      labelEn: "Platform Width & Slice Spec",
      passed: dimensionsOk,
      blocking: true,
      weight: 15,
      reasonKo: dimensionsOk
        ? `${platform.nameKo} 규격(${platform.widthPx}px × 최대 ${platform.maxSliceHeightPx.toLocaleString("ko-KR")}px · 절단 사고 0건) 일치`
        : `규격 불일치: ${dimFailKo.join(", ")}`,
      reasonEn: dimensionsOk
        ? `Matches ${platform.nameEn} spec (${platform.widthPx}px x <= ${platform.maxSliceHeightPx.toLocaleString("en-US")}px, 0 slice accidents)`
        : `Spec mismatch: ${dimFailEn.join(", ")}`,
    },
    {
      id: "file-size-limit",
      labelKo: "파일 용량 한도 (최대 2MB)",
      labelEn: "Slice File Size Limit (<= 2MB)",
      passed: fileSizeOk,
      blocking: true,
      weight: 15,
      reasonKo: fileSizeOk
        ? `최대 슬라이스 용량 ${safeFileSizeMb}MB (한도 ${platform.maxFileSizeMb}MB 이하)`
        : `용량 규격 초과/오류: ${safeFileSizeMb}MB (한도 ${platform.maxFileSizeMb}MB 이하 필수)`,
      reasonEn: fileSizeOk
        ? `Largest slice is ${safeFileSizeMb}MB (within ${platform.maxFileSizeMb}MB limit)`
        : `File size out of bounds: ${safeFileSizeMb}MB (must be > 0 and <= ${platform.maxFileSizeMb}MB)`,
    },
    {
      id: "color-space-srgb",
      labelKo: "웹 표준 색공간 (sRGB)",
      labelEn: "Web Color Space (sRGB)",
      passed: colorSpaceOk,
      blocking: true,
      weight: 10,
      reasonKo: colorSpaceOk
        ? "sRGB 색공간 프로파일 정상 적용"
        : `현재 색공간 '${input.colorSpace}' — 모바일 색 틀어짐 방지를 위해 sRGB 변환 필수`,
      reasonEn: colorSpaceOk
        ? "sRGB color profile verified"
        : `Current profile '${input.colorSpace}' — must convert to sRGB to prevent mobile color shift`,
    },
    {
      id: "rights-bom-clearance",
      labelKo: "Rights BOM 상업 라이선스 검증",
      labelEn: "Rights BOM Commercial Clearance",
      passed: rightsBomOk,
      blocking: true,
      weight: 20,
      reasonKo: rightsBomOk
        ? `등록 에셋 ${input.rightsBomAssets.length}종 전원 상업 연재 허가 완료`
        : `미허가 에셋 ${unauthorizedAssets.length}종 차단: ${unauthorizedAssets.map((a) => a.nameKo).join(", ")}`,
      reasonEn: rightsBomOk
        ? `All ${input.rightsBomAssets.length} BOM assets cleared for commercial publication`
        : `${unauthorizedAssets.length} unauthorized asset(s) blocked: ${unauthorizedAssets.map((a) => a.nameEn).join(", ")}`,
    },
    {
      id: "restricted-keywords",
      labelKo: "금칙어 · 상표권 의심 키워드 점검",
      labelEn: "Restricted / Trademark Keyword Scan",
      passed: keywordsOk,
      blocking: true,
      weight: 10,
      reasonKo: keywordsOk
        ? "금칙어·상표 의심 문구 및 미삭제 작업 표식 0건"
        : `의심 키워드 ${matchedRestrictedKeywords.length}건 검출: ${matchedRestrictedKeywords.join(", ")}`,
      reasonEn: keywordsOk
        ? "0 suspected trademark or placeholder keywords found"
        : `${matchedRestrictedKeywords.length} restricted keyword(s) detected: ${matchedRestrictedKeywords.join(", ")}`,
    },
    {
      id: "critical-defects-zero",
      labelKo: "치명 작화·식자 결함 0건",
      labelEn: "Zero Critical QA Defects",
      passed: criticalDefectsOk,
      blocking: true,
      weight: 15,
      reasonKo: criticalDefectsOk
        ? "치명 결함 0건 확인"
        : `미해소 치명 결함 ${safeCriticalDefects}건 존재 (출고 전 0건 해소 필수)`,
      reasonEn: criticalDefectsOk
        ? "0 critical defects confirmed"
        : `${safeCriticalDefects} unresolved critical defect(s) remaining`,
    },
    {
      id: "redpen-missed-zero",
      labelKo: "편집부 붉은펜 피드백 누락 0건",
      labelEn: "Zero Missed Redpen Reviews",
      passed: redpenOk,
      blocking: true,
      weight: 15,
      reasonKo: redpenOk
        ? "붉은펜 수정 요청 전수 반영 완료"
        : `미반영 붉은펜 피드백 ${safeMissedRedpen}건 누락`,
      reasonEn: redpenOk
        ? "All redpen editorial pins addressed"
        : `${safeMissedRedpen} redpen feedback item(s) still unaddressed`,
    },
  ];

  const baseScore = checks.reduce((sum, item) => sum + (item.passed ? item.weight : 0), 0);
  const score = Math.max(0, Math.min(100, baseScore - Math.min(10, safeWarnings * 2)));
  const blockingFailures = checks.filter((item) => item.blocking && !item.passed);

  return {
    platform,
    readyToShip: blockingFailures.length === 0,
    score,
    passedCheckCount: checks.filter((item) => item.passed).length,
    totalCheckCount: checks.length,
    blockingFailureCount: blockingFailures.length,
    checks,
    blockingReasonsKo: blockingFailures.map((item) => item.reasonKo),
    blockingReasonsEn: blockingFailures.map((item) => item.reasonEn),
    matchedRestrictedKeywords,
    unauthorizedAssets,
  };
}

// ============================================================================
// 기본 데모 데이터셋 (다국어 5개 언어 + 출고 게이트 차단→해소 시연용)
// ============================================================================

export const DEFAULT_MULTILINGUAL_LETTERING_ENTRIES: readonly MultilingualLetteringEntry[] = [
  {
    id: "ml-en-01", cutNumber: 3, kind: "balloon", sourceKo: "지금 당장 문 밖으로 피해!", targetLang: "EN",
    translatedText: "Get out through the emergency gate right now before the entire ceiling collapses on us!",
    balloonWidthPx: 180, balloonHeightPx: 120, fontSizePx: 20, isVertical: false,
  },
  {
    id: "ml-ja-01", cutNumber: 6, kind: "balloon", sourceKo: "잠깐… 정말 혼자 갈 거야—?", targetLang: "JA",
    translatedText: "\"待って...本当に一人で行くの--？\"",
    balloonWidthPx: 150, balloonHeightPx: 260, fontSizePx: 20, isVertical: true, verticalGlyphRotationApplied: true,
  },
  {
    id: "ml-id-01", cutNumber: 8, kind: "balloon", sourceKo: "절대 포기 못 해!", targetLang: "ID",
    translatedText: "Aku benar-benar tidak akan pernah menyerah begitu saja meskipun semua orang pergi!",
    balloonWidthPx: 175, balloonHeightPx: 115, fontSizePx: 20, isVertical: false,
  },
  {
    id: "ml-es-01", cutNumber: 11, kind: "balloon", sourceKo: "괜찮아, 내가 막을게.", targetLang: "ES",
    translatedText: "Tranquila, yo lo detendré.",
    balloonWidthPx: 240, balloonHeightPx: 130, fontSizePx: 18, isVertical: false,
  },
  {
    id: "ml-th-01", cutNumber: 14, kind: "sfx", sourceKo: "콰아앙!!", targetLang: "TH",
    translatedText: "ตูมมม!!",
    balloonWidthPx: 220, balloonHeightPx: 120, fontSizePx: 22, isVertical: false, inpaintReady: false,
  },
];

export const DEFAULT_BLOCKED_GATE_INPUT: ZeroDefectPlatformGateInput = {
  platformId: "naver",
  exportWidthPx: 800,
  maxSliceHeightPx: 20_000,
  maxSliceFileSizeMb: 2.8,
  colorSpace: "CMYK",
  sliceAccidentCount: 0,
  rightsBomAssets: [
    { assetId: "asset-bg-cafe", nameKo: "3D 모던 카페 배경 팩", nameEn: "3D Modern Cafe Pack", licenseType: "commercial-cleared", commercialAllowed: true },
    { assetId: "asset-font-demo", nameKo: "비상업용 테스트 손글씨 폰트", nameEn: "Non-Commercial Hand Font", licenseType: "personal-only", commercialAllowed: false },
  ],
  textSamples: ["Cut 04 cafe exterior sign: Starbucks Coffee", "Cut 12 lettering pass TODO"],
  criticalDefectCount: 2,
  missedRedpenCount: 1,
  warningCount: 0,
};

export function buildClearedGateInput(platformId: WebtoonPlatformId): ZeroDefectPlatformGateInput {
  const spec = WEBTOON_PLATFORM_SPECS[platformId];
  return {
    platformId,
    exportWidthPx: spec.widthPx,
    maxSliceHeightPx: spec.maxSliceHeightPx,
    maxSliceFileSizeMb: 1.65,
    colorSpace: "sRGB",
    sliceAccidentCount: 0,
    rightsBomAssets: [
      { assetId: "asset-bg-cafe", nameKo: "3D 모던 카페 배경 팩", nameEn: "3D Modern Cafe Pack", licenseType: "commercial-cleared", commercialAllowed: true },
      { assetId: "asset-font-open", nameKo: "상업용 웹툰 본문 서체 (CC0)", nameEn: "Commercial Webtoon Body Font (CC0)", licenseType: "cc0", commercialAllowed: true },
    ],
    textSamples: ["Cut 04 alley coffee shop exterior sign", "Final lettering and redpen pass complete."],
    criticalDefectCount: 0,
    missedRedpenCount: 0,
    warningCount: 0,
  };
}
