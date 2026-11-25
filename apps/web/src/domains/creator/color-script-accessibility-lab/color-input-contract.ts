import type { DualViewerPanelInput, EpisodeColorScriptInput, RgbColor } from "./colorblind-harmony-engine";

export function finite(values: readonly number[]): void {
  if (values.some((v) => !Number.isFinite(v))) throw new RangeError("색 계산 입력은 유한한 수여야 합니다.");
}

export function unit(values: readonly number[]): void {
  finite(values);
  if (values.some((v) => v < 0 || v > 1)) throw new RangeError("RGB·시뮬레이션 강도는 0~1 범위여야 합니다.");
}

export function assertRgb(rgb: RgbColor): void { unit([rgb.r, rgb.g, rgb.b]); }

export function choice(value: string, choices: readonly string[]): void {
  if (!choices.includes(value)) throw new RangeError("등록되지 않은 색 계산 모델입니다.");
}

export function assertArc(input: EpisodeColorScriptInput): void {
  finite([input.baseHueDeg, input.baseLightness ?? 0.62, input.baseChroma ?? 0.14]);
  unit([input.baseLightness ?? 0.62, input.baseChroma ?? 0.14]);
  choice(input.harmonyRule, ["complementary", "split-complementary", "analogous", "triadic"]);
  if (input.presetId !== undefined) choice(input.presetId, ["noir-thriller", "campus-romance", "action-awakening", "healing-slice"]);
  if (input.tensionCurve) {
    if (input.tensionCurve.length !== 4) throw new RangeError("긴장도 곡선은 네 막이어야 합니다.");
    unit(input.tensionCurve);
  }
}

export function assertDualViewer(input: DualViewerPanelInput): void {
  assertRgb(input.panelFill);
  assertRgb(input.borderColor);
  assertRgb(input.gutterEdgeColor);
  finite([input.borderWidthPx, input.outerHaloWidthPx]);
  if (input.borderWidthPx < 0 || input.outerHaloWidthPx < 0 || typeof input.hasTransparentOutside !== "boolean") {
    throw new RangeError("경계 너비는 음수가 아니고 투명 외곽 표시는 boolean이어야 합니다.");
  }
}
