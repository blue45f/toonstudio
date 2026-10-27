/**
 * 아트머그(Artmug `lib.ckForm.js`, `lib.messageBox.js` 4단계 공정 컨펌 및 이전 단계 역행 수정 할증 가드) +
 * 라우드소싱(Loudsourcing `ExpertCard`, `SearchDesignerSlider` NDA 대외비·유급 파일럿 3컷 검증) +
 * 노션(Notion 동기화 스타일시트·브러시·레이어 명명 규칙 DB 블록) 역공학 내재화 순수 모델.
 */

export type StepConfirmStageId =
  | "step1-rough"
  | "step2-lineart"
  | "step3-flats"
  | "step4-final-fx";

export interface StepConfirmStageSpec {
  readonly id: StepConfirmStageId;
  readonly stepNumber: 1 | 2 | 3 | 4;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly allowedScopeKo: string;
  readonly allowedScopeEn: string;
  readonly rollbackPenaltyRatio: number;
}

export const STEP_CONFIRM_STAGES: readonly StepConfirmStageSpec[] = Object.freeze([
  {
    id: "step1-rough",
    stepNumber: 1,
    labelKo: "1단계: 러프·구도·카메라 앵글 컨펌",
    labelEn: "Step 1: Rough Layout & Camera Angle Confirm",
    allowedScopeKo: "인물 포즈, 말풍선 위치, 카메라 투시선 수정 무상 허용",
    allowedScopeEn: "Character pose, balloon placement & perspective tweaks included",
    rollbackPenaltyRatio: 0,
  },
  {
    id: "step2-lineart",
    stepNumber: 2,
    labelKo: "2단계: 펜선·선화 폐합 컨펌",
    labelEn: "Step 2: Vector/Raster Inking Confirm",
    allowedScopeKo: "펜선 굵기, 머리카락·옷주름 디테일 수정 허용 (구도 전면 변경 시 역행 할증)",
    allowedScopeEn: "Line weight & cloth fold tweaks (full pose change triggers rollback fee)",
    rollbackPenaltyRatio: 0.25,
  },
  {
    id: "step3-flats",
    stepNumber: 3,
    labelKo: "3단계: 밑색·파트 분리·3D 배경 매칭 컨펌",
    labelEn: "Step 3: Base Flats & 3D Background Match Confirm",
    allowedScopeKo: "고유색 팔레트, 배경 톤 분리 수정 허용 (선화 재작화 요구 시 역행 할증)",
    allowedScopeEn: "Base palette & tone separation tweaks (re-inking triggers rollback fee)",
    rollbackPenaltyRatio: 0.45,
  },
  {
    id: "step4-final-fx",
    stepNumber: 4,
    labelKo: "4단계: 명암·조명 후보정·최종 레이어 납품",
    labelEn: "Step 4: Shading, Rim-Light FX & Final Delivery",
    allowedScopeKo: "역광 강도, 색수차·블러 농도 미세 조정 허용 (구도/선화 역행 시 60% 재작업비)",
    allowedScopeEn: "Rim light & FX intensity tweaks (pose/line rollback triggers 60% fee)",
    rollbackPenaltyRatio: 0.6,
  },
]);

export interface StepConfirmEvaluationInput {
  readonly currentStageId: StepConfirmStageId;
  readonly requestedChangeTargetStageId: StepConfirmStageId;
  readonly baseEpisodeContractKRW: number;
  readonly usedConfirmCountInCurrentStage: number;
  readonly includedConfirmQuotaPerStage: number;
  readonly brushPresetSynced: boolean;
  readonly colorScriptSynced: boolean;
  readonly layerNamingRuleSynced: boolean;
  readonly ndaAndPilotEscrowLocked: boolean;
}

export interface StepConfirmEvaluationResult {
  readonly currentStage: StepConfirmStageSpec;
  readonly targetStage: StepConfirmStageSpec;
  readonly isUpstreamRollback: boolean;
  readonly rollbackStepsCount: number;
  readonly rollbackSurchargeKRW: number;
  readonly extraConfirmSurchargeKRW: number;
  readonly totalAdjustedContractKRW: number;
  readonly syncedSpecReadyCount: number;
  readonly syncedSpecTotalCount: 4;
  readonly gateVerdict: "pass-in-scope" | "extra-confirm-fee" | "upstream-rollback-guard";
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export function evaluateStepConfirmAndRollbackGuard(
  input: StepConfirmEvaluationInput
): StepConfirmEvaluationResult {
  const currentStage =
    STEP_CONFIRM_STAGES.find((s) => s.id === input.currentStageId) ?? STEP_CONFIRM_STAGES[0];
  const targetStage =
    STEP_CONFIRM_STAGES.find((s) => s.id === input.requestedChangeTargetStageId) ??
    STEP_CONFIRM_STAGES[0];

  const baseKRW = Math.max(50_000, Math.round(input.baseEpisodeContractKRW || 600_000));
  const rollbackStepsCount = Math.max(0, currentStage.stepNumber - targetStage.stepNumber);
  const isUpstreamRollback = rollbackStepsCount > 0;

  const rollbackSurchargeKRW = isUpstreamRollback
    ? Math.round(baseKRW * currentStage.rollbackPenaltyRatio * (rollbackStepsCount / 2))
    : 0;

  const overQuotaCount = Math.max(
    0,
    input.usedConfirmCountInCurrentStage - input.includedConfirmQuotaPerStage
  );
  const extraConfirmSurchargeKRW = overQuotaCount * Math.round(baseKRW * 0.08);
  const totalAdjustedContractKRW = baseKRW + rollbackSurchargeKRW + extraConfirmSurchargeKRW;

  const syncFlags = [
    input.brushPresetSynced,
    input.colorScriptSynced,
    input.layerNamingRuleSynced,
    input.ndaAndPilotEscrowLocked,
  ];
  const syncedSpecReadyCount = syncFlags.filter(Boolean).length;

  const gateVerdict: "pass-in-scope" | "extra-confirm-fee" | "upstream-rollback-guard" =
    isUpstreamRollback
      ? "upstream-rollback-guard"
      : overQuotaCount > 0
        ? "extra-confirm-fee"
        : "pass-in-scope";

  const summaryKo = isUpstreamRollback
    ? `[역행 수정 가드 발동] 현재 '${currentStage.labelKo}' 완료 상태에서 이전 단계인 '${targetStage.labelKo}' 변경을 요청하여 역행 재작업 보전비 ₩${rollbackSurchargeKRW.toLocaleString("ko-KR")}원이 자동 가산됩니다.`
    : overQuotaCount > 0
      ? `[컨펌 횟수 초과] 단계별 기본 컨펌(${input.includedConfirmQuotaPerStage}회)을 ${overQuotaCount}회 초과하여 추가 수정비 ₩${extraConfirmSurchargeKRW.toLocaleString("ko-KR")}원이 반영됩니다.`
      : `[정상 컨펌 범위] 현재 '${currentStage.labelKo}' 범위 내 무상 컨펌 기준을 충족하며 총 정산 예정액은 ₩${totalAdjustedContractKRW.toLocaleString("ko-KR")}원입니다.`;

  const summaryEn = isUpstreamRollback
    ? `[Upstream Rollback Guard] Requesting '${targetStage.labelEn}' changes while at '${currentStage.labelEn}' adds a ₩${rollbackSurchargeKRW.toLocaleString("en-US")} rework protection fee.`
    : overQuotaCount > 0
      ? `[Extra Confirm Fee] Exceeded stage quota (${input.includedConfirmQuotaPerStage}) by ${overQuotaCount}; adds ₩${extraConfirmSurchargeKRW.toLocaleString("en-US")}.`
      : `[In-Scope Confirm] Within '${currentStage.labelEn}' included confirm scope; total settlement is ₩${totalAdjustedContractKRW.toLocaleString("en-US")}.`;

  return Object.freeze({
    currentStage,
    targetStage,
    isUpstreamRollback,
    rollbackStepsCount,
    rollbackSurchargeKRW,
    extraConfirmSurchargeKRW,
    totalAdjustedContractKRW,
    syncedSpecReadyCount,
    syncedSpecTotalCount: 4,
    gateVerdict,
    summaryKo,
    summaryEn,
  });
}
