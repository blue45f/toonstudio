/**
 * WebGPU MSDF(Multi-Channel Signed Distance Field) 벡터 폰트 및 한국어 SFX·말풍선 래스터라이저.
 *
 * - `WGSL_MSDF_KOREAN_TEXT_RASTER`: `median(r, g, b)` 기반 스크린 공간 픽셀 범위(`fwidth`) 안티앨리어싱,
 *   외곽선 잉크 스트로크, 소프트 드롭 섀도, 아핀·원근(3×3 호모그래피) 워프를 0.25×~100× 배율에서 선명하게 수행한다.
 * - `evaluateMsdfSampleCpu`: GPU 미사용/테스트 환경에서 WGSL과 동일한 수학으로 MSDF·스트로크·그림자·원근 워프를 평가한다.
 * - 글리프 타일 생성기(`generateGlyphMsdfTile`)와 한국어 아틀라스 패커(`MsdfGlyphAtlas`)를 함께 재노출한다.
 */

import {
  DEFAULT_MSDF_ATLAS_HEIGHT,
  DEFAULT_MSDF_ATLAS_WIDTH,
  DEFAULT_MSDF_PX_RANGE,
  median3,
  type MsdfGlyphTile,
} from "./msdf-korean-glyph-contours";

export {
  DEFAULT_MSDF_ATLAS_HEIGHT,
  DEFAULT_MSDF_ATLAS_WIDTH,
  DEFAULT_MSDF_PADDING_PX,
  DEFAULT_MSDF_PX_RANGE,
  DEFAULT_MSDF_TILE_SIZE,
  MsdfGlyphAtlas,
  buildKoreanGlyphContours,
  generateGlyphMsdfTile,
  median3,
  type MsdfAtlasOptions,
  type MsdfAtlasSlot,
  type MsdfAtlasStats,
  type MsdfContour,
  type MsdfGlyphTile,
  type MsdfGlyphTileOptions,
  type MsdfVec2,
} from "./msdf-korean-glyph-contours";

export const MSDF_MIN_ZOOM_SCALE = 0.25 as const;
export const MSDF_MAX_ZOOM_SCALE = 100 as const;
export const MSDF_UNIFORM_BYTES = 128 as const;

export type RgbaNormalized = readonly [number, number, number, number];

export type MsdfWarpMatrix3x3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export interface MsdfWarpOptions {
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly skewX?: number;
  readonly skewY?: number;
  readonly rotationRad?: number;
  readonly perspectiveX?: number;
  readonly perspectiveY?: number;
}

export interface MsdfRenderStyle {
  readonly fillRgba?: RgbaNormalized;
  readonly strokeRgba?: RgbaNormalized;
  readonly shadowRgba?: RgbaNormalized;
  readonly strokeWidthNorm?: number;
  readonly shadowOffsetUv?: readonly [number, number];
  readonly shadowSoftnessNorm?: number;
  readonly zoomScale?: number;
  readonly baseGlyphPx?: number;
  readonly warpMatrix?: MsdfWarpMatrix3x3;
}

export interface MsdfSampleEvaluation {
  readonly warpedUv: readonly [number, number];
  readonly insideBounds: boolean;
  readonly msdfChannels: readonly [number, number, number];
  readonly msdfSignedDistance: number;
  readonly singleChannelSignedDistance: number;
  readonly screenPxRange: number;
  readonly fillAlpha: number;
  readonly strokeAlpha: number;
  readonly shadowAlpha: number;
  readonly rgba: RgbaNormalized;
}

export interface MsdfWgslValidationResult {
  readonly valid: boolean;
  readonly hasVertexEntry: boolean;
  readonly hasFragmentEntry: boolean;
  readonly hasMedian3: boolean;
  readonly hasScreenPxRange: boolean;
  readonly hasInkStroke: boolean;
  readonly hasDropShadow: boolean;
  readonly hasPerspectiveWarp: boolean;
  readonly bindings: readonly { readonly group: number; readonly binding: number }[];
  readonly errors: readonly string[];
}

export const IDENTITY_WARP_MATRIX_3X3: MsdfWarpMatrix3x3 = [
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
];

/**
 * WebGPU WGSL 한국어 SFX·말풍선 MSDF 렌더 셰이더 (`vs_main` + `fs_main`).
 * `median(r, g, b)` 기반 `fwidth` 스크린 공간 안티앨리어싱 + 외곽 잉크 스트로크 + 드롭 섀도 + 3×3 원근 워프.
 */
export const WGSL_MSDF_KOREAN_TEXT_RASTER: string = /* wgsl */ `
struct MsdfTextUniforms {
  atlas_size: vec2<f32>,
  px_range: f32,
  zoom_scale: f32,
  fill_color: vec4<f32>,
  stroke_color: vec4<f32>,
  shadow_color: vec4<f32>,
  stroke_width_norm: f32,
  shadow_softness_norm: f32,
  shadow_offset_uv: vec2<f32>,
  inv_warp_row0: vec4<f32>,
  inv_warp_row1: vec4<f32>,
  inv_warp_row2: vec4<f32>,
}

struct VertexInput {
  @location(0) position_ndc: vec2<f32>,
  @location(1) local_uv: vec2<f32>,
  @location(2) atlas_uv_rect: vec4<f32>,
}

struct VertexOutput {
  @builtin(position) clip_position: vec4<f32>,
  @location(0) local_uv: vec2<f32>,
  @location(1) atlas_uv_rect: vec4<f32>,
}

@group(0) @binding(0) var<uniform> params: MsdfTextUniforms;
@group(0) @binding(1) var msdf_sampler: sampler;
@group(0) @binding(2) var msdf_atlas: texture_2d<f32>;

fn median3(r: f32, g: f32, b: f32) -> f32 {
  return max(min(r, g), min(max(r, g), b));
}

fn apply_perspective_warp(local_uv: vec2<f32>) -> vec2<f32> {
  let centered = local_uv - vec2<f32>(0.5, 0.5);
  let p = vec3<f32>(centered.x, centered.y, 1.0);
  let wx = dot(params.inv_warp_row0.xyz, p);
  let wy = dot(params.inv_warp_row1.xyz, p);
  let wz = dot(params.inv_warp_row2.xyz, p);
  let denom = select(wz, 1e-4, abs(wz) < 1e-4);
  return vec2<f32>(wx / denom, wy / denom) + vec2<f32>(0.5, 0.5);
}

fn compute_screen_px_range(atlas_uv: vec2<f32>) -> f32 {
  let unit_range = vec2<f32>(params.px_range) / max(params.atlas_size, vec2<f32>(1.0));
  let screen_tex_size = vec2<f32>(1.0) / max(fwidth(atlas_uv), vec2<f32>(1e-5));
  return max(0.5 * dot(unit_range, screen_tex_size), 1.0);
}

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  out.clip_position = vec4<f32>(in.position_ndc, 0.0, 1.0);
  out.local_uv = in.local_uv;
  out.atlas_uv_rect = in.atlas_uv_rect;
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let warped_local = apply_perspective_warp(in.local_uv);
  let uv_min = in.atlas_uv_rect.xy;
  let uv_max = in.atlas_uv_rect.zw;
  let atlas_uv = mix(uv_min, uv_max, clamp(warped_local, vec2<f32>(0.0), vec2<f32>(1.0)));

  let msdf_sample = textureSample(msdf_atlas, msdf_sampler, atlas_uv);
  let sd = median3(msdf_sample.r, msdf_sample.g, msdf_sample.b) - 0.5;
  let screen_px_range = compute_screen_px_range(atlas_uv);

  let in_bounds = step(0.0, warped_local.x) * step(warped_local.x, 1.0)
    * step(0.0, warped_local.y) * step(warped_local.y, 1.0);

  let fill_alpha = clamp(sd * screen_px_range + 0.5, 0.0, 1.0) * in_bounds;
  let stroke_spread = clamp(params.stroke_width_norm, 0.0, 0.45);
  let stroke_alpha = clamp((sd + stroke_spread) * screen_px_range + 0.5, 0.0, 1.0) * in_bounds;

  let shadow_local = clamp(warped_local - params.shadow_offset_uv, vec2<f32>(0.0), vec2<f32>(1.0));
  let shadow_uv = mix(uv_min, uv_max, shadow_local);
  let shadow_sample = textureSample(msdf_atlas, msdf_sampler, shadow_uv);
  let shadow_sd = (median3(shadow_sample.r, shadow_sample.g, shadow_sample.b) - 0.5) + stroke_spread;
  let shadow_soft = max(params.shadow_softness_norm, 0.01);
  let shadow_alpha = smoothstep(-shadow_soft, shadow_soft, shadow_sd) * params.shadow_color.a;

  let glyph_rgb = mix(params.stroke_color.rgb, params.fill_color.rgb, fill_alpha);
  let glyph_a = max(fill_alpha * params.fill_color.a, stroke_alpha * params.stroke_color.a);

  let out_a = glyph_a + shadow_alpha * (1.0 - glyph_a);
  let out_rgb = select(
    vec3<f32>(0.0),
    (glyph_rgb * glyph_a + params.shadow_color.rgb * shadow_alpha * (1.0 - glyph_a)) / max(out_a, 1e-5),
    out_a > 1e-5,
  );
  return vec4<f32>(out_rgb, out_a);
}
`;

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / Math.max(edge1 - edge0, 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 아핀·원근(기울임, 회전, 사다리꼴 원근) 한국어 SFX용 3×3 행렬 생성. */
export function createPerspectiveSfxWarpMatrix(options: MsdfWarpOptions = {}): MsdfWarpMatrix3x3 {
  const sx = options.scaleX ?? 1;
  const sy = options.scaleY ?? 1;
  const kx = options.skewX ?? 0;
  const ky = options.skewY ?? 0;
  const rot = options.rotationRad ?? 0;
  const px = options.perspectiveX ?? 0;
  const py = options.perspectiveY ?? 0;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return [
    (cos - sin * ky) * sx, (cos * kx - sin) * sy, 0,
    (sin + cos * ky) * sx, (sin * kx + cos) * sy, 0,
    px, py, 1,
  ];
}

export function invertMatrix3x3(m: MsdfWarpMatrix3x3): MsdfWarpMatrix3x3 {
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m;
  const c00 = m11 * m22 - m12 * m21;
  const c01 = -(m10 * m22 - m12 * m20);
  const c02 = m10 * m21 - m11 * m20;
  const c10 = -(m01 * m22 - m02 * m21);
  const c11 = m00 * m22 - m02 * m20;
  const c12 = -(m00 * m21 - m01 * m20);
  const c20 = m01 * m12 - m02 * m11;
  const c21 = -(m00 * m12 - m02 * m10);
  const c22 = m00 * m11 - m01 * m10;
  const det = m00 * c00 + m01 * c01 + m02 * c02;
  if (Math.abs(det) < 1e-8) return IDENTITY_WARP_MATRIX_3X3;
  const inv = 1 / det;
  return [
    c00 * inv, c10 * inv, c20 * inv,
    c01 * inv, c11 * inv, c21 * inv,
    c02 * inv, c12 * inv, c22 * inv,
  ];
}

export function applyWarpToLocalUv(
  localU: number,
  localV: number,
  invWarp: MsdfWarpMatrix3x3,
): readonly [number, number] {
  const cx = localU - 0.5;
  const cy = localV - 0.5;
  const wx = invWarp[0] * cx + invWarp[1] * cy + invWarp[2];
  const wy = invWarp[3] * cx + invWarp[4] * cy + invWarp[5];
  const wz = invWarp[6] * cx + invWarp[7] * cy + invWarp[8];
  const denom = Math.abs(wz) < 1e-4 ? 1e-4 : wz;
  return [wx / denom + 0.5, wy / denom + 0.5];
}

export function packMsdfUniforms(
  style: MsdfRenderStyle,
  atlasWidth = DEFAULT_MSDF_ATLAS_WIDTH,
  atlasHeight = DEFAULT_MSDF_ATLAS_HEIGHT,
  pxRange = DEFAULT_MSDF_PX_RANGE,
): Float32Array {
  const f32 = new Float32Array(MSDF_UNIFORM_BYTES / 4);
  const fill = style.fillRgba ?? [1, 0.96, 0.9, 1];
  const stroke = style.strokeRgba ?? [0.06, 0.06, 0.08, 1];
  const shadow = style.shadowRgba ?? [0, 0, 0, 0.45];
  const shadowOffset = style.shadowOffsetUv ?? [0.04, 0.04];
  const zoom = clamp(style.zoomScale ?? 1, MSDF_MIN_ZOOM_SCALE, MSDF_MAX_ZOOM_SCALE);
  const invWarp = invertMatrix3x3(style.warpMatrix ?? IDENTITY_WARP_MATRIX_3X3);

  f32[0] = Math.max(1, atlasWidth);
  f32[1] = Math.max(1, atlasHeight);
  f32[2] = Math.max(1, pxRange);
  f32[3] = zoom;
  f32.set(fill, 4);
  f32.set(stroke, 8);
  f32.set(shadow, 12);
  f32[16] = clamp(style.strokeWidthNorm ?? 0.14, 0, 0.45);
  f32[17] = clamp(style.shadowSoftnessNorm ?? 0.12, 0.01, 0.5);
  f32[18] = shadowOffset[0];
  f32[19] = shadowOffset[1];
  f32[20] = invWarp[0];
  f32[21] = invWarp[1];
  f32[22] = invWarp[2];
  f32[23] = 0;
  f32[24] = invWarp[3];
  f32[25] = invWarp[4];
  f32[26] = invWarp[5];
  f32[27] = 0;
  f32[28] = invWarp[6];
  f32[29] = invWarp[7];
  f32[30] = invWarp[8];
  f32[31] = 0;
  return f32;
}

export function validateMsdfWgslShader(
  source: string = WGSL_MSDF_KOREAN_TEXT_RASTER,
): MsdfWgslValidationResult {
  const errors: string[] = [];
  const hasVertexEntry = /@vertex[\s\S]*?fn\s+vs_main\b/.test(source);
  const hasFragmentEntry = /@fragment[\s\S]*?fn\s+fs_main\b/.test(source);
  const hasMedian3 = /fn\s+median3\s*\(/.test(source) && /median3\s*\(\s*[\w.]+\.r/.test(source);
  const hasScreenPxRange = /fwidth\s*\(/.test(source) && /compute_screen_px_range/.test(source);
  const hasInkStroke = /stroke_width_norm/.test(source) && /stroke_alpha/.test(source);
  const hasDropShadow = /shadow_offset_uv/.test(source) && /shadow_alpha/.test(source);
  const hasPerspectiveWarp = /apply_perspective_warp/.test(source) && /inv_warp_row2/.test(source);

  if (!hasVertexEntry) errors.push("Missing @vertex vs_main entry point.");
  if (!hasFragmentEntry) errors.push("Missing @fragment fs_main entry point.");
  if (!hasMedian3) errors.push("Missing median3(r, g, b) MSDF reconstruction.");
  if (!hasScreenPxRange) errors.push("Missing screen-space fwidth pixel range.");
  if (!hasInkStroke) errors.push("Missing outer ink stroke evaluation.");
  if (!hasDropShadow) errors.push("Missing soft drop shadow evaluation.");
  if (!hasPerspectiveWarp) errors.push("Missing perspective/affine warp transform.");

  let braceDepth = 0;
  let parenDepth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth -= 1;
    else if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    if (braceDepth < 0 || parenDepth < 0) {
      errors.push("Unbalanced braces or parentheses in WGSL source.");
      break;
    }
  }
  if (braceDepth !== 0) errors.push("Unclosed curly brace in WGSL source.");
  if (parenDepth !== 0) errors.push("Unclosed parenthesis in WGSL source.");

  const bindings: { readonly group: number; readonly binding: number }[] = [];
  const bindingRegex = /@group\((\d+)\)\s*@binding\((\d+)\)/g;
  let match = bindingRegex.exec(source);
  while (match !== null) {
    bindings.push({ group: Number(match[1]), binding: Number(match[2]) });
    match = bindingRegex.exec(source);
  }
  if (bindings.length < 3) {
    errors.push("Expected at least 3 bind group entries (uniform, sampler, atlas texture).");
  }

  return {
    valid: errors.length === 0,
    hasVertexEntry,
    hasFragmentEntry,
    hasMedian3,
    hasScreenPxRange,
    hasInkStroke,
    hasDropShadow,
    hasPerspectiveWarp,
    bindings,
    errors,
  };
}

function sampleRgbaBilinear(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  u: number,
  v: number,
): RgbaNormalized {
  const fx = clamp(u * width - 0.5, 0, width - 1);
  const fy = clamp(v * height - 0.5, 0, height - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;

  const i00 = (y0 * width + x0) * 4;
  const i10 = (y0 * width + x1) * 4;
  const i01 = (y1 * width + x0) * 4;
  const i11 = (y1 * width + x1) * 4;

  const interp = (offset: number): number => {
    const c00 = (rgba[i00 + offset] ?? 0) / 255;
    const c10 = (rgba[i10 + offset] ?? 0) / 255;
    const c01 = (rgba[i01 + offset] ?? 0) / 255;
    const c11 = (rgba[i11 + offset] ?? 0) / 255;
    return c00 + (c10 - c00) * tx + (c01 + (c11 - c01) * tx - (c00 + (c10 - c00) * tx)) * ty;
  };
  return [interp(0), interp(1), interp(2), interp(3)];
}

/**
 * CPU 기준 MSDF 픽셀 평가기 (`WGSL_MSDF_KOREAN_TEXT_RASTER`와 수식 동등).
 */
export function evaluateMsdfSampleCpu(
  tile: Pick<MsdfGlyphTile, "rgba" | "width" | "height" | "pxRange">,
  localU: number,
  localV: number,
  style: MsdfRenderStyle = {},
): MsdfSampleEvaluation {
  const fillColor = style.fillRgba ?? [1, 0.96, 0.9, 1];
  const strokeColor = style.strokeRgba ?? [0.06, 0.06, 0.08, 1];
  const shadowColor = style.shadowRgba ?? [0, 0, 0, 0.45];
  const strokeSpread = clamp(style.strokeWidthNorm ?? 0.14, 0, 0.45);
  const shadowOffset = style.shadowOffsetUv ?? [0.04, 0.04];
  const shadowSoft = clamp(style.shadowSoftnessNorm ?? 0.12, 0.01, 0.5);
  const zoomScale = clamp(style.zoomScale ?? 1, MSDF_MIN_ZOOM_SCALE, MSDF_MAX_ZOOM_SCALE);
  const baseGlyphPx = Math.max(8, style.baseGlyphPx ?? tile.width);

  const invWarp = invertMatrix3x3(style.warpMatrix ?? IDENTITY_WARP_MATRIX_3X3);
  const [wu, wv] = applyWarpToLocalUv(localU, localV, invWarp);
  const insideBounds = wu >= 0 && wu <= 1 && wv >= 0 && wv <= 1;

  const sample = sampleRgbaBilinear(tile.rgba, tile.width, tile.height, clamp(wu, 0, 1), clamp(wv, 0, 1));
  const msdfSignedDistance = median3(sample[0], sample[1], sample[2]) - 0.5;
  const singleChannelSignedDistance = sample[3] - 0.5;
  const screenPxRange = Math.max((tile.pxRange / tile.width) * baseGlyphPx * zoomScale, 1);

  const boundsFactor = insideBounds ? 1 : 0;
  const fillAlpha = clamp(msdfSignedDistance * screenPxRange + 0.5, 0, 1) * boundsFactor;
  const strokeAlpha = clamp((msdfSignedDistance + strokeSpread) * screenPxRange + 0.5, 0, 1) * boundsFactor;

  const shadowSample = sampleRgbaBilinear(
    tile.rgba,
    tile.width,
    tile.height,
    clamp(wu - shadowOffset[0], 0, 1),
    clamp(wv - shadowOffset[1], 0, 1),
  );
  const shadowSd = median3(shadowSample[0], shadowSample[1], shadowSample[2]) - 0.5 + strokeSpread;
  const shadowAlpha = smoothstep(-shadowSoft, shadowSoft, shadowSd) * shadowColor[3];

  const glyphR = strokeColor[0] + (fillColor[0] - strokeColor[0]) * fillAlpha;
  const glyphG = strokeColor[1] + (fillColor[1] - strokeColor[1]) * fillAlpha;
  const glyphB = strokeColor[2] + (fillColor[2] - strokeColor[2]) * fillAlpha;
  const glyphA = Math.max(fillAlpha * fillColor[3], strokeAlpha * strokeColor[3]);
  const outA = glyphA + shadowAlpha * (1 - glyphA);
  const invA = outA > 1e-5 ? 1 / outA : 0;

  return {
    warpedUv: [wu, wv],
    insideBounds,
    msdfChannels: [sample[0], sample[1], sample[2]],
    msdfSignedDistance,
    singleChannelSignedDistance,
    screenPxRange,
    fillAlpha,
    strokeAlpha,
    shadowAlpha,
    rgba: [
      (glyphR * glyphA + shadowColor[0] * shadowAlpha * (1 - glyphA)) * invA,
      (glyphG * glyphA + shadowColor[1] * shadowAlpha * (1 - glyphA)) * invA,
      (glyphB * glyphA + shadowColor[2] * shadowAlpha * (1 - glyphA)) * invA,
      outA,
    ],
  };
}
