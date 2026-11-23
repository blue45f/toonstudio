/**
 * 4분할 디바이스 색역·색각이상(ΔE2000) 교정 캘리브레이터,
 * 100% 온디바이스 작가 필압·손떨림 자동 보정기,
 * 5단계 작업 상태 감지 컨텍스트 퀵런처 엔진.
 * 네트워크 전송 0바이트 · 메모리 전용 연산(브라우저 영속 저장소 미사용).
 */

export type CvdSimulationMode = "protanopia" | "deuteranopia" | "tritanopia";
export type DeviceProofTarget =
  | "iphone-display-p3" | "android-oled-vivid" | "print-cmyk-fogra39"
  | "cvd-protanopia" | "cvd-deuteranopia" | "cvd-tritanopia";
export type ProofSeverity = "safe" | "caution" | "critical";
export type WriterHandArchetype = "light-touch" | "balanced" | "heavy-press";
export type HandTremorLevel = "steady" | "moderate" | "shaky";
export type DemoPenProfilePreset = "light-shaky" | "balanced-steady" | "heavy-fast";
export type WorkflowPhaseId = "sketch" | "lineart" | "coloring" | "lettering" | "finishing";

export interface ColorProofBufferInput { readonly width: number; readonly height: number; readonly rgba: Uint8ClampedArray; }
export interface DeviceColorProofOptions { readonly highlightOutOfGamut?: boolean; readonly outOfGamutDeltaEThreshold?: number; }
export interface PressureCurvePoint { readonly input: number; readonly output: number; }

export interface DeviceColorProofResult {
  readonly target: DeviceProofTarget;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly meanDeltaE2000: number;
  readonly p95DeltaE2000: number;
  readonly maxDeltaE2000: number;
  readonly outOfGamutPixelCount: number;
  readonly outOfGamutRatio01: number;
  readonly gamutWarningMask: Uint8Array;
  readonly maxInkCoveragePct: number;
  readonly severity: ProofSeverity;
}

export interface FourWayColorProofBundle {
  readonly cvdMode: CvdSimulationMode;
  readonly iphoneDisplayP3: DeviceColorProofResult;
  readonly androidOledVivid: DeviceColorProofResult;
  readonly printCmykFogra39: DeviceColorProofResult;
  readonly cvdProof: DeviceColorProofResult;
  readonly worstTarget: DeviceProofTarget;
  readonly worstMeanDeltaE2000: number;
}

export interface PaletteColorSwatch {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly role?: "skin" | "lineart" | "highlight" | "shadow" | "accent" | "background";
}

export interface SwatchGamutAuditEntry {
  readonly swatchId: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly cmykDeltaE2000: number;
  readonly cmykOutOfGamut: boolean;
  readonly cmykInkCoveragePct: number;
  readonly p3DeltaE2000: number;
  readonly oledDeltaE2000: number;
  readonly recommendedPrintSafeRgb: readonly [number, number, number];
}

export interface CvdConfusablePair {
  readonly mode: CvdSimulationMode;
  readonly swatchAId: string;
  readonly swatchBId: string;
  readonly originalDeltaE2000: number;
  readonly simulatedDeltaE2000: number;
}

export interface PaletteGamutCvdAuditResult {
  readonly swatches: readonly SwatchGamutAuditEntry[];
  readonly cvdConfusablePairs: readonly CvdConfusablePair[];
  readonly cmykOutOfGamutCount: number;
  readonly cvdCollisionCount: number;
  readonly overallScore0To100: number;
  readonly status: "pass" | "warn" | "fail";
}

export interface PenCalibrationStrokeSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly timestampMs: number;
  readonly tiltXDeg?: number;
  readonly tiltYDeg?: number;
  readonly strokeId?: string;
}

export interface PersonalPenCalibrationProfile {
  readonly networkTransmissionBytes: 0;
  readonly storagePersistence: "in-memory-only";
  readonly sampleCount: number;
  readonly optimalPressureGamma: number;
  readonly stabilizationWindowPx: number;
  readonly startTaperRatio01: number;
  readonly endTaperRatio01: number;
  readonly medianPressure01: number;
  readonly p10Pressure01: number;
  readonly p90Pressure01: number;
  readonly meanVelocityPxPerSec: number;
  readonly curvatureJitterIndex01: number;
  readonly handArchetype: WriterHandArchetype;
  readonly tremorLevel: HandTremorLevel;
  readonly confidence01: number;
  readonly curvePreviewPoints: readonly PressureCurvePoint[];
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface CanvasWorkflowSnapshot {
  readonly sketchLayerCount: number;
  readonly sketchStrokeCount: number;
  readonly inkLayerCount: number;
  readonly inkStrokeCount: number;
  readonly flatColorLayerCount: number;
  readonly colorCoverageRatio01: number;
  readonly shadingLayerCount: number;
  readonly fxLayerCount: number;
  readonly speechBubbleCount: number;
  readonly emptySpeechBubbleCount: number;
  readonly sfxLayerCount: number;
  readonly preflightChecked: boolean;
  readonly gamutProofed: boolean;
  readonly exportReady: boolean;
}

export interface QuickLauncherAction {
  readonly id: string;
  readonly targetToolId: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly hintKo: string;
  readonly hintEn: string;
  readonly shortcut: string;
  readonly priority: 1 | 2 | 3;
}

export interface WorkflowPhaseDetectionResult {
  readonly phase: WorkflowPhaseId;
  readonly phaseLabelKo: string;
  readonly phaseLabelEn: string;
  readonly completionRatio01: number;
  readonly confidence01: number;
  readonly reasonKo: string;
  readonly reasonEn: string;
  readonly nextActions: readonly [QuickLauncherAction, QuickLauncherAction, QuickLauncherAction];
}

type RgbTriplet = readonly [number, number, number];
type Mat3 = readonly (readonly [number, number, number])[];

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const POW_25_7 = 6_103_515_625;
const FOGRA39_TAC_LIMIT_PCT = 300;
const TARGET_MID_PRESSURE = 0.52;
const MIN_GAMMA = 0.55;
const MAX_GAMMA = 1.65;
const MAX_STAB_PX = 18;

/** Viénot(1999) / Brettel(1997) 선형 sRGB ↔ LMS 변환 행렬 (D65 Hunt-Pointer-Estevez). */
const RGB_TO_LMS: Mat3 = [
  [0.31399022, 0.63951294, 0.04649755],
  [0.15537241, 0.75789446, 0.08670142],
  [0.01775239, 0.10944209, 0.87256922],
];
const LMS_TO_RGB: Mat3 = [
  [5.47221206, -4.6419601, 0.16963708],
  [-1.1252419, 2.29317094, -0.1678952],
  [0.02980165, -0.19318073, 1.16364789],
];

const clamp = (v: number, min: number, max: number): number => (!Number.isFinite(v) ? min : v < min ? min : v > max ? max : v);
const roundTo = (v: number, d: number): number => Math.round(v * 10 ** d) / 10 ** d;
const srgbToLinear = (byteVal: number): number => {
  const c = clamp(byteVal / 255, 0, 1);
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const linearToSrgb = (linVal: number): number => {
  const c = clamp(linVal, 0, 1);
  return Math.round(clamp(c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055, 0, 1) * 255);
};

function mulMat3(m: Mat3, r: number, g: number, b: number): RgbTriplet {
  const r0 = m[0] ?? [1, 0, 0]; const r1 = m[1] ?? [0, 1, 0]; const r2 = m[2] ?? [0, 0, 1];
  return [r0[0] * r + r0[1] * g + r0[2] * b, r1[0] * r + r1[1] * g + r1[2] * b, r2[0] * r + r2[1] * g + r2[2] * b];
}

function srgbToLab(rByte: number, gByte: number, bByte: number): RgbTriplet {
  const rl = srgbToLinear(rByte); const gl = srgbToLinear(gByte); const bl = srgbToLinear(bByte);
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f((0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / 0.95047);
  const fy = f(0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl);
  const fz = f((0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Sharma-Wu-Dalal(2005) CIE ΔE2000 색차 공식. */
export function computeDeltaE2000(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  if (r1 === r2 && g1 === g2 && b1 === b2) return 0;
  const [l1, a1, bb1] = srgbToLab(r1, g1, b1);
  const [l2, a2, bb2] = srgbToLab(r2, g2, b2);
  const cBar7 = ((Math.hypot(a1, bb1) + Math.hypot(a2, bb2)) * 0.5) ** 7;
  const gFactor = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + POW_25_7)));
  const a1p = (1 + gFactor) * a1; const a2p = (1 + gFactor) * a2;
  const c1p = Math.hypot(a1p, bb1); const c2p = Math.hypot(a2p, bb2);
  const hue = (ap: number, bp: number): number => (ap === 0 && bp === 0 ? 0 : (Math.atan2(bp, ap) * RAD_TO_DEG + 360) % 360);
  const h1p = hue(a1p, bb1); const h2p = hue(a2p, bb2);
  const dLp = l2 - l1; const dCp = c2p - c1p;
  let dHpDeg = 0;
  if (c1p * c2p !== 0) {
    const diff = h2p - h1p;
    dHpDeg = Math.abs(diff) <= 180 ? diff : diff > 180 ? diff - 360 : diff + 360;
  }
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin(dHpDeg * 0.5 * DEG_TO_RAD);
  const lBarP = (l1 + l2) * 0.5; const cBarP = (c1p + c2p) * 0.5;
  let hBarP = h1p + h2p;
  if (c1p * c2p !== 0) {
    hBarP = Math.abs(h1p - h2p) <= 180 ? hBarP * 0.5 : (hBarP < 360 ? hBarP + 360 : hBarP - 360) * 0.5;
  }
  const t =
    1 - 0.17 * Math.cos((hBarP - 30) * DEG_TO_RAD) + 0.24 * Math.cos(2 * hBarP * DEG_TO_RAD) +
    0.32 * Math.cos((3 * hBarP + 6) * DEG_TO_RAD) - 0.2 * Math.cos((4 * hBarP - 63) * DEG_TO_RAD);
  const lTerm = (lBarP - 50) ** 2;
  const sl = 1 + (0.015 * lTerm) / Math.sqrt(20 + lTerm);
  const sc = 1 + 0.045 * cBarP; const sh = 1 + 0.015 * cBarP * t;
  const cBarP7 = cBarP ** 7;
  const rt = -Math.sin(60 * Math.exp(-(((hBarP - 275) / 25) ** 2)) * DEG_TO_RAD) * 2 * Math.sqrt(cBarP7 / (cBarP7 + POW_25_7));
  const dl = dLp / sl; const dc = dCp / sc; const dh = dHp / sh;
  return Math.sqrt(dl * dl + dc * dc + dh * dh + rt * dc * dh);
}

function transformPixelForTarget(
  rByte: number, gByte: number, bByte: number, target: DeviceProofTarget,
): { readonly rgb: RgbTriplet; readonly outOfGamut: boolean; readonly inkCoveragePct: number } {
  const rl = srgbToLinear(rByte); const gl = srgbToLinear(gByte); const bl = srgbToLinear(bByte);

  if (target === "iphone-display-p3") {
    const luma = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
    const maxCh = Math.max(rl, gl, bl);
    return {
      rgb: [
        linearToSrgb(clamp(luma + (rl - luma) * 1.11 + 0.012 * (rl - bl), 0, 1)),
        linearToSrgb(clamp(luma + (gl - luma) * 1.07, 0, 1)),
        linearToSrgb(clamp(luma + (bl - luma) * 1.09, 0, 1)),
      ],
      outOfGamut: maxCh - Math.min(rl, gl, bl) > 0.88 && maxCh > 0.92,
      inkCoveragePct: 0,
    };
  }

  if (target === "android-oled-vivid") {
    const luma = 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
    const vivid = (ch: number, gain: number): number => clamp(clamp(luma + (ch - luma) * gain, 0, 1) ** 1.05 * 1.03, 0, 1);
    const clipped = luma + (rl - luma) * 1.24 > 1.01 || luma + (gl - luma) * 1.22 > 1.01 || luma + (bl - luma) * 1.28 > 1.01;
    return { rgb: [linearToSrgb(vivid(rl, 1.24)), linearToSrgb(vivid(gl, 1.22)), linearToSrgb(vivid(bl, 1.28))], outOfGamut: clipped, inkCoveragePct: 0 };
  }

  if (target === "print-cmyk-fogra39") {
    const rs = clamp(rByte / 255, 0, 1); const gs = clamp(gByte / 255, 0, 1); const bs = clamp(bByte / 255, 0, 1);
    let c = 1 - rs; let m = 1 - gs; let y = 1 - bs;
    const kRaw = Math.min(c, m, y); const k = clamp(kRaw * 0.88, 0, 0.94); const denom = 1 - kRaw;
    if (denom > 1e-6) { c = clamp((c - k * 0.9) / denom, 0, 1); m = clamp((m - k * 0.9) / denom, 0, 1); y = clamp((y - k * 0.9) / denom, 0, 1); }
    else { c = 0; m = 0; y = 0; }
    const rawTac = (c + m + y + k) * 100;
    if (rawTac > FOGRA39_TAC_LIMIT_PCT) { const s = FOGRA39_TAC_LIMIT_PCT / rawTac; c *= s; m *= s; y *= s; }
    const tacPct = Math.min(FOGRA39_TAC_LIMIT_PCT, (c + m + y + k) * 100);
    const dg = (ink: number): number => clamp(ink + 0.12 * ink * (1 - ink), 0, 1);
    const cg = dg(c); const mg = dg(m); const yg = dg(y); const kg = dg(k);
    const outR = Math.round(clamp(0.965 * (1 - cg * 0.86 - mg * 0.08 - yg * 0.02) * (1 - kg * 0.91) + 0.045 * kg, 0.05, 0.97) * 255);
    const outG = Math.round(clamp(0.96 * (1 - cg * 0.16 - mg * 0.78 - yg * 0.08) * (1 - kg * 0.91) + 0.042 * kg, 0.045, 0.965) * 255);
    const outB = Math.round(clamp(0.945 * (1 - cg * 0.07 - mg * 0.24 - yg * 0.84) * (1 - kg * 0.9) + 0.048 * kg, 0.05, 0.95) * 255);
    const maxCh = Math.max(rs, gs, bs);
    const sat = maxCh > 1e-4 ? (maxCh - Math.min(rs, gs, bs)) / maxCh : 0;
    return { rgb: [outR, outG, outB], outOfGamut: computeDeltaE2000(rByte, gByte, bByte, outR, outG, outB) >= 5.5 && sat >= 0.42, inkCoveragePct: roundTo(tacPct, 1) };
  }

  // 색각이상 3종: Viénot(1999) · Brettel(1997) LMS 투영 (무채색 D65 불변)
  const [l, m, s] = mulMat3(RGB_TO_LMS, rl, gl, bl);
  let simL = l; let simM = m; let simS = s;
  if (target === "cvd-protanopia") simL = 1.05118294 * m - 0.05116099 * s;
  else if (target === "cvd-deuteranopia") simM = 0.9513092 * l + 0.04866992 * s;
  else {
    const ratio = m > 1e-6 ? l / m : 1;
    simS = clamp(
      ratio >= 1
        ? -0.395913 * l + 0.801109 * m + 0.594804 * Math.min(l, m)
        : -0.012245 * l + 0.072035 * m + 0.94021 * Math.min(l, m),
      0, 1.2,
    );
  }
  const [sr, sg, sb] = mulMat3(LMS_TO_RGB, simL, simM, simS);
  const outR = linearToSrgb(sr); const outG = linearToSrgb(sg); const outB = linearToSrgb(sb);
  return { rgb: [outR, outG, outB], outOfGamut: computeDeltaE2000(rByte, gByte, bByte, outR, outG, outB) >= 10, inkCoveragePct: 0 };
}

/** 4분할 디바이스 색역 또는 색각이상 RGBA 시뮬레이션 및 ΔE2000 · 색역 이탈 비율 산출. */
export function simulateDeviceColorProof(
  input: ColorProofBufferInput, target: DeviceProofTarget, options: DeviceColorProofOptions = {},
): DeviceColorProofResult {
  const pixelCount = Math.max(0, input.width * input.height);
  const outRgba = new Uint8ClampedArray(pixelCount * 4);
  const warningMask = new Uint8Array(pixelCount);
  const threshold = options.outOfGamutDeltaEThreshold ?? (target === "print-cmyk-fogra39" ? 5.5 : 10);
  const deltaEs: number[] = [];
  let sumDe = 0; let maxDe = 0; let oogCount = 0; let maxInk = 0;

  for (let p = 0; p < pixelCount; p += 1) {
    const idx = p * 4;
    const r = input.rgba[idx] ?? 0; const g = input.rgba[idx + 1] ?? 0; const b = input.rgba[idx + 2] ?? 0; const a = input.rgba[idx + 3] ?? 255;
    if (a === 0) { outRgba[idx] = 0; outRgba[idx + 1] = 0; outRgba[idx + 2] = 0; outRgba[idx + 3] = 0; continue; }
    const res = transformPixelForTarget(r, g, b, target);
    const de = computeDeltaE2000(r, g, b, res.rgb[0], res.rgb[1], res.rgb[2]);
    deltaEs.push(de); sumDe += de;
    if (de > maxDe) maxDe = de;
    if (res.inkCoveragePct > maxInk) maxInk = res.inkCoveragePct;
    const flagged = res.outOfGamut || de >= threshold;
    if (flagged) { oogCount += 1; warningMask[p] = 1; }
    if (flagged && options.highlightOutOfGamut) {
      outRgba[idx] = Math.min(255, Math.round(res.rgb[0] * 0.45 + 140));
      outRgba[idx + 1] = Math.round(res.rgb[1] * 0.35 + 48);
      outRgba[idx + 2] = Math.round(res.rgb[2] * 0.35 + 24);
    } else {
      outRgba[idx] = res.rgb[0]; outRgba[idx + 1] = res.rgb[1]; outRgba[idx + 2] = res.rgb[2];
    }
    outRgba[idx + 3] = a;
  }

  const active = Math.max(1, deltaEs.length);
  const meanDeltaE2000 = roundTo(sumDe / active, 2);
  const sorted = [...deltaEs].sort((x, y) => x - y);
  const p95DeltaE2000 = roundTo(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0, 2);
  const outOfGamutRatio01 = roundTo(oogCount / active, 4);
  const severity: ProofSeverity = outOfGamutRatio01 >= 0.25 || meanDeltaE2000 >= 11 ? "critical" : outOfGamutRatio01 >= 0.08 || meanDeltaE2000 >= 4.5 ? "caution" : "safe";
  return {
    target, width: input.width, height: input.height, rgba: outRgba, meanDeltaE2000, p95DeltaE2000,
    maxDeltaE2000: roundTo(maxDe, 2), outOfGamutPixelCount: oogCount, outOfGamutRatio01,
    gamutWarningMask: warningMask, maxInkCoveragePct: roundTo(maxInk, 1), severity,
  };
}

/** iPhone Display-P3 · Android OLED · 인쇄 CMYK FOGRA39 · 색각이상 4분할 동시 교정 번들 생성. */
export function buildFourWayColorProofBundle(
  input: ColorProofBufferInput, cvdMode: CvdSimulationMode = "deuteranopia", options: DeviceColorProofOptions = {},
): FourWayColorProofBundle {
  const cvdTarget: DeviceProofTarget = cvdMode === "protanopia" ? "cvd-protanopia" : cvdMode === "tritanopia" ? "cvd-tritanopia" : "cvd-deuteranopia";
  const iphoneDisplayP3 = simulateDeviceColorProof(input, "iphone-display-p3", options);
  const androidOledVivid = simulateDeviceColorProof(input, "android-oled-vivid", options);
  const printCmykFogra39 = simulateDeviceColorProof(input, "print-cmyk-fogra39", options);
  const cvdProof = simulateDeviceColorProof(input, cvdTarget, options);
  const worst = [iphoneDisplayP3, androidOledVivid, printCmykFogra39, cvdProof].reduce((a, b) => (b.meanDeltaE2000 > a.meanDeltaE2000 ? b : a));
  return { cvdMode, iphoneDisplayP3, androidOledVivid, printCmykFogra39, cvdProof, worstTarget: worst.target, worstMeanDeltaE2000: worst.meanDeltaE2000 };
}

/** 작품 핵심 팔레트 스와치의 CMYK 색역 이탈 및 색각이상 3종 혼동 쌍 정량 감사. */
export function auditPaletteGamutAndCvd(palette: readonly PaletteColorSwatch[]): PaletteGamutCvdAuditResult {
  const swatches: SwatchGamutAuditEntry[] = palette.map((sw) => {
    const cmyk = transformPixelForTarget(sw.r, sw.g, sw.b, "print-cmyk-fogra39");
    const p3 = transformPixelForTarget(sw.r, sw.g, sw.b, "iphone-display-p3");
    const oled = transformPixelForTarget(sw.r, sw.g, sw.b, "android-oled-vivid");
    const cmykDeltaE = computeDeltaE2000(sw.r, sw.g, sw.b, cmyk.rgb[0], cmyk.rgb[1], cmyk.rgb[2]);
    return {
      swatchId: sw.id, labelKo: sw.labelKo, labelEn: sw.labelEn,
      cmykDeltaE2000: roundTo(cmykDeltaE, 2), cmykOutOfGamut: cmyk.outOfGamut || cmykDeltaE >= 5.5,
      cmykInkCoveragePct: cmyk.inkCoveragePct,
      p3DeltaE2000: roundTo(computeDeltaE2000(sw.r, sw.g, sw.b, p3.rgb[0], p3.rgb[1], p3.rgb[2]), 2),
      oledDeltaE2000: roundTo(computeDeltaE2000(sw.r, sw.g, sw.b, oled.rgb[0], oled.rgb[1], oled.rgb[2]), 2),
      recommendedPrintSafeRgb: cmyk.rgb,
    };
  });

  const modes: readonly (readonly [CvdSimulationMode, DeviceProofTarget])[] = [
    ["protanopia", "cvd-protanopia"], ["deuteranopia", "cvd-deuteranopia"], ["tritanopia", "cvd-tritanopia"],
  ];
  const cvdConfusablePairs: CvdConfusablePair[] = [];
  for (const [mode, target] of modes) {
    const proj = palette.map((sw) => transformPixelForTarget(sw.r, sw.g, sw.b, target).rgb);
    for (let i = 0; i < palette.length; i += 1) {
      for (let j = i + 1; j < palette.length; j += 1) {
        const a = palette[i]; const b = palette[j]; const pa = proj[i]; const pb = proj[j];
        if (!a || !b || !pa || !pb) continue;
        const origDe = computeDeltaE2000(a.r, a.g, a.b, b.r, b.g, b.b);
        if (origDe < 12) continue;
        const simDe = computeDeltaE2000(pa[0], pa[1], pa[2], pb[0], pb[1], pb[2]);
        if (simDe < 6.5) cvdConfusablePairs.push({ mode, swatchAId: a.id, swatchBId: b.id, originalDeltaE2000: roundTo(origDe, 2), simulatedDeltaE2000: roundTo(simDe, 2) });
      }
    }
  }
  const cmykOutOfGamutCount = swatches.filter((s) => s.cmykOutOfGamut).length;
  const cvdCollisionCount = cvdConfusablePairs.length;
  const overallScore0To100 = Math.round(clamp(100 - (cmykOutOfGamutCount / Math.max(1, swatches.length)) * 42 - Math.min(48, cvdCollisionCount * 14), 0, 100));
  return { swatches, cvdConfusablePairs, cmykOutOfGamutCount, cvdCollisionCount, overallScore0To100, status: overallScore0To100 >= 80 ? "pass" : overallScore0To100 >= 55 ? "warn" : "fail" };
}

/** 실전 웹툰 피부톤·선화·배경·형광 이펙트 혼합 프리뷰 버퍼 생성. */
export function createDemoWebtoonColorProofBuffer(width = 64, height = 40): ColorProofBufferInput {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      const nx = x / Math.max(1, width - 1); const ny = y / Math.max(1, height - 1);
      let r = 242; let g = 212; let b = 188;
      if (nx < 0.28) { r = Math.round(36 + ny * 28); g = Math.round(52 + ny * 36); b = Math.round(88 + ny * 50); }
      else if (nx > 0.72 && ny < 0.55) { r = 12; g = 244; b = 250; }
      else if (nx > 0.72) { r = 250; g = 22; b = 188; }
      else if (nx >= 0.48 && nx <= 0.54 && ny > 0.25 && ny < 0.85) { r = ny < 0.55 ? 214 : 62; g = ny < 0.55 ? 64 : 168; b = 58; }
      if (x === 1 || x === width - 2 || y === 1 || y === height - 2) { r = 32; g = 28; b = 36; }
      rgba[idx] = r; rgba[idx + 1] = g; rgba[idx + 2] = b; rgba[idx + 3] = 255;
    }
  }
  return { width, height, rgba };
}

export const DEFAULT_DEMO_WEBTOON_PALETTE: readonly PaletteColorSwatch[] = [
  { id: "skin-base", labelKo: "인물 피부", labelEn: "Hero Skin", r: 242, g: 206, b: 184, role: "skin" },
  { id: "ink-line", labelKo: "펜선 잉크", labelEn: "Ink Line", r: 34, g: 30, b: 38, role: "lineart" },
  { id: "alert-crimson", labelKo: "경고 크림슨", labelEn: "Alert Crimson", r: 204, g: 76, b: 56, role: "accent" },
  { id: "moss-green", labelKo: "이끼 그린", labelEn: "Moss Green", r: 108, g: 138, b: 54, role: "background" },
  { id: "neon-cyan-fx", labelKo: "형광 시안 FX", labelEn: "Neon Cyan FX", r: 10, g: 246, b: 252, role: "highlight" },
  { id: "neon-magenta-fx", labelKo: "네온 마젠타 FX", labelEn: "Neon Magenta FX", r: 252, g: 20, b: 196, role: "accent" },
];

/** 보정된 필압 감마 곡선을 단일 입력 필압(0..1)에 적용한다. */
export function applyCalibratedPressure(rawPressure01: number, gamma: number): number {
  return roundTo(clamp(rawPressure01, 0, 1) ** clamp(gamma, MIN_GAMMA, MAX_GAMMA), 4);
}

/** 100% 온디바이스 작가 필압·속도·곡률 지터 자동 보정기 (서버 전송 0B). */
export function calibratePersonalPenProfile(samples: readonly PenCalibrationStrokeSample[]): PersonalPenCalibrationProfile {
  const valid = samples.filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.pressure));
  if (valid.length < 3) {
    return {
      networkTransmissionBytes: 0, storagePersistence: "in-memory-only", sampleCount: valid.length,
      optimalPressureGamma: 1.0, stabilizationWindowPx: 4, startTaperRatio01: 0.16, endTaperRatio01: 0.22,
      medianPressure01: 0.5, p10Pressure01: 0.25, p90Pressure01: 0.78, meanVelocityPxPerSec: 220,
      curvatureJitterIndex01: 0.12, handArchetype: "balanced", tremorLevel: "steady", confidence01: roundTo(valid.length / 12, 2),
      curvePreviewPoints: [0, 0.25, 0.5, 0.75, 1].map((input) => ({ input, output: applyCalibratedPressure(input, 1.0) })),
      summaryKo: "표본이 적어 중립 기본 필압(γ 1.00 · 안정화 4px)을 유지합니다.",
      summaryEn: "Few samples collected; keeping neutral defaults (γ 1.00 · 4px stabilizer).",
    };
  }

  const pressures = valid.map((s) => clamp(s.pressure, 0.02, 1)).sort((a, b) => a - b);
  const pct = (q: number): number => pressures[clamp(Math.floor((pressures.length - 1) * q), 0, pressures.length - 1)] ?? 0.5;
  const p10 = pct(0.1); const median = pct(0.5); const p90 = pct(0.9);
  const idealGamma = Math.log(TARGET_MID_PRESSURE) / Math.log(clamp(median, 0.12, 0.92));
  const rangeBias = p90 - p10 < 0.22 ? (median < 0.5 ? -0.06 : 0.08) : 0;
  const optimalPressureGamma = roundTo(clamp(0.75 * idealGamma + 0.25 + rangeBias, MIN_GAMMA, MAX_GAMMA), 2);

  let velSum = 0; let velCount = 0; let jitterSum = 0; let jitterCount = 0; let reversals = 0; let prevSign = 0;
  for (let i = 1; i < valid.length; i += 1) {
    const prev = valid[i - 1]; const curr = valid[i];
    if (!prev || !curr) continue;
    if (prev.strokeId && curr.strokeId && prev.strokeId !== curr.strokeId) { prevSign = 0; continue; }
    velSum += Math.hypot(curr.x - prev.x, curr.y - prev.y) / Math.max(0.004, (curr.timestampMs - prev.timestampMs) / 1000);
    velCount += 1;
    const next = valid[i + 1];
    if (!next || (curr.strokeId && next.strokeId && curr.strokeId !== next.strokeId)) continue;
    const cx = next.x - prev.x; const cy = next.y - prev.y; const chord = Math.hypot(cx, cy);
    if (chord > 0.5) {
      const cross = (curr.x - prev.x) * cy - (curr.y - prev.y) * cx;
      jitterSum += clamp((Math.abs(cross) / chord) / (chord * 0.45), 0, 1);
      jitterCount += 1;
      const sign = cross > 0.2 ? 1 : cross < -0.2 ? -1 : 0;
      if (sign !== 0 && prevSign !== 0 && sign !== prevSign) reversals += 1;
      if (sign !== 0) prevSign = sign;
    }
  }

  const meanVelocity = velCount > 0 ? velSum / velCount : 220;
  const curvatureJitterIndex01 = roundTo(clamp((jitterCount > 0 ? jitterSum / jitterCount : 0.08) * 0.65 + (jitterCount > 0 ? reversals / jitterCount : 0) * 0.35, 0, 1), 3);
  const stabilizationWindowPx = roundTo(clamp(curvatureJitterIndex01 * 22 * (meanVelocity < 170 ? 1.18 : meanVelocity > 520 ? 0.85 : 1), 0, MAX_STAB_PX), 1);
  const headLen = Math.max(2, Math.floor(valid.length * 0.18));
  const headDrop = Math.max(0, (valid[headLen - 1]?.pressure ?? median) - (valid[0]?.pressure ?? median));
  const tailDrop = Math.max(0, (valid[Math.max(0, valid.length - headLen)]?.pressure ?? median) - (valid[valid.length - 1]?.pressure ?? median));
  const startTaperRatio01 = roundTo(clamp(0.1 + headDrop * 0.45, 0.06, 0.45), 2);
  const endTaperRatio01 = roundTo(clamp(0.12 + tailDrop * 0.55 + (meanVelocity > 380 ? 0.08 : 0), 0.08, 0.55), 2);
  const handArchetype: WriterHandArchetype = median < 0.38 ? "light-touch" : median > 0.65 ? "heavy-press" : "balanced";
  const tremorLevel: HandTremorLevel = curvatureJitterIndex01 >= 0.42 ? "shaky" : curvatureJitterIndex01 >= 0.2 ? "moderate" : "steady";
  const medPct = Math.round(median * 100);
  const summaryKo =
    handArchetype === "light-touch"
      ? `가벼운 필압(중위 ${medPct}%)에 맞춰 γ ${optimalPressureGamma.toFixed(2)}로 감도를 높이고 안정화 ${stabilizationWindowPx.toFixed(1)}px를 적용했습니다.`
      : handArchetype === "heavy-press"
        ? `강한 필압(중위 ${medPct}%)의 선 굵기 뭉침을 막기 위해 γ ${optimalPressureGamma.toFixed(2)}로 완충하고 안정화 ${stabilizationWindowPx.toFixed(1)}px를 맞췄습니다.`
        : `균형 필압(중위 ${medPct}%) 기준으로 γ ${optimalPressureGamma.toFixed(2)} · 안정화 ${stabilizationWindowPx.toFixed(1)}px를 보정했습니다.`;
  const summaryEn =
    handArchetype === "light-touch"
      ? `Light touch (${medPct}% median) boosted with γ ${optimalPressureGamma.toFixed(2)} and ${stabilizationWindowPx.toFixed(1)}px stabilizer.`
      : handArchetype === "heavy-press"
        ? `Heavy press (${medPct}% median) cushioned with γ ${optimalPressureGamma.toFixed(2)} and ${stabilizationWindowPx.toFixed(1)}px stabilizer.`
        : `Balanced press (${medPct}% median) tuned to γ ${optimalPressureGamma.toFixed(2)} and ${stabilizationWindowPx.toFixed(1)}px stabilizer.`;

  return {
    networkTransmissionBytes: 0, storagePersistence: "in-memory-only", sampleCount: valid.length,
    optimalPressureGamma, stabilizationWindowPx, startTaperRatio01, endTaperRatio01,
    medianPressure01: roundTo(median, 3), p10Pressure01: roundTo(p10, 3), p90Pressure01: roundTo(p90, 3),
    meanVelocityPxPerSec: roundTo(meanVelocity, 1), curvatureJitterIndex01, handArchetype, tremorLevel,
    confidence01: roundTo(clamp(valid.length / 24, 0.25, 1), 2),
    curvePreviewPoints: [0, 0.25, 0.5, 0.75, 1].map((input) => ({ input, output: applyCalibratedPressure(input, optimalPressureGamma) })),
    summaryKo, summaryEn,
  };
}

/** 작가 손힘·손떨림 유형별 데모 테스트 스트로크 생성. */
export function createDemoCalibrationStrokes(preset: DemoPenProfilePreset, pointCount = 28): readonly PenCalibrationStrokeSample[] {
  const samples: PenCalibrationStrokeSample[] = [];
  for (let i = 0; i < pointCount; i += 1) {
    const t = i / Math.max(1, pointCount - 1);
    const env = Math.sin(t * Math.PI);
    if (preset === "light-shaky") {
      samples.push({ x: 16 + t * 180, y: 60 + Math.sin(t * Math.PI * 1.5) * 14 + (i % 2 === 0 ? 4.4 : -4.4), pressure: clamp(0.11 + env * 0.16, 0.05, 0.35), timestampMs: i * 42, strokeId: "demo-light-shaky" });
    } else if (preset === "heavy-fast") {
      samples.push({ x: 16 + t * 320, y: 62 + env * 18, pressure: clamp(0.55 + env * 0.38 - (t > 0.85 ? (t - 0.85) * 2.2 : 0), 0.18, 0.99), timestampMs: i * 16, strokeId: "demo-heavy-fast" });
    } else {
      samples.push({ x: 16 + t * 240, y: 60 + env * 16, pressure: clamp(0.24 + env * 0.34, 0.1, 0.72), timestampMs: i * 24, strokeId: "demo-balanced-steady" });
    }
  }
  return samples;
}

const mkAction = (
  id: string, targetToolId: string, titleKo: string, titleEn: string,
  hintKo: string, hintEn: string, shortcut: string, priority: 1 | 2 | 3,
): QuickLauncherAction => ({ id, targetToolId, titleKo, titleEn, hintKo, hintEn, shortcut, priority });

const PHASE_ACTIONS: Record<WorkflowPhaseId, readonly [QuickLauncherAction, QuickLauncherAction, QuickLauncherAction]> = {
  sketch: [
    mkAction("sketch-perspective", "perspective-ruler", "원근 가이드 켜기", "Perspective Ruler", "러프 구도와 소실점을 빠르게 잡습니다.", "Lock rough perspective and vanishing points.", "G", 1),
    mkAction("sketch-pencil", "sketch-pencil", "하늘색 러프 연필", "Blue Rough Pencil", "선화와 분리하기 쉬운 저채도 스케치 톤.", "Low-chroma pencil easy to ink over.", "P", 2),
    mkAction("sketch-to-ink", "new-vector-ink-layer", "선화 레이어 생성", "New Ink Layer", "스케치를 25%로 낮추고 펜선 단계로 전환.", "Dim rough to 25% and start vector ink.", "Shift+N", 3),
  ],
  lineart: [
    mkAction("lineart-gpen", "gpen-calibrated", "맞춤 G펜 · 손떨림 보정", "Calibrated G-Pen", "내 필압 감마와 안정화 윈도우를 즉시 적용.", "Apply personal pressure gamma and stabilizer.", "B", 1),
    mkAction("lineart-eraser", "vector-intersect-eraser", "교차점 벡터 지우개", "Intersection Eraser", "삐져나온 선 끝을 한 번에 정리합니다.", "Trim protruding line ends in one stroke.", "E", 2),
    mkAction("lineart-ref", "set-reference-layer", "참조 레이어 지정", "Mark as Reference", "틈새 닫기 밑색 채우기 경계를 고정합니다.", "Lock crisp boundary for gap-closing fill.", "R", 3),
  ],
  coloring: [
    mkAction("coloring-bucket", "gap-close-bucket", "틈새 닫기 밑색 채우기", "Gap-Close Flat Fill", "열린 선화 틈의 배경 누수를 자동 차단.", "Fill flats without leaking through small gaps.", "K", 1),
    mkAction("coloring-shadow", "clipped-multiply-layer", "클리핑 곱하기 명암", "Clipped Shadow Layer", "밑색 영역 안에서만 안전하게 그림자 채색.", "Paint shadows strictly inside flat colors.", "Ctrl+Alt+G", 2),
    mkAction("coloring-proof", "gamut-proof-toggle", "모바일·인쇄 색역 검수", "Device & Print Proof", "채색 중 OLED 클리핑과 CMYK 이탈 확인.", "Spot OLED clipping and CMYK shifts live.", "Ctrl+Y", 3),
  ],
  lettering: [
    mkAction("lettering-bubble", "smart-speech-bubble", "스마트 말풍선 배치", "Smart Speech Bubble", "360px 최소 가독 폰트 기준 여백 자동 설정.", "Auto-pad dialogue bubbles for 360px phones.", "T", 1),
    mkAction("lettering-sfx", "sfx-vector-stamp", "효과음(SFX) 레터링", "SFX Vector Lettering", "다국어 번역 분리가 쉬운 비파괴 SFX 레이어.", "Keep SFX editable for global localization.", "Shift+T", 2),
    mkAction("lettering-pacing", "reader-pacing-preview", "360px · 보이스 호흡 점검", "360px & Voice Check", "대사 길이와 다국어 말풍선 넘침 즉시 검사.", "Audit speech duration and bubble fit.", "M", 3),
  ],
  finishing: [
    mkAction("finishing-gamut", "gamut-cvd-final-audit", "4분할 색역 · 색각이상 검수", "4-Way Gamut & CVD Audit", "P3 · OLED · CMYK · 색각이상 3종 최종 점검.", "Verify P3, OLED, CMYK, and 3 CVD views.", "Shift+Y", 1),
    mkAction("finishing-scroll", "reader-scroll-simulator", "스크롤 · 클리프행어 점검", "Scroll & Cliffhanger Check", "360px/390px 호흡 여백과 가독성 최종 확인.", "Validate breath pauses and mobile legibility.", "Shift+M", 2),
    mkAction("finishing-export", "oneclick-platform-export", "연재 플랫폼 규격 출고", "Platform Spec Export", "권리 명세(Rights BOM)와 해상도 규격 패키징.", "Package episode with verified specs & Rights BOM.", "Ctrl+Shift+E", 3),
  ],
};

/** 현재 캔버스 레이어·요소 상태에서 작업 5단계를 감지하고 꼭 필요한 다음 도구 3개만 제안한다. */
export function detectWorkflowPhaseAndNextActions(snapshot: CanvasWorkflowSnapshot): WorkflowPhaseDetectionResult {
  const hasInk = snapshot.inkLayerCount > 0 && snapshot.inkStrokeCount >= 12;
  const hasColor = snapshot.flatColorLayerCount > 0 && snapshot.colorCoverageRatio01 >= 0.25;
  const hasShadingOrFx = snapshot.shadingLayerCount > 0 || snapshot.fxLayerCount > 0;
  const hasBubbles = snapshot.speechBubbleCount > 0;
  const allBubblesFilled = hasBubbles && snapshot.emptySpeechBubbleCount === 0;

  let phase: WorkflowPhaseId = "sketch";
  let completionRatio01 = roundTo(clamp(0.1 + Math.min(snapshot.sketchStrokeCount, 80) / 400, 0.1, 0.26), 2);
  let confidence01 = 0.89;
  let reasonKo = `스케치 레이어 ${Math.max(1, snapshot.sketchLayerCount)}개(${snapshot.sketchStrokeCount}획) 구도 잡기 단계입니다.`;
  let reasonEn = `Blocking rough layout on ${Math.max(1, snapshot.sketchLayerCount)} sketch layer(s) (${snapshot.sketchStrokeCount} strokes).`;

  if (hasColor && allBubblesFilled && (hasShadingOrFx || snapshot.preflightChecked || snapshot.gamutProofed)) {
    phase = "finishing"; completionRatio01 = snapshot.exportReady ? 0.98 : snapshot.gamutProofed ? 0.9 : 0.84; confidence01 = 0.94;
    reasonKo = "채색·명암과 대사 식자가 완료되어 색역·스크롤 마감 검수 단계입니다.";
    reasonEn = "Coloring and dialogue lettering are complete; ready for final finishing QA.";
  } else if (hasColor && (hasBubbles || snapshot.sfxLayerCount > 0 || snapshot.colorCoverageRatio01 >= 0.72)) {
    phase = "lettering"; completionRatio01 = 0.72; confidence01 = 0.91;
    reasonKo = snapshot.emptySpeechBubbleCount > 0 ? `빈 말풍선 ${snapshot.emptySpeechBubbleCount}개가 남아 식자·대사 배치 단계로 감지했습니다.` : "채색 커버리지가 충분해 말풍선·효과음 식자 단계로 전환되었습니다.";
    reasonEn = snapshot.emptySpeechBubbleCount > 0 ? `${snapshot.emptySpeechBubbleCount} empty bubble(s) detected; focused on lettering and SFX.` : "Color coverage is solid; transitioning into dialogue lettering and SFX.";
  } else if (hasColor || (hasInk && snapshot.flatColorLayerCount > 0)) {
    phase = "coloring"; completionRatio01 = roundTo(clamp(0.42 + snapshot.colorCoverageRatio01 * 0.24, 0.42, 0.68), 2); confidence01 = 0.9;
    reasonKo = `밑색 커버리지 ${Math.round(snapshot.colorCoverageRatio01 * 100)}% 기준으로 채색·명암 단계입니다.`;
    reasonEn = `Coloring phase detected at ${Math.round(snapshot.colorCoverageRatio01 * 100)}% flat coverage.`;
  } else if (hasInk || snapshot.inkLayerCount > 0) {
    phase = "lineart"; completionRatio01 = roundTo(clamp(0.28 + Math.min(snapshot.inkStrokeCount, 120) / 600, 0.28, 0.46), 2); confidence01 = 0.92;
    reasonKo = `선화 레이어 ${snapshot.inkLayerCount}개(${snapshot.inkStrokeCount}획)가 활성화되어 펜선 작업 단계입니다.`;
    reasonEn = `${snapshot.inkLayerCount} ink layer(s) (${snapshot.inkStrokeCount} strokes) active in lineart phase.`;
  }

  const labels: Record<WorkflowPhaseId, readonly [string, string]> = {
    sketch: ["1단계 · 스케치", "Phase 1 · Sketch"], lineart: ["2단계 · 선화", "Phase 2 · Lineart"],
    coloring: ["3단계 · 채색", "Phase 3 · Coloring"], lettering: ["4단계 · 식자", "Phase 4 · Lettering"],
    finishing: ["5단계 · 마감", "Phase 5 · Finishing"],
  };
  return { phase, phaseLabelKo: labels[phase][0], phaseLabelEn: labels[phase][1], completionRatio01, confidence01, reasonKo, reasonEn, nextActions: PHASE_ACTIONS[phase] };
}

const mkSnap = (
  sketchLayerCount: number, sketchStrokeCount: number, inkLayerCount: number, inkStrokeCount: number,
  flatColorLayerCount: number, colorCoverageRatio01: number, shadingLayerCount: number, fxLayerCount: number,
  speechBubbleCount: number, emptySpeechBubbleCount: number, sfxLayerCount: number,
  preflightChecked: boolean, gamutProofed: boolean, exportReady: boolean,
): CanvasWorkflowSnapshot => ({
  sketchLayerCount, sketchStrokeCount, inkLayerCount, inkStrokeCount, flatColorLayerCount, colorCoverageRatio01,
  shadingLayerCount, fxLayerCount, speechBubbleCount, emptySpeechBubbleCount, sfxLayerCount, preflightChecked, gamutProofed, exportReady,
});

export const DEMO_WORKFLOW_SNAPSHOTS: Record<WorkflowPhaseId, CanvasWorkflowSnapshot> = {
  sketch: mkSnap(2, 44, 0, 0, 0, 0, 0, 0, 0, 0, 0, false, false, false),
  lineart: mkSnap(1, 68, 2, 95, 0, 0, 0, 0, 0, 0, 0, false, false, false),
  coloring: mkSnap(1, 68, 2, 142, 3, 0.58, 1, 0, 0, 0, 0, false, false, false),
  lettering: mkSnap(1, 68, 2, 148, 3, 0.86, 2, 1, 6, 2, 2, false, false, false),
  finishing: mkSnap(1, 68, 2, 150, 3, 0.94, 2, 2, 8, 0, 3, true, true, false),
};
