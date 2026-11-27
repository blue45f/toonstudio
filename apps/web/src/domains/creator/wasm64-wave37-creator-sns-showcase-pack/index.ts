/**
 * Wasm64 Wave 37 공개 진입점 (`wasm64-wave37-creator-sns-showcase-pack`).
 *
 * - `before-after-process-card-composer`: 스케치·선화 vs 완성 채색 수직/사선 분할 와이프 카드 합성기 및
 *   15초 메이킹 릴용 비트 동기화 마일스톤 타임랩스 키프레임 선별기
 * - `sns-platform-smart-crop-carousel-planner`: 말풍선·얼굴 절단 방지 인스타그램 4:5 캐러셀 분할기,
 *   X 16:9·4분할 스마트 크롭, 9:16 HUD 안전 영역 검사 및 `ShareChannel`·Web Share 유입 추적 플래너
 * - `spoiler-mask-rights-watermark-stamper`: 스포일러 대사·반전 영역 인셋 페더 블러/모자이크 마스킹,
 *   배경 휘도 적응형 작가 서명 스탬퍼 및 `CC-BY` Rights BOM 하단 출처 표기 엔진
 */

export {
  composeBeforeAfterSplitCard,
  DEFAULT_DIAGONAL_WIPE_TILT_DEG,
  DEFAULT_DIVIDER_RGBA,
  DEFAULT_MAKING_REEL_BPM,
  DEFAULT_MAKING_REEL_DURATION_SEC,
  DEFAULT_REEL_STAGE_WEIGHTS,
  DEFAULT_SPLIT_DIVIDER_THICKNESS_PX,
  selectMilestoneTimelapseFrames,
  type BeforeAfterSplitCardInput,
  type BeforeAfterSplitCardResult,
  type CanonicalReelStage,
  type MilestoneTimelapsePlanInput,
  type MilestoneTimelapsePlanResult,
  type PixelRect,
  type ProcessStageKind,
  type ProcessStrokeSnapshot,
  type ReelStageScreenAllocation,
  type RgbaColor,
  type SelectedTimelapseKeyframe,
  type SplitWipeMode,
} from "./before-after-process-card-composer";

export {
  buildCreatorShowcaseAttribution,
  CREATOR_SHOWCASE_UTM_MEDIUM,
  DEFAULT_CREATOR_SHOWCASE_CAMPAIGN,
  DEFAULT_VERTICAL_9X16_HUD_INSETS,
  INSTAGRAM_CAROUSEL_CLASSIC_MAX_SLIDES,
  INSTAGRAM_CAROUSEL_EXTENDED_MAX_SLIDES,
  planSnsShowcaseExport,
  SNS_SHOWCASE_PLATFORM_SPECS,
  type CreatorShowcaseShareInput,
  type HudSafeZoneAudit,
  type PlannedShowcaseSlide,
  type ShowcaseAttributionPlan,
  type ShowcaseLetterboxPadding,
  type ShowcaseProtectedRegionKind,
  type ShowcaseRect,
  type ShowcaseSemanticRegion,
  type SnsPlatformPresetSpec,
  type SnsShowcaseExportPlanInput,
  type SnsShowcaseExportPlanResult,
  type SnsShowcasePresetId,
  type Vertical9x16HudInsets,
  type WebShareNavigatorLike,
} from "./sns-platform-smart-crop-carousel-planner";

export {
  applySpoilerSafeRegionBlur,
  computePixelRelativeLuminance,
  computeWcagContrastRatio,
  DEFAULT_SPOILER_BLUR_RADIUS_PX,
  formatRightsBomAttributionLine,
  isAttributionRequiredAsset,
  MIN_WATERMARK_WCAG_CONTRAST,
  SIGNATURE_LUMINANCE_INVERSION_PIVOT,
  stampCreatorSignatureAndRightsFooter,
  type RightsBomAssetCreditInput,
  type RightsFooterPlacement,
  type SignatureAndRightsStampInput,
  type SignatureAndRightsStampResult,
  type SignatureCorner,
  type SpoilerBlurMode,
  type SpoilerMaskKind,
  type SpoilerMaskRegion,
  type SpoilerRegionBlurMetric,
  type SpoilerSafeBlurInput,
  type SpoilerSafeBlurResult,
  type WatermarkInkScheme,
} from "./spoiler-mask-rights-watermark-stamper";
