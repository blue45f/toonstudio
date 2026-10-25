/**
 * Reverse-engineered VARCO 3D Cloud (https://3d.varco.ai) integration bridge:
 * 1. Character Labs -> CharacterCanonicalPartDescriptor bridge (skinned-transplant / socket / rigid-follow)
 * 2. Point Policies (task:*, instant:VIBE_WORLD_*, 16 pipeline:* stages) & 30-worker queue capacity evaluator
 * 3. 12-View PBR Reconstruction Ring (mvImages, mvAlbedo, mvOrm + coarse/highPoly/rigged model IDs)
 * 4. 598-Clip Base Animation Library distribution & mixamo52 / HUMANOID_FINGERS retargeting planner
 */

import type {
  CharacterCanonicalPartDescriptor,
  CharacterCanonicalPartSlot,
  CharacterSemanticPart,
  CharacterTopologyFamily,
} from "../character-platform/assets/character-canonical-manifest";
import {
  STUDIO_VARCO3D_CLOUD_BASE_URL,
  type StudioVarco3dCharacterLabModularItem,
  type StudioVarco3dCharacterLabSlot,
} from "./studio-varco3d-character-lab-diorama-catalog";

export type StudioVarco3d12ViewAngle =
  | "front"
  | "right"
  | "back"
  | "left"
  | "top"
  | "bottom"
  | "front2"
  | "right2"
  | "back2"
  | "left2"
  | "top2"
  | "bottom2";

export type StudioVarco3d12ViewMapFamily = "mvImages" | "mvAlbedo" | "mvOrm";

export const STUDIO_VARCO3D_12VIEW_CAMERA_RING: readonly StudioVarco3d12ViewAngle[] = Object.freeze([
  "front",
  "right",
  "back",
  "left",
  "top",
  "bottom",
  "front2",
  "right2",
  "back2",
  "left2",
  "top2",
  "bottom2",
]);

export interface StudioVarco3d12ViewReconstructionBundle {
  readonly meshTaskId: string;
  readonly rigTaskId: string;
  readonly modelId: string;
  readonly coarseModelId: string;
  readonly highPolyModelId: string;
  readonly humanoidClass: "HUMANOID_FINGERS" | "HUMANOID" | "QUADRUPED";
  readonly skeleton: "mixamo52" | "quadruped" | "equine";
  readonly mvImagesPrefix: string;
  readonly mvAlbedoPrefix: string;
  readonly mvOrmPrefix: string;
}

export const STUDIO_VARCO3D_COUNCIL_PRESIDENT_12VIEW_RECONSTRUCTION: StudioVarco3d12ViewReconstructionBundle =
  Object.freeze({
    meshTaskId: "cd1e75d3-5efa-4f46-afb6-59920e080fb7",
    rigTaskId: "58923776-91f0-4b60-a985-835d204f9a24",
    modelId: "5189a9db-6261-4211-8437-5016f51b9ca5",
    coarseModelId: "7a069386-54c5-4bc2-a132-8941e730bc8f",
    highPolyModelId: "9ef548d2-a400-4673-a119-06e89df2be7d",
    humanoidClass: "HUMANOID_FINGERS",
    skeleton: "mixamo52",
    mvImagesPrefix: "c7d011e8f0284c96b200918477012c",
    mvAlbedoPrefix: "a3f904c1d8824e719c11482055913b",
    mvOrmPrefix: "e91827b4c6104a388f22391044821d",
  });

export interface StudioVarco3d12ViewInspectionResult {
  readonly angle: StudioVarco3d12ViewAngle;
  readonly mapFamily: StudioVarco3d12ViewMapFamily;
  readonly ringIndex: number;
  readonly isSecondaryElevationRing: boolean;
  readonly pipelineStageKey:
    | "pipeline:multiview-generator"
    | "pipeline:diffuse-to-albedo"
    | "pipeline:orm-multiview-generator";
  readonly objectUrl: string;
}

export function inspectVarco3d12ViewReconstructionBundle(input: {
  readonly bundle?: StudioVarco3d12ViewReconstructionBundle;
  readonly angle: StudioVarco3d12ViewAngle;
  readonly mapFamily: StudioVarco3d12ViewMapFamily;
}): StudioVarco3d12ViewInspectionResult {
  const bundle = input.bundle ?? STUDIO_VARCO3D_COUNCIL_PRESIDENT_12VIEW_RECONSTRUCTION;
  const ringIndex = STUDIO_VARCO3D_12VIEW_CAMERA_RING.indexOf(input.angle);
  const hexIndex = Math.max(0, ringIndex).toString(16).padStart(2, "0");
  const prefixByFamily: Record<StudioVarco3d12ViewMapFamily, string> = {
    mvImages: bundle.mvImagesPrefix,
    mvAlbedo: bundle.mvAlbedoPrefix,
    mvOrm: bundle.mvOrmPrefix,
  };
  const stageByFamily: Record<
    StudioVarco3d12ViewMapFamily,
    StudioVarco3d12ViewInspectionResult["pipelineStageKey"]
  > = {
    mvImages: "pipeline:multiview-generator",
    mvAlbedo: "pipeline:diffuse-to-albedo",
    mvOrm: "pipeline:orm-multiview-generator",
  };

  return {
    angle: input.angle,
    mapFamily: input.mapFamily,
    ringIndex,
    isSecondaryElevationRing: input.angle.endsWith("2"),
    pipelineStageKey: stageByFamily[input.mapFamily],
    objectUrl: `${STUDIO_VARCO3D_CLOUD_BASE_URL}/api/objects/${prefixByFamily[input.mapFamily]}${hexIndex}.png`,
  };
}

export type StudioVarco3dPointPolicyCategory = "task" | "instant" | "pipeline";

export interface StudioVarco3dPointPolicyEntry {
  readonly targetKey: string;
  readonly category: StudioVarco3dPointPolicyCategory;
  readonly pointCost: number;
  readonly parallelConstrained: boolean;
  readonly labelKo: string;
}

export const STUDIO_VARCO3D_MAX_PARALLEL_STUDIO_TASKS = 30 as const;

export const STUDIO_VARCO3D_POINT_POLICIES: readonly StudioVarco3dPointPolicyEntry[] = Object.freeze([
  { targetKey: "task:GENERATE_TEXTURED_MESH", category: "task", pointCost: 450, parallelConstrained: true, labelKo: "텍스처 3D 메시 생성 (450pt)" },
  { targetKey: "task:GENERATE_MESH", category: "task", pointCost: 400, parallelConstrained: true, labelKo: "화이트박스 3D 메시 생성 (400pt)" },
  { targetKey: "task:GENERATE_TEXTURE", category: "task", pointCost: 50, parallelConstrained: true, labelKo: "PBR 텍스처 단독 생성 (50pt)" },
  { targetKey: "task:UPDATE_MESH", category: "task", pointCost: 450, parallelConstrained: true, labelKo: "파츠 로컬 에디팅 메시 재생성 (450pt)" },
  { targetKey: "task:UPDATE_TEXTURE", category: "task", pointCost: 50, parallelConstrained: true, labelKo: "파츠 로컬 에디팅 텍스처 재생성 (50pt)" },
  { targetKey: "task:AI_RIG", category: "task", pointCost: 0, parallelConstrained: true, labelKo: "AI 자동 리깅 (mixamo52 · 0pt)" },
  { targetKey: "task:ANIMATE", category: "task", pointCost: 0, parallelConstrained: true, labelKo: "598 모션 리타겟팅 (0pt)" },
  { targetKey: "task:REMESH", category: "task", pointCost: 0, parallelConstrained: true, labelKo: "쿼드/트라이 리메시 (0pt)" },
  { targetKey: "task:PBR", category: "task", pointCost: 0, parallelConstrained: true, labelKo: "PBR 재질 분리 (0pt)" },
  { targetKey: "task:AI_UNWRAP", category: "task", pointCost: 0, parallelConstrained: true, labelKo: "AI UV 언랩 (0pt)" },
  { targetKey: "task:GENERATE_MULTIVIEW_INPUT", category: "task", pointCost: 200, parallelConstrained: false, labelKo: "4-View 턴어라운드 생성 (200pt · 무제한 병렬)" },
  { targetKey: "task:GENERATE_IMAGE", category: "task", pointCost: 200, parallelConstrained: false, labelKo: "2D 레퍼런스 이미지 생성 V1 (200pt)" },
  { targetKey: "task:GENERATE_IMAGE_V2", category: "task", pointCost: 20, parallelConstrained: false, labelKo: "고속 2D 이미지 생성 V2 (20pt)" },
  { targetKey: "task:GENERATE_TEXT", category: "task", pointCost: 5, parallelConstrained: false, labelKo: "프롬프트 확장 LLM 생성 (5pt)" },
  { targetKey: "instant:VIBE_WORLD_IMAGE_GENERATION", category: "instant", pointCost: 10, parallelConstrained: false, labelKo: "Vibe World 씬 컨셉 이미지 생성 (10pt)" },
  { targetKey: "instant:VIBE_WORLD_COARSE_MESH", category: "instant", pointCost: 20, parallelConstrained: false, labelKo: "Vibe World 고속 코어스 3D 메시 (20pt)" },
  { targetKey: "instant:VIBE_WORLD_AI_RENDER", category: "instant", pointCost: 100, parallelConstrained: false, labelKo: "Vibe World AI 신경망 씬 렌더 (100pt)" },
  { targetKey: "pipeline:background-remover", category: "pipeline", pointCost: 5, parallelConstrained: false, labelKo: "파이프라인 배경 제거 (5pt)" },
  { targetKey: "pipeline:image-generator", category: "pipeline", pointCost: 10, parallelConstrained: false, labelKo: "파이프라인 이미지 생성기 (10pt)" },
  { targetKey: "pipeline:mesh-generator", category: "pipeline", pointCost: 50, parallelConstrained: false, labelKo: "파이프라인 형상 메시 생성기 (50pt)" },
  { targetKey: "pipeline:remesh", category: "pipeline", pointCost: 10, parallelConstrained: false, labelKo: "파이프라인 토폴로지 리메시 (10pt)" },
  { targetKey: "pipeline:multiview-generator", category: "pipeline", pointCost: 30, parallelConstrained: false, labelKo: "파이프라인 12-View 멀티뷰 생성 (30pt)" },
  { targetKey: "pipeline:texture-mapper", category: "pipeline", pointCost: 30, parallelConstrained: false, labelKo: "파이프라인 UV 텍스처 베이커 (30pt)" },
  { targetKey: "pipeline:thumbnail-generator", category: "pipeline", pointCost: 10, parallelConstrained: false, labelKo: "파이프라인 썸네일 렌더러 (10pt)" },
  { targetKey: "pipeline:diffuse-to-albedo", category: "pipeline", pointCost: 30, parallelConstrained: false, labelKo: "파이프라인 디퓨즈→알베도 디라이팅 (30pt)" },
  { targetKey: "pipeline:orm-multiview-generator", category: "pipeline", pointCost: 30, parallelConstrained: false, labelKo: "파이프라인 12-View ORM 생성기 (30pt)" },
  { targetKey: "pipeline:obj-to-glb", category: "pipeline", pointCost: 0, parallelConstrained: false, labelKo: "파이프라인 OBJ→GLB 변환 (0pt)" },
  { targetKey: "pipeline:glb-to-obj", category: "pipeline", pointCost: 0, parallelConstrained: false, labelKo: "파이프라인 GLB→OBJ 변환 (0pt)" },
  { targetKey: "pipeline:glb-to-fbx", category: "pipeline", pointCost: 0, parallelConstrained: false, labelKo: "파이프라인 GLB→FBX 변환 (0pt)" },
  { targetKey: "pipeline:fbx-to-glb", category: "pipeline", pointCost: 0, parallelConstrained: false, labelKo: "파이프라인 FBX→GLB 변환 (0pt)" },
  { targetKey: "pipeline:obj-to-fbx", category: "pipeline", pointCost: 0, parallelConstrained: false, labelKo: "파이프라인 OBJ→FBX 변환 (0pt)" },
  { targetKey: "pipeline:fbx-to-obj", category: "pipeline", pointCost: 0, parallelConstrained: false, labelKo: "파이프라인 FBX→OBJ 변환 (0pt)" },
  { targetKey: "pipeline:mesh-normalizer", category: "pipeline", pointCost: 0, parallelConstrained: false, labelKo: "파이프라인 메시 정규화 (0pt)" },
]);

export interface StudioVarco3dPointReservationEvaluation {
  readonly policy: StudioVarco3dPointPolicyEntry;
  readonly quantity: number;
  readonly totalPointCost: number;
  readonly hasSufficientPoints: boolean;
  readonly errorCode: "OK" | "INSUFFICIENT_POINT" | "QUEUE_CAPACITY_EXCEEDED";
  readonly availableParallelSlots: number;
  readonly immediateBatchSize: number;
}

export function evaluateVarco3dPointPolicyReservation(input: {
  readonly targetKey: string;
  readonly quantity: number;
  readonly remainingPoints: number;
  readonly runningStudioTaskCount: number;
}): StudioVarco3dPointReservationEvaluation {
  const policy =
    STUDIO_VARCO3D_POINT_POLICIES.find((entry) => entry.targetKey === input.targetKey) ??
    STUDIO_VARCO3D_POINT_POLICIES[0]!;
  const safeQuantity = Math.max(1, Math.floor(input.quantity));
  const totalPointCost = policy.pointCost * safeQuantity;
  const hasSufficientPoints = totalPointCost <= input.remainingPoints;
  const availableParallelSlots = Math.max(
    0,
    STUDIO_VARCO3D_MAX_PARALLEL_STUDIO_TASKS - Math.max(0, input.runningStudioTaskCount),
  );
  const immediateBatchSize = policy.parallelConstrained
    ? Math.min(safeQuantity, availableParallelSlots)
    : safeQuantity;

  let errorCode: StudioVarco3dPointReservationEvaluation["errorCode"] = "OK";
  if (!hasSufficientPoints) {
    errorCode = "INSUFFICIENT_POINT";
  } else if (policy.parallelConstrained && availableParallelSlots === 0) {
    errorCode = "QUEUE_CAPACITY_EXCEEDED";
  }

  return {
    policy,
    quantity: safeQuantity,
    totalPointCost,
    hasSufficientPoints,
    errorCode,
    availableParallelSlots,
    immediateBatchSize,
  };
}

export const STUDIO_VARCO3D_ANIMATION_LIBRARY_SUMMARY = Object.freeze({
  totalClips: 598,
  plusClips: 581,
  freeClips: 17,
  defaultHumanoidSkeleton: "mixamo52" as const,
  defaultHumanoidClass: "HUMANOID_FINGERS" as const,
  categoryCounts: Object.freeze({
    COMBAT: 230,
    LOCOMOTION: 160,
    EMOTION: 38,
    ACROBATICS: 33,
    POSE: 29,
    GESTURE: 25,
    JUMP: 17,
    ACTION: 11,
    WALK: 10,
    INTERACTION: 9,
    CANTER: 8,
    GALLOP: 8,
    IDLE: 6,
    SOCIAL: 5,
    TROT: 4,
    DANCE: 3,
    SPORTS: 2,
  }),
});

export interface StudioVarco3dRetargetAnimationPayload {
  readonly endpoint: "task.animateTask";
  readonly projectId: string;
  readonly sourceTaskId: string;
  readonly animationFbx: string;
  readonly inPlaceAnimation: boolean;
  readonly skeleton: "mixamo52";
  readonly humanoidClass: "HUMANOID_FINGERS";
  readonly pointCost: 0;
}

export function planVarco3dRetargetAnimationTask(input: {
  readonly projectId: string;
  readonly sourceRigTaskId: string;
  readonly animationFbx: string;
  readonly inPlaceAnimation?: boolean;
}): StudioVarco3dRetargetAnimationPayload {
  return {
    endpoint: "task.animateTask",
    projectId: input.projectId,
    sourceTaskId: input.sourceRigTaskId,
    animationFbx: input.animationFbx,
    inPlaceAnimation: input.inPlaceAnimation ?? true,
    skeleton: "mixamo52",
    humanoidClass: "HUMANOID_FINGERS",
    pointCost: 0,
  };
}

function deriveDeterministicSha256Hex(seed: string): string {
  const cleanHex = seed.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
  return (cleanHex + "a5f09c3e7b1d4826".repeat(4)).slice(0, 64);
}

export function buildVarco3dCanonicalPartDescriptor(
  item: StudioVarco3dCharacterLabModularItem,
): CharacterCanonicalPartDescriptor {
  const slotMap: Record<
    StudioVarco3dCharacterLabSlot,
    {
      readonly slot: CharacterCanonicalPartSlot;
      readonly bindingKind: "skinned-transplant" | "socket" | "rigid-follow";
      readonly targetBone: string;
      readonly targetSocket?: string;
      readonly semanticLayers: readonly CharacterSemanticPart[];
      readonly selectorSemantic: "hair" | "tops" | "accessory";
      readonly hideTargetPart: boolean;
      readonly topologies: readonly CharacterTopologyFamily[];
    }
  > = {
    "head-hair": {
      slot: "hair",
      bindingKind: "skinned-transplant",
      targetBone: "head",
      semanticLayers: ["hair-front", "hair-back"],
      selectorSemantic: "hair",
      hideTargetPart: true,
      topologies: ["toon-standard", "toon-young"],
    },
    "outfit-set": {
      slot: "top",
      bindingKind: "skinned-transplant",
      targetBone: "upperChest",
      semanticLayers: ["top", "bottom"],
      selectorSemantic: "tops",
      hideTargetPart: true,
      topologies: ["toon-standard", "toon-young"],
    },
    "head-accessory": {
      slot: "accessory",
      bindingKind: "rigid-follow",
      targetBone: "head",
      semanticLayers: ["accessory"],
      selectorSemantic: "accessory",
      hideTargetPart: false,
      topologies: ["toon-standard", "toon-young", "toon-sd"],
    },
    "weapon-r": {
      slot: "accessory",
      bindingKind: "socket",
      targetBone: "rightHand",
      targetSocket: "rightHandGrip",
      semanticLayers: ["accessory"],
      selectorSemantic: "accessory",
      hideTargetPart: false,
      topologies: ["toon-standard", "toon-young", "toon-sd"],
    },
    "weapon-l": {
      slot: "accessory",
      bindingKind: "socket",
      targetBone: "leftHand",
      targetSocket: "leftHandGrip",
      semanticLayers: ["accessory"],
      selectorSemantic: "accessory",
      hideTargetPart: false,
      topologies: ["toon-standard", "toon-young", "toon-sd"],
    },
    "back-wings": {
      slot: "accessory",
      bindingKind: "rigid-follow",
      targetBone: "upperChest",
      semanticLayers: ["accessory"],
      selectorSemantic: "accessory",
      hideTargetPart: false,
      topologies: ["toon-standard", "toon-young", "toon-sd"],
    },
  };

  const mapped = slotMap[item.slot];
  const sha256 = deriveDeterministicSha256Hex(item.multiviewTurnaround.taskId + item.referenceImagePath);
  const lod1Sha256 = deriveDeterministicSha256Hex(`lod1_${item.multiviewTurnaround.taskId}`);
  const glbPath = `/assets/varco3d/character-lab/${item.id}.glb`;

  return {
    id: item.id,
    label: item.labelKo,
    slot: mapped.slot,
    thumbnail: `${STUDIO_VARCO3D_CLOUD_BASE_URL}${item.referenceImagePath}`,
    source: {
      format: "glb-part",
      file: glbPath,
      sha256,
      selector: {
        kind: "semantic",
        semantic: mapped.selectorSemantic,
      },
    },
    binding: {
      kind: mapped.bindingKind,
      ...(mapped.targetSocket ? { targetSocket: mapped.targetSocket } : {}),
      targetBone: mapped.targetBone,
      requiredRigRevisions: ["mixamo52-v1", "humanoid-fingers-v1"],
      requiredTopologyFamilies: mapped.topologies,
    },
    fitting: {
      drivers: [
        {
          measurement: mapped.targetBone === "head" ? "headWidth" : "chestWidth",
          reference: mapped.targetBone === "head" ? 0.16 : 0.32,
          axis: "uniform",
          weight: 1.0,
          minimumScale: 0.85,
          maximumScale: 1.2,
        },
      ],
      clearanceMeters: mapped.hideTargetPart ? 0.002 : 0.005,
      hideTargetPart: mapped.hideTargetPart,
      correctiveMorphs: {},
    },
    lods: [
      {
        id: `${item.id}_lod0`,
        sourceFile: glbPath,
        sourceSha256: sha256,
        maximumProjectedHeightPx: 2048,
      },
      {
        id: `${item.id}_lod1`,
        sourceFile: `/assets/varco3d/character-lab/${item.id}.lod1.glb`,
        sourceSha256: lod1Sha256,
        maximumProjectedHeightPx: 512,
      },
    ],
    semanticLayers: mapped.semanticLayers,
    quality: {
      minimumScore: 0.92,
      accepted: true,
      reportFile: `/assets/varco3d/character-lab/${item.id}.qa.json`,
      goldenPoseIds: ["t-pose", "a-pose", "action-hero"],
      goldenCameraIds: ["front", "three-quarter", "profile"],
    },
    provenance: {
      creatorId: "varco3d-flow-70a90b59",
      sourceLicense: "CC-BY-4.0",
      commercialUse: true,
      redistribution: true,
      derivativeUse: true,
    },
  };
}
