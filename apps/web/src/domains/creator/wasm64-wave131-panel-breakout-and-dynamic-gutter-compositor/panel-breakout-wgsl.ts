/**
 * Wave 131 — WebGPU WGSL 스텐실-돌출 마스크 컴포지터 생성기 및 구조 검증기.
 *
 * - 16바이트 정렬 64B 유니폼(`BreakoutCompositorUniforms`)과 32B/16B 스토리지 버퍼를 사용한다.
 * - `@compute` 패스에서 임의 닫힌 만화 컷 다각형의 레이-크로싱 스텐실 마스크와
 *   테두리(`border_stroke_z`) 상위로 승격된 돌출 오버라이드 마스크(`breakout_z > border_stroke_z`)를 계산한다.
 * - `@vertex` / `@fragment` 패스에서 내부 클리핑 원화, 안티앨리어싱 컷 테두리,
 *   거터 위로 돌출된 전경 피사체를 Z-오더 순으로 합성한다.
 */

export interface PanelBreakoutWgslBindingSpec {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: "uniform" | "storage-read" | "storage-read-write";
  readonly strideBytes: number;
}

export interface PanelBreakoutWgslOptions {
  readonly workgroupSizeX?: number;
  readonly workgroupSizeY?: number;
  readonly borderAntiAliasPx?: number;
  readonly enableCollisionDebugOverlay?: boolean;
}

export interface PanelBreakoutStencilWgslArtifact {
  readonly wgsl: string;
  readonly uniformBufferByteLength: number;
  readonly edgeSegmentStrideBytes: number;
  readonly breakoutMaskStrideBytes: number;
  readonly tileStateStrideBytes: number;
  readonly workgroupSizeX: number;
  readonly workgroupSizeY: number;
  readonly bindings: readonly PanelBreakoutWgslBindingSpec[];
  readonly entryPoints: readonly string[];
}

export interface PanelBreakoutStencilWgslValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly lineCount: number;
  readonly bindingCount: number;
}

function clampWgSize(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(32, Math.round(value)));
}

/**
 * 64B 16바이트 정렬 유니폼과 스텐실 클립·돌출 오버라이드 마스크 패스를 포함한
 * WebGPU WGSL 셰이더 아티팩트를 생성한다.
 */
export function buildPanelBreakoutStencilWgsl(
  options?: PanelBreakoutWgslOptions,
): PanelBreakoutStencilWgslArtifact {
  const wgX = clampWgSize(options?.workgroupSizeX, 8);
  const wgY = clampWgSize(options?.workgroupSizeY, 8);
  const aaPx =
    options?.borderAntiAliasPx !== undefined && Number.isFinite(options.borderAntiAliasPx)
      ? Math.max(0.25, Math.min(4.0, options.borderAntiAliasPx))
      : 1.25;
  const debugFlag = options?.enableCollisionDebugOverlay ? "1.0" : "0.0";

  const bindings: readonly PanelBreakoutWgslBindingSpec[] = [
    {
      group: 0,
      binding: 0,
      name: "u_compositor",
      addressSpace: "uniform",
      strideBytes: 64,
    },
    {
      group: 0,
      binding: 1,
      name: "panel_edges",
      addressSpace: "storage-read",
      strideBytes: 32,
    },
    {
      group: 0,
      binding: 2,
      name: "breakout_masks",
      addressSpace: "storage-read",
      strideBytes: 32,
    },
    {
      group: 0,
      binding: 3,
      name: "compositor_tiles",
      addressSpace: "storage-read-write",
      strideBytes: 16,
    },
  ];

  const wgsl = `// Wave 131 Comic Panel-Breakout Stencil & Z-Order Dynamic Gutter Compositor WGSL
struct BreakoutCompositorUniforms {
  canvas_and_gutter: vec4<f32>,
  panel_clip_meta: vec4<f32>,
  breakout_z_params: vec4<f32>,
  border_and_aa: vec4<f32>,
};

struct PanelEdgeSegment {
  p0_p1: vec4<f32>,
  meta_z: vec4<f32>,
};

struct BreakoutLayerMask {
  bounds_rect: vec4<f32>,
  z_and_mode: vec4<f32>,
};

struct CompositorTileState {
  resolved_meta: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> u_compositor: BreakoutCompositorUniforms;

@group(0) @binding(1)
var<storage, read> panel_edges: array<PanelEdgeSegment>;

@group(0) @binding(2)
var<storage, read> breakout_masks: array<BreakoutLayerMask>;

@group(0) @binding(3)
var<storage, read_write> compositor_tiles: array<CompositorTileState>;

fn dist_point_to_segment(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
  let ab = b - a;
  let denom = max(dot(ab, ab), 1e-6);
  let t = clamp(dot(p - a, ab) / denom, 0.0, 1.0);
  let proj = a + ab * t;
  return length(p - proj);
}

fn evaluate_panel_stencil(px: vec2<f32>, panel_index: u32) -> vec2<f32> {
  let edge_count = arrayLength(&panel_edges);
  var crossings: u32 = 0u;
  var min_edge_dist: f32 = 1e6;

  for (var i: u32 = 0u; i < edge_count; i = i + 1u) {
    let seg = panel_edges[i];
    let seg_panel = u32(max(seg.meta_z.x, 0.0));
    if (seg_panel != panel_index) {
      continue;
    }
    let a = seg.p0_p1.xy;
    let b = seg.p0_p1.zw;
    min_edge_dist = min(min_edge_dist, dist_point_to_segment(px, a, b));

    let crosses_y = (a.y > px.y) != (b.y > px.y);
    if (crosses_y) {
      let dy = select(b.y - a.y, 1e-5, abs(b.y - a.y) < 1e-5);
      let x_hit = a.x + ((px.y - a.y) * (b.x - a.x)) / dy;
      if (px.x < x_hit) {
        crossings = crossings + 1u;
      }
    }
  }

  let inside_mask = select(0.0, 1.0, (crossings & 1u) == 1u);
  return vec2<f32>(inside_mask, min_edge_dist);
}

fn evaluate_breakout_override(px: vec2<f32>, border_z: f32) -> vec2<f32> {
  let mask_count = arrayLength(&breakout_masks);
  var best_z: f32 = border_z;
  var override_flag: f32 = 0.0;

  for (var i: u32 = 0u; i < mask_count; i = i + 1u) {
    let bm = breakout_masks[i];
    let in_rect =
      px.x >= bm.bounds_rect.x &&
      px.x <= bm.bounds_rect.z &&
      px.y >= bm.bounds_rect.y &&
      px.y <= bm.bounds_rect.w;
    if (in_rect && bm.z_and_mode.x > best_z && bm.z_and_mode.y >= 1.0) {
      best_z = bm.z_and_mode.x;
      override_flag = 1.0;
    }
  }

  return vec2<f32>(override_flag, best_z);
}

@compute @workgroup_size(${wgX}, ${wgY}, 1)
fn cs_panel_stencil_breakout_mask(@builtin(global_invocation_id) gid: vec3<u32>) {
  let tile_cols = max(u32(u_compositor.panel_clip_meta.z), 1u);
  let tile_rows = max(u32(u_compositor.panel_clip_meta.w), 1u);
  if (gid.x >= tile_cols || gid.y >= tile_rows) {
    return;
  }

  let tile_idx = gid.y * tile_cols + gid.x;
  if (tile_idx >= arrayLength(&compositor_tiles)) {
    return;
  }

  let cell_x = (f32(gid.x) + 0.5) * (u_compositor.canvas_and_gutter.x / f32(tile_cols));
  let cell_y = (f32(gid.y) + 0.5) * (u_compositor.canvas_and_gutter.y / f32(tile_rows));
  let px = vec2<f32>(cell_x, cell_y);

  let active_panel = u32(max(u_compositor.panel_clip_meta.x, 0.0));
  let stencil_res = evaluate_panel_stencil(px, active_panel);
  let border_z = u_compositor.breakout_z_params.x;
  let breakout_res = evaluate_breakout_override(px, border_z);
  let composite_visible = max(stencil_res.x, breakout_res.x);

  compositor_tiles[tile_idx] = CompositorTileState(
    vec4<f32>(stencil_res.x, breakout_res.x, breakout_res.y, composite_visible),
  );
}

struct BreakoutVertOut {
  @builtin(position) clip_pos: vec4<f32>,
  @location(0) canvas_px: vec2<f32>,
  @location(1) uv: vec2<f32>,
};

@vertex
fn vs_panel_breakout_quad(@builtin(vertex_index) vid: u32) -> BreakoutVertOut {
  var positions = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0),
    vec2<f32>(1.0, -1.0),
    vec2<f32>(1.0, 1.0),
  );
  let p = positions[vid % 6u];
  var out: BreakoutVertOut;
  out.clip_pos = vec4<f32>(p, 0.0, 1.0);
  out.uv = vec2<f32>(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  out.canvas_px = out.uv * max(u_compositor.canvas_and_gutter.xy, vec2<f32>(1.0, 1.0));
  return out;
}

@fragment
fn fs_panel_breakout_composite(in_v: BreakoutVertOut) -> @location(0) vec4<f32> {
  let active_panel = u32(max(u_compositor.panel_clip_meta.x, 0.0));
  let stencil_res = evaluate_panel_stencil(in_v.canvas_px, active_panel);
  let inside_clip = stencil_res.x;
  let edge_dist = stencil_res.y;

  let border_half_w = max(u_compositor.border_and_aa.x * 0.5, 0.0);
  let aa = max(fwidth(edge_dist), max(u_compositor.border_and_aa.y, ${aaPx.toFixed(2)}));
  let border_mask = select(0.0, 1.0 - smoothstep(border_half_w - aa, border_half_w + aa, edge_dist), border_half_w > 0.01);

  let border_z = u_compositor.breakout_z_params.x;
  let breakout_res = evaluate_breakout_override(in_v.canvas_px, border_z);
  let breakout_override = breakout_res.x;

  // 스텐실 내부 원화 -> 컷 테두리 선 -> 테두리 상위 돌출 피사체 순 Z-합성
  let gutter_color = vec3<f32>(0.97, 0.96, 0.94);
  let panel_art_color = vec3<f32>(0.88, 0.91, 0.90);
  let border_color = vec3<f32>(0.14, 0.17, 0.16);
  let breakout_color = vec3<f32>(0.82, 0.34, 0.24);

  var rgb = mix(gutter_color, panel_art_color, inside_clip);
  rgb = mix(rgb, border_color, border_mask);
  rgb = mix(rgb, breakout_color, breakout_override);

  let debug_overlay = ${debugFlag};
  if (debug_overlay > 0.5 && breakout_override > 0.5 && inside_clip < 0.5) {
    rgb = mix(rgb, vec3<f32>(0.95, 0.62, 0.18), 0.35);
  }

  return vec4<f32>(clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
`;

  return {
    wgsl,
    uniformBufferByteLength: 64,
    edgeSegmentStrideBytes: 32,
    breakoutMaskStrideBytes: 32,
    tileStateStrideBytes: 16,
    workgroupSizeX: wgX,
    workgroupSizeY: wgY,
    bindings,
    entryPoints: [
      "cs_panel_stencil_breakout_mask",
      "vs_panel_breakout_quad",
      "fs_panel_breakout_composite",
    ],
  };
}

/**
 * Wave 131 스텐실-돌출 마스크 WGSL 셰이더의 구조·바인딩·16바이트 정렬·괄호 균형·
 * 엔트리 포인트·GLSL 금지어를 검증한다.
 */
export function validatePanelBreakoutStencilWgsl(
  input: PanelBreakoutStencilWgslArtifact | string,
): PanelBreakoutStencilWgslValidationResult {
  const wgsl = typeof input === "string" ? input : input.wgsl;
  const errors: string[] = [];

  if (!wgsl || wgsl.trim().length === 0) {
    return {
      valid: false,
      errors: ["WGSL source is empty."],
      lineCount: 0,
      bindingCount: 0,
    };
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

    if (braceDepth < 0 || parenDepth < 0 || bracketDepth < 0) {
      errors.push("Unbalanced delimiter encountered in WGSL source.");
      break;
    }
  }
  if (braceDepth !== 0) errors.push(`Unbalanced curly braces (depth=${braceDepth}).`);
  if (parenDepth !== 0) errors.push(`Unbalanced parentheses (depth=${parenDepth}).`);
  if (bracketDepth !== 0) errors.push(`Unbalanced square brackets (depth=${bracketDepth}).`);

  const bindingMatches = wgsl.match(/@group\(\d+\)\s*@binding\(\d+\)/g) ?? [];
  for (let b = 0; b < 4; b += 1) {
    if (!new RegExp(`@group\\(0\\)\\s*@binding\\(${b}\\)`).test(wgsl)) {
      errors.push(`Missing required @group(0) @binding(${b}) declaration.`);
    }
  }

  if (!/@compute\s+@workgroup_size\(\d+/.test(wgsl)) {
    errors.push("Missing @compute @workgroup_size entry point.");
  }
  if (!/@vertex/.test(wgsl)) {
    errors.push("Missing @vertex entry point.");
  }
  if (!/@fragment/.test(wgsl)) {
    errors.push("Missing @fragment entry point.");
  }
  if (!/\bevaluate_panel_stencil\b/.test(wgsl)) {
    errors.push("Missing panel stencil evaluation routine.");
  }
  if (!/\bevaluate_breakout_override\b/.test(wgsl)) {
    errors.push("Missing breakout override mask evaluation routine.");
  }
  if (!/\bfwidth\s*\(/.test(wgsl) || !/\bsmoothstep\s*\(/.test(wgsl)) {
    errors.push("Missing fwidth()/smoothstep() border anti-aliasing.");
  }
  if (/\b(?:NaN|Infinity|undefined)\b/.test(wgsl)) {
    errors.push("WGSL source contains non-finite or undefined token.");
  }
  if (
    /\b(?:gl_FragColor|gl_Position|dFdx|dFdy|texture2D|sampler2D|varying|attribute|gl_FragCoord)\b/.test(
      wgsl,
    )
  ) {
    errors.push("WGSL source contains forbidden GLSL keyword.");
  }

  if (typeof input !== "string") {
    if (input.uniformBufferByteLength !== 64 || input.uniformBufferByteLength % 16 !== 0) {
      errors.push("uniformBufferByteLength must be 64 bytes (16-byte aligned).");
    }
    if (input.edgeSegmentStrideBytes < 16 || input.edgeSegmentStrideBytes % 16 !== 0) {
      errors.push("edgeSegmentStrideBytes must be a positive multiple of 16 bytes.");
    }
    if (input.breakoutMaskStrideBytes < 16 || input.breakoutMaskStrideBytes % 16 !== 0) {
      errors.push("breakoutMaskStrideBytes must be a positive multiple of 16 bytes.");
    }
    if (input.tileStateStrideBytes < 16 || input.tileStateStrideBytes % 16 !== 0) {
      errors.push("tileStateStrideBytes must be a positive multiple of 16 bytes.");
    }
    for (let i = 0; i < input.bindings.length; i += 1) {
      const spec = input.bindings[i];
      if (!spec) continue;
      if (spec.strideBytes < 16 || spec.strideBytes % 16 !== 0) {
        errors.push(`Binding '${spec.name}' strideBytes (${spec.strideBytes}) is not 16-byte aligned.`);
      }
    }
    for (let i = 0; i < input.entryPoints.length; i += 1) {
      const ep = input.entryPoints[i];
      if (ep && !new RegExp(`fn\\s+${ep}\\s*\\(`).test(wgsl)) {
        errors.push(`Declared entry point '${ep}' not found in WGSL source.`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    lineCount: wgsl.split("\n").length,
    bindingCount: bindingMatches.length,
  };
}
