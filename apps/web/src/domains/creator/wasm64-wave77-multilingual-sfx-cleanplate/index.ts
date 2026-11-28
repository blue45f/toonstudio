/**
 * Wasm64 Wave 77 공개 배럴 진입점 (`wasm64-wave77-multilingual-sfx-cleanplate`).
 *
 * - `sfx-mask-and-cleanplate-inpainter`: 한국어 손글씨 효과음(SFX) 영역 분리 +
 *   구조 텐서 기반 이방성 이중조화 확산 & 스크린톤 패치 매칭 무손실 Clean-Plate 배경 복원기
 * - `multilingual-sfx-lexicon-and-brush-vectorizer`: 7개 로케일(`ko`/`ja`/`en`/`fr`/`es`/`zh-Hant`/`th`)
 *   웹툰 의성어·의태어 시맨틱 사전, 자모 분해 음차 폴백 및 보호 말풍선 회피 브러시 벡터 합성기
 * - `sfx-localization-pack-exporter`: 7개 로케일 비파괴 변형 번들 컴파일러,
 *   갈필·아크 레이어드 SVG 오버레이 렌더러 및 Rights BOM 라이선스 감사 매니페스트
 */

export {
  applyCleanPlatePatchToPanel,
  extractSfxAlphaMask,
  measureCleanPlateErrorAgainstGroundTruth,
  reconstructCleanPlateBehindSfx,
  restoreOriginalSfxFromCleanPlatePatch,
  type CleanPlateInpaintOptions,
  type CleanPlatePatch,
  type CleanPlateQualityMetrics,
  type CleanPlateReconstructionResult,
  type Point2D,
  type ReconstructionErrorMetrics,
  type Rect2D,
  type RgbaPanelBuffer,
  type SfxAlphaMaskResult,
  type SfxMaskExtractionOptions,
} from "./sfx-mask-and-cleanplate-inpainter";

export {
  COMIC_SFX_LEXICON,
  SUPPORTED_SFX_LOCALES,
  VERTICAL_WRITING_LOCALES,
  localeSupportsVerticalWriting,
  localizeComicSfxEntry,
  synthesizeLocalizedSfxVectorLayer,
  type BrushVectorStrokePath,
  type ComicSfxLexiconEntry,
  type LocalizedSfxLexiconResult,
  type LocalizedSfxVectorLayer,
  type OriginalSfxVisualEnergySpec,
  type SfxBrushTextureStyle,
  type SfxColorGradientSpec,
  type SfxLocale,
  type SfxMatchKind,
  type SfxStrokeWeightProfile,
  type SfxWritingMode,
  type SynthesizedSfxGlyphNode,
  type VectorArcCurveSpec,
} from "./multilingual-sfx-lexicon-and-brush-vectorizer";

export {
  compileMultilingualSfxVariantPack,
  renderLocalizedSfxSvgOverlay,
  type BrushAssetRightsSpec,
  type CompileMultilingualSfxPackInput,
  type CompiledLocalizedSfxVariant,
  type LocaleFontRightsSpec,
  type MultilingualSfxVariantPack,
  type RenderedLocalizedSfxSvgOverlay,
  type RightsBomAuditManifest,
  type RightsBomClearanceStatus,
  type SvgOverlayRenderOptions,
} from "./sfx-localization-pack-exporter";
