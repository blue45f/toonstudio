/**
 * 한국 실무 웹툰 10단계 컷 분업 바통 인계 검증 및 외주 3.3%(10원 미만 절사) 정산 집계 엔진.
 *
 * - `evaluateCut10StageHandoff`: 선화 열린 틈새 0건, Rights BOM 통과, 표준 레이어 명명·해상도 검증,
 *   통과 시 이전·현재 공정 레이어 자동 `locked: true` 잠금, 컷당 3.3% 원천징수(10원 미만 절사) 산출
 * - `applyCut10StageHandoff`: 검증 통과 시 다음 공정으로 전이 및 잠금 레이어 반영
 * - `aggregateCut10StagePayoutLedger`: 담당자별·공정별 외주 원고료 3.3% 10원 미만 절사 자동 원장 집계
 */

import {
  KOREAN_10STAGE_ORDER,
  KOREAN_10STAGE_WEBTOON_PIPELINE,
  SAMPLE_KOREAN_10STAGE_CUT_RECORDS,
  type CutHandoffRecord,
  type CutLayerLockState,
  type Korean10StageId,
  type Korean10StageSpec,
} from "./korean-10stage-catalog";

export {
  KOREAN_10STAGE_ORDER,
  KOREAN_10STAGE_WEBTOON_PIPELINE,
  SAMPLE_KOREAN_10STAGE_CUT_RECORDS,
};
export type {
  CutHandoffRecord,
  CutLayerLockState,
  Korean10StageId,
  Korean10StageSpec,
};

export interface Withholding33TaxBreakdown {
  readonly grossKrw: number;
  readonly incomeTax3PctKrw: number;
  readonly localIncomeTax03PctKrw: number;
  readonly totalWithholdingTaxKrw: number;
  readonly netPayableKrw: number;
  readonly taxApplied: boolean;
}

export type Cut10StageCheckId =
  | "layer-naming"
  | "resolution"
  | "open-line-gap"
  | "bible-palette"
  | "rights-bom";

export interface Cut10StageCheckResult {
  readonly checkId: Cut10StageCheckId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly passed: boolean;
  readonly required: boolean;
  readonly detailKo: string;
  readonly detailEn: string;
}

export interface Cut10StageHandoffEvaluation {
  readonly cutId: string;
  readonly episodeId: string;
  readonly currentStageId: Korean10StageId;
  readonly nextStageId: Korean10StageId | null;
  readonly passed: boolean;
  readonly canHandoff: boolean;
  readonly scorePercent: number;
  readonly checks: readonly Cut10StageCheckResult[];
  readonly blockingReasonsKo: readonly string[];
  readonly blockingReasonsEn: readonly string[];
  readonly previousStageLayersLocked: boolean;
  readonly lockedLayerIds: readonly string[];
  readonly updatedLayers: readonly CutLayerLockState[];
  readonly payout: Withholding33TaxBreakdown & {
    readonly stageId: Korean10StageId;
    readonly payableStatus: "approved" | "held";
  };
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface Cut10StageAssigneePayout {
  readonly assigneeId: string;
  readonly assigneeNameKo: string;
  readonly assigneeNameEn: string;
  readonly cutCount: number;
  readonly approvedCutCount: number;
  readonly heldCutCount: number;
  readonly approvedGrossKrw: number;
  readonly approvedIncomeTax3PctKrw: number;
  readonly approvedLocalIncomeTax03PctKrw: number;
  readonly approvedWithholdingTaxKrw: number;
  readonly approvedNetPayableKrw: number;
  readonly heldGrossKrw: number;
}

export interface Cut10StagePayoutLedger {
  readonly totalCuts: number;
  readonly approvedCutCount: number;
  readonly heldCutCount: number;
  readonly totalApprovedGrossKrw: number;
  readonly totalApprovedIncomeTax3PctKrw: number;
  readonly totalApprovedLocalIncomeTax03PctKrw: number;
  readonly totalApprovedWithholdingTaxKrw: number;
  readonly totalApprovedNetPayableKrw: number;
  readonly totalHeldGrossKrw: number;
  readonly byAssignee: readonly Cut10StageAssigneePayout[];
  readonly byStageGrossKrw: Readonly<Partial<Record<Korean10StageId, number>>>;
}

export function getKorean10StageSpec(stageId: Korean10StageId): Korean10StageSpec {
  const found = KOREAN_10STAGE_WEBTOON_PIPELINE.find((stage) => stage.id === stageId);
  return found ?? KOREAN_10STAGE_WEBTOON_PIPELINE[0];
}

export function getKorean10StageOrder(stageId: Korean10StageId): number {
  return getKorean10StageSpec(stageId).order;
}

export function getNextKorean10StageId(stageId: Korean10StageId): Korean10StageId | null {
  const index = KOREAN_10STAGE_ORDER.indexOf(stageId);
  if (index < 0 || index >= KOREAN_10STAGE_ORDER.length - 1) return null;
  return KOREAN_10STAGE_ORDER[index + 1] ?? null;
}

/**
 * 한국 프리랜서·외주 사업소득 원천징수 3.3%(소득세 3% + 지방소득세 0.3%) 계산기.
 * 국고금관리법 제47조 기준에 따라 소득세와 지방소득세 각각 10원 미만 금액을 절사한다.
 */
export function calculateWithholding33Truncated10(
  grossKrw: number,
  applyWithholding = true,
): Withholding33TaxBreakdown {
  const sanitizedGross = Number.isFinite(grossKrw) ? Math.max(0, Math.round(grossKrw)) : 0;
  if (!applyWithholding || sanitizedGross === 0) {
    return {
      grossKrw: sanitizedGross,
      incomeTax3PctKrw: 0,
      localIncomeTax03PctKrw: 0,
      totalWithholdingTaxKrw: 0,
      netPayableKrw: sanitizedGross,
      taxApplied: false,
    };
  }
  const incomeTax3PctKrw = Math.floor((sanitizedGross * 0.03) / 10) * 10;
  const localIncomeTax03PctKrw = Math.floor((incomeTax3PctKrw * 0.1) / 10) * 10;
  const totalWithholdingTaxKrw = incomeTax3PctKrw + localIncomeTax03PctKrw;
  return {
    grossKrw: sanitizedGross,
    incomeTax3PctKrw,
    localIncomeTax03PctKrw,
    totalWithholdingTaxKrw,
    netPayableKrw: sanitizedGross - totalWithholdingTaxKrw,
    taxApplied: true,
  };
}

function computeCutGrossKrw(record: CutHandoffRecord, stage: Korean10StageSpec): number {
  const base = Math.max(0, Math.round(record.baseRateKrw ?? stage.baseCutRateKrw));
  const multiplier = Math.max(0.5, Math.min(3.0, record.complexityMultiplier ?? 1.0));
  const rush = Math.max(0, Math.round(record.rushBonusKrw ?? 0));
  return Math.round(base * multiplier) + rush;
}

/**
 * 한국 실무 10단계 컷 바통 인계 검증기.
 * 선화 열린 틈새 0건·Rights BOM 통과·표준 레이어·해상도를 검증하고,
 * 통과 시 현재 및 이전 공정 레이어를 자동 `locked: true`로 잠그며 3.3% 절사 원고료를 산출한다.
 */
export function evaluateCut10StageHandoff(record: CutHandoffRecord): Cut10StageHandoffEvaluation {
  const stage = getKorean10StageSpec(record.currentStageId);
  const nextStageId = getNextKorean10StageId(record.currentStageId);
  const nextStage = nextStageId ? getKorean10StageSpec(nextStageId) : null;
  const currentStageLayers = record.layers.filter((layer) => layer.stageId === record.currentStageId);
  const sanitizedGaps = Math.max(0, Math.floor(record.openLineGapCount));
  const sanitizedMissingBom = Math.max(0, Math.floor(record.missingRightsBomCount));

  const hasValidNaming =
    currentStageLayers.length > 0 &&
    currentStageLayers.some((layer) => layer.layerName.startsWith(stage.requiredLayerPrefix)) &&
    record.layers.every((layer) => !/^(?:레이어\s*\d+|Layer\s*\d+)$/iu.test(layer.layerName.trim()));
  const resolutionPassed = record.widthPx >= stage.minWidthPx && record.dpi >= stage.minDpi;
  const openGapPassed = !stage.requiresClosedLineart || sanitizedGaps === 0;
  const palettePassed = !stage.requiresBiblePalette || record.biblePaletteMatchPercent >= 95;
  const bomPassed = record.rightsBomPassed && sanitizedMissingBom === 0;

  const checks: readonly Cut10StageCheckResult[] = [
    {
      checkId: "layer-naming",
      labelKo: "표준 10단계 레이어 명명",
      labelEn: "10-Stage Layer Naming",
      passed: hasValidNaming,
      required: true,
      detailKo: hasValidNaming
        ? `${stage.requiredLayerPrefix}* 접두사 확인 및 미정리 레이어명 0건`
        : `${stage.requiredLayerPrefix}* 접두사 레이어가 필요하며 임시 레이어명(레이어 1 등)은 차단됩니다.`,
      detailEn: hasValidNaming
        ? `Confirmed ${stage.requiredLayerPrefix}* prefix with zero untitled layers.`
        : `Requires a ${stage.requiredLayerPrefix}* layer and blocks generic names like Layer 1.`,
    },
    {
      checkId: "resolution",
      labelKo: "해상도 · 인쇄 DPI 기준",
      labelEn: "Resolution & DPI Standard",
      passed: resolutionPassed,
      required: true,
      detailKo: resolutionPassed
        ? `${record.widthPx}px · ${record.dpi}DPI (기준 ${stage.minWidthPx}px / ${stage.minDpi}DPI 충족)`
        : `${record.widthPx}px · ${record.dpi}DPI — 최소 ${stage.minWidthPx}px / ${stage.minDpi}DPI 필요`,
      detailEn: resolutionPassed
        ? `${record.widthPx}px · ${record.dpi}DPI meets ${stage.minWidthPx}px / ${stage.minDpi}DPI.`
        : `${record.widthPx}px · ${record.dpi}DPI is below ${stage.minWidthPx}px / ${stage.minDpi}DPI.`,
    },
    {
      checkId: "open-line-gap",
      labelKo: "선화 열린 틈새 0건 검증",
      labelEn: "Zero Open Lineart Gaps",
      passed: openGapPassed,
      required: stage.requiresClosedLineart,
      detailKo: !stage.requiresClosedLineart
        ? "이 공정은 선화 닫힌 영역 필수 대상이 아니므로 통과"
        : openGapPassed
          ? "열린 틈새 0건 확인 — 밑색 채우기 누수 위험 없음"
          : `선화 열린 틈새 ${sanitizedGaps}건 감지 — 봉합 전 바통 인계 차단`,
      detailEn: !stage.requiresClosedLineart
        ? "Closed lineart check is not required for this stage."
        : openGapPassed
          ? "Zero open line gaps verified for leak-free flatting."
          : `${sanitizedGaps} open line gap(s) detected — handoff blocked until sealed.`,
    },
    {
      checkId: "bible-palette",
      labelKo: "캐릭터 바이블 팔레트 일치",
      labelEn: "Character Bible Palette Match",
      passed: palettePassed,
      required: stage.requiresBiblePalette,
      detailKo: !stage.requiresBiblePalette
        ? "이 공정은 팔레트 일치 필수 대상이 아니므로 통과"
        : palettePassed
          ? `바이블 팔레트 일치율 ${record.biblePaletteMatchPercent}% (기준 95% 이상)`
          : `바이블 팔레트 일치율 ${record.biblePaletteMatchPercent}% — 95% 이상 필요`,
      detailEn: !stage.requiresBiblePalette
        ? "Character bible palette verification is optional for this stage."
        : palettePassed
          ? `Palette match ${record.biblePaletteMatchPercent}% meets the 95% minimum.`
          : `Palette match ${record.biblePaletteMatchPercent}% is below the 95% threshold.`,
    },
    {
      checkId: "rights-bom",
      labelKo: "Rights BOM 라이선스 통과",
      labelEn: "Rights BOM Compliance",
      passed: bomPassed,
      required: true,
      detailKo: bomPassed
        ? "3D 배경·폰트·브러시 상업 라이선스 Rights BOM 통과 (누락 0건)"
        : `Rights BOM 미통과 (미확인 에셋 ${sanitizedMissingBom}건) — 인계·정산 보류`,
      detailEn: bomPassed
        ? "Rights BOM verified with zero missing commercial asset licenses."
        : `Rights BOM failed (${sanitizedMissingBom} missing asset(s)) — handoff and payout held.`,
    },
  ];

  const failedRequired = checks.filter((check) => check.required && !check.passed);
  const passed = failedRequired.length === 0;
  const scorePercent = Math.round((checks.filter((check) => check.passed).length / checks.length) * 100);

  const updatedLayers: CutLayerLockState[] = record.layers.map((layer) => {
    const layerOrder = getKorean10StageOrder(layer.stageId);
    if (passed && layerOrder <= stage.order) {
      return {
        ...layer,
        locked: true,
        lockMode: "read-only",
        lockedReasonKo: `${stage.shortLabelKo} 인계 완료 — 이전 공정 자동 Read-Only 잠금`,
        lockedReasonEn: `Locked read-only automatically after ${stage.shortLabelEn} handoff`,
      };
    }
    if (!passed && layerOrder < stage.order) {
      return {
        ...layer,
        locked: true,
        lockMode: "read-only",
        lockedReasonKo: layer.lockedReasonKo ?? "상류 공정 보호 잠금 유지",
        lockedReasonEn: layer.lockedReasonEn ?? "Upstream stage protection lock preserved",
      };
    }
    return {
      ...layer,
      locked: false,
      lockMode: "editable",
      lockedReasonKo: undefined,
      lockedReasonEn: undefined,
    };
  });

  const lockedLayerIds = updatedLayers.filter((layer) => layer.locked).map((layer) => layer.layerId);
  const grossKrw = computeCutGrossKrw(record, stage);
  const tax = calculateWithholding33Truncated10(grossKrw, record.isFreelanceOutsource !== false);

  return {
    cutId: record.cutId,
    episodeId: record.episodeId,
    currentStageId: record.currentStageId,
    nextStageId,
    passed,
    canHandoff: passed,
    scorePercent,
    checks,
    blockingReasonsKo: failedRequired.map((check) => `${check.labelKo}: ${check.detailKo}`),
    blockingReasonsEn: failedRequired.map((check) => `${check.labelEn}: ${check.detailEn}`),
    previousStageLayersLocked: passed,
    lockedLayerIds,
    updatedLayers,
    payout: {
      ...tax,
      stageId: record.currentStageId,
      payableStatus: passed ? "approved" : "held",
    },
    summaryKo: passed
      ? nextStage
        ? `${stage.shortLabelKo} 게이트 통과 · 이전 레이어 ${lockedLayerIds.length}개 자동 잠금 → ${nextStage.shortLabelKo} 인계 가능`
        : `${stage.shortLabelKo} 최종 검수 통과 · 전 공정 레이어 ${lockedLayerIds.length}개 출고 잠금 완료`
      : `${stage.shortLabelKo} 바통 인계 차단 (${failedRequired.length}건 미충족)`,
    summaryEn: passed
      ? nextStage
        ? `${stage.shortLabelEn} passed · ${lockedLayerIds.length} prior layer(s) locked read-only → ready for ${nextStage.shortLabelEn}`
        : `${stage.shortLabelEn} approved · ${lockedLayerIds.length} layer(s) locked for release`
      : `${stage.shortLabelEn} handoff blocked (${failedRequired.length} requirement(s) failed)`,
  };
}

/** 10단계 바통 인계를 실행해 다음 공정으로 전이하고 이전 공정 레이어 자동 잠금을 반영한다. */
export function applyCut10StageHandoff(
  record: CutHandoffRecord,
  handedOffAtIso: string,
): {
  readonly transitioned: boolean;
  readonly evaluation: Cut10StageHandoffEvaluation;
  readonly nextRecord: CutHandoffRecord;
} {
  const evaluation = evaluateCut10StageHandoff(record);
  if (!evaluation.passed) {
    return { transitioned: false, evaluation, nextRecord: record };
  }
  const nextStageId = evaluation.nextStageId ?? record.currentStageId;
  return {
    transitioned: true,
    evaluation,
    nextRecord: {
      ...record,
      currentStageId: nextStageId,
      layers: evaluation.updatedLayers,
      handedOffAtIso,
    },
  };
}

/**
 * 10단계 컷 외주 원고료 정산 원장 자동 집계기.
 * 각 컷의 게이트 통과 여부를 검증해 통과분만 지급 확정하고,
 * 담당자별 총액 기준 사업소득 3.3%(10원 미만 절사) 원천징수와 실지급액을 자동 산출한다.
 */
export function aggregateCut10StagePayoutLedger(
  records: readonly CutHandoffRecord[],
): Cut10StagePayoutLedger {
  const byAssigneeMap = new Map<
    string,
    {
      assigneeNameKo: string;
      assigneeNameEn: string;
      cutCount: number;
      approvedCutCount: number;
      heldCutCount: number;
      approvedGrossKrw: number;
      heldGrossKrw: number;
      applyWithholding: boolean;
    }
  >();
  const byStageGrossKrw: Partial<Record<Korean10StageId, number>> = {};
  let approvedCutCount = 0;
  let heldCutCount = 0;

  for (const record of records) {
    const evaluation = evaluateCut10StageHandoff(record);
    const gross = evaluation.payout.grossKrw;
    byStageGrossKrw[record.currentStageId] = (byStageGrossKrw[record.currentStageId] ?? 0) + gross;

    const existing = byAssigneeMap.get(record.assigneeId) ?? {
      assigneeNameKo: record.assigneeNameKo,
      assigneeNameEn: record.assigneeNameEn ?? record.assigneeId,
      cutCount: 0,
      approvedCutCount: 0,
      heldCutCount: 0,
      approvedGrossKrw: 0,
      heldGrossKrw: 0,
      applyWithholding: record.isFreelanceOutsource !== false,
    };

    existing.cutCount += 1;
    if (evaluation.passed) {
      approvedCutCount += 1;
      existing.approvedCutCount += 1;
      existing.approvedGrossKrw += gross;
    } else {
      heldCutCount += 1;
      existing.heldCutCount += 1;
      existing.heldGrossKrw += gross;
    }
    byAssigneeMap.set(record.assigneeId, existing);
  }

  let totalApprovedGrossKrw = 0;
  let totalApprovedIncomeTax3PctKrw = 0;
  let totalApprovedLocalIncomeTax03PctKrw = 0;
  let totalApprovedWithholdingTaxKrw = 0;
  let totalApprovedNetPayableKrw = 0;
  let totalHeldGrossKrw = 0;

  const byAssignee: Cut10StageAssigneePayout[] = [...byAssigneeMap.entries()]
    .map(([assigneeId, row]) => {
      const tax = calculateWithholding33Truncated10(row.approvedGrossKrw, row.applyWithholding);
      totalApprovedGrossKrw += tax.grossKrw;
      totalApprovedIncomeTax3PctKrw += tax.incomeTax3PctKrw;
      totalApprovedLocalIncomeTax03PctKrw += tax.localIncomeTax03PctKrw;
      totalApprovedWithholdingTaxKrw += tax.totalWithholdingTaxKrw;
      totalApprovedNetPayableKrw += tax.netPayableKrw;
      totalHeldGrossKrw += row.heldGrossKrw;

      return {
        assigneeId,
        assigneeNameKo: row.assigneeNameKo,
        assigneeNameEn: row.assigneeNameEn,
        cutCount: row.cutCount,
        approvedCutCount: row.approvedCutCount,
        heldCutCount: row.heldCutCount,
        approvedGrossKrw: tax.grossKrw,
        approvedIncomeTax3PctKrw: tax.incomeTax3PctKrw,
        approvedLocalIncomeTax03PctKrw: tax.localIncomeTax03PctKrw,
        approvedWithholdingTaxKrw: tax.totalWithholdingTaxKrw,
        approvedNetPayableKrw: tax.netPayableKrw,
        heldGrossKrw: row.heldGrossKrw,
      };
    })
    .sort((a, b) => b.approvedGrossKrw + b.heldGrossKrw - (a.approvedGrossKrw + a.heldGrossKrw));

  return {
    totalCuts: records.length,
    approvedCutCount,
    heldCutCount,
    totalApprovedGrossKrw,
    totalApprovedIncomeTax3PctKrw,
    totalApprovedLocalIncomeTax03PctKrw,
    totalApprovedWithholdingTaxKrw,
    totalApprovedNetPayableKrw,
    totalHeldGrossKrw,
    byAssignee,
    byStageGrossKrw,
  };
}
