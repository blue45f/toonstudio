/**
 * 매체별 색역 이탈(Out-of-Gamut) 정밀 판정기.
 *
 * - sRGB / Display P3 입력 샘플을 선형 RGB → CIE 1931 XYZ(D65) → 대상 색역(sRGB·Display P3·Rec.709·Rec.2020·CMYK Coated)으로 변환한다.
 * - CIELAB ΔE76 지각 색차와 오프셋 코팅지 CMYK 총 잉크량(TAC) 한도를 계산해 매체별 색역 이탈 경고를 생성한다.
 * - 브라우저 스토리지 및 원시 색상 리터럴(#hex/rgb/hsl) 없이 100% 결정적 수치 연산만 수행한다.
 */

export type ColorGamutId = "srgb" | "display-p3" | "cmyk-coated" | "rec709" | "rec2020";
export type GamutWarningSeverity = "ok" | "warn" | "critical";

export interface ColorSampleInput {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  /** 정규화 채널 값 [0..1] */
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly sourceSpace: "srgb" | "display-p3";
}

export interface GamutSampleEvaluation {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly sourceSpace: "srgb" | "display-p3";
  readonly targetGamut: ColorGamutId;
  readonly isOutOfGamut: boolean;
  readonly deltaE: number;
  readonly estimatedTacPercent: number | null;
  readonly isTacExceeded: boolean;
  readonly reasonKo: string | null;
  readonly reasonEn: string | null;
}

export interface MediumGamutReport {
  readonly targetGamut: ColorGamutId;
  readonly totalSamples: number;
  readonly outOfGamutCount: number;
  readonly outOfGamutRatio: number;
  readonly tacExceededCount: number;
  readonly maxDeltaE: number;
  readonly meanDeltaE: number;
  readonly severity: GamutWarningSeverity;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly samples: readonly GamutSampleEvaluation[];
}

export const DEFAULT_WORK_COLOR_SAMPLES: readonly ColorSampleInput[] = [
  { id: "p3-persimmon", labelKo: "P3 시그니처 주홍", labelEn: "P3 Signature Persimmon", r: 0.99, g: 0.24, b: 0.08, sourceSpace: "display-p3" },
  { id: "neon-cyan-fx", labelKo: "네온 이펙트 시안", labelEn: "Neon FX Cyan", r: 0.04, g: 0.96, b: 0.98, sourceSpace: "display-p3" },
  { id: "skin-warm-base", labelKo: "인물 웜 피부 톤", labelEn: "Warm Character Skin", r: 0.89, g: 0.74, b: 0.65, sourceSpace: "srgb" },
  { id: "deep-shadow-ink", labelKo: "암부 딥 네이비 잉크", labelEn: "Deep Shadow Navy Ink", r: 0.09, g: 0.11, b: 0.19, sourceSpace: "srgb" },
  { id: "vivid-lime-rim", labelKo: "P3 라임 림라이트", labelEn: "P3 Vivid Lime Rim", r: 0.28, g: 0.98, b: 0.14, sourceSpace: "display-p3" },
];

export const PRINT_SAFE_COLOR_SAMPLES: readonly ColorSampleInput[] = [
  { id: "safe-paper-ivory", labelKo: "종이 미색 베이스", labelEn: "Warm Paper Ivory", r: 0.94, g: 0.91, b: 0.85, sourceSpace: "srgb" },
  { id: "safe-terracotta", labelKo: "차분한 테라코타", labelEn: "Muted Terracotta", r: 0.72, g: 0.42, b: 0.34, sourceSpace: "srgb" },
  { id: "safe-slate-blue", labelKo: "슬레이트 블루 음영", labelEn: "Slate Blue Shadow", r: 0.34, g: 0.43, b: 0.56, sourceSpace: "srgb" },
  { id: "safe-sage-leaf", labelKo: "세이지 그린", labelEn: "Muted Sage Green", r: 0.45, g: 0.58, b: 0.46, sourceSpace: "srgb" },
];

export const NEON_STRESS_COLOR_SAMPLES: readonly ColorSampleInput[] = [
  { id: "stress-cyber-cyan", labelKo: "사이버 형광 시안", labelEn: "Cyber Neon Cyan", r: 0.0, g: 1.0, b: 0.98, sourceSpace: "display-p3" },
  { id: "stress-laser-magenta", labelKo: "레이저 마젠타", labelEn: "Laser Magenta", r: 1.0, g: 0.04, b: 0.88, sourceSpace: "display-p3" },
  { id: "stress-electric-blue", labelKo: "일렉트릭 블루", labelEn: "Electric Ultramarine", r: 0.06, g: 0.16, b: 1.0, sourceSpace: "display-p3" },
  { id: "stress-acid-green", labelKo: "애시드 형광 그린", labelEn: "Acid Neon Green", r: 0.12, g: 1.0, b: 0.05, sourceSpace: "display-p3" },
  { id: "stress-rich-black", labelKo: "과포화 딥 블랙", labelEn: "Oversaturated Deep Black", r: 0.02, g: 0.02, b: 0.03, sourceSpace: "display-p3" },
];

const EPSILON = 1e-6;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function srgbToLinear(c: number): number {
  const v = clamp(c, 0, 1);
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  const v = clamp(c, 0, 1);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

function linearToXyzD65(r: number, g: number, b: number, space: "srgb" | "display-p3"): readonly [number, number, number] {
  if (space === "display-p3") {
    return [
      0.4865709 * r + 0.2656677 * g + 0.1982173 * b,
      0.2289746 * r + 0.6917385 * g + 0.0792869 * b,
      0.0 * r + 0.0451134 * g + 1.0439444 * b,
    ];
  }
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ];
}

function xyzToLinearTarget(x: number, y: number, z: number, target: Exclude<ColorGamutId, "cmyk-coated">): readonly [number, number, number] {
  if (target === "display-p3") {
    return [
      2.4934973 * x - 0.9313838 * y - 0.4027109 * z,
      -0.8294893 * x + 1.7626642 * y + 0.0236248 * z,
      0.0358459 * x - 0.0761724 * y + 0.9568845 * z,
    ];
  }
  if (target === "rec2020") {
    return [
      1.7166513 * x - 0.3556708 * y - 0.2533663 * z,
      -0.6666843 * x + 1.6164812 * y + 0.0157686 * z,
      0.0176399 * x - 0.0427706 * y + 0.9421031 * z,
    ];
  }
  // sRGB 및 Rec.709는 동일한 ITU-R BT.709 원색(D65)을 공유한다.
  return [
    3.2404548 * x - 1.5371389 * y - 0.4985315 * z,
    -0.9692664 * x + 1.8760109 * y + 0.0415561 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ];
}

function linearTargetToXyzD65(r: number, g: number, b: number, target: Exclude<ColorGamutId, "cmyk-coated">): readonly [number, number, number] {
  if (target === "display-p3") return linearToXyzD65(r, g, b, "display-p3");
  if (target === "rec2020") {
    return [
      0.636958 * r + 0.1446169 * g + 0.168881 * b,
      0.2627002 * r + 0.6779981 * g + 0.0593017 * b,
      0.0 * r + 0.0280727 * g + 1.0609851 * b,
    ];
  }
  return linearToXyzD65(r, g, b, "srgb");
}

function xyzToLabD65(x: number, y: number, z: number): readonly [number, number, number] {
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x / 0.95047);
  const fy = f(y / 1.0);
  const fz = f(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE76(labA: readonly [number, number, number], labB: readonly [number, number, number]): number {
  const dL = labA[0] - labB[0];
  const da = labA[1] - labB[1];
  const db = labA[2] - labB[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

function evaluateCmykSoftProofSample(
  sample: ColorSampleInput,
  srcXyz: readonly [number, number, number],
  maxTacPercent: number,
): GamutSampleEvaluation {
  const srcLab = xyzToLabD65(srcXyz[0], srcXyz[1], srcXyz[2]);
  const [sr, sg, sb] = xyzToLinearTarget(srcXyz[0], srcXyz[1], srcXyz[2], "srgb");

  // sRGB 이탈과 더불어 디스플레이 기준 sRGB → 부분 GCR(UCR) 오프셋 CMYK 분판의 잉크 총량(TAC) 및 채도 한계를 반영한다.
  const dispR = linearToSrgb(sr);
  const dispG = linearToSrgb(sg);
  const dispB = linearToSrgb(sb);
  const c0 = 1 - dispR;
  const m0 = 1 - dispG;
  const y0 = 1 - dispB;
  const minCmy = Math.min(c0, m0, y0);
  const kSep = minCmy * 0.95;
  const ucrRemove = minCmy * 0.22;
  const cSep = Math.max(0, c0 - ucrRemove);
  const mSep = Math.max(0, m0 - ucrRemove);
  const ySep = Math.max(0, y0 - ucrRemove);
  const estimatedTacPercent = roundTo(clamp((cSep + mSep + ySep + kSep) * 100, 0, 400), 1);
  const isTacExceeded = estimatedTacPercent > maxTacPercent;

  const chroma = Math.hypot(srcLab[1], srcLab[2]);
  const hueDeg = ((Math.atan2(srcLab[2], srcLab[1]) * 180) / Math.PI + 360) % 360;
  const inkChromaLimit = hueDeg >= 105 && hueDeg <= 300 ? 54 : hueDeg >= 300 || hueDeg <= 45 ? 64 : 74;
  const chromaRatio = chroma > EPSILON ? Math.min(chroma, inkChromaLimit) / chroma : 1;
  const proofL = clamp(srcLab[0] * 0.88 + 9.5, 12, 96);
  const dE = roundTo(deltaE76(srcLab, [proofL, srcLab[1] * chromaRatio, srcLab[2] * chromaRatio]), 2);

  const outsideSrgb = sr < -0.004 || sg < -0.004 || sb < -0.004 || sr > 1.004 || sg > 1.004 || sb > 1.004;
  const isOutOfGamut = outsideSrgb || dE >= 5.5 || isTacExceeded;

  let reasonKo: string | null = null;
  let reasonEn: string | null = null;
  if (isTacExceeded) {
    reasonKo = `총 잉크량 ${estimatedTacPercent}%가 한도(${maxTacPercent}%)를 초과해 뒷묻음 위험이 있습니다.`;
    reasonEn = `Total ink coverage ${estimatedTacPercent}% exceeds ${maxTacPercent}% TAC limit.`;
  } else if (outsideSrgb || dE >= 5.5) {
    reasonKo = `CMYK 오프셋 색역 이탈(ΔE ${dE.toFixed(1)}) — 인쇄 시 채도가 낮아집니다.`;
    reasonEn = `Outside CMYK offset gamut (ΔE ${dE.toFixed(1)}) — saturation compresses in print.`;
  }

  return {
    id: sample.id,
    labelKo: sample.labelKo,
    labelEn: sample.labelEn,
    sourceSpace: sample.sourceSpace,
    targetGamut: "cmyk-coated",
    isOutOfGamut,
    deltaE: dE,
    estimatedTacPercent,
    isTacExceeded,
    reasonKo,
    reasonEn,
  };
}

export function evaluateGamutForMedium(
  samples: readonly ColorSampleInput[],
  targetGamut: ColorGamutId,
  maxTacPercent: number | null = 300,
): MediumGamutReport {
  const safeSamples = samples.length > 0 ? samples : DEFAULT_WORK_COLOR_SAMPLES;
  const evaluations: GamutSampleEvaluation[] = safeSamples.map((sample) => {
    const srcXyz = linearToXyzD65(srgbToLinear(sample.r), srgbToLinear(sample.g), srgbToLinear(sample.b), sample.sourceSpace);
    if (targetGamut === "cmyk-coated") {
      return evaluateCmykSoftProofSample(sample, srcXyz, maxTacPercent ?? 300);
    }

    const [tr, tg, tb] = xyzToLinearTarget(srcXyz[0], srcXyz[1], srcXyz[2], targetGamut);
    const margin = 0.003;
    const isOutOfGamut = tr < -margin || tg < -margin || tb < -margin || tr > 1 + margin || tg > 1 + margin || tb > 1 + margin;
    const clampedXyz = linearTargetToXyzD65(clamp(tr, 0, 1), clamp(tg, 0, 1), clamp(tb, 0, 1), targetGamut);
    const dE = isOutOfGamut
      ? roundTo(deltaE76(xyzToLabD65(srcXyz[0], srcXyz[1], srcXyz[2]), xyzToLabD65(clampedXyz[0], clampedXyz[1], clampedXyz[2])), 2)
      : 0;
    const targetLabel =
      targetGamut === "srgb" ? "sRGB" : targetGamut === "display-p3" ? "Display P3" : targetGamut === "rec709" ? "Rec.709" : "Rec.2020";

    return {
      id: sample.id,
      labelKo: sample.labelKo,
      labelEn: sample.labelEn,
      sourceSpace: sample.sourceSpace,
      targetGamut,
      isOutOfGamut,
      deltaE: dE,
      estimatedTacPercent: null,
      isTacExceeded: false,
      reasonKo: isOutOfGamut ? `${targetLabel} 색역 범위를 벗어남(ΔE ${dE.toFixed(1)}) — 광색역 클리핑 주의.` : null,
      reasonEn: isOutOfGamut ? `Out of ${targetLabel} gamut (ΔE ${dE.toFixed(1)}) — clipping risk.` : null,
    };
  });

  const outOfGamutCount = evaluations.filter((item) => item.isOutOfGamut).length;
  const tacExceededCount = evaluations.filter((item) => item.isTacExceeded).length;
  const maxDeltaE = evaluations.reduce((acc, item) => Math.max(acc, item.deltaE), 0);
  const meanDeltaE = roundTo(evaluations.reduce((acc, item) => acc + item.deltaE, 0) / evaluations.length, 2);
  const outOfGamutRatio = roundTo(outOfGamutCount / evaluations.length, 3);
  const severity: GamutWarningSeverity =
    outOfGamutCount === 0 ? "ok" : maxDeltaE >= 10 || tacExceededCount > 0 || outOfGamutRatio >= 0.5 ? "critical" : "warn";

  const summaryKo =
    outOfGamutCount === 0
      ? `전체 ${evaluations.length}개 샘플이 대상 색역 안에서 안전하게 재현됩니다.`
      : `${evaluations.length}개 중 ${outOfGamutCount}개 색역 이탈(최대 ΔE ${maxDeltaE.toFixed(1)}${tacExceededCount > 0 ? ` · TAC 초과 ${tacExceededCount}건` : ""}).`;
  const summaryEn =
    outOfGamutCount === 0
      ? `All ${evaluations.length} sampled colors fit cleanly within target gamut.`
      : `${outOfGamutCount}/${evaluations.length} colors out of gamut (max ΔE ${maxDeltaE.toFixed(1)}${tacExceededCount > 0 ? ` · ${tacExceededCount} TAC over` : ""}).`;

  return {
    targetGamut,
    totalSamples: evaluations.length,
    outOfGamutCount,
    outOfGamutRatio,
    tacExceededCount,
    maxDeltaE,
    meanDeltaE,
    severity,
    summaryKo,
    summaryEn,
    samples: evaluations,
  };
}
