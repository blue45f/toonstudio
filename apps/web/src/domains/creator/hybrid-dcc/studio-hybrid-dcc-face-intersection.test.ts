import { describe, expect, it } from "vitest";

import {
  createStudioEditableMeshFromPolygons,
  createStudioUnitCubeMesh,
  type StudioEditableMesh,
  type StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";

import { findStudioFaceIntersection } from "./studio-hybrid-dcc-face-intersection";

/** 한 변 1인 상자를 (offset, offset, offset)만큼 옮긴 8개 꼭짓점. */
function boxCorners(offset: number): StudioMeshVec3[] {
  return [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ].map(([x, y, z]) => ({ x: x! + offset, y: y! + offset, z: z! + offset }));
}

const BOX_FACES = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]];

/** 상자 두 개를 한 메시에 담는다. 앞 6개 면이 첫 상자, 뒤 6개 면이 둘째 상자다. */
function twoBoxes(secondOffset: number | { x: number; y: number; z: number }): StudioEditableMesh {
  const second = typeof secondOffset === "number"
    ? boxCorners(secondOffset)
    : boxCorners(0).map((point) => ({ x: point.x + secondOffset.x, y: point.y + secondOffset.y, z: point.z + secondOffset.z }));
  return createStudioEditableMeshFromPolygons(
    [...boxCorners(0), ...second],
    [...BOX_FACES, ...BOX_FACES.map((face) => face.map((index) => index + 8))],
  );
}

const ALL_FIRST_BOX = [0, 1, 2, 3, 4, 5];

describe("면 교차 검사", () => {
  it("정상적인 닫힌 입체와 떨어진 두 상자에는 교차가 없다", () => {
    const cube = createStudioUnitCubeMesh();
    expect(findStudioFaceIntersection(cube, cube.faces.map((face) => face.id))).toBeNull();
    expect(findStudioFaceIntersection(twoBoxes({ x: 3, y: 0, z: 0 }), ALL_FIRST_BOX)).toBeNull();
    expect(findStudioFaceIntersection(cube, [])).toBeNull();
  });

  it("서로 파고든 두 상자의 면은 교차로 잡는다(교점이 사각형 대각선 위에 있어도 놓치지 않는다)", () => {
    // 둘째 상자를 (0.5, 0.5, 0.5)만큼 옮기면 모서리가 첫 상자 면의 정중앙(대각선 위)을 지난다.
    const diagonal = findStudioFaceIntersection(twoBoxes(0.5), ALL_FIRST_BOX);
    expect(diagonal).not.toBeNull();
    const [first, second] = diagonal!.faceIds;
    expect(ALL_FIRST_BOX).toContain(first);
    expect(second).toBeGreaterThanOrEqual(6);
    // 대각선을 피하는 위치에서도 잡힌다.
    expect(findStudioFaceIntersection(twoBoxes({ x: 0.3, y: 0.45, z: 0.6 }), ALL_FIRST_BOX)).not.toBeNull();
  });

  it("바뀐 면으로 지정한 면만 기준으로 삼아 짝을 찾는다", () => {
    const mesh = twoBoxes(0.5);
    // 첫 상자의 밑면(z=0)은 둘째 상자(z 0.5~1.5)와 만나지 않는다.
    expect(findStudioFaceIntersection(mesh, [0])).toBeNull();
    // 윗면(z=1)은 둘째 상자 안으로 들어가 있다.
    expect(findStudioFaceIntersection(mesh, [1])).not.toBeNull();
    // 둘째 상자 쪽 면을 바뀐 면으로 지정해도 같은 쌍을 찾는다.
    const fromSecond = findStudioFaceIntersection(mesh, [6, 7, 8, 9, 10, 11]);
    expect(fromSecond).not.toBeNull();
    expect(fromSecond!.faceIds[0]).toBeGreaterThanOrEqual(6);
  });

  it("정점 하나만 공유하는 두 면이라도 마주 보는 모서리가 상대 면을 뚫으면 잡는다", () => {
    // 삼각형 두 장이 (0,0,0) 한 점만 공유하고, 둘째 삼각형의 먼 모서리가 첫째 삼각형 한가운데를 수직으로 지난다.
    const pinched = createStudioEditableMeshFromPolygons(
      [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }, { x: 0.5, y: 0.5, z: -1 }, { x: 0.5, y: 0.5, z: 1 }],
      [[0, 1, 2], [0, 3, 4]],
    );
    expect(findStudioFaceIntersection(pinched, [0])?.faceIds).toEqual([0, 1]);
    expect(findStudioFaceIntersection(pinched, [1])?.faceIds).toEqual([1, 0]);
    // 둘째 삼각형을 첫째 삼각형 밖으로 옮기면 교차가 없다.
    const apart = createStudioEditableMeshFromPolygons(
      [{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }, { x: -0.5, y: -0.5, z: -1 }, { x: -0.5, y: -0.5, z: 1 }],
      [[0, 1, 2], [0, 3, 4]],
    );
    expect(findStudioFaceIntersection(apart, [0])).toBeNull();
  });

  it("면·모서리·꼭짓점으로 맞닿기만 하는 접촉은 관통으로 세지 않는다", () => {
    // 위에 쌓은 상자: 밑면이 첫 상자 윗면과 같은 평면에서 겹친다.
    expect(findStudioFaceIntersection(twoBoxes({ x: 0, y: 0, z: 1 }), ALL_FIRST_BOX)).toBeNull();
    // 반쯤 어긋나게 쌓은 상자: 같은 평면에서 일부만 겹친다.
    expect(findStudioFaceIntersection(twoBoxes({ x: 0.5, y: 0, z: 1 }), ALL_FIRST_BOX)).toBeNull();
    // 옆에 붙인 상자: 옆면끼리 같은 평면에서 맞닿는다.
    expect(findStudioFaceIntersection(twoBoxes({ x: 1, y: 0, z: 0 }), ALL_FIRST_BOX)).toBeNull();
    // 모서리 하나만 맞닿는 상자와 꼭짓점 하나만 맞닿는 상자.
    expect(findStudioFaceIntersection(twoBoxes({ x: 1, y: 1, z: 0 }), ALL_FIRST_BOX)).toBeNull();
    expect(findStudioFaceIntersection(twoBoxes({ x: 1, y: 1, z: 1 }), ALL_FIRST_BOX)).toBeNull();
  });

  it("살짝만 파고들어도(0.001) 교차로 잡는다", () => {
    expect(findStudioFaceIntersection(twoBoxes({ x: 0.2, y: 0.2, z: 0.999 }), ALL_FIRST_BOX)).not.toBeNull();
    expect(findStudioFaceIntersection(twoBoxes({ x: 0.999, y: 0.2, z: 0.1 }), ALL_FIRST_BOX)).not.toBeNull();
  });

  it("면 위에 놓인 모서리는 좌표를 아무렇게나 돌려 수치 잡음이 끼어도 관통으로 세지 않는다", () => {
    // 상자 윗면(z=1) 한가운데에 서 있는 얇은 삼각 판: 판의 밑 모서리가 윗면 위에 정확히 놓인다.
    const base: StudioMeshVec3[] = [...boxCorners(0), { x: 0.2, y: 0.5, z: 1 }, { x: 0.8, y: 0.5, z: 1 }, { x: 0.5, y: 0.5, z: 1.5 }];
    let state = 20260617;
    const next = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
    for (let trial = 0; trial < 60; trial += 1) {
      // 축과 각도를 무작위로 잡은 회전(로드리게스 공식).
      const raw = { x: next() - 0.5, y: next() - 0.5, z: next() - 0.5 };
      const length = Math.hypot(raw.x, raw.y, raw.z);
      const axis = { x: raw.x / length, y: raw.y / length, z: raw.z / length };
      const angle = next() * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const rotate = (p: StudioMeshVec3): StudioMeshVec3 => {
        const dot = axis.x * p.x + axis.y * p.y + axis.z * p.z;
        return {
          x: p.x * cos + (axis.y * p.z - axis.z * p.y) * sin + axis.x * dot * (1 - cos),
          y: p.y * cos + (axis.z * p.x - axis.x * p.z) * sin + axis.y * dot * (1 - cos),
          z: p.z * cos + (axis.x * p.y - axis.y * p.x) * sin + axis.z * dot * (1 - cos),
        };
      };
      const mesh = createStudioEditableMeshFromPolygons(base.map(rotate), [...BOX_FACES, [8, 9, 10]]);
      expect(findStudioFaceIntersection(mesh, [6]), `판 기준 ${trial}`).toBeNull();
      expect(findStudioFaceIntersection(mesh, ALL_FIRST_BOX), `상자 기준 ${trial}`).toBeNull();
    }
    // 같은 판을 윗면 아래로 살짝 파묻으면 관통으로 잡는다.
    const sunk = createStudioEditableMeshFromPolygons(
      [...boxCorners(0), { x: 0.2, y: 0.5, z: 0.9 }, { x: 0.8, y: 0.5, z: 0.9 }, { x: 0.5, y: 0.5, z: 1.5 }],
      [...BOX_FACES, [8, 9, 10]],
    );
    expect(findStudioFaceIntersection(sunk, [6])).not.toBeNull();
  });
});
