/**
 * 대형 웹툰 스튜디오 컷 난이도 가중치 외주 정산기 & 플랫폼 사전 QC·심의 자동 게이트 (₩0 로컬).
 *
 * 1) `calculateWeightedStudioSettlement`: 난이도 등급(0.8x/1.0x/1.4x/1.8x) × 공정 단가 × 프리랜서(3.3%) vs 사업자(VAT 10%) 분리 정산
 * 2) `runPlatformPreSubmissionQc`: 네이버(690/1600px)·카카오·글로벌 해상도·용량·모바일 가독성·오탈자/말풍선·연령/심의·Rights BOM 검증
 */

export type CutDifficultyGradeId = "simple" | "standard" | "action-detail" | "crowd-bg";

export interface CutDifficultyTierSpec {
  readonly id: CutDifficultyGradeId;
  readonly labelKo: string;
  readonly multiplier: number;
  readonly descriptionKo: string;
}

export const CUT_DIFFICULTY_TIERS: readonly CutDifficultyTierSpec[] = [
  { id: "simple", labelKo: "단순 컷", multiplier: 0.8, descriptionKo: "얼굴 클로즈업 · 말풍선 위주 · 단색/그라데이션 배경" },
  { id: "standard", labelKo: "표준 컷", multiplier: 1.0, descriptionKo: "상반신~전신 1~2인 · 일반 실내/실외 배경" },
  { id: "action-detail", labelKo: "액션 · 정밀 디테일", multiplier: 1.4, descriptionKo: "역동적 전투·무기·정밀 의상 장식·강한 이펙트" },
  { id: "crowd-bg", labelKo: "군중 · 대형 배경", multiplier: 1.8, descriptionKo: "다수 군중·광각 건축·복합 3D 리터칭 풀샷" },
] as const;

export type SettlementStageId =
  | "adapt-storyboard"
  | "lineart"
  | "bg3d"
  | "flatting"
  | "coloring"
  | "post-vfx"
  | "lettering";

export const SETTLEMENT_STAGE_RATES_KRW: Readonly<
  Record<SettlementStageId, { readonly labelKo: string; readonly defaultBaseRateKrw: number }>
> = {
  "adapt-storyboard": { labelKo: "각색 · 콘티", defaultBaseRateKrw: 14_000 },
  lineart: { labelKo: "선화 · 펜터치", defaultBaseRateKrw: 24_000 },
  bg3d: { labelKo: "3D 배경 · 리터칭", defaultBaseRateKrw: 18_000 },
  flatting: { labelKo: "밑색 · 플랫", defaultBaseRateKrw: 9_000 },
  coloring: { labelKo: "채색 · 명암", defaultBaseRateKrw: 20_000 },
  "post-vfx": { labelKo: "후보정 · 이펙트", defaultBaseRateKrw: 11_000 },
  lettering: { labelKo: "식자 · SFX", defaultBaseRateKrw: 6_500 },
};

export type SettlementTaxMode = "freelancer-3.3" | "business-tax-invoice";

export interface DifficultyCutCounts {
  readonly simple: number;
  readonly standard: number;
  readonly actionDetail: number;
  readonly crowdBg: number;
}

export interface SettlementContractorEntry {
  readonly entryId: string;
  readonly contractorNameKo: string;
  readonly episodeLabelKo: string;
  readonly stageId: SettlementStageId;
  readonly baseRatePerCutKrw: number;
  readonly taxMode: SettlementTaxMode;
  readonly cuts: DifficultyCutCounts;
}

export interface CalculatedSettlementLine {
  readonly entryId: string;
  readonly contractorNameKo: string;
  readonly episodeLabelKo: string;
  readonly stageId: SettlementStageId;
  readonly stageLabelKo: string;
  readonly taxMode: SettlementTaxMode;
  readonly taxModeLabelKo: string;
  readonly baseRatePerCutKrw: number;
  readonly rawCutCount: number;
  readonly weightedCutCount: number;
  readonly grossAmountKrw: number;
  readonly flatComparisonKrw: number;
  readonly fairnessDeltaKrw: number;
  readonly incomeTaxKrw: number;
  readonly localIncomeTaxKrw: number;
  readonly withholdingTaxKrw: number;
  readonly vatKrw: number;
  readonly invoiceTotalKrw: number;
  readonly netPayoutKrw: number;
  readonly studioTotalCashOutKrw: number;
}

export interface WeightedStudioSettlementReport {
  readonly lines: readonly CalculatedSettlementLine[];
  readonly freelancerSubtotal: {
    readonly contractorCount: number;
    readonly grossKrw: number;
    readonly incomeTaxKrw: number;
    readonly localIncomeTaxKrw: number;
    readonly withholdingTaxKrw: number;
    readonly netPayoutKrw: number;
  };
  readonly businessSubtotal: {
    readonly contractorCount: number;
    readonly supplyKrw: number;
    readonly vatKrw: number;
    readonly invoiceTotalKrw: number;
  };
  readonly grandTotals: {
    readonly rawCutCount: number;
    readonly weightedCutCount: number;
    readonly grossTotalKrw: number;
    readonly totalWithholdingTaxKrw: number;
    readonly totalVatKrw: number;
    readonly totalNetPayoutKrw: number;
    readonly studioTotalCashOutKrw: number;
    readonly totalFairnessDeltaKrw: number;
  };
}

export const DEFAULT_SETTLEMENT_ENTRIES: readonly SettlementContractorEntry[] = [
  {
    entryId: "settle-lineart-freelancer",
    contractorNameKo: "강도윤 작가 (프리랜서)",
    episodeLabelKo: "Ep.14",
    stageId: "lineart",
    baseRatePerCutKrw: 24_000,
    taxMode: "freelancer-3.3",
    cuts: { simple: 10, standard: 36, actionDetail: 18, crowdBg: 6 },
  },
  {
    entryId: "settle-color-freelancer",
    contractorNameKo: "윤서아 작가 (프리랜서)",
    episodeLabelKo: "Ep.13",
    stageId: "coloring",
    baseRatePerCutKrw: 20_000,
    taxMode: "freelancer-3.3",
    cuts: { simple: 14, standard: 40, actionDetail: 14, crowdBg: 4 },
  },
  {
    entryId: "settle-bg3d-studio-biz",
    contractorNameKo: "아틀리에배경㈜ (법인 사업자)",
    episodeLabelKo: "Ep.14",
    stageId: "bg3d",
    baseRatePerCutKrw: 18_000,
    taxMode: "business-tax-invoice",
    cuts: { simple: 4, standard: 22, actionDetail: 10, crowdBg: 12 },
  },
];

function sanitizeCutCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

/**
 * 컷 난이도 가중치(0.8x / 1.0x / 1.4x / 1.8x) × 공정 단가 × 프리랜서(3.3%) / 사업자(VAT 10%) 정산 계산기.
 */
export function calculateWeightedStudioSettlement(
  entries: readonly SettlementContractorEntry[],
): WeightedStudioSettlementReport {
  const lines: CalculatedSettlementLine[] = entries.map((entry) => {
    const simple = sanitizeCutCount(entry.cuts.simple);
    const standard = sanitizeCutCount(entry.cuts.standard);
    const actionDetail = sanitizeCutCount(entry.cuts.actionDetail);
    const crowdBg = sanitizeCutCount(entry.cuts.crowdBg);
    const baseRate = Math.max(0, Math.round(entry.baseRatePerCutKrw));

    const rawCutCount = simple + standard + actionDetail + crowdBg;
    const weightedCutCount =
      Math.round((simple * 0.8 + standard * 1.0 + actionDetail * 1.4 + crowdBg * 1.8) * 100) / 100;
    const grossAmountKrw = Math.round(weightedCutCount * baseRate);
    const flatComparisonKrw = rawCutCount * baseRate;
    const fairnessDeltaKrw = grossAmountKrw - flatComparisonKrw;

    const isFreelancer = entry.taxMode === "freelancer-3.3";
    const incomeTaxKrw = isFreelancer ? Math.round(grossAmountKrw * 0.03) : 0;
    const localIncomeTaxKrw = isFreelancer ? Math.round(grossAmountKrw * 0.003) : 0;
    const withholdingTaxKrw = incomeTaxKrw + localIncomeTaxKrw;
    const vatKrw = isFreelancer ? 0 : Math.round(grossAmountKrw * 0.1);
    const invoiceTotalKrw = grossAmountKrw + vatKrw;
    const netPayoutKrw = isFreelancer ? grossAmountKrw - withholdingTaxKrw : invoiceTotalKrw;
    const studioTotalCashOutKrw = isFreelancer ? grossAmountKrw : invoiceTotalKrw;

    return {
      entryId: entry.entryId,
      contractorNameKo: entry.contractorNameKo,
      episodeLabelKo: entry.episodeLabelKo,
      stageId: entry.stageId,
      stageLabelKo: SETTLEMENT_STAGE_RATES_KRW[entry.stageId].labelKo,
      taxMode: entry.taxMode,
      taxModeLabelKo: isFreelancer ? "프리랜서 원천징수 3.3%" : "사업자 세금계산서 (VAT 10%)",
      baseRatePerCutKrw: baseRate,
      rawCutCount,
      weightedCutCount,
      grossAmountKrw,
      flatComparisonKrw,
      fairnessDeltaKrw,
      incomeTaxKrw,
      localIncomeTaxKrw,
      withholdingTaxKrw,
      vatKrw,
      invoiceTotalKrw,
      netPayoutKrw,
      studioTotalCashOutKrw,
    };
  });

  const freelancerLines = lines.filter((line) => line.taxMode === "freelancer-3.3");
  const businessLines = lines.filter((line) => line.taxMode === "business-tax-invoice");

  const freelancerSubtotal = {
    contractorCount: freelancerLines.length,
    grossKrw: freelancerLines.reduce((s, l) => s + l.grossAmountKrw, 0),
    incomeTaxKrw: freelancerLines.reduce((s, l) => s + l.incomeTaxKrw, 0),
    localIncomeTaxKrw: freelancerLines.reduce((s, l) => s + l.localIncomeTaxKrw, 0),
    withholdingTaxKrw: freelancerLines.reduce((s, l) => s + l.withholdingTaxKrw, 0),
    netPayoutKrw: freelancerLines.reduce((s, l) => s + l.netPayoutKrw, 0),
  };

  const businessSubtotal = {
    contractorCount: businessLines.length,
    supplyKrw: businessLines.reduce((s, l) => s + l.grossAmountKrw, 0),
    vatKrw: businessLines.reduce((s, l) => s + l.vatKrw, 0),
    invoiceTotalKrw: businessLines.reduce((s, l) => s + l.invoiceTotalKrw, 0),
  };

  const grandTotals = {
    rawCutCount: lines.reduce((s, l) => s + l.rawCutCount, 0),
    weightedCutCount: Math.round(lines.reduce((s, l) => s + l.weightedCutCount, 0) * 100) / 100,
    grossTotalKrw: lines.reduce((s, l) => s + l.grossAmountKrw, 0),
    totalWithholdingTaxKrw: freelancerSubtotal.withholdingTaxKrw,
    totalVatKrw: businessSubtotal.vatKrw,
    totalNetPayoutKrw: freelancerSubtotal.netPayoutKrw + businessSubtotal.invoiceTotalKrw,
    studioTotalCashOutKrw: lines.reduce((s, l) => s + l.studioTotalCashOutKrw, 0),
    totalFairnessDeltaKrw: lines.reduce((s, l) => s + l.fairnessDeltaKrw, 0),
  };

  return { lines, freelancerSubtotal, businessSubtotal, grandTotals };
}

export type PlatformQcTargetId =
  | "naver-official"
  | "naver-challenge"
  | "kakao-page"
  | "global-webtoon";

export type PlatformAgeRatingId = "all" | "12+" | "15+" | "19+";

export interface PlatformQcSpec {
  readonly id: PlatformQcTargetId;
  readonly labelKo: string;
  readonly allowedWidthsPx: readonly number[];
  readonly maxSliceHeightPx: number;
  readonly maxSingleSliceMb: number;
  readonly maxTotalEpisodeMb: number;
  readonly minRecommendedFontPx: number;
  readonly minVerticalGutterPx: number;
}

export const PLATFORM_QC_SPECS: Readonly<Record<PlatformQcTargetId, PlatformQcSpec>> = {
  "naver-official": {
    id: "naver-official",
    labelKo: "네이버 웹툰 정식연재 (1600px)",
    allowedWidthsPx: [1600, 800],
    maxSliceHeightPx: 2000,
    maxSingleSliceMb: 5,
    maxTotalEpisodeMb: 50,
    minRecommendedFontPx: 30,
    minVerticalGutterPx: 140,
  },
  "naver-challenge": {
    id: "naver-challenge",
    labelKo: "네이버 도전 · 베스트도전 (690px)",
    allowedWidthsPx: [690],
    maxSliceHeightPx: 2000,
    maxSingleSliceMb: 2,
    maxTotalEpisodeMb: 20,
    minRecommendedFontPx: 18,
    minVerticalGutterPx: 90,
  },
  "kakao-page": {
    id: "kakao-page",
    labelKo: "카카오페이지 · 카카오웹툰 (720/1440px)",
    allowedWidthsPx: [720, 1440],
    maxSliceHeightPx: 2000,
    maxSingleSliceMb: 3,
    maxTotalEpisodeMb: 40,
    minRecommendedFontPx: 20,
    minVerticalGutterPx: 100,
  },
  "global-webtoon": {
    id: "global-webtoon",
    labelKo: "글로벌 WEBTOON · Tapas (800×1280px)",
    allowedWidthsPx: [800],
    maxSliceHeightPx: 1280,
    maxSingleSliceMb: 2,
    maxTotalEpisodeMb: 20,
    minRecommendedFontPx: 20,
    minVerticalGutterPx: 100,
  },
};

export interface PlatformPreSubmissionInput {
  readonly platformId: PlatformQcTargetId;
  readonly widthPx: number;
  readonly maxSliceHeightPx: number;
  readonly dpi: number;
  readonly maxSingleSliceMb: number;
  readonly totalEpisodeMb: number;
  readonly minFontSizePx: number;
  readonly minVerticalGutterPx: number;
  readonly mobilePreviewChecked: boolean;
  readonly unresolvedTypoCount: number;
  readonly clippedBalloonCount: number;
  readonly declaredAgeRating: PlatformAgeRatingId;
  readonly hasBloodOrGore: boolean;
  readonly hasProfanity: boolean;
  readonly hasSmokingOrAlcohol: boolean;
  readonly hasUnlicensedBrandLogo: boolean;
  readonly rightsBomVerified: boolean;
}

export type QcCheckStatus = "pass" | "warn" | "fail";

export interface PlatformQcCheckItem {
  readonly checkId: string;
  readonly categoryKo: string;
  readonly titleKo: string;
  readonly status: QcCheckStatus;
  readonly measuredKo: string;
  readonly requirementKo: string;
  readonly fixActionKo: string;
}

export interface PlatformPreSubmissionQcReport {
  readonly platformId: PlatformQcTargetId;
  readonly platformLabelKo: string;
  readonly verdict: "ready-to-submit" | "needs-review" | "blocked";
  readonly verdictLabelKo: string;
  readonly score: number;
  readonly passCount: number;
  readonly warnCount: number;
  readonly failCount: number;
  readonly checks: readonly PlatformQcCheckItem[];
  readonly blockingReasonsKo: readonly string[];
}

export const DEFAULT_PLATFORM_QC_INPUT: PlatformPreSubmissionInput = {
  platformId: "naver-official",
  widthPx: 1600,
  maxSliceHeightPx: 1960,
  dpi: 300,
  maxSingleSliceMb: 1.8,
  totalEpisodeMb: 26.4,
  minFontSizePx: 34,
  minVerticalGutterPx: 180,
  mobilePreviewChecked: true,
  unresolvedTypoCount: 0,
  clippedBalloonCount: 0,
  declaredAgeRating: "15+",
  hasBloodOrGore: false,
  hasProfanity: false,
  hasSmokingOrAlcohol: false,
  hasUnlicensedBrandLogo: false,
  rightsBomVerified: true,
};

/**
 * 플랫폼 제출 직전 해상도·가로폭·파일 용량·모바일 가독성·오탈자/말풍선 잘림·연령/심의 사전 QC를 수행한다.
 */
export function runPlatformPreSubmissionQc(
  input: PlatformPreSubmissionInput,
): PlatformPreSubmissionQcReport {
  const spec = PLATFORM_QC_SPECS[input.platformId];
  const checks: PlatformQcCheckItem[] = [];

  const widthMatch = spec.allowedWidthsPx.includes(input.widthPx);
  const heightMatch = input.maxSliceHeightPx <= spec.maxSliceHeightPx;
  const dpiOk = input.dpi >= 72;
  checks.push({
    checkId: "qc-resolution",
    categoryKo: "규격 · 해상도",
    titleKo: "가로폭 · 분할 높이 · DPI 일치",
    status: widthMatch && heightMatch && dpiOk ? "pass" : "fail",
    measuredKo: `${input.widthPx}×${input.maxSliceHeightPx}px · ${input.dpi}DPI`,
    requirementKo: `가로 ${spec.allowedWidthsPx.join("/")}px · 분할 ≤ ${spec.maxSliceHeightPx}px · ≥ 72DPI`,
    fixActionKo: widthMatch && heightMatch
      ? "규격이 정확히 일치합니다."
      : `출고 프리셋을 가로 ${spec.allowedWidthsPx[0]}px, 세로 분할 ${spec.maxSliceHeightPx}px 이하로 자동 리사이즈하세요.`,
  });

  const sliceSizeOk = input.maxSingleSliceMb <= spec.maxSingleSliceMb;
  const totalSizeOk = input.totalEpisodeMb <= spec.maxTotalEpisodeMb;
  const nearLimit =
    sliceSizeOk &&
    totalSizeOk &&
    (input.maxSingleSliceMb > spec.maxSingleSliceMb * 0.85 ||
      input.totalEpisodeMb > spec.maxTotalEpisodeMb * 0.85);
  checks.push({
    checkId: "qc-filesize",
    categoryKo: "파일 용량",
    titleKo: "분할 장당 · 회차 총 용량 상한",
    status: !sliceSizeOk || !totalSizeOk ? "fail" : nearLimit ? "warn" : "pass",
    measuredKo: `장당 최대 ${input.maxSingleSliceMb.toFixed(1)}MB · 총 ${input.totalEpisodeMb.toFixed(1)}MB`,
    requirementKo: `장당 ≤ ${spec.maxSingleSliceMb}MB · 총 ≤ ${spec.maxTotalEpisodeMb}MB`,
    fixActionKo:
      sliceSizeOk && totalSizeOk
        ? nearLimit
          ? "상한에 근접했습니다. JPG 품질 90% 경량 출고를 권장합니다."
          : "업로드 용량 여유가 충분합니다."
        : "JPG 88~92% 재압축 또는 세로 분할 높이를 줄여 용량 상한을 맞추세요.",
  });

  const fontOk = input.minFontSizePx >= spec.minRecommendedFontPx;
  const gutterOk = input.minVerticalGutterPx >= spec.minVerticalGutterPx;
  const mobileStatus: QcCheckStatus =
    !fontOk ? "fail" : !gutterOk || !input.mobilePreviewChecked ? "warn" : "pass";
  checks.push({
    checkId: "qc-mobile-readability",
    categoryKo: "모바일 가독성",
    titleKo: "최소 식자 크기 · 세로 여백 · 실기기 검수",
    status: mobileStatus,
    measuredKo: `최소 폰트 ${input.minFontSizePx}px · 여백 ${input.minVerticalGutterPx}px · 실기기 ${input.mobilePreviewChecked ? "확인" : "미확인"}`,
    requirementKo: `폰트 ≥ ${spec.minRecommendedFontPx}px · 여백 ≥ ${spec.minVerticalGutterPx}px`,
    fixActionKo: !fontOk
      ? `360px 스마트폰에서 대사가 깨집니다. 최소 식자 크기를 ${spec.minRecommendedFontPx}px 이상으로 키우세요.`
      : mobileStatus === "warn"
        ? "세로 여백을 확보하고 모바일 360px 미리보기 최종 확인을 체크하세요."
        : "모바일 스크롤 가독성 기준을 충족합니다.",
  });

  const hasClipped = input.clippedBalloonCount > 0;
  const hasTypo = input.unresolvedTypoCount > 0;
  checks.push({
    checkId: "qc-typo-balloon",
    categoryKo: "식자 · 오탈자",
    titleKo: "오탈자 및 말풍선 잘림 제로 검증",
    status: hasClipped || hasTypo ? "fail" : "pass",
    measuredKo: `미수정 오탈자 ${input.unresolvedTypoCount}건 · 말풍선 잘림 ${input.clippedBalloonCount}건`,
    requirementKo: "오탈자 0건 · 말풍선 잘림 0건",
    fixActionKo:
      hasClipped || hasTypo
        ? "식자 레이어에서 말풍선 경계 클리핑과 오탈자를 수정한 뒤 재검증하세요."
        : "오탈자와 말풍선 잘림이 발견되지 않았습니다.",
  });

  const ageViolations: string[] = [];
  if (input.declaredAgeRating === "all") {
    if (input.hasBloodOrGore) ageViolations.push("선혈/유혈 연출");
    if (input.hasProfanity) ageViolations.push("비속어 대사");
    if (input.hasSmokingOrAlcohol) ageViolations.push("흡연/음주 장면");
  } else if (input.declaredAgeRating === "12+") {
    if (input.hasBloodOrGore) ageViolations.push("과도한 선혈 연출");
    if (input.hasSmokingOrAlcohol) ageViolations.push("흡연/음주 직접 묘사");
  }
  const ageStatus: QcCheckStatus =
    ageViolations.length > 0
      ? "fail"
      : input.declaredAgeRating === "15+" && input.hasBloodOrGore
        ? "warn"
        : "pass";
  checks.push({
    checkId: "qc-age-rating",
    categoryKo: "연령 · 심의",
    titleKo: `연령 등급(${input.declaredAgeRating}) 심의 정합성`,
    status: ageStatus,
    measuredKo:
      ageViolations.length > 0
        ? `충돌 항목: ${ageViolations.join(", ")}`
        : `선언 등급 ${input.declaredAgeRating} 기준 적합`,
    requirementKo: "연령 등급별 유혈·비속어·흡연/음주 가이드라인 준수",
    fixActionKo:
      ageViolations.length > 0
        ? `${ageViolations.join(", ")} 장면을 블러/수정하거나 플랫폼 담당자와 등급 상향을 협의하세요.`
        : ageStatus === "warn"
          ? "15세 이용가 선혈 묘사는 플랫폼 담당자 사전 공유를 권장합니다."
          : "연령 등급 심의 충돌이 없습니다.",
  });

  const rightsStatus: QcCheckStatus =
    !input.rightsBomVerified || input.hasUnlicensedBrandLogo ? "fail" : "pass";
  checks.push({
    checkId: "qc-rights-bom",
    categoryKo: "권리 · 상표",
    titleKo: "Rights BOM 라이선스 · 실존 상표/로고 마스킹",
    status: rightsStatus,
    measuredKo: `Rights BOM ${input.rightsBomVerified ? "검증됨" : "미검증"} · 미허가 상표 ${input.hasUnlicensedBrandLogo ? "있음" : "없음"}`,
    requirementKo: "폰트·3D·브러시 상업 라이선스 검증 완료 및 실존 로고 패러디/제거",
    fixActionKo:
      rightsStatus === "fail"
        ? "Rights BOM 라이선스 검증을 마치고 배경 속 실존 브랜드 로고를 가상 브랜드로 교체하세요."
        : "상업 연재 권리 및 상표 검수가 완료되었습니다.",
  });

  const passCount = checks.filter((c) => c.status === "pass").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const failCount = checks.filter((c) => c.status === "fail").length;
  const score = Math.max(0, Math.min(100, Math.round(((passCount + warnCount * 0.5) / checks.length) * 100)));
  const verdict = failCount > 0 ? "blocked" : warnCount > 0 ? "needs-review" : "ready-to-submit";
  const verdictLabelKo =
    verdict === "ready-to-submit"
      ? "출고 승인 가능"
      : verdict === "needs-review"
        ? "주의 항목 확인 후 출고"
        : "반려 위험 · 수정 후 출고";
  const blockingReasonsKo = checks
    .filter((c) => c.status === "fail")
    .map((c) => `[${c.categoryKo}] ${c.fixActionKo}`);

  return {
    platformId: input.platformId,
    platformLabelKo: spec.labelKo,
    verdict,
    verdictLabelKo,
    score,
    passCount,
    warnCount,
    failCount,
    checks,
    blockingReasonsKo,
  };
}
