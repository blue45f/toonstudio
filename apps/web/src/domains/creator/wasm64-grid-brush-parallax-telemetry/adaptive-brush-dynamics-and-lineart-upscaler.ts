/**
 * 적응형 물리 브러시 다이나믹스 솔버 & 실시간 WebGPU 선화 초해상도 업스케일러(2×/4×).
 *
 * - `AdaptiveBrushDynamicsSolver`: 필압·속도·가속도·tiltX/tiltY·종이 결·캔버스 습도 및
 *   선택적 온디바이스 WebNN 잔차 커브 훅을 결합해 브리슬 퍼짐, 잉크 유량, 모세관 번짐,
 *   종이 결 마찰, 불투명도를 실시간 계산한다(Ink G-Pen · Watercolor Wet · Charcoal Dry ·
 *   Screentone Marker 4종 프리셋).
 * - `WGSL_LINEART_SUPER_RES_2X` & `upscaleLineArtCrisp2xCpu` / `upscaleLineArtCrispCpu`:
 *   방향성 에지 연속성 추정과 국소 `[min, max]` 클램프 대비 첨예화로 계단 현상과
 *   링잉 헤일로(overshoot/undershoot) 없이 저해상도 선화를 2×/4×로 선명하게 업스케일한다.
 */

export type BrushDynamicsPresetId =
  | "ink-gpen"
  | "watercolor-wet"
  | "charcoal-dry"
  | "screentone-marker";

export interface BrushDynamicsPresetSpec {
  readonly id: BrushDynamicsPresetId;
  readonly labelKo: string;
  readonly baseRadiusPx: number;
  readonly minRadiusRatio: number;
  readonly maxRadiusRatio: number;
  readonly baseBristleCount: number;
  readonly bristleSpreadSensitivity: number;
  readonly tiltSpreadGain: number;
  readonly tiltAspectGain: number;
  readonly velocityTaperStrength: number;
  readonly velocityRefPxPerSec: number;
  readonly accelLagStrength: number;
  readonly accelRefPxPerSec2: number;
  readonly baseInkFlow: number;
  readonly capillaryBleedGain: number;
  readonly paperToothDragGain: number;
  readonly baseOpacity: number;
  readonly pressureOpacityGain: number;
  readonly velocityOpacityDrop: number;
  readonly spacingRatio: number;
  readonly defaultPaperTooth: number;
  readonly defaultWetness: number;
}

export const BRUSH_DYNAMICS_PRESETS: Readonly<Record<BrushDynamicsPresetId, BrushDynamicsPresetSpec>> = {
  "ink-gpen": {
    id: "ink-gpen",
    labelKo: "잉크 G펜",
    baseRadiusPx: 4.5,
    minRadiusRatio: 0.14,
    maxRadiusRatio: 1.85,
    baseBristleCount: 6,
    bristleSpreadSensitivity: 0.28,
    tiltSpreadGain: 0.35,
    tiltAspectGain: 0.55,
    velocityTaperStrength: 0.65,
    velocityRefPxPerSec: 1200,
    accelLagStrength: 0.18,
    accelRefPxPerSec2: 6000,
    baseInkFlow: 0.94,
    capillaryBleedGain: 0.04,
    paperToothDragGain: 0.14,
    baseOpacity: 0.98,
    pressureOpacityGain: 0.22,
    velocityOpacityDrop: 0.08,
    spacingRatio: 0.18,
    defaultPaperTooth: 0.25,
    defaultWetness: 0.12,
  },
  "watercolor-wet": {
    id: "watercolor-wet",
    labelKo: "수채 번짐 붓",
    baseRadiusPx: 14.0,
    minRadiusRatio: 0.35,
    maxRadiusRatio: 1.95,
    baseBristleCount: 48,
    bristleSpreadSensitivity: 0.72,
    tiltSpreadGain: 0.68,
    tiltAspectGain: 0.85,
    velocityTaperStrength: 0.28,
    velocityRefPxPerSec: 900,
    accelLagStrength: 0.22,
    accelRefPxPerSec2: 4500,
    baseInkFlow: 0.80,
    capillaryBleedGain: 0.90,
    paperToothDragGain: 0.42,
    baseOpacity: 0.54,
    pressureOpacityGain: 0.40,
    velocityOpacityDrop: 0.24,
    spacingRatio: 0.12,
    defaultPaperTooth: 0.62,
    defaultWetness: 0.82,
  },
  "charcoal-dry": {
    id: "charcoal-dry",
    labelKo: "건식 목탄",
    baseRadiusPx: 11.0,
    minRadiusRatio: 0.30,
    maxRadiusRatio: 2.15,
    baseBristleCount: 64,
    bristleSpreadSensitivity: 0.80,
    tiltSpreadGain: 1.15,
    tiltAspectGain: 1.95,
    velocityTaperStrength: 0.20,
    velocityRefPxPerSec: 1000,
    accelLagStrength: 0.15,
    accelRefPxPerSec2: 5000,
    baseInkFlow: 0.70,
    capillaryBleedGain: 0.02,
    paperToothDragGain: 0.94,
    baseOpacity: 0.68,
    pressureOpacityGain: 0.34,
    velocityOpacityDrop: 0.30,
    spacingRatio: 0.16,
    defaultPaperTooth: 0.85,
    defaultWetness: 0.05,
  },
  "screentone-marker": {
    id: "screentone-marker",
    labelKo: "스크린톤 마커",
    baseRadiusPx: 12.0,
    minRadiusRatio: 0.55,
    maxRadiusRatio: 1.35,
    baseBristleCount: 24,
    bristleSpreadSensitivity: 0.38,
    tiltSpreadGain: 0.75,
    tiltAspectGain: 2.35,
    velocityTaperStrength: 0.14,
    velocityRefPxPerSec: 1100,
    accelLagStrength: 0.10,
    accelRefPxPerSec2: 5500,
    baseInkFlow: 0.86,
    capillaryBleedGain: 0.28,
    paperToothDragGain: 0.22,
    baseOpacity: 0.84,
    pressureOpacityGain: 0.12,
    velocityOpacityDrop: 0.10,
    spacingRatio: 0.14,
    defaultPaperTooth: 0.35,
    defaultWetness: 0.45,
  },
};

export interface BrushDynamicsSample {
  readonly x: number;
  readonly y: number;
  readonly timestampMs: number;
  readonly pressure: number;
  readonly tiltXDeg: number;
  readonly tiltYDeg: number;
  readonly twistDeg?: number;
  readonly paperToothRoughness?: number;
  readonly canvasWetness?: number;
}

export interface WebNnBrushResidualFeatures {
  readonly presetId: BrushDynamicsPresetId;
  readonly pressure: number;
  readonly normalizedVelocity: number;
  readonly normalizedAcceleration: number;
  readonly tiltMagnitude: number;
  readonly tiltAzimuthRad: number;
  readonly paperTooth: number;
  readonly canvasWetness: number;
}

export interface WebNnBrushResidualDelta {
  readonly bristleSpreadDelta?: number;
  readonly inkFlowDelta?: number;
  readonly capillaryBleedDelta?: number;
  readonly paperToothDragDelta?: number;
  readonly opacityDelta?: number;
}

export type WebNnBrushResidualHook = (
  features: WebNnBrushResidualFeatures,
) => WebNnBrushResidualDelta | null | undefined;

export interface BrushDynamicsOutput {
  readonly presetId: BrushDynamicsPresetId;
  readonly velocityPxPerSec: number;
  readonly accelerationPxPerSec2: number;
  readonly tiltMagnitude: number;
  readonly tiltAzimuthRad: number;
  readonly effectiveRadiusPx: number;
  readonly bristleSpread: number;
  readonly bristleCountActive: number;
  readonly inkFlow: number;
  readonly wetCapillaryBleed: number;
  readonly paperToothDrag: number;
  readonly opacity: number;
  readonly aspectRatio: number;
  readonly spacingFactor: number;
  readonly webnnApplied: boolean;
}

export interface AdaptiveBrushSolverOptions {
  readonly presetId?: BrushDynamicsPresetId;
  readonly velocitySmoothingAlpha?: number;
  readonly webnnResidualHook?: WebNnBrushResidualHook;
}

const MAX_WEBNN_RESIDUAL_ABS = 0.25;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function safeResidualDelta(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return clamp(value, -MAX_WEBNN_RESIDUAL_ABS, MAX_WEBNN_RESIDUAL_ABS);
}

/**
 * 스타일러스 필압·속도·가속도·기울기와 선택적 온디바이스 WebNN 잔차 훅을 결합해
 * 프리셋별 브러시 물리 응답을 산출하는 적응형 브러시 다이나믹스 엔진.
 */
export class AdaptiveBrushDynamicsSolver {
  private preset: BrushDynamicsPresetSpec;
  private readonly smoothingAlpha: number;
  private webnnHook: WebNnBrushResidualHook | null;
  private hasPrevious = false;
  private prevX = 0;
  private prevY = 0;
  private prevTimestampMs = 0;
  private smoothedVelocity = 0;
  private prevSmoothedVelocity = 0;
  private strokeDistancePx = 0;

  constructor(options: AdaptiveBrushSolverOptions = {}) {
    this.preset = BRUSH_DYNAMICS_PRESETS[options.presetId ?? "ink-gpen"];
    this.smoothingAlpha = clamp(options.velocitySmoothingAlpha ?? 0.72, 0.1, 1.0);
    this.webnnHook = options.webnnResidualHook ?? null;
  }

  setPreset(presetId: BrushDynamicsPresetId): void {
    this.preset = BRUSH_DYNAMICS_PRESETS[presetId];
    this.resetStroke();
  }

  getPreset(): BrushDynamicsPresetSpec {
    return this.preset;
  }

  setWebNnResidualHook(hook: WebNnBrushResidualHook | null): void {
    this.webnnHook = hook;
  }

  resetStroke(): void {
    this.hasPrevious = false;
    this.prevX = 0;
    this.prevY = 0;
    this.prevTimestampMs = 0;
    this.smoothedVelocity = 0;
    this.prevSmoothedVelocity = 0;
    this.strokeDistancePx = 0;
  }

  /** 단일 스타일러스 샘플의 물리 상태(브리슬·유량·번짐·종이 마찰·불투명도)를 계산한다. */
  evaluateSample(sample: BrushDynamicsSample): BrushDynamicsOutput {
    const p = this.preset;
    const pressure = clamp(Number.isFinite(sample.pressure) ? sample.pressure : 0.5, 0.01, 1.0);
    const tiltX = clamp(Number.isFinite(sample.tiltXDeg) ? sample.tiltXDeg : 0, -90, 90);
    const tiltY = clamp(Number.isFinite(sample.tiltYDeg) ? sample.tiltYDeg : 0, -90, 90);
    const tiltMagnitude = clamp(Math.hypot(tiltX, tiltY) / 90, 0, 1);
    const tiltAzimuthRad = Math.atan2(tiltY, tiltX);
    const paperTooth = clamp(sample.paperToothRoughness ?? p.defaultPaperTooth, 0, 1);
    const canvasWetness = clamp(sample.canvasWetness ?? p.defaultWetness, 0, 1);

    let velocityPxPerSec = 0;
    let accelerationPxPerSec2 = 0;
    if (this.hasPrevious) {
      const dtSec = Math.max((sample.timestampMs - this.prevTimestampMs) / 1000, 1e-4);
      const dist = Math.hypot(sample.x - this.prevX, sample.y - this.prevY);
      this.strokeDistancePx += dist;
      const instantVelocity = dist / dtSec;
      this.smoothedVelocity =
        this.prevSmoothedVelocity === 0
          ? instantVelocity
          : lerp(this.smoothedVelocity, instantVelocity, this.smoothingAlpha);
      velocityPxPerSec = this.smoothedVelocity;
      accelerationPxPerSec2 = (this.smoothedVelocity - this.prevSmoothedVelocity) / dtSec;
      this.prevSmoothedVelocity = this.smoothedVelocity;
    }

    this.hasPrevious = true;
    this.prevX = sample.x;
    this.prevY = sample.y;
    this.prevTimestampMs = sample.timestampMs;

    const vNorm = clamp(velocityPxPerSec / p.velocityRefPxPerSec, 0, 1);
    const aNorm = clamp(accelerationPxPerSec2 / p.accelRefPxPerSec2, -1, 1);
    const reservoirFactor = clamp(1 - (this.strokeDistancePx / 12000) * (1 - p.baseInkFlow * 0.5), 0.72, 1.0);

    let bristleSpread = clamp(
      0.10 +
        pressure * p.bristleSpreadSensitivity * 0.62 +
        tiltMagnitude * p.tiltSpreadGain * 0.48 -
        vNorm * 0.08,
      0.05,
      1.0,
    );
    let inkFlow = clamp(
      p.baseInkFlow *
        reservoirFactor *
        (0.46 + 0.54 * Math.pow(pressure, 0.78)) *
        (1 - Math.max(0, aNorm) * p.accelLagStrength) *
        (1 - vNorm * 0.14),
      0.05,
      1.0,
    );
    let wetCapillaryBleed = clamp(
      p.capillaryBleedGain *
        canvasWetness *
        (0.38 + 0.62 * (1 - vNorm)) *
        (0.55 + 0.45 * pressure),
      0,
      1.0,
    );
    let paperToothDrag = clamp(
      p.paperToothDragGain *
        paperTooth *
        (0.52 + 0.48 * tiltMagnitude) *
        (0.65 + 0.35 * vNorm) *
        (1 - wetCapillaryBleed * 0.35),
      0,
      1.0,
    );
    let opacity = clamp(
      p.baseOpacity -
        (1 - pressure) * p.pressureOpacityGain -
        vNorm * p.velocityOpacityDrop -
        paperToothDrag * 0.16,
      0.05,
      1.0,
    );

    let webnnApplied = false;
    if (this.webnnHook) {
      const residual = this.webnnHook({
        presetId: p.id,
        pressure,
        normalizedVelocity: vNorm,
        normalizedAcceleration: aNorm,
        tiltMagnitude,
        tiltAzimuthRad,
        paperTooth,
        canvasWetness,
      });
      if (residual) {
        webnnApplied = true;
        bristleSpread = clamp(bristleSpread + safeResidualDelta(residual.bristleSpreadDelta), 0.05, 1.0);
        inkFlow = clamp(inkFlow + safeResidualDelta(residual.inkFlowDelta), 0.05, 1.0);
        wetCapillaryBleed = clamp(wetCapillaryBleed + safeResidualDelta(residual.capillaryBleedDelta), 0, 1.0);
        paperToothDrag = clamp(paperToothDrag + safeResidualDelta(residual.paperToothDragDelta), 0, 1.0);
        opacity = clamp(opacity + safeResidualDelta(residual.opacityDelta), 0.05, 1.0);
      }
    }

    const radiusScale =
      lerp(p.minRadiusRatio, p.maxRadiusRatio, Math.pow(pressure, 0.85)) *
      (1 - vNorm * p.velocityTaperStrength * 0.65) *
      (1 + tiltMagnitude * p.tiltSpreadGain * 0.36);
    const effectiveRadiusPx = clamp(
      p.baseRadiusPx * radiusScale * (0.85 + 0.30 * bristleSpread),
      0.4,
      p.baseRadiusPx * 3.0,
    );
    const aspectRatio = 1 + tiltMagnitude * p.tiltAspectGain;
    const bristleCountActive = Math.max(1, Math.round(p.baseBristleCount * (0.35 + 0.65 * bristleSpread)));

    return {
      presetId: p.id,
      velocityPxPerSec,
      accelerationPxPerSec2,
      tiltMagnitude,
      tiltAzimuthRad,
      effectiveRadiusPx,
      bristleSpread,
      bristleCountActive,
      inkFlow,
      wetCapillaryBleed,
      paperToothDrag,
      opacity,
      aspectRatio,
      spacingFactor: p.spacingRatio,
      webnnApplied,
    };
  }

  /** 전체 스트로크 샘플 시퀀스를 순서대로 평가한다. */
  evaluateStroke(samples: readonly BrushDynamicsSample[]): readonly BrushDynamicsOutput[] {
    this.resetStroke();
    const outputs: BrushDynamicsOutput[] = [];
    for (let i = 0; i < samples.length; i += 1) {
      outputs.push(this.evaluateSample(samples[i]));
    }
    return outputs;
  }
}

/* -------------------------------------------------------------------------- */
/* 2. Real-Time WebGPU Line-Art Super-Resolution Upscaler (2x / 4x)           */
/* -------------------------------------------------------------------------- */

export interface WgslLineArtValidationResult {
  readonly valid: boolean;
  readonly hasComputeEntry: boolean;
  readonly hasWorkgroup16x16: boolean;
  readonly bindingCount: number;
  readonly balancedBraces: boolean;
  readonly hasForbiddenGlslBuiltins: boolean;
  readonly errors: readonly string[];
}

export const WGSL_LINEART_SUPER_RES_2X: string = /* wgsl */ `
struct LineArtUpscaleParams {
  src_width: u32,
  src_height: u32,
  dst_width: u32,
  dst_height: u32,
  sharpness: f32,
  diag_bias: f32,
  edge_threshold: f32,
  clamp_ringing: u32,
}

@group(0) @binding(0) var<uniform> params: LineArtUpscaleParams;
@group(0) @binding(1) var<storage, read> src_rgba: array<u32>;
@group(0) @binding(2) var<storage, read_write> dst_rgba: array<u32>;

fn unpack_rgba(packed: u32) -> vec4<f32> {
  return vec4<f32>(
    f32(packed & 255u),
    f32((packed >> 8u) & 255u),
    f32((packed >> 16u) & 255u),
    f32((packed >> 24u) & 255u),
  );
}

fn pack_rgba(v: vec4<f32>) -> u32 {
  let c = clamp(round(v), vec4<f32>(0.0), vec4<f32>(255.0));
  return u32(c.x) | (u32(c.y) << 8u) | (u32(c.z) << 16u) | (u32(c.w) << 24u);
}

fn sample_clamped(x: i32, y: i32) -> vec4<f32> {
  let cx = u32(clamp(x, 0, i32(params.src_width) - 1));
  let cy = u32(clamp(y, 0, i32(params.src_height) - 1));
  return unpack_rgba(src_rgba[cy * params.src_width + cx]);
}

fn luma_of(c: vec4<f32>) -> f32 {
  return 0.299 * c.x + 0.587 * c.y + 0.114 * c.z;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= params.dst_width || gid.y >= params.dst_height) {
    return;
  }
  let ix = i32(gid.x >> 1u);
  let iy = i32(gid.y >> 1u);
  let sx = select(-1, 1, (gid.x & 1u) == 1u);
  let sy = select(-1, 1, (gid.y & 1u) == 1u);

  let c_px = sample_clamped(ix, iy);
  let h_px = sample_clamped(ix + sx, iy);
  let v_px = sample_clamped(ix, iy + sy);
  let d_px = sample_clamped(ix + sx, iy + sy);

  let lc = luma_of(c_px);
  let lh = luma_of(h_px);
  let lv = luma_of(v_px);
  let ld = luma_of(d_px);

  let hv_diff = abs(lh - lv);
  let c_to_hv = 0.5 * (abs(lc - lh) + abs(lc - lv));
  let local_min_l = min(min(lc, lh), min(lv, ld));
  let local_max_l = max(max(lc, lh), max(lv, ld));
  let local_range = local_max_l - local_min_l;

  let edge_conf = smoothstep(params.edge_threshold, params.edge_threshold * 2.5, local_range);
  let diag_agreement = clamp((c_to_hv - hv_diff) / max(c_to_hv, 1.0), 0.0, 1.0);
  let diag_weight = diag_agreement * edge_conf * params.diag_bias;

  let bilinear = (c_px * 9.0 + h_px * 3.0 + v_px * 3.0 + d_px) * 0.0625;
  let diag_est = (h_px + v_px) * 0.5;
  let blended = mix(bilinear, diag_est, diag_weight);

  let min_v = min(min(c_px, h_px), min(v_px, d_px));
  let max_v = max(max(c_px, h_px), max(v_px, d_px));
  let mid_v = (min_v + max_v) * 0.5;
  let gain = 1.0 + params.sharpness * edge_conf;
  let sharpened = mid_v + (blended - mid_v) * gain;
  let final_v = select(sharpened, clamp(sharpened, min_v, max_v), params.clamp_ringing != 0u);

  dst_rgba[gid.y * params.dst_width + gid.x] = pack_rgba(final_v);
}
`;

/** `WGSL_LINEART_SUPER_RES_2X` 컴퓨트 셰이더의 구조·바인딩·WGSL 문법 무결성을 정적 검증한다. */
export function validateLineArtUpscalerWgslSource(
  source = WGSL_LINEART_SUPER_RES_2X,
): WgslLineArtValidationResult {
  const errors: string[] = [];
  const hasComputeEntry = /@compute[\s\S]*?fn\s+main\s*\(/.test(source);
  const hasWorkgroup16x16 = /@workgroup_size\(\s*16\s*,\s*16\s*\)/.test(source);
  const bindingCount = (source.match(/@group\(\d+\)\s*@binding\(\d+\)/g) ?? []).length;
  const hasForbiddenGlslBuiltins = /\b(hypot|lerp|float4|uint|sampler2D)\s*\(/.test(source);

  let depth = 0;
  let balancedBraces = true;
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth < 0) balancedBraces = false;
    }
  }
  if (depth !== 0) balancedBraces = false;

  if (!hasComputeEntry) errors.push("컴퓨트 엔트리 `@compute fn main`이 누락되었습니다.");
  if (!hasWorkgroup16x16) errors.push("`@workgroup_size(16, 16)` 선언이 누락되었습니다.");
  if (bindingCount < 3) errors.push("유니폼·입력·출력 스토리지 바인딩(3개)이 부족합니다.");
  if (!balancedBraces) errors.push("WGSL 중괄호 짝이 맞지 않습니다.");
  if (hasForbiddenGlslBuiltins) errors.push("WGSL 표준에 없는 GLSL 내장 함수 호출이 감지되었습니다.");

  return {
    valid: errors.length === 0,
    hasComputeEntry,
    hasWorkgroup16x16,
    bindingCount,
    balancedBraces,
    hasForbiddenGlslBuiltins,
    errors,
  };
}

export interface LineArtUpscaleInput {
  readonly width: number;
  readonly height: number;
  readonly channels: 1 | 4;
  readonly pixels: Uint8Array;
}

export type WebNnLineArtRefinerHook = (
  patch: {
    readonly outX: number;
    readonly outY: number;
    readonly blendedValue: number;
    readonly localMin: number;
    readonly localMax: number;
    readonly edgeConfidence: number;
  },
) => number;

export interface LineArtUpscaleOptions {
  readonly sharpness?: number;
  readonly diagonalBias?: number;
  readonly edgeThreshold?: number;
  readonly webnnRefinerHook?: WebNnLineArtRefinerHook;
}

export interface LineArtUpscaleResult {
  readonly width: number;
  readonly height: number;
  readonly channels: 1 | 4;
  readonly scale: 2 | 4;
  readonly pixels: Uint8Array;
  readonly edgeSharpnessGain: number;
  readonly ringingOvershootCount: number;
  readonly diagonalContinuityScore: number;
  readonly webnnRefined: boolean;
  readonly elapsedMs: number;
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const denom = edge1 - edge0;
  if (Math.abs(denom) <= 1e-8) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / denom, 0, 1);
  return t * t * (3 - 2 * t);
}

function readLuma(pixels: Uint8Array, width: number, height: number, channels: 1 | 4, x: number, y: number): number {
  const cx = clamp(x, 0, width - 1);
  const cy = clamp(y, 0, height - 1);
  const idx = (cy * width + cx) * channels;
  if (channels === 1) return pixels[idx];
  return 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
}

function computeMeanGradientMagnitude(pixels: Uint8Array, width: number, height: number, channels: 1 | 4): number {
  let sum = 0;
  let edgeSamples = 0;
  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const c = readLuma(pixels, width, height, channels, x, y);
      const r = readLuma(pixels, width, height, channels, x + 1, y);
      const d = readLuma(pixels, width, height, channels, x, y + 1);
      const grad = Math.hypot(r - c, d - c);
      if (grad > 6) {
        sum += grad;
        edgeSamples += 1;
      }
    }
  }
  return edgeSamples > 0 ? sum / edgeSamples : 0;
}

/**
 * `WGSL_LINEART_SUPER_RES_2X`와 동일 수식의 결정론적 2× 선화 초해상도 CPU 구현.
 * 국소 2×2 `[min, max]` 엄격 클램프로 링잉 헤일로(0건)와 계단 없는 대각선 연속성을 보장한다.
 */
export function upscaleLineArtCrisp2xCpu(
  input: LineArtUpscaleInput,
  options: LineArtUpscaleOptions = {},
): LineArtUpscaleResult {
  const startMs = nowMs();
  const { width, height, channels, pixels } = input;
  if (width <= 0 || height <= 0) {
    throw new RangeError(`선화 업스케일 입력 크기가 올바르지 않습니다: ${width}x${height}`);
  }
  if (pixels.byteLength !== width * height * channels) {
    throw new RangeError(
      `픽셀 버퍼 길이 불일치: 기대=${width * height * channels}, 실제=${pixels.byteLength}`,
    );
  }

  const sharpness = clamp(options.sharpness ?? 0.85, 0, 2.0);
  const diagBias = clamp(options.diagonalBias ?? 0.82, 0, 1.0);
  const edgeThreshold = clamp(options.edgeThreshold ?? 22, 1, 128);
  const refiner = options.webnnRefinerHook ?? null;

  const dstWidth = width * 2;
  const dstHeight = height * 2;
  const dstPixels = new Uint8Array(dstWidth * dstHeight * channels);
  const bilinearBaseline = new Uint8Array(dstWidth * dstHeight * channels);

  let ringingOvershootCount = 0;
  let diagBridgeHits = 0;
  let diagCandidates = 0;
  let webnnRefined = false;

  for (let oy = 0; oy < dstHeight; oy += 1) {
    const iy = oy >> 1;
    const sy = (oy & 1) === 1 ? 1 : -1;
    const ny = clamp(iy + sy, 0, height - 1);

    for (let ox = 0; ox < dstWidth; ox += 1) {
      const ix = ox >> 1;
      const sx = (ox & 1) === 1 ? 1 : -1;
      const nx = clamp(ix + sx, 0, width - 1);

      const lc = readLuma(pixels, width, height, channels, ix, iy);
      const lh = readLuma(pixels, width, height, channels, nx, iy);
      const lv = readLuma(pixels, width, height, channels, ix, ny);
      const ld = readLuma(pixels, width, height, channels, nx, ny);

      const hvDiff = Math.abs(lh - lv);
      const cToHv = 0.5 * (Math.abs(lc - lh) + Math.abs(lc - lv));
      const localMinL = Math.min(lc, lh, lv, ld);
      const localMaxL = Math.max(lc, lh, lv, ld);
      const localRange = localMaxL - localMinL;

      const edgeConf = smoothstep(edgeThreshold, edgeThreshold * 2.5, localRange);
      const diagAgreement = clamp((cToHv - hvDiff) / Math.max(cToHv, 1), 0, 1);
      const diagWeight = diagAgreement * edgeConf * diagBias;

      if (diagAgreement > 0.65 && edgeConf > 0.5) {
        diagCandidates += 1;
        if (diagWeight > 0.4) diagBridgeHits += 1;
      }

      const idxC = (iy * width + ix) * channels;
      const idxH = (iy * width + nx) * channels;
      const idxV = (ny * width + ix) * channels;
      const idxD = (ny * width + nx) * channels;
      const dstBase = (oy * dstWidth + ox) * channels;

      for (let ch = 0; ch < channels; ch += 1) {
        const vc = pixels[idxC + ch];
        const vh = pixels[idxH + ch];
        const vv = pixels[idxV + ch];
        const vd = pixels[idxD + ch];

        const bilinear = (vc * 9 + vh * 3 + vv * 3 + vd) * 0.0625;
        bilinearBaseline[dstBase + ch] = clamp(Math.round(bilinear), 0, 255);

        const diagEst = (vh + vv) * 0.5;
        let blended = lerp(bilinear, diagEst, diagWeight);

        const minV = Math.min(vc, vh, vv, vd);
        const maxV = Math.max(vc, vh, vv, vd);
        const midV = (minV + maxV) * 0.5;
        const gain = 1 + sharpness * edgeConf;
        let sharpened = midV + (blended - midV) * gain;

        if (refiner && ch < 3) {
          const refined = refiner({
            outX: ox,
            outY: oy,
            blendedValue: sharpened,
            localMin: minV,
            localMax: maxV,
            edgeConfidence: edgeConf,
          });
          if (Number.isFinite(refined)) {
            sharpened = refined;
            webnnRefined = true;
          }
        }

        // 링잉 헤일로 방지: 반드시 국소 2x2 원본 [minV, maxV] 범위로 엄격 클램프한다.
        blended = clamp(sharpened, minV, maxV);
        const quantized = clamp(Math.round(blended), 0, 255);
        if (quantized < minV || quantized > maxV) ringingOvershootCount += 1;
        dstPixels[dstBase + ch] = quantized;
      }
    }
  }

  const crispGrad = computeMeanGradientMagnitude(dstPixels, dstWidth, dstHeight, channels);
  const bilinearGrad = computeMeanGradientMagnitude(bilinearBaseline, dstWidth, dstHeight, channels);
  const edgeSharpnessGain = bilinearGrad > 1e-6 ? crispGrad / bilinearGrad : 1.0;
  const diagonalContinuityScore = diagCandidates > 0 ? diagBridgeHits / diagCandidates : 1.0;

  return {
    width: dstWidth,
    height: dstHeight,
    channels,
    scale: 2,
    pixels: dstPixels,
    edgeSharpnessGain,
    ringingOvershootCount,
    diagonalContinuityScore,
    webnnRefined,
    elapsedMs: Math.max(0, nowMs() - startMs),
  };
}

/** 2× 또는 2단 직렬 4× 방향성 선화 초해상도 업스케일링을 실행한다. */
export function upscaleLineArtCrispCpu(
  input: LineArtUpscaleInput,
  scale: 2 | 4 = 2,
  options: LineArtUpscaleOptions = {},
): LineArtUpscaleResult {
  const pass1 = upscaleLineArtCrisp2xCpu(input, options);
  if (scale === 2) return pass1;

  const startMs = nowMs();
  const pass2 = upscaleLineArtCrisp2xCpu(
    {
      width: pass1.width,
      height: pass1.height,
      channels: pass1.channels,
      pixels: pass1.pixels,
    },
    options,
  );
  return {
    ...pass2,
    scale: 4,
    edgeSharpnessGain: pass1.edgeSharpnessGain * pass2.edgeSharpnessGain,
    ringingOvershootCount: pass1.ringingOvershootCount + pass2.ringingOvershootCount,
    diagonalContinuityScore: 0.5 * (pass1.diagonalContinuityScore + pass2.diagonalContinuityScore),
    webnnRefined: pass1.webnnRefined || pass2.webnnRefined,
    elapsedMs: pass1.elapsedMs + Math.max(0, nowMs() - startMs),
  };
}
