/**
 * Wave 53A — 크레용·연필·목탄·갈필 극한 시각·청각(Foley) 물리 엔진.
 *
 * - 6종 건식·갈필 매체 프리셋(왁스 크레용·오일 파스텔·4B 연필·목탄 스틱·갈필 먹붓·유성 색연필)
 * - 4종 이중 스케일(Macro Fiber + Micro Tooth) 256×256 종이 요철 LUT(황목·켄트지·한지·크로키북)
 * - 4대 시각 리얼리즘 수학 모델: 종이 산/골, 기울기 2.8× 광폭 셰이딩 + 갈필 3~18가닥,
 *   다중 패스 왁스 버니싱·크럼블 비산, 120Hz(< 0.35ms) 1샘플+smoothstep 3명령 GPU 비용 모델
 * - Web Audio 절차적 Foley 합성 모델 + -24 LUFS 청각 피로 방지 리미터
 * - 비파괴 프리셋 적용·원복 상태 머신 + 셰이더/오디오 레시피 JSON 내보내기
 */

export const DUAL_SCALE_GRAIN_TILE_SIZE = 256 as const;
export const FRAME_BUDGET_120HZ_MS = 8.33 as const;
export const EXTRA_GPU_BUDGET_MS = 0.35 as const;
export const SHADER_THRESHOLD_INSTRUCTIONS = 3 as const;
export const FOLEY_LIMITER_CEILING_LUFS = -24 as const;
export const TILT_BROADSIDE_THRESHOLD_DEG = 35 as const;
export const TILT_MIN_DEG = 15 as const;
export const TILT_MAX_DEG = 90 as const;
export const MAX_TILT_WIDTH_MULTIPLIER = 2.8 as const;
export const MIN_SUMI_BRISTLE_STRANDS = 3 as const;
export const MAX_SUMI_BRISTLE_STRANDS = 18 as const;
export const MIN_OVERLAP_PASSES = 1 as const;
export const MAX_OVERLAP_PASSES = 4 as const;
export const VIOLET_SLOP_MIN_HUE = 270 as const;
export const VIOLET_SLOP_MAX_HUE = 320 as const;

export type DryMediaBrushId =
  | "wax-crayon" | "oil-pastel" | "graphite-4b"
  | "charcoal-stick" | "dry-sumi-bristle" | "colored-pencil-prism";
export type DryMediaPaperId = "rough-cold-press" | "kent-smooth" | "hanji-mulberry" | "croquis-tooth";
export type DryMediaAcousticFamily = "wax-drag" | "graphite-scratch" | "charcoal-grit" | "sumi-whisper";
export type CrumbParticleKind = "wax-crumb" | "graphite-speck" | "charcoal-dust" | "ink-flick";
export type DryMediaSessionStatus = "clean" | "previewing" | "applied" | "reverted";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export interface DryMediaPaperSubstrate {
  readonly id: DryMediaPaperId; readonly nameKo: string; readonly nameEn: string;
  readonly grainTagKo: string; readonly grainTagEn: string;
  readonly descriptionKo: string; readonly descriptionEn: string;
  readonly paperToothPitchPx: number; readonly macroFiberWeight: number; readonly microToothWeight: number;
  readonly fiberAnisotropy: number; readonly valleyDepth: number; readonly acousticBrightness: number;
  readonly surfaceOklch: OklchColor; readonly valleyOklch: OklchColor;
}
export interface DualScalePaperGrainLut {
  readonly paperId: DryMediaPaperId; readonly size: typeof DUAL_SCALE_GRAIN_TILE_SIZE;
  readonly macroFiber: Float32Array; readonly microTooth: Float32Array; readonly combinedHeight: Float32Array;
  readonly peakMean: number; readonly peakStdDev: number; readonly valleyDepthRatio: number; readonly gpuTileRg8Bytes: number;
}
export interface DualScaleGrainSample { readonly macroFiber: number; readonly microTooth: number; readonly combinedHeight: number; }
export interface DryMediaBrushPreset {
  readonly id: DryMediaBrushId; readonly acousticFamily: DryMediaAcousticFamily; readonly crumbKind: CrumbParticleKind;
  readonly nameKo: string; readonly nameEn: string; readonly tagKo: string; readonly tagEn: string;
  readonly summaryKo: string; readonly summaryEn: string; readonly recommendedPaperId: DryMediaPaperId;
  readonly pigmentNameKo: string; readonly pigmentNameEn: string; readonly pigmentOklch: OklchColor;
  readonly baseWidthPx: number; readonly waxViscosity: number; readonly burnishRate: number;
  readonly opacityCeiling: number; readonly smudgeCarry: number; readonly waxBloomFactor: number;
  readonly glazeBuildRate: number; readonly crumbScatterDensity: number; readonly tiltExpansionGain: number;
  readonly granulationGain: number; readonly bristleMinStrands: number; readonly bristleMaxStrands: number;
  readonly defaultPressure: number; readonly defaultTiltDeg: number;
  readonly defaultSpeedPxPerSec: number; readonly defaultOverlapPasses: number;
  readonly foleyBandHz: readonly [number, number]; readonly foleyBaseQ: number;
}
export interface DryMediaStrokeInput {
  readonly brushId: DryMediaBrushId; readonly paperId: DryMediaPaperId;
  readonly pressure: number; readonly tiltDeg: number; readonly speedPxPerSec: number; readonly overlapPasses: number;
  readonly grainIntensity?: number; readonly crumbIntensity?: number; readonly lut?: DualScalePaperGrainLut;
}
export interface CrossSectionMicroPoint {
  readonly u: number; readonly macroHeight: number; readonly microHeight: number;
  readonly combinedHeight: number; readonly pigmentHeight: number; readonly valleyExposed: boolean;
}
export interface DualScaleToothMetrics {
  readonly toothThreshold: number; readonly smoothstepEdgeLow: number; readonly smoothstepEdgeHigh: number;
  readonly macroFiberContribution: number; readonly microToothContribution: number;
  readonly peakDepositRatio: number; readonly sparkleValleyExposure: number; readonly crossSection: readonly CrossSectionMicroPoint[];
}
export interface SumiBristleStrand {
  readonly index: number; readonly lateralOffsetNorm: number; readonly widthWeight: number;
  readonly inkContinuity: number; readonly breakPhase: number;
}
export interface SumiBristleMetrics {
  readonly active: boolean; readonly strandCount: number; readonly highSpeedSkipRatio: number;
  readonly strands: readonly SumiBristleStrand[];
}
export interface TiltShadingMetrics {
  readonly tiltDeg: number; readonly isBroadSideActive: boolean;
  readonly contactWidthMultiplier: number; readonly effectiveContactWidthPx: number;
  readonly granulationContrast: number; readonly sumiBristle: SumiBristleMetrics;
}
export interface DryMediaCrumbParticle {
  readonly id: number; readonly alongT: number; readonly lateralOffsetNorm: number;
  readonly radiusPx: number; readonly opacity: number; readonly kind: CrumbParticleKind;
}
export interface BurnishAndCrumbMetrics {
  readonly overlapPasses: number; readonly valleyFillRatio: number; readonly smudgeBlendRatio: number;
  readonly waxBloomRatio: number; readonly glazeOpacity: number;
  readonly crumbCount: number; readonly crumbParticles: readonly DryMediaCrumbParticle[];
}
export interface DryMediaGpuBudget120Hz {
  readonly targetRefreshHz: 120; readonly frameBudgetMs: typeof FRAME_BUDGET_120HZ_MS;
  readonly tileResolutionPx: typeof DUAL_SCALE_GRAIN_TILE_SIZE; readonly textureSamplesPerFragment: 1;
  readonly shaderThresholdInstructionCount: typeof SHADER_THRESHOLD_INSTRUCTIONS;
  readonly lutFetchMs: number; readonly smoothstepThresholdMs: number; readonly crumbCompositeMs: number;
  readonly additionalGpuCostMs: number; readonly withinExtraGpuBudget: boolean;
  readonly baseStrokeRenderMs: number; readonly totalEstimatedFrameMs: number; readonly within120HzBudget: boolean;
  readonly costModelSource: "deterministic-analytical-model";
  readonly costModelNoteKo: string; readonly costModelNoteEn: string; readonly wgslSnippet: string;
}
export interface DryMediaMicrostructureResult {
  readonly brushId: DryMediaBrushId; readonly paperId: DryMediaPaperId;
  readonly pressure: number; readonly tiltDeg: number; readonly speedPxPerSec: number;
  readonly overlapPasses: number; readonly grainIntensity: number; readonly crumbIntensity: number;
  readonly dualScaleTooth: DualScaleToothMetrics; readonly tiltShading: TiltShadingMetrics;
  readonly burnishAndCrumb: BurnishAndCrumbMetrics; readonly gpuBudget120Hz: DryMediaGpuBudget120Hz;
  readonly flatAlphaBaselineScore: number; readonly dryMediaRealismScore: number;
}
export interface DryMediaFoleyInput {
  readonly brushId: DryMediaBrushId; readonly paperId: DryMediaPaperId;
  readonly pressure: number; readonly tiltDeg: number; readonly speedPxPerSec: number;
  readonly overlapPasses: number; readonly volume: number; readonly muted: boolean;
}
export interface FoleySpectrumBand { readonly hz: number; readonly label: string; readonly magnitude: number; }
export interface FoleySafetyLimiterState {
  readonly ceilingLufs: typeof FOLEY_LIMITER_CEILING_LUFS; readonly preLimiterLufs: number;
  readonly estimatedOutputLufs: number; readonly gainReductionDb: number; readonly fatigueGuardActive: boolean;
}
export interface WebAudioFoleyNodeSpec {
  readonly nodeChain: readonly string[];
  readonly noiseColor: "brown-wax" | "pink-grit" | "white-micro" | "filtered-silk";
  readonly toothLfoHz: number; readonly primaryFilterType: "bandpass";
  readonly primaryFrequencyHz: number; readonly primaryQ: number;
  readonly secondaryFilterType: "lowshelf" | "highpass" | "peaking";
  readonly secondaryFrequencyHz: number; readonly secondaryGainDb: number;
  readonly pressureGain: number; readonly compressorThresholdDb: number; readonly compressorKneeDb: number;
  readonly compressorRatio: number; readonly compressorAttackSec: number; readonly compressorReleaseSec: number;
  readonly masterOutputGain: number;
}
export interface DryMediaFoleyFrame {
  readonly brushId: DryMediaBrushId; readonly paperId: DryMediaPaperId;
  readonly acousticFamily: DryMediaAcousticFamily; readonly muted: boolean; readonly volume: number;
  readonly paperToothPitchPx: number; readonly toothCrossingHz: number;
  readonly primaryResonanceHz: number; readonly primaryQ: number; readonly lowFrictionRumbleGain: number;
  readonly highScratchBurstRateHz: number; readonly transientAttackMs: number;
  readonly velocityNoiseGain: number; readonly effectiveGain: number;
  readonly safetyLimiter: FoleySafetyLimiterState; readonly audioGraph: WebAudioFoleyNodeSpec;
  readonly spectrumBands: readonly FoleySpectrumBand[]; readonly waveformSamples: readonly number[];
  readonly acousticSummaryKo: string; readonly acousticSummaryEn: string;
}
export interface DryMediaLabConfig {
  readonly brushId: DryMediaBrushId; readonly paperId: DryMediaPaperId;
  readonly pressure: number; readonly tiltDeg: number; readonly speedPxPerSec: number;
  readonly overlapPasses: number; readonly grainIntensity: number; readonly crumbIntensity: number;
  readonly foleyVolume: number; readonly foleyMuted: boolean;
}
export type DryMediaLabConfigPatch = Partial<DryMediaLabConfig>;
export interface DryMediaLabSession {
  readonly committed: DryMediaLabConfig; readonly preview: DryMediaLabConfig | null;
  readonly history: readonly DryMediaLabConfig[]; readonly status: DryMediaSessionStatus;
  readonly appliedCount: number; readonly canApply: boolean; readonly canRevert: boolean;
}
export interface FoleyPreviewPlayResult {
  readonly played: boolean;
  readonly reason: "played" | "muted" | "unsupported-audio-context" | "audio-context-error";
  readonly durationMs: number;
}

function clamp(v: number, min: number, max: number): number { return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min; }
function roundTo(v: number, digits: number): number { if (!Number.isFinite(v)) return 0; const f = 10 ** digits; return Math.round(v * f) / f; }
function smoothstep(e0: number, e1: number, x: number): number { const t = clamp((x - e0) / Math.max(0.0001, e1 - e0), 0, 1); return t * t * (3 - 2 * t); }
function normalizeHue(hue: number): number { if (!Number.isFinite(hue)) return 215; const m = hue % 360; return m < 0 ? m + 360 : m; }
function hashUnit(seed: number, x: number, y: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** 270~320° 바이올렛 슬롭 구간 여부를 판정한다. */
export function isVioletSlopHue(hue: number): boolean {
  if (!Number.isFinite(hue)) return false;
  const h = normalizeHue(hue);
  return h >= VIOLET_SLOP_MIN_HUE && h <= VIOLET_SLOP_MAX_HUE;
}

/** 바이올렛 구간(270~320°)이 들어오면 안전 안료 휴(244° 코발트 / 344° 카민)로 치환한다. */
export function sanitizeNonVioletHue(hue: number): number {
  const h = normalizeHue(hue);
  return !isVioletSlopHue(h) ? roundTo(h, 1) : h < 295 ? 244 : 344;
}

/** OKLCH 색상을 CSS `oklch(...)` 문자열로 포맷한다(원시 색·바이올렛 휴 차단). */
export function formatOklch(color: OklchColor, alpha?: number): string {
  const l = roundTo(clamp(color.l, 0, 1), 3);
  const c = roundTo(clamp(color.c, 0, 0.37), 3);
  const h = sanitizeNonVioletHue(color.h);
  return alpha !== undefined ? `oklch(${l} ${c} ${h} / ${roundTo(clamp(alpha, 0, 1), 3)})` : `oklch(${l} ${c} ${h})`;
}

/** 4종 이중 스케일 종이 기판 프리셋(거친 황목·켄트지·한지·크로키북). */
export const DRYMEDIA_PAPER_SUBSTRATES: readonly [DryMediaPaperSubstrate, ...DryMediaPaperSubstrate[]] = [
  {
    id: "rough-cold-press", nameKo: "거친 황목", nameEn: "Rough Cold-Press",
    grainTagKo: "깊은 산/골 · 피치 7.4px", grainTagEn: "Deep Peaks · 7.4px Pitch",
    descriptionKo: "굵은 코튼 섬유 골짜기가 선명해 크레용·목탄의 하얀 빈틈 질감을 살립니다.",
    descriptionEn: "Pronounced cotton valleys preserve crisp white paper tooth breaks for crayon and charcoal.",
    paperToothPitchPx: 7.4, macroFiberWeight: 0.62, microToothWeight: 0.38, fiberAnisotropy: 1.15, valleyDepth: 0.88, acousticBrightness: 0.72,
    surfaceOklch: { l: 0.955, c: 0.012, h: 88 }, valleyOklch: { l: 0.84, c: 0.018, h: 82 },
  },
  {
    id: "kent-smooth", nameKo: "켄트지", nameEn: "Smooth Kent Board",
    grainTagKo: "미세 세목 · 피치 2.6px", grainTagEn: "Fine Tooth · 2.6px Pitch",
    descriptionKo: "촘촘한 미세 돌기로 유성 색연필 다층 글레이징과 정밀 흑연 선화에 맞습니다.",
    descriptionEn: "Tight micro-tooth surface tailored for multi-pass colored pencil glazing and sharp graphite lines.",
    paperToothPitchPx: 2.6, macroFiberWeight: 0.28, microToothWeight: 0.72, fiberAnisotropy: 1.02, valleyDepth: 0.36, acousticBrightness: 0.94,
    surfaceOklch: { l: 0.972, c: 0.004, h: 96 }, valleyOklch: { l: 0.905, c: 0.008, h: 92 },
  },
  {
    id: "hanji-mulberry", nameKo: "한지 닥섬유", nameEn: "Mulberry Hanji",
    grainTagKo: "장섬유 방향결 · 피치 5.2px", grainTagEn: "Long Fiber · 5.2px Pitch",
    descriptionKo: "가로 방향 닥섬유 줄기가 갈필 먹붓의 고속 끊김과 사각거림을 살립니다.",
    descriptionEn: "Directional mulberry fibers accentuate dry sumi bristle splits and crisp brush whisper.",
    paperToothPitchPx: 5.2, macroFiberWeight: 0.58, microToothWeight: 0.42, fiberAnisotropy: 2.35, valleyDepth: 0.66, acousticBrightness: 0.84,
    surfaceOklch: { l: 0.946, c: 0.015, h: 86 }, valleyOklch: { l: 0.858, c: 0.022, h: 80 },
  },
  {
    id: "croquis-tooth", nameKo: "크로키북", nameEn: "Croquis Sketch Paper",
    grainTagKo: "중목 탄력결 · 피치 4.1px", grainTagEn: "Medium Bite · 4.1px Pitch",
    descriptionKo: "4B 연필 눕혀 칠하기와 빠른 드로잉에서 경쾌한 그래뉼레이션과 긁힘음을 냅니다.",
    descriptionEn: "Responsive medium sketch tooth ideal for broadside 4B shading and brisk pencil sweeps.",
    paperToothPitchPx: 4.1, macroFiberWeight: 0.46, microToothWeight: 0.54, fiberAnisotropy: 1.24, valleyDepth: 0.58, acousticBrightness: 0.88,
    surfaceOklch: { l: 0.958, c: 0.014, h: 90 }, valleyOklch: { l: 0.872, c: 0.019, h: 84 },
  },
] as const;

/** 6종 극한 건식·갈필 매체 프리셋. */
export const DRYMEDIA_BRUSH_PRESETS: readonly [DryMediaBrushPreset, ...DryMediaBrushPreset[]] = [
  {
    id: "wax-crayon", acousticFamily: "wax-drag", crumbKind: "wax-crumb",
    nameKo: "왁스 크레용", nameEn: "Wax Crayon", tagKo: "왁스 덩어리 · 봉우리 압착", tagEn: "Wax Clump · Peak Press",
    summaryKo: "굵은 왁스 덩어리가 종이 봉우리에 먼저 압착되고 획 경계에 미세 왁스 부스러기가 흩어집니다.",
    summaryEn: "Chunky wax grips paper peaks first while leaving deterministic wax crumbs along stroke borders.",
    recommendedPaperId: "rough-cold-press", pigmentNameKo: "버밀리온 크레용", pigmentNameEn: "Vermilion Crayon",
    pigmentOklch: { l: 0.55, c: 0.175, h: 28 }, baseWidthPx: 26, waxViscosity: 0.86, burnishRate: 0.78,
    opacityCeiling: 0.93, smudgeCarry: 0.42, waxBloomFactor: 0.34, glazeBuildRate: 0.68, crumbScatterDensity: 0.82,
    tiltExpansionGain: 0.88, granulationGain: 0.86, bristleMinStrands: 1, bristleMaxStrands: 1,
    defaultPressure: 0.46, defaultTiltDeg: 32, defaultSpeedPxPerSec: 460, defaultOverlapPasses: 1, foleyBandHz: [180, 520], foleyBaseQ: 5.4,
  },
  {
    id: "oil-pastel", acousticFamily: "wax-drag", crumbKind: "wax-crumb",
    nameKo: "오일 파스텔", nameEn: "Oil Pastel", tagKo: "진득한 버니싱 · 겹칠 스머지", tagEn: "Rich Burnish · Smudge",
    summaryKo: "높은 안료 불투명도로 겹칠할수록 골짜기를 진득하게 메우며 버터처럼 밀립니다.",
    summaryEn: "High-opacity oily pigment burnishes paper valleys smoothly and carries dense smudge across passes.",
    recommendedPaperId: "rough-cold-press", pigmentNameKo: "코발트 프러시안", pigmentNameEn: "Prussian Cobalt",
    pigmentOklch: { l: 0.44, c: 0.145, h: 222 }, baseWidthPx: 30, waxViscosity: 0.96, burnishRate: 0.94,
    opacityCeiling: 0.98, smudgeCarry: 0.92, waxBloomFactor: 0.24, glazeBuildRate: 0.94, crumbScatterDensity: 0.68,
    tiltExpansionGain: 0.82, granulationGain: 0.74, bristleMinStrands: 1, bristleMaxStrands: 1,
    defaultPressure: 0.62, defaultTiltDeg: 40, defaultSpeedPxPerSec: 340, defaultOverlapPasses: 2, foleyBandHz: [180, 440], foleyBaseQ: 6.2,
  },
  {
    id: "graphite-4b", acousticFamily: "graphite-scratch", crumbKind: "graphite-speck",
    nameKo: "4B 흑연 연필", nameEn: "4B Graphite Pencil", tagKo: "미세 그래뉼 · 기울기 2.8×", tagEn: "Fine Granulation · 2.8× Tilt",
    summaryKo: "펜을 눕히면 접촉 폭이 최대 2.8배 넓어지고 미세 종이 돌기마다 흑연 입자가 촘촘히 걸립니다.",
    summaryEn: "Tilting broadside expands contact width up to 2.8× with crisp graphite granulation across paper peaks.",
    recommendedPaperId: "croquis-tooth", pigmentNameKo: "4B 소프트 흑연", pigmentNameEn: "4B Soft Graphite",
    pigmentOklch: { l: 0.25, c: 0.012, h: 235 }, baseWidthPx: 14, waxViscosity: 0.22, burnishRate: 0.52,
    opacityCeiling: 0.89, smudgeCarry: 0.56, waxBloomFactor: 0.1, glazeBuildRate: 0.64, crumbScatterDensity: 0.34,
    tiltExpansionGain: 1.0, granulationGain: 0.96, bristleMinStrands: 1, bristleMaxStrands: 1,
    defaultPressure: 0.38, defaultTiltDeg: 26, defaultSpeedPxPerSec: 680, defaultOverlapPasses: 1, foleyBandHz: [2200, 6800], foleyBaseQ: 3.1,
  },
  {
    id: "charcoal-stick", acousticFamily: "charcoal-grit", crumbKind: "charcoal-dust",
    nameKo: "목탄 스틱", nameEn: "Charcoal Stick", tagKo: "거친 섬유 입자 · 가루 비산", tagEn: "Coarse Grit · Dust Scatter",
    summaryKo: "거친 탄소 입자가 종이 골짜기 경계에 강하게 긁히고 가장자리로 목탄 가루가 멀리 흩어집니다.",
    summaryEn: "Coarse carbon particles grab deep fiber ridges while scattering dry charcoal dust off the stroke edge.",
    recommendedPaperId: "rough-cold-press", pigmentNameKo: "버드나무 목탄", pigmentNameEn: "Willow Charcoal",
    pigmentOklch: { l: 0.17, c: 0.009, h: 65 }, baseWidthPx: 24, waxViscosity: 0.14, burnishRate: 0.46,
    opacityCeiling: 0.94, smudgeCarry: 0.84, waxBloomFactor: 0.06, glazeBuildRate: 0.58, crumbScatterDensity: 0.98,
    tiltExpansionGain: 0.96, granulationGain: 0.98, bristleMinStrands: 1, bristleMaxStrands: 1,
    defaultPressure: 0.42, defaultTiltDeg: 28, defaultSpeedPxPerSec: 590, defaultOverlapPasses: 1, foleyBandHz: [760, 2200], foleyBaseQ: 2.4,
  },
  {
    id: "dry-sumi-bristle", acousticFamily: "sumi-whisper", crumbKind: "ink-flick",
    nameKo: "갈필 먹붓", nameEn: "Dry Sumi Bristle", tagKo: "3~18가닥 분기 · 고속 결 끊김", tagEn: "3–18 Strands · Speed Breakup",
    summaryKo: "3~18가닥 모발이 필압과 속도에 맞춰 갈라지고 고속 주행 시 한지 결 위에서 백색 비백이 터집니다.",
    summaryEn: "Splits into 3 to 18 bristle strands with velocity-driven paper grain skips across mulberry fibers.",
    recommendedPaperId: "hanji-mulberry", pigmentNameKo: "송연 갈필 먹", pigmentNameEn: "Pine-Soot Sumi",
    pigmentOklch: { l: 0.19, c: 0.015, h: 215 }, baseWidthPx: 28, waxViscosity: 0.08, burnishRate: 0.28,
    opacityCeiling: 0.92, smudgeCarry: 0.18, waxBloomFactor: 0.0, glazeBuildRate: 0.48, crumbScatterDensity: 0.46,
    tiltExpansionGain: 0.92, granulationGain: 0.88, bristleMinStrands: MIN_SUMI_BRISTLE_STRANDS, bristleMaxStrands: MAX_SUMI_BRISTLE_STRANDS,
    defaultPressure: 0.44, defaultTiltDeg: 34, defaultSpeedPxPerSec: 1280, defaultOverlapPasses: 1, foleyBandHz: [900, 3200], foleyBaseQ: 2.1,
  },
  {
    id: "colored-pencil-prism", acousticFamily: "graphite-scratch", crumbKind: "wax-crumb",
    nameKo: "유성 색연필", nameEn: "Oil Colored Pencil", tagKo: "다층 글레이징 · 왁스 블룸", tagEn: "Layered Glaze · Wax Bloom",
    summaryKo: "1~2패스는 맑게 겹쳐 쌓이고 3~4패스 압착에서 매끄러운 유성 왁스 블룸 광택이 올라옵니다.",
    summaryEn: "Builds translucent glaze layers on early passes and develops warm wax bloom on passes 3 to 4.",
    recommendedPaperId: "kent-smooth", pigmentNameKo: "앰버 오커 색연필", pigmentNameEn: "Amber Ochre Pencil",
    pigmentOklch: { l: 0.62, c: 0.155, h: 68 }, baseWidthPx: 12, waxViscosity: 0.62, burnishRate: 0.84,
    opacityCeiling: 0.95, smudgeCarry: 0.32, waxBloomFactor: 0.92, glazeBuildRate: 0.88, crumbScatterDensity: 0.4,
    tiltExpansionGain: 0.78, granulationGain: 0.78, bristleMinStrands: 1, bristleMaxStrands: 1,
    defaultPressure: 0.52, defaultTiltDeg: 48, defaultSpeedPxPerSec: 540, defaultOverlapPasses: 2, foleyBandHz: [2400, 6400], foleyBaseQ: 3.4,
  },
] as const;

export function getDryMediaPaperSubstrate(paperId: DryMediaPaperId): DryMediaPaperSubstrate {
  return DRYMEDIA_PAPER_SUBSTRATES.find((item) => item.id === paperId) ?? DRYMEDIA_PAPER_SUBSTRATES[0];
}
export function getDryMediaBrushPreset(brushId: DryMediaBrushId): DryMediaBrushPreset {
  return DRYMEDIA_BRUSH_PRESETS.find((item) => item.id === brushId) ?? DRYMEDIA_BRUSH_PRESETS[0];
}

/** 256×256 이중 스케일(Macro Fiber + Micro Tooth) 종이 요철 LUT를 결정론적으로 베이크한다. */
export function bakeDualScalePaperGrainLut(paperId: DryMediaPaperId): DualScalePaperGrainLut {
  const paper = getDryMediaPaperSubstrate(paperId);
  const size = DUAL_SCALE_GRAIN_TILE_SIZE;
  const total = size * size;
  const macroFiber = new Float32Array(total);
  const microTooth = new Float32Array(total);
  const combinedHeight = new Float32Array(total);
  const seed = paperId === "rough-cold-press" ? 17 : paperId === "kent-smooth" ? 31 : paperId === "hanji-mulberry" ? 53 : 71;
  const twoPi = Math.PI * 2;
  const fX = paperId === "hanji-mulberry" ? 4 : paperId === "rough-cold-press" ? 7 : paperId === "croquis-tooth" ? 10 : 14;
  const fY = Math.max(3, Math.round(fX * paper.fiberAnisotropy));
  const fU = paperId === "kent-smooth" ? 38 : paperId === "croquis-tooth" ? 28 : paperId === "hanji-mulberry" ? 24 : 20;
  const sinMX = new Float32Array(size);
  const cosMX = new Float32Array(size);
  const sinMY = new Float32Array(size);
  const cosMY = new Float32Array(size);
  const sinUX = new Float32Array(size);
  const sinUY = new Float32Array(size);
  for (let i = 0; i < size; i += 1) {
    const u = i / size;
    sinMX[i] = Math.sin(u * twoPi * fX);
    cosMX[i] = Math.cos(u * twoPi * fX * 2);
    sinMY[i] = Math.sin(u * twoPi * fY + 0.6);
    cosMY[i] = Math.cos(u * twoPi * fY * 2 + 1.1);
    sinUX[i] = Math.sin(u * twoPi * fU + 0.35);
    sinUY[i] = Math.cos(u * twoPi * fU + 0.9);
  }
  let sum = 0;
  let sumSq = 0;
  let deepValleys = 0;
  const depthScale = 0.45 + paper.valleyDepth * 0.55;
  for (let y = 0; y < size; y += 1) {
    const row = y * size;
    const sy = sinMY[y] ?? 0;
    const cy = cosMY[y] ?? 0;
    const my = sinUY[y] ?? 0;
    for (let x = 0; x < size; x += 1) {
      const idx = row + x;
      const mVal = clamp(0.5 + (0.28 * (sinMX[x] ?? 0) * sy + 0.07 * ((cosMX[x] ?? 0) + cy) + (hashUnit(seed, x >> 3, y >> 3) - 0.5) * 0.24) * depthScale, 0, 1);
      const uVal = clamp(0.5 + (0.22 * (sinUX[x] ?? 0) * my + (hashUnit(seed + 19, x, y) - 0.5) * 0.58) * depthScale, 0, 1);
      const comb = clamp(mVal * paper.macroFiberWeight + uVal * paper.microToothWeight, 0, 1);
      macroFiber[idx] = mVal;
      microTooth[idx] = uVal;
      combinedHeight[idx] = comb;
      sum += comb;
      sumSq += comb * comb;
      if (comb < 0.36) deepValleys += 1;
    }
  }
  const peakMean = sum / total;
  return {
    paperId, size, macroFiber, microTooth, combinedHeight,
    peakMean: roundTo(peakMean, 4), peakStdDev: roundTo(Math.sqrt(Math.max(0, sumSq / total - peakMean * peakMean)), 4),
    valleyDepthRatio: roundTo(deepValleys / total, 4), gpuTileRg8Bytes: total * 2,
  };
}

/** 256×256 이중 스케일 LUT를 O(1) 비트마스크 래핑으로 조회한다. */
export function sampleDualScalePaperGrain(lut: DualScalePaperGrainLut, xPx: number, yPx: number): DualScaleGrainSample {
  const mask = DUAL_SCALE_GRAIN_TILE_SIZE - 1;
  const idx = (Math.floor(Number.isFinite(yPx) ? yPx : 0) & mask) * lut.size + (Math.floor(Number.isFinite(xPx) ? xPx : 0) & mask);
  return { macroFiber: lut.macroFiber[idx] ?? 0.5, microTooth: lut.microTooth[idx] ?? 0.5, combinedHeight: lut.combinedHeight[idx] ?? 0.5 };
}

const WGSL_SMOOTHSTEP_SNIPPET = [
  "let dual = textureSample(paper_grain_256, grain_sampler, uv * tile_scale).rg;",
  "let h = fma(dual.r, u.macro_w, dual.g * u.micro_w);",
  "let deposit = smoothstep(u.tooth_threshold - 0.08, u.tooth_threshold + 0.08, h + u.burnish_lift);",
].join("\n");

/** 4대 건식 매체 시각 리얼리즘 수학 모델 시뮬레이터. */
export function simulateDryMediaStrokeMicrostructure(input: DryMediaStrokeInput): DryMediaMicrostructureResult {
  const preset = getDryMediaBrushPreset(input.brushId);
  const paper = getDryMediaPaperSubstrate(input.paperId);
  const lut = input.lut && input.lut.paperId === paper.id ? input.lut : bakeDualScalePaperGrainLut(paper.id);
  const pressure = roundTo(clamp(input.pressure, 0.05, 1), 3);
  const tiltDeg = roundTo(clamp(input.tiltDeg, TILT_MIN_DEG, TILT_MAX_DEG), 1);
  const speedPxPerSec = Math.round(clamp(input.speedPxPerSec, 60, 3200));
  const overlapPasses = Math.round(clamp(input.overlapPasses, MIN_OVERLAP_PASSES, MAX_OVERLAP_PASSES));
  const grainIntensity = roundTo(clamp(input.grainIntensity ?? 0.85, 0, 1), 3);
  const crumbIntensity = roundTo(clamp(input.crumbIntensity ?? 0.8, 0, 1), 3);

  const tiltBroad = clamp((TILT_MAX_DEG - tiltDeg) / (TILT_MAX_DEG - TILT_MIN_DEG), 0, 1);
  const isBroadSideActive = tiltDeg < TILT_BROADSIDE_THRESHOLD_DEG;
  const speedNorm = clamp((speedPxPerSec - 60) / (3200 - 60), 0, 1);
  const contactWidthMultiplier = roundTo(1 + (MAX_TILT_WIDTH_MULTIPLIER - 1) * Math.pow(tiltBroad, 1.1) * preset.tiltExpansionGain, 2);
  const effectiveContactWidthPx = roundTo(preset.baseWidthPx * contactWidthMultiplier, 1);
  const granulationContrast = roundTo(clamp((0.28 + tiltBroad * 0.44 + paper.valleyDepth * 0.22 - (overlapPasses - 1) * 0.08) * preset.granulationGain * (0.45 + grainIntensity * 0.55), 0.08, 0.99), 3);

  const isSumi = preset.id === "dry-sumi-bristle";
  const highSpeedSkipRatio = isSumi
    ? roundTo(clamp(0.08 + speedNorm * 0.62 + tiltBroad * 0.14 - pressure * 0.18, 0.05, 0.88), 3)
    : roundTo(clamp(speedNorm * 0.16 * (1 - preset.waxViscosity * 0.6), 0, 0.25), 3);
  const strandCount = isSumi
    ? Math.round(clamp(MIN_SUMI_BRISTLE_STRANDS + (MAX_SUMI_BRISTLE_STRANDS - MIN_SUMI_BRISTLE_STRANDS) * clamp(0.18 + speedNorm * 0.5 + tiltBroad * 0.34 - pressure * 0.24, 0, 1), MIN_SUMI_BRISTLE_STRANDS, MAX_SUMI_BRISTLE_STRANDS))
    : 0;
  const strands: SumiBristleStrand[] = Array.from({ length: strandCount }, (_, i) => {
    const r = strandCount === 1 ? 0 : (i / (strandCount - 1)) * 2 - 1;
    return {
      index: i, lateralOffsetNorm: roundTo(clamp(r * 0.88 + hashUnit(97, i, strandCount) * 0.16 - 0.08, -0.96, 0.96), 3),
      widthWeight: roundTo(clamp(0.55 + (1 - Math.abs(r)) * 0.55, 0.35, 1.15), 3),
      inkContinuity: roundTo(clamp(1 - highSpeedSkipRatio * (0.45 + Math.abs(r) * 0.45 + hashUnit(113, i, speedPxPerSec >> 4) * 0.25), 0.14, 0.98), 3),
      breakPhase: roundTo(hashUnit(131, i, overlapPasses), 3),
    };
  });

  const compaction = clamp(0.12 + pressure * (0.34 + preset.burnishRate * 0.24) - tiltBroad * 0.12 - paper.valleyDepth * 0.08, 0.05, 0.66);
  const valleyFillRatio = roundTo(clamp(1 - Math.pow(1 - compaction, overlapPasses) * (1 - (overlapPasses - 1) * 0.06 * preset.burnishRate), 0.04, 0.99), 3);
  const smudgeBlendRatio = roundTo(clamp(preset.smudgeCarry * (0.24 + (overlapPasses - 1) * 0.25) * (0.55 + pressure * 0.45), 0, 0.98), 3);
  const waxBloomRatio = roundTo(overlapPasses >= 3 ? clamp(preset.waxBloomFactor * ((overlapPasses - 2) * 0.42 + pressure * 0.34), 0, 0.95) : preset.waxBloomFactor * 0.08 * (overlapPasses - 1), 3);
  const glazeOpacity = roundTo(clamp(preset.opacityCeiling * (1 - Math.pow(1 - clamp(0.28 + pressure * 0.44 * preset.glazeBuildRate, 0.18, 0.86), overlapPasses)), 0.16, preset.opacityCeiling), 3);

  const toothThreshold = roundTo(clamp(0.74 - pressure * 0.46 + tiltBroad * 0.16 * grainIntensity + (isBroadSideActive ? 0.05 * grainIntensity : 0) + highSpeedSkipRatio * 0.1 - valleyFillRatio * 0.44, 0.04, 0.88), 3);
  const smoothstepEdgeLow = roundTo(clamp(toothThreshold - 0.08, 0, 0.96), 3);
  const smoothstepEdgeHigh = roundTo(clamp(toothThreshold + 0.08, 0.04, 1), 3);

  let depositSum = 0;
  let exposedCount = 0;
  const rowY = 42 + overlapPasses * 19;
  const crossSection: CrossSectionMicroPoint[] = Array.from({ length: 24 }, (_, i) => {
    const u = i / 23;
    const s = sampleDualScalePaperGrain(lut, Math.round(u * (lut.size - 1)), rowY);
    const deposit = smoothstep(smoothstepEdgeLow, smoothstepEdgeHigh, s.combinedHeight + valleyFillRatio * 0.18);
    const valleyExposed = deposit < 0.38;
    if (valleyExposed) exposedCount += 1;
    depositSum += deposit;
    return {
      u: roundTo(u, 3), macroHeight: roundTo(s.macroFiber, 3), microHeight: roundTo(s.microTooth, 3),
      combinedHeight: roundTo(s.combinedHeight, 3),
      pigmentHeight: roundTo(clamp(s.combinedHeight + deposit * (0.06 + preset.waxViscosity * 0.11 + valleyFillRatio * 0.09), 0, 1), 3),
      valleyExposed,
    };
  });
  const peakDepositRatio = roundTo(clamp(depositSum / 24, 0.05, 0.99), 3);
  const sparkleValleyExposure = roundTo(clamp((exposedCount / 24) * 0.55 + clamp(1 - peakDepositRatio, 0, 1) * 0.45 * (0.4 + grainIntensity * 0.6) * (1 - valleyFillRatio * 0.52), 0.01, 0.92), 3);

  const crumbCount = Math.round(clamp(preset.crumbScatterDensity * crumbIntensity * (10 + pressure * 14 + speedNorm * 8 + paper.valleyDepth * 6), 0, 36));
  const crumbSeed = preset.id.length * 37 + paper.id.length * 19 + Math.round(pressure * 100) + Math.round(tiltDeg) + overlapPasses * 13;
  const crumbParticles: DryMediaCrumbParticle[] = Array.from({ length: crumbCount }, (_, i) => ({
    id: i, alongT: roundTo(hashUnit(crumbSeed, i, 1), 3),
    lateralOffsetNorm: roundTo((hashUnit(crumbSeed, i, 2) > 0.5 ? 1 : -1) * (0.58 + hashUnit(crumbSeed, i, 3) * (0.42 + speedNorm * 0.34)), 3),
    radiusPx: roundTo(0.8 + hashUnit(crumbSeed, i, 4) * (1.2 + preset.waxViscosity * 1.6 + (preset.crumbKind === "charcoal-dust" ? 0.9 : 0)), 2),
    opacity: roundTo(clamp(0.32 + hashUnit(crumbSeed, i, 5) * 0.56, 0.25, 0.92), 3),
    kind: preset.crumbKind,
  }));

  const lutFetchMs = 0.085;
  const smoothstepThresholdMs = 0.062;
  const crumbCompositeMs = roundTo(0.032 + (crumbCount / 36) * 0.078 + (isSumi ? 0.044 : 0.012), 3);
  const additionalGpuCostMs = roundTo(lutFetchMs + smoothstepThresholdMs + crumbCompositeMs, 3);
  const baseStrokeRenderMs = roundTo(1.85 + speedNorm * 1.42 + (overlapPasses - 1) * 0.26 + contactWidthMultiplier * 0.21, 2);
  const totalEstimatedFrameMs = roundTo(baseStrokeRenderMs + additionalGpuCostMs, 2);

  return {
    brushId: preset.id, paperId: paper.id, pressure, tiltDeg, speedPxPerSec, overlapPasses, grainIntensity, crumbIntensity,
    dualScaleTooth: {
      toothThreshold, smoothstepEdgeLow, smoothstepEdgeHigh,
      macroFiberContribution: roundTo(paper.macroFiberWeight * grainIntensity, 3),
      microToothContribution: roundTo(paper.microToothWeight * grainIntensity, 3),
      peakDepositRatio, sparkleValleyExposure, crossSection,
    },
    tiltShading: { tiltDeg, isBroadSideActive, contactWidthMultiplier, effectiveContactWidthPx, granulationContrast, sumiBristle: { active: isSumi, strandCount, highSpeedSkipRatio, strands } },
    burnishAndCrumb: { overlapPasses, valleyFillRatio, smudgeBlendRatio, waxBloomRatio, glazeOpacity, crumbCount, crumbParticles },
    gpuBudget120Hz: {
      targetRefreshHz: 120, frameBudgetMs: FRAME_BUDGET_120HZ_MS, tileResolutionPx: DUAL_SCALE_GRAIN_TILE_SIZE,
      textureSamplesPerFragment: 1, shaderThresholdInstructionCount: SHADER_THRESHOLD_INSTRUCTIONS,
      lutFetchMs, smoothstepThresholdMs, crumbCompositeMs, additionalGpuCostMs,
      withinExtraGpuBudget: additionalGpuCostMs < EXTRA_GPU_BUDGET_MS,
      baseStrokeRenderMs, totalEstimatedFrameMs, within120HzBudget: totalEstimatedFrameMs <= FRAME_BUDGET_120HZ_MS,
      costModelSource: "deterministic-analytical-model",
      costModelNoteKo: "결정론적 분석 비용 모델(실측 GPU 프로파일 아님): 256×256 RG8 LUT 1샘플 + smoothstep 3명령 기준 추가 GPU 비용을 0.35ms 미만으로 계산합니다.",
      costModelNoteEn: "Deterministic analytical cost model (not live GPU telemetry): estimates < 0.35ms extra GPU cost from 1× 256×256 RG8 sample plus 3 smoothstep ops.",
      wgslSnippet: WGSL_SMOOTHSTEP_SNIPPET,
    },
    flatAlphaBaselineScore: 26,
    dryMediaRealismScore: Math.round(clamp(52 + granulationContrast * 18 + (sparkleValleyExposure > 0.1 ? 10 : 5) + valleyFillRatio * 10 + Math.min(1, crumbCount / 16) * 8 + (isSumi ? Math.min(1, strandCount / 14) * 9 : 4), 64, 99)),
  };
}

const SPECTRUM_BAND_HZ = [120, 180, 260, 360, 500, 720, 1000, 1400, 1900, 2500, 3200, 4000, 4900, 5800, 6800, 8000] as const;

/** 매체별 청각 질감(Web Audio Procedural Foley) 합성 모델 + -24 LUFS 청각 피로 방지 리미터. */
export function synthesizeDryMediaFoleyFrame(input: DryMediaFoleyInput): DryMediaFoleyFrame {
  const preset = getDryMediaBrushPreset(input.brushId);
  const paper = getDryMediaPaperSubstrate(input.paperId);
  const pressure = roundTo(clamp(input.pressure, 0.05, 1), 3);
  const tiltDeg = roundTo(clamp(input.tiltDeg, TILT_MIN_DEG, TILT_MAX_DEG), 1);
  const speedPxPerSec = Math.round(clamp(input.speedPxPerSec, 60, 3200));
  const overlapPasses = Math.round(clamp(input.overlapPasses, MIN_OVERLAP_PASSES, MAX_OVERLAP_PASSES));
  const volume = roundTo(clamp(input.volume, 0, 1), 3);
  const muted = Boolean(input.muted) || volume <= 0;

  const toothCrossingHz = roundTo(speedPxPerSec / paper.paperToothPitchPx, 1);
  const speedNorm = clamp((speedPxPerSec - 60) / (3200 - 60), 0, 1);
  const tiltBroad = clamp((TILT_MAX_DEG - tiltDeg) / (TILT_MAX_DEG - TILT_MIN_DEG), 0, 1);
  const [bandLow, bandHigh] = preset.foleyBandHz;
  const fam = preset.acousticFamily;

  const pitchDrive = clamp(0.2 + speedNorm * 0.52 + paper.acousticBrightness * 0.22 - pressure * (fam === "wax-drag" ? 0.18 : 0.06) + (fam === "graphite-scratch" ? (1 - tiltBroad) * 0.14 : 0), 0, 1);
  const primaryResonanceHz = Math.round(clamp(bandLow + (bandHigh - bandLow) * pitchDrive, bandLow, bandHigh));
  const primaryQ = roundTo(fam === "wax-drag" ? clamp(preset.foleyBaseQ + pressure * 1.45 - (overlapPasses - 1) * 0.18, 4.2, 7.6) : clamp(preset.foleyBaseQ + paper.acousticBrightness * 0.65 - tiltBroad * 0.4, 1.5, 4.4), 2);
  const lowFrictionRumbleGain = roundTo(fam === "wax-drag" ? clamp(0.42 + pressure * 0.44 + preset.waxViscosity * 0.14, 0.35, 0.96) : fam === "charcoal-grit" ? clamp(0.26 + pressure * 0.32, 0.2, 0.68) : clamp(0.08 + pressure * 0.14, 0.05, 0.28), 3);
  const highScratchBurstRateHz = roundTo(fam === "graphite-scratch" ? clamp(toothCrossingHz * 1.15, 24, 1450) : fam === "charcoal-grit" ? clamp(toothCrossingHz * 0.85, 18, 920) : clamp(toothCrossingHz * 0.45, 10, 520), 1);
  const transientAttackMs = roundTo(fam === "graphite-scratch" ? clamp(3.8 - speedNorm * 2.1, 1.4, 4.2) : fam === "sumi-whisper" ? clamp(6.5 - speedNorm * 2.8, 3.2, 7.2) : clamp(11.5 - pressure * 3.2, 6.8, 12.5), 2);
  const velocityNoiseGain = roundTo(fam === "sumi-whisper" ? clamp(0.14 + speedNorm * 0.78 + tiltBroad * 0.08, 0.12, 0.98) : clamp(0.12 + speedNorm * 0.56 + pressure * 0.22, 0.1, 0.92), 3);

  const rawDriveGain = clamp((0.24 + pressure * 0.34 + velocityNoiseGain * 0.42) * volume * (1 - (overlapPasses - 1) * 0.05 * preset.burnishRate), 0, 1.15);
  const preLimiterLufs = muted ? -96 : roundTo(-34 + rawDriveGain * 18, 1);
  const gainReductionDb = muted ? 0 : roundTo(Math.max(0, preLimiterLufs - FOLEY_LIMITER_CEILING_LUFS), 2);
  const estimatedOutputLufs = muted ? -96 : roundTo(Math.min(FOLEY_LIMITER_CEILING_LUFS, preLimiterLufs), 1);
  const effectiveGain = muted ? 0 : roundTo(clamp(rawDriveGain * Math.pow(10, -gainReductionDb / 20), 0, 0.65), 3);

  const noiseColor: WebAudioFoleyNodeSpec["noiseColor"] = fam === "wax-drag" ? "brown-wax" : fam === "graphite-scratch" ? "white-micro" : fam === "charcoal-grit" ? "pink-grit" : "filtered-silk";
  const secondaryFilterType: WebAudioFoleyNodeSpec["secondaryFilterType"] = fam === "wax-drag" ? "lowshelf" : fam === "graphite-scratch" ? "highpass" : "peaking";
  const secondaryFrequencyHz = fam === "wax-drag" ? 145 : fam === "graphite-scratch" ? 1950 : fam === "sumi-whisper" ? 2400 : 3100;
  const secondaryGainDb = roundTo(fam === "wax-drag" ? 4.5 + lowFrictionRumbleGain * 5 : fam === "graphite-scratch" ? 3.2 : 3.8, 1);

  const audioGraph: WebAudioFoleyNodeSpec = {
    nodeChain: ["procedural-noise-buffer-source", "tooth-crossing-lfo-gain", "primary-biquad-bandpass", "secondary-biquad-filter", "pressure-envelope-gain", "lufs-24-dynamics-compressor", "master-mute-gain"],
    noiseColor, toothLfoHz: roundTo(clamp(toothCrossingHz * 0.25, 4, 240), 1),
    primaryFilterType: "bandpass", primaryFrequencyHz: primaryResonanceHz, primaryQ,
    secondaryFilterType, secondaryFrequencyHz, secondaryGainDb, pressureGain: roundTo(0.25 + pressure * 0.65, 3),
    compressorThresholdDb: FOLEY_LIMITER_CEILING_LUFS, compressorKneeDb: 6, compressorRatio: 12,
    compressorAttackSec: 0.003, compressorReleaseSec: 0.08, masterOutputGain: effectiveGain,
  };

  const logCenter = Math.log2(primaryResonanceHz);
  const logSec = Math.log2(secondaryFrequencyHz);
  const spreadOct = fam === "wax-drag" ? 0.72 : fam === "sumi-whisper" ? 1.08 : 0.88;
  const secWeight = fam === "wax-drag" ? lowFrictionRumbleGain * 0.55 : fam === "charcoal-grit" ? 0.48 : 0.28;
  const spectrumBands: FoleySpectrumBand[] = SPECTRUM_BAND_HZ.map((hz) => {
    const label = hz >= 1000 ? `${roundTo(hz / 1000, 1)}k` : `${hz}`;
    if (muted) return { hz, label, magnitude: 0 };
    const logHz = Math.log2(hz);
    const bell1 = Math.exp(-0.5 * Math.pow((logHz - logCenter) / spreadOct, 2));
    const bell2 = Math.exp(-0.5 * Math.pow((logHz - logSec) / 0.85, 2)) * secWeight;
    return { hz, label, magnitude: roundTo(clamp((bell1 * 0.88 + bell2) * (0.35 + effectiveGain * 1.15), 0.03, 1), 3) };
  });

  const waveSeed = primaryResonanceHz + Math.round(toothCrossingHz * 10);
  const cycles = fam === "wax-drag" ? 2.2 : fam === "sumi-whisper" ? 4.4 : fam === "charcoal-grit" ? 5.2 : 7.4;
  const waveformSamples: number[] = Array.from({ length: 32 }, (_, i) => {
    if (muted) return 0;
    const grit = (hashUnit(waveSeed, i, overlapPasses) * 2 - 1) * (fam === "wax-drag" ? 0.28 : 0.54);
    const env = 0.35 + Math.sin((i / 31) * Math.PI) * 0.65;
    return roundTo(clamp((Math.sin((i / 31) * Math.PI * 2 * cycles) * 0.65 + grit * 0.45) * env * clamp(effectiveGain * 1.65, 0.18, 0.96), -1, 1), 3);
  });

  const acousticSummaryKo =
    fam === "wax-drag" ? `끈적한 왁스 드래그 공진 ${primaryResonanceHz}Hz(Q ${primaryQ}) · 저음 마찰 ${Math.round(lowFrictionRumbleGain * 100)}%`
      : fam === "graphite-scratch" ? `미세 종이 결 긁힘 ${primaryResonanceHz}Hz · 초당 ${Math.round(highScratchBurstRateHz)}회 과도 버스트`
        : fam === "sumi-whisper" ? `모필·한지 사각거림 ${primaryResonanceHz}Hz 대역통과 · 속도 비례 게인 ${Math.round(velocityNoiseGain * 100)}%`
          : `거친 목탄 결 긁힘 ${primaryResonanceHz}Hz + 가루 크래클 3.1kHz 이중 대역`;
  const acousticSummaryEn =
    fam === "wax-drag" ? `Sticky wax drag resonance ${primaryResonanceHz}Hz (Q ${primaryQ}) · low friction ${Math.round(lowFrictionRumbleGain * 100)}%`
      : fam === "graphite-scratch" ? `Micro tooth scratch ${primaryResonanceHz}Hz · ${Math.round(highScratchBurstRateHz)} transient bursts/s`
        : fam === "sumi-whisper" ? `Bristle whisper bandpass ${primaryResonanceHz}Hz · speed-linked gain ${Math.round(velocityNoiseGain * 100)}%`
          : `Coarse charcoal grit ${primaryResonanceHz}Hz + 3.1kHz dust crackle dual band`;

  return {
    brushId: preset.id, paperId: paper.id, acousticFamily: fam, muted, volume,
    paperToothPitchPx: paper.paperToothPitchPx, toothCrossingHz, primaryResonanceHz, primaryQ,
    lowFrictionRumbleGain, highScratchBurstRateHz, transientAttackMs, velocityNoiseGain, effectiveGain,
    safetyLimiter: { ceilingLufs: FOLEY_LIMITER_CEILING_LUFS, preLimiterLufs, estimatedOutputLufs, gainReductionDb, fatigueGuardActive: true },
    audioGraph, spectrumBands, waveformSamples, acousticSummaryKo, acousticSummaryEn,
  };
}

/** 브라우저 Web Audio API로 260ms 절차적 Foley 시연음을 안전하게 재생한다(-24 LUFS 리미터 경유). */
export function playDryMediaFoleyPreview(frame: DryMediaFoleyFrame): FoleyPreviewPlayResult {
  if (frame.muted || frame.effectiveGain <= 0) return { played: false, reason: "muted", durationMs: 0 };
  const AudioCtx = typeof globalThis !== "undefined" ? (globalThis as { readonly AudioContext?: typeof AudioContext }).AudioContext : undefined;
  if (!AudioCtx) return { played: false, reason: "unsupported-audio-context", durationMs: 0 };
  try {
    const ctx = new AudioCtx();
    const durationSec = 0.26;
    const count = Math.max(1024, Math.floor(ctx.sampleRate * durationSec));
    const buffer = ctx.createBuffer(1, count, ctx.sampleRate);
    const ch = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < count; i += 1) {
      const white = hashUnit(frame.primaryResonanceHz, i, 7) * 2 - 1;
      ch[i] = frame.audioGraph.noiseColor === "brown-wax" ? (brown = clamp(brown * 0.94 + white * 0.16, -1, 1)) : white * 0.65;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const f1 = ctx.createBiquadFilter();
    f1.type = frame.audioGraph.primaryFilterType;
    f1.frequency.value = frame.audioGraph.primaryFrequencyHz;
    f1.Q.value = frame.audioGraph.primaryQ;
    const f2 = ctx.createBiquadFilter();
    f2.type = frame.audioGraph.secondaryFilterType;
    f2.frequency.value = frame.audioGraph.secondaryFrequencyHz;
    f2.gain.value = frame.audioGraph.secondaryGainDb;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = frame.audioGraph.compressorThresholdDb;
    comp.knee.value = frame.audioGraph.compressorKneeDb;
    comp.ratio.value = frame.audioGraph.compressorRatio;
    comp.attack.value = frame.audioGraph.compressorAttackSec;
    comp.release.value = frame.audioGraph.compressorReleaseSec;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(clamp(frame.audioGraph.masterOutputGain * 0.4, 0, 0.25), now + frame.transientAttackMs / 1000);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationSec);
    src.connect(f1);
    f1.connect(f2);
    f2.connect(comp);
    comp.connect(gain);
    gain.connect(ctx.destination);
    src.onended = () => { void ctx.close(); };
    src.start(now);
    src.stop(now + durationSec);
    return { played: true, reason: "played", durationMs: 260 };
  } catch {
    return { played: false, reason: "audio-context-error", durationMs: 0 };
  }
}

function buildConfigForBrush(brushId: DryMediaBrushId, overrides?: Partial<DryMediaLabConfig>): DryMediaLabConfig {
  const p = getDryMediaBrushPreset(brushId);
  return {
    brushId: p.id, paperId: overrides?.paperId ?? p.recommendedPaperId,
    pressure: roundTo(clamp(overrides?.pressure ?? p.defaultPressure, 0.05, 1), 3),
    tiltDeg: roundTo(clamp(overrides?.tiltDeg ?? p.defaultTiltDeg, TILT_MIN_DEG, TILT_MAX_DEG), 1),
    speedPxPerSec: Math.round(clamp(overrides?.speedPxPerSec ?? p.defaultSpeedPxPerSec, 60, 3200)),
    overlapPasses: Math.round(clamp(overrides?.overlapPasses ?? p.defaultOverlapPasses, MIN_OVERLAP_PASSES, MAX_OVERLAP_PASSES)),
    grainIntensity: roundTo(clamp(overrides?.grainIntensity ?? 0.85, 0, 1), 3),
    crumbIntensity: roundTo(clamp(overrides?.crumbIntensity ?? 0.8, 0, 1), 3),
    foleyVolume: roundTo(clamp(overrides?.foleyVolume ?? 0.72, 0, 1), 3),
    foleyMuted: overrides?.foleyMuted ?? false,
  };
}

function configsEqual(a: DryMediaLabConfig, b: DryMediaLabConfig): boolean {
  return (
    a.brushId === b.brushId && a.paperId === b.paperId && a.pressure === b.pressure && a.tiltDeg === b.tiltDeg &&
    a.speedPxPerSec === b.speedPxPerSec && a.overlapPasses === b.overlapPasses && a.grainIntensity === b.grainIntensity &&
    a.crumbIntensity === b.crumbIntensity && a.foleyVolume === b.foleyVolume && a.foleyMuted === b.foleyMuted
  );
}

/** 비파괴 건식 매체·청각 Foley 랩 세션을 생성한다. */
export function createDryMediaLabSession(initial?: DryMediaLabConfigPatch): DryMediaLabSession {
  return { committed: buildConfigForBrush(initial?.brushId ?? "wax-crayon", initial), preview: null, history: [], status: "clean", appliedCount: 0, canApply: false, canRevert: false };
}

/** 현재 활성(미리보기 우선, 없으면 확정) 설정을 반환한다. */
export function getActiveDryMediaConfig(session: DryMediaLabSession): DryMediaLabConfig { return session.preview ?? session.committed; }

/** 6종 매체 프리셋 전환 시 해당 매체 추천 종이·필압·기울기를 미리보기로 반영한다(음소거·음량 유지). */
export function selectDryMediaBrushPreset(session: DryMediaLabSession, brushId: DryMediaBrushId): DryMediaLabSession {
  const active = getActiveDryMediaConfig(session);
  const next = buildConfigForBrush(brushId, { foleyVolume: active.foleyVolume, foleyMuted: active.foleyMuted });
  const dirty = !configsEqual(next, session.committed);
  return { ...session, preview: dirty ? next : null, status: dirty ? "previewing" : session.appliedCount > 0 ? "applied" : "clean", canApply: dirty, canRevert: dirty || session.history.length > 0 };
}

/** 슬라이더·종이 결·오디오 옵션 변경을 비파괴 미리보기로 반영한다. */
export function previewDryMediaConfigPatch(session: DryMediaLabSession, patch: DryMediaLabConfigPatch): DryMediaLabSession {
  const base = getActiveDryMediaConfig(session);
  const next: DryMediaLabConfig = {
    brushId: patch.brushId ?? base.brushId, paperId: patch.paperId ?? base.paperId,
    pressure: roundTo(clamp(patch.pressure ?? base.pressure, 0.05, 1), 3),
    tiltDeg: roundTo(clamp(patch.tiltDeg ?? base.tiltDeg, TILT_MIN_DEG, TILT_MAX_DEG), 1),
    speedPxPerSec: Math.round(clamp(patch.speedPxPerSec ?? base.speedPxPerSec, 60, 3200)),
    overlapPasses: Math.round(clamp(patch.overlapPasses ?? base.overlapPasses, MIN_OVERLAP_PASSES, MAX_OVERLAP_PASSES)),
    grainIntensity: roundTo(clamp(patch.grainIntensity ?? base.grainIntensity, 0, 1), 3),
    crumbIntensity: roundTo(clamp(patch.crumbIntensity ?? base.crumbIntensity, 0, 1), 3),
    foleyVolume: roundTo(clamp(patch.foleyVolume ?? base.foleyVolume, 0, 1), 3),
    foleyMuted: patch.foleyMuted ?? base.foleyMuted,
  };
  const dirty = !configsEqual(next, session.committed);
  return { ...session, preview: dirty ? next : null, status: dirty ? "previewing" : session.appliedCount > 0 ? "applied" : "clean", canApply: dirty, canRevert: dirty || session.history.length > 0 };
}

/** 미리보기 설정을 확정 커밋하고 되돌리기 이력에 직전 확정 상태를 적재한다. */
export function applyDryMediaLabPreview(session: DryMediaLabSession): DryMediaLabSession {
  if (!session.preview) return session;
  const history = [...session.history.slice(-11), session.committed];
  return { committed: session.preview, preview: null, history, status: "applied", appliedCount: session.appliedCount + 1, canApply: false, canRevert: history.length > 0 };
}

/** 미리보기가 있으면 즉시 취소하고, 없으면 직전 확정 스냅샷으로 원복한다. */
export function revertDryMediaLabSession(session: DryMediaLabSession): DryMediaLabSession {
  if (session.preview) return { ...session, preview: null, status: "reverted", canApply: false, canRevert: session.history.length > 0 };
  const prev = session.history[session.history.length - 1];
  if (!prev) return session;
  const remaining = session.history.slice(0, -1);
  return { committed: prev, preview: null, history: remaining, status: "reverted", appliedCount: session.appliedCount, canApply: false, canRevert: remaining.length > 0 };
}

/** WGSL 셰이더 + Web Audio 절차적 Foley 레시피 JSON 문자열을 직렬화한다. */
export function exportDryMediaRecipeJson(
  session: DryMediaLabSession, microstructure: DryMediaMicrostructureResult, foley: DryMediaFoleyFrame,
): string {
  const active = getActiveDryMediaConfig(session);
  const preset = getDryMediaBrushPreset(active.brushId);
  const paper = getDryMediaPaperSubstrate(active.paperId);
  return JSON.stringify({
    schema: "toonstudio.drymedia-crayon-audio-recipe.v1",
    sessionStatus: session.status, appliedCount: session.appliedCount,
    brush: { id: preset.id, nameKo: preset.nameKo, nameEn: preset.nameEn, pigmentOklch: formatOklch(preset.pigmentOklch) },
    paper: { id: paper.id, nameKo: paper.nameKo, toothPitchPx: paper.paperToothPitchPx, tileResolutionPx: DUAL_SCALE_GRAIN_TILE_SIZE },
    config: active,
    microstructure: {
      toothThreshold: microstructure.dualScaleTooth.toothThreshold,
      peakDepositRatio: microstructure.dualScaleTooth.peakDepositRatio,
      sparkleValleyExposure: microstructure.dualScaleTooth.sparkleValleyExposure,
      contactWidthMultiplier: microstructure.tiltShading.contactWidthMultiplier,
      granulationContrast: microstructure.tiltShading.granulationContrast,
      sumiStrandCount: microstructure.tiltShading.sumiBristle.strandCount,
      valleyFillRatio: microstructure.burnishAndCrumb.valleyFillRatio,
      crumbCount: microstructure.burnishAndCrumb.crumbCount,
      dryMediaRealismScore: microstructure.dryMediaRealismScore,
    },
    gpuShaderBudget120Hz: {
      costModelSource: microstructure.gpuBudget120Hz.costModelSource,
      textureSamplesPerFragment: microstructure.gpuBudget120Hz.textureSamplesPerFragment,
      shaderThresholdInstructionCount: microstructure.gpuBudget120Hz.shaderThresholdInstructionCount,
      additionalGpuCostMs: microstructure.gpuBudget120Hz.additionalGpuCostMs,
      totalEstimatedFrameMs: microstructure.gpuBudget120Hz.totalEstimatedFrameMs,
      wgslSnippet: microstructure.gpuBudget120Hz.wgslSnippet,
    },
    acousticFoley: {
      toothCrossingHz: foley.toothCrossingHz, primaryResonanceHz: foley.primaryResonanceHz, primaryQ: foley.primaryQ,
      safetyLimiterCeilingLufs: foley.safetyLimiter.ceilingLufs, estimatedOutputLufs: foley.safetyLimiter.estimatedOutputLufs,
      audioGraph: foley.audioGraph,
    },
  }, null, 2);
}
