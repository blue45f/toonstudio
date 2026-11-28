/**
 * Wave 122 — 시네마틱 포스트-그레이딩 가독성·인쇄 안전 감사기 및
 * WebGPU WGSL(64B 16바이트 정렬 유니폼·컴퓨트/프래그먼트 파이프라인) 생성·검증기.
 */

import {
  MIN_SAFE_CORNER_VIGNETTE_GAIN,
  clampFinite,
  getCinematicLensPreset,
  type CinematicLensPreset,
  type CinematicLensPresetId,
  type CinematicLensTileResult,
} from "./cinematic-lens-optics-solver";

export type CinematicAuditGrade = "PASS" | "WARN" | "FAIL";

export interface CinematicReadabilityCheck {
  readonly id: string;
  readonly labelKo: string;
  readonly passed: boolean;
  readonly measuredValue: string;
  readonly thresholdText: string;
  readonly detailKo: string;
}

export interface CinematicPostReadabilityAudit {
  readonly passed: boolean;
  readonly grade: CinematicAuditGrade;
  readonly checks: readonly CinematicReadabilityCheck[];
  readonly violations: readonly string[];
  readonly warnings: readonly string[];
  readonly textSafeIntact: boolean;
  readonly centerClarityIntact: boolean;
  readonly vignetteFloorSafe: boolean;
  readonly distortionInvertible: boolean;
  readonly reducedMotionCompliant: boolean;
}

export interface WgslUniformFieldLayout {
  readonly name: string;
  readonly type: "vec4<f32>";
  readonly byteOffset: number;
  readonly byteSize: number;
}

export interface BuildLensOpticsWgslOptions {
  readonly workgroupSizeX?: number;
  readonly workgroupSizeY?: number;
  readonly intensity?: number;
  readonly prefersReducedMotion?: boolean;
}

export interface CinematicLensWgslArtifact {
  readonly presetId: CinematicLensPresetId;
  readonly wgslSource: string;
  readonly uniformStructName: "LensOpticsUniforms";
  readonly uniformByteSize: number;
  readonly uniformAlignmentBytes: number;
  readonly uniformLayout: readonly WgslUniformFieldLayout[];
  readonly computeEntryPoint: string;
  readonly fragmentEntryPoint: string;
  readonly workgroupSize: readonly [number, number, number];
}

export interface CinematicLensWgslValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly lineCount: number;
  readonly detectedEntryPoints: readonly string[];
  readonly uniformByteSizeVerified: boolean;
  readonly forbiddenGlslTokensFound: readonly string[];
}

export const MAX_ALLOWED_DISTORTION_ROUNDTRIP_ERROR = 1e-4;
export const LENS_OPTICS_UNIFORM_BYTE_SIZE = 64;
export const LENS_OPTICS_UNIFORM_ALIGNMENT = 16;

const LENS_OPTICS_UNIFORM_LAYOUT: readonly WgslUniformFieldLayout[] = [
  { name: "dims_and_focus", type: "vec4<f32>", byteOffset: 0, byteSize: 16 },
  { name: "distortion_params", type: "vec4<f32>", byteOffset: 16, byteSize: 16 },
  { name: "ca_and_bokeh", type: "vec4<f32>", byteOffset: 32, byteSize: 16 },
  { name: "vignette_and_halation", type: "vec4<f32>", byteOffset: 48, byteSize: 16 },
] as const;

const FORBIDDEN_GLSL_PATTERNS: ReadonlyArray<{ readonly token: string; readonly regex: RegExp }> = [
  { token: "gl_FragCoord", regex: /\bgl_FragCoord\b/ },
  { token: "gl_FragColor", regex: /\bgl_FragColor\b/ },
  { token: "texture2D(", regex: /\btexture2D\s*\(/ },
  { token: "sampler2D", regex: /\bsampler2D\b/ },
  { token: "uniform ", regex: /(^|\n)\s*uniform\s+/ },
  { token: "varying ", regex: /(^|\n)\s*varying\s+/ },
  { token: "attribute ", regex: /(^|\n)\s*attribute\s+/ },
  { token: "#version", regex: /#version\b/ },
  { token: "vec2(", regex: /\bvec2\s*\(/ },
  { token: "vec3(", regex: /\bvec3\s*\(/ },
  { token: "vec4(", regex: /\bvec4\s*\(/ },
];

/**
 * 시네마틱 렌즈 포스트-그레이딩 결과의 대사 가독성·중심 선명도·왜곡 가역성·
 * 코너 비네팅 안전 하한·동작 축소(prefersReducedMotion) 준수를 감사한다.
 */
export function auditCinematicPostReadability(
  result: CinematicLensTileResult,
): CinematicPostReadabilityAudit {
  const { metrics, prefersReducedMotion, effectiveShutterJitterPx } = result;
  const violations: string[] = [];
  const warnings: string[] = [];

  const textSafeIntact = metrics.textBoxCorruptedPixelCount === 0;
  if (!textSafeIntact) {
    violations.push(
      `대사 보호 영역 픽셀 ${String(metrics.textBoxCorruptedPixelCount)}개가 변조되었습니다(허용치 0px).`,
    );
  }

  const centerClarityIntact =
    metrics.centerCaSeparationPx === 0 &&
    metrics.centerDistortionDriftUv === 0 &&
    metrics.centerVignetteGain >= 0.98 &&
    metrics.focusPlaneCocPx === 0;
  if (!centerClarityIntact) {
    violations.push(
      `화면 중심부 선명도·무수차 불변식이 깨졌습니다(CA=${metrics.centerCaSeparationPx.toFixed(3)}px, 왜곡 드리프트=${metrics.centerDistortionDriftUv.toExponential(2)}).`,
    );
  }

  const distortionInvertible =
    Number.isFinite(metrics.maxDistortionRoundTripUvError) &&
    metrics.maxDistortionRoundTripUvError < MAX_ALLOWED_DISTORTION_ROUNDTRIP_ERROR;
  if (!distortionInvertible) {
    violations.push(
      `Brown-Conrady 정·역왜곡 왕복 오차(${metrics.maxDistortionRoundTripUvError.toExponential(2)})가 허용 상한(1e-4)을 초과했습니다.`,
    );
  }

  const vignetteFloorSafe =
    Number.isFinite(metrics.minCornerVignetteGain) &&
    metrics.minCornerVignetteGain >= MIN_SAFE_CORNER_VIGNETTE_GAIN;
  if (!vignetteFloorSafe) {
    violations.push(
      `코너 비네팅 최소 이득(${metrics.minCornerVignetteGain.toFixed(3)})이 안전 하한(0.350) 미만입니다.`,
    );
  }

  const reducedMotionCompliant = !prefersReducedMotion || effectiveShutterJitterPx === 0;
  if (!reducedMotionCompliant) {
    violations.push(
      `동작 축소(prefersReducedMotion) 상태에서 셔터 지터(${effectiveShutterJitterPx.toFixed(2)}px)가 0이 아닙니다.`,
    );
  }

  const numericIntegrityOk = metrics.nonFiniteOrOutOfRangeChannelCount === 0;
  if (!numericIntegrityOk) {
    violations.push(
      `출력 RGBA에 비유한 또는 범위 이탈 채널이 ${String(metrics.nonFiniteOrOutOfRangeChannelCount)}건 검출되었습니다.`,
    );
  }

  if (metrics.cornerCaSeparationPx > 8.0) {
    warnings.push(
      `코너 측면 색수차 분리량(${metrics.cornerCaSeparationPx.toFixed(2)}px)이 높으므로 외곽 배경 선화를 육안 점검하십시오.`,
    );
  }
  if (metrics.textSafeBoxCount === 0) {
    warnings.push("지정된 대사 보호 영역(textSafeBoxes)이 없어 전체 화면에 광학 효과가 적용되었습니다.");
  }

  const checks: readonly CinematicReadabilityCheck[] = [
    {
      id: "text-safe-zero-corruption",
      labelKo: "대사·말풍선 0px 무손실 보호",
      passed: textSafeIntact,
      measuredValue: `${String(metrics.textBoxCorruptedPixelCount)}px 훼손 / ${String(metrics.textSafeProtectedPixelCount)}px 보호`,
      thresholdText: "0px 훼손",
      detailKo: textSafeIntact
        ? "모든 말풍선·대사 영역이 색수차·왜곡·블러 없이 원본 그대로 보존되었습니다."
        : "대사 보호 영역 내부 픽셀이 변조되었습니다.",
    },
    {
      id: "center-sharpness-and-zero-ca",
      labelKo: "화면 중심 선명도·색수차 0px 보존",
      passed: centerClarityIntact,
      measuredValue: `CA ${metrics.centerCaSeparationPx.toFixed(2)}px · 초점 CoC ${metrics.focusPlaneCocPx.toFixed(2)}px`,
      thresholdText: "중심 CA 0.00px · 초점 CoC 0.00px",
      detailKo: centerClarityIntact
        ? "주인공 얼굴이 놓이는 화면 중심의 광학 드리프트와 색수차가 0px입니다."
        : "중심부 선명도 또는 초점 평면 기준에 오차가 있습니다.",
    },
    {
      id: "distortion-invertibility",
      labelKo: "Brown-Conrady 정·역왜곡 가역성",
      passed: distortionInvertible,
      measuredValue: metrics.maxDistortionRoundTripUvError.toExponential(2),
      thresholdText: "< 1.00e-4 UV",
      detailKo: distortionInvertible
        ? "뉴턴-랩슨 역왜곡 복원이 허용 오차 이내로 수렴해 편집 라운드트립이 안전합니다."
        : "역왜곡 왕복 오차가 기준치를 초과했습니다.",
    },
    {
      id: "corner-vignette-floor",
      labelKo: "코너 비네팅 암부 보호 하한",
      passed: vignetteFloorSafe,
      measuredValue: `${(metrics.minCornerVignetteGain * 100).toFixed(1)}%`,
      thresholdText: ">= 35.0%",
      detailKo: vignetteFloorSafe
        ? "네 모서리 광량이 인쇄·모바일 암부 보호 하한(35%) 이상으로 유지됩니다."
        : "모서리 광량 감쇠가 과도해 암부 선화가 뭉개질 위험이 있습니다.",
    },
    {
      id: "reduced-motion-compliance",
      labelKo: "동작 축소(Reduced Motion) 준수",
      passed: reducedMotionCompliant,
      measuredValue: prefersReducedMotion
        ? `활성 · 지터 ${effectiveShutterJitterPx.toFixed(2)}px`
        : `비활성 · 지터 ${effectiveShutterJitterPx.toFixed(2)}px`,
      thresholdText: "활성 시 지터 0.00px",
      detailKo: reducedMotionCompliant
        ? "동작 축소 설정에서 동적 깜빡임과 셔터 지터가 차단됩니다."
        : "동작 축소 설정인데 셔터 지터 진폭이 남아 있습니다.",
    },
    {
      id: "rgba-numeric-integrity",
      labelKo: "출력 RGBA 수치 무결성",
      passed: numericIntegrityOk,
      measuredValue: `이탈 ${String(metrics.nonFiniteOrOutOfRangeChannelCount)}건`,
      thresholdText: "0건",
      detailKo: numericIntegrityOk
        ? "모든 출력 픽셀 채널이 유한한 0..255 범위 안에 있습니다."
        : "비유한 또는 범위 이탈 채널이 존재합니다.",
    },
  ];

  const passed = violations.length === 0;
  const grade: CinematicAuditGrade = !passed ? "FAIL" : warnings.length > 0 ? "WARN" : "PASS";

  return {
    passed,
    grade,
    checks,
    violations,
    warnings,
    textSafeIntact,
    centerClarityIntact,
    vignetteFloorSafe,
    distortionInvertible,
    reducedMotionCompliant,
  };
}

function fmtWgslF32(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const fixed = safe.toFixed(6);
  return fixed.indexOf(".") >= 0 ? fixed : `${fixed}.0`;
}

/**
 * 16바이트 정렬 64B 유니폼과 Brown-Conrady 왜곡·측면 CA·DoF CoC·아나모픽 보케·
 * Cos⁴ 비네팅·대사 보호 마스크 분기를 갖춘 WebGPU WGSL(컴퓨트/프래그먼트) 아티팩트를 생성한다.
 */
export function buildCinematicLensOpticsWgsl(
  presetId: CinematicLensPresetId,
  options?: BuildLensOpticsWgslOptions,
): CinematicLensWgslArtifact {
  const preset: CinematicLensPreset = getCinematicLensPreset(presetId);
  const wgX = Math.max(1, Math.min(32, Math.floor(options?.workgroupSizeX ?? 8)));
  const wgY = Math.max(1, Math.min(32, Math.floor(options?.workgroupSizeY ?? 8)));
  const intensity = clampFinite(options?.intensity ?? 1.0, 0, 1.5);
  const shutterJitter =
    options?.prefersReducedMotion === true ? 0.0 : preset.shutterJitterAmplitudePx * intensity;

  const lines: readonly string[] = [
    `// Wave 122 WebGPU Cinematic Lens Optics & Text-Safe Anamorphic Bokeh Shader (${preset.id})`,
    "// Uniform struct layout: 4 x vec4<f32> = 64 bytes (16-byte aligned)",
    "struct LensOpticsUniforms {",
    "  dims_and_focus: vec4<f32>,",
    "  distortion_params: vec4<f32>,",
    "  ca_and_bokeh: vec4<f32>,",
    "  vignette_and_halation: vec4<f32>,",
    "};",
    "",
    "@group(0) @binding(0) var<uniform> u_optics: LensOpticsUniforms;",
    "@group(0) @binding(1) var src_tex: texture_2d<f32>;",
    "@group(0) @binding(2) var depth_tex: texture_2d<f32>;",
    "@group(0) @binding(3) var text_safe_mask_tex: texture_2d<f32>;",
    "@group(0) @binding(4) var dst_tex: texture_storage_2d<rgba8unorm, write>;",
    "",
    `const PRESET_INTENSITY: f32 = ${fmtWgslF32(intensity)};`,
    `const PRESET_SENSOR_WIDTH_MM: f32 = ${fmtWgslF32(preset.sensorWidthMm)};`,
    `const PRESET_ANAMORPHIC_SQUEEZE: f32 = ${fmtWgslF32(preset.anamorphicSqueeze)};`,
    `const PRESET_HALF_ANGLE_RAD: f32 = ${fmtWgslF32(preset.vignetteFieldHalfAngleRad)};`,
    `const PRESET_SHUTTER_JITTER_PX: f32 = ${fmtWgslF32(shutterJitter)};`,
    `const PRESET_HALATION_TINT: vec3<f32> = vec3<f32>(${fmtWgslF32(preset.halationTintRgb[0])}, ${fmtWgslF32(preset.halationTintRgb[1])}, ${fmtWgslF32(preset.halationTintRgb[2])});`,
    `const MIN_SAFE_VIGNETTE_GAIN: f32 = ${fmtWgslF32(Math.max(MIN_SAFE_CORNER_VIGNETTE_GAIN, preset.minCornerVignetteGain))};`,
    "const INV_SQRT2: f32 = 0.70710678;",
    "",
    "fn is_text_safe_masked(coord: vec2<i32>) -> bool {",
    "  let mask_val = textureLoad(text_safe_mask_tex, coord, 0).x;",
    "  return mask_val > 0.5;",
    "}",
    "",
    "fn distort_brown_conrady(uv: vec2<f32>, params: vec4<f32>) -> vec2<f32> {",
    "  let centered = (uv - vec2<f32>(0.5, 0.5)) * 2.0;",
    "  let r2 = dot(centered, centered);",
    "  let r4 = r2 * r2;",
    "  let radial = 1.0 + params.x * r2 + params.y * r4;",
    "  let tang_x = 2.0 * params.z * centered.x * centered.y + params.w * (r2 + 2.0 * centered.x * centered.x);",
    "  let tang_y = params.z * (r2 + 2.0 * centered.y * centered.y) + 2.0 * params.w * centered.x * centered.y;",
    "  let warped = centered * radial + vec2<f32>(tang_x, tang_y);",
    "  return vec2<f32>(0.5, 0.5) + warped * 0.5;",
    "}",
    "",
    "fn compute_thin_lens_coc_px(depth_m: f32, focus_m: f32, focal_mm: f32, f_stop: f32, width_px: f32) -> f32 {",
    "  let f_m = max(0.008, focal_mm * 0.001);",
    "  let safe_focus = max(f_m * 1.1, focus_m);",
    "  let safe_depth = max(f_m * 1.1, depth_m);",
    "  let aperture_m = f_m / max(0.7, f_stop);",
    "  let coc_m = ((aperture_m * f_m) / (safe_focus - f_m)) * (abs(safe_depth - safe_focus) / safe_depth);",
    "  return (coc_m * 1000.0 / PRESET_SENSOR_WIDTH_MM) * width_px;",
    "}",
    "",
    "fn compute_cos4_vignette(uv: vec2<f32>, strength: f32, floor_gain: f32) -> f32 {",
    "  let centered = (uv - vec2<f32>(0.5, 0.5)) * 2.0;",
    "  let r_norm = min(1.0, length(centered) * INV_SQRT2);",
    "  let theta = atan(r_norm * tan(PRESET_HALF_ANGLE_RAD));",
    "  let c = cos(theta);",
    "  let c4 = c * c * c * c;",
    "  let raw_gain = 1.0 - clamp(strength, 0.0, 1.2) * (1.0 - c4);",
    "  return clamp(raw_gain, max(MIN_SAFE_VIGNETTE_GAIN, floor_gain), 1.0);",
    "}",
    "",
    "fn load_clamped_rgb(px: vec2<f32>, dims: vec2<i32>) -> vec3<f32> {",
    "  let cx = clamp(i32(round(px.x)), 0, dims.x - 1);",
    "  let cy = clamp(i32(round(px.y)), 0, dims.y - 1);",
    "  return textureLoad(src_tex, vec2<i32>(cx, cy), 0).xyz;",
    "}",
    "",
    "fn sample_anamorphic_bokeh_and_ca(uv: vec2<f32>, dims: vec2<i32>, coc_px: f32) -> vec3<f32> {",
    "  let warped_uv = distort_brown_conrady(uv, u_optics.distortion_params);",
    "  let dims_f = vec2<f32>(f32(dims.x), f32(dims.y));",
    "  let base_px = warped_uv * dims_f - vec2<f32>(0.5, 0.5);",
    "  let centered = (uv - vec2<f32>(0.5, 0.5)) * 2.0;",
    "  let rad = length(centered);",
    "  let r_norm = min(1.0, rad * INV_SQRT2);",
    "  let dir = select(vec2<f32>(0.0, 0.0), centered / rad, rad > 1e-6);",
    "  let red_off = dir * (u_optics.ca_and_bokeh.x * r_norm * PRESET_INTENSITY);",
    "  let blue_off = dir * (u_optics.ca_and_bokeh.y * r_norm * PRESET_INTENSITY);",
    "  let aspect = max(0.5, u_optics.ca_and_bokeh.z);",
    "  let rx = min(5.0, coc_px * 0.5) / sqrt(aspect);",
    "  let ry = rx * aspect;",
    "  var acc = vec3<f32>(0.0, 0.0, 0.0);",
    "  var w_sum: f32 = 0.0;",
    "  let offsets = array<vec2<f32>, 5>(",
    "    vec2<f32>(0.0, 0.0),",
    "    vec2<f32>(1.0, 0.0),",
    "    vec2<f32>(-1.0, 0.0),",
    "    vec2<f32>(0.0, 1.0),",
    "    vec2<f32>(0.0, -1.0)",
    "  );",
    "  for (var i: u32 = 0u; i < 5u; i = i + 1u) {",
    "    let tap = base_px + vec2<f32>(offsets[i].x * rx, offsets[i].y * ry);",
    "    let r_ch = load_clamped_rgb(tap + red_off, dims).x;",
    "    let g_ch = load_clamped_rgb(tap, dims).y;",
    "    let b_ch = load_clamped_rgb(tap + blue_off, dims).z;",
    "    let w = select(0.85, 1.4, i == 0u);",
    "    acc = acc + vec3<f32>(r_ch, g_ch, b_ch) * w;",
    "    w_sum = w_sum + w;",
    "  }",
    "  return acc / max(0.0001, w_sum);",
    "}",
    "",
    "fn grade_pixel(coord: vec2<i32>, dims: vec2<i32>) -> vec4<f32> {",
    "  let orig = textureLoad(src_tex, coord, 0);",
    "  if (is_text_safe_masked(coord)) {",
    "    return orig;",
    "  }",
    "  let dims_f = vec2<f32>(f32(dims.x), f32(dims.y));",
    "  let uv = (vec2<f32>(f32(coord.x), f32(coord.y)) + vec2<f32>(0.5, 0.5)) / dims_f;",
    "  let depth_m = textureLoad(depth_tex, coord, 0).x;",
    "  let coc_px = compute_thin_lens_coc_px(",
    "    depth_m,",
    "    u_optics.dims_and_focus.z,",
    "    u_optics.ca_and_bokeh.w,",
    "    u_optics.dims_and_focus.w,",
    "    dims_f.x",
    "  ) * PRESET_INTENSITY;",
    "  var rgb = sample_anamorphic_bokeh_and_ca(uv, dims, coc_px);",
    "  let luma = dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));",
    "  let hal_thresh = u_optics.vignette_and_halation.z;",
    "  let hal_excess = max(0.0, luma - hal_thresh) / max(0.05, 1.0 - hal_thresh);",
    "  rgb = min(vec3<f32>(1.0, 1.0, 1.0), rgb + PRESET_HALATION_TINT * (hal_excess * u_optics.vignette_and_halation.w));",
    "  let vig = compute_cos4_vignette(uv, u_optics.vignette_and_halation.x, u_optics.vignette_and_halation.y);",
    "  return vec4<f32>(clamp(rgb * vig, vec3<f32>(0.0, 0.0, 0.0), vec3<f32>(1.0, 1.0, 1.0)), orig.w);",
    "}",
    "",
    `@compute @workgroup_size(${String(wgX)}, ${String(wgY)}, 1)`,
    "fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {",
    "  let width = i32(u_optics.dims_and_focus.x);",
    "  let height = i32(u_optics.dims_and_focus.y);",
    "  let coord = vec2<i32>(i32(gid.x), i32(gid.y));",
    "  if (coord.x >= width || coord.y >= height) {",
    "    return;",
    "  }",
    "  let graded = grade_pixel(coord, vec2<i32>(width, height));",
    "  textureStore(dst_tex, coord, graded);",
    "}",
    "",
    "@fragment",
    "fn fs_main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {",
    "  let dims = vec2<i32>(max(1, i32(u_optics.dims_and_focus.x)), max(1, i32(u_optics.dims_and_focus.y)));",
    "  let coord = vec2<i32>(clamp(i32(pos.x), 0, dims.x - 1), clamp(i32(pos.y), 0, dims.y - 1));",
    "  return grade_pixel(coord, dims);",
    "}",
  ];

  return {
    presetId: preset.id,
    wgslSource: lines.join("\n"),
    uniformStructName: "LensOpticsUniforms",
    uniformByteSize: LENS_OPTICS_UNIFORM_BYTE_SIZE,
    uniformAlignmentBytes: LENS_OPTICS_UNIFORM_ALIGNMENT,
    uniformLayout: LENS_OPTICS_UNIFORM_LAYOUT,
    computeEntryPoint: "cs_main",
    fragmentEntryPoint: "fs_main",
    workgroupSize: [wgX, wgY, 1],
  };
}

/**
 * 생성된 시네마틱 렌즈 광학 WGSL 아티팩트의 구조·64B/16B 정렬·바인딩·대사 보호 분기·
 * GLSL 금지어 배제 여부를 정적 검증한다.
 */
export function validateCinematicLensOpticsWgsl(
  artifact: CinematicLensWgslArtifact,
): CinematicLensWgslValidationResult {
  const errors: string[] = [];
  const source = artifact.wgslSource ?? "";
  const trimmed = source.trim();
  const lines = trimmed.length === 0 ? [] : trimmed.split("\n");

  if (trimmed.length === 0) {
    errors.push("WGSL 소스가 비어 있습니다.");
  }

  if (/\b(?:NaN|Infinity|undefined)\b/.test(source)) {
    errors.push("WGSL 소스에 비유한 수치(NaN/Infinity/undefined)가 포함되어 있습니다.");
  }

  // 16바이트 정렬 64B 유니폼 검증
  const layoutTotalBytes = artifact.uniformLayout.reduce((acc, field) => acc + field.byteSize, 0);
  const alignmentValid =
    artifact.uniformAlignmentBytes === LENS_OPTICS_UNIFORM_ALIGNMENT &&
    artifact.uniformByteSize === LENS_OPTICS_UNIFORM_BYTE_SIZE &&
    artifact.uniformByteSize % LENS_OPTICS_UNIFORM_ALIGNMENT === 0 &&
    layoutTotalBytes === LENS_OPTICS_UNIFORM_BYTE_SIZE &&
    artifact.uniformLayout.every(
      (field) => field.byteOffset % 16 === 0 && field.byteSize === 16 && field.type === "vec4<f32>",
    );
  if (!alignmentValid) {
    errors.push(
      `유니폼 버퍼 정렬 검증 실패: 16바이트 정렬 64B 구조여야 합니다(현재 ${String(artifact.uniformByteSize)}B / align ${String(artifact.uniformAlignmentBytes)}B).`,
    );
  }

  // 괄호·중괄호 균형 검증
  let braceDepth = 0;
  let parenDepth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
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
    errors.push(`중괄호 균형이 맞지 않습니다(잔여 깊이 ${String(braceDepth)}).`);
  }
  if (parenDepth !== 0) {
    errors.push(`소괄호 균형이 맞지 않습니다(잔여 깊이 ${String(parenDepth)}).`);
  }

  // 필수 구조체·바인딩·광학 함수·대사 보호 분기 검증
  const requiredSymbols: readonly string[] = [
    "struct LensOpticsUniforms",
    "@group(0) @binding(0) var<uniform> u_optics: LensOpticsUniforms;",
    "@group(0) @binding(1) var src_tex: texture_2d<f32>;",
    "@group(0) @binding(2) var depth_tex: texture_2d<f32>;",
    "@group(0) @binding(3) var text_safe_mask_tex: texture_2d<f32>;",
    "@group(0) @binding(4) var dst_tex: texture_storage_2d<rgba8unorm, write>;",
    "fn is_text_safe_masked(",
    "fn distort_brown_conrady(",
    "fn compute_thin_lens_coc_px(",
    "fn compute_cos4_vignette(",
    "fn sample_anamorphic_bokeh_and_ca(",
  ];
  for (let i = 0; i < requiredSymbols.length; i += 1) {
    if (!source.includes(requiredSymbols[i])) {
      errors.push(`필수 WGSL 심볼 또는 바인딩이 누락되었습니다: ${requiredSymbols[i]}`);
    }
  }

  // 엔트리포인트 검출
  const detectedEntryPoints: string[] = [];
  if (/@compute\s+@workgroup_size\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)\s+fn\s+cs_main\b/.test(source)) {
    detectedEntryPoints.push("cs_main");
  }
  if (/@fragment\s+fn\s+fs_main\b/.test(source)) {
    detectedEntryPoints.push("fs_main");
  }
  if (detectedEntryPoints.length === 0) {
    errors.push("유효한 @compute 또는 @fragment 엔트리포인트가 없습니다.");
  }

  // GLSL 금지어 검출
  const forbiddenGlslTokensFound: string[] = [];
  for (let i = 0; i < FORBIDDEN_GLSL_PATTERNS.length; i += 1) {
    const entry = FORBIDDEN_GLSL_PATTERNS[i];
    if (entry.regex.test(source)) {
      forbiddenGlslTokensFound.push(entry.token);
      errors.push(`WGSL에서 금지된 GLSL 구문이 포함되었습니다: ${entry.token}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    lineCount: lines.length,
    detectedEntryPoints,
    uniformByteSizeVerified: alignmentValid,
    forbiddenGlslTokensFound,
  };
}
