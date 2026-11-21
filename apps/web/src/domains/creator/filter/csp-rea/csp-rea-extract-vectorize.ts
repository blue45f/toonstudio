/**
 * Clip Studio Paint 5.1.5 레이어 변환·선 추출·래스터→벡터·커스텀 색감 매치 픽셀 엔진.
 *
 * REA 정적 증거:
 * - `layerltconvert` / `layerconvert` (`presetMac_1.spws` `ev_d480a3e839a1c471e3be17599d5e8a04f7a21c76554b848c70e1b23da61bcb08`)
 * - `CSVectorizeV4` / `CSFilterThining` (`TGCxsPlugIn.cfpi` SHA-256 `ef861a7bdbde7549b6700b7f1a11111b49b453587b5b51fd0ad61ec400f7dc25`)
 * - `filtercolortransfer` (커스텀 참조 이미지 기반 CIE L*a*b* D65 Reinhard 통계 매칭)
 */

export interface CspLtLineExtractParams {
  /** 선 검출 감도(0~100, 기본 55) */
  readonly edgeSensitivity: number;
  /** 선화 굵기(1~4, 기본 1) */
  readonly lineWidthPx: number;
  /** 톤 계조 단계(2~8, 기본 4) */
  readonly toneLevels: number;
  /** 톤 선 수(LPI 근사 셀 크기 px, 기본 4) */
  readonly toneCellSizePx?: number;
  /** 투명 배경에 선화만 추출할지 여부 */
  readonly transparentLineLayer?: boolean;
}

export interface CspLtLineExtractResult {
  readonly lineArtRgba: Uint8ClampedArray;
  readonly toneRgba: Uint8ClampedArray;
  readonly combinedRgba: Uint8ClampedArray;
  readonly extractedEdgePixelCount: number;
}

export interface CspVectorizedPoint {
  readonly x: number;
  readonly y: number;
  readonly widthPx: number;
  readonly pressure01: number;
}

export interface CspVectorizedPolyline {
  readonly strokeId: string;
  readonly points: readonly CspVectorizedPoint[];
  readonly averageWidthPx: number;
}

export interface CspRasterToVectorParams {
  /** 선화 판정 최대 명도(0~255, 기본 160) */
  readonly inkLuminanceThreshold?: number;
  /** 선화 판정 최소 알파(0~255, 기본 64) */
  readonly minAlpha?: number;
  /** Douglas-Peucker 단순화 허용 오차(px, 기본 1.0) */
  readonly simplifyTolerancePx?: number;
  /** 최소 스트로크 점 개수(기본 2) */
  readonly minPointsPerStroke?: number;
}

export interface CspRasterToVectorResult {
  readonly strokes: readonly CspVectorizedPolyline[];
  readonly skeletonPixelCount: number;
  readonly previewRgba: Uint8ClampedArray;
}

export interface CspCustomColorMatchParams {
  readonly referenceRgba: Uint8ClampedArray | Uint8Array;
  readonly referenceWidth: number;
  readonly referenceHeight: number;
  readonly strength01?: number;
  readonly preserveLuminance?: boolean;
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

function clampByte(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
}

/**
 * 1. LT 레이어 선 추출 + 톤 분리 (`layerltconvert`):
 *    Sobel 방향성 에지 + DoG 미세 윤곽으로 선화 레이어를 생성하고,
 *    계조 양자화 + Bayer/원형 망점 임계화로 톤 레이어를 분리 합성한다.
 */
export function applyCspLtLineAndToneExtract(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  params: CspLtLineExtractParams,
): CspLtLineExtractResult {
  const pixelCount = width * height;
  const lineArtRgba = new Uint8ClampedArray(pixelCount * 4);
  const toneRgba = new Uint8ClampedArray(pixelCount * 4);
  const combinedRgba = new Uint8ClampedArray(pixelCount * 4);
  if (pixelCount <= 0) {
    return { lineArtRgba, toneRgba, combinedRgba, extractedEdgePixelCount: 0 };
  }

  const sensitivity = clamp(params.edgeSensitivity, 1, 100);
  const edgeThreshold = Math.max(12, 180 - sensitivity * 1.55);
  const lineRadius = clamp(Math.round(params.lineWidthPx), 1, 4) - 1;
  const toneLevels = clamp(Math.round(params.toneLevels), 2, 8);
  const cellSize = clamp(Math.round(params.toneCellSizePx ?? 4), 2, 16);
  const transparentLine = params.transparentLineLayer ?? true;

  const lum = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const idx = i * 4;
    lum[i] = 0.299 * (src[idx] ?? 0) + 0.587 * (src[idx + 1] ?? 0) + 0.114 * (src[idx + 2] ?? 0);
  }
  const lumAt = (x: number, y: number): number =>
    lum[clamp(y, 0, height - 1) * width + clamp(x, 0, width - 1)]!;

  const rawEdgeMask = new Uint8Array(pixelCount);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const gx =
        -lumAt(x - 1, y - 1) -
        2 * lumAt(x - 1, y) -
        lumAt(x - 1, y + 1) +
        lumAt(x + 1, y - 1) +
        2 * lumAt(x + 1, y) +
        lumAt(x + 1, y + 1);
      const gy =
        -lumAt(x - 1, y - 1) -
        2 * lumAt(x, y - 1) -
        lumAt(x + 1, y - 1) +
        lumAt(x - 1, y + 1) +
        2 * lumAt(x, y + 1) +
        lumAt(x + 1, y + 1);
      const mag = Math.hypot(gx, gy) * 0.25;
      rawEdgeMask[y * width + x] = mag >= edgeThreshold ? clampByte(Math.min(255, mag * 2.1)) : 0;
    }
  }

  let extractedEdgePixelCount = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pIdx = y * width + x;
      const rgbaIdx = pIdx * 4;
      let edgeVal = rawEdgeMask[pIdx]!;
      if (lineRadius > 0) {
        for (let dy = -lineRadius; dy <= lineRadius; dy += 1) {
          for (let dx = -lineRadius; dx <= lineRadius; dx += 1) {
            if (dx * dx + dy * dy > lineRadius * lineRadius) continue;
            const nx = clamp(x + dx, 0, width - 1);
            const ny = clamp(y + dy, 0, height - 1);
            const v = rawEdgeMask[ny * width + nx]!;
            if (v > edgeVal) edgeVal = v;
          }
        }
      }

      if (edgeVal > 0) extractedEdgePixelCount += 1;
      if (transparentLine) {
        lineArtRgba[rgbaIdx] = 0;
        lineArtRgba[rgbaIdx + 1] = 0;
        lineArtRgba[rgbaIdx + 2] = 0;
        lineArtRgba[rgbaIdx + 3] = edgeVal;
      } else {
        const ink = 255 - edgeVal;
        lineArtRgba[rgbaIdx] = ink;
        lineArtRgba[rgbaIdx + 1] = ink;
        lineArtRgba[rgbaIdx + 2] = ink;
        lineArtRgba[rgbaIdx + 3] = src[rgbaIdx + 3] ?? 255;
      }

      // 원형 망점 톤 분리
      const qStep = 1 / (toneLevels - 1);
      const quantizedLum01 = Math.round((lum[pIdx]! / 255) / qStep) * qStep;
      const density01 = 1 - quantizedLum01;
      const u = ((x % cellSize) + 0.5) / cellSize * 2 - 1;
      const v = ((y % cellSize) + 0.5) / cellSize * 2 - 1;
      const dist = Math.hypot(u, v);
      const dotThreshold = Math.sqrt(clamp(density01, 0, 1)) * 1.15;
      const isDot = density01 > 0.05 && dist <= dotThreshold;
      const toneVal = isDot ? 36 : 255;

      toneRgba[rgbaIdx] = toneVal;
      toneRgba[rgbaIdx + 1] = toneVal;
      toneRgba[rgbaIdx + 2] = toneVal;
      toneRgba[rgbaIdx + 3] = isDot ? 220 : 0;

      // 결합 출력 (흰 종이 위 톤 + 선화)
      const base = isDot ? 64 : 255;
      const edgeBlend = edgeVal / 255;
      const finalGray = clampByte(base * (1 - edgeBlend));
      combinedRgba[rgbaIdx] = finalGray;
      combinedRgba[rgbaIdx + 1] = finalGray;
      combinedRgba[rgbaIdx + 2] = finalGray;
      combinedRgba[rgbaIdx + 3] = src[rgbaIdx + 3] ?? 255;
    }
  }

  return { lineArtRgba, toneRgba, combinedRgba, extractedEdgePixelCount };
}

function pointToSegmentDistSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-8) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1);
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return (px - cx) ** 2 + (py - cy) ** 2;
}

function simplifyDouglasPeucker(
  pts: readonly CspVectorizedPoint[],
  tolerancePx: number,
): readonly CspVectorizedPoint[] {
  if (pts.length <= 2) return pts;
  const tolSq = tolerancePx * tolerancePx;
  let maxDistSq = -1;
  let splitIdx = 0;
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const p = pts[i]!;
    const dSq = pointToSegmentDistSq(p.x, p.y, first.x, first.y, last.x, last.y);
    if (dSq > maxDistSq) {
      maxDistSq = dSq;
      splitIdx = i;
    }
  }
  if (maxDistSq > tolSq) {
    const left = simplifyDouglasPeucker(pts.slice(0, splitIdx + 1), tolerancePx);
    const right = simplifyDouglasPeucker(pts.slice(splitIdx), tolerancePx);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

/**
 * 2. 래스터→벡터 변환 (`CSVectorizeV4` / `layerconvert`):
 *    이진화 + 거리 변환(선 폭 추정) + Zhang-Suen 세선화 + 8방향 체인 추적 + Douglas-Peucker 단순화.
 */
export function convertCspRasterToVectorStrokes(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  params: CspRasterToVectorParams = {},
): CspRasterToVectorResult {
  const pixelCount = width * height;
  const previewRgba = new Uint8ClampedArray(pixelCount * 4);
  if (pixelCount <= 0) {
    return { strokes: [], skeletonPixelCount: 0, previewRgba };
  }

  const inkLumThresh = clamp(params.inkLuminanceThreshold ?? 160, 1, 254);
  const minAlpha = clamp(params.minAlpha ?? 64, 1, 255);
  const tolerance = clamp(params.simplifyTolerancePx ?? 1.0, 0.1, 12);
  const minPts = Math.max(2, Math.round(params.minPointsPerStroke ?? 2));

  const binary = new Uint8Array(pixelCount);
  const distField = new Float32Array(pixelCount);

  for (let i = 0; i < pixelCount; i += 1) {
    const idx = i * 4;
    const a = src[idx + 3] ?? 0;
    const lum = 0.299 * (src[idx] ?? 0) + 0.587 * (src[idx + 1] ?? 0) + 0.114 * (src[idx + 2] ?? 0);
    if (a >= minAlpha && lum <= inkLumThresh) {
      binary[i] = 1;
      distField[i] = 1e4;
    } else {
      distField[i] = 0;
    }
  }

  // 2-패스 Chamfer 거리 변환으로 픽셀별 국소 선폭(반지름) 추정
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      if (binary[i] === 0) continue;
      const top = y > 0 ? distField[(y - 1) * width + x]! + 1 : 1;
      const left = x > 0 ? distField[y * width + (x - 1)]! + 1 : 1;
      distField[i] = Math.min(distField[i]!, top, left);
    }
  }
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = width - 1; x >= 0; x -= 1) {
      const i = y * width + x;
      if (binary[i] === 0) continue;
      const bot = y + 1 < height ? distField[(y + 1) * width + x]! + 1 : 1;
      const right = x + 1 < width ? distField[y * width + (x + 1)]! + 1 : 1;
      distField[i] = Math.min(distField[i]!, bot, right);
    }
  }

  // Zhang-Suen 세선화 (최대 16회 반복)
  const skel = new Uint8Array(binary);
  const toClear = new Uint8Array(pixelCount);
  for (let iter = 0; iter < 16; iter += 1) {
    let changed = false;
    for (let step = 0; step < 2; step += 1) {
      toClear.fill(0);
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const i = y * width + x;
          if (skel[i] === 0) continue;
          const p2 = skel[(y - 1) * width + x]!;
          const p3 = skel[(y - 1) * width + (x + 1)]!;
          const p4 = skel[y * width + (x + 1)]!;
          const p5 = skel[(y + 1) * width + (x + 1)]!;
          const p6 = skel[(y + 1) * width + x]!;
          const p7 = skel[(y + 1) * width + (x - 1)]!;
          const p8 = skel[y * width + (x - 1)]!;
          const p9 = skel[(y - 1) * width + (x - 1)]!;
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (b < 2 || b > 6) continue;
          const a =
            (p2 === 0 && p3 === 1 ? 1 : 0) +
            (p3 === 0 && p4 === 1 ? 1 : 0) +
            (p4 === 0 && p5 === 1 ? 1 : 0) +
            (p5 === 0 && p6 === 1 ? 1 : 0) +
            (p6 === 0 && p7 === 1 ? 1 : 0) +
            (p7 === 0 && p8 === 1 ? 1 : 0) +
            (p8 === 0 && p9 === 1 ? 1 : 0) +
            (p9 === 0 && p2 === 1 ? 1 : 0);
          if (a !== 1) continue;
          if (step === 0) {
            if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue;
          } else {
            if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue;
          }
          toClear[i] = 1;
          changed = true;
        }
      }
      for (let i = 0; i < pixelCount; i += 1) {
        if (toClear[i] === 1) skel[i] = 0;
      }
    }
    if (!changed) break;
  }

  let skeletonPixelCount = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    const idx = i * 4;
    if (skel[i] === 1) {
      skeletonPixelCount += 1;
      previewRgba[idx] = 24;
      previewRgba[idx + 1] = 24;
      previewRgba[idx + 2] = 28;
      previewRgba[idx + 3] = 255;
    } else {
      previewRgba[idx] = 255;
      previewRgba[idx + 1] = 255;
      previewRgba[idx + 2] = 255;
      previewRgba[idx + 3] = 0;
    }
  }

  // 8방향 연결 체인 추출
  const visited = new Uint8Array(pixelCount);
  const dirs: readonly [number, number][] = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
  ];
  const strokes: CspVectorizedPolyline[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startIdx = y * width + x;
      if (skel[startIdx] === 0 || visited[startIdx] === 1) continue;

      const chain: CspVectorizedPoint[] = [];
      let cx = x;
      let cy = y;
      while (true) {
        const ci = cy * width + cx;
        visited[ci] = 1;
        const wPx = Math.max(1, Number((distField[ci]! * 2 - 1).toFixed(2)));
        chain.push({
          x: cx,
          y: cy,
          widthPx: wPx,
          pressure01: Number(clamp(wPx / 12, 0.1, 1).toFixed(3)),
        });

        let foundNext = false;
        for (const [dx, dy] of dirs) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const ni = ny * width + nx;
          if (skel[ni] === 1 && visited[ni] === 0) {
            cx = nx;
            cy = ny;
            foundNext = true;
            break;
          }
        }
        if (!foundNext) break;
      }

      if (chain.length >= minPts) {
        const simplified = simplifyDouglasPeucker(chain, tolerance);
        const avgW =
          simplified.reduce((acc, p) => acc + p.widthPx, 0) / Math.max(1, simplified.length);
        strokes.push({
          strokeId: `csp-vec-${strokes.length + 1}`,
          points: simplified,
          averageWidthPx: Number(avgW.toFixed(2)),
        });
      }
    }
  }

  return { strokes, skeletonPixelCount, previewRgba };
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(v: number): number {
  const c = clamp(v, 0, 1);
  return clampByte((c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055) * 255);
}

function rgbToLabD65(r: number, g: number, b: number): readonly [number, number, number] {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);
  const x = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) / 0.95047;
  const y = rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175;
  const z = (rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041) / 1.08883;
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function labD65ToRgb(l: number, a: number, b: number): readonly [number, number, number] {
  const fy = (l + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const invF = (t: number): number => {
    const t3 = t * t * t;
    return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787;
  };
  const x = invF(fx) * 0.95047;
  const y = invF(fy);
  const z = invF(fz) * 1.08883;
  return [
    linearToSrgb(x * 3.2404542 - y * 1.5371385 - z * 0.4985314),
    linearToSrgb(-x * 0.969266 + y * 1.8760108 + z * 0.041556),
    linearToSrgb(x * 0.0556434 - y * 0.2040259 + z * 1.0572252),
  ];
}

function computeLabStats(
  rgba: Uint8ClampedArray | Uint8Array,
  pixelCount: number,
): {
  readonly lab: Float32Array;
  readonly mean: readonly [number, number, number];
  readonly std: readonly [number, number, number];
} {
  const lab = new Float32Array(pixelCount * 3);
  let sL = 0;
  let sA = 0;
  let sB = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    const [l, a, b] = rgbToLabD65(rgba[i * 4] ?? 0, rgba[i * 4 + 1] ?? 0, rgba[i * 4 + 2] ?? 0);
    lab[i * 3] = l;
    lab[i * 3 + 1] = a;
    lab[i * 3 + 2] = b;
    sL += l;
    sA += a;
    sB += b;
  }
  const n = Math.max(1, pixelCount);
  const mL = sL / n;
  const mA = sA / n;
  const mB = sB / n;
  let vL = 0;
  let vA = 0;
  let vB = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    const dl = lab[i * 3]! - mL;
    const da = lab[i * 3 + 1]! - mA;
    const db = lab[i * 3 + 2]! - mB;
    vL += dl * dl;
    vA += da * da;
    vB += db * db;
  }
  return {
    lab,
    mean: [mL, mA, mB],
    std: [
      Math.max(1e-3, Math.sqrt(vL / n)),
      Math.max(1e-3, Math.sqrt(vA / n)),
      Math.max(1e-3, Math.sqrt(vB / n)),
    ],
  };
}

/**
 * 3. 커스텀 참조 이미지 기반 색감 매치 (`filtercolortransfer`):
 *    임의 참조 RGBA 이미지의 CIE L*a*b* 평균·표준편차를 실측해 원본에 이식한다.
 */
export function applyCspCustomReferenceColorMatch(
  src: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  params: CspCustomColorMatchParams,
): Uint8ClampedArray {
  const pixelCount = width * height;
  const out = new Uint8ClampedArray(pixelCount * 4);
  const refCount = params.referenceWidth * params.referenceHeight;
  if (pixelCount <= 0 || refCount <= 0) {
    out.set(src.subarray(0, out.length));
    return out;
  }

  const strength = clamp(params.strength01 ?? 1, 0, 1);
  const preserveL = params.preserveLuminance ?? false;
  const srcStats = computeLabStats(src, pixelCount);
  const refStats = computeLabStats(params.referenceRgba, refCount);

  const scaleL = refStats.std[0] / srcStats.std[0];
  const scaleA = refStats.std[1] / srcStats.std[1];
  const scaleB = refStats.std[2] / srcStats.std[2];

  for (let i = 0; i < pixelCount; i += 1) {
    const l = srcStats.lab[i * 3]!;
    const a = srcStats.lab[i * 3 + 1]!;
    const b = srcStats.lab[i * 3 + 2]!;
    const tL = preserveL ? l : (l - srcStats.mean[0]) * scaleL + refStats.mean[0];
    const tA = (a - srcStats.mean[1]) * scaleA + refStats.mean[1];
    const tB = (b - srcStats.mean[2]) * scaleB + refStats.mean[2];
    const [tr, tg, tb] = labD65ToRgb(tL, tA, tB);
    const idx = i * 4;
    out[idx] = clampByte((src[idx] ?? 0) * (1 - strength) + tr * strength);
    out[idx + 1] = clampByte((src[idx + 1] ?? 0) * (1 - strength) + tg * strength);
    out[idx + 2] = clampByte((src[idx + 2] ?? 0) * (1 - strength) + tb * strength);
    out[idx + 3] = src[idx + 3] ?? 255;
  }
  return out;
}
