/**
 * 생산자 구조화 에러 해석 모듈 — bg3d 측정·샷 배치 계획 구간: 서브코드 26종 + 30종 (A4 D4, R11).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 코어 모듈이
 * 소스 파일 크기 래칫(800줄 상한)에 닿아, R11 구간은 frozen 사전군과 같은
 * 분할 관례로 파일 단위 형제 모듈로 나눴다. 계약은 코어와 동일하다:
 * 생산자는 {code, params}만 방출하고, 표시는 이 모듈의 리졸버로만 해석한다.
 * ko 값은 이관 전 생산자 원문과 글자 단위 동일하고, en은 신규 번역이다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type { StudioBg3dMeasurementErrorCode, StudioBg3dMeasurementFailure } from "../bg3d/studio-bg3d-measurement";
import type { StudioBg3dShotBatchPlanFailure } from "../bg3d/studio-bg3d-shot-batch-plan";
import type { StudioBg3dShotBatchPlanErrorSubcode } from "../bg3d/studio-bg3d-shot-batch-plan-error";


function resolveProducerError(
  key: string,
  fallback: string,
  params?: Readonly<Record<string, string>>,
): string {
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  const values = params ?? {};
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(values, token) ? String(values[token]) : placeholder,
  );
}

registerI18nLocaleEntries("ko", {
  "studio.producerError.bg3dMeasure.pointNotFinite": "측정점은 각 축이 ±{maxCoordinate}m 안인 유한한 XYZ 좌표여야 합니다.",
  "studio.producerError.bg3dMeasure.distanceOutOfBounds": "측정 거리가 안전한 계산 범위를 벗어났습니다.",
  "studio.producerError.bg3dMeasure.lockResultOutOfBounds": "길이 잠금 결과가 3D 장면의 안전한 world 좌표 범위를 벗어났습니다.",
  "studio.producerError.bg3dMeasure.samePoints": "같은 점 두 개로는 축·평행·수직 방향을 추론할 수 없습니다.",
  "studio.producerError.bg3dMeasure.lockNeedsDirection": "길이를 잠그려면 포인터를 움직이거나 유효한 기준 방향을 제공해 주세요.",
  "studio.producerError.bg3dMeasure.toleranceOutOfRange": "추론 허용 각도는 0° 초과 {maxDegrees}° 이하여야 합니다.",
  "studio.producerError.bg3dMeasure.referenceBudgetExceeded": "추론 기준 방향은 최대 {maxReferences}개까지 사용할 수 있습니다.",
  "studio.producerError.bg3dMeasure.referenceInvalid": "추론 기준 방향의 ID 또는 벡터가 올바르지 않습니다.",
  "studio.producerError.bg3dMeasure.duplicateReferenceId": "추론 기준 ID '{referenceId}'가 중복되었습니다.",
  "studio.producerError.bg3dMeasure.referenceDirectionInvalid": "추론 기준 '{referenceId}'의 방향 벡터가 비어 있거나 유효 범위를 벗어났습니다.",
  "studio.producerError.bg3dMeasure.lockLengthOutOfRange": "잠금 길이는 {minLength}m 이상 {maxLength}m 이하여야 합니다.",
  "studio.producerError.bg3dMeasure.guideLockLengthOutOfRange": "측정 가이드의 잠금 길이가 유효 범위를 벗어났습니다.",
  "studio.producerError.bg3dMeasure.lockLengthMismatch": "잠금 길이와 가이드의 실제 두 점 거리가 일치하지 않습니다.",
  "studio.producerError.bg3dMeasure.guideIdInvalid": "측정 가이드 ID는 영문·숫자로 시작하는 80자 이하의 안정 ID여야 합니다.",
  "studio.producerError.bg3dMeasure.deleteGuideIdInvalid": "삭제할 측정 가이드 ID가 올바르지 않습니다.",
  "studio.producerError.bg3dMeasure.zeroLengthGuide": "길이가 0인 측정 가이드는 만들 수 없습니다.",
  "studio.producerError.bg3dMeasure.guideStateInvalid": "측정 가이드 표시 상태가 올바르지 않습니다.",
  "studio.producerError.bg3dMeasure.guideOrUnitInvalid": "측정 가이드 또는 표시 단위가 올바르지 않습니다.",
  "studio.producerError.bg3dMeasure.labelUnavailable": "측정 거리 라벨을 만들 수 없습니다.",
  "studio.producerError.bg3dMeasure.guideIdOrStateInvalid": "측정 가이드 ID 또는 표시 상태가 올바르지 않습니다.",
  "studio.producerError.bg3dMeasure.documentInvalid": "측정 가이드 문서가 올바르지 않습니다.",
  "studio.producerError.bg3dMeasure.unitInvalid": "측정 표시 단위가 올바르지 않습니다.",
  "studio.producerError.bg3dMeasure.guideBudgetExceeded": "영구 측정 가이드는 장면당 최대 {maxGuides}개까지 저장할 수 있습니다.",
  "studio.producerError.bg3dMeasure.idExhausted": "새 측정 가이드의 안정 ID를 만들 수 없습니다.",
  "studio.producerError.bg3dMeasure.serializedBudgetExceeded": "측정 가이드 문서가 저장 한도 {maxKiB}KiB를 넘습니다.",
  "studio.producerError.bg3dMeasure.guideNotFound": "측정 가이드 '{guideId}'를 찾지 못했습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.bg3dMeasure.pointNotFinite": "Measurement points must be finite XYZ coordinates within ±{maxCoordinate}m on each axis.",
  "studio.producerError.bg3dMeasure.distanceOutOfBounds": "The measured distance is outside the safe computation range.",
  "studio.producerError.bg3dMeasure.lockResultOutOfBounds": "The length lock result is outside the safe world coordinate range of the 3D scene.",
  "studio.producerError.bg3dMeasure.samePoints": "Two identical points cannot be used to infer axis, parallel, or perpendicular directions.",
  "studio.producerError.bg3dMeasure.lockNeedsDirection": "To lock the length, move the pointer or provide a valid reference direction.",
  "studio.producerError.bg3dMeasure.toleranceOutOfRange": "The inference tolerance angle must be greater than 0° and at most {maxDegrees}°.",
  "studio.producerError.bg3dMeasure.referenceBudgetExceeded": "You can use at most {maxReferences} inference reference directions.",
  "studio.producerError.bg3dMeasure.referenceInvalid": "The inference reference direction ID or vector is invalid.",
  "studio.producerError.bg3dMeasure.duplicateReferenceId": "The inference reference ID '{referenceId}' is duplicated.",
  "studio.producerError.bg3dMeasure.referenceDirectionInvalid": "The direction vector of inference reference '{referenceId}' is empty or out of the valid range.",
  "studio.producerError.bg3dMeasure.lockLengthOutOfRange": "The locked length must be at least {minLength}m and at most {maxLength}m.",
  "studio.producerError.bg3dMeasure.guideLockLengthOutOfRange": "The measurement guide's locked length is out of the valid range.",
  "studio.producerError.bg3dMeasure.lockLengthMismatch": "The locked length does not match the guide's actual distance between its two points.",
  "studio.producerError.bg3dMeasure.guideIdInvalid": "Measurement guide IDs must be a stable ID of at most 80 characters starting with a letter or digit.",
  "studio.producerError.bg3dMeasure.deleteGuideIdInvalid": "The ID of the measurement guide to delete is invalid.",
  "studio.producerError.bg3dMeasure.zeroLengthGuide": "A measurement guide with zero length cannot be created.",
  "studio.producerError.bg3dMeasure.guideStateInvalid": "The measurement guide visibility state is invalid.",
  "studio.producerError.bg3dMeasure.guideOrUnitInvalid": "The measurement guide or display unit is invalid.",
  "studio.producerError.bg3dMeasure.labelUnavailable": "Could not create the measurement distance label.",
  "studio.producerError.bg3dMeasure.guideIdOrStateInvalid": "The measurement guide ID or visibility state is invalid.",
  "studio.producerError.bg3dMeasure.documentInvalid": "The measurement guide document is invalid.",
  "studio.producerError.bg3dMeasure.unitInvalid": "The measurement display unit is invalid.",
  "studio.producerError.bg3dMeasure.guideBudgetExceeded": "You can store at most {maxGuides} permanent measurement guides per scene.",
  "studio.producerError.bg3dMeasure.idExhausted": "Could not create a stable ID for a new measurement guide.",
  "studio.producerError.bg3dMeasure.serializedBudgetExceeded": "The measurement guide document exceeds the storage limit of {maxKiB}KiB.",
  "studio.producerError.bg3dMeasure.guideNotFound": "Could not find the measurement guide '{guideId}'.",
});

const BG3D_MEASURE_ERROR_KEYS: Readonly<Record<StudioBg3dMeasurementErrorCode, string>> = {
  pointNotFinite: "studio.producerError.bg3dMeasure.pointNotFinite",
  distanceOutOfBounds: "studio.producerError.bg3dMeasure.distanceOutOfBounds",
  lockResultOutOfBounds: "studio.producerError.bg3dMeasure.lockResultOutOfBounds",
  samePoints: "studio.producerError.bg3dMeasure.samePoints",
  lockNeedsDirection: "studio.producerError.bg3dMeasure.lockNeedsDirection",
  toleranceOutOfRange: "studio.producerError.bg3dMeasure.toleranceOutOfRange",
  referenceBudgetExceeded: "studio.producerError.bg3dMeasure.referenceBudgetExceeded",
  referenceInvalid: "studio.producerError.bg3dMeasure.referenceInvalid",
  duplicateReferenceId: "studio.producerError.bg3dMeasure.duplicateReferenceId",
  referenceDirectionInvalid: "studio.producerError.bg3dMeasure.referenceDirectionInvalid",
  lockLengthOutOfRange: "studio.producerError.bg3dMeasure.lockLengthOutOfRange",
  guideLockLengthOutOfRange: "studio.producerError.bg3dMeasure.guideLockLengthOutOfRange",
  lockLengthMismatch: "studio.producerError.bg3dMeasure.lockLengthMismatch",
  guideIdInvalid: "studio.producerError.bg3dMeasure.guideIdInvalid",
  deleteGuideIdInvalid: "studio.producerError.bg3dMeasure.deleteGuideIdInvalid",
  zeroLengthGuide: "studio.producerError.bg3dMeasure.zeroLengthGuide",
  guideStateInvalid: "studio.producerError.bg3dMeasure.guideStateInvalid",
  guideOrUnitInvalid: "studio.producerError.bg3dMeasure.guideOrUnitInvalid",
  labelUnavailable: "studio.producerError.bg3dMeasure.labelUnavailable",
  guideIdOrStateInvalid: "studio.producerError.bg3dMeasure.guideIdOrStateInvalid",
  documentInvalid: "studio.producerError.bg3dMeasure.documentInvalid",
  unitInvalid: "studio.producerError.bg3dMeasure.unitInvalid",
  guideBudgetExceeded: "studio.producerError.bg3dMeasure.guideBudgetExceeded",
  idExhausted: "studio.producerError.bg3dMeasure.idExhausted",
  serializedBudgetExceeded: "studio.producerError.bg3dMeasure.serializedBudgetExceeded",
  guideNotFound: "studio.producerError.bg3dMeasure.guideNotFound",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const BG3D_MEASURE_ERROR_KO: Readonly<Record<StudioBg3dMeasurementErrorCode, string>> = {
  pointNotFinite: "측정점은 각 축이 ±{maxCoordinate}m 안인 유한한 XYZ 좌표여야 합니다.",
  distanceOutOfBounds: "측정 거리가 안전한 계산 범위를 벗어났습니다.",
  lockResultOutOfBounds: "길이 잠금 결과가 3D 장면의 안전한 world 좌표 범위를 벗어났습니다.",
  samePoints: "같은 점 두 개로는 축·평행·수직 방향을 추론할 수 없습니다.",
  lockNeedsDirection: "길이를 잠그려면 포인터를 움직이거나 유효한 기준 방향을 제공해 주세요.",
  toleranceOutOfRange: "추론 허용 각도는 0° 초과 {maxDegrees}° 이하여야 합니다.",
  referenceBudgetExceeded: "추론 기준 방향은 최대 {maxReferences}개까지 사용할 수 있습니다.",
  referenceInvalid: "추론 기준 방향의 ID 또는 벡터가 올바르지 않습니다.",
  duplicateReferenceId: "추론 기준 ID '{referenceId}'가 중복되었습니다.",
  referenceDirectionInvalid: "추론 기준 '{referenceId}'의 방향 벡터가 비어 있거나 유효 범위를 벗어났습니다.",
  lockLengthOutOfRange: "잠금 길이는 {minLength}m 이상 {maxLength}m 이하여야 합니다.",
  guideLockLengthOutOfRange: "측정 가이드의 잠금 길이가 유효 범위를 벗어났습니다.",
  lockLengthMismatch: "잠금 길이와 가이드의 실제 두 점 거리가 일치하지 않습니다.",
  guideIdInvalid: "측정 가이드 ID는 영문·숫자로 시작하는 80자 이하의 안정 ID여야 합니다.",
  deleteGuideIdInvalid: "삭제할 측정 가이드 ID가 올바르지 않습니다.",
  zeroLengthGuide: "길이가 0인 측정 가이드는 만들 수 없습니다.",
  guideStateInvalid: "측정 가이드 표시 상태가 올바르지 않습니다.",
  guideOrUnitInvalid: "측정 가이드 또는 표시 단위가 올바르지 않습니다.",
  labelUnavailable: "측정 거리 라벨을 만들 수 없습니다.",
  guideIdOrStateInvalid: "측정 가이드 ID 또는 표시 상태가 올바르지 않습니다.",
  documentInvalid: "측정 가이드 문서가 올바르지 않습니다.",
  unitInvalid: "측정 표시 단위가 올바르지 않습니다.",
  guideBudgetExceeded: "영구 측정 가이드는 장면당 최대 {maxGuides}개까지 저장할 수 있습니다.",
  idExhausted: "새 측정 가이드의 안정 ID를 만들 수 없습니다.",
  serializedBudgetExceeded: "측정 가이드 문서가 저장 한도 {maxKiB}KiB를 넘습니다.",
  guideNotFound: "측정 가이드 '{guideId}'를 찾지 못했습니다.",
};

/**
 * 표시 지점 전용 해석 (bg3d 측정, R11): MeasurementPanel의 updateDocument·
 * addCurrentGuide와 measure-host의 setMeasurementStatus 지점이 부른다.
 * 생산자는 {reason(상위 그룹), code(서브코드), params}만 방출한다.
 */
export function resolveStudioBg3dMeasurementError(error: StudioBg3dMeasurementFailure): string {
  return resolveProducerError(BG3D_MEASURE_ERROR_KEYS[error.code], BG3D_MEASURE_ERROR_KO[error.code], error.params);
}

// ── bg3d 샷 배치 계획 (R11): studio-bg3d-shot-batch-plan의 Failure 30서브코드.
//    기존 code 16종은 상위 그룹으로 유지하고, 메시지 단위 서브코드가 subcode 필드로 방출된다.
//    params는 전부 없다(전 문구 정적). ko 값은 이관 전 생산자 원문과 글자 단위 동일하다.
//    주의: R10의 shotBatch 구간(공개 투영 2코드, 접두 studio.producerError.shotBatch.*)과
//    별개 구간이다 — 접두가 shotBatchPlan.*이라 키 충돌이 없다.

registerI18nLocaleEntries("ko", {
  "studio.producerError.shotBatchPlan.passFormat": "컷 배치 출력 패스 형식이 올바르지 않습니다.",
  "studio.producerError.shotBatchPlan.emptyPasses": "컷 배치 출력 패스를 하나 이상 선택해 주세요.",
  "studio.producerError.shotBatchPlan.unsupportedPass": "지원하지 않는 컷 배치 출력 패스입니다.",
  "studio.producerError.shotBatchPlan.duplicatePass": "컷 배치 출력 패스가 중복되었습니다.",
  "studio.producerError.shotBatchPlan.shotsOutOfBounds": "컷 배치 원본이 장면 문서 한도 또는 형식을 벗어났습니다.",
  "studio.producerError.shotBatchPlan.duplicateShotId": "컷 배치 원본에 중복 ID가 있습니다.",
  "studio.producerError.shotBatchPlan.revisionFormat": "컷 배치 장면 revision이 올바르지 않습니다.",
  "studio.producerError.shotBatchPlan.revisionNotCanonical": "컷 배치 장면 revision이 canonical JSON이 아닙니다.",
  "studio.producerError.shotBatchPlan.revisionMismatch": "컷 배치 원본 컷이 canonical 장면 revision과 일치하지 않습니다.",
  "studio.producerError.shotBatchPlan.scopeInvalid": "컷 배치 복구 소유 범위가 올바르지 않습니다.",
  "studio.producerError.shotBatchPlan.psdOptions": "컷 배치 PSD 옵션이 올바르지 않습니다.",
  "studio.producerError.shotBatchPlan.contactSheetOptions": "컷 배치 콘택트 시트 옵션이 올바르지 않습니다.",
  "studio.producerError.shotBatchPlan.fixedHeight": "컷 배치 고정 출력 높이가 올바르지 않습니다.",
  "studio.producerError.shotBatchPlan.planInvalid": "컷 배치 캡처 계획이 올바르지 않습니다.",
  "studio.producerError.shotBatchPlan.budgetExceeded": "컷 배치 캡처 계획이 선언한 기기 예산을 벗어났습니다.",
  "studio.producerError.shotBatchPlan.applyFailed": "컷 배치 캡처 계획을 canonical 컷에 적용할 수 없습니다.",
  "studio.producerError.shotBatchPlan.resolutionMismatch": "컷 배치 캡처 해상도가 canonical 출력 계획과 일치하지 않습니다.",
  "studio.producerError.shotBatchPlan.depthMismatch": "컷 배치 깊이 캡처가 canonical 출력 패스와 일치하지 않습니다.",
  "studio.producerError.shotBatchPlan.backgroundMismatch": "컷 배치 배경 캡처가 canonical 장면 배경과 일치하지 않습니다.",
  "studio.producerError.shotBatchPlan.aspectMismatch": "컷 배치 캡처 비율이 컷마다 달라 고정 출력 계획을 만들 수 없습니다.",
  "studio.producerError.shotBatchPlan.duplicateCaptureShot": "컷 배치 캡처 계획에 중복 컷이 있습니다.",
  "studio.producerError.shotBatchPlan.captureMismatch": "컷 배치 캡처 계획이 원본 컷과 일치하지 않습니다.",
  "studio.producerError.shotBatchPlan.captureMissing": "일부 컷의 고정 캡처 계획이 없습니다.",
  "studio.producerError.shotBatchPlan.selectionFormat": "컷 배치 선택 형식이 올바르지 않습니다.",
  "studio.producerError.shotBatchPlan.emptySelection": "렌더할 컷을 하나 이상 선택해 주세요.",
  "studio.producerError.shotBatchPlan.duplicateSelection": "선택한 컷 ID가 중복되었습니다.",
  "studio.producerError.shotBatchPlan.unknownSelection": "장면에 없는 컷이 선택되었습니다.",
  "studio.producerError.shotBatchPlan.fileBudget": "컷 배치 출력 파일 수가 브라우저 안전 한도를 벗어났습니다.",
  "studio.producerError.shotBatchPlan.planDigest": "이 브라우저에서 안전한 SHA-256 컷 계획을 만들 수 없습니다.",
  "studio.producerError.shotBatchPlan.recoveryScopeDigest": "이 브라우저에서 안전한 SHA-256 복구 범위를 만들 수 없습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.shotBatchPlan.passFormat": "The shot batch output pass format is invalid.",
  "studio.producerError.shotBatchPlan.emptyPasses": "Select at least one shot batch output pass.",
  "studio.producerError.shotBatchPlan.unsupportedPass": "This shot batch output pass is not supported.",
  "studio.producerError.shotBatchPlan.duplicatePass": "The shot batch output passes are duplicated.",
  "studio.producerError.shotBatchPlan.shotsOutOfBounds": "The shot batch source exceeds the scene document limits or format.",
  "studio.producerError.shotBatchPlan.duplicateShotId": "The shot batch source contains duplicate IDs.",
  "studio.producerError.shotBatchPlan.revisionFormat": "The shot batch scene revision is invalid.",
  "studio.producerError.shotBatchPlan.revisionNotCanonical": "The shot batch scene revision is not canonical JSON.",
  "studio.producerError.shotBatchPlan.revisionMismatch": "The shot batch source shots do not match the canonical scene revision.",
  "studio.producerError.shotBatchPlan.scopeInvalid": "The shot batch recovery ownership scope is invalid.",
  "studio.producerError.shotBatchPlan.psdOptions": "The shot batch PSD option is invalid.",
  "studio.producerError.shotBatchPlan.contactSheetOptions": "The shot batch contact sheet option is invalid.",
  "studio.producerError.shotBatchPlan.fixedHeight": "The shot batch fixed output height is invalid.",
  "studio.producerError.shotBatchPlan.planInvalid": "The shot batch capture plan is invalid.",
  "studio.producerError.shotBatchPlan.budgetExceeded": "The shot batch capture plan exceeds the declared device budget.",
  "studio.producerError.shotBatchPlan.applyFailed": "Could not apply the shot batch capture plan to the canonical shot.",
  "studio.producerError.shotBatchPlan.resolutionMismatch": "The shot batch capture resolution does not match the canonical output plan.",
  "studio.producerError.shotBatchPlan.depthMismatch": "The shot batch depth capture does not match the canonical output passes.",
  "studio.producerError.shotBatchPlan.backgroundMismatch": "The shot batch background capture does not match the canonical scene background.",
  "studio.producerError.shotBatchPlan.aspectMismatch": "The shot batch capture aspect ratio differs per shot, so a fixed output plan cannot be created.",
  "studio.producerError.shotBatchPlan.duplicateCaptureShot": "The shot batch capture plan contains duplicate shots.",
  "studio.producerError.shotBatchPlan.captureMismatch": "The shot batch capture plan does not match the source shots.",
  "studio.producerError.shotBatchPlan.captureMissing": "Some shots have no frozen capture plan.",
  "studio.producerError.shotBatchPlan.selectionFormat": "The shot batch selection format is invalid.",
  "studio.producerError.shotBatchPlan.emptySelection": "Select at least one shot to render.",
  "studio.producerError.shotBatchPlan.duplicateSelection": "The selected shot IDs are duplicated.",
  "studio.producerError.shotBatchPlan.unknownSelection": "A shot that is not in the scene was selected.",
  "studio.producerError.shotBatchPlan.fileBudget": "The number of shot batch output files exceeds the browser safety limit.",
  "studio.producerError.shotBatchPlan.planDigest": "A safe SHA-256 shot plan cannot be created in this browser.",
  "studio.producerError.shotBatchPlan.recoveryScopeDigest": "A safe SHA-256 recovery scope cannot be created in this browser.",
});

const SHOT_BATCH_PLAN_ERROR_KEYS: Readonly<Record<StudioBg3dShotBatchPlanErrorSubcode, string>> = {
  passFormat: "studio.producerError.shotBatchPlan.passFormat",
  emptyPasses: "studio.producerError.shotBatchPlan.emptyPasses",
  unsupportedPass: "studio.producerError.shotBatchPlan.unsupportedPass",
  duplicatePass: "studio.producerError.shotBatchPlan.duplicatePass",
  shotsOutOfBounds: "studio.producerError.shotBatchPlan.shotsOutOfBounds",
  duplicateShotId: "studio.producerError.shotBatchPlan.duplicateShotId",
  revisionFormat: "studio.producerError.shotBatchPlan.revisionFormat",
  revisionNotCanonical: "studio.producerError.shotBatchPlan.revisionNotCanonical",
  revisionMismatch: "studio.producerError.shotBatchPlan.revisionMismatch",
  scopeInvalid: "studio.producerError.shotBatchPlan.scopeInvalid",
  psdOptions: "studio.producerError.shotBatchPlan.psdOptions",
  contactSheetOptions: "studio.producerError.shotBatchPlan.contactSheetOptions",
  fixedHeight: "studio.producerError.shotBatchPlan.fixedHeight",
  planInvalid: "studio.producerError.shotBatchPlan.planInvalid",
  budgetExceeded: "studio.producerError.shotBatchPlan.budgetExceeded",
  applyFailed: "studio.producerError.shotBatchPlan.applyFailed",
  resolutionMismatch: "studio.producerError.shotBatchPlan.resolutionMismatch",
  depthMismatch: "studio.producerError.shotBatchPlan.depthMismatch",
  backgroundMismatch: "studio.producerError.shotBatchPlan.backgroundMismatch",
  aspectMismatch: "studio.producerError.shotBatchPlan.aspectMismatch",
  duplicateCaptureShot: "studio.producerError.shotBatchPlan.duplicateCaptureShot",
  captureMismatch: "studio.producerError.shotBatchPlan.captureMismatch",
  captureMissing: "studio.producerError.shotBatchPlan.captureMissing",
  selectionFormat: "studio.producerError.shotBatchPlan.selectionFormat",
  emptySelection: "studio.producerError.shotBatchPlan.emptySelection",
  duplicateSelection: "studio.producerError.shotBatchPlan.duplicateSelection",
  unknownSelection: "studio.producerError.shotBatchPlan.unknownSelection",
  fileBudget: "studio.producerError.shotBatchPlan.fileBudget",
  planDigest: "studio.producerError.shotBatchPlan.planDigest",
  recoveryScopeDigest: "studio.producerError.shotBatchPlan.recoveryScopeDigest",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. */
const SHOT_BATCH_PLAN_ERROR_KO: Readonly<Record<StudioBg3dShotBatchPlanErrorSubcode, string>> = {
  passFormat: "컷 배치 출력 패스 형식이 올바르지 않습니다.",
  emptyPasses: "컷 배치 출력 패스를 하나 이상 선택해 주세요.",
  unsupportedPass: "지원하지 않는 컷 배치 출력 패스입니다.",
  duplicatePass: "컷 배치 출력 패스가 중복되었습니다.",
  shotsOutOfBounds: "컷 배치 원본이 장면 문서 한도 또는 형식을 벗어났습니다.",
  duplicateShotId: "컷 배치 원본에 중복 ID가 있습니다.",
  revisionFormat: "컷 배치 장면 revision이 올바르지 않습니다.",
  revisionNotCanonical: "컷 배치 장면 revision이 canonical JSON이 아닙니다.",
  revisionMismatch: "컷 배치 원본 컷이 canonical 장면 revision과 일치하지 않습니다.",
  scopeInvalid: "컷 배치 복구 소유 범위가 올바르지 않습니다.",
  psdOptions: "컷 배치 PSD 옵션이 올바르지 않습니다.",
  contactSheetOptions: "컷 배치 콘택트 시트 옵션이 올바르지 않습니다.",
  fixedHeight: "컷 배치 고정 출력 높이가 올바르지 않습니다.",
  planInvalid: "컷 배치 캡처 계획이 올바르지 않습니다.",
  budgetExceeded: "컷 배치 캡처 계획이 선언한 기기 예산을 벗어났습니다.",
  applyFailed: "컷 배치 캡처 계획을 canonical 컷에 적용할 수 없습니다.",
  resolutionMismatch: "컷 배치 캡처 해상도가 canonical 출력 계획과 일치하지 않습니다.",
  depthMismatch: "컷 배치 깊이 캡처가 canonical 출력 패스와 일치하지 않습니다.",
  backgroundMismatch: "컷 배치 배경 캡처가 canonical 장면 배경과 일치하지 않습니다.",
  aspectMismatch: "컷 배치 캡처 비율이 컷마다 달라 고정 출력 계획을 만들 수 없습니다.",
  duplicateCaptureShot: "컷 배치 캡처 계획에 중복 컷이 있습니다.",
  captureMismatch: "컷 배치 캡처 계획이 원본 컷과 일치하지 않습니다.",
  captureMissing: "일부 컷의 고정 캡처 계획이 없습니다.",
  selectionFormat: "컷 배치 선택 형식이 올바르지 않습니다.",
  emptySelection: "렌더할 컷을 하나 이상 선택해 주세요.",
  duplicateSelection: "선택한 컷 ID가 중복되었습니다.",
  unknownSelection: "장면에 없는 컷이 선택되었습니다.",
  fileBudget: "컷 배치 출력 파일 수가 브라우저 안전 한도를 벗어났습니다.",
  planDigest: "이 브라우저에서 안전한 SHA-256 컷 계획을 만들 수 없습니다.",
  recoveryScopeDigest: "이 브라우저에서 안전한 SHA-256 복구 범위를 만들 수 없습니다.",
};

/** 표시 지점 전용 해석 (bg3d 샷 배치 계획, R11): 실패 객체를 직접 받는 기본 진입점. */
export function resolveStudioBg3dShotBatchPlanError(error: StudioBg3dShotBatchPlanFailure): string {
  return resolveProducerError(SHOT_BATCH_PLAN_ERROR_KEYS[error.subcode], SHOT_BATCH_PLAN_ERROR_KO[error.subcode]);
}

/**
 * 표시 지점 전용 해석 (bg3d 샷 배치 계획, R11): export-run의 계획 단계 catch가
 * 원인 객체만으로 부른다. 생산자 클래스(StudioBg3dShotBatchPlanError)를 런타임
 * import하면 진입 그래프에 계획 모듈이 끌려오므로, 이름+서브코드 덕 타이핑으로
 * 판정한다. 해당하지 않으면 null — 호출자는 기존 메시지 경로로 폴백한다.
 */
export function resolveStudioBg3dShotBatchPlanErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, subcode } = cause as { name?: unknown; subcode?: unknown };
  if (name !== "StudioBg3dShotBatchPlanError" || typeof subcode !== "string") return null;
  const key = SHOT_BATCH_PLAN_ERROR_KEYS[subcode as StudioBg3dShotBatchPlanErrorSubcode];
  if (!key) return null;
  return resolveProducerError(key, SHOT_BATCH_PLAN_ERROR_KO[subcode as StudioBg3dShotBatchPlanErrorSubcode]);
}
