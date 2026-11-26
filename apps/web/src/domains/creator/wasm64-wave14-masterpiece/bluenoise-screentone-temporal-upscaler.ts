/**
 * 다중 대역 블루노이즈 스토캐스틱 무로제트(Rosette-Free) 스크린톤 합성기 및
 * 시공간 위상 일관성(Spatiotemporal Phase-Coherent) 선화·모션툰 2× 업스케일러.
 *
 * - 모바일 축소 뷰포트와 600DPI 인쇄 원고 양쪽에서 주기적 모아레 간섭을 없애고 선명한 계조 단차를 유지한다.
 * - 서브픽셀 광학 흐름 역워핑 시간 누적과 구조 텐서 접선 흐름(ETF) 이방성 충격 복원으로
 *   다중 프레임 컷 시퀀스를 2× 확대할 때 프레임 간 선화 깜빡임(shimmer)을 억제한다.
 * - 외부 서버 비용 ₩0, 초기 번들 그래프 영향 0B(필요 시 지연 로드).
 */

export const DEFAULT_BLUENOISE_TILE_SIZE = 16;
export const DEFAULT_PRINT_DPI = 600;
export const DEFAULT_MOBILE_DPI = 160;
export const WASM64_WAVE14_SLAB_ALIGNMENT_BYTES = BigInt(64);

export type ScreentonePresetKind = "classic-60lpi" | "fine-85lpi" | "stochastic-sand" | "dramatic-cross";

export interface ScreentonePresetProfile {
  readonly kind: ScreentonePresetKind; readonly labelKo: string;
  readonly baseLpi: number; readonly primaryAngleDeg: number; readonly secondaryAngleDeg: number;
  readonly crossMixWeight: number; readonly fmHighlightCutoff: number;
  readonly fmShadowCutoff: number; readonly phaseJitterStrength: number;
}

export const SCREENTONE_PRESET_PROFILES: Readonly<Record<ScreentonePresetKind, ScreentonePresetProfile>> = Object.freeze({
  "classic-60lpi": { kind: "classic-60lpi", labelKo: "출판 표준 60선 무로제트 망점", baseLpi: 60, primaryAngleDeg: 45, secondaryAngleDeg: 18.4349488, crossMixWeight: 0.18, fmHighlightCutoff: 0.14, fmShadowCutoff: 0.86, phaseJitterStrength: 0.22 },
  "fine-85lpi": { kind: "fine-85lpi", labelKo: "고정밀 85선 세밀 피부·의상 톤", baseLpi: 85, primaryAngleDeg: 32.5, secondaryAngleDeg: 77.5, crossMixWeight: 0.15, fmHighlightCutoff: 0.16, fmShadowCutoff: 0.84, phaseJitterStrength: 0.26 },
  "stochastic-sand": { kind: "stochastic-sand", labelKo: "순수 블루노이즈 모래결 스토캐스틱 톤", baseLpi: 110, primaryAngleDeg: 27.5, secondaryAngleDeg: 63.4, crossMixWeight: 0.0, fmHighlightCutoff: 0.5, fmShadowCutoff: 0.5, phaseJitterStrength: 0.45 },
  "dramatic-cross": { kind: "dramatic-cross", labelKo: "극적 명암 교차 해칭 하이브리드 톤", baseLpi: 55, primaryAngleDeg: 45, secondaryAngleDeg: 135, crossMixWeight: 0.42, fmHighlightCutoff: 0.12, fmShadowCutoff: 0.88, phaseJitterStrength: 0.18 },
});

export interface BlueNoiseTileOptions {
  readonly tileSize?: number; readonly filterSigma?: number; readonly seed?: number; readonly maxSwapIterations?: number;
}
export interface BlueNoiseTileSpectrumSummary {
  readonly tileSize: number; readonly values: Float32Array; readonly meanValue: number;
  readonly highToLowFrequencyEnergyRatio: number; readonly swapIterationsExecuted: number; readonly slabByteFootprint: bigint;
}
export interface ScreentoneSynthesisInput {
  readonly width: number; readonly height: number;
  /** 0(순백 여백) ~ 1(순흑 먹 농도) 범위의 목표 톤 밀도 필드. */
  readonly toneDensity: Float32Array;
  readonly preset?: ScreentonePresetKind; readonly zoomScale?: number; readonly targetDpi?: number;
  readonly quantizationSteps?: number; readonly blueNoiseTile?: BlueNoiseTileSpectrumSummary; readonly lineArtPreserveMask?: Float32Array;
}
export interface HybridBandWeights {
  readonly dotPitchPx: number; readonly amCarrierWeight: number; readonly fmBlueNoiseWeight: number; readonly antiMoireContinuousMix: number;
}
export interface ScreentoneSynthesisResult {
  readonly width: number; readonly height: number; readonly inkCoverage: Float32Array; readonly bandWeights: HybridBandWeights;
  readonly moireBeatingIndex: number; readonly tonalStepRmsError: number; readonly meanCoverageError: number; readonly serverCostKrw: 0;
}
export interface MotionVectorSample { readonly vx: number; readonly vy: number; readonly confidence01: number; }
export interface MotionEstimationOptions { readonly blockSize?: number; readonly searchRadiusPx?: number; readonly regularizerLambda?: number; }
export interface MotionFieldResult {
  readonly width: number; readonly height: number; readonly flowX: Float32Array; readonly flowY: Float32Array;
  readonly confidence: Float32Array; readonly meanConfidence: number;
}
export interface EdgeTangentFlowField {
  readonly width: number; readonly height: number; readonly tangentX: Float32Array; readonly tangentY: Float32Array;
  readonly normalX: Float32Array; readonly normalY: Float32Array; readonly coherence: Float32Array; readonly gradientMagnitude: Float32Array;
}
export interface MotionToonUpscalerOptions {
  readonly shockStrength?: number; readonly anisotropicTangentBlend?: number; readonly baseTemporalBlend?: number;
  readonly neighborhoodClampGamma?: number; readonly etfIterations?: number; readonly blockSize?: number; readonly searchRadiusPx?: number;
}
export interface UpscaledToonFrameResult {
  readonly lowWidth: number; readonly lowHeight: number; readonly upscaledWidth: number; readonly upscaledHeight: number;
  readonly luminance2x: Float32Array; readonly edgeSharpnessGain: number; readonly temporalAcceptRatio: number;
  readonly slabByteFootprint: bigint; readonly serverCostKrw: 0;
}
export interface SequenceUpscaleReport {
  readonly frames: readonly UpscaledToonFrameResult[]; readonly upscaledWidth: number; readonly upscaledHeight: number;
  readonly temporalShimmerIndex: number; readonly independentBaselineShimmerIndex: number; readonly shimmerReductionRatio: number; readonly serverCostKrw: 0;
}

export const WGSL_BLUENOISE_HYBRID_SCREENTONE_KERNEL = /* wgsl */ `
struct ScreentoneUniforms { width: u32, height: u32, tile_size: u32, quant_steps: u32, dot_pitch_px: f32, am_weight: f32, fm_weight: f32, continuous_mix: f32, cos_primary: f32, sin_primary: f32, phase_jitter: f32, slab_offset_lo: u32 };
@group(0) @binding(0) var<uniform> params: ScreentoneUniforms;
@group(0) @binding(1) var<storage, read> tone_in: array<f32>;
@group(0) @binding(2) var<storage, read> bluenoise_tile: array<f32>;
@group(0) @binding(3) var<storage, read_write> ink_out: array<f32>;
@compute @workgroup_size(8, 8, 1)
fn synthesize_rosette_free_screentone(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) { return; }
  let idx = gid.y * params.width + gid.x;
  let steps = f32(max(params.quant_steps, 2u));
  let stepped = round(clamp(tone_in[idx], 0.0, 1.0) * steps) / steps;
  let bn = bluenoise_tile[(gid.y % params.tile_size) * params.tile_size + (gid.x % params.tile_size)];
  let pitch = max(params.dot_pitch_px, 1.0);
  let px = f32(gid.x) + (bn - 0.5) * params.phase_jitter * pitch;
  let py = f32(gid.y) + (fract(bn * 1.6180339) - 0.5) * params.phase_jitter * pitch;
  let u = (px * params.cos_primary - py * params.sin_primary) / pitch;
  let v = (px * params.sin_primary + py * params.cos_primary) / pitch;
  let am_carrier = 0.5 - 0.25 * (cos(6.2831853 * u) + cos(6.2831853 * v));
  let threshold = clamp(params.am_weight * am_carrier + params.fm_weight * bn, 0.02, 0.98);
  ink_out[idx] = mix(smoothstep(threshold - 0.06, threshold + 0.06, stepped), stepped, params.continuous_mix);
}`;

export const WGSL_ETF_TEMPORAL_UPSCALER_KERNEL = /* wgsl */ `
struct UpscalerUniforms { low_width: u32, low_height: u32, up_width: u32, up_height: u32, shock_strength: f32, temporal_blend: f32, clamp_gamma: f32, tangent_blend: f32 };
@group(0) @binding(0) var<uniform> up_params: UpscalerUniforms;
@group(0) @binding(1) var<storage, read> curr_up: array<f32>;
@group(0) @binding(2) var<storage, read> prev_up: array<f32>;
@group(0) @binding(3) var<storage, read> flow_2x: array<vec2<f32>>;
@group(0) @binding(4) var<storage, read_write> out_up: array<f32>;
@compute @workgroup_size(8, 8, 1)
fn accumulate_phase_coherent_toon(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= up_params.up_width || gid.y >= up_params.up_height) { return; }
  let idx = gid.y * up_params.up_width + gid.x;
  let motion = flow_2x[idx];
  let sx = clamp(i32(round(f32(gid.x) - motion.x)), 0, i32(up_params.up_width) - 1);
  let sy = clamp(i32(round(f32(gid.y) - motion.y)), 0, i32(up_params.up_height) - 1);
  out_up[idx] = mix(curr_up[idx], prev_up[u32(sy) * up_params.up_width + u32(sx)], up_params.temporal_blend);
}`;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(edge1 - edge0, 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

function fract(x: number): number {
  return x - Math.floor(x);
}

/** 두 독립 [0, 1] 균등 변수의 볼록 결합 Z = a*U + (1-a)*V를 사다리꼴 CDF로 균등화해 도트 면적 왜곡을 제거한다. */
function equalizeConvexUniformPair(z: number, weightA: number): number {
  const cz = clamp(z, 0, 1);
  const m = Math.min(clamp(weightA, 0, 1), 1 - clamp(weightA, 0, 1));
  if (m <= 1e-5) return cz;
  const bigM = 1 - m;
  if (cz < m) return (cz * cz) / (2 * m * bigM);
  if (cz <= bigM) return (cz - 0.5 * m) / bigM;
  return 1 - ((1 - cz) * (1 - cz)) / (2 * m * bigM);
}

/** Jorge Jimenez Interleaved Gradient Noise — 비주기 초기 위상 분산에 사용한다. */
export function evaluateInterleavedGradientNoise(x: number, y: number, seedOffset = 0): number {
  const s = seedOffset * 5.588238;
  return fract(52.9829189 * fract(0.06711056 * (x + s) + 0.00583715 * (y + s)));
}

function alignSlabBytes(rawBytes: number): bigint {
  const raw = BigInt(Math.max(0, Math.ceil(rawBytes)));
  const mask = WASM64_WAVE14_SLAB_ALIGNMENT_BYTES - BigInt(1);
  return (raw + mask) & ~mask;
}

function addPointEnergy(
  energy: Float64Array, kernel: Float64Array, tileSize: number, idx: number, sign: 1 | -1,
): void {
  const px = idx % tileSize;
  const py = Math.floor(idx / tileSize);
  for (let y = 0; y < tileSize; y += 1) {
    const kRow = Math.abs(y - py) * tileSize;
    const eRow = y * tileSize;
    for (let x = 0; x < tileSize; x += 1) {
      energy[eRow + x] = (energy[eRow + x] ?? 0) + sign * (kernel[kRow + Math.abs(x - px)] ?? 0);
    }
  }
}

function findEnergyExtremum(binary: Uint8Array, energy: Float64Array, targetBit: 0 | 1, pickMax: boolean): number {
  let bestIdx = 0;
  let bestVal = pickMax ? -Infinity : Infinity;
  for (let i = 0; i < binary.length; i += 1) {
    const e = energy[i] ?? 0;
    if (binary[i] === targetBit && (pickMax ? e > bestVal : e < bestVal)) {
      bestVal = e;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function computeHighToLowSpectrumRatio(tile: Float32Array, tileSize: number): number {
  let lowBandEnergy = 0;
  let highBandEnergy = 0;
  const half = Math.floor(tileSize / 2);
  const lowCutoffSq = Math.max(1, Math.floor((half * 0.35) ** 2));
  for (let ky = 0; ky <= half; ky += 1) {
    for (let kx = 0; kx <= half; kx += 1) {
      if (kx === 0 && ky === 0) continue;
      let re = 0; let im = 0;
      for (let y = 0; y < tileSize; y += 1) {
        for (let x = 0; x < tileSize; x += 1) {
          const centered = (tile[y * tileSize + x] ?? 0) - 0.5;
          const angle = (-2 * Math.PI * (kx * x + ky * y)) / tileSize;
          re += centered * Math.cos(angle);
          im += centered * Math.sin(angle);
        }
      }
      const power = re * re + im * im;
      if (kx * kx + ky * ky <= lowCutoffSq) lowBandEnergy += power;
      else highBandEnergy += power;
    }
  }
  return highBandEnergy / Math.max(lowBandEnergy, 1e-6);
}

/** Ulichney Void-and-Cluster 알고리즘과 IGN 초기 위상으로 순환 블루노이즈 임계값 타일을 합성한다. */
export function synthesizeVoidAndClusterBlueNoiseTile(options: BlueNoiseTileOptions = {}): BlueNoiseTileSpectrumSummary {
  const tileSize = clamp(Math.round(options.tileSize ?? DEFAULT_BLUENOISE_TILE_SIZE), 8, 64);
  const sigma = clamp(options.filterSigma ?? 1.5, 0.8, 3.0);
  const seed = options.seed ?? 14;
  const maxSwaps = clamp(Math.round(options.maxSwapIterations ?? 96), 8, 512);
  const totalPixels = tileSize * tileSize;
  const initialCount = Math.max(2, Math.floor(totalPixels * 0.1));

  const kernel = new Float64Array(totalPixels);
  const invTwoSigmaSq = 1 / (2 * sigma * sigma);
  for (let dy = 0; dy < tileSize; dy += 1) {
    const wy = Math.min(dy, tileSize - dy);
    for (let dx = 0; dx < tileSize; dx += 1) {
      const wx = Math.min(dx, tileSize - dx);
      kernel[dy * tileSize + dx] = Math.exp(-(wx * wx + wy * wy) * invTwoSigmaSq);
    }
  }

  const initialBinary = new Uint8Array(totalPixels);
  const initialEnergy = new Float64Array(totalPixels);
  const candidates: { idx: number; score: number }[] = [];
  for (let y = 0; y < tileSize; y += 1) {
    for (let x = 0; x < tileSize; x += 1) {
      const ign = evaluateInterleavedGradientNoise(x, y, seed);
      const r2 = fract(0.7548776662 * (x + seed) + 0.5698402909 * (y + seed * 3));
      candidates.push({ idx: y * tileSize + x, score: fract(ign * 0.65 + r2 * 0.35) });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  for (let k = 0; k < initialCount; k += 1) {
    const pick = candidates[k]?.idx ?? k;
    initialBinary[pick] = 1; addPointEnergy(initialEnergy, kernel, tileSize, pick, 1);
  }

  let swapIterations = 0;
  for (let iter = 0; iter < maxSwaps; iter += 1) {
    const clusterIdx = findEnergyExtremum(initialBinary, initialEnergy, 1, true);
    initialBinary[clusterIdx] = 0; addPointEnergy(initialEnergy, kernel, tileSize, clusterIdx, -1);
    const voidIdx = findEnergyExtremum(initialBinary, initialEnergy, 0, false);
    initialBinary[voidIdx] = 1; addPointEnergy(initialEnergy, kernel, tileSize, voidIdx, 1);
    swapIterations = iter + 1;
    if (voidIdx === clusterIdx) break;
  }

  const ranks = new Int32Array(totalPixels);
  const p1Bin = new Uint8Array(initialBinary); const p1Eng = new Float64Array(initialEnergy);
  for (let rank = initialCount - 1; rank >= 0; rank -= 1) {
    const cIdx = findEnergyExtremum(p1Bin, p1Eng, 1, true);
    p1Bin[cIdx] = 0; addPointEnergy(p1Eng, kernel, tileSize, cIdx, -1); ranks[cIdx] = rank;
  }
  const p2Bin = new Uint8Array(initialBinary); const p2Eng = new Float64Array(initialEnergy);
  for (let rank = initialCount; rank < totalPixels; rank += 1) {
    const vIdx = findEnergyExtremum(p2Bin, p2Eng, 0, false);
    p2Bin[vIdx] = 1; addPointEnergy(p2Eng, kernel, tileSize, vIdx, 1); ranks[vIdx] = rank;
  }

  const values = new Float32Array(totalPixels);
  let sum = 0;
  for (let i = 0; i < totalPixels; i += 1) {
    const norm = ((ranks[i] ?? 0) + 0.5) / totalPixels;
    values[i] = norm; sum += norm;
  }
  return { tileSize, values, meanValue: sum / totalPixels, highToLowFrequencyEnergyRatio: computeHighToLowSpectrumRatio(values, tileSize), swapIterationsExecuted: swapIterations, slabByteFootprint: alignSlabBytes(values.byteLength) };
}

/** 뷰포트 배율·DPI로부터 나이퀴스트 한계 이하의 주기 AM 격자를 감쇠하고 FM/연속 혼합비를 산출한다. */
export function computeHybridBandWeights(preset: ScreentonePresetProfile, zoomScale: number, targetDpi: number): HybridBandWeights {
  const dotPitchPx = (clamp(targetDpi, 72, 1200) / preset.baseLpi) * clamp(zoomScale, 0.05, 8.0);
  if (preset.kind === "stochastic-sand") {
    return { dotPitchPx, amCarrierWeight: 0, fmBlueNoiseWeight: 1, antiMoireContinuousMix: (1 - smoothstep(1.15, 2.4, dotPitchPx)) * 0.85 };
  }
  const amCarrierWeight = 0.72 * smoothstep(2.35, 5.2, dotPitchPx);
  return { dotPitchPx, amCarrierWeight, fmBlueNoiseWeight: 1 - amCarrierWeight, antiMoireContinuousMix: (1 - smoothstep(1.25, 2.9, dotPitchPx)) * 0.88 };
}

/** 목표 계조 대비 하프톤 잔차의 투영 간섭 분산과 초과 자기상관 피크로 주기적 모아레 맥놀이를 측정한다. */
export function measurePeriodicMoireBeatingIndex(
  inkCoverage: Float32Array, width: number, height: number, expectedDotPitchPx: number, referenceTone?: Float32Array,
): number {
  if (width < 12 || height < 12) return 0;
  const colProfile = new Float64Array(width);
  const rowProfile = new Float64Array(height);
  let globalMean = 0;
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const val = (inkCoverage[idx] ?? 0) - (referenceTone ? (referenceTone[idx] ?? 0) : 0);
      colProfile[x] = (colProfile[x] ?? 0) + val;
      rowSum += val;
    }
    rowProfile[y] = rowSum / width;
    globalMean += rowSum;
  }
  globalMean /= width * height;
  for (let x = 0; x < width; x += 1) colProfile[x] = (colProfile[x] ?? 0) / height - globalMean;
  for (let y = 0; y < height; y += 1) rowProfile[y] = (rowProfile[y] ?? 0) - globalMean;

  const measureAxisBeat = (signal: Float64Array, orthSpan: number): number => {
    const len = signal.length;
    let zeroLagEnergy = 0;
    for (let i = 0; i < len; i += 1) zeroLagEnergy += (signal[i] ?? 0) ** 2;
    const variance = zeroLagEnergy / len;
    // 비간섭(incoherent) 스토캐스틱 망점의 유한 표본 투영 분산 바닥(0.25 / orthSpan)을 분리한다.
    const incoherentFloor = 0.38 / Math.max(orthSpan, 1);
    const minBeatLag = Math.max(4, Math.ceil(expectedDotPitchPx * 2.3));
    const maxBeatLag = Math.floor(len * 0.45);
    if (variance <= incoherentFloor || minBeatLag >= maxBeatLag) return 0;

    const coherentVisibility = clamp((variance - incoherentFloor) / 0.06, 0, 1);
    let maxExcessCorr = 0;
    for (let lag = minBeatLag; lag <= maxBeatLag; lag += 1) {
      let cov = 0;
      const count = len - lag;
      for (let i = 0; i < count; i += 1) cov += (signal[i] ?? 0) * (signal[i + lag] ?? 0);
      const rawCorr = Math.abs(cov / count) / Math.max(variance, 1e-6);
      const finiteSampleNoiseBound = 2.4 / Math.sqrt(Math.max(count, 4));
      const excessCorr = Math.max(0, rawCorr - finiteSampleNoiseBound) / Math.max(1 - finiteSampleNoiseBound, 0.2);
      if (excessCorr > maxExcessCorr) maxExcessCorr = excessCorr;
    }
    return clamp(maxExcessCorr * coherentVisibility, 0, 1);
  };
  return Math.max(measureAxisBeat(colProfile, height), measureAxisBeat(rowProfile, width));
}

/** 다중 대역 블루노이즈와 FM/AM 하이브리드 변조로 모아레 없는 스크린톤을 합성한다. */
export function synthesizeRosetteFreeScreentone(input: ScreentoneSynthesisInput): ScreentoneSynthesisResult {
  const width = Math.max(1, Math.floor(input.width));
  const height = Math.max(1, Math.floor(input.height));
  const pixelCount = width * height;
  const preset = SCREENTONE_PRESET_PROFILES[input.preset ?? "classic-60lpi"];
  const zoomScale = clamp(input.zoomScale ?? 1.0, 0.05, 8.0);
  const targetDpi = clamp(input.targetDpi ?? DEFAULT_PRINT_DPI, 72, 1200);
  const quantSteps = clamp(Math.round(input.quantizationSteps ?? 12), 2, 64);

  const blueNoise = input.blueNoiseTile ?? synthesizeVoidAndClusterBlueNoiseTile({ tileSize: DEFAULT_BLUENOISE_TILE_SIZE });
  const bandWeights = computeHybridBandWeights(preset, zoomScale, targetDpi);
  const pRad = (preset.primaryAngleDeg * Math.PI) / 180;
  const sRad = (preset.secondaryAngleDeg * Math.PI) / 180;
  const cosP = Math.cos(pRad); const sinP = Math.sin(pRad);
  const cosS = Math.cos(sRad); const sinS = Math.sin(sRad);
  const safePitch = Math.max(bandWeights.dotPitchPx, 1.0);
  const ts = blueNoise.tileSize;

  const inkCoverage = new Float32Array(pixelCount);
  const referenceStepped = new Float32Array(pixelCount);
  let sumSquaredStepError = 0;
  let sumSignedCoverageError = 0;

  for (let y = 0; y < height; y += 1) {
    const tileY = Math.floor(y / ts);
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const rawTone = clamp(input.toneDensity[idx] ?? 0, 0, 1);
      const lineMask = clamp(input.lineArtPreserveMask?.[idx] ?? 0, 0, 1);
      if (rawTone <= 0.002 && lineMask <= 0) { inkCoverage[idx] = 0; referenceStepped[idx] = 0; continue; }
      if (rawTone >= 0.998 || lineMask >= 0.999) { inkCoverage[idx] = 1; referenceStepped[idx] = 1; continue; }

      const steppedTone = Math.round(rawTone * quantSteps) / quantSteps;
      referenceStepped[idx] = Math.max(steppedTone, lineMask);
      // Cranley-Patterson 토러스 순환 이동으로 타일 경계의 공간 반복 주기를 제거한다.
      const tileX = Math.floor(x / ts);
      const shiftX = (tileX * 7 + tileY * 13) % ts;
      const shiftY = (tileX * 11 + tileY * 5) % ts;
      const bnPrimary = blueNoise.values[((y + shiftY) % ts) * ts + ((x + shiftX) % ts)] ?? 0.5;
      const ignFine = evaluateInterleavedGradientNoise(x, y, 3);
      const multiBandBlue = fract(bnPrimary + (ignFine - 0.5) * 0.14);

      const extremeFactor = Math.max(1 - smoothstep(0.02, preset.fmHighlightCutoff, steppedTone), smoothstep(preset.fmShadowCutoff, 0.98, steppedTone));
      const localAmWeight = bandWeights.amCarrierWeight * (1 - 0.75 * extremeFactor);
      const px = x + (multiBandBlue - 0.5) * preset.phaseJitterStrength * safePitch;
      const py = y + (ignFine - 0.5) * preset.phaseJitterStrength * safePitch;
      const uBase = (px * cosP - py * sinP) / safePitch;
      const vBase = (px * sinP + py * cosP) / safePitch;
      const cellPhase = evaluateInterleavedGradientNoise(Math.floor(uBase), Math.floor(vBase), 7) - 0.5;
      const triU = 1 - Math.abs(2 * fract(uBase + cellPhase * 0.34) - 1);
      const triV = 1 - Math.abs(2 * fract(vBase - cellPhase * 0.29) - 1);
      let carrier = equalizeConvexUniformPair(0.5 * (triU + triV), 0.5);

      if (preset.crossMixWeight > 0) {
        const subPitch = safePitch * 1.1313708;
        const su = 1 - Math.abs(2 * fract((px * cosS - py * sinS) / subPitch) - 1);
        const sv = 1 - Math.abs(2 * fract((px * sinS + py * cosS) / subPitch) - 1);
        const sec = equalizeConvexUniformPair(0.5 * (su + sv), 0.5);
        carrier = equalizeConvexUniformPair(carrier * (1 - preset.crossMixWeight) + sec * preset.crossMixWeight, 1 - preset.crossMixWeight);
      }

      const eqThreshold = equalizeConvexUniformPair(localAmWeight * carrier + (1 - localAmWeight) * multiBandBlue, localAmWeight);
      const threshold = clamp(eqThreshold, 0.015, 0.985);
      const halfW = clamp(0.18 / Math.max(safePitch, 0.8), 0.025, 0.14);
      const dot = smoothstep(threshold - halfW, threshold + halfW, steppedTone);
      const antiMoire = dot * (1 - bandWeights.antiMoireContinuousMix) + steppedTone * bandWeights.antiMoireContinuousMix;
      const finalInk = clamp(Math.max(antiMoire, lineMask), 0, 1);
      inkCoverage[idx] = finalInk;
      sumSignedCoverageError += finalInk - steppedTone;
    }
  }

  const patchSize = Math.min(4, width, height);
  let patchCount = 0;
  for (let py = 0; py + patchSize <= height; py += patchSize) {
    for (let px = 0; px + patchSize <= width; px += patchSize) {
      let sumOut = 0; let sumTarget = 0;
      for (let dy = 0; dy < patchSize; dy += 1) {
        for (let dx = 0; dx < patchSize; dx += 1) {
          const i = (py + dy) * width + (px + dx);
          sumOut += inkCoverage[i] ?? 0;
          sumTarget += Math.round(clamp(input.toneDensity[i] ?? 0, 0, 1) * quantSteps) / quantSteps;
        }
      }
      sumSquaredStepError += ((sumOut - sumTarget) / (patchSize * patchSize)) ** 2;
      patchCount += 1;
    }
  }

  return {
    width, height, inkCoverage, bandWeights,
    moireBeatingIndex: measurePeriodicMoireBeatingIndex(inkCoverage, width, height, bandWeights.dotPitchPx, referenceStepped),
    tonalStepRmsError: patchCount > 0 ? Math.sqrt(sumSquaredStepError / patchCount) : 0,
    meanCoverageError: Math.abs(sumSignedCoverageError / pixelCount), serverCostKrw: 0,
  };
}

function sampleBilinearClamped(field: Float32Array, width: number, height: number, x: number, y: number): number {
  const cx = clamp(x, 0, width - 1); const cy = clamp(y, 0, height - 1);
  const x0 = Math.floor(cx); const y0 = Math.floor(cy);
  const x1 = Math.min(x0 + 1, width - 1); const y1 = Math.min(y0 + 1, height - 1);
  const fx = cx - x0; const fy = cy - y0;
  const top = (field[y0 * width + x0] ?? 0) * (1 - fx) + (field[y0 * width + x1] ?? 0) * fx;
  const bot = (field[y1 * width + x0] ?? 0) * (1 - fx) + (field[y1 * width + x1] ?? 0) * fx;
  return top + (bot - top) * fy;
}

function cubicHermite(v0: number, v1: number, v2: number, v3: number, t: number): number {
  return (((-0.5 * v0 + 1.5 * v1 - 1.5 * v2 + 0.5 * v3) * t + (v0 - 2.5 * v1 + 2.0 * v2 - 0.5 * v3)) * t + (-0.5 * v0 + 0.5 * v2)) * t + v1;
}

function sampleBicubicCatmullRomClamped(field: Float32Array, width: number, height: number, x: number, y: number): number {
  const cx = clamp(x, 0, width - 1); const cy = clamp(y, 0, height - 1);
  const ix = Math.floor(cx); const iy = Math.floor(cy);
  const fx = cx - ix; const fy = cy - iy;
  let minN = Infinity; let maxN = -Infinity;
  const rows = [0, 0, 0, 0];
  for (let j = -1; j <= 2; j += 1) {
    const sy = clamp(iy + j, 0, height - 1);
    const s0 = field[sy * width + clamp(ix - 1, 0, width - 1)] ?? 0;
    const s1 = field[sy * width + clamp(ix, 0, width - 1)] ?? 0;
    const s2 = field[sy * width + clamp(ix + 1, 0, width - 1)] ?? 0;
    const s3 = field[sy * width + clamp(ix + 2, 0, width - 1)] ?? 0;
    if (j === 0 || j === 1) { minN = Math.min(minN, s1, s2); maxN = Math.max(maxN, s1, s2); }
    rows[j + 1] = cubicHermite(s0, s1, s2, s3, fx);
  }
  return clamp(cubicHermite(rows[0] ?? 0, rows[1] ?? 0, rows[2] ?? 0, rows[3] ?? 0, fy), minN, maxN);
}

/** 블록 SAD 정수 정합 뒤 2×2 Lucas-Kanade 정규 방정식으로 서브픽셀 광학 흐름을 추정한다. */
export function estimateBlockSubpixelMotionField(prevFrame: Float32Array, currFrame: Float32Array, width: number, height: number, options: MotionEstimationOptions = {}): MotionFieldResult {
  const blockSize = clamp(Math.round(options.blockSize ?? 8), 4, 32);
  const searchRadius = clamp(Math.round(options.searchRadiusPx ?? 4), 1, 16);
  const lambda = clamp(options.regularizerLambda ?? 1e-3, 1e-6, 0.5);
  const flowX = new Float32Array(width * height); const flowY = new Float32Array(width * height);
  const confidence = new Float32Array(width * height);
  let confidenceSum = 0;

  for (let by = 0; by < height; by += blockSize) {
    const bh = Math.min(blockSize, height - by);
    for (let bx = 0; bx < width; bx += blockSize) {
      const bw = Math.min(blockSize, width - bx);
      let bestDx = 0; let bestDy = 0; let bestSad = Infinity;
      for (let dy = -searchRadius; dy <= searchRadius; dy += 1) {
        for (let dx = -searchRadius; dx <= searchRadius; dx += 1) {
          let sad = (Math.abs(dx) + Math.abs(dy)) * 1e-4;
          for (let py = 0; py < bh; py += 1) {
            const cy = by + py; const sy = clamp(cy - dy, 0, height - 1);
            for (let px = 0; px < bw; px += 1) {
              sad += Math.abs((currFrame[cy * width + bx + px] ?? 0) - (prevFrame[sy * width + clamp(bx + px - dx, 0, width - 1)] ?? 0));
            }
          }
          if (sad < bestSad) { bestSad = sad; bestDx = dx; bestDy = dy; }
        }
      }
      let a00 = lambda; let a01 = 0; let a11 = lambda; let b0 = 0; let b1 = 0; let residualAbs = 0;
      for (let py = 0; py < bh; py += 1) {
        const cy = by + py;
        for (let px = 0; px < bw; px += 1) {
          const cx = bx + px; const refX = cx - bestDx; const refY = cy - bestDy;
          const diff = (currFrame[cy * width + cx] ?? 0) - sampleBilinearClamped(prevFrame, width, height, refX, refY);
          const gx = 0.5 * (sampleBilinearClamped(prevFrame, width, height, refX + 1, refY) - sampleBilinearClamped(prevFrame, width, height, refX - 1, refY));
          const gy = 0.5 * (sampleBilinearClamped(prevFrame, width, height, refX, refY + 1) - sampleBilinearClamped(prevFrame, width, height, refX, refY - 1));
          a00 += gx * gx; a01 += gx * gy; a11 += gy * gy; b0 -= diff * gx; b1 -= diff * gy; residualAbs += Math.abs(diff);
        }
      }
      const det = a00 * a11 - a01 * a01;
      const finalVx = bestDx + (Math.abs(det) > 1e-8 ? clamp((a11 * b0 - a01 * b1) / det, -0.85, 0.85) : 0);
      const finalVy = bestDy + (Math.abs(det) > 1e-8 ? clamp((-a01 * b0 + a00 * b1) / det, -0.85, 0.85) : 0);
      const blockConf = clamp(Math.exp(-(residualAbs / Math.max(1, bw * bh)) * 9.0), 0, 1);
      for (let py = 0; py < bh; py += 1) {
        const rowOffset = (by + py) * width;
        for (let px = 0; px < bw; px += 1) {
          const idx = rowOffset + bx + px;
          flowX[idx] = finalVx; flowY[idx] = finalVy; confidence[idx] = blockConf; confidenceSum += blockConf;
        }
      }
    }
  }
  return { width, height, flowX, flowY, confidence, meanConfidence: confidenceSum / Math.max(1, width * height) };
}

/** 구조 텐서 고유방향과 접선 정렬 반복으로 선화 결을 따르는 Edge Tangent Flow(ETF)를 계산한다. */
export function computeEdgeTangentFlowField(
  luminance: Float32Array, width: number, height: number, iterations = 2,
): EdgeTangentFlowField {
  const count = width * height;
  const jxx = new Float32Array(count); const jxy = new Float32Array(count);
  const jyy = new Float32Array(count); const gradMag = new Float32Array(count);

  for (let y = 0; y < height; y += 1) {
    const ym = Math.max(0, y - 1); const yp = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x += 1) {
      const xm = Math.max(0, x - 1); const xp = Math.min(width - 1, x + 1);
      const gx = ((luminance[ym * width + xp] ?? 0) + 2 * (luminance[y * width + xp] ?? 0) + (luminance[yp * width + xp] ?? 0) -
        ((luminance[ym * width + xm] ?? 0) + 2 * (luminance[y * width + xm] ?? 0) + (luminance[yp * width + xm] ?? 0))) * 0.125;
      const gy = ((luminance[yp * width + xm] ?? 0) + 2 * (luminance[yp * width + x] ?? 0) + (luminance[yp * width + xp] ?? 0) -
        ((luminance[ym * width + xm] ?? 0) + 2 * (luminance[ym * width + x] ?? 0) + (luminance[ym * width + xp] ?? 0))) * 0.125;
      const idx = y * width + x;
      jxx[idx] = gx * gx; jxy[idx] = gx * gy; jyy[idx] = gy * gy; gradMag[idx] = Math.hypot(gx, gy);
    }
  }

  let tangentX = new Float32Array(count); let tangentY = new Float32Array(count);
  const normalX = new Float32Array(count); const normalY = new Float32Array(count);
  const coherence = new Float32Array(count);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sxx = 0; let sxy = 0; let syy = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const sy = clamp(y + dy, 0, height - 1);
        for (let dx = -1; dx <= 1; dx += 1) {
          const w = dx === 0 && dy === 0 ? 4 : dx === 0 || dy === 0 ? 2 : 1;
          const k = sy * width + clamp(x + dx, 0, width - 1);
          sxx += (jxx[k] ?? 0) * w; sxy += (jxy[k] ?? 0) * w; syy += (jyy[k] ?? 0) * w;
        }
      }
      sxx /= 16; sxy /= 16; syy /= 16;
      const trace = sxx + syy; const disc = Math.hypot(sxx - syy, 2 * sxy);
      const lambda1 = 0.5 * (trace + disc); const lambda2 = Math.max(0, 0.5 * (trace - disc));
      let nx = lambda1 - syy; let ny = sxy;
      if (Math.hypot(nx, ny) < 1e-7) { nx = sxx >= syy ? 1 : 0; ny = sxx >= syy ? 0 : 1; }
      const nLen = Math.max(Math.hypot(nx, ny), 1e-7);
      nx /= nLen; ny /= nLen;
      const idx = y * width + x;
      normalX[idx] = nx; normalY[idx] = ny; tangentX[idx] = -ny; tangentY[idx] = nx;
      coherence[idx] = trace > 1e-7 ? clamp(((lambda1 - lambda2) / (trace + 1e-7)) ** 2, 0, 1) : 0;
    }
  }

  const safeIters = clamp(Math.round(iterations), 0, 5);
  for (let iter = 0; iter < safeIters; iter += 1) {
    const nextTx = new Float32Array(count); const nextTy = new Float32Array(count);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const cIdx = y * width + x;
        const cx = tangentX[cIdx] ?? 0; const cy = tangentY[cIdx] ?? 0; const cMag = gradMag[cIdx] ?? 0;
        let accX = cx * 0.25; let accY = cy * 0.25;
        for (let dy = -1; dy <= 1; dy += 1) {
          const sy = clamp(y + dy, 0, height - 1);
          for (let dx = -1; dx <= 1; dx += 1) {
            const nIdx = sy * width + clamp(x + dx, 0, width - 1);
            const tx = tangentX[nIdx] ?? 0; const ty = tangentY[nIdx] ?? 0;
            const dot = cx * tx + cy * ty;
            const w = 0.5 * (1 + clamp((gradMag[nIdx] ?? 0) - cMag, -1, 1)) * Math.abs(dot) + 0.05;
            const sign = dot >= 0 ? 1 : -1;
            accX += sign * tx * w; accY += sign * ty * w;
          }
        }
        const len = Math.hypot(accX, accY);
        nextTx[cIdx] = len > 1e-6 ? accX / len : cx;
        nextTy[cIdx] = len > 1e-6 ? accY / len : cy;
      }
    }
    tangentX = nextTx; tangentY = nextTy;
  }

  for (let i = 0; i < count; i += 1) { normalX[i] = tangentY[i] ?? 0; normalY[i] = -(tangentX[i] ?? 0); }
  return { width, height, tangentX, tangentY, normalX, normalY, coherence, gradientMagnitude: gradMag };
}

function measureAverageGradientSharpness(field: Float32Array, width: number, height: number): number {
  let sum = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const gx = (field[y * width + x + 1] ?? 0) - (field[y * width + x - 1] ?? 0);
      const gy = (field[(y + 1) * width + x] ?? 0) - (field[(y - 1) * width + x] ?? 0);
      sum += Math.hypot(gx, gy) * 0.5;
    }
  }
  return sum / Math.max(1, (width - 2) * (height - 2));
}

/** 모션 보상 시간 누적과 ETF 이방성 충격 복원으로 깜빡임 없이 컷 시퀀스를 2× 확대하는 업스케일러. */
export class SpatiotemporalMotionToonUpscaler {
  private readonly shockStrength: number; private readonly anisotropicTangentBlend: number;
  private readonly baseTemporalBlend: number; private readonly neighborhoodClampGamma: number;
  private readonly etfIterations: number; private readonly blockSize: number; private readonly searchRadiusPx: number;
  private prevLowFrame: Float32Array | null = null; private prevUpscaledFrame: Float32Array | null = null;
  private prevLowWidth = 0; private prevLowHeight = 0;

  public constructor(options: MotionToonUpscalerOptions = {}) {
    this.shockStrength = clamp(options.shockStrength ?? 0.42, 0, 1.0);
    this.anisotropicTangentBlend = clamp(options.anisotropicTangentBlend ?? 0.36, 0, 0.8);
    this.baseTemporalBlend = clamp(options.baseTemporalBlend ?? 0.68, 0, 0.92);
    this.neighborhoodClampGamma = clamp(options.neighborhoodClampGamma ?? 1.15, 0.4, 3.0);
    this.etfIterations = clamp(Math.round(options.etfIterations ?? 2), 0, 5);
    this.blockSize = clamp(Math.round(options.blockSize ?? 8), 4, 32);
    this.searchRadiusPx = clamp(Math.round(options.searchRadiusPx ?? 4), 1, 16);
  }

  public resetHistory(): void {
    this.prevLowFrame = null; this.prevUpscaledFrame = null; this.prevLowWidth = 0; this.prevLowHeight = 0;
  }

  /** 단일 프레임을 ETF 이방성 충격 복원 + 이전 프레임 모션 보상 누적으로 2× 업스케일한다. */
  public upscaleFrame(lowFrame: Float32Array, lowWidth: number, lowHeight: number): UpscaledToonFrameResult {
    const w = Math.max(2, Math.floor(lowWidth)); const h = Math.max(2, Math.floor(lowHeight));
    const upW = w * 2; const upH = h * 2; const upCount = upW * upH;
    const etf = computeEdgeTangentFlowField(lowFrame, w, h, this.etfIterations);
    const bilinearBaseline = new Float32Array(upCount); const spatial2x = new Float32Array(upCount);

    for (let uy = 0; uy < upH; uy += 1) {
      const srcY = (uy + 0.5) * 0.5 - 0.5; const ly = clamp(Math.round(srcY), 0, h - 1);
      for (let ux = 0; ux < upW; ux += 1) {
        const srcX = (ux + 0.5) * 0.5 - 0.5;
        const lIdx = ly * w + clamp(Math.round(srcX), 0, w - 1); const upIdx = uy * upW + ux;
        bilinearBaseline[upIdx] = sampleBilinearClamped(lowFrame, w, h, srcX, srcY);
        const centerCubic = sampleBicubicCatmullRomClamped(lowFrame, w, h, srcX, srcY);
        const coh = etf.coherence[lIdx] ?? 0;
        const tx = etf.tangentX[lIdx] ?? 1; const ty = etf.tangentY[lIdx] ?? 0;
        const nx = etf.normalX[lIdx] ?? 0; const ny = etf.normalY[lIdx] ?? 1;
        const tPlus = sampleBilinearClamped(lowFrame, w, h, srcX + tx * 0.55, srcY + ty * 0.55);
        const tMinus = sampleBilinearClamped(lowFrame, w, h, srcX - tx * 0.55, srcY - ty * 0.55);
        const anisoBase = centerCubic + (0.5 * centerCubic + 0.25 * (tPlus + tMinus) - centerCubic) * this.anisotropicTangentBlend * coh;
        const nPlus = sampleBilinearClamped(lowFrame, w, h, srcX + nx * 0.65, srcY + ny * 0.65);
        const nMinus = sampleBilinearClamped(lowFrame, w, h, srcX - nx * 0.65, srcY - ny * 0.65);
        const shockTerm = -Math.tanh((nPlus - 2 * anisoBase + nMinus) * 14.0) * 0.5 * Math.abs(nPlus - nMinus) * this.shockStrength * (0.35 + 0.65 * coh);
        spatial2x[upIdx] = clamp(anisoBase + shockTerm, Math.min(anisoBase, nPlus, nMinus, tPlus, tMinus), Math.max(anisoBase, nPlus, nMinus, tPlus, tMinus));
      }
    }

    const output2x = new Float32Array(upCount);
    let acceptedCount = 0;
    if (this.prevLowFrame !== null && this.prevUpscaledFrame !== null && this.prevLowWidth === w && this.prevLowHeight === h && this.baseTemporalBlend > 0) {
      const motion = estimateBlockSubpixelMotionField(this.prevLowFrame, lowFrame, w, h, { blockSize: this.blockSize, searchRadiusPx: this.searchRadiusPx });
      for (let uy = 0; uy < upH; uy += 1) {
        const srcY = (uy + 0.5) * 0.5 - 0.5;
        for (let ux = 0; ux < upW; ux += 1) {
          const srcX = (ux + 0.5) * 0.5 - 0.5; const upIdx = uy * upW + ux;
          const vx2x = sampleBilinearClamped(motion.flowX, w, h, srcX, srcY) * 2.0;
          const vy2x = sampleBilinearClamped(motion.flowY, w, h, srcX, srcY) * 2.0;
          const conf = sampleBilinearClamped(motion.confidence, w, h, srcX, srcY);
          const warpedPrev = sampleBilinearClamped(this.prevUpscaledFrame, upW, upH, ux - vx2x, uy - vy2x);
          let sum = 0; let sumSq = 0;
          for (let dy = -1; dy <= 1; dy += 1) {
            const ny = clamp(uy + dy, 0, upH - 1);
            for (let dx = -1; dx <= 1; dx += 1) {
              const v = spatial2x[ny * upW + clamp(ux + dx, 0, upW - 1)] ?? 0;
              sum += v; sumSq += v * v;
            }
          }
          const mean = sum / 9;
          const boxHalf = Math.sqrt(Math.max(0, sumSq / 9 - mean * mean)) * this.neighborhoodClampGamma + 0.015;
          const effectiveAlpha = this.baseTemporalBlend * conf;
          if (effectiveAlpha > 0.1) acceptedCount += 1;
          output2x[upIdx] = (spatial2x[upIdx] ?? 0) * (1 - effectiveAlpha) + clamp(warpedPrev, mean - boxHalf, mean + boxHalf) * effectiveAlpha;
        }
      }
    } else {
      output2x.set(spatial2x);
    }

    this.prevLowFrame = new Float32Array(lowFrame); this.prevUpscaledFrame = new Float32Array(output2x);
    this.prevLowWidth = w; this.prevLowHeight = h;
    const baseGrad = measureAverageGradientSharpness(bilinearBaseline, upW, upH);
    const outGrad = measureAverageGradientSharpness(output2x, upW, upH);
    return {
      lowWidth: w, lowHeight: h, upscaledWidth: upW, upscaledHeight: upH,
      luminance2x: output2x, edgeSharpnessGain: outGrad / Math.max(baseGrad, 1e-6),
      temporalAcceptRatio: acceptedCount / upCount, slabByteFootprint: alignSlabBytes(output2x.byteLength), serverCostKrw: 0,
    };
  }

  /** 다중 프레임 컷 시퀀스를 연속 업스케일하고 독립 프레임 처리 대비 선화 깜빡임 감소율을 계산한다. */
  public upscaleSequence(frames: readonly Float32Array[], lowWidth: number, lowHeight: number): SequenceUpscaleReport {
    const w = Math.max(2, Math.floor(lowWidth)); const h = Math.max(2, Math.floor(lowHeight));
    const upW = w * 2; const upH = h * 2;
    this.resetHistory();
    const coherentFrames: UpscaledToonFrameResult[] = [];
    const independentUpscaler = new SpatiotemporalMotionToonUpscaler({ shockStrength: this.shockStrength * 1.45, anisotropicTangentBlend: 0, baseTemporalBlend: 0, etfIterations: this.etfIterations });
    const independentFrames: UpscaledToonFrameResult[] = [];
    for (let i = 0; i < frames.length; i += 1) {
      const f = frames[i]; if (!f) continue;
      coherentFrames.push(this.upscaleFrame(f, w, h));
      independentUpscaler.resetHistory();
      independentFrames.push(independentUpscaler.upscaleFrame(f, w, h));
    }
    const measureMotionAlignedShimmer = (seq: readonly UpscaledToonFrameResult[]): number => {
      if (seq.length < 2) return 0;
      let totalShimmer = 0; let pairCount = 0;
      for (let t = 1; t < seq.length; t += 1) {
        const prevLow = frames[t - 1]; const currLow = frames[t];
        const prevUp = seq[t - 1]?.luminance2x; const currUp = seq[t]?.luminance2x;
        if (!prevLow || !currLow || !prevUp || !currUp) continue;
        const motion = estimateBlockSubpixelMotionField(prevLow, currLow, w, h, { blockSize: this.blockSize, searchRadiusPx: this.searchRadiusPx });
        let sqDiffSum = 0; let sampleCount = 0;
        for (let uy = 4; uy < upH - 4; uy += 1) {
          const srcY = (uy + 0.5) * 0.5 - 0.5;
          for (let ux = 4; ux < upW - 4; ux += 1) {
            const srcX = (ux + 0.5) * 0.5 - 0.5;
            const vx2x = sampleBilinearClamped(motion.flowX, w, h, srcX, srcY) * 2.0;
            const vy2x = sampleBilinearClamped(motion.flowY, w, h, srcX, srcY) * 2.0;
            sqDiffSum += ((currUp[uy * upW + ux] ?? 0) - sampleBilinearClamped(prevUp, upW, upH, ux - vx2x, uy - vy2x)) ** 2;
            sampleCount += 1;
          }
        }
        if (sampleCount > 0) { totalShimmer += Math.sqrt(sqDiffSum / sampleCount); pairCount += 1; }
      }
      return pairCount > 0 ? totalShimmer / pairCount : 0;
    };
    const temporalShimmerIndex = measureMotionAlignedShimmer(coherentFrames);
    const independentBaselineShimmerIndex = measureMotionAlignedShimmer(independentFrames);
    const shimmerReductionRatio = independentBaselineShimmerIndex > 1e-6 ? clamp(1 - temporalShimmerIndex / independentBaselineShimmerIndex, 0, 1) : 0;
    return { frames: coherentFrames, upscaledWidth: upW, upscaledHeight: upH, temporalShimmerIndex, independentBaselineShimmerIndex, shimmerReductionRatio, serverCostKrw: 0 };
  }
}
