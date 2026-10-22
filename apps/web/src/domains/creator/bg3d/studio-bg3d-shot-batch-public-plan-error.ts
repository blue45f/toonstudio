/**
 * A4 D4 (R10): 공개 archive 투영(projectStudioBg3dShotBatchPlanForPublicArchive)
 * 검증 실패 전용 오류. 생산자는 표시 문구 대신 구조화 코드를 방출하고,
 * 표시는 표시 지점에서 리졸버로 해석한다
 * (status-i18n/studio-producer-error-i18n.ts의 shotBatch 구간).
 * 기존 호출자가 TypeError로 잡던 계약을 지키기 위해 TypeError를 상속한다.
 */
export type StudioBg3dShotBatchPublicPlanErrorCode =
  | "publicProfileInvalid"
  | "publicPlanDigestInvalid";

export class StudioBg3dShotBatchPublicPlanError extends TypeError {
  readonly code: StudioBg3dShotBatchPublicPlanErrorCode;

  constructor(code: StudioBg3dShotBatchPublicPlanErrorCode) {
    super(code);
    this.name = "StudioBg3dShotBatchPublicPlanError";
    this.code = code;
  }
}
