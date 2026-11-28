/**
 * Wave 136 — WebGPU WGSL 10-밴드 Kubelka-Munk 감산 안료 혼색·글레이징·수채 엣지 다크닝 셰이더
 * 생성기 및 정적 구조·바인딩·GLSL 금지어 검증기.
 *
 * - 16바이트 정렬 유니폼 구조체(6 × vec4<f32> = 96B)
 * - @compute(수채 모세관 플럭스 + KM 스펙트럼 합성) 및 @fragment(실시간 감산 혼색 프리뷰) 진입점 제공
 * - 괄호 균형, 바인딩 중복, 유니폼 16바이트 정렬, GLSL 금지어, 비유한 상수 검사
 */

import {
  clampFinite,
  SPECTRAL_BAND_COUNT,
  SPECTRAL_TO_XYZ_WEIGHTS,
  type SpectralTuple10,
} from "./kubelka-munk-spectral-pigments";
import {
  getWetMediumPreset,
  type WetMediumPresetId,
} from "./wet-medium-glazing-and-backrun";

export interface BuildSubtractivePigmentWgslOptions {
  readonly mediumPreset?: WetMediumPresetId;
  readonly workgroupSizeX?: number;
  readonly workgroupSizeY?: number;
  readonly enableEdgeDarkening?: boolean;
}

export interface SubtractiveWgslBindingDescriptor {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: "uniform" | "storage-read" | "storage-read-write" | "texture" | "storage-texture";
}

export interface SubtractivePigmentWgslArtifact {
  readonly mediumPreset: WetMediumPresetId;
  readonly workgroupSize: readonly [number, number];
  readonly uniformBufferByteLength: number;
  readonly uniformStructName: string;
  readonly bindings: readonly SubtractiveWgslBindingDescriptor[];
  readonly entryPoints: readonly string[];
  readonly lineCount: number;
  readonly wgsl: string;
}

export interface SubtractivePigmentWgslValidationReport {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly entryPoints: readonly string[];
  readonly bindingCount: number;
  readonly uniformBufferAligned: boolean;
  readonly hasComputeEntry: boolean;
  readonly hasFragmentEntry: boolean;
  readonly lineCount: number;
}

function fmtWgslF32(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const fixed = safe.toFixed(6);
  return fixed.indexOf(".") >= 0 ? fixed : `${fixed}.0`;
}

function formatWgslArray10(name: string, values: SpectralTuple10): string {
  const parts: string[] = [];
  for (let i = 0; i < SPECTRAL_BAND_COUNT; i += 1) {
    parts.push(fmtWgslF32(values[i]));
  }
  return `const ${name}: array<f32, 10> = array<f32, 10>(${parts.join(", ")});`;
}

/**
 * 16바이트 정렬 유니폼(96B) + 10-밴드 Kubelka-Munk K/S 혼색·유한 두께 글레이징·
 * 모세관 엣지 다크닝을 수행하는 WebGPU WGSL(@compute + @fragment) 셰이더를 생성한다.
 */
export function buildSubtractivePigmentWgsl(
  options?: BuildSubtractivePigmentWgslOptions,
): SubtractivePigmentWgslArtifact {
  const mediumPresetId: WetMediumPresetId = options?.mediumPreset ?? "watercolor-transparent";
  const medium = getWetMediumPreset(mediumPresetId);
  const wgX = Math.max(1, Math.min(32, Math.floor(options?.workgroupSizeX ?? 8)));
  const wgY = Math.max(1, Math.min(32, Math.floor(options?.workgroupSizeY ?? 8)));
  const edgeGain = options?.enableEdgeDarkening === false ? 0.0 : medium.capillaryRimStrength;

  const lines: readonly string[] = [
    `// Wave 136 WebGPU 10-Band Kubelka-Munk Subtractive Pigment & Edge-Darkening Shader (${medium.id})`,
    "// Uniform struct layout: 6 x vec4<f32> = 96 bytes (strictly 16-byte aligned)",
    "struct SubtractivePigmentUniforms {",
    "  tile_dims_and_steps: vec4<f32>,",
    "  mix_weights: vec4<f32>,",
    "  medium_optical: vec4<f32>,",
    "  capillary_params: vec4<f32>,",
    "  substrate_tint: vec4<f32>,",
    "  qa_flags: vec4<f32>,",
    "};",
    "",
    "struct SpectralPigmentBuffer {",
    "  pigment_a_k: array<f32, 10>,",
    "  pigment_a_s: array<f32, 10>,",
    "  pigment_b_k: array<f32, 10>,",
    "  pigment_b_s: array<f32, 10>,",
    "  substrate_r: array<f32, 10>,",
    "};",
    "",
    "@group(0) @binding(0) var<uniform> u_pigment: SubtractivePigmentUniforms;",
    "@group(0) @binding(1) var<storage, read> u_spectral: SpectralPigmentBuffer;",
    "@group(0) @binding(2) var<storage, read> src_pigment_mass: array<f32>;",
    "@group(0) @binding(3) var<storage, read_write> dst_pigment_mass: array<f32>;",
    "@group(0) @binding(4) var dst_rgba_tex: texture_storage_2d<rgba8unorm, write>;",
    "",
    `const PRESET_SCATTERING_SCALE: f32 = ${fmtWgslF32(clampFinite(medium.scatteringScale, 0.01, 10.0))};`,
    `const PRESET_BINDER_SCATTERING: f32 = ${fmtWgslF32(clampFinite(medium.binderBodyScattering, 0.0, 5.0))};`,
    `const PRESET_BASE_THICKNESS: f32 = ${fmtWgslF32(clampFinite(medium.baseCoatThickness, 0.05, 8.0))};`,
    `const PRESET_EDGE_GAIN: f32 = ${fmtWgslF32(clampFinite(edgeGain, 0.0, 2.0))};`,
    `const PRESET_DIFFUSION_RATE: f32 = ${fmtWgslF32(clampFinite(medium.solventDiffusionRate, 0.0, 0.5))};`,
    formatWgslArray10("CIE_X_WEIGHTS", SPECTRAL_TO_XYZ_WEIGHTS.x),
    formatWgslArray10("CIE_Y_WEIGHTS", SPECTRAL_TO_XYZ_WEIGHTS.y),
    formatWgslArray10("CIE_Z_WEIGHTS", SPECTRAL_TO_XYZ_WEIGHTS.z),
    "",
    "fn reflectance_to_ks(r_in: f32) -> f32 {",
    "  let r = clamp(r_in, 0.0005, 0.9995);",
    "  let d = 1.0 - r;",
    "  return (d * d) / (2.0 * r);",
    "}",
    "",
    "fn ks_to_reflectance(ks_in: f32) -> f32 {",
    "  let theta = max(0.0, ks_in);",
    "  if (theta <= 0.000001) {",
    "    return 1.0;",
    "  }",
    "  let denom = 1.0 + theta + sqrt(theta * theta + 2.0 * theta);",
    "  return clamp(1.0 / denom, 0.0, 1.0);",
    "}",
    "",
    "fn evaluate_km_layer_over_substrate(k_in: f32, s_in: f32, thickness: f32, r_g: f32) -> f32 {",
    "  let k = max(0.0, k_in);",
    "  let s = max(0.0, s_in);",
    "  let x = max(0.0, thickness);",
    "  let rg = clamp(r_g, 0.0, 1.0);",
    "  if (x <= 0.000001) {",
    "    return rg;",
    "  }",
    "  if (s <= 0.00001) {",
    "    return clamp(rg * exp(-2.0 * k * x), 0.0, 1.0);",
    "  }",
    "  if (k <= 0.00001) {",
    "    let sx = s * x;",
    "    return clamp((rg + (1.0 - rg) * sx) / (1.0 + (1.0 - rg) * sx), 0.0, 1.0);",
    "  }",
    "  let r_inf = ks_to_reflectance(k / s);",
    "  let b_s = sqrt(k * k + 2.0 * k * s);",
    "  let decay = exp(-2.0 * b_s * x);",
    "  let one_minus = 1.0 - rg * r_inf;",
    "  let diff = r_inf - rg;",
    "  let num = r_inf * one_minus - diff * decay;",
    "  let den = one_minus - r_inf * diff * decay;",
    "  return clamp(num / max(0.000001, den), 0.0, 1.0);",
    "}",
    "",
    "fn linear_to_srgb_channel(c_in: f32) -> f32 {",
    "  let c = clamp(c_in, 0.0, 1.0);",
    "  if (c <= 0.0031308) {",
    "    return 12.92 * c;",
    "  }",
    "  return 1.055 * pow(c, 1.0 / 2.4) - 0.055;",
    "}",
    "",
    "fn evaluate_subtractive_pixel_srgb(ratio_b: f32, local_thickness: f32) -> vec3<f32> {",
    "  let w_b = clamp(ratio_b, 0.0, 1.0);",
    "  let w_a = 1.0 - w_b;",
    "  var xyz_x: f32 = 0.0;",
    "  var xyz_y: f32 = 0.0;",
    "  var xyz_z: f32 = 0.0;",
    "  for (var band: u32 = 0u; band < 10u; band = band + 1u) {",
    "    let k_mix = w_a * u_spectral.pigment_a_k[band] + w_b * u_spectral.pigment_b_k[band];",
    "    let s_mix = (w_a * u_spectral.pigment_a_s[band] + w_b * u_spectral.pigment_b_s[band]) * PRESET_SCATTERING_SCALE + PRESET_BINDER_SCATTERING;",
    "    let r_g = u_spectral.substrate_r[band];",
    "    let r_out = evaluate_km_layer_over_substrate(k_mix, s_mix, local_thickness, r_g);",
    "    xyz_x = xyz_x + r_out * CIE_X_WEIGHTS[band];",
    "    xyz_y = xyz_y + r_out * CIE_Y_WEIGHTS[band];",
    "    xyz_z = xyz_z + r_out * CIE_Z_WEIGHTS[band];",
    "  }",
    "  let lin_r = clamp(3.2404542 * xyz_x - 1.5371385 * xyz_y - 0.4985314 * xyz_z, 0.0, 1.0);",
    "  let lin_g = clamp(-0.9692660 * xyz_x + 1.8760108 * xyz_y + 0.0415560 * xyz_z, 0.0, 1.0);",
    "  let lin_b = clamp(0.0556434 * xyz_x - 0.2040259 * xyz_y + 1.0572252 * xyz_z, 0.0, 1.0);",
    "  return vec3<f32>(linear_to_srgb_channel(lin_r), linear_to_srgb_channel(lin_g), linear_to_srgb_channel(lin_b));",
    "}",
    "",
    "fn compute_edge_darkening_flux(c_self: f32, c_neighbor: f32, r_self: f32, r_neighbor: f32) -> f32 {",
    "  let pot_diff = (r_neighbor * r_neighbor) - (r_self * r_self);",
    "  let adv_gain = PRESET_EDGE_GAIN * 0.24;",
    "  var adv_flux: f32 = 0.0;",
    "  if (pot_diff > 0.0) {",
    "    adv_flux = min(0.22, adv_gain * pot_diff) * c_self;",
    "  } else {",
    "    adv_flux = -min(0.22, adv_gain * (-pot_diff)) * c_neighbor;",
    "  }",
    "  let diff_flux = PRESET_DIFFUSION_RATE * (c_self - c_neighbor);",
    "  return clamp(adv_flux + diff_flux, -0.22 * c_neighbor, 0.22 * c_self);",
    "}",
    "",
    `@compute @workgroup_size(${String(wgX)}, ${String(wgY)}, 1)`,
    "fn cs_subtractive_mix_and_backrun(@builtin(global_invocation_id) gid: vec3<u32>) {",
    "  let width = u32(max(1.0, u_pigment.tile_dims_and_steps.x));",
    "  let height = u32(max(1.0, u_pigment.tile_dims_and_steps.y));",
    "  if (gid.x >= width || gid.y >= height) {",
    "    return;",
    "  }",
    "  let idx = gid.y * width + gid.x;",
    "  let center_x = (f32(width) - 1.0) * 0.5;",
    "  let center_y = (f32(height) - 1.0) * 0.5;",
    "  let max_r = max(1.0, min(f32(width), f32(height)) * 0.37);",
    "  let r_self = length(vec2<f32>(f32(gid.x) - center_x, f32(gid.y) - center_y)) / max_r;",
    "  let c_self = src_pigment_mass[idx];",
    "  var flux_sum: f32 = 0.0;",
    "  if (gid.x > 0u) {",
    "    let r_l = length(vec2<f32>(f32(gid.x - 1u) - center_x, f32(gid.y) - center_y)) / max_r;",
    "    flux_sum = flux_sum + compute_edge_darkening_flux(c_self, src_pigment_mass[idx - 1u], r_self, r_l);",
    "  }",
    "  if (gid.x + 1u < width) {",
    "    let r_r = length(vec2<f32>(f32(gid.x + 1u) - center_x, f32(gid.y) - center_y)) / max_r;",
    "    flux_sum = flux_sum + compute_edge_darkening_flux(c_self, src_pigment_mass[idx + 1u], r_self, r_r);",
    "  }",
    "  let next_c = max(0.0, c_self - flux_sum);",
    "  dst_pigment_mass[idx] = next_c;",
    "  let thickness = PRESET_BASE_THICKNESS * max(0.0, u_pigment.medium_optical.x) * next_c;",
    "  let out_rgb = evaluate_subtractive_pixel_srgb(u_pigment.mix_weights.y, thickness);",
    "  textureStore(dst_rgba_tex, vec2<i32>(i32(gid.x), i32(gid.y)), vec4<f32>(out_rgb, 1.0));",
    "}",
    "",
    "@fragment",
    "fn fs_subtractive_pigment_preview(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {",
    "  let ratio_b = clamp(uv.x, 0.0, 1.0);",
    "  let thickness = PRESET_BASE_THICKNESS * (0.25 + clamp(uv.y, 0.0, 1.0) * 2.5);",
    "  let srgb = evaluate_subtractive_pixel_srgb(ratio_b, thickness);",
    "  return vec4<f32>(srgb, 1.0);",
    "}",
  ];

  const bindings: readonly SubtractiveWgslBindingDescriptor[] = [
    { group: 0, binding: 0, name: "u_pigment", addressSpace: "uniform" },
    { group: 0, binding: 1, name: "u_spectral", addressSpace: "storage-read" },
    { group: 0, binding: 2, name: "src_pigment_mass", addressSpace: "storage-read" },
    { group: 0, binding: 3, name: "dst_pigment_mass", addressSpace: "storage-read-write" },
    { group: 0, binding: 4, name: "dst_rgba_tex", addressSpace: "storage-texture" },
  ];

  return {
    mediumPreset: mediumPresetId,
    workgroupSize: [wgX, wgY],
    uniformBufferByteLength: 96,
    uniformStructName: "SubtractivePigmentUniforms",
    bindings,
    entryPoints: ["cs_subtractive_mix_and_backrun", "fs_subtractive_pigment_preview"],
    lineCount: lines.length,
    wgsl: lines.join("\n"),
  };
}

function stripWgslLineComments(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join("\n");
}

function checkDelimiterBalance(code: string): string | null {
  const stack: string[] = [];
  const pairs: Readonly<Record<string, string>> = {
    ")": "(",
    "}": "{",
    "]": "[",
  };
  for (let i = 0; i < code.length; i += 1) {
    const ch = code.charAt(i);
    if (ch === "(" || ch === "{" || ch === "[") {
      stack.push(ch);
    } else if (ch === ")" || ch === "}" || ch === "]") {
      const top = stack.pop();
      if (top !== pairs[ch]) {
        return `WGSL 괄호 불일치: '${ch}'에 대응하는 여는 괄호가 없습니다.`;
      }
    }
  }
  if (stack.length > 0) {
    return `WGSL 닫히지 않은 괄호가 ${String(stack.length)}건 남아 있습니다.`;
  }
  return null;
}

const FORBIDDEN_GLSL_PATTERNS: readonly { readonly label: string; readonly regex: RegExp }[] = [
  { label: "gl_FragCoord", regex: /\bgl_FragCoord\b/ },
  { label: "gl_Position", regex: /\bgl_Position\b/ },
  { label: "sampler2D", regex: /\bsampler2D\b/ },
  { label: "texture2D", regex: /\btexture2D\b/ },
  { label: "#version", regex: /#version\b/ },
  { label: "varying", regex: /\bvarying\b/ },
  { label: "attribute", regex: /\battribute\b/ },
  { label: "GLSL vec3(...)", regex: /\bvec3\s*\(/ },
  { label: "GLSL vec4(...)", regex: /\bvec4\s*\(/ },
  { label: "GLSL uniform 선언", regex: /(?:^|\n)\s*uniform\s+\w+/ },
];

/**
 * 생성되었거나 외부에서 수정된 WGSL 소스의 구조·바인딩·괄호 균형·16바이트 유니폼 정렬·
 * GLSL 금지어·비유한 수치 오염 여부를 정적으로 검증한다.
 */
export function validateSubtractivePigmentWgsl(
  wgsl: string,
): SubtractivePigmentWgslValidationReport {
  const errors: string[] = [];
  if (typeof wgsl !== "string" || wgsl.trim().length === 0) {
    return {
      valid: false,
      errors: ["WGSL 소스가 비어 있습니다."],
      entryPoints: [],
      bindingCount: 0,
      uniformBufferAligned: false,
      hasComputeEntry: false,
      hasFragmentEntry: false,
      lineCount: 0,
    };
  }

  const lines = wgsl.split("\n");
  const stripped = stripWgslLineComments(wgsl);

  // 1. 괄호 균형 검사
  const delimErr = checkDelimiterBalance(stripped);
  if (delimErr !== null) {
    errors.push(delimErr);
  }

  // 2. 비유한 상수(NaN / Infinity) 검사
  if (/\b(?:NaN|Infinity)\b/.test(stripped)) {
    errors.push("WGSL 소스에 NaN 또는 Infinity 리터럴이 포함되었습니다.");
  }

  // 3. GLSL 금지어 검사
  for (let i = 0; i < FORBIDDEN_GLSL_PATTERNS.length; i += 1) {
    const rule = FORBIDDEN_GLSL_PATTERNS[i];
    if (rule.regex.test(stripped)) {
      errors.push(`WGSL 금지 GLSL 구문이 검출되었습니다: ${rule.label}`);
    }
  }

  // 4. @group/@binding 중복 및 개수 검사
  const bindingRegex = /@group\(\s*(\d+)\s*\)\s*@binding\(\s*(\d+)\s*\)/g;
  const seenBindings = new Set<string>();
  let bindingCount = 0;
  let bMatch = bindingRegex.exec(stripped);
  while (bMatch !== null) {
    bindingCount += 1;
    const key = `${bMatch[1]}:${bMatch[2]}`;
    if (seenBindings.has(key)) {
      errors.push(`중복된 WGSL 바인딩 슬롯이 검출되었습니다: @group(${bMatch[1]}) @binding(${bMatch[2]})`);
    }
    seenBindings.add(key);
    bMatch = bindingRegex.exec(stripped);
  }
  if (bindingCount === 0) {
    errors.push("@group/@binding 선언이 하나도 없습니다.");
  }

  // 5. 유니폼 구조체 16바이트 정렬 검사 (vec4<f32> / vec4<u32> / vec4<i32> / mat4x4<f32>)
  let uniformBufferAligned = false;
  const structMatch = /struct\s+SubtractivePigmentUniforms\s*\{([^}]*)\}/.exec(stripped);
  if (structMatch === null) {
    errors.push("필수 유니폼 구조체 SubtractivePigmentUniforms가 선언되지 않았습니다.");
  } else {
    const bodyLines = structMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (bodyLines.length === 0) {
      errors.push("SubtractivePigmentUniforms 구조체에 필드가 없습니다.");
    } else {
      let totalBytes = 0;
      let fieldError = false;
      for (let i = 0; i < bodyLines.length; i += 1) {
        const field = bodyLines[i];
        if (/:\s*vec4<(?:f32|u32|i32)>/.test(field)) {
          totalBytes += 16;
        } else if (/:\s*mat4x4<f32>/.test(field)) {
          totalBytes += 64;
        } else {
          errors.push(`유니폼 필드가 16바이트 정렬 타입(vec4/mat4x4)이 아닙니다: ${field}`);
          fieldError = true;
        }
      }
      uniformBufferAligned = !fieldError && totalBytes > 0 && totalBytes % 16 === 0;
      if (!uniformBufferAligned && !fieldError) {
        errors.push(`유니폼 구조체 크기(${String(totalBytes)}B)가 16바이트 배수가 아닙니다.`);
      }
    }
  }

  // 6. 진입점(@compute + @workgroup_size, @fragment) 검사
  const entryPoints: string[] = [];
  const computeRegex = /@compute\s+@workgroup_size\([^)]*\)\s*fn\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let cMatch = computeRegex.exec(stripped);
  let hasComputeEntry = false;
  while (cMatch !== null) {
    hasComputeEntry = true;
    entryPoints.push(cMatch[1]);
    cMatch = computeRegex.exec(stripped);
  }

  const fragmentRegex = /@fragment\s+fn\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let fMatch = fragmentRegex.exec(stripped);
  let hasFragmentEntry = false;
  while (fMatch !== null) {
    hasFragmentEntry = true;
    entryPoints.push(fMatch[1]);
    fMatch = fragmentRegex.exec(stripped);
  }

  if (!hasComputeEntry) {
    errors.push("@compute @workgroup_size(...) 진입점이 누락되었습니다.");
  }
  if (!hasFragmentEntry) {
    errors.push("@fragment 진입점이 누락되었습니다.");
  }

  return {
    valid: errors.length === 0,
    errors,
    entryPoints,
    bindingCount,
    uniformBufferAligned,
    hasComputeEntry,
    hasFragmentEntry,
    lineCount: lines.length,
  };
}
