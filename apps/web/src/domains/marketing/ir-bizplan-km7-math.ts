/**
 * 마케팅 IR·사업계획서 라이브 위젯 전용 독립 수학 모듈.
 *
 * - 도메인 경계(`marketing -> creator` 직접 import 금지)를 지키기 위해 순수 수학만 독립 구성했다.
 * - 가시광선 7개 지각 밴드(420·465·505·545·585·625·670nm) 기반 Kubelka-Munk 감산 혼색 공식과
 *   단위경제성(Unit Economics) 시뮬레이션 계산식을 제공한다.
 * - 외부 독점 패키지(`mixbox` 등)나 제3자 LUT 없이 1차 원리 수식으로만 동작한다.
 */

export interface PigmentRgb01 {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface PigmentPreset {
  readonly id: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly leftLabelKo: string;
  readonly leftLabelEn: string;
  readonly rightLabelKo: string;
  readonly rightLabelEn: string;
  readonly colorA: PigmentRgb01;
  readonly colorB: PigmentRgb01;
  readonly insightKo: string;
  readonly insightEn: string;
}

export interface SpectralMixComparison {
  readonly ratio: number;
  readonly km7Hex: string;
  readonly rgbHex: string;
  readonly km7Bands: readonly [number, number, number, number, number, number, number];
  readonly km7Chroma: number;
  readonly rgbChroma: number;
  readonly km7HueDeg: number;
  readonly rgbHueDeg: number;
}

export const KM7_DEMO_WAVELENGTHS_NM: readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
] = [420, 465, 505, 545, 585, 625, 670];

const REFLECTANCE_FLOOR = 0.002;
const CONCENTRATION_GAMMA = 1.65;
const CHROMA_PRESERVE = 0.35;

/** 원색 3기저 반사율 곡선 — 모든 파장 밴드에서 BR[i] + BG[i] + BB[i] = 1.0. */
const BASIS_R = [0.16, 0.03, 0.02, 0.03, 0.56, 0.9, 0.9] as const;
const BASIS_G = [0.02, 0.07, 0.54, 0.86, 0.42, 0.08, 0.02] as const;
const BASIS_B = [0.82, 0.9, 0.44, 0.11, 0.02, 0.02, 0.08] as const;

/** 7밴드 반사율 → 선형 sRGB 복원 행렬 M (M · B = I₃). */
const RECON_R = [0.039103, -0.018961, -0.097571, -0.166425, 0.347685, 0.540144, 0.356026] as const;
const RECON_G = [-0.110624, -0.162648, 0.33623, 0.844858, 0.271934, -0.086017, -0.093732] as const;
const RECON_B = [0.34944, 0.690429, 0.252564, -0.160496, -0.123187, -0.02939, 0.02064] as const;

export const PIGMENT_DEMO_PRESETS: readonly PigmentPreset[] = [
  {
    id: "cobalt-cadmium",
    nameKo: "코발트 블루 + 카드뮴 옐로",
    nameEn: "Cobalt Blue + Cadmium Yellow",
    leftLabelKo: "코발트 블루",
    leftLabelEn: "Cobalt Blue",
    rightLabelKo: "카드뮴 옐로",
    rightLabelEn: "Cadmium Yellow",
    colorA: { r: 0.06, g: 0.28, b: 0.65 },
    colorB: { r: 0.97, g: 0.83, b: 0.08 },
    insightKo: "505·545nm 녹색 대역 반사율이 살아남아, 탁한 회갈색이 아닌 맑은 녹색이 나옵니다.",
    insightEn: "Reflectance in the 505 and 545 nm green bands survives, producing clear green instead of muddy gray.",
  },
  {
    id: "ultramarine-lemon",
    nameKo: "울트라마린 + 레몬 옐로",
    nameEn: "Ultramarine + Lemon Yellow",
    leftLabelKo: "울트라마린",
    leftLabelEn: "Ultramarine",
    rightLabelKo: "레몬 옐로",
    rightLabelEn: "Lemon Yellow",
    colorA: { r: 0.11, g: 0.22, b: 0.69 },
    colorB: { r: 0.98, g: 0.93, b: 0.18 },
    insightKo: "깊은 청색과 밝은 노랑을 섞어도 중간 구간 채도가 무너지지 않고 청록·연두 스펙트럼을 유지합니다.",
    insightEn: "Mid-mix chroma holds across the transition, keeping fresh teal-to-leaf green tones.",
  },
  {
    id: "vermilion-phthalo",
    nameKo: "버밀리온 레드 + 프탈로 블루",
    nameEn: "Vermilion Red + Phthalo Blue",
    leftLabelKo: "버밀리온",
    leftLabelEn: "Vermilion",
    rightLabelKo: "프탈로 블루",
    rightLabelEn: "Phthalo Blue",
    colorA: { r: 0.87, g: 0.22, b: 0.12 },
    colorB: { r: 0.05, g: 0.31, b: 0.59 },
    insightKo: "적·청 감산 혼색에서 어두운 탁색 대신 깊이 있는 자줏빛 그림자 톤을 만듭니다.",
    insightEn: "Subtractive red-blue mixing produces a rich plum shadow instead of flat murky gray.",
  },
] as const;

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function srgbToLinear(channel: number): number {
  const x = clamp01(channel);
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function linearToSrgb(channel: number): number {
  const x = clamp01(channel);
  return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

function linearRgbToOklab(rgb: PigmentRgb01): { L: number; a: number; b: number } {
  const r = clamp01(rgb.r);
  const g = clamp01(rgb.g);
  const b = clamp01(rgb.b);
  const l = Math.cbrt(Math.max(0, 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b));
  const m = Math.cbrt(Math.max(0, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b));
  const s = Math.cbrt(Math.max(0, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b));
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabToLinearRgb(lab: { L: number; a: number; b: number }): PigmentRgb01 {
  const lRoot = lab.L + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const mRoot = lab.L - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const sRoot = lab.L - 0.0894841775 * lab.a - 1.291485548 * lab.b;
  const l = lRoot * lRoot * lRoot;
  const m = mRoot * mRoot * mRoot;
  const s = sRoot * sRoot * sRoot;
  return {
    r: clamp01(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

function srgbToOklch(srgb: PigmentRgb01): { C: number; hDeg: number } {
  const lab = linearRgbToOklab({
    r: srgbToLinear(srgb.r),
    g: srgbToLinear(srgb.g),
    b: srgbToLinear(srgb.b),
  });
  return {
    C: Math.hypot(lab.a, lab.b),
    hDeg: ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360,
  };
}

function ksFromReflectance(reflectance: number): number {
  const r = clampRange(reflectance, REFLECTANCE_FLOOR, 1);
  const diff = 1 - r;
  return (diff * diff) / (2 * r);
}

function reflectanceFromKs(ks: number): number {
  const q = Number.isFinite(ks) && ks > 0 ? ks : 0;
  return 1 / (1 + q + Math.sqrt(q * q + 2 * q));
}

function toSpectrum7(lin: PigmentRgb01): readonly [number, number, number, number, number, number, number] {
  const band = (idx: number): number =>
    clampRange(
      lin.r * (BASIS_R[idx] ?? 0) + lin.g * (BASIS_G[idx] ?? 0) + lin.b * (BASIS_B[idx] ?? 0),
      REFLECTANCE_FLOOR,
      1,
    );
  return [band(0), band(1), band(2), band(3), band(4), band(5), band(6)];
}

export function rgb01ToHex(rgb: PigmentRgb01): string {
  const toByte = (v: number) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
  return `#${toByte(rgb.r)}${toByte(rgb.g)}${toByte(rgb.b)}`.toUpperCase();
}

/** 7밴드 KM 분광 감산 혼색과 일반 sRGB 선형 보간 결과를 함께 계산한다. */
export function compareKm7AndRgbMix(
  colorA: PigmentRgb01,
  colorB: PigmentRgb01,
  ratio: number,
): SpectralMixComparison {
  const t = clamp01(ratio);
  const rgbSrgb: PigmentRgb01 = {
    r: clamp01(colorA.r * (1 - t) + colorB.r * t),
    g: clamp01(colorA.g * (1 - t) + colorB.g * t),
    b: clamp01(colorA.b * (1 - t) + colorB.b * t),
  };

  const linA: PigmentRgb01 = {
    r: srgbToLinear(colorA.r),
    g: srgbToLinear(colorA.g),
    b: srgbToLinear(colorA.b),
  };
  const linB: PigmentRgb01 = {
    r: srgbToLinear(colorB.r),
    g: srgbToLinear(colorB.g),
    b: srgbToLinear(colorB.b),
  };

  const specA = toSpectrum7(linA);
  const specB = toSpectrum7(linB);

  let km7Bands: readonly [number, number, number, number, number, number, number];
  let km7Srgb: PigmentRgb01;

  if (t <= 0) {
    km7Bands = specA;
    km7Srgb = { r: clamp01(colorA.r), g: clamp01(colorA.g), b: clamp01(colorA.b) };
  } else if (t >= 1) {
    km7Bands = specB;
    km7Srgb = { r: clamp01(colorB.r), g: clamp01(colorB.g), b: clamp01(colorB.b) };
  } else {
    const lumA = Math.max(REFLECTANCE_FLOOR, 0.2126 * linA.r + 0.7152 * linA.g + 0.0722 * linA.b);
    const lumB = Math.max(REFLECTANCE_FLOOR, 0.2126 * linB.r + 0.7152 * linB.g + 0.0722 * linB.b);
    const cA = Math.pow(1 - t, CONCENTRATION_GAMMA) * lumA;
    const cB = Math.pow(t, CONCENTRATION_GAMMA) * lumB;
    const invTotal = 1 / Math.max(1e-7, cA + cB);

    const blend = (idx: number): number => {
      const ra = specA[idx] ?? REFLECTANCE_FLOOR;
      const rb = specB[idx] ?? REFLECTANCE_FLOOR;
      const ks = (ksFromReflectance(ra) * cA + ksFromReflectance(rb) * cB) * invTotal;
      return reflectanceFromKs(ks);
    };
    km7Bands = [blend(0), blend(1), blend(2), blend(3), blend(4), blend(5), blend(6)];

    const dot = (w: readonly number[]): number =>
      clamp01(km7Bands.reduce((acc, bandValue, idx) => acc + (w[idx] ?? 0) * bandValue, 0));
    const rawLin: PigmentRgb01 = { r: dot(RECON_R), g: dot(RECON_G), b: dot(RECON_B) };

    const okA = linearRgbToOklab(linA);
    const okB = linearRgbToOklab(linB);
    const okM = linearRgbToOklab(rawLin);
    const cAOk = Math.hypot(okA.a, okA.b);
    const cBOk = Math.hypot(okB.a, okB.b);
    const cMOk = Math.hypot(okM.a, okM.b);
    const targetC = Math.min(cAOk, cBOk) * 0.85 + Math.max(cAOk, cBOk) * 0.15;
    let outLin = rawLin;
    if (cMOk > 0.015 && targetC > cMOk) {
      const bell = 4 * t * (1 - t);
      const boost = 1 + CHROMA_PRESERVE * bell * Math.min(0.65, (targetC - cMOk) / cMOk);
      outLin = oklabToLinearRgb({ L: okM.L, a: okM.a * boost, b: okM.b * boost });
    }
    km7Srgb = {
      r: linearToSrgb(outLin.r),
      g: linearToSrgb(outLin.g),
      b: linearToSrgb(outLin.b),
    };
  }

  const km7Lch = srgbToOklch(km7Srgb);
  const rgbLch = srgbToOklch(rgbSrgb);
  return {
    ratio: t,
    km7Hex: rgb01ToHex(km7Srgb),
    rgbHex: rgb01ToHex(rgbSrgb),
    km7Bands,
    km7Chroma: km7Lch.C,
    rgbChroma: rgbLch.C,
    km7HueDeg: km7Lch.hDeg,
    rgbHueDeg: rgbLch.hDeg,
  };
}

/* -------------------------------------------------------------------------- */
/* 단위경제성(Unit Economics) 시뮬레이터 순수 계산식                               */
/* -------------------------------------------------------------------------- */

export interface UnitEconomicsInput {
  /** 월 구독 예시 단가(원) — 확정 가격이 아닌 시뮬레이션 입력값. */
  readonly monthlyArpuKrw: number;
  /** 유료 가입자 수 N (명). */
  readonly paidSubscribers: number;
  /** 월간 이탈률(%, 예: 6 = 6%). */
  readonly monthlyChurnPct: number;
  /** 1인당 고객 획득 비용 CAC(원). */
  readonly cacKrw: number;
  /** 1인당 월 변동 원가(AI 크레딧·클라우드 동기화, 원). */
  readonly variableCostPerUserKrw: number;
  /** 월 고정 인프라·운영비(원, 베타 실측은 0원). */
  readonly fixedMonthlyInfraKrw: number;
}

export interface UnitEconomicsResult {
  readonly monthlyGrossRevenueKrw: number;
  readonly contributionPerUserKrw: number;
  readonly grossMarginPct: number;
  readonly ltvKrw: number;
  readonly ltvToCacRatio: number;
  readonly paybackMonths: number | null;
  readonly breakevenSubscribers: number | null;
  readonly monthlyNetContributionKrw: number;
}

/** 보수적 가정 기반 단위경제성 계산(모든 출력은 입력 가정에 따른 산술 결과). */
export function computeUnitEconomics(input: UnitEconomicsInput): UnitEconomicsResult {
  const arpu = Math.max(0, Math.round(input.monthlyArpuKrw));
  const users = Math.max(0, Math.round(input.paidSubscribers));
  const churnRate = clampRange(input.monthlyChurnPct, 0.5, 50) / 100;
  const cac = Math.max(0, Math.round(input.cacKrw));
  const variableCost = Math.max(0, Math.round(input.variableCostPerUserKrw));
  const fixedCost = Math.max(0, Math.round(input.fixedMonthlyInfraKrw));

  const monthlyGrossRevenueKrw = arpu * users;
  const contributionPerUserKrw = arpu - variableCost;
  const grossMarginPct = arpu > 0 ? (contributionPerUserKrw / arpu) * 100 : 0;
  const ltvKrw = contributionPerUserKrw > 0 ? Math.round(contributionPerUserKrw / churnRate) : 0;
  const ltvToCacRatio = cac > 0 && ltvKrw > 0 ? ltvKrw / cac : 0;
  const paybackMonths = contributionPerUserKrw > 0 && cac > 0 ? cac / contributionPerUserKrw : null;
  const breakevenSubscribers =
    contributionPerUserKrw <= 0
      ? null
      : fixedCost === 0
        ? 1
        : Math.ceil(fixedCost / contributionPerUserKrw);
  const monthlyNetContributionKrw = contributionPerUserKrw * users - fixedCost;

  return {
    monthlyGrossRevenueKrw,
    contributionPerUserKrw,
    grossMarginPct,
    ltvKrw,
    ltvToCacRatio,
    paybackMonths,
    breakevenSubscribers,
    monthlyNetContributionKrw,
  };
}
