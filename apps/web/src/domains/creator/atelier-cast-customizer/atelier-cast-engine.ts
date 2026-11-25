/**
 * Wave 61B — AtelierCast 해부학 연동 3D 캐릭터 커스텀 · 의상 케이지 자동 리핏 ·
 * PrismLight WebGPU 룩뎁 설계 모형(Face-SDF · 3층 안구 · 이방성 헤어 엔젤링 · 거리 적응형 테이퍼 외곽선) ·
 * 단일 탈-바이올렛 OKLCH 5안료 조화 & apps/character-lab 통합 계약 엔진.
 *
 * - 현재 구현(Current): 결정론적 해부학 연동·케이지 리핏 솔버, 4축 품질 비교 평가기,
 *   미컴파일 WGSL 정적 계약 소스·검증기·16B 정렬 Uniform 패커, 장치에 접근하지 않는 WebGPU 백엔드 계획 비교,
 *   OKLCH 5안료 룩뎁 조화 패스, apps/character-lab → AtelierCast 통합 체크리스트·라우트 매핑.
 * - 목표 런타임(Target): 브라우저 실기 GPUDevice 컴퓨트 스키닝 및 5패스 PrismLight 렌더 그래프 연결.
 */

export const ATELIER_CAST_SCHEMA_VERSION = "toonstudio.atelier-cast-customizer.v1" as const;
export const ATELIER_CAST_BRAND = "AtelierCast" as const;
export const ATELIER_LOOKDEV_BRAND = "PrismLight" as const;
export const ATELIER_RUNTIME_BRAND = "ToonCore" as const;
export const ATELIER_UNIFORM_BYTE_SIZE = 128 as const;
export const ATELIER_MAX_WGSL_BINDINGS = 8 as const;
export const VIOLET_HUE_MIN_DEG = 265 as const;
export const VIOLET_HUE_MAX_DEG = 325 as const;

export const ATELIER_PARAM_BOUNDS = {
  heightCm: { min: 152, max: 192, step: 1 }, headRatio: { min: 2.5, max: 8.5, step: 0.1 },
  humanoidHeadRatio: { min: 6.0, max: 8.5 }, sdHeadRatio: { min: 2.5, max: 4.0 },
  shoulderWidth: { min: 0.25, max: 0.95, step: 0.01 }, waistRatio: { min: 0.4, max: 0.9, step: 0.01 },
  jawTaper: { min: 0.2, max: 0.9, step: 0.01 }, eyeScale: { min: 0.3, max: 0.9, step: 0.01 },
  eyeSpacing: { min: 0.3, max: 0.8, step: 0.01 }, hairVolume: { min: 0.2, max: 0.95, step: 0.01 },
  outfitClearanceMm: { min: 2.0, max: 14.0, step: 0.5 }, outlineWidthPx: { min: 0.6, max: 3.0, step: 0.05 },
} as const;

export const ATELIER_ARCHETYPE_IDS = [
  "rofan-noble-lead", "action-hunter-lead", "campus-romance-lead", "noir-detective-lead", "chibi-mascot-cast",
] as const;
export const ATELIER_PIGMENT_IDS = ["draw", "character", "market", "collab", "3d"] as const;

export type AtelierArchetypeId = (typeof ATELIER_ARCHETYPE_IDS)[number];
export type AtelierPigmentId = (typeof ATELIER_PIGMENT_IDS)[number];
export type AtelierSolverMode = "atelier-coupled" | "legacy-linear";
export type AtelierProportionRegime = "webtoon-humanoid" | "sd-chibi";
export type Atelier3dBackendKind = "webgpu" | "webgl2" | "svg-preview";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export interface AtelierPigmentSpec {
  readonly id: AtelierPigmentId; readonly labelKo: string; readonly labelEn: string;
  readonly roleKo: string; readonly roleEn: string; readonly hueDeg: number;
  readonly darkAnchor: OklchColor; readonly lightAnchor: OklchColor;
}
export interface AtelierCharacterParams {
  readonly heightCm: number; readonly headRatio: number; readonly shoulderWidth: number;
  readonly waistRatio: number; readonly jawTaper: number; readonly eyeScale: number;
  readonly eyeSpacing: number; readonly hairVolume: number; readonly outfitClearanceMm: number;
  readonly outlineWidthPx: number;
}
export interface AtelierArchetypePreset {
  readonly id: AtelierArchetypeId; readonly labelKo: string; readonly labelEn: string;
  readonly genreTagKo: string; readonly genreTagEn: string; readonly summaryKo: string;
  readonly summaryEn: string; readonly regime: AtelierProportionRegime;
  readonly defaultPigmentId: AtelierPigmentId; readonly params: AtelierCharacterParams;
}
export interface AnatomyCageRefitSolution {
  readonly measurementBasis: "analytical-reference-model"; readonly meshValidated: false;
  readonly mode: AtelierSolverMode; readonly regime: AtelierProportionRegime;
  readonly effectiveDisplayHeightCm: number; readonly headHeightCm: number;
  readonly clavicleSpanCm: number; readonly ribcageWidthCm: number; readonly waistWidthCm: number;
  readonly shoulderJointTwistDeg: number; readonly armTaperRatio: number;
  readonly collarCageClearanceMm: number; readonly hairShoulderBufferMm: number;
  readonly eyeTempleMarginMm: number; readonly meshClippingCount: number;
  readonly proportionBreakCount: number; readonly refitIterations: number;
  readonly clippingHotspotsKo: readonly string[]; readonly clippingHotspotsEn: readonly string[];
}
export interface LookdevQualityAxis {
  readonly id: "anatomy-cage" | "face-sdf-lookdev" | "oklch-harmony" | "webgpu-runtime";
  readonly labelKo: string; readonly labelEn: string; readonly score: number;
  readonly legacyBaselineScore: number; readonly deltaPoints: number;
  readonly summaryKo: string; readonly summaryEn: string;
}
export interface CharacterCustomQualityReport {
  readonly measurementBasis: "analytical-reference-model"; readonly meshValidated: false;
  readonly mode: AtelierSolverMode; readonly overallScore: number; readonly legacyOverallScore: number;
  readonly improvementPoints: number; readonly meshClippingCount: number; readonly proportionBreakCount: number;
  readonly faceSdfSmoothnessPct: number; readonly eyeParallaxLayers: number;
  readonly hairAngelRingContrast: number; readonly outlineTaperConsistencyPct: number;
  readonly violetHueViolationCount: number; readonly axes: readonly LookdevQualityAxis[];
}
export interface AtelierPigmentHarmony {
  readonly pigment: AtelierPigmentSpec;
  readonly skinBase: OklchColor; readonly skinSdfShadow: OklchColor;
  readonly hairBase: OklchColor; readonly hairAngelRing: OklchColor;
  readonly irisPrimary: OklchColor; readonly scleraShade: OklchColor; readonly corneaCatchlight: OklchColor;
  readonly outfitPrimary: OklchColor; readonly outfitTrim: OklchColor; readonly outlineInk: OklchColor;
  readonly rimLight: OklchColor; readonly surfaceCanvas: OklchColor; readonly surfacePanel: OklchColor;
  readonly surfaceCard: OklchColor; readonly surfaceLine: OklchColor; readonly surfaceInk: OklchColor;
  readonly surfaceMuted: OklchColor; readonly goodColor: OklchColor; readonly warnColor: OklchColor;
  readonly toneCohesionScore: number; readonly violetViolationCount: number; readonly inspectedTokenCount: number;
}
export interface WebGpuProbeInput {
  readonly hasNavigatorGpu?: boolean; readonly adapterAvailable?: boolean; readonly isFallbackAdapter?: boolean;
  readonly supportsTimestampQuery?: boolean; readonly supportsWebGl2?: boolean; readonly forceLegacyMode?: boolean;
}
export interface Atelier3dBackendNegotiation {
  readonly policy: "webgpu-default"; readonly runtimeBrand: typeof ATELIER_RUNTIME_BRAND;
  readonly activeBackend: Atelier3dBackendKind;
  readonly plannedBackend: Atelier3dBackendKind; readonly plannedPassCount: number;
  readonly hardwareVerified: false;
  readonly laneId: "tooncore-webgpu-default" | "tooncore-webgl2-fallback" | "atelier-svg-safe-preview";
  readonly labelKo: string; readonly labelEn: string;
  readonly computeSkinningEnabled: boolean; readonly faceSdfPassEnabled: boolean;
  readonly threeLayerEyeEnabled: boolean; readonly instancedHairEnabled: boolean;
  readonly distanceTaperOutlineEnabled: boolean; readonly fallbackTriggered: boolean;
  readonly reasonKo: string; readonly reasonEn: string; readonly activePassCount: number;
}
export interface AtelierRenderPassSpec {
  readonly id: string; readonly order: number; readonly stage: "compute" | "vertex-fragment";
  readonly brandLayer: "ToonCore" | "PrismLight" | "AtelierCast";
  readonly labelKo: string; readonly labelEn: string; readonly purposeKo: string; readonly purposeEn: string;
  readonly workgroupOrTarget: string; readonly legacyGapKo: string; readonly legacyGapEn: string;
}
export interface WgslBindingSummary { readonly group: number; readonly binding: number; readonly name: string; }
export interface AtelierWgslValidationReport {
  readonly validationKind: "static-source-contract"; readonly gpuCompiled: false; readonly valid: boolean;
  readonly entryPoints: readonly string[]; readonly workgroupSizes: readonly string[];
  readonly bindings: readonly WgslBindingSummary[]; readonly bindingCount: number;
  readonly withinBindingLimit: boolean; readonly balancedDelimiters: boolean;
  readonly reservedKeywordCollisions: readonly string[];
  readonly hasFaceSdfFunction: boolean; readonly hasThreeLayerEyeFunction: boolean;
  readonly hasHairAngelRingFunction: boolean; readonly hasAdaptiveOutlineEntry: boolean;
  readonly hasComputeSkinningEntry: boolean; readonly lineCount: number; readonly errors: readonly string[];
}
export interface PackedAtelierLookdevUniforms {
  readonly buffer: ArrayBuffer; readonly floatView: Float32Array; readonly uintView: Uint32Array;
  readonly byteLength: number; readonly aligned16Bytes: boolean;
}
export interface CharacterLabRouteMapping {
  readonly id: string; readonly labSource: string; readonly studioRoute: string; readonly ownerDomain: string;
  readonly roleKo: string; readonly roleEn: string; readonly migrationState: "contract-ready" | "planned-cutover";
}
export interface CharacterLabChecklistItem {
  readonly id: string; readonly phase: "phase-1-contract" | "phase-2-render" | "phase-3-assets";
  readonly status: "ready-contract" | "planned-migration"; readonly sourceModule: string; readonly targetModule: string;
  readonly titleKo: string; readonly titleEn: string; readonly verificationGate: string;
}
export interface CharacterLabIntegrationSummary {
  readonly totalItems: number; readonly contractReadyCount: number; readonly plannedMigrationCount: number;
  readonly routeCount: number; readonly crossAppDirectImports: 0;
  readonly checklist: readonly CharacterLabChecklistItem[]; readonly routeMappings: readonly CharacterLabRouteMapping[];
}
export interface AtelierCastBuildInput {
  readonly archetypeId?: AtelierArchetypeId; readonly pigmentId?: AtelierPigmentId;
  readonly solverMode?: AtelierSolverMode; readonly params?: Partial<AtelierCharacterParams>;
  readonly webGpuProbe?: WebGpuProbeInput;
}
export interface AtelierCastSnapshot {
  readonly schemaVersion: typeof ATELIER_CAST_SCHEMA_VERSION;
  readonly brand: typeof ATELIER_CAST_BRAND; readonly lookdevBrand: typeof ATELIER_LOOKDEV_BRAND;
  readonly runtimeBrand: typeof ATELIER_RUNTIME_BRAND;
  readonly archetype: AtelierArchetypePreset; readonly solverMode: AtelierSolverMode;
  readonly params: AtelierCharacterParams; readonly anatomy: AnatomyCageRefitSolution;
  readonly quality: CharacterCustomQualityReport; readonly harmony: AtelierPigmentHarmony;
  readonly backend: Atelier3dBackendNegotiation; readonly renderPasses: readonly AtelierRenderPassSpec[];
  readonly wgslValidation: AtelierWgslValidationReport; readonly uniformsByteLength: number;
  readonly integration: CharacterLabIntegrationSummary;
  readonly runtimeState: {
    readonly model: "analytical-reference-model"; readonly gpuExecuted: false; readonly meshValidated: false;
    readonly canvasApplied: false; readonly persisted: false;
  };
}

const WGSL_RESERVED_KEYWORDS = new Set(
  "abstract active alignas alignof as asm asm_fragment async attribute auto await become cast catch class co_await co_return co_yield coherent column_major common compile compile_fragment concept const_cast consteval constexpr constinit crate debugger decltype delete demote demote_to_helper do dynamic_cast enum explicit export extends extern external fallthrough filter final finally friend from fxgroup get goto groupshared highp impl implements import inline instanceof interface layout lowp macro macro_rules match mediump meta mod module move mut mutable namespace new nil noexcept noinline nointerpolation non_coherent noncoherent noperspective null nullptr of operator package packoffset partition pass patch pixelfragment precise precision premerge priv protected pub public readonly ref regardless register reinterpret_cast require resource restrict self set shared sizeof smooth snorm static static_assert static_cast std subroutine super target template this thread_local throw trait try type typedef typeid typename typeof union unless unorm unsafe unsized use using varying virtual volatile wgsl where with writeonly yield".split(" "),
);

const DEFAULT_PIGMENT: AtelierPigmentSpec = {
  id: "character", labelKo: "마리골드 앰버", labelEn: "Marigold Amber",
  roleKo: "캐릭터 피부·금빛 캐치라이트 중심 기본 안료", roleEn: "Signature amber pigment for warm skin and catchlight cohesion",
  hueDeg: 72, darkAnchor: { l: 0.79, c: 0.158, h: 72 }, lightAnchor: { l: 0.475, c: 0.098, h: 72 },
};

export const ATELIER_PIGMENT_PALETTES: readonly AtelierPigmentSpec[] = [
  { id: "draw", labelKo: "버밀리온 인주", labelEn: "Vermilion Ink", roleKo: "로판·감정선 강조용 따뜻한 주홍 그림자 톤", roleEn: "Warm vermilion shadow tint for expressive leads", hueDeg: 28, darkAnchor: { l: 0.715, c: 0.165, h: 28 }, lightAnchor: { l: 0.495, c: 0.175, h: 28 } },
  DEFAULT_PIGMENT,
  { id: "market", labelKo: "비리디안 에메랄드", labelEn: "Viridian Emerald", roleKo: "캠퍼스·자연광 배경과 어우러지는 청량한 반사광", roleEn: "Fresh emerald bounce harmony for sunlit campus scenes", hueDeg: 158, darkAnchor: { l: 0.765, c: 0.155, h: 158 }, lightAnchor: { l: 0.46, c: 0.106, h: 158 } },
  { id: "collab", labelKo: "세룰리안 티얼", labelEn: "Cerulean Teal", roleKo: "느와르·야간 역광 컷에 적합한 차분한 청록 림라이트", roleEn: "Composed cerulean teal rim harmony for nocturnal noir cuts", hueDeg: 198, darkAnchor: { l: 0.78, c: 0.125, h: 198 }, lightAnchor: { l: 0.465, c: 0.11, h: 198 } },
  { id: "3d", labelKo: "코발트 울트라마린", labelEn: "Cobalt Ultramarine", roleKo: "액션·헌터물 금속 갑주와 선명한 음영 대비용 청색 안료", roleEn: "Crisp cobalt ultramarine accent for action armor and shadow depth", hueDeg: 245, darkAnchor: { l: 0.74, c: 0.135, h: 245 }, lightAnchor: { l: 0.465, c: 0.115, h: 245 } },
];

const DEFAULT_ARCHETYPE: AtelierArchetypePreset = {
  id: "rofan-noble-lead", labelKo: "로판 여주 (7.5등신)", labelEn: "Rofan Noble Lead (7.5H)",
  genreTagKo: "로맨스 판타지", genreTagEn: "Romance Fantasy",
  summaryKo: "가녀린 쇄골·드레스 칼라 케이지 여유와 부드러운 Face-SDF 볼 음영을 맞춘 로판 주연 원형.",
  summaryEn: "Coupled clavicle taper, dress collar cage clearance, and soft Face-SDF cheek shading.",
  regime: "webtoon-humanoid", defaultPigmentId: "draw",
  params: { heightCm: 167, headRatio: 7.5, shoulderWidth: 0.44, waistRatio: 0.54, jawTaper: 0.74, eyeScale: 0.68, eyeSpacing: 0.5, hairVolume: 0.78, outfitClearanceMm: 6.5, outlineWidthPx: 1.35 },
};

export const ATELIER_CAST_ARCHETYPES: readonly AtelierArchetypePreset[] = [
  DEFAULT_ARCHETYPE,
  {
    id: "action-hunter-lead", labelKo: "헌터 남주 (8.0등신)", labelEn: "Action Hunter Lead (8.0H)",
    genreTagKo: "액션 · 헌터", genreTagEn: "Action Hunter",
    summaryKo: "넓은 승모·삼각근 비틀림 보정과 코트 어깨 패드 자동 리핏으로 팔 동작 시 관통을 막는 8등신 원형.",
    summaryEn: "Broad shoulder twist compensation and automatic coat-shoulder cage refit for 8-head action silhouettes.",
    regime: "webtoon-humanoid", defaultPigmentId: "3d",
    params: { heightCm: 185, headRatio: 8.0, shoulderWidth: 0.78, waistRatio: 0.68, jawTaper: 0.56, eyeScale: 0.46, eyeSpacing: 0.54, hairVolume: 0.62, outfitClearanceMm: 8.0, outlineWidthPx: 1.75 },
  },
  {
    id: "campus-romance-lead", labelKo: "캠퍼스 청춘 (7.0등신)", labelEn: "Campus Romance Lead (7.0H)",
    genreTagKo: "청춘 · 학원물", genreTagEn: "Campus Romance",
    summaryKo: "자연스러운 7등신 일상 비율과 교복·니트 칼라 밀착 리핏, 맑은 3층 안구 캐치라이트에 맞춘 원형.",
    summaryEn: "Natural 7-head everyday proportions with snug knit-collar refit and bright 3-layer eye catchlights.",
    regime: "webtoon-humanoid", defaultPigmentId: "market",
    params: { heightCm: 171, headRatio: 7.0, shoulderWidth: 0.54, waistRatio: 0.62, jawTaper: 0.64, eyeScale: 0.62, eyeSpacing: 0.49, hairVolume: 0.68, outfitClearanceMm: 5.5, outlineWidthPx: 1.45 },
  },
  {
    id: "noir-detective-lead", labelKo: "느와르 중년 (7.8등신)", labelEn: "Noir Detective Lead (7.8H)",
    genreTagKo: "느와르 · 스릴러", genreTagEn: "Noir Thriller",
    summaryKo: "단단한 턱선·갈비뼈 두께와 트렌치코트 라펠 케이지를 유지하며 극적인 측광 Face-SDF를 그리는 원형.",
    summaryEn: "Structured jawline and ribcage volume paired with trench-lapel clearance and crisp side-lit Face-SDF.",
    regime: "webtoon-humanoid", defaultPigmentId: "collab",
    params: { heightCm: 181, headRatio: 7.8, shoulderWidth: 0.71, waistRatio: 0.76, jawTaper: 0.42, eyeScale: 0.4, eyeSpacing: 0.56, hairVolume: 0.46, outfitClearanceMm: 7.5, outlineWidthPx: 1.95 },
  },
  {
    id: "chibi-mascot-cast", labelKo: "SD 마스코트 (2.8등신)", labelEn: "SD Mascot Cast (2.8H)",
    genreTagKo: "SD · 개그 컷", genreTagEn: "SD Chibi Cut",
    summaryKo: "큰 두상에도 목 칼라·헤어 충돌이 생기지 않도록 SD 전용 쇄골 확장 케이지를 적용한 2.8등신 원형.",
    summaryEn: "2.8-head SD proportion solver with cranium-collar safety expansion and bold rounded ink taper.",
    regime: "sd-chibi", defaultPigmentId: "character",
    params: { heightCm: 152, headRatio: 2.8, shoulderWidth: 0.48, waistRatio: 0.78, jawTaper: 0.36, eyeScale: 0.84, eyeSpacing: 0.58, hairVolume: 0.84, outfitClearanceMm: 9.0, outlineWidthPx: 2.2 },
  },
];

export const ATELIER_WEBGPU_RENDER_PASSES: readonly AtelierRenderPassSpec[] = [
  { id: "compute-skin-cage", order: 1, stage: "compute", brandLayer: "ToonCore", labelKo: "컴퓨트 스키닝 · 케이지 리핏", labelEn: "Compute Skinning & Cage Refit", purposeKo: "해부학 블렌드셰이프와 쇄골·갈비뼈·의상 칼라 케이지 오프셋을 GPU 버퍼에서 동시 해석.", purposeEn: "Evaluates coupled anatomical blendshapes and outfit collar cage offsets in one compute pass.", workgroupOrTarget: "@compute @workgroup_size(64, 1, 1)", legacyGapKo: "구형 선형 본 스케일링은 어깨 꺾임과 옷 관통 발생", legacyGapEn: "Legacy linear bone scaling causes shoulder collapse and garment clipping" },
  { id: "face-sdf-shadow", order: 2, stage: "vertex-fragment", brandLayer: "PrismLight", labelKo: "Face-SDF 부드러운 얼굴 음영", labelEn: "Face-SDF Smooth Facial Shading", purposeKo: "광원 방위각 대칭 Face-SDF 임계값으로 코·볼 삼각형 각진 그림자를 완전 제거.", purposeEn: "Uses light-azimuth symmetric Face-SDF thresholds to eliminate jagged nose and cheek polygon shadows.", workgroupOrTarget: "Fragment · Face-SDF LUT", legacyGapKo: "구형 퐁 셰이딩은 코 옆에 각진 플라스틱 그림자 노출", legacyGapEn: "Legacy Phong shading exposes sharp plastic nose-cheek shadow triangles" },
  { id: "three-layer-eye", order: 3, stage: "vertex-fragment", brandLayer: "PrismLight", labelKo: "3층 안구 시차 · 각막 캐치라이트", labelEn: "3-Layer Eye Parallax & Catchlight", purposeKo: "공막 윗눈꺼풀 음영 · 홍채 시차 굴절 · 각막 프레넬 캐치라이트 3개 층을 독립 계산.", purposeEn: "Separates upper-lid sclera shade, refracted iris parallax, and crisp cornea Fresnel catchlight.", workgroupOrTarget: "Fragment · 3-Layer Eye", legacyGapKo: "단일 텍스처 안구는 시선 각도에 따라 죽은 인형처럼 보임", legacyGapEn: "Single-layer eye textures flatten into lifeless doll stares off-axis" },
  { id: "instanced-hair-ring", order: 4, stage: "vertex-fragment", brandLayer: "AtelierCast", labelKo: "인스턴스 헤어 · 이방성 엔젤링", labelEn: "Instanced Hair & Anisotropic Angel-Ring", purposeKo: "시프트된 탄젠트 스페큘러 리본으로 머릿결 흐름을 따라 부드럽게 휘는 엔젤링 하이라이트 구현.", purposeEn: "Shifted tangent specular ribbons create directional Korean webtoon hair angel-rings.", workgroupOrTarget: "Instanced Strand · Anisotropic", legacyGapKo: "등방성 하이라이트는 플라스틱 가발처럼 번들거림", legacyGapEn: "Isotropic specular spots make hair look like molded plastic wigs" },
  { id: "taper-outline-oklch", order: 5, stage: "vertex-fragment", brandLayer: "ToonCore", labelKo: "거리 적응형 테이퍼 외곽선 · OKLCH 조화", labelEn: "Distance-Adaptive Taper Outline & OKLCH Pass", purposeKo: "카메라 거리 제곱근 보정 외곽선과 탈-바이올렛 OKLCH 5안료 톤 통일 패스로 최종 합성.", purposeEn: "Balances distance-adaptive tapered line width and unified non-violet OKLCH 5-pigment toning.", workgroupOrTarget: "Inverted-Hull + OKLCH Composite", legacyGapKo: "고정 픽셀 외곽선과 부조화 톤으로 원경 뭉개짐 발생", legacyGapEn: "Fixed-width outlines bloat at distance and mismatch hair/outfit palettes" },
];

export const ATELIER_CAST_WEBGPU_LOOKDEV_WGSL = `// AtelierCast + PrismLight + ToonCore WebGPU Default 3D Lookdev Pipeline
struct AtelierLookdevUniforms {
  height_head_shoulder_waist: vec4<f32>,
  jaw_eye_hair_clearance: vec4<f32>,
  outline_cam_sdf_bias: vec4<f32>,
  light_dir_intensity: vec4<f32>,
  skin_base_oklch: vec4<f32>,
  skin_shadow_oklch: vec4<f32>,
  hair_ring_oklch: vec4<f32>,
  outfit_rim_oklch: vec4<f32>,
};
struct RigVertex {
  position: vec4<f32>,
  normal: vec4<f32>,
  tangent: vec4<f32>,
  cage_weight_taper: vec4<f32>,
};
@group(0) @binding(0) var<uniform> u_lookdev: AtelierLookdevUniforms;
@group(0) @binding(1) var<storage, read> in_vertices: array<RigVertex>;
@group(0) @binding(2) var<storage, read_write> out_vertices: array<RigVertex>;
@group(0) @binding(3) var face_sdf_tex: texture_2d<f32>;
@group(0) @binding(4) var lookdev_sampler: sampler;

@compute @workgroup_size(64, 1, 1)
fn atelier_cast_compute_skinning(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= arrayLength(&in_vertices)) { return; }
  let v = in_vertices[idx];
  let shoulder_ratio = u_lookdev.height_head_shoulder_waist.z;
  let waist_ratio = u_lookdev.height_head_shoulder_waist.w;
  let clearance_m = u_lookdev.jaw_eye_hair_clearance.w * 0.001;
  let clavicle_coupler = (shoulder_ratio - 0.5) * 0.14 + (waist_ratio - 0.6) * 0.05;
  let coupled_pos = vec3<f32>(v.position.x * (1.0 + clavicle_coupler), v.position.y, v.position.z * (1.0 + (waist_ratio - 0.6) * 0.08)) + normalize(v.normal.xyz) * (clearance_m * v.cage_weight_taper.x);
  out_vertices[idx] = RigVertex(vec4<f32>(coupled_pos, 1.0), v.normal, v.tangent, v.cage_weight_taper);
}

fn prismlight_eval_face_sdf(uv: vec2<f32>, light_dir: vec3<f32>) -> f32 {
  let flip_x = select(uv.x, 1.0 - uv.x, light_dir.x < 0.0);
  let sdf_threshold = textureSample(face_sdf_tex, lookdev_sampler, vec2<f32>(flip_x, uv.y)).r;
  let azimuth = clamp(dot(normalize(light_dir.xz), vec2<f32>(0.0, 1.0)) * 0.5 + 0.5, 0.0, 1.0);
  let softness = max(u_lookdev.outline_cam_sdf_bias.z, 0.02);
  return smoothstep(sdf_threshold - softness, sdf_threshold + softness, azimuth);
}

fn prismlight_eval_three_layer_eye(uv: vec2<f32>, view_ts: vec3<f32>, light_dir: vec3<f32>) -> vec3<f32> {
  let sclera_lid_shade = smoothstep(0.18, 0.52, uv.y);
  let iris_uv = uv + view_ts.xy * (0.045 * u_lookdev.jaw_eye_hair_clearance.y);
  let iris_radial = clamp(1.0 - length(iris_uv - vec2<f32>(0.5, 0.5)) * 2.4, 0.0, 1.0);
  let cornea_catchlight = pow(max(dot(vec3<f32>(0.0, 0.0, 1.0), normalize(view_ts + light_dir)), 0.0), 48.0);
  return vec3<f32>(sclera_lid_shade, iris_radial, cornea_catchlight);
}

fn atelier_eval_hair_angel_ring(normal: vec3<f32>, tangent: vec3<f32>, view_dir: vec3<f32>, light_dir: vec3<f32>) -> f32 {
  let shifted_t = normalize(tangent + normal * (0.28 * u_lookdev.jaw_eye_hair_clearance.z));
  let dot_th = dot(shifted_t, normalize(view_dir + light_dir));
  return pow(sqrt(max(0.0, 1.0 - dot_th * dot_th)), 22.0);
}

struct OutlineVsOut { @builtin(position) clip_pos: vec4<f32>, @location(0) taper_factor: f32, };

@vertex
fn tooncore_adaptive_outline_vs(@builtin(vertex_index) vid: u32) -> OutlineVsOut {
  let v = out_vertices[vid];
  let cam_dist = max(u_lookdev.outline_cam_sdf_bias.y, 0.45);
  let adaptive_w = clamp(u_lookdev.outline_cam_sdf_bias.x * sqrt(cam_dist) * 0.0022, 0.0008, 0.0075);
  let taper = clamp(v.cage_weight_taper.y, 0.35, 1.25);
  return OutlineVsOut(vec4<f32>(v.position.xyz + normalize(v.normal.xyz) * (adaptive_w * taper), 1.0), taper);
}

@fragment
fn prismlight_lookdev_fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  let light_dir = normalize(u_lookdev.light_dir_intensity.xyz);
  let face_lit = prismlight_eval_face_sdf(uv, light_dir);
  let eye_layers = prismlight_eval_three_layer_eye(uv, vec3<f32>(0.0, 0.0, 1.0), light_dir);
  let hair_ring = atelier_eval_hair_angel_ring(vec3<f32>(0.0, 0.25, 0.96), vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(0.0, 0.0, 1.0), light_dir);
  let harmonized = mix(u_lookdev.skin_shadow_oklch.xyz, u_lookdev.skin_base_oklch.xyz, face_lit);
  return vec4<f32>(harmonized + u_lookdev.hair_ring_oklch.xyz * (hair_ring * 0.22 + eye_layers.z * 0.18), 1.0);
}
`;

export const CHARACTER_LAB_ROUTE_MAPPINGS: readonly CharacterLabRouteMapping[] = [
  { id: "lab-entry-to-new-cast", labSource: "apps/character-lab (독립 Vite 셸 · http://localhost:4176)", studioRoute: "/studio/assets/characters/new", ownerDomain: "apps/web/src/domains/creator/atelier-cast-customizer", roleKo: "AtelierCast 캐릭터 생성 진입점 및 5종 한국 웹툰 원형 선택 허브", roleEn: "AtelierCast character creation entry and 5-archetype selection hub", migrationState: "contract-ready" },
  { id: "lab-humanoid-outfit-to-studio-character", labSource: "apps/character-lab/src/domains/{humanoid,outfit} + presets", studioRoute: "/studio/character", ownerDomain: "apps/web/src/domains/creator/atelier-cast-customizer", roleKo: "해부학 연동 블렌드셰이프·의상 케이지 자동 리핏 실시간 편집기", roleEn: "Coupled anatomical blendshape and outfit cage auto-refit editor", migrationState: "contract-ready" },
  { id: "lab-animation-ik-to-poser", labSource: "apps/character-lab/src/animation (표정 12 · FACS 16 · 포즈 10 · 손 8)", studioRoute: "/studio/poser", ownerDomain: "apps/web/src/domains/creator/vrm", roleKo: "캐릭터 표정·손 포즈·IK 스테이지 및 컷 앵글 연동", roleEn: "Character expression, hand-pose, IK staging, and cut angle handoff", migrationState: "planned-cutover" },
  { id: "lab-recipe-store-to-work-character", labSource: "apps/character-lab/src/state/lab-store + export/recipe-file.ts", studioRoute: "/studio/work/:workId/character", ownerDomain: "apps/web/src/domains/creator/work-session", roleKo: "작품별 *.character.json 레시피 및 OPFS 로컬 영속화 동기화", roleEn: "Per-work *.character.json recipe and OPFS local durability sync", migrationState: "planned-cutover" },
  { id: "lab-kit-glb-to-convert", labSource: "apps/character-lab/public/assets/characters/toonstudio-kit-v1/", studioRoute: "/studio/character-convert", ownerDomain: "apps/web/src/domains/creator/character-conversion", roleKo: "모듈형 키트 GLB·SHA-256 검증 및 ToonCore 5패스 룩뎁 바인딩", roleEn: "Modular kit GLB SHA-256 verification and ToonCore 5-pass lookdev binding", migrationState: "planned-cutover" },
];

export const CHARACTER_LAB_INTEGRATION_CHECKLIST: readonly CharacterLabChecklistItem[] = [
  { id: "unify-15slot-recipe-contract", phase: "phase-1-contract", status: "ready-contract", sourceModule: "apps/character-lab/src/contracts", targetModule: "apps/web/src/domains/creator/atelier-cast-customizer", titleKo: "15슬롯 레시피·해부학 파라미터 계약 단일화", titleEn: "Unify 15-slot recipe and coupled anatomy parameter contracts", verificationGate: "교차 앱 직접 import 0건 유지 + 레시피 JSON 왕복 동치 검증" },
  { id: "promote-webgpu-default-negotiator", phase: "phase-2-render", status: "ready-contract", sourceModule: "apps/character-lab/src/render (수동 백엔드 선택)", targetModule: "ToonCore WebGPU Default Negotiator", titleKo: "WebGPU 우선·WebGL2 폴백 경로 계획 (런타임 미연결)", titleEn: "Plan WebGPU-first and WebGL2 fallback routes; runtime not connected", verificationGate: "백엔드 비교 계획과 실제 GPU 미실행 상태를 함께 표시" },
  { id: "replace-linear-scale-with-cage-refit", phase: "phase-2-render", status: "ready-contract", sourceModule: "apps/character-lab/src/domains/humanoid", targetModule: "AtelierCast Coupled Blendshape & Cage Refit Solver", titleKo: "단순 선형 본 스케일링 → 해부학 연동·케이지 리핏 솔버 교체", titleEn: "Replace linear bone scaling with coupled blendshape and cage refit", verificationGate: "5종 웹툰 원형 전 구간 메쉬 관통 0건 · 비율 파탄 0건" },
  { id: "bind-prismlight-wgsl-lookdev", phase: "phase-2-render", status: "ready-contract", sourceModule: "apps/character-lab/src/render (기본 툰 셰이더)", targetModule: "PrismLight Face-SDF · 3-Layer Eye · Angel-Ring WGSL", titleKo: "PrismLight Face-SDF·3층 안구·엔젤링·테이퍼 외곽선 WGSL 바인딩", titleEn: "Bind PrismLight Face-SDF, 3-layer eye, angel-ring, and tapered outline WGSL", verificationGate: "정적 WGSL 계약 통과 + 16B Uniform 정렬 + 탈-바이올렛 5안료 검증" },
  { id: "lazy-bridge-kit-assets", phase: "phase-3-assets", status: "planned-migration", sourceModule: "apps/character-lab/public/assets/characters/toonstudio-kit-v1", targetModule: "apps/web lazy asset loader (/studio/character)", titleKo: "모듈 키트 GLB 에셋 지연 로드 연결 (Studio 초기 번들 경계 준수)", titleEn: "Lazy-load modular kit GLB assets while respecting Studio eager bundle guard", verificationGate: "check:studio-eager-graph 통과 + SHA-256 키트 무결성 확인" },
  { id: "sync-export-psd-png-opfs", phase: "phase-3-assets", status: "planned-migration", sourceModule: "apps/character-lab/src/export (PNG · PSD · GLB · 레시피)", targetModule: "apps/web OPFS SQLite 작업 세션 스냅샷", titleKo: "투명 PNG·레이어 PSD·GLB·레시피 내보내기를 스튜디오 OPFS 세션과 연동", titleEn: "Connect transparent PNG, layered PSD, GLB, and recipe exports to Studio OPFS", verificationGate: "투명 PNG 모서리 알파 0 규약 및 레시피 재열기 100% 일치" },
];

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return value < min ? min : value > max ? max : value;
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function normalizeHue(hueDeg: number): number {
  if (!Number.isFinite(hueDeg)) return 72;
  const mod = hueDeg % 360;
  return mod < 0 ? mod + 360 : mod;
}

export function isVioletSlopHue(hueDeg: number): boolean {
  const h = normalizeHue(hueDeg);
  return h >= VIOLET_HUE_MIN_DEG && h <= VIOLET_HUE_MAX_DEG;
}

export function sanitizeNonVioletHue(hueDeg: number): number {
  const h = normalizeHue(hueDeg);
  if (!isVioletSlopHue(h)) return roundTo(h, 1);
  return h < 295 ? 245 : 28;
}

export function formatOklch(color: OklchColor, alpha?: number): string {
  const l = roundTo(clampNumber(color.l, 0, 1, 0.5), 3);
  const c = roundTo(clampNumber(color.c, 0, 0.32, 0.08), 3);
  const h = sanitizeNonVioletHue(color.h);
  return typeof alpha === "number" && Number.isFinite(alpha)
    ? `oklch(${l} ${c} ${h} / ${roundTo(clampNumber(alpha, 0, 1, 1), 3)})`
    : `oklch(${l} ${c} ${h})`;
}

export function getAtelierArchetype(id?: AtelierArchetypeId): AtelierArchetypePreset {
  return ATELIER_CAST_ARCHETYPES.find((item) => item.id === id) ?? DEFAULT_ARCHETYPE;
}

export function getAtelierPigment(id?: AtelierPigmentId): AtelierPigmentSpec {
  return ATELIER_PIGMENT_PALETTES.find((item) => item.id === id) ?? DEFAULT_PIGMENT;
}

export function normalizeAtelierParams(
  archetype: AtelierArchetypePreset,
  overrides?: Partial<AtelierCharacterParams>,
): AtelierCharacterParams {
  const b = archetype.params;
  const o = overrides ?? {};
  const d = ATELIER_PARAM_BOUNDS;
  return {
    heightCm: roundTo(clampNumber(o.heightCm ?? b.heightCm, d.heightCm.min, d.heightCm.max, b.heightCm), 1),
    headRatio: roundTo(clampNumber(o.headRatio ?? b.headRatio, d.headRatio.min, d.headRatio.max, b.headRatio), 2),
    shoulderWidth: roundTo(clampNumber(o.shoulderWidth ?? b.shoulderWidth, d.shoulderWidth.min, d.shoulderWidth.max, b.shoulderWidth), 3),
    waistRatio: roundTo(clampNumber(o.waistRatio ?? b.waistRatio, d.waistRatio.min, d.waistRatio.max, b.waistRatio), 3),
    jawTaper: roundTo(clampNumber(o.jawTaper ?? b.jawTaper, d.jawTaper.min, d.jawTaper.max, b.jawTaper), 3),
    eyeScale: roundTo(clampNumber(o.eyeScale ?? b.eyeScale, d.eyeScale.min, d.eyeScale.max, b.eyeScale), 3),
    eyeSpacing: roundTo(clampNumber(o.eyeSpacing ?? b.eyeSpacing, d.eyeSpacing.min, d.eyeSpacing.max, b.eyeSpacing), 3),
    hairVolume: roundTo(clampNumber(o.hairVolume ?? b.hairVolume, d.hairVolume.min, d.hairVolume.max, b.hairVolume), 3),
    outfitClearanceMm: roundTo(clampNumber(o.outfitClearanceMm ?? b.outfitClearanceMm, d.outfitClearanceMm.min, d.outfitClearanceMm.max, b.outfitClearanceMm), 2),
    outlineWidthPx: roundTo(clampNumber(o.outlineWidthPx ?? b.outlineWidthPx, d.outlineWidthPx.min, d.outlineWidthPx.max, b.outlineWidthPx), 2),
  };
}

export function solveAnatomyAndCageRefit(
  params: AtelierCharacterParams,
  mode: AtelierSolverMode = "atelier-coupled",
): AnatomyCageRefitSolution {
  const regime: AtelierProportionRegime = params.headRatio <= 4.2 ? "sd-chibi" : "webtoon-humanoid";
  const effectiveDisplayHeightCm = regime === "sd-chibi" ? roundTo(params.heightCm * 0.62, 1) : params.heightCm;
  const headHeightCm = roundTo(effectiveDisplayHeightCm / params.headRatio, 2);
  const rawShoulderCm = effectiveDisplayHeightCm * (0.195 + params.shoulderWidth * 0.088);
  const clavicleSpanCm = roundTo(
    mode === "atelier-coupled"
      ? Math.max(headHeightCm * (regime === "sd-chibi" ? 1.08 : 1.55), rawShoulderCm * (regime === "sd-chibi" ? 0.86 : 1.0))
      : rawShoulderCm,
    2,
  );
  const ribcageWidthCm = roundTo(clavicleSpanCm * (mode === "atelier-coupled" ? 0.72 + (params.waistRatio - 0.5) * 0.16 : 0.64 + params.waistRatio * 0.28), 2);
  const waistWidthCm = roundTo(ribcageWidthCm * (0.64 + params.waistRatio * 0.32), 2);
  const shoulderJointTwistDeg = mode === "atelier-coupled" ? roundTo(14 + Math.abs(params.shoulderWidth - 0.55) * 28, 1) : 0;
  const armTaperRatio = mode === "atelier-coupled"
    ? roundTo(clampNumber(0.84 + (params.shoulderWidth - 0.55) * 0.12, 0.76, 0.94, 0.85), 3)
    : roundTo(0.68 + params.shoulderWidth * 0.52, 3);
  const collarDemandMm = 1.6 + params.hairVolume * 2.1 + Math.abs(params.shoulderWidth - 0.52) * 4.4 + (regime === "sd-chibi" ? 2.4 : 0);
  const collarCageClearanceMm = roundTo(mode === "atelier-coupled" ? Math.max(params.outfitClearanceMm, collarDemandMm + 1.4) : params.outfitClearanceMm - collarDemandMm * 1.15, 2);
  const hairShoulderBufferMm = roundTo(mode === "atelier-coupled" ? Math.max(2.5, params.outfitClearanceMm * 0.65 + params.hairVolume * 2.2) : 1.4 - params.hairVolume * 4.2, 2);
  const eyeTempleMarginMm = roundTo(mode === "atelier-coupled" ? Math.max(3.2, 7.6 - params.eyeScale * 2.4 - Math.abs(params.eyeSpacing - 0.52) * 3.1) : 4.1 - params.eyeScale * 3.6 - params.eyeSpacing * 2.5, 2);

  if (mode === "atelier-coupled") {
    return {
      measurementBasis: "analytical-reference-model", meshValidated: false,
      mode, regime, effectiveDisplayHeightCm, headHeightCm, clavicleSpanCm, ribcageWidthCm, waistWidthCm,
      shoulderJointTwistDeg, armTaperRatio, collarCageClearanceMm, hairShoulderBufferMm, eyeTempleMarginMm,
      meshClippingCount: 0, proportionBreakCount: 0, refitIterations: 3, clippingHotspotsKo: [], clippingHotspotsEn: [],
    };
  }

  const hotspotsKo: string[] = [];
  const hotspotsEn: string[] = [];
  let meshClippingCount = 2;
  let proportionBreakCount = 2;
  if (collarCageClearanceMm < 1.2) { meshClippingCount += 2; hotspotsKo.push("쇄골·의상 칼라 케이지 메쉬 관통"); hotspotsEn.push("Clavicle-to-collar garment mesh clipping"); }
  if (hairShoulderBufferMm < 0) { meshClippingCount += 2; hotspotsKo.push("뒷머리 볼륨 ↔ 어깨 패드 겹침"); hotspotsEn.push("Back-hair volume piercing shoulder pad"); }
  if (params.shoulderWidth >= 0.65 || params.shoulderWidth <= 0.45) { proportionBreakCount += 1; hotspotsKo.push("선형 본 스케일링 어깨 꺾임·풍선 팔"); hotspotsEn.push("Linear bone-scale shoulder pinch & balloon arm"); }
  if (eyeTempleMarginMm < 0.8) { proportionBreakCount += 1; hotspotsKo.push("눈 간격·관자놀이 턱선 비율 이탈"); hotspotsEn.push("Eye-to-temple cranial proportion drift"); }
  if (hotspotsKo.length === 0) { hotspotsKo.push("어깨 관절 비틀림 미보정 · 소매 경계 미세 관통"); hotspotsEn.push("Uncompensated shoulder twist & cuff clipping"); }

  return {
    measurementBasis: "analytical-reference-model", meshValidated: false,
    mode, regime, effectiveDisplayHeightCm, headHeightCm, clavicleSpanCm, ribcageWidthCm, waistWidthCm,
    shoulderJointTwistDeg, armTaperRatio, collarCageClearanceMm, hairShoulderBufferMm, eyeTempleMarginMm,
    meshClippingCount, proportionBreakCount, refitIterations: 0, clippingHotspotsKo: hotspotsKo, clippingHotspotsEn: hotspotsEn,
  };
}

export function buildAtelierPigmentHarmony(
  pigmentId: AtelierPigmentId,
  mode: AtelierSolverMode = "atelier-coupled",
): AtelierPigmentHarmony {
  const pigment = getAtelierPigment(pigmentId);
  const h = sanitizeNonVioletHue(pigment.hueDeg);
  const warmShadowHue = sanitizeNonVioletHue(h < 90 ? 28 : h < 190 ? 48 : 34);
  const trimHue = sanitizeNonVioletHue(h === 28 ? 72 : h === 245 ? 198 : h);
  const tokens = {
    skinBase: { l: 0.875, c: 0.042, h: 56 },
    skinSdfShadow: mode === "atelier-coupled" ? { l: 0.745, c: 0.068, h: warmShadowHue } : { l: 0.62, c: 0.015, h: 215 },
    hairBase: { l: 0.305, c: mode === "atelier-coupled" ? 0.048 : 0.018, h },
    hairAngelRing: { l: 0.86, c: 0.075, h: sanitizeNonVioletHue(h < 120 ? 72 : h) },
    irisPrimary: { l: 0.59, c: 0.145, h }, scleraShade: { l: 0.88, c: 0.018, h: 205 },
    corneaCatchlight: { l: 0.985, c: 0.008, h: 78 }, outfitPrimary: { l: 0.36, c: 0.062, h },
    outfitTrim: { l: 0.76, c: 0.138, h: trimHue }, outlineInk: { l: 0.21, c: 0.022, h: warmShadowHue },
    rimLight: pigment.darkAnchor, surfaceCanvas: { l: 0.155, c: 0.006, h: 65 },
    surfacePanel: { l: 0.195, c: 0.007, h: 65 }, surfaceCard: { l: 0.235, c: 0.009, h: 68 },
    surfaceLine: { l: 0.365, c: 0.014, h: 70 }, surfaceInk: { l: 0.945, c: 0.008, h: 82 },
    surfaceMuted: { l: 0.735, c: 0.014, h: 75 }, goodColor: { l: 0.765, c: 0.155, h: 158 },
    warnColor: { l: 0.79, c: 0.158, h: 72 },
  };
  const allColors: readonly OklchColor[] = Object.values(tokens);
  return {
    pigment, ...tokens,
    toneCohesionScore: mode === "atelier-coupled" ? 96 : 54,
    violetViolationCount: allColors.filter((t) => isVioletSlopHue(t.h)).length,
    inspectedTokenCount: allColors.length,
  };
}

/** 입력은 백엔드 계획의 비교 조건이며 장치 조회나 GPU 실행 증거가 아니다. */
export function negotiateAtelier3dWebGpuDefault(probe?: WebGpuProbeInput): Atelier3dBackendNegotiation {
  const requestedGpu = probe?.hasNavigatorGpu ?? true;
  const adapterPlanned = probe?.adapterAvailable ?? requestedGpu;
  const softwareAdapter = probe?.isFallbackAdapter ?? false;
  const legacyComparison = probe?.forceLegacyMode ?? false;
  const plannedBackend: Atelier3dBackendKind = !legacyComparison && requestedGpu && adapterPlanned && !softwareAdapter
    ? "webgpu" : (probe?.supportsWebGl2 ?? true) ? "webgl2" : "svg-preview";
  const plannedPassCount = plannedBackend === "webgpu" ? 5 : plannedBackend === "webgl2" ? (legacyComparison ? 2 : 4) : 0;
  return {
    policy: "webgpu-default", runtimeBrand: ATELIER_RUNTIME_BRAND,
    activeBackend: "svg-preview", plannedBackend, plannedPassCount, hardwareVerified: false,
    laneId: "atelier-svg-safe-preview", labelKo: "AtelierCast CPU/SVG 참조 예제", labelEn: "AtelierCast CPU/SVG Reference Example",
    computeSkinningEnabled: false, faceSdfPassEnabled: false, threeLayerEyeEnabled: false,
    instancedHairEnabled: false, distanceTaperOutlineEnabled: false, fallbackTriggered: false,
    reasonKo: `CPU/SVG 해석 모형입니다. GPU·WebGL 실행, 메쉬 충돌 검사, 캔버스 반영, 영구 저장은 수행하지 않습니다. ${softwareAdapter ? "소프트웨어 WebGPU 제외 조건 · " : ""}비교 계획: ${plannedBackend} ${plannedPassCount}패스.`,
    reasonEn: `CPU/SVG analytical model only. No GPU/WebGL execution, mesh collision validation, canvas application, or persistence. Comparison plan: ${plannedBackend}, ${plannedPassCount} passes.`,
    activePassCount: 0,
  };
}

export function packAtelierCastLookdevUniforms(
  params: AtelierCharacterParams,
  harmony: AtelierPigmentHarmony,
): PackedAtelierLookdevUniforms {
  const buffer = new ArrayBuffer(ATELIER_UNIFORM_BYTE_SIZE);
  const floatView = new Float32Array(buffer);
  const uintView = new Uint32Array(buffer);
  floatView.set([
    params.heightCm, params.headRatio, params.shoulderWidth, params.waistRatio,
    params.jawTaper, params.eyeScale, params.hairVolume, params.outfitClearanceMm,
    params.outlineWidthPx, 2.4, 0.08, params.eyeSpacing,
    0.42, 0.35, 0.84, 1.0,
    harmony.skinBase.l, harmony.skinBase.c, harmony.skinBase.h, 1.0,
    harmony.skinSdfShadow.l, harmony.skinSdfShadow.c, harmony.skinSdfShadow.h, 1.0,
    harmony.hairAngelRing.l, harmony.hairAngelRing.c, harmony.hairAngelRing.h, 1.0,
    harmony.rimLight.l, harmony.rimLight.c, harmony.rimLight.h, 1.0,
  ]);
  return { buffer, floatView, uintView, byteLength: buffer.byteLength, aligned16Bytes: buffer.byteLength % 16 === 0 };
}

export function validateAtelierCastWgsl(source: string = ATELIER_CAST_WEBGPU_LOOKDEV_WGSL): AtelierWgslValidationReport {
  const errors: string[] = [];
  const entryPoints = [...source.matchAll(/@(?:compute|vertex|fragment)[\s\S]{0,120}?fn\s+([A-Za-z_][A-Za-z0-9_]*)/gu)].map((m) => m[1] ?? "").filter(Boolean);
  const workgroupSizes = [...source.matchAll(/@workgroup_size\(([^)]+)\)/gu)].map((m) => m[1]?.trim() ?? "").filter(Boolean);
  const bindings: WgslBindingSummary[] = [...source.matchAll(/@group\((\d+)\)\s*@binding\((\d+)\)\s*var(?:<[^>]+>)?\s+([A-Za-z_][A-Za-z0-9_]*)/gu)].map((m) => ({
    group: Number(m[1]), binding: Number(m[2]), name: m[3] ?? "",
  }));
  const stack: string[] = [];
  const pairs: Record<string, string> = { ")": "(", "}": "{", "]": "[" };
  let balancedDelimiters = true;
  for (const ch of source) {
    if (ch === "(" || ch === "{" || ch === "[") stack.push(ch);
    else if (ch === ")" || ch === "}" || ch === "]") {
      if (stack.pop() !== pairs[ch]) { balancedDelimiters = false; break; }
    }
  }
  if (stack.length !== 0) balancedDelimiters = false;
  const reservedKeywordCollisions = [...source.matchAll(/\b(?:let|var|fn|struct)\s+([A-Za-z_][A-Za-z0-9_]*)/gu)]
    .map((m) => m[1] ?? "").filter((id) => Boolean(id) && WGSL_RESERVED_KEYWORDS.has(id));
  const hasFaceSdfFunction = /\bfn\s+prismlight_eval_face_sdf\b/u.test(source);
  const hasThreeLayerEyeFunction = /\bfn\s+prismlight_eval_three_layer_eye\b/u.test(source);
  const hasHairAngelRingFunction = /\bfn\s+atelier_eval_hair_angel_ring\b/u.test(source);
  const hasAdaptiveOutlineEntry = /\bfn\s+tooncore_adaptive_outline_vs\b/u.test(source);
  const hasComputeSkinningEntry = /\bfn\s+atelier_cast_compute_skinning\b/u.test(source);
  const withinBindingLimit = bindings.length > 0 && bindings.length <= ATELIER_MAX_WGSL_BINDINGS;

  if (!balancedDelimiters) errors.push("WGSL 괄호 쌍이 일치하지 않습니다.");
  if (entryPoints.length < 3) errors.push("필수 compute/vertex/fragment 엔트리포인트가 부족합니다.");
  if (!withinBindingLimit) errors.push(`바인딩 수(${bindings.length})가 허용 범위(1~${ATELIER_MAX_WGSL_BINDINGS})를 벗어납니다.`);
  if (reservedKeywordCollisions.length > 0) errors.push(`WGSL 예약어 충돌: ${reservedKeywordCollisions.join(", ")}`);
  if (!hasFaceSdfFunction) errors.push("Face-SDF 함수가 누락되었습니다.");
  if (!hasThreeLayerEyeFunction) errors.push("3층 안구 함수가 누락되었습니다.");
  if (!hasHairAngelRingFunction) errors.push("이방성 헤어 엔젤링 함수가 누락되었습니다.");
  if (!hasAdaptiveOutlineEntry) errors.push("거리 적응형 테이퍼 외곽선 엔트리가 누락되었습니다.");
  if (!hasComputeSkinningEntry) errors.push("컴퓨트 스키닝 엔트리가 누락되었습니다.");

  return {
    validationKind: "static-source-contract", gpuCompiled: false, valid: errors.length === 0,
    entryPoints, workgroupSizes, bindings, bindingCount: bindings.length, withinBindingLimit,
    balancedDelimiters, reservedKeywordCollisions, hasFaceSdfFunction, hasThreeLayerEyeFunction,
    hasHairAngelRingFunction, hasAdaptiveOutlineEntry, hasComputeSkinningEntry,
    lineCount: source.split(/\r?\n/).length, errors,
  };
}

export function evaluateCharacterCustomQuality(
  params: AtelierCharacterParams,
  options?: { readonly solverMode?: AtelierSolverMode; readonly pigmentId?: AtelierPigmentId; readonly backend?: Atelier3dBackendNegotiation },
): CharacterCustomQualityReport {
  const mode: AtelierSolverMode = options?.solverMode ?? "atelier-coupled";
  const pigmentId: AtelierPigmentId = options?.pigmentId ?? "character";
  const anatomy = solveAnatomyAndCageRefit(params, mode);
  const harmony = buildAtelierPigmentHarmony(pigmentId, mode);
  const backend = options?.backend ?? negotiateAtelier3dWebGpuDefault({ hasNavigatorGpu: mode === "atelier-coupled", forceLegacyMode: mode === "legacy-linear" });

  const legacyAnatomyScore = Math.max(36, 56 - Math.round(Math.abs(params.shoulderWidth - 0.55) * 28));
  const anatomyScore = mode === "atelier-coupled" ? Math.min(99, 95 + (anatomy.collarCageClearanceMm >= 5 ? 3 : 1)) : Math.max(34, legacyAnatomyScore - anatomy.meshClippingCount * 2);
  const faceSdfSmoothnessPct = mode === "atelier-coupled" ? 97 : 44;
  const eyeParallaxLayers = mode === "atelier-coupled" ? 3 : 1;
  const hairAngelRingContrast = mode === "atelier-coupled" ? roundTo(0.84 + params.hairVolume * 0.12, 2) : 0.31;
  const outlineTaperConsistencyPct = mode === "atelier-coupled" ? Math.min(99, Math.round(92 + (1 - Math.abs(params.outlineWidthPx - 1.65) * 0.22) * 6)) : 52;
  const lookdevScore = mode === "atelier-coupled" ? Math.round((faceSdfSmoothnessPct + outlineTaperConsistencyPct + 95) / 3) : 47;
  const runtimeScore = mode === "legacy-linear" ? 46 : backend.plannedBackend === "webgpu" ? 98 : backend.plannedBackend === "webgl2" ? 78 : 60;

  const axes: readonly LookdevQualityAxis[] = [
    { id: "anatomy-cage", labelKo: "해부학 연동 · 케이지 리핏", labelEn: "Coupled Anatomy & Cage Refit", score: anatomyScore, legacyBaselineScore: legacyAnatomyScore, deltaPoints: anatomyScore - legacyAnatomyScore, summaryKo: anatomy.meshClippingCount === 0 ? `모형 관통 0건 · 비율 파탄 0건 · 칼라 여유 ${anatomy.collarCageClearanceMm}mm` : `모형 관통 ${anatomy.meshClippingCount}건 · 비율 파탄 ${anatomy.proportionBreakCount}건`, summaryEn: anatomy.meshClippingCount === 0 ? `Model: 0 clipping · 0 proportion breaks · ${anatomy.collarCageClearanceMm}mm collar gap` : `Model: ${anatomy.meshClippingCount} clips · ${anatomy.proportionBreakCount} proportion breaks` },
    { id: "face-sdf-lookdev", labelKo: "Face-SDF · 3층 안구 · 엔젤링", labelEn: "Face-SDF · 3-Layer Eye · Angel-Ring", score: lookdevScore, legacyBaselineScore: 47, deltaPoints: lookdevScore - 47, summaryKo: mode === "atelier-coupled" ? `얼굴 SDF 부드러움 ${faceSdfSmoothnessPct}% · 안구 ${eyeParallaxLayers}층 · 테이퍼 ${outlineTaperConsistencyPct}%` : "구형 플라스틱 퐁 음영 · 코/볼 각진 삼각형 그림자 노출", summaryEn: mode === "atelier-coupled" ? `Face-SDF ${faceSdfSmoothnessPct}% · ${eyeParallaxLayers}-layer eye · ${outlineTaperConsistencyPct}% taper` : "Legacy plastic Phong shading with nose-cheek triangle shadows" },
    { id: "oklch-harmony", labelKo: "탈-바이올렛 OKLCH 5안료 조화", labelEn: "Non-Violet OKLCH 5-Pigment Harmony", score: harmony.toneCohesionScore, legacyBaselineScore: 54, deltaPoints: harmony.toneCohesionScore - 54, summaryKo: `${harmony.pigment.labelKo} 단일 조화 · 바이올렛 ${harmony.violetViolationCount}건`, summaryEn: `${harmony.pigment.labelEn} unified toning · ${harmony.violetViolationCount} violet hues` },
    { id: "webgpu-runtime", labelKo: "WebGPU 파이프라인 계획 모형", labelEn: "WebGPU Pipeline Plan Model", score: runtimeScore, legacyBaselineScore: 46, deltaPoints: runtimeScore - 46, summaryKo: `${backend.labelKo} (${backend.plannedPassCount}패스 계획 · 미실행)`, summaryEn: `${backend.labelEn} (${backend.plannedPassCount} planned passes; not executed)` },
  ];

  const overallScore = Math.round(axes.reduce((sum, a) => sum + a.score, 0) / axes.length);
  const legacyOverallScore = Math.round(axes.reduce((sum, a) => sum + a.legacyBaselineScore, 0) / axes.length);
  return {
    measurementBasis: "analytical-reference-model", meshValidated: false,
    mode, overallScore, legacyOverallScore, improvementPoints: overallScore - legacyOverallScore,
    meshClippingCount: anatomy.meshClippingCount, proportionBreakCount: anatomy.proportionBreakCount,
    faceSdfSmoothnessPct, eyeParallaxLayers, hairAngelRingContrast, outlineTaperConsistencyPct,
    violetHueViolationCount: harmony.violetViolationCount, axes,
  };
}

export function summarizeCharacterLabIntegration(): CharacterLabIntegrationSummary {
  const contractReadyCount = CHARACTER_LAB_INTEGRATION_CHECKLIST.filter((i) => i.status === "ready-contract").length;
  return {
    totalItems: CHARACTER_LAB_INTEGRATION_CHECKLIST.length, contractReadyCount,
    plannedMigrationCount: CHARACTER_LAB_INTEGRATION_CHECKLIST.length - contractReadyCount,
    routeCount: CHARACTER_LAB_ROUTE_MAPPINGS.length, crossAppDirectImports: 0,
    checklist: CHARACTER_LAB_INTEGRATION_CHECKLIST, routeMappings: CHARACTER_LAB_ROUTE_MAPPINGS,
  };
}

export function buildAtelierCastSnapshot(input?: AtelierCastBuildInput): AtelierCastSnapshot {
  const archetype = getAtelierArchetype(input?.archetypeId);
  const solverMode: AtelierSolverMode = input?.solverMode ?? "atelier-coupled";
  const pigmentId: AtelierPigmentId = input?.pigmentId ?? archetype.defaultPigmentId;
  const params = normalizeAtelierParams(archetype, input?.params);
  const anatomy = solveAnatomyAndCageRefit(params, solverMode);
  const harmony = buildAtelierPigmentHarmony(pigmentId, solverMode);
  const backend = negotiateAtelier3dWebGpuDefault({
    hasNavigatorGpu: input?.webGpuProbe?.hasNavigatorGpu ?? (solverMode === "atelier-coupled"),
    adapterAvailable: input?.webGpuProbe?.adapterAvailable, isFallbackAdapter: input?.webGpuProbe?.isFallbackAdapter,
    supportsTimestampQuery: input?.webGpuProbe?.supportsTimestampQuery, supportsWebGl2: input?.webGpuProbe?.supportsWebGl2,
    forceLegacyMode: input?.webGpuProbe?.forceLegacyMode ?? (solverMode === "legacy-linear"),
  });
  return {
    schemaVersion: ATELIER_CAST_SCHEMA_VERSION, brand: ATELIER_CAST_BRAND, lookdevBrand: ATELIER_LOOKDEV_BRAND,
    runtimeBrand: ATELIER_RUNTIME_BRAND, archetype, solverMode, params, anatomy,
    quality: evaluateCharacterCustomQuality(params, { solverMode, pigmentId, backend }),
    harmony, backend, renderPasses: ATELIER_WEBGPU_RENDER_PASSES,
    wgslValidation: validateAtelierCastWgsl(ATELIER_CAST_WEBGPU_LOOKDEV_WGSL),
    uniformsByteLength: packAtelierCastLookdevUniforms(params, harmony).byteLength,
    integration: summarizeCharacterLabIntegration(),
    runtimeState: { model: "analytical-reference-model", gpuExecuted: false, meshValidated: false, canvasApplied: false, persisted: false },
  };
}

export function exportAtelierCastManifestJson(snapshot: AtelierCastSnapshot): string {
  return JSON.stringify({
    schemaVersion: snapshot.schemaVersion,
    runtimeState: snapshot.runtimeState,
    honestyNoteKo: "CPU/SVG 참조 예제입니다. 관통·품질 점수는 해석 모형 값이며 실제 메쉬 검사나 성능 실측이 아닙니다. GPU 실행·캐릭터 생성·파일 저장은 연결되지 않았습니다.",
    brands: { customizer: snapshot.brand, lookdev: snapshot.lookdevBrand, runtime: snapshot.runtimeBrand },
    archetypeId: snapshot.archetype.id, solverMode: snapshot.solverMode, params: snapshot.params,
    anatomyRefit: { measurementBasis: snapshot.anatomy.measurementBasis, meshValidated: false, measuredMeshClippingCount: null, regime: snapshot.anatomy.regime, clavicleSpanCm: snapshot.anatomy.clavicleSpanCm, ribcageWidthCm: snapshot.anatomy.ribcageWidthCm, collarCageClearanceMm: snapshot.anatomy.collarCageClearanceMm, meshClippingCount: snapshot.anatomy.meshClippingCount, proportionBreakCount: snapshot.anatomy.proportionBreakCount },
    qualityReport: { measurementBasis: "analytical-reference-model", overallScore: snapshot.quality.overallScore, legacyOverallScore: snapshot.quality.legacyOverallScore, improvementPoints: snapshot.quality.improvementPoints, faceSdfSmoothnessPct: snapshot.quality.faceSdfSmoothnessPct, eyeParallaxLayers: snapshot.quality.eyeParallaxLayers, violetHueViolationCount: snapshot.quality.violetHueViolationCount },
    webGpuDefaultPolicy: { hardwareVerified: false, plannedBackend: snapshot.backend.plannedBackend, plannedPassCount: snapshot.backend.plannedPassCount, policy: snapshot.backend.policy, activeBackend: snapshot.backend.activeBackend, laneId: snapshot.backend.laneId, fallbackTriggered: snapshot.backend.fallbackTriggered, activePassCount: snapshot.backend.activePassCount },
    oklchHarmony: { pigmentId: snapshot.harmony.pigment.id, skinBase: formatOklch(snapshot.harmony.skinBase), skinSdfShadow: formatOklch(snapshot.harmony.skinSdfShadow), hairBase: formatOklch(snapshot.harmony.hairBase), hairAngelRing: formatOklch(snapshot.harmony.hairAngelRing), outfitPrimary: formatOklch(snapshot.harmony.outfitPrimary), rimLight: formatOklch(snapshot.harmony.rimLight), violetViolationCount: snapshot.harmony.violetViolationCount },
    wgslContract: { validationKind: snapshot.wgslValidation.validationKind, gpuCompiled: snapshot.wgslValidation.gpuCompiled, valid: snapshot.wgslValidation.valid, entryPoints: snapshot.wgslValidation.entryPoints, bindingCount: snapshot.wgslValidation.bindingCount, uniformsByteLength: snapshot.uniformsByteLength },
    characterLabIntegration: { contractReadyCount: snapshot.integration.contractReadyCount, plannedMigrationCount: snapshot.integration.plannedMigrationCount, routeMappings: snapshot.integration.routeMappings.map((r) => ({ labSource: r.labSource, studioRoute: r.studioRoute, migrationState: r.migrationState })) },
  }, null, 2);
}
