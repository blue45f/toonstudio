/**
 * Wave 156 — WebGPU WGSL 다중 링 SDF(fill → inner stroke → outer halo → drop offset)
 * SFX 아웃라인 & 거친 브러시 엣지 셰이더 생성기 및 정적 검증기.
 *
 * - 16바이트 정렬 64B 유니폼(`SfxSdfOutlineUniforms`, 4 × vec4<f32>)
 * - 화면 공간 미분 `fwidth` 기반 안티앨리어싱 + 절차적 드라이 브러시 엣지 노이즈
 * - 괄호 균형, 바인딩 중복, 16B·64B 유니폼 정렬, `fwidth` 사용, GLSL 금지어 검증
 */

import { clampFinite } from "./sfx-coons-envelope-warp";
import {
  clampSrgb,
  type AdaptiveSfxOutlineSolution,
  type SrgbColor,
} from "./sfx-contrast-outline-solver";

export interface BuildSfxSdfOutlineWgslOptions {
  readonly outline?: AdaptiveSfxOutlineSolution;
  readonly brushRoughness?: number;
  readonly brushFrequency?: number;
  readonly dropShadowAlpha?: number;
  readonly sdfSpreadPx?: number;
}

export interface SfxWgslBindingDescriptor {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: "uniform" | "texture" | "sampler" | "storage-read";
}

export interface SfxSdfOutlineWgslArtifact {
  readonly uniformStructName: string;
  readonly uniformBufferByteLength: number;
  readonly bindings: readonly SfxWgslBindingDescriptor[];
  readonly entryPoints: readonly string[];
  readonly lineCount: number;
  readonly wgsl: string;
}

export interface SfxSdfOutlineWgslValidationReport {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly entryPoints: readonly string[];
  readonly bindingCount: number;
  readonly uniformBufferByteLength: number;
  readonly uniformBufferAligned: boolean;
  readonly hasVertexEntry: boolean;
  readonly hasFragmentEntry: boolean;
  readonly usesFwidthAa: boolean;
  readonly lineCount: number;
}

function fmtWgslF32(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const fixed = safe.toFixed(6);
  return fixed.indexOf(".") >= 0 ? fixed : `${fixed}.0`;
}

function formatVec3Constant(color: SrgbColor): string {
  const c = clampSrgb(color);
  return `vec3<f32>(${fmtWgslF32(c.r)}, ${fmtWgslF32(c.g)}, ${fmtWgslF32(c.b)})`;
}

/**
 * 16바이트 정렬 64B 유니폼과 멀티링 SDF(`fill → inner stroke → outer halo → drop offset`),
 * `fwidth` 안티앨리어싱, 거친 브러시 엣지 변조를 포함한 WebGPU WGSL 셰이더를 생성한다.
 */
export function buildSfxSdfOutlineWgsl(
  options?: BuildSfxSdfOutlineWgslOptions,
): SfxSdfOutlineWgslArtifact {
  const outline = options?.outline;
  const fillColor: SrgbColor = outline?.fillSrgb ?? { r: 0.94, g: 0.24, b: 0.16 };
  const innerColor: SrgbColor = outline?.innerOutlineSrgb ?? { r: 0.02, g: 0.02, b: 0.03 };
  const outerColor: SrgbColor = outline?.outerHaloSrgb ?? { r: 0.99, g: 0.99, b: 0.98 };
  const dropColor: SrgbColor = {
    r: innerColor.r * 0.35,
    g: innerColor.g * 0.35,
    b: innerColor.b * 0.40,
  };

  const sdfSpreadPx = clampFinite(options?.sdfSpreadPx ?? 24.0, 4.0, 128.0, 24.0);
  const defaultInnerSdf = clampFinite((outline?.innerStrokePx ?? 6.0) / sdfSpreadPx, 0.0, 0.45, 0.25);
  const defaultOuterSdf = clampFinite((outline?.outerHaloPx ?? 8.0) / sdfSpreadPx, 0.0, 0.45, 0.33);
  const brushRoughness = clampFinite(options?.brushRoughness ?? 0.028, 0.0, 0.25, 0.028);
  const brushFrequency = clampFinite(options?.brushFrequency ?? 38.0, 2.0, 256.0, 38.0);
  const dropAlpha = clampFinite(options?.dropShadowAlpha ?? 0.58, 0.0, 1.0, 0.58);

  const lines: readonly string[] = [
    "// Wave 156 WebGPU Multi-Ring SDF SFX Outline & Rough Brush Edge Shader",
    "// Uniform struct layout: 4 x vec4<f32> = 64 bytes (strictly 16-byte aligned)",
    "struct SfxSdfOutlineUniforms {",
    "  fill_rgba: vec4<f32>,",
    "  inner_outline_rgba: vec4<f32>,",
    "  outer_halo_rgba: vec4<f32>,",
    "  ring_and_brush_params: vec4<f32>,",
    "};",
    "",
    "struct SfxVertexOut {",
    "  @builtin(position) position: vec4<f32>,",
    "  @location(0) uv: vec2<f32>,",
    "};",
    "",
    "@group(0) @binding(0) var<uniform> u_sfx: SfxSdfOutlineUniforms;",
    "@group(0) @binding(1) var sfx_sdf_tex: texture_2d<f32>;",
    "@group(0) @binding(2) var sfx_sdf_sampler: sampler;",
    "@group(0) @binding(3) var<storage, read> coons_patch_ctrl: array<vec4<f32>>;",
    "",
    `const DEFAULT_FILL_RGB: vec3<f32> = ${formatVec3Constant(fillColor)};`,
    `const DEFAULT_INNER_RGB: vec3<f32> = ${formatVec3Constant(innerColor)};`,
    `const DEFAULT_OUTER_RGB: vec3<f32> = ${formatVec3Constant(outerColor)};`,
    `const DROP_SHADOW_RGB: vec3<f32> = ${formatVec3Constant(dropColor)};`,
    `const DEFAULT_INNER_SDF: f32 = ${fmtWgslF32(defaultInnerSdf)};`,
    `const DEFAULT_OUTER_SDF: f32 = ${fmtWgslF32(defaultOuterSdf)};`,
    `const DEFAULT_BRUSH_ROUGHNESS: f32 = ${fmtWgslF32(brushRoughness)};`,
    `const DEFAULT_BRUSH_FREQ: f32 = ${fmtWgslF32(brushFrequency)};`,
    `const DROP_SHADOW_ALPHA: f32 = ${fmtWgslF32(dropAlpha)};`,
    "",
    "fn hash21(p_in: vec2<f32>) -> f32 {",
    "  let p = fract(p_in * vec2<f32>(123.34, 456.21));",
    "  let d = dot(p, p + vec2<f32>(45.32, 45.32));",
    "  return fract((p.x + d) * (p.y + d));",
    "}",
    "",
    "fn value_noise_2d(p: vec2<f32>) -> f32 {",
    "  let i = floor(p);",
    "  let f = fract(p);",
    "  let u = f * f * (vec2<f32>(3.0, 3.0) - 2.0 * f);",
    "  let a = hash21(i + vec2<f32>(0.0, 0.0));",
    "  let b = hash21(i + vec2<f32>(1.0, 0.0));",
    "  let c = hash21(i + vec2<f32>(0.0, 1.0));",
    "  let d = hash21(i + vec2<f32>(1.0, 1.0));",
    "  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);",
    "}",
    "",
    "fn rough_brush_edge_offset(uv: vec2<f32>, freq: f32, roughness: f32) -> f32 {",
    "  let n1 = value_noise_2d(uv * freq);",
    "  let n2 = value_noise_2d(uv * (freq * 2.13) + vec2<f32>(11.7, 5.3));",
    "  let combined = (n1 * 0.65 + n2 * 0.35) - 0.5;",
    "  return combined * roughness;",
    "}",
    "",
    "fn eval_cubic_bezier(p0: vec2<f32>, p1: vec2<f32>, p2: vec2<f32>, p3: vec2<f32>, t_in: f32) -> vec2<f32> {",
    "  let t = clamp(t_in, 0.0, 1.0);",
    "  let omt = 1.0 - t;",
    "  let b0 = omt * omt * omt;",
    "  let b1 = 3.0 * omt * omt * t;",
    "  let b2 = 3.0 * omt * t * t;",
    "  let b3 = t * t * t;",
    "  return p0 * b0 + p1 * b1 + p2 * b2 + p3 * b3;",
    "}",
    "",
    "fn eval_coons_patch(uv: vec2<f32>) -> vec2<f32> {",
    "  let u = clamp(uv.x, 0.0, 1.0);",
    "  let v = clamp(uv.y, 0.0, 1.0);",
    "  let t_u = eval_cubic_bezier(coons_patch_ctrl[0].xy, coons_patch_ctrl[1].xy, coons_patch_ctrl[2].xy, coons_patch_ctrl[3].xy, u);",
    "  let b_u = eval_cubic_bezier(coons_patch_ctrl[4].xy, coons_patch_ctrl[5].xy, coons_patch_ctrl[6].xy, coons_patch_ctrl[7].xy, u);",
    "  let l_v = eval_cubic_bezier(coons_patch_ctrl[8].xy, coons_patch_ctrl[9].xy, coons_patch_ctrl[10].xy, coons_patch_ctrl[11].xy, v);",
    "  let r_v = eval_cubic_bezier(coons_patch_ctrl[12].xy, coons_patch_ctrl[13].xy, coons_patch_ctrl[14].xy, coons_patch_ctrl[15].xy, v);",
    "  let p00 = coons_patch_ctrl[0].xy;",
    "  let p10 = coons_patch_ctrl[3].xy;",
    "  let p01 = coons_patch_ctrl[4].xy;",
    "  let p11 = coons_patch_ctrl[7].xy;",
    "  let bilin = (1.0 - u) * (1.0 - v) * p00 + u * (1.0 - v) * p10 + (1.0 - u) * v * p01 + u * v * p11;",
    "  return (1.0 - v) * t_u + v * b_u + (1.0 - u) * l_v + u * r_v - bilin;",
    "}",
    "",
    "fn composite_over(fg: vec4<f32>, bg: vec4<f32>) -> vec4<f32> {",
    "  let out_a = fg.a + bg.a * (1.0 - fg.a);",
    "  if (out_a <= 0.00001) {",
    "    return vec4<f32>(0.0, 0.0, 0.0, 0.0);",
    "  }",
    "  let out_rgb = (fg.rgb * fg.a + bg.rgb * bg.a * (1.0 - fg.a)) / out_a;",
    "  return vec4<f32>(out_rgb, out_a);",
    "}",
    "",
    "@vertex",
    "fn vs_sfx_coons_quad(@builtin(vertex_index) vid: u32) -> SfxVertexOut {",
    "  var uv_table = array<vec2<f32>, 6>(",
    "    vec2<f32>(0.0, 0.0),",
    "    vec2<f32>(1.0, 0.0),",
    "    vec2<f32>(0.0, 1.0),",
    "    vec2<f32>(0.0, 1.0),",
    "    vec2<f32>(1.0, 0.0),",
    "    vec2<f32>(1.0, 1.0)",
    "  );",
    "  let uv = uv_table[min(vid, 5u)];",
    "  let warped = eval_coons_patch(uv);",
    "  var out_v: SfxVertexOut;",
    "  out_v.position = vec4<f32>(warped * 2.0 - vec2<f32>(1.0, 1.0), 0.0, 1.0);",
    "  out_v.uv = uv;",
    "  return out_v;",
    "}",
    "",
    "@fragment",
    "fn fs_sfx_multi_ring_sdf(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {",
    "  let fill_rgb = select(DEFAULT_FILL_RGB, u_sfx.fill_rgba.rgb, u_sfx.fill_rgba.a > 0.0);",
    "  let inner_rgb = select(DEFAULT_INNER_RGB, u_sfx.inner_outline_rgba.rgb, u_sfx.inner_outline_rgba.a > 0.0);",
    "  let outer_rgb = select(DEFAULT_OUTER_RGB, u_sfx.outer_halo_rgba.rgb, u_sfx.outer_halo_rgba.a > 0.0);",
    "  let inner_w = select(DEFAULT_INNER_SDF, max(0.0, u_sfx.inner_outline_rgba.a), u_sfx.inner_outline_rgba.a > 0.0);",
    "  let outer_w = select(DEFAULT_OUTER_SDF, max(0.0, u_sfx.outer_halo_rgba.a), u_sfx.outer_halo_rgba.a > 0.0);",
    "  let drop_offset = u_sfx.ring_and_brush_params.xy;",
    "  let roughness = max(0.0, select(DEFAULT_BRUSH_ROUGHNESS, u_sfx.ring_and_brush_params.z, u_sfx.ring_and_brush_params.z > 0.0));",
    "  let freq = max(1.0, select(DEFAULT_BRUSH_FREQ, u_sfx.ring_and_brush_params.w, u_sfx.ring_and_brush_params.w > 0.0));",
    "",
    "  let sd_base = textureSample(sfx_sdf_tex, sfx_sdf_sampler, uv).r - 0.5;",
    "  let sd_drop = textureSample(sfx_sdf_tex, sfx_sdf_sampler, uv - drop_offset).r - 0.5;",
    "  let aa = max(0.0012, fwidth(sd_base) * 0.75);",
    "  let brush_jitter = rough_brush_edge_offset(uv, freq, roughness);",
    "",
    "  let fill_cov = 1.0 - smoothstep(-aa, aa, sd_base + brush_jitter * 0.35);",
    "  let inner_cov = 1.0 - smoothstep(inner_w - aa, inner_w + aa, sd_base + brush_jitter * 0.75);",
    "  let outer_radius = inner_w + outer_w;",
    "  let outer_cov = 1.0 - smoothstep(outer_radius - aa, outer_radius + aa, sd_base + brush_jitter);",
    "  let drop_cov = (1.0 - smoothstep(outer_radius - aa, outer_radius + aa, sd_drop + brush_jitter)) * DROP_SHADOW_ALPHA;",
    "",
    "  let layer_drop = vec4<f32>(DROP_SHADOW_RGB, drop_cov);",
    "  let layer_outer = vec4<f32>(outer_rgb, outer_cov);",
    "  let layer_inner = vec4<f32>(inner_rgb, inner_cov);",
    "  let layer_fill = vec4<f32>(fill_rgb, fill_cov);",
    "",
    "  var accum = composite_over(layer_outer, layer_drop);",
    "  accum = composite_over(layer_inner, accum);",
    "  accum = composite_over(layer_fill, accum);",
    "  return accum;",
    "}",
  ];

  const bindings: readonly SfxWgslBindingDescriptor[] = [
    { group: 0, binding: 0, name: "u_sfx", addressSpace: "uniform" },
    { group: 0, binding: 1, name: "sfx_sdf_tex", addressSpace: "texture" },
    { group: 0, binding: 2, name: "sfx_sdf_sampler", addressSpace: "sampler" },
    { group: 0, binding: 3, name: "coons_patch_ctrl", addressSpace: "storage-read" },
  ];

  return {
    uniformStructName: "SfxSdfOutlineUniforms",
    uniformBufferByteLength: 64,
    bindings,
    entryPoints: ["vs_sfx_coons_quad", "fs_sfx_multi_ring_sdf"],
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
  { label: "dFdx/dFdy", regex: /\bdFd[xy]\s*\(/ },
  { label: "GLSL vec2(...)", regex: /\bvec2\s*\(/ },
  { label: "GLSL vec3(...)", regex: /\bvec3\s*\(/ },
  { label: "GLSL vec4(...)", regex: /\bvec4\s*\(/ },
  { label: "GLSL uniform 선언", regex: /(?:^|\n)\s*uniform\s+\w+/ },
];

/**
 * WGSL 다중 링 SDF 셰이더의 괄호 균형, 바인딩 중복, 16바이트 정렬 64B 유니폼,
 * `fwidth` 안티앨리어싱, 진입점 및 GLSL 금지어 오염 여부를 정적으로 검증한다.
 */
export function validateSfxSdfOutlineWgsl(
  wgsl: string,
): SfxSdfOutlineWgslValidationReport {
  const errors: string[] = [];
  if (typeof wgsl !== "string" || wgsl.trim().length === 0) {
    return {
      valid: false,
      errors: ["WGSL 소스가 비어 있습니다."],
      entryPoints: [],
      bindingCount: 0,
      uniformBufferByteLength: 0,
      uniformBufferAligned: false,
      hasVertexEntry: false,
      hasFragmentEntry: false,
      usesFwidthAa: false,
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

  // 5. 64B(16바이트 정렬) 유니폼 구조체 검사
  let uniformBufferByteLength = 0;
  let uniformBufferAligned = false;
  const structMatch = /struct\s+SfxSdfOutlineUniforms\s*\{([^}]*)\}/.exec(stripped);
  if (structMatch === null) {
    errors.push("필수 유니폼 구조체 SfxSdfOutlineUniforms가 선언되지 않았습니다.");
  } else {
    const bodyFields = structMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (bodyFields.length === 0) {
      errors.push("SfxSdfOutlineUniforms 구조체에 필드가 없습니다.");
    } else {
      let fieldError = false;
      for (let i = 0; i < bodyFields.length; i += 1) {
        const field = bodyFields[i];
        if (/:\s*vec4<(?:f32|u32|i32)>/.test(field)) {
          uniformBufferByteLength += 16;
        } else if (/:\s*mat4x4<f32>/.test(field)) {
          uniformBufferByteLength += 64;
        } else {
          errors.push(`유니폼 필드가 16바이트 정렬 타입(vec4/mat4x4)이 아닙니다: ${field}`);
          fieldError = true;
        }
      }
      uniformBufferAligned =
        !fieldError &&
        uniformBufferByteLength === 64 &&
        uniformBufferByteLength % 16 === 0;
      if (!fieldError && uniformBufferByteLength !== 64) {
        errors.push(
          `SfxSdfOutlineUniforms 크기가 64B 규격과 다릅니다(실측 ${String(uniformBufferByteLength)}B).`,
        );
      }
    }
  }

  // 6. fwidth 안티앨리어싱 확인
  const usesFwidthAa = /\bfwidth\s*\(/.test(stripped);
  if (!usesFwidthAa) {
    errors.push("SDF 화면 공간 안티앨리어싱을 위한 fwidth(...) 호출이 누락되었습니다.");
  }

  // 7. 진입점 검사
  const entryPoints: string[] = [];
  const vertexRegex = /@vertex\s+fn\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let hasVertexEntry = false;
  let vMatch = vertexRegex.exec(stripped);
  while (vMatch !== null) {
    hasVertexEntry = true;
    entryPoints.push(vMatch[1]);
    vMatch = vertexRegex.exec(stripped);
  }

  const fragmentRegex = /@fragment\s+fn\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let hasFragmentEntry = false;
  let fMatch = fragmentRegex.exec(stripped);
  while (fMatch !== null) {
    hasFragmentEntry = true;
    entryPoints.push(fMatch[1]);
    fMatch = fragmentRegex.exec(stripped);
  }

  if (!hasFragmentEntry) {
    errors.push("@fragment 진입점이 누락되었습니다.");
  }

  return {
    valid: errors.length === 0,
    errors,
    entryPoints,
    bindingCount,
    uniformBufferByteLength,
    uniformBufferAligned,
    hasVertexEntry,
    hasFragmentEntry,
    usesFwidthAa,
    lineCount: lines.length,
  };
}
