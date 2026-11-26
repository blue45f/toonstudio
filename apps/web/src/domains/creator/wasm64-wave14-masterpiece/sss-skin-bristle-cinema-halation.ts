/**
 * 사전 적분 표면하 산란(Pre-Integrated SSS) 따뜻 피부톤·역광 셰이더 커널,
 * 탄성 다발 갈필(Dry-Brush)·획 끝 먹물 고임(Ink-Pooling) 물리 시뮬레이터,
 * 그리고 시네마 적색 유제층 할레이션·블룸·유기 입자 피니셔.
 *
 * - 그림자 경계선과 얇은 귀·손끝 실루엣에 혈류 기반 적색 확산광을 더해 차가운 회색 셀 질감을 없앤다.
 * - 고속·저잉크 구간의 강모 갈라짐(`갈필`)과 정지 구간의 모세관 테두리 농축(`먹물 고임`)을 재현한다.
 * - 고휘도 하이라이트 주변 적색 광학 할레이션과 휘도 마스킹 미세 입자로 클라이맥스 컷의 계조 밴딩을 제거한다.
 * - 외부 서버 비용 ₩0, 초기 번들 그래프 영향 0B(필요 시 지연 로드).
 */

export type RgbTuple = readonly [number, number, number];
export type SkinSssPresetKind = "warm-peach-toon" | "sunlit-amber" | "porcelain-cool-light";
export type NibBristlePresetKind = "oriental-fude-pen" | "split-g-pen" | "coarse-sumi-hake";

export const DEFAULT_SSS_LUT_SIZE = 32;
export const WASM64_WAVE14_RENDER_ALIGNMENT_BYTES = BigInt(64);

export interface SkinSssProfile {
  readonly kind: SkinSssPresetKind; readonly labelKo: string;
  /** R/G/B 파장별 가우시안 확산 표준편차(mm 단위 등가 스케일, 적색이 가장 넓음). */
  readonly diffusionSigmaRgb: RgbTuple;
  /** R/G/B 파장별 조직 소산 계수(1/mm, 적색이 가장 낮아 얇은 귀·손끝을 깊게 투과). */
  readonly extinctionPerMmRgb: RgbTuple;
  readonly terminatorWarmBoost: number; readonly backlightIntensity: number;
  readonly lateralDiffusionMix: number;
}

export const SKIN_SSS_PROFILES: Readonly<Record<SkinSssPresetKind, SkinSssProfile>> = Object.freeze({
  "warm-peach-toon": {
    kind: "warm-peach-toon", labelKo: "따뜻한 복숭아빛 셀·반실사 피부 산란",
    diffusionSigmaRgb: [0.46, 0.19, 0.1], extinctionPerMmRgb: [0.22, 0.68, 1.15],
    terminatorWarmBoost: 0.28, backlightIntensity: 0.65, lateralDiffusionMix: 0.24,
  },
  "sunlit-amber": {
    kind: "sunlit-amber", labelKo: "석양 역광 앰버 투과 피부 산란",
    diffusionSigmaRgb: [0.56, 0.22, 0.11], extinctionPerMmRgb: [0.18, 0.62, 1.22],
    terminatorWarmBoost: 0.36, backlightIntensity: 0.85, lateralDiffusionMix: 0.3,
  },
  "porcelain-cool-light": {
    kind: "porcelain-cool-light", labelKo: "맑은 실내광 도자기 피부 산란",
    diffusionSigmaRgb: [0.36, 0.17, 0.1], extinctionPerMmRgb: [0.26, 0.72, 1.18],
    terminatorWarmBoost: 0.2, backlightIntensity: 0.5, lateralDiffusionMix: 0.18,
  },
});

export interface PreIntegratedSkinLut {
  readonly size: number; readonly preset: SkinSssPresetKind;
  /** `[size * size * 3]` 인터리브드 선형 RGB 산란 조도 테이블 (`u = ndotl01`, `v = curvature01`). */
  readonly tableRgb: Float32Array; readonly slabByteFootprint: bigint;
}

export interface SkinSubsurfaceBufferInput {
  readonly width: number; readonly height: number;
  /** 픽셀당 sRGB `[0..1]` 알베도 (`width * height * 3`). */
  readonly albedoSrgb: Float32Array;
  /** 픽셀당 광원 내적 `N·L` (`[-1..1]`, `0` 부근이 그림자 경계 터미네이터). */
  readonly ndotlField: Float32Array;
  /** 픽셀당 실루엣 조직 두께 mm (`귀 1.5mm`, `손끝 3mm`, `볼·몸통 12mm+`). */
  readonly thicknessMmField: Float32Array;
  readonly backLightField?: Float32Array; readonly curvatureField?: Float32Array;
  readonly skinMaskField?: Float32Array;
  readonly keyLightColorLinear?: RgbTuple; readonly ambientShadowLinear?: RgbTuple;
  readonly preset?: SkinSssPresetKind; readonly precomputedLut?: PreIntegratedSkinLut;
}

export interface SkinSubsurfaceBufferResult {
  readonly width: number; readonly height: number;
  /** 산란·역광이 반영된 최종 sRGB `[0..1]` 픽셀 버퍼 (`width * height * 3`). */
  readonly shadedSrgb: Float32Array;
  /** 차가운 회색 셀 셰이딩 대비 그림자 경계 구간의 적-청 온기 상승량. */
  readonly terminatorWarmthGain: number;
  /** 얇은 부위(귀·손끝, 두께 <= 4mm) 역광 투과 적색 선형 휘도 피크. */
  readonly thinBacklightPeakRedLinear: number;
  readonly slabByteFootprint: bigint; readonly serverCostKrw: 0;
}

export interface BristleStrokeSample {
  readonly x: number; readonly y: number; readonly pressure01: number;
  readonly timestampMs: number; readonly tiltDeg?: number;
}

export interface SplitBristleSimulatorOptions {
  readonly preset?: NibBristlePresetKind; readonly bristleCount?: number;
  readonly baseRadiusPx?: number; readonly initialInkLoad01?: number;
  readonly inkDepletionPerPx?: number; readonly criticalSplitSpeedPxPerSec?: number;
  readonly paperRoughness01?: number; readonly poolingStrength?: number; readonly seed?: number;
}

export interface SplitBristleStrokeReport {
  readonly canvasWidth: number; readonly canvasHeight: number;
  /** 0(여백) ~ 1(진한 먹 농도) 2D 누적 잉크 밀도 그리드. */
  readonly inkDensityGrid: Float32Array;
  /** 고속·저잉크 구간에서 강모 사이가 갈라져 남은 흰 종이 결(`갈필`) 비율. */
  readonly dryBrushStreakVoidRatio: number;
  /** 스트로크 중 분리된 최대 유효 강모 클러스터 갈래 수. */
  readonly peakSplitClusterCount: number;
  /** 획 끝 정지 구간의 테두리 고리 농도 대 중심 농도 비율(`먹물 고임` 시 `> 1.0`). */
  readonly poolingRingToCenterRatio: number;
  readonly remainingMeanInk01: number; readonly slabByteFootprint: bigint;
  readonly serverCostKrw: 0;
}

export interface CinemaFinisherInput {
  readonly width: number; readonly height: number;
  /** 입력 sRGB `[0..1]` 이미지 버퍼 (`width * height * 3`). */
  readonly imageSrgb: Float32Array;
  readonly halationThreshold?: number; readonly halationSoftKnee?: number;
  readonly halationStrength?: number; readonly halationRadiusPx?: number;
  readonly bloomStrength?: number; readonly grainStrength?: number;
  readonly grainGamma?: number; readonly frameSeed?: number;
}

export interface CinemaFinisherResult {
  readonly width: number; readonly height: number;
  /** 할레이션·블룸·유기 입자가 적용된 최종 sRGB `[0..1]` 이미지 버퍼. */
  readonly finishedSrgb: Float32Array;
  /** 하이라이트 인접 할레이션 프린지의 적색 대 청색 부가 에너지 우세율. */
  readonly redHalationDominanceRatio: number;
  /** 8비트 양자화 기준 인접 픽셀 평탄 계단(밴딩) 감소 비율 (`0..1`). */
  readonly bandingStepReductionRatio: number;
  readonly highlightRollOffPeak: number; readonly slabByteFootprint: bigint;
  readonly serverCostKrw: 0;
}

export const WGSL_PREINTEGRATED_SKIN_SSS_SHADER = /* wgsl */ `
struct SkinSssParams {
  extinction_rgb: vec3<f32>, backlight_intensity: f32,
  warm_boost: f32, lut_size: u32, width: u32, height: u32,
};
@group(0) @binding(0) var<uniform> sss: SkinSssParams;
@group(0) @binding(1) var<storage, read> lut_rgb: array<f32>;

fn eval_backlight_translucency(thickness_mm: f32, back_dot: f32) -> vec3<f32> {
  let trans = exp(-sss.extinction_rgb * max(thickness_mm, 0.25));
  return trans * pow(clamp(back_dot, 0.0, 1.0), 1.6) * sss.backlight_intensity;
}
`;

export const WGSL_CINEMA_HALATION_GRAIN_SHADER = /* wgsl */ `
struct HalationGrainParams {
  width: u32, height: u32, threshold: f32, halation_strength: f32,
  bloom_strength: f32, grain_strength: f32, grain_gamma: f32, frame_seed: f32,
};
@group(0) @binding(0) var<uniform> post: HalationGrainParams;

fn luminance_bell_mask(luma: f32, gamma_val: f32) -> f32 {
  let g = pow(clamp(luma, 0.0, 1.0), gamma_val);
  return 4.0 * g * (1.0 - g);
}
`;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function fract(x: number): number {
  return x - Math.floor(x);
}

function alignBytes64(rawBytes: number): bigint {
  const n = BigInt(Math.max(0, Math.ceil(rawBytes)));
  const mask = WASM64_WAVE14_RENDER_ALIGNMENT_BYTES - BigInt(1);
  return (n + mask) & ~mask;
}

function srgbToLinear(c: number): number {
  const v = clamp(c, 0, 1);
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  const v = clamp(c, 0, 1);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

function softShoulderTonemap(linearVal: number): number {
  const x = Math.max(0, linearVal);
  if (x <= 0.72) return x;
  const excess = x - 0.72;
  return 0.72 + (0.28 * excess) / (excess + 0.28);
}

/**
 * Penner 사전 적분 피부 셰이딩 방정식에 따라 구면 조명 내적(`N·L`)과 곡률에 대한
 * 파장별(R/G/B) 가우시안 확산 적분 LUT를 생성한다.
 */
export function buildPreIntegratedSkinSssLut(
  preset: SkinSssPresetKind = "warm-peach-toon", lutSize = DEFAULT_SSS_LUT_SIZE,
): PreIntegratedSkinLut {
  const size = clamp(Math.round(lutSize), 8, 128);
  const profile = SKIN_SSS_PROFILES[preset];
  const tableRgb = new Float32Array(size * size * 3);
  const integrationSteps = 96;
  const dPhi = (2 * Math.PI) / integrationSteps;

  for (let vIdx = 0; vIdx < size; vIdx += 1) {
    const curvature01 = (vIdx + 0.5) / size;
    const arcScale = 1.65 - 1.25 * curvature01;

    for (let uIdx = 0; uIdx < size; uIdx += 1) {
      const cosTheta = clamp(((uIdx + 0.5) / size) * 2 - 1, -1, 1);
      const theta = Math.acos(cosTheta);
      let numR = 0; let numG = 0; let numB = 0;
      let denR = 0; let denG = 0; let denB = 0;

      for (let s = 0; s < integrationSteps; s += 1) {
        const phi = -Math.PI + (s + 0.5) * dPhi;
        const irradiance = Math.max(0, Math.cos(theta + phi));
        const chordDist = Math.max(1e-4, 2 * Math.sin(0.5 * Math.abs(phi)) * arcScale);

        const evalDiffusion = (sigma: number): number => {
          const s1 = Math.max(sigma * 0.55, 0.03);
          const s2 = Math.max(sigma * 1.45, 0.06);
          return 0.45 * Math.exp(-(chordDist * chordDist) / (2 * s1 * s1)) +
            0.55 * Math.exp(-(chordDist * chordDist) / (2 * s2 * s2));
        };

        const wR = evalDiffusion(profile.diffusionSigmaRgb[0]);
        const wG = evalDiffusion(profile.diffusionSigmaRgb[1]);
        const wB = evalDiffusion(profile.diffusionSigmaRgb[2]);
        numR += irradiance * wR; numG += irradiance * wG; numB += irradiance * wB;
        denR += wR; denG += wG; denB += wB;
      }

      const terminatorBell = Math.exp(-((cosTheta + 0.08) ** 2) / (2 * 0.28 * 0.28));
      const r = clamp(numR / Math.max(denR, 1e-6) + terminatorBell * profile.terminatorWarmBoost * (0.4 + 0.6 * curvature01), 0, 1);
      const g = clamp(numG / Math.max(denG, 1e-6) + terminatorBell * profile.terminatorWarmBoost * 0.14, 0, 1);
      const b = clamp(numB / Math.max(denB, 1e-6), 0, 1);

      const baseOffset = (vIdx * size + uIdx) * 3;
      tableRgb[baseOffset] = r;
      tableRgb[baseOffset + 1] = g;
      tableRgb[baseOffset + 2] = b;
    }
  }

  return { size, preset, tableRgb, slabByteFootprint: alignBytes64(tableRgb.byteLength) };
}

/** 사전 적분 피부 SSS LUT에서 `(ndotl, curvature01)`를 바이리니어 보간 조회한다. */
export function samplePreIntegratedSkinLut(lut: PreIntegratedSkinLut, ndotl: number, curvature01: number): RgbTuple {
  const s = lut.size;
  const u = clamp(0.5 * (ndotl + 1), 0, 1) * (s - 1);
  const v = clamp(curvature01, 0, 1) * (s - 1);
  const u0 = Math.floor(u);
  const v0 = Math.floor(v);
  const u1 = Math.min(u0 + 1, s - 1);
  const v1 = Math.min(v0 + 1, s - 1);
  const fu = u - u0;
  const fv = v - v0;

  const sampleChannel = (ch: 0 | 1 | 2): number => {
    const top = (lut.tableRgb[(v0 * s + u0) * 3 + ch] ?? 0) * (1 - fu) + (lut.tableRgb[(v0 * s + u1) * 3 + ch] ?? 0) * fu;
    const bot = (lut.tableRgb[(v1 * s + u0) * 3 + ch] ?? 0) * (1 - fu) + (lut.tableRgb[(v1 * s + u1) * 3 + ch] ?? 0) * fu;
    return top + (bot - top) * fv;
  };
  return [sampleChannel(0), sampleChannel(1), sampleChannel(2)];
}

function convolveSeparableGaussianChannel(
  src: Float32Array, width: number, height: number, sigmaPx: number,
): Float32Array {
  if (sigmaPx <= 0.15) return new Float32Array(src);
  const radius = clamp(Math.ceil(sigmaPx * 2.5), 1, 16);
  const weights = new Float64Array(radius * 2 + 1);
  let wSum = 0;
  for (let k = -radius; k <= radius; k += 1) {
    const w = Math.exp(-(k * k) / (2 * sigmaPx * sigmaPx));
    weights[k + radius] = w;
    wSum += w;
  }
  for (let i = 0; i < weights.length; i += 1) weights[i] = (weights[i] ?? 0) / wSum;

  const temp = new Float32Array(width * height);
  const dst = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      for (let k = -radius; k <= radius; k += 1) {
        acc += (src[row + clamp(x + k, 0, width - 1)] ?? 0) * (weights[k + radius] ?? 0);
      }
      temp[row + x] = acc;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let acc = 0;
      for (let k = -radius; k <= radius; k += 1) {
        acc += (temp[clamp(y + k, 0, height - 1) * width + x] ?? 0) * (weights[k + radius] ?? 0);
      }
      dst[y * width + x] = acc;
    }
  }
  return dst;
}

/**
 * 사전 적분 SSS 전면 확산 + 얇은 귀·손끝 Beer-Lambert 역광 투과 + 측면 적색 확산을 결합해
 * 캐릭터 피부 버퍼를 렌더링하고, 플라스틱 회색 셀 대비 터미네이터 온기 상승도를 산출한다.
 */
export function shadeSkinSubsurfaceBuffer(input: SkinSubsurfaceBufferInput): SkinSubsurfaceBufferResult {
  const width = Math.max(1, Math.floor(input.width));
  const height = Math.max(1, Math.floor(input.height));
  const pixelCount = width * height;
  const preset = input.preset ?? "warm-peach-toon";
  const profile = SKIN_SSS_PROFILES[preset];
  const lut = input.precomputedLut ?? buildPreIntegratedSkinSssLut(preset);

  const keyLight = input.keyLightColorLinear ?? [1.0, 0.97, 0.93];
  const ambient = input.ambientShadowLinear ?? [0.14, 0.14, 0.16];

  const linearR = new Float32Array(pixelCount);
  const linearG = new Float32Array(pixelCount);
  const linearB = new Float32Array(pixelCount);
  const redIrradiance = new Float32Array(pixelCount);

  let terminatorWarmthDeltaSum = 0;
  let terminatorSampleCount = 0;
  let thinBacklightPeakRedLinear = 0;

  for (let i = 0; i < pixelCount; i += 1) {
    const albR = srgbToLinear(input.albedoSrgb[i * 3] ?? 0.85);
    const albG = srgbToLinear(input.albedoSrgb[i * 3 + 1] ?? 0.72);
    const albB = srgbToLinear(input.albedoSrgb[i * 3 + 2] ?? 0.65);

    const ndotl = clamp(input.ndotlField[i] ?? 0, -1, 1);
    const thicknessMm = Math.max(0.25, input.thicknessMmField[i] ?? 10.0);
    const backDot = clamp(input.backLightField?.[i] ?? Math.max(0, -ndotl), 0, 1);
    const curvature = clamp(input.curvatureField?.[i] ?? 0.45, 0, 1);
    const skinMask = clamp(input.skinMaskField?.[i] ?? 1, 0, 1);

    const coldLambert = Math.max(0, ndotl);
    const coldR = albR * (ambient[0] + keyLight[0] * coldLambert);
    const coldG = albG * (ambient[1] + keyLight[1] * coldLambert);
    const coldB = albB * (ambient[2] + keyLight[2] * coldLambert);

    const sssIrr = samplePreIntegratedSkinLut(lut, ndotl, curvature);
    const backPhase = backDot ** 1.5 * profile.backlightIntensity;
    const backRadR = keyLight[0] * Math.exp(-profile.extinctionPerMmRgb[0] * thicknessMm) * backPhase;
    const backRadG = keyLight[1] * Math.exp(-profile.extinctionPerMmRgb[1] * thicknessMm) * backPhase * 0.65;
    const backRadB = keyLight[2] * Math.exp(-profile.extinctionPerMmRgb[2] * thicknessMm) * backPhase * 0.35;

    if (thicknessMm <= 4.0 && skinMask > 0.5 && backRadR > thinBacklightPeakRedLinear) {
      thinBacklightPeakRedLinear = backRadR;
    }

    const skinR = albR * (ambient[0] * 1.08 + keyLight[0] * sssIrr[0] + backRadR);
    const skinG = albG * (ambient[1] * 0.96 + keyLight[1] * sssIrr[1] + backRadG);
    const skinB = albB * (ambient[2] * 0.9 + keyLight[2] * sssIrr[2] + backRadB);

    linearR[i] = coldR * (1 - skinMask) + skinR * skinMask;
    linearG[i] = coldG * (1 - skinMask) + skinG * skinMask;
    linearB[i] = coldB * (1 - skinMask) + skinB * skinMask;
    redIrradiance[i] = linearR[i] ?? 0;

    if (skinMask > 0.5 && ndotl >= -0.35 && ndotl <= 0.2) {
      terminatorWarmthDeltaSum += ((linearR[i] ?? 0) - (linearB[i] ?? 0)) - (coldR - coldB);
      terminatorSampleCount += 1;
    }
  }

  const blurredRed = convolveSeparableGaussianChannel(redIrradiance, width, height, 1.6);
  const shadedSrgb = new Float32Array(pixelCount * 3);

  for (let i = 0; i < pixelCount; i += 1) {
    const latMix = profile.lateralDiffusionMix * clamp(input.skinMaskField?.[i] ?? 1, 0, 1);
    const finalLinR = (linearR[i] ?? 0) * (1 - latMix) + Math.max(linearR[i] ?? 0, blurredRed[i] ?? 0) * latMix;
    shadedSrgb[i * 3] = linearToSrgb(softShoulderTonemap(finalLinR));
    shadedSrgb[i * 3 + 1] = linearToSrgb(softShoulderTonemap(linearG[i] ?? 0));
    shadedSrgb[i * 3 + 2] = linearToSrgb(softShoulderTonemap(linearB[i] ?? 0));
  }

  return {
    width, height, shadedSrgb,
    terminatorWarmthGain: terminatorSampleCount > 0 ? terminatorWarmthDeltaSum / terminatorSampleCount : 0,
    thinBacklightPeakRedLinear, slabByteFootprint: alignBytes64(shadedSrgb.byteLength), serverCostKrw: 0,
  };
}

interface InternalBristleFiber {
  readonly baseOffsetNorm: number; readonly stiffness: number; readonly retentionBias: number;
  inkLoad01: number; lateralSplayPx: number;
}

function evaluatePaperFiberHeight(x: number, y: number, seed: number): number {
  const coarse = 0.5 + 0.25 * Math.sin(x * 0.43 + seed * 1.7) * Math.cos(y * 0.41 - seed * 0.9) +
    0.25 * Math.sin((x + y) * 0.29 + seed * 0.5);
  const fine = fract(Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453);
  return clamp(coarse * 0.55 + fine * 0.45, 0, 1);
}

/**
 * `N`개의 개별 탄성 강모·펜촉 갈래가 고속·저잉크 구간에서 벌어지며 남기는 갈필(`갈필`) 줄무늬와,
 * 획 정지·리프트 지점의 모세관 테두리 먹물 고임(`먹물 고임`)을 시뮬레이션한다.
 */
export class SplitBristleInkPoolingSimulator {
  private readonly bristleCount: number;
  private readonly baseRadiusPx: number;
  private readonly initialInkLoad01: number;
  private readonly inkDepletionPerPx: number;
  private readonly criticalSplitSpeedPxPerSec: number;
  private readonly paperRoughness01: number;
  private readonly poolingStrength: number;
  private readonly seed: number;
  private readonly isSplitNib: boolean;

  public constructor(options: SplitBristleSimulatorOptions = {}) {
    const preset = options.preset ?? "oriental-fude-pen";
    this.isSplitNib = preset === "split-g-pen";
    const defaultCount = preset === "coarse-sumi-hake" ? 32 : preset === "split-g-pen" ? 16 : 24;
    this.bristleCount = clamp(Math.round(options.bristleCount ?? defaultCount), 6, 96);
    this.baseRadiusPx = clamp(options.baseRadiusPx ?? 6.5, 1.5, 48.0);
    this.initialInkLoad01 = clamp(options.initialInkLoad01 ?? 0.85, 0.05, 1.0);
    this.inkDepletionPerPx = clamp(options.inkDepletionPerPx ?? 0.0032, 0.0001, 0.05);
    this.criticalSplitSpeedPxPerSec = clamp(options.criticalSplitSpeedPxPerSec ?? 420, 60, 4000);
    this.paperRoughness01 = clamp(options.paperRoughness01 ?? 0.48, 0.05, 0.95);
    this.poolingStrength = clamp(options.poolingStrength ?? 0.55, 0, 1.5);
    this.seed = options.seed ?? 19;
  }

  private createFreshBristleBundle(): InternalBristleFiber[] {
    const fibers: InternalBristleFiber[] = [];
    for (let i = 0; i < this.bristleCount; i += 1) {
      const u = this.bristleCount > 1 ? (i / (this.bristleCount - 1)) * 2 - 1 : 0;
      const jitter = (fract(Math.sin((i + 1) * 91.7 + this.seed) * 1973.3) - 0.5) * 0.08;
      const edgeFactor = Math.abs(u);
      fibers.push({
        baseOffsetNorm: clamp(u + jitter, -1, 1),
        stiffness: 0.55 + 0.45 * (1 - 0.5 * edgeFactor),
        retentionBias: 1 - 0.32 * edgeFactor,
        inkLoad01: clamp(this.initialInkLoad01 * (1 - 0.18 * edgeFactor), 0.04, 1.0),
        lateralSplayPx: 0,
      });
    }
    return fibers;
  }

  private depositCapillaryInkPool(
    grid: Float32Array, width: number, height: number,
    cx: number, cy: number, poolRadiusPx: number, poolAmount: number,
  ): { ringMean: number; centerMean: number } {
    const rOuter = Math.max(2.2, poolRadiusPx);
    const minX = Math.max(0, Math.floor(cx - rOuter - 1));
    const maxX = Math.min(width - 1, Math.ceil(cx + rOuter + 1));
    const minY = Math.max(0, Math.floor(cy - rOuter - 1));
    const maxY = Math.min(height - 1, Math.ceil(cy + rOuter + 1));

    let ringSum = 0; let ringCount = 0;
    let centerSum = 0; let centerCount = 0;

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const normR = Math.hypot(x - cx, y - cy) / rOuter;
        if (normR > 1.05) continue;
        const interiorBase = normR <= 1.0 ? 0.34 * (1 - 0.25 * normR * normR) : 0;
        const coffeeRingPeak = 0.88 * Math.exp(-((normR - 0.82) ** 2) / (2 * 0.12 * 0.12));
        const profile = (interiorBase + coffeeRingPeak) * poolAmount;

        const idx = y * width + x;
        const prev = grid[idx] ?? 0;
        const updated = clamp(1 - (1 - prev * 0.72) * Math.exp(-profile * 1.35), prev * 0.76, 1);
        grid[idx] = updated;

        if (normR <= 0.35) { centerSum += updated; centerCount += 1; }
        else if (normR >= 0.7 && normR <= 0.94) { ringSum += updated; ringCount += 1; }
      }
    }
    return {
      ringMean: ringCount > 0 ? ringSum / ringCount : 0,
      centerMean: centerCount > 0 ? centerSum / centerCount : 0,
    };
  }

  /** 스트로크 샘플 시퀀스를 2D 원고 그리드에 렌더링하고 갈필·먹물 고임 물리 지표를 반환한다. */
  public simulateStroke(
    samples: readonly BristleStrokeSample[], canvasWidth: number, canvasHeight: number,
  ): SplitBristleStrokeReport {
    const w = Math.max(8, Math.floor(canvasWidth));
    const h = Math.max(8, Math.floor(canvasHeight));
    const grid = new Float32Array(w * h);
    const fibers = this.createFreshBristleBundle();

    if (samples.length === 0) {
      return {
        canvasWidth: w, canvasHeight: h, inkDensityGrid: grid,
        dryBrushStreakVoidRatio: 0, peakSplitClusterCount: 1, poolingRingToCenterRatio: 1,
        remainingMeanInk01: this.initialInkLoad01, slabByteFootprint: alignBytes64(grid.byteLength),
        serverCostKrw: 0,
      };
    }

    let dryBrushTotalCrossSlots = 0;
    let dryBrushVoidSlots = 0;
    let peakSplitClusters = 1;
    let lastPoolMetrics = { ringMean: 0, centerMean: 0 };

    for (let sIdx = 0; sIdx < samples.length; sIdx += 1) {
      const curr = samples[sIdx]!;
      const prev = sIdx > 0 ? samples[sIdx - 1]! : curr;
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const segLen = Math.hypot(dx, dy);
      const dtSec = Math.max(1e-3, (curr.timestampMs - prev.timestampMs) / 1000);
      const speedPxPerSec = sIdx > 0 ? segLen / dtSec : 0;
      const pressure = clamp(curr.pressure01, 0.02, 1.0);

      const perpX = segLen > 1e-4 ? -dy / segLen : 0;
      const perpY = segLen > 1e-4 ? dx / segLen : 1;
      const subSteps = Math.max(1, Math.ceil(segLen * 1.5));
      const stepDist = segLen / subSteps;
      const speedRatio = clamp(speedPxPerSec / this.criticalSplitSpeedPxPerSec, 0, 2.2);

      for (let step = 0; step < subSteps; step += 1) {
        const t = subSteps > 1 ? (step + 1) / subSteps : 1;
        const cx = prev.x + dx * t;
        const cy = prev.y + dy * t;

        let meanInk = 0;
        for (let i = 0; i < fibers.length; i += 1) meanInk += fibers[i]!.inkLoad01;
        meanInk /= fibers.length;

        const cohesion = clamp(meanInk * (1 - 0.48 * speedRatio), 0.04, 1.0);
        const splaySpread = this.baseRadiusPx * (0.45 + 0.85 * pressure) * (1 + 0.75 * (1 - cohesion));
        const activePositions: number[] = [];
        const isDryRegime = speedRatio > 0.65 || meanInk < 0.48;

        for (let i = 0; i < fibers.length; i += 1) {
          const f = fibers[i]!;
          const splitSign = f.baseOffsetNorm >= 0 ? 1 : -1;
          const clusterQuant = this.isSplitNib
            ? splitSign * 0.65 * pressure * (1 - 0.4 * cohesion)
            : Math.round(f.baseOffsetNorm * 3) * 0.28 * (1 - cohesion);
          const targetLateral = (f.baseOffsetNorm + clusterQuant) * splaySpread;
          f.lateralSplayPx += (targetLateral - f.lateralSplayPx) * (0.35 + 0.4 * f.stiffness);

          const bx = cx + perpX * f.lateralSplayPx;
          const by = cy + perpY * f.lateralSplayPx;
          const paperHeight = evaluatePaperFiberHeight(bx, by, this.seed + (i % 5));
          const contactThreshold = this.paperRoughness01 * (0.35 + 0.55 * speedRatio) * (1.15 - 0.55 * pressure);
          const effectiveSupply = f.inkLoad01 * f.retentionBias + pressure * 0.28;

          if (isDryRegime) dryBrushTotalCrossSlots += 1;

          if (effectiveSupply > paperHeight * contactThreshold + 0.08) {
            activePositions.push(f.lateralSplayPx);
            const px = Math.round(bx);
            const py = Math.round(by);
            if (px >= 0 && px < w && py >= 0 && py < h) {
              const deposit = clamp(
                (0.28 + 0.62 * f.inkLoad01) * (0.45 + 0.55 * pressure) * (1 - 0.22 * speedRatio), 0.05, 0.92,
              );
              const gIdx = py * w + px;
              grid[gIdx] = clamp((grid[gIdx] ?? 0) + deposit * (1 - (grid[gIdx] ?? 0) * 0.65), 0, 1);
            }
            f.inkLoad01 = Math.max(0.02, f.inkLoad01 - stepDist * this.inkDepletionPerPx * (1.25 - 0.35 * f.retentionBias));
          } else if (isDryRegime) {
            dryBrushVoidSlots += 1;
          }
        }

        if (activePositions.length > 1) {
          activePositions.sort((a, b) => a - b);
          let clusters = 1;
          for (let k = 1; k < activePositions.length; k += 1) {
            if ((activePositions[k] ?? 0) - (activePositions[k - 1] ?? 0) > 1.35) clusters += 1;
          }
          if (clusters > peakSplitClusters) peakSplitClusters = clusters;
        }
      }

      const isStrokeStop = this.poolingStrength > 0 &&
        (sIdx === samples.length - 1 || (speedPxPerSec < 55 && dtSec >= 0.028));
      if (isStrokeStop) {
        let residualInk = 0;
        for (let i = 0; i < fibers.length; i += 1) residualInk += fibers[i]!.inkLoad01;
        residualInk /= fibers.length;
        const poolAmount = clamp(
          this.poolingStrength * (0.35 + 0.65 * residualInk) * clamp(dtSec / 0.045, 0.65, 2.0), 0.18, 1.25,
        );
        const poolRadius = Math.max(3.2, this.baseRadiusPx * (0.72 + 0.45 * pressure));
        lastPoolMetrics = this.depositCapillaryInkPool(grid, w, h, curr.x, curr.y, poolRadius, poolAmount);
      }
    }

    let remInk = 0;
    for (let i = 0; i < fibers.length; i += 1) remInk += fibers[i]!.inkLoad01;

    return {
      canvasWidth: w, canvasHeight: h, inkDensityGrid: grid,
      dryBrushStreakVoidRatio: dryBrushTotalCrossSlots > 0 ? dryBrushVoidSlots / dryBrushTotalCrossSlots : 0,
      peakSplitClusterCount: peakSplitClusters,
      poolingRingToCenterRatio: lastPoolMetrics.centerMean > 1e-5 ? lastPoolMetrics.ringMean / lastPoolMetrics.centerMean : 1.0,
      remainingMeanInk01: remInk / fibers.length,
      slabByteFootprint: alignBytes64(grid.byteLength), serverCostKrw: 0,
    };
  }
}

function evaluateSoftKneeHighlight(luminance: number, threshold: number, knee: number): number {
  const soft = clamp(knee, 1e-4, 1.0);
  const diff = luminance - threshold + soft;
  if (diff <= 0) return 0;
  return diff < 2 * soft ? (diff * diff) / (4 * soft) : luminance - threshold;
}

function measureQuantizedFlatRunRatio(srgbBuffer: Float32Array, width: number, height: number): number {
  if (width < 4) return 0;
  let gradientPairs = 0;
  let quantizedIdenticalPairs = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const i0 = (y * width + x) * 3;
      const l0 = 0.2126 * (srgbBuffer[i0] ?? 0) + 0.7152 * (srgbBuffer[i0 + 1] ?? 0) + 0.0722 * (srgbBuffer[i0 + 2] ?? 0);
      const l1 = 0.2126 * (srgbBuffer[i0 + 3] ?? 0) + 0.7152 * (srgbBuffer[i0 + 4] ?? 0) + 0.0722 * (srgbBuffer[i0 + 5] ?? 0);
      if (l0 > 0.06 && l0 < 0.88 && Math.abs(l1 - l0) < 0.025) {
        gradientPairs += 1;
        if (Math.round(l0 * 255) === Math.round(l1 * 255)) quantizedIdenticalPairs += 1;
      }
    }
  }
  return gradientPairs > 0 ? quantizedIdenticalPairs / gradientPairs : 0;
}

/**
 * 아날로그 시네마 필름의 적색 유제층 역반사 할레이션, 소프트 블룸,
 * 그리고 중저휘도 대역 마스킹 미세 유기 입자를 결합해 클라이맥스 원고를 마감한다.
 */
export function applyCinemaHalationBloomGrain(input: CinemaFinisherInput): CinemaFinisherResult {
  const width = Math.max(1, Math.floor(input.width));
  const height = Math.max(1, Math.floor(input.height));
  const pixelCount = width * height;

  const threshold = clamp(input.halationThreshold ?? 0.68, 0.25, 0.96);
  const softKnee = clamp(input.halationSoftKnee ?? 0.14, 0.01, 0.45);
  const halationStrength = clamp(input.halationStrength ?? 0.52, 0, 2.0);
  const halationRadiusPx = clamp(input.halationRadiusPx ?? 4.2, 0.8, 16.0);
  const bloomStrength = clamp(input.bloomStrength ?? 0.22, 0, 1.5);
  const grainStrength = clamp(input.grainStrength ?? 0.028, 0, 0.18);
  const grainGamma = clamp(input.grainGamma ?? 0.85, 0.35, 2.2);
  const seed = input.frameSeed ?? 14;

  const linR = new Float32Array(pixelCount);
  const linG = new Float32Array(pixelCount);
  const linB = new Float32Array(pixelCount);
  const hiEnergy = new Float32Array(pixelCount);
  const isHighlightSource = new Uint8Array(pixelCount);

  for (let i = 0; i < pixelCount; i += 1) {
    const r = srgbToLinear(input.imageSrgb[i * 3] ?? 0);
    const g = srgbToLinear(input.imageSrgb[i * 3 + 1] ?? 0);
    const b = srgbToLinear(input.imageSrgb[i * 3 + 2] ?? 0);
    linR[i] = r; linG[i] = g; linB[i] = b;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    hiEnergy[i] = evaluateSoftKneeHighlight(luma, threshold, softKnee);
    if (luma >= threshold) isHighlightSource[i] = 1;
  }

  const halationRedSpread = convolveSeparableGaussianChannel(hiEnergy, width, height, halationRadiusPx);
  const halationGreenSpread = convolveSeparableGaussianChannel(hiEnergy, width, height, halationRadiusPx * 0.42);
  const wideBloom = convolveSeparableGaussianChannel(hiEnergy, width, height, halationRadiusPx * 1.65);

  const rawGrain = new Float32Array(pixelCount);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const n1 = fract(Math.sin((x + seed * 17) * 12.9898 + (y + seed * 31) * 78.233) * 43758.5453);
      const n2 = fract(Math.sin((x * 0.5 + 11.3) * 39.346 + (y * 0.5 + 7.1) * 11.135) * 96321.17);
      rawGrain[y * width + x] = (n1 + n2) - 1.0;
    }
  }
  const softGrain = convolveSeparableGaussianChannel(rawGrain, width, height, 0.75);

  const finishedSrgb = new Float32Array(pixelCount * 3);
  let fringeAddedRed = 0;
  let fringeAddedBlue = 0;
  let highlightRollOffPeak = 0;

  for (let i = 0; i < pixelCount; i += 1) {
    const halR = (halationRedSpread[i] ?? 0) * halationStrength * 1.15;
    const halG = (halationGreenSpread[i] ?? 0) * halationStrength * 0.28;
    const halB = (halationGreenSpread[i] ?? 0) * halationStrength * 0.05;
    const bloomVal = (wideBloom[i] ?? 0) * bloomStrength;

    if (isHighlightSource[i] === 0 && (halationRedSpread[i] ?? 0) > 1e-3) {
      fringeAddedRed += halR + bloomVal * 0.15;
      fringeAddedBlue += halB + bloomVal * 0.15;
    }

    const mappedR = softShoulderTonemap((linR[i] ?? 0) + halR + bloomVal);
    const mappedG = softShoulderTonemap((linG[i] ?? 0) + halG + bloomVal * 0.96);
    const mappedB = softShoulderTonemap((linB[i] ?? 0) + halB + bloomVal * 0.92);

    const postLuma = 0.2126 * mappedR + 0.7152 * mappedG + 0.0722 * mappedB;
    if (postLuma > highlightRollOffPeak) highlightRollOffPeak = postLuma;

    const lumaGamma = clamp(postLuma, 0, 1) ** grainGamma;
    const bellMask = 4.0 * lumaGamma * (1.0 - lumaGamma);
    const organicNoise = (0.62 * (rawGrain[i] ?? 0) + 0.38 * (softGrain[i] ?? 0)) * grainStrength * bellMask;

    finishedSrgb[i * 3] = linearToSrgb(clamp(mappedR + organicNoise * 1.04, 0, 1));
    finishedSrgb[i * 3 + 1] = linearToSrgb(clamp(mappedG + organicNoise, 0, 1));
    finishedSrgb[i * 3 + 2] = linearToSrgb(clamp(mappedB + organicNoise * 0.95, 0, 1));
  }

  const beforeFlatRatio = measureQuantizedFlatRunRatio(input.imageSrgb, width, height);
  const afterFlatRatio = measureQuantizedFlatRunRatio(finishedSrgb, width, height);
  const bandingStepReductionRatio = beforeFlatRatio > 1e-6 ? clamp(1 - afterFlatRatio / beforeFlatRatio, 0, 1) : 0;

  return {
    width, height, finishedSrgb,
    redHalationDominanceRatio: fringeAddedBlue > 1e-6 ? fringeAddedRed / fringeAddedBlue : fringeAddedRed > 0 ? 10.0 : 1.0,
    bandingStepReductionRatio, highlightRollOffPeak,
    slabByteFootprint: alignBytes64(finishedSrgb.byteLength), serverCostKrw: 0,
  };
}
