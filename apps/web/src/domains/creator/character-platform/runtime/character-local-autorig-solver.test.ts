import { describe, expect, it } from "vitest";

import {
  applySymmetricLandmarkEdit,
  HUMANOID_55_BONE_NAMES,
  HUMANOID_RIG_BONE_COUNT,
  solveLocalHumanoidAutoRig,
  type StaticRigSourceMesh,
} from "./character-local-autorig-solver";

function appendBox(
  pos: number[],
  idx: number[],
  cx: number,
  cy: number,
  cz: number,
  sx: number,
  sy: number,
  sz: number,
): void {
  const base = pos.length / 3;
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  pos.push(
    cx - hx, cy - hy, cz - hz,
    cx + hx, cy - hy, cz - hz,
    cx + hx, cy + hy, cz - hz,
    cx - hx, cy + hy, cz - hz,
    cx - hx, cy - hy, cz + hz,
    cx + hx, cy - hy, cz + hz,
    cx + hx, cy + hy, cz + hz,
    cx - hx, cy + hy, cz + hz,
  );
  const tris = [
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4,
    2, 3, 7, 2, 7, 6,
    0, 4, 7, 0, 7, 3,
    1, 2, 6, 1, 6, 5,
  ];
  for (const t of tris) idx.push(base + t);
}

/** 1.7m T-포즈 휴머노이드 프록시(연결 몸체 + 분리된 모자 액세서리 셸)를 생성한다. */
function makeHumanoidWithHatMesh(): StaticRigSourceMesh {
  const pos: number[] = [];
  const idx: number[] = [];

  // 주체 몸통·팔·다리·머리 (인접 정점 연결 대신 각 부위를 브리지 삼각형으로 단일 셸 연결)
  appendBox(pos, idx, 0, 1.15, 0, 0.32, 0.55, 0.2); // torso (v0..7)
  appendBox(pos, idx, 0, 1.56, 0, 0.2, 0.24, 0.2); // head (v8..15)
  appendBox(pos, idx, 0.42, 1.32, 0, 0.52, 0.1, 0.1); // left arm (v16..23)
  appendBox(pos, idx, -0.42, 1.32, 0, 0.52, 0.1, 0.1); // right arm (v24..31)
  appendBox(pos, idx, 0.11, 0.44, 0, 0.12, 0.88, 0.14); // left leg (v32..39)
  appendBox(pos, idx, -0.11, 0.44, 0, 0.12, 0.88, 0.14); // right leg (v40..47)

  // 몸체 6개 파츠를 단일 주체 셸로 이어주는 브리지 삼각형
  idx.push(2, 8, 3, 2, 16, 6, 3, 25, 7, 0, 34, 1, 0, 42, 4);

  // 분리된 강체 액세서리(모자, v48..55) — 주체와 연결 간선 없음
  appendBox(pos, idx, 0, 1.74, 0, 0.24, 0.1, 0.24);

  return {
    positions: new Float32Array(pos),
    indices: new Uint32Array(idx),
  };
}

describe("character-local-autorig-solver", () => {
  it("정적 휴머노이드 메시에서 55본 스켈레톤·역바인드 행렬·정규화 지오데식 스킨 웨이트를 산출한다", () => {
    const mesh = makeHumanoidWithHatMesh();
    const result = solveLocalHumanoidAutoRig(mesh, {
      voxelResolution: 18,
      heatIterations: 12,
      autoRigidAccessories: true,
    });

    expect(result.skeleton.bones.length).toBe(HUMANOID_RIG_BONE_COUNT);
    expect(result.skeleton.bones.map((b) => b.name)).toEqual([...HUMANOID_55_BONE_NAMES]);
    expect(result.skeleton.inverseBindMatrices.length).toBe(55 * 16);
    expect(result.skeleton.bones[0]!.parentIndex).toBe(-1);

    // 모든 정점의 스킨 웨이트 합은 정확히 1.0이어야 함
    const vCount = mesh.positions.length / 3;
    for (let v = 0; v < vCount; v += 1) {
      const sum =
        result.skinning.weights[v * 4]! +
        result.skinning.weights[v * 4 + 1]! +
        result.skinning.weights[v * 4 + 2]! +
        result.skinning.weights[v * 4 + 3]!;
      expect(sum).toBeCloseTo(1.0, 4);
    }

    // 좌측 다리(v32..39)에 우측 다리 본 가중치가 번지지 않아야 함(지오데식 복셀 분리 효과)
    const rightLegBones = new Set<number>(
      result.skeleton.bones
        .filter((b) => b.name.startsWith("right") && b.name.includes("Leg"))
        .map((b) => b.index),
    );
    for (let v = 32; v < 40; v += 1) {
      let bleedWeight = 0;
      for (let k = 0; k < 4; k += 1) {
        if (rightLegBones.has(result.skinning.joints[v * 4 + k]!)) {
          bleedWeight += result.skinning.weights[v * 4 + k]!;
        }
      }
      expect(bleedWeight).toBeLessThan(0.05);
    }
  });

  it("분리된 모자 액세서리 셸을 감지해 단일 부모 본(head)에 100% 강체 고정한다", () => {
    const mesh = makeHumanoidWithHatMesh();
    const result = solveLocalHumanoidAutoRig(mesh, {
      voxelResolution: 16,
      autoRigidAccessories: true,
    });

    expect(result.shells.length).toBe(2);
    expect(result.skinning.rigidShellBindings.length).toBe(1);
    const hatShell = result.shells.find((s) => !s.isPrimaryBody)!;
    const headBoneIdx = result.skeleton.bones.find((b) => b.name === "head")!.index;
    expect(result.skinning.rigidShellBindings[0]!.boneIndex).toBe(headBoneIdx);

    for (const v of hatShell.vertexIndices) {
      expect(result.skinning.joints[v * 4]).toBe(headBoneIdx);
      expect(result.skinning.weights[v * 4]).toBe(1);
      expect(result.skinning.weights[v * 4 + 1]).toBe(0);
    }
  });

  it("랜드마크 X-미러 보정 헬퍼가 반대쪽 대칭 관절 좌표를 정확히 반전 동기화한다", () => {
    const mesh = makeHumanoidWithHatMesh();
    const base = solveLocalHumanoidAutoRig(mesh, { voxelResolution: 12 });
    const edited = applySymmetricLandmarkEdit(
      base.landmarks,
      "leftShoulder",
      { x: 0.25, y: 1.38, z: 0.02 },
      0,
      true,
    );
    expect(edited.leftShoulder.x).toBeCloseTo(0.25, 5);
    expect(edited.rightShoulder.x).toBeCloseTo(-0.25, 5);
    expect(edited.rightShoulder.y).toBeCloseTo(1.38, 5);
    expect(edited.rightShoulder.z).toBeCloseTo(0.02, 5);
  });
});
