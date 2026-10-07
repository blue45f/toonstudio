/**
 * Studio Image Trace — 래스터 이미지 → 채움 벡터 패스 트레이싱 (ArtCraft cat7 T4).
 *
 * 기존 `studio-raster-vectorize-product` 가 "외곽선 스트로크"만 만들던 자리에서 한 걸음 더:
 * 프리셋(선화/로고/포스터)별로 색상 레이어를 나누고, 각 레이어의 마스크를 기존 OpenCV 커널
 * (`studio-opencv-selection` 의 maskToPathIR — 이미 배포된 WASM 자산, lazy 로드)로 패스화한 뒤,
 * 불리언 결과와 같은 착지 표현(닫힌 freehand DrawEl + fill + 키홀 평탄화)으로 투영한다.
 *
 * 신규 트레이싱 라이브러리를 도입하지 않은 이유:
 *  - Potrace 계열 JS 포트는 GPL 이라 상용 안전성에서 제외된다.
 *  - VTracer(WASM, MIT)는 가능하지만 번들·lockfile 신규 비용이 크고, 마스크→패스 커널이
 *    이미 repo 안에 있어 1차 구현에는 기존 커널로 충분하다.
 *  - 색상 분리(양자화)와 패스 조립은 이 모듈의 순수 함수가 담당하고, OpenCV 호출은
 *    브리지 함수에서 dynamic import 로만 닿는다(기존 raster-vectorize 와 동일 규약).
 *
 * 순수부(프리셋 카탈로그·레이어 분리·verb→contour·contour→piece·SVG 조립)는 DOM/시간/난수
 * 의존이 없어 결정적이고 단위 테스트로 전수 검증된다. 입력 배열은 변형하지 않는다.
 */

import type { PathVerbIR } from "@toonstudio/studio-project-model";

import type { StudioPortablePathGeometryContour } from "./render/studio-canvaskit-adapter";
import type { DrawEl, El } from "./studio-element-model";
import {
  studioPathBooleanOutputFromPortableContours,
  studioPathBooleanPieceToDrawElSeed,
  type StudioPathBooleanPiece,
} from "./studio-path-boolean";

type StudioTraceableImage = Extract<El, { type: "image" }>;

/** 샘플링 상한 — 기존 raster-vectorize 와 같은 값(긴 변 1024px). */
export const STUDIO_IMAGE_TRACE_MAX_DIMENSION = 1024;
/** 색상 레이어로 인정할 최소 샘플 픽셀 수(이보다 작으면 노이즈로 보고 버린다). */
export const STUDIO_IMAGE_TRACE_MIN_LAYER_PIXELS = 8;
/** 트레이싱 색상 판정에서 "불투명"으로 보는 알파 하한. */
const SOLID_ALPHA = 128;

// ---------------------------------------------------------------------------
// 프리셋 카탈로그
// ---------------------------------------------------------------------------

export type StudioImageTracePresetId = "lineart" | "logo" | "poster";

export interface StudioImageTracePreset {
  readonly id: StudioImageTracePresetId;
  readonly label: string;
  readonly description: string;
  /** 색상 레이어 최대 수. 선화는 잉크 단색이라 1. */
  readonly maxColors: number;
  /** 마스크 단순화 epsilon 배율(샘플링 스케일 × 이 값). 클수록 거칠고 가볍다. */
  readonly simplifyFactor: number;
  /** 선화 프리셋의 잉크 판정 휘도 상한(0~255). */
  readonly inkLumaThreshold: number;
}

export const STUDIO_IMAGE_TRACE_PRESETS: readonly StudioImageTracePreset[] = Object.freeze([
  Object.freeze({
    id: "lineart",
    label: "선화",
    description: "어두운 선을 단색 채움 패스로 변환해요. 밑그림·선화 정리에 좋아요.",
    maxColors: 1,
    simplifyFactor: 1.5,
    inkLumaThreshold: 200,
  }),
  Object.freeze({
    id: "logo",
    label: "로고",
    description: "최대 4색으로 색을 나눠 채움 패스로 변환해요. 로고·타이틀 장식에 좋아요.",
    maxColors: 4,
    simplifyFactor: 2,
    inkLumaThreshold: 200,
  }),
  Object.freeze({
    id: "poster",
    label: "포스터",
    description: "최대 8색으로 포스터라이즈해 채움 패스로 변환해요.",
    maxColors: 8,
    simplifyFactor: 2.5,
    inkLumaThreshold: 200,
  }),
]);

export function studioImageTracePreset(id: StudioImageTracePresetId): StudioImageTracePreset {
  return STUDIO_IMAGE_TRACE_PRESETS.find((preset) => preset.id === id)
    ?? STUDIO_IMAGE_TRACE_PRESETS[0]!;
}

// ---------------------------------------------------------------------------
// 색상 레이어 분리 (순수)
// ---------------------------------------------------------------------------

export interface StudioImageTraceLayer {
  /** "#rrggbb" — 레이어에 배정된 픽셀들의 실제 평균색. */
  readonly color: string;
  /** width×height, 255 = 이 레이어에 속한 픽셀. */
  readonly mask: Uint8Array;
  readonly pixelCount: number;
}

function rgbToHex(r: number, g: number, b: number): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * 선화 레이어: 기존 raster-vectorize 와 같은 잉크 판정(어둡거나 반투명한 픽셀)을
 * 단색 마스크로 만들고, 색은 잉크 픽셀의 평균색으로 잡는다(검은 선 ≈ #111, 색연필 선은 그 색).
 */
function buildLineartLayer(
  data: Uint8ClampedArray | readonly number[],
  pixelTotal: number,
  threshold: number,
): StudioImageTraceLayer | null {
  const mask = new Uint8Array(pixelTotal);
  let count = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (let p = 0, i = 0; p < pixelTotal; p += 1, i += 4) {
    const r = data[i] ?? 255;
    const g = data[i + 1] ?? 255;
    const b = data[i + 2] ?? 255;
    const a = data[i + 3] ?? 0;
    if (a >= 32 && (luma(r, g, b) <= threshold || a < 245)) {
      mask[p] = 255;
      count += 1;
      sumR += r;
      sumG += g;
      sumB += b;
    }
  }
  if (count === 0) return null;
  return {
    color: rgbToHex(sumR / count, sumG / count, sumB / count),
    mask,
    pixelCount: count,
  };
}

interface ColorBucket {
  readonly key: number;
  count: number;
  sumR: number;
  sumG: number;
  sumB: number;
}

/**
 * 다색 레이어: 4비트/채널 버킷 히스토그램에서 상위 maxColors 개를 팔레트 시드로 뽑고,
 * 불투명 픽셀 전부를 가장 가까운 시드에 배정한다(결정적 — 동률은 버킷 키 오름차순).
 * 최소 픽셀 수에 못 미치는 레이어는 노이즈로 버린다(단, 전 레이어가 사라지면 가장 큰 것만 남긴다).
 */
function buildColorLayers(
  data: Uint8ClampedArray | readonly number[],
  pixelTotal: number,
  maxColors: number,
): StudioImageTraceLayer[] {
  const buckets = new Map<number, ColorBucket>();
  for (let p = 0, i = 0; p < pixelTotal; p += 1, i += 4) {
    const a = data[i + 3] ?? 0;
    if (a < SOLID_ALPHA) continue;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, count: 0, sumR: 0, sumG: 0, sumB: 0 };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    bucket.sumR += r;
    bucket.sumG += g;
    bucket.sumB += b;
  }
  if (buckets.size === 0) return [];
  const seeds = [...buckets.values()]
    .sort((left, right) => right.count - left.count || left.key - right.key)
    .slice(0, Math.max(1, maxColors))
    .map((bucket) => ({
      r: bucket.sumR / bucket.count,
      g: bucket.sumG / bucket.count,
      b: bucket.sumB / bucket.count,
    }));

  const masks = seeds.map(() => new Uint8Array(pixelTotal));
  const sums = seeds.map(() => ({ count: 0, sumR: 0, sumG: 0, sumB: 0 }));
  for (let p = 0, i = 0; p < pixelTotal; p += 1, i += 4) {
    const a = data[i + 3] ?? 0;
    if (a < SOLID_ALPHA) continue;
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    let best = 0;
    let bestDistance = Infinity;
    for (let s = 0; s < seeds.length; s += 1) {
      const seed = seeds[s]!;
      const distance = (r - seed.r) ** 2 + (g - seed.g) ** 2 + (b - seed.b) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = s;
      }
    }
    masks[best]![p] = 255;
    const sum = sums[best]!;
    sum.count += 1;
    sum.sumR += r;
    sum.sumG += g;
    sum.sumB += b;
  }

  const layers: StudioImageTraceLayer[] = [];
  for (let s = 0; s < seeds.length; s += 1) {
    const sum = sums[s]!;
    if (sum.count === 0) continue;
    layers.push({
      color: rgbToHex(sum.sumR / sum.count, sum.sumG / sum.count, sum.sumB / sum.count),
      mask: masks[s]!,
      pixelCount: sum.count,
    });
  }
  // 큰 레이어부터 — 삽입 순서(아래→위)가 면적 내림차순이 되도록.
  layers.sort((left, right) => right.pixelCount - left.pixelCount);
  const kept = layers.filter((layer) => layer.pixelCount >= STUDIO_IMAGE_TRACE_MIN_LAYER_PIXELS);
  return kept.length > 0 ? kept : layers.slice(0, 1);
}

/**
 * RGBA 픽셀 → 프리셋별 색상 레이어 목록. 픽셀이 전혀 없으면 빈 배열.
 * 순수 함수: 같은 입력은 항상 같은 출력(버킷 동률 처리까지 결정적).
 */
export function buildStudioImageTraceLayers(
  data: Uint8ClampedArray | readonly number[],
  width: number,
  height: number,
  preset: StudioImageTracePreset,
): StudioImageTraceLayer[] {
  const pixelTotal = Math.max(0, Math.floor(width) * Math.floor(height));
  if (pixelTotal === 0 || data.length < pixelTotal * 4) return [];
  if (preset.id === "lineart") {
    const layer = buildLineartLayer(data, pixelTotal, preset.inkLumaThreshold);
    return layer ? [layer] : [];
  }
  return buildColorLayers(data, pixelTotal, preset.maxColors);
}

// ---------------------------------------------------------------------------
// PathIR → contour → piece (순수, 불리언 착지 파이프라인 재사용)
// ---------------------------------------------------------------------------

/**
 * maskToPathIR 의 verb 열을 portable contour 로 나눈다. M 이 새 contour 를 열고,
 * L/Q/C 는 끝점을 잇고, Z 가 contour 를 닫는다(기존 raster-vectorize 의 폴리라인
 * 분리와 같은 규약이되, 여기서는 "채움"이 목적이라 닫힌 contour 로만 만든다).
 */
export function tracePathVerbsToContours(
  verbs: readonly PathVerbIR[],
): StudioPortablePathGeometryContour[] {
  const contours: StudioPortablePathGeometryContour[] = [];
  let points: number[] | null = null;
  const closeCurrent = () => {
    if (points && points.length >= 6) {
      contours.push({ points, closed: true });
    }
    points = null;
  };
  for (const verb of verbs) {
    if (verb.v === "M") {
      closeCurrent();
      points = [verb.x, verb.y];
      continue;
    }
    if (verb.v === "L" || verb.v === "Q" || verb.v === "C") {
      points?.push(verb.x, verb.y);
      continue;
    }
    if (verb.v === "Z") closeCurrent();
  }
  closeCurrent();
  return contours;
}

/**
 * contour 집합(구멍 포함) → 키홀 평탄화된 조각. 계층 복원과 키홀 처리는 불리언 결과와
 * 완전히 같은 함수(`studioPathBooleanOutputFromPortableContours`)를 재사용한다 —
 * 렌더러가 이미 검증한 표현이라 구멍이 어느 채움 규칙에서도 뚫린 채 그려진다.
 */
export function traceContoursToPieces(
  contours: readonly StudioPortablePathGeometryContour[],
): { ok: true; pieces: readonly StudioPathBooleanPiece[] } | { ok: false; reason: string } {
  const result = studioPathBooleanOutputFromPortableContours(contours, "union");
  if (!result.ok) {
    return { ok: false, reason: "트레이싱할 만큼 뚜렷한 영역을 찾지 못했어요." };
  }
  return { ok: true, pieces: result.output.pieces };
}

// ---------------------------------------------------------------------------
// SVG 조립 (순수)
// ---------------------------------------------------------------------------

function formatSvgNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}

/** 조각 1개(키홀 평탄 링) → SVG path data. 첫 정점 반복분은 Z 로 대체한다. */
export function tracePieceToSvgPathData(piece: StudioPathBooleanPiece): string {
  const points = piece.points;
  if (points.length < 6) return "";
  const commands: string[] = [];
  const lastIndex = points.length - 2;
  const firstX = points[0]!;
  const firstY = points[1]!;
  const closesRing = points[lastIndex] === firstX && points[lastIndex + 1] === firstY;
  const end = closesRing ? lastIndex : points.length;
  for (let i = 0; i < end; i += 2) {
    const x = formatSvgNumber(points[i]!);
    const y = formatSvgNumber(points[i + 1]!);
    commands.push(i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`);
  }
  commands.push("Z");
  return commands.join(" ");
}

export interface StudioImageTraceSvgLayer {
  readonly color: string;
  readonly pathData: string;
}

/** 레이어별 path 를 모은 독립 SVG 문서 문자열. viewBox 는 페이지 좌표 bounds. */
export function buildStudioImageTraceSvg(
  layers: readonly StudioImageTraceSvgLayer[],
  bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
): string {
  const viewBox = `${formatSvgNumber(bounds.x)} ${formatSvgNumber(bounds.y)} ${formatSvgNumber(Math.max(1, bounds.width))} ${formatSvgNumber(Math.max(1, bounds.height))}`;
  const paths = layers
    .filter((layer) => layer.pathData.length > 0)
    .map((layer) => `  <path d="${layer.pathData}" fill="${layer.color}"/>`)
    .join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">\n${paths}\n</svg>`;
}

// ---------------------------------------------------------------------------
// 제품 브리지 — 이미지 로드·샘플링·OpenCV 호출·DrawEl 조립
// ---------------------------------------------------------------------------

export interface StudioImageTraceResult {
  readonly elements: readonly DrawEl[];
  readonly svg: string;
  readonly layerCount: number;
  readonly pieceCount: number;
  readonly contourCount: number;
  readonly holeCount: number;
  readonly sampledWidth: number;
  readonly sampledHeight: number;
}

function loadTraceImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("선택한 이미지를 트레이싱용 픽셀로 읽지 못했습니다."));
    image.src = src;
  });
}

/** 샘플 좌표 → 페이지 좌표. 기존 raster-vectorize 의 transformPoint 와 같은 규약(뒤집기·회전). */
function traceSampleToPagePoint(
  px: number,
  py: number,
  sampleWidth: number,
  sampleHeight: number,
  image: StudioTraceableImage,
): readonly [number, number] {
  let localX = (px / sampleWidth) * image.width;
  let localY = (py / sampleHeight) * image.height;
  if (image.flipped) localX = image.width - localX;
  if (image.flippedY) localY = image.height - localY;
  const centerX = image.width / 2;
  const centerY = image.height / 2;
  const dx = localX - centerX;
  const dy = localY - centerY;
  const angle = (image.rotation * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return [
    image.x + centerX + dx * cos - dy * sin,
    image.y + centerY + dx * sin + dy * cos,
  ];
}

/**
 * 이미지 요소 1개를 프리셋으로 트레이싱해 채움 DrawEl 조각들과 SVG 를 돌려준다.
 * 원본 이미지 요소는 건드리지 않으며(비파괴), 실패는 한국어 사유의 Error 로 수렴한다.
 */
export async function traceStudioRasterImage(
  src: string,
  image: StudioTraceableImage,
  presetId: StudioImageTracePresetId,
): Promise<StudioImageTraceResult> {
  const preset = studioImageTracePreset(presetId);
  const decoded = await loadTraceImage(src);
  const sourceWidth = Math.max(1, decoded.naturalWidth || Math.round(image.width));
  const sourceHeight = Math.max(1, decoded.naturalHeight || Math.round(image.height));
  const scale = Math.min(1, STUDIO_IMAGE_TRACE_MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("트레이싱용 캔버스를 준비하지 못했습니다.");
  context.clearRect(0, 0, width, height);
  context.drawImage(decoded, 0, 0, width, height);
  let pixels: ImageData;
  try {
    pixels = context.getImageData(0, 0, width, height);
  } catch {
    throw new Error("이미지 픽셀에 접근할 수 없습니다. 외부 이미지라면 먼저 편집 가능한 로컬 사본을 만들어 주세요.");
  }

  const layers = buildStudioImageTraceLayers(pixels.data, width, height, preset);
  if (layers.length === 0) {
    throw new Error("트레이싱할 영역을 찾지 못했습니다. 대비가 더 높은 원본으로 다시 시도해 주세요.");
  }

  const { maskToPathIR } = await import("./studio-opencv-selection");
  const simplifyEps = Math.max(1, preset.simplifyFactor * scale);
  const strokeScale = Math.min(image.width / width, image.height / height);
  const elements: DrawEl[] = [];
  const svgLayers: StudioImageTraceSvgLayer[] = [];
  let contourCount = 0;
  let holeCount = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
    const layer = layers[layerIndex]!;
    const artifact = await maskToPathIR(layer.mask, width, height, simplifyEps);
    contourCount += artifact.contourCount;
    holeCount += artifact.holeCount;
    const contours = tracePathVerbsToContours(artifact.path.verbs).map((contour) => ({
      closed: contour.closed,
      points: contour.points.flatMap((_, index, all) => {
        if (index % 2 !== 0) return [];
        const [x, y] = traceSampleToPagePoint(all[index]!, all[index + 1]!, width, height, image);
        return [x, y];
      }),
    }));
    const traced = traceContoursToPieces(contours);
    if (!traced.ok) continue;
    const pathDataParts: string[] = [];
    traced.pieces.forEach((piece, pieceIndex) => {
      const seed = studioPathBooleanPieceToDrawElSeed(piece, {
        stroke: layer.color,
        strokeWidth: Math.max(1, strokeScale),
        fill: layer.color,
        opacity: image.opacity ?? 1,
      });
      elements.push({
        ...seed,
        id: `traced-${image.id}-${Date.now().toString(36)}-${layerIndex}-${pieceIndex}`,
        groupId: image.groupId,
        name: `${image.name?.trim() || "이미지"} · 트레이싱 ${preset.label} ${layerIndex + 1}-${pieceIndex + 1}`,
      });
      pathDataParts.push(tracePieceToSvgPathData(piece));
      minX = Math.min(minX, piece.bounds.x);
      minY = Math.min(minY, piece.bounds.y);
      maxX = Math.max(maxX, piece.bounds.x + piece.bounds.width);
      maxY = Math.max(maxY, piece.bounds.y + piece.bounds.height);
    });
    const pathData = pathDataParts.filter((part) => part.length > 0).join(" ");
    if (pathData) svgLayers.push({ color: layer.color, pathData });
  }

  if (elements.length === 0) {
    throw new Error("트레이싱할 만큼 뚜렷한 영역을 찾지 못했습니다. 대비가 더 높은 원본으로 다시 시도해 주세요.");
  }
  const svg = buildStudioImageTraceSvg(svgLayers, {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  });
  return Object.freeze({
    elements: Object.freeze(elements),
    svg,
    layerCount: layers.length,
    pieceCount: elements.length,
    contourCount,
    holeCount,
    sampledWidth: width,
    sampledHeight: height,
  });
}
