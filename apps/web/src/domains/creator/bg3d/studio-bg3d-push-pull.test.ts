import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  planStudioBg3dPushPull,
  studioBg3dPushPullAxes,
} from "./studio-bg3d-push-pull";

import type { BgPrimitive } from "../studio-background-3d-metadata";

function box(overrides: Partial<BgPrimitive> = {}): BgPrimitive {
  return {
    id: "box-1",
    kind: "box",
    position: [0, 0.5, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: "#fff",
    ...overrides,
  };
}

describe("studio-bg3d-push-pull", () => {
  it("moves only the selected positive face and pins the opposite face", () => {
    const result = planStudioBg3dPushPull(box(), {
      axis: "y",
      face: "positive",
      distance: 1,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.previousDimension).toBeCloseTo(1);
    expect(result.nextDimension).toBeCloseTo(2);
    expect(result.patch.scale).toEqual([1, 2, 1]);
    expect(result.patch.position).toEqual([0, 1, 0]);
    expect(result.patch.position[1] - result.patch.scale[1] / 2).toBeCloseTo(0);
  });

  it("moves a negative face in the negative local direction", () => {
    const result = planStudioBg3dPushPull(box(), {
      axis: "x",
      face: "negative",
      distance: 0.5,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.scale).toEqual([1.5, 1, 1]);
    expect(result.patch.position).toEqual([-0.25, 0.5, 0]);
    expect(result.patch.position[0] + result.patch.scale[0] / 2).toBeCloseTo(0.5);
  });

  it("rotates the centre offset with the object local face normal", () => {
    const result = planStudioBg3dPushPull(
      box({ rotation: [0, Math.PI / 2, 0] }),
      { axis: "x", face: "positive", distance: 2 },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.position[0]).toBeCloseTo(0);
    expect(result.patch.position[1]).toBeCloseTo(0.5);
    expect(result.patch.position[2]).toBeCloseTo(-1);
  });

  it("shares the transform snap increment and keeps a minimum dimension", () => {
    const snapped = planStudioBg3dPushPull(box(), {
      axis: "z",
      face: "positive",
      distance: 0.62,
      snapStep: 0.25,
    });
    expect(snapped.ok && snapped.appliedDistance).toBeCloseTo(0.5);

    const clamped = planStudioBg3dPushPull(box(), {
      axis: "z",
      face: "positive",
      distance: -10,
      minimumDimension: 0.05,
    });
    expect(clamped.ok).toBe(true);
    if (!clamped.ok) return;
    expect(clamped.nextDimension).toBeCloseTo(0.05);
    expect(clamped.patch.scale[2]).toBeCloseTo(0.05);
  });

  it("fails closed for locked, unsupported, zero, and unbounded operations", () => {
    expect(planStudioBg3dPushPull(box({ locked: true }), {
      axis: "y",
      face: "positive",
      distance: 1,
    })).toMatchObject({ ok: false, reason: "locked" });

    expect(planStudioBg3dPushPull({ ...box(), kind: "sphere" }, {
      axis: "y",
      face: "positive",
      distance: 1,
    })).toMatchObject({ ok: false, reason: "unsupported-face" });

    expect(planStudioBg3dPushPull(box(), {
      axis: "y",
      face: "positive",
      distance: 0,
    })).toMatchObject({ ok: false, reason: "no-change" });

    expect(planStudioBg3dPushPull(box(), {
      axis: "y",
      face: "positive",
      distance: Number.POSITIVE_INFINITY,
    })).toMatchObject({ ok: false, reason: "invalid-distance" });
  });

  it("declares only topology-truthful primitive faces as available", () => {
    expect(studioBg3dPushPullAxes("box")).toEqual(["x", "y", "z"]);
    expect(studioBg3dPushPullAxes("cylinder")).toEqual(["y"]);
    expect(studioBg3dPushPullAxes("tube")).toEqual(["y"]);
    expect(studioBg3dPushPullAxes("sphere")).toEqual([]);
    expect(studioBg3dPushPullAxes("plane")).toEqual([]);
  });
});

// ── 다축 회전: Three.js XYZ Euler(R = Rx·Ry·Rz) 기준 ─────────────────────────
// 한 축만 도는 경우에는 어떤 합성 순서든 결과가 같아서 위 테스트들이 순서 오류를 잡지 못했다.
type Triple = readonly [number, number, number];

const MULTI_AXIS_ROTATIONS: readonly Triple[] = [
  [0.4, -0.7, 0.9],
  [Math.PI / 6, Math.PI / 4, Math.PI / 3],
  [-1.2, 0.5, 2.4],
  [0.1, 0.2, 0.3],
];

const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;

/** 박스 한 면의 월드 중심. 박스 로컬 반치수는 0.5 이므로 스케일을 곱해 면 중심을 구한다. */
function worldFaceCenter(
  transform: { position: Triple; rotation: Triple; scale: Triple },
  axis: "x" | "y" | "z",
  sign: 1 | -1,
): THREE.Vector3 {
  const index = AXIS_INDEX[axis];
  const local: [number, number, number] = [0, 0, 0];
  local[index] = sign * 0.5 * transform.scale[index];
  return new THREE.Vector3(local[0], local[1], local[2])
    .applyEuler(new THREE.Euler(transform.rotation[0], transform.rotation[1], transform.rotation[2], "XYZ"))
    .add(new THREE.Vector3(transform.position[0], transform.position[1], transform.position[2]));
}

describe("studio-bg3d-push-pull — 다축 회전(Three.js XYZ Euler)", () => {
  for (const rotation of MULTI_AXIS_ROTATIONS) {
    for (const axis of ["x", "y", "z"] as const) {
      for (const face of ["positive", "negative"] as const) {
        it(`회전 [${rotation.map((v) => v.toFixed(2)).join(", ")}] · ${axis} ${face} 면: 선택 면만 월드 법선 방향으로 이동하고 반대 면은 제자리다`, () => {
          const primitive = box({ position: [1, 2, -3], rotation: [...rotation], scale: [1.5, 0.8, 2] });
          const distance = 0.8;
          const result = planStudioBg3dPushPull(primitive, { axis, face, distance });
          expect(result.ok).toBe(true);
          if (!result.ok) return;

          const selectedSign = face === "positive" ? 1 : -1;
          const oppositeSign = selectedSign === 1 ? -1 : 1;
          const before = { position: primitive.position as Triple, rotation, scale: primitive.scale as Triple };
          const after = {
            position: result.patch.position as Triple,
            rotation,
            scale: result.patch.scale as Triple,
          };

          const oppositeBefore = worldFaceCenter(before, axis, oppositeSign);
          const oppositeAfter = worldFaceCenter(after, axis, oppositeSign);
          expect(oppositeAfter.distanceTo(oppositeBefore)).toBeLessThan(1e-9);

          const axisUnit: [number, number, number] = [0, 0, 0];
          axisUnit[AXIS_INDEX[axis]] = selectedSign;
          const worldNormal = new THREE.Vector3(axisUnit[0], axisUnit[1], axisUnit[2]).applyEuler(
            new THREE.Euler(rotation[0], rotation[1], rotation[2], "XYZ"),
          );
          const expectedMove = worldNormal.multiplyScalar(result.appliedDistance);
          const selectedMove = worldFaceCenter(after, axis, selectedSign).sub(worldFaceCenter(before, axis, selectedSign));
          expect(selectedMove.distanceTo(expectedMove)).toBeLessThan(1e-9);
        });
      }
    }
  }

  it("중심 이동량은 Three.js 로 회전한 로컬 법선의 절반 거리다", () => {
    const rotation: Triple = [0.4, -0.7, 0.9];
    const result = planStudioBg3dPushPull(
      box({ position: [0, 0, 0], rotation: [...rotation] }),
      { axis: "z", face: "positive", distance: 1.2 },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const expected = new THREE.Vector3(0, 0, 0.6).applyEuler(
      new THREE.Euler(rotation[0], rotation[1], rotation[2], "XYZ"),
    );
    expect(result.patch.position[0]).toBeCloseTo(expected.x, 10);
    expect(result.patch.position[1]).toBeCloseTo(expected.y, 10);
    expect(result.patch.position[2]).toBeCloseTo(expected.z, 10);
  });
});
