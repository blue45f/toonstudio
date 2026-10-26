/**
 * Clip Studio Paint 1.5 잔여 네이티브 Mach-O FilterPlugIn 11종(`GaussBlur`, `MotionBlur`,
 * `RadialBlur`, `UnSharpMask`, `Sharp`/`SharpOff`/`SharpOffStrong`, `Mosaic`, `Pinch`,
 * `TPPChromaticAberration`, `GeometricDistortionFishEye`), `UXEditImageTool.todb` 픽셀 유동화(7모드)
 * 및 수채 경계 v2(`BrushWaterEdgeStyle`), `TGTosPlugIn.cfpi` 톤 밀도 타일링 합성기 구현.
 */

export interface CspGaussBlurOptions {
  readonly radiusPx: number;
}

export interface CspMotionBlurOptions {
  readonly angleDeg: number;
  readonly distancePx: number;
  readonly direction: "both" | "forward" | "backward";
  readonly mode?: "box" | "smooth";
}

export interface CspRadialBlurOptions {
  readonly centerX: number;
  readonly centerY: number;
  readonly strengthPx: number;
  readonly direction: "both" | "outward" | "inward";
  readonly mode?: "box" | "smooth";
}

export interface CspUnSharpMaskOptions {
  readonly radiusPx: number;
  readonly amountPercent: number;
  readonly threshold: number;
}

export interface CspSharpAndBlurMoreOptions {
  readonly mode: "sharp" | "sharp-strong" | "blur" | "blur-more";
}

export interface CspMosaicOptions {
  readonly tileSizePx: number;
}

export interface CspPinchFilterOptions {
  readonly centerX: number;
  readonly centerY: number;
  readonly strength: number; // -100 .. 100
  readonly radiusScale?: number; // 0.1 .. 2.0
  readonly oblateness?: number; // -100 .. 100
  readonly rangeType?: "whole-canvas" | "radius";
}

export interface CspTppChromaticAberrationOptions {
  readonly mode: "radial" | "lateral";
  readonly intensity: number; // -100 .. 100
  readonly centerX?: number;
  readonly centerY?: number;
  readonly angleDeg?: number;
}

export interface CspGeometricDistortionFishEyeOptions {
  readonly distortion: number; // -100 .. 100
  readonly centerX: number;
  readonly centerY: number;
  readonly radiusScale?: number; // 0.1 .. 2.0
  readonly shape?: "circle" | "ellipse";
}

export type CspLiquifyOperationMode = "push" | "expand" | "pinch" | "twirl-cw" | "twirl-ccw" | "restore" | "smooth";

export interface CspLiquifyStrokeDabOptions {
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly radiusPx: number;
  readonly operation: CspLiquifyOperationMode;
  readonly strength: number; // 0 .. 100 (UXEditImageTool default 25)
  readonly hardness: number; // 0 .. 100 (UXEditImageTool Density default 20)
  readonly referDraggedArea?: boolean;
  readonly originalBuffer?: Uint8Array;
}

export interface CspWatercolorEdgeV2Options {
  readonly style: 1 | 2;
  readonly strength: number; // 0 .. 100 (UXEditImageTool default 40)
  readonly vividness: number; // 0 .. 100 (UXEditImageTool default 50)
  readonly radiusPx?: number;
}

export type CspUxSubToolCategory =
  | "navigation" | "pen" | "pencil" | "watercolor" | "thick-paint" | "india-ink"
  | "airbrush" | "blend" | "decoration" | "eraser" | "fill" | "selection"
  | "figure" | "eyedropper" | "text" | "liquify";

export interface CspUxSubToolSpec {
  readonly pwId: number;
  readonly nameKo: string;
  readonly category: CspUxSubToolCategory;
  readonly variantId: number;
  readonly brushSize: number;
  readonly waterEdgeStyle?: number;
  readonly liquifyOperation?: number;
}

export interface CspNativePluginBinarySpec {
  readonly bundleName: string;
  readonly category: "FilterPlugIn" | "FormatPlugIn" | "CorePlugIn" | "Framework";
  readonly primaryClassOrEntry: string;
  readonly exportedSymbolCount: number;
  readonly keySymbols: readonly string[];
}

function clampByte(val: number): number {
  return Math.max(0, Math.min(255, Math.round(val)));
}

function sampleRgbaBilinear(
  src: Uint8Array,
  width: number,
  height: number,
  fx: number,
  fy: number,
): readonly [number, number, number, number] {
  const cx = Math.max(0, Math.min(width - 1, fx));
  const cy = Math.max(0, Math.min(height - 1, fy));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = cx - x0;
  const ty = cy - y0;

  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;

  const bilerp = (c: number): number => {
    const v00 = src[i00 + c] ?? 0;
    const v10 = src[i10 + c] ?? 0;
    const v01 = src[i01 + c] ?? 0;
    const v11 = src[i11 + c] ?? 0;
    const top = v00 + (v10 - v00) * tx;
    const bot = v01 + (v11 - v01) * tx;
    return top + (bot - top) * ty;
  };

  return [bilerp(0), bilerp(1), bilerp(2), bilerp(3)];
}

/**
 * 1. `GaussBlur.bundle` (`PIGaussBlurFilter::BlurHorz8` `0x1b5c`, `BlurVert8` `0x23c0`)
 * 분리형 1D 수평/수직 가우시안 블러.
 */
export function applyCspGaussBlurFilter(
  src: Uint8Array,
  width: number,
  height: number,
  options: CspGaussBlurOptions,
): Uint8Array {
  const radius = Math.max(0, Math.min(64, options.radiusPx));
  if (radius <= 0.05) {
    return new Uint8Array(src);
  }
  const halfSize = Math.max(1, Math.ceil(radius * 2.5));
  const sigma = Math.max(0.3, radius * 0.5);
  const twoSigmaSq = 2 * sigma * sigma;
  const kernel = new Float64Array(halfSize * 2 + 1);
  let kSum = 0;
  for (let i = -halfSize; i <= halfSize; i++) {
    const w = Math.exp(-(i * i) / twoSigmaSq);
    kernel[i + halfSize] = w;
    kSum += w;
  }
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] = (kernel[i] ?? 0) / kSum;
  }

  const run1DPass = (input: Uint8Array, horizontal: boolean): Uint8Array => {
    const dstBuf = new Uint8Array(input.byteLength);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let r = 0, g = 0, b = 0, a = 0, wAlphaSum = 0;
        for (let k = -halfSize; k <= halfSize; k++) {
          const sx = horizontal ? Math.max(0, Math.min(width - 1, x + k)) : x;
          const sy = horizontal ? y : Math.max(0, Math.min(height - 1, y + k));
          const idx = (sy * width + sx) * 4;
          const kw = kernel[k + halfSize] ?? 0;
          const sa = input[idx + 3] ?? 0;
          const aw = kw * (sa / 255);
          r += (input[idx] ?? 0) * aw;
          g += (input[idx + 1] ?? 0) * aw;
          b += (input[idx + 2] ?? 0) * aw;
          a += sa * kw;
          wAlphaSum += aw;
        }
        const dst = (y * width + x) * 4;
        if (wAlphaSum > 1e-6) {
          dstBuf[dst] = clampByte(r / wAlphaSum);
          dstBuf[dst + 1] = clampByte(g / wAlphaSum);
          dstBuf[dst + 2] = clampByte(b / wAlphaSum);
        }
        dstBuf[dst + 3] = clampByte(a);
      }
    }
    return dstBuf;
  };

  return run1DPass(run1DPass(src, true), false);
}

/**
 * 2. `MotionBlur.bundle` (`PIMotionBlurFilter::DoMotionBlur` `0x1888`, `ScanXMain`/`ScanSoftXMain`)
 */
export function applyCspMotionBlurFilter(
  src: Uint8Array,
  width: number,
  height: number,
  options: CspMotionBlurOptions,
): Uint8Array {
  const out = new Uint8Array(src.byteLength);
  const rad = (options.angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const dist = Math.max(1, Math.min(200, Math.round(options.distancePx)));
  const startStep = options.direction === "forward" ? 0 : -dist;
  const endStep = options.direction === "backward" ? 0 : dist;
  const smooth = (options.mode ?? "smooth") === "smooth";

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let wSum = 0;
      let awSum = 0;

      for (let s = startStep; s <= endStep; s++) {
        const weight = smooth ? Math.max(0.05, 1 - Math.abs(s) / (dist + 1)) : 1;
        const [sr, sg, sb, sa] = sampleRgbaBilinear(src, width, height, x + dx * s, y + dy * s);
        const aw = weight * (sa / 255);
        r += sr * aw;
        g += sg * aw;
        b += sb * aw;
        a += sa * weight;
        wSum += weight;
        awSum += aw;
      }

      const dst = (y * width + x) * 4;
      if (awSum > 1e-6) {
        out[dst] = clampByte(r / awSum);
        out[dst + 1] = clampByte(g / awSum);
        out[dst + 2] = clampByte(b / awSum);
      }
      out[dst + 3] = clampByte(wSum > 0 ? a / wSum : 0);
    }
  }
  return out;
}

/**
 * 3. `RadialBlur.bundle` (`PIRadialBlurFilter::CalcNeededBound` `0x26bc`, `AverageWeightedAlphaAndImages` `0x35cc`)
 */
export function applyCspRadialBlurFilter(
  src: Uint8Array,
  width: number,
  height: number,
  options: CspRadialBlurOptions,
): Uint8Array {
  const out = new Uint8Array(src.byteLength);
  const maxDim = Math.max(1, Math.hypot(width, height) * 0.5);
  const steps = 9;
  const startIdx = options.direction === "outward" ? 0 : -steps;
  const endIdx = options.direction === "inward" ? 0 : steps;
  const smooth = (options.mode ?? "smooth") === "smooth";

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const vx = x - options.centerX;
      const vy = y - options.centerY;
      const rNorm = Math.hypot(vx, vy) / maxDim;
      const maxShift = options.strengthPx * rNorm;
      const len = Math.max(1e-6, Math.hypot(vx, vy));
      const ux = vx / len;
      const uy = vy / len;

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let wSum = 0;
      let awSum = 0;

      for (let i = startIdx; i <= endIdx; i++) {
        const t = i / steps;
        const weight = smooth ? Math.max(0.05, 1 - Math.abs(t) * 0.75) : 1;
        const [sr, sg, sb, sa] = sampleRgbaBilinear(
          src,
          width,
          height,
          x + ux * maxShift * t,
          y + uy * maxShift * t,
        );
        const aw = weight * (sa / 255);
        r += sr * aw;
        g += sg * aw;
        b += sb * aw;
        a += sa * weight;
        wSum += weight;
        awSum += aw;
      }

      const dst = (y * width + x) * 4;
      if (awSum > 1e-6) {
        out[dst] = clampByte(r / awSum);
        out[dst + 1] = clampByte(g / awSum);
        out[dst + 2] = clampByte(b / awSum);
      }
      out[dst + 3] = clampByte(wSum > 0 ? a / wSum : 0);
    }
  }
  return out;
}

/**
 * 4. `UnSharpMask.bundle` (`PIUnSharpMaskFilter::DoUnSharp8WithMask` `0x2c4c`)
 */
export function applyCspUnSharpMaskFilter(
  src: Uint8Array,
  width: number,
  height: number,
  options: CspUnSharpMaskOptions,
): Uint8Array {
  const blurred = applyCspGaussBlurFilter(src, width, height, { radiusPx: options.radiusPx });
  const out = new Uint8Array(src.byteLength);
  const scale = Math.max(0, options.amountPercent) / 100;
  const threshold = Math.max(0, options.threshold);

  for (let i = 0; i < src.byteLength; i += 4) {
    for (let c = 0; c < 3; c++) {
      const orig = src[i + c] ?? 0;
      const blurVal = blurred[i + c] ?? 0;
      const diff = orig - blurVal;
      out[i + c] = Math.abs(diff) >= threshold ? clampByte(orig + diff * scale) : orig;
    }
    out[i + 3] = src[i + 3] ?? 0;
  }
  return out;
}

/**
 * 5. `Sharp.bundle`, `SharpOff.bundle`, `SharpOffStrong.bundle` (`PISharpFilter::DoSharp8` `0x1464`, `TPSharpOff` `0x1d98`)
 */
export function applyCspSharpAndBlurMoreFilter(
  src: Uint8Array,
  width: number,
  height: number,
  options: CspSharpAndBlurMoreOptions,
): Uint8Array {
  if (options.mode === "blur") {
    return applyCspGaussBlurFilter(src, width, height, { radiusPx: 1.0 });
  }
  if (options.mode === "blur-more") {
    return applyCspGaussBlurFilter(src, width, height, { radiusPx: 2.2 });
  }
  const amount = options.mode === "sharp-strong" ? 140 : 65;
  return applyCspUnSharpMaskFilter(src, width, height, {
    radiusPx: 1.0,
    amountPercent: amount,
    threshold: 0,
  });
}

/**
 * 6. `Mosaic.bundle` (`PIMosaicFilterTable::MakeTable` `0x0978`, `UpdateRGBA` `0x06a8`, `BlockExecuteFilterRGBA` `0x1b90`)
 */
export function applyCspMosaicFilter(
  src: Uint8Array,
  width: number,
  height: number,
  options: CspMosaicOptions,
): Uint8Array {
  const tile = Math.max(2, Math.min(256, Math.round(options.tileSizePx)));
  const out = new Uint8Array(src.byteLength);

  for (let by = 0; by < height; by += tile) {
    for (let bx = 0; bx < width; bx += tile) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;
      let awSum = 0;
      let count = 0;

      const yEnd = Math.min(height, by + tile);
      const xEnd = Math.min(width, bx + tile);
      for (let y = by; y < yEnd; y++) {
        for (let x = bx; x < xEnd; x++) {
          const idx = (y * width + x) * 4;
          const sa = src[idx + 3] ?? 0;
          const aw = sa / 255;
          rSum += (src[idx] ?? 0) * aw;
          gSum += (src[idx + 1] ?? 0) * aw;
          bSum += (src[idx + 2] ?? 0) * aw;
          aSum += sa;
          awSum += aw;
          count++;
        }
      }

      const avgR = awSum > 1e-6 ? clampByte(rSum / awSum) : 0;
      const avgG = awSum > 1e-6 ? clampByte(gSum / awSum) : 0;
      const avgB = awSum > 1e-6 ? clampByte(bSum / awSum) : 0;
      const avgA = count > 0 ? clampByte(aSum / count) : 0;

      for (let y = by; y < yEnd; y++) {
        for (let x = bx; x < xEnd; x++) {
          const dst = (y * width + x) * 4;
          out[dst] = avgR;
          out[dst + 1] = avgG;
          out[dst + 2] = avgB;
          out[dst + 3] = avgA;
        }
      }
    }
  }
  return out;
}

/**
 * 7. `Pinch.bundle` (`PIPinchFilter::DoPinch` `0x093c`)
 */
export function applyCspPinchFilter(
  src: Uint8Array,
  width: number,
  height: number,
  options: CspPinchFilterOptions,
): Uint8Array {
  const out = new Uint8Array(src.byteLength);
  const radiusScale = Math.max(0.1, options.radiusScale ?? 1.0);
  const oblateness = Math.max(-100, Math.min(100, options.oblateness ?? 0)) / 100;
  const rx = Math.max(1, (width * 0.5) * radiusScale * (oblateness < 0 ? 1 + oblateness * 0.5 : 1));
  const ry = Math.max(1, (height * 0.5) * radiusScale * (oblateness > 0 ? 1 - oblateness * 0.5 : 1));
  const k = Math.max(-1, Math.min(1, options.strength / 100));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x - options.centerX) / rx;
      const ny = (y - options.centerY) / ry;
      const d = Math.hypot(nx, ny);
      let sx = x;
      let sy = y;

      if (d > 1e-6 && (d < 1 || options.rangeType === "whole-canvas")) {
        const clampedD = Math.min(1, d);
        const factor = Math.sin((Math.PI * 0.5) * clampedD);
        const mappedD = k >= 0 ? d * Math.pow(factor / clampedD, k * 1.5) : d * Math.pow(clampedD / Math.max(1e-4, factor), -k * 1.2);
        const ratio = mappedD / d;
        sx = options.centerX + (x - options.centerX) * ratio;
        sy = options.centerY + (y - options.centerY) * ratio;
      }

      const [r, g, b, a] = sampleRgbaBilinear(src, width, height, sx, sy);
      const dst = (y * width + x) * 4;
      out[dst] = clampByte(r);
      out[dst + 1] = clampByte(g);
      out[dst + 2] = clampByte(b);
      out[dst + 3] = clampByte(a);
    }
  }
  return out;
}

/**
 * 8. `TPPChromaticAberration.bundle` (`TriglavPlugIn::TPPChromaticAberration::Processor::ExecutePrivate` `0x1a30`)
 */
export function applyCspTppChromaticAberrationFilter(
  src: Uint8Array,
  width: number,
  height: number,
  options: CspTppChromaticAberrationOptions,
): Uint8Array {
  const out = new Uint8Array(src.byteLength);
  const cx = options.centerX ?? width * 0.5;
  const cy = options.centerY ?? height * 0.5;
  const rad = ((options.angleDeg ?? 0) * Math.PI) / 180;
  const shiftScale = options.intensity * 0.12;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let dx: number;
      let dy: number;
      if (options.mode === "lateral") {
        dx = Math.cos(rad) * shiftScale;
        dy = Math.sin(rad) * shiftScale;
      } else {
        const vx = x - cx;
        const vy = y - cy;
        const norm = Math.max(1, Math.hypot(width, height) * 0.5);
        dx = (vx / norm) * shiftScale;
        dy = (vy / norm) * shiftScale;
      }

      const [rVal, , , rAlpha] = sampleRgbaBilinear(src, width, height, x + dx, y + dy);
      const [, gVal, , gAlpha] = sampleRgbaBilinear(src, width, height, x, y);
      const [, , bVal, bAlpha] = sampleRgbaBilinear(src, width, height, x - dx, y - dy);

      const dst = (y * width + x) * 4;
      out[dst] = clampByte(rVal);
      out[dst + 1] = clampByte(gVal);
      out[dst + 2] = clampByte(bVal);
      out[dst + 3] = clampByte((rAlpha + gAlpha + bAlpha) / 3);
    }
  }
  return out;
}

/**
 * 9. `GeometricDistortionFishEye.bundle` (`PIGeomteircDistortionFishEyeFilter::CorrespondPixel` `0x227c`, `ExecuteFilter` `0x1e0c`)
 */
export function applyCspGeometricDistortionFishEyeFilter(
  src: Uint8Array,
  width: number,
  height: number,
  options: CspGeometricDistortionFishEyeOptions,
): Uint8Array {
  const out = new Uint8Array(src.byteLength);
  const radiusScale = Math.max(0.1, options.radiusScale ?? 1.0);
  const rx = Math.max(1, (options.shape === "circle" ? Math.min(width, height) : width) * 0.5 * radiusScale);
  const ry = Math.max(1, (options.shape === "circle" ? Math.min(width, height) : height) * 0.5 * radiusScale);
  const k = Math.max(-0.98, Math.min(0.98, options.distortion / 100));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (x - options.centerX) / rx;
      const ny = (y - options.centerY) / ry;
      const r = Math.hypot(nx, ny);
      let sx = x;
      let sy = y;

      if (r > 1e-6 && r <= 1.0) {
        let mappedR = r;
        if (k > 0) {
          const theta = Math.asin(Math.min(1, r * Math.sin(k * (Math.PI * 0.48))));
          mappedR = theta / Math.max(1e-5, k * (Math.PI * 0.48));
        } else if (k < 0) {
          const absK = -k * (Math.PI * 0.48);
          mappedR = Math.sin(r * absK) / Math.max(1e-5, Math.sin(absK));
        }
        const scale = mappedR / r;
        sx = options.centerX + (x - options.centerX) * scale;
        sy = options.centerY + (y - options.centerY) * scale;
      }

      const [rv, gv, bv, av] = sampleRgbaBilinear(src, width, height, sx, sy);
      const dst = (y * width + x) * 4;
      out[dst] = clampByte(rv);
      out[dst + 1] = clampByte(gv);
      out[dst + 2] = clampByte(bv);
      out[dst + 3] = clampByte(av);
    }
  }
  return out;
}

/**
 * 10. `UXEditImageTool.todb` 픽셀 유동화(`#134 픽셀 유동화`, `LiquifyOperation` 7모드) 엔진.
 */
export function applyCspLiquifyStrokeDab(
  src: Uint8Array,
  width: number,
  height: number,
  options: CspLiquifyStrokeDabOptions,
): Uint8Array {
  const out = new Uint8Array(src);
  const radius = Math.max(2, options.radiusPx);
  const strengthNorm = Math.max(0, Math.min(100, options.strength)) / 100;
  const hardnessNorm = Math.max(0, Math.min(100, options.hardness)) / 100;
  const moveX = options.toX - options.fromX;
  const moveY = options.toY - options.fromY;

  const minX = Math.max(0, Math.floor(options.toX - radius));
  const maxX = Math.min(width - 1, Math.ceil(options.toX + radius));
  const minY = Math.max(0, Math.floor(options.toY - radius));
  const maxY = Math.min(height - 1, Math.ceil(options.toY + radius));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x - options.toX;
      const dy = y - options.toY;
      const dist = Math.hypot(dx, dy);
      if (dist >= radius) continue;

      const u = dist / radius;
      const falloff = Math.pow(1 - u * u, 2 - hardnessNorm * 1.2) * strengthNorm;
      const dstIdx = (y * width + x) * 4;

      if (options.operation === "restore" && options.originalBuffer) {
        for (let c = 0; c < 4; c++) {
          const cur = src[dstIdx + c] ?? 0;
          const orig = options.originalBuffer[dstIdx + c] ?? 0;
          out[dstIdx + c] = clampByte(cur + (orig - cur) * falloff);
        }
        continue;
      }

      if (options.operation === "smooth") {
        const [sr, sg, sb, sa] = sampleRgbaBilinear(src, width, height, x + 0.5, y + 0.5);
        out[dstIdx] = clampByte((src[dstIdx] ?? 0) * (1 - falloff) + sr * falloff);
        out[dstIdx + 1] = clampByte((src[dstIdx + 1] ?? 0) * (1 - falloff) + sg * falloff);
        out[dstIdx + 2] = clampByte((src[dstIdx + 2] ?? 0) * (1 - falloff) + sb * falloff);
        out[dstIdx + 3] = clampByte((src[dstIdx + 3] ?? 0) * (1 - falloff) + sa * falloff);
        continue;
      }

      let sx = x;
      let sy = y;
      if (options.operation === "push") {
        sx = x - moveX * falloff;
        sy = y - moveY * falloff;
      } else if (options.operation === "expand") {
        sx = x - dx * falloff * 0.65;
        sy = y - dy * falloff * 0.65;
      } else if (options.operation === "pinch") {
        sx = x + dx * falloff * 0.65;
        sy = y + dy * falloff * 0.65;
      } else if (options.operation === "twirl-cw" || options.operation === "twirl-ccw") {
        const sign = options.operation === "twirl-cw" ? -1 : 1;
        const theta = sign * falloff * (Math.PI * 0.6);
        const cosT = Math.cos(theta);
        const sinT = Math.sin(theta);
        sx = options.toX + dx * cosT - dy * sinT;
        sy = options.toY + dx * sinT + dy * cosT;
      }

      const [r, g, b, a] = sampleRgbaBilinear(src, width, height, sx, sy);
      out[dstIdx] = clampByte(r);
      out[dstIdx + 1] = clampByte(g);
      out[dstIdx + 2] = clampByte(b);
      out[dstIdx + 3] = clampByte(a);
    }
  }
  return out;
}

/**
 * 11. `UXEditImageTool.todb` 수채 경계 v2 (`BrushWaterEdgeStyle`, `BrushWaterEdgeStrength`, `BrushWaterEdgeVividness`)
 */
export function applyCspWatercolorEdgeV2PostProcess(
  src: Uint8Array,
  width: number,
  height: number,
  options: CspWatercolorEdgeV2Options,
): Uint8Array {
  const out = new Uint8Array(src);
  const strength = Math.max(0, Math.min(100, options.strength)) / 100;
  const vividness = Math.max(0, Math.min(100, options.vividness)) / 100;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const a = src[idx + 3] ?? 0;
      if (a === 0) continue;

      const aL = src[(y * width + (x - 1)) * 4 + 3] ?? 0;
      const aR = src[(y * width + (x + 1)) * 4 + 3] ?? 0;
      const aU = src[((y - 1) * width + x) * 4 + 3] ?? 0;
      const aD = src[((y + 1) * width + x) * 4 + 3] ?? 0;
      const minNeighborA = Math.min(aL, aR, aU, aD);
      const edgeDelta = Math.max(0, (a - minNeighborA) / 255);
      if (edgeDelta <= 0.02) continue;

      const rimWeight = edgeDelta * strength * (options.style === 2 ? 1.25 : 0.9);
      const r = src[idx] ?? 0;
      const g = src[idx + 1] ?? 0;
      const b = src[idx + 2] ?? 0;
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      const darken = 1 - rimWeight * 0.45;
      const satBoost = 1 + vividness * rimWeight * 0.8;

      out[idx] = clampByte((luma + (r - luma) * satBoost) * darken);
      out[idx + 1] = clampByte((luma + (g - luma) * satBoost) * darken);
      out[idx + 2] = clampByte((luma + (b - luma) * satBoost) * darken);
    }
  }
  return out;
}

/**
 * 12. `TGTosPlugIn.cfpi` (`_CatFilterLookUpTable`, `_CopyTempToDensityTilingData`, `_Erase8Bit025_1bit`)
 * 톤 밀도 타일링 및 1비트/8비트 임계 마스킹 합성기.
 */
export function applyCspTgTosDensityTilingComposite(
  src: Uint8Array,
  tilePattern8Bit: Uint8Array,
  tileSize: number,
  width: number,
  height: number,
  options: { readonly densityPercent: number; readonly binarize1Bit?: boolean },
): Uint8Array {
  const out = new Uint8Array(src);
  const densityScale = Math.max(0, Math.min(100, options.densityPercent)) / 100;
  const safeTileSize = Math.max(1, tileSize);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const tx = x % safeTileSize;
      const ty = y % safeTileSize;
      const threshold = tilePattern8Bit[ty * safeTileSize + tx] ?? 128;
      const effectiveDensity = (src[idx + 3] ?? 0) * densityScale;
      if (options.binarize1Bit) {
        out[idx + 3] = effectiveDensity >= threshold ? 255 : 0;
      } else {
        out[idx + 3] = clampByte((effectiveDensity * (255 - threshold * 0.5)) / 255);
      }
    }
  }
  return out;
}

/**
 * `/Applications/CLIP STUDIO 1.5/App/Settings/PAINT/Tool/korean/UXEditImageTool.todb` (`_PW_ID 1..141`) 서브툴 카탈로그.
 */
export const CSP_UX_EDIT_IMAGE_TOOL_CATALOG: readonly CspUxSubToolSpec[] = [
  { pwId: 6, nameKo: "G펜", category: "pen", variantId: 39, brushSize: 5.0 },
  { pwId: 7, nameKo: "둥근 펜", category: "pen", variantId: 53, brushSize: 3.0 },
  { pwId: 18, nameKo: "연필", category: "pencil", variantId: 65, brushSize: 10.0 },
  { pwId: 31, nameKo: "수채 평붓", category: "watercolor", variantId: 87, brushSize: 100.0, waterEdgeStyle: 1 },
  { pwId: 32, nameKo: "수채 번짐", category: "watercolor", variantId: 89, brushSize: 120.0 },
  { pwId: 39, nameKo: "불투명 수채", category: "thick-paint", variantId: 101, brushSize: 70.0 },
  { pwId: 40, nameKo: "유화", category: "thick-paint", variantId: 103, brushSize: 40.0 },
  { pwId: 44, nameKo: "붓펜", category: "india-ink", variantId: 109, brushSize: 20.0 },
  { pwId: 49, nameKo: "부드러움(에어브러시)", category: "airbrush", variantId: 117, brushSize: 150.0 },
  { pwId: 55, nameKo: "색 섞기", category: "blend", variantId: 127, brushSize: 70.0 },
  { pwId: 62, nameKo: "반짝임", category: "decoration", variantId: 139, brushSize: 70.0 },
  { pwId: 63, nameKo: "핏자국", category: "decoration", variantId: 141, brushSize: 200.0 },
  { pwId: 67, nameKo: "깃털", category: "decoration", variantId: 149, brushSize: 150.0 },
  { pwId: 70, nameKo: "벚꽃", category: "decoration", variantId: 155, brushSize: 100.0 },
  { pwId: 82, nameKo: "레이스", category: "decoration", variantId: 171, brushSize: 60.0 },
  { pwId: 85, nameKo: "체인", category: "decoration", variantId: 177, brushSize: 35.0 },
  { pwId: 87, nameKo: "지퍼", category: "decoration", variantId: 181, brushSize: 40.0 },
  { pwId: 100, nameKo: "그물망(톤 깎기용)", category: "decoration", variantId: 207, brushSize: 150.0 },
  { pwId: 110, nameKo: "딱딱함(지우개)", category: "eraser", variantId: 225, brushSize: 20.0 },
  { pwId: 116, nameKo: "전체 레이어 참조(채우기)", category: "fill", variantId: 12, brushSize: 1.0 },
  { pwId: 119, nameKo: "직사각형 선택", category: "selection", variantId: 14, brushSize: 1.0 },
  { pwId: 125, nameKo: "연속 곡선", category: "figure", variantId: 19, brushSize: 5.0 },
  { pwId: 130, nameKo: "표시색 추출", category: "eyedropper", variantId: 24, brushSize: 1.0 },
  { pwId: 132, nameKo: "텍스트", category: "text", variantId: 26, brushSize: 1.0 },
  { pwId: 134, nameKo: "픽셀 유동화", category: "liquify", variantId: 247, brushSize: 120.0, liquifyOperation: 0 },
  { pwId: 135, nameKo: "리얼 G 펜", category: "pen", variantId: 249, brushSize: 10.0 },
  { pwId: 136, nameKo: "거친 수채", category: "watercolor", variantId: 251, brushSize: 150.0 },
  { pwId: 137, nameKo: "드라이 구아슈", category: "thick-paint", variantId: 253, brushSize: 80.0 },
  { pwId: 138, nameKo: "반죽 지우개", category: "eraser", variantId: 255, brushSize: 50.0 },
  { pwId: 139, nameKo: "질감이 남게 섞기", category: "blend", variantId: 257, brushSize: 100.0 },
  { pwId: 140, nameKo: "거칠고 딱딱한 펜", category: "pen", variantId: 259, brushSize: 1.2 },
  { pwId: 141, nameKo: "속도 조절 지우개", category: "eraser", variantId: 261, brushSize: 20.0 },
] as const;

/**
 * Clip Studio Paint 1.5 코어 플러그인·포맷 번들·프레임워크 바이너리 매니페스트.
 */
export const CSP_NATIVE_PLUGIN_BINARY_MANIFEST: readonly CspNativePluginBinarySpec[] = [
  { bundleName: "TGTosPlugIn.cfpi", category: "CorePlugIn", primaryClassOrEntry: "_FPWFilePlugInEntryPoint", exportedSymbolCount: 7785, keySymbols: ["_Blend", "_BlendCore", "_CatFilterLookUpTable", "_CopyTempToDensityTilingData", "_CreateRGBMosaicTable", "_Erase8Bit025_1bit"] },
  { bundleName: "TGXpgPlugIn.cfpi", category: "CorePlugIn", primaryClassOrEntry: "_TriglavPlugInMain", exportedSymbolCount: 7777, keySymbols: ["_BlendCore", "_CatFilterLookUpTable", "_CopyTempToDensityTilingData"] },
  { bundleName: "ExportPSD.bundle / ImportPSD.bundle", category: "FormatPlugIn", primaryClassOrEntry: "_FPSCreateLayer / _FPSClosePSD", exportedSymbolCount: 164, keySymbols: ["_FPSCreateLayer", "_FPSCreateLayerSection", "_FPSGetLayerAdjustmentCurves", "_FPSGetLayerAdjustmentGradientMap"] },
  { bundleName: "ExportPDFX.bundle / ImportPDFX.bundle", category: "FormatPlugIn", primaryClassOrEntry: "Triglav::PlugIn::ExportPDFX::RunProcess", exportedSymbolCount: 82, keySymbols: ["PDF::Impl::SetDirection", "PDF::Impl::SetPageLayout", "WriteDictionaryHeader", "WriteObjectRef"] },
  { bundleName: "libosqp.dylib", category: "Framework", primaryClassOrEntry: "osqp_setup / osqp_solve", exportedSymbolCount: 48, keySymbols: ["osqp_setup", "osqp_solve", "osqp_update_lin_cost"] },
  { bundleName: "libailia.dylib", category: "Framework", primaryClassOrEntry: "ailiaCreate / ailiaPredict", exportedSymbolCount: 64, keySymbols: ["ailiaCreate", "ailiaOpenWeightFileA", "ailiaPredict"] },
] as const;
