/**
 * Studio Function Curve — CSP 함수 곡선 그래프 편집기(`URFunctionCurve*`) 순수 수리 모듈.
 *
 * 지원 사양:
 * - 다중 채널: `x`, `y`, `scaleX`, `scaleY`, `rotationDeg`, `opacity`
 * - 보간 모드: `"constant"`(계단 홀드), `"linear"`(선형), `"smooth"`(3차 베지어 / Fritsch-Carlson 단조 3차 접선)
 * - 핸들 모드: `"auto-monotone"`(Fritsch-Carlson 자동 단조 접선), `"linked"`(좌우 기울기 연동), `"broken"`(꺾인 독립 핸들)
 * - `x(u) = targetFrame` 역산: Newton-Raphson + 이분법(bisection) 하이브리드 솔버
 * - X/Y 격자 스냅 및 기존 `StudioAnimEase` 명명 프리셋과의 무손실 왕복 매핑
 *
 * REA 근거(clean-room math):
 * - ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68
 * - ev_853855365e8ebbed8b4f1694c57c2f224a338610827337312b0d42739c4eb4bc
 */
import { normalizeStudioAnimEase, type StudioAnimEase } from "../studio-anim-tracks";

export const FUNCTION_CURVE_CHANNELS = [
  "x",
  "y",
  "scaleX",
  "scaleY",
  "rotationDeg",
  "opacity",
] as const;

export type FunctionCurveChannelId = (typeof FUNCTION_CURVE_CHANNELS)[number];
export type FunctionCurveInterpolation = "constant" | "linear" | "smooth";
export type FunctionCurveHandleMode = "auto-monotone" | "linked" | "broken";

export interface FunctionCurveHandleOffset {
  /** 키프레임 기준 상대 프레임 오프셋 (inHandle <= 0, outHandle >= 0). */
  readonly dx: number;
  /** 키프레임 기준 상대 값 오프셋. */
  readonly dy: number;
}

export interface FunctionCurveKeyframe {
  readonly frame: number;
  readonly value: number;
  readonly interpolation: FunctionCurveInterpolation;
  readonly handleMode: FunctionCurveHandleMode;
  readonly inHandle?: FunctionCurveHandleOffset;
  readonly outHandle?: FunctionCurveHandleOffset;
}

export interface FunctionCurveChannel {
  readonly channelId: FunctionCurveChannelId;
  readonly defaultValue: number;
  readonly keyframes: readonly FunctionCurveKeyframe[];
}

export type MultiChannelFunctionCurveSet = Readonly<
  Record<FunctionCurveChannelId, FunctionCurveChannel>
>;

export interface FunctionCurveEvaluatedPose {
  readonly x: number;
  readonly y: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotationDeg: number;
  readonly opacity: number;
}

export interface FunctionCurveGridSnapOptions {
  readonly frameStep?: number;
  readonly valueStep?: number;
}

export interface NormalizedEaseBezierControls {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export const DEFAULT_CHANNEL_VALUES: Readonly<Record<FunctionCurveChannelId, number>> =
  Object.freeze({
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotationDeg: 0,
    opacity: 1,
  });

/** 기존 `StudioAnimEase` 4종에 대응하는 정규화 3차 베지어 제어점(무손실 역변환 기준표). */
export const STUDIO_EASE_BEZIER_PRESETS: Readonly<
  Record<StudioAnimEase, NormalizedEaseBezierControls>
> = Object.freeze({
  linear: Object.freeze({ x1: 1 / 3, y1: 1 / 3, x2: 2 / 3, y2: 2 / 3 }),
  "ease-in": Object.freeze({ x1: 0.42, y1: 0, x2: 1, y2: 1 }),
  "ease-out": Object.freeze({ x1: 0, y1: 0, x2: 0.58, y2: 1 }),
  "ease-in-out": Object.freeze({ x1: 0.42, y1: 0, x2: 0.58, y2: 1 }),
});

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function createEmptyFunctionCurveChannel(
  channelId: FunctionCurveChannelId,
  defaultValue = DEFAULT_CHANNEL_VALUES[channelId],
): FunctionCurveChannel {
  return {
    channelId,
    defaultValue,
    keyframes: [],
  };
}

export function createMultiChannelFunctionCurveSet(): MultiChannelFunctionCurveSet {
  return {
    x: createEmptyFunctionCurveChannel("x"),
    y: createEmptyFunctionCurveChannel("y"),
    scaleX: createEmptyFunctionCurveChannel("scaleX"),
    scaleY: createEmptyFunctionCurveChannel("scaleY"),
    rotationDeg: createEmptyFunctionCurveChannel("rotationDeg"),
    opacity: createEmptyFunctionCurveChannel("opacity"),
  };
}

/** X(프레임)·Y(값) 격자 스냅 순수 함수. */
export function snapFunctionCurvePoint(
  point: { readonly frame: number; readonly value: number },
  grid: FunctionCurveGridSnapOptions,
): { readonly frame: number; readonly value: number } {
  const frameStep = grid.frameStep && grid.frameStep > 0 ? grid.frameStep : 0;
  const valueStep = grid.valueStep && grid.valueStep > 0 ? grid.valueStep : 0;
  const snappedFrame =
    frameStep > 0 ? Math.round(point.frame / frameStep) * frameStep : point.frame;
  const snappedValue =
    valueStep > 0 ? Math.round(point.value / valueStep) * valueStep : point.value;
  return {
    frame: Math.max(0, Object.is(snappedFrame, -0) ? 0 : snappedFrame),
    value: Object.is(snappedValue, -0) ? 0 : snappedValue,
  };
}

/**
 * Fritsch-Carlson (1980) 단조 3차 에르미트(Monotone Cubic Hermite) 접선 기울기 배열 계산.
 * 단조 데이터 구간에서 오버슈트(overshoot)가 발생하지 않도록 `alpha^2 + beta^2 <= 9` 제약을 강제한다.
 */
export function computeFritschCarlsonTangents(
  keyframes: readonly Pick<FunctionCurveKeyframe, "frame" | "value">[],
): readonly number[] {
  const n = keyframes.length;
  if (n === 0) return [];
  if (n === 1) return [0];

  const deltas: number[] = [];
  for (let k = 0; k < n - 1; k += 1) {
    const dx = keyframes[k + 1]!.frame - keyframes[k]!.frame;
    const dy = keyframes[k + 1]!.value - keyframes[k]!.value;
    deltas.push(dx > 1e-9 ? dy / dx : 0);
  }

  const tangents = new Array<number>(n).fill(0);
  tangents[0] = deltas[0]!;
  tangents[n - 1] = deltas[n - 2]!;

  for (let k = 1; k < n - 1; k += 1) {
    const prevD = deltas[k - 1]!;
    const nextD = deltas[k]!;
    if (prevD * nextD <= 0) {
      tangents[k] = 0;
    } else {
      tangents[k] = (prevD + nextD) * 0.5;
    }
  }

  for (let k = 0; k < n - 1; k += 1) {
    const delta = deltas[k]!;
    if (Math.abs(delta) <= 1e-12) {
      tangents[k] = 0;
      tangents[k + 1] = 0;
      continue;
    }
    const alpha = tangents[k]! / delta;
    const beta = tangents[k + 1]! / delta;
    const hypotSq = alpha * alpha + beta * beta;
    if (hypotSq > 9) {
      const tau = 3 / Math.sqrt(hypotSq);
      tangents[k] = tau * alpha * delta;
      tangents[k + 1] = tau * beta * delta;
    }
  }

  return tangents;
}

function evalCubicBezier1D(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const inv = 1 - u;
  return (
    inv * inv * inv * p0 +
    3 * inv * inv * u * p1 +
    3 * inv * u * u * p2 +
    u * u * u * p3
  );
}

function evalCubicBezierDerivative1D(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  u: number,
): number {
  const inv = 1 - u;
  return (
    3 * inv * inv * (p1 - p0) +
    6 * inv * u * (p2 - p1) +
    3 * u * u * (p3 - p2)
  );
}

/**
 * 단조 증가하는 1D 3차 베지어 `x(u)`에서 `x(u) = targetX`를 만족하는 매개변수 `u in [0, 1]`를
 * Newton-Raphson + 이분법(bisection) 안전 브래킷으로 역산한다.
 */
export function solveCubicBezierParameterForX(
  x0: number,
  x1: number,
  x2: number,
  x3: number,
  targetX: number,
): number {
  const span = x3 - x0;
  if (span <= 1e-9) return 0;
  if (targetX <= x0) return 0;
  if (targetX >= x3) return 1;

  const safeX1 = clamp(x1, x0, x3);
  const safeX2 = clamp(x2, x0, x3);

  let lo = 0;
  let hi = 1;
  let u = clamp((targetX - x0) / span, 0, 1);

  for (let iter = 0; iter < 24; iter += 1) {
    const currentX = evalCubicBezier1D(x0, safeX1, safeX2, x3, u);
    const err = currentX - targetX;
    if (Math.abs(err) <= 1e-7) return u;

    if (err < 0) lo = u;
    else hi = u;

    const deriv = evalCubicBezierDerivative1D(x0, safeX1, safeX2, x3, u);
    if (Math.abs(deriv) > 1e-8) {
      const candidate = u - err / deriv;
      if (candidate > lo && candidate < hi) {
        u = candidate;
        continue;
      }
    }
    u = (lo + hi) * 0.5;
  }

  return u;
}

export function upsertFunctionCurveKeyframe(
  channel: FunctionCurveChannel,
  keyframe: FunctionCurveKeyframe,
): FunctionCurveChannel {
  const frame = Math.max(0, keyframe.frame);
  const normalized: FunctionCurveKeyframe = {
    ...keyframe,
    frame,
    inHandle: keyframe.inHandle
      ? { dx: Math.min(0, keyframe.inHandle.dx), dy: keyframe.inHandle.dy }
      : undefined,
    outHandle: keyframe.outHandle
      ? { dx: Math.max(0, keyframe.outHandle.dx), dy: keyframe.outHandle.dy }
      : undefined,
  };
  const filtered = channel.keyframes.filter((k) => Math.abs(k.frame - frame) > 1e-7);
  const next = [...filtered, normalized].sort((a, b) => a.frame - b.frame);
  return { ...channel, keyframes: next };
}

export function removeFunctionCurveKeyframe(
  channel: FunctionCurveChannel,
  frame: number,
): FunctionCurveChannel {
  const next = channel.keyframes.filter((k) => Math.abs(k.frame - frame) > 1e-7);
  if (next.length === channel.keyframes.length) return channel;
  return { ...channel, keyframes: next };
}

/**
 * 키프레임의 베지어 핸들을 편집한다.
 * - `handleMode === "linked"`이면 반대편 핸들도 동일 접선 기울기(공선성 C1)로 함께 회전한다.
 * - `handleMode === "broken"`이면 지정한 쪽(`in` 또는 `out`) 핸들만 독립 변경한다.
 */
export function updateFunctionCurveHandle(
  channel: FunctionCurveChannel,
  frame: number,
  side: "in" | "out",
  handle: FunctionCurveHandleOffset,
  nextMode?: "linked" | "broken",
): FunctionCurveChannel {
  const idx = channel.keyframes.findIndex((k) => Math.abs(k.frame - frame) <= 1e-7);
  if (idx < 0) return channel;

  const current = channel.keyframes[idx]!;
  const prevSpan = idx > 0 ? current.frame - channel.keyframes[idx - 1]!.frame : current.frame;
  const nextSpan =
    idx + 1 < channel.keyframes.length
      ? channel.keyframes[idx + 1]!.frame - current.frame
      : Math.max(1, prevSpan || 12);

  const mode: FunctionCurveHandleMode =
    nextMode ?? (current.handleMode === "broken" ? "broken" : "linked");

  let inHandle = current.inHandle ?? { dx: -prevSpan / 3, dy: 0 };
  let outHandle = current.outHandle ?? { dx: nextSpan / 3, dy: 0 };

  if (side === "out") {
    const clampedDx = clamp(handle.dx, 0, Math.max(0, nextSpan));
    outHandle = { dx: clampedDx, dy: handle.dy };
    if (mode === "linked" && clampedDx > 1e-6) {
      const slope = handle.dy / clampedDx;
      const inDx = inHandle.dx < -1e-6 ? clamp(inHandle.dx, -prevSpan, 0) : -prevSpan / 3;
      inHandle = { dx: inDx, dy: slope * inDx };
    }
  } else {
    const clampedDx = clamp(handle.dx, -Math.max(0, prevSpan), 0);
    inHandle = { dx: clampedDx, dy: handle.dy };
    if (mode === "linked" && clampedDx < -1e-6) {
      const slope = handle.dy / clampedDx;
      const outDx = outHandle.dx > 1e-6 ? clamp(outHandle.dx, 0, nextSpan) : nextSpan / 3;
      outHandle = { dx: outDx, dy: slope * outDx };
    }
  }

  const updatedKf: FunctionCurveKeyframe = {
    ...current,
    interpolation: "smooth",
    handleMode: mode,
    inHandle,
    outHandle,
  };

  return {
    ...channel,
    keyframes: channel.keyframes.map((k, i) => (i === idx ? updatedKf : k)),
  };
}

/** 단일 채널을 임의의 프레임(실수 서브프레임 포함)에서 평가한다. */
export function evaluateFunctionCurveChannel(
  channel: FunctionCurveChannel,
  frame: number,
): number {
  const kfs = channel.keyframes;
  if (kfs.length === 0) return channel.defaultValue;
  if (frame <= kfs[0]!.frame) return kfs[0]!.value;
  if (frame >= kfs[kfs.length - 1]!.frame) return kfs[kfs.length - 1]!.value;

  let segIdx = 0;
  for (let i = 0; i < kfs.length - 1; i += 1) {
    if (frame >= kfs[i]!.frame && frame <= kfs[i + 1]!.frame) {
      segIdx = i;
      break;
    }
  }

  const k0 = kfs[segIdx]!;
  const k1 = kfs[segIdx + 1]!;
  const span = k1.frame - k0.frame;
  if (span <= 1e-9 || k0.interpolation === "constant") {
    return k0.value;
  }
  if (k0.interpolation === "linear") {
    const t = (frame - k0.frame) / span;
    return k0.value + (k1.value - k0.value) * t;
  }

  // smooth 보간: auto-monotone이면 Fritsch-Carlson 접선에서 핸들을 도출, 아니면 명시 핸들 사용
  const autoTangents = computeFritschCarlsonTangents(kfs);
  const outOffset: FunctionCurveHandleOffset =
    k0.handleMode !== "auto-monotone" && k0.outHandle
      ? { dx: clamp(k0.outHandle.dx, 0, span), dy: k0.outHandle.dy }
      : { dx: span / 3, dy: (autoTangents[segIdx]! * span) / 3 };

  const inOffset: FunctionCurveHandleOffset =
    k1.handleMode !== "auto-monotone" && k1.inHandle
      ? { dx: clamp(k1.inHandle.dx, -span, 0), dy: k1.inHandle.dy }
      : { dx: -span / 3, dy: -(autoTangents[segIdx + 1]! * span) / 3 };

  const x0 = k0.frame;
  const x1 = k0.frame + outOffset.dx;
  const x2 = k1.frame + inOffset.dx;
  const x3 = k1.frame;

  const y0 = k0.value;
  const y1 = k0.value + outOffset.dy;
  const y2 = k1.value + inOffset.dy;
  const y3 = k1.value;

  const u = solveCubicBezierParameterForX(x0, x1, x2, x3, frame);
  const rawVal = evalCubicBezier1D(y0, y1, y2, y3, u);
  return channel.channelId === "opacity" ? clamp(rawVal, 0, 1) : rawVal;
}

/** 6개 채널 전체를 한꺼번에 평가한다. */
export function evaluateMultiChannelFunctionCurves(
  curves: MultiChannelFunctionCurveSet,
  frame: number,
): FunctionCurveEvaluatedPose {
  return {
    x: evaluateFunctionCurveChannel(curves.x, frame),
    y: evaluateFunctionCurveChannel(curves.y, frame),
    scaleX: Math.max(0.01, evaluateFunctionCurveChannel(curves.scaleX, frame)),
    scaleY: Math.max(0.01, evaluateFunctionCurveChannel(curves.scaleY, frame)),
    rotationDeg: evaluateFunctionCurveChannel(curves.rotationDeg, frame),
    opacity: clamp(evaluateFunctionCurveChannel(curves.opacity, frame), 0, 1),
  };
}

// ── 기존 명명 이징(`StudioAnimEase`) 무손실 왕복 매핑 ───────────────────

/**
 * 두 키프레임 구간 `(startFrame, startValue) -> (endFrame, endValue)`에 `StudioAnimEase` 프리셋을
 * 손실 없이 대응시키는 핸들 쌍을 생성한다.
 */
export function mapNamedEaseToSegmentHandles(
  ease: StudioAnimEase,
  startFrame: number,
  startValue: number,
  endFrame: number,
  endValue: number,
): {
  readonly interpolation: FunctionCurveInterpolation;
  readonly outHandle: FunctionCurveHandleOffset;
  readonly nextInHandle: FunctionCurveHandleOffset;
} {
  const kind = normalizeStudioAnimEase(ease);
  const dx = Math.max(0, endFrame - startFrame);
  const dy = endValue - startValue;
  const ctrl = STUDIO_EASE_BEZIER_PRESETS[kind];
  return {
    interpolation: kind === "linear" ? "linear" : "smooth",
    outHandle: { dx: dx * ctrl.x1, dy: dy * ctrl.y1 },
    nextInHandle: { dx: -dx * (1 - ctrl.x2), dy: -dy * (1 - ctrl.y2) },
  };
}

/**
 * 두 키프레임 구간의 핸들/보간 설정으로부터 일치하는 `StudioAnimEase` 프리셋 이름을 역추출한다.
 * 사용자 커스텀 곡선이면 `null`을 반환한다.
 */
export function matchNamedEaseFromSegmentHandles(
  k0: FunctionCurveKeyframe,
  k1: FunctionCurveKeyframe,
  tolerance = 1e-4,
): StudioAnimEase | null {
  if (k0.interpolation === "linear") return "linear";
  if (k0.interpolation !== "smooth") return null;

  const dx = k1.frame - k0.frame;
  const dy = k1.value - k0.value;
  if (dx <= 1e-9 || !k0.outHandle || !k1.inHandle) return null;

  const x1 = k0.outHandle.dx / dx;
  const x2 = 1 + k1.inHandle.dx / dx;
  const y1 = Math.abs(dy) > 1e-9 ? k0.outHandle.dy / dy : 0;
  const y2 = Math.abs(dy) > 1e-9 ? 1 + k1.inHandle.dy / dy : 1;

  const candidates: readonly StudioAnimEase[] = [
    "linear",
    "ease-in",
    "ease-out",
    "ease-in-out",
  ];
  for (const name of candidates) {
    const preset = STUDIO_EASE_BEZIER_PRESETS[name];
    const matchesX =
      Math.abs(x1 - preset.x1) <= tolerance && Math.abs(x2 - preset.x2) <= tolerance;
    const matchesY =
      Math.abs(dy) <= 1e-9 ||
      (Math.abs(y1 - preset.y1) <= tolerance && Math.abs(y2 - preset.y2) <= tolerance);
    if (matchesX && matchesY) return name;
  }
  return null;
}
