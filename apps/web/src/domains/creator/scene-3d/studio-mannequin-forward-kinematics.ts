/**
 * Studio 3D 데생 인형 — 순방향 운동학(FK) 공용 계층.
 *
 * 씬(`studio-mannequin-scene.ts`)의 관절 그룹 계약을 three 없이 그대로 재현한다:
 * - 관절 회전은 관절 한계로 클램프한 오일러 XYZ(R = Rx·Ry·Rz, three 기본 순서).
 * - 골반 그룹 위치 = rest 오프셋 + pose.pelvisOffset.
 * - 인형 루트는 rootOffset 위치·rootYawRad(Y축 회전)에 놓인다(2인 구도의 상대 배치).
 *
 * 2인 구도 솔버·전신 접지·포즈 품질 검사가 같은 FK 를 쓰도록 한곳에 모았다.
 * 결정적 순수 모듈이라 단위 테스트가 안전하다.
 */

import {
  clampStudioMannequinJointRotation,
  type StudioMannequinJointId,
  type StudioMannequinSpec,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";

import type { StudioMannequinPose } from "./studio-mannequin-poses";

/** 행 우선 3×3 회전 행렬. */
export type StudioMannequinMat3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export function studioMannequinMat3Multiply(
  a: StudioMannequinMat3,
  b: StudioMannequinMat3,
): StudioMannequinMat3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

/** THREE Euler 'XYZ' 와 같은 합성: R = Rx · Ry · Rz. */
export function studioMannequinMat3FromEulerXyz(rotation: StudioMannequinVec3): StudioMannequinMat3 {
  const [x, y, z] = rotation;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  const rx: StudioMannequinMat3 = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const ry: StudioMannequinMat3 = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const rz: StudioMannequinMat3 = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return studioMannequinMat3Multiply(studioMannequinMat3Multiply(rx, ry), rz);
}

export function studioMannequinMat3Apply(
  m: StudioMannequinMat3,
  v: StudioMannequinVec3,
): StudioMannequinVec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

export function studioMannequinVecAdd(
  a: StudioMannequinVec3,
  b: StudioMannequinVec3,
): StudioMannequinVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export interface StudioMannequinJointFrame {
  readonly position: StudioMannequinVec3;
  readonly rotation: StudioMannequinMat3;
}

/**
 * 포즈를 적용한 관절 월드 프레임. 루트(골반 부모)는 rootOffset 위치와
 * rootYawRad(Y축 회전)에 놓이며, 골반 그룹 위치 = rest 오프셋 + pelvisOffset,
 * 관절 회전은 관절 한계로 클램프한 오일러 XYZ — 씬 렌더와 동일하다.
 */
export function computeStudioMannequinJointFrames(
  spec: StudioMannequinSpec,
  pose: StudioMannequinPose,
  rootOffset: StudioMannequinVec3 = [0, 0, 0],
  rootYawRad = 0,
): ReadonlyMap<StudioMannequinJointId, StudioMannequinJointFrame> {
  const frames = new Map<StudioMannequinJointId, StudioMannequinJointFrame>();
  const rootRotation = studioMannequinMat3FromEulerXyz([0, rootYawRad, 0]);
  for (const jointSpec of spec.joints) {
    const localRotation = studioMannequinMat3FromEulerXyz(
      clampStudioMannequinJointRotation(
        jointSpec.id,
        pose.joints[jointSpec.id] ?? [0, 0, 0],
      ),
    );
    if (jointSpec.parentId === null) {
      const pelvisPosition = studioMannequinVecAdd(
        rootOffset,
        studioMannequinMat3Apply(
          rootRotation,
          studioMannequinVecAdd(jointSpec.offset, pose.pelvisOffset),
        ),
      );
      frames.set(jointSpec.id, {
        position: pelvisPosition,
        rotation: studioMannequinMat3Multiply(rootRotation, localRotation),
      });
      continue;
    }
    const parent = frames.get(jointSpec.parentId);
    if (!parent) continue;
    frames.set(jointSpec.id, {
      position: studioMannequinVecAdd(
        parent.position,
        studioMannequinMat3Apply(parent.rotation, jointSpec.offset),
      ),
      rotation: studioMannequinMat3Multiply(parent.rotation, localRotation),
    });
  }
  return frames;
}
