/**
 * Wave-63: WebGPU WGSL FSR 1 (12-tap EASU + 5-tap RCAS) + 이중 해상도(Split-Resolution)
 * 페인트/3D 업스케일 및 100% 네이티브 2D 선화 무손실 합성 파이프라인.
 */

export {
  FSR_EASU_WGSL,
  FSR_RCAS_WGSL,
  SPLIT_RES_NATIVE_LINEART_COMPOSITE_WGSL,
} from "./webgpu-wgsl-shaders";

/** RGBA8 픽셀 버퍼 표현. */
export interface RgbaImageBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** FSR EASU 업스케일 옵션. */
export interface FsrEasuOptions {
  /** 에지 방향성 이방성 스트레치 강도 (`0` = 등방 Lanczos2, `1` = 표준 EASU 방향성). */
  readonly edgeDirectionality?: number;
  /** 음의 로브 샤프닝 계수 (`0.5 ~ 1.0`, 기본 `1.0`). */
  readonly negativeLobeStrength?: number;
}

/** FSR EASU 업스케일 결과. */
export interface FsrEasuResult {
  readonly image: RgbaImageBuffer;
  readonly scaleFactorX: number;
  readonly scaleFactorY: number;
  readonly tapCountPerPixel: 12;
  readonly antiRingingClampedPixels: number;
}

/** FSR RCAS 대비 적응 샤프닝 옵션. */
export interface FsrRcasOptions {
  /** 샤프닝 강도 (`0` = 원본 유지, `1` = 최대 안전 샤프닝, 기본 `0.8`). */
  readonly sharpness?: number;
  /** 저대비 미세 노이즈 증폭 억제 여부 (기본 `true`). */
  readonly denoise?: boolean;
}

/** FSR RCAS 샤프닝 결과 및 링잉 방지 계측. */
export interface FsrRcasResult {
  readonly image: RgbaImageBuffer;
  readonly tapCountPerPixel: 5;
  readonly effectiveSharpness: number;
  readonly clampedHaloPreventedPixels: number;
  readonly maxChannelOvershoot: number;
}

/** 이중 해상도(Split-Res) 페인트 + 100% 네이티브 2D 선화 합성 입력. */
export interface SplitResCompositeInput {
  readonly lowResPaint: RgbaImageBuffer;
  readonly nativeLineart: RgbaImageBuffer;
  readonly enableRcas?: boolean;
  readonly easuOptions?: FsrEasuOptions;
  readonly rcasOptions?: FsrRcasOptions;
}

/** 이중 해상도 합성 결과 및 무손실 선화 보존 계측. */
export interface SplitResCompositeResult {
  readonly output: RgbaImageBuffer;
  readonly upscaledPaint: RgbaImageBuffer;
  readonly paintPixelReductionRatio: number;
  readonly opaqueLineartPixelCount: number;
  readonly opaqueLineartExactMatchCount: number;
  readonly opaqueLineartExactMatchRatio: number;
}

const EASU_TAP_OFFSETS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, -1],
  [-1, 0],
  [0, 0],
  [1, 0],
  [2, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
  [2, 1],
  [0, 2],
  [1, 2],
];

function assertValidRgbaBuffer(buffer: RgbaImageBuffer, label: string): void {
  if (buffer.width <= 0 || buffer.height <= 0) {
    throw new RangeError(`${label}: width/height는 양수여야 합니다.`);
  }
  const expected = buffer.width * buffer.height * 4;
  if (buffer.data.length !== expected) {
    throw new RangeError(
      `${label}: 버퍼 길이(${buffer.data.length})가 ${buffer.width}x${buffer.height}x4(${expected})와 일치하지 않습니다.`,
    );
  }
}

function clampInt(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

function samplePixelNormalized(
  buffer: RgbaImageBuffer,
  x: number,
  y: number,
  out: [number, number, number, number],
): void {
  const cx = clampInt(x, 0, buffer.width - 1);
  const cy = clampInt(y, 0, buffer.height - 1);
  const idx = (cy * buffer.width + cx) * 4;
  out[0] = buffer.data[idx] / 255;
  out[1] = buffer.data[idx + 1] / 255;
  out[2] = buffer.data[idx + 2] / 255;
  out[3] = buffer.data[idx + 3] / 255;
}

function fsrLuma(rgba: readonly [number, number, number, number]): number {
  return rgba[1] * 0.5 + (rgba[0] + rgba[2]) * 0.25;
}

function accumulateEdgeDirection(
  state: { dirX: number; dirY: number; len: number },
  weight: number,
  lTop: number,
  lLeft: number,
  lCenter: number,
  lRight: number,
  lBottom: number,
): void {
  const dx = lRight - lLeft;
  const dy = lBottom - lTop;
  const absDx = Math.max(Math.abs(lRight - lCenter), Math.abs(lCenter - lLeft));
  const absDy = Math.max(Math.abs(lBottom - lCenter), Math.abs(lCenter - lTop));
  const lenX = absDx > 1e-4 ? clamp01(Math.abs(dx) / absDx) : 0;
  const lenY = absDy > 1e-4 ? clamp01(Math.abs(dy) / absDy) : 0;
  state.dirX += dx * weight;
  state.dirY += dy * weight;
  state.len += (lenX * lenX + lenY * lenY) * 0.5 * weight;
}

function evaluateEasuTapWeight(
  offX: number,
  offY: number,
  dirX: number,
  dirY: number,
  invScaleX: number,
  invScaleY: number,
  lob: number,
  clp: number,
): number {
  const rotX = offX * dirX + offY * dirY;
  const rotY = -offX * dirY + offY * dirX;
  const sx = rotX * invScaleX;
  const sy = rotY * invScaleY;
  const d2 = Math.min(sx * sx + sy * sy, clp);
  const wB = (2 / 5) * d2 - 1;
  const wA = lob * d2 - 1;
  return ((25 / 16) * (wB * wB) - (25 / 16 - 1)) * (wA * wA);
}

/** 비교 벤치마크 및 검증용 표준 바이리니어 업스케일러. */
export function upscaleBilinearRgba(
  input: RgbaImageBuffer,
  targetWidth: number,
  targetHeight: number,
): RgbaImageBuffer {
  assertValidRgbaBuffer(input, "upscaleBilinearRgba");
  if (targetWidth <= 0 || targetHeight <= 0) {
    throw new RangeError("targetWidth/targetHeight는 양수여야 합니다.");
  }

  const outData = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const p00: [number, number, number, number] = [0, 0, 0, 0];
  const p10: [number, number, number, number] = [0, 0, 0, 0];
  const p01: [number, number, number, number] = [0, 0, 0, 0];
  const p11: [number, number, number, number] = [0, 0, 0, 0];

  for (let oy = 0; oy < targetHeight; oy += 1) {
    const sy = ((oy + 0.5) * input.height) / targetHeight - 0.5;
    const iy = Math.floor(sy);
    const fy = sy - iy;
    for (let ox = 0; ox < targetWidth; ox += 1) {
      const sx = ((ox + 0.5) * input.width) / targetWidth - 0.5;
      const ix = Math.floor(sx);
      const fx = sx - ix;

      samplePixelNormalized(input, ix, iy, p00);
      samplePixelNormalized(input, ix + 1, iy, p10);
      samplePixelNormalized(input, ix, iy + 1, p01);
      samplePixelNormalized(input, ix + 1, iy + 1, p11);

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      const outIdx = (oy * targetWidth + ox) * 4;
      for (let c = 0; c < 4; c += 1) {
        const val = p00[c] * w00 + p10[c] * w10 + p01[c] * w01 + p11[c] * w11;
        outData[outIdx + c] = Math.round(clamp01(val) * 255);
      }
    }
  }

  return { width: targetWidth, height: targetHeight, data: outData };
}

/**
 * 12-tap 방향성 에지 적응 업스케일(FSR EASU) 순수 TypeScript 레퍼런스 커널.
 */
export function upscaleFsrEasuRgba(
  input: RgbaImageBuffer,
  targetWidth: number,
  targetHeight: number,
  options: FsrEasuOptions = {},
): FsrEasuResult {
  assertValidRgbaBuffer(input, "upscaleFsrEasuRgba");
  if (targetWidth <= 0 || targetHeight <= 0) {
    throw new RangeError("targetWidth/targetHeight는 양수여야 합니다.");
  }

  const edgeDirectionality = clamp01(options.edgeDirectionality ?? 1.0);
  const negativeLobeStrength = clamp01(options.negativeLobeStrength ?? 1.0);
  const outData = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const taps: [number, number, number, number][] = Array.from({ length: 12 }, () => [0, 0, 0, 0]);
  const dirState = { dirX: 0, dirY: 0, len: 0 };
  let antiRingingClampedPixels = 0;

  for (let oy = 0; oy < targetHeight; oy += 1) {
    const sy = ((oy + 0.5) * input.height) / targetHeight - 0.5;
    const iy = Math.floor(sy);
    const fy = sy - iy;

    for (let ox = 0; ox < targetWidth; ox += 1) {
      const sx = ((ox + 0.5) * input.width) / targetWidth - 0.5;
      const ix = Math.floor(sx);
      const fx = sx - ix;

      for (let t = 0; t < 12; t += 1) {
        const [dx, dy] = EASU_TAP_OFFSETS[t];
        samplePixelNormalized(input, ix + dx, iy + dy, taps[t]);
      }

      dirState.dirX = 0;
      dirState.dirY = 0;
      dirState.len = 0;
      accumulateEdgeDirection(dirState, (1 - fx) * (1 - fy), fsrLuma(taps[0]), fsrLuma(taps[2]), fsrLuma(taps[3]), fsrLuma(taps[4]), fsrLuma(taps[7]));
      accumulateEdgeDirection(dirState, fx * (1 - fy), fsrLuma(taps[1]), fsrLuma(taps[3]), fsrLuma(taps[4]), fsrLuma(taps[5]), fsrLuma(taps[8]));
      accumulateEdgeDirection(dirState, (1 - fx) * fy, fsrLuma(taps[3]), fsrLuma(taps[6]), fsrLuma(taps[7]), fsrLuma(taps[8]), fsrLuma(taps[10]));
      accumulateEdgeDirection(dirState, fx * fy, fsrLuma(taps[4]), fsrLuma(taps[7]), fsrLuma(taps[8]), fsrLuma(taps[9]), fsrLuma(taps[11]));

      const dirSq = dirState.dirX * dirState.dirX + dirState.dirY * dirState.dirY;
      let dirX = 1;
      let dirY = 0;
      if (dirSq >= 1e-6) {
        const invLen = 1 / Math.sqrt(dirSq);
        dirX = dirState.dirX * invLen;
        dirY = dirState.dirY * invLen;
      }

      const edgeAniso = clamp01(dirState.len * dirState.len * edgeDirectionality);
      const stretch = 1 / Math.max(Math.abs(dirX), Math.abs(dirY), 1e-4);
      const invScaleX = 1 / Math.max(0.5, 1 - 0.5 * edgeAniso);
      const invScaleY = 1 / (1 + (stretch - 1) * edgeAniso);
      const lob = 0.5 + (0.21 - 0.5) * edgeAniso * negativeLobeStrength;
      const clp = 1 / Math.max(lob, 0.05);

      let accR = 0;
      let accG = 0;
      let accB = 0;
      let accA = 0;
      let accW = 0;
      for (let t = 0; t < 12; t += 1) {
        const [tx, ty] = EASU_TAP_OFFSETS[t];
        const w = evaluateEasuTapWeight(tx - fx, ty - fy, dirX, dirY, invScaleX, invScaleY, lob, clp);
        accR += taps[t][0] * w;
        accG += taps[t][1] * w;
        accB += taps[t][2] * w;
        accA += taps[t][3] * w;
        accW += w;
      }

      const invW = 1 / Math.max(accW, 1e-5);
      const raw = [accR * invW, accG * invW, accB * invW, accA * invW];
      const outIdx = (oy * targetWidth + ox) * 4;
      let clampedThisPixel = false;
      for (let c = 0; c < 4; c += 1) {
        const min4 = Math.min(taps[3][c], taps[4][c], taps[7][c], taps[8][c]);
        const max4 = Math.max(taps[3][c], taps[4][c], taps[7][c], taps[8][c]);
        let val = raw[c];
        if (val < min4) {
          val = min4;
          clampedThisPixel = true;
        } else if (val > max4) {
          val = max4;
          clampedThisPixel = true;
        }
        outData[outIdx + c] = Math.round(clamp01(val) * 255);
      }
      if (clampedThisPixel) antiRingingClampedPixels += 1;
    }
  }

  return {
    image: { width: targetWidth, height: targetHeight, data: outData },
    scaleFactorX: Number((targetWidth / input.width).toFixed(4)),
    scaleFactorY: Number((targetHeight / input.height).toFixed(4)),
    tapCountPerPixel: 12,
    antiRingingClampedPixels,
  };
}

/**
 * 5-tap 로버스트 대비 적응 샤프닝(FSR RCAS) 순수 TypeScript 커널.
 */
export function sharpenFsrRcasRgba(
  input: RgbaImageBuffer,
  options: FsrRcasOptions = {},
): FsrRcasResult {
  assertValidRgbaBuffer(input, "sharpenFsrRcasRgba");

  const sharpness = clamp01(options.sharpness ?? 0.8);
  const denoise = options.denoise ?? true;
  const outData = new Uint8ClampedArray(input.data.length);
  const b: [number, number, number, number] = [0, 0, 0, 0];
  const d: [number, number, number, number] = [0, 0, 0, 0];
  const e: [number, number, number, number] = [0, 0, 0, 0];
  const f: [number, number, number, number] = [0, 0, 0, 0];
  const h: [number, number, number, number] = [0, 0, 0, 0];

  let clampedHaloPreventedPixels = 0;
  let maxChannelOvershoot = 0;

  for (let y = 0; y < input.height; y += 1) {
    for (let x = 0; x < input.width; x += 1) {
      samplePixelNormalized(input, x, y - 1, b);
      samplePixelNormalized(input, x - 1, y, d);
      samplePixelNormalized(input, x, y, e);
      samplePixelNormalized(input, x + 1, y, f);
      samplePixelNormalized(input, x, y + 1, h);

      let maxLobe = -1;
      for (let c = 0; c < 3; c += 1) {
        const min4 = Math.min(b[c], d[c], f[c], h[c]);
        const max4 = Math.max(b[c], d[c], f[c], h[c]);
        const min5 = Math.min(min4, e[c]);
        const max5 = Math.max(max4, e[c]);
        const hitMin = min5 / Math.max(4 * max4, 1e-4);
        const hitMax = (1 - max5) / Math.min(4 * min4 - 4, -1e-4);
        const lobeC = Math.max(-hitMin, hitMax);
        if (lobeC > maxLobe) maxLobe = lobeC;
      }

      let lobe = Math.max(-0.1875, Math.min(maxLobe, 0));
      if (denoise) {
        const lb = fsrLuma(b);
        const ld = fsrLuma(d);
        const le = fsrLuma(e);
        const lf = fsrLuma(f);
        const lh = fsrLuma(h);
        const nz = 0.25 * (lb + ld + lf + lh) - le;
        const lRange = Math.max(lb, ld, le, lf, lh) - Math.min(lb, ld, le, lf, lh);
        const noiseRatio = lRange > 1e-4 ? clamp01(Math.abs(nz) / lRange) : 1;
        lobe *= 1 - 0.5 * noiseRatio;
      }

      const w = lobe * sharpness;
      const denom = Math.max(1 + 4 * w, 0.25);
      const outIdx = (y * input.width + x) * 4;
      let clampedPixel = false;

      for (let c = 0; c < 3; c += 1) {
        const min5 = Math.min(b[c], d[c], e[c], f[c], h[c]);
        const max5 = Math.max(b[c], d[c], e[c], f[c], h[c]);
        const raw = (w * (b[c] + d[c] + f[c] + h[c]) + e[c]) / denom;
        let finalVal = raw;
        if (raw < min5) {
          finalVal = min5;
          clampedPixel = true;
        } else if (raw > max5) {
          finalVal = max5;
          clampedPixel = true;
        }
        const overshoot = Math.max(0, finalVal - max5, min5 - finalVal);
        if (overshoot > maxChannelOvershoot) maxChannelOvershoot = overshoot;
        outData[outIdx + c] = Math.round(clamp01(finalVal) * 255);
      }
      outData[outIdx + 3] = Math.round(clamp01(e[3]) * 255);
      if (clampedPixel) clampedHaloPreventedPixels += 1;
    }
  }

  return {
    image: { width: input.width, height: input.height, data: outData },
    tapCountPerPixel: 5,
    effectiveSharpness: sharpness,
    clampedHaloPreventedPixels,
    maxChannelOvershoot,
  };
}

/**
 * 저해상도 페인트/3D 버퍼를 FSR EASU(+선택적 RCAS)로 업스케일한 뒤
 * 100% 네이티브 해상도 2D 잉크 선화를 Porter-Duff Source-Over로 무손실 합성한다.
 */
export function compositeSplitResWithNativeLineart(
  input: SplitResCompositeInput,
): SplitResCompositeResult {
  assertValidRgbaBuffer(input.lowResPaint, "lowResPaint");
  assertValidRgbaBuffer(input.nativeLineart, "nativeLineart");

  const targetWidth = input.nativeLineart.width;
  const targetHeight = input.nativeLineart.height;
  const enableRcas = input.enableRcas ?? true;

  let upscaledPaint: RgbaImageBuffer =
    input.lowResPaint.width === targetWidth && input.lowResPaint.height === targetHeight
      ? { width: targetWidth, height: targetHeight, data: new Uint8ClampedArray(input.lowResPaint.data) }
      : upscaleFsrEasuRgba(input.lowResPaint, targetWidth, targetHeight, input.easuOptions).image;

  if (enableRcas) {
    upscaledPaint = sharpenFsrRcasRgba(upscaledPaint, input.rcasOptions).image;
  }

  const outData = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  const paintData = upscaledPaint.data;
  const lineData = input.nativeLineart.data;

  let opaqueLineartPixelCount = 0;
  let opaqueLineartExactMatchCount = 0;

  for (let i = 0; i < outData.length; i += 4) {
    const lineA = lineData[i + 3];
    if (lineA === 255) {
      outData[i] = lineData[i];
      outData[i + 1] = lineData[i + 1];
      outData[i + 2] = lineData[i + 2];
      outData[i + 3] = 255;
      opaqueLineartPixelCount += 1;
      opaqueLineartExactMatchCount += 1;
      continue;
    }
    if (lineA === 0) {
      outData[i] = paintData[i];
      outData[i + 1] = paintData[i + 1];
      outData[i + 2] = paintData[i + 2];
      outData[i + 3] = paintData[i + 3];
      continue;
    }

    const srcA = lineA / 255;
    const dstA = paintData[i + 3] / 255;
    const invSrcA = 1 - srcA;
    const outA = srcA + dstA * invSrcA;
    if (outA <= 1e-6) {
      outData[i] = 0;
      outData[i + 1] = 0;
      outData[i + 2] = 0;
      outData[i + 3] = 0;
    } else {
      for (let c = 0; c < 3; c += 1) {
        const blended = ((lineData[i + c] / 255) * srcA + (paintData[i + c] / 255) * dstA * invSrcA) / outA;
        outData[i + c] = Math.round(clamp01(blended) * 255);
      }
      outData[i + 3] = Math.round(clamp01(outA) * 255);
    }
  }

  const paintPixelReductionRatio = Number(
    Math.max(0, 1 - (input.lowResPaint.width * input.lowResPaint.height) / Math.max(1, targetWidth * targetHeight)).toFixed(4),
  );
  const opaqueLineartExactMatchRatio =
    opaqueLineartPixelCount > 0 ? opaqueLineartExactMatchCount / opaqueLineartPixelCount : 1;

  return {
    output: { width: targetWidth, height: targetHeight, data: outData },
    upscaledPaint,
    paintPixelReductionRatio,
    opaqueLineartPixelCount,
    opaqueLineartExactMatchCount,
    opaqueLineartExactMatchRatio,
  };
}
