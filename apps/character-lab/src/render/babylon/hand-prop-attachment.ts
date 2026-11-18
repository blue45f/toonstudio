/**
 * 캐릭터 3D 웹툰 소품 · 2인 듀오 스테이지(상대역 표정 MorphTarget + 전용 손소품) · 3D 효과음 스탬프 어태치먼트 로더:
 * - 상대역 전용 손 소품(`partId = 249`, `extra:duo-partner-prop`): 상대역 손 본 아래 `TS_DuoPartnerPropAnchor_*`
 * - 주 캐릭터 손 소품(`partId = 250`, `extra:hand-prop`): `rightHand` / `leftHand` 본 아래 `TS_HandPropAnchor_*`
 * - 머리 액세서리(`partId = 251`, `extra:head-prop`): `head` 본 아래 `TS_HeadPropAnchor_*`
 * - 배경 스테이지 스탠드(`partId = 252`, `extra:stage-prop`): `rig.root` 아래 `TS_StagePropAnchor_*`
 * - 3D 듀오 상대역 캐릭터(`partId = 220..`, `extra:duo-partner`): `rig.root` 아래 `TS_DuoPartnerAnchor_*`
 * - 3D 웹툰 효과음 스탬프(`partId = 254`, `extra:sfx-stamp`): `rig.root` 아래 `TS_SfxStampAnchor_*`
 */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";

import { OUTLINE_MESH_SUFFIX, failVisible, parseAuthoredHairMeshName } from "../../contracts";
import { sha256Hex } from "../../shared/hash";
import { ROLE_COLOR_KEY, ROLE_DEFAULT_PRESET, resolvePartColorHex } from "../material-presets";

import { attachExtraRigPart, detachExtraRigPart } from "./character-rig";
import { rigMeshMetadata } from "./mesh-binding";
import { loadCharacterAssetContainer } from "./package-loader";

import type { CharacterRig, RigPart } from "./character-rig";
import type {
  DuoPartnerAttachment,
  DuoPartnerExpressionPreset,
  DuoPartnerStance,
  HandPropAttachment,
  HandPropId,
  HandPropSide,
  HeadPropAttachment,
  PartRole,
  SfxStampAttachment,
  StagePropAttachment,
} from "../../contracts";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import type { Scene } from "@babylonjs/core/scene.js";

export const DUO_PARTNER_PART_ID = 220;
export const DUO_PARTNER_PART_KEY = "extra:duo-partner";

export const DUO_PARTNER_PROP_PART_ID = 249;
export const DUO_PARTNER_PROP_PART_KEY = "extra:duo-partner-prop";

export const HAND_PROP_PART_ID = 250;
export const HAND_PROP_PART_KEY = "extra:hand-prop";

export const HEAD_PROP_PART_ID = 251;
export const HEAD_PROP_PART_KEY = "extra:head-prop";

export const STAGE_PROP_PART_ID = 252;
export const STAGE_PROP_PART_KEY = "extra:stage-prop";

export const SFX_STAMP_PART_ID = 254;
export const SFX_STAMP_PART_KEY = "extra:sfx-stamp";

type LoadedContainer = Awaited<ReturnType<typeof loadCharacterAssetContainer>>;

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

export interface SfxStampHandle {
  readonly attachment: SfxStampAttachment;
  readonly part: RigPart;
  dispose(): void;
}

export interface DuoPartnerHandle {
  readonly attachment: DuoPartnerAttachment;
  readonly parts: readonly RigPart[];
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
  "imperial-scroll": {
    palmDelta: [0.016, -0.032, 0.01],
    eulerRight: [Math.PI * 0.48, -0.14, -0.08],
    eulerLeft: [Math.PI * 0.48, 0.14, 0.08],
    uniformScale: 1.05,
  },
  "jade-folding-fan": {
    palmDelta: [0.01, -0.026, 0.012],
    eulerRight: [Math.PI * 0.44, 0.24, -0.14],
    eulerLeft: [Math.PI * 0.44, -0.24, 0.14],
    uniformScale: 1.06,
  },
  "calling-card-rose": {
    palmDelta: [0.014, -0.024, 0.014],
    eulerRight: [Math.PI * 0.46, 0.18, -0.12],
    eulerLeft: [Math.PI * 0.46, -0.18, 0.12],
    uniformScale: 1.04,
  },
  "medical-chart-clipboard": {
    palmDelta: [0.018, -0.028, -0.012],
    eulerRight: [Math.PI * 0.47, -0.20, -0.10],
    eulerLeft: [Math.PI * 0.47, 0.20, 0.10],
    uniformScale: 1.02,
  },
  "idol-prism-lightstick": {
    palmDelta: [0.012, -0.032, 0.012],
    eulerRight: [Math.PI * 0.48, 0.12, -0.08],
    eulerLeft: [Math.PI * 0.48, -0.12, 0.08],
    uniformScale: 1.04,
  },
  "varsity-basketball": {
    palmDelta: [0.024, -0.052, 0.028],
    eulerRight: [Math.PI * 0.5, 0, 0],
    eulerLeft: [Math.PI * 0.5, 0, 0],
    uniformScale: 0.96,
  },
  "tactical-medkit-radio": {
    palmDelta: [0.014, -0.03, 0.012],
    eulerRight: [Math.PI * 0.47, 0.16, -0.1],
    eulerLeft: [Math.PI * 0.47, -0.16, 0.1],
    uniformScale: 1.04,
  },
  "artisan-drip-kettle": {
    palmDelta: [0.016, -0.036, 0.01],
    eulerRight: [Math.PI * 0.48, 0.08, -0.06],
    eulerLeft: [Math.PI * 0.48, -0.08, 0.06],
    uniformScale: 1.04,
  },
  "sacred-chalice-wand": {
    palmDelta: [0.01, -0.032, 0.01],
    eulerRight: [Math.PI * 0.5, 0.12, -0.06],
    eulerLeft: [Math.PI * 0.5, -0.12, 0.06],
    uniformScale: 1.05,
  },
};

const PARTNER_GRIP_RIGHT_ARM_DEG: Readonly<Record<HandPropId, { readonly upper: readonly [number, number, number]; readonly lower: readonly [number, number, number]; readonly hand: readonly [number, number, number] }>> = {
  smartphone: { upper: [14, 28, 60], lower: [32, 82, -26], hand: [18, 12, -8] },
  "coffee-cup": { upper: [10, 24, 62], lower: [12, 86, -24], hand: [6, 14, -10] },
  "case-folder": { upper: [12, 22, 62], lower: [24, 78, -18], hand: [10, 10, -6] },
  "aether-blade": { upper: [-8, 32, 48], lower: [-12, 68, -18], hand: [-14, 18, -12] },
  "imperial-scroll": { upper: [12, 26, 60], lower: [22, 80, -20], hand: [10, 12, -8] },
  "jade-folding-fan": { upper: [16, 28, 56], lower: [28, 86, -24], hand: [16, 16, -10] },
  "calling-card-rose": { upper: [18, 30, 54], lower: [30, 88, -22], hand: [14, 18, -8] },
  "medical-chart-clipboard": { upper: [14, 24, 60], lower: [26, 80, -20], hand: [12, 12, -8] },
  "idol-prism-lightstick": { upper: [18, 30, 52], lower: [34, 88, -22], hand: [14, 16, -8] },
  "varsity-basketball": { upper: [10, 22, 58], lower: [20, 74, -16], hand: [8, 10, -6] },
  "tactical-medkit-radio": { upper: [16, 28, 56], lower: [30, 84, -22], hand: [14, 14, -8] },
  "artisan-drip-kettle": { upper: [12, 24, 60], lower: [18, 84, -20], hand: [8, 12, -8] },
  "sacred-chalice-wand": { upper: [16, 28, 54], lower: [32, 86, -20], hand: [12, 16, -8] },
};

const PARTNER_EXPRESSION_WEIGHTS: Readonly<Record<DuoPartnerExpressionPreset, Readonly<Record<string, number>>>> = {
  neutral: {},
  "warm-smile": {
    mouthSmile: 0.78,
    eyeSquint: 0.36,
    browInnerUp: 0.22,
    HappyBrow: 0.58,
  },
  "cold-smirk": {
    mouthSmile: 0.42,
    eyeSquint: 0.3,
    browDown: 0.28,
    AngryBrow: 0.26,
  },
  shocked: {
    eyeWide: 0.82,
    jawOpen: 0.48,
    browInnerUp: 0.68,
    mouthFunnel: 0.26,
  },
  "stern-glare": {
    mouthFrown: 0.52,
    browDown: 0.72,
    eyeSquint: 0.28,
    AngryBrow: 0.68,
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

function computePartnerHandLocalPosition(
  container: LoadedContainer,
  handNode: TransformNode,
  hand: HandPropSide,
  propId: HandPropId,
): Vector3 {
  const middleNames = hand === "rightHand" ? ["mixamorig:RightHandMiddle1", "rightMiddleProximal"] : ["mixamorig:LeftHandMiddle1", "leftMiddleProximal"];
  const middleNode = container.transformNodes.find((n) => middleNames.includes(n.name));
  const signX = hand === "rightHand" ? -1 : 1;
  const spec = PROP_GRIP_SPECS[propId];
  if (middleNode && middleNode.parent === handNode && middleNode.position.length() > 0.01) {
    const base = middleNode.position.scale(0.56);
    return new Vector3(base.x + signX * spec.palmDelta[0], base.y + spec.palmDelta[1], base.z + spec.palmDelta[2]);
  }
  return new Vector3(signX * (0.062 + spec.palmDelta[0]), spec.palmDelta[1], spec.palmDelta[2]);
}

interface MountExtraGlbInput {
  readonly rig: CharacterRig;
  readonly glbUrl: string;
  readonly sha256: string | undefined;
  readonly labelId: string;
  readonly codePrefix: "hand-prop" | "head-prop" | "stage-prop" | "sfx-stamp" | "duo-partner" | "duo-partner-prop";
  readonly anchorName: string;
  readonly parentNode: TransformNode;
  readonly localPosition: Vector3;
  readonly localRotation: Quaternion;
  readonly uniformScale: number;
  readonly partId: number;
  readonly partKey: string;
  readonly deps: ScenePropLoadDeps;
  readonly filterPartnerMeshes?: boolean;
  readonly onContainerMounted?: (container: LoadedContainer) => void;
}

const PRIMITIVE_SUFFIX = /_primitive\d+$/u;

function stripPartnerBaseName(meshName: string): { readonly baseName: string; readonly isOutline: boolean } {
  let baseName = meshName.replace(PRIMITIVE_SUFFIX, "");
  const isOutline = baseName.endsWith(OUTLINE_MESH_SUFFIX);
  if (isOutline) baseName = baseName.slice(0, -OUTLINE_MESH_SUFFIX.length);
  return { baseName, isOutline };
}

function degToQuat(rxDeg: number, ryDeg: number, rzDeg: number): Quaternion {
  return Quaternion.FromEulerAngles((rxDeg * Math.PI) / 180, (ryDeg * Math.PI) / 180, (rzDeg * Math.PI) / 180);
}

function applyDuoPartnerConversationalPose(
  container: LoadedContainer,
  stance: DuoPartnerStance,
  side: "left" | "right",
  heldProp?: { readonly propId: HandPropId; readonly hand: HandPropSide } | null,
): void {
  const turnSign = side === "right" ? -1 : 1;
  const poseByBone = new Map<string, Quaternion>();
  const setBone = (names: readonly string[], rx: number, ry: number, rz: number): void => {
    const q = degToQuat(rx, ry, rz);
    for (const n of names) poseByBone.set(n, q);
  };

  if (stance === "arms-crossed") {
    setBone(["mixamorig:Spine1", "chest"], -2, turnSign * 6, 0);
    setBone(["mixamorig:Neck", "neck"], 2, turnSign * 8, 0);
    setBone(["mixamorig:Head", "head"], 3, turnSign * 12, turnSign * 2);
    setBone(["mixamorig:RightArm", "rightUpperArm"], 20, 26, 62);
    setBone(["mixamorig:RightForeArm", "rightLowerArm"], 24, 76, -16);
    setBone(["mixamorig:LeftArm", "leftUpperArm"], 18, -26, -62);
    setBone(["mixamorig:LeftForeArm", "leftLowerArm"], 24, -76, 16);
  } else if (stance === "attentive") {
    setBone(["mixamorig:Spine1", "chest"], 2, turnSign * 5, 0);
    setBone(["mixamorig:Neck", "neck"], 4, turnSign * 9, turnSign * 2);
    setBone(["mixamorig:Head", "head"], 5, turnSign * 14, turnSign * 3);
    setBone(["mixamorig:RightArm", "rightUpperArm"], 14, 22, 60);
    setBone(["mixamorig:RightForeArm", "rightLowerArm"], 22, 68, -20);
    setBone(["mixamorig:LeftArm", "leftUpperArm"], 6, -12, -68);
    setBone(["mixamorig:LeftForeArm", "leftLowerArm"], 8, -18, 6);
  } else {
    setBone(["mixamorig:Hips", "hips"], 0, turnSign * 4, 0);
    setBone(["mixamorig:Spine1", "chest"], -2, turnSign * 5, 0);
    setBone(["mixamorig:Neck", "neck"], 2, turnSign * 8, 0);
    setBone(["mixamorig:Head", "head"], 3, turnSign * 12, turnSign * 2);
    setBone(["mixamorig:RightArm", "rightUpperArm"], 6, 12, 66);
    setBone(["mixamorig:RightForeArm", "rightLowerArm"], 10, 22, -8);
    setBone(["mixamorig:RightHand", "rightHand"], 0, 8, 6);
    setBone(["mixamorig:LeftArm", "leftUpperArm"], 6, -12, -66);
    setBone(["mixamorig:LeftForeArm", "leftLowerArm"], 10, -22, 8);
    setBone(["mixamorig:LeftHand", "leftHand"], 0, -8, -6);
  }

  if (heldProp) {
    const grip = PARTNER_GRIP_RIGHT_ARM_DEG[heldProp.propId];
    if (heldProp.hand === "rightHand") {
      setBone(["mixamorig:RightArm", "rightUpperArm"], grip.upper[0], grip.upper[1], grip.upper[2]);
      setBone(["mixamorig:RightForeArm", "rightLowerArm"], grip.lower[0], grip.lower[1], grip.lower[2]);
      setBone(["mixamorig:RightHand", "rightHand"], grip.hand[0], grip.hand[1], grip.hand[2]);
    } else {
      setBone(["mixamorig:LeftArm", "leftUpperArm"], grip.upper[0], -grip.upper[1], -grip.upper[2]);
      setBone(["mixamorig:LeftForeArm", "leftLowerArm"], grip.lower[0], -grip.lower[1], -grip.lower[2]);
      setBone(["mixamorig:LeftHand", "leftHand"], grip.hand[0], -grip.hand[1], -grip.hand[2]);
    }
  }

  for (const node of container.transformNodes) {
    const rot = poseByBone.get(node.name);
    if (rot) {
      const rest = node.rotationQuaternion ? node.rotationQuaternion.clone() : node.rotation.toQuaternion();
      node.rotationQuaternion = rest.multiply(rot).normalize();
    }
  }
  for (const node of container.transformNodes) {
    node.computeWorldMatrix(true);
  }
  for (const skeleton of container.skeletons) {
    skeleton.useTextureToStoreBoneMatrices = true;
    skeleton.prepare(true);
  }
}

function applyDuoPartnerExpressionMorphs(container: LoadedContainer, expression: DuoPartnerExpressionPreset): void {
  const weights = PARTNER_EXPRESSION_WEIGHTS[expression] ?? PARTNER_EXPRESSION_WEIGHTS.neutral;
  const knownKeys = new Set<string>([
    "mouthSmile",
    "mouthFrown",
    "jawOpen",
    "mouthPucker",
    "mouthFunnel",
    "eyeBlinkLeft",
    "eyeBlinkRight",
    "eyeWide",
    "eyeSquint",
    "browInnerUp",
    "browDown",
    "cheekPuff",
    "HappyBrow",
    "AngryBrow",
  ]);
  for (const abstract of container.meshes) {
    if (!(abstract instanceof Mesh)) continue;
    const manager = abstract.morphTargetManager;
    if (!manager) continue;
    manager.useTextureToStoreTargets = true;
    for (let i = 0; i < manager.numTargets; i += 1) {
      const target = manager.getTarget(i);
      const rawName = target.name;
      const stripped = rawName.startsWith("facs:") ? rawName.slice(5) : rawName;
      if (stripped in weights) {
        target.influence = weights[stripped] ?? 0;
      } else if (knownKeys.has(stripped)) {
        target.influence = 0;
      }
    }
  }
}

async function mountExtraPropPart(input: MountExtraGlbInput): Promise<{ readonly part: RigPart; readonly dispose: () => void }> {
  const now = input.deps.now ?? Date.now();
  const bytes = await input.deps.fetchBytes(input.glbUrl);
  if ((input.deps.verifyIntegrity ?? true) && input.sha256) {
    const digest = await sha256Hex(bytes);
    if (digest !== input.sha256) {
      throw failVisible(
        `${input.codePrefix}-sha-mismatch`,
        `3D 에셋('${input.labelId}') GLB 해시가 일치하지 않습니다(${digest.slice(0, 8)}… ≠ ${input.sha256.slice(0, 8)}…).`,
        undefined,
        now,
      );
    }
  }

  let container: LoadedContainer;
  try {
    container = await loadCharacterAssetContainer(bytes, input.deps.scene);
  } catch (error) {
    throw failVisible(`${input.codePrefix}-glb-load-failed`, `3D 에셋 GLB를 열지 못했습니다: ${input.glbUrl}`, error, now);
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

  input.onContainerMounted?.(container);

  const meshes: Mesh[] = [];
  const outlineMeshes: Mesh[] = [];
  for (const abstract of container.meshes) {
    if (!(abstract instanceof Mesh) || abstract.getTotalVertices() === 0) continue;
    if (input.filterPartnerMeshes) {
      const { baseName, isOutline } = stripPartnerBaseName(abstract.name);
      const hair = parseAuthoredHairMeshName(baseName);
      if (hair && hair.lod > 0) {
        abstract.isVisible = false;
        continue;
      }
      if (isOutline) {
        abstract.isVisible = false;
        outlineMeshes.push(abstract);
        continue;
      }
    }
    meshes.push(abstract);
  }
  if (meshes.length === 0) {
    container.dispose();
    anchor.dispose(false, false);
    throw failVisible(`${input.codePrefix}-empty-mesh`, `3D 에셋('${input.labelId}') GLB에 유효한 메쉬가 없습니다.`, undefined, now);
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
  for (const outline of outlineMeshes) {
    outline.metadata = rigMeshMetadata(input.partId, role, input.partId, true);
  }

  const colorKey = ROLE_COLOR_KEY[role];
  const materialPreset = ROLE_DEFAULT_PRESET[role];
  const hasAlbedoTexture = meshPbrs.some((mat) => mat.albedoTexture !== null);
  const untintedHex = hasAlbedoTexture
    ? "#ffffff"
    : pbr.albedoColor
      ? pbr.albedoColor.toHexString().slice(0, 7).toLowerCase()
      : resolvePartColorHex({ materialPreset, ...(colorKey !== undefined ? { colorKey } : {}) }, null);
  const part: RigPart = {
    id: input.partKey,
    partId: input.partId,
    materialId: input.partId,
    role,
    materialPreset,
    ...(colorKey !== undefined ? { colorKey } : {}),
    meshes,
    outlineMeshes,
    pbr,
    meshPbrs,
    hasAlbedoTexture,
    toon: null,
    colorHex: untintedHex,
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

export async function attachSfxStampToRig(
  rig: CharacterRig,
  attachment: SfxStampAttachment,
  deps: ScenePropLoadDeps,
): Promise<SfxStampHandle> {
  const mounted = await mountExtraPropPart({
    rig,
    glbUrl: attachment.glbUrl,
    sha256: attachment.sha256,
    labelId: attachment.stampId,
    codePrefix: "sfx-stamp",
    anchorName: `TS_SfxStampAnchor_${attachment.stampId}`,
    parentNode: rig.root,
    localPosition: Vector3.Zero(),
    localRotation: Quaternion.Identity(),
    uniformScale: 1.0,
    partId: SFX_STAMP_PART_ID,
    partKey: SFX_STAMP_PART_KEY,
    deps,
  });
  return { attachment, part: mounted.part, dispose: mounted.dispose };
}

export async function attachDuoPartnerToRig(
  rig: CharacterRig,
  attachment: DuoPartnerAttachment,
  deps: ScenePropLoadDeps,
): Promise<DuoPartnerHandle> {
  const now = deps.now ?? Date.now();
  const bytes = await deps.fetchBytes(attachment.glbUrl);
  if ((deps.verifyIntegrity ?? true) && attachment.sha256) {
    const digest = await sha256Hex(bytes);
    if (digest !== attachment.sha256) {
      throw failVisible(
        "duo-partner-sha-mismatch",
        `3D 상대역('${attachment.characterId}') GLB 해시가 일치하지 않습니다(${digest.slice(0, 8)}… ≠ ${attachment.sha256.slice(0, 8)}…).`,
        undefined,
        now,
      );
    }
  }

  let container: LoadedContainer;
  try {
    container = await loadCharacterAssetContainer(bytes, deps.scene);
  } catch (error) {
    throw failVisible("duo-partner-glb-load-failed", `3D 상대역 GLB를 열지 못했습니다: ${attachment.glbUrl}`, error, now);
  }

  container.addAllToScene();
  const sideSign = attachment.side === "right" ? 1 : -1;
  const safeDist = Number.isFinite(attachment.distanceMeters) ? Math.min(1.6, Math.max(0.45, attachment.distanceMeters)) : 0.95;
  const xOffset = sideSign * Math.min(1.02, Math.max(0.54, safeDist * 0.70));
  const yawRad = (-sideSign * 24 * Math.PI) / 180;
  const safeScale = Number.isFinite(attachment.heightScale) ? Math.min(1.32, Math.max(0.72, attachment.heightScale)) : 1.0;
  const stance: DuoPartnerStance = attachment.stance ?? "conversational";
  const expression: DuoPartnerExpressionPreset = attachment.expression ?? "neutral";
  const resolvedPartnerHand: HandPropSide = attachment.handProp?.hand ?? (attachment.side === "right" ? "leftHand" : "rightHand");

  const anchor = new TransformNode(`TS_DuoPartnerAnchor_${attachment.characterId}`, deps.scene);
  anchor.parent = rig.root;
  anchor.position = new Vector3(xOffset, 0, -0.22);
  anchor.rotationQuaternion = Quaternion.FromEulerAngles(0, yawRad, 0);
  anchor.scaling.setAll(safeScale);

  for (const rootNode of container.rootNodes) {
    if (rootNode instanceof TransformNode) rootNode.parent = anchor;
  }

  applyDuoPartnerConversationalPose(
    container,
    stance,
    attachment.side,
    attachment.handProp ? { propId: attachment.handProp.propId, hand: resolvedPartnerHand } : null,
  );
  applyDuoPartnerExpressionMorphs(container, expression);

  const groupsByMat = new Map<unknown, { meshes: Mesh[]; outlines: Mesh[] }>();
  for (const abstract of container.meshes) {
    if (!(abstract instanceof Mesh) || abstract.getTotalVertices() === 0) continue;
    const { baseName, isOutline } = stripPartnerBaseName(abstract.name);
    const hair = parseAuthoredHairMeshName(baseName);
    if (hair && hair.lod > 0) {
      abstract.isVisible = false;
      continue;
    }
    if (isOutline) {
      abstract.isVisible = false;
      continue;
    }
    const key = abstract.material ?? abstract;
    const group = groupsByMat.get(key) ?? { meshes: [], outlines: [] };
    group.meshes.push(abstract);
    groupsByMat.set(key, group);
  }

  if (groupsByMat.size === 0) {
    container.dispose();
    anchor.dispose(false, false);
    throw failVisible("duo-partner-empty-mesh", `3D 상대역('${attachment.characterId}') GLB에 유효한 메쉬가 없습니다.`, undefined, now);
  }

  const role: PartRole = "accessory";
  const materialPreset = ROLE_DEFAULT_PRESET[role];
  const createdParts: RigPart[] = [];
  let idx = 0;
  for (const group of groupsByMat.values()) {
    const partId = DUO_PARTNER_PART_ID + idx;
    const partKey = idx === 0 ? DUO_PARTNER_PART_KEY : `${DUO_PARTNER_PART_KEY}:${idx}`;
    const firstMesh = group.meshes[0]!;
    const pbr = deps.adaptMaterial(role, firstMesh);
    for (const mesh of group.meshes) {
      mesh.material = pbr;
      mesh.metadata = rigMeshMetadata(partId, role, partId, false);
      mesh.receiveShadows = true;
      mesh.computeWorldMatrix(true);
    }
    const hasAlbedoTexture = pbr.albedoTexture !== null;
    const colorHex = hasAlbedoTexture
      ? "#ffffff"
      : pbr.albedoColor
        ? pbr.albedoColor.toHexString().slice(0, 7).toLowerCase()
        : "#d4af37";
    const part: RigPart = {
      id: partKey,
      partId,
      materialId: partId,
      role,
      materialPreset,
      meshes: group.meshes,
      outlineMeshes: [],
      pbr,
      meshPbrs: group.meshes.map(() => pbr),
      hasAlbedoTexture,
      toon: null,
      colorHex,
      visible: true,
      forceHidden: false,
    };
    attachExtraRigPart(rig, part);
    createdParts.push(part);
    idx += 1;
  }

  let partnerPropDispose: (() => void) | null = null;
  if (attachment.handProp) {
    const handNodeNames =
      resolvedPartnerHand === "rightHand"
        ? ["mixamorig:RightHand", "rightHand"]
        : ["mixamorig:LeftHand", "leftHand"];
    const partnerHandNode = container.transformNodes.find((n) => handNodeNames.includes(n.name)) ?? null;
    const gripSpec = PROP_GRIP_SPECS[attachment.handProp.propId];
    const [rx, ry, rz] = resolvedPartnerHand === "rightHand" ? gripSpec.eulerRight : gripSpec.eulerLeft;
    try {
      const mountedProp = await mountExtraPropPart({
        rig,
        glbUrl: attachment.handProp.glbUrl,
        sha256: attachment.handProp.sha256,
        labelId: attachment.handProp.propId,
        codePrefix: "duo-partner-prop",
        anchorName: `TS_DuoPartnerPropAnchor_${attachment.handProp.propId}`,
        parentNode: partnerHandNode ?? anchor,
        localPosition: partnerHandNode
          ? computePartnerHandLocalPosition(container, partnerHandNode, resolvedPartnerHand, attachment.handProp.propId)
          : new Vector3(0.24, 1.12, 0.2),
        localRotation: Quaternion.FromEulerAngles(rx, ry, rz),
        uniformScale: gripSpec.uniformScale,
        partId: DUO_PARTNER_PROP_PART_ID,
        partKey: DUO_PARTNER_PROP_PART_KEY,
        deps,
      });
      createdParts.push(mountedProp.part);
      partnerPropDispose = mountedProp.dispose;
    } catch (error) {
      for (const p of createdParts) {
        detachExtraRigPart(rig, p.partId);
        p.toon?.dispose(true, false);
      }
      container.dispose();
      anchor.dispose(false, false);
      throw error;
    }
  }

  anchor.computeWorldMatrix(true);

  let disposed = false;
  return {
    attachment,
    parts: createdParts,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      partnerPropDispose?.();
      for (const p of createdParts) {
        if (p.partId === DUO_PARTNER_PROP_PART_ID) continue;
        detachExtraRigPart(rig, p.partId);
        p.toon?.dispose(true, false);
      }
      container.dispose();
      anchor.dispose(false, false);
    },
  };
}
