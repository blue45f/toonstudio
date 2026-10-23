import { describe, expect, it } from "vitest";

import { fitStudioMannequinCameraToBounds, type StudioMannequinBounds } from "./studio-mannequin-camera-framing";
import { STUDIO_MANNEQUIN_BODY_PRESETS, buildStudioMannequinSpec } from "./studio-mannequin-model";
import { resolveStudioMannequinEffectorHandleRadius } from "./studio-mannequin-scene-figure";

type V3 = readonly [number, number, number];

/** 원근 투영으로 점이 화면(NDC ±1) 안에 들어오는지 — 프레이밍 결과의 독립 검산. */
function projectsInside(point: V3, frame: { target: V3; position: V3 }, fovDeg: number, aspect: number): boolean {
  const w = [frame.position[0] - frame.target[0], frame.position[1] - frame.target[1], frame.position[2] - frame.target[2]];
  const len = Math.hypot(w[0]!, w[1]!, w[2]!);
  const back = [w[0]! / len, w[1]! / len, w[2]! / len];
  const worldUp = Math.abs(back[1]!) > 0.98 ? [0, 0, -1] : [0, 1, 0];
  const right = [
    worldUp[1]! * back[2]! - worldUp[2]! * back[1]!,
    worldUp[2]! * back[0]! - worldUp[0]! * back[2]!,
    worldUp[0]! * back[1]! - worldUp[1]! * back[0]!,
  ];
  const rl = Math.hypot(right[0]!, right[1]!, right[2]!);
  const r = right.map((v) => v / rl);
  const up = [
    back[1]! * r[2]! - back[2]! * r[1]!,
    back[2]! * r[0]! - back[0]! * r[2]!,
    back[0]! * r[1]! - back[1]! * r[0]!,
  ];
  const rel = [point[0] - frame.position[0], point[1] - frame.position[1], point[2] - frame.position[2]];
  const depth = -(rel[0]! * back[0]! + rel[1]! * back[1]! + rel[2]! * back[2]!);
  const tanV = Math.tan((fovDeg / 2) * (Math.PI / 180));
  const x = (rel[0]! * r[0]! + rel[1]! * r[1]! + rel[2]! * r[2]!) / (depth * tanV * aspect);
  const y = (rel[0]! * up[0]! + rel[1]! * up[1]! + rel[2]! * up[2]!) / (depth * tanV);
  return depth > 0 && Math.abs(x) <= 1 + 1e-9 && Math.abs(y) <= 1 + 1e-9;
}

function corners(bounds: StudioMannequinBounds): V3[] {
  const out: V3[] = [];
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) out.push([x, y, z]);
    }
  }
  return out;
}

describe("fitStudioMannequinCameraToBounds", () => {
  const presets: readonly V3[] = [
    [1.55, 0.53, 3.1],
    [0, 0.18, 3.4],
    [3.4, 0.18, 0],
    [0, 2.88, 0.01],
    [1.4, -0.72, 2.8],
  ];

  it("모든 앵글에서 경계 상자 꼭짓점이 화각 안에 들어오고 타깃은 상자 중심이다", () => {
    const bounds: StudioMannequinBounds = { min: [-0.35, 0, -0.2], max: [0.35, 1.2, 0.25] };
    for (const viewDirection of presets) {
      for (const aspect of [0.6, 1, 1.8]) {
        const frame = fitStudioMannequinCameraToBounds({ bounds, viewDirection, fovDeg: 35, aspect });
        expect(frame.target[0]).toBeCloseTo(0, 9);
        expect(frame.target[1]).toBeCloseTo(0.6, 9);
        expect(frame.target[2]).toBeCloseTo(0.025, 9);
        for (const point of corners(bounds)) {
          expect(projectsInside(point, frame, 35, aspect), `${viewDirection} ${aspect}`).toBe(true);
        }
      }
    }
  });

  it("3등신 SD 의 짧고 넓은 몸과 2인 구도 폭을 모두 담는다(B-11 발 잘림 회귀)", () => {
    const sd: StudioMannequinBounds = { min: [-0.4, 0, -0.25], max: [0.4, 1.25, 0.3] };
    const duo: StudioMannequinBounds = { min: [-0.45, 0, -0.3], max: [0.45, 1.75, 0.9] };
    for (const bounds of [sd, duo]) {
      const frame = fitStudioMannequinCameraToBounds({ bounds, viewDirection: presets[0]!, fovDeg: 35, aspect: 0.75 });
      for (const point of corners(bounds)) expect(projectsInside(point, frame, 35, 0.75)).toBe(true);
    }
  });

  it("작은 상자도 최소 거리 아래로 붙지 않는다", () => {
    const frame = fitStudioMannequinCameraToBounds({
      bounds: { min: [0, 0, 0], max: [0.01, 0.01, 0.01] },
      viewDirection: [0, 0, 1],
      fovDeg: 35,
      aspect: 1,
      minDistance: 0.5,
    });
    expect(frame.distance).toBeGreaterThanOrEqual(0.5);
  });
});

describe("IK 핸들 크기는 인형 스케일에 비례한다", () => {
  it("기본 체형은 예전 크기(두신 16%)를 유지하고 3등신 SD 는 키 비례 상한으로 줄어든다", () => {
    const neutral = buildStudioMannequinSpec(undefined);
    expect(resolveStudioMannequinEffectorHandleRadius(neutral)).toBeCloseTo(neutral.headUnit * 0.16, 6);
    const sd = buildStudioMannequinSpec({ ...STUDIO_MANNEQUIN_BODY_PRESETS.chibi3.params, heightCm: 120, headCount: 3 });
    const radius = resolveStudioMannequinEffectorHandleRadius(sd);
    expect(radius).toBeLessThan(sd.headUnit * 0.16 * 0.75);
    expect(radius).toBeCloseTo(sd.heightM * 0.023, 6);
  });
});
