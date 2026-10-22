/**
 * A4 D4 (R15): studio-psd-import 생산자 구조화 오류·고지 정의 — 기준선 포화로
 * 전용 파일에 추출했다(studio-comments-error.ts 선례).
 * 생산자는 표시 문구 대신 {code, params}만 방출하고(throw는 message = 코드 문자열),
 * 표시는 표시 지점에서 리졸버(status-i18n/studio-producer-error-i18n-psd-import.ts)로만
 * 해석한다. 설계 r10-d4-trace-3.md §2.17의 18곳 집계는 헤더·파일 throw와 마스크
 * 경고만 센 부분 집계였고, 현행 트리 실측은 throw 15곳(코드 12 + 집계 합성 1) ·
 * 차단 사유 4 · 대안 4 · 손실 결정 25 · 건너뜀 고지 25 · 결과 요약 6이다(보고서 병기).
 * {detail}·{note}·{reason}·{kinds}·{fidelitySummary}는 하위 모듈(파일 시스템·
 * ag-psd·조정 변환·충실도 리포트)이 만든 동적 문자열이라 원문 패스스루 params다.
 */

/** 헤더·파일 검사 throw 코드 (handleImportPsd catch가 표시 지점). */
export type StudioPsdImportErrorCode =
  | "headerTooShort"
  | "signatureMissing"
  | "unsupportedVersion"
  | "reservedHeader"
  | "channelCount"
  | "emptyCanvas"
  | "bitDepthRange"
  | "psbUnsupported"
  | "fileTooLarge"
  | "fileReadFailed"
  | "parseFailed"
  | "headerMismatch";

export class StudioPsdImportError extends Error {
  readonly code: StudioPsdImportErrorCode;
  readonly params?: Readonly<Record<string, string>>;

  constructor(
    code: StudioPsdImportErrorCode,
    params?: Readonly<Record<string, string>>,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "StudioPsdImportError";
    this.code = code;
    if (params !== undefined) this.params = params;
  }
}

/** 사전검사 차단 사유 코드 — preflight 결과 객체로 preview·합성 경계에서 해석한다. */
export type PsdBlockingReasonCode =
  | "blockedPsb"
  | "blockedDimension"
  | "blockedBitDepth"
  | "blockedColorMode";

export interface PsdBlockingReason {
  readonly code: PsdBlockingReasonCode;
  readonly params?: Readonly<Record<string, string>>;
}

/** 대안 안내 코드 — manifest alternatives와 결정 alternativeCode가 함께 쓴다. */
export type PsdAlternativeCode =
  | "altSaveCopy"
  | "altConvert"
  | "altKeepOriginal"
  | "altKeepLinked";

/** 손실 명세 결정 코드 — feature·disposition과 함께 preview 표시 지점에서 해석한다. */
export type PsdLossDecisionCode =
  | "decisionPsbLayers"
  | "decisionResolutionBlocked"
  | "decisionBitDepthBlocked"
  | "decisionBitDepthPreserved"
  | "decisionBitDepthRasterized"
  | "decisionColorSpaceBlocked"
  | "decisionColorSpaceRgb"
  | "decisionColorSpaceConverted"
  | "decisionTestBitDepth"
  | "decisionTestColorSpace"
  | "decisionLayersPreserved"
  | "decisionGroupsPreserved"
  | "decisionGroupsDropped"
  | "decisionClippingPreserved"
  | "decisionTextRasterized"
  | "decisionSmartObjectRasterized"
  | "decisionAdjustmentPreserved"
  | "decisionAdjustmentDropped"
  | "decisionEffectsDropped"
  | "decisionMaskPreserved"
  | "decisionMaskRasterized"
  | "decisionMaskDropped"
  | "decisionEncodedLayersDropped"
  | "decisionEncodedMasksDropped"
  | "decisionBlendModeDropped";

/** 건너뜀 고지 코드 — 결과 객체 skipped로 preview 표시 지점에서 해석한다. */
export type PsdImportSkipCode =
  | "groupComposite"
  | "maskVectorApprox"
  | "maskDualComposite"
  | "maskVectorPathExcluded"
  | "maskAdjustConvertFailed"
  | "maskLayerConvertFailed"
  | "maskEncodedDropped"
  | "maskVectorOnlyAdjust"
  | "maskVectorOnlyLayer"
  | "adjustmentNote"
  | "adjustmentUnsupported"
  | "emptyBounds"
  | "noCanvas"
  | "rasterizeFailed"
  | "emptyPng"
  | "encodedLayerSkipped"
  | "blendModeFallback"
  | "effectsNotReflected"
  | "smartObjectPreview"
  | "textEditablePrepared"
  | "textComplexPreserved"
  | "compositeRasterizeFailed"
  | "compositeEncodedSkipped"
  | "noLayersFound"
  | "passthrough";

export interface PsdImportSkipEntry {
  readonly code: PsdImportSkipCode;
  readonly params?: Readonly<Record<string, string>>;
}
