/**
 * Wave 55C — 16,384단계(14-bit) PCHIP 스타일러스 압력 곡선 및
 * One-Euro 적응형 α-β 필터 + 결정론적 경량 2-Layer Micro-MLP 궤적 예측·보정 엔진.
 */

export const STYLUS_COMPENSATION_SCHEMA_VERSION = "toonstudio.stylus-neural-compensation.v1" as const;
export const PRESSURE_LEVEL_COUNT_14BIT = 16384 as const;
export const MAX_PRESSURE_LEVEL_14BIT = 16383 as const;
export const DEFAULT_CUSP_THRESHOLD_DEG = 55 as const;
export const MAX_LOOK_AHEAD_MS = 16 as const;
export const MICRO_MLP_INFERENCE_KIND = "deterministic-micro-mlp-cpu" as const;
export const MICRO_MLP_PARAMETER_COUNT = 5 * 8 + 8 + 8 * 3 + 3;

export type MicroMlpInferenceKind = typeof MICRO_MLP_INFERENCE_KIND;
export type DigitizerProfileId =
  | "wacom-pro-pen-3" | "apple-pencil-pro" | "galaxy-spen-emr"
  | "huion-xppen-16k" | "mouse-trackpad-pseudo";
export type PressureCurvePresetId =
  | "gpen-crisp" | "pencil-soft-tone" | "ink-firm-line" | "wrist-care-light" | "linear-reference";
export type PressureStrokePhase = "press" | "release" | "neutral";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export interface PressureControlPoint { readonly x: number; readonly y: number; }
export interface StylusRawSample {
  readonly x: number; readonly y: number; readonly timestampMs: number;
  readonly pressure: number; readonly tiltDeg?: number; readonly barrelRollDeg?: number;
}
export interface DigitizerHardwareProfile {
  readonly id: DigitizerProfileId; readonly nameKo: string; readonly nameEn: string; readonly vendorFamily: string;
  readonly pressureLevels: number; readonly nativeHardwareLevels: number; readonly reportRateHz: number;
  readonly iafGrams: number; readonly maxForceGrams: number;
  readonly defaultIafThreshold: number; readonly defaultHysteresis: number; readonly maxTiltDeg: number;
  readonly supportsTilt: boolean; readonly supportsBarrelRoll: boolean; readonly supportsSqueeze: boolean;
  readonly jitterSigmaPx: number; readonly pipelineLatencyMs: number;
  readonly accentOklch: OklchColor; readonly summaryKo: string; readonly summaryEn: string;
}
export interface PressureCurvePreset {
  readonly id: PressureCurvePresetId; readonly nameKo: string; readonly nameEn: string;
  readonly descriptionKo: string; readonly descriptionEn: string;
  readonly controlPoints: readonly [
    PressureControlPoint, PressureControlPoint, PressureControlPoint, PressureControlPoint, PressureControlPoint,
  ];
  readonly recommendedTiltAttenuation: number;
}
export interface PchipCurveEvaluationInput {
  readonly rawPressure: number; readonly controlPoints: readonly PressureControlPoint[];
  readonly iafThreshold?: number; readonly hysteresisAmount?: number; readonly phase?: PressureStrokePhase;
  readonly tiltDeg?: number; readonly tiltAttenuationStrength?: number; readonly supportsTilt?: boolean;
}
export interface PchipCurveEvaluationResult {
  readonly rawPressure: number; readonly effectiveInput: number; readonly inIafDeadzone: boolean;
  readonly curveOutput: number; readonly tiltFactor: number; readonly normalizedOutput: number;
  readonly level14Bit: number; readonly phase: PressureStrokePhase;
}
export interface PchipCurveLutSample {
  readonly rawPressure: number; readonly neutralOutput: number; readonly pressOutput: number;
  readonly releaseOutput: number; readonly tiltedOutput: number; readonly neutralLevel14Bit: number;
}
export interface PchipCurveAuditReport {
  readonly samples: readonly PchipCurveLutSample[]; readonly controlPoints: readonly PressureControlPoint[];
  readonly isStrictlyMonotonic: boolean; readonly inversionCount: number; readonly maxOvershoot: number;
  readonly iafThreshold: number; readonly hysteresisPeakDelta: number; readonly tiltFactorAtPreviewDeg: number;
}
export interface StylusCompensationConfig {
  readonly digitizerId: DigitizerProfileId; readonly curvePresetId: PressureCurvePresetId;
  readonly iafThreshold: number; readonly hysteresisAmount: number;
  readonly tiltAttenuationStrength: number; readonly previewTiltDeg: number;
  readonly minCutoffHz: number; readonly speedBeta: number; readonly dCutoffHz: number;
  readonly lookAheadMs: number; readonly cornerThresholdDeg: number;
  readonly cornerProtection: number; readonly releaseTaperProtection: number; readonly jitterStrength: number;
}
export interface MicroMlpStepOutput {
  readonly inferenceKind: MicroMlpInferenceKind;
  readonly smoothBlend: number; readonly lookAheadGain: number; readonly arcCorrection: number;
}
export interface CompensatedStylusSample {
  readonly index: number; readonly timestampMs: number; readonly rawX: number; readonly rawY: number;
  readonly compensatedX: number; readonly compensatedY: number; readonly predictedX: number; readonly predictedY: number;
  readonly lookAheadDx: number; readonly lookAheadDy: number; readonly effectiveLeadMs: number;
  readonly velocityPxPerSec: number; readonly turningAngleDeg: number;
  readonly isCuspProtected: boolean; readonly isReleaseTaperProtected: boolean;
  readonly pressure14Bit: number; readonly normalizedPressure: number; readonly mlpOutput: MicroMlpStepOutput;
}
export interface StrokeCompensationResult {
  readonly inferenceKind: MicroMlpInferenceKind;
  readonly digitizer: DigitizerHardwareProfile; readonly curvePreset: PressureCurvePreset;
  readonly samples: readonly CompensatedStylusSample[];
  readonly cuspIndices: readonly number[]; readonly releaseTaperIndices: readonly number[];
  readonly meanLookAheadMs: number; readonly maxTurningAngleDeg: number; readonly mlpParameterCount: number;
}
export interface PipelineBenchmarkMetrics {
  readonly methodId: "raw" | "simple-ema" | "toonstudio-hybrid"; readonly labelKo: string; readonly labelEn: string;
  readonly rmsePx: number; readonly cornerPreservationPct: number;
  readonly residualLagMs: number; readonly effectiveLatencyCompMs: number; readonly releaseTaperSharpness: number;
}
export interface SyntheticBenchmarkStroke {
  readonly groundTruth: readonly StylusRawSample[]; readonly noisyInput: readonly StylusRawSample[];
  readonly cuspIndex: number; readonly fastArcRange: readonly [number, number]; readonly taperStartIndex: number;
}
export interface StrokeBenchmarkReport {
  readonly inferenceKind: MicroMlpInferenceKind;
  readonly digitizer: DigitizerHardwareProfile; readonly curvePreset: PressureCurvePreset;
  readonly synthetic: SyntheticBenchmarkStroke;
  readonly simpleEmaPoints: readonly { readonly x: number; readonly y: number }[];
  readonly hybridResult: StrokeCompensationResult;
  readonly metrics: readonly [PipelineBenchmarkMetrics, PipelineBenchmarkMetrics, PipelineBenchmarkMetrics];
  readonly rmseReductionVsRawPct: number; readonly rmseReductionVsEmaPct: number; readonly cornerGainVsEmaPct: number;
}
export interface StylusCompensationExportManifest {
  readonly schemaVersion: typeof STYLUS_COMPENSATION_SCHEMA_VERSION;
  readonly benchmarkScope: "synthetic-stroke";
  readonly inferenceKind: MicroMlpInferenceKind;
  readonly pressureResolutionLevels: typeof PRESSURE_LEVEL_COUNT_14BIT;
  readonly digitizer: DigitizerHardwareProfile; readonly curvePreset: PressureCurvePreset;
  readonly config: StylusCompensationConfig;
  readonly curveAudit: { readonly isStrictlyMonotonic: boolean; readonly maxOvershoot: number; readonly hysteresisPeakDelta: number };
  readonly benchmarkSummary: readonly PipelineBenchmarkMetrics[];
  readonly honestyNoteKo: string; readonly honestyNoteEn: string;
}
export interface StylusCompensationExportBundle {
  readonly manifest: StylusCompensationExportManifest; readonly json: string;
}

export function clampNumber(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}
export function roundDecimals(value: number, digits = 3): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}
export function isVioletHueDeg(hueDeg: number): boolean {
  const norm = ((hueDeg % 360) + 360) % 360;
  return norm >= 270 && norm <= 320;
}
export function sanitizeNonVioletOklch(color: OklchColor): OklchColor {
  const normH = Number.isFinite(color.h) ? ((color.h % 360) + 360) % 360 : 232;
  return { l: roundDecimals(clampNumber(color.l, 0, 1), 3), c: roundDecimals(clampNumber(color.c, 0, 0.37), 3), h: roundDecimals(isVioletHueDeg(normH) ? 232 : normH, 1) };
}
export function formatOklch(color: OklchColor, alpha?: number): string {
  const safe = sanitizeNonVioletOklch(color);
  return alpha !== undefined ? `oklch(${safe.l} ${safe.c} ${safe.h} / ${roundDecimals(clampNumber(alpha, 0, 1), 3)})` : `oklch(${safe.l} ${safe.c} ${safe.h})`;
}

export const DIGITIZER_HARDWARE_PROFILES: readonly DigitizerHardwareProfile[] = [
  {
    id: "wacom-pro-pen-3", nameKo: "Wacom Pro Pen 3", nameEn: "Wacom Pro Pen 3", vendorFamily: "Wacom EMR 3rd-Gen",
    pressureLevels: 16384, nativeHardwareLevels: 8192, reportRateHz: 240, iafGrams: 1.0, maxForceGrams: 500,
    defaultIafThreshold: 0.012, defaultHysteresis: 0.024, maxTiltDeg: 60, supportsTilt: true, supportsBarrelRoll: false, supportsSqueeze: false,
    jitterSigmaPx: 0.72, pipelineLatencyMs: 6.5, accentOklch: { l: 0.52, c: 0.14, h: 228 },
    summaryKo: "1g 초저활성화 필압 · 240Hz 스캔 · 8,192 네이티브→16,384 보간 LUT",
    summaryEn: "1g ultra-low IAF, 240Hz scan, 8,192 native upsampled to 16,384-step LUT",
  },
  {
    id: "apple-pencil-pro", nameKo: "Apple Pencil Pro", nameEn: "Apple Pencil Pro", vendorFamily: "Apple Active Capacitive",
    pressureLevels: 16384, nativeHardwareLevels: 4096, reportRateHz: 240, iafGrams: 1.5, maxForceGrams: 400,
    defaultIafThreshold: 0.018, defaultHysteresis: 0.028, maxTiltDeg: 65, supportsTilt: true, supportsBarrelRoll: true, supportsSqueeze: true,
    jitterSigmaPx: 0.68, pipelineLatencyMs: 8.8, accentOklch: { l: 0.55, c: 0.13, h: 192 },
    summaryKo: "배럴 롤·기울기·스퀴즈 센서 · 240Hz 예측 스트림 · 14-bit 부동 필압 양자화",
    summaryEn: "Barrel roll, tilt & squeeze sensors at 240Hz with 14-bit quantized force",
  },
  {
    id: "galaxy-spen-emr", nameKo: "Galaxy S-Pen EMR", nameEn: "Galaxy S-Pen EMR", vendorFamily: "Samsung / Wacom EMR",
    pressureLevels: 4096, nativeHardwareLevels: 4096, reportRateHz: 120, iafGrams: 2.2, maxForceGrams: 420,
    defaultIafThreshold: 0.024, defaultHysteresis: 0.036, maxTiltDeg: 60, supportsTilt: true, supportsBarrelRoll: false, supportsSqueeze: false,
    jitterSigmaPx: 1.15, pipelineLatencyMs: 11.4, accentOklch: { l: 0.54, c: 0.145, h: 158 },
    summaryKo: "4,096단계 EMR 무배터리 · 120Hz 스캔 · 모바일 화면 흔들림 억제 중점",
    summaryEn: "4,096-level passive EMR at 120Hz tuned for mobile hand-tremor suppression",
  },
  {
    id: "huion-xppen-16k", nameKo: "Huion · XP-Pen 16K", nameEn: "Huion / XP-Pen 16K", vendorFamily: "PenTech 4.0 / X3 Pro 16K",
    pressureLevels: 16384, nativeHardwareLevels: 16384, reportRateHz: 266, iafGrams: 2.0, maxForceGrams: 500,
    defaultIafThreshold: 0.02, defaultHysteresis: 0.032, maxTiltDeg: 60, supportsTilt: true, supportsBarrelRoll: false, supportsSqueeze: false,
    jitterSigmaPx: 0.92, pipelineLatencyMs: 7.4, accentOklch: { l: 0.58, c: 0.15, h: 52 },
    summaryKo: "네이티브 16,384단계 · 266Hz 고속 폴링 · 경필압 대역 미세 진동 보정",
    summaryEn: "Native 16,384 levels at 266Hz polling with fine low-force jitter damping",
  },
  {
    id: "mouse-trackpad-pseudo", nameKo: "마우스 · 트랙패드 의사필압", nameEn: "Mouse / Trackpad Pseudo-Pressure",
    vendorFamily: "Velocity-Synthesized Pointer", pressureLevels: 16384, nativeHardwareLevels: 1, reportRateHz: 125,
    iafGrams: 0, maxForceGrams: 0, defaultIafThreshold: 0.03, defaultHysteresis: 0.015, maxTiltDeg: 0,
    supportsTilt: false, supportsBarrelRoll: false, supportsSqueeze: false,
    jitterSigmaPx: 1.65, pipelineLatencyMs: 13.8, accentOklch: { l: 0.52, c: 0.12, h: 26 },
    summaryKo: "속도·가속도 기반 의사필압 합성 · 125Hz 계단 지터 강력 평활화",
    summaryEn: "Velocity-synthesized pseudo-pressure with heavy 125Hz stair-step smoothing",
  },
];

export const PRESSURE_CURVE_PRESETS: readonly PressureCurvePreset[] = [
  {
    id: "gpen-crisp", nameKo: "G펜 날카로운 강약", nameEn: "G-Pen Crisp Contrast",
    descriptionKo: "약필압은 가늘게 버티고 중·강필압에서 굵기가 또렷하게 살아나는 웹툰 선화 곡선",
    descriptionEn: "Holds crisp hairlines at light force, then ramps sharply for bold comic ink",
    controlPoints: [{ x: 0, y: 0 }, { x: 0.28, y: 0.11 }, { x: 0.56, y: 0.37 }, { x: 0.8, y: 0.76 }, { x: 1, y: 1 }],
    recommendedTiltAttenuation: 0.25,
  },
  {
    id: "pencil-soft-tone", nameKo: "연필 부드러운 톤", nameEn: "Pencil Soft Tone",
    descriptionKo: "낮은 필압에서도 계조가 부드럽게 열려 스케치·명암 그라데이션에 맞는 곡선",
    descriptionEn: "Opens mid-tone shading early for responsive graphite sketching and gradients",
    controlPoints: [{ x: 0, y: 0 }, { x: 0.2, y: 0.29 }, { x: 0.48, y: 0.57 }, { x: 0.76, y: 0.81 }, { x: 1, y: 1 }],
    recommendedTiltAttenuation: 0.45,
  },
  {
    id: "ink-firm-line", nameKo: "잉크 단단한 선", nameEn: "Firm Technical Ink",
    descriptionKo: "초반 번짐을 억제하고 중간 대역을 탄탄하게 유지하는 배경·명확 선화 곡선",
    descriptionEn: "Firm initial resistance prevents stray blobs while keeping steady mid-weight lines",
    controlPoints: [{ x: 0, y: 0 }, { x: 0.26, y: 0.17 }, { x: 0.52, y: 0.45 }, { x: 0.8, y: 0.82 }, { x: 1, y: 1 }],
    recommendedTiltAttenuation: 0.18,
  },
  {
    id: "wrist-care-light", nameKo: "손목 보호 경필압", nameEn: "Wrist-Care Light Touch",
    descriptionKo: "70% 힘만으로 90% 필압에 도달해 장기 마감 시 손목·손가락 피로를 낮추는 곡선",
    descriptionEn: "Reaches 90% output at 70% physical load to reduce wrist strain on long sessions",
    controlPoints: [{ x: 0, y: 0 }, { x: 0.18, y: 0.36 }, { x: 0.42, y: 0.68 }, { x: 0.7, y: 0.91 }, { x: 1, y: 1 }],
    recommendedTiltAttenuation: 0.2,
  },
  {
    id: "linear-reference", nameKo: "선형 기준 (1:1)", nameEn: "Linear Reference (1:1)",
    descriptionKo: "보정 곡선을 왜곡하지 않고 디지타이저 원시 응답과 1:1로 대응하는 기준선",
    descriptionEn: "Direct 1:1 identity response matching raw digitizer linearity without reshaping",
    controlPoints: [{ x: 0, y: 0 }, { x: 0.25, y: 0.25 }, { x: 0.5, y: 0.5 }, { x: 0.75, y: 0.75 }, { x: 1, y: 1 }],
    recommendedTiltAttenuation: 0.15,
  },
];

export function getDigitizerProfile(id: DigitizerProfileId): DigitizerHardwareProfile {
  return DIGITIZER_HARDWARE_PROFILES.find((item) => item.id === id) ?? DIGITIZER_HARDWARE_PROFILES[0];
}
export function getPressureCurvePreset(id: PressureCurvePresetId): PressureCurvePreset {
  return PRESSURE_CURVE_PRESETS.find((item) => item.id === id) ?? PRESSURE_CURVE_PRESETS[0];
}

export function createDefaultStylusCompensationConfig(
  digitizerId: DigitizerProfileId = "wacom-pro-pen-3",
  curvePresetId: PressureCurvePresetId = "gpen-crisp",
): StylusCompensationConfig {
  const d = getDigitizerProfile(digitizerId);
  const p = getPressureCurvePreset(curvePresetId);
  return {
    digitizerId: d.id, curvePresetId: p.id, iafThreshold: d.defaultIafThreshold, hysteresisAmount: d.defaultHysteresis,
    tiltAttenuationStrength: d.supportsTilt ? p.recommendedTiltAttenuation : 0, previewTiltDeg: d.supportsTilt ? 28 : 0,
    minCutoffHz: d.reportRateHz >= 200 ? 1.8 : 1.4, speedBeta: d.reportRateHz >= 200 ? 0.008 : 0.006,
    dCutoffHz: d.reportRateHz >= 200 ? 18 : 12, lookAheadMs: 8, cornerThresholdDeg: DEFAULT_CUSP_THRESHOLD_DEG,
    cornerProtection: 0.88, releaseTaperProtection: 0.85, jitterStrength: 1.0,
  };
}

/** 컨트롤 포인트를 엄격 단조 증가 구간 [0, 1]로 정규화한다. */
export function normalizePchipControlPoints(points: readonly PressureControlPoint[]): readonly PressureControlPoint[] {
  if (points.length < 2) return PRESSURE_CURVE_PRESETS[4].controlPoints;
  if (points.length > 4096) throw new RangeError("PCHIP 제어점은 최대 4,096개입니다.");
  const sorted = [...points].map((pt) => ({ x: clampNumber(pt.x, 0, 1), y: clampNumber(pt.y, 0, 1) })).sort((a, b) => a.x - b.x);
  const out: PressureControlPoint[] = [];
  const lastIdx = sorted.length - 1;
  const spacing = Math.min(0.002, 0.5 / lastIdx);
  for (let i = 0; i <= lastIdx; i += 1) {
    if (i === 0) out.push({ x: 0, y: 0 });
    else if (i === lastIdx) out.push({ x: 1, y: 1 });
    else out.push({ x: clampNumber(sorted[i].x, out[i - 1].x + spacing, 1 - (lastIdx - i) * spacing), y: clampNumber(sorted[i].y, out[i - 1].y, 1) });
  }
  return out;
}

/** Fritsch-Carlson (1980) + Fritsch-Butland 가중 조화평균 PCHIP 접선 계산(오버슈트·역전 0 보장). */
export function computePchipTangents(points: readonly PressureControlPoint[]): readonly number[] {
  const n = points.length;
  if (n < 2) return [1];
  const h: number[] = [], delta: number[] = [];
  for (let k = 0; k < n - 1; k += 1) {
    const hk = Math.max(1e-6, points[k + 1].x - points[k].x);
    h.push(hk); delta.push(Math.max(0, (points[k + 1].y - points[k].y) / hk));
  }
  if (n === 2) return [delta[0], delta[0]];

  const m = new Array<number>(n).fill(0);
  for (let k = 1; k < n - 1; k += 1) {
    if (delta[k - 1] > 0 && delta[k] > 0) {
      const w1 = 2 * h[k] + h[k - 1], w2 = h[k] + 2 * h[k - 1];
      m[k] = (w1 + w2) / (w1 / delta[k - 1] + w2 / delta[k]);
    }
  }
  const m0 = ((2 * h[0] + h[1]) * delta[0] - h[0] * delta[1]) / (h[0] + h[1]);
  m[0] = delta[0] <= 0 || m0 <= 0 ? 0 : Math.min(m0, 3 * delta[0]);
  const last = n - 2;
  const mn = ((2 * h[last] + h[last - 1]) * delta[last] - h[last] * delta[last - 1]) / (h[last] + h[last - 1]);
  m[n - 1] = delta[last] <= 0 || mn <= 0 ? 0 : Math.min(mn, 3 * delta[last]);

  for (let k = 0; k < n - 1; k += 1) {
    if (delta[k] <= 0) { m[k] = 0; m[k + 1] = 0; }
    else {
      const a = m[k] / delta[k], b = m[k + 1] / delta[k], sq = a * a + b * b;
      if (sq > 9) { const tau = 3 / Math.sqrt(sq); m[k] = tau * a * delta[k]; m[k + 1] = tau * b * delta[k]; }
    }
  }
  return m;
}

function evaluateNormalizedPchip(u: number, points: readonly PressureControlPoint[], tangents: readonly number[]): number {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  let seg = points.length - 2;
  for (let k = 0; k < points.length - 1; k += 1) { if (u <= points[k + 1].x) { seg = k; break; } }
  const p0 = points[seg], p1 = points[seg + 1], h = Math.max(1e-6, p1.x - p0.x);
  const t = clampNumber((u - p0.x) / h, 0, 1), t2 = t * t, t3 = t2 * t;
  const y = (2 * t3 - 3 * t2 + 1) * p0.y + (t3 - 2 * t2 + t) * h * tangents[seg] + (-2 * t3 + 3 * t2) * p1.y + (t3 - t2) * h * tangents[seg + 1];
  return clampNumber(y, p0.y, p1.y);
}

/** 16,384단계(14-bit) PCHIP 단조 압력 곡선 + IAF 데드존 + 히스테리시스 + cos(tilt) 감쇠 평가. */
export function evaluatePchipPressureCurve(input: PchipCurveEvaluationInput): PchipCurveEvaluationResult {
  const rawPressure = clampNumber(input.rawPressure, 0, 1);
  const iaf = clampNumber(input.iafThreshold ?? 0, 0, 0.15);
  const hysteresis = clampNumber(input.hysteresisAmount ?? 0, 0, 0.12);
  const phase: PressureStrokePhase = input.phase ?? "neutral";
  const supportsTilt = input.supportsTilt ?? true;
  const tiltDeg = supportsTilt ? clampNumber(input.tiltDeg ?? 0, 0, 75) : 0;
  const tiltStrength = supportsTilt ? clampNumber(input.tiltAttenuationStrength ?? 0, 0, 1) : 0;
  const tiltFactor = clampNumber(1 - tiltStrength * (1 - Math.cos((tiltDeg * Math.PI) / 180)), 0.2, 1);

  if (rawPressure <= iaf) {
    return { rawPressure, effectiveInput: 0, inIafDeadzone: true, curveOutput: 0, tiltFactor, normalizedOutput: 0, level14Bit: 0, phase };
  }
  const uBase = clampNumber((rawPressure - iaf) / Math.max(1e-6, 1 - iaf), 0, 1);
  const envelope = 4 * uBase * (1 - uBase);
  const effectiveInput = clampNumber(uBase + (phase === "press" ? -0.5 * hysteresis * envelope : phase === "release" ? 0.5 * hysteresis * envelope : 0), 0, 1);
  const pts = normalizePchipControlPoints(input.controlPoints);
  const curveOutput = evaluateNormalizedPchip(effectiveInput, pts, computePchipTangents(pts));
  const normalizedOutput = clampNumber(curveOutput * tiltFactor, 0, 1);
  return { rawPressure, effectiveInput, inIafDeadzone: false, curveOutput, tiltFactor, normalizedOutput, level14Bit: Math.round(normalizedOutput * MAX_PRESSURE_LEVEL_14BIT), phase };
}

/** UI 프리뷰 및 단조성 무결성 감사에 쓰는 PCHIP 곡선 LUT 샘플러. */
export function auditPchipPressureCurve(config: StylusCompensationConfig, sampleCount = 65): PchipCurveAuditReport {
  const digitizer = getDigitizerProfile(config.digitizerId);
  const points = normalizePchipControlPoints(getPressureCurvePreset(config.curvePresetId).controlPoints);
  const tangents = computePchipTangents(points);
  const count = clampNumber(Math.round(Number.isFinite(sampleCount) ? sampleCount : 65), 17, 257);
  const samples: PchipCurveLutSample[] = [];
  let prevN = -1, prevP = -1, prevR = -1, inversionCount = 0, maxOvershoot = 0, hysteresisPeakDelta = 0, tiltFactorAtPreviewDeg = 1;

  for (let i = 0; i < count; i += 1) {
    const raw = i / (count - 1);
    const base = { rawPressure: raw, controlPoints: points, iafThreshold: config.iafThreshold, hysteresisAmount: config.hysteresisAmount, supportsTilt: digitizer.supportsTilt };
    const neutral = evaluatePchipPressureCurve({ ...base, phase: "neutral", tiltDeg: 0, tiltAttenuationStrength: 0 });
    const press = evaluatePchipPressureCurve({ ...base, phase: "press", tiltDeg: 0, tiltAttenuationStrength: 0 });
    const release = evaluatePchipPressureCurve({ ...base, phase: "release", tiltDeg: 0, tiltAttenuationStrength: 0 });
    const tilted = evaluatePchipPressureCurve({ ...base, phase: "neutral", tiltDeg: config.previewTiltDeg, tiltAttenuationStrength: config.tiltAttenuationStrength });
    if (neutral.normalizedOutput + 1e-12 < prevN) inversionCount += 1;
    if (press.normalizedOutput + 1e-12 < prevP) inversionCount += 1;
    if (release.normalizedOutput + 1e-12 < prevR) inversionCount += 1;
    prevN = neutral.normalizedOutput; prevP = press.normalizedOutput; prevR = release.normalizedOutput;
    const rawEval = evaluateNormalizedPchip(raw, points, tangents);
    if (rawEval < 0) maxOvershoot = Math.max(maxOvershoot, -rawEval);
    if (rawEval > 1) maxOvershoot = Math.max(maxOvershoot, rawEval - 1);
    hysteresisPeakDelta = Math.max(hysteresisPeakDelta, Math.abs(release.curveOutput - press.curveOutput));
    tiltFactorAtPreviewDeg = tilted.tiltFactor;
    samples.push({
      rawPressure: roundDecimals(raw, 4), neutralOutput: roundDecimals(neutral.curveOutput, 5),
      pressOutput: roundDecimals(press.curveOutput, 5), releaseOutput: roundDecimals(release.curveOutput, 5),
      tiltedOutput: roundDecimals(tilted.normalizedOutput, 5), neutralLevel14Bit: neutral.level14Bit,
    });
  }
  return {
    samples, controlPoints: points, isStrictlyMonotonic: inversionCount === 0 && maxOvershoot === 0, inversionCount,
    maxOvershoot: roundDecimals(maxOvershoot, 6), iafThreshold: config.iafThreshold,
    hysteresisPeakDelta: roundDecimals(hysteresisPeakDelta, 4), tiltFactorAtPreviewDeg: roundDecimals(tiltFactorAtPreviewDeg, 4),
  };
}

/** 결정론적 고정 가중치 2-Layer Micro-MLP (5 -> 8 tanh -> 3, 75 파라미터, CPU 내장 해석 가중치). */
const MLP_W1: readonly (readonly [number, number, number, number, number])[] = [
  [-1.35, -0.15, 0.25, 0.1, 0.2], [1.65, 0.3, -1.2, 0.15, -1.1],
  [-0.25, 0.1, 2.35, -0.1, 1.95], [0.8, -0.25, -0.4, -1.9, 0.15],
  [0.55, 1.35, -0.5, 0.25, -0.3], [1.1, -0.2, 0.85, 0.1, 0.7],
  [-0.9, -0.65, 0.45, 0.85, 0.2], [0.4, -0.95, 1.1, -0.8, 0.9],
];
const MLP_B1: readonly number[] = [0.45, -0.25, -0.65, -0.3, -0.1, -0.35, 0.2, -0.2];
const MLP_W2: readonly (readonly [number, number, number, number, number, number, number, number])[] = [
  [1.35, 0.55, -2.25, -0.45, -0.15, -0.25, 0.95, -0.35],
  [-0.95, 1.85, -2.4, -0.9, 0.75, 0.3, -0.45, -1.25],
  [-0.2, 0.45, -0.85, -0.25, 0.2, 1.4, -0.15, -0.35],
];
const MLP_B2: readonly [number, number, number] = [1.15, -0.15, 0.0];

function sigmoid(x: number): number { return 1 / (1 + Math.exp(-clampNumber(x, -18, 18))); }

export function evaluateDeterministicMicroMlp(features: {
  readonly velocityPxPerSec: number; readonly accelPxPerSec2: number; readonly curvatureRadPerPx: number;
  readonly pressureRatePerSec: number; readonly angularVelocityRadPerSec: number;
}): MicroMlpStepOutput {
  const x0 = Math.tanh(Math.max(0, features.velocityPxPerSec) / 720);
  const x1 = Math.tanh(features.accelPxPerSec2 / 4200);
  const x2 = Math.tanh(Math.abs(features.curvatureRadPerPx) * 28);
  const x3 = Math.tanh(features.pressureRatePerSec / 4.5);
  const x4 = Math.tanh(Math.abs(features.angularVelocityRadPerSec) / 18);
  const h: number[] = [];
  for (let j = 0; j < MLP_W1.length; j += 1) {
    const r = MLP_W1[j];
    h.push(Math.tanh(r[0] * x0 + r[1] * x1 + r[2] * x2 + r[3] * x3 + r[4] * x4 + MLP_B1[j]));
  }
  let z0 = MLP_B2[0], z1 = MLP_B2[1], z2 = MLP_B2[2];
  for (let j = 0; j < h.length; j += 1) { z0 += MLP_W2[0][j] * h[j]; z1 += MLP_W2[1][j] * h[j]; z2 += MLP_W2[2][j] * h[j]; }
  return { inferenceKind: MICRO_MLP_INFERENCE_KIND, smoothBlend: roundDecimals(sigmoid(z0), 4), lookAheadGain: roundDecimals(sigmoid(z1), 4), arcCorrection: roundDecimals(Math.tanh(z2), 4) };
}

function oneEuroAlpha(dtSec: number, cutoffHz: number): number {
  return 1 / (1 + 1 / (2 * Math.PI * Math.max(0.05, cutoffHz) * Math.max(1e-4, dtSec)));
}

function computeLocalTurningAngleDeg(samples: readonly StylusRawSample[], index: number): number {
  const n = samples.length;
  if (index <= 1 || index >= n - 2) return 0;
  const span = Math.min(3, index, n - 1 - index);
  let pX = 0, pY = 0, nX = 0, nY = 0;
  for (let k = 1; k <= span; k += 1) { pX += samples[index - k].x; pY += samples[index - k].y; nX += samples[index + k].x; nY += samples[index + k].y; }
  const vInX = samples[index].x - pX / span, vInY = samples[index].y - pY / span;
  const vOutX = nX / span - samples[index].x, vOutY = nY / span - samples[index].y;
  const mIn = Math.hypot(vInX, vInY), mOut = Math.hypot(vOutX, vOutY);
  return mIn < 1.2 || mOut < 1.2 ? 0 : (Math.acos(clampNumber((vInX * vOutX + vInY * vOutY) / (mIn * mOut), -1, 1)) * 180) / Math.PI;
}

/** One-Euro 필터와 고정 가중치 모형을 사용해 획 좌표를 보정한다. */
export function compensateStylusStroke(rawSamples: readonly StylusRawSample[], config: StylusCompensationConfig): StrokeCompensationResult {
  for (let i = 0; i < rawSamples.length; i += 1) {
    const { x, y, timestampMs, pressure } = rawSamples[i];
    if (![x, y, timestampMs, pressure].every((value) => Math.abs(value) <= Number.MAX_SAFE_INTEGER)
        || (i > 0 && timestampMs < rawSamples[i - 1].timestampMs)) {
      throw new RangeError("획의 좌표·압력·시각은 유한해야 하며 시간 순서대로 입력해야 합니다.");
    }
  }
  const digitizer = getDigitizerProfile(config.digitizerId);
  const curvePreset = getPressureCurvePreset(config.curvePresetId);
  const controlPoints = normalizePchipControlPoints(curvePreset.controlPoints);
  const lookAheadMs = clampNumber(config.lookAheadMs, 0, MAX_LOOK_AHEAD_MS);
  const cornerThresholdDeg = clampNumber(config.cornerThresholdDeg, 25, 130);
  const cornerProtection = clampNumber(config.cornerProtection, 0, 1);
  const taperProtection = clampNumber(config.releaseTaperProtection, 0, 1);
  const minCutoffHz = clampNumber(config.minCutoffHz, 0.4, 8);
  const speedBeta = clampNumber(config.speedBeta, 0, 0.2);
  const dCutoffHz = clampNumber(config.dCutoffHz, 2, 30);

  if (rawSamples.length === 0) {
    return {
      inferenceKind: MICRO_MLP_INFERENCE_KIND, digitizer, curvePreset, samples: [], cuspIndices: [],
      releaseTaperIndices: [], meanLookAheadMs: 0, maxTurningAngleDeg: 0, mlpParameterCount: MICRO_MLP_PARAMETER_COUNT,
    };
  }

  const angles = rawSamples.map((_, idx) => computeLocalTurningAngleDeg(rawSamples, idx));
  const out: CompensatedStylusSample[] = [];
  const cuspIndices: number[] = [];
  const releaseTaperIndices: number[] = [];
  let filtX = rawSamples[0].x, filtY = rawSamples[0].y;
  let vxFilt = 0, vyFilt = 0, prevSpeed = 0, prevHeading = 0, hasPrevHeading = false;
  let taperDirX = 1, taperDirY = 0, leadSum = 0, maxTurningAngleDeg = 0, lastCuspIdx = -10;

  for (let i = 0; i < rawSamples.length; i += 1) {
    const s = rawSamples[i];
    const prev = i > 0 ? rawSamples[i - 1] : s;
    const dtSec = i > 0 ? Math.max(0.001, (s.timestampMs - prev.timestampMs) / 1000) : 1 / digitizer.reportRateHz;
    const turningAngleDeg = angles[i];
    maxTurningAngleDeg = Math.max(maxTurningAngleDeg, turningAngleDeg);
    const isPeakCusp = turningAngleDeg >= (angles[i - 1] ?? 0) && turningAngleDeg >= (angles[i + 1] ?? 0);
    const isCuspProtected = turningAngleDeg > cornerThresholdDeg && isPeakCusp && cornerProtection > 0.05;
    if (isCuspProtected) { cuspIndices.push(i); lastCuspIdx = i; }

    const dpDt = i > 0 ? (s.pressure - prev.pressure) / dtSec : 0;
    const isNearTail = i >= Math.max(2, rawSamples.length - Math.max(4, Math.round(rawSamples.length * 0.16)));
    const isReleaseTaperProtected =
      taperProtection > 0.05 && ((dpDt < -1.4 && s.pressure < 0.36) || (isNearTail && dpDt < -0.5 && s.pressure < 0.32));
    if (isReleaseTaperProtected) releaseTaperIndices.push(i);

    const alphaD = oneEuroAlpha(dtSec, dCutoffHz);
    if (i === 0) {
      vxFilt = 0; vyFilt = 0;
    } else if (i === 1) {
      const ahead = rawSamples[Math.min(rawSamples.length - 1, 2)];
      const dtInit = Math.max(0.001, (ahead.timestampMs - rawSamples[0].timestampMs) / 1000);
      vxFilt = (ahead.x - rawSamples[0].x) / dtInit; vyFilt = (ahead.y - rawSamples[0].y) / dtInit;
    } else if (isCuspProtected) {
      const outEnd = rawSamples[Math.min(rawSamples.length - 1, i + 3)];
      const outDt = Math.max(0.001, (outEnd.timestampMs - s.timestampMs) / 1000);
      vxFilt = (outEnd.x - s.x) / outDt; vyFilt = (outEnd.y - s.y) / outDt;
    } else if (i - lastCuspIdx === 1) {
      // 코너 직후 첫 샘플: 코너 이전 좌표를 가로질러 차분하지 않고 출구 1스텝 속도로 유지
      vxFilt = 0.5 * ((s.x - prev.x) / dtSec) + 0.5 * vxFilt;
      vyFilt = 0.5 * ((s.y - prev.y) / dtSec) + 0.5 * vyFilt;
    } else {
      const back2 = rawSamples[i - 2];
      const dt2 = Math.max(0.001, (s.timestampMs - back2.timestampMs) / 1000);
      vxFilt = alphaD * ((s.x - back2.x) / dt2) + (1 - alphaD) * vxFilt;
      vyFilt = alphaD * ((s.y - back2.y) / dt2) + (1 - alphaD) * vyFilt;
    }

    const speed = Math.hypot(vxFilt, vyFilt);
    const alphaPos = clampNumber(oneEuroAlpha(dtSec, minCutoffHz + speedBeta * speed), 0.16, 0.38);

    if (i === 0) {
      filtX = s.x; filtY = s.y;
    } else if (isCuspProtected) {
      const snap = 0.82 + 0.16 * cornerProtection;
      filtX = snap * s.x + (1 - snap) * filtX;
      filtY = snap * s.y + (1 - snap) * filtY;
    } else {
      const predX = filtX + vxFilt * dtSec;
      const predY = filtY + vyFilt * dtSec;
      const errX = s.x - predX;
      const errY = s.y - predY;
      filtX = predX + alphaPos * errX;
      filtY = predY + alphaPos * errY;
      // 곡률 아크 추종을 위한 경량 α-β 잔차 속도 피드백
      const betaGain = 0.45 * alphaPos * alphaPos;
      vxFilt += (betaGain / dtSec) * errX;
      vyFilt += (betaGain / dtSec) * errY;
    }

    const accel = (speed - prevSpeed) / dtSec;
    const heading = speed > 12 ? Math.atan2(vyFilt, vxFilt) : prevHeading;
    let dHead = hasPrevHeading ? heading - prevHeading : 0;
    while (dHead > Math.PI) dHead -= 2 * Math.PI;
    while (dHead < -Math.PI) dHead += 2 * Math.PI;
    const angularVel = dHead / dtSec;
    const curvature = speed > 15 ? Math.abs(dHead) / Math.max(0.5, speed * dtSec) : 0;

    // 삐침 꼬리 방향은 급꺾임 직후 안정화된 접선(감압 초입 포함)으로 유지하되 저필압 말단에서 잠금
    if (!isReleaseTaperProtected && speed > 45) { taperDirX = vxFilt / speed; taperDirY = vyFilt / speed; }

    const mlpOutput = evaluateDeterministicMicroMlp({
      velocityPxPerSec: speed, accelPxPerSec2: accel, curvatureRadPerPx: curvature,
      pressureRatePerSec: dpDt, angularVelocityRadPerSec: angularVel,
    });
    const blend = isCuspProtected
      ? mlpOutput.smoothBlend * (1 - cornerProtection * 0.85)
      : clampNumber(0.84 + mlpOutput.smoothBlend * 0.14, 0.84, 0.98);
    let compX = blend * filtX + (1 - blend) * s.x;
    let compY = blend * filtY + (1 - blend) * s.y;

    if (isReleaseTaperProtected && i > 0) {
      const prevOut = out[i - 1];
      const proj = Math.max(0, (compX - prevOut.compensatedX) * taperDirX + (compY - prevOut.compensatedY) * taperDirY);
      const w = 0.55 * taperProtection;
      compX = w * (prevOut.compensatedX + taperDirX * proj) + (1 - w) * compX;
      compY = w * (prevOut.compensatedY + taperDirY * proj) + (1 - w) * compY;
    }

    const cuspLeadAtten = isCuspProtected ? Math.max(0, 1 - cornerProtection * 0.96) : 1;
    const effectiveLeadMs = i === 0 ? 0 : roundDecimals(lookAheadMs * mlpOutput.lookAheadGain * cuspLeadAtten * (isReleaseTaperProtected ? 0.5 : 1), 2);
    const leadSec = effectiveLeadMs / 1000;
    const lookAheadDx = clampNumber((isReleaseTaperProtected ? taperDirX * speed : vxFilt) * leadSec, -18, 18);
    const lookAheadDy = clampNumber((isReleaseTaperProtected ? taperDirY * speed : vyFilt) * leadSec, -18, 18);

    const pEval = evaluatePchipPressureCurve({
      rawPressure: s.pressure, controlPoints, iafThreshold: config.iafThreshold, hysteresisAmount: config.hysteresisAmount,
      phase: dpDt > 0.15 ? "press" : dpDt < -0.15 ? "release" : "neutral",
      tiltDeg: s.tiltDeg ?? config.previewTiltDeg, tiltAttenuationStrength: config.tiltAttenuationStrength, supportsTilt: digitizer.supportsTilt,
    });

    leadSum += effectiveLeadMs; prevSpeed = speed;
    if (speed > 12) { prevHeading = heading; hasPrevHeading = true; }
    out.push({
      index: i, timestampMs: s.timestampMs, rawX: roundDecimals(s.x, 3), rawY: roundDecimals(s.y, 3),
      compensatedX: roundDecimals(compX, 3), compensatedY: roundDecimals(compY, 3),
      predictedX: roundDecimals(compX + lookAheadDx, 3), predictedY: roundDecimals(compY + lookAheadDy, 3),
      lookAheadDx: roundDecimals(lookAheadDx, 3), lookAheadDy: roundDecimals(lookAheadDy, 3),
      effectiveLeadMs, velocityPxPerSec: roundDecimals(speed, 1), turningAngleDeg: roundDecimals(turningAngleDeg, 1),
      isCuspProtected, isReleaseTaperProtected, pressure14Bit: pEval.level14Bit,
      normalizedPressure: roundDecimals(pEval.normalizedOutput, 4), mlpOutput,
    });
  }

  return {
    inferenceKind: MICRO_MLP_INFERENCE_KIND, digitizer, curvePreset, samples: out, cuspIndices, releaseTaperIndices,
    meanLookAheadMs: roundDecimals(leadSum / out.length, 2), maxTurningAngleDeg: roundDecimals(maxTurningAngleDeg, 1),
    mlpParameterCount: MICRO_MLP_PARAMETER_COUNT,
  };
}

/** 결정론적 합성 지터 스트로크 생성기: 저속 정밀 곡선 → 106° 급꺾임 코너 → 고속 선회 호 → 자연 접선 삐침. */
export function generateSyntheticBenchmarkStroke(config: StylusCompensationConfig): SyntheticBenchmarkStroke {
  const digitizer = getDigitizerProfile(config.digitizerId);
  const dtMs = 1000 / digitizer.reportRateHz;
  const jitterAmp = digitizer.jitterSigmaPx * clampNumber(config.jitterStrength, 0.1, 3.0);
  const groundTruth: StylusRawSample[] = [];
  const noisyInput: StylusRawSample[] = [];
  const nSlow = 26, nArc = 28, nTaper = 14;
  const cuspIndex = nSlow - 1, taperStartIndex = nSlow + nArc - 1;
  let tMs = 0;

  for (let i = 0; i < nSlow; i += 1) {
    const u = i / (nSlow - 1);
    groundTruth.push({
      x: 22 + u * 106, y: 146 - u * 108 + Math.sin(u * Math.PI) * 12,
      timestampMs: roundDecimals(tMs, 2), pressure: clampNumber(0.06 + u * 0.62, 0.02, 0.95), tiltDeg: config.previewTiltDeg,
    });
    tMs += dtMs * 1.4;
  }
  for (let j = 1; j <= nArc; j += 1) {
    const u = j / nArc;
    groundTruth.push({
      x: 128 + u * 134, y: 38 + Math.pow(u, 0.85) * 98 - Math.sin(u * Math.PI) * 14,
      timestampMs: roundDecimals(tMs, 2), pressure: clampNumber(0.76 - u * 0.18, 0.1, 0.95), tiltDeg: config.previewTiltDeg,
    });
    tMs += dtMs * 0.85;
  }
  const tailStart = groundTruth[groundTruth.length - 1];
  const prevTail = groundTruth[groundTruth.length - 2];
  const tanLen = Math.max(1e-4, Math.hypot(tailStart.x - prevTail.x, tailStart.y - prevTail.y));
  const tx = (tailStart.x - prevTail.x) / tanLen;
  const ty = (tailStart.y - prevTail.y) / tanLen;
  for (let k = 1; k <= nTaper; k += 1) {
    const u = k / nTaper;
    groundTruth.push({
      x: tailStart.x + tx * u * 66, y: tailStart.y + ty * u * 66, timestampMs: roundDecimals(tMs, 2),
      pressure: clampNumber(0.56 * Math.pow(1 - u, 1.45), 0.01, 0.9), tiltDeg: config.previewTiltDeg,
    });
    tMs += dtMs * 0.72;
  }

  for (let i = 0; i < groundTruth.length; i += 1) {
    const gt = groundTruth[i];
    const fade = i === 0 ? 0.15 : i === cuspIndex ? 0.25 : 1.0;
    const sA = Math.sin(i * 12.9898 + 1.37) * 43758.5453;
    const sB = Math.cos(i * 78.233 + 0.61) * 24634.6345;
    const nx = ((sA - Math.floor(sA)) * 2 - 1) * jitterAmp * 1.45 * fade;
    const ny = ((sB - Math.floor(sB)) * 2 - 1) * jitterAmp * 1.45 * fade;
    const wobble = Math.sin(i * 1.85) * jitterAmp * 0.65 * fade;
    noisyInput.push({
      x: roundDecimals(gt.x + nx + wobble * 0.4, 3), y: roundDecimals(gt.y + ny - wobble * 0.6, 3),
      timestampMs: gt.timestampMs, pressure: roundDecimals(gt.pressure, 4), tiltDeg: gt.tiltDeg,
    });
  }
  return { groundTruth, noisyInput, cuspIndex, fastArcRange: [cuspIndex + 4, taperStartIndex - 2], taperStartIndex };
}

function runSimpleEmaFilter(samples: readonly StylusRawSample[], alpha = 0.28): readonly { readonly x: number; readonly y: number }[] {
  if (samples.length === 0) return [];
  const pts: { readonly x: number; readonly y: number }[] = [{ x: samples[0].x, y: samples[0].y }];
  let x = samples[0].x, y = samples[0].y;
  for (let i = 1; i < samples.length; i += 1) {
    x = alpha * samples[i].x + (1 - alpha) * x; y = alpha * samples[i].y + (1 - alpha) * y;
    pts.push({ x: roundDecimals(x, 3), y: roundDecimals(y, 3) });
  }
  return pts;
}

function measureMethodMetrics(params: {
  readonly methodId: "raw" | "simple-ema" | "toonstudio-hybrid"; readonly labelKo: string; readonly labelEn: string;
  readonly points: readonly { readonly x: number; readonly y: number }[]; readonly groundTruth: readonly StylusRawSample[];
  readonly cuspIndex: number; readonly fastArcRange: readonly [number, number];
  readonly taperStartIndex: number; readonly extraLeadMs: number; readonly pipelineLatencyMs: number;
}): PipelineBenchmarkMetrics {
  const { points, groundTruth, cuspIndex, fastArcRange, taperStartIndex } = params;
  const n = Math.min(points.length, groundTruth.length);
  let sqSum = 0;
  for (let i = 0; i < n; i += 1) { const dx = points[i].x - groundTruth[i].x, dy = points[i].y - groundTruth[i].y; sqSum += dx * dx + dy * dy; }
  const rmsePx = Math.sqrt(sqSum / Math.max(1, n));

  const gtApex = groundTruth[cuspIndex];
  let minApexDist = Number.POSITIVE_INFINITY;
  for (let i = Math.max(0, cuspIndex - 2); i <= Math.min(n - 1, cuspIndex + 2); i += 1) {
    minApexDist = Math.min(minApexDist, Math.hypot(points[i].x - gtApex.x, points[i].y - gtApex.y));
  }
  const angleOf = (arr: readonly { readonly x: number; readonly y: number }[]): number => {
    const ix = arr[cuspIndex].x - arr[cuspIndex - 3].x, iy = arr[cuspIndex].y - arr[cuspIndex - 3].y;
    const ox = arr[cuspIndex + 3].x - arr[cuspIndex].x, oy = arr[cuspIndex + 3].y - arr[cuspIndex].y;
    return Math.acos(clampNumber((ix * ox + iy * oy) / Math.max(1e-5, Math.hypot(ix, iy) * Math.hypot(ox, oy)), -1, 1));
  };
  const gtAngle = angleOf(groundTruth);
  const cornerPreservationPct = clampNumber(100 - minApexDist * 4.2 - (Math.abs(gtAngle - angleOf(points)) / Math.max(0.2, gtAngle)) * 38, 0, 100);

  let lagSum = 0, lagCount = 0;
  for (let i = fastArcRange[0]; i <= fastArcRange[1] && i < n - 1; i += 1) {
    const dtSec = Math.max(0.001, (groundTruth[i + 1].timestampMs - groundTruth[i - 1].timestampMs) / 1000);
    const vx = (groundTruth[i + 1].x - groundTruth[i - 1].x) / dtSec, vy = (groundTruth[i + 1].y - groundTruth[i - 1].y) / dtSec;
    const vMag = Math.hypot(vx, vy);
    if (vMag < 20) continue;
    lagSum += (((groundTruth[i].x - points[i].x) * vx + (groundTruth[i].y - points[i].y) * vy) / (vMag * vMag)) * 1000;
    lagCount += 1;
  }
  const residualLagMs = Math.max(0, params.pipelineLatencyMs + (lagCount > 0 ? lagSum / lagCount : 0) - params.extraLeadMs);
  const effectiveLatencyCompMs = params.pipelineLatencyMs - residualLagMs;

  const tailStart = groundTruth[taperStartIndex], tailEnd = groundTruth[n - 1];
  const tailLen = Math.max(1, Math.hypot(tailEnd.x - tailStart.x, tailEnd.y - tailStart.y));
  const ux = (tailEnd.x - tailStart.x) / tailLen, uy = (tailEnd.y - tailStart.y) / tailLen;
  let latSum = 0;
  for (let i = taperStartIndex; i < n; i += 1) latSum += Math.abs((points[i].x - tailStart.x) * uy - (points[i].y - tailStart.y) * ux);
  const releaseTaperSharpness = clampNumber(
    100 - (latSum / Math.max(1, n - taperStartIndex)) * 16 - Math.hypot(points[n - 1].x - tailEnd.x, points[n - 1].y - tailEnd.y) * 3.8,
    0, 100,
  );
  return {
    methodId: params.methodId, labelKo: params.labelKo, labelEn: params.labelEn, rmsePx: roundDecimals(rmsePx, 2),
    cornerPreservationPct: roundDecimals(cornerPreservationPct, 1), residualLagMs: roundDecimals(residualLagMs, 2),
    effectiveLatencyCompMs: roundDecimals(effectiveLatencyCompMs, 2), releaseTaperSharpness: roundDecimals(releaseTaperSharpness, 1),
  };
}

/** 동일 합성 획에서 원시 입력, EMA, 하이브리드 보정 결과를 비교한다. */
export function benchmarkStrokeCompensation(config: StylusCompensationConfig): StrokeBenchmarkReport {
  const digitizer = getDigitizerProfile(config.digitizerId);
  const curvePreset = getPressureCurvePreset(config.curvePresetId);
  const synthetic = generateSyntheticBenchmarkStroke(config);
  const simpleEmaPoints = runSimpleEmaFilter(synthetic.noisyInput, 0.28);
  const hybridResult = compensateStylusStroke(synthetic.noisyInput, config);
  const base = {
    groundTruth: synthetic.groundTruth, cuspIndex: synthetic.cuspIndex, fastArcRange: synthetic.fastArcRange,
    taperStartIndex: synthetic.taperStartIndex, pipelineLatencyMs: digitizer.pipelineLatencyMs,
  };
  const rawM = measureMethodMetrics({ ...base, methodId: "raw", labelKo: "원시 입력 (무보정)", labelEn: "Raw Input (Unfiltered)", points: synthetic.noisyInput, extraLeadMs: 0 });
  const emaM = measureMethodMetrics({ ...base, methodId: "simple-ema", labelKo: "단순 EMA (α=0.28)", labelEn: "Simple EMA (α=0.28)", points: simpleEmaPoints, extraLeadMs: 0 });
  const hybM = measureMethodMetrics({
    ...base, methodId: "toonstudio-hybrid", labelKo: "ToonStudio One-Euro + Micro-MLP", labelEn: "ToonStudio One-Euro + Micro-MLP",
    points: hybridResult.samples.map((s) => ({ x: s.compensatedX, y: s.compensatedY })), extraLeadMs: hybridResult.meanLookAheadMs,
  });
  return {
    inferenceKind: MICRO_MLP_INFERENCE_KIND, digitizer, curvePreset, synthetic, simpleEmaPoints, hybridResult,
    metrics: [rawM, emaM, hybM],
    rmseReductionVsRawPct: rawM.rmsePx > 0 ? roundDecimals(((rawM.rmsePx - hybM.rmsePx) / rawM.rmsePx) * 100, 1) : 0,
    rmseReductionVsEmaPct: emaM.rmsePx > 0 ? roundDecimals(((emaM.rmsePx - hybM.rmsePx) / emaM.rmsePx) * 100, 1) : 0,
    cornerGainVsEmaPct: roundDecimals(hybM.cornerPreservationPct - emaM.cornerPreservationPct, 1),
  };
}

/** 스타일러스 곡선 설정과 합성 획 비교 결과를 JSON으로 직렬화한다. */
export function exportStylusCompensationJson(config: StylusCompensationConfig): StylusCompensationExportBundle {
  const digitizer = getDigitizerProfile(config.digitizerId);
  const curvePreset = getPressureCurvePreset(config.curvePresetId);
  const curveAudit = auditPchipPressureCurve(config, 65);
  const benchmark = benchmarkStrokeCompensation(config);
  const manifest: StylusCompensationExportManifest = {
    schemaVersion: STYLUS_COMPENSATION_SCHEMA_VERSION, inferenceKind: MICRO_MLP_INFERENCE_KIND, benchmarkScope: "synthetic-stroke",
    pressureResolutionLevels: PRESSURE_LEVEL_COUNT_14BIT, digitizer, curvePreset, config,
    curveAudit: { isStrictlyMonotonic: curveAudit.isStrictlyMonotonic, maxOvershoot: curveAudit.maxOvershoot, hysteresisPeakDelta: curveAudit.hysteresisPeakDelta },
    benchmarkSummary: benchmark.metrics,
    honestyNoteKo:
      "현재 구현(Current): 합성 획을 고정 가중치 CPU 모형과 압력 곡선으로 계산합니다. 지연은 기기 예제의 가정값을 넣어 추정합니다.",
    honestyNoteEn:
      "Current: Applies a fixed-weight CPU model and pressure curve to a synthetic stroke. Latency estimates use the selected device example's assumptions.",
  };
  return { manifest, json: JSON.stringify(manifest, null, 2) };
}
