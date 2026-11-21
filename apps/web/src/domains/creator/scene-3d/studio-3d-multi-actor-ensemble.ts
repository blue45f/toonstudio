/**
 * EasyPoser · Magic Poser · DesignDoll 클린룸 — 최대 6인 다인물 앙상블 스테이지,
 * 캐릭터 간 접촉 IK(악수·포옹·멱살), 소품 관절 자동 파지(Attach to Joint), 3점 코믹 조명.
 */

import type { StudioVrmHandPoseType } from "../vrm/studio-vrm-hand-poses";

export type Vec3Tuple = readonly [number, number, number];

export const MAX_ENSEMBLE_ACTORS = 6 as const;

export type EnsemblePropJointSlot =
  | "leftHand"
  | "rightHand"
  | "head"
  | "chest"
  | "hips"
  | "back";

export type InterActorContactKind =
  | "handshake"
  | "hug"
  | "collar-grab"
  | "shoulder-pat"
  | "high-five";

export type ComicThreePointPresetId =
  | "drama-soft"
  | "action-hard-rim"
  | "noir-chiaroscuro"
  | "rofan-golden";

export interface EnsembleActorNode {
  readonly id: string;
  readonly labelKo: string;
  readonly rootPosition: Vec3Tuple;
  readonly yawRad: number;
  readonly heightM: number;
  readonly jointWorldOffsets: Readonly<Partial<Record<EnsemblePropJointSlot, Vec3Tuple>>>;
}

export interface InterActorContactConstraint {
  readonly id: string;
  readonly kind: InterActorContactKind;
  readonly actorAId: string;
  readonly actorBId: string;
  readonly strength: number;
}

export interface EnsemblePropAttachment {
  readonly propId: string;
  readonly labelKo: string;
  readonly actorId: string;
  readonly jointSlot: EnsemblePropJointSlot;
  readonly localOffsetM: Vec3Tuple;
  readonly recommendedHandPose: StudioVrmHandPoseType;
}

export interface MultiActorEnsembleStage {
  readonly actors: readonly EnsembleActorNode[];
  readonly contacts: readonly InterActorContactConstraint[];
  readonly props: readonly EnsemblePropAttachment[];
  readonly lightingPresetId: ComicThreePointPresetId;
}

export interface ResolvedActorContactTarget {
  readonly constraintId: string;
  readonly kind: InterActorContactKind;
  readonly actorAId: string;
  readonly actorASlot: EnsemblePropJointSlot;
  readonly actorATargetWorld: Vec3Tuple;
  readonly actorBId: string;
  readonly actorBSlot: EnsemblePropJointSlot;
  readonly actorBTargetWorld: Vec3Tuple;
  readonly suggestedTorsoPullB: Vec3Tuple;
  readonly separationM: number;
}

export interface EvaluatedPropWorldTransform {
  readonly propId: string;
  readonly actorId: string;
  readonly jointSlot: EnsemblePropJointSlot;
  readonly worldPosition: Vec3Tuple;
  readonly yawRad: number;
  readonly recommendedHandPose: StudioVrmHandPoseType;
}

export interface ComicThreePointLightSpec {
  readonly role: "key" | "fill" | "rim";
  readonly labelKo: string;
  readonly directionFromTarget: Vec3Tuple;
  readonly intensity: number;
  readonly temperatureK: number;
  readonly castShadow: boolean;
}

export interface ResolvedEnsembleComicLighting {
  readonly presetId: ComicThreePointPresetId;
  readonly ensembleCentroid: Vec3Tuple;
  readonly lights: readonly [ComicThreePointLightSpec, ComicThreePointLightSpec, ComicThreePointLightSpec];
}

const EPS = 1e-8;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalize3(v: Vec3Tuple, fallback: Vec3Tuple): Vec3Tuple {
  const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (l <= EPS) return fallback;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function rotateY(v: Vec3Tuple, yawRad: number): Vec3Tuple {
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

function add3(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function defaultJointLocalOffset(slot: EnsemblePropJointSlot, heightM: number): Vec3Tuple {
  const scale = Math.max(0.5, heightM) / 1.7;
  switch (slot) {
    case "leftHand":
      return [0.28 * scale, 1.02 * scale, 0.24 * scale];
    case "rightHand":
      return [-0.28 * scale, 1.02 * scale, 0.24 * scale];
    case "head":
      return [0, 1.56 * scale, 0];
    case "chest":
      return [0, 1.32 * scale, 0.1 * scale];
    case "hips":
      return [0, 0.94 * scale, 0];
    case "back":
      return [0, 1.28 * scale, -0.16 * scale];
  }
}

export function getActorJointWorldPosition(
  actor: EnsembleActorNode,
  slot: EnsemblePropJointSlot,
): Vec3Tuple {
  const local = actor.jointWorldOffsets[slot] ?? defaultJointLocalOffset(slot, actor.heightM);
  return add3(actor.rootPosition, rotateY(local, actor.yawRad));
}

export function createEmptyEnsembleStage(
  lightingPresetId: ComicThreePointPresetId = "drama-soft",
): MultiActorEnsembleStage {
  return {
    actors: [],
    contacts: [],
    props: [],
    lightingPresetId,
  };
}

/** 앙상블 스테이지에 캐릭터를 추가한다(최대 6인 제한). */
export function addActorToEnsembleStage(
  stage: MultiActorEnsembleStage,
  actor: EnsembleActorNode,
): { readonly ok: true; readonly stage: MultiActorEnsembleStage } | { readonly ok: false; readonly reasonKo: string } {
  if (stage.actors.some((existing) => existing.id === actor.id)) {
    return { ok: false, reasonKo: `이미 같은 ID(${actor.id})의 캐릭터가 무대에 배치되어 있습니다.` };
  }
  if (stage.actors.length >= MAX_ENSEMBLE_ACTORS) {
    return { ok: false, reasonKo: `다인물 앙상블 무대는 최대 ${MAX_ENSEMBLE_ACTORS}인까지 배치할 수 있습니다.` };
  }
  return {
    ok: true,
    stage: {
      ...stage,
      actors: [...stage.actors, actor],
    },
  };
}

/** 소품을 특정 캐릭터의 관절 슬롯에 자동 파지·부착한다. */
export function attachPropToActorJoint(
  stage: MultiActorEnsembleStage,
  attachment: Omit<EnsemblePropAttachment, "recommendedHandPose"> & {
    readonly propCategory?: "sword" | "cup" | "phone" | "pen" | "bag" | "generic";
  },
): MultiActorEnsembleStage {
  const poseMap: Record<NonNullable<typeof attachment.propCategory>, StudioVrmHandPoseType> = {
    sword: "holding",
    cup: "cupGrip",
    phone: "phoneGrip",
    pen: "penGrip",
    bag: "holding",
    generic: "holding",
  };
  const recommendedHandPose = poseMap[attachment.propCategory ?? "generic"];
  const nextProp: EnsemblePropAttachment = {
    propId: attachment.propId,
    labelKo: attachment.labelKo,
    actorId: attachment.actorId,
    jointSlot: attachment.jointSlot,
    localOffsetM: attachment.localOffsetM,
    recommendedHandPose,
  };
  const filtered = stage.props.filter((p) => p.propId !== attachment.propId);
  return {
    ...stage,
    props: [...filtered, nextProp],
  };
}

/** 소품이 부착된 캐릭터의 관절 월드 변환을 따라가도록 최종 월드 좌표를 평가한다. */
export function evaluateEnsemblePropTransforms(
  stage: MultiActorEnsembleStage,
): EvaluatedPropWorldTransform[] {
  const actorMap = new Map(stage.actors.map((a) => [a.id, a]));
  const results: EvaluatedPropWorldTransform[] = [];
  for (const prop of stage.props) {
    const actor = actorMap.get(prop.actorId);
    if (!actor) continue;
    const jointWorld = getActorJointWorldPosition(actor, prop.jointSlot);
    const rotatedOffset = rotateY(prop.localOffsetM, actor.yawRad);
    results.push({
      propId: prop.propId,
      actorId: actor.id,
      jointSlot: prop.jointSlot,
      worldPosition: add3(jointWorld, rotatedOffset),
      yawRad: actor.yawRad,
      recommendedHandPose: prop.recommendedHandPose,
    });
  }
  return results;
}

/**
 * 캐릭터 간 접촉 IK(악수·포옹·멱살·어깨 토닥임·하이파이브) 목표 월드 좌표를 결정적으로 계산한다.
 */
export function solveInterActorContactConstraints(
  stage: MultiActorEnsembleStage,
): ResolvedActorContactTarget[] {
  const actorMap = new Map(stage.actors.map((a) => [a.id, a]));
  const resolved: ResolvedActorContactTarget[] = [];

  for (const constraint of stage.contacts) {
    const a = actorMap.get(constraint.actorAId);
    const b = actorMap.get(constraint.actorBId);
    if (!a || !b || a.id === b.id) continue;

    const strength = clamp(constraint.strength, 0, 1);
    const aToB = normalize3(
      [
        b.rootPosition[0] - a.rootPosition[0],
        0,
        b.rootPosition[2] - a.rootPosition[2],
      ],
      [0, 0, 1],
    );

    if (constraint.kind === "handshake" || constraint.kind === "high-five") {
      const handA = getActorJointWorldPosition(a, "rightHand");
      const handB = getActorJointWorldPosition(b, "rightHand");
      const midY = constraint.kind === "high-five"
        ? Math.max(handA[1], handB[1]) + 0.42
        : (handA[1] + handB[1]) * 0.5;
      const mid: Vec3Tuple = [(handA[0] + handB[0]) * 0.5, midY, (handA[2] + handB[2]) * 0.5];
      const palmGap = 0.018;
      resolved.push({
        constraintId: constraint.id,
        kind: constraint.kind,
        actorAId: a.id,
        actorASlot: "rightHand",
        actorATargetWorld: [
          handA[0] + (mid[0] - aToB[0] * palmGap - handA[0]) * strength,
          handA[1] + (mid[1] - handA[1]) * strength,
          handA[2] + (mid[2] - aToB[2] * palmGap - handA[2]) * strength,
        ],
        actorBId: b.id,
        actorBSlot: "rightHand",
        actorBTargetWorld: [
          handB[0] + (mid[0] + aToB[0] * palmGap - handB[0]) * strength,
          handB[1] + (mid[1] - handB[1]) * strength,
          handB[2] + (mid[2] + aToB[2] * palmGap - handB[2]) * strength,
        ],
        suggestedTorsoPullB: [0, 0, 0],
        separationM: palmGap * 2,
      });
    } else if (constraint.kind === "collar-grab") {
      const collarB = getActorJointWorldPosition(b, "chest");
      const grabPoint: Vec3Tuple = [
        collarB[0] - aToB[0] * 0.06,
        collarB[1] + 0.08,
        collarB[2] - aToB[2] * 0.06,
      ];
      const pullDist = 0.08 * strength;
      resolved.push({
        constraintId: constraint.id,
        kind: "collar-grab",
        actorAId: a.id,
        actorASlot: "rightHand",
        actorATargetWorld: grabPoint,
        actorBId: b.id,
        actorBSlot: "chest",
        actorBTargetWorld: collarB,
        suggestedTorsoPullB: [-aToB[0] * pullDist, 0.03 * strength, -aToB[2] * pullDist],
        separationM: 0.06,
      });
    } else if (constraint.kind === "hug") {
      const backA = getActorJointWorldPosition(a, "back");
      const backB = getActorJointWorldPosition(b, "back");
      resolved.push({
        constraintId: constraint.id,
        kind: "hug",
        actorAId: a.id,
        actorASlot: "rightHand",
        actorATargetWorld: backB,
        actorBId: b.id,
        actorBSlot: "leftHand",
        actorBTargetWorld: backA,
        suggestedTorsoPullB: [-aToB[0] * 0.05 * strength, 0, -aToB[2] * 0.05 * strength],
        separationM: 0.24,
      });
    } else {
      // shoulder-pat
      const chestB = getActorJointWorldPosition(b, "chest");
      const shoulderTarget: Vec3Tuple = [chestB[0] + 0.16, chestB[1] + 0.12, chestB[2]];
      resolved.push({
        constraintId: constraint.id,
        kind: "shoulder-pat",
        actorAId: a.id,
        actorASlot: "rightHand",
        actorATargetWorld: shoulderTarget,
        actorBId: b.id,
        actorBSlot: "chest",
        actorBTargetWorld: chestB,
        suggestedTorsoPullB: [0, 0, 0],
        separationM: 0.03,
      });
    }
  }

  return resolved;
}

/** 앙상블 군집 중심과 카메라 전방 방향을 기준으로 3점 코믹 조명(키·필·림)을 자동 배치한다. */
export function buildEnsembleComicLighting(
  stage: MultiActorEnsembleStage,
  cameraForward: Vec3Tuple = [0, 0, -1],
): ResolvedEnsembleComicLighting {
  let cx = 0;
  let cy = 1.2;
  let cz = 0;
  if (stage.actors.length > 0) {
    cy = 0;
    for (const actor of stage.actors) {
      cx += actor.rootPosition[0];
      cy += actor.rootPosition[1] + actor.heightM * 0.65;
      cz += actor.rootPosition[2];
    }
    cx /= stage.actors.length;
    cy /= stage.actors.length;
    cz /= stage.actors.length;
  }

  const camBack = normalize3([-cameraForward[0], 0, -cameraForward[2]], [0, 0, 1]);
  const camRight: Vec3Tuple = [camBack[2], 0, -camBack[0]];

  const keyDir = normalize3([camBack[0] * 0.72 + camRight[0] * 0.58, 0.75, camBack[2] * 0.72 + camRight[2] * 0.58], [0.5, 0.7, 0.5]);
  const fillDir = normalize3([camBack[0] * 0.65 - camRight[0] * 0.7, 0.28, camBack[2] * 0.65 - camRight[2] * 0.7], [-0.5, 0.3, 0.6]);
  const rimDir = normalize3([-camBack[0] * 0.85 - camRight[0] * 0.32, 0.62, -camBack[2] * 0.85 - camRight[2] * 0.32], [-0.3, 0.6, -0.8]);

  const presetParams: Record<ComicThreePointPresetId, readonly [number, number, number, number, number, number]> = {
    "drama-soft": [1.15, 0.45, 0.7, 5600, 6800, 6200],
    "action-hard-rim": [1.45, 0.22, 1.25, 5200, 7800, 4600],
    "noir-chiaroscuro": [1.6, 0.1, 1.1, 4800, 9000, 6500],
    "rofan-golden": [1.25, 0.55, 0.95, 3800, 5200, 3400],
  };
  const [keyInt, fillInt, rimInt, keyK, fillK, rimK] = presetParams[stage.lightingPresetId];

  return {
    presetId: stage.lightingPresetId,
    ensembleCentroid: [cx, cy, cz],
    lights: [
      { role: "key", labelKo: "주광(Key)", directionFromTarget: keyDir, intensity: keyInt, temperatureK: keyK, castShadow: true },
      { role: "fill", labelKo: "보조광(Fill)", directionFromTarget: fillDir, intensity: fillInt, temperatureK: fillK, castShadow: false },
      { role: "rim", labelKo: "역광 외곽선(Rim)", directionFromTarget: rimDir, intensity: rimInt, temperatureK: rimK, castShadow: false },
    ],
  };
}
