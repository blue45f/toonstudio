/**
 * Wave 151 — WebGPU WGSL 인테리어 패럴랙스 창문(Ray-Box Interior Mapping) ·
 * 창문 블라인드 마스크 · 네온 블룸 · 거리 대기 안개 파사드 셰이더 생성 및 구조 검증기.
 */

import {
  clampFinite,
  formatSafeDecimal,
  getCityscapeMoodPreset,
  type CityscapeNightMoodId,
} from "./cityscape-night-types";
import {
  kelvinToOklch,
  oklchToLinearRgb,
  sha256Utf8Hex,
} from "./night-color-harmony-and-atmosphere";

export interface CityscapeNightFacadeWgslOptions {
  readonly defaultRoomDepthM?: number;
  readonly extinctionBeta?: number;
  readonly focusStartMeters?: number;
  readonly neonBloomGain?: number;
  readonly wetReflectionGain?: number;
  readonly blindSlatDensity?: number;
}

export interface CityscapeWgslBindingDescriptor {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: "uniform" | "storage-read";
}

export interface CityscapeNightFacadeWgslArtifact {
  readonly moodId: CityscapeNightMoodId;
  readonly wgsl: string;
  readonly uniformStructName: "CityscapeFacadeUniforms";
  readonly uniformBufferByteLength: number;
  readonly uniformAlignmentBytes: number;
  readonly bindings: readonly CityscapeWgslBindingDescriptor[];
  readonly entryPoints: readonly string[];
  readonly wgslSha256Hex: string;
}

export interface CityscapeNightFacadeWgslValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly lineCount: number;
  readonly entryPointCount: number;
  readonly bindingCount: number;
  readonly uniformBufferByteLength: number | null;
  readonly isUniform16ByteAligned: boolean;
}

const UNIFORM_STRUCT_NAME = "CityscapeFacadeUniforms";
const UNIFORM_BYTE_LENGTH = 80;
const UNIFORM_ALIGNMENT_BYTES = 16;

/**
 * 16바이트 정렬 유니폼(80B), Ray-Box 실내 방 깊이 투영(Interior Mapping),
 * 창문 블라인드 마스크, 네온 블룸 및 Beer-Lambert 거리 대기 안개 WGSL 셰이더를 생성한다.
 */
export function buildCityscapeNightFacadeWgsl(
  moodId: CityscapeNightMoodId,
  options?: CityscapeNightFacadeWgslOptions,
): CityscapeNightFacadeWgslArtifact {
  const preset = getCityscapeMoodPreset(moodId);
  const roomDepthM = clampFinite(options?.defaultRoomDepthM ?? 3.8, 2.0, 6.0, 3.8);
  const extinctionBeta = clampFinite(
    options?.extinctionBeta ?? preset.atmosphericExtinctionBeta,
    0.0005,
    0.25,
    preset.atmosphericExtinctionBeta,
  );
  const focusStartM = clampFinite(options?.focusStartMeters ?? 14.0, 2.0, 80.0, 14.0);
  const neonBloomGain = clampFinite(
    options?.neonBloomGain ?? preset.neonBloomStrength,
    0.05,
    2.0,
    preset.neonBloomStrength,
  );
  const wetGain = clampFinite(
    options?.wetReflectionGain ?? preset.wetRoadReflectionGain,
    0.0,
    1.5,
    preset.wetRoadReflectionGain,
  );
  const blindSlats = clampFinite(options?.blindSlatDensity ?? 18.0, 4.0, 64.0, 18.0);

  const hazeRgb = oklchToLinearRgb(preset.hazeOklch);
  const moonRgb = oklchToLinearRgb(kelvinToOklch(preset.moonlightKelvin));

  const bindings: readonly CityscapeWgslBindingDescriptor[] = [
    { group: 0, binding: 0, name: "u_facade", addressSpace: "uniform" },
    { group: 0, binding: 1, name: "b_windows", addressSpace: "storage-read" },
    { group: 0, binding: 2, name: "b_neons", addressSpace: "storage-read" },
  ];

  const wgsl = `// Wave 151 Procedural Cityscape Night Interior Parallax & Neon Bloom Facade WGSL
// Mood preset: ${preset.id} (mode=${preset.shaderModeId})

struct CityscapeFacadeUniforms {
  viewport_and_hour: vec4<f32>,
  camera_and_depth: vec4<f32>,
  atmosphere_params: vec4<f32>,
  haze_rgb_and_strength: vec4<f32>,
  moonlight_rgb_and_mode: vec4<f32>,
};

struct WindowCellRecord {
  uv_bounds: vec4<f32>,
  depth_blind_kelvin_lit: vec4<f32>,
  interior_rgb_and_style: vec4<f32>,
};

struct NeonSignRecord {
  bounds_xywh: vec4<f32>,
  neon_rgb_and_bloom: vec4<f32>,
};

struct FacadeVertexOut {
  @builtin(position) clip_pos: vec4<f32>,
  @location(0) screen_uv: vec2<f32>,
};

@group(0) @binding(0) var<uniform> u_facade: CityscapeFacadeUniforms;
@group(0) @binding(1) var<storage, read> b_windows: array<WindowCellRecord>;
@group(0) @binding(2) var<storage, read> b_neons: array<NeonSignRecord>;

const DEFAULT_ROOM_DEPTH_M: f32 = ${formatSafeDecimal(roomDepthM, 3)};
const DEFAULT_EXTINCTION_BETA: f32 = ${formatSafeDecimal(extinctionBeta, 5)};
const DEFAULT_FOCUS_START_M: f32 = ${formatSafeDecimal(focusStartM, 3)};
const DEFAULT_NEON_BLOOM_GAIN: f32 = ${formatSafeDecimal(neonBloomGain, 3)};
const DEFAULT_WET_GAIN: f32 = ${formatSafeDecimal(wetGain, 3)};
const DEFAULT_BLIND_SLATS: f32 = ${formatSafeDecimal(blindSlats, 2)};
const DEFAULT_HAZE_RGB: vec3<f32> = vec3<f32>(${formatSafeDecimal(hazeRgb.r, 4)}, ${formatSafeDecimal(hazeRgb.g, 4)}, ${formatSafeDecimal(hazeRgb.b, 4)});
const DEFAULT_MOON_RGB: vec3<f32> = vec3<f32>(${formatSafeDecimal(moonRgb.r, 4)}, ${formatSafeDecimal(moonRgb.g, 4)}, ${formatSafeDecimal(moonRgb.b, 4)});

fn ray_box_interior_mapping(win_uv: vec2<f32>, view_dir: vec3<f32>, room_depth: f32) -> vec3<f32> {
  let local_p = vec3<f32>(win_uv.x * 2.0 - 1.0, win_uv.y * 2.0 - 1.0, 0.0);
  let safe_dir = vec3<f32>(
    select(view_dir.x, 1e-4, abs(view_dir.x) < 1e-4),
    select(view_dir.y, 1e-4, abs(view_dir.y) < 1e-4),
    -max(abs(view_dir.z), 0.25)
  );
  let depth_norm = clamp(room_depth / 3.0, 0.65, 2.2);
  let tx = (select(-1.0, 1.0, safe_dir.x > 0.0) - local_p.x) / safe_dir.x;
  let ty = (select(-1.0, 1.0, safe_dir.y > 0.0) - local_p.y) / safe_dir.y;
  let tz = (-depth_norm - local_p.z) / safe_dir.z;

  let t_hit = min(min(max(tx, 0.0), max(ty, 0.0)), max(tz, 0.0));
  let hit_pos = local_p + safe_dir * t_hit;

  let is_ceiling = select(0.0, 1.0, ty <= tx && ty <= tz && safe_dir.y > 0.0);
  let is_back = select(0.0, 1.0, tz <= tx && tz <= ty);
  let ceiling_lamp = smoothstep(0.65, 0.12, length(hit_pos.xz - vec2<f32>(0.0, -depth_norm * 0.45)));
  let wall_shade = 0.52 + 0.34 * is_back + 0.45 * is_ceiling * ceiling_lamp;
  let depth_falloff = exp(-t_hit * 0.28);
  return vec3<f32>(hit_pos.x * 0.5 + 0.5, hit_pos.y * 0.5 + 0.5, clamp(wall_shade * depth_falloff, 0.12, 1.25));
}

fn window_blind_mask(win_uv_y: f32, closure_ratio: f32, slat_density: f32) -> f32 {
  let clamped_closure = clamp(closure_ratio, 0.0, 0.85);
  if (win_uv_y > clamped_closure) {
    return 1.0;
  }
  let slat_wave = 0.5 + 0.5 * sin(win_uv_y * max(slat_density, 4.0) * 6.2831853);
  return mix(0.18, 0.48, slat_wave);
}

fn neon_bloom_glow(frag_xy: vec2<f32>, sign_bounds: vec4<f32>, bloom_radius: f32) -> f32 {
  let center = sign_bounds.xy + sign_bounds.zw * 0.5;
  let half_ext = max(sign_bounds.zw * 0.5, vec2<f32>(1.0, 1.0));
  let q = abs(frag_xy - center) - half_ext;
  let outside_dist = length(max(q, vec2<f32>(0.0, 0.0)));
  let radius = max(bloom_radius, 2.0);
  return exp(-(outside_dist * outside_dist) / (2.0 * radius * radius));
}

fn atmospheric_distance_fog(
  base_rgb: vec3<f32>,
  haze_rgb: vec3<f32>,
  depth_m: f32,
  beta: f32,
  focus_start_m: f32
) -> vec3<f32> {
  let eff_dist = max(0.0, depth_m - focus_start_m);
  let transmittance = clamp(exp(-max(beta, 0.0001) * eff_dist), 0.14, 1.0);
  return mix(haze_rgb, base_rgb, transmittance);
}

@vertex
fn vs_cityscape_facade(@builtin(vertex_index) vid: u32) -> FacadeVertexOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  let pos = positions[vid % 3u];
  var out: FacadeVertexOut;
  out.clip_pos = vec4<f32>(pos, 0.0, 1.0);
  out.screen_uv = pos * 0.5 + vec2<f32>(0.5, 0.5);
  return out;
}

@fragment
fn fs_cityscape_facade(in: FacadeVertexOut) -> @location(0) vec4<f32> {
  let vp = max(u_facade.viewport_and_hour.xy, vec2<f32>(160.0, 160.0));
  let frag_xy = in.screen_uv * vp;
  let cam_xy = u_facade.camera_and_depth.xy;
  let room_depth_default = select(DEFAULT_ROOM_DEPTH_M, u_facade.camera_and_depth.w, u_facade.camera_and_depth.w >= 2.0);
  let beta = select(DEFAULT_EXTINCTION_BETA, u_facade.atmosphere_params.x, u_facade.atmosphere_params.x > 0.0);
  let focus_start = select(DEFAULT_FOCUS_START_M, u_facade.atmosphere_params.y, u_facade.atmosphere_params.y > 0.0);
  let bloom_gain = select(DEFAULT_NEON_BLOOM_GAIN, u_facade.atmosphere_params.z, u_facade.atmosphere_params.z > 0.0);
  let wet_gain = select(DEFAULT_WET_GAIN, u_facade.atmosphere_params.w, u_facade.atmosphere_params.w >= 0.0);

  let haze_rgb = select(DEFAULT_HAZE_RGB, u_facade.haze_rgb_and_strength.xyz, length(u_facade.haze_rgb_and_strength.xyz) > 0.001);
  let moon_rgb = select(DEFAULT_MOON_RGB, u_facade.moonlight_rgb_and_mode.xyz, length(u_facade.moonlight_rgb_and_mode.xyz) > 0.001);

  var color = mix(haze_rgb * 0.65, moon_rgb * 0.22 + haze_rgb * 0.45, clamp(in.screen_uv.y, 0.0, 1.0));
  let win_count = arrayLength(&b_windows);
  for (var i: u32 = 0u; i < win_count; i = i + 1u) {
    let w = b_windows[i];
    if (
      in.screen_uv.x >= w.uv_bounds.x &&
      in.screen_uv.x <= w.uv_bounds.z &&
      in.screen_uv.y >= w.uv_bounds.y &&
      in.screen_uv.y <= w.uv_bounds.w
    ) {
      let local_uv = (in.screen_uv - w.uv_bounds.xy) / max(w.uv_bounds.zw - w.uv_bounds.xy, vec2<f32>(1e-4, 1e-4));
      let depth_m = select(room_depth_default, w.depth_blind_kelvin_lit.x, w.depth_blind_kelvin_lit.x >= 2.0);
      let view_dir = normalize(vec3<f32>((in.screen_uv.x - 0.5) - cam_xy.x * 0.45, (in.screen_uv.y - 0.5) - cam_xy.y * 0.45, -1.0));
      let interior = ray_box_interior_mapping(local_uv, view_dir, depth_m);
      let blind = window_blind_mask(local_uv.y, w.depth_blind_kelvin_lit.y, DEFAULT_BLIND_SLATS);
      let lit_weight = clamp(w.depth_blind_kelvin_lit.w, 0.0, 1.0);
      let room_rgb = w.interior_rgb_and_style.xyz * interior.z * blind * lit_weight;
      color = mix(color * 0.55, room_rgb, max(0.18, lit_weight));
    }
  }

  let neon_count = arrayLength(&b_neons);
  for (var j: u32 = 0u; j < neon_count; j = j + 1u) {
    let n = b_neons[j];
    let glow = neon_bloom_glow(frag_xy, n.bounds_xywh, max(n.neon_rgb_and_bloom.w, 4.0));
    color = color + n.neon_rgb_and_bloom.xyz * glow * bloom_gain * 0.65;
  }

  let wet_horizon = smoothstep(0.22, 0.0, in.screen_uv.y) * wet_gain * 0.25;
  color = color + haze_rgb * wet_horizon;
  let fogged = atmospheric_distance_fog(color, haze_rgb, max(u_facade.camera_and_depth.z, 18.0), beta, focus_start);
  return vec4<f32>(clamp(fogged, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

  return {
    moodId,
    wgsl,
    uniformStructName: UNIFORM_STRUCT_NAME,
    uniformBufferByteLength: UNIFORM_BYTE_LENGTH,
    uniformAlignmentBytes: UNIFORM_ALIGNMENT_BYTES,
    bindings,
    entryPoints: ["vs_cityscape_facade", "fs_cityscape_facade"],
    wgslSha256Hex: sha256Utf8Hex(wgsl),
  };
}

function measureWgslFieldLayout(typeText: string): { readonly size: number; readonly align: number } | null {
  const cleaned = typeText.replace(/\s+/gu, "");
  if (cleaned === "f32" || cleaned === "i32" || cleaned === "u32") {
    return { size: 4, align: 4 };
  }
  if (/^vec2<(?:f32|i32|u32)>$/u.test(cleaned)) {
    return { size: 8, align: 8 };
  }
  if (/^vec3<(?:f32|i32|u32)>$/u.test(cleaned)) {
    return { size: 12, align: 16 };
  }
  if (/^vec4<(?:f32|i32|u32)>$/u.test(cleaned)) {
    return { size: 16, align: 16 };
  }
  if (cleaned === "mat4x4<f32>") {
    return { size: 64, align: 16 };
  }
  return null;
}

function parseUniformStructBytes(wgsl: string, structName: string): {
  readonly byteLength: number | null;
  readonly alignmentErrors: readonly string[];
} {
  const headerToken = `struct ${structName}`;
  const startIdx = wgsl.indexOf(headerToken);
  if (startIdx < 0) {
    return { byteLength: null, alignmentErrors: [`유니폼 구조체 '${structName}' 선언이 없습니다.`] };
  }
  const openBrace = wgsl.indexOf("{", startIdx);
  const closeBrace = wgsl.indexOf("}", openBrace);
  if (openBrace < 0 || closeBrace < 0) {
    return { byteLength: null, alignmentErrors: [`유니폼 구조체 '${structName}' 본문이 닫히지 않았습니다.`] };
  }

  const body = wgsl.slice(openBrace + 1, closeBrace);
  const lines = body
    .split(",")
    .map((part) => part.replace(/\/\/[^\n]*/gu, "").trim())
    .filter((part) => part.length > 0);

  if (lines.length === 0) {
    return { byteLength: null, alignmentErrors: [`유니폼 구조체 '${structName}' 필드가 비어 있습니다.`] };
  }

  const alignmentErrors: string[] = [];
  let offset = 0;
  for (const fieldLine of lines) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([^,;]+)$/u.exec(fieldLine);
    if (!match) {
      alignmentErrors.push(`유니폼 필드 문법을 해석할 수 없습니다: ${fieldLine}`);
      continue;
    }
    const fieldName = match[1] ?? "unknown";
    const fieldType = match[2] ?? "";
    const layout = measureWgslFieldLayout(fieldType);
    if (!layout) {
      alignmentErrors.push(`지원되지 않는 WGSL 유니폼 필드 타입(${fieldName}: ${fieldType})입니다.`);
      continue;
    }
    if (offset % layout.align !== 0) {
      alignmentErrors.push(
        `유니폼 필드 '${fieldName}' 오프셋(${offset}B)이 ${layout.align}바이트 정렬 경계와 어긋납니다.`,
      );
      offset = Math.ceil(offset / layout.align) * layout.align;
    }
    offset += layout.size;
  }

  if (offset % 16 !== 0) {
    alignmentErrors.push(
      `유니폼 구조체 '${structName}' 전체 크기(${offset}B)가 16바이트 배수가 아닙니다.`,
    );
  }

  return { byteLength: offset, alignmentErrors };
}

/**
 * WGSL 괄호 균형, 바인딩 유일성, 16바이트 유니폼 정렬, 진입점 및 GLSL 금지어를 검증한다.
 */
export function validateCityscapeNightFacadeWgsl(
  wgsl: string,
  expectedUniformByteLength?: number,
): CityscapeNightFacadeWgslValidation {
  const errors: string[] = [];
  const trimmed = wgsl.trim();
  const lineCount = trimmed.length === 0 ? 0 : trimmed.split("\n").length;

  if (trimmed.length === 0) {
    return {
      valid: false,
      errors: ["WGSL 셰이더 본문이 비어 있습니다."],
      lineCount: 0,
      entryPointCount: 0,
      bindingCount: 0,
      uniformBufferByteLength: null,
      isUniform16ByteAligned: false,
    };
  }

  // 1) 괄호·중괄호·대괄호 균형 검사 (주석 제외)
  const stripped = wgsl.replace(/\/\/[^\n]*/gu, "");
  const stack: string[] = [];
  const pairs: Readonly<Record<string, string>> = { ")": "(", "}": "{", "]": "[" };
  for (let i = 0; i < stripped.length; i += 1) {
    const ch = stripped[i] ?? "";
    if (ch === "(" || ch === "{" || ch === "[") {
      stack.push(ch);
    } else if (ch === ")" || ch === "}" || ch === "]") {
      const top = stack.pop();
      if (top !== pairs[ch]) {
        errors.push(`WGSL 괄호 짝이 맞지 않습니다: '${ch}'`);
        break;
      }
    }
  }
  if (stack.length > 0) {
    errors.push(`닫히지 않은 WGSL 괄호가 ${stack.length}개 남아 있습니다.`);
  }

  // 2) 바인딩 선언 및 중복 검사
  const bindingRegex = /@group\(\s*(\d+)\s*\)\s*@binding\(\s*(\d+)\s*\)/gu;
  const seenBindings = new Set<string>();
  let bindingCount = 0;
  let match: RegExpExecArray | null = bindingRegex.exec(stripped);
  while (match !== null) {
    bindingCount += 1;
    const key = `${match[1]}:${match[2]}`;
    if (seenBindings.has(key)) {
      errors.push(`중복 바인딩이 발견되었습니다: @group(${match[1]}) @binding(${match[2]})`);
    } else {
      seenBindings.add(key);
    }
    match = bindingRegex.exec(stripped);
  }
  if (bindingCount === 0) {
    errors.push("@group/@binding 선언이 하나도 없습니다.");
  }

  // 3) 16바이트 유니폼 정렬 검증
  const uniformCheck = parseUniformStructBytes(wgsl, UNIFORM_STRUCT_NAME);
  for (const err of uniformCheck.alignmentErrors) {
    errors.push(err);
  }
  if (
    expectedUniformByteLength !== undefined &&
    uniformCheck.byteLength !== null &&
    uniformCheck.byteLength !== expectedUniformByteLength
  ) {
    errors.push(
      `유니폼 크기 불일치: 기대 ${expectedUniformByteLength}B, 실제 ${uniformCheck.byteLength}B`,
    );
  }
  const isUniform16ByteAligned =
    uniformCheck.byteLength !== null &&
    uniformCheck.byteLength > 0 &&
    uniformCheck.byteLength % 16 === 0 &&
    uniformCheck.alignmentErrors.length === 0;

  // 4) 진입점 및 핵심 함수 확인
  const vertexMatches = stripped.match(/@vertex\b/gu) ?? [];
  const fragmentMatches = stripped.match(/@fragment\b/gu) ?? [];
  const entryPointCount = vertexMatches.length + fragmentMatches.length;
  if (vertexMatches.length === 0) {
    errors.push("@vertex 진입점이 없습니다.");
  }
  if (fragmentMatches.length === 0) {
    errors.push("@fragment 진입점이 없습니다.");
  }
  if (!stripped.includes("ray_box_interior_mapping")) {
    errors.push("Ray-Box 인테리어 매핑 함수(ray_box_interior_mapping)가 누락되었습니다.");
  }
  if (!stripped.includes("window_blind_mask")) {
    errors.push("창문 블라인드 마스크 함수(window_blind_mask)가 누락되었습니다.");
  }
  if (!stripped.includes("atmospheric_distance_fog")) {
    errors.push("거리 대기 안개 함수(atmospheric_distance_fog)가 누락되었습니다.");
  }

  // 5) GLSL 금지어 및 NaN/Infinity 검출
  const forbiddenPatterns: readonly { readonly label: string; readonly regex: RegExp }[] = [
    { label: "gl_FragCoord", regex: /\bgl_FragCoord\b/u },
    { label: "gl_Position", regex: /\bgl_Position\b/u },
    { label: "sampler2D", regex: /\bsampler2D\b/u },
    { label: "texture2D", regex: /\btexture2D\b/u },
    { label: "precision", regex: /\bprecision\s+(?:lowp|mediump|highp)\b/u },
    { label: "layout(", regex: /\blayout\s*\(/u },
    { label: "GLSL uniform", regex: /\buniform\s+[A-Za-z_]/u },
    { label: "GLSL varying/attribute", regex: /\b(?:varying|attribute)\s+[A-Za-z_]/u },
    { label: "bare GLSL vec constructor", regex: /\bvec[234]\s*\(/u },
    { label: "NaN/Infinity literal", regex: /\b(?:NaN|Infinity)\b/u },
  ];

  for (const rule of forbiddenPatterns) {
    if (rule.regex.test(stripped)) {
      errors.push(`WGSL 금지 토큰(${rule.label})이 포함되어 있습니다.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    lineCount,
    entryPointCount,
    bindingCount,
    uniformBufferByteLength: uniformCheck.byteLength,
    isUniform16ByteAligned,
  };
}
