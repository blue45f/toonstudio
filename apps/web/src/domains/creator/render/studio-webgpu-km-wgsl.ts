/**
 * WebGPU 38밴드 Kubelka-Munk 안료 혼색 + 원형 dab의 물리 픽셀 면적 AA 셰이더 모듈.
 *
 * `@toonstudio/studio-brush-platform`의 단일 정본 38밴드 테이블(`SPECTRAL_38BAND_KM_WGSL_SNIPPET`)을
 * 재사용해 CPU(`studio-wet-mix.ts`, `apps/brush-lab`)와 GPU(WebGPU)가 동일한 분광 혼색 수식을 실행한다.
 */

import { SPECTRAL_38BAND_KM_WGSL_SNIPPET } from "@toonstudio/studio-brush-platform/spectral-km-wgsl";

export { SPECTRAL_38BAND_KM_WGSL_SNIPPET };

/**
 * 원의 경계 픽셀만 4×4로 샘플링하며, 반지름 1픽셀 이하에서는 원–픽셀 교차면적을 적분한다.
 * 방향에 따라 폭이 달라지는 거리 미분 밴드를 없애고, 샘플 사이의 얇은 압력 dab도 보존한다.
 * 원의 중심과 픽셀 크기는 flat 좌표로 받아 정점의 래스터 격자 반올림에 영향받지 않는다.
 * 기존 공개 이름과 per-dab premultiplied 색·타일 quad 여백은 유지한다.
 */
export const STUDIO_GPU_DUAL_ENVELOPE_AA_BRUSH_SHADER = /* wgsl */ `
  struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) @interpolate(flat) pixel_geometry: vec4<f32>,
    @location(1) @interpolate(flat) color: vec4<f32>,
    @location(2) @interpolate(flat) nominal_radius_ratio: f32,
  }

  @vertex
  fn vs_main(
    @builtin(vertex_index) vertex_index: u32,
    @location(0) center: vec2<f32>,
    @location(1) quad_radius: vec2<f32>,
    @location(2) color: vec4<f32>,
    @location(3) nominal_radius_ratio: f32,
    @location(4) pixel_geometry: vec4<f32>,
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
    output.pixel_geometry = pixel_geometry;
    output.color = color;
    output.nominal_radius_ratio = nominal_radius_ratio;
    return output;
  }

  // 단위원 제1사분면에서 sqrt(1 - x*x)의 적분 원시함수.
  fn circle_primitive(x: f32) -> f32 {
    let bounded = clamp(x, 0.0, 1.0);
    return 0.5 * (bounded * sqrt(max(0.0, 1.0 - bounded * bounded)) + asin(bounded));
  }

  // 원점부터 point까지의 직사각형과 원이 겹치는 부호 있는 면적.
  fn circle_area_to(point: vec2<f32>, radius: f32) -> f32 {
    let bound = min(abs(point) / radius, vec2<f32>(1.0));
    var area = bound.x * bound.y;
    if (dot(bound, bound) > 1.0) {
      let intersection = sqrt(max(0.0, 1.0 - bound.y * bound.y));
      area = bound.y * intersection + circle_primitive(bound.x) - circle_primitive(intersection);
    }
    return sign(point.x) * sign(point.y) * area * radius * radius;
  }

  fn small_circle_pixel_coverage(local: vec2<f32>, radius: f32, pixel_size: vec2<f32>) -> f32 {
    let low = local - pixel_size * 0.5;
    let high = local + pixel_size * 0.5;
    let area = circle_area_to(high, radius)
      - circle_area_to(vec2<f32>(low.x, high.y), radius)
      - circle_area_to(vec2<f32>(high.x, low.y), radius)
      + circle_area_to(low, radius);
    return clamp(area / (pixel_size.x * pixel_size.y), 0.0, 1.0);
  }

  @fragment
  fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // 보간된 quad 모서리는 정점이 격자에 맞춰질 때 원까지 이동시킨다.
    // 실제 fragment 픽셀과 별도로 전달한 중심에서 해석적 좌표를 복원한다.
    let pixel_size = max(input.pixel_geometry.zw, vec2<f32>(0.00000001));
    let local = (input.position.xy - input.pixel_geometry.xy) * pixel_size;
    let radius = input.nominal_radius_ratio;
    let radius_squared = radius * radius;
    let half_pixel = pixel_size * 0.5;
    let nearest = max(abs(local) - half_pixel, vec2<f32>(0.0));
    if (radius <= 0.0 || dot(nearest, nearest) >= radius_squared) {
      return vec4<f32>(0.0);
    }
    let farthest = abs(local) + half_pixel;
    if (dot(farthest, farthest) <= radius_squared) {
      return input.color;
    }
    // 모든 샘플점 사이에 놓인 작은 원도 픽셀 내 위치에 관계없이 면적을 보존한다.
    if (radius <= max(pixel_size.x, pixel_size.y)) {
      return input.color * small_circle_pixel_coverage(local, radius, pixel_size);
    }
    var covered_samples = 0.0;
    for (var y = 0u; y < 4u; y += 1u) {
      for (var x = 0u; x < 4u; x += 1u) {
        let offset = (vec2<f32>(f32(x), f32(y)) + vec2<f32>(0.5)) * 0.25 - vec2<f32>(0.5);
        let sample_local = local + pixel_size * offset;
        covered_samples += select(0.0, 1.0, dot(sample_local, sample_local) <= radius_squared);
      }
    }
    return input.color * (covered_samples * 0.0625);
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
