import type { DuoPartnerExpressionPreset, HandPropId } from "../../contracts";

// 손 소품의 부착 변환과 상대역 손 자세·표정에 사용하는 렌더 설정이다.
interface GripTransformSpec {
  readonly palmDelta: readonly [number, number, number];
  readonly eulerRight: readonly [number, number, number];
  readonly eulerLeft: readonly [number, number, number];
  readonly uniformScale: number;
}

export const PROP_GRIP_SPECS: Readonly<Record<HandPropId, GripTransformSpec>> = {
  smartphone: {
    palmDelta: [0.012, -0.028, 0.014],
    eulerRight: [Math.PI * 0.46, Math.PI * 0.92, -0.18],
    eulerLeft: [Math.PI * 0.46, -Math.PI * 0.92, 0.18],
    uniformScale: 1.05,
  },
  "coffee-cup": {
    palmDelta: [0.015, -0.042, 0.008],
    eulerRight: [Math.PI * 0.5, 0, 0],
    eulerLeft: [Math.PI * 0.5, 0, 0],
    uniformScale: 1.08,
  },
  "case-folder": {
    palmDelta: [0.02, -0.026, -0.015],
    eulerRight: [Math.PI * 0.48, -0.22, -0.12],
    eulerLeft: [Math.PI * 0.48, 0.22, 0.12],
    uniformScale: 1.0,
  },
  "aether-blade": {
    palmDelta: [0.008, -0.032, 0.006],
    eulerRight: [Math.PI * 0.5, 0.15, 0],
    eulerLeft: [Math.PI * 0.5, -0.15, 0],
    uniformScale: 1.05,
  },
  "imperial-scroll": {
    palmDelta: [0.016, -0.032, 0.01],
    eulerRight: [Math.PI * 0.48, -0.14, -0.08],
    eulerLeft: [Math.PI * 0.48, 0.14, 0.08],
    uniformScale: 1.05,
  },
  "jade-folding-fan": {
    palmDelta: [0.01, -0.026, 0.012],
    eulerRight: [Math.PI * 0.44, 0.24, -0.14],
    eulerLeft: [Math.PI * 0.44, -0.24, 0.14],
    uniformScale: 1.06,
  },
  "calling-card-rose": {
    palmDelta: [0.014, -0.024, 0.014],
    eulerRight: [Math.PI * 0.46, 0.18, -0.12],
    eulerLeft: [Math.PI * 0.46, -0.18, 0.12],
    uniformScale: 1.04,
  },
  "medical-chart-clipboard": {
    palmDelta: [0.018, -0.028, -0.012],
    eulerRight: [Math.PI * 0.47, -0.20, -0.10],
    eulerLeft: [Math.PI * 0.47, 0.20, 0.10],
    uniformScale: 1.02,
  },
  "idol-prism-lightstick": {
    palmDelta: [0.012, -0.032, 0.012],
    eulerRight: [Math.PI * 0.48, 0.12, -0.08],
    eulerLeft: [Math.PI * 0.48, -0.12, 0.08],
    uniformScale: 1.04,
  },
  "varsity-basketball": {
    palmDelta: [0.024, -0.052, 0.028],
    eulerRight: [Math.PI * 0.5, 0, 0],
    eulerLeft: [Math.PI * 0.5, 0, 0],
    uniformScale: 0.96,
  },
  "tactical-medkit-radio": {
    palmDelta: [0.014, -0.03, 0.012],
    eulerRight: [Math.PI * 0.47, 0.16, -0.1],
    eulerLeft: [Math.PI * 0.47, -0.16, 0.1],
    uniformScale: 1.04,
  },
  "artisan-drip-kettle": {
    palmDelta: [0.016, -0.036, 0.01],
    eulerRight: [Math.PI * 0.48, 0.08, -0.06],
    eulerLeft: [Math.PI * 0.48, -0.08, 0.06],
    uniformScale: 1.04,
  },
  "sacred-chalice-wand": {
    palmDelta: [0.01, -0.032, 0.01],
    eulerRight: [Math.PI * 0.5, 0.12, -0.06],
    eulerLeft: [Math.PI * 0.5, -0.12, 0.06],
    uniformScale: 1.05,
  },
};

export const PARTNER_GRIP_RIGHT_ARM_DEG: Readonly<Record<HandPropId, { readonly upper: readonly [number, number, number]; readonly lower: readonly [number, number, number]; readonly hand: readonly [number, number, number] }>> = {
  smartphone: { upper: [14, 28, 60], lower: [32, 82, -26], hand: [18, 12, -8] },
  "coffee-cup": { upper: [10, 24, 62], lower: [12, 86, -24], hand: [6, 14, -10] },
  "case-folder": { upper: [12, 22, 62], lower: [24, 78, -18], hand: [10, 10, -6] },
  "aether-blade": { upper: [-8, 32, 48], lower: [-12, 68, -18], hand: [-14, 18, -12] },
  "imperial-scroll": { upper: [12, 26, 60], lower: [22, 80, -20], hand: [10, 12, -8] },
  "jade-folding-fan": { upper: [16, 28, 56], lower: [28, 86, -24], hand: [16, 16, -10] },
  "calling-card-rose": { upper: [18, 30, 54], lower: [30, 88, -22], hand: [14, 18, -8] },
  "medical-chart-clipboard": { upper: [14, 24, 60], lower: [26, 80, -20], hand: [12, 12, -8] },
  "idol-prism-lightstick": { upper: [18, 30, 52], lower: [34, 88, -22], hand: [14, 16, -8] },
  "varsity-basketball": { upper: [10, 22, 58], lower: [20, 74, -16], hand: [8, 10, -6] },
  "tactical-medkit-radio": { upper: [16, 28, 56], lower: [30, 84, -22], hand: [14, 14, -8] },
  "artisan-drip-kettle": { upper: [12, 24, 60], lower: [18, 84, -20], hand: [8, 12, -8] },
  "sacred-chalice-wand": { upper: [16, 28, 54], lower: [32, 86, -20], hand: [12, 16, -8] },
};

export const PARTNER_EXPRESSION_WEIGHTS: Readonly<Record<DuoPartnerExpressionPreset, Readonly<Record<string, number>>>> = {
  neutral: {},
  "warm-smile": {
    mouthSmile: 0.78,
    eyeSquint: 0.36,
    browInnerUp: 0.22,
    HappyBrow: 0.58,
  },
  "cold-smirk": {
    mouthSmile: 0.42,
    eyeSquint: 0.3,
    browDown: 0.28,
    AngryBrow: 0.26,
  },
  shocked: {
    eyeWide: 0.82,
    jawOpen: 0.48,
    browInnerUp: 0.68,
    mouthFunnel: 0.26,
  },
  "stern-glare": {
    mouthFrown: 0.52,
    browDown: 0.72,
    eyeSquint: 0.28,
    AngryBrow: 0.68,
  },
};
