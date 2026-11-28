/**
 * Wave 132 — 웹툰 불법 유출 추적·AI 무단 학습 방어 8×8 DCT 중주파 비가시 워터마크
 * & 크롭·재압축 내성 포렌식 보호 커널 공개 API 배럴.
 */

export {
  DEFAULT_WATERMARK_STRENGTH,
  FORENSIC_CODEWORD_BIT_LENGTH,
  FORENSIC_CRC_BIT_LENGTH,
  FORENSIC_PAYLOAD_BIT_LENGTH,
  ForensicWatermarkError,
  JPEG_Q50_LUMA_TABLE,
  MACRO_TILE_BLOCKS,
  MID_BAND_DCT_PAIRS,
  SYNC_PREAMBLE_BITS,
  buildJpegLumaQuantTable,
} from "./forensic-watermark-types";

export type {
  AntiScrapeRightsManifest,
  AntiScrapeRightsSpec,
  BitValue,
  DctCoord,
  DctMidBandPair,
  EncodedForensicPayload,
  ForensicPayloadSpec,
  ForensicShieldReportKo,
  ForensicShieldSvgOptions,
  ForensicShieldSvgTheme,
  ForensicWatermarkErrorCode,
  ForensicWatermarkWgslArtifact,
  ForensicWatermarkWgslValidationResult,
  ForensicWgslBindingSpec,
  PiracyAttackKind,
  PiracyAttackResult,
  PiracyAttackSuiteResult,
  WatermarkDetectOptions,
  WatermarkDetectResult,
  WatermarkEmbedOptions,
  WatermarkEmbedResult,
  WatermarkPixelFormat,
  WatermarkTileImage,
} from "./forensic-watermark-types";

export {
  buildForensicWatermarkWgsl,
  bytesToHexLower,
  canonicalizeJsonForHash,
  compileAntiScrapeRightsManifest,
  encodeUtf8Pure,
  sha256Bytes,
  sha256Hex,
  validateForensicWatermarkWgsl,
} from "./anti-scrape-policy-and-wgsl";

export {
  computeForensicCrc8,
  detectInvisibleDctWatermark,
  embedInvisibleDctWatermark,
  encodeForensicPayloadBits,
  forwardDct8x8,
  inverseDct8x8,
  matchDetectedPayloadToRecipients,
  verifyDct8x8RoundTrip,
} from "./frequency-watermark-dct-kernel";

export {
  createSyntheticWebtoonTile,
  simulatePiracyAttack,
  simulatePiracyAttackAndDetectWatermark,
} from "./piracy-attack-simulator";

export {
  escapeSvgXml,
  renderForensicWatermarkShieldSvg,
  summarizeForensicWatermarkShieldKo,
} from "./forensic-shield-svg-and-report";
