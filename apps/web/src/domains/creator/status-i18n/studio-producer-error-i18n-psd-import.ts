/**
 * A4 D4 (R15): PSD 가져오기 생산자(studio-psd-import.ts) 표시 해석 — trace-3 §2.17.
 * 생산자는 {code, params}만 방출하고, 헤더·파일 throw는 handleImportPsd catch,
 * 차단 사유·결정·건너뜀 고지는 preview 표시 지점에서 이 모듈로만 해석한다.
 * {detail}은 하위 오류 message 패스스루이되, 원인이 PSD 코드 오류면 그 코드를
 * 먼저 해석한다(이관 전에는 원인 message가 이미 표시 문구였다).
 * 결과 요약(psdImportResultMessage)과 차단 합성 throw는 문자열 반환 타입이
 * 고정된 집계자 예외라 생산자가 이 모듈의 합성 헬퍼를 호출한다.
 */
import {
  FALLBACK_CHAIN,
  getLang,
  registerI18nLocaleEntries,
  resolveTranslationForDisplay,
} from "@/shared/lib/i18n";
import type {
  PsdAlternativeCode,
  PsdBlockingReason,
  PsdImportSkipEntry,
  PsdLossDecisionCode,
  StudioPsdImportErrorCode,
} from "../studio-psd-import-error";
import type {
  PsdImportPreflight,
  PsdInterchangeLossDecision,
} from "../studio-psd-import-types";

const PSD_PREFIX = "studio.producerError.psd";

type PsdParams = Readonly<Record<string, string>> | undefined;

function resolvePsdError(key: string, fallback: string, params?: PsdParams): string {
  const text = resolveTranslationForDisplay(getLang(), key, FALLBACK_CHAIN, fallback);
  const values = params ?? {};
  return text.replace(/\{([A-Za-z0-9_]+)\}/gu, (placeholder, token: string) =>
    Object.hasOwn(values, token) ? String(values[token]) : placeholder,
  );
}

const ERROR_KEYS: Record<StudioPsdImportErrorCode, string> = {
  headerTooShort: `${PSD_PREFIX}.error.headerTooShort`,
  signatureMissing: `${PSD_PREFIX}.error.signatureMissing`,
  unsupportedVersion: `${PSD_PREFIX}.error.unsupportedVersion`,
  reservedHeader: `${PSD_PREFIX}.error.reservedHeader`,
  channelCount: `${PSD_PREFIX}.error.channelCount`,
  emptyCanvas: `${PSD_PREFIX}.error.emptyCanvas`,
  bitDepthRange: `${PSD_PREFIX}.error.bitDepthRange`,
  psbUnsupported: `${PSD_PREFIX}.error.psbUnsupported`,
  fileTooLarge: `${PSD_PREFIX}.error.fileTooLarge`,
  fileReadFailed: `${PSD_PREFIX}.error.fileReadFailed`,
  parseFailed: `${PSD_PREFIX}.error.parseFailed`,
  headerMismatch: `${PSD_PREFIX}.error.headerMismatch`,
};

const ERROR_KO: Record<StudioPsdImportErrorCode, string> = {
  headerTooShort: "PSD 헤더가 26바이트보다 짧아 손상된 파일로 판단했어요.",
  signatureMissing: "PSD/PSB 서명(8BPS)을 찾지 못했어요.",
  unsupportedVersion: "지원하지 않는 Photoshop 문서 버전 {version}이에요.",
  reservedHeader: "PSD 예약 헤더 영역이 올바르지 않아 안전하게 열지 않았어요.",
  channelCount: "PSD 채널 수 {channels}개는 사양 범위(1~56)를 벗어났어요.",
  emptyCanvas: "PSD 캔버스 크기가 비어 있어 안전하게 열 수 없어요.",
  bitDepthRange: "PSD 채널 비트 깊이 {bits}bit는 사양 범위를 벗어났어요.",
  psbUnsupported: "PSB(대용량 문서)는 현재 안전하게 열지 않습니다. {alternative1} 또는 {alternative2}해 주세요.",
  fileTooLarge: "PSD 파일은 최대 {maxMb}MB까지 가져올 수 있어요.",
  fileReadFailed: "PSD 파일을 읽지 못했어요: {detail}",
  parseFailed: "PSD 파일을 해석하지 못했어요: {detail}",
  headerMismatch: "PSD 헤더({headerWidth}×{headerHeight}px)와 디코딩 결과({width}×{height}px)가 달라 안전하게 열지 않았어요.",
};

const BLOCKING_KEYS: Record<PsdBlockingReason["code"], string> = {
  blockedPsb: `${PSD_PREFIX}.blocking.blockedPsb`,
  blockedDimension: `${PSD_PREFIX}.blocking.blockedDimension`,
  blockedBitDepth: `${PSD_PREFIX}.blocking.blockedBitDepth`,
  blockedColorMode: `${PSD_PREFIX}.blocking.blockedColorMode`,
};

const BLOCKING_KO: Record<PsdBlockingReason["code"], string> = {
  blockedPsb: "PSB(대용량 문서)는 메모리·레이어 왕복 검증이 끝나지 않아 현재 안전하게 열지 않습니다.",
  blockedDimension: "PSD 캔버스 {width}×{height}px가 안전 한 변 {max}px를 넘습니다.",
  blockedBitDepth: "{bits}bit PSD는 8-bit Studio 캔버스에서 원본 비트 깊이를 보존할 수 없어 열지 않습니다.",
  blockedColorMode: "{colorMode} PSD는 현재 브라우저 디코더에서 신뢰성 있게 변환할 수 없어 열지 않습니다.",
};

const ALTERNATIVE_KEYS: Record<PsdAlternativeCode, string> = {
  altSaveCopy: `${PSD_PREFIX}.alternative.altSaveCopy`,
  altConvert: `${PSD_PREFIX}.alternative.altConvert`,
  altKeepOriginal: `${PSD_PREFIX}.alternative.altKeepOriginal`,
  altKeepLinked: `${PSD_PREFIX}.alternative.altKeepLinked`,
};

const ALTERNATIVE_KO: Record<PsdAlternativeCode, string> = {
  altSaveCopy: "Photoshop·Photopea에서 복사본을 8-bit RGB PSD(한 변 30,000px 이하)로 저장",
  altConvert: "레이어 구조가 중요하면 OpenRaster(.ora), 합성 결과만 필요하면 PNG로 변환",
  altKeepOriginal: "색상 관리가 중요한 원본은 PSD와 함께 보관하세요.",
  altKeepLinked: "연결/포함 원본은 원본 PSD에서 별도로 보관하세요.",
};

const DECISION_KEYS: Record<PsdLossDecisionCode, string> = {
  decisionPsbLayers: `${PSD_PREFIX}.decision.decisionPsbLayers`,
  decisionResolutionBlocked: `${PSD_PREFIX}.decision.decisionResolutionBlocked`,
  decisionBitDepthBlocked: `${PSD_PREFIX}.decision.decisionBitDepthBlocked`,
  decisionBitDepthPreserved: `${PSD_PREFIX}.decision.decisionBitDepthPreserved`,
  decisionBitDepthRasterized: `${PSD_PREFIX}.decision.decisionBitDepthRasterized`,
  decisionColorSpaceBlocked: `${PSD_PREFIX}.decision.decisionColorSpaceBlocked`,
  decisionColorSpaceRgb: `${PSD_PREFIX}.decision.decisionColorSpaceRgb`,
  decisionColorSpaceConverted: `${PSD_PREFIX}.decision.decisionColorSpaceConverted`,
  decisionTestBitDepth: `${PSD_PREFIX}.decision.decisionTestBitDepth`,
  decisionTestColorSpace: `${PSD_PREFIX}.decision.decisionTestColorSpace`,
  decisionLayersPreserved: `${PSD_PREFIX}.decision.decisionLayersPreserved`,
  decisionGroupsPreserved: `${PSD_PREFIX}.decision.decisionGroupsPreserved`,
  decisionGroupsDropped: `${PSD_PREFIX}.decision.decisionGroupsDropped`,
  decisionClippingPreserved: `${PSD_PREFIX}.decision.decisionClippingPreserved`,
  decisionTextRasterized: `${PSD_PREFIX}.decision.decisionTextRasterized`,
  decisionSmartObjectRasterized: `${PSD_PREFIX}.decision.decisionSmartObjectRasterized`,
  decisionAdjustmentPreserved: `${PSD_PREFIX}.decision.decisionAdjustmentPreserved`,
  decisionAdjustmentDropped: `${PSD_PREFIX}.decision.decisionAdjustmentDropped`,
  decisionEffectsDropped: `${PSD_PREFIX}.decision.decisionEffectsDropped`,
  decisionMaskPreserved: `${PSD_PREFIX}.decision.decisionMaskPreserved`,
  decisionMaskRasterized: `${PSD_PREFIX}.decision.decisionMaskRasterized`,
  decisionMaskDropped: `${PSD_PREFIX}.decision.decisionMaskDropped`,
  decisionEncodedLayersDropped: `${PSD_PREFIX}.decision.decisionEncodedLayersDropped`,
  decisionEncodedMasksDropped: `${PSD_PREFIX}.decision.decisionEncodedMasksDropped`,
  decisionBlendModeDropped: `${PSD_PREFIX}.decision.decisionBlendModeDropped`,
};

const DECISION_KO: Record<PsdLossDecisionCode, string> = {
  decisionPsbLayers: "PSB의 64-bit 길이 필드와 대형 레이어 구조는 현재 Studio PSD 경계에서 지원하지 않습니다.",
  decisionResolutionBlocked: "캔버스를 나누거나 축소하기 전에는 디코딩하지 않습니다.",
  decisionBitDepthBlocked: "{bits}bit/channel 데이터를 8-bit로 조용히 절삭하지 않습니다.",
  decisionBitDepthPreserved: "8-bit/channel 픽셀 깊이를 유지합니다.",
  decisionBitDepthRasterized: "1-bit Bitmap을 8-bit Studio 래스터로 확장합니다.",
  decisionColorSpaceBlocked: "{colorMode} 채널을 RGB로 조용히 변환하지 않습니다.",
  decisionColorSpaceRgb: "RGB 픽셀은 가져오지만 내장 ICC 프로필은 Studio sRGB 캔버스에 포함되지 않습니다.",
  decisionColorSpaceConverted: "{colorMode} 픽셀을 Studio sRGB 래스터로 변환합니다.",
  decisionTestBitDepth: "테스트 주입 경로의 PSD를 8-bit/channel로 처리합니다.",
  decisionTestColorSpace: "테스트 주입 경로의 PSD를 Studio sRGB 캔버스로 처리합니다.",
  decisionLayersPreserved: "래스터 레이어 {count}개를 개별 Studio 레이어로 유지합니다.",
  decisionGroupsPreserved: "그룹 {count}개의 원본 폴더 경로와 레이어 순서를 유지합니다. Studio에서는 전체 경로명으로 폴더를 표시합니다.",
  decisionGroupsDropped: "가져올 픽셀이 없는 빈 폴더는 Studio 폴더로 만들지 않으며 원본 PSD에 보존합니다.",
  decisionClippingPreserved: "레이어 {count}개의 아래 레이어 클리핑을 유지합니다.",
  decisionTextRasterized: "텍스트 레이어 {count}개는 글자 편집 정보 대신 화면 픽셀로 가져오며, 표현 가능한 단일 서식은 숨겨진 문자 편집본을 함께 제공합니다.",
  decisionSmartObjectRasterized: "스마트 오브젝트 {count}개는 연결 원본 대신 미리보기 픽셀로 가져옵니다.",
  decisionAdjustmentPreserved: "조정 레이어 {count}개를 비파괴 파라미터와 함께 Studio 조정 레이어로 복원합니다({kinds}). 충실도: {fidelitySummary}.{caveat}",
  decisionAdjustmentDropped: "변환할 수 없는 조정 레이어 {count}개는 가져오지 않습니다 — {reasons}",
  decisionEffectsDropped: "레이어 스타일 {count}개는 편집 파라미터와 효과 합성을 가져오지 않습니다.",
  decisionMaskPreserved: "래스터 마스크 {count}개를 편집 가능한 무손실 PNG 마스크로 유지합니다.",
  decisionMaskRasterized: "벡터·이중 마스크 {count}개를 단일 래스터 마스크로 합성합니다.",
  decisionMaskDropped: "픽셀 채널이 없거나 변환에 실패한 마스크 {count}개는 적용하지 않습니다.",
  decisionEncodedLayersDropped: "인코딩된 PNG 상주 상한({budgetMb}MB)을 넘어 레이어 {count}개를 상주시키지 않았습니다. 원본 PSD에는 보존됩니다.",
  decisionEncodedMasksDropped: "인코딩된 PNG 상주 상한을 넘어 마스크 {count}개를 적용하지 않았습니다.",
  decisionBlendModeDropped: "Canvas에 대응하지 않는 블렌드 모드 {count}개를 일반 합성으로 바꿉니다.",
};

/** 조정 충실도 caveat — 이관 전 선행 공백 포함 문장을 코드로만 켜고 끈다. */
const ADJUSTMENT_CAVEAT_KEY = `${PSD_PREFIX}.decision.adjustmentCaveat`;
const ADJUSTMENT_CAVEAT_KO = " 근사 변환은 픽셀 결과가 원본과 다를 수 있고, 파라미터만 보존한 항목은 픽셀에 적용되지 않습니다.";

const SKIP_KEYS: Record<PsdImportSkipEntry["code"], string> = {
  groupComposite: `${PSD_PREFIX}.skip.groupComposite`,
  maskVectorApprox: `${PSD_PREFIX}.skip.maskVectorApprox`,
  maskDualComposite: `${PSD_PREFIX}.skip.maskDualComposite`,
  maskVectorPathExcluded: `${PSD_PREFIX}.skip.maskVectorPathExcluded`,
  maskAdjustConvertFailed: `${PSD_PREFIX}.skip.maskAdjustConvertFailed`,
  maskLayerConvertFailed: `${PSD_PREFIX}.skip.maskLayerConvertFailed`,
  maskEncodedDropped: `${PSD_PREFIX}.skip.maskEncodedDropped`,
  maskVectorOnlyAdjust: `${PSD_PREFIX}.skip.maskVectorOnlyAdjust`,
  maskVectorOnlyLayer: `${PSD_PREFIX}.skip.maskVectorOnlyLayer`,
  adjustmentNote: `${PSD_PREFIX}.skip.adjustmentNote`,
  adjustmentUnsupported: `${PSD_PREFIX}.skip.adjustmentUnsupported`,
  emptyBounds: `${PSD_PREFIX}.skip.emptyBounds`,
  noCanvas: `${PSD_PREFIX}.skip.noCanvas`,
  rasterizeFailed: `${PSD_PREFIX}.skip.rasterizeFailed`,
  emptyPng: `${PSD_PREFIX}.skip.emptyPng`,
  encodedLayerSkipped: `${PSD_PREFIX}.skip.encodedLayerSkipped`,
  blendModeFallback: `${PSD_PREFIX}.skip.blendModeFallback`,
  effectsNotReflected: `${PSD_PREFIX}.skip.effectsNotReflected`,
  smartObjectPreview: `${PSD_PREFIX}.skip.smartObjectPreview`,
  textEditablePrepared: `${PSD_PREFIX}.skip.textEditablePrepared`,
  textComplexPreserved: `${PSD_PREFIX}.skip.textComplexPreserved`,
  compositeRasterizeFailed: `${PSD_PREFIX}.skip.compositeRasterizeFailed`,
  compositeEncodedSkipped: `${PSD_PREFIX}.skip.compositeEncodedSkipped`,
  noLayersFound: `${PSD_PREFIX}.skip.noLayersFound`,
  passthrough: `${PSD_PREFIX}.skip.passthrough`,
};

const SKIP_KO: Record<PsdImportSkipEntry["code"], string> = {
  groupComposite: "{path}: {features}은 개별 편집 레이어에서 완전히 재현되지 않아요. 원본 외관은 PSD 합성본으로 확인해 주세요.",
  maskVectorApprox: "{name}: 벡터 마스크를 편집 가능한 단일 래스터 마스크로 근사했어요.",
  maskDualComposite: "{name}: 픽셀·벡터 이중 마스크를 편집 가능한 단일 래스터 마스크로 합성했어요.",
  maskVectorPathExcluded: "{name}: 벡터 마스크 경로는 별도로 편집할 수 없어 래스터 마스크에 포함되지 않았어요.",
  maskAdjustConvertFailed: "{name}: 마스크 변환에 실패해 조정 레이어를 가리지 않고 가져왔어요.",
  maskLayerConvertFailed: "{name}: 마스크 변환에 실패해 원본 레이어를 가리지 않고 가져왔어요.",
  maskEncodedDropped: "{name}: 인코딩된 PNG 상주 상한을 넘어 마스크를 적용하지 않았어요.",
  maskVectorOnlyAdjust: "{name}: 벡터 전용 마스크는 래스터 픽셀이 없어 조정 레이어를 가리지 않고 가져왔어요.",
  maskVectorOnlyLayer: "{name}: 벡터 전용 마스크는 래스터 픽셀이 없어 원본 레이어를 가리지 않고 가져왔어요.",
  adjustmentNote: "{name}: 조정 레이어 변환 메모 — {note}",
  adjustmentUnsupported: "{name}: 조정 레이어({psdType})는 변환할 수 없어 제외됨 — {reason}",
  emptyBounds: "{name}: 크기가 0이라 건너뜀",
  noCanvas: "{name}: 이미지 데이터를 찾을 수 없어 건너뜀",
  rasterizeFailed: "{name}: 래스터화 실패로 건너뜀",
  emptyPng: "{name}: 래스터 PNG가 비어 있어 건너뜀",
  encodedLayerSkipped: "{name}: 인코딩된 PNG 상주 상한({budgetMb}MB)을 넘어 건너뜀",
  blendModeFallback: "{name}: {blendMode} 블렌드 모드는 일반 합성으로 가져왔어요.",
  effectsNotReflected: "{name}: 레이어 스타일(그림자 등)은 반영되지 않아요",
  smartObjectPreview: "{name}: 스마트 오브젝트는 편집 가능한 원본이 아니라 미리보기 이미지로 가져왔어요",
  textEditablePrepared: "{name}: 원본 외관은 이미지로 유지하고 숨겨진 텍스트 편집본을 함께 준비했어요. 글꼴·줄바꿈은 편집본을 켜서 확인해 주세요.",
  textComplexPreserved: "{name}: 복잡한 문자 서식은 원본 이미지로 유지해요. 문자 편집 정보는 함께 보관한 PSD에서 다시 열 수 있어요",
  compositeRasterizeFailed: "PSD 원본 합성본: 래스터화 실패로 건너뜀",
  compositeEncodedSkipped: "PSD 원본 합성본: 인코딩된 PNG 상주 상한을 넘어 생략했어요. 레이어는 그대로 가져왔어요.",
  noLayersFound: "PSD에서 가져올 레이어를 찾지 못했어요.",
  passthrough: "{name}: {detail}",
};

const GROUP_FEATURE_KEYS: Record<string, string> = {
  blendMode: `${PSD_PREFIX}.skip.featureBlendMode`,
  opacity: `${PSD_PREFIX}.skip.featureOpacity`,
  mask: `${PSD_PREFIX}.skip.featureMask`,
  effects: `${PSD_PREFIX}.skip.featureEffects`,
};

const GROUP_FEATURE_KO: Record<string, string> = {
  blendMode: "{blendMode} 격리 합성",
  opacity: "그룹 불투명도",
  mask: "그룹 마스크",
  effects: "그룹 효과",
};

const RESULT_KEYS = {
  summary: `${PSD_PREFIX}.result.summary`,
  adjustment: `${PSD_PREFIX}.result.adjustment`,
  adjustmentCaveats: `${PSD_PREFIX}.result.adjustmentCaveats`,
  caveatApproximated: `${PSD_PREFIX}.result.caveatApproximated`,
  caveatPreservedOnly: `${PSD_PREFIX}.result.caveatPreservedOnly`,
  skipped: `${PSD_PREFIX}.result.skipped`,
  noConversionResult: `${PSD_PREFIX}.result.noConversionResult`,
  blocked: `${PSD_PREFIX}.result.blocked`,
  unknownType: `${PSD_PREFIX}.result.unknownType`,
  noConversionReason: `${PSD_PREFIX}.result.noConversionReason`,
} as const;

const RESULT_KO: Record<keyof typeof RESULT_KEYS, string> = {
  summary: "PSD 준비 완료 — 레이어 {count}개",
  adjustment: "조정 레이어 {restored}개 복원",
  adjustmentCaveats: "조정 레이어 {restored}개 복원({caveats})",
  caveatApproximated: "근사 {count}",
  caveatPreservedOnly: "파라미터만 보존 {count}",
  skipped: "알림 {count}건",
  noConversionResult: "변환 결과 없음",
  blocked: "{reasons} {alternatives}해 주세요.",
  unknownType: "알 수 없음",
  noConversionReason: "변환 결과가 없습니다.",
};

registerI18nLocaleEntries("ko", {
  "studio.producerError.psd.error.headerTooShort": "PSD 헤더가 26바이트보다 짧아 손상된 파일로 판단했어요.",
  "studio.producerError.psd.error.signatureMissing": "PSD/PSB 서명(8BPS)을 찾지 못했어요.",
  "studio.producerError.psd.error.unsupportedVersion": "지원하지 않는 Photoshop 문서 버전 {version}이에요.",
  "studio.producerError.psd.error.reservedHeader": "PSD 예약 헤더 영역이 올바르지 않아 안전하게 열지 않았어요.",
  "studio.producerError.psd.error.channelCount": "PSD 채널 수 {channels}개는 사양 범위(1~56)를 벗어났어요.",
  "studio.producerError.psd.error.emptyCanvas": "PSD 캔버스 크기가 비어 있어 안전하게 열 수 없어요.",
  "studio.producerError.psd.error.bitDepthRange": "PSD 채널 비트 깊이 {bits}bit는 사양 범위를 벗어났어요.",
  "studio.producerError.psd.error.psbUnsupported": "PSB(대용량 문서)는 현재 안전하게 열지 않습니다. {alternative1} 또는 {alternative2}해 주세요.",
  "studio.producerError.psd.error.fileTooLarge": "PSD 파일은 최대 {maxMb}MB까지 가져올 수 있어요.",
  "studio.producerError.psd.error.fileReadFailed": "PSD 파일을 읽지 못했어요: {detail}",
  "studio.producerError.psd.error.parseFailed": "PSD 파일을 해석하지 못했어요: {detail}",
  "studio.producerError.psd.error.headerMismatch": "PSD 헤더({headerWidth}×{headerHeight}px)와 디코딩 결과({width}×{height}px)가 달라 안전하게 열지 않았어요.",
  "studio.producerError.psd.blocking.blockedPsb": "PSB(대용량 문서)는 메모리·레이어 왕복 검증이 끝나지 않아 현재 안전하게 열지 않습니다.",
  "studio.producerError.psd.blocking.blockedDimension": "PSD 캔버스 {width}×{height}px가 안전 한 변 {max}px를 넘습니다.",
  "studio.producerError.psd.blocking.blockedBitDepth": "{bits}bit PSD는 8-bit Studio 캔버스에서 원본 비트 깊이를 보존할 수 없어 열지 않습니다.",
  "studio.producerError.psd.blocking.blockedColorMode": "{colorMode} PSD는 현재 브라우저 디코더에서 신뢰성 있게 변환할 수 없어 열지 않습니다.",
  "studio.producerError.psd.alternative.altSaveCopy": "Photoshop·Photopea에서 복사본을 8-bit RGB PSD(한 변 30,000px 이하)로 저장",
  "studio.producerError.psd.alternative.altConvert": "레이어 구조가 중요하면 OpenRaster(.ora), 합성 결과만 필요하면 PNG로 변환",
  "studio.producerError.psd.alternative.altKeepOriginal": "색상 관리가 중요한 원본은 PSD와 함께 보관하세요.",
  "studio.producerError.psd.alternative.altKeepLinked": "연결/포함 원본은 원본 PSD에서 별도로 보관하세요.",
  "studio.producerError.psd.decision.decisionPsbLayers": "PSB의 64-bit 길이 필드와 대형 레이어 구조는 현재 Studio PSD 경계에서 지원하지 않습니다.",
  "studio.producerError.psd.decision.decisionResolutionBlocked": "캔버스를 나누거나 축소하기 전에는 디코딩하지 않습니다.",
  "studio.producerError.psd.decision.decisionBitDepthBlocked": "{bits}bit/channel 데이터를 8-bit로 조용히 절삭하지 않습니다.",
  "studio.producerError.psd.decision.decisionBitDepthPreserved": "8-bit/channel 픽셀 깊이를 유지합니다.",
  "studio.producerError.psd.decision.decisionBitDepthRasterized": "1-bit Bitmap을 8-bit Studio 래스터로 확장합니다.",
  "studio.producerError.psd.decision.decisionColorSpaceBlocked": "{colorMode} 채널을 RGB로 조용히 변환하지 않습니다.",
  "studio.producerError.psd.decision.decisionColorSpaceRgb": "RGB 픽셀은 가져오지만 내장 ICC 프로필은 Studio sRGB 캔버스에 포함되지 않습니다.",
  "studio.producerError.psd.decision.decisionColorSpaceConverted": "{colorMode} 픽셀을 Studio sRGB 래스터로 변환합니다.",
  "studio.producerError.psd.decision.decisionTestBitDepth": "테스트 주입 경로의 PSD를 8-bit/channel로 처리합니다.",
  "studio.producerError.psd.decision.decisionTestColorSpace": "테스트 주입 경로의 PSD를 Studio sRGB 캔버스로 처리합니다.",
  "studio.producerError.psd.decision.decisionLayersPreserved": "래스터 레이어 {count}개를 개별 Studio 레이어로 유지합니다.",
  "studio.producerError.psd.decision.decisionGroupsPreserved": "그룹 {count}개의 원본 폴더 경로와 레이어 순서를 유지합니다. Studio에서는 전체 경로명으로 폴더를 표시합니다.",
  "studio.producerError.psd.decision.decisionGroupsDropped": "가져올 픽셀이 없는 빈 폴더는 Studio 폴더로 만들지 않으며 원본 PSD에 보존합니다.",
  "studio.producerError.psd.decision.decisionClippingPreserved": "레이어 {count}개의 아래 레이어 클리핑을 유지합니다.",
  "studio.producerError.psd.decision.decisionTextRasterized": "텍스트 레이어 {count}개는 글자 편집 정보 대신 화면 픽셀로 가져오며, 표현 가능한 단일 서식은 숨겨진 문자 편집본을 함께 제공합니다.",
  "studio.producerError.psd.decision.decisionSmartObjectRasterized": "스마트 오브젝트 {count}개는 연결 원본 대신 미리보기 픽셀로 가져옵니다.",
  "studio.producerError.psd.decision.decisionAdjustmentPreserved": "조정 레이어 {count}개를 비파괴 파라미터와 함께 Studio 조정 레이어로 복원합니다({kinds}). 충실도: {fidelitySummary}.{caveat}",
  "studio.producerError.psd.decision.decisionAdjustmentDropped": "변환할 수 없는 조정 레이어 {count}개는 가져오지 않습니다 — {reasons}",
  "studio.producerError.psd.decision.decisionEffectsDropped": "레이어 스타일 {count}개는 편집 파라미터와 효과 합성을 가져오지 않습니다.",
  "studio.producerError.psd.decision.decisionMaskPreserved": "래스터 마스크 {count}개를 편집 가능한 무손실 PNG 마스크로 유지합니다.",
  "studio.producerError.psd.decision.decisionMaskRasterized": "벡터·이중 마스크 {count}개를 단일 래스터 마스크로 합성합니다.",
  "studio.producerError.psd.decision.decisionMaskDropped": "픽셀 채널이 없거나 변환에 실패한 마스크 {count}개는 적용하지 않습니다.",
  "studio.producerError.psd.decision.decisionEncodedLayersDropped": "인코딩된 PNG 상주 상한({budgetMb}MB)을 넘어 레이어 {count}개를 상주시키지 않았습니다. 원본 PSD에는 보존됩니다.",
  "studio.producerError.psd.decision.decisionEncodedMasksDropped": "인코딩된 PNG 상주 상한을 넘어 마스크 {count}개를 적용하지 않았습니다.",
  "studio.producerError.psd.decision.decisionBlendModeDropped": "Canvas에 대응하지 않는 블렌드 모드 {count}개를 일반 합성으로 바꿉니다.",
  "studio.producerError.psd.decision.adjustmentCaveat": " 근사 변환은 픽셀 결과가 원본과 다를 수 있고, 파라미터만 보존한 항목은 픽셀에 적용되지 않습니다.",
  "studio.producerError.psd.skip.groupComposite": "{path}: {features}은 개별 편집 레이어에서 완전히 재현되지 않아요. 원본 외관은 PSD 합성본으로 확인해 주세요.",
  "studio.producerError.psd.skip.maskVectorApprox": "{name}: 벡터 마스크를 편집 가능한 단일 래스터 마스크로 근사했어요.",
  "studio.producerError.psd.skip.maskDualComposite": "{name}: 픽셀·벡터 이중 마스크를 편집 가능한 단일 래스터 마스크로 합성했어요.",
  "studio.producerError.psd.skip.maskVectorPathExcluded": "{name}: 벡터 마스크 경로는 별도로 편집할 수 없어 래스터 마스크에 포함되지 않았어요.",
  "studio.producerError.psd.skip.maskAdjustConvertFailed": "{name}: 마스크 변환에 실패해 조정 레이어를 가리지 않고 가져왔어요.",
  "studio.producerError.psd.skip.maskLayerConvertFailed": "{name}: 마스크 변환에 실패해 원본 레이어를 가리지 않고 가져왔어요.",
  "studio.producerError.psd.skip.maskEncodedDropped": "{name}: 인코딩된 PNG 상주 상한을 넘어 마스크를 적용하지 않았어요.",
  "studio.producerError.psd.skip.maskVectorOnlyAdjust": "{name}: 벡터 전용 마스크는 래스터 픽셀이 없어 조정 레이어를 가리지 않고 가져왔어요.",
  "studio.producerError.psd.skip.maskVectorOnlyLayer": "{name}: 벡터 전용 마스크는 래스터 픽셀이 없어 원본 레이어를 가리지 않고 가져왔어요.",
  "studio.producerError.psd.skip.adjustmentNote": "{name}: 조정 레이어 변환 메모 — {note}",
  "studio.producerError.psd.skip.adjustmentUnsupported": "{name}: 조정 레이어({psdType})는 변환할 수 없어 제외됨 — {reason}",
  "studio.producerError.psd.skip.emptyBounds": "{name}: 크기가 0이라 건너뜀",
  "studio.producerError.psd.skip.noCanvas": "{name}: 이미지 데이터를 찾을 수 없어 건너뜀",
  "studio.producerError.psd.skip.rasterizeFailed": "{name}: 래스터화 실패로 건너뜀",
  "studio.producerError.psd.skip.emptyPng": "{name}: 래스터 PNG가 비어 있어 건너뜀",
  "studio.producerError.psd.skip.encodedLayerSkipped": "{name}: 인코딩된 PNG 상주 상한({budgetMb}MB)을 넘어 건너뜀",
  "studio.producerError.psd.skip.blendModeFallback": "{name}: {blendMode} 블렌드 모드는 일반 합성으로 가져왔어요.",
  "studio.producerError.psd.skip.effectsNotReflected": "{name}: 레이어 스타일(그림자 등)은 반영되지 않아요",
  "studio.producerError.psd.skip.smartObjectPreview": "{name}: 스마트 오브젝트는 편집 가능한 원본이 아니라 미리보기 이미지로 가져왔어요",
  "studio.producerError.psd.skip.textEditablePrepared": "{name}: 원본 외관은 이미지로 유지하고 숨겨진 텍스트 편집본을 함께 준비했어요. 글꼴·줄바꿈은 편집본을 켜서 확인해 주세요.",
  "studio.producerError.psd.skip.textComplexPreserved": "{name}: 복잡한 문자 서식은 원본 이미지로 유지해요. 문자 편집 정보는 함께 보관한 PSD에서 다시 열 수 있어요",
  "studio.producerError.psd.skip.compositeRasterizeFailed": "PSD 원본 합성본: 래스터화 실패로 건너뜀",
  "studio.producerError.psd.skip.compositeEncodedSkipped": "PSD 원본 합성본: 인코딩된 PNG 상주 상한을 넘어 생략했어요. 레이어는 그대로 가져왔어요.",
  "studio.producerError.psd.skip.noLayersFound": "PSD에서 가져올 레이어를 찾지 못했어요.",
  "studio.producerError.psd.skip.passthrough": "{name}: {detail}",
  "studio.producerError.psd.skip.featureBlendMode": "{blendMode} 격리 합성",
  "studio.producerError.psd.skip.featureOpacity": "그룹 불투명도",
  "studio.producerError.psd.skip.featureMask": "그룹 마스크",
  "studio.producerError.psd.skip.featureEffects": "그룹 효과",
  "studio.producerError.psd.result.summary": "PSD 준비 완료 — 레이어 {count}개",
  "studio.producerError.psd.result.adjustment": "조정 레이어 {restored}개 복원",
  "studio.producerError.psd.result.adjustmentCaveats": "조정 레이어 {restored}개 복원({caveats})",
  "studio.producerError.psd.result.caveatApproximated": "근사 {count}",
  "studio.producerError.psd.result.caveatPreservedOnly": "파라미터만 보존 {count}",
  "studio.producerError.psd.result.skipped": "알림 {count}건",
  "studio.producerError.psd.result.noConversionResult": "변환 결과 없음",
  "studio.producerError.psd.result.blocked": "{reasons} {alternatives}해 주세요.",
  "studio.producerError.psd.result.unknownType": "알 수 없음",
  "studio.producerError.psd.result.noConversionReason": "변환 결과가 없습니다.",
});

registerI18nLocaleEntries("en", {
  "studio.producerError.psd.error.headerTooShort": "The PSD header is shorter than 26 bytes, so the file looks corrupted.",
  "studio.producerError.psd.error.signatureMissing": "Couldn't find the PSD/PSB signature (8BPS).",
  "studio.producerError.psd.error.unsupportedVersion": "Photoshop document version {version} isn't supported.",
  "studio.producerError.psd.error.reservedHeader": "The PSD reserved header area is invalid, so it wasn't opened for safety.",
  "studio.producerError.psd.error.channelCount": "A PSD channel count of {channels} is outside the spec range (1–56).",
  "studio.producerError.psd.error.emptyCanvas": "The PSD canvas size is empty, so it can't be opened safely.",
  "studio.producerError.psd.error.bitDepthRange": "A PSD channel bit depth of {bits}bit is outside the spec range.",
  "studio.producerError.psd.error.psbUnsupported": "PSB (large documents) can't be opened safely yet. Please {alternative1} or {alternative2}.",
  "studio.producerError.psd.error.fileTooLarge": "PSD files can be imported up to {maxMb}MB.",
  "studio.producerError.psd.error.fileReadFailed": "Couldn't read the PSD file: {detail}",
  "studio.producerError.psd.error.parseFailed": "Couldn't parse the PSD file: {detail}",
  "studio.producerError.psd.error.headerMismatch": "The PSD header ({headerWidth}×{headerHeight}px) and the decoded result ({width}×{height}px) differ, so it wasn't opened for safety.",
  "studio.producerError.psd.blocking.blockedPsb": "PSB (large documents) can't be opened safely yet because memory and layer round-trip verification isn't finished.",
  "studio.producerError.psd.blocking.blockedDimension": "The PSD canvas {width}×{height}px exceeds the safe side limit of {max}px.",
  "studio.producerError.psd.blocking.blockedBitDepth": "{bits}bit PSDs aren't opened because the original bit depth can't be preserved on an 8-bit Studio canvas.",
  "studio.producerError.psd.blocking.blockedColorMode": "{colorMode} PSDs aren't opened because the current browser decoder can't convert them reliably.",
  "studio.producerError.psd.alternative.altSaveCopy": "save a copy as an 8-bit RGB PSD (longest side 30,000px or less) in Photoshop or Photopea",
  "studio.producerError.psd.alternative.altConvert": "convert to OpenRaster (.ora) if the layer structure matters, or PNG if only the composite is needed",
  "studio.producerError.psd.alternative.altKeepOriginal": "Keep the original PSD alongside it when color management matters.",
  "studio.producerError.psd.alternative.altKeepLinked": "Keep linked/embedded originals separately in the source PSD.",
  "studio.producerError.psd.decision.decisionPsbLayers": "The 64-bit length fields and large layer structures of PSB aren't supported at the current Studio PSD boundary.",
  "studio.producerError.psd.decision.decisionResolutionBlocked": "It isn't decoded before the canvas is split or reduced.",
  "studio.producerError.psd.decision.decisionBitDepthBlocked": "{bits}bit/channel data isn't silently truncated to 8-bit.",
  "studio.producerError.psd.decision.decisionBitDepthPreserved": "The 8-bit/channel pixel depth is preserved.",
  "studio.producerError.psd.decision.decisionBitDepthRasterized": "The 1-bit Bitmap is expanded to an 8-bit Studio raster.",
  "studio.producerError.psd.decision.decisionColorSpaceBlocked": "{colorMode} channels aren't silently converted to RGB.",
  "studio.producerError.psd.decision.decisionColorSpaceRgb": "RGB pixels are imported, but the embedded ICC profile isn't included in the Studio sRGB canvas.",
  "studio.producerError.psd.decision.decisionColorSpaceConverted": "{colorMode} pixels are converted to a Studio sRGB raster.",
  "studio.producerError.psd.decision.decisionTestBitDepth": "The test-injected PSD is processed as 8-bit/channel.",
  "studio.producerError.psd.decision.decisionTestColorSpace": "The test-injected PSD is processed on a Studio sRGB canvas.",
  "studio.producerError.psd.decision.decisionLayersPreserved": "{count} raster layers are kept as individual Studio layers.",
  "studio.producerError.psd.decision.decisionGroupsPreserved": "The original folder paths and layer order of {count} groups are kept. Studio shows folders by their full path name.",
  "studio.producerError.psd.decision.decisionGroupsDropped": "Empty folders with no pixels to import aren't made into Studio folders and stay in the source PSD.",
  "studio.producerError.psd.decision.decisionClippingPreserved": "Clipping to the layer below is kept for {count} layers.",
  "studio.producerError.psd.decision.decisionTextRasterized": "{count} text layers are imported as screen pixels instead of character editing info, and a hidden editable text copy is provided for representable single styles.",
  "studio.producerError.psd.decision.decisionSmartObjectRasterized": "{count} smart objects are imported as preview pixels instead of the linked originals.",
  "studio.producerError.psd.decision.decisionAdjustmentPreserved": "{count} adjustment layers are restored as Studio adjustment layers with non-destructive parameters ({kinds}). Fidelity: {fidelitySummary}.{caveat}",
  "studio.producerError.psd.decision.decisionAdjustmentDropped": "{count} adjustment layers that can't be converted aren't imported — {reasons}",
  "studio.producerError.psd.decision.decisionEffectsDropped": "The editing parameters and effect compositing of {count} layer styles aren't imported.",
  "studio.producerError.psd.decision.decisionMaskPreserved": "{count} raster masks are kept as editable lossless PNG masks.",
  "studio.producerError.psd.decision.decisionMaskRasterized": "{count} vector/dual masks are composited into a single raster mask.",
  "studio.producerError.psd.decision.decisionMaskDropped": "{count} masks with no pixel channel or a failed conversion aren't applied.",
  "studio.producerError.psd.decision.decisionEncodedLayersDropped": "{count} layers weren't kept resident beyond the encoded PNG residency cap ({budgetMb}MB). They remain in the source PSD.",
  "studio.producerError.psd.decision.decisionEncodedMasksDropped": "{count} masks weren't applied beyond the encoded PNG residency cap.",
  "studio.producerError.psd.decision.decisionBlendModeDropped": "{count} blend modes with no Canvas equivalent are switched to normal compositing.",
  "studio.producerError.psd.decision.adjustmentCaveat": " Approximated conversions may differ in pixels from the original, and preserved-only items aren't applied to pixels.",
  "studio.producerError.psd.skip.groupComposite": "{path}: {features} can't be fully reproduced on individual editable layers. Check the original appearance in the PSD composite.",
  "studio.producerError.psd.skip.maskVectorApprox": "{name}: the vector mask was approximated as an editable single raster mask.",
  "studio.producerError.psd.skip.maskDualComposite": "{name}: the pixel/vector dual mask was composited into an editable single raster mask.",
  "studio.producerError.psd.skip.maskVectorPathExcluded": "{name}: the vector mask path can't be edited separately, so it isn't included in the raster mask.",
  "studio.producerError.psd.skip.maskAdjustConvertFailed": "{name}: mask conversion failed, so the adjustment layer was imported unmasked.",
  "studio.producerError.psd.skip.maskLayerConvertFailed": "{name}: mask conversion failed, so the original layer was imported unmasked.",
  "studio.producerError.psd.skip.maskEncodedDropped": "{name}: the mask wasn't applied beyond the encoded PNG residency cap.",
  "studio.producerError.psd.skip.maskVectorOnlyAdjust": "{name}: a vector-only mask has no raster pixels, so the adjustment layer was imported unmasked.",
  "studio.producerError.psd.skip.maskVectorOnlyLayer": "{name}: a vector-only mask has no raster pixels, so the original layer was imported unmasked.",
  "studio.producerError.psd.skip.adjustmentNote": "{name}: adjustment layer conversion note — {note}",
  "studio.producerError.psd.skip.adjustmentUnsupported": "{name}: adjustment layer ({psdType}) can't be converted and was excluded — {reason}",
  "studio.producerError.psd.skip.emptyBounds": "{name}: skipped because its size is 0",
  "studio.producerError.psd.skip.noCanvas": "{name}: skipped because no image data was found",
  "studio.producerError.psd.skip.rasterizeFailed": "{name}: skipped because rasterization failed",
  "studio.producerError.psd.skip.emptyPng": "{name}: skipped because the raster PNG is empty",
  "studio.producerError.psd.skip.encodedLayerSkipped": "{name}: skipped beyond the encoded PNG residency cap ({budgetMb}MB)",
  "studio.producerError.psd.skip.blendModeFallback": "{name}: the {blendMode} blend mode was imported as normal compositing.",
  "studio.producerError.psd.skip.effectsNotReflected": "{name}: layer styles (shadows, etc.) aren't reflected",
  "studio.producerError.psd.skip.smartObjectPreview": "{name}: the smart object was imported as a preview image, not an editable original",
  "studio.producerError.psd.skip.textEditablePrepared": "{name}: the original appearance is kept as an image and a hidden editable text copy was prepared too. Check fonts and line breaks by turning on the copy.",
  "studio.producerError.psd.skip.textComplexPreserved": "{name}: complex character styling is kept as the original image. Character editing info can be reopened from the PSD kept alongside.",
  "studio.producerError.psd.skip.compositeRasterizeFailed": "PSD original composite: skipped because rasterization failed",
  "studio.producerError.psd.skip.compositeEncodedSkipped": "PSD original composite: omitted beyond the encoded PNG residency cap. The layers were imported as-is.",
  "studio.producerError.psd.skip.noLayersFound": "No layers to import were found in the PSD.",
  "studio.producerError.psd.skip.passthrough": "{name}: {detail}",
  "studio.producerError.psd.skip.featureBlendMode": "{blendMode} isolated compositing",
  "studio.producerError.psd.skip.featureOpacity": "group opacity",
  "studio.producerError.psd.skip.featureMask": "group mask",
  "studio.producerError.psd.skip.featureEffects": "group effects",
  "studio.producerError.psd.result.summary": "PSD ready — {count} layers",
  "studio.producerError.psd.result.adjustment": "{restored} adjustment layers restored",
  "studio.producerError.psd.result.adjustmentCaveats": "{restored} adjustment layers restored ({caveats})",
  "studio.producerError.psd.result.caveatApproximated": "{count} approximated",
  "studio.producerError.psd.result.caveatPreservedOnly": "{count} preserved only",
  "studio.producerError.psd.result.skipped": "{count} notices",
  "studio.producerError.psd.result.noConversionResult": "No conversion result",
  "studio.producerError.psd.result.blocked": "{reasons} Please {alternatives}.",
  "studio.producerError.psd.result.unknownType": "Unknown",
  "studio.producerError.psd.result.noConversionReason": "There is no conversion result.",
});

/** 대안 코드를 표시 문구로 푼다 — 등록되지 않은 문자열(내보내기 생산자 문구)은 그대로 통과시킨다. */
export function resolveStudioPsdAlternative(code: string): string {
  if (Object.hasOwn(ALTERNATIVE_KEYS, code)) {
    const typed = code as PsdAlternativeCode;
    return resolvePsdError(ALTERNATIVE_KEYS[typed], ALTERNATIVE_KO[typed]);
  }
  return code;
}

/** PSD 코드 오류 하나를 표시 문구로 푼다 — {detail}은 원인 코드 해석을 우선한다. */
export function resolveStudioPsdImportError(error: {
  code: StudioPsdImportErrorCode;
  params?: Readonly<Record<string, string>>;
  cause?: unknown;
}): string {
  let params = error.params;
  if ((error.code === "fileReadFailed" || error.code === "parseFailed") && params?.detail !== undefined) {
    const fromCause = resolveStudioPsdImportErrorFromCause(error.cause);
    const detail = fromCause
      ?? (Object.hasOwn(ERROR_KEYS, params.detail)
        ? resolvePsdError(ERROR_KEYS[params.detail as StudioPsdImportErrorCode], ERROR_KO[params.detail as StudioPsdImportErrorCode])
        : params.detail);
    params = { ...params, detail };
  }
  if (error.code === "psbUnsupported" && params) {
    params = {
      ...params,
      ...(params.alternative1 !== undefined ? { alternative1: resolveStudioPsdAlternative(params.alternative1) } : {}),
      ...(params.alternative2 !== undefined ? { alternative2: resolveStudioPsdAlternative(params.alternative2) } : {}),
    };
  }
  return resolvePsdError(ERROR_KEYS[error.code], ERROR_KO[error.code], params);
}

/** 원인 체인에서 PSD 코드 오류를 찾아 해석한다(아니면 null — 기존 경로 유지). */
export function resolveStudioPsdImportErrorFromCause(cause: unknown): string | null {
  if (!cause || typeof cause !== "object") return null;
  const { name, code } = cause as { name?: unknown; code?: unknown };
  if (name === "StudioPsdImportError" && typeof code === "string"
    && Object.hasOwn(ERROR_KEYS, code)) {
    return resolveStudioPsdImportError(cause as {
      code: StudioPsdImportErrorCode;
      params?: Readonly<Record<string, string>>;
      cause?: unknown;
    });
  }
  return null;
}

export function resolveStudioPsdBlockingReason(reason: PsdBlockingReason): string {
  return resolvePsdError(BLOCKING_KEYS[reason.code], BLOCKING_KO[reason.code], reason.params);
}

/** 차단 합성(집계자 예외) — 사유·대안을 현재 언어로 합성한 전체 문장. */
export function resolveStudioPsdBlockedMessage(preflight: PsdImportPreflight): string {
  const lang = getLang();
  const joiner = lang.startsWith("en") ? " or " : " 또는 ";
  const reasons = preflight.blockingReasons.map(resolveStudioPsdBlockingReason).join(" ");
  const alternatives = preflight.lossManifest.alternatives
    .map((alternative) => resolveStudioPsdAlternative(alternative))
    .join(joiner);
  return resolvePsdError(RESULT_KEYS.blocked, RESULT_KO.blocked, { reasons, alternatives });
}

/** 손실 결정 하나를 표시 문구로 푼다 — 코드 없는 결정(내보내기 생산자)은 message를 쓴다. */
export function resolveStudioPsdDecision(decision: PsdInterchangeLossDecision): string {
  if (!decision.code) return decision.message ?? "";
  let params = decision.params;
  if (decision.code === "decisionAdjustmentPreserved") {
    const caveat = params?.caveat === "approx"
      ? resolvePsdError(ADJUSTMENT_CAVEAT_KEY, ADJUSTMENT_CAVEAT_KO)
      : "";
    params = { ...params, caveat };
  }
  return resolvePsdError(DECISION_KEYS[decision.code], DECISION_KO[decision.code], params);
}

export function resolveStudioPsdDecisionAlternative(decision: PsdInterchangeLossDecision): string | null {
  if (decision.alternativeCode) return resolveStudioPsdAlternative(decision.alternativeCode);
  return decision.alternative ?? null;
}

export function resolveStudioPsdSkipEntry(entry: PsdImportSkipEntry): string {
  let params = entry.params;
  if (entry.code === "groupComposite" && params?.features !== undefined) {
    const features = params.features.split("·").map((token) => {
      const key = GROUP_FEATURE_KEYS[token];
      return key
        ? resolvePsdError(key, GROUP_FEATURE_KO[token], params?.blendMode !== undefined ? { blendMode: params.blendMode } : undefined)
        : token;
    }).join("·");
    params = { ...params, features };
  }
  if (entry.code === "adjustmentUnsupported") {
    params = {
      ...params,
      psdType: params?.psdType ?? resolvePsdError(RESULT_KEYS.unknownType, RESULT_KO.unknownType),
      reason: params?.reason ?? resolvePsdError(RESULT_KEYS.noConversionReason, RESULT_KO.noConversionReason),
    };
  }
  return resolvePsdError(SKIP_KEYS[entry.code], SKIP_KO[entry.code], params);
}

/** 결과 요약(집계자 예외) 헬퍼들 — psdImportResultMessage 전용. */
export function resolveStudioPsdResultSummary(count: number): string {
  return resolvePsdError(RESULT_KEYS.summary, RESULT_KO.summary, { count: String(count) });
}

export function resolveStudioPsdResultAdjustment(
  restored: number,
  caveats: readonly { code: "approximated" | "preservedOnly"; count: number }[],
): string {
  if (caveats.length === 0) {
    return resolvePsdError(RESULT_KEYS.adjustment, RESULT_KO.adjustment, { restored: String(restored) });
  }
  const caveatText = caveats.map((caveat) => resolvePsdError(
    caveat.code === "approximated" ? RESULT_KEYS.caveatApproximated : RESULT_KEYS.caveatPreservedOnly,
    caveat.code === "approximated" ? RESULT_KO.caveatApproximated : RESULT_KO.caveatPreservedOnly,
    { count: String(caveat.count) },
  )).join(" · ");
  return resolvePsdError(RESULT_KEYS.adjustmentCaveats, RESULT_KO.adjustmentCaveats, {
    restored: String(restored),
    caveats: caveatText,
  });
}

export function resolveStudioPsdResultSkipped(count: number): string {
  return resolvePsdError(RESULT_KEYS.skipped, RESULT_KO.skipped, { count: String(count) });
}

/** 손실 명세 사유 합성의 "변환 결과 없음" 조각(집계 합성 예외). */
export function resolveStudioPsdNoConversionResult(): string {
  return resolvePsdError(RESULT_KEYS.noConversionResult, RESULT_KO.noConversionResult);
}
