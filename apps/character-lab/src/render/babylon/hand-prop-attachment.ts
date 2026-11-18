/**
 * 캐릭터 손 본(rightHand / leftHand) 실시간 3D 웹툰 소품(스마트폰·커피컵·서류철·에테르 단검) 탈부착 로더.
 *
 * - GLB를 Babylon `LoadAssetContainerAsync`로 열어 손 본 `TransformNode` 아래 `TS_HandPropAnchor`에 페어런팅한다.
 * - `rig.root` 하위 트리에 속하고 `rig.parts`(`partId = 250`, `role = "accessory"`)에 등록되므로:
 *   1) 뷰포트 PBR 및 툰 셰이딩(외곽선·림라이트·망점 스크린톤 포함) 자동 적용
 *   2) 투명 PNG · 4방향 설정시트 · 2×2 시트 · 세로 4컷 웹툰 스트립 캡처 자동 포함
 *   3) `exportGlb()` 실행 시 캐릭터 메쉬·골격과 함께 손에 들린 3D 소품 메쉬(`TS_Prop_*`)가 그대로 직렬화 보존됨
 */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";

import { failVisible } from "../../contracts";
import { sha256Hex } from "../../shared/hash";
import { ROLE_COLOR_KEY, ROLE_DEFAULT_PRESET, resolvePartColorHex } from "../material-presets";

import { attachExtraRigPart, detachExtraRigPart } from "./character-rig";
import { rigMeshMetadata } from "./mesh-binding";
import { loadGlbAssetContainer } from "./package-loader";

import type { CharacterRig, RigPart } from "./character-rig";
import type { HandPropAttachment, HandPropId, HandPropSide, PartRole } from "../../contracts";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import type { Scene } from "@babylonjs/core/scene.js";

/** 기존 캐릭터 파츠(1..32)와 충돌하지 않는 손 소품 전용 고정 partId */
export const HAND_PROP_PART_ID = 250;
export const HAND_PROP_PART_KEY = "extra:hand-prop";

export interface HandPropLoadDeps {
  readonly scene: Scene;
  readonly fetchBytes: (url: string) => Promise<Uint8Array>;
  readonly adaptMaterial: (role: PartRole, mesh: Mesh) => PBRMaterial;
  readonly verifyIntegrity?: boolean;
  readonly now?: number;
}

export interface HandPropHandle {
  readonly attachment: HandPropAttachment;
  readonly part: RigPart;
  dispose(): void;
}

interface GripTransformSpec {
  /** 손바닥 중심 기준 추가 로컬 오프셋 [손가락축 부호반영 X, 손바닥 안쪽 Y, 엄지 방향 Z] */
  readonly palmDelta: readonly [number, number, number];
  /** glTF(+Y 상단, +Z 전면) 소품을 손 본 로컬 축(엄지 +Z, 손바닥 안쪽 -Y)에 맞추는 오일러 회전(rad) */
  readonly eulerRight: readonly [number, number, number];
  readonly eulerLeft: readonly [number, number, number];
  readonly uniformScale: number;
}

const PROP_GRIP_SPECS: Readonly<Record<HandPropId, GripTransformSpec>> = {
  smartphone: {
    palmDelta: [0.012, -0.028, 0.014],
    eulerRight: [Math.PI * 0.46, Math.PI * 0.92, -0.18],
    eulerLeft: [Math.PI * 0.46, -Math.PI * 0.92, 0.18],
    uniformScale: 1.05,
  },
  "coffee-cup": {
    palmDelta: [0.015, -0.042, 0.008],
    eulerRight: [Math.PI * 0.5, 0, 0],
    eulerLeft: [Math.PI * 0.5, 0, 0],
    uniformScale: 1.08,
  },
  "case-folder": {
    palmDelta: [0.02, -0.026, -0.015],
    eulerRight: [Math.PI * 0.48, -0.22, -0.12],
    eulerLeft: [Math.PI * 0.48, 0.22, 0.12],
    uniformScale: 1.0,
  },
  "aether-blade": {
    palmDelta: [0.008, -0.032, 0.006],
    eulerRight: [Math.PI * 0.5, 0.15, 0],
    eulerLeft: [Math.PI * 0.5, -0.15, 0],
    uniformScale: 1.05,
  },
};

function computePalmLocalPosition(rig: CharacterRig, hand: HandPropSide, propId: HandPropId): Vector3 {
  const handBone = rig.humanoid.get(hand);
  const middleName = hand === "rightHand" ? "rightMiddleProximal" : "leftMiddleProximal";
  const middleBone = rig.humanoid.get(middleName);
  const signX = hand === "rightHand" ? -1 : 1;
  const spec = PROP_GRIP_SPECS[propId];

  if (handBone && middleBone && middleBone.node.parent === handBone.node && middleBone.node.position.length() > 0.01) {
    const base = middleBone.node.position.scale(0.56);
    return new Vector3(
      base.x + signX * spec.palmDelta[0],
      base.y + spec.palmDelta[1],
      base.z + spec.palmDelta[2],
    );
  }
  return new Vector3(
    signX * (0.062 + spec.palmDelta[0]),
    spec.palmDelta[1],
    spec.palmDelta[2],
  );
}

export async function attachHandPropToRig(
  rig: CharacterRig,
  attachment: HandPropAttachment,
  deps: HandPropLoadDeps,
): Promise<HandPropHandle> {
  const now = deps.now ?? Date.now();
  const bytes = await deps.fetchBytes(attachment.glbUrl);
  if ((deps.verifyIntegrity ?? true) && attachment.sha256) {
    const digest = await sha256Hex(bytes);
    if (digest !== attachment.sha256) {
      throw failVisible(
        "hand-prop-sha-mismatch",
        `손 소품('${attachment.propId}') GLB 해시가 일치하지 않습니다(${digest.slice(0, 8)}… ≠ ${attachment.sha256.slice(0, 8)}…).`,
        undefined,
        now,
      );
    }
  }

  let container: Awaited<ReturnType<typeof loadGlbAssetContainer>>;
  try {
    container = await loadGlbAssetContainer(bytes, deps.scene);
  } catch (error) {
    throw failVisible("hand-prop-glb-load-failed", `손 소품 GLB를 열지 못했습니다: ${attachment.glbUrl}`, error, now);
  }

  container.addAllToScene();
  const handBone = rig.humanoid.get(attachment.hand);
  const anchor = new TransformNode(`TS_HandPropAnchor_${attachment.propId}`, deps.scene);
  anchor.parent = handBone ? handBone.node : rig.root;

  const spec = PROP_GRIP_SPECS[attachment.propId];
  anchor.position = handBone ? computePalmLocalPosition(rig, attachment.hand, attachment.propId) : new Vector3(0.28, 1.12, 0.22);
  const [rx, ry, rz] = attachment.hand === "rightHand" ? spec.eulerRight : spec.eulerLeft;
  anchor.rotationQuaternion = Quaternion.FromEulerAngles(rx, ry, rz);
  anchor.scaling.setAll(spec.uniformScale);

  for (const rootNode of container.rootNodes) {
    if (rootNode instanceof TransformNode) {
      rootNode.parent = anchor;
    }
  }

  const meshes: Mesh[] = [];
  for (const abstract of container.meshes) {
    if (abstract instanceof Mesh && abstract.getTotalVertices() > 0) {
      meshes.push(abstract);
    }
  }
  if (meshes.length === 0) {
    container.dispose();
    anchor.dispose(false, false);
    throw failVisible("hand-prop-empty-mesh", `손 소품('${attachment.propId}') GLB에 유효한 메쉬가 없습니다.`, undefined, now);
  }

  const role: PartRole = "accessory";
  const firstMesh = meshes[0]!;
  const pbr = deps.adaptMaterial(role, firstMesh);
  const meshPbrs: PBRMaterial[] = [];
  for (const mesh of meshes) {
    const meshPbr = mesh === firstMesh || mesh.material === firstMesh.material ? pbr : deps.adaptMaterial(role, mesh);
    mesh.material = meshPbr;
    meshPbrs.push(meshPbr);
    mesh.metadata = rigMeshMetadata(HAND_PROP_PART_ID, role, HAND_PROP_PART_ID, false);
    mesh.receiveShadows = true;
  }

  const colorKey = ROLE_COLOR_KEY[role];
  const materialPreset = ROLE_DEFAULT_PRESET[role];
  const hasAlbedoTexture = meshPbrs.some((mat) => mat.albedoTexture !== null);
  const part: RigPart = {
    id: HAND_PROP_PART_KEY,
    partId: HAND_PROP_PART_ID,
    materialId: HAND_PROP_PART_ID,
    role,
    materialPreset,
    ...(colorKey !== undefined ? { colorKey } : {}),
    meshes,
    outlineMeshes: [],
    pbr,
    meshPbrs,
    hasAlbedoTexture,
    toon: null,
    colorHex: resolvePartColorHex({ materialPreset, ...(colorKey !== undefined ? { colorKey } : {}) }, null),
    visible: true,
    forceHidden: false,
  };

  attachExtraRigPart(rig, part);
  anchor.computeWorldMatrix(true);
  for (const mesh of meshes) mesh.computeWorldMatrix(true);

  let disposed = false;
  return {
    attachment,
    part,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      detachExtraRigPart(rig, HAND_PROP_PART_ID);
      part.toon?.dispose(true, false);
      container.dispose();
      anchor.dispose(false, false);
    },
  };
}
