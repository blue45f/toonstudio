/**
 * 컷 감지 래스터 처리 — 입력 검증, 여백색 추정, 비내용(잉크) 마스크 생성.
 *
 * "여백(gutter)"은 컷 사이·바깥을 채우는 단색 영역이다. 흰색, 검정, 임의의 단색, 투명을 모두 허용한다.
 * 여백색은 이미지 전체에서 고른 간격의 행·열을 표본으로 뽑아, 한 줄이 거의 한 색(94% 이상)인 줄에 표를 던져
 * 가장 많이 받은 색으로 정한다. 그런 줄이 하나도 없으면(전면 삽화 등) 여백을 찾지 못한 것이다 — 지어내지 않는다.
 */

import { PANEL_DETECT_LIMITS, PanelDetectError } from "./panel-detect-types";

import type { PanelDetectBudget } from "./panel-detect-runtime";
import type { GutterColor, GutterInfo, GutterKind, PanelDetectRaster } from "./panel-detect-types";

/** 알파가 이 값 이하인 픽셀은 색과 무관하게 비어 있는 것으로 본다. */
export const PANEL_DETECT_TRANSPARENT_ALPHA = 16;

const GUTTER_MAX_LINES = 400;
const GUTTER_MAX_SAMPLES = 256;
/** 한 줄이 "단색 줄"로 인정받는 표본 비율. */
const LINE_UNIFORM_SHARE = 0.94;
/** 다운샘플 블록이 내용으로 표시되는 최소 비내용 픽셀 비율. 가는 선은 살리고 외톨이 잡티는 버린다. */
const BLOCK_INK_SHARE = 0.1;

export function assertPanelDetectRaster(raster: PanelDetectRaster): void {
  const { width, height, data } = raster;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new PanelDetectError("invalid-input", "이미지 가로·세로 크기가 올바르지 않아요.");
  }
  if (
    width > PANEL_DETECT_LIMITS.maxInputSide
    || height > PANEL_DETECT_LIMITS.maxInputSide
    || width * height > PANEL_DETECT_LIMITS.maxInputPixels
  ) {
    throw new PanelDetectError("too-large");
  }
  if (typeof data !== "object" || data === null || data.length !== width * height * 4) {
    throw new PanelDetectError("invalid-input", "이미지 픽셀 데이터 길이가 가로×세로×4 와 달라요.");
  }
}

/** 분석 래스터가 maxAnalysisPixels 이하가 되는 가장 작은 정수 다운샘플 배율. */
export function analysisStepFor(width: number, height: number, maxAnalysisPixels: number): number {
  const pixels = width * height;
  if (pixels <= maxAnalysisPixels) return 1;
  let step = Math.max(2, Math.floor(Math.sqrt(pixels / maxAnalysisPixels)));
  while (Math.ceil(width / step) * Math.ceil(height / step) > maxAnalysisPixels) step += 1;
  return step;
}

interface LineColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

type LineSample =
  | { readonly kind: "transparent" }
  | { readonly kind: "color"; readonly color: LineColor }
  | null;

interface LineScratch {
  readonly r: Uint8Array;
  readonly g: Uint8Array;
  readonly b: Uint8Array;
}

function sampleLine(
  raster: PanelDetectRaster,
  axis: "row" | "col",
  index: number,
  tolerance: number,
  scratch: LineScratch,
): LineSample {
  const { width, height, data } = raster;
  const length = axis === "row" ? width : height;
  const count = Math.min(length, GUTTER_MAX_SAMPLES);
  let transparent = 0;
  let opaque = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (let k = 0; k < count; k += 1) {
    const position = count === length ? k : Math.floor((k * (length - 1)) / (count - 1));
    const p = (axis === "row" ? index * width + position : position * width + index) * 4;
    if (data[p + 3] <= PANEL_DETECT_TRANSPARENT_ALPHA) {
      transparent += 1;
      continue;
    }
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    scratch.r[opaque] = r;
    scratch.g[opaque] = g;
    scratch.b[opaque] = b;
    sumR += r;
    sumG += g;
    sumB += b;
    opaque += 1;
  }
  if (transparent >= count * 0.9) return { kind: "transparent" };
  // 투명과 불투명이 섞인 줄은 단색 여백으로 보지 않는다.
  if (opaque < Math.max(4, count * 0.5)) return null;
  const meanR = sumR / opaque;
  const meanG = sumG / opaque;
  const meanB = sumB / opaque;
  let within = 0;
  let withinR = 0;
  let withinG = 0;
  let withinB = 0;
  for (let i = 0; i < opaque; i += 1) {
    const r = scratch.r[i];
    const g = scratch.g[i];
    const b = scratch.b[i];
    if (Math.abs(r - meanR) <= tolerance && Math.abs(g - meanG) <= tolerance && Math.abs(b - meanB) <= tolerance) {
      within += 1;
      withinR += r;
      withinG += g;
      withinB += b;
    }
  }
  if (within < opaque * LINE_UNIFORM_SHARE) return null;
  return { kind: "color", color: { r: withinR / within, g: withinG / within, b: withinB / within } };
}

function evenlySpaced(size: number, lines: number): number[] {
  const indices: number[] = [];
  for (let i = 0; i < lines; i += 1) {
    indices.push(lines === size ? i : Math.floor(((i + 0.5) * size) / lines));
  }
  return indices;
}

function classifyKind(color: LineColor): GutterKind {
  const luminance = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  const chroma = Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
  if (chroma <= 32 && luminance >= 215) return "white";
  if (chroma <= 32 && luminance <= 40) return "black";
  return "solid";
}

interface ColorBin {
  count: number;
  sumR: number;
  sumG: number;
  sumB: number;
}

/**
 * 여백색을 추정한다. 표본은 결정적(고른 간격)이라 같은 입력은 항상 같은 결과를 낸다.
 * 비용은 이미지 크기와 무관하게 최대 약 20만 픽셀 접근이다.
 */
export function estimateGutter(raster: PanelDetectRaster, tolerance: number): GutterInfo {
  const scratch: LineScratch = {
    r: new Uint8Array(GUTTER_MAX_SAMPLES),
    g: new Uint8Array(GUTTER_MAX_SAMPLES),
    b: new Uint8Array(GUTTER_MAX_SAMPLES),
  };
  const rowLines = evenlySpaced(raster.height, Math.min(raster.height, GUTTER_MAX_LINES));
  const colLines = evenlySpaced(raster.width, Math.min(raster.width, GUTTER_MAX_LINES));
  const bins = new Map<number, ColorBin>();
  let transparentLines = 0;
  const vote = (sample: LineSample): void => {
    if (sample === null) return;
    if (sample.kind === "transparent") {
      transparentLines += 1;
      return;
    }
    const { r, g, b } = sample.color;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bin = bins.get(key);
    if (bin) {
      bin.count += 1;
      bin.sumR += r;
      bin.sumG += g;
      bin.sumB += b;
    } else {
      bins.set(key, { count: 1, sumR: r, sumG: g, sumB: b });
    }
  };
  for (const y of rowLines) vote(sampleLine(raster, "row", y, tolerance, scratch));
  for (const x of colLines) vote(sampleLine(raster, "col", x, tolerance, scratch));

  const minVotes = Math.max(2, Math.ceil(0.004 * (rowLines.length + colLines.length)));
  let bestKey = -1;
  let bestBin: ColorBin | null = null;
  for (const [key, bin] of bins) {
    if (bestBin === null || bin.count > bestBin.count || (bin.count === bestBin.count && key < bestKey)) {
      bestKey = key;
      bestBin = bin;
    }
  }
  const bestCount = bestBin?.count ?? 0;
  if (transparentLines >= minVotes && transparentLines >= bestCount) {
    return { kind: "transparent", color: null, tolerance, votes: transparentLines };
  }
  if (bestBin === null || bestCount < minVotes) {
    return { kind: "none", color: null, tolerance, votes: bestCount };
  }
  // 이웃 칸(양자화 경계에 걸린 같은 색)을 합쳐 대표색을 다시 구한다.
  const centerR = bestBin.sumR / bestBin.count;
  const centerG = bestBin.sumG / bestBin.count;
  const centerB = bestBin.sumB / bestBin.count;
  let mergedCount = 0;
  let mergedR = 0;
  let mergedG = 0;
  let mergedB = 0;
  for (const bin of bins.values()) {
    const r = bin.sumR / bin.count;
    const g = bin.sumG / bin.count;
    const b = bin.sumB / bin.count;
    if (Math.abs(r - centerR) <= tolerance && Math.abs(g - centerG) <= tolerance && Math.abs(b - centerB) <= tolerance) {
      mergedCount += bin.count;
      mergedR += bin.sumR;
      mergedG += bin.sumG;
      mergedB += bin.sumB;
    }
  }
  const color: GutterColor = {
    r: Math.round(mergedR / mergedCount),
    g: Math.round(mergedG / mergedCount),
    b: Math.round(mergedB / mergedCount),
  };
  return { kind: classifyKind(color), color, tolerance, votes: mergedCount };
}

/** 한 소스 픽셀(RGBA 시작 오프셋 p)이 여백이 아닌 내용인지. */
export function createInkTest(gutter: GutterInfo): (data: ArrayLike<number>, p: number) => boolean {
  const color = gutter.color;
  const tolerance = gutter.tolerance;
  if (color === null) return (data, p) => data[p + 3] > PANEL_DETECT_TRANSPARENT_ALPHA;
  const { r, g, b } = color;
  return (data, p) => data[p + 3] > PANEL_DETECT_TRANSPARENT_ALPHA
    && (Math.abs(data[p] - r) > tolerance || Math.abs(data[p + 1] - g) > tolerance || Math.abs(data[p + 2] - b) > tolerance);
}

export interface InkMask {
  readonly width: number;
  readonly height: number;
  /** 원본 대비 다운샘플 배율(1 이면 원본 해상도). */
  readonly step: number;
  /** 1 = 내용, 0 = 여백. 행 우선, 길이 width*height. */
  readonly data: Uint8Array;
}

/**
 * 비내용(잉크) 마스크를 만든다. step>1 이면 step×step 블록마다 내용 픽셀이 10% 이상일 때만 1 로 표시한다
 * (가는 컷 테두리는 살아남고, 한두 픽셀 잡티는 사라진다).
 */
export function* buildInkMask(
  raster: PanelDetectRaster,
  gutter: GutterInfo,
  step: number,
  budget: PanelDetectBudget,
): Generator<void, InkMask, void> {
  const { width, height, data } = raster;
  const analysisWidth = Math.ceil(width / step);
  const analysisHeight = Math.ceil(height / step);
  const mask = new Uint8Array(analysisWidth * analysisHeight);
  const isInk = createInkTest(gutter);
  for (let ay = 0; ay < analysisHeight; ay += 1) {
    const y0 = ay * step;
    const y1 = Math.min(height, y0 + step);
    const rowOffset = ay * analysisWidth;
    for (let ax = 0; ax < analysisWidth; ax += 1) {
      const x0 = ax * step;
      const x1 = Math.min(width, x0 + step);
      let ink = 0;
      for (let y = y0; y < y1; y += 1) {
        let p = (y * width + x0) * 4;
        for (let x = x0; x < x1; x += 1, p += 4) {
          if (isInk(data, p)) ink += 1;
        }
      }
      const total = (x1 - x0) * (y1 - y0);
      if (ink >= Math.max(1, Math.ceil(total * BLOCK_INK_SHARE))) mask[rowOffset + ax] = 1;
    }
    if (budget.consume(width * (y1 - y0))) yield;
  }
  return { width: analysisWidth, height: analysisHeight, step, data: mask };
}
