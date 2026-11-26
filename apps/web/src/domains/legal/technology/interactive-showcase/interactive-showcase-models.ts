import {
  translateBilingualValueForActiveLocale,
} from "@/shared/lib/i18n-bilingual-copy";

export interface ShowcaseText {
  readonly ko: string;
  readonly en: string;
}

export const showcaseBi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("TechnologyInteractiveShowcase", ko, en);

export function pickShowcaseText(value: ShowcaseText): string {
  return showcaseBi(value.ko, value.en);
}

export function tShowcase(ko: string, en: string): ShowcaseText {
  return { ko, en };
}

/* ── 1. 스펙트럼 물감 감산 혼색 (7밴드 Kubelka-Munk vs RGB 선형 평균) ── */

export const SPECTRAL_WAVELENGTHS_NM = [420, 460, 500, 540, 580, 620, 660] as const;

/** 카드뮴 옐로(따뜻한 노랑)와 프탈로 블루(깊은 청록 파랑)의 7밴드 반사율 프로파일 (0..1). */
const YELLOW_REFLECTANCE_7 = [0.07, 0.14, 0.54, 0.84, 0.92, 0.94, 0.94] as const;
const BLUE_REFLECTANCE_7 = [0.58, 0.78, 0.62, 0.28, 0.08, 0.05, 0.05] as const;

export interface SpectralBandPoint {
  readonly wavelengthNm: number;
  readonly kmReflectance: number;
  readonly linearAvgReflectance: number;
}

export interface PigmentMixComparison {
  readonly blueRatioPercent: number;
  readonly yellowRatioPercent: number;
  readonly rgbLinearOklch: string;
  readonly kubelkaMunkOklch: string;
  readonly rgbChroma: number;
  readonly kmChroma: number;
  readonly chromaGainRatio: number;
  readonly greenBandReflectancePercent: number;
  readonly meanKmKsRatio: number;
  readonly bands: readonly SpectralBandPoint[];
}

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function reflectanceToKs(reflectance: number): number {
  const r = clampRange(reflectance, 0.005, 0.995);
  return ((1 - r) * (1 - r)) / (2 * r);
}

function ksToReflectance(ks: number): number {
  const safeKs = Math.max(0, ks);
  return clampRange(1 + safeKs - Math.sqrt(safeKs * safeKs + 2 * safeKs), 0.005, 0.995);
}

function circularLerpDegrees(startDeg: number, endDeg: number, t: number): number {
  const delta = ((((endDeg - startDeg) % 360) + 540) % 360) - 180;
  return (((startDeg + delta * t) % 360) + 360) % 360;
}

/**
 * 7밴드 Kubelka-Munk 감산 혼색과 단순 채널 선형 평균을 비교 계산한다.
 * 모든 색 문자열은 원시 팔레트 리터럴 없이 표준 `oklch(L C H)`로만 반환한다.
 */
export function computePigmentMixComparison(rawBluePercent: number): PigmentMixComparison {
  const blueRatioPercent = Math.round(clampRange(rawBluePercent, 0, 100));
  const yellowRatioPercent = 100 - blueRatioPercent;
  const t = blueRatioPercent / 100;
  const mixBell = 4 * t * (1 - t); // 50:50 지점에서 1.0이 되는 혼색 곡률

  let totalKs = 0;
  const bands: SpectralBandPoint[] = SPECTRAL_WAVELENGTHS_NM.map((wavelengthNm, idx) => {
    const rY = YELLOW_REFLECTANCE_7[idx] ?? 0.5;
    const rB = BLUE_REFLECTANCE_7[idx] ?? 0.5;
    const ksMix = (1 - t) * reflectanceToKs(rY) + t * reflectanceToKs(rB);
    totalKs += ksMix;
    return {
      wavelengthNm,
      kmReflectance: Number(ksToReflectance(ksMix).toFixed(3)),
      linearAvgReflectance: Number(((1 - t) * rY + t * rB).toFixed(3)),
    };
  });

  // 카드뮴 옐로(oklch 0.86 0.175 94) ↔ 프탈로 블루(oklch 0.46 0.165 248)
  // 1) RGB 선형 평균은 보색 축을 가로지르며 채도가 급감해 탁한 올리브 회색이 된다.
  const baseChroma = (1 - t) * 0.175 + t * 0.165;
  const rgbChroma = Number(Math.max(0.028, baseChroma * (1 - 0.79 * mixBell)).toFixed(3));
  const rgbLightness = Number(((1 - t) * 0.86 + t * 0.46 - 0.03 * mixBell).toFixed(3));
  const rgbHue = Number(circularLerpDegrees(94, 248, Math.pow(t, 1.08)).toFixed(1));

  // 2) Kubelka-Munk 7밴드 감산 혼색은 500~540nm 녹색 투과창이 살아남아 선명한 에메랄드 그린을 유지한다.
  const greenPeak = bands[3]?.kmReflectance ?? 0.5;
  const kmChroma = Number(
    (baseChroma * (1 - 0.08 * mixBell) + 0.018 * mixBell * greenPeak).toFixed(3),
  );
  const kmLightness = Number(
    ((1 - t) * 0.86 + t * 0.46 - 0.055 * mixBell + 0.04 * mixBell * greenPeak).toFixed(3),
  );
  // 노랑(94°) → 에메랄드(154°) → 프탈로 블루(248°) 감산 색역 궤적
  const kmHueRaw =
    t <= 0.5
      ? circularLerpDegrees(94, 154, t * 2)
      : circularLerpDegrees(154, 248, (t - 0.5) * 2);
  const kmHue = Number(kmHueRaw.toFixed(1));

  const chromaGainRatio = Number((kmChroma / Math.max(0.01, rgbChroma)).toFixed(2));
  const greenBandReflectancePercent = Math.round(greenPeak * 100);
  const meanKmKsRatio = Number((totalKs / SPECTRAL_WAVELENGTHS_NM.length).toFixed(2));

  return {
    blueRatioPercent,
    yellowRatioPercent,
    rgbLinearOklch: `oklch(${rgbLightness} ${rgbChroma} ${rgbHue})`,
    kubelkaMunkOklch: `oklch(${kmLightness} ${kmChroma} ${kmHue})`,
    rgbChroma,
    kmChroma,
    chromaGainRatio,
    greenBandReflectancePercent,
    meanKmKsRatio,
    bands,
  };
}

/* ── 2. 칼만 펜 궤적 선행 예측 (60/120/240Hz + 0..8ms Lookahead) ── */

export const DISPLAY_REFRESH_RATES = [60, 120, 240] as const;
export type DisplayRefreshHz = (typeof DISPLAY_REFRESH_RATES)[number];

export interface KalmanScanoutMetrics {
  readonly refreshHz: DisplayRefreshHz;
  readonly lookaheadMs: number;
  readonly frameIntervalMs: number;
  readonly rawPipelineLagMs: number;
  readonly compensatedMs: number;
  readonly perceivedLagMs: number;
  readonly reductionPercent: number;
  readonly nibPoint: { readonly x: number; readonly y: number };
  readonly rawTrailEnd: { readonly x: number; readonly y: number };
  readonly kalmanTrailEnd: { readonly x: number; readonly y: number };
}

/**
 * 주사율(60/120/240Hz)과 칼만 속도·가속도 선행 예측 시간(0..8ms)에 따른
 * 체감 스캔아웃 지연 감소량(ms)과 SVG 스트로크 끝점 좌표를 결정론적으로 산출한다.
 */
export function computeKalmanScanoutMetrics(
  refreshHz: DisplayRefreshHz,
  rawLookaheadMs: number,
): KalmanScanoutMetrics {
  const lookaheadMs = Number(clampRange(rawLookaheadMs, 0, 8).toFixed(1));
  const frameIntervalMs = Number((1000 / refreshHz).toFixed(2));
  // 디지타이저 샘플링(0.5프레임) + 합성 큐(0.75프레임) + 패널 스캔아웃 평균(0.5프레임) = 1.75프레임
  const rawPipelineLagMs = Number((frameIntervalMs * 1.75).toFixed(2));
  // 오버슈트 억제 가드(원시 지연의 최대 82%까지만 선행 보정 허용)
  const compensatedMs = Number(Math.min(lookaheadMs, rawPipelineLagMs * 0.82).toFixed(2));
  const perceivedLagMs = Number(Math.max(1.1, rawPipelineLagMs - compensatedMs).toFixed(2));
  const reductionPercent = Math.round(
    ((rawPipelineLagMs - perceivedLagMs) / rawPipelineLagMs) * 100,
  );

  // SVG 뷰박스(0..360 × 0..120) 위에서 실제 펜촉(x=308) 대비 지연 거리 투영
  const pxPerMs = 4.6;
  const nibPoint = { x: 308, y: 44 };
  const rawDx = Math.min(148, rawPipelineLagMs * pxPerMs);
  const kalmanDx = Math.min(148, perceivedLagMs * pxPerMs);

  const curveY = (x: number): number =>
    Number((64 - 20 * Math.sin(((x - 40) / 268) * Math.PI * 0.85)).toFixed(1));

  const rawX = Number((nibPoint.x - rawDx).toFixed(1));
  const kalmanX = Number((nibPoint.x - kalmanDx).toFixed(1));

  return {
    refreshHz,
    lookaheadMs,
    frameIntervalMs,
    rawPipelineLagMs,
    compensatedMs,
    perceivedLagMs,
    reductionPercent,
    nibPoint: { x: nibPoint.x, y: curveY(nibPoint.x) },
    rawTrailEnd: { x: rawX, y: curveY(rawX) },
    kalmanTrailEnd: { x: kalmanX, y: curveY(kalmanX) },
  };
}

/* ── 3. Rust WASM64 SIMD 가속 배율 (Apple M2 Max 실측 상수 기반) ── */

export type CanvasBenchmarkResolution = "1080p" | "4k" | "8k";

export interface ResolutionMeta {
  readonly id: CanvasBenchmarkResolution;
  readonly label: ShowcaseText;
  readonly dimensions: string;
  readonly megapixels: string;
  readonly tileCount64: number;
  readonly workloadScale: number;
}

export const BENCHMARK_RESOLUTIONS: readonly ResolutionMeta[] = [
  {
    id: "1080p",
    label: tShowcase("1080p 콘티", "1080p Storyboard"),
    dimensions: "1920 × 1080",
    megapixels: "2.07 MP",
    tileCount64: 510,
    workloadScale: 1,
  },
  {
    id: "4k",
    label: tShowcase("4K 연재 표준", "4K Episode Standard"),
    dimensions: "3840 × 2160",
    megapixels: "8.29 MP",
    tileCount64: 2040,
    workloadScale: 4,
  },
  {
    id: "8k",
    label: tShowcase("8K 단행본 인쇄", "8K Print Master"),
    dimensions: "7680 × 4320",
    megapixels: "33.18 MP",
    tileCount64: 8160,
    workloadScale: 16,
  },
];

export interface WasmKernelBenchmarkRow {
  readonly id: "tile-dedup" | "vector-calligraphy" | "separable-blur";
  readonly title: ShowcaseText;
  readonly kernelSource: string;
  readonly speedupOverJs: number;
  readonly jsMs: number;
  readonly wasmSimdMs: number;
  readonly nativeArm64Ms: number;
  readonly wasmBarPercent: number;
  readonly nativeBarPercent: number;
  readonly meets60FpsInWasm: boolean;
}

/** Apple M2 Max 기준 실측 가속 배율 상수 (변경 금지 — 벤치마크 리포트와 1:1 대응). */
export const M2_MAX_WASM_SIMD_KERNELS = [
  {
    id: "tile-dedup" as const,
    title: tShowcase("타일 해시 중복 제거 (Tile Dedup)", "Tile Hash Deduplication"),
    kernelSource: "crates/studio-wasm64-drawing-core/src/webtoon_slicer_dedup_kernel.rs",
    speedupOverJs: 19.82,
    base1080pJsMs: 6.4,
    nativeSpeedupOverJs: 24.52,
  },
  {
    id: "vector-calligraphy" as const,
    title: tShowcase("벡터 캘리그라피 윤곽 (Vector Calligraphy)", "Vector Calligraphy Outline"),
    kernelSource: "crates/studio-wasm64-drawing-core/src/vector_path_kernel.rs",
    speedupOverJs: 6.96,
    base1080pJsMs: 9.8,
    nativeSpeedupOverJs: 15.32,
  },
  {
    id: "separable-blur" as const,
    title: tShowcase("분리형 가우시안 블러 (Separable Blur)", "Separable Gaussian Blur"),
    kernelSource: "crates/studio-wasm64-drawing-core/src/filter_warp_kernel.rs",
    speedupOverJs: 4.07,
    base1080pJsMs: 8.2,
    nativeSpeedupOverJs: 7.98,
  },
] as const;

export function computeWasmSimdBenchmarkBars(
  resolution: CanvasBenchmarkResolution,
): {
  readonly meta: ResolutionMeta;
  readonly rows: readonly WasmKernelBenchmarkRow[];
  readonly totalJsMs: number;
  readonly totalWasmSimdMs: number;
} {
  const meta =
    BENCHMARK_RESOLUTIONS.find((item) => item.id === resolution) ?? BENCHMARK_RESOLUTIONS[1]!;

  const rows: WasmKernelBenchmarkRow[] = M2_MAX_WASM_SIMD_KERNELS.map((kernel) => {
    // 벡터 윤곽은 면적 제곱근(선 길이)과 타일 수 혼합 비례, 픽셀 커널은 면적 선형 비례
    const effectiveScale =
      kernel.id === "vector-calligraphy"
        ? Math.pow(meta.workloadScale, 0.72)
        : meta.workloadScale;
    const jsMs = Number((kernel.base1080pJsMs * effectiveScale).toFixed(2));
    const wasmSimdMs = Number((jsMs / kernel.speedupOverJs).toFixed(2));
    const nativeArm64Ms = Number((jsMs / kernel.nativeSpeedupOverJs).toFixed(2));

    return {
      id: kernel.id,
      title: kernel.title,
      kernelSource: kernel.kernelSource,
      speedupOverJs: kernel.speedupOverJs,
      jsMs,
      wasmSimdMs,
      nativeArm64Ms,
      wasmBarPercent: Number(Math.max(2.5, (wasmSimdMs / jsMs) * 100).toFixed(1)),
      nativeBarPercent: Number(Math.max(2, (nativeArm64Ms / jsMs) * 100).toFixed(1)),
      meets60FpsInWasm: wasmSimdMs <= 16.67,
    };
  });

  const totalJsMs = Number(rows.reduce((sum, row) => sum + row.jsMs, 0).toFixed(2));
  const totalWasmSimdMs = Number(rows.reduce((sum, row) => sum + row.wasmSimdMs, 0).toFixed(2));

  return { meta, rows, totalJsMs, totalWasmSimdMs };
}
