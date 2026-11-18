import { Material } from "@babylonjs/core/Materials/material.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Viewport } from "@babylonjs/core/Maths/math.viewport.js";

import { isHumanoidBoneName } from "../../contracts";
import { qConjugate, qMultiply, qRotateVec3, v3Cross, v3Length, v3Normalize, v3Sub } from "../../shared/math";
import { describeSparseMorphReport } from "../glb-sparse-morph";
import { summarizeJointOffsets } from "../joint-offsets";
import { featureActive, featureOff, featureUnavailable } from "../scene-features";

import { rigBoneWorld } from "./character-rig";
import { fromQuaternion, fromVector3, toVector3 } from "./convert";

import type { BoneReading } from "./character-engine-types";
import type { CharacterRig, RigPart } from "./character-rig";
import type { createPaintTextures } from "./pick-and-paint";
import type { CharacterScene } from "./scene-builder";
import type { JointDragHandle, SourceCapabilities, Vec3 } from "../../contracts";
import type { SparseMorphReport } from "../glb-sparse-morph";
import type { PaintInspection } from "../rig-inspection";
import type { SceneFeatureState } from "../scene-features";
import type { ViewportCameraInfo } from "../viewport-camera";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import type { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager.js";

/**
 * 썸네일 임시 리그 전용 레이어 마스크. 메인 카메라(기본 0x0fffffff)가 그리지 않으므로 캡처 중 비동기 구간에도
 * 뷰포트에 임시 리그가 보이지 않는다. 캡처 RTT는 `renderList`를 쓰므로 레이어 마스크를 검사하지 않는다.
 */
export const THUMBNAIL_LAYER_MASK = 0x10000000;

/** 얼굴 SDF 임계 맵 해상도 */
export const FACE_SDF_SIZE = 128;
/** 엣지 외곽선 각도 임계(cos) */
export const TOON_EDGE_EPSILON = 0.95;

/** 지금 influence > 0인 morph 타깃 수. `numInfluencers`는 attribute 모드에서 8개로 잘려 있어 초과분(무시되는 타깃)을 셀 수 없다. */
export function activeMorphTargets(manager: MorphTargetManager): number {
  let active = 0;
  for (let index = 0; index < manager.numTargets; index += 1) if (manager.getTarget(index).influence > 0) active += 1;
  return active;
}

/**
 * 알베도 텍스처 알파 컷오프. glTF `alphaMode: MASK`(키트의 눈썹·속눈썹)로 올라온 재질은 로더가 PBR을 알파 테스트(`alphaCutOff`)로 둔다 —
 * 툰·밑색 ShaderMaterial은 알파를 쓰지 않아 컷아웃 카드가 불투명하게 그려지므로 같은 컷오프로 버린다. 알베도 텍스처가 없거나 알파 테스트가 아니면 0(끔)이다.
 */
export function alphaCutoffOf(part: RigPart): number {
  return part.hasAlbedoTexture && part.pbr.transparencyMode === Material.MATERIAL_ALPHATEST ? part.pbr.alphaCutOff : 0;
}

export function sourceCapabilitiesForRig(rig: CharacterRig): SourceCapabilities {
  return {
    capabilities: rig.capabilities,
    morphNames: rig.morphNames,
    boneNames: [...rig.bones.keys()],
    partIdPalette: rig.partIdPalette,
  };
}

/** 머리 본의 rest 대비 회전으로 얼굴 forward(+Z)·right(+X)를 구한다(패키지의 비항등 rest도 동일). */
export function headAxesForRig(rig: CharacterRig | null): { readonly forward: Vec3; readonly right: Vec3 } {
  const head = rig?.humanoid.get("head");
  if (!head) return { forward: [0, 0, 1], right: [1, 0, 0] };
  const delta = qMultiply(rigBoneWorld(head).rotation, qConjugate(head.restWorld));
  return { forward: qRotateVec3(delta, [0, 0, 1]), right: qRotateVec3(delta, [1, 0, 0]) };
}

type RenderSizeSource = Pick<AbstractEngine, "getRenderWidth" | "getRenderHeight">;

export function projectRigJointHandles(rig: CharacterRig, camera: CharacterScene["camera"], engine: RenderSizeSource): readonly JointDragHandle[] {
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

export function readViewportCamera(camera: CharacterScene["camera"], engine: RenderSizeSource): ViewportCameraInfo {
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

export function jointOffsetStateForRig(rig: CharacterRig | null): SceneFeatureState {
  if (!rig) return featureOff("소스가 없습니다.");
  const binding = rig.jointOffsets;
  if (!binding) return featureOff(rig.kind === "package" ? "제작 패키지에는 체형 morph 관절 오프셋이 없습니다." : "이 소스는 관절 오프셋을 주지 않아 morph만 정점에 반영됩니다.");
  const summary = summarizeJointOffsets(binding.table);
  const applied = binding.snapshot().size;
  return featureActive(`morph ${summary.morphCount}개 · 관절 ${summary.boneCount}개 · 최대 ${(summary.maxOffsetM * 1000).toFixed(0)} mm · 지금 ${applied}개 본이 옮겨짐(역바인드 재생성)`);
}

export function glbSparseStateForReport(report: SparseMorphReport | null): SceneFeatureState {
  if (!report) return featureActive("내보낼 때마다 변경량 0 정점의 morph를 sparse accessor로 정리합니다(아직 내보내지 않음).");
  if (report.unchanged) return report.morphAccessors === 0 ? featureOff("마지막 내보내기: morph target가 없어 정리할 것이 없습니다.") : featureUnavailable(`마지막 내보내기: ${describeSparseMorphReport(report)}`);
  return featureActive(`마지막 내보내기: ${describeSparseMorphReport(report)}`);
}
