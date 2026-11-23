/**
 * Studio BG3D 씬 문서의 첨부 모델·노드·변형·재질·리깅·컷 목록 정규화.
 */
import { normalizeStudioBg3dModelTexturePaint } from "../studio-bg3d-model-texture-paint";
import {
  attachStudioGeneric3dWorkflowMetadata,
  parseStudioGeneric3dWorkflowMetadata,
} from "../studio-generic-3d-workflow-metadata";
import {
  normalizeStudioBg3dDocumentText as normalizedText,
  normalizeStudioBg3dHierarchyParents,
  normalizeStudioBg3dNodeOrganization,
  normalizeStudioBg3dTags,
} from "./studio-bg3d-hierarchy";
import {
  DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE,
  STUDIO_BG3D_AIM_AXES,
  STUDIO_BG3D_GLB_MAX_BYTES,
  STUDIO_BG3D_GLB_MIME,
  STUDIO_BG3D_MAX_TWO_BONE_IK_CONSTRAINTS,
  STUDIO_BG3D_PRIMITIVE_KINDS,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_SHOTS,
  STUDIO_BG3D_SHOT_ID_MAX_LENGTH,
  STUDIO_BG3D_SHOT_MAX_NODE_VISIBILITY_OVERRIDES,
  STUDIO_BG3D_SHOT_NAME_MAX_LENGTH,
  failBudget,
} from "./studio-bg3d-scene-document-constants";
import {
  MAX_WORLD_COORDINATE,
  boundedInteger,
  boundedNumber,
  hasOwn,
  isRecord,
  normalizedBoolean,
  normalizedColor,
  normalizedEnum,
  normalizedId,
  normalizedRotation,
  normalizedScale,
  normalizedVec3,
} from "./studio-bg3d-scene-document-primitives";
import {
  normalizeShotBackgroundOverride,
  normalizeShotCameraOverride,
  normalizeShotLightingOverride,
  normalizeShotOutputOverride,
  normalizeShotRenderOverride,
} from "./studio-bg3d-scene-document-sections";
import { normalizeStudioBg3dTexturePaint } from "./studio-bg3d-texture-paint-contract";

import type {
  StudioBg3dAimAxis,
  StudioBg3dAnimationPlayback,
  StudioBg3dAttachmentRights,
  StudioBg3dAttachmentSource,
  StudioBg3dConstraintLayer,
  StudioBg3dJointAimConstraint,
  StudioBg3dJointPoseOverride,
  StudioBg3dLightingSettings,
  StudioBg3dMaterialOverride,
  StudioBg3dModelAttachment,
  StudioBg3dMorphLayer,
  StudioBg3dMorphWeightOverride,
  StudioBg3dPoseLayer,
  StudioBg3dPrimitiveKind,
  StudioBg3dQuaternion,
  StudioBg3dRightsStatus,
  StudioBg3dSceneDocument,
  StudioBg3dSceneNode,
  StudioBg3dShot,
  StudioBg3dShotNodeVisibilityOverride,
  StudioBg3dTransform,
  StudioBg3dTwoBoneIkConstraint,
} from "../bg3d/studio-bg3d-scene-document-types";

const MAX_TEXT_LENGTH = 160;
const MAX_NODE_NAME_LENGTH = 80;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const PRIMITIVE_KIND_SET = new Set<string>(STUDIO_BG3D_PRIMITIVE_KINDS);
const MATERIAL_COLOR_MODE_SET = new Set<string>(["original", "multiply", "replace"]);
const ANIMATION_LOOP_MODE_SET = new Set<string>(["once", "repeat", "ping-pong"]);
const ATTACHMENT_SOURCE_SET = new Set<string>(["upload", "local-library", "bundled"]);
const RIGHTS_STATUS_SET = new Set<string>(["owned", "licensed", "public-domain", "unknown"]);
const AIM_AXIS_SET = new Set<string>(STUDIO_BG3D_AIM_AXES);

function normalizeRights(value: unknown): StudioBg3dAttachmentRights | null {
  if (!isRecord(value)) return null;
  const status = normalizedEnum<StudioBg3dRightsStatus>(
    value.status,
    RIGHTS_STATUS_SET,
    "unknown",
  );
  if (value.status !== status || typeof value.commercialUse !== "boolean") return null;
  if (typeof value.attributionRequired !== "boolean") return null;
  const attribution = normalizedText(value.attribution, MAX_TEXT_LENGTH, true);
  const licenseName = normalizedText(value.licenseName, MAX_TEXT_LENGTH, true);
  if (value.attributionRequired && !attribution) return null;
  if (status === "licensed" && !licenseName) return null;
  return {
    status,
    commercialUse: status === "unknown" ? false : value.commercialUse,
    attributionRequired: value.attributionRequired,
    ...(attribution ? { attribution } : {}),
    ...(licenseName ? { licenseName } : {}),
  };
}

export function normalizeAttachment(value: unknown): StudioBg3dModelAttachment | null {
  if (!isRecord(value)) return null;
  const id = normalizedId(value.id);
  const rawName = normalizedText(value.name, 120, true);
  const rights = normalizeRights(value.rights);
  if (
    !id ||
    !rawName ||
    /[\\/]/u.test(rawName) ||
    !/\.glb$/iu.test(rawName) ||
    value.mime !== STUDIO_BG3D_GLB_MIME ||
    typeof value.byteSize !== "number" ||
    !Number.isSafeInteger(value.byteSize) ||
    value.byteSize < 1 ||
    value.byteSize > STUDIO_BG3D_GLB_MAX_BYTES ||
    typeof value.hash !== "string" ||
    !SHA256_PATTERN.test(value.hash.toLowerCase()) ||
    !rights ||
    typeof value.source !== "string" ||
    !ATTACHMENT_SOURCE_SET.has(value.source)
  ) {
    return null;
  }
  const base: StudioBg3dModelAttachment = {
    id,
    name: rawName.replace(/\.glb$/iu, ".glb"),
    mime: STUDIO_BG3D_GLB_MIME,
    byteSize: value.byteSize,
    hash: value.hash.toLowerCase(),
    rights,
    ...(value.metricPolicy === "authored-metres" ? { metricPolicy: value.metricPolicy } : {}),
    source: value.source as StudioBg3dAttachmentSource,
  };
  // Fail closed: corrupt/unknown workflow blocks are dropped; valid v1 fields re-attach sanitized.
  const workflow = parseStudioGeneric3dWorkflowMetadata(value);
  if (!workflow) return base;
  if (!workflow.classification && !workflow.sourceFormat) {
    return attachStudioGeneric3dWorkflowMetadata(base);
  }
  return attachStudioGeneric3dWorkflowMetadata(base, {
    ...(workflow.classification ? { classification: workflow.classification } : {}),
    ...(workflow.sourceFormat ? { sourceFormat: workflow.sourceFormat } : {}),
  });
}

export function normalizeAttachments(
  value: unknown,
  maxModelBytes: number,
): readonly StudioBg3dModelAttachment[] {
  if (!Array.isArray(value)) return [];
  const attachments: StudioBg3dModelAttachment[] = [];
  const ids = new Set<string>();
  const hashes = new Set<string>();
  let cumulativeBytes = 0;
  for (const candidate of value) {
    const attachment = normalizeAttachment(candidate);
    if (
      !attachment ||
      ids.has(attachment.id) ||
      hashes.has(attachment.hash)
    ) {
      continue;
    }
    if (attachments.length >= STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS) {
      failBudget("attachment-count-budget-exceeded");
    }
    if (cumulativeBytes + attachment.byteSize > maxModelBytes) {
      failBudget("model-byte-budget-exceeded");
    }
    attachments.push(attachment);
    ids.add(attachment.id);
    hashes.add(attachment.hash);
    cumulativeBytes += attachment.byteSize;
  }
  return attachments;
}

function normalizeTransform(value: unknown): StudioBg3dTransform {
  const candidate = isRecord(value) ? value : {};
  return {
    position: normalizedVec3(
      candidate.position,
      [0, 0, 0],
      -MAX_WORLD_COORDINATE,
      MAX_WORLD_COORDINATE,
    ),
    rotation: normalizedRotation(candidate.rotation),
    scale: normalizedScale(candidate.scale),
  };
}

export function normalizeMaterialOverride(value: unknown): StudioBg3dMaterialOverride | null {
  if (!isRecord(value)) return null;
  const surfaceMaterialId = hasOwn(value, "surfaceMaterialId") ? normalizedId(value.surfaceMaterialId) : null;
  return {
    colorMode: normalizedEnum(value.colorMode, MATERIAL_COLOR_MODE_SET, DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE.colorMode),
    color: normalizedColor(value.color, DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE.color),
    colorStrength: boundedNumber(value.colorStrength, 1, 0, 1),
    opacityMultiplier: boundedNumber(value.opacityMultiplier, 1, 0, 1),
    roughness: value.roughness === null ? null : boundedNumber(value.roughness, 0.8, 0, 1),
    metalness: value.metalness === null ? null : boundedNumber(value.metalness, 0, 0, 1),
    emissiveColor: normalizedColor(value.emissiveColor, "#000000"),
    emissiveIntensity: value.emissiveIntensity === null ? null : boundedNumber(value.emissiveIntensity, 0, 0, 20),
    wireframe: normalizedBoolean(value.wireframe, false),
    doubleSided: normalizedBoolean(value.doubleSided, false),
    ...(surfaceMaterialId ? { surfaceMaterialId } : {}),
  };
}

export function normalizeAnimationPlayback(value: unknown): StudioBg3dAnimationPlayback | null {
  if (!isRecord(value)) return null;
  return {
    clipIndex: boundedInteger(value.clipIndex, 0, 0, 255),
    playing: normalizedBoolean(value.playing, false),
    loop: normalizedEnum(value.loop, ANIMATION_LOOP_MODE_SET, "repeat"),
    timeSeconds: boundedNumber(value.timeSeconds, 0, 0, 86_400),
    timeScale: boundedNumber(value.timeScale, 1, -4, 4),
    weight: boundedNumber(value.weight, 1, 0, 1),
  };
}

function normalizeQuaternion(value: unknown): StudioBg3dQuaternion | null {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    value.some((component) => typeof component !== "number" || !Number.isFinite(component))
  ) {
    return null;
  }
  const magnitude = Math.hypot(value[0], value[1], value[2], value[3]);
  if (!Number.isFinite(magnitude) || magnitude < 1e-8) return null;
  // q and -q encode the same rotation. Canonicalizing to w >= 0 keeps strict persistence stable.
  const sign = value[3] < 0 ? -1 : 1;
  return [
    (value[0] / magnitude) * sign,
    (value[1] / magnitude) * sign,
    (value[2] / magnitude) * sign,
    (value[3] / magnitude) * sign,
  ];
}

export function normalizePoseLayer(value: unknown): StudioBg3dPoseLayer | null {
  if (!isRecord(value) || !Array.isArray(value.joints)) return null;
  const joints: StudioBg3dJointPoseOverride[] = [];
  const keys = new Set<string>();
  for (const rawJoint of value.joints) {
    if (!isRecord(rawJoint)) continue;
    const jointKey = normalizedText(rawJoint.jointKey, 128);
    const rotationOffset = normalizeQuaternion(rawJoint.rotationOffset);
    if (!jointKey || !rotationOffset || keys.has(jointKey)) continue;
    if (joints.length >= 256) failBudget("pose-joint-count-budget-exceeded");
    keys.add(jointKey);
    joints.push({ jointKey, rotationOffset });
  }
  return {
    enabled: normalizedBoolean(value.enabled, true),
    weight: boundedNumber(value.weight, 1, 0, 1),
    joints,
  };
}

export function normalizeMorphLayer(value: unknown): StudioBg3dMorphLayer | null {
  if (!isRecord(value) || !Array.isArray(value.targets)) return null;
  const targets: StudioBg3dMorphWeightOverride[] = [];
  const keys = new Set<string>();
  for (const rawTarget of value.targets) {
    if (!isRecord(rawTarget)) continue;
    const targetKey = normalizedText(rawTarget.targetKey, 128);
    if (!targetKey || keys.has(targetKey)) continue;
    if (targets.length >= 256) failBudget("morph-target-count-budget-exceeded");
    keys.add(targetKey);
    targets.push({
      targetKey,
      weightOffset: boundedNumber(rawTarget.weightOffset, 0, -1, 1),
    });
  }
  return {
    enabled: normalizedBoolean(value.enabled, true),
    weight: boundedNumber(value.weight, 1, 0, 1),
    targets,
  };
}

export function normalizeConstraintLayer(value: unknown): StudioBg3dConstraintLayer | null {
  if (!isRecord(value) || !Array.isArray(value.aims)) return null;
  const aims: StudioBg3dJointAimConstraint[] = [];
  const keys = new Set<string>();
  for (const rawAim of value.aims) {
    if (!isRecord(rawAim)) continue;
    const jointKey = normalizedText(rawAim.jointKey, 128);
    const axis = typeof rawAim.axis === "string" && AIM_AXIS_SET.has(rawAim.axis)
      ? rawAim.axis as StudioBg3dAimAxis
      : null;
    if (!jointKey || !axis || keys.has(jointKey)) continue;
    if (aims.length >= 128) failBudget("aim-constraint-count-budget-exceeded");
    keys.add(jointKey);
    aims.push({
      jointKey,
      target: normalizedVec3(rawAim.target, [0, 1, 0], -MAX_WORLD_COORDINATE, MAX_WORLD_COORDINATE),
      axis,
      weight: boundedNumber(rawAim.weight, 1, 0, 1),
    });
  }
  const rawTwoBoneIks = hasOwn(value, "twoBoneIks") ? value.twoBoneIks : [];
  if (!Array.isArray(rawTwoBoneIks)) return null;

  const twoBoneIks: StudioBg3dTwoBoneIkConstraint[] = [];
  const claimedJointKeys = new Set<string>();
  for (const rawIk of rawTwoBoneIks) {
    if (!isRecord(rawIk)) continue;
    const upperJointKey = normalizedText(rawIk.upperJointKey, 128);
    const middleJointKey = normalizedText(rawIk.middleJointKey, 128);
    const endJointKey = normalizedText(rawIk.endJointKey, 128);
    if (
      !upperJointKey || !middleJointKey || !endJointKey ||
      upperJointKey === middleJointKey || upperJointKey === endJointKey ||
      middleJointKey === endJointKey ||
      claimedJointKeys.has(upperJointKey) || claimedJointKeys.has(middleJointKey) ||
      claimedJointKeys.has(endJointKey)
    ) {
      continue;
    }
    if (twoBoneIks.length >= STUDIO_BG3D_MAX_TWO_BONE_IK_CONSTRAINTS) {
      failBudget("two-bone-ik-count-budget-exceeded");
    }
    claimedJointKeys.add(upperJointKey);
    claimedJointKeys.add(middleJointKey);
    claimedJointKeys.add(endJointKey);
    twoBoneIks.push({
      upperJointKey,
      middleJointKey,
      endJointKey,
      target: normalizedVec3(rawIk.target, [0, 1, 0], -MAX_WORLD_COORDINATE, MAX_WORLD_COORDINATE),
      poleTarget: normalizedVec3(
        rawIk.poleTarget,
        [0, 0, 1],
        -MAX_WORLD_COORDINATE,
        MAX_WORLD_COORDINATE,
      ),
      weight: boundedNumber(rawIk.weight, 1, 0, 1),
    });
  }
  return {
    enabled: normalizedBoolean(value.enabled, true),
    aims,
    twoBoneIks,
  };
}

function normalizeNode(
  value: unknown,
  attachmentIds: ReadonlySet<string>,
): StudioBg3dSceneNode | null {
  if (!isRecord(value)) return null;
  const id = normalizedId(value.id);
  if (!id) return null;
  const linkedSourceId = normalizedId(value.linkedSourceId);
  const base = {
    id,
    name: normalizedText(value.name, MAX_NODE_NAME_LENGTH, true) ?? "3D 요소",
    transform: normalizeTransform(value.transform),
    visible: normalizedBoolean(value.visible, true),
    locked: normalizedBoolean(value.locked, false),
    castsShadow: normalizedBoolean(value.castsShadow, true),
    receivesShadow: normalizedBoolean(value.receivesShadow, true),
    parentId: normalizedId(value.parentId) ?? null,
    // A node can never link to itself; dangling links are dropped by the sync pass, not here.
    ...(linkedSourceId && linkedSourceId !== id ? { linkedSourceId } : {}),
    // 태그·컴포넌트 참조: 비어 있으면 키를 만들지 않아 이 필드를 모르는 기존 노드와 바이트가 같다.
    ...normalizeStudioBg3dNodeOrganization(value),
  };
  if (value.kind === "primitive") {
    if (typeof value.primitiveKind !== "string" || !PRIMITIVE_KIND_SET.has(value.primitiveKind)) {
      return null;
    }
    const materialOverride = normalizeMaterialOverride(value.materialOverride);
    const texturePaint = normalizeStudioBg3dTexturePaint(value.texturePaint);
    return {
      ...base,
      kind: "primitive",
      primitiveKind: value.primitiveKind as StudioBg3dPrimitiveKind,
      color: normalizedColor(value.color, "#b8b8c2"),
      ...(materialOverride ? { materialOverride } : {}),
      // 표면 페인트 획은 정규화를 통과한 경우에만 문서에 남는다 — 저장/재열기에서 획 유지의 관문.
      ...(texturePaint ? { texturePaint } : {}),
    };
  }
  if (value.kind === "model") {
    const attachmentId = normalizedId(value.attachmentId);
    if (!attachmentId || !attachmentIds.has(attachmentId)) return null;
    const materialOverride = normalizeMaterialOverride(value.materialOverride);
    const modelTexturePaint = normalizeStudioBg3dModelTexturePaint(value.modelTexturePaint);
    const animation = normalizeAnimationPlayback(value.animation);
    const pose = normalizePoseLayer(value.pose);
    const morph = normalizeMorphLayer(value.morph);
    const constraints = normalizeConstraintLayer(value.constraints);
    return {
      ...base,
      kind: "model",
      attachmentId,
      ...(materialOverride ? { materialOverride } : {}),
      // GLB 텍스처 페인트 획은 정규화를 통과한 경우에만 문서에 남는다(프리미티브 페인트와 같은 관문).
      ...(modelTexturePaint ? { modelTexturePaint } : {}),
      ...(animation ? { animation } : {}),
      ...(pose ? { pose } : {}),
      ...(morph ? { morph } : {}),
      ...(constraints ? { constraints } : {}),
    };
  }
  return null;
}

export function normalizeNodes(
  value: unknown,
  attachmentIds: ReadonlySet<string>,
  maxNodes: number,
): readonly StudioBg3dSceneNode[] {
  if (!Array.isArray(value)) return [];
  const nodes: StudioBg3dSceneNode[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    const node = normalizeNode(candidate, attachmentIds);
    if (!node || ids.has(node.id)) continue;
    if (nodes.length >= maxNodes) failBudget("node-count-budget-exceeded");
    nodes.push(node);
    ids.add(node.id);
  }
  return normalizeStudioBg3dHierarchyParents(nodes);
}

function normalizeShotNodeVisibility(
  value: unknown,
  nodeIds: ReadonlySet<string>,
): readonly StudioBg3dShotNodeVisibilityOverride[] {
  if (!Array.isArray(value)) return [];
  const overrides: StudioBg3dShotNodeVisibilityOverride[] = [];
  const claimedNodeIds = new Set<string>();
  for (const candidate of value) {
    if (!isRecord(candidate)) continue;
    const nodeId = normalizedId(candidate.nodeId);
    if (
      !nodeId ||
      !nodeIds.has(nodeId) ||
      claimedNodeIds.has(nodeId) ||
      typeof candidate.visible !== "boolean"
    ) {
      continue;
    }
    if (overrides.length >= STUDIO_BG3D_SHOT_MAX_NODE_VISIBILITY_OVERRIDES) {
      failBudget("shot-visibility-count-budget-exceeded");
    }
    claimedNodeIds.add(nodeId);
    overrides.push({ nodeId, visible: candidate.visible });
  }
  return overrides;
}

function normalizeShot(
  value: unknown,
  nodeIds: ReadonlySet<string>,
): StudioBg3dShot | null {
  if (!isRecord(value)) return null;
  const id = normalizedId(value.id);
  const name = normalizedText(value.name, STUDIO_BG3D_SHOT_NAME_MAX_LENGTH, true);
  if (!id || id.length > STUDIO_BG3D_SHOT_ID_MAX_LENGTH || !name) return null;
  return {
    id,
    name,
    ...(hasOwn(value, "camera")
      ? { camera: normalizeShotCameraOverride(value.camera) }
      : {}),
    ...(hasOwn(value, "nodeVisibility")
      ? { nodeVisibility: normalizeShotNodeVisibility(value.nodeVisibility, nodeIds) }
      : {}),
    ...(hasOwn(value, "render")
      ? { render: normalizeShotRenderOverride(value.render) }
      : {}),
    ...(hasOwn(value, "background")
      ? { background: normalizeShotBackgroundOverride(value.background) }
      : {}),
    ...(hasOwn(value, "lighting")
      ? { lighting: normalizeShotLightingOverride(value.lighting) }
      : {}),
    ...(hasOwn(value, "output")
      ? { output: normalizeShotOutputOverride(value.output) }
      : {}),
    ...(hasOwn(value, "hiddenTags") ? { hiddenTags: normalizeStudioBg3dTags(value.hiddenTags, "scene") } : {}),
  };
}

export function normalizeShots(
  value: unknown,
  nodeIds: ReadonlySet<string>,
): readonly StudioBg3dShot[] {
  if (!Array.isArray(value)) return [];
  const shots: StudioBg3dShot[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    const shot = normalizeShot(candidate, nodeIds);
    if (!shot || ids.has(shot.id)) continue;
    if (shots.length >= STUDIO_BG3D_SCENE_DOCUMENT_MAX_SHOTS) {
      failBudget("shot-count-budget-exceeded");
    }
    ids.add(shot.id);
    shots.push(shot);
  }
  return shots;
}

export function withoutActiveShot(
  document: StudioBg3dSceneDocument,
): StudioBg3dSceneDocument {
  const { activeShotId: _discardedActiveShotId, ...rest } = document;
  return rest;
}

/**
 * 샷 조명 스냅샷에서 문서 고유 환경을 뺀다. 샷 오버라이드 스키마가 environment를
 * 소유하지 않아(적용 시 문서 값을 고정한다) 그대로 넣으면 엄격 정규화의
 * 구조 동등성 검사가 실패해 캡처가 항상 null이 된다.
 */
export function withoutShotEnvironment(
  lighting: StudioBg3dLightingSettings,
): Omit<StudioBg3dLightingSettings, "environment"> {
  const { environment: _discardedShotEnvironment, ...rest } = lighting;
  return rest;
}
