/**
 * Wave 135 — WebGPU WGSL 3점 투시 격자 & `fwidth` 안티앨리어싱 가이드 오버레이 셰이더.
 *
 * - 16바이트 정렬 128바이트 유니폼 구조체(`PerspectiveGridUniforms`, `vec4<f32>` × 8)를 정의한다.
 * - VP1·VP2·VP3 방사선 가이드, 지평선, 역 Homography 사영 등분할 격자를 `fwidth` 기반으로
 *   서브픽셀 계단 현상 없이 합성하는 WGSL 버텍스·프래그먼트 파이프라인을 생성한다.
 * - 괄호 균형·바인딩·16바이트 정렬·`fwidth` 사용 여부·GLSL 금지어를 정적 검증한다.
 */

import {
  clampFinitePerspective,
  type Matrix3x3,
  type ThreePointPerspectiveRig,
} from "./perspective-camera-and-vp-solver";
import type { SubdividedPerspectiveQuadResult } from "./projective-subdivision-and-snap";

export interface PerspectiveGridUniformFieldLayout {
  readonly name: string;
  readonly type: "vec4<f32>";
  readonly byteOffset: number;
  readonly byteSize: number;
}

export interface BuildPerspectiveGridWgslOptions {
  /** VP 방사선 각도 분할 수 (6..72). 기본값 24. */
  readonly radialDivisions?: number;
  /** 기본 가이드 선 두께(px). 기본값 1.25. */
  readonly lineWidthPx?: number;
  /** 전체 오버레이 불투명도 (0.05..1.0). 기본값 0.85. */
  readonly overlayOpacity?: number;
  /** 사영 등분할 사변형 격자 오버레이 포함 여부. 기본값 true. */
  readonly includeHomographyGrid?: boolean;
}

export interface PerspectiveGridWgslArtifact {
  readonly wgslSource: string;
  readonly uniformStructName: "PerspectiveGridUniforms";
  readonly uniformByteSize: number;
  readonly uniformAlignmentBytes: number;
  readonly uniformLayout: readonly PerspectiveGridUniformFieldLayout[];
  readonly vertexEntryPoint: "vs_perspective_grid";
  readonly fragmentEntryPoint: "fs_perspective_grid";
  readonly bindingGroup: 0;
  readonly bindingIndex: 0;
}

export interface PerspectiveGridWgslValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly lineCount: number;
  readonly detectedEntryPoints: readonly string[];
  readonly detectedBindings: readonly string[];
  readonly hasFwidthAntiAliasing: boolean;
  readonly uniformByteSizeVerified: boolean;
  readonly forbiddenGlslTokensFound: readonly string[];
}

export const PERSPECTIVE_GRID_UNIFORM_BYTE_SIZE = 128;
export const PERSPECTIVE_GRID_UNIFORM_ALIGNMENT = 16;

export const PERSPECTIVE_GRID_UNIFORM_LAYOUT: readonly PerspectiveGridUniformFieldLayout[] = [
  { name: "canvas_and_focal", type: "vec4<f32>", byteOffset: 0, byteSize: 16 },
  { name: "vp1_and_weight", type: "vec4<f32>", byteOffset: 16, byteSize: 16 },
  { name: "vp2_and_weight", type: "vec4<f32>", byteOffset: 32, byteSize: 16 },
  { name: "vp3_and_weight", type: "vec4<f32>", byteOffset: 48, byteSize: 16 },
  { name: "horizon_and_line", type: "vec4<f32>", byteOffset: 64, byteSize: 16 },
  { name: "homography_row0", type: "vec4<f32>", byteOffset: 80, byteSize: 16 },
  { name: "homography_row1", type: "vec4<f32>", byteOffset: 96, byteSize: 16 },
  { name: "homography_row2", type: "vec4<f32>", byteOffset: 112, byteSize: 16 },
] as const;

const IDENTITY_MATRIX_3X3: Matrix3x3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const FORBIDDEN_GLSL_PATTERNS: ReadonlyArray<{
  readonly token: string;
  readonly regex: RegExp;
}> = [
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
  { token: "dFdx(", regex: /\bdFdx\s*\(/ },
  { token: "dFdy(", regex: /\bdFdy\s*\(/ },
];

/**
 * 3점 투시 리깅과 선택적 사영 등분할 결과를 128바이트(32 × f32) WebGPU 유니폼 버퍼로 패킹한다.
 */
export function packPerspectiveGridUniforms(
  rig: ThreePointPerspectiveRig,
  subdivision?: SubdividedPerspectiveQuadResult | null,
  options: BuildPerspectiveGridWgslOptions = {},
): Float32Array {
  const radialDivisions = Math.round(
    clampFinitePerspective(options.radialDivisions ?? 24, 6, 72, 24),
  );
  const lineWidthPx = clampFinitePerspective(options.lineWidthPx ?? 1.25, 0.5, 6, 1.25);
  const opacity = clampFinitePerspective(options.overlayOpacity ?? 0.85, 0.05, 1, 0.85);
  const invH: Matrix3x3 = subdivision ? subdivision.inverseHomography : IDENTITY_MATRIX_3X3;
  const subdivCols = subdivision ? subdivision.cols : 0;
  const subdivRows = subdivision ? subdivision.rows : 0;

  const buffer = new Float32Array(32);
  // 0..3: canvas_and_focal
  buffer[0] = rig.canvasWidth;
  buffer[1] = rig.canvasHeight;
  buffer[2] = rig.focalLengthPx;
  buffer[3] = radialDivisions;

  // 4..7: vp1_and_weight (isFinite ? [x, y, 1, weight] : [dirX, dirY, 0, weight])
  buffer[4] = rig.vp1.isFinite ? rig.vp1.x : rig.vp1.direction2d.x;
  buffer[5] = rig.vp1.isFinite ? rig.vp1.y : rig.vp1.direction2d.y;
  buffer[6] = rig.vp1.isFinite ? 1 : 0;
  buffer[7] = 1;

  // 8..11: vp2_and_weight
  buffer[8] = rig.vp2.isFinite ? rig.vp2.x : rig.vp2.direction2d.x;
  buffer[9] = rig.vp2.isFinite ? rig.vp2.y : rig.vp2.direction2d.y;
  buffer[10] = rig.vp2.isFinite ? 1 : 0;
  buffer[11] = 1;

  // 12..15: vp3_and_weight
  buffer[12] = rig.vp3.isFinite ? rig.vp3.x : rig.vp3.direction2d.x;
  buffer[13] = rig.vp3.isFinite ? rig.vp3.y : rig.vp3.direction2d.y;
  buffer[14] = rig.vp3.isFinite ? 1 : 0;
  buffer[15] = 0.9;

  // 16..19: horizon_and_line
  buffer[16] = rig.horizonLine.isAtInfinity ? 0 : rig.horizonLine.a;
  buffer[17] = rig.horizonLine.isAtInfinity ? 0 : rig.horizonLine.b;
  buffer[18] = rig.horizonLine.isAtInfinity ? 1e6 : rig.horizonLine.c;
  buffer[19] = lineWidthPx;

  // 20..23: homography_row0 + subdivCols
  buffer[20] = invH[0];
  buffer[21] = invH[1];
  buffer[22] = invH[2];
  buffer[23] = subdivCols;

  // 24..27: homography_row1 + subdivRows
  buffer[24] = invH[3];
  buffer[25] = invH[4];
  buffer[26] = invH[5];
  buffer[27] = subdivRows;

  // 28..31: homography_row2 + opacity
  buffer[28] = invH[6];
  buffer[29] = invH[7];
  buffer[30] = invH[8];
  buffer[31] = opacity;

  return buffer;
}

/**
 * 3점 투시 방사선 가이드 + 지평선 + Homography 등분할 격자를 `fwidth` 안티앨리어싱으로
 * 렌더링하는 WebGPU WGSL 소스와 유니폼 메타데이터를 생성한다.
 */
export function buildPerspectiveGridWgsl(
  options: BuildPerspectiveGridWgslOptions = {},
): PerspectiveGridWgslArtifact {
  const defaultDivisions = Math.round(
    clampFinitePerspective(options.radialDivisions ?? 24, 6, 72, 24),
  );
  const includeHomographyGrid = options.includeHomographyGrid !== false;

  const homographyBlock = includeHomographyGrid
    ? `
fn eval_homography_grid_alpha(pixel: vec2<f32>, u: PerspectiveGridUniforms) -> f32 {
  let cols = u.homography_row0.w;
  let rows = u.homography_row1.w;
  if (cols < 1.0 || rows < 1.0) {
    return 0.0;
  }
  let hx = u.homography_row0.x * pixel.x + u.homography_row0.y * pixel.y + u.homography_row0.z;
  let hy = u.homography_row1.x * pixel.x + u.homography_row1.y * pixel.y + u.homography_row1.z;
  let hw = u.homography_row2.x * pixel.x + u.homography_row2.y * pixel.y + u.homography_row2.z;
  if (abs(hw) < 1e-6) {
    return 0.0;
  }
  let uv = vec2<f32>(hx / hw, hy / hw);
  if (uv.x < -0.002 || uv.x > 1.002 || uv.y < -0.002 || uv.y > 1.002) {
    return 0.0;
  }
  let gu = uv.x * cols;
  let gv = uv.y * rows;
  let fw_u = max(fwidth(gu), 1e-4);
  let fw_v = max(fwidth(gv), 1e-4);
  let dist_u = abs(fract(gu + 0.5) - 0.5) / fw_u;
  let dist_v = abs(fract(gv + 0.5) - 0.5) / fw_v;
  let half_w = max(0.65, u.horizon_and_line.w * 0.65);
  let line_u = 1.0 - smoothstep(half_w - 0.5, half_w + 0.5, dist_u);
  let line_v = 1.0 - smoothstep(half_w - 0.5, half_w + 0.5, dist_v);
  return max(line_u, line_v);
}
`
    : `
fn eval_homography_grid_alpha(pixel: vec2<f32>, u: PerspectiveGridUniforms) -> f32 {
  let _unused = pixel.x + u.canvas_and_focal.x;
  return _unused * 0.0;
}
`;

  const wgslSource = `// Wave 135 — 3점 투시 방사선 가이드 & Homography 등분할 fwidth 안티앨리어싱 WGSL
// Uniform size: 128 bytes (16-byte aligned, 8 x vec4<f32>)

struct PerspectiveGridUniforms {
  canvas_and_focal: vec4<f32>,
  vp1_and_weight: vec4<f32>,
  vp2_and_weight: vec4<f32>,
  vp3_and_weight: vec4<f32>,
  horizon_and_line: vec4<f32>,
  homography_row0: vec4<f32>,
  homography_row1: vec4<f32>,
  homography_row2: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> u_grid: PerspectiveGridUniforms;

struct VertexOut {
  @builtin(position) clip_pos: vec4<f32>,
  @location(0) pixel_pos: vec2<f32>,
};

@vertex
fn vs_perspective_grid(@builtin(vertex_index) vid: u32) -> VertexOut {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>(3.0, -1.0),
    vec2<f32>(-1.0, 3.0)
  );
  let ndc = positions[vid];
  var out: VertexOut;
  out.clip_pos = vec4<f32>(ndc, 0.0, 1.0);
  let uv = vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
  out.pixel_pos = uv * u_grid.canvas_and_focal.xy;
  return out;
}

fn eval_vp_ray_alpha(
  pixel: vec2<f32>,
  vp_packed: vec4<f32>,
  divisions: f32,
  line_width: f32
) -> f32 {
  let weight = vp_packed.w;
  if (weight <= 0.001) {
    return 0.0;
  }
  let half_w = max(0.55, line_width * 0.55);
  if (vp_packed.z > 0.5) {
    let delta = pixel - vp_packed.xy;
    let angle = atan2(delta.y, delta.x);
    let phase = (angle / 6.28318530718) * divisions;
    let fw = max(fwidth(phase), 1e-4);
    let dist_px = abs(fract(phase + 0.5) - 0.5) / fw;
    return (1.0 - smoothstep(half_w - 0.5, half_w + 0.5, dist_px)) * weight;
  }
  let normal = vec2<f32>(-vp_packed.y, vp_packed.x);
  let spacing = max(24.0, u_grid.canvas_and_focal.x / max(4.0, divisions * 0.5));
  let coord = dot(pixel, normal) / spacing;
  let fw = max(fwidth(coord), 1e-4);
  let dist_px = abs(fract(coord + 0.5) - 0.5) / fw;
  return (1.0 - smoothstep(half_w - 0.5, half_w + 0.5, dist_px)) * weight;
}

fn eval_horizon_alpha(pixel: vec2<f32>, horizon: vec4<f32>) -> f32 {
  let norm_len = length(horizon.xy);
  if (norm_len < 1e-5) {
    return 0.0;
  }
  let signed_dist = abs(horizon.x * pixel.x + horizon.y * pixel.y + horizon.z) / norm_len;
  let fw = max(fwidth(signed_dist), 1.0);
  let half_w = max(0.9, horizon.w * 0.85);
  return 1.0 - smoothstep(half_w - 0.5 * fw, half_w + 0.5 * fw, signed_dist);
}
${homographyBlock}
@fragment
fn fs_perspective_grid(in_frag: VertexOut) -> @location(0) vec4<f32> {
  let px = in_frag.pixel_pos;
  let divisions = max(6.0, select(f32(${String(defaultDivisions)}), u_grid.canvas_and_focal.w, u_grid.canvas_and_focal.w >= 6.0));
  let lw = max(0.5, u_grid.horizon_and_line.w);

  let a_vp1 = eval_vp_ray_alpha(px, u_grid.vp1_and_weight, divisions, lw) * 0.42;
  let a_vp2 = eval_vp_ray_alpha(px, u_grid.vp2_and_weight, divisions, lw) * 0.42;
  let a_vp3 = eval_vp_ray_alpha(px, u_grid.vp3_and_weight, divisions, lw) * 0.36;
  let a_horizon = eval_horizon_alpha(px, u_grid.horizon_and_line) * 0.88;
  let a_quad = eval_homography_grid_alpha(px, u_grid) * 0.92;

  let c_vp1 = vec3<f32>(0.21, 0.44, 0.68);
  let c_vp2 = vec3<f32>(0.16, 0.52, 0.42);
  let c_vp3 = vec3<f32>(0.68, 0.36, 0.24);
  let c_horizon = vec3<f32>(0.12, 0.27, 0.21);
  let c_quad = vec3<f32>(0.14, 0.33, 0.26);

  var accum = c_vp1 * a_vp1 + c_vp2 * a_vp2 + c_vp3 * a_vp3 + c_horizon * a_horizon + c_quad * a_quad;
  let alpha = clamp(max(max(max(a_vp1, a_vp2), max(a_vp3, a_horizon)), a_quad) * u_grid.homography_row2.w, 0.0, 1.0);
  let total_w = max(1e-4, a_vp1 + a_vp2 + a_vp3 + a_horizon + a_quad);
  accum = accum / total_w;
  return vec4<f32>(accum, alpha);
}
`;

  return {
    wgslSource,
    uniformStructName: "PerspectiveGridUniforms",
    uniformByteSize: PERSPECTIVE_GRID_UNIFORM_BYTE_SIZE,
    uniformAlignmentBytes: PERSPECTIVE_GRID_UNIFORM_ALIGNMENT,
    uniformLayout: PERSPECTIVE_GRID_UNIFORM_LAYOUT,
    vertexEntryPoint: "vs_perspective_grid",
    fragmentEntryPoint: "fs_perspective_grid",
    bindingGroup: 0,
    bindingIndex: 0,
  };
}

function stripWgslComments(source: string): string {
  let out = "";
  let i = 0;
  let inLine = false;
  let inBlock = false;
  while (i < source.length) {
    const ch = source[i];
    const next = i + 1 < source.length ? source[i + 1] : "";
    if (inLine) {
      if (ch === "\n") {
        inLine = false;
        out += "\n";
      }
      i += 1;
      continue;
    }
    if (inBlock) {
      if (ch === "*" && next === "/") {
        inBlock = false;
        i += 2;
      } else {
        if (ch === "\n") out += "\n";
        i += 1;
      }
      continue;
    }
    if (ch === "/" && next === "/") {
      inLine = true;
      i += 2;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlock = true;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function checkBalancedDelimiters(code: string): readonly string[] {
  const errors: string[] = [];
  const stack: Array<{ readonly open: string; readonly line: number }> = [];
  const matching: Record<string, string> = { ")": "(", "}": "{", "]": "[" };
  let line = 1;
  for (let i = 0; i < code.length; i += 1) {
    const ch = code[i];
    if (ch === "\n") {
      line += 1;
      continue;
    }
    if (ch === "(" || ch === "{" || ch === "[") {
      stack.push({ open: ch, line });
    } else if (ch === ")" || ch === "}" || ch === "]") {
      const top = stack.pop();
      if (!top || top.open !== matching[ch]) {
        errors.push(`WGSL 괄호 불일치: ${String(line)}행에서 '${ch}'가 대응하는 여는 괄호와 맞지 않습니다.`);
      }
    }
  }
  for (let i = 0; i < stack.length; i += 1) {
    errors.push(`WGSL 닫히지 않은 괄호: ${String(stack[i].line)}행의 '${stack[i].open}'.`);
  }
  return errors;
}

/**
 * 생성되었거나 수정된 3점 투시 격자 WGSL 셰이더의 괄호 균형, 16바이트 정렬 유니폼,
 * 바인딩, `fwidth` 안티앨리어싱, GLSL 금지어 혼입 여부를 정적 검증한다.
 */
export function validatePerspectiveGridWgsl(
  wgslSource: string,
): PerspectiveGridWgslValidationResult {
  const errors: string[] = [];
  const stripped = stripWgslComments(wgslSource);
  const lineCount = wgslSource.split("\n").length;

  const delimiterErrors = checkBalancedDelimiters(stripped);
  for (let i = 0; i < delimiterErrors.length; i += 1) {
    errors.push(delimiterErrors[i]);
  }

  const forbiddenGlslTokensFound: string[] = [];
  for (let i = 0; i < FORBIDDEN_GLSL_PATTERNS.length; i += 1) {
    const rule = FORBIDDEN_GLSL_PATTERNS[i];
    if (rule.regex.test(stripped)) {
      forbiddenGlslTokensFound.push(rule.token);
      errors.push(`GLSL 전용 토큰 '${rule.token}'이 WGSL 소스에 혼입되었습니다.`);
    }
  }

  const detectedEntryPoints: string[] = [];
  const entryRegex = /@(vertex|fragment|compute)\s+(?:@workgroup_size\([^)]*\)\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  let match: RegExpExecArray | null = entryRegex.exec(stripped);
  while (match !== null) {
    detectedEntryPoints.push(`${match[1]}:${match[2]}`);
    match = entryRegex.exec(stripped);
  }
  if (!detectedEntryPoints.some((ep) => ep.startsWith("vertex:"))) {
    errors.push("@vertex 엔트리 포인트가 누락되었습니다.");
  }
  if (!detectedEntryPoints.some((ep) => ep.startsWith("fragment:"))) {
    errors.push("@fragment 엔트리 포인트가 누락되었습니다.");
  }

  const detectedBindings: string[] = [];
  const bindingRegex = /@group\((\d+)\)\s*@binding\((\d+)\)/g;
  let bMatch: RegExpExecArray | null = bindingRegex.exec(stripped);
  while (bMatch !== null) {
    detectedBindings.push(`group(${bMatch[1]}):binding(${bMatch[2]})`);
    bMatch = bindingRegex.exec(stripped);
  }
  if (!detectedBindings.includes("group(0):binding(0)")) {
    errors.push("필수 유니폼 바인딩 `@group(0) @binding(0)`이 선언되지 않았습니다.");
  }

  const hasFwidthAntiAliasing = /\bfwidth\s*\(/.test(stripped);
  if (!hasFwidthAntiAliasing) {
    errors.push("안티앨리어싱을 위한 `fwidth(...)` 호출이 누락되었습니다.");
  }

  // struct PerspectiveGridUniforms 내부 vec4<f32> 필드 수 및 128바이트(16바이트 정렬) 검증
  let uniformByteSizeVerified = false;
  const structStart = stripped.indexOf("struct PerspectiveGridUniforms");
  if (structStart < 0) {
    errors.push("`struct PerspectiveGridUniforms` 선언이 누락되었습니다.");
  } else {
    const openBrace = stripped.indexOf("{", structStart);
    const closeBrace = openBrace >= 0 ? stripped.indexOf("}", openBrace) : -1;
    if (openBrace < 0 || closeBrace < 0) {
      errors.push("`struct PerspectiveGridUniforms` 본문이 올바르게 닫히지 않았습니다.");
    } else {
      const body = stripped.slice(openBrace + 1, closeBrace);
      const vec4Fields = body.match(/:\s*vec4<f32>/g) ?? [];
      const computedBytes = vec4Fields.length * 16;
      uniformByteSizeVerified =
        computedBytes === PERSPECTIVE_GRID_UNIFORM_BYTE_SIZE &&
        computedBytes % PERSPECTIVE_GRID_UNIFORM_ALIGNMENT === 0;
      if (!uniformByteSizeVerified) {
        errors.push(
          `PerspectiveGridUniforms 크기(${String(computedBytes)}B)가 16바이트 정렬 규격(128B)과 일치하지 않습니다.`,
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    lineCount,
    detectedEntryPoints,
    detectedBindings,
    hasFwidthAntiAliasing,
    uniformByteSizeVerified,
    forbiddenGlslTokensFound,
  };
}
