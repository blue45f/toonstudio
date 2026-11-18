/**
 * Studio Export Perturbation Shield — 결정적 시드 기반 대역제한 블루노이즈(Band-Limited Blue Noise)
 * 미세 섭동 필터 및 투명한 한국어 한계 고지 메타데이터 모듈.
 *
 * 설계 원칙:
 * 1. 비결정적 난수 무사용: 시드 문자열/정수를 FNV-1a + Mulberry32 PRNG로 결정적 전개하여
 *    동일 입력·동일 시드에 대해 항상 100% 동일한 출력 픽셀을 보장한다.
 * 2. 대역제한 블루노이즈(Band-Limited Blue Noise): 토러스(toroidal) 격자 위에서 미세 가우시안과
 *    광역 가우시안의 차(DoG: Difference of Gaussians)로 저주파 얼룩(DC 평균=0)과 극단적 임펄스를
 *    동시에 억제한다.
 * 3. 에지 마스킹(Edge-Masked): 3x3 Sobel 휘도 기울기를 계산하여 평탄한 흰색 말풍선 내부·원고 여백·
 *    칸 테두리 바깥(`luma >= 245` 및 낮은 기울기)은 섭동을 `0`으로 완전 차단해 깨끗하게 보존한다.
 * 4. 정직한 고지(Honest Disclosure): 이 기능이 절대적·보장된 AI 학습 차단 기술이 아니라
 *    통계적 무단 스크래핑·특징 추출을 방해하는 보조적 억제 수단임을 메타데이터로 명시한다.
 *
 * REA 근거(clean-room math):
 * - ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68
 * - ev_c10045d52f80466e2efbf42d666690099f787c85c31682edf4b202e78622f2f1
 */

export type PerturbationIntensityLevel = 1 | 2 | 3 | 4;

export interface PerturbationShieldDisclosure {
  readonly isGuaranteedProtection: false;
  readonly kind: "statistical-scraping-deterrent";
  readonly titleKo: string;
  readonly summaryKo: string;
  readonly limitationsKo: readonly string[];
}

export const STUDIO_PERTURBATION_SHIELD_DISCLOSURE: PerturbationShieldDisclosure = Object.freeze({
  isGuaranteedProtection: false,
  kind: "statistical-scraping-deterrent",
  titleKo: "통계적 스크래핑·무단 학습 억제 보조 필터 안내",
  summaryKo:
    "이 미세 노이즈 섭동은 자동화된 대량 이미지 스크래핑 및 통계적 특징 추출을 교란하는 보조적 억제(deterrent) 수단이며, 모든 AI 학습·복제·후처리 우회를 완벽히 막아 주는 보장된 보호 수단이 아닙니다.",
  limitationsKo: Object.freeze([
    "강한 디노이징·리사이즈·재압축 파이프라인에서는 섭동 신호가 감쇠될 수 있습니다.",
    "만화 가독성 보호를 위해 흰색 말풍선 내부와 깨끗한 여백에는 노이즈를 적용하지 않습니다.",
    "법적 저작권 고지·워터마크·접근 제어 정책을 대체하지 않으며 보조 수단으로만 사용해야 합니다.",
  ]),
});

export interface ExportPerturbationShieldOptions {
  /** 섭동 강도 (`1..4`, 기본 `2`). */
  readonly intensity?: number;
  /** 결정적 시드(숫자 또는 문자열, 기본 `"toonstudio-shield-v1"`). */
  readonly seed?: number | string;
  /** 블루노이즈 타일 한 변 크기(2의 거듭제곱 권장, 기본 `32`). */
  readonly tileSize?: number;
}

export interface ExportPerturbationShieldResult {
  readonly pixels: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly intensity: PerturbationIntensityLevel;
  readonly perturbedPixelCount: number;
  readonly preservedFlatWhitePixelCount: number;
  readonly disclosure: PerturbationShieldDisclosure;
}

const INTENSITY_MAX_DELTA: Readonly<Record<PerturbationIntensityLevel, number>> = Object.freeze({
  1: 2,
  2: 4,
  3: 6,
  4: 9,
});

export function normalizePerturbationIntensity(raw?: number): PerturbationIntensityLevel {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 2;
  const rounded = Math.round(Math.min(4, Math.max(1, raw)));
  return rounded as PerturbationIntensityLevel;
}

/** FNV-1a 32-bit 해시 — 문자열/정수 시드를 결정적 32비트 무부호 정수로 변환한다. */
export function hashPerturbationSeed(seed: number | string | undefined): number {
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return (Math.imul(Math.trunc(seed), 0x9e3779b1) ^ 0x85ebca6b) >>> 0;
  }
  const text = typeof seed === "string" && seed.length > 0 ? seed : "toonstudio-shield-v1";
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 결정적 시드 PRNG (`[0, 1)` 균등 실수 반환, 시드 고정 결정론적 생성기). */
export function createDeterministicPrng(seedValue: number): () => number {
  let state = seedValue >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wrapMod(index: number, size: number): number {
  const r = index % size;
  return r < 0 ? r + size : r;
}

/** 토러스 경계 조건에서의 분리형 1D `[1, 2, 1] / 4` 이항(가우시안 근사) 스무딩 패스. */
function toroidalBinomialBlurPass(
  src: Float32Array,
  size: number,
  iterations: number,
): Float32Array {
  const current = new Float32Array(src);
  const temp = new Float32Array(size * size);

  for (let iter = 0; iter < iterations; iter += 1) {
    // 수평 패스
    for (let y = 0; y < size; y += 1) {
      const rowOffset = y * size;
      for (let x = 0; x < size; x += 1) {
        const xm1 = wrapMod(x - 1, size);
        const xp1 = wrapMod(x + 1, size);
        temp[rowOffset + x] =
          (current[rowOffset + xm1]! + 2 * current[rowOffset + x]! + current[rowOffset + xp1]!) *
          0.25;
      }
    }
    // 수직 패스
    for (let y = 0; y < size; y += 1) {
      const ym1 = wrapMod(y - 1, size) * size;
      const y0 = y * size;
      const yp1 = wrapMod(y + 1, size) * size;
      for (let x = 0; x < size; x += 1) {
        current[y0 + x] = (temp[ym1 + x]! + 2 * temp[y0 + x]! + temp[yp1 + x]!) * 0.25;
      }
    }
  }
  return current;
}

/**
 * 평균이 정확히 0이고 `[-1, 1]`로 정규화된 대역제한 블루노이즈(Band-Limited Blue Noise) 타일을 생성한다.
 * `fineBlur(1회)` - `coarseBlur(5회)` 차분을 통해 과도한 단일 픽셀 스파이크와 저주파 뭉침을 함께 제거한다.
 */
export function generateBandLimitedBlueNoiseTile(
  seed: number | string | undefined,
  tileSize = 32,
): Float32Array {
  const size = Math.max(8, Math.min(128, Math.floor(tileSize)));
  const prng = createDeterministicPrng(hashPerturbationSeed(seed));
  const white = new Float32Array(size * size);
  for (let i = 0; i < white.length; i += 1) {
    white[i] = prng() * 2 - 1;
  }

  const fine = toroidalBinomialBlurPass(white, size, 1);
  const coarse = toroidalBinomialBlurPass(white, size, 5);
  const band = new Float32Array(size * size);

  let sum = 0;
  for (let i = 0; i < band.length; i += 1) {
    const diff = fine[i]! - coarse[i]!;
    band[i] = diff;
    sum += diff;
  }
  const mean = sum / band.length;

  let maxAbs = 1e-9;
  for (let i = 0; i < band.length; i += 1) {
    const centered = band[i]! - mean;
    band[i] = centered;
    const abs = Math.abs(centered);
    if (abs > maxAbs) maxAbs = abs;
  }
  for (let i = 0; i < band.length; i += 1) {
    band[i] = band[i]! / maxAbs;
  }
  return band;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-6, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * RGBA 픽셀 버퍼에 에지 마스킹된 대역제한 블루노이즈 미세 섭동을 비파괴 사본으로 적용하고
 * 한국어 고지 메타데이터(`disclosure`)와 통계를 반환한다.
 */
export function applyExportPerturbationShield(
  sourceRgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: ExportPerturbationShieldOptions = {},
): ExportPerturbationShieldResult {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  if (w === 0 || h === 0 || sourceRgba.length < w * h * 4) {
    throw new RangeError("RGBA 버퍼 크기가 지정된 폭·높이와 일치하지 않습니다.");
  }

  const intensity = normalizePerturbationIntensity(options.intensity);
  const maxDelta = INTENSITY_MAX_DELTA[intensity];
  const tileSize = Math.max(8, Math.min(128, Math.floor(options.tileSize ?? 32)));
  const tile = generateBandLimitedBlueNoiseTile(options.seed, tileSize);

  const luma = new Float32Array(w * h);
  for (let i = 0; i < w * h; i += 1) {
    const p = i * 4;
    luma[i] =
      0.2126 * sourceRgba[p]! +
      0.7152 * sourceRgba[p + 1]! +
      0.0722 * sourceRgba[p + 2]!;
  }

  const out = new Uint8ClampedArray(sourceRgba);
  let perturbedPixelCount = 0;
  let preservedFlatWhitePixelCount = 0;

  const lumaAt = (x: number, y: number): number => {
    const cx = Math.max(0, Math.min(w - 1, x));
    const cy = Math.max(0, Math.min(h - 1, y));
    return luma[cy * w + cx]!;
  };

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = y * w + x;
      const p = idx * 4;
      const alpha = sourceRgba[p + 3]!;
      if (alpha < 8) continue;

      // 3x3 Sobel 기울기 크기 (정규화 0..1)
      const gx =
        -lumaAt(x - 1, y - 1) +
        lumaAt(x + 1, y - 1) -
        2 * lumaAt(x - 1, y) +
        2 * lumaAt(x + 1, y) -
        lumaAt(x - 1, y + 1) +
        lumaAt(x + 1, y + 1);
      const gy =
        -lumaAt(x - 1, y - 1) -
        2 * lumaAt(x, y - 1) -
        lumaAt(x + 1, y - 1) +
        lumaAt(x - 1, y + 1) +
        2 * lumaAt(x, y + 1) +
        lumaAt(x + 1, y + 1);

      const gradNorm = Math.hypot(gx, gy) / 1020;
      const centerLuma = luma[idx]!;

      // 평탄한 흰색 말풍선 내부 및 원고 여백 완전 보호
      if (centerLuma >= 245 && gradNorm < 0.06) {
        preservedFlatWhitePixelCount += 1;
        continue;
      }

      const edgeWeight = smoothstep(0.02, 0.14, gradNorm);
      if (edgeWeight <= 1e-4) continue;

      const txR = wrapMod(x, tileSize);
      const tyR = wrapMod(y, tileSize);
      const txG = wrapMod(x + 11, tileSize);
      const tyG = wrapMod(y + 7, tileSize);
      const txB = wrapMod(x + 23, tileSize);
      const tyB = wrapMod(y + 19, tileSize);

      const amp = maxDelta * edgeWeight;
      const dR = Math.round(tile[tyR * tileSize + txR]! * amp);
      const dG = Math.round(tile[tyG * tileSize + txG]! * amp);
      const dB = Math.round(tile[tyB * tileSize + txB]! * amp);

      if (dR !== 0 || dG !== 0 || dB !== 0) {
        out[p] = Math.max(0, Math.min(255, sourceRgba[p]! + dR));
        out[p + 1] = Math.max(0, Math.min(255, sourceRgba[p + 1]! + dG));
        out[p + 2] = Math.max(0, Math.min(255, sourceRgba[p + 2]! + dB));
        out[p + 3] = alpha;
        perturbedPixelCount += 1;
      }
    }
  }

  return {
    pixels: out,
    width: w,
    height: h,
    intensity,
    perturbedPixelCount,
    preservedFlatWhitePixelCount,
    disclosure: STUDIO_PERTURBATION_SHIELD_DISCLOSURE,
  };
}

export interface StudioExportPerturbationShieldDraft {
  readonly enabled: boolean;
  readonly intensity: PerturbationIntensityLevel;
  readonly seed?: string;
}

export const DEFAULT_STUDIO_EXPORT_PERTURBATION_SHIELD_DRAFT: StudioExportPerturbationShieldDraft =
  Object.freeze({
    enabled: false,
    intensity: 2,
  });

let shieldDraft: StudioExportPerturbationShieldDraft | null = null;

export function readStudioExportPerturbationShieldDraft(): StudioExportPerturbationShieldDraft | null {
  return shieldDraft;
}

export function writeStudioExportPerturbationShieldDraft(
  next: StudioExportPerturbationShieldDraft,
): void {
  shieldDraft = {
    enabled: next.enabled === true,
    intensity: normalizePerturbationIntensity(next.intensity),
    ...(next.seed !== undefined ? { seed: next.seed } : {}),
  };
}

export function resetStudioExportPerturbationShieldDraft(): void {
  shieldDraft = null;
}
