import type {
  PaperGrainPreset, PaperGrainTileLut, TactileBrushConfig,
  TactileBrushPreset, TactileBrushSession, TactileStampMetrics,
} from "./tactile-brush-texture-engine";

/** 검증·재계산이 끝난 단일 구성만 포맷한다. 실행 엔진을 import하지 않는다. */
export function serializeTactileBrushRecipe(input: {
  session: TactileBrushSession; active: TactileBrushConfig; committed: TactileBrushConfig;
  metrics: TactileStampMetrics; lut: PaperGrainTileLut; brush: TactileBrushPreset; paper: PaperGrainPreset;
  pigmentCss: string; surfaceCss: string; dirtyTilePx: number; lightDirection: readonly [number, number, number];
}): string {
  const { session, active, committed, metrics, lut, brush, paper } = input;
  return JSON.stringify({
    schema: "toonstudio.tactile-brush-recipe.v1",
    sessionStatus: session.status, appliedCount: session.appliedCount, violetFreeOklch: true,
    execution: { backend: "cpu-analytical-svg-example", gpuExecuted: false, pixelRenderingPerformed: false, sceneMutationVerified: false, persistenceVerified: false },
    stampOptions: { radiusPx: metrics.radiusPx, inkLoad: metrics.inkLoad },
    brushPreset: { id: brush.id, nameKo: brush.nameKo, nameEn: brush.nameEn, pigmentOklch: input.pigmentCss, radiusPx: metrics.radiusPx },
    paperLut: {
      id: paper.id, nameKo: paper.nameKo, tileSize: lut.size, tileWrapping: "periodic-bitmask-o1",
      memoryBytes: lut.memoryBytes, peakMean: lut.peakMean, peakStdDev: lut.peakStdDev,
      valleyRatio: lut.valleyRatio, anisotropyRatio: lut.anisotropyRatio, surfaceOklch: input.surfaceCss,
    },
    activeConfig: active, committedConfig: committed,
    shaderUniforms: {
      uPaperToothThreshold: metrics.paperTooth.contactThreshold, uPaperGrainContrast: metrics.paperTooth.grainContrast,
      uBristleFilamentCount: metrics.splitBristle.activeFilamentCount, uBristleSplayRatio: metrics.splitBristle.splaySpreadRatio,
      uWetEdgeConcentrationPct: metrics.wetEdge.ringConcentrationPct, uWetEdgeRingWidthPx: metrics.wetEdge.ringWidthPx,
      uImpastoReliefMm: metrics.impasto.ridgeThicknessMm, uImpastoBlinnSpecular: metrics.impasto.blinnSpecular,
      uAtelierLightDir: input.lightDirection,
      uDirtyRectTilePx: input.dirtyTilePx,
    },
    frameBudgetModel: {
      costModelSource: metrics.frameBudget.costModelSource, targetRefreshHz: metrics.frameBudget.targetRefreshHz,
      budgetMs: metrics.frameBudget.budgetMs, estimatedFrameMs: metrics.frameBudget.estimatedFrameMs,
      withinBudget: metrics.frameBudget.withinBudget, lodTier: metrics.frameBudget.lodTier,
      atlasCacheHitRate: metrics.frameBudget.atlasCacheHitRate, dirtyTileCount: metrics.frameBudget.dirtyTileCount,
      adaptiveSpacingRatio: metrics.frameBudget.adaptiveSpacingRatio,
    },
  }, null, 2);
}
