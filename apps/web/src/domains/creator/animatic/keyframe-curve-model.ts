/**
 * keyframe-curve-model.ts — 키프레임 보간 곡선(그래프 편집) 정본 모델.
 *
 * 구간마다 커스텀 3차 베지어 곡선을 그어 가속·감속을 편집하기 위한 순수 모델이다.
 * 프리셋의 정본은 이 파일의 EASING_PRESETS 하나뿐이며, 애니매틱 타임라인
 * (studio-animatic-timeline.ts)과 IR(animation.ts)은 같은 제어점 값을 쓰고
 * 테스트로 일치를 고정한다. UI(곡선 편집기)는 easingCurveSamples로 그릴 점들을,
 * normalizeBezierPoints로 드래그 결과를, validateEasing으로 안내 문구를 얻는다.
 */

export interface BezierEasing {
  readonly kind: "bezier";
  /** 제어점 (x1,y1,x2,y2). x는 0..1, y는 -0.5..1.5 허용(오버슈트) */
  readonly points: readonly [number, number, number, number];
}

export interface StepEasing {
  readonly kind: "step";
  /** 점프가 일어나는 지점 0..1 (0=즉시, 1=구간 끝까지 유지 후 점프) */
  readonly at: number;
}

export type SegmentEasing = BezierEasing | StepEasing | { readonly kind: "linear" };

/** 이징 프리셋 정본. 키는 모델 내부 이름이며, 화면 이름과의 대응은 아래 어댑터가 맡는다. */
export const EASING_PRESETS: Readonly<Record<string, SegmentEasing>> = {
  linear: { kind: "linear" },
  hold: { kind: "step", at: 1 },
  easeIn: { kind: "bezier", points: [0.42, 0, 1, 1] },
  easeOut: { kind: "bezier", points: [0, 0, 0.58, 1] },
  easeInOut: { kind: "bezier", points: [0.42, 0, 0.58, 1] },
  easeInBack: { kind: "bezier", points: [0.36, 0, 0.66, -0.56] },
  easeOutBack: { kind: "bezier", points: [0.34, 1.56, 0.64, 1] },
};

// ── 평가 ────────────────────────────────────────────────────────────────

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function cubicSlope(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return 3 * u * u * (p1 - p0) + 6 * u * t * (p2 - p1) + 3 * t * t * (p3 - p2);
}

/** x(진행률) → y(보간값 비율). Newton 반복 + 이분 fallback으로 단조성을 전제로 푼다. */
export function sampleEasing(easing: SegmentEasing, x: number): number {
  const clamped = Math.max(0, Math.min(1, x));
  if (easing.kind === "linear") return clamped;
  if (easing.kind === "step") return clamped >= easing.at ? 1 : 0;
  const [x1, y1, x2, y2] = easing.points;
  if (clamped === 0 || clamped === 1) return clamped;
  let t = clamped;
  for (let i = 0; i < 8; i += 1) {
    const err = cubicAt(0, x1, x2, 1, t) - clamped;
    if (Math.abs(err) < 1e-6) return cubicAt(0, y1, y2, 1, t);
    const slope = cubicSlope(0, x1, x2, 1, t);
    if (Math.abs(slope) < 1e-6) break;
    t -= err / slope;
    if (t < 0 || t > 1) break;
  }
  // 이분 탐색 fallback
  let lo = 0;
  let hi = 1;
  t = clamped;
  for (let i = 0; i < 24; i += 1) {
    const v = cubicAt(0, x1, x2, 1, t);
    if (Math.abs(v - clamped) < 1e-6) break;
    if (v < clamped) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return cubicAt(0, y1, y2, 1, t);
}

/** 두 키프레임 사이 값 보간 (수치 속성용). 각도 등 특수 속성은 호출자가 감싼다. */
export function interpolateSegment(
  from: number,
  to: number,
  easing: SegmentEasing,
  localProgress: number,
): number {
  return from + (to - from) * sampleEasing(easing, localProgress);
}

// ── 곡선 편집 UI 도출 ───────────────────────────────────────────────────

/** 편집 캔버스에 그릴 곡선 점들 (균일 샘플). UI는 이 점들을 잇기만 하면 된다. */
export function easingCurveSamples(easing: SegmentEasing, samples = 32): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const n = Math.max(2, Math.floor(samples));
  for (let i = 0; i <= n; i += 1) {
    const x = i / n;
    out.push({ x, y: sampleEasing(easing, x) });
  }
  return out;
}

/** 제어점 이동 결과를 허용 범위로 정규화한다 (x 단조성 유지가 평가 전제). */
export function normalizeBezierPoints(
  points: readonly [number, number, number, number],
): readonly [number, number, number, number] {
  const clampX = (v: number) => Math.max(0, Math.min(1, v));
  const clampY = (v: number) => Math.max(-0.5, Math.min(1.5, v));
  const x1 = clampX(points[0]);
  const x2 = Math.max(x1, clampX(points[2])); // x2 >= x1 보장
  return [x1, clampY(points[1]), x2, clampY(points[3])];
}

// ── 검증 ────────────────────────────────────────────────────────────────

export interface EasingIssue {
  readonly code: "x-out-of-range" | "x-not-monotonic" | "step-out-of-range";
  readonly message: string;
}

export function validateEasing(easing: SegmentEasing): EasingIssue[] {
  const issues: EasingIssue[] = [];
  if (easing.kind === "step") {
    if (easing.at < 0 || easing.at > 1) {
      issues.push({ code: "step-out-of-range", message: "유지·점프 지점은 0~1 사이여야 해요." });
    }
  }
  if (easing.kind === "bezier") {
    const [x1, , x2] = easing.points;
    if (x1 < 0 || x1 > 1 || x2 < 0 || x2 > 1) {
      issues.push({ code: "x-out-of-range", message: "곡선 제어점의 가로 위치는 0~1 사이여야 해요." });
    } else if (x2 < x1) {
      issues.push({ code: "x-not-monotonic", message: "두 제어점의 가로 순서가 뒤집히면 곡선을 계산할 수 없어요." });
    }
  }
  return issues;
}

// ── 애니매틱 카메라 키프레임 어댑터 ────────────────────────────────────
// 타임라인은 구간 이징을 "도착 키프레임"의 easing 이름 + 선택적 curve(제어점)로 저장한다.
// 이름 ↔ 정본 프리셋 대응은 여기서만 정의한다.

export type CameraCurveEasingName =
  | "linear"
  | "ease-in"
  | "ease-out"
  | "ease-in-out"
  | "ease-in-back"
  | "ease-out-back"
  | "hold"
  | "custom";

/** 도착 키프레임의 (이징 이름, 곡선 제어점) → 정본 SegmentEasing. */
export function segmentEasingForCameraKeyframe(
  easing: CameraCurveEasingName,
  curve?: readonly [number, number, number, number],
): SegmentEasing {
  if (easing === "custom" && curve) return { kind: "bezier", points: normalizeBezierPoints(curve) };
  switch (easing) {
    case "ease-in":
      return EASING_PRESETS.easeIn!;
    case "ease-out":
      return EASING_PRESETS.easeOut!;
    case "ease-in-out":
      return EASING_PRESETS.easeInOut!;
    case "ease-in-back":
      return EASING_PRESETS.easeInBack!;
    case "ease-out-back":
      return EASING_PRESETS.easeOutBack!;
    case "hold":
      return EASING_PRESETS.hold!;
    default:
      return EASING_PRESETS.linear!;
  }
}

/** 곡선 편집기가 처음 열릴 때 보여줄 제어점: 커스텀 곡선이 있으면 그것, 없으면 프리셋 환산값. */
export function curvePointsForCameraKeyframe(
  easing: CameraCurveEasingName,
  curve?: readonly [number, number, number, number],
): readonly [number, number, number, number] {
  const segment = segmentEasingForCameraKeyframe(easing, curve);
  if (segment.kind === "bezier") return segment.points;
  if (segment.kind === "step") return [0, 0, 1, 1];
  return [0, 0, 1, 1];
}
