import type {
  CharacterQuaternion,
  CharacterVector3,
} from "../pose/character-pose-v2";
import { limitCharacterSwingTwist } from "./character-swing-twist";

/**
 * 트위스트 분배 런타임 — 셰이퍼 구조 개선 3단계(mannequin §5.4-3·P3).
 *
 * VRM 휴머노이드 표준 본에는 트위스트 보조본이 없어, 위팔/허벅지를 비틀면 그 회전이
 * 한 본에 몰려 캔디래퍼(단면 붕괴)로 읽힌다. 이 모듈은 swing-twist 분해로 위 본의
 * 비틀림을 뽑아 아래 본(전완/정강이)과 나눈다. 스킨이 아니라 본 회전 수준의 분배라
 * 보조본이 없는 임의 VRM에서도 동작하고, 위 본 회전과 아래 본 회전을 합친 최종
 * 자세(손·발의 월드 회전)는 분배 전과 동일하게 유지된다 — 달라지는 것은 비틀림이
 * 팔/다리 길이를 따라 퍼지는 방식뿐이다.
 */

const EPSILON = 1e-8;
const IDENTITY_QUATERNION: CharacterQuaternion = Object.freeze([0, 0, 0, 1]);

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeQuaternion(value: CharacterQuaternion): CharacterQuaternion {
  const length = Math.hypot(value[0], value[1], value[2], value[3]);
  if (!Number.isFinite(length) || length < EPSILON) return IDENTITY_QUATERNION;
  return Object.freeze([
    value[0] / length, value[1] / length, value[2] / length, value[3] / length,
  ]);
}

function multiplyQuaternion(
  left: CharacterQuaternion,
  right: CharacterQuaternion,
): CharacterQuaternion {
  const [lx, ly, lz, lw] = left;
  const [rx, ry, rz, rw] = right;
  return Object.freeze([
    lw * rx + lx * rw + ly * rz - lz * ry,
    lw * ry - lx * rz + ly * rw + lz * rx,
    lw * rz + lx * ry - ly * rx + lz * rw,
    lw * rw - lx * rx - ly * ry - lz * rz,
  ]);
}

function quaternionFromAxisAngle(
  axis: CharacterVector3,
  angle: number,
): CharacterQuaternion {
  const length = Math.hypot(axis[0], axis[1], axis[2]);
  if (!Number.isFinite(length) || length < EPSILON) return IDENTITY_QUATERNION;
  const half = angle * 0.5;
  const sine = Math.sin(half) / length;
  return normalizeQuaternion([
    axis[0] * sine, axis[1] * sine, axis[2] * sine, Math.cos(half),
  ]);
}

export interface CharacterTwistDistributionResult {
  /** 분배가 적용된 위 본 회전. 미적용이면 입력과 동일. */
  readonly upper: CharacterQuaternion;
  /** 분배가 적용된 아래 본 회전. 미적용이면 입력과 동일. */
  readonly lower: CharacterQuaternion;
  /** 위 본에서 뽑아낸 전체 비틀림(rad, 부호 포함). */
  readonly twistRadians: number;
  /** 아래 본으로 넘긴 비틀림(rad, 부호 포함). */
  readonly distributedRadians: number;
  readonly applied: boolean;
  readonly recoveredInvalidInput: boolean;
}

export interface CharacterTwistDistributionOptions {
  /** 아래 본으로 넘길 비율 [0, 1]. 기본 0.5. */
  readonly share?: number;
  /** 이 비틀림 이하에서는 포즈를 건드리지 않는다(rad). 기본 0.35(약 20°). */
  readonly deadzoneRadians?: number;
}

export const CHARACTER_TWIST_DISTRIBUTION_DEFAULT_DEADZONE_RADIANS = 0.35;

/**
 * 위 본 회전의 비틀림을 아래 본과 나눈다.
 *
 * 분해는 swing-twist 모듈에 위임하되, swing/twist 한계를 ±π로 열어 클램프 없이
 * swing·twist 성분만 얻는다. 위 본은 swing + 남은 비틀림으로 재조립하고, 아래 본은
 * 넘긴 비틀림을 부모 프레임 회전으로 앞에 곱한다(같은 축 회전끼리는 교환되므로
 * 합성 회전이 보존된다).
 */
export function distributeCharacterTwistRotation(input: {
  readonly upper: CharacterQuaternion;
  readonly lower: CharacterQuaternion;
  readonly twistAxis: CharacterVector3;
}, options: CharacterTwistDistributionOptions = {}): CharacterTwistDistributionResult {
  const share = clamp(Number.isFinite(options.share) ? options.share! : 0.5, 0, 1);
  const deadzone = Math.max(0, options.deadzoneRadians ?? CHARACTER_TWIST_DISTRIBUTION_DEFAULT_DEADZONE_RADIANS);
  // 정규화 전에 무효 입력을 기록한다(정규화가 항등으로 복구하면 흔적이 사라지므로).
  const inputRecovered =
    !input.upper.every(Number.isFinite) || Math.hypot(...input.upper) < EPSILON
    || !input.lower.every(Number.isFinite) || Math.hypot(...input.lower) < EPSILON;
  const upper = normalizeQuaternion(input.upper);
  const lower = normalizeQuaternion(input.lower);
  const decomposed = limitCharacterSwingTwist(upper, {
    twistAxis: input.twistAxis,
    maximumPrimarySwingRadians: Math.PI,
    maximumSecondarySwingRadians: Math.PI,
    minimumTwistRadians: -Math.PI,
    maximumTwistRadians: Math.PI,
  });
  const twistRadians = decomposed.twistRadians;
  if (share <= 0 || Math.abs(twistRadians) <= deadzone) {
    return Object.freeze({
      upper, lower, twistRadians, distributedRadians: 0,
      applied: false, recoveredInvalidInput: inputRecovered || decomposed.recoveredInvalidInput,
    });
  }
  const distributedRadians = twistRadians * share;
  const keptRadians = twistRadians - distributedRadians;
  const nextUpper = normalizeQuaternion(multiplyQuaternion(
    decomposed.swing,
    quaternionFromAxisAngle(input.twistAxis, keptRadians),
  ));
  const nextLower = normalizeQuaternion(multiplyQuaternion(
    quaternionFromAxisAngle(input.twistAxis, distributedRadians),
    lower,
  ));
  return Object.freeze({
    upper: nextUpper, lower: nextLower, twistRadians, distributedRadians,
    applied: true, recoveredInvalidInput: inputRecovered || decomposed.recoveredInvalidInput,
  });
}

/** 체인별 기본 분배 비율 — 팔은 절반, 다리는 정강이 비틀림이 부자연스러워 낮게 잡는다. */
export const CHARACTER_TWIST_DISTRIBUTION_CHAINS: Readonly<
  Record<string, { readonly lowerBone: string; readonly share: number }>
> = Object.freeze({
  leftUpperArm: Object.freeze({ lowerBone: "leftLowerArm", share: 0.5 }),
  rightUpperArm: Object.freeze({ lowerBone: "rightLowerArm", share: 0.5 }),
  leftUpperLeg: Object.freeze({ lowerBone: "leftLowerLeg", share: 0.35 }),
  rightUpperLeg: Object.freeze({ lowerBone: "rightLowerLeg", share: 0.35 }),
});

export interface CharacterTwistDistributionReceipt {
  readonly upperBone: string;
  readonly lowerBone: string;
  readonly twistRadians: number;
  readonly distributedRadians: number;
}

/**
 * 포즈 본 맵 전체에 체인별 트위스트 분배를 적용한다. 축(위 본 로컬 공간의 아래 본
 * 방향)은 리그를 아는 호출자가 제공한다. 축이 없거나 본이 없는 체인은 건너뛴다.
 * 입력 맵은 바꾸지 않는다.
 */
export function distributeCharacterPoseTwist(input: {
  readonly bones: Readonly<Record<string, CharacterQuaternion>>;
  readonly twistAxes: Readonly<Partial<Record<string, CharacterVector3>>>;
}, options: CharacterTwistDistributionOptions = {}): {
  readonly bones: Readonly<Record<string, CharacterQuaternion>>;
  readonly receipts: readonly CharacterTwistDistributionReceipt[];
} {
  const bones: Record<string, CharacterQuaternion> = { ...input.bones };
  const receipts: CharacterTwistDistributionReceipt[] = [];
  for (const [upperBone, chain] of Object.entries(CHARACTER_TWIST_DISTRIBUTION_CHAINS)) {
    const upper = bones[upperBone];
    const lower = bones[chain.lowerBone];
    const axis = input.twistAxes[upperBone];
    if (!upper || !lower || !axis) continue;
    const result = distributeCharacterTwistRotation(
      { upper, lower, twistAxis: axis },
      { ...options, share: options.share ?? chain.share },
    );
    if (!result.applied) continue;
    bones[upperBone] = result.upper;
    bones[chain.lowerBone] = result.lower;
    receipts.push(Object.freeze({
      upperBone, lowerBone: chain.lowerBone,
      twistRadians: result.twistRadians, distributedRadians: result.distributedRadians,
    }));
  }
  return Object.freeze({ bones: Object.freeze(bones), receipts: Object.freeze(receipts) });
}
