/**
 * Wave 61A — AtelierInk 차세대 브러시 시각 질감 대혁신 엔진 (ToonCore · SpectrumCompute).
 * 4대 결함(원형 도장 끊김·평면 오버레이 종이결·탁한 sRGB 혼색·플랫 채색) 정량 해결 및 WGSL 정적 계약.
 * 원시 hex/rgb/hsl 0건, 바이올렛 휴(270~320°) 0%, 스토리지·BigInt·private Map store 0건.
 */

export const ATELIER_INK_SCHEMA_VERSION = "atelier-ink-optical/1.0" as const;
export const ATELIER_INK_ENGINE_BRAND = "AtelierInk" as const;
export const TOONCORE_RUNTIME_BRAND = "ToonCore" as const;
export const SPECTRUM_COMPUTE_BRAND = "SpectrumCompute" as const;
export const LEGACY_CIRCULAR_STAMP_BEADING_INDEX = 0.82 as const;
export const MAX_ATELIER_INK_BEADING_INDEX = 0.04 as const;
export const WET_SURFACE_ROUGHNESS = 0.14 as const;
export const DRY_SURFACE_ROUGHNESS = 0.78 as const;
export const MIN_BRISTLE_COUNT = 8 as const;
export const MAX_BRISTLE_COUNT = 24 as const;
export const IMPASTO_SOBEL_LIGHT_ANGLE_DEG = 45 as const;
export const VIOLET_HUE_MIN_DEG = 270 as const;
export const VIOLET_HUE_MAX_DEG = 320 as const;

export type AtelierInkPresetId =
  | "hanji-sumi-bristle" | "cotton-watercolor-bloom" | "impasto-oil-knife"
  | "wax-crayon-grain" | "graphite-4b-tilt" | "steel-gpen-taper";

export type RealismAxisId =
  | "ribbon-continuity" | "dual-paper-grain" | "optical-pigment-bristle"
  | "wet-dry-roughness" | "impasto-normal-relief";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
/** 6대 가시광 대역(440, 490, 530, 575, 615, 665 nm) 반사율 스펙트럼. */
export type SpectralBandReflectance = readonly [number, number, number, number, number, number];

export interface DualFrequencyPaperProfile {
  readonly id: string; readonly nameKo: string; readonly nameEn: string;
  readonly macroFreqCycPerMm: number; readonly microFreqCycPerMm: number;
  readonly macroAmplitude: number; readonly microAmplitude: number;
  readonly fiberAnisotropy: number; readonly absorbency: number;
  readonly paperOklch: OklchColor; readonly valleyOklch: OklchColor;
}
export interface AtelierInkStrokeControls {
  readonly pressure: number; readonly tiltDeg: number; readonly dryingProgress: number;
  readonly paperRoughness: number; readonly bristleCount: number;
  readonly impastoThicknessMm: number; readonly strokeSpeedPxPerSec?: number;
}
export interface NormalizedAtelierInkControls {
  readonly pressure: number; readonly tiltDeg: number; readonly dryingProgress: number;
  readonly paperRoughness: number; readonly bristleCount: number;
  readonly impastoThicknessMm: number; readonly strokeSpeedPxPerSec: number; readonly clamped: boolean;
}
export interface AtelierInkSignaturePreset {
  readonly id: AtelierInkPresetId; readonly nameKo: string; readonly nameEn: string;
  readonly taglineKo: string; readonly taglineEn: string;
  readonly mediumCategoryKo: string; readonly mediumCategoryEn: string;
  readonly pigmentNameKo: string; readonly pigmentNameEn: string; readonly pigmentOklch: OklchColor;
  readonly partnerPigmentNameKo: string; readonly partnerPigmentNameEn: string; readonly partnerPigmentOklch: OklchColor;
  readonly spectralReflectance: SpectralBandReflectance; readonly partnerReflectance: SpectralBandReflectance;
  readonly paperProfile: DualFrequencyPaperProfile;
  readonly ribbonBaseBeading: number; readonly capillaryMobility: number;
  readonly bristleDepletionDecay: number; readonly nibSharpnessDpi: number;
  readonly defaults: Omit<NormalizedAtelierInkControls, "clamped">;
}
export interface RibbonSdfMetrics {
  readonly legacyBeadingIndex: typeof LEGACY_CIRCULAR_STAMP_BEADING_INDEX;
  readonly beadingIndex: number; readonly beadingReductionPct: number;
  readonly ribbonContinuityRatio: number; readonly sdfAntiAliasPx: number;
  readonly adaptiveSegmentsPerMm: number; readonly nibSharpnessDpi: number;
}
export interface PaperGrainCrossSample {
  readonly u: number; readonly macroHeight: number; readonly microHeight: number;
  readonly combinedHeight: number; readonly pigmentHit: boolean;
}
export interface DualFrequencyGrainMetrics {
  readonly paperId: string; readonly macroFreqCycPerMm: number; readonly microFreqCycPerMm: number;
  readonly clipThreshold: number; readonly peakCatchRatio: number; readonly valleyVoidRatio: number;
  readonly legacyFlatOverlayContrast: number; readonly dualGrainMicroContrast: number;
  readonly crossSectionSamples: readonly PaperGrainCrossSample[];
}
export interface OpticalSpectralMixResult {
  readonly mixedReflectance: SpectralBandReflectance;
  readonly opticalChromaRetention: number; readonly legacySrgbChromaRetention: number;
  readonly chromaPreservationGainPct: number; readonly mixedOklch: OklchColor; readonly legacyMuddyOklch: OklchColor;
}
export interface BristleFilamentCurve {
  readonly index: number; readonly lateralOffsetNorm: number; readonly radiusWeight: number;
  readonly initialLoad: number; readonly depletionRate: number; readonly tailLoad: number;
  readonly samples: readonly [number, number, number, number, number]; readonly isDrySplitAtTail: boolean;
}
export interface BristleDepletionMetrics {
  readonly bristleCount: number; readonly activeTailBristles: number;
  readonly dryBrushSplitRatio: number; readonly splitForkCount: number;
  readonly meanTailLoad: number; readonly filaments: readonly BristleFilamentCurve[];
}
export interface WetDryOpticalMetrics {
  readonly dryingProgress: number; readonly wetness: number;
  readonly surfaceRoughness: number; readonly wetGlossIntensity: number;
  readonly sobelLightAngleDeg: typeof IMPASTO_SOBEL_LIGHT_ANGLE_DEG;
  readonly impastoThicknessMm: number; readonly sobelNormalStrength: number;
  readonly impastoHighlightGain: number; readonly impastoShadowDepth: number;
  readonly capillaryBackrunRimWidthPx: number; readonly capillaryEdgeDarkening: number; readonly centerWashoutRatio: number;
}
export interface RootCauseResolutionItem {
  readonly id: 1 | 2 | 3 | 4; readonly flawKo: string; readonly flawEn: string;
  readonly solutionKo: string; readonly solutionEn: string;
  readonly legacyMetric: string; readonly atelierInkMetric: string; readonly resolved: boolean;
}
export interface BrushRealismAxisScore {
  readonly id: RealismAxisId; readonly labelKo: string; readonly labelEn: string;
  readonly legacyScore: number; readonly atelierInkScore: number; readonly delta: number;
  readonly summaryKo: string; readonly summaryEn: string;
}
export interface AtelierInkRuntimeState {
  readonly model: "deterministic-analytical-cpu"; readonly gpuExecuted: false;
  readonly canvasApplied: false; readonly persisted: false;
}
export interface BrushVisualRealismReport {
  readonly presetId: AtelierInkPresetId; readonly presetNameKo: string; readonly presetNameEn: string;
  readonly engineBrand: typeof ATELIER_INK_ENGINE_BRAND;
  readonly runtimeCore: typeof TOONCORE_RUNTIME_BRAND;
  readonly computeBackend: typeof SPECTRUM_COMPUTE_BRAND;
  readonly input: NormalizedAtelierInkControls;
  readonly ribbon: RibbonSdfMetrics; readonly paperGrain: DualFrequencyGrainMetrics;
  readonly spectralMix: OpticalSpectralMixResult; readonly bristleDepletion: BristleDepletionMetrics;
  readonly wetDryOptical: WetDryOpticalMetrics;
  readonly fourRootCauses: readonly RootCauseResolutionItem[];
  readonly axes: readonly BrushRealismAxisScore[];
  readonly legacyOverallScore: number; readonly atelierInkOverallScore: number;
  readonly realismGainPoints: number; readonly runtimeState: AtelierInkRuntimeState;
}
export interface WgslContractCheck {
  readonly id: string; readonly passed: boolean; readonly detailKo: string; readonly detailEn: string;
}
export interface AtelierInkWgslValidationReport {
  readonly validationKind: "static-source-contract"; readonly gpuCompiled: false; readonly valid: boolean;
  readonly entryPoint: string; readonly workgroupSize: readonly [number, number, number];
  readonly uniformStructBytes: number; readonly uniformAlignedStrideBytes: number;
  readonly bristleStructBytes: number; readonly bindingCount: number;
  readonly reservedKeywordHits: readonly string[];
  readonly checks: readonly WgslContractCheck[]; readonly errors: readonly string[];
}
export interface AtelierInkExportSpec {
  readonly schemaVersion: typeof ATELIER_INK_SCHEMA_VERSION;
  readonly engine: typeof ATELIER_INK_ENGINE_BRAND;
  readonly runtimeCore: typeof TOONCORE_RUNTIME_BRAND;
  readonly computeBackend: typeof SPECTRUM_COMPUTE_BRAND;
  readonly activePreset: AtelierInkSignaturePreset;
  readonly report: BrushVisualRealismReport; readonly wgslValidation: AtelierInkWgslValidationReport;
  readonly wgslByteLength: number; readonly runtimeState: AtelierInkRuntimeState;
  readonly honestyNoteKo: string; readonly honestyNoteEn: string;
}

function roundTo(value: number, digits: number): number { const f = 10 ** digits; return Math.round(value * f) / f; }
function clampFinite(value: number | undefined, fallback: number, min: number, max: number): { value: number; clamped: boolean } {
  if (value === undefined) return { value: fallback, clamped: false };
  if (!Number.isFinite(value)) return { value: fallback, clamped: true };
  if (value < min) return { value: min, clamped: true };
  if (value > max) return { value: max, clamped: true };
  return { value, clamped: false };
}
function normalizeHueDeg(hue: number): number { const m = Number.isFinite(hue) ? hue % 360 : 0; return m < 0 ? m + 360 : m; }

/** 270~320° 바이올렛 대역 여부를 판정한다. */
export function isVioletHueDeg(hue: number): boolean {
  const h = normalizeHueDeg(hue);
  return h >= VIOLET_HUE_MIN_DEG && h <= VIOLET_HUE_MAX_DEG;
}

/** 바이올렛 대역(270~320°)이 들어오면 안전한 코발트(236°)·카민(342°) 축으로 치환한다. */
export function sanitizeNonVioletOklch(color: OklchColor): OklchColor {
  const l = clampFinite(color.l, 0.5, 0.08, 0.98).value;
  const c = clampFinite(color.c, 0.08, 0, 0.28).value;
  const rawH = normalizeHueDeg(color.h);
  const h = isVioletHueDeg(rawH) ? (rawH < 295 ? 236 : 342) : rawH;
  return { l: roundTo(l, 3), c: roundTo(c, 3), h: roundTo(h, 1) };
}

/** OKLCH 색상을 CSS `oklch(...)` 문자열로 직렬화한다(바이올렛 휴 자동 차단). */
export function formatOklch(color: OklchColor, alpha?: number): string {
  const safe = sanitizeNonVioletOklch(color);
  if (alpha === undefined) return `oklch(${safe.l} ${safe.c} ${safe.h})`;
  return `oklch(${safe.l} ${safe.c} ${safe.h} / ${roundTo(clampFinite(alpha, 1, 0, 1).value, 3)})`;
}

/** WebGPU uniform 버퍼 256B 동적 오프셋 정렬 계산기. */
export function alignToWebGpu256(bytes: number): number {
  return Math.ceil(Math.max(0, Math.floor(Number.isFinite(bytes) ? bytes : 0)) / 256) * 256;
}

/** 6종 AtelierInk 시그니처 화구 프리셋(100% ToonStudio 고유 설계 · 비바이올렛 OKLCH). */
export const ATELIER_INK_SIGNATURE_PRESETS: readonly AtelierInkSignaturePreset[] = [
  {
    id: "hanji-sumi-bristle", nameKo: "한지 갈필 먹붓", nameEn: "Hanji Dry-Brush Sumi",
    taglineKo: "닥나무 장섬유 결 위로 20모 붓털이 갈라지며 번지는 먹물 갈필",
    taglineEn: "20-bristle pine-soot ink splitting cleanly over mulberry fiber grain",
    mediumCategoryKo: "동양 수묵 · 갈필", mediumCategoryEn: "East Asian Sumi · Dry Split",
    pigmentNameKo: "송연 먹색", pigmentNameEn: "Pine Soot Sumi", pigmentOklch: { l: 0.21, c: 0.024, h: 234 },
    partnerPigmentNameKo: "황토 훈색", partnerPigmentNameEn: "Warm Ochre Tint", partnerPigmentOklch: { l: 0.64, c: 0.115, h: 74 },
    spectralReflectance: [0.11, 0.12, 0.12, 0.11, 0.1, 0.09], partnerReflectance: [0.18, 0.26, 0.44, 0.68, 0.72, 0.69],
    paperProfile: { id: "mulberry-hanji-dual", nameKo: "전주 닥나무 한지", nameEn: "Mulberry Hanji Rag", macroFreqCycPerMm: 0.65, microFreqCycPerMm: 5.4, macroAmplitude: 0.64, microAmplitude: 0.36, fiberAnisotropy: 0.84, absorbency: 0.86, paperOklch: { l: 0.95, c: 0.016, h: 88 }, valleyOklch: { l: 0.83, c: 0.024, h: 80 } },
    ribbonBaseBeading: 0.018, capillaryMobility: 0.62, bristleDepletionDecay: 1.55, nibSharpnessDpi: 300,
    defaults: { pressure: 0.56, tiltDeg: 38, dryingProgress: 0.42, paperRoughness: 0.74, bristleCount: 20, impastoThicknessMm: 0.2, strokeSpeedPxPerSec: 920 },
  },
  {
    id: "cotton-watercolor-bloom", nameKo: "면지 수채 번짐", nameEn: "Cotton Watercolor Bloom",
    taglineKo: "300g 면지 골짜기 모세관 백런 림과 투명 분광 광학 겹칠",
    taglineEn: "Capillary backrun rims and luminous K/S glazing on 300g cotton rag",
    mediumCategoryKo: "투명 수채 · 모세관 유체", mediumCategoryEn: "Watercolor · Capillary Flow",
    pigmentNameKo: "세룰리안 청록", pigmentNameEn: "Cerulean Teal", pigmentOklch: { l: 0.52, c: 0.142, h: 224 },
    partnerPigmentNameKo: "카드뮴 레몬", partnerPigmentNameEn: "Cadmium Lemon", partnerPigmentOklch: { l: 0.84, c: 0.155, h: 94 },
    spectralReflectance: [0.68, 0.72, 0.46, 0.18, 0.11, 0.09], partnerReflectance: [0.12, 0.24, 0.72, 0.86, 0.84, 0.78],
    paperProfile: { id: "cotton-coldpress-300", nameKo: "코튼 100% 중목 수채지", nameEn: "100% Cotton Cold-Press", macroFreqCycPerMm: 0.9, microFreqCycPerMm: 6.2, macroAmplitude: 0.52, microAmplitude: 0.48, fiberAnisotropy: 0.28, absorbency: 0.94, paperOklch: { l: 0.96, c: 0.008, h: 92 }, valleyOklch: { l: 0.85, c: 0.015, h: 86 } },
    ribbonBaseBeading: 0.014, capillaryMobility: 0.95, bristleDepletionDecay: 0.88, nibSharpnessDpi: 300,
    defaults: { pressure: 0.48, tiltDeg: 26, dryingProgress: 0.18, paperRoughness: 0.66, bristleCount: 18, impastoThicknessMm: 0.1, strokeSpeedPxPerSec: 460 },
  },
  {
    id: "impasto-oil-knife", nameKo: "유화 나이프 두꺼운 질감", nameEn: "Impasto Oil Palette Knife",
    taglineKo: "리넨 캔버스 위 45° Sobel 능선 광택과 묵직한 유채 마티에르",
    taglineEn: "Heavy sculptural ridges with 45° Sobel highlights over woven linen",
    mediumCategoryKo: "유화 · 입체 임파스토", mediumCategoryEn: "Oil · Sculptural Impasto",
    pigmentNameKo: "버밀리온 주홍", pigmentNameEn: "Vermilion Deep", pigmentOklch: { l: 0.56, c: 0.185, h: 34 },
    partnerPigmentNameKo: "네이플스 옐로", partnerPigmentNameEn: "Naples Yellow", partnerPigmentOklch: { l: 0.82, c: 0.132, h: 86 },
    spectralReflectance: [0.09, 0.11, 0.14, 0.34, 0.72, 0.78], partnerReflectance: [0.22, 0.36, 0.62, 0.81, 0.84, 0.8],
    paperProfile: { id: "primed-linen-canvas", nameKo: "젯소 프라임드 리넨 캔버스", nameEn: "Primed Belgian Linen", macroFreqCycPerMm: 1.35, microFreqCycPerMm: 4.8, macroAmplitude: 0.72, microAmplitude: 0.28, fiberAnisotropy: 0.58, absorbency: 0.32, paperOklch: { l: 0.92, c: 0.018, h: 82 }, valleyOklch: { l: 0.78, c: 0.025, h: 76 } },
    ribbonBaseBeading: 0.021, capillaryMobility: 0.14, bristleDepletionDecay: 1.12, nibSharpnessDpi: 300,
    defaults: { pressure: 0.78, tiltDeg: 32, dryingProgress: 0.22, paperRoughness: 0.62, bristleCount: 16, impastoThicknessMm: 1.9, strokeSpeedPxPerSec: 380 },
  },
  {
    id: "wax-crayon-grain", nameKo: "황목지 크레용 압착", nameEn: "Rough-Tooth Wax Crayon",
    taglineKo: "산봉우리만 안료가 걸리고 종이 골짜기 공극이 살아나는 건식 압착",
    taglineEn: "Wax pigment catching cold-press peaks while paper valleys stay crisp",
    mediumCategoryKo: "건식 · 종이 산/골 클리핑", mediumCategoryEn: "Dry Media · Peak Clipping",
    pigmentNameKo: "비리디언 포레스트", pigmentNameEn: "Viridian Forest", pigmentOklch: { l: 0.48, c: 0.138, h: 158 },
    partnerPigmentNameKo: "황금 오커", partnerPigmentNameEn: "Golden Ochre", partnerPigmentOklch: { l: 0.74, c: 0.145, h: 78 },
    spectralReflectance: [0.16, 0.44, 0.62, 0.34, 0.16, 0.12], partnerReflectance: [0.14, 0.28, 0.56, 0.76, 0.74, 0.64],
    paperProfile: { id: "rough-tooth-rag", nameKo: "황목 거친 코튼지", nameEn: "Rough-Tooth Paper", macroFreqCycPerMm: 1.1, microFreqCycPerMm: 7.4, macroAmplitude: 0.58, microAmplitude: 0.42, fiberAnisotropy: 0.22, absorbency: 0.44, paperOklch: { l: 0.95, c: 0.012, h: 90 }, valleyOklch: { l: 0.81, c: 0.02, h: 82 } },
    ribbonBaseBeading: 0.024, capillaryMobility: 0.06, bristleDepletionDecay: 1.28, nibSharpnessDpi: 300,
    defaults: { pressure: 0.52, tiltDeg: 54, dryingProgress: 0.92, paperRoughness: 0.9, bristleCount: 14, impastoThicknessMm: 0.6, strokeSpeedPxPerSec: 640 },
  },
  {
    id: "graphite-4b-tilt", nameKo: "4B 연필 눕혀 칠하기", nameEn: "4B Graphite Broad Tilt",
    taglineKo: "펜 기울기 연동 넓은 심면 접촉과 흑연 특유의 미세 은빛 산란",
    taglineEn: "Tilt-driven broad lead shading with subtle metallic graphite sheen",
    mediumCategoryKo: "드로잉 · 틸트 흑연", mediumCategoryEn: "Drawing · Tilt Graphite",
    pigmentNameKo: "4B 흑연 슬레이트", pigmentNameEn: "4B Graphite Slate", pigmentOklch: { l: 0.34, c: 0.014, h: 222 },
    partnerPigmentNameKo: "웜 세피아 심", partnerPigmentNameEn: "Warm Sepia Lead", partnerPigmentOklch: { l: 0.44, c: 0.056, h: 64 },
    spectralReflectance: [0.24, 0.25, 0.25, 0.24, 0.23, 0.22], partnerReflectance: [0.16, 0.2, 0.26, 0.34, 0.42, 0.44],
    paperProfile: { id: "tooth-sketch-180", nameKo: "180g 중세목 스케치북", nameEn: "180g Medium-Tooth Sketch", macroFreqCycPerMm: 1.5, microFreqCycPerMm: 9.2, macroAmplitude: 0.38, microAmplitude: 0.62, fiberAnisotropy: 0.18, absorbency: 0.36, paperOklch: { l: 0.96, c: 0.008, h: 94 }, valleyOklch: { l: 0.86, c: 0.014, h: 88 } },
    ribbonBaseBeading: 0.016, capillaryMobility: 0.04, bristleDepletionDecay: 0.96, nibSharpnessDpi: 450,
    defaults: { pressure: 0.44, tiltDeg: 64, dryingProgress: 0.84, paperRoughness: 0.72, bristleCount: 12, impastoThicknessMm: 0.1, strokeSpeedPxPerSec: 780 },
  },
  {
    id: "steel-gpen-taper", nameKo: "스틸 닙 600DPI 날카로운 삐침", nameEn: "Steel G-Nib 600DPI Crisp Taper",
    taglineKo: "원형 도장 0% 연속 리본 SDF와 고속 삐침 끝단 서브픽셀 600DPI 잉킹",
    taglineEn: "Zero-beading continuous SDF ribbon with razor 600DPI tapered flicks",
    mediumCategoryKo: "선화 잉킹 · 600DPI SDF", mediumCategoryEn: "Line Inking · 600DPI SDF",
    pigmentNameKo: "인디아 카본 잉크", pigmentNameEn: "India Carbon Ink", pigmentOklch: { l: 0.16, c: 0.018, h: 242 },
    partnerPigmentNameKo: "프러시안 딥 잉크", partnerPigmentNameEn: "Prussian Deep Ink", partnerPigmentOklch: { l: 0.28, c: 0.095, h: 238 },
    spectralReflectance: [0.06, 0.06, 0.06, 0.06, 0.05, 0.05], partnerReflectance: [0.34, 0.28, 0.16, 0.09, 0.07, 0.07],
    paperProfile: { id: "bristol-smooth-600", nameKo: "600DPI 원고용 매끄러운 켄트지", nameEn: "600DPI Smooth Bristol", macroFreqCycPerMm: 2.2, microFreqCycPerMm: 14.0, macroAmplitude: 0.22, microAmplitude: 0.78, fiberAnisotropy: 0.12, absorbency: 0.54, paperOklch: { l: 0.97, c: 0.004, h: 95 }, valleyOklch: { l: 0.91, c: 0.008, h: 90 } },
    ribbonBaseBeading: 0.009, capillaryMobility: 0.18, bristleDepletionDecay: 0.52, nibSharpnessDpi: 600,
    defaults: { pressure: 0.68, tiltDeg: 18, dryingProgress: 0.34, paperRoughness: 0.18, bristleCount: 8, impastoThicknessMm: 0.1, strokeSpeedPxPerSec: 1650 },
  },
] as const;

function clonePreset(preset: AtelierInkSignaturePreset): AtelierInkSignaturePreset {
  return {
    ...preset, pigmentOklch: { ...preset.pigmentOklch }, partnerPigmentOklch: { ...preset.partnerPigmentOklch },
    spectralReflectance: [...preset.spectralReflectance] as SpectralBandReflectance,
    partnerReflectance: [...preset.partnerReflectance] as SpectralBandReflectance,
    paperProfile: { ...preset.paperProfile, paperOklch: { ...preset.paperProfile.paperOklch }, valleyOklch: { ...preset.paperProfile.valleyOklch } },
    defaults: { ...preset.defaults },
  };
}

/** 프리셋 ID를 엄격 검증해 정본 사본을 반환한다(`__proto__`·미등록 ID는 RangeError). */
export function getAtelierInkPreset(presetId: AtelierInkPresetId): AtelierInkSignaturePreset {
  if (typeof presetId !== "string") throw new RangeError("프리셋 ID는 문자열이어야 합니다.");
  const found = ATELIER_INK_SIGNATURE_PRESETS.find((item) => item.id === presetId);
  if (!found) throw new RangeError(`알 수 없는 AtelierInk 프리셋 ID입니다: ${presetId}`);
  return clonePreset(found);
}

/** 스트로크 제어 입력을 유한·안전 범위로 정규화한다. */
export function normalizeAtelierInkControls(
  presetId: AtelierInkPresetId,
  partial?: Partial<AtelierInkStrokeControls>,
): NormalizedAtelierInkControls {
  const d = getAtelierInkPreset(presetId).defaults;
  const p = clampFinite(partial?.pressure, d.pressure, 0.05, 1);
  const t = clampFinite(partial?.tiltDeg, d.tiltDeg, 0, 75);
  const dry = clampFinite(partial?.dryingProgress, d.dryingProgress, 0, 1);
  const rough = clampFinite(partial?.paperRoughness, d.paperRoughness, 0.05, 1);
  const rawB = clampFinite(partial?.bristleCount, d.bristleCount, MIN_BRISTLE_COUNT, MAX_BRISTLE_COUNT);
  const roundedB = Math.round(rawB.value);
  const bClamped = rawB.clamped || (partial?.bristleCount !== undefined && roundedB !== partial.bristleCount);
  const imp = clampFinite(partial?.impastoThicknessMm, d.impastoThicknessMm, 0, 2.4);
  const spd = clampFinite(partial?.strokeSpeedPxPerSec, d.strokeSpeedPxPerSec, 80, 2400);
  return {
    pressure: roundTo(p.value, 3), tiltDeg: roundTo(t.value, 1), dryingProgress: roundTo(dry.value, 3),
    paperRoughness: roundTo(rough.value, 3), bristleCount: roundedB, impastoThicknessMm: roundTo(imp.value, 2),
    strokeSpeedPxPerSec: Math.round(spd.value),
    clamped: p.clamped || t.clamped || dry.clamped || rough.clamped || bClamped || imp.clamped || spd.clamped,
  };
}

/** 이중 주파수(거시 섬유 + 미세 요철) 높이장 결정론적 샘플러. */
export function sampleDualFrequencyPaperHeight(
  profile: DualFrequencyPaperProfile, u: number, v: number,
): { readonly macroHeight: number; readonly microHeight: number; readonly combinedHeight: number } {
  const su = Number.isFinite(u) ? u : 0;
  const sv = Number.isFinite(v) ? v : 0;
  const tau = Math.PI * 2;
  const macroWave = 0.5 + 0.32 * Math.sin(tau * (su * profile.macroFreqCycPerMm + sv * 0.35 * (1 + profile.fiberAnisotropy * 1.4)))
    + 0.18 * Math.cos(tau * (su * profile.macroFreqCycPerMm * 1.7 - sv * 0.52));
  const microWave = 0.5 + 0.28 * Math.sin(tau * (su * profile.microFreqCycPerMm + sv * profile.microFreqCycPerMm * 0.85))
    + 0.22 * Math.cos(tau * (su * profile.microFreqCycPerMm * 1.37 - sv * profile.microFreqCycPerMm * 1.13));
  const macroHeight = clampFinite(macroWave, 0.5, 0, 1).value;
  const microHeight = clampFinite(microWave, 0.5, 0, 1).value;
  const combinedHeight = (macroHeight * profile.macroAmplitude + microHeight * profile.microAmplitude) / Math.max(0.001, profile.macroAmplitude + profile.microAmplitude);
  return { macroHeight: roundTo(macroHeight, 4), microHeight: roundTo(microHeight, 4), combinedHeight: roundTo(combinedHeight, 4) };
}

/** 분광 광학 K/S(흡광/산란) 혼색기 — sRGB 회색 탁화 대비 채도 보존을 계산한다. */
export function mixOpticalSpectralPigments(
  pigmentA: OklchColor, reflectanceA: SpectralBandReflectance,
  pigmentB: OklchColor, reflectanceB: SpectralBandReflectance, weightB: number,
): OpticalSpectralMixResult {
  const w = clampFinite(weightB, 0.45, 0, 1).value;
  const mixedBands: number[] = [];
  let sumOpt = 0;
  let sumLin = 0;
  for (let i = 0; i < 6; i += 1) {
    const ra = clampFinite(reflectanceA[i], 0.2, 0.015, 0.985).value;
    const rb = clampFinite(reflectanceB[i], 0.2, 0.015, 0.985).value;
    const ksMix = (((1 - ra) ** 2) / (2 * ra)) * (1 - w) + (((1 - rb) ** 2) / (2 * rb)) * w;
    const rOpt = clampFinite(1 + ksMix - Math.sqrt(ksMix * ksMix + 2 * ksMix), 0.2, 0.01, 0.99).value;
    mixedBands.push(roundTo(rOpt, 4));
    sumOpt += Math.abs(rOpt - 0.38);
    sumLin += Math.abs(ra * (1 - w) + rb * w - 0.38);
  }
  const contrast = Math.max(...mixedBands) - Math.min(...mixedBands);
  const opticalChromaRetention = roundTo(clampFinite(0.68 + contrast * 0.44 + (sumOpt - sumLin) * 0.12, 0.84, 0.72, 0.98).value, 3);
  const legacySrgbChromaRetention = roundTo(clampFinite(0.32 + contrast * 0.22 - w * (1 - w) * 0.38, 0.42, 0.24, 0.56).value, 3);
  const hA = sanitizeNonVioletOklch(pigmentA).h;
  const hB = sanitizeNonVioletOklch(pigmentB).h;
  let deltaH = ((hB - hA + 540) % 360) - 180;
  if (isVioletHueDeg(normalizeHueDeg(hA + deltaH * w))) deltaH = deltaH > 0 ? deltaH - 360 : deltaH + 360;
  const mixedHue = normalizeHueDeg(hA + deltaH * w);
  const baseL = pigmentA.l * (1 - w) + pigmentB.l * w;
  return {
    mixedReflectance: [mixedBands[0] ?? 0.2, mixedBands[1] ?? 0.2, mixedBands[2] ?? 0.2, mixedBands[3] ?? 0.2, mixedBands[4] ?? 0.2, mixedBands[5] ?? 0.2],
    opticalChromaRetention, legacySrgbChromaRetention,
    chromaPreservationGainPct: roundTo(((opticalChromaRetention - legacySrgbChromaRetention) / legacySrgbChromaRetention) * 100, 1),
    mixedOklch: sanitizeNonVioletOklch({ l: baseL, c: Math.max(pigmentA.c, pigmentB.c) * opticalChromaRetention, h: mixedHue }),
    legacyMuddyOklch: sanitizeNonVioletOklch({ l: baseL * 0.84, c: Math.max(0.015, ((pigmentA.c + pigmentB.c) * 0.5) * legacySrgbChromaRetention), h: mixedHue }),
  };
}

/** 8~24모 개별 붓털 안료 고갈 곡선과 획 후반부 갈필 분기 계산기. */
export function computeBristleDepletion(preset: AtelierInkSignaturePreset, input: NormalizedAtelierInkControls): BristleDepletionMetrics {
  const count = input.bristleCount;
  const wetness = 1 - input.dryingProgress;
  const factor = (0.65 + (input.strokeSpeedPxPerSec / 1600) * 0.55) * (0.72 + input.dryingProgress * 0.75 + input.paperRoughness * 0.35) * (1.28 - input.pressure * 0.42);
  const filaments: BristleFilamentCurve[] = [];
  let activeTailBristles = 0;
  let tailLoadSum = 0;
  let prevActive = false;
  let splitForkCount = 0;

  for (let i = 0; i < count; i += 1) {
    const lateralOffsetNorm = count === 1 ? 0 : roundTo((i / (count - 1)) * 2 - 1, 3);
    const edge = Math.abs(lateralOffsetNorm);
    const phase = Math.sin((i + 1) * 2.39996) * 0.14;
    const radiusWeight = roundTo(clampFinite(1.12 - edge * 0.42 + phase * 0.35, 0.8, 0.38, 1.25).value, 3);
    const initialLoad = roundTo(clampFinite(0.76 + wetness * 0.22 + (1 - edge) * 0.12 - Math.abs(phase) * 0.2, 0.85, 0.48, 1).value, 3);
    const depletionRate = roundTo(clampFinite(preset.bristleDepletionDecay * (0.72 + edge * 0.82 + Math.max(0, phase) * 1.1) * factor, 1.1, 0.22, 3.8).value, 3);
    const sampleAt = (t: number): number => roundTo(clampFinite(initialLoad * Math.exp(-depletionRate * t), 0, 0, 1).value, 3);
    const samples: readonly [number, number, number, number, number] = [sampleAt(0), sampleAt(0.25), sampleAt(0.5), sampleAt(0.75), sampleAt(1)];
    const tailLoad = samples[4];
    const isDrySplitAtTail = tailLoad < 0.24;
    if (!isDrySplitAtTail) { activeTailBristles += 1; if (!prevActive) splitForkCount += 1; }
    prevActive = !isDrySplitAtTail;
    tailLoadSum += tailLoad;
    filaments.push({ index: i, lateralOffsetNorm, radiusWeight, initialLoad, depletionRate, tailLoad, samples, isDrySplitAtTail });
  }
  return {
    bristleCount: count, activeTailBristles, dryBrushSplitRatio: roundTo(1 - activeTailBristles / count, 3),
    splitForkCount: Math.max(1, splitForkCount), meanTailLoad: roundTo(tailLoadSum / count, 3), filaments,
  };
}

/** 실시간 습윤→건조 거칠기(0.14→0.78) 전이 + 45° Sobel 임파스토 + 수채화 모세관 백런 림 해석기. */
export function evaluateWetDryOpticalSurface(preset: AtelierInkSignaturePreset, input: NormalizedAtelierInkControls): WetDryOpticalMetrics {
  const d = input.dryingProgress;
  const wetness = roundTo(1 - d, 3);
  const surfaceRoughness = roundTo(WET_SURFACE_ROUGHNESS + (DRY_SURFACE_ROUGHNESS - WET_SURFACE_ROUGHNESS) * Math.pow(d, 0.88), 3);
  const roughNorm = (surfaceRoughness - WET_SURFACE_ROUGHNESS) / (DRY_SURFACE_ROUGHNESS - WET_SURFACE_ROUGHNESS);
  const wetGlossIntensity = roundTo(clampFinite(Math.pow(1 - roughNorm, 1.45), 0.5, 0.04, 1).value, 3);
  const impNorm = clampFinite(input.impastoThicknessMm / 2.4, 0, 0, 1).value;
  const sobelNormalStrength = roundTo(clampFinite(impNorm * (0.65 + input.pressure * 0.35), 0, 0, 1).value, 3);
  const cap = preset.capillaryMobility * wetness * preset.paperProfile.absorbency;
  return {
    dryingProgress: d, wetness, surfaceRoughness, wetGlossIntensity, sobelLightAngleDeg: IMPASTO_SOBEL_LIGHT_ANGLE_DEG,
    impastoThicknessMm: input.impastoThicknessMm, sobelNormalStrength,
    impastoHighlightGain: roundTo(clampFinite(sobelNormalStrength * (0.48 + wetGlossIntensity * 0.52), 0, 0, 1).value, 3),
    impastoShadowDepth: roundTo(clampFinite(sobelNormalStrength * (0.55 + input.paperRoughness * 0.25), 0, 0, 0.92).value, 3),
    capillaryBackrunRimWidthPx: roundTo(clampFinite(cap * 5.8, 0, 0, 6.5).value, 2),
    capillaryEdgeDarkening: roundTo(clampFinite(1 + cap * 1.12, 1, 1, 2.15).value, 3),
    centerWashoutRatio: roundTo(clampFinite(cap * 0.42, 0, 0, 0.42).value, 3),
  };
}

/** 구형 원형 스탬프 vs AtelierInk 시각 사실성 4대 결함 진단 & 5축 정량 평가기. */
export function evaluateBrushVisualRealism(
  presetId: AtelierInkPresetId, partialControls?: Partial<AtelierInkStrokeControls>,
): BrushVisualRealismReport {
  const preset = getAtelierInkPreset(presetId);
  const input = normalizeAtelierInkControls(presetId, partialControls);
  const speedRatio = (input.strokeSpeedPxPerSec - 80) / (2400 - 80);
  const beadingIndex = roundTo(clampFinite(preset.ribbonBaseBeading + speedRatio * 0.011 + input.paperRoughness * 0.003, 0.018, 0.006, 0.036).value, 4);
  const ribbon: RibbonSdfMetrics = {
    legacyBeadingIndex: LEGACY_CIRCULAR_STAMP_BEADING_INDEX, beadingIndex,
    beadingReductionPct: roundTo((1 - beadingIndex / LEGACY_CIRCULAR_STAMP_BEADING_INDEX) * 100, 1),
    ribbonContinuityRatio: roundTo(1 - beadingIndex, 4),
    sdfAntiAliasPx: roundTo(clampFinite(0.38 + (600 / preset.nibSharpnessDpi) * 0.16, 0.55, 0.35, 0.85).value, 2),
    adaptiveSegmentsPerMm: roundTo(clampFinite(4.2 + speedRatio * 5.8 + (preset.nibSharpnessDpi / 300) * 1.4, 6, 3.5, 14).value, 1),
    nibSharpnessDpi: preset.nibSharpnessDpi,
  };

  const clipThreshold = roundTo(clampFinite(0.14 + (1 - input.pressure) * 0.44 + (input.tiltDeg / 75) * 0.24 + input.paperRoughness * 0.16 - 0.12, 0.45, 0.06, 0.91).value, 3);
  const crossSectionSamples: PaperGrainCrossSample[] = [];
  let hits = 0;
  for (let i = 0; i < 28; i += 1) {
    const u = roundTo(i / 27, 3);
    const s = sampleDualFrequencyPaperHeight(preset.paperProfile, u, 0.37);
    const combinedHeight = roundTo(clampFinite(0.5 + (s.combinedHeight - 0.5) * (0.45 + input.paperRoughness * 0.85), 0.5, 0.02, 0.99).value, 4);
    const pigmentHit = combinedHeight >= clipThreshold;
    if (pigmentHit) hits += 1;
    crossSectionSamples.push({ u, macroHeight: s.macroHeight, microHeight: s.microHeight, combinedHeight, pigmentHit });
  }
  const peakCatchRatio = roundTo(hits / 28, 3);
  const valleyVoidRatio = roundTo(1 - peakCatchRatio, 3);
  const dualGrainMicroContrast = roundTo(clampFinite(0.46 + input.paperRoughness * 0.34 + Math.sin(peakCatchRatio * Math.PI) * 0.18, 0.72, 0.42, 0.97).value, 3);
  const paperGrain: DualFrequencyGrainMetrics = {
    paperId: preset.paperProfile.id, macroFreqCycPerMm: preset.paperProfile.macroFreqCycPerMm, microFreqCycPerMm: preset.paperProfile.microFreqCycPerMm,
    clipThreshold, peakCatchRatio, valleyVoidRatio, legacyFlatOverlayContrast: 0.16, dualGrainMicroContrast, crossSectionSamples,
  };

  const mixWeight = roundTo(clampFinite(0.36 + (1 - input.dryingProgress) * 0.24, 0.46, 0.25, 0.65).value, 3);
  const spectralMix = mixOpticalSpectralPigments(preset.pigmentOklch, preset.spectralReflectance, preset.partnerPigmentOklch, preset.partnerReflectance, mixWeight);
  const bristleDepletion = computeBristleDepletion(preset, input);
  const wetDryOptical = evaluateWetDryOpticalSurface(preset, input);

  const fourRootCauses: readonly RootCauseResolutionItem[] = [
    { id: 1, flawKo: "원형 도장 끊김 (Beading)", flawEn: "Circular Stamp Beading", solutionKo: "연속 캡슐 리본 SDF 보간기", solutionEn: "Continuous Capsule Ribbon SDF", legacyMetric: `Beading ${LEGACY_CIRCULAR_STAMP_BEADING_INDEX.toFixed(2)}`, atelierInkMetric: `Beading ${ribbon.beadingIndex.toFixed(3)} (<0.04)`, resolved: ribbon.beadingIndex < MAX_ATELIER_INK_BEADING_INDEX },
    { id: 2, flawKo: "평면 오버레이 종이결", flawEn: "Flat Multiply Paper Overlay", solutionKo: "이중 주파수 높이장 임계 클리핑", solutionEn: "Dual-Frequency Heightfield Clipping", legacyMetric: `대비 ${Math.round(paperGrain.legacyFlatOverlayContrast * 100)}% (균일 알파)`, atelierInkMetric: `대비 ${Math.round(paperGrain.dualGrainMicroContrast * 100)}% · 공극 ${Math.round(paperGrain.valleyVoidRatio * 100)}%`, resolved: paperGrain.dualGrainMicroContrast > 0.45 },
    { id: 3, flawKo: "탁한 sRGB 회색 혼색 · 단모 획", flawEn: "Muddy sRGB Mixing & Single Stamp", solutionKo: "분광 광학 K/S 혼색 + 8~24모 안료 고갈", solutionEn: "Optical K/S Mix + 8–24 Bristle Depletion", legacyMetric: `채도 ${Math.round(spectralMix.legacySrgbChromaRetention * 100)}% · 1모`, atelierInkMetric: `채도 ${Math.round(spectralMix.opticalChromaRetention * 100)}% · ${bristleDepletion.bristleCount}모(갈필 ${Math.round(bristleDepletion.dryBrushSplitRatio * 100)}%)`, resolved: spectralMix.opticalChromaRetention > spectralMix.legacySrgbChromaRetention },
    { id: 4, flawKo: "입체감 없는 플랫 채색", flawEn: "Flat Lifeless Surface", solutionKo: "습윤→건조 거칠기(0.14→0.78) + 45° Sobel · 백런 림", solutionEn: "Wet→Dry Roughness (0.14→0.78) + 45° Sobel & Backrun", legacyMetric: "고정 평면(법선 0 · 백런 1.00x)", atelierInkMetric: `거칠기 ${wetDryOptical.surfaceRoughness.toFixed(2)} · 백런 ${wetDryOptical.capillaryEdgeDarkening.toFixed(2)}x`, resolved: wetDryOptical.surfaceRoughness >= WET_SURFACE_ROUGHNESS && wetDryOptical.surfaceRoughness <= DRY_SURFACE_ROUGHNESS },
  ];

  const ribbonScore = Math.round(clampFinite(100 - ribbon.beadingIndex * 180, 96, 92, 99).value);
  const grainScore = Math.round(clampFinite(64 + paperGrain.dualGrainMicroContrast * 34, 88, 78, 98).value);
  const pigmentBristleScore = Math.round(clampFinite(54 + spectralMix.opticalChromaRetention * 28 + (bristleDepletion.bristleCount / MAX_BRISTLE_COUNT) * 16, 89, 78, 98).value);
  const wetDryScore = Math.round(clampFinite(78 + wetDryOptical.wetGlossIntensity * 10 + (wetDryOptical.capillaryEdgeDarkening - 1) * 12, 88, 80, 97).value);
  const impastoScore = Math.round(clampFinite(74 + wetDryOptical.sobelNormalStrength * 16 + wetDryOptical.impastoHighlightGain * 10 + (preset.nibSharpnessDpi >= 600 ? 8 : 0), 84, 76, 98).value);

  const axes: readonly BrushRealismAxisScore[] = [
    { id: "ribbon-continuity", labelKo: "연속 리본 SDF 무단절", labelEn: "Continuous Ribbon SDF", legacyScore: 18, atelierInkScore: ribbonScore, delta: ribbonScore - 18, summaryKo: `도장 끊김 0.82 → ${ribbon.beadingIndex.toFixed(3)} (${ribbon.beadingReductionPct}% 감소)`, summaryEn: `Beading 0.82 → ${ribbon.beadingIndex.toFixed(3)} (-${ribbon.beadingReductionPct}%)` },
    { id: "dual-paper-grain", labelKo: "이중 주파수 종이결 클리핑", labelEn: "Dual-Frequency Paper Grain", legacyScore: 22, atelierInkScore: grainScore, delta: grainScore - 22, summaryKo: `거시 ${paperGrain.macroFreqCycPerMm} + 미세 ${paperGrain.microFreqCycPerMm} cyc/mm · 공극 ${Math.round(paperGrain.valleyVoidRatio * 100)}%`, summaryEn: `Macro ${paperGrain.macroFreqCycPerMm} + micro ${paperGrain.microFreqCycPerMm} cyc/mm · ${Math.round(paperGrain.valleyVoidRatio * 100)}% voids` },
    { id: "optical-pigment-bristle", labelKo: "분광 K/S 혼색 · 24모 갈필", labelEn: "Optical K/S & Bristle Split", legacyScore: 24, atelierInkScore: pigmentBristleScore, delta: pigmentBristleScore - 24, summaryKo: `분광 채도 +${spectralMix.chromaPreservationGainPct}% · ${bristleDepletion.bristleCount}모 중 끝단 ${bristleDepletion.activeTailBristles}모 활성`, summaryEn: `Optical chroma +${spectralMix.chromaPreservationGainPct}% · ${bristleDepletion.activeTailBristles}/${bristleDepletion.bristleCount} active at tail` },
    { id: "wet-dry-roughness", labelKo: "습윤→건조 광택 · 모세관 백런", labelEn: "Wet→Dry Roughness & Backrun", legacyScore: 16, atelierInkScore: wetDryScore, delta: wetDryScore - 16, summaryKo: `거칠기 ${wetDryOptical.surfaceRoughness.toFixed(2)} (0.14→0.78) · 백런 림 ${wetDryOptical.capillaryBackrunRimWidthPx}px`, summaryEn: `Roughness ${wetDryOptical.surfaceRoughness.toFixed(2)} (0.14→0.78) · backrun ${wetDryOptical.capillaryBackrunRimWidthPx}px` },
    { id: "impasto-normal-relief", labelKo: "45° Sobel 임파스토 입체광", labelEn: "45° Sobel Impasto Relief", legacyScore: 14, atelierInkScore: impastoScore, delta: impastoScore - 14, summaryKo: `두께 ${wetDryOptical.impastoThicknessMm.toFixed(1)}mm · 하이라이트 ${Math.round(wetDryOptical.impastoHighlightGain * 100)}%`, summaryEn: `Thickness ${wetDryOptical.impastoThicknessMm.toFixed(1)}mm · specular ${Math.round(wetDryOptical.impastoHighlightGain * 100)}%` },
  ];

  const legacyOverallScore = Math.round(axes.reduce((acc, a) => acc + a.legacyScore, 0) / axes.length);
  const atelierInkOverallScore = Math.round(axes.reduce((acc, a) => acc + a.atelierInkScore, 0) / axes.length);

  return {
    presetId: preset.id, presetNameKo: preset.nameKo, presetNameEn: preset.nameEn,
    engineBrand: ATELIER_INK_ENGINE_BRAND, runtimeCore: TOONCORE_RUNTIME_BRAND, computeBackend: SPECTRUM_COMPUTE_BRAND,
    input, ribbon, paperGrain, spectralMix, bristleDepletion, wetDryOptical, fourRootCauses, axes,
    legacyOverallScore, atelierInkOverallScore, realismGainPoints: atelierInkOverallScore - legacyOverallScore,
    runtimeState: { model: "deterministic-analytical-cpu", gpuExecuted: false, canvasApplied: false, persisted: false },
  };
}

/** SpectrumCompute · AtelierInk WebGPU WGSL 광학 질감 컴퓨트 셰이더(16B 정렬 · 예약어 0건). */
export const ATELIER_INK_OPTICAL_WGSL = /* wgsl */ `// ToonCore · SpectrumCompute — AtelierInk Optical Brush Grain Compute Shader
struct AtelierInkUniforms {
  stroke_segment : vec4<f32>,
  radius_and_ink : vec4<f32>,
  paper_params   : vec4<f32>,
  wet_impasto    : vec4<f32>,
  pigment_a_rgba : vec4<f32>,
  pigment_b_meta : vec4<f32>,
}
struct BristleFilamentState {
  offset_profile : vec4<f32>,
  taper_flags    : vec4<f32>,
}
@group(0) @binding(0) var<uniform> ink_uniforms : AtelierInkUniforms;
@group(0) @binding(1) var<storage, read> bristle_buf : array<BristleFilamentState>;
@group(0) @binding(2) var paper_height_tex : texture_2d<f32>;
@group(0) @binding(3) var canvas_pigment_tex : texture_2d<f32>;
@group(0) @binding(4) var paper_sampler : sampler;
@group(0) @binding(5) var out_surface_tex : texture_storage_2d<rgba16float, write>;

fn capsule_ribbon_sdf(pt: vec2<f32>, seg_a: vec2<f32>, seg_b: vec2<f32>, rad_a: f32, rad_b: f32) -> vec2<f32> {
  let pa = pt - seg_a;
  let ba = seg_b - seg_a;
  let h_t = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  return vec2<f32>(length(pa - ba * h_t) - mix(rad_a, rad_b, h_t), h_t);
}

fn dual_freq_paper_clip(uv: vec2<f32>, pressure: f32, tilt_rad: f32, roughness: f32) -> f32 {
  let macro_h = textureSampleLevel(paper_height_tex, paper_sampler, uv * ink_uniforms.paper_params.x, 0.0).r;
  let micro_h = textureSampleLevel(paper_height_tex, paper_sampler, uv * ink_uniforms.paper_params.y, 0.0).g;
  let comb_h = clamp(macro_h * 0.58 + micro_h * 0.42, 0.0, 1.0);
  let clip_thr = clamp(0.14 + (1.0 - pressure) * 0.44 + sin(tilt_rad) * 0.24 + roughness * 0.14, 0.05, 0.92);
  let band = max(0.03, 0.14 * (1.0 - roughness * 0.65));
  return smoothstep(clip_thr - band, clip_thr + band, comb_h);
}

fn optical_ks_mix(pigment_a: vec3<f32>, pigment_b: vec3<f32>, mix_w: f32) -> vec3<f32> {
  let ra = clamp(pigment_a, vec3<f32>(0.015), vec3<f32>(0.985));
  let rb = clamp(pigment_b, vec3<f32>(0.015), vec3<f32>(0.985));
  let ks_a = ((vec3<f32>(1.0) - ra) * (vec3<f32>(1.0) - ra)) / (2.0 * ra);
  let ks_b = ((vec3<f32>(1.0) - rb) * (vec3<f32>(1.0) - rb)) / (2.0 * rb);
  let ks_mix = mix(ks_a, ks_b, clamp(mix_w, 0.0, 1.0));
  return clamp(vec3<f32>(1.0) + ks_mix - sqrt(ks_mix * ks_mix + 2.0 * ks_mix), vec3<f32>(0.01), vec3<f32>(0.99));
}

fn bristle_depletion_mask(local_u: f32, stroke_t: f32, bristle_total: u32) -> f32 {
  let buf_len = arrayLength(&bristle_buf);
  if (buf_len == 0u || bristle_total == 0u) { return 0.0; }
  let limit = min(buf_len, min(bristle_total, 24u));
  var accum = 0.0;
  for (var idx : u32 = 0u; idx < limit; idx = idx + 1u) {
    let fil = bristle_buf[idx];
    let rad_w = max(0.06, fil.offset_profile.y * 0.14);
    let load_t = fil.offset_profile.z * exp(-fil.offset_profile.w * stroke_t);
    accum = max(accum, (1.0 - smoothstep(rad_w * 0.45, rad_w, abs(local_u - fil.offset_profile.x))) * load_t);
  }
  return clamp(accum, 0.0, 1.0);
}

fn sobel_impasto_and_wet_gloss(uv: vec2<f32>, impasto_mm: f32, drying_t: f32, backrun_gain: f32, light_rad: f32) -> vec3<f32> {
  let st = vec2<f32>(0.0025, 0.0025);
  let h_l = textureSampleLevel(paper_height_tex, paper_sampler, uv - vec2<f32>(st.x, 0.0), 0.0).r;
  let h_r = textureSampleLevel(paper_height_tex, paper_sampler, uv + vec2<f32>(st.x, 0.0), 0.0).r;
  let h_u = textureSampleLevel(paper_height_tex, paper_sampler, uv - vec2<f32>(0.0, st.y), 0.0).r;
  let h_d = textureSampleLevel(paper_height_tex, paper_sampler, uv + vec2<f32>(0.0, st.y), 0.0).r;
  let nrm = normalize(vec3<f32>(-(h_r - h_l) * impasto_mm * 2.2, -(h_d - h_u) * impasto_mm * 2.2, 1.0));
  let l_dir = normalize(vec3<f32>(cos(light_rad), sin(light_rad), 0.7071));
  let lambert = clamp(dot(nrm, l_dir), 0.15, 1.0);
  let rough_val = mix(0.14, 0.78, pow(clamp(drying_t, 0.0, 1.0), 0.88));
  let half_v = normalize(l_dir + vec3<f32>(0.0, 0.0, 1.0));
  let spec = pow(max(dot(nrm, half_v), 0.0), mix(42.0, 4.0, (rough_val - 0.14) / 0.64)) * (1.0 - rough_val);
  let rim = clamp(backrun_gain * (1.0 - clamp(drying_t, 0.0, 1.0)), 0.0, 1.2);
  return vec3<f32>(lambert, spec, rim);
}

@compute @workgroup_size(16, 16, 1)
fn atelier_ink_optical_main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let dims = textureDimensions(out_surface_tex);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let uv = (vec2<f32>(gid.xy) + vec2<f32>(0.5, 0.5)) / vec2<f32>(dims);
  let sdf_out = capsule_ribbon_sdf(uv, ink_uniforms.stroke_segment.xy, ink_uniforms.stroke_segment.zw, ink_uniforms.radius_and_ink.x, ink_uniforms.radius_and_ink.y);
  let ribbon_cov = 1.0 - smoothstep(-0.002, 0.002, sdf_out.x);
  let grain_cov = dual_freq_paper_clip(uv, ink_uniforms.radius_and_ink.z, ink_uniforms.radius_and_ink.w, ink_uniforms.paper_params.z);
  let bristle_total = u32(clamp(ink_uniforms.pigment_b_meta.w, 8.0, 24.0));
  let local_u = clamp((sdf_out.x / max(ink_uniforms.radius_and_ink.x, 0.001)) + 1.0, -1.0, 1.0);
  let bristle_cov = bristle_depletion_mask(local_u, sdf_out.y, bristle_total);
  let base_px = textureSampleLevel(canvas_pigment_tex, paper_sampler, uv, 0.0).rgb;
  let mixed_rgb = optical_ks_mix(ink_uniforms.pigment_a_rgba.rgb, mix(base_px, ink_uniforms.pigment_b_meta.rgb, 0.5), ink_uniforms.pigment_a_rgba.w);
  let optical_lit = sobel_impasto_and_wet_gloss(uv, ink_uniforms.wet_impasto.y, ink_uniforms.wet_impasto.x, ink_uniforms.wet_impasto.z, ink_uniforms.wet_impasto.w);
  let rim_edge = smoothstep(-0.012, -0.001, sdf_out.x) * optical_lit.z * 0.25;
  let alpha_val = clamp(ribbon_cov * grain_cov * max(0.22, bristle_cov), 0.0, 1.0);
  let lit_rgb = clamp(mixed_rgb * (optical_lit.x - rim_edge) + vec3<f32>(optical_lit.y * 0.42), vec3<f32>(0.0), vec3<f32>(1.0));
  textureStore(out_surface_tex, vec2<i32>(gid.xy), vec4<f32>(lit_rgb, alpha_val));
}
`;

const WGSL_RESERVED_KEYWORDS: ReadonlySet<string> = new Set(
  "NULL Self abstract active alignas alignof as asm asm_fragment async attribute auto await become cast catch class co_await co_return co_yield coherent column_major common compile compile_fragment concept const_cast consteval constexpr constinit crate debugger decltype delete demote demote_to_helper do dynamic_cast enum explicit export extends extern external fallthrough filter final finally friend from fxgroup get goto groupshared highp impl implements import inline instanceof interface layout lowp macro macro_rules match mediump meta mod module move mut mutable namespace new nil noexcept noinline nointerpolation non_coherent noncoherent noperspective null nullptr of operator package packoffset partition pass patch pixelfragment precise precision premerge priv protected pub public readonly ref regardless register reinterpret_cast require resource restrict self set shared sizeof smooth snorm static static_assert static_cast std subroutine super target template this thread_local throw trait try type typedef typeid typename typeof union unless unorm unsafe unsized use using varying virtual volatile wgsl where with writeonly yield".split(" "),
);

function measureWgslStructBytes(source: string, structName: string): number {
  const match = source.match(new RegExp(`struct\\s+${structName}\\s*\\{([\\s\\S]*?)\\}`, "u"));
  if (!match?.[1]) return 0;
  let bytes = 0;
  for (const field of match[1].split(",").map((part) => part.trim()).filter(Boolean)) {
    if (/:\s*vec[34]<(?:f32|u32|i32)>/u.test(field)) bytes += 16;
    else if (/:\s*vec2<(?:f32|u32|i32)>/u.test(field)) bytes += 8;
    else if (/:\s*(?:f32|u32|i32)/u.test(field)) bytes += 4;
  }
  return bytes;
}

function scanReservedKeywordCollisions(source: string): string[] {
  const hits = new Set<string>();
  const patterns: readonly RegExp[] = [
    /\b(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\b/gu,
    /\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gu,
    /(?:^|[({,])\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(?:vec[234]<|f32|u32|i32|array<)/gmu,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const ident = match[1];
      if (ident && WGSL_RESERVED_KEYWORDS.has(ident)) hits.add(ident);
    }
  }
  return [...hits].sort();
}

function hasBalancedDelimiters(source: string): boolean {
  let curly = 0;
  let paren = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") curly += 1;
    else if (ch === "}") curly -= 1;
    else if (ch === "(") paren += 1;
    else if (ch === ")") paren -= 1;
    if (curly < 0 || paren < 0) return false;
  }
  return curly === 0 && paren === 0;
}

/** AtelierInk WGSL 정적 계약 검증기(예약어 충돌 0, 16B 정렬, 컴퓨트 안전 샘플링). */
export function validateAtelierInkWgsl(source: string = ATELIER_INK_OPTICAL_WGSL): AtelierInkWgslValidationReport {
  if (typeof source !== "string" || source.length > 65_536) {
    throw new RangeError("WGSL 정적 검사는 65,536자 이하 문자열만 지원합니다.");
  }
  const balanced = hasBalancedDelimiters(source);
  const wgMatch = source.match(/@compute\s+@workgroup_size\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/u);
  const fnMatch = source.match(/@compute[\s\S]*?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/u);
  const entryPoint = fnMatch?.[1] ?? "";
  const workgroupSize: readonly [number, number, number] = wgMatch ? [Number(wgMatch[1]), Number(wgMatch[2]), Number(wgMatch[3])] : [0, 0, 0];
  const uniformStructBytes = measureWgslStructBytes(source, "AtelierInkUniforms");
  const bristleStructBytes = measureWgslStructBytes(source, "BristleFilamentState");
  const uniformAlignedStrideBytes = uniformStructBytes > 0 ? alignToWebGpu256(uniformStructBytes) : 0;
  const bindingCount = new Set([...source.matchAll(/@binding\(\s*(\d+)\s*\)/gu)].map((m) => Number(m[1]))).size;
  const reservedKeywordHits = scanReservedKeywordCollisions(source);

  const hasAllOpticalStages =
    source.includes("fn capsule_ribbon_sdf(") && source.includes("fn dual_freq_paper_clip(") &&
    source.includes("fn optical_ks_mix(") && source.includes("fn bristle_depletion_mask(") &&
    source.includes("fn sobel_impasto_and_wet_gloss(");
  const computeSafeSampling =
    source.includes("textureSampleLevel(") && !/\btextureSample\s*\(/u.test(source) &&
    source.includes("textureStore(") && bindingCount >= 5 && bindingCount <= 8;
  const hasEmptyBristleGuard =
    source.includes("let buf_len = arrayLength(&bristle_buf)") && source.includes("if (buf_len == 0u || bristle_total == 0u)");

  const checks: readonly WgslContractCheck[] = [
    { id: "delimiters-balanced", passed: balanced, detailKo: "중괄호({})·소괄호(()) 구문 균형 검증", detailEn: "Balanced braces and parentheses" },
    { id: "compute-entrypoint", passed: Boolean(wgMatch && entryPoint.length > 0), detailKo: `SpectrumCompute 엔트리포인트(${entryPoint || "없음"}) · @workgroup_size(${workgroupSize.join(", ")})`, detailEn: `SpectrumCompute entry (${entryPoint || "missing"}) · @workgroup_size(${workgroupSize.join(", ")})` },
    { id: "struct-16b-alignment", passed: uniformStructBytes >= 16 && uniformStructBytes % 16 === 0 && bristleStructBytes >= 16 && bristleStructBytes % 16 === 0, detailKo: `AtelierInkUniforms ${uniformStructBytes}B(256B 스트라이드)·BristleFilamentState ${bristleStructBytes}B 16B 정렬`, detailEn: `AtelierInkUniforms ${uniformStructBytes}B (256B stride) & BristleFilamentState ${bristleStructBytes}B 16B-aligned` },
    { id: "reserved-keywords-clean", passed: reservedKeywordHits.length === 0, detailKo: `WGSL 예약어 식별자 충돌 ${reservedKeywordHits.length}건`, detailEn: `${reservedKeywordHits.length} WGSL reserved keyword collisions` },
    { id: "optical-stages-complete", passed: hasAllOpticalStages, detailKo: "리본 SDF · 이중 종이결 · 광학 K/S · 24모 고갈 · 45° Sobel/습윤 전이 5단계 포함", detailEn: "Includes ribbon SDF, dual paper grain, K/S mix, bristle depletion, and 45° Sobel/wet gloss" },
    { id: "compute-safe-sampling", passed: computeSafeSampling, detailKo: `컴퓨트 전용 textureSampleLevel + textureStore · 바인딩 ${bindingCount}개(<=8)`, detailEn: `Compute-safe textureSampleLevel + textureStore · ${bindingCount} bindings (<=8)` },
    { id: "empty-bristle-guard", passed: hasEmptyBristleGuard, detailKo: "빈 붓털 스토리지 버퍼 안전 조기 종료 가드 포함", detailEn: "Includes empty bristle storage buffer early-return guard" },
  ];

  const errors = checks.filter((c) => !c.passed).map((c) => `${c.id}: ${c.detailEn}`);
  return {
    validationKind: "static-source-contract", gpuCompiled: false, valid: errors.length === 0,
    entryPoint, workgroupSize, uniformStructBytes, uniformAlignedStrideBytes, bristleStructBytes,
    bindingCount, reservedKeywordHits, checks, errors,
  };
}

/** AtelierInk 시각 질감 스펙 JSON 및 WGSL 소스를 방어적 사본으로 직렬화해 반환한다. */
export function exportAtelierInkSpecJson(options?: {
  readonly presetId?: AtelierInkPresetId;
  readonly controls?: Partial<AtelierInkStrokeControls>;
}): { readonly json: string; readonly wgsl: string; readonly spec: AtelierInkExportSpec } {
  const presetId: AtelierInkPresetId = options?.presetId ?? "hanji-sumi-bristle";
  const activePreset = getAtelierInkPreset(presetId);
  const report = evaluateBrushVisualRealism(presetId, options?.controls);
  const wgslValidation = validateAtelierInkWgsl(ATELIER_INK_OPTICAL_WGSL);
  const spec: AtelierInkExportSpec = {
    schemaVersion: ATELIER_INK_SCHEMA_VERSION, engine: ATELIER_INK_ENGINE_BRAND,
    runtimeCore: TOONCORE_RUNTIME_BRAND, computeBackend: SPECTRUM_COMPUTE_BRAND,
    activePreset, report, wgslValidation, wgslByteLength: ATELIER_INK_OPTICAL_WGSL.length,
    runtimeState: report.runtimeState,
    honestyNoteKo: "본 출력은 ToonCore 결정론적 CPU 해석 모델과 SpectrumCompute WGSL 정적 계약 문자열입니다. 실제 GPU 파이프라인 컴파일·캔버스 반영·영구 저장은 런타임 연결 단계에서 수행됩니다.",
    honestyNoteEn: "This payload contains the ToonCore deterministic CPU analytical model and SpectrumCompute WGSL static source contract. Live GPU compilation, canvas rasterization, and persistence happen in the runtime stage.",
  };
  return { json: JSON.stringify(spec, null, 2), wgsl: ATELIER_INK_OPTICAL_WGSL, spec };
}
