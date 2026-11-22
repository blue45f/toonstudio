/**
 * 분리형 가우시안(Separable 1D Gaussian) 저주파/고주파 주파수 분리 & 무손실 왕복 재합성 엔진.
 * (`studio-patchmatch-inpaint-and-freqsep.ts`에서 재수출되며 ₩0 로컬 Float32 정밀 잔차 기반으로 0오차 복원을 보장한다.)
 */

export interface PatchMatchImageDataLike {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface FrequencySeparationOptions {
  /** 가우시안 표준편차 σ (0.25..24, 기본 2.0). `radiusPx`가 함께 주어지면 `sigma` 우선. */
  readonly sigma?: number;
  /** 커널 반경(px, 1..48). `sigma` 미지정 시 `sigma = radiusPx * 0.5`로 환산. */
  readonly radiusPx?: number;
}

export interface CleanroomFrequencySeparation {
  readonly width: number;
  readonly height: number;
  readonly sigma: number;
  readonly kernelRadius: number;
  /** 정밀 저주파(색·명암) Float32 RGBA 버퍼. */
  readonly lowFloat: Float32Array;
  /** 정밀 고주파 잔차(`orig - lowFloat`, 알파는 원본 보존) Float32 버퍼. */
  readonly highFloat: Float32Array;
  /** 8비트 표시용 저주파 RGBA. */
  readonly lowRgba: Uint8ClampedArray;
  /** 8비트 Photoshop Linear Light 미리보기용 고주파 RGBA (`128 + residual * 0.5`). */
  readonly highLinearLightRgba: Uint8ClampedArray;
}

export interface FrequencyRecombineOptions {
  /** 고주파(질감·선화) 배율 (0..3, 기본 1 = 무손실 원형). */
  readonly highGain?: number;
  /** 저주파(색·명암) 배율 (0..2, 기본 1 = 무손실 원형). */
  readonly lowGain?: number;
  /** `"exact-float"`(기본, 0오차 무손실 왕복) 또는 `"8bit-linear-light"`. */
  readonly mode?: "exact-float" | "8bit-linear-light";
  /** 사용자가 리터칭한 저주파 8비트 레이어 대체 입력(선택). */
  readonly lowOverrideRgba?: Uint8ClampedArray;
  /** 사용자가 수정한 고주파 Float32 잔차 대체 입력(선택). */
  readonly highOverrideFloat?: Float32Array;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function clampByte(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
}

/** 정규화 1D 가우시안 커널(합 = 1.0)을 생성한다. */
export function buildSeparableGaussianKernel(sigma: number): Float32Array {
  const safeSigma = clamp(Number.isFinite(sigma) ? sigma : 2, 0.25, 24);
  const radius = clamp(Math.ceil(safeSigma * 3), 1, 48);
  const size = radius * 2 + 1;
  const kernel = new Float32Array(size);
  const invTwoSigmaSq = 1 / (2 * safeSigma * safeSigma);
  let sum = 0;

  for (let k = -radius; k <= radius; k += 1) {
    const w = Math.exp(-(k * k) * invTwoSigmaSq);
    kernel[k + radius] = w;
    sum += w;
  }
  const invSum = sum > 0 ? 1 / sum : 1;
  for (let i = 0; i < size; i += 1) {
    kernel[i] = kernel[i]! * invSum;
  }
  return kernel;
}

/** 1D 수평→수직 분리형 가우시안 합성곱을 Float32 정밀도로 계산한다. */
export function applySeparableGaussianBlurFloat32(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  sigma: number,
): { readonly blurred: Float32Array; readonly kernelRadius: number } {
  const kernel = buildSeparableGaussianKernel(sigma);
  const radius = (kernel.length - 1) >> 1;
  const total = width * height;
  const temp = new Float32Array(total * 4);
  const out = new Float32Array(total * 4);

  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const sx = clamp(x + k, 0, width - 1);
        const off = (row + sx) * 4;
        const w = kernel[k + radius]!;
        r += rgba[off]! * w;
        g += rgba[off + 1]! * w;
        b += rgba[off + 2]! * w;
        a += rgba[off + 3]! * w;
      }
      const dst = (row + x) * 4;
      temp[dst] = r;
      temp[dst + 1] = g;
      temp[dst + 2] = b;
      temp[dst + 3] = a;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const sy = clamp(y + k, 0, height - 1);
        const off = (sy * width + x) * 4;
        const w = kernel[k + radius]!;
        r += temp[off]! * w;
        g += temp[off + 1]! * w;
        b += temp[off + 2]! * w;
        a += temp[off + 3]! * w;
      }
      const dst = (y * width + x) * 4;
      out[dst] = r;
      out[dst + 1] = g;
      out[dst + 2] = b;
      out[dst + 3] = a;
    }
  }

  return { blurred: out, kernelRadius: radius };
}

/**
 * 이미지를 분리형 가우시안 저주파(색·명암)와 고주파(세부 질감·선화)로 분리한다.
 * `lowFloat + highFloat === orig` 불변량을 유지해 기본 재합성 시 0오차 무손실 왕복 복원을 보장한다.
 */
export function separateImageFrequencies(
  source: PatchMatchImageDataLike,
  options?: FrequencySeparationOptions,
): CleanroomFrequencySeparation {
  const { width, height, data } = source;
  const derivedSigma =
    options?.sigma !== undefined
      ? options.sigma
      : options?.radiusPx !== undefined
        ? Math.max(0.5, options.radiusPx * 0.5)
        : 2;
  const sigma = clamp(Number.isFinite(derivedSigma) ? derivedSigma : 2, 0.25, 24);
  const { blurred: lowFloat, kernelRadius } = applySeparableGaussianBlurFloat32(data, width, height, sigma);

  const total = width * height;
  const highFloat = new Float32Array(total * 4);
  const lowRgba = new Uint8ClampedArray(total * 4);
  const highLinearLightRgba = new Uint8ClampedArray(total * 4);

  for (let i = 0; i < total; i += 1) {
    const off = i * 4;
    for (let c = 0; c < 3; c += 1) {
      const orig = data[off + c]!;
      const lo = lowFloat[off + c]!;
      const hi = orig - lo;
      highFloat[off + c] = hi;
      lowRgba[off + c] = clampByte(lo);
      highLinearLightRgba[off + c] = clampByte(128 + hi * 0.5);
    }
    const alpha = data[off + 3]!;
    lowFloat[off + 3] = alpha;
    highFloat[off + 3] = alpha;
    lowRgba[off + 3] = alpha;
    highLinearLightRgba[off + 3] = alpha;
  }

  return {
    width,
    height,
    sigma,
    kernelRadius,
    lowFloat,
    highFloat,
    lowRgba,
    highLinearLightRgba,
  };
}

/**
 * 분리된 저주파·고주파를 재합성한다.
 * 기본값(`mode="exact-float"`, `highGain=1`, `lowGain=1`)에서는 원본 픽셀을 비트 단위 무손실(오차 0)로 복원한다.
 */
export function recombineImageFrequencies(
  separation: CleanroomFrequencySeparation,
  options?: FrequencyRecombineOptions,
): PatchMatchImageDataLike {
  const { width, height } = separation;
  const total = width * height;
  const highGain = clamp(options?.highGain ?? 1, 0, 3);
  const lowGain = clamp(options?.lowGain ?? 1, 0, 2);
  const mode = options?.mode ?? "exact-float";
  const out = new Uint8ClampedArray(total * 4);

  if (mode === "8bit-linear-light") {
    const loBuf = options?.lowOverrideRgba ?? separation.lowRgba;
    const hiBuf = separation.highLinearLightRgba;
    for (let i = 0; i < total; i += 1) {
      const off = i * 4;
      for (let c = 0; c < 3; c += 1) {
        out[off + c] = clampByte(loBuf[off + c]! * lowGain + (hiBuf[off + c]! - 128) * 2 * highGain);
      }
      out[off + 3] = loBuf[off + 3]!;
    }
    return { width, height, data: out };
  }

  const lowOverride = options?.lowOverrideRgba;
  const highBuf = options?.highOverrideFloat ?? separation.highFloat;
  for (let i = 0; i < total; i += 1) {
    const off = i * 4;
    for (let c = 0; c < 3; c += 1) {
      const lo = lowOverride ? lowOverride[off + c]! : separation.lowFloat[off + c]!;
      const hi = highBuf[off + c]!;
      out[off + c] = clampByte(lo * lowGain + hi * highGain);
    }
    out[off + 3] = clampByte(lowOverride ? lowOverride[off + 3]! : separation.lowFloat[off + 3]!);
  }
  return { width, height, data: out };
}
