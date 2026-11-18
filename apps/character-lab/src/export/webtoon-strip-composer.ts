/**
 * 한국형 세로 스크롤 웹툰 4컷 콘티 스트립(등장 로우앵글 · 대화 반측면 · 감정 클로즈업 · 여운 하이앵글)
 * 원고 여백·먹선 테두리·말풍선 상단 안전 여백, 선택적 말풍선·효과선(집중선/속도선/반짝이) 래스터 베이킹,
 * 및 1~4컷 개별 표정·시선·고개 연기 키프레임 스냅샷 시퀀스 합성 모듈.
 */
import {
  DEFAULT_FRAMING,
  eyeAnglesQuaternion,
  expressionToMorphWeights,
  failVisible,
  isLabFailure,
} from "../contracts";
import { qNormalize } from "../shared/math";

import { MAX_PNG_EXPORT_DIMENSION, MAX_SETTLE_STEPS, MIN_EXPORT_DIMENSION, exportFileName } from "./export-session";
import { PNG_MIME, encodePng } from "./png-encoder";
import { blendPixelRgba, drawClippedLineRgba, fillRectRgba } from "./webtoon-strip-raster";

import type { ExportDeps, ExportOutcome } from "./export-session";
import type {
  ApplyPlan,
  CameraFramingMode,
  CapturedRaster,
  CharacterEngine,
  ExpressionWeights,
  LabFailure,
  Quat,
  Vec3,
} from "../contracts";

export interface WebtoonStripCutSpec {
  readonly id: string;
  readonly labelKo: string;
  readonly mode: Exclude<CameraFramingMode, "custom">;
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly distanceScale: number;
}

export const WEBTOON_VERTICAL_STRIP_CUTS: readonly WebtoonStripCutSpec[] = Object.freeze([
  { id: "intro-low", labelKo: "1컷 · 등장 전신 로우앵글", mode: "full-body", yawDeg: 0, pitchDeg: -14, distanceScale: 1 },
  { id: "dialogue-side", labelKo: "2컷 · 대화 상반신 반측면", mode: "bust", yawDeg: 28, pitchDeg: 0, distanceScale: 1 },
  { id: "emotion-face", labelKo: "3컷 · 감정 클로즈업 정면", mode: "face", yawDeg: -10, pitchDeg: 0, distanceScale: 1 },
  { id: "linger-high", labelKo: "4컷 · 여운 상반신 하이앵글", mode: "bust", yawDeg: -26, pitchDeg: 18, distanceScale: 1 },
]);

export type WebtoonStripFxLinesKind = "none" | "focus-radial" | "speed-diagonal" | "romance-sparkle";

export interface WebtoonStripMangaFxOptions {
  readonly enabled: boolean;
  readonly linesKind?: WebtoonStripFxLinesKind;
  readonly includeSpeechBubbles?: boolean;
  readonly intensity?: number;
}

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

export interface WebtoonStripLayout {
  readonly stripWidth: number;
  readonly stripHeight: number;
  readonly cutWidth: number;
  readonly cutHeight: number;
  readonly marginX: number;
  readonly marginY: number;
  readonly gutterY: number;
  readonly borderPx: number;
  readonly bubbleSafeTopPx: number;
}

export interface ExportWebtoonVerticalStripOptions {
  /** 요청 원고 가로 폭(px, 기본 800px · 최대 1024px) */
  readonly stripWidth: number;
  /** 각 컷 상단에 말풍선 배치용 안전 여백을 확보할지 여부(기본 true) */
  readonly includeBubbleSafeZone?: boolean;
  /** 말풍선 풍선 프레임과 집중선·속도선·반짝이를 PNG 래스터에 직접 베이킹할지 여부(선택) */
  readonly mangaFx?: WebtoonStripMangaFxOptions;
  /** 1~4컷마다 서로 다른 표정·시선·고개 연기가 이어지는 4컷 서사 키프레임 옵션(선택, 캡처 후 basePlan 자동 복원) */
  readonly actingArc?: {
    readonly arcId: Exclude<WebtoonStripActingArcId, "none">;
    readonly basePlan: ApplyPlan;
  };
  readonly settleSteps?: number;
  readonly onProgress?: (stepIndex: number, totalSteps: number, labelKo: string) => void;
}

const defaultNow = (): number => Date.now();
const MAX_STRIP_WIDTH = 1024;

function toFailure(code: string, reasonKo: string, error: unknown, now: number): LabFailure {
  return isLabFailure(error) ? error : failVisible(code, reasonKo, error, now);
}

function deterministicHash01(index: number, seed: number): number {
  const raw = Math.sin((index + 1) * 12.9898 + seed * 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

export function clampWebtoonStripLayout(requestedWidth: number, includeBubbleSafeZone = true): WebtoonStripLayout {
  const cutCount = WEBTOON_VERTICAL_STRIP_CUTS.length;
  const safeStripW = Number.isFinite(requestedWidth)
    ? Math.min(MAX_STRIP_WIDTH, Math.max(MIN_EXPORT_DIMENSION + 8, Math.floor(requestedWidth)))
    : 800;

  const borderPx = Math.max(1, Math.round(safeStripW * 0.00375));
  const maxMarginX = Math.max(1, Math.floor((safeStripW - MIN_EXPORT_DIMENSION - borderPx * 2) / 2));
  const marginX = Math.min(maxMarginX, Math.max(2, Math.round(safeStripW * 0.046)));
  const cutWidth = Math.max(MIN_EXPORT_DIMENSION, safeStripW - (marginX + borderPx) * 2);

  const marginY = Math.max(2, Math.round(safeStripW * 0.038));
  const gutterY = Math.max(4, Math.round(safeStripW * 0.065));
  const bubbleSafeTopPx = includeBubbleSafeZone ? Math.max(4, Math.round(safeStripW * 0.052)) : 0;

  const fixedVerticalOverhead = marginY * 2 + gutterY * (cutCount - 1) + cutCount * (borderPx * 2 + bubbleSafeTopPx);
  const maxCutHeight = Math.floor((MAX_PNG_EXPORT_DIMENSION - fixedVerticalOverhead) / cutCount);
  const idealCutHeight = Math.round(cutWidth * 1.12);
  const cutHeight = Math.max(MIN_EXPORT_DIMENSION, Math.min(maxCutHeight, idealCutHeight));
  const stripHeight = fixedVerticalOverhead + cutCount * cutHeight;

  return {
    stripWidth: safeStripW,
    stripHeight,
    cutWidth,
    cutHeight,
    marginX,
    marginY,
    gutterY,
    borderPx,
    bubbleSafeTopPx,
  };
}

function bakePanelActionLines(
  rgba: Uint8ClampedArray,
  canvasWidth: number,
  innerX: number,
  innerY: number,
  innerWidth: number,
  innerHeight: number,
  kind: WebtoonStripFxLinesKind,
  intensity: number,
  cutIndex: number,
): void {
  if (kind === "none") return;
  const clipX1 = innerX + innerWidth;
  const clipY1 = innerY + innerHeight;
  const cx = innerX + innerWidth * 0.5;
  const cy = innerY + innerHeight * 0.46;
  const strokeScale = Math.max(0.55, innerWidth / 720);

  if (kind === "focus-radial") {
    const lineCount = Math.round(32 + intensity * 36);
    const minDim = Math.min(innerWidth, innerHeight);
    for (let i = 0; i < lineCount; i += 1) {
      const ang = (i / lineCount) * Math.PI * 2 + (deterministicHash01(i, cutIndex + 1.3) - 0.5) * 0.06;
      const rIn = minDim * (0.31 + deterministicHash01(i, cutIndex + 4.1) * 0.11);
      const rOut = Math.hypot(innerWidth, innerHeight) * 0.65;
      drawClippedLineRgba(
        rgba,
        canvasWidth,
        innerX,
        innerY,
        clipX1,
        clipY1,
        cx + Math.cos(ang) * rIn,
        cy + Math.sin(ang) * rIn,
        cx + Math.cos(ang) * rOut,
        cy + Math.sin(ang) * rOut,
        (0.65 + deterministicHash01(i, 7.7) * 0.95) * strokeScale,
        24,
        21,
        28,
        0.55 * intensity,
      );
    }
  } else if (kind === "speed-diagonal") {
    const lineCount = Math.round(22 + intensity * 26);
    const dirX = 0.88;
    const dirY = -0.475;
    const perpX = -dirY;
    const perpY = dirX;
    for (let i = 0; i < lineCount; i += 1) {
      const lane = ((i / Math.max(1, lineCount - 1)) - 0.5) * (innerWidth + innerHeight) * 0.62;
      const side = i % 2 === 0 ? -1 : 1;
      const startOff = side < 0 ? -innerWidth * 0.72 : innerWidth * (0.20 + deterministicHash01(i, 2.9) * 0.16);
      const segLen = innerWidth * (0.28 + deterministicHash01(i, 6.1) * 0.28);
      const bx = cx + perpX * lane;
      const by = cy + perpY * lane;
      drawClippedLineRgba(
        rgba,
        canvasWidth,
        innerX,
        innerY,
        clipX1,
        clipY1,
        bx + dirX * startOff,
        by + dirY * startOff,
        bx + dirX * (startOff + segLen),
        by + dirY * (startOff + segLen),
        (0.6 + deterministicHash01(i, 9.2) * 0.85) * strokeScale,
        24,
        21,
        28,
        0.52 * intensity,
      );
    }
  } else if (kind === "romance-sparkle") {
    const spots = [
      [0.16, 0.22, 0.036],
      [0.84, 0.20, 0.042],
      [0.14, 0.62, 0.030],
      [0.86, 0.58, 0.034],
    ] as const;
    for (const [ux, uy, ur] of spots) {
      const sx = innerX + innerWidth * ux;
      const sy = innerY + innerHeight * uy;
      const arm = Math.max(3, innerWidth * ur * (0.75 + intensity * 0.35));
      drawClippedLineRgba(rgba, canvasWidth, innerX, innerY, clipX1, clipY1, sx - arm, sy, sx + arm, sy, 0.9 * strokeScale, 240, 201, 120, 0.88);
      drawClippedLineRgba(rgba, canvasWidth, innerX, innerY, clipX1, clipY1, sx, sy - arm, sx, sy + arm, 0.9 * strokeScale, 240, 201, 120, 0.88);
    }
  }
}

function bakeSpeechBubbleBalloon(
  rgba: Uint8ClampedArray,
  canvasWidth: number,
  innerX: number,
  innerY: number,
  innerWidth: number,
  innerHeight: number,
  placeRight: boolean,
): void {
  const clipX1 = innerX + innerWidth;
  const clipY1 = innerY + innerHeight;
  const rx = Math.max(8, Math.round(innerWidth * 0.19));
  const ry = Math.max(5, Math.round(innerHeight * 0.085));
  const cx = placeRight ? innerX + Math.round(innerWidth * 0.74) : innerX + Math.round(innerWidth * 0.26);
  const cy = innerY + Math.round(ry * 1.32);
  const border = Math.max(1, Math.round(innerWidth * 0.0042));

  const x0 = Math.max(innerX, cx - rx - border - 1);
  const x1 = Math.min(clipX1 - 1, cx + rx + border + 1);
  const y0 = Math.max(innerY, cy - ry - border - 1);
  const y1 = Math.min(clipY1 - 1, cy + ry + border + 1);

  for (let py = y0; py <= y1; py += 1) {
    for (let px = x0; px <= x1; px += 1) {
      const ndOuter = Math.hypot((px - cx) / (rx + border), (py - cy) / (ry + border));
      if (ndOuter > 1.0) continue;
      const ndInner = Math.hypot((px - cx) / rx, (py - cy) / ry);
      if (ndInner <= 1.0) {
        blendPixelRgba(rgba, canvasWidth, px, py, innerX, innerY, clipX1, clipY1, 255, 254, 251, 0.97);
      } else {
        blendPixelRgba(rgba, canvasWidth, px, py, innerX, innerY, clipX1, clipY1, 24, 21, 28, 0.95);
      }
    }
  }

  const dir = placeRight ? -1 : 1;
  const tailTipX = cx + dir * Math.round(rx * 0.72);
  const tailTipY = cy + Math.round(ry * 1.48);
  drawClippedLineRgba(
    rgba,
    canvasWidth,
    innerX,
    innerY,
    clipX1,
    clipY1,
    cx + dir * Math.round(rx * 0.34),
    cy + Math.round(ry * 0.88),
    tailTipX,
    tailTipY,
    Math.max(1, border * 0.9),
    24,
    21,
    28,
    0.95,
  );
}

export function composeWebtoonVerticalStrip(
  panels: readonly CapturedRaster[],
  layout: WebtoonStripLayout,
  mangaFx?: WebtoonStripMangaFxOptions,
): CapturedRaster {
  if (panels.length !== WEBTOON_VERTICAL_STRIP_CUTS.length) {
    throw new Error(`웹툰 4컷 스트립 합성에는 ${WEBTOON_VERTICAL_STRIP_CUTS.length}개의 컷이 필요합니다(전달됨: ${panels.length}).`);
  }
  const out = new Uint8ClampedArray(layout.stripWidth * layout.stripHeight * 4);
  out.fill(255);

  const frameWidth = layout.cutWidth + layout.borderPx * 2;
  const frameHeight = layout.bubbleSafeTopPx + layout.cutHeight + layout.borderPx * 2;
  const fxEnabled = mangaFx?.enabled === true;
  const fxLinesKind: WebtoonStripFxLinesKind = fxEnabled ? (mangaFx?.linesKind ?? "focus-radial") : "none";
  const fxIncludeBubbles = fxEnabled && mangaFx?.includeSpeechBubbles !== false;
  const fxIntensity = Math.min(1, Math.max(0.2, Number.isFinite(mangaFx?.intensity) ? (mangaFx?.intensity ?? 0.75) : 0.75));

  for (let idx = 0; idx < panels.length; idx += 1) {
    const panel = panels[idx];
    if (!panel) continue;
    if (panel.width !== layout.cutWidth || panel.height !== layout.cutHeight) {
      throw new Error(
        `${idx + 1}번째 컷 크기(${panel.width}×${panel.height})가 레이아웃 컷 크기(${layout.cutWidth}×${layout.cutHeight})와 다릅니다.`,
      );
    }

    const frameX = layout.marginX;
    const frameY = layout.marginY + idx * (frameHeight + layout.gutterY);

    fillRectRgba(out, layout.stripWidth, frameX, frameY, frameWidth, frameHeight, 24, 21, 28, 255);

    const innerX = frameX + layout.borderPx;
    const innerY = frameY + layout.borderPx;
    const innerHeight = layout.bubbleSafeTopPx + layout.cutHeight;

    for (let py = 0; py < innerHeight; py += 1) {
      const t = innerHeight > 1 ? py / (innerHeight - 1) : 0;
      const bgR = Math.round(250 - 11 * t);
      const bgG = Math.round(247 - 13 * t);
      const bgB = Math.round(242 - 18 * t);
      let dst = ((innerY + py) * layout.stripWidth + innerX) * 4;
      for (let px = 0; px < layout.cutWidth; px += 1) {
        out[dst] = bgR;
        out[dst + 1] = bgG;
        out[dst + 2] = bgB;
        out[dst + 3] = 255;
        dst += 4;
      }
    }

    if (fxLinesKind !== "none") {
      bakePanelActionLines(out, layout.stripWidth, innerX, innerY, layout.cutWidth, innerHeight, fxLinesKind, fxIntensity, idx);
    }

    const cutStartY = innerY + layout.bubbleSafeTopPx;
    for (let cy = 0; cy < layout.cutHeight; cy += 1) {
      let src = cy * layout.cutWidth * 4;
      let dst = ((cutStartY + cy) * layout.stripWidth + innerX) * 4;
      for (let cx = 0; cx < layout.cutWidth; cx += 1) {
        const srcA = panel.rgba[src + 3] ?? 0;
        if (srcA === 255) {
          out[dst] = panel.rgba[src] ?? 0;
          out[dst + 1] = panel.rgba[src + 1] ?? 0;
          out[dst + 2] = panel.rgba[src + 2] ?? 0;
        } else if (srcA > 0) {
          const alpha = srcA / 255;
          const inv = 1 - alpha;
          out[dst] = Math.round((panel.rgba[src] ?? 0) * alpha + (out[dst] ?? 255) * inv);
          out[dst + 1] = Math.round((panel.rgba[src + 1] ?? 0) * alpha + (out[dst + 1] ?? 255) * inv);
          out[dst + 2] = Math.round((panel.rgba[src + 2] ?? 0) * alpha + (out[dst + 2] ?? 255) * inv);
        }
        out[dst + 3] = 255;
        src += 4;
        dst += 4;
      }
    }

    if (fxIncludeBubbles) {
      bakeSpeechBubbleBalloon(out, layout.stripWidth, innerX, innerY, layout.cutWidth, innerHeight, idx % 2 === 1);
    }
  }

  return { width: layout.stripWidth, height: layout.stripHeight, rgba: out };
}

export async function exportWebtoonVerticalStripPng(
  engine: CharacterEngine,
  options: ExportWebtoonVerticalStripOptions,
  deps: ExportDeps = {},
): Promise<ExportOutcome> {
  const now = deps.now ?? defaultNow;
  const started = now();
  const layout = clampWebtoonStripLayout(options.stripWidth, options.includeBubbleSafeZone ?? true);

  if (layout.stripHeight > MAX_PNG_EXPORT_DIMENSION || layout.stripWidth > MAX_PNG_EXPORT_DIMENSION) {
    return {
      ok: false,
      failure: failVisible(
        "export-webtoon-strip-size",
        `세로 4컷 웹툰 스트립 크기(${layout.stripWidth}×${layout.stripHeight}px)가 최대 허용 해상도(${MAX_PNG_EXPORT_DIMENSION}px)를 초과합니다.`,
        undefined,
        started,
      ),
    };
  }

  const settleSteps = Math.min(MAX_SETTLE_STEPS, Math.max(0, Math.floor(options.settleSteps ?? 0)));
  if (settleSteps > 0) {
    try {
      await engine.settle(settleSteps);
    } catch (error) {
      return { ok: false, failure: toFailure("export-settle", "웹툰 콘티 스트립 캡처 전 물리 settle에 실패했습니다.", error, started) };
    }
  }

  const resolvedArc = options.actingArc ? findWebtoonStripActingArc(options.actingArc.arcId) : null;
  const panels: CapturedRaster[] = [];
  let lastProvenance = undefined;
  let appliedActingKeyframe = false;

  try {
    for (let idx = 0; idx < WEBTOON_VERTICAL_STRIP_CUTS.length; idx += 1) {
      const cut = WEBTOON_VERTICAL_STRIP_CUTS[idx];
      if (!cut) continue;
      const keyframe = resolvedArc?.cuts[idx];
      const stepLabel = keyframe ? `${cut.labelKo} (${keyframe.beatKo})` : cut.labelKo;
      options.onProgress?.(idx + 1, WEBTOON_VERTICAL_STRIP_CUTS.length, stepLabel);

      if (keyframe && options.actingArc) {
        try {
          engine.applyPlan(buildActingCutPlan(options.actingArc.basePlan, keyframe, idx));
          appliedActingKeyframe = true;
        } catch (error) {
          return { ok: false, failure: toFailure("export-acting-plan", `${stepLabel} 연기 스냅샷 적용에 실패했습니다.`, error, started) };
        }
      }

      try {
        const captured = await engine.renderPasses({
          width: layout.cutWidth,
          height: layout.cutHeight,
          passes: ["lit"],
          transparentBackground: true,
          settleSteps: 0,
          camera: {
            ...DEFAULT_FRAMING,
            mode: cut.mode,
            yawDeg: cut.yawDeg,
            pitchDeg: cut.pitchDeg,
            distanceScale: cut.distanceScale,
          },
        });
        if (captured.width !== layout.cutWidth || captured.height !== layout.cutHeight) {
          return {
            ok: false,
            failure: failVisible(
              "export-capture-size",
              `엔진이 컷 크기 ${layout.cutWidth}×${layout.cutHeight} 대신 ${captured.width}×${captured.height}를 반환했습니다.`,
              undefined,
              started,
            ),
          };
        }
        const lit = captured.passes.lit;
        if (!lit) {
          return { ok: false, failure: failVisible("export-missing-lit", `${cut.labelKo} 캡처에 lit 패스가 없습니다.`, undefined, started) };
        }
        panels.push(lit);
        lastProvenance = captured.provenance;
      } catch (error) {
        return { ok: false, failure: toFailure("export-capture", `웹툰 4컷 스트립(${cut.labelKo}) 캡처에 실패했습니다.`, error, started) };
      }
    }
  } finally {
    if (appliedActingKeyframe && options.actingArc) {
      try {
        engine.applyPlan(options.actingArc.basePlan);
      } catch {
        // 엔진이 해제된 경우 복원 실패는 무시한다
      }
    }
  }

  if (!lastProvenance) {
    return { ok: false, failure: failVisible("export-missing-lit", "웹툰 4컷 스트립 캡처 결과가 비어 있습니다.", undefined, started) };
  }

  try {
    const composed = composeWebtoonVerticalStrip(panels, layout, options.mangaFx);
    const bytes = await encodePng(composed, { filter: "adaptive" });
    const baseName = exportFileName("png", lastProvenance.recipeDigest, composed.width, composed.height);
    const actingTag = resolvedArc ? "-acting" : "";
    const fxTag = options.mangaFx?.enabled ? "-fx" : "";
    const suffix = `-webtoon-4cut${actingTag}${fxTag}-strip.png`;
    const fileName = baseName.replace(/\.png$/u, suffix);
    return {
      ok: true,
      bytes,
      receipt: {
        kind: "png",
        fileName,
        mime: PNG_MIME,
        bytes: bytes.length,
        width: composed.width,
        height: composed.height,
        settleSteps,
        provenance: lastProvenance,
        durationMs: now() - started,
      },
    };
  } catch (error) {
    return { ok: false, failure: toFailure("export-png-encode", "웹툰 4컷 스트립 PNG 인코딩에 실패했습니다.", error, started) };
  }
}
