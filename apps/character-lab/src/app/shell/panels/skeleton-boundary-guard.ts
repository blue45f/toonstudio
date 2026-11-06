/**
 * 뷰포트 기즈모·제어점·포인터 드래그 호출 경계의 스켈레톤/좌표 안전 가드.
 *
 * 외부 제작(authored) 스켈레톤이나 합성 입력에 `NaN`/`Infinity` `restTranslation` 또는
 * 부모 본 순환(`a -> b -> a`)이 섞여 들어왔을 때 렌더 루프나 포인터 핸들러 전체가 중단되지 않도록 격리한다.
 * 정상 빈 결과(본 미존재·카메라 뒤쪽 역투영 불가 등)와 손상된 입력 실패를 구별하기 위해
 * 기존 `ADR-0018` `failVisible`(`LabFailure`) 진단 경로로 실패 코드와 한글 사유를 보고한다.
 */
import { computeWorldTransforms, type WorldTransformMap } from "../../../animation/skeleton-fk";
import { failVisible, isLabFailure, type LabFailure, type Pose, type SkeletonData, type Vec3 } from "../../../contracts";
import { v3IsFinite } from "../../../shared/math";

export type SkeletonBoundaryFailureCode =
  | "skeleton-cycle"
  | "skeleton-non-finite-rest"
  | "skeleton-invalid-input";

export interface SkeletonBoundaryOptions {
  /** 손상된 스켈레톤·비유한 좌표 등 경계 실패 시 기존 LabFailure 진단 경로로 원인을 전달한다 */
  readonly onFailure?: (failure: LabFailure) => void;
  /** 결정론적 테스트용 시각(epoch ms) */
  readonly now?: number;
}

export type SafeWorldTransformsResult =
  | { readonly ok: true; readonly transforms: WorldTransformMap }
  | { readonly ok: false; readonly failure: LabFailure };

export function isFinitePixelPair(pixel: readonly [number, number] | null | undefined): pixel is readonly [number, number] {
  return Array.isArray(pixel) && pixel.length >= 2 && Number.isFinite(pixel[0]) && Number.isFinite(pixel[1]);
}

/**
 * 스켈레톤 본 배열의 정적 결함(비배열 구조, 비유한 `restTranslation`, 부모 참조 순환)을 `O(N)`으로 진단한다.
 * 정상 스켈레톤(빈 `bones: []` 포함)은 `null`을 반환한다.
 */
export function diagnoseSkeletonData(skeleton: SkeletonData | null | undefined, now?: number): LabFailure | null {
  if (!skeleton || !Array.isArray(skeleton.bones)) {
    return failVisible("skeleton-invalid-input", "스켈레톤 본 목록(bones)이 올바른 배열이 아닙니다.", skeleton, now);
  }
  const parentByName = new Map<string, string | null>();
  for (const bone of skeleton.bones) {
    if (!bone || typeof bone.name !== "string" || bone.name.length === 0) {
      return failVisible("skeleton-invalid-input", "스켈레톤 본 항목이 손상되었거나 본 이름이 비어 있습니다.", bone, now);
    }
    if (parentByName.has(bone.name)) {
      return failVisible(
        "skeleton-invalid-input",
        `스켈레톤 본 이름 "${bone.name}"이(가) 중복되어 있습니다.`,
        { bone: bone.name },
        now,
      );
    }
    if (bone.parent !== null && (typeof bone.parent !== "string" || bone.parent.length === 0)) {
      return failVisible(
        "skeleton-invalid-input",
        `본 "${bone.name}"의 parent 형식이 올바르지 않습니다.`,
        { bone: bone.name, parent: bone.parent },
        now,
      );
    }
    if (
      !Array.isArray(bone.restTranslation) ||
      bone.restTranslation.length < 3 ||
      bone.restTranslation.slice(0, 3).some((v: unknown) => typeof v !== "number")
    ) {
      return failVisible(
        "skeleton-invalid-input",
        `본 "${bone.name}"의 restTranslation 형식이 올바르지 않습니다.`,
        { bone: bone.name, restTranslation: bone.restTranslation },
        now,
      );
    }
    if (!v3IsFinite(bone.restTranslation)) {
      return failVisible(
        "skeleton-non-finite-rest",
        `본 "${bone.name}"의 restTranslation이 유한하지 않습니다.`,
        { bone: bone.name, restTranslation: bone.restTranslation },
        now,
      );
    }
    if (
      !Array.isArray(bone.restRotation) ||
      bone.restRotation.length < 4 ||
      bone.restRotation.slice(0, 4).some((v: unknown) => typeof v !== "number" || !Number.isFinite(v)) ||
      Math.hypot(bone.restRotation[0], bone.restRotation[1], bone.restRotation[2], bone.restRotation[3]) < 1e-8
    ) {
      return failVisible(
        "skeleton-invalid-input",
        `본 "${bone.name}"의 restRotation 형식이 올바르지 않습니다.`,
        { bone: bone.name, restRotation: bone.restRotation },
        now,
      );
    }
    parentByName.set(bone.name, bone.parent);
  }

  // O(N) 부모 사슬 순환 검사
  const verified = new Set<string>();
  for (const bone of skeleton.bones) {
    if (verified.has(bone.name)) continue;
    const visiting = new Set<string>();
    let cursor: string | null = bone.name;
    while (cursor !== null) {
      if (verified.has(cursor)) break;
      if (visiting.has(cursor)) {
        return failVisible(
          "skeleton-cycle",
          `스켈레톤 본 "${bone.name}"의 부모 관계에 순환이 있습니다.`,
          { bone: bone.name, cycleAt: cursor },
          now,
        );
      }
      visiting.add(cursor);
      cursor = parentByName.get(cursor) ?? null;
    }
    for (const node of visiting) verified.add(node);
  }

  return null;
}

/**
 * 하위 FK/IK 계산에서 발생한 예외가 예측 가능한 스켈레톤 경계 오류인지 판별해 `LabFailure`로 변환한다.
 * 예측 가능한 스켈레톤 오류가 아니면 `null`을 반환해 호출자가 예기치 않은 프로그래밍 오류를 삼키지 않게 한다.
 */
export function classifySkeletonBoundaryError(error: unknown, now?: number): LabFailure | null {
  if (isLabFailure(error)) return error;
  if (error instanceof Error) {
    if (/순환/u.test(error.message)) {
      return failVisible("skeleton-cycle", error.message, error, now);
    }
    if (/restTranslation|유한하지/u.test(error.message)) {
      return failVisible("skeleton-non-finite-rest", error.message, error, now);
    }
    if (/IK 체인|연속된 부모-자식/u.test(error.message)) {
      return failVisible("skeleton-invalid-input", error.message, error, now);
    }
  }
  return null;
}

export function reportBoundaryFailure(failure: LabFailure, options?: SkeletonBoundaryOptions): LabFailure {
  options?.onFailure?.(failure);
  return failure;
}

export function reportInvalidPivotWorld(pivotWorld: Vec3, options?: SkeletonBoundaryOptions): LabFailure {
  const failure = failVisible(
    "skeleton-invalid-input",
    "드래그 피벗의 월드 좌표(pivotWorld)가 유한하지 않습니다.",
    { pivotWorld },
    options?.now,
  );
  return reportBoundaryFailure(failure, options);
}

/**
 * 스켈레톤 정적 진단 후 `computeWorldTransforms`를 안전하게 실행한다.
 * 손상된 스켈레톤이면 `options.onFailure`에 `LabFailure`를 전달하고 `{ ok: false, failure }`를 반환한다.
 */
export function safeComputeWorldTransforms(
  skeleton: SkeletonData,
  pose: Pose,
  options?: SkeletonBoundaryOptions,
): SafeWorldTransformsResult {
  const precheck = diagnoseSkeletonData(skeleton, options?.now);
  if (precheck) {
    return { ok: false, failure: reportBoundaryFailure(precheck, options) };
  }
  try {
    const transforms = computeWorldTransforms(skeleton, pose);
    return { ok: true, transforms };
  } catch (error) {
    const classified = classifySkeletonBoundaryError(error, options?.now);
    if (classified) {
      return { ok: false, failure: reportBoundaryFailure(classified, options) };
    }
    throw error;
  }
}
