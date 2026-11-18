/** 엔진의 카메라·관절·페인트 상태를 읽어 렌더러 중립 진단 값으로 변환한다. */
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Viewport } from "@babylonjs/core/Maths/math.viewport.js";

import { isHumanoidBoneName } from "../../contracts";
import { qConjugate, qMultiply, qRotateVec3, v3Cross, v3Length, v3Normalize, v3Sub } from "../../shared/math";

import { rigBoneWorld } from "./character-rig";
import { fromQuaternion, fromVector3, toVector3 } from "./convert";

import type { JointDragHandle, SourceCapabilities, Vec3 } from "../../contracts";
import type { PaintInspection } from "../rig-inspection";
import type { ViewportCameraInfo } from "../viewport-camera";
import type { BoneReading } from "./character-engine-types";
import type { CharacterRig } from "./character-rig";
import type { createPaintTextures } from "./pick-and-paint";
import type { CharacterScene } from "./scene-builder";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";

export function readJointHandles(rig: CharacterRig, character: CharacterScene, engine: AbstractEngine): readonly JointDragHandle[] {
  const camera = character.camera;
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

export function readViewportCameraInfo(character: CharacterScene, engine: AbstractEngine): ViewportCameraInfo {
  const camera = character.camera;
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

export function inspectRigPaint(rig: CharacterRig | null, paintTextures: ReturnType<typeof createPaintTextures>): readonly PaintInspection[] {
  return paintTextures.describe().map((info) => {
    const texture = paintTextures.get(info.part);
    const parts = rig ? rig.parts.filter((part) => part.role === info.part) : [];
    const decalMeshes = parts.reduce((sum, part) => sum + part.meshes.filter((mesh) => texture !== null && mesh.decalMap?.texture === texture).length, 0);
    return { ...info, decalMeshes, decalEnabled: parts.length > 0 && parts.every((part) => part.pbr.decalMap?.isEnabled === true) };
  });
}

export function readSourceCapabilities(rig: CharacterRig): SourceCapabilities {
  return {
    capabilities: rig.capabilities,
    morphNames: rig.morphNames,
    boneNames: [...rig.bones.keys()],
    partIdPalette: rig.partIdPalette,
  };
}

/** 머리 본의 rest 대비 회전으로 얼굴 forward(+Z)·right(+X)를 구한다(패키지의 비항등 rest도 동일). */
export function readRigHeadAxes(rig: CharacterRig | null): { readonly forward: Vec3; readonly right: Vec3 } {
  const head = rig?.humanoid.get("head");
  if (!head) return { forward: [0, 0, 1], right: [1, 0, 0] };
  const delta = qMultiply(rigBoneWorld(head).rotation, qConjugate(head.restWorld));
  return { forward: qRotateVec3(delta, [0, 0, 1]), right: qRotateVec3(delta, [1, 0, 0]) };
}
