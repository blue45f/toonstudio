/** 4컷 연기 프리셋과 컷별 표정·시선·고개 스냅샷 계산. 엔진 적용·복원은 composer가 소유한다. */
import { eyeAnglesQuaternion, expressionToMorphWeights } from "../contracts";
import { qNormalize } from "../shared/math";

import type { ApplyPlan, ExpressionWeights, Quat, Vec3 } from "../contracts";

export type WebtoonStripActingArcId =
  | "none"
  | "arc-awakening-climax"
  | "arc-romance-flutter"
  | "arc-thriller-shock"
  | "arc-confident-smirk";

export interface WebtoonStripCutActingKeyframe {
  readonly beatKo: string;
  readonly expression: ExpressionWeights;
  readonly gazeYawDeg: number;
  readonly gazePitchDeg: number;
  readonly neckEulerDeg: Vec3;
  readonly headEulerDeg: Vec3;
}

export interface WebtoonStripActingArcSpec {
  readonly id: Exclude<WebtoonStripActingArcId, "none">;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly cuts: readonly [
    WebtoonStripCutActingKeyframe,
    WebtoonStripCutActingKeyframe,
    WebtoonStripCutActingKeyframe,
    WebtoonStripCutActingKeyframe,
  ];
}

export const WEBTOON_STRIP_ACTING_ARCS: readonly WebtoonStripActingArcSpec[] = Object.freeze([
  {
    id: "arc-awakening-climax",
    labelKo: "각성·결의 4단 서사 (침착 → 대사 → 각성 → 여운)",
    summaryKo: "1컷 침착 등장 · 2컷 단호한 발화 · 3컷 안광 각성 클로즈업 · 4컷 차분한 결의",
    cuts: [
      {
        beatKo: "침착 등장",
        expression: { browDown: 0.16, mouthPress: 0.22 },
        gazeYawDeg: 0,
        gazePitchDeg: -4,
        neckEulerDeg: [2, 0, 0],
        headEulerDeg: [4, -3, 0],
      },
      {
        beatKo: "단호한 발화",
        expression: { browDown: 0.34, jawOpen: 0.24, eyeSquint: 0.18 },
        gazeYawDeg: 10,
        gazePitchDeg: 2,
        neckEulerDeg: [-2, 6, -1],
        headEulerDeg: [-3, 10, -2],
      },
      {
        beatKo: "각성 클로즈업",
        expression: { eyeWide: 0.72, browDown: 0.58, jawOpen: 0.32 },
        gazeYawDeg: -4,
        gazePitchDeg: 3,
        neckEulerDeg: [4, -4, 1],
        headEulerDeg: [6, -6, 2],
      },
      {
        beatKo: "결의 여운",
        expression: { eyeSquint: 0.32, mouthSmile: 0.24 },
        gazeYawDeg: -10,
        gazePitchDeg: 8,
        neckEulerDeg: [-3, -8, 2],
        headEulerDeg: [-4, -12, 3],
      },
    ],
  },
  {
    id: "arc-romance-flutter",
    labelKo: "로맨스 설렘 4단 서사 (시선 → 미소 → 두근거림 → 환한 미소)",
    summaryKo: "1컷 고요한 마주침 · 2컷 부드러운 대화 · 3컷 설렘 클로즈업 · 4컷 따뜻한 미소",
    cuts: [
      {
        beatKo: "고요한 마주침",
        expression: { browInnerUp: 0.18, mouthSmile: 0.14 },
        gazeYawDeg: 4,
        gazePitchDeg: 2,
        neckEulerDeg: [2, -3, 2],
        headEulerDeg: [3, -5, 3],
      },
      {
        beatKo: "부드러운 대화",
        expression: { mouthSmile: 0.38, jawOpen: 0.18, browInnerUp: 0.16 },
        gazeYawDeg: 8,
        gazePitchDeg: 4,
        neckEulerDeg: [0, 5, -2],
        headEulerDeg: [-2, 8, -3],
      },
      {
        beatKo: "설렘 클로즈업",
        expression: { eyeWide: 0.54, browInnerUp: 0.46, jawOpen: 0.16, cheekPuff: 0.12 },
        gazeYawDeg: -3,
        gazePitchDeg: 5,
        neckEulerDeg: [3, -2, 2],
        headEulerDeg: [4, -4, 4],
      },
      {
        beatKo: "따뜻한 미소",
        expression: { mouthSmile: 0.74, eyeSquint: 0.34, browInnerUp: 0.14 },
        gazeYawDeg: -8,
        gazePitchDeg: 6,
        neckEulerDeg: [-2, -6, 3],
        headEulerDeg: [-3, -10, 4],
      },
    ],
  },
  {
    id: "arc-thriller-shock",
    labelKo: "스릴러 반전 4단 서사 (경계 → 추궁 → 충격 → 냉정한 결단)",
    summaryKo: "1컷 서늘한 경계 · 2컷 날카로운 추궁 · 3컷 반전 경악 클로즈업 · 4컷 냉정한 결단",
    cuts: [
      {
        beatKo: "서늘한 경계",
        expression: { browDown: 0.28, eyeSquint: 0.26 },
        gazeYawDeg: -6,
        gazePitchDeg: -3,
        neckEulerDeg: [3, 4, 0],
        headEulerDeg: [5, 6, -2],
      },
      {
        beatKo: "날카로운 추궁",
        expression: { browDown: 0.48, mouthFrown: 0.28, jawOpen: 0.22 },
        gazeYawDeg: 12,
        gazePitchDeg: 0,
        neckEulerDeg: [2, 8, -2],
        headEulerDeg: [3, 12, -3],
      },
      {
        beatKo: "반전 경악",
        expression: { eyeWide: 0.86, browInnerUp: 0.68, jawOpen: 0.48 },
        gazeYawDeg: -2,
        gazePitchDeg: 2,
        neckEulerDeg: [-3, -2, 0],
        headEulerDeg: [-5, -4, 1],
      },
      {
        beatKo: "냉정한 결단",
        expression: { browDown: 0.56, mouthPress: 0.44, eyeSquint: 0.30 },
        gazeYawDeg: -12,
        gazePitchDeg: 6,
        neckEulerDeg: [2, -8, 1],
        headEulerDeg: [4, -12, 2],
      },
    ],
  },
  {
    id: "arc-confident-smirk",
    labelKo: "여유·역전 4단 서사 (등장 → 응수 → 확신 → 윙크 여운)",
    summaryKo: "1컷 당당한 등장 · 2컷 여유로운 응수 · 3컷 자신감 미소 · 4컷 윙크 여운",
    cuts: [
      {
        beatKo: "당당한 등장",
        expression: { mouthSmile: 0.22, browOuterUp: 0.24 },
        gazeYawDeg: 0,
        gazePitchDeg: -5,
        neckEulerDeg: [-2, -4, 2],
        headEulerDeg: [-3, -6, 2],
      },
      {
        beatKo: "여유로운 응수",
        expression: { mouthSmile: 0.36, browOuterUp: 0.38, jawOpen: 0.16 },
        gazeYawDeg: 9,
        gazePitchDeg: 3,
        neckEulerDeg: [-2, 6, -2],
        headEulerDeg: [-3, 9, -3],
      },
      {
        beatKo: "확신 클로즈업",
        expression: { mouthSmile: 0.64, eyeSquint: 0.28, browOuterUp: 0.30 },
        gazeYawDeg: -4,
        gazePitchDeg: 4,
        neckEulerDeg: [0, -4, 2],
        headEulerDeg: [-2, -6, 3],
      },
      {
        beatKo: "윙크 여운",
        expression: { eyeBlinkLeft: 0.88, mouthSmile: 0.56, browOuterUp: 0.28 },
        gazeYawDeg: -8,
        gazePitchDeg: 7,
        neckEulerDeg: [-2, -7, 3],
        headEulerDeg: [-3, -11, 4],
      },
    ],
  },
]);

export function findWebtoonStripActingArc(arcId: string): WebtoonStripActingArcSpec | null {
  return WEBTOON_STRIP_ACTING_ARCS.find((item) => item.id === arcId) ?? null;
}

function eulerDegToQuat(deg: Vec3): Quat {
  const rx = (deg[0] * Math.PI) / 360;
  const ry = (deg[1] * Math.PI) / 360;
  const rz = (deg[2] * Math.PI) / 360;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  return qNormalize([
    sx * cy * cz - cx * sy * sz,
    cx * sy * cz + sx * cy * sz,
    cx * cy * sz - sx * sy * cz,
    cx * cy * cz + sx * sy * sz,
  ]);
}

/**
 * 기준 `ApplyPlan`의 체형·얼굴 파라미터 및 팔·다리 포즈는 그대로 유지하면서,
 * 해당 컷의 감정 표정(`facs:*`)·안구 시선(`eyeGaze`)·목/고개 연기만 덮어쓴 스냅샷 `ApplyPlan`을 생성한다.
 */
export function buildActingCutPlan(basePlan: ApplyPlan, keyframe: WebtoonStripCutActingKeyframe, cutIndex: number): ApplyPlan {
  const nextMorphs: Record<string, number> = {};
  for (const [morphKey, value] of Object.entries(basePlan.morphWeights)) {
    if (!morphKey.startsWith("facs:")) {
      nextMorphs[morphKey] = value;
    }
  }
  Object.assign(nextMorphs, expressionToMorphWeights(keyframe.expression));

  const eyeAngle = { yawDeg: keyframe.gazeYawDeg, pitchDeg: keyframe.gazePitchDeg };
  const eyeQuat = eyeAnglesQuaternion(eyeAngle);

  return {
    ...basePlan,
    revision: basePlan.revision + 100 + cutIndex,
    morphWeights: nextMorphs,
    boneRotations: {
      ...basePlan.boneRotations,
      neck: eulerDegToQuat(keyframe.neckEulerDeg),
      head: eulerDegToQuat(keyframe.headEulerDeg),
      leftEye: eyeQuat,
      rightEye: eyeQuat,
    },
    eyeGaze: {
      mode: "manual",
      symmetry: true,
      left: eyeAngle,
      right: eyeAngle,
    },
  };
}
