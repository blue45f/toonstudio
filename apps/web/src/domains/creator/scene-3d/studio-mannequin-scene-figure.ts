/**
 * Studio 3D 데생 인형 — 인형 한 체의 Three.js 그래프(씬 계층).
 *
 * 스펙(관절 계층 + 프리미티브)으로 관절 그룹·몸 메시·윤곽선·IK 핸들을 만들고, 포즈 적용·
 * 읽기·선택 틴트·배치(루트 위치·요)를 담당한다. 2인 구도에서 주인공과 상대가 같은 코드로
 * 그려지도록 씬 본체(`studio-mannequin-scene.ts`)에서 분리했다 — 재질·핸들 지오메트리는
 * 씬이 소유하고 두 인형이 공유한다.
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

import {
  STUDIO_MANNEQUIN_CHAIN_IDS,
  clampStudioMannequinJointRotation,
  type StudioMannequinChainId,
  type StudioMannequinJointId,
  type StudioMannequinPrimitiveMaterialRole,
  type StudioMannequinSpec,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import { normalizeStudioMannequinPose, type StudioMannequinPose } from "./studio-mannequin-poses";

import type { StudioMannequinMaterialPalette } from "./studio-mannequin-scene-materials";

/** 장면 안 인형 구분 — 주인공(패널 포즈 상태)과 2인 구도의 상대. */
export type StudioMannequinFigureId = "lead" | "partner";

export interface StudioMannequinEffectorHandleUserData {
  studioMannequinChainId: StudioMannequinChainId;
  studioMannequinFigureId: StudioMannequinFigureId;
}

export interface StudioMannequinBodyMeshUserData {
  studioMannequinJointId: StudioMannequinJointId;
  studioMannequinMaterialRole: StudioMannequinPrimitiveMaterialRole;
  studioMannequinFigureId: StudioMannequinFigureId;
}

/** 두 인형이 공유하는 재질·지오메트리 공급자(씬이 소유). */
export interface StudioMannequinFigureMaterials {
  readonly palette: () => StudioMannequinMaterialPalette;
  readonly selected: THREE.Material;
  readonly handle: THREE.Material;
  readonly handleGeometry: THREE.BufferGeometry;
  readonly outline: THREE.Material;
  readonly outlineVisible: (role: StudioMannequinPrimitiveMaterialRole) => boolean;
}

export interface StudioMannequinSceneFigure {
  readonly id: StudioMannequinFigureId;
  /** 인형 루트 — 2인 구도 배치(위치·요)가 걸린다. */
  readonly root: THREE.Group;
  readonly spec: () => StudioMannequinSpec;
  readonly joints: () => ReadonlyMap<StudioMannequinJointId, THREE.Group>;
  readonly bodyMeshes: () => readonly THREE.Mesh[];
  readonly effectorHandles: () => readonly THREE.Mesh[];
  rebuild(spec: StudioMannequinSpec, pose: StudioMannequinPose): void;
  applyPose(pose: StudioMannequinPose): void;
  readPose(): StudioMannequinPose;
  setSelection(jointId: StudioMannequinJointId | null): void;
  refreshMaterials(): void;
  refreshOutlines(): void;
  setHandlesVisible(visible: boolean): void;
  setPlacement(offset: StudioMannequinVec3, yawRad: number): void;
  dispose(): void;
}

function toVec3(value: StudioMannequinVec3): THREE.Vector3 {
  return new THREE.Vector3(value[0], value[1], value[2]);
}

/**
 * IK 핸들 반지름(m). 두신 단위만 쓰면 3등신 SD(두신 40cm)에서 핸들 구가 손발보다 커져
 * 손끝을 가렸다 — 키에 비례한 상한을 함께 둬 인형 크기에 맞춘다.
 */
export function resolveStudioMannequinEffectorHandleRadius(spec: StudioMannequinSpec): number {
  return Math.min(spec.headUnit * 0.16, spec.heightM * 0.023);
}

export function createStudioMannequinSceneFigure(input: {
  readonly id: StudioMannequinFigureId;
  readonly spec: StudioMannequinSpec;
  readonly pose: StudioMannequinPose;
  readonly materials: StudioMannequinFigureMaterials;
}): StudioMannequinSceneFigure {
  const { id, materials } = input;
  const root = new THREE.Group();
  root.name = `studio-mannequin-figure:${id}`;
  let spec = input.spec;
  let joints = new Map<StudioMannequinJointId, THREE.Group>();
  let bodyMeshes: THREE.Mesh[] = [];
  let outlineMeshes: THREE.Mesh[] = [];
  let effectorHandles: THREE.Mesh[] = [];
  let pelvisRestOffset = new THREE.Vector3();
  let selectedJointId: StudioMannequinJointId | null = null;

  function disposeGraph(): void {
    // outline은 body geometry를 공유하므로 먼저 scene에서만 분리하고 geometry는 body가 한 번만 dispose한다.
    for (const outline of outlineMeshes) outline.removeFromParent();
    outlineMeshes = [];
    for (const mesh of bodyMeshes) {
      mesh.geometry.dispose();
      mesh.removeFromParent();
    }
    // 핸들 지오메트리는 씬이 소유한 공유 구라 여기서 해제하지 않는다.
    for (const handle of effectorHandles) handle.removeFromParent();
    bodyMeshes = [];
    effectorHandles = [];
    for (const group of joints.values()) group.removeFromParent();
    joints = new Map();
    root.clear();
  }

  function buildPrimitiveMesh(primitive: StudioMannequinSpec["primitives"][number]): THREE.Mesh {
    const role = primitive.materialRole ?? "body";
    const material = materials.palette()[role];
    let mesh: THREE.Mesh;
    if (primitive.kind === "sphere") {
      const relativeRadius = primitive.radius / Math.max(0.001, spec.headUnit);
      const widthSegments = relativeRadius < 0.055 ? 16 : relativeRadius < 0.11 ? 24 : 40;
      const heightSegments = relativeRadius < 0.055 ? 10 : relativeRadius < 0.11 ? 16 : 28;
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(primitive.radius, widthSegments, heightSegments),
        material,
      );
      mesh.position.copy(toVec3(primitive.center));
      if (primitive.scale) mesh.scale.copy(toVec3(primitive.scale));
    } else if (primitive.kind === "box") {
      const minimumSize = Math.min(...primitive.size);
      const radius = Math.min(minimumSize * 0.24, spec.headUnit * 0.08);
      mesh = new THREE.Mesh(
        new RoundedBoxGeometry(
          primitive.size[0],
          primitive.size[1],
          primitive.size[2],
          5,
          Math.max(0.001, radius),
        ),
        material,
      );
      mesh.position.copy(toVec3(primitive.center));
    } else {
      const from = toVec3(primitive.from);
      const to = toVec3(primitive.to);
      const segment = new THREE.Vector3().subVectors(to, from);
      const segmentLength = segment.length();
      const endRadius = primitive.endRadius;
      const hasAnatomicalTaper = typeof endRadius === "number"
        && Number.isFinite(endRadius)
        && endRadius > 0
        && Math.abs(endRadius - primitive.radius) > 1e-6;
      const relativeRadius = primitive.radius / Math.max(0.001, spec.headUnit);
      const radialSegments = relativeRadius < 0.055 ? 12 : relativeRadius < 0.11 ? 20 : 28;
      const middleLength = Math.max(0.001, segmentLength - primitive.radius * 2);
      const geometry = hasAnatomicalTaper
        ? new THREE.CylinderGeometry(
            endRadius,
            primitive.radius,
            Math.max(0.001, segmentLength),
            radialSegments,
            3,
            false,
          )
        : new THREE.CapsuleGeometry(
            primitive.radius,
            middleLength,
            relativeRadius < 0.055 ? 6 : 10,
            radialSegments,
          );
      mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(from).addScaledVector(segment, 0.5);
      if (segmentLength > 1e-9) {
        mesh.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          segment.clone().normalize(),
        );
      }
    }
    mesh.name = `studio-mannequin-part:${primitive.jointId}:${role}`;
    return mesh;
  }

  function applySelectionTint(): void {
    const palette = materials.palette();
    for (const mesh of bodyMeshes) {
      const userData = mesh.userData as StudioMannequinBodyMeshUserData;
      mesh.material = userData.studioMannequinJointId === selectedJointId
        ? materials.selected
        : palette[userData.studioMannequinMaterialRole];
    }
  }

  function applyOutlineVisibility(): void {
    for (const outline of outlineMeshes) {
      const role = (outline.userData as StudioMannequinBodyMeshUserData).studioMannequinMaterialRole;
      outline.visible = materials.outlineVisible(role);
    }
  }

  function applyPose(pose: StudioMannequinPose): void {
    for (const jointSpec of spec.joints) {
      const group = joints.get(jointSpec.id);
      if (!group) continue;
      const rotation = clampStudioMannequinJointRotation(
        jointSpec.id,
        pose.joints[jointSpec.id] ?? [0, 0, 0],
      );
      group.rotation.set(rotation[0], rotation[1], rotation[2]);
    }
    joints.get("pelvis")?.position.set(
      pelvisRestOffset.x + pose.pelvisOffset[0],
      pelvisRestOffset.y + pose.pelvisOffset[1],
      pelvisRestOffset.z + pose.pelvisOffset[2],
    );
  }

  function readPose(): StudioMannequinPose {
    const jointRotations: Partial<Record<StudioMannequinJointId, StudioMannequinVec3>> = {};
    for (const jointSpec of spec.joints) {
      const group = joints.get(jointSpec.id);
      if (!group) continue;
      jointRotations[jointSpec.id] = [group.rotation.x, group.rotation.y, group.rotation.z];
    }
    const pelvis = joints.get("pelvis");
    const pelvisOffset: StudioMannequinVec3 = pelvis
      ? [
          pelvis.position.x - pelvisRestOffset.x,
          pelvis.position.y - pelvisRestOffset.y,
          pelvis.position.z - pelvisRestOffset.z,
        ]
      : [0, 0, 0];
    return normalizeStudioMannequinPose({ joints: jointRotations, pelvisOffset });
  }

  function rebuild(nextSpec: StudioMannequinSpec, pose: StudioMannequinPose): void {
    spec = nextSpec;
    disposeGraph();
    for (const jointSpec of spec.joints) {
      const group = new THREE.Group();
      group.name = `studio-mannequin-joint:${jointSpec.id}`;
      group.position.copy(toVec3(jointSpec.offset));
      const parent = jointSpec.parentId ? joints.get(jointSpec.parentId) : null;
      (parent ?? root).add(group);
      joints.set(jointSpec.id, group);
      if (jointSpec.id === "pelvis") pelvisRestOffset = toVec3(jointSpec.offset);
    }

    for (const primitive of spec.primitives) {
      const jointGroup = joints.get(primitive.jointId);
      if (!jointGroup) continue;
      const mesh = buildPrimitiveMesh(primitive);
      const materialRole = primitive.materialRole ?? "body";
      Object.assign(mesh.userData as StudioMannequinBodyMeshUserData, {
        studioMannequinJointId: primitive.jointId,
        studioMannequinMaterialRole: materialRole,
        studioMannequinFigureId: id,
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      jointGroup.add(mesh);
      bodyMeshes.push(mesh);

      const outline = new THREE.Mesh(mesh.geometry, materials.outline);
      outline.position.copy(mesh.position);
      outline.quaternion.copy(mesh.quaternion);
      outline.scale.copy(mesh.scale).multiplyScalar(1.026);
      Object.assign(outline.userData as StudioMannequinBodyMeshUserData, {
        studioMannequinJointId: primitive.jointId,
        studioMannequinMaterialRole: materialRole,
        studioMannequinFigureId: id,
      });
      outline.visible = materials.outlineVisible(materialRole);
      outline.castShadow = false;
      outline.receiveShadow = false;
      outline.renderOrder = -1;
      jointGroup.add(outline);
      outlineMeshes.push(outline);
    }

    // 손목/발목 IK 핸들 — 항상 위에 그려지는 반투명 구. 크기는 인형 스케일에 비례한다.
    const handleRadius = resolveStudioMannequinEffectorHandleRadius(spec);
    for (const chainId of STUDIO_MANNEQUIN_CHAIN_IDS) {
      const chain = spec.chains[chainId];
      const effectorGroup = joints.get(chain.effectorJointId);
      if (!effectorGroup) continue;
      const handle = new THREE.Mesh(materials.handleGeometry, materials.handle);
      handle.scale.setScalar(handleRadius);
      handle.renderOrder = 10;
      Object.assign(handle.userData as StudioMannequinEffectorHandleUserData, {
        studioMannequinChainId: chainId,
        studioMannequinFigureId: id,
      });
      effectorGroup.add(handle);
      effectorHandles.push(handle);
    }

    applyPose(pose);
    applySelectionTint();
  }

  rebuild(input.spec, input.pose);

  return {
    id,
    root,
    spec: () => spec,
    joints: () => joints,
    bodyMeshes: () => bodyMeshes,
    effectorHandles: () => effectorHandles,
    rebuild,
    applyPose,
    readPose,
    setSelection(jointId) {
      selectedJointId = jointId;
      applySelectionTint();
    },
    refreshMaterials: applySelectionTint,
    refreshOutlines: applyOutlineVisibility,
    setHandlesVisible(visible) {
      for (const handle of effectorHandles) handle.visible = visible;
    },
    setPlacement(offset, yawRad) {
      root.position.set(offset[0], offset[1], offset[2]);
      root.rotation.set(0, Number.isFinite(yawRad) ? yawRad : 0, 0);
    },
    dispose() {
      disposeGraph();
      root.removeFromParent();
    },
  };
}
