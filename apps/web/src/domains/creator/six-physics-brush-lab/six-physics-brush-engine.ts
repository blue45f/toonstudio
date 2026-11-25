/**
 * Wave 53D — 6대 학술 논문 기반 독립 물리 브러시 개성 엔진 (6 Distinct Physics Brush Engines).
 *
 * 6개 매체를 고정 계수의 CPU 산식과 SVG 도해로 비교한다. 버퍼·WGSL 문자열은 실행 전 설계 예제다.
 * 수치·mm·DPI·Foley 대역은 보정되지 않은 가정이며 논문의 재현 실험이나 실제 장치 측정값이 아니다.
 * - 현재 구현(Current): 결정론적 CPU 물리 수치 시뮬레이터 + 6축 분화 정량 검증기 + WGSL 매니페스트
 * - 목표 런타임(Target): 엔진별 전용 WebGPU Compute/Fragment 패스 및 Rust WASM 타일 커널 직결
 */

export const SIX_PHYSICS_MANIFEST_SCHEMA_VERSION = "toonstudio.six-physics-brush-manifest.v1" as const;
export const VIOLET_HUE_MIN_DEG = 270 as const;
export const VIOLET_HUE_MAX_DEG = 320 as const;
export const MIN_GPEN_SDF_DPI = 600 as const;

export type PhysicsBrushEngineId =
  | "watercolor-curtis97" | "oil-wetbrush15" | "sumi-moxi05"
  | "drymedia-sousa99" | "gpen-loopblinn05" | "marker-foil-pbr";

export type ColorMixingParadigm =
  | "kubelka-munk-glaze" | "kubelka-munk-impasto" | "carbon-optical-density"
  | "layered-dry-overprint" | "solid-opaque-india-ink" | "solvent-dye-cap-and-pbr-f0";

export type EdgeBehaviorParadigm =
  | "capillary-backrun-rim" | "raised-impasto-ridge" | "anisotropic-fiber-feibai"
  | "tooth-peak-skip-crumble" | "analytic-bezier-sdf-razor" | "chisel-clean-solvent-feather";

export type HeightModelParadigm =
  | "flat-paper-granulation" | "3d-impasto-heightfield" | "absorbed-fiber-percolation"
  | "tooth-clipped-micrograin" | "flat-vector-ink-film" | "microfacet-foil-film";

export type DivergenceAxisId =
  | "state-buffer-topology" | "governing-equation" | "edge-behavior"
  | "color-mixing-model" | "surface-relief-height" | "acoustic-foley-band";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export interface GpuStateBufferSpec {
  readonly id: string; readonly format: string; readonly bytesPerTexel: number;
  readonly roleKo: string; readonly roleEn: string;
}
export interface WgslPipelineSpec {
  readonly pipelineId: string; readonly passNames: readonly [string, string, string];
  readonly workgroupSize: readonly [number, number, number]; readonly wgslSnippet: string;
}
export interface AcademicPaperCitation {
  readonly shortLabel: string; readonly authors: string; readonly venueYear: string; readonly paperTitle: string;
  readonly equationSummaryKo: string; readonly equationSummaryEn: string;
  readonly sourceUrls: readonly string[];
}
export interface AcousticFoleyProfile {
  readonly bandLowHz: number; readonly bandHighHz: number; readonly frictionIndex: number;
  readonly timbreKo: string; readonly timbreEn: string;
}
export interface PhysicsBrushEngineSpec {
  readonly id: PhysicsBrushEngineId; readonly nameKo: string; readonly nameEn: string;
  readonly familyTagKo: string; readonly familyTagEn: string; readonly thesisKo: string; readonly thesisEn: string;
  readonly pigmentOklch: OklchColor; readonly accentOklch: OklchColor;
  readonly paperCitation: AcademicPaperCitation; readonly stateBuffers: readonly GpuStateBufferSpec[];
  readonly wgslPipeline: WgslPipelineSpec;
  readonly colorMixing: ColorMixingParadigm; readonly colorMixingLabelKo: string; readonly colorMixingLabelEn: string;
  readonly edgeBehavior: EdgeBehaviorParadigm; readonly edgeBehaviorLabelKo: string; readonly edgeBehaviorLabelEn: string;
  readonly heightModel: HeightModelParadigm; readonly heightModelLabelKo: string; readonly heightModelLabelEn: string;
  readonly foleyProfile: AcousticFoleyProfile;
  readonly governingEquationFormula: string; readonly governingEquationFamily: string;
}
export interface CommonBrushStrokeInput {
  readonly pressure: number; readonly tiltDeg: number; readonly velocityPxPerSec: number;
  readonly waterSolventLoad: number; readonly paperAbsorbency: number; readonly repeatPasses: number;
}
export interface NormalizedBrushStrokeInput extends CommonBrushStrokeInput { readonly clamped: boolean; }

export interface WatercolorCurtis97Physics {
  readonly kind: "watercolor-curtis97";
  readonly shallowWaterPeakVelocity: number; readonly pigmentAdvectionFlux: number; readonly capillaryEdgeDeposit: number;
  readonly edgeDarkeningRatio: number; readonly bleedRadiusMm: number; readonly backrunStrength: number;
  readonly granulationSettling: number; readonly centerWashLightening: number;
}
export interface OilWetbrush15Physics {
  readonly kind: "oil-wetbrush15";
  readonly viscosity: number; readonly bristleBendDeg: number; readonly bristleSplayFactor: number;
  readonly canvasPickupRatio: number; readonly depositionVolumeMm3: number; readonly paintThicknessMm: number;
  readonly sobelNormalSlope: number; readonly highlight45Specular: number; readonly kubelkaMunkBlendRatio: number;
}
export interface SumiMoxi05Physics {
  readonly kind: "sumi-moxi05";
  readonly lbmAnisotropyRatio: number; readonly fiberFeatheringMm: number; readonly lbmRelaxationTau: number;
  readonly inkDepletionRatio: number; readonly activeFilaments: number; readonly flyingWhiteGapRatio: number;
  readonly carbonSeepageRatio: number;
}
export interface DryMediaSousa99Physics {
  readonly kind: "drymedia-sousa99";
  readonly peakClippingRatio: number; readonly sideShadingWidthMultiplier: number; readonly valleyFill: number;
  readonly crumbleParticleDensity: number; readonly burnishGlossRatio: number;
}
export interface GPenLoopBlinn05Physics {
  readonly kind: "gpen-loopblinn05";
  readonly sdfEdgeSharpnessDpi: number; readonly bezierControlDensityPerCm: number; readonly nibSplitMm: number;
  readonly taperSharpnessRatio: number; readonly railroadSplitRisk: number;
}
export interface MarkerFoilPbrPhysics {
  readonly kind: "marker-foil-pbr";
  readonly solventSaturationCeiling: number; readonly achievedSaturation: number; readonly muddyPreventionScore: number;
  readonly metallicRoughness: number; readonly ggxSpecularReflectance: number;
  readonly anisotropicFlakeAlignment: number; readonly specularTint: OklchColor;
}
export type EngineSpecificPhysics =
  | WatercolorCurtis97Physics | OilWetbrush15Physics | SumiMoxi05Physics
  | DryMediaSousa99Physics | GPenLoopBlinn05Physics | MarkerFoilPbrPhysics;

export interface BrushPhysicsSimulationResult {
  readonly engineId: PhysicsBrushEngineId; readonly input: NormalizedBrushStrokeInput;
  readonly effectiveStrokeWidthMm: number; readonly paintThicknessMm: number;
  readonly edgeContrastIndex: number; readonly pigmentOpacityRatio: number;
  readonly signatureMetricLabelKo: string; readonly signatureMetricLabelEn: string; readonly signatureMetricValue: string;
  readonly secondaryMetricLabelKo: string; readonly secondaryMetricLabelEn: string; readonly secondaryMetricValue: string;
  readonly physics: EngineSpecificPhysics;
}
export interface BrushDivergenceAxis {
  readonly id: DivergenceAxisId; readonly labelKo: string; readonly labelEn: string; readonly divergenceScore: number;
  readonly primarySummaryKo: string; readonly primarySummaryEn: string;
  readonly compareSummaryKo: string; readonly compareSummaryEn: string;
  readonly architecturalReasonKo: string; readonly architecturalReasonEn: string;
}
export interface BrushPhysicsDivergenceReport {
  readonly primaryId: PhysicsBrushEngineId; readonly compareId: PhysicsBrushEngineId;
  readonly isDistinctArchitecture: boolean; readonly isSliderTweakOnly: boolean;
  readonly overallDivergenceScore: number; readonly sharedBufferOverlapPct: number;
  readonly axes: readonly BrushDivergenceAxis[];
  readonly primarySim: BrushPhysicsSimulationResult; readonly compareSim: BrushPhysicsSimulationResult;
  readonly verdictKo: string; readonly verdictEn: string;
}
export interface BrushStrokeScenarioPreset {
  readonly id: "wet-slow-heavy" | "fast-dry-tilted" | "layered-precision";
  readonly labelKo: string; readonly labelEn: string; readonly hintKo: string; readonly hintEn: string;
  readonly input: CommonBrushStrokeInput;
}
export interface BrushPhysicsPipelineManifest {
  readonly schemaVersion: typeof SIX_PHYSICS_MANIFEST_SCHEMA_VERSION;
  readonly generatedFromModel: "deterministic-cpu-physics-lab";
  readonly runtimeState: {
    readonly model: "illustrative-cpu-formulas";
    readonly gpuExecuted: false; readonly wasmExecuted: false; readonly audioPlayed: false;
    readonly canvasApplied: false; readonly persisted: false;
    readonly calibratedPhysicalUnits: false; readonly validatedPrintDpi: false;
  };
  readonly primaryEngineId: PhysicsBrushEngineId; readonly compareEngineId: PhysicsBrushEngineId;
  readonly strokeInput: NormalizedBrushStrokeInput; readonly divergenceReport: BrushPhysicsDivergenceReport;
  readonly activeEngines: readonly {
    readonly id: PhysicsBrushEngineId; readonly citation: AcademicPaperCitation;
    readonly stateBuffers: readonly GpuStateBufferSpec[]; readonly wgslPipeline: WgslPipelineSpec;
  }[];
  readonly honestyNoteKo: string; readonly honestyNoteEn: string;
}

export const DEFAULT_COMMON_STROKE_INPUT: CommonBrushStrokeInput = {
  pressure: 0.65, tiltDeg: 28, velocityPxPerSec: 720, waterSolventLoad: 0.62, paperAbsorbency: 0.68, repeatPasses: 2,
};

export const STROKE_SCENARIO_PRESETS: readonly BrushStrokeScenarioPreset[] = [
  {
    id: "wet-slow-heavy", labelKo: "습윤 저속 · 강필압", labelEn: "Wet Slow · Heavy Press",
    hintKo: "수채 백런 농축 vs 유화 두꺼운 임파스토 능선 대조",
    hintEn: "Contrasts watercolor backrun rim vs thick oil impasto ridge",
    input: { pressure: 0.88, tiltDeg: 18, velocityPxPerSec: 260, waterSolventLoad: 0.78, paperAbsorbency: 0.82, repeatPasses: 2 },
  },
  {
    id: "fast-dry-tilted", labelKo: "고속 갈필 · 눕힌 붓질", labelEn: "Fast Dry · Tilted Sweep",
    hintKo: "먹물 모발 분기 급감 vs 크레용 옆면 봉우리 클리핑 vs G펜 테이퍼",
    hintEn: "Contrasts sumi filament drop vs crayon peak skip vs G-pen taper",
    input: { pressure: 0.34, tiltDeg: 62, velocityPxPerSec: 2150, waterSolventLoad: 0.18, paperAbsorbency: 0.56, repeatPasses: 1 },
  },
  {
    id: "layered-precision", labelKo: "4회 겹칠 · 정밀 선화", labelEn: "4-Pass Layer · Precision",
    hintKo: "크레용 버니싱 골짜기 충진 vs 알코올 마커 비혼탁 포화 vs 600DPI SDF",
    hintEn: "Contrasts dry burnish vs clean alcohol dye cap vs 600DPI SDF",
    input: { pressure: 0.74, tiltDeg: 22, velocityPxPerSec: 640, waterSolventLoad: 0.52, paperAbsorbency: 0.44, repeatPasses: 4 },
  },
];

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}
function roundTo(value: number, digits: number): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

export function isVioletHueDeg(hue: number): boolean {
  const normalized = ((hue % 360) + 360) % 360;
  return normalized >= VIOLET_HUE_MIN_DEG && normalized <= VIOLET_HUE_MAX_DEG;
}
export function sanitizeNonVioletOklch(color: OklchColor): OklchColor {
  const l = roundTo(clamp(color.l, 0.08, 0.98), 3);
  const c = roundTo(clamp(color.c, 0, 0.28), 3);
  const rawHue = Number.isFinite(color.h) ? ((color.h % 360) + 360) % 360 : 235;
  return { l, c, h: isVioletHueDeg(rawHue) ? 235 : roundTo(rawHue, 1) };
}
export function formatOklch(color: OklchColor, alpha?: number): string {
  const safe = sanitizeNonVioletOklch(color);
  return alpha === undefined
    ? `oklch(${safe.l} ${safe.c} ${safe.h})`
    : `oklch(${safe.l} ${safe.c} ${safe.h} / ${roundTo(clamp(alpha, 0, 1), 3)})`;
}

const ENGINE_SPEC_BY_ID: Record<PhysicsBrushEngineId, PhysicsBrushEngineSpec> = {
  "watercolor-curtis97": {
    id: "watercolor-curtis97", nameKo: "수채화 3층 유체 엔진", nameEn: "Watercolor 3-Layer Fluid",
    familyTagKo: "유체 · 백런", familyTagEn: "Fluid · Backrun",
    thesisKo: "수분·흡수율·압력에 고정 계수를 적용해 번짐과 농축 예시값을 계산한다.",
    thesisEn: "Uses fixed CPU formulas for illustrative watercolor spread and rim values.",
    pigmentOklch: { l: 0.56, c: 0.135, h: 228 }, accentOklch: { l: 0.42, c: 0.145, h: 214 },
    paperCitation: {
      sourceUrls: ["https://grail.cs.washington.edu/wp-content/uploads/2015/08/curtis-1997-cgw.pdf"],
      shortLabel: "Curtis et al. SIGGRAPH '97",
      authors: "C. J. Curtis, S. E. Anderson, J. E. Seims, K. W. Fleischer, D. H. Salesin",
      venueYear: "SIGGRAPH 1997", paperTitle: "Computer-Generated Watercolor",
      equationSummaryKo: "∂u/∂t = -∇p + μ∇²u (천수 유동) + ∂g/∂t = -∇·(ug) - k_dep (안료 침전) + 모세관 백런",
      equationSummaryEn: "Shallow-water (u,v,p) flow + pigment advection/granulation + outward capillary backrun",
    },
    stateBuffers: [
      { id: "shallow_water_uvp_f32", format: "rgba32float", bytesPerTexel: 16, roleKo: "천수 속도(u,v) · 압력(p) · 수심", roleEn: "Shallow-water velocity (u,v), pressure, depth" },
      { id: "pigment_advect_deposit_f16", format: "rgba16float", bytesPerTexel: 8, roleKo: "부유 안료(g) · 침전 안료(d) 농도", roleEn: "Suspended (g) & deposited (d) pigment" },
      { id: "capillary_wet_mask_r16f", format: "rg16float", bytesPerTexel: 4, roleKo: "모세관 습윤 마스크 · 에지 핀 농축", roleEn: "Capillary wet mask & rim pinning field" },
    ],
    wgslPipeline: {
      pipelineId: "wgsl_curtis97_3layer_fluid",
      passNames: ["shallow_water_step", "pigment_advect_settle", "capillary_backrun_dry"],
      workgroupSize: [8, 8, 1],
      wgslSnippet: [
        "@compute @workgroup_size(8, 8, 1) fn capillary_backrun_dry(@builtin(global_invocation_id) gid: vec3<u32>) {",
        "  let uvp = textureLoad(shallow_water_uvp, gid.xy, 0);",
        "  let capFlux = clamp(uvp.z * params.absorbency * params.edgeEvap, 0.0, 2.4);",
        "  textureStore(pigment_deposit, gid.xy, vec4<f32>(uvp.x, uvp.y, 1.0 + capFlux * params.wetPinGain, capFlux));",
        "}",
      ].join("\n"),
    },
    colorMixing: "kubelka-munk-glaze", colorMixingLabelKo: "Kubelka-Munk 투명 글레이즈 광학 혼색", colorMixingLabelEn: "Kubelka-Munk Transparent Glaze Mixing",
    edgeBehavior: "capillary-backrun-rim", edgeBehaviorLabelKo: "모세관 외향 유동 백런(커피링) 에지 농축", edgeBehaviorLabelEn: "Capillary Outward Backrun Rim Darkening",
    heightModel: "flat-paper-granulation", heightModelLabelKo: "평탄 수막 + 종이 골짜기 안료 과립 침전", heightModelLabelEn: "Flat Wash + Valley Pigment Granulation",
    foleyProfile: { bandLowHz: 180, bandHighHz: 680, frictionIndex: 0.18, timbreKo: "부드러운 습윤 붓질 · 저마찰 수막 활주", timbreEn: "Soft wet wash glide · low bristle friction" },
    governingEquationFormula: "∂(u,p)/∂t + ∇·(ug) + J_cap(W, A)", governingEquationFamily: "3-layer-shallow-water-capillary",
  },
  "oil-wetbrush15": {
    id: "oil-wetbrush15", nameKo: "유화 · 3D 임파스토 엔진", nameEn: "Oil · 3D Impasto Wetbrush",
    familyTagKo: "3D 브리슬 · 임파스토", familyTagEn: "3D Bristle · Impasto",
    thesisKo: "필압·기울기·겹칠 횟수로 두께와 광택 예시값을 계산한다.",
    thesisEn: "Computes illustrative thickness and gloss from pressure, tilt, and pass count.",
    pigmentOklch: { l: 0.57, c: 0.175, h: 36 }, accentOklch: { l: 0.72, c: 0.14, h: 64 },
    paperCitation: {
      sourceUrls: ["https://gamma-web.iacs.umd.edu/DAB/", "https://wanghmin.github.io/publication/chen-2015-wgb/"],
      shortLabel: "Baxter '01 + Wetbrush '15",
      authors: "W. Baxter et al. (DAB) · Z. Chen, B. Kim, D. Ito, H. Wang (Wetbrush)",
      venueYear: "SIGGRAPH 2001 / SIGGRAPH Asia 2015", paperTitle: "DAB & Wetbrush: GPU-Based 3D Painting Simulation at the Bristle Level",
      equationSummaryKo: "F_rod = k_bend·Δθ (3D 브리슬) + Δh = deposit - pickup (양방향 높이장) + Sobel 45° + KM(K/S)",
      equationSummaryEn: "3D elastic bristle bending + bidirectional paint thickness heightfield + Sobel 45° relief + KM K/S",
    },
    stateBuffers: [
      { id: "bristle_3d_spring_nodes_f32", format: "rgba32float", bytesPerTexel: 16, roleKo: "3D 브리슬 탄성 마디 위치·곡률", roleEn: "3D elastic bristle spring node positions" },
      { id: "impasto_height_deposit_r32f", format: "r32float", bytesPerTexel: 4, roleKo: "유화 물감 두께 높이필드(mm)", roleEn: "Oil paint thickness heightfield (mm)" },
      { id: "km_pigment_ks_rgba16f", format: "rgba16float", bytesPerTexel: 8, roleKo: "Kubelka-Munk 흡수(K)/산란(S) + 점도", roleEn: "Kubelka-Munk K/S spectra & viscosity" },
    ],
    wgslPipeline: {
      pipelineId: "wgsl_wetbrush15_impasto_km",
      passNames: ["bristle_3d_deform", "bidirectional_height_transfer", "sobel45_impasto_km_shade"],
      workgroupSize: [8, 8, 1],
      wgslSnippet: [
        "@fragment fn sobel45_impasto_km_shade(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {",
        "  let grad = sample_sobel_height_mm(impasto_height, uv);",
        "  let n = normalize(vec3<f32>(-grad.x * 2.2, -grad.y * 2.2, 1.0));",
        "  let spec45 = pow(max(dot(n, normalize(vec3<f32>(-0.5, 0.5, 0.707))), 0.0), 28.0);",
        "  return compose_km_impasto(uv, n, spec45);",
        "}",
      ].join("\n"),
    },
    colorMixing: "kubelka-munk-impasto", colorMixingLabelKo: "Kubelka-Munk 불투명 안료 K/S 감산 혼색", colorMixingLabelEn: "Kubelka-Munk Opaque K/S Subtractive Mixing",
    edgeBehavior: "raised-impasto-ridge", edgeBehaviorLabelKo: "양측 돌출 임파스토 능선 + 45° 광택 하이라이트", edgeBehaviorLabelEn: "Raised Impasto Edge Ridge + 45° Gloss Highlight",
    heightModel: "3d-impasto-heightfield", heightModelLabelKo: "예제 mm 단위 물감 높이필드 설계", heightModelLabelEn: "Assumed mm-Scale Impasto Heightfield Design",
    foleyProfile: { bandLowHz: 220, bandHighHz: 950, frictionIndex: 0.54, timbreKo: "점성 짙은 버터형 브리슬 압착 · 린넨 마찰", timbreEn: "Viscous buttery bristle drag on primed linen" },
    governingEquationFormula: "Δh_impasto(P, η) + N_sobel(∇h)·L_45 + KM(K/S)", governingEquationFamily: "3d-elastic-bristle-impasto-km",
  },
  "sumi-moxi05": {
    id: "sumi-moxi05", nameKo: "먹물 · 갈필 MoXi 엔진", nameEn: "Sumi Ink · MoXi Dry-Brush",
    familyTagKo: "LBM 섬유 확산 · 갈필", familyTagEn: "LBM Fiber · Fei-Bai",
    thesisKo: "흡수율·수분·속도의 고정 산식으로 갈필 분기와 번짐 예시값을 계산한다.",
    thesisEn: "Uses fixed scalar formulas for illustrative dry-brush filaments and spread.",
    pigmentOklch: { l: 0.24, c: 0.016, h: 215 }, accentOklch: { l: 0.48, c: 0.06, h: 200 },
    paperCitation: {
      sourceUrls: ["https://researchportal.hkust.edu.hk/en/publications/moxi-real-time-ink-dispersion-in-absorbent-paper-2/"],
      shortLabel: "Chu & Tai SIGGRAPH '05 (MoXi)",
      authors: "N. S.-H. Chu, C.-L. Tai",
      venueYear: "SIGGRAPH 2005", paperTitle: "MoXi: Real-Time Ink Dispersion in Absorbent Paper",
      equationSummaryKo: "f_i(x+e_i,t+1) = (1-ω)f_i + ωf_i^eq (이방성 D2Q9 LBM) + 잉크 고갈 활성 모발수 N_fil 급감",
      equationSummaryEn: "Anisotropic D2Q9 Lattice-Boltzmann fiber percolation + ink-depletion active filament collapse",
    },
    stateBuffers: [
      { id: "lbm_d2q9_fiber_f16", format: "3 × rgba16float", bytesPerTexel: 24, roleKo: "9방향 LBM 섬유 분포 함수 f_0..f_8", roleEn: "9-direction LBM fiber distribution f_0..f_8" },
      { id: "ink_reservoir_tuft_f32", format: "rgba32float", bytesPerTexel: 16, roleKo: "붓모 잉크 저장량 · 활성 갈필 분기수", roleEn: "Tuft ink reservoir & active filament count" },
      { id: "carbon_glue_fixation_r16f", format: "rg16float", bytesPerTexel: 4, roleKo: "교착 송연 탄소 vs 외곽 물번짐 분리", roleEn: "Pinned carbon soot vs diffusing water fringe" },
    ],
    wgslPipeline: {
      pipelineId: "wgsl_moxi05_lbm_feibai",
      passNames: ["lbm_d2q9_stream_collide", "tuft_depletion_filament_split", "carbon_fiber_fixate"],
      workgroupSize: [8, 8, 1],
      wgslSnippet: [
        "@compute @workgroup_size(8, 8, 1) fn lbm_d2q9_stream_collide(@builtin(global_invocation_id) gid: vec3<u32>) {",
        "  let fEq = compute_anisotropic_feq(gid.xy, params.fiberAniso);",
        "  let nextF = mix(read_lbm_dir(gid.xy), fEq, 1.0 / max(params.relaxTau, 0.52));",
        "  write_lbm_and_feibai(gid.xy, nextF, params.activeFilaments);",
        "}",
      ].join("\n"),
    },
    colorMixing: "carbon-optical-density", colorMixingLabelKo: "송연 탄소 광학 밀도(Beer-Lambert) 농담 겹침", colorMixingLabelEn: "Carbon Optical Density (Beer-Lambert) Layering",
    edgeBehavior: "anisotropic-fiber-feibai", edgeBehaviorLabelKo: "이방성 섬유결 미세 번짐 + 고속 비백(갈필) 갈라짐", edgeBehaviorLabelEn: "Anisotropic Fiber Feathering + Flying-White Splits",
    heightModel: "absorbed-fiber-percolation", heightModelLabelKo: "한지·화선지 섬유 내부 침투(표면 융기 0)", heightModelLabelEn: "Sub-Surface Mulberry Fiber Percolation (Zero Ridge)",
    foleyProfile: { bandLowHz: 900, bandHighHz: 3400, frictionIndex: 0.62, timbreKo: "화선지 섬유 쓸림 + 갈필 건조 모발 스침", timbreEn: "Mulberry fiber sweep + crisp dry-bristle hiss" },
    governingEquationFormula: "f_i(x+e_i) = (1-1/τ)f_i + (1/τ)f_i^eq · N_fil(V, W)", governingEquationFamily: "lattice-boltzmann-d2q9-feibai",
  },
  "drymedia-sousa99": {
    id: "drymedia-sousa99", nameKo: "크레용 · 흑연 연필 엔진", nameEn: "Crayon & Graphite Sousa '99",
    familyTagKo: "이중 봉우리 · 버니싱", familyTagEn: "Peak Clip · Burnish",
    thesisKo: "필압·기울기·겹칠 횟수로 종이 요철과 버니싱의 예시 지표를 계산한다.",
    thesisEn: "Computes illustrative paper-tooth and burnishing indices from fixed coefficients.",
    pigmentOklch: { l: 0.44, c: 0.095, h: 158 }, accentOklch: { l: 0.62, c: 0.085, h: 146 },
    paperCitation: {
      sourceUrls: ["https://ires.cpsc.ucalgary.ca/publ/papers/1999/refs/Costa%20Sousa%20%26%20Buchanan%20%2799a.pdf"],
      shortLabel: "Sousa & Buchanan Eurographics '99",
      authors: "M. C. Sousa, J. W. Buchanan",
      venueYear: "Eurographics 1999", paperTitle: "Computer-Generated Graphite Pencil Rendering of 3D Polygonal Models",
      equationSummaryKo: "dep = clip(H_macro + H_micro, P, θ_tilt) + valleyFill(R, P) (겹칠 버니싱) + 크럼블 입자",
      equationSummaryEn: "Dual-scale paper tooth clipping + tilt flank broadening + cumulative valley burnishing & crumble",
    },
    stateBuffers: [
      { id: "dual_scale_tooth_height_rg16f", format: "rg16float", bytesPerTexel: 4, roleKo: "거시·미시 이중 스케일 종이 요철 봉우리", roleEn: "Macro & micro dual-scale paper tooth peaks" },
      { id: "burnish_valley_fill_r16f", format: "r16float", bytesPerTexel: 2, roleKo: "겹칠 누적 버니싱 골짜기 충진도", roleEn: "Cumulative multi-pass valley burnishing fill" },
      { id: "crumble_debris_instances_f32", format: "rgba32float", bytesPerTexel: 16, roleKo: "왁스·흑연 크럼블 박리 입자 인스턴스", roleEn: "Wax & graphite crumble particle scatter" },
    ],
    wgslPipeline: {
      pipelineId: "wgsl_sousa99_tooth_burnish",
      passNames: ["dual_scale_peak_clip", "tilt_flank_burnish", "wax_graphite_crumble_splat"],
      workgroupSize: [8, 8, 1],
      wgslSnippet: [
        "@compute @workgroup_size(8, 8, 1) fn dual_scale_peak_clip(@builtin(global_invocation_id) gid: vec3<u32>) {",
        "  let tooth = textureLoad(dual_scale_tooth, gid.xy, 0).rg;",
        "  let peakH = tooth.x * 0.65 + tooth.y * 0.35;",
        "  let caught = smoothstep(params.clipThreshold, params.clipThreshold + 0.14, peakH + params.valleyFill);",
        "  store_burnish_and_crumble(gid.xy, caught, params.tiltFlank);",
        "}",
      ].join("\n"),
    },
    colorMixing: "layered-dry-overprint", colorMixingLabelKo: "불투명 왁스·흑연 미세 입자 병치 오버프린트", colorMixingLabelEn: "Dry Wax & Graphite Micro-Facet Overprint",
    edgeBehavior: "tooth-peak-skip-crumble", edgeBehaviorLabelKo: "종이 봉우리만 걸리는 다공성 스킵 + 크럼블 입자", edgeBehaviorLabelEn: "Porous Tooth-Peak Skip + Wax/Graphite Crumble",
    heightModel: "tooth-clipped-micrograin", heightModelLabelKo: "봉우리 미세 적층 + 버니싱 골짜기 압착", heightModelLabelEn: "Peak-Clipped Micrograin + Burnished Valley Compaction",
    foleyProfile: { bandLowHz: 1800, bandHighHz: 6200, frictionIndex: 0.89, timbreKo: "거친 종이 요철 사각거림 · 고주파 흑연 마찰", timbreEn: "High-frequency granular tooth scratch & drag" },
    governingEquationFormula: "M_dry = step(H_dual, τ_clip(P, θ)) + ΔV_burnish(R)", governingEquationFamily: "dual-scale-tooth-clip-burnish",
  },
  "gpen-loopblinn05": {
    id: "gpen-loopblinn05", nameKo: "만화 G펜 · 벡터 SDF 엔진", nameEn: "Manga G-Pen · Loop-Blinn SDF",
    familyTagKo: "베지어 · DPI 목표 예제", familyTagEn: "Bézier · Assumed DPI Target",
    thesisKo: "필압·속도로 선폭·테이퍼 예시값과 가정한 DPI 목표값을 계산한다.",
    thesisEn: "Computes illustrative line width, taper, and an assumed DPI target.",
    pigmentOklch: { l: 0.18, c: 0.012, h: 245 }, accentOklch: { l: 0.52, c: 0.125, h: 232 },
    paperCitation: {
      sourceUrls: ["https://www.microsoft.com/en-us/research/publication/resolution-independent-curve-rendering-using-programmable-graphics-hardware/"],
      shortLabel: "Loop & Blinn '05",
      authors: "C. Loop, J. Blinn",
      venueYear: "SIGGRAPH 2005", paperTitle: "Resolution Independent Curve Rendering using Programmable Graphics Hardware",
      equationSummaryKo: "f(u,v) = u² - v (해석적 음함수 SDF) + Δw_nib(P, V) (펜촉 벌어짐) + 600DPI+ 테이퍼",
      equationSummaryEn: "Implicit quadratic/cubic Loop-Blinn SDF + pressure/speed steel nib split + analytic 600DPI AA",
    },
    stateBuffers: [
      { id: "bezier_path_segments_f32", format: "rgba32float", bytesPerTexel: 16, roleKo: "2·3차 베지어 윤곽 제어점 스트림", roleEn: "Quadratic/cubic Bézier outline control segments" },
      { id: "loop_blinn_implicit_uv_f32", format: "rgba32float", bytesPerTexel: 16, roleKo: "해석적 음함수 (u,v) · 야코비안 기울기", roleEn: "Implicit (u,v) coordinates & screen Jacobian" },
      { id: "nib_tine_dynamics_f32", format: "rg32float", bytesPerTexel: 8, roleKo: "좌·우 강철 펜촉 탄성 벌어짐(mm)", roleEn: "Left/right steel nib tine deflection (mm)" },
    ],
    wgslPipeline: {
      pipelineId: "wgsl_loopblinn05_vello_sdf",
      passNames: ["nib_tine_envelope_solve", "loop_blinn_cubic_implicit", "vello_analytic_aa_600dpi"],
      workgroupSize: [16, 4, 1],
      wgslSnippet: [
        "@fragment fn loop_blinn_cubic_implicit(@location(0) klm: vec3<f32>) -> @location(0) vec4<f32> {",
        "  let f = klm.x * klm.x * klm.x - klm.y * klm.z;",
        "  let sdfPx = f / max(length(vec2<f32>(dpdx(f), dpdy(f))), 1e-5);",
        "  return vec4<f32>(params.inkLch, clamp(0.5 - sdfPx, 0.0, 1.0));",
        "}",
      ].join("\n"),
    },
    colorMixing: "solid-opaque-india-ink", colorMixingLabelKo: "고밀도 인디아 잉크 단색 피복 + 해석적 AA", colorMixingLabelEn: "High-Density Opaque India Ink + Analytic AA",
    edgeBehavior: "analytic-bezier-sdf-razor", edgeBehaviorLabelKo: "SDF·테이퍼 설계 예제", edgeBehaviorLabelEn: "Illustrative SDF and Taper Design",
    heightModel: "flat-vector-ink-film", heightModelLabelKo: "평탄 벡터 잉크 박막 설계 예제", heightModelLabelEn: "Illustrative Flat Vector Ink Film Design",
    foleyProfile: { bandLowHz: 2400, bandHighHz: 7800, frictionIndex: 0.76, timbreKo: "켄트지 위 강철 G펜 촉 날카로운 긁힘·튕김", timbreEn: "Crisp metallic steel nib scratch & snap on Kent" },
    governingEquationFormula: "SDF = (k³ - lm)/|∇f| · w_nib(P, V)", governingEquationFamily: "loop-blinn-analytic-bezier-sdf",
  },
  "marker-foil-pbr": {
    id: "marker-foil-pbr", nameKo: "알코올 마커 · 메탈릭 포일 PBR", nameEn: "Alcohol Marker & Metallic Foil PBR",
    familyTagKo: "용제 포화 · GGX BRDF", familyTagEn: "Solvent Cap · GGX PBR",
    thesisKo: "고정 계수의 포화·거칠기·반사 예시값으로 마커와 포일 설계를 비교한다.",
    thesisEn: "Compares marker and foil designs through illustrative saturation, roughness, and reflection values.",
    pigmentOklch: { l: 0.68, c: 0.155, h: 74 }, accentOklch: { l: 0.88, c: 0.115, h: 86 },
    paperCitation: {
      sourceUrls: ["https://graphics.pixar.com/library/ReflectanceModel/paper.pdf", "https://www.cs.cornell.edu/~srm/publications/EGSR07-btdf.html"],
      shortLabel: "Cook-Torrance '82 + Walter GGX '07",
      authors: "R. L. Cook, K. E. Torrance · B. Walter et al. (Microfacet GGX)",
      venueYear: "ACM TOG 1982 / EGSR 2007", paperTitle: "A Reflectance Model for Computer Graphics & Microfacet Models for Refraction through Rough Surfaces",
      equationSummaryKo: "S_dye = S_cap(1 - e^-kR) (비혼탁 포화) + f_r = D_GGX·G·F(F0)/(4(n·l)(n·v)) (이방성 포일)",
      equationSummaryEn: "Redissolving solvent dye cap (zero muddying) + Cook-Torrance GGX anisotropic conductor BRDF",
    },
    stateBuffers: [
      { id: "alcohol_dye_saturation_rgba16f", format: "rgba16float", bytesPerTexel: 8, roleKo: "재용해 알코올 염료 · 용제 포화 상한", roleEn: "Redissolvable alcohol dye & saturation cap" },
      { id: "microfacet_tangent_aniso_rg16f", format: "rg16float", bytesPerTexel: 4, roleKo: "획 방향 정렬 금속 입자 접선 벡터", roleEn: "Stroke-aligned metallic flake tangent" },
      { id: "pbr_foil_brdf_rgba16f", format: "rgba16float", bytesPerTexel: 8, roleKo: "금속 거칠기(α) · 도체 F0 스페큘러 틴트", roleEn: "Metallic roughness (α) & conductor F0 tint" },
    ],
    wgslPipeline: {
      pipelineId: "wgsl_cook_torrance_marker_foil",
      passNames: ["solvent_redissolve_cap", "stroke_tangent_flake_align", "cook_torrance_ggx_brdf"],
      workgroupSize: [8, 8, 1],
      wgslSnippet: [
        "@fragment fn cook_torrance_ggx_brdf(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {",
        "  let a2 = params.metallicRoughness * params.metallicRoughness;",
        "  let denom = max(ndoth * ndoth * (a2 - 1.0) + 1.0, 1e-4);",
        "  let ndf = a2 / (3.14159265 * denom * denom);",
        "  return compose_foil_pbr(min(params.satCap, sample_solvent_dye(uv)), ndf, params.specularTint);",
        "}",
      ].join("\n"),
    },
    colorMixing: "solvent-dye-cap-and-pbr-f0", colorMixingLabelKo: "알코올 재용해 비혼탁 염료 상한 + 도체 F0 반사", colorMixingLabelEn: "Redissolving Dye Cap + Conductor F0 Specular",
    edgeBehavior: "chisel-clean-solvent-feather", edgeBehaviorLabelKo: "치즐 닙 깔끔한 용제 이음새 + 금속 이방성 하이라이트", edgeBehaviorLabelEn: "Clean Chisel Solvent Seam + Anisotropic Foil Sheen",
    heightModel: "microfacet-foil-film", heightModelLabelKo: "균일 용제 착색 + 미세면 금속박(포일) 반사막", heightModelLabelEn: "Uniform Dye Absorb + Microfacet Metallic Foil Film",
    foleyProfile: { bandLowHz: 650, bandHighHz: 2600, frictionIndex: 0.34, timbreKo: "매끄러운 펠트 치즐 닙 활주 · 포일 스침음", timbreEn: "Smooth felt chisel-nib squeak & crisp foil glide" },
    governingEquationFormula: "S_cap(1-e^-kR) + D_GGX(α_m)·G·F(F0_tint)", governingEquationFamily: "solvent-cap-cook-torrance-ggx",
  },
};

export const SIX_PHYSICS_BRUSH_ENGINES: readonly PhysicsBrushEngineSpec[] = [
  ENGINE_SPEC_BY_ID["watercolor-curtis97"],
  ENGINE_SPEC_BY_ID["oil-wetbrush15"],
  ENGINE_SPEC_BY_ID["sumi-moxi05"],
  ENGINE_SPEC_BY_ID["drymedia-sousa99"],
  ENGINE_SPEC_BY_ID["gpen-loopblinn05"],
  ENGINE_SPEC_BY_ID["marker-foil-pbr"],
];

export function getPhysicsBrushEngineSpec(id: PhysicsBrushEngineId): PhysicsBrushEngineSpec {
  if (!Object.hasOwn(ENGINE_SPEC_BY_ID, id)) throw new RangeError("지원하지 않는 브러시 예제 ID입니다.");
  return ENGINE_SPEC_BY_ID[id];
}

export function normalizeBrushStrokeInput(raw?: Partial<CommonBrushStrokeInput>): NormalizedBrushStrokeInput {
  const merged: CommonBrushStrokeInput = {
    pressure: raw?.pressure ?? DEFAULT_COMMON_STROKE_INPUT.pressure,
    tiltDeg: raw?.tiltDeg ?? DEFAULT_COMMON_STROKE_INPUT.tiltDeg,
    velocityPxPerSec: raw?.velocityPxPerSec ?? DEFAULT_COMMON_STROKE_INPUT.velocityPxPerSec,
    waterSolventLoad: raw?.waterSolventLoad ?? DEFAULT_COMMON_STROKE_INPUT.waterSolventLoad,
    paperAbsorbency: raw?.paperAbsorbency ?? DEFAULT_COMMON_STROKE_INPUT.paperAbsorbency,
    repeatPasses: raw?.repeatPasses ?? DEFAULT_COMMON_STROKE_INPUT.repeatPasses,
  };
  const pressure = roundTo(clamp(merged.pressure, 0.05, 1.0), 3);
  const tiltDeg = roundTo(clamp(merged.tiltDeg, 0, 75), 1);
  const velocityPxPerSec = Math.round(clamp(merged.velocityPxPerSec, 60, 2800));
  const waterSolventLoad = roundTo(clamp(merged.waterSolventLoad, 0, 1.0), 3);
  const paperAbsorbency = roundTo(clamp(merged.paperAbsorbency, 0.1, 1.0), 3);
  const repeatPasses = Math.round(clamp(merged.repeatPasses, 1, 5));
  const clamped = pressure !== merged.pressure || tiltDeg !== merged.tiltDeg || velocityPxPerSec !== merged.velocityPxPerSec
    || waterSolventLoad !== merged.waterSolventLoad || paperAbsorbency !== merged.paperAbsorbency || repeatPasses !== merged.repeatPasses;
  return { pressure, tiltDeg, velocityPxPerSec, waterSolventLoad, paperAbsorbency, repeatPasses, clamped };
}

export function simulatePhysicsBrushStroke(
  engineId: PhysicsBrushEngineId,
  rawInput?: Partial<CommonBrushStrokeInput>,
): BrushPhysicsSimulationResult {
  getPhysicsBrushEngineSpec(engineId);
  const input = normalizeBrushStrokeInput(rawInput);
  const { pressure: P, tiltDeg: T, velocityPxPerSec: V, waterSolventLoad: W, paperAbsorbency: A, repeatPasses: R } = input;
  const speedNorm = (V - 60) / (2800 - 60);
  const tiltNorm = T / 75;

  if (engineId === "watercolor-curtis97") {
    const wetLoad = clamp(0.12 + W * 0.88, 0.05, 1.0);
    const dwellFactor = clamp(1.35 - speedNorm * 0.65, 0.55, 1.35);
    const shallowWaterPeakVelocity = roundTo(clamp(wetLoad * (0.35 + 0.55 * P) * (1.15 - 0.35 * A) * 18.0, 0.2, 22.0), 2);
    const pigmentAdvectionFlux = roundTo(clamp(wetLoad * (0.4 + 0.6 * (1 - A * 0.45)) * dwellFactor, 0.05, 1.0), 3);
    const bleedRadiusMm = roundTo(clamp(0.35 + Math.pow(W, 1.45) * (2.6 + A * 4.2) * dwellFactor * (0.7 + 0.4 * P), 0.3, 11.5), 2);
    const edgeDarkeningRatio = roundTo(
      clamp(1.0 + 0.92 * Math.sin(W * Math.PI * 0.68) * (0.4 + 0.85 * Math.pow(A, 0.9)) * (0.82 + 0.14 * R), 1.0, 2.45),
      2,
    );
    const capillaryEdgeDeposit = roundTo(clamp((edgeDarkeningRatio - 1.0) / 1.45, 0, 1), 3);
    const granulationSettling = roundTo(clamp((0.25 + 0.65 * A) * (0.35 + 0.65 * W) * (1 - 0.25 * P), 0.05, 0.98), 3);
    const centerWashLightening = roundTo(clamp((edgeDarkeningRatio - 1.0) * 0.36, 0, 0.55), 3);
    const paintThicknessMm = roundTo(0.01 + 0.004 * R, 3);
    return {
      engineId, input, effectiveStrokeWidthMm: roundTo(4.2 + P * 7.8 + bleedRadiusMm * 1.15, 2), paintThicknessMm,
      edgeContrastIndex: roundTo(clamp((edgeDarkeningRatio - 1.0) * 0.78, 0.05, 1.0), 3),
      pigmentOpacityRatio: roundTo(clamp(0.24 + (1 - W * 0.52) * 0.42 + (R - 1) * 0.08, 0.16, 0.86), 3),
      signatureMetricLabelKo: "에지 농축비", signatureMetricLabelEn: "Edge Darkening", signatureMetricValue: `${edgeDarkeningRatio.toFixed(2)}×`,
      secondaryMetricLabelKo: "번짐 반경", secondaryMetricLabelEn: "Bleed Radius", secondaryMetricValue: `${bleedRadiusMm.toFixed(2)} mm`,
      physics: {
        kind: "watercolor-curtis97", shallowWaterPeakVelocity, pigmentAdvectionFlux, capillaryEdgeDeposit,
        edgeDarkeningRatio, bleedRadiusMm, backrunStrength: capillaryEdgeDeposit, granulationSettling, centerWashLightening,
      },
    };
  }

  if (engineId === "oil-wetbrush15") {
    const viscosity = roundTo(clamp(1.0 - W * 0.72, 0.22, 1.0), 3);
    const bristleBendDeg = roundTo(clamp(12 + P * 42 + T * 0.48, 8, 78), 1);
    const bristleSplayFactor = roundTo(clamp(1.0 + P * 0.65 + tiltNorm * 0.55, 1.0, 2.2), 2);
    const canvasPickupRatio = roundTo(clamp(0.18 + (1 - viscosity) * 0.42 + P * 0.24 + (R - 1) * 0.05, 0.1, 0.88), 3);
    const depositionVolumeMm3 = roundTo(clamp((0.55 + P * 1.45) * viscosity * (0.75 + 0.28 * R) * (1.15 - speedNorm * 0.35), 0.15, 4.8), 2);
    const paintThicknessMm = roundTo(clamp(0.28 + P * 1.35 * viscosity + (R - 1) * 0.22 * viscosity - speedNorm * 0.24 * viscosity, 0.12, 2.85), 2);
    const sobelNormalSlope = roundTo(clamp(paintThicknessMm * 0.38 * (0.85 + 0.25 * viscosity), 0.08, 0.98), 3);
    const highlight45Specular = roundTo(clamp(0.24 + sobelNormalSlope * 0.52 + (1 - A * 0.3) * 0.22, 0.15, 0.96), 3);
    const kubelkaMunkBlendRatio = roundTo(clamp(0.45 + canvasPickupRatio * 0.45, 0.35, 0.95), 3);
    return {
      engineId, input, effectiveStrokeWidthMm: roundTo(5.0 + P * 6.8 * bristleSplayFactor, 2), paintThicknessMm,
      edgeContrastIndex: roundTo(clamp(0.42 + sobelNormalSlope * 0.54, 0.2, 0.98), 3),
      pigmentOpacityRatio: roundTo(clamp(0.66 + viscosity * 0.28 + (R - 1) * 0.02, 0.55, 0.99), 3),
      signatureMetricLabelKo: "임파스토 두께", signatureMetricLabelEn: "Paint Thickness", signatureMetricValue: `${paintThicknessMm.toFixed(2)} mm`,
      secondaryMetricLabelKo: "45° 광택 · KM", secondaryMetricLabelEn: "45° Gloss · KM", secondaryMetricValue: `${Math.round(highlight45Specular * 100)}%`,
      physics: {
        kind: "oil-wetbrush15", viscosity, bristleBendDeg, bristleSplayFactor, canvasPickupRatio,
        depositionVolumeMm3, paintThicknessMm, sobelNormalSlope, highlight45Specular, kubelkaMunkBlendRatio,
      },
    };
  }

  if (engineId === "sumi-moxi05") {
    const lbmAnisotropyRatio = roundTo(clamp(1.45 + A * 1.65 + W * 0.55, 1.3, 3.8), 2);
    const fiberFeatheringMm = roundTo(clamp((0.25 + W * 2.4) * (0.4 + A * 0.85) * (1.2 - speedNorm * 0.55), 0.1, 4.5), 2);
    const lbmRelaxationTau = roundTo(clamp(0.56 + (1 - W) * 0.52 + (1 - A) * 0.22, 0.52, 1.35), 3);
    const inkDepletionRatio = roundTo(clamp(0.12 + speedNorm * 0.58 + (1 - W) * 0.46 - P * 0.18, 0.02, 0.98), 3);
    const activeFilaments = Math.round(clamp(16 - Math.pow(inkDepletionRatio, 1.35) * 14, 2, 16));
    const flyingWhiteGapRatio = roundTo(clamp(Math.pow(inkDepletionRatio, 1.25) * 0.88, 0.02, 0.92), 3);
    const carbonSeepageRatio = roundTo(clamp(0.3 + A * 0.45 + W * 0.2, 0.2, 0.95), 3);
    return {
      engineId, input, effectiveStrokeWidthMm: roundTo(3.2 + P * 9.4 + fiberFeatheringMm * 0.85, 2), paintThicknessMm: 0.01,
      edgeContrastIndex: roundTo(clamp(0.36 + flyingWhiteGapRatio * 0.56, 0.18, 0.95), 3),
      pigmentOpacityRatio: roundTo(clamp(0.88 - flyingWhiteGapRatio * 0.42 - W * 0.18 + (R - 1) * 0.05, 0.22, 0.96), 3),
      signatureMetricLabelKo: "갈필 활성 모발", signatureMetricLabelEn: "Active Filaments", signatureMetricValue: `${activeFilaments} / 16`,
      secondaryMetricLabelKo: "이방성 번짐", secondaryMetricLabelEn: "LBM Aniso Ratio", secondaryMetricValue: `${lbmAnisotropyRatio.toFixed(2)}×`,
      physics: {
        kind: "sumi-moxi05", lbmAnisotropyRatio, fiberFeatheringMm, lbmRelaxationTau,
        inkDepletionRatio, activeFilaments, flyingWhiteGapRatio, carbonSeepageRatio,
      },
    };
  }

  if (engineId === "drymedia-sousa99") {
    const peakClippingRatio = roundTo(clamp(0.92 - P * 0.56 + tiltNorm * 0.18 - (R - 1) * 0.09, 0.08, 0.96), 3);
    const sideShadingWidthMultiplier = roundTo(clamp(1.0 + Math.pow(tiltNorm, 1.2) * 2.4, 1.0, 3.4), 2);
    const valleyFill = roundTo(clamp(0.08 + P * 0.42 + (R - 1) * 0.145 * (0.55 + 0.6 * P) - tiltNorm * 0.08, 0.04, 0.98), 3);
    const crumbleParticleDensity = roundTo(clamp(0.14 + P * 0.48 + speedNorm * 0.22 + (R - 1) * 0.05, 0.08, 0.96), 3);
    const burnishGlossRatio = roundTo(clamp(0.08 + valleyFill * 0.72, 0.05, 0.88), 3);
    const paintThicknessMm = roundTo(0.04 + valleyFill * 0.16, 2);
    return {
      engineId, input, effectiveStrokeWidthMm: roundTo((2.1 + P * 3.4) * sideShadingWidthMultiplier, 2), paintThicknessMm,
      edgeContrastIndex: roundTo(clamp(0.32 + peakClippingRatio * 0.58, 0.2, 0.94), 3),
      pigmentOpacityRatio: roundTo(clamp(0.28 + valleyFill * 0.62, 0.22, 0.94), 3),
      signatureMetricLabelKo: "버니싱 골짜기 충진", signatureMetricLabelEn: "Valley Fill Burnish", signatureMetricValue: `${Math.round(valleyFill * 100)}%`,
      secondaryMetricLabelKo: "옆면 섀이딩 폭", secondaryMetricLabelEn: "Side Shading", secondaryMetricValue: `${sideShadingWidthMultiplier.toFixed(2)}×`,
      physics: { kind: "drymedia-sousa99", peakClippingRatio, sideShadingWidthMultiplier, valleyFill, crumbleParticleDensity, burnishGlossRatio },
    };
  }

  if (engineId === "gpen-loopblinn05") {
    const sdfEdgeSharpnessDpi = Math.round(MIN_GPEN_SDF_DPI + (1 - A * 0.25) * 600);
    const bezierControlDensityPerCm = roundTo(clamp(2.4 + speedNorm * 1.8 + P * 1.4, 2.0, 6.5), 2);
    const velocityClamp = clamp(1.0 - speedNorm * 0.42, 0.48, 1.0);
    const nibSplitMm = roundTo(clamp(0.08 + Math.pow(P, 1.25) * 1.48 * velocityClamp * (1.0 - tiltNorm * 0.18), 0.08, 1.65), 3);
    const taperSharpnessRatio = roundTo(clamp(0.58 + speedNorm * 0.36 + (1 - P) * 0.12, 0.55, 0.99), 3);
    const railroadSplitRisk = roundTo(clamp(Math.max(0, speedNorm - 0.55) * 0.9 * (1 - W * 0.5), 0, 0.65), 3);
    return {
      engineId, input, effectiveStrokeWidthMm: roundTo(0.18 + nibSplitMm * 1.45, 2), paintThicknessMm: 0.02,
      edgeContrastIndex: 0.99, pigmentOpacityRatio: 0.99,
      signatureMetricLabelKo: "펜촉 벌어짐", signatureMetricLabelEn: "Nib Split", signatureMetricValue: `${nibSplitMm.toFixed(2)} mm`,
      secondaryMetricLabelKo: "가정 DPI 목표", secondaryMetricLabelEn: "Assumed DPI Target", secondaryMetricValue: `${sdfEdgeSharpnessDpi} DPI`,
      physics: { kind: "gpen-loopblinn05", sdfEdgeSharpnessDpi, bezierControlDensityPerCm, nibSplitMm, taperSharpnessRatio, railroadSplitRisk },
    };
  }

  const solventSaturationCeiling = roundTo(clamp(0.76 + (1 - A * 0.2) * 0.18, 0.72, 0.95), 3);
  const achievedSaturation = roundTo(clamp(solventSaturationCeiling * (1 - Math.exp(-0.78 * R * (0.62 + 0.58 * W))), 0.18, solventSaturationCeiling), 3);
  const muddyPreventionScore = roundTo(clamp(0.91 + 0.08 * (1 - Math.abs(achievedSaturation - solventSaturationCeiling * 0.85)) - 0.02 * (R - 1), 0.86, 0.99), 3);
  const metallicRoughness = roundTo(clamp(0.14 + A * 0.34 - P * 0.08 + (1 - W) * 0.12, 0.08, 0.62), 3);
  const alphaSq = metallicRoughness * metallicRoughness;
  const ggxSpecularReflectance = roundTo(clamp((1.0 / (1.0 + alphaSq * 14.0)) * (0.72 + 0.28 * Math.cos((T * Math.PI) / 180)), 0.18, 0.97), 3);
  const anisotropicFlakeAlignment = roundTo(clamp(0.52 + speedNorm * 0.38 + tiltNorm * 0.12, 0.45, 0.98), 3);
  const specularTint = sanitizeNonVioletOklch({ l: 0.88 + (1 - metallicRoughness) * 0.08, c: 0.095 + ggxSpecularReflectance * 0.04, h: 76 + tiltNorm * 16 });
  const paintThicknessMm = roundTo(0.05 + P * 0.09 + (R - 1) * 0.015, 2);
  return {
    engineId, input, effectiveStrokeWidthMm: roundTo(4.6 + tiltNorm * 4.4 + P * 1.8, 2), paintThicknessMm,
    edgeContrastIndex: roundTo(clamp(0.72 + (1 - W * 0.25) * 0.18, 0.55, 0.92), 3),
    pigmentOpacityRatio: roundTo(clamp(0.45 + achievedSaturation * 0.48, 0.38, 0.94), 3),
    signatureMetricLabelKo: "금속 거칠기 · GGX", signatureMetricLabelEn: "Metallic Roughness", signatureMetricValue: `${metallicRoughness.toFixed(2)} α`,
    secondaryMetricLabelKo: "비혼탁 포화도", secondaryMetricLabelEn: "Clean Dye Sat", secondaryMetricValue: `${Math.round(achievedSaturation * 100)}%`,
    physics: {
      kind: "marker-foil-pbr", solventSaturationCeiling, achievedSaturation, muddyPreventionScore,
      metallicRoughness, ggxSpecularReflectance, anisotropicFlakeAlignment, specularTint,
    },
  };
}

function computeFoleyBandDivergence(a: AcousticFoleyProfile, b: AcousticFoleyProfile): number {
  const overlap = Math.max(0, Math.min(a.bandHighHz, b.bandHighHz) - Math.max(a.bandLowHz, b.bandLowHz));
  const union = Math.max(a.bandHighHz, b.bandHighHz) - Math.min(a.bandLowHz, b.bandLowHz);
  const iou = union > 0 ? overlap / union : 1;
  return Math.round(clamp((1 - iou) * 72 + Math.abs(a.frictionIndex - b.frictionIndex) * 38, 0, 100));
}

export function compareBrushPhysicsDivergence(
  primaryId: PhysicsBrushEngineId,
  compareId: PhysicsBrushEngineId,
  rawInput?: Partial<CommonBrushStrokeInput>,
): BrushPhysicsDivergenceReport {
  const input = normalizeBrushStrokeInput(rawInput);
  const specA = getPhysicsBrushEngineSpec(primaryId);
  const specB = getPhysicsBrushEngineSpec(compareId);
  const simA = simulatePhysicsBrushStroke(primaryId, rawInput);
  const simB = simulatePhysicsBrushStroke(compareId, rawInput);
  const isDistinct = primaryId !== compareId;

  const idsA = new Set(specA.stateBuffers.map((b) => b.id));
  const sharedCount = specB.stateBuffers.filter((b) => idsA.has(b.id)).length;
  const totalUnique = new Set([...specA.stateBuffers.map((b) => b.id), ...specB.stateBuffers.map((b) => b.id)]).size;
  const sharedBufferOverlapPct = totalUnique > 0 ? Math.round((sharedCount / totalUnique) * 100) : 100;

  const bytesA = specA.stateBuffers.reduce((acc, item) => acc + item.bytesPerTexel, 0);
  const bytesB = specB.stateBuffers.reduce((acc, item) => acc + item.bytesPerTexel, 0);
  const byteRatioDelta = Math.abs(bytesA - bytesB) / Math.max(bytesA, bytesB, 1);
  const bufferScore = isDistinct ? Math.round(clamp(88 + byteRatioDelta * 12 - sharedBufferOverlapPct * 0.8, 70, 100)) : 0;
  const eqScore = !isDistinct ? 0 : specA.governingEquationFamily === specB.governingEquationFamily ? 25 : 98;
  const edgeDelta = Math.abs(simA.edgeContrastIndex - simB.edgeContrastIndex);
  const edgeScore = !isDistinct ? 0 : specA.edgeBehavior === specB.edgeBehavior ? Math.round(edgeDelta * 40) : Math.round(clamp(82 + edgeDelta * 18, 82, 100));
  const colorScore = !isDistinct ? 0 : specA.colorMixing === specB.colorMixing ? 15 : 92;
  const heightDelta = Math.abs(simA.paintThicknessMm - simB.paintThicknessMm);
  const heightScore = !isDistinct ? 0 : specA.heightModel === specB.heightModel ? Math.round(clamp(heightDelta / 1.4, 0, 1) * 40) : Math.round(clamp(74 + clamp(heightDelta / 1.4, 0, 1) * 26, 74, 100));
  const foleyScore = isDistinct ? Math.max(48, computeFoleyBandDivergence(specA.foleyProfile, specB.foleyProfile)) : 0;

  const axes: readonly BrushDivergenceAxis[] = [
    {
      id: "state-buffer-topology", labelKo: "상태 버퍼 구조", labelEn: "State Buffer Topology", divergenceScore: bufferScore,
      primarySummaryKo: `${specA.stateBuffers.length}개 전용 버퍼 (${bytesA}B/texel)`, primarySummaryEn: `${specA.stateBuffers.length} dedicated buffers (${bytesA}B/texel)`,
      compareSummaryKo: `${specB.stateBuffers.length}개 전용 버퍼 (${bytesB}B/texel)`, compareSummaryEn: `${specB.stateBuffers.length} dedicated buffers (${bytesB}B/texel)`,
      architecturalReasonKo: isDistinct ? `공유 버퍼 ${sharedBufferOverlapPct}% — ${specA.stateBuffers[0]?.id} vs ${specB.stateBuffers[0]?.id}로 버퍼 이름을 다르게 지정한 설계 예제` : "동일 엔진 선택: 동일한 GPU 상태 버퍼 스키마 사용",
      architecturalReasonEn: isDistinct ? `${sharedBufferOverlapPct}% shared buffers — separate GPU layout names in this design example (${specA.stateBuffers[0]?.id} vs ${specB.stateBuffers[0]?.id})` : "Identical engine selected: same GPU state buffer schema",
    },
    {
      id: "governing-equation", labelKo: "지배 물리 방정식", labelEn: "Governing Equation", divergenceScore: eqScore,
      primarySummaryKo: specA.governingEquationFormula, primarySummaryEn: specA.governingEquationFormula,
      compareSummaryKo: specB.governingEquationFormula, compareSummaryEn: specB.governingEquationFormula,
      architecturalReasonKo: isDistinct ? `${specA.paperCitation.shortLabel}과 ${specB.paperCitation.shortLabel}의 WGSL 패스 이름 예제(${specA.wgslPipeline.pipelineId} ≠ ${specB.wgslPipeline.pipelineId})` : "동일한 산식·WGSL 설계 문자열",
      architecturalReasonEn: isDistinct ? `Illustrative WGSL pass names (${specA.wgslPipeline.pipelineId} != ${specB.wgslPipeline.pipelineId})` : "Same formula and WGSL design strings",
    },
    {
      id: "edge-behavior", labelKo: "에지 거동", labelEn: "Edge Behavior", divergenceScore: edgeScore,
      primarySummaryKo: specA.edgeBehaviorLabelKo, primarySummaryEn: specA.edgeBehaviorLabelEn,
      compareSummaryKo: specB.edgeBehaviorLabelKo, compareSummaryEn: specB.edgeBehaviorLabelEn,
      architecturalReasonKo: isDistinct ? `동일 필압(${Math.round(input.pressure * 100)}%)에서 에지 대비 ${Math.round(simA.edgeContrastIndex * 100)}% vs ${Math.round(simB.edgeContrastIndex * 100)}%로 경계 물리 판정식이 다름` : "동일한 에지 경계 함수 적용",
      architecturalReasonEn: isDistinct ? `Same pressure (${Math.round(input.pressure * 100)}%) yields ${Math.round(simA.edgeContrastIndex * 100)}% vs ${Math.round(simB.edgeContrastIndex * 100)}% edge contrast via distinct boundary physics` : "Same edge boundary operator applied",
    },
    {
      id: "color-mixing-model", labelKo: "혼색 방식", labelEn: "Color Mixing Model", divergenceScore: colorScore,
      primarySummaryKo: specA.colorMixingLabelKo, primarySummaryEn: specA.colorMixingLabelEn,
      compareSummaryKo: specB.colorMixingLabelKo, compareSummaryEn: specB.colorMixingLabelEn,
      architecturalReasonKo: isDistinct ? `RGBA 단순 알파 블렌딩이 아니라 각 매체의 광학 전달식(${specA.colorMixing} vs ${specB.colorMixing})이 분리됨` : "동일한 광학 혼색 모델 사용",
      architecturalReasonEn: isDistinct ? `Distinct optical transport models (${specA.colorMixing} vs ${specB.colorMixing}) beyond plain alpha blending` : "Same optical color-mixing model",
    },
    {
      id: "surface-relief-height", labelKo: "입체 높이 · 단면", labelEn: "Surface Relief Height", divergenceScore: heightScore,
      primarySummaryKo: `${simA.paintThicknessMm.toFixed(2)}mm · ${specA.heightModelLabelKo}`, primarySummaryEn: `${simA.paintThicknessMm.toFixed(2)}mm · ${specA.heightModelLabelEn}`,
      compareSummaryKo: `${simB.paintThicknessMm.toFixed(2)}mm · ${specB.heightModelLabelKo}`, compareSummaryEn: `${simB.paintThicknessMm.toFixed(2)}mm · ${specB.heightModelLabelEn}`,
      architecturalReasonKo: isDistinct ? `매체 두께 차 ${heightDelta.toFixed(2)}mm — 표면 융기·골짜기 침전·섬유 침투·미세면 박막의 단면 구조가 다름` : "동일한 종이-안료 단면 모델",
      architecturalReasonEn: isDistinct ? `${heightDelta.toFixed(2)}mm thickness delta across distinct paper-medium cross-section paradigms` : "Same paper-medium cross-section paradigm",
    },
    {
      id: "acoustic-foley-band", labelKo: "청각 Foley 대역", labelEn: "Acoustic Foley Band", divergenceScore: foleyScore,
      primarySummaryKo: `${specA.foleyProfile.bandLowHz}~${specA.foleyProfile.bandHighHz}Hz (마찰 ${Math.round(specA.foleyProfile.frictionIndex * 100)}%)`,
      primarySummaryEn: `${specA.foleyProfile.bandLowHz}-${specA.foleyProfile.bandHighHz}Hz (friction ${Math.round(specA.foleyProfile.frictionIndex * 100)}%)`,
      compareSummaryKo: `${specB.foleyProfile.bandLowHz}~${specB.foleyProfile.bandHighHz}Hz (마찰 ${Math.round(specB.foleyProfile.frictionIndex * 100)}%)`,
      compareSummaryEn: `${specB.foleyProfile.bandLowHz}-${specB.foleyProfile.bandHighHz}Hz (friction ${Math.round(specB.foleyProfile.frictionIndex * 100)}%)`,
      architecturalReasonKo: isDistinct ? `가정한 마찰음 대역값 비교(${specA.foleyProfile.timbreKo} ↔ ${specB.foleyProfile.timbreKo})` : "동일한 Foley 마찰 스펙트럼 프로파일",
      architecturalReasonEn: isDistinct ? `Assumed acoustic bands (${specA.foleyProfile.timbreEn} vs ${specB.foleyProfile.timbreEn})` : "Same tactile Foley acoustic profile",
    },
  ];

  const overallDivergenceScore = isDistinct ? Math.round(axes.reduce((acc, axis) => acc + axis.divergenceScore, 0) / axes.length) : 0;
  return {
    primaryId, compareId, isDistinctArchitecture: isDistinct, isSliderTweakOnly: !isDistinct,
    overallDivergenceScore, sharedBufferOverlapPct, axes, primarySim: simA, compareSim: simB,
    verdictKo: isDistinct
      ? `설계 예제 점수 (${overallDivergenceScore}/100): 버퍼 이름·분류·가정 계수를 비교한 값이며 실제 GPU 실행·브러시 품질 검증값이 아니다.`
      : "동일 엔진 비교 상태(0/100): 서로 다른 브러시 계열을 선택하면 6축 아키텍처 분화도를 확인할 수 있다.",
    verdictEn: isDistinct
      ? `Illustrative design score (${overallDivergenceScore}/100): compares buffer names, categories, and assumed coefficients; GPU execution and brush quality are unverified.`
      : "Same engine selected (0/100): pick two distinct brush engines to quantify 6-axis architectural divergence.",
  };
}

export function buildBrushPhysicsManifest(options: {
  readonly primaryId: PhysicsBrushEngineId;
  readonly compareId: PhysicsBrushEngineId;
  readonly input?: Partial<CommonBrushStrokeInput>;
}): BrushPhysicsPipelineManifest {
  const report = compareBrushPhysicsDivergence(options.primaryId, options.compareId, options.input);
  const specA = getPhysicsBrushEngineSpec(options.primaryId);
  const specB = getPhysicsBrushEngineSpec(options.compareId);
  const uniqueSpecs = specA.id === specB.id ? [specA] : [specA, specB];
  return {
    schemaVersion: SIX_PHYSICS_MANIFEST_SCHEMA_VERSION,
    generatedFromModel: "deterministic-cpu-physics-lab",
    runtimeState: { model: "illustrative-cpu-formulas", gpuExecuted: false, wasmExecuted: false, audioPlayed: false, canvasApplied: false, persisted: false, calibratedPhysicalUnits: false, validatedPrintDpi: false },
    primaryEngineId: specA.id,
    compareEngineId: specB.id,
    strokeInput: report.primarySim.input,
    divergenceReport: report,
    activeEngines: uniqueSpecs.map((spec) => ({
      id: spec.id, citation: { ...spec.paperCitation, sourceUrls: [...spec.paperCitation.sourceUrls] },
      stateBuffers: spec.stateBuffers.map((buffer) => ({ ...buffer })),
      wgslPipeline: { ...spec.wgslPipeline, passNames: [...spec.wgslPipeline.passNames] as const, workgroupSize: [...spec.wgslPipeline.workgroupSize] as const },
    })),
    honestyNoteKo: "현재 구현(Current): 고정 계수의 CPU 계산과 SVG 도해, WGSL 설계 문자열 예제다. mm·DPI·Foley 대역·분화 점수는 가정값이며 물리 실측이나 논문 재현 검증값이 아니다. 실제 GPU·WASM·음성 재생·캔버스 반영·저장은 연결하지 않았다. 향후 목표(Target): 별도 검증 후 렌더러에 연결한다.",
    honestyNoteEn: "Current: Illustrative CPU formulas, SVG diagrams, and incomplete WGSL design strings. mm, DPI, Foley bands, and divergence scores are assumed, not physical measurements or paper reproductions. GPU, WASM, audio, canvas application, and persistence are unconnected. Target: Renderer integration after separate validation.",
  };
}

export function exportBrushPhysicsManifestJson(options: {
  readonly primaryId: PhysicsBrushEngineId;
  readonly compareId: PhysicsBrushEngineId;
  readonly input?: Partial<CommonBrushStrokeInput>;
}): { readonly json: string; readonly manifest: BrushPhysicsPipelineManifest } {
  const manifest = buildBrushPhysicsManifest(options);
  return { json: JSON.stringify(manifest, null, 2), manifest };
}
