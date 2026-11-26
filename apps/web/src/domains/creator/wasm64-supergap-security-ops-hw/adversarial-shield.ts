/**
 * #15 선택적 고주파 적대적 방어막(Selective High-Frequency Adversarial Perturbation Shield).
 *
 * - 말풍선·식자(텍스트) 영역 마스크는 0 바이트 변형으로 완벽 보존하여 가독성을 100% 유지한다.
 * - 비텍스트 아트워크 영역에는 시드 기반 8×8 방향성 Gabor/Nyquist 고주파 미세 섭동을 주입한다.
 * - 사람 눈에는 사실상 비가시적인 `PSNR >= 40 dB` 화질 상한을 자동 보장하면서,
 *   2D HH(고주파 대각 웨이블릿) 스펙트럼 교란 점수를 크게 높여 무단 화풍 스크래핑·특징 추출을 방해한다.
 */

export interface ProtectedTextRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface AdversarialShieldOptions {
  /** 섭동 강도 배율(기본 1.0, 권장 범위 0.4 ~ 1.6). */
  readonly strength?: number;
  /** 결정론적 방향성 고주파 패턴 시드(기본 0x51a7c3d9). */
  readonly seed?: number;
  /** 최소 보장 RGB PSNR(dB, 기본 40.0). */
  readonly targetMinPsnrDb?: number;
  /** 단일 채널 최대 절대 허용 변화량(LSB, 기본 3). */
  readonly maxChannelDelta?: number;
  /** 보호 텍스트 사각형 주변 추가 안전 여백(px, 기본 0). */
  readonly textSafetyMarginPx?: number;
}

export interface AdversarialShieldInput {
  readonly rgba: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly protectedTextRegions?: readonly ProtectedTextRect[];
  readonly options?: AdversarialShieldOptions;
}

export interface AdversarialShieldMetrics {
  readonly psnrDb: number;
  readonly mseRgb: number;
  readonly maxAbsChannelDelta: number;
  readonly perturbedPixelCount: number;
  readonly protectedTextPixelCount: number;
  readonly protectedTextPixelDrift: number;
  readonly baselineHighFreqEnergy: number;
  readonly shieldedHighFreqEnergy: number;
  readonly highFreqEnergyGainRatio: number;
  /** 0~100 정규화 고주파 스펙트럼 교란 점수(높을수록 AI 특징 추출 교란 효과 큼). */
  readonly spectralDisruptionScore: number;
  readonly appliedGainScale: number;
}

export interface AdversarialShieldResult {
  readonly shieldedRgba: Uint8ClampedArray;
  readonly metrics: AdversarialShieldMetrics;
}

/** 결정론적 32비트 해시(타일별 고주파 방향/위상 생성용). */
function hashCoord32(x: number, y: number, seed: number): number {
  let h = (seed ^ Math.imul(x + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(y + 0x7f4a7c15, 0xc2b2ae35)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39) >>> 0;
  h ^= h >>> 15;
  return h >>> 0;
}

/** 두 RGBA 버퍼 간의 정확한 RGB PSNR(dB) 및 MSE 계산. */
export function computeShieldRgbaPsnr(
  original: Uint8ClampedArray,
  modified: Uint8ClampedArray,
): { readonly psnrDb: number; readonly mseRgb: number; readonly maxAbsChannelDelta: number } {
  if (original.byteLength !== modified.byteLength || original.byteLength === 0) {
    throw new Error("PSNR 계산 대상 RGBA 버퍼 길이가 일치하지 않거나 비어 있습니다.");
  }
  const pixelCount = original.byteLength / 4;
  let sumSq = 0;
  let maxDelta = 0;

  for (let i = 0; i < original.byteLength; i += 4) {
    const dr = Math.abs(original[i] - modified[i]);
    const dg = Math.abs(original[i + 1] - modified[i + 1]);
    const db = Math.abs(original[i + 2] - modified[i + 2]);
    sumSq += dr * dr + dg * dg + db * db;
    if (dr > maxDelta) maxDelta = dr;
    if (dg > maxDelta) maxDelta = dg;
    if (db > maxDelta) maxDelta = db;
  }

  const mseRgb = sumSq / (pixelCount * 3);
  if (mseRgb === 0) {
    return { psnrDb: 99.99, mseRgb: 0, maxAbsChannelDelta: 0 };
  }
  const psnrDb = 10 * Math.log10((255 * 255) / mseRgb);
  return { psnrDb, mseRgb, maxAbsChannelDelta: maxDelta };
}

/** 텍스트 보호 영역을 픽셀 마스크(1=보호, 0=비텍스트)로 래스터화. */
function buildTextProtectionMask(
  width: number,
  height: number,
  regions: readonly ProtectedTextRect[],
  marginPx: number,
): { readonly mask: Uint8Array; readonly protectedPixelCount: number } {
  const mask = new Uint8Array(width * height);
  let protectedPixelCount = 0;

  for (let r = 0; r < regions.length; r += 1) {
    const rect = regions[r];
    const x0 = Math.max(0, Math.floor(rect.x - marginPx));
    const y0 = Math.max(0, Math.floor(rect.y - marginPx));
    const x1 = Math.min(width, Math.ceil(rect.x + rect.width + marginPx));
    const y1 = Math.min(height, Math.ceil(rect.y + rect.height + marginPx));

    for (let y = y0; y < y1; y += 1) {
      const rowOffset = y * width;
      for (let x = x0; x < x1; x += 1) {
        if (mask[rowOffset + x] === 0) {
          mask[rowOffset + x] = 1;
          protectedPixelCount += 1;
        }
      }
    }
  }
  return { mask, protectedPixelCount };
}

/**
 * 2D HH(고주파 대각 웨이블릿 커널 [[1,-2,1],[-2,4,-2],[1,-2,1]] / 4) 스펙트럼 에너지 측정.
 * 비텍스트 픽셀에 대해서만 평균 제곱 고주파 응답을 계산한다.
 */
function computeHighFrequencyHhEnergy(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  textMask: Uint8Array,
): number {
  if (width < 3 || height < 3) {
    return 0;
  }
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (textMask[y * width + x] === 1) {
        continue;
      }
      for (let ch = 0; ch < 3; ch += 1) {
        const idx = (y * width + x) * 4 + ch;
        const rowStride = width * 4;
        const hh =
          (rgba[idx - rowStride - 4] -
            2 * rgba[idx - rowStride] +
            rgba[idx - rowStride + 4] -
            2 * rgba[idx - 4] +
            4 * rgba[idx] -
            2 * rgba[idx + 4] +
            rgba[idx + rowStride - 4] -
            2 * rgba[idx + rowStride] +
            rgba[idx + rowStride + 4]) *
          0.25;
        sumSq += hh * hh;
        count += 1;
      }
    }
  }
  return count > 0 ? sumSq / count : 0;
}

/** 8×8 블록별 방향성 고주파 섭동장(RGB 3채널 플로트 오프셋) 생성. */
function buildDirectionalPerturbationField(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  textMask: Uint8Array,
  seed: number,
  strength: number,
): Float32Array {
  const field = new Float32Array(width * height * 3);
  const baseAmp = 2.05 * Math.max(0.25, Math.min(2.0, strength));

  for (let y = 0; y < height; y += 1) {
    const tileY = y >>> 3;
    for (let x = 0; x < width; x += 1) {
      const pixelIdx = y * width + x;
      if (textMask[pixelIdx] === 1) {
        continue;
      }
      const off4 = pixelIdx * 4;
      const r = rgba[off4];
      const g = rgba[off4 + 1];
      const b = rgba[off4 + 2];
      const alpha = rgba[off4 + 3];
      if (alpha === 0) {
        continue;
      }

      const tileX = x >>> 3;
      const tileHash = hashCoord32(tileX, tileY, seed);
      const orientation = tileHash & 3;
      const phaseSign = (tileHash & 4) === 0 ? 1 : -1;
      const nyquist = ((x + y) & 1) === 0 ? 1 : -1;
      const horizNyq = (x & 1) === 0 ? 1 : -1;
      const vertNyq = (y & 1) === 0 ? 1 : -1;

      let carrier: number;
      if (orientation === 0) {
        carrier = nyquist * 0.72 + horizNyq * 0.28;
      } else if (orientation === 1) {
        carrier = nyquist * 0.72 + vertNyq * 0.28;
      } else if (orientation === 2) {
        carrier = nyquist * 0.65 + (((x - y) & 1) === 0 ? 0.35 : -0.35);
      } else {
        carrier = nyquist * 0.8 + ((((x >> 1) + (y >> 1)) & 1) === 0 ? 0.2 : -0.2);
      }
      carrier *= phaseSign;

      // 지각 마스킹: 극단 하이라이트/암부에서는 강도를 살짝 낮추고 중간톤·선화 경계에서 강도 유지
      const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const midtoneWeight = 0.72 + 0.38 * (1 - Math.abs(luma - 0.5) * 2);
      const scaled = baseAmp * midtoneWeight * carrier;

      // 채널 간 역상 성분 혼합: 사람 눈의 휘도(Y) 변화를 최소화하면서 CNN/ViT RGB 패치 교란 극대화
      const off3 = pixelIdx * 3;
      field[off3] = scaled * 1.08;
      field[off3 + 1] = -scaled * 0.74;
      field[off3 + 2] = scaled * 1.15;
    }
  }
  return field;
}

/** 섭동장에 배율(gainScale)을 적용해 클램프된 RGBA 버퍼 생성. */
function renderPerturbedBuffer(
  original: Uint8ClampedArray,
  field: Float32Array,
  textMask: Uint8Array,
  gainScale: number,
  maxDelta: number,
): { readonly rgba: Uint8ClampedArray; readonly perturbedPixelCount: number } {
  const out = new Uint8ClampedArray(original);
  const pixelCount = textMask.byteLength;
  let perturbedPixelCount = 0;

  for (let p = 0; p < pixelCount; p += 1) {
    if (textMask[p] === 1) {
      continue;
    }
    const off4 = p * 4;
    const off3 = p * 3;
    let changed = false;

    for (let ch = 0; ch < 3; ch += 1) {
      const rawDelta = Math.round(field[off3 + ch] * gainScale);
      const clampedDelta = Math.max(-maxDelta, Math.min(maxDelta, rawDelta));
      if (clampedDelta !== 0) {
        const nextVal = Math.max(0, Math.min(255, original[off4 + ch] + clampedDelta));
        if (nextVal !== original[off4 + ch]) {
          out[off4 + ch] = nextVal;
          changed = true;
        }
      }
    }
    if (changed) {
      perturbedPixelCount += 1;
    }
  }

  return { rgba: out, perturbedPixelCount };
}

/**
 * 선택적 고주파 적대적 방어막 적용:
 * 비텍스트 영역에 고주파 스펙트럼 섭동을 주입하고, PSNR >= targetMinPsnrDb(기본 40 dB)를 강제 보장한다.
 */
export function applyAdversarialProtectionShield(
  input: AdversarialShieldInput,
): AdversarialShieldResult {
  const { rgba, width, height } = input;
  if (width <= 0 || height <= 0 || rgba.byteLength !== width * height * 4) {
    throw new Error("유효하지 않은 RGBA 이미지 차원 또는 버퍼 길이입니다.");
  }

  const options = input.options ?? {};
  const strength = options.strength ?? 1.0;
  const seed = (options.seed ?? 0x51a7c3d9) >>> 0;
  const targetMinPsnrDb = options.targetMinPsnrDb ?? 40.0;
  const maxChannelDelta = Math.max(1, Math.min(6, Math.floor(options.maxChannelDelta ?? 3)));
  const textSafetyMarginPx = Math.max(0, Math.floor(options.textSafetyMarginPx ?? 0));
  const regions = input.protectedTextRegions ?? [];

  const { mask: textMask, protectedPixelCount } = buildTextProtectionMask(
    width,
    height,
    regions,
    textSafetyMarginPx,
  );
  const baselineHighFreqEnergy = computeHighFrequencyHhEnergy(rgba, width, height, textMask);
  const field = buildDirectionalPerturbationField(rgba, width, height, textMask, seed, strength);

  let gainScale = 1.0;
  let rendered = renderPerturbedBuffer(rgba, field, textMask, gainScale, maxChannelDelta);
  let psnrStats = computeShieldRgbaPsnr(rgba, rendered.rgba);

  // PSNR 하한선 자동 보정 루프(최대 8회 스케일 다운으로 targetMinPsnrDb 이상 보장)
  for (let attempt = 0; attempt < 8 && psnrStats.psnrDb < targetMinPsnrDb; attempt += 1) {
    const targetMse = (255 * 255) / Math.pow(10, (targetMinPsnrDb + 0.35) / 10);
    const ratio = Math.sqrt(Math.max(0.05, targetMse / Math.max(psnrStats.mseRgb, 1e-6)));
    gainScale = Math.max(0.1, gainScale * Math.min(0.88, ratio));
    rendered = renderPerturbedBuffer(rgba, field, textMask, gainScale, maxChannelDelta);
    psnrStats = computeShieldRgbaPsnr(rgba, rendered.rgba);
  }

  // 보호 텍스트 픽셀 드리프트 0건 검증
  let protectedTextPixelDrift = 0;
  for (let p = 0; p < textMask.byteLength; p += 1) {
    if (textMask[p] !== 1) continue;
    const off4 = p * 4;
    if (
      rgba[off4] !== rendered.rgba[off4] ||
      rgba[off4 + 1] !== rendered.rgba[off4 + 1] ||
      rgba[off4 + 2] !== rendered.rgba[off4 + 2] ||
      rgba[off4 + 3] !== rendered.rgba[off4 + 3]
    ) {
      protectedTextPixelDrift += 1;
    }
  }

  const shieldedHighFreqEnergy = computeHighFrequencyHhEnergy(
    rendered.rgba,
    width,
    height,
    textMask,
  );
  const deltaEnergy = Math.max(0, shieldedHighFreqEnergy - baselineHighFreqEnergy);
  const highFreqEnergyGainRatio =
    shieldedHighFreqEnergy / Math.max(baselineHighFreqEnergy, 0.25);

  // 고주파 HH 섭동 에너지와 섭동 커버리지를 결합한 0~100 스펙트럼 교란 점수
  const nonTextPixels = Math.max(1, width * height - protectedPixelCount);
  const coverageRatio = rendered.perturbedPixelCount / nonTextPixels;
  const energyComponent = Math.min(1, Math.log10(1 + deltaEnergy) / 2.2);
  const gainComponent = Math.min(1, Math.log2(Math.max(1, highFreqEnergyGainRatio)) / 3.5);
  const spectralDisruptionScore = Number(
    (Math.min(1, 0.55 * energyComponent + 0.3 * gainComponent + 0.15 * coverageRatio) * 100).toFixed(
      2,
    ),
  );

  return {
    shieldedRgba: rendered.rgba,
    metrics: {
      psnrDb: Number(psnrStats.psnrDb.toFixed(2)),
      mseRgb: Number(psnrStats.mseRgb.toFixed(4)),
      maxAbsChannelDelta: psnrStats.maxAbsChannelDelta,
      perturbedPixelCount: rendered.perturbedPixelCount,
      protectedTextPixelCount: protectedPixelCount,
      protectedTextPixelDrift,
      baselineHighFreqEnergy: Number(baselineHighFreqEnergy.toFixed(3)),
      shieldedHighFreqEnergy: Number(shieldedHighFreqEnergy.toFixed(3)),
      highFreqEnergyGainRatio: Number(highFreqEnergyGainRatio.toFixed(3)),
      spectralDisruptionScore,
      appliedGainScale: Number(gainScale.toFixed(4)),
    },
  };
}
