/**
 * Studio 3D 데생 인형 — 인형 한 체의 Three.js 그래프(씬 계층 + v3 에코르셰 해부학·로프트 통합).
 *
 * 스펙(관절 계층 + 프리미티브 + v3 에코르셰 로프트·근육 면·능동 굴곡 팽창)으로 관절 그룹·몸 메시·
 * 윤곽선·IK 핸들을 만들고, 포즈 적용·읽기·선택 틴트·배치(루트 위치·요)를 담당한다.
 */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

import {
  buildSplayedHandDigitPrimitives,
  buildStudioMannequinEcorchePrimitives,
  buildStudioMannequinLoftTubes,
  computeStudioMannequinFlexionBulge,
  resolveStudioMannequinSurfaceMode,
  type StudioMannequinFingerSplayMap,
  type StudioMannequinSurfaceMode,
} from "./studio-mannequin-ecorche-anatomy";
import {
  STUDIO_MANNEQUIN_CHAIN_IDS,
  clampStudioMannequinFingerPose,
  clampStudioMannequinJointRotation,
  type StudioMannequinChainId,
  type StudioMannequinFingerPose,
  type StudioMannequinJointId,
  type StudioMannequinPrimitiveMaterialRole,
  type StudioMannequinSpec,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import { normalizeStudioMannequinPose, type StudioMannequinPose } from "./studio-mannequin-poses";
import { buildStudioMannequinLoftGeometry } from "./studio-mannequin-pro-overlays";

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
  studioMannequinDynamicBulge?: "leftBicep" | "rightBicep" | "leftCalf" | "rightCalf" | "leftGlute" | "rightGlute";
  studioMannequinRestScale?: StudioMannequinVec3;
}

export interface StudioMannequinFigureEcorcheState {
  readonly surfaceMode: StudioMannequinSurfaceMode;
  readonly pectoralVolume: number;
  readonly muscleDefinition: number;
  readonly fingerPose?: StudioMannequinFingerPose;
  readonly leftSplayDeg?: Partial<StudioMannequinFingerSplayMap>;
  readonly rightSplayDeg?: Partial<StudioMannequinFingerSplayMap>;
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
  setEcorcheState(next: Partial<StudioMannequinFigureEcorcheState>, pose: StudioMannequinPose): void;
  getEcorcheState(): StudioMannequinFigureEcorcheState;
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

function hasNonZeroSplay(splay?: Partial<StudioMannequinFingerSplayMap>): boolean {
  if (!splay) return false;
  return Object.values(splay).some((deg) => typeof deg === "number" && Math.abs(deg) > 1e-4);
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
  readonly initialEcorcheState?: Partial<StudioMannequinFigureEcorcheState>;
}): StudioMannequinSceneFigure {
  const { id, materials } = input;
  const root = new THREE.Group();
  root.name = `studio-mannequin-figure:${id}`;
  let spec = input.spec;
  let ecorcheState: StudioMannequinFigureEcorcheState = {
    surfaceMode: resolveStudioMannequinSurfaceMode(input.initialEcorcheState?.surfaceMode ?? "ecorche"),
    pectoralVolume: input.initialEcorcheState?.pectoralVolume ?? 1,
    muscleDefinition: input.initialEcorcheState?.muscleDefinition ?? 1,
    fingerPose: input.initialEcorcheState?.fingerPose,
    leftSplayDeg: input.initialEcorcheState?.leftSplayDeg,
    rightSplayDeg: input.initialEcorcheState?.rightSplayDeg,
  };
  let joints = new Map<StudioMannequinJointId, THREE.Group>();
  let bodyMeshes: THREE.Mesh[] = [];
  let outlineMeshes: THREE.Mesh[] = [];
  let effectorHandles: THREE.Mesh[] = [];
  let pelvisRestOffset = new THREE.Vector3();
  let selectedJointId: StudioMannequinJointId | null = null;

  function disposeGraph(): void {
    for (const outline of outlineMeshes) outline.removeFromParent();
    outlineMeshes = [];
    for (const mesh of bodyMeshes) {
      mesh.geometry.dispose();
      mesh.removeFromParent();
    }
    for (const handle of effectorHandles) handle.removeFromParent();
    bodyMeshes = [];
    effectorHandles = [];
    for (const group of joints.values()) group.removeFromParent();
    joints = new Map();
    root.clear();
  }

  function attachBodyMesh(
    jointGroup: THREE.Group,
    mesh: THREE.Mesh,
    jointId: StudioMannequinJointId,
    materialRole: StudioMannequinPrimitiveMaterialRole,
    dynamicBulge?: StudioMannequinBodyMeshUserData["studioMannequinDynamicBulge"],
  ): void {
    const restScale: StudioMannequinVec3 = [mesh.scale.x, mesh.scale.y, mesh.scale.z];
    Object.assign(mesh.userData as StudioMannequinBodyMeshUserData, {
      studioMannequinJointId: jointId,
      studioMannequinMaterialRole: materialRole,
      studioMannequinFigureId: id,
      ...(dynamicBulge ? { studioMannequinDynamicBulge: dynamicBulge, studioMannequinRestScale: restScale } : {}),
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
      studioMannequinJointId: jointId,
      studioMannequinMaterialRole: materialRole,
      studioMannequinFigureId: id,
      ...(dynamicBulge ? { studioMannequinDynamicBulge: dynamicBulge, studioMannequinRestScale: [outline.scale.x, outline.scale.y, outline.scale.z] } : {}),
    });
    outline.visible = materials.outlineVisible(materialRole);
    outline.castShadow = false;
    outline.receiveShadow = false;
    outline.renderOrder = -1;
    jointGroup.add(outline);
    outlineMeshes.push(outline);
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

  function applyDynamicBulgeScales(pose: StudioMannequinPose): void {
    if (ecorcheState.surfaceMode === "standard") return;
    const bulge = computeStudioMannequinFlexionBulge(pose, ecorcheState.muscleDefinition);
    const applyToList = (list: THREE.Mesh[]) => {
      for (const mesh of list) {
        const ud = mesh.userData as StudioMannequinBodyMeshUserData;
        if (!ud.studioMannequinDynamicBulge || !ud.studioMannequinRestScale) continue;
        const factor =
          ud.studioMannequinDynamicBulge === "leftBicep"
            ? bulge.leftBicepScale
            : ud.studioMannequinDynamicBulge === "rightBicep"
              ? bulge.rightBicepScale
              : ud.studioMannequinDynamicBulge === "leftCalf"
                ? bulge.leftCalfScale
                : ud.studioMannequinDynamicBulge === "rightCalf"
                  ? bulge.rightCalfScale
                  : ud.studioMannequinDynamicBulge === "leftGlute"
                    ? bulge.leftGluteScale
                    : bulge.rightGluteScale;
        mesh.scale.set(
          ud.studioMannequinRestScale[0] * Math.sqrt(factor),
          ud.studioMannequinRestScale[1],
          ud.studioMannequinRestScale[2] * factor,
        );
      }
    };
    applyToList(bodyMeshes);
    applyToList(outlineMeshes);
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
    applyDynamicBulgeScales(pose);
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

  function detectDynamicBulgeTag(
    primitive: StudioMannequinSpec["primitives"][number],
  ): StudioMannequinBodyMeshUserData["studioMannequinDynamicBulge"] | undefined {
    if (primitive.kind !== "sphere" || primitive.materialRole !== "body") return undefined;
    if (primitive.jointId === "leftUpperArm" && primitive.center[2] > 0.01) return "leftBicep";
    if (primitive.jointId === "rightUpperArm" && primitive.center[2] > 0.01) return "rightBicep";
    if (primitive.jointId === "leftLowerLeg" && primitive.center[2] < -0.01) return "leftCalf";
    if (primitive.jointId === "rightLowerLeg" && primitive.center[2] < -0.01) return "rightCalf";
    if (primitive.jointId === "pelvis" && primitive.center[2] < -0.05) {
      return primitive.center[0] >= 0 ? "leftGlute" : "rightGlute";
    }
    return undefined;
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

    const replaceLeftDigits = hasNonZeroSplay(ecorcheState.leftSplayDeg);
    const replaceRightDigits = hasNonZeroSplay(ecorcheState.rightSplayDeg);
    const handLen = 0.085 * spec.heightM * spec.params.armLength * (spec.params.handScale ?? 1);

    for (const primitive of spec.primitives) {
      if (
        (replaceLeftDigits && primitive.jointId === "leftHand" && primitive.kind !== "box")
        || (replaceRightDigits && primitive.jointId === "rightHand" && primitive.kind !== "box")
      ) {
        // 손목 구(center=[0,0,0])는 남기고 손가락 체인만 벌림(Splay) 체인으로 교체한다.
        const isWristSphere =
          primitive.kind === "sphere"
          && Math.abs(primitive.center[0]) < 1e-5
          && Math.abs(primitive.center[1]) < 1e-5;
        if (!isWristSphere) continue;
      }
      const jointGroup = joints.get(primitive.jointId);
      if (!jointGroup) continue;
      const mesh = buildPrimitiveMesh(primitive);
      attachBodyMesh(jointGroup, mesh, primitive.jointId, primitive.materialRole ?? "body");
    }

    if (replaceLeftDigits || replaceRightDigits) {
      const resolvedFingers = clampStudioMannequinFingerPose(ecorcheState.fingerPose);
      if (replaceLeftDigits) {
        const leftGroup = joints.get("leftHand");
        if (leftGroup) {
          for (const prim of buildSplayedHandDigitPrimitives("leftHand", handLen, 1, resolvedFingers.left, ecorcheState.leftSplayDeg)) {
            attachBodyMesh(leftGroup, buildPrimitiveMesh(prim), "leftHand", prim.materialRole ?? "body");
          }
        }
      }
      if (replaceRightDigits) {
        const rightGroup = joints.get("rightHand");
        if (rightGroup) {
          for (const prim of buildSplayedHandDigitPrimitives("rightHand", handLen, -1, resolvedFingers.right, ecorcheState.rightSplayDeg)) {
            attachBodyMesh(rightGroup, buildPrimitiveMesh(prim), "rightHand", prim.materialRole ?? "body");
          }
        }
      }
    }

    // v3 유기 단면 로프트 + 에코르셰 근육·골격 랜드마크 장착
    if (ecorcheState.surfaceMode !== "standard") {
      const loftTubes = buildStudioMannequinLoftTubes(spec, {
        surfaceMode: ecorcheState.surfaceMode,
        pectoralVolume: ecorcheState.pectoralVolume,
        muscleDefinition: ecorcheState.muscleDefinition,
      });
      for (const tube of loftTubes) {
        const jointGroup = joints.get(tube.jointId);
        if (!jointGroup) continue;
        const geometry = buildStudioMannequinLoftGeometry(tube);
        const mesh = new THREE.Mesh(geometry, materials.palette()[tube.materialRole]);
        mesh.name = `studio-mannequin-loft:${tube.id}`;
        attachBodyMesh(jointGroup, mesh, tube.jointId, tube.materialRole);
      }

      const ecorchePrimitives = buildStudioMannequinEcorchePrimitives(spec, {
        surfaceMode: ecorcheState.surfaceMode,
        pectoralVolume: ecorcheState.pectoralVolume,
        muscleDefinition: ecorcheState.muscleDefinition,
      });
      for (const prim of ecorchePrimitives) {
        const jointGroup = joints.get(prim.jointId);
        if (!jointGroup) continue;
        const mesh = buildPrimitiveMesh(prim);
        attachBodyMesh(
          jointGroup,
          mesh,
          prim.jointId,
          prim.materialRole ?? "body",
          detectDynamicBulgeTag(prim),
        );
      }
    }

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
    setEcorcheState(next, pose) {
      ecorcheState = {
        ...ecorcheState,
        ...next,
        surfaceMode: resolveStudioMannequinSurfaceMode(next.surfaceMode ?? ecorcheState.surfaceMode),
      };
      rebuild(spec, pose);
    },
    getEcorcheState: () => ecorcheState,
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
