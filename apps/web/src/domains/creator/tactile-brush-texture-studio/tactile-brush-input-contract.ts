import type { PaperGrainTileLut, TactileBrushConfig, TactileStampMetrics, TactileTextureControls } from "./tactile-brush-texture-engine";

export function boundedTactileNumber(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

export function normalizeTactileControls(controls: TactileTextureControls): TactileTextureControls {
  return {
    paperToothStrength: boundedTactileNumber(controls.paperToothStrength, 0, 1),
    dryBristleSplit: boundedTactileNumber(controls.dryBristleSplit, 0, 1),
    wetEdgePooling: boundedTactileNumber(controls.wetEdgePooling, 0, 1),
    impastoRelief: boundedTactileNumber(controls.impastoRelief, 0, 1),
  };
}

/** 배열 순회 전에 크기를 제한해 외부 LUT도 고정 64×64 계약을 지키게 한다. */
export function assertTactileLutShape(lut: PaperGrainTileLut): void {
  if (lut.size !== 64 || [lut.height, lut.normalX, lut.normalY].some((values) =>
    !ArrayBuffer.isView(values) || Object.prototype.toString.call(values) !== "[object Float32Array]" || values.length !== 4096,
  )) throw new RangeError("LUT는 64×64와 길이 4096의 Float32Array 3개가 필요합니다. / Invalid LUT shape.");
}

export function assertFiniteTactileLut(lut: PaperGrainTileLut): void {
  assertTactileLutShape(lut);
  const arrays = [lut.height, lut.normalX, lut.normalY];
  const scalars = [lut.peakMean, lut.peakStdDev, lut.valleyRatio, lut.anisotropyRatio, lut.memoryBytes];
  if (!arrays.every((values) => values.every(Number.isFinite)) || !scalars.every(Number.isFinite)) {
    throw new RangeError("LUT에 비유한 수치가 있습니다. / Non-finite LUT values.");
  }
}

export function finiteTactileSample(value: number | undefined, fallback: number): number {
  if (value !== undefined && !Number.isFinite(value)) throw new RangeError("LUT 샘플은 유한 수치여야 합니다. / Non-finite LUT sample.");
  return value ?? fallback;
}

export function matchingTactileStampOptions(metrics: TactileStampMetrics | undefined, config: TactileBrushConfig): { radiusPx?: number; inkLoad?: number } {
  const keys = ["paperToothStrength", "dryBristleSplit", "wetEdgePooling", "impastoRelief"] as const;
  if (!metrics || metrics.brushId !== config.brushId || metrics.paperId !== config.paperId
    || metrics.pressure !== config.pressure || metrics.velocityPxPerSec !== config.velocityPxPerSec
    || metrics.tiltDeg !== config.tiltDeg || metrics.strokeAngleDeg !== config.strokeAngleDeg
    || metrics.frameBudget?.targetRefreshHz !== config.targetRefreshHz
    || metrics.frameBudget?.guardEnabled !== config.performanceGuardEnabled
    || !keys.every((key) => metrics.controls?.[key] === config.controls[key])) return {};
  return { radiusPx: metrics.radiusPx, inkLoad: metrics.inkLoad };
}
