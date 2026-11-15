/**
 * 빠른 손동작(플릭)에서도 선 보정 끝점과 필압을 보존하는 순수 추종 계획 모듈.
 *
 * 강한 선 보정(6..10) 상태에서 빠르게 손목을 튕기면 마지막 pointermove 기준 필터 출력점(outputX/Y)이
 * 실제 펜 위치(rawX/Y)보다 뒤처지고, 브라우저는 pointerup에서 pressure=0 센티넬을 보고하는 경우가 많다.
 * 이 모듈은 (1) 강도 프리셋 계약과 (2) 빠른 플릭 꼬리 구간을 Hermite 곡선 서브스텝으로 보간해
 * 정확한 raw 끝점까지 도달시키면서 마지막 유효 접촉 필압 추세를 보존하는 순수 함수를 제공한다.
 */

import { STABILIZER_MAX } from "../studio-brush";

import {
  flushStudioStrokeStabilizerEndpoint,
  stabilizeStudioStrokeSample,
  STUDIO_POINTER_DEFAULT_SAMPLE_INTERVAL_MS,
  type StudioStabilizerMode,
  type StudioStrokeStabilizerState,
} from "./studio-stroke-stabilizer";

export interface StudioStabilizerStrengthPreset {
  readonly id: "off" | "light" | "normal" | "strong" | "precision";
  readonly label: string;
  readonly shortLabel: string;
  readonly mode: StudioStabilizerMode;
  readonly stabilizer: number;
  readonly postCorrection: number;
  readonly description: string;
}

export const STUDIO_STABILIZER_STRENGTH_PRESETS: readonly StudioStabilizerStrengthPreset[] =
  Object.freeze([
    {
      id: "off",
      label: "끔",
      shortLabel: "끔 0",
      mode: "standard",
      stabilizer: 0,
      postCorrection: 0,
      description: "보정 지연 없이 입력 좌표와 필압을 즉시 반영합니다.",
    },
    {
      id: "light",
      label: "약하게",
      shortLabel: "약함 2",
      mode: "standard",
      stabilizer: 2,
      postCorrection: 0,
      description: "빠른 스케치와 짧은 해칭의 손맛을 살리면서 미세 떨림만 줄입니다.",
    },
    {
      id: "normal",
      label: "보통",
      shortLabel: "보통 4",
      mode: "adaptive",
      stabilizer: 4,
      postCorrection: 1,
      description: "느린 선은 안정시키고 빠른 플릭에서는 자동으로 지연을 줄입니다.",
    },
    {
      id: "strong",
      label: "강하게",
      shortLabel: "강함 8",
      mode: "adaptive",
      stabilizer: Math.min(8, STABILIZER_MAX),
      postCorrection: 2,
      description: "긴 외곽선 잉킹에 적합하며 빠른 손동작 끝점까지 추종 보간합니다.",
    },
    {
      id: "precision",
      label: "정밀",
      shortLabel: "정밀 10",
      mode: "precision",
      stabilizer: STABILIZER_MAX,
      postCorrection: 2,
      description: "정밀 가이드 추적으로 큰 곡선을 매끈하게 다듬고 끝점을 정확히 봉합합니다.",
    },
  ]);

export function findMatchingStudioStabilizerStrengthPreset(
  mode: StudioStabilizerMode,
  stabilizer: number,
  postCorrection: number,
): StudioStabilizerStrengthPreset["id"] | null {
  return (
    STUDIO_STABILIZER_STRENGTH_PRESETS.find(
      (preset) =>
        preset.mode === mode
        && preset.stabilizer === stabilizer
        && preset.postCorrection === postCorrection,
    )?.id ?? null
  );
}

export interface StudioFastFlickCatchupSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
}

export interface StudioFastFlickCatchupInput {
  readonly state: StudioStrokeStabilizerState;
  /** 직전 확정 점(접선 추정용, 선택). */
  readonly previousPoint?: readonly [number, number];
  /** 직전 확정 필압 배열(최소 1개 이상 권장). */
  readonly recentPressures?: readonly number[];
  /** pointerup 원시 필압(0 또는 NaN 센티넬이면 접촉 필압 추세를 보존). */
  readonly releaseRawPressure?: number | null;
  /** 꼬리 보간 최대 간격(문서 px). 기본 4px. */
  readonly maxStepPx?: number;
  /** 최소 필압 바닥(빠른 테이퍼가 완전히 0으로 끊기지 않도록 보호). 기본 0.08. */
  readonly minTerminalPressure?: number;
}

export interface StudioFastFlickCatchupResult {
  readonly state: StudioStrokeStabilizerState;
  readonly samples: readonly StudioFastFlickCatchupSample[];
  readonly endpointErrorPx: number;
  readonly startPressure: number;
  readonly endPressure: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * pointerup 센티넬(0/NaN)에 속아 필압이 0으로 급락하거나 반대로 중간 굵기로 부푸는 현상을 막고,
 * 빠른 손동작 끝부분의 자연스러운 테이퍼 추세를 보존한 종단 필압을 계산한다.
 */
export function resolveFastFlickTerminalPressure(
  recentPressures: readonly number[] | undefined,
  releaseRawPressure: number | null | undefined,
  minTerminalPressure = 0.08,
): { readonly startPressure: number; readonly endPressure: number } {
  const floor = clamp(finiteOr(minTerminalPressure, 0.08), 0.02, 0.95);
  const validRecent = (recentPressures ?? []).filter(
    (entry) => typeof entry === "number" && Number.isFinite(entry) && entry > 0,
  );
  const lastContact = clamp(validRecent.at(-1) ?? 0.5, floor, 1);
  if (
    typeof releaseRawPressure === "number"
    && Number.isFinite(releaseRawPressure)
    && releaseRawPressure > 0
    && releaseRawPressure <= 1
  ) {
    return {
      startPressure: lastContact,
      endPressure: clamp(releaseRawPressure, floor, 1),
    };
  }
  const prevContact = validRecent.length >= 2 ? validRecent.at(-2)! : lastContact;
  const slope = lastContact - prevContact;
  // 감압 중인 빠른 플릭이면 기울기의 절반만 완만히 연장하고, 가압/정속이면 마지막 접촉 필압을 그대로 유지한다.
  const extrapolated = slope < 0
    ? clamp(lastContact + slope * 0.5, floor, lastContact)
    : lastContact;
  return {
    startPressure: lastContact,
    endPressure: extrapolated,
  };
}

/**
 * 지연된 보정 상태(outputX/Y)에서 실제 펜을 뗀 위치(rawX/Y)까지 곡선 접선과 필압을 보존하며 따라잡는다.
 */
export function flushStudioFastFlickStabilizerTail(
  input: StudioFastFlickCatchupInput,
): StudioFastFlickCatchupResult {
  const flushed = flushStudioStrokeStabilizerEndpoint(input.state);
  const startX = finiteOr(input.state.outputX, flushed.point[0]);
  const startY = finiteOr(input.state.outputY, flushed.point[1]);
  const endX = flushed.point[0];
  const endY = flushed.point[1];
  const { startPressure, endPressure } = resolveFastFlickTerminalPressure(
    input.recentPressures,
    input.releaseRawPressure,
    input.minTerminalPressure,
  );
  const gap = Math.hypot(endX - startX, endY - startY);
  if (gap <= 1e-6) {
    return {
      state: flushed.state,
      samples: [],
      endpointErrorPx: 0,
      startPressure,
      endPressure,
    };
  }

  const maxStep = Math.max(1, finiteOr(input.maxStepPx, 4));
  const steps = Math.min(24, Math.max(1, Math.ceil(gap / maxStep)));
  const chordX = endX - startX;
  const chordY = endY - startY;
  // 직전 진행 방향 접선이 있으면 시작 접선에 반영해 빠른 곡선 플릭이 직선 현(chord)으로 꺾이지 않게 한다.
  let tangentX = chordX;
  let tangentY = chordY;
  if (input.previousPoint) {
    const dx = startX - finiteOr(input.previousPoint[0], startX);
    const dy = startY - finiteOr(input.previousPoint[1], startY);
    const prevLen = Math.hypot(dx, dy);
    if (prevLen > 1e-3) {
      tangentX = (dx / prevLen) * gap * 0.65 + chordX * 0.35;
      tangentY = (dy / prevLen) * gap * 0.65 + chordY * 0.35;
    }
  }

  const samples: StudioFastFlickCatchupSample[] = [];
  for (let step = 1; step <= steps; step += 1) {
    if (step === steps) {
      samples.push({ x: endX, y: endY, pressure: endPressure });
      continue;
    }
    const t = step / steps;
    const t2 = t * t;
    const t3 = t2 * t;
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;
    const x = h00 * startX + h10 * tangentX + h01 * endX + h11 * chordX;
    const y = h00 * startY + h10 * tangentY + h01 * endY + h11 * chordY;
    const eased = 1 - (1 - t) * (1 - t);
    const pressure = clamp(
      startPressure + (endPressure - startPressure) * eased,
      0.02,
      1,
    );
    samples.push({ x, y, pressure });
  }

  const last = samples.at(-1)!;
  return {
    state: flushed.state,
    samples,
    endpointErrorPx: Math.hypot(last.x - endX, last.y - endY),
    startPressure,
    endPressure,
  };
}

export interface StudioFastFlickPreviewSummary {
  readonly rawPoints: readonly (readonly [number, number])[];
  readonly stabilizedPoints: readonly (readonly [number, number])[];
  readonly catchupSamples: readonly StudioFastFlickCatchupSample[];
  readonly lagBeforeCatchupPx: number;
  readonly endpointErrorPx: number;
  readonly preservedEndPressure: number;
}

/** UI 미리보기 및 회귀 검증용 결정적 고속 플릭 벤치마크(가속 곡선 + 끝 필압 감쇠). */
export function simulateStudioFastFlickPreview(
  mode: StudioStabilizerMode,
  strength: number,
): StudioFastFlickPreviewSummary {
  const count = 12;
  const rawPoints: Array<readonly [number, number]> = [];
  const rawPressures: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const u = index / (count - 1);
    const accel = u * u * 0.65 + u * 0.35;
    const jitter = index > 0 && index < count - 2 ? (index % 2 === 0 ? 1.8 : -1.8) * (1 - u) : 0;
    const x = 10 + accel * 140;
    const y = 34 - Math.sin(u * Math.PI * 0.88) * 20 + jitter;
    const pressure = clamp(0.84 - u * 0.52, 0.18, 0.9);
    rawPoints.push([x, y]);
    rawPressures.push(pressure);
  }

  let state: StudioStrokeStabilizerState = {
    rawX: rawPoints[0]![0],
    rawY: rawPoints[0]![1],
    outputX: rawPoints[0]![0],
    outputY: rawPoints[0]![1],
    timeStamp: 0,
    sampleIntervalMs: STUDIO_POINTER_DEFAULT_SAMPLE_INTERVAL_MS,
  };
  const stabilizedPoints: Array<readonly [number, number]> = [[state.outputX, state.outputY]];
  for (let index = 1; index < rawPoints.length; index += 1) {
    const stepped = stabilizeStudioStrokeSample(
      state,
      { x: rawPoints[index]![0], y: rawPoints[index]![1], timeStamp: index * 6 },
      { mode, strength },
    );
    state = stepped.state;
    stabilizedPoints.push(stepped.point);
  }

  const rawEnd = rawPoints.at(-1)!;
  const bodyEnd = stabilizedPoints.at(-1)!;
  const lagBeforeCatchupPx = Math.hypot(rawEnd[0] - bodyEnd[0], rawEnd[1] - bodyEnd[1]);
  const tail = flushStudioFastFlickStabilizerTail({
    state,
    previousPoint: stabilizedPoints.at(-2),
    recentPressures: rawPressures.slice(-3),
    releaseRawPressure: 0,
    maxStepPx: 4,
  });

  return {
    rawPoints,
    stabilizedPoints,
    catchupSamples: tail.samples,
    lagBeforeCatchupPx,
    endpointErrorPx: tail.endpointErrorPx,
    preservedEndPressure: tail.endPressure,
  };
}
