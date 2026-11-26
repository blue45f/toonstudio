/**
 * WCAG 2.2 AAA 색각이상(CVD) 시뮬레이터 및 말풍선·자막 가독성 대비 히트맵 모듈.
 *
 * - Viénot(1999) / Machado(2009) LMS 원추세포 생리 모델 기반 3×3 선형 RGB 변환 행렬
 *   (`protanopia`, `deuteranopia`, `tritanopia`, `achromatopsia`, 연속 `severity 0..1`)
 * - `WGSL_WCAG_CVD_CONTRAST_HEATMAP`: `@workgroup_size(16, 16)` WebGPU 컴퓨트 셰이더
 *   (색각 시뮬레이션 패스 + WCAG 2.2 상대 휘도 대비 히트맵 패스 통합)
 * - `simulateColorVisionDeficiencyCpu`, `computeWcagContrastRatio`, `analyzeBalloonReadabilityHeatmap`:
 *   GPU와 동일한 IEC 61966-2-1 sRGB↔선형 변환 및 AA(4.5:1)/AAA(7.0:1) 실패 영역 검출·안전 외곽선 자동 보정 힌트
 */

export const WCAG_HEATMAP_WORKGROUP_X = 16 as const;
export const WCAG_HEATMAP_WORKGROUP_Y = 16 as const;
export const WCAG_HEATMAP_UNIFORM_BYTES = 96 as const;

export const WCAG_CONTRAST_THRESHOLDS = {
  AA_LARGE: 3.0,
  AA_NORMAL: 4.5,
  AAA_LARGE: 4.5,
  AAA_NORMAL: 7.0,
} as const;

export type ColorVisionDeficiencyMode =
  | "normal"
  | "protanopia"
  | "deuteranopia"
  | "tritanopia"
  | "achromatopsia";

export type WcagConformanceLevel = "aaa" | "aa" | "aa-large" | "fail";
export type Rgb8Tuple = readonly [number, number, number];
export type Matrix3x3 = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export interface CvdSimulationOptions {
  readonly mode: ColorVisionDeficiencyMode;
  readonly severity?: number;
}

export interface CvdSimulationCpuResult {
  readonly backend: "cpu-fallback";
  readonly mode: ColorVisionDeficiencyMode;
  readonly severity: number;
  readonly width: number;
  readonly height: number;
  readonly matrix: Matrix3x3;
  readonly rgba: Uint8ClampedArray;
  readonly meanChromaticShift: number;
  readonly maxChromaticShift: number;
}

export interface BalloonReadabilityRegion {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly textRgb: Rgb8Tuple;
  readonly isLargeText?: boolean;
  readonly simulatedCvdMode?: ColorVisionDeficiencyMode;
  readonly simulatedCvdSeverity?: number;
}

export interface SafeStrokeRemediationHint {
  readonly needed: boolean;
  readonly outlineRgb: Rgb8Tuple;
  readonly outlineWidthPx: number;
  readonly outlineContrastAgainstText: number;
  readonly outlineContrastAgainstWorstBg: number;
  readonly recommendedTextRgb: Rgb8Tuple;
  readonly recommendedTextContrast: number;
  readonly reason: string;
}

export interface BalloonRegionContrastReport {
  readonly id: string;
  readonly evaluatedCvdMode: ColorVisionDeficiencyMode;
  readonly isLargeText: boolean;
  readonly aaThreshold: number;
  readonly aaaThreshold: number;
  readonly sampledPixelCount: number;
  readonly minContrastRatio: number;
  readonly medianContrastRatio: number;
  readonly p10ContrastRatio: number;
  readonly maxContrastRatio: number;
  readonly aaPassRatio: number;
  readonly aaaPassRatio: number;
  readonly failingAaPixelCount: number;
  readonly failingAaaPixelCount: number;
  readonly conformance: WcagConformanceLevel;
  readonly remediation: SafeStrokeRemediationHint;
}

export interface BalloonReadabilityHeatmapResult {
  readonly backend: "cpu-fallback";
  readonly width: number;
  readonly height: number;
  readonly heatmapRgba: Uint8ClampedArray;
  readonly regions: readonly BalloonRegionContrastReport[];
  readonly totalAaFailingRegions: number;
  readonly totalAaaFailingRegions: number;
  readonly overallConformance: WcagConformanceLevel;
}

export interface PackedWcagHeatmapUniforms {
  readonly buffer: ArrayBuffer;
  readonly u32View: Uint32Array;
  readonly f32View: Float32Array;
  readonly byteLength: typeof WCAG_HEATMAP_UNIFORM_BYTES;
  readonly width: number;
  readonly height: number;
  readonly modeFlag: 0 | 1;
  readonly matrix: Matrix3x3;
  readonly foregroundRgb: Rgb8Tuple;
  readonly aaThreshold: number;
  readonly aaaThreshold: number;
}

export interface WcagWgslValidation {
  readonly valid: boolean;
  readonly entryPoint: string | null;
  readonly workgroupSize: readonly [number, number, number] | null;
  readonly bindings: readonly { readonly group: number; readonly binding: number }[];
  readonly errors: readonly string[];
}

export interface WcagPipelineDescriptor {
  readonly label: string;
  readonly layout: "auto";
  readonly compute: {
    readonly module: { readonly label?: string };
    readonly entryPoint: "main";
  };
}

/**
 * Hunt-Pointer-Estevez D65 정규화 선형 RGB → LMS 원추세포 응답 변환 행렬(행 합 = 1.0).
 */
export const LINEAR_RGB_TO_LMS_MATRIX: Matrix3x3 = [
  0.3139902, 0.6395129, 0.0464969,
  0.1553724, 0.7578945, 0.0867331,
  0.0177524, 0.1094421, 0.8728055,
] as const;

/**
 * D65 정규화 LMS → 선형 RGB 역변환 행렬.
 */
export const LMS_TO_LINEAR_RGB_MATRIX: Matrix3x3 = [
  5.4722121, -4.6419601, 0.1697480,
  -1.1252419, 2.2931709, -0.1679290,
  0.0298017, -0.1931807, 1.1633790,
] as const;

// Machado et al. (2009) / Viénot (1999) 선형 RGB 색각이상 행렬(severity = 1.0, 백색·무채색 불변 행 합 1.000000)
const FULL_CVD_MATRICES: Record<ColorVisionDeficiencyMode, Matrix3x3> = {
  normal: [
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
  ],
  protanopia: [
    0.152286, 1.052583, -0.204869,
    0.114503, 0.786281, 0.099216,
    -0.003882, -0.048116, 1.051998,
  ],
  deuteranopia: [
    0.367322, 0.860646, -0.227968,
    0.280085, 0.672501, 0.047414,
    -0.011820, 0.042940, 0.968880,
  ],
  tritanopia: [
    1.255528, -0.076749, -0.178779,
    -0.078411, 0.930809, 0.147602,
    0.004733, 0.691367, 0.303900,
  ],
  achromatopsia: [
    0.2126, 0.7152, 0.0722,
    0.2126, 0.7152, 0.0722,
    0.2126, 0.7152, 0.0722,
  ],
};

/**
 * WebGPU `@workgroup_size(16, 16)` 색각이상 시뮬레이션 + WCAG 2.2 대비 히트맵 컴퓨트 셰이더.
 * - `modeFlag == 0u`: Viénot/Machado 선형 RGB 행렬 기반 실시간 색각이상 시뮬레이션
 * - `modeFlag == 1u`: 전경색 대비 WCAG 2.2 상대 휘도 대비비 계산 및 AA/AAA 실패 히트맵 출력
 */
export const WGSL_WCAG_CVD_CONTRAST_HEATMAP = /* wgsl */ `
struct WcagUniforms {
  width: u32,
  height: u32,
  modeFlag: u32,
  _pad0: u32,
  matRow0: vec4<f32>,
  matRow1: vec4<f32>,
  matRow2: vec4<f32>,
  fgAndAa: vec4<f32>,
  aaaAndPad: vec4<f32>,
};

@group(0) @binding(0) var<uniform> params: WcagUniforms;
@group(0) @binding(1) var<storage, read> srcPixels: array<u32>;
@group(0) @binding(2) var<storage, read_write> dstPixels: array<u32>;

fn srgbToLinear(c: f32) -> f32 {
  if (c <= 0.04045) {
    return c / 12.92;
  }
  return pow((c + 0.055) / 1.055, 2.4);
}

fn linearToSrgb(c: f32) -> f32 {
  let clamped = clamp(c, 0.0, 1.0);
  if (clamped <= 0.0031308) {
    return clamped * 12.92;
  }
  return 1.055 * pow(clamped, 1.0 / 2.4) - 0.055;
}

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

fn applyCvdMatrixLinear(linRgb: vec3<f32>) -> vec3<f32> {
  return clamp(vec3<f32>(
    dot(params.matRow0.xyz, linRgb),
    dot(params.matRow1.xyz, linRgb),
    dot(params.matRow2.xyz, linRgb)
  ), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn relativeLuminance(linRgb: vec3<f32>) -> f32 {
  return dot(linRgb, vec3<f32>(0.2126, 0.7152, 0.0722));
}

@compute @workgroup_size(16, 16, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }
  let idx = gid.y * params.width + gid.x;
  let px = unpackRgba8(srcPixels[idx]);
  let lin = vec3<f32>(srgbToLinear(px.r), srgbToLinear(px.g), srgbToLinear(px.b));
  let simLin = applyCvdMatrixLinear(lin);

  if (params.modeFlag == 0u) {
    let outSrgb = vec3<f32>(linearToSrgb(simLin.r), linearToSrgb(simLin.g), linearToSrgb(simLin.b));
    dstPixels[idx] = packRgba8(vec4<f32>(outSrgb, px.a));
    return;
  }

  let fgLinRaw = vec3<f32>(
    srgbToLinear(params.fgAndAa.r),
    srgbToLinear(params.fgAndAa.g),
    srgbToLinear(params.fgAndAa.b)
  );
  let fgSimLin = applyCvdMatrixLinear(fgLinRaw);
  let lBg = relativeLuminance(simLin);
  let lFg = relativeLuminance(fgSimLin);
  let ratio = (max(lBg, lFg) + 0.05) / (min(lBg, lFg) + 0.05);

  let aaThresh = params.fgAndAa.w;
  let aaaThresh = params.aaaAndPad.x;
  var heat = vec4<f32>(0.12, 0.64, 0.42, 0.72);
  if (ratio < aaThresh) {
    heat = vec4<f32>(0.86, 0.16, 0.20, 0.90);
  } else if (ratio < aaaThresh) {
    heat = vec4<f32>(0.92, 0.64, 0.12, 0.82);
  }
  dstPixels[idx] = packRgba8(heat);
}
`;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * IEC 61966-2-1 / WCAG 2.2 표준 sRGB 채널(`0..1`)을 선형 광도(`0..1`)로 변환한다.
 */
export function srgbChannelToLinear(channel01: number): number {
  const c = clamp01(channel01);
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * 선형 광도(`0..1`)를 sRGB 채널(`0..1`)로 역변환한다.
 */
export function linearChannelToSrgb(linear01: number): number {
  const c = clamp01(linear01);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/**
 * 선형 RGB 삼원색을 D65 정규화 LMS 원추세포 응답으로 사영한다.
 */
export function linearRgbToLms(rgb: readonly [number, number, number]): readonly [number, number, number] {
  const [r, g, b] = rgb;
  const m = LINEAR_RGB_TO_LMS_MATRIX;
  return [
    m[0] * r + m[1] * g + m[2] * b,
    m[3] * r + m[4] * g + m[5] * b,
    m[6] * r + m[7] * g + m[8] * b,
  ];
}

/**
 * D65 정규화 LMS 원추세포 응답을 선형 RGB로 복원한다.
 */
export function lmsToLinearRgb(lms: readonly [number, number, number]): readonly [number, number, number] {
  const [l, mVal, s] = lms;
  const inv = LMS_TO_LINEAR_RGB_MATRIX;
  return [
    clamp01(inv[0] * l + inv[1] * mVal + inv[2] * s),
    clamp01(inv[3] * l + inv[4] * mVal + inv[5] * s),
    clamp01(inv[6] * l + inv[7] * mVal + inv[8] * s),
  ];
}

/**
 * 지정한 색각이상 모드와 강도(`0..1`)에 해당하는 3×3 선형 RGB 변환 행렬을 반환한다.
 * 강도 보간 후에도 모든 행의 합이 `1.0`으로 보존되어 백색·회색이 색편향 없이 유지된다.
 */
export function getCvdSimulationMatrix(mode: ColorVisionDeficiencyMode, severity = 1.0): Matrix3x3 {
  const s = clamp01(severity);
  if (mode === "normal" || s <= 0) return FULL_CVD_MATRICES.normal;
  const full = FULL_CVD_MATRICES[mode];
  if (s >= 1) return full;
  const inv = 1 - s;
  return [
    inv + s * full[0], s * full[1], s * full[2],
    s * full[3], inv + s * full[4], s * full[5],
    s * full[6], s * full[7], inv + s * full[8],
  ];
}

/**
 * 단일 sRGB8 색상에 색각이상 변환 행렬을 적용한다.
 */
export function simulateRgbColorVision(
  rgb: Rgb8Tuple,
  mode: ColorVisionDeficiencyMode,
  severity = 1.0,
): Rgb8Tuple {
  if (mode === "normal" || severity <= 0) return [rgb[0], rgb[1], rgb[2]];
  const m = getCvdSimulationMatrix(mode, severity);
  const lr = srgbChannelToLinear(rgb[0] / 255);
  const lg = srgbChannelToLinear(rgb[1] / 255);
  const lb = srgbChannelToLinear(rgb[2] / 255);
  const sr = clamp01(m[0] * lr + m[1] * lg + m[2] * lb);
  const sg = clamp01(m[3] * lr + m[4] * lg + m[5] * lb);
  const sb = clamp01(m[6] * lr + m[7] * lg + m[8] * lb);
  return [
    Math.round(linearChannelToSrgb(sr) * 255),
    Math.round(linearChannelToSrgb(sg) * 255),
    Math.round(linearChannelToSrgb(sb) * 255),
  ];
}

/**
 * WCAG 2.2 상대 휘도(`0..1`)를 계산한다.
 */
export function computeRelativeLuminance(rgb: Rgb8Tuple): number {
  const r = srgbChannelToLinear(rgb[0] / 255);
  const g = srgbChannelToLinear(rgb[1] / 255);
  const b = srgbChannelToLinear(rgb[2] / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.2 표준 대비비(`1.0..21.0`)를 계산한다.
 * 순수 흑(`0,0,0`)과 순수 백(`255,255,255`)의 대비비는 정확히 `21.0`이다.
 */
export function computeWcagContrastRatio(foregroundRgb: Rgb8Tuple, backgroundRgb: Rgb8Tuple): number {
  const l1 = computeRelativeLuminance(foregroundRgb);
  const l2 = computeRelativeLuminance(backgroundRgb);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * RGBA8 프레임에 Viénot/Machado LMS 기반 색각이상 시뮬레이션을 결정적으로 실행한다(WGSL 동등성).
 */
export function simulateColorVisionDeficiencyCpu(
  srcRgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options: CvdSimulationOptions,
): CvdSimulationCpuResult {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const expected = w * h * 4;
  if (srcRgba.length < expected) {
    throw new RangeError(`CVD 입력 버퍼 크기 부족: 필요 ${expected}, 실제 ${srcRgba.length}`);
  }

  const severity = clamp01(options.severity ?? 1.0);
  const matrix = getCvdSimulationMatrix(options.mode, severity);
  const dst = new Uint8ClampedArray(expected);

  let shiftSum = 0;
  let maxShift = 0;
  const pixelCount = w * h;

  for (let i = 0; i < expected; i += 4) {
    const r0 = srcRgba[i] ?? 0;
    const g0 = srcRgba[i + 1] ?? 0;
    const b0 = srcRgba[i + 2] ?? 0;
    const a0 = srcRgba[i + 3] ?? 255;

    const lr = srgbChannelToLinear(r0 / 255);
    const lg = srgbChannelToLinear(g0 / 255);
    const lb = srgbChannelToLinear(b0 / 255);

    const sr = clamp01(matrix[0] * lr + matrix[1] * lg + matrix[2] * lb);
    const sg = clamp01(matrix[3] * lr + matrix[4] * lg + matrix[5] * lb);
    const sb = clamp01(matrix[6] * lr + matrix[7] * lg + matrix[8] * lb);

    const r1 = Math.round(linearChannelToSrgb(sr) * 255);
    const g1 = Math.round(linearChannelToSrgb(sg) * 255);
    const b1 = Math.round(linearChannelToSrgb(sb) * 255);

    dst[i] = r1;
    dst[i + 1] = g1;
    dst[i + 2] = b1;
    dst[i + 3] = a0;

    const dr = (r1 - r0) / 255;
    const dg = (g1 - g0) / 255;
    const db = (b1 - b0) / 255;
    const shift = Math.sqrt(dr * dr + dg * dg + db * db);
    shiftSum += shift;
    if (shift > maxShift) maxShift = shift;
  }

  return {
    backend: "cpu-fallback",
    mode: options.mode,
    severity,
    width: w,
    height: h,
    matrix,
    rgba: dst,
    meanChromaticShift: shiftSum / Math.max(1, pixelCount),
    maxChromaticShift: maxShift,
  };
}

function computeAutoRemediation(
  textRgb: Rgb8Tuple,
  worstBgRgb: Rgb8Tuple,
  minContrast: number,
  aaaThreshold: number,
  aaThreshold: number,
): SafeStrokeRemediationHint {
  const darkInk: Rgb8Tuple = [12, 14, 18];
  const lightPaper: Rgb8Tuple = [252, 252, 250];

  const darkVsText = computeWcagContrastRatio(darkInk, textRgb);
  const lightVsText = computeWcagContrastRatio(lightPaper, textRgb);
  const darkVsBg = computeWcagContrastRatio(darkInk, worstBgRgb);
  const lightVsBg = computeWcagContrastRatio(lightPaper, worstBgRgb);

  // 글자와 최악 배경 양쪽에서 최소 대비를 최대화하는 외곽선(할로/스트로크) 색을 선택한다.
  const darkScore = Math.min(darkVsText, darkVsBg);
  const lightScore = Math.min(lightVsText, lightVsBg);
  const preferLightOutline = lightScore >= darkScore;
  const outlineRgb = preferLightOutline ? lightPaper : darkInk;
  const outlineContrastAgainstText = preferLightOutline ? lightVsText : darkVsText;
  const outlineContrastAgainstWorstBg = preferLightOutline ? lightVsBg : darkVsBg;

  // 배경 대비 AAA를 달성하는 대체 텍스트 색 후보 평가
  const recommendedTextRgb = darkVsBg >= lightVsBg ? darkInk : lightPaper;
  const recommendedTextContrast = Math.max(darkVsBg, lightVsBg);

  const needed = minContrast < aaaThreshold;
  let outlineWidthPx = 0;
  let reason = "WCAG 2.2 AAA 가독성 기준을 충족합니다.";

  if (minContrast < aaThreshold) {
    outlineWidthPx = 2.5;
    reason = preferLightOutline
      ? "AA 기준(4.5:1) 미달 영역이 검출되었습니다. 2.5px 밝은 외곽선(Halo)을 적용하거나 텍스트 대비를 높이세요."
      : "AA 기준(4.5:1) 미달 영역이 검출되었습니다. 2.5px 어두운 외곽선(Stroke)을 적용하거나 텍스트 대비를 높이세요.";
  } else if (minContrast < aaaThreshold) {
    outlineWidthPx = 1.5;
    reason = "AA는 충족하지만 AAA(7.0:1) 기준에 못 미칩니다. 1.5px 외곽선 보강으로 모든 색각 환경에서 선명도를 확보하세요.";
  }

  return {
    needed,
    outlineRgb,
    outlineWidthPx,
    outlineContrastAgainstText: Math.round(outlineContrastAgainstText * 100) / 100,
    outlineContrastAgainstWorstBg: Math.round(outlineContrastAgainstWorstBg * 100) / 100,
    recommendedTextRgb,
    recommendedTextContrast: Math.round(recommendedTextContrast * 100) / 100,
    reason,
  };
}

function classifyWcagConformance(
  contrastRatio: number,
  isLargeText: boolean,
): WcagConformanceLevel {
  const aaa = isLargeText ? WCAG_CONTRAST_THRESHOLDS.AAA_LARGE : WCAG_CONTRAST_THRESHOLDS.AAA_NORMAL;
  const aa = isLargeText ? WCAG_CONTRAST_THRESHOLDS.AA_LARGE : WCAG_CONTRAST_THRESHOLDS.AA_NORMAL;
  if (contrastRatio >= aaa) return "aaa";
  if (contrastRatio >= aa) return "aa";
  if (!isLargeText && contrastRatio >= WCAG_CONTRAST_THRESHOLDS.AA_LARGE) return "aa-large";
  return "fail";
}

/**
 * 말풍선·자막 영역의 배경 픽셀과 텍스트 색상 간 WCAG 2.2 대비비를 전수 검사하여
 * AA/AAA 미달 구간을 강조하는 RGBA 히트맵과 자동 외곽선 보정 힌트를 생성한다.
 */
export function analyzeBalloonReadabilityHeatmap(
  canvasRgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  regions: readonly BalloonReadabilityRegion[],
  defaultCvdMode: ColorVisionDeficiencyMode = "normal",
): BalloonReadabilityHeatmapResult {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const expected = w * h * 4;
  if (canvasRgba.length < expected) {
    throw new RangeError(`히트맵 입력 버퍼 크기 부족: 필요 ${expected}, 실제 ${canvasRgba.length}`);
  }

  const heatmapRgba = new Uint8ClampedArray(expected);
  const reports: BalloonRegionContrastReport[] = [];
  let totalAaFailingRegions = 0;
  let totalAaaFailingRegions = 0;
  let worstRank = 3; // 3=aaa, 2=aa, 1=aa-large, 0=fail

  const rankOf = (level: WcagConformanceLevel): number =>
    level === "aaa" ? 3 : level === "aa" ? 2 : level === "aa-large" ? 1 : 0;

  for (const region of regions) {
    const cvdMode = region.simulatedCvdMode ?? defaultCvdMode;
    const cvdSeverity = clamp01(region.simulatedCvdSeverity ?? 1.0);
    const isLarge = region.isLargeText ?? false;
    const aaThresh = isLarge ? WCAG_CONTRAST_THRESHOLDS.AA_LARGE : WCAG_CONTRAST_THRESHOLDS.AA_NORMAL;
    const aaaThresh = isLarge ? WCAG_CONTRAST_THRESHOLDS.AAA_LARGE : WCAG_CONTRAST_THRESHOLDS.AAA_NORMAL;

    const effectiveTextRgb = simulateRgbColorVision(region.textRgb, cvdMode, cvdSeverity);

    const x0 = Math.max(0, Math.floor(region.x));
    const y0 = Math.max(0, Math.floor(region.y));
    const x1 = Math.min(w, Math.ceil(region.x + region.width));
    const y1 = Math.min(h, Math.ceil(region.y + region.height));

    const ratios: number[] = [];
    let minRatio = Number.POSITIVE_INFINITY;
    let maxRatio = 0;
    let worstBgRgb: Rgb8Tuple = [255, 255, 255];
    let failingAaCount = 0;
    let failingAaaCount = 0;

    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const idx = (y * w + x) * 4;
        const rawBg: Rgb8Tuple = [
          canvasRgba[idx] ?? 0,
          canvasRgba[idx + 1] ?? 0,
          canvasRgba[idx + 2] ?? 0,
        ];
        const effectiveBg = simulateRgbColorVision(rawBg, cvdMode, cvdSeverity);
        const ratio = computeWcagContrastRatio(effectiveTextRgb, effectiveBg);
        ratios.push(ratio);

        if (ratio < minRatio) {
          minRatio = ratio;
          worstBgRgb = effectiveBg;
        }
        if (ratio > maxRatio) maxRatio = ratio;

        if (ratio < aaThresh) {
          failingAaCount += 1;
          failingAaaCount += 1;
          // 크림슨 레드: AA 미달 위험
          heatmapRgba[idx] = 220;
          heatmapRgba[idx + 1] = 42;
          heatmapRgba[idx + 2] = 52;
          heatmapRgba[idx + 3] = 230;
        } else if (ratio < aaaThresh) {
          failingAaaCount += 1;
          // 앰버: AA 통과 / AAA 미달 주의
          heatmapRgba[idx] = 235;
          heatmapRgba[idx + 1] = 164;
          heatmapRgba[idx + 2] = 32;
          heatmapRgba[idx + 3] = 210;
        } else {
          // 에메랄드: AAA 안전
          heatmapRgba[idx] = 30;
          heatmapRgba[idx + 1] = 164;
          heatmapRgba[idx + 2] = 108;
          heatmapRgba[idx + 3] = 184;
        }
      }
    }

    const sampledPixelCount = ratios.length;
    if (sampledPixelCount === 0) {
      minRatio = 1;
      maxRatio = 1;
    }

    const sorted = [...ratios].sort((a, b) => a - b);
    const medianRatio = sorted.length > 0 ? (sorted[Math.floor(sorted.length * 0.5)] ?? 1) : 1;
    const p10Ratio = sorted.length > 0 ? (sorted[Math.floor(sorted.length * 0.1)] ?? 1) : 1;
    const aaPassRatio = sampledPixelCount > 0 ? (sampledPixelCount - failingAaCount) / sampledPixelCount : 0;
    const aaaPassRatio = sampledPixelCount > 0 ? (sampledPixelCount - failingAaaCount) / sampledPixelCount : 0;
    const conformance = classifyWcagConformance(minRatio, isLarge);

    if (failingAaCount > 0) totalAaFailingRegions += 1;
    if (failingAaaCount > 0) totalAaaFailingRegions += 1;
    worstRank = Math.min(worstRank, rankOf(conformance));

    const remediation = computeAutoRemediation(effectiveTextRgb, worstBgRgb, minRatio, aaaThresh, aaThresh);

    reports.push({
      id: region.id,
      evaluatedCvdMode: cvdMode,
      isLargeText: isLarge,
      aaThreshold: aaThresh,
      aaaThreshold: aaaThresh,
      sampledPixelCount,
      minContrastRatio: Math.round(minRatio * 100) / 100,
      medianContrastRatio: Math.round(medianRatio * 100) / 100,
      p10ContrastRatio: Math.round(p10Ratio * 100) / 100,
      maxContrastRatio: Math.round(maxRatio * 100) / 100,
      aaPassRatio: Math.round(aaPassRatio * 1000) / 1000,
      aaaPassRatio: Math.round(aaaPassRatio * 1000) / 1000,
      failingAaPixelCount: failingAaCount,
      failingAaaPixelCount: failingAaaCount,
      conformance,
      remediation,
    });
  }

  const overallConformance: WcagConformanceLevel =
    worstRank === 3 ? "aaa" : worstRank === 2 ? "aa" : worstRank === 1 ? "aa-large" : "fail";

  return {
    backend: "cpu-fallback",
    width: w,
    height: h,
    heatmapRgba,
    regions: reports,
    totalAaFailingRegions,
    totalAaaFailingRegions,
    overallConformance,
  };
}

export function packWcagHeatmapUniforms(options: {
  readonly width: number;
  readonly height: number;
  readonly modeFlag: 0 | 1;
  readonly cvdMode: ColorVisionDeficiencyMode;
  readonly severity?: number;
  readonly foregroundRgb?: Rgb8Tuple;
  readonly aaThreshold?: number;
  readonly aaaThreshold?: number;
}): PackedWcagHeatmapUniforms {
  const width = Math.max(1, Math.floor(options.width));
  const height = Math.max(1, Math.floor(options.height));
  const matrix = getCvdSimulationMatrix(options.cvdMode, options.severity ?? 1.0);
  const foregroundRgb: Rgb8Tuple = options.foregroundRgb ?? [18, 18, 22];
  const aaThreshold = options.aaThreshold ?? WCAG_CONTRAST_THRESHOLDS.AA_NORMAL;
  const aaaThreshold = options.aaaThreshold ?? WCAG_CONTRAST_THRESHOLDS.AAA_NORMAL;

  const buffer = new ArrayBuffer(WCAG_HEATMAP_UNIFORM_BYTES);
  const u32View = new Uint32Array(buffer);
  const f32View = new Float32Array(buffer);

  u32View[0] = width;
  u32View[1] = height;
  u32View[2] = options.modeFlag;
  u32View[3] = 0;

  f32View[4] = matrix[0];
  f32View[5] = matrix[1];
  f32View[6] = matrix[2];
  f32View[7] = 0;

  f32View[8] = matrix[3];
  f32View[9] = matrix[4];
  f32View[10] = matrix[5];
  f32View[11] = 0;

  f32View[12] = matrix[6];
  f32View[13] = matrix[7];
  f32View[14] = matrix[8];
  f32View[15] = 0;

  f32View[16] = foregroundRgb[0] / 255;
  f32View[17] = foregroundRgb[1] / 255;
  f32View[18] = foregroundRgb[2] / 255;
  f32View[19] = aaThreshold;

  f32View[20] = aaaThreshold;
  f32View[21] = 0;
  f32View[22] = 0;
  f32View[23] = 0;

  return {
    buffer,
    u32View,
    f32View,
    byteLength: WCAG_HEATMAP_UNIFORM_BYTES,
    width,
    height,
    modeFlag: options.modeFlag,
    matrix,
    foregroundRgb,
    aaThreshold,
    aaaThreshold,
  };
}

export function createWcagHeatmapPipelineDescriptor(
  shaderModule: { readonly label?: string },
  label = "toonstudio-wcag-cvd-contrast-heatmap",
): WcagPipelineDescriptor {
  return {
    label,
    layout: "auto",
    compute: { module: shaderModule, entryPoint: "main" },
  };
}

export function validateWcagHeatmapWgsl(source: string = WGSL_WCAG_CVD_CONTRAST_HEATMAP): WcagWgslValidation {
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
