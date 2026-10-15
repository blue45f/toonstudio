import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  applyMatrix3,
  closestPointOnLine,
  closestPointOnSegment,
  closestPointsBetweenLines,
  closestPointsBetweenSegments,
  composeTrsMatrix,
  intersectLineWithPlane,
  invertColumns3,
  isFiniteMatrix,
  isFiniteVec3,
  isWithinWorldBounds,
  multiplyMatrices,
  normalize,
  segmentIntersection,
  transformPoint,
  transformVector,
  vec3,
} from "./studio-bg3d-inference-math";

function expectVecClose(actual: readonly number[], expected: readonly number[], digits = 9) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index] ?? Number.NaN, digits));
}

describe("studio-bg3d-inference-math", () => {
  it("compose 행렬이 three.js 오일러 XYZ + 스케일 합성과 같다", () => {
    const cases: Array<[readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]]> = [
      [[1, 2, 3], [0, 0, 0], [1, 1, 1]],
      [[-4, 0.5, 2], [0.3, -0.7, 1.1], [2, 0.5, 3]],
      [[0, 0, 0], [Math.PI / 2, 0, 0], [1, 1, 1]],
      [[0, 0, 0], [Math.PI / 3, Math.PI / 5, -Math.PI / 7], [1.5, 1, 0.25]],
    ];
    for (const [position, rotation, scale] of cases) {
      const ours = composeTrsMatrix(position, rotation, scale);
      const reference = new THREE.Matrix4().compose(
        new THREE.Vector3(...position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0], rotation[1], rotation[2], "XYZ")),
        new THREE.Vector3(...scale),
      );
      expectVecClose(ours, reference.elements);
    }
  });

  it("행렬 곱과 점 변환이 three.js와 일치한다", () => {
    const parent = composeTrsMatrix(vec3(1, 2, 3), vec3(0.2, 0.4, 0.6), vec3(2, 2, 2));
    const child = composeTrsMatrix(vec3(-1, 0.5, 0), vec3(0, 1, 0), vec3(1, 3, 1));
    const world = multiplyMatrices(parent, child);
    const threeParent = new THREE.Matrix4().fromArray([...parent]);
    const threeChild = new THREE.Matrix4().fromArray([...child]);
    const threeWorld = threeParent.clone().multiply(threeChild);
    expectVecClose(world, threeWorld.elements);
    const point = new THREE.Vector3(0.3, -0.2, 0.9).applyMatrix4(threeWorld);
    expectVecClose(transformPoint(world, vec3(0.3, -0.2, 0.9)), point.toArray());
    const direction = new THREE.Vector3(1, 2, 3).transformDirection(threeWorld);
    const ours = normalize(transformVector(world, vec3(1, 2, 3)));
    expect(ours).not.toBeNull();
    if (ours) expectVecClose(ours, direction.toArray());
  });

  it("다축 회전에서 기존 object-ops의 합성 순서(Rz·Ry·Rx)와 three XYZ(Rx·Ry·Rz)가 다름을 문서화한다", () => {
    // 이 워크스트림의 수학은 three XYZ를 따른다. 단일 축 회전에서는 두 순서가 같다는 점만 고정한다.
    const single = composeTrsMatrix(vec3(0, 0, 0), vec3(0, Math.PI / 2, 0), vec3(1, 1, 1));
    expectVecClose(transformPoint(single, vec3(0, 0, 1)), [1, 0, 0]);
    const multi = composeTrsMatrix(vec3(0, 0, 0), vec3(Math.PI / 2, Math.PI / 2, 0), vec3(1, 1, 1));
    const reference = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(Math.PI / 2, Math.PI / 2, 0, "XYZ"));
    expectVecClose(transformPoint(multi, vec3(1, 0, 0)), reference.toArray());
  });

  it("유한성·좌표 한계 검사가 비정상 값을 걸러낸다", () => {
    expect(isFiniteVec3([1, 2, 3])).toBe(true);
    expect(isFiniteVec3([1, Number.NaN, 3])).toBe(false);
    expect(isFiniteVec3([1, 2])).toBe(false);
    expect(isFiniteVec3("abc")).toBe(false);
    expect(isFiniteMatrix(composeTrsMatrix(vec3(0, 0, 0), vec3(0, 0, 0), vec3(1, 1, 1)))).toBe(true);
    expect(isFiniteMatrix([1, 2, 3])).toBe(false);
    expect(isWithinWorldBounds(vec3(10_000, -10_000, 0))).toBe(true);
    expect(isWithinWorldBounds(vec3(10_000.01, 0, 0))).toBe(false);
  });

  it("normalize는 0벡터와 비유한 값에서 null을 돌려준다", () => {
    expect(normalize(vec3(0, 0, 0))).toBeNull();
    expect(normalize(vec3(Number.POSITIVE_INFINITY, 0, 0))).toBeNull();
    expect(normalize(vec3(0, 3, 4))).toEqual([0, 0.6, 0.8]);
  });

  it("점-선분·점-직선 최근접점을 구하고 퇴화 선분을 처리한다", () => {
    const onSegment = closestPointOnSegment(vec3(3, 5, 0), vec3(0, 0, 0), vec3(10, 0, 0));
    expect(onSegment.point).toEqual([3, 0, 0]);
    expect(onSegment.t).toBeCloseTo(0.3, 12);
    const clamped = closestPointOnSegment(vec3(-4, 1, 0), vec3(0, 0, 0), vec3(10, 0, 0));
    expect(clamped.point).toEqual([0, 0, 0]);
    expect(clamped.t).toBe(0);
    const degenerate = closestPointOnSegment(vec3(1, 1, 1), vec3(2, 2, 2), vec3(2, 2, 2));
    expect(degenerate.point).toEqual([2, 2, 2]);
    const line = closestPointOnLine(vec3(3, 4, 0), vec3(0, 0, 0), vec3(1, 0, 0));
    expect(line.point).toEqual([3, 0, 0]);
    expect(line.t).toBe(3);
  });

  it("두 선분 사이 최근접점을 평행·교차·꼬임 모두에서 구한다", () => {
    const crossing = closestPointsBetweenSegments(vec3(-1, 0, 0), vec3(1, 0, 0), vec3(0, -1, 0), vec3(0, 1, 0));
    expect(crossing.distance).toBeCloseTo(0, 12);
    expect(crossing.pointA).toEqual([0, 0, 0]);
    const skew = closestPointsBetweenSegments(vec3(-1, 0, 0), vec3(1, 0, 0), vec3(0, -1, 2), vec3(0, 1, 2));
    expect(skew.distance).toBeCloseTo(2, 12);
    const parallel = closestPointsBetweenSegments(vec3(0, 0, 0), vec3(4, 0, 0), vec3(2, 3, 0), vec3(6, 3, 0));
    expect(parallel.distance).toBeCloseTo(3, 12);
    const endClamped = closestPointsBetweenSegments(vec3(0, 0, 0), vec3(1, 0, 0), vec3(3, 1, 0), vec3(3, 5, 0));
    expect(endClamped.pointA).toEqual([1, 0, 0]);
    expect(endClamped.pointB).toEqual([3, 1, 0]);
    const points = closestPointsBetweenSegments(vec3(0, 0, 0), vec3(0, 0, 0), vec3(3, 4, 0), vec3(3, 4, 0));
    expect(points.distance).toBe(5);
  });

  it("직선 쌍과 평면 교점이 평행을 null로 처리한다", () => {
    expect(closestPointsBetweenLines(vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0), vec3(1, 0, 0))).toBeNull();
    const pair = closestPointsBetweenLines(vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 0, 3), vec3(0, 1, 0));
    expect(pair?.distance).toBeCloseTo(3, 12);
    expect(intersectLineWithPlane(vec3(0, 5, 0), vec3(0, 1, 0), vec3(0, 0, 0), vec3(1, 0, 0))).toBeNull();
    const hit = intersectLineWithPlane(vec3(0, 5, 0), vec3(0, -1, 0), vec3(0, 0, 0), vec3(0, 1, 0));
    expect(hit?.point).toEqual([0, 0, 0]);
    expect(hit?.t).toBe(5);
  });

  it("선분 교차는 허용 오차 안에서만 만나는 점을 돌려준다", () => {
    expect(segmentIntersection(vec3(-1, 0, 0), vec3(1, 0, 0), vec3(0, -1, 0), vec3(0, 1, 0))).toEqual([0, 0, 0]);
    expect(segmentIntersection(vec3(-1, 0, 0), vec3(1, 0, 0), vec3(0, -1, 1), vec3(0, 1, 1))).toBeNull();
    expect(segmentIntersection(vec3(0, 0, 0), vec3(1, 0, 0), vec3(2, 0, 0), vec3(3, 0, 0))).toBeNull();
    expect(segmentIntersection(vec3(0, 0, 0), vec3(0, 0, 0), vec3(0, -1, 0), vec3(0, 1, 0))).toBeNull();
  });

  it("3×3 역행렬이 박스 로컬 좌표 변환에 쓰인다", () => {
    const inverse = invertColumns3(vec3(2, 0, 0), vec3(0, 3, 0), vec3(0, 0, 4));
    expect(inverse).not.toBeNull();
    if (inverse) expectVecClose(applyMatrix3(inverse, vec3(1, 3, 2)), [0.5, 1, 0.5]);
    expect(invertColumns3(vec3(1, 0, 0), vec3(2, 0, 0), vec3(0, 0, 1))).toBeNull();
  });
});
