/**
 * Wave 120 — WebGPU 가변 폭 캡슐 SDF 재렌더링 WGSL 빌더 및 정적 검증기.
 *
 * - 16바이트 정렬 유니폼(64B)·캡슐 스토리지(32B), `@compute`·`@fragment` 진입점 WGSL을 생성한다.
 * - 구조·바인딩·16바이트 정렬·괄호 균형·GLSL 금지 토큰을 엄격 검증한다.
 */

import { clampFinite, sha256VectorInkHex } from "./vector-ink-sha256";

export interface BuildVectorInkSdfWgslOptions {
  readonly workgroupSizeX?: number;
  readonly workgroupSizeY?: number;
  readonly aaHalfPx?: number;
  readonly maxSegmentsPerTile?: number;
}

export interface VectorInkSdfWgslArtifact {
  readonly wgsl: string;
  readonly uniformStrideBytes: number;
  readonly segmentStrideBytes: number;
  readonly entryPoints: readonly string[];
  readonly workgroupSize: readonly [number, number, number];
  readonly sha256Hex: string;
}

export interface VectorInkWgslValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly lineCount: number;
  readonly entryPoints: readonly string[];
  readonly uniformAligned16: boolean;
  readonly glslForbiddenHits: readonly string[];
}

const DEFAULT_AA_HALF_PX = 0.55;

function fmtWgslF32(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const fixed = safe.toFixed(6);
  return fixed.indexOf(".") >= 0 ? fixed : `${fixed}.0`;
}

/**
 * 16바이트 정렬 유니폼·스토리지 버퍼를 사용하는 WebGPU 가변 폭 캡슐 SDF 재렌더링 WGSL을 생성한다.
 */
export function buildVectorInkSdfWgsl(
  options?: BuildVectorInkSdfWgslOptions,
): VectorInkSdfWgslArtifact {
  const wgX = Math.max(1, Math.min(32, Math.floor(options?.workgroupSizeX ?? 8)));
  const wgY = Math.max(1, Math.min(32, Math.floor(options?.workgroupSizeY ?? 8)));
  const aaHalfPx = clampFinite(options?.aaHalfPx ?? DEFAULT_AA_HALF_PX, 0.25, 2.0, DEFAULT_AA_HALF_PX);
  const maxSegments = Math.max(16, Math.min(65536, Math.floor(options?.maxSegmentsPerTile ?? 4096)));

  const lines: readonly string[] = [
    "// Wave 120 WebGPU Variable-Width Capsule SDF Vector Ink Rerender Shader",
    "struct RerenderUniforms {",
    "  target_dims_and_scale: vec4<f32>,",
    "  viewport_origin_and_dpi: vec4<f32>,",
    "  ink_rgba: vec4<f32>,",
    "  flags_and_limits: vec4<f32>,",
    "};",
    "",
    "struct InkCapsuleSegment {",
    "  endpoints_xy: vec4<f32>,",
    "  radii_and_opacity: vec4<f32>,",
    "};",
    "",
    "@group(0) @binding(0) var<uniform> u_rerender: RerenderUniforms;",
    "@group(0) @binding(1) var<storage, read> s_capsules: array<InkCapsuleSegment>;",
    "@group(0) @binding(2) var dst_alpha_tex: texture_storage_2d<r32float, write>;",
    "",
    `const DEFAULT_AA_HALF_PX: f32 = ${fmtWgslF32(aaHalfPx)};`,
    `const MAX_SEGMENTS_PER_TILE: u32 = ${String(maxSegments)}u;`,
    "",
    "fn sd_uneven_capsule(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>, r0: f32, r1: f32) -> f32 {",
    "  let v = b - a;",
    "  let h = length(v);",
    "  let d = p - a;",
    "  if (h <= 0.000001) { return length(d) - max(r0, r1); }",
    "  let inv_h = 1.0 / h;",
    "  let u = v * inv_h;",
    "  let y = dot(d, u);",
    "  let x = abs(-d.x * u.y + d.y * u.x);",
    "  let delta_r = r0 - r1;",
    "  if (abs(delta_r) >= h - 0.000001) {",
    "    return select(length(p - b) - r1, length(d) - r0, r0 >= r1);",
    "  }",
    "  let ny = delta_r * inv_h;",
    "  let nx = sqrt(max(0.0, 1.0 - ny * ny));",
    "  let proj = -x * ny + y * nx;",
    "  if (proj < 0.0) { return length(vec2<f32>(x, y)) - r0; }",
    "  if (proj > h * nx) { return length(vec2<f32>(x, y - h)) - r1; }",
    "  return x * nx + y * ny - r0;",
    "}",
    "",
    "fn evaluate_vector_ink_alpha(logical_pos: vec2<f32>, scale_factor: f32, aa_half_px: f32) -> f32 {",
    "  let seg_count = min(u32(u_rerender.viewport_origin_and_dpi.w), MAX_SEGMENTS_PER_TILE);",
    "  var best_alpha: f32 = 0.0;",
    "  for (var i: u32 = 0u; i < seg_count; i = i + 1u) {",
    "    let seg = s_capsules[i];",
    "    let sd_logical = sd_uneven_capsule(logical_pos, seg.endpoints_xy.xy, seg.endpoints_xy.zw, seg.radii_and_opacity.x, seg.radii_and_opacity.y);",
    "    let sd_px = sd_logical * scale_factor;",
    "    let t = clamp((aa_half_px - sd_px) / max(0.0001, 2.0 * aa_half_px), 0.0, 1.0);",
    "    let coverage = t * t * (3.0 - 2.0 * t) * clamp(seg.radii_and_opacity.z, 0.0, 1.0);",
    "    best_alpha = max(best_alpha, coverage);",
    "  }",
    "  return best_alpha;",
    "}",
    "",
    `@compute @workgroup_size(${String(wgX)}, ${String(wgY)}, 1)`,
    "fn cs_rerender_sdf(@builtin(global_invocation_id) gid: vec3<u32>) {",
    "  let width = u32(u_rerender.target_dims_and_scale.x);",
    "  let height = u32(u_rerender.target_dims_and_scale.y);",
    "  if (gid.x >= width || gid.y >= height) { return; }",
    "  let scale_factor = max(0.1, u_rerender.target_dims_and_scale.z);",
    "  let aa_half_px = max(0.25, u_rerender.target_dims_and_scale.w);",
    "  let logical_pos = vec2<f32>(",
    "    u_rerender.viewport_origin_and_dpi.x + (f32(gid.x) + 0.5) / scale_factor,",
    "    u_rerender.viewport_origin_and_dpi.y + (f32(gid.y) + 0.5) / scale_factor",
    "  );",
    "  let ink_alpha = evaluate_vector_ink_alpha(logical_pos, scale_factor, aa_half_px);",
    "  textureStore(dst_alpha_tex, vec2<i32>(i32(gid.x), i32(gid.y)), vec4<f32>(ink_alpha, 0.0, 0.0, 1.0));",
    "}",
    "",
    "@fragment",
    "fn fs_rerender_sdf(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {",
    "  let scale_factor = max(0.1, u_rerender.target_dims_and_scale.z);",
    "  let aa_half_px = max(0.25, u_rerender.target_dims_and_scale.w);",
    "  let logical_pos = vec2<f32>(",
    "    u_rerender.viewport_origin_and_dpi.x + frag_coord.x / scale_factor,",
    "    u_rerender.viewport_origin_and_dpi.y + frag_coord.y / scale_factor",
    "  );",
    "  let ink_alpha = evaluate_vector_ink_alpha(logical_pos, scale_factor, aa_half_px);",
    "  return vec4<f32>(u_rerender.ink_rgba.xyz, ink_alpha * u_rerender.ink_rgba.w);",
    "}",
  ];

  const wgsl = lines.join("\n");
  return {
    wgsl,
    uniformStrideBytes: 64,
    segmentStrideBytes: 32,
    entryPoints: ["cs_rerender_sdf", "fs_rerender_sdf"],
    workgroupSize: [wgX, wgY, 1],
    sha256Hex: sha256VectorInkHex(wgsl),
  };
}

const GLSL_FORBIDDEN_RULES: ReadonlyArray<{ readonly label: string; readonly pattern: RegExp }> = [
  { label: "gl_FragColor", pattern: /\bgl_FragColor\b/ },
  { label: "gl_FragCoord", pattern: /\bgl_FragCoord\b/ },
  { label: "gl_Position", pattern: /\bgl_Position\b/ },
  { label: "gl_GlobalInvocationID", pattern: /\bgl_GlobalInvocationID\b/ },
  { label: "#version", pattern: /#version\b/ },
  { label: "layout(...)", pattern: /\blayout\s*\(/ },
  { label: "sampler2D", pattern: /\bsampler2D\b/ },
  { label: "bare-vec-ctor", pattern: /\b(?:vec2|vec3|vec4)\s*\(/ },
  { label: "glsl-float-decl", pattern: /\bfloat\s+[a-zA-Z_]/ },
];

/** 생성된 WebGPU 가변 폭 캡슐 SDF WGSL 아티팩트의 구조·바인딩·16바이트 정렬·GLSL 금지어를 검증한다. */
export function validateVectorInkSdfWgsl(
  artifactOrSource: VectorInkSdfWgslArtifact | string,
): VectorInkWgslValidationResult {
  const wgsl = typeof artifactOrSource === "string" ? artifactOrSource : artifactOrSource.wgsl;
  const errors: string[] = [];
  const trimmed = wgsl.trim();
  const lines = trimmed.length === 0 ? [] : trimmed.split("\n");

  if (trimmed.length === 0) errors.push("WGSL 소스가 비어 있습니다.");
  if (/\b(?:NaN|Infinity|undefined)\b/.test(wgsl)) {
    errors.push("WGSL 소스에 비유한 수치(NaN/Infinity/undefined)가 포함되어 있습니다.");
  }

  let braceDepth = 0;
  let parenDepth = 0;
  for (let i = 0; i < wgsl.length; i += 1) {
    const ch = wgsl[i];
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") {
      braceDepth -= 1;
      if (braceDepth < 0) {
        errors.push("닫는 중괄호 '}'가 여는 중괄호보다 많습니다.");
        break;
      }
    } else if (ch === "(") parenDepth += 1;
    else if (ch === ")") {
      parenDepth -= 1;
      if (parenDepth < 0) {
        errors.push("닫는 소괄호 ')'가 여는 소괄호보다 많습니다.");
        break;
      }
    }
  }
  if (braceDepth !== 0) errors.push(`중괄호 짝이 맞지 않습니다(잔여 깊이: ${String(braceDepth)}).`);
  if (parenDepth !== 0) errors.push(`소괄호 짝이 맞지 않습니다(잔여 깊이: ${String(parenDepth)}).`);

  let uniformAligned16 = true;
  if (typeof artifactOrSource !== "string") {
    if (artifactOrSource.uniformStrideBytes <= 0 || artifactOrSource.uniformStrideBytes % 16 !== 0) {
      uniformAligned16 = false;
      errors.push(`유니폼 스트라이드(${String(artifactOrSource.uniformStrideBytes)}B)가 16바이트 배수가 아닙니다.`);
    }
    if (artifactOrSource.segmentStrideBytes <= 0 || artifactOrSource.segmentStrideBytes % 16 !== 0) {
      uniformAligned16 = false;
      errors.push(`세그먼트 스트라이드(${String(artifactOrSource.segmentStrideBytes)}B)가 16바이트 배수가 아닙니다.`);
    }
  }

  const uniformStructMatch = /struct\s+RerenderUniforms\s*\{([^}]*)\}/.exec(wgsl);
  if (!uniformStructMatch) {
    uniformAligned16 = false;
    errors.push("필수 구조체 'struct RerenderUniforms'가 누락되었습니다.");
  } else {
    const bodyLines = uniformStructMatch[1]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("//"));
    if (bodyLines.length === 0) {
      uniformAligned16 = false;
      errors.push("RerenderUniforms 구조체 필드가 비어 있습니다.");
    }
    for (let i = 0; i < bodyLines.length; i += 1) {
      if (!/:\s*vec4<(?:f32|u32|i32)>\s*,?$/.test(bodyLines[i])) {
        uniformAligned16 = false;
        errors.push(`RerenderUniforms 필드가 16바이트 vec4 정렬이 아닙니다: ${bodyLines[i]}`);
      }
    }
  }

  if (!/struct\s+InkCapsuleSegment\s*\{/.test(wgsl)) {
    errors.push("필수 구조체 'struct InkCapsuleSegment'가 누락되었습니다.");
  }
  if (!/@group\(0\)\s*@binding\(0\)\s*var<uniform>/.test(wgsl)) {
    errors.push("@group(0) @binding(0) var<uniform> 선언이 누락되었습니다.");
  }
  if (!/@group\(0\)\s*@binding\(1\)\s*var<storage,\s*read>/.test(wgsl)) {
    errors.push("@group(0) @binding(1) var<storage, read> 캡슐 스토리지 선언이 누락되었습니다.");
  }
  if (!/@group\(0\)\s*@binding\(2\)\s*var\s+[a-zA-Z0-9_]+\s*:\s*texture_storage_2d</.test(wgsl)) {
    errors.push("@group(0) @binding(2) texture_storage_2d 출력 선언이 누락되었습니다.");
  }
  if (!/fn\s+sd_uneven_capsule\s*\(/.test(wgsl)) {
    errors.push("가변 폭 캡슐 SDF 함수 'fn sd_uneven_capsule'가 누락되었습니다.");
  }

  const entryPoints: string[] = [];
  const computeRegex = /@compute\s+@workgroup_size\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)\s+fn\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let match = computeRegex.exec(wgsl);
  while (match !== null) {
    entryPoints.push(match[1]);
    match = computeRegex.exec(wgsl);
  }
  const fragmentRegex = /@fragment\s+fn\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
  match = fragmentRegex.exec(wgsl);
  while (match !== null) {
    entryPoints.push(match[1]);
    match = fragmentRegex.exec(wgsl);
  }
  if (entryPoints.length === 0) {
    errors.push("@compute 또는 @fragment 진입점 함수가 선언되지 않았습니다.");
  }

  const glslForbiddenHits: string[] = [];
  for (let i = 0; i < GLSL_FORBIDDEN_RULES.length; i += 1) {
    const rule = GLSL_FORBIDDEN_RULES[i];
    if (rule.pattern.test(wgsl)) {
      glslForbiddenHits.push(rule.label);
      errors.push(`GLSL 금지 토큰 감지(${rule.label}): 순수 WGSL 구문을 사용해야 합니다.`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    lineCount: lines.length,
    entryPoints,
    uniformAligned16,
    glslForbiddenHits,
  };
}
