/**
 * Wasm64 Wave 109 공개 배럴 진입점 (`wasm64-wave109-smart-thumbnail-crop-and-platform-packager`).
 *
 * - `smart-thumbnail-crop-solver`: 6종 웹툰·홍보 규격 스마트 눈높이 크롭, 주연 얼굴 100% 보존,
 *   플랫폼 UI 배지·타이틀바 회피, 업스케일 안전 경고 솔버
 * - `anti-ringing-lanczos3-resampler`: 순수 분리형 2D 안티링잉 Lanczos-3 만화 선화 리샘플러,
 *   경계 선명도(acutance) 및 링잉 오버슈트 탐지기, 순수 ES2017 FIPS 180-4 SHA-256 매니페스트 컴파일러
 * - `thumbnail-crop-sheet-svg-and-audit`: 인쇄 안전 고대비 OKLCH 검수 시트 SVG 및 한국어 출고 QA 보고서
 */

export {
  ALL_PLATFORM_THUMBNAIL_PRESET_IDS,
  PLATFORM_THUMBNAIL_PRESETS,
  SmartThumbnailError,
  computeNaiveCenterCrop,
  solveSmartThumbnailCrops,
  type CropSubjectSpec,
  type PlatformThumbnailPresetId,
  type PlatformThumbnailPresetSpec,
  type PlatformUiBadgeZone,
  type Point2D,
  type ProjectedUiBadgeRect,
  type Rect2D,
  type SmartThumbnailCropSolution,
  type SmartThumbnailErrorCode,
  type SmartThumbnailSolverOptions,
  type SmartThumbnailSourceSpec,
  type SolvedPresetCrop,
  type SubjectCropCoverage,
  type UiBadgeAnchor,
} from "./smart-thumbnail-crop-solver";

export {
  ResamplerError,
  compilePlatformThumbnailPackageManifest,
  computeTileEdgeAcutance,
  lanczos3Weight,
  measureInkEdgeRingingOvershoot,
  resampleTileBilinear,
  resampleTileLanczos3,
  sha256HexSync,
  type CompilePlatformThumbnailPackageInput,
  type InkEdgeRingingReport,
  type Lanczos3ResampleOptions,
  type PlatformThumbnailDeliverable,
  type PlatformThumbnailPackageReport,
  type ResamplerErrorCode,
  type ResamplerPackageAuditSummary,
  type RgbaTileBuffer,
  type TileEdgeAcutanceMetrics,
} from "./anti-ringing-lanczos3-resampler";

export {
  renderSmartThumbnailSheetSvg,
  summarizePlatformThumbnailPackageKo,
  type SmartThumbnailSheetSvgResult,
} from "./thumbnail-crop-sheet-svg-and-audit";
