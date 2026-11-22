/**
 * 7대 WebGPU 브러시 질감 파이프라인(`imaging-pro/brush-texture-max`) 인스펙터 브리지 +
 * 60fps 프레임 예산 가드(`16.6ms` 이내 자동 품질 밸런싱).
 *
 * 연결 파이프라인 (100% 로컬 ₩0, `any` 0건, 브라우저 키-값 저장소 직접 호출 0건):
 * 1. 3-주파수 멀티스케일 종이 높이장 + MIP 샘플러
 * 2. 실시간 임파스토 높이장 범프/노멀 셰이딩 & 30° 측면 자연광 WGSL/CPU
 * 3. 건·습 하이브리드 (습윤층 위 건식 긁힘 Sgraffito · 마른 밑칠 Relief 계승)
 * 4. 속도·필압 이방성 갈필(Dry-Brush Split) + 종이 결 방향 입자 산란
 * 5. 7밴드 Kubelka-Munk 입자 비중 차 이원 과립화(Dual-Pigment Granulation)
 * 6. 8~16채널 가상 붓모 픽업(Dirty Bristle Pickup) 교차 스트로크 모델
 * 7. 필압·속도·매체 연동 옵트인 ₩0 WebAudio 절차적 마찰음 합성기 (기본 OFF)
 */

import {
  BRUSH_FRICTION_MEDIUM_PROFILES,
  DEFAULT_IMPASTO_RAKING_LIGHT_PARAMS,
  DUAL_GRANULATION_PIGMENT_PRESETS,
  MAX_BRISTLE_STRAND_COUNT,
  MAX_SAFE_FRICTION_GAIN,
  MIN_BRISTLE_STRAND_COUNT,
  PAPER_TOOTH_PRESETS,
  STUDIO_IMPASTO_DEFAULT_RAKING_ELEVATION_RAD,
  applySgraffitoHeightCarving,
  computeImpastoDispatchSize,
  createBrushFrictionAudioController,
  createMultiChannelBristleBank,
  evaluateBrushTextureMaxStep,
  generateMultiscalePaperTile,
  normalizeImpastoRakingLightParams,
  packImpastoRakingLightUniforms,
  reloadBristleBank,
  shadeImpastoRakingLightCpu,
  type BrushFrictionAudioController,
  type BrushFrictionMediumId,
  type BrushTextureMaxStepResult,
  type DualPigmentGranulationPair,
  type FrictionAudioContextLike,
  type ImpastoCpuShadeOutput,
  type ImpastoRakingLightParams,
  type MultiChannelBristleBank,
  type MultiscalePaperTile,
  type PaperToothPresetId,
  type SgraffitoCarveDiagnostics,
} from "../imaging-pro/brush-texture-max";
import type { Km7Rgb01 } from "../render/studio-webgpu-km7-spectral-core";

export const TEXTURE_MAX_FRAME_BUDGET_MS = 16.6 as const;
export const TEXTURE_MAX_PRESSURE_THRESHOLD_MS = 15.2 as const;
export const TEXTURE_MAX_RECOVERY_HEADROOM_MS = 11.8 as const;
export const TEXTURE_MAX_SEVERE_SPIKE_MS = 26.0 as const;
export const TEXTURE_MAX_DEFAULT_RAKING_ELEVATION_DEG = 30 as const;

export type TextureMaxInspectorPresetId =
  | "webtoon-ink-clean"
  | "watercolor-granulation"
  | "oil-impasto-30deg"
  | "sumi-hanji-dry-rake"
  | "charcoal-laid-sketch";

export type TextureMaxGranulationPresetId = "mineral-dusk" | "deep-forest";
export type TextureMaxPaperTileSize = 32 | 64 | 128;
export type TextureMaxQualityTier = "economy" | "balanced" | "high" | "ultra";

export const TEXTURE_MAX_QUALITY_TIER_ORDER: readonly TextureMaxQualityTier[] = Object.freeze([
  "economy", "balanced", "high", "ultra",
]);

export interface TextureMaxInspectorConfig {
  readonly presetId: TextureMaxInspectorPresetId;
  readonly paperPresetId: PaperToothPresetId;
  readonly paperTileSize: TextureMaxPaperTileSize;
  readonly paperToothSensitivity01: number;
  readonly impastoEnabled: boolean;
  readonly impastoElevationDeg: number;
  readonly impastoAzimuthDeg: number;
  readonly impastoHeightScale: number;
  readonly dryReliefInheritance01: number;
  readonly sgraffitoEnabled: boolean;
  readonly dryBrushSplitStrength01: number;
  readonly bristleStrandCount: number;
  readonly dualGranulationEnabled: boolean;
  readonly granulationPresetId: TextureMaxGranulationPresetId;
  readonly granulationStrength01: number;
  /** 마찰음은 청력 보호·정숙 환경을 위해 옵트인(기본 false)만 허용한다. */
  readonly frictionAudioOptIn: boolean;
  readonly frictionMediumId: BrushFrictionMediumId;
  readonly frictionMasterVolume01: number;
}

export interface TextureMaxInspectorPresetSpec {
  readonly id: TextureMaxInspectorPresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly config: TextureMaxInspectorConfig;
}

export interface TextureMaxQualityBudgetLimits {
  readonly tier: TextureMaxQualityTier;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly maxPaperTileSize: TextureMaxPaperTileSize;
  readonly maxBristleStrands: number;
  readonly allowImpastoShader: boolean;
  readonly allowDualGranulation: boolean;
  readonly allowSgraffito: boolean;
  readonly allowAnisotropicDrySplit: boolean;
  readonly estimatedStepBudgetMs: number;
}

const makeTierLimit = (
  tier: TextureMaxQualityTier, labelKo: string, labelEn: string,
  maxPaperTileSize: TextureMaxPaperTileSize, maxBristleStrands: number,
  allowImpastoShader: boolean, allowDualGranulation: boolean, allowSgraffito: boolean,
  estimatedStepBudgetMs: number,
): TextureMaxQualityBudgetLimits => Object.freeze({
  tier, labelKo, labelEn, maxPaperTileSize, maxBristleStrands,
  allowImpastoShader, allowDualGranulation, allowSgraffito, allowAnisotropicDrySplit: true, estimatedStepBudgetMs,
});

export const TEXTURE_MAX_QUALITY_TIER_LIMITS: Readonly<
  Record<TextureMaxQualityTier, TextureMaxQualityBudgetLimits>
> = Object.freeze({
  ultra: makeTierLimit("ultra", "최상 (7대 파이프라인 풀가동)", "Ultra (All 7 pipelines)", 128, MAX_BRISTLE_STRAND_COUNT, true, true, true, 9.8),
  high: makeTierLimit("high", "고품질 (60fps 균형)", "High (60fps balanced)", 64, 12, true, true, true, 6.4),
  balanced: makeTierLimit("balanced", "절전 균형 (실시간 보정)", "Balanced (Live throttle)", 32, MIN_BRISTLE_STRAND_COUNT, false, true, false, 3.9),
  economy: makeTierLimit("economy", "60fps 방어 모드 (저부하)", "60fps Guard (Low load)", 32, MIN_BRISTLE_STRAND_COUNT, false, false, false, 2.1),
});

function makePresetSpec(
  id: TextureMaxInspectorPresetId, labelKo: string, labelEn: string, summaryKo: string, summaryEn: string,
  overrides: Omit<Partial<TextureMaxInspectorConfig>, "presetId"> & {
    readonly paperPresetId: PaperToothPresetId;
    readonly frictionMediumId: BrushFrictionMediumId;
  },
): TextureMaxInspectorPresetSpec {
  return Object.freeze({
    id, labelKo, labelEn, summaryKo, summaryEn,
    config: Object.freeze({
      presetId: id, paperPresetId: overrides.paperPresetId, paperTileSize: overrides.paperTileSize ?? 64,
      paperToothSensitivity01: overrides.paperToothSensitivity01 ?? 0.72, impastoEnabled: overrides.impastoEnabled ?? true,
      impastoElevationDeg: overrides.impastoElevationDeg ?? TEXTURE_MAX_DEFAULT_RAKING_ELEVATION_DEG,
      impastoAzimuthDeg: overrides.impastoAzimuthDeg ?? -135, impastoHeightScale: overrides.impastoHeightScale ?? 2.4,
      dryReliefInheritance01: overrides.dryReliefInheritance01 ?? 0.68, sgraffitoEnabled: overrides.sgraffitoEnabled ?? false,
      dryBrushSplitStrength01: overrides.dryBrushSplitStrength01 ?? 0.5, bristleStrandCount: overrides.bristleStrandCount ?? 12,
      dualGranulationEnabled: overrides.dualGranulationEnabled ?? true, granulationPresetId: overrides.granulationPresetId ?? "mineral-dusk",
      granulationStrength01: overrides.granulationStrength01 ?? 0.75, frictionAudioOptIn: false,
      frictionMediumId: overrides.frictionMediumId, frictionMasterVolume01: overrides.frictionMasterVolume01 ?? 0.6,
    }),
  });
}

export const TEXTURE_MAX_INSPECTOR_PRESETS: Readonly<
  Record<TextureMaxInspectorPresetId, TextureMaxInspectorPresetSpec>
> = Object.freeze({
  "webtoon-ink-clean": makePresetSpec(
    "webtoon-ink-clean", "웹툰 선화 · 세목 압착지", "Webtoon Ink · Hot-Press",
    "매끄러운 세목 종이 결 위에서 탄력 있는 선화와 깔끔한 끝단 테이퍼를 유지합니다.",
    "Smooth hot-press paper tooth with crisp linework and responsive exit taper.",
    { paperPresetId: "hot-press", paperToothSensitivity01: 0.32, impastoEnabled: false, impastoHeightScale: 1.1, dryReliefInheritance01: 0.35, dryBrushSplitStrength01: 0.2, bristleStrandCount: MIN_BRISTLE_STRAND_COUNT, dualGranulationEnabled: false, granulationStrength01: 0.25, frictionMediumId: "graphite-pencil", frictionMasterVolume01: 0.55 },
  ),
  "watercolor-granulation": makePresetSpec(
    "watercolor-granulation", "7밴드 수채 과립화 · 황목지", "7-Band Watercolor Granulation · Cold-Press",
    "무거운 광물 안료는 종이 골짜기에 침강하고 가벼운 안료는 가장자리로 번집니다.",
    "Heavy mineral pigment settles into valleys while lighter dye blooms along wet edges.",
    { paperPresetId: "rough-watercolor", paperToothSensitivity01: 0.86, impastoEnabled: true, impastoHeightScale: 2.2, dryReliefInheritance01: 0.82, dryBrushSplitStrength01: 0.48, bristleStrandCount: 12, dualGranulationEnabled: true, granulationPresetId: "mineral-dusk", granulationStrength01: 0.88, frictionMediumId: "watercolor-brush" },
  ),
  "oil-impasto-30deg": makePresetSpec(
    "oil-impasto-30deg", "유화 임파스토 · 30° 측면 자연광", "Oil Impasto · 30° Raking Light",
    "두꺼운 물감 능선과 30° 측면광, 16가닥 붓모 픽업, 건·습 긁힘을 함께 표현합니다.",
    "Sculpted paint ridges, 30° raking light, 16-strand dirty bristle pickup, and sgraffito.",
    { paperPresetId: "cold-press", paperToothSensitivity01: 0.72, impastoEnabled: true, impastoHeightScale: 4.2, dryReliefInheritance01: 0.76, sgraffitoEnabled: true, dryBrushSplitStrength01: 0.62, bristleStrandCount: MAX_BRISTLE_STRAND_COUNT, dualGranulationEnabled: true, granulationPresetId: "deep-forest", granulationStrength01: 0.42, frictionMediumId: "oil-palette-knife", frictionMasterVolume01: 0.62 },
  ),
  "sumi-hanji-dry-rake": makePresetSpec(
    "sumi-hanji-dry-rake", "전통 한지 갈필 먹붓", "Hanji Sumi Dry-Rake",
    "닥섬유 한지 결 위로 빠른 획에서 붓모가 자연스럽게 갈라지는 갈필 질감을 냅니다.",
    "Mulberry hanji grain paired with velocity-driven anisotropic dry-brush splitting.",
    { paperPresetId: "hanji", paperToothSensitivity01: 0.9, impastoEnabled: true, impastoHeightScale: 2.0, dryReliefInheritance01: 0.7, dryBrushSplitStrength01: 0.92, bristleStrandCount: 14, dualGranulationEnabled: true, granulationPresetId: "deep-forest", granulationStrength01: 0.74, frictionMediumId: "watercolor-brush", frictionMasterVolume01: 0.58 },
  ),
  "charcoal-laid-sketch": makePresetSpec(
    "charcoal-laid-sketch", "목탄·연필 레이드지 드로잉", "Charcoal & Graphite Laid Sketch",
    "펜 기울기와 필압에 따라 레이드지 산봉우리만 스치거나 골짜기까지 깊게 채웁니다.",
    "Tilt-and-pressure contact catches laid paper ridges lightly or fills deep valleys.",
    { paperPresetId: "charcoal-laid", paperToothSensitivity01: 0.94, impastoEnabled: false, impastoHeightScale: 1.8, dryReliefInheritance01: 0.55, dryBrushSplitStrength01: 0.78, bristleStrandCount: 10, dualGranulationEnabled: false, granulationPresetId: "deep-forest", granulationStrength01: 0.35, frictionMediumId: "charcoal-pastel", frictionMasterVolume01: 0.62 },
  ),
});

export interface FrameBudgetGuardOptions {
  readonly initialTier?: TextureMaxQualityTier;
  readonly targetFrameMs?: number;
  readonly pressureThresholdMs?: number;
  readonly recoveryHeadroomMs?: number;
  readonly upgradeCooldownFrames?: number;
}

export interface FrameBudgetSnapshot {
  readonly tier: TextureMaxQualityTier;
  readonly limits: TextureMaxQualityBudgetLimits;
  readonly targetFrameMs: number;
  readonly lastFrameMs: number;
  readonly emaFrameMs: number;
  readonly peakFrameMs: number;
  readonly sampleCount: number;
  readonly overBudgetCount: number;
  readonly degradationCount: number;
  readonly recoveryCount: number;
  readonly within60fpsBudget: boolean;
  readonly lastDecisionReasonKo: string;
}

export interface EffectiveTextureMaxPlan {
  readonly requestedConfig: TextureMaxInspectorConfig;
  readonly qualityTier: TextureMaxQualityTier;
  readonly effectivePaperTileSize: TextureMaxPaperTileSize;
  readonly effectiveBristleStrands: number;
  readonly impastoShaderActive: boolean;
  readonly dualGranulationActive: boolean;
  readonly sgraffitoActive: boolean;
  readonly dryBrushSplitActive: boolean;
  readonly frictionAudioOptIn: boolean;
  readonly impastoParams: ImpastoRakingLightParams;
  readonly impastoUniformBytes: number;
  readonly dispatchSize: { readonly workgroupsX: number; readonly workgroupsY: number; readonly workgroupsZ: 1 };
  readonly activePipelineCount: number;
  readonly within60fpsBudget: boolean;
}

export interface TextureMax60fpsBudgetGuard {
  recordFrameSample(frameTimeMs: number): FrameBudgetSnapshot;
  getSnapshot(): FrameBudgetSnapshot;
  resolveEffectivePlan(config: TextureMaxInspectorConfig, viewportWidth?: number, viewportHeight?: number): EffectiveTextureMaxPlan;
  reset(initialTier?: TextureMaxQualityTier): FrameBudgetSnapshot;
}

export interface BrushTextureMaxBridgeStepInput {
  readonly config?: Partial<TextureMaxInspectorConfig>;
  readonly u: number;
  readonly v: number;
  readonly zoomScale: number;
  readonly tiltRad: number;
  readonly pressure: number;
  readonly strokeSpeed: number;
  readonly strokeAngleRad: number;
  readonly paintReserve: number;
  readonly wetness: number;
  readonly dryUnderHeight: number;
  readonly paintViscosity: number;
  readonly radialEdge01: number;
  readonly stampCoordU: number;
  readonly stampCoordV: number;
  readonly canvasSrgbPerStrand: readonly Km7Rgb01[];
  readonly canvasWetnessPerStrand: readonly number[];
  readonly measuredFrameMs?: number;
  readonly computeImpastoSwatch?: boolean;
}

export interface BrushTextureMaxBridgeStepResult {
  readonly plan: EffectiveTextureMaxPlan;
  readonly budget: FrameBudgetSnapshot;
  readonly step: BrushTextureMaxStepResult;
  readonly impastoUniformBuffer: ArrayBuffer;
  readonly impastoSwatch: ImpastoCpuShadeOutput | null;
  readonly audioGainCapped: number;
}

export interface TextureMaxPipelineBadge {
  readonly id:
    | "paper-3freq"
    | "impasto-30deg"
    | "wet-dry-hybrid"
    | "anisotropic-dry"
    | "km7-granulation"
    | "bristle-pickup"
    | "friction-audio";
  readonly labelKo: string;
  readonly labelEn: string;
  readonly detailKo: string;
  readonly detailEn: string;
  readonly active: boolean;
}

export interface BrushTextureMaxInspectorBridge {
  getConfig(): TextureMaxInspectorConfig;
  setPreset(presetId: TextureMaxInspectorPresetId): TextureMaxInspectorConfig;
  updateConfig(patch: Partial<TextureMaxInspectorConfig>): TextureMaxInspectorConfig;
  getBudgetSnapshot(): FrameBudgetSnapshot;
  recordExternalFrameMs(frameTimeMs: number): FrameBudgetSnapshot;
  resolveEffectivePlan(viewportWidth?: number, viewportHeight?: number): EffectiveTextureMaxPlan;
  evaluatePreviewStep(input: BrushTextureMaxBridgeStepInput): BrushTextureMaxBridgeStepResult;
  runSgraffitoCarvePreview(
    heightProps: Float32Array,
    width: number,
    height: number,
    carveStrength?: number,
  ): SgraffitoCarveDiagnostics | null;
  reloadPaint(srgb: Km7Rgb01, loadAmount?: number): void;
  getPaperTileCacheSize(): number;
  getAudioStatus(): ReturnType<BrushFrictionAudioController["getStatus"]>;
  dispose(): void;
}

const clamp = (v: number, lo: number, hi: number): number =>
  !Number.isFinite(v) ? lo : v < lo ? lo : v > hi ? hi : v;
const clamp01 = (v: number): number => clamp(v, 0, 1);
const degToRad = (deg: number): number => (deg * Math.PI) / 180;
const normalizeTileSize = (size: number | undefined): TextureMaxPaperTileSize =>
  !Number.isFinite(size) ? 64 : (size ?? 64) <= 32 ? 32 : (size ?? 64) >= 128 ? 128 : 64;
const resolveGranulationPair = (id: TextureMaxGranulationPresetId): DualPigmentGranulationPair =>
  DUAL_GRANULATION_PIGMENT_PRESETS[id] ?? DUAL_GRANULATION_PIGMENT_PRESETS["mineral-dusk"]!;

export function listTextureMaxInspectorPresets(): readonly TextureMaxInspectorPresetSpec[] {
  return Object.values(TEXTURE_MAX_INSPECTOR_PRESETS);
}

export function getTextureMaxInspectorPreset(
  presetId: TextureMaxInspectorPresetId,
): TextureMaxInspectorPresetSpec {
  return TEXTURE_MAX_INSPECTOR_PRESETS[presetId] ?? TEXTURE_MAX_INSPECTOR_PRESETS["watercolor-granulation"];
}

export function normalizeTextureMaxInspectorConfig(
  input?: Partial<TextureMaxInspectorConfig>,
): TextureMaxInspectorConfig {
  const presetId: TextureMaxInspectorPresetId =
    input?.presetId && input.presetId in TEXTURE_MAX_INSPECTOR_PRESETS
      ? input.presetId
      : "watercolor-granulation";
  const base = TEXTURE_MAX_INSPECTOR_PRESETS[presetId].config;
  const paperPresetId: PaperToothPresetId =
    input?.paperPresetId && input.paperPresetId in PAPER_TOOTH_PRESETS
      ? input.paperPresetId
      : base.paperPresetId;
  const frictionMediumId: BrushFrictionMediumId =
    input?.frictionMediumId && input.frictionMediumId in BRUSH_FRICTION_MEDIUM_PROFILES
      ? input.frictionMediumId
      : base.frictionMediumId;
  const granulationPresetId: TextureMaxGranulationPresetId =
    input?.granulationPresetId === "deep-forest" || input?.granulationPresetId === "mineral-dusk"
      ? input.granulationPresetId
      : base.granulationPresetId;

  return Object.freeze({
    presetId,
    paperPresetId,
    paperTileSize: normalizeTileSize(input?.paperTileSize ?? base.paperTileSize),
    paperToothSensitivity01: clamp01(input?.paperToothSensitivity01 ?? base.paperToothSensitivity01),
    impastoEnabled: input?.impastoEnabled ?? base.impastoEnabled,
    impastoElevationDeg: clamp(input?.impastoElevationDeg ?? base.impastoElevationDeg, 10, 80),
    impastoAzimuthDeg: clamp(input?.impastoAzimuthDeg ?? base.impastoAzimuthDeg, -180, 180),
    impastoHeightScale: clamp(input?.impastoHeightScale ?? base.impastoHeightScale, 0, 12),
    dryReliefInheritance01: clamp01(input?.dryReliefInheritance01 ?? base.dryReliefInheritance01),
    sgraffitoEnabled: input?.sgraffitoEnabled ?? base.sgraffitoEnabled,
    dryBrushSplitStrength01: clamp01(input?.dryBrushSplitStrength01 ?? base.dryBrushSplitStrength01),
    bristleStrandCount: Math.round(
      clamp(input?.bristleStrandCount ?? base.bristleStrandCount, MIN_BRISTLE_STRAND_COUNT, MAX_BRISTLE_STRAND_COUNT),
    ),
    dualGranulationEnabled: input?.dualGranulationEnabled ?? base.dualGranulationEnabled,
    granulationPresetId,
    granulationStrength01: clamp01(input?.granulationStrength01 ?? base.granulationStrength01),
    frictionAudioOptIn: input?.frictionAudioOptIn === true,
    frictionMediumId,
    frictionMasterVolume01: clamp01(input?.frictionMasterVolume01 ?? base.frictionMasterVolume01),
  });
}

export function buildImpastoParamsFromInspectorConfig(
  config: TextureMaxInspectorConfig,
): ImpastoRakingLightParams {
  const elevationRad =
    Math.abs(config.impastoElevationDeg - TEXTURE_MAX_DEFAULT_RAKING_ELEVATION_DEG) < 1e-6
      ? STUDIO_IMPASTO_DEFAULT_RAKING_ELEVATION_RAD
      : degToRad(config.impastoElevationDeg);
  return normalizeImpastoRakingLightParams({
    ...DEFAULT_IMPASTO_RAKING_LIGHT_PARAMS,
    lightAzimuthRad: degToRad(config.impastoAzimuthDeg),
    lightElevationRad: elevationRad,
    heightScale: config.impastoEnabled ? config.impastoHeightScale : 0,
    dryReliefInheritance: config.dryReliefInheritance01,
    paperToothCoupling: clamp(0.15 + config.paperToothSensitivity01 * 0.35, 0, 1),
  });
}

/** 60fps 프레임 예산(`16.6ms`) 자동 품질 밸런서 (즉각 강등 + 히스테리시스 회복). */
export function createTextureMax60fpsBudgetGuard(
  options: FrameBudgetGuardOptions = {},
): TextureMax60fpsBudgetGuard {
  const targetFrameMs = clamp(options.targetFrameMs ?? TEXTURE_MAX_FRAME_BUDGET_MS, 8, 33.3);
  const pressureThresholdMs = clamp(
    options.pressureThresholdMs ?? Math.min(TEXTURE_MAX_PRESSURE_THRESHOLD_MS, targetFrameMs * 0.92),
    6,
    targetFrameMs,
  );
  const recoveryHeadroomMs = clamp(
    options.recoveryHeadroomMs ?? Math.min(TEXTURE_MAX_RECOVERY_HEADROOM_MS, targetFrameMs * 0.72),
    4,
    pressureThresholdMs - 0.5,
  );
  const upgradeCooldownFrames = Math.max(2, Math.trunc(options.upgradeCooldownFrames ?? 6));

  let tierIndex = Math.max(0, TEXTURE_MAX_QUALITY_TIER_ORDER.indexOf(options.initialTier ?? "high"));
  let lastFrameMs = 0;
  let emaFrameMs = 0;
  let peakFrameMs = 0;
  let sampleCount = 0;
  let overBudgetCount = 0;
  let consecutivePressure = 0;
  let consecutiveRecovery = 0;
  let degradationCount = 0;
  let recoveryCount = 0;
  let lastDecisionReasonKo = "60fps 기본 균형 상태 유지";

  const snapshot = (): FrameBudgetSnapshot => {
    const tier = TEXTURE_MAX_QUALITY_TIER_ORDER[tierIndex] ?? "high";
    return Object.freeze({
      tier,
      limits: TEXTURE_MAX_QUALITY_TIER_LIMITS[tier],
      targetFrameMs,
      lastFrameMs,
      emaFrameMs,
      peakFrameMs,
      sampleCount,
      overBudgetCount,
      degradationCount,
      recoveryCount,
      within60fpsBudget: sampleCount === 0 || (lastFrameMs <= targetFrameMs && emaFrameMs <= targetFrameMs),
      lastDecisionReasonKo,
    });
  };

  return {
    recordFrameSample(rawFrameTimeMs: number): FrameBudgetSnapshot {
      const frameMs = Number.isFinite(rawFrameTimeMs) && rawFrameTimeMs >= 0 ? rawFrameTimeMs : 0;
      sampleCount += 1;
      lastFrameMs = frameMs;
      emaFrameMs = sampleCount === 1 ? frameMs : emaFrameMs * 0.65 + frameMs * 0.35;
      if (frameMs > peakFrameMs) peakFrameMs = frameMs;

      if (frameMs > targetFrameMs) {
        overBudgetCount += 1;
        consecutivePressure += 1;
        consecutiveRecovery = 0;
        if (tierIndex > 0) {
          tierIndex = Math.max(0, tierIndex - (frameMs >= TEXTURE_MAX_SEVERE_SPIKE_MS ? 2 : 1));
          degradationCount += 1;
          lastDecisionReasonKo = `프레임 ${frameMs.toFixed(1)}ms > ${targetFrameMs}ms 초과로 품질 자동 하향`;
        } else {
          lastDecisionReasonKo = `최저 부하 60fps 방어 모드 유지 (${frameMs.toFixed(1)}ms)`;
        }
      } else if (frameMs > pressureThresholdMs) {
        consecutivePressure += 1;
        consecutiveRecovery = 0;
        if (consecutivePressure >= 2 && tierIndex > 0) {
          tierIndex -= 1;
          degradationCount += 1;
          consecutivePressure = 0;
          lastDecisionReasonKo = `연속 경고 구간(${frameMs.toFixed(1)}ms) 감지로 선제 품질 하향`;
        }
      } else if (frameMs <= recoveryHeadroomMs && emaFrameMs <= recoveryHeadroomMs + 0.8) {
        consecutivePressure = 0;
        consecutiveRecovery += 1;
        if (consecutiveRecovery >= upgradeCooldownFrames && tierIndex < TEXTURE_MAX_QUALITY_TIER_ORDER.length - 1) {
          tierIndex += 1;
          recoveryCount += 1;
          consecutiveRecovery = 0;
          lastDecisionReasonKo = `연속 ${upgradeCooldownFrames}프레임 여유(${emaFrameMs.toFixed(1)}ms) 확보로 품질 상향`;
        }
      } else {
        consecutivePressure = 0;
        consecutiveRecovery = 0;
      }
      return snapshot();
    },

    getSnapshot: snapshot,

    resolveEffectivePlan(config, viewportWidth = 256, viewportHeight = 256): EffectiveTextureMaxPlan {
      const normalized = normalizeTextureMaxInspectorConfig(config);
      const current = snapshot();
      const { limits } = current;
      const effectivePaperTileSize = normalized.paperTileSize <= limits.maxPaperTileSize
        ? normalized.paperTileSize
        : limits.maxPaperTileSize;
      const effectiveBristleStrands = Math.max(
        MIN_BRISTLE_STRAND_COUNT,
        Math.min(normalized.bristleStrandCount, limits.maxBristleStrands),
      );
      const impastoShaderActive = normalized.impastoEnabled && limits.allowImpastoShader;
      const dualGranulationActive = normalized.dualGranulationEnabled && limits.allowDualGranulation;
      const sgraffitoActive = normalized.sgraffitoEnabled && limits.allowSgraffito;
      const dryBrushSplitActive = normalized.dryBrushSplitStrength01 > 0.05 && limits.allowAnisotropicDrySplit;

      const impastoParams = buildImpastoParamsFromInspectorConfig({
        ...normalized,
        paperTileSize: effectivePaperTileSize,
        bristleStrandCount: effectiveBristleStrands,
        impastoEnabled: impastoShaderActive,
        dualGranulationEnabled: dualGranulationActive,
        sgraffitoEnabled: sgraffitoActive,
      });
      const uniformBuffer = packImpastoRakingLightUniforms(viewportWidth, viewportHeight, impastoParams);
      const activePipelineCount =
        2 +
        (impastoShaderActive ? 1 : 0) +
        (sgraffitoActive || normalized.dryReliefInheritance01 > 0.05 ? 1 : 0) +
        (dryBrushSplitActive ? 1 : 0) +
        (dualGranulationActive ? 1 : 0) +
        (normalized.frictionAudioOptIn ? 1 : 0);

      return Object.freeze({
        requestedConfig: normalized,
        qualityTier: current.tier,
        effectivePaperTileSize,
        effectiveBristleStrands,
        impastoShaderActive,
        dualGranulationActive,
        sgraffitoActive,
        dryBrushSplitActive,
        frictionAudioOptIn: normalized.frictionAudioOptIn,
        impastoParams,
        impastoUniformBytes: uniformBuffer.byteLength,
        dispatchSize: computeImpastoDispatchSize(viewportWidth, viewportHeight),
        activePipelineCount,
        within60fpsBudget: current.within60fpsBudget,
      });
    },

    reset(initialTier = options.initialTier ?? "high"): FrameBudgetSnapshot {
      tierIndex = Math.max(0, TEXTURE_MAX_QUALITY_TIER_ORDER.indexOf(initialTier));
      lastFrameMs = 0;
      emaFrameMs = 0;
      peakFrameMs = 0;
      sampleCount = 0;
      overBudgetCount = 0;
      consecutivePressure = 0;
      consecutiveRecovery = 0;
      degradationCount = 0;
      recoveryCount = 0;
      lastDecisionReasonKo = "60fps 가드 초기화됨";
      return snapshot();
    },
  };
}

export function buildTextureMaxPipelineBadges(plan: EffectiveTextureMaxPlan): readonly TextureMaxPipelineBadge[] {
  const cfg = plan.requestedConfig;
  const paperSpec = PAPER_TOOTH_PRESETS[cfg.paperPresetId];
  const granPair = resolveGranulationPair(cfg.granulationPresetId);
  const mediumProfile = BRUSH_FRICTION_MEDIUM_PROFILES[cfg.frictionMediumId];
  const badge = (
    id: TextureMaxPipelineBadge["id"], labelKo: string, labelEn: string,
    detailKo: string, detailEn: string, active: boolean,
  ): TextureMaxPipelineBadge => Object.freeze({ id, labelKo, labelEn, detailKo, detailEn, active });

  return Object.freeze([
    badge("paper-3freq", "3-주파수 종이 결", "3-Freq Paper Tooth", `${paperSpec.label} · ${plan.effectivePaperTileSize}px MIP`, `${cfg.paperPresetId} · ${plan.effectivePaperTileSize}px MIP`, true),
    badge(
      "impasto-30deg", `${Math.round(cfg.impastoElevationDeg)}° 측면 자연광 임파스토`, `${Math.round(cfg.impastoElevationDeg)}° Raking Impasto`,
      plan.impastoShaderActive ? `부조 ${cfg.impastoHeightScale.toFixed(1)} · ${plan.impastoUniformBytes}B WGSL` : "60fps 예산·선화 프리셋 기준 대기",
      plan.impastoShaderActive ? `Relief ${cfg.impastoHeightScale.toFixed(1)} · ${plan.impastoUniformBytes}B WGSL` : "Standby for clean line / 60fps budget",
      plan.impastoShaderActive,
    ),
    badge(
      "wet-dry-hybrid", "건·습 밑칠 요철 계승", "Wet/Dry Relief",
      plan.sgraffitoActive ? `계승 ${Math.round(cfg.dryReliefInheritance01 * 100)}% + 건식 긁힘` : `밑칠 계승 ${Math.round(cfg.dryReliefInheritance01 * 100)}%`,
      plan.sgraffitoActive ? `${Math.round(cfg.dryReliefInheritance01 * 100)}% inherit + Sgraffito` : `${Math.round(cfg.dryReliefInheritance01 * 100)}% dry inherit`,
      plan.sgraffitoActive || cfg.dryReliefInheritance01 > 0.05,
    ),
    badge("anisotropic-dry", "속도·필압 갈필", "Anisotropic Dry-Brush", `갈라짐 강도 ${Math.round(cfg.dryBrushSplitStrength01 * 100)}%`, `Split ${Math.round(cfg.dryBrushSplitStrength01 * 100)}%`, plan.dryBrushSplitActive),
    badge("km7-granulation", "7밴드 KM 이원 과립화", "7-Band KM Granulation", plan.dualGranulationActive ? granPair.label : "단색 정본 분광 모드", plan.dualGranulationActive ? granPair.id : "Single pigment spectral", plan.dualGranulationActive),
    badge("bristle-pickup", "가상 붓모 픽업", "Dirty Bristle Pickup", `${plan.effectiveBristleStrands}채널 붓모 교차 혼색`, `${plan.effectiveBristleStrands}-strand pickup`, true),
    badge(
      "friction-audio", "절차적 종이 마찰음", "Procedural Friction Audio",
      cfg.frictionAudioOptIn ? `켬 · ${mediumProfile.label} (상한 ${MAX_SAFE_FRICTION_GAIN})` : "꺼짐 (옵트인 · 청력 보호 상한)",
      cfg.frictionAudioOptIn ? `On · ${cfg.frictionMediumId} (cap ${MAX_SAFE_FRICTION_GAIN})` : "Off (Opt-in · safe gain cap)",
      cfg.frictionAudioOptIn,
    ),
  ]);
}

const nowMs = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();

/** 7대 브러시 질감 파이프라인 + 60fps 가드 통합 런타임 브리지. */
export function createBrushTextureMaxInspectorBridge(options: {
  readonly initialPresetId?: TextureMaxInspectorPresetId;
  readonly initialConfig?: Partial<TextureMaxInspectorConfig>;
  readonly initialPaintSrgb?: Km7Rgb01;
  readonly budgetOptions?: FrameBudgetGuardOptions;
  readonly createAudioContext?: () => FrictionAudioContextLike | null;
} = {}): BrushTextureMaxInspectorBridge {
  let config = normalizeTextureMaxInspectorConfig({
    presetId: options.initialPresetId ?? options.initialConfig?.presetId ?? "watercolor-granulation",
    ...options.initialConfig,
  });
  const budgetGuard = createTextureMax60fpsBudgetGuard(options.budgetOptions);
  const paperTileCache = new Map<string, MultiscalePaperTile>();
  const MAX_TILE_CACHE = 12;

  let currentPaintSrgb: Km7Rgb01 = options.initialPaintSrgb ?? { r: 0.16, g: 0.28, b: 0.64 };
  let bristleBank: MultiChannelBristleBank = createMultiChannelBristleBank({
    strandCount: config.bristleStrandCount,
    initialPaintSrgb: currentPaintSrgb,
  });
  const audioController = createBrushFrictionAudioController({
    enabled: config.frictionAudioOptIn,
    masterVolume: config.frictionMasterVolume01,
    createContext: options.createAudioContext,
  });

  const getOrBuildPaperTile = (presetId: PaperToothPresetId, tileSize: TextureMaxPaperTileSize): MultiscalePaperTile => {
    const key = `${presetId}:${tileSize}`;
    const cached = paperTileCache.get(key);
    if (cached) return cached;
    if (paperTileCache.size >= MAX_TILE_CACHE) {
      const oldestKey = paperTileCache.keys().next().value;
      if (typeof oldestKey === "string") paperTileCache.delete(oldestKey);
    }
    const tile = generateMultiscalePaperTile({ presetId, tileSize });
    paperTileCache.set(key, tile);
    return tile;
  };

  const syncAudioState = (nextCfg: TextureMaxInspectorConfig): void => {
    audioController.setMasterVolume(nextCfg.frictionMasterVolume01);
    audioController.setEnabled(nextCfg.frictionAudioOptIn);
  };

  return {
    getConfig: () => config,
    setPreset(presetId) {
      config = getTextureMaxInspectorPreset(presetId).config;
      syncAudioState(config);
      return config;
    },
    updateConfig(patch) {
      config = normalizeTextureMaxInspectorConfig({ ...config, ...patch });
      syncAudioState(config);
      return config;
    },
    getBudgetSnapshot: () => budgetGuard.getSnapshot(),
    recordExternalFrameMs: (frameTimeMs) => budgetGuard.recordFrameSample(frameTimeMs),
    resolveEffectivePlan: (vw = 256, vh = 256) => budgetGuard.resolveEffectivePlan(config, vw, vh),

    evaluatePreviewStep(input) {
      const t0 = nowMs();
      const stepConfig = input.config ? normalizeTextureMaxInspectorConfig({ ...config, ...input.config }) : config;
      const plan = budgetGuard.resolveEffectivePlan(stepConfig);
      const paperTile = getOrBuildPaperTile(stepConfig.paperPresetId, plan.effectivePaperTileSize);
      if (bristleBank.strandCount !== plan.effectiveBristleStrands) {
        bristleBank = createMultiChannelBristleBank({
          strandCount: plan.effectiveBristleStrands,
          initialPaintSrgb: currentPaintSrgb,
        });
      }
      const granPair = resolveGranulationPair(stepConfig.granulationPresetId);
      const step = evaluateBrushTextureMaxStep({
        paperTile,
        u: input.u, v: input.v, zoomScale: input.zoomScale, tiltRad: input.tiltRad,
        pressure: input.pressure, strokeSpeed: input.strokeSpeed, strokeAngleRad: input.strokeAngleRad,
        paintReserve: input.paintReserve, wetness: plan.dualGranulationActive ? input.wetness : 0,
        dryUnderHeight: input.dryUnderHeight, paintViscosity: input.paintViscosity,
        radialEdge01: input.radialEdge01, stampCoordU: input.stampCoordU, stampCoordV: input.stampCoordV,
        medium: stepConfig.frictionMediumId, bristleBank,
        canvasSrgbPerStrand: input.canvasSrgbPerStrand, canvasWetnessPerStrand: input.canvasWetnessPerStrand,
        heavyPigment: granPair.heavyPigment, lightPigment: granPair.lightPigment,
        masterAudioVolume: stepConfig.frictionAudioOptIn ? stepConfig.frictionMasterVolume01 : 0,
      });

      const audioOut = audioController.updateStroke({
        medium: stepConfig.frictionMediumId, pressure: input.pressure, speed: input.strokeSpeed,
        paperRoughness: paperTile.spec.nominalRoughness, tiltRad: input.tiltRad,
        wetness: input.wetness, masterVolume: stepConfig.frictionMasterVolume01,
      });
      const impastoUniformBuffer = packImpastoRakingLightUniforms(
        plan.effectivePaperTileSize, plan.effectivePaperTileSize, plan.impastoParams,
      );

      let impastoSwatch: ImpastoCpuShadeOutput | null = null;
      if (input.computeImpastoSwatch && plan.impastoShaderActive) {
        const sw = 8;
        const n = sw * sw;
        const baseColor = new Float32Array(n * 4);
        const heightProps = new Float32Array(n * 4);
        const paperSlice = new Float32Array(n);
        for (let i = 0; i < n; i += 1) {
          const off = i * 4;
          baseColor[off] = step.dualGranulation.srgb.r;
          baseColor[off + 1] = step.dualGranulation.srgb.g;
          baseColor[off + 2] = step.dualGranulation.srgb.b;
          baseColor[off + 3] = 1;
          heightProps[off] = step.overpaintRelief.effectiveTotalHeight;
          heightProps[off + 1] = input.dryUnderHeight;
          heightProps[off + 2] = clamp(0.45 + step.overpaintRelief.combinedRoughnessDelta, 0.1, 0.95);
          heightProps[off + 3] = input.wetness;
          paperSlice[i] = paperTile.height[i % paperTile.height.length] ?? 0.5;
        }
        impastoSwatch = shadeImpastoRakingLightCpu({
          width: sw, height: sw, baseColorIn: baseColor, heightPropsIn: heightProps,
          paperHeightIn: paperSlice, params: plan.impastoParams,
        });
      }

      const elapsed = input.measuredFrameMs ?? Math.max(0.05, nowMs() - t0);
      const budget = budgetGuard.recordFrameSample(elapsed);
      return {
        plan, budget, step, impastoUniformBuffer, impastoSwatch,
        audioGainCapped: Math.min(MAX_SAFE_FRICTION_GAIN, audioOut.targetGain),
      };
    },

    runSgraffitoCarvePreview(heightProps, width, height, carveStrength = 0.72) {
      const plan = budgetGuard.resolveEffectivePlan(config, width, height);
      if (!plan.sgraffitoActive) return null;
      return applySgraffitoHeightCarving({
        width, height, heightProps,
        startX: width * 0.2, startY: height * 0.5, endX: width * 0.8, endY: height * 0.5,
        radius: Math.max(1.5, Math.min(width, height) * 0.12),
        carveStrength, ridgePush: plan.impastoParams.sgraffitoRidgePush,
      });
    },

    reloadPaint(srgb, loadAmount = 0.95) {
      currentPaintSrgb = { r: clamp01(srgb.r), g: clamp01(srgb.g), b: clamp01(srgb.b) };
      reloadBristleBank(bristleBank, currentPaintSrgb, loadAmount);
    },
    getPaperTileCacheSize: () => paperTileCache.size,
    getAudioStatus: () => audioController.getStatus(),
    dispose() {
      audioController.dispose();
      paperTileCache.clear();
    },
  };
}
