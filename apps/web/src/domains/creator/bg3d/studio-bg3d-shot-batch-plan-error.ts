/**
 * A4 D4 (R11): 컷 배치 계획(createStudioBg3dShotBatchPlan) 실패 전용 오류와
 * 메시지 단위 서브코드. 생산자는 표시 문구 대신 구조화 코드를 방출하고,
 * 표시는 표시 지점에서 리졸버로 해석한다
 * (status-i18n/studio-producer-error-i18n.ts의 shotBatchPlan 구간).
 * 이 파일을 계획 본체와 분리한 이유: 표시 지점(export-run)이 계획 모듈 전체를
 * 런타임 import하지 않고 이 경량 클래스만으로 코드를 운반하기 위해서다.
 */
export type StudioBg3dShotBatchPlanErrorSubcode = "passFormat" | "emptyPasses" | "unsupportedPass" | "duplicatePass" | "shotsOutOfBounds" | "duplicateShotId" | "revisionFormat" | "revisionNotCanonical" | "revisionMismatch" | "scopeInvalid" | "psdOptions" | "contactSheetOptions" | "fixedHeight" | "planInvalid" | "budgetExceeded" | "applyFailed" | "resolutionMismatch" | "depthMismatch" | "backgroundMismatch" | "aspectMismatch" | "duplicateCaptureShot" | "captureMismatch" | "captureMissing" | "selectionFormat" | "emptySelection" | "duplicateSelection" | "unknownSelection" | "fileBudget" | "planDigest" | "recoveryScopeDigest";

export class StudioBg3dShotBatchPlanError extends Error {
  readonly subcode: StudioBg3dShotBatchPlanErrorSubcode;

  constructor(subcode: StudioBg3dShotBatchPlanErrorSubcode) {
    super(subcode);
    this.name = "StudioBg3dShotBatchPlanError";
    this.subcode = subcode;
  }
}
