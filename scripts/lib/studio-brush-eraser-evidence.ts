export interface EraserLiftRatio {
  readonly affectedPixels: number;
  readonly residualEnergyRatio: number;
  readonly lowerQuartileResidual: number;
}

/** 바탕과 비교한 실제 잔량을 한 획의 기본 농도와 대조한다. 가는 팁의 가장자리는 일부만 덮인다. */
export function eraserLiftMatchesPreset(
  preset: { readonly defaultOpacity: number; readonly defaultWidth: number },
  measured: EraserLiftRatio,
): boolean {
  const expected = 1 - preset.defaultOpacity;
  // 대상 픽셀은 RGB 차이의 합이 24 이상이다. 채널별 반올림 0.5의 합을 허용한다.
  const rounding = 1.5 / 24;
  // 양쪽 안티앨리어싱 경계의 절반씩을 합친 한 픽셀은 전체 폭에서 남을 수 있다.
  const edge = preset.defaultOpacity / preset.defaultWidth;
  return measured.affectedPixels >= 4
    && Math.abs(measured.lowerQuartileResidual - expected) <= rounding
    && measured.residualEnergyRatio >= expected - rounding
    && measured.residualEnergyRatio <= expected + Math.max(rounding, edge);
}
