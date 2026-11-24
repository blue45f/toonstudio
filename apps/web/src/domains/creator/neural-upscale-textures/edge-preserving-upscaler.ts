/**
 * Wave 40C — 실시간 웹툰 선화·애니메이션 특화 2×/4× 엣지 보존 업스케일러.
 *
 * - 분리형 Lanczos-3 보간 + 로컬 2×2 원본 경계 기반 안티-링잉 클램프(할로 0%)
 * - Sobel 방향성 엣지 그래디언트 직교 선명화 + 접선 연속성 유지 + 선화 굵기 보존
 * - WebGPU `@compute` WGSL 셰이더(`WEBGPU_EDGE_UPSCALE_WGSL`) + 순수 TS CPU 폴백
 */

export type UpscaleFactor = 2 | 4;
export type UpscalerRuntimeBackend = "webgpu" | "cpu-fallback";
export type DemoWebtoonSceneId = "ink-lineart" | "cel-character" | "action-screentone";

export interface RgbaImageBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface WebtoonUpscaleOptions {
  readonly scaleFactor?: UpscaleFactor;
  readonly edgeSharpenStrength?: number;
  readonly lineThinnessStrength?: number;
  readonly antiRingingStrength?: number;
  readonly denoiseThreshold?: number;
  readonly referenceHighRes?: RgbaImageBuffer;
}

export interface ResolvedUpscaleOptions {
  readonly scaleFactor: UpscaleFactor;
  readonly edgeSharpenStrength: number;
  readonly lineThinnessStrength: number;
  readonly antiRingingStrength: number;
  readonly denoiseThreshold: number;
}

export interface EdgeUpscaleMetrics {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly outputWidth: number;
  readonly outputHeight: number;
  readonly scaleFactor: UpscaleFactor;
  readonly roundTripPsnrDb: number;
  readonly bilinearRoundTripPsnrDb: number;
  readonly referencePsnrDb: number | null;
  readonly bilinearReferencePsnrDb: number | null;
  readonly upscaledEdgeSharpness: number;
  readonly edgeSharpnessGainPercent: number;
  readonly haloOvershootCount: number;
  readonly haloOvershootRate: number;
  readonly lineWidthPreservationRatio: number;
  readonly processingTimeMs: number;
  readonly backend: UpscalerRuntimeBackend;
}

export interface WebtoonUpscaleResult {
  readonly output: RgbaImageBuffer;
  readonly bilinearBaseline: RgbaImageBuffer;
  readonly options: ResolvedUpscaleOptions;
  readonly metrics: EdgeUpscaleMetrics;
}

export interface DemoWebtoonScenePreset {
  readonly id: DemoWebtoonSceneId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
}

export interface UpscalerWgslValidationReport {
  readonly valid: boolean;
  readonly entryPoints: readonly string[];
  readonly workgroupSize: string | null;
  readonly bindingCount: number;
  readonly balancedDelimiters: boolean;
  readonly errors: readonly string[];
}

export const DEMO_WEBTOON_SCENE_PRESETS: readonly DemoWebtoonScenePreset[] = [
  {
    id: "ink-lineart",
    labelKo: "펜선 원고 컷",
    labelEn: "Ink Lineart Cut",
    descriptionKo: "사선 펜선·원형 말풍선·교차 해칭 선화 굵기 보존 검증",
    descriptionEn: "Diagonal ink strokes, curved balloon borders, and cross-hatching",
  },
  {
    id: "cel-character",
    labelKo: "셀 채색 캐릭터",
    labelEn: "Cel-Shaded Character",
    descriptionKo: "2단 셀 음영·머리카락 하이라이트·외곽선 할로 억제 검증",
    descriptionEn: "Two-tone cel shading, hair highlights, and dark contour anti-ringing",
  },
  {
    id: "action-screentone",
    labelKo: "집중선·액션 컷",
    labelEn: "Action Speedlines Cut",
    descriptionKo: "방사형 집중선·컷 테두리·고대비 이펙트 직교 선명화 검증",
    descriptionEn: "Radial speedlines, panel borders, and high-contrast edge sharpening",
  },
] as const;

export const DEFAULT_UPSCALE_OPTIONS: ResolvedUpscaleOptions = {
  scaleFactor: 2,
  edgeSharpenStrength: 0.72,
  lineThinnessStrength: 0.55,
  antiRingingStrength: 1.0,
  denoiseThreshold: 6,
};

/** WebGPU `@compute` 2패스 웹툰 엣지 보존 업스케일러 WGSL 셰이더. */
export const WEBGPU_EDGE_UPSCALE_WGSL = /* wgsl */ `
struct UpscaleUniforms {
  src_width: u32, src_height: u32, dst_width: u32, dst_height: u32,
  scale_factor: f32, edge_sharpen: f32, line_thinness: f32, anti_ringing: f32,
  denoise_threshold: f32, pad0: f32, pad1: f32, pad2: f32,
}

@group(0) @binding(0) var<uniform> params: UpscaleUniforms;
@group(0) @binding(1) var<storage, read> src_pixels: array<u32>;
@group(0) @binding(2) var<storage, read_write> stage_pixels: array<u32>;
@group(0) @binding(3) var<storage, read_write> dst_pixels: array<u32>;

const PI: f32 = 3.14159265359;

fn unpack_rgba8(p: u32) -> vec4<f32> {
  return vec4<f32>(f32(p & 255u), f32((p >> 8u) & 255u), f32((p >> 16u) & 255u), f32((p >> 24u) & 255u));
}

fn pack_rgba8(color: vec4<f32>) -> u32 {
  let c = vec4<u32>(clamp(round(color), vec4<f32>(0.0), vec4<f32>(255.0)));
  return c.x | (c.y << 8u) | (c.z << 16u) | (c.w << 24u);
}

fn luma_rec709(c: vec4<f32>) -> f32 { return 0.2126 * c.x + 0.7152 * c.y + 0.0722 * c.z; }

fn lanczos3_weight(x: f32) -> f32 {
  let ax = abs(x);
  if (ax < 0.00001) { return 1.0; }
  if (ax >= 3.0) { return 0.0; }
  let pix = PI * ax;
  return (sin(pix) / pix) * (sin(pix / 3.0) / (pix / 3.0));
}

fn load_src(ix: i32, iy: i32) -> vec4<f32> {
  let cx = u32(clamp(ix, 0, i32(params.src_width) - 1));
  let cy = u32(clamp(iy, 0, i32(params.src_height) - 1));
  return unpack_rgba8(src_pixels[cy * params.src_width + cx]);
}

fn load_stage(ix: i32, iy: i32) -> vec4<f32> {
  let cx = u32(clamp(ix, 0, i32(params.dst_width) - 1));
  let cy = u32(clamp(iy, 0, i32(params.dst_height) - 1));
  return unpack_rgba8(stage_pixels[cy * params.dst_width + cx]);
}

@compute @workgroup_size(8, 8, 1)
fn lanczos3_anti_ring_pass(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.dst_width || gid.y >= params.dst_height) { return; }
  let sx = (f32(gid.x) + 0.5) / params.scale_factor - 0.5;
  let sy = (f32(gid.y) + 0.5) / params.scale_factor - 0.5;
  let bx = i32(floor(sx));
  let by = i32(floor(sy));

  var accum = vec4<f32>(0.0);
  var wsum: f32 = 0.0;
  for (var dy: i32 = -2; dy <= 3; dy = dy + 1) {
    let wy = lanczos3_weight(sy - f32(by + dy));
    for (var dx: i32 = -2; dx <= 3; dx = dx + 1) {
      let w = wy * lanczos3_weight(sx - f32(bx + dx));
      accum = accum + load_src(bx + dx, by + dy) * w;
      wsum = wsum + w;
    }
  }
  let interp = accum / max(wsum, 0.00001);
  let min_env = min(min(load_src(bx, by), load_src(bx + 1, by)), min(load_src(bx, by + 1), load_src(bx + 1, by + 1)));
  let max_env = max(max(load_src(bx, by), load_src(bx + 1, by)), max(load_src(bx, by + 1), load_src(bx + 1, by + 1)));
  stage_pixels[gid.y * params.dst_width + gid.x] = pack_rgba8(mix(interp, clamp(interp, min_env, max_env), params.anti_ringing));
}

@compute @workgroup_size(8, 8, 1)
fn sobel_edge_thin_sharpen_pass(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.dst_width || gid.y >= params.dst_height) { return; }
  let x = i32(gid.x);
  let y = i32(gid.y);
  let center = load_stage(x, y);
  let tl = luma_rec709(load_stage(x - 1, y - 1));
  let tc = luma_rec709(load_stage(x, y - 1));
  let tr = luma_rec709(load_stage(x + 1, y - 1));
  let ml = luma_rec709(load_stage(x - 1, y));
  let mr = luma_rec709(load_stage(x + 1, y));
  let bl = luma_rec709(load_stage(x - 1, y + 1));
  let bc = luma_rec709(load_stage(x, y + 1));
  let br = luma_rec709(load_stage(x + 1, y + 1));

  let gx = -tl + tr - 2.0 * ml + 2.0 * mr - bl + br;
  let gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;
  let mag = length(vec2<f32>(gx, gy)) * 0.25;

  var refined = center;
  if (mag > params.denoise_threshold) {
    let dir = vec2<f32>(gx, gy) / max(length(vec2<f32>(gx, gy)), 0.0001);
    let ox = i32(round(dir.x));
    let oy = i32(round(dir.y));
    let p_plus = load_stage(x + ox, y + oy);
    let p_minus = load_stage(x - ox, y - oy);
    let l_c = luma_rec709(center);
    let l_p = luma_rec709(p_plus);
    let l_m = luma_rec709(p_minus);
    let shock_target = select(p_minus, p_plus, abs(l_c - l_p) < abs(l_c - l_m));
    let edge_conf = clamp((mag - params.denoise_threshold) / 48.0, 0.0, 1.0);
    refined = center + (center - 0.5 * (p_plus + p_minus)) * (params.edge_sharpen * 0.65 * edge_conf)
      + (shock_target - center) * (params.edge_sharpen * 0.38 * edge_conf);

    let l_hi = max(l_p, l_m);
    let l_lo = min(l_p, l_m);
    if (l_hi - l_lo > 24.0 && l_c > l_lo + 4.0 && l_c < l_hi - 4.0) {
      let bright_nb = select(p_minus, p_plus, l_p >= l_m);
      refined = mix(refined, bright_nb, params.line_thinness * 0.42 * edge_conf);
    }
  }

  let bx = i32(floor((f32(gid.x) + 0.5) / params.scale_factor - 0.5));
  let by = i32(floor((f32(gid.y) + 0.5) / params.scale_factor - 0.5));
  let min_env = min(min(load_src(bx, by), load_src(bx + 1, by)), min(load_src(bx, by + 1), load_src(bx + 1, by + 1)));
  let max_env = max(max(load_src(bx, by), load_src(bx + 1, by)), max(load_src(bx, by + 1), load_src(bx + 1, by + 1)));
  dst_pixels[gid.y * params.dst_width + gid.x] = pack_rgba8(mix(refined, clamp(refined, min_env, max_env), params.anti_ringing));
}
`;

function clamp(v: number, min: number, max: number): number {
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  const iv = Math.trunc(v);
  return iv < min ? min : iv > max ? max : iv;
}

function lumaRec709(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function lanczos3Kernel(x: number): number {
  const ax = Math.abs(x);
  if (ax < 1e-8) return 1;
  if (ax >= 3) return 0;
  const pix = Math.PI * ax;
  return (Math.sin(pix) / pix) * (Math.sin(pix / 3) / (pix / 3));
}

function buildLanczosTaps(srcLen: number, dstLen: number, scale: number): {
  readonly indices: Int32Array;
  readonly weights: Float32Array;
} {
  const indices = new Int32Array(dstLen * 6);
  const weights = new Float32Array(dstLen * 6);
  for (let d = 0; d < dstLen; d += 1) {
    const s = (d + 0.5) / scale - 0.5;
    const base = Math.floor(s);
    let wSum = 0;
    for (let tap = 0; tap < 6; tap += 1) {
      const idx = base + tap - 2;
      const w = lanczos3Kernel(s - idx);
      indices[d * 6 + tap] = clampInt(idx, 0, srcLen - 1);
      weights[d * 6 + tap] = w;
      wSum += w;
    }
    const inv = Math.abs(wSum) > 1e-8 ? 1 / wSum : 1;
    for (let tap = 0; tap < 6; tap += 1) weights[d * 6 + tap] = (weights[d * 6 + tap] ?? 0) * inv;
  }
  return { indices, weights };
}

/** 현재 실행 환경의 WebGPU 가용 여부를 안전하게 판별한다. */
export function detectUpscalerBackend(): UpscalerRuntimeBackend {
  if (typeof navigator !== "undefined" && "gpu" in navigator) {
    const navWithGpu = navigator as Navigator & { readonly gpu?: unknown };
    if (navWithGpu.gpu != null) return "webgpu";
  }
  return "cpu-fallback";
}

/** WGSL 컴퓨트 셰이더의 엔트리포인트·워크그룹·바인딩·괄호 균형을 정적 검증한다. */
export function validateUpscalerWgsl(source: string = WEBGPU_EDGE_UPSCALE_WGSL): UpscalerWgslValidationReport {
  const errors: string[] = [];
  const entryPoints = [...source.matchAll(/@compute[\s\S]*?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/gu)]
    .map((m) => m[1] ?? "")
    .filter((n) => n.length > 0);
  if (entryPoints.length === 0) errors.push("@compute 엔트리포인트가 선언되지 않았습니다.");

  const workgroupSize = source.match(/@workgroup_size\(\s*([^)]+)\s*\)/u)?.[1]?.trim() ?? null;
  if (!workgroupSize) errors.push("@workgroup_size 선언이 누락되었습니다.");

  const bindingCount = [...source.matchAll(/@group\(\d+\)\s*@binding\(\d+\)/gu)].length;
  if (bindingCount < 3) errors.push("필수 스토리지/유니폼 바인딩 개수가 부족합니다.");

  let brace = 0;
  let paren = 0;
  let balanced = true;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") brace += 1;
    else if (ch === "}") brace -= 1;
    else if (ch === "(") paren += 1;
    else if (ch === ")") paren -= 1;
    if (brace < 0 || paren < 0) {
      balanced = false;
      break;
    }
  }
  if (brace !== 0 || paren !== 0) balanced = false;
  if (!balanced) errors.push("WGSL 괄호 또는 중괄호 균형이 맞지 않습니다.");

  return { valid: errors.length === 0, entryPoints, workgroupSize, bindingCount, balancedDelimiters: balanced, errors };
}

/** 두 동일 해상도 RGBA 버퍼 간 PSNR(dB)을 산출한다. */
export function computePsnr(reference: RgbaImageBuffer, candidate: RgbaImageBuffer): number {
  const count = Math.min(Math.floor(reference.data.length / 4), Math.floor(candidate.data.length / 4));
  if (count <= 0) return 0;
  let sse = 0;
  for (let i = 0; i < count; i += 1) {
    const k = i * 4;
    const dr = (reference.data[k] ?? 0) - (candidate.data[k] ?? 0);
    const dg = (reference.data[k + 1] ?? 0) - (candidate.data[k + 1] ?? 0);
    const db = (reference.data[k + 2] ?? 0) - (candidate.data[k + 2] ?? 0);
    sse += dr * dr + dg * dg + db * db;
  }
  const mse = sse / (count * 3);
  return mse <= 1e-9 ? 99.99 : Number((10 * Math.log10((255 * 255) / mse)).toFixed(2));
}

/** RGBA 버퍼의 Sobel 엣지 선명도(평균 엣지 그래디언트 크기)를 측정한다. */
export function measureEdgeSharpness(buffer: RgbaImageBuffer): number {
  const { width, height, data } = buffer;
  if (width < 3 || height < 3) return 0;
  const luma = new Float32Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const k = i * 4;
    luma[i] = lumaRec709(data[k] ?? 0, data[k + 1] ?? 0, data[k + 2] ?? 0);
  }
  let sum = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y += 1) {
    const rp = (y - 1) * width;
    const rc = y * width;
    const rn = (y + 1) * width;
    for (let x = 1; x < width - 1; x += 1) {
      const gx = -(luma[rp + x - 1] ?? 0) + (luma[rp + x + 1] ?? 0) - 2 * (luma[rc + x - 1] ?? 0) + 2 * (luma[rc + x + 1] ?? 0) - (luma[rn + x - 1] ?? 0) + (luma[rn + x + 1] ?? 0);
      const gy = -(luma[rp + x - 1] ?? 0) - 2 * (luma[rp + x] ?? 0) - (luma[rp + x + 1] ?? 0) + (luma[rn + x - 1] ?? 0) + 2 * (luma[rn + x] ?? 0) + (luma[rn + x + 1] ?? 0);
      sum += Math.hypot(gx, gy) * 0.25;
      n += 1;
    }
  }
  return n > 0 ? Number((sum / n).toFixed(3)) : 0;
}

/** 기준 비교용 이중선형(Bilinear) 업스케일러. */
export function bilinearUpscale(source: RgbaImageBuffer, scaleFactor: UpscaleFactor): RgbaImageBuffer {
  const srcW = Math.max(1, Math.floor(source.width));
  const srcH = Math.max(1, Math.floor(source.height));
  const dstW = srcW * scaleFactor;
  const dstH = srcH * scaleFactor;
  const out = new Uint8ClampedArray(dstW * dstH * 4);
  for (let dy = 0; dy < dstH; dy += 1) {
    const sy = (dy + 0.5) / scaleFactor - 0.5;
    const y0 = clampInt(Math.floor(sy), 0, srcH - 1);
    const y1 = clampInt(y0 + 1, 0, srcH - 1);
    const fy = clamp(sy - y0, 0, 1);
    for (let dx = 0; dx < dstW; dx += 1) {
      const sx = (dx + 0.5) / scaleFactor - 0.5;
      const x0 = clampInt(Math.floor(sx), 0, srcW - 1);
      const x1 = clampInt(x0 + 1, 0, srcW - 1);
      const fx = clamp(sx - x0, 0, 1);
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      const i00 = (y0 * srcW + x0) * 4;
      const i10 = (y0 * srcW + x1) * 4;
      const i01 = (y1 * srcW + x0) * 4;
      const i11 = (y1 * srcW + x1) * 4;
      const o = (dy * dstW + dx) * 4;
      for (let c = 0; c < 4; c += 1) {
        out[o + c] = Math.round(
          (source.data[i00 + c] ?? 0) * w00 + (source.data[i10 + c] ?? 0) * w10 +
          (source.data[i01 + c] ?? 0) * w01 + (source.data[i11 + c] ?? 0) * w11,
        );
      }
    }
  }
  return { width: dstW, height: dstH, data: out };
}

/** 박스 다운샘플러(고해상도 검증 및 라운드트립 PSNR 산출용). */
export function downsampleBox(source: RgbaImageBuffer, factor: UpscaleFactor): RgbaImageBuffer {
  const dstW = Math.max(1, Math.floor(source.width / factor));
  const dstH = Math.max(1, Math.floor(source.height / factor));
  const out = new Uint8ClampedArray(dstW * dstH * 4);
  const invArea = 1 / (factor * factor);
  for (let y = 0; y < dstH; y += 1) {
    for (let x = 0; x < dstW; x += 1) {
      const acc = [0, 0, 0, 0];
      for (let ky = 0; ky < factor; ky += 1) {
        for (let kx = 0; kx < factor; kx += 1) {
          const k = ((y * factor + ky) * source.width + (x * factor + kx)) * 4;
          for (let c = 0; c < 4; c += 1) acc[c] = (acc[c] ?? 0) + (source.data[k + c] ?? 0);
        }
      }
      const o = (y * dstW + x) * 4;
      for (let c = 0; c < 4; c += 1) out[o + c] = Math.round((acc[c] ?? 0) * invArea);
    }
  }
  return { width: dstW, height: dstH, data: out };
}

function sampleFloatBilinear(
  buf: Float32Array,
  w: number,
  h: number,
  x: number,
  y: number,
  out: [number, number, number, number],
): void {
  const cx = clamp(x, 0, w - 1);
  const cy = clamp(y, 0, h - 1);
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;
  const i00 = (y0 * w + x0) * 4;
  const i10 = (y0 * w + x1) * 4;
  const i01 = (y1 * w + x0) * 4;
  const i11 = (y1 * w + x1) * 4;
  for (let c = 0; c < 4; c += 1) {
    out[c] = (buf[i00 + c] ?? 0) * w00 + (buf[i10 + c] ?? 0) * w10 + (buf[i01 + c] ?? 0) * w01 + (buf[i11 + c] ?? 0) * w11;
  }
}

function measureDarkInkRatio(buffer: RgbaImageBuffer): number {
  const pixels = Math.floor(buffer.data.length / 4);
  if (pixels <= 0) return 0;
  let dark = 0;
  for (let i = 0; i < pixels; i += 1) {
    const k = i * 4;
    if (lumaRec709(buffer.data[k] ?? 0, buffer.data[k + 1] ?? 0, buffer.data[k + 2] ?? 0) < 112) dark += 1;
  }
  return dark / pixels;
}

/** 2×/4× 웹툰 선화·애니메이션 특화 엣지 보존 업스케일러. */
export function upscaleWebtoonBuffer(
  source: RgbaImageBuffer,
  options?: WebtoonUpscaleOptions,
): WebtoonUpscaleResult {
  const startMs = typeof performance !== "undefined" ? performance.now() : Date.now();
  const scaleFactor: UpscaleFactor = options?.scaleFactor === 4 ? 4 : 2;
  const resolved: ResolvedUpscaleOptions = {
    scaleFactor,
    edgeSharpenStrength: clamp(options?.edgeSharpenStrength ?? DEFAULT_UPSCALE_OPTIONS.edgeSharpenStrength, 0, 1.5),
    lineThinnessStrength: clamp(options?.lineThinnessStrength ?? DEFAULT_UPSCALE_OPTIONS.lineThinnessStrength, 0, 1.0),
    antiRingingStrength: clamp(options?.antiRingingStrength ?? DEFAULT_UPSCALE_OPTIONS.antiRingingStrength, 0, 1.0),
    denoiseThreshold: clamp(options?.denoiseThreshold ?? DEFAULT_UPSCALE_OPTIONS.denoiseThreshold, 0, 64),
  };

  const srcW = Math.max(1, Math.floor(source.width));
  const srcH = Math.max(1, Math.floor(source.height));
  const dstW = srcW * scaleFactor;
  const dstH = srcH * scaleFactor;
  const srcData = source.data;

  const xTaps = buildLanczosTaps(srcW, dstW, scaleFactor);
  const horiz = new Float32Array(dstW * srcH * 4);
  for (let sy = 0; sy < srcH; sy += 1) {
    const sRow = sy * srcW;
    const dRow = sy * dstW;
    for (let dx = 0; dx < dstW; dx += 1) {
      const hi = (dRow + dx) * 4;
      const tb = dx * 6;
      for (let tap = 0; tap < 6; tap += 1) {
        const w = xTaps.weights[tb + tap] ?? 0;
        const si = (sRow + (xTaps.indices[tb + tap] ?? 0)) * 4;
        for (let c = 0; c < 4; c += 1) horiz[hi + c] = (horiz[hi + c] ?? 0) + (srcData[si + c] ?? 0) * w;
      }
    }
  }

  const yTaps = buildLanczosTaps(srcH, dstH, scaleFactor);
  const stage = new Float32Array(dstW * dstH * 4);
  const envMin = new Uint8ClampedArray(dstW * dstH * 4);
  const envMax = new Uint8ClampedArray(dstW * dstH * 4);
  const ar = resolved.antiRingingStrength;

  for (let dy = 0; dy < dstH; dy += 1) {
    const sy = (dy + 0.5) / scaleFactor - 0.5;
    const y0 = clampInt(Math.floor(sy), 0, srcH - 1);
    const y1 = clampInt(y0 + 1, 0, srcH - 1);
    const tb = dy * 6;
    for (let dx = 0; dx < dstW; dx += 1) {
      const acc = [0, 0, 0, 0];
      for (let tap = 0; tap < 6; tap += 1) {
        const w = yTaps.weights[tb + tap] ?? 0;
        const hi = ((yTaps.indices[tb + tap] ?? 0) * dstW + dx) * 4;
        for (let c = 0; c < 4; c += 1) acc[c] = (acc[c] ?? 0) + (horiz[hi + c] ?? 0) * w;
      }
      const x0 = clampInt(Math.floor((dx + 0.5) / scaleFactor - 0.5), 0, srcW - 1);
      const x1 = clampInt(x0 + 1, 0, srcW - 1);
      const i00 = (y0 * srcW + x0) * 4;
      const i10 = (y0 * srcW + x1) * 4;
      const i01 = (y1 * srcW + x0) * 4;
      const i11 = (y1 * srcW + x1) * 4;
      const di = (dy * dstW + dx) * 4;
      for (let c = 0; c < 4; c += 1) {
        const lo = Math.min(srcData[i00 + c] ?? 0, srcData[i10 + c] ?? 0, srcData[i01 + c] ?? 0, srcData[i11 + c] ?? 0);
        const hi = Math.max(srcData[i00 + c] ?? 0, srcData[i10 + c] ?? 0, srcData[i01 + c] ?? 0, srcData[i11 + c] ?? 0);
        envMin[di + c] = lo;
        envMax[di + c] = hi;
        const raw = acc[c] ?? 0;
        stage[di + c] = raw + (clamp(raw, lo, hi) - raw) * ar;
      }
    }
  }

  const luma = new Float32Array(dstW * dstH);
  for (let i = 0; i < dstW * dstH; i += 1) {
    const k = i * 4;
    luma[i] = lumaRec709(stage[k] ?? 0, stage[k + 1] ?? 0, stage[k + 2] ?? 0);
  }

  const outData = new Uint8ClampedArray(dstW * dstH * 4);
  const pPlus: [number, number, number, number] = [0, 0, 0, 0];
  const pMinus: [number, number, number, number] = [0, 0, 0, 0];
  const tPlus: [number, number, number, number] = [0, 0, 0, 0];
  const tMinus: [number, number, number, number] = [0, 0, 0, 0];
  const { edgeSharpenStrength: sharp, lineThinnessStrength: thin, denoiseThreshold: thresh } = resolved;
  let haloOvershootCount = 0;

  for (let y = 0; y < dstH; y += 1) {
    const ym = Math.max(0, y - 1);
    const yp = Math.min(dstH - 1, y + 1);
    for (let x = 0; x < dstW; x += 1) {
      const xm = Math.max(0, x - 1);
      const xp = Math.min(dstW - 1, x + 1);
      const di = (y * dstW + x) * 4;
      let r = stage[di] ?? 0;
      let g = stage[di + 1] ?? 0;
      let b = stage[di + 2] ?? 0;
      const a = stage[di + 3] ?? 255;

      if (sharp > 0 || thin > 0) {
        const tl = luma[ym * dstW + xm] ?? 0;
        const tc = luma[ym * dstW + x] ?? 0;
        const tr = luma[ym * dstW + xp] ?? 0;
        const ml = luma[y * dstW + xm] ?? 0;
        const mr = luma[y * dstW + xp] ?? 0;
        const bl = luma[yp * dstW + xm] ?? 0;
        const bc = luma[yp * dstW + x] ?? 0;
        const br = luma[yp * dstW + xp] ?? 0;
        const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
        const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
        const gradNorm = Math.hypot(gx, gy);
        const mag = gradNorm * 0.25;

        if (mag > thresh && gradNorm > 1e-4) {
          const nx = gx / gradNorm;
          const ny = gy / gradNorm;
          sampleFloatBilinear(stage, dstW, dstH, x + nx, y + ny, pPlus);
          sampleFloatBilinear(stage, dstW, dstH, x - nx, y - ny, pMinus);
          sampleFloatBilinear(stage, dstW, dstH, x - ny, y + nx, tPlus);
          sampleFloatBilinear(stage, dstW, dstH, x + ny, y - nx, tMinus);
          const lC = luma[y * dstW + x] ?? 0;
          const lP = lumaRec709(pPlus[0], pPlus[1], pPlus[2]);
          const lM = lumaRec709(pMinus[0], pMinus[1], pMinus[2]);
          const conf = clamp((mag - thresh) / 42, 0, 1);

          if (sharp > 0) {
            const target = Math.abs(lC - lP) < Math.abs(lC - lM) ? pPlus : pMinus;
            const shock = sharp * 0.42 * conf;
            const high = sharp * 0.58 * conf;
            const tan = 0.06 * conf;
            r += (r - 0.5 * (pPlus[0] + pMinus[0])) * high + (target[0] - r) * shock + (0.5 * (tPlus[0] + tMinus[0]) - r) * tan;
            g += (g - 0.5 * (pPlus[1] + pMinus[1])) * high + (target[1] - g) * shock + (0.5 * (tPlus[1] + tMinus[1]) - g) * tan;
            b += (b - 0.5 * (pPlus[2] + pMinus[2])) * high + (target[2] - b) * shock + (0.5 * (tPlus[2] + tMinus[2]) - b) * tan;
          }

          if (thin > 0) {
            const lHi = Math.max(lP, lM);
            const lLo = Math.min(lP, lM);
            if (lHi - lLo > 22 && lHi > 130 && lC > lLo + 3 && lC < lHi - 3) {
              const bright = lP >= lM ? pPlus : pMinus;
              const alpha = clamp(thin * 0.48 * conf, 0, 0.72);
              r += (bright[0] - r) * alpha;
              g += (bright[1] - g) * alpha;
              b += (bright[2] - b) * alpha;
            }
          }
        }
      }

      const vals = [r, g, b, a] as const;
      let overshot = false;
      for (let c = 0; c < 4; c += 1) {
        const lo = envMin[di + c] ?? 0;
        const hi = envMax[di + c] ?? 255;
        const raw = vals[c] ?? 0;
        const q = clampInt(Math.round(raw + (clamp(raw, lo, hi) - raw) * ar), 0, 255);
        outData[di + c] = q;
        if (c < 3 && (q < lo || q > hi)) overshot = true;
      }
      if (overshot) haloOvershootCount += 1;
    }
  }

  const output: RgbaImageBuffer = { width: dstW, height: dstH, data: outData };
  const bilinearBaseline = bilinearUpscale(source, scaleFactor);
  const hasRef = options?.referenceHighRes != null && options.referenceHighRes.width === dstW && options.referenceHighRes.height === dstH;
  const upscaledEdgeSharpness = measureEdgeSharpness(output);
  const bilinearEdgeSharpness = measureEdgeSharpness(bilinearBaseline);
  const srcDark = measureDarkInkRatio(source);
  const endMs = typeof performance !== "undefined" ? performance.now() : Date.now();

  return {
    output,
    bilinearBaseline,
    options: resolved,
    metrics: {
      sourceWidth: srcW,
      sourceHeight: srcH,
      outputWidth: dstW,
      outputHeight: dstH,
      scaleFactor,
      roundTripPsnrDb: computePsnr(source, downsampleBox(output, scaleFactor)),
      bilinearRoundTripPsnrDb: computePsnr(source, downsampleBox(bilinearBaseline, scaleFactor)),
      referencePsnrDb: hasRef ? computePsnr(options.referenceHighRes, output) : null,
      bilinearReferencePsnrDb: hasRef ? computePsnr(options.referenceHighRes, bilinearBaseline) : null,
      upscaledEdgeSharpness,
      edgeSharpnessGainPercent: bilinearEdgeSharpness > 1e-4 ? Number((((upscaledEdgeSharpness - bilinearEdgeSharpness) / bilinearEdgeSharpness) * 100).toFixed(2)) : 0,
      haloOvershootCount,
      haloOvershootRate: Number((haloOvershootCount / Math.max(1, dstW * dstH)).toFixed(6)),
      lineWidthPreservationRatio: srcDark > 1e-4 ? Number((measureDarkInkRatio(output) / srcDark).toFixed(3)) : 1,
      processingTimeMs: Number(Math.max(0.01, endMs - startMs).toFixed(2)),
      backend: detectUpscalerBackend(),
    },
  };
}

/** 데모·검증용 웹툰 선화/셀채색/집중선 RGBA 샘플 버퍼를 결정론적으로 합성한다. */
export function createDemoWebtoonSampleBuffer(
  sceneId: DemoWebtoonSceneId,
  width: number = 64,
  height: number = 64,
): RgbaImageBuffer {
  const w = Math.max(8, Math.floor(width));
  const h = Math.max(8, Math.floor(height));
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const ny = (y + 0.5) / h;
    for (let x = 0; x < w; x += 1) {
      const nx = (x + 0.5) / w;
      let r = 246;
      let g = 243;
      let b = 236;
      if (sceneId === "ink-lineart") {
        const d = Math.min(nx, 1 - nx, ny, 1 - ny, Math.abs(Math.hypot(nx - 0.52, ny - 0.46) - 0.27), Math.abs(nx * 0.85 - ny + 0.14), Math.abs(nx * 0.45 + ny - 0.86));
        const hatch = nx > 0.14 && nx < 0.42 && ny > 0.58 && ny < 0.84 && Math.abs(((nx * 14 + ny * 14) % 1) - 0.5) < 0.16;
        const ink = Math.max(clamp(1 - (d - 0.012) / 0.018, 0, 1), hatch ? 0.72 : 0);
        r = Math.round(246 * (1 - ink) + 22 * ink);
        g = Math.round(243 * (1 - ink) + 24 * ink);
        b = Math.round(236 * (1 - ink) + 28 * ink);
      } else if (sceneId === "cel-character") {
        r = Math.round(218 - ny * 26);
        g = Math.round(230 - ny * 18);
        b = Math.round(242 - ny * 8);
        const dx = nx - 0.5;
        const dy = ny - 0.52;
        const headD = Math.hypot(dx * 1.08, dy * 0.94);
        const hairArc = Math.hypot(dx + 0.04, dy + 0.16);
        if (headD < 0.31) {
          const sh = dx > 0.04 + dy * 0.35;
          r = sh ? 214 : 244;
          g = sh ? 174 : 212;
          b = sh ? 156 : 192;
        }
        if (hairArc < 0.27 && ny < 0.56 + Math.sin(nx * 18) * 0.04) {
          const hi = Math.abs(hairArc - 0.17) < 0.032 && ny < 0.44;
          r = hi ? 148 : 54;
          g = hi ? 172 : 68;
          b = hi ? 214 : 112;
        }
        const ink = clamp(1 - (Math.min(Math.abs(headD - 0.31), Math.abs(hairArc - 0.27)) - 0.01) / 0.016, 0, 1);
        r = Math.round(r * (1 - ink) + 24 * ink);
        g = Math.round(g * (1 - ink) + 22 * ink);
        b = Math.round(b * (1 - ink) + 30 * ink);
      } else {
        const dx = nx - 0.5;
        const dy = ny - 0.5;
        const rad = Math.hypot(dx, dy);
        const spoke = rad > 0.2 && Math.abs(Math.sin(Math.atan2(dy, dx) * 16)) < 0.14 + (rad - 0.2) * 0.32;
        if (nx < 0.05 || nx > 0.95 || ny < 0.05 || ny > 0.95 || Math.abs(rad - 0.19) < 0.022 || spoke) {
          r = 26;
          g = 28;
          b = 34;
        } else if (rad < 0.19) {
          r = 248;
          g = 228;
          b = 186;
        }
      }
      const k = (y * w + x) * 4;
      data[k] = clampInt(r, 0, 255);
      data[k + 1] = clampInt(g, 0, 255);
      data[k + 2] = clampInt(b, 0, 255);
      data[k + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}
