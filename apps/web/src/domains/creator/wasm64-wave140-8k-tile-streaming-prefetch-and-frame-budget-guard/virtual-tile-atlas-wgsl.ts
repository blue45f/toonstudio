/**
 * Wave 140 — WebGPU 가상 타일 페이지 테이블(Indirection Atlas) 합성 셰이더 WGSL 빌더 및 검증기.
 *
 * - 16바이트 정렬 유니폼(`VirtualAtlasUniforms`, 80B)과 페이지 테이블 스토리지(`TilePageTableEntry`, 16B)를 사용한다.
 * - 가상 캔버스 좌표 → 페이지 테이블 조회 → 미도착 시 상위 저해상도 MIP(`start_mip..MAX_MIP_LEVEL`)로
 *   자동 체인 폴백 샘플링하는 `@compute` 및 `@fragment` 진입점을 생성한다.
 * - 괄호 균형, 바인딩 선언, 16B 구조체 정렬, GLSL 금지어 및 비유한 수치를 정적 검증한다.
 */

import { clampFinite, clampInt, sha256TileStreamingHex } from "./tile-streaming-sha256";
import {
  DEFAULT_TILE_SIZE_PX,
  MAX_TILE_MIP_LEVEL,
  type TileMipLevel,
} from "./tile-pyramid-and-prefetch";

export interface BuildVirtualTileAtlasWgslOptions {
  readonly workgroupSizeX?: number;
  readonly workgroupSizeY?: number;
  readonly tileSizePx?: number;
  readonly maxMipLevel?: TileMipLevel;
  readonly halfTexelInset?: number;
}

export interface VirtualTileAtlasWgslArtifact {
  readonly wgsl: string;
  readonly uniformStrideBytes: number;
  readonly pageTableEntryStrideBytes: number;
  readonly mipMetaStrideBytes: number;
  readonly entryPoints: readonly string[];
  readonly workgroupSize: readonly [number, number, number];
  readonly maxMipLevel: number;
  readonly tileSizePx: number;
  readonly sha256Hex: string;
}

export interface VirtualTileAtlasWgslValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly lineCount: number;
  readonly entryPoints: readonly string[];
  readonly uniformAligned16: boolean;
  readonly bindingsFound: readonly number[];
  readonly glslForbiddenHits: readonly string[];
}

function fmtWgslF32(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const fixed = safe.toFixed(6);
  return fixed.indexOf(".") >= 0 ? fixed : `${fixed}.0`;
}

/**
 * 16바이트 정렬 유니폼과 저해상도 MIP 폴백 체인을 갖춘 WebGPU 가상 타일 아틀라스 합성 WGSL을 생성한다.
 */
export function buildVirtualTileAtlasWgsl(
  options?: BuildVirtualTileAtlasWgslOptions,
): VirtualTileAtlasWgslArtifact {
  const wgX = clampInt(options?.workgroupSizeX ?? 8, 1, 32, 8);
  const wgY = clampInt(options?.workgroupSizeY ?? 8, 1, 32, 8);
  const tileSizePx = clampInt(options?.tileSizePx ?? DEFAULT_TILE_SIZE_PX, 64, 1024, DEFAULT_TILE_SIZE_PX);
  const maxMipLevel = clampInt(options?.maxMipLevel ?? MAX_TILE_MIP_LEVEL, 0, MAX_TILE_MIP_LEVEL, MAX_TILE_MIP_LEVEL);
  const halfTexelInset = clampFinite(options?.halfTexelInset ?? 0.5, 0.0, 2.0, 0.5);

  const lines: readonly string[] = [
    "// Wave 140 WebGPU Virtual Tile Page-Table (Indirection Atlas) Compositing Shader",
    "struct VirtualAtlasUniforms {",
    "  viewport_origin_and_size: vec4<f32>,",
    "  canvas_and_tile_metrics: vec4<f32>,",
    "  atlas_grid_and_mips: vec4<u32>,",
    "  page_table_meta: vec4<u32>,",
    "  fallback_bg_rgba: vec4<f32>,",
    "};",
    "",
    "struct TilePageTableEntry {",
    "  packed_slot_and_mip: vec4<u32>,",
    "};",
    "",
    "struct MipLevelPageTableMeta {",
    "  offset_and_dims: vec4<u32>,",
    "};",
    "",
    "@group(0) @binding(0) var<uniform> u_atlas: VirtualAtlasUniforms;",
    "@group(0) @binding(1) var<storage, read> s_page_table: array<TilePageTableEntry>;",
    "@group(0) @binding(2) var<storage, read> s_mip_meta: array<MipLevelPageTableMeta>;",
    "@group(0) @binding(3) var t_tile_atlas: texture_2d_array<f32>;",
    "@group(0) @binding(4) var s_tile_sampler: sampler;",
    "@group(0) @binding(5) var dst_composite_tex: texture_storage_2d<rgba8unorm, write>;",
    "",
    `const TILE_SIZE_PX: f32 = ${fmtWgslF32(tileSizePx)};`,
    `const MAX_MIP_LEVEL: u32 = ${String(maxMipLevel)}u;`,
    `const HALF_TEXEL_INSET: f32 = ${fmtWgslF32(halfTexelInset)};`,
    "",
    "fn lookup_indirection_entry(mip_level: u32, tile_coord: vec2<u32>) -> TilePageTableEntry {",
    "  let safe_mip = min(mip_level, MAX_MIP_LEVEL);",
    "  let meta = s_mip_meta[safe_mip].offset_and_dims;",
    "  let tiles_x = max(1u, meta.y);",
    "  let tiles_y = max(1u, meta.z);",
    "  if (tile_coord.x >= tiles_x || tile_coord.y >= tiles_y) {",
    "    return TilePageTableEntry(vec4<u32>(0u, 0u, safe_mip, 0u));",
    "  }",
    "  let entry_index = meta.x + tile_coord.y * tiles_x + tile_coord.x;",
    "  let total_entries = max(1u, u_atlas.page_table_meta.z);",
    "  if (entry_index >= total_entries) {",
    "    return TilePageTableEntry(vec4<u32>(0u, 0u, safe_mip, 0u));",
    "  }",
    "  return s_page_table[entry_index];",
    "}",
    "",
    "fn sample_atlas_slot(slot_index: u32, local_uv: vec2<f32>) -> vec4<f32> {",
    "  let slots_per_row = max(1u, u_atlas.atlas_grid_and_mips.x);",
    "  let slots_per_col = max(1u, u_atlas.atlas_grid_and_mips.y);",
    "  let slots_per_layer = slots_per_row * slots_per_col;",
    "  let layer_count = max(1u, u_atlas.atlas_grid_and_mips.z);",
    "  let layer_idx = min(slot_index / slots_per_layer, layer_count - 1u);",
    "  let in_layer = slot_index % slots_per_layer;",
    "  let slot_x = in_layer % slots_per_row;",
    "  let slot_y = in_layer / slots_per_row;",
    "  let tile_px = max(1.0, u_atlas.canvas_and_tile_metrics.z);",
    "  let inset = clamp(HALF_TEXEL_INSET / tile_px, 0.0, 0.25);",
    "  let safe_uv = clamp(local_uv, vec2<f32>(inset, inset), vec2<f32>(1.0 - inset, 1.0 - inset));",
    "  let atlas_u = (f32(slot_x) + safe_uv.x) / f32(slots_per_row);",
    "  let atlas_v = (f32(slot_y) + safe_uv.y) / f32(slots_per_col);",
    "  return textureSampleLevel(t_tile_atlas, s_tile_sampler, vec2<f32>(atlas_u, atlas_v), i32(layer_idx), 0.0);",
    "}",
    "",
    "fn sample_virtual_canvas_with_mip_fallback(canvas_xy: vec2<f32>, start_mip: u32) -> vec4<f32> {",
    "  let canvas_w = max(1.0, u_atlas.canvas_and_tile_metrics.x);",
    "  let canvas_h = max(1.0, u_atlas.canvas_and_tile_metrics.y);",
    "  if (canvas_xy.x < 0.0 || canvas_xy.y < 0.0 || canvas_xy.x >= canvas_w || canvas_xy.y >= canvas_h) {",
    "    return u_atlas.fallback_bg_rgba;",
    "  }",
    "  let tile_px = max(1.0, u_atlas.canvas_and_tile_metrics.z);",
    "  let max_mip = min(u_atlas.atlas_grid_and_mips.w, MAX_MIP_LEVEL);",
    "  let clamped_start = min(start_mip, max_mip);",
    "  for (var mip: u32 = clamped_start; mip <= max_mip; mip = mip + 1u) {",
    "    let scale_div = f32(1u << mip);",
    "    let mip_coord = canvas_xy / scale_div;",
    "    let tile_f = mip_coord / tile_px;",
    "    let tile_idx = vec2<u32>(u32(floor(tile_f.x)), u32(floor(tile_f.y)));",
    "    let local_uv = fract(tile_f);",
    "    let entry = lookup_indirection_entry(mip, tile_idx);",
    "    if (entry.packed_slot_and_mip.x != 0u) {",
    "      return sample_atlas_slot(entry.packed_slot_and_mip.y, local_uv);",
    "    }",
    "  }",
    "  return u_atlas.fallback_bg_rgba;",
    "}",
    "",
    `@compute @workgroup_size(${String(wgX)}, ${String(wgY)}, 1)`,
    "fn cs_composite_virtual_tiles(@builtin(global_invocation_id) gid: vec3<u32>) {",
    "  let view_w = u32(max(1.0, u_atlas.viewport_origin_and_size.z));",
    "  let view_h = u32(max(1.0, u_atlas.viewport_origin_and_size.w));",
    "  if (gid.x >= view_w || gid.y >= view_h) { return; }",
    "  let inv_zoom = max(0.03125, u_atlas.canvas_and_tile_metrics.w);",
    "  let canvas_xy = vec2<f32>(",
    "    u_atlas.viewport_origin_and_size.x + (f32(gid.x) + 0.5) * inv_zoom,",
    "    u_atlas.viewport_origin_and_size.y + (f32(gid.y) + 0.5) * inv_zoom",
    "  );",
    "  let color = sample_virtual_canvas_with_mip_fallback(canvas_xy, u_atlas.page_table_meta.x);",
    "  textureStore(dst_composite_tex, vec2<i32>(i32(gid.x), i32(gid.y)), color);",
    "}",
    "",
    "@fragment",
    "fn fs_composite_virtual_tiles(@builtin(position) frag_coord: vec4<f32>) -> @location(0) vec4<f32> {",
    "  let inv_zoom = max(0.03125, u_atlas.canvas_and_tile_metrics.w);",
    "  let canvas_xy = vec2<f32>(",
    "    u_atlas.viewport_origin_and_size.x + frag_coord.x * inv_zoom,",
    "    u_atlas.viewport_origin_and_size.y + frag_coord.y * inv_zoom",
    "  );",
    "  return sample_virtual_canvas_with_mip_fallback(canvas_xy, u_atlas.page_table_meta.x);",
    "}",
  ];

  const wgsl = lines.join("\n");
  return {
    wgsl,
    uniformStrideBytes: 80,
    pageTableEntryStrideBytes: 16,
    mipMetaStrideBytes: 16,
    entryPoints: ["cs_composite_virtual_tiles", "fs_composite_virtual_tiles"],
    workgroupSize: [wgX, wgY, 1],
    maxMipLevel,
    tileSizePx,
    sha256Hex: sha256TileStreamingHex(wgsl),
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
  { label: "texture2D", pattern: /\btexture2D\b/ },
  { label: "bare-vec-ctor", pattern: /\b(?:vec2|vec3|vec4)\s*\(/ },
  { label: "glsl-float-decl", pattern: /\bfloat\s+[a-zA-Z_]/ },
];

function validateVec4AlignedStruct(
  wgsl: string,
  structName: string,
  errors: string[],
): boolean {
  const pattern = new RegExp(`struct\\s+${structName}\\s*\\{([^}]*)\\}`);
  const match = pattern.exec(wgsl);
  if (!match) {
    errors.push(`필수 16바이트 정렬 구조체 'struct ${structName}'가 누락되었습니다.`);
    return false;
  }
  const bodyLines = match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//"));
  if (bodyLines.length === 0) {
    errors.push(`구조체 '${structName}'의 필드가 비어 있습니다.`);
    return false;
  }
  let aligned = true;
  for (let i = 0; i < bodyLines.length; i += 1) {
    if (!/:\s*vec4<(?:f32|u32|i32)>\s*,?$/.test(bodyLines[i])) {
      aligned = false;
      errors.push(`구조체 '${structName}' 필드가 16바이트 vec4 정렬이 아닙니다: ${bodyLines[i]}`);
    }
  }
  return aligned;
}

/**
 * 생성된 WebGPU 가상 타일 아틀라스 WGSL의 괄호 균형·바인딩·16B 정렬·진입점·GLSL 금지어를 정적 검증한다.
 */
export function validateVirtualTileAtlasWgsl(
  artifactOrSource: VirtualTileAtlasWgslArtifact | string,
): VirtualTileAtlasWgslValidationResult {
  const wgsl = typeof artifactOrSource === "string" ? artifactOrSource : artifactOrSource.wgsl;
  const errors: string[] = [];
  const trimmed = wgsl.trim();
  const lines = trimmed.length === 0 ? [] : trimmed.split("\n");

  if (trimmed.length === 0) {
    errors.push("WGSL 소스가 비어 있습니다.");
  }
  if (/\b(?:NaN|Infinity|undefined)\b/.test(wgsl)) {
    errors.push("WGSL 소스에 비유한 수치(NaN/Infinity/undefined)가 포함되어 있습니다.");
  }

  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
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
    } else if (ch === "[") bracketDepth += 1;
    else if (ch === "]") {
      bracketDepth -= 1;
      if (bracketDepth < 0) {
        errors.push("닫는 대괄호 ']'가 여는 대괄호보다 많습니다.");
        break;
      }
    }
  }
  if (braceDepth !== 0) errors.push(`중괄호 짝이 맞지 않습니다(잔여 깊이: ${String(braceDepth)}).`);
  if (parenDepth !== 0) errors.push(`소괄호 짝이 맞지 않습니다(잔여 깊이: ${String(parenDepth)}).`);
  if (bracketDepth !== 0) errors.push(`대괄호 짝이 맞지 않습니다(잔여 깊이: ${String(bracketDepth)}).`);

  let uniformAligned16 = true;
  if (typeof artifactOrSource !== "string") {
    if (artifactOrSource.uniformStrideBytes <= 0 || artifactOrSource.uniformStrideBytes % 16 !== 0) {
      uniformAligned16 = false;
      errors.push(`유니폼 스트라이드(${String(artifactOrSource.uniformStrideBytes)}B)가 16바이트 배수가 아닙니다.`);
    }
    if (
      artifactOrSource.pageTableEntryStrideBytes <= 0 ||
      artifactOrSource.pageTableEntryStrideBytes % 16 !== 0
    ) {
      uniformAligned16 = false;
      errors.push(
        `페이지 테이블 엔트리 스트라이드(${String(artifactOrSource.pageTableEntryStrideBytes)}B)가 16바이트 배수가 아닙니다.`,
      );
    }
    if (artifactOrSource.mipMetaStrideBytes <= 0 || artifactOrSource.mipMetaStrideBytes % 16 !== 0) {
      uniformAligned16 = false;
      errors.push(`MIP 메타 스트라이드(${String(artifactOrSource.mipMetaStrideBytes)}B)가 16바이트 배수가 아닙니다.`);
    }
  }

  if (!validateVec4AlignedStruct(wgsl, "VirtualAtlasUniforms", errors)) uniformAligned16 = false;
  if (!validateVec4AlignedStruct(wgsl, "TilePageTableEntry", errors)) uniformAligned16 = false;
  if (!validateVec4AlignedStruct(wgsl, "MipLevelPageTableMeta", errors)) uniformAligned16 = false;

  const requiredBindings: ReadonlyArray<{ readonly slot: number; readonly regex: RegExp; readonly desc: string }> = [
    { slot: 0, regex: /@group\(0\)\s*@binding\(0\)\s*var<uniform>/, desc: "var<uniform>" },
    { slot: 1, regex: /@group\(0\)\s*@binding\(1\)\s*var<storage,\s*read>/, desc: "페이지 테이블 var<storage, read>" },
    { slot: 2, regex: /@group\(0\)\s*@binding\(2\)\s*var<storage,\s*read>/, desc: "MIP 메타 var<storage, read>" },
    { slot: 3, regex: /@group\(0\)\s*@binding\(3\)\s*var\s+[a-zA-Z0-9_]+\s*:\s*texture_2d_array</, desc: "texture_2d_array" },
    { slot: 4, regex: /@group\(0\)\s*@binding\(4\)\s*var\s+[a-zA-Z0-9_]+\s*:\s*sampler/, desc: "sampler" },
    { slot: 5, regex: /@group\(0\)\s*@binding\(5\)\s*var\s+[a-zA-Z0-9_]+\s*:\s*texture_storage_2d</, desc: "texture_storage_2d" },
  ];
  const bindingsFound: number[] = [];
  for (let i = 0; i < requiredBindings.length; i += 1) {
    const req = requiredBindings[i];
    if (req.regex.test(wgsl)) {
      bindingsFound.push(req.slot);
    } else {
      errors.push(`@group(0) @binding(${String(req.slot)}) ${req.desc} 선언이 누락되었습니다.`);
    }
  }

  if (!/fn\s+lookup_indirection_entry\s*\(/.test(wgsl)) {
    errors.push("페이지 테이블 조회 함수 'fn lookup_indirection_entry'가 누락되었습니다.");
  }
  if (!/fn\s+sample_atlas_slot\s*\(/.test(wgsl)) {
    errors.push("아틀라스 슬롯 샘플링 함수 'fn sample_atlas_slot'가 누락되었습니다.");
  }
  if (!/fn\s+sample_virtual_canvas_with_mip_fallback\s*\(/.test(wgsl)) {
    errors.push("저해상도 MIP 폴백 체인 함수 'fn sample_virtual_canvas_with_mip_fallback'가 누락되었습니다.");
  }

  const entryPoints: string[] = [];
  const computeRegex =
    /@compute\s+@workgroup_size\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)\s+fn\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
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
  if (entryPoints.length < 2) {
    errors.push("필수 @compute 및 @fragment 진입점이 모두 존재해야 합니다.");
  }

  const glslForbiddenHits: string[] = [];
  for (let i = 0; i < GLSL_FORBIDDEN_RULES.length; i += 1) {
    const rule = GLSL_FORBIDDEN_RULES[i];
    if (rule.pattern.test(wgsl)) {
      glslForbiddenHits.push(rule.label);
      errors.push(`GLSL 금지 토큰 감지: ${rule.label}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    lineCount: lines.length,
    entryPoints,
    uniformAligned16,
    bindingsFound,
    glslForbiddenHits,
  };
}
