/**
 * Wave 141 — WebGPU WGSL 컷 조광 가이드 & 방향 그림자 검증 오버레이 생성기 및 정적 검증기.
 *
 * - 16바이트 정렬 유니폼(`ShadowGuideUniforms`, 64바이트 = vec4<f32> x 4)을 기반으로
 *   기대 그림자 투사 밴드, 작화 편차 경고 히트맵, 림라이트 방향 가이드 오버레이를 합성한다.
 * - 괄호 균형, 바인딩 중복/누락, 16B 정렬, GLSL 금지어, WGSL 예약어 충돌을 정적 검증한다.
 */

import type { CutLightingEvaluation } from "./multi-cut-shadow-consistency-auditor";
import { clampFiniteNumber, degToRad, type RimLightSide } from "./solar-ephemeris-and-shadow-math";

export interface ShadowGuideWgslConfig {
  readonly workgroupSizeX?: number;
  readonly workgroupSizeY?: number;
  readonly includeRimBand?: boolean;
  readonly includeDeviationHeatmap?: boolean;
}

export interface ShadowGuideWgslBundle {
  readonly wgslSource: string;
  readonly entryPoint: string;
  readonly workgroupSize: readonly [number, number, number];
  readonly uniformStructName: string;
  readonly uniformByteLength: number;
  readonly bindingCount: number;
}

export interface ShadowGuideWgslCheck {
  readonly id: string;
  readonly passed: boolean;
  readonly detailKo: string;
}

export interface ShadowGuideWgslValidationResult {
  readonly valid: boolean;
  readonly entryPoint: string;
  readonly workgroupSize: readonly [number, number, number];
  readonly uniformStructBytes: number;
  readonly bindingCount: number;
  readonly forbiddenGlslHits: readonly string[];
  readonly reservedKeywordHits: readonly string[];
  readonly checks: readonly ShadowGuideWgslCheck[];
  readonly errors: readonly string[];
}

export const SHADOW_GUIDE_UNIFORM_BYTE_LENGTH = 64;

const WGSL_RESERVED_KEYWORDS: ReadonlySet<string> = new Set(
  (
    "NULL Self abstract active alignas alignof as asm asm_fragment async attribute auto await " +
    "become cast catch class co_await co_return co_yield coherent column_major common compile " +
    "compile_fragment concept const_cast consteval constexpr constinit crate debugger decltype " +
    "delete demote demote_to_helper do dynamic_cast enum explicit export extends extern external " +
    "fallthrough filter final finally friend from fxgroup get goto groupshared highp impl " +
    "implements import inline instanceof interface layout lowp macro macro_rules match mediump " +
    "meta mod module move mut mutable namespace new nil noexcept noinline nointerpolation " +
    "non_coherent noncoherent noperspective null nullptr of operator package packoffset partition " +
    "pass patch pixelfragment precise precision premerge priv protected pub public readonly ref " +
    "regardless register reinterpret_cast require resource restrict self set shared sizeof smooth " +
    "snorm static static_assert static_cast std subroutine super target template this thread_local " +
    "throw trait try type typedef typeid typename typeof union unless unorm unsafe unsized use " +
    "using varying virtual volatile wgsl where with writeonly yield"
  ).split(" "),
);

function encodeRimSideCode(side: RimLightSide): number {
  if (side === "left") return 1;
  if (side === "right") return 2;
  if (side === "top") return 3;
  return 4;
}

/**
 * 컷 평가 결과를 16바이트 정렬된 64바이트 `ShadowGuideUniforms` Float32Array(16개 f32)로 패킹한다.
 */
export function packShadowGuideUniformBuffer(
  evaluation: CutLightingEvaluation,
  canvasWidthPx = 1280,
  canvasHeightPx = 720,
  angleToleranceDeg = 25,
  overlayAlpha = 0.55,
): Float32Array {
  const safeW = clampFiniteNumber(canvasWidthPx, 16, 16384, 1280);
  const safeH = clampFiniteNumber(canvasHeightPx, 16, 16384, 720);
  const drawnRad = degToRad(evaluation.drawnShadowAngleDeg);
  const drawnDirX = Math.cos(drawnRad);
  const drawnDirY = Math.sin(drawnRad);
  const tolRad = degToRad(clampFiniteNumber(angleToleranceDeg, 2, 90, 25));
  const kelvinNorm = clampFiniteNumber((evaluation.colorTemperatureK - 2500) / 7000, 0, 1, 0.5);
  const safeAlpha = clampFiniteNumber(overlayAlpha, 0.05, 1, 0.55);

  const buffer = new Float32Array(16);
  // vec4<f32> 0: canvas_size_and_inv
  buffer[0] = safeW;
  buffer[1] = safeH;
  buffer[2] = 1 / safeW;
  buffer[3] = 1 / safeH;
  // vec4<f32> 1: expected_shadow_vec_and_len
  buffer[4] = evaluation.projection.expectedScreenShadowDir.x;
  buffer[5] = evaluation.projection.expectedScreenShadowDir.y;
  buffer[6] = evaluation.projection.expectedScreenShadowLengthRatio;
  buffer[7] = tolRad;
  // vec4<f32> 2: drawn_shadow_vec_and_len
  buffer[8] = drawnDirX;
  buffer[9] = drawnDirY;
  buffer[10] = evaluation.drawnShadowLengthRatio;
  buffer[11] = encodeRimSideCode(evaluation.projection.expectedRimSide);
  // vec4<f32> 3: solar_meta_and_kelvin
  buffer[12] = degToRad(evaluation.lightElevationDeg);
  buffer[13] = degToRad(evaluation.lightAzimuthDeg);
  buffer[14] = kelvinNorm;
  buffer[15] = safeAlpha;

  return buffer;
}

/**
 * 16바이트 정렬 유니폼 기반 WebGPU WGSL 컷 조광 가이드 및 그림자 편차 검증 오버레이를 생성한다.
 */
export function buildShadowGuideOverlayWgsl(
  config: ShadowGuideWgslConfig = {},
): ShadowGuideWgslBundle {
  const wgX = Math.round(clampFiniteNumber(config.workgroupSizeX ?? 8, 1, 32, 8));
  const wgY = Math.round(clampFiniteNumber(config.workgroupSizeY ?? 8, 1, 32, 8));
  const includeRimBand = config.includeRimBand !== false;
  const includeDeviationHeatmap = config.includeDeviationHeatmap !== false;
  const entryPoint = "render_shadow_guide_overlay";

  const rimBlock = includeRimBand
    ? `fn eval_rim_edge_glow(uv: vec2<f32>, rim_code: f32) -> f32 {
  var edge_dist: f32 = 1.0;
  if (rim_code < 1.5) {
    edge_dist = uv.x;
  } else if (rim_code < 2.5) {
    edge_dist = 1.0 - uv.x;
  } else if (rim_code < 3.5) {
    edge_dist = uv.y;
  } else {
    edge_dist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
  }
  return smoothstep(0.14, 0.0, edge_dist);
}`
    : `fn eval_rim_edge_glow(uv: vec2<f32>, rim_code: f32) -> f32 {
  return (uv.x * 0.0) + (rim_code * 0.0);
}`;

  const deviationBlock = includeDeviationHeatmap
    ? `fn eval_deviation_weight(angle_error: f32, tol_rad: f32) -> f32 {
  return clamp((angle_error - tol_rad) / max(0.25, 3.14159265 - tol_rad), 0.0, 1.0);
}`
    : `fn eval_deviation_weight(angle_error: f32, tol_rad: f32) -> f32 {
  return (angle_error * 0.0) + (tol_rad * 0.0);
}`;

  const wgslSource = `// Wave 141 WebGPU 컷 조광 가이드 및 그림자 방향 검증 오버레이 셰이더
struct ShadowGuideUniforms {
  canvas_size_and_inv: vec4<f32>,
  expected_shadow_vec_and_len: vec4<f32>,
  drawn_shadow_vec_and_len: vec4<f32>,
  solar_meta_and_kelvin: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u_guide: ShadowGuideUniforms;
@group(0) @binding(1) var out_overlay: texture_storage_2d<rgba8unorm, write>;

fn eval_kelvin_tint(kelvin_norm: f32) -> vec3<f32> {
  let warm_rgb = vec3<f32>(0.98, 0.68, 0.34);
  let midday_rgb = vec3<f32>(0.96, 0.97, 0.94);
  let lunar_rgb = vec3<f32>(0.48, 0.68, 0.96);
  if (kelvin_norm < 0.5) {
    return mix(warm_rgb, midday_rgb, clamp(kelvin_norm * 2.0, 0.0, 1.0));
  }
  return mix(midday_rgb, lunar_rgb, clamp((kelvin_norm - 0.5) * 2.0, 0.0, 1.0));
}

fn eval_shadow_corridor_band(centered: vec2<f32>, dir_xy: vec2<f32>, length_ratio: f32) -> f32 {
  let dir_len = max(0.0001, length(dir_xy));
  let unit_dir = dir_xy / dir_len;
  let along = dot(centered, unit_dir);
  let perp = abs(centered.x * unit_dir.y - centered.y * unit_dir.x);
  let max_reach = clamp(length_ratio * 0.16, 0.08, 0.46);
  let in_span = step(0.0, along) * smoothstep(max_reach + 0.03, max_reach - 0.02, along);
  let stripe = smoothstep(0.045, 0.008, perp);
  return in_span * stripe;
}

${rimBlock}

${deviationBlock}

@compute @workgroup_size(${wgX}, ${wgY}, 1)
fn ${entryPoint}(@builtin(global_invocation_id) gid: vec3<u32>) {
  let width_u = u32(max(1.0, u_guide.canvas_size_and_inv.x));
  let height_u = u32(max(1.0, u_guide.canvas_size_and_inv.y));
  if (gid.x >= width_u || gid.y >= height_u) {
    return;
  }

  let uv = vec2<f32>(
    (f32(gid.x) + 0.5) * u_guide.canvas_size_and_inv.z,
    (f32(gid.y) + 0.5) * u_guide.canvas_size_and_inv.w,
  );
  let centered = uv - vec2<f32>(0.5, 0.5);

  let expected_dir = u_guide.expected_shadow_vec_and_len.xy;
  let drawn_dir = u_guide.drawn_shadow_vec_and_len.xy;
  let expected_band = eval_shadow_corridor_band(
    centered,
    expected_dir,
    u_guide.expected_shadow_vec_and_len.z,
  );
  let drawn_band = eval_shadow_corridor_band(
    centered,
    drawn_dir,
    u_guide.drawn_shadow_vec_and_len.z,
  );

  let cos_err = clamp(dot(normalize(expected_dir + vec2<f32>(0.00001, 0.0)), normalize(drawn_dir + vec2<f32>(0.00001, 0.0))), -1.0, 1.0);
  let angle_err = acos(cos_err);
  let dev_weight = eval_deviation_weight(angle_err, u_guide.expected_shadow_vec_and_len.w);

  let rim_glow = eval_rim_edge_glow(uv, u_guide.drawn_shadow_vec_and_len.w);
  let tint = eval_kelvin_tint(u_guide.solar_meta_and_kelvin.z);

  let expected_color = vec3<f32>(0.16, 0.64, 0.44);
  let warn_color = mix(vec3<f32>(0.26, 0.66, 0.72), vec3<f32>(0.86, 0.22, 0.2), dev_weight);
  let rgb = clamp(
    expected_color * expected_band + warn_color * drawn_band * 0.85 + tint * rim_glow * 0.55,
    vec3<f32>(0.0, 0.0, 0.0),
    vec3<f32>(1.0, 1.0, 1.0),
  );
  let alpha = clamp(
    (max(expected_band, drawn_band * 0.85) + rim_glow * 0.45) * u_guide.solar_meta_and_kelvin.w,
    0.0,
    1.0,
  );

  textureStore(out_overlay, vec2<i32>(i32(gid.x), i32(gid.y)), vec4<f32>(rgb, alpha));
}
`;

  return {
    wgslSource,
    entryPoint,
    workgroupSize: [wgX, wgY, 1],
    uniformStructName: "ShadowGuideUniforms",
    uniformByteLength: SHADOW_GUIDE_UNIFORM_BYTE_LENGTH,
    bindingCount: 2,
  };
}

function checkBalancedWgslDelimiters(source: string): boolean {
  let curly = 0;
  let paren = 0;
  let bracket = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") curly += 1;
    else if (ch === "}") curly -= 1;
    else if (ch === "(") paren += 1;
    else if (ch === ")") paren -= 1;
    else if (ch === "[") bracket += 1;
    else if (ch === "]") bracket -= 1;
    if (curly < 0 || paren < 0 || bracket < 0) return false;
  }
  return curly === 0 && paren === 0 && bracket === 0;
}

function measureUniformStructBytes(source: string, structName: string): number {
  const regex = new RegExp(`struct\\s+${structName}\\s*\\{([\\s\\S]*?)\\}`, "u");
  const match = regex.exec(source);
  if (!match || !match[1]) return 0;
  const fields = match[1]
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  let bytes = 0;
  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i];
    if (!field) continue;
    if (/:\s*vec[34]<(?:f32|u32|i32)>/u.test(field)) bytes += 16;
    else if (/:\s*vec2<(?:f32|u32|i32)>/u.test(field)) bytes += 8;
    else if (/:\s*(?:f32|u32|i32)/u.test(field)) bytes += 4;
  }
  return bytes;
}

function scanForbiddenGlslTokens(source: string): string[] {
  const hits: string[] = [];
  const rules: readonly { readonly token: string; readonly pattern: RegExp }[] = [
    { token: "gl_FragColor", pattern: /\bgl_FragColor\b/u },
    { token: "gl_Position", pattern: /\bgl_Position\b/u },
    { token: "gl_FragCoord", pattern: /\bgl_FragCoord\b/u },
    { token: "sampler2D", pattern: /\bsampler2D\b/u },
    { token: "texture2D", pattern: /\btexture2D\b/u },
    { token: "varying", pattern: /\bvarying\s+/u },
    { token: "attribute", pattern: /\battribute\s+/u },
    { token: "precision", pattern: /\bprecision\s+(?:lowp|mediump|highp)\b/u },
    { token: "glsl-float", pattern: /\bfloat\s+[A-Za-z_]/u },
    { token: "glsl-uniform", pattern: /(?:^|[\n;])\s*uniform\s+/mu },
    { token: "glsl-vec-ctor", pattern: /\bvec[234]\s*\(/u },
  ];
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i];
    if (!rule) continue;
    if (rule.pattern.test(source)) hits.push(rule.token);
  }
  return hits;
}

function scanWgslReservedKeywordCollisions(source: string): string[] {
  const hitSet = new Set<string>();
  const patterns: readonly RegExp[] = [
    /\b(?:let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\b/gu,
    /\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gu,
  ];
  for (let i = 0; i < patterns.length; i += 1) {
    const pattern = patterns[i];
    if (!pattern) continue;
    pattern.lastIndex = 0;
    let match = pattern.exec(source);
    while (match !== null) {
      const ident = match[1];
      if (ident && WGSL_RESERVED_KEYWORDS.has(ident)) {
        hitSet.add(ident);
      }
      match = pattern.exec(source);
    }
  }
  return Array.from(hitSet).sort();
}

function parseUniqueBindings(source: string): {
  readonly count: number;
  readonly hasDuplicate: boolean;
} {
  const regex = /@group\(\s*(\d+)\s*\)\s*@binding\(\s*(\d+)\s*\)/gu;
  const seen = new Set<string>();
  let hasDuplicate = false;
  let match = regex.exec(source);
  while (match !== null) {
    const key = `${match[1]}:${match[2]}`;
    if (seen.has(key)) hasDuplicate = true;
    seen.add(key);
    match = regex.exec(source);
  }
  return { count: seen.size, hasDuplicate };
}

/**
 * WGSL 컷 조광 가이드 셰이더의 괄호 균형·바인딩·16B 정렬·GLSL 금지어·예약어를 정적 검증한다.
 */
export function validateShadowGuideOverlayWgsl(wgslSource: string): ShadowGuideWgslValidationResult {
  if (typeof wgslSource !== "string" || wgslSource.length === 0 || wgslSource.length > 65536) {
    return {
      valid: false,
      entryPoint: "",
      workgroupSize: [0, 0, 0],
      uniformStructBytes: 0,
      bindingCount: 0,
      forbiddenGlslHits: [],
      reservedKeywordHits: [],
      checks: [
        {
          id: "source-length",
          passed: false,
          detailKo: "WGSL 소스가 비어 있거나 최대 길이(65,536자)를 초과했습니다.",
        },
      ],
      errors: ["source-length: WGSL source empty or exceeds 65536 bytes"],
    };
  }

  const balanced = checkBalancedWgslDelimiters(wgslSource);
  const wgMatch = /@compute\s+@workgroup_size\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/u.exec(
    wgslSource,
  );
  const fnMatch = /@compute[\s\S]*?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/u.exec(wgslSource);
  const entryPoint = fnMatch && fnMatch[1] ? fnMatch[1] : "";
  const workgroupSize: readonly [number, number, number] = wgMatch
    ? [Number(wgMatch[1]), Number(wgMatch[2]), Number(wgMatch[3])]
    : [0, 0, 0];

  const uniformStructBytes = measureUniformStructBytes(wgslSource, "ShadowGuideUniforms");
  const bindings = parseUniqueBindings(wgslSource);
  const forbiddenGlslHits = scanForbiddenGlslTokens(wgslSource);
  const reservedKeywordHits = scanWgslReservedKeywordCollisions(wgslSource);

  const checks: readonly ShadowGuideWgslCheck[] = [
    {
      id: "delimiters-balanced",
      passed: balanced,
      detailKo: balanced
        ? "중괄호({})·소괄호(())·대괄호([]) 균형이 정상입니다."
        : "중괄호·소괄호·대괄호 짝이 맞지 않습니다.",
    },
    {
      id: "compute-entrypoint",
      passed: Boolean(wgMatch && entryPoint.length > 0 && workgroupSize[0] > 0 && workgroupSize[1] > 0),
      detailKo: `컴퓨트 엔트리포인트(${entryPoint || "없음"}) 및 @workgroup_size(${workgroupSize.join(", ")})`,
    },
    {
      id: "bindings-unique",
      passed:
        bindings.count >= 2 &&
        !bindings.hasDuplicate &&
        wgslSource.includes("var<uniform>") &&
        wgslSource.includes("texture_storage_2d"),
      detailKo: `고유 바인딩 ${bindings.count}개(중복 ${bindings.hasDuplicate ? "있음" : "없음"}), uniform + storage texture 선언 확인`,
    },
    {
      id: "uniform-16b-alignment",
      passed: uniformStructBytes >= 16 && uniformStructBytes % 16 === 0,
      detailKo: `ShadowGuideUniforms 크기 ${uniformStructBytes}B (16B 배수 정렬 여부)`,
    },
    {
      id: "glsl-forbidden-absent",
      passed: forbiddenGlslHits.length === 0,
      detailKo:
        forbiddenGlslHits.length === 0
          ? "GLSL 전용 금지어 0건 확인"
          : `GLSL 금지어 감지: ${forbiddenGlslHits.join(", ")}`,
    },
    {
      id: "reserved-keywords-clean",
      passed: reservedKeywordHits.length === 0,
      detailKo: `WGSL 예약어 충돌 ${reservedKeywordHits.length}건`,
    },
    {
      id: "overlay-domain-symbols",
      passed:
        wgslSource.includes("expected_shadow_vec_and_len") &&
        wgslSource.includes("drawn_shadow_vec_and_len") &&
        wgslSource.includes("textureStore("),
      detailKo: "기대·작화 그림자 벡터 및 textureStore 출력 경로 확인",
    },
  ];

  const errors: string[] = [];
  for (let i = 0; i < checks.length; i += 1) {
    const check = checks[i];
    if (check && !check.passed) {
      errors.push(`${check.id}: ${check.detailKo}`);
    }
  }

  return {
    valid: errors.length === 0,
    entryPoint,
    workgroupSize,
    uniformStructBytes,
    bindingCount: bindings.count,
    forbiddenGlslHits,
    reservedKeywordHits,
    checks,
    errors,
  };
}
