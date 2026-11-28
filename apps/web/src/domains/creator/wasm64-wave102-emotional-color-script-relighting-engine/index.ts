/**
 * Wasm64 Wave 102 공개 배럴 진입점 (`wasm64-wave102-emotional-color-script-relighting-engine`).
 *
 * - `oklch-chromatic-adaptation-relighter`: sRGB ↔ Linear ↔ Oklab/OKLCH 정밀 변환,
 *   색상각 보존 색역 매핑, 6종 물리 조명 프리셋, Anti-Mud 암부 색이동 & 피부색 기억색 보호 재조명,
 *   소형 RGBA 타일 결정론적 재조명
 * - `episode-color-script-arc-compiler`: 에피소드 감정 색채 스크립트 아크 컴파일러,
 *   절정(climax) 명암·채도 정점 검증, WCAG 2.1 말풍선 가독성 검증, WebGPU WGSL 셰이더 생성·검증
 * - `color-script-strip-svg-and-audit`: OKLCH 전용 고대비 색채 스크립트 필름스트립 SVG 및 한국어 검토 보고서
 */

export {
  LIGHTING_MOOD_PRESETS,
  LIGHTING_MOOD_PRESET_IDS,
  computeOklabDeltaE,
  findMaxInGamutChroma,
  formatOklchCss,
  gamutMapOklch,
  getLightingMoodPreset,
  interpolateHueDeg,
  linearChannelToSRgb,
  linearRgbToOklab,
  linearToSRgb,
  normalizeHueDeg,
  oklabToLinearRgbUnclamped,
  oklabToOklch,
  oklabToSRgb,
  oklchToOklab,
  oklchToSRgb,
  relightCompactRgbaTile,
  relightFlatPaletteForMood,
  sRgbChannelToLinear,
  sRgbToLinear,
  sRgbToOklab,
  sRgbToOklch,
  shortestHueDeltaDeg,
  type ColorMathInput,
  type FlatColorSwatch,
  type FlatSwatchRole,
  type LightingMoodPreset,
  type LightingMoodPresetId,
  type LinearRgbColor,
  type OklabColor,
  type OklchColor,
  type RelightPaletteOptions,
  type RelightRgbaTileOptions,
  type RelitColorSwatch,
  type RelitPaletteResult,
  type RelitRgbaTileResult,
  type SrgbColor,
} from "./oklch-chromatic-adaptation-relighter";

export {
  buildColorScriptRelightingWgsl,
  compileEpisodeColorScriptArc,
  computeWcagContrastRatio,
  computeWcagRelativeLuminance,
  validateColorScriptWgsl,
  type AdjacentSceneColorTransition,
  type BuildWgslRelightingOptions,
  type ClimaxPeakVerification,
  type CompileEpisodeColorScriptOptions,
  type CompiledColorScriptScene,
  type EmotionArcPhase,
  type EpisodeColorScriptArc,
  type EpisodeSceneInput,
  type SceneBalloonContrastCheck,
  type SceneTransitionKind,
  type WgslValidationResult,
} from "./episode-color-script-arc-compiler";

export {
  escapeColorScriptXml,
  renderEpisodeColorScriptSvg,
  summarizeColorScriptAuditKo,
  type ColorScriptAuditSummaryOptions,
  type EpisodeColorScriptSvgOptions,
} from "./color-script-strip-svg-and-audit";
