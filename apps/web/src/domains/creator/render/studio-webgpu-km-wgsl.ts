/**
 * WebGPU 38밴드 Kubelka-Munk 안료 혼색 + 듀얼 엔벨로프 서브픽셀 SDF AA 셰이더 모듈.
 *
 * `@toonstudio/studio-brush-platform`의 단일 정본 38밴드 테이블(`SPECTRAL_38BAND_KM_WGSL_SNIPPET`)을
 * 재사용해 CPU(`studio-wet-mix.ts`, `apps/brush-lab`)와 GPU(WebGPU)가 동일한 분광 혼색 수식을 실행한다.
 */

import { SPECTRAL_38BAND_KM_WGSL_SNIPPET } from "@toonstudio/studio-brush-platform/spectral-km-wgsl";

export { SPECTRAL_38BAND_KM_WGSL_SNIPPET };

/**
 * 4×4 서브픽셀 듀얼 엔벨로프(Inner Core + Outer Soft Band) 분석 AA WebGPU 브러시 셰이더.
 * 기존 단일 `fwidth` smoothstep 대비 대각선 펜선·칼끝 테이퍼 계단 현상을 억제하고 per-dab `rgbTint`를 보존한다.
 */
export const STUDIO_GPU_DUAL_ENVELOPE_AA_BRUSH_SHADER = /* wgsl */ `
  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) local: vec2<f32>,
    @location(1) color: vec4<f32>,
    @location(2) @interpolate(flat) nominal_radius_ratio: f32,
  }

  @vertex
  fn vs_main(
    @builtin(vertex_index) vertex_index: u32,
    @location(0) center: vec2<f32>,
    @location(1) quad_radius: vec2<f32>,
    @location(2) color: vec4<f32>,
    @location(3) nominal_radius_ratio: f32,
  ) -> VertexOutput {
    let corners = array<vec2<f32>, 6>(
      vec2<f32>(-1.0, -1.0),
      vec2<f32>( 1.0, -1.0),
      vec2<f32>(-1.0,  1.0),
      vec2<f32>(-1.0,  1.0),
      vec2<f32>( 1.0, -1.0),
      vec2<f32>( 1.0,  1.0),
    );
    let corner = corners[vertex_index];
    var output: VertexOutput;
    output.position = vec4<f32>(center + corner * quad_radius, 0.0, 1.0);
    output.local = corner;
    output.color = color;
    output.nominal_radius_ratio = nominal_radius_ratio;
    return output;
  }

  @fragment
  fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let dist = length(input.local);
    let edge_w = max(fwidth(dist), 0.0005);
    let outer_half = edge_w * 0.6;
    let core_half = edge_w * 0.27;
    let sdf = dist - input.nominal_radius_ratio;
    let outer_cov = 1.0 - smoothstep(-outer_half, outer_half, sdf);
    let core_cov = 1.0 - smoothstep(-core_half, core_half, sdf);
    let coverage = 0.65 * outer_cov + 0.35 * core_cov;
    return input.color * coverage;
  }
`;

/**
 * WebGPU 38밴드 Kubelka-Munk 습식 안료 블렌드 프래그먼트 셰이더.
 * 캔버스 바탕 텍스처(`canvas_tex`)와 브러시 마스크(`mask_tex`)를 물리 스펙트럼 혼색으로 합성한다.
 */
export const STUDIO_WEBGPU_SPECTRAL_38BAND_BLEND_WGSL = /* wgsl */ `
${SPECTRAL_38BAND_KM_WGSL_SNIPPET}

struct SpectralBlendUniforms {
  pigment_srgb: vec4<f32>,
  wetness_and_strength: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u_blend: SpectralBlendUniforms;
@group(0) @binding(1) var canvas_tex: texture_2d<f32>;
@group(0) @binding(2) var mask_tex: texture_2d<f32>;
@group(0) @binding(3) var linear_sampler: sampler;

struct FullscreenOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_spectral_blend(@builtin(vertex_index) vid: u32) -> FullscreenOut {
  let x = select(-1.0, 3.0, vid == 1u);
  let y = select(-1.0, 3.0, vid == 2u);
  var out: FullscreenOut;
  out.pos = vec4<f32>(x, y, 0.0, 1.0);
  out.uv = vec2<f32>(x * 0.5 + 0.5, 0.5 - y * 0.5);
  return out;
}

@fragment
fn fs_spectral_blend(in: FullscreenOut) -> @location(0) vec4<f32> {
  let base = textureSample(canvas_tex, linear_sampler, in.uv);
  let mask = textureSample(mask_tex, linear_sampler, in.uv).a;
  let strength = clamp(mask * u_blend.wetness_and_strength.y, 0.0, 1.0);
  if (strength <= 0.0001) {
    return base;
  }
  let base_srgb = mix(vec3<f32>(1.0), clamp(base.rgb / max(base.a, 0.0001), vec3<f32>(0.0), vec3<f32>(1.0)), base.a);
  let mixed_srgb = spectral38_mix_srgb(base_srgb, u_blend.pigment_srgb.rgb, strength * u_blend.wetness_and_strength.x);
  let out_a = strength + base.a * (1.0 - strength);
  return vec4<f32>(mixed_srgb * out_a, out_a);
}
`;
