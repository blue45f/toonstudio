/**
 * Procreate급 펜촉 호버 프리뷰(T4), 드로잉 어시스트 원근·그리드 스냅(T8),
 * 400ms 터치-홀드 스포이드 및 화면 가장자리 두께/불투명도 퀵 슬라이더(T12) 엔진.
 */

/* ------------------------------------------------------------------ T4 Hover Preview */

export interface StylusHoverInput {
  readonly x: number;
  readonly y: number;
  readonly brushDiameterPx: number;
  /** -90..90 deg */
  readonly tiltXDeg?: number;
  /** -90..90 deg */
  readonly tiltYDeg?: number;
  /** 배럴 회전 각도 (0..360 deg) */
  readonly twistDeg?: number;
}

export interface StylusHoverCursorProjection {
  readonly cx: number;
  readonly cy: number;
  readonly majorAxisPx: number;
  readonly minorAxisPx: number;
  readonly rotationDeg: number;
  readonly tiltMagnitudeRatio: number; // 0..1
}

/**
 * 펜촉 기울기(tiltX/tiltY)와 배럴 회전(twist)으로부터 호버 커서 타원의 장축·단축·회전각을 결정적으로 투영한다 (T4).
 */
export function computeStylusHoverCursorProjection(
  input: StylusHoverInput,
): StylusHoverCursorProjection {
  const base = Math.max(2, Number.isFinite(input.brushDiameterPx) ? input.brushDiameterPx : 8);
  const tx = Math.max(-85, Math.min(85, input.tiltXDeg ?? 0));
  const ty = Math.max(-85, Math.min(85, input.tiltYDeg ?? 0));
  const tiltMag = Math.min(1, Math.hypot(tx, ty) / 85);

  const hasTilt = Math.hypot(tx, ty) > 0.5;
  const azimuthDeg = hasTilt
    ? Number((((Math.atan2(ty, tx) * 180) / Math.PI + 360) % 360).toFixed(2))
    : Number((((input.twistDeg ?? 0) % 360 + 360) % 360).toFixed(2));

  // 기울기가 커질수록 브러시 자국이 진행 방향으로 늘어난다(최대 2.2배).
  const majorAxisPx = Number((base * (1 + tiltMag * 1.2)).toFixed(2));
  const minorAxisPx = Number(Math.max(2, base * (1 - tiltMag * 0.35)).toFixed(2));

  return Object.freeze({
    cx: Number(input.x.toFixed(2)),
    cy: Number(input.y.toFixed(2)),
    majorAxisPx,
    minorAxisPx,
    rotationDeg: azimuthDeg,
    tiltMagnitudeRatio: Number(tiltMag.toFixed(3)),
  });
}

/* ------------------------------------------------------------------ T8 Drawing Assist Snap */

export interface VanishingPoint2D {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export type DrawingAssistGuideConfig =
  | { readonly mode: "off" }
  | { readonly mode: "grid"; readonly gridSpacingPx: number; readonly originX?: number; readonly originY?: number }
  | { readonly mode: "perspective"; readonly vanishingPoints: readonly VanishingPoint2D[] };

export interface AssistedStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly snappedToId: string | null;
}

/**
 * 스트로크 시작 앵커(`anchor`)와 현재 포인터(`point`)를 기준으로
 * 직교 그리드 축 또는 1~3점 투시 소실점 방사선(Ray) 중 각도 편차가 가장 작은 축으로 좌표를 스냅한다 (T8).
 */
export function snapStrokePointToDrawingAssist(
  anchor: { readonly x: number; readonly y: number },
  point: { readonly x: number; readonly y: number },
  guide: DrawingAssistGuideConfig,
): AssistedStrokePoint {
  if (guide.mode === "off") {
    return { x: point.x, y: point.y, snappedToId: null };
  }

  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  if (Math.hypot(dx, dy) < 2) {
    return { x: point.x, y: point.y, snappedToId: null };
  }

  if (guide.mode === "grid") {
    // 수평 또는 수직 축 중 변위가 큰 축으로 직교 스냅
    if (Math.abs(dx) >= Math.abs(dy)) {
      return { x: Number(point.x.toFixed(2)), y: Number(anchor.y.toFixed(2)), snappedToId: "grid-h" };
    }
    return { x: Number(anchor.x.toFixed(2)), y: Number(point.y.toFixed(2)), snappedToId: "grid-v" };
  }

  if (guide.vanishingPoints.length === 0) {
    return { x: point.x, y: point.y, snappedToId: null };
  }

  // 각 소실점 방향 단위벡터에 투영해 수직 오차가 가장 작은 방사선 선택
  let best: AssistedStrokePoint | null = null;
  let bestPerpDist = Infinity;

  for (const vp of guide.vanishingPoints) {
    const rx = vp.x - anchor.x;
    const ry = vp.y - anchor.y;
    const rLen = Math.hypot(rx, ry);
    if (rLen < 1e-4) continue;
    const ux = rx / rLen;
    const uy = ry / rLen;
    const proj = dx * ux + dy * uy;
    const snappedX = anchor.x + proj * ux;
    const snappedY = anchor.y + proj * uy;
    const perpDist = Math.hypot(point.x - snappedX, point.y - snappedY);
    if (perpDist < bestPerpDist) {
      bestPerpDist = perpDist;
      best = {
        x: Number(snappedX.toFixed(2)),
        y: Number(snappedY.toFixed(2)),
        snappedToId: vp.id,
      };
    }
  }

  return best ?? { x: point.x, y: point.y, snappedToId: null };
}

/* ------------------------------------------------------------------ T12 Hold Eyedropper & Edge Quick Slider */

export interface EyedropperLoupeState {
  readonly phase: "idle" | "arming" | "sampling";
  readonly x: number;
  readonly y: number;
}

export class TouchHoldEyedropperController {
  private readonly holdDelayMs: number;
  private readonly maxJitterPx: number;
  private phase: EyedropperLoupeState["phase"] = "idle";
  private startX = 0;
  private startY = 0;
  private curX = 0;
  private curY = 0;
  private startedAtMs = 0;

  constructor(options: { readonly holdDelayMs?: number; readonly maxJitterPx?: number } = {}) {
    this.holdDelayMs = options.holdDelayMs ?? 400;
    this.maxJitterPx = options.maxJitterPx ?? 10;
  }

  beginTouch(x: number, y: number, nowMs: number): EyedropperLoupeState {
    this.phase = "arming";
    this.startX = x;
    this.startY = y;
    this.curX = x;
    this.curY = y;
    this.startedAtMs = nowMs;
    return this.snapshot();
  }

  updateTouch(x: number, y: number, nowMs: number): EyedropperLoupeState {
    this.curX = x;
    this.curY = y;
    if (this.phase === "arming") {
      if (Math.hypot(x - this.startX, y - this.startY) > this.maxJitterPx) {
        this.phase = "idle";
        return this.snapshot();
      }
      if (nowMs - this.startedAtMs >= this.holdDelayMs) {
        this.phase = "sampling";
      }
    }
    return this.snapshot();
  }

  endTouch(): EyedropperLoupeState {
    const prev = this.snapshot();
    this.phase = "idle";
    return prev;
  }

  private snapshot(): EyedropperLoupeState {
    return Object.freeze({ phase: this.phase, x: this.curX, y: this.curY });
  }
}

/**
 * 화면 가장자리 퀵 슬라이더(T12): 수직 드래그(위쪽 = 증가, 아래쪽 = 감소)로
 * 브러시 두께(1~200px 비선형 감도)와 불투명도(5~100%)를 정밀 계산한다.
 */
export function evaluateEdgeQuickSlider(input: {
  readonly kind: "brush-size" | "brush-opacity";
  readonly baseValue: number;
  readonly dragDeltaY: number;
  readonly trackHeightPx?: number;
}): number {
  const track = Math.max(80, input.trackHeightPx ?? 220);
  // 위로 드래그(dragDeltaY < 0)하면 값 증가
  const normalizedDelta = -input.dragDeltaY / track;

  if (input.kind === "brush-opacity") {
    const next = input.baseValue + normalizedDelta;
    return Number(Math.max(0.05, Math.min(1, next)).toFixed(2));
  }

  // 브러시 크기는 세밀한 펜선(1~20px) 구간에서 더 촘촘하게 움직이도록 제곱근 스케일 적용
  const safeBase = Math.max(1, Math.min(200, input.baseValue));
  const normBase = Math.sqrt((safeBase - 1) / 199);
  const nextNorm = Math.max(0, Math.min(1, normBase + normalizedDelta));
  return Math.max(1, Math.min(200, Math.round(1 + nextNorm * nextNorm * 199)));
}
