import { describe, expect, it } from "vitest";

import { IDENTITY_QUAT } from "../vrm/studio-analytical-twist-swing-ik";

import {
  deformInflatedMeshWith2dPins,
  inflate2dSilhouetteTo3dMesh,
  solveScreenSpaceJointDrag,
} from "./studio-mannequin-screen-space-pose";

describe("studio-mannequin-screen-space-pose", () => {
  const camera = {
    forward: [0, 0, -1] as const,
    right: [1, 0, 0] as const,
    up: [0, 1, 0] as const,
  };

  it("solves Poseit-style screen-space view-plane swing, arcball, and axial twist drags", () => {
    const swing = solveScreenSpaceJointDrag({
      mode: "view-plane-swing",
      jointScreenPx: [200, 200],
      pointerStartPx: [260, 200], // 3시
      pointerCurrentPx: [200, 140], // 12시 (90도 반시계)
      currentRotation: IDENTITY_QUAT,
      camera,
    });
    expect(Math.abs(swing.angleDeltaRad)).toBeCloseTo(Math.PI / 2, 4);
    expect(Math.hypot(...swing.nextRotation)).toBeCloseTo(1, 5);

    const arcball = solveScreenSpaceJointDrag({
      mode: "arcball-trackball",
      jointScreenPx: [200, 200],
      pointerStartPx: [200, 200],
      pointerCurrentPx: [270, 200],
      currentRotation: IDENTITY_QUAT,
      camera,
    });
    expect(arcball.angleDeltaRad).toBeGreaterThan(0.5);

    const twist = solveScreenSpaceJointDrag({
      mode: "axial-twist",
      jointScreenPx: [200, 200],
      pointerStartPx: [200, 200],
      pointerCurrentPx: [240, 200],
      currentRotation: IDENTITY_QUAT,
      camera,
      boneAxisWorld: [1, 0, 0],
    });
    expect(twist.axisWorld).toEqual([1, 0, 0]);
    expect(twist.angleDeltaRad).toBeGreaterThan(0.4);
  });

  it("inflates a 2D silhouette polygon into a closed watertight 3D mesh and deforms with 2D pins", () => {
    // 8각형 원형 실루엣 (반경 0.4m)
    const octagon: [number, number][] = [];
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      octagon.push([Math.cos(a) * 0.4, Math.sin(a) * 0.4]);
    }

    const mesh = inflate2dSilhouetteTo3dMesh(octagon, {
      gridResolution: 10,
      inflationScale: 0.9,
      meterScale: 1,
    });
    expect(mesh).not.toBeNull();
    expect(mesh!.isClosedWatertight).toBe(true);
    expect(mesh!.maxHalfThicknessM).toBeGreaterThan(0.25);
    expect(mesh!.triangleCount).toBeGreaterThan(64);
    // 전면 중심 +Z, 후면 중심 -Z 대칭 팽창 확인
    expect(mesh!.positions[2]).toBeCloseTo(mesh!.maxHalfThicknessM, 5);
    expect(mesh!.positions[5]).toBeCloseTo(-mesh!.maxHalfThicknessM, 5);

    const deformed = deformInflatedMeshWith2dPins(mesh!, [
      { rest2d: [0, 0], target2d: [0.15, 0.08], radiusM: 0.35 },
    ]);
    // 중심점이 핀 이동량(+0.15, +0.08)만큼 정확히 따라가야 한다
    expect(deformed[0]).toBeCloseTo(0.15, 4);
    expect(deformed[1]).toBeCloseTo(0.08, 4);
  });
});
