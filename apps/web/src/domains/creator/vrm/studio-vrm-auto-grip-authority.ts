import {
  refineStudioVrmHandPose15Dof,
} from "./studio-vrm-hair-hand-equip-refiner";
import {
  STUDIO_VRM_FINGER_BONES,
  type StudioVrmFingerRotationMap,
} from "./studio-vrm-scene-document";

import type { FingerRotationMap } from "./studio-vrm-poser-utils";
import type { AutoGripFingerOverrides } from "./studio-vrm-prop-rig";

/**
 * 손가락 저작값과 소품에서 파생한 자동 그립의 단일 권한 계약.
 *
 * 자동 그립이 켜진 손은 소품 접촉이 최종 권위다. 자연 포즈도 손가락 30개를
 * 저작값으로 갖기 때문에 반대 순서로 합치면 스위치는 켜져도 그립이 전혀 보이지 않는다.
 * 비유한 자동 그립 값은 차단해 유효한 저작 손가락을 오염시키지 않는다.
 */
export function resolveStudioVrmFingerAuthority(
  authored: FingerRotationMap,
  autoGrip: AutoGripFingerOverrides,
): FingerRotationMap {
  const merged: Record<string, [number, number, number]> = {};
  for (const [boneName, rotation] of Object.entries(authored)) {
    if (rotation) merged[boneName] = [rotation[0], rotation[1], rotation[2]];
  }
  for (const [boneName, rotation] of Object.entries(autoGrip)) {
    if (!isFiniteRotation(rotation)) continue;
    merged[boneName] = [rotation[0], rotation[1], rotation[2]];
  }
  return merged as FingerRotationMap;
}

/** 자동 그립 권한 병합 후 양손에 15-DOF 해부학 관절 클램프(역관절·교차 차단)를 적용한다. */
export function resolveStudioVrmAnatomicalFingerAuthority(
  authored: FingerRotationMap,
  autoGrip: AutoGripFingerOverrides,
): FingerRotationMap {
  const merged = resolveStudioVrmFingerAuthority(authored, autoGrip) as Record<
    string,
    readonly [number, number, number]
  >;
  const refinedRight = refineStudioVrmHandPose15Dof("right", merged, {
    coupleDipToPip: false,
    enforceNonCrossingSpread: true,
    strengthenThumbCmc: false,
  });
  return refineStudioVrmHandPose15Dof("left", refinedRight, {
    coupleDipToPip: false,
    enforceNonCrossingSpread: true,
    strengthenThumbCmc: false,
  }) as FingerRotationMap;
}

function isFiniteRotation(value: unknown): value is readonly [number, number, number] {
  return Array.isArray(value)
    && value.length >= 3
    && value.slice(0, 3).every((component) => (
      typeof component === "number" && Number.isFinite(component)
    ));
}

/**
 * 휴대용 scene에는 사용자가 선택한 손가락 값만 저장한다. 자동 그립은 props의
 * rig 설정에서 다시 파생하며, 현재 보이는 결과를 굽는 일은 명시적인 '현재 자세 굽기'
 * 명령만 담당한다. 이 경계를 지켜야 저장·재로드 뒤에도 ON/OFF 의미가 바뀌지 않는다.
 */
export function createStudioVrmAuthoredFingerSnapshot(
  authored: FingerRotationMap,
): StudioVrmFingerRotationMap {
  const snapshot: StudioVrmFingerRotationMap = {};
  for (const boneName of STUDIO_VRM_FINGER_BONES) {
    const rotation = authored[boneName];
    if (!isFiniteRotation(rotation)) continue;
    snapshot[boneName] = [rotation[0], rotation[1], rotation[2]];
  }
  return snapshot;
}
