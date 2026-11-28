/**
 * Wasm64 Wave 138 공개 배럴 진입점
 * (`wasm64-wave138-multiplatform-smart-vertical-slice-repacker`).
 *
 * - `platform-slice-types`: 네이버웹툰·카카오페이지·LINE WEBTOON·픽코마·스튜디오 HD 아카이브
 *   5종 출고 규격 프리셋, 보호 영역 정규화, 결정론적 행 시각 에너지 생성 및 바이트 추정기
 * - `dp-smart-slice-solver`: 단순 고정 분할 vs 동적 계획법(DP) 절단 제로 리패킹 솔버,
 *   품질 계단 자동 조정 및 멀티 플랫폼 일괄 번들 컴파일러
 * - `sha256-slice-manifest`: 순수 ES2017 동기 FIPS 180-4 SHA-256 및 정규 JSON 직렬화
 * - `slice-plan-svg-and-report`: 순수 OKLCH 슬라이스 검수 지도 SVG 렌더러 및 한국어 출고 QA 브리프
 */

export {
  PLATFORM_SLICE_PRESETS,
  PLATFORM_SLICE_PRESET_IDS,
  buildDeterministicRowEnergyProfile,
  clampFinite,
  estimateSliceEncodedBytes,
  getPlatformSlicePreset,
  normalizeManuscriptForPlatform,
  type MultiPlatformBundleAggregate,
  type MultiPlatformSliceBundle,
  type NaiveVsSmartSliceComparison,
  type NormalizedManuscriptForPlatform,
  type PlatformSliceBudgetSummary,
  type PlatformSlicePlan,
  type PlatformSlicePreset,
  type PlatformSlicePresetId,
  type ProtectedSpan,
  type ProtectedSpanKind,
  type ScaledProtectedSpan,
  type SliceAuditGrade,
  type SliceCutViolation,
  type SliceImageFormat,
  type SlicePlanItem,
  type SliceStrategy,
  type VerticalManuscriptInput,
} from "./platform-slice-types";

export {
  compareNaiveVsSmartSlices,
  compileMultiPlatformSliceBundle,
  compileSmartPlatformSlices,
  planNaiveFixedHeightSlices,
  type MultiPlatformBundleOptions,
  type SmartSliceSolverOptions,
} from "./dp-smart-slice-solver";

export { canonicalJsonStringify, sha256HexSync } from "./sha256-slice-manifest";

export {
  escapeSliceSvgXml,
  renderSmartSliceComparisonSvg,
  summarizeMultiPlatformSliceAuditKo,
  type RenderSmartSliceSvgOptions,
  type SummarizeSliceAuditKoOptions,
} from "./slice-plan-svg-and-report";
