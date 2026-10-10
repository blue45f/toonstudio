import { splitFrames } from "../../engine/raster/reference-renderer";
import { lineStroke, parametricStroke, zigzagStroke } from "../../engine/testing/synthetic-strokes";
import { pixelHash } from "../metrics/render-metrics";
import { fakeEnv } from "../testing/synthetic-images";

import type { LabImage, RawSample } from "../../engine/core/types";
import type { BrushProgram } from "../../engine/presets/program-schema";
import type { BrushEngineLane } from "../../lanes/lane";

/**
 * 붓털 물리 레인 품질 측정(BL-4a): 필압 → 획 폭 동적 범위, 프리셋별 잉크 픽셀·그레인(알파 분산).
 * 같은 입력을 어느 레인에든 그려 보고 숫자만 돌려준다. 판정은 시험(`lanes/physics/bristle-quality.test.ts`)이 한다.
 */

export const QUALITY_SIZE = 256;
/** 잉크로 세는 알파 하한(0..255). */
export const INK_ALPHA_MIN = 16;

export interface DrawnStroke {
  image: LabImage;
  /** addSamples 합계 소요(ms, 실제 시계). 시험 조건 기록용이다. */
  addSamplesMs: number[];
}

/** 레인을 init해 한 획을 그리고 읽어 온다. 레인은 호출자가 만들고 이 함수가 dispose한다. */
export async function drawOnLane(lane: BrushEngineLane, program: BrushProgram, samples: readonly RawSample[], seed: number, now: () => number = () => 0): Promise<DrawnStroke> {
  await lane.init(fakeEnv(), { width: QUALITY_SIZE, height: QUALITY_SIZE, dpr: 1, tileSize: 16, seed });
  try {
    lane.beginStroke(program, seed, { color: [0, 0, 0, 1] });
    const addSamplesMs: number[] = [];
    for (const frame of splitFrames(samples)) {
      const t0 = now();
      lane.addSamples(frame);
      addSamplesMs.push(now() - t0);
    }
    await lane.endStroke();
    return { image: await lane.readback(), addSamplesMs };
  } finally {
    lane.dispose();
  }
}

/** 가로 직선 획(y = 128). 압력 일정. */
export function horizontalLine(pressure: number): RawSample[] {
  return lineStroke(40, QUALITY_SIZE / 2, QUALITY_SIZE - 40, QUALITY_SIZE / 2, pressure, { durationMs: 600 });
}

/** 압력 0.3~1 사인 곡선 획. */
export function sineCurve(): RawSample[] {
  return parametricStroke(
    (t) => ({ x: 30 + 196 * t, y: 128 + 60 * Math.sin(2 * Math.PI * t), pressure: 0.35 + 0.65 * Math.sin(Math.PI * t) }),
    { durationMs: 900 },
  );
}

/** 바깥에서 안으로 감기는 나선. 압력은 0.3에서 1로 오른다. */
export function spiralStroke(): RawSample[] {
  return parametricStroke(
    (t) => {
      const angle = 2 * Math.PI * 2.5 * t;
      const radius = 95 * (1 - 0.8 * t);
      return { x: 128 + radius * Math.cos(angle), y: 128 + radius * Math.sin(angle), pressure: 0.3 + 0.7 * t };
    },
    { durationMs: 1400 },
  );
}

/** 프리셋 비교용 지그재그(압력 0.3~1). */
export function presetZigzag(): RawSample[] {
  return zigzagStroke(QUALITY_SIZE, { durationMs: 900 });
}

export function inkPixelCount(img: LabImage, alphaMin = INK_ALPHA_MIN): number {
  let n = 0;
  for (let i = 3; i < img.data.length; i += 4) if ((img.data[i] ?? 0) >= alphaMin) n += 1;
  return n;
}

/** 열마다 잉크 픽셀 수(단면 폭)의 중앙값. 가운데 `trim` 비율 구간의 잉크가 있는 열만 센다. */
export function medianCrossSectionWidth(img: LabImage, alphaMin = INK_ALPHA_MIN): number {
  const widths: number[] = [];
  const x0 = Math.floor(img.width * 0.3);
  const x1 = Math.ceil(img.width * 0.7);
  for (let x = x0; x < x1; x += 1) {
    let n = 0;
    for (let y = 0; y < img.height; y += 1) if ((img.data[(y * img.width + x) * 4 + 3] ?? 0) >= alphaMin) n += 1;
    if (n > 0) widths.push(n);
  }
  if (widths.length === 0) return 0;
  widths.sort((a, b) => a - b);
  const mid = Math.floor(widths.length / 2);
  return widths.length % 2 === 1 ? (widths[mid] ?? 0) : ((widths[mid - 1] ?? 0) + (widths[mid] ?? 0)) / 2;
}

/** 잉크 픽셀 알파(0..1)의 분산: 그레인(알갱이 농담)이 뚜렷할수록 크다. */
export function alphaVariance(img: LabImage, alphaMin = INK_ALPHA_MIN): number {
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  for (let i = 3; i < img.data.length; i += 4) {
    const a = img.data[i] ?? 0;
    if (a < alphaMin) continue;
    const v = a / 255;
    n += 1;
    sum += v;
    sumSq += v * v;
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return Math.max(0, sumSq / n - mean * mean);
}

/** 알파 8단계 히스토그램(잉크 픽셀만, 합 1). */
export function alphaHistogram(img: LabImage, bins = 8, alphaMin = INK_ALPHA_MIN): number[] {
  const out = new Array<number>(bins).fill(0);
  let n = 0;
  for (let i = 3; i < img.data.length; i += 4) {
    const a = img.data[i] ?? 0;
    if (a < alphaMin) continue;
    const b = Math.min(bins - 1, Math.floor((a / 256) * bins));
    out[b] = (out[b] ?? 0) + 1;
    n += 1;
  }
  return n === 0 ? out : out.map((v) => v / n);
}

/**
 * 가로 획 안쪽 알파 분산: 열마다 잉크가 있는 가장 위·아래 행을 빼고 그 사이(그레인 구멍 포함) 픽셀의 알파(0..1) 분산을 가운데 구간에서 모은다.
 * 가장자리 안티앨리어싱이 아니라 획 속 알갱이(종이·흑연 그레인) 농담을 잰다. 안쪽 픽셀이 없으면(획이 3 px 미만) 0이다.
 */
export function interiorAlphaVariance(img: LabImage, alphaMin = INK_ALPHA_MIN): number {
  const x0 = Math.floor(img.width * 0.3);
  const x1 = Math.ceil(img.width * 0.7);
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  for (let x = x0; x < x1; x += 1) {
    let top = -1;
    let bottom = -1;
    for (let y = 0; y < img.height; y += 1) {
      if ((img.data[(y * img.width + x) * 4 + 3] ?? 0) >= alphaMin) {
        if (top < 0) top = y;
        bottom = y;
      }
    }
    for (let y = top + 1; top >= 0 && y < bottom; y += 1) {
      const v = (img.data[(y * img.width + x) * 4 + 3] ?? 0) / 255;
      n += 1;
      sum += v;
      sumSq += v * v;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return Math.max(0, sumSq / n - mean * mean);
}

/**
 * 열마다 알파 합(px 단위 커버리지)의 중앙값: 안티앨리어싱 가장자리를 부분 픽셀로 세어 얇은 선의 폭을 정수 눈금보다 정밀하게 잰다.
 * 가운데 구간에서 잉크가 있는 열만 센다.
 */
export function medianCoverageWidth(img: LabImage, alphaMin = INK_ALPHA_MIN): number {
  const widths: number[] = [];
  const x0 = Math.floor(img.width * 0.3);
  const x1 = Math.ceil(img.width * 0.7);
  for (let x = x0; x < x1; x += 1) {
    let sum = 0;
    let any = false;
    for (let y = 0; y < img.height; y += 1) {
      const a = img.data[(y * img.width + x) * 4 + 3] ?? 0;
      if (a >= alphaMin) any = true;
      sum += a / 255;
    }
    if (any) widths.push(sum);
  }
  if (widths.length === 0) return 0;
  widths.sort((a, b) => a - b);
  const mid = Math.floor(widths.length / 2);
  return widths.length % 2 === 1 ? (widths[mid] ?? 0) : ((widths[mid - 1] ?? 0) + (widths[mid] ?? 0)) / 2;
}

/** 필압 동적 범위를 재는 압력 3점. */
export const QUALITY_PRESSURES = [0.15, 0.5, 1] as const;

export interface ShapeMeasure {
  ink: number;
  alphaVariance: number;
  hash: string;
}

/** 레인 × 프리셋 한 줄의 측정값(parity 표의 행). */
export interface QualityRow {
  laneId: string;
  presetId: string;
  /** 압력 → 잉크 픽셀 수(알파 ≥ 16)로 센 단면 폭의 중앙값. */
  widthCount: Record<string, number>;
  /** 압력 → 알파 합으로 센 단면 폭의 중앙값(부분 픽셀 포함). */
  widthCoverage: Record<string, number>;
  ratioCount: number;
  ratioCoverage: number;
  /** 압력 0.2 가로 직선 안쪽 알파 분산(그레인). */
  grainLineVariance: number;
  zigzag: ShapeMeasure;
  curve: ShapeMeasure;
  spiral: ShapeMeasure;
}

function shapeMeasure(img: LabImage): ShapeMeasure {
  return { ink: inkPixelCount(img), alphaVariance: alphaVariance(img), hash: pixelHash(img) };
}

/** 한 레인·프리셋을 같은 입력 6+1획으로 재어 한 줄을 만든다. `make`는 호출마다 새 레인을 돌려준다. */
export async function measureQualityRow(laneId: string, make: () => BrushEngineLane, program: BrushProgram, seed = 7): Promise<QualityRow> {
  const widthCount: Record<string, number> = {};
  const widthCoverage: Record<string, number> = {};
  for (const p of QUALITY_PRESSURES) {
    const drawn = await drawOnLane(make(), program, horizontalLine(p), seed);
    widthCount[String(p)] = medianCrossSectionWidth(drawn.image);
    widthCoverage[String(p)] = medianCoverageWidth(drawn.image);
  }
  const lo = String(QUALITY_PRESSURES[0]);
  const hi = String(QUALITY_PRESSURES[2]);
  const grain = await drawOnLane(make(), program, horizontalLine(0.2), seed);
  const zig = await drawOnLane(make(), program, presetZigzag(), seed);
  const curve = await drawOnLane(make(), program, sineCurve(), seed);
  const spiral = await drawOnLane(make(), program, spiralStroke(), seed);
  return {
    laneId,
    presetId: program.id,
    widthCount,
    widthCoverage,
    ratioCount: (widthCount[hi] ?? 0) / Math.max(widthCount[lo] ?? 0, 1e-9),
    ratioCoverage: (widthCoverage[hi] ?? 0) / Math.max(widthCoverage[lo] ?? 0, 1e-9),
    grainLineVariance: interiorAlphaVariance(grain.image),
    zigzag: shapeMeasure(zig.image),
    curve: shapeMeasure(curve.image),
    spiral: shapeMeasure(spiral.image),
  };
}
