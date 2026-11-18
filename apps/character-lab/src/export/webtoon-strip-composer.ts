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

export type WebtoonStripDialogueLines = readonly [string, string, string, string];

export const DEFAULT_WEBTOON_STRIP_DIALOGUE_LINES: WebtoonStripDialogueLines = Object.freeze([
  "여기서부터는 내 구역이야.",
  "기다리고 있었어, 그 말.",
  "지금 이 순간을 전부 기억해.",
  "끝까지 함께 가자.",
]) as WebtoonStripDialogueLines;

export interface WebtoonStripMangaFxOptions {
  readonly enabled: boolean;
  readonly linesKind?: WebtoonStripFxLinesKind;
  readonly includeSpeechBubbles?: boolean;
  readonly intensity?: number;
  /** 1~4컷 말풍선 내부에 직접 래스터 식자(타이포그래피 합성)할 한국어 대사 4줄 */
  readonly dialogueLines?: WebtoonStripDialogueLines;
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

function blendPixelRgba(
  rgba: Uint8ClampedArray,
  canvasWidth: number,
  x: number,
  y: number,
  clipX0: number,
  clipY0: number,
  clipX1: number,
  clipY1: number,
  r: number,
  g: number,
  b: number,
  alpha01: number,
): void {
  if (x < clipX0 || x >= clipX1 || y < clipY0 || y >= clipY1 || alpha01 <= 0) return;
  const a = alpha01 >= 1 ? 1 : alpha01;
  const dst = (y * canvasWidth + x) * 4;
  const inv = 1 - a;
  rgba[dst] = Math.round(r * a + (rgba[dst] ?? 255) * inv);
  rgba[dst + 1] = Math.round(g * a + (rgba[dst + 1] ?? 255) * inv);
  rgba[dst + 2] = Math.round(b * a + (rgba[dst + 2] ?? 255) * inv);
  rgba[dst + 3] = 255;
}

function drawClippedLineRgba(
  rgba: Uint8ClampedArray,
  canvasWidth: number,
  clipX0: number,
  clipY0: number,
  clipX1: number,
  clipY1: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radiusPx: number,
  r: number,
  g: number,
  b: number,
  opacity01: number,
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return;
  const steps = Math.ceil(len * 1.5);
  const pad = Math.ceil(radiusPx + 1);
  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    const cx = x0 + dx * t;
    const cy = y0 + dy * t;
    const ix0 = Math.max(clipX0, Math.floor(cx - pad));
    const ix1 = Math.min(clipX1 - 1, Math.ceil(cx + pad));
    const iy0 = Math.max(clipY0, Math.floor(cy - pad));
    const iy1 = Math.min(clipY1 - 1, Math.ceil(cy + pad));
    for (let py = iy0; py <= iy1; py += 1) {
      for (let px = ix0; px <= ix1; px += 1) {
        const dist = Math.hypot(px + 0.5 - cx, py + 0.5 - cy);
        if (dist <= radiusPx + 0.75) {
          const cov = dist <= radiusPx - 0.35 ? 1 : Math.max(0, 1 - (dist - (radiusPx - 0.35)) / 1.1);
          blendPixelRgba(rgba, canvasWidth, px, py, clipX0, clipY0, clipX1, clipY1, r, g, b, cov * opacity01);
        }
      }
    }
  }
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

function splitKoreanBubbleDialogue(rawText: string): readonly [string, string | null] {
  const cleaned = rawText.trim();
  if (!cleaned) return ["", null];
  if (cleaned.length <= 13) return [cleaned, null];
  const mid = Math.ceil(cleaned.length / 2);
  const spaceIdx = cleaned.lastIndexOf(" ", mid + 3);
  if (spaceIdx >= 3 && spaceIdx < cleaned.length - 2) {
    return [cleaned.slice(0, spaceIdx).trim(), cleaned.slice(spaceIdx + 1).trim()];
  }
  return [cleaned.slice(0, mid), cleaned.slice(mid)];
}

function tryRasterizeDialogueCanvas2d(
  boxWidth: number,
  boxHeight: number,
  line1: string,
  line2: string | null,
): { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray } | null {
  if (typeof document === "undefined" || boxWidth < 12 || boxHeight < 8) return null;
  try {
    const scale = 2;
    const w = Math.max(12, Math.floor(boxWidth * scale));
    const h = Math.max(8, Math.floor(boxHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, w, h);
    const maxChars = Math.max(line1.length, line2 ? line2.length : 0, 6);
    const fitByWidth = Math.floor((w * 0.84) / Math.max(4, maxChars * 0.92));
    const fitByHeight = Math.floor(h * (line2 ? 0.30 : 0.44));
    const fontPx = Math.max(10, Math.min(44, fitByWidth, fitByHeight));
    ctx.font = `600 ${fontPx}px "Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif`;
    ctx.fillStyle = "#18151C";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (line2) {
      const gap = Math.round(fontPx * 0.62);
      ctx.fillText(line1, w * 0.5, h * 0.5 - gap, w * 0.9);
      ctx.fillText(line2, w * 0.5, h * 0.5 + gap, w * 0.9);
    } else {
      ctx.fillText(line1, w * 0.5, h * 0.5, w * 0.9);
    }
    const img = ctx.getImageData(0, 0, w, h);
    let nonZeroAlpha = 0;
    for (let i = 3; i < img.data.length; i += 4) {
      if ((img.data[i] ?? 0) > 16) {
        nonZeroAlpha += 1;
        break;
      }
    }
    return nonZeroAlpha > 0 ? { width: w, height: h, data: img.data } : null;
  } catch {
    return null;
  }
}

function bakeDeterministicDialogueGlyphs(
  rgba: Uint8ClampedArray,
  canvasWidth: number,
  clipX0: number,
  clipY0: number,
  clipX1: number,
  clipY1: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  line1: string,
  line2: string | null,
): void {
  const lines = line2 ? [line1, line2] : [line1];
  const maxLen = Math.max(...lines.map((l) => l.length), 1);
  const cellW = Math.max(3, Math.min(Math.floor((rx * 1.48) / maxLen), Math.floor(ry * 0.52)));
  const cellH = Math.max(3, Math.round(cellW * 1.05));
  const stroke = Math.max(0.55, cellW * 0.11);

  lines.forEach((line, lineIdx) => {
    const chars = Array.from(line);
    const totalW = chars.length * cellW;
    const startX = cx - totalW * 0.5;
    const baseY = lines.length === 2 ? cy + (lineIdx === 0 ? -cellH * 0.68 : cellH * 0.68) : cy;

    chars.forEach((ch, idx) => {
      if (ch.trim() === "") return;
      const code = ch.codePointAt(0) ?? 46;
      const gx0 = startX + idx * cellW + cellW * 0.14;
      const gx1 = startX + (idx + 1) * cellW - cellW * 0.14;
      const gy0 = baseY - cellH * 0.42;
      const gy1 = baseY + cellH * 0.42;
      const gmx = (gx0 + gx1) * 0.5;
      const gmy = (gy0 + gy1) * 0.5;

      if (ch === "." || ch === "," || ch === "…") {
        blendPixelRgba(rgba, canvasWidth, Math.round(gmx), Math.round(gy1), clipX0, clipY0, clipX1, clipY1, 24, 21, 28, 0.92);
        return;
      }
      if (code >= 0xac00 && code <= 0xd7a3) {
        const syl = code - 0xac00;
        const cho = Math.floor(syl / 588);
        const jung = Math.floor((syl % 588) / 28);
        const jong = syl % 28;
        const topBottom = jong > 0 ? gmy : gy1;
        drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gx0, gy0, gmx, gy0, stroke, 24, 21, 28, 0.9);
        if (cho % 3 !== 0) {
          drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gx0, gy0, gx0, topBottom, stroke, 24, 21, 28, 0.88);
        }
        if (cho % 2 === 0) {
          drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gx0, (gy0 + topBottom) * 0.5, gmx, (gy0 + topBottom) * 0.5, stroke, 24, 21, 28, 0.86);
        }
        if (jung < 8 || jung >= 18) {
          drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gx1, gy0, gx1, topBottom, stroke, 24, 21, 28, 0.92);
        } else {
          drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gx0, topBottom, gx1, topBottom, stroke, 24, 21, 28, 0.92);
        }
        if (jong > 0) {
          drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gx0 + stroke, gy1, gx1, gy1, stroke, 24, 21, 28, 0.9);
          if (jong % 2 === 1) {
            drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gx0 + stroke, gmy + stroke, gx0 + stroke, gy1, stroke, 24, 21, 28, 0.85);
          }
        }
      } else {
        drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gmx, gy0, gmx, gy1, stroke, 24, 21, 28, 0.9);
        if (code % 2 === 0) {
          drawClippedLineRgba(rgba, canvasWidth, clipX0, clipY0, clipX1, clipY1, gx0, gy0, gx1, gy0, stroke, 24, 21, 28, 0.85);
        }
      }
    });
  });
}

function bakeSpeechBubbleBalloon(
  rgba: Uint8ClampedArray,
  canvasWidth: number,
  innerX: number,
  innerY: number,
  innerWidth: number,
  innerHeight: number,
  placeRight: boolean,
  dialogueText?: string,
): void {
  const clipX1 = innerX + innerWidth;
  const clipY1 = innerY + innerHeight;
  const rx = Math.max(8, Math.round(innerWidth * 0.21));
  const ry = Math.max(5, Math.round(innerHeight * 0.092));
  const cx = placeRight ? innerX + Math.round(innerWidth * 0.72) : innerX + Math.round(innerWidth * 0.28);
  const cy = innerY + Math.round(ry * 1.30);
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

  if (dialogueText && dialogueText.trim().length > 0) {
    const [line1, line2] = splitKoreanBubbleDialogue(dialogueText);
    const boxW = Math.max(8, Math.round(rx * 1.66));
    const boxH = Math.max(6, Math.round(ry * 1.44));
    const raster = tryRasterizeDialogueCanvas2d(boxW, boxH, line1, line2);
    if (raster) {
      const dstLeft = Math.round(cx - boxW * 0.5);
      const dstTop = Math.round(cy - boxH * 0.5);
      for (let ty = 0; ty < boxH; ty += 1) {
        for (let tx = 0; tx < boxW; tx += 1) {
          const sx = tx * 2;
          const sy = ty * 2;
          let aSum = 0;
          for (let oy = 0; oy < 2; oy += 1) {
            for (let ox = 0; ox < 2; ox += 1) {
              const idx = ((sy + oy) * raster.width + (sx + ox)) * 4;
              aSum += raster.data[idx + 3] ?? 0;
            }
          }
          const alpha01 = aSum / (255 * 4);
          if (alpha01 > 0.04) {
            blendPixelRgba(rgba, canvasWidth, dstLeft + tx, dstTop + ty, innerX, innerY, clipX1, clipY1, 24, 21, 28, alpha01);
          }
        }
      }
    } else {
      bakeDeterministicDialogueGlyphs(rgba, canvasWidth, innerX, innerY, clipX1, clipY1, cx, cy, rx, ry, line1, line2);
    }
  }
}

function fillRectRgba(
  rgba: Uint8ClampedArray,
  canvasWidth: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  const xEnd = x0 + w;
  const yEnd = y0 + h;
  for (let y = y0; y < yEnd; y += 1) {
    let offset = (y * canvasWidth + x0) * 4;
    for (let x = x0; x < xEnd; x += 1) {
      rgba[offset] = r;
      rgba[offset + 1] = g;
      rgba[offset + 2] = b;
      rgba[offset + 3] = a;
      offset += 4;
    }
  }
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
      const cutDialogue = mangaFx?.dialogueLines?.[idx];
      bakeSpeechBubbleBalloon(out, layout.stripWidth, innerX, innerY, layout.cutWidth, innerHeight, idx % 2 === 1, cutDialogue);
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
