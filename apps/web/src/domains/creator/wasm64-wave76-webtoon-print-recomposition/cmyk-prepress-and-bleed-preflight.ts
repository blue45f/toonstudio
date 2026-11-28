/**
 * 인쇄용 CMYK 분판(GCR·UCR·TAC 총잉크 상한·순수 먹 K100 선화 보존),
 * 프리플라이트 검수(DPI·도련·제본 여백 말풍선 침범) 및
 * 재단선·레지스트레이션 마크·컬러바 조판 매니페스트 생성기.
 *
 * - 도공지(`coated-fogra39`, TAC 300%)·비도공 만화지(`uncoated-newsprint`, TAC 260%)·
 *   북미 오프셋(`web-offset-swop`, TAC 280%) 분판 프로파일을 제공한다.
 * - 순수 검정 선화는 `C=0, M=0, Y=0, K=100` 단색 먹판으로 보존하며,
 *   모든 픽셀에서 `C + M + Y + K <= tacLimitPercent`를 엄격히 보장한다.
 */

import type {
  PageSide,
  PublicationFormatId,
  ReadingDirection,
  RecomposedPrintPage,
  RecompositionResult,
  RectMm,
  SpineEdge,
} from "./vertical-to-print-page-solver";

export type PrepressCmykProfileId = "coated-fogra39" | "uncoated-newsprint" | "web-offset-swop";

export interface PrepressCmykProfile {
  readonly profileId: PrepressCmykProfileId;
  readonly labelKo: string;
  readonly tacLimitPercent: number;
  readonly gcrStrength: number;
  readonly ucrStrength: number;
  readonly blackStartRatio: number;
  readonly maxBlackPercent: number;
  readonly dotGainMidtonePercent: number;
}

export interface RgbColorInput {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface NamedRgbColorSample extends RgbColorInput {
  readonly id: string;
  readonly isLineart?: boolean;
}

export interface CmykSeparationOptions {
  readonly profileId?: PrepressCmykProfileId;
  readonly tacLimitPercent?: number;
  readonly gcrStrength?: number;
  readonly ucrStrength?: number;
  readonly preservePureBlackLineart?: boolean;
  readonly pureBlackLumaThreshold?: number;
  readonly isLineartHint?: boolean;
}

export interface PrepressCmykColor {
  readonly c: number;
  readonly m: number;
  readonly y: number;
  readonly k: number;
  readonly totalInkPercent: number;
  readonly rawTotalInkBeforeTacClamp: number;
  readonly tacLimitPercent: number;
  readonly wasTacClamped: boolean;
  readonly isKOnlyLineart: boolean;
  readonly gamutCompressionApplied: boolean;
  readonly profileId: PrepressCmykProfileId;
}

export interface PrepressColorAuditSample {
  readonly sampleId: string;
  readonly sourceRgb: RgbColorInput;
  readonly separatedCmyk: PrepressCmykColor;
}

export interface PrepressColorAuditReport {
  readonly profileId: PrepressCmykProfileId;
  readonly tacLimitPercent: number;
  readonly sampleCount: number;
  readonly maxTacPercent: number;
  readonly tacViolationCount: number;
  readonly rawTacOverLimitCount: number;
  readonly kOnlyLineartCount: number;
  readonly gamutCompressedCount: number;
  readonly samples: readonly PrepressColorAuditSample[];
}

export interface RawCmykInkSample {
  readonly sampleId: string;
  readonly pageNumber: number;
  readonly panelId?: string;
  readonly c: number;
  readonly m: number;
  readonly y: number;
  readonly k: number;
  readonly isLineart?: boolean;
}

export type PanelArtMode = "color" | "monochrome-lineart";
export type PrintPreflightSeverity = "error" | "warning";

export type PrintPreflightIssueCode =
  | "LOW_EFFECTIVE_DPI"
  | "LINEART_DPI_BELOW_600"
  | "BLEED_COVERAGE_INSUFFICIENT"
  | "SPINE_GUTTER_TEXT_INTRUSION"
  | "TRIM_SAFE_TEXT_INTRUSION"
  | "BALLOON_CLIPPED"
  | "FOCAL_SUBJECT_CLIPPED"
  | "PANEL_OVERLAP"
  | "TAC_LIMIT_EXCEEDED"
  | "FOUR_COLOR_BLACK_LINEART";

export interface PrintPreflightIssue {
  readonly code: PrintPreflightIssueCode;
  readonly severity: PrintPreflightSeverity;
  readonly pageNumber: number;
  readonly panelId?: string;
  readonly messageKo: string;
  readonly measuredValue: number;
  readonly thresholdValue: number;
  readonly unit: "dpi" | "mm" | "percent" | "count";
}

export interface PagePreflightSummary {
  readonly pageNumber: number;
  readonly passed: boolean;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly minEffectiveDpi: number;
  readonly spineIntrusionBalloonCount: number;
  readonly bleedDeficitPanelCount: number;
}

export interface PrintPreflightOptions {
  readonly cmykProfileId?: PrepressCmykProfileId;
  readonly tacLimitPercent?: number;
  readonly minColorDpi?: number;
  readonly recommendedLineartDpi?: number;
  readonly minBleedMm?: number;
  readonly panelColorSamples?: Readonly<Record<string, readonly NamedRgbColorSample[]>>;
  readonly panelArtModes?: Readonly<Record<string, PanelArtMode>>;
  readonly rawPreSeparatedCmykChecks?: readonly RawCmykInkSample[];
}

export interface PrintPreflightAuditReport {
  readonly formatId: PublicationFormatId;
  readonly cmykProfileId: PrepressCmykProfileId;
  readonly tacLimitPercent: number;
  readonly passed: boolean;
  readonly status: "ready-for-press" | "review-warnings" | "blocked-errors";
  readonly errorCount: number;
  readonly warningCount: number;
  readonly issues: readonly PrintPreflightIssue[];
  readonly pageSummaries: readonly PagePreflightSummary[];
  readonly minEffectiveDpiObserved: number;
  readonly maxTacPercentObserved: number;
  readonly colorAudit: PrepressColorAuditReport;
}

export interface PrintMarkLineMm {
  readonly id: string;
  readonly kind: "crop" | "bleed";
  readonly x1Mm: number;
  readonly y1Mm: number;
  readonly x2Mm: number;
  readonly y2Mm: number;
}

export interface RegistrationMarkMm {
  readonly id: string;
  readonly edge: "top" | "bottom" | "left" | "right";
  readonly centerXMm: number;
  readonly centerYMm: number;
  readonly radiusMm: number;
  readonly crosshairLengthMm: number;
}

export interface ColorBarPatchMm {
  readonly id: string;
  readonly label: string;
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
  readonly c: number;
  readonly m: number;
  readonly y: number;
  readonly k: number;
  readonly previewOklch: string;
}

export interface PrintImpositionPageSpec {
  readonly pageNumber: number;
  readonly pageSide: PageSide;
  readonly spineEdge: SpineEdge;
  readonly sheetWidthMm: number;
  readonly sheetHeightMm: number;
  readonly trimOriginOffsetXMm: number;
  readonly trimOriginOffsetYMm: number;
  readonly slugMarginMm: number;
  readonly cropMarks: readonly PrintMarkLineMm[];
  readonly bleedMarks: readonly PrintMarkLineMm[];
  readonly registrationMarks: readonly RegistrationMarkMm[];
  readonly colorBarPatches: readonly ColorBarPatchMm[];
  readonly slugCaptionText: string;
}

export interface ImpositionPressSheet {
  readonly sheetIndex: number;
  readonly leftPageNumber: number | null;
  readonly rightPageNumber: number | null;
  readonly readingDirection: ReadingDirection;
}

export interface PrintImpositionManifestOptions {
  readonly documentTitle?: string;
  readonly cmykProfileId?: PrepressCmykProfileId;
  readonly slugMarginMm?: number;
  readonly cropMarkLengthMm?: number;
}

export interface PrintImpositionManifest {
  readonly documentTitle: string;
  readonly formatId: PublicationFormatId;
  readonly readingDirection: ReadingDirection;
  readonly cmykProfileId: PrepressCmykProfileId;
  readonly tacLimitPercent: number;
  readonly pages: readonly PrintImpositionPageSpec[];
  readonly impositionSheets: readonly ImpositionPressSheet[];
}

const EPSILON = 1e-4;

export const PREPRESS_CMYK_PROFILES: Readonly<Record<PrepressCmykProfileId, PrepressCmykProfile>> = {
  "coated-fogra39": {
    profileId: "coated-fogra39", labelKo: "아트지·스노우지 도공지 단행본 (FOGRA39 / TAC 300%)",
    tacLimitPercent: 300, gcrStrength: 0.65, ucrStrength: 0.35,
    blackStartRatio: 0.1, maxBlackPercent: 95, dotGainMidtonePercent: 14,
  },
  "uncoated-newsprint": {
    profileId: "uncoated-newsprint", labelKo: "비도공 만화지·미색 모조지 (TAC 260%)",
    tacLimitPercent: 260, gcrStrength: 0.78, ucrStrength: 0.45,
    blackStartRatio: 0.08, maxBlackPercent: 90, dotGainMidtonePercent: 22,
  },
  "web-offset-swop": {
    profileId: "web-offset-swop", labelKo: "북미 웹 오프셋 그래픽노블 (SWOP v2 / TAC 280%)",
    tacLimitPercent: 280, gcrStrength: 0.68, ucrStrength: 0.4,
    blackStartRatio: 0.1, maxBlackPercent: 92, dotGainMidtonePercent: 18,
  },
};

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
const round2 = (value: number): number => Math.round(value * 100) / 100;
const floor2 = (value: number): number => Math.floor(value * 100 + 1e-9) / 100;
const round3 = (value: number): number => Math.round(value * 1000) / 1000;
const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

function defaultCmykProfileForFormat(formatId: PublicationFormatId): PrepressCmykProfileId {
  if (formatId === "jp-b6-manga") return "uncoated-newsprint";
  if (formatId === "us-graphic-novel") return "web-offset-swop";
  return "coated-fogra39";
}

/**
 * sRGB 색상을 인쇄용 CMYK(%)로 분판한다.
 * 순수 검정 선화는 K 단색(`C=0, M=0, Y=0, K=100`)으로 보존하고,
 * GCR/UCR + 2단계 TAC 상한 보정으로 `C + M + Y + K <= tacLimitPercent`를 보장한다.
 */
export function convertRgbToPrepressCmyk(
  rgb: RgbColorInput,
  options: CmykSeparationOptions = {}
): PrepressCmykColor {
  const profileId: PrepressCmykProfileId = options.profileId ?? "coated-fogra39";
  const profile = PREPRESS_CMYK_PROFILES[profileId];
  const tacLimitPercent = clamp(options.tacLimitPercent ?? profile.tacLimitPercent, 100, 400);
  const gcrStrength = clamp(options.gcrStrength ?? profile.gcrStrength, 0, 1);
  const ucrStrength = clamp(options.ucrStrength ?? profile.ucrStrength, 0, 1);
  const preservePureBlack = options.preservePureBlackLineart ?? true;
  const blackThresh = clamp(options.pureBlackLumaThreshold ?? 12, 0, 40);

  const r = clamp(rgb.r, 0, 255);
  const g = clamp(rgb.g, 0, 255);
  const b = clamp(rgb.b, 0, 255);
  const maxC = Math.max(r, g, b);
  const chroma = maxC - Math.min(r, g, b);

  // 1) 순수 검정 선화 및 무채색 스크린톤 K 단색 보존
  if (preservePureBlack && ((maxC <= blackThresh && chroma <= 8) || (Boolean(options.isLineartHint) && chroma <= 6))) {
    const kRaw = maxC <= 4 && chroma <= 2 ? 100 : round2(((255 - (r + g + b) / 3) / 255) * 100);
    const kCapped = round2(Math.min(kRaw, tacLimitPercent));
    return {
      c: 0, m: 0, y: 0, k: kCapped, totalInkPercent: kCapped,
      rawTotalInkBeforeTacClamp: round2(kRaw), tacLimitPercent,
      wasTacClamped: kRaw > tacLimitPercent, isKOnlyLineart: true,
      gamutCompressionApplied: false, profileId,
    };
  }

  // 2) sRGB 선형 광량 기반 감법 원색 변환 및 인쇄 망점 보정
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const effR = rn * 0.62 + Math.pow(srgbToLinear(rn), 0.52) * 0.38;
  const effG = gn * 0.62 + Math.pow(srgbToLinear(gn), 0.52) * 0.38;
  const effB = bn * 0.62 + Math.pow(srgbToLinear(bn), 0.52) * 0.38;
  const gamutCompressionApplied = (maxC > 0 ? chroma / maxC : 0) > 0.72 && maxC > 170;

  let c0 = clamp(1 - effR, 0, 1);
  let m0 = clamp(1 - effG, 0, 1);
  let y0 = clamp(1 - effB, 0, 1);
  const gainComp = 1 - (profile.dotGainMidtonePercent / 100) * 0.14;
  c0 = clamp(c0 * (0.94 + 0.06 * gainComp) + m0 * 0.04, 0, 1);
  m0 = clamp(m0 * (0.95 + 0.05 * gainComp) + y0 * 0.03, 0, 1);
  y0 = clamp(y0 * (0.96 + 0.04 * gainComp), 0, 1);

  // 3) GCR + UCR K판 생성 및 중성 회색 치환
  const gray = Math.min(c0, m0, y0);
  const blackCurve =
    gray <= profile.blackStartRatio
      ? 0
      : Math.pow((gray - profile.blackStartRatio) / Math.max(EPSILON, 1 - profile.blackStartRatio), 1.15);
  const gcrRep = gray * gcrStrength * (0.35 + 0.65 * blackCurve);
  const ucrRep = gray * ucrStrength * Math.max(0, (gray - 0.55) / 0.45) * 0.55;
  const maxKRatio = Math.min(profile.maxBlackPercent, tacLimitPercent) / 100;
  const kRatio = clamp(Math.max(gcrRep, gcrRep + ucrRep * (1 - gcrStrength)), 0, maxKRatio);

  let cPct = clamp((c0 - kRatio * 0.94) * 100, 0, 100);
  let mPct = clamp((m0 - kRatio * 0.88) * 100, 0, 100);
  let yPct = clamp((y0 - kRatio * 0.86) * 100, 0, 100);
  let kPct = clamp(kRatio * 100, 0, 100);
  const rawTotalInkBeforeTacClamp = round2(cPct + mPct + yPct + kPct);

  // 4) 총 잉크량(TAC) 상한 강제(추가 GCR 이관 후 CMY 비례 축소)
  let wasTacClamped = false;
  let total = cPct + mPct + yPct + kPct;
  if (total > tacLimitPercent) {
    wasTacClamped = true;
    const transfer = Math.min(
      Math.min(cPct, mPct, yPct),
      Math.max(0, Math.min(profile.maxBlackPercent, tacLimitPercent) - kPct),
      (total - tacLimitPercent) * 0.5
    );
    if (transfer > 0) {
      cPct -= transfer;
      mPct -= transfer;
      yPct -= transfer;
      kPct += transfer;
      total = cPct + mPct + yPct + kPct;
    }
    if (total > tacLimitPercent) {
      const cmySum = cPct + mPct + yPct;
      const allowedCmy = Math.max(0, tacLimitPercent - kPct);
      if (cmySum > EPSILON && allowedCmy < cmySum) {
        const ratio = allowedCmy / cmySum;
        cPct *= ratio;
        mPct *= ratio;
        yPct *= ratio;
      } else if (kPct > tacLimitPercent) {
        cPct = 0;
        mPct = 0;
        yPct = 0;
        kPct = tacLimitPercent;
      }
    }
  }

  let finalC = round2(cPct);
  let finalM = round2(mPct);
  let finalY = round2(yPct);
  let finalK = round2(kPct);
  if (round2(finalC + finalM + finalY + finalK) > tacLimitPercent) {
    finalC = floor2(cPct);
    finalM = floor2(mPct);
    finalY = floor2(yPct);
    finalK = floor2(kPct);
  }
  return {
    c: finalC, m: finalM, y: finalY, k: finalK,
    totalInkPercent: round2(finalC + finalM + finalY + finalK),
    rawTotalInkBeforeTacClamp, tacLimitPercent, wasTacClamped,
    isKOnlyLineart: false, gamutCompressionApplied, profileId,
  };
}

/** RGB 샘플 목록을 일괄 CMYK 분판하고 TAC 준수·K단색 선화 보존 통계를 집계한다. */
export function auditPrepressColorSeparation(
  samples: readonly NamedRgbColorSample[],
  options: CmykSeparationOptions = {}
): PrepressColorAuditReport {
  const profileId: PrepressCmykProfileId = options.profileId ?? "coated-fogra39";
  const tacLimitPercent = clamp(options.tacLimitPercent ?? PREPRESS_CMYK_PROFILES[profileId].tacLimitPercent, 100, 400);

  const audited: PrepressColorAuditSample[] = [];
  let maxTacPercent = 0;
  let tacViolationCount = 0;
  let rawTacOverLimitCount = 0;
  let kOnlyLineartCount = 0;
  let gamutCompressedCount = 0;

  for (const s of samples) {
    const separated = convertRgbToPrepressCmyk(s, {
      ...options, profileId, tacLimitPercent, isLineartHint: s.isLineart ?? options.isLineartHint,
    });
    audited.push({ sampleId: s.id, sourceRgb: { r: s.r, g: s.g, b: s.b }, separatedCmyk: separated });
    if (separated.totalInkPercent > maxTacPercent) maxTacPercent = separated.totalInkPercent;
    if (separated.totalInkPercent > tacLimitPercent + EPSILON) tacViolationCount += 1;
    if (separated.rawTotalInkBeforeTacClamp > tacLimitPercent + EPSILON) rawTacOverLimitCount += 1;
    if (separated.isKOnlyLineart) kOnlyLineartCount += 1;
    if (separated.gamutCompressionApplied) gamutCompressedCount += 1;
  }

  return {
    profileId, tacLimitPercent, sampleCount: audited.length, maxTacPercent: round2(maxTacPercent),
    tacViolationCount, rawTacOverLimitCount, kOnlyLineartCount, gamutCompressedCount, samples: audited,
  };
}

function computeBalloonSpineIntrusionMm(balloon: RectMm, page: RecomposedPrintPage): number {
  if (page.spineEdge === "left") return Math.max(0, page.liveSafeBoxMm.xMm - balloon.xMm);
  if (page.spineEdge === "right") {
    return Math.max(0, balloon.xMm + balloon.widthMm - (page.liveSafeBoxMm.xMm + page.liveSafeBoxMm.widthMm));
  }
  if (page.spineZoneMm) {
    return Math.max(
      0,
      Math.min(balloon.xMm + balloon.widthMm, page.spineZoneMm.xMm + page.spineZoneMm.widthMm) -
        Math.max(balloon.xMm, page.spineZoneMm.xMm)
    );
  }
  return 0;
}

function computeMinimumBleedDeficitMm(
  frame: RectMm,
  trim: RectMm,
  requiredBleedMm: number,
  isFullBleed: boolean
): number {
  if (requiredBleedMm <= 0) return 0;
  const kiss = 1.5;
  let deficit = 0;
  if (isFullBleed || frame.xMm <= trim.xMm + kiss) deficit = Math.max(deficit, requiredBleedMm - (trim.xMm - frame.xMm));
  if (isFullBleed || frame.xMm + frame.widthMm >= trim.xMm + trim.widthMm - kiss) {
    deficit = Math.max(deficit, requiredBleedMm - (frame.xMm + frame.widthMm - (trim.xMm + trim.widthMm)));
  }
  if (isFullBleed || frame.yMm <= trim.yMm + kiss) deficit = Math.max(deficit, requiredBleedMm - (trim.yMm - frame.yMm));
  if (isFullBleed || frame.yMm + frame.heightMm >= trim.yMm + trim.heightMm - kiss) {
    deficit = Math.max(deficit, requiredBleedMm - (frame.yMm + frame.heightMm - (trim.yMm + trim.heightMm)));
  }
  return deficit > EPSILON ? round3(deficit) : 0;
}

/** 리컴포지션된 단행본·전자책 전체를 인쇄 프리플라이트(DPI·도련·제본 여백·TAC·K100) 기준으로 감사한다. */
export function runPrintPreflightAudit(
  recomposition: RecompositionResult,
  options: PrintPreflightOptions = {}
): PrintPreflightAuditReport {
  const cmykProfileId = options.cmykProfileId ?? defaultCmykProfileForFormat(recomposition.format.formatId);
  const tacLimitPercent = clamp(options.tacLimitPercent ?? PREPRESS_CMYK_PROFILES[cmykProfileId].tacLimitPercent, 100, 400);
  const isPrintCmyk = recomposition.format.colorSpace === "cmyk";
  const minColorDpi = options.minColorDpi ?? (isPrintCmyk ? 300 : recomposition.format.dpi);
  const recLineartDpi = options.recommendedLineartDpi ?? 600;
  const minBleedMm = options.minBleedMm ?? recomposition.format.bleedMm;

  const issues: PrintPreflightIssue[] = [];
  const pageSummaries: PagePreflightSummary[] = [];
  let minDpiObserved = Number.POSITIVE_INFINITY;

  const allSamples: NamedRgbColorSample[] = [];
  if (options.panelColorSamples) {
    for (const key of Object.keys(options.panelColorSamples)) {
      const list = options.panelColorSamples[key];
      if (list) for (const item of list) allSamples.push(item);
    }
  }
  const colorAudit = auditPrepressColorSeparation(allSamples, { profileId: cmykProfileId, tacLimitPercent });
  let maxTacObserved = colorAudit.maxTacPercent;

  for (const page of recomposition.pages) {
    let pageErrors = 0;
    let pageWarnings = 0;
    let pageMinDpi = Number.POSITIVE_INFINITY;
    let spineIntrusionCount = 0;
    let bleedDeficitCount = 0;

    if (page.gazeFlow.overlapCount > 0) {
      pageErrors += 1;
      issues.push({
        code: "PANEL_OVERLAP", severity: "error", pageNumber: page.pageNumber,
        messageKo: `${page.pageNumber}쪽에서 컷 경계 겹침이 ${page.gazeFlow.overlapCount}건 발견되었습니다.`,
        measuredValue: page.gazeFlow.overlapCount, thresholdValue: 0, unit: "count",
      });
    }

    for (const panel of page.placedPanels) {
      pageMinDpi = Math.min(pageMinDpi, panel.effectiveDpi);
      minDpiObserved = Math.min(minDpiObserved, panel.effectiveDpi);
      const artMode: PanelArtMode = options.panelArtModes?.[panel.panelId] ?? "color";

      if (panel.effectiveDpi < minColorDpi - EPSILON) {
        pageErrors += 1;
        issues.push({
          code: "LOW_EFFECTIVE_DPI", severity: "error", pageNumber: page.pageNumber, panelId: panel.panelId,
          messageKo: `${page.pageNumber}쪽 컷(${panel.panelId}) 유효 해상도 ${panel.effectiveDpi} DPI가 최소 기준(${minColorDpi} DPI) 미만입니다.`,
          measuredValue: panel.effectiveDpi, thresholdValue: minColorDpi, unit: "dpi",
        });
      } else if (isPrintCmyk && artMode === "monochrome-lineart" && panel.effectiveDpi < recLineartDpi - EPSILON) {
        pageWarnings += 1;
        issues.push({
          code: "LINEART_DPI_BELOW_600", severity: "warning", pageNumber: page.pageNumber, panelId: panel.panelId,
          messageKo: `${page.pageNumber}쪽 흑백 선화 컷(${panel.panelId}) 해상도 ${panel.effectiveDpi} DPI가 권장 600 DPI 미만입니다.`,
          measuredValue: panel.effectiveDpi, thresholdValue: recLineartDpi, unit: "dpi",
        });
      }

      const bleedDeficit = computeMinimumBleedDeficitMm(panel.slotFrameMm, page.trimBoxMm, minBleedMm, panel.isFullBleed);
      if (bleedDeficit > EPSILON) {
        bleedDeficitCount += 1;
        pageErrors += 1;
        issues.push({
          code: "BLEED_COVERAGE_INSUFFICIENT", severity: "error", pageNumber: page.pageNumber, panelId: panel.panelId,
          messageKo: `${page.pageNumber}쪽 전면/가장자리 컷(${panel.panelId})의 도련이 기준(${minBleedMm}mm)보다 ${bleedDeficit}mm 부족합니다.`,
          measuredValue: round3(minBleedMm - bleedDeficit), thresholdValue: minBleedMm, unit: "mm",
        });
      }

      if (panel.balloonClippedCount > 0) {
        pageErrors += 1;
        issues.push({
          code: "BALLOON_CLIPPED", severity: "error", pageNumber: page.pageNumber, panelId: panel.panelId,
          messageKo: `${page.pageNumber}쪽 컷(${panel.panelId})에서 말풍선 ${panel.balloonClippedCount}개가 잘렸습니다.`,
          measuredValue: panel.balloonClippedCount, thresholdValue: 0, unit: "count",
        });
      }
      if (panel.focalSubjectClippedCount > 0) {
        pageErrors += 1;
        issues.push({
          code: "FOCAL_SUBJECT_CLIPPED", severity: "error", pageNumber: page.pageNumber, panelId: panel.panelId,
          messageKo: `${page.pageNumber}쪽 컷(${panel.panelId})의 핵심 피사체 영역이 잘렸습니다.`,
          measuredValue: panel.focalSubjectClippedCount, thresholdValue: 0, unit: "count",
        });
      }

      for (const balloon of panel.mappedSpeechBalloonsMm) {
        const intrusion = computeBalloonSpineIntrusionMm(balloon, page);
        if (intrusion > EPSILON) {
          spineIntrusionCount += 1;
          pageErrors += 1;
          issues.push({
            code: "SPINE_GUTTER_TEXT_INTRUSION", severity: "error", pageNumber: page.pageNumber, panelId: panel.panelId,
            messageKo: `${page.pageNumber}쪽 컷(${panel.panelId})의 말풍선이 안쪽 제본 여백을 ${round3(intrusion)}mm 침범했습니다.`,
            measuredValue: round3(intrusion), thresholdValue: 0, unit: "mm",
          });
        } else {
          const safe = page.liveSafeBoxMm;
          const outOfSafe =
            balloon.xMm < safe.xMm - EPSILON ||
            balloon.yMm < safe.yMm - EPSILON ||
            balloon.xMm + balloon.widthMm > safe.xMm + safe.widthMm + EPSILON ||
            balloon.yMm + balloon.heightMm > safe.yMm + safe.heightMm + EPSILON;
          if (outOfSafe) {
            pageWarnings += 1;
            issues.push({
              code: "TRIM_SAFE_TEXT_INTRUSION", severity: "warning", pageNumber: page.pageNumber, panelId: panel.panelId,
              messageKo: `${page.pageNumber}쪽 컷(${panel.panelId})의 말풍선이 외곽 안전 여백 경계에 근접했습니다.`,
              measuredValue: 1, thresholdValue: 0, unit: "count",
            });
          }
        }
      }
    }

    pageSummaries.push({
      pageNumber: page.pageNumber, passed: pageErrors === 0, errorCount: pageErrors, warningCount: pageWarnings,
      minEffectiveDpi: Number.isFinite(pageMinDpi) ? pageMinDpi : 0,
      spineIntrusionBalloonCount: spineIntrusionCount, bleedDeficitPanelCount: bleedDeficitCount,
    });
  }

  for (const raw of options.rawPreSeparatedCmykChecks ?? []) {
    const total = round2(raw.c + raw.m + raw.y + raw.k);
    maxTacObserved = Math.max(maxTacObserved, total);
    if (total > tacLimitPercent + EPSILON) {
      issues.push({
        code: "TAC_LIMIT_EXCEEDED", severity: "error", pageNumber: raw.pageNumber, panelId: raw.panelId,
        messageKo: `${raw.pageNumber}쪽 잉크 샘플(${raw.sampleId})의 총 잉크량 ${total}%가 상한(${tacLimitPercent}%)을 초과했습니다.`,
        measuredValue: total, thresholdValue: tacLimitPercent, unit: "percent",
      });
    }
    if (raw.isLineart && raw.k >= 80 && raw.c + raw.m + raw.y > 10) {
      const cmy = round2(raw.c + raw.m + raw.y);
      issues.push({
        code: "FOUR_COLOR_BLACK_LINEART", severity: "warning", pageNumber: raw.pageNumber, panelId: raw.panelId,
        messageKo: `${raw.pageNumber}쪽 선화 샘플(${raw.sampleId})에 4도 먹(CMY 합 ${cmy}%)이 혼입되었습니다. K100 단색 변환을 권장합니다.`,
        measuredValue: cmy, thresholdValue: 0, unit: "percent",
      });
    }
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  return {
    formatId: recomposition.format.formatId, cmykProfileId, tacLimitPercent,
    passed: errorCount === 0,
    status: errorCount > 0 ? "blocked-errors" : warningCount > 0 ? "review-warnings" : "ready-for-press",
    errorCount, warningCount, issues, pageSummaries,
    minEffectiveDpiObserved: Number.isFinite(minDpiObserved) ? minDpiObserved : 0,
    maxTacPercentObserved: round2(maxTacObserved), colorAudit,
  };
}

const COLOR_BAR_DEFS: readonly {
  readonly id: string; readonly label: string;
  readonly c: number; readonly m: number; readonly y: number; readonly k: number; readonly previewOklch: string;
}[] = [
  { id: "c100", label: "C100", c: 100, m: 0, y: 0, k: 0, previewOklch: "oklch(0.68 0.14 228)" },
  { id: "m100", label: "M100", c: 0, m: 100, y: 0, k: 0, previewOklch: "oklch(0.58 0.21 350)" },
  { id: "y100", label: "Y100", c: 0, m: 0, y: 100, k: 0, previewOklch: "oklch(0.90 0.18 102)" },
  { id: "k100", label: "K100", c: 0, m: 0, y: 0, k: 100, previewOklch: "oklch(0.16 0 0)" },
  { id: "c50", label: "C50", c: 50, m: 0, y: 0, k: 0, previewOklch: "oklch(0.82 0.08 228)" },
  { id: "m50", label: "M50", c: 0, m: 50, y: 0, k: 0, previewOklch: "oklch(0.76 0.12 350)" },
  { id: "y50", label: "Y50", c: 0, m: 0, y: 50, k: 0, previewOklch: "oklch(0.95 0.10 102)" },
  { id: "k50", label: "K50", c: 0, m: 0, y: 0, k: 50, previewOklch: "oklch(0.58 0 0)" },
  { id: "r-overprint", label: "M+Y", c: 0, m: 100, y: 100, k: 0, previewOklch: "oklch(0.57 0.22 28)" },
  { id: "g-overprint", label: "C+Y", c: 100, m: 0, y: 100, k: 0, previewOklch: "oklch(0.60 0.17 148)" },
  { id: "b-overprint", label: "C+M", c: 100, m: 100, y: 0, k: 0, previewOklch: "oklch(0.42 0.17 268)" },
  { id: "gray-balance", label: "C50M40Y40", c: 50, m: 40, y: 40, k: 0, previewOklch: "oklch(0.55 0.01 250)" },
];

/** 재단선·도련 표식·레지스트레이션 타깃·CMYK 컬러 컨트롤바가 포함된 조판 매니페스트를 생성한다. */
export function buildPrintImpositionManifest(
  recomposition: RecompositionResult,
  options: PrintImpositionManifestOptions = {}
): PrintImpositionManifest {
  const documentTitle = options.documentTitle ?? "ToonStudio 단행본 인쇄판";
  const cmykProfileId = options.cmykProfileId ?? defaultCmykProfileForFormat(recomposition.format.formatId);
  const profile = PREPRESS_CMYK_PROFILES[cmykProfileId];
  const bleedMm = recomposition.format.bleedMm;
  const slugMarginMm = Math.max(bleedMm + 8, options.slugMarginMm ?? 14);
  const cropLen = clamp(options.cropMarkLengthMm ?? 6, 3, slugMarginMm - bleedMm - 1);
  const offset = Math.max(3, bleedMm + 0.5);

  const pages: PrintImpositionPageSpec[] = recomposition.pages.map((page) => {
    const trimW = page.trimBoxMm.widthMm;
    const trimH = page.trimBoxMm.heightMm;
    const ox = slugMarginMm;
    const oy = slugMarginMm;
    const bOff = bleedMm;
    const tick = 3;

    const cropMarks: PrintMarkLineMm[] = [
      { id: "crop-tl-h", kind: "crop", x1Mm: round3(ox - offset - cropLen), y1Mm: oy, x2Mm: round3(ox - offset), y2Mm: oy },
      { id: "crop-tl-v", kind: "crop", x1Mm: ox, y1Mm: round3(oy - offset - cropLen), x2Mm: ox, y2Mm: round3(oy - offset) },
      { id: "crop-tr-h", kind: "crop", x1Mm: round3(ox + trimW + offset), y1Mm: oy, x2Mm: round3(ox + trimW + offset + cropLen), y2Mm: oy },
      { id: "crop-tr-v", kind: "crop", x1Mm: round3(ox + trimW), y1Mm: round3(oy - offset - cropLen), x2Mm: round3(ox + trimW), y2Mm: round3(oy - offset) },
      { id: "crop-bl-h", kind: "crop", x1Mm: round3(ox - offset - cropLen), y1Mm: round3(oy + trimH), x2Mm: round3(ox - offset), y2Mm: round3(oy + trimH) },
      { id: "crop-bl-v", kind: "crop", x1Mm: ox, y1Mm: round3(oy + trimH + offset), x2Mm: ox, y2Mm: round3(oy + trimH + offset + cropLen) },
      { id: "crop-br-h", kind: "crop", x1Mm: round3(ox + trimW + offset), y1Mm: round3(oy + trimH), x2Mm: round3(ox + trimW + offset + cropLen), y2Mm: round3(oy + trimH) },
      { id: "crop-br-v", kind: "crop", x1Mm: round3(ox + trimW), y1Mm: round3(oy + trimH + offset), x2Mm: round3(ox + trimW), y2Mm: round3(oy + trimH + offset + cropLen) },
    ];

    const bleedMarks: PrintMarkLineMm[] = [
      { id: "bleed-tl-h", kind: "bleed", x1Mm: round3(ox - bOff - tick - 1), y1Mm: round3(oy - bOff), x2Mm: round3(ox - bOff - 1), y2Mm: round3(oy - bOff) },
      { id: "bleed-tl-v", kind: "bleed", x1Mm: round3(ox - bOff), y1Mm: round3(oy - bOff - tick - 1), x2Mm: round3(ox - bOff), y2Mm: round3(oy - bOff - 1) },
      { id: "bleed-tr-h", kind: "bleed", x1Mm: round3(ox + trimW + bOff + 1), y1Mm: round3(oy - bOff), x2Mm: round3(ox + trimW + bOff + tick + 1), y2Mm: round3(oy - bOff) },
      { id: "bleed-tr-v", kind: "bleed", x1Mm: round3(ox + trimW + bOff), y1Mm: round3(oy - bOff - tick - 1), x2Mm: round3(ox + trimW + bOff), y2Mm: round3(oy - bOff - 1) },
      { id: "bleed-bl-h", kind: "bleed", x1Mm: round3(ox - bOff - tick - 1), y1Mm: round3(oy + trimH + bOff), x2Mm: round3(ox - bOff - 1), y2Mm: round3(oy + trimH + bOff) },
      { id: "bleed-bl-v", kind: "bleed", x1Mm: round3(ox - bOff), y1Mm: round3(oy + trimH + bOff + 1), x2Mm: round3(ox - bOff), y2Mm: round3(oy + trimH + bOff + tick + 1) },
      { id: "bleed-br-h", kind: "bleed", x1Mm: round3(ox + trimW + bOff + 1), y1Mm: round3(oy + trimH + bOff), x2Mm: round3(ox + trimW + bOff + tick + 1), y2Mm: round3(oy + trimH + bOff) },
      { id: "bleed-br-v", kind: "bleed", x1Mm: round3(ox + trimW + bOff), y1Mm: round3(oy + trimH + bOff + 1), x2Mm: round3(ox + trimW + bOff), y2Mm: round3(oy + trimH + bOff + tick + 1) },
    ];

    const regOff = offset + 3;
    const registrationMarks: RegistrationMarkMm[] = [
      { id: "reg-top", edge: "top", centerXMm: round3(ox + trimW * 0.5), centerYMm: round3(oy - regOff), radiusMm: 1.8, crosshairLengthMm: 5 },
      { id: "reg-bottom", edge: "bottom", centerXMm: round3(ox + trimW * 0.5), centerYMm: round3(oy + trimH + regOff), radiusMm: 1.8, crosshairLengthMm: 5 },
      { id: "reg-left", edge: "left", centerXMm: round3(ox - regOff), centerYMm: round3(oy + trimH * 0.5), radiusMm: 1.8, crosshairLengthMm: 5 },
      { id: "reg-right", edge: "right", centerXMm: round3(ox + trimW + regOff), centerYMm: round3(oy + trimH * 0.5), radiusMm: 1.8, crosshairLengthMm: 5 },
    ];

    const patchW = 6;
    const patchH = 4;
    const totalBarW = COLOR_BAR_DEFS.length * (patchW + 1) - 1;
    const barStartX = round3(ox + Math.max(2, (trimW - totalBarW) * 0.5));
    const barY = round3(Math.max(1.5, oy - offset - patchH - 3.5));
    const colorBarPatches: ColorBarPatchMm[] = COLOR_BAR_DEFS.map((d, idx) => ({
      ...d, xMm: round3(barStartX + idx * (patchW + 1)), yMm: barY, widthMm: patchW, heightMm: patchH,
    }));

    return {
      pageNumber: page.pageNumber, pageSide: page.pageSide, spineEdge: page.spineEdge,
      sheetWidthMm: round3(trimW + slugMarginMm * 2), sheetHeightMm: round3(trimH + slugMarginMm * 2),
      trimOriginOffsetXMm: ox, trimOriginOffsetYMm: oy, slugMarginMm,
      cropMarks, bleedMarks, registrationMarks, colorBarPatches,
      slugCaptionText: `${documentTitle} | P.${page.pageNumber} (${page.pageSide}, spine:${page.spineEdge}) | ${recomposition.format.formatId} | ${cmykProfileId} TAC<=${profile.tacLimitPercent}%`,
    };
  });

  const impositionSheets: ImpositionPressSheet[] = [];
  const dir = recomposition.readingDirection;
  for (let i = 0, sheetIndex = 0; i < recomposition.pages.length; sheetIndex += 1) {
    const first = recomposition.pages[i];
    if (first.pageNumber === 1 || first.isDualPageSpread) {
      impositionSheets.push({
        sheetIndex, leftPageNumber: dir === "rtl" ? first.pageNumber : null,
        rightPageNumber: dir === "ltr" ? first.pageNumber : null, readingDirection: dir,
      });
      i += 1;
      continue;
    }
    const second = recomposition.pages[i + 1];
    if (second && !second.isDualPageSpread) {
      impositionSheets.push({
        sheetIndex,
        leftPageNumber: dir === "ltr" ? first.pageNumber : second.pageNumber,
        rightPageNumber: dir === "ltr" ? second.pageNumber : first.pageNumber,
        readingDirection: dir,
      });
      i += 2;
    } else {
      impositionSheets.push({
        sheetIndex, leftPageNumber: dir === "ltr" ? first.pageNumber : null,
        rightPageNumber: dir === "rtl" ? first.pageNumber : null, readingDirection: dir,
      });
      i += 1;
    }
  }

  return {
    documentTitle, formatId: recomposition.format.formatId, readingDirection: dir,
    cmykProfileId, tacLimitPercent: profile.tacLimitPercent, pages, impositionSheets,
  };
}
