import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioUnitCubeMesh } from "../studio-editable-half-edge-mesh";

import { findStudioFaceIntersection } from "./studio-hybrid-dcc-face-intersection";
import { drawStudioEditableMeshFacePolygon } from "./studio-hybrid-dcc-face-modeling-draw";
import { pushPullStudioEditableMeshFaces } from "./studio-hybrid-dcc-face-pushpull";

/**
 * 범위 계산(이웃 면 판정과 그림자 쓸기)이 이미 거의 모든 관통을 막기 때문에, 마지막 안전망인 교차 검사는
 * 정상 입력에서는 거의 걸리지 않는다. 그래서 검사 결과를 흉내 내어 안전망이 실제로 결과를 막고, 검사가
 * 바뀐 면만 보도록 이어져 있는지 확인한다. 교차 검사 자체의 정확성은 `studio-hybrid-dcc-face-intersection.test.ts`가 맡는다.
 */
vi.mock("./studio-hybrid-dcc-face-intersection", () => ({
  findStudioFaceIntersection: vi.fn(() => null),
}));

const TOP = 3;

describe("밀기/당기기의 마지막 교차 검사 연결", () => {
  beforeEach(() => {
    vi.mocked(findStudioFaceIntersection).mockReset();
    vi.mocked(findStudioFaceIntersection).mockReturnValue(null);
  });

  it("기둥 벽 늘이기: 영역과 벽(움직인 꼭짓점에 닿은 면)만 검사 대상으로 넘기고, 교차가 보고되면 거부한다", () => {
    const cube = createStudioUnitCubeMesh();
    const accepted = pushPullStudioEditableMeshFaces(cube, [TOP], 0.2);
    expect(accepted.ok).toBe(true);
    // 윗면(3)과 그 네 벽. 맞은편 밑면(2)은 움직이지 않는다.
    expect(vi.mocked(findStudioFaceIntersection)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(findStudioFaceIntersection).mock.calls[0]![1]).toEqual([0, 1, 3, 4, 5]);

    vi.mocked(findStudioFaceIntersection).mockReturnValueOnce({ faceIds: [3, 2] });
    const refused = pushPullStudioEditableMeshFaces(cube, [TOP], 0.2);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.code).toBe("would-collide");
    expect(refused.elementIds).toEqual([3, 2]);
  });

  it("새 옆면 만들기: 새로 생긴 윗덮개와 옆면만 검사 대상으로 넘기고, 교차가 보고되면 거부한다", () => {
    const cube = createStudioUnitCubeMesh();
    const drawn = drawStudioEditableMeshFacePolygon(cube, TOP, [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]]);
    if (!drawn.ok) throw new Error(drawn.detail);
    const inner = drawn.value.selectionFaceIds[0]!;
    vi.mocked(findStudioFaceIntersection).mockClear();
    const accepted = pushPullStudioEditableMeshFaces(drawn.value.mesh, [inner], -0.2);
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    expect(accepted.value.method).toBe("extrude");
    expect(vi.mocked(findStudioFaceIntersection)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(findStudioFaceIntersection).mock.calls[0]![1]).toEqual(accepted.value.createdFaceIds);

    vi.mocked(findStudioFaceIntersection).mockReturnValueOnce({ faceIds: [5, 9] });
    const refused = pushPullStudioEditableMeshFaces(drawn.value.mesh, [inner], -0.2);
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.code).toBe("would-collide");
    expect(refused.elementIds).toEqual([5, 9]);
  });

  it("범위나 선택 모양 때문에 일찍 거부한 요청은 결과를 만들지 않으므로 교차 검사까지 가지 않는다", () => {
    const cube = createStudioUnitCubeMesh();
    expect(pushPullStudioEditableMeshFaces(cube, [TOP], -5).ok).toBe(false);
    expect(pushPullStudioEditableMeshFaces(cube, [0, 1, 2], 0.2).ok).toBe(false);
    expect(vi.mocked(findStudioFaceIntersection)).not.toHaveBeenCalled();
  });
});
