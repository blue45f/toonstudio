/** 4컷 연기 스트립의 표정·시선·목/고개 키프레임 정본 프리셋. */
import type { ExpressionWeights, Vec3 } from "../contracts";

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

