/**
 * 3D 씬 → 콘티 컷 직행 연결 모델.
 *
 * 지금까지 bg3d/포저에서 잡은 구도는 캡처 이미지로만 나갈 수 있었고, 컷 스트립의
 * `StoryboardCut`은 카메라 위치·목표·화각·롤만 평면 값으로 들고 있어 "이 컷이
 * 어떤 씬의 어떤 구도였는지"를 잃었다. 이 모듈은 그 사이를 잇는다.
 *
 * - 캡처 시점의 카메라·조명·노출·노드 포즈(포즈 레이어/모프/트랜스폼)를 컷의
 *   `sceneMeta`에 동결 스냅샷으로 보존한다 (원본 문서를 나중에 고쳐도 컷은 안 변한다).
 * - 재편집 때는 메타에서 복원 패치를 만들어 현재 씬 문서에 적용한다 (메타 왕복).
 * - 씬 복귀 진입점은 두 가지다: 패널 콜백(`onReturnToScene`)이 1차 진입점이고,
 *   `buildSceneReturnHref`는 라우터가 같은 정보를 딥링크로 받는 규약이다
 *   (기획 표면의 `/studio/new?start=storyboard&episode=` 규약과 같은 형태).
 *
 * 모델 바이트·URL·런타임 핸들은 메타에 넣지 않는다. 노드 id와 값 스냅샷만 둔다.
 */

import type { StudioBg3dEnvironmentSettings } from "./studio-bg3d-hdri-environment";
import type {
  StudioBg3dCameraSettings,
  StudioBg3dLightingSettings,
  StudioBg3dMorphLayer,
  StudioBg3dPoseLayer,
  StudioBg3dSceneNode,
  StudioBg3dShot,
  StudioBg3dTransform,
  StudioBg3dVec3,
} from "./studio-bg3d-scene-document-types";
import type {
  CutAspectRatio,
  StoryboardCut,
} from "../scene-3d/studio-3d-storyboard-cut-strip";

/** 씬 문서에서 캡처·복원에 필요한 부분만 뽑은 구조적 뷰. 전체 문서가 그대로 들어간다. */
export interface StoryboardSceneDocumentView {
  readonly camera: StudioBg3dCameraSettings;
  readonly lighting: StudioBg3dLightingSettings;
  readonly render: { readonly exposure: number };
  readonly nodes: readonly StudioBg3dSceneNode[];
  readonly shots?: readonly StudioBg3dShot[];
  readonly activeShotId?: string;
}

export type StoryboardSceneSourceKind = "bg3d" | "poser";

/** 캡처 이미지 참조. 픽셀 바이트는 싣지 않고 에셋 참조와 치수만 보존한다. */
export interface StoryboardSceneCaptureImage {
  readonly ref: string;
  readonly width: number;
  readonly height: number;
}

/** 노드 하나의 포즈 스냅샷. 모델 노드가 아니면 pose/morph는 null이다. */
export interface StoryboardScenePoseSnapshot {
  readonly nodeId: string;
  readonly name: string;
  readonly visible: boolean;
  readonly transform: StudioBg3dTransform;
  readonly pose: StudioBg3dPoseLayer | null;
  readonly morph: StudioBg3dMorphLayer | null;
}

/** 컷에 유지되는 구도 메타. 카메라·포즈·조명을 전부 값으로 동결한다. */
export interface StoryboardSceneCutMeta {
  readonly version: 1;
  readonly sourceKind: StoryboardSceneSourceKind;
  /** 호스트가 소유하는 씬 식별자 (씬 문서 자체에는 id가 없어 호출자가 각인한다). */
  readonly sceneId: string;
  /** 캡처 당시 활성 샷. 샷이 없는 씬이면 null. */
  readonly shotId: string | null;
  readonly capturedAt: string;
  readonly camera: StudioBg3dCameraSettings;
  readonly lighting: StudioBg3dLightingSettings;
  readonly exposure: number;
  readonly poses: readonly StoryboardScenePoseSnapshot[];
  readonly image: StoryboardSceneCaptureImage | null;
}

export type SceneLinkedStoryboardCut = StoryboardCut & {
  readonly sceneMeta: StoryboardSceneCutMeta;
};

export const STORYBOARD_SCENE_META_KIND = "toonstudio.storyboard-scene-cut-meta" as const;
export const STORYBOARD_SCENE_META_MAX_BYTES = 262_144;
export const STORYBOARD_SCENE_META_MAX_POSES = 512;

const MAX_JOINT_OVERRIDES = 1024;
const MAX_MORPH_OVERRIDES = 1024;

/* ── 값 복사·동결 ─────────────────────────────────────────────── */

function deepCopy<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => deepCopy(item)) as T;
  }
  if (typeof value === "object" && value !== null) {
    const source = value as Record<string, unknown>;
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      copy[key] = deepCopy(source[key]);
    }
    return copy as T;
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value as Record<string, unknown>)) {
      deepFreeze(item);
    }
    Object.freeze(value);
  }
  return value;
}

/* ── 검증 ─────────────────────────────────────────────────────── */

function fail(message: string): never {
  throw new Error(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireId(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 200) {
    fail(`${label}가 올바르지 않습니다.`);
  }
  return value;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function requireVec3(value: unknown, label: string): StudioBg3dVec3 {
  if (
    !Array.isArray(value) || value.length !== 3
    || !value.every((item) => isFiniteNumber(item))
  ) {
    fail(`${label}는 유한한 숫자 3개여야 합니다.`);
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

function optionalVec3(
  value: unknown,
  label: string,
): StudioBg3dVec3 | undefined {
  return value === undefined ? undefined : requireVec3(value, label);
}

function validateCamera(value: unknown): StudioBg3dCameraSettings {
  if (!isRecord(value)) fail("카메라 정보가 올바르지 않습니다.");
  const fov = value.fovDegrees;
  if (!isFiniteNumber(fov) || fov <= 0 || fov >= 180) {
    fail("카메라 화각은 0보다 크고 180보다 작아야 합니다.");
  }
  if (value.projection !== undefined && value.projection !== "perspective" && value.projection !== "orthographic") {
    fail("카메라 투영 방식이 올바르지 않습니다.");
  }
  if (value.zoom !== undefined && (!isFiniteNumber(value.zoom) || value.zoom <= 0)) {
    fail("카메라 줌은 양의 유한한 숫자여야 합니다.");
  }
  if (value.nearClip !== undefined && (!isFiniteNumber(value.nearClip) || value.nearClip <= 0)) {
    fail("카메라 근접 클립은 양의 유한한 숫자여야 합니다.");
  }
  let lensShift: readonly [number, number] | undefined;
  if (value.lensShift !== undefined) {
    const shift = value.lensShift;
    if (!Array.isArray(shift) || shift.length !== 2 || !shift.every((item) => isFiniteNumber(item))) {
      fail("카메라 렌즈 시프트는 유한한 숫자 2개여야 합니다.");
    }
    lensShift = [shift[0] as number, shift[1] as number];
  }
  return {
    position: requireVec3(value.position, "카메라 위치"),
    target: requireVec3(value.target, "카메라 목표"),
    fovDegrees: fov,
    ...(value.projection !== undefined
      ? { projection: value.projection as "perspective" | "orthographic" }
      : {}),
    ...(value.zoom !== undefined ? { zoom: value.zoom as number } : {}),
    ...(lensShift !== undefined ? { lensShift } : {}),
    ...(value.nearClip !== undefined ? { nearClip: value.nearClip as number } : {}),
    ...(value.up !== undefined ? { up: requireVec3(value.up, "카메라 업 벡터") } : {}),
  };
}

function validateDirectionalLight(value: unknown, label: string) {
  if (!isRecord(value)) fail(`${label} 정보가 올바르지 않습니다.`);
  if (typeof value.color !== "string" || !value.color) fail(`${label} 색상이 올바르지 않습니다.`);
  if (!isFiniteNumber(value.intensity) || value.intensity < 0) fail(`${label} 세기가 올바르지 않습니다.`);
  if (typeof value.castsShadow !== "boolean") fail(`${label} 그림자 여부가 올바르지 않습니다.`);
  return {
    color: value.color,
    direction: requireVec3(value.direction, `${label} 방향`),
    intensity: value.intensity,
    castsShadow: value.castsShadow,
  };
}

function validateLighting(value: unknown): StudioBg3dLightingSettings {
  if (!isRecord(value)) fail("조명 정보가 올바르지 않습니다.");
  if (typeof value.ambientColor !== "string" || !value.ambientColor) fail("주변광 색상이 올바르지 않습니다.");
  if (!isFiniteNumber(value.ambientIntensity) || value.ambientIntensity < 0) fail("주변광 세기가 올바르지 않습니다.");
  const lighting: StudioBg3dLightingSettings = {
    ambientColor: value.ambientColor,
    ambientIntensity: value.ambientIntensity,
    key: validateDirectionalLight(value.key, "키 조명"),
    fill: validateDirectionalLight(value.fill, "보조 조명"),
  };
  if (value.environment !== undefined) {
    const env = value.environment;
    if (!isRecord(env)) fail("환경광 정보가 올바르지 않습니다.");
    if (env.source !== "procedural" && env.source !== "hdri") fail("환경광 소스가 올바르지 않습니다.");
    if (env.assetId !== null && typeof env.assetId !== "string") fail("환경광 에셋이 올바르지 않습니다.");
    if (!isFiniteNumber(env.intensity) || !isFiniteNumber(env.rotationDegrees)) fail("환경광 수치가 올바르지 않습니다.");
    if (typeof env.useAsBackground !== "boolean") fail("환경광 배경 여부가 올바르지 않습니다.");
    return { ...lighting, environment: deepCopy(env) as unknown as StudioBg3dEnvironmentSettings };
  }
  return lighting;
}

function validateTransform(value: unknown, label: string): StudioBg3dTransform {
  if (!isRecord(value)) fail(`${label} 트랜스폼이 올바르지 않습니다.`);
  return {
    position: requireVec3(value.position, `${label} 위치`),
    rotation: requireVec3(value.rotation, `${label} 회전`),
    scale: requireVec3(value.scale, `${label} 배율`),
  };
}

function validatePose(value: unknown, label: string): StudioBg3dPoseLayer | null {
  if (value === null) return null;
  if (!isRecord(value)) fail(`${label} 포즈가 올바르지 않습니다.`);
  if (typeof value.enabled !== "boolean" || !isFiniteNumber(value.weight)) fail(`${label} 포즈 가중치가 올바르지 않습니다.`);
  if (!Array.isArray(value.joints) || value.joints.length > MAX_JOINT_OVERRIDES) fail(`${label} 관절 포즈가 올바르지 않습니다.`);
  const joints = value.joints.map((joint) => {
    if (!isRecord(joint) || typeof joint.jointKey !== "string" || !joint.jointKey) {
      fail(`${label} 관절 키가 올바르지 않습니다.`);
    }
    const rotation = joint.rotationOffset;
    if (!Array.isArray(rotation) || rotation.length !== 4 || !rotation.every((item) => isFiniteNumber(item))) {
      fail(`${label} 관절 회전은 유한한 숫자 4개여야 합니다.`);
    }
    return {
      jointKey: joint.jointKey,
      rotationOffset: [rotation[0], rotation[1], rotation[2], rotation[3]] as readonly [number, number, number, number],
    };
  });
  return { enabled: value.enabled, weight: value.weight, joints };
}

function validateMorph(value: unknown, label: string): StudioBg3dMorphLayer | null {
  if (value === null) return null;
  if (!isRecord(value)) fail(`${label} 모프가 올바르지 않습니다.`);
  if (typeof value.enabled !== "boolean" || !isFiniteNumber(value.weight)) fail(`${label} 모프 가중치가 올바르지 않습니다.`);
  if (!Array.isArray(value.targets) || value.targets.length > MAX_MORPH_OVERRIDES) fail(`${label} 모프 타깃이 올바르지 않습니다.`);
  const targets = value.targets.map((target) => {
    if (!isRecord(target) || typeof target.targetKey !== "string" || !target.targetKey || !isFiniteNumber(target.weightOffset)) {
      fail(`${label} 모프 타깃 값이 올바르지 않습니다.`);
    }
    return { targetKey: target.targetKey, weightOffset: target.weightOffset };
  });
  return { enabled: value.enabled, weight: value.weight, targets };
}

function validatePoseSnapshot(value: unknown): StoryboardScenePoseSnapshot {
  if (!isRecord(value)) fail("포즈 스냅샷이 올바르지 않습니다.");
  const nodeId = requireId(value.nodeId, "노드 ID");
  if (typeof value.name !== "string") fail("노드 이름이 올바르지 않습니다.");
  if (typeof value.visible !== "boolean") fail("노드 표시 여부가 올바르지 않습니다.");
  return {
    nodeId,
    name: value.name.slice(0, 200),
    visible: value.visible,
    transform: validateTransform(value.transform, `노드 ${nodeId}`),
    pose: validatePose(value.pose, `노드 ${nodeId}`),
    morph: validateMorph(value.morph, `노드 ${nodeId}`),
  };
}

function validateImage(value: unknown): StoryboardSceneCaptureImage | null {
  if (value === null) return null;
  if (!isRecord(value)) fail("캡처 이미지 정보가 올바르지 않습니다.");
  const ref = requireId(value.ref, "캡처 이미지 참조");
  if (
    !Number.isSafeInteger(value.width) || (value.width as number) <= 0 || (value.width as number) > 16384
    || !Number.isSafeInteger(value.height) || (value.height as number) <= 0 || (value.height as number) > 16384
  ) {
    fail("캡처 이미지 치수는 1–16384px 정수여야 합니다.");
  }
  return { ref, width: value.width as number, height: value.height as number };
}

/** 메타 값을 검증하고 동결된 정규 사본을 돌려준다. 형식이 깨졌으면 throw한다. */
export function validateStoryboardSceneCutMeta(value: unknown): StoryboardSceneCutMeta {
  if (!isRecord(value)) fail("씬 구도 메타가 올바르지 않습니다.");
  if (value.version !== 1) fail("지원하지 않는 씬 구도 메타 버전입니다.");
  if (value.sourceKind !== "bg3d" && value.sourceKind !== "poser") fail("씬 출처가 올바르지 않습니다.");
  const sceneId = requireId(value.sceneId, "씬 ID");
  if (value.shotId !== null && typeof value.shotId !== "string") fail("샷 ID가 올바르지 않습니다.");
  if (typeof value.capturedAt !== "string" || Number.isNaN(Date.parse(value.capturedAt))) {
    fail("캡처 시각이 올바르지 않습니다.");
  }
  if (!isFiniteNumber(value.exposure)) fail("노출 값이 올바르지 않습니다.");
  if (!Array.isArray(value.poses) || value.poses.length > STORYBOARD_SCENE_META_MAX_POSES) {
    fail(`포즈 스냅샷은 ${STORYBOARD_SCENE_META_MAX_POSES}개까지만 보존할 수 있습니다.`);
  }
  const poses = value.poses.map((pose) => validatePoseSnapshot(pose));
  if (new Set(poses.map((pose) => pose.nodeId)).size !== poses.length) {
    fail("포즈 스냅샷의 노드 ID가 중복됩니다.");
  }
  return deepFreeze({
    version: 1,
    sourceKind: value.sourceKind,
    sceneId,
    shotId: value.shotId === null ? null : requireId(value.shotId, "샷 ID"),
    capturedAt: value.capturedAt,
    camera: validateCamera(value.camera),
    lighting: validateLighting(value.lighting),
    exposure: value.exposure,
    poses,
    image: validateImage(value.image),
  });
}

/* ── 카메라 파생값 ────────────────────────────────────────────── */

/**
 * 업 벡터가 나타내는 더치 롤(도). 기본 업 (0,1,0)이 0도이고 +X 쪽으로 기울면 양수다.
 * 컷의 평면 필드(`cameraRollDeg`)용 근사이며, 정확한 복원은 메타의 `up` 원본으로 한다.
 */
export function cameraRollDegreesFromUp(up: StudioBg3dVec3 | undefined): number {
  if (!up) return 0;
  const [x, y] = up;
  if (!Number.isFinite(x) || !Number.isFinite(y) || (x === 0 && y === 0)) return 0;
  const degrees = (Math.atan2(x, y) * 180) / Math.PI;
  const rounded = Math.round(degrees * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

const ASPECT_VALUES: Readonly<Record<CutAspectRatio, number>> = {
  "21:9-wide-action": 21 / 9,
  "16:9-cinematic": 16 / 9,
  "1:1-square-medium": 1,
  "9:16-vertical-climax": 9 / 16,
};

const ASPECT_IDS = Object.keys(ASPECT_VALUES) as CutAspectRatio[];

/** 가로/세로 비율에 가장 가까운 컷 화면비를 고른다 (로그 거리 기준). */
export function nearestCutAspectRatio(ratio: number): CutAspectRatio {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    throw new Error("화면비를 계산할 수 없습니다.");
  }
  let best: CutAspectRatio = "1:1-square-medium";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const id of ASPECT_IDS) {
    const distance = Math.abs(Math.log(ratio / ASPECT_VALUES[id]));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = id;
    }
  }
  return best;
}

/* ── 캡처 → 컷 ────────────────────────────────────────────────── */

export interface CreateStoryboardCutFromSceneInput {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly title?: string;
  readonly sceneId: string;
  readonly sourceKind?: StoryboardSceneSourceKind;
  readonly document: StoryboardSceneDocumentView;
  /** 생략하면 문서의 활성 샷을 쓴다. 문서의 샷 목록에 없는 ID면 throw한다. */
  readonly shotId?: string | null;
  readonly capturedAt?: string;
  readonly image?: StoryboardSceneCaptureImage | null;
  readonly characterIds?: readonly string[];
}

function resolveShot(
  document: StoryboardSceneDocumentView,
  requested: string | null | undefined,
): StudioBg3dShot | null {
  const shotId = requested === undefined ? (document.activeShotId ?? null) : requested;
  if (shotId === null) return null;
  const shot = document.shots?.find((candidate) => candidate.id === shotId);
  if (!shot) {
    throw new Error(`씬 문서에 없는 샷입니다: ${shotId}`);
  }
  return shot;
}

function snapshotPoses(
  nodes: readonly StudioBg3dSceneNode[],
): StoryboardScenePoseSnapshot[] {
  return nodes.map((node) => ({
    nodeId: node.id,
    name: node.name,
    visible: node.visible,
    transform: deepCopy(node.transform),
    pose: node.kind === "model" && node.pose ? deepCopy(node.pose) : null,
    morph: node.kind === "model" && node.morph ? deepCopy(node.morph) : null,
  }));
}

/**
 * 현재 씬 문서의 구도를 동결해 콘티 컷으로 만든다. 카메라·조명·노출·포즈가
 * 메타에 함께 실리고, 컷의 평면 카메라 필드는 메타 카메라에서 파생한다 —
 * 두 표현이 어긋날 수 없다.
 */
export function createStoryboardCutFromSceneCapture(
  input: CreateStoryboardCutFromSceneInput,
): SceneLinkedStoryboardCut {
  const cutId = requireId(input.cutId, "컷 ID");
  if (!Number.isSafeInteger(input.cutNumber) || input.cutNumber <= 0) {
    throw new Error("컷 번호는 양의 정수여야 합니다.");
  }
  const shot = resolveShot(input.document, input.shotId);
  const meta = validateStoryboardSceneCutMeta({
    version: 1,
    sourceKind: input.sourceKind ?? "bg3d",
    sceneId: input.sceneId,
    shotId: shot?.id ?? null,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    camera: deepCopy(input.document.camera),
    lighting: deepCopy(input.document.lighting),
    exposure: input.document.render.exposure,
    poses: snapshotPoses(input.document.nodes),
    image: input.image ?? null,
  });
  const characterIds = input.characterIds
    ? [...new Set(input.characterIds)]
    : input.document.nodes.filter((node) => node.kind === "model").map((node) => node.id);
  const title = input.title?.trim()
    || shot?.name
    || `${meta.sourceKind === "poser" ? "포저 씬" : "3D 씬"} 컷 ${input.cutNumber}`;
  const aspectRatio = meta.image
    ? nearestCutAspectRatio(meta.image.width / meta.image.height)
    : "1:1-square-medium";
  const cut: SceneLinkedStoryboardCut = {
    id: cutId,
    cutNumber: input.cutNumber,
    title,
    aspectRatio,
    cameraPosition: [meta.camera.position[0]!, meta.camera.position[1]!, meta.camera.position[2]!],
    cameraTarget: [meta.camera.target[0]!, meta.camera.target[1]!, meta.camera.target[2]!],
    cameraFovDeg: meta.camera.fovDegrees,
    cameraRollDeg: cameraRollDegreesFromUp(meta.camera.up),
    characterIds: Object.freeze(characterIds),
    sceneMeta: meta,
  };
  return Object.freeze(cut);
}

/** 배치 시점에 새 ID·번호로 재발급한다. 동결된 메타는 그대로 공유한다. */
export function reissueSceneLinkedCut(
  cut: SceneLinkedStoryboardCut,
  next: { readonly id: string; readonly cutNumber: number },
): SceneLinkedStoryboardCut {
  const id = requireId(next.id, "컷 ID");
  if (!Number.isSafeInteger(next.cutNumber) || next.cutNumber <= 0) {
    throw new Error("컷 번호는 양의 정수여야 합니다.");
  }
  return Object.freeze({ ...cut, id, cutNumber: next.cutNumber });
}

/** 컷에 유효한 씬 메타가 실려 있으면 꺼내고, 아니면 null. 읽기 경로는 throw하지 않는다. */
export function getStoryboardSceneMeta(cut: StoryboardCut): StoryboardSceneCutMeta | null {
  if (!cut.sceneMeta) return null;
  try {
    return validateStoryboardSceneCutMeta(cut.sceneMeta);
  } catch {
    return null;
  }
}

/** 메타까지 검증된 씬 연결 컷으로 좁힌다. 복귀 버튼의 인자는 이 값으로만 만든다. */
export function asSceneLinkedStoryboardCut(
  cut: StoryboardCut,
): SceneLinkedStoryboardCut | null {
  const meta = getStoryboardSceneMeta(cut);
  return meta ? { ...cut, sceneMeta: meta } : null;
}

/* ── 컷 → 씬 복원 ─────────────────────────────────────────────── */

export interface StudioBg3dSceneRestoreNodePatch {
  readonly nodeId: string;
  readonly transform: StudioBg3dTransform;
  readonly visible: boolean;
  readonly pose: StudioBg3dPoseLayer | null;
  readonly morph: StudioBg3dMorphLayer | null;
}

export interface StudioBg3dSceneRestorePatch {
  readonly camera: StudioBg3dCameraSettings;
  readonly lighting: StudioBg3dLightingSettings;
  readonly exposure: number;
  /** 대상 문서에 같은 샷이 있을 때만 그 샷 ID, 없으면 null이다. */
  readonly shotId: string | null;
  readonly nodePatches: readonly StudioBg3dSceneRestoreNodePatch[];
  readonly missingNodeIds: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * 메타를 대상 씬 문서에 적용할 패치로 바꾼다. 대상에 없는 노드·샷은 조용히
 * 버리지 않고 missing 목록과 경고로 드러낸다.
 */
export function buildSceneRestorePatch(
  metaValue: unknown,
  document: StoryboardSceneDocumentView,
): StudioBg3dSceneRestorePatch {
  const meta = validateStoryboardSceneCutMeta(metaValue);
  const warnings: string[] = [];
  let shotId: string | null = null;
  if (meta.shotId !== null) {
    if (document.shots?.some((shot) => shot.id === meta.shotId)) {
      shotId = meta.shotId;
    } else {
      warnings.push(`shot-missing:${meta.shotId}`);
    }
  }
  const present = new Set(document.nodes.map((node) => node.id));
  const nodePatches: StudioBg3dSceneRestoreNodePatch[] = [];
  const missingNodeIds: string[] = [];
  for (const pose of meta.poses) {
    if (present.has(pose.nodeId)) {
      nodePatches.push({
        nodeId: pose.nodeId,
        transform: deepCopy(pose.transform),
        visible: pose.visible,
        pose: pose.pose ? deepCopy(pose.pose) : null,
        morph: pose.morph ? deepCopy(pose.morph) : null,
      });
    } else {
      missingNodeIds.push(pose.nodeId);
    }
  }
  if (missingNodeIds.length > 0) {
    warnings.push(`nodes-missing:${missingNodeIds.join(",")}`);
  }
  return deepFreeze({
    camera: deepCopy(meta.camera),
    lighting: deepCopy(meta.lighting),
    exposure: meta.exposure,
    shotId,
    nodePatches,
    missingNodeIds,
    warnings,
  });
}

function restoreNode(
  node: StudioBg3dSceneNode,
  patch: StudioBg3dSceneRestoreNodePatch,
): StudioBg3dSceneNode {
  if (node.kind !== "model") {
    return { ...node, transform: deepCopy(patch.transform), visible: patch.visible };
  }
  const { pose: _prevPose, morph: _prevMorph, ...rest } = node;
  return {
    ...rest,
    transform: deepCopy(patch.transform),
    visible: patch.visible,
    ...(patch.pose ? { pose: deepCopy(patch.pose) } : {}),
    ...(patch.morph ? { morph: deepCopy(patch.morph) } : {}),
  };
}

/** 패치를 씬 문서에 불변으로 적용한다. 카메라·조명·노출·포즈·활성 샷이 한 번에 돌아간다. */
export function applySceneRestorePatch<T extends StoryboardSceneDocumentView>(
  document: T,
  patch: StudioBg3dSceneRestorePatch,
): T {
  const patchByNodeId = new Map(patch.nodePatches.map((nodePatch) => [nodePatch.nodeId, nodePatch]));
  const nodes = document.nodes.map((node) => {
    const nodePatch = patchByNodeId.get(node.id);
    return nodePatch ? restoreNode(node, nodePatch) : node;
  });
  const { activeShotId: _previousShotId, ...rest } = document;
  return {
    ...rest,
    camera: deepCopy(patch.camera),
    lighting: deepCopy(patch.lighting),
    render: { ...document.render, exposure: patch.exposure },
    nodes,
    ...(patch.shotId ? { activeShotId: patch.shotId } : {}),
  } as unknown as T;
}

/* ── 복귀 딥링크·직렬화·배지 ───────────────────────────────────── */

/**
 * 씬 복귀 딥링크. 기획 표면의 시작 규약(`/studio/new?start=…`)과 같은 형태이며,
 * 호스트가 `start=bg3d`를 받으면 scene/shot/cut 식별자로 복원 패치를 재현한다.
 */
export function buildSceneReturnHref(
  meta: StoryboardSceneCutMeta,
  options: { readonly episodeId?: string | null; readonly cutId?: string } = {},
): string {
  const params = new URLSearchParams();
  params.set("start", "bg3d");
  params.set("scene", meta.sceneId);
  if (meta.shotId) params.set("shot", meta.shotId);
  if (options.cutId) params.set("cut", options.cutId);
  if (options.episodeId) params.set("episode", options.episodeId);
  return `/studio/new?${params.toString()}`;
}

/** 메타를 파일·클립보드로 옮길 수 있는 동결 JSON으로 만든다. */
export function serializeStoryboardSceneCutMeta(meta: StoryboardSceneCutMeta): string {
  const valid = validateStoryboardSceneCutMeta(meta);
  return JSON.stringify({ kind: STORYBOARD_SCENE_META_KIND, version: 1, meta: valid }, null, 2);
}

/** 직렬화된 메타를 다시 읽는다. 낯선 파일·깨진 값은 throw로 막는다. */
export function parseStoryboardSceneCutMeta(text: string): StoryboardSceneCutMeta {
  if (new TextEncoder().encode(text).byteLength > STORYBOARD_SCENE_META_MAX_BYTES) {
    throw new Error("씬 구도 메타 파일은 256KB 이하만 가져올 수 있습니다.");
  }
  const value: unknown = JSON.parse(text);
  if (!isRecord(value) || value.kind !== STORYBOARD_SCENE_META_KIND || value.version !== 1) {
    throw new Error("지원하는 툰스튜디오 씬 구도 메타 v1 파일이 아닙니다.");
  }
  return validateStoryboardSceneCutMeta(value.meta);
}

function formatDegrees(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** 컷 행에 붙는 한 줄 배지: 연결 여부·화각·포즈 수·조명 보존을 한 번에 보여준다. */
export function storyboardSceneMetaBadgeKo(meta: StoryboardSceneCutMeta): string {
  const posedCount = meta.poses.filter((pose) => pose.pose !== null).length;
  const parts = [
    meta.sourceKind === "poser" ? "포저 씬 연결" : "3D 씬 연결",
    `FOV ${formatDegrees(meta.camera.fovDegrees)}°`,
    ...(posedCount > 0 ? [`포즈 ${posedCount}개`] : []),
    "조명 보존",
  ];
  return parts.join(" · ");
}
