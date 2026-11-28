/**
 * Wave 163: 16-byte 정렬 80-byte 유니폼 WGSL 프래그먼트 셰이더 생성기 및 정적 계약 검증기.
 *
 * - `fwidth` 기반 해상도 독립 2/3-밴드 안티앨리어싱 셀 경계
 * - 그림자 색상 회전(Hue Shift), 프레넬 림라이트, 유전체/금속 분리 스페큘러 컷아웃
 * - 정적 검증: 중괄호 균형, `@group/@binding` 중복 금지, 16-byte 정렬, `fwidth` 필수,
 *   GLSL 금지 토큰 차단, 유한(finite) 유니폼 검증
 */

import { clamp01, clampValue, normalizeVec3 } from './cel-band-and-specular-kernel';
import type {
  CelMaterialSpec,
  CelRampConfig,
  CelShadingWgslBinding,
  CelShadingWgslBundle,
  CelWgslValidationResult,
  StylizedMultiLightRig,
} from './cel-shading-types';

export const CEL_SHADING_UNIFORM_BYTE_SIZE = 80;
export const CEL_SHADING_UNIFORM_ALIGNMENT = 16;
export const CEL_SHADING_UNIFORM_FLOAT_COUNT = 20;

const DEG_TO_RAD = Math.PI / 180;

export function packCelShadingUniforms(
  rig: StylizedMultiLightRig,
  material: CelMaterialSpec,
  ramp: CelRampConfig,
): Float32Array {
  const keyDir = normalizeVec3(rig.key.direction);
  const rimDir = normalizeVec3(rig.rim.direction);
  const viewDir = normalizeVec3(rig.viewDirection);
  const buffer = new Float32Array(CEL_SHADING_UNIFORM_FLOAT_COUNT);

  // vec4[0]: key_dir_intensity (16B)
  buffer[0] = keyDir.x;
  buffer[1] = keyDir.y;
  buffer[2] = keyDir.z;
  buffer[3] = clampValue(rig.key.intensity, 0, 4);

  // vec4[1]: rim_dir_power (16B)
  buffer[4] = rimDir.x;
  buffer[5] = rimDir.y;
  buffer[6] = rimDir.z;
  buffer[7] = clampValue(material.rimPower, 0.5, 12);

  // vec4[2]: view_dir_f0 (16B)
  buffer[8] = viewDir.x;
  buffer[9] = viewDir.y;
  buffer[10] = viewDir.z;
  buffer[11] = clampValue(material.fresnelF0, 0.01, 0.99);

  // vec4[3]: ramp_params (16B)
  buffer[12] = ramp.bandCount;
  buffer[13] = clampValue(ramp.terminatorThreshold, -0.6, 0.7);
  buffer[14] = Math.min(
    clampValue(ramp.midBandThreshold, -0.9, 0.5),
    clampValue(ramp.terminatorThreshold, -0.6, 0.7) - 0.04,
  );
  buffer[15] = Math.max(0.005, ramp.bandFeatherWidth);

  // vec4[4]: material_params (16B)
  buffer[16] = material.isMetal ? 1.0 : clamp01(material.metallic);
  buffer[17] = clampValue(material.roughness, 0.04, 1.0);
  buffer[18] = clampValue(material.specularCutoff, 0.1, 0.98);
  buffer[19] = ramp.shadowHueShiftDeg * DEG_TO_RAD;

  return buffer;
}

export function buildCelShadingBandWgsl(
  rig: StylizedMultiLightRig,
  material: CelMaterialSpec,
  ramp: CelRampConfig,
): CelShadingWgslBundle {
  const uniformFloat32 = packCelShadingUniforms(rig, material, ramp);
  const bindings: readonly CelShadingWgslBinding[] = [
    { group: 0, binding: 0, name: 'u_cel', addressSpace: 'uniform' },
    { group: 0, binding: 1, name: 's_linear', addressSpace: 'sampler' },
    { group: 0, binding: 2, name: 't_albedo', addressSpace: 'texture_2d<f32>' },
    { group: 0, binding: 3, name: 't_normal', addressSpace: 'texture_2d<f32>' },
  ];

  const wgslSource = `// Wave 163: Cel Shading 2/3-Band & Specular Consistency Fragment Shader (80B Uniform)
struct CelBandUniforms {
  key_dir_intensity: vec4<f32>,
  rim_dir_power: vec4<f32>,
  view_dir_f0: vec4<f32>,
  ramp_params: vec4<f32>,
  material_params: vec4<f32>,
};

struct FragmentInput {
  @location(0) uv: vec2<f32>,
  @location(1) world_normal: vec3<f32>,
};

@group(0) @binding(0) var<uniform> u_cel: CelBandUniforms;
@group(0) @binding(1) var s_linear: sampler;
@group(0) @binding(2) var t_albedo: texture_2d<f32>;
@group(0) @binding(3) var t_normal: texture_2d<f32>;

fn rotate_shadow_chroma(color_rgb: vec3<f32>, shift_rad: f32) -> vec3<f32> {
  let luma = dot(color_rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
  let chroma = color_rgb - vec3<f32>(luma, luma, luma);
  let c = cos(shift_rad);
  let s = sin(shift_rad);
  let axis_u = vec3<f32>(0.70710678, -0.70710678, 0.0);
  let axis_v = vec3<f32>(0.40824829, 0.40824829, -0.81649658);
  let cu = dot(chroma, axis_u);
  let cv = dot(chroma, axis_v);
  let ru = cu * c - cv * s;
  let rv = cu * s + cv * c;
  let shifted = vec3<f32>(luma * 0.62) + (axis_u * ru + axis_v * rv) * 0.96;
  return clamp(shifted, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn schlick_fresnel(f0: f32, cos_theta: f32) -> f32 {
  let inv = clamp(1.0 - cos_theta, 0.0, 1.0);
  let inv2 = inv * inv;
  return f0 + (1.0 - f0) * inv2 * inv2 * inv;
}

@fragment
fn fs_cel_band_specular(in: FragmentInput) -> @location(0) vec4<f32> {
  let albedo_sample = textureSample(t_albedo, s_linear, in.uv);
  let normal_sample = textureSample(t_normal, s_linear, in.uv).xyz * 2.0 - vec3<f32>(1.0);
  let n = normalize(mix(normalize(in.world_normal), normalize(normal_sample), 0.35));

  let l_key = normalize(u_cel.key_dir_intensity.xyz);
  let key_intensity = u_cel.key_dir_intensity.w;
  let l_rim = normalize(u_cel.rim_dir_power.xyz);
  let rim_power = max(u_cel.rim_dir_power.w, 0.5);
  let v = normalize(u_cel.view_dir_f0.xyz);
  let fresnel_f0 = u_cel.view_dir_f0.w;

  let band_count = u_cel.ramp_params.x;
  let terminator = u_cel.ramp_params.y;
  let mid_threshold = u_cel.ramp_params.z;
  let base_feather = u_cel.ramp_params.w;

  let metallic = u_cel.material_params.x;
  let roughness = max(u_cel.material_params.y, 0.04);
  let spec_cutoff = u_cel.material_params.z;
  let shadow_shift_rad = u_cel.material_params.w;

  let ndotl = dot(n, l_key);
  let aa_width = max(base_feather, fwidth(ndotl) * 1.15);

  let upper_band = smoothstep(terminator - aa_width, terminator + aa_width, ndotl);
  let mid_band = smoothstep(mid_threshold - aa_width, mid_threshold + aa_width, ndotl);

  let shadow_rgb = rotate_shadow_chroma(albedo_sample.rgb, shadow_shift_rad);
  let mid_rgb = mix(shadow_rgb, albedo_sample.rgb, 0.58);
  let lit_rgb = clamp(albedo_sample.rgb * 1.04, vec3<f32>(0.0), vec3<f32>(1.0));

  var cel_diffuse: vec3<f32>;
  if (band_count < 2.5) {
    cel_diffuse = mix(shadow_rgb, lit_rgb, upper_band);
  } else {
    let lower_mix = mix(shadow_rgb, mid_rgb, mid_band);
    cel_diffuse = mix(lower_mix, lit_rgb, upper_band);
  }

  let h_vec = normalize(l_key + v);
  let ndoth = max(dot(n, h_vec), 0.0);
  let vdoth = max(dot(v, h_vec), 0.0);
  let ndotv = max(dot(n, v), 0.0);

  let fresnel = schlick_fresnel(fresnel_f0, vdoth);
  let spec_exp = 4.0 + (1.0 - roughness) * 48.0;
  let raw_spec = pow(ndoth, spec_exp);
  let spec_aa = max(0.035, fwidth(raw_spec) * 1.25);
  let lit_gate = smoothstep(-0.15, 0.15, ndotl);
  let spec_step = smoothstep(spec_cutoff - spec_aa, spec_cutoff + spec_aa, raw_spec) * lit_gate;
  let spec_tint = mix(vec3<f32>(1.0, 0.98, 0.95), albedo_sample.rgb, metallic);
  let spec_rgb = spec_tint * spec_step * (0.45 + 0.55 * fresnel) * key_intensity;

  let rim_grazing = pow(clamp(1.0 - ndotv, 0.0, 1.0), rim_power);
  let rim_gate = smoothstep(-0.35, 0.35, dot(n, l_rim));
  let rim_rgb = vec3<f32>(0.96, 0.95, 0.92) * rim_grazing * rim_gate * 0.45;

  let final_rgb = clamp(cel_diffuse + spec_rgb * 0.55 + rim_rgb, vec3<f32>(0.0), vec3<f32>(1.0));
  return vec4<f32>(final_rgb, albedo_sample.a);
}
`;

  return {
    shaderName: 'wave163-cel-shading-band-specular',
    entryPoint: 'fs_cel_band_specular',
    uniformByteSize: CEL_SHADING_UNIFORM_BYTE_SIZE,
    uniformAlignmentBytes: CEL_SHADING_UNIFORM_ALIGNMENT,
    uniformFloat32,
    wgslSource,
    bindings,
  };
}

function stripWgslLineComments(source: string): string {
  return source
    .split('\n')
    .map((line) => {
      const idx = line.indexOf('//');
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join('\n');
}

function checkBalancedDelimiters(code: string): boolean {
  const stack: string[] = [];
  const pairs: Record<string, string> = {
    ')': '(',
    '}': '{',
    ']': '[',
  };
  for (let i = 0; i < code.length; i += 1) {
    const ch = code.charAt(i);
    if (ch === '(' || ch === '{' || ch === '[') {
      stack.push(ch);
    } else if (ch === ')' || ch === '}' || ch === ']') {
      const expected = pairs[ch];
      if (stack.length === 0 || stack[stack.length - 1] !== expected) {
        return false;
      }
      stack.pop();
    }
  }
  return stack.length === 0;
}

export function validateCelShadingBandWgsl(
  bundle: CelShadingWgslBundle,
): CelWgslValidationResult {
  const errors: string[] = [];
  const cleanCode = stripWgslLineComments(bundle.wgslSource);

  const is16ByteAligned =
    bundle.uniformByteSize > 0 &&
    bundle.uniformByteSize % CEL_SHADING_UNIFORM_ALIGNMENT === 0 &&
    bundle.uniformFloat32.byteLength === bundle.uniformByteSize;
  if (!is16ByteAligned) {
    errors.push(
      `유니폼 크기(${bundle.uniformByteSize}B / Float32Array ${bundle.uniformFloat32.byteLength}B)가 16-byte 정렬 규격을 위반했습니다.`,
    );
  }

  const hasBalancedBraces = checkBalancedDelimiters(cleanCode);
  if (!hasBalancedBraces) {
    errors.push('WGSL 소스의 괄호·중괄호 균형이 맞지 않습니다.');
  }

  const bindingRegex = /@group\(\s*(\d+)\s*\)\s*@binding\(\s*(\d+)\s*\)/g;
  const seenBindings = new Set<string>();
  const duplicateBindings: string[] = [];
  let bindingMatch = bindingRegex.exec(cleanCode);
  while (bindingMatch !== null) {
    const key = `group(${bindingMatch[1]})/binding(${bindingMatch[2]})`;
    if (seenBindings.has(key)) {
      duplicateBindings.push(key);
    } else {
      seenBindings.add(key);
    }
    bindingMatch = bindingRegex.exec(cleanCode);
  }
  if (seenBindings.size === 0) {
    errors.push('WGSL 소스에 @group/@binding 선언이 없습니다.');
  }
  if (duplicateBindings.length > 0) {
    errors.push(`중복 바인딩이 감지되었습니다: ${duplicateBindings.join(', ')}`);
  }

  const hasFwidth = /\bfwidth\s*\(/.test(cleanCode);
  if (!hasFwidth) {
    errors.push('해상도 독립 안티앨리어싱을 위한 fwidth() 호출이 누락되었습니다.');
  }

  const forbiddenGlslTokens: string[] = [];
  const glslVecRegex = /\b(vec2|vec3|vec4)\b(?!\s*<)/g;
  let vecMatch = glslVecRegex.exec(cleanCode);
  while (vecMatch !== null) {
    if (!forbiddenGlslTokens.includes(vecMatch[1])) {
      forbiddenGlslTokens.push(vecMatch[1]);
    }
    vecMatch = glslVecRegex.exec(cleanCode);
  }

  const glslOtherRegex = /\b(texture2D|gl_FragCoord|gl_FragColor|sampler2D|varying|attribute)\b/g;
  let otherMatch = glslOtherRegex.exec(cleanCode);
  while (otherMatch !== null) {
    if (!forbiddenGlslTokens.includes(otherMatch[1])) {
      forbiddenGlslTokens.push(otherMatch[1]);
    }
    otherMatch = glslOtherRegex.exec(cleanCode);
  }

  if (forbiddenGlslTokens.length > 0) {
    errors.push(`GLSL 전용 금지 토큰이 포함되었습니다: ${forbiddenGlslTokens.join(', ')}`);
  }

  const nonFiniteUniformIndices: number[] = [];
  for (let i = 0; i < bundle.uniformFloat32.length; i += 1) {
    if (!Number.isFinite(bundle.uniformFloat32[i])) {
      nonFiniteUniformIndices.push(i);
    }
  }
  if (nonFiniteUniformIndices.length > 0) {
    errors.push(
      `유한하지 않은(NaN/Infinity) 유니폼 슬롯이 있습니다: [${nonFiniteUniformIndices.join(', ')}]`,
    );
  }

  return {
    valid: errors.length === 0,
    uniformByteSize: bundle.uniformByteSize,
    is16ByteAligned,
    hasFwidth,
    hasBalancedBraces,
    duplicateBindings,
    forbiddenGlslTokens,
    nonFiniteUniformIndices,
    errors,
  };
}
