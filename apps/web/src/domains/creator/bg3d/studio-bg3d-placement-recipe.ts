/**
 * Pure one-click placement recipe for Studio 3D custom models.
 *
 * Engine-free: auto-fit → yaw → ground, with fail-closed validation. Callers publish the returned
 * transform through their normal history/state boundary.
 *
 * 기본은 모델 피벗이 바운딩 박스 중심이라고 가정한다. 가져온 모델은 피벗이 중심이 아닌 경우가 흔하므로
 * `boundsCenterOffset`(피벗 → 중심)을 주면 실제 경계 중심을 기준으로 접지·정렬한다.
 */

import {
  groundTransformPosition,
  halfExtentsFromSize,
  rotateVectorEulerXyz,
  type Bg3dVec3,
} from "./studio-bg3d-object-ops";

export type StudioBg3dPlacementVec3 = readonly [number, number, number];

export interface StudioBg3dModelPlacementRecipeInput {
  readonly position: StudioBg3dPlacementVec3;
  readonly rotation: StudioBg3dPlacementVec3;
  readonly scale: StudioBg3dPlacementVec3;
  /** Full axis-aligned model bounding size (before scale), matching groundModelTransform. */
  readonly boundingSize: StudioBg3dPlacementVec3;
  /**
   * When set, uniformly scales so the largest world-space extent of `boundingSize * scale`
   * is at most this many world units.
   */
  readonly autoFitTargetSize?: number;
  /** Ground plane Y. Defaults to 0 (same as groundModelTransform). */
  readonly groundY?: number;
  /** Degrees added to rotation Y after auto-fit. */
  readonly yawDegrees?: number;
  /**
   * 스케일 전 로컬 좌표에서 피벗(position)으로부터 바운딩 박스 중심까지의 벡터(중심 − 피벗). 없으면 [0, 0, 0]이며
   * 피벗이 중심이라고 가정한다(기존 동작).
   */
  readonly boundsCenterOffset?: StudioBg3dPlacementVec3;
  /** 지정하면 바운딩 박스 중심의 월드 X/Z 를 이 값으로 맞춘다. 없으면 입력 위치의 X/Z 를 유지한다. */
  readonly anchorCenterXZ?: readonly [number, number];
  /**
   * 지정하면 (스케일을 반영한) 모델 높이가 정확히 이 값(미터)이 되도록 균일 배율을 맞춘다. autoFitTargetSize 와 달리
   * 키우기도 한다. autoFitTargetSize 와 함께 쓸 수 없다.
   */
  readonly fitHeight?: number;
}

export type StudioBg3dModelPlacementRecipeResult =
  | {
      readonly ok: true;
      readonly position: StudioBg3dPlacementVec3;
      readonly rotation: StudioBg3dPlacementVec3;
      readonly scale: StudioBg3dPlacementVec3;
    }
  | {
      readonly ok: false;
      readonly reason: string;
    };

const EPSILON = 1e-9;
const ZERO_OFFSET: StudioBg3dPlacementVec3 = Object.freeze([0, 0, 0] as const);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isFiniteVec3(value: unknown): value is StudioBg3dPlacementVec3 {
  return Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) => isFiniteNumber(component));
}

function freezeVec3(value: readonly [number, number, number]): StudioBg3dPlacementVec3 {
  return Object.freeze([value[0], value[1], value[2]] as const);
}

function fail(reason: string): StudioBg3dModelPlacementRecipeResult {
  return Object.freeze({ ok: false, reason });
}

/**
 * Plans a grounded model placement from a seed transform.
 *
 * Order: validate → optional uniform auto-fit → yaw on rotation Y → ground Y via
 * halfExtentsFromSize + groundTransformPosition (same contract as groundModelTransform).
 * Original inputs are never mutated.
 */
export function planStudioBg3dModelPlacementRecipe(
  input: StudioBg3dModelPlacementRecipeInput,
): StudioBg3dModelPlacementRecipeResult {
  if (typeof input !== "object" || input === null) {
    return fail("배치 입력이 올바르지 않습니다.");
  }
  if (
    !isFiniteVec3(input.position) ||
    !isFiniteVec3(input.rotation) ||
    !isFiniteVec3(input.scale) ||
    !isFiniteVec3(input.boundingSize)
  ) {
    return fail("위치·회전·스케일·바운딩 값이 유한 수가 아닙니다.");
  }

  // Scale components must stay positive so half-extents and auto-fit stay well-defined.
  if (input.scale[0] === 0 || input.scale[1] === 0 || input.scale[2] === 0) {
    return fail("스케일은 0이 될 수 없습니다.");
  }

  let scaleX = input.scale[0];
  let scaleY = input.scale[1];
  let scaleZ = input.scale[2];

  const centerOffset = input.boundsCenterOffset ?? ZERO_OFFSET;
  if (!isFiniteVec3(centerOffset)) {
    return fail("경계 중심 오프셋이 유한 수가 아닙니다.");
  }
  const anchor = input.anchorCenterXZ;
  if (anchor !== undefined && (!Array.isArray(anchor) || anchor.length !== 2 || !anchor.every(isFiniteNumber))) {
    return fail("정렬 목표 좌표가 유한 수가 아닙니다.");
  }
  if (input.fitHeight !== undefined) {
    if (input.autoFitTargetSize !== undefined) {
      return fail("자동 맞춤과 높이 맞춤은 함께 쓸 수 없습니다.");
    }
    if (!isFiniteNumber(input.fitHeight) || input.fitHeight <= 0) {
      return fail("높이 맞춤 목표가 올바르지 않습니다.");
    }
    const height = Math.abs(input.boundingSize[1] * scaleY);
    if (!Number.isFinite(height) || height < EPSILON) {
      return fail("바운딩 높이를 알 수 없어 높이 맞춤 비율을 계산할 수 없습니다.");
    }
    const factor = input.fitHeight / height;
    if (!Number.isFinite(factor) || factor <= 0) {
      return fail("높이 맞춤 비율이 올바르지 않습니다.");
    }
    scaleX *= factor;
    scaleY *= factor;
    scaleZ *= factor;
  }

  if (input.autoFitTargetSize !== undefined) {
    if (!isFiniteNumber(input.autoFitTargetSize) || input.autoFitTargetSize <= 0) {
      return fail("자동 맞춤 목표 크기가 올바르지 않습니다.");
    }
    const extentX = Math.abs(input.boundingSize[0] * scaleX);
    const extentY = Math.abs(input.boundingSize[1] * scaleY);
    const extentZ = Math.abs(input.boundingSize[2] * scaleZ);
    const maxExtent = Math.max(extentX, extentY, extentZ);
    if (!Number.isFinite(maxExtent) || maxExtent < EPSILON) {
      return fail("바운딩 크기로부터 자동 맞춤 비율을 계산할 수 없습니다.");
    }
    if (maxExtent > input.autoFitTargetSize) {
      const factor = input.autoFitTargetSize / maxExtent;
      if (!Number.isFinite(factor) || factor <= 0) {
        return fail("자동 맞춤 비율이 올바르지 않습니다.");
      }
      scaleX *= factor;
      scaleY *= factor;
      scaleZ *= factor;
    }
  }

  const yawDegrees = input.yawDegrees ?? 0;
  if (!isFiniteNumber(yawDegrees)) {
    return fail("요(yaw) 각도가 유한 수가 아닙니다.");
  }
  const yawRadians = (yawDegrees * Math.PI) / 180;
  const rotation: [number, number, number] = [
    input.rotation[0],
    input.rotation[1] + yawRadians,
    input.rotation[2],
  ];
  if (!rotation.every(isFiniteNumber)) {
    return fail("회전 결과가 유한 수가 아닙니다.");
  }

  const groundY = input.groundY ?? 0;
  if (!isFiniteNumber(groundY)) {
    return fail("접지 높이가 유한 수가 아닙니다.");
  }

  const scale = freezeVec3([scaleX, scaleY, scaleZ]);
  const grounded = groundTransformPosition(
    input.position as Bg3dVec3,
    rotation,
    scale as Bg3dVec3,
    halfExtentsFromSize(input.boundingSize as Bg3dVec3),
    groundY,
  );
  // 접지 높이는 경계 중심 기준이다. 피벗이 중심에서 벗어난 만큼(회전·스케일 반영) 위치를 되돌린다.
  const pivotShift = rotateVectorEulerXyz(
    [centerOffset[0] * scaleX, centerOffset[1] * scaleY, centerOffset[2] * scaleZ],
    rotation as Bg3dVec3,
  );
  const position: [number, number, number] = [
    anchor ? anchor[0] - pivotShift[0] : grounded[0],
    grounded[1] - pivotShift[1],
    anchor ? anchor[1] - pivotShift[2] : grounded[2],
  ];
  if (!position.every(isFiniteNumber)) {
    return fail("접지 위치 결과가 유한 수가 아닙니다.");
  }

  return Object.freeze({
    ok: true,
    position: freezeVec3(position),
    rotation: freezeVec3(rotation),
    scale,
  });
}
