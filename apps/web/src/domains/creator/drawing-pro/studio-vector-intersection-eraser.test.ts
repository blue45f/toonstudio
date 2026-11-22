import { describe, expect, it } from "vitest";

import {
  aabbsOverlap,
  computePolylineAabb,
  eraseVectorPolylinesAtIntersections,
  findPolylineIntersections,
  intersectSegments2D,
  type VectorPolylineStroke,
} from "./studio-vector-intersection-eraser";
import { eraseVectorStrokesToIntersection } from "../vector-layer/vector-stroke-edit";
import type { VectorStroke } from "../vector-layer/vector-layer-model";

function makeCubicLineStroke(
  id: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width = 4,
): VectorStroke {
  return {
    id,
    segments: [
      {
        p0: { x: x0, y: y0 },
        p1: { x: x0 + (x1 - x0) / 3, y: y0 + (y1 - y0) / 3 },
        p2: { x: x0 + ((x1 - x0) * 2) / 3, y: y0 + ((y1 - y0) * 2) / 3 },
        p3: { x: x1, y: y1 },
      },
    ],
    widths: [width, width],
    color: "#111111",
    brushShapeId: "round",
    opacity: 1,
  };
}

describe("studio-vector-intersection-eraser", () => {
  describe("평면 선분 교차점 솔버 및 AABB 프리필터", () => {
    it("직교 교차 선분의 매개변수 t, u와 정확한 교차 좌표를 계산한다", () => {
      const hits = intersectSegments2D(
        { x: 0, y: 50 },
        { x: 100, y: 50 },
        { x: 25, y: 0 },
        { x: 25, y: 100 },
      );
      expect(hits).toHaveLength(1);
      expect(hits[0]!.t).toBeCloseTo(0.25, 6);
      expect(hits[0]!.u).toBeCloseTo(0.5, 6);
      expect(hits[0]!.point.x).toBeCloseTo(25, 6);
      expect(hits[0]!.point.y).toBeCloseTo(50, 6);
      expect(hits[0]!.kind).toBe("proper");
    });

    it("T-교차(끝점 접촉)와 공선 겹침 경계를 정확히 계산하고 평행 분리 선분은 기각한다", () => {
      const tHit = intersectSegments2D(
        { x: 0, y: 20 },
        { x: 100, y: 20 },
        { x: 40, y: 20 },
        { x: 40, y: 80 },
      );
      expect(tHit).toHaveLength(1);
      expect(tHit[0]!.kind).toBe("endpoint");
      expect(tHit[0]!.t).toBeCloseTo(0.4, 6);
      expect(tHit[0]!.u).toBeCloseTo(0, 6);

      const parallelMiss = intersectSegments2D(
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 0, y: 5 },
        { x: 100, y: 5 },
      );
      expect(parallelMiss).toHaveLength(0);

      const collinearOverlap = intersectSegments2D(
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 30, y: 0 },
        { x: 70, y: 0 },
      );
      expect(collinearOverlap).toHaveLength(2);
      expect(collinearOverlap[0]!.t).toBeCloseTo(0.3, 6);
      expect(collinearOverlap[1]!.t).toBeCloseTo(0.7, 6);
      expect(collinearOverlap[0]!.kind).toBe("collinear-boundary");
    });

    it("서로 떨어진 스트로크·세그먼트 쌍을 2단계 AABB 프리필터로 사전 기각한다", () => {
      const strokes: VectorPolylineStroke[] = [
        {
          id: "left",
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
            { x: 20, y: 0 },
          ],
        },
        {
          id: "far-right",
          points: [
            { x: 500, y: 500 },
            { x: 550, y: 550 },
          ],
        },
        {
          id: "far-bottom",
          points: [
            { x: 0, y: 900 },
            { x: 40, y: 940 },
          ],
        },
      ];
      expect(aabbsOverlap(computePolylineAabb(strokes[0]!.points), computePolylineAabb(strokes[1]!.points))).toBe(false);

      const found = findPolylineIntersections(strokes);
      expect(found.intersections).toHaveLength(0);
      expect(found.stats.strokePairsCulledByAabb).toBe(3);
      expect(found.stats.strokePairsTested).toBe(0);
    });
  });

  describe("교차점까지 지우기(up-to-intersection) 정확 분할 및 끝단 트리밍", () => {
    it("십자(+) 교차에서 오른쪽 돌출 끝단만 지우면 교차점 (50, 50)까지 정확히 트리밍된다", () => {
      const strokes: VectorPolylineStroke[] = [
        {
          id: "horiz",
          points: [
            { x: 0, y: 50, width: 2, pressure: 0.2 },
            { x: 100, y: 50, width: 10, pressure: 1.0 },
          ],
        },
        {
          id: "vert",
          points: [
            { x: 50, y: 0, width: 4 },
            { x: 50, y: 100, width: 4 },
          ],
        },
      ];

      const result = eraseVectorPolylinesAtIntersections(strokes, {
        x: 78,
        y: 50,
        radiusPx: 6,
      });

      expect(result.erasedSpanCount).toBe(1);
      expect(result.removedStrokeIds).toHaveLength(0);
      expect(result.strokes).toHaveLength(2);

      const trimmed = result.strokes.find((s) => s.id === "horiz")!;
      expect(trimmed.points[0]!.x).toBeCloseTo(0, 5);
      expect(trimmed.points[trimmed.points.length - 1]!.x).toBeCloseTo(50, 5);
      expect(trimmed.points[trimmed.points.length - 1]!.y).toBeCloseTo(50, 5);
      // t = 0.5 지점의 선폭과 필압이 선형 보간되어야 한다.
      expect(trimmed.points[trimmed.points.length - 1]!.width).toBeCloseTo(6, 5);
      expect(trimmed.points[trimmed.points.length - 1]!.pressure).toBeCloseTo(0.6, 5);

      const untouchedVert = result.strokes.find((s) => s.id === "vert")!;
      expect(untouchedVert).toBe(strokes[1]);
    });

    it("교차점 바로 옆 돌출부를 큰 반경으로 클릭해도 interior-prefer 정책으로 반대편 선을 보존한다", () => {
      const strokes: VectorPolylineStroke[] = [
        {
          id: "horiz",
          points: [
            { x: 0, y: 50 },
            { x: 100, y: 50 },
          ],
        },
        {
          id: "vert",
          points: [
            { x: 50, y: 0 },
            { x: 50, y: 100 },
          ],
        },
      ];

      const result = eraseVectorPolylinesAtIntersections(
        strokes,
        { x: 53, y: 50, radiusPx: 8 },
        { targetStrokeIds: ["horiz"], hitPolicy: "interior-prefer" },
      );

      const trimmed = result.strokes.find((s) => s.id === "horiz")!;
      expect(trimmed.points[0]!.x).toBeCloseTo(0, 5);
      expect(trimmed.points[trimmed.points.length - 1]!.x).toBeCloseTo(50, 5);
    });

    it("두 교차점 사이의 가운데 구간만 삭제하면 정확히 두 조각으로 분할되고 양쪽 바깥 구간은 유지된다", () => {
      const strokes: VectorPolylineStroke[] = [
        {
          id: "rail",
          points: [
            { x: 0, y: 50, width: 2 },
            { x: 100, y: 50, width: 12 },
          ],
        },
        {
          id: "bar-left",
          points: [
            { x: 30, y: 0 },
            { x: 30, y: 100 },
          ],
        },
        {
          id: "bar-right",
          points: [
            { x: 70, y: 0 },
            { x: 70, y: 100 },
          ],
        },
      ];

      const result = eraseVectorPolylinesAtIntersections(strokes, {
        x: 50,
        y: 50,
        radiusPx: 4,
      });

      expect(result.splitStrokeCount).toBe(1);
      expect(result.erasedSpanCount).toBe(1);
      const railPieces = result.strokes.filter((s) => s.id.startsWith("rail"));
      expect(railPieces).toHaveLength(2);
      expect(railPieces[0]!.points[0]!.x).toBeCloseTo(0, 5);
      expect(railPieces[0]!.points[railPieces[0]!.points.length - 1]!.x).toBeCloseTo(30, 5);
      expect(railPieces[0]!.points[railPieces[0]!.points.length - 1]!.width).toBeCloseTo(5, 5);
      expect(railPieces[1]!.points[0]!.x).toBeCloseTo(70, 5);
      expect(railPieces[1]!.points[0]!.width).toBeCloseTo(9, 5);
      expect(railPieces[1]!.points[railPieces[1]!.points.length - 1]!.x).toBeCloseTo(100, 5);
    });

    it("히트되지 않은 인접 교차 구간은 불필요하게 쪼개지 않고 단일 연속 스트로크로 병합 유지한다", () => {
      const strokes: VectorPolylineStroke[] = [
        {
          id: "rail",
          points: [
            { x: 0, y: 50 },
            { x: 100, y: 50 },
          ],
        },
        {
          id: "bar-1",
          points: [
            { x: 30, y: 0 },
            { x: 30, y: 100 },
          ],
        },
        {
          id: "bar-2",
          points: [
            { x: 70, y: 0 },
            { x: 70, y: 100 },
          ],
        },
      ];

      const result = eraseVectorPolylinesAtIntersections(strokes, {
        x: 15,
        y: 50,
        radiusPx: 4,
      });

      const railPieces = result.strokes.filter((s) => s.id.startsWith("rail"));
      expect(railPieces).toHaveLength(1);
      expect(railPieces[0]!.id).toBe("rail");
      expect(railPieces[0]!.points[0]!.x).toBeCloseTo(30, 5);
      expect(railPieces[0]!.points[railPieces[0]!.points.length - 1]!.x).toBeCloseTo(100, 5);
    });

    it("자기 교차(self-intersection) 루프의 꼬리 구간만 정확히 잘라낸다", () => {
      // (0,50) -> (100,50) -> (100,0) -> (50,0) -> (50,100): (50,50)에서 자기 교차
      const strokes: VectorPolylineStroke[] = [
        {
          id: "self-loop",
          points: [
            { x: 0, y: 50 },
            { x: 100, y: 50 },
            { x: 100, y: 0 },
            { x: 50, y: 0 },
            { x: 50, y: 100 },
          ],
        },
      ];

      const result = eraseVectorPolylinesAtIntersections(strokes, {
        x: 50,
        y: 80,
        radiusPx: 4,
      });

      expect(result.intersections.some((ix) => ix.selfIntersection)).toBe(true);
      expect(result.strokes).toHaveLength(1);
      const trimmed = result.strokes[0]!;
      const last = trimmed.points[trimmed.points.length - 1]!;
      expect(last.x).toBeCloseTo(50, 5);
      expect(last.y).toBeCloseTo(50, 5);
    });

    it("닫힌 사각형 폴리라인의 한 변 구간을 지우면 이음새(0/L)를 넘어 하나의 열린 선으로 연속 병합된다", () => {
      const strokes: VectorPolylineStroke[] = [
        {
          id: "box",
          closed: true,
          points: [
            { x: 0, y: 0 },
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 0, y: 100 },
          ],
        },
        {
          id: "cut-top",
          points: [
            { x: 30, y: -10 },
            { x: 30, y: 20 },
          ],
        },
        {
          id: "cut-top-2",
          points: [
            { x: 70, y: -10 },
            { x: 70, y: 20 },
          ],
        },
      ];

      const result = eraseVectorPolylinesAtIntersections(strokes, {
        x: 50,
        y: 0,
        radiusPx: 4,
      });

      const boxPieces = result.strokes.filter((s) => s.id.startsWith("box"));
      expect(boxPieces).toHaveLength(1);
      expect(boxPieces[0]!.closed).toBe(false);
      // (70,0) -> (100,0) -> (100,100) -> (0,100) -> (0,0) -> (30,0)
      expect(boxPieces[0]!.points[0]!.x).toBeCloseTo(70, 5);
      expect(boxPieces[0]!.points[0]!.y).toBeCloseTo(0, 5);
      const endPt = boxPieces[0]!.points[boxPieces[0]!.points.length - 1]!;
      expect(endPt.x).toBeCloseTo(30, 5);
      expect(endPt.y).toBeCloseTo(0, 5);
    });

    it("멀티포인트 드래그 지우개 경로, whole-stroke, touched-area 모드를 정확히 처리한다", () => {
      const strokes: VectorPolylineStroke[] = [
        {
          id: "h",
          points: [
            { x: 0, y: 50 },
            { x: 100, y: 50 },
          ],
        },
        {
          id: "v",
          points: [
            { x: 50, y: 0 },
            { x: 50, y: 100 },
          ],
        },
      ];

      // 드래그 경로가 왼쪽·오른쪽 두 구간을 모두 가로지르면 가로선 전체가 삭제된다.
      const sweepBoth = eraseVectorPolylinesAtIntersections(
        strokes,
        {
          path: [
            { x: 20, y: 50 },
            { x: 80, y: 50 },
          ],
          radiusPx: 2,
        },
        { targetStrokeIds: ["h"] },
      );
      expect(sweepBoth.removedStrokeIds).toEqual(["h"]);

      // whole-stroke 모드
      const whole = eraseVectorPolylinesAtIntersections(
        strokes,
        { x: 80, y: 50, radiusPx: 3 },
        { mode: "whole-stroke" },
      );
      expect(whole.removedStrokeIds).toEqual(["h"]);
      expect(whole.strokes.map((s) => s.id)).toEqual(["v"]);

      // touched-area 모드
      const touched = eraseVectorPolylinesAtIntersections(
        [strokes[0]!],
        { x: 50, y: 50, radiusPx: 10 },
        { mode: "touched-area", includeStrokeWidth: false },
      );
      expect(touched.strokes).toHaveLength(2);
      expect(touched.strokes[0]!.points[touched.strokes[0]!.points.length - 1]!.x).toBeCloseTo(40, 4);
      expect(touched.strokes[1]!.points[0]!.x).toBeCloseTo(60, 4);
    });

    it("vector-stroke-edit 진입점(eraseVectorStrokesToIntersection)으로 베지어 벡터 스트로크를 교차점까지 트리밍한다", () => {
      const horiz = makeCubicLineStroke("vs-h", 0, 50, 100, 50, 4);
      const vert = makeCubicLineStroke("vs-v", 50, 0, 50, 100, 4);

      const res = eraseVectorStrokesToIntersection([horiz, vert], {
        x: 80,
        y: 50,
        radiusPx: 5,
      });

      expect(res.erasedSpanCount).toBe(1);
      expect(res.strokes).toHaveLength(2);
      const trimmedH = res.strokes.find((s) => s.id === "vs-h")!;
      const lastSeg = trimmedH.segments[trimmedH.segments.length - 1]!;
      expect(lastSeg.p3.x).toBeCloseTo(50, 1);
      expect(lastSeg.p3.y).toBeCloseTo(50, 1);
      // 미히트 수직선은 원본 참조 보존
      expect(res.strokes.find((s) => s.id === "vs-v")).toBe(vert);
    });
  });
});
