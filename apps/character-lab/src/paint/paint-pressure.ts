import { MAX_BRUSH_RADIUS_PX } from "./paint-layer";

import type { BrushSettings } from "../contracts";

export const PAINT_PRESSURE_MODES = ["constant", "fake", "pen"] as const;
export type PaintPressureMode = (typeof PAINT_PRESSURE_MODES)[number];

export function isPaintPressureMode(value: string): value is PaintPressureMode {
  return PAINT_PRESSURE_MODES.some((mode) => mode === value);
}

/** 가상 필압은 최종 경로의 위치, 펜은 실제 압력으로 반지름을 정한다. */
export function pressureBrush(brush: BrushSettings, mode: PaintPressureMode, pressure: number, progress = 0.5): BrushSettings {
  const p = Number.isFinite(pressure) ? Math.min(1, Math.max(0, pressure)) : 0;
  const factor = mode === "pen" ? 2 * p : mode === "fake" ? Math.max(0, Math.sin(Math.min(1, Math.max(0, progress)) * Math.PI)) : 1;
  return { ...brush, radiusPx: Math.min(MAX_BRUSH_RADIUS_PX, brush.radiusPx * factor) };
}
