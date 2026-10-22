/**
 * A4 D4 (R15): studio-generic-3d-model-mode 구조화 코드 정의 — 기준선 포화로 전용
 * 파일에 추출했다(studio-comments-error.ts 선례). 생산자는 표시 문구 대신
 * {code, params}만 방출하고, 표시는 표시 지점에서 리졸버
 * (status-i18n/studio-producer-error-i18n-generic3d.ts)로만 해석한다.
 * capability 라벨은 capability id가 곧 라벨 코드다(리졸버 라벨 표가 소유).
 */

/** capability detail 변형 코드 — 방출 지점(구조 증거 분기)별 1:1이다. */
export type StudioGeneric3dCapabilityDetailCode =
  | "blocked"
  | "pending"
  | "rootTransform"
  | "partAvailable"
  | "partNotStored"
  | "partSingle"
  | "boneAvailable"
  | "boneUnavailable"
  | "skinnedAvailable"
  | "skinnedUnavailable"
  | "animationAvailable"
  | "animationUnavailable"
  | "morphAvailable"
  | "morphUnavailable"
  | "poseRig"
  | "poseParts"
  | "poseGuideOnly"
  | "poseStatic"
  | "materialAvailable"
  | "materialUnavailable"
  | "normalAvailable"
  | "normalUnknown"
  | "normalUnavailable"
  | "surfaceSnap"
  | "unknown";

/**
 * admission message 코드. `passthrough`는 검증자(GLB validator·호출부)가 소유한
 * 문자열을 params.text로 그대로 싣는 채널이다 — 검증자 성공 문구와 GLB 실패
 * 해석문(집계자 예외로 생산자 경계에서 해석됨)이 이 채널을 쓴다.
 */
export type StudioGeneric3dAdmissionMessageCode =
  | "passthrough"
  | "verifiedPassed"
  | "objPending";

/** limitation detail 코드 — limitation code 1:1 + admission 메시지 위임 1종. */
export type StudioGeneric3dLimitationDetailCode =
  | "canonical-validation-pending"
  | "validation-blocked"
  | "static-no-deformation"
  | "single-part-model"
  | "part-transform-runtime-unavailable"
  | "missing-animation"
  | "missing-morph-targets"
  | "missing-mtl"
  | "normal-map-unknown"
  | "rights-review"
  | "commercial-use-restricted"
  | "team-share-restricted";
