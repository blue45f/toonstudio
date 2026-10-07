/**
 * 모션 웹툰 이징 코어.
 *
 * 컷 안에서의 진행(카메라 무브·키프레임 보간)을 시간 비율 → 값 비율로 바꾸는
 * 순수 계산 모듈. 렌더링·DOM에 의존하지 않는다.
 *
 * - linear: 등속.
 * - hold(스텝): 구간 끝까지 시작 값을 유지하다가 끝에서 다음 값으로 점프한다.
 * - bezier: cubic-bezier(x1, y1, x2, y2) 곡선. x→y 해법은 WebKit UnitBezier와
 *   같은 방식(Newton 반복 + 이분 탐색 폴백)으로 푼다.
 *
 * 기존 재생은 CSS 애니메이션의 ease-in-out 고정이었으므로, 이징을 지정하지 않은
 * 컷의 기본값은 ease-in-out으로 유지한다(레거시 동작 보존).
 */

/** cubic-bezier 제어점. x1·x2는 [0, 1] 범위여야 곡선이 함수가 된다. */
export interface CubicBezierCurve {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** 이징 명세 — 키프레임 구간마다 하나씩 붙는다. */
export type MotionEasing =
  | { readonly kind: "linear" }
  | { readonly kind: "hold" }
  | { readonly kind: "bezier"; readonly curve: CubicBezierCurve };

export const LINEAR_EASING: MotionEasing = { kind: "linear" };
export const HOLD_EASING: MotionEasing = { kind: "hold" };

export function bezierEasing(x1: number, y1: number, x2: number, y2: number): MotionEasing {
  return { kind: "bezier", curve: { x1, y1, x2, y2 } };
}

/** 이징 프리셋 ID — CutDirection.easing에 저장되는 값. */
export type MotionEasingPresetId =
  | "linear"
  | "hold"
  | "ease"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "ease-in-cubic"
  | "ease-out-cubic"
  | "ease-out-back";

export interface MotionEasingPreset {
  readonly id: MotionEasingPresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly easing: MotionEasing;
}

/** 표준 프리셋 세트 — CSS 명세 곡선 + 표현용 곡선(easings.net 표준값). */
export const MOTION_EASING_PRESETS: readonly MotionEasingPreset[] = [
  { id: "linear", labelKo: "선형 (등속)", labelEn: "Linear", easing: LINEAR_EASING },
  { id: "hold", labelKo: "홀드 (끝에서 점프)", labelEn: "Hold (step)", easing: HOLD_EASING },
  { id: "ease", labelKo: "기본 이즈", labelEn: "Ease", easing: bezierEasing(0.25, 0.1, 0.25, 1) },
  { id: "ease-in", labelKo: "천천히 시작", labelEn: "Ease in", easing: bezierEasing(0.42, 0, 1, 1) },
  { id: "ease-out", labelKo: "천천히 끝남", labelEn: "Ease out", easing: bezierEasing(0, 0, 0.58, 1) },
  { id: "ease-in-out", labelKo: "부드럽게 시작·끝", labelEn: "Ease in-out", easing: bezierEasing(0.42, 0, 0.58, 1) },
  { id: "ease-in-cubic", labelKo: "강하게 가속", labelEn: "Ease in cubic", easing: bezierEasing(0.55, 0.055, 0.675, 0.19) },
  { id: "ease-out-cubic", labelKo: "강하게 감속", labelEn: "Ease out cubic", easing: bezierEasing(0.215, 0.61, 0.355, 1) },
  { id: "ease-out-back", labelKo: "살짝 튀어 정착", labelEn: "Ease out back", easing: bezierEasing(0.34, 1.56, 0.64, 1) },
];

/** 이징 미지정 컷의 기본 프리셋 — 기존 CSS 재생(ease-in-out 고정)과 동일. */
export const DEFAULT_MOTION_EASING_PRESET_ID: MotionEasingPresetId = "ease-in-out";

const presetById = new Map(MOTION_EASING_PRESETS.map((preset) => [preset.id, preset]));

/** 프리셋 ID → 프리셋. 없는 ID면 기본 프리셋을 돌려준다. */
export function motionEasingPreset(id: MotionEasingPresetId | undefined | null): MotionEasingPreset {
  if (id && presetById.has(id)) return presetById.get(id)!;
  return presetById.get(DEFAULT_MOTION_EASING_PRESET_ID)!;
}

/** 프리셋 ID(미지정 포함) → 이징 명세. */
export function resolveMotionEasing(id: MotionEasingPresetId | undefined | null): MotionEasing {
  return motionEasingPreset(id).easing;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

// ── cubic-bezier 해법 ─────────────────────────────────────────────────

/** 베지어 한 축 성분값: B(t) = 3(1-t)²t·a1 + 3(1-t)t²·a2 + t³. */
function sampleBezierComponent(a1: number, a2: number, t: number): number {
  const u = 1 - t;
  return 3 * u * u * t * a1 + 3 * u * t * t * a2 + t * t * t;
}

function sampleBezierDerivative(a1: number, a2: number, t: number): number {
  const u = 1 - t;
  return 3 * u * u * a1 + 6 * u * t * (a2 - a1) + 3 * t * t * (1 - a2);
}

/** 곡선 위의 점 — 미리보기·검증용. */
export function cubicBezierPoint(curve: CubicBezierCurve, t: number): { x: number; y: number } {
  const clamped = clamp01(t);
  return {
    x: sampleBezierComponent(curve.x1, curve.x2, clamped),
    y: sampleBezierComponent(curve.y1, curve.y2, clamped),
  };
}

const NEWTON_ITERATIONS = 8;
const NEWTON_MIN_SLOPE = 0.001;
const BISECTION_ITERATIONS = 24;
const SOLVE_EPSILON = 1e-6;

/** x(시간 비율) → y(값 비율). 제어점 x가 [0,1] 밖이면 [0,1]로 눌러 해석한다. */
export function solveCubicBezierY(curve: CubicBezierCurve, x: number): number {
  const targetX = clamp01(x);
  if (targetX === 0) return 0;
  if (targetX === 1) return 1;
  const x1 = clamp01(curve.x1);
  const x2 = clamp01(curve.x2);

  // Newton 반복 — 기울기가 너무 낮으면 이분 탐색으로 폴백한다.
  let t = targetX;
  for (let i = 0; i < NEWTON_ITERATIONS; i += 1) {
    const currentX = sampleBezierComponent(x1, x2, t) - targetX;
    if (Math.abs(currentX) < SOLVE_EPSILON) {
      return sampleBezierComponent(curve.y1, curve.y2, t);
    }
    const slope = sampleBezierDerivative(x1, x2, t);
    if (Math.abs(slope) < NEWTON_MIN_SLOPE) break;
    t -= currentX / slope;
    if (t < 0 || t > 1) break;
  }

  let low = 0;
  let high = 1;
  t = targetX;
  for (let i = 0; i < BISECTION_ITERATIONS; i += 1) {
    const currentX = sampleBezierComponent(x1, x2, t);
    if (Math.abs(currentX - targetX) < SOLVE_EPSILON) break;
    if (currentX < targetX) low = t;
    else high = t;
    t = (low + high) / 2;
  }
  return sampleBezierComponent(curve.y1, curve.y2, t);
}

// ── 적용·표현 ─────────────────────────────────────────────────────────

/**
 * 시간 비율 t(0~1)에 이징을 적용한 값 비율.
 * hold는 t<1이면 0, t=1이면 1 — 구간 끝에서 점프한다.
 * bezier의 y는 곡선에 따라 [0,1]을 벗어날 수 있다(ease-out-back의 오버슈트).
 */
export function applyMotionEasing(easing: MotionEasing, t: number): number {
  const x = clamp01(t);
  switch (easing.kind) {
    case "linear":
      return x;
    case "hold":
      return x >= 1 ? 1 : 0;
    case "bezier":
      return solveCubicBezierY(easing.curve, x);
  }
}

/** CSS animation-timing-function 문자열 — 플레이어의 인라인 스타일용. */
export function motionEasingToCss(easing: MotionEasing): string {
  switch (easing.kind) {
    case "linear":
      return "linear";
    case "hold":
      return "steps(1, end)";
    case "bezier": {
      const { x1, y1, x2, y2 } = easing.curve;
      return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
    }
  }
}

/**
 * 이징 곡선 미리보기용 SVG path.
 * x축=시간, y축=값(위쪽이 1). 샘플 지점을 직선으로 잇는다.
 */
export function buildEasingCurvePath(
  easing: MotionEasing,
  width: number,
  height: number,
  samples = 24,
): string {
  const steps = Math.max(2, Math.floor(samples));
  const parts: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const x = i / steps;
    const y = applyMotionEasing(easing, x);
    const px = (x * width).toFixed(2);
    const py = (height - clamp01(y) * height).toFixed(2);
    parts.push(`${i === 0 ? "M" : "L"} ${px} ${py}`);
  }
  return parts.join(" ");
}
