/**
 * 비파괴 한국어 효과음(SFX) 영역 분리 및 무손실 배경 복원(Clean-Plate Inpainting) 엔진 (Wave 77).
 *
 * 핵심 불변식:
 * 1. 마스크 바깥 픽셀 100% 비트 일치(`mutatedOutsideMaskPixels === 0`).
 * 2. 구조 텐서 기반 이방성 이중조화 확산(`ΔL = 0`, `Δu = L`) + 공선 선화 브리지 + 스크린톤 패치 매칭.
 * 3. 최소 경계 사각형(`bounds`) 비파괴 `CleanPlatePatch` + 원본 한국어 백업으로 무손실 토글 복원 보장.
 */

export interface Point2D { readonly x: number; readonly y: number; }
export interface Rect2D { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
export interface RgbaPanelBuffer { readonly width: number; readonly height: number; readonly data: Uint8ClampedArray; }
export interface SfxMaskExtractionOptions {
  readonly explicitMask?: Uint8Array;
  readonly boundingPolygon?: readonly Point2D[];
  readonly regionRect?: Rect2D;
  readonly alphaThreshold?: number;
  readonly contrastThreshold?: number;
  readonly chromaSaturationMin?: number;
  readonly edgeMagnitudeThreshold?: number;
  readonly dilateRadiusPx?: number;
}
export interface SfxAlphaMaskResult {
  readonly width: number; readonly height: number; readonly alphaMask: Uint8Array; readonly bounds: Rect2D;
  readonly maskedPixelCount: number; readonly sfxCutoutRgba: Uint8ClampedArray; readonly estimatedBackgroundRgb: readonly [number, number, number];
}
export interface CleanPlateInpaintOptions {
  readonly alphaThreshold?: number; readonly maxIterations?: number; readonly convergenceEpsilon?: number;
  readonly contextPaddingPx?: number; readonly enableLineContinuation?: boolean; readonly enableScreentonePatchMatch?: boolean;
  readonly patchRadiusPx?: number; readonly searchRadiusPx?: number; readonly patchIdPrefix?: string;
}
export interface CleanPlateQualityMetrics {
  readonly maskedPixelCount: number; readonly mutatedOutsideMaskPixels: number; readonly iterationsExecuted: number;
  readonly finalResidualDelta: number; readonly detectedLineBridges: number; readonly screentonePatchesApplied: number; readonly boundaryContinuityMae: number;
}
export interface CleanPlatePatch {
  readonly patchId: string; readonly panelWidth: number; readonly panelHeight: number; readonly bounds: Rect2D;
  readonly mask: Uint8Array; readonly restoredRgba: Uint8ClampedArray; readonly originalSfxBackupRgba: Uint8ClampedArray;
  readonly alphaThreshold: number; readonly metrics: CleanPlateQualityMetrics;
}
export interface CleanPlateReconstructionResult {
  readonly restoredPanel: RgbaPanelBuffer; readonly patch: CleanPlatePatch; readonly metrics: CleanPlateQualityMetrics;
}
export interface ReconstructionErrorMetrics {
  readonly comparedPixels: number; readonly diffPixels: number; readonly mae: number;
  readonly rmse: number; readonly psnr: number; readonly maxChannelError: number;
}
interface StructureTensorField { readonly tx: Float32Array; readonly ty: Float32Array; readonly coherence: Float32Array; }
interface LineBridgePrior {
  readonly weight: Float32Array; readonly targetRgb: Float32Array; readonly tangentX: Float32Array; readonly tangentY: Float32Array; readonly bridgeCount: number;
}

const clampByte = (v: number): number => (v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v));
const clampInt = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const lumaAt = (buf: ArrayLike<number>, off: number): number => 0.299 * (buf[off] ?? 0) + 0.587 * (buf[off + 1] ?? 0) + 0.114 * (buf[off + 2] ?? 0);
const copyRgba4 = (dst: Uint8ClampedArray, dstOff: number, src: ArrayLike<number>, srcOff: number): void => {
  for (let c = 0; c < 4; c += 1) dst[dstOff + c] = src[srcOff + c] ?? (c === 3 ? 255 : 0);
};

function validatePanelBuffer(panel: RgbaPanelBuffer): void {
  if (!Number.isInteger(panel.width) || panel.width <= 0 || !Number.isInteger(panel.height) || panel.height <= 0) {
    throw new RangeError(`패널 크기는 양의 정수여야 합니다: ${String(panel.width)}x${String(panel.height)}`);
  }
  const expected = panel.width * panel.height * 4;
  if (panel.data.length !== expected) {
    throw new RangeError(`RGBA 버퍼 길이 불일치(기대 ${String(expected)}, 실제 ${String(panel.data.length)})`);
  }
}

function computeMaskBounds(mask: Uint8Array, w: number, h: number, thr: number): { bounds: Rect2D; count: number } {
  let minX = w, minY = h, maxX = -1, maxY = -1, count = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if ((mask[y * w + x] ?? 0) < thr) continue;
      count += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return { bounds: count === 0 ? { x: 0, y: 0, width: 0, height: 0 } : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 }, count };
}

function isPointInsidePolygon(x: number, y: number, poly: readonly Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const pi = poly[i], pj = poly[j];
    if (pi && pj && (pi.y > y) !== (pj.y > y) && x < ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y + 1e-12) + pi.x) inside = !inside;
  }
  return inside;
}

function computeBoundsFromPolygon(poly: readonly Point2D[], w: number, h: number): Rect2D {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let i = 0; i < poly.length; i += 1) {
    const pt = poly[i];
    if (!pt) continue;
    minX = Math.min(minX, Math.floor(pt.x)); minY = Math.min(minY, Math.floor(pt.y));
    maxX = Math.max(maxX, Math.ceil(pt.x)); maxY = Math.max(maxY, Math.ceil(pt.y));
  }
  const x0 = clampInt(minX, 0, w - 1), y0 = clampInt(minY, 0, h - 1);
  return { x: x0, y: y0, width: clampInt(maxX, x0, w - 1) - x0 + 1, height: clampInt(maxY, y0, h - 1) - y0 + 1 };
}

function dilateBinaryMask(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask;
  const out = new Uint8Array(mask.length);
  const r2 = r * r;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let peak = mask[y * w + x] ?? 0;
      for (let ny = Math.max(0, y - r); peak < 255 && ny <= Math.min(h - 1, y + r); ny += 1) {
        const dy2 = (ny - y) * (ny - y);
        for (let nx = Math.max(0, x - r); nx <= Math.min(w - 1, x + r); nx += 1) {
          if ((nx - x) * (nx - x) + dy2 <= r2) peak = Math.max(peak, mask[ny * w + nx] ?? 0);
        }
      }
      out[y * w + x] = peak;
    }
  }
  return out;
}

function estimatePerimeterBgRgb(panel: RgbaPanelBuffer, roi: Rect2D): readonly [number, number, number] {
  const chs: [number[], number[], number[]] = [[], [], []];
  const x0 = Math.max(0, roi.x - 2), y0 = Math.max(0, roi.y - 2);
  const x1 = Math.min(panel.width - 1, roi.x + roi.width + 1), y1 = Math.min(panel.height - 1, roi.y + roi.height + 1);
  const push = (px: number, py: number): void => {
    const off = (py * panel.width + px) * 4;
    for (let c = 0; c < 3; c += 1) chs[c]?.push(panel.data[off + c] ?? 0);
  };
  for (let x = x0; x <= x1; x += 1) { push(x, y0); push(x, y1); }
  for (let y = y0 + 1; y < y1; y += 1) { push(x0, y); push(x1, y); }
  if (chs[0].length === 0) return [255, 255, 255];
  const med = (arr: number[]): number => { arr.sort((a, b) => a - b); return arr[Math.floor(arr.length / 2)] ?? 255; };
  return [med(chs[0]), med(chs[1]), med(chs[2])];
}

/** 웹툰 패널 RGBA 버퍼에서 한국어 손글씨 효과음(SFX) 알파 마스크와 원본 컷아웃을 분리한다. */
export function extractSfxAlphaMask(panel: RgbaPanelBuffer, options: SfxMaskExtractionOptions = {}): SfxAlphaMaskResult {
  validatePanelBuffer(panel);
  const { width, height, data } = panel;
  const pixelCount = width * height;
  const alphaThr = options.alphaThreshold ?? 127;
  const contrastThr = options.contrastThreshold ?? 46;
  const satMin = options.chromaSaturationMin ?? 0.28;
  const edgeThr = options.edgeMagnitudeThreshold ?? 72;
  const dilateR = Math.max(0, Math.floor(options.dilateRadiusPx ?? 0));

  let rawMask: Uint8Array = new Uint8Array(pixelCount);
  const roi: Rect2D = options.regionRect
    ? { x: clampInt(Math.floor(options.regionRect.x), 0, width - 1), y: clampInt(Math.floor(options.regionRect.y), 0, height - 1), width: clampInt(Math.ceil(options.regionRect.width), 1, width), height: clampInt(Math.ceil(options.regionRect.height), 1, height) }
    : options.boundingPolygon && options.boundingPolygon.length >= 3
      ? computeBoundsFromPolygon(options.boundingPolygon, width, height)
      : { x: 0, y: 0, width, height };

  const bgRgb = estimatePerimeterBgRgb(panel, roi);
  const bgLuma = lumaAt(bgRgb, 0);

  if (options.explicitMask) {
    if (options.explicitMask.length !== pixelCount) throw new RangeError(`명시적 마스크 길이 불일치(기대 ${String(pixelCount)})`);
    for (let i = 0; i < pixelCount; i += 1) {
      const v = options.explicitMask[i] ?? 0;
      rawMask[i] = v >= alphaThr ? 255 : v > 0 && alphaThr <= 1 ? v : 0;
    }
  } else {
    const poly = options.boundingPolygon;
    const x1 = Math.min(width - 1, roi.x + roi.width - 1), y1 = Math.min(height - 1, roi.y + roi.height - 1);
    for (let y = roi.y; y <= y1; y += 1) {
      for (let x = roi.x; x <= x1; x += 1) {
        if (poly && poly.length >= 3 && !isPointInsidePolygon(x + 0.5, y + 0.5, poly)) continue;
        const o = (y * width + x) * 4;
        if ((data[o + 3] ?? 255) < 16) continue;
        const r = data[o] ?? 0, g = data[o + 1] ?? 0, b = data[o + 2] ?? 0;
        const hi = Math.max(r, g, b);
        const sat = hi <= 0 ? 0 : (hi - Math.min(r, g, b)) / hi;
        const dist = Math.hypot(r - bgRgb[0], g - bgRgb[1], b - bgRgb[2]);
        const edge = Math.hypot(
          lumaAt(data, (y * width + Math.min(width - 1, x + 1)) * 4) - lumaAt(data, (y * width + Math.max(0, x - 1)) * 4),
          lumaAt(data, (Math.min(height - 1, y + 1) * width + x) * 4) - lumaAt(data, (Math.max(0, y - 1) * width + x) * 4),
        );
        if ((sat >= satMin && dist >= contrastThr * 0.72) || (dist >= contrastThr && Math.abs(lumaAt(data, o) - bgLuma) >= contrastThr * 0.65) || (edge >= edgeThr && dist >= contrastThr * 0.5)) {
          rawMask[y * width + x] = 255;
        }
      }
    }
  }

  if (dilateR > 0) rawMask = dilateBinaryMask(rawMask, width, height, dilateR);
  const { bounds, count: maskedPixelCount } = computeMaskBounds(rawMask, width, height, 1);
  const cutout = new Uint8ClampedArray(bounds.width * bounds.height * 4);
  for (let ly = 0; ly < bounds.height; ly += 1) {
    for (let lx = 0; lx < bounds.width; lx += 1) {
      const gx = bounds.x + lx, gy = bounds.y + ly;
      const mv = rawMask[gy * width + gx] ?? 0;
      if (mv <= 0) continue;
      const dst = (ly * bounds.width + lx) * 4, src = (gy * width + gx) * 4;
      copyRgba4(cutout, dst, data, src);
      cutout[dst + 3] = Math.round(((data[src + 3] ?? 255) * mv) / 255);
    }
  }
  return { width, height, alphaMask: rawMask, bounds, maskedPixelCount, sfxCutoutRgba: cutout, estimatedBackgroundRgb: bgRgb };
}

function buildStructureTensorField(roiW: number, roiH: number, luma: Float32Array, isMasked: Uint8Array): StructureTensorField {
  const count = roiW * roiH;
  const rawJ = new Float32Array(count * 3);
  const smJ = new Float32Array(count * 3);
  const cleanGrad = new Uint8Array(count);

  for (let y = 1; y < roiH - 1; y += 1) {
    for (let x = 1; x < roiW - 1; x += 1) {
      const i = y * roiW + x;
      if (isMasked[i] === 1) continue;
      const lM = isMasked[i - 1] === 1, rM = isMasked[i + 1] === 1, uM = isMasked[i - roiW] === 1, dM = isMasked[i + roiW] === 1;
      const gx = !lM && !rM ? 0.5 * ((luma[i + 1] ?? 0) - (luma[i - 1] ?? 0)) : !lM ? (luma[i] ?? 0) - (luma[i - 1] ?? 0) : !rM ? (luma[i + 1] ?? 0) - (luma[i] ?? 0) : 0;
      const gy = !uM && !dM ? 0.5 * ((luma[i + roiW] ?? 0) - (luma[i - roiW] ?? 0)) : !uM ? (luma[i] ?? 0) - (luma[i - roiW] ?? 0) : !dM ? (luma[i + roiW] ?? 0) - (luma[i] ?? 0) : 0;
      rawJ[i * 3] = gx * gx; rawJ[i * 3 + 1] = gx * gy; rawJ[i * 3 + 2] = gy * gy;
      if (!lM && !rM && !uM && !dM) cleanGrad[i] = 1;
    }
  }

  // 5x5 가우시안 평활화(순수 내부 기울기 우대)로 수평·수직·대각선 얇은 선화의 접선을 정밀 복원한다.
  for (let y = 1; y < roiH - 1; y += 1) {
    for (let x = 1; x < roiW - 1; x += 1) {
      const i = y * roiW + x;
      if (isMasked[i] === 1) continue;
      let sumW = 0, a0 = 0, a1 = 0, a2 = 0;
      for (let dy = -2; dy <= 2; dy += 1) {
        const ny = y + dy;
        if (ny < 1 || ny >= roiH - 1) continue;
        for (let dx = -2; dx <= 2; dx += 1) {
          const nx = x + dx;
          if (nx < 1 || nx >= roiW - 1) continue;
          const n = ny * roiW + nx;
          if (isMasked[n] === 1) continue;
          const w = Math.exp(-(dx * dx + dy * dy) / 3.2) * (cleanGrad[n] === 1 ? 1.0 : 0.2);
          a0 += w * (rawJ[n * 3] ?? 0); a1 += w * (rawJ[n * 3 + 1] ?? 0); a2 += w * (rawJ[n * 3 + 2] ?? 0);
          sumW += w;
        }
      }
      if (sumW > 0) { smJ[i * 3] = a0 / sumW; smJ[i * 3 + 1] = a1 / sumW; smJ[i * 3 + 2] = a2 / sumW; }
    }
  }

  for (let iter = 0; iter < 32; iter += 1) {
    for (let y = 1; y < roiH - 1; y += 1) {
      for (let x = 1; x < roiW - 1; x += 1) {
        const i = y * roiW + x;
        if (isMasked[i] !== 1) continue;
        for (let c = 0; c < 3; c += 1) {
          smJ[i * 3 + c] = 0.25 * ((smJ[(i - 1) * 3 + c] ?? 0) + (smJ[(i + 1) * 3 + c] ?? 0) + (smJ[(i - roiW) * 3 + c] ?? 0) + (smJ[(i + roiW) * 3 + c] ?? 0));
        }
      }
    }
  }

  const tx = new Float32Array(count), ty = new Float32Array(count), coherence = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const a = smJ[i * 3] ?? 0, b = smJ[i * 3 + 1] ?? 0, c = smJ[i * 3 + 2] ?? 0;
    const tr = a + c, disc = Math.hypot(a - c, 2 * b);
    const l1 = 0.5 * (tr + disc), l2 = Math.max(0, 0.5 * (tr - disc));
    const ang = 0.5 * Math.atan2(2 * b, a - c);
    tx[i] = -Math.sin(ang); ty[i] = Math.cos(ang);
    const coh = tr > 16 ? (l1 - l2) / (l1 + l2 + 1e-6) : 0;
    coherence[i] = coh * coh;
  }
  return { tx, ty, coherence };
}

function hasMaskedNeighbor8(isMasked: Uint8Array, roiW: number, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if ((dx !== 0 || dy !== 0) && isMasked[(y + dy) * roiW + (x + dx)] === 1) return true;
    }
  }
  return false;
}

function traceCollinearLineBridges(
  roiW: number, roiH: number, rgba: Float32Array, luma: Float32Array, isMasked: Uint8Array, tensor: StructureTensorField,
): LineBridgePrior {
  const count = roiW * roiH;
  const weight = new Float32Array(count), accRgb = new Float32Array(count * 3);
  const accTx = new Float32Array(count), accTy = new Float32Array(count);
  const seen = new Set<string>();
  const maxSpan = Math.hypot(roiW, roiH);
  let bridgeCount = 0;

  for (let y = 1; y < roiH - 1; y += 1) {
    for (let x = 1; x < roiW - 1; x += 1) {
      const idx = y * roiW + x;
      const coh = tensor.coherence[idx] ?? 0;
      if (isMasked[idx] === 1 || coh < 0.35 || !hasMaskedNeighbor8(isMasked, roiW, x, y)) continue;

      let kSum = 0, kCnt = 0;
      for (let dy = -2; dy <= 2; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= roiH) continue;
        for (let dx = -2; dx <= 2; dx += 1) {
          const nx = x + dx;
          if (nx >= 0 && nx < roiW && isMasked[ny * roiW + nx] === 0) { kSum += luma[ny * roiW + nx] ?? 0; kCnt += 1; }
        }
      }
      if (kCnt < 3 || Math.abs((luma[idx] ?? 0) - kSum / kCnt) < 22) continue;

      const dirX = tensor.tx[idx] ?? 1, dirY = tensor.ty[idx] ?? 0, sOff = idx * 4;
      for (const sign of [1, -1] as const) {
        const vx = dirX * sign, vy = dirY * sign;
        const traversed: number[] = [];
        let entered = false, exitIdx = -1;
        for (let step = 0.5; step <= maxSpan; step += 0.5) {
          const sx = Math.round(x + vx * step), sy = Math.round(y + vy * step);
          if (sx < 0 || sx >= roiW || sy < 0 || sy >= roiH) break;
          const sIdx = sy * roiW + sx;
          if (sIdx === idx) continue;
          if (isMasked[sIdx] === 1) { entered = true; if (traversed[traversed.length - 1] !== sIdx) traversed.push(sIdx); }
          else if (entered) { exitIdx = sIdx; break; }
          else if (step > 1.6) break;
        }
        if (exitIdx < 0 || traversed.length === 0) continue;

        const ex = exitIdx % roiW, ey = (exitIdx - ex) / roiW;
        let bestExit = -1, bestDist = 48;
        for (let oy = -1; oy <= 1; oy += 1) {
          const cy = ey + oy;
          if (cy < 0 || cy >= roiH) continue;
          for (let ox = -1; ox <= 1; ox += 1) {
            const cx = ex + ox;
            if (cx < 0 || cx >= roiW) continue;
            const cIdx = cy * roiW + cx;
            if (isMasked[cIdx] === 1) continue;
            const cOff = cIdx * 4;
            const dCol = Math.hypot((rgba[cOff] ?? 0) - (rgba[sOff] ?? 0), (rgba[cOff + 1] ?? 0) - (rgba[sOff + 1] ?? 0), (rgba[cOff + 2] ?? 0) - (rgba[sOff + 2] ?? 0));
            const dot = Math.abs(dirX * (tensor.tx[cIdx] ?? 0) + dirY * (tensor.ty[cIdx] ?? 0));
            if (dCol < bestDist && dot >= 0.65) { bestDist = dCol; bestExit = cIdx; }
          }
        }
        if (bestExit < 0) continue;
        const key = idx < bestExit ? `${String(idx)}:${String(bestExit)}` : `${String(bestExit)}:${String(idx)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        bridgeCount += 1;

        const eOff = bestExit * 4, w = 0.5 + 0.5 * Math.min(1, coh * (1 - bestDist / 56));
        for (let t = 0; t < traversed.length; t += 1) {
          const m = traversed[t] ?? 0, f = (t + 1) / (traversed.length + 1);
          weight[m] = (weight[m] ?? 0) + w;
          for (let c = 0; c < 3; c += 1) accRgb[m * 3 + c] = (accRgb[m * 3 + c] ?? 0) + w * ((rgba[sOff + c] ?? 0) * (1 - f) + (rgba[eOff + c] ?? 0) * f);
          accTx[m] = (accTx[m] ?? 0) + w * dirX; accTy[m] = (accTy[m] ?? 0) + w * dirY;
        }
      }
    }
  }

  const targetRgb = new Float32Array(count * 3), tangentX = new Float32Array(count), tangentY = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const w = weight[i] ?? 0;
    if (w <= 0) continue;
    for (let c = 0; c < 3; c += 1) targetRgb[i * 3 + c] = (accRgb[i * 3 + c] ?? 0) / w;
    const norm = Math.hypot(accTx[i] ?? 0, accTy[i] ?? 0);
    if (norm > 1e-6) { tangentX[i] = (accTx[i] ?? 0) / norm; tangentY[i] = (accTy[i] ?? 0) / norm; }
    weight[i] = Math.min(1, w);
  }
  return { weight, targetRgb, tangentX, tangentY, bridgeCount };
}

function diffuseTargetCurvatureRgb(
  roiW: number, roiH: number, rgba: Float32Array, isMasked: Uint8Array, coh: Float32Array, maskIndices: readonly number[],
): Float32Array {
  const count = roiW * roiH;
  const lap = new Float32Array(count * 3), known = new Uint8Array(count);
  for (let y = 1; y < roiH - 1; y += 1) {
    for (let x = 1; x < roiW - 1; x += 1) {
      const i = y * roiW + x;
      if (isMasked[i] === 1 || isMasked[i - 1] === 1 || isMasked[i + 1] === 1 || isMasked[i - roiW] === 1 || isMasked[i + roiW] === 1) continue;
      const sw = Math.max(0, 1 - (coh[i] ?? 0) * 2.5);
      if (sw <= 0.2) continue;
      let maxAbs = 0;
      const tmp = [0, 0, 0];
      for (let c = 0; c < 3; c += 1) {
        const v = (rgba[(i - 1) * 4 + c] ?? 0) + (rgba[(i + 1) * 4 + c] ?? 0) + (rgba[(i - roiW) * 4 + c] ?? 0) + (rgba[(i + roiW) * 4 + c] ?? 0) - 4 * (rgba[i * 4 + c] ?? 0);
        tmp[c] = v * sw; maxAbs = Math.max(maxAbs, Math.abs(v));
      }
      if (maxAbs < 6) { for (let c = 0; c < 3; c += 1) lap[i * 3 + c] = tmp[c] ?? 0; known[i] = 1; }
    }
  }
  for (let iter = 0; iter < 48; iter += 1) {
    for (let k = 0; k < maskIndices.length; k += 1) {
      const i = maskIndices[k] ?? 0, x = i % roiW, y = (i - x) / roiW;
      if (x <= 0 || x >= roiW - 1 || y <= 0 || y >= roiH - 1) continue;
      let cnt = 0, s0 = 0, s1 = 0, s2 = 0;
      for (const n of [i - 1, i + 1, i - roiW, i + roiW]) {
        if (known[n] === 1 || isMasked[n] === 1) { s0 += lap[n * 3] ?? 0; s1 += lap[n * 3 + 1] ?? 0; s2 += lap[n * 3 + 2] ?? 0; cnt += 1; }
      }
      if (cnt > 0) { lap[i * 3] = s0 / cnt; lap[i * 3 + 1] = s1 / cnt; lap[i * 3 + 2] = s2 / cnt; }
    }
  }
  return lap;
}

function applyScreentonePatchMatchRefinement(
  roiW: number, roiH: number, rgba: Float32Array, isMasked: Uint8Array,
  bridge: LineBridgePrior, tensor: StructureTensorField, patchR: number, searchR: number,
): number {
  let hfSum = 0, hfCnt = 0;
  for (let y = 1; y < roiH - 1; y += 1) {
    for (let x = 1; x < roiW - 1; x += 1) {
      const i = y * roiW + x;
      if (isMasked[i] === 1 || (tensor.coherence[i] ?? 0) > 0.65) continue;
      const mL = 0.25 * (lumaAt(rgba, (i - 1) * 4) + lumaAt(rgba, (i + 1) * 4) + lumaAt(rgba, (i - roiW) * 4) + lumaAt(rgba, (i + roiW) * 4));
      hfSum += Math.abs(lumaAt(rgba, i * 4) - mL); hfCnt += 1;
    }
  }
  if (hfCnt === 0 || hfSum / hfCnt < 6) return 0;

  const sources: number[] = [];
  for (let y = patchR; y < roiH - patchR; y += 1) {
    for (let x = patchR; x < roiW - patchR; x += 1) {
      let clean = true;
      for (let dy = -patchR; dy <= patchR && clean; dy += 1) {
        for (let dx = -patchR; dx <= patchR; dx += 1) { if (isMasked[(y + dy) * roiW + (x + dx)] === 1) { clean = false; break; } }
      }
      if (clean) sources.push(y * roiW + x);
    }
  }
  if (sources.length === 0) return 0;

  const filled = new Uint8Array(roiW * roiH);
  for (let i = 0; i < filled.length; i += 1) filled[i] = isMasked[i] === 0 ? 1 : 0;
  let applied = 0;

  for (let pass = 0; pass < Math.max(roiW, roiH); pass += 1) {
    const frontier: number[] = [];
    for (let y = patchR; y < roiH - patchR; y += 1) {
      for (let x = patchR; x < roiW - patchR; x += 1) {
        const i = y * roiW + x;
        if (filled[i] === 1) continue;
        if ((bridge.weight[i] ?? 0) > 0.35) { filled[i] = 1; continue; }
        if (filled[i - 1] === 1 || filled[i + 1] === 1 || filled[i - roiW] === 1 || filled[i + roiW] === 1) frontier.push(i);
      }
    }
    if (frontier.length === 0) break;

    for (let f = 0; f < frontier.length; f += 1) {
      const tIdx = frontier[f] ?? 0, tx = tIdx % roiW, ty = (tIdx - tx) / roiW;
      let bestSrc = -1, bestCost = Number.POSITIVE_INFINITY;
      for (let s = 0; s < sources.length; s += 1) {
        const sIdx = sources[s] ?? 0, sx = sIdx % roiW, sy = (sIdx - sx) / roiW;
        if (Math.abs(sx - tx) > searchR || Math.abs(sy - ty) > searchR) continue;
        let ssd = 0, wTot = 0;
        for (let dy = -patchR; dy <= patchR; dy += 1) {
          for (let dx = -patchR; dx <= patchR; dx += 1) {
            const tP = (ty + dy) * roiW + tx + dx, sP = (sy + dy) * roiW + sx + dx;
            const w = filled[tP] === 1 ? 1.0 : 0.15;
            const d0 = (rgba[tP * 4] ?? 0) - (rgba[sP * 4] ?? 0), d1 = (rgba[tP * 4 + 1] ?? 0) - (rgba[sP * 4 + 1] ?? 0), d2 = (rgba[tP * 4 + 2] ?? 0) - (rgba[sP * 4 + 2] ?? 0);
            ssd += w * (d0 * d0 + d1 * d1 + d2 * d2); wTot += w;
          }
        }
        const cost = wTot > 0 ? ssd / wTot : Number.POSITIVE_INFINITY;
        if (cost < bestCost) { bestCost = cost; bestSrc = sIdx; }
      }
      if (bestSrc >= 0) {
        for (let c = 0; c < 3; c += 1) rgba[tIdx * 4 + c] = rgba[bestSrc * 4 + c] ?? (rgba[tIdx * 4 + c] ?? 0);
        applied += 1;
      }
      filled[tIdx] = 1;
    }
  }
  return applied;
}

/**
 * 효과음(SFX) 뒤에 가려진 웹툰 배경을 비파괴 Clean-Plate 패치로 복원한다.
 * 마스크 바깥 픽셀은 단 1픽셀도 변경하지 않는다(`mutatedOutsideMaskPixels === 0`).
 */
export function reconstructCleanPlateBehindSfx(
  panel: RgbaPanelBuffer, sfxMaskInput: SfxAlphaMaskResult | Uint8Array, options: CleanPlateInpaintOptions = {},
): CleanPlateReconstructionResult {
  validatePanelBuffer(panel);
  const { width, height, data } = panel;
  const alphaMask = sfxMaskInput instanceof Uint8Array ? sfxMaskInput : sfxMaskInput.alphaMask;
  if (alphaMask.length !== width * height) {
    throw new RangeError(`마스크 크기(${String(alphaMask.length)})와 패널 크기(${String(width * height)})가 다릅니다.`);
  }

  const alphaThr = Math.max(1, Math.floor(options.alphaThreshold ?? 1));
  const maxIter = clampInt(Math.floor(options.maxIterations ?? 240), 10, 1200);
  const eps = Math.max(0.005, options.convergenceEpsilon ?? 0.08);
  const pad = clampInt(Math.floor(options.contextPaddingPx ?? 14), 4, 48);
  const patchIdPrefix = options.patchIdPrefix ?? "cleanplate";
  const { bounds, count: maskedPixelCount } = computeMaskBounds(alphaMask, width, height, alphaThr);
  const restoredData = new Uint8ClampedArray(data);

  if (maskedPixelCount === 0) {
    const metrics: CleanPlateQualityMetrics = { maskedPixelCount: 0, mutatedOutsideMaskPixels: 0, iterationsExecuted: 0, finalResidualDelta: 0, detectedLineBridges: 0, screentonePatchesApplied: 0, boundaryContinuityMae: 0 };
    const patch: CleanPlatePatch = { patchId: `${patchIdPrefix}-empty`, panelWidth: width, panelHeight: height, bounds, mask: new Uint8Array(0), restoredRgba: new Uint8ClampedArray(0), originalSfxBackupRgba: new Uint8ClampedArray(0), alphaThreshold: alphaThr, metrics };
    return { restoredPanel: { width, height, data: restoredData }, patch, metrics };
  }

  const roiX0 = Math.max(0, bounds.x - pad), roiY0 = Math.max(0, bounds.y - pad);
  const roiW = Math.min(width - 1, bounds.x + bounds.width - 1 + pad) - roiX0 + 1;
  const roiH = Math.min(height - 1, bounds.y + bounds.height - 1 + pad) - roiY0 + 1;
  const roiCount = roiW * roiH;
  const rgba = new Float32Array(roiCount * 4), luma = new Float32Array(roiCount), isMasked = new Uint8Array(roiCount);
  const maskIndices: number[] = [];
  const bgSum = [0, 0, 0, 0];
  let bgCnt = 0;

  for (let ry = 0; ry < roiH; ry += 1) {
    for (let rx = 0; rx < roiW; rx += 1) {
      const rIdx = ry * roiW + rx, gIdx = (roiY0 + ry) * width + (roiX0 + rx);
      const masked = (alphaMask[gIdx] ?? 0) >= alphaThr;
      isMasked[rIdx] = masked ? 1 : 0;
      for (let c = 0; c < 4; c += 1) {
        const v = data[gIdx * 4 + c] ?? (c === 3 ? 255 : 0);
        rgba[rIdx * 4 + c] = v;
        if (!masked) bgSum[c] = (bgSum[c] ?? 0) + v;
      }
      luma[rIdx] = lumaAt(rgba, rIdx * 4);
      if (masked) maskIndices.push(rIdx); else bgCnt += 1;
    }
  }
  const fb = bgCnt > 0 ? bgSum.map((v) => v / bgCnt) : [255, 255, 255, 255];
  const fbLuma = lumaAt(fb, 0);

  const tensor = buildStructureTensorField(roiW, roiH, luma, isMasked);
  const bridge: LineBridgePrior = (options.enableLineContinuation ?? true)
    ? traceCollinearLineBridges(roiW, roiH, rgba, luma, isMasked, tensor)
    : { weight: new Float32Array(roiCount), targetRgb: new Float32Array(roiCount * 3), tangentX: new Float32Array(roiCount), tangentY: new Float32Array(roiCount), bridgeCount: 0 };

  for (let k = 0; k < maskIndices.length; k += 1) {
    const i = maskIndices[k] ?? 0, onB = (bridge.weight[i] ?? 0) > 0;
    for (let c = 0; c < 3; c += 1) rgba[i * 4 + c] = onB ? (bridge.targetRgb[i * 3 + c] ?? (fb[c] ?? 255)) : (fb[c] ?? 255);
    rgba[i * 4 + 3] = fb[3] ?? 255;
  }

  const lapRgb = diffuseTargetCurvatureRgb(roiW, roiH, rgba, isMasked, tensor.coherence, maskIndices);
  const nbs: readonly (readonly [number, number, number])[] = [[-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1], [-1, -1, 0.35], [1, -1, 0.35], [-1, 1, 0.35], [1, 1, 0.35]];
  let iterationsExecuted = 0, finalResidualDelta = 0;

  for (let iter = 0; iter < maxIter; iter += 1) {
    iterationsExecuted = iter + 1;
    let maxDelta = 0;
    for (let k = 0; k < maskIndices.length; k += 1) {
      const i = maskIndices[k] ?? 0, x = i % roiW, y = (i - x) / roiW;
      const bw = bridge.weight[i] ?? 0, onB = bw > 0.25;
      const txV = onB ? (bridge.tangentX[i] ?? 1) : (tensor.tx[i] ?? 1);
      const tyV = onB ? (bridge.tangentY[i] ?? 0) : (tensor.ty[i] ?? 0);
      const coh = onB ? Math.max(0.88, tensor.coherence[i] ?? 0) : (tensor.coherence[i] ?? 0) * 0.65;
      let wSum = 0;
      const acc = [0, 0, 0, 0];
      for (let n = 0; n < nbs.length; n += 1) {
        const nb = nbs[n];
        if (!nb) continue;
        const nx = x + nb[0], ny = y + nb[1];
        if (nx < 0 || nx >= roiW || ny < 0 || ny >= roiH) continue;
        const nIdx = ny * roiW + nx;
        const inv = nb[0] !== 0 && nb[1] !== 0 ? Math.SQRT1_2 : 1;
        const align = (nb[0] * inv * txV + nb[1] * inv * tyV) ** 2;
        let w = nb[2] * ((1 - coh) + coh * (align + 0.025 * (1 - align)));
        const nbB = (bridge.weight[nIdx] ?? 0) > 0.25 || (isMasked[nIdx] === 0 && (tensor.coherence[nIdx] ?? 0) > 0.45 && Math.abs((luma[nIdx] ?? 0) - fbLuma) > 35);
        if (onB !== nbB) w *= 0.03;
        wSum += w;
        for (let c = 0; c < 4; c += 1) acc[c] = (acc[c] ?? 0) + w * (rgba[nIdx * 4 + c] ?? 0);
      }
      if (wSum <= 1e-8) continue;

      const curv = onB ? 0 : Math.max(0, 1 - coh * 1.6) * 0.25, pull = onB ? 0.35 * bw : 0;
      for (let c = 0; c < 4; c += 1) {
        const oldV = rgba[i * 4 + c] ?? 0;
        let nxt = (acc[c] ?? 0) / wSum - (c < 3 ? curv * (lapRgb[i * 3 + c] ?? 0) : 0);
        if (c < 3 && pull > 0) nxt = nxt * (1 - pull) + (bridge.targetRgb[i * 3 + c] ?? nxt) * pull;
        const upd = Math.max(0, Math.min(255, oldV + 1.32 * (nxt - oldV)));
        rgba[i * 4 + c] = upd;
        if (c < 3) maxDelta = Math.max(maxDelta, Math.abs(upd - oldV));
      }
    }
    finalResidualDelta = maxDelta;
    if (maxDelta < eps) break;
  }

  const screentonePatchesApplied = (options.enableScreentonePatchMatch ?? true)
    ? applyScreentonePatchMatchRefinement(roiW, roiH, rgba, isMasked, bridge, tensor, clampInt(Math.floor(options.patchRadiusPx ?? 2), 1, 4), clampInt(Math.floor(options.searchRadiusPx ?? 10), 4, 24))
    : 0;

  const patchMask = new Uint8Array(bounds.width * bounds.height);
  const patchRestoredRgba = new Uint8ClampedArray(bounds.width * bounds.height * 4);
  const patchBackupRgba = new Uint8ClampedArray(bounds.width * bounds.height * 4);
  for (let ly = 0; ly < bounds.height; ly += 1) {
    const gy = bounds.y + ly;
    for (let lx = 0; lx < bounds.width; lx += 1) {
      const gx = bounds.x + lx, pIdx = ly * bounds.width + lx, gIdx = gy * width + gx;
      const rOff = ((gy - roiY0) * roiW + (gx - roiX0)) * 4;
      copyRgba4(patchBackupRgba, pIdx * 4, data, gIdx * 4);
      const mv = alphaMask[gIdx] ?? 0;
      patchMask[pIdx] = mv;
      if (mv >= alphaThr) {
        for (let c = 0; c < 4; c += 1) {
          const val = clampByte(rgba[rOff + c] ?? (c === 3 ? 255 : 0));
          patchRestoredRgba[pIdx * 4 + c] = val; restoredData[gIdx * 4 + c] = val;
        }
      } else {
        copyRgba4(patchRestoredRgba, pIdx * 4, data, gIdx * 4);
      }
    }
  }

  let mutatedOutsideMaskPixels = 0, seamSum = 0, seamPairs = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const gIdx = y * width + x, gOff = gIdx * 4;
      if ((alphaMask[gIdx] ?? 0) < alphaThr) {
        if (restoredData[gOff] !== data[gOff] || restoredData[gOff + 1] !== data[gOff + 1] || restoredData[gOff + 2] !== data[gOff + 2] || restoredData[gOff + 3] !== data[gOff + 3]) mutatedOutsideMaskPixels += 1;
      } else {
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nIdx = ny * width + nx;
          if ((alphaMask[nIdx] ?? 0) < alphaThr) {
            const nOff = nIdx * 4;
            seamSum += (Math.abs((restoredData[gOff] ?? 0) - (restoredData[nOff] ?? 0)) + Math.abs((restoredData[gOff + 1] ?? 0) - (restoredData[nOff + 1] ?? 0)) + Math.abs((restoredData[gOff + 2] ?? 0) - (restoredData[nOff + 2] ?? 0))) / 3;
            seamPairs += 1;
          }
        }
      }
    }
  }

  const metrics: CleanPlateQualityMetrics = {
    maskedPixelCount, mutatedOutsideMaskPixels, iterationsExecuted,
    finalResidualDelta: Number(finalResidualDelta.toFixed(4)), detectedLineBridges: bridge.bridgeCount,
    screentonePatchesApplied, boundaryContinuityMae: seamPairs > 0 ? Number((seamSum / seamPairs).toFixed(3)) : 0,
  };
  const patch: CleanPlatePatch = {
    patchId: `${patchIdPrefix}-${String(bounds.x)}x${String(bounds.y)}-${String(bounds.width)}x${String(bounds.height)}`,
    panelWidth: width, panelHeight: height, bounds, mask: patchMask, restoredRgba: patchRestoredRgba, originalSfxBackupRgba: patchBackupRgba, alphaThreshold: alphaThr, metrics,
  };
  return { restoredPanel: { width, height, data: restoredData }, patch, metrics };
}

function blitPatchRgba(panel: RgbaPanelBuffer, patch: CleanPlatePatch, slice: Uint8ClampedArray, maskedOnly: boolean): RgbaPanelBuffer {
  validatePanelBuffer(panel);
  if (panel.width !== patch.panelWidth || panel.height !== patch.panelHeight) throw new RangeError("패치와 대상 패널 크기가 일치하지 않습니다.");
  const output = new Uint8ClampedArray(panel.data);
  const { bounds, mask, alphaThreshold } = patch;
  for (let ly = 0; ly < bounds.height; ly += 1) {
    for (let lx = 0; lx < bounds.width; lx += 1) {
      const pIdx = ly * bounds.width + lx;
      if (maskedOnly && (mask[pIdx] ?? 0) < alphaThreshold) continue;
      copyRgba4(output, ((bounds.y + ly) * panel.width + (bounds.x + lx)) * 4, slice, pIdx * 4);
    }
  }
  return { width: panel.width, height: panel.height, data: output };
}

/** 저장된 비파괴 `CleanPlatePatch`를 패널에 다시 적용한다(마스크 바깥 무변경). */
export function applyCleanPlatePatchToPanel(panel: RgbaPanelBuffer, patch: CleanPlatePatch): RgbaPanelBuffer {
  return blitPatchRgba(panel, patch, patch.restoredRgba, true);
}

/** `CleanPlatePatch`의 원본 한국어 백업 슬라이스로 비트 단위 무손실 원복한다. */
export function restoreOriginalSfxFromCleanPlatePatch(cleanPlatePanel: RgbaPanelBuffer, patch: CleanPlatePatch): RgbaPanelBuffer {
  return blitPatchRgba(cleanPlatePanel, patch, patch.originalSfxBackupRgba, false);
}

/** 두 RGBA 패널 간 오차(MAE, RMSE, PSNR, 불일치 픽셀 수)를 측정한다. */
export function measureCleanPlateErrorAgainstGroundTruth(
  candidate: RgbaPanelBuffer, reference: RgbaPanelBuffer, mask?: Uint8Array, alphaThreshold = 1,
): ReconstructionErrorMetrics {
  validatePanelBuffer(candidate);
  validatePanelBuffer(reference);
  if (candidate.width !== reference.width || candidate.height !== reference.height) throw new RangeError("비교할 두 패널의 크기가 일치하지 않습니다.");
  const pixelCount = candidate.width * candidate.height;
  let comparedPixels = 0, diffPixels = 0, absSum = 0, sqSum = 0, maxChannelError = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    if (mask && (mask[i] ?? 0) < alphaThreshold) continue;
    comparedPixels += 1;
    let peak = 0;
    for (let c = 0; c < 4; c += 1) {
      const d = Math.abs((candidate.data[i * 4 + c] ?? 0) - (reference.data[i * 4 + c] ?? 0));
      if (d > peak) peak = d;
      if (c < 3) { absSum += d; sqSum += d * d; }
    }
    if (peak > maxChannelError) maxChannelError = peak;
    if (peak > 0) diffPixels += 1;
  }
  if (comparedPixels === 0) return { comparedPixels: 0, diffPixels: 0, mae: 0, rmse: 0, psnr: Number.POSITIVE_INFINITY, maxChannelError: 0 };
  const channels = comparedPixels * 3, mse = sqSum / channels;
  const psnr = mse === 0 ? Number.POSITIVE_INFINITY : 10 * Math.log10((255 * 255) / mse);
  return {
    comparedPixels, diffPixels, mae: Number((absSum / channels).toFixed(4)), rmse: Number(Math.sqrt(mse).toFixed(4)),
    psnr: Number.isFinite(psnr) ? Number(psnr.toFixed(3)) : Number.POSITIVE_INFINITY, maxChannelError,
  };
}
