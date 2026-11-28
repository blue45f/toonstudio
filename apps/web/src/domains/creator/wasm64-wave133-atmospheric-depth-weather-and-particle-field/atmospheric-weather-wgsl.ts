/**
 * Wave 133 — WebGPU WGSL Beer-Lambert 대기 산란·3-심도 보케 파티클·
 * 주인공 얼굴·말풍선 금지 박스 컬링 셰이더 생성 및 구조 검증기.
 */

import {
  clampFinite,
  formatSafeDecimal,
  getWeatherPreset,
  sha256Wave133Hex,
  type WeatherPresetId,
} from "./atmospheric-weather-types";

export interface AtmosphericWeatherWgslOptions {
  readonly extinctionBeta?: number;
  readonly focusStartMeters?: number;
  readonly focalDepthMeters?: number;
  readonly windX?: number;
  readonly windY?: number;
  readonly prefersReducedMotion?: boolean;
}

export interface AtmosphericWgslBindingDescriptor {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: "uniform" | "storage-read" | "storage-read-write";
}

export interface AtmosphericWeatherWgslArtifact {
  readonly presetId: WeatherPresetId;
  readonly wgsl: string;
  readonly uniformBufferByteLength: number;
  readonly uniformAlignmentBytes: number;
  readonly bindings: readonly AtmosphericWgslBindingDescriptor[];
  readonly entryPoints: readonly string[];
  readonly wgslSha256Hex: string;
}

export interface AtmosphericWeatherWgslValidation {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly lineCount: number;
  readonly entryPointCount: number;
  readonly bindingCount: number;
  readonly uniformBufferByteLength: number | null;
}

const UNIFORM_BYTE_LENGTH = 64;
const UNIFORM_ALIGNMENT_BYTES = 16;

/**
 * 5종 웹툰 날씨 프리셋에 맞춘 64바이트(16바이트 정렬) 유니폼, `@compute` 바람·중력 이류 및
 * 얼굴·말풍선 금지 박스 선분 컬링, `@fragment` Beer-Lambert 안개·보케 합성 WGSL을 생성한다.
 */
export function buildAtmosphericWeatherWgsl(
  presetId: WeatherPresetId,
  options?: AtmosphericWeatherWgslOptions,
): AtmosphericWeatherWgslArtifact {
  const preset = getWeatherPreset(presetId);
  const extinctionBeta = clampFinite(
    options?.extinctionBeta ?? preset.defaultExtinctionBeta,
    0.001,
    5.0,
    preset.defaultExtinctionBeta,
  );
  const focusStartM = clampFinite(
    options?.focusStartMeters ?? preset.defaultFocusStartMeters,
    0.5,
    10.0,
    preset.defaultFocusStartMeters,
  );
  const focalDepthM = clampFinite(
    options?.focalDepthMeters ?? preset.defaultFocalDepthMeters,
    2.4,
    5.8,
    preset.defaultFocalDepthMeters,
  );
  const windX = clampFinite(options?.windX ?? preset.defaultWindX, -800, 800, preset.defaultWindX);
  const windY = clampFinite(options?.windY ?? preset.defaultWindY, -600, 600, preset.defaultWindY);
  const reducedMotionFlag = options?.prefersReducedMotion ? 1.0 : 0.0;

  const bindings: readonly AtmosphericWgslBindingDescriptor[] = [
    { group: 0, binding: 0, name: "u_weather", addressSpace: "uniform" },
    { group: 0, binding: 1, name: "b_particles", addressSpace: "storage-read-write" },
    { group: 0, binding: 2, name: "b_keepout_boxes", addressSpace: "storage-read" },
    { group: 0, binding: 3, name: "b_scene_depth", addressSpace: "storage-read" },
  ];

  const wgsl = `// Wave 133 Atmospheric Depth + Beer-Lambert Fog + Keep-Out Weather Particle WGSL
// Preset: ${preset.id} (shape_mode=${preset.shaderShapeMode})
struct AtmosphericWeatherUniforms {
  viewport_and_time: vec4<f32>,
  wind_and_gravity: vec4<f32>,
  optics_and_fog: vec4<f32>,
  fog_color_and_mode: vec4<f32>,
};

struct WeatherParticleRecord {
  pos_depth_radius: vec4<f32>,
  vel_blur_alpha: vec4<f32>,
  streak_and_layer: vec4<f32>,
};

struct KeepOutBoxRecord {
  min_max_xy: vec4<f32>,
  pad_and_kind: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u_weather: AtmosphericWeatherUniforms;
@group(0) @binding(1) var<storage, read_write> b_particles: array<WeatherParticleRecord>;
@group(0) @binding(2) var<storage, read> b_keepout_boxes: array<KeepOutBoxRecord>;
@group(0) @binding(3) var<storage, read> b_scene_depth: array<vec4<f32>>;

const DEFAULT_EXTINCTION_BETA: f32 = ${formatSafeDecimal(extinctionBeta, 5)};
const DEFAULT_FOCUS_START_M: f32 = ${formatSafeDecimal(focusStartM, 3)};
const DEFAULT_FOCAL_DEPTH_M: f32 = ${formatSafeDecimal(focalDepthM, 3)};
const DEFAULT_WIND_X: f32 = ${formatSafeDecimal(windX, 3)};
const DEFAULT_WIND_Y: f32 = ${formatSafeDecimal(windY, 3)};
const DEFAULT_GRAVITY_Y: f32 = ${formatSafeDecimal(preset.baseGravityPxPerSec, 3)};
const DEFAULT_BOKEH_GAIN: f32 = ${formatSafeDecimal(preset.bokehApertureGain, 3)};
const DEFAULT_REDUCED_MOTION: f32 = ${formatSafeDecimal(reducedMotionFlag, 1)};
const DEFAULT_SHAPE_MODE: f32 = ${formatSafeDecimal(preset.shaderShapeMode, 1)};
const DEFAULT_FOG_RGB: vec3<f32> = vec3<f32>(${formatSafeDecimal(preset.fogLinearRgb[0], 4)}, ${formatSafeDecimal(preset.fogLinearRgb[1], 4)}, ${formatSafeDecimal(preset.fogLinearRgb[2], 4)});

fn beer_lambert_transmittance(depth_m: f32, beta: f32, focus_start_m: f32) -> f32 {
  let eff_dist = max(0.0, depth_m - focus_start_m);
  let optical_depth = min(50.0, max(0.0, beta) * eff_dist);
  return exp(-optical_depth);
}

fn segment_hits_keepout(p0: vec2<f32>, p1: vec2<f32>, b_min: vec2<f32>, b_max: vec2<f32>) -> bool {
  let d = p1 - p0;
  var t0: f32 = 0.0;
  var t1: f32 = 1.0;

  if (abs(d.x) < 1e-6) {
    if (p0.x < b_min.x || p0.x > b_max.x) { return false; }
  } else {
    let inv_x = 1.0 / d.x;
    let tx0 = (b_min.x - p0.x) * inv_x;
    let tx1 = (b_max.x - p0.x) * inv_x;
    t0 = max(t0, min(tx0, tx1));
    t1 = min(t1, max(tx0, tx1));
  }

  if (abs(d.y) < 1e-6) {
    if (p0.y < b_min.y || p0.y > b_max.y) { return false; }
  } else {
    let inv_y = 1.0 / d.y;
    let ty0 = (b_min.y - p0.y) * inv_y;
    let ty1 = (b_max.y - p0.y) * inv_y;
    t0 = max(t0, min(ty0, ty1));
    t1 = min(t1, max(ty0, ty1));
  }

  return t0 <= t1 && t1 >= 0.0 && t0 <= 1.0;
}

@compute @workgroup_size(64, 1, 1)
fn cs_advect_and_cull_weather(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let count = arrayLength(&b_particles);
  if (idx >= count) { return; }

  var rec = b_particles[idx];
  let vp_w = max(u_weather.viewport_and_time.x, 160.0);
  let vp_h = max(u_weather.viewport_and_time.y, 160.0);
  let reduced = max(u_weather.viewport_and_time.w, DEFAULT_REDUCED_MOTION);
  let dt = select(clamp(u_weather.viewport_and_time.z, 0.0, 0.25), 0.0, reduced > 0.5);

  let depth_m = max(rec.pos_depth_radius.z, 0.8);
  let focal_m = select(DEFAULT_FOCAL_DEPTH_M, u_weather.optics_and_fog.z, u_weather.optics_and_fog.z > 0.5);
  let parallax = clamp(focal_m / depth_m, 0.28, 2.25);

  let wind_x = select(DEFAULT_WIND_X, u_weather.wind_and_gravity.x, abs(u_weather.wind_and_gravity.x) > 1e-4);
  let wind_y = select(DEFAULT_WIND_Y, u_weather.wind_and_gravity.y, abs(u_weather.wind_and_gravity.y) > 1e-4);
  let gravity_y = select(DEFAULT_GRAVITY_Y, u_weather.wind_and_gravity.z, abs(u_weather.wind_and_gravity.z) > 1e-4);
  let motion_scale = select(1.0, 0.35, reduced > 0.5);

  let vel = vec2<f32>(wind_x, gravity_y + wind_y) * parallax * motion_scale;
  var pos = rec.pos_depth_radius.xy + vel * dt;
  pos.x = pos.x - floor(pos.x / vp_w) * vp_w;
  pos.y = pos.y - floor(pos.y / vp_h) * vp_h;

  let speed = max(length(vel), 1e-3);
  let dir = vel / speed;
  let half_streak = select(min(rec.streak_and_layer.x * 0.5, 70.0), min(rec.streak_and_layer.x * 0.5, 10.0), reduced > 0.5);
  let p0 = pos - dir * half_streak;
  let p1 = pos + dir * half_streak;
  let pad_r = rec.pos_depth_radius.w + rec.vel_blur_alpha.z * 0.25;

  let box_count = arrayLength(&b_keepout_boxes);
  var occluded = false;
  for (var b: u32 = 0u; b < box_count; b = b + 1u) {
    let kb = b_keepout_boxes[b];
    let expand = vec2<f32>(kb.pad_and_kind.x + pad_r, kb.pad_and_kind.x + pad_r);
    if (segment_hits_keepout(p0, p1, kb.min_max_xy.xy - expand, kb.min_max_xy.zw + expand)) {
      occluded = true;
      break;
    }
  }

  let coc = abs(depth_m - focal_m) / depth_m;
  let bokeh_gain = select(DEFAULT_BOKEH_GAIN, u_weather.optics_and_fog.w, u_weather.optics_and_fog.w > 0.0);
  let blur_px = clamp(coc * bokeh_gain, 0.08, 11.5);

  rec.pos_depth_radius = vec4<f32>(pos.x, pos.y, depth_m, rec.pos_depth_radius.w);
  rec.vel_blur_alpha = vec4<f32>(vel.x, vel.y, blur_px, select(rec.vel_blur_alpha.w, 0.0, occluded));
  b_particles[idx] = rec;
}

@fragment
fn fs_composite_atmospheric_weather(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let width = max(u32(u_weather.viewport_and_time.x), 1u);
  let height = max(u32(u_weather.viewport_and_time.y), 1u);
  let px = min(u32(frag_coord.x), width - 1u);
  let py = min(u32(frag_coord.y), height - 1u);
  let sample_idx = min(py * width + px, max(arrayLength(&b_scene_depth), 1u) - 1u);
  let scene_sample = b_scene_depth[sample_idx];

  let depth_m = max(scene_sample.w, 0.8);
  let beta = select(DEFAULT_EXTINCTION_BETA, u_weather.optics_and_fog.x, u_weather.optics_and_fog.x > 0.0);
  let focus_start = select(DEFAULT_FOCUS_START_M, u_weather.optics_and_fog.y, u_weather.optics_and_fog.y > 0.0);
  let transmittance = beer_lambert_transmittance(depth_m, beta, focus_start);
  let fog_blend = 1.0 - transmittance;

  let fog_rgb = select(DEFAULT_FOG_RGB, u_weather.fog_color_and_mode.xyz, length(u_weather.fog_color_and_mode.xyz) > 1e-4);
  let shape_hint = select(DEFAULT_SHAPE_MODE, u_weather.fog_color_and_mode.w, u_weather.fog_color_and_mode.w >= 0.0);
  let atmosphere_rgb = mix(scene_sample.xyz, fog_rgb, clamp(fog_blend, 0.0, 0.88));
  let subtle_glow = select(0.0, 0.04 * fog_blend, shape_hint >= 3.0);
  let final_rgb = clamp(atmosphere_rgb + vec3<f32>(subtle_glow), vec3<f32>(0.0), vec3<f32>(1.0));
  return vec4<f32>(final_rgb, 1.0);
}
`;

  return {
    presetId: preset.id,
    wgsl,
    uniformBufferByteLength: UNIFORM_BYTE_LENGTH,
    uniformAlignmentBytes: UNIFORM_ALIGNMENT_BYTES,
    bindings,
    entryPoints: ["cs_advect_and_cull_weather", "fs_composite_atmospheric_weather"],
    wgslSha256Hex: sha256Wave133Hex(wgsl),
  };
}

const FORBIDDEN_GLSL_PATTERNS: ReadonlyArray<{ readonly label: string; readonly regex: RegExp }> = [
  { label: "gl_FragColor", regex: /\bgl_FragColor\b/u },
  { label: "gl_Position", regex: /\bgl_Position\b/u },
  { label: "uniform sampler2D", regex: /\buniform\s+sampler2D\b/u },
  { label: "varying", regex: /\bvarying\s+/u },
  { label: "attribute", regex: /\battribute\s+/u },
  { label: "texture2D()", regex: /\btexture2D\s*\(/u },
  { label: "GLSL vec2/3/4()", regex: /\bvec[234]\s*\(/u },
  { label: "#version", regex: /#version\b/u },
];

/**
 * 생성된 WebGPU WGSL 대기 산란·날씨 파티클 셰이더의 구조, 16바이트/64바이트 유니폼 정렬,
 * 바인딩 중복, 괄호 균형, 엔트리포인트 및 GLSL 금지어를 검증한다.
 */
export function validateAtmosphericWeatherWgsl(
  artifactOrSource: AtmosphericWeatherWgslArtifact | string,
): AtmosphericWeatherWgslValidation {
  const isArtifact = typeof artifactOrSource !== "string";
  const wgsl = isArtifact ? artifactOrSource.wgsl : artifactOrSource;
  const uniformByteLength = isArtifact ? artifactOrSource.uniformBufferByteLength : null;
  const errors: string[] = [];
  const lines = wgsl.split("\n");

  if (wgsl.trim().length < 128) {
    errors.push("WGSL 소스가 너무 짧거나 비어 있습니다.");
  }
  if (/\bNaN\b|\bInfinity\b/u.test(wgsl)) {
    errors.push("WGSL 소스에 NaN 또는 Infinity 리터럴이 포함되었습니다.");
  }

  if (isArtifact) {
    if (artifactOrSource.uniformBufferByteLength !== UNIFORM_BYTE_LENGTH) {
      errors.push(
        `유니폼 버퍼 크기가 64바이트 규격과 다릅니다(현재 ${artifactOrSource.uniformBufferByteLength}B).`,
      );
    }
    if (
      artifactOrSource.uniformAlignmentBytes !== UNIFORM_ALIGNMENT_BYTES ||
      artifactOrSource.uniformBufferByteLength % UNIFORM_ALIGNMENT_BYTES !== 0
    ) {
      errors.push("유니폼 버퍼가 16바이트 정렬 규격을 위반했습니다.");
    }
  }

  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let i = 0; i < wgsl.length; i += 1) {
    const ch = wgsl[i];
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth -= 1;
    else if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    else if (ch === "[") bracketDepth += 1;
    else if (ch === "]") bracketDepth -= 1;

    if (braceDepth < 0) {
      errors.push("닫는 중괄호 '}'가 여는 중괄호보다 먼저 나타났습니다.");
      break;
    }
    if (parenDepth < 0) {
      errors.push("닫는 소괄호 ')'가 여는 소괄호보다 먼저 나타났습니다.");
      break;
    }
    if (bracketDepth < 0) {
      errors.push("닫는 대괄호 ']'가 여는 대괄호보다 먼저 나타났습니다.");
      break;
    }
  }
  if (braceDepth !== 0) errors.push(`중괄호 균형 불일치(잔여 깊이 ${braceDepth}).`);
  if (parenDepth !== 0) errors.push(`소괄호 균형 불일치(잔여 깊이 ${parenDepth}).`);
  if (bracketDepth !== 0) errors.push(`대괄호 균형 불일치(잔여 깊이 ${bracketDepth}).`);

  const bindingMatches = wgsl.match(/@group\(\d+\)\s+@binding\(\d+\)/gu) ?? [];
  const bindingCount = bindingMatches.length;
  if (bindingCount < 4) {
    errors.push(`필수 @group/@binding 선언이 부족합니다(현재 ${bindingCount}개, 최소 4개).`);
  }
  const uniqueBindings = new Set(bindingMatches.map((m) => m.replace(/\s+/gu, " ")));
  if (uniqueBindings.size !== bindingCount) {
    errors.push("중복된 @group/@binding 슬롯 선언이 감지되었습니다.");
  }

  if (!/struct\s+AtmosphericWeatherUniforms\b/u.test(wgsl)) {
    errors.push("AtmosphericWeatherUniforms 구조체 선언이 누락되었습니다.");
  }
  if (!/beer_lambert_transmittance/u.test(wgsl) || !/\bexp\s*\(/u.test(wgsl)) {
    errors.push("Beer-Lambert 지수 대기 투과율 계산 함수가 누락되었습니다.");
  }

  const hasCompute = /@compute\s+@workgroup_size\(/u.test(wgsl);
  const hasFragment = /@fragment\b/u.test(wgsl);
  const entryPointCount = (hasCompute ? 1 : 0) + (hasFragment ? 1 : 0);
  if (!hasCompute) errors.push("@compute @workgroup_size 이류·컬링 엔트리포인트가 누락되었습니다.");
  if (!hasFragment) errors.push("@fragment 대기 안개·보케 합성 엔트리포인트가 누락되었습니다.");

  for (const forbidden of FORBIDDEN_GLSL_PATTERNS) {
    if (forbidden.regex.test(wgsl)) {
      errors.push(`비호환 GLSL 금지어 감지: ${forbidden.label}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    lineCount: lines.length,
    entryPointCount,
    bindingCount,
    uniformBufferByteLength: uniformByteLength,
  };
}
