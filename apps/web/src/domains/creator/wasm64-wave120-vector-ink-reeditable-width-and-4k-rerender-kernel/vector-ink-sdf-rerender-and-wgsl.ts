/**
 * Wave 120 — 해상도 독립 1x/2x/4K/600DPI 가변 폭 캡슐 SDF 재래스터화 & 선명도 정량 비교 커널.
 *
 * - 각 픽셀에서 가변 반경 캡슐(Uneven Capsule) 해석적 부호 거리장(SDF)으로 안티앨리어싱 알파 버퍼를 생성한다.
 * - 1x 래스터 바이리니어 확대 대비 4x 벡터 SDF 직접 재렌더링의 Sobel 에지 선명도(edgeAcutance)와
 *   경계 번짐 폭(transitionBandPx)을 정량 비교한다.
 */

import { clampFinite, sha256VectorInkHex } from "./vector-ink-sha256";
import {
  computeStrokeTotalLength,
  evaluateEffectiveStrokeWidth,
  extractStrokeSegments,
  type VectorInkLayer,
  type VectorInkStroke,
} from "./vector-ink-stroke-and-width-sculpt";

export {
  buildVectorInkSdfWgsl,
  validateVectorInkSdfWgsl,
  type BuildVectorInkSdfWgslOptions,
  type VectorInkSdfWgslArtifact,
  type VectorInkWgslValidationResult,
} from "./vector-ink-sdf-wgsl";

export interface PreparedInkCapsule {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly r0: number;
  readonly r1: number;
  readonly opacity: number;
}

export interface VectorInkAlphaTile {
  readonly width: number;
  readonly height: number;
  readonly scaleFactor: number;
  readonly effectiveDpi: number;
  readonly alpha: Float32Array;
  readonly coverageRatio: number;
  readonly nonZeroPixelCount: number;
  readonly strokeSegmentCount: number;
  readonly sha256Hex: string;
}

export interface AlphaEdgeSharpnessMetrics {
  readonly edgeAcutance: number;
  readonly maxSobelGradient: number;
  readonly transitionBandPx: number;
  readonly activeEdgePixelCount: number;
  readonly transitionPixelCount: number;
}

export interface VectorVsRasterUpscaleComparison {
  readonly baseWidth: number;
  readonly baseHeight: number;
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly upscaleFactor: number;
  readonly baseDpi: number;
  readonly targetDpi: number;
  readonly vectorEdgeAcutance: number;
  readonly rasterUpscaleEdgeAcutance: number;
  readonly sharpnessAdvantageRatio: number;
  readonly vectorTransitionBandPx: number;
  readonly rasterUpscaleTransitionBandPx: number;
  readonly transitionTighteningRatio: number;
  readonly vectorTransitionPixelCount: number;
  readonly rasterTransitionPixelCount: number;
  readonly passedAdvantageGate: boolean;
  readonly baseTile: VectorInkAlphaTile;
  readonly vectorTile: VectorInkAlphaTile;
  readonly rasterUpscaledAlpha: Float32Array;
}

const DEFAULT_AA_HALF_PX = 0.55;
const SHARPNESS_ADVANTAGE_GATE = 1.8;

/**
 * 2D 가변 폭 캡슐(Uneven Capsule: 중심 A·반경 r0 ↔ 중심 B·반경 r1)의 정확한 해석적 부호 거리(SDF).
 * 내부는 음수, 경계는 0, 외부는 양수를 반환한다.
 */
export function signedDistanceToVariableWidthCapsule(
  px: number,
  py: number,
  ax: number,
  ay: number,
  r0: number,
  bx: number,
  by: number,
  r1: number,
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const h = Math.hypot(vx, vy);
  const dx = px - ax;
  const dy = py - ay;

  if (h <= 1e-9) {
    return Math.hypot(dx, dy) - Math.max(r0, r1);
  }

  const invH = 1 / h;
  const ux = vx * invH;
  const uy = vy * invH;
  const y = dx * ux + dy * uy;
  const x = Math.abs(-dx * uy + dy * ux);
  const deltaR = r0 - r1;

  if (Math.abs(deltaR) >= h - 1e-9) {
    return r0 >= r1 ? Math.hypot(dx, dy) - r0 : Math.hypot(px - bx, py - by) - r1;
  }

  const ny = deltaR * invH;
  const nx = Math.sqrt(Math.max(0, 1 - ny * ny));
  const projAlongTangent = -x * ny + y * nx;

  if (projAlongTangent < 0) return Math.hypot(x, y) - r0;
  if (projAlongTangent > h * nx) return Math.hypot(x, y - h) - r1;
  return x * nx + y * ny - r0;
}

function buildPreparedCapsulesForStroke(stroke: VectorInkStroke): readonly PreparedInkCapsule[] {
  const segments = extractStrokeSegments(stroke);
  if (segments.length === 0) return [];
  const totalLength = computeStrokeTotalLength(stroke);
  const opacity = clampFinite(stroke.opacity ?? 1, 0, 1, 1);
  if (opacity <= 0) return [];

  const capsules: PreparedInkCapsule[] = [];
  const taperStart = stroke.closed ? 0 : Math.max(0, stroke.taperStartPx);
  const taperEnd = stroke.closed ? 0 : Math.max(0, stroke.taperEndPx);

  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (seg.length <= 1e-9) continue;

    const splitTs: number[] = [0, 1];
    if (taperStart > 0 && seg.startS < taperStart) {
      const endCut = Math.min(seg.endS, taperStart);
      const tCut = (endCut - seg.startS) / seg.length;
      const midT = ((seg.startS + endCut) * 0.5 - seg.startS) / seg.length;
      if (tCut > 1e-4 && tCut < 1 - 1e-4) splitTs.push(tCut);
      if (midT > 1e-4 && midT < 1 - 1e-4) splitTs.push(midT);
    }
    const taperEndStartS = Math.max(0, totalLength - taperEnd);
    if (taperEnd > 0 && seg.endS > taperEndStartS) {
      const startCut = Math.max(seg.startS, taperEndStartS);
      const tCut = (startCut - seg.startS) / seg.length;
      const midT = ((startCut + seg.endS) * 0.5 - seg.startS) / seg.length;
      if (tCut > 1e-4 && tCut < 1 - 1e-4) splitTs.push(tCut);
      if (midT > 1e-4 && midT < 1 - 1e-4) splitTs.push(midT);
    }

    splitTs.sort((a, b) => a - b);
    const uniqueTs: number[] = [];
    for (let k = 0; k < splitTs.length; k += 1) {
      if (uniqueTs.length === 0 || splitTs[k] - uniqueTs[uniqueTs.length - 1] > 1e-4) {
        uniqueTs.push(splitTs[k]);
      }
    }

    for (let k = 0; k < uniqueTs.length - 1; k += 1) {
      const t0 = uniqueTs[k];
      const t1 = uniqueTs[k + 1];
      const s0 = seg.startS + seg.length * t0;
      const s1 = seg.startS + seg.length * t1;
      const w0Raw = seg.p0.widthPx + (seg.p1.widthPx - seg.p0.widthPx) * t0;
      const w1Raw = seg.p0.widthPx + (seg.p1.widthPx - seg.p0.widthPx) * t1;
      const w0 = evaluateEffectiveStrokeWidth(
        w0Raw, s0, totalLength, stroke.taperStartPx, stroke.taperEndPx, stroke.closed,
      );
      const w1 = evaluateEffectiveStrokeWidth(
        w1Raw, s1, totalLength, stroke.taperStartPx, stroke.taperEndPx, stroke.closed,
      );
      capsules.push({
        ax: seg.p0.x + (seg.p1.x - seg.p0.x) * t0,
        ay: seg.p0.y + (seg.p1.y - seg.p0.y) * t0,
        bx: seg.p0.x + (seg.p1.x - seg.p0.x) * t1,
        by: seg.p0.y + (seg.p1.y - seg.p0.y) * t1,
        r0: w0 * 0.5,
        r1: w1 * 0.5,
        opacity,
      });
    }
  }
  return capsules;
}

function hashAlphaBufferHex(
  alpha: Float32Array,
  width: number,
  height: number,
  scaleFactor: number,
): string {
  const bytes = new Uint8Array(alpha.length + 12);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, width >>> 0, false);
  view.setUint32(4, height >>> 0, false);
  view.setUint32(8, Math.round(scaleFactor * 1000) >>> 0, false);
  for (let i = 0; i < alpha.length; i += 1) {
    bytes[12 + i] = Math.round(clampFinite(alpha[i], 0, 1, 0) * 255) & 0xff;
  }
  return sha256VectorInkHex(bytes);
}

/** 벡터 먹선 레이어를 가변 폭 캡슐 SDF로 임의 해상도(`scaleFactor`)에 직접 무손실 재래스터화한다. */
export function rerenderVectorInkToAlphaTile(
  layer: VectorInkLayer,
  targetWidth: number,
  targetHeight: number,
  scaleFactor: number,
): VectorInkAlphaTile {
  const width = Math.max(1, Math.floor(clampFinite(targetWidth, 1, 4096, 64)));
  const height = Math.max(1, Math.floor(clampFinite(targetHeight, 1, 4096, 64)));
  const scale = clampFinite(scaleFactor, 0.1, 32, 1);
  const invScale = 1 / scale;
  const aaLogicalPad = (DEFAULT_AA_HALF_PX + 0.5) * invScale;

  const pixelCount = width * height;
  const alpha = new Float32Array(pixelCount);
  const strokeMinSd = new Float32Array(pixelCount);
  let totalSegmentCount = 0;

  for (let sIdx = 0; sIdx < layer.strokes.length; sIdx += 1) {
    const stroke = layer.strokes[sIdx];
    const capsules = buildPreparedCapsulesForStroke(stroke);
    if (capsules.length === 0) continue;
    totalSegmentCount += capsules.length;
    const strokeOpacity = clampFinite(stroke.opacity ?? 1, 0, 1, 1);

    let minTileX = width;
    let maxTileX = -1;
    let minTileY = height;
    let maxTileY = -1;

    for (let c = 0; c < capsules.length; c += 1) {
      const cap = capsules[c];
      const pad = Math.max(cap.r0, cap.r1) + aaLogicalPad;
      const x0 = Math.max(0, Math.floor((Math.min(cap.ax, cap.bx) - pad) * scale));
      const x1 = Math.min(width - 1, Math.ceil((Math.max(cap.ax, cap.bx) + pad) * scale));
      const y0 = Math.max(0, Math.floor((Math.min(cap.ay, cap.by) - pad) * scale));
      const y1 = Math.min(height - 1, Math.ceil((Math.max(cap.ay, cap.by) + pad) * scale));
      if (x0 <= x1 && y0 <= y1) {
        if (x0 < minTileX) minTileX = x0;
        if (x1 > maxTileX) maxTileX = x1;
        if (y0 < minTileY) minTileY = y0;
        if (y1 > maxTileY) maxTileY = y1;
      }
    }
    if (minTileX > maxTileX || minTileY > maxTileY) continue;

    for (let py = minTileY; py <= maxTileY; py += 1) {
      const rowOffset = py * width;
      for (let px = minTileX; px <= maxTileX; px += 1) {
        strokeMinSd[rowOffset + px] = Number.POSITIVE_INFINITY;
      }
    }

    for (let c = 0; c < capsules.length; c += 1) {
      const cap = capsules[c];
      const pad = Math.max(cap.r0, cap.r1) + aaLogicalPad;
      const x0 = Math.max(0, Math.floor((Math.min(cap.ax, cap.bx) - pad) * scale));
      const x1 = Math.min(width - 1, Math.ceil((Math.max(cap.ax, cap.bx) + pad) * scale));
      const y0 = Math.max(0, Math.floor((Math.min(cap.ay, cap.by) - pad) * scale));
      const y1 = Math.min(height - 1, Math.ceil((Math.max(cap.ay, cap.by) + pad) * scale));
      if (x0 > x1 || y0 > y1) continue;

      for (let py = y0; py <= y1; py += 1) {
        const ly = (py + 0.5) * invScale;
        const rowOffset = py * width;
        for (let px = x0; px <= x1; px += 1) {
          const lx = (px + 0.5) * invScale;
          const sdLogical = signedDistanceToVariableWidthCapsule(
            lx, ly, cap.ax, cap.ay, cap.r0, cap.bx, cap.by, cap.r1,
          );
          const idx = rowOffset + px;
          if (sdLogical < strokeMinSd[idx]) strokeMinSd[idx] = sdLogical;
        }
      }
    }

    for (let py = minTileY; py <= maxTileY; py += 1) {
      const rowOffset = py * width;
      for (let px = minTileX; px <= maxTileX; px += 1) {
        const idx = rowOffset + px;
        const sdLogical = strokeMinSd[idx];
        if (!Number.isFinite(sdLogical)) continue;
        const sdTargetPx = sdLogical * scale;
        if (sdTargetPx >= DEFAULT_AA_HALF_PX) continue;
        const t = clampFinite((DEFAULT_AA_HALF_PX - sdTargetPx) / (2 * DEFAULT_AA_HALF_PX), 0, 1, 0);
        const coverage = t * t * (3 - 2 * t) * strokeOpacity;
        if (coverage > alpha[idx]) alpha[idx] = coverage;
      }
    }
  }

  let alphaSum = 0;
  let nonZeroPixelCount = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    if (alpha[i] > 1e-4) {
      nonZeroPixelCount += 1;
      alphaSum += alpha[i];
    }
  }

  return {
    width,
    height,
    scaleFactor: scale,
    effectiveDpi: Math.round(clampFinite(layer.dpi, 72, 2400, 150) * scale),
    alpha,
    coverageRatio: pixelCount > 0 ? alphaSum / pixelCount : 0,
    nonZeroPixelCount,
    strokeSegmentCount: totalSegmentCount,
    sha256Hex: hashAlphaBufferHex(alpha, width, height, scale),
  };
}

/** 1x 알파 타일을 표준 연속 바이리니어 보간으로 목표 해상도로 확대한다. */
export function upscaleAlphaTileBilinear(
  srcAlpha: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Float32Array {
  const out = new Float32Array(dstW * dstH);
  const scaleX = srcW / dstW;
  const scaleY = srcH / dstH;

  for (let dy = 0; dy < dstH; dy += 1) {
    const fy = clampFinite((dy + 0.5) * scaleY - 0.5, 0, srcH - 1, 0);
    const y0 = Math.floor(fy);
    const y1 = Math.min(srcH - 1, y0 + 1);
    const wy = fy - y0;
    const row0 = y0 * srcW;
    const row1 = y1 * srcW;
    const dstRow = dy * dstW;

    for (let dx = 0; dx < dstW; dx += 1) {
      const fx = clampFinite((dx + 0.5) * scaleX - 0.5, 0, srcW - 1, 0);
      const x0 = Math.floor(fx);
      const x1 = Math.min(srcW - 1, x0 + 1);
      const wx = fx - x0;
      const top = srcAlpha[row0 + x0] + (srcAlpha[row0 + x1] - srcAlpha[row0 + x0]) * wx;
      const bot = srcAlpha[row1 + x0] + (srcAlpha[row1 + x1] - srcAlpha[row1 + x0]) * wx;
      out[dstRow + dx] = top + (bot - top) * wy;
    }
  }
  return out;
}

/** 알파 버퍼의 Sobel 에지 선명도(edgeAcutance)와 경계 번짐 폭(transitionBandPx)을 측정한다. */
export function measureAlphaEdgeSharpness(
  alpha: Float32Array,
  width: number,
  height: number,
): AlphaEdgeSharpnessMetrics {
  if (width < 3 || height < 3) {
    return {
      edgeAcutance: 0,
      maxSobelGradient: 0,
      transitionBandPx: 0,
      activeEdgePixelCount: 0,
      transitionPixelCount: 0,
    };
  }

  let gradSum = 0;
  let activeEdgePixelCount = 0;
  let maxSobelGradient = 0;
  let transitionPixelCount = 0;
  let transitionWidthSum = 0;

  for (let y = 1; y < height - 1; y += 1) {
    const rPrev = (y - 1) * width;
    const rCurr = y * width;
    const rNext = (y + 1) * width;
    for (let x = 1; x < width - 1; x += 1) {
      const tl = alpha[rPrev + x - 1];
      const tc = alpha[rPrev + x];
      const tr = alpha[rPrev + x + 1];
      const ml = alpha[rCurr + x - 1];
      const mc = alpha[rCurr + x];
      const mr = alpha[rCurr + x + 1];
      const bl = alpha[rNext + x - 1];
      const bc = alpha[rNext + x];
      const br = alpha[rNext + x + 1];

      const gx = (-tl + tr - 2 * ml + 2 * mr - bl + br) * 0.125;
      const gy = (-tl - 2 * tc - tr + bl + 2 * bc + br) * 0.125;
      const mag = Math.hypot(gx, gy);

      if (mag > maxSobelGradient) maxSobelGradient = mag;
      if (mag > 0.02) {
        gradSum += mag;
        activeEdgePixelCount += 1;
      }
      if (mc > 0.05 && mc < 0.95) {
        transitionPixelCount += 1;
        transitionWidthSum += 0.8 / Math.max(mag, 0.03);
      }
    }
  }

  const edgeAcutance = activeEdgePixelCount > 0 ? gradSum / activeEdgePixelCount : 0;
  const transitionBandPx =
    transitionPixelCount > 0
      ? transitionWidthSum / transitionPixelCount
      : edgeAcutance > 1e-4
        ? 0.8 / edgeAcutance
        : 0;

  return {
    edgeAcutance,
    maxSobelGradient,
    transitionBandPx,
    activeEdgePixelCount,
    transitionPixelCount,
  };
}

/** 1x 래스터 단순 바이리니어 확대 vs 벡터 SDF 직접 재래스터화의 선명도 및 경계 번짐 폭을 정량 비교한다. */
export function compareVectorRerenderVsRasterUpscale(
  layer: VectorInkLayer,
  baseW: number,
  baseH: number,
  upscaleFactor: number,
): VectorVsRasterUpscaleComparison {
  const safeBaseW = Math.max(8, Math.floor(clampFinite(baseW, 8, 1024, 64)));
  const safeBaseH = Math.max(8, Math.floor(clampFinite(baseH, 8, 1024, 64)));
  const safeScale = clampFinite(upscaleFactor, 1, 16, 4);
  const targetWidth = Math.max(8, Math.round(safeBaseW * safeScale));
  const targetHeight = Math.max(8, Math.round(safeBaseH * safeScale));

  const baseTile = rerenderVectorInkToAlphaTile(layer, safeBaseW, safeBaseH, 1);
  const rasterUpscaledAlpha = upscaleAlphaTileBilinear(
    baseTile.alpha, safeBaseW, safeBaseH, targetWidth, targetHeight,
  );
  const vectorTile = rerenderVectorInkToAlphaTile(layer, targetWidth, targetHeight, safeScale);

  const vectorMetrics = measureAlphaEdgeSharpness(vectorTile.alpha, targetWidth, targetHeight);
  const rasterMetrics = measureAlphaEdgeSharpness(rasterUpscaledAlpha, targetWidth, targetHeight);

  const sharpnessAdvantageRatio =
    rasterMetrics.edgeAcutance > 1e-6
      ? vectorMetrics.edgeAcutance / rasterMetrics.edgeAcutance
      : vectorMetrics.edgeAcutance > 0
        ? Number.POSITIVE_INFINITY
        : 1;
  const transitionTighteningRatio =
    vectorMetrics.transitionBandPx > 1e-6
      ? rasterMetrics.transitionBandPx / vectorMetrics.transitionBandPx
      : 1;

  const baseDpi = Math.round(clampFinite(layer.dpi, 72, 2400, 150));
  return {
    baseWidth: safeBaseW,
    baseHeight: safeBaseH,
    targetWidth,
    targetHeight,
    upscaleFactor: safeScale,
    baseDpi,
    targetDpi: Math.round(baseDpi * safeScale),
    vectorEdgeAcutance: vectorMetrics.edgeAcutance,
    rasterUpscaleEdgeAcutance: rasterMetrics.edgeAcutance,
    sharpnessAdvantageRatio,
    vectorTransitionBandPx: vectorMetrics.transitionBandPx,
    rasterUpscaleTransitionBandPx: rasterMetrics.transitionBandPx,
    transitionTighteningRatio,
    vectorTransitionPixelCount: vectorMetrics.transitionPixelCount,
    rasterTransitionPixelCount: rasterMetrics.transitionPixelCount,
    passedAdvantageGate:
      Number.isFinite(sharpnessAdvantageRatio) && sharpnessAdvantageRatio > SHARPNESS_ADVANTAGE_GATE,
    baseTile,
    vectorTile,
    rasterUpscaledAlpha,
  };
}
