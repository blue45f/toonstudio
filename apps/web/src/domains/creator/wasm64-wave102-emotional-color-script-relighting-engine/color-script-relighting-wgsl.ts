/**
 * Wave 102 — 실시간 WebGPU WGSL OKLCH 장면 재조명 & 피부색 보호 마스크 컴퓨트 셰이더 빌더·검증기.
 */

import {
  LIGHTING_MOOD_PRESETS,
  clampFinite,
  type LightingMoodPreset,
  type LightingMoodPresetId,
} from "./oklch-color-math-and-presets";

export interface BuildWgslRelightingOptions {
  readonly intensity?: number;
  readonly skinAnchorStrength?: number;
  readonly maxAllowedSkinHueDriftDeg?: number;
  readonly workgroupSizeX?: number;
  readonly workgroupSizeY?: number;
}

export interface WgslValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly lineCount: number;
  readonly entryPoints: readonly string[];
}

function fmtWgslFloat(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const fixed = safe.toFixed(6);
  return fixed.indexOf(".") >= 0 ? fixed : `${fixed}.0`;
}

/**
 * 실시간 WebGPU OKLCH 장면 재조명 & 피부색 보호 마스크 컴퓨트 셰이더(WGSL)를 생성한다.
 */
export function buildColorScriptRelightingWgsl(
  presetOrId: LightingMoodPresetId | LightingMoodPreset,
  options?: BuildWgslRelightingOptions,
): string {
  const preset: LightingMoodPreset =
    typeof presetOrId === "string" ? LIGHTING_MOOD_PRESETS[presetOrId] : presetOrId;
  const intensity = clampFinite(options?.intensity ?? 1.0, 0, 1.5);
  const skinAnchor = clampFinite(
    options?.skinAnchorStrength ?? preset.defaultSkinAnchorStrength,
    0,
    1,
  );
  const maxSkinDriftRad =
    clampFinite(options?.maxAllowedSkinHueDriftDeg ?? preset.maxAllowedSkinHueDriftDeg, 4, 45) *
    (Math.PI / 180);
  const wgX = Math.max(1, Math.min(32, Math.floor(options?.workgroupSizeX ?? 8)));
  const wgY = Math.max(1, Math.min(32, Math.floor(options?.workgroupSizeY ?? 8)));

  const lines: readonly string[] = [
    `// Wave 102 WebGPU OKLCH Relighting & Skin-Memory Protection Compute Shader (${preset.id})`,
    "struct RelightUniforms {",
    "  dims_and_intensity: vec4<f32>,",
    "  key_oklch: vec4<f32>,",
    "  ambient_oklch: vec4<f32>,",
    "  rim_oklch: vec4<f32>,",
    "  tone_curve: vec4<f32>,",
    "  skin_guard: vec4<f32>,",
    "};",
    "",
    "@group(0) @binding(0) var<uniform> u_relight: RelightUniforms;",
    "@group(0) @binding(1) var src_tex: texture_2d<f32>;",
    "@group(0) @binding(2) var dst_tex: texture_storage_2d<rgba8unorm, write>;",
    "",
    `const DEFAULT_INTENSITY: f32 = ${fmtWgslFloat(intensity)};`,
    `const DEFAULT_SKIN_ANCHOR: f32 = ${fmtWgslFloat(skinAnchor)};`,
    `const DEFAULT_MAX_SKIN_DRIFT_RAD: f32 = ${fmtWgslFloat(maxSkinDriftRad)};`,
    `const PRESET_KEY_TINT: f32 = ${fmtWgslFloat(preset.keyTintStrength)};`,
    `const PRESET_SHADOW_SHIFT: f32 = ${fmtWgslFloat(preset.shadowShiftStrength)};`,
    `const PRESET_CHROMA_SCALE: f32 = ${fmtWgslFloat(preset.chromaScale)};`,
    `const PRESET_SHADOW_CHROMA_FLOOR: f32 = ${fmtWgslFloat(preset.shadowChromaFloorRatio)};`,
    "const PI: f32 = 3.14159265359;",
    "const TAU: f32 = 6.28318530718;",
    "",
    "fn srgb_to_linear_channel(v: f32) -> f32 {",
    "  let c = clamp(v, 0.0, 1.0);",
    "  return select(pow((c + 0.055) / 1.055, 2.4), c / 12.92, c <= 0.04045);",
    "}",
    "",
    "fn linear_to_srgb_channel(v: f32) -> f32 {",
    "  let c = clamp(v, 0.0, 1.0);",
    "  return select(1.055 * pow(c, 1.0 / 2.4) - 0.055, 12.92 * c, c <= 0.0031308);",
    "}",
    "",
    "fn srgb_to_linear(rgb: vec3<f32>) -> vec3<f32> {",
    "  return vec3<f32>(srgb_to_linear_channel(rgb.x), srgb_to_linear_channel(rgb.y), srgb_to_linear_channel(rgb.z));",
    "}",
    "",
    "fn linear_to_srgb(rgb: vec3<f32>) -> vec3<f32> {",
    "  return vec3<f32>(linear_to_srgb_channel(rgb.x), linear_to_srgb_channel(rgb.y), linear_to_srgb_channel(rgb.z));",
    "}",
    "",
    "fn signed_cbrt(x: f32) -> f32 {",
    "  return sign(x) * pow(abs(x), 1.0 / 3.0);",
    "}",
    "",
    "fn linear_rgb_to_oklab(rgb: vec3<f32>) -> vec3<f32> {",
    "  let l_raw = 0.4122214708 * rgb.x + 0.5363325363 * rgb.y + 0.0514459929 * rgb.z;",
    "  let m_raw = 0.2119034982 * rgb.x + 0.6806995451 * rgb.y + 0.1073969566 * rgb.z;",
    "  let s_raw = 0.0883024619 * rgb.x + 0.2817188376 * rgb.y + 0.6299787005 * rgb.z;",
    "  let l3 = signed_cbrt(l_raw);",
    "  let m3 = signed_cbrt(m_raw);",
    "  let s3 = signed_cbrt(s_raw);",
    "  return vec3<f32>(",
    "    0.2104542553 * l3 + 0.7936177850 * m3 - 0.0040720468 * s3,",
    "    1.9779984951 * l3 - 2.4285922050 * m3 + 0.4505937099 * s3,",
    "    0.0259040371 * l3 + 0.7827717662 * m3 - 0.8086757660 * s3",
    "  );",
    "}",
    "",
    "fn oklab_to_linear_rgb(lab: vec3<f32>) -> vec3<f32> {",
    "  let l3 = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;",
    "  let m3 = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;",
    "  let s3 = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;",
    "  let l_val = l3 * l3 * l3;",
    "  let m_val = m3 * m3 * m3;",
    "  let s_val = s3 * s3 * s3;",
    "  return vec3<f32>(",
    "    4.0767416621 * l_val - 3.3077115913 * m_val + 0.2309699292 * s_val,",
    "    -1.2684380046 * l_val + 2.6097574011 * m_val - 0.3413193965 * s_val,",
    "    -0.0041960863 * l_val - 0.7034186147 * m_val + 1.7076147010 * s_val",
    "  );",
    "}",
    "",
    "fn wrap_angle_diff(from_rad: f32, to_rad: f32) -> f32 {",
    "  var d = to_rad - from_rad;",
    "  if (d > PI) { d = d - TAU; }",
    "  if (d < -PI) { d = d + TAU; }",
    "  return d;",
    "}",
    "",
    "fn compute_skin_memory_mask(lch: vec3<f32>) -> f32 {",
    "  if (lch.x < 0.28 || lch.x > 0.94 || lch.y < 0.025 || lch.y > 0.16) {",
    "    return 0.0;",
    "  }",
    "  let center_rad = 0.9075712;",
    "  let hue_dist = abs(wrap_angle_diff(center_rad, lch.z));",
    "  let max_band = 0.5235988;",
    "  if (hue_dist > max_band) { return 0.0; }",
    "  return clamp(1.0 - hue_dist / max_band, 0.0, 1.0);",
    "}",
    "",
    "fn apply_anti_mud_shadow(base_lch: vec3<f32>, ambient_hue_rad: f32, skin_mask: f32) -> vec3<f32> {",
    "  let shadow_l = clamp(base_lch.x - 0.18 * DEFAULT_INTENSITY, 0.10, 0.82);",
    "  let shift_w = PRESET_SHADOW_SHIFT * (1.0 - skin_mask * DEFAULT_SKIN_ANCHOR) * 0.65;",
    "  let shadow_h = base_lch.z + wrap_angle_diff(base_lch.z, ambient_hue_rad) * shift_w;",
    "  let shadow_c = max(base_lch.y * PRESET_SHADOW_CHROMA_FLOOR, base_lch.y * 0.72);",
    "  return vec3<f32>(shadow_l, shadow_c, shadow_h);",
    "}",
    "",
    "fn gamut_map_oklch_to_linear_rgb(lch: vec3<f32>) -> vec3<f32> {",
    "  let l = clamp(lch.x, 0.0, 1.0);",
    "  let cos_h = cos(lch.z);",
    "  let sin_h = sin(lch.z);",
    "  let raw = oklab_to_linear_rgb(vec3<f32>(l, lch.y * cos_h, lch.y * sin_h));",
    "  if (all(raw >= vec3<f32>(0.0)) && all(raw <= vec3<f32>(1.0))) {",
    "    return raw;",
    "  }",
    "  var low = 0.0;",
    "  var high = lch.y;",
    "  for (var i: u32 = 0u; i < 12u; i = i + 1u) {",
    "    let mid = (low + high) * 0.5;",
    "    let probe = oklab_to_linear_rgb(vec3<f32>(l, mid * cos_h, mid * sin_h));",
    "    if (all(probe >= vec3<f32>(0.0)) && all(probe <= vec3<f32>(1.0))) {",
    "      low = mid;",
    "    } else {",
    "      high = mid;",
    "    }",
    "  }",
    "  return clamp(oklab_to_linear_rgb(vec3<f32>(l, low * cos_h, low * sin_h)), vec3<f32>(0.0), vec3<f32>(1.0));",
    "}",
    "",
    `@compute @workgroup_size(${String(wgX)}, ${String(wgY)}, 1)`,
    "fn main(@builtin(global_invocation_id) gid: vec3<u32>) {",
    "  let width = u32(u_relight.dims_and_intensity.x);",
    "  let height = u32(u_relight.dims_and_intensity.y);",
    "  if (gid.x >= width || gid.y >= height) {",
    "    return;",
    "  }",
    "  let coord = vec2<i32>(i32(gid.x), i32(gid.y));",
    "  let px = textureLoad(src_tex, coord, 0);",
    "  if (px.w <= 0.0001) {",
    "    textureStore(dst_tex, coord, px);",
    "    return;",
    "  }",
    "  let lin = srgb_to_linear(px.xyz);",
    "  let lab = linear_rgb_to_oklab(lin);",
    "  let chroma = sqrt(lab.y * lab.y + lab.z * lab.z);",
    "  let hue = atan2(lab.z, lab.y);",
    "  let base_lch = vec3<f32>(lab.x, chroma, hue);",
    "  let skin_mask = compute_skin_memory_mask(base_lch);",
    "  let adapt = (1.0 - skin_mask * DEFAULT_SKIN_ANCHOR) * PRESET_KEY_TINT;",
    "  let key_a = u_relight.key_oklch.y * cos(u_relight.key_oklch.z);",
    "  let key_b = u_relight.key_oklch.y * sin(u_relight.key_oklch.z);",
    "  let mid_a = lab.y * PRESET_CHROMA_SCALE * (1.0 - adapt * 0.5) + key_a * adapt;",
    "  let mid_b = lab.z * PRESET_CHROMA_SCALE * (1.0 - adapt * 0.5) + key_b * adapt;",
    "  var mid_hue = atan2(mid_b, mid_a);",
    "  if (skin_mask > 0.35) {",
    "    let drift = wrap_angle_diff(hue, mid_hue);",
    "    let bounded = clamp(drift, -DEFAULT_MAX_SKIN_DRIFT_RAD, DEFAULT_MAX_SKIN_DRIFT_RAD);",
    "    mid_hue = hue + bounded;",
    "  }",
    "  let mid_lch = vec3<f32>(clamp(lab.x + u_relight.tone_curve.x, 0.08, 0.95), sqrt(mid_a * mid_a + mid_b * mid_b), mid_hue);",
    "  let sh_lch = apply_anti_mud_shadow(mid_lch, u_relight.ambient_oklch.z, skin_mask);",
    "  let ramp = clamp(f32(gid.x) / max(1.0, u_relight.dims_and_intensity.x), 0.0, 1.0);",
    "  let blended_lch = mix(sh_lch, mid_lch, ramp);",
    "  let out_lin = gamut_map_oklch_to_linear_rgb(blended_lch);",
    "  let out_srgb = linear_to_srgb(out_lin);",
    "  textureStore(dst_tex, coord, vec4<f32>(out_srgb, px.w));",
    "}",
  ];

  return lines.join("\n");
}

/**
 * 생성된 WebGPU WGSL 재조명 셰이더의 구조·바인딩·심볼·구문 무결성을 정적 검증한다.
 */
export function validateColorScriptWgsl(wgslSource: string): WgslValidationResult {
  const errors: string[] = [];
  const trimmed = wgslSource.trim();
  const lines = trimmed.length === 0 ? [] : trimmed.split("\n");

  if (trimmed.length === 0) {
    errors.push("WGSL 소스가 비어 있습니다.");
  }

  if (/\b(?:NaN|Infinity|undefined)\b/.test(wgslSource)) {
    errors.push("WGSL 소스에 비유한 수치(NaN/Infinity/undefined)가 포함되어 있습니다.");
  }

  let braceDepth = 0;
  let parenDepth = 0;
  for (let i = 0; i < wgslSource.length; i += 1) {
    const ch = wgslSource[i];
    if (ch === "{") {
      braceDepth += 1;
    } else if (ch === "}") {
      braceDepth -= 1;
      if (braceDepth < 0) {
        errors.push("닫는 중괄호 '}'가 여는 중괄호보다 많습니다.");
        break;
      }
    } else if (ch === "(") {
      parenDepth += 1;
    } else if (ch === ")") {
      parenDepth -= 1;
      if (parenDepth < 0) {
        errors.push("닫는 소괄호 ')'가 여는 소괄호보다 많습니다.");
        break;
      }
    }
  }
  if (braceDepth !== 0) {
    errors.push(`중괄호 짝이 맞지 않습니다(잔여 깊이: ${String(braceDepth)}).`);
  }
  if (parenDepth !== 0) {
    errors.push(`소괄호 짝이 맞지 않습니다(잔여 깊이: ${String(parenDepth)}).`);
  }

  const requiredTokens: ReadonlyArray<{ readonly token: string; readonly label: string }> = [
    { token: "struct RelightUniforms", label: "RelightUniforms 유니폼 구조체" },
    { token: "@group(0) @binding(0)", label: "유니폼 바인딩(0)" },
    { token: "@group(0) @binding(1)", label: "입력 텍스처 바인딩(1)" },
    { token: "@group(0) @binding(2)", label: "출력 스토리지 텍스처 바인딩(2)" },
    { token: "fn linear_rgb_to_oklab", label: "Oklab 정변환 함수" },
    { token: "fn oklab_to_linear_rgb", label: "Oklab 역변환 함수" },
    { token: "fn compute_skin_memory_mask", label: "피부 기억색 보호 마스크 함수" },
    { token: "fn apply_anti_mud_shadow", label: "Anti-Mud 암부 색이동 함수" },
    { token: "fn gamut_map_oklch_to_linear_rgb", label: "색상각 보존 색역 매핑 함수" },
    { token: "@compute @workgroup_size(", label: "컴퓨트 워크그룹 선언" },
  ];

  for (let i = 0; i < requiredTokens.length; i += 1) {
    const req = requiredTokens[i];
    if (wgslSource.indexOf(req.token) === -1) {
      errors.push(`필수 WGSL 구성 요소가 누락되었습니다: ${req.label} (${req.token}).`);
    }
  }

  const entryPoints: string[] = [];
  const entryRegex = /@compute\s+@workgroup_size\([^)]+\)\s*\n?\s*fn\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let match = entryRegex.exec(wgslSource);
  while (match !== null) {
    entryPoints.push(match[1]);
    match = entryRegex.exec(wgslSource);
  }
  if (entryPoints.length === 0) {
    errors.push("컴퓨트 셰이더 진입점(`@compute ... fn ...`)을 찾을 수 없습니다.");
  }

  return {
    valid: errors.length === 0,
    errors,
    lineCount: lines.length,
    entryPoints,
  };
}
