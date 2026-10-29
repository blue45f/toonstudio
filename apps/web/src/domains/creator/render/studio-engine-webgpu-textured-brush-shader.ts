/**
 * 텍스처 브러시 런타임(`studio-engine-webgpu-textured-brush-runtime.ts`)의 WGSL 셰이더.
 *
 * R8 표본화 의미는 CPU 오라클과 같다.
 * - 팁 에셋은 1텍셀 0 테두리를 붙여 올리고 바이리니어로 읽는다.
 * - 결 에셋은 바이리니어 반복으로 읽는다.
 * - 절차 결은 부호 있는 정수 칸을 u32 산술로 해시한다.
 * - 직선 scene-linear 색은 CPU 패커가 정확히 한 번 premultiply 한다.
 *
 * 필압 LUT·종이 이빨 단계(@binding(5), `studio-webgpu-pressure-tooth.ts`)는 정점 단계에서 dab 필압을 LUT 로 바꿔
 * 크기(사각형 기저)와 알파(premultiplied 색 전체)에 비율을 곱하고, 조각 단계에서 결 변조를 이빨 문턱으로 바꾼다.
 * 단계가 꺼져 있으면(기본) 비율은 정확히 1.0 이고 결 변조는 기존 식 `mix(1, grain, depth)` 를 그대로 고른다.
 */
import { buildStudioWebGpuPressureToothWgsl } from "./studio-webgpu-pressure-tooth";

/** 필압·이빨 uniform 의 바인딩 번호. 0~4 는 팁·결 텍스처, 샘플러 2개, 뷰포트 uniform 이다. */
export const STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_PRESSURE_TOOTH_BINDING = 5;

export const STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_SHADER = /* wgsl */ `
struct Viewport {
  size: vec2f,
  inverse_size: vec2f,
  document_scale: vec2f,
  document_offset: vec2f,
};
@group(0) @binding(0) var tip_texture: texture_2d<f32>;
@group(0) @binding(1) var grain_texture: texture_2d<f32>;
@group(0) @binding(2) var tip_sampler: sampler;
@group(0) @binding(3) var grain_sampler: sampler;
@group(0) @binding(4) var<uniform> viewport: Viewport;
${buildStudioWebGpuPressureToothWgsl({ group: 0, binding: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_PRESSURE_TOOTH_BINDING })}
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) document: vec2f,
  @location(2) color: vec4f,
  @location(3) dynamics: vec4f,
  @location(4) grain_origin: vec2f,
  @location(5) flags: vec4f,
  @location(6) texture_info: vec4f,
  @location(7) pressure_paper: vec4f,
};

@vertex
fn vs_main(
  @builtin(vertex_index) vertex_index: u32,
  @location(0) center: vec2f,
  @location(1) basis_x: vec2f,
  @location(2) basis_y: vec2f,
  @location(3) color: vec4f,
  @location(4) dynamics: vec4f,
  @location(5) grain_origin: vec2f,
  @location(6) diagnostics: vec4f,
  @location(7) flags: vec4f,
  @location(8) texture_info: vec4f,
) -> VertexOutput {
  let corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f(-1.0,  1.0),
    vec2f(-1.0,  1.0),
    vec2f( 1.0, -1.0),
    vec2f( 1.0,  1.0),
  );
  let local = corners[vertex_index];
  // diagnostics.x is the planned dab pressure. Ratios are exactly 1.0 while the LUT stage is off.
  let response = studio_pressure_response(diagnostics.x, color.a);
  let document_offset = (basis_x * local.x + basis_y * local.y) * response.x;
  let document = center + document_offset;
  let surface = document * viewport.document_scale + viewport.document_offset;
  let clip = vec2f(
    surface.x * viewport.inverse_size.x * 2.0 - 1.0,
    1.0 - surface.y * viewport.inverse_size.y * 2.0,
  );
  var output: VertexOutput;
  output.position = vec4f(clip, 0.0, 1.0);
  output.local = local;
  output.document = document;
  output.color = color * response.y;
  output.dynamics = dynamics;
  output.grain_origin = grain_origin;
  output.flags = flags;
  let durable_r8 = (u32(flags.y + 0.5) & 4u) != 0u;
  let native_grain_uv = texture_info.zw + document_offset / dynamics.z;
  output.texture_info = vec4f(
    texture_info.xy,
    select(texture_info.zw, native_grain_uv, durable_r8),
  );
  output.pressure_paper = vec4f(response.z, response.w, 0.0, 0.0);
  return output;
}

fn hash_u32(input: u32) -> u32 {
  var value = input;
  value = value ^ (value >> 16u);
  value = value * 0x7feb352du;
  value = value ^ (value >> 15u);
  value = value * 0x846ca68bu;
  return value ^ (value >> 16u);
}

fn integer_noise(cell: vec2i, seed: u32) -> f32 {
  let mixed = seed
    ^ (bitcast<u32>(cell.x) * 0x9e3779b1u)
    ^ (bitcast<u32>(cell.y) * 0x85ebca77u);
  return f32(hash_u32(mixed)) / 4294967296.0;
}

fn shaped_grain(value: f32, contrast: f32, invert: bool, durable_r8: bool) -> f32 {
  // The canonical specialist v1 contract retains its historical 3x contrast transfer. Durable
  // Studio R8 assets use the Canvas/SVG contract's 4x transfer and are marked explicitly below.
  let contrast_gain = select(3.0, 4.0, durable_r8);
  let contrasted = clamp(
    0.5 + (value - 0.5) * (1.0 + contrast * contrast_gain),
    0.0,
    1.0,
  );
  return select(contrasted, 1.0 - contrasted, invert);
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  let uv = input.local * 0.5 + 0.5;
  let tip_size = input.texture_info.xy;
  let padded_size = tip_size + vec2f(2.0);
  let padded_uv = (uv * tip_size + vec2f(1.0)) / padded_size;
  let tip_value = textureSample(tip_texture, tip_sampler, padded_uv).r;
  let hardness_edge = max(1.0 / 65535.0, 1.0 - input.dynamics.x);
  let tip_coverage = smoothstep(0.0, hardness_edge, tip_value);

  let grain_kind = u32(input.flags.x + 0.5);
  let packed_grain_flags = u32(input.flags.y + 0.5);
  let grain_space = packed_grain_flags & 1u;
  let seed = u32(input.flags.z + 0.5) | (u32(input.flags.w + 0.5) << 16u);
  let grain_position = select(
    input.document,
    input.document - input.grain_origin,
    grain_space == 1u,
  );
  let grain_invert = (packed_grain_flags & 2u) != 0u;
  let durable_r8 = (packed_grain_flags & 4u) != 0u;
  let grain_cell = vec2i(floor(grain_position / input.dynamics.z));
  let procedural_grain = integer_noise(grain_cell, seed);
  let asset_uv = select(
    grain_position / input.dynamics.z,
    input.texture_info.zw,
    durable_r8,
  );
  let asset_grain = textureSample(
    grain_texture,
    grain_sampler,
    asset_uv,
  ).r;
  var grain_value = select(1.0, procedural_grain, grain_kind == 1u);
  grain_value = select(grain_value, asset_grain, grain_kind == 2u);
  let grain_shaped = shaped_grain(
    grain_value,
    input.dynamics.w,
    grain_invert,
    durable_r8,
  );
  // Paper tooth threshold when enabled; otherwise exactly the legacy mix(1.0, grain_shaped, depth).
  let grain_factor = studio_paper_grain_factor(grain_shaped, input.dynamics.y, input.pressure_paper.y);
  return input.color * (tip_coverage * grain_factor);
}
`;
