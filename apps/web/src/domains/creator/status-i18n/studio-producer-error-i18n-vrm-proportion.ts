/**
 * 생산자 구조화 에러 해석 모듈 — vrmProportion 구간: studio-vrm-proportion-core 검증 issue 6종
 * + studio-vrm-proportion-rig-runtime 안전 타깃 폴백 2종 (A4 D4 조건부 묶음, R18 설계 §2).
 *
 * 코어 모듈(studio-producer-error-i18n.ts)의 형제 모듈이다. 계약은 코어와 동일하다:
 * 생산자는 {code, params}만 방출하고, 표시는 이 모듈의 리졸버로만 해석한다.
 * install 훅(useStudioVrmPoserInstall)의 고정 문구 2종은 행동 안내라 유지하고, 세부 사유는
 * RigFailure.detailCode/detailParams를 이 리졸버로 해석해 뒤에 병기한다(A안).
 * ko 값은 이관 전 생산자 원문과 params 슬롯 포함 글자 단위 동일하고, en은 신규 번역이다.
 * 단 rig 폴백 2종(targetCountMismatch·unsafeTargetTransform)은 이관 전 원문이 영문이라
 * ko·en 모두 그 영문 원문을 그대로 쓴다.
 */

import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type { StudioVrmProportionDetailCode } from "../vrm/studio-vrm-proportion-rig-runtime";

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
  "studio.producerError.vrmProportion.missingRequiredBone": "VRM 필수 본 {boneName} 이(가) 스냅샷에 없습니다.",
  "studio.producerError.vrmProportion.unknownBone": "휴머노이드 허용 목록 밖의 본입니다.",
  "studio.producerError.vrmProportion.missingBone": "스냅샷에 없는 본에 대한 연산입니다.",
  "studio.producerError.vrmProportion.nonFinite": "유한하지 않은 수치입니다.",
  "studio.producerError.vrmProportion.nonPositiveScale": "스케일은 0보다 커야 합니다.",
  "studio.producerError.vrmProportion.scaledAncestorOfTranslatedBone": "{ancestorBoneName} 에 균등 스케일이 걸린 상태에서 {boneName} 을(를) 이동합니다.",
  "studio.producerError.vrmProportion.targetCountMismatch": "The resolved target set does not match the captured rig.",
  "studio.producerError.vrmProportion.unsafeTargetTransform": "The resolved proportion targets contain an unsafe transform.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.vrmProportion.missingRequiredBone": "Required VRM bone {boneName} is missing from the snapshot.",
  "studio.producerError.vrmProportion.unknownBone": "This bone is outside the humanoid allowlist.",
  "studio.producerError.vrmProportion.missingBone": "This operation targets a bone that is not in the snapshot.",
  "studio.producerError.vrmProportion.nonFinite": "The value is not finite.",
  "studio.producerError.vrmProportion.nonPositiveScale": "Scale must be greater than 0.",
  "studio.producerError.vrmProportion.scaledAncestorOfTranslatedBone": "Translates {boneName} while a uniform scale is applied to {ancestorBoneName}.",
  "studio.producerError.vrmProportion.targetCountMismatch": "The resolved target set does not match the captured rig.",
  "studio.producerError.vrmProportion.unsafeTargetTransform": "The resolved proportion targets contain an unsafe transform.",
});

const VRM_PROPORTION_ERROR_KEYS: Readonly<Record<StudioVrmProportionDetailCode, string>> = {
  "missing-required-bone": "studio.producerError.vrmProportion.missingRequiredBone",
  "unknown-bone": "studio.producerError.vrmProportion.unknownBone",
  "missing-bone": "studio.producerError.vrmProportion.missingBone",
  "non-finite": "studio.producerError.vrmProportion.nonFinite",
  "non-positive-scale": "studio.producerError.vrmProportion.nonPositiveScale",
  "scaled-ancestor-of-translated-bone": "studio.producerError.vrmProportion.scaledAncestorOfTranslatedBone",
  targetCountMismatch: "studio.producerError.vrmProportion.targetCountMismatch",
  unsafeTargetTransform: "studio.producerError.vrmProportion.unsafeTargetTransform",
};

/** 코드별 ko 원문 템플릿 — 미등록 로케일·미해석 시 폴백이며 이관 전 원문과 동일하다. rig 폴백 2종은 원문이 영문이다. */
const VRM_PROPORTION_ERROR_KO: Readonly<Record<StudioVrmProportionDetailCode, string>> = {
  "missing-required-bone": "VRM 필수 본 {boneName} 이(가) 스냅샷에 없습니다.",
  "unknown-bone": "휴머노이드 허용 목록 밖의 본입니다.",
  "missing-bone": "스냅샷에 없는 본에 대한 연산입니다.",
  "non-finite": "유한하지 않은 수치입니다.",
  "non-positive-scale": "스케일은 0보다 커야 합니다.",
  "scaled-ancestor-of-translated-bone": "{ancestorBoneName} 에 균등 스케일이 걸린 상태에서 {boneName} 을(를) 이동합니다.",
  targetCountMismatch: "The resolved target set does not match the captured rig.",
  unsafeTargetTransform: "The resolved proportion targets contain an unsafe transform.",
};

/**
 * 표시 지점 전용 해석 (vrmProportion 세부 사유): 생산자가 방출한 detailCode+params를
 * 현재 로케일 문구로 바꾼다.
 */
export function resolveStudioVrmProportionError(
  code: StudioVrmProportionDetailCode,
  params?: Readonly<Record<string, string>>,
): string {
  return resolveProducerError(VRM_PROPORTION_ERROR_KEYS[code], VRM_PROPORTION_ERROR_KO[code], params);
}

/**
 * RigFailure에서 세부 사유를 해석한다. detailCode가 없는 실패(disposed·stale 등)는
 * 병기 대상이 아니라 null을 돌려주고, 표시 지점은 현행 고정 문구만 쓴다.
 */
export function resolveStudioVrmProportionDetailFromFailure(failure: {
  readonly detailCode?: StudioVrmProportionDetailCode;
  readonly detailParams?: Readonly<Record<string, string>>;
}): string | null {
  if (!failure.detailCode) return null;
  return resolveStudioVrmProportionError(failure.detailCode, failure.detailParams);
}
