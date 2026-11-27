/**
 * Wasm64 Wave 59 공개 배럴 진입점 (`wasm64-wave59-multilingual-balloon-reflow-l10n`).
 *
 * - `multilingual-typography-metrics`: 한국어·영어·일본어(`vertical-rl` 포함)·중국어(간체/번체)·
 *   스페인어·프랑스어 글리프 폭 메트릭, 행두/행말 금칙 처리(Kinsoku), 음절 하이픈 및
 *   말풍선 타원 다이아몬드 문단 조판기
 * - `adaptive-balloon-reflow-solver`: 번역 대사 팽창·축소(`0.65× ~ 1.85×`) 이진 탐색 자동 피팅,
 *   모바일 800px 최소 가독성 하한 보호, 비파괴 말풍선 확장 및 캐릭터 얼굴 Keepout 충돌 회피 솔버
 * - `global-episode-l10n-packager`: 에피소드 전체 컷 다국어 일괄 리플로우 검증, 언어별 폰트 서브셋
 *   매니페스트 및 SVG/Canvas 2D 렌더 지시서 출고 패키저
 */

export {
  GYOMATSU_KINSOKU_CHARS,
  GYOTO_KINSOKU_CHARS,
  MULTILINGUAL_TYPOGRAPHY_PROFILES,
  SUPPORTED_L10N_LOCALES,
  classifyTypographyChar,
  computeContourChordsPx,
  estimateLocalizedTextExpansion,
  hyphenateLatinWord,
  layoutMultilingualBalloonLines,
  measureGlyphAdvanceEm,
  measureTextRunEm,
  type BalloonContourKind,
  type ExpansionCategory,
  type ExpansionReflowStrategy,
  type LaidOutBalloonLine,
  type LocaleTypographyProfile,
  type LocalizedTextExpansionEstimate,
  type MultilingualBalloonLayoutInput,
  type MultilingualBalloonLayoutResult,
  type SupportedL10nLocale,
  type TypographyCharClass,
  type TypographyScriptFamily,
  type TypographyWritingMode,
} from "./multilingual-typography-metrics";

export {
  computeBalloonRectOverlapAreaPx2,
  reflowLocalizedSpeechBalloon,
  resolveBalloonKeepoutCollisions,
  type AdaptiveBalloonReflowResult,
  type AdaptiveReflowOptions,
  type BalloonGeometrySpec,
  type CutFrameBounds,
  type KeepoutCollisionItem,
  type KeepoutCollisionResolutionResult,
  type KeepoutRect,
  type KeepoutRegionKind,
  type NonDestructiveGeometryDelta,
  type Point2D,
  type ReflowDiagnosticWarning,
  type ReflowWarningCode,
} from "./adaptive-balloon-reflow-solver";

export {
  buildGlobalLocalizationBundle,
  type BalloonRenderInstruction,
  type Canvas2DRenderOp,
  type CutRenderDirective,
  type EpisodeBalloonL10nSpec,
  type EpisodeCutL10nSpec,
  type GlobalEpisodeL10nInput,
  type GlobalLocalizationExportManifest,
  type GlobalLocalizationSummary,
  type LocaleEpisodeWarningItem,
  type LocaleFontManifestEntry,
  type LocaleL10nQualityReport,
  type LocaleLocalizationPackage,
} from "./global-episode-l10n-packager";
