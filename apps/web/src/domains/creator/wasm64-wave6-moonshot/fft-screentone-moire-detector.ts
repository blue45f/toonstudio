/**
 * 온디바이스 2D Radix-2 FFT 스크린톤 모아레(Moiré) 조기 경보기 및 안전 각도·선수도 솔버.
 *
 * - 원고 해상도 스크린톤 타일을 모바일 독자 뷰포트 폭(`375px`, `390px`, `768px`) 비율로
 *   리샘플링한 뒤, 2D Hann 윈도우 + Cooley-Tukey Radix-2 2D FFT 주파수 스펙트럼을 계산한다.
 * - 나이퀴스트 접힘(Nyquist folding)으로 인해 저주파 대역에 침투한 가시 비트(beat)·줄무늬 피크를
 *   검출하고, 모아레가 없는 안전 선수도(LPI)와 전통 망점 회전각(`15°`, `45°`, `75°`)을 추천한다.
 */

export const TARGET_MOBILE_VIEWPORT_WIDTHS_PX = Object.freeze([375, 390, 768] as const);
export const CLASSIC_SAFE_HALFTONE_ANGLES_DEG = Object.freeze([15, 45, 75] as const);

export type ClassicHalftoneAngleDeg = (typeof CLASSIC_SAFE_HALFTONE_ANGLES_DEG)[number];
export type MoireSeverity = "safe" | "caution" | "critical";

export interface ScreentoneTileBitmap {
  readonly width: number;
  readonly height: number;
  /** `[0..1]` 범위의 정규화 명도 배열 (`length === width * height`). */
  readonly luminance: Float32Array;
  readonly lpi?: number;
  readonly sourceDpi?: number;
  readonly angleDeg?: number;
}

export interface SynthesizeHalftoneTileInput {
  readonly sizePx?: number;
  readonly lpi: number;
  readonly sourceDpi?: number;
  readonly angleDeg: number;
  readonly dotCoverage?: number;
  readonly edgeSoftness?: number;
}

export interface FrequencyPeak2D {
  readonly fxCyclesPerPx: number;
  readonly fyCyclesPerPx: number;
  readonly radialFreqCyclesPerPx: number;
  readonly periodViewportPx: number;
  readonly relativePowerRatio: number;
  readonly isAxisAlignedStripe: boolean;
}

export interface ViewportMoireDiagnostic {
  readonly viewportWidthPx: number;
  readonly scaleFactor: number;
  readonly expectedFundamentalCyclesPerPx: number;
  readonly nyquistFoldedCyclesPerPx: number;
  readonly lowFreqBeatEnergyRatio: number;
  readonly dominantMoirePeak: FrequencyPeak2D | null;
  readonly moireRiskScore: number;
  readonly severity: MoireSeverity;
  readonly summaryKo: string;
}

export interface MoireAnalysisInput {
  readonly tile: ScreentoneTileBitmap;
  readonly canvasWidthPx?: number;
  readonly viewportWidthsPx?: readonly number[];
  readonly fftSize?: 32 | 64 | 128;
}

export interface SafeToneCandidateScore {
  readonly lpi: number;
  readonly angleDeg: ClassicHalftoneAngleDeg;
  readonly worstViewportRiskScore: number;
  readonly worstViewportWidthPx: number;
  readonly severity: MoireSeverity;
}

export interface SafeToneRecommendation {
  readonly recommendedLpi: number;
  readonly recommendedAngleDeg: ClassicHalftoneAngleDeg;
  readonly secondaryLayerAngleDeg: ClassicHalftoneAngleDeg;
  readonly worstViewportRiskScore: number;
  readonly evaluatedCandidates: readonly SafeToneCandidateScore[];
  readonly reasonKo: string;
}

export interface MoireAnalysisReport {
  readonly fftSize: number;
  readonly canvasWidthPx: number;
  readonly viewportDiagnostics: readonly ViewportMoireDiagnostic[];
  readonly overallSeverity: MoireSeverity;
  readonly worstRiskScore: number;
  readonly recommendation: SafeToneRecommendation;
  readonly computeTimeMs: number;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function positiveMod(value: number, modulus: number): number {
  const rem = value % modulus;
  return rem < 0 ? rem + modulus : rem;
}

/**
 * 회전 격자 유클리드 망점 함수로 원고 해상도 스크린톤 타일을 합성한다.
 */
export function synthesizeHalftoneTile(input: SynthesizeHalftoneTileInput): ScreentoneTileBitmap {
  const sizePx = Math.max(16, Math.floor(input.sizePx ?? 128));
  const sourceDpi = Math.max(72, input.sourceDpi ?? 600);
  const lpi = Math.max(5, input.lpi);
  const angleDeg = input.angleDeg;
  const coverage = clamp(input.dotCoverage ?? 0.45, 0.05, 0.95);
  const softness = clamp(input.edgeSoftness ?? 0.08, 0.01, 0.3);

  const pitchPx = sourceDpi / lpi;
  const freqPerPx = 1 / pitchPx;
  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);

  const luminance = new Float32Array(sizePx * sizePx);
  const twoPiFreq = 2 * Math.PI * freqPerPx;

  for (let y = 0; y < sizePx; y += 1) {
    const rowOffset = y * sizePx;
    for (let x = 0; x < sizePx; x += 1) {
      const u = (x * cosA + y * sinA) * twoPiFreq;
      const v = (-x * sinA + y * cosA) * twoPiFreq;
      const spot = 0.5 - 0.25 * (Math.cos(u) + Math.cos(v));
      // 망점 내부는 잉크(0에 가까움), 외부는 종이(1에 가까움)
      luminance[rowOffset + x] = smoothstep(coverage - softness, coverage + softness, spot);
    }
  }

  return {
    width: sizePx,
    height: sizePx,
    luminance,
    lpi,
    sourceDpi,
    angleDeg,
  };
}

/**
 * 원고 스크린톤 타일을 목표 모바일 뷰포트 배율로 양선형(bilinear) 리샘플링한다.
 */
export function resampleTileToViewportPatch(
  tile: ScreentoneTileBitmap,
  scaleFactor: number,
  patchSize: number,
): Float32Array {
  const out = new Float32Array(patchSize * patchSize);
  const invScale = 1 / Math.max(1e-5, scaleFactor);
  const w = tile.width;
  const h = tile.height;
  const lum = tile.luminance;

  for (let vy = 0; vy < patchSize; vy += 1) {
    const srcY = positiveMod((vy + 0.5) * invScale - 0.5, h);
    const y0 = Math.floor(srcY);
    const y1 = (y0 + 1) % h;
    const ty = srcY - y0;
    const row0 = y0 * w;
    const row1 = y1 * w;
    const outRow = vy * patchSize;

    for (let vx = 0; vx < patchSize; vx += 1) {
      const srcX = positiveMod((vx + 0.5) * invScale - 0.5, w);
      const x0 = Math.floor(srcX);
      const x1 = (x0 + 1) % w;
      const tx = srcX - x0;

      const c00 = lum[row0 + x0]!;
      const c10 = lum[row0 + x1]!;
      const c01 = lum[row1 + x0]!;
      const c11 = lum[row1 + x1]!;

      const top = c00 + (c10 - c00) * tx;
      const bot = c01 + (c11 - c01) * tx;
      out[outRow + vx] = top + (bot - top) * ty;
    }
  }

  return out;
}

/**
 * 1차원 제자리(in-place) Cooley-Tukey Radix-2 복소수 FFT.
 */
function fft1dRadix2InPlace(
  real: Float64Array,
  imag: Float64Array,
  offset: number,
  stride: number,
  n: number,
): void {
  let j = 0;
  for (let i = 0; i < n; i += 1) {
    if (i < j) {
      const idxI = offset + i * stride;
      const idxJ = offset + j * stride;
      const tmpR = real[idxI]!;
      const tmpI = imag[idxI]!;
      real[idxI] = real[idxJ]!;
      imag[idxI] = imag[idxJ]!;
      real[idxJ] = tmpR;
      imag[idxJ] = tmpI;
    }
    let bit = n >> 1;
    while (bit >= 1 && (j & bit) !== 0) {
      j ^= bit;
      bit >>= 1;
    }
    j |= bit;
  }

  for (let len = 2; len <= n; len <<= 1) {
    const halfLen = len >> 1;
    const angleStep = (-2 * Math.PI) / len;
    const wStepR = Math.cos(angleStep);
    const wStepI = Math.sin(angleStep);

    for (let start = 0; start < n; start += len) {
      let wR = 1;
      let wI = 0;
      for (let k = 0; k < halfLen; k += 1) {
        const evenIdx = offset + (start + k) * stride;
        const oddIdx = offset + (start + k + halfLen) * stride;

        const oddR = real[oddIdx]!;
        const oddI = imag[oddIdx]!;
        const tR = wR * oddR - wI * oddI;
        const tI = wR * oddI + wI * oddR;

        const evenR = real[evenIdx]!;
        const evenI = imag[evenIdx]!;

        real[evenIdx] = evenR + tR;
        imag[evenIdx] = evenI + tI;
        real[oddIdx] = evenR - tR;
        imag[oddIdx] = evenI - tI;

        const nextWR = wR * wStepR - wI * wStepI;
        wI = wR * wStepI + wI * wStepR;
        wR = nextWR;
      }
    }
  }
}

export interface Spectrum2DResult {
  readonly size: number;
  readonly power: Float64Array;
  readonly totalAcPower: number;
}

/**
 * DC 평균 제거 + 2D 분리형 Hann 윈도우 적용 후 2D Radix-2 FFT 전력 스펙트럼을 계산한다.
 */
export function compute2dRadix2PowerSpectrum(
  patch: Float32Array,
  size: number,
): Spectrum2DResult {
  if (size < 8 || (size & (size - 1)) !== 0) {
    throw new Error(`FFT 크기는 8 이상의 2의 거듭제곱이어야 합니다: ${size}`);
  }
  const totalSamples = size * size;
  let mean = 0;
  for (let i = 0; i < totalSamples; i += 1) {
    mean += patch[i]!;
  }
  mean /= totalSamples;

  const hann1d = new Float64Array(size);
  for (let i = 0; i < size; i += 1) {
    hann1d[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / size));
  }

  const real = new Float64Array(totalSamples);
  const imag = new Float64Array(totalSamples);

  for (let y = 0; y < size; y += 1) {
    const wy = hann1d[y]!;
    const row = y * size;
    for (let x = 0; x < size; x += 1) {
      real[row + x] = (patch[row + x]! - mean) * wy * hann1d[x]!;
    }
  }

  for (let y = 0; y < size; y += 1) {
    fft1dRadix2InPlace(real, imag, y * size, 1, size);
  }
  for (let x = 0; x < size; x += 1) {
    fft1dRadix2InPlace(real, imag, x, size, size);
  }

  const power = new Float64Array(totalSamples);
  let totalAcPower = 0;
  for (let y = 0; y < size; y += 1) {
    const dy = y <= size >> 1 ? y : y - size;
    const row = y * size;
    for (let x = 0; x < size; x += 1) {
      const dx = x <= size >> 1 ? x : x - size;
      const p = real[row + x]! * real[row + x]! + imag[row + x]! * imag[row + x]!;
      power[row + x] = p;
      // Hann 메인로브 주변(DC 직근접 ±1 빈)은 교류(AC) 에너지 합산에서 제외한다.
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        totalAcPower += p;
      }
    }
  }

  return { size, power, totalAcPower };
}

function estimateNativeFundamentalCyclesPerPx(tile: ScreentoneTileBitmap): number {
  if (tile.lpi !== undefined && tile.sourceDpi !== undefined && tile.sourceDpi > 0) {
    return tile.lpi / tile.sourceDpi;
  }
  const probeSize = 64;
  const nativePatch = resampleTileToViewportPatch(tile, 1.0, probeSize);
  const spec = compute2dRadix2PowerSpectrum(nativePatch, probeSize);
  let bestP = 0;
  let bestRadial = 0.1;
  const half = probeSize >> 1;

  for (let y = 0; y <= half; y += 1) {
    for (let x = 0; x < probeSize; x += 1) {
      const sx = x <= half ? x : x - probeSize;
      const sy = y;
      if (Math.abs(sx) <= 1 && Math.abs(sy) <= 1) continue;
      const p = spec.power[y * probeSize + x]!;
      if (p > bestP) {
        bestP = p;
        bestRadial = Math.hypot(sx / probeSize, sy / probeSize);
      }
    }
  }
  return bestRadial;
}

function computeBrillouinFoldedFrequency(
  fundamentalCyclesPerPx: number,
  angleDeg: number,
): { readonly foldedRadial: number; readonly isFolded: boolean; readonly isAxisAligned: boolean } {
  const rad = (angleDeg * Math.PI) / 180;
  const fx = fundamentalCyclesPerPx * Math.cos(rad);
  const fy = fundamentalCyclesPerPx * Math.sin(rad);

  const foldedFx = fx - Math.round(fx);
  const foldedFy = fy - Math.round(fy);
  const isFolded = Math.abs(fx) > 0.5 || Math.abs(fy) > 0.5;
  const foldedRadial = Math.hypot(foldedFx, foldedFy);
  const isAxisAligned = Math.abs(foldedFx) < 0.035 || Math.abs(foldedFy) < 0.035;

  return { foldedRadial, isFolded, isAxisAligned };
}

function evaluateSingleViewportMoire(
  tile: ScreentoneTileBitmap,
  nativeFreqCyclesPerPx: number,
  canvasWidthPx: number,
  viewportWidthPx: number,
  fftSize: 32 | 64 | 128,
): ViewportMoireDiagnostic {
  const scaleFactor = viewportWidthPx / Math.max(1, canvasWidthPx);
  const expectedFundamental = nativeFreqCyclesPerPx / Math.max(1e-5, scaleFactor);
  const angleDeg = tile.angleDeg ?? 0;
  const foldedInfo = computeBrillouinFoldedFrequency(expectedFundamental, angleDeg);

  const patch = resampleTileToViewportPatch(tile, scaleFactor, fftSize);
  const spectrum = compute2dRadix2PowerSpectrum(patch, fftSize);

  const half = fftSize >> 1;
  const minMoireBinRadius = 2 / fftSize;
  const maxMoireFreq = 0.24;
  // 원래부터 굵은 의도적 도트(예: 뷰포트 주기 >= 4.5px)는 접힘 모아레와 구분한다.
  const isIntendedFineTone = expectedFundamental >= 0.34;

  let lowFreqEnergy = 0;
  let peakPower = 0;
  let peakFx = 0;
  let peakFy = 0;

  for (let ky = 0; ky < fftSize; ky += 1) {
    const sy = ky <= half ? ky : ky - fftSize;
    const fy = sy / fftSize;
    const row = ky * fftSize;

    for (let kx = 0; kx < fftSize; kx += 1) {
      const sx = kx <= half ? kx : kx - fftSize;
      if (Math.abs(sx) <= 1 && Math.abs(sy) <= 1) continue;
      const fx = sx / fftSize;
      const radial = Math.hypot(fx, fy);

      if (radial >= minMoireBinRadius && radial <= maxMoireFreq) {
        // 의도된 저주파 굵은 망점인 경우 기본파 바로 근처 에너지는 정상 신호로 제외한다.
        if (!isIntendedFineTone && Math.abs(radial - expectedFundamental) <= 0.045) {
          continue;
        }
        const p = spectrum.power[row + kx]!;
        lowFreqEnergy += p;
        if (p > peakPower) {
          peakPower = p;
          peakFx = fx;
          peakFy = fy;
        }
      }
    }
  }

  const denom = Math.max(spectrum.totalAcPower, 1e-12);
  const lowFreqBeatEnergyRatio = clamp(lowFreqEnergy / denom, 0, 1);
  const peakPowerRatio = clamp(peakPower / denom, 0, 1);
  const peakRadial = Math.hypot(peakFx, peakFy);
  const peakAxisAligned = Math.abs(peakFx) < 0.035 || Math.abs(peakFy) < 0.035;

  const dominantMoirePeak: FrequencyPeak2D | null =
    peakPower > 1e-9 && peakRadial >= minMoireBinRadius
      ? {
          fxCyclesPerPx: peakFx,
          fyCyclesPerPx: peakFy,
          radialFreqCyclesPerPx: peakRadial,
          periodViewportPx: 1 / peakRadial,
          relativePowerRatio: peakPowerRatio,
          isAxisAlignedStripe: peakAxisAligned,
        }
      : null;

  // 스펙트럼 실측 저주파 비트 비율 + 브릴루앙 영역 접힘 위험도를 결합해 0..1 위험 점수를 산출한다.
  let riskScore = lowFreqBeatEnergyRatio * 0.72 + peakPowerRatio * 0.45;
  if (foldedInfo.isFolded && foldedInfo.foldedRadial <= 0.25) {
    riskScore = Math.max(riskScore, 0.65 + (0.25 - foldedInfo.foldedRadial) * 1.4);
  } else if (expectedFundamental > 0.44 && !foldedInfo.isFolded) {
    riskScore += (expectedFundamental - 0.44) * 0.9;
  }
  if ((peakAxisAligned && lowFreqBeatEnergyRatio > 0.12) || (foldedInfo.isFolded && foldedInfo.isAxisAligned)) {
    riskScore += 0.14;
  }
  riskScore = clamp(riskScore, 0, 1);

  const severity: MoireSeverity =
    riskScore >= 0.55 ? "critical" : riskScore >= 0.26 ? "caution" : "safe";

  const periodLabel =
    dominantMoirePeak !== null ? `${dominantMoirePeak.periodViewportPx.toFixed(1)}px` : "없음";
  const summaryKo =
    severity === "critical"
      ? `${viewportWidthPx}px 화면에서 나이퀴스트 접힘으로 약 ${periodLabel} 간격의 강한 물결 줄무늬가 보입니다.`
      : severity === "caution"
        ? `${viewportWidthPx}px 화면에서 미세한 간섭 무늬(주기 ${periodLabel})가 생길 수 있어 각도·선수도 조정을 권장합니다.`
        : `${viewportWidthPx}px 화면에서 저주파 간섭 피크 없이 깨끗하게 표현됩니다.`;

  return {
    viewportWidthPx,
    scaleFactor,
    expectedFundamentalCyclesPerPx: expectedFundamental,
    nyquistFoldedCyclesPerPx: foldedInfo.foldedRadial,
    lowFreqBeatEnergyRatio,
    dominantMoirePeak,
    moireRiskScore: riskScore,
    severity,
    summaryKo,
  };
}

const CANDIDATE_SAFE_LPIS = Object.freeze([25, 30, 35, 40, 45, 50, 55, 60, 65] as const);

/**
 * 목표 뷰포트 전체(`375px`, `390px`, `768px`)에서 모아레를 피하는 최적 선수도(LPI)와
 * 전통 망점 각도(`15°`, `45°`, `75°`)를 탐색한다.
 */
export function recommendMoireSafeScreentone(options: {
  readonly canvasWidthPx: number;
  readonly sourceDpi: number;
  readonly preferredLpi?: number;
  readonly viewportWidthsPx?: readonly number[];
  readonly dotCoverage?: number;
}): SafeToneRecommendation {
  const viewports = options.viewportWidthsPx ?? TARGET_MOBILE_VIEWPORT_WIDTHS_PX;
  const targetLpi = options.preferredLpi ?? 45;
  const coverage = options.dotCoverage ?? 0.45;
  const evaluatedCandidates: SafeToneCandidateScore[] = [];

  let bestChoice: SafeToneCandidateScore | null = null;
  let bestObjective = Infinity;

  for (const lpi of CANDIDATE_SAFE_LPIS) {
    for (const angleDeg of CLASSIC_SAFE_HALFTONE_ANGLES_DEG) {
      const candidateTile = synthesizeHalftoneTile({
        sizePx: 64,
        lpi,
        sourceDpi: options.sourceDpi,
        angleDeg,
        dotCoverage: coverage,
      });
      const nativeFreq = lpi / options.sourceDpi;

      let worstRisk = 0;
      let worstViewport = viewports[0] ?? 375;

      for (const vp of viewports) {
        const diag = evaluateSingleViewportMoire(
          candidateTile,
          nativeFreq,
          options.canvasWidthPx,
          vp,
          32,
        );
        if (diag.moireRiskScore > worstRisk) {
          worstRisk = diag.moireRiskScore;
          worstViewport = vp;
        }
      }

      const severity: MoireSeverity =
        worstRisk >= 0.55 ? "critical" : worstRisk >= 0.26 ? "caution" : "safe";

      const candidateScore: SafeToneCandidateScore = {
        lpi,
        angleDeg,
        worstViewportRiskScore: worstRisk,
        worstViewportWidthPx: worstViewport,
        severity,
      };
      evaluatedCandidates.push(candidateScore);

      // 위험도 최소화를 최우선으로 두되, 45° 대각선 여유와 작가 선호 LPI 근접도를 함께 반영한다.
      const lpiDistancePenalty = Math.abs(lpi - targetLpi) * 0.004;
      const anglePreferenceBonus = angleDeg === 45 ? -0.025 : 0;
      const objective = worstRisk + lpiDistancePenalty + anglePreferenceBonus;

      if (objective < bestObjective) {
        bestObjective = objective;
        bestChoice = candidateScore;
      }
    }
  }

  const chosen = bestChoice ?? {
    lpi: 35,
    angleDeg: 45 as ClassicHalftoneAngleDeg,
    worstViewportRiskScore: 0,
    worstViewportWidthPx: 375,
    severity: "safe" as MoireSeverity,
  };

  // 2중 겹침 톤 작업 시 30° 로제트(rosette) 각도 차이를 확보하는 보조 각도를 함께 안내한다.
  const secondaryLayerAngleDeg: ClassicHalftoneAngleDeg =
    chosen.angleDeg === 45 ? 15 : chosen.angleDeg === 15 ? 45 : 45;

  return {
    recommendedLpi: chosen.lpi,
    recommendedAngleDeg: chosen.angleDeg,
    secondaryLayerAngleDeg,
    worstViewportRiskScore: chosen.worstViewportRiskScore,
    evaluatedCandidates,
    reasonKo: `모바일 최소 폭(${viewports.join("/")}px)에서도 나이퀴스트 한계 아래에 머무는 ${chosen.lpi} LPI · ${chosen.angleDeg}° 망점 배치를 추천합니다(겹침 보조 톤은 ${secondaryLayerAngleDeg}° 권장).`,
  };
}

/**
 * 스크린톤 타일의 다중 모바일 뷰포트 모아레 위험도를 진단하고 안전 대체 설정을 반환한다.
 */
export function analyzeScreentoneMoireRisk(input: MoireAnalysisInput): MoireAnalysisReport {
  const startMs = performance.now();
  const canvasWidthPx = Math.max(320, input.canvasWidthPx ?? 1600);
  const viewports = input.viewportWidthsPx ?? TARGET_MOBILE_VIEWPORT_WIDTHS_PX;
  const fftSize = input.fftSize ?? 64;
  const sourceDpi = Math.max(72, input.tile.sourceDpi ?? 600);
  const nativeFreq = estimateNativeFundamentalCyclesPerPx(input.tile);

  const viewportDiagnostics = viewports.map((vp) =>
    evaluateSingleViewportMoire(input.tile, nativeFreq, canvasWidthPx, vp, fftSize),
  );

  let worstRiskScore = 0;
  for (const diag of viewportDiagnostics) {
    if (diag.moireRiskScore > worstRiskScore) {
      worstRiskScore = diag.moireRiskScore;
    }
  }

  const overallSeverity: MoireSeverity =
    worstRiskScore >= 0.55 ? "critical" : worstRiskScore >= 0.26 ? "caution" : "safe";

  const inferredLpi = input.tile.lpi ?? Math.round(nativeFreq * sourceDpi);
  const recommendation = recommendMoireSafeScreentone({
    canvasWidthPx,
    sourceDpi,
    preferredLpi: inferredLpi,
    viewportWidthsPx: viewports,
  });

  return {
    fftSize,
    canvasWidthPx,
    viewportDiagnostics,
    overallSeverity,
    worstRiskScore,
    recommendation,
    computeTimeMs: performance.now() - startMs,
  };
}
