/**
 * Wave 156 — 웹툰 의성어·의태어(SFX) Coons 패치 경로 워프 · 3D 원근 투영 레터링 &
 * 배경 대비(`>= 4.5:1`) 자동 다중 아웃라인 솔버 공개 배럴.
 */

export {
  auditCoonsPatchFoldOver,
  clampFinite,
  clampSafeCoonsEnvelope,
  createSfxEnvelopePreset,
  evaluateCoonsPatchPartials,
  evaluateCoonsPatchPoint,
  evaluateCubicBezier,
  evaluateCubicBezierDerivative,
  normalizeCoonsPatchCorners,
  SFX_ENVELOPE_PRESET_IDS,
  SFX_ENVELOPE_PRESET_META,
  warpSfxTextToEnvelope,
  type ClampSafeCoonsOptions,
  type CoonsJacobianCell,
  type CoonsPatchEnvelope,
  type CoonsPatchFoldOverAudit,
  type CoonsPatchPartials,
  type CubicBezierBoundary,
  type SafeCoonsClampResult,
  type SfxBoundingBox,
  type SfxEnvelopeBounds,
  type SfxEnvelopePresetId,
  type SfxEnvelopePresetMeta,
  type SfxGlyphScriptKind,
  type SfxGlyphUvBox,
  type Vec2,
  type WarpedSfxGlyph,
  type WarpedSfxTextResult,
  type WarpSfxTextOptions,
} from "./sfx-coons-envelope-warp";

export {
  canonicalizeSfxJson,
  clampSrgb,
  computeOklabDeltaE,
  computeRelativeLuminance,
  computeSfxManifestFingerprint,
  computeWcagContrastRatio,
  formatOklchCss,
  formatSrgbAsOklchCss,
  linearToSrgbChannel,
  oklabToOklch,
  oklabToSrgb,
  sha256SfxHex,
  solveAdaptiveSfxOutline,
  srgbChannelToLinear,
  srgbToOklab,
  srgbToOklch,
  type AdaptiveSfxOutlineSolution,
  type OklabColor,
  type OklchColor,
  type SfxManifestFingerprint,
  type SfxManifestFingerprintInput,
  type SfxOutlineSampleEvaluation,
  type SolveAdaptiveSfxOutlineInput,
  type SrgbColor,
} from "./sfx-contrast-outline-solver";

export {
  buildSfxSdfOutlineWgsl,
  validateSfxSdfOutlineWgsl,
  type BuildSfxSdfOutlineWgslOptions,
  type SfxSdfOutlineWgslArtifact,
  type SfxSdfOutlineWgslValidationReport,
  type SfxWgslBindingDescriptor,
} from "./sfx-sdf-outline-wgsl";

export {
  escapeSvgXml,
  renderSfxEnvelopeAuditSvg,
  summarizeSfxEnvelopeAuditKo,
  type RenderSfxEnvelopeAuditSvgInput,
  type SfxAuditCheckItem,
  type SfxAuditGrade,
  type SfxEnvelopeAuditBriefKo,
  type SummarizeSfxEnvelopeAuditInput,
} from "./sfx-warp-svg-and-report";
