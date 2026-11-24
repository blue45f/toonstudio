/**
 * `crates/studio-wasm64-drawing-core` Rust Wasm 커널과 바이트 단위 동등한 순수 JS 폴백 구현.
 *
 * - 비네트워크·오프라인·WebAssembly 비활성 환경에서도 동일한 픽셀/체크섬 결과를 보장한다.
 * - `Math.fround`와 `Float32Array`로 Rust `f32` 연산 순서를 일치시켜 512² 언샤프·2.5D 임파스토·
 *   가우시안 블러·Kubelka-Munk 16파장 혼색·타일 XOR 델타의 Wasm vs JS 교차 검증과 실측 벤치마크 기준선으로 사용한다.
 */

const f = Math.fround;

export interface ImpastoLightParams {
  readonly azimuthRad: number;
  readonly elevationRad: number;
  readonly reliefStrength: number;
  readonly ambient: number;
  readonly diffuseStrength: number;
  readonly specularStrength: number;
  readonly shininess: number;
}

export const DEFAULT_IMPASTO_LIGHT_PARAMS: ImpastoLightParams = Object.freeze({
  azimuthRad: Math.PI / 4,
  elevationRad: 0.9599311,
  reliefStrength: 1.8,
  ambient: 0.35,
  diffuseStrength: 0.75,
  specularStrength: 0.22,
  shininess: 24.0,
});

function clampF32(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function roundToByte(v: number): number {
  return Math.round(clampF32(v, 0, 255));
}

function buildGaussianKernel1dF32(sigma: number): Float32Array {
  const sigmaF = f(sigma);
  const radius = Math.max(1, Math.min(64, Math.ceil(f(sigmaF * 3))));
  const len = radius * 2 + 1;
  const weights = new Float32Array(len);
  const invTwoSigmaSq = f(1 / f(f(2 * sigmaF) * sigmaF));
  let sum = f(0);
  for (let i = 0; i < len; i += 1) {
    const d = f(i - radius);
    const w = f(Math.exp(f(f(f(-d) * d) * invTwoSigmaSq)));
    weights[i] = w;
    sum = f(sum + w);
  }
  if (sum > 0) {
    for (let i = 0; i < len; i += 1) {
      weights[i] = f((weights[i] ?? 0) / sum);
    }
  }
  return weights;
}

function premultiplyRgbaToF32(rgba: Uint8Array): Float32Array {
  const premul = new Float32Array(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const aF = f(rgba[i + 3] ?? 0);
    const a = f(aF / 255);
    premul[i] = f((rgba[i] ?? 0) * a);
    premul[i + 1] = f((rgba[i + 1] ?? 0) * a);
    premul[i + 2] = f((rgba[i + 2] ?? 0) * a);
    premul[i + 3] = aF;
  }
  return premul;
}

function runUnmaskedSeparablePipelineJs(
  rgba: Uint8Array,
  width: number,
  height: number,
  sigma: number,
  unsharp: { readonly amount: number; readonly threshold: number } | null,
): { readonly output: Uint8Array; readonly count: number } {
  const kernel = buildGaussianKernel1dF32(sigma);
  const radius = (kernel.length - 1) >> 1;
  const rowStride = width * 4;
  const premul = premultiplyRgbaToF32(rgba);
  const horiz = new Float32Array(rgba.length);

  const leftEnd = Math.min(radius, width);
  const rightStart = Math.max(leftEnd, Math.max(0, width - radius));

  for (let y = 0; y < height; y += 1) {
    const rowBase = y * rowStride;
    for (let x = 0; x < width; x += 1) {
      let accR = f(0);
      let accG = f(0);
      let accB = f(0);
      let accA = f(0);
      if (x >= leftEnd && x < rightStart) {
        let s = rowBase + (x - radius) * 4;
        for (let k = 0; k < kernel.length; k += 1) {
          const kw = kernel[k] ?? 0;
          accR = f(accR + f((premul[s] ?? 0) * kw));
          accG = f(accG + f((premul[s + 1] ?? 0) * kw));
          accB = f(accB + f((premul[s + 2] ?? 0) * kw));
          accA = f(accA + f((premul[s + 3] ?? 0) * kw));
          s += 4;
        }
      } else {
        for (let k = 0; k < kernel.length; k += 1) {
          const kw = kernel[k] ?? 0;
          const sx = Math.max(0, Math.min(width - 1, x + k - radius));
          const s = rowBase + sx * 4;
          accR = f(accR + f((premul[s] ?? 0) * kw));
          accG = f(accG + f((premul[s + 1] ?? 0) * kw));
          accB = f(accB + f((premul[s + 2] ?? 0) * kw));
          accA = f(accA + f((premul[s + 3] ?? 0) * kw));
        }
      }
      const d = rowBase + x * 4;
      horiz[d] = accR;
      horiz[d + 1] = accG;
      horiz[d + 2] = accB;
      horiz[d + 3] = accA;
    }
  }

  const output = new Uint8Array(rgba.length);
  const rowAcc = new Float32Array(rowStride);
  const amountF = unsharp ? f(unsharp.amount) : f(0);
  const threshF = unsharp ? f(unsharp.threshold) : f(0);
  let count = 0;

  for (let y = 0; y < height; y += 1) {
    rowAcc.fill(0);
    for (let k = 0; k < kernel.length; k += 1) {
      const kw = kernel[k] ?? 0;
      const sy = Math.max(0, Math.min(height - 1, y + k - radius));
      const srcOff = sy * rowStride;
      for (let i = 0; i < rowStride; i += 1) {
        rowAcc[i] = f((rowAcc[i] ?? 0) + f((horiz[srcOff + i] ?? 0) * kw));
      }
    }

    const rowBase = y * rowStride;
    for (let x = 0; x < width; x += 1) {
      const aOff = x * 4;
      const oOff = rowBase + aOff;
      const pa = rowAcc[aOff + 3] ?? 0;
      const alphaNorm = clampF32(f(pa / 255), 0, 1);
      let blurR = 0;
      let blurG = 0;
      let blurB = 0;
      if (alphaNorm > f(1e-4)) {
        blurR = roundToByte(f((rowAcc[aOff] ?? 0) / alphaNorm));
        blurG = roundToByte(f((rowAcc[aOff + 1] ?? 0) / alphaNorm));
        blurB = roundToByte(f((rowAcc[aOff + 2] ?? 0) / alphaNorm));
      }

      if (!unsharp) {
        output[oOff] = blurR;
        output[oOff + 1] = blurG;
        output[oOff + 2] = blurB;
        output[oOff + 3] = roundToByte(pa);
        count += 1;
      } else {
        const blurred = [blurR, blurG, blurB];
        let changed = 0;
        for (let ch = 0; ch < 3; ch += 1) {
          const origByte = rgba[oOff + ch] ?? 0;
          const o = f(origByte);
          const b = f(blurred[ch] ?? 0);
          const diff = f(o - b);
          if (Math.abs(diff) >= threshF) {
            const sharpened = roundToByte(f(o + f(diff * amountF)));
            if (sharpened !== origByte) changed = 1;
            output[oOff + ch] = sharpened;
          } else {
            output[oOff + ch] = origByte;
          }
        }
        output[oOff + 3] = rgba[oOff + 3] ?? 255;
        count += changed;
      }
    }
  }

  return { output, count };
}

/** Rust `gaussian_blur_rgba_into`와 동등한 분리형 가우시안 블러 JS 폴백 (선택 마스크 경계 외부 번짐 0%). */
export function jsGaussianBlurRgba(
  rgba: Uint8Array,
  width: number,
  height: number,
  sigma: number,
  selectionMask?: Uint8Array | null,
): { readonly output: Uint8Array; readonly processedPixels: number } {
  const pixelCount = width * height;
  if (width <= 0 || height <= 0 || rgba.length !== pixelCount * 4) {
    throw new RangeError(`잘못된 가우시안 블러 버퍼 크기: ${width}x${height} (${rgba.length}B)`);
  }
  if (!Number.isFinite(sigma) || sigma < 0) {
    throw new RangeError("sigma는 0 이상의 유한수여야 합니다");
  }
  if (selectionMask && selectionMask.length !== pixelCount) {
    throw new RangeError(`선택 마스크 길이 불일치: expected=${pixelCount}, actual=${selectionMask.length}`);
  }
  if (sigma < 1e-4) {
    return { output: new Uint8Array(rgba), processedPixels: pixelCount };
  }
  if (!selectionMask) {
    const res = runUnmaskedSeparablePipelineJs(rgba, width, height, sigma, null);
    return { output: res.output, processedPixels: res.count };
  }

  const kernel = buildGaussianKernel1dF32(sigma);
  const radius = (kernel.length - 1) >> 1;
  const premul = premultiplyRgbaToF32(rgba);
  const horiz = new Float32Array(rgba.length);

  for (let y = 0; y < height; y += 1) {
    const rowOff = y * width;
    for (let x = 0; x < width; x += 1) {
      const px = rowOff + x;
      const dst = px * 4;
      if ((selectionMask[px] ?? 0) === 0) {
        horiz[dst] = premul[dst] ?? 0;
        horiz[dst + 1] = premul[dst + 1] ?? 0;
        horiz[dst + 2] = premul[dst + 2] ?? 0;
        horiz[dst + 3] = premul[dst + 3] ?? 0;
        continue;
      }
      let accR = f(0); let accG = f(0); let accB = f(0); let accA = f(0); let wSum = f(0);
      for (let k = 0; k < kernel.length; k += 1) {
        const sx = Math.max(0, Math.min(width - 1, x + k - radius));
        const sIdx = rowOff + sx;
        const mv = selectionMask[sIdx] ?? 0;
        if (mv === 0) continue;
        const weight = f((kernel[k] ?? 0) * f(mv / 255));
        const s = sIdx * 4;
        accR = f(accR + f((premul[s] ?? 0) * weight));
        accG = f(accG + f((premul[s + 1] ?? 0) * weight));
        accB = f(accB + f((premul[s + 2] ?? 0) * weight));
        accA = f(accA + f((premul[s + 3] ?? 0) * weight));
        wSum = f(wSum + weight);
      }
      if (wSum > 0) {
        const inv = f(1 / wSum);
        horiz[dst] = f(accR * inv);
        horiz[dst + 1] = f(accG * inv);
        horiz[dst + 2] = f(accB * inv);
        horiz[dst + 3] = f(accA * inv);
      } else {
        horiz[dst] = premul[dst] ?? 0;
        horiz[dst + 1] = premul[dst + 1] ?? 0;
        horiz[dst + 2] = premul[dst + 2] ?? 0;
        horiz[dst + 3] = premul[dst + 3] ?? 0;
      }
    }
  }

  const output = new Uint8Array(rgba.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = y * width + x;
      const dst = px * 4;
      const centerMask = selectionMask[px] ?? 0;
      if (centerMask === 0) {
        output[dst] = rgba[dst] ?? 0;
        output[dst + 1] = rgba[dst + 1] ?? 0;
        output[dst + 2] = rgba[dst + 2] ?? 0;
        output[dst + 3] = rgba[dst + 3] ?? 0;
        continue;
      }
      let accR = f(0); let accG = f(0); let accB = f(0); let accA = f(0); let wSum = f(0);
      for (let k = 0; k < kernel.length; k += 1) {
        const sy = Math.max(0, Math.min(height - 1, y + k - radius));
        const sIdx = sy * width + x;
        const mv = selectionMask[sIdx] ?? 0;
        if (mv === 0) continue;
        const weight = f((kernel[k] ?? 0) * f(mv / 255));
        const s = sIdx * 4;
        accR = f(accR + f((horiz[s] ?? 0) * weight));
        accG = f(accG + f((horiz[s + 1] ?? 0) * weight));
        accB = f(accB + f((horiz[s + 2] ?? 0) * weight));
        accA = f(accA + f((horiz[s + 3] ?? 0) * weight));
        wSum = f(wSum + weight);
      }
      const pr = wSum > 0 ? f(accR * f(1 / wSum)) : (premul[dst] ?? 0);
      const pg = wSum > 0 ? f(accG * f(1 / wSum)) : (premul[dst + 1] ?? 0);
      const pb = wSum > 0 ? f(accB * f(1 / wSum)) : (premul[dst + 2] ?? 0);
      const pa = wSum > 0 ? f(accA * f(1 / wSum)) : (premul[dst + 3] ?? 0);
      const alphaNorm = clampF32(f(pa / 255), 0, 1);
      const blurR = alphaNorm > f(1e-4) ? clampF32(f(pr / alphaNorm), 0, 255) : f(0);
      const blurG = alphaNorm > f(1e-4) ? clampF32(f(pg / alphaNorm), 0, 255) : f(0);
      const blurB = alphaNorm > f(1e-4) ? clampF32(f(pb / alphaNorm), 0, 255) : f(0);
      const blurA = clampF32(pa, 0, 255);
      if (centerMask === 255) {
        output[dst] = roundToByte(blurR);
        output[dst + 1] = roundToByte(blurG);
        output[dst + 2] = roundToByte(blurB);
        output[dst + 3] = roundToByte(blurA);
      } else {
        const blend = f(centerMask / 255);
        const inv = f(1 - blend);
        output[dst] = roundToByte(f(f((rgba[dst] ?? 0) * inv) + f(blurR * blend)));
        output[dst + 1] = roundToByte(f(f((rgba[dst + 1] ?? 0) * inv) + f(blurG * blend)));
        output[dst + 2] = roundToByte(f(f((rgba[dst + 2] ?? 0) * inv) + f(blurB * blend)));
        output[dst + 3] = roundToByte(f(f((rgba[dst + 3] ?? 0) * inv) + f(blurA * blend)));
      }
    }
  }
  return { output, processedPixels: pixelCount };
}

/** Rust `unsharp_mask_rgba_into`와 바이트 동등한 언샤프 마스크 JS 폴백. */
export function jsUnsharpMaskRgba(
  rgba: Uint8Array,
  width: number,
  height: number,
  sigma: number,
  amount: number,
  threshold: number,
): { readonly output: Uint8Array; readonly modifiedPixels: number } {
  const expected = width * height * 4;
  if (width <= 0 || height <= 0 || rgba.length !== expected) {
    throw new RangeError(`잘못된 언샤프 버퍼 크기: ${width}x${height} (${rgba.length}B)`);
  }
  if (!Number.isFinite(sigma) || sigma < 0 || !Number.isFinite(amount) || amount < 0) {
    throw new RangeError("sigma와 amount는 0 이상의 유한수여야 합니다");
  }
  const safeThreshold = Math.max(0, Math.min(255, Math.round(threshold)));
  if (amount === 0 || sigma < 1e-4) {
    return { output: new Uint8Array(rgba), modifiedPixels: 0 };
  }
  const res = runUnmaskedSeparablePipelineJs(rgba, width, height, sigma, {
    amount,
    threshold: safeThreshold,
  });
  return { output: res.output, modifiedPixels: res.count };
}

function powShininessF32(base: number, exp: number): number {
  const truncated = Math.trunc(exp);
  if (Math.abs(exp - truncated) === 0 && exp >= 0 && exp <= 256) {
    let n = truncated | 0;
    let acc = f(1);
    let factor = f(base);
    while (n > 0) {
      if ((n & 1) !== 0) acc = f(acc * factor);
      n >>>= 1;
      if (n > 0) factor = f(factor * factor);
    }
    return acc;
  }
  return f(Math.pow(base, exp));
}

/** Rust `apply_impasto_lighting_rgba`와 바이트 동등한 2.5D 임파스토 Sobel Blinn-Phong 셰이딩 JS 폴백. */
export function jsApplyImpastoLightingRgba(
  rgba: Uint8Array,
  heightMap: Float32Array,
  width: number,
  height: number,
  light: ImpastoLightParams = DEFAULT_IMPASTO_LIGHT_PARAMS,
): { readonly output: Uint8Array; readonly shadedPixels: number } {
  const pixelCount = width * height;
  if (width <= 0 || height <= 0 || rgba.length !== pixelCount * 4 || heightMap.length !== pixelCount) {
    throw new RangeError(`잘못된 임파스토 버퍼 크기: ${width}x${height}`);
  }
  const az = f(light.azimuthRad);
  const el = f(light.elevationRad);
  const relief = f(light.reliefStrength);
  const ambient = f(light.ambient);
  const diffuse = f(light.diffuseStrength);
  const specular = f(light.specularStrength);
  const shininess = f(light.shininess);

  const cosEl = f(Math.cos(el));
  const rawLx = f(f(Math.cos(az)) * cosEl);
  const rawLy = f(f(Math.sin(az)) * cosEl);
  const rawLz = Math.max(f(0.01), f(Math.sin(el)));
  const lLen = f(Math.sqrt(f(f(f(rawLx * rawLx) + f(rawLy * rawLy)) + f(rawLz * rawLz))));
  const lx = f(rawLx / lLen);
  const ly = f(rawLy / lLen);
  const lz = f(rawLz / lLen);

  const rawHz = f(lz + 1);
  const hLen = f(Math.sqrt(f(f(f(lx * lx) + f(ly * ly)) + f(rawHz * rawHz))));
  const hx = f(lx / hLen);
  const hy = f(ly / hLen);
  const hz = f(rawHz / hLen);

  const sampleH = (x: number, y: number): number => {
    const v = heightMap[y * width + x] ?? 0;
    return Number.isFinite(v) ? f(v) : f(0);
  };

  const output = new Uint8Array(rgba);
  let shadedPixels = 0;

  for (let y = 0; y < height; y += 1) {
    const ym = y > 0 ? y - 1 : 0;
    const yp = y + 1 < height ? y + 1 : height - 1;
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const alphaU8 = output[idx + 3] ?? 0;
      if (alphaU8 === 0) continue;

      const xm = x > 0 ? x - 1 : 0;
      const xp = x + 1 < width ? x + 1 : width - 1;

      const tl = sampleH(xm, ym);
      const tc = sampleH(x, ym);
      const tr = sampleH(xp, ym);
      const ml = sampleH(xm, y);
      const mr = sampleH(xp, y);
      const bl = sampleH(xm, yp);
      const bc = sampleH(x, yp);
      const br = sampleH(xp, yp);

      const gx = f(f(f(f(-tl + tr) + f(2 * f(-ml + mr))) + f(-bl + br)) * relief);
      const gy = f(f(f(f(f(-tl) - f(2 * tc)) - tr) + f(f(bl + f(2 * bc)) + br)) * relief);

      const nxRaw = f(-gx);
      const nyRaw = f(-gy);
      const invNorm = f(1 / f(Math.sqrt(f(f(f(nxRaw * nxRaw) + f(nyRaw * nyRaw)) + 1))));
      const nx = f(nxRaw * invNorm);
      const ny = f(nyRaw * invNorm);
      const nz = invNorm;

      const ndotl = Math.max(f(0), f(f(f(nx * lx) + f(ny * ly)) + f(nz * lz)));
      const ndoth = Math.max(f(0), f(f(f(nx * hx) + f(ny * hy)) + f(nz * hz)));
      const alphaNorm = f(alphaU8 / 255);
      const diffuseFactor = Math.max(f(0), f(ambient + f(diffuse * ndotl)));
      const specularAdd = f(f(specular * powShininessF32(ndoth, shininess)) * alphaNorm);

      for (let ch = 0; ch < 3; ch += 1) {
        const base = f((output[idx + ch] ?? 0) / 255);
        const lit = clampF32(f(f(base * diffuseFactor) + specularAdd), 0, 1);
        output[idx + ch] = roundToByte(f(lit * 255));
      }
      shadedPixels += 1;
    }
  }

  return { output, shadedPixels };
}

// ---------------------------------------------------------------------------
// Kubelka-Munk 16파장(400~700nm) 5안료 분광 혼색 JS 폴백
// ---------------------------------------------------------------------------

const KM_BANDS = 16;
const CIE_XBAR = [0.0143, 0.1344, 0.3483, 0.2908, 0.0956, 0.0049, 0.0633, 0.2904, 0.5945, 0.9163, 1.0622, 0.8544, 0.4479, 0.1649, 0.0468, 0.0114];
const CIE_YBAR = [0.0004, 0.004, 0.023, 0.06, 0.139, 0.323, 0.71, 0.954, 0.995, 0.87, 0.631, 0.381, 0.175, 0.061, 0.017, 0.0041];
const CIE_ZBAR = [0.0679, 0.6456, 1.7471, 1.6692, 0.813, 0.272, 0.0782, 0.0203, 0.0039, 0.0017, 0.0008, 0.0002, 0, 0, 0, 0];
const CIE_D65 = [82.75, 93.43, 104.86, 117.81, 115.92, 109.35, 104.79, 107.69, 104.05, 96.33, 90.01, 87.7, 83.7, 80.03, 78.28, 71.61];
const PIGMENT_R_0 = [0.8, 0.88, 0.92, 0.86, 0.48, 0.3, 0.22, 0.12, 0.032, 0.018, 0.016, 0.016, 0.018, 0.02, 0.022, 0.025];
const PIGMENT_R_1 = [0.022, 0.022, 0.024, 0.028, 0.052, 0.48, 0.9, 0.96, 0.97, 0.97, 0.97, 0.97, 0.96, 0.96, 0.95, 0.95];
const PIGMENT_R_2 = [0.22, 0.18, 0.14, 0.06, 0.022, 0.018, 0.018, 0.028, 0.085, 0.36, 0.82, 0.94, 0.96, 0.96, 0.96, 0.95];
const PIGMENT_R_3 = [0.96, 0.985, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99];
const PIGMENT_R_4 = [0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008, 0.008];
const S0 = 0.65; const S1 = 1.05; const S2 = 0.8; const S3 = 4.5; const S4 = 0.45;

function buildKCurve(refl: readonly number[], scatter: number): Float64Array {
  const k = new Float64Array(KM_BANDS);
  for (let i = 0; i < KM_BANDS; i += 1) {
    const r = refl[i] ?? 0.5;
    k[i] = (scatter * (1 - r) * (1 - r)) / (2 * r);
  }
  return k;
}

const K0 = buildKCurve(PIGMENT_R_0, S0);
const K1 = buildKCurve(PIGMENT_R_1, S1);
const K2 = buildKCurve(PIGMENT_R_2, S2);
const K3 = buildKCurve(PIGMENT_R_3, S3);
const K4 = buildKCurve(PIGMENT_R_4, S4);
const SPEC_TO_LIN_R = new Float64Array(KM_BANDS);
const SPEC_TO_LIN_G = new Float64Array(KM_BANDS);
const SPEC_TO_LIN_B = new Float64Array(KM_BANDS);

(() => {
  let sx = 0; let sy = 0; let sz = 0;
  for (let i = 0; i < KM_BANDS; i += 1) {
    const d = CIE_D65[i] ?? 0;
    sx += (CIE_XBAR[i] ?? 0) * d;
    sy += (CIE_YBAR[i] ?? 0) * d;
    sz += (CIE_ZBAR[i] ?? 0) * d;
  }
  for (let i = 0; i < KM_BANDS; i += 1) {
    const d = CIE_D65[i] ?? 0;
    const wx = ((CIE_XBAR[i] ?? 0) * d * 0.95047) / sx;
    const wy = ((CIE_YBAR[i] ?? 0) * d) / sy;
    const wz = ((CIE_ZBAR[i] ?? 0) * d * 1.08883) / sz;
    SPEC_TO_LIN_R[i] = 3.2404542 * wx - 1.5371385 * wy - 0.4985314 * wz;
    SPEC_TO_LIN_G[i] = -0.969266 * wx + 1.8760108 * wy + 0.041556 * wz;
    SPEC_TO_LIN_B[i] = 0.0556434 * wx - 0.2040259 * wy + 1.0572252 * wz;
  }
})();

interface PigmentConc {
  readonly c0: number; readonly c1: number; readonly c2: number; readonly c3: number; readonly c4: number;
  readonly baseR: number; readonly baseG: number; readonly baseB: number;
}

const km16Cache = new Map<number, PigmentConc>();

function srgbToLinearKm16(u: number): number {
  const c = clampF32(f(u), 0, 1);
  return c <= f(0.04045) ? f(c / f(12.92)) : f(Math.pow(f(f(c + f(0.055)) / f(1.055)), f(2.4)));
}

function linearToSrgbU8Km16(u: number): number {
  const c = clampF32(f(u), 0, 1);
  const s = c <= f(0.0031308) ? f(f(12.92) * c) : f(f(f(1.055) * f(Math.pow(c, f(1 / 2.4)))) - f(0.055));
  return roundToByte(f(clampF32(s, 0, 1) * 255));
}

function evalPigmentsToLinear(c0: number, c1: number, c2: number, c3: number, c4: number): [number, number, number] {
  const invS = 1 / Math.max(1e-6, c0 * S0 + c1 * S1 + c2 * S2 + c3 * S3 + c4 * S4);
  let r = 0; let g = 0; let b = 0;
  for (let i = 0; i < KM_BANDS; i += 1) {
    const u = (c0 * (K0[i] ?? 0) + c1 * (K1[i] ?? 0) + c2 * (K2[i] ?? 0) + c3 * (K3[i] ?? 0) + c4 * (K4[i] ?? 0)) * invS;
    const refl = 1 + u - Math.sqrt(u * u + 2 * u + 1e-12);
    r += (SPEC_TO_LIN_R[i] ?? 0) * refl;
    g += (SPEC_TO_LIN_G[i] ?? 0) * refl;
    b += (SPEC_TO_LIN_B[i] ?? 0) * refl;
  }
  return [r, g, b];
}

function resolvePigmentConcJs(ri: number, gi: number, bi: number): PigmentConc {
  const qr = ri >> 3; const qg = gi >> 3; const qb = bi >> 3;
  const key = (qr << 10) | (qg << 5) | qb;
  const cached = km16Cache.get(key);
  if (cached) return cached;

  const cr255 = Math.min(255, (qr << 3) + 4);
  const cg255 = Math.min(255, (qg << 3) + 4);
  const cb255 = Math.min(255, (qb << 3) + 4);
  const tr = srgbToLinearKm16(cr255 / 255);
  const tg = srgbToLinearKm16(cg255 / 255);
  const tb = srgbToLinearKm16(cb255 / 255);
  const r = cr255 / 255; const g = cg255 / 255; const b = cb255 / 255;
  const mn = Math.min(r, g, b); const mx = Math.max(r, g, b);
  const cr = r - mn; const cg = g - mn; const cb = b - mn;
  const yel = Math.min(cr, cg) + Math.max(0, cg - cr) * 0.6;
  const red = Math.max(0, cr - cg);
  const blu = cb + Math.max(0, cg - cr) * 0.6;
  const sum = blu + yel + red + mn * 0.5 + (1 - mx) * 0.4 + 1e-9;
  const c = [blu / sum, yel / sum, red / sum, (mn * 0.5) / sum, ((1 - mx) * 0.4) / sum];

  const lossOf = (): number => {
    const [lr, lg, lb] = evalPigmentsToLinear(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 0, c[4] ?? 0);
    const d0 = lr - tr; const d1 = lg - tg; const d2 = lb - tb;
    return d0 * d0 + d1 * d1 + d2 * d2;
  };
  let bestLoss = lossOf();
  for (let delta = 0.25; delta >= 0.007 && bestLoss >= 2e-5; delta *= 0.5) {
    for (let i = 0; i < 5; i += 1) {
      for (let j = i + 1; j < 5; j += 1) {
        const ci = c[i] ?? 0; const cj = c[j] ?? 0;
        const dPlus = Math.min(delta, cj);
        let improved = false;
        if (dPlus > 1e-6) {
          c[i] = ci + dPlus; c[j] = cj - dPlus;
          const l = lossOf();
          if (l < bestLoss) { bestLoss = l; improved = true; } else { c[i] = ci; c[j] = cj; }
        }
        if (!improved) {
          const dMinus = Math.min(delta, ci);
          if (dMinus > 1e-6) {
            c[i] = ci - dMinus; c[j] = cj + dMinus;
            const l = lossOf();
            if (l < bestLoss) { bestLoss = l; } else { c[i] = ci; c[j] = cj; }
          }
        }
      }
    }
  }
  const [baseR, baseG, baseB] = evalPigmentsToLinear(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 0, c[4] ?? 0);
  const entry: PigmentConc = {
    c0: c[0] ?? 0, c1: c[1] ?? 0, c2: c[2] ?? 0, c3: c[3] ?? 0, c4: c[4] ?? 0,
    baseR, baseG, baseB,
  };
  if (km16Cache.size >= 4096) {
    const oldest = km16Cache.keys().next().value;
    if (oldest !== undefined) km16Cache.delete(oldest);
  }
  km16Cache.set(key, entry);
  return entry;
}

/** 패킹된 리틀엔디안 RGBA8 두 색상을 16파장 Kubelka-Munk 모델로 혼색한다. */
export function jsMixPigmentsKm16Packed(rgbaA: number, rgbaB: number, ratio: number): number {
  if (!Number.isFinite(ratio)) return rgbaA >>> 0;
  const t = Math.max(0, Math.min(1, f(ratio)));
  if (t <= 0) return rgbaA >>> 0;
  if (t >= 1) return rgbaB >>> 0;
  const r1 = rgbaA & 0xff; const g1 = (rgbaA >>> 8) & 0xff; const b1 = (rgbaA >>> 16) & 0xff; const a1 = (rgbaA >>> 24) & 0xff;
  const r2 = rgbaB & 0xff; const g2 = (rgbaB >>> 8) & 0xff; const b2 = (rgbaB >>> 16) & 0xff; const a2 = (rgbaB >>> 24) & 0xff;
  const w1 = 1 - t;
  const outA = Math.round(Math.max(0, Math.min(255, w1 * a1 + t * a2)));
  if (r1 === r2 && g1 === g2 && b1 === b2) {
    return ((r1) | (g1 << 8) | (b1 << 16) | (outA << 24)) >>> 0;
  }
  const l1 = resolvePigmentConcJs(r1, g1, b1);
  const l2 = resolvePigmentConcJs(r2, g2, b2);
  const resR1 = srgbToLinearKm16(r1 / 255) - l1.baseR;
  const resG1 = srgbToLinearKm16(g1 / 255) - l1.baseG;
  const resB1 = srgbToLinearKm16(b1 / 255) - l1.baseB;
  const resR2 = srgbToLinearKm16(r2 / 255) - l2.baseR;
  const resG2 = srgbToLinearKm16(g2 / 255) - l2.baseG;
  const resB2 = srgbToLinearKm16(b2 / 255) - l2.baseB;
  const [lr, lg, lb] = evalPigmentsToLinear(
    w1 * l1.c0 + t * l2.c0,
    w1 * l1.c1 + t * l2.c1,
    w1 * l1.c2 + t * l2.c2,
    w1 * l1.c3 + t * l2.c3,
    w1 * l1.c4 + t * l2.c4,
  );
  const outR = linearToSrgbU8Km16(lr + w1 * resR1 + t * resR2);
  const outG = linearToSrgbU8Km16(lg + w1 * resG1 + t * resG2);
  const outB = linearToSrgbU8Km16(lb + w1 * resB1 + t * resB2);
  return ((outR) | (outG << 8) | (outB << 16) | (outA << 24)) >>> 0;
}

/** RGBA8 스트립에 16파장 Kubelka-Munk 혼색을 일괄 수행하는 JS 폴백. */
export function jsMixPigmentsKm16Strip(
  dstRgba: Uint8Array,
  srcRgba: Uint8Array,
  ratio: number,
): { readonly output: Uint8Array; readonly processedPixels: number } {
  if (dstRgba.length !== srcRgba.length || dstRgba.length % 4 !== 0) {
    throw new RangeError("KM16 스트립 버퍼 길이가 일치하지 않거나 4의 배수가 아닙니다");
  }
  const output = new Uint8Array(dstRgba);
  const pixelCount = dstRgba.length >> 2;
  for (let i = 0; i < dstRgba.length; i += 4) {
    const a = ((output[i] ?? 0) | ((output[i + 1] ?? 0) << 8) | ((output[i + 2] ?? 0) << 16) | ((output[i + 3] ?? 0) << 24)) >>> 0;
    const b = ((srcRgba[i] ?? 0) | ((srcRgba[i + 1] ?? 0) << 8) | ((srcRgba[i + 2] ?? 0) << 16) | ((srcRgba[i + 3] ?? 0) << 24)) >>> 0;
    const mixed = jsMixPigmentsKm16Packed(a, b, ratio);
    output[i] = mixed & 0xff;
    output[i + 1] = (mixed >>> 8) & 0xff;
    output[i + 2] = (mixed >>> 16) & 0xff;
    output[i + 3] = (mixed >>> 24) & 0xff;
  }
  return { output, processedPixels: pixelCount };
}

/** Rust `xor_tile_delta_bytes`와 비트 단위 동등한 타일 XOR 델타 JS 폴백. */
export function jsXorTileDeltaBytes(
  prev: Uint8Array,
  next: Uint8Array,
): { readonly delta: Uint8Array; readonly changedBytes: number } {
  if (prev.length !== next.length) {
    throw new RangeError(`XOR 타일 길이 불일치: prev=${prev.length}, next=${next.length}`);
  }
  const delta = new Uint8Array(prev.length);
  let changedBytes = 0;
  for (let i = 0; i < prev.length; i += 1) {
    const diff = (prev[i] ?? 0) ^ (next[i] ?? 0);
    delta[i] = diff;
    if (diff !== 0) changedBytes += 1;
  }
  return { delta, changedBytes };
}

/** Rust `fnv1a_checksum_32`와 비트 단위 동등한 32비트 FNV-1a 체크섬 JS 폴백. */
export function jsFnv1aChecksum32(bytes: Uint8Array): number {
  let hash = 0x811c9dc5 | 0;
  for (let i = 0; i < bytes.length; i += 1) {
    hash = Math.imul(hash ^ (bytes[i] ?? 0), 16777619);
  }
  return hash >>> 0;
}

/** Rust `wasm_sample_world_paper_height`와 동등한 월드 좌표 고정 2층 종이 높이장 JS 폴백. */
export function jsSampleWorldPaperHeight(
  worldX: number,
  worldY: number,
  grainScale: number,
  seed: number,
): number {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY) || !Number.isFinite(grainScale) || grainScale <= 0) {
    return -1;
  }
  const hashGrid = (ix: number, iy: number, s: number): number => {
    let h = (Math.imul(ix | 0, 0x9e3779b1) ^ Math.imul(iy | 0, 0x85ebca77) ^ Math.imul(s >>> 0, 0xc2b2ae3d)) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
    h = Math.imul(h, 0x2c1b3c6d) >>> 0;
    h = (h ^ (h >>> 12)) >>> 0;
    h = Math.imul(h, 0x297a2d39) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
    return f(h / 0xffffffff);
  };
  const quintic = (t: number): number => f(f(f(t * t) * t) * f(f(t * f(f(t * 6) - 15)) + 10));
  const noise2d = (x: number, y: number, s: number): number => {
    const fx = f(Math.floor(x));
    const fy = f(Math.floor(y));
    const ix = fx | 0;
    const iy = fy | 0;
    const tx = quintic(clampF32(f(x - fx), 0, 1));
    const ty = quintic(clampF32(f(y - fy), 0, 1));
    const v00 = hashGrid(ix, iy, s);
    const v10 = hashGrid((ix + 1) | 0, iy, s);
    const v01 = hashGrid(ix, (iy + 1) | 0, s);
    const v11 = hashGrid((ix + 1) | 0, (iy + 1) | 0, s);
    const nx0 = f(v00 + f(f(v10 - v00) * tx));
    const nx1 = f(v01 + f(f(v11 - v01) * tx));
    return f(nx0 + f(f(nx1 - nx0) * ty));
  };

  const macroScale = f(grainScale);
  const microScale = f(macroScale * 4);
  const mx = f(f(worldX) / macroScale);
  const my = f(f(worldY) / macroScale);
  const macroOct1 = noise2d(mx, my, seed >>> 0);
  const macroOct2 = noise2d(f(f(mx * f(2.03)) + f(17.3)), f(f(my * f(2.03)) - f(11.7)), (seed + 101) >>> 0);
  const macroLayer = f(f(macroOct1 * f(0.68)) + f(macroOct2 * f(0.32)));

  const ux = f(f(worldX) / microScale);
  const uy = f(f(worldY) / microScale);
  const rotX = f(f(ux * f(0.8660254)) - f(uy * f(0.5)));
  const rotY = f(f(ux * f(0.5)) + f(uy * f(0.8660254)));
  const fiberNoise = noise2d(rotX, rotY, (seed + 313) >>> 0);
  const tau = f(Math.PI * 2);
  const weaveHarmonic = f(f(f(0.5) + f(f(0.25) * f(Math.sin(f(ux * tau))))) + f(f(0.25) * f(Math.cos(f(uy * tau)))));
  const microLayer = f(f(fiberNoise * f(0.72)) + f(weaveHarmonic * f(0.28)));
  return clampF32(f(f(f(macroLayer * f(0.65)) + f(microLayer * f(0.35))) / f(1.0)), 0, 1);
}
