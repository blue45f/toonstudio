/**
 * VRM 0.x(+Z Unity / -Z glTF) vs VRM 1.0(-Z 반전 / +Z three-vrm) 전방축 자동 정규화 (#030).
 *
 * ToonStudio 뷰포트의 정면 카메라 프리셋은 `+Z` 위치에서 원점(`-Z` 방향)을 바라본다.
 * VRM 0.x와 VRM 1.0의 전방축 규약 차이로 인해 회전 보정이 누락되거나 `faceFront`가
 * 뒤집힌 모델은 정면·상반신·얼굴 줌 프리셋이 캐릭터의 뒤통수를 비추는 문제가 생긴다.
 *
 * 이 모듈은 메타 버전(`metaVersion`), `lookAt.faceFront`, 눈-머리 로컬 오프셋,
 * 현재 씬 기준 Y 회전을 종합해 실제 월드 전방 벡터를 판정하고,
 * ① 카메라 프리셋 회전 보정(`normalizeCameraPresetForVrmForward`)과
 * ② 씬 루트 멱등 전방 정규화(`normalizeVrmSceneForwardAxis`)를 제공한다.
 */
import * as THREE from "three";

import { STUDIO_VRM_BASE_ROTATION_Y_KEY } from "./studio-vrm-asset-runtime";

import type { CameraPreset } from "./studio-vrm-poser-catalogs";
import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";

export type VrmMetaVersionFamily = "0.x" | "1.0" | "unknown";
export type VrmForwardVec3 = readonly [x: number, y: number, z: number];
export type VrmForwardAxisSource =
  | "lookAt-faceFront"
  | "meta-version"
  | "eye-landmark"
  | "fallback";

export interface VrmSpecForwardAxisDefinition {
  readonly family: VrmMetaVersionFamily;
  /** 명세 기준 전방축 표기 (VRM 0.x Unity `+Z`, VRM 1.0 축 반전 `-Z`). */
  readonly specForward: VrmForwardVec3;
  /** `@pixiv/three-vrm` 로드 직후 회전 전 glTF 로컬 공간에서의 얼굴 정면 벡터. */
  readonly gltfLocalForward: VrmForwardVec3;
  /** 캐노니컬 뷰포트 정면(`+Z`)을 향하도록 맞추는 기본 Y 회전(rad). */
  readonly defaultBaseRotationY: number;
}

/** ToonStudio 뷰포트 정면 카메라(`position.z > target.z`)와 마주 보는 표준 캐릭터 전방축. */
export const VRM_CANONICAL_WORLD_FORWARD: VrmForwardVec3 = Object.freeze([0, 0, 1]);

/** VRM 0.x / 1.0 메타 버전별 전방축 규약 테이블. */
export const VRM_SPEC_FORWARD_AXES: Readonly<
  Record<VrmMetaVersionFamily, VrmSpecForwardAxisDefinition>
> = Object.freeze({
  "0.x": Object.freeze({
    family: "0.x",
    specForward: Object.freeze([0, 0, 1] as const),
    gltfLocalForward: Object.freeze([0, 0, -1] as const),
    defaultBaseRotationY: Math.PI,
  }),
  "1.0": Object.freeze({
    family: "1.0",
    specForward: Object.freeze([0, 0, -1] as const),
    gltfLocalForward: Object.freeze([0, 0, 1] as const),
    defaultBaseRotationY: 0,
  }),
  unknown: Object.freeze({
    family: "unknown",
    specForward: Object.freeze([0, 0, 1] as const),
    gltfLocalForward: Object.freeze([0, 0, 1] as const),
    defaultBaseRotationY: 0,
  }),
});

export interface VrmForwardAxisInput {
  readonly metaVersion?: string | number | null;
  readonly faceFront?: VrmForwardVec3 | Readonly<{ x: number; y: number; z: number }> | null;
  readonly sceneRotationY?: number | null;
  readonly baseRotationY?: number | null;
  readonly eyeCenterLocalZ?: number | null;
  /**
   * `true`(기본값)이면 `baseRotationY`가 기록된 경우 사용자 턴테이블(`bodyRotation`)을
   * 제외한 모델 기본 정렬 축을 기준으로 전방축 반전 여부를 판정한다.
   */
  readonly ignoreUserBodyRotation?: boolean;
}

export interface VrmForwardAxisResolution {
  readonly metaVersion: VrmMetaVersionFamily;
  readonly source: VrmForwardAxisSource;
  readonly specForward: VrmForwardVec3;
  readonly localForward: VrmForwardVec3;
  readonly worldForward: VrmForwardVec3;
  readonly appliedSceneRotationY: number;
  readonly recommendedBaseRotationY: number;
  readonly cameraYawCorrectionRad: number;
  readonly facesFrontCamera: boolean;
  readonly needsFlipForFrontCamera: boolean;
}

export interface VrmForwardAxisSourceLike {
  readonly meta?: { readonly metaVersion?: string | number | null } | null;
  readonly lookAt?: {
    readonly faceFront?: Readonly<{ x: number; y: number; z: number }> | null;
  } | null;
  readonly scene?: {
    readonly rotation?: { y: number } | null;
    readonly userData?: Record<string, unknown> | null;
    updateMatrixWorld?: (force?: boolean) => void;
  } | null;
  readonly humanoid?: {
    getNormalizedBoneNode?: (name: VRMHumanBoneName) => THREE.Object3D | null;
  } | null;
}

export interface NormalizeVrmSceneForwardResult {
  readonly didNormalize: boolean;
  readonly previousRotationY: number;
  readonly nextRotationY: number;
  readonly resolution: VrmForwardAxisResolution;
}

const FULL_TURN_RAD = Math.PI * 2;
const VECTOR_EPSILON = 1e-6;
const EYE_OFFSET_EPSILON = 0.002;

function normalizeAngleRad(radians: number): number {
  if (!Number.isFinite(radians)) return 0;
  const wrapped = ((radians + Math.PI) % FULL_TURN_RAD + FULL_TURN_RAD) % FULL_TURN_RAD - Math.PI;
  // -PI는 +PI로 일관 정규화해 180도 보정 부호 흔들림을 막는다.
  if (Math.abs(wrapped + Math.PI) < 1e-9) return Math.PI;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

function cleanZero(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) < 1e-12) return 0;
  return Object.is(value, -0) ? 0 : value;
}

function normalizeHorizontalOrVec3(
  input: VrmForwardVec3 | Readonly<{ x: number; y: number; z: number }> | null | undefined,
): VrmForwardVec3 | null {
  if (!input) return null;
  const x = Array.isArray(input) ? input[0] : (input as { x: number }).x;
  const y = Array.isArray(input) ? input[1] : (input as { y: number }).y;
  const z = Array.isArray(input) ? input[2] : (input as { z: number }).z;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  const length = Math.hypot(x, y, z);
  if (length < VECTOR_EPSILON) return null;
  return Object.freeze([
    cleanZero(x / length),
    cleanZero(y / length),
    cleanZero(z / length),
  ] as const);
}

function rotateVec3Y(vec: VrmForwardVec3, yawRad: number): VrmForwardVec3 {
  const cos = Math.cos(yawRad);
  const sin = Math.sin(yawRad);
  return Object.freeze([
    cleanZero(vec[0] * cos + vec[2] * sin),
    cleanZero(vec[1]),
    cleanZero(-vec[0] * sin + vec[2] * cos),
  ] as const);
}

/** `metaVersion` 문자열/숫자를 VRM 0.x / 1.0 패밀리로 정규화한다. */
export function parseVrmMetaVersion(value: unknown): VrmMetaVersionFamily {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 0 && value < 1) return "0.x";
    if (value >= 1 && value < 2) return "1.0";
    return "unknown";
  }
  if (typeof value !== "string") return "unknown";
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "0"
    || normalized === "0.0"
    || normalized === "0.x"
    || normalized === "vrm0"
    || normalized.startsWith("0.")
  ) {
    return "0.x";
  }
  if (
    normalized === "1"
    || normalized === "1.0"
    || normalized === "1.x"
    || normalized === "vrm1"
    || normalized.startsWith("1.")
  ) {
    return "1.0";
  }
  return "unknown";
}

/** 메타 버전별 VRM 전방축 명세 정의를 반환한다. */
export function resolveVrmSpecForwardAxis(
  metaVersion: string | number | null | undefined,
): VrmSpecForwardAxisDefinition {
  return VRM_SPEC_FORWARD_AXES[parseVrmMetaVersion(metaVersion)];
}

/**
 * 메타 버전·`lookAt.faceFront`·눈 위치·현재 씬 Y 회전을 조합해
 * 캐릭터의 실제 월드 전방 벡터와 정면 카메라 보정 각도를 계산한다.
 */
export function resolveVrmForwardAxis(
  input: VrmForwardAxisInput = {},
): VrmForwardAxisResolution {
  const family = parseVrmMetaVersion(input.metaVersion);
  const spec = VRM_SPEC_FORWARD_AXES[family];
  const explicitFront = normalizeHorizontalOrVec3(input.faceFront);

  let localForward: VrmForwardVec3;
  let source: VrmForwardAxisSource;

  if (explicitFront && Math.hypot(explicitFront[0], explicitFront[2]) > 0.5) {
    localForward = explicitFront;
    source = "lookAt-faceFront";
  } else if (family !== "unknown") {
    localForward = spec.gltfLocalForward;
    source = "meta-version";
  } else if (
    typeof input.eyeCenterLocalZ === "number"
    && Number.isFinite(input.eyeCenterLocalZ)
    && Math.abs(input.eyeCenterLocalZ) > EYE_OFFSET_EPSILON
  ) {
    localForward = Object.freeze([0, 0, input.eyeCenterLocalZ < 0 ? -1 : 1] as const);
    source = "eye-landmark";
  } else {
    localForward = VRM_CANONICAL_WORLD_FORWARD;
    source = "fallback";
  }

  const ignoreUserBodyRotation = input.ignoreUserBodyRotation ?? true;
  const hasRecordedBase =
    typeof input.baseRotationY === "number" && Number.isFinite(input.baseRotationY);
  const rawSceneRotationY =
    typeof input.sceneRotationY === "number" && Number.isFinite(input.sceneRotationY)
      ? input.sceneRotationY
      : 0;
  const appliedSceneRotationY = normalizeAngleRad(
    ignoreUserBodyRotation && hasRecordedBase ? input.baseRotationY! : rawSceneRotationY,
  );

  const worldForward = rotateVec3Y(localForward, appliedSceneRotationY);
  const localYawFromCanonical = normalizeAngleRad(Math.atan2(localForward[0], localForward[2]));
  const recommendedBaseRotationY = normalizeAngleRad(-localYawFromCanonical);
  const worldYawFromCanonical = normalizeAngleRad(Math.atan2(worldForward[0], worldForward[2]));
  const facesFrontCamera = worldForward[2] >= 0;
  const needsFlipForFrontCamera = worldForward[2] < -VECTOR_EPSILON;

  return Object.freeze({
    metaVersion: family,
    source,
    specForward: spec.specForward,
    localForward,
    worldForward,
    appliedSceneRotationY,
    recommendedBaseRotationY,
    cameraYawCorrectionRad: worldYawFromCanonical,
    facesFrontCamera,
    needsFlipForFrontCamera,
  });
}

function measureEyeCenterLocalZ(vrm: VrmForwardAxisSourceLike): number | null {
  const head = vrm.humanoid?.getNormalizedBoneNode?.("head") ?? null;
  const leftEye = vrm.humanoid?.getNormalizedBoneNode?.("leftEye") ?? null;
  const rightEye = vrm.humanoid?.getNormalizedBoneNode?.("rightEye") ?? null;
  if (!head || !leftEye || !rightEye) return null;
  try {
    const leftLocal = head.worldToLocal(leftEye.getWorldPosition(new THREE.Vector3()));
    const rightLocal = head.worldToLocal(rightEye.getWorldPosition(new THREE.Vector3()));
    const centerZ = (leftLocal.z + rightLocal.z) / 2;
    return Number.isFinite(centerZ) ? centerZ : null;
  } catch {
    return null;
  }
}

/** 로드된 VRM 인스턴스에서 전방축 정규화 상태를 판정한다. */
export function resolveVrmForwardAxisFromVrm(
  vrm: VRM | VrmForwardAxisSourceLike | null | undefined,
  options: { readonly ignoreUserBodyRotation?: boolean } = {},
): VrmForwardAxisResolution {
  if (!vrm) return resolveVrmForwardAxis();
  const recordedBase = vrm.scene?.userData?.[STUDIO_VRM_BASE_ROTATION_Y_KEY];
  const baseRotationY =
    typeof recordedBase === "number" && Number.isFinite(recordedBase) ? recordedBase : null;
  const sceneRotationY =
    typeof vrm.scene?.rotation?.y === "number" && Number.isFinite(vrm.scene.rotation.y)
      ? vrm.scene.rotation.y
      : 0;
  const metaVersion = vrm.meta?.metaVersion ?? null;
  const faceFront = vrm.lookAt?.faceFront ?? null;
  const eyeCenterLocalZ =
    !faceFront && parseVrmMetaVersion(metaVersion) === "unknown"
      ? measureEyeCenterLocalZ(vrm)
      : null;
  return resolveVrmForwardAxis({
    metaVersion,
    faceFront,
    sceneRotationY,
    baseRotationY,
    eyeCenterLocalZ,
    ignoreUserBodyRotation: options.ignoreUserBodyRotation ?? true,
  });
}

function isForwardAxisResolution(
  value: unknown,
): value is VrmForwardAxisResolution {
  return (
    typeof value === "object"
    && value !== null
    && "cameraYawCorrectionRad" in value
    && "needsFlipForFrontCamera" in value
    && "worldForward" in value
  );
}

function isVrmForwardSource(value: unknown): value is VrmForwardAxisSourceLike {
  return (
    typeof value === "object"
    && value !== null
    && ("scene" in value || "meta" in value || "lookAt" in value || "humanoid" in value)
  );
}

/**
 * 카메라 프리셋이 캐릭터 뒤통수를 비추지 않도록 VRM 전방축 기준으로 카메라 위치를 보정한다.
 *
 * - 이미 `+Z` 정면을 바라보는 VRM(정상 회전된 0.x 및 표준 1.0)은 원본 프리셋을 그대로 반환한다.
 * - 회전되지 않은 VRM 0.x나 `-Z` 전방 VRM 1.0은 타깃 중심으로 카메라 위치를 Y축 회전해
 *   정면·사선·상반신·얼굴 줌 프리셋이 항상 얼굴을 비추도록 보정한다.
 */
export function normalizeCameraPresetForVrmForward(
  preset: CameraPreset,
  subject:
    | VRM
    | VrmForwardAxisSourceLike
    | VrmForwardAxisResolution
    | VrmForwardAxisInput
    | null
    | undefined,
  options: { readonly alignToFullYaw?: boolean } = {},
): CameraPreset {
  if (!subject) return preset;
  const resolution = isForwardAxisResolution(subject)
    ? subject
    : isVrmForwardSource(subject)
      ? resolveVrmForwardAxisFromVrm(subject, {
          ignoreUserBodyRotation: !(options.alignToFullYaw ?? false),
        })
      : resolveVrmForwardAxis(subject);

  const yawRad = options.alignToFullYaw
    ? resolution.cameraYawCorrectionRad
    : resolution.needsFlipForFrontCamera
      ? resolution.cameraYawCorrectionRad
      : 0;

  if (!Number.isFinite(yawRad) || Math.abs(yawRad) < VECTOR_EPSILON) {
    return preset;
  }

  const offset: VrmForwardVec3 = [
    preset.position[0] - preset.target[0],
    preset.position[1] - preset.target[1],
    preset.position[2] - preset.target[2],
  ];
  const rotatedOffset = rotateVec3Y(offset, yawRad);
  const nextPosition: [number, number, number] = [
    cleanZero(preset.target[0] + rotatedOffset[0]),
    cleanZero(preset.target[1] + rotatedOffset[1]),
    cleanZero(preset.target[2] + rotatedOffset[2]),
  ];

  return {
    ...preset,
    position: nextPosition,
    target: [preset.target[0], preset.target[1], preset.target[2]],
  };
}

/**
 * VRM 씬 루트의 Y 회전을 캐노니컬 정면(`+Z`)으로 멱등 정규화한다.
 * 이미 정면을 향한 VRM에는 중복 회전을 적용하지 않는다.
 */
export function normalizeVrmSceneForwardAxis(
  vrm: VRM | VrmForwardAxisSourceLike,
): NormalizeVrmSceneForwardResult {
  const before = resolveVrmForwardAxisFromVrm(vrm, { ignoreUserBodyRotation: true });
  const previousRotationY =
    typeof vrm.scene?.rotation?.y === "number" && Number.isFinite(vrm.scene.rotation.y)
      ? vrm.scene.rotation.y
      : 0;

  if (!before.needsFlipForFrontCamera || !vrm.scene?.rotation) {
    return Object.freeze({
      didNormalize: false,
      previousRotationY,
      nextRotationY: previousRotationY,
      resolution: before,
    });
  }

  const deltaY = normalizeAngleRad(-before.cameraYawCorrectionRad);
  const nextRotationY = normalizeAngleRad(previousRotationY + deltaY);
  vrm.scene.rotation.y = nextRotationY;
  if (vrm.scene.userData) {
    const prevBase =
      typeof vrm.scene.userData[STUDIO_VRM_BASE_ROTATION_Y_KEY] === "number"
        ? (vrm.scene.userData[STUDIO_VRM_BASE_ROTATION_Y_KEY] as number)
        : previousRotationY;
    vrm.scene.userData[STUDIO_VRM_BASE_ROTATION_Y_KEY] = normalizeAngleRad(prevBase + deltaY);
  }
  vrm.scene.updateMatrixWorld?.(true);

  const after = resolveVrmForwardAxisFromVrm(vrm, { ignoreUserBodyRotation: true });
  return Object.freeze({
    didNormalize: true,
    previousRotationY,
    nextRotationY,
    resolution: after,
  });
}
