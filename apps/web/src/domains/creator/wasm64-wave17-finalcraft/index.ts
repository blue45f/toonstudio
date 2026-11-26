/**
 * Wasm64 Wave 17 FinalCraft 마감 작화·날씨 합성·출판 프리플라이트·인체공학 필압 엔진 공개 진입점.
 *
 * - `catenary-cloth-weather-wetness`: 쌍곡선 코사인 현수선(`y = a cosh((x - x0)/a) + y0`) 옷주름 장력·
 *   조임점 방사형 주름 가이드 솔버 및 깊이·법선(`N_y`)·처마/우산 상부 차폐 기반 날씨·젖은 표면 반사 합성기
 * - `print-spine-elastic-tail-deepzoom`: 단행본 책등 두께·중철/무선 접지 크리프·도련/안전선/DPI 프리플라이트,
 *   화자 입 고정·타 인물 얼굴 AABB 회피 탄성 말풍선 꼬리 솔버, DeepZoom(DZI)/IIIF `level 0..L` 정적 타일
 *   피라미드 익스포터, 개인화 필압 단조 3차 베지어 응답 곡선 피터
 *
 * 주의: Studio 초기 진입 그래프에서 정적으로 import하지 않고 필요한 시점에만 지연 로드(on-demand)한다.
 */

export {
  composeDepthOccludedWeatherWetness,
  evaluateCatenaryCurveY,
  FABRIC_MATERIAL_PRESETS,
  solveCatenaryClothFoldGuides,
  type CatenaryClothGuideReport,
  type CatenaryClothSolverInput,
  type CatenaryYAxisDirection,
  type ClothAnchorPin,
  type ClothAnchorRole,
  type ClothPoint2D,
  type ClothSpanSpec,
  type ClothVec3,
  type DepthOccludedWeatherInput,
  type DepthOccludedWeatherResult,
  type FabricMaterialPreset,
  type FabricPhysicalProfile,
  type OverheadRoofEaveOccluder,
  type OverheadUmbrellaOccluder,
  type OverheadWeatherOccluder,
  type RadialTensionFanLine,
  type RgbTriplet,
  type SolvedCatenaryDrapeCurve,
  type WeatherCompositionStats,
  type WeatherPrecipitationMode,
  type WeatherVec3,
} from "./catenary-cloth-weather-wetness";

export {
  buildDeepZoomTilePyramid,
  calculatePrintPreflightAndImposition,
  fitErgonomicPressureResponseCurve,
  PRINT_PAPER_STOCK_PRESETS,
  solveElasticBalloonTail,
  type CriticalSafeItemSpec,
  type CubicBezierCurve2D,
  type DeepZoomLevelSummary,
  type DeepZoomPyramidInput,
  type DeepZoomPyramidResult,
  type DeepZoomTileFormat,
  type DeepZoomTileSlice,
  type ElasticBalloonTailInput,
  type ElasticBalloonTailResult,
  type ErgonomicPressureCurveResult,
  type ErgonomicPressureFitInput,
  type IiifImageApi3Manifest,
  type KeepOutAabb,
  type MonotonicCubicBezier2D,
  type PlacedCutRasterSpec,
  type PressureCurvePoint2D,
  type PrintBindingMethod,
  type PrintBoxMm,
  type PrintPagePreflightInput,
  type PrintPaperStockId,
  type PrintPaperStockSpec,
  type PrintPreflightInput,
  type PrintPreflightIssue,
  type PrintPreflightIssueKind,
  type PrintPreflightReport,
  type QuadraticBezierCurve2D,
  type RawStylusSample,
  type SignatureSheetCreep,
  type SpeechBalloonBoundary,
  type StylusHandProfile,
  type Vec2,
} from "./print-spine-elastic-tail-deepzoom";
