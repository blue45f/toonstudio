/**
 * Wave 101 — 대역제한(Band-Limited) 해석적 안티모아레 스크린톤 합성기 & WebGPU WGSL 셰이더.
 *
 * - 6종 스크린톤(원형 망점, 마름모 망점, 사선 해칭, 크로스해칭, 블루노이즈 모래톤, 방사형 집중선)을
 *   정확한 면적 보존 해석적 SDF로 합성한다.
 * - cyclesPerPixel이 나이퀴스트 장벽(0.25 -> 0.50 cyc/px)에 접근할수록 bandLimitAlpha로
 *   블루노이즈 미세 디더 및 연속 지각 명도(1 - effectiveDensity)로 전환해 모아레를 제거한다.
 * - WebGPU 120fps 뷰포트 줌을 위한 화면 공간 편미분(fwidth/dpdx/dpdy) WGSL 셰이더를 생성·검증한다.
 */

import {
  BAND_LIMIT_END_CYC_PER_PX,
  BAND_LIMIT_START_CYC_PER_PX,
  clampNumber,
  normalizeScreentoneSpec,
  smoothstep,
  type NormalizedScreentoneSpec,
  type ScreentonePatternKind,
  type ScreentonePatternSpec,
} from "./nyquist-moire-frequency-analyzer";
import {
  computeMoireBeatMetrics,
  getDeterministicBlueNoiseMatrix,
  sampleBlueNoiseAt,
} from "./blue-noise-and-beat-metrics";

export { getDeterministicBlueNoiseMatrix };

export type ScreentoneSynthesisMode = "anti-moire" | "naive-point-sampled";

export interface ScreentoneSynthesisOptions {
  readonly width?: number;
  readonly height?: number;
  readonly cyclesPerPixel?: number;
  readonly sourceWidthPx?: number;
  readonly targetWidthPx?: number;
  readonly mode?: ScreentoneSynthesisMode;
}

export interface ScreentoneSynthesizedTile {
  readonly width: number;
  readonly height: number;
  readonly normalizedSpec: NormalizedScreentoneSpec;
  readonly cyclesPerPixel: number;
  readonly bandLimitAlpha: number;
  readonly mode: ScreentoneSynthesisMode;
  readonly luminanceBuffer: Float32Array;
  readonly inkCoverageBuffer: Float32Array;
  readonly targetDensity: number;
  readonly targetLuminance: number;
  readonly measuredDensity: number;
  readonly measuredLuminance: number;
  readonly luminanceDrift: number;
  readonly pixelVariance: number;
  readonly lowFreqBeatVariance: number;
  readonly rowColBeatVariance: number;
  readonly beatVariance: number;
  readonly moireEnergyRatio: number;
  readonly nonFinitePixelCount: number;
}

export interface AntiMoireComparisonOptions {
  readonly tileSize?: number;
  readonly cyclesPerPixel?: number;
  readonly sourceWidthPx?: number;
  readonly targetWidthPx?: number;
}

export interface AntiMoireComparisonResult {
  readonly spec: NormalizedScreentoneSpec;
  readonly cyclesPerPixel: number;
  readonly tileSize: number;
  readonly naiveTile: ScreentoneSynthesizedTile;
  readonly antiMoireTile: ScreentoneSynthesizedTile;
  readonly naiveBeatVariance: number;
  readonly antiMoireBeatVariance: number;
  readonly beatVarianceReductionRatio: number;
  readonly beatVarianceReductionPercent: number;
  readonly naiveMoireEnergyRatio: number;
  readonly antiMoireMoireEnergyRatio: number;
  readonly naiveLuminanceDrift: number;
  readonly antiMoireLuminanceDrift: number;
  readonly toneConservationPassed: boolean;
}

export interface ScreentoneWgslBinding {
  readonly group: number;
  readonly binding: number;
  readonly name: string;
  readonly addressSpace: "uniform";
}

export interface AntiMoireWgslShaderArtifact {
  readonly patternKind: ScreentonePatternKind;
  readonly wgsl: string;
  readonly uniformBufferByteLength: number;
  readonly bindings: readonly ScreentoneWgslBinding[];
  readonly entryPoints: readonly string[];
  readonly usesScreenSpaceDerivatives: boolean;
}

export interface AntiMoireWgslValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly lineCount: number;
}

const DEG_TO_RAD = Math.PI / 180;
const INV_SQRT2 = Math.SQRT1_2;

function fract(x: number): number {
  return x - Math.floor(x);
}

/**
 * 단위 셀 [-0.5, 0.5]^2 내부에서 패턴별 면적 보존 부호 거리 함수(SDF, < 0 이면 잉크)를 계산한다.
 */
function evaluatePatternCellSdf(
  kind: ScreentonePatternKind,
  cellX: number,
  cellY: number,
  effectiveDensity: number,
  aaWidth: number,
): number {
  const d = clampNumber(effectiveDensity, 0, 1);
  const u = fract(cellX) - 0.5;
  const v = fract(cellY) - 0.5;

  if (kind === "circle-dot") {
    const curvatureTerm = 0.05 * aaWidth * aaWidth;
    if (d <= 0.5) {
      return Math.hypot(u, v) - Math.sqrt(Math.max(0, d / Math.PI - curvatureTerm));
    }
    const uShift = fract(cellX + 0.5) - 0.5;
    const vShift = fract(cellY + 0.5) - 0.5;
    return Math.sqrt(Math.max(0, (1 - d) / Math.PI - curvatureTerm)) - Math.hypot(uShift, vShift);
  }

  if (kind === "diamond-dot") {
    const curvatureTerm = 0.04 * aaWidth * aaWidth;
    if (d <= 0.5) {
      const halfDiag = Math.sqrt(Math.max(0, d * 0.5 - curvatureTerm));
      return (Math.abs(u) + Math.abs(v) - halfDiag) * INV_SQRT2;
    }
    const uShift = fract(cellX + 0.5) - 0.5;
    const vShift = fract(cellY + 0.5) - 0.5;
    const holeHalfDiag = Math.sqrt(Math.max(0, (1 - d) * 0.5 - curvatureTerm));
    return (holeHalfDiag - (Math.abs(uShift) + Math.abs(vShift))) * INV_SQRT2;
  }

  if (kind === "cross-hatch") {
    const stripeWidth = 1 - Math.sqrt(Math.max(0, 1 - d));
    return Math.min(Math.abs(u), Math.abs(v)) - stripeWidth * 0.5;
  }

  return Math.abs(u) - d * 0.5;
}

/**
 * 대역제한 해석적 안티모아레 스크린톤 타일(또는 비교용 단순 점샘플 타일)을 합성한다.
 */
export function synthesizeAntiMoireScreentoneTile(
  spec: ScreentonePatternSpec,
  options?: ScreentoneSynthesisOptions,
): ScreentoneSynthesizedTile {
  const normalizedSpec = normalizeScreentoneSpec(spec);
  const width = Math.max(8, Math.min(512, Math.round(options?.width ?? 64)));
  const height = Math.max(8, Math.min(512, Math.round(options?.height ?? 64)));
  const mode: ScreentoneSynthesisMode = options?.mode ?? "anti-moire";

  let cyclesPerPixel: number;
  if (options?.cyclesPerPixel !== undefined && Number.isFinite(options.cyclesPerPixel)) {
    cyclesPerPixel = clampNumber(options.cyclesPerPixel, 0.005, 8);
  } else {
    const srcW = Math.max(1, options?.sourceWidthPx ?? 1000);
    const dstW = Math.max(1, options?.targetWidthPx ?? 1000);
    cyclesPerPixel = clampNumber(
      (normalizedSpec.lpi / normalizedSpec.sourceDpi) * (srcW / dstW),
      0.005,
      8,
    );
  }

  const effDensity = normalizedSpec.effectiveDensity;
  const targetLuminance = 1 - effDensity;
  const bandLimitAlpha =
    mode === "naive-point-sampled"
      ? 0
      : smoothstep(BAND_LIMIT_START_CYC_PER_PX, BAND_LIMIT_END_CYC_PER_PX, cyclesPerPixel);

  const theta = normalizedSpec.angleDeg * DEG_TO_RAD;
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);

  const totalPixels = width * height;
  const luminanceBuffer = new Float32Array(totalPixels);
  const inkCoverageBuffer = new Float32Array(totalPixels);

  const halfW = width * 0.5;
  const halfH = height * 0.5;
  const radialCx = normalizedSpec.radialCenterX * width;
  const radialCy = normalizedSpec.radialCenterY * height;
  const spokeCount = Math.max(
    8,
    Math.min(96, Math.round(2 * Math.PI * Math.min(width, height) * 0.35 * cyclesPerPixel)),
  );
  const anglePhaseOffset = normalizedSpec.angleDeg / 360;
  const microDitherAmp = 0.024 * (4 * effDensity * (1 - effDensity));
  const aaWidth = Math.max(cyclesPerPixel * 0.85, 0.035);

  let inkSum = 0;
  let nonFinitePixelCount = 0;

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    const py = y + 0.5 - halfH;
    for (let x = 0; x < width; x += 1) {
      const px = x + 0.5 - halfW;
      const bn = sampleBlueNoiseAt(x, y, normalizedSpec.seed);
      const zeroMeanDither = (bn - 0.5) * microDitherAmp;

      let ink: number;
      if (effDensity <= 0) {
        ink = 0;
      } else if (effDensity >= 1) {
        ink = 1;
      } else if (normalizedSpec.kind === "blue-noise-stipple") {
        if (mode === "naive-point-sampled") {
          ink = bn < effDensity ? 1 : 0;
        } else {
          const grainSoftness = 0.03 + 0.14 * bandLimitAlpha;
          const stippleInk = smoothstep(bn - grainSoftness, bn + grainSoftness, effDensity);
          ink = stippleInk * (1 - bandLimitAlpha) + (effDensity + zeroMeanDither) * bandLimitAlpha;
        }
      } else if (normalizedSpec.kind === "radial-speed-tone") {
        const dx = x + 0.5 - radialCx;
        const dy = y + 0.5 - radialCy;
        const radius = Math.hypot(dx, dy);
        const phase = fract((Math.atan2(dy, dx) / (2 * Math.PI)) * spokeCount + anglePhaseOffset) - 0.5;
        const sdf = Math.abs(phase) - effDensity * 0.5;

        if (mode === "naive-point-sampled") {
          ink = sdf < 0 ? 1 : 0;
        } else {
          const localFreq = spokeCount / Math.max(2 * Math.PI * Math.max(radius, 0.5), 1e-4);
          const localAlpha = smoothstep(
            BAND_LIMIT_START_CYC_PER_PX,
            BAND_LIMIT_END_CYC_PER_PX,
            Math.max(cyclesPerPixel, localFreq),
          );
          const localAa = Math.max(localFreq * 0.9, 0.04);
          const analyticalInk = smoothstep(localAa * 0.5, -localAa * 0.5, sdf);
          ink = analyticalInk * (1 - localAlpha) + (effDensity + zeroMeanDither) * localAlpha;
        }
      } else {
        const cellX = (px * cosT + py * sinT) * cyclesPerPixel;
        const cellY = (-px * sinT + py * cosT) * cyclesPerPixel;

        if (mode === "naive-point-sampled") {
          ink = evaluatePatternCellSdf(normalizedSpec.kind, cellX, cellY, effDensity, 0) < 0 ? 1 : 0;
        } else {
          const sdf = evaluatePatternCellSdf(normalizedSpec.kind, cellX, cellY, effDensity, aaWidth);
          const analyticalInk = smoothstep(aaWidth * 0.5, -aaWidth * 0.5, sdf);
          ink =
            analyticalInk * (1 - bandLimitAlpha) + (effDensity + zeroMeanDither) * bandLimitAlpha;
        }
      }

      const clampedInk = clampNumber(ink, 0, 1);
      const luma = 1 - clampedInk;
      if (!Number.isFinite(clampedInk) || !Number.isFinite(luma)) {
        nonFinitePixelCount += 1;
      }
      inkCoverageBuffer[rowOffset + x] = clampedInk;
      luminanceBuffer[rowOffset + x] = luma;
      inkSum += clampedInk;
    }
  }

  const measuredDensity = inkSum / totalPixels;
  const measuredLuminance = 1 - measuredDensity;
  const luminanceDrift = Math.abs(measuredLuminance - targetLuminance);
  const beatMetrics = computeMoireBeatMetrics(luminanceBuffer, width, height, measuredLuminance);

  return {
    width,
    height,
    normalizedSpec,
    cyclesPerPixel,
    bandLimitAlpha,
    mode,
    luminanceBuffer,
    inkCoverageBuffer,
    targetDensity: effDensity,
    targetLuminance,
    measuredDensity,
    measuredLuminance,
    luminanceDrift,
    pixelVariance: beatMetrics.pixelVariance,
    lowFreqBeatVariance: beatMetrics.lowFreqBeatVariance,
    rowColBeatVariance: beatMetrics.rowColBeatVariance,
    beatVariance: beatMetrics.beatVariance,
    moireEnergyRatio: beatMetrics.moireEnergyRatio,
    nonFinitePixelCount,
  };
}

/**
 * 동일 타일(기본 64x64)과 공간 주파수에서 단순 점샘플링 축소 vs Wave 101 대역제한 안티모아레 합성을
 * 직접 대조하여 맥놀이 분산 저감률과 지각 명도 보존 오차를 계측한다.
 */
export function compareNaiveVsAntiMoireDownscale(
  spec: ScreentonePatternSpec,
  options?: AntiMoireComparisonOptions,
): AntiMoireComparisonResult {
  const tileSize = Math.max(16, Math.min(256, Math.round(options?.tileSize ?? 64)));
  const commonOptions: ScreentoneSynthesisOptions = {
    width: tileSize,
    height: tileSize,
    cyclesPerPixel: options?.cyclesPerPixel,
    sourceWidthPx: options?.sourceWidthPx,
    targetWidthPx: options?.targetWidthPx,
  };

  const naiveTile = synthesizeAntiMoireScreentoneTile(spec, {
    ...commonOptions,
    mode: "naive-point-sampled",
  });
  const antiMoireTile = synthesizeAntiMoireScreentoneTile(spec, {
    ...commonOptions,
    mode: "anti-moire",
  });

  const naiveBeatVariance = naiveTile.beatVariance;
  const antiMoireBeatVariance = antiMoireTile.beatVariance;
  const beatVarianceReductionRatio =
    naiveBeatVariance > 1e-8
      ? clampNumber(1 - antiMoireBeatVariance / naiveBeatVariance, 0, 1)
      : 0;
  const beatVarianceReductionPercent = Math.round(beatVarianceReductionRatio * 1000) / 10;

  return {
    spec: antiMoireTile.normalizedSpec,
    cyclesPerPixel: antiMoireTile.cyclesPerPixel,
    tileSize,
    naiveTile,
    antiMoireTile,
    naiveBeatVariance,
    antiMoireBeatVariance,
    beatVarianceReductionRatio,
    beatVarianceReductionPercent,
    naiveMoireEnergyRatio: naiveTile.moireEnergyRatio,
    antiMoireMoireEnergyRatio: antiMoireTile.moireEnergyRatio,
    naiveLuminanceDrift: naiveTile.luminanceDrift,
    antiMoireLuminanceDrift: antiMoireTile.luminanceDrift,
    toneConservationPassed: antiMoireTile.luminanceDrift <= 0.025,
  };
}

function buildWgslPatternSdfExpression(patternKind: ScreentonePatternKind): string {
  switch (patternKind) {
    case "circle-dot":
      return [
        "  let u_cell = fract(cell_uv) - vec2<f32>(0.5, 0.5);",
        "  let u_shift = fract(cell_uv + vec2<f32>(0.5, 0.5)) - vec2<f32>(0.5, 0.5);",
        "  let r_dark = sqrt(max(0.0, eff_density / 3.14159265));",
        "  let r_hole = sqrt(max(0.0, (1.0 - eff_density) / 3.14159265));",
        "  let sdf = select(r_hole - length(u_shift), length(u_cell) - r_dark, eff_density <= 0.5);",
      ].join("\n");
    case "diamond-dot":
      return [
        "  let u_cell = abs(fract(cell_uv) - vec2<f32>(0.5, 0.5));",
        "  let u_shift = abs(fract(cell_uv + vec2<f32>(0.5, 0.5)) - vec2<f32>(0.5, 0.5));",
        "  let a_dark = sqrt(max(0.0, eff_density * 0.5));",
        "  let a_hole = sqrt(max(0.0, (1.0 - eff_density) * 0.5));",
        "  let sdf = select((a_hole - (u_shift.x + u_shift.y)) * 0.70710678, (u_cell.x + u_cell.y - a_dark) * 0.70710678, eff_density <= 0.5);",
      ].join("\n");
    case "line-hatch":
      return [
        "  let u_line = abs(fract(cell_uv.x) - 0.5);",
        "  let sdf = u_line - eff_density * 0.5;",
      ].join("\n");
    case "cross-hatch":
      return [
        "  let u_cross = abs(fract(cell_uv) - vec2<f32>(0.5, 0.5));",
        "  let stripe_w = 1.0 - sqrt(max(0.0, 1.0 - eff_density));",
        "  let sdf = min(u_cross.x, u_cross.y) - stripe_w * 0.5;",
      ].join("\n");
    case "blue-noise-stipple":
      return [
        "  let bn_threshold = interleaved_gradient_noise(in_v.position.xy);",
        "  let sdf = bn_threshold - eff_density;",
      ].join("\n");
    case "radial-speed-tone":
      return [
        "  let center_px = vec2<f32>(u_tone.ink_and_paper.z, u_tone.ink_and_paper.w) * u_tone.canvas_and_tile_px.xy;",
        "  let radial_vec = in_v.position.xy - center_px;",
        "  let radial_ang = atan2(radial_vec.y, radial_vec.x);",
        "  let spoke_n = max(8.0, round(6.2831853 * min(u_tone.canvas_and_tile_px.x, u_tone.canvas_and_tile_px.y) * 0.35 * cycles_per_px));",
        "  let phase = abs(fract((radial_ang / 6.2831853) * spoke_n + u_tone.tone_params.z / 6.2831853) - 0.5);",
        "  let sdf = phase - eff_density * 0.5;",
      ].join("\n");
  }
}

/**
 * 실시간 120fps 뷰포트 줌에서 모아레를 제거하는 WebGPU WGSL `fwidth`/`dpdx`/`dpdy`
 * 해석적 안티모아레 스크린톤 프래그먼트 셰이더를 생성한다.
 */
export function buildAntiMoireScreentoneWgsl(
  patternKind: ScreentonePatternKind,
): AntiMoireWgslShaderArtifact {
  const sdfBlock = buildWgslPatternSdfExpression(patternKind);
  const bindings: readonly ScreentoneWgslBinding[] = [
    { group: 0, binding: 0, name: "u_tone", addressSpace: "uniform" },
  ];

  const wgsl = `// Wave 101 Analytical Anti-Moire Screentone WGSL Shader (${patternKind})
struct ScreentoneUniforms {
  canvas_and_tile_px: vec4<f32>,
  tone_params: vec4<f32>,
  nyquist_params: vec4<f32>,
  ink_and_paper: vec4<f32>,
};

@group(0) @binding(0)
var<uniform> u_tone: ScreentoneUniforms;

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) canvas_px: vec2<f32>,
};

@vertex
fn vs_fullscreen_quad(@builtin(vertex_index) vid: u32) -> VertexOut {
  var out: VertexOut;
  let x = f32((vid << 1u) & 2u) * 2.0 - 1.0;
  let y = f32(vid & 2u) * 2.0 - 1.0;
  out.position = vec4<f32>(x, y, 0.0, 1.0);
  let uv = vec2<f32>(x * 0.5 + 0.5, 0.5 - y * 0.5);
  out.canvas_px = uv * u_tone.canvas_and_tile_px.xy + u_tone.canvas_and_tile_px.zw;
  return out;
}

fn interleaved_gradient_noise(pixel_pos: vec2<f32>) -> f32 {
  return fract(52.9829189 * fract(dot(pixel_pos, vec2<f32>(0.06711056, 0.00583715))));
}

fn apply_dot_gain(nominal_d: f32, gain_ratio: f32) -> f32 {
  let d = clamp(nominal_d, 0.0, 1.0);
  let g = clamp(gain_ratio, 0.0, 0.25);
  return clamp(d + 4.0 * g * d * (1.0 - d), 0.0, 1.0);
}

@fragment
fn fs_screentone_anti_moire(in_v: VertexOut) -> @location(0) vec4<f32> {
  let freq_per_canvas_px = u_tone.tone_params.x / max(u_tone.tone_params.y, 1.0);
  let angle_rad = u_tone.tone_params.z;
  let cos_a = cos(angle_rad);
  let sin_a = sin(angle_rad);
  let centered = in_v.canvas_px - u_tone.canvas_and_tile_px.xy * 0.5;
  let rotated = vec2<f32>(
    centered.x * cos_a + centered.y * sin_a,
    -centered.x * sin_a + centered.y * cos_a,
  );
  let cell_uv = rotated * freq_per_canvas_px;
  let d_cell_dx = dpdx(cell_uv);
  let d_cell_dy = dpdy(cell_uv);
  let fw_x = length(vec2<f32>(d_cell_dx.x, d_cell_dy.x));
  let fw_y = length(vec2<f32>(d_cell_dx.y, d_cell_dy.y));
  let cycles_per_px = max(fw_x, fw_y);
  let eff_density = apply_dot_gain(u_tone.tone_params.w, u_tone.nyquist_params.w);
${sdfBlock}
  let fw_sdf = max(fwidth(sdf), 1e-4);
  let analytical_ink = smoothstep(fw_sdf * 0.5, -fw_sdf * 0.5, sdf);
  let band_limit_alpha = smoothstep(u_tone.nyquist_params.x, u_tone.nyquist_params.y, cycles_per_px);
  let ign = interleaved_gradient_noise(in_v.position.xy);
  let micro_dither = (ign - 0.5) * 0.024 * (4.0 * eff_density * (1.0 - eff_density));
  let final_ink = clamp(mix(analytical_ink, eff_density + micro_dither, band_limit_alpha), 0.0, 1.0);
  let luma = mix(u_tone.ink_and_paper.y, u_tone.ink_and_paper.x, final_ink);
  return vec4<f32>(luma, luma, luma, 1.0);
}
`;

  return {
    patternKind,
    wgsl,
    uniformBufferByteLength: 64,
    bindings,
    entryPoints: ["vs_fullscreen_quad", "fs_screentone_anti_moire"],
    usesScreenSpaceDerivatives: true,
  };
}

/**
 * 생성된 WebGPU WGSL 안티모아레 셰이더의 구조·괄호 균형·바인딩·화면공간 미분 명령 사용 여부를 검증한다.
 */
export function validateAntiMoireWgsl(
  input: AntiMoireWgslShaderArtifact | string,
): AntiMoireWgslValidationResult {
  const wgsl = typeof input === "string" ? input : input.wgsl;
  const errors: string[] = [];
  if (!wgsl || wgsl.trim().length === 0) {
    return { valid: false, errors: ["WGSL source is empty."], lineCount: 0 };
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

  if (!/@group\(0\)\s*@binding\(0\)/.test(wgsl)) errors.push("Missing @group(0) @binding(0) uniform binding.");
  if (!/@vertex/.test(wgsl)) errors.push("Missing @vertex entry point.");
  if (!/@fragment/.test(wgsl)) errors.push("Missing @fragment entry point.");
  if (!/\bfwidth\s*\(/.test(wgsl)) errors.push("Missing fwidth() screen-space derivative call.");
  if (!/\bdpdx\s*\(/.test(wgsl) || !/\bdpdy\s*\(/.test(wgsl)) {
    errors.push("Missing dpdx()/dpdy() Jacobian footprint derivative calls.");
  }
  if (!/\bsmoothstep\s*\(/.test(wgsl)) errors.push("Missing smoothstep() band-limiting transition.");
  if (/\b(?:NaN|Infinity|undefined)\b/.test(wgsl)) errors.push("WGSL contains non-finite or undefined token.");
  if (/\b(?:gl_FragColor|dFdx|dFdy)\b/.test(wgsl)) errors.push("WGSL contains invalid GLSL keyword.");

  if (typeof input !== "string") {
    if (input.uniformBufferByteLength % 16 !== 0 || input.uniformBufferByteLength < 16) {
      errors.push("Uniform buffer byte length must be a positive multiple of 16 bytes.");
    }
    for (const ep of input.entryPoints) {
      if (!new RegExp(`fn\\s+${ep}\\s*\\(`).test(wgsl)) {
        errors.push(`Declared entry point '${ep}' not found in WGSL source.`);
      }
    }
  }

  return { valid: errors.length === 0, errors, lineCount: wgsl.split("\n").length };
}
