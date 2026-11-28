/**
 * Wasm64 Wave 107 공개 배럴 진입점 (`wasm64-wave107-multilingual-font-subset-and-tategaki-engine`).
 *
 * - `multilingual-font-subset-and-tofu-auditor`: 5개 연재 로캘(`ko-KR`, `ja-JP`, `en-US`, `fr-FR`, `ar-SA`)
 *   무두부(Zero-Tofu) 폴백 체인 해석, WOFF2 서브셋 용량 절감 산출, 임베딩·상업 라이선스 Fail-Closed 게이트,
 *   순수 동기 ES2017 FIPS 180-4 SHA-256 서브셋 해시
 * - `japanese-tategaki-vertical-typesetter`: 우→좌 열 진행, 위→아래 글리프 배치, 세로 문장부호 90도 회전,
 *   종중횡(縦中横), 금칙 처리(禁則処理), 루비 후리가나(ルビ) 무겹침 세로쓰기 조판 엔진
 * - `multilingual-typography-svg-and-audit`: 고대비 OKLCH 인쇄 대응 SVG 검수 시트 및 자연스러운 한국어 QA 보고서
 */

export {
  DEFAULT_COMIC_FONT_REGISTRY,
  SERIALIZATION_LOCALE_CODES,
  SERIALIZATION_LOCALE_PROFILES,
  auditEpisodeFontFallbackAndSubset,
  auditMultiLocaleEpisodeBundle,
  canonicalizeTypographyJson,
  createDefaultComicFontChainForLocale,
  extractUnicodeCodePoints,
  fontSupportsCodePoint,
  formatCssUnicodeRange,
  formatUnicodeHex,
  getSerializationLocaleProfile,
  isWhitespaceOrIgnorableCodePoint,
  sha256TypographyHex,
  type CodePointRange,
  type ComicFontDescriptor,
  type EpisodeFontAuditInput,
  type EpisodeFontSubsetAuditResult,
  type EpisodeLocalizedDialogueLine,
  type FontAuditBlockingCode,
  type FontAuditBlockingReason,
  type FontLicenseViolation,
  type FontSubsetPlanEntry,
  type LocaleWritingDirection,
  type MissingTofuEntry,
  type MultiLocaleEpisodeAuditReport,
  type MultiLocaleEpisodeBundleEntry,
  type SerializationLocaleCode,
  type SerializationLocaleProfile,
} from "./multilingual-font-subset-and-tofu-auditor";

export {
  GYOMATSU_KINSOKU_CHAR_SET,
  GYOTO_KINSOKU_CHAR_SET,
  VERTICAL_ROTATED_GLYPH_SET,
  typesetJapaneseTategakiColumns,
  type TategakiColumnLayout,
  type TategakiExplicitRubySpan,
  type TategakiGlyphBounds,
  type TategakiGlyphCell,
  type TategakiKinsokuAction,
  type TategakiKinsokuAdjustment,
  type TategakiRubyAnnotation,
  type TategakiRubyCharPlacement,
  type TategakiTypesetInput,
  type TategakiTypesetLayout,
} from "./japanese-tategaki-vertical-typesetter";

export {
  escapeTypographySvgXml,
  renderMultilingualTypographySheetSvg,
  summarizeMultilingualFontAuditKo,
  type MultilingualTypographySvgOptions,
} from "./multilingual-typography-svg-and-audit";
