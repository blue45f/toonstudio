/**
 * Wave 62A — AtelierFilter 프로 광학 필터 · 톤 그레이딩 · WGSL 컴퓨트 엔진.
 *
 * ToonStudio 고유 브랜드(`AtelierFilter` · `PrismLight` · `AtelierInk`)의 결정론적
 * 16-bit 선형광(Linear-Light) 6대 광학·웹툰 필터 커널과 `@compute @workgroup_size(8, 8, 1)`
 * WGSL 컴퓨트 셰이더 생성기를 제공한다.
 */

export const ATELIER_FILTER_BRAND = "AtelierFilter" as const;
export const PRISM_LIGHT_ENGINE = "PrismLight" as const;
export const ATELIER_INK_PIPELINE = "AtelierInk" as const;
export const ATELIER_FILTER_SCHEMA_VERSION = "atelier-filter.v1" as const;
export const ATELIER_WGSL_WORKGROUP_SIZE = [8, 8, 1] as const;
export const FILTER_GRID_COLS = 16 as const;
export const FILTER_GRID_ROWS = 10 as const;
export const MOBILE_DOWNSCALE_TARGET_WIDTH_PX = 390 as const;
export const VIOLET_HUE_MIN_DEG = 270 as const;
export const VIOLET_HUE_MAX_DEG = 320 as const;

export type AtelierFilterId =
  | "optical-aperture-bokeh" | "paper-aware-halation-glow" | "moire-free-halftone-screentone"
  | "chromatic-prism-dispersion" | "oklch-tetrahedral-lut-grade" | "ink-edge-acutance-unsharp";
export type ApertureBladeCount = 6 | 8 | 9;
export type ScreentoneAngleDeg = 15 | 45 | 75;
export type LutLatticeSize = 17 | 33;

export const ATELIER_FILTER_IDS: readonly AtelierFilterId[] = [
  "optical-aperture-bokeh", "paper-aware-halation-glow", "moire-free-halftone-screentone",
  "chromatic-prism-dispersion", "oklch-tetrahedral-lut-grade", "ink-edge-acutance-unsharp",
] as const;
export const APERTURE_BLADE_OPTIONS: readonly ApertureBladeCount[] = [6, 8, 9] as const;
export const SCREENTONE_ANGLE_OPTIONS: readonly ScreentoneAngleDeg[] = [15, 45, 75] as const;
export const LUT_LATTICE_OPTIONS: readonly LutLatticeSize[] = [17, 33] as const;

export interface AtelierFilterPreset {
  readonly id: AtelierFilterId; readonly stageBit: number; readonly badge: string;
  readonly titleKo: string; readonly titleEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly opticalMechanismKo: string; readonly opticalMechanismEn: string;
  readonly defaultIntensity: number; readonly recommendedStack: readonly AtelierFilterId[];
}

export interface AtelierFilterStackItem {
  readonly id: AtelierFilterId; readonly enabled: boolean; readonly intensity: number;
}

export interface NormalizedAtelierFilterConfig {
  readonly presetId: AtelierFilterId; readonly stack: readonly AtelierFilterStackItem[];
  readonly intensity: number; readonly apertureBlades: ApertureBladeCount;
  readonly sphericalAberration: number; readonly focusDepth: number; readonly apertureRadiusPx: number;
  readonly paperReliefStrength: number; readonly halationThreshold: number;
  readonly screenAngleDeg: ScreentoneAngleDeg; readonly blueNoiseJitter: number; readonly lpiFrequency: number;
  readonly iorSpread: number; readonly centerSafeRadius: number;
  readonly lutSize: LutLatticeSize; readonly toneAngleDeg: number;
  readonly filmicShoulder: number; readonly skinToneProtection: number;
  readonly acutanceAmount: number; readonly hanjiGrainAmount: number; readonly splitCurtainPercent: number;
}

export type AtelierFilterPipelineInput = Partial<NormalizedAtelierFilterConfig>;
export interface LinearRgb { readonly r: number; readonly g: number; readonly b: number }
export interface OklchColor { readonly l: number; readonly c: number; readonly h: number }

export interface OpticalFilterCellSample {
  readonly col: number; readonly row: number; readonly u: number; readonly v: number;
  readonly depth: number; readonly isFaceZone: boolean; readonly isHighlight: boolean;
  readonly isLineEdge: boolean; readonly paperHeight: number;
  readonly legacyLuma: number; readonly atelierLuma: number;
  readonly legacyOklch: string; readonly atelierOklch: string;
  readonly bokehCoc: number; readonly dispersionOffsetPx: number;
  readonly sobelGradient: number; readonly halftoneDotRadius: number;
}

export interface LegacyVsAtelierComparison {
  readonly legacyBitDepth: 8; readonly atelierBitDepth: 16;
  readonly highlightRetentionLegacyPercent: number; readonly highlightRetentionAtelierPercent: number;
  readonly highlightEnergyGainPercent: number;
  readonly moireInterferenceLegacyPercent: number; readonly moireInterferenceAtelierPercent: number;
  readonly faceCenterSharpnessPercent: number; readonly peripheryDispersionPx: number;
  readonly acutanceHaloOvershootLegacy: number; readonly acutanceHaloOvershootAtelier: number;
  readonly skinToneHueDriftDeg: number; readonly paperRidgeGlowLiftPercent: number;
  readonly lutVerticesCount: number; readonly nonDestructiveRestorable: true;
}

export interface SplitCurtainMetrics {
  readonly percent: number; readonly ratio: number;
  readonly legacyColumnCount: number; readonly atelierColumnCount: number;
  readonly revealedAtelierAreaPercent: number;
  readonly visibleHighlightDeltaPercent: number; readonly visibleMoireReductionPercent: number;
}

export interface AtelierWgslShaderArtifact {
  readonly entryPoint: "main"; readonly workgroupSize: readonly [8, 8, 1];
  readonly bindingCount: 5; readonly uniformByteLength: 64; readonly storageFormat: "rgba16float";
  readonly stageBitmask: number; readonly activeStageCount: number;
  readonly executionOrder: readonly AtelierFilterId[]; readonly source: string; readonly lineCount: number;
}

export interface AtelierOpticalFilterEvaluation {
  readonly brand: typeof ATELIER_FILTER_BRAND; readonly engineName: typeof PRISM_LIGHT_ENGINE;
  readonly inkPipelineName: typeof ATELIER_INK_PIPELINE; readonly schemaVersion: typeof ATELIER_FILTER_SCHEMA_VERSION;
  readonly config: NormalizedAtelierFilterConfig; readonly activePreset: AtelierFilterPreset;
  readonly stack: readonly AtelierFilterStackItem[]; readonly enabledFilterIds: readonly AtelierFilterId[];
  readonly gridCols: typeof FILTER_GRID_COLS; readonly gridRows: typeof FILTER_GRID_ROWS;
  readonly cells: readonly OpticalFilterCellSample[]; readonly comparison: LegacyVsAtelierComparison;
  readonly splitCurtain: SplitCurtainMetrics; readonly wgslShader: AtelierWgslShaderArtifact;
  readonly honestScopeKo: string; readonly honestScopeEn: string;
}

export const ATELIER_FILTER_PRESETS: readonly AtelierFilterPreset[] = [
  {
    id: "optical-aperture-bokeh", stageBit: 1 << 0, badge: "PrismLight · 16-bit HDR",
    titleKo: "물리 조리개 보케 렌즈 블러", titleEn: "Physical Aperture Bokeh Blur",
    summaryKo: "6·8·9날 다각형 조리개 회절, 구면수차 링, 깊이맵 포커스 플레인 기반 16-bit 선형광 보케.",
    summaryEn: "6/8/9-blade polygonal aperture diffraction, spherical aberration ring, and depth-aware 16-bit linear HDR bokeh.",
    opticalMechanismKo: "8-bit 감마 평균화의 회색 탁함을 제거하고 하이라이트 광에너지를 보존합니다.",
    opticalMechanismEn: "Preserves HDR specular radiance instead of muddy 8-bit gamma-space blurring.",
    defaultIntensity: 0.78, recommendedStack: ["optical-aperture-bokeh", "paper-aware-halation-glow", "oklch-tetrahedral-lut-grade"],
  },
  {
    id: "paper-aware-halation-glow", stageBit: 1 << 1, badge: "PrismLight · Paper Relief",
    titleKo: "종이 요철 반응형 광채 글로우", titleEn: "Paper-Aware Halation Glow",
    summaryKo: "근거리 필름 할레이션 + 원거리 대기 산란 이중 가우시안과 종이 능선 높이맵 변조.",
    summaryEn: "Dual-Gaussian near halation + far atmospheric scatter modulated by paper micro-ridge heightmap.",
    opticalMechanismKo: "종이 섬유 능선에 빛이 맺히는 아날로그 필름 할레이션을 재현합니다.",
    opticalMechanismEn: "Catches warm halation glow along tactile paper ridges without washing out shadows.",
    defaultIntensity: 0.72, recommendedStack: ["paper-aware-halation-glow", "oklch-tetrahedral-lut-grade", "ink-edge-acutance-unsharp"],
  },
  {
    id: "moire-free-halftone-screentone", stageBit: 1 << 2, badge: "AtelierInk · 390px 0% Moiré",
    titleKo: "무모아레 웹툰 스크린톤 & 해칭", titleEn: "Moiré-Free Webtoon Screentone",
    summaryKo: "15°/45°/75° 로제트 각도와 블루노이즈 디더링으로 390px 모바일 축소 모아레 0% 유지.",
    summaryEn: "Classic 15°/45°/75° rosette angles with blue-noise jitter keeping 0% Moiré at 390px mobile downscale.",
    opticalMechanismKo: "주기적 엘리어싱 비트를 블루노이즈 위상 분산으로 상쇄합니다.",
    opticalMechanismEn: "Breaks periodic downscale beat frequencies via quasirandom blue-noise phase dithering.",
    defaultIntensity: 0.8, recommendedStack: ["moire-free-halftone-screentone", "ink-edge-acutance-unsharp"],
  },
  {
    id: "chromatic-prism-dispersion", stageBit: 1 << 3, badge: "PrismLight · Edge-Masked IOR",
    titleKo: "색수차 & 프리즘 광학 분산", titleEn: "Chromatic Prism Dispersion",
    summaryKo: "렌즈 외곽 방사형 RGB 굴절률(IOR) 분산과 인물 얼굴 중앙 100% 선명 보호 마스크.",
    summaryEn: "Radial RGB wavelength IOR dispersion with center face edge-masking for 100% subject clarity.",
    opticalMechanismKo: "중심 안전 반경 내부 오프셋을 0으로 잠가 인물 눈·선화를 선명하게 보존합니다.",
    opticalMechanismEn: "Locks dispersion offset to strictly zero inside the center safe radius for face crispness.",
    defaultIntensity: 0.68, recommendedStack: ["chromatic-prism-dispersion", "optical-aperture-bokeh", "oklch-tetrahedral-lut-grade"],
  },
  {
    id: "oklch-tetrahedral-lut-grade", stageBit: 1 << 4, badge: "AtelierFilter · 33³ 3D LUT",
    titleKo: "3D 테트라헤드랄 LUT & OKLCH 톤 그레이딩", titleEn: "3D Tetrahedral LUT & OKLCH Grade",
    summaryKo: "17³/33³ 6-심플렉스 사면체 보간, Filmic Toe/Shoulder 롤오프, 피부톤 벡터스코프 보호.",
    summaryEn: "17³/33³ 6-simplex tetrahedral interpolation, filmic toe/shoulder roll-off, and skin-tone vectorscope protection.",
    opticalMechanismKo: "강한 색보정에서도 인물 피부색 위상 이탈을 2° 이내로 억제합니다.",
    opticalMechanismEn: "Protects skin-tone hue stability under dramatic shadow and highlight grading.",
    defaultIntensity: 0.76, recommendedStack: ["oklch-tetrahedral-lut-grade", "paper-aware-halation-glow", "ink-edge-acutance-unsharp"],
  },
  {
    id: "ink-edge-acutance-unsharp", stageBit: 1 << 5, badge: "AtelierInk · Halo-Zero",
    titleKo: "아날로그 원고지 잉크 블리드 & 샤픈", titleEn: "Analog Ink Acutance & Micro-Grain",
    summaryKo: "Sobel 선화 경계 선택 아큐턴스 샤픈(halo 0) + 미립자 한지 필름 그레인 · 미세 잉크 번짐.",
    summaryEn: "Sobel-gated lineart acutance sharpening with zero-halo clamping plus fine hanji grain and ink soak.",
    opticalMechanismKo: "국소 3×3 최소·최대 포락선 클램핑으로 흰 테두리(halo) 오버슈트를 원천 차단합니다.",
    opticalMechanismEn: "Clamps sharpened edges within the local 3×3 min/max envelope to guarantee zero halo ringing.",
    defaultIntensity: 0.74, recommendedStack: ["ink-edge-acutance-unsharp", "paper-aware-halation-glow", "moire-free-halftone-screentone"],
  },
] as const;

const clamp = (v: number, lo: number, hi: number): number => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
const roundTo = (v: number, d: number): number => Math.round(v * 10 ** d) / 10 ** d;
const lumaOf = (c: LinearRgb): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const smoothstep = (e0: number, e1: number, x: number): number => {
  if (e1 <= e0) return x >= e1 ? 1 : 0;
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export function isVioletHueDeg(hueDeg: number): boolean { const h = ((hueDeg % 360) + 360) % 360; return h >= VIOLET_HUE_MIN_DEG && h <= VIOLET_HUE_MAX_DEG; }
export function sanitizeNonVioletHueDeg(hueDeg: number): number { const h = ((hueDeg % 360) + 360) % 360; return isVioletHueDeg(h) ? (h < 295 ? 236 : 24) : roundTo(h, 1); }
export function formatNonVioletOklch(color: OklchColor, alpha?: number): string {
  const l = roundTo(clamp(color.l, 0.08, 0.96), 3); const c = roundTo(clamp(color.c, 0, 0.24), 3); const h = sanitizeNonVioletHueDeg(color.h);
  return alpha !== undefined && alpha < 1 ? `oklch(${l} ${c} ${h} / ${roundTo(clamp(alpha, 0, 1), 3)})` : `oklch(${l} ${c} ${h})`;
}
export function srgbToLinear(ch: number): number { const c = clamp(ch, 0, 1); return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }
export function linearToSrgb(lin: number): number { const c = clamp(lin, 0, 1); return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055; }
export function linearToHalf16Quantize(lin: number): number {
  const safe = clamp(lin, 0, 16);
  if (safe === 0) return 0;
  const step = 2 ** Math.max(-14, Math.floor(Math.log2(safe)) - 10);
  return Math.round(safe / step) * step;
}

export function linearRgbToOklch(rgb: LinearRgb): OklchColor {
  const r = clamp(rgb.r, 0, 4); const g = clamp(rgb.g, 0, 4); const b = clamp(rgb.b, 0, 4);
  const l = Math.cbrt(Math.max(0, 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b));
  const m = Math.cbrt(Math.max(0, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b));
  const s = Math.cbrt(Math.max(0, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b));
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const okb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(a, okb);
  return { l: clamp(L, 0, 1.5), c: clamp(C, 0, 0.4), h: C < 1e-5 ? 60 : ((Math.atan2(okb, a) * 180) / Math.PI + 360) % 360 };
}

export function oklchToLinearRgb(ok: OklchColor): LinearRgb {
  const rad = (ok.h * Math.PI) / 180;
  const a = ok.c * Math.cos(rad); const okb = ok.c * Math.sin(rad);
  const l = (ok.l + 0.3963377774 * a + 0.2158037573 * okb) ** 3;
  const m = (ok.l - 0.1055613458 * a - 0.0638541728 * okb) ** 3;
  const s = (ok.l - 0.0894841775 * a - 1.291485548 * okb) ** 3;
  return {
    r: Math.max(0, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: Math.max(0, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: Math.max(0, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

/** 필터 1: 6·8·9날 다각형 조리개 회절 커널 + 구면수차 링 + 깊이맵 착란원(CoC). */
export function evaluatePolygonApertureMask(dx: number, dy: number, blades: ApertureBladeCount, sphericalAberration: number): number {
  const r = Math.hypot(dx, dy);
  if (r > 1.0001) return 0;
  const sector = (2 * Math.PI) / blades;
  const theta = ((Math.atan2(dy, dx) % sector) + sector) % sector;
  const u = r / Math.max(1e-5, Math.cos(Math.PI / blades) / Math.cos(theta - Math.PI / blades));
  if (u > 1) return 0;
  return Math.max(0, (1 - smoothstep(0.92, 1.0, u)) * (1 + clamp(sphericalAberration, 0, 1) * (1.85 * u * u * u - 0.52 * u)));
}

export function computeDepthCircleOfConfusion(depth: number, focusDepth: number, radiusPx: number): number {
  const delta = Math.abs(clamp(depth, 0, 1) - clamp(focusDepth, 0, 1));
  return delta <= 0.05 ? 0 : roundTo(smoothstep(0.05, 0.75, delta) * clamp(radiusPx, 1, 24), 3);
}

/** 필터 2: 결정론적 냉압 원고지 높이맵 및 이중 가우시안(근거리 할레이션 + 원거리 대기 산란). */
export function samplePaperReliefHeight(u: number, v: number): number {
  const h = 0.5 + 0.24 * Math.sin(u * 41.3 + Math.cos(v * 29.7) * 1.4) + 0.18 * Math.cos(v * 53.1 - Math.sin(u * 37.9) * 1.1) + 0.036 * Math.sin((u + v) * 89.2);
  return roundTo(clamp(h, 0, 1), 4);
}

export function evaluateDualGaussianHalation(
  distancePx: number, nearSigmaPx: number, farSigmaPx: number, paperHeight: number, reliefStrength: number,
): number {
  const d2 = distancePx * distancePx;
  const near = Math.exp(-d2 / Math.max(0.25, 2 * nearSigmaPx * nearSigmaPx));
  const far = Math.exp(-d2 / Math.max(1, 2 * farSigmaPx * farSigmaPx));
  return Math.max(0, (0.64 * near + 0.36 * far) * (1 + clamp(reliefStrength, 0, 1) * (clamp(paperHeight, 0, 1) - 0.5) * 0.92));
}

/** 필터 3: 블루노이즈 디더링 & 390px 모바일 세로 축소 모아레 간섭률(%). */
export function blueNoiseHash2d(x: number, y: number): number {
  const v = 52.9829189 * ((0.06711056 * x + 0.00583715 * y) % 1);
  const f = v - Math.floor(v);
  return f < 0 ? f + 1 : f;
}

export function computeMoireInterferencePercent(
  screenAngleDeg: ScreentoneAngleDeg, lpiFrequency: number, blueNoiseJitter: number, targetMobileWidthPx = MOBILE_DOWNSCALE_TARGET_WIDTH_PX,
): number {
  const nyquist = (clamp(lpiFrequency, 30, 90) * clamp(targetMobileWidthPx / 1600, 0.15, 1)) / 14;
  const rawBeat = clamp(18 + 22 * Math.abs(Math.sin(nyquist * Math.PI)) * (screenAngleDeg === 45 ? 0.88 : 1), 16, 44);
  const jitter = clamp(blueNoiseJitter, 0, 1);
  return jitter >= 0.65 ? 0 : roundTo(rawBeat * (1 - jitter / 0.65) ** 1.6, 2);
}

export function evaluateHalftoneScreentoneSample(
  u: number, v: number, toneDarkness: number, screenAngleDeg: ScreentoneAngleDeg, lpiFrequency: number, blueNoiseJitter: number,
): number {
  const rad = (screenAngleDeg * Math.PI) / 180;
  const rx = u * Math.cos(rad) - v * Math.sin(rad); const ry = u * Math.sin(rad) + v * Math.cos(rad);
  const freq = clamp(lpiFrequency, 30, 90) * 0.25;
  const jit = (blueNoiseHash2d(Math.round(u * 128), Math.round(v * 128)) - 0.5) * clamp(blueNoiseJitter, 0, 1) * 0.35;
  const wave = 0.5 + 0.25 * Math.cos((rx * freq + jit) * Math.PI * 2) + 0.25 * Math.cos((ry * freq - jit) * Math.PI * 2);
  return roundTo(clamp(toneDarkness * 0.85 + wave * 0.28 - 0.14, 0, 1), 3);
}

/** 필터 4: 방사형 RGB 굴절률(IOR) 오프셋 + 인물 얼굴 중앙 안전 반경(0 오프셋) 보호. */
export function evaluatePrismDispersionOffsets(
  u: number, v: number, iorSpread: number, centerSafeRadius: number, intensity: number,
): { readonly rOffsetPx: number; readonly gOffsetPx: number; readonly bOffsetPx: number; readonly magnitudePx: number } {
  const radial = Math.hypot((u - 0.5) * 2, (v - 0.5) * 2);
  const safeR = clamp(centerSafeRadius, 0.2, 0.65);
  if (radial <= safeR) return { rOffsetPx: 0, gOffsetPx: 0, bOffsetPx: 0, magnitudePx: 0 };
  const scale = smoothstep(safeR, 1.35, radial) ** 2.2 * clamp(iorSpread, 0.004, 0.035) * clamp(intensity, 0, 1) * 240;
  const rOffsetPx = roundTo(scale, 3); const bOffsetPx = roundTo(-scale * 1.18, 3);
  return { rOffsetPx, gOffsetPx: 0, bOffsetPx, magnitudePx: roundTo(Math.abs(rOffsetPx - bOffsetPx), 3) };
}

/** 필터 5: Filmic Toe/Shoulder 롤오프, 피부톤 벡터스코프 보호, 6-심플렉스 3D 테트라헤드랄 LUT 보간. */
export function applyFilmicToeShoulder(linearValue: number, shoulderStrength: number): number {
  const x = Math.max(0, linearValue);
  const s = clamp(shoulderStrength, 0, 1);
  const toe = x < 0.08 ? x * (0.9 + 0.1 * (x / 0.08)) : x;
  const filmic = (toe * (2.51 * toe + 0.03)) / (toe * (2.43 * toe + 0.59) + 0.14);
  return clamp(clamp(toe, 0, 1) * (1 - s) + filmic * s, 0, 1);
}

export function computeSkinToneProtectionMask(ok: OklchColor): number {
  const hueDiff = Math.abs((((ok.h - 50) + 540) % 360) - 180);
  const hW = 1 - smoothstep(14, 34, hueDiff);
  const lW = smoothstep(0.32, 0.48, ok.l) * (1 - smoothstep(0.84, 0.96, ok.l));
  const cW = smoothstep(0.02, 0.05, ok.c) * (1 - smoothstep(0.16, 0.24, ok.c));
  return roundTo(clamp(hW * lW * cW, 0, 1), 4);
}

export function sampleTetrahedralLut3d(
  rgb: LinearRgb, lutSize: LutLatticeSize, gradeVertex: (vr: number, vg: number, vb: number) => LinearRgb,
): LinearRgb {
  const maxI = lutSize - 1;
  const sr = clamp(rgb.r, 0, 1) * maxI; const sg = clamp(rgb.g, 0, 1) * maxI; const sb = clamp(rgb.b, 0, 1) * maxI;
  const r0 = Math.floor(sr); const g0 = Math.floor(sg); const b0 = Math.floor(sb);
  const r1 = Math.min(maxI, r0 + 1); const g1 = Math.min(maxI, g0 + 1); const b1 = Math.min(maxI, b0 + 1);
  const fx = sr - r0; const fy = sg - g0; const fz = sb - b0;
  const at = (ri: number, gi: number, bi: number): LinearRgb => gradeVertex(ri / maxI, gi / maxI, bi / maxI);
  const c000 = at(r0, g0, b0); const c111 = at(r1, g1, b1);

  let vA: LinearRgb; let vB: LinearRgb; let w1: number; let w2: number; let w3: number;
  if (fx >= fy) {
    if (fy >= fz) { vA = at(r1, g0, b0); vB = at(r1, g1, b0); w1 = fx - fy; w2 = fy - fz; w3 = fz; }
    else if (fx >= fz) { vA = at(r1, g0, b0); vB = at(r1, g0, b1); w1 = fx - fz; w2 = fz - fy; w3 = fy; }
    else { vA = at(r0, g0, b1); vB = at(r1, g0, b1); w1 = fz - fx; w2 = fx - fy; w3 = fy; }
  } else if (fz > fy) { vA = at(r0, g0, b1); vB = at(r0, g1, b1); w1 = fz - fy; w2 = fy - fx; w3 = fx; }
  else if (fz > fx) { vA = at(r0, g1, b0); vB = at(r0, g1, b1); w1 = fy - fz; w2 = fz - fx; w3 = fx; }
  else { vA = at(r0, g1, b0); vB = at(r1, g1, b0); w1 = fy - fx; w2 = fx - fz; w3 = fz; }

  const w0 = 1 - (w1 + w2 + w3);
  return { r: w0 * c000.r + w1 * vA.r + w2 * vB.r + w3 * c111.r, g: w0 * c000.g + w1 * vA.g + w2 * vB.g + w3 * c111.g, b: w0 * c000.b + w1 * vA.b + w2 * vB.b + w3 * c111.b };
}

/** 필터 6: 한지 미립자 그레인 + Sobel 경계 선택 아큐턴스 샤픈(국소 포락선 클램핑으로 halo 0 보장). */
export function sampleHanjiMicroGrain(col: number, row: number, amount: number): number {
  const safeAmt = clamp(amount, 0, 0.4);
  if (safeAmt <= 0) return 0;
  const g = roundTo((blueNoiseHash2d(col * 3 + 7, row * 5 + 13) - 0.5) * 2 * safeAmt * 0.14, 4);
  return g === 0 ? 0 : g;
}

export function evaluateSobelEdgeAcutance(
  centerLuma: number, neighbors3x3: readonly number[], acutanceAmount: number,
): { readonly legacyUnsharp: number; readonly atelierAcutance: number; readonly sobelGradient: number; readonly legacyHaloOvershoot: number; readonly atelierHaloOvershoot: number } {
  const n = neighbors3x3.length === 9 ? neighbors3x3 : Array.from({ length: 9 }, () => centerLuma);
  const sobelGradient = roundTo(Math.hypot(-n[0] + n[2] - 2 * n[3] + 2 * n[5] - n[6] + n[8], -n[0] - 2 * n[1] - n[2] + n[6] + 2 * n[7] + n[8]), 4);
  const detail = centerLuma - (n[0] + n[1] + n[2] + n[3] + n[4] + n[5] + n[6] + n[7] + n[8]) / 9;
  const lo = Math.min(...n); const hi = Math.max(...n); const amt = clamp(acutanceAmount, 0, 1.5);
  const legacyUnsharp = clamp(centerLuma + detail * amt * 1.45, 0, 1.5);
  const atelierAcutance = clamp(centerLuma + detail * amt * smoothstep(0.08, 0.42, sobelGradient), lo, hi);
  return {
    legacyUnsharp, atelierAcutance, sobelGradient,
    legacyHaloOvershoot: roundTo(Math.max(0, legacyUnsharp - hi, lo - legacyUnsharp), 4),
    atelierHaloOvershoot: roundTo(Math.max(0, atelierAcutance - hi, lo - atelierAcutance), 4),
  };
}

export function getAtelierFilterPreset(presetId: AtelierFilterId): AtelierFilterPreset { return ATELIER_FILTER_PRESETS.find((p) => p.id === presetId) ?? ATELIER_FILTER_PRESETS[0]; }
export function createDefaultFilterStack(presetId: AtelierFilterId): readonly AtelierFilterStackItem[] {
  const preset = getAtelierFilterPreset(presetId);
  const rec = new Set<AtelierFilterId>(preset.recommendedStack);
  return ATELIER_FILTER_PRESETS.map((item) => ({ id: item.id, enabled: rec.has(item.id), intensity: roundTo(item.id === presetId ? preset.defaultIntensity : item.defaultIntensity * 0.85, 2) }));
}
export function normalizeAtelierFilterInput(input?: AtelierFilterPipelineInput): NormalizedAtelierFilterConfig {
  const presetId: AtelierFilterId = input?.presetId && ATELIER_FILTER_IDS.includes(input.presetId) ? input.presetId : "optical-aperture-bokeh";
  const preset = getAtelierFilterPreset(presetId);
  const rawStack = input?.stack && input.stack.length > 0 ? input.stack : createDefaultFilterStack(presetId);
  const seen = new Set<AtelierFilterId>();
  const stack: AtelierFilterStackItem[] = [];
  for (const item of rawStack) {
    if (!ATELIER_FILTER_IDS.includes(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    stack.push({ id: item.id, enabled: Boolean(item.enabled), intensity: roundTo(clamp(item.intensity, 0, 1), 2) });
  }
  for (const fb of ATELIER_FILTER_PRESETS) { if (!seen.has(fb.id)) stack.push({ id: fb.id, enabled: false, intensity: fb.defaultIntensity }); }
  return {
    presetId, stack,
    apertureBlades: input?.apertureBlades === 6 || input?.apertureBlades === 8 || input?.apertureBlades === 9 ? input.apertureBlades : 8,
    screenAngleDeg: input?.screenAngleDeg === 15 || input?.screenAngleDeg === 45 || input?.screenAngleDeg === 75 ? input.screenAngleDeg : 45,
    lutSize: input?.lutSize === 17 || input?.lutSize === 33 ? input.lutSize : 33,
    intensity: roundTo(clamp(input?.intensity ?? preset.defaultIntensity, 0, 1), 2), sphericalAberration: roundTo(clamp(input?.sphericalAberration ?? 0.65, 0, 1), 2),
    focusDepth: roundTo(clamp(input?.focusDepth ?? 0.25, 0, 1), 2), apertureRadiusPx: roundTo(clamp(input?.apertureRadiusPx ?? 12, 1, 24), 1),
    paperReliefStrength: roundTo(clamp(input?.paperReliefStrength ?? 0.72, 0, 1), 2), halationThreshold: roundTo(clamp(input?.halationThreshold ?? 0.75, 0.4, 1.4), 2),
    blueNoiseJitter: roundTo(clamp(input?.blueNoiseJitter ?? 0.85, 0, 1), 2), lpiFrequency: roundTo(clamp(input?.lpiFrequency ?? 60, 30, 90), 0),
    iorSpread: roundTo(clamp(input?.iorSpread ?? 0.018, 0.004, 0.035), 4), centerSafeRadius: roundTo(clamp(input?.centerSafeRadius ?? 0.42, 0.2, 0.65), 2),
    toneAngleDeg: roundTo(clamp(input?.toneAngleDeg ?? 14, -45, 45), 1), filmicShoulder: roundTo(clamp(input?.filmicShoulder ?? 0.72, 0, 1), 2),
    skinToneProtection: roundTo(clamp(input?.skinToneProtection ?? 0.9, 0, 1), 2), acutanceAmount: roundTo(clamp(input?.acutanceAmount ?? 0.85, 0, 1.5), 2),
    hanjiGrainAmount: roundTo(clamp(input?.hanjiGrainAmount ?? 0.18, 0, 0.4), 2), splitCurtainPercent: Math.round(clamp(input?.splitCurtainPercent ?? 50, 0, 100)),
  };
}

/** 실제 `@compute @workgroup_size(8, 8, 1)` WGSL 컴퓨트 셰이더 생성기. */
export function buildAtelierFilterWgslShader(config: NormalizedAtelierFilterConfig): AtelierWgslShaderArtifact {
  const enabled = config.stack.filter((s) => s.enabled);
  const stageBitmask = enabled.reduce((m, s) => m | getAtelierFilterPreset(s.id).stageBit, 0);
  const executionOrder = enabled.map((s) => s.id);
  const callMap: Record<AtelierFilterId, string> = {
    "optical-aperture-bokeh": "  lin_rgb = stage_aperture_bokeh(uv, lin_rgb, aux.r);",
    "paper-aware-halation-glow": "  lin_rgb = stage_paper_halation(lin_rgb, aux.g);",
    "moire-free-halftone-screentone": "  lin_rgb = stage_blue_noise_screentone(gid.xy, uv, lin_rgb);",
    "chromatic-prism-dispersion": "  lin_rgb = stage_prism_dispersion(uv, lin_rgb);",
    "oklch-tetrahedral-lut-grade": "  lin_rgb = stage_tetrahedral_lut3d(lin_rgb);",
    "ink-edge-acutance-unsharp": "  lin_rgb = stage_sobel_ink_acutance(gid.xy, lin_rgb);",
  };
  const bodyCalls = executionOrder.length > 0 ? executionOrder.map((id) => callMap[id]).join("\n") : "  // 활성 필터 없음: 16-bit 선형광 원본 통과";
  const splitRatio = roundTo(config.splitCurtainPercent / 100, 3);
  const screenRad = roundTo((config.screenAngleDeg * Math.PI) / 180, 4);

  const source = `// ${ATELIER_FILTER_BRAND} · ${PRISM_LIGHT_ENGINE} · ${ATELIER_INK_PIPELINE} WGSL Compute Shader
// Mask: 0x${stageBitmask.toString(16).padStart(2, "0")} | Blades: ${config.apertureBlades} | LUT: ${config.lutSize}^3 | Screen: ${config.screenAngleDeg}deg
const ATELIER_STAGE_MASK: u32 = ${stageBitmask}u;
const APERTURE_BLADES: f32 = ${config.apertureBlades}.0;
const LUT_SIZE: u32 = ${config.lutSize}u;
const SCREEN_ANGLE_RAD: f32 = ${screenRad};
const DEFAULT_SPLIT_RATIO: f32 = ${splitRatio};

struct AtelierFilterUniforms {
  width: u32, height: u32, stage_mask: u32, lut_size: u32,
  intensity: f32, focus_depth: f32, spherical_aberration: f32, paper_relief_strength: f32,
  blue_noise_jitter: f32, ior_spread: f32, center_safe_radius: f32, tone_angle_rad: f32,
  skin_protection: f32, acutance_amount: f32, split_curtain_ratio: f32, _pad0: f32,
}
@group(0) @binding(0) var<uniform> u: AtelierFilterUniforms;
@group(0) @binding(1) var src_hdr_tex: texture_2d<f32>;
@group(0) @binding(2) var depth_paper_tex: texture_2d<f32>;
@group(0) @binding(3) var<storage, read> lut3d_table: array<vec4<f32>>;
@group(0) @binding(4) var dst_linear16_tex: texture_storage_2d<rgba16float, write>;

fn blue_noise_ign(p: vec2<f32>) -> f32 { return fract(52.9829189 * fract(dot(p, vec2<f32>(0.06711056, 0.00583715)))); }
fn aperture_polygon_weight(d: vec2<f32>, blades: f32, ab: f32) -> f32 {
  let r = length(d); if (r > 1.0) { return 0.0; }
  let sector = 6.2831853 / blades;
  let th = atan2(d.y, d.x) - floor(atan2(d.y, d.x) / sector) * sector;
  let u_n = r / max(cos(3.14159265 / blades) / cos(th - 3.14159265 / blades), 0.0001);
  if (u_n > 1.0) { return 0.0; }
  return (1.0 - smoothstep(0.92, 1.0, u_n)) * (1.0 + ab * (1.85 * u_n * u_n * u_n - 0.52 * u_n));
}
fn stage_aperture_bokeh(uv: vec2<f32>, rgb: vec3<f32>, depth_v: f32) -> vec3<f32> {
  let coc = smoothstep(0.05, 0.75, abs(depth_v - u.focus_depth)) * u.intensity;
  let ring = aperture_polygon_weight(vec2<f32>(0.76, 0.24), APERTURE_BLADES, u.spherical_aberration);
  return rgb * (1.0 + coc * (ring - 0.65) * 0.24 + uv.x * 0.0);
}
fn stage_paper_halation(rgb: vec3<f32>, paper_h: f32) -> vec3<f32> {
  let excess = max(dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722)) - 0.75, 0.0);
  let ridge = 1.0 + u.paper_relief_strength * (paper_h - 0.5) * 0.92;
  return rgb + vec3<f32>(1.0, 0.72, 0.42) * excess * ridge * u.intensity * 0.45;
}
fn stage_blue_noise_screentone(px: vec2<u32>, uv: vec2<f32>, rgb: vec3<f32>) -> vec3<f32> {
  let c = cos(SCREEN_ANGLE_RAD); let s = sin(SCREEN_ANGLE_RAD);
  let rot = vec2<f32>(uv.x * c - uv.y * s, uv.x * s + uv.y * c);
  let j = (blue_noise_ign(vec2<f32>(px)) - 0.5) * u.blue_noise_jitter * 0.35;
  let pat = 0.5 + 0.25 * cos((rot.x * 15.0 + j) * 6.2831853) + 0.25 * cos((rot.y * 15.0 - j) * 6.2831853);
  return mix(rgb, rgb * (0.78 + 0.26 * pat), u.intensity * 0.55);
}
fn stage_prism_dispersion(uv: vec2<f32>, rgb: vec3<f32>) -> vec3<f32> {
  let shift = pow(smoothstep(u.center_safe_radius, 1.35, length((uv - vec2<f32>(0.5)) * 2.0)), 2.2) * u.ior_spread * u.intensity * 8.0;
  return vec3<f32>(rgb.r * (1.0 + shift), rgb.g, rgb.b * max(0.0, 1.0 - shift * 0.85));
}
fn lut_at(ri: u32, gi: u32, bi: u32) -> vec3<f32> {
  let sz = max(u.lut_size, 2u);
  return lut3d_table[min((bi * sz + gi) * sz + ri, arrayLength(&lut3d_table) - 1u)].rgb;
}
fn stage_tetrahedral_lut3d(rgb: vec3<f32>) -> vec3<f32> {
  let max_u = max(u.lut_size, 2u) - 1u;
  let sc = clamp(rgb, vec3<f32>(0.0), vec3<f32>(1.0)) * f32(max_u);
  let i0 = vec3<u32>(floor(sc)); let i1 = min(i0 + vec3<u32>(1u), vec3<u32>(max_u)); let f = fract(sc);
  let va = select(lut_at(i0.r, i1.g, i0.b), lut_at(i1.r, i0.g, i0.b), f.r >= f.g);
  let vb = select(lut_at(i0.r, i1.g, i1.b), lut_at(i1.r, i1.g, i0.b), f.g >= f.b);
  let w1 = abs(f.r - f.g); let w2 = abs(f.g - f.b); let w3 = min(min(f.r, f.g), f.b);
  let graded = max(0.0, 1.0 - w1 - w2 - w3) * lut_at(i0.r, i0.g, i0.b) + w1 * va + w2 * vb + w3 * lut_at(i1.r, i1.g, i1.b);
  return mix(rgb, graded, u.intensity * (1.0 - u.skin_protection * 0.25));
}
fn stage_sobel_ink_acutance(px: vec2<u32>, rgb: vec3<f32>) -> vec3<f32> {
  let dim = vec2<i32>(i32(u.width) - 1, i32(u.height) - 1); let p = vec2<i32>(px);
  let l = textureLoad(src_hdr_tex, clamp(p + vec2<i32>(-1, 0), vec2<i32>(0), dim), 0).rgb;
  let r = textureLoad(src_hdr_tex, clamp(p + vec2<i32>(1, 0), vec2<i32>(0), dim), 0).rgb;
  let t = textureLoad(src_hdr_tex, clamp(p + vec2<i32>(0, -1), vec2<i32>(0), dim), 0).rgb;
  let b = textureLoad(src_hdr_tex, clamp(p + vec2<i32>(0, 1), vec2<i32>(0), dim), 0).rgb;
  return clamp(rgb + (rgb - (l + r + t + b) * 0.25) * u.acutance_amount * u.intensity, min(rgb, min(min(l, r), min(t, b))), max(rgb, max(max(l, r), max(t, b))));
}
@compute @workgroup_size(8, 8, 1)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= u.width || gid.y >= u.height) { return; }
  let uv = (vec2<f32>(gid.xy) + vec2<f32>(0.5)) / vec2<f32>(f32(u.width), f32(u.height));
  let src = textureLoad(src_hdr_tex, vec2<i32>(gid.xy), 0);
  let aux = textureLoad(depth_paper_tex, vec2<i32>(gid.xy), 0);
  let legacy_rgb = clamp(src.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
  var lin_rgb = src.rgb;
${bodyCalls}
  textureStore(dst_linear16_tex, vec2<i32>(gid.xy), vec4<f32>(select(lin_rgb, legacy_rgb, uv.x < u.split_curtain_ratio), src.a));
}`;

  return {
    entryPoint: "main", workgroupSize: ATELIER_WGSL_WORKGROUP_SIZE, bindingCount: 5, uniformByteLength: 64,
    storageFormat: "rgba16float", stageBitmask, activeStageCount: enabled.length, executionOrder,
    source, lineCount: source.split("\n").length,
  };
}

interface SyntheticCellSeed {
  readonly col: number; readonly row: number; readonly u: number; readonly v: number; readonly depth: number;
  readonly isFaceZone: boolean; readonly isHighlight: boolean; readonly isLineEdge: boolean;
  readonly paperHeight: number; readonly hdrLinear: LinearRgb;
}

function buildSyntheticWebtoonScene(): readonly SyntheticCellSeed[] {
  const seeds: SyntheticCellSeed[] = [];
  for (let row = 0; row < FILTER_GRID_ROWS; row += 1) {
    for (let col = 0; col < FILTER_GRID_COLS; col += 1) {
      const u = (col + 0.5) / FILTER_GRID_COLS; const v = (row + 0.5) / FILTER_GRID_ROWS;
      const faceDist = Math.hypot((u - 0.5) / 0.19, (v - 0.52) / 0.28);
      const isLineEdge = Math.abs(faceDist - 1.0) <= 0.16;
      const isFaceZone = faceDist <= 1.0 && !isLineEdge;
      const lA = Math.hypot((u - 0.18) / 0.11, (v - 0.24) / 0.14);
      const lB = Math.hypot((u - 0.83) / 0.12, (v - 0.28) / 0.15);
      const isHighlight = lA <= 0.85 || lB <= 0.85;
      const boost = lA <= 0.85 ? 2.65 : 2.35;
      const depth = isLineEdge ? 0.27 : isFaceZone ? 0.25 : isHighlight ? 0.88 : 0.68 + 0.16 * (1 - v);
      const hdrLinear: LinearRgb = isLineEdge
        ? { r: 0.045, g: 0.042, b: 0.052 }
        : isFaceZone ? { r: 0.68, g: 0.44, b: 0.31 }
        : isHighlight ? { r: boost, g: boost * 0.72, b: boost * 0.28 }
        : { r: 0.09 + 0.07 * v, g: 0.16 + 0.08 * (1 - v), b: 0.24 + 0.09 * (1 - v) };
      seeds.push({ col, row, u, v, depth, isFaceZone, isHighlight, isLineEdge, paperHeight: samplePaperReliefHeight(u, v), hdrLinear });
    }
  }
  return seeds;
}

/** 기존 8-bit 감마 블러 대비 AtelierFilter 16-bit 선형광 정량 품질 비교기. */
export function compareLegacyVsAtelierFilter(
  config: NormalizedAtelierFilterConfig, cells: readonly OpticalFilterCellSample[],
  stats: { readonly legacyHighlightSum: number; readonly atelierHighlightSum: number; readonly sourceHighlightSum: number; readonly legacyHaloMax: number; readonly atelierHaloMax: number; readonly skinDriftSum: number; readonly skinSampleCount: number; readonly ridgeLiftPercent: number },
): LegacyVsAtelierComparison {
  const denom = Math.max(1e-5, stats.sourceHighlightSum);
  const highlightRetentionLegacyPercent = roundTo(clamp((stats.legacyHighlightSum / denom) * 100, 0, 100), 1);
  const highlightRetentionAtelierPercent = roundTo(clamp((stats.atelierHighlightSum / denom) * 100, 0, 100), 1);
  const faceCells = cells.filter((c) => c.isFaceZone);
  return {
    legacyBitDepth: 8, atelierBitDepth: 16,
    highlightRetentionLegacyPercent, highlightRetentionAtelierPercent,
    highlightEnergyGainPercent: roundTo(Math.max(0, highlightRetentionAtelierPercent - highlightRetentionLegacyPercent), 1),
    moireInterferenceLegacyPercent: computeMoireInterferencePercent(config.screenAngleDeg, config.lpiFrequency, 0),
    moireInterferenceAtelierPercent: computeMoireInterferencePercent(config.screenAngleDeg, config.lpiFrequency, config.blueNoiseJitter),
    faceCenterSharpnessPercent: faceCells.length > 0 ? roundTo((faceCells.filter((c) => c.dispersionOffsetPx === 0).length / faceCells.length) * 100, 1) : 100,
    peripheryDispersionPx: roundTo(Math.max(0, ...cells.map((c) => c.dispersionOffsetPx)), 2),
    acutanceHaloOvershootLegacy: roundTo(stats.legacyHaloMax, 4),
    acutanceHaloOvershootAtelier: roundTo(stats.atelierHaloMax, 4),
    skinToneHueDriftDeg: stats.skinSampleCount > 0 ? roundTo(stats.skinDriftSum / stats.skinSampleCount, 2) : 0,
    paperRidgeGlowLiftPercent: roundTo(stats.ridgeLiftPercent, 1),
    lutVerticesCount: config.lutSize ** 3, nonDestructiveRestorable: true,
  };
}

/** 실시간 스플릿 커튼(0~100%) 비교 메트릭 산출기. */
export function computeSplitCurtainMetrics(splitCurtainPercent: number, comparison: LegacyVsAtelierComparison): SplitCurtainMetrics {
  const percent = Math.round(clamp(splitCurtainPercent, 0, 100));
  const legacyColumnCount = Math.round(FILTER_GRID_COLS * (percent / 100));
  const revealedAtelierAreaPercent = 100 - percent;
  return {
    percent, ratio: roundTo(percent / 100, 3), legacyColumnCount,
    atelierColumnCount: FILTER_GRID_COLS - legacyColumnCount, revealedAtelierAreaPercent,
    visibleHighlightDeltaPercent: roundTo(comparison.highlightEnergyGainPercent * (revealedAtelierAreaPercent / 100), 1),
    visibleMoireReductionPercent: roundTo(Math.max(0, comparison.moireInterferenceLegacyPercent - comparison.moireInterferenceAtelierPercent) * (revealedAtelierAreaPercent / 100), 1),
  };
}

/** AtelierFilter 6대 광학·웹툰 필터 파이프라인 결정론적 평가기. */
export function evaluateOpticalFilterPipeline(input?: AtelierFilterPipelineInput): AtelierOpticalFilterEvaluation {
  const config = normalizeAtelierFilterInput(input);
  const activePreset = getAtelierFilterPreset(config.presetId);
  const enabledStack = config.stack.filter((s) => s.enabled);
  const enabledWeight = new Map<AtelierFilterId, number>(enabledStack.map((s) => [s.id, clamp(s.intensity * config.intensity, 0, 1)]));
  const scene = buildSyntheticWebtoonScene();
  const baseLumas = scene.map((c) => clamp(lumaOf(c.hdrLinear), 0, 1));

  const gradeLutVertex = (vr: number, vg: number, vb: number): LinearRgb => {
    const ok = linearRgbToOklch({ r: vr, g: vg, b: vb });
    const skinMask = computeSkinToneProtectionMask(ok);
    const shifted = oklchToLinearRgb({
      l: clamp(ok.l * 0.98 + 0.015, 0, 1), c: clamp(ok.c * (1.06 - skinMask * 0.04), 0, 0.28),
      h: (ok.h + config.toneAngleDeg * (1 - skinMask * config.skinToneProtection) + 360) % 360,
    });
    return { r: applyFilmicToeShoulder(shifted.r, config.filmicShoulder), g: applyFilmicToeShoulder(shifted.g, config.filmicShoulder), b: applyFilmicToeShoulder(shifted.b, config.filmicShoulder) };
  };

  let legacyHighlightSum = 0; let atelierHighlightSum = 0; let sourceHighlightSum = 0;
  let legacyHaloMax = 0; let atelierHaloMax = 0; let skinDriftSum = 0; let skinSampleCount = 0;
  let ridgeGlowSum = 0; let valleyGlowSum = 0; let ridgeCount = 0; let valleyCount = 0;

  const cells: OpticalFilterCellSample[] = scene.map((seed, idx) => {
    const neighbors3x3: number[] = [];
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        neighbors3x3.push(baseLumas[clamp(seed.row + dr, 0, FILTER_GRID_ROWS - 1) * FILTER_GRID_COLS + clamp(seed.col + dc, 0, FILTER_GRID_COLS - 1)] ?? baseLumas[idx]);
      }
    }
    const coc = computeDepthCircleOfConfusion(seed.depth, config.focusDepth, config.apertureRadiusPx);
    const legMix = clamp((coc / 24) * config.intensity * 0.55, 0, 0.55);
    const q8 = (v: number): number => Math.round(linearToSrgb(clamp(v, 0, 1)) * 255) / 255;
    const legacyLin: LinearRgb = {
      r: srgbToLinear(q8(seed.hdrLinear.r) * (1 - legMix) + 0.14 * legMix),
      g: srgbToLinear(q8(seed.hdrLinear.g) * (1 - legMix) + 0.15 * legMix),
      b: srgbToLinear(q8(seed.hdrLinear.b) * (1 - legMix) + 0.17 * legMix),
    };

    let cur: LinearRgb = { r: linearToHalf16Quantize(seed.hdrLinear.r), g: linearToHalf16Quantize(seed.hdrLinear.g), b: linearToHalf16Quantize(seed.hdrLinear.b) };
    let dispersionOffsetPx = 0; let halftoneDotRadius = 0;
    const acutance = evaluateSobelEdgeAcutance(baseLumas[idx], neighbors3x3, config.acutanceAmount);
    legacyHaloMax = Math.max(legacyHaloMax, acutance.legacyHaloOvershoot);

    for (const stage of enabledStack) {
      const w = enabledWeight.get(stage.id) ?? 0;
      if (w <= 0) continue;
      if (stage.id === "optical-aperture-bokeh") {
        const ringGain = evaluatePolygonApertureMask(0.76, 0.24, config.apertureBlades, config.sphericalAberration);
        const mul = seed.isHighlight ? 1 + (coc / 24) * w * 0.18 * ringGain : 1 - (coc / 24) * w * 0.06;
        cur = { r: linearToHalf16Quantize(cur.r * mul), g: linearToHalf16Quantize(cur.g * mul), b: linearToHalf16Quantize(cur.b * mul) };
      } else if (stage.id === "paper-aware-halation-glow") {
        const haloW = evaluateDualGaussianHalation(seed.isHighlight ? 1.2 : 4.6, 2.2, 9.5, seed.paperHeight, config.paperReliefStrength);
        const glow = (Math.max(0, lumaOf(cur) - config.halationThreshold) + (seed.isHighlight ? 0.28 : 0.03)) * haloW * w * 0.34;
        if (seed.paperHeight >= 0.55) { ridgeGlowSum += glow; ridgeCount += 1; } else { valleyGlowSum += glow; valleyCount += 1; }
        cur = { r: linearToHalf16Quantize(cur.r + glow * 1.05), g: linearToHalf16Quantize(cur.g + glow * 0.72), b: linearToHalf16Quantize(cur.b + glow * 0.36) };
      } else if (stage.id === "moire-free-halftone-screentone") {
        halftoneDotRadius = evaluateHalftoneScreentoneSample(seed.u, seed.v, clamp(1 - lumaOf(cur), 0, 1), config.screenAngleDeg, config.lpiFrequency, config.blueNoiseJitter);
        const m = 1 - w * 0.14 * halftoneDotRadius;
        cur = { r: cur.r * m, g: cur.g * m, b: cur.b * m };
      } else if (stage.id === "chromatic-prism-dispersion") {
        const disp = evaluatePrismDispersionOffsets(seed.u, seed.v, config.iorSpread, config.centerSafeRadius, w);
        dispersionOffsetPx = disp.magnitudePx;
        const sf = clamp(disp.magnitudePx / 32, 0, 0.28);
        cur = { r: cur.r * (1 + sf * 0.45), g: cur.g, b: cur.b * (1 + sf * 0.32) };
      } else if (stage.id === "oklch-tetrahedral-lut-grade") {
        const beforeOk = linearRgbToOklch(cur);
        const graded = sampleTetrahedralLut3d({ r: applyFilmicToeShoulder(cur.r, config.filmicShoulder * 0.45), g: applyFilmicToeShoulder(cur.g, config.filmicShoulder * 0.45), b: applyFilmicToeShoulder(cur.b, config.filmicShoulder * 0.45) }, config.lutSize, gradeLutVertex);
        const skinLock = computeSkinToneProtectionMask(beforeOk) * config.skinToneProtection;
        const gradedOk = linearRgbToOklch(graded);
        const hueFix = (((beforeOk.h - gradedOk.h) + 540) % 360) - 180;
        const finalGraded = skinLock > 0 ? oklchToLinearRgb({ l: gradedOk.l, c: gradedOk.c, h: (gradedOk.h + hueFix * skinLock + 360) % 360 }) : graded;
        const hdr = Math.max(0, lumaOf(cur) - 1.0) * 0.55;
        cur = { r: cur.r * (1 - w) + (finalGraded.r + hdr * 0.9) * w, g: cur.g * (1 - w) + (finalGraded.g + hdr * 0.72) * w, b: cur.b * (1 - w) + (finalGraded.b + hdr * 0.4) * w };
        if (seed.isFaceZone) {
          skinDriftSum += Math.abs((((linearRgbToOklch(cur).h - beforeOk.h) + 540) % 360) - 180);
          skinSampleCount += 1;
        }
      } else if (stage.id === "ink-edge-acutance-unsharp") {
        atelierHaloMax = Math.max(atelierHaloMax, acutance.atelierHaloOvershoot);
        const curLuma = Math.max(1e-4, lumaOf(cur));
        const gain = clamp((curLuma * (1 - w) + acutance.atelierAcutance * w) / curLuma, 0.75, 1.35);
        const grain = sampleHanjiMicroGrain(seed.col, seed.row, config.hanjiGrainAmount) * w;
        const bleed = seed.isLineEdge ? 0.012 * w : 0;
        cur = { r: Math.max(0, cur.r * gain + grain + bleed), g: Math.max(0, cur.g * gain + grain), b: Math.max(0, cur.b * gain + grain + bleed * 0.5) };
      }
    }

    if (seed.isHighlight) {
      sourceHighlightSum += lumaOf(seed.hdrLinear); legacyHighlightSum += lumaOf(legacyLin);
      atelierHighlightSum += Math.min(lumaOf(seed.hdrLinear), lumaOf(cur));
    }
    const atelierMapped: LinearRgb = { r: applyFilmicToeShoulder(cur.r, 0.35), g: applyFilmicToeShoulder(cur.g, 0.35), b: applyFilmicToeShoulder(cur.b, 0.35) };
    return {
      col: seed.col, row: seed.row, u: roundTo(seed.u, 3), v: roundTo(seed.v, 3), depth: roundTo(seed.depth, 2),
      isFaceZone: seed.isFaceZone, isHighlight: seed.isHighlight, isLineEdge: seed.isLineEdge, paperHeight: seed.paperHeight,
      legacyLuma: roundTo(lumaOf(legacyLin), 3), atelierLuma: roundTo(lumaOf(cur), 3),
      legacyOklch: formatNonVioletOklch(linearRgbToOklch(legacyLin)), atelierOklch: formatNonVioletOklch(linearRgbToOklch(atelierMapped)),
      bokehCoc: coc, dispersionOffsetPx, sobelGradient: acutance.sobelGradient, halftoneDotRadius,
    };
  });

  const avgRidge = ridgeCount > 0 ? ridgeGlowSum / ridgeCount : 0;
  const avgValley = valleyCount > 0 ? valleyGlowSum / valleyCount : 0;
  const comparison = compareLegacyVsAtelierFilter(config, cells, {
    legacyHighlightSum, atelierHighlightSum, sourceHighlightSum, legacyHaloMax, atelierHaloMax,
    skinDriftSum, skinSampleCount, ridgeLiftPercent: avgValley > 1e-5 ? Math.max(0, ((avgRidge - avgValley) / avgValley) * 100) : 0,
  });

  return {
    brand: ATELIER_FILTER_BRAND, engineName: PRISM_LIGHT_ENGINE, inkPipelineName: ATELIER_INK_PIPELINE,
    schemaVersion: ATELIER_FILTER_SCHEMA_VERSION, config, activePreset, stack: config.stack,
    enabledFilterIds: enabledStack.map((s) => s.id), gridCols: FILTER_GRID_COLS, gridRows: FILTER_GRID_ROWS,
    cells, comparison, splitCurtain: computeSplitCurtainMetrics(config.splitCurtainPercent, comparison),
    wgslShader: buildAtelierFilterWgslShader(config),
    honestScopeKo: "결정론적 16-bit 선형광 CPU 광학 참조 격자(16×10) 실측과 WebGPU 디스패치용 WGSL 컴퓨트 셰이더 코드를 함께 생성합니다. 브라우저 GPU 프레임 실측 수치는 임의 추정하지 않습니다.",
    honestScopeEn: "Evaluates deterministic 16-bit linear-light CPU optical math on a 16×10 reference grid alongside dispatch-ready WGSL compute shaders, without fabricating live GPU FPS telemetry.",
  };
}

/** AtelierFilter 비파괴 필터 체인 · 광학 비교 · WGSL 계약을 JSON 문자열로 직렬화한다. */
export function exportAtelierFilterChainJson(evaluation: AtelierOpticalFilterEvaluation): string {
  const { config, wgslShader } = evaluation;
  return JSON.stringify({
    brand: evaluation.brand, engine: evaluation.engineName, inkPipeline: evaluation.inkPipelineName,
    schemaVersion: evaluation.schemaVersion, presetId: evaluation.activePreset.id,
    enabledFilterIds: evaluation.enabledFilterIds, stack: evaluation.stack,
    parameters: {
      intensity: config.intensity, apertureBlades: config.apertureBlades, sphericalAberration: config.sphericalAberration,
      focusDepth: config.focusDepth, paperReliefStrength: config.paperReliefStrength, screenAngleDeg: config.screenAngleDeg,
      blueNoiseJitter: config.blueNoiseJitter, iorSpread: config.iorSpread, centerSafeRadius: config.centerSafeRadius,
      lutSize: config.lutSize, toneAngleDeg: config.toneAngleDeg, skinToneProtection: config.skinToneProtection,
      acutanceAmount: config.acutanceAmount, hanjiGrainAmount: config.hanjiGrainAmount,
    },
    comparison: evaluation.comparison, splitCurtain: evaluation.splitCurtain,
    wgslContract: {
      entryPoint: wgslShader.entryPoint, workgroupSize: wgslShader.workgroupSize, bindingCount: wgslShader.bindingCount,
      uniformByteLength: wgslShader.uniformByteLength, storageFormat: wgslShader.storageFormat,
      stageBitmask: wgslShader.stageBitmask, activeStageCount: wgslShader.activeStageCount, lineCount: wgslShader.lineCount,
    },
  }, null, 2);
}
