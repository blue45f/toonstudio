/**
 * Wasm64 Wave 103 공개 배럴 진입점 (`wasm64-wave103-perspective-crowd-and-foliage-scatter-engine`).
 *
 * - `horizon-perspective-projection-and-density`: 핀홀 지면 원근 정·역투영,
 *   눈높이 지평선 잠금 법칙(Horizon Eye-Level Law), 로그 깊이 기반 대기 원근 스타일링
 * - `poisson-crowd-and-foliage-scatter-solver`: 7종 웹툰 아키타입 카탈로그,
 *   가변 반경 포아송 디스크 군중·식생 배치, 보호구역 침범 차단, 복제 방지 다양성 솔버
 * - `crowd-stage-svg-and-audit`: 순수 OKLCH 고대비 원근 스테이지 SVG 및 한국어 배경 연출 감사 리포트
 */

export {
  assertValidPerspectiveGroundStage,
  boxesIntersect,
  clamp01,
  clampNumber,
  computeAtmosphericDepthStyling,
  computeBoxIntersectionArea,
  computeGroundSpanAtDepth,
  computeStandingEyeScreenY,
  DEFAULT_PERSPECTIVE_STAGE,
  expandBoundingBox,
  generatePerspectiveGroundGrid,
  groundYToWorldDepthMeters,
  projectStandingFigure,
  resolvePrincipalXPx,
  resolveStageDepthRange,
  screenGroundToWorldXZ,
  validatePerspectiveGroundStage,
  worldDepthToGroundYPx,
  worldDepthToScreenHeightPx,
  worldToScreenPoint,
  type AtmosphericDepthStyle,
  type DetailTier,
  type GroundSpanMetrics,
  type PerspectiveGroundGrid,
  type PerspectiveGroundStage,
  type PerspectiveGridLine,
  type ProjectedStandingFigure,
  type ResolvedStageDepthRange,
  type ScreenBoundingBox,
  type ScreenPoint2D,
  type StageValidationResult,
  type WorldGroundPoint2D,
} from "./horizon-perspective-projection-and-density";

export {
  buildVariantSignature,
  computeDiversityEntropy01,
  createMulberry32,
  DEFAULT_SCATTER_ASSET_TEMPLATES,
  mulberry32,
  SCATTER_TEMPLATE_BY_ID,
  scatterPerspectiveCrowdAndFoliage,
  type CrowdScatterMetrics,
  type CrowdScatterOptions,
  type CrowdScatterResult,
  type DepthDistributionMode,
  type EyeHeightLockMode,
  type KeepOutRole,
  type KeepOutZone,
  type PlacedScatterEntity,
  type ScatterArchetypeId,
  type ScatterAssetCategory,
  type ScatterAssetTemplate,
} from "./poisson-crowd-and-foliage-scatter-solver";

export {
  escapeXmlText,
  renderPerspectiveCrowdStageSvg,
  summarizeCrowdScatterKo,
  type CrowdScatterAuditKo,
  type CrowdStageSvgOptions,
  type CrowdStageSvgTheme,
} from "./crowd-stage-svg-and-audit";
