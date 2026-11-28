/**
 * Wasm64 Wave 85 공개 배럴 진입점 (`wasm64-wave85-ip-merch-diecut-emoticon-pack`).
 *
 * - `alpha-matte-and-diecut-offset-solver`: 캐릭터 알파 매트 분리(사전 키잉·단색 플러드필 프린지 정화),
 *   정밀 2D Meijster EDT/SDF, Marching Squares + Douglas-Peucker/Chaikin 칼선 생성 및 초크 화이트 백킹 판
 * - `merch-print-templates-and-cmyk-packer`: 한국·글로벌 굿즈 5종 표준 인쇄 규격, GCR CMYK 총잉크량(TAC) 검사,
 *   스탠드 하단 28×4mm 탭·55×85mm 포토카드 기하 및 24fps C1 심리스 이모티콘 루프 합성기
 * - `merch-production-pack-exporter`: 플로터 납품용 3레이어 SVG(`Artwork_CMYK`, `Spot_White_Underbase`,
 *   `CutContour`) 생성기 및 Rights BOM 상업 라이선스 게이트 포함 통합 릴리스 매니페스트 빌더
 */

export {
  MM_PER_INCH,
  computeExactEuclideanDistanceField,
  computeExactSignedDistanceField,
  extractCharacterCutoutAlpha,
  generateStickerDieCutContour,
  generateWhiteUnderbasePlate,
  mmToPx,
  pointsToSvgPath,
  pxToMm,
  type BoundingBox2D,
  type CharacterCutoutMode,
  type CharacterCutoutOptions,
  type CharacterCutoutResult,
  type DieCutContourOptions,
  type DieCutContourResult,
  type KeyringHoleGeometry,
  type Point2D,
  type RgbaImageInput,
  type WhiteUnderbaseOptions,
  type WhiteUnderbasePlateResult,
} from "./alpha-matte-and-diecut-offset-solver";

export {
  EMOTICON_PLATFORM_SPECS,
  MERCH_PRODUCT_TEMPLATES,
  buildAcrylicStandeeTabGeometry,
  buildCollectiblePhotocardSpec,
  convertSrgbToCmyk,
  evaluateCmykPrintReadiness,
  synthesizeSeamlessEmoticonLoop,
  type CmykColorSample,
  type CmykPrintReadinessReport,
  type EmoticonKeyframe,
  type EmoticonLoopClosureAudit,
  type EmoticonLoopSynthesisInput,
  type EmoticonLoopSynthesisResult,
  type EmoticonMotionPreset,
  type EmoticonPlatformId,
  type EmoticonPlatformSpec,
  type KeyringHoleTemplateSpec,
  type MerchProductTemplateSpec,
  type MerchProductType,
  type PhotocardGeometrySpec,
  type StandeeTabGeometry,
  type StandeeTabTemplateSpec,
} from "./merch-print-templates-and-cmyk-packer";

export {
  buildIpMerchReleasePackManifest,
  renderMerchProductionSvg,
  type IpMerchReleasePackInput,
  type IpMerchReleasePackManifest,
  type MerchLicenseVerificationStatus,
  type MerchPreflightCheck,
  type MerchProductionSvgInput,
  type MerchProductionSvgResult,
  type MerchRightsBomAsset,
  type ProductionSvgLayerId,
} from "./merch-production-pack-exporter";
