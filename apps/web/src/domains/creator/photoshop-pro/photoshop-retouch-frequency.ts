/**
 * Photoshop 프로 리터칭·마스크·선택 통합 픽셀 엔진:
 * 1. Frequency Separation (고주파 질감 / 저주파 톤 분리 & Linear Light 재합성)
 * 2. Spot Healing Brush / Seamless Poisson Patch Tool / Clone Stamp
 * 3. Content-Aware Edge-Fill 클린업 (배경·잡티·말풍선 흔적 자동 패치 매칭 + 확산 메우기)
 * 4. Pen / Cubic Bezier 패스 & 안티앨리어싱 벡터 마스크 래스터라이저 (nonzero / evenodd)
 * 5. CIE Lab Color Range 정밀 선택 · Select & Mask 경계 다듬기 · Quick Mask 오버레이
 */

import {
  recombineImageFrequencies,
  runCleanroomPatchMatchInpaint,
  separateImageFrequencies,
  type CleanroomFrequencySeparation,
  type CleanroomPatchMatchOptions,
  type CleanroomPatchMatchResult,
} from "../imaging-pro/studio-patchmatch-inpaint-and-freqsep";
import {
  blurByteMaskSeparable,
  blurRgbaSeparable,
  clamp01,
  clampByte,
  luminance255,
  srgb01ToLab,
} from "./photoshop-pixel-math";

import type { RgbaImageBuffer, RgbColor } from "./photoshop-pixel-math";

export interface FrequencySeparationResult {
  readonly width: number;
  readonly height: number;
  readonly radiusPx: number;
  readonly lowFrequency: Uint8ClampedArray;
  readonly highFrequency: Uint8ClampedArray;
  /** 무손실 왕복 복원용 정밀 주파수 분리 결과(분리형 가우시안 Float32 잔차). */
  readonly exactSeparation?: CleanroomFrequencySeparation;
}

export interface CloneStampStrokeOptions {
  readonly sourceX: number;
  readonly sourceY: number;
  readonly destinationPoints: readonly { readonly x: number; readonly y: number }[];
  readonly radiusPx: number;
  readonly hardness01?: number;
  readonly opacity01?: number;
  readonly aligned?: boolean;
}

export interface ContentAwareFillOptions {
  readonly patchRadius?: number;
  readonly searchRadius?: number;
  readonly smoothPasses?: number;
  readonly engine?: "edge-fill" | "patchmatch";
  readonly patchMatchOptions?: CleanroomPatchMatchOptions;
}

export interface BezierAnchor {
  readonly x: number; readonly y: number;
  readonly handleInX: number; readonly handleInY: number;
  readonly handleOutX: number; readonly handleOutY: number;
}

export interface BezierVectorPath {
  readonly id: string; readonly name: string; readonly closed: boolean;
  readonly fillRule: "nonzero" | "evenodd";
  readonly anchors: readonly BezierAnchor[];
}

export interface VectorMaskRasterOptions {
  readonly featherPx?: number; readonly inverted?: boolean; readonly supersample?: 1 | 2 | 4;
}

export type ColorRangeMode =
  | "sampled" | "highlights" | "midtones" | "shadows"
  | "reds" | "yellows" | "greens" | "cyans" | "blues" | "magentas";

export interface ColorRangeOptions {
  readonly mode: ColorRangeMode; readonly sampleColor?: RgbColor;
  readonly fuzziness: number; readonly invert?: boolean; readonly featherPx?: number;
}

export interface SelectionMaskResult {
  readonly width: number; readonly height: number;
  readonly mask: Uint8Array; readonly selectedPixelCount: number;
}

export interface SelectionRefineOptions {
  readonly smoothPx?: number; readonly featherPx?: number;
  readonly contrastPct?: number; readonly shiftEdgePx?: number;
}

export interface QuickMaskOverlayOptions {
  readonly overlayColor?: RgbColor; readonly overlayOpacity?: number;
  readonly maskIndicates?: "masked" | "selected";
}

// ---------------------------------------------------------------------------
// 1. Frequency Separation (고주파 질감 / 저주파 톤 분리 & 재합성)
// ---------------------------------------------------------------------------

/** 원본 RGBA를 분리형 가우시안 저주파(색·명암)와 고주파(질감·선화)로 분리한다. */
export function separateFrequencies(source: RgbaImageBuffer, radiusPx = 3): FrequencySeparationResult {
  const safeRadius = Math.max(0.5, Math.min(24, radiusPx));
  const exactSeparation = separateImageFrequencies(source, { radiusPx: safeRadius });
  return {
    width: exactSeparation.width,
    height: exactSeparation.height,
    radiusPx: safeRadius,
    lowFrequency: exactSeparation.lowRgba,
    highFrequency: exactSeparation.highLinearLightRgba,
    exactSeparation,
  };
}

/** 저주파 톤과 고주파 질감을 재합성한다(기본 강도 1.0 + 미변형 시 정밀 잔차로 무손실 왕복 복원). */
export function recombineFrequencies(
  separation: FrequencySeparationResult,
  options?: { readonly textureStrength?: number; readonly lowSmoothRadiusPx?: number },
): RgbaImageBuffer {
  const { width, height, highFrequency } = separation;
  const textureStrength = Math.max(0, Math.min(2, options?.textureStrength ?? 1));
  if (separation.exactSeparation) {
    const lowOverrideRgba =
      options?.lowSmoothRadiusPx && options.lowSmoothRadiusPx > 0.25
        ? blurRgbaSeparable(separation.lowFrequency, width, height, options.lowSmoothRadiusPx)
        : undefined;
    return recombineImageFrequencies(separation.exactSeparation, {
      highGain: textureStrength,
      lowGain: 1,
      mode: "exact-float",
      lowOverrideRgba,
    });
  }
  const lowSource = options?.lowSmoothRadiusPx && options.lowSmoothRadiusPx > 0.25
    ? blurRgbaSeparable(separation.lowFrequency, width, height, options.lowSmoothRadiusPx)
    : separation.lowFrequency;
  const out = new Uint8ClampedArray(lowSource.length);
  const total = width * height;
  for (let i = 0; i < total; i += 1) {
    const off = i * 4;
    for (let c = 0; c < 3; c += 1) {
      out[off + c] = clampByte((lowSource[off + c] ?? 0) + ((highFrequency[off + c] ?? 128) - 128) * 2 * textureStrength);
    }
    out[off + 3] = lowSource[off + 3] ?? 255;
  }
  return { width, height, data: out };
}

// ---------------------------------------------------------------------------
// 2. Clone Stamp / Seamless Poisson Patch Tool / Spot Healing Brush
// ---------------------------------------------------------------------------

/** 복제 도장(Clone Stamp) — 기준 원본 좌표 픽셀을 부드러운 원형 브러시로 대상 경로에 복제한다. */
export function applyCloneStamp(source: RgbaImageBuffer, options: CloneStampStrokeOptions): RgbaImageBuffer {
  const { width, height, data } = source;
  const out = new Uint8ClampedArray(data);
  if (options.destinationPoints.length === 0) return { width, height, data: out };
  const r = Math.max(1, options.radiusPx), hard = clamp01(options.hardness01 ?? 0.65), op = clamp01(options.opacity01 ?? 1);
  const firstDst = options.destinationPoints[0]!;
  const baseOffX = options.sourceX - firstDst.x, baseOffY = options.sourceY - firstDst.y;

  for (const pt of options.destinationPoints) {
    const offX = options.aligned === false ? options.sourceX - pt.x : baseOffX;
    const offY = options.aligned === false ? options.sourceY - pt.y : baseOffY;
    const minX = Math.max(0, Math.floor(pt.x - r)), maxX = Math.min(width - 1, Math.ceil(pt.x + r));
    const minY = Math.max(0, Math.floor(pt.y - r)), maxY = Math.min(height - 1, Math.ceil(pt.y + r));
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dist = Math.hypot(x - pt.x, y - pt.y);
        if (dist > r) continue;
        const sx = Math.round(x + offX), sy = Math.round(y + offY);
        if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
        const norm = dist / r;
        const alpha = (norm <= hard ? 1 : clamp01(1 - (norm - hard) / Math.max(0.01, 1 - hard))) * op;
        const dOff = (y * width + x) * 4, sOff = (sy * width + sx) * 4;
        for (let c = 0; c < 4; c += 1) {
          out[dOff + c] = clampByte((out[dOff + c] ?? 0) * (1 - alpha) + (data[sOff + c] ?? 0) * alpha);
        }
      }
    }
  }
  return { width, height, data: out };
}

/** 패치 도구(Patch Tool) — 오프셋 질감을 복사하고 Gauss-Seidel 포아송 완화로 경계 이음새를 자연스럽게 맞춘다. */
export function applyPatchTool(
  source: RgbaImageBuffer, targetMask: Uint8Array, offsetX: number, offsetY: number, blendIterations = 24,
): RgbaImageBuffer {
  const { width, height, data } = source;
  const total = width * height;
  const out = new Uint8ClampedArray(data);
  const maskedIndices: number[] = [];
  for (let i = 0; i < total; i += 1) {
    if ((targetMask[i] ?? 0) >= 128) maskedIndices.push(i);
  }
  if (maskedIndices.length === 0) return { width, height, data: out };

  const fieldR = new Float32Array(total), fieldG = new Float32Array(total), fieldB = new Float32Array(total);
  const guidR = new Float32Array(total), guidG = new Float32Array(total), guidB = new Float32Array(total);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x, off = p * 4;
      const sx = Math.max(0, Math.min(width - 1, Math.round(x + offsetX)));
      const sy = Math.max(0, Math.min(height - 1, Math.round(y + offsetY)));
      const sOff = (sy * width + sx) * 4;
      guidR[p] = data[sOff] ?? 0; guidG[p] = data[sOff + 1] ?? 0; guidB[p] = data[sOff + 2] ?? 0;
      const useGuid = (targetMask[p] ?? 0) >= 128;
      fieldR[p] = useGuid ? (guidR[p] ?? 0) : (data[off] ?? 0);
      fieldG[p] = useGuid ? (guidG[p] ?? 0) : (data[off + 1] ?? 0);
      fieldB[p] = useGuid ? (guidB[p] ?? 0) : (data[off + 2] ?? 0);
    }
  }

  const iters = Math.max(4, Math.min(80, Math.round(blendIterations)));
  for (let iter = 0; iter < iters; iter += 1) {
    for (const p of maskedIndices) {
      const x = p % width, y = (p - x) / width;
      let sumR = 0, sumG = 0, sumB = 0, count = 0;
      const nbs = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
      for (const nb of nbs) {
        if (nb < 0) continue;
        sumR += (fieldR[nb] ?? 0) + ((guidR[p] ?? 0) - (guidR[nb] ?? 0));
        sumG += (fieldG[nb] ?? 0) + ((guidG[p] ?? 0) - (guidG[nb] ?? 0));
        sumB += (fieldB[nb] ?? 0) + ((guidB[p] ?? 0) - (guidB[nb] ?? 0));
        count += 1;
      }
      if (count > 0) {
        fieldR[p] = sumR / count; fieldG[p] = sumG / count; fieldB[p] = sumB / count;
      }
    }
  }
  for (const p of maskedIndices) {
    const off = p * 4;
    out[off] = clampByte(fieldR[p] ?? 0); out[off + 1] = clampByte(fieldG[p] ?? 0); out[off + 2] = clampByte(fieldB[p] ?? 0);
  }
  return { width, height, data: out };
}

/** 스팟 복구 브러시(Spot Healing Brush) — 원형 잡티를 주변 링의 색·질감으로 자동 복원한다. */
export function applySpotHealingBrush(
  source: RgbaImageBuffer, cx: number, cy: number, radiusPx: number,
  options?: { readonly textureBlend?: number; readonly iterations?: number },
): RgbaImageBuffer {
  const { width, height } = source;
  const r = Math.max(1, Math.min(64, radiusPx));
  const mask = new Uint8Array(width * height);
  const minX = Math.max(0, Math.floor(cx - r)), maxX = Math.min(width - 1, Math.ceil(cx + r));
  const minY = Math.max(0, Math.floor(cy - r)), maxY = Math.min(height - 1, Math.ceil(cy + r));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (Math.hypot(x - cx, y - cy) <= r) mask[y * width + x] = 255;
    }
  }
  const shift = Math.ceil(r * 2 + 2);
  let bestDx = shift, bestDy = 0;
  for (const [dx, dy] of [[shift, 0], [-shift, 0], [0, shift], [0, -shift]] as const) {
    if (cx + dx >= r && cx + dx < width - r && cy + dy >= r && cy + dy < height - r) {
      bestDx = dx; bestDy = dy; break;
    }
  }
  const patched = applyPatchTool(source, mask, bestDx, bestDy, options?.iterations ?? 28);
  const textureBlend = clamp01(options?.textureBlend ?? 0.85);
  if (textureBlend >= 0.99) return patched;
  const harmonic = applyContentAwareFill(source, mask, { patchRadius: 1, searchRadius: 4, smoothPasses: 2 });
  const out = new Uint8ClampedArray(patched.data);
  for (let i = 0; i < mask.length; i += 1) {
    if ((mask[i] ?? 0) < 128) continue;
    const off = i * 4;
    for (let c = 0; c < 3; c += 1) {
      out[off + c] = clampByte((harmonic.data[off + c] ?? 0) * (1 - textureBlend) + (patched.data[off + c] ?? 0) * textureBlend);
    }
  }
  return { width, height, data: out };
}

// ---------------------------------------------------------------------------
// 3. Content-Aware Edge-Fill 클린업 (배경/잡티/말풍선 흔적 자동 메우기)
// ---------------------------------------------------------------------------

/** Barnes et al. PatchMatch 로컬 콘텐츠 인식 채우기 진입점. */
export function applyPatchMatchContentAwareFill(
  source: RgbaImageBuffer,
  mask: Uint8Array,
  options?: CleanroomPatchMatchOptions,
): CleanroomPatchMatchResult {
  const binaryMask = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) {
    if ((mask[i] ?? 0) >= 128) binaryMask[i] = 1;
  }
  return runCleanroomPatchMatchInpaint(source, binaryMask, options);
}

/** 마스크 영역(>=128)을 바깥 껍질부터 패치 유사도 탐색 + 가중 확산(또는 PatchMatch 엔진)으로 자연스럽게 메운다. */
export function applyContentAwareFill(
  source: RgbaImageBuffer, mask: Uint8Array, options?: ContentAwareFillOptions,
): RgbaImageBuffer {
  if (options?.engine === "patchmatch") {
    return applyPatchMatchContentAwareFill(source, mask, {
      patchRadius: options.patchRadius ?? 2,
      ...options.patchMatchOptions,
    }).imageData;
  }
  const { width, height, data } = source;
  const total = width * height;
  const out = new Uint8ClampedArray(data);
  const known = new Uint8Array(total);
  const originalMask = new Uint8Array(total);
  let remaining = 0;
  for (let i = 0; i < total; i += 1) {
    if ((mask[i] ?? 0) >= 128) { known[i] = 0; originalMask[i] = 1; remaining += 1; }
    else known[i] = 1;
  }
  if (remaining === 0 || remaining === total) return { width, height, data: out };

  const patchR = Math.max(1, Math.min(2, Math.round(options?.patchRadius ?? 1)));
  const searchR = Math.max(4, Math.min(18, Math.round(options?.searchRadius ?? 10)));
  const stride = searchR > 10 ? 2 : 1;

  while (remaining > 0) {
    const frontier: number[] = [];
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = y * width + x;
        if (known[p] === 1) continue;
        if ((x > 0 && known[p - 1] === 1) || (x < width - 1 && known[p + 1] === 1) ||
            (y > 0 && known[p - width] === 1) || (y < height - 1 && known[p + width] === 1)) {
          frontier.push(p);
        }
      }
    }
    if (frontier.length === 0) break;

    for (const p of frontier) {
      const fx = p % width, fy = (p - fx) / width;
      let avgR = 0, avgG = 0, avgB = 0, avgA = 0, wSum = 0;
      for (let dy = -patchR; dy <= patchR; dy += 1) {
        const ny = fy + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -patchR; dx <= patchR; dx += 1) {
          const nx = fx + dx;
          if (nx < 0 || nx >= width) continue;
          const np = ny * width + nx;
          if (known[np] === 0) continue;
          const w = 1 / Math.max(1, dx * dx + dy * dy), off = np * 4;
          avgR += (out[off] ?? 0) * w; avgG += (out[off + 1] ?? 0) * w;
          avgB += (out[off + 2] ?? 0) * w; avgA += (out[off + 3] ?? 255) * w; wSum += w;
        }
      }

      let bestCost = Number.POSITIVE_INFINITY, bestCand = -1;
      for (let cy = Math.max(patchR, fy - searchR); cy <= Math.min(height - 1 - patchR, fy + searchR); cy += stride) {
        for (let cx = Math.max(patchR, fx - searchR); cx <= Math.min(width - 1 - patchR, fx + searchR); cx += stride) {
          const cp = cy * width + cx;
          if (originalMask[cp] === 1) continue;
          let cost = 0, compared = 0;
          for (let dy = -patchR; dy <= patchR; dy += 1) {
            const ny = fy + dy;
            if (ny < 0 || ny >= height) continue;
            for (let dx = -patchR; dx <= patchR; dx += 1) {
              const nx = fx + dx;
              if (nx < 0 || nx >= width) continue;
              const np = ny * width + nx;
              if (known[np] === 0) continue;
              const nOff = np * 4, sOff = ((cy + dy) * width + (cx + dx)) * 4;
              cost += ((out[nOff] ?? 0) - (data[sOff] ?? 0)) ** 2 +
                ((out[nOff + 1] ?? 0) - (data[sOff + 1] ?? 0)) ** 2 +
                ((out[nOff + 2] ?? 0) - (data[sOff + 2] ?? 0)) ** 2;
              compared += 1;
            }
          }
          if (compared > 0 && cost / compared < bestCost) {
            bestCost = cost / compared; bestCand = cp;
          }
        }
      }

      const dOff = p * 4;
      const dR = wSum > 0 ? avgR / wSum : 128, dG = wSum > 0 ? avgG / wSum : 128;
      const dB = wSum > 0 ? avgB / wSum : 128, dA = wSum > 0 ? avgA / wSum : 255;
      if (bestCand >= 0) {
        const bOff = bestCand * 4, ew = bestCost < 1200 ? 0.72 : 0.45;
        out[dOff] = clampByte((data[bOff] ?? 0) * ew + dR * (1 - ew));
        out[dOff + 1] = clampByte((data[bOff + 1] ?? 0) * ew + dG * (1 - ew));
        out[dOff + 2] = clampByte((data[bOff + 2] ?? 0) * ew + dB * (1 - ew));
        out[dOff + 3] = clampByte((data[bOff + 3] ?? 255) * ew + dA * (1 - ew));
      } else {
        out[dOff] = clampByte(dR); out[dOff + 1] = clampByte(dG);
        out[dOff + 2] = clampByte(dB); out[dOff + 3] = clampByte(dA);
      }
      known[p] = 1; remaining -= 1;
    }
  }

  const passes = Math.max(0, Math.min(4, Math.round(options?.smoothPasses ?? 1)));
  for (let pass = 0; pass < passes; pass += 1) {
    const prev = new Uint8ClampedArray(out);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const p = y * width + x;
        if (originalMask[p] === 0) continue;
        const off = p * 4;
        for (let c = 0; c < 3; c += 1) {
          out[off + c] = clampByte(((prev[off + c] ?? 0) * 4 + (prev[off - 4 + c] ?? 0) + (prev[off + 4 + c] ?? 0) +
            (prev[off - width * 4 + c] ?? 0) + (prev[off + width * 4 + c] ?? 0)) / 8);
        }
      }
    }
  }
  return { width, height, data: out };
}

// ---------------------------------------------------------------------------
// 4. Pen / Cubic Bezier 패스 & 벡터 마스크 래스터라이저
// ---------------------------------------------------------------------------

function subdivideCubic(
  x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number,
  flatness: number, out: Array<[number, number]>, depth = 0,
): void {
  const dx = x3 - x0, dy = y3 - y0;
  const d1 = Math.abs((x1 - x3) * dy - (y1 - y3) * dx);
  const d2 = Math.abs((x2 - x3) * dy - (y2 - y3) * dx);
  if ((d1 + d2) ** 2 <= flatness * flatness * Math.max(1e-4, dx * dx + dy * dy) || depth >= 8) {
    out.push([x3, y3]);
    return;
  }
  const x01 = (x0 + x1) * 0.5, y01 = (y0 + y1) * 0.5, x12 = (x1 + x2) * 0.5, y12 = (y1 + y2) * 0.5;
  const x23 = (x2 + x3) * 0.5, y23 = (y2 + y3) * 0.5, x012 = (x01 + x12) * 0.5, y012 = (y01 + y12) * 0.5;
  const x123 = (x12 + x23) * 0.5, y123 = (y12 + y23) * 0.5, mx = (x012 + x123) * 0.5, my = (y012 + y123) * 0.5;
  subdivideCubic(x0, y0, x01, y01, x012, y012, mx, my, flatness, out, depth + 1);
  subdivideCubic(mx, my, x123, y123, x23, y23, x3, y3, flatness, out, depth + 1);
}

export function flattenBezierPath(path: BezierVectorPath, flatnessPx = 0.5): readonly [number, number][] {
  if (path.anchors.length < 2) return [];
  const pts: Array<[number, number]> = [[path.anchors[0]!.x, path.anchors[0]!.y]];
  const segCount = path.closed ? path.anchors.length : path.anchors.length - 1;
  for (let i = 0; i < segCount; i += 1) {
    const a = path.anchors[i]!, b = path.anchors[(i + 1) % path.anchors.length]!;
    subdivideCubic(a.x, a.y, a.handleOutX, a.handleOutY, b.handleInX, b.handleInY, b.x, b.y, Math.max(0.1, flatnessPx), pts);
  }
  return pts;
}

function pointInsidePolygon(px: number, py: number, polygon: readonly [number, number][], fillRule: "nonzero" | "evenodd"): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  if (fillRule === "evenodd") {
    let inside = false;
    for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
      const [xi, yi] = polygon[i]!, [xj, yj] = polygon[j]!;
      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  let winding = 0;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const [x1, y1] = polygon[j]!, [x2, y2] = polygon[i]!;
    if (y1 <= py) {
      if (y2 > py && (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1) > 0) winding += 1;
    } else if (y2 <= py && (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1) < 0) {
      winding -= 1;
    }
  }
  return winding !== 0;
}

export function createPresetVectorMaskPath(shape: "oval" | "rounded-rect" | "diamond", width: number, height: number): BezierVectorPath {
  const cx = width * 0.5, cy = height * 0.5, rx = width * 0.38, ry = height * 0.38;
  if (shape === "diamond") {
    return {
      id: "preset-diamond", name: "마름모 모양 마스크", closed: true, fillRule: "nonzero",
      anchors: [
        { x: cx, y: cy - ry, handleInX: cx, handleInY: cy - ry, handleOutX: cx, handleOutY: cy - ry },
        { x: cx + rx, y: cy, handleInX: cx + rx, handleInY: cy, handleOutX: cx + rx, handleOutY: cy },
        { x: cx, y: cy + ry, handleInX: cx, handleInY: cy + ry, handleOutX: cx, handleOutY: cy + ry },
        { x: cx - rx, y: cy, handleInX: cx - rx, handleInY: cy, handleOutX: cx - rx, handleOutY: cy },
      ],
    };
  }
  const k = shape === "oval" ? 0.55228475 : 0.25, kx = rx * k, ky = ry * k;
  return {
    id: `preset-${shape}`, name: shape === "oval" ? "부드러운 타원 마스크" : "둥근 카드 마스크", closed: true, fillRule: "nonzero",
    anchors: [
      { x: cx, y: cy - ry, handleInX: cx - kx, handleInY: cy - ry, handleOutX: cx + kx, handleOutY: cy - ry },
      { x: cx + rx, y: cy, handleInX: cx + rx, handleInY: cy - ky, handleOutX: cx + rx, handleOutY: cy + ky },
      { x: cx, y: cy + ry, handleInX: cx + kx, handleInY: cy + ry, handleOutX: cx - kx, handleOutY: cy + ry },
      { x: cx - rx, y: cy, handleInX: cx - rx, handleInY: cy + ky, handleOutX: cx - rx, handleOutY: cy - ky },
    ],
  };
}

export function rasterizeVectorMask(
  paths: readonly BezierVectorPath[], width: number, height: number, options?: VectorMaskRasterOptions,
): Uint8Array {
  const safeW = Math.max(1, Math.floor(width)), safeH = Math.max(1, Math.floor(height)), ss = options?.supersample ?? 2;
  const flattened = paths.map((p) => ({ fillRule: p.fillRule, points: flattenBezierPath(p, 0.45) }));
  let mask = new Uint8Array(safeW * safeH);
  const invTotal = 1 / (ss * ss);
  for (let y = 0; y < safeH; y += 1) {
    for (let x = 0; x < safeW; x += 1) {
      let hits = 0;
      for (let sy = 0; sy < ss; sy += 1) {
        const py = y + (sy + 0.5) / ss;
        for (let sx = 0; sx < ss; sx += 1) {
          const px = x + (sx + 0.5) / ss;
          if (flattened.some((poly) => pointInsidePolygon(px, py, poly.points, poly.fillRule))) hits += 1;
        }
      }
      mask[y * safeW + x] = clampByte(hits * invTotal * 255);
    }
  }
  if (options?.featherPx && options.featherPx > 0.25) mask = blurByteMaskSeparable(mask, safeW, safeH, options.featherPx);
  if (options?.inverted) for (let i = 0; i < mask.length; i += 1) mask[i] = 255 - (mask[i] ?? 0);
  return mask;
}

export function applyVectorMaskToRgba(source: RgbaImageBuffer, mask: Uint8Array): RgbaImageBuffer {
  const out = new Uint8ClampedArray(source.data);
  const total = Math.min(source.width * source.height, mask.length);
  for (let i = 0; i < total; i += 1) {
    const off = i * 4;
    out[off + 3] = clampByte(((out[off + 3] ?? 255) * (mask[i] ?? 0)) / 255);
  }
  return { width: source.width, height: source.height, data: out };
}

// ---------------------------------------------------------------------------
// 5. Color Range 정밀 선택 · Select & Mask 경계 다듬기 · Quick Mask 오버레이
// ---------------------------------------------------------------------------

const HUE_RANGE_CENTERS: Readonly<Record<string, number>> = Object.freeze({
  reds: 0, yellows: 60, greens: 120, cyans: 180, blues: 240, magentas: 300,
});

function rgbHueAndSat(r: number, g: number, b: number): [number, number] {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), d = max - min;
  if (d <= 1e-5) return [0, 0];
  const h = max === rn ? ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60
    : max === gn ? ((bn - rn) / d + 2) * 60 : ((rn - gn) / d + 4) * 60;
  return [h, d / max];
}

export function selectColorRange(source: RgbaImageBuffer, options: ColorRangeOptions): SelectionMaskResult {
  const { width, height, data } = source;
  const total = width * height, fuzz = Math.max(1, Math.min(200, options.fuzziness));
  let mask = new Uint8Array(total);
  const sampleLab = options.sampleColor
    ? srgb01ToLab(options.sampleColor.r / 255, options.sampleColor.g / 255, options.sampleColor.b / 255)
    : ([50, 0, 0] as [number, number, number]);

  for (let i = 0; i < total; i += 1) {
    const off = i * 4, r = data[off] ?? 0, g = data[off + 1] ?? 0, b = data[off + 2] ?? 0;
    let score: number;
    if (options.mode === "sampled") {
      const [l, a, bb] = srgb01ToLab(r / 255, g / 255, b / 255);
      const deltaE = Math.hypot(l - sampleLab[0], a - sampleLab[1], bb - sampleLab[2]);
      const hard = fuzz * 0.28, soft = fuzz * 0.72;
      score = deltaE <= hard ? 1 : deltaE < hard + soft ? 1 - (deltaE - hard) / soft : 0;
    } else if (options.mode === "highlights" || options.mode === "midtones" || options.mode === "shadows") {
      const luma = luminance255(r, g, b) / 255, spread = Math.max(0.15, fuzz / 200);
      score = options.mode === "highlights" ? clamp01((luma - (1 - spread)) / spread)
        : options.mode === "shadows" ? clamp01((spread - luma) / spread)
          : clamp01(1 - Math.abs(luma - 0.5) / (spread * 0.8));
    } else {
      const targetHue = HUE_RANGE_CENTERS[options.mode] ?? 0;
      const [hue, sat] = rgbHueAndSat(r, g, b);
      const diff = Math.min(Math.abs(hue - targetHue), 360 - Math.abs(hue - targetHue));
      score = clamp01(1 - diff / (20 + fuzz * 0.35)) * clamp01(sat * 2);
    }
    mask[i] = clampByte((options.invert ? 1 - score : score) * 255);
  }
  if (options.featherPx && options.featherPx > 0.25) mask = blurByteMaskSeparable(mask, width, height, options.featherPx);
  let selectedPixelCount = 0;
  for (let i = 0; i < total; i += 1) if ((mask[i] ?? 0) >= 128) selectedPixelCount += 1;
  return { width, height, mask, selectedPixelCount };
}

export function refineSelectionMask(
  mask: Uint8Array, width: number, height: number, options: SelectionRefineOptions,
): Uint8Array {
  let current = new Uint8Array(mask);
  const shift = Math.round(options.shiftEdgePx ?? 0);
  if (shift !== 0) {
    const expand = shift > 0;
    for (let s = 0; s < Math.min(8, Math.abs(shift)); s += 1) {
      const next = new Uint8Array(current);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          let acc = current[y * width + x] ?? 0;
          for (let dy = -1; dy <= 1; dy += 1) {
            const ny = Math.max(0, Math.min(height - 1, y + dy));
            for (let dx = -1; dx <= 1; dx += 1) {
              const v = current[ny * width + Math.max(0, Math.min(width - 1, x + dx))] ?? 0;
              acc = expand ? Math.max(acc, v) : Math.min(acc, v);
            }
          }
          next[y * width + x] = acc;
        }
      }
      current = next;
    }
  }
  const totalBlur = (options.smoothPx ?? 0) + (options.featherPx ?? 0);
  if (totalBlur > 0.25) current = blurByteMaskSeparable(current, width, height, totalBlur);
  const contrastPct = Math.max(0, Math.min(100, options.contrastPct ?? 0));
  if (contrastPct > 0) {
    const slope = 1 + (contrastPct / 100) * 6;
    for (let i = 0; i < current.length; i += 1) current[i] = clampByte((((current[i] ?? 0) / 255 - 0.5) * slope + 0.5) * 255);
  }
  return current;
}

export function renderQuickMaskOverlay(
  source: RgbaImageBuffer, selectionMask: Uint8Array, options?: QuickMaskOverlayOptions,
): RgbaImageBuffer {
  const { width, height, data } = source;
  const out = new Uint8ClampedArray(data);
  const tint = options?.overlayColor ?? { r: 224, g: 52, b: 84 };
  const opacity = clamp01(options?.overlayOpacity ?? 0.5);
  const indicatesSelected = options?.maskIndicates === "selected";
  const total = Math.min(width * height, selectionMask.length);
  for (let i = 0; i < total; i += 1) {
    const m01 = (selectionMask[i] ?? 0) / 255;
    const w = (indicatesSelected ? m01 : 1 - m01) * opacity;
    if (w <= 1e-4) continue;
    const off = i * 4;
    out[off] = clampByte((out[off] ?? 0) * (1 - w) + tint.r * w);
    out[off + 1] = clampByte((out[off + 1] ?? 0) * (1 - w) + tint.g * w);
    out[off + 2] = clampByte((out[off + 2] ?? 0) * (1 - w) + tint.b * w);
  }
  return { width, height, data: out };
}
