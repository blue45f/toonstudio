/**
 * Studio 3D 데생 인형 — 렌더 프레임 단일 경로.
 *
 * 포즈 프리셋 적용·미러링·자동 접지·윤곽·관절 가이드가 그동안 패널·씬·
 * 훅에 흩어져 각자 순서로 돌았다. 이 모듈은 렌더 한 프레임을 만드는
 * 순서를 하나로 고정한다:
 *
 *   정규화(관절 한계 클램프) → 미러(선택) → 재 정규화 → 자동 접지
 *
 * 볼륨감은 모델 스펙의 테이퍼 프리미티브(끝점 반지름이 있는 캡슐·
 * 타원체)에서 그대로 읽고, 윤곽 유지와 관절 가이드는 readability
 * 모듈의 판정을 그대로 쓴다. Three.js를 import하지 않는 순수 모듈이라
 * 패널 커밋 경로와 단위 테스트가 같은 계산을 공유한다.
 */

import {
  buildStudioMannequinJointRangeArc,
  resolveStudioMannequinOutlineMode,
  resolveStudioMannequinOutlineVisible,
  STUDIO_MANNEQUIN_RANGE_ARC_SEGMENTS,
  type StudioMannequinJointRangeArc,
  type StudioMannequinOutlineMode,
} from "./studio-mannequin-readability";
import {
  groundStudioMannequinPose,
  type StudioMannequinGroundStance,
} from "./studio-mannequin-foot-grounding";
import {
  buildStudioMannequinSpec,
  type StudioMannequinBodyParams,
  type StudioMannequinJointId,
  type StudioMannequinMaterialStyle,
  type StudioMannequinPrimitiveSpec,
  type StudioMannequinSpec,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";
import {
  mirrorStudioMannequinPose,
  normalizeStudioMannequinPose,
  type StudioMannequinPose,
} from "./studio-mannequin-poses";

export interface StudioMannequinRenderFrameInput {
  /** 체형 파라미터. spec이 있으면 무시된다. */
  readonly params?: Partial<StudioMannequinBodyParams>;
  /** 체형 스펙. 없으면 params(없으면 기본 체형)로 만든다. */
  readonly spec?: StudioMannequinSpec;
  readonly pose: StudioMannequinPose;
  /** 좌우 미러 적용 여부. 기본 false. */
  readonly mirror?: boolean;
  /** 자동 접지 적용 여부. 기본 true. */
  readonly ground?: boolean;
  /** 윤곽 모드. 기본 auto(셀 셰이딩에서만 표시 — 기존 규칙). */
  readonly outlineMode?: StudioMannequinOutlineMode;
  /** 윤곽 판정에 쓰는 재질 스타일. 기본 shaded. */
  readonly materialStyle?: StudioMannequinMaterialStyle;
  /** 가동범위 아크를 함께 만들 관절. 없으면 아크를 만들지 않는다. */
  readonly guideJointId?: StudioMannequinJointId;
}

/** 스펙 프리미티브에서 읽은 볼륨 요약 — 씬이 그리는 덩어리와 같은 값. */
export interface StudioMannequinRenderVolume {
  readonly primitiveCount: number;
  readonly taperedCapsuleCount: number;
  readonly bodyPrimitiveCount: number;
  /** 프리미티브 유효 반지름 최대(m, 소수 4자리). */
  readonly maxRadiusM: number;
  /** 프리미티브 유효 반지름 최소(m, 소수 4자리). */
  readonly minRadiusM: number;
}

export interface StudioMannequinRenderFrame {
  readonly spec: StudioMannequinSpec;
  /** 미러·접지가 반영된 최종 포즈(패널·씬에 그대로 넘긴다). */
  readonly pose: StudioMannequinPose;
  readonly mirrored: boolean;
  readonly grounded: boolean;
  readonly pelvisLiftMeters: number;
  readonly stance: StudioMannequinGroundStance | undefined;
  readonly volume: StudioMannequinRenderVolume;
  readonly outline: {
    readonly mode: StudioMannequinOutlineMode;
    readonly bodyVisible: boolean;
    readonly jointVisible: boolean;
  };
  readonly rangeArcSegments: number;
  readonly jointGuide: StudioMannequinJointRangeArc | null;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function primitiveRadius(primitive: StudioMannequinPrimitiveSpec): number {
  if (primitive.kind === "capsule") {
    return Math.max(primitive.radius, primitive.endRadius ?? primitive.radius);
  }
  if (primitive.kind === "sphere") {
    const scale = primitive.scale ?? [1, 1, 1];
    return primitive.radius * Math.max(scale[0], scale[1], scale[2]);
  }
  return Math.max(primitive.size[0], primitive.size[1], primitive.size[2]) / 2;
}

export function summarizeStudioMannequinRenderVolume(
  spec: StudioMannequinSpec,
): StudioMannequinRenderVolume {
  let taperedCapsuleCount = 0;
  let bodyPrimitiveCount = 0;
  let maxRadiusM = 0;
  let minRadiusM = Number.POSITIVE_INFINITY;
  for (const primitive of spec.primitives) {
    if (primitive.kind === "capsule" && primitive.endRadius !== undefined) {
      taperedCapsuleCount += 1;
    }
    if (primitive.materialRole === "body") bodyPrimitiveCount += 1;
    const radius = primitiveRadius(primitive);
    if (radius > maxRadiusM) maxRadiusM = radius;
    if (radius < minRadiusM) minRadiusM = radius;
  }
  return Object.freeze({
    primitiveCount: spec.primitives.length,
    taperedCapsuleCount,
    bodyPrimitiveCount,
    maxRadiusM: round4(maxRadiusM),
    minRadiusM: round4(minRadiusM === Number.POSITIVE_INFINITY ? 0 : minRadiusM),
  });
}

/**
 * 렌더 한 프레임을 만든다. 순서는 고정이다: 정규화 → 미러(선택) →
 * 재 정규화(미러 뒤 한계 재클램프) → 자동 접지. 접지 결과의 골반
 * 들어올림·자세가 그대로 따라오며, 접지를 꺼도 판정은 계산한다.
 */
export function resolveStudioMannequinRenderFrame(
  input: StudioMannequinRenderFrameInput,
): StudioMannequinRenderFrame {
  const spec = input.spec ?? buildStudioMannequinSpec(input.params ?? {});
  const mirrored = input.mirror === true;
  const normalized = normalizeStudioMannequinPose(input.pose);
  const afterMirror = mirrored
    ? normalizeStudioMannequinPose(mirrorStudioMannequinPose(normalized))
    : normalized;
  const grounded = groundStudioMannequinPose(afterMirror, spec, {
    enabled: input.ground !== false,
  });
  const outlineMode = resolveStudioMannequinOutlineMode(input.outlineMode);
  const materialStyle = input.materialStyle ?? "shaded";
  const outline = Object.freeze({
    mode: outlineMode,
    bodyVisible: resolveStudioMannequinOutlineVisible({
      mode: outlineMode,
      style: materialStyle,
      role: "body",
    }),
    jointVisible: resolveStudioMannequinOutlineVisible({
      mode: outlineMode,
      style: materialStyle,
      role: "joint",
    }),
  });
  const guideRotation: StudioMannequinVec3 | null = input.guideJointId
    ? (grounded.pose.joints[input.guideJointId] ?? [0, 0, 0])
    : null;
  const jointGuide = input.guideJointId
    ? buildStudioMannequinJointRangeArc({
        jointId: input.guideJointId,
        currentRotation: guideRotation,
      })
    : null;
  return Object.freeze({
    spec,
    pose: grounded.pose,
    mirrored,
    grounded: grounded.applied,
    pelvisLiftMeters: grounded.pelvisLiftMeters,
    stance: grounded.stance,
    volume: summarizeStudioMannequinRenderVolume(spec),
    outline,
    rangeArcSegments: STUDIO_MANNEQUIN_RANGE_ARC_SEGMENTS,
    jointGuide,
  });
}
