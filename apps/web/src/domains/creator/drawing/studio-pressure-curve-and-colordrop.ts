/**
 * Procreate급 압력 베지어 곡선(T3) 및 ColorDrop 임계값 스크럽 컨트롤러(T6) (AC-016).
 *
 * - T3: 전역 + 브러시별 큐빅 베지어 압력 매핑(0..1 -> 0..1)과 대표 웹툰 프리셋 4종.
 * - T6: 컬러 드래그 -> 450ms 홀드 -> 좌우 스크럽(0~100% 허용 오차) -> sticky 임계값 기억.
 */

export interface PressureCurveControlPoints {
  /** 첫 번째 제어점 (x1, y1), 각 0..1 범위 */
  readonly x1: number;
  readonly y1: number;
  /** 두 번째 제어점 (x2, y2), 각 0..1 범위 */
  readonly x2: number;
  readonly y2: number;
}

export type PressureCurvePresetId = "linear" | "soft-ink" | "firm-gpen" | "expressive-brush";

export const PRESSURE_CURVE_PRESETS: Record<PressureCurvePresetId, PressureCurveControlPoints> = {
  linear: { x1: 0.25, y1: 0.25, x2: 0.75, y2: 0.75 },
  "soft-ink": { x1: 0.15, y1: 0.45, x2: 0.55, y2: 0.9 },
  "firm-gpen": { x1: 0.45, y1: 0.1, x2: 0.85, y2: 0.55 },
  "expressive-brush": { x1: 0.1, y1: 0.05, x2: 0.35, y2: 0.95 },
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function cubicBezier(t: number, p1: number, p2: number): number {
  const u = 1 - t;
  return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
}

/**
 * 입력 필압 x(0..1)에 대해 큐빅 베지어(0,0)-(x1,y1)-(x2,y2)-(1,1)의 출력 필압 y(0..1)를
 * 이분 탐색으로 결정적으로 계산한다.
 */
export function evaluatePressureCurve(
  rawPressure: number,
  curve: PressureCurveControlPoints,
): number {
  const x = clamp01(rawPressure);
  if (x === 0 || x === 1) return x;

  const x1 = clamp01(curve.x1);
  const y1 = clamp01(curve.y1);
  const x2 = clamp01(curve.x2);
  const y2 = clamp01(curve.y2);

  let lo = 0;
  let hi = 1;
  let t = x;
  for (let i = 0; i < 16; i++) {
    t = (lo + hi) * 0.5;
    const estX = cubicBezier(t, x1, x2);
    if (Math.abs(estX - x) < 1e-4) break;
    if (estX < x) lo = t;
    else hi = t;
  }
  return clamp01(Number(cubicBezier(t, y1, y2).toFixed(4)));
}

/** 전역 압력 곡선과 브러시별 오버라이드 곡선을 합성한다. */
export function evaluateEffectivePressure(
  rawPressure: number,
  globalCurve: PressureCurveControlPoints,
  brushOverrideCurve?: PressureCurveControlPoints | null,
): number {
  const afterGlobal = evaluatePressureCurve(rawPressure, globalCurve);
  if (!brushOverrideCurve) return afterGlobal;
  return evaluatePressureCurve(afterGlobal, brushOverrideCurve);
}

export interface ColorDropSessionState {
  readonly phase: "idle" | "holding" | "scrubbing" | "committed";
  readonly thresholdPercent: number;
  readonly anchorX: number;
  readonly anchorY: number;
}

export class ColorDropThresholdController {
  private stickyThresholdPercent: number;
  private readonly holdDelayMs: number;
  private readonly scrubPixelsForFullRange: number;
  private phase: ColorDropSessionState["phase"] = "idle";
  private dropStartedAtMs = 0;
  private anchorX = 0;
  private anchorY = 0;
  private scrubStartX = 0;
  private scrubBaseThreshold = 0;
  private currentThresholdPercent: number;

  constructor(options: {
    readonly initialThresholdPercent?: number;
    readonly holdDelayMs?: number;
    readonly scrubPixelsForFullRange?: number;
  } = {}) {
    const initial = Math.max(0, Math.min(100, options.initialThresholdPercent ?? 35));
    this.stickyThresholdPercent = initial;
    this.currentThresholdPercent = initial;
    this.holdDelayMs = options.holdDelayMs ?? 450;
    this.scrubPixelsForFullRange = options.scrubPixelsForFullRange ?? 240;
  }

  getStickyThresholdPercent(): number {
    return this.stickyThresholdPercent;
  }

  beginDrop(x: number, y: number, nowMs: number): ColorDropSessionState {
    this.phase = "holding";
    this.dropStartedAtMs = nowMs;
    this.anchorX = x;
    this.anchorY = y;
    this.scrubStartX = x;
    this.currentThresholdPercent = this.stickyThresholdPercent;
    this.scrubBaseThreshold = this.stickyThresholdPercent;
    return this.snapshot();
  }

  moveDuringDrop(x: number, nowMs: number): ColorDropSessionState {
    if (this.phase === "holding" && nowMs - this.dropStartedAtMs >= this.holdDelayMs) {
      this.phase = "scrubbing";
      this.scrubStartX = x;
      this.scrubBaseThreshold = this.currentThresholdPercent;
    }
    if (this.phase === "scrubbing") {
      const deltaPercent = ((x - this.scrubStartX) / this.scrubPixelsForFullRange) * 100;
      this.currentThresholdPercent = Math.round(
        Math.max(0, Math.min(100, this.scrubBaseThreshold + deltaPercent)),
      );
    }
    return this.snapshot();
  }

  commitDrop(): ColorDropSessionState {
    this.stickyThresholdPercent = this.currentThresholdPercent;
    this.phase = "committed";
    const snap = this.snapshot();
    this.phase = "idle";
    return snap;
  }

  cancelDrop(): ColorDropSessionState {
    this.currentThresholdPercent = this.stickyThresholdPercent;
    this.phase = "idle";
    return this.snapshot();
  }

  private snapshot(): ColorDropSessionState {
    return Object.freeze({
      phase: this.phase,
      thresholdPercent: this.currentThresholdPercent,
      anchorX: this.anchorX,
      anchorY: this.anchorY,
    });
  }
}
