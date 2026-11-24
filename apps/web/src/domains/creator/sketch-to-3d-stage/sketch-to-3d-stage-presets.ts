/**
 * Sketch-to-3D Stage Solver 즉시 테스트용 4종 2D 러프 스케치 프리셋.
 * 각 프리셋은 순수 2D 스트로크 좌표만 보유하며, 포즈·화각·조명은 역산 엔진이 기하학으로 직접 산출한다.
 */

import type {
  SketchPoint2D,
  SketchStagePreset,
  SketchStagePresetId,
  SketchStroke2D,
} from "./sketch-to-3d-stage-types";

/** 중심 (cx, cy), 정규화 반지름 (rx, ry) 기반 2D 러프 타원(머리 원) 스트로크 포인트 생성. */
function buildHeadOvalPoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  segments = 16,
): readonly SketchPoint2D[] {
  const pts: SketchPoint2D[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const theta = (i / segments) * Math.PI * 2;
    pts.push({
      x: Number((cx + Math.cos(theta) * rx).toFixed(4)),
      y: Number((cy + Math.sin(theta) * ry).toFixed(4)),
    });
  }
  return pts;
}

/** 평행 빗금(그림자 영역) 스트로크 다발 생성. */
function buildHatchBlock(
  prefix: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  lines: number,
  slant = 0.04,
): readonly SketchStroke2D[] {
  const strokes: SketchStroke2D[] = [];
  for (let i = 0; i < lines; i += 1) {
    const t = lines <= 1 ? 0.5 : i / (lines - 1);
    const sx = x0 + (x1 - x0) * t;
    const sy = y0 + (y1 - y0) * (t * 0.25);
    const ex = sx + slant;
    const ey = y1 - (y1 - y0) * ((1 - t) * 0.2);
    strokes.push({
      id: `${prefix}-${i + 1}`,
      kind: "shadowHatch",
      points: [
        { x: Number(sx.toFixed(4)), y: Number(sy.toFixed(4)) },
        { x: Number(ex.toFixed(4)), y: Number(ey.toFixed(4)) },
      ],
    });
  }
  return strokes;
}

/** 1. 하이앵글 액션 펀치 (24mm 광각 · 부감 하이앵글 · 전방 펀치 포즈 · 좌상단 주광원). */
const HIGH_ANGLE_ACTION_PUNCH_PRESET: SketchStagePreset = {
  id: "high-angle-action-punch",
  labelKo: "하이앵글 액션 펀치",
  labelEn: "High-Angle Action Punch",
  summaryKo: "높은 지평선과 급격한 2점 소실선(24mm 부감), 전방 펀치 제스처, 우하단 그림자 빗금",
  summaryEn: "High horizon with steep 2-point convergence (24mm high-angle), forward punch, bottom-right shadow hatch",
  sketch: {
    aspectRatio: 16 / 9,
    strokes: [
      { id: "hap-head", kind: "head", points: buildHeadOvalPoints(0.48, 0.28, 0.043, 0.075) },
      {
        id: "hap-spine",
        kind: "spine",
        points: [
          { x: 0.48, y: 0.35 },
          { x: 0.45, y: 0.47 },
          { x: 0.43, y: 0.58 },
        ],
      },
      {
        id: "hap-rarm",
        kind: "rightArm",
        points: [
          { x: 0.42, y: 0.38 },
          { x: 0.33, y: 0.44 },
          { x: 0.38, y: 0.51 },
        ],
      },
      {
        id: "hap-larm",
        kind: "leftArm",
        points: [
          { x: 0.54, y: 0.37 },
          { x: 0.65, y: 0.44 },
          { x: 0.61, y: 0.33 },
        ],
      },
      {
        id: "hap-rleg",
        kind: "rightLeg",
        points: [
          { x: 0.4, y: 0.58 },
          { x: 0.3, y: 0.72 },
          { x: 0.25, y: 0.88 },
        ],
      },
      {
        id: "hap-lleg",
        kind: "leftLeg",
        points: [
          { x: 0.47, y: 0.58 },
          { x: 0.58, y: 0.7 },
          { x: 0.67, y: 0.84 },
        ],
      },
      // 소실선 A -> VP_A(-0.175, 0.08)
      {
        id: "hap-vpa-1",
        kind: "vanishingPairA",
        points: [
          { x: 0.86, y: 0.94 },
          { x: 0.1, y: 0.3085 },
        ],
      },
      {
        id: "hap-vpa-2",
        kind: "vanishingPairA",
        points: [
          { x: 0.94, y: 0.6 },
          { x: 0.14, y: 0.2269 },
        ],
      },
      // 소실선 B -> VP_B(1.242, 0.08)
      {
        id: "hap-vpb-1",
        kind: "vanishingPairB",
        points: [
          { x: 0.12, y: 0.94 },
          { x: 0.88, y: 0.3575 },
        ],
      },
      {
        id: "hap-vpb-2",
        kind: "vanishingPairB",
        points: [
          { x: 0.06, y: 0.62 },
          { x: 0.86, y: 0.2545 },
        ],
      },
      ...buildHatchBlock("hap-sh", 0.61, 0.7, 0.8, 0.9, 6, 0.05),
    ],
  },
};

/** 2. 로우앵글 히어로 착지 (24mm 광각 · 앙각 로우앵글 · 3점 착지 무릎 굽힘 · 우상단 주광원). */
const LOW_ANGLE_HERO_LANDING_PRESET: SketchStagePreset = {
  id: "low-angle-hero-landing",
  labelKo: "로우앵글 히어로 착지",
  labelEn: "Low-Angle Hero Landing",
  summaryKo: "낮은 지평선과 상향 투시 소실선(24mm 앙각), 3점 착지 웅크림 포즈, 좌하단 충격 그림자",
  summaryEn: "Low horizon looking upward (24mm low-angle), three-point crouched landing pose, bottom-left impact shadow",
  sketch: {
    aspectRatio: 16 / 9,
    strokes: [
      { id: "lah-head", kind: "head", points: buildHeadOvalPoints(0.49, 0.37, 0.039, 0.068) },
      {
        id: "lah-spine",
        kind: "spine",
        points: [
          { x: 0.5, y: 0.44 },
          { x: 0.53, y: 0.53 },
          { x: 0.55, y: 0.62 },
        ],
      },
      {
        id: "lah-rarm",
        kind: "rightArm",
        points: [
          { x: 0.45, y: 0.46 },
          { x: 0.42, y: 0.63 },
          { x: 0.43, y: 0.81 },
        ],
      },
      {
        id: "lah-larm",
        kind: "leftArm",
        points: [
          { x: 0.56, y: 0.45 },
          { x: 0.68, y: 0.37 },
          { x: 0.77, y: 0.27 },
        ],
      },
      {
        id: "lah-rleg",
        kind: "rightLeg",
        points: [
          { x: 0.5, y: 0.62 },
          { x: 0.36, y: 0.6 },
          { x: 0.35, y: 0.82 },
        ],
      },
      {
        id: "lah-lleg",
        kind: "leftLeg",
        points: [
          { x: 0.58, y: 0.62 },
          { x: 0.65, y: 0.76 },
          { x: 0.76, y: 0.81 },
        ],
      },
      // 소실선 A -> VP_A(-0.203, 0.92)
      {
        id: "lah-vpa-1",
        kind: "vanishingPairA",
        points: [
          { x: 0.86, y: 0.1 },
          { x: 0.08, y: 0.7017 },
        ],
      },
      {
        id: "lah-vpa-2",
        kind: "vanishingPairA",
        points: [
          { x: 0.92, y: 0.42 },
          { x: 0.1, y: 0.7851 },
        ],
      },
      // 소실선 B -> VP_B(1.220, 0.92)
      {
        id: "lah-vpb-1",
        kind: "vanishingPairB",
        points: [
          { x: 0.14, y: 0.1 },
          { x: 0.92, y: 0.6922 },
        ],
      },
      {
        id: "lah-vpb-2",
        kind: "vanishingPairB",
        points: [
          { x: 0.08, y: 0.44 },
          { x: 0.9, y: 0.7852 },
        ],
      },
      ...buildHatchBlock("lah-sh", 0.18, 0.75, 0.37, 0.91, 6, -0.05),
    ],
  },
};

/** 3. 카페 대각선 투샷 (50mm 표준 · 아이레벨 대각선 Yaw · 착석 대화 포즈 · 좌측 창가 소프트 광원). */
const CAFE_DIAGONAL_TWO_SHOT_PRESET: SketchStagePreset = {
  id: "cafe-diagonal-two-shot",
  labelKo: "카페 대각선 투샷",
  labelEn: "Cafe Diagonal Two-Shot",
  summaryKo: "비대칭 실내 2점 투시(50mm 아이레벨·대각선 Yaw), 착석 대화 제스처, 부드러운 창가 그림자",
  summaryEn: "Asymmetric interior 2-point perspective (50mm eye-level diagonal yaw), seated gesture, soft window shadow",
  sketch: {
    aspectRatio: 16 / 9,
    strokes: [
      { id: "cdt-head", kind: "head", points: buildHeadOvalPoints(0.38, 0.3, 0.04, 0.07) },
      {
        id: "cdt-spine",
        kind: "spine",
        points: [
          { x: 0.37, y: 0.37 },
          { x: 0.365, y: 0.5 },
          { x: 0.36, y: 0.63 },
        ],
      },
      {
        id: "cdt-rarm",
        kind: "rightArm",
        points: [
          { x: 0.31, y: 0.41 },
          { x: 0.28, y: 0.56 },
          { x: 0.4, y: 0.57 },
        ],
      },
      {
        id: "cdt-larm",
        kind: "leftArm",
        points: [
          { x: 0.43, y: 0.41 },
          { x: 0.48, y: 0.54 },
          { x: 0.55, y: 0.5 },
        ],
      },
      {
        id: "cdt-rleg",
        kind: "rightLeg",
        points: [
          { x: 0.33, y: 0.63 },
          { x: 0.42, y: 0.7 },
          { x: 0.41, y: 0.89 },
        ],
      },
      {
        id: "cdt-lleg",
        kind: "leftLeg",
        points: [
          { x: 0.39, y: 0.63 },
          { x: 0.48, y: 0.71 },
          { x: 0.47, y: 0.89 },
        ],
      },
      // 소실선 A -> VP_A(-0.203, 0.48)
      {
        id: "cdt-vpa-1",
        kind: "vanishingPairA",
        points: [
          { x: 0.94, y: 0.14 },
          { x: 0.12, y: 0.3839 },
        ],
      },
      {
        id: "cdt-vpa-2",
        kind: "vanishingPairA",
        points: [
          { x: 0.94, y: 0.84 },
          { x: 0.1, y: 0.5754 },
        ],
      },
      // 소실선 B -> VP_B(3.245, 0.48)
      {
        id: "cdt-vpb-1",
        kind: "vanishingPairB",
        points: [
          { x: 0.06, y: 0.2 },
          { x: 0.92, y: 0.2756 },
        ],
      },
      {
        id: "cdt-vpb-2",
        kind: "vanishingPairB",
        points: [
          { x: 0.06, y: 0.74 },
          { x: 0.92, y: 0.6698 },
        ],
      },
      ...buildHatchBlock("cdt-sh", 0.54, 0.62, 0.68, 0.78, 3, 0.03),
    ],
  },
};

/** 4. 클로즈업 역광 드라마 (85mm 망원 · 클로즈업 바스트 · 정면 전면 빗금 기반 배면 역광 + 강한 림 라이트). */
const CLOSEUP_BACKLIGHT_DRAMA_PRESET: SketchStagePreset = {
  id: "closeup-backlight-drama",
  labelKo: "클로즈업 역광 드라마",
  labelEn: "Close-Up Backlight Drama",
  summaryKo: "완만한 원거리 투시(85mm 망원 압축), 클로즈업 상반신 포즈, 얼굴 전면 그림자 기반 역광 림 라이트",
  summaryEn: "Compressed telephoto perspective (85mm close-up), dramatic bust pose, front-face shadow hatch for backlight rim",
  sketch: {
    aspectRatio: 16 / 9,
    strokes: [
      { id: "cbd-head", kind: "head", points: buildHeadOvalPoints(0.5, 0.38, 0.102, 0.18) },
      {
        id: "cbd-spine",
        kind: "spine",
        points: [
          { x: 0.5, y: 0.57 },
          { x: 0.495, y: 0.74 },
          { x: 0.49, y: 0.92 },
        ],
      },
      {
        id: "cbd-rarm",
        kind: "rightArm",
        points: [
          { x: 0.36, y: 0.66 },
          { x: 0.34, y: 0.84 },
          { x: 0.45, y: 0.62 },
        ],
      },
      {
        id: "cbd-larm",
        kind: "leftArm",
        points: [
          { x: 0.64, y: 0.66 },
          { x: 0.68, y: 0.85 },
          { x: 0.67, y: 0.96 },
        ],
      },
      // 소실선 A -> VP_A(-1.862, 0.52) (85mm 망원 압축)
      {
        id: "cbd-vpa-1",
        kind: "vanishingPairA",
        points: [
          { x: 0.92, y: 0.22 },
          { x: 0.08, y: 0.3106 },
        ],
      },
      {
        id: "cbd-vpa-2",
        kind: "vanishingPairA",
        points: [
          { x: 0.92, y: 0.82 },
          { x: 0.08, y: 0.7294 },
        ],
      },
      // 소실선 B -> VP_B(2.862, 0.52)
      {
        id: "cbd-vpb-1",
        kind: "vanishingPairB",
        points: [
          { x: 0.08, y: 0.24 },
          { x: 0.92, y: 0.3246 },
        ],
      },
      {
        id: "cbd-vpb-2",
        kind: "vanishingPairB",
        points: [
          { x: 0.08, y: 0.8 },
          { x: 0.92, y: 0.7154 },
        ],
      },
      // 얼굴·상체 전면 그림자 빗금 -> 배면 역광 + 강한 Rim 자동 역산
      ...buildHatchBlock("cbd-sh", 0.41, 0.24, 0.59, 0.76, 8, 0.025),
    ],
  },
};

export const SKETCH_STAGE_PRESETS: readonly SketchStagePreset[] = Object.freeze([
  HIGH_ANGLE_ACTION_PUNCH_PRESET,
  LOW_ANGLE_HERO_LANDING_PRESET,
  CAFE_DIAGONAL_TWO_SHOT_PRESET,
  CLOSEUP_BACKLIGHT_DRAMA_PRESET,
]);

export function getSketchStagePreset(id: SketchStagePresetId): SketchStagePreset {
  const found = SKETCH_STAGE_PRESETS.find((preset) => preset.id === id);
  return found ?? HIGH_ANGLE_ACTION_PUNCH_PRESET;
}
