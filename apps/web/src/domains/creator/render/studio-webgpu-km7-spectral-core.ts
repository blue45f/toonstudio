/**
 * 100% 클린룸 7밴드 분광 Kubelka-Munk 고속 안료 물리 코어 (CPU + WGSL 단일 진실 원본).
 *
 * 설계 원칙:
 * - 외부 독점 패키지(`mixbox`), 독점 LUT 테이블, 제3자 안료 측정 상수를 일절 사용하지 않는다.
 * - 가시광선 7개 지각 밴드(420·465·505·545·585·625·670nm)에서 합이 1인 물리 반사율 기저
 *   (`BR + BG + BB = 1`)와 가중 무어-펜로즈 의사역행렬(`M · B = I₃`)을 1차 원리로 구성해
 *   모든 선형 sRGB 색이 왕복 오차 없이 분광 공간으로 사상되도록 한다.
 * - Kubelka-Munk 흡수·산란 비 `K/S = (1 - R)² / (2R)`와 안정화된 역공식
 *   `R = 1 / (1 + q + sqrt(q² + 2q)) ≡ 1 + q - sqrt(q² + 2q)`를 사용해
 *   `f32` 연산에서도 암부 상쇄 오차 없이 감산 혼색·광학 글레이징·임파스토 음영을 계산한다.
 * - 7밴드 스펙트럼은 `vec4<f32>` 2개 레지스터(`lo: 0..3`, `hi: 4..6 + w: luminance`)로 패킹되어
 *   WebGPU WGSL Compute 셰이더에서 루프 없는 SIMD 벡터 연산으로 실행된다.
 */

export const KM7_BAND_COUNT = 7 as const;

/** 7개 지각 가시광선 중심 파장(nm): 자청 · 청 · 청록 · 녹 · 황 · 주황적 · 심적. */
export const KM7_WAVELENGTHS_NM: readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
] = Object.freeze([420, 465, 505, 545, 585, 625, 670]);

/**
 * 반사율 및 휘도 농도 하한(동일 크기 유지).
 * 무채 암부에서 `K/S ≈ 1/(2R)`과 휘도 `Y ≈ R`의 곱이 ~0.5 상수로 안정화되어
 * 순흑+순백 혼색이 중립 회색을 유지하고 발산하지 않는다.
 */
export const KM7_REFLECTANCE_FLOOR = 0.002 as const;

/** 원색 3기저 반사율 곡선 — 모든 밴드에서 `BR[i] + BG[i] + BB[i] = 1.0`. */
export const KM7_BASIS_R: readonly [number, number, number, number, number, number, number] =
  Object.freeze([0.16, 0.03, 0.02, 0.03, 0.56, 0.9, 0.9]);

export const KM7_BASIS_G: readonly [number, number, number, number, number, number, number] =
  Object.freeze([0.02, 0.07, 0.54, 0.86, 0.42, 0.08, 0.02]);

export const KM7_BASIS_B: readonly [number, number, number, number, number, number, number] =
  Object.freeze([0.82, 0.9, 0.44, 0.11, 0.02, 0.02, 0.08]);

/**
 * 7밴드 반사율 → 선형 sRGB 복원 행렬 `M` (3×7, `M · [BR, BG, BB] = I₃`, `M · 1 = [1, 1, 1]`).
 * 지각 휘도 가중 `W = [0.55, 1.0, 1.15, 1.4, 1.25, 1.0, 0.65]`에 대한 `(Bᵀ W B)⁻¹ Bᵀ W` 해석해.
 */
export const KM7_RECONSTRUCT_R: readonly [number, number, number, number, number, number, number] =
  Object.freeze([0.039103, -0.018961, -0.097571, -0.166425, 0.347685, 0.540144, 0.356026]);

export const KM7_RECONSTRUCT_G: readonly [number, number, number, number, number, number, number] =
  Object.freeze([-0.110624, -0.162648, 0.33623, 0.844858, 0.271934, -0.086017, -0.093732]);

export const KM7_RECONSTRUCT_B: readonly [number, number, number, number, number, number, number] =
  Object.freeze([0.34944, 0.690429, 0.252564, -0.160496, -0.123187, -0.02939, 0.02064]);

export const KM7_DEFAULT_CONCENTRATION_GAMMA = 1.65 as const;
export const KM7_DEFAULT_CHROMA_PRESERVE = 0.35 as const;

export interface Km7Rgb01 {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface Km7Oklab {
  readonly L: number;
  readonly a: number;
  readonly b: number;
}

export interface Km7Oklch {
  readonly L: number;
  readonly C: number;
  readonly hDeg: number;
}

export interface Km7Spectrum7 {
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
  readonly b3: number;
  readonly b4: number;
  readonly b5: number;
  readonly b6: number;
  readonly lum: number;
}

export interface Km7MixOptions {
  readonly tintingStrengthA?: number;
  readonly tintingStrengthB?: number;
  readonly concentrationGamma?: number;
  readonly chromaPreserve?: number;
}

export interface Km7GlazeOptions {
  readonly opacity: number;
  readonly layers?: number;
  readonly scatter?: number;
  readonly paperPreserve?: number;
}

export interface Km7WetPickupStepInput {
  readonly canvasSrgb: Km7Rgb01;
  readonly paintSrgb: Km7Rgb01;
  readonly reservoirSrgb: Km7Rgb01;
  readonly pickupRate: number;
  readonly wetness: number;
  readonly paintLoad: number;
  readonly chromaPreserve?: number;
  readonly edgeRingStrength?: number;
  readonly radialDist01?: number;
}

export interface Km7WetPickupStepOutput {
  readonly depositSrgb: Km7Rgb01;
  readonly nextReservoirSrgb: Km7Rgb01;
  readonly effectiveOpacity: number;
}

export interface Km7ImpastoReliefInput {
  readonly baseSrgb: Km7Rgb01;
  readonly heightGradX: number;
  readonly heightGradY: number;
  readonly reliefStrength: number;
  readonly gloss: number;
  readonly lightDirX?: number;
  readonly lightDirY?: number;
  readonly lightDirZ?: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

export function km7SrgbToLinear(channel: number): number {
  const x = clamp01(channel);
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

export function km7LinearToSrgb(channel: number): number {
  const x = clamp01(channel);
  return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

export function km7LinearRgbToOklab(rgb: Km7Rgb01): Km7Oklab {
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

export function km7OklabToLinearRgb(lab: Km7Oklab): Km7Rgb01 {
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

export function km7OklabToLch(lab: Km7Oklab): Km7Oklch {
  const C = Math.hypot(lab.a, lab.b);
  const hDeg = ((Math.atan2(lab.b, lab.a) * 180) / Math.PI + 360) % 360;
  return { L: lab.L, C, hDeg };
}

export function km7SrgbToOklch(srgb: Km7Rgb01): Km7Oklch {
  return km7OklabToLch(
    km7LinearRgbToOklab({
      r: km7SrgbToLinear(srgb.r),
      g: km7SrgbToLinear(srgb.g),
      b: km7SrgbToLinear(srgb.b),
    }),
  );
}

/** 반사율 R ∈ [KM7_REFLECTANCE_FLOOR, 1] → Kubelka-Munk 흡수·산란 비 K/S = (1 - R)² / (2R). */
export function km7KsFromReflectance(reflectance: number): number {
  const r = clampRange(reflectance, KM7_REFLECTANCE_FLOOR, 1);
  const diff = 1 - r;
  return (diff * diff) / (2 * r);
}

/**
 * Kubelka-Munk 역공식: K/S → 무한 두께 반사율 R.
 * 대수적으로 `1 + ks - sqrt(ks² + 2ks)`와 항등이며, 유리화 형태
 * `1 / (1 + ks + sqrt(ks² + 2ks))`로 작성해 큰 `ks`에서의 부동소수 상쇄를 제거한다.
 */
export function km7ReflectanceFromKs(ks: number): number {
  const q = Number.isFinite(ks) && ks > 0 ? ks : 0;
  return 1 / (1 + q + Math.sqrt(q * q + 2 * q));
}

export function km7LinearRgbToSpectrum7(rgb: Km7Rgb01): Km7Spectrum7 {
  const r = clamp01(rgb.r);
  const g = clamp01(rgb.g);
  const b = clamp01(rgb.b);
  const band = (idx: 0 | 1 | 2 | 3 | 4 | 5 | 6): number =>
    clampRange(
      r * KM7_BASIS_R[idx] + g * KM7_BASIS_G[idx] + b * KM7_BASIS_B[idx],
      KM7_REFLECTANCE_FLOOR,
      1,
    );
  const lum = Math.max(KM7_REFLECTANCE_FLOOR, 0.2126 * r + 0.7152 * g + 0.0722 * b);
  return {
    b0: band(0),
    b1: band(1),
    b2: band(2),
    b3: band(3),
    b4: band(4),
    b5: band(5),
    b6: band(6),
    lum,
  };
}

export function km7Spectrum7ToLinearRgb(spec: Km7Spectrum7): Km7Rgb01 {
  const dot = (w: readonly [number, number, number, number, number, number, number]): number =>
    clamp01(
      w[0] * spec.b0 +
        w[1] * spec.b1 +
        w[2] * spec.b2 +
        w[3] * spec.b3 +
        w[4] * spec.b4 +
        w[5] * spec.b5 +
        w[6] * spec.b6,
    );
  return {
    r: dot(KM7_RECONSTRUCT_R),
    g: dot(KM7_RECONSTRUCT_G),
    b: dot(KM7_RECONSTRUCT_B),
  };
}

function applyOklabChromaPreserve(
  linA: Km7Rgb01,
  linB: Km7Rgb01,
  mixedLin: Km7Rgb01,
  t: number,
  chromaPreserve: number,
): Km7Rgb01 {
  if (chromaPreserve <= 0) return mixedLin;
  const okA = km7LinearRgbToOklab(linA);
  const okB = km7LinearRgbToOklab(linB);
  const okM = km7LinearRgbToOklab(mixedLin);
  const cA = Math.hypot(okA.a, okA.b);
  const cB = Math.hypot(okB.a, okB.b);
  const cM = Math.hypot(okM.a, okM.b);
  const targetC = Math.min(cA, cB) * 0.85 + Math.max(cA, cB) * 0.15;
  if (cM <= 0.015 || targetC <= cM) return mixedLin;
  const bell = 4 * t * (1 - t);
  const boost = 1 + chromaPreserve * bell * Math.min(0.65, (targetC - cM) / cM);
  return km7OklabToLinearRgb({
    L: okM.L,
    a: okM.a * boost,
    b: okM.b * boost,
  });
}

/**
 * 7밴드 분광 Kubelka-Munk + 잠재 농도 가중 + Oklab 채도 보존 감산 혼색 (sRGB 0..1 입출력).
 */
export function mixKm7SpectralSrgb(
  colorA: Km7Rgb01,
  colorB: Km7Rgb01,
  t: number,
  options: Km7MixOptions = {},
): Km7Rgb01 {
  const mt = clamp01(t);
  if (mt <= 0) return { r: clamp01(colorA.r), g: clamp01(colorA.g), b: clamp01(colorA.b) };
  if (mt >= 1) return { r: clamp01(colorB.r), g: clamp01(colorB.g), b: clamp01(colorB.b) };

  const linA: Km7Rgb01 = {
    r: km7SrgbToLinear(colorA.r),
    g: km7SrgbToLinear(colorA.g),
    b: km7SrgbToLinear(colorA.b),
  };
  const linB: Km7Rgb01 = {
    r: km7SrgbToLinear(colorB.r),
    g: km7SrgbToLinear(colorB.g),
    b: km7SrgbToLinear(colorB.b),
  };
  const specA = km7LinearRgbToSpectrum7(linA);
  const specB = km7LinearRgbToSpectrum7(linB);

  const tsA = clampRange(options.tintingStrengthA ?? 1, 0.1, 8);
  const tsB = clampRange(options.tintingStrengthB ?? 1, 0.1, 8);
  const gamma = clampRange(options.concentrationGamma ?? KM7_DEFAULT_CONCENTRATION_GAMMA, 0.5, 3);
  const chromaPreserve = clampRange(options.chromaPreserve ?? KM7_DEFAULT_CHROMA_PRESERVE, 0, 1);

  const cA = Math.pow(1 - mt, gamma) * tsA * specA.lum;
  const cB = Math.pow(mt, gamma) * tsB * specB.lum;
  const invTotal = 1 / Math.max(1e-7, cA + cB);

  const blendBand = (ra: number, rb: number): number => {
    const ks = (km7KsFromReflectance(ra) * cA + km7KsFromReflectance(rb) * cB) * invTotal;
    return km7ReflectanceFromKs(ks);
  };

  const mixedSpec: Km7Spectrum7 = {
    b0: blendBand(specA.b0, specB.b0),
    b1: blendBand(specA.b1, specB.b1),
    b2: blendBand(specA.b2, specB.b2),
    b3: blendBand(specA.b3, specB.b3),
    b4: blendBand(specA.b4, specB.b4),
    b5: blendBand(specA.b5, specB.b5),
    b6: blendBand(specA.b6, specB.b6),
    lum: (specA.lum * cA + specB.lum * cB) * invTotal,
  };

  const rawLin = km7Spectrum7ToLinearRgb(mixedSpec);
  const outLin = applyOklabChromaPreserve(linA, linB, rawLin, mt, chromaPreserve);
  return {
    r: km7LinearToSrgb(outLin.r),
    g: km7LinearToSrgb(outLin.g),
    b: km7LinearToSrgb(outLin.b),
  };
}

/** 0..255 sRGB 핫패스 혼색 — `studio-wet-mix.ts` 및 CPU 필터 커널에서 공유한다. */
export function mixKm7SpectralSrgb8(
  colorA: Km7Rgb01,
  colorB: Km7Rgb01,
  t: number,
  options: Km7MixOptions = {},
): Km7Rgb01 {
  const mixed = mixKm7SpectralSrgb(
    { r: colorA.r / 255, g: colorA.g / 255, b: colorA.b / 255 },
    { r: colorB.r / 255, g: colorB.g / 255, b: colorB.b / 255 },
    t,
    options,
  );
  return { r: mixed.r * 255, g: mixed.g * 255, b: mixed.b * 255 };
}

/**
 * 전통 화구 글레이징(Glazing / Velatura) 광학 투과-반사 적층 모델.
 * 건조한 바탕(`baseSrgb`) 위로 반투명 안료 막(`glazeSrgb`)을 `layers`겹 올릴 때
 * Beer-Lambert 흡수 투과 `T(λ) = exp(-K(λ) · d)`와 표층 산란 반사를 7밴드로 적분한다.
 */
export function glazeKm7SpectralSrgb(
  baseSrgb: Km7Rgb01,
  glazeSrgb: Km7Rgb01,
  options: Km7GlazeOptions,
): Km7Rgb01 {
  const opacity = clamp01(options.opacity);
  const layers = Math.max(1, Math.min(8, Math.round(Number.isFinite(options.layers) ? (options.layers ?? 1) : 1)));
  if (opacity <= 0) {
    return { r: clamp01(baseSrgb.r), g: clamp01(baseSrgb.g), b: clamp01(baseSrgb.b) };
  }
  const scatter = clampRange(options.scatter ?? 0.22, 0, 1);
  const paperPreserve = clamp01(options.paperPreserve ?? 0);

  const linBase: Km7Rgb01 = {
    r: km7SrgbToLinear(baseSrgb.r),
    g: km7SrgbToLinear(baseSrgb.g),
    b: km7SrgbToLinear(baseSrgb.b),
  };
  const linGlaze: Km7Rgb01 = {
    r: km7SrgbToLinear(glazeSrgb.r),
    g: km7SrgbToLinear(glazeSrgb.g),
    b: km7SrgbToLinear(glazeSrgb.b),
  };

  const baseSpec = km7LinearRgbToSpectrum7(linBase);
  const glazeSpec = km7LinearRgbToSpectrum7(linGlaze);
  const highlightShield = paperPreserve > 0 ? 1 - paperPreserve * Math.pow(clamp01(baseSpec.lum), 2) * 0.65 : 1;
  // 다중 글레이징 레이어 누적: 1 - (1 - opacity)^layers 의 광학 두께 d = -ln(1 - effAlpha) 비례
  const effectiveAlpha = (1 - Math.pow(1 - opacity, layers)) * highlightShield;
  const opticalDepth = effectiveAlpha * 1.45;

  const glazeBand = (rBase: number, rGlaze: number): number => {
    // K(λ) ∝ (1 - R_glaze) + 0.42 * ln(1 / R_glaze): 순수 글레이즈 안료의 파장별 투과 감쇠 계수
    const absorption = (1 - rGlaze) + 0.42 * Math.log(1 / Math.max(KM7_REFLECTANCE_FLOOR, rGlaze));
    const transmittance = Math.exp(-absorption * opticalDepth);
    const reflected = rBase * transmittance + rGlaze * (1 - transmittance) * scatter;
    return clampRange(reflected, KM7_REFLECTANCE_FLOOR, 1);
  };

  const outSpec: Km7Spectrum7 = {
    b0: glazeBand(baseSpec.b0, glazeSpec.b0),
    b1: glazeBand(baseSpec.b1, glazeSpec.b1),
    b2: glazeBand(baseSpec.b2, glazeSpec.b2),
    b3: glazeBand(baseSpec.b3, glazeSpec.b3),
    b4: glazeBand(baseSpec.b4, glazeSpec.b4),
    b5: glazeBand(baseSpec.b5, glazeSpec.b5),
    b6: glazeBand(baseSpec.b6, glazeSpec.b6),
    lum: baseSpec.lum,
  };
  const outLin = km7Spectrum7ToLinearRgb(outSpec);
  return {
    r: km7LinearToSrgb(outLin.r),
    g: km7LinearToSrgb(outLin.g),
    b: km7LinearToSrgb(outLin.b),
  };
}

/**
 * 습윤 붓 픽업(Wet Pickup) + 저장조(Reservoir) + 웻-엣지 블룸(Wet-Edge Bloom) 1스텝 물리 계산.
 */
export function computeKm7WetPickupStep(input: Km7WetPickupStepInput): Km7WetPickupStepOutput {
  const pickup = clamp01(input.pickupRate);
  const wetness = clamp01(input.wetness);
  const load = clamp01(input.paintLoad);
  const chromaPreserve = clampRange(input.chromaPreserve ?? KM7_DEFAULT_CHROMA_PRESERVE, 0, 1);

  const nextReservoir = mixKm7SpectralSrgb(input.reservoirSrgb, input.canvasSrgb, pickup, {
    chromaPreserve,
  });
  let deposit = mixKm7SpectralSrgb(input.paintSrgb, nextReservoir, wetness, {
    chromaPreserve,
  });

  const edgeRing = clamp01(input.edgeRingStrength ?? 0);
  const radial = clamp01(input.radialDist01 ?? 0);
  if (edgeRing > 0 && radial > 0.65) {
    // 모세관 커피-링 효과: 가장자리(0.65..1.0)에서 안료 농도가 미세하게 농축된다.
    const rimFactor = ((radial - 0.65) / 0.35) * edgeRing * 0.45;
    deposit = glazeKm7SpectralSrgb(deposit, input.paintSrgb, {
      opacity: rimFactor,
      layers: 1,
      scatter: 0.12,
    });
  }

  return {
    depositSrgb: deposit,
    nextReservoirSrgb: nextReservoir,
    effectiveOpacity: clamp01(load * (1 - wetness * 0.25)),
  };
}

/**
 * 유화·아크릴 임파스토 높이 기울기(`heightGradX`, `heightGradY`) 기반 방향성 부조(Relief) 음영.
 */
export function computeKm7ImpastoReliefLitSrgb(input: Km7ImpastoReliefInput): Km7Rgb01 {
  const relief = clamp01(input.reliefStrength);
  const gloss = clamp01(input.gloss);
  if (relief <= 0) {
    return { r: clamp01(input.baseSrgb.r), g: clamp01(input.baseSrgb.g), b: clamp01(input.baseSrgb.b) };
  }
  const gx = Number.isFinite(input.heightGradX) ? input.heightGradX : 0;
  const gy = Number.isFinite(input.heightGradY) ? input.heightGradY : 0;
  const nx = -gx * relief * 2.4;
  const ny = -gy * relief * 2.4;
  const nz = 1;
  const nLen = Math.hypot(nx, ny, nz) || 1;
  const nnx = nx / nLen;
  const nny = ny / nLen;
  const nnz = nz / nLen;

  const lx = Number.isFinite(input.lightDirX) ? (input.lightDirX ?? -0.45) : -0.45;
  const ly = Number.isFinite(input.lightDirY) ? (input.lightDirY ?? -0.55) : -0.55;
  const lz = Number.isFinite(input.lightDirZ) ? (input.lightDirZ ?? 0.7) : 0.7;
  const lLen = Math.hypot(lx, ly, lz) || 1;
  const nlx = lx / lLen;
  const nly = ly / lLen;
  const nlz = lz / lLen;

  const ndl = Math.max(0, nnx * nlx + nny * nly + nnz * nlz);
  const diffuse = 0.78 + 0.28 * ndl;
  // Half-vector Blinn-Phong specular with view = (0, 0, 1)
  const hx = nlx;
  const hy = nly;
  const hz = nlz + 1;
  const hLen = Math.hypot(hx, hy, hz) || 1;
  const ndh = Math.max(0, (nnx * hx + nny * hy + nnz * hz) / hLen);
  const spec = Math.pow(ndh, 24 + gloss * 40) * gloss * relief * 0.26;

  const linR = clamp01(km7SrgbToLinear(input.baseSrgb.r) * diffuse + spec);
  const linG = clamp01(km7SrgbToLinear(input.baseSrgb.g) * diffuse + spec);
  const linB = clamp01(km7SrgbToLinear(input.baseSrgb.b) * diffuse + spec);
  return {
    r: km7LinearToSrgb(linR),
    g: km7LinearToSrgb(linG),
    b: km7LinearToSrgb(linB),
  };
}

/* -------------------------------------------------------------------------- */
/* WGSL f32 산술 미러 (`Math.fround` 기반 CPU↔WGSL 수치 동등성 검증 정본)       */
/* -------------------------------------------------------------------------- */

const f32 = Math.fround;

function f32Clamp(v: number, lo: number, hi: number): number {
  const x = f32(v);
  return x < lo ? f32(lo) : x > hi ? f32(hi) : x;
}

function f32SrgbToLin(c: number): number {
  const x = f32Clamp(c, 0, 1);
  return x <= f32(0.04045) ? f32(x / f32(12.92)) : f32(Math.pow(f32(f32(x + f32(0.055)) / f32(1.055)), f32(2.4)));
}

function f32LinToSrgb(c: number): number {
  const x = f32Clamp(c, 0, 1);
  return x <= f32(0.0031308)
    ? f32(x * f32(12.92))
    : f32(f32(f32(1.055) * f32(Math.pow(x, f32(1 / 2.4)))) - f32(0.055));
}

function f32Cbrt(x: number): number {
  const pos = x > 0 ? f32(x) : f32(0);
  return pos <= 0 ? f32(0) : f32(Math.pow(pos, f32(1 / 3)));
}

function f32Ks(r: number): number {
  const c = f32Clamp(r, KM7_REFLECTANCE_FLOOR, 1);
  const d = f32(f32(1) - c);
  return f32(f32(d * d) / f32(f32(2) * c));
}

function f32Refl(ks: number): number {
  const q = ks > 0 ? f32(ks) : f32(0);
  const disc = f32(f32(q * q) + f32(f32(2) * q));
  return f32(f32(1) / f32(f32(f32(1) + q) + f32(Math.sqrt(disc))));
}

/**
 * `STUDIO_WEBGPU_KM7_SPECTRAL_WGSL_SNIPPET`의 `km7_mix_srgb`와 연산 순서·`f32` 반올림을
 * 1:1로 일치시킨 검증용 CPU 미러.
 */
export function mixKm7SpectralSrgbF32Mirror(
  colorA: Km7Rgb01,
  colorB: Km7Rgb01,
  t: number,
  options: Km7MixOptions = {},
): Km7Rgb01 {
  const mt = f32Clamp(t, 0, 1);
  if (mt <= 0) return { r: f32Clamp(colorA.r, 0, 1), g: f32Clamp(colorA.g, 0, 1), b: f32Clamp(colorA.b, 0, 1) };
  if (mt >= 1) return { r: f32Clamp(colorB.r, 0, 1), g: f32Clamp(colorB.g, 0, 1), b: f32Clamp(colorB.b, 0, 1) };

  const laR = f32SrgbToLin(colorA.r);
  const laG = f32SrgbToLin(colorA.g);
  const laB = f32SrgbToLin(colorA.b);
  const lbR = f32SrgbToLin(colorB.r);
  const lbG = f32SrgbToLin(colorB.g);
  const lbB = f32SrgbToLin(colorB.b);

  const lumA = Math.max(
    f32(KM7_REFLECTANCE_FLOOR),
    f32(f32(f32(0.2126) * laR) + f32(f32(f32(0.7152) * laG) + f32(f32(0.0722) * laB))),
  );
  const lumB = Math.max(
    f32(KM7_REFLECTANCE_FLOOR),
    f32(f32(f32(0.2126) * lbR) + f32(f32(f32(0.7152) * lbG) + f32(f32(0.0722) * lbB))),
  );

  const tsA = f32Clamp(options.tintingStrengthA ?? 1, 0.1, 8);
  const tsB = f32Clamp(options.tintingStrengthB ?? 1, 0.1, 8);
  const gamma = f32Clamp(options.concentrationGamma ?? KM7_DEFAULT_CONCENTRATION_GAMMA, 0.5, 3);
  const chromaPreserve = f32Clamp(options.chromaPreserve ?? KM7_DEFAULT_CHROMA_PRESERVE, 0, 1);

  const cA = f32(f32(f32(Math.pow(f32(f32(1) - mt), gamma)) * tsA) * lumA);
  const cB = f32(f32(f32(Math.pow(mt, gamma)) * tsB) * lumB);
  const invTotal = f32(f32(1) / Math.max(f32(1e-7), f32(cA + cB)));

  const mBands: number[] = [];
  for (let i = 0; i < 7; i += 1) {
    const br = f32(KM7_BASIS_R[i] ?? 0);
    const bg = f32(KM7_BASIS_G[i] ?? 0);
    const bb = f32(KM7_BASIS_B[i] ?? 0);
    const ra = f32Clamp(f32(f32(laR * br) + f32(f32(laG * bg) + f32(laB * bb))), KM7_REFLECTANCE_FLOOR, 1);
    const rb = f32Clamp(f32(f32(lbR * br) + f32(f32(lbG * bg) + f32(lbB * bb))), KM7_REFLECTANCE_FLOOR, 1);
    const ks = f32(f32(f32(f32Ks(ra) * cA) + f32(f32Ks(rb) * cB)) * invTotal);
    mBands.push(f32Refl(ks));
  }

  const dotRow = (row: readonly number[]): number => {
    let acc = f32(0);
    for (let i = 0; i < 7; i += 1) {
      acc = f32(acc + f32(f32(row[i] ?? 0) * (mBands[i] ?? 0)));
    }
    return f32Clamp(acc, 0, 1);
  };

  let outR = dotRow(KM7_RECONSTRUCT_R);
  let outG = dotRow(KM7_RECONSTRUCT_G);
  let outB = dotRow(KM7_RECONSTRUCT_B);

  if (chromaPreserve > 0) {
    const toLab = (r: number, g: number, b: number): [number, number, number] => {
      const l = f32Cbrt(f32(f32(f32(0.41222147) * r) + f32(f32(f32(0.53633254) * g) + f32(f32(0.05144599) * b))));
      const m = f32Cbrt(f32(f32(f32(0.2119035) * r) + f32(f32(f32(0.68069955) * g) + f32(f32(0.10739696) * b))));
      const s = f32Cbrt(f32(f32(f32(0.08830246) * r) + f32(f32(f32(0.28171884) * g) + f32(f32(0.6299787) * b))));
      return [
        f32(f32(f32(0.21045426) * l) + f32(f32(f32(0.79361779) * m) - f32(f32(0.00407205) * s))),
        f32(f32(f32(1.9779985) * l) + f32(f32(f32(-2.4285922) * m) + f32(f32(0.45059371) * s))),
        f32(f32(f32(0.02590404) * l) + f32(f32(f32(0.78277177) * m) - f32(f32(0.80867577) * s))),
      ];
    };
    const labA = toLab(laR, laG, laB);
    const labB = toLab(lbR, lbG, lbB);
    const labM = toLab(outR, outG, outB);
    const cAOk = f32(Math.sqrt(f32(f32(labA[1] * labA[1]) + f32(labA[2] * labA[2]))));
    const cBOk = f32(Math.sqrt(f32(f32(labB[1] * labB[1]) + f32(labB[2] * labB[2]))));
    const cMOk = f32(Math.sqrt(f32(f32(labM[1] * labM[1]) + f32(labM[2] * labM[2]))));
    const targetC = f32(f32(Math.min(cAOk, cBOk) * f32(0.85)) + f32(Math.max(cAOk, cBOk) * f32(0.15)));
    if (cMOk > f32(0.015) && targetC > cMOk) {
      const bell = f32(f32(f32(4) * mt) * f32(f32(1) - mt));
      const ratio = Math.min(f32(0.65), f32(f32(targetC - cMOk) / cMOk));
      const boost = f32(f32(1) + f32(f32(chromaPreserve * bell) * ratio));
      const a2 = f32(labM[1] * boost);
      const b2 = f32(labM[2] * boost);
      const lRoot = f32(labM[0] + f32(f32(f32(0.39633778) * a2) + f32(f32(0.21580376) * b2)));
      const mRoot = f32(labM[0] - f32(f32(f32(0.10556135) * a2) + f32(f32(0.06385417) * b2)));
      const sRoot = f32(labM[0] - f32(f32(f32(0.08948418) * a2) + f32(f32(1.2914855) * b2)));
      const l3 = f32(f32(lRoot * lRoot) * lRoot);
      const m3 = f32(f32(mRoot * mRoot) * mRoot);
      const s3 = f32(f32(sRoot * sRoot) * sRoot);
      outR = f32Clamp(f32(f32(f32(4.0767417) * l3) + f32(f32(f32(-3.3077116) * m3) + f32(f32(0.23096993) * s3))), 0, 1);
      outG = f32Clamp(f32(f32(f32(-1.268438) * l3) + f32(f32(f32(2.6097574) * m3) - f32(f32(0.3413194) * s3))), 0, 1);
      outB = f32Clamp(f32(f32(f32(-0.00419609) * l3) + f32(f32(f32(-0.7034186) * m3) + f32(f32(1.7076147) * s3))), 0, 1);
    }
  }

  return {
    r: f32LinToSrgb(outR),
    g: f32LinToSrgb(outG),
    b: f32LinToSrgb(outB),
  };
}

/** `km7_glaze_srgb` WGSL 함수의 f32 산술 미러. */
export function glazeKm7SpectralSrgbF32Mirror(
  baseSrgb: Km7Rgb01,
  glazeSrgb: Km7Rgb01,
  options: Km7GlazeOptions,
): Km7Rgb01 {
  const opacity = f32Clamp(options.opacity, 0, 1);
  const layers = Math.max(1, Math.min(8, Math.round(Number.isFinite(options.layers) ? (options.layers ?? 1) : 1)));
  if (opacity <= 0) {
    return { r: f32Clamp(baseSrgb.r, 0, 1), g: f32Clamp(baseSrgb.g, 0, 1), b: f32Clamp(baseSrgb.b, 0, 1) };
  }
  const scatter = f32Clamp(options.scatter ?? 0.22, 0, 1);
  const paperPreserve = f32Clamp(options.paperPreserve ?? 0, 0, 1);
  const lbR = f32SrgbToLin(baseSrgb.r);
  const lbG = f32SrgbToLin(baseSrgb.g);
  const lbB = f32SrgbToLin(baseSrgb.b);
  const lgR = f32SrgbToLin(glazeSrgb.r);
  const lgG = f32SrgbToLin(glazeSrgb.g);
  const lgB = f32SrgbToLin(glazeSrgb.b);
  const lumBase = f32Clamp(f32(f32(f32(0.2126) * lbR) + f32(f32(f32(0.7152) * lbG) + f32(f32(0.0722) * lbB))), 0, 1);
  const shield = f32(f32(1) - f32(f32(paperPreserve * f32(lumBase * lumBase)) * f32(0.65)));
  const effAlpha = f32(f32(f32(1) - f32(Math.pow(f32(f32(1) - opacity), f32(layers)))) * shield);
  const depth = f32(effAlpha * f32(1.45));

  const bands: number[] = [];
  for (let i = 0; i < 7; i += 1) {
    const br = f32(KM7_BASIS_R[i] ?? 0);
    const bg = f32(KM7_BASIS_G[i] ?? 0);
    const bb = f32(KM7_BASIS_B[i] ?? 0);
    const rb = f32Clamp(f32(f32(lbR * br) + f32(f32(lbG * bg) + f32(lbB * bb))), KM7_REFLECTANCE_FLOOR, 1);
    const rg = f32Clamp(f32(f32(lgR * br) + f32(f32(lgG * bg) + f32(lgB * bb))), KM7_REFLECTANCE_FLOOR, 1);
    const abs = f32(f32(f32(1) - rg) + f32(f32(0.42) * f32(Math.log(f32(f32(1) / rg)))));
    const tr = f32(Math.exp(f32(-abs * depth)));
    bands.push(f32Clamp(f32(f32(rb * tr) + f32(f32(rg * f32(f32(1) - tr)) * scatter)), KM7_REFLECTANCE_FLOOR, 1));
  }

  const dotRow = (row: readonly number[]): number => {
    let acc = f32(0);
    for (let i = 0; i < 7; i += 1) {
      acc = f32(acc + f32(f32(row[i] ?? 0) * (bands[i] ?? 0)));
    }
    return f32Clamp(acc, 0, 1);
  };
  return {
    r: f32LinToSrgb(dotRow(KM7_RECONSTRUCT_R)),
    g: f32LinToSrgb(dotRow(KM7_RECONSTRUCT_G)),
    b: f32LinToSrgb(dotRow(KM7_RECONSTRUCT_B)),
  };
}
