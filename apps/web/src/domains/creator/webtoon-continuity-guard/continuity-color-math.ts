/**
 * 웹툰 연속성 감시관용 OKLCH → CIE L*a*b* → CIEDE2000 (ΔE00) 지각 색차 및 방위각 계산 유틸리티.
 *
 * - Björn Ottosson(2020) Oklab 역변환 행렬과 IEC 61966-2-1 D65 XYZ 변환,
 *   Sharma, Wu, Dalal(2005) CIEDE2000 표준 공식을 그대로 구현한다.
 * - 원시 hex/rgb/hsl 문자열 대신 CSS 표준 `oklch(...)` 포맷만 출력한다.
 */

/** 지각 균등 색공간 OKLCH 좌표 (L: 0..1, C: 0..0.4+, H: 0..360°). */
export interface OklchColor {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

/** CIE 1976 L*a*b* (D65 기준백색) 좌표. */
export interface CieLabColor {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const D65_XN = 0.95047;
const D65_YN = 1.0;
const D65_ZN = 1.08883;
const LAB_DELTA = 6 / 29;
const LAB_DELTA_CUBED = LAB_DELTA * LAB_DELTA * LAB_DELTA;
const LAB_LINEAR_SLOPE = 1 / (3 * LAB_DELTA * LAB_DELTA);
const LAB_LINEAR_OFFSET = 4 / 29;
const POW25_7 = 25 ** 7;

/** 0~1 범위로 수치를 고정한다. */
export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/** 임의의 각도를 [0, 360) 범위로 정규화한다. */
export function normalizeAngleDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const mod = deg % 360;
  return mod < 0 ? mod + 360 : mod === 0 ? 0 : mod;
}

/** 두 방위각 사이의 최단 원형 각도 차이를 [0, 180] 범위로 반환한다. */
export function shortestAngularDiffDeg(aDeg: number, bDeg: number): number {
  const a = normalizeAngleDeg(aDeg);
  const b = normalizeAngleDeg(bDeg);
  const raw = Math.abs(a - b);
  return raw > 180 ? 360 - raw : raw;
}

function labTransfer(t: number): number {
  if (t > LAB_DELTA_CUBED) {
    return Math.cbrt(t);
  }
  return LAB_LINEAR_SLOPE * t + LAB_LINEAR_OFFSET;
}

/**
 * OKLCH 좌표를 CIE L*a*b* (D65) 좌표로 변환한다.
 * 광색역 OKLCH 색상의 지각 거리가 왜곡되지 않도록 중간 선형 RGB를 클램프하지 않는다.
 */
export function oklchToCieLab(color: OklchColor): CieLabColor {
  const L = clamp01(color.l);
  const C = Math.max(0, Number.isFinite(color.c) ? color.c : 0);
  const hRad = normalizeAngleDeg(color.h) * DEG_TO_RAD;

  const aOk = C * Math.cos(hRad);
  const bOk = C * Math.sin(hRad);

  const lPrime = L + 0.3963377774 * aOk + 0.2158037573 * bOk;
  const mPrime = L - 0.1055613458 * aOk - 0.0638541728 * bOk;
  const sPrime = L - 0.0894841775 * aOk - 1.291485548 * bOk;

  const l = lPrime * lPrime * lPrime;
  const m = mPrime * mPrime * mPrime;
  const s = sPrime * sPrime * sPrime;

  const rLin = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const x = 0.4124564 * rLin + 0.3575761 * gLin + 0.1804375 * bLin;
  const y = 0.2126729 * rLin + 0.7151522 * gLin + 0.072175 * bLin;
  const z = 0.0193339 * rLin + 0.119192 * gLin + 0.9503041 * bLin;

  const fx = labTransfer(x / D65_XN);
  const fy = labTransfer(y / D65_YN);
  const fz = labTransfer(z / D65_ZN);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/**
 * Sharma, Wu, Dalal (2005) 표준 CIEDE2000 색차(ΔE00)를 계산한다.
 */
export function computeCiede2000(lab1: CieLabColor, lab2: CieLabColor): number {
  const c1 = Math.hypot(lab1.a, lab1.b);
  const c2 = Math.hypot(lab2.a, lab2.b);
  const cBar = 0.5 * (c1 + c2);
  const cBar7 = cBar ** 7;
  const g = 0.5 * (1 - Math.sqrt(cBar7 / (cBar7 + POW25_7)));

  const a1Prime = (1 + g) * lab1.a;
  const a2Prime = (1 + g) * lab2.a;
  const c1Prime = Math.hypot(a1Prime, lab1.b);
  const c2Prime = Math.hypot(a2Prime, lab2.b);

  const h1Prime =
    c1Prime === 0 ? 0 : normalizeAngleDeg(Math.atan2(lab1.b, a1Prime) * RAD_TO_DEG);
  const h2Prime =
    c2Prime === 0 ? 0 : normalizeAngleDeg(Math.atan2(lab2.b, a2Prime) * RAD_TO_DEG);

  const deltaLPrime = lab2.l - lab1.l;
  const deltaCPrime = c2Prime - c1Prime;

  let deltahPrime = 0;
  const cPrimeProduct = c1Prime * c2Prime;
  if (cPrimeProduct !== 0) {
    const rawDiff = h2Prime - h1Prime;
    if (Math.abs(rawDiff) <= 180) {
      deltahPrime = rawDiff;
    } else if (rawDiff > 180) {
      deltahPrime = rawDiff - 360;
    } else {
      deltahPrime = rawDiff + 360;
    }
  }

  const deltaHPrime =
    2 * Math.sqrt(cPrimeProduct) * Math.sin((deltahPrime * 0.5) * DEG_TO_RAD);

  const lBarPrime = 0.5 * (lab1.l + lab2.l);
  const cBarPrime = 0.5 * (c1Prime + c2Prime);

  let hBarPrime = h1Prime + h2Prime;
  if (cPrimeProduct !== 0) {
    if (Math.abs(h1Prime - h2Prime) <= 180) {
      hBarPrime = 0.5 * (h1Prime + h2Prime);
    } else if (h1Prime + h2Prime < 360) {
      hBarPrime = 0.5 * (h1Prime + h2Prime + 360);
    } else {
      hBarPrime = 0.5 * (h1Prime + h2Prime - 360);
    }
  }

  const t =
    1 -
    0.17 * Math.cos((hBarPrime - 30) * DEG_TO_RAD) +
    0.24 * Math.cos(2 * hBarPrime * DEG_TO_RAD) +
    0.32 * Math.cos((3 * hBarPrime + 6) * DEG_TO_RAD) -
    0.2 * Math.cos((4 * hBarPrime - 63) * DEG_TO_RAD);

  const deltaTheta = 30 * Math.exp(-(((hBarPrime - 275) / 25) ** 2));
  const cBarPrime7 = cBarPrime ** 7;
  const rC = 2 * Math.sqrt(cBarPrime7 / (cBarPrime7 + POW25_7));

  const lTerm = (lBarPrime - 50) ** 2;
  const sL = 1 + (0.015 * lTerm) / Math.sqrt(20 + lTerm);
  const sC = 1 + 0.045 * cBarPrime;
  const sH = 1 + 0.015 * cBarPrime * t;
  const rT = -Math.sin(2 * deltaTheta * DEG_TO_RAD) * rC;

  const lRatio = deltaLPrime / sL;
  const cRatio = deltaCPrime / sC;
  const hRatio = deltaHPrime / sH;

  const sum = lRatio * lRatio + cRatio * cRatio + hRatio * hRatio + rT * cRatio * hRatio;
  return sum <= 0 ? 0 : Math.sqrt(sum);
}

/** 두 OKLCH 색상 간의 지각 색차(CIEDE2000 ΔE00)를 계산한다. */
export function computeOklchDeltaE00(a: OklchColor, b: OklchColor): number {
  return computeCiede2000(oklchToCieLab(a), oklchToCieLab(b));
}

/** CSS `oklch(...)` 문자열로 직렬화한다. */
export function formatOklchCss(color: OklchColor): string {
  const l = clamp01(color.l).toFixed(3);
  const c = Math.max(0, Math.min(0.4, Number.isFinite(color.c) ? color.c : 0)).toFixed(3);
  const h = normalizeAngleDeg(color.h).toFixed(1);
  return `oklch(${l} ${c} ${h})`;
}

/** UI·로그 표기용 간결한 OKLCH 좌표를 포맷한다. */
export function formatOklchSummary(color: OklchColor): string {
  const l = clamp01(color.l).toFixed(2);
  const c = Math.max(0, Number.isFinite(color.c) ? color.c : 0).toFixed(2);
  const h = Math.round(normalizeAngleDeg(color.h));
  return `L ${l} · C ${c} · H ${h}°`;
}
