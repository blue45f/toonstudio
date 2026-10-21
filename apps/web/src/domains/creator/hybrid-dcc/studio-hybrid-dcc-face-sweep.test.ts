import { describe, expect, it } from "vitest";

import {
  createStudioSweepObstacles,
  STUDIO_SWEEP_MIN_FACING,
  studioSweepFirstContact,
  type StudioSweepOptions,
  type StudioSweepRegion,
  type StudioSweepVec,
} from "./studio-hybrid-dcc-face-sweep";

const UP: StudioSweepVec = { x: 0, y: 0, z: 1 };

/** z 높이에 놓인 한 변 1짜리 정사각형(위쪽에서 볼 때 반시계). */
function square(z: number, shiftX = 0, shiftY = 0, half = 0.5): StudioSweepVec[] {
  return [
    { x: shiftX - half, y: shiftY - half, z },
    { x: shiftX + half, y: shiftY - half, z },
    { x: shiftX + half, y: shiftY + half, z },
    { x: shiftX - half, y: shiftY + half, z },
  ];
}

const FLOOR: StudioSweepRegion = { normal: UP, faces: [{ points: square(0), normal: UP }] };

const OPTIONS: StudioSweepOptions = {
  skip: new Set<number>(),
  moving: new Set<number>(),
  areaEpsilon: 1e-12,
  heightEpsilon: 1e-9,
};

function contact(
  region: StudioSweepRegion,
  direction: 1 | -1,
  obstaclePoints: readonly (readonly StudioSweepVec[])[],
  options: Partial<StudioSweepOptions> = {},
): number {
  const obstacles = createStudioSweepObstacles(obstaclePoints.map((points, id) => ({ id, points })));
  return studioSweepFirstContact(region, direction, obstacles, { ...OPTIONS, ...options });
}

describe("영역 쓸기 접촉 거리", () => {
  it("움직이는 쪽에 있는 면까지의 거리를 주고, 반대쪽 면은 무시한다", () => {
    expect(contact(FLOOR, 1, [square(2)])).toBeCloseTo(2, 12);
    expect(contact(FLOOR, -1, [square(2)])).toBe(Number.POSITIVE_INFINITY);
    expect(contact(FLOOR, -1, [square(-1.5)])).toBeCloseTo(1.5, 12);
    expect(contact(FLOOR, 1, [square(-1.5)])).toBe(Number.POSITIVE_INFINITY);
    // 여럿이면 가장 가까운 것.
    expect(contact(FLOOR, 1, [square(5), square(0.75), square(2)])).toBeCloseTo(0.75, 12);
  });

  it("그림자가 겹치는 부분만 센다: 일부만 겹쳐도 닿고, 가장자리만 맞닿거나 비켜 가면 닿지 않는다", () => {
    expect(contact(FLOOR, 1, [square(1, 0.5, 0)])).toBeCloseTo(1, 12);
    expect(contact(FLOOR, 1, [square(1, 0.999, 0)])).toBeCloseTo(1, 12);
    expect(contact(FLOOR, 1, [square(1, 1, 0)])).toBe(Number.POSITIVE_INFINITY);
    expect(contact(FLOOR, 1, [square(1, 3, 0)])).toBe(Number.POSITIVE_INFINITY);
  });

  it("기울어진 면은 영역 위에서 가장 낮은 점까지의 거리를 준다", () => {
    const ramp: StudioSweepVec[] = [
      { x: -0.5, y: -0.5, z: 1 }, { x: 0.5, y: -0.5, z: 3 }, { x: 0.5, y: 0.5, z: 3 }, { x: -0.5, y: 0.5, z: 1 },
    ];
    expect(contact(FLOOR, 1, [ramp])).toBeCloseTo(1, 12);
    // 경사가 영역 가장자리에 일부만 걸치면 걸친 부분의 가장 낮은 점이다: 높이가 2x+3.4 이므로 x=-0.5 에서 2.4.
    const shifted = ramp.map((point) => ({ ...point, x: point.x - 0.7 }));
    expect(contact(FLOOR, 1, [shifted])).toBeCloseTo(2.4, 12);
  });

  it("표본 광선이 놓치기 쉬운 작은 판도 잡는다", () => {
    const plate = square(3, 0.123, -0.231, 0.01);
    expect(contact(FLOOR, 1, [plate])).toBeCloseTo(3, 12);
  });

  it("영역 평면을 가로지르는 면이 영역 위에 있으면 움직일 수 없다(거리 0)", () => {
    const slab: StudioSweepVec[] = [
      { x: -0.3, y: -0.3, z: -0.5 }, { x: 0.3, y: -0.3, z: 0.5 }, { x: 0.3, y: 0.3, z: 0.5 }, { x: -0.3, y: 0.3, z: -0.5 },
    ];
    expect(contact(FLOOR, 1, [slab])).toBe(0);
    expect(contact(FLOOR, -1, [slab])).toBe(0);
  });

  it("영역 법선과 나란한 면(그림자가 선으로 접힘)은 접촉으로 세지 않는다", () => {
    const wall: StudioSweepVec[] = [
      { x: 0, y: -0.4, z: 1 }, { x: 0, y: 0.4, z: 1 }, { x: 0, y: 0.4, z: 2 }, { x: 0, y: -0.4, z: 2 },
    ];
    expect(contact(FLOOR, 1, [wall])).toBe(Number.POSITIVE_INFINITY);
  });

  it("건너뛸 면은 무시하고, 함께 움직이는 면은 서로 다가가므로 거리를 절반으로 본다", () => {
    const faces = [square(2), square(4)];
    expect(contact(FLOOR, 1, faces, { skip: new Set([0]) })).toBeCloseTo(4, 12);
    expect(contact(FLOOR, 1, faces, { moving: new Set([0]) })).toBeCloseTo(1, 12);
    expect(contact(FLOOR, 1, faces, { moving: new Set([1]) })).toBeCloseTo(2, 12);
  });

  it("넓이가 임계값 이하인 겹침은 스치는 것으로 본다", () => {
    const sliver = square(1, 0.5 + 0.5 - 1e-9, 0);
    expect(contact(FLOOR, 1, [sliver], { areaEpsilon: 1e-3 })).toBe(Number.POSITIVE_INFINITY);
    expect(contact(FLOOR, 1, [sliver], { areaEpsilon: 1e-12 })).toBeCloseTo(1, 12);
  });

  it("지붕 모양(면마다 기울기가 다른 영역)은 면마다 자기 높이로 잰다", () => {
    const left: StudioSweepVec[] = [
      { x: -1, y: -0.5, z: 0 }, { x: 0, y: -0.5, z: 1 }, { x: 0, y: 0.5, z: 1 }, { x: -1, y: 0.5, z: 0 },
    ];
    const right: StudioSweepVec[] = [
      { x: 0, y: -0.5, z: 1 }, { x: 1, y: -0.5, z: 0 }, { x: 1, y: 0.5, z: 0 }, { x: 0, y: 0.5, z: 1 },
    ];
    const s = Math.SQRT1_2;
    const roof: StudioSweepRegion = {
      normal: UP,
      faces: [
        { points: left, normal: { x: -s, y: 0, z: s } },
        { points: right, normal: { x: s, y: 0, z: s } },
      ],
    };
    // 마룻대(높이 1)에서 천장(높이 3)까지가 가장 가까운 거리다.
    expect(contact(roof, 1, [square(3, 0, 0, 2)])).toBeCloseTo(2, 12);
    // 처마 쪽 판: 지붕 높이가 x+1 이라 x=-0.5 에서 0.5 이고, 높이 0.75 판과의 가장 가까운 틈은 0.25 다.
    const eaves = square(0.75, -0.75, 0, 0.25);
    expect(contact(roof, 1, [eaves])).toBeCloseTo(0.25, 12);
  });

  it("영역 면이 이동 축과 거의 수직이면 높이를 정할 수 없어 0을 돌려준다", () => {
    const sideways: StudioSweepRegion = {
      normal: UP,
      faces: [{ points: square(0), normal: { x: 1, y: 0, z: STUDIO_SWEEP_MIN_FACING / 2 } }],
    };
    expect(contact(sideways, 1, [square(2)])).toBe(0);
  });

  it("좌표계를 어떻게 돌려도 같은 거리를 준다", () => {
    const angle = 0.7;
    const turn = (point: StudioSweepVec): StudioSweepVec => ({
      x: point.x * Math.cos(angle) - point.z * Math.sin(angle),
      y: point.y,
      z: point.x * Math.sin(angle) + point.z * Math.cos(angle),
    });
    const turnedUp = turn(UP);
    const region: StudioSweepRegion = {
      normal: turnedUp,
      faces: [{ points: square(0).map(turn), normal: turnedUp }],
    };
    expect(contact(region, 1, [square(2).map(turn)])).toBeCloseTo(2, 12);
    expect(contact(region, -1, [square(-1.5, 0.3, 0.1).map(turn)])).toBeCloseTo(1.5, 12);
    expect(contact(region, 1, [square(2, 3, 0).map(turn)])).toBe(Number.POSITIVE_INFINITY);
  });
});
