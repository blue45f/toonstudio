/**
 * Wave-32: ISO 12647 도트 게인(TVI) 역보정 및 무로제트(Rosette-Free) 서펜타인 Stucki 확률적 FM 망점 프루퍼.
 *
 * 오프셋 단행본 인쇄 시 전통적 AM 각도 망점(C 15° · M 75° · Y 0° · K 45°)에서 발생하는 모아레 로제트와
 * 용지 잉크 번짐(기계적·광학적 도트 게인)을 Yule-Nielsen 역변환 및 양방향 Stucki 오차 확산으로 해결한다.
 */

export type PrintPaperStockId = "coated-art-150g" | "matte-ivory-120g" | "uncoated-comic-80g";

export interface PaperDotGainProfile {
  readonly stockId: PrintPaperStockId;
  readonly labelKo: string;
  /** Yule-Nielsen 광학 산란 지수 n (1.0 = 순수 면적 비례, >1.0 = 용지 내부 광산란) */
  readonly yuleNielsenN: number;
  /** 50% 망점 입력 시 추가되는 기계적 잉크 번짐 비율 (0..0.30) */
  readonly midtoneMechanicalGain: number;
  /** 최대 총 잉크량 한도 (%) */
  readonly maxTacPercent: number;
}

export const PAPER_DOT_GAIN_PROFILES: Readonly<Record<PrintPaperStockId, PaperDotGainProfile>> = {
  "coated-art-150g": {
    stockId: "coated-art-150g",
    labelKo: "표지용 아트지 150g (유광 코팅)",
    yuleNielsenN: 1.55,
    midtoneMechanicalGain: 0.09,
    maxTacPercent: 300,
  },
  "matte-ivory-120g": {
    stockId: "matte-ivory-120g",
    labelKo: "단행본 미색 모조지 120g",
    yuleNielsenN: 1.85,
    midtoneMechanicalGain: 0.14,
    maxTacPercent: 280,
  },
  "uncoated-comic-80g": {
    stockId: "uncoated-comic-80g",
    labelKo: "만화 잡지 비코팅 갱지 80g",
    yuleNielsenN: 2.15,
    midtoneMechanicalGain: 0.2,
    maxTacPercent: 240,
  },
};

export interface CmkyScreenAnglesDeg {
  readonly cyan: number;
  readonly magenta: number;
  readonly yellow: number;
  readonly black: number;
}

export const STANDARD_CMYK_AM_ANGLES_DEG: CmkyScreenAnglesDeg = {
  cyan: 15,
  magenta: 75,
  yellow: 0,
  black: 45,
};

export interface HalftonePlateResult {
  readonly width: number;
  readonly height: number;
  /** 0 또는 1 이진 판면 마스크 */
  readonly binaryDots: Uint8Array;
  readonly targetMeanCoverage: number;
  readonly actualMeanCoverage: number;
  readonly directionalBiasScore: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/**
 * 판면 도트 면적률 `plateArea` (0..1)가 주어진 용지에 인쇄되었을 때
 * 독자 눈에 인지되는 실효 농도 면적률(Effective Tone Value, 0..1)을 Yule-Nielsen 모델로 예측한다.
 */
export function predictPrintedToneYuleNielsen(
  plateArea: number,
  profile: PaperDotGainProfile,
): number {
  const a = clamp01(plateArea);
  if (a === 0 || a === 1) return a;

  // 포물선형 기계적 번짐: 0%와 100%에서는 0, 50%에서 midtoneMechanicalGain 정점
  const expanded = clamp01(a + 4 * profile.midtoneMechanicalGain * a * (1 - a));
  const n = Math.max(1, profile.yuleNielsenN);
  // Yule-Nielsen: R_eff = (1 - a * (1 - R_ink^(1/n)))^n, 완전 흑색 잉크(R_ink = 0) 근사 시 T_eff = 1 - (1 - a)^n
  return clamp01(1 - Math.pow(1 - expanded, n));
}

/**
 * 목표 시각 농도 `desiredVisualTone` (0..1)을 달성하기 위해 인쇄 판면에 기록해야 할
 * 도트 게인 역보정 면적률(0..1)을 단조 이진 탐색(32회 반복, 오차 < 1e-9)으로 구한다.
 */
export function compensateDotGainForPlate(
  desiredVisualTone: number,
  profile: PaperDotGainProfile,
): number {
  const target = clamp01(desiredVisualTone);
  if (target === 0 || target === 1) return target;

  let lo = 0;
  let hi = 1;
  for (let iter = 0; iter < 32; iter += 1) {
    const mid = 0.5 * (lo + hi);
    const predicted = predictPrintedToneYuleNielsen(mid, profile);
    if (predicted < target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return 0.5 * (lo + hi);
}

/**
 * 회전 코사인 스팟 함수 기반 전통 AM 망점 판면을 생성한다.
 */
export function halftonePlateRotatedAm(
  tonePlane: Float32Array,
  width: number,
  height: number,
  angleDeg: number,
  periodPx: number,
): HalftonePlateResult {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const total = safeW * safeH;
  const out = new Uint8Array(total);
  const rad = (angleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const freq = (2 * Math.PI) / Math.max(2, periodPx);

  let targetSum = 0;
  let onCount = 0;
  for (let y = 0; y < safeH; y += 1) {
    for (let x = 0; x < safeW; x += 1) {
      const idx = y * safeW + x;
      const tone = clamp01(tonePlane[idx] ?? 0);
      targetSum += tone;
      if (tone <= 0) continue;
      if (tone >= 1) {
        out[idx] = 1;
        onCount += 1;
        continue;
      }
      const u = x * cosA + y * sinA;
      const v = -x * sinA + y * cosA;
      const spot = 0.5 - 0.25 * (Math.cos(u * freq) + Math.cos(v * freq));
      if (tone > spot) {
        out[idx] = 1;
        onCount += 1;
      }
    }
  }

  return {
    width: safeW,
    height: safeH,
    binaryDots: out,
    targetMeanCoverage: targetSum / total,
    actualMeanCoverage: onCount / total,
    directionalBiasScore: measureHorizontalVerticalBias(out, safeW, safeH),
  };
}

/**
 * 짝·홀수 행을 교차 스캔(Serpentine)하는 12-이웃 Stucki(분모 42) 확률적 FM 오차 확산 하프토너.
 * 로제트 모아레를 원천 제거하며 평균 농도를 정밀 보존한다.
 */
export function halftonePlateStuckiSerpentine(
  tonePlane: Float32Array,
  width: number,
  height: number,
  profile?: PaperDotGainProfile,
): HalftonePlateResult {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const total = safeW * safeH;
  const work = new Float64Array(total);
  const out = new Uint8Array(total);

  let targetSum = 0;
  for (let i = 0; i < total; i += 1) {
    const raw = clamp01(tonePlane[i] ?? 0);
    const compensated = profile ? compensateDotGainForPlate(raw, profile) : raw;
    work[i] = compensated;
    targetSum += compensated;
  }

  // Stucki 커널 (분모 42):
  //         *   8   4
  // 2   4   8   4   2
  // 1   2   4   2   1
  const offsets: ReadonlyArray<readonly [number, number, number]> = [
    [1, 0, 6 / 42],
    [2, 0, 3 / 42],
    [-2, 1, 2 / 42],
    [-1, 1, 5 / 42],
    [0, 1, 9 / 42],
    [1, 1, 5 / 42],
    [2, 1, 2 / 42],
    [-2, 2, 1 / 42],
    [-1, 2, 2 / 42],
    [0, 2, 4 / 42],
    [1, 2, 2 / 42],
    [2, 2, 1 / 42],
  ];

  let onCount = 0;
  for (let y = 0; y < safeH; y += 1) {
    const reverse = (y & 1) === 1;
    const dir = reverse ? -1 : 1;
    const startX = reverse ? safeW - 1 : 0;

    for (let step = 0; step < safeW; step += 1) {
      const x = startX + step * dir;
      const idx = y * safeW + x;
      const val = work[idx] ?? 0;
      const ignPhase = 0.06711056 * x + 0.00583715 * y;
      const ignFract = ignPhase - Math.floor(ignPhase);
      const ignRaw = 52.9829189 * ignFract;
      const ign = ignRaw - Math.floor(ignRaw) - 0.5;
      const threshold = 0.5 + ign * 0.18;
      const bit = val >= threshold ? 1 : 0;
      out[idx] = bit;
      if (bit === 1) onCount += 1;
      const err = val - bit;
      if (err === 0) continue;

      for (const [dx, dy, weight] of offsets) {
        const nx = x + dx * dir;
        const ny = y + dy;
        if (nx >= 0 && nx < safeW && ny >= 0 && ny < safeH) {
          const nIdx = ny * safeW + nx;
          work[nIdx] = (work[nIdx] ?? 0) + err * weight;
        }
      }
    }
  }

  return {
    width: safeW,
    height: safeH,
    binaryDots: out,
    targetMeanCoverage: targetSum / total,
    actualMeanCoverage: onCount / total,
    directionalBiasScore: measureHorizontalVerticalBias(out, safeW, safeH),
  };
}

function measureHorizontalVerticalBias(dots: Uint8Array, width: number, height: number): number {
  if (width < 2 || height < 2) return 0;
  let horizSame = 0;
  let horizPairs = 0;
  let vertSame = 0;
  let vertPairs = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x + 1 < width; x += 1) {
      if (dots[y * width + x] === dots[y * width + x + 1]) horizSame += 1;
      horizPairs += 1;
    }
  }
  for (let y = 0; y + 1 < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (dots[y * width + x] === dots[(y + 1) * width + x]) vertSame += 1;
      vertPairs += 1;
    }
  }

  const hRate = horizPairs > 0 ? horizSame / horizPairs : 0;
  const vRate = vertPairs > 0 ? vertSame / vertPairs : 0;
  return Math.abs(hRate - vRate);
}
