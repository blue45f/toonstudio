/**
 * Wave-35: 선형광(Linear-Light) 및 지각 균등 OKLCH 색공간 기반 웹툰 레이어 블렌딩·마감 포스트FX 파이프라인.
 *
 * 피부·음영 셀 채색에 단순 sRGB 곱하기(Multiply)를 적용할 때 발생하는 탁한 회색 채도 붕괴를
 * 안료 투과 영감의 OKLCH 채도 보존 음영 블렌드로 방지하고, 소프트 니(Soft-Knee) HDR 림라이트 블룸,
 * Z-깊이 대기 원근 헤이즈, 먹선 보호 마스크를 결합해 선화 선명도를 훼손하지 않고 마감 효과를 합성한다.
 */

export interface OklchColor {
  readonly l: number;
  readonly c: number;
  /** 색상각 [0..360) deg */
  readonly hDeg: number;
}

export type ComicLayerBlendMode =
  | "normal"
  | "naive-srgb-multiply"
  | "spectral-oklch-shadow-multiply"
  | "linear-screen-glow"
  | "soft-cel-tint";

export type ComicLayerRole = "background" | "flat-color" | "shadow" | "rim-light" | "lineart";

export interface ComicRasterLayer {
  readonly id: string;
  readonly role: ComicLayerRole;
  readonly blendMode: ComicLayerBlendMode;
  readonly opacity: number;
  /** 카메라로부터의 깊이(m): 0 = 전경 캐릭터/선화, 양수 = 중경·배경 */
  readonly zDepthMeters?: number;
  /** 림라이트 등 발광 레이어의 선형 휘도 증폭 배율 (기본값 1) */
  readonly hdrGain?: number;
  /** sRGB 직선 알파(Straight Alpha) 버퍼 [0..1], 길이 width * height * 4 */
  readonly srgbRgba: Float32Array;
}

export interface LinearComicBlendResult {
  readonly width: number;
  readonly height: number;
  readonly linearRgba: Float32Array;
  readonly srgbRgba: Float32Array;
  readonly zDepthMapMeters: Float32Array;
  readonly inkProtectionMask: Float32Array;
  readonly meanShadowChromaOklch: number;
}

export interface WebtoonPostFxOptions {
  readonly bloomThreshold?: number;
  readonly bloomSoftKnee?: number;
  readonly bloomIntensity?: number;
  readonly bloomRadiusPx?: number;
  readonly hazeDensity?: number;
  readonly hazeNearStartMeters?: number;
  readonly hazeColorLinearRgb?: readonly [number, number, number];
  /** 먹선 보호 강도 [0..1] (기본값 1.0 = 흑색 먹선 위 블룸·헤이즈 침투 완전 차단) */
  readonly inkProtectionStrength?: number;
}

export interface WebtoonPostFxReport {
  readonly width: number;
  readonly height: number;
  readonly linearRgba: Float32Array;
  readonly srgbRgba: Float32Array;
  readonly bloomExtractedLuminanceMax: number;
  readonly bloomActivePixelCount: number;
  readonly meanBackgroundHazeFactor: number;
  readonly protectedInkPixelCount: number;
  readonly maxInkLuminanceDrift: number;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** IEC 61966-2-1 표준 sRGB 단일 채널을 선형광(Linear sRGB)으로 변환한다. */
export function srgbChannelToLinear(srgb: number): number {
  const v = clamp01(srgb);
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** 선형광(Linear sRGB) 단일 채널을 디스플레이용 sRGB [0..1]로 감마 인코딩한다. */
export function linearChannelToSrgb(linear: number): number {
  const v = clamp01(linear);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

function linearLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 선형 sRGB 색상을 지각 균등 OKLCH(명도 L, 채도 C, 색상각 H)로 변환한다. */
export function linearRgbToOklch(r: number, g: number, b: number): OklchColor {
  const lCbrt = Math.cbrt(Math.max(0, 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b));
  const mCbrt = Math.cbrt(Math.max(0, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b));
  const sCbrt = Math.cbrt(Math.max(0, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b));

  const okL = 0.2104542553 * lCbrt + 0.793617785 * mCbrt - 0.0040720468 * sCbrt;
  const okA = 1.9779984951 * lCbrt - 2.428592205 * mCbrt + 0.4505937099 * sCbrt;
  const okB = 0.0259040371 * lCbrt + 0.7827717662 * mCbrt - 0.808675766 * sCbrt;

  const rawDeg = (Math.atan2(okB, okA) * 180) / Math.PI;
  return { l: clamp01(okL), c: Math.hypot(okA, okB), hDeg: ((rawDeg % 360) + 360) % 360 };
}

function oklchToLinearRgbRaw(okL: number, okC: number, okHDeg: number): readonly [number, number, number] {
  const rad = (okHDeg * Math.PI) / 180;
  const okA = okC * Math.cos(rad);
  const okB = okC * Math.sin(rad);

  const lCbrt = okL + 0.3963377774 * okA + 0.2158037573 * okB;
  const mCbrt = okL - 0.1055613458 * okA - 0.0638541728 * okB;
  const sCbrt = okL - 0.0894841775 * okA - 1.291485548 * okB;

  const l = lCbrt * lCbrt * lCbrt;
  const m = mCbrt * mCbrt * mCbrt;
  const s = sCbrt * sCbrt * sCbrt;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function isInLinearSrgbGamut(rgb: readonly [number, number, number]): boolean {
  const eps = 1e-5;
  return (
    rgb[0] >= -eps && rgb[0] <= 1 + eps &&
    rgb[1] >= -eps && rgb[1] <= 1 + eps &&
    rgb[2] >= -eps && rgb[2] <= 1 + eps
  );
}

/**
 * 명도(L)와 색상각(H)을 고정한 채 sRGB 색역 경계 안으로 채도(C)만 이진 탐색 클램핑해 색틀어짐 없이 선형 RGB로 역변환한다.
 */
export function oklchToLinearRgbGamutSafe(
  okL: number,
  okC: number,
  okHDeg: number,
): readonly [number, number, number] {
  if (okL <= 0) return [0, 0, 0];
  if (okL >= 1) return [1, 1, 1];

  const candidate = oklchToLinearRgbRaw(okL, Math.max(0, okC), okHDeg);
  if (isInLinearSrgbGamut(candidate)) {
    return [clamp01(candidate[0]), clamp01(candidate[1]), clamp01(candidate[2])];
  }

  let low = 0;
  let high = Math.max(0, okC);
  for (let iter = 0; iter < 12; iter += 1) {
    const mid = 0.5 * (low + high);
    if (isInLinearSrgbGamut(oklchToLinearRgbRaw(okL, mid, okHDeg))) low = mid;
    else high = mid;
  }
  const clamped = oklchToLinearRgbRaw(okL, low, okHDeg);
  return [clamp01(clamped[0]), clamp01(clamped[1]), clamp01(clamped[2])];
}

function interpolateHueCircularDeg(hA: number, hB: number, t: number): number {
  let delta = ((hB - hA + 540) % 360) - 180;
  if (delta === -180) delta = 180;
  return (((hA + delta * clamp01(t)) % 360) + 360) % 360;
}

function blendPixelRgb(
  mode: ComicLayerBlendMode,
  dst: readonly [number, number, number],
  src: readonly [number, number, number],
  hdrGain: number,
): readonly [number, number, number] {
  if (mode === "normal") return [src[0] * hdrGain, src[1] * hdrGain, src[2] * hdrGain];
  if (mode === "naive-srgb-multiply") {
    return [
      srgbChannelToLinear(linearChannelToSrgb(dst[0]) * linearChannelToSrgb(src[0])),
      srgbChannelToLinear(linearChannelToSrgb(dst[1]) * linearChannelToSrgb(src[1])),
      srgbChannelToLinear(linearChannelToSrgb(dst[2]) * linearChannelToSrgb(src[2])),
    ];
  }
  if (mode === "spectral-oklch-shadow-multiply") {
    const baseOklch = linearRgbToOklch(clamp01(dst[0]), clamp01(dst[1]), clamp01(dst[2]));
    const srcOklch = linearRgbToOklch(clamp01(src[0]), clamp01(src[1]), clamp01(src[2]));
    const mulOklch = linearRgbToOklch(
      clamp01(dst[0]) * clamp01(src[0]),
      clamp01(dst[1]) * clamp01(src[1]),
      clamp01(dst[2]) * clamp01(src[2]),
    );
    const midtoneBell = Math.sin(Math.PI * clamp(mulOklch.l, 0.08, 0.92));
    const preservedChroma = Math.max(
      mulOklch.c,
      baseOklch.c * (1.06 + 0.26 * midtoneBell) + srcOklch.c * 0.36,
    );
    const hueShiftWeight =
      srcOklch.c > 0.012 ? clamp01((srcOklch.c / (baseOklch.c + srcOklch.c + 1e-4)) * 0.45) : 0;
    const blendedHue =
      baseOklch.c > 0.005
        ? interpolateHueCircularDeg(baseOklch.hDeg, srcOklch.hDeg, hueShiftWeight)
        : srcOklch.hDeg;
    return oklchToLinearRgbGamutSafe(mulOklch.l, preservedChroma, blendedHue);
  }
  if (mode === "linear-screen-glow") {
    const bR = src[0] * hdrGain;
    const bG = src[1] * hdrGain;
    const bB = src[2] * hdrGain;
    if (hdrGain > 1) return [dst[0] + bR, dst[1] + bG, dst[2] + bB];
    return [
      1 - (1 - clamp01(dst[0])) * (1 - clamp01(bR)),
      1 - (1 - clamp01(dst[1])) * (1 - clamp01(bG)),
      1 - (1 - clamp01(dst[2])) * (1 - clamp01(bB)),
    ];
  }
  const dstOklch = linearRgbToOklch(clamp01(dst[0]), clamp01(dst[1]), clamp01(dst[2]));
  const srcOklch = linearRgbToOklch(clamp01(src[0]), clamp01(src[1]), clamp01(src[2]));
  const mixedHue = interpolateHueCircularDeg(dstOklch.hDeg, srcOklch.hDeg, 0.65);
  return oklchToLinearRgbGamutSafe(dstOklch.l, Math.max(dstOklch.c, srcOklch.c * 0.85), mixedHue);
}

/**
 * 다중 만화 래스터 레이어를 선형광 및 지각 균등 OKLCH 색공간에서 합성하고
 * 픽셀별 Z-깊이 맵과 흑색 선화 보호 마스크를 함께 생성한다.
 */
export function blendLinearComicLayers(
  layers: readonly ComicRasterLayer[],
  width: number,
  height: number,
): LinearComicBlendResult {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const pixelCount = safeW * safeH;

  const linearRgba = new Float32Array(pixelCount * 4);
  const srgbRgba = new Float32Array(pixelCount * 4);
  const zDepthMapMeters = new Float32Array(pixelCount);
  const inkProtectionMask = new Float32Array(pixelCount);
  const touchedShadowMask = new Uint8Array(pixelCount);

  for (let i = 0; i < pixelCount; i += 1) {
    linearRgba[i * 4] = 1;
    linearRgba[i * 4 + 1] = 1;
    linearRgba[i * 4 + 2] = 1;
  }

  for (const layer of layers) {
    const layerOpacity = clamp01(layer.opacity);
    if (layerOpacity <= 0) continue;
    const zMeters = Math.max(0, layer.zDepthMeters ?? 0);
    const hdrGain = Math.max(0, layer.hdrGain ?? 1);

    for (let px = 0; px < pixelCount; px += 1) {
      const idx = px * 4;
      const srcA = clamp01(layer.srgbRgba[idx + 3] ?? 0) * layerOpacity;
      if (srcA <= 1e-6) continue;

      const srcLin: readonly [number, number, number] = [
        srgbChannelToLinear(layer.srgbRgba[idx] ?? 0),
        srgbChannelToLinear(layer.srgbRgba[idx + 1] ?? 0),
        srgbChannelToLinear(layer.srgbRgba[idx + 2] ?? 0),
      ];
      const dstA = linearRgba[idx + 3];

      if (dstA <= 1e-6) {
        linearRgba[idx] = srcLin[0] * hdrGain;
        linearRgba[idx + 1] = srcLin[1] * hdrGain;
        linearRgba[idx + 2] = srcLin[2] * hdrGain;
        linearRgba[idx + 3] = srcA;
        zDepthMapMeters[px] = zMeters;
      } else {
        const dstLin: readonly [number, number, number] = [
          linearRgba[idx],
          linearRgba[idx + 1],
          linearRgba[idx + 2],
        ];
        const blended = blendPixelRgb(layer.blendMode, dstLin, srcLin, hdrGain);
        const outA = srcA + dstA * (1 - srcA);
        linearRgba[idx] = outA > 1e-6 ? (blended[0] * srcA + dstLin[0] * dstA * (1 - srcA)) / outA : 0;
        linearRgba[idx + 1] = outA > 1e-6 ? (blended[1] * srcA + dstLin[1] * dstA * (1 - srcA)) / outA : 0;
        linearRgba[idx + 2] = outA > 1e-6 ? (blended[2] * srcA + dstLin[2] * dstA * (1 - srcA)) / outA : 0;
        linearRgba[idx + 3] = outA;

        if (layer.role !== "shadow" && layer.role !== "rim-light") {
          zDepthMapMeters[px] = zDepthMapMeters[px] * (1 - srcA) + zMeters * srcA;
        }
      }

      if (layer.role === "shadow" && srcA > 0.05) touchedShadowMask[px] = 1;
      if (layer.role === "lineart") {
        const darkness = clamp01(1 - linearLuminance(srcLin[0], srcLin[1], srcLin[2]) * 1.25);
        inkProtectionMask[px] = clamp01(inkProtectionMask[px] + srcA * darkness);
        if (srcA > 0.5) zDepthMapMeters[px] = zMeters;
      }
    }
  }

  let shadowChromaSum = 0;
  let shadowCount = 0;
  for (let px = 0; px < pixelCount; px += 1) {
    const idx = px * 4;
    const r = linearRgba[idx];
    const g = linearRgba[idx + 1];
    const b = linearRgba[idx + 2];
    srgbRgba[idx] = linearChannelToSrgb(r);
    srgbRgba[idx + 1] = linearChannelToSrgb(g);
    srgbRgba[idx + 2] = linearChannelToSrgb(b);
    srgbRgba[idx + 3] = clamp01(linearRgba[idx + 3]);

    if (touchedShadowMask[px] === 1 && inkProtectionMask[px] < 0.5) {
      shadowChromaSum += linearRgbToOklch(clamp01(r), clamp01(g), clamp01(b)).c;
      shadowCount += 1;
    }
  }

  return {
    width: safeW,
    height: safeH,
    linearRgba,
    srgbRgba,
    zDepthMapMeters,
    inkProtectionMask,
    meanShadowChromaOklch: shadowCount > 0 ? shadowChromaSum / shadowCount : 0,
  };
}

function blurRgbSeparableTent(
  srcRgb: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  const horiz = new Float32Array(width * height * 3);
  const out = new Float32Array(width * height * 3);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let accR = 0;
      let accG = 0;
      let accB = 0;
      let wSum = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const w = radius + 1 - Math.abs(k);
        const sIdx = (y * width + clamp(x + k, 0, width - 1)) * 3;
        accR += srcRgb[sIdx] * w;
        accG += srcRgb[sIdx + 1] * w;
        accB += srcRgb[sIdx + 2] * w;
        wSum += w;
      }
      const dIdx = (y * width + x) * 3;
      horiz[dIdx] = accR / wSum;
      horiz[dIdx + 1] = accG / wSum;
      horiz[dIdx + 2] = accB / wSum;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let accR = 0;
      let accG = 0;
      let accB = 0;
      let wSum = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const w = radius + 1 - Math.abs(k);
        const sIdx = (clamp(y + k, 0, height - 1) * width + x) * 3;
        accR += horiz[sIdx] * w;
        accG += horiz[sIdx + 1] * w;
        accB += horiz[sIdx + 2] * w;
        wSum += w;
      }
      const dIdx = (y * width + x) * 3;
      out[dIdx] = accR / wSum;
      out[dIdx + 1] = accG / wSum;
      out[dIdx + 2] = accB / wSum;
    }
  }
  return out;
}

/**
 * 합성된 선형 레이어 버퍼에 소프트 니 HDR 림라이트 블룸과 Z-깊이 대기 원근 헤이즈를 적용하되,
 * 먹선 보호 마스크 영역에서는 포스트FX 번짐을 차단해 또렷한 만화 선화를 유지한다.
 */
export function applyWebtoonFinishingPostFx(
  composited: LinearComicBlendResult,
  options: WebtoonPostFxOptions = {},
): WebtoonPostFxReport {
  const { width, height } = composited;
  const pixelCount = width * height;
  const threshold = Math.max(0.05, options.bloomThreshold ?? 0.78);
  const softKnee = clamp(options.bloomSoftKnee ?? 0.18, 0, 1);
  const bloomIntensity = Math.max(0, options.bloomIntensity ?? 0.45);
  const bloomRadius = Math.round(clamp(options.bloomRadiusPx ?? 2, 1, 8));
  const hazeDensity = Math.max(0, options.hazeDensity ?? 0.06);
  const hazeNear = Math.max(0, options.hazeNearStartMeters ?? 2);
  const hazeColor = options.hazeColorLinearRgb ?? [0.82, 0.88, 0.96];
  const inkProtectionStrength = clamp01(options.inkProtectionStrength ?? 1);

  const kneeWidth = Math.max(1e-5, threshold * softKnee);
  const brightPassRgb = new Float32Array(pixelCount * 3);
  let bloomExtractedLuminanceMax = 0;
  let bloomActivePixelCount = 0;

  for (let px = 0; px < pixelCount; px += 1) {
    const idx4 = px * 4;
    const idx3 = px * 3;
    const r = composited.linearRgba[idx4];
    const g = composited.linearRgba[idx4 + 1];
    const b = composited.linearRgba[idx4 + 2];
    const lum = linearLuminance(r, g, b);

    const protect = clamp01(composited.inkProtectionMask[px] * inkProtectionStrength);
    const soft = clamp(lum - threshold + kneeWidth, 0, 2 * kneeWidth);
    const extracted = Math.max((soft * soft) / (4 * kneeWidth), lum - threshold) * (1 - protect);

    if (extracted > 1e-5 && lum > 1e-5) {
      bloomActivePixelCount += 1;
      bloomExtractedLuminanceMax = Math.max(bloomExtractedLuminanceMax, extracted);
      const gain = extracted / lum;
      brightPassRgb[idx3] = r * gain;
      brightPassRgb[idx3 + 1] = g * gain;
      brightPassRgb[idx3 + 2] = b * gain;
    }
  }

  const blurredBloom =
    bloomIntensity > 0 && bloomActivePixelCount > 0
      ? blurRgbSeparableTent(brightPassRgb, width, height, bloomRadius)
      : brightPassRgb;

  const outLinear = new Float32Array(pixelCount * 4);
  const outSrgb = new Float32Array(pixelCount * 4);
  let bgHazeSum = 0;
  let bgPixelCount = 0;
  let protectedInkPixelCount = 0;
  let maxInkLuminanceDrift = 0;

  for (let px = 0; px < pixelCount; px += 1) {
    const idx4 = px * 4;
    const idx3 = px * 3;
    const baseR = composited.linearRgba[idx4];
    const baseG = composited.linearRgba[idx4 + 1];
    const baseB = composited.linearRgba[idx4 + 2];
    const baseA = composited.linearRgba[idx4 + 3];

    const rawInkMask = composited.inkProtectionMask[px];
    const postFxAllowance = 1 - clamp01(rawInkMask * inkProtectionStrength);
    const depthDelta = Math.max(0, composited.zDepthMapMeters[px] - hazeNear);
    const effectiveHaze = (1 - Math.exp(-hazeDensity * depthDelta)) * postFxAllowance;

    if (depthDelta > 0 && rawInkMask < 0.5) {
      bgHazeSum += effectiveHaze;
      bgPixelCount += 1;
    }

    const finalR = baseR * (1 - effectiveHaze) + hazeColor[0] * effectiveHaze + blurredBloom[idx3] * bloomIntensity * postFxAllowance;
    const finalG = baseG * (1 - effectiveHaze) + hazeColor[1] * effectiveHaze + blurredBloom[idx3 + 1] * bloomIntensity * postFxAllowance;
    const finalB = baseB * (1 - effectiveHaze) + hazeColor[2] * effectiveHaze + blurredBloom[idx3 + 2] * bloomIntensity * postFxAllowance;

    outLinear[idx4] = finalR;
    outLinear[idx4 + 1] = finalG;
    outLinear[idx4 + 2] = finalB;
    outLinear[idx4 + 3] = baseA;
    outSrgb[idx4] = linearChannelToSrgb(finalR);
    outSrgb[idx4 + 1] = linearChannelToSrgb(finalG);
    outSrgb[idx4 + 2] = linearChannelToSrgb(finalB);
    outSrgb[idx4 + 3] = clamp01(baseA);

    if (rawInkMask >= 0.85) {
      protectedInkPixelCount += 1;
      const drift = Math.abs(linearLuminance(finalR, finalG, finalB) - linearLuminance(baseR, baseG, baseB));
      maxInkLuminanceDrift = Math.max(maxInkLuminanceDrift, drift);
    }
  }

  return {
    width,
    height,
    linearRgba: outLinear,
    srgbRgba: outSrgb,
    bloomExtractedLuminanceMax,
    bloomActivePixelCount,
    meanBackgroundHazeFactor: bgPixelCount > 0 ? bgHazeSum / bgPixelCount : 0,
    protectedInkPixelCount,
    maxInkLuminanceDrift,
  };
}
