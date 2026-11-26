/**
 * Wasm64 Wave 21 Horizon 숏폼 연출·모바일 스토어 감사·패턴·인계·특수 인쇄 분판 엔진 공개 진입점.
 *
 * - `shortform-director-thumbnail-auditor`: 세로형 웹툰 원고 → `1080×1920`(`9:16`) 릴스·쇼츠 비트 동기화
 *   Ken-Burns 카메라 자동 연출기(말풍선 잘림 0건) 및 `120×120`·`160×210` 모바일 목록 썸네일 가독성 감사기
 * - `wang-tile-assistant-sheet-spot-foil`: 비주기 2색·4방향 왕 타일 심리스 원단·패턴 합성기,
 *   채색 어시스턴트 인계용 컬러키·광원 지정서 생성기, 단행본 특별판 별색 박·부분 UV(`±0.1mm`, `300/600 DPI`) 분판기
 *
 * 주의: 초기 번들 그래프 크기에 영향을 주지 않도록(`0B` eager impact) 필요한 시점에만 지연 로드(on-demand)한다.
 */

export {
  auditStorefrontThumbnailLegibility,
  directWebtoonShortformCamera,
  downsampleRgbaAreaBox,
  evaluateCubicEasing,
  sampleShortformCameraFrame,
  STOREFRONT_THUMBNAIL_SPECS,
  type AreaBoxDownsampleOptions,
  type CubicEasingPreset,
  type DownsampledThumbnailBuffer,
  type KenBurnsMotionStyle,
  type NormalizedRect,
  type ShortformAutoDirectorInput,
  type ShortformCameraCrop,
  type ShortformCameraKeyframe,
  type ShortformCameraShot,
  type ShortformDirectorPlan,
  type ShortformSampledFrame,
  type SourcePoint,
  type SourceRect,
  type StorefrontThumbnailAuditReport,
  type StorefrontThumbnailSpec,
  type StorefrontThumbnailTargetId,
  type ThumbnailAuditThresholds,
  type ThumbnailLegibilityAuditInput,
  type ThumbnailVariantAudit,
  type WebtoonBalloonAnchor,
  type WebtoonSourcePanel,
} from "./shortform-director-thumbnail-auditor";

export {
  convertTrapMmToPixels,
  generateAssistantHandoffSpecSheet,
  oklchToRgb,
  parseHexColorToRgb,
  rgbToHex,
  rgbToOklch,
  separateSpecialEditionSpotPlates,
  SPOT_PLATE_KINDS,
  synthesizeWangTilePattern,
  type AssistantHandoffSpecInput,
  type AssistantHandoffSpecSheet,
  type CharacterColorKeyInput,
  type CharacterHandoffPalette,
  type CharacterRegionColorInput,
  type CmykProcessPlates,
  type LockedInkLayerRule,
  type MaterialSurfaceFinish,
  type OklchColor,
  type Point2DVec,
  type PrimaryLightArrowSpec,
  type PrimaryLightSpecInput,
  type RegionSwatchEntry,
  type RgbTuple,
  type SeparatedSpotPlate,
  type ShadingLayerBlendMode,
  type SpotPlateKind,
  type SpotPlateSeparationInput,
  type SpotPlateSeparationReport,
  type SpotPlateTrapConfig,
  type WangEdgeColor,
  type WangPatternPreset,
  type WangTileSynthInput,
  type WangTileSynthResult,
} from "./wang-tile-assistant-sheet-spot-foil";
