import { assertNormalizedRadianceConfig, assertOccluderSet } from "./radiance-input-contract";
import { occluderSdfUnchecked as evaluateOccluderSdf2d, sceneSdfUnchecked as evaluateSceneSdf2d, shadowUnchecked as traceSoftShadow2d } from "./radiance-cpu-geometry";

export { evaluateOccluderSdf2d, evaluateSceneSdf2d, traceSoftShadow2d } from "./radiance-cpu-geometry";

/**
 * Wave 56C — 전면 WebGPU 2D/2.5D Radiance Cascades 전역 조명(GI) & SDF 실시간 그림자 엔진.
 *
 * - 현재 구현(Current): 미컴파일 WGSL 소스 `@compute @workgroup_size(8, 8)` 3종 셰이더(JFA SDF ·
 *   Radiance Cascade Probe · Cascade Merge & Cel Rim), 16B 정렬 Uniform 패커, 계약 검증기,
 *   결정론적 CPU 참조 2D SDF/GI 격자 시뮬레이터, WebGPU Compute vs 레거시 WebGL2 구조 비교.
 * - 목표 런타임(Target): 브라우저 실기 WebGPU `GPUDevice` 컴퓨트 디스패치 및 Storage Texture
 *   체인 기반 실시간 캔버스 합성(허위 FPS 벤치마크 수치 미포함).
 */

export const RADIANCE_CASCADES_SCHEMA_VERSION = "toonstudio.webgpu-radiance-cascades.v1" as const;
export const RADIANCE_MODEL_KIND = "webgpu-compute-architecture-and-cpu-parity" as const;
export const RADIANCE_WORKGROUP_SIZE = 8 as const;
export const RADIANCE_MAX_BINDINGS_PER_PASS = 8 as const;
export const RADIANCE_UNIFORM_BYTE_SIZE = 96 as const;
export const MIN_CASCADE_LEVELS = 3 as const;
export const MAX_CASCADE_LEVELS = 6 as const;
export const DEFAULT_CASCADE_LEVELS = 5 as const;
export const MIN_BASE_RAY_COUNT = 4 as const;
export const MAX_BASE_RAY_COUNT = 16 as const;
export const DEFAULT_BASE_RAY_COUNT = 8 as const;
export const CPU_PARITY_GRID_COLS = 20 as const;
export const CPU_PARITY_GRID_ROWS = 12 as const;
export const VIOLET_HUE_MIN_DEG = 270 as const;
export const VIOLET_HUE_MAX_DEG = 320 as const;
export const RADIANCE_SCENARIO_IDS = ["neon-alley-rim", "sunset-classroom-window", "fantasy-crystal-bounce", "noir-spotlight-shadow"] as const;
export const LIGHT_TEMPERATURE_PRESET_IDS = ["scenario-default", "warm-amber", "golden-dusk", "neutral-studio", "emerald-bounce", "cool-cyan"] as const;

export type RadianceScenarioId = (typeof RADIANCE_SCENARIO_IDS)[number];
export type LightTemperaturePresetId = (typeof LIGHT_TEMPERATURE_PRESET_IDS)[number];
export type RadianceShaderId = "jfa-sdf" | "cascade-probe" | "merge-cel";
export type OccluderKind = "character" | "background" | "balloon";
export type OccluderShape = "circle" | "capsule" | "rounded-box";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export interface LightTemperaturePreset {
  readonly id: LightTemperaturePresetId; readonly labelKo: string; readonly labelEn: string;
  readonly kelvinLabel: string; readonly color: OklchColor | null;
}
export interface SceneOccluder {
  readonly id: string; readonly kind: OccluderKind; readonly shape: OccluderShape;
  readonly labelKo: string; readonly labelEn: string;
  readonly x: number; readonly y: number; readonly radius: number;
  readonly x2?: number; readonly y2?: number; readonly halfW?: number; readonly halfH?: number;
  readonly albedo: OklchColor; readonly emissiveStrength: number;
}
export interface RadianceLightingScenario {
  readonly id: RadianceScenarioId; readonly titleKo: string; readonly titleEn: string;
  readonly moodKo: string; readonly moodEn: string;
  readonly defaultKeyLightX: number; readonly defaultKeyLightY: number;
  readonly keyLightRadius: number; readonly keyLightIntensity: number; readonly keyLightColor: OklchColor;
  readonly fillLightX: number; readonly fillLightY: number;
  readonly fillLightIntensity: number; readonly fillLightColor: OklchColor;
  readonly rimLightColor: OklchColor; readonly ambientFloor: number;
  readonly occluders: readonly SceneOccluder[];
}
export interface RadianceSceneInput {
  readonly scenarioId?: RadianceScenarioId; readonly cascadeLevels?: number; readonly baseRayCount?: number;
  readonly penumbraSoftness?: number; readonly rimCutThreshold?: number; readonly bounceGiStrength?: number;
  readonly keyLightX?: number; readonly keyLightY?: number; readonly temperaturePresetId?: LightTemperaturePresetId;
  readonly canvasWidth?: number; readonly canvasHeight?: number;
}
export interface NormalizedRadianceSceneConfig {
  readonly scenarioId: RadianceScenarioId; readonly cascadeLevels: number; readonly baseRayCount: number;
  readonly penumbraSoftness: number; readonly rimCutThreshold: number; readonly bounceGiStrength: number;
  readonly keyLightX: number; readonly keyLightY: number; readonly temperaturePresetId: LightTemperaturePresetId;
  readonly canvasWidth: number; readonly canvasHeight: number; readonly activeKeyLightColor: OklchColor;
}
export interface PackedRadianceUniforms {
  readonly buffer: ArrayBuffer; readonly floatView: Float32Array; readonly uintView: Uint32Array;
  readonly byteLength: number; readonly aligned16Bytes: boolean;
}
export interface WgslResourceBinding {
  readonly group: number; readonly binding: number;
  readonly kind: "uniform" | "storage" | "texture" | "storage-texture" | "sampler"; readonly name: string;
}
export interface RadianceShaderContractResult {
  readonly id: RadianceShaderId; readonly labelKo: string; readonly labelEn: string; readonly valid: boolean;
  readonly entryPoints: readonly string[]; readonly workgroupSizes: readonly string[];
  readonly bindings: readonly WgslResourceBinding[]; readonly bindingCount: number;
  readonly withinBindingLimit: boolean; readonly usesStorageTexture: boolean;
  readonly usesWorkgroupSharedMemory: boolean; readonly reservedKeywordCollisions: readonly string[];
  readonly balancedDelimiters: boolean; readonly lineCount: number; readonly errors: readonly string[];
}
export interface RadianceWgslContractsReport {
  readonly validationKind: "static-source-contract"; readonly gpuCompiled: false;
  readonly valid: boolean; readonly shaders: readonly RadianceShaderContractResult[];
  readonly maxBindingCount: number; readonly totalReservedKeywordCollisions: number;
  readonly uniformByteSize: number; readonly uniformAligned16: boolean; readonly errors: readonly string[];
}
export interface CascadeLevelMetrics {
  readonly level: number; readonly probeSpacingPx: number; readonly angularRayCount: number;
  readonly probeGridCols: number; readonly probeGridRows: number;
  readonly intervalStartPx: number; readonly intervalEndPx: number;
  readonly workgroupsX: number; readonly workgroupsY: number; readonly storageTextureBytes: number;
}
export interface RadianceGridSample {
  readonly col: number; readonly row: number; readonly u: number; readonly v: number;
  readonly sdf: number; readonly insideOccluder: boolean; readonly nearestOccluderKind: OccluderKind;
  readonly keyVisibility: number; readonly fillVisibility: number; readonly bounceEnergy: number;
  readonly rimIntensity: number; readonly celBand: number; readonly displayOklch: string; readonly luminance: number;
}
export interface RadianceGridMetrics {
  readonly gridCols: number; readonly gridRows: number; readonly totalSamples: number;
  readonly jfaPassCount: number; readonly occluderCoveragePct: number;
  readonly umbraCellCount: number; readonly penumbraCellCount: number; readonly litCellCount: number;
  readonly meanPenumbraRatio: number; readonly meanBounceGiEnergy: number;
  readonly maxRimLightIntensity: number; readonly rimActiveCellCount: number; readonly totalCascadeStorageKb: number;
}
export interface PipelineArchitectureMetrics {
  readonly backendNameKo: string; readonly backendNameEn: string;
  readonly totalPassesPerFrame: number; readonly renderPassSwitches: number;
  readonly drawCallsPerFrame: number; readonly pingPongFboCount: number;
  readonly storageTextureWriteSupport: boolean; readonly workgroupSharedMemoryBytes: number;
  readonly summaryKo: string; readonly summaryEn: string;
}
export interface WebGpuVsWebGl2ArchitectureComparison {
  readonly modelKind: typeof RADIANCE_MODEL_KIND; readonly jfaPassCount: number; readonly cascadeLevels: number;
  readonly webgpu: PipelineArchitectureMetrics; readonly legacyWebgl2: PipelineArchitectureMetrics;
  readonly passReductionCount: number; readonly renderPassSwitchReduction: number;
}
export interface HonestScopeDisclosure {
  readonly currentImplementationKo: string; readonly currentImplementationEn: string;
  readonly targetRuntimeKo: string; readonly targetRuntimeEn: string;
}
export interface WebGpuRadianceSceneEvaluation {
  readonly sourceKind: "cpu-analytic-lighting-example"; readonly gpuSubmitted: false;
  readonly cpuGpuParityVerified: false; readonly artworkApplied: false; readonly persisted: false;
  readonly schemaVersion: typeof RADIANCE_CASCADES_SCHEMA_VERSION; readonly modelKind: typeof RADIANCE_MODEL_KIND;
  readonly config: NormalizedRadianceSceneConfig; readonly scenario: RadianceLightingScenario;
  readonly cascades: readonly CascadeLevelMetrics[]; readonly gridSamples: readonly RadianceGridSample[];
  readonly gridMetrics: RadianceGridMetrics; readonly architectureComparison: WebGpuVsWebGl2ArchitectureComparison;
  readonly wgslContracts: RadianceWgslContractsReport; readonly uniformByteSize: number;
  readonly uniformAligned16: boolean; readonly honestScopeDisclosure: HonestScopeDisclosure;
}

const RADIANCE_UNIFORM_STRUCT_WGSL = `struct RadianceUniforms {
  canvas_dims: vec4<f32>, cascade_cfg: vec4<u32>, gi_tuning: vec4<f32>,
  key_light_pos: vec4<f32>, key_light_lin: vec4<f32>, fill_light_lin: vec4<f32>,
}`;

/** 1) Jump Flood Algorithm(JFA) 기반 O(log N) 2D 부호 거리장(SDF) 시드·점프 컴퓨트 셰이더. */
export const JFA_SDF_SEED_AND_STEP_WGSL = /* wgsl */ `
${RADIANCE_UNIFORM_STRUCT_WGSL}
@group(0) @binding(0) var<uniform> u_cfg: RadianceUniforms;
@group(0) @binding(1) var occluder_mask_tex: texture_2d<f32>;
@group(0) @binding(2) var jfa_prev_tex: texture_2d<f32>;
@group(0) @binding(3) var jfa_next_out: texture_storage_2d<rg32float, write>;
@group(0) @binding(4) var sdf_out_tex: texture_storage_2d<r32float, write>;

@compute @workgroup_size(8, 8)
fn jfa_seed_occluder_mask(@builtin(global_invocation_id) gid: vec3<u32>) {
  let width = u32(u_cfg.canvas_dims.x); let height = u32(u_cfg.canvas_dims.y);
  if (gid.x >= width || gid.y >= height) { return; }
  let coord = vec2<i32>(i32(gid.x), i32(gid.y));
  let max_xy = vec2<i32>(i32(width) - 1, i32(height) - 1);
  let mask_val = textureLoad(occluder_mask_tex, coord, 0).a;
  var edge_flag = false;
  for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
    for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
      let nb_val = textureLoad(occluder_mask_tex, clamp(coord + vec2<i32>(dx, dy), vec2<i32>(0), max_xy), 0).a;
      if ((mask_val >= 0.5 && nb_val < 0.5) || (mask_val < 0.5 && nb_val >= 0.5)) { edge_flag = true; }
    }
  }
  textureStore(jfa_next_out, coord, vec4<f32>(select(vec2<f32>(-1.0, -1.0), vec2<f32>(f32(gid.x), f32(gid.y)), edge_flag), 0.0, 1.0));
}

@compute @workgroup_size(8, 8)
fn jfa_jump_flood_step(@builtin(global_invocation_id) gid: vec3<u32>) {
  let width = u32(u_cfg.canvas_dims.x); let height = u32(u_cfg.canvas_dims.y);
  if (gid.x >= width || gid.y >= height) { return; }
  let coord = vec2<i32>(i32(gid.x), i32(gid.y));
  let max_xy = vec2<i32>(i32(width) - 1, i32(height) - 1);
  let cur_pos = vec2<f32>(f32(gid.x), f32(gid.y));
  let jump_step = max(1, i32(u_cfg.cascade_cfg.w));
  var best_seed = vec2<f32>(-1.0, -1.0); var best_dist_sq = 1e20;
  for (var dy: i32 = -1; dy <= 1; dy = dy + 1) {
    for (var dx: i32 = -1; dx <= 1; dx = dx + 1) {
      let cand = textureLoad(jfa_prev_tex, clamp(coord + vec2<i32>(dx * jump_step, dy * jump_step), vec2<i32>(0), max_xy), 0).xy;
      if (cand.x >= 0.0) {
        let delta = cur_pos - cand; let d_sq = dot(delta, delta);
        if (d_sq < best_dist_sq) { best_dist_sq = d_sq; best_seed = cand; }
      }
    }
  }
  textureStore(jfa_next_out, coord, vec4<f32>(best_seed, 0.0, 1.0));
  if (jump_step == 1) {
    let inside = textureLoad(occluder_mask_tex, coord, 0).a >= 0.5;
    let raw_dist = select(sqrt(best_dist_sq), u_cfg.canvas_dims.x, best_seed.x < 0.0);
    textureStore(sdf_out_tex, coord, vec4<f32>(select(raw_dist, -raw_dist, inside) * u_cfg.canvas_dims.z, 0.0, 0.0, 1.0));
  }
}
`.trim();

/** 2) 계층적 Radiance Cascades(0..5) SDF 스피어 트레이싱 반그림자·색 번짐 컴퓨트 셰이더. */
export const RADIANCE_CASCADE_PROBE_WGSL = /* wgsl */ `
${RADIANCE_UNIFORM_STRUCT_WGSL}
@group(0) @binding(0) var<uniform> u_cfg: RadianceUniforms;
@group(0) @binding(1) var sdf_field_tex: texture_2d<f32>;
@group(0) @binding(2) var emissive_albedo_tex: texture_2d<f32>;
@group(0) @binding(3) var cascade_out_tex: texture_storage_2d<rgba16float, write>;
var<workgroup> probe_scratch: array<vec4<f32>, 64>;

fn uv_to_texel(uv: vec2<f32>) -> vec2<i32> {
  let dims = u_cfg.canvas_dims.xy;
  return clamp(vec2<i32>(uv * dims), vec2<i32>(0), vec2<i32>(dims) - vec2<i32>(1));
}

@compute @workgroup_size(8, 8)
fn trace_radiance_cascade(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_index) lid: u32) {
  let cascade_idx = u_cfg.cascade_cfg.x; let spacing = 1u << cascade_idx;
  let probe_cols = max(1u, (u32(u_cfg.canvas_dims.x) + spacing - 1u) / spacing);
  let probe_rows = max(1u, (u32(u_cfg.canvas_dims.y) + spacing - 1u) / spacing);
  let in_bounds = gid.x < probe_cols && gid.y < probe_rows;
  let bounce_gain = u_cfg.gi_tuning.y;
  var probe_out = vec4<f32>(0.0, 0.0, 0.0, 1.0);
  if (in_bounds) {
    let probe_uv = (vec2<f32>(f32(gid.x * spacing), f32(gid.y * spacing)) + vec2<f32>(0.5)) * u_cfg.canvas_dims.zw;
    let ray_count = max(4u, u_cfg.cascade_cfg.z) << (2u * cascade_idx);
    let t_start = 0.025 * f32((1u << (2u * cascade_idx)) - 1u) / 3.0;
    let t_end = 0.025 * f32((1u << (2u * (cascade_idx + 1u))) - 1u) / 3.0;
    let softness_k = mix(18.0, 2.8, clamp(u_cfg.gi_tuning.x, 0.0, 1.0));
    let sample_rays = min(ray_count, 32u); let inv_rays = 1.0 / f32(sample_rays);
    var accum_rad = vec3<f32>(0.0); var accum_vis = 0.0;
    for (var ri: u32 = 0u; ri < sample_rays; ri = ri + 1u) {
      let angle = (f32(ri) + 0.5) * 6.2831853 * inv_rays;
      let ray_dir = vec2<f32>(cos(angle), sin(angle));
      var t_march = t_start; var penumbra = 1.0; var ray_rad = vec3<f32>(0.0);
      for (var step_i: u32 = 0u; step_i < 16u; step_i = step_i + 1u) {
        if (t_march >= t_end) { break; }
        let pos_uv = probe_uv + ray_dir * t_march;
        if (pos_uv.x < 0.0 || pos_uv.x > 1.0 || pos_uv.y < 0.0 || pos_uv.y > 1.0) { break; }
        let d_val = textureLoad(sdf_field_tex, uv_to_texel(pos_uv), 0).r;
        if (d_val <= 0.002) {
          let hit_tex = textureLoad(emissive_albedo_tex, uv_to_texel(pos_uv), 0);
          ray_rad = ray_rad + hit_tex.rgb * (hit_tex.a * u_cfg.fill_light_lin.w + bounce_gain * 0.45);
          penumbra = 0.0; break;
        }
        penumbra = min(penumbra, clamp(softness_k * d_val / max(t_march, 0.004), 0.0, 1.0));
        t_march = t_march + max(d_val, 0.008);
      }
      let to_key = u_cfg.key_light_pos.xy - probe_uv; let key_dist = max(length(to_key), 0.02);
      let key_att = u_cfg.key_light_pos.w / (1.0 + key_dist * key_dist * 4.5);
      accum_rad = accum_rad + ray_rad + u_cfg.key_light_lin.rgb * (max(0.0, dot(ray_dir, to_key / key_dist)) * key_att * penumbra);
      accum_vis = accum_vis + penumbra;
    }
    probe_out = vec4<f32>(accum_rad * inv_rays, accum_vis * inv_rays);
  }
  probe_scratch[lid] = probe_out;
  workgroupBarrier();
  if (in_bounds) {
    let neighbor_rad = probe_scratch[(lid + 1u) & 63u].rgb * 0.08 * bounce_gain;
    textureStore(cascade_out_tex, vec2<i32>(i32(gid.x), i32(gid.y)), vec4<f32>(probe_out.rgb + neighbor_rad, probe_out.a));
  }
}
`.trim();

/** 3) 상위→하위 캐스케이드 이중선형 병합 + 웹툰 셀 셰이딩 림라이트·톤 컷 합성 셰이더. */
export const RADIANCE_CASCADE_MERGE_AND_CEL_WGSL = /* wgsl */ `
${RADIANCE_UNIFORM_STRUCT_WGSL}
@group(0) @binding(0) var<uniform> u_cfg: RadianceUniforms;
@group(0) @binding(1) var lower_cascade_tex: texture_2d<f32>;
@group(0) @binding(2) var upper_cascade_tex: texture_2d<f32>;
@group(0) @binding(3) var sdf_field_tex: texture_2d<f32>;
@group(0) @binding(4) var base_albedo_tex: texture_2d<f32>;
@group(0) @binding(5) var merged_out_tex: texture_storage_2d<rgba16float, write>;
@group(0) @binding(6) var final_frame_out: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(8, 8)
fn merge_radiance_cascades(@builtin(global_invocation_id) gid: vec3<u32>) {
  let lower_dims = textureDimensions(lower_cascade_tex);
  if (gid.x >= lower_dims.x || gid.y >= lower_dims.y) { return; }
  let upper_dims = textureDimensions(upper_cascade_tex);
  let near_rad = textureLoad(lower_cascade_tex, vec2<i32>(i32(gid.x), i32(gid.y)), 0);
  let upper_f = (vec2<f32>(f32(gid.x), f32(gid.y)) + vec2<f32>(0.5)) * 0.5 - vec2<f32>(0.5);
  let base_xy = vec2<i32>(floor(upper_f)); let frac_xy = clamp(upper_f - vec2<f32>(base_xy), vec2<f32>(0.0), vec2<f32>(1.0));
  let max_xy = vec2<i32>(i32(upper_dims.x) - 1, i32(upper_dims.y) - 1);
  let c00 = textureLoad(upper_cascade_tex, clamp(base_xy, vec2<i32>(0), max_xy), 0);
  let c10 = textureLoad(upper_cascade_tex, clamp(base_xy + vec2<i32>(1, 0), vec2<i32>(0), max_xy), 0);
  let c01 = textureLoad(upper_cascade_tex, clamp(base_xy + vec2<i32>(0, 1), vec2<i32>(0), max_xy), 0);
  let c11 = textureLoad(upper_cascade_tex, clamp(base_xy + vec2<i32>(1, 1), vec2<i32>(0), max_xy), 0);
  let far_rad = mix(mix(c00, c10, frac_xy.x), mix(c01, c11, frac_xy.x), frac_xy.y);
  textureStore(merged_out_tex, vec2<i32>(i32(gid.x), i32(gid.y)), vec4<f32>(near_rad.rgb + near_rad.a * far_rad.rgb, near_rad.a * far_rad.a));
}

@compute @workgroup_size(8, 8)
fn composite_cel_rim_final(@builtin(global_invocation_id) gid: vec3<u32>) {
  let width = u32(u_cfg.canvas_dims.x); let height = u32(u_cfg.canvas_dims.y);
  if (gid.x >= width || gid.y >= height) { return; }
  let coord = vec2<i32>(i32(gid.x), i32(gid.y)); let max_xy = vec2<i32>(i32(width) - 1, i32(height) - 1);
  let gi_rad = textureLoad(lower_cascade_tex, coord, 0);
  let albedo = textureLoad(base_albedo_tex, coord, 0).rgb; let sdf_c = textureLoad(sdf_field_tex, coord, 0).r;
  let sdf_dx = textureLoad(sdf_field_tex, clamp(coord + vec2<i32>(1, 0), vec2<i32>(0), max_xy), 0).r
    - textureLoad(sdf_field_tex, clamp(coord - vec2<i32>(1, 0), vec2<i32>(0), max_xy), 0).r;
  let sdf_dy = textureLoad(sdf_field_tex, clamp(coord + vec2<i32>(0, 1), vec2<i32>(0), max_xy), 0).r
    - textureLoad(sdf_field_tex, clamp(coord - vec2<i32>(0, 1), vec2<i32>(0), max_xy), 0).r;
  let surf_n = normalize(vec2<f32>(sdf_dx, sdf_dy) + vec2<f32>(1e-5, 0.0));
  let uv = (vec2<f32>(f32(gid.x), f32(gid.y)) + vec2<f32>(0.5)) * u_cfg.canvas_dims.zw;
  let key_dir = normalize(u_cfg.key_light_pos.xy - uv + vec2<f32>(1e-5, 0.0));
  let luma = dot(gi_rad.rgb, vec3<f32>(0.2126, 0.7152, 0.0722)) + u_cfg.key_light_lin.w;
  let cel_steps = max(2.0, u_cfg.gi_tuning.w); let cel_quant = floor(clamp(luma, 0.0, 1.0) * cel_steps) / cel_steps;
  let rim_raw = (1.0 - smoothstep(0.0, 0.055, abs(sdf_c))) * max(0.0, dot(surf_n, key_dir)) * gi_rad.a;
  let rim_cut = step(u_cfg.gi_tuning.z, rim_raw) * rim_raw;
  let shaded = albedo * (gi_rad.rgb * 0.65 + vec3<f32>(cel_quant * 0.45))
    + u_cfg.key_light_lin.rgb * (rim_cut * 1.35) + u_cfg.fill_light_lin.rgb * (u_cfg.gi_tuning.y * 0.14);
  textureStore(final_frame_out, coord, vec4<f32>(shaded, 1.0));
}
`.trim();

/** WGSL 예약어·미래 예약어 금지 목록(식별자 충돌 0 검증용). */
const WGSL_RESERVED_KEYWORDS: ReadonlySet<string> = new Set(
  "alias break case const const_assert continue continuing default diagnostic discard else enable false fn for if let loop override requires return struct switch true var while abstract active alignas alignof as asm async attribute auto await become cast catch class coherent common compile concept crate debugger decltype delete do enum explicit export extends extern external fallthrough filter final finally friend from get goto groupshared highp impl implements import inline instanceof interface layout lowp macro match mediump meta mod module move mut mutable namespace new nil noexcept null nullptr of operator package partition pass patch precise precision priv protected pub public readonly ref regardless register require resource restrict self set shared sizeof smooth snorm static std subroutine super target template this throw trait try type typedef typeof union unless unorm unsafe use using varying virtual volatile wgsl where with writeonly yield".split(" "),
);

/** 탈-바이올렛 OKLCH 광원 색온도 프리셋 (휴 270~320° 완전 배제). */
export const LIGHT_TEMPERATURE_PRESETS: readonly LightTemperaturePreset[] = [
  { id: "scenario-default", labelKo: "시나리오 기본", labelEn: "Scenario Default", kelvinLabel: "Auto", color: null },
  { id: "warm-amber", labelKo: "노을 앰버", labelEn: "Warm Amber", kelvinLabel: "3200K", color: { l: 0.79, c: 0.17, h: 56 } },
  { id: "golden-dusk", labelKo: "코랄 석양", labelEn: "Coral Dusk", kelvinLabel: "2800K", color: { l: 0.73, c: 0.17, h: 34 } },
  { id: "neutral-studio", labelKo: "스튜디오 아이보리", labelEn: "Studio Ivory", kelvinLabel: "5400K", color: { l: 0.86, c: 0.08, h: 86 } },
  { id: "emerald-bounce", labelKo: "에메랄드 바운스", labelEn: "Emerald Bounce", kelvinLabel: "6200K", color: { l: 0.76, c: 0.16, h: 156 } },
  { id: "cool-cyan", labelKo: "네온 시안", labelEn: "Neon Cyan", kelvinLabel: "7800K", color: { l: 0.78, c: 0.14, h: 202 } },
];

/** 4종 웹툰 조명 시나리오 정본 (모든 색상 탈-바이올렛 OKLCH). */
export const RADIANCE_LIGHTING_SCENARIOS: readonly RadianceLightingScenario[] = [
  {
    id: "neon-alley-rim", titleKo: "네온 골목 림라이트", titleEn: "Neon Alley Rim",
    moodKo: "비 젖은 뒷골목 시안 네온 림라이트와 간판 코랄 반사광이 겹치는 액션 컷",
    moodEn: "Rainy alley action panel pairing cyan neon rim light with coral storefront bounce",
    defaultKeyLightX: 0.82, defaultKeyLightY: 0.22, keyLightRadius: 0.048, keyLightIntensity: 1.35,
    keyLightColor: { l: 0.78, c: 0.14, h: 202 }, fillLightX: 0.14, fillLightY: 0.74, fillLightIntensity: 0.92,
    fillLightColor: { l: 0.72, c: 0.17, h: 36 }, rimLightColor: { l: 0.86, c: 0.12, h: 194 }, ambientFloor: 0.12,
    occluders: [
      { id: "alley-hero-torso", kind: "character", shape: "capsule", labelKo: "주인공 실루엣", labelEn: "Hero Silhouette", x: 0.48, y: 0.50, x2: 0.48, y2: 0.84, radius: 0.105, albedo: { l: 0.56, c: 0.09, h: 214 }, emissiveStrength: 0.04 },
      { id: "alley-hero-head", kind: "character", shape: "circle", labelKo: "주인공 두상", labelEn: "Hero Head", x: 0.48, y: 0.34, radius: 0.078, albedo: { l: 0.74, c: 0.08, h: 64 }, emissiveStrength: 0.05 },
      { id: "alley-wall-pillar", kind: "background", shape: "rounded-box", labelKo: "골목 벽 기둥", labelEn: "Alley Wall Pillar", x: 0.20, y: 0.52, halfW: 0.07, halfH: 0.34, radius: 0.018, albedo: { l: 0.62, c: 0.14, h: 38 }, emissiveStrength: 0.42 },
      { id: "alley-speech-balloon", kind: "balloon", shape: "rounded-box", labelKo: "대사 말풍선", labelEn: "Speech Balloon", x: 0.76, y: 0.76, halfW: 0.11, halfH: 0.07, radius: 0.032, albedo: { l: 0.90, c: 0.04, h: 192 }, emissiveStrength: 0.26 },
    ],
  },
  {
    id: "sunset-classroom-window", titleKo: "노을 교실 창가", titleEn: "Sunset Classroom Window",
    moodKo: "낮은 노을빛이 창틀 기둥을 통과해 긴 반그림자와 따뜻한 책상 바운스를 형성",
    moodEn: "Low golden-hour sun streaming across classroom mullions with warm desk bounce",
    defaultKeyLightX: 0.16, defaultKeyLightY: 0.26, keyLightRadius: 0.062, keyLightIntensity: 1.42,
    keyLightColor: { l: 0.80, c: 0.17, h: 58 }, fillLightX: 0.84, fillLightY: 0.78, fillLightIntensity: 0.68,
    fillLightColor: { l: 0.70, c: 0.16, h: 28 }, rimLightColor: { l: 0.88, c: 0.15, h: 78 }, ambientFloor: 0.18,
    occluders: [
      { id: "class-window-mullion", kind: "background", shape: "rounded-box", labelKo: "창틀 기둥", labelEn: "Window Mullion", x: 0.30, y: 0.48, halfW: 0.045, halfH: 0.38, radius: 0.012, albedo: { l: 0.52, c: 0.09, h: 52 }, emissiveStrength: 0.08 },
      { id: "class-student-body", kind: "character", shape: "capsule", labelKo: "학생 캐릭터", labelEn: "Student Figure", x: 0.58, y: 0.46, x2: 0.62, y2: 0.82, radius: 0.095, albedo: { l: 0.68, c: 0.11, h: 42 }, emissiveStrength: 0.12 },
      { id: "class-student-head", kind: "character", shape: "circle", labelKo: "학생 두상", labelEn: "Student Head", x: 0.57, y: 0.31, radius: 0.072, albedo: { l: 0.78, c: 0.09, h: 66 }, emissiveStrength: 0.06 },
      { id: "class-thought-balloon", kind: "balloon", shape: "rounded-box", labelKo: "독백 말풍선", labelEn: "Thought Balloon", x: 0.80, y: 0.24, halfW: 0.10, halfH: 0.065, radius: 0.03, albedo: { l: 0.92, c: 0.05, h: 76 }, emissiveStrength: 0.20 },
    ],
  },
  {
    id: "fantasy-crystal-bounce", titleKo: "판타지 에메랄드 반사광", titleEn: "Fantasy Crystal Bounce",
    moodKo: "유적 수정 원석의 에메랄드 하방 발광과 횃불 골드 역광이 교차하는 색 번짐 연출",
    moodEn: "Ancient crystal emerald uplighting colliding with warm torch gold color bleeding",
    defaultKeyLightX: 0.24, defaultKeyLightY: 0.72, keyLightRadius: 0.056, keyLightIntensity: 1.38,
    keyLightColor: { l: 0.76, c: 0.16, h: 156 }, fillLightX: 0.84, fillLightY: 0.24, fillLightIntensity: 0.96,
    fillLightColor: { l: 0.82, c: 0.15, h: 74 }, rimLightColor: { l: 0.85, c: 0.13, h: 172 }, ambientFloor: 0.15,
    occluders: [
      { id: "crystal-pillar", kind: "background", shape: "capsule", labelKo: "수정 원석 기둥", labelEn: "Crystal Core", x: 0.26, y: 0.56, x2: 0.28, y2: 0.84, radius: 0.062, albedo: { l: 0.78, c: 0.16, h: 154 }, emissiveStrength: 0.78 },
      { id: "mage-cloak", kind: "character", shape: "capsule", labelKo: "마법사 망토", labelEn: "Mage Cloak", x: 0.56, y: 0.44, x2: 0.58, y2: 0.84, radius: 0.108, albedo: { l: 0.58, c: 0.12, h: 176 }, emissiveStrength: 0.16 },
      { id: "mage-head", kind: "character", shape: "circle", labelKo: "마법사 두상", labelEn: "Mage Head", x: 0.56, y: 0.28, radius: 0.072, albedo: { l: 0.76, c: 0.08, h: 70 }, emissiveStrength: 0.05 },
      { id: "rune-balloon", kind: "balloon", shape: "rounded-box", labelKo: "영창 말풍선", labelEn: "Spell Balloon", x: 0.78, y: 0.70, halfW: 0.105, halfH: 0.068, radius: 0.028, albedo: { l: 0.88, c: 0.11, h: 82 }, emissiveStrength: 0.34 },
    ],
  },
  {
    id: "noir-spotlight-shadow", titleKo: "느와르 스포트라이트 그림자", titleEn: "Noir Spotlight Shadow",
    moodKo: "상단 아이보리 스포트라이트가 깊은 SDF 음영과 절제된 앰버 림 엣지를 조각",
    moodEn: "Overhead ivory spotlight carving deep SDF umbra with restrained amber rim edge",
    defaultKeyLightX: 0.50, defaultKeyLightY: 0.12, keyLightRadius: 0.036, keyLightIntensity: 1.48,
    keyLightColor: { l: 0.86, c: 0.10, h: 86 }, fillLightX: 0.16, fillLightY: 0.82, fillLightIntensity: 0.52,
    fillLightColor: { l: 0.62, c: 0.08, h: 218 }, rimLightColor: { l: 0.82, c: 0.14, h: 66 }, ambientFloor: 0.07,
    occluders: [
      { id: "noir-detective-coat", kind: "character", shape: "capsule", labelKo: "탐정 트렌치코트", labelEn: "Detective Coat", x: 0.50, y: 0.52, x2: 0.50, y2: 0.86, radius: 0.112, albedo: { l: 0.44, c: 0.05, h: 212 }, emissiveStrength: 0.02 },
      { id: "noir-detective-hat", kind: "character", shape: "rounded-box", labelKo: "중절모 실루엣", labelEn: "Fedora Brim", x: 0.50, y: 0.34, halfW: 0.115, halfH: 0.034, radius: 0.016, albedo: { l: 0.40, c: 0.05, h: 72 }, emissiveStrength: 0.02 },
      { id: "noir-blind-slat", kind: "background", shape: "rounded-box", labelKo: "블라인드 창살", labelEn: "Venetian Slat", x: 0.22, y: 0.38, halfW: 0.065, halfH: 0.16, radius: 0.014, albedo: { l: 0.48, c: 0.06, h: 216 }, emissiveStrength: 0.06 },
      { id: "noir-caption-box", kind: "balloon", shape: "rounded-box", labelKo: "내레이션 박스", labelEn: "Narration Box", x: 0.80, y: 0.78, halfW: 0.115, halfH: 0.062, radius: 0.012, albedo: { l: 0.88, c: 0.07, h: 82 }, emissiveStrength: 0.18 },
    ],
  },
];

function clampNum(v: number | undefined, min: number, max: number, fb: number): number { return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fb; }
function clampInt(v: number | undefined, min: number, max: number, fb: number): number { return Math.round(clampNum(v, min, max, fb)); }
function round3(v: number): number { return Math.round(v * 1000) / 1000; }

/** 주어진 OKLCH 휴 각도(도)가 금지 바이올렛 대역(270~320°)에 해당하는지 판정한다. */
export function isVioletHueDeg(hueDeg: number): boolean {
  const n = ((hueDeg % 360) + 360) % 360;
  return n >= VIOLET_HUE_MIN_DEG && n <= VIOLET_HUE_MAX_DEG;
}
/** OKLCH 색상을 안전 범위로 정규화하고 바이올렛 휴(270~320°)를 결정론적으로 치환한다. */
export function sanitizeNonVioletOklch(color: OklchColor): OklchColor {
  const l = clampNum(color.l, 0.05, 0.98, 0.7);
  const c = clampNum(color.c, 0, 0.34, 0.12);
  const rawHue = Number.isFinite(color.h) ? ((color.h % 360) + 360) % 360 : 84;
  const h = isVioletHueDeg(rawHue) ? (rawHue < 295 ? 216 : 42) : rawHue;
  return { l: round3(l), c: round3(c), h: Math.round(h * 10) / 10 };
}
/** 탈-바이올렛 OKLCH CSS 문자열을 생성한다. */
export function formatOklch(color: OklchColor, alpha?: number): string {
  const s = sanitizeNonVioletOklch(color);
  return typeof alpha === "number" && Number.isFinite(alpha) && alpha < 0.999
    ? `oklch(${s.l} ${s.c} ${s.h} / ${round3(clampNum(alpha, 0, 1, 1))})`
    : `oklch(${s.l} ${s.c} ${s.h})`;
}
/** OKLCH를 GPU Uniform 및 선형 라디언스 합산용 선형 채널(3-튜플)로 변환한다. */
export function oklchToLinearChannels(color: OklchColor): readonly [number, number, number] {
  const s = sanitizeNonVioletOklch(color);
  const rad = (s.h * Math.PI) / 180;
  const a = s.c * Math.cos(rad); const b = s.c * Math.sin(rad);
  const lC = (s.l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mC = (s.l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sC = (s.l - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    round3(clampNum(4.0767416621 * lC - 3.3077115913 * mC + 0.2309699292 * sC, 0, 1, 0)),
    round3(clampNum(-1.2684380046 * lC + 2.6097574011 * mC - 0.3413193965 * sC, 0, 1, 0)),
    round3(clampNum(-0.0041960863 * lC - 0.7034186147 * mC + 1.7076147010 * sC, 0, 1, 0)),
  ];
}
/** 선형 복사 에너지(3-튜플)를 탈-바이올렛 OKLCH로 역변환한다. */
export function linearChannelsToOklch(rIn: number, gIn: number, bIn: number): OklchColor {
  const r = clampNum(rIn, 0, 1.5, 0); const g = clampNum(gIn, 0, 1.5, 0); const b = clampNum(bIn, 0, 1.5, 0);
  const l = Math.cbrt(Math.max(0, 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b));
  const m = Math.cbrt(Math.max(0, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b));
  const s = Math.cbrt(Math.max(0, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b));
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bp = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const C = Math.hypot(a, bp);
  return sanitizeNonVioletOklch({ l: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, c: Math.min(0.24, C), h: C < 0.002 ? 84 : ((Math.atan2(bp, a) * 180) / Math.PI + 360) % 360 });
}
/** ID로 웹툰 조명 시나리오 정본을 조회한다. */
export function getRadianceLightingScenario(id?: RadianceScenarioId): RadianceLightingScenario {
  return RADIANCE_LIGHTING_SCENARIOS.find((item) => item.id === id) ?? RADIANCE_LIGHTING_SCENARIOS[0];
}
/** 외부 시나리오·캐스케이드 입력을 안전 범위로 정규화한다. */
export function normalizeRadianceSceneInput(input?: RadianceSceneInput): NormalizedRadianceSceneConfig {
  const sc = getRadianceLightingScenario(input?.scenarioId);
  const preset = LIGHT_TEMPERATURE_PRESETS.find((p) => p.id === input?.temperaturePresetId) ?? LIGHT_TEMPERATURE_PRESETS[0];
  return {
    scenarioId: sc.id, cascadeLevels: clampInt(input?.cascadeLevels, MIN_CASCADE_LEVELS, MAX_CASCADE_LEVELS, DEFAULT_CASCADE_LEVELS),
    baseRayCount: clampInt(input?.baseRayCount, MIN_BASE_RAY_COUNT, MAX_BASE_RAY_COUNT, DEFAULT_BASE_RAY_COUNT),
    penumbraSoftness: round3(clampNum(input?.penumbraSoftness, 0.1, 1.0, 0.62)),
    rimCutThreshold: round3(clampNum(input?.rimCutThreshold, 0.15, 0.9, 0.52)),
    bounceGiStrength: round3(clampNum(input?.bounceGiStrength, 0, 1.5, 0.88)),
    keyLightX: round3(clampNum(input?.keyLightX, 0.06, 0.94, sc.defaultKeyLightX)),
    keyLightY: round3(clampNum(input?.keyLightY, 0.06, 0.94, sc.defaultKeyLightY)),
    temperaturePresetId: preset.id, canvasWidth: clampInt(input?.canvasWidth, 256, 4096, 1024),
    canvasHeight: clampInt(input?.canvasHeight, 256, 4096, 1024), activeKeyLightColor: sanitizeNonVioletOklch(preset.color ?? sc.keyLightColor),
  };
}
/** RadianceUniforms(96B, 16B 정렬) GPU Uniform 버퍼를 결정론적으로 패킹한다. */
export function packRadianceUniforms(config: NormalizedRadianceSceneConfig, cascadeIndex = 0, jfaStepPx = 1): PackedRadianceUniforms {
  assertNormalizedRadianceConfig(config);
  if (!Number.isInteger(cascadeIndex) || cascadeIndex < 0 || cascadeIndex >= config.cascadeLevels || !Number.isInteger(jfaStepPx) || jfaStepPx < 1 || jfaStepPx > Math.max(config.canvasWidth, config.canvasHeight)) throw new RangeError("Uniform 계층 index·JFA step이 지원 범위를 벗어났습니다.");
  const sc = getRadianceLightingScenario(config.scenarioId);
  const buffer = new ArrayBuffer(RADIANCE_UNIFORM_BYTE_SIZE);
  const floatView = new Float32Array(buffer);
  const uintView = new Uint32Array(buffer);
  const keyLin = oklchToLinearChannels(config.activeKeyLightColor);
  const fillLin = oklchToLinearChannels(sc.fillLightColor);
  floatView.set([config.canvasWidth, config.canvasHeight, 1 / config.canvasWidth, 1 / config.canvasHeight], 0);
  uintView.set([clampInt(cascadeIndex, 0, config.cascadeLevels - 1, 0), config.cascadeLevels, config.baseRayCount, Math.max(1, Math.round(jfaStepPx))], 4);
  floatView.set([config.penumbraSoftness, config.bounceGiStrength, config.rimCutThreshold, 4], 8);
  floatView.set([config.keyLightX, config.keyLightY, sc.keyLightRadius, sc.keyLightIntensity], 12);
  floatView.set([keyLin[0], keyLin[1], keyLin[2], sc.ambientFloor], 16);
  floatView.set([fillLin[0], fillLin[1], fillLin[2], sc.fillLightIntensity], 20);
  return { buffer, floatView, uintView, byteLength: buffer.byteLength, aligned16Bytes: buffer.byteLength % 16 === 0 && buffer.byteLength === RADIANCE_UNIFORM_BYTE_SIZE };
}

function checkBalancedDelimiters(source: string): boolean {
  let b = 0; let p = 0; let k = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") b += 1; else if (ch === "}") { b -= 1; if (b < 0) return false; }
    else if (ch === "(") p += 1; else if (ch === ")") { p -= 1; if (p < 0) return false; }
    else if (ch === "[") k += 1; else if (ch === "]") { k -= 1; if (k < 0) return false; }
  }
  return b === 0 && p === 0 && k === 0;
}

function extractDeclaredWgslIdentifiers(source: string): readonly string[] {
  const clean = source.replace(/\/\/[^\n]*/gu, "");
  const ids: string[] = [];
  for (const re of [/\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gu, /\b(?:let|var)(?:<[^>]+>)?\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::|=)/gu, /\bstruct\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gu]) {
    for (const m of clean.matchAll(re)) { if (m[1]) ids.push(m[1]); }
  }
  for (const sm of clean.matchAll(/\bstruct\s+[A-Za-z_][A-Za-z0-9_]*\s*\{([^}]*)\}/gu)) {
    for (const fm of (sm[1] ?? "").matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*:/gu)) { if (fm[1]) ids.push(fm[1]); }
  }
  return ids;
}

function validateSingleRadianceWgsl(id: RadianceShaderId, labelKo: string, labelEn: string, source: string): RadianceShaderContractResult {
  if (typeof source !== "string" || source.length > 65_536) throw new RangeError("WGSL 소스 정적 검사는 각 65,536자까지 지원합니다.");
  const errors: string[] = [];
  const balancedDelimiters = checkBalancedDelimiters(source);
  if (!balancedDelimiters) errors.push(`${id}: WGSL 중괄호·소괄호·대괄호 짝이 맞지 않습니다.`);
  const entryMatches = [...source.matchAll(/@compute\s+@workgroup_size\(([^)]+)\)\s*fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gu)];
  const entryPoints = entryMatches.map((m) => m[2] ?? "").filter(Boolean);
  const workgroupSizes = entryMatches.map((m) => (m[1] ?? "").replace(/\s+/gu, ""));
  if (entryPoints.length === 0) errors.push(`${id}: @compute @workgroup_size(8, 8) 진입점이 없습니다.`);
  for (const wg of workgroupSizes) { if (wg !== "8,8" && wg !== "8,8,1") errors.push(`${id}: 예상 workgroup_size(8, 8)과 다른 선언이 감지되었습니다(${wg}).`); }
  if (!/@builtin\(\s*global_invocation_id\s*\)/u.test(source)) errors.push(`${id}: @builtin(global_invocation_id) 내장 매개변수가 누락되었습니다.`);

  const bindings: WgslResourceBinding[] = [];
  const seenSlots = new Set<string>();
  for (const match of source.matchAll(/@group\((\d+)\)\s*@binding\((\d+)\)\s*var(?:<([^>]+)>)?\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^;]+);/gu)) {
    const group = Number(match[1]); const binding = Number(match[2]);
    const space = (match[3] ?? "").trim(); const name = (match[4] ?? "").trim(); const typeText = (match[5] ?? "").trim();
    const slotKey = `${group}:${binding}`;
    if (seenSlots.has(slotKey)) errors.push(`${id}: 중복 바인딩 슬롯 @group(${group}) @binding(${binding}).`);
    seenSlots.add(slotKey);
    const kind: WgslResourceBinding["kind"] = space.startsWith("uniform") ? "uniform"
      : space.startsWith("storage") ? "storage"
        : typeText.startsWith("texture_storage_") ? "storage-texture"
          : typeText.startsWith("sampler") ? "sampler" : "texture";
    bindings.push({ group, binding, kind, name });
  }
  const withinBindingLimit = bindings.length > 0 && bindings.length <= RADIANCE_MAX_BINDINGS_PER_PASS;
  if (bindings.length === 0) errors.push(`${id}: @group/@binding 선언이 없습니다.`);
  else if (bindings.length > RADIANCE_MAX_BINDINGS_PER_PASS) errors.push(`${id}: 바인딩 수(${bindings.length})가 상한(${RADIANCE_MAX_BINDINGS_PER_PASS})을 초과했습니다.`);
  const usesStorageTexture = bindings.some((b) => b.kind === "storage-texture");
  if (!usesStorageTexture) errors.push(`${id}: WebGPU texture_storage_2d 출력 바인딩이 누락되었습니다.`);
  const reservedKeywordCollisions = [...new Set(extractDeclaredWgslIdentifiers(source).filter((ident) => WGSL_RESERVED_KEYWORDS.has(ident)))];
  if (reservedKeywordCollisions.length > 0) errors.push(`${id}: WGSL 예약어 충돌 감지(${reservedKeywordCollisions.join(", ")}).`);

  return {
    id, labelKo, labelEn, valid: errors.length === 0, entryPoints, workgroupSizes, bindings, bindingCount: bindings.length,
    withinBindingLimit, usesStorageTexture,
    usesWorkgroupSharedMemory: /\bvar<workgroup>\s+/u.test(source) && /\bworkgroupBarrier\s*\(/u.test(source),
    reservedKeywordCollisions, balancedDelimiters, lineCount: source.split(/\r?\n/u).length, errors,
  };
}

/** 3종 Radiance Cascades WGSL 컴퓨트 셰이더와 16B Uniform 계약을 일괄 검증한다. */
export function validateRadianceWgslContracts(overrides?: { readonly jfaSdfWgsl?: string; readonly cascadeProbeWgsl?: string; readonly mergeCelWgsl?: string }): RadianceWgslContractsReport {
  const shaders: readonly RadianceShaderContractResult[] = [
    validateSingleRadianceWgsl("jfa-sdf", "① JFA SDF 시드·점프 패스", "1. JFA SDF Seed & Step", overrides?.jfaSdfWgsl ?? JFA_SDF_SEED_AND_STEP_WGSL),
    validateSingleRadianceWgsl("cascade-probe", "② Radiance Cascade 프로브 추적", "2. Radiance Cascade Probe", overrides?.cascadeProbeWgsl ?? RADIANCE_CASCADE_PROBE_WGSL),
    validateSingleRadianceWgsl("merge-cel", "③ 캐스케이드 병합 · 셀 림라이트", "3. Cascade Merge & Cel Rim", overrides?.mergeCelWgsl ?? RADIANCE_CASCADE_MERGE_AND_CEL_WGSL),
  ];
  const probeSample = packRadianceUniforms(normalizeRadianceSceneInput());
  const errors: string[] = shaders.flatMap((s) => [...s.errors]);
  if (!probeSample.aligned16Bytes) errors.push(`RadianceUniforms 바이트 크기(${probeSample.byteLength}B)가 16B 정렬을 위반했습니다.`);
  return {
    validationKind: "static-source-contract", gpuCompiled: false,
    valid: errors.length === 0, shaders,
    maxBindingCount: shaders.reduce((acc, s) => Math.max(acc, s.bindingCount), 0),
    totalReservedKeywordCollisions: shaders.reduce((acc, s) => acc + s.reservedKeywordCollisions.length, 0),
    uniformByteSize: probeSample.byteLength, uniformAligned16: probeSample.aligned16Bytes, errors,
  };
}

/** 캐스케이드 계층(공간 간격 2× · 각도 광선 4×) 피라미드 명세를 계산한다. */
export function buildCascadePyramidMetrics(config: NormalizedRadianceSceneConfig): readonly CascadeLevelMetrics[] {
  assertNormalizedRadianceConfig(config);
  const baseIntervalPx = Math.max(8, Math.round(Math.min(config.canvasWidth, config.canvasHeight) * 0.025));
  const levels: CascadeLevelMetrics[] = [];
  for (let level = 0; level < config.cascadeLevels; level += 1) {
    const probeSpacingPx = 1 << level;
    const probeGridCols = Math.max(1, Math.ceil(config.canvasWidth / probeSpacingPx));
    const probeGridRows = Math.max(1, Math.ceil(config.canvasHeight / probeSpacingPx));
    levels.push({
      level, probeSpacingPx, angularRayCount: config.baseRayCount * (1 << (2 * level)), probeGridCols, probeGridRows,
      intervalStartPx: Math.round((baseIntervalPx * ((1 << (2 * level)) - 1)) / 3),
      intervalEndPx: Math.round((baseIntervalPx * ((1 << (2 * (level + 1))) - 1)) / 3),
      workgroupsX: Math.max(1, Math.ceil(probeGridCols / RADIANCE_WORKGROUP_SIZE)),
      workgroupsY: Math.max(1, Math.ceil(probeGridRows / RADIANCE_WORKGROUP_SIZE)),
      storageTextureBytes: probeGridCols * probeGridRows * 8,
    });
  }
  return levels;
}

/** WebGPU Compute vs 레거시 WebGL2 Fragment Ping-Pong 파이프라인의 정직한 구조 비교를 산출한다. */
export function compareWebGpuVsWebGl2Architecture(config: NormalizedRadianceSceneConfig): WebGpuVsWebGl2ArchitectureComparison {
  assertNormalizedRadianceConfig(config);
  const jfaPassCount = Math.max(1, Math.ceil(Math.log2(Math.max(config.canvasWidth, config.canvasHeight))));
  const mergePasses = config.cascadeLevels - 1;
  const webgpuTotalPasses = 1 + jfaPassCount + config.cascadeLevels + mergePasses + 1;
  const webgl2TotalDraws = 1 + jfaPassCount + config.cascadeLevels * 2 + mergePasses + 2;
  return {
    modelKind: RADIANCE_MODEL_KIND, jfaPassCount, cascadeLevels: config.cascadeLevels,
    webgpu: {
      backendNameKo: "전면 WebGPU Compute + Storage Texture", backendNameEn: "Full WebGPU Compute + Storage Textures",
      totalPassesPerFrame: webgpuTotalPasses, renderPassSwitches: 0, drawCallsPerFrame: 0, pingPongFboCount: 0,
      storageTextureWriteSupport: true, workgroupSharedMemoryBytes: 1024,
      summaryKo: "GPU 실행 전 가정한 Compute 패스·공유 메모리 구조 비교입니다. 현재 GPU 할당·제출·전환 횟수는 실측하지 않습니다.",
      summaryEn: "Planned compute passes/shared memory, without current GPU allocation, submission or measured pass switches.",
    },
    legacyWebgl2: {
      backendNameKo: "레거시 WebGL2 Fragment Ping-Pong FBO", backendNameEn: "Legacy WebGL2 Fragment Ping-Pong FBOs",
      totalPassesPerFrame: webgl2TotalDraws, renderPassSwitches: webgl2TotalDraws, drawCallsPerFrame: webgl2TotalDraws,
      pingPongFboCount: 2 + config.cascadeLevels, storageTextureWriteSupport: false, workgroupSharedMemoryBytes: 0,
      summaryKo: "Compute 셰이더·Storage Texture·공유 메모리가 없어 단계마다 전체 화면 삼각형 드로우콜과 Ping-Pong FBO 바인딩 전환이 누적됩니다.",
      summaryEn: "Lacks compute shaders, storage textures, and shared memory, forcing per-pass fullscreen draw calls and repeated Ping-Pong FBO switches.",
    },
    passReductionCount: webgl2TotalDraws - webgpuTotalPasses, renderPassSwitchReduction: webgl2TotalDraws,
  };
}

/** 20×12 analytic SDF와 휴리스틱 조명 예제다. JFA·캐스케이드 솔버·GPU parity 검증은 실행하지 않는다. */
export function evaluateWebGpuRadianceScene(input?: RadianceSceneInput): WebGpuRadianceSceneEvaluation {
  const config = normalizeRadianceSceneInput(input);
  const scenario = getRadianceLightingScenario(config.scenarioId);
  assertOccluderSet(scenario.occluders);
  const cascades = buildCascadePyramidMetrics(config);
  const architectureComparison = compareWebGpuVsWebGl2Architecture(config);
  const wgslContracts = validateRadianceWgslContracts();
  const keyLin = oklchToLinearChannels(config.activeKeyLightColor);
  const fillLin = oklchToLinearChannels(scenario.fillLightColor);
  const rimLin = oklchToLinearChannels(scenario.rimLightColor);
  const cascadeReachGain = 0.72 + (config.cascadeLevels - MIN_CASCADE_LEVELS) * 0.14;
  const raySmoothGain = 0.85 + ((config.baseRayCount - MIN_BASE_RAY_COUNT) / (MAX_BASE_RAY_COUNT - MIN_BASE_RAY_COUNT)) * 0.25;

  const gridSamples: RadianceGridSample[] = [];
  let occluderCells = 0; let umbraCellCount = 0; let penumbraCellCount = 0; let litCellCount = 0;
  let penumbraRatioSum = 0; let bounceSum = 0; let maxRimLightIntensity = 0; let rimActiveCellCount = 0;

  for (let row = 0; row < CPU_PARITY_GRID_ROWS; row += 1) {
    for (let col = 0; col < CPU_PARITY_GRID_COLS; col += 1) {
      const u = round3((col + 0.5) / CPU_PARITY_GRID_COLS); const v = round3((row + 0.5) / CPU_PARITY_GRID_ROWS);
      const { distance: sdf, nearest } = evaluateSceneSdf2d(u, v, scenario.occluders);
      const insideOccluder = sdf <= 0;
      if (insideOccluder) occluderCells += 1;
      const gx = evaluateSceneSdf2d(u + 0.008, v, scenario.occluders).distance - evaluateSceneSdf2d(u - 0.008, v, scenario.occluders).distance;
      const gy = evaluateSceneSdf2d(u, v + 0.008, scenario.occluders).distance - evaluateSceneSdf2d(u, v - 0.008, scenario.occluders).distance;
      const gLen = Math.max(Math.hypot(gx, gy), 1e-6);
      const nx = gx / gLen; const ny = gy / gLen;
      const sx = insideOccluder ? u + nx * (Math.abs(sdf) + 0.012) : u;
      const sy = insideOccluder ? v + ny * (Math.abs(sdf) + 0.012) : v;
      const keyVisibility = traceSoftShadow2d(sx, sy, config.keyLightX, config.keyLightY, scenario.keyLightRadius, config.penumbraSoftness, scenario.occluders);
      const fillVisibility = traceSoftShadow2d(sx, sy, scenario.fillLightX, scenario.fillLightY, 0.055, Math.min(1, config.penumbraSoftness + 0.12), scenario.occluders);
      if (!insideOccluder) {
        if (keyVisibility <= 0.08) umbraCellCount += 1;
        else if (keyVisibility < 0.92) { penumbraCellCount += 1; penumbraRatioSum += 1 - Math.abs(keyVisibility - 0.5) * 2; }
        else litCellCount += 1;
      }
      const keyDist = Math.max(Math.hypot(config.keyLightX - u, config.keyLightY - v), 0.06);
      const fillDist = Math.max(Math.hypot(scenario.fillLightX - u, scenario.fillLightY - v), 0.08);
      const keyAtt = (scenario.keyLightIntensity * keyVisibility) / (1 + keyDist * keyDist * 3.4);
      const fillAtt = (scenario.fillLightIntensity * fillVisibility) / (1 + fillDist * fillDist * 2.8);
      let bounceR = 0; let bounceG = 0; let bounceB = 0;
      for (const occ of scenario.occluders) {
        const dOcc = Math.max(Math.abs(evaluateOccluderSdf2d(u, v, occ)), 0.04);
        const occLin = oklchToLinearChannels(occ.albedo);
        const w = ((occ.emissiveStrength + 0.14) * config.bounceGiStrength * cascadeReachGain * raySmoothGain) / (1 + dOcc * dOcc * 26);
        bounceR += occLin[0] * w; bounceG += occLin[1] * w; bounceB += occLin[2] * w;
      }
      const bounceEnergy = round3(bounceR * 0.2126 + bounceG * 0.7152 + bounceB * 0.0722);
      bounceSum += bounceEnergy;
      const ndotlRim = Math.max(0, (nx * (config.keyLightX - u) + ny * (config.keyLightY - v)) / keyDist);
      const rimRaw = Math.max(0, 1 - Math.abs(sdf) / 0.085) * ndotlRim * (0.35 + 0.65 * keyVisibility);
      const rimIntensity = rimRaw >= config.rimCutThreshold * 0.45 ? round3(Math.min(1, rimRaw * 1.45)) : 0;
      if (rimIntensity > 0.05) rimActiveCellCount += 1;
      if (rimIntensity > maxRimLightIntensity) maxRimLightIntensity = rimIntensity;

      const occLin = oklchToLinearChannels(nearest.albedo);
      const mixRatio = insideOccluder ? 0.62 : 0.24;
      const bR = scenario.ambientFloor + keyLin[0] * keyAtt + fillLin[0] * fillAtt * 0.55 + bounceR * 0.52;
      const bG = scenario.ambientFloor + keyLin[1] * keyAtt + fillLin[1] * fillAtt * 0.55 + bounceG * 0.52;
      const bB = scenario.ambientFloor + keyLin[2] * keyAtt + fillLin[2] * fillAtt * 0.55 + bounceB * 0.52;
      const fR = bR * (1 - mixRatio) + occLin[0] * bR * mixRatio + rimLin[0] * rimIntensity * 0.68;
      const fG = bG * (1 - mixRatio) + occLin[1] * bG * mixRatio + rimLin[1] * rimIntensity * 0.68;
      const fB = bB * (1 - mixRatio) + occLin[2] * bB * mixRatio + rimLin[2] * rimIntensity * 0.68;
      const luminance = round3(clampNum(fR * 0.2126 + fG * 0.7152 + fB * 0.0722, 0.04, 1, 0.2));
      gridSamples.push({
        col, row, u, v, sdf: round3(sdf), insideOccluder, nearestOccluderKind: nearest.kind, keyVisibility, fillVisibility,
        bounceEnergy, rimIntensity, celBand: Math.min(3, Math.floor(luminance * 4)), displayOklch: formatOklch(linearChannelsToOklch(fR, fG, fB)), luminance,
      });
    }
  }

  const totalSamples = gridSamples.length;
  const outsideCount = Math.max(1, totalSamples - occluderCells);
  const totalCascadeStorageKb = Math.round(cascades.reduce((sum, item) => sum + item.storageTextureBytes, 0) / 1024);
  return {
    sourceKind: "cpu-analytic-lighting-example", gpuSubmitted: false, cpuGpuParityVerified: false, artworkApplied: false, persisted: false,
    schemaVersion: RADIANCE_CASCADES_SCHEMA_VERSION, modelKind: RADIANCE_MODEL_KIND, config, scenario, cascades, gridSamples,
    gridMetrics: {
      gridCols: CPU_PARITY_GRID_COLS, gridRows: CPU_PARITY_GRID_ROWS, totalSamples, jfaPassCount: architectureComparison.jfaPassCount,
      occluderCoveragePct: round3((occluderCells / totalSamples) * 100), umbraCellCount, penumbraCellCount, litCellCount,
      meanPenumbraRatio: round3(penumbraRatioSum / outsideCount), meanBounceGiEnergy: round3(bounceSum / totalSamples),
      maxRimLightIntensity: round3(maxRimLightIntensity), rimActiveCellCount, totalCascadeStorageKb,
    },
    architectureComparison, wgslContracts, uniformByteSize: wgslContracts.uniformByteSize, uniformAligned16: wgslContracts.uniformAligned16,
    honestScopeDisclosure: {
      currentImplementationKo: "현재 구현: 미컴파일 WGSL 소스 3종·96B Uniform 패커·소스 정적 검사·20×12 CPU analytic SDF/휴리스틱 조명 예제입니다. CPU는 JFA·Radiance Cascade 해법을 실행하지 않으며 GPU 출력과 parity도 검증하지 않았습니다.",
      currentImplementationEn: "Current: Three uncompiled WGSL sources, a 96B uniform packer, static source checks and a 20×12 analytic SDF/heuristic lighting example. The CPU does not execute JFA or the radiance cascade solver; GPU output parity is unverified.",
      targetRuntimeKo: "목표 런타임: 실기 WebGPU GPUDevice 컴퓨트 큐와 Storage Texture 체인에 본 3종 WGSL 모듈을 연결해 캔버스 픽셀 단위 실시간 합성을 실행합니다. 실기 프로파일링 전 허위 FPS 수치는 표기하지 않습니다.",
      targetRuntimeEn: "Target runtime: Connects these 3 WGSL modules to a live WebGPU GPUDevice compute queue and storage-texture chain for full-canvas synthesis. No fabricated FPS benchmarks are reported prior to device profiling.",
    },
  };
}

/** 평가 결과와 3종 WGSL 번들을 정형 JSON 매니페스트로 직렬화한다. */
export function exportRadianceCascadesJson(input?: RadianceSceneInput): { readonly evaluation: WebGpuRadianceSceneEvaluation; readonly json: string } {
  const evaluation = evaluateWebGpuRadianceScene(input);
  const payload = {
    sourceKind: evaluation.sourceKind, gpuSubmitted: false, cpuGpuParityVerified: false, artworkApplied: false, persisted: false,
    schemaVersion: evaluation.schemaVersion, modelKind: evaluation.modelKind, config: evaluation.config,
    scenarioId: evaluation.scenario.id, cascades: evaluation.cascades, gridMetrics: evaluation.gridMetrics,
    architectureComparison: evaluation.architectureComparison, wgslContracts: evaluation.wgslContracts,
    uniformByteSize: evaluation.uniformByteSize, uniformAligned16: evaluation.uniformAligned16,
    honestScopeDisclosure: evaluation.honestScopeDisclosure,
    wgslSources: { "jfa-sdf": JFA_SDF_SEED_AND_STEP_WGSL, "cascade-probe": RADIANCE_CASCADE_PROBE_WGSL, "merge-cel": RADIANCE_CASCADE_MERGE_AND_CEL_WGSL },
  };
  return { evaluation, json: JSON.stringify(payload, null, 2) };
}
