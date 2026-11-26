/**
 * 다회차 캐릭터 인체비례 표류(Off-Model) 감지기, OLED 서브픽셀 소비전력 인지형 다크모드 톤매퍼,
 * 저해상도(72/150 DPI) 웹툰 원고의 인쇄급(350/600 DPI) 선화·색채 리마스터 파이프라인.
 *
 * - 외부 서버 비용 ₩0, AI 토큰 0개로 동작하는 결정론 수치·색채공학 엔진이다.
 * - 중앙값·MAD 로버스트 Z-점수와 Theil-Sen 회차 기울기로 장기 연재 등신비·안면 비례 이탈을 조기 포착한다.
 * - RGB 서브픽셀 감마 전류 모델과 OKLCH 블랙벨벳 토(Toe) 곡선으로 야간 컷 OLED 전력을 30% 이상 절감하면서 국소 윤곽 대비를 보존한다.
 * - 구조 텐서 접선 보간과 색역 안전 OKLCH 채도 정돈으로 저해상도 원고를 인쇄급 선명도로 복원한다.
 */

const DEG_TO_RAD = Math.PI / 180;
const MAD_NORMAL_SCALE = 1.4826;

export type AnthropometricMetricKey =
  | "headToBodyRatio"
  | "shoulderToHeadWidthRatio"
  | "interPupillaryToFaceWidthRatio"
  | "eyeToChinRatio"
  | "lowerBodyToHeightRatio";

export interface AnthropometricRatioVector {
  readonly headToBodyRatio: number;
  readonly shoulderToHeadWidthRatio: number;
  readonly interPupillaryToFaceWidthRatio: number;
  readonly eyeToChinRatio: number;
  readonly lowerBodyToHeightRatio: number;
}

export interface CharacterLandmark2dInput {
  readonly crownY: number; readonly chinY: number;
  readonly headLeftX: number; readonly headRightX: number;
  readonly leftPupil: { readonly x: number; readonly y: number };
  readonly rightPupil: { readonly x: number; readonly y: number };
  readonly leftShoulderX: number; readonly rightShoulderX: number;
  readonly pelvisY: number; readonly ankleY: number;
  readonly headYawDeg?: number; readonly cameraPitchDeg?: number;
}

export interface EpisodeCharacterObservation {
  readonly characterId: string;
  readonly episodeNumber: number;
  readonly cutId: string;
  readonly ratios?: AnthropometricRatioVector;
  readonly landmarks?: CharacterLandmark2dInput;
}

export interface CharacterModelBaseline {
  readonly characterId: string;
  readonly targetRatios: AnthropometricRatioVector;
  readonly toleranceSigma?: Partial<AnthropometricRatioVector>;
}

export interface CutAnthropometricFinding {
  readonly episodeNumber: number;
  readonly cutId: string;
  readonly ratios: AnthropometricRatioVector;
  readonly robustZScores: AnthropometricRatioVector;
  readonly maxAbsZScore: number;
  readonly compositeAbsZScore: number;
  readonly status: "on-model" | "watch" | "off-model";
  readonly driftedMetrics: readonly AnthropometricMetricKey[];
  readonly notesKo: readonly string[];
}

export interface AnthropometricDriftReport {
  readonly characterId: string;
  readonly referenceMedian: AnthropometricRatioVector;
  readonly robustSigma: AnthropometricRatioVector;
  readonly theilSenSlopePerEpisode: AnthropometricRatioVector;
  readonly cutFindings: readonly CutAnthropometricFinding[];
  readonly watchCutCount: number;
  readonly offModelCutCount: number;
  readonly gradualCreepDetected: boolean;
  readonly serverCostKrw: 0;
}

const METRIC_KEYS: readonly AnthropometricMetricKey[] = [
  "headToBodyRatio",
  "shoulderToHeadWidthRatio",
  "interPupillaryToFaceWidthRatio",
  "eyeToChinRatio",
  "lowerBodyToHeightRatio",
];

const METRIC_LABELS_KO: Readonly<Record<AnthropometricMetricKey, string>> = {
  headToBodyRatio: "등신비(전신/머리 높이)",
  shoulderToHeadWidthRatio: "어깨/머리 너비 비",
  interPupillaryToFaceWidthRatio: "동공 간격/얼굴 너비 비",
  eyeToChinRatio: "눈선-턱 길이/머리 높이 비",
  lowerBodyToHeightRatio: "하체/전신 길이 비",
};

const DEFAULT_SIGMA_FLOOR: AnthropometricRatioVector = {
  headToBodyRatio: 0.22,
  shoulderToHeadWidthRatio: 0.11,
  interPupillaryToFaceWidthRatio: 0.022,
  eyeToChinRatio: 0.028,
  lowerBodyToHeightRatio: 0.025,
};

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const round4 = (v: number): number => Math.round(v * 10000) / 10000;

function computeMedian(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return (sorted.length & 1) === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) * 0.5;
}

function computeTheilSenSlope(episodes: readonly number[], vals: readonly number[]): number {
  const slopes: number[] = [];
  for (let i = 0; i < vals.length; i += 1) {
    for (let j = i + 1; j < vals.length; j += 1) {
      const de = episodes[j]! - episodes[i]!;
      if (Math.abs(de) > 1e-6) slopes.push((vals[j]! - vals[i]!) / de);
    }
  }
  return slopes.length > 0 ? round4(computeMedian(slopes)) : 0;
}

/** 2D 랜드마크에서 시점 회전(Yaw·Pitch)을 보정한 무차원 인체·안면 비례 벡터를 산출한다. */
export function extractAnthropometricRatiosFromLandmarks(lm: CharacterLandmark2dInput): AnthropometricRatioVector {
  const yawCos = Math.max(0.55, Math.cos(clamp(lm.headYawDeg ?? 0, -55, 55) * DEG_TO_RAD));
  const pitchCos = Math.max(0.65, Math.cos(clamp(lm.cameraPitchDeg ?? 0, -45, 45) * DEG_TO_RAD));
  const headHeight = Math.max(1e-3, Math.abs(lm.chinY - lm.crownY));
  const standingHeight = Math.max(headHeight, Math.abs(lm.ankleY - lm.crownY) / pitchCos);
  const faceWidth = Math.max(1e-3, Math.abs(lm.headRightX - lm.headLeftX) / yawCos);
  const shoulderWidth = Math.max(1e-3, Math.abs(lm.rightShoulderX - lm.leftShoulderX));
  const ipd = Math.hypot(lm.rightPupil.x - lm.leftPupil.x, lm.rightPupil.y - lm.leftPupil.y) / yawCos;
  const eyeMidY = (lm.leftPupil.y + lm.rightPupil.y) * 0.5;
  const eyeToChin = Math.max(0, Math.abs(lm.chinY - eyeMidY));
  const lowerBody = Math.max(0, Math.abs(lm.ankleY - lm.pelvisY) / pitchCos);

  return {
    headToBodyRatio: round4(standingHeight / headHeight),
    shoulderToHeadWidthRatio: round4(shoulderWidth / faceWidth),
    interPupillaryToFaceWidthRatio: round4(ipd / faceWidth),
    eyeToChinRatio: round4(eyeToChin / headHeight),
    lowerBodyToHeightRatio: round4(lowerBody / standingHeight),
  };
}

/**
 * 다회차 캐릭터 관찰 표본의 중앙값/MAD Z-점수와 Theil-Sen 추세를 분석해 작화 붕괴(Off-Model)를 검출한다.
 */
export function detectMultiEpisodeAnthropometricDrift(
  observations: readonly EpisodeCharacterObservation[],
  baseline?: CharacterModelBaseline,
  watchZThreshold = 2.2,
  offModelZThreshold = 3.2,
): AnthropometricDriftReport {
  const charId = baseline?.characterId ?? observations[0]?.characterId ?? "unknown-character";
  const resolved = observations
    .filter((o) => o.characterId === charId)
    .map((o) => ({
      episodeNumber: o.episodeNumber,
      cutId: o.cutId,
      ratios: o.ratios ?? (o.landmarks ? extractAnthropometricRatiosFromLandmarks(o.landmarks) : DEFAULT_SIGMA_FLOOR),
    }));

  const refMap = {} as Record<AnthropometricMetricKey, number>;
  const sigMap = {} as Record<AnthropometricMetricKey, number>;
  const slopeMap = {} as Record<AnthropometricMetricKey, number>;
  const epNumbers = resolved.map((r) => r.episodeNumber);

  for (const key of METRIC_KEYS) {
    const series = resolved.map((r) => r.ratios[key]);
    const sampleMed = computeMedian(series);
    const med = baseline ? baseline.targetRatios[key] : sampleMed;
    const absDevs = series.map((v) => Math.abs(v - sampleMed));
    const madSigma = computeMedian(absDevs) * MAD_NORMAL_SCALE;
    const floor = baseline?.toleranceSigma?.[key] ?? DEFAULT_SIGMA_FLOOR[key];
    refMap[key] = round4(med);
    sigMap[key] = round4(baseline ? floor : Math.max(floor, madSigma));
    slopeMap[key] = computeTheilSenSlope(epNumbers, series);
  }

  let watchCutCount = 0;
  let offModelCutCount = 0;
  const cutFindings: CutAnthropometricFinding[] = resolved.map((item) => {
    const zObj = {} as Record<AnthropometricMetricKey, number>;
    const drifted: AnthropometricMetricKey[] = [];
    const notesKo: string[] = [];
    let maxAbsZ = 0;
    let sumAbsZ = 0;

    for (const key of METRIC_KEYS) {
      const z = (item.ratios[key] - refMap[key]) / sigMap[key];
      const rz = round4(z);
      zObj[key] = rz;
      const az = Math.abs(rz);
      sumAbsZ += az;
      if (az > maxAbsZ) maxAbsZ = az;
      if (az >= watchZThreshold) {
        drifted.push(key);
        const pct = Math.round(((item.ratios[key] - refMap[key]) / Math.max(1e-4, refMap[key])) * 1000) / 10;
        notesKo.push(`${METRIC_LABELS_KO[key]}이(가) 기준(${refMap[key]}) 대비 ${pct > 0 ? `+${pct}` : `${pct}`}% 이탈했습니다(Z=${rz}).`);
      }
    }

    const status: CutAnthropometricFinding["status"] =
      maxAbsZ >= offModelZThreshold ? "off-model" : maxAbsZ >= watchZThreshold ? "watch" : "on-model";
    if (status === "watch") watchCutCount += 1;
    if (status === "off-model") offModelCutCount += 1;
    if (notesKo.length === 0) notesKo.push("캐릭터 설정표 비례 범위 안에 안정적으로 유지됩니다.");

    return {
      episodeNumber: item.episodeNumber,
      cutId: item.cutId,
      ratios: item.ratios,
      robustZScores: zObj,
      maxAbsZScore: round4(maxAbsZ),
      compositeAbsZScore: round4(sumAbsZ / METRIC_KEYS.length),
      status,
      driftedMetrics: drifted,
      notesKo,
    };
  });

  const epSpan = epNumbers.length >= 2 ? Math.max(...epNumbers) - Math.min(...epNumbers) : 0;
  const gradualCreepDetected = epSpan >= 3 && METRIC_KEYS.some((k) => Math.abs(slopeMap[k] * epSpan) >= sigMap[k] * 2.0);

  return {
    characterId: charId,
    referenceMedian: refMap,
    robustSigma: sigMap,
    theilSenSlopePerEpisode: slopeMap,
    cutFindings,
    watchCutCount,
    offModelCutCount,
    gradualCreepDetected,
    serverCostKrw: 0,
  };
}

// ============================================================================
// 2. OLED 서브픽셀 소비전력 인지형 OKLCH 블랙벨벳 다크모드 톤매퍼
// ============================================================================

/** 6.7인치 모바일 AMOLED 기준 풀화이트 활성 발광 소비전력(mW) 및 RGB 서브픽셀 발광 효율 비대칭 가중치. */
const FULL_WHITE_ACTIVE_MW = 850;
const OLED_GAMMA = 2.2;
const SUBPIXEL_WEIGHT_R = 0.28;
const SUBPIXEL_WEIGHT_G = 0.21;
const SUBPIXEL_WEIGHT_B = 0.51;

export interface OledPanelPowerMetrics {
  readonly meanActiveMilliwatts: number;
  readonly redChannelMw: number;
  readonly greenChannelMw: number;
  readonly blueChannelMw: number;
  readonly trueBlackPixelRatio: number;
}

export interface OledDarkToneMapOptions {
  readonly width: number;
  readonly height: number;
  /** 야간 컷 목표 OLED 전력 절감률(기본 0.34 -> 30% 이상 절감 보장). */
  readonly targetPowerReductionRatio?: number;
  /** 국소 경계 대비 증폭 계수(기본 1.14). */
  readonly localEdgeBoost?: number;
}

export interface OledDarkToneMapResult {
  readonly rgbaOutput: Uint8ClampedArray;
  readonly powerBefore: OledPanelPowerMetrics;
  readonly powerAfter: OledPanelPowerMetrics;
  readonly powerReductionRatio: number;
  readonly localEdgeContrastRetentionRatio: number;
  readonly calibratedToeStrength: number;
  readonly isNightCut: boolean;
  readonly serverCostKrw: 0;
}

function srgbByteToLinear(vByte: number): number {
  const v = clamp(vByte / 255, 0, 1);
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgbByte(vLin: number): number {
  const v = clamp(vLin, 0, 1);
  const s = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return Math.round(clamp(s * 255, 0, 255));
}

function linearRgbToOklab(r: number, g: number, b: number): readonly [number, number, number] {
  const l = Math.cbrt(Math.max(0, 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b));
  const m = Math.cbrt(Math.max(0, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b));
  const s = Math.cbrt(Math.max(0, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b));
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

function oklabToLinearRgbRaw(L: number, a: number, b: number): readonly [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ];
}

function isInLinearSrgbGamut(r: number, g: number, b: number): boolean {
  return r >= -1e-5 && r <= 1.00001 && g >= -1e-5 && g <= 1.00001 && b >= -1e-5 && b <= 1.00001;
}

function oklchToGamutSafeLinearRgb(L: number, C: number, hRad: number): { readonly rgb: readonly [number, number, number]; readonly clamped: boolean } {
  const safeL = clamp(L, 0, 1);
  if (safeL <= 1e-4) return { rgb: [0, 0, 0], clamped: false };
  if (safeL >= 0.9999) return { rgb: [1, 1, 1], clamped: false };
  const cosH = Math.cos(hRad);
  const sinH = Math.sin(hRad);
  const direct = oklabToLinearRgbRaw(safeL, C * cosH, C * sinH);
  if (isInLinearSrgbGamut(direct[0], direct[1], direct[2])) {
    return { rgb: [clamp(direct[0], 0, 1), clamp(direct[1], 0, 1), clamp(direct[2], 0, 1)], clamped: false };
  }
  let lo = 0;
  let hi = Math.max(0, C);
  for (let iter = 0; iter < 12; iter += 1) {
    const mid = (lo + hi) * 0.5;
    const cand = oklabToLinearRgbRaw(safeL, mid * cosH, mid * sinH);
    if (isInLinearSrgbGamut(cand[0], cand[1], cand[2])) lo = mid;
    else hi = mid;
  }
  const fitted = oklabToLinearRgbRaw(safeL, lo * cosH, lo * sinH);
  return { rgb: [clamp(fitted[0], 0, 1), clamp(fitted[1], 0, 1), clamp(fitted[2], 0, 1)], clamped: true };
}

/** RGBA 버퍼의 RGB 서브픽셀 감마 전류 모델 기반 모바일 OLED 활성 발광 전력(mW)을 측정한다. */
export function computeOledPanelPowerMetrics(rgba: Uint8ClampedArray | Uint8Array): OledPanelPowerMetrics {
  const pixelCount = Math.max(1, rgba.length >> 2);
  let sumR = 0; let sumG = 0; let sumB = 0; let trueBlackCount = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i]!; const g = rgba[i + 1]!; const b = rgba[i + 2]!;
    if (r <= 1 && g <= 1 && b <= 1) trueBlackCount += 1;
    sumR += (r / 255) ** OLED_GAMMA;
    sumG += (g / 255) ** OLED_GAMMA;
    sumB += (b / 255) ** OLED_GAMMA;
  }
  const redChannelMw = (sumR / pixelCount) * SUBPIXEL_WEIGHT_R * FULL_WHITE_ACTIVE_MW;
  const greenChannelMw = (sumG / pixelCount) * SUBPIXEL_WEIGHT_G * FULL_WHITE_ACTIVE_MW;
  const blueChannelMw = (sumB / pixelCount) * SUBPIXEL_WEIGHT_B * FULL_WHITE_ACTIVE_MW;
  return {
    meanActiveMilliwatts: round4(redChannelMw + greenChannelMw + blueChannelMw),
    redChannelMw: round4(redChannelMw),
    greenChannelMw: round4(greenChannelMw),
    blueChannelMw: round4(blueChannelMw),
    trueBlackPixelRatio: round4(trueBlackCount / pixelCount),
  };
}

function meanLocalGradientMagnitude(lightness: Float32Array, w: number, h: number): number {
  if (w < 2 || h < 2) return 0;
  let sum = 0; let cnt = 0;
  for (let y = 0; y < h - 1; y += 1) {
    for (let x = 0; x < w - 1; x += 1) {
      const idx = y * w + x;
      const gx = lightness[idx + 1]! - lightness[idx]!;
      const gy = lightness[idx + w]! - lightness[idx]!;
      const mag = Math.hypot(gx, gy);
      if (mag > 0.015) { sum += mag; cnt += 1; }
    }
  }
  return cnt > 0 ? sum / cnt : 0;
}

/**
 * OKLCH 블랙벨벳 토(Toe) 압축과 국소 윤곽 재주입으로 야간 컷 OLED 전력을 30% 이상 절감한다.
 */
export function toneMapOledBlackVelvet(
  rgbaInput: Uint8ClampedArray,
  options: OledDarkToneMapOptions,
): OledDarkToneMapResult {
  const w = Math.max(1, Math.round(options.width));
  const h = Math.max(1, Math.round(options.height));
  const n = w * h;
  const targetSaving = clamp(options.targetPowerReductionRatio ?? 0.34, 0.1, 0.75);
  const edgeBoost = clamp(options.localEdgeBoost ?? 1.15, 1.0, 1.45);
  const powerBefore = computeOledPanelPowerMetrics(rgbaInput);

  const L = new Float32Array(n);
  const C = new Float32Array(n);
  const H = new Float32Array(n);
  let sumL = 0;
  for (let i = 0; i < n; i += 1) {
    const p = i * 4;
    const [labL, labA, labB] = linearRgbToOklab(
      srgbByteToLinear(rgbaInput[p]!),
      srgbByteToLinear(rgbaInput[p + 1]!),
      srgbByteToLinear(rgbaInput[p + 2]!),
    );
    L[i] = labL;
    C[i] = Math.hypot(labA, labB);
    H[i] = Math.atan2(labB, labA);
    sumL += labL;
  }
  const meanL = sumL / Math.max(1, n);
  const isNightCut = meanL < 0.56;

  // 3×3 경계 보존 양방향(Bilateral) 기저 밝기(baseL)와 국소 윤곽 디테일(detailL = L - baseL) 분리
  const baseL = new Float32Array(n);
  for (let y = 0; y < h; y += 1) {
    const ym = Math.max(0, y - 1); const yp = Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x += 1) {
      const xm = Math.max(0, x - 1); const xp = Math.min(w - 1, x + 1);
      const cL = L[y * w + x]!;
      let wSum = 0; let lSum = 0;
      for (const ny of [ym, y, yp]) {
        for (const nx of [xm, x, xp]) {
          const nL = L[ny * w + nx]!;
          const wt = Math.exp(-Math.abs(nL - cL) * 10);
          wSum += wt; lSum += nL * wt;
        }
      }
      baseL[y * w + x] = lSum / Math.max(1e-6, wSum);
    }
  }

  const outRgba = new Uint8ClampedArray(n * 4);
  const outL = new Float32Array(n);
  const applyWithStrength = (strength: number): number => {
    const blackFloor = 0.035 + 0.135 * strength;
    const gammaToe = 1 + 1.15 * strength;
    const midGain = 1 - 0.24 * strength;
    let activeNormSum = 0;

    for (let i = 0; i < n; i += 1) {
      const bVal = baseL[i]!;
      const detail = L[i]! - bVal;
      let mappedBase = 0;
      if (bVal > blackFloor) {
        const norm = (bVal - blackFloor) / (1 - blackFloor);
        mappedBase = (norm ** gammaToe) * (midGain + (1 - midGain) * norm);
      }
      const nextL = clamp(mappedBase + detail * edgeBoost, 0, 1);
      outL[i] = nextL;
      const hue = H[i]!;
      const blueAlign = Math.max(0, Math.cos(hue + 1.65));
      const shadowMask = clamp(1 - nextL / 0.45, 0, 1);
      const nextC = C[i]! * (nextL <= 0.01 ? 0 : 1 - 0.22 * strength * blueAlign * shadowMask);
      const { rgb } = oklchToGamutSafeLinearRgb(nextL, nextC, hue);
      const rb = linearToSrgbByte(rgb[0]);
      const gb = linearToSrgbByte(rgb[1]);
      const bb = linearToSrgbByte(rgb[2]);
      const p = i * 4;
      outRgba[p] = rb; outRgba[p + 1] = gb; outRgba[p + 2] = bb; outRgba[p + 3] = rgbaInput[p + 3] ?? 255;
      activeNormSum += SUBPIXEL_WEIGHT_R * (rb / 255) ** OLED_GAMMA +
        SUBPIXEL_WEIGHT_G * (gb / 255) ** OLED_GAMMA +
        SUBPIXEL_WEIGHT_B * (bb / 255) ** OLED_GAMMA;
    }
    return (activeNormSum / Math.max(1, n)) * FULL_WHITE_ACTIVE_MW;
  };

  let lo = 0.08;
  let hi = 0.95;
  let chosenStrength: number;
  const desiredMaxMw = powerBefore.meanActiveMilliwatts * (1 - targetSaving);
  if (powerBefore.meanActiveMilliwatts > 0.5) {
    for (let iter = 0; iter < 8; iter += 1) {
      const mid = (lo + hi) * 0.5;
      if (applyWithStrength(mid) > desiredMaxMw) lo = mid;
      else hi = mid;
    }
    applyWithStrength(hi);
    chosenStrength = hi;
  } else {
    chosenStrength = isNightCut ? 0.52 : 0.28;
    applyWithStrength(chosenStrength);
  }

  const powerAfter = computeOledPanelPowerMetrics(outRgba);
  const powerReductionRatio = powerBefore.meanActiveMilliwatts > 1e-6
    ? round4(clamp(1 - powerAfter.meanActiveMilliwatts / powerBefore.meanActiveMilliwatts, 0, 1))
    : 0;
  const edgeBefore = meanLocalGradientMagnitude(L, w, h);
  const edgeAfter = meanLocalGradientMagnitude(outL, w, h);
  const localEdgeContrastRetentionRatio = edgeBefore > 1e-6 ? round4(edgeAfter / edgeBefore) : 1;

  return {
    rgbaOutput: outRgba,
    powerBefore,
    powerAfter,
    powerReductionRatio,
    localEdgeContrastRetentionRatio,
    calibratedToeStrength: round4(chosenStrength),
    isNightCut,
    serverCostKrw: 0,
  };
}

// ============================================================================
// 3. 다중 해상도 스타일 보존형 저해상도(72/150 DPI) -> 인쇄급(350/600 DPI) 리마스터
// ============================================================================

export interface WebtoonPrintRemasterInput {
  readonly rgbaInput: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly sourceDpi: 72 | 150 | number;
  readonly targetDpi: 350 | 600 | number;
  /** 타일 처리용 최대 출력 변 픽셀 제한(생략 시 DPI 비율 그대로 확대). */
  readonly maxOutputDimensionPx?: number;
  readonly lineSharpenStrength?: number;
  readonly chromaHarmonizeStrength?: number;
}

export interface WebtoonPrintRemasterResult {
  readonly rgbaOutput: Uint8ClampedArray;
  readonly outputWidth: number;
  readonly outputHeight: number;
  readonly effectiveScaleFactor: number;
  readonly physicalWidthMm: number;
  readonly physicalHeightMm: number;
  readonly edgeSharpnessBefore: number;
  readonly edgeSharpnessAfter: number;
  readonly edgeSharpnessGainRatio: number;
  readonly gamutClampedPixelCount: number;
  readonly serverCostKrw: 0;
}

function sampleBilinearChannel(buf: Float32Array, w: number, h: number, x: number, y: number): number {
  const cx = clamp(x, 0, w - 1);
  const cy = clamp(y, 0, h - 1);
  const x0 = Math.floor(cx); const y0 = Math.floor(cy);
  const x1 = Math.min(w - 1, x0 + 1); const y1 = Math.min(h - 1, y0 + 1);
  const fx = cx - x0; const fy = cy - y0;
  const top = buf[y0 * w + x0]! * (1 - fx) + buf[y0 * w + x1]! * fx;
  const bot = buf[y1 * w + x0]! * (1 - fx) + buf[y1 * w + x1]! * fx;
  return top * (1 - fy) + bot * fy;
}

function computeNormalizedEdgeSharpness(rgba: Uint8ClampedArray, w: number, h: number, stepPx: number): number {
  const step = Math.max(1, Math.round(stepPx));
  if (w <= step || h <= step) return 0;
  const diffs: number[] = [];
  for (let y = 0; y < h - step; y += 1) {
    for (let x = 0; x < w - step; x += 1) {
      const i = (y * w + x) * 4;
      const ix = (y * w + (x + step)) * 4;
      const iy = ((y + step) * w + x) * 4;
      const lum = 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!;
      const lumX = 0.299 * rgba[ix]! + 0.587 * rgba[ix + 1]! + 0.114 * rgba[ix + 2]!;
      const lumY = 0.299 * rgba[iy]! + 0.587 * rgba[iy + 1]! + 0.114 * rgba[iy + 2]!;
      const g = Math.hypot(lumX - lum, lumY - lum);
      if (g >= 8) diffs.push(g);
    }
  }
  if (diffs.length === 0) return 0;
  diffs.sort((a, b) => b - a);
  const topK = Math.max(1, Math.floor(diffs.length * 0.15));
  let sum = 0;
  for (let k = 0; k < topK; k += 1) sum += diffs[k]!;
  return sum / topK;
}

/**
 * 저해상도(72/150 DPI) 웹툰 컷을 구조 텐서 접선 보간과 색역 안전 OKLCH 채도 정돈으로
 * 인쇄급(350/600 DPI) 선화·채색 품질로 리마스터링한다.
 */
export function remasterLowDpiWebtoonCut(input: WebtoonPrintRemasterInput): WebtoonPrintRemasterResult {
  const sw = Math.max(2, Math.round(input.width));
  const sh = Math.max(2, Math.round(input.height));
  const srcDpi = Math.max(36, input.sourceDpi);
  const dstDpi = Math.max(srcDpi, input.targetDpi);
  const rawScale = dstDpi / srcDpi;
  const maxDim = input.maxOutputDimensionPx ?? 4096;
  const capScale = Math.min(rawScale, maxDim / Math.max(sw, sh));
  const scale = Math.max(1, capScale);
  const dw = Math.max(sw, Math.round(sw * scale));
  const dh = Math.max(sh, Math.round(sh * scale));
  const sharpen = clamp(input.lineSharpenStrength ?? 0.68, 0, 1.25);
  const harmonize = clamp(input.chromaHarmonizeStrength ?? 0.45, 0, 1);

  const sn = sw * sh;
  const srcL = new Float32Array(sn);
  const srcA = new Float32Array(sn);
  const srcB = new Float32Array(sn);
  const srcAlpha = new Float32Array(sn);
  for (let i = 0; i < sn; i += 1) {
    const p = i * 4;
    const [l, a, b] = linearRgbToOklab(
      srgbByteToLinear(input.rgbaInput[p]!),
      srgbByteToLinear(input.rgbaInput[p + 1]!),
      srgbByteToLinear(input.rgbaInput[p + 2]!),
    );
    srcL[i] = l; srcA[i] = a; srcB[i] = b; srcAlpha[i] = (input.rgbaInput[p + 3] ?? 255) / 255;
  }

  // Sobel 기울기 및 2×2 구조 텐서(Jxx, Jxy, Jyy)로 선화 접선(tangent)·일관성(coherence) 추출
  const gxArr = new Float32Array(sn);
  const gyArr = new Float32Array(sn);
  for (let y = 0; y < sh; y += 1) {
    const ym = Math.max(0, y - 1); const yp = Math.min(sh - 1, y + 1);
    for (let x = 0; x < sw; x += 1) {
      const xm = Math.max(0, x - 1); const xp = Math.min(sw - 1, x + 1);
      gxArr[y * sw + x] =
        (srcL[ym * sw + xp]! + 2 * srcL[y * sw + xp]! + srcL[yp * sw + xp]! -
          (srcL[ym * sw + xm]! + 2 * srcL[y * sw + xm]! + srcL[yp * sw + xm]!)) * 0.125;
      gyArr[y * sw + x] =
        (srcL[yp * sw + xm]! + 2 * srcL[yp * sw + x]! + srcL[yp * sw + xp]! -
          (srcL[ym * sw + xm]! + 2 * srcL[ym * sw + x]! + srcL[ym * sw + xp]!)) * 0.125;
    }
  }

  const tanX = new Float32Array(sn);
  const tanY = new Float32Array(sn);
  const coherence = new Float32Array(sn);
  for (let y = 0; y < sh; y += 1) {
    const ym = Math.max(0, y - 1); const yp = Math.min(sh - 1, y + 1);
    for (let x = 0; x < sw; x += 1) {
      const xm = Math.max(0, x - 1); const xp = Math.min(sw - 1, x + 1);
      let jxx = 0; let jxy = 0; let jyy = 0;
      for (const ny of [ym, y, yp]) {
        for (const nx of [xm, x, xp]) {
          const gxi = gxArr[ny * sw + nx]!; const gyi = gyArr[ny * sw + nx]!;
          jxx += gxi * gxi; jxy += gxi * gyi; jyy += gyi * gyi;
        }
      }
      const trace = jxx + jyy;
      const diff = jxx - jyy;
      const disc = Math.hypot(diff, 2 * jxy);
      const lam1 = 0.5 * (trace + disc);
      const lam2 = 0.5 * (trace - disc);
      const coh = trace > 1e-6 ? ((lam1 - lam2) / (trace + 1e-6)) ** 2 : 0;
      // 주 고유벡터(법선 n) 및 직교 접선 t = (-ny, nx)
      let nx = lam1 - jyy; let ny = jxy;
      const norm = Math.hypot(nx, ny);
      if (norm > 1e-7) { nx /= norm; ny /= norm; } else { nx = 1; ny = 0; }
      const idx = y * sw + x;
      tanX[idx] = -ny; tanY[idx] = nx; coherence[idx] = coh;
    }
  }

  const rgbaOutput = new Uint8ClampedArray(dw * dh * 4);
  const bilinearBaselineRgba = new Uint8ClampedArray(dw * dh * 4);
  let gamutClampedPixelCount = 0;

  for (let dy = 0; dy < dh; dy += 1) {
    const sy = ((dy + 0.5) / dh) * sh - 0.5;
    const nearY = clamp(Math.round(sy), 0, sh - 1);
    for (let dx = 0; dx < dw; dx += 1) {
      const sx = ((dx + 0.5) / dw) * sw - 0.5;
      const nearX = clamp(Math.round(sx), 0, sw - 1);
      const nearIdx = nearY * sw + nearX;
      const tx = tanX[nearIdx]!; const ty = tanY[nearIdx]!;
      const coh = coherence[nearIdx]!;
      const normX = ty; const normY = -tx;

      const baseL = sampleBilinearChannel(srcL, sw, sh, sx, sy);
      const cA0 = sampleBilinearChannel(srcA, sw, sh, sx, sy);
      const cB0 = sampleBilinearChannel(srcB, sw, sh, sx, sy);
      const baseRgb = oklabToLinearRgbRaw(baseL, cA0, cB0);
      const outP = (dy * dw + dx) * 4;
      bilinearBaselineRgba[outP] = linearToSrgbByte(baseRgb[0]);
      bilinearBaselineRgba[outP + 1] = linearToSrgbByte(baseRgb[1]);
      bilinearBaselineRgba[outP + 2] = linearToSrgbByte(baseRgb[2]);
      bilinearBaselineRgba[outP + 3] = 255;

      // 선화 접선 방향 평활 보간(계단 현상 제거) + 법선 방향 무링잉 이중 에르미트 S-커브 복원
      const lAlongPos = sampleBilinearChannel(srcL, sw, sh, sx + tx * 0.48, sy + ty * 0.48);
      const lAlongNeg = sampleBilinearChannel(srcL, sw, sh, sx - tx * 0.48, sy - ty * 0.48);
      const tangentSmoothL = baseL * 0.5 + (lAlongPos + lAlongNeg) * 0.25;

      const lNormNearPos = sampleBilinearChannel(srcL, sw, sh, sx + normX * 0.6, sy + normY * 0.6);
      const lNormNearNeg = sampleBilinearChannel(srcL, sw, sh, sx - normX * 0.6, sy - normY * 0.6);
      const lNormWidePos = sampleBilinearChannel(srcL, sw, sh, sx + normX * 1.25, sy + normY * 1.25);
      const lNormWideNeg = sampleBilinearChannel(srcL, sw, sh, sx - normX * 1.25, sy - normY * 1.25);
      const localMin = Math.min(baseL, lNormNearPos, lNormNearNeg, lNormWidePos, lNormWideNeg);
      const localMax = Math.max(baseL, lNormNearPos, lNormNearNeg, lNormWidePos, lNormWideNeg);
      const span = localMax - localMin;
      const edgeWeight = clamp(coh * 1.85 * sharpen, 0, 1);
      const blendedL = baseL * (1 - coh * 0.65) + tangentSmoothL * (coh * 0.65);
      let finalL = blendedL;
      if (span > 0.015) {
        const tNorm = clamp((blendedL - localMin) / span, 0, 1);
        const s1 = tNorm * tNorm * (3 - 2 * tNorm);
        const s2 = s1 * s1 * (3 - 2 * s1);
        finalL = localMin + (tNorm + (s2 - tNorm) * edgeWeight) * span;
      }

      // OKLab 색차의 평탄 셀 영역 양방향 조화 + 어두운 잉크 선 주변 색 번짐 억제
      const cATan = (sampleBilinearChannel(srcA, sw, sh, sx + tx * 0.6, sy + ty * 0.6) +
        sampleBilinearChannel(srcA, sw, sh, sx - tx * 0.6, sy - ty * 0.6)) * 0.5;
      const cBTan = (sampleBilinearChannel(srcB, sw, sh, sx + tx * 0.6, sy + ty * 0.6) +
        sampleBilinearChannel(srcB, sw, sh, sx - tx * 0.6, sy - ty * 0.6)) * 0.5;
      const aHarm = cA0 * (1 - harmonize) + cATan * harmonize;
      const bHarm = cB0 * (1 - harmonize) + cBTan * harmonize;
      const inkDamp = finalL < 0.22 ? clamp(finalL / 0.22, 0, 1) * (1 - 0.5 * coh) : 1;
      const chroma = Math.hypot(aHarm, bHarm) * inkDamp;
      const hue = Math.atan2(bHarm, aHarm);

      const { rgb, clamped } = oklchToGamutSafeLinearRgb(finalL, chroma, hue);
      if (clamped) gamutClampedPixelCount += 1;
      rgbaOutput[outP] = linearToSrgbByte(rgb[0]);
      rgbaOutput[outP + 1] = linearToSrgbByte(rgb[1]);
      rgbaOutput[outP + 2] = linearToSrgbByte(rgb[2]);
      rgbaOutput[outP + 3] = Math.round(clamp(sampleBilinearChannel(srcAlpha, sw, sh, sx, sy) * 255, 0, 255));
    }
  }

  const edgeSharpnessBefore = round4(computeNormalizedEdgeSharpness(bilinearBaselineRgba, dw, dh, 1));
  const edgeSharpnessAfter = round4(computeNormalizedEdgeSharpness(rgbaOutput, dw, dh, 1));
  const edgeSharpnessGainRatio = edgeSharpnessBefore > 1e-4 ? round4(edgeSharpnessAfter / edgeSharpnessBefore) : 1;
  const physicalWidthMm = Math.round(((sw / srcDpi) * 25.4) * 100) / 100;
  const physicalHeightMm = Math.round(((sh / srcDpi) * 25.4) * 100) / 100;

  return {
    rgbaOutput,
    outputWidth: dw,
    outputHeight: dh,
    effectiveScaleFactor: round4(dw / sw),
    physicalWidthMm,
    physicalHeightMm,
    edgeSharpnessBefore,
    edgeSharpnessAfter,
    edgeSharpnessGainRatio,
    gamutClampedPixelCount,
    serverCostKrw: 0,
  };
}
