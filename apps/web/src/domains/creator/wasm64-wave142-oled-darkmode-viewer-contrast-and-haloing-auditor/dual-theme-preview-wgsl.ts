/**
 * Wave 142 — WebGPU WGSL 양면 뷰어 대비·눈부심 프리뷰 & 자동 림 글로우 셰이더 생성기 및 검증기.
 *
 * - 16바이트 정렬 64바이트 유니폼 구조체(`DualThemePreviewUniforms`)
 * - 좌측 라이트모드 / 우측 OLED 트루블랙 분할 비교 + 알파 엣지 자동 림 글로우 프래그먼트·컴퓨트 WGSL
 * - 괄호 균형, 바인딩, 16B 정렬, 비정상 리터럴, GLSL 금지어 정밀 검증
 */

export type DualThemePreviewMode =
  | "split-light-oled"
  | "quad-theme-matrix"
  | "luminance-shock-heatmap"
  | "auto-halo-remediation";

export interface DualThemeWgslBindingDescriptor {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: "uniform" | "storage-read" | "storage-read-write";
}

export interface DualThemePreviewWgslArtifact {
  readonly mode: DualThemePreviewMode;
  readonly wgsl: string;
  readonly uniformBufferByteLength: number;
  readonly bindings: readonly DualThemeWgslBindingDescriptor[];
  readonly entryPoints: readonly string[];
}

export interface DualThemeWgslValidationReport {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly lineCount: number;
}

interface PreviewModeSnippet {
  readonly modeIndex: number;
  readonly fragmentBody: string;
}

function getPreviewModeSnippet(mode: DualThemePreviewMode): PreviewModeSnippet {
  switch (mode) {
    case "split-light-oled":
      return {
        modeIndex: 0,
        fragmentBody: [
          "  let split_u = clamp(u_preview.viewport_and_split.z, 0.05, 0.95);",
          "  let is_dark_side = uv.x >= split_u;",
          "  let bg_rgb = select(u_preview.light_bg_and_gamma.xyz, u_preview.dark_bg_and_halo.xyz, is_dark_side);",
          "  let composed = compose_with_auto_halo(px, py, src, bg_rgb, halo_enabled);",
          "  let divider = 1.0 - smoothstep(0.0, 1.5 / max(w, 1.0), abs(uv.x - split_u));",
          "  let out_rgb = mix(composed, vec3<f32>(0.55, 0.78, 0.72), divider);",
          "  return vec4<f32>(out_rgb, 1.0);",
        ].join("\n"),
      };
    case "quad-theme-matrix":
      return {
        modeIndex: 1,
        fragmentBody: [
          "  let col = select(0u, 1u, uv.x >= 0.5);",
          "  let row = select(0u, 1u, uv.y >= 0.5);",
          "  var bg_rgb = u_preview.light_bg_and_gamma.xyz;",
          "  if (col == 1u && row == 0u) {",
          "    bg_rgb = vec3<f32>(0.904, 0.840, 0.687);",
          "  } else if (col == 0u && row == 1u) {",
          "    bg_rgb = vec3<f32>(0.006, 0.006, 0.008);",
          "  } else if (col == 1u && row == 1u) {",
          "    bg_rgb = u_preview.dark_bg_and_halo.xyz;",
          "  }",
          "  let out_rgb = compose_with_auto_halo(px, py, src, bg_rgb, halo_enabled);",
          "  return vec4<f32>(out_rgb, 1.0);",
        ].join("\n"),
      };
    case "luminance-shock-heatmap":
      return {
        modeIndex: 2,
        fragmentBody: [
          "  let cut_idx = min(u32(uv.y * f32(max(1u, arrayLength(&b_cut_luma)))), arrayLength(&b_cut_luma) - 1u);",
          "  let cut_meta = b_cut_luma[cut_idx];",
          "  let shock_delta = max(0.0, cut_meta.y - cut_meta.x);",
          "  let shock_ratio = clamp(shock_delta / max(u_preview.light_bg_and_gamma.w, 0.1), 0.0, 1.5);",
          "  let warn_heat = mix(vec3<f32>(0.12, 0.52, 0.42), vec3<f32>(0.92, 0.24, 0.18), clamp(shock_ratio, 0.0, 1.0));",
          "  let base_rgb = compose_with_auto_halo(px, py, src, u_preview.dark_bg_and_halo.xyz, halo_enabled);",
          "  let out_rgb = mix(base_rgb, warn_heat, 0.38 * smoothstep(0.65, 1.05, shock_ratio));",
          "  return vec4<f32>(out_rgb, 1.0);",
        ].join("\n"),
      };
    case "auto-halo-remediation":
      return {
        modeIndex: 3,
        fragmentBody: [
          "  let bg_rgb = u_preview.dark_bg_and_halo.xyz;",
          "  let out_rgb = compose_with_auto_halo(px, py, src, bg_rgb, 1.0);",
          "  return vec4<f32>(out_rgb, 1.0);",
        ].join("\n"),
      };
  }
}

/**
 * 양면 뷰어 대비·눈부심 프리뷰 및 알파 엣지 자동 림 글로우 WebGPU WGSL 셰이더를 생성한다.
 */
export function buildDualThemePreviewWgsl(
  mode: DualThemePreviewMode = "split-light-oled",
): DualThemePreviewWgslArtifact {
  const snippet = getPreviewModeSnippet(mode);
  const bindings: readonly DualThemeWgslBindingDescriptor[] = [
    { group: 0, binding: 0, name: "u_preview", addressSpace: "uniform" },
    { group: 0, binding: 1, name: "b_source_rgba", addressSpace: "storage-read" },
    { group: 0, binding: 2, name: "b_cut_luma", addressSpace: "storage-read" },
    { group: 0, binding: 3, name: "b_preview_out", addressSpace: "storage-read-write" },
    { group: 0, binding: 4, name: "b_audit_metrics", addressSpace: "storage-read-write" },
  ];

  const wgsl = `// Wave 142 OLED Dark vs Light Viewer Contrast & Auto-Rim Halo Preview WGSL (${mode}, mode_idx=${snippet.modeIndex})
// Uniform layout: 4 x 16B = 64 bytes (16-byte aligned)
struct DualThemePreviewUniforms {
  viewport_and_split: vec4<f32>,
  light_bg_and_gamma: vec4<f32>,
  dark_bg_and_halo: vec4<f32>,
  flags_and_mode: vec4<u32>,
};

@group(0) @binding(0) var<uniform> u_preview: DualThemePreviewUniforms;
@group(0) @binding(1) var<storage, read> b_source_rgba: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> b_cut_luma: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read_write> b_preview_out: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> b_audit_metrics: array<vec4<f32>>;

fn srgb_to_linear_channel(c: f32) -> f32 {
  let clamped = clamp(c, 0.0, 1.0);
  if (clamped <= 0.04045) {
    return clamped / 12.92;
  }
  return pow((clamped + 0.055) / 1.055, 2.4);
}

fn relative_luma_srgb(rgb: vec3<f32>) -> f32 {
  let r = srgb_to_linear_channel(rgb.x);
  let g = srgb_to_linear_channel(rgb.y);
  let b = srgb_to_linear_channel(rgb.z);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

fn wcag_contrast_ratio(fg_rgb: vec3<f32>, bg_rgb: vec3<f32>) -> f32 {
  let y1 = relative_luma_srgb(fg_rgb);
  let y2 = relative_luma_srgb(bg_rgb);
  let lighter = max(y1, y2);
  let darker = min(y1, y2);
  return (lighter + 0.05) / (darker + 0.05);
}

fn apca_screen_y(rgb: vec3<f32>) -> f32 {
  let c = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0));
  let y = 0.2126729 * pow(c.x, 2.4) + 0.7151522 * pow(c.y, 2.4) + 0.0721750 * pow(c.z, 2.4);
  if (y < 0.022) {
    return y + pow(0.022 - y, 1.414);
  }
  return y;
}

fn apca_contrast_lc(fg_rgb: vec3<f32>, bg_rgb: vec3<f32>) -> f32 {
  let y_txt = apca_screen_y(fg_rgb);
  let y_bg = apca_screen_y(bg_rgb);
  if (abs(y_bg - y_txt) < 0.0005) {
    return 0.0;
  }
  if (y_bg > y_txt) {
    let sapc = (pow(y_bg, 0.56) - pow(y_txt, 0.57)) * 1.14;
    if (sapc < 0.1) {
      return 0.0;
    }
    return (sapc - 0.027) * 100.0;
  }
  let sapc = (pow(y_bg, 0.65) - pow(y_txt, 0.62)) * 1.14;
  if (sapc > -0.1) {
    return 0.0;
  }
  return (sapc + 0.027) * 100.0;
}

fn sample_source_pixel(px: i32, py: i32) -> vec4<f32> {
  let w = max(1i, i32(u_preview.viewport_and_split.x));
  let h = max(1i, i32(u_preview.viewport_and_split.y));
  let cx = clamp(px, 0i, w - 1i);
  let cy = clamp(py, 0i, h - 1i);
  let idx = min(u32(cy * w + cx), arrayLength(&b_source_rgba) - 1u);
  return b_source_rgba[idx];
}

fn sample_alpha_edge_rim(px: i32, py: i32, radius_px: i32) -> f32 {
  let r = clamp(radius_px, 1i, 6i);
  var max_alpha = 0.0;
  max_alpha = max(max_alpha, sample_source_pixel(px + r, py).w);
  max_alpha = max(max_alpha, sample_source_pixel(px - r, py).w);
  max_alpha = max(max_alpha, sample_source_pixel(px, py + r).w);
  max_alpha = max(max_alpha, sample_source_pixel(px, py - r).w);
  max_alpha = max(max_alpha, sample_source_pixel(px + r, py + r).w);
  max_alpha = max(max_alpha, sample_source_pixel(px - r, py - r).w);
  max_alpha = max(max_alpha, sample_source_pixel(px + r, py - r).w);
  max_alpha = max(max_alpha, sample_source_pixel(px - r, py + r).w);
  return max_alpha;
}

fn compose_with_auto_halo(
  px: i32,
  py: i32,
  src: vec4<f32>,
  bg_rgb: vec3<f32>,
  halo_enabled: f32,
) -> vec3<f32> {
  let direct_rgb = mix(bg_rgb, src.xyz, clamp(src.w, 0.0, 1.0));
  if (halo_enabled < 0.5) {
    return direct_rgb;
  }
  let cr = wcag_contrast_ratio(src.xyz, bg_rgb);
  let lc = abs(apca_contrast_lc(src.xyz, bg_rgb));
  let needs_rim = select(0.0, 1.0, (cr < 3.0) || (lc < 45.0));
  let radius = max(1i, i32(round(u_preview.dark_bg_and_halo.w)));
  let dilated_alpha = sample_alpha_edge_rim(px, py, radius);
  let rim_mask = clamp(dilated_alpha - src.w, 0.0, 1.0) * needs_rim;
  let bg_luma = relative_luma_srgb(bg_rgb);
  let rim_color = select(vec3<f32>(0.975, 0.968, 0.948), vec3<f32>(0.06, 0.065, 0.085), bg_luma > 0.5);
  let with_rim = mix(bg_rgb, rim_color, rim_mask * 0.96);
  return mix(with_rim, src.xyz, clamp(src.w, 0.0, 1.0));
}

@compute @workgroup_size(64)
fn cs_dual_theme_contrast_audit(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= arrayLength(&b_source_rgba) || idx >= arrayLength(&b_audit_metrics) || idx >= arrayLength(&b_preview_out)) {
    return;
  }
  let w = max(1u, u32(u_preview.viewport_and_split.x));
  let px = i32(idx % w);
  let py = i32(idx / w);
  let src = b_source_rgba[idx];
  let light_bg = u_preview.light_bg_and_gamma.xyz;
  let dark_bg = u_preview.dark_bg_and_halo.xyz;

  let light_cr = wcag_contrast_ratio(mix(light_bg, src.xyz, src.w), light_bg);
  let dark_cr = wcag_contrast_ratio(mix(dark_bg, src.xyz, src.w), dark_bg);
  let dark_lc = abs(apca_contrast_lc(mix(dark_bg, src.xyz, src.w), dark_bg));
  let vanish_flag = select(0.0, 1.0, (src.w > 0.15) && ((dark_cr < 3.0) || (dark_lc < 45.0) || (light_cr < 3.0)));

  b_audit_metrics[idx] = vec4<f32>(light_cr, dark_cr, dark_lc, vanish_flag);
  let preview_rgb = compose_with_auto_halo(px, py, src, dark_bg, u_preview.viewport_and_split.w);
  b_preview_out[idx] = vec4<f32>(preview_rgb, 1.0);
}

@fragment
fn fs_dual_theme_split_preview(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {
  let w = max(1.0, u_preview.viewport_and_split.x);
  let h = max(1.0, u_preview.viewport_and_split.y);
  let uv = clamp(frag_coord.xy / vec2<f32>(w, h), vec2<f32>(0.0), vec2<f32>(1.0));
  let px = i32(max(frag_coord.x, 0.0));
  let py = i32(max(frag_coord.y, 0.0));
  let src = sample_source_pixel(px, py);
  let halo_enabled = u_preview.viewport_and_split.w;

${snippet.fragmentBody}
}
`;

  return {
    mode,
    wgsl,
    uniformBufferByteLength: 64,
    bindings,
    entryPoints: ["cs_dual_theme_contrast_audit", "fs_dual_theme_split_preview"],
  };
}

const FORBIDDEN_GLSL_PATTERNS: readonly { readonly label: string; readonly regex: RegExp }[] = [
  { label: "gl_FragCoord", regex: /\bgl_FragCoord\b/ },
  { label: "gl_FragColor", regex: /\bgl_FragColor\b/ },
  { label: "gl_Position", regex: /\bgl_Position\b/ },
  { label: "GLSL #version 지시어", regex: /(^|\n)\s*#version\b/ },
  { label: "GLSL vec2/3/4 생성자", regex: /\bvec[234]\s*\(/ },
  { label: "GLSL sampler2D", regex: /\bsampler2D\b/ },
  { label: "GLSL texture2D", regex: /\btexture2D\s*\(/ },
  { label: "GLSL dFdx/dFdy", regex: /\bdFd[xy]\s*\(/ },
  { label: "GLSL uniform 선언", regex: /(^|\n)\s*uniform\s+\w+/ },
  { label: "GLSL varying/attribute", regex: /\b(varying|attribute)\b/ },
];

/**
 * Wave 142 양면 뷰어 WGSL 셰이더의 구조·바인딩·16B 정렬·괄호 균형·GLSL 금지어를 검증한다.
 */
export function validateDualThemePreviewWgsl(
  artifact: DualThemePreviewWgslArtifact,
): DualThemeWgslValidationReport {
  const errors: string[] = [];
  const src = artifact.wgsl;

  if (src.trim().length === 0) {
    errors.push("WGSL 셰이더 본문이 비어 있습니다.");
  }
  if (
    artifact.uniformBufferByteLength !== 64 ||
    artifact.uniformBufferByteLength % 16 !== 0
  ) {
    errors.push("유니폼 버퍼 크기는 16바이트 정렬된 64바이트여야 합니다.");
  }
  if (src.includes("NaN") || src.includes("Infinity") || src.includes("undefined")) {
    errors.push("WGSL 본문에 비정상 리터럴(NaN/Infinity/undefined)이 포함되었습니다.");
  }
  if (!src.includes("struct DualThemePreviewUniforms")) {
    errors.push("필수 유니폼 구조체(DualThemePreviewUniforms) 선언이 누락되었습니다.");
  }
  for (let b = 0; b < 5; b += 1) {
    if (!src.includes(`@group(0) @binding(${b})`)) {
      errors.push(`필수 바인딩 @group(0) @binding(${b}) 선언이 누락되었습니다.`);
    }
  }
  if (!src.includes("@compute @workgroup_size(64)")) {
    errors.push("컴퓨트 셰이더 워크그룹(@compute @workgroup_size(64)) 선언이 누락되었습니다.");
  }
  if (!src.includes("@fragment")) {
    errors.push("프래그먼트 셰이더(@fragment) 선언이 누락되었습니다.");
  }
  for (let i = 0; i < artifact.entryPoints.length; i += 1) {
    const ep = artifact.entryPoints[i];
    if (ep !== undefined && !src.includes(`fn ${ep}`)) {
      errors.push(`선언된 엔트리포인트(${ep})가 본문에 없습니다.`);
    }
  }

  for (let i = 0; i < FORBIDDEN_GLSL_PATTERNS.length; i += 1) {
    const rule = FORBIDDEN_GLSL_PATTERNS[i];
    if (rule !== undefined && rule.regex.test(src)) {
      errors.push(`GLSL 금지 구문(${rule.label})이 감지되었습니다.`);
    }
  }

  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth -= 1;
    else if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    else if (ch === "[") bracketDepth += 1;
    else if (ch === "]") bracketDepth -= 1;
    if (braceDepth < 0 || parenDepth < 0 || bracketDepth < 0) {
      errors.push("WGSL 괄호 짝이 어긋났습니다.");
      break;
    }
  }
  if (braceDepth !== 0) errors.push("WGSL 중괄호가 닫히지 않았습니다.");
  if (parenDepth !== 0) errors.push("WGSL 소괄호가 닫히지 않았습니다.");
  if (bracketDepth !== 0) errors.push("WGSL 대괄호가 닫히지 않았습니다.");

  return {
    valid: errors.length === 0,
    errors,
    lineCount: src.split("\n").length,
  };
}
