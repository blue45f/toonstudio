/**
 * 실시간 2D/2.5D 웹툰 선화 자동 음영 WebGPU 컴퓨트(`@workgroup_size(16, 16)`) 셰이더 그래프.
 *
 * - 선화 거리장(SDF) 및 휘도 기울기 기반 2.5D 표면 높이·법선 필드 추정
 * - 방향성 3D 키 라이트 + 프레넬 림 라이트 + 2~4단계 셀 셰이딩 양자화 + 그림자 하프톤 스크린톤 합성
 * - 64바이트 정렬 유니폼 버퍼 패킹(`packCelLightUniforms`) 및 WebGPU 파이프라인 디스크립터 빌더
 * - WebGPU 미지원 환경에서 WGSL과 동일한 수학 식으로 RGBA8 결과를 산출하는 결정적 CPU 폴백(`runCelLightAutoshaderCpu`)
 */

export const CEL_LIGHT_WORKGROUP_X = 16 as const;
export const CEL_LIGHT_WORKGROUP_Y = 16 as const;
export const CEL_LIGHT_UNIFORM_BYTES = 64 as const;
export const CEL_LIGHT_MIN_BANDS = 2 as const;
export const CEL_LIGHT_MAX_BANDS = 4 as const;

export const CEL_LIGHT_FLAGS = {
  ENABLE_RIM: 1 << 0, ENABLE_HALFTONE: 1 << 1, PRESERVE_LINE_ART: 1 << 2, INVERT_HEIGHT: 1 << 3,
} as const;

export const CEL_LIGHT_GPU_BUFFER_USAGE = {
  MAP_READ: 0x0001, COPY_SRC: 0x0004, COPY_DST: 0x0008, UNIFORM: 0x0040, STORAGE: 0x0080,
} as const;

export type RgbNormalized = readonly [number, number, number];

export interface CelLightAutoshaderConfig {
  readonly width: number; readonly height: number; readonly celBands?: number;
  readonly lightDirection?: readonly [number, number, number]; readonly normalStrength?: number;
  readonly rimIntensity?: number; readonly rimPower?: number; readonly shadowTintStrength?: number;
  readonly halftonePitchPx?: number; readonly halftoneAngleRad?: number; readonly halftoneStrength?: number;
  readonly lineThreshold?: number; readonly shadowTintRgb?: RgbNormalized; readonly rimTintRgb?: RgbNormalized;
  readonly enableRim?: boolean; readonly enableHalftone?: boolean;
  readonly preserveLineArt?: boolean; readonly invertHeight?: boolean;
}

export interface ResolvedCelLightUniforms {
  readonly width: number; readonly height: number; readonly celBands: number; readonly flags: number;
  readonly lightDirX: number; readonly lightDirY: number; readonly lightDirZ: number; readonly normalStrength: number;
  readonly rimIntensity: number; readonly rimPower: number; readonly shadowTintStrength: number;
  readonly halftonePitchPx: number; readonly halftoneAngleRad: number; readonly halftoneStrength: number;
  readonly lineThreshold: number; readonly packedTints: number;
  readonly shadowTintRgb: RgbNormalized; readonly rimTintRgb: RgbNormalized;
}

export interface PackedCelLightUniforms {
  readonly buffer: ArrayBuffer; readonly bytes: Uint8Array;
  readonly u32View: Uint32Array; readonly f32View: Float32Array;
  readonly byteLength: typeof CEL_LIGHT_UNIFORM_BYTES;
  readonly resolved: ResolvedCelLightUniforms;
}

export interface CelLightWorkgroupGrid {
  readonly x: number; readonly y: number; readonly z: 1;
  readonly workgroupSize: readonly [16, 16, 1];
  readonly totalWorkgroups: number; readonly totalInvocations: number;
}

export interface CelLightWgslValidation {
  readonly valid: boolean; readonly entryPoint: string | null;
  readonly workgroupSize: readonly [number, number, number] | null;
  readonly bindings: readonly { readonly group: number; readonly binding: number }[];
  readonly uniformStructName: string | null;
  readonly usesWorkgroupMemory: boolean; readonly usesWorkgroupBarrier: boolean;
  readonly errors: readonly string[];
}

export interface CelLightCpuResult {
  readonly backend: "cpu-fallback"; readonly width: number; readonly height: number;
  readonly rgba: Uint8ClampedArray; readonly uniforms: PackedCelLightUniforms;
  readonly celBandCounts: readonly number[]; readonly rimLitPixelCount: number;
  readonly halftoneShadowPixelCount: number; readonly inkPreservedPixelCount: number;
  readonly averageNormalZ: number;
}

export interface CelLightGpuBufferLike { readonly size: number; readonly usage: number; destroy(): void; }
export interface CelLightGpuShaderModuleLike { readonly label?: string; }
export interface CelLightGpuBindGroupLayoutLike { readonly label?: string; }
export interface CelLightGpuPipelineLike { readonly label?: string; getBindGroupLayout(index: number): CelLightGpuBindGroupLayoutLike; }
export interface CelLightGpuBindGroupLike { readonly label?: string; }
export interface CelLightGpuCommandBufferLike { readonly label?: string; }
export interface CelLightGpuPassEncoderLike {
  setPipeline(pipeline: CelLightGpuPipelineLike): void;
  setBindGroup(index: number, bindGroup: CelLightGpuBindGroupLike): void;
  dispatchWorkgroups(x: number, y?: number, z?: number): void;
  end(): void;
}
export interface CelLightGpuCommandEncoderLike {
  beginComputePass(descriptor?: { readonly label?: string }): CelLightGpuPassEncoderLike;
  finish(descriptor?: { readonly label?: string }): CelLightGpuCommandBufferLike;
}
export interface CelLightPipelineDescriptor {
  readonly label: string;
  readonly layout: "auto";
  readonly compute: { readonly module: CelLightGpuShaderModuleLike; readonly entryPoint: "main" };
}
export interface CelLightGpuDeviceLike {
  readonly queue: {
    writeBuffer(buffer: CelLightGpuBufferLike, bufferOffset: number, data: ArrayBufferLike | ArrayBufferView): void;
    submit(commandBuffers: readonly CelLightGpuCommandBufferLike[]): void;
  };
  createShaderModule(descriptor: { readonly code: string; readonly label?: string }): CelLightGpuShaderModuleLike;
  createBuffer(descriptor: { readonly size: number; readonly usage: number; readonly label?: string }): CelLightGpuBufferLike;
  createComputePipelineAsync?: (descriptor: CelLightPipelineDescriptor) => Promise<CelLightGpuPipelineLike>;
  createComputePipeline?: (descriptor: CelLightPipelineDescriptor) => CelLightGpuPipelineLike;
  createBindGroup(descriptor: {
    readonly label?: string;
    readonly layout: CelLightGpuBindGroupLayoutLike;
    readonly entries: readonly {
      readonly binding: number;
      readonly resource: { readonly buffer: CelLightGpuBufferLike; readonly offset?: number; readonly size?: number };
    }[];
  }): CelLightGpuBindGroupLike;
  createCommandEncoder(descriptor?: { readonly label?: string }): CelLightGpuCommandEncoderLike;
}

export interface CelLightDispatchInput {
  readonly device?: CelLightGpuDeviceLike | null;
  readonly basePixels: Uint8ClampedArray | Uint8Array;
  readonly linePixels?: Uint8ClampedArray | Uint8Array;
  readonly config: CelLightAutoshaderConfig;
  readonly label?: string;
}

export interface CelLightDispatchResult {
  readonly backend: "webgpu-compute" | "cpu-fallback";
  readonly workgroups: CelLightWorkgroupGrid;
  readonly uniforms: PackedCelLightUniforms;
  readonly gpuOutputBuffer: CelLightGpuBufferLike | null;
  readonly cpuResult: CelLightCpuResult | null;
  readonly fallbackReasonKo: string | null;
}

export const WGSL_CEL_LIGHT_AUTOSHADER: string = /* wgsl */ `
struct CelLightUniforms {
  width: u32, height: u32, cel_bands: u32, flags: u32,
  light_dir_x: f32, light_dir_y: f32, light_dir_z: f32, normal_strength: f32,
  rim_intensity: f32, rim_power: f32, shadow_tint_strength: f32, halftone_pitch_px: f32,
  halftone_angle_rad: f32, halftone_strength: f32, line_threshold: f32, packed_tints: u32,
}
@group(0) @binding(0) var<uniform> params: CelLightUniforms;
@group(0) @binding(1) var<storage, read> src_base_pixels: array<u32>;
@group(0) @binding(2) var<storage, read> src_line_pixels: array<u32>;
@group(0) @binding(3) var<storage, read_write> dst_pixels: array<u32>;
var<workgroup> wg_basis: array<f32, 4>;

fn unpack_rgba8(p: u32) -> vec4<f32> {
  return vec4<f32>(f32(p & 0xffu), f32((p >> 8u) & 0xffu), f32((p >> 16u) & 0xffu), f32((p >> 24u) & 0xffu)) / 255.0;
}
fn pack_rgba8(c: vec4<f32>) -> u32 {
  let s = clamp(c, vec4<f32>(0.0), vec4<f32>(1.0)) * 255.0;
  return u32(round(s.r)) | (u32(round(s.g)) << 8u) | (u32(round(s.b)) << 16u) | (u32(round(s.a)) << 24u);
}
fn unpack_rgb565(packed16: u32) -> vec3<f32> {
  return vec3<f32>(f32(packed16 & 31u) / 31.0, f32((packed16 >> 5u) & 63u) / 63.0, f32((packed16 >> 11u) & 31u) / 31.0);
}
fn sample_clamped_idx(x: i32, y: i32) -> u32 {
  let cx = u32(clamp(x, 0, i32(params.width) - 1));
  let cy = u32(clamp(y, 0, i32(params.height) - 1));
  return cy * params.width + cx;
}
fn ink_strength_at(x: i32, y: i32) -> f32 {
  let line_px = unpack_rgba8(src_line_pixels[sample_clamped_idx(x, y)]);
  let luma = dot(line_px.rgb, vec3<f32>(0.299, 0.587, 0.114));
  let thr = max(params.line_threshold, 0.01);
  return clamp((thr - luma) / thr, 0.0, 1.0) * line_px.a;
}
fn surface_height_at(x: i32, y: i32) -> f32 {
  let base_px = unpack_rgba8(src_base_pixels[sample_clamped_idx(x, y)]);
  if (base_px.a <= 0.02) { return 0.0; }
  var min_dist: f32 = 3.0;
  for (var oy: i32 = -2; oy <= 2; oy = oy + 1) {
    for (var ox: i32 = -2; ox <= 2; ox = ox + 1) {
      let sx = x + ox; let sy = y + oy;
      let s_base = unpack_rgba8(src_base_pixels[sample_clamped_idx(sx, sy)]);
      let edge_strength = max(ink_strength_at(sx, sy), 1.0 - s_base.a);
      if (edge_strength >= 0.45) { min_dist = min(min_dist, sqrt(f32(ox * ox + oy * oy))); }
    }
  }
  let sdf_dome = sqrt(clamp(min_dist / 3.0, 0.0, 1.0));
  let base_luma = dot(base_px.rgb, vec3<f32>(0.299, 0.587, 0.114));
  var h = (0.75 * sdf_dome + 0.25 * base_luma) * base_px.a;
  if ((params.flags & 8u) != 0u) { h = (1.0 - h) * base_px.a; }
  return h;
}
fn estimate_normal_at(x: i32, y: i32) -> vec3<f32> {
  let htl = surface_height_at(x - 1, y - 1); let htc = surface_height_at(x, y - 1); let htr = surface_height_at(x + 1, y - 1);
  let hml = surface_height_at(x - 1, y); let hmr = surface_height_at(x + 1, y);
  let hbl = surface_height_at(x - 1, y + 1); let hbc = surface_height_at(x, y + 1); let hbr = surface_height_at(x + 1, y + 1);
  let gx = (-htl + htr - 2.0 * hml + 2.0 * hmr - hbl + hbr) * 0.25;
  let gy = (-htl - 2.0 * htc - htr + hbl + 2.0 * hbc + hbr) * 0.25;
  let raw_n = vec3<f32>(-gx * params.normal_strength, -gy * params.normal_strength, 1.0);
  return raw_n / max(length(raw_n), 1e-5);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>, @builtin(local_invocation_index) lidx: u32) {
  if (lidx == 0u) {
    wg_basis[0] = cos(params.halftone_angle_rad);
    wg_basis[1] = sin(params.halftone_angle_rad);
    wg_basis[2] = 1.0 / max(params.halftone_pitch_px, 2.0);
    wg_basis[3] = f32(clamp(params.cel_bands, 2u, 4u));
  }
  workgroupBarrier();
  if (params.width == 0u || params.height == 0u || gid.x >= params.width || gid.y >= params.height) { return; }

  let idx = gid.y * params.width + gid.x;
  let base_px = unpack_rgba8(src_base_pixels[idx]);
  let line_px = unpack_rgba8(src_line_pixels[idx]);
  let out_a = max(base_px.a, line_px.a);
  if (out_a <= 0.002) { dst_pixels[idx] = 0u; return; }

  let ix = i32(gid.x); let iy = i32(gid.y);
  let normal = estimate_normal_at(ix, iy);
  let light_dir = vec3<f32>(params.light_dir_x, params.light_dir_y, params.light_dir_z);
  let diffuse = clamp(dot(normal, light_dir) * 0.5 + 0.5, 0.0, 1.0);
  let bands = wg_basis[3];
  let cel_level = floor(clamp(diffuse, 0.0, 0.9999) * bands) / max(bands - 1.0, 1.0);

  let shadow_tint = unpack_rgb565(params.packed_tints & 0xffffu);
  let rim_tint = unpack_rgb565((params.packed_tints >> 16u) & 0xffffu);
  let shadow_factor = (1.0 - cel_level) * clamp(params.shadow_tint_strength, 0.0, 1.0);
  var shaded_rgb = mix(base_px.rgb, base_px.rgb * shadow_tint, shadow_factor);

  if ((params.flags & 1u) != 0u && params.rim_intensity > 0.0) {
    let fresnel = pow(max(1.0 - clamp(normal.z, 0.0, 1.0), 1e-6), max(params.rim_power, 0.5));
    let rim_mask = clamp(fresnel * smoothstep(0.15, 0.85, diffuse) * params.rim_intensity, 0.0, 1.0);
    shaded_rgb = clamp(shaded_rgb + rim_tint * rim_mask, vec3<f32>(0.0), vec3<f32>(1.0));
  }
  if ((params.flags & 2u) != 0u && params.halftone_strength > 0.0 && cel_level < 0.999) {
    let shadow_density = clamp((1.0 - cel_level) * params.halftone_strength, 0.0, 1.0);
    let px = f32(gid.x) + 0.5; let py = f32(gid.y) + 0.5;
    let u = (px * wg_basis[0] - py * wg_basis[1]) * wg_basis[2];
    let v = (px * wg_basis[1] + py * wg_basis[0]) * wg_basis[2];
    let dot_radius = sqrt(shadow_density) * 0.48;
    let dot_cov = 1.0 - smoothstep(dot_radius - 0.06, dot_radius + 0.06, length(vec2<f32>(fract(u) - 0.5, fract(v) - 0.5)));
    shaded_rgb = mix(shaded_rgb, shaded_rgb * shadow_tint * 0.55, clamp(dot_cov * shadow_density, 0.0, 1.0));
  }
  if ((params.flags & 4u) != 0u) {
    shaded_rgb = mix(shaded_rgb, line_px.rgb, ink_strength_at(ix, iy));
  }
  dst_pixels[idx] = pack_rgba8(vec4<f32>(shaded_rgb, out_a));
}`;

const DEFAULT_LIGHT_DIR: readonly [number, number, number] = [-0.55, -0.45, 0.7];
const DEFAULT_SHADOW_TINT: RgbNormalized = [0.42, 0.46, 0.68];
const DEFAULT_RIM_TINT: RgbNormalized = [1.0, 0.96, 0.86];

function clampNum(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clampNum((x - edge0) / Math.max(edge1 - edge0, 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

function fract(x: number): number {
  return x - Math.floor(x);
}

export function packRgb565(rgb: RgbNormalized): number {
  const r5 = Math.round(clampNum(rgb[0], 0, 1) * 31) & 31;
  const g6 = Math.round(clampNum(rgb[1], 0, 1) * 63) & 63;
  const b5 = Math.round(clampNum(rgb[2], 0, 1) * 31) & 31;
  return (r5 | (g6 << 5) | (b5 << 11)) >>> 0;
}

export function unpackRgb565(packed16: number): RgbNormalized {
  return [(packed16 & 31) / 31, ((packed16 >>> 5) & 63) / 63, ((packed16 >>> 11) & 31) / 31];
}

/** 64바이트 정렬 `CelLightUniforms` 바이너리 유니폼 버퍼를 패킹한다. */
export function packCelLightUniforms(config: CelLightAutoshaderConfig): PackedCelLightUniforms {
  const width = Math.max(0, Math.floor(config.width));
  const height = Math.max(0, Math.floor(config.height));
  const celBands = Math.round(clampNum(config.celBands ?? 3, CEL_LIGHT_MIN_BANDS, CEL_LIGHT_MAX_BANDS));

  let flags = 0;
  if (config.enableRim ?? true) flags |= CEL_LIGHT_FLAGS.ENABLE_RIM;
  if (config.enableHalftone ?? true) flags |= CEL_LIGHT_FLAGS.ENABLE_HALFTONE;
  if (config.preserveLineArt ?? true) flags |= CEL_LIGHT_FLAGS.PRESERVE_LINE_ART;
  if (config.invertHeight ?? false) flags |= CEL_LIGHT_FLAGS.INVERT_HEIGHT;

  const rawDir = config.lightDirection ?? DEFAULT_LIGHT_DIR;
  const dirLen = Math.hypot(rawDir[0], rawDir[1], rawDir[2]);
  const invLen = dirLen > 1e-6 ? 1 / dirLen : 1;
  const lightDirX = Math.fround(dirLen > 1e-6 ? rawDir[0] * invLen : 0);
  const lightDirY = Math.fround(dirLen > 1e-6 ? rawDir[1] * invLen : 0);
  const lightDirZ = Math.fround(dirLen > 1e-6 ? rawDir[2] * invLen : 1);

  const normalStrength = Math.fround(clampNum(config.normalStrength ?? 2.6, 0.1, 16.0));
  const rimIntensity = Math.fround(clampNum(config.rimIntensity ?? 0.55, 0.0, 1.0));
  const rimPower = Math.fround(clampNum(config.rimPower ?? 2.4, 0.5, 12.0));
  const shadowTintStrength = Math.fround(clampNum(config.shadowTintStrength ?? 0.85, 0.0, 1.0));
  const halftonePitchPx = Math.fround(clampNum(config.halftonePitchPx ?? 6.0, 2.0, 64.0));
  const halftoneAngleRad = Math.fround(
    typeof config.halftoneAngleRad === "number" && Number.isFinite(config.halftoneAngleRad)
      ? config.halftoneAngleRad
      : Math.PI / 4,
  );
  const halftoneStrength = Math.fround(clampNum(config.halftoneStrength ?? 0.55, 0.0, 1.0));
  const lineThreshold = Math.fround(clampNum(config.lineThreshold ?? 0.28, 0.01, 0.95));

  const shadow565 = packRgb565(config.shadowTintRgb ?? DEFAULT_SHADOW_TINT);
  const rim565 = packRgb565(config.rimTintRgb ?? DEFAULT_RIM_TINT);
  const packedTints = ((rim565 << 16) | shadow565) >>> 0;

  const buffer = new ArrayBuffer(CEL_LIGHT_UNIFORM_BYTES);
  const view = new DataView(buffer);
  view.setUint32(0, width, true);
  view.setUint32(4, height, true);
  view.setUint32(8, celBands, true);
  view.setUint32(12, flags >>> 0, true);
  view.setFloat32(16, lightDirX, true);
  view.setFloat32(20, lightDirY, true);
  view.setFloat32(24, lightDirZ, true);
  view.setFloat32(28, normalStrength, true);
  view.setFloat32(32, rimIntensity, true);
  view.setFloat32(36, rimPower, true);
  view.setFloat32(40, shadowTintStrength, true);
  view.setFloat32(44, halftonePitchPx, true);
  view.setFloat32(48, halftoneAngleRad, true);
  view.setFloat32(52, halftoneStrength, true);
  view.setFloat32(56, lineThreshold, true);
  view.setUint32(60, packedTints, true);

  return {
    buffer,
    bytes: new Uint8Array(buffer),
    u32View: new Uint32Array(buffer),
    f32View: new Float32Array(buffer),
    byteLength: CEL_LIGHT_UNIFORM_BYTES,
    resolved: {
      width, height, celBands, flags: flags >>> 0,
      lightDirX, lightDirY, lightDirZ, normalStrength,
      rimIntensity, rimPower, shadowTintStrength, halftonePitchPx,
      halftoneAngleRad, halftoneStrength, lineThreshold, packedTints,
      shadowTintRgb: unpackRgb565(shadow565),
      rimTintRgb: unpackRgb565(rim565),
    },
  };
}

export function computeCelLightWorkgroups(width: number, height: number): CelLightWorkgroupGrid {
  const safeW = Math.max(0, Math.floor(width));
  const safeH = Math.max(0, Math.floor(height));
  const x = safeW === 0 ? 0 : Math.ceil(safeW / CEL_LIGHT_WORKGROUP_X);
  const y = safeH === 0 ? 0 : Math.ceil(safeH / CEL_LIGHT_WORKGROUP_Y);
  const totalWorkgroups = x * y;
  return {
    x, y, z: 1,
    workgroupSize: [CEL_LIGHT_WORKGROUP_X, CEL_LIGHT_WORKGROUP_Y, 1],
    totalWorkgroups,
    totalInvocations: totalWorkgroups * CEL_LIGHT_WORKGROUP_X * CEL_LIGHT_WORKGROUP_Y,
  };
}

export function createCelLightPipelineDescriptor(
  shaderModule: CelLightGpuShaderModuleLike,
  label: string = "toonstudio-cel-light-autoshader-pipeline",
): CelLightPipelineDescriptor {
  return { label, layout: "auto", compute: { module: shaderModule, entryPoint: "main" } };
}

/** WGSL 컴퓨트 셰이더의 구조·바인딩·워크그룹 크기·괄호 균형을 정적 검증한다. */
export function validateCelLightWgslShader(source: string = WGSL_CEL_LIGHT_AUTOSHADER): CelLightWgslValidation {
  const errors: string[] = [];
  const structMatch = /struct\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/.exec(source);
  const uniformStructName = structMatch ? structMatch[1] : null;
  if (!uniformStructName) errors.push("uniform struct 선언이 없습니다.");

  const wgMatch = /@compute\s+@workgroup_size\(\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(\d+))?\s*\)/.exec(source);
  const workgroupSize: readonly [number, number, number] | null = wgMatch
    ? [Number(wgMatch[1]), Number(wgMatch[2]), wgMatch[3] ? Number(wgMatch[3]) : 1]
    : null;
  if (!workgroupSize) {
    errors.push("@compute @workgroup_size(x, y) 선언이 없습니다.");
  } else if (workgroupSize[0] !== CEL_LIGHT_WORKGROUP_X || workgroupSize[1] !== CEL_LIGHT_WORKGROUP_Y) {
    errors.push(`워크그룹 크기가 (16, 16)이 아닙니다: (${workgroupSize[0]}, ${workgroupSize[1]})`);
  }

  const entryMatch = /@compute[\s\S]*?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(source);
  const entryPoint = entryMatch ? entryMatch[1] : null;
  if (!entryPoint) errors.push("@compute 엔트리 포인트 함수가 없습니다.");

  const bindings: { readonly group: number; readonly binding: number }[] = [];
  const bindingRegex = /@group\((\d+)\)\s*@binding\((\d+)\)/g;
  let m: RegExpExecArray | null = bindingRegex.exec(source);
  while (m !== null) {
    bindings.push({ group: Number(m[1]), binding: Number(m[2]) });
    m = bindingRegex.exec(source);
  }
  if (bindings.length < 4) errors.push(`필수 바인딩 4개 미만(${bindings.length}개).`);

  let braceDepth = 0;
  let parenDepth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth -= 1;
    else if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    if (braceDepth < 0 || parenDepth < 0) {
      errors.push("괄호 중첩 음수 불균형이 감지되었습니다.");
      break;
    }
  }
  if (braceDepth !== 0) errors.push(`중괄호 불균형(depth=${braceDepth}).`);
  if (parenDepth !== 0) errors.push(`소괄호 불균형(depth=${parenDepth}).`);

  const usesWorkgroupMemory = /var<workgroup>/.test(source);
  const usesWorkgroupBarrier = /workgroupBarrier\s*\(\s*\)/.test(source);
  if (usesWorkgroupMemory && !usesWorkgroupBarrier) {
    errors.push("workgroup 공유 메모리 사용 시 workgroupBarrier()가 필요합니다.");
  }

  return {
    valid: errors.length === 0, entryPoint, workgroupSize, bindings,
    uniformStructName, usesWorkgroupMemory, usesWorkgroupBarrier, errors,
  };
}

/** WebGPU 미지원 환경용 결정적 CPU 셀·림·하프톤 오토셰이더 커널(WGSL 수식 1:1 동치). */
export function runCelLightAutoshaderCpu(
  basePixels: Uint8ClampedArray | Uint8Array,
  config: CelLightAutoshaderConfig,
  linePixels?: Uint8ClampedArray | Uint8Array,
): CelLightCpuResult {
  const uniforms = packCelLightUniforms(config);
  const p = uniforms.resolved;
  const pixelCount = p.width * p.height;
  const expectedBytes = pixelCount * 4;
  if (basePixels.length !== expectedBytes) {
    throw new RangeError(`basePixels 길이 불일치: 기대 ${expectedBytes}B, 실제 ${basePixels.length}B`);
  }
  const lineSrc = linePixels ?? basePixels;
  if (lineSrc.length !== expectedBytes) {
    throw new RangeError(`linePixels 길이 불일치: 기대 ${expectedBytes}B, 실제 ${lineSrc.length}B`);
  }

  const out = new Uint8ClampedArray(expectedBytes);
  const celBandCounts = new Array<number>(p.celBands).fill(0);
  if (pixelCount === 0) {
    return {
      backend: "cpu-fallback", width: p.width, height: p.height, rgba: out, uniforms,
      celBandCounts, rimLitPixelCount: 0, halftoneShadowPixelCount: 0, inkPreservedPixelCount: 0, averageNormalZ: 1,
    };
  }

  const w = p.width;
  const h = p.height;
  const inv255 = 1 / 255;
  const thr = Math.max(p.lineThreshold, 0.01);

  const inkField = new Float32Array(pixelCount);
  const baseAlphaField = new Float32Array(pixelCount);
  const baseLumaField = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const off = i * 4;
    const ba = basePixels[off + 3] * inv255;
    baseAlphaField[i] = ba;
    baseLumaField[i] = (basePixels[off] * 0.299 + basePixels[off + 1] * 0.587 + basePixels[off + 2] * 0.114) * inv255;
    const la = lineSrc[off + 3] * inv255;
    const lineLuma = (lineSrc[off] * 0.299 + lineSrc[off + 1] * 0.587 + lineSrc[off + 2] * 0.114) * inv255;
    inkField[i] = clampNum((thr - lineLuma) / thr, 0, 1) * la;
  }

  const heightField = new Float32Array(pixelCount);
  const invertHeight = (p.flags & CEL_LIGHT_FLAGS.INVERT_HEIGHT) !== 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = y * w + x;
      const ba = baseAlphaField[idx];
      if (ba <= 0.02) continue;
      let minDist = 3.0;
      for (let oy = -2; oy <= 2; oy += 1) {
        const sy = y + oy < 0 ? 0 : y + oy >= h ? h - 1 : y + oy;
        const rowOff = sy * w;
        for (let ox = -2; ox <= 2; ox += 1) {
          const sx = x + ox < 0 ? 0 : x + ox >= w ? w - 1 : x + ox;
          const sIdx = rowOff + sx;
          if (Math.max(inkField[sIdx], 1 - baseAlphaField[sIdx]) >= 0.45) {
            const d = Math.hypot(ox, oy);
            if (d < minDist) minDist = d;
          }
        }
      }
      let surfH = (0.75 * Math.sqrt(clampNum(minDist / 3.0, 0, 1)) + 0.25 * baseLumaField[idx]) * ba;
      if (invertHeight) surfH = (1 - surfH) * ba;
      heightField[idx] = surfH;
    }
  }

  const sampleH = (x: number, y: number): number =>
    heightField[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + (x < 0 ? 0 : x >= w ? w - 1 : x)];

  const cosA = Math.cos(p.halftoneAngleRad);
  const sinA = Math.sin(p.halftoneAngleRad);
  const invPitch = 1 / Math.max(p.halftonePitchPx, 2.0);
  const enableRim = (p.flags & CEL_LIGHT_FLAGS.ENABLE_RIM) !== 0 && p.rimIntensity > 0;
  const enableHalftone = (p.flags & CEL_LIGHT_FLAGS.ENABLE_HALFTONE) !== 0 && p.halftoneStrength > 0;
  const preserveLineArt = (p.flags & CEL_LIGHT_FLAGS.PRESERVE_LINE_ART) !== 0;
  const [stR, stG, stB] = p.shadowTintRgb;
  const [rmR, rmG, rmB] = p.rimTintRgb;

  let rimLitPixelCount = 0;
  let halftoneShadowPixelCount = 0;
  let inkPreservedPixelCount = 0;
  let normalZSum = 0;
  let opaqueCount = 0;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = y * w + x;
      const off = idx * 4;
      const outA = Math.max(baseAlphaField[idx], lineSrc[off + 3] * inv255);
      if (outA <= 0.002) continue;

      const htl = sampleH(x - 1, y - 1); const htc = sampleH(x, y - 1); const htr = sampleH(x + 1, y - 1);
      const hml = sampleH(x - 1, y); const hmr = sampleH(x + 1, y);
      const hbl = sampleH(x - 1, y + 1); const hbc = sampleH(x, y + 1); const hbr = sampleH(x + 1, y + 1);

      const gx = (-htl + htr - 2 * hml + 2 * hmr - hbl + hbr) * 0.25;
      const gy = (-htl - 2 * htc - htr + hbl + 2 * hbc + hbr) * 0.25;
      const rawNx = -gx * p.normalStrength;
      const rawNy = -gy * p.normalStrength;
      const rawLen = Math.max(Math.hypot(rawNx, rawNy, 1.0), 1e-5);
      const nx = rawNx / rawLen;
      const ny = rawNy / rawLen;
      const nz = 1.0 / rawLen;
      normalZSum += nz;
      opaqueCount += 1;

      const diffuse = clampNum((nx * p.lightDirX + ny * p.lightDirY + nz * p.lightDirZ) * 0.5 + 0.5, 0, 1);
      const stepIdx = Math.floor(clampNum(diffuse, 0, 0.9999) * p.celBands);
      celBandCounts[stepIdx] += 1;
      const celLevel = stepIdx / Math.max(p.celBands - 1, 1);

      const br = basePixels[off] * inv255;
      const bg = basePixels[off + 1] * inv255;
      const bb = basePixels[off + 2] * inv255;
      const shadowFactor = (1 - celLevel) * clampNum(p.shadowTintStrength, 0, 1);
      let r = br * (1 - shadowFactor) + br * stR * shadowFactor;
      let g = bg * (1 - shadowFactor) + bg * stG * shadowFactor;
      let b = bb * (1 - shadowFactor) + bb * stB * shadowFactor;

      if (enableRim) {
        const fresnel = Math.pow(Math.max(1 - clampNum(nz, 0, 1), 1e-6), Math.max(p.rimPower, 0.5));
        const rimMask = clampNum(fresnel * smoothstep(0.15, 0.85, diffuse) * p.rimIntensity, 0, 1);
        if (rimMask > 0.02) rimLitPixelCount += 1;
        r = clampNum(r + rmR * rimMask, 0, 1);
        g = clampNum(g + rmG * rimMask, 0, 1);
        b = clampNum(b + rmB * rimMask, 0, 1);
      }

      if (enableHalftone && celLevel < 0.999) {
        const shadowDensity = clampNum((1 - celLevel) * p.halftoneStrength, 0, 1);
        const px = x + 0.5;
        const py = y + 0.5;
        const u = (px * cosA - py * sinA) * invPitch;
        const v = (px * sinA + py * cosA) * invPitch;
        const dotRadius = Math.sqrt(shadowDensity) * 0.48;
        const dotCov = 1 - smoothstep(dotRadius - 0.06, dotRadius + 0.06, Math.hypot(fract(u) - 0.5, fract(v) - 0.5));
        const halftoneMix = clampNum(dotCov * shadowDensity, 0, 1);
        if (halftoneMix > 0.05) halftoneShadowPixelCount += 1;
        r = r * (1 - halftoneMix) + r * stR * 0.55 * halftoneMix;
        g = g * (1 - halftoneMix) + g * stG * 0.55 * halftoneMix;
        b = b * (1 - halftoneMix) + b * stB * 0.55 * halftoneMix;
      }

      if (preserveLineArt) {
        const ink = inkField[idx];
        if (ink > 0.2) inkPreservedPixelCount += 1;
        r = r * (1 - ink) + lineSrc[off] * inv255 * ink;
        g = g * (1 - ink) + lineSrc[off + 1] * inv255 * ink;
        b = b * (1 - ink) + lineSrc[off + 2] * inv255 * ink;
      }

      out[off] = Math.round(clampNum(r, 0, 1) * 255);
      out[off + 1] = Math.round(clampNum(g, 0, 1) * 255);
      out[off + 2] = Math.round(clampNum(b, 0, 1) * 255);
      out[off + 3] = Math.round(clampNum(outA, 0, 1) * 255);
    }
  }

  return {
    backend: "cpu-fallback", width: w, height: h, rgba: out, uniforms,
    celBandCounts, rimLitPixelCount, halftoneShadowPixelCount, inkPreservedPixelCount,
    averageNormalZ: opaqueCount > 0 ? normalZSum / opaqueCount : 1,
  };
}

/** WebGPU 디바이스가 있으면 컴퓨트 패스를 디스패치하고, 없으면 CPU 결정적 폴백으로 전환한다. */
export async function dispatchCelLightAutoshader(input: CelLightDispatchInput): Promise<CelLightDispatchResult> {
  const uniforms = packCelLightUniforms(input.config);
  const workgroups = computeCelLightWorkgroups(uniforms.resolved.width, uniforms.resolved.height);
  const device = input.device ?? null;

  if (!device) {
    return {
      backend: "cpu-fallback", workgroups, uniforms, gpuOutputBuffer: null,
      cpuResult: runCelLightAutoshaderCpu(input.basePixels, input.config, input.linePixels),
      fallbackReasonKo: "WebGPU 디바이스가 없어 결정적 CPU 셀·림·하프톤 폴백 커널로 실행했습니다.",
    };
  }

  const label = input.label ?? "toonstudio-cel-light-autoshader";
  const byteSize = Math.max(4, input.basePixels.byteLength);
  const lineSrc = input.linePixels ?? input.basePixels;
  const uniformBuf = device.createBuffer({
    size: CEL_LIGHT_UNIFORM_BYTES, usage: CEL_LIGHT_GPU_BUFFER_USAGE.UNIFORM | CEL_LIGHT_GPU_BUFFER_USAGE.COPY_DST, label: `${label}-uniforms`,
  });
  const baseBuf = device.createBuffer({
    size: byteSize, usage: CEL_LIGHT_GPU_BUFFER_USAGE.STORAGE | CEL_LIGHT_GPU_BUFFER_USAGE.COPY_DST, label: `${label}-base`,
  });
  const lineBuf = device.createBuffer({
    size: byteSize, usage: CEL_LIGHT_GPU_BUFFER_USAGE.STORAGE | CEL_LIGHT_GPU_BUFFER_USAGE.COPY_DST, label: `${label}-line`,
  });
  const dstBuf = device.createBuffer({
    size: byteSize, usage: CEL_LIGHT_GPU_BUFFER_USAGE.STORAGE | CEL_LIGHT_GPU_BUFFER_USAGE.COPY_SRC, label: `${label}-dst`,
  });

  device.queue.writeBuffer(uniformBuf, 0, uniforms.bytes);
  device.queue.writeBuffer(baseBuf, 0, input.basePixels);
  device.queue.writeBuffer(lineBuf, 0, lineSrc);

  const shaderModule = device.createShaderModule({ code: WGSL_CEL_LIGHT_AUTOSHADER, label: `${label}-wgsl` });
  const pipelineDesc = createCelLightPipelineDescriptor(shaderModule, `${label}-pipeline`);
  const pipeline = device.createComputePipelineAsync
    ? await device.createComputePipelineAsync(pipelineDesc)
    : device.createComputePipeline ? device.createComputePipeline(pipelineDesc) : null;

  if (!pipeline) {
    uniformBuf.destroy(); baseBuf.destroy(); lineBuf.destroy(); dstBuf.destroy();
    return {
      backend: "cpu-fallback", workgroups, uniforms, gpuOutputBuffer: null,
      cpuResult: runCelLightAutoshaderCpu(input.basePixels, input.config, input.linePixels),
      fallbackReasonKo: "GPUDevice에 컴퓨트 파이프라인 생성 API가 없어 CPU 폴백으로 전환했습니다.",
    };
  }

  const bindGroup = device.createBindGroup({
    label: `${label}-bind-group`,
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuf, offset: 0, size: CEL_LIGHT_UNIFORM_BYTES } },
      { binding: 1, resource: { buffer: baseBuf, offset: 0, size: byteSize } },
      { binding: 2, resource: { buffer: lineBuf, offset: 0, size: byteSize } },
      { binding: 3, resource: { buffer: dstBuf, offset: 0, size: byteSize } },
    ],
  });

  const encoder = device.createCommandEncoder({ label: `${label}-encoder` });
  const pass = encoder.beginComputePass({ label: `${label}-pass` });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  if (workgroups.x > 0 && workgroups.y > 0) pass.dispatchWorkgroups(workgroups.x, workgroups.y, workgroups.z);
  pass.end();
  device.queue.submit([encoder.finish({ label: `${label}-cmd` })]);

  uniformBuf.destroy(); baseBuf.destroy(); lineBuf.destroy();
  return { backend: "webgpu-compute", workgroups, uniforms, gpuOutputBuffer: dstBuf, cpuResult: null, fallbackReasonKo: null };
}
