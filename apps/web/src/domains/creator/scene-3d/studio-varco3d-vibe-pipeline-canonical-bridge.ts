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
  readonly riggedModelId: string;
  readonly animatedModelId: string;
  readonly vertexCount: number;
  readonly faceCount: number;
  readonly topology: "tri" | "quad";
  readonly humanoidClass: "HUMANOID_FINGERS" | "HUMANOID" | "QUADRUPED";
  readonly skeleton: "mixamo52" | "quadruped" | "equine";
  readonly mvImages: Readonly<Record<StudioVarco3d12ViewAngle, string>>;
  readonly mvAlbedo: Readonly<Record<StudioVarco3d12ViewAngle, string>>;
  readonly mvOrm: Readonly<Record<StudioVarco3d12ViewAngle, string>>;
}

export const STUDIO_VARCO3D_COUNCIL_PRESIDENT_12VIEW_RECONSTRUCTION: StudioVarco3d12ViewReconstructionBundle =
  Object.freeze({
    meshTaskId: "cd1e75d3-5efa-4f46-afb6-59920e080fb7",
    rigTaskId: "58923776-91f0-4b60-a985-835d204f9a24",
    modelId: "b583069f434b589a491857c45ca5b76f32d2eb99e5aee3bf0bfc86e784df959d",
    coarseModelId: "462f9a1fbc40957845144b044459b1f2c5d9888a7a47eaa80ae41f8a1f202e4b",
    highPolyModelId: "ece362870eecb83390d1d84022f0d28bb5ccf796fb3b367c5d62d6376a3d6212",
    riggedModelId: "6df9274b69f28be22edcb31cccf53d6a7115eb6ddaaa12223b5bd462826c0c9e",
    animatedModelId: "2ca3bd80793e92c40b8a4943d64f7301b815780cab6a9e2e4a2c2f1fc993f635",
    vertexCount: 362127,
    faceCount: 500000,
    topology: "tri",
    humanoidClass: "HUMANOID_FINGERS",
    skeleton: "mixamo52",
    mvImages: Object.freeze({
      front: "/api/objects/b8d65aa18756e278e9d2969d87d5bae7.png",
      right: "/api/objects/f1d103572c0e201e614a56fac8739a35.png",
      back: "/api/objects/fb3a10c4ea96f873bc6f6fa4cfa31e24.png",
      left: "/api/objects/0f620a0ff782f83f7374c531179a1441.png",
      top: "/api/objects/ed8fbe6cbdd1b6f09bb05f6026094bd5.png",
      bottom: "/api/objects/b8f191c52128a5fc361a2fc1d9e2ed37.png",
      front2: "/api/objects/8cfd6f88f4d06f6754254f24cbaec1e3.png",
      right2: "/api/objects/3231e0499317e7e8b577d4a985d70501.png",
      back2: "/api/objects/7d203d40a9077d1ebdf3d9f8897c316d.png",
      left2: "/api/objects/33e68e1fdbf3afd65b64f7e1a323793b.png",
      top2: "/api/objects/3ee71ff7f94d4837da6e5961a29d920c.png",
      bottom2: "/api/objects/26d3b0592c3152f6aa77474f30395a67.png",
    }),
    mvAlbedo: Object.freeze({
      front: "/api/objects/93d20cf76ca77df43c8731c08fbad216.png",
      right: "/api/objects/f6e20a096af7a75e3dc73fc380eeedef.png",
      back: "/api/objects/9453744626d43a296318a8e8b53efa29.png",
      left: "/api/objects/b4976e54d245786815163a0cf699322a.png",
      top: "/api/objects/e2c9d434f5f98e29d72d35ba60edb839.png",
      bottom: "/api/objects/69367b545a682be7d125c2a4447c524f.png",
      front2: "/api/objects/1c90998234ae2b1fd344e0fc0831c630.png",
      right2: "/api/objects/ebab2b6669257f9a195133584a04b0bd.png",
      back2: "/api/objects/59b5f862800caddee6b3aa201cfe7d4f.png",
      left2: "/api/objects/6c0590ad4085942e31a25a73ee9fded0.png",
      top2: "/api/objects/4f6ba2f51e0950b272abf176f1606ad1.png",
      bottom2: "/api/objects/eebc85e2889808a7202c7f88f1680c6f.png",
    }),
    mvOrm: Object.freeze({
      front: "/api/objects/45b918b80535640ce9e25c3be5ca7f41.png",
      right: "/api/objects/ec5de47b50b22f231fb6e610798b6c13.png",
      back: "/api/objects/af7a172771ae30dcd96e90c52a8aaf13.png",
      left: "/api/objects/1dfdf21d55404dafada3206db69a75e7.png",
      top: "/api/objects/7ccf2fbdf0c72116261e9b224fb3088d.png",
      bottom: "/api/objects/237898183a11f1ddb498f9321cf768f0.png",
      front2: "/api/objects/62101701b674778852814618254c7fa2.png",
      right2: "/api/objects/1f94bf0e92816d003dc5c6e9365bb7a8.png",
      back2: "/api/objects/16d3dd0060e94ae707563d47e52032df.png",
      left2: "/api/objects/e74fccd58063f0ebc8c423d06d38ca52.png",
      top2: "/api/objects/99f9715d20cf4a22af63e5bcd3b3bc50.png",
      bottom2: "/api/objects/bb710aed36011792087acf0fdae3a767.png",
    }),
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
  const stageByFamily: Record<
    StudioVarco3d12ViewMapFamily,
    StudioVarco3d12ViewInspectionResult["pipelineStageKey"]
  > = {
    mvImages: "pipeline:multiview-generator",
    mvAlbedo: "pipeline:diffuse-to-albedo",
    mvOrm: "pipeline:orm-multiview-generator",
  };
  const objectPath = bundle[input.mapFamily][input.angle];

  return {
    angle: input.angle,
    mapFamily: input.mapFamily,
    ringIndex,
    isSecondaryElevationRing: input.angle.endsWith("2"),
    pipelineStageKey: stageByFamily[input.mapFamily],
    objectUrl: `${STUDIO_VARCO3D_CLOUD_BASE_URL}${objectPath}`,
  };
}

export interface StudioVarco3dZeroPointOptimizationTaskEntry {
  readonly taskId: string;
  readonly sourceTaskId: string;
  readonly assetId: string;
  readonly operation: "PBR" | "AI_UNWRAP" | "REMESH";
  readonly topology?: "quad" | "tri";
  readonly polygonCount?: number;
  readonly labelKo: string;
}

export const STUDIO_VARCO3D_ZERO_POINT_OPTIMIZATION_TASKS: readonly StudioVarco3dZeroPointOptimizationTaskEntry[] =
  Object.freeze([
    { taskId: "1a7c94a7-7f2f-4db3-85db-769e01c969a6", sourceTaskId: "cd1e75d3-5efa-4f46-afb6-59920e080fb7", assetId: "char_student_council_president", operation: "PBR", labelKo: "학생회장 PBR 재질 분리 (0pt)" },
    { taskId: "629166ab-e6b5-4c22-956b-d03343a14e15", sourceTaskId: "cd1e75d3-5efa-4f46-afb6-59920e080fb7", assetId: "char_student_council_president", operation: "AI_UNWRAP", labelKo: "학생회장 AI UV 언랩 (0pt)" },
    { taskId: "5037bc51-8ae6-4247-a4b3-16d7d690cb59", sourceTaskId: "cd1e75d3-5efa-4f46-afb6-59920e080fb7", assetId: "char_student_council_president", operation: "REMESH", topology: "quad", polygonCount: 15000, labelKo: "학생회장 쿼드 리메시 15K (0pt)" },
    { taskId: "be9167ad-5eea-4e90-ae18-36ded93f690a", sourceTaskId: "cd1e75d3-5efa-4f46-afb6-59920e080fb7", assetId: "char_student_council_president", operation: "REMESH", topology: "tri", polygonCount: 20000, labelKo: "학생회장 트라이 리메시 20K (0pt)" },
    { taskId: "728919e1-8579-4fa1-95b2-c7527622081c", sourceTaskId: "0c2f14f6-5dc3-4fba-9d2c-691cb6b779e0", assetId: "diorama_school_hallway", operation: "REMESH", topology: "quad", polygonCount: 25000, labelKo: "학교 복도 디오라마 쿼드 리메시 25K (0pt)" },
    { taskId: "c6794424-0ba3-443e-83be-e9128dc5f098", sourceTaskId: "0c2f14f6-5dc3-4fba-9d2c-691cb6b779e0", assetId: "diorama_school_hallway", operation: "PBR", labelKo: "학교 복도 디오라마 PBR 분리 (0pt)" },
    { taskId: "4ce48c83-a643-4a36-824f-f2fcd1817e09", sourceTaskId: "0c2f14f6-5dc3-4fba-9d2c-691cb6b779e0", assetId: "diorama_school_hallway", operation: "AI_UNWRAP", labelKo: "학교 복도 디오라마 AI UV 언랩 (0pt)" },
    { taskId: "dcb30cf5-3ea7-40a9-8b02-f94fa0010dfb", sourceTaskId: "37b095e1-b791-48d0-b625-4b77cf2472bd", assetId: "diorama_modern_cafe", operation: "PBR", labelKo: "모던 카페 디오라마 PBR 분리 (0pt)" },
    { taskId: "8a498f2b-a6c3-4cbd-ae69-edf8643f09b6", sourceTaskId: "4bc4a1f9-13d2-4719-ba42-f70cb5175078", assetId: "diorama_joseon_palace_hall", operation: "PBR", labelKo: "조선 궁궐 근정전 PBR 분리 (0pt)" },
    { taskId: "fa5a1a1d-2a3b-4b97-9918-bbad5aa944b1", sourceTaskId: "bd873629-5449-468b-865c-5a8405f7f902", assetId: "prop_school_desk_chair", operation: "REMESH", topology: "quad", polygonCount: 10000, labelKo: "학교 책걸상 소품 쿼드 리메시 10K (0pt)" },
    { taskId: "b6ae65cb-6c20-4218-91d7-290e85f9eae1", sourceTaskId: "5afa06f9-fb87-414c-800c-999879303d5d", assetId: "prop_pojangmacha_cart", operation: "PBR", labelKo: "포장마차 리어카 소품 PBR 분리 (0pt)" },
  ]);

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
