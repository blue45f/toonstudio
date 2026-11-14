/**
 * studio-line-width-adjust.ts
 *
 * Non-destructive vector/freehand stroke width adjustment (선폭 수정 / 선 굵기 조절):
 * - Thicken (지정 폭으로 굵게)
 * - Narrow (지정 폭으로 가늘게)
 * - Scale (배율로 확대/축소)
 * - Fix (일정 폭으로 변경)
 * - Segment range ("all" | "start" | "middle" | "end") cosine-bell local taper/modulation
 * - Original baseline capture & 1-click non-destructive restore
 */

import type { DrawEl } from "../studio-element-model";

export type LineWidthAction = "thicken" | "narrow" | "scale" | "fix";
export type LineWidthSegmentTarget = "all" | "start" | "middle" | "end";

export interface LineWidthAdjustmentOptions {
  readonly action: LineWidthAction;
  readonly value: number; // px for thicken/narrow/fix, or multiplier for scale (e.g. 1.2)
  readonly scalePressures?: boolean;
  readonly segment?: LineWidthSegmentTarget;
}

export interface VectorStrokeWidthBaseline {
  readonly strokeWidth: number;
  readonly pressures?: readonly number[];
}

const MAX_STORED_BASELINES = 512;
const vectorStrokeWidthBaselines = new Map<string, VectorStrokeWidthBaseline>();

export const LINE_WIDTH_PRESETS: readonly {
  readonly label: string;
  readonly options: LineWidthAdjustmentOptions;
}[] = Object.freeze([
  { label: "+1px", options: { action: "thicken", value: 1 } },
  { label: "+2px", options: { action: "thicken", value: 2 } },
  { label: "+5px", options: { action: "thicken", value: 5 } },
  { label: "-1px", options: { action: "narrow", value: 1 } },
  { label: "-2px", options: { action: "narrow", value: 2 } },
  { label: "1.2x", options: { action: "scale", value: 1.2 } },
  { label: "0.8x", options: { action: "scale", value: 0.8 } },
  { label: "3px 고정", options: { action: "fix", value: 3 } },
]);

export const MIN_STROKE_WIDTH = 0.5;
export const MAX_STROKE_WIDTH = 250;

/**
 * Calculates the new stroke width given a current width and adjustment options.
 */
export function calculateAdjustedStrokeWidth(
  currentWidth: number,
  options: LineWidthAdjustmentOptions,
): number {
  const safeCurrent = Math.max(MIN_STROKE_WIDTH, currentWidth);
  let next = safeCurrent;

  switch (options.action) {
    case "thicken":
      next = safeCurrent + Math.max(0, options.value);
      break;
    case "narrow":
      next = safeCurrent - Math.max(0, options.value);
      break;
    case "scale":
      next = safeCurrent * Math.max(0.1, options.value);
      break;
    case "fix":
      next = Math.max(MIN_STROKE_WIDTH, options.value);
      break;
  }

  return Math.max(MIN_STROKE_WIDTH, Math.min(MAX_STROKE_WIDTH, Math.round(next * 10) / 10));
}

function segmentEnvelopeWeight(normalizedT: number, segment: LineWidthSegmentTarget): number {
  const t = Math.max(0, Math.min(1, normalizedT));
  switch (segment) {
    case "start": {
      if (t >= 0.45) return 0;
      return 0.5 * (1 + Math.cos((Math.PI * t) / 0.45));
    }
    case "middle": {
      const dist = Math.abs(t - 0.5);
      if (dist >= 0.35) return 0;
      return 0.5 * (1 + Math.cos((Math.PI * dist) / 0.35));
    }
    case "end": {
      if (t <= 0.55) return 0;
      return 0.5 * (1 + Math.cos((Math.PI * (1 - t)) / 0.45));
    }
    case "all":
    default:
      return 1;
  }
}

/**
 * Captures the original baseline width and pressure profile for a vector/freehand stroke
 * before the first non-destructive edit so it can be restored cleanly at any time.
 */
export function captureVectorStrokeWidthBaseline(stroke: DrawEl): VectorStrokeWidthBaseline {
  const existing = vectorStrokeWidthBaselines.get(stroke.id);
  if (existing) return existing;
  if (vectorStrokeWidthBaselines.size >= MAX_STORED_BASELINES) {
    const oldestKey = vectorStrokeWidthBaselines.keys().next().value;
    if (oldestKey !== undefined) vectorStrokeWidthBaselines.delete(oldestKey);
  }
  const snapshot: VectorStrokeWidthBaseline = {
    strokeWidth: stroke.strokeWidth ?? 2,
    ...(stroke.pressures ? { pressures: [...stroke.pressures] } : {}),
  };
  vectorStrokeWidthBaselines.set(stroke.id, snapshot);
  return snapshot;
}

export function hasVectorStrokeWidthBaseline(strokeId: string | null | undefined): boolean {
  if (!strokeId) return false;
  return vectorStrokeWidthBaselines.has(strokeId);
}

export function restoreVectorStrokeWidthBaseline(strokeId: string): Partial<DrawEl> | null {
  const baseline = vectorStrokeWidthBaselines.get(strokeId);
  if (!baseline) return null;
  vectorStrokeWidthBaselines.delete(strokeId);
  return {
    strokeWidth: baseline.strokeWidth,
    pressures: baseline.pressures ? [...baseline.pressures] : undefined,
  };
}

export function clearVectorStrokeWidthBaselinesForTest(): void {
  vectorStrokeWidthBaselines.clear();
}

/**
 * Computes the partial update for a DrawEl applying non-destructive line width adjustment.
 * Preserves vector geometry (`points`, `tiltXs`, `tiltYs`, control vertices) intact.
 */
export function adjustDrawStrokeWidth(
  stroke: DrawEl,
  options: LineWidthAdjustmentOptions,
): Partial<DrawEl> {
  captureVectorStrokeWidthBaseline(stroke);
  const baseWidth = Math.max(MIN_STROKE_WIDTH, stroke.strokeWidth ?? 2);
  const newWidth = calculateAdjustedStrokeWidth(baseWidth, options);
  const segment = options.segment ?? "all";

  if (segment !== "all") {
    const vertexCount = Math.max(2, Math.floor((stroke.points?.length ?? 0) / 2));
    const sourcePressures =
      stroke.pressures && stroke.pressures.length === vertexCount
        ? stroke.pressures
        : Array.from({ length: vertexCount }, () => 1);
    const targetRatio = newWidth / baseWidth;
    const modulated = sourcePressures.map((p, idx) => {
      const t = vertexCount <= 1 ? 0 : idx / (vertexCount - 1);
      const w = segmentEnvelopeWeight(t, segment);
      const factor = 1 + (targetRatio - 1) * w;
      return Math.max(0.05, Math.min(2.0, Math.round(p * factor * 1000) / 1000));
    });
    return {
      strokeWidth: baseWidth,
      pressures: modulated,
    };
  }

  let nextPressures = stroke.pressures;
  if (options.scalePressures && stroke.pressures && stroke.pressures.length > 0) {
    const ratio = newWidth / baseWidth;
    nextPressures = stroke.pressures.map((p) => Math.max(0.05, Math.min(1.5, p * ratio)));
  }

  return {
    strokeWidth: newWidth,
    ...(nextPressures ? { pressures: nextPressures } : {}),
  };
}
