import { describe, expect, it } from "vitest";

import { rgbToHex } from "../studio-color-harmony-engine";

import {
  beginShapeBuilderSession,
  buildPlanarArrangement,
  commitShapeBuilderSession,
  createLivePaintBucketState,
  dissolveFacesIntoRegions,
  exportLivePaintVectorRegions,
  hitTestPlanarFace,
  livePaintBucketClick,
  livePaintBucketDrag,
  PLANAR_GAP_CLOSE_PRESETS,
  planarPathFromDrawEl,
  trimDanglingEdgeAtPoint,
  updateShapeBuilderSession,
  type PlanarInputPath,
} from "./studio-planar-shape-builder";

function rectPath(id: string, x: number, y: number, w: number, h: number): PlanarInputPath {
  return {
    id,
    closed: true,
    points: [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ],
  };
}

describe("studio-planar-shape-builder", () => {
  it("두 겹치는 사각형을 교차 분할해 정확히 3개의 유계 DCEL 면과 인접 그래프를 추출한다", () => {
    // [0..100, 0..100] 과 [50..150, 0..100] -> 좌(50x100), 중(50x100), 우(50x100)
    const arrangement = buildPlanarArrangement([
      rectPath("left-rect", 0, 0, 100, 100),
      rectPath("right-rect", 50, 0, 100, 100),
    ]);

    expect(arrangement.boundedFaceIds).toHaveLength(3);
    const totalArea = arrangement.boundedFaceIds.reduce(
      (sum, fid) => sum + (arrangement.faces[fid]?.area ?? 0),
      0,
    );
    expect(totalArea).toBeCloseTo(15_000, 0);

    const leftFace = hitTestPlanarFace(arrangement, { x: 25, y: 50 });
    const midFace = hitTestPlanarFace(arrangement, { x: 75, y: 50 });
    const rightFace = hitTestPlanarFace(arrangement, { x: 125, y: 50 });

    expect(leftFace).not.toBeNull();
    expect(midFace).not.toBeNull();
    expect(rightFace).not.toBeNull();
    expect(midFace!.neighborFaceIds).toContain(leftFace!.id);
    expect(midFace!.neighborFaceIds).toContain(rightFace!.id);
    expect(leftFace!.area).toBeCloseTo(5000, 0);
    expect(midFace!.area).toBeCloseTo(5000, 0);
    expect(rightFace!.area).toBeCloseTo(5000, 0);
  });

  it("열린 선화의 4px 틈새를 gapClosePx=5 가상 브리지로 밀폐해 채움 가능한 면을 생성한다", () => {
    expect(PLANAR_GAP_CLOSE_PRESETS).toEqual([0, 2, 5, 12]);
    // 오른쪽 변 하단에 4px 틈이 열린 사각형 선화
    const openSquare: PlanarInputPath = {
      id: "open-ink",
      closed: false,
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 96 },
      ],
    };
    const closingSide: PlanarInputPath = {
      id: "open-ink-2",
      closed: false,
      points: [
        { x: 100, y: 100 },
        { x: 0, y: 100 },
        { x: 0, y: 0 },
      ],
    };

    const unclosed = buildPlanarArrangement([openSquare, closingSide], { gapClosePx: 0 });
    expect(unclosed.boundedFaceIds).toHaveLength(0);

    const closed = buildPlanarArrangement([openSquare, closingSide], { gapClosePx: 5 });
    expect(closed.gapBridges.length).toBeGreaterThanOrEqual(1);
    expect(closed.boundedFaceIds).toHaveLength(1);
    const face = hitTestPlanarFace(closed, { x: 50, y: 50 });
    expect(face).not.toBeNull();
    expect(face!.area).toBeGreaterThan(9500);
  });

  it("Shape Builder 드래그 합집합(merge)은 공유 내부 엣지를 용해하고 Alt 차집합(subtract)은 해당 면을 제외한다", () => {
    const arrangement = buildPlanarArrangement([
      rectPath("r1", 0, 0, 100, 100),
      rectPath("r2", 50, 0, 100, 100),
    ]);

    // 1) 합집합: 좌 -> 중 -> 우 드래그
    let session = beginShapeBuilderSession(arrangement, { x: 25, y: 50 }, false);
    session = updateShapeBuilderSession(session, { x: 75, y: 50 });
    session = updateShapeBuilderSession(session, { x: 125, y: 50 });
    expect(session.cursorBadge).toBe("+");
    expect(session.selectedFaceIds).toHaveLength(3);

    const mergeCommit = commitShapeBuilderSession(session);
    expect(mergeCommit.mode).toBe("merge");
    expect(mergeCommit.regions).toHaveLength(1);
    expect(mergeCommit.regions[0]!.area).toBeCloseTo(15_000, 0);
    expect(mergeCommit.regions[0]!.bounds).toEqual({ minX: 0, minY: 0, maxX: 150, maxY: 100 });

    // 2) Alt 차집합: 중앙 겹침 면만 제거 -> 좌/우 분리 2개 영역 남음
    const subSession = beginShapeBuilderSession(arrangement, { x: 75, y: 50 }, true);
    expect(subSession.cursorBadge).toBe("-");
    const subCommit = commitShapeBuilderSession(subSession);
    expect(subCommit.mode).toBe("subtract");
    expect(subCommit.removedFaceIds).toHaveLength(1);
    expect(subCommit.regions).toHaveLength(2);
    const remainingArea = subCommit.regions.reduce((s, r) => s + r.area, 0);
    expect(remainingArea).toBeCloseTo(10_000, 0);
  });

  it("내부 구멍(도넛 형태)을 포함한 면의 순면적과 히트 테스트를 정확히 처리한다", () => {
    const arrangement = buildPlanarArrangement([
      rectPath("outer", 0, 0, 100, 100),
      rectPath("inner", 30, 30, 40, 40),
    ]);

    const outerRingFace = hitTestPlanarFace(arrangement, { x: 10, y: 10 });
    const innerHoleFace = hitTestPlanarFace(arrangement, { x: 50, y: 50 });

    expect(outerRingFace).not.toBeNull();
    expect(innerHoleFace).not.toBeNull();
    expect(outerRingFace!.id).not.toBe(innerHoleFace!.id);
    expect(outerRingFace!.holes).toHaveLength(1);
    expect(outerRingFace!.area).toBeCloseTo(10_000 - 1600, 0);
    expect(innerHoleFace!.area).toBeCloseTo(1600, 0);

    const dissolvedRingOnly = dissolveFacesIntoRegions(arrangement, [outerRingFace!.id]);
    expect(dissolvedRingOnly).toHaveLength(1);
    expect(dissolvedRingOnly[0]!.holes).toHaveLength(1);
    expect(dissolvedRingOnly[0]!.area).toBeCloseTo(8400, 0);
  });

  it("Vector Live Paint Bucket 클릭·드래그 채색과 삐져나온 꼬리선 Alt-트림을 수행한다", () => {
    const box = rectPath("box", 0, 0, 100, 100);
    const dividerWithTail: PlanarInputPath = {
      id: "divider-tail",
      closed: false,
      points: [
        { x: 50, y: -25 },
        { x: 50, y: 125 },
      ],
    };
    const arrangement = buildPlanarArrangement([box, dividerWithTail]);
    expect(arrangement.boundedFaceIds).toHaveLength(2);
    expect(arrangement.danglingEdgeIds.length).toBeGreaterThanOrEqual(2);

    const fillCoral = rgbToHex(230, 110, 90);
    const fillTeal = rgbToHex(45, 160, 150);

    let paint = createLivePaintBucketState(arrangement);
    const clickRes = livePaintBucketClick(paint, { x: 25, y: 50 }, fillCoral);
    expect(clickRes.paintedFaceId).not.toBeNull();
    paint = clickRes.state;

    const dragRes = livePaintBucketDrag(paint, [{ x: 25, y: 50 }, { x: 75, y: 50 }], fillTeal);
    expect(dragRes.paintedFaceIds).toHaveLength(2);
    paint = dragRes.state;

    const exported = exportLivePaintVectorRegions(paint);
    expect(exported).toHaveLength(2);
    expect(exported.every((r) => r.fill === fillTeal)).toBe(true);

    // 삐져나온 상단 꼬리선 (50, -15) Alt-트림
    const trimRes = trimDanglingEdgeAtPoint(paint, { x: 50, y: -15 }, 6);
    expect(trimRes.trimmedEdgeId).not.toBeNull();
    expect(trimRes.state.trimmedEdgeIds).toHaveLength(1);

    // DrawEl 변환 어댑터 확인
    const converted = planarPathFromDrawEl({
      id: "d1",
      type: "draw",
      kind: "rect",
      mode: "pen",
      points: [0, 0, 80, 60],
      stroke: rgbToHex(20, 20, 20),
      strokeWidth: 2,
    });
    expect(converted?.closed).toBe(true);
    expect(converted?.points.length).toBeGreaterThanOrEqual(4);
  });
});
