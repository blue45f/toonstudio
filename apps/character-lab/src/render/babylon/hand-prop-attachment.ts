/**
 * 캐릭터 3D 웹툰 소품 어태치먼트 로더:
 * - 손 소품(`partId = 250`, `extra:hand-prop`): `rightHand` / `leftHand` 본 아래 `TS_HandPropAnchor_*`
 * - 머리 액세서리(`partId = 251`, `extra:head-prop`): `head` 본 아래 `TS_HeadPropAnchor_*`
 * - 배경 스테이지 스탠드(`partId = 252`, `extra:stage-prop`): `rig.root` 아래 `TS_StagePropAnchor_*`
 *
 * GLB는 제작 패키지와 같은 공용 로더로 연다.
 *
 * 세 슬롯 모두 `rig.root` 하위 트리에 속하고 `rig.parts`(`role = "accessory"`)에 독립 등록되므로:
 * 1) 손 소품 + 머리 액세서리 + 배경 스테이지 프롭 3종 동시 장착 지원
 * 2) 뷰포트 PBR 및 툰 셰이딩(외곽선·림라이트·망점 스크린톤 포함) 자동 적용
 * 3) 투명 PNG · 4방향 설정시트 · 2×2 시트 · 세로 4컷 웹툰 스트립 캡처 자동 포함
 * 4) `exportGlb()` 실행 시 캐릭터 메쉬·골격과 함께 장착된 모든 3D 소품 메쉬가 단일 GLB로 직렬화 보존됨
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
import type {
  HandPropAttachment,
  HandPropId,
  HandPropSide,
  HeadPropAttachment,
  PartRole,
  StagePropAttachment,
} from "../../contracts";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import type { Scene } from "@babylonjs/core/scene.js";

/** 기존 캐릭터 파츠(1..32)와 충돌하지 않는 씬 소품 전용 고정 partId */
export const HAND_PROP_PART_ID = 250;
export const HAND_PROP_PART_KEY = "extra:hand-prop";

export const HEAD_PROP_PART_ID = 251;
export const HEAD_PROP_PART_KEY = "extra:head-prop";

export const STAGE_PROP_PART_ID = 252;
export const STAGE_PROP_PART_KEY = "extra:stage-prop";

export interface ScenePropLoadDeps {
  readonly scene: Scene;
  readonly fetchBytes: (url: string) => Promise<Uint8Array>;
  readonly adaptMaterial: (role: PartRole, mesh: Mesh) => PBRMaterial;
  readonly verifyIntegrity?: boolean;
  readonly now?: number;
}

export type HandPropLoadDeps = ScenePropLoadDeps;

export interface HandPropHandle {
  readonly attachment: HandPropAttachment;
  readonly part: RigPart;
  dispose(): void;
}

export interface HeadPropHandle {
  readonly attachment: HeadPropAttachment;
  readonly part: RigPart;
  dispose(): void;
}

export interface StagePropHandle {
  readonly attachment: StagePropAttachment;
  readonly part: RigPart;
  dispose(): void;
}

interface GripTransformSpec {
  readonly palmDelta: readonly [number, number, number];
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

interface MountExtraGlbInput {
  readonly rig: CharacterRig;
  readonly glbUrl: string;
  readonly sha256: string | undefined;
  readonly labelId: string;
  readonly codePrefix: "hand-prop" | "head-prop" | "stage-prop";
  readonly anchorName: string;
  readonly parentNode: TransformNode;
  readonly localPosition: Vector3;
  readonly localRotation: Quaternion;
  readonly uniformScale: number;
  readonly partId: number;
  readonly partKey: string;
  readonly deps: ScenePropLoadDeps;
}

async function mountExtraPropPart(input: MountExtraGlbInput): Promise<{ readonly part: RigPart; readonly dispose: () => void }> {
  const now = input.deps.now ?? Date.now();
  const bytes = await input.deps.fetchBytes(input.glbUrl);
  if ((input.deps.verifyIntegrity ?? true) && input.sha256) {
    const digest = await sha256Hex(bytes);
    if (digest !== input.sha256) {
      throw failVisible(
        `${input.codePrefix}-sha-mismatch`,
        `3D 소품('${input.labelId}') GLB 해시가 일치하지 않습니다(${digest.slice(0, 8)}… ≠ ${input.sha256.slice(0, 8)}…).`,
        undefined,
        now,
      );
    }
  }

  let container: Awaited<ReturnType<typeof loadGlbAssetContainer>>;
  try {
    container = await loadGlbAssetContainer(bytes, input.deps.scene);
  } catch (error) {
    throw failVisible(`${input.codePrefix}-glb-load-failed`, `3D 소품 GLB를 열지 못했습니다: ${input.glbUrl}`, error, now);
  }

  container.addAllToScene();
  const anchor = new TransformNode(input.anchorName, input.deps.scene);
  anchor.parent = input.parentNode;
  anchor.position = input.localPosition;
  anchor.rotationQuaternion = input.localRotation;
  anchor.scaling.setAll(input.uniformScale);

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
    throw failVisible(`${input.codePrefix}-empty-mesh`, `3D 소품('${input.labelId}') GLB에 유효한 메쉬가 없습니다.`, undefined, now);
  }

  const role: PartRole = "accessory";
  const firstMesh = meshes[0]!;
  const pbr = input.deps.adaptMaterial(role, firstMesh);
  const meshPbrs: PBRMaterial[] = [];
  for (const mesh of meshes) {
    const meshPbr = mesh === firstMesh || mesh.material === firstMesh.material ? pbr : input.deps.adaptMaterial(role, mesh);
    mesh.material = meshPbr;
    meshPbrs.push(meshPbr);
    mesh.metadata = rigMeshMetadata(input.partId, role, input.partId, false);
    mesh.receiveShadows = true;
  }

  const colorKey = ROLE_COLOR_KEY[role];
  const materialPreset = ROLE_DEFAULT_PRESET[role];
  const hasAlbedoTexture = meshPbrs.some((mat) => mat.albedoTexture !== null);
  const part: RigPart = {
    id: input.partKey,
    partId: input.partId,
    materialId: input.partId,
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

  attachExtraRigPart(input.rig, part);
  anchor.computeWorldMatrix(true);
  for (const mesh of meshes) mesh.computeWorldMatrix(true);

  let disposed = false;
  return {
    part,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      detachExtraRigPart(input.rig, input.partId);
      part.toon?.dispose(true, false);
      container.dispose();
      anchor.dispose(false, false);
    },
  };
}

export async function attachHandPropToRig(
  rig: CharacterRig,
  attachment: HandPropAttachment,
  deps: ScenePropLoadDeps,
): Promise<HandPropHandle> {
  const handBone = rig.humanoid.get(attachment.hand);
  const spec = PROP_GRIP_SPECS[attachment.propId];
  const [rx, ry, rz] = attachment.hand === "rightHand" ? spec.eulerRight : spec.eulerLeft;
  const mounted = await mountExtraPropPart({
    rig,
    glbUrl: attachment.glbUrl,
    sha256: attachment.sha256,
    labelId: attachment.propId,
    codePrefix: "hand-prop",
    anchorName: `TS_HandPropAnchor_${attachment.propId}`,
    parentNode: handBone ? handBone.node : rig.root,
    localPosition: handBone ? computePalmLocalPosition(rig, attachment.hand, attachment.propId) : new Vector3(0.28, 1.12, 0.22),
    localRotation: Quaternion.FromEulerAngles(rx, ry, rz),
    uniformScale: spec.uniformScale,
    partId: HAND_PROP_PART_ID,
    partKey: HAND_PROP_PART_KEY,
    deps,
  });
  return { attachment, part: mounted.part, dispose: mounted.dispose };
}

export async function attachHeadPropToRig(
  rig: CharacterRig,
  attachment: HeadPropAttachment,
  deps: ScenePropLoadDeps,
): Promise<HeadPropHandle> {
  const headBone = rig.humanoid.get("head");
  const mounted = await mountExtraPropPart({
    rig,
    glbUrl: attachment.glbUrl,
    sha256: attachment.sha256,
    labelId: attachment.propId,
    codePrefix: "head-prop",
    anchorName: `TS_HeadPropAnchor_${attachment.propId}`,
    parentNode: headBone ? headBone.node : rig.root,
    localPosition: headBone ? Vector3.Zero() : new Vector3(0, 1.48, 0),
    localRotation: Quaternion.Identity(),
    uniformScale: 1.0,
    partId: HEAD_PROP_PART_ID,
    partKey: HEAD_PROP_PART_KEY,
    deps,
  });
  return { attachment, part: mounted.part, dispose: mounted.dispose };
}

export async function attachStagePropToRig(
  rig: CharacterRig,
  attachment: StagePropAttachment,
  deps: ScenePropLoadDeps,
): Promise<StagePropHandle> {
  const mounted = await mountExtraPropPart({
    rig,
    glbUrl: attachment.glbUrl,
    sha256: attachment.sha256,
    labelId: attachment.propId,
    codePrefix: "stage-prop",
    anchorName: `TS_StagePropAnchor_${attachment.propId}`,
    parentNode: rig.root,
    localPosition: Vector3.Zero(),
    localRotation: Quaternion.Identity(),
    uniformScale: 1.0,
    partId: STAGE_PROP_PART_ID,
    partKey: STAGE_PROP_PART_KEY,
    deps,
  });
  return { attachment, part: mounted.part, dispose: mounted.dispose };
}
