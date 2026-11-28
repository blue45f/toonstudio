/**
 * Wasm64 Wave 112 공개 배럴 진입점 (`wasm64-wave112-sumi-e-hanji-capillary-ink-simulator`).
 *
 * - `hanji-capillary-ink-physics`: 결정론적 화선지 이방성 닥섬유 기질 생성, 3-필드(수분·현탁 탄소·흡착 탄소)
 *   보존형 모세관 솔버, 발묵·파묵·갈필 기법 프리셋 및 탄소 질량 보존 감사
 * - `galpil-bristle-rake-and-wgsl`: 다중 붓털 갈필·비백(Flying-White) 합성 엔진 및 WebGPU WGSL 컴퓨트 셰이더
 * - `hanji-ink-audit-svg-and-report`: 인쇄 안전 OKLCH 진단 SVG 시트 및 실무형 한국어 QA 리포트
 */

export {
  auditHanjiInkSimulation,
  clampNumber,
  createHanjiInkCanvas,
  createHanjiPaperSubstrate,
  createSeededRng,
  depositSumiInkDrop,
  getKoreanInkTechniqueConfig,
  measureSumiCarbonMassConservation,
  stepHanjiCapillarySimulation,
  type HanjiInkCanvas,
  type HanjiInkSimulationAudit,
  type HanjiPaperSubstrate,
  type HanjiRadialProfileSample,
  type HanjiSizingGrade,
  type HanjiStepSummary,
  type HanjiSubstrateOptions,
  type KoreanInkTechniqueConfig,
  type KoreanInkTechniquePreset,
  type SumiCarbonMassConservationReport,
  type SumiInkDropRecord,
  type SumiInkDropSpec,
} from "./hanji-capillary-ink-physics";

export {
  buildHanjiSumieWgsl,
  synthesizeGalpilDryBrushStroke,
  validateHanjiSumieWgsl,
  type GalpilBristlePoint,
  type GalpilBristleTrace,
  type GalpilDryBrushOptions,
  type GalpilDryBrushStrokeResult,
  type GalpilStylusSample,
  type HanjiSumieWgslArtifact,
  type HanjiWgslBindingDescriptor,
  type HanjiWgslValidationReport,
} from "./galpil-bristle-rake-and-wgsl";

export {
  escapeXmlText,
  renderHanjiInkWashAuditSvg,
  summarizeHanjiInkSessionKo,
  type HanjiAuditSvgOptions,
  type HanjiAuditSvgTheme,
  type HanjiInkSessionReportKo,
} from "./hanji-ink-audit-svg-and-report";
