import {
  buildCharacterSupportPolygon,
  characterCenterOfMass,
  characterSupportMargin,
  type CharacterPoint2,
} from "../character-platform/pose-v3/character-support-polygon";
import type { CharacterPoseContactV3 } from "../character-platform/pose-v3/character-pose-v3";
import type { CharacterVector3 } from "../character-platform/pose/character-pose-v2";

/**
 * 수동 포징 루프용 균형·접지 실시간 판정 — 셰이퍼 구조 개선 3단계(mannequin §5.4-3·P3).
 *
 * pose-v3의 접점(ground/prop/self)·지지 다각형·무게중심 체계는 사진/가져오기 경로의
 * 솔버(`solveCharacterPoseRuntimeV3`)에만 닿아 있었고, 사용자가 직접 포즈를 만드는
 * 셰이퍼 기본 화면에서는 FK/IK 핸들 수준으로만 닿았다. 이 모듈은 뷰포트가 매 프레임
 * 읽을 수 있는 본 월드 위치 스냅샷을 pose-v3 원시 함수(지지 다각형·무게중심·마진)로
 * 판정해, 포즈 제작 중 균형·접지 경고를 실시간으로 표시할 수 있게 한다.
 *
 * 판정은 표시 전용이다 — 포즈를 고치거나 막지 않는다. 솔버가 실제로 루트를 보정하는
 * 경로는 기존 pose-v3 런타임 어댑터가 그대로 담당한다.
 *
 * 이 판정은 스타일화된 드로잉 보조용 근사이며, 실제 사람의 균형·안전을 판단하는
 * 기능이 아니다(리그 프로파일·관절 리밋 모듈과 같은 목적 선언을 따른다).
 */

export type StudioVrmPoseBalanceSeverity =
  | "stable"
  | "marginal"
  | "unstable"
  | "airborne"
  | "unknown";

export interface StudioVrmPoseBalanceContact {
  readonly kind: CharacterPoseContactV3["kind"];
  readonly bone: string;
  /** 접점 월드 위치. */
  readonly position: CharacterVector3;
  /** 지면 접점인 경우 지면 아래로 파고든 깊이(m). 그 외에는 0. */
  readonly penetration: number;
}

export interface StudioVrmPoseBalanceReport {
  readonly severity: StudioVrmPoseBalanceSeverity;
  /** 검출된 접점 전체(ground/prop/self). */
  readonly contacts: readonly StudioVrmPoseBalanceContact[];
  /** 지면에 닿은 본 이름들. */
  readonly groundedBones: readonly string[];
  /** 지면 아래로 파고든 본 이름들. */
  readonly penetratingBones: readonly string[];
  /** 지지 다각형(지면 투영, 발바닥 풋프린트 확장 포함). 접점이 없으면 빈 배열. */
  readonly supportPolygon: readonly CharacterPoint2[];
  /** 무게중심 월드 위치. 질량 세그먼트가 없으면 null. */
  readonly centerOfMass: CharacterVector3 | null;
  /** 무게중심 지면 투영이 지지 다각형 경계에서 떨어진 거리(m). 음수면 범위 밖. */
  readonly supportMargin: number | null;
  /** 사용자에게 그대로 보여줄 경고 문구(심각한 순). stable이면 빈 배열. */
  readonly warnings: readonly string[];
}

export interface StudioVrmPoseBalancePropAnchor {
  readonly id: string;
  readonly position: CharacterVector3;
}

export interface StudioVrmPoseBalanceOptions {
  /** 지면 높이(월드 Y). 기본 0. */
  readonly groundY?: number;
  /** 이 높이 이하로 지면에 가까우면 접지로 본다(m). 기본 0.03. */
  readonly contactTolerance?: number;
  /** 지면 아래 이 깊이 이상 파고들면 관통으로 본다(m). 기본 0.015. */
  readonly penetrationTolerance?: number;
  /** 지지 마진이 이 값 미만이면 "가장자리" 경고(m). 기본 0.04. */
  readonly marginalMargin?: number;
  /** 연출상 기울어짐을 허용하면 unstable/marginal 경고를 억제한다(pose-v3 dramaticImbalance 대응). */
  readonly allowImbalance?: boolean;
  /** 소품 앵커(월드 위치). 손이 닿으면 prop 접점으로 기록한다. */
  readonly propAnchors?: readonly StudioVrmPoseBalancePropAnchor[];
}

/** 접지로 인정하는 본 — 발·발끝·손(엎드린 포즈)·무릎(아래다리). */
const GROUND_CONTACT_BONES: readonly string[] = [
  "leftFoot", "rightFoot", "leftToes", "rightToes",
  "leftHand", "rightHand", "leftLowerLeg", "rightLowerLeg",
];

/** 발 접점은 발바닥 풋프린트만큼 지지점을 넓힌다(발 길이 근사, 반경 m). */
const FOOTPRINT_RADIUS: Readonly<Partial<Record<string, number>>> = {
  leftFoot: 0.09, rightFoot: 0.09, leftToes: 0.05, rightToes: 0.05,
  leftHand: 0.05, rightHand: 0.05, leftLowerLeg: 0.06, rightLowerLeg: 0.06,
};

/** 손이 반대쪽 다리·골반에 이 거리 안이면 self 접점(m). */
const SELF_CONTACT_DISTANCE = 0.14;
/** 손이 몸에 이 거리보다 가까우면 파묻힘으로 경고한다(m). */
const SELF_PENETRATION_DISTANCE = 0.05;
const SELF_CONTACT_TARGETS: Readonly<Record<string, readonly string[]>> = {
  leftHand: ["rightUpperLeg", "rightLowerLeg", "rightFoot", "hips"],
  rightHand: ["leftUpperLeg", "leftLowerLeg", "leftFoot", "hips"],
};

/** 소품 앵커에 손이 이 거리 안이면 prop 접점(m). */
const PROP_CONTACT_DISTANCE = 0.12;

/** 한쪽 발만 접지인데 다른 발이 이 높이 안에 있으면 "살짝 뜸" 경고(m). */
const FLOATING_FOOT_MAX = 0.08;

/**
 * 부위별 상대 질량(인체 비율 근사). pose-v3 런타임 어댑터가 몸통에 큰 질량을 주는
 * 관례를 세분화한 값으로, 합이 아니라 비율만 의미가 있다.
 */
const SEGMENT_MASS: Readonly<Partial<Record<string, number>>> = {
  hips: 11, spine: 9, chest: 12, upperChest: 6, neck: 1.5, head: 5,
  leftShoulder: 1, rightShoulder: 1,
  leftUpperArm: 2, rightUpperArm: 2, leftLowerArm: 1.4, rightLowerArm: 1.4,
  leftHand: 0.5, rightHand: 0.5,
  leftUpperLeg: 6.5, rightUpperLeg: 6.5, leftLowerLeg: 3, rightLowerLeg: 3,
  leftFoot: 0.9, rightFoot: 0.9, leftToes: 0.2, rightToes: 0.2,
};

function finitePoint(value: CharacterVector3 | undefined): value is CharacterVector3 {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
}

function distance(a: CharacterVector3, b: CharacterVector3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

const UNKNOWN_REPORT: StudioVrmPoseBalanceReport = Object.freeze({
  severity: "unknown",
  contacts: Object.freeze([]),
  groundedBones: Object.freeze([]),
  penetratingBones: Object.freeze([]),
  supportPolygon: Object.freeze([]),
  centerOfMass: null,
  supportMargin: null,
  warnings: Object.freeze([]),
});

/**
 * 본 월드 위치 스냅샷으로 균형·접지 판정을 만든다.
 * 위치가 전혀 없거나 무게중심을 만들 세그먼트가 없으면 severity "unknown"(경고 없음).
 */
export function evaluateStudioVrmPoseBalance(
  bones: Readonly<Partial<Record<string, CharacterVector3>>>,
  options: StudioVrmPoseBalanceOptions = {},
): StudioVrmPoseBalanceReport {
  const groundY = Number.isFinite(options.groundY) ? options.groundY! : 0;
  const contactTolerance = Math.max(0, options.contactTolerance ?? 0.03);
  const penetrationTolerance = Math.max(0, options.penetrationTolerance ?? 0.015);
  const marginalMargin = Math.max(0, options.marginalMargin ?? 0.04);

  const segments = Object.entries(bones)
    .filter((entry): entry is [string, CharacterVector3] => finitePoint(entry[1]))
    .map(([id, position]) => ({ id, position, mass: SEGMENT_MASS[id] ?? 1 }));
  if (segments.length === 0) return UNKNOWN_REPORT;
  let centerOfMass: CharacterVector3;
  try {
    centerOfMass = characterCenterOfMass(segments);
  } catch {
    return UNKNOWN_REPORT;
  }

  const contacts: StudioVrmPoseBalanceContact[] = [];
  const groundedBones: string[] = [];
  const penetratingBones: string[] = [];
  const supportPoints: CharacterPoint2[] = [];

  for (const bone of GROUND_CONTACT_BONES) {
    const position = bones[bone];
    if (!finitePoint(position)) continue;
    const penetration = groundY - position[1];
    if (penetration > penetrationTolerance) {
      penetratingBones.push(bone);
      contacts.push({ kind: "ground", bone, position, penetration });
      groundedBones.push(bone);
    } else if (position[1] - groundY <= contactTolerance) {
      contacts.push({ kind: "ground", bone, position, penetration: 0 });
      groundedBones.push(bone);
    }
    if (groundedBones.includes(bone)) {
      const radius = FOOTPRINT_RADIUS[bone] ?? 0.05;
      supportPoints.push(
        [position[0] - radius, position[2] - radius],
        [position[0] + radius, position[2] - radius],
        [position[0] + radius, position[2] + radius],
        [position[0] - radius, position[2] + radius],
      );
    }
  }

  for (const [hand, targets] of Object.entries(SELF_CONTACT_TARGETS)) {
    const handPosition = bones[hand];
    if (!finitePoint(handPosition)) continue;
    for (const target of targets) {
      const targetPosition = bones[target];
      if (!finitePoint(targetPosition)) continue;
      if (distance(handPosition, targetPosition) <= SELF_CONTACT_DISTANCE) {
        contacts.push({ kind: "self", bone: hand, position: handPosition, penetration: 0 });
        break;
      }
    }
  }

  for (const anchor of options.propAnchors ?? []) {
    if (!finitePoint(anchor.position)) continue;
    for (const hand of ["leftHand", "rightHand"] as const) {
      const handPosition = bones[hand];
      if (finitePoint(handPosition) && distance(handPosition, anchor.position) <= PROP_CONTACT_DISTANCE) {
        contacts.push({ kind: "prop", bone: hand, position: handPosition, penetration: 0 });
      }
    }
  }

  const supportPolygon = buildCharacterSupportPolygon(supportPoints);
  const projected: CharacterPoint2 = [centerOfMass[0], centerOfMass[2]];
  const supportMargin = groundedBones.length > 0
    ? characterSupportMargin(projected, supportPolygon)
    : null;

  const warnings: string[] = [];
  let severity: StudioVrmPoseBalanceSeverity;

  if (penetratingBones.length > 0) {
    warnings.push("발이나 손이 바닥 아래로 파고들었어요 — 접지 스냅으로 올려 보세요.");
  }

  if (groundedBones.length === 0) {
    severity = "airborne";
    warnings.push("바닥에 닿은 곳이 없어요 — 공중 포즈가 아니면 발을 바닥에 붙여 보세요.");
  } else if (supportMargin !== null && supportMargin < 0) {
    severity = "unstable";
    if (!options.allowImbalance) {
      warnings.push("무게중심이 지지 범위를 벗어났어요 — 넘어질 수 있는 포즈예요.");
    }
  } else if (supportMargin !== null && supportMargin < marginalMargin) {
    severity = "marginal";
    if (!options.allowImbalance) {
      warnings.push("무게중심이 지지 범위 가장자리에 가까워요 — 발 위치를 넓히면 안정돼요.");
    }
  } else {
    severity = "stable";
  }
  if (penetratingBones.length > 0 && severity === "stable") severity = "marginal";

  // 한쪽만 접지인데 다른 발이 애매하게 떠 있으면 접지 누락일 가능성이 높다.
  const leftGrounded = groundedBones.some((bone) => bone.startsWith("left") && bone.includes("Foot") || bone === "leftToes");
  const rightGrounded = groundedBones.some((bone) => bone.startsWith("right") && bone.includes("Foot") || bone === "rightToes");
  if (leftGrounded !== rightGrounded) {
    const floating = leftGrounded ? bones.rightFoot : bones.leftFoot;
    if (finitePoint(floating)) {
      const height = floating[1] - groundY;
      if (height > contactTolerance && height <= FLOATING_FOOT_MAX) {
        warnings.push("한쪽 발이 바닥에서 살짝 떠 있어요 — 접지 스냅을 확인해 보세요.");
        if (severity === "stable") severity = "marginal";
      }
    }
  }

  for (const contact of contacts) {
    if (contact.kind !== "self") continue;
    const targets = SELF_CONTACT_TARGETS[contact.bone] ?? [];
    const buried = targets.some((target) => {
      const targetPosition = bones[target];
      return finitePoint(targetPosition) && distance(contact.position, targetPosition) <= SELF_PENETRATION_DISTANCE;
    });
    if (buried) warnings.push("손이 몸에 파묻혀 보여요 — 조금 떼어 보세요.");
  }

  return Object.freeze({
    severity,
    contacts: Object.freeze(contacts),
    groundedBones: Object.freeze(groundedBones),
    penetratingBones: Object.freeze(penetratingBones),
    supportPolygon,
    centerOfMass,
    supportMargin,
    warnings: Object.freeze(warnings),
  });
}

/** 배너 표시용 서명 — 같은 판정이 반복 보고돼 리렌더가 폭증하지 않게 비교에 쓴다. */
export function studioVrmPoseBalanceSignature(report: StudioVrmPoseBalanceReport): string {
  return `${report.severity}|${report.warnings.join("|")}|${report.groundedBones.join(",")}`;
}
