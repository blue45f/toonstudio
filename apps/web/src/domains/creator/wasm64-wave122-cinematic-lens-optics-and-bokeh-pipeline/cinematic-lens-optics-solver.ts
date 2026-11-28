/**
 * Wave 122 — 웹툰 시네마틱 렌즈 광학 & 대사 보호(Text-Safe) 포스트-그레이딩 RGBA 타일 파이프라인.
 */

import {
  clampFinite,
  computeAnamorphicBokehAxes,
  computeCos4VignetteGain,
  computeLateralCaShiftPx,
  computeThinLensCocPx,
  distortLensUv,
  getCinematicLensPreset,
  linearChannelToSrgb,
  measureDistortionRoundTripError,
  srgbChannelToLinear,
  type BrownConradyDistortionParams,
  type CinematicLensPreset,
  type CinematicLensTileInput,
  type CinematicLensTileResult,
  type DepthCocSample,
  type TextSafeBox,
  type VignetteProfileSample,
} from "./cinematic-lens-presets-and-math";

export {
  CINEMATIC_LENS_PRESETS,
  CINEMATIC_LENS_PRESET_IDS,
  MIN_SAFE_CORNER_VIGNETTE_GAIN,
  clampFinite,
  computeAnamorphicBokehAxes,
  computeCos4VignetteGain,
  computeLateralCaShiftPx,
  computeThinLensCocPx,
  distortLensUv,
  getCinematicLensPreset,
  measureDistortionRoundTripError,
  undistortLensUv,
  type AnamorphicBokehAxes,
  type BrownConradyDistortionParams,
  type CinematicLensPreset,
  type CinematicLensPresetId,
  type CinematicLensTileInput,
  type CinematicLensTileMetrics,
  type CinematicLensTileResult,
  type DepthCocSample,
  type DistortionRoundTripReport,
  type LateralCaShift,
  type LensUvPoint,
  type TextSafeBox,
  type ThinLensCocInput,
  type VignetteProfileSample,
} from "./cinematic-lens-presets-and-math";

const MAX_SUPPORTED_TILE_PIXELS = 2_097_152;
const MAX_BOKEH_KERNEL_RADIUS_PX = 5.0;

const BOKEH_RING_OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 1.35],
  [0.5, 0, 1.0],
  [-0.5, 0, 1.0],
  [0, 0.5, 1.0],
  [0, -0.5, 1.0],
  [1.0, 0, 0.85],
  [-1.0, 0, 0.85],
  [0, 1.0, 0.85],
  [0, -1.0, 0.85],
  [0.7071, 0.7071, 0.85],
  [-0.7071, 0.7071, 0.85],
  [0.7071, -0.7071, 0.85],
  [-0.7071, -0.7071, 0.85],
];

function validateTileInput(input: CinematicLensTileInput): {
  readonly preset: CinematicLensPreset;
  readonly width: number;
  readonly height: number;
  readonly intensity: number;
  readonly focusDistanceM: number;
  readonly apertureFStop: number;
  readonly sanitizedBoxes: readonly TextSafeBox[];
} {
  const preset = getCinematicLensPreset(input.presetId);
  const { width, height, rgba, depthMeters, textSafeBoxes } = input;

  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`유효하지 않은 타일 크기입니다: ${String(width)}x${String(height)}`);
  }
  const pixelCount = width * height;
  if (pixelCount > MAX_SUPPORTED_TILE_PIXELS) {
    throw new Error(`타일 픽셀 수가 상한(${String(MAX_SUPPORTED_TILE_PIXELS)})을 초과했습니다.`);
  }
  if (!(rgba instanceof Uint8ClampedArray) || rgba.length !== pixelCount * 4) {
    throw new Error(
      `RGBA 버퍼 길이(${String(rgba?.length)})가 타일 크기(${String(pixelCount * 4)})와 일치하지 않습니다.`,
    );
  }
  if (depthMeters !== undefined) {
    if (!(depthMeters instanceof Float32Array) || depthMeters.length !== pixelCount) {
      throw new Error(
        `깊이 맵 길이(${String(depthMeters?.length)})가 픽셀 수(${String(pixelCount)})와 일치하지 않습니다.`,
      );
    }
    for (let i = 0; i < pixelCount; i += 1) {
      if (!Number.isFinite(depthMeters[i]) || depthMeters[i] <= 0) {
        throw new Error(`깊이 맵 인덱스 ${String(i)}에 비유효 깊이값(${String(depthMeters[i])})이 있습니다.`);
      }
    }
  }

  const intensity = input.intensity ?? 1.0;
  if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1.5) {
    throw new Error(`광학 효과 강도(intensity)가 허용 범위(0..1.5) 밖입니다: ${String(intensity)}`);
  }
  const focusDistanceM = input.focusDistanceM ?? preset.focusDistanceM;
  if (!Number.isFinite(focusDistanceM) || focusDistanceM <= (preset.focalLengthMm / 1000) * 1.1) {
    throw new Error(`초점 거리(focusDistanceM)가 물리 하한보다 작거나 비유한입니다: ${String(focusDistanceM)}`);
  }
  const apertureFStop = input.apertureFStop ?? preset.apertureFStop;
  if (!Number.isFinite(apertureFStop) || apertureFStop < 0.7 || apertureFStop > 32) {
    throw new Error(`조리개 값(apertureFStop)이 허용 범위(0.7..32) 밖입니다: ${String(apertureFStop)}`);
  }

  const sanitizedBoxes: TextSafeBox[] = [];
  if (textSafeBoxes !== undefined) {
    for (let i = 0; i < textSafeBoxes.length; i += 1) {
      const box = textSafeBoxes[i];
      if (
        !Number.isFinite(box.x) ||
        !Number.isFinite(box.y) ||
        !Number.isFinite(box.width) ||
        !Number.isFinite(box.height) ||
        box.width < 0 ||
        box.height < 0
      ) {
        throw new Error(`대사 보호 영역 #${String(i)} 좌표 또는 크기가 유효하지 않습니다.`);
      }
      sanitizedBoxes.push({
        id: box.id ?? `text-safe-${String(i + 1)}`,
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        labelKo: box.labelKo,
      });
    }
  }

  return { preset, width, height, intensity, focusDistanceM, apertureFStop, sanitizedBoxes };
}

function buildTextSafeMask(
  width: number,
  height: number,
  boxes: readonly TextSafeBox[],
): { readonly mask: Uint8Array; readonly protectedCount: number } {
  const mask = new Uint8Array(width * height);
  let protectedCount = 0;
  for (let bi = 0; bi < boxes.length; bi += 1) {
    const box = boxes[bi];
    const x0 = Math.max(0, Math.floor(box.x));
    const y0 = Math.max(0, Math.floor(box.y));
    const x1 = Math.min(width, Math.ceil(box.x + box.width));
    const y1 = Math.min(height, Math.ceil(box.y + box.height));
    for (let y = y0; y < y1; y += 1) {
      const rowOff = y * width;
      for (let x = x0; x < x1; x += 1) {
        if (mask[rowOff + x] === 0) {
          mask[rowOff + x] = 1;
          protectedCount += 1;
        }
      }
    }
  }
  return { mask, protectedCount };
}

function sampleLinearChannelBilinear(
  srcLinear: Float32Array,
  width: number,
  height: number,
  fx: number,
  fy: number,
  channel: 0 | 1 | 2,
): number {
  const cx = clampFinite(fx, 0, width - 1);
  const cy = clampFinite(fy, 0, height - 1);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = cx - x0;
  const ty = cy - y0;

  const top =
    srcLinear[(y0 * width + x0) * 3 + channel] * (1 - tx) +
    srcLinear[(y0 * width + x1) * 3 + channel] * tx;
  const bottom =
    srcLinear[(y1 * width + x0) * 3 + channel] * (1 - tx) +
    srcLinear[(y1 * width + x1) * 3 + channel] * tx;
  return top * (1 - ty) + bottom * ty;
}

function buildGaussianWeights(radius: number): Float32Array {
  const sigma = Math.max(0.8, radius * 0.55);
  const weights = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let d = -radius; d <= radius; d += 1) {
    const w = Math.exp(-(d * d) / (2 * sigma * sigma));
    weights[d + radius] = w;
    sum += w;
  }
  for (let i = 0; i < weights.length; i += 1) {
    weights[i] /= sum;
  }
  return weights;
}

function applySeparableHalationBlur(
  excess: Float32Array,
  width: number,
  height: number,
  radiusX: number,
  radiusY: number,
): Float32Array {
  const rx = Math.max(1, Math.min(12, Math.round(radiusX)));
  const ry = Math.max(1, Math.min(12, Math.round(radiusY)));
  const horiz = new Float32Array(width * height);
  const out = new Float32Array(width * height);
  const weightsX = buildGaussianWeights(rx);
  const weightsY = buildGaussianWeights(ry);

  for (let y = 0; y < height; y += 1) {
    const rowOff = y * width;
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      for (let dx = -rx; dx <= rx; dx += 1) {
        acc += excess[rowOff + Math.max(0, Math.min(width - 1, x + dx))] * weightsX[dx + rx];
      }
      horiz[rowOff + x] = acc;
    }
  }
  for (let y = 0; y < height; y += 1) {
    const rowOff = y * width;
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      for (let dy = -ry; dy <= ry; dy += 1) {
        acc += horiz[Math.max(0, Math.min(height - 1, y + dy)) * width + x] * weightsY[dy + ry];
      }
      out[rowOff + x] = acc;
    }
  }
  return out;
}

/**
 * RGBA 타일에 Brown-Conrady 왜곡 + 측면 색수차 + 물리 DoF 아나모픽 보케 + 필름 할레이션 +
 * Cos⁴ 비네팅을 적용하되, 대사 보호 마스크(`textSafeBoxes`) 영역은 100% 무손실 보존한다.
 */
export function applyCinematicLensOpticsToTile(
  input: CinematicLensTileInput,
): CinematicLensTileResult {
  const { preset, width, height, intensity, focusDistanceM, apertureFStop, sanitizedBoxes } =
    validateTileInput(input);
  const pixelCount = width * height;
  const prefersReducedMotion = input.prefersReducedMotion === true;
  const effectiveShutterJitterPx = prefersReducedMotion
    ? 0
    : preset.shutterJitterAmplitudePx * intensity;

  const { mask: textSafeMask, protectedCount: textSafeProtectedPixelCount } = buildTextSafeMask(
    width,
    height,
    sanitizedBoxes,
  );

  const srcLinear = new Float32Array(pixelCount * 3);
  for (let i = 0; i < pixelCount; i += 1) {
    const o4 = i * 4;
    const o3 = i * 3;
    srcLinear[o3] = srgbChannelToLinear(input.rgba[o4] / 255);
    srcLinear[o3 + 1] = srgbChannelToLinear(input.rgba[o4 + 1] / 255);
    srcLinear[o3 + 2] = srgbChannelToLinear(input.rgba[o4 + 2] / 255);
  }

  const distortionParams: BrownConradyDistortionParams = {
    k1: preset.distortionK1 * intensity,
    k2: preset.distortionK2 * intensity,
    p1: preset.tangentialP1 * intensity,
    p2: preset.tangentialP2 * intensity,
  };

  const gradedLinear = new Float32Array(pixelCount * 3);
  let maxObservedCocPx = 0;

  // Pass 1: Brown-Conrady 왜곡 + 측면 CA + 아나모픽 DoF 보케
  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const o3 = idx * 3;
      if (textSafeMask[idx] === 1) {
        gradedLinear[o3] = srcLinear[o3];
        gradedLinear[o3 + 1] = srcLinear[o3 + 1];
        gradedLinear[o3 + 2] = srcLinear[o3 + 2];
        continue;
      }

      const u = (x + 0.5) / width;
      const distorted = distortLensUv({ u, v }, distortionParams);
      const baseFx = distorted.u * width - 0.5;
      const baseFy = distorted.v * height - 0.5;
      const ca = computeLateralCaShiftPx(u, v, preset, intensity);
      const depthM = input.depthMeters !== undefined ? input.depthMeters[idx] : focusDistanceM;
      const physicalCoc =
        computeThinLensCocPx({
          depthM,
          focusDistanceM,
          focalLengthMm: preset.focalLengthMm,
          apertureFStop,
          sensorWidthMm: preset.sensorWidthMm,
          imageWidthPx: width,
        }) * intensity;
      if (physicalCoc > maxObservedCocPx) {
        maxObservedCocPx = physicalCoc;
      }

      const kernelCoc = Math.min(physicalCoc, MAX_BOKEH_KERNEL_RADIUS_PX * 2);
      if (kernelCoc <= 0.35) {
        gradedLinear[o3] = sampleLinearChannelBilinear(srcLinear, width, height, baseFx + ca.redOffsetPxX, baseFy + ca.redOffsetPxY, 0);
        gradedLinear[o3 + 1] = sampleLinearChannelBilinear(srcLinear, width, height, baseFx, baseFy, 1);
        gradedLinear[o3 + 2] = sampleLinearChannelBilinear(srcLinear, width, height, baseFx + ca.blueOffsetPxX, baseFy + ca.blueOffsetPxY, 2);
      } else {
        const axes = computeAnamorphicBokehAxes(kernelCoc, preset);
        const swirlAngle = preset.swirlFactor > 0 ? Math.atan2(v - 0.5, u - 0.5) * preset.swirlFactor : 0;
        const cosA = Math.cos(swirlAngle);
        const sinA = Math.sin(swirlAngle);
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let sumW = 0;

        for (let ti = 0; ti < BOKEH_RING_OFFSETS.length; ti += 1) {
          const [ox, oy, w] = BOKEH_RING_OFFSETS[ti];
          const lx = ox * axes.horizontalRadiusPx;
          const ly = oy * axes.verticalRadiusPx;
          const sx = baseFx + (lx * cosA - ly * sinA);
          const sy = baseFy + (lx * sinA + ly * cosA);
          const sampleXi = Math.max(0, Math.min(width - 1, Math.round(sx)));
          const sampleYi = Math.max(0, Math.min(height - 1, Math.round(sy)));
          const tapWeight = textSafeMask[sampleYi * width + sampleXi] === 1 ? w * 0.15 : w;

          sumR += sampleLinearChannelBilinear(srcLinear, width, height, sx + ca.redOffsetPxX, sy + ca.redOffsetPxY, 0) * tapWeight;
          sumG += sampleLinearChannelBilinear(srcLinear, width, height, sx, sy, 1) * tapWeight;
          sumB += sampleLinearChannelBilinear(srcLinear, width, height, sx + ca.blueOffsetPxX, sy + ca.blueOffsetPxY, 2) * tapWeight;
          sumW += tapWeight;
        }
        const invW = sumW > 0 ? 1 / sumW : 1;
        gradedLinear[o3] = sumR * invW;
        gradedLinear[o3 + 1] = sumG * invW;
        gradedLinear[o3 + 2] = sumB * invW;
      }
    }
  }

  // Pass 2: 고휘도 필름 할레이션(Halation)
  let halationActivatedPixelCount = 0;
  let maxHalationEnergyAdded = 0;
  const effectiveHalation = preset.halationIntensity * intensity;
  if (effectiveHalation > 0) {
    const excess = new Float32Array(pixelCount);
    const denom = Math.max(0.05, 1 - preset.halationThresholdLuma);
    let hasBrightPeak = false;
    for (let i = 0; i < pixelCount; i += 1) {
      if (textSafeMask[i] === 1) {
        continue;
      }
      const o3 = i * 3;
      const luma = 0.2126 * gradedLinear[o3] + 0.7152 * gradedLinear[o3 + 1] + 0.0722 * gradedLinear[o3 + 2];
      if (luma > preset.halationThresholdLuma) {
        excess[i] = (luma - preset.halationThresholdLuma) / denom;
        hasBrightPeak = true;
      }
    }
    if (hasBrightPeak) {
      const bloom = applySeparableHalationBlur(
        excess,
        width,
        height,
        preset.halationRadiusPx * preset.anamorphicSqueeze,
        preset.halationRadiusPx,
      );
      const [tintR, tintG, tintB] = preset.halationTintRgb;
      for (let i = 0; i < pixelCount; i += 1) {
        if (textSafeMask[i] === 1) {
          continue;
        }
        const energy = bloom[i] * effectiveHalation;
        if (energy > 1e-4) {
          const o3 = i * 3;
          gradedLinear[o3] = Math.min(1.0, gradedLinear[o3] + energy * tintR);
          gradedLinear[o3 + 1] = Math.min(1.0, gradedLinear[o3 + 1] + energy * tintG);
          gradedLinear[o3 + 2] = Math.min(1.0, gradedLinear[o3 + 2] + energy * tintB);
          halationActivatedPixelCount += 1;
          if (energy > maxHalationEnergyAdded) {
            maxHalationEnergyAdded = energy;
          }
        }
      }
    }
  }

  // Pass 3: Cos⁴ 물리 비네팅 + sRGB 인코딩 + 대사 보호 마스크 무손실 검증
  const outputRgba = new Uint8ClampedArray(pixelCount * 4);
  let textBoxCorruptedPixelCount = 0;
  let nonFiniteOrOutOfRangeChannelCount = 0;

  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const o4 = idx * 4;
      if (textSafeMask[idx] === 1) {
        outputRgba[o4] = input.rgba[o4];
        outputRgba[o4 + 1] = input.rgba[o4 + 1];
        outputRgba[o4 + 2] = input.rgba[o4 + 2];
        outputRgba[o4 + 3] = input.rgba[o4 + 3];
        if (
          outputRgba[o4] !== input.rgba[o4] ||
          outputRgba[o4 + 1] !== input.rgba[o4 + 1] ||
          outputRgba[o4 + 2] !== input.rgba[o4 + 2] ||
          outputRgba[o4 + 3] !== input.rgba[o4 + 3]
        ) {
          textBoxCorruptedPixelCount += 1;
        }
        continue;
      }

      const u = (x + 0.5) / width;
      const vignetteGain = computeCos4VignetteGain(u, v, preset, intensity);
      const o3 = idx * 3;
      const rOut = Math.round(linearChannelToSrgb(gradedLinear[o3] * vignetteGain) * 255);
      const gOut = Math.round(linearChannelToSrgb(gradedLinear[o3 + 1] * vignetteGain) * 255);
      const bOut = Math.round(linearChannelToSrgb(gradedLinear[o3 + 2] * vignetteGain) * 255);
      const aOut = input.rgba[o4 + 3];
      for (const ch of [rOut, gOut, bOut, aOut]) {
        if (!Number.isFinite(ch) || ch < 0 || ch > 255) {
          nonFiniteOrOutOfRangeChannelCount += 1;
        }
      }
      outputRgba[o4] = clampFinite(rOut, 0, 255);
      outputRgba[o4 + 1] = clampFinite(gOut, 0, 255);
      outputRgba[o4 + 2] = clampFinite(bOut, 0, 255);
      outputRgba[o4 + 3] = aOut;
    }
  }

  const roundTrip = measureDistortionRoundTripError(distortionParams, 9);
  const centerCa = computeLateralCaShiftPx(0.5, 0.5, preset, intensity);
  const edgeCa = computeLateralCaShiftPx(1.0, 0.5, preset, intensity);
  const cornerCa = computeLateralCaShiftPx(1.0, 1.0, preset, intensity);
  const focusPlaneCocPx = computeThinLensCocPx({
    depthM: focusDistanceM,
    focusDistanceM,
    focalLengthMm: preset.focalLengthMm,
    apertureFStop,
    sensorWidthMm: preset.sensorWidthMm,
    imageWidthPx: width,
  });

  const centerVignetteGain = computeCos4VignetteGain(0.5, 0.5, preset, intensity);
  const minCornerVignetteGain = Math.min(
    computeCos4VignetteGain(0, 0, preset, intensity),
    computeCos4VignetteGain(1, 0, preset, intensity),
    computeCos4VignetteGain(0, 1, preset, intensity),
    computeCos4VignetteGain(1, 1, preset, intensity),
  );

  const depthMultipliers = [0.45, 0.65, 0.82, 1.0, 1.35, 1.85, 2.6, 4.0];
  const depthCocProfile: DepthCocSample[] = depthMultipliers.map((mult) => {
    const exactDepth =
      mult === 1.0
        ? focusDistanceM
        : Math.max((preset.focalLengthMm / 1000) * 1.25, Math.round(focusDistanceM * mult * 100) / 100);
    return {
      depthM: exactDepth,
      cocPx:
        computeThinLensCocPx({
          depthM: exactDepth,
          focusDistanceM,
          focalLengthMm: preset.focalLengthMm,
          apertureFStop,
          sensorWidthMm: preset.sensorWidthMm,
          imageWidthPx: Math.max(width, 640),
        }) * intensity,
    };
  });

  const vignetteProfile: VignetteProfileSample[] = [];
  for (let pi = 0; pi <= 10; pi += 1) {
    const radialNorm = pi / 10;
    vignetteProfile.push({
      radialNorm,
      gain: computeCos4VignetteGain(0.5 + 0.5 * radialNorm, 0.5 + 0.5 * radialNorm, preset, intensity),
    });
  }

  return {
    preset,
    width,
    height,
    outputRgba,
    sceneTitleKo: input.sceneTitleKo ?? `${preset.nameKo} 시네마틱 컷`,
    intensity,
    focusDistanceM,
    apertureFStop,
    prefersReducedMotion,
    effectiveShutterJitterPx,
    textSafeBoxes: sanitizedBoxes,
    metrics: {
      maxDistortionRoundTripUvError: roundTrip.maxRoundTripUvError,
      centerDistortionDriftUv: roundTrip.centerDriftUv,
      centerCaSeparationPx: centerCa.totalSeparationPx,
      edgeCaSeparationPx: edgeCa.totalSeparationPx,
      cornerCaSeparationPx: cornerCa.totalSeparationPx,
      focusPlaneCocPx,
      maxObservedCocPx,
      bokehAspectRatio: preset.bokehAspectRatio,
      centerVignetteGain,
      minCornerVignetteGain,
      halationActivatedPixelCount,
      maxHalationEnergyAdded,
      textSafeBoxCount: sanitizedBoxes.length,
      textSafeProtectedPixelCount,
      textBoxCorruptedPixelCount,
      nonFiniteOrOutOfRangeChannelCount,
      centerRegionSharpnessPreserved:
        roundTrip.centerDriftUv === 0 &&
        centerCa.totalSeparationPx === 0 &&
        centerVignetteGain >= 0.98 &&
        focusPlaneCocPx === 0,
    },
    depthCocProfile,
    vignetteProfile,
  };
}
