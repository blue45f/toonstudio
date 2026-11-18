/**
 * Studio Bezier Pen — CSP `도형 > 베지어 곡선 / 꺾은선 / 연속 곡선(vars 31, 32, 33, 607)` 순수 리듀서 상태 머신.
 *
 * 역공학 근거(REA Ghidra clean-room 재구현, 상용 코드/리소스 무포함):
 * - evidence_id: `ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68`
 * - evidence_id: `ev_9e97a121e10ceaa075c9f4fb0b21c7bf2bd090aa4a639830aa6f070bec16e30f`
 *
 * 지원 제스처 및 기능:
 * - `click`: 꺾인 정점 추가 또는 시작점 근접 클릭 시 폐곡선 완성
 * - `drag`: 대칭(symmetric) 탄젠트 핸들 드래그
 * - `altDrag`: 꺾인 첨점(broken cusp) 출구 핸들 단독 조작(입구 핸들 고정)
 * - `backspace`: 직전 정점 되돌리기(CSP `BackSpace` 앵커 삭제)
 * - `closePath` / `commitOpen`: 경로 닫기 및 열린 경로 확정
 * - 실시간 `prediction` 고무줄 미리보기 폴리라인 + de Casteljau 적응형 평탄화(`DrawEl` 좌표 변환)
 */

import type { DrawEl } from "../studio-element-model";

export type BezierPenMode = "cubic-bezier" | "polyline" | "continuous-curve";
export type BezierHandleKind = "corner" | "symmetric" | "broken";
export type BezierPenStatus = "idle" | "drawing" | "committed";

export interface BezierPoint2D {
  readonly x: number;
  readonly y: number;
}

export interface BezierPenAnchor {
  readonly x: number;
  readonly y: number;
  readonly inHandle: BezierPoint2D;
  readonly outHandle: BezierPoint2D;
  readonly handleKind: BezierHandleKind;
}

export interface BezierPenState {
  readonly mode: BezierPenMode;
  readonly status: BezierPenStatus;
  readonly anchors: readonly BezierPenAnchor[];
  readonly closed: boolean;
  readonly hoverPoint: BezierPoint2D | null;
  /** 시작점 근접 호버 시 클릭하면 닫힘 여부 표시. */
  readonly willCloseOnClick: boolean;
  /** 마지막 확정 정점부터 현재 포인터까지의 라이브 예측 세그먼트 평탄 좌표 `[x0, y0, ...]`. */
  readonly prediction: readonly number[];
}

export type BezierPenAction =
  | { readonly type: "setMode"; readonly mode: BezierPenMode }
  | { readonly type: "click"; readonly x: number; readonly y: number; readonly closeRadiusPx?: number }
  | { readonly type: "drag"; readonly x: number; readonly y: number }
  | { readonly type: "altDrag"; readonly x: number; readonly y: number }
  | { readonly type: "pointerMove"; readonly x: number; readonly y: number; readonly closeRadiusPx?: number }
  | { readonly type: "backspace" }
  | { readonly type: "closePath" }
  | { readonly type: "commitOpen" }
  | { readonly type: "reset" };

export interface BuildBezierDrawElOptions {
  readonly id: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly brush?: string;
  readonly flattenTolerancePx?: number;
}

const DEFAULT_CLOSE_RADIUS_PX = 10;
const DEFAULT_FLATTEN_TOLERANCE_PX = 0.5;
const MAX_SUBDIVIDE_DEPTH = 10;

export function createInitialBezierPenState(mode: BezierPenMode = "cubic-bezier"): BezierPenState {
  return {
    mode,
    status: "idle",
    anchors: [],
    closed: false,
    hoverPoint: null,
    willCloseOnClick: false,
    prediction: [],
  };
}

/**
 * 3차 베지어 한 구간을 현(chord) 편차 허용치 `tolerancePx` 이하가 될 때까지 de Casteljau 재귀 분할한다.
 */
export function flattenCubicBezierSegment(
  p0: BezierPoint2D,
  p1: BezierPoint2D,
  p2: BezierPoint2D,
  p3: BezierPoint2D,
  tolerancePx = DEFAULT_FLATTEN_TOLERANCE_PX,
): number[] {
  const tolSq = Math.max(0.02, tolerancePx) ** 2;
  const out: number[] = [p0.x, p0.y];

  const subdivide = (
    a0: BezierPoint2D,
    a1: BezierPoint2D,
    a2: BezierPoint2D,
    a3: BezierPoint2D,
    depth: number,
  ): void => {
    const ux = 3 * a1.x - 2 * a0.x - a3.x;
    const uy = 3 * a1.y - 2 * a0.y - a3.y;
    const vx = 3 * a2.x - 2 * a3.x - a0.x;
    const vy = 3 * a2.y - 2 * a3.y - a0.y;
    const errSq = Math.max(ux * ux, vx * vx) + Math.max(uy * uy, vy * vy);

    if (depth >= MAX_SUBDIVIDE_DEPTH || errSq <= 16 * tolSq) {
      out.push(a3.x, a3.y);
      return;
    }

    const m01 = { x: 0.5 * (a0.x + a1.x), y: 0.5 * (a0.y + a1.y) };
    const m12 = { x: 0.5 * (a1.x + a2.x), y: 0.5 * (a1.y + a2.y) };
    const m23 = { x: 0.5 * (a2.x + a3.x), y: 0.5 * (a2.y + a3.y) };
    const m012 = { x: 0.5 * (m01.x + m12.x), y: 0.5 * (m01.y + m12.y) };
    const m123 = { x: 0.5 * (m12.x + m23.x), y: 0.5 * (m12.y + m23.y) };
    const mid = { x: 0.5 * (m012.x + m123.x), y: 0.5 * (m012.y + m123.y) };

    subdivide(a0, m01, m012, mid, depth + 1);
    subdivide(mid, m123, m23, a3, depth + 1);
  };

  subdivide(p0, p1, p2, p3, 0);
  return out;
}

/**
 * `continuous-curve` 모드일 때 정점 열로부터 Catmull-Rom 탄젠트를 유도해 등가 베지어 핸들을 채운다.
 */
function resolveEffectiveAnchors(
  anchors: readonly BezierPenAnchor[],
  mode: BezierPenMode,
  closed: boolean,
): BezierPenAnchor[] {
  if (mode === "polyline") {
    return anchors.map((a) => ({
      ...a,
      inHandle: { x: a.x, y: a.y },
      outHandle: { x: a.x, y: a.y },
      handleKind: "corner",
    }));
  }
  if (mode !== "continuous-curve" || anchors.length < 2) {
    return [...anchors];
  }

  const n = anchors.length;
  return anchors.map((curr, i) => {
    if (curr.handleKind !== "corner") return curr;
    const prev = closed ? anchors[(i - 1 + n) % n]! : anchors[Math.max(0, i - 1)]!;
    const next = closed ? anchors[(i + 1) % n]! : anchors[Math.min(n - 1, i + 1)]!;
    const tx = (next.x - prev.x) / 6;
    const ty = (next.y - prev.y) / 6;
    return {
      ...curr,
      inHandle: { x: curr.x - tx, y: curr.y - ty },
      outHandle: { x: curr.x + tx, y: curr.y + ty },
      handleKind: "symmetric",
    };
  });
}

function computeLivePrediction(
  mode: BezierPenMode,
  anchors: readonly BezierPenAnchor[],
  hover: BezierPoint2D | null,
  closeRadiusPx = DEFAULT_CLOSE_RADIUS_PX,
): { prediction: number[]; willCloseOnClick: boolean } {
  if (!hover || anchors.length === 0) {
    return { prediction: [], willCloseOnClick: false };
  }
  const first = anchors[0]!;
  const willCloseOnClick =
    anchors.length >= 2 && Math.hypot(hover.x - first.x, hover.y - first.y) <= closeRadiusPx;
  const targetPt = willCloseOnClick ? { x: first.x, y: first.y } : hover;
  const eff = resolveEffectiveAnchors(anchors, mode, false);
  const last = eff[eff.length - 1]!;

  if (mode === "polyline") {
    return {
      prediction: [last.x, last.y, targetPt.x, targetPt.y],
      willCloseOnClick,
    };
  }

  const c2 = willCloseOnClick && eff[0] ? eff[0].inHandle : targetPt;
  return {
    prediction: flattenCubicBezierSegment(
      { x: last.x, y: last.y },
      last.outHandle,
      c2,
      targetPt,
      1.0,
    ),
    willCloseOnClick,
  };
}

/**
 * 베지어 펜 순수 리듀서 상태 머신.
 */
export function reduceStudioBezierPen(
  state: BezierPenState,
  action: BezierPenAction,
): BezierPenState {
  switch (action.type) {
    case "reset":
      return createInitialBezierPenState(state.mode);

    case "setMode": {
      const next = { ...state, mode: action.mode };
      if (next.status !== "drawing") return next;
      const live = computeLivePrediction(action.mode, next.anchors, next.hoverPoint);
      return { ...next, ...live };
    }

    case "click": {
      if (!Number.isFinite(action.x) || !Number.isFinite(action.y)) return state;
      const base = state.status === "committed"
        ? createInitialBezierPenState(state.mode)
        : state;
      const closeRadius = Math.max(1, action.closeRadiusPx ?? DEFAULT_CLOSE_RADIUS_PX);
      if (base.anchors.length >= 2) {
        const first = base.anchors[0]!;
        if (Math.hypot(action.x - first.x, action.y - first.y) <= closeRadius) {
          return {
            ...base,
            status: "committed",
            closed: true,
            willCloseOnClick: false,
            prediction: [],
          };
        }
      }

      const pt = { x: action.x, y: action.y };
      const anchor: BezierPenAnchor = {
        x: pt.x,
        y: pt.y,
        inHandle: pt,
        outHandle: pt,
        handleKind: "corner",
      };
      const anchors = [...base.anchors, anchor];
      return {
        ...base,
        status: "drawing",
        closed: false,
        anchors,
        hoverPoint: pt,
        willCloseOnClick: false,
        prediction: [],
      };
    }

    case "drag": {
      if (state.status !== "drawing" || state.anchors.length === 0) return state;
      if (!Number.isFinite(action.x) || !Number.isFinite(action.y)) return state;
      if (state.mode === "polyline") {
        const anchors = state.anchors.slice();
        const pt = { x: action.x, y: action.y };
        anchors[anchors.length - 1] = {
          x: pt.x,
          y: pt.y,
          inHandle: pt,
          outHandle: pt,
          handleKind: "corner",
        };
        return { ...state, anchors, hoverPoint: pt };
      }

      const anchors = state.anchors.slice();
      const last = anchors[anchors.length - 1]!;
      anchors[anchors.length - 1] = {
        ...last,
        outHandle: { x: action.x, y: action.y },
        inHandle: { x: 2 * last.x - action.x, y: 2 * last.y - action.y },
        handleKind: "symmetric",
      };
      return { ...state, anchors, hoverPoint: { x: action.x, y: action.y }, prediction: [] };
    }

    case "altDrag": {
      // 첨점(broken cusp) 조작: 입구 핸들(inHandle)은 그대로 두고 출구 핸들(outHandle)만 꺾는다.
      if (state.status !== "drawing" || state.anchors.length === 0) return state;
      if (!Number.isFinite(action.x) || !Number.isFinite(action.y)) return state;
      const anchors = state.anchors.slice();
      const last = anchors[anchors.length - 1]!;
      anchors[anchors.length - 1] = {
        ...last,
        outHandle: { x: action.x, y: action.y },
        handleKind: "broken",
      };
      return { ...state, anchors, hoverPoint: { x: action.x, y: action.y }, prediction: [] };
    }

    case "pointerMove": {
      if (!Number.isFinite(action.x) || !Number.isFinite(action.y)) return state;
      const hover = { x: action.x, y: action.y };
      if (state.status !== "drawing") {
        return { ...state, hoverPoint: hover };
      }
      const live = computeLivePrediction(
        state.mode,
        state.anchors,
        hover,
        action.closeRadiusPx ?? DEFAULT_CLOSE_RADIUS_PX,
      );
      return {
        ...state,
        hoverPoint: hover,
        prediction: live.prediction,
        willCloseOnClick: live.willCloseOnClick,
      };
    }

    case "backspace": {
      if (state.anchors.length === 0) return state;
      const anchors = state.anchors.slice(0, -1);
      if (anchors.length === 0) {
        return createInitialBezierPenState(state.mode);
      }
      const live = computeLivePrediction(state.mode, anchors, state.hoverPoint);
      return {
        ...state,
        status: "drawing",
        closed: false,
        anchors,
        prediction: live.prediction,
        willCloseOnClick: live.willCloseOnClick,
      };
    }

    case "closePath": {
      if (state.anchors.length < 2) return state;
      return {
        ...state,
        status: "committed",
        closed: true,
        willCloseOnClick: false,
        prediction: [],
      };
    }

    case "commitOpen": {
      if (state.anchors.length < 2) return state;
      return {
        ...state,
        status: "committed",
        closed: false,
        willCloseOnClick: false,
        prediction: [],
      };
    }
  }
}

/**
 * 확정(또는 작성 중)인 베지어 경로를 적응형 평탄화해 `DrawEl` 호환 `[x0, y0, ...]` 배열로 변환한다.
 */
export function flattenBezierPenToPoints(
  state: Pick<BezierPenState, "mode" | "anchors" | "closed">,
  tolerancePx = DEFAULT_FLATTEN_TOLERANCE_PX,
): number[] {
  const n = state.anchors.length;
  if (n === 0) return [];
  if (n === 1) return [state.anchors[0]!.x, state.anchors[0]!.y];

  const eff = resolveEffectiveAnchors(state.anchors, state.mode, state.closed);
  const segCount = state.closed ? n : n - 1;
  const out: number[] = [];

  for (let i = 0; i < segCount; i++) {
    const a = eff[i]!;
    const b = eff[(i + 1) % n]!;
    const segPts = state.mode === "polyline"
      ? [a.x, a.y, b.x, b.y]
      : flattenCubicBezierSegment(
          { x: a.x, y: a.y },
          a.outHandle,
          b.inHandle,
          { x: b.x, y: b.y },
          tolerancePx,
        );
    if (i === 0) out.push(...segPts);
    else out.push(...segPts.slice(2));
  }
  return out;
}

/**
 * 베지어 펜 상태를 중립 필압이 채워진 벡터 `DrawEl` 요소로 변환한다.
 */
export function buildDrawElFromBezierPen(
  state: Pick<BezierPenState, "mode" | "anchors" | "closed">,
  options: BuildBezierDrawElOptions,
): DrawEl | null {
  const points = flattenBezierPenToPoints(
    state,
    options.flattenTolerancePx ?? DEFAULT_FLATTEN_TOLERANCE_PX,
  );
  const count = Math.floor(points.length / 2);
  if (count < 2) return null;

  return {
    id: options.id,
    type: "draw",
    kind: "freehand",
    mode: "pen",
    brush: options.brush ?? "gpen",
    points,
    pressures: new Array<number>(count).fill(0.5),
    stroke: options.stroke,
    strokeWidth: Math.max(0.5, options.strokeWidth),
  };
}
