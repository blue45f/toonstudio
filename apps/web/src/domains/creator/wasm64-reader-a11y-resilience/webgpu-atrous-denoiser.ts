/**
 * WebGPU 실시간 에지 보존 À-Trous 바이래터럴 디노이저(`WGSL_ATROUS_BILATERAL_DENOISER` + CPU 패리티).
 *
 * - 5×5 B3-스플라인 À-Trous 웨이블릿 커널(`stepSize = 1, 2, 4, ...`) + 색상·공간·선화 잉크 보호 가중치
 * - 몬테카를로 GI/레이트레이싱·브러시 그레인 노이즈 분산을 억제하면서 검은 잉크 선화 경계를 보존한다.
 */

export const ATROUS_WORKGROUP_X = 16 as const;
export const ATROUS_WORKGROUP_Y = 16 as const;
export const ATROUS_UNIFORM_BYTES = 48 as const;

export interface AtrousDenoiserConfig {
  readonly width: number;
  readonly height: number;
  readonly passes?: number;
  readonly sigmaColor?: number;
  readonly sigmaSpatial?: number;
  readonly inkLuminanceThreshold?: number;
  readonly inkProtectionStrength?: number;
}

export interface PackedAtrousUniforms {
  readonly buffer: ArrayBuffer;
  readonly u32View: Uint32Array;
  readonly f32View: Float32Array;
  readonly byteLength: typeof ATROUS_UNIFORM_BYTES;
  readonly width: number;
  readonly height: number;
  readonly stepSize: number;
  readonly sigmaColor: number;
  readonly sigmaSpatial: number;
  readonly inkLuminanceThreshold: number;
  readonly inkProtectionStrength: number;
}

export interface AtrousWorkgroupGrid {
  readonly x: number;
  readonly y: number;
  readonly z: 1;
  readonly workgroupSize: readonly [16, 16, 1];
  readonly totalWorkgroups: number;
}

export interface AtrousWgslValidation {
  readonly valid: boolean;
  readonly entryPoint: string | null;
  readonly workgroupSize: readonly [number, number, number] | null;
  readonly bindings: readonly { readonly group: number; readonly binding: number }[];
  readonly errors: readonly string[];
}

export interface AtrousPipelineDescriptor {
  readonly label: string;
  readonly layout: "auto";
  readonly compute: {
    readonly module: { readonly label?: string };
    readonly entryPoint: "main";
  };
}

export interface AtrousDenoiseCpuResult {
  readonly backend: "cpu-fallback";
  readonly width: number;
  readonly height: number;
  readonly passesExecuted: number;
  readonly rgba: Uint8ClampedArray;
  readonly inputNoiseVariance: number;
  readonly outputNoiseVariance: number;
  readonly noiseReductionRatio: number;
  readonly edgePreservationScore: number;
  readonly inkProtectedPixelCount: number;
}

/**
 * WebGPU `@workgroup_size(16, 16)` 5×5 À-Trous 에지 보존 바이래터럴 디노이저 컴퓨트 셰이더.
 */
export const WGSL_ATROUS_BILATERAL_DENOISER = /* wgsl */ `
struct AtrousUniforms {
  width: u32,
  height: u32,
  stepSize: u32,
  _pad0: u32,
  sigmaColor: f32,
  sigmaSpatial: f32,
  inkLuminanceThreshold: f32,
  inkProtectionStrength: f32,
  _pad1: vec4<f32>,
};

@group(0) @binding(0) var<uniform> params: AtrousUniforms;
@group(0) @binding(1) var<storage, read> srcPixels: array<u32>;
@group(0) @binding(2) var<storage, read_write> dstPixels: array<u32>;

fn unpackRgba8(packed: u32) -> vec4<f32> {
  return vec4<f32>(
    f32(packed & 255u) / 255.0,
    f32((packed >> 8u) & 255u) / 255.0,
    f32((packed >> 16u) & 255u) / 255.0,
    f32((packed >> 24u) & 255u) / 255.0
  );
}

fn packRgba8(c: vec4<f32>) -> u32 {
  let r = u32(round(clamp(c.r, 0.0, 1.0) * 255.0));
  let g = u32(round(clamp(c.g, 0.0, 1.0) * 255.0));
  let b = u32(round(clamp(c.b, 0.0, 1.0) * 255.0));
  let a = u32(round(clamp(c.a, 0.0, 1.0) * 255.0));
  return r | (g << 8u) | (b << 16u) | (a << 24u);
}

fn loadPixel(x: i32, y: i32) -> vec4<f32> {
  let cx = u32(clamp(x, 0, i32(params.width) - 1));
  let cy = u32(clamp(y, 0, i32(params.height) - 1));
  return unpackRgba8(srcPixels[cy * params.width + cx]);
}

fn luma(rgb: vec3<f32>) -> f32 {
  return dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn kernelWeight(offset: i32) -> f32 {
  let a = abs(offset);
  if (a == 0) { return 0.375; }
  if (a == 1) { return 0.25; }
  return 0.0625;
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }
  let cx = i32(gid.x);
  let cy = i32(gid.y);
  let center = loadPixel(cx, cy);
  let centerLuma = luma(center.rgb);
  let centerIsInk = centerLuma <= params.inkLuminanceThreshold;

  let invTwoSigmaColorSq = 1.0 / max(2.0 * params.sigmaColor * params.sigmaColor, 1e-5);
  let invTwoSigmaSpatialSq = 1.0 / max(2.0 * params.sigmaSpatial * params.sigmaSpatial, 1e-5);
  let stepI = i32(max(params.stepSize, 1u));

  var accum = vec3<f32>(0.0);
  var weightSum = 0.0;

  for (var dy: i32 = -2; dy <= 2; dy = dy + 1) {
    let wy = kernelWeight(dy);
    for (var dx: i32 = -2; dx <= 2; dx = dx + 1) {
      let wx = kernelWeight(dx);
      let samplePx = loadPixel(cx + dx * stepI, cy + dy * stepI);
      let sampleLuma = luma(samplePx.rgb);
      let sampleIsInk = sampleLuma <= params.inkLuminanceThreshold;

      let diff = samplePx.rgb - center.rgb;
      let colorDistSq = dot(diff, diff);
      let wColor = exp(-colorDistSq * invTwoSigmaColorSq);

      let spatialDistSq = f32(dx * dx + dy * dy);
      let wSpatial = exp(-spatialDistSq * invTwoSigmaSpatialSq);

      var wInk = 1.0;
      if (centerIsInk != sampleIsInk) {
        wInk = max(0.0, 1.0 - params.inkProtectionStrength);
      }

      let w = wx * wy * wColor * wSpatial * wInk;
      accum = accum + samplePx.rgb * w;
      weightSum = weightSum + w;
    }
  }

  let denoisedRgb = select(center.rgb, accum / weightSum, weightSum > 1e-6);
  dstPixels[gid.y * params.width + gid.x] = packRgba8(vec4<f32>(denoisedRgb, center.a));
}
`;

const ATROUS_B3_KERNEL: readonly number[] = [0.0625, 0.25, 0.375, 0.25, 0.0625];

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

export function packAtrousDenoiserUniforms(config: AtrousDenoiserConfig, stepSize = 1): PackedAtrousUniforms {
  const width = Math.max(1, Math.floor(config.width));
  const height = Math.max(1, Math.floor(config.height));
  const clampedStep = Math.max(1, Math.floor(stepSize));
  const sigmaColor = clampNumber(config.sigmaColor ?? 0.16, 0.01, 2.0);
  const sigmaSpatial = clampNumber(config.sigmaSpatial ?? 1.8, 0.25, 8.0);
  const inkLuminanceThreshold = clampNumber(config.inkLuminanceThreshold ?? 0.22, 0.01, 0.6);
  const inkProtectionStrength = clampNumber(config.inkProtectionStrength ?? 0.96, 0, 1);

  const buffer = new ArrayBuffer(ATROUS_UNIFORM_BYTES);
  const u32View = new Uint32Array(buffer);
  const f32View = new Float32Array(buffer);
  u32View[0] = width;
  u32View[1] = height;
  u32View[2] = clampedStep;
  u32View[3] = 0;
  f32View[4] = sigmaColor;
  f32View[5] = sigmaSpatial;
  f32View[6] = inkLuminanceThreshold;
  f32View[7] = inkProtectionStrength;

  return {
    buffer,
    u32View,
    f32View,
    byteLength: ATROUS_UNIFORM_BYTES,
    width,
    height,
    stepSize: clampedStep,
    sigmaColor,
    sigmaSpatial,
    inkLuminanceThreshold,
    inkProtectionStrength,
  };
}

export function computeAtrousWorkgroups(width: number, height: number): AtrousWorkgroupGrid {
  const x = Math.ceil(Math.max(1, Math.floor(width)) / ATROUS_WORKGROUP_X);
  const y = Math.ceil(Math.max(1, Math.floor(height)) / ATROUS_WORKGROUP_Y);
  return {
    x,
    y,
    z: 1,
    workgroupSize: [ATROUS_WORKGROUP_X, ATROUS_WORKGROUP_Y, 1],
    totalWorkgroups: x * y,
  };
}

export function createAtrousDenoiserPipelineDescriptor(
  shaderModule: { readonly label?: string },
  label = "toonstudio-atrous-bilateral-denoiser",
): AtrousPipelineDescriptor {
  return { label, layout: "auto", compute: { module: shaderModule, entryPoint: "main" } };
}

export function validateAtrousDenoiserWgsl(source: string = WGSL_ATROUS_BILATERAL_DENOISER): AtrousWgslValidation {
  const errors: string[] = [];
  const wgMatch = /@workgroup_size\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(source);
  const fnMatch = /@compute[\s\S]*?fn\s+([A-Za-z_]\w*)\s*\(/.exec(source);
  const bindings = [...source.matchAll(/@group\((\d+)\)\s*@binding\((\d+)\)/g)].map((m) => ({
    group: Number(m[1]),
    binding: Number(m[2]),
  }));

  if (!wgMatch) errors.push("누락된 @workgroup_size 선언");
  if (!fnMatch) errors.push("누락된 @compute 진입점");
  if (bindings.length < 3) errors.push("바인딩 3개(uniform, srcPixels, dstPixels) 필요");

  return {
    valid: errors.length === 0,
    entryPoint: fnMatch?.[1] ?? null,
    workgroupSize: wgMatch ? [Number(wgMatch[1]), Number(wgMatch[2]), Number(wgMatch[3])] : null,
    bindings,
    errors,
  };
}

function measureLumaAt(buf: Float32Array, width: number, height: number, x: number, y: number): number {
  const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
  const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
  const idx = (cy * width + cx) * 4;
  return 0.2126 * (buf[idx] ?? 0) + 0.7152 * (buf[idx + 1] ?? 0) + 0.0722 * (buf[idx + 2] ?? 0);
}

function measureQualityMetrics(
  srcF32: Float32Array,
  dstF32: Float32Array,
  width: number,
  height: number,
  inkThreshold: number,
): {
  readonly inputNoiseVariance: number;
  readonly outputNoiseVariance: number;
  readonly edgePreservationScore: number;
  readonly inkProtectedPixelCount: number;
} {
  let inVarSum = 0;
  let outVarSum = 0;
  let flatCount = 0;
  let edgeRatioSum = 0;
  let edgeCount = 0;
  let inkProtectedPixelCount = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const cIn = measureLumaAt(srcF32, width, height, x, y);
      if (cIn <= inkThreshold) inkProtectedPixelCount += 1;

      const lIn = measureLumaAt(srcF32, width, height, x - 1, y);
      const rIn = measureLumaAt(srcF32, width, height, x + 1, y);
      const tIn = measureLumaAt(srcF32, width, height, x, y - 1);
      const bIn = measureLumaAt(srcF32, width, height, x, y + 1);
      const gradIn = Math.hypot(rIn - lIn, bIn - tIn);

      const cOut = measureLumaAt(dstF32, width, height, x, y);
      const lOut = measureLumaAt(dstF32, width, height, x - 1, y);
      const rOut = measureLumaAt(dstF32, width, height, x + 1, y);
      const tOut = measureLumaAt(dstF32, width, height, x, y - 1);
      const bOut = measureLumaAt(dstF32, width, height, x, y + 1);
      const gradOut = Math.hypot(rOut - lOut, bOut - tOut);

      if (gradIn >= 0.45) {
        edgeRatioSum += clampNumber(gradOut / Math.max(gradIn, 1e-5), 0, 1);
        edgeCount += 1;
      } else {
        const lapIn = cIn - 0.25 * (lIn + rIn + tIn + bIn);
        const lapOut = cOut - 0.25 * (lOut + rOut + tOut + bOut);
        inVarSum += lapIn * lapIn;
        outVarSum += lapOut * lapOut;
        flatCount += 1;
      }
    }
  }

  return {
    inputNoiseVariance: flatCount > 0 ? inVarSum / flatCount : 0,
    outputNoiseVariance: flatCount > 0 ? outVarSum / flatCount : 0,
    edgePreservationScore: edgeCount > 0 ? edgeRatioSum / edgeCount : 1,
    inkProtectedPixelCount,
  };
}

/**
 * `WGSL_ATROUS_BILATERAL_DENOISER`와 동일한 수식으로 다중 패스 À-Trous 에지 보존 디노이징을 CPU에서 수행한다.
 */
export function denoiseRgbaAtrousCpu(
  srcRgba: Uint8ClampedArray | Uint8Array,
  config: AtrousDenoiserConfig,
): AtrousDenoiseCpuResult {
  const width = Math.max(1, Math.floor(config.width));
  const height = Math.max(1, Math.floor(config.height));
  const passes = clampNumber(Math.floor(config.passes ?? 3), 1, 5);
  const expected = width * height * 4;
  if (srcRgba.length < expected) {
    throw new RangeError(`디노이저 입력 버퍼 크기 부족: 필요 ${expected}, 실제 ${srcRgba.length}`);
  }

  const baseUniforms = packAtrousDenoiserUniforms(config, 1);
  const invTwoSigmaColorSq = 1 / Math.max(2 * baseUniforms.sigmaColor * baseUniforms.sigmaColor, 1e-5);
  const invTwoSigmaSpatialSq = 1 / Math.max(2 * baseUniforms.sigmaSpatial * baseUniforms.sigmaSpatial, 1e-5);
  const inkThresh = baseUniforms.inkLuminanceThreshold;
  const inkCrossWeight = Math.max(0, 1 - baseUniforms.inkProtectionStrength);

  const initialF32 = new Float32Array(expected);
  for (let i = 0; i < expected; i += 1) initialF32[i] = (srcRgba[i] ?? 0) / 255;

  let readBuf = new Float32Array(initialF32);
  let writeBuf = new Float32Array(expected);

  for (let pass = 0; pass < passes; pass += 1) {
    const step = 1 << pass;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const cIdx = (y * width + x) * 4;
        const cr = readBuf[cIdx] ?? 0;
        const cg = readBuf[cIdx + 1] ?? 0;
        const cb = readBuf[cIdx + 2] ?? 0;
        const ca = readBuf[cIdx + 3] ?? 1;
        const cIsInk = 0.2126 * cr + 0.7152 * cg + 0.0722 * cb <= inkThresh;

        let accR = 0;
        let accG = 0;
        let accB = 0;
        let wSum = 0;

        for (let dy = -2; dy <= 2; dy += 1) {
          const wy = ATROUS_B3_KERNEL[dy + 2] ?? 0;
          const sy = clampNumber(y + dy * step, 0, height - 1);
          for (let dx = -2; dx <= 2; dx += 1) {
            const wx = ATROUS_B3_KERNEL[dx + 2] ?? 0;
            const sx = clampNumber(x + dx * step, 0, width - 1);
            const sIdx = (sy * width + sx) * 4;
            const sr = readBuf[sIdx] ?? 0;
            const sg = readBuf[sIdx + 1] ?? 0;
            const sb = readBuf[sIdx + 2] ?? 0;
            const sIsInk = 0.2126 * sr + 0.7152 * sg + 0.0722 * sb <= inkThresh;

            const dr = sr - cr;
            const dg = sg - cg;
            const db = sb - cb;
            const wColor = Math.exp(-(dr * dr + dg * dg + db * db) * invTwoSigmaColorSq);
            const wSpatial = Math.exp(-(dx * dx + dy * dy) * invTwoSigmaSpatialSq);
            const w = wx * wy * wColor * wSpatial * (cIsInk === sIsInk ? 1 : inkCrossWeight);

            accR += sr * w;
            accG += sg * w;
            accB += sb * w;
            wSum += w;
          }
        }

        if (wSum > 1e-6) {
          writeBuf[cIdx] = accR / wSum;
          writeBuf[cIdx + 1] = accG / wSum;
          writeBuf[cIdx + 2] = accB / wSum;
        } else {
          writeBuf[cIdx] = cr;
          writeBuf[cIdx + 1] = cg;
          writeBuf[cIdx + 2] = cb;
        }
        writeBuf[cIdx + 3] = ca;
      }
    }

    const swapped = readBuf;
    readBuf = writeBuf;
    writeBuf = swapped;
  }

  const outRgba = new Uint8ClampedArray(expected);
  for (let i = 0; i < expected; i += 1) outRgba[i] = Math.round(clampNumber(readBuf[i] ?? 0, 0, 1) * 255);

  const metrics = measureQualityMetrics(initialF32, readBuf, width, height, inkThresh);
  const noiseReductionRatio =
    metrics.inputNoiseVariance > 1e-9
      ? clampNumber(1 - metrics.outputNoiseVariance / metrics.inputNoiseVariance, -1, 1)
      : 0;

  return {
    backend: "cpu-fallback",
    width,
    height,
    passesExecuted: passes,
    rgba: outRgba,
    inputNoiseVariance: metrics.inputNoiseVariance,
    outputNoiseVariance: metrics.outputNoiseVariance,
    noiseReductionRatio,
    edgePreservationScore: metrics.edgePreservationScore,
    inkProtectedPixelCount: metrics.inkProtectedPixelCount,
  };
}
