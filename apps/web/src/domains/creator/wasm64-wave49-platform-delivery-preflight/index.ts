/**
 * Wasm64 Wave 49 공개 진입점 (`wasm64-wave49-platform-delivery-preflight`).
 *
 * - `platform-delivery-spec-rules`: 네이버 웹툰(`690px`/`800px`), 카카오페이지·웹툰(`720px`/`1080px`),
 *   글로벌 세로 스크롤(`800px`), 단행본 인쇄(`300 DPI`, 재단 `3mm`) 출고 규격 검증 및
 *   대사·얼굴 비절단 안전 슬라이스 절단선(Safe Slice Seam Planner) 산출기
 * - `mobile-readability-and-cut-seam-auditor`: `375px` 모바일 축소 배율 기준 말풍선 폰트 가독성
 *   (`< 11.5px` 경고, `< 9.5px` 차단), 컷 경계 침범, WCAG `>= 4.5:1` 명도 대비, 슬라이스 절단선 충돌 감사 및
 *   `suggestedFontPx`·`safeSliceY` 자동 보정 제안기
 * - `white-spec-and-bleed-hole-detector`: 채색 완료 RGBA 컷 버퍼의 고립 미세 흰 점·투명 구멍
 *   (`1~36px²`) Connected-Component Labeling 탐지 및 주변 채색 최빈값 1클릭 자동 메우기(`healWhiteSpecs`)
 */

export {
  getPlatformDeliveryPreset,
  listPlatformDeliveryPresets,
  mmToPixelsAtDpi,
  planSafeSliceSeams,
  PLATFORM_DELIVERY_PRESETS,
  validateDeliveryAgainstSpec,
  type DeliveryColorSpace,
  type DeliveryImageFormat,
  type DeliveryIssueSeverity,
  type DeliverySpecCheckInput,
  type DeliverySpecIssue,
  type DeliverySpecIssueCode,
  type DeliverySpecValidationReport,
  type PlannedSliceSeam,
  type PlannedSliceSegment,
  type PlatformDeliveryPresetId,
  type PlatformDeliverySpec,
  type ProtectedCutZone,
  type ProtectedZoneKind,
  type SafeSlicePlanInput,
  type SafeSlicePlanResult,
  type VerticalGutterBand,
} from "./platform-delivery-spec-rules";

export {
  auditMobileReadabilityAndCutSeams,
  computeEffectiveMobileFontPx,
  computeWcagContrastRatio,
  DEFAULT_MOBILE_VIEWPORT_WIDTH_PX,
  DEFAULT_TARGET_MOBILE_FONT_PX,
  MOBILE_FONT_BLOCK_THRESHOLD_PX,
  MOBILE_FONT_WARN_THRESHOLD_PX,
  suggestAccessibleTextColor,
  WCAG_AA_MIN_CONTRAST_RATIO,
  type BoundaryIntrusionSides,
  type BubbleReadabilityMetric,
  type MobileAuditIssue,
  type MobileAuditIssueCode,
  type MobileAuditSeverity,
  type MobileReadabilityAuditInput,
  type MobileReadabilityAuditReport,
  type PanelCutFrame,
  type RectBounds,
  type RgbColor,
  type SliceSeamFixSuggestion,
  type SpeechBubbleAuditTarget,
} from "./mobile-readability-and-cut-seam-auditor";

export {
  DEFAULT_LINEART_MAX_CHROMA,
  DEFAULT_LINEART_MAX_LUMA,
  DEFAULT_MAX_SPEC_AREA_PX,
  DEFAULT_MAX_WHITE_CHROMA,
  DEFAULT_MIN_SPEC_AREA_PX,
  DEFAULT_TRANSPARENT_ALPHA_THRESHOLD,
  DEFAULT_WHITE_LUMA_THRESHOLD,
  detectWhiteSpecsAndBleedHoles,
  healWhiteSpecs,
  type DetectedSpecKind,
  type DetectedWhiteSpec,
  type HealWhiteSpecsOptions,
  type HealWhiteSpecsResult,
  type RgbaColor,
  type RgbaImageBuffer,
  type SpecExclusionRect,
  type WhiteSpecDetectionReport,
  type WhiteSpecDetectorOptions,
} from "./white-spec-and-bleed-hole-detector";
