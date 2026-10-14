import {
  canonicalizeStudioVrmJointRotation,
  getStudioVrmJointLimit,
  type StudioVrmJointAxis,
  type StudioVrmJointAxisLimit,
  type StudioVrmJointRotation,
} from "./studio-vrm-joint-limits";
import {
  getEffectiveStudioVrmJointLimit,
  type StudioVrmRigProfileInput,
} from "./studio-vrm-rig-profile";

import type { VRMHumanBoneName } from "@pixiv/three-vrm";

/**
 * "해부학 한계" 근접 판정 — 셰이퍼 1단계(soft 리밋 경고)의 순수 판정 모델.
 *
 * soft 리밋은 막는 게 아니라 감쇠하는 방식이라, 사용자가 한계 근처에서 포즈를 만들고 있다는
 * 시각 신호가 없으면 "어색한데 가능해 보이는" 포즈가 그대로 남는다. 이 모듈은 현재 관절
 * 회전을 유효 리밋(리그 프로파일 적용본)과 대조해 핸들에 경고색·라벨을 붙일 판정만 만든다.
 * 판정은 표시 전용이다 — 회전 자체를 바꾸거나 막지 않는다.
 *
 * 이 판정은 스타일화된 드로잉 보조용 근사이며, 실제 사람의 해부학적 안전 범위를
 * 판단하는 의료 기능이 아니다(리그 프로파일 모듈과 같은 목적 선언을 따른다).
 */
export type StudioVrmJointLimitProximitySeverity = "near" | "at";

export interface StudioVrmJointLimitProximity {
  readonly severity: StudioVrmJointLimitProximitySeverity;
  /** 가장 한계에 가까운 축. */
  readonly axis: StudioVrmJointAxis;
  /**
   * soft 경계에서 hard 경계까지의 진행도 [0, 1]. soft 범위 안쪽 여유로 근접한
   * 경우에는 0이다(아직 soft를 넘지 않았다는 뜻).
   */
  readonly softExcessProgress: number;
  /** 핸들 title·aria에 붙는 사용자 문구. */
  readonly label: string;
}

const AXES = ["x", "y", "z"] as const satisfies readonly StudioVrmJointAxis[];

/** soft 범위 안쪽에서 경계까지 남은 여유가 soft 폭의 이 비율 이하이면 "근접"으로 본다. */
export const STUDIO_VRM_JOINT_LIMIT_PROXIMITY_INNER_MARGIN_RATIO = 0.12;
/** soft 초과 진행도가 이 값 이상이면 "한계 도달"로 본다. */
export const STUDIO_VRM_JOINT_LIMIT_PROXIMITY_AT_PROGRESS = 0.5;

export const STUDIO_VRM_JOINT_LIMIT_PROXIMITY_LABELS: Readonly<
  Record<StudioVrmJointLimitProximitySeverity, string>
> = Object.freeze({
  near: "해부학 한계에 가까워요",
  at: "해부학 한계에 닿았어요",
});

interface AxisProximity {
  readonly severity: StudioVrmJointLimitProximitySeverity;
  readonly softExcessProgress: number;
  /** 정렬용 심각도 점수. 클수록 한계에 가깝다. */
  readonly score: number;
}

function evaluateAxisProximity(
  value: number,
  limit: StudioVrmJointAxisLimit,
): AxisProximity | null {
  if (value > limit.softMax) {
    const span = limit.hardMax - limit.softMax;
    const progress = span > 0 ? Math.min(1, (value - limit.softMax) / span) : 1;
    return {
      severity: progress >= STUDIO_VRM_JOINT_LIMIT_PROXIMITY_AT_PROGRESS ? "at" : "near",
      softExcessProgress: progress,
      score: 1 + progress,
    };
  }
  if (value < limit.softMin) {
    const span = limit.softMin - limit.hardMin;
    const progress = span > 0 ? Math.min(1, (limit.softMin - value) / span) : 1;
    return {
      severity: progress >= STUDIO_VRM_JOINT_LIMIT_PROXIMITY_AT_PROGRESS ? "at" : "near",
      softExcessProgress: progress,
      score: 1 + progress,
    };
  }
  const softSpan = limit.softMax - limit.softMin;
  if (softSpan <= 0) return null;
  const margin = Math.min(value - limit.softMin, limit.softMax - value);
  if (margin / softSpan > STUDIO_VRM_JOINT_LIMIT_PROXIMITY_INNER_MARGIN_RATIO) return null;
  return {
    severity: "near",
    softExcessProgress: 0,
    score: 1 - margin / softSpan,
  };
}

/**
 * 한 관절의 현재 회전이 해부학 한계에 얼마나 가까운지 판정한다.
 * 경고가 필요 없으면 `null`. 프로파일 입력이 잘못되면 기본 리밋으로 fail-soft 한다
 * (경고 표시는 보조 기능이라 편집 자체를 막지 않는다).
 */
export function evaluateStudioVrmJointLimitProximity(
  boneName: VRMHumanBoneName | string,
  rotation: unknown,
  profileInput?: StudioVrmRigProfileInput | unknown,
): StudioVrmJointLimitProximity | null {
  const limit = (profileInput === undefined
    ? getStudioVrmJointLimit(boneName)
    : getEffectiveStudioVrmJointLimit(boneName, profileInput)
      ?? getStudioVrmJointLimit(boneName));
  const canonical = canonicalizeStudioVrmJointRotation(rotation);
  let worst: (AxisProximity & { readonly axis: StudioVrmJointAxis }) | null = null;
  for (const [index, axis] of AXES.entries()) {
    const evaluated = evaluateAxisProximity(canonical[index], limit[axis]);
    if (evaluated && (!worst || evaluated.score > worst.score)) {
      worst = { ...evaluated, axis };
    }
  }
  if (!worst) return null;
  return Object.freeze({
    severity: worst.severity,
    axis: worst.axis,
    softExcessProgress: worst.softExcessProgress,
    label: STUDIO_VRM_JOINT_LIMIT_PROXIMITY_LABELS[worst.severity],
  });
}

/** PoseBoneMap처럼 관절→회전 맵에서 경고가 필요한 관절만 추린 맵을 만든다. */
export function buildStudioVrmJointLimitProximityMap(
  bones: Readonly<Partial<Record<string, { readonly rotation?: unknown } | unknown>>>,
  profileInput?: StudioVrmRigProfileInput | unknown,
): Readonly<Partial<Record<string, StudioVrmJointLimitProximity>>> {
  const result: Partial<Record<string, StudioVrmJointLimitProximity>> = {};
  for (const [boneName, bone] of Object.entries(bones)) {
    if (!bone || typeof bone !== "object") continue;
    const rotation = (bone as { readonly rotation?: unknown }).rotation;
    if (rotation === undefined) continue;
    const proximity = evaluateStudioVrmJointLimitProximity(boneName, rotation, profileInput);
    if (proximity) result[boneName] = proximity;
  }
  return Object.freeze(result);
}
