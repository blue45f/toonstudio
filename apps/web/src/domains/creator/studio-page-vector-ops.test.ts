import { CenterlineRefitError } from "@toonstudio/studio-brush-platform";
import { describe, expect, it, vi } from "vitest";

import {
  createStudioPageVectorOps,
  refitSettledStudioStrokeCenterline,
  studioPathBooleanSyncPolygonPointTotal,
  STUDIO_PATH_BOOLEAN_SYNC_MAX_TOTAL_POINTS,
} from "./studio-page-vector-ops";

import type { AnimationTimelineDoc } from "./studio-anim-tracks";
import type { DrawEl, El } from "./studio-element-model";
import type {
  StudioPageVectorOps,
  StudioPageVectorOpsContext,
} from "./studio-page-vector-ops";
import type { CenterlineFitEngine } from "@toonstudio/studio-brush-platform";

/**
 * Settled-stroke centerline refit seam (studio-page-vector-ops):
 * default-OFF no-op contract (byte-identical element, engine never invoked),
 * eligibility gates, delegation to the package enhancer, and fail-closed
 * propagation of the package's centerline-only guard.
 */

function drawStroke(overrides: Partial<DrawEl> = {}): DrawEl {
  return {
    id: "stroke-1",
    type: "draw",
    points: [0, 0, 4, 1, 8, 0, 12, 2, 16, 1],
    stroke: "#111111",
    strokeWidth: 4,
    ...overrides,
  };
}

/** Faithful fake fitter: echoes the polyline back as an open M/L path. */
function identityFitEngine(): CenterlineFitEngine {
  return {
    fitPolyline(points) {
      return {
        verbs: points.map(([x, y], index) =>
          index === 0
            ? ({ v: "M", x, y } as const)
            : ({ v: "L", x, y } as const),
        ),
      };
    },
  };
}

describe("refitSettledStudioStrokeCenterline — default OFF", () => {
  it("is a pure no-op with the option absent: element byte-identical", () => {
    const element = drawStroke();
    const before = JSON.stringify(element);
    const pointsRef = element.points;
    const outcome = refitSettledStudioStrokeCenterline(element);
    expect(outcome).toEqual({ kind: "disabled" });
    expect(JSON.stringify(element)).toBe(before);
    expect(element.points).toBe(pointsRef);
  });

  it("never touches the engine when enabled is false", () => {
    const fitPolyline = vi.fn();
    const outcome = refitSettledStudioStrokeCenterline(drawStroke(), {
      enabled: false,
      fitEngine: { fitPolyline },
    });
    expect(outcome).toEqual({ kind: "disabled" });
    expect(fitPolyline).not.toHaveBeenCalled();
  });
});

describe("refitSettledStudioStrokeCenterline — enabled", () => {
  it("refits the freehand centerline with exact endpoints", () => {
    const element = drawStroke();
    const engine = identityFitEngine();
    const spy = vi.spyOn(engine, "fitPolyline");
    const outcome = refitSettledStudioStrokeCenterline(element, {
      enabled: true,
      fitEngine: engine,
      accuracy: 0.35,
    });
    expect(outcome.kind).toBe("refit");
    if (outcome.kind !== "refit") return;
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      [
        [0, 0],
        [4, 1],
        [8, 0],
        [12, 2],
        [16, 1],
      ],
      { closed: false, accuracy: 0.35 },
    );
    expect(outcome.refit.path.verbs[0]).toEqual({ v: "M", x: 0, y: 0 });
    const lastVerb =
      outcome.refit.path.verbs[outcome.refit.path.verbs.length - 1]!;
    expect(lastVerb).toEqual({ v: "L", x: 16, y: 1 });
    expect(outcome.refit.measuredDeviationPx).toBeLessThanOrEqual(1e-9);
    // The seam proposes; it never mutates the document element.
    expect(element.points).toEqual([0, 0, 4, 1, 8, 0, 12, 2, 16, 1]);
  });

  it.each([
    ["shape-stroke", drawStroke({ kind: "rect" })],
    ["eraser-stroke", drawStroke({ mode: "eraser" })],
    ["insufficient-points", drawStroke({ points: [0, 0] })],
    ["insufficient-points", drawStroke({ points: [0, 0, 1, 1, 2] })],
  ])("returns ineligible (%s) without calling the engine", (reason, element) => {
    const fitPolyline = vi.fn();
    const outcome = refitSettledStudioStrokeCenterline(element, {
      enabled: true,
      fitEngine: { fitPolyline },
    });
    expect(outcome).toEqual({ kind: "ineligible", reason });
    expect(fitPolyline).not.toHaveBeenCalled();
  });

  it("fails closed on outline-ring input via the package centerline guard", () => {
    const fitPolyline = vi.fn();
    const ringElement = drawStroke({
      // A closed ring is the outline-polygon signature the fitter must never
      // receive (measured kurbo non-termination on sliver outlines).
      points: [0, 0, 12, 0, 12, 8, 0, 8, 0, 0],
    });
    try {
      refitSettledStudioStrokeCenterline(ringElement, {
        enabled: true,
        fitEngine: { fitPolyline },
      });
      expect.unreachable("outline ring must be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(CenterlineRefitError);
      expect((error as CenterlineRefitError).reason).toBe("outline-input");
    }
    expect(fitPolyline).not.toHaveBeenCalled();
  });
});

/**
 * 빠른 결합(다각형) 명시 선택 경로 (studio-page-vector-ops):
 * 패널에서 명시 선택했을 때만 호출되는 동기 엔진이 기존 결과 모델(조각 DrawEl)로
 * 커밋되는지, 구멍·분리 영역이 남는지, 그리고 기본 CanvasKit Worker 경로를
 * 건드리지 않는지(클라이언트 미생성·미폐기)를 검증한다.
 */

function rectEl(id: string, x1: number, y1: number, x2: number, y2: number): DrawEl {
  return {
    id,
    type: "draw",
    kind: "rect",
    shapeParams: { cornerRadius: 0, starPoints: 5, starInnerRatio: 0.5, polygonSides: 6 },
    points: [x1, y1, x2, y2],
    stroke: "#111111",
    strokeWidth: 2,
    fill: "#ff0000",
  };
}

function flatRingArea(points: readonly number[]): number {
  let sum = 0;
  const count = points.length / 2;
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    sum += points[i * 2]! * points[j * 2 + 1]! - points[j * 2]! * points[i * 2 + 1]!;
  }
  return Math.abs(sum) / 2;
}

function makeVectorOps(elements: El[], selectedIds: string[]) {
  const commit = vi.fn((_next: El[], _extra?: unknown, _pageId?: string) => true);
  const setError = vi.fn();
  const setPathBooleanBusy = vi.fn();
  const announceDrawingShortcut = vi.fn();
  const applyGroupSelectionState = vi.fn();
  const pathBooleanClientRef: { current: unknown } = { current: null };
  const animTimeline: AnimationTimelineDoc = { fps: 24, frameCount: 1, tracks: {} };
  const ctx = {
    paperVectorRefinementUnavailableReason: null,
    selected: null,
    elementById: new Map(elements.map((el) => [el.id, el])),
    nodeSmoothStrength: 0.5,
    pageEditLocked: false,
    masterEditMode: false,
    activePage: { id: "page-1" },
    animTimeline,
    drawingRef: { current: null },
    drawingPointerTransportRef: { current: null },
    pendingStrokeCommitsRef: { current: null },
    flushPendingStrokeCommitsRef: { current: () => true },
    pathBooleanRunIdRef: { current: 0 },
    pathBooleanActiveRef: { current: false },
    pathBooleanAbortRef: { current: null },
    pathBooleanClientRef,
    paperVectorRefinementRunIdRef: { current: 0 },
    paperVectorRefinementActiveRef: { current: false },
    paperVectorRefinementAbortRef: { current: null },
    paperVectorRefinementRequestSequenceRef: { current: 0 },
    paperVectorRefinementEngineEpochRef: { current: 0 },
    paperVectorRefinementClientRef: { current: null },
    currentPageIdRef: { current: "page-1" },
    masterEditModeRef: { current: false },
    activeElementsRef: { current: elements },
    activeGroupsRef: { current: [] },
    activeSurfaceReviewLockedRef: { current: false },
    selectedIdRef: { current: selectedIds[0] ?? null },
    marqueeIdsRef: { current: [...selectedIds] },
    activeGroupIdRef: { current: null },
    captureStudioMutationTicket: () => ({}),
    canApplyStudioMutation: () => true,
    currentCanvasSelectionIds: () => [...selectedIds],
    commit,
    applyGroupSelectionState,
    setError,
    setPaperVectorRefinementBusy: vi.fn(),
    setPathBooleanBusy,
    setSelectedId: vi.fn(),
    setMarqueeIds: vi.fn(),
    announceDrawingShortcut,
  } as unknown as StudioPageVectorOpsContext;
  const ops: StudioPageVectorOps = createStudioPageVectorOps(ctx);
  return { ops, commit, setError, setPathBooleanBusy, announceDrawingShortcut, pathBooleanClientRef };
}

describe("studioPathBooleanSyncPolygonPointTotal — 정점 상한 판정", () => {
  it("두 스펙의 폴리곤 정점 합계를 반환한다", () => {
    const spec = { kind: "rect", points: [0, 0, 10, 10] } as const;
    const single = studioPathBooleanSyncPolygonPointTotal(spec, spec);
    expect(single).not.toBeNull();
    expect(single!).toBeGreaterThanOrEqual(8);
    expect(STUDIO_PATH_BOOLEAN_SYNC_MAX_TOTAL_POINTS).toBe(2000);
  });

  it("폴리곤화에 실패하는 스펙이면 null 을 반환한다(사유는 어댑터가 만든다)", () => {
    const good = { kind: "rect", points: [0, 0, 10, 10] } as const;
    const bad = { kind: "rect", points: [0, 0] } as const;
    expect(studioPathBooleanSyncPolygonPointTotal(good, bad)).toBeNull();
  });
});

describe("applyPathBooleanCombineSync — 명시 선택 동기 결합", () => {
  it("union: 겹친 사각형 2개가 면적 17500 인 조각 1개로 단일 커밋된다", async () => {
    const base = rectEl("a", 0, 0, 100, 100);
    const top = rectEl("b", 50, 50, 150, 150);
    const h = makeVectorOps([base, top] as unknown as El[], ["a", "b"]);
    await h.ops.applyPathBooleanCombineSync("union");
    expect(h.commit).toHaveBeenCalledTimes(1);
    const next = h.commit.mock.calls[0]![0] as DrawEl[];
    expect(next).toHaveLength(1);
    expect(flatRingArea(next[0]!.points)).toBeCloseTo(17500, 3);
    expect(h.setError).toHaveBeenLastCalledWith(null);
    expect(h.announceDrawingShortcut).toHaveBeenCalledWith(
      expect.stringContaining("빠른 결합(다각형)")
    );
    expect(h.setPathBooleanBusy.mock.calls).toEqual([[true], [false]]);
    // 기본 Worker 경로는 건드리지 않는다 — 클라이언트를 만들지 않았다.
    expect(h.pathBooleanClientRef.current).toBeNull();
  });

  it("subtract: 안쪽 도형을 빼면 구멍이 키홀 링으로 남아 순면적 7500 이 된다", async () => {
    const base = rectEl("a", 0, 0, 100, 100);
    const top = rectEl("b", 25, 25, 75, 75);
    const h = makeVectorOps([base, top] as unknown as El[], ["a", "b"]);
    await h.ops.applyPathBooleanCombineSync("subtract");
    expect(h.commit).toHaveBeenCalledTimes(1);
    const next = h.commit.mock.calls[0]![0] as DrawEl[];
    expect(next).toHaveLength(1);
    expect(flatRingArea(next[0]!.points)).toBeCloseTo(7500, 3);
  });

  it("union: 분리된 도형은 조각 2개로 커밋된다(분리 영역 보존)", async () => {
    const base = rectEl("a", 0, 0, 10, 10);
    const top = rectEl("b", 20, 20, 30, 30);
    const h = makeVectorOps([base, top] as unknown as El[], ["a", "b"]);
    await h.ops.applyPathBooleanCombineSync("union");
    expect(h.commit).toHaveBeenCalledTimes(1);
    const next = h.commit.mock.calls[0]![0] as DrawEl[];
    expect(next).toHaveLength(2);
  });

  it("intersect: 겹치지 않으면 사유만 알리고 커밋하지 않는다(자동 폴백 없음)", async () => {
    const base = rectEl("a", 0, 0, 10, 10);
    const top = rectEl("b", 20, 20, 30, 30);
    const h = makeVectorOps([base, top] as unknown as El[], ["a", "b"]);
    await h.ops.applyPathBooleanCombineSync("intersect");
    expect(h.commit).not.toHaveBeenCalled();
    expect(h.setError).toHaveBeenCalledWith(expect.stringContaining("겹치지 않아"));
    expect(h.pathBooleanClientRef.current).toBeNull();
  });

  it("선택이 2개가 아니면 게이트 사유로 종료하고 busy 를 켜지 않는다", async () => {
    const base = rectEl("a", 0, 0, 10, 10);
    const h = makeVectorOps([base] as unknown as El[], ["a"]);
    await h.ops.applyPathBooleanCombineSync("union");
    expect(h.commit).not.toHaveBeenCalled();
    expect(h.setPathBooleanBusy).not.toHaveBeenCalled();
    expect(h.setError).toHaveBeenCalledWith(expect.stringContaining("도형 2개"));
  });
});
