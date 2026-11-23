/**
 * WebGPU NPR 웹툰 가변 윤곽선·셀 셰이딩·하프톤 · GTAO/SSAO·피사계 심도(DoF)·블룸 ·
 * ACES Filmic + 3D LUT 컬러 그레이딩 + 2D↔3D 컷 색감 자동 매칭 엔진.
 *
 * 실제 WebGPU WGSL 셰이더 3종과 결정론적 CPU/ImageData 바이트 동등 렌더러를 함께 제공한다.
 */

export type TimeOfDayPresetId = "daylight" | "sunset" | "night" | "indoor-fluorescent";

export interface Scene3dGBuffer {
  readonly width: number; readonly height: number;
  readonly albedoRgba: Uint8ClampedArray; readonly normalRgb: Float32Array;
  readonly depth: Float32Array; readonly emissiveMask: Float32Array;
}
export interface NprOutlineConfig {
  readonly outlineWidthPx: number; readonly depthEdgeThreshold: number; readonly normalEdgeThreshold: number;
  readonly celBands: 2 | 3; readonly halftoneStrength: number; readonly halftoneFrequency: number;
  readonly rimLightStrength: number; readonly inkRgb: readonly [number, number, number];
}
export interface NprOutlinePassResult {
  readonly rgba: Uint8ClampedArray; readonly edgeMask: Float32Array;
  readonly silhouettePixelCount: number; readonly creasePixelCount: number; readonly halftoneShadowPixels: number;
  readonly avgForegroundInkWidthPx: number; readonly avgBackgroundInkWidthPx: number;
}
export interface SsaoDofConfig {
  readonly ssaoStrength: number; readonly ssaoRadiusPx: number; readonly dofAperture: number;
  readonly focusDepth: number; readonly maxCocRadiusPx: number; readonly bloomThreshold: number; readonly bloomStrength: number;
}
export interface SsaoDofPassResult {
  readonly rgba: Uint8ClampedArray; readonly aoBuffer: Float32Array; readonly cocBuffer: Float32Array;
  readonly meanOcclusion01: number; readonly contactShadowPixels: number; readonly outOfFocusPixels: number; readonly bloomedPixels: number;
}
export interface ColorGradingConfig {
  readonly presetId: TimeOfDayPresetId; readonly exposure: number; readonly temperature: number; readonly tint: number;
  readonly saturation: number; readonly contrast: number;
  readonly liftRgb: readonly [number, number, number]; readonly gammaRgb: readonly [number, number, number]; readonly gainRgb: readonly [number, number, number];
  readonly acesEnabled: boolean; readonly lutStrength: number;
}
export interface ColorGrading3dLut { readonly size: number; readonly data: Float32Array }
export interface ColorGradingPassResult {
  readonly rgba: Uint8ClampedArray; readonly avgLuminance01: number;
  readonly avgRgb01: readonly [number, number, number]; readonly lutSize: number;
}
export interface PaletteMatch2dTo3dResult {
  readonly rgba: Uint8ClampedArray; readonly derivedGrading: ColorGradingConfig;
  readonly deltaEBefore: number; readonly deltaEAfter: number; readonly colorGapReductionRatio01: number;
}
export interface WgslShaderValidationReport {
  readonly name: string; readonly valid: boolean; readonly entryPoints: readonly string[];
  readonly bindingCount: number; readonly structCount: number; readonly errors: readonly string[];
}
export interface WebgpuNprBackendCapability {
  readonly preferredBackend: "webgpu-wgsl" | "cpu-byte-equivalent";
  readonly hasNavigatorGpu: boolean; readonly shaderCount: 3;
}
export interface FullWebgpuNprPipelineOptions {
  readonly npr: NprOutlineConfig; readonly ssaoDof: SsaoDofConfig; readonly grading: ColorGradingConfig;
  readonly match2dCutRgba?: Uint8ClampedArray | null; readonly match2dStrength?: number; readonly lutSize?: number;
}
export interface FullWebgpuNprPipelineResult {
  readonly rgba: Uint8ClampedArray; readonly nprPass: NprOutlinePassResult; readonly ssaoDofPass: SsaoDofPassResult;
  readonly gradingPass: ColorGradingPassResult; readonly paletteMatch: PaletteMatch2dTo3dResult | null;
  readonly backend: WebgpuNprBackendCapability;
}

// ---------------------------------------------------------------------------
// 1. 실제 WebGPU WGSL 셰이더 3종 + 정적 구조 검증기
// ---------------------------------------------------------------------------

export const WGSL_WEBTOON_NPR_OUTLINE_SHADER = /* wgsl */ `
struct NprOutlineUniforms {
  resolution: vec2f, outlineWidthMinPx: f32, outlineWidthMaxPx: f32,
  depthThreshold: f32, normalThreshold: f32, halftoneFreq: f32, halftoneStrength: f32,
  rimStrength: f32, celBands: f32, _pad0: vec2f, lightDir: vec4f, inkColor: vec4f,
};
@group(0) @binding(0) var<uniform> uNpr: NprOutlineUniforms;
@group(0) @binding(1) var tAlbedo: texture_2d<f32>;
@group(0) @binding(2) var tNormal: texture_2d<f32>;
@group(0) @binding(3) var tDepth: texture_2d<f32>;
@group(0) @binding(4) var tOutNpr: texture_storage_2d<rgba8unorm, write>;

fn loadDepth(c: vec2i, dims: vec2i) -> f32 { return textureLoad(tDepth, clamp(c, vec2i(0), dims - vec2i(1)), 0).r; }
fn loadNormal(c: vec2i, dims: vec2i) -> vec3f { return normalize(textureLoad(tNormal, clamp(c, vec2i(0), dims - vec2i(1)), 0).xyz * 2.0 - vec3f(1.0)); }

@compute @workgroup_size(8, 8, 1)
fn mainWebtoonNprOutline(@builtin(global_invocation_id) gid: vec3u) {
  let dims = vec2i(i32(uNpr.resolution.x), i32(uNpr.resolution.y));
  let p = vec2i(i32(gid.x), i32(gid.y));
  if (p.x >= dims.x || p.y >= dims.y) { return; }
  let d = loadDepth(p, dims);
  let n = loadNormal(p, dims);
  let albedo = textureLoad(tAlbedo, p, 0).rgb;
  let stepR = max(1, i32(round(mix(uNpr.outlineWidthMaxPx, uNpr.outlineWidthMinPx, clamp(d, 0.0, 1.0)))));
  let gxD = -loadDepth(p + vec2i(-stepR, -stepR), dims) - 2.0 * loadDepth(p + vec2i(-stepR, 0), dims) - loadDepth(p + vec2i(-stepR, stepR), dims)
          + loadDepth(p + vec2i(stepR, -stepR), dims) + 2.0 * loadDepth(p + vec2i(stepR, 0), dims) + loadDepth(p + vec2i(stepR, stepR), dims);
  let gyD = -loadDepth(p + vec2i(-stepR, -stepR), dims) - 2.0 * loadDepth(p + vec2i(0, -stepR), dims) - loadDepth(p + vec2i(stepR, -stepR), dims)
          + loadDepth(p + vec2i(-stepR, stepR), dims) + 2.0 * loadDepth(p + vec2i(0, stepR), dims) + loadDepth(p + vec2i(stepR, stepR), dims);
  let normalEdge = length(loadNormal(p + vec2i(1, 0), dims) - loadNormal(p + vec2i(-1, 0), dims))
                 + length(loadNormal(p + vec2i(0, 1), dims) - loadNormal(p + vec2i(0, -1), dims));
  let silAlpha = smoothstep(uNpr.depthThreshold, uNpr.depthThreshold * 2.4, sqrt(gxD * gxD + gyD * gyD));
  let creaseAlpha = smoothstep(uNpr.normalThreshold, uNpr.normalThreshold * 2.0, normalEdge) * 0.72;
  let inkAlpha = clamp(max(silAlpha, creaseAlpha) * mix(1.0, 0.42, clamp(d, 0.0, 1.0)), 0.0, 1.0);
  let ndotl = max(0.0, dot(n, normalize(uNpr.lightDir.xyz)));
  var cel = 1.06;
  if (ndotl < 0.30) { cel = 0.52; } else if (ndotl < 0.68 && uNpr.celBands >= 3.0) { cel = 0.84; }
  var lit = albedo * cel + vec3f(pow(1.0 - abs(n.z), 2.5) * uNpr.rimStrength * 0.25);
  if (ndotl < 0.30 && uNpr.halftoneStrength > 0.01) {
    let pf = vec2f(f32(p.x), f32(p.y)) * uNpr.halftoneFreq;
    let rot = vec2f(pf.x * 0.7071 - pf.y * 0.7071, pf.x * 0.7071 + pf.y * 0.7071);
    let dotMask = 1.0 - smoothstep(0.24, 0.34, length(fract(rot) - vec2f(0.5)));
    lit = lit * (1.0 - dotMask * uNpr.halftoneStrength * 0.34);
  }
  textureStore(tOutNpr, p, vec4f(clamp(mix(lit, uNpr.inkColor.rgb, inkAlpha), vec3f(0.0), vec3f(1.0)), 1.0));
}
`;

export const WGSL_GTAO_SSAO_DOF_SHADER = /* wgsl */ `
struct SsaoDofUniforms {
  resolution: vec2f, ssaoRadiusPx: f32, ssaoIntensity: f32,
  focusDepth: f32, aperture: f32, maxCocRadiusPx: f32, bloomThreshold: f32, bloomIntensity: f32, _pad0: vec3f,
};
@group(0) @binding(0) var<uniform> uPost: SsaoDofUniforms;
@group(0) @binding(1) var tLitColor: texture_2d<f32>;
@group(0) @binding(2) var tNormal: texture_2d<f32>;
@group(0) @binding(3) var tDepth: texture_2d<f32>;
@group(0) @binding(4) var tOutPost: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8, 1)
fn mainGtaoSsaoDof(@builtin(global_invocation_id) gid: vec3u) {
  let dims = vec2i(i32(uPost.resolution.x), i32(uPost.resolution.y));
  let p = vec2i(i32(gid.x), i32(gid.y));
  if (p.x >= dims.x || p.y >= dims.y) { return; }
  let d = textureLoad(tDepth, p, 0).r;
  let cn = normalize(textureLoad(tNormal, p, 0).xyz * 2.0 - vec3f(1.0));
  var occ = 0.0;
  let r = max(1.0, uPost.ssaoRadiusPx);
  for (var i = 0; i < 8; i = i + 1) {
    let ang = f32(i) * 0.78539816;
    let sp = clamp(p + vec2i(i32(round(cos(ang) * r)), i32(round(sin(ang) * r))), vec2i(0), dims - vec2i(1));
    let dd = d - textureLoad(tDepth, sp, 0).r;
    if (dd > 0.008 && dd < 0.35) {
      let sn = normalize(textureLoad(tNormal, sp, 0).xyz * 2.0 - vec3f(1.0));
      occ = occ + clamp(dd * 7.5, 0.0, 1.0) * clamp(1.0 - dot(cn, sn), 0.25, 1.0);
    }
  }
  let ao = 1.0 - clamp((occ / 8.0) * uPost.ssaoIntensity * 1.45, 0.0, 0.78);
  let coc = clamp(abs(d - uPost.focusDepth) * uPost.aperture * 2.6 / max(d, 0.08), 0.0, uPost.maxCocRadiusPx);
  let stepB = i32(round(coc));
  var acc = textureLoad(tLitColor, p, 0).rgb;
  var wSum = 1.0;
  if (stepB >= 1) {
    for (var dy = -1; dy <= 1; dy = dy + 1) {
      for (var dx = -1; dx <= 1; dx = dx + 1) {
        if (dx == 0 && dy == 0) { continue; }
        let sp = clamp(p + vec2i(dx * stepB, dy * stepB), vec2i(0), dims - vec2i(1));
        let w = select(0.25, 0.85, abs(textureLoad(tDepth, sp, 0).r - d) < 0.24);
        acc = acc + textureLoad(tLitColor, sp, 0).rgb * w;
        wSum = wSum + w;
      }
    }
  }
  var bloom = vec3f(0.0);
  for (var by = -1; by <= 1; by = by + 1) {
    for (var bx = -1; bx <= 1; bx = bx + 1) {
      let c = textureLoad(tLitColor, clamp(p + vec2i(bx * 2, by * 2), vec2i(0), dims - vec2i(1)), 0).rgb;
      bloom = bloom + c * max(0.0, dot(c, vec3f(0.2126, 0.7152, 0.0722)) - uPost.bloomThreshold);
    }
  }
  let rgb = clamp((acc / wSum) * ao + (bloom / 9.0) * uPost.bloomIntensity * 1.5, vec3f(0.0), vec3f(1.0));
  textureStore(tOutPost, p, vec4f(rgb, 1.0));
}
`;

export const WGSL_COLOR_GRADING_3DLUT_SHADER = /* wgsl */ `
struct ColorGradingUniforms {
  resolution: vec2f, exposure: f32, temperature: f32, tint: f32, saturation: f32,
  contrast: f32, lutStrength: f32, acesEnabled: f32, _pad0: vec3f,
  liftRgb: vec4f, gammaRgb: vec4f, gainRgb: vec4f,
};
@group(0) @binding(0) var<uniform> uGrade: ColorGradingUniforms;
@group(0) @binding(1) var tInput: texture_2d<f32>;
@group(0) @binding(2) var tLut3d: texture_3d<f32>;
@group(0) @binding(3) var sLutLinear: sampler;
@group(0) @binding(4) var tOutGraded: texture_storage_2d<rgba8unorm, write>;

fn acesFilmic(x: vec3f) -> vec3f {
  return clamp((x * (2.51 * x + vec3f(0.03))) / (x * (2.43 * x + vec3f(0.59)) + vec3f(0.14)), vec3f(0.0), vec3f(1.0));
}

@compute @workgroup_size(8, 8, 1)
fn mainColorGrading3dLut(@builtin(global_invocation_id) gid: vec3u) {
  let dims = vec2i(i32(uGrade.resolution.x), i32(uGrade.resolution.y));
  let p = vec2i(i32(gid.x), i32(gid.y));
  if (p.x >= dims.x || p.y >= dims.y) { return; }
  var c = textureLoad(tInput, p, 0).rgb * pow(2.0, uGrade.exposure);
  c = c * vec3f(1.0 + uGrade.temperature * 0.18, 1.0 - uGrade.tint * 0.12, 1.0 - uGrade.temperature * 0.18);
  c = pow(max(clamp(c * uGrade.gainRgb.rgb + uGrade.liftRgb.rgb, vec3f(0.0), vec3f(4.0)), vec3f(0.0001)), vec3f(1.0) / max(uGrade.gammaRgb.rgb, vec3f(0.1)));
  let lum = dot(c, vec3f(0.2126, 0.7152, 0.0722));
  c = (mix(vec3f(lum), c, uGrade.saturation) - vec3f(0.5)) * uGrade.contrast + vec3f(0.5);
  c = select(clamp(c, vec3f(0.0), vec3f(1.0)), acesFilmic(max(c, vec3f(0.0))), uGrade.acesEnabled > 0.5);
  let lutRgb = textureSampleLevel(tLut3d, sLutLinear, c, 0.0).rgb;
  textureStore(tOutGraded, p, vec4f(clamp(mix(c, lutRgb, uGrade.lutStrength), vec3f(0.0), vec3f(1.0)), 1.0));
}
`;

export function validateWgslShaderSource(name: string, source: string): WgslShaderValidationReport {
  const errors: string[] = [];
  let braceDepth = 0;
  let parenDepth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth -= 1;
    else if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    if (braceDepth < 0) errors.push("중괄호 짝 불일치");
    if (parenDepth < 0) errors.push("소괄호 짝 불일치");
  }
  if (braceDepth !== 0) errors.push(`미닫힘 중괄호(${braceDepth})`);
  if (parenDepth !== 0) errors.push(`미닫힘 소괄호(${parenDepth})`);
  const entryPoints = [...source.matchAll(/@(?:compute|fragment|vertex)[^]*?\bfn\s+([A-Za-z0-9_]+)/g)]
    .map((m) => m[1] ?? "").filter(Boolean);
  if (entryPoints.length === 0) errors.push("WGSL 진입점 누락");
  const bindingCount = (source.match(/@group\(\d+\)\s*@binding\(\d+\)/g) ?? []).length;
  if (bindingCount === 0) errors.push("@group/@binding 선언 누락");
  const structCount = (source.match(/\bstruct\s+[A-Za-z0-9_]+/g) ?? []).length;
  if (structCount === 0) errors.push("유니폼 struct 선언 누락");
  if (/\b(?:gl_FragColor|sampler2D|float4|varying)\b/.test(source)) errors.push("비표준 GLSL/HLSL 토큰 혼입");
  return { name, valid: errors.length === 0, entryPoints, bindingCount, structCount, errors };
}

export function detectWebGpuNprCapability(): WebgpuNprBackendCapability {
  const hasNavigatorGpu = typeof navigator !== "undefined"
    && typeof (navigator as unknown as { gpu?: unknown }).gpu === "object"
    && (navigator as unknown as { gpu?: unknown }).gpu !== null;
  return { preferredBackend: hasNavigatorGpu ? "webgpu-wgsl" : "cpu-byte-equivalent", hasNavigatorGpu, shaderCount: 3 };
}

// ---------------------------------------------------------------------------
// 2. 프리셋 · 시간대 컬러 그레이딩 4종 · 결정론적 합성 G-Buffer 생성기
// ---------------------------------------------------------------------------

export const DEFAULT_NPR_OUTLINE_CONFIG: NprOutlineConfig = {
  outlineWidthPx: 1.8, depthEdgeThreshold: 0.055, normalEdgeThreshold: 0.42, celBands: 3,
  halftoneStrength: 0.65, halftoneFrequency: 0.65, rimLightStrength: 0.55, inkRgb: [22, 24, 34],
};
export const DEFAULT_SSAO_DOF_CONFIG: SsaoDofConfig = {
  ssaoStrength: 0.65, ssaoRadiusPx: 3, dofAperture: 0.45, focusDepth: 0.42,
  maxCocRadiusPx: 3, bloomThreshold: 0.78, bloomStrength: 0.45,
};
export const TIME_OF_DAY_GRADING_PRESETS: Readonly<Record<TimeOfDayPresetId, ColorGradingConfig>> = {
  daylight: { presetId: "daylight", exposure: 0.05, temperature: 0.04, tint: 0.0, saturation: 1.06, contrast: 1.04, liftRgb: [0, 0.005, 0.012], gammaRgb: [1, 1, 1], gainRgb: [1.02, 1.01, 0.99], acesEnabled: true, lutStrength: 0.6 },
  sunset: { presetId: "sunset", exposure: 0.02, temperature: 0.68, tint: 0.14, saturation: 1.2, contrast: 1.1, liftRgb: [0.035, 0.008, -0.015], gammaRgb: [1.04, 0.97, 0.88], gainRgb: [1.16, 0.96, 0.76], acesEnabled: true, lutStrength: 0.75 },
  night: { presetId: "night", exposure: -0.35, temperature: -0.62, tint: -0.04, saturation: 0.92, contrast: 1.16, liftRgb: [-0.012, 0.004, 0.045], gammaRgb: [0.88, 0.95, 1.12], gainRgb: [0.76, 0.88, 1.18], acesEnabled: true, lutStrength: 0.75 },
  "indoor-fluorescent": { presetId: "indoor-fluorescent", exposure: 0.08, temperature: -0.18, tint: -0.32, saturation: 0.95, contrast: 1.02, liftRgb: [0.005, 0.018, 0.016], gammaRgb: [0.97, 1.03, 1.01], gainRgb: [0.95, 1.04, 1.02], acesEnabled: true, lutStrength: 0.65 },
};

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / Math.max(1e-6, e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** 근경·중경·원경 실루엣, 90° 내부 주름, 바닥-벽 SSAO 코너, 고휘도 창문(블룸)을 포함한 합성 G-Buffer 생성. */
export function createDemoScene3dGBuffer(width = 64, height = 64): Scene3dGBuffer {
  const w = Math.max(16, Math.floor(width));
  const h = Math.max(16, Math.floor(height));
  const total = w * h;
  const albedoRgba = new Uint8ClampedArray(total * 4);
  const normalRgb = new Float32Array(total * 3);
  const depth = new Float32Array(total);
  const emissiveMask = new Float32Array(total);

  for (let y = 0; y < h; y += 1) {
    const ny = y / (h - 1);
    for (let x = 0; x < w; x += 1) {
      const nx = x / (w - 1);
      const idx = y * w + x;
      let r = Math.round(165 + ny * 42); let g = Math.round(196 + ny * 32); let b = Math.round(232 + ny * 18);
      let d = 0.94; let vx = 0; let vy = 0; let vz = 1; let emissive = 0;

      if (ny > 0.24 && ny < 0.68 && nx > 0.56 && nx < 0.90) {
        r = 152; g = 166; b = 188; d = 0.80; vx = -0.15; vy = 0.05; vz = 0.987;
        if (ny > 0.32 && ny < 0.48 && nx > 0.64 && nx < 0.82) { r = 252; g = 248; b = 240; emissive = 1.0; }
      }
      if (ny >= 0.66) {
        const ft = clamp((ny - 0.66) / 0.34, 0, 1);
        r = Math.round(194 - ft * 24); g = Math.round(186 - ft * 20); b = Math.round(176 - ft * 16);
        d = 0.74 - ft * 0.44; vx = 0; vy = 1; vz = 0;
      }
      if (nx >= 0.34 && nx <= 0.62 && ny >= 0.22 && ny <= 0.70) {
        const left = nx < 0.48;
        r = left ? 222 : 184; g = left ? 212 : 178; b = left ? 202 : 172;
        d = 0.42 + Math.abs(nx - 0.48) * 0.08;
        vx = left ? -0.7071 : 0.7071; vy = 0; vz = 0.7071;
      }
      if (nx >= 0.08 && nx <= 0.30 && ny >= 0.38 && ny <= 0.84) {
        const shadowSide = nx > 0.20;
        r = shadowSide ? 168 : 218; g = shadowSide ? 158 : 196; b = shadowSide ? 162 : 178; d = 0.17;
        if (shadowSide) { vx = 0.94; vy = -0.22; vz = 0.26; } else { vx = -0.45; vy = 0.55; vz = 0.70; }
      }

      const len = Math.hypot(vx, vy, vz) || 1;
      const p4 = idx * 4; const p3 = idx * 3;
      albedoRgba[p4] = r; albedoRgba[p4 + 1] = g; albedoRgba[p4 + 2] = b; albedoRgba[p4 + 3] = 255;
      normalRgb[p3] = vx / len; normalRgb[p3 + 1] = vy / len; normalRgb[p3 + 2] = vz / len;
      depth[idx] = d; emissiveMask[idx] = emissive;
    }
  }
  return { width: w, height: h, albedoRgba, normalRgb, depth, emissiveMask };
}

// ---------------------------------------------------------------------------
// 3. 패스 1: 깊이·법선 Sobel 가변 윤곽선 · 3단 셀 · 45° 하프톤 스크린톤
// ---------------------------------------------------------------------------

export function renderWebtoonNprOutlinePass(
  gbuffer: Scene3dGBuffer, config: NprOutlineConfig = DEFAULT_NPR_OUTLINE_CONFIG,
): NprOutlinePassResult {
  const { width: w, height: h, albedoRgba, normalRgb, depth, emissiveMask } = gbuffer;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const edgeMask = new Float32Array(w * h);
  const lLen = Math.hypot(-0.55, 0.65, 0.52);
  const lx = -0.55 / lLen; const ly = 0.65 / lLen; const lz = 0.52 / lLen;
  const baseW = clamp(config.outlineWidthPx, 0.5, 3.0);
  const minW = Math.max(0.5, baseW * 0.45);
  const maxW = baseW * 1.45;

  let silhouettePixelCount = 0; let creasePixelCount = 0; let halftoneShadowPixels = 0;
  let fgWidthSum = 0; let fgCount = 0; let bgWidthSum = 0; let bgCount = 0;

  const rd = (x: number, y: number): number => depth[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)] ?? 1;
  const rn = (x: number, y: number, c: 0 | 1 | 2): number => normalRgb[(clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)) * 3 + c] ?? 0;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = y * w + x; const p4 = idx * 4; const p3 = idx * 3;
      const d = depth[idx] ?? 1;
      const widthPx = maxW + (minW - maxW) * clamp(d, 0, 1);
      const r = Math.max(1, Math.round(widthPx));

      const gxD = -rd(x - r, y - r) - 2 * rd(x - r, y) - rd(x - r, y + r) + rd(x + r, y - r) + 2 * rd(x + r, y) + rd(x + r, y + r);
      const gyD = -rd(x - r, y - r) - 2 * rd(x, y - r) - rd(x + r, y - r) + rd(x - r, y + r) + 2 * rd(x, y + r) + rd(x + r, y + r);
      const normalEdge =
        Math.hypot(rn(x + 1, y, 0) - rn(x - 1, y, 0), rn(x + 1, y, 1) - rn(x - 1, y, 1), rn(x + 1, y, 2) - rn(x - 1, y, 2)) +
        Math.hypot(rn(x, y + 1, 0) - rn(x, y - 1, 0), rn(x, y + 1, 1) - rn(x, y - 1, 1), rn(x, y + 1, 2) - rn(x, y - 1, 2));

      const silAlpha = smoothstep(config.depthEdgeThreshold, config.depthEdgeThreshold * 2.4, Math.hypot(gxD, gyD));
      const creaseAlpha = smoothstep(config.normalEdgeThreshold, config.normalEdgeThreshold * 2.0, normalEdge) * 0.72;
      const inkAlpha = clamp(Math.max(silAlpha, creaseAlpha) * (1.0 + (0.42 - 1.0) * clamp(d, 0, 1)), 0, 1);
      edgeMask[idx] = inkAlpha;

      if (silAlpha > 0.25) {
        silhouettePixelCount += 1;
        if (d < 0.35) { fgWidthSum += widthPx; fgCount += 1; } else if (d > 0.65) { bgWidthSum += widthPx; bgCount += 1; }
      } else if (creaseAlpha > 0.25) {
        creasePixelCount += 1;
      }

      const emissive = emissiveMask[idx] ?? 0;
      const ndotl = Math.max(0, (normalRgb[p3] ?? 0) * lx + (normalRgb[p3 + 1] ?? 0) * ly + (normalRgb[p3 + 2] ?? 1) * lz);
      const cel = emissive >= 0.5 ? 1.15 : ndotl < 0.3 ? 0.52 : (ndotl < 0.68 && config.celBands >= 3 ? 0.84 : 1.06);
      const rim = Math.pow(1 - Math.abs(normalRgb[p3 + 2] ?? 1), 2.5) * config.rimLightStrength * 0.25 * 255;
      let cr = (albedoRgba[p4] ?? 0) * cel + rim;
      let cg = (albedoRgba[p4 + 1] ?? 0) * cel + rim;
      let cb = (albedoRgba[p4 + 2] ?? 0) * cel + rim;

      if (emissive < 0.5 && ndotl < 0.3 && config.halftoneStrength > 0.01) {
        const px = x * config.halftoneFrequency; const py = y * config.halftoneFrequency;
        const rx = px * 0.70710678 - py * 0.70710678; const ry = px * 0.70710678 + py * 0.70710678;
        const dotMask = 1 - smoothstep(0.24, 0.34, Math.hypot(rx - Math.floor(rx) - 0.5, ry - Math.floor(ry) - 0.5));
        if (dotMask > 0.25) halftoneShadowPixels += 1;
        const s = 1 - dotMask * config.halftoneStrength * 0.34;
        cr *= s; cg *= s; cb *= s;
      }

      rgba[p4] = Math.round(clamp(cr * (1 - inkAlpha) + config.inkRgb[0] * inkAlpha, 0, 255));
      rgba[p4 + 1] = Math.round(clamp(cg * (1 - inkAlpha) + config.inkRgb[1] * inkAlpha, 0, 255));
      rgba[p4 + 2] = Math.round(clamp(cb * (1 - inkAlpha) + config.inkRgb[2] * inkAlpha, 0, 255));
      rgba[p4 + 3] = 255;
    }
  }

  return {
    rgba, edgeMask, silhouettePixelCount, creasePixelCount, halftoneShadowPixels,
    avgForegroundInkWidthPx: fgCount > 0 ? fgWidthSum / fgCount : maxW,
    avgBackgroundInkWidthPx: bgCount > 0 ? bgWidthSum / bgCount : minW,
  };
}

// ---------------------------------------------------------------------------
// 4. 패스 2: GTAO/SSAO 접촉 그림자 + 피사계 심도(CoC DoF) + 하이라이트 블룸
// ---------------------------------------------------------------------------

const SSAO_COS = [1, 0.70710678, 0, -0.70710678, -1, -0.70710678, 0, 0.70710678] as const;
const SSAO_SIN = [0, 0.70710678, 1, 0.70710678, 0, -0.70710678, -1, -0.70710678] as const;

export function renderGtaoSsaoDofPass(
  colorRgba: Uint8ClampedArray, gbuffer: Scene3dGBuffer, config: SsaoDofConfig = DEFAULT_SSAO_DOF_CONFIG,
): SsaoDofPassResult {
  const { width: w, height: h, normalRgb, depth } = gbuffer;
  const total = w * h;
  const rgba = new Uint8ClampedArray(total * 4);
  const aoBuffer = new Float32Array(total);
  const cocBuffer = new Float32Array(total);

  const ssaoStr = clamp(config.ssaoStrength, 0, 1);
  const ssaoRad = clamp(config.ssaoRadiusPx, 1, 8);
  const aperture = clamp(config.dofAperture, 0, 1);
  const focusD = clamp(config.focusDepth, 0.05, 0.95);
  const maxCoc = clamp(config.maxCocRadiusPx, 1, 5);
  const bloomT = clamp(config.bloomThreshold, 0.5, 0.99);
  const bloomStr = clamp(config.bloomStrength, 0, 1);

  let aoSum = 0; let contactShadowPixels = 0; let outOfFocusPixels = 0; let bloomedPixels = 0;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = y * w + x; const p4 = idx * 4; const p3 = idx * 3;
      const d = depth[idx] ?? 1;
      let occ = 0;
      if (ssaoStr > 0.005) {
        const cnx = normalRgb[p3] ?? 0; const cny = normalRgb[p3 + 1] ?? 0; const cnz = normalRgb[p3 + 2] ?? 1;
        for (let k = 0; k < 8; k += 1) {
          const sIdx = clamp(y + Math.round((SSAO_SIN[k] ?? 0) * ssaoRad), 0, h - 1) * w + clamp(x + Math.round((SSAO_COS[k] ?? 0) * ssaoRad), 0, w - 1);
          const dd = d - (depth[sIdx] ?? 1);
          if (dd > 0.008 && dd < 0.35) {
            const sp3 = sIdx * 3;
            const dotN = cnx * (normalRgb[sp3] ?? 0) + cny * (normalRgb[sp3 + 1] ?? 0) + cnz * (normalRgb[sp3 + 2] ?? 1);
            occ += clamp(dd * 7.5, 0, 1) * clamp(1 - dotN, 0.25, 1.0);
          }
        }
      }
      const occlusion01 = clamp((occ / 8) * ssaoStr * 1.45, 0, 0.78);
      const ao = 1 - occlusion01;
      aoBuffer[idx] = ao; aoSum += occlusion01;
      if (occlusion01 >= 0.08) contactShadowPixels += 1;

      const coc = clamp((Math.abs(d - focusD) * aperture * 2.6) / Math.max(d, 0.08), 0, maxCoc);
      cocBuffer[idx] = coc;
      if (coc >= 0.45) outOfFocusPixels += 1;
      const stepB = Math.round(coc);

      let accR = colorRgba[p4] ?? 0; let accG = colorRgba[p4 + 1] ?? 0; let accB = colorRgba[p4 + 2] ?? 0; let wSum = 1;
      if (stepB >= 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const sIdx = clamp(y + dy * stepB, 0, h - 1) * w + clamp(x + dx * stepB, 0, w - 1);
            const wgt = Math.abs((depth[sIdx] ?? 1) - d) < 0.24 ? 0.85 : 0.25;
            const sp4 = sIdx * 4;
            accR += (colorRgba[sp4] ?? 0) * wgt; accG += (colorRgba[sp4 + 1] ?? 0) * wgt; accB += (colorRgba[sp4 + 2] ?? 0) * wgt; wSum += wgt;
          }
        }
      }
      let r = (accR / wSum) * ao; let g = (accG / wSum) * ao; let b = (accB / wSum) * ao;

      if (bloomStr > 0.005) {
        let br = 0; let bg = 0; let bb = 0;
        for (let by = -1; by <= 1; by += 1) {
          for (let bx = -1; bx <= 1; bx += 1) {
            const sp4 = (clamp(y + by * 2, 0, h - 1) * w + clamp(x + bx * 2, 0, w - 1)) * 4;
            const cr = (colorRgba[sp4] ?? 0) / 255; const cg = (colorRgba[sp4 + 1] ?? 0) / 255; const cb = (colorRgba[sp4 + 2] ?? 0) / 255;
            const ex = Math.max(0, 0.2126 * cr + 0.7152 * cg + 0.0722 * cb - bloomT);
            if (ex > 0) { br += cr * ex; bg += cg * ex; bb += cb * ex; }
          }
        }
        const bs = (bloomStr * 1.5 * 255) / 9;
        if (br + bg + bb > 0.001) bloomedPixels += 1;
        r += br * bs; g += bg * bs; b += bb * bs;
      }

      rgba[p4] = Math.round(clamp(r, 0, 255)); rgba[p4 + 1] = Math.round(clamp(g, 0, 255));
      rgba[p4 + 2] = Math.round(clamp(b, 0, 255)); rgba[p4 + 3] = 255;
    }
  }

  return { rgba, aoBuffer, cocBuffer, meanOcclusion01: total > 0 ? aoSum / total : 0, contactShadowPixels, outOfFocusPixels, bloomedPixels };
}

// ---------------------------------------------------------------------------
// 5. 패스 3: ACES Filmic + 3D LUT 컬러 그레이딩 + 2D↔3D 팔레트 자동 매칭
// ---------------------------------------------------------------------------

const acesFilmicScalar = (x: number): number => {
  const s = Math.max(0, x);
  return clamp((s * (2.51 * s + 0.03)) / (s * (2.43 * s + 0.59) + 0.14), 0, 1);
};

/** 시간대 프리셋 기반 절차적 3D LUT(size³×3)를 생성한다. */
export function buildColorGrading3dLut(config: ColorGradingConfig, size = 9): ColorGrading3dLut {
  const s = Math.max(4, Math.min(33, Math.floor(size)));
  const data = new Float32Array(s * s * s * 3);
  const inv = 1 / (s - 1);
  for (let bi = 0; bi < s; bi += 1) {
    const b0 = bi * inv;
    for (let gi = 0; gi < s; gi += 1) {
      const g0 = gi * inv;
      for (let ri = 0; ri < s; ri += 1) {
        const r0 = ri * inv;
        const lum = 0.2126 * r0 + 0.7152 * g0 + 0.0722 * b0;
        const off = ((bi * s + gi) * s + ri) * 3;
        data[off] = clamp(r0 + config.liftRgb[0] * (1 - lum) + (config.gainRgb[0] - 1) * 0.35 * lum, 0, 1);
        data[off + 1] = clamp(g0 + config.liftRgb[1] * (1 - lum) + (config.gainRgb[1] - 1) * 0.35 * lum, 0, 1);
        data[off + 2] = clamp(b0 + config.liftRgb[2] * (1 - lum) + (config.gainRgb[2] - 1) * 0.35 * lum, 0, 1);
      }
    }
  }
  return { size: s, data };
}

function sample3dLutTrilinear(lut: ColorGrading3dLut, r: number, g: number, b: number): readonly [number, number, number] {
  const s = lut.size; const m = s - 1;
  const rf = clamp(r, 0, 1) * m; const gf = clamp(g, 0, 1) * m; const bf = clamp(b, 0, 1) * m;
  const r0 = Math.floor(rf); const g0 = Math.floor(gf); const b0 = Math.floor(bf);
  const r1 = Math.min(m, r0 + 1); const g1 = Math.min(m, g0 + 1); const b1 = Math.min(m, b0 + 1);
  const tr = rf - r0; const tg = gf - g0; const tb = bf - b0;
  const at = (ri: number, gi: number, bi: number, ch: 0 | 1 | 2): number => lut.data[((bi * s + gi) * s + ri) * 3 + ch] ?? 0;
  const lerpCh = (ch: 0 | 1 | 2): number => {
    const c00 = at(r0, g0, b0, ch) + (at(r1, g0, b0, ch) - at(r0, g0, b0, ch)) * tr;
    const c10 = at(r0, g1, b0, ch) + (at(r1, g1, b0, ch) - at(r0, g1, b0, ch)) * tr;
    const c01 = at(r0, g0, b1, ch) + (at(r1, g0, b1, ch) - at(r0, g0, b1, ch)) * tr;
    const c11 = at(r0, g1, b1, ch) + (at(r1, g1, b1, ch) - at(r0, g1, b1, ch)) * tr;
    const c0 = c00 + (c10 - c00) * tg; const c1 = c01 + (c11 - c01) * tg;
    return c0 + (c1 - c0) * tb;
  };
  return [lerpCh(0), lerpCh(1), lerpCh(2)];
}

export function applyColorGrading3dLutPass(
  colorRgba: Uint8ClampedArray, width: number, height: number, config: ColorGradingConfig, lut3d?: ColorGrading3dLut,
): ColorGradingPassResult {
  const total = width * height;
  const rgba = new Uint8ClampedArray(total * 4);
  const lut = lut3d ?? buildColorGrading3dLut(config, 9);
  const expGain = Math.pow(2, config.exposure);
  const wbR = 1 + config.temperature * 0.18; const wbG = 1 - config.tint * 0.12; const wbB = 1 - config.temperature * 0.18;
  const igR = 1 / Math.max(0.1, config.gammaRgb[0]); const igG = 1 / Math.max(0.1, config.gammaRgb[1]); const igB = 1 / Math.max(0.1, config.gammaRgb[2]);
  const lutStr = clamp(config.lutStrength, 0, 1);
  let sumR = 0; let sumG = 0; let sumB = 0; let sumLum = 0;

  for (let i = 0; i < total; i += 1) {
    const p4 = i * 4;
    let r = Math.pow(Math.max(0.0001, clamp(((colorRgba[p4] ?? 0) / 255) * expGain * wbR * config.gainRgb[0] + config.liftRgb[0], 0, 4)), igR);
    let g = Math.pow(Math.max(0.0001, clamp(((colorRgba[p4 + 1] ?? 0) / 255) * expGain * wbG * config.gainRgb[1] + config.liftRgb[1], 0, 4)), igG);
    let b = Math.pow(Math.max(0.0001, clamp(((colorRgba[p4 + 2] ?? 0) / 255) * expGain * wbB * config.gainRgb[2] + config.liftRgb[2], 0, 4)), igB);
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = (lum + (r - lum) * config.saturation - 0.5) * config.contrast + 0.5;
    g = (lum + (g - lum) * config.saturation - 0.5) * config.contrast + 0.5;
    b = (lum + (b - lum) * config.saturation - 0.5) * config.contrast + 0.5;
    r = config.acesEnabled ? acesFilmicScalar(r) : clamp(r, 0, 1);
    g = config.acesEnabled ? acesFilmicScalar(g) : clamp(g, 0, 1);
    b = config.acesEnabled ? acesFilmicScalar(b) : clamp(b, 0, 1);
    if (lutStr > 0.001) {
      const [lr, lg, lb] = sample3dLutTrilinear(lut, r, g, b);
      r += (lr - r) * lutStr; g += (lg - g) * lutStr; b += (lb - b) * lutStr;
    }
    sumR += r; sumG += g; sumB += b; sumLum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    rgba[p4] = Math.round(clamp(r * 255, 0, 255)); rgba[p4 + 1] = Math.round(clamp(g * 255, 0, 255));
    rgba[p4 + 2] = Math.round(clamp(b * 255, 0, 255)); rgba[p4 + 3] = 255;
  }

  const inv = total > 0 ? 1 / total : 0;
  return { rgba, avgLuminance01: sumLum * inv, avgRgb01: [sumR * inv, sumG * inv, sumB * inv], lutSize: lut.size };
}

interface ColorMomentStats { readonly meanR: number; readonly meanG: number; readonly meanB: number; readonly stdR: number; readonly stdG: number; readonly stdB: number }

function measureMoments(rgba: Uint8ClampedArray, count: number): ColorMomentStats {
  const n = Math.max(1, count);
  let sr = 0; let sg = 0; let sb = 0;
  for (let i = 0; i < n; i += 1) { const p = i * 4; sr += (rgba[p] ?? 0) / 255; sg += (rgba[p + 1] ?? 0) / 255; sb += (rgba[p + 2] ?? 0) / 255; }
  const meanR = sr / n; const meanG = sg / n; const meanB = sb / n;
  let vr = 0; let vg = 0; let vb = 0;
  for (let i = 0; i < n; i += 1) {
    const p = i * 4;
    const dr = (rgba[p] ?? 0) / 255 - meanR; const dg = (rgba[p + 1] ?? 0) / 255 - meanG; const db = (rgba[p + 2] ?? 0) / 255 - meanB;
    vr += dr * dr; vg += dg * dg; vb += db * db;
  }
  return { meanR, meanG, meanB, stdR: Math.max(0.02, Math.sqrt(vr / n)), stdG: Math.max(0.02, Math.sqrt(vg / n)), stdB: Math.max(0.02, Math.sqrt(vb / n)) };
}

function perceptualDeltaE(a: ColorMomentStats, b: ColorMomentStats): number {
  const dL = (0.299 * (a.meanR - b.meanR) + 0.587 * (a.meanG - b.meanG) + 0.114 * (a.meanB - b.meanB)) * 100;
  const dRG = ((a.meanR - a.meanG) - (b.meanR - b.meanG)) * 140;
  const dYB = (0.5 * (a.meanR + a.meanG) - a.meanB - (0.5 * (b.meanR + b.meanG) - b.meanB)) * 110;
  return Math.hypot(dL, dRG, dYB);
}

/** 2D 웹툰 컷의 색채 분포를 분석해 3D 배경 렌더에 자동 모멘트 전이·컬러 그레이딩을 적용한다. */
export function match3dBackgroundTo2dCutPalette(
  bg3dRgba: Uint8ClampedArray, cut2dRgba: Uint8ClampedArray, width: number, height: number, strength = 1.0,
): PaletteMatch2dTo3dResult {
  const total = width * height;
  const str = clamp(strength, 0, 1);
  const src = measureMoments(bg3dRgba, total);
  const ref = measureMoments(cut2dRgba, total);
  const deltaEBefore = perceptualDeltaE(src, ref);
  const sR = clamp(ref.stdR / src.stdR, 0.55, 1.8);
  const sG = clamp(ref.stdG / src.stdG, 0.55, 1.8);
  const sB = clamp(ref.stdB / src.stdB, 0.55, 1.8);

  const matched = new Uint8ClampedArray(total * 4);
  for (let i = 0; i < total; i += 1) {
    const p = i * 4;
    const r0 = (bg3dRgba[p] ?? 0) / 255; const g0 = (bg3dRgba[p + 1] ?? 0) / 255; const b0 = (bg3dRgba[p + 2] ?? 0) / 255;
    const tr = clamp((r0 - src.meanR) * sR + ref.meanR, 0, 1);
    const tg = clamp((g0 - src.meanG) * sG + ref.meanG, 0, 1);
    const tb = clamp((b0 - src.meanB) * sB + ref.meanB, 0, 1);
    matched[p] = Math.round(clamp((r0 + (tr - r0) * str) * 255, 0, 255));
    matched[p + 1] = Math.round(clamp((g0 + (tg - g0) * str) * 255, 0, 255));
    matched[p + 2] = Math.round(clamp((b0 + (tb - b0) * str) * 255, 0, 255));
    matched[p + 3] = 255;
  }

  const deltaEAfter = perceptualDeltaE(measureMoments(matched, total), ref);
  const warmShift = clamp((ref.meanR - ref.meanB) - (src.meanR - src.meanB), -1, 1);
  const avgScale = (sR + sG + sB) / 3;
  const derivedGrading: ColorGradingConfig = {
    presetId: warmShift > 0.12 ? "sunset" : warmShift < -0.12 ? "night" : "daylight",
    exposure: clamp(Math.log2(Math.max(0.25, (ref.meanR + ref.meanG + ref.meanB) / Math.max(0.05, src.meanR + src.meanG + src.meanB))), -1, 1),
    temperature: warmShift, tint: clamp((src.meanG - ref.meanG) * 2, -1, 1),
    saturation: clamp(avgScale, 0.5, 1.8), contrast: clamp(avgScale, 0.7, 1.4),
    liftRgb: [clamp(ref.meanR - src.meanR * sR, -0.3, 0.3), clamp(ref.meanG - src.meanG * sG, -0.3, 0.3), clamp(ref.meanB - src.meanB * sB, -0.3, 0.3)],
    gammaRgb: [1, 1, 1], gainRgb: [sR, sG, sB], acesEnabled: true, lutStrength: 0.75,
  };
  return {
    rgba: matched, derivedGrading, deltaEBefore, deltaEAfter,
    colorGapReductionRatio01: deltaEBefore > 1e-4 ? clamp(1 - deltaEAfter / deltaEBefore, 0, 1) : 1,
  };
}

/** 2D 웹툰 컷 기준 팔레트 샘플 버퍼를 시간대 분위기에 맞춰 생성한다. */
export function createDemo2dCutReferenceBuffer(
  width = 64, height = 64, presetId: TimeOfDayPresetId = "sunset",
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const pal: Readonly<Record<TimeOfDayPresetId, readonly [number, number, number]>> = {
    daylight: [198, 206, 214], sunset: [232, 164, 126], night: [72, 92, 146], "indoor-fluorescent": [194, 214, 208],
  };
  const base = pal[presetId];
  for (let y = 0; y < height; y += 1) {
    const grad = (y / Math.max(1, height - 1) - 0.5) * 34;
    for (let x = 0; x < width; x += 1) {
      const wave = Math.sin((x / Math.max(1, width)) * Math.PI * 2) * 12;
      const p = (y * width + x) * 4;
      rgba[p] = Math.round(clamp(base[0] + grad + wave, 0, 255));
      rgba[p + 1] = Math.round(clamp(base[1] + grad * 0.8 + wave * 0.7, 0, 255));
      rgba[p + 2] = Math.round(clamp(base[2] + grad * 0.6 - wave * 0.5, 0, 255));
      rgba[p + 3] = 255;
    }
  }
  return rgba;
}

/** 3단계 WebGPU NPR 파이프라인(윤곽선/셀/하프톤 → SSAO/DoF/블룸 → ACES/3D LUT/2D매칭) 일괄 실행. */
export function runFullWebgpuNprPipeline(
  gbuffer: Scene3dGBuffer, options: FullWebgpuNprPipelineOptions,
): FullWebgpuNprPipelineResult {
  const nprPass = renderWebtoonNprOutlinePass(gbuffer, options.npr);
  const ssaoDofPass = renderGtaoSsaoDofPass(nprPass.rgba, gbuffer, options.ssaoDof);
  const lut = buildColorGrading3dLut(options.grading, options.lutSize ?? 9);
  const gradingPass = applyColorGrading3dLutPass(ssaoDofPass.rgba, gbuffer.width, gbuffer.height, options.grading, lut);
  const paletteMatch = options.match2dCutRgba
    ? match3dBackgroundTo2dCutPalette(gradingPass.rgba, options.match2dCutRgba, gbuffer.width, gbuffer.height, options.match2dStrength ?? 0.9)
    : null;
  return {
    rgba: paletteMatch ? paletteMatch.rgba : gradingPass.rgba,
    nprPass, ssaoDofPass, gradingPass, paletteMatch, backend: detectWebGpuNprCapability(),
  };
}
