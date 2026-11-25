/**
 * Wave 66B — AtelierInk Ultra 극한 브러시 질감 물리 & ToonSilicon 최신 CPU 명령어 세트(ISA) 매트릭스 엔진.
 *
 * - 100% ToonStudio 고유 브랜드(AtelierInk Ultra · ToonSilicon · ToonCore)
 * - 5대 파이프라인: 듀얼 팁 4종 결합 · 더티 브러시 안료 픽업 · 모세관 종이 섬유 번짐 & 백런 링 ·
 *   동적 강모 갈라짐 & 임파스토 골짜기 광택 · 5축 실물 화구 비교 & WGSL 듀얼팁 컴퓨트 셰이더
 * - CPU ISA 매트릭스: 브라우저 웹 표준(WASM SIMD128 · Relaxed-SIMD · WASM64 · SAB+Atomics.waitAsync · 64B SoA) vs
 *   네이티브 FFI 브리지(Intel AMX · AVX-512 FP16/BF16/VNNI · AMD Zen5 512-bit · Apple AMX/ARMv9 SME · ARM SVE2/I8MM)
 * - 허위 실측 배수·GFLOPS 0건, 원시 hex/rgb/hsl 0건, 바이올렛 휴(265~325°) 0%, Web Storage·BigInt 0건.
 */

import { serializeIsaDispatchPlan, withIsaExecutionEvidence, type IsaDispatchExportPlan, type IsaPlanEvidenceFields } from "./isa-execution-evidence";

export const ATELIER_ISA_BRUSH_SCHEMA_VERSION = "toonstudio.atelier-isa-brush-ultra.v1" as const;
export const ATELIER_INK_ULTRA_BRAND = "AtelierInk Ultra" as const;
export const TOON_SILICON_BRAND = "ToonSilicon" as const;
export const TOON_CORE_BRAND = "ToonCore" as const;
export const ARCHITECTURE_MODEL_KIND = "cpu-isa-and-brush-optics-architecture" as const;

export const VIOLET_HUE_MIN_DEG = 265 as const;
export const VIOLET_HUE_MAX_DEG = 325 as const;
export const CACHE_LINE_BYTES = 64 as const;
export const F32_BYTES = 4 as const;
export const F32_LANES_PER_CACHE_LINE = 16 as const;
export const WET_GLOSS_ROUGHNESS = 0.14 as const;
export const DRY_MATTE_ROUGHNESS = 0.8 as const;

export type DualTipBlendMode = "multiply" | "subtract" | "height-clip" | "color-dodge";
export type PaperFiberProfileId = "hanji-mulberry" | "cotton-coldpress-300" | "hotpress-satin" | "linen-primed";
export type UltraBrushComparisonAxisId =
  | "stroke-continuity" | "paper-response" | "pickup-naturalness" | "dry-fork-detail" | "impasto-sheen";
export type CpuIsaArchFamily = "x86-64" | "arm64" | "wasm-portable";
export type ExecutionBoundary = "browser-web-standard" | "native-ffi-bridge";
export type CpuIsaProfileId =
  | "browser-portable-wasm-relaxed" | "x86-intel-amx-avx512" | "x86-amd-zen5-avx512"
  | "arm64-apple-amx-sme" | "arm64-snapdragon-sve2" | "arm64-tensor-neon-i8mm";
export type ToonStudioKernelId =
  | "km16-spectral-mix" | "bristle-24-integrator" | "hiz-4wide-culling"
  | "int8-npu-assist-infer" | "rle-delta-tile-compress" | "ribbon-600dpi-raster";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export interface PaperFiberSpec {
  readonly id: PaperFiberProfileId; readonly nameKo: string; readonly nameEn: string;
  readonly baseAnisotropy: number; readonly capillaryAbsorbency: number; readonly grainRelief: number;
  readonly paperOklch: OklchColor; readonly valleyOklch: OklchColor;
}
export interface UltraBrushOpticsInput {
  readonly dualTipMode?: DualTipBlendMode; readonly secondaryGrainScale?: number;
  readonly secondaryContrast?: number; readonly secondaryRotationJitterDeg?: number;
  readonly pickupPct?: number; readonly dilutionPct?: number;
  readonly brushPigmentOklch?: OklchColor; readonly canvasUnderColorOklch?: OklchColor;
  readonly paperFiberId?: PaperFiberProfileId; readonly capillaryBleedPct?: number;
  readonly fiberAnisotropy?: number; readonly pressure?: number; readonly tiltDeg?: number;
  readonly strokeSpeedPxPerSec?: number; readonly dryingProgress?: number;
  readonly impastoDepthMm?: number; readonly bristleCount?: number; readonly forkSensitivity?: number;
}
export interface NormalizedUltraBrushInput {
  readonly dualTipMode: DualTipBlendMode; readonly secondaryGrainScale: number;
  readonly secondaryContrast: number; readonly secondaryRotationJitterDeg: number;
  readonly pickupPct: number; readonly dilutionPct: number;
  readonly brushPigmentOklch: OklchColor; readonly canvasUnderColorOklch: OklchColor;
  readonly paperFiberId: PaperFiberProfileId; readonly capillaryBleedPct: number;
  readonly fiberAnisotropy: number; readonly pressure: number; readonly tiltDeg: number;
  readonly strokeSpeedPxPerSec: number; readonly dryingProgress: number;
  readonly impastoDepthMm: number; readonly bristleCount: number; readonly forkSensitivity: number;
  readonly clamped: boolean;
}
export interface DualTipSamplePoint {
  readonly u: number; readonly primaryTip: number; readonly secondaryGrain: number; readonly modulated: number;
}
export interface DualTipModulationResult {
  readonly stageId: "dual-tip-modulation"; readonly mode: DualTipBlendMode;
  readonly secondaryGrainScale: number; readonly secondaryContrast: number; readonly rotationJitterDeg: number;
  readonly patternRepeatRate: number; readonly legacyStampRepeatRate: number;
  readonly effectiveCoverage: number; readonly peakHighlightRatio: number; readonly valleyVoidRatio: number;
  readonly samples: readonly DualTipSamplePoint[];
}
export interface DirtyPickupTrailSample {
  readonly t: number; readonly canvasShare: number; readonly effectiveOpacity: number; readonly blendedOklch: OklchColor;
}
export interface DirtyBrushPickupResult {
  readonly stageId: "dirty-brush-pickup"; readonly pickupPct: number; readonly dilutionPct: number;
  readonly brushPigmentOklch: OklchColor; readonly canvasUnderColorOklch: OklchColor; readonly finalMixedOklch: OklchColor;
  readonly canvasTransferRatio: number; readonly effectiveOpacity: number; readonly washTransparency: number;
  readonly chromaRetention: number; readonly gradientSmoothness: number;
  readonly trailSamples: readonly DirtyPickupTrailSample[];
}
export interface CapillarySeepageVector { readonly angleDeg: number; readonly reachPx: number; readonly edgeDensity: number; }
export interface CapillaryFiberBleedResult {
  readonly stageId: "capillary-fiber-bleed"; readonly paperFiberId: PaperFiberProfileId;
  readonly paperNameKo: string; readonly paperNameEn: string;
  readonly capillaryBleedPct: number; readonly fiberAnisotropy: number;
  readonly parallelBleedMm: number; readonly perpendicularBleedMm: number; readonly anisotropyRatio: number;
  readonly backrunRingWidthPx: number; readonly edgePigmentConcentration: number;
  readonly centerWashoutRatio: number; readonly featheringStrength: number;
  readonly seepageVectors: readonly CapillarySeepageVector[];
}
export interface BristleForkCluster {
  readonly clusterIndex: number; readonly lateralOffsetNorm: number;
  readonly bristleShare: number; readonly tailReachRatio: number; readonly wetSheenFactor: number;
}
export interface BristleForkingImpastoResult {
  readonly stageId: "bristle-forking-impasto"; readonly forkThresholdExceeded: boolean;
  readonly forkDrive: number; readonly forkClusterCount: 1 | 2 | 3 | 4; readonly dryBrushGapRatio: number;
  readonly surfaceRoughness: number; readonly wetGlossIntensity: number; readonly valleySpecularSheen: number;
  readonly impastoDepthMm: number; readonly ridgeSobelContrast: number;
  readonly forkClusters: readonly BristleForkCluster[];
}
export interface UltraBrushOpticsReport {
  readonly modelKind: typeof ARCHITECTURE_MODEL_KIND; readonly engineBrand: typeof ATELIER_INK_ULTRA_BRAND;
  readonly runtimeBrand: typeof TOON_CORE_BRAND; readonly input: NormalizedUltraBrushInput;
  readonly paperSpec: PaperFiberSpec; readonly dualTip: DualTipModulationResult;
  readonly dirtyPickup: DirtyBrushPickupResult; readonly capillaryBleed: CapillaryFiberBleedResult;
  readonly bristleForking: BristleForkingImpastoResult;
}
export interface UltraBrushComparisonAxis {
  readonly id: UltraBrushComparisonAxisId; readonly labelKo: string; readonly labelEn: string;
  readonly standardScore: number; readonly ultraScore: number; readonly delta: number;
  readonly summaryKo: string; readonly summaryEn: string;
}
export interface StandardVsUltraComparisonReport {
  readonly modelKind: typeof ARCHITECTURE_MODEL_KIND; readonly axes: readonly UltraBrushComparisonAxis[];
  readonly standardOverall: number; readonly ultraOverall: number; readonly overallDelta: number;
}
export interface DualTipWgslValidationReport {
  readonly validationKind: "static-source-contract"; readonly gpuCompiled: false; readonly valid: boolean;
  readonly entryPoint: string; readonly workgroupSize: readonly [number, number, number];
  readonly uniformStructBytes: number; readonly uniformAlignedStrideBytes: number; readonly forkStructBytes: number;
  readonly bindingCount: number; readonly allFourDualTipModesPresent: boolean;
  readonly reservedKeywordHits: readonly string[]; readonly errors: readonly string[];
}
export interface BrowserIsaCapabilities {
  readonly simd128?: boolean; readonly relaxedSimd?: boolean; readonly memory64?: boolean;
  readonly sharedArrayBuffer?: boolean; readonly atomicsWaitAsync?: boolean; readonly hardwareConcurrency?: number;
}
export interface CpuIsaProfileSpec {
  readonly id: CpuIsaProfileId; readonly archFamily: CpuIsaArchFamily;
  readonly labelKo: string; readonly labelEn: string; readonly siliconScopeKo: string; readonly siliconScopeEn: string;
  readonly browserWasmPath: string; readonly browserJitLowering: string; readonly browserJitEngines: readonly string[];
  readonly nativeFfiIsaSet: readonly string[]; readonly browserVectorBits: 128; readonly nativeVectorBits: 128 | 256 | 512;
  readonly matrixExtension: string; readonly nativeFfiRequiredForFullIsa: boolean;
}
export interface CpuIsaKernelSpec {
  readonly id: ToonStudioKernelId; readonly nameKo: string; readonly nameEn: string;
  readonly domainStageKo: string; readonly domainStageEn: string;
  readonly browserWasmInstructions: readonly string[]; readonly x86NativeInstructions: readonly string[];
  readonly arm64NativeInstructions: readonly string[]; readonly soaElementCount: number; readonly soaAttributeCount: number;
  readonly memoryPatternKo: string; readonly memoryPatternEn: string;
}
export interface SoaCacheLineChannelLayout {
  readonly channelName: string; readonly logicalElements: number; readonly paddedElements: number;
  readonly byteStride: number; readonly cacheLines: number; readonly alignedTo64B: boolean;
}
export interface SoaCacheLineLayoutReport {
  readonly cacheLineBytes: typeof CACHE_LINE_BYTES; readonly f32LanesPerCacheLine: typeof F32_LANES_PER_CACHE_LINE;
  readonly channels: readonly SoaCacheLineChannelLayout[]; readonly totalBytes: number; readonly totalCacheLines: number;
  readonly allAlignedTo64B: boolean; readonly falseSharingPaddingBytes: number; readonly aosWastedBytesPerVectorLoad: number;
}
export interface ResolvedKernelIsaDispatch {
  readonly kernelId: ToonStudioKernelId; readonly nameKo: string; readonly nameEn: string;
  readonly domainStageKo: string; readonly domainStageEn: string; readonly activeBoundary: ExecutionBoundary;
  readonly activeInstructions: readonly string[]; readonly browserLoweringSummary: string;
  readonly plannedBoundary: ExecutionBoundary; readonly plannedInstructions: readonly string[];
  readonly vectorLaneWidthF32: number; readonly vectorLaneWidthI8: number;
  readonly soaAlignedBytes: number; readonly soaCacheLines: number;
}
/** active* 및 기존 메모리·스레드 값은 실행 상태가 아닌 계획 호환 별칭이다. */
export interface CpuIsaDispatchPlan extends IsaPlanEvidenceFields {
  readonly modelKind: typeof ARCHITECTURE_MODEL_KIND; readonly siliconBrand: typeof TOON_SILICON_BRAND;
  readonly runtimeBrand: typeof TOON_CORE_BRAND; readonly profile: CpuIsaProfileSpec;
  readonly requestedBoundary: ExecutionBoundary; readonly activeBoundary: ExecutionBoundary;
  readonly browserImmediateReady: boolean; readonly nativeBridgeRequired: boolean;
  readonly activeWasmStack: readonly string[];
  readonly memoryAddressingMode: "wasm64-memory64" | "wasm32-tiled-fallback";
  readonly threadSyncMode: "sab-atomics-wait-async" | "transferable-worker-fallback";
  readonly workerPoolSlots: number; readonly soaLayout: SoaCacheLineLayoutReport;
  readonly kernelDispatches: readonly ResolvedKernelIsaDispatch[];
  readonly honestyNoteKo: string; readonly honestyNoteEn: string;
}
export interface AtelierIsaBrushExportPayload {
  readonly schemaVersion: typeof ATELIER_ISA_BRUSH_SCHEMA_VERSION; readonly modelKind: typeof ARCHITECTURE_MODEL_KIND;
  readonly brands: {
    readonly brush: typeof ATELIER_INK_ULTRA_BRAND;
    readonly silicon: typeof TOON_SILICON_BRAND;
    readonly runtime: typeof TOON_CORE_BRAND;
  };
  readonly optics: UltraBrushOpticsReport; readonly comparison: StandardVsUltraComparisonReport;
  readonly isaDispatch: IsaDispatchExportPlan; readonly wgslValidation: DualTipWgslValidationReport;
  readonly executionEvidence: CpuIsaDispatchPlan["executionEvidence"];
  readonly wgslByteLength: number; readonly honestyNoteKo: string; readonly honestyNoteEn: string;
}

const DUAL_TIP_MODES: readonly DualTipBlendMode[] = ["multiply", "subtract", "height-clip", "color-dodge"];
const DEFAULT_BRUSH_PIGMENT: OklchColor = { l: 0.48, c: 0.165, h: 34 };
const DEFAULT_CANVAS_UNDER_COLOR: OklchColor = { l: 0.66, c: 0.132, h: 196 };

function roundTo(value: number, digits: number): number { const f = 10 ** digits; return Math.round(value * f) / f; }
function clampFinite(value: number | undefined, fallback: number, min: number, max: number): { value: number; clamped: boolean } {
  if (value === undefined) return { value: fallback, clamped: false };
  if (!Number.isFinite(value)) return { value: fallback, clamped: true };
  if (value < min) return { value: min, clamped: true };
  if (value > max) return { value: max, clamped: true };
  return { value, clamped: false };
}
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / Math.max(0.0001, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
function normalizeHueDeg(hue: number): number { const m = Number.isFinite(hue) ? hue % 360 : 0; return m < 0 ? m + 360 : m; }

/** 265~325° 바이올렛 휴 대역 여부를 판정한다. */
export function isVioletHueDeg(hue: number): boolean {
  const h = normalizeHueDeg(hue);
  return h >= VIOLET_HUE_MIN_DEG && h <= VIOLET_HUE_MAX_DEG;
}

/** 바이올렛 대역(265~325°)이 들어오면 안전한 코발트(232°)·카민(346°)으로 자동 보정한다. */
export function sanitizeNonVioletOklch(color: OklchColor): OklchColor {
  const l = clampFinite(color.l, 0.5, 0.06, 0.98).value;
  const c = clampFinite(color.c, 0.1, 0, 0.28).value;
  const rawH = normalizeHueDeg(color.h);
  const h = isVioletHueDeg(rawH) ? (rawH < 295 ? 232 : 346) : rawH;
  return { l: roundTo(l, 3), c: roundTo(c, 3), h: roundTo(h, 1) };
}

/** OKLCH 색상을 비바이올렛 CSS `oklch(...)` 문자열로 직렬화한다. */
export function formatOklch(color: OklchColor, alpha?: number): string {
  const safe = sanitizeNonVioletOklch(color);
  if (alpha === undefined) return `oklch(${safe.l} ${safe.c} ${safe.h})`;
  return `oklch(${safe.l} ${safe.c} ${safe.h} / ${roundTo(clampFinite(alpha, 1, 0, 1).value, 3)})`;
}

/** WebGPU uniform 버퍼 256B 동적 오프셋 정렬을 계산한다. */
export function alignToWebGpu256(bytes: number): number {
  return Math.ceil(Math.max(0, Math.floor(Number.isFinite(bytes) ? bytes : 0)) / 256) * 256;
}

/** 64B CPU 캐시라인 경계로 바이트 크기를 올림 정렬한다. */
export function alignToCacheLine64(bytes: number): number {
  const safe = Math.max(0, Math.floor(Number.isFinite(bytes) ? bytes : 0));
  return safe === 0 ? CACHE_LINE_BYTES : Math.ceil(safe / CACHE_LINE_BYTES) * CACHE_LINE_BYTES;
}

export const PAPER_FIBER_PROFILES: readonly PaperFiberSpec[] = [
  { id: "hanji-mulberry", nameKo: "전주 닥나무 한지", nameEn: "Jeonju Mulberry Hanji", baseAnisotropy: 0.84, capillaryAbsorbency: 0.88, grainRelief: 0.74, paperOklch: { l: 0.95, c: 0.016, h: 88 }, valleyOklch: { l: 0.83, c: 0.024, h: 80 } },
  { id: "cotton-coldpress-300", nameKo: "300g 코튼 중목 수채지", nameEn: "300g Cotton Cold-Press", baseAnisotropy: 0.28, capillaryAbsorbency: 0.94, grainRelief: 0.82, paperOklch: { l: 0.96, c: 0.009, h: 92 }, valleyOklch: { l: 0.85, c: 0.016, h: 84 } },
  { id: "hotpress-satin", nameKo: "세목 사틴 드로잉지", nameEn: "Hot-Press Satin Rag", baseAnisotropy: 0.18, capillaryAbsorbency: 0.48, grainRelief: 0.34, paperOklch: { l: 0.97, c: 0.006, h: 94 }, valleyOklch: { l: 0.89, c: 0.011, h: 86 } },
  { id: "linen-primed", nameKo: "젯소 프라임드 리넨 캔버스", nameEn: "Gesso-Primed Linen Canvas", baseAnisotropy: 0.62, capillaryAbsorbency: 0.32, grainRelief: 0.86, paperOklch: { l: 0.92, c: 0.018, h: 82 }, valleyOklch: { l: 0.78, c: 0.025, h: 74 } },
] as const;

export const DUAL_TIP_MODE_META: Readonly<Record<DualTipBlendMode, {
  readonly labelKo: string; readonly labelEn: string;
  readonly formulaKo: string; readonly formulaEn: string; readonly wgslModeId: number;
}>> = {
  multiply: { labelKo: "곱하기 (Multiply)", labelEn: "Multiply", formulaKo: "메인 팁 × 보조 질감 농도 결합으로 자연스러운 안료 밀착", formulaEn: "Primary tip × secondary grain density for organic pigment bonding", wgslModeId: 0 },
  subtract: { labelKo: "빼기 (Subtract)", labelEn: "Subtract", formulaKo: "보조 거친 결을 덜어내 목탄·크레용 특유의 백색 공극 형성", formulaEn: "Carves secondary tooth away for chalk and charcoal white voids", wgslModeId: 1 },
  "height-clip": { labelKo: "높이 클립 (Height-Clip)", labelEn: "Height-Clip", formulaKo: "필압 임계치 이상 종이 산봉우리만 선택 착색하고 골짜기 보존", formulaEn: "Selectively coats paper peaks above pressure threshold, preserving valleys", wgslModeId: 2 },
  "color-dodge": { labelKo: "광학 닷지 (Color-Dodge)", labelEn: "Color-Dodge", formulaKo: "보조 팁 하이라이트 채널을 투과시켜 습식 수채 발광 경계 강조", formulaEn: "Lifts translucent highlights through secondary pores for wet watercolor bloom", wgslModeId: 3 },
};

export function getPaperFiberSpec(id: PaperFiberProfileId): PaperFiberSpec {
  const found = PAPER_FIBER_PROFILES.find((item) => item.id === id);
  if (!found) throw new RangeError(`등록되지 않은 종이 섬유 프로파일입니다: ${String(id)}`);
  return { ...found, paperOklch: { ...found.paperOklch }, valleyOklch: { ...found.valleyOklch } };
}

/** 브러시 입력 파라미터를 안전하게 정규화·클램프한다. */
export function normalizeUltraBrushInput(input?: UltraBrushOpticsInput): NormalizedUltraBrushInput {
  const modeValid = input?.dualTipMode !== undefined && DUAL_TIP_MODES.includes(input.dualTipMode);
  const dualTipMode: DualTipBlendMode = modeValid && input?.dualTipMode ? input.dualTipMode : "height-clip";
  const paperValid = input?.paperFiberId !== undefined && PAPER_FIBER_PROFILES.some((p) => p.id === input.paperFiberId);
  const paperFiberId: PaperFiberProfileId = paperValid && input?.paperFiberId ? input.paperFiberId : "hanji-mulberry";
  const paperSpec = getPaperFiberSpec(paperFiberId);

  const scale = clampFinite(input?.secondaryGrainScale, 1.35, 0.4, 3);
  const contrast = clampFinite(input?.secondaryContrast, 0.72, 0.1, 1);
  const rot = clampFinite(input?.secondaryRotationJitterDeg, 137.5, 0, 180);
  const pickup = clampFinite(input?.pickupPct, 46, 0, 100);
  const dilution = clampFinite(input?.dilutionPct, 28, 0, 100);
  const bleed = clampFinite(input?.capillaryBleedPct, 54, 0, 100);
  const aniso = clampFinite(input?.fiberAnisotropy, paperSpec.baseAnisotropy, 0, 1);
  const pressure = clampFinite(input?.pressure, 0.58, 0.05, 1);
  const tilt = clampFinite(input?.tiltDeg, 36, 0, 75);
  const speed = clampFinite(input?.strokeSpeedPxPerSec, 1180, 80, 2400);
  const drying = clampFinite(input?.dryingProgress, 0.34, 0, 1);
  const impasto = clampFinite(input?.impastoDepthMm, 1.1, 0, 2.4);
  const bristles = clampFinite(input?.bristleCount, 20, 8, 24);
  const forkSens = clampFinite(input?.forkSensitivity, 0.7, 0, 1);

  const clamped =
    (input?.dualTipMode !== undefined && !modeValid) || (input?.paperFiberId !== undefined && !paperValid) ||
    scale.clamped || contrast.clamped || rot.clamped || pickup.clamped || dilution.clamped ||
    bleed.clamped || aniso.clamped || pressure.clamped || tilt.clamped || speed.clamped ||
    drying.clamped || impasto.clamped || bristles.clamped || forkSens.clamped;

  return {
    dualTipMode, secondaryGrainScale: roundTo(scale.value, 2), secondaryContrast: roundTo(contrast.value, 2),
    secondaryRotationJitterDeg: roundTo(rot.value, 1), pickupPct: Math.round(pickup.value), dilutionPct: Math.round(dilution.value),
    brushPigmentOklch: sanitizeNonVioletOklch(input?.brushPigmentOklch ?? DEFAULT_BRUSH_PIGMENT),
    canvasUnderColorOklch: sanitizeNonVioletOklch(input?.canvasUnderColorOklch ?? DEFAULT_CANVAS_UNDER_COLOR),
    paperFiberId, capillaryBleedPct: Math.round(bleed.value), fiberAnisotropy: roundTo(aniso.value, 2),
    pressure: roundTo(pressure.value, 2), tiltDeg: Math.round(tilt.value), strokeSpeedPxPerSec: Math.round(speed.value),
    dryingProgress: roundTo(drying.value, 2), impastoDepthMm: roundTo(impasto.value, 2),
    bristleCount: Math.round(bristles.value), forkSensitivity: roundTo(forkSens.value, 2), clamped,
  };
}

/** 1단계: 듀얼 팁 텍스처 4종 광학 결합 계산기. */
export function evaluateDualTipModulation(norm: NormalizedUltraBrushInput): DualTipModulationResult {
  const sampleCount = 12;
  const phaseRad = (norm.secondaryRotationJitterDeg * Math.PI) / 180;
  const samples: DualTipSamplePoint[] = [];
  let sumMod = 0;
  let peakHits = 0;
  let valleyVoids = 0;
  for (let i = 0; i < sampleCount; i += 1) {
    const u = roundTo(i / (sampleCount - 1), 3);
    const primaryTip = roundTo(0.45 + 0.52 * Math.sin(u * Math.PI * 0.85 + 0.12), 4);
    const secondaryGrain = roundTo(
      0.58 * (0.5 + 0.5 * Math.sin(u * Math.PI * 2.6 * norm.secondaryGrainScale + phaseRad)) +
      0.42 * (0.5 + 0.5 * Math.cos(u * Math.PI * 6.8 * norm.secondaryGrainScale + phaseRad * 1.618)),
      4,
    );
    let modulated: number;
    if (norm.dualTipMode === "multiply") {
      modulated = primaryTip * (1 - norm.secondaryContrast + norm.secondaryContrast * secondaryGrain);
    } else if (norm.dualTipMode === "subtract") {
      modulated = primaryTip - (1 - secondaryGrain) * norm.secondaryContrast * (1.12 - norm.pressure * 0.42);
    } else if (norm.dualTipMode === "height-clip") {
      const clipThr = Math.min(0.9, Math.max(0.1, 0.18 + (1 - norm.pressure) * 0.46 + norm.secondaryContrast * 0.22));
      const band = Math.max(0.04, 0.14 * (1 - norm.secondaryContrast * 0.55));
      modulated = primaryTip * smoothstep(clipThr - band, clipThr + band, secondaryGrain);
    } else {
      modulated = Math.min(1, primaryTip / Math.max(0.12, 1 - secondaryGrain * norm.secondaryContrast * 0.68));
    }
    const clampedMod = roundTo(Math.min(1, Math.max(0, modulated)), 4);
    sumMod += clampedMod;
    if (clampedMod >= 0.68) peakHits += 1;
    if (clampedMod <= 0.18) valleyVoids += 1;
    samples.push({ u, primaryTip, secondaryGrain, modulated: clampedMod });
  }
  const patternRepeatRate = roundTo(Math.max(0, (1 - Math.min(1, norm.secondaryRotationJitterDeg / 90)) * 0.32), 3);
  return {
    stageId: "dual-tip-modulation", mode: norm.dualTipMode, secondaryGrainScale: norm.secondaryGrainScale,
    secondaryContrast: norm.secondaryContrast, rotationJitterDeg: norm.secondaryRotationJitterDeg,
    patternRepeatRate, legacyStampRepeatRate: 0.86, effectiveCoverage: roundTo(sumMod / sampleCount, 3),
    peakHighlightRatio: roundTo(peakHits / sampleCount, 3), valleyVoidRatio: roundTo(valleyVoids / sampleCount, 3), samples,
  };
}

function interpolateOpticalOklch(base: OklchColor, picked: OklchColor, share: number, dilution: number): OklchColor {
  const w = Math.min(1, Math.max(0, share));
  const radA = (base.h * Math.PI) / 180;
  const radB = (picked.h * Math.PI) / 180;
  const aMix = base.c * Math.cos(radA) * (1 - w) + picked.c * Math.cos(radB) * w;
  const bMix = base.c * Math.sin(radA) * (1 - w) + picked.c * Math.sin(radB) * w;
  const rawChroma = Math.hypot(aMix, bMix);
  const c = Math.min(0.26, rawChroma * (1 + Math.sin(w * Math.PI) * 0.18) * (1 - dilution * 0.28));
  const lBase = base.l * (1 - w) + picked.l * w;
  return sanitizeNonVioletOklch({
    l: Math.min(0.95, lBase + dilution * (0.94 - lBase) * 0.24), c,
    h: rawChroma < 0.002 ? base.h : (Math.atan2(bMix, aMix) * 180) / Math.PI,
  });
}

/** 2단계: 더티 브러시 실시간 캔버스 안료 픽업 & 희석 물리 혼색. */
export function evaluateDirtyBrushPickup(norm: NormalizedUltraBrushInput): DirtyBrushPickupResult {
  const pickup = norm.pickupPct / 100;
  const dilution = norm.dilutionPct / 100;
  const trailSamples: DirtyPickupTrailSample[] = [];
  let runningShare = 0;
  for (let i = 0; i < 8; i += 1) {
    const t = roundTo(i / 7, 3);
    runningShare = i === 0 ? pickup * 0.12 : Math.min(0.94, runningShare + (pickup - runningShare) * Math.min(0.85, pickup * (0.28 + norm.pressure * 0.36) + 0.16));
    const canvasShare = pickup === 0 ? 0 : roundTo(runningShare, 3);
    const effectiveOpacity = roundTo(Math.max(0.14, (1 - dilution * 0.72) * (0.76 + norm.pressure * 0.24)), 3);
    trailSamples.push({ t, canvasShare, effectiveOpacity, blendedOklch: interpolateOpticalOklch(norm.brushPigmentOklch, norm.canvasUnderColorOklch, canvasShare, dilution) });
  }
  const last = trailSamples[trailSamples.length - 1] ?? { t: 1, canvasShare: 0, effectiveOpacity: 0.8, blendedOklch: norm.brushPigmentOklch };
  const baseAvgChroma = Math.max(0.01, (norm.brushPigmentOklch.c + norm.canvasUnderColorOklch.c) / 2);
  return {
    stageId: "dirty-brush-pickup", pickupPct: norm.pickupPct, dilutionPct: norm.dilutionPct,
    brushPigmentOklch: norm.brushPigmentOklch, canvasUnderColorOklch: norm.canvasUnderColorOklch,
    finalMixedOklch: last.blendedOklch, canvasTransferRatio: last.canvasShare,
    effectiveOpacity: last.effectiveOpacity, washTransparency: roundTo(1 - last.effectiveOpacity, 3),
    chromaRetention: roundTo(Math.min(1, Math.max(0.35, last.blendedOklch.c / baseAvgChroma)), 3),
    gradientSmoothness: roundTo(Math.min(0.99, 0.62 + pickup * 0.24 + (1 - Math.abs(dilution - 0.35)) * 0.12), 3),
    trailSamples,
  };
}

/** 3단계: 모세관 종이 섬유 이방성 번짐 & 수채 테두리 백런 풀링. */
export function evaluateCapillaryFiberBleed(norm: NormalizedUltraBrushInput, paper: PaperFiberSpec): CapillaryFiberBleedResult {
  const mobility = (norm.capillaryBleedPct / 100) * (0.35 + (1 - norm.dryingProgress) * 0.45 + (norm.dilutionPct / 100) * 0.2) * paper.capillaryAbsorbency;
  const parallelBleedMm = roundTo(mobility * (1.2 + norm.fiberAnisotropy * 2.4), 3);
  const perpendicularBleedMm = roundTo(mobility * (1.2 - norm.fiberAnisotropy * 0.72), 3);
  const anisotropyRatio = roundTo(perpendicularBleedMm <= 0.0005 ? 1 + norm.fiberAnisotropy * 2.4 : parallelBleedMm / perpendicularBleedMm, 2);
  const edgePigmentConcentration = roundTo(1 + mobility * 0.68, 3);
  const seepageVectors: CapillarySeepageVector[] = [0, 45, 90, 135, 180, 225, 270, 315].map((angleDeg) => {
    const fiberAlign = Math.abs(Math.cos((angleDeg * Math.PI) / 180));
    return { angleDeg, reachPx: roundTo(2 + mobility * (6 + fiberAlign * norm.fiberAnisotropy * 16), 2), edgeDensity: roundTo(Math.min(1, 0.35 + (edgePigmentConcentration - 1) * (0.7 + fiberAlign * 0.4)), 3) };
  });
  return {
    stageId: "capillary-fiber-bleed", paperFiberId: paper.id, paperNameKo: paper.nameKo, paperNameEn: paper.nameEn,
    capillaryBleedPct: norm.capillaryBleedPct, fiberAnisotropy: norm.fiberAnisotropy,
    parallelBleedMm, perpendicularBleedMm, anisotropyRatio,
    backrunRingWidthPx: roundTo(mobility * 6.4 * (0.55 + (1 - norm.fiberAnisotropy) * 0.45), 2),
    edgePigmentConcentration, centerWashoutRatio: roundTo(Math.min(0.68, mobility * 0.46), 3),
    featheringStrength: roundTo(Math.min(1, mobility * (0.45 + norm.fiberAnisotropy * 0.85)), 3), seepageVectors,
  };
}

/** 4단계: 동적 강모 갈라짐(Bristle Forking) & 임파스토 골짜기 광택 전이. */
export function evaluateBristleForkingImpasto(norm: NormalizedUltraBrushInput): BristleForkingImpastoResult {
  const speedNorm = Math.min(1, Math.max(0, (norm.strokeSpeedPxPerSec - 320) / 1500));
  const tiltNorm = Math.min(1, Math.max(0, (norm.tiltDeg - 16) / 59));
  const forkDrive = roundTo(Math.min(1, Math.max(0, (speedNorm * 0.56 + tiltNorm * 0.44) * (0.45 + norm.forkSensitivity * 0.72) * (1.16 - norm.pressure * 0.36))), 3);
  const forkClusterCount: 1 | 2 | 3 | 4 = forkDrive >= 0.72 ? 4 : forkDrive >= 0.48 ? 3 : forkDrive >= 0.28 ? 2 : 1;
  const dryBrushGapRatio = roundTo(Math.min(0.76, forkDrive * 0.58 + norm.dryingProgress * 0.18), 3);
  const surfaceRoughness = roundTo(WET_GLOSS_ROUGHNESS + (DRY_MATTE_ROUGHNESS - WET_GLOSS_ROUGHNESS) * norm.dryingProgress ** 0.86, 3);
  const wetGlossIntensity = roundTo(Math.max(0, (DRY_MATTE_ROUGHNESS - surfaceRoughness) / (DRY_MATTE_ROUGHNESS - WET_GLOSS_ROUGHNESS)), 3);
  const ridgeSobelContrast = roundTo(Math.min(1, (norm.impastoDepthMm / 2.4) * (0.65 + (1 - norm.dryingProgress * 0.35) * 0.35)), 3);
  const valleySpecularSheen = roundTo(Math.min(1, wetGlossIntensity * 0.68 + ridgeSobelContrast * 0.36), 3);
  const forkClusters: BristleForkCluster[] = Array.from({ length: forkClusterCount }, (_, i) => {
    const lateralOffsetNorm = forkClusterCount === 1 ? 0 : roundTo(-0.78 + (i / (forkClusterCount - 1)) * 1.56, 3);
    const centerWeight = 1 - Math.abs(lateralOffsetNorm) * 0.35;
    return {
      clusterIndex: i, lateralOffsetNorm, bristleShare: roundTo(centerWeight / forkClusterCount, 3),
      tailReachRatio: roundTo(Math.max(0.42, 1 - Math.abs(lateralOffsetNorm) * dryBrushGapRatio * 0.52), 3),
      wetSheenFactor: roundTo(Math.min(1, valleySpecularSheen * (0.82 + centerWeight * 0.24)), 3),
    };
  });
  return {
    stageId: "bristle-forking-impasto", forkThresholdExceeded: forkClusterCount >= 2, forkDrive, forkClusterCount,
    dryBrushGapRatio, surfaceRoughness, wetGlossIntensity, valleySpecularSheen,
    impastoDepthMm: norm.impastoDepthMm, ridgeSobelContrast, forkClusters,
  };
}

/** 5대 극한 브러시 질감 물리 파이프라인 통합 평가기. */
export function evaluateUltraBrushOptics(input?: UltraBrushOpticsInput): UltraBrushOpticsReport {
  const norm = normalizeUltraBrushInput(input);
  const paperSpec = getPaperFiberSpec(norm.paperFiberId);
  return {
    modelKind: ARCHITECTURE_MODEL_KIND, engineBrand: ATELIER_INK_ULTRA_BRAND, runtimeBrand: TOON_CORE_BRAND,
    input: norm, paperSpec,
    dualTip: evaluateDualTipModulation(norm),
    dirtyPickup: evaluateDirtyBrushPickup(norm),
    capillaryBleed: evaluateCapillaryFiberBleed(norm, paperSpec),
    bristleForking: evaluateBristleForkingImpasto(norm),
  };
}

/** 5단계: 일반 단일 스탬프 브러시 대비 5축 실물 화구 광학 비교기. */
export function compareStandardVsUltraBrush(reportOrInput?: UltraBrushOpticsReport | UltraBrushOpticsInput): StandardVsUltraComparisonReport {
  const r: UltraBrushOpticsReport = reportOrInput && "dualTip" in reportOrInput ? reportOrInput : evaluateUltraBrushOptics(reportOrInput);
  const cScore = Math.round(Math.min(99, 88 + (1 - r.dualTip.patternRepeatRate) * 11));
  const pScore = Math.round(Math.min(99, 76 + r.capillaryBleed.fiberAnisotropy * 11 + (1 - r.dualTip.patternRepeatRate) * 10));
  const kScore = Math.round(Math.min(99, 72 + r.dirtyPickup.chromaRetention * 18 + (r.dirtyPickup.pickupPct > 0 ? 8 : 0)));
  const fScore = Math.round(Math.min(99, 74 + r.bristleForking.forkClusterCount * 5 + (r.input.bristleCount / 24) * 5));
  const iScore = Math.round(Math.min(99, 72 + r.bristleForking.valleySpecularSheen * 16 + r.bristleForking.ridgeSobelContrast * 11));

  const axes: readonly UltraBrushComparisonAxis[] = [
    { id: "stroke-continuity", labelKo: "연속성 (비반복 리본)", labelEn: "Stroke Continuity", standardScore: 34, ultraScore: cScore, delta: cScore - 34, summaryKo: `듀얼 팁 회전 지터(${r.dualTip.rotationJitterDeg}°)로 반복률 ${Math.round(r.dualTip.patternRepeatRate * 100)}% 억제`, summaryEn: `Dual-tip rotation jitter (${r.dualTip.rotationJitterDeg}°) drops repeat rate to ${Math.round(r.dualTip.patternRepeatRate * 100)}%` },
    { id: "paper-response", labelKo: "종이 반응 (섬유 · 백런)", labelEn: "Paper Fiber Response", standardScore: 28, ultraScore: pScore, delta: pScore - 28, summaryKo: `${r.capillaryBleed.paperNameKo} 이방성 ${r.capillaryBleed.anisotropyRatio}:1 · 백런 림 ${r.capillaryBleed.backrunRingWidthPx}px`, summaryEn: `${r.capillaryBleed.paperNameEn} ${r.capillaryBleed.anisotropyRatio}:1 anisotropy · ${r.capillaryBleed.backrunRingWidthPx}px backrun rim` },
    { id: "pickup-naturalness", labelKo: "색 픽업 자연도", labelEn: "Dirty Pickup Fidelity", standardScore: 24, ultraScore: kScore, delta: kScore - 24, summaryKo: `바닥 픽업 ${r.dirtyPickup.pickupPct}% · 희석 ${r.dirtyPickup.dilutionPct}% · 채도 보존 ${Math.round(r.dirtyPickup.chromaRetention * 100)}%`, summaryEn: `${r.dirtyPickup.pickupPct}% pickup · ${r.dirtyPickup.dilutionPct}% dilution · ${Math.round(r.dirtyPickup.chromaRetention * 100)}% chroma retention` },
    { id: "dry-fork-detail", labelKo: "갈필 디테일 (강모 분기)", labelEn: "Bristle Forking Detail", standardScore: 26, ultraScore: fScore, delta: fScore - 26, summaryKo: `${r.bristleForking.forkClusterCount}갈래 강모 분기 · ${r.input.bristleCount}모 갈필 공극 ${Math.round(r.bristleForking.dryBrushGapRatio * 100)}%`, summaryEn: `${r.bristleForking.forkClusterCount}-way bristle fork · ${r.input.bristleCount} filaments (${Math.round(r.bristleForking.dryBrushGapRatio * 100)}% dry gap)` },
    { id: "impasto-sheen", labelKo: "입체 광택 (습윤→건조)", labelEn: "Impasto Valley Sheen", standardScore: 22, ultraScore: iScore, delta: iScore - 22, summaryKo: `두께 ${r.bristleForking.impastoDepthMm.toFixed(1)}mm · 거칠기 ${r.bristleForking.surfaceRoughness.toFixed(2)} · 광택 ${Math.round(r.bristleForking.valleySpecularSheen * 100)}%`, summaryEn: `${r.bristleForking.impastoDepthMm.toFixed(1)}mm ridge · R ${r.bristleForking.surfaceRoughness.toFixed(2)} · ${Math.round(r.bristleForking.valleySpecularSheen * 100)}% valley sheen` },
  ];
  const standardOverall = Math.round(axes.reduce((s, a) => s + a.standardScore, 0) / axes.length);
  const ultraOverall = Math.round(axes.reduce((s, a) => s + a.ultraScore, 0) / axes.length);
  return { modelKind: ARCHITECTURE_MODEL_KIND, axes, standardOverall, ultraOverall, overallDelta: ultraOverall - standardOverall };
}

/** WGSL 듀얼팁 · 더티픽업 · 모세관 · 강모 갈라짐 컴퓨트 셰이더 생성기 (16B 정렬, 예약어 충돌 0). */
export function buildDualTipBrushWgsl(input?: UltraBrushOpticsInput): string {
  const norm = normalizeUltraBrushInput(input);
  const modeId = DUAL_TIP_MODE_META[norm.dualTipMode].wgslModeId;
  return `// AtelierInk Ultra Dual-Tip Optical Compute Shader (ToonCore / ToonSilicon)
// Generated source only; GPU compilation and submission have not been performed.
// Planned preset mode: ${norm.dualTipMode} (${modeId}u), pickup=${norm.pickupPct}%, dilution=${norm.dilutionPct}%
struct UltraDualTipUniforms {
  stroke_segment : vec4<f32>,
  tip_params : vec4<f32>,
  pickup_params : vec4<f32>,
  capillary_params : vec4<f32>,
  brush_pigment : vec4<f32>,
  fork_params : vec4<f32>,
};
struct BristleForkLane { lane_state : vec4<f32>, };
@group(0) @binding(0) var<uniform> ultra_uni : UltraDualTipUniforms;
@group(0) @binding(1) var<storage, read> fork_buf : array<BristleForkLane>;
@group(0) @binding(2) var secondary_tip_tex : texture_2d<f32>;
@group(0) @binding(3) var canvas_under_tex : texture_2d<f32>;
@group(0) @binding(4) var paper_samp : sampler;
@group(0) @binding(5) var out_rgba_tex : texture_storage_2d<rgba16float, write>;

fn dual_tip_modulate(primary_tip: f32, sec_grain: f32, mode_id: u32, contrast: f32, pressure: f32) -> f32 {
  if (mode_id == 0u) { // multiply
    return clamp(primary_tip * (1.0 - contrast + contrast * sec_grain), 0.0, 1.0);
  }
  if (mode_id == 1u) { // subtract
    return clamp(primary_tip - (1.0 - sec_grain) * contrast * (1.12 - pressure * 0.42), 0.0, 1.0);
  }
  if (mode_id == 2u) { // height-clip
    let thr = clamp(0.18 + (1.0 - pressure) * 0.46 + contrast * 0.22, 0.1, 0.9);
    let band = max(0.04, 0.14 * (1.0 - contrast * 0.55));
    return clamp(primary_tip * smoothstep(thr - band, thr + band, sec_grain), 0.0, 1.0);
  }
  // color-dodge (mode_id == 3u)
  return clamp(primary_tip / max(0.12, 1.0 - sec_grain * contrast * 0.68), 0.0, 1.0);
}

fn dirty_canvas_pickup(brush_rgb: vec3<f32>, canvas_rgb: vec3<f32>, pickup_w: f32, dilution_w: f32) -> vec4<f32> {
  let mix_rgb = mix(brush_rgb, canvas_rgb, clamp(pickup_w, 0.0, 0.94));
  let lifted = mix(mix_rgb, vec3<f32>(0.96, 0.95, 0.93), clamp(dilution_w * 0.24, 0.0, 0.24));
  return vec4<f32>(lifted, clamp(1.0 - dilution_w * 0.72, 0.14, 1.0));
}

fn capillary_fiber_bleed(uv: vec2<f32>, aniso: f32, bleed_w: f32) -> vec2<f32> {
  let span = vec2<f32>(0.0025 * (1.0 + aniso * 2.0), 0.0025 * (1.0 - aniso * 0.6));
  let p_pos = textureSampleLevel(secondary_tip_tex, paper_samp, uv + vec2<f32>(span.x, 0.0), 0.0).r;
  let p_neg = textureSampleLevel(secondary_tip_tex, paper_samp, uv - vec2<f32>(span.x, 0.0), 0.0).r;
  return vec2<f32>(clamp(abs(p_pos - p_neg) * bleed_w * (0.5 + aniso), 0.0, 1.0), clamp(bleed_w * (1.0 - aniso * 0.45) * 0.65, 0.0, 1.0));
}

fn bristle_fork_and_sheen(local_u: f32, stroke_t: f32, fork_count: u32, impasto_mm: f32, drying_t: f32) -> vec3<f32> {
  let buf_len = arrayLength(&fork_buf);
  if (buf_len == 0u || fork_count == 0u) { return vec3<f32>(1.0, 0.0, 0.14); }
  let limit = min(buf_len, min(fork_count, 4u));
  var fork_cov = 0.0;
  for (var idx : u32 = 0u; idx < limit; idx = idx + 1u) {
    let lane = fork_buf[idx].lane_state;
    let reach_ok = 1.0 - smoothstep(lane.z * 0.72, lane.z, stroke_t);
    fork_cov = max(fork_cov, (1.0 - smoothstep(0.12, 0.34, abs(local_u - lane.x))) * reach_ok);
  }
  let rough_val = mix(0.14, 0.8, pow(clamp(drying_t, 0.0, 1.0), 0.86));
  return vec3<f32>(clamp(fork_cov, 0.0, 1.0), clamp((1.0 - rough_val) * 0.68 + (impasto_mm / 2.4) * 0.36, 0.0, 1.0), rough_val);
}

@compute @workgroup_size(16, 16, 1)
fn atelier_ultra_dual_tip_main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let dims = textureDimensions(out_rgba_tex);
  if (gid.x >= dims.x || gid.y >= dims.y) { return; }
  let uv = (vec2<f32>(gid.xy) + vec2<f32>(0.5, 0.5)) / vec2<f32>(dims);
  let rot = ultra_uni.tip_params.z;
  let rot_uv = vec2<f32>(uv.x * cos(rot) - uv.y * sin(rot), uv.x * sin(rot) + uv.y * cos(rot));
  let sec_grain = textureSampleLevel(secondary_tip_tex, paper_samp, rot_uv * ultra_uni.tip_params.x, 0.0).r;
  let canvas_rgb = textureSampleLevel(canvas_under_tex, paper_samp, uv, 0.0).rgb;
  let tip_cov = dual_tip_modulate(0.92, sec_grain, u32(clamp(ultra_uni.tip_params.w, 0.0, 3.0)), ultra_uni.tip_params.y, ultra_uni.pickup_params.z);
  let picked = dirty_canvas_pickup(ultra_uni.brush_pigment.rgb, canvas_rgb, ultra_uni.pickup_params.x, ultra_uni.pickup_params.y);
  let cap_out = capillary_fiber_bleed(uv, ultra_uni.capillary_params.y, ultra_uni.capillary_params.x);
  let fork_out = bristle_fork_and_sheen(uv.y * 2.0 - 1.0, uv.x, u32(clamp(ultra_uni.fork_params.x, 1.0, 4.0)), ultra_uni.capillary_params.w, ultra_uni.capillary_params.z);
  let final_alpha = clamp(tip_cov * max(0.2, fork_out.x) * picked.w + cap_out.x * 0.12, 0.0, 1.0);
  let lit_rgb = clamp(picked.rgb * (1.0 - cap_out.y * 0.18) + vec3<f32>(fork_out.y * 0.28), vec3<f32>(0.0), vec3<f32>(1.0));
  textureStore(out_rgba_tex, vec2<i32>(gid.xy), vec4<f32>(lit_rgb, final_alpha));
}
`;
}

const WGSL_RESERVED_KEYWORDS: ReadonlySet<string> = new Set(
  "NULL Self abstract active alignas alignof as asm asm_fragment async attribute auto await become cast catch class co_await co_return co_yield coherent column_major common compile compile_fragment concept const_cast consteval constexpr constinit crate debugger decltype delete demote demote_to_helper do dynamic_cast enum explicit export extends extern external fallthrough filter final finally friend from fxgroup get goto groupshared highp impl implements import inline instanceof interface layout lowp macro macro_rules match mediump meta mod module move mut mutable namespace new nil noexcept noinline nointerpolation non_coherent noncoherent noperspective null nullptr of operator package packoffset partition pass patch pixelfragment precise precision premerge priv protected pub public readonly ref regardless register reinterpret_cast require resource restrict self set shared sizeof smooth snorm static static_assert static_cast std subroutine super target template this thread_local throw trait try type typedef typeid typename typeof union unless unorm unsafe unsized use using varying virtual volatile wgsl where with writeonly yield".split(" "),
);

function measureWgslStructBytes(source: string, structName: string): number {
  const match = source.match(new RegExp(`struct\\s+${structName}\\s*\\{([\\s\\S]*?)\\}`, "u"));
  if (!match?.[1]) return 0;
  let bytes = 0;
  for (const field of match[1].replace(/\/\/.*$/gmu, "").split(",").map((s) => s.trim()).filter(Boolean)) {
    if (/:\s*vec[34]<(?:f32|u32|i32)>/u.test(field)) bytes += 16;
    else if (/:\s*vec2<(?:f32|u32|i32)>/u.test(field)) bytes += 8;
    else if (/:\s*(?:f32|u32|i32)/u.test(field)) bytes += 4;
  }
  return bytes;
}

/** WGSL 듀얼팁 컴퓨트 셰이더 정적 계약 검증기. */
export function validateDualTipBrushWgsl(source: string): DualTipWgslValidationReport {
  let curly = 0;
  let paren = 0;
  let balanced = true;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") curly += 1;
    else if (ch === "}") curly -= 1;
    else if (ch === "(") paren += 1;
    else if (ch === ")") paren -= 1;
    if (curly < 0 || paren < 0) balanced = false;
  }
  if (curly !== 0 || paren !== 0) balanced = false;

  const wgMatch = source.match(/@compute\s+@workgroup_size\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/u);
  const fnMatch = source.match(/@compute[\s\S]*?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/u);
  const entryPoint = fnMatch?.[1] ?? "";
  const workgroupSize: readonly [number, number, number] = wgMatch ? [Number(wgMatch[1]), Number(wgMatch[2]), Number(wgMatch[3])] : [0, 0, 0];
  const uniformStructBytes = measureWgslStructBytes(source, "UltraDualTipUniforms");
  const forkStructBytes = measureWgslStructBytes(source, "BristleForkLane");
  const uniformAlignedStrideBytes = uniformStructBytes > 0 ? alignToWebGpu256(uniformStructBytes) : 0;
  const bindingCount = new Set([...source.matchAll(/@binding\(\s*(\d+)\s*\)/gu)].map((m) => Number(m[1]))).size;

  const hits = new Set<string>();
  for (const pat of [/\b(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\b/gu, /\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gu]) {
    for (const m of source.matchAll(pat)) {
      if (m[1] && WGSL_RESERVED_KEYWORDS.has(m[1])) hits.add(m[1]);
    }
  }
  const reservedKeywordHits = [...hits].sort();
  const allFourDualTipModesPresent =
    source.includes("// multiply") && source.includes("// subtract") &&
    source.includes("// height-clip") && source.includes("// color-dodge");

  const errors: string[] = [];
  if (!balanced) errors.push("Unbalanced braces or parentheses");
  if (!wgMatch || !entryPoint) errors.push("Missing @compute entrypoint");
  if (uniformStructBytes < 16 || uniformStructBytes % 16 !== 0) errors.push("Uniform struct not 16B aligned");
  if (forkStructBytes < 16 || forkStructBytes % 16 !== 0) errors.push("Fork struct not 16B aligned");
  if (reservedKeywordHits.length > 0) errors.push(`Reserved WGSL identifiers: ${reservedKeywordHits.join(",")}`);
  if (!allFourDualTipModesPresent) errors.push("Missing one or more dual-tip blend modes");
  if (!source.includes("textureSampleLevel(") || /\btextureSample\s*\(/u.test(source)) errors.push("Unsafe texture sampling in compute shader");

  return {
    validationKind: "static-source-contract", gpuCompiled: false, valid: errors.length === 0,
    entryPoint, workgroupSize, uniformStructBytes, uniformAlignedStrideBytes, forkStructBytes,
    bindingCount, allFourDualTipModesPresent, reservedKeywordHits, errors,
  };
}

/** 6대 CPU 아키텍처별 ToonSilicon ISA 프로파일 정본. */
export const CPU_ISA_PROFILES: readonly CpuIsaProfileSpec[] = [
  { id: "browser-portable-wasm-relaxed", archFamily: "wasm-portable", labelKo: "브라우저 표준 WASM Relaxed-SIMD + WASM64", labelEn: "Browser Standard WASM Relaxed-SIMD + WASM64", siliconScopeKo: "모든 최신 데스크톱·모바일 브라우저 즉시 실행 (V8 · JSC · SpiderMonkey)", siliconScopeEn: "Immediate execution across modern browsers (V8 · JSC · SpiderMonkey)", browserWasmPath: "WASM SIMD128 + WASM Relaxed-SIMD + WASM64 (Memory64) + SAB/Atomics.waitAsync", browserJitLowering: "호스트 CPU에 따라 x86-64 AVX-512/AVX2+FMA/AVX-VNNI 또는 ARM64 NEON/SVE2/DotProd로 JIT 자동 로어링", browserJitEngines: ["V8 TurboFan", "JavaScriptCore B3", "SpiderMonkey Ion"], nativeFfiIsaSet: ["WASM SIMD128", "WASM Relaxed-SIMD", "WASM64 Memory64"], browserVectorBits: 128, nativeVectorBits: 128, matrixExtension: "i32x4.relaxed_dot_i8x16_i7x16_add_s (표준 INT8 내적)", nativeFfiRequiredForFullIsa: false },
  { id: "x86-intel-amx-avx512", archFamily: "x86-64", labelKo: "Intel x86-64 · AMX (TMUL) & AVX-512 FP16·VNNI", labelEn: "Intel x86-64 · AMX (TMUL) & AVX-512 FP16·VNNI", siliconScopeKo: "Intel Core Ultra / Xeon 워크스테이션 (브라우저 JIT 로어링 + 네이티브 FFI 확장)", siliconScopeEn: "Intel Core Ultra / Xeon workstations (Browser JIT lowering + Native FFI bridge)", browserWasmPath: "WASM Relaxed-SIMD (f32x4.relaxed_madd · i32x4.relaxed_dot_i8x16_i7x16_add_s)", browserJitLowering: "V8/SpiderMonkey가 WASM Relaxed-SIMD를 x86-64 AVX2+FMA · AVX-VNNI · AVX-512로 자동 로어링", browserJitEngines: ["V8 TurboFan", "SpiderMonkey Ion"], nativeFfiIsaSet: ["Intel AMX (TMUL)", "AVX-512 FP16", "AVX-512 BF16", "AVX-512 VNNI", "AVX-VNNI"], browserVectorBits: 128, nativeVectorBits: 512, matrixExtension: "Intel AMX TMUL (16×16 BF16/INT8 타일 레지스터 — 네이티브 FFI 경계)", nativeFfiRequiredForFullIsa: true },
  { id: "x86-amd-zen5-avx512", archFamily: "x86-64", labelKo: "AMD Zen5 x86-64 · 풀폭 512-bit AVX-512 & VNNI", labelEn: "AMD Zen5 x86-64 · Full-Width 512-bit AVX-512 & VNNI", siliconScopeKo: "AMD Ryzen 9000 / EPYC Zen5 (단일 사이클 512-bit ZMM + 브라우저 WASM64)", siliconScopeEn: "AMD Ryzen 9000 / EPYC Zen5 (Full-width 512-bit ZMM + Browser WASM64)", browserWasmPath: "WASM Relaxed-SIMD + WASM64 (Memory64) + 64B Cache-Line SoA", browserJitLowering: "V8/SpiderMonkey가 FMA·INT8 내적을 AVX-512 / AVX2+FMA / AVX-VNNI로 자동 로어링", browserJitEngines: ["V8 TurboFan", "SpiderMonkey Ion"], nativeFfiIsaSet: ["AMD Zen5 512-bit SIMD", "AVX-512 VNNI", "AVX-512 BF16", "AVX-512 VBMI2"], browserVectorBits: 128, nativeVectorBits: 512, matrixExtension: "AVX-512 VNNI + 512-bit ZMM FMA (네이티브 FFI 경계)", nativeFfiRequiredForFullIsa: true },
  { id: "arm64-apple-amx-sme", archFamily: "arm64", labelKo: "Apple Silicon ARM64 · Apple AMX & ARMv9 SME", labelEn: "Apple Silicon ARM64 · Apple AMX & ARMv9 SME", siliconScopeKo: "Apple M-시리즈 데스크톱·태블릿 (JSC/V8 NEON 로어링 + 네이티브 AMX/SME FFI)", siliconScopeEn: "Apple M-Series desktop & tablet (JSC/V8 NEON lowering + Native AMX/SME FFI)", browserWasmPath: "WASM Relaxed-SIMD + SharedArrayBuffer + Atomics.waitAsync", browserJitLowering: "JSC B3 / V8이 WASM Relaxed-SIMD를 ARM64 NEON FMLA · DotProd(SDOT/UDOT)로 자동 로어링", browserJitEngines: ["JavaScriptCore B3", "V8 TurboFan"], nativeFfiIsaSet: ["Apple AMX", "ARMv9 SME", "ARM64 NEON", "DotProd", "FP16/BF16"], browserVectorBits: 128, nativeVectorBits: 512, matrixExtension: "Apple AMX 코프로세서 & ARMv9 SME 타일 행렬 연산 (네이티브 FFI 경계)", nativeFfiRequiredForFullIsa: true },
  { id: "arm64-snapdragon-sve2", archFamily: "arm64", labelKo: "Snapdragon ARM64 · ARMv9 SVE2 & I8MM", labelEn: "Snapdragon ARM64 · ARMv9 SVE2 & I8MM", siliconScopeKo: "Snapdragon X / 모바일 플래그십 (NEON/DotProd 즉시 로어링 + SVE2/I8MM 네이티브)", siliconScopeEn: "Snapdragon X / flagship ARM64 (NEON/DotProd lowering + SVE2/I8MM native FFI)", browserWasmPath: "WASM Relaxed-SIMD + 64B SoA + Atomics.waitAsync", browserJitLowering: "V8이 WASM Relaxed-SIMD를 ARM64 NEON · DotProd(SDOT) · FMA로 자동 로어링", browserJitEngines: ["V8 TurboFan"], nativeFfiIsaSet: ["ARM SVE2", "I8MM", "ARM64 NEON", "DotProd"], browserVectorBits: 128, nativeVectorBits: 256, matrixExtension: "ARM I8MM (SMMLA 2×8×2 INT8 행렬곱 — 네이티브 FFI 경계)", nativeFfiRequiredForFullIsa: true },
  { id: "arm64-tensor-neon-i8mm", archFamily: "arm64", labelKo: "Tensor / Cortex-X ARM64 · NEON · SVE2 · I8MM", labelEn: "Tensor / Cortex-X ARM64 · NEON · SVE2 · I8MM", siliconScopeKo: "모바일 Tensor / Cortex-X ARMv9 기기 (브라우저 Relaxed-SIMD + 네이티브 SVE2/I8MM)", siliconScopeEn: "Mobile Tensor / Cortex-X ARMv9 devices (Browser Relaxed-SIMD + Native SVE2/I8MM)", browserWasmPath: "WASM Relaxed-SIMD (f32x4.relaxed_madd · i32x4.relaxed_dot_i8x16_i7x16_add_s)", browserJitLowering: "V8이 모바일 ARM64에서 NEON FMLA 및 DotProd 명령어로 자동 로어링", browserJitEngines: ["V8 TurboFan"], nativeFfiIsaSet: ["ARM SVE2", "I8MM", "DotProd", "NEON FP16"], browserVectorBits: 128, nativeVectorBits: 256, matrixExtension: "ARM SVE2 Predicated Vector + I8MM INT8 (네이티브 FFI 경계)", nativeFfiRequiredForFullIsa: true },
] as const;

/** ToonStudio 6대 핵심 드로잉·렌더 연산별 CPU 명령어 세트 매핑 매트릭스. */
export const CPU_ISA_KERNEL_MATRIX: readonly CpuIsaKernelSpec[] = [
  { id: "km16-spectral-mix", nameKo: "KM16 분광 혼색 & 더티 픽업", nameEn: "KM16 Spectral Mix & Dirty Pickup", domainStageKo: "AtelierInk 16대역 Kubelka-Munk K/S 반사율 결합", domainStageEn: "AtelierInk 16-band Kubelka-Munk K/S reflectance mixing", browserWasmInstructions: ["f32x4.relaxed_madd", "f32x4.relaxed_nmadd", "f32x4.sqrt"], x86NativeInstructions: ["AVX-512 VFMADD231PS (16×f32)", "AVX-512 FP16", "AMD Zen5 512-bit SIMD"], arm64NativeInstructions: ["NEON FMLA.4S", "ARM SVE2 FMLA", "Apple AMX / ARMv9 SME"], soaElementCount: 16, soaAttributeCount: 4, memoryPatternKo: "16개 분광 대역 = 64B 캐시라인 1개에 정확히 정렬 적재", memoryPatternEn: "16 spectral f32 bands fit into exactly one 64B cache line" },
  { id: "bristle-24-integrator", nameKo: "24모 강모 적분 & 동적 갈필 분기", nameEn: "24-Bristle Integrator & Forking", domainStageKo: "24개 개별 강모 탄성·안료 고갈·2~4갈래 갈라짐 적분", domainStageEn: "24-filament spring dynamics, ink depletion, and 2–4 way forking", browserWasmInstructions: ["f32x4.relaxed_madd", "f32x4.relaxed_min", "f32x4.relaxed_max"], x86NativeInstructions: ["AVX-512 FMA (2×16-wide)", "AVX2+FMA"], arm64NativeInstructions: ["NEON FMLA (6×4-wide)", "ARM SVE2 Predicated Loop"], soaElementCount: 24, soaAttributeCount: 6, memoryPatternKo: "24모 → 32-lane 패딩(128B = 2 캐시라인)으로 분기 없는 SIMD 적분", memoryPatternEn: "24 bristles padded to 32 f32 lanes (128B = 2 cache lines) for branchless SIMD" },
  { id: "hiz-4wide-culling", nameKo: "Hi-Z 4-와이드 타일 차폐 컬링", nameEn: "Hi-Z 4-Wide Tile Occlusion Culling", domainStageKo: "2.5D/3D 레이어·소품 바운딩 박스 계층 깊이 차폐 판정", domainStageEn: "Hierarchical depth occlusion culling for 2.5D/3D tile bounds", browserWasmInstructions: ["f32x4.pmin", "f32x4.pmax", "f32x4.lt", "i32x4.bitmask"], x86NativeInstructions: ["AVX-512 VMINPS/VCMPPS (k-mask)", "AVX2 VMINPS"], arm64NativeInstructions: ["NEON FMINNM/FCMGT", "ARM SVE2 Predicate Mask"], soaElementCount: 64, soaAttributeCount: 4, memoryPatternKo: "타일 minZ/maxZ SoA 64-lane 블록(256B = 4 캐시라인) 순차 프리페치", memoryPatternEn: "Sequential prefetch over 64-lane tile minZ/maxZ SoA blocks (4 cache lines)" },
  { id: "int8-npu-assist-infer", nameKo: "INT8 로컬 NPU 보조 추론", nameEn: "INT8 Local NPU-Assist Inference", domainStageKo: "실시간 손떨림 보정·선화 클린업·획 의도 예측 경량 양자화 계층", domainStageEn: "Quantized stroke stabilization, cleanup, and intent prediction fallback", browserWasmInstructions: ["i32x4.relaxed_dot_i8x16_i7x16_add_s", "i16x8.relaxed_dot_i8x16_i7x16_s"], x86NativeInstructions: ["Intel AMX (TMUL INT8)", "AVX-512 VNNI (VPDPBUSD)", "AVX-VNNI"], arm64NativeInstructions: ["ARM DotProd (SDOT)", "ARM I8MM (SMMLA)", "Apple AMX / ARMv9 SME"], soaElementCount: 64, soaAttributeCount: 2, memoryPatternKo: "가중치 64B 타일 패킹으로 INT8 행렬 내적 캐시 미스 최소화", memoryPatternEn: "64B weight tile packing keeps INT8 dot-product streams L1-resident" },
  { id: "rle-delta-tile-compress", nameKo: "RLE-Delta 타일 압축 & 병렬 동기화", nameEn: "RLE-Delta Tile Compression", domainStageKo: "오프라인 OPFS 스냅샷·CRDT 델타 타일 무손실 팩킹", domainStageEn: "Lossless OPFS snapshot and CRDT delta-tile packing", browserWasmInstructions: ["i8x16.eq", "i8x16.bitmask", "i8x16.relaxed_swizzle"], x86NativeInstructions: ["AVX-512 VBMI2 (VPCOMPRESSB)", "AVX2 VPMOVMSKB"], arm64NativeInstructions: ["NEON VCEQ/TBL", "ARM SVE2 COMPACT"], soaElementCount: 64, soaAttributeCount: 2, memoryPatternKo: "SharedArrayBuffer 64B 경계 워커 샤딩 + Atomics.waitAsync 무잠금 수집", memoryPatternEn: "SharedArrayBuffer 64B worker sharding with Atomics.waitAsync collection" },
  { id: "ribbon-600dpi-raster", nameKo: "600DPI 리본 래스터화 & 듀얼팁 합성", nameEn: "600DPI Ribbon SDF & Dual-Tip Raster", domainStageKo: "초고해상도 인쇄 캔버스(600DPI) 연속 캡슐 리본 + 듀얼팁 스팬 출력", domainStageEn: "600DPI print canvas continuous capsule SDF and dual-tip span rasterizer", browserWasmInstructions: ["f32x4.relaxed_madd", "f32x4.relaxed_laneselect", "WASM64 memory.copy"], x86NativeInstructions: ["AVX-512 16-Pixel Span", "AMD Zen5 512-bit SIMD", "AVX-512 FP16"], arm64NativeInstructions: ["NEON 4-Pixel Quad", "ARM SVE2 Scalable Span", "Apple AMX Tile"], soaElementCount: 32, soaAttributeCount: 5, memoryPatternKo: "WASM64 선형 주소 공간 + 64B 정렬 픽셀 스팬(RGBA/Coverage 분리 SoA)", memoryPatternEn: "WASM64 linear tile arena with 64B-aligned RGBA and coverage SoA spans" },
] as const;

export function getCpuIsaProfile(profileId: CpuIsaProfileId): CpuIsaProfileSpec {
  const found = CPU_ISA_PROFILES.find((p) => p.id === profileId);
  if (!found) throw new RangeError(`등록되지 않은 CPU ISA 프로파일입니다: ${String(profileId)}`);
  return { ...found, browserJitEngines: [...found.browserJitEngines], nativeFfiIsaSet: [...found.nativeFfiIsaSet] };
}

/** 64B 캐시라인 정렬 SoA(Structure of Arrays) 메모리 레이아웃 계산 및 정렬 불변식 검증. */
export function computeSoaCacheLineLayout(bristleCount = 24): SoaCacheLineLayoutReport {
  const b = Math.round(clampFinite(bristleCount, 24, 8, 24).value);
  const specs: readonly [string, number][] = [
    ["km16_spectral_bands_f32", 16], ["bristle_pos_x_f32", b], ["bristle_pos_y_f32", b],
    ["bristle_ink_load_f32", b], ["dual_tip_span_cov_f32", 32], ["hiz_tile_depth_min_f32", 64],
  ];
  const channels: SoaCacheLineChannelLayout[] = specs.map(([channelName, logicalElements]) => {
    const byteStride = alignToCacheLine64(logicalElements * F32_BYTES);
    return { channelName, logicalElements, paddedElements: byteStride / F32_BYTES, byteStride, cacheLines: byteStride / CACHE_LINE_BYTES, alignedTo64B: byteStride % CACHE_LINE_BYTES === 0 };
  });
  const totalBytes = channels.reduce((sum, ch) => sum + ch.byteStride, 0);
  return {
    cacheLineBytes: CACHE_LINE_BYTES, f32LanesPerCacheLine: F32_LANES_PER_CACHE_LINE, channels,
    totalBytes, totalCacheLines: totalBytes / CACHE_LINE_BYTES, allAlignedTo64B: channels.every((ch) => ch.alignedTo64B),
    falseSharingPaddingBytes: CACHE_LINE_BYTES, aosWastedBytesPerVectorLoad: 48,
  };
}

/** CPU 아키텍처 프로파일 × 브라우저 웹 표준 / 네이티브 FFI 경계 실행 계획 해결기. */
export function resolveCpuIsaDispatchPlan(options?: {
  readonly profileId?: CpuIsaProfileId; readonly executionBoundary?: ExecutionBoundary;
  readonly browserCapabilities?: BrowserIsaCapabilities; readonly bristleCount?: number;
}): CpuIsaDispatchPlan {
  const profile = getCpuIsaProfile(options?.profileId ?? "browser-portable-wasm-relaxed");
  const requestedBoundary: ExecutionBoundary = options?.executionBoundary ?? "browser-web-standard";
  const activeBoundary: ExecutionBoundary = profile.id === "browser-portable-wasm-relaxed" ? "browser-web-standard" : requestedBoundary;
  const c = options?.browserCapabilities;
  const simd128 = c?.simd128 ?? true;
  const relaxedSimd = c?.relaxedSimd ?? true;
  const memory64 = c?.memory64 ?? true;
  const sabWait = (c?.sharedArrayBuffer ?? true) && (c?.atomicsWaitAsync ?? true);
  const hw = Math.round(clampFinite(c?.hardwareConcurrency, 8, 1, 64).value);

  const activeWasmStack = [
    ...(simd128 ? ["WASM SIMD128"] : []), ...(relaxedSimd ? ["WASM Relaxed-SIMD"] : []),
    ...(memory64 ? ["WASM64 (Memory64)"] : []), ...(sabWait ? ["SharedArrayBuffer + Atomics.waitAsync"] : []),
    "64B Cache-Line SoA",
  ];
  const soaLayout = computeSoaCacheLineLayout(options?.bristleCount ?? 24);
  const vectorBits = activeBoundary === "native-ffi-bridge" ? profile.nativeVectorBits : profile.browserVectorBits;
  const kernelDispatches: ResolvedKernelIsaDispatch[] = CPU_ISA_KERNEL_MATRIX.map((k) => {
    const activeInstructions = activeBoundary === "native-ffi-bridge"
      ? (profile.archFamily === "x86-64" ? [...k.x86NativeInstructions] : profile.archFamily === "arm64" ? [...k.arm64NativeInstructions] : [...k.browserWasmInstructions])
      : [...k.browserWasmInstructions];
    const soaAlignedBytes = alignToCacheLine64(k.soaElementCount * F32_BYTES) * k.soaAttributeCount;
    return {
      kernelId: k.id, nameKo: k.nameKo, nameEn: k.nameEn, domainStageKo: k.domainStageKo, domainStageEn: k.domainStageEn,
      activeBoundary, activeInstructions, plannedBoundary: activeBoundary, plannedInstructions: activeInstructions, browserLoweringSummary: profile.browserJitLowering,
      vectorLaneWidthF32: vectorBits / 32, vectorLaneWidthI8: vectorBits / 8, soaAlignedBytes, soaCacheLines: soaAlignedBytes / CACHE_LINE_BYTES,
    };
  });
  return withIsaExecutionEvidence({
    modelKind: ARCHITECTURE_MODEL_KIND, siliconBrand: TOON_SILICON_BRAND, runtimeBrand: TOON_CORE_BRAND,
    profile, requestedBoundary, activeBoundary, browserImmediateReady: false,
    nativeBridgeRequired: activeBoundary === "native-ffi-bridge", activeWasmStack,
    memoryAddressingMode: memory64 ? "wasm64-memory64" : "wasm32-tiled-fallback",
    threadSyncMode: sabWait ? "sab-atomics-wait-async" : "transferable-worker-fallback",
    workerPoolSlots: Math.max(1, Math.min(16, hw - 1 || 1)), soaLayout, kernelDispatches,
  }, c !== undefined);
}

/** AtelierInk Ultra + ToonSilicon ISA 전체 스펙 JSON 내보내기 번들을 생성한다. */
export function exportAtelierIsaBrushJson(options?: {
  readonly brushInput?: UltraBrushOpticsInput; readonly profileId?: CpuIsaProfileId;
  readonly executionBoundary?: ExecutionBoundary; readonly browserCapabilities?: BrowserIsaCapabilities;
}): { readonly json: string; readonly wgsl: string; readonly payload: AtelierIsaBrushExportPayload } {
  const optics = evaluateUltraBrushOptics(options?.brushInput);
  const comparison = compareStandardVsUltraBrush(optics);
  const isaDispatch = resolveCpuIsaDispatchPlan({
    profileId: options?.profileId, executionBoundary: options?.executionBoundary,
    browserCapabilities: options?.browserCapabilities, bristleCount: optics.input.bristleCount,
  });
  const wgsl = buildDualTipBrushWgsl(optics.input);
  const wgslValidation = validateDualTipBrushWgsl(wgsl);
  const payload: AtelierIsaBrushExportPayload = {
    schemaVersion: ATELIER_ISA_BRUSH_SCHEMA_VERSION, modelKind: ARCHITECTURE_MODEL_KIND,
    brands: { brush: ATELIER_INK_ULTRA_BRAND, silicon: TOON_SILICON_BRAND, runtime: TOON_CORE_BRAND },
    optics, comparison, isaDispatch: serializeIsaDispatchPlan(isaDispatch), wgslValidation, wgslByteLength: wgsl.length,
    executionEvidence: isaDispatch.executionEvidence,
    honestyNoteKo: isaDispatch.honestyNoteKo, honestyNoteEn: isaDispatch.honestyNoteEn,
  };
  return { json: JSON.stringify(payload, null, 2), wgsl, payload };
}
