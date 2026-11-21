// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { StageHandoffCard } from "../production-hub/StageHandoffCard";
import {
  createLineArtTestGrid,
  eraseVectorUpToIntersection,
  generateRadialSpeedlines,
  generateRepeatGrid,
  generateSymmetryStrokes,
  recognizeQuickShape,
  simulateColorDropFill,
  snapStrokeToPerspectiveRuler,
  wrapStrokeAcrossTorus,
  type VectorStroke,
} from "./competitor-special-drawing-engine";
import {
  addSlideHighlighterStroke,
  alignShapes,
  appendLaserPointerPoint,
  computeSmartGuides,
  createDefaultPptDocument,
  createMasterSlidesFromCuts,
  distributeShapes,
  executeBooleanShapeOp,
  getShapeAnchorPoint,
  groupShapes,
  matchShapeSizes,
  moveShapeWithAutoReroute,
  navigatePresentationSlide,
  pruneLaserTrail,
  redoCanvasDocument,
  reorderShapeZOrder,
  routeSmartConnector,
  undoCanvasDocument,
  ungroupShapes,
  updateSlideNotes,
  type CanvasShapeObject,
  type Point2D,
} from "./ppt-precision-layout-engine";
import { StudioPptProDrawingPanel } from "./StudioPptProDrawingPanel";

afterEach(() => {
  cleanup();
});

const SAMPLE_RECTS: readonly CanvasShapeObject[] = [
  { id: "a", label: "A", kind: "rect", x: 10, y: 20, width: 100, height: 60, zIndex: 0, groupId: null },
  { id: "b", label: "B", kind: "rect", x: 70, y: 50, width: 100, height: 60, zIndex: 1, groupId: null },
  { id: "c", label: "C", kind: "rect", x: 250, y: 140, width: 80, height: 40, zIndex: 2, groupId: null },
];

describe("PPT 정밀 레이아웃 · 불리언 · 커넥터 · 계층 · 발표 엔진", () => {
  it("6종 정렬(좌·수평중앙·우·상·수직중앙·하)을 정확히 계산하고 잠긴 요소는 유지한다", () => {
    const withLocked: readonly CanvasShapeObject[] = [
      ...SAMPLE_RECTS,
      { id: "locked", label: "L", kind: "rect", x: 500, y: 500, width: 50, height: 50, zIndex: 3, groupId: null, locked: true },
    ];
    const ids = ["a", "b", "c", "locked"];

    const left = alignShapes(withLocked, ids, "left");
    expect(left.slice(0, 3).map((s) => s.x)).toEqual([10, 10, 10]);
    expect(left[3].x).toBe(500);

    const right = alignShapes(withLocked, ids, "right");
    expect(right.slice(0, 3).map((s) => s.x + s.width)).toEqual([330, 330, 330]);

    const centerX = alignShapes(withLocked, ids, "center-x");
    expect(centerX.slice(0, 3).map((s) => s.x + s.width / 2)).toEqual([170, 170, 170]);

    const top = alignShapes(withLocked, ids, "top");
    expect(top.slice(0, 3).map((s) => s.y)).toEqual([20, 20, 20]);

    const bottom = alignShapes(withLocked, ids, "bottom");
    expect(bottom.slice(0, 3).map((s) => s.y + s.height)).toEqual([180, 180, 180]);

    const centerY = alignShapes(withLocked, ids, "center-y");
    expect(centerY.slice(0, 3).map((s) => s.y + s.height / 2)).toEqual([100, 100, 100]);
  });

  it("가로 등간격 배분이 양 끝 요소를 고정한 채 인접 간격을 정확히 동일하게 맞춘다", () => {
    const distributed = distributeShapes(SAMPLE_RECTS, ["a", "b", "c"], "horizontal");
    const [a, b, c] = distributed;
    const gap1 = b.x - (a.x + a.width);
    const gap2 = c.x - (b.x + b.width);
    expect(gap1).toBeCloseTo(gap2, 2);
    expect(a.x).toBe(10);
    expect(c.x).toBe(250);
  });

  it("세로 등간격 배분이 인접 수직 간격을 정확히 동일하게 맞춘다", () => {
    const distributed = distributeShapes(SAMPLE_RECTS, ["a", "b", "c"], "vertical");
    const [a, b, c] = distributed;
    const gap1 = b.y - (a.y + a.height);
    const gap2 = c.y - (b.y + b.height);
    expect(gap1).toBeCloseTo(gap2, 2);
    expect(a.y).toBe(20);
    expect(c.y).toBe(140);
  });

  it("크기 통일 6모드(최대/최소 폭·높이·전체)를 정확히 적용한다", () => {
    expect(matchShapeSizes(SAMPLE_RECTS, ["a", "c"], "max-width").map((s) => s.width)).toEqual([100, 100, 100]);
    expect(matchShapeSizes(SAMPLE_RECTS, ["a", "c"], "min-width").map((s) => s.width)).toEqual([80, 100, 80]);
    expect(matchShapeSizes(SAMPLE_RECTS, ["a", "c"], "max-height").map((s) => s.height)).toEqual([60, 60, 60]);
    expect(matchShapeSizes(SAMPLE_RECTS, ["a", "c"], "min-height").map((s) => s.height)).toEqual([40, 60, 40]);
    const both = matchShapeSizes(SAMPLE_RECTS, ["a", "c"], "max-both");
    expect([both[2].width, both[2].height]).toEqual([100, 60]);
    const minBoth = matchShapeSizes(SAMPLE_RECTS, ["a", "c"], "min-both");
    expect([minBoth[0].width, minBoth[0].height]).toEqual([80, 40]);
  });

  it("드래그 중 1px 자석 스마트 가이드로 좌측/상단 경계를 스냅하고 거리(px) 라벨을 산출한다", () => {
    const moving = { id: "m", x: 134, y: 23, width: 80, height: 60 };
    const snap = computeSmartGuides(moving, [SAMPLE_RECTS[0]], 6, 1);
    expect(snap.snappedY).toBe(20);
    expect(snap.snappedX).toBe(134);
    expect(snap.guides.some((g) => g.axis === "horizontal" && g.position === 20)).toBe(true);
    expect(snap.distanceLabels).toContainEqual(
      expect.objectContaining({ axis: "horizontal", distancePx: 24, label: "24px" }),
    );
  });

  it("도형 불리언 Union은 A+B-Overlap 면적과 일치하고 단일 외곽 경로를 생성한다", () => {
    const res = executeBooleanShapeOp(SAMPLE_RECTS[0], SAMPLE_RECTS[1], "union");
    expect(res.pieces).toHaveLength(1);
    expect(res.overlapAreaPx2).toBeCloseTo(1200, 1);
    expect(res.totalAreaPx2).toBeCloseTo(6000 + 6000 - 1200, 1);
    expect(res.combinedSvgPath).toContain("M ");
    expect(res.combinedSvgPath).toContain("Z");
  });

  it("도형 불리언 Subtract(A-B)는 겹치는 영역을 정확히 덜어낸다", () => {
    const res = executeBooleanShapeOp(SAMPLE_RECTS[0], SAMPLE_RECTS[1], "subtract");
    expect(res.pieces).toHaveLength(1);
    expect(res.totalAreaPx2).toBeCloseTo(4800, 1);
  });

  it("도형 불리언 Intersect(A∩B)는 교차 직사각형 면적(40x30=1200)을 정확히 산출한다", () => {
    const res = executeBooleanShapeOp(SAMPLE_RECTS[0], SAMPLE_RECTS[1], "intersect");
    expect(res.pieces).toHaveLength(1);
    expect(res.totalAreaPx2).toBeCloseTo(1200, 1);
    expect(res.bounds).toEqual({ x: 70, y: 50, width: 40, height: 30 });
  });

  it("도형 불리언 Fragment는 A전용·교차·B전용 3개 조각으로 분해하며 합산 면적이 Union과 같다", () => {
    const res = executeBooleanShapeOp(SAMPLE_RECTS[0], SAMPLE_RECTS[1], "fragment");
    expect(res.pieces).toHaveLength(3);
    expect(res.pieces.map((p) => p.role)).toEqual(["a-only", "overlap", "b-only"]);
    expect(res.totalAreaPx2).toBeCloseTo(10800, 1);
  });

  it("도형 불리언 Combine(XOR)은 겹침을 비워 A+B-2*Overlap 면적을 산출한다", () => {
    const res = executeBooleanShapeOp(SAMPLE_RECTS[0], SAMPLE_RECTS[1], "combine");
    expect(res.totalAreaPx2).toBeCloseTo(9600, 1);
    expect(res.fillRule).toBe("evenodd");
  });

  it("완전 포함(B⊂A) 도형의 Subtract와 Combine은 내부 구멍을 뚫어 정확한 잔여 면적을 계산한다", () => {
    const outer: CanvasShapeObject = { id: "o", label: "O", kind: "rect", x: 0, y: 0, width: 100, height: 100, zIndex: 0, groupId: null };
    const inner: CanvasShapeObject = { id: "i", label: "I", kind: "rect", x: 25, y: 25, width: 50, height: 50, zIndex: 1, groupId: null };
    const sub = executeBooleanShapeOp(outer, inner, "subtract");
    expect(sub.totalAreaPx2).toBeCloseTo(7500, 1);
    expect(sub.pieces[0]?.polygons.length).toBe(2);
    const uni = executeBooleanShapeOp(outer, inner, "union");
    expect(uni.totalAreaPx2).toBeCloseTo(10000, 1);
  });

  it("오목 말풍선(speech-bubble)과 타원의 불리언 연산도 유효한 SVG 경로와 면적을 생성한다", () => {
    const bubble: CanvasShapeObject = { id: "sb", label: "말풍선", kind: "speech-bubble", x: 20, y: 20, width: 120, height: 90, zIndex: 0, groupId: null };
    const oval: CanvasShapeObject = { id: "ov", label: "타원", kind: "ellipse", x: 90, y: 40, width: 100, height: 80, zIndex: 1, groupId: null };
    const unionRes = executeBooleanShapeOp(bubble, oval, "union");
    expect(unionRes.totalAreaPx2).toBeGreaterThan(8000);
    expect(unionRes.combinedSvgPath.startsWith("M ")).toBe(true);
  });

  it("스마트 커넥터는 4면 앵커와 auto 최단 앵커를 해석해 엘보우·직교·베지어 경로를 생성한다", () => {
    expect(getShapeAnchorPoint(SAMPLE_RECTS[0], "right")).toEqual({ x: 110, y: 50 });
    const elbow = routeSmartConnector(
      { id: "c1", fromShapeId: "a", fromAnchor: "auto", toShapeId: "c", toAnchor: "auto", style: "elbow" },
      SAMPLE_RECTS,
    );
    expect(elbow).not.toBeNull();
    expect(elbow?.resolvedFromAnchor).toBe("right");
    expect(elbow?.waypoints.length).toBe(4);

    const ortho = routeSmartConnector(
      { id: "c2", fromShapeId: "a", fromAnchor: "right", toShapeId: "c", toAnchor: "left", style: "orthogonal" },
      SAMPLE_RECTS,
    );
    expect(ortho?.waypoints.length).toBe(6);

    const bezier = routeSmartConnector(
      { id: "c3", fromShapeId: "a", fromAnchor: "right", toShapeId: "c", toAnchor: "left", style: "bezier" },
      SAMPLE_RECTS,
    );
    expect(bezier?.svgPath).toContain(" C ");
  });

  it("도형 이동 시 연결된 스마트 커넥터가 자동 재라우팅되고 그룹 구성원이 함께 이동한다", () => {
    const base = createDefaultPptDocument();
    const grouped = groupShapes(base, ["cut-a", "cut-b"], "오프닝 묶음");
    const beforeConn = routeSmartConnector(grouped.connectors[0], grouped.shapes);
    const moved = moveShapeWithAutoReroute(grouped, "cut-a", 80, 42, 0);
    const movedB = moved.document.shapes.find((s) => s.id === "cut-b");
    expect(movedB?.x).toBe(118 + (80 - 36));
    expect(moved.routedConnectors[0]?.start.x).not.toBe(beforeConn?.start.x);
  });

  it("그룹화·그룹해제 및 Z-Order 4종(맨앞·앞·뒤·맨뒤)이 Undo/Redo 스냅샷으로 완벽히 왕복한다", () => {
    const base = createDefaultPptDocument();
    const grouped = groupShapes(base, ["cut-a", "cut-b"]);
    expect(grouped.groups).toHaveLength(1);
    const front = reorderShapeZOrder(grouped, "cut-a", "bring-to-front");
    expect(front.shapes.find((s) => s.id === "cut-a")?.zIndex).toBe(3);
    const back = reorderShapeZOrder(front, "cut-a", "send-to-back");
    expect(back.shapes.find((s) => s.id === "cut-a")?.zIndex).toBe(0);
    const forward = reorderShapeZOrder(back, "cut-a", "bring-forward");
    expect(forward.shapes.find((s) => s.id === "cut-a")?.zIndex).toBe(1);
    const backward = reorderShapeZOrder(forward, "cut-a", "send-backward");
    expect(backward.shapes.find((s) => s.id === "cut-a")?.zIndex).toBe(0);

    const ungrouped = ungroupShapes(backward, grouped.groups[0].id);
    expect(ungrouped.groups).toHaveLength(0);
    const undone = undoCanvasDocument(ungrouped);
    expect(undone.groups).toHaveLength(1);
    const redone = redoCanvasDocument(undone);
    expect(redone.groups).toHaveLength(0);
  });

  it("마스터 컷 슬라이드 생성, 레이저 포인터 자동 페이드 소거, 형광펜 주석, 노트 편집이 동작한다", () => {
    let deck = createMasterSlidesFromCuts(
      [
        { cutNumber: 1, title: "오프닝", notes: "노트 1" },
        { cutNumber: 2, title: "전개", notes: "노트 2" },
      ],
      "테스트 덱",
    );
    expect(deck.slides).toHaveLength(2);
    deck = appendLaserPointerPoint(deck, { x: 100, y: 100 }, 1000);
    deck = appendLaserPointerPoint(deck, { x: 150, y: 120 }, 1600);
    expect(deck.laserTrail).toHaveLength(2);
    expect(deck.laserTrail[0].opacity).toBeCloseTo(0.5, 1);
    deck = pruneLaserTrail(deck, 3000);
    expect(deck.laserTrail).toHaveLength(0);

    deck = addSlideHighlighterStroke(deck, [{ x: 10, y: 10 }, { x: 80, y: 10 }]);
    expect(deck.slides[0].highlights).toHaveLength(1);
    expect(deck.slides[1].highlights).toHaveLength(0);

    deck = updateSlideNotes(deck, deck.slides[0].id, "수정된 발표 노트");
    expect(deck.slides[0].speakerNotes).toBe("수정된 발표 노트");

    deck = navigatePresentationSlide(deck, 1);
    expect(deck.currentSlideIndex).toBe(1);
  });
});

describe("경쟁 제품 클린룸 특수 드로잉 6대 엔진", () => {
  it("QuickShape: 흔들린 직선을 15도 스냅 직선으로 보정한다", () => {
    const pts: Point2D[] = Array.from({ length: 12 }, (_, i) => ({
      x: 20 + i * 18,
      y: 100 + Math.sin(i) * 1.8 + i * 0.5,
    }));
    const res = recognizeQuickShape(pts);
    expect(res.kind).toBe("line");
    expect(res.correctedPoints).toHaveLength(2);
    expect(res.metrics.snappedAngleDeg).toBe(0);
  });

  it("QuickShape: 손그림 원을 정원으로 인식하고 매끄러운 48정점 경로를 반환한다", () => {
    const pts: Point2D[] = Array.from({ length: 40 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 39;
      const r = 60 + Math.sin(i * 3) * 1.8;
      return { x: 150 + Math.cos(a) * r, y: 150 + Math.sin(a) * r };
    });
    const res = recognizeQuickShape(pts);
    expect(res.kind).toBe("circle");
    expect(res.correctedPoints).toHaveLength(48);
    expect(res.metrics.radiusX).toBeCloseTo(60, 0);
  });

  it("QuickShape: 납작한 손그림 타원을 ellipse로 구분 인식한다", () => {
    const pts: Point2D[] = Array.from({ length: 40 }, (_, i) => {
      const a = (Math.PI * 2 * i) / 39;
      return { x: 150 + Math.cos(a) * 90, y: 150 + Math.sin(a) * 42 };
    });
    const res = recognizeQuickShape(pts);
    expect(res.kind).toBe("ellipse");
    expect((res.metrics.radiusX ?? 0) > (res.metrics.radiusY ?? 0)).toBe(true);
  });

  it("QuickShape: 열린 곡선 호(arc)를 정확히 인식한다", () => {
    const pts: Point2D[] = Array.from({ length: 24 }, (_, i) => {
      const a = -Math.PI * 0.75 + (Math.PI * 0.9 * i) / 23;
      return { x: 120 + Math.cos(a) * 70, y: 140 + Math.sin(a) * 70 };
    });
    const res = recognizeQuickShape(pts);
    expect(res.kind).toBe("arc");
    expect(res.confidence).toBeGreaterThan(0.8);
  });

  it("QuickShape: 손그림 삼각형·사각형·육각형을 각각 판별해 정점 보정한다", () => {
    const makePoly = (sides: number): Point2D[] => {
      const out: Point2D[] = [];
      for (let s = 0; s < sides; s += 1) {
        const a1 = (Math.PI * 2 * s) / sides - Math.PI / 4;
        const a2 = (Math.PI * 2 * ((s + 1) % sides)) / sides - Math.PI / 4;
        const p1 = { x: 150 + Math.cos(a1) * 70, y: 150 + Math.sin(a1) * 70 };
        const p2 = { x: 150 + Math.cos(a2) * 70, y: 150 + Math.sin(a2) * 70 };
        for (let k = 0; k < 7; k += 1) {
          out.push({ x: p1.x + ((p2.x - p1.x) * k) / 7, y: p1.y + ((p2.y - p1.y) * k) / 7 });
        }
      }
      out.push(out[0]);
      return out;
    };
    expect(recognizeQuickShape(makePoly(3)).kind).toBe("triangle");
    expect(recognizeQuickShape(makePoly(4)).kind).toBe("rectangle");
    expect(recognizeQuickShape(makePoly(6)).kind).toBe("polygon");
  });

  it("ColorDrop: gapClosePx=0이면 4px 틈새로 누수되고, gapClosePx=6이면 봉합되어 내부만 채워진다", () => {
    const grid = createLineArtTestGrid(40, 40, 4);
    const leaked = simulateColorDropFill(grid, {
      seedX: 20,
      seedY: 20,
      fillColor: { r: 40, g: 160, b: 120, a: 255 },
      thresholdPercent: 20,
      gapClosePx: 0,
    });
    expect(leaked.leakedToBorder).toBe(true);

    const sealed = simulateColorDropFill(grid, {
      seedX: 20,
      seedY: 20,
      fillColor: { r: 40, g: 160, b: 120, a: 255 },
      thresholdPercent: 20,
      gapClosePx: 6,
    });
    expect(sealed.leakedToBorder).toBe(false);
    expect(sealed.sealedGapPixels).toBeGreaterThan(0);
    expect(sealed.filledPixelCount).toBeLessThan(leaked.filledPixelCount);
  });

  it("ColorDrop: 실시간 임계치(threshold)를 올리면 안티앨리어싱 회색 테두리까지 빈틈없이 채워진다", () => {
    const grid = createLineArtTestGrid(40, 40, 4);
    const tight = simulateColorDropFill(grid, {
      seedX: 20,
      seedY: 20,
      fillColor: { r: 40, g: 160, b: 120, a: 255 },
      thresholdPercent: 15,
      gapClosePx: 6,
    });
    const smooth = simulateColorDropFill(grid, {
      seedX: 20,
      seedY: 20,
      fillColor: { r: 40, g: 160, b: 120, a: 255 },
      thresholdPercent: 45,
      gapClosePx: 6,
    });
    expect(tight.leakedToBorder).toBe(false);
    expect(smooth.leakedToBorder).toBe(false);
    expect(smooth.filledPixelCount).toBeGreaterThan(tight.filledPixelCount);
  });

  it("Vector Eraser: 교차하는 두 벡터 선분에서 튀어나온 끝단만 교점 좌표까지 정확히 절단한다", () => {
    const strokes: readonly VectorStroke[] = [
      { id: "h", points: [{ x: 0, y: 50 }, { x: 120, y: 50 }], widthPx: 2 },
      { id: "v", points: [{ x: 40, y: 0 }, { x: 40, y: 100 }], widthPx: 2 },
    ];
    const erased = eraseVectorUpToIntersection(strokes, { x: 15, y: 50 }, 10);
    expect(erased.erasedStrokeId).toBe("h");
    expect(erased.cutPoints).toEqual([{ x: 40, y: 50 }]);
    expect(erased.removedLengthPx).toBeCloseTo(40, 1);
    const remainingH = erased.strokes.find((s) => s.id === "h");
    expect(remainingH?.points[0]).toEqual({ x: 40, y: 50 });
    expect(remainingH?.points[remainingH.points.length - 1]).toEqual({ x: 120, y: 50 });
  });

  it("Vector Eraser: 두 교차점 사이 중간 구간을 지우면 양쪽 끝단 2개 스트로크로 깔끔히 분할된다", () => {
    const strokes: readonly VectorStroke[] = [
      { id: "h", points: [{ x: 0, y: 50 }, { x: 150, y: 50 }], widthPx: 2 },
      { id: "v1", points: [{ x: 40, y: 0 }, { x: 40, y: 100 }], widthPx: 2 },
      { id: "v2", points: [{ x: 100, y: 0 }, { x: 100, y: 100 }], widthPx: 2 },
    ];
    const erased = eraseVectorUpToIntersection(strokes, { x: 70, y: 50 }, 10);
    expect(erased.cutPoints).toHaveLength(2);
    expect(erased.removedLengthPx).toBeCloseTo(60, 1);
    expect(erased.strokes.find((s) => s.id === "h-a")?.points).toEqual([{ x: 0, y: 50 }, { x: 40, y: 50 }]);
    expect(erased.strokes.find((s) => s.id === "h-b")?.points).toEqual([{ x: 100, y: 50 }, { x: 150, y: 50 }]);
  });

  it("Wrap-Around 토러스: 경계를 넘는 스트로크를 9-타일(3x3) 무봉합 좌표로 분할 복제한다", () => {
    const wrapped = wrapStrokeAcrossTorus(
      [{ x: 70, y: 30 }, { x: 130, y: 60 }, { x: 150, y: 120 }],
      100,
      100,
    );
    expect(wrapped.tiles).toHaveLength(9);
    expect(wrapped.wrappedCrossingCount).toBeGreaterThanOrEqual(2);
    expect(wrapped.isSeamless).toBe(true);
    expect(wrapped.primarySegments.length).toBeGreaterThanOrEqual(2);
  });

  it("Repeat Grid: 행×열·간격·엇갈림 오프셋으로 정확한 셀 좌표와 전체 바운드를 산출한다", () => {
    const grid = generateRepeatGrid({
      baseId: "tile",
      baseLabel: "문양",
      originX: 10,
      originY: 20,
      itemWidth: 40,
      itemHeight: 30,
      rows: 3,
      cols: 4,
      gapX: 10,
      gapY: 8,
      staggerOffsetX: 15,
    });
    expect(grid.totalCount).toBe(12);
    expect(grid.cells[0]).toMatchObject({ x: 10, y: 20 });
    expect(grid.cells[1]).toMatchObject({ x: 60, y: 20 });
    expect(grid.cells[4]).toMatchObject({ row: 1, col: 0, x: 25, y: 58 });
  });

  it("만화경 다축 대칭(2/4/6/8/12축)과 방사형 집중선을 정확히 생성한다", () => {
    const baseStroke: readonly Point2D[] = [{ x: 120, y: 80 }, { x: 150, y: 60 }];
    const axesList = [2, 4, 6, 8, 12] as const;
    for (const axes of axesList) {
      const branches = generateSymmetryStrokes(baseStroke, {
        center: { x: 100, y: 100 },
        axes,
        mode: "kaleidoscope",
      });
      expect(branches).toHaveLength(axes);
      expect(branches[1].reflected).toBe(true);
    }
    const speedlines = generateRadialSpeedlines({
      center: { x: 100, y: 100 },
      innerRadius: 40,
      outerRadius: 120,
      lineCount: 24,
    });
    expect(speedlines).toHaveLength(24);
  });

  it("3점 투시 자석 자가 드래그 벡터를 가장 가까운 소실점 광선 위에 정확히 투영한다", () => {
    const config = {
      mode: "3-point" as const,
      horizonY: 100,
      vanishingPoints: [
        { x: 0, y: 100 },
        { x: 400, y: 100 },
        { x: 200, y: 0 },
      ],
    };
    const snapToVp3 = snapStrokeToPerspectiveRuler({ x: 200, y: 200 }, { x: 206, y: 110 }, config);
    expect(snapToVp3.activeVanishingPointIndex).toBe(2);
    expect(snapToVp3.snappedEnd.x).toBeCloseTo(200, 1);

    const snapToVp1 = snapStrokeToPerspectiveRuler({ x: 200, y: 200 }, { x: 115, y: 152 }, config);
    expect(snapToVp1.activeVanishingPointIndex).toBe(0);
    // VP1(0,100) -> start(200,200) slope = 0.5 -> dx/dy = 2
    const dx = snapToVp1.snappedEnd.x - 0;
    const dy = snapToVp1.snappedEnd.y - 100;
    expect(dx / dy).toBeCloseTo(2, 2);
  });
});

describe("StudioPptProDrawingPanel UI 인터랙션 및 StageHandoffCard 지연 로딩", () => {
  it("PPT 정렬·불리언·그룹·Undo 버튼 인터랙션이 상태를 즉시 갱신한다", () => {
    render(<StudioPptProDrawingPanel projectId="ep-01" />);
    expect(screen.getByTestId("studio-ppt-pro-drawing-panel")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "조각내기 (Fragment)" }));
    expect(screen.getByTestId("ppt-boolean-piece-count").textContent).toBe("3개");

    fireEvent.click(screen.getByRole("button", { name: /그룹 묶기/ }));
    expect(screen.getByTestId("ppt-group-undo-metric").textContent).toContain("그룹 1");

    fireEvent.click(screen.getByRole("button", { name: /되돌리기/ }));
    expect(screen.getByTestId("ppt-group-undo-metric").textContent).toContain("그룹 0");
  });

  it("키보드 탭 이동 후 PPT 발표 슬라이드에서 레이저 궤적·페이드·형광펜·노트를 제어한다", () => {
    render(<StudioPptProDrawingPanel />);
    const layoutTab = screen.getByRole("tab", { name: /PPT 정렬·불리언·커넥터/ });
    fireEvent.keyDown(layoutTab, { key: "ArrowRight" });
    expect(screen.getByTestId("ppt-presentation-slide-tab")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "레이저 포인터 궤적 표시" }));
    expect(screen.getByTestId("ppt-laser-trail-count").textContent).toBe("4개");

    fireEvent.click(screen.getByRole("button", { name: "페이드 소거 실행" }));
    expect(screen.getByTestId("ppt-laser-trail-count").textContent).toBe("0개");

    fireEvent.click(screen.getByRole("button", { name: /형광펜 강조 추가/ }));
    expect(screen.getByTestId("ppt-highlight-count").textContent).toBe("1개");

    fireEvent.change(screen.getByTestId("ppt-speaker-notes-input"), {
      target: { value: "편집자 미팅 핵심 강조 포인트" },
    });
    expect((screen.getByTestId("ppt-speaker-notes-input") as HTMLTextAreaElement).value).toBe(
      "편집자 미팅 핵심 강조 포인트",
    );
  });

  it("경쟁사 특수 드로잉 탭에서 QuickShape·ColorDrop 틈새 닫기·Vector Eraser를 제어한다", () => {
    render(<StudioPptProDrawingPanel initialTab="shape" />);
    expect(screen.getByTestId("quickshape-kind").textContent).toBe("정원");

    fireEvent.click(screen.getByRole("button", { name: "손그림 삼각형" }));
    expect(screen.getByTestId("quickshape-kind").textContent).toBe("삼각형");

    const gapSlider = screen.getByTestId("colordrop-gap-slider");
    fireEvent.change(gapSlider, { target: { value: "0" } });
    expect(screen.getByTestId("colordrop-status").textContent).toContain("틈새 누수 감지");

    fireEvent.change(gapSlider, { target: { value: "6" } });
    expect(screen.getByTestId("colordrop-status").textContent).toContain("틈새 봉합 성공");

    fireEvent.click(screen.getByRole("button", { name: /좌측 끝단 교차 절단/ }));
    expect(screen.getByTestId("vector-eraser-status").textContent).toContain("절단 완료");
  });

  it("타일·그리드·만화경·투시 자 탭에서 12축 만화경 및 반복 그리드 열 수를 조절한다", () => {
    render(<StudioPptProDrawingPanel initialTab="ruler" />);
    expect(screen.getByTestId("torus-tile-count").textContent).toBe("9타일");
    expect(screen.getByTestId("symmetry-branch-count").textContent).toBe("8축");

    fireEvent.click(screen.getByRole("button", { name: "12축" }));
    expect(screen.getByTestId("symmetry-branch-count").textContent).toBe("12축");

    fireEvent.change(screen.getByTestId("repeat-grid-cols-slider"), { target: { value: "6" } });
    expect(screen.getByTestId("repeat-grid-count").textContent).toBe("18개");
  });

  it("StageHandoffCard는 접힘 상태에서 패널을 마운트하지 않고 펼침 시 지연 로드한다", async () => {
    render(
      <MemoryRouter>
        <StageHandoffCard targetStage="art" projectId="proj-ppt" />
      </MemoryRouter>,
    );
    const disclosure = screen.getByTestId("studio-ppt-pro-drawing-disclosure") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.queryByTestId("studio-ppt-pro-drawing-panel")).toBeNull();

    disclosure.open = true;
    fireEvent(disclosure, new Event("toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("studio-ppt-pro-drawing-panel")).toBeTruthy();
    });
  });
});
