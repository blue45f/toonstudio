/**
 * 엔진의 읽기 전용 조회: 소스 능력·관절 화면 투영·카메라 기저·본 변환·페인트 연결 상태.
 * 리그·카메라·텍스처는 호출 시점의 객체를 받으며, 소스 교체와 자원 수명은 엔진이 소유한다.
 */
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Viewport } from "@babylonjs/core/Maths/math.viewport.js";

import { isHumanoidBoneName } from "../../contracts";
import { v3Cross, v3Length, v3Normalize, v3Sub } from "../../shared/math";

import { rigBoneWorld } from "./character-rig";
import { fromQuaternion, fromVector3, toVector3 } from "./convert";

import type { JointDragHandle, Quat, SourceCapabilities, Vec3 } from "../../contracts";
import type { PaintInspection } from "../rig-inspection";
import type { ViewportCameraInfo } from "../viewport-camera";
import type { CharacterRig } from "./character-rig";
import type { PaintTextureSet } from "./pick-and-paint";
import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";

/** `readBone` 결과 */
export interface BoneReading {
  readonly name: string;
  readonly humanoid: string | null;
  readonly position: Vec3;
  readonly rotation: Quat;
  readonly localRotation: Quat;
  readonly auxiliary: boolean;
}

export function inspectRigCapabilities(rig: CharacterRig): SourceCapabilities {
  return {
    capabilities: rig.capabilities,
    morphNames: rig.morphNames,
    boneNames: [...rig.bones.keys()],
    partIdPalette: rig.partIdPalette,
  };
}

export function projectRigJointHandles(rig: CharacterRig, camera: ArcRotateCamera, engine: AbstractEngine): readonly JointDragHandle[] {
  const width = engine.getRenderWidth();
  const height = engine.getRenderHeight();
  const viewProjection = camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true));
  const viewport = new Viewport(0, 0, width, height);
  const handles: JointDragHandle[] = [];
  for (const [bone, rb] of rig.humanoid) {
    const world = rigBoneWorld(rb).position;
    const projected = Vector3.Project(toVector3(world), Matrix.IdentityReadOnly, viewProjection, viewport);
    handles.push({ bone, screen: [projected.x, projected.y], world });
  }
  return handles;
}

export function inspectViewportCamera(camera: ArcRotateCamera, engine: AbstractEngine): ViewportCameraInfo {
  // 위치는 구면 좌표에서 직접 계산한다(ArcRotateCamera의 globalPosition은 다음 렌더 전까지 이전 값일 수 있다).
  const target = fromVector3(camera.target);
  const sinBeta = Math.sin(camera.beta);
  const position: Vec3 = [
    target[0] + camera.radius * Math.cos(camera.alpha) * sinBeta,
    target[1] + camera.radius * Math.cos(camera.beta),
    target[2] + camera.radius * Math.sin(camera.alpha) * sinBeta,
  ];
  const direction = v3Sub(target, position);
  const forward: Vec3 = v3Length(direction) < 1e-9 ? [0, 0, -1] : v3Normalize(direction);
  // 우수 좌표 카메라 기저: right = forward × worldUp (forward가 world up과 평행이면 +X로 대체), up = right × forward
  const crossUp = v3Cross(forward, [0, 1, 0]);
  const right: Vec3 = v3Length(crossUp) < 1e-6 ? [1, 0, 0] : v3Normalize(crossUp);
  const up: Vec3 = v3Cross(right, forward);
  return { position, forward, right, up, fovY: camera.fov, width: engine.getRenderWidth(), height: engine.getRenderHeight() };
}

export function readRigBone(rig: CharacterRig | null, name: string): BoneReading | null {
  if (!rig) return null;
  const rb = rig.bones.get(name) ?? (isHumanoidBoneName(name) ? rig.humanoid.get(name) : undefined);
  if (!rb) return null;
  const world = rigBoneWorld(rb);
  return { name: rb.name, humanoid: rb.humanoid, position: world.position, rotation: world.rotation, localRotation: fromQuaternion(rb.node.rotationQuaternion), auxiliary: rb.auxiliary };
}

export function inspectRigPaint(rig: CharacterRig | null, textures: PaintTextureSet): readonly PaintInspection[] {
  return textures.describe().map((info) => {
    const texture = textures.get(info.part);
    const parts = rig ? rig.parts.filter((part) => part.role === info.part) : [];
    const decalMeshes = parts.reduce((sum, part) => sum + part.meshes.filter((mesh) => texture !== null && mesh.decalMap?.texture === texture).length, 0);
    return { ...info, decalMeshes, decalEnabled: parts.length > 0 && parts.every((part) => part.pbr.decalMap?.isEnabled === true) };
  });
}
