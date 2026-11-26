/**
 * Wasm64 Wave 26: Brettel-Viénot-Mollon 생리학적 LMS 원추세포 색각 이상 시뮬레이터 및
 * 웹툰 진영·말풍선 혼동 감사·OKLCH 달토나이제이션(Daltonization) 팔레트 재배치기.
 *
 * - sRGB <-> Linear RGB <-> CIE XYZ(D65) <-> Smith-Pokorny 생리학적 LMS 행렬 파이프라인과
 *   6500K D65 백색점(`E-anchor`) 중립축 양날개 반평면 정사영으로 회색축 오차 `< 1e-4`를 보장한다.
 * - 적·녹·청 3종 색각 이상 시야에서 혼동되는 진영·말풍선 색상 쌍을 진단하고 최소 변위 OKLCH 해를 구한다.
 */

export type CvdType = "protan" | "deutan" | "tritan";

export interface CvdSrgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface LinearRgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface LmsConeResponse {
  readonly l: number;
  readonly m: number;
  readonly s: number;
}

export interface CvdOklabColor {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

export interface CvdOklchColor {
  readonly l: number;
  readonly c: number;
  readonly hDeg: number;
}

export type WebtoonPaletteRole = "faction" | "balloon" | "character" | "ui-badge" | "background";

export interface WebtoonPaletteEntry {
  readonly id: string;
  readonly labelKo: string;
  readonly role: WebtoonPaletteRole;
  readonly srgb: CvdSrgbColor;
  readonly locked?: boolean;
}

export interface CvdAuditOptions {
  readonly minDistinguishableDeltaE?: number;
  readonly severity?: number;
  readonly cvdTypes?: readonly CvdType[];
}

export interface CvdConfusionPair {
  readonly firstId: string;
  readonly secondId: string;
  readonly firstLabelKo: string;
  readonly secondLabelKo: string;
  readonly normalDeltaE: number;
  readonly cvdDeltaEByType: Readonly<Record<CvdType, number>>;
  readonly worstCvdType: CvdType;
  readonly worstCvdDeltaE: number;
  readonly deficit: number;
  readonly diagnosisKo: string;
}

export interface CvdPaletteAuditReport {
  readonly minDistinguishableDeltaE: number;
  readonly severity: number;
  readonly evaluatedPairCount: number;
  readonly minNormalDeltaE: number;
  readonly minCvdDeltaEByType: Readonly<Record<CvdType, number>>;
  readonly worstOverallDeltaE: number;
  readonly confusionPairs: readonly CvdConfusionPair[];
  readonly simulatedPalettes: Readonly<Record<CvdType, readonly CvdSrgbColor[]>>;
}

export interface OklchDaltonizeOptions extends CvdAuditOptions {
  readonly maxIterations?: number;
  readonly harmonyWeight?: number;
}

export interface RemappedPaletteEntry {
  readonly id: string;
  readonly labelKo: string;
  readonly role: WebtoonPaletteRole;
  readonly locked: boolean;
  readonly originalSrgb: CvdSrgbColor;
  readonly remappedSrgb: CvdSrgbColor;
  readonly originalOklch: CvdOklchColor;
  readonly remappedOklch: CvdOklchColor;
  readonly normalVisionShiftDeltaE: number;
  readonly simulatedByType: Readonly<Record<CvdType, CvdSrgbColor>>;
}

export interface OklchDaltonizeResult {
  readonly entries: readonly RemappedPaletteEntry[];
  readonly beforeAudit: CvdPaletteAuditReport;
  readonly afterAudit: CvdPaletteAuditReport;
  readonly meanNormalShiftDeltaE: number;
  readonly maxNormalShiftDeltaE: number;
  readonly allPairsDistinguishable: boolean;
  readonly iterationsUsed: number;
  readonly summaryKo: string;
}

type Vec3Tuple = readonly [number, number, number];
type Mat3 = readonly [Vec3Tuple, Vec3Tuple, Vec3Tuple];

const ALL_CVD_TYPES: readonly CvdType[] = ["protan", "deutan", "tritan"];
const CVD_LABEL_KO: Readonly<Record<CvdType, string>> = {
  protan: "적색각 이상(protan)",
  deutan: "녹색각 이상(deutan)",
  tritan: "청색각 이상(tritan)",
};

/** IEC 61966-2-1 D65 선형 sRGB -> CIE 1931 XYZ 및 Smith-Pokorny XYZ -> 생리학적 LMS 행렬 */
const M_LINEAR_RGB_TO_XYZ_D65: Mat3 = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];
const M_XYZ_TO_LMS: Mat3 = [
  [0.15514, 0.54312, -0.03286],
  [-0.15514, 0.45684, 0.03286],
  [0.0, 0.0, 0.01608],
];

function multiplyMat3(a: Mat3, b: Mat3): Mat3 {
  const row = (r: 0 | 1 | 2): Vec3Tuple => [
    a[r][0] * b[0][0] + a[r][1] * b[1][0] + a[r][2] * b[2][0],
    a[r][0] * b[0][1] + a[r][1] * b[1][1] + a[r][2] * b[2][1],
    a[r][0] * b[0][2] + a[r][1] * b[1][2] + a[r][2] * b[2][2],
  ];
  return [row(0), row(1), row(2)];
}

function multiplyMat3Vec(m: Mat3, v: Vec3Tuple): Vec3Tuple {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

function invertMat3Exact(m: Mat3): Mat3 {
  const [a, b, c] = m[0];
  const [d, e, f] = m[1];
  const [g, h, i] = m[2];
  const c00 = e * i - f * h, c01 = -(d * i - f * g), c02 = d * h - e * g;
  const c10 = -(b * i - c * h), c11 = a * i - c * g, c12 = -(a * h - b * g);
  const c20 = b * f - c * e, c21 = -(a * f - c * d), c22 = a * e - b * d;
  const det = a * c00 + b * c01 + c * c02;
  return [
    [c00 / det, c10 / det, c20 / det],
    [c01 / det, c11 / det, c21 / det],
    [c02 / det, c12 / det, c22 / det],
  ];
}

function crossVec3(u: Vec3Tuple, v: Vec3Tuple): Vec3Tuple {
  return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
}

const M_LINEAR_RGB_TO_LMS: Mat3 = multiplyMat3(M_XYZ_TO_LMS, M_LINEAR_RGB_TO_XYZ_D65);
const M_LMS_TO_LINEAR_RGB: Mat3 = invertMat3Exact(M_LINEAR_RGB_TO_LMS);
const LMS_D65_WHITE_ANCHOR: Vec3Tuple = multiplyMat3Vec(M_LINEAR_RGB_TO_LMS, [1, 1, 1]);

/** Brettel(1997) 단색광 불변 파장(475nm, 485nm, 575nm, 660nm) 반평면 법선 벡터 */
const WING_NORMAL_YELLOW_575 = crossVec3(
  LMS_D65_WHITE_ANCHOR,
  multiplyMat3Vec(M_XYZ_TO_LMS, [0.8425, 0.9154, 0.0018])
);
const WING_NORMAL_BLUE_475 = crossVec3(
  LMS_D65_WHITE_ANCHOR,
  multiplyMat3Vec(M_XYZ_TO_LMS, [0.1421, 0.1126, 1.0419])
);
const WING_NORMAL_RED_660 = crossVec3(
  LMS_D65_WHITE_ANCHOR,
  multiplyMat3Vec(M_XYZ_TO_LMS, [0.1649, 0.061, 0.0])
);
const WING_NORMAL_CYAN_485 = crossVec3(
  LMS_D65_WHITE_ANCHOR,
  multiplyMat3Vec(M_XYZ_TO_LMS, [0.05795, 0.1693, 0.6162])
);

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

function wrapHueDeg(hDeg: number): number {
  const mod = hDeg % 360;
  return mod < 0 ? mod + 360 : mod;
}

function srgbChannelToLinear(channel255: number): number {
  const n = clamp(channel255, 0, 255) / 255;
  return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

function linearChannelToSrgb(linear: number): number {
  const c = clamp(linear, 0, 1);
  const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return clamp(encoded * 255, 0, 255);
}

/** `0..255` sRGB 색상을 `0..1` 선형 RGB로 변환한다. */
export function srgbToLinearRgb(srgb: CvdSrgbColor): LinearRgbColor {
  return { r: srgbChannelToLinear(srgb.r), g: srgbChannelToLinear(srgb.g), b: srgbChannelToLinear(srgb.b) };
}

/** `0..1` 선형 RGB 색상을 `0..255` sRGB로 변환한다. */
export function linearRgbToSrgb(linear: LinearRgbColor): CvdSrgbColor {
  return { r: linearChannelToSrgb(linear.r), g: linearChannelToSrgb(linear.g), b: linearChannelToSrgb(linear.b) };
}

/** `0..1` 선형 RGB를 생리학적 LMS 원추세포 응답으로 변환한다. */
export function linearRgbToLms(linear: LinearRgbColor): LmsConeResponse {
  const [l, m, s] = multiplyMat3Vec(M_LINEAR_RGB_TO_LMS, [linear.r, linear.g, linear.b]);
  return { l, m, s };
}

/** 생리학적 LMS 원추세포 응답을 `0..1` 선형 RGB로 역변환한다. */
export function lmsToLinearRgb(lms: LmsConeResponse): LinearRgbColor {
  const [r, g, b] = multiplyMat3Vec(M_LMS_TO_LINEAR_RGB, [lms.l, lms.m, lms.s]);
  return { r, g, b };
}

/** LMS 공간에서 Brettel-Viénot-Mollon 중립축 양날개 반평면 정사영을 수행한다. */
export function projectLmsBrettelTwoWing(
  lms: LmsConeResponse,
  cvdType: CvdType,
  severity = 1
): LmsConeResponse {
  const t = clamp(severity, 0, 1);
  if (t <= 0) return lms;
  const [lE, mE, sE] = LMS_D65_WHITE_ANCHOR;
  let dL = lms.l, dM = lms.m, dS = lms.s;
  if (cvdType === "protan") {
    const n = lms.s * mE < lms.m * sE ? WING_NORMAL_YELLOW_575 : WING_NORMAL_BLUE_475;
    dL = -(n[1] * lms.m + n[2] * lms.s) / n[0];
  } else if (cvdType === "deutan") {
    const n = lms.s * lE < lms.l * sE ? WING_NORMAL_YELLOW_575 : WING_NORMAL_BLUE_475;
    dM = -(n[0] * lms.l + n[2] * lms.s) / n[1];
  } else {
    const n = lms.m * lE < lms.l * mE ? WING_NORMAL_RED_660 : WING_NORMAL_CYAN_485;
    dS = -(n[0] * lms.l + n[1] * lms.m) / n[2];
  }

  return { l: lms.l + t * (dL - lms.l), m: lms.m + t * (dM - lms.m), s: lms.s + t * (dS - lms.s) };
}

/** 단일 sRGB 색상에 대해 생리학적 색각 이상 시야 색상을 계산한다. */
export function simulateCvdSrgb(srgb: CvdSrgbColor, cvdType: CvdType, severity = 1): CvdSrgbColor {
  const lms = linearRgbToLms(srgbToLinearRgb(srgb));
  return linearRgbToSrgb(lmsToLinearRgb(projectLmsBrettelTwoWing(lms, cvdType, severity)));
}

function simulateAllCvdTypes(srgb: CvdSrgbColor, severity: number): Record<CvdType, CvdSrgbColor> {
  return {
    protan: simulateCvdSrgb(srgb, "protan", severity),
    deutan: simulateCvdSrgb(srgb, "deutan", severity),
    tritan: simulateCvdSrgb(srgb, "tritan", severity),
  };
}

/** `Float32Array` 선형 RGBA(`0..1`) 버퍼 전체에 색각 이상 시뮬레이션을 적용한다. */
export function simulateCvdLinearRgbaBuffer(
  rgbaBuffer: Float32Array,
  cvdType: CvdType,
  severity = 1
): Float32Array {
  const out = new Float32Array(rgbaBuffer.length);
  const t = clamp(severity, 0, 1);
  for (let idx = 0; idx + 3 < rgbaBuffer.length; idx += 4) {
    const r = clamp(rgbaBuffer[idx] ?? 0, 0, 1);
    const g = clamp(rgbaBuffer[idx + 1] ?? 0, 0, 1);
    const b = clamp(rgbaBuffer[idx + 2] ?? 0, 0, 1);
    const simLin = lmsToLinearRgb(
      projectLmsBrettelTwoWing(linearRgbToLms({ r, g, b }), cvdType, t)
    );
    out[idx] = clamp(simLin.r, 0, 1);
    out[idx + 1] = clamp(simLin.g, 0, 1);
    out[idx + 2] = clamp(simLin.b, 0, 1);
    out[idx + 3] = rgbaBuffer[idx + 3] ?? 1;
  }
  return out;
}

/** Björn Ottosson 표준 행렬로 sRGB를 지각 균등 Oklab 색공간으로 변환한다. */
export function cvdSrgbToOklab(srgb: CvdSrgbColor): CvdOklabColor {
  const lin = srgbToLinearRgb(srgb);
  const lCone = Math.cbrt(0.4122214708 * lin.r + 0.5363325363 * lin.g + 0.0514459929 * lin.b);
  const mCone = Math.cbrt(0.2119034982 * lin.r + 0.6806995451 * lin.g + 0.1073969566 * lin.b);
  const sCone = Math.cbrt(0.0883024619 * lin.r + 0.2817188376 * lin.g + 0.6299787005 * lin.b);
  return {
    l: 0.2104542553 * lCone + 0.793617785 * mCone - 0.0040720468 * sCone,
    a: 1.9779984951 * lCone - 2.428592205 * mCone + 0.4505937099 * sCone,
    b: 0.0259040371 * lCone + 0.7827717662 * mCone - 0.808675766 * sCone,
  };
}

function oklabToUnclampedLinearRgb(lab: CvdOklabColor): LinearRgbColor {
  const lRoot = lab.l + 0.3963377774 * lab.a + 0.2158037573 * lab.b;
  const mRoot = lab.l - 0.1055613458 * lab.a - 0.0638541728 * lab.b;
  const sRoot = lab.l - 0.0894841775 * lab.a - 1.291485548 * lab.b;
  const l = lRoot * lRoot * lRoot;
  const m = mRoot * mRoot * mRoot;
  const s = sRoot * sRoot * sRoot;
  return {
    r: 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    g: -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    b: -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  };
}

/** sRGB 색상을 원통형 OKLCH 좌표로 변환한다. */
export function cvdSrgbToOklch(srgb: CvdSrgbColor): CvdOklchColor {
  const lab = cvdSrgbToOklab(srgb);
  const c = Math.hypot(lab.a, lab.b);
  return { l: lab.l, c, hDeg: c < 1e-7 ? 0 : wrapHueDeg((Math.atan2(lab.b, lab.a) * 180) / Math.PI) };
}

function isLinearRgbInGamut(lin: LinearRgbColor): boolean {
  const eps = 1e-6;
  return (
    lin.r >= -eps && lin.r <= 1 + eps &&
    lin.g >= -eps && lin.g <= 1 + eps &&
    lin.b >= -eps && lin.b <= 1 + eps
  );
}

/** 명도(`L`)와 색상각(`hDeg`)을 보존하면서 sRGB 색역 경계 안으로 채도(`C`)를 이진 탐색 클리핑한다. */
export function oklchToGamutSrgb(oklch: CvdOklchColor): CvdSrgbColor {
  const targetL = clamp(oklch.l, 0.02, 0.985);
  const hRad = (wrapHueDeg(oklch.hDeg) * Math.PI) / 180;
  const cosH = Math.cos(hRad);
  const sinH = Math.sin(hRad);
  const maxC = Math.max(0, oklch.c);

  const directLin = oklabToUnclampedLinearRgb({ l: targetL, a: maxC * cosH, b: maxC * sinH });
  if (isLinearRgbInGamut(directLin)) return linearRgbToSrgb(directLin);

  let low = 0;
  let high = maxC;
  for (let step = 0; step < 18; step++) {
    const mid = 0.5 * (low + high);
    if (isLinearRgbInGamut(oklabToUnclampedLinearRgb({ l: targetL, a: mid * cosH, b: mid * sinH }))) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return linearRgbToSrgb(oklabToUnclampedLinearRgb({ l: targetL, a: low * cosH, b: low * sinH }));
}

function oklabDist(a: CvdOklabColor, b: CvdOklabColor): number {
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

/** 두 sRGB 색상의 지각적 Oklab 거리(`ΔE_Oklab`)를 계산한다. */
export function computeDeltaEOklab(first: CvdSrgbColor, second: CvdSrgbColor): number {
  return oklabDist(cvdSrgbToOklab(first), cvdSrgbToOklab(second));
}

interface CandidateState {
  readonly l: number;
  readonly c: number;
  readonly hDeg: number;
  readonly srgb: CvdSrgbColor;
  readonly normalLab: CvdOklabColor;
  readonly sims: Readonly<Record<CvdType, CvdSrgbColor>>;
  readonly simLabByType: Readonly<Record<CvdType, CvdOklabColor>>;
}

function buildCandidateState(srgb: CvdSrgbColor, severity: number): CandidateState {
  const lch = cvdSrgbToOklch(srgb);
  const sims = simulateAllCvdTypes(srgb, severity);
  return {
    l: lch.l,
    c: lch.c,
    hDeg: lch.hDeg,
    srgb,
    normalLab: cvdSrgbToOklab(srgb),
    sims,
    simLabByType: {
      protan: cvdSrgbToOklab(sims.protan),
      deutan: cvdSrgbToOklab(sims.deutan),
      tritan: cvdSrgbToOklab(sims.tritan),
    },
  };
}

/** 웹툰 캐릭터·진영·말풍선 팔레트에서 색각 이상 독자가 혼동하기 쉬운 색상 쌍을 전수 검사한다. */
export function auditPaletteCvdConfusions(
  entries: readonly WebtoonPaletteEntry[],
  options: CvdAuditOptions = {}
): CvdPaletteAuditReport {
  const minDistinguishableDeltaE = options.minDistinguishableDeltaE ?? 0.095;
  const severity = clamp(options.severity ?? 1, 0, 1);
  const activeTypes =
    options.cvdTypes && options.cvdTypes.length > 0 ? options.cvdTypes : ALL_CVD_TYPES;
  const states = entries.map((e) => buildCandidateState(e.srgb, severity));
  const simulatedPalettes: Record<CvdType, CvdSrgbColor[]> = {
    protan: states.map((s) => s.sims.protan),
    deutan: states.map((s) => s.sims.deutan),
    tritan: states.map((s) => s.sims.tritan),
  };

  const initMin = entries.length >= 2 ? Number.POSITIVE_INFINITY : 0;
  let minNormalDeltaE = initMin;
  const minCvdDeltaEByType: Record<CvdType, number> = { protan: initMin, deutan: initMin, tritan: initMin };
  const confusionPairs: CvdConfusionPair[] = [];
  let evaluatedPairCount = 0;

  for (let i = 0; i < entries.length; i++) {
    const first = entries[i];
    const st1 = states[i];
    if (!first || !st1) continue;
    for (let j = i + 1; j < entries.length; j++) {
      const second = entries[j];
      const st2 = states[j];
      if (!second || !st2) continue;
      evaluatedPairCount += 1;

      const normalDeltaE = oklabDist(st1.normalLab, st2.normalLab);
      if (normalDeltaE < minNormalDeltaE) minNormalDeltaE = normalDeltaE;

      const cvdDeltaEByType: Record<CvdType, number> = {
        protan: oklabDist(st1.simLabByType.protan, st2.simLabByType.protan),
        deutan: oklabDist(st1.simLabByType.deutan, st2.simLabByType.deutan),
        tritan: oklabDist(st1.simLabByType.tritan, st2.simLabByType.tritan),
      };
      for (const t of ALL_CVD_TYPES) {
        if (cvdDeltaEByType[t] < minCvdDeltaEByType[t]) minCvdDeltaEByType[t] = cvdDeltaEByType[t];
      }

      let worstCvdType: CvdType = activeTypes[0] ?? "protan";
      let worstCvdDeltaE = cvdDeltaEByType[worstCvdType];
      for (const cvdType of activeTypes) {
        if (cvdDeltaEByType[cvdType] < worstCvdDeltaE) {
          worstCvdDeltaE = cvdDeltaEByType[cvdType];
          worstCvdType = cvdType;
        }
      }

      if (worstCvdDeltaE < minDistinguishableDeltaE) {
        const deficit = minDistinguishableDeltaE - worstCvdDeltaE;
        const diagnosisKo =
          `${CVD_LABEL_KO[worstCvdType]} 시야에서 '${first.labelKo}'와 '${second.labelKo}'의 색차가 ` +
          `ΔE ${worstCvdDeltaE.toFixed(3)}으로 줄어들어 기준치(${minDistinguishableDeltaE.toFixed(3)})에 못 미칩니다. ` +
          `OKLCH 명도 단차를 넓히고 혼동선 바깥 색상각으로 분리해야 합니다.`;
        confusionPairs.push({
          firstId: first.id,
          secondId: second.id,
          firstLabelKo: first.labelKo,
          secondLabelKo: second.labelKo,
          normalDeltaE,
          cvdDeltaEByType,
          worstCvdType,
          worstCvdDeltaE,
          deficit,
          diagnosisKo,
        });
      }
    }
  }

  confusionPairs.sort((a, b) => b.deficit - a.deficit);
  let worstOverallDeltaE = minNormalDeltaE;
  for (const cvdType of activeTypes) {
    if (minCvdDeltaEByType[cvdType] < worstOverallDeltaE) worstOverallDeltaE = minCvdDeltaEByType[cvdType];
  }

  return {
    minDistinguishableDeltaE,
    severity,
    evaluatedPairCount,
    minNormalDeltaE,
    minCvdDeltaEByType,
    worstOverallDeltaE,
    confusionPairs,
    simulatedPalettes,
  };
}

interface SolverEvalContext {
  readonly origLabs: readonly CvdOklabColor[];
  readonly origLchs: readonly CvdOklchColor[];
  readonly activeTypes: readonly CvdType[];
  readonly targetDeltaE: number;
  readonly harmonyWeight: number;
}

function evaluatePaletteObjective(
  states: readonly CandidateState[],
  ctx: SolverEvalContext
): { totalCost: number; maxDeficit: number } {
  let collisionCost = 0;
  let maxDeficit = 0;
  const { origLabs, origLchs, activeTypes, targetDeltaE, harmonyWeight } = ctx;

  for (let i = 0; i < states.length; i++) {
    const first = states[i];
    if (!first) continue;
    for (let j = i + 1; j < states.length; j++) {
      const second = states[j];
      if (!second) continue;
      const normalGap = targetDeltaE - oklabDist(first.normalLab, second.normalLab);
      if (normalGap > 0) {
        collisionCost += 480 * normalGap * normalGap;
        if (normalGap > maxDeficit) maxDeficit = normalGap;
      }
      for (const cvdType of activeTypes) {
        const gap = targetDeltaE - oklabDist(first.simLabByType[cvdType], second.simLabByType[cvdType]);
        if (gap > 0) {
          collisionCost += 560 * gap * gap;
          if (gap > maxDeficit) maxDeficit = gap;
        }
      }
    }
  }

  let harmonyCost = 0;
  for (let i = 0; i < states.length; i++) {
    const state = states[i];
    const origLab = origLabs[i];
    const origLch = origLchs[i];
    if (!state || !origLab || !origLch) continue;
    const shift = oklabDist(state.normalLab, origLab);
    const chromaDiff = state.c - origLch.c;
    harmonyCost += harmonyWeight * (shift * shift + 0.25 * chromaDiff * chromaDiff);
  }
  return { totalCost: collisionCost + harmonyCost, maxDeficit };
}

/** 적·녹·청 3종 색각 이상 시야 모두에서 식별 색차를 만족하도록 OKLCH 명도·색상을 최소 변위로 재배치한다. */
export function solveOklchDaltonizedPalette(
  entries: readonly WebtoonPaletteEntry[],
  options: OklchDaltonizeOptions = {}
): OklchDaltonizeResult {
  const minDistinguishableDeltaE = options.minDistinguishableDeltaE ?? 0.095;
  const severity = clamp(options.severity ?? 1, 0, 1);
  const activeTypes =
    options.cvdTypes && options.cvdTypes.length > 0 ? options.cvdTypes : ALL_CVD_TYPES;
  const maxIterations = Math.max(4, options.maxIterations ?? 48);
  const harmonyWeight = Math.max(0.05, options.harmonyWeight ?? 1.0);
  const beforeAudit = auditPaletteCvdConfusions(entries, {
    minDistinguishableDeltaE,
    severity,
    cvdTypes: activeTypes,
  });

  const states = entries.map((e) => buildCandidateState(e.srgb, severity));
  const origLabs = states.map((s) => s.normalLab);
  const origLchs = states.map((s) => ({ l: s.l, c: s.c, hDeg: s.hDeg }));
  const alreadyClean =
    beforeAudit.confusionPairs.length === 0 &&
    beforeAudit.minNormalDeltaE >= minDistinguishableDeltaE;

  let iterationsUsed = 0;
  if (!alreadyClean) {
    const ctx: SolverEvalContext = {
      origLabs,
      origLchs,
      activeTypes,
      targetDeltaE: minDistinguishableDeltaE + 0.006,
      harmonyWeight,
    };
    const coarseSteps = { l: [-0.16, -0.09, -0.045, 0, 0.045, 0.09, 0.16], h: [-64, -34, -16, 0, 16, 34, 64], c: [-0.03, 0, 0.035] };
    const fineSteps = { l: [-0.024, -0.01, 0, 0.01, 0.024], h: [-10, -4, 0, 4, 10], c: [-0.012, 0, 0.012] };
    let currentEval = evaluatePaletteObjective(states, ctx);

    for (let iter = 0; iter < maxIterations; iter++) {
      iterationsUsed = iter + 1;
      let improvedInPass = false;
      const stepGrid = currentEval.maxDeficit <= 1e-5 ? fineSteps : coarseSteps;

      for (let idx = 0; idx < entries.length; idx++) {
        const entry = entries[idx];
        const baseState = states[idx];
        if (!entry || entry.locked || !baseState) continue;

        let bestCandidate = baseState;
        let bestEval = currentEval;
        for (const dL of stepGrid.l) {
          const candL = clamp(baseState.l + dL, 0.12, 0.94);
          for (const dH of stepGrid.h) {
            const candH = wrapHueDeg(baseState.hDeg + dH);
            for (const dC of stepGrid.c) {
              if (dL === 0 && dH === 0 && dC === 0) continue;
              const candSrgb = oklchToGamutSrgb({ l: candL, c: clamp(baseState.c + dC, 0.01, 0.34), hDeg: candH });
              const candState = buildCandidateState(candSrgb, severity);
              states[idx] = candState;
              const candidateEval = evaluatePaletteObjective(states, ctx);
              if (candidateEval.totalCost + 1e-7 < bestEval.totalCost) {
                bestEval = candidateEval;
                bestCandidate = candState;
                improvedInPass = true;
              }
            }
          }
        }
        states[idx] = bestCandidate;
        currentEval = bestEval;
      }
      if (!improvedInPass && currentEval.maxDeficit <= 1e-5) break;
    }
  }

  const afterAudit = alreadyClean
    ? beforeAudit
    : auditPaletteCvdConfusions(
        entries.map((entry, idx) => ({ ...entry, srgb: states[idx]?.srgb ?? entry.srgb })),
        { minDistinguishableDeltaE, severity, cvdTypes: activeTypes }
      );

  let shiftSum = 0;
  let maxNormalShiftDeltaE = 0;
  let unlockedCount = 0;
  const remappedEntries: RemappedPaletteEntry[] = entries.map((entry, idx) => {
    const st = states[idx] ?? buildCandidateState(entry.srgb, severity);
    const origLch = origLchs[idx] ?? cvdSrgbToOklch(entry.srgb);
    const shift = alreadyClean ? 0 : oklabDist(origLabs[idx] ?? st.normalLab, st.normalLab);
    if (!entry.locked) {
      shiftSum += shift;
      unlockedCount += 1;
      if (shift > maxNormalShiftDeltaE) maxNormalShiftDeltaE = shift;
    }
    return {
      id: entry.id,
      labelKo: entry.labelKo,
      role: entry.role,
      locked: Boolean(entry.locked),
      originalSrgb: entry.srgb,
      remappedSrgb: st.srgb,
      originalOklch: origLch,
      remappedOklch: alreadyClean ? origLch : { l: st.l, c: st.c, hDeg: st.hDeg },
      normalVisionShiftDeltaE: shift,
      simulatedByType: st.sims,
    };
  });

  const meanNormalShiftDeltaE = unlockedCount > 0 ? shiftSum / unlockedCount : 0;
  const allPairsDistinguishable =
    afterAudit.confusionPairs.length === 0 &&
    afterAudit.minNormalDeltaE >= minDistinguishableDeltaE;
  const summaryKo = alreadyClean
    ? "모든 팔레트 쌍이 이미 3종 색각 이상 기준치를 충족하여 원색을 그대로 유지했습니다."
    : allPairsDistinguishable
      ? `혼동 색상 ${beforeAudit.confusionPairs.length}쌍을 평균 색차 변위 ΔE ${meanNormalShiftDeltaE.toFixed(3)}만으로 분리해 적·녹·청 3종 색각 이상 기준을 모두 통과했습니다.`
      : `남은 혼동 쌍 ${afterAudit.confusionPairs.length}건이 있어 고정(locked) 항목 해제나 보조 무늬 병행을 권장합니다.`;

  return {
    entries: remappedEntries,
    beforeAudit,
    afterAudit,
    meanNormalShiftDeltaE,
    maxNormalShiftDeltaE,
    allPairsDistinguishable,
    iterationsUsed,
    summaryKo,
  };
}
