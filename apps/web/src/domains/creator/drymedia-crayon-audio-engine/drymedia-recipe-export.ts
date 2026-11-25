import { DUAL_SCALE_GRAIN_TILE_SIZE, formatOklch, getActiveDryMediaConfig, getDryMediaBrushPreset, getDryMediaPaperSubstrate,
  simulateDryMediaStrokeMicrostructure, synthesizeDryMediaFoleyFrame,
  type DryMediaLabSession, type DryMediaMicrostructureResult, type DryMediaFoleyFrame, type DualScalePaperGrainLut } from "./drymedia-crayon-audio-engine";
import { assertModelMatches, assertRecipeSession, canonicalConfig } from "./drymedia-input-contract";

/** WGSL 셰이더 + Web Audio 절차적 Foley 레시피 JSON 문자열을 직렬화한다. */
export function exportDryMediaRecipeJson(
  session: DryMediaLabSession, suppliedMicrostructure: DryMediaMicrostructureResult, suppliedFoley: DryMediaFoleyFrame, lut?: DualScalePaperGrainLut,
): string {
  assertRecipeSession(session);
  const active = canonicalConfig(getActiveDryMediaConfig(session));
  const microstructure = simulateDryMediaStrokeMicrostructure({ ...active, lut });
  const foley = synthesizeDryMediaFoleyFrame({ ...active, volume: active.foleyVolume, muted: active.foleyMuted });
  assertModelMatches(suppliedMicrostructure, microstructure);
  assertModelMatches(suppliedFoley, foley);
  const preset = getDryMediaBrushPreset(active.brushId);
  const paper = getDryMediaPaperSubstrate(active.paperId);
  return JSON.stringify({
    schema: "toonstudio.drymedia-crayon-audio-recipe.v1",
    sourceKind: "cpu-physical-example", artworkApplied: false, gpuMeasured: false, loudnessMeasured: false,
    hearingSafetyGuaranteed: false, persistenceImplemented: false,
    audioGraphKind: "modeled-recipe-not-runtime-capture", spectrumMeasured: false,
    sessionStatus: session.status, appliedCount: session.appliedCount,
    brush: { id: preset.id, nameKo: preset.nameKo, nameEn: preset.nameEn, pigmentOklch: formatOklch(preset.pigmentOklch) },
    paper: { id: paper.id, nameKo: paper.nameKo, toothPitchPx: paper.paperToothPitchPx, tileResolutionPx: DUAL_SCALE_GRAIN_TILE_SIZE },
    config: active,
    microstructure: {
      toothThreshold: microstructure.dualScaleTooth.toothThreshold,
      peakDepositRatio: microstructure.dualScaleTooth.peakDepositRatio,
      sparkleValleyExposure: microstructure.dualScaleTooth.sparkleValleyExposure,
      contactWidthMultiplier: microstructure.tiltShading.contactWidthMultiplier,
      granulationContrast: microstructure.tiltShading.granulationContrast,
      sumiStrandCount: microstructure.tiltShading.sumiBristle.strandCount,
      valleyFillRatio: microstructure.burnishAndCrumb.valleyFillRatio,
      crumbCount: microstructure.burnishAndCrumb.crumbCount,
      dryMediaRealismScore: microstructure.dryMediaRealismScore,
    },
    gpuShaderBudget120Hz: {
      costModelSource: microstructure.gpuBudget120Hz.costModelSource,
      textureSamplesPerFragment: microstructure.gpuBudget120Hz.textureSamplesPerFragment,
      shaderThresholdInstructionCount: microstructure.gpuBudget120Hz.shaderThresholdInstructionCount,
      additionalGpuCostMs: microstructure.gpuBudget120Hz.additionalGpuCostMs,
      totalEstimatedFrameMs: microstructure.gpuBudget120Hz.totalEstimatedFrameMs,
      wgslSnippet: microstructure.gpuBudget120Hz.wgslSnippet,
    },
    acousticFoley: {
      toothCrossingHz: foley.toothCrossingHz, primaryResonanceHz: foley.primaryResonanceHz, primaryQ: foley.primaryQ,
      safetyLimiterCeilingLufs: foley.safetyLimiter.ceilingLufs, estimatedOutputLufs: foley.safetyLimiter.estimatedOutputLufs,
      audioGraph: foley.audioGraph,
    },
  }, null, 2);
}
