import { IDENTITY_QUAT, allocatePartIds } from "../../contracts";

import { boxGeometry, createProceduralFixture } from "./procedural-fixture";

import type { HumanoidModelData, MeshPartData, Quat } from "../../contracts";

/** 기존 작은 리그에 실제 눈 스킨 메시·본을 붙인다(본 회전과 GLB 직렬화 검증용). */
export function createEyeGazeFixture(eyeRestRotation: Quat = IDENTITY_QUAT): HumanoidModelData {
  const base = createProceduralFixture();
  const eyeParts: MeshPartData[] = (["left", "right"] as const).map((side, index) => {
    const geometry = boxGeometry([side === "left" ? 0.03 : -0.03, 1.7, 0.15], [0.03, 0.02, 0.02]);
    const jointIndices = new Uint16Array(24 * 4), jointWeights = new Float32Array(24 * 4);
    for (let vertex = 0; vertex < 24; vertex += 1) { jointIndices[vertex * 4] = base.skeleton.bones.length + index; jointWeights[vertex * 4] = 1; }
    return { id: `${side}-eye`, role: "eyeball", partId: 5 + index, materialId: 4, materialPreset: "eye-wet", colorKey: "iris", ...geometry, jointIndices, jointWeights, morphs: [] };
  });
  const parts = [...base.parts, ...eyeParts];
  return { ...base, parts, partIdPalette: allocatePartIds(parts), skeleton: { bones: [...base.skeleton.bones,
    { name: "leftEye", parent: "head", restTranslation: [0.03, 0.15, 0.15], restRotation: eyeRestRotation },
    { name: "rightEye", parent: "head", restTranslation: [-0.03, 0.15, 0.15], restRotation: eyeRestRotation },
  ] } };
}

/** 본·눈 메시가 있어도 눈 본은 형상에 영향을 주지 않는, 텍스처 눈 소스의 최소 회귀다. 가중치 합은 유지한다. */
export function createUnweightedEyeGazeFixture(): HumanoidModelData {
  const model = createEyeGazeFixture();
  const head = model.skeleton.bones.findIndex((bone) => bone.name === "head");
  return { ...model, parts: model.parts.map((part) => part.role === "eyeball" && part.jointIndices
    ? { ...part, jointIndices: new Uint16Array(part.jointIndices.length).fill(head) } : part) };
}
