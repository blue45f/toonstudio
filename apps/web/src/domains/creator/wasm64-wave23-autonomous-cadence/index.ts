/**
 * Wasm64 Wave 23 Autonomous Cadence 공개 진입점.
 *
 * - `geodesic-garment-color-script`: 곡면 의복(소매·망토·어깨 갑옷) 이산 지수 사상 `(r, θ)` 기반
 *   문장·타탄 체크 무끼임(`0` pinch) 래퍼, 60~80컷 회차 OKLCH 컬러 스크립트 바코드 & 감정선 조화기
 * - `korean-jamo-bm25f-manuscript-search`: 무서버(₩0) 한글 초성·자모 분해, 음운 결합 기반 조사 분리,
 *   1-자모 오타 허용 다중 필드(`dialogue`, `character`, `note`, `sfx`) BM25F 원고 검색 엔진
 *
 * 주의: 초기 엔트리 번들 영향 `0B` 유지를 위해 최상위 부작용 없이 순수 심볼만 내보낸다.
 */

export {
  buildCurvedSleeveSurfaceMesh,
  buildDomedPauldronSurfaceMesh,
  buildDrapedCapeSurfaceMesh,
  computeGeodesicGarmentWrap,
  computePerceptualWarmth,
  harmonizeEpisodeColorScript,
  oklabToOklch,
  oklchToOklab,
  oklchToSrgb,
  sampleGarmentPatternOnWrap,
  srgbToOklab,
  srgbToOklch,
  type ColorScriptBarcodeCell,
  type CutSwatchSample,
  type EmotionalArcPhaseSummary,
  type EpisodeColorScriptHarmonizeResult,
  type EpisodeColorScriptOptions,
  type EpisodeCutInput,
  type GarmentPatternKind,
  type GarmentPatternSample,
  type GarmentPatternSpec,
  type GarmentSurfaceMesh,
  type GeodesicAnchorSpec,
  type GeodesicGarmentWrapResult,
  type GeodesicVertexCoord,
  type IsometricStretchMetrics,
  type NarrativeBeatTag,
  type OklabColor,
  type OklchColor,
  type PreservedIntentionalTransition,
  type SrgbColor,
  type TriangleFace,
  type Vec2,
  type Vec3,
  type WhiteBalanceOutlierFinding,
} from "./geodesic-garment-color-script";

export {
  computeBoundedJamoDistance1,
  decomposeHangulText,
  DEFAULT_BM25F_FIELD_CONFIGS,
  KoreanJamoBm25fManuscriptEngine,
  stripKoreanParticle,
  tokenizeManuscriptText,
  type Bm25fFieldConfig,
  type HangulDecomposition,
  type ManuscriptBm25fConfig,
  type ManuscriptCutDocument,
  type ManuscriptFieldKey,
  type ManuscriptIndexStats,
  type ManuscriptMatchKind,
  type ManuscriptSearchHit,
  type ManuscriptSearchQueryOptions,
  type ManuscriptSearchResponse,
  type ManuscriptTermMatchDetail,
} from "./korean-jamo-bm25f-manuscript-search";
