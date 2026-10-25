/**
 * Studio 셰이퍼 — 포즈 파이프라인 + 의복 따라가기 바인딩.
 *
 * 셰이퍼 패널은 그동안 체형 슬라이더만 데생 인형에 실시간으로 반영하고,
 * 코디(상의·하의·신발)는 "인형 적용 제외·SVG 미리보기"로 남았다. 이 모듈은
 * 셰이퍼의 포즈·의복을 인형에 배선하는 순수 경로다:
 *
 *   포즈: 정규화(관절 한계) → 2본 IK(손·발 목표) → 재 정규화 → 자동 접지
 *   의복: 체형 스펙의 부위 반지름에서 부위별 배율을 유도해 의복을 변형
 *         (고정 오버레이가 아니다). 상의·하의·신발의 rigid 오버레이는
 *         fail-closed로 거부된다.
 *
 * IK 좌표 규약: 목표점은 FK 월드 프레임(rootOffset 0·rootYaw 0)과 같다.
 * 체인 루트의 부모 프레임으로 변환할 때는 회전 행렬이 직교 행렬이라
 * 전치행렬이 역행렬과 같다는 점을 쓴다(Mat3은 row-major).
 */

import {
  computeStudioMannequinJointFrames,
  studioMannequinMat3Apply,
  type StudioMannequinMat3,
} from "./studio-mannequin-forward-kinematics";
import {
  groundStudioMannequinPose,
  type StudioMannequinGroundStance,
} from "./studio-mannequin-foot-grounding";
import {
  solveStudioMannequinTwoBoneIk,
  type StudioMannequinIkResult,
} from "./studio-mannequin-ik";
import {
  buildStudioMannequinSpec,
  getStudioMannequinJointLimit,
  STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  type StudioMannequinBodyParams,
  type StudioMannequinChainId,
  type StudioMannequinJointId,
  type StudioMannequinSpec,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import {
  normalizeStudioMannequinPose,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";

/** IK 목표 — 체인 효과기(손목·발목)를 향한 월드 목표점. */
export interface StudioShaperIkTarget {
  readonly chainId: StudioMannequinChainId;
  readonly target: StudioMannequinVec3;
}

export interface StudioShaperPosePipelineInput {
  readonly params?: Partial<StudioMannequinBodyParams>;
  readonly spec?: StudioMannequinSpec;
  readonly pose: StudioMannequinPose;
  readonly ikTargets?: readonly StudioShaperIkTarget[];
  /** 자동 접지 적용 여부. 기본 true. */
  readonly ground?: boolean;
}

export interface StudioShaperIkReport {
  readonly chainId: StudioMannequinChainId;
  readonly reachable: boolean;
  readonly reached: boolean;
  readonly endDistanceToTargetM: number;
  readonly clampedByLimits: boolean;
}

export interface StudioShaperPosePipelineResult {
  readonly spec: StudioMannequinSpec;
  readonly pose: StudioMannequinPose;
  readonly ik: readonly StudioShaperIkReport[];
  readonly grounded: boolean;
  readonly pelvisLiftMeters: number;
  readonly stance: StudioMannequinGroundStance | undefined;
}

function sub(a: StudioMannequinVec3, b: StudioMannequinVec3): StudioMannequinVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add(a: StudioMannequinVec3, b: StudioMannequinVec3): StudioMannequinVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(vector: StudioMannequinVec3, factor: number): StudioMannequinVec3 {
  return [vector[0] * factor, vector[1] * factor, vector[2] * factor];
}

function dot(a: StudioMannequinVec3, b: StudioMannequinVec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function length(vector: StudioMannequinVec3): number {
  return Math.sqrt(dot(vector, vector));
}

function isFiniteVec3(value: unknown): value is StudioMannequinVec3 {
  return Array.isArray(value)
    && value.length === 3
    && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

/** 직교 회전 행렬의 전치 = 역행렬. */
function transposeMat3(m: StudioMannequinMat3): StudioMannequinMat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

/**
 * 셰이퍼 포즈를 IK·관절 한계·접지 순으로 푼다. IK 목표가 없으면
 * 정규화 + 접지만 적용한다. 도달 불가 목표는 IK가 최대한 뻗은 자세를
 * 돌려주고 reached=false로 보고한다(조용히 목표에 붙이지 않는다).
 */
export function resolveStudioShaperPose(
  input: StudioShaperPosePipelineInput,
): StudioShaperPosePipelineResult {
  const spec = input.spec ?? buildStudioMannequinSpec(input.params ?? {});
  let pose = normalizeStudioMannequinPose(input.pose);
  const ikReports: StudioShaperIkReport[] = [];
  const targets = input.ikTargets ?? [];
  if (targets.length > 0) {
    const joints: Record<string, StudioMannequinVec3> = { ...pose.joints };
    for (const ikTarget of targets) {
      const chain = spec.chains[ikTarget.chainId];
      if (!chain || !isFiniteVec3(ikTarget.target)) continue;
      // 현재 포즈의 FK에서 부모·루트·중간 관절 프레임을 읽는다.
      const frames = computeStudioMannequinJointFrames(spec, { joints, pelvisOffset: pose.pelvisOffset });
      const rootSpec = spec.joints.find((joint) => joint.id === chain.rootJointId);
      const rootFrame = frames.get(chain.rootJointId);
      const midFrame = frames.get(chain.midJointId);
      if (!rootSpec || !rootFrame || !midFrame) continue;
      const parentFrame = rootSpec.parentId ? frames.get(rootSpec.parentId) : undefined;
      const parentPosition: StudioMannequinVec3 = parentFrame?.position ?? [0, 0, 0];
      const parentRotation: StudioMannequinMat3 = parentFrame?.rotation
        ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
      const toLocal = (world: StudioMannequinVec3): StudioMannequinVec3 =>
        studioMannequinMat3Apply(transposeMat3(parentRotation), sub(world, parentPosition));
      const rootLocal = toLocal(rootFrame.position);
      const targetLocal = toLocal(ikTarget.target);
      const midLocal = toLocal(midFrame.position);
      const chainScale = chain.upperLength + chain.lowerLength;
      // 굽힘 방향: 현재 중간 관절의 수직 성분이 충분하면 그 방향을 폴로 쓴다.
      const axis = sub(targetLocal, rootLocal);
      const axisLengthSq = dot(axis, axis);
      const midOffset = sub(midLocal, rootLocal);
      const along = axisLengthSq > 1e-12 ? dot(midOffset, axis) / axisLengthSq : 0;
      const bendLever = sub(midOffset, scale(axis, along));
      const poleLocal = length(bendLever) > chainScale * 0.02
        ? midLocal
        : add(rootLocal, scale(chain.poleHint, chainScale));
      const upperLimit = getStudioMannequinJointLimit(chain.rootJointId);
      const lowerLimit = getStudioMannequinJointLimit(chain.midJointId);
      let solved: StudioMannequinIkResult;
      try {
        solved = solveStudioMannequinTwoBoneIk(
          {
            root: rootLocal,
            target: targetLocal,
            pole: poleLocal,
            upperLength: chain.upperLength,
            lowerLength: chain.lowerLength,
            hingeSign: chain.hingeSign,
          },
          {
            upper: { x: upperLimit.x, y: upperLimit.y, z: upperLimit.z },
            lower: { x: lowerLimit.x, y: lowerLimit.y, z: lowerLimit.z },
          },
        );
      } catch {
        continue;
      }
      joints[chain.rootJointId] = solved.upperEuler;
      joints[chain.midJointId] = solved.lowerEuler;
      ikReports.push(Object.freeze({
        chainId: ikTarget.chainId,
        reachable: solved.reachable,
        reached: solved.reached,
        endDistanceToTargetM: solved.endDistanceToTarget,
        clampedByLimits: solved.clampedByLimits,
      }));
    }
    pose = normalizeStudioMannequinPose({ joints, pelvisOffset: pose.pelvisOffset });
  }
  const grounded = groundStudioMannequinPose(pose, spec, { enabled: input.ground !== false });
  return Object.freeze({
    spec,
    pose: grounded.pose,
    ik: Object.freeze(ikReports),
    grounded: grounded.applied,
    pelvisLiftMeters: grounded.pelvisLiftMeters,
    stance: grounded.stance,
  });
}

// ── 의복 따라가기 바인딩 ────────────────────────────────────────────────────

export type StudioShaperGarmentCategory = "top" | "bottom" | "shoes" | "accessories";

export type StudioShaperGarmentBodyRegion =
  | "chest"
  | "waist"
  | "pelvis"
  | "upperArm"
  | "forearm"
  | "thigh"
  | "calf"
  | "foot";

const GARMENT_REGIONS: Readonly<Record<StudioShaperGarmentCategory, readonly StudioShaperGarmentBodyRegion[]>> =
  Object.freeze({
    top: Object.freeze(["chest", "waist", "pelvis"] as const),
    bottom: Object.freeze(["pelvis", "thigh", "calf"] as const),
    shoes: Object.freeze(["foot"] as const),
    accessories: Object.freeze([] as const),
  });

export type StudioShaperGarmentBinding =
  | {
      readonly binding: "skinned-follow";
      readonly garmentCategory: StudioShaperGarmentCategory;
      readonly garmentId: string;
      /** 부위별 배율(기본 체형 = 1). 의복 정점을 이 배율로 변형한다. */
      readonly regionScales: Readonly<Partial<Record<StudioShaperGarmentBodyRegion, number>>>;
      readonly followsBody: true;
      readonly reasonKo: string;
    }
  | {
      readonly binding: "rigid-overlay";
      readonly garmentCategory: "accessories";
      readonly garmentId: string;
      readonly regionScales: Readonly<Partial<Record<StudioShaperGarmentBodyRegion, number>>>;
      readonly followsBody: false;
      readonly reasonKo: string;
    }
  | {
      readonly binding: "rejected-rigid";
      readonly garmentCategory: StudioShaperGarmentCategory;
      readonly garmentId: string;
      readonly regionScales: Readonly<Partial<Record<StudioShaperGarmentBodyRegion, number>>>;
      readonly followsBody: false;
      readonly reasonKo: string;
    };

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clampScale(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return round3(Math.min(2, Math.max(0.5, value)));
}

/** 스펙 프리미티브에서 부위 대표 반지름을 읽는다. 없으면 기본 체형과 같은 1 취급. */
function regionRadius(spec: StudioMannequinSpec, region: StudioShaperGarmentBodyRegion): number | null {
  const first = (jointId: StudioMannequinJointId, kind: "sphere" | "capsule"): number | null => {
    const primitive = spec.primitives.find(
      (entry) => entry.jointId === jointId && entry.kind === kind,
    );
    if (!primitive) return null;
    if (primitive.kind === "sphere") {
      const scale = primitive.scale ?? [1, 1, 1];
      return primitive.radius * Math.max(scale[0], scale[1], scale[2]);
    }
    if (primitive.kind === "capsule") {
      return Math.max(primitive.radius, primitive.endRadius ?? primitive.radius);
    }
    return null;
  };
  switch (region) {
    case "chest": return first("chest", "sphere");
    case "waist": return first("spine", "capsule");
    case "pelvis": return first("pelvis", "sphere");
    case "upperArm": return first("leftUpperArm", "capsule");
    case "forearm": return first("leftLowerArm", "capsule");
    case "thigh": return first("leftUpperLeg", "capsule");
    case "calf": return first("leftLowerLeg", "capsule");
    case "foot": return null;
  }
}

/**
 * 의복이 몸을 따르는 변형 바인딩을 푼다. 부위 배율 = 현재 체형의 부위
 * 반지름 / 기본 체형의 부위 반지름. 상의·하의·신발은 몸을 따르는
 * 변형만 허용하고, 고정 오버레이(rigid) 요청은 거부한다. 액세서리는
 * 몸에 붙지 않는 소품이라 rigid 오버레이가 허용된다.
 */
export function resolveStudioShaperGarmentFollow(input: {
  readonly params?: Partial<StudioMannequinBodyParams>;
  readonly spec?: StudioMannequinSpec;
  readonly garmentCategory: unknown;
  readonly garmentId: unknown;
  readonly bindingRequest?: unknown;
}): StudioShaperGarmentBinding | null {
  const category = input.garmentCategory;
  if (category !== "top" && category !== "bottom" && category !== "shoes" && category !== "accessories") {
    return null;
  }
  const garmentId = typeof input.garmentId === "string" && input.garmentId.length > 0
    ? input.garmentId
    : "unknown";
  const spec = input.spec ?? buildStudioMannequinSpec(input.params ?? {});
  const defaultSpec = buildStudioMannequinSpec(STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS);
  const defaultFootScale = STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS.footScale ?? 1;
  const currentFootScale = spec.params.footScale ?? 1;
  const regionScales: Partial<Record<StudioShaperGarmentBodyRegion, number>> = {};
  for (const region of GARMENT_REGIONS[category]) {
    if (region === "foot") {
      regionScales.foot = clampScale(currentFootScale / defaultFootScale);
      continue;
    }
    const current = regionRadius(spec, region);
    const baseline = regionRadius(defaultSpec, region);
    regionScales[region] = current !== null && baseline !== null && baseline > 0
      ? clampScale(current / baseline)
      : 1;
  }
  const frozenScales = Object.freeze(regionScales);
  if (input.bindingRequest === "rigid") {
    if (category === "accessories") {
      return Object.freeze({
        binding: "rigid-overlay",
        garmentCategory: category,
        garmentId,
        regionScales: frozenScales,
        followsBody: false,
        reasonKo: "액세서리는 몸에 붙지 않는 소품이라 고정 오버레이로 둔다.",
      });
    }
    return Object.freeze({
      binding: "rejected-rigid",
      garmentCategory: category,
      garmentId,
      regionScales: frozenScales,
      followsBody: false,
      reasonKo: "상의·하의·신발은 고정 오버레이로 둘 수 없다. 몸을 따르는 변형 바인딩을 써야 한다.",
    });
  }
  if (category === "accessories") {
    return Object.freeze({
      binding: "rigid-overlay",
      garmentCategory: category,
      garmentId,
      regionScales: frozenScales,
      followsBody: false,
      reasonKo: "액세서리는 몸에 붙지 않는 소품이라 고정 오버레이로 둔다.",
    });
  }
  return Object.freeze({
    binding: "skinned-follow",
    garmentCategory: category,
    garmentId,
    regionScales: frozenScales,
    followsBody: true,
    reasonKo: "체형 파라미터에서 유도한 부위별 배율로 의복을 변형한다 — 고정 오버레이가 아니다.",
  });
}
