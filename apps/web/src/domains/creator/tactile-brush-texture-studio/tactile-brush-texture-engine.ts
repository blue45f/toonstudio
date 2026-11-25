/**
 * Wave 49A — 극한 브러시 시각 질감 × 120Hz 고성능 엔진 (Ultra-Tactile High-FPS Brush Texture Engine).
 *
 * - 4종 절차적 종이 요철 64×64 무이음(Periodic) 하이트맵 + 미세 법선 LUT (한지·켄트지·수채 황목·리넨 캔버스)
 * - 5종 극한 질감 물리 레이어 조합기: 종이 요철 투과, 갈필 3~16가닥 분기, 모세관 습윤 에지(18~34%),
 *   45° 방향성 임파스토(Lambert + Blinn), 120Hz(8.33ms)/60Hz(16.67ms) 결정론적 비용 모델 성능 예산 가드
 * - 비파괴 미리보기·적용·원복 상태 머신 및 셰이더/브러시 레시피 JSON 내보내기
 * - 원시 hex/rgb/hsl 0건, 바이올렛 휴(270~320°) 0%, 스토리지·BigInt·private Map store 0건
 */

import { assertFiniteTactileLut, assertTactileLutShape, finiteTactileSample, matchingTactileStampOptions, normalizeTactileControls } from "./tactile-brush-input-contract";
import { serializeTactileBrushRecipe } from "./tactile-brush-recipe";

export const PAPER_GRAIN_TILE_SIZE = 64 as const;
export const DIRTY_RECT_TILE_PX = 256 as const;
export const FRAME_BUDGET_120HZ_MS = 8.33 as const;
export const FRAME_BUDGET_60HZ_MS = 16.67 as const;
export const VIOLET_SLOP_MIN_HUE = 270 as const;
export const VIOLET_SLOP_MAX_HUE = 320 as const;
export const MIN_BRISTLE_FILAMENTS = 3 as const;
export const MAX_BRISTLE_FILAMENTS = 16 as const;
export const WET_EDGE_MIN_PCT = 18 as const;
export const WET_EDGE_MAX_PCT = 34 as const;
export const IMPASTO_LIGHT_ELEVATION_DEG = 45 as const;
export const IMPASTO_LIGHT_AZIMUTH_DEG = -45 as const;

export type PaperGrainId = "hanji" | "kent" | "cold-press" | "linen-canvas";
export type TactileBrushPresetId = "gpen-ink" | "dry-sumi" | "wet-watercolor" | "impasto-oil" | "charcoal-tooth";
export type TargetRefreshHz = 120 | 60;
export type TactileLodTier = 0 | 1 | 2 | 3;
export type TactileSessionStatus = "clean" | "previewing" | "applied" | "reverted";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export interface PaperGrainSample { readonly height: number; readonly nx: number; readonly ny: number; readonly nz: number; }
export interface PaperCrossSectionPoint { readonly u: number; readonly height: number; readonly nx: number; readonly ny: number; }
export interface TactileTextureControls {
  readonly paperToothStrength: number; readonly dryBristleSplit: number;
  readonly wetEdgePooling: number; readonly impastoRelief: number;
}
export interface PaperGrainPreset {
  readonly id: PaperGrainId; readonly nameKo: string; readonly nameEn: string;
  readonly grainTagKo: string; readonly grainTagEn: string;
  readonly descriptionKo: string; readonly descriptionEn: string;
  readonly absorbency: number; readonly normalReliefGain: number;
  readonly surfaceOklch: OklchColor; readonly shadowOklch: OklchColor;
}
export interface PaperGrainTileLut {
  readonly paperId: PaperGrainId; readonly size: typeof PAPER_GRAIN_TILE_SIZE;
  readonly height: Float32Array; readonly normalX: Float32Array; readonly normalY: Float32Array;
  readonly peakMean: number; readonly peakStdDev: number; readonly valleyRatio: number;
  readonly anisotropyRatio: number; readonly memoryBytes: number;
}
export interface TactileBrushPreset {
  readonly id: TactileBrushPresetId; readonly nameKo: string; readonly nameEn: string;
  readonly categoryKo: string; readonly categoryEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly recommendedPaperId: PaperGrainId;
  readonly pigmentNameKo: string; readonly pigmentNameEn: string; readonly pigmentOklch: OklchColor;
  readonly baseRadiusPx: number; readonly baseSpacingRatio: number;
  readonly drynessBase: number; readonly paintThicknessMm: number; readonly glossiness: number;
  readonly baseFilamentCount: number; readonly capillarySpread: number;
  readonly defaultPressure: number; readonly defaultVelocityPxPerSec: number;
  readonly defaultTiltDeg: number; readonly defaultAngleDeg: number;
  readonly defaultControls: TactileTextureControls;
}
export interface PaperToothMetrics {
  readonly contactThreshold: number; readonly peakCoverageRatio: number;
  readonly valleyPenetrationRatio: number; readonly grainContrast: number; readonly effectiveOpacity: number;
}
export interface BristleFilamentSubStamp {
  readonly index: number; readonly lateralOffsetNorm: number; readonly widthWeight: number;
  readonly opacityWeight: number; readonly gapPhase: number; readonly tipTaper: number;
}
export interface SplitBristleMetrics {
  readonly drynessFactor: number; readonly rawFilamentCount: number; readonly activeFilamentCount: number;
  readonly splaySpreadRatio: number; readonly filaments: readonly BristleFilamentSubStamp[];
}
export interface WetEdgeMetrics {
  readonly enabled: boolean; readonly ringConcentrationPct: number; readonly ringWidthPx: number;
  readonly centerBackrunLightening: number; readonly effectiveRimDarkening: number; readonly absorbencyFactor: number;
}
export interface ImpastoLightingMetrics {
  readonly lightElevationDeg: typeof IMPASTO_LIGHT_ELEVATION_DEG; readonly lightAzimuthDeg: typeof IMPASTO_LIGHT_AZIMUTH_DEG;
  readonly ridgeThicknessMm: number; readonly lambertLitDot: number; readonly lambertShadowDot: number;
  readonly blinnSpecular: number; readonly reliefDepthContrast: number;
  readonly highlightOffsetPx: { readonly x: number; readonly y: number };
}
export interface FrameBudgetStageBreakdownMs {
  readonly lutLookupMs: number; readonly bristleCompositeMs: number; readonly wetEdgeShaderMs: number;
  readonly impastoNormalMs: number; readonly dirtyTileFlushMs: number;
}
export interface FrameBudgetEvaluationInput {
  readonly targetRefreshHz: TargetRefreshHz; readonly guardEnabled: boolean;
  readonly velocityPxPerSec: number; readonly radiusPx: number; readonly baseSpacingRatio: number;
  readonly rawFilamentCount: number; readonly controls: TactileTextureControls; readonly tiltDeg?: number;
}
export interface FrameBudgetPlan {
  readonly targetRefreshHz: TargetRefreshHz; readonly budgetMs: number; readonly guardEnabled: boolean;
  readonly lodTier: TactileLodTier; readonly lodLabelKo: string; readonly lodLabelEn: string;
  readonly tileSizePx: typeof DIRTY_RECT_TILE_PX; readonly dirtyTileCount: number;
  readonly atlasCacheHitRate: number; readonly adaptiveSpacingRatio: number;
  readonly stampsPerFrame: number; readonly filamentSubStampsPerStamp: number;
  readonly stageBreakdownMs: FrameBudgetStageBreakdownMs; readonly estimatedFrameMs: number;
  readonly utilizationPct: number; readonly withinBudget: boolean; readonly headroomMs: number;
  readonly costModelSource: "deterministic-analytical-model";
  readonly modelNoteKo: string; readonly modelNoteEn: string;
}
export interface TactileStampEvaluationInput {
  readonly brushId: TactileBrushPresetId; readonly paperId: PaperGrainId;
  readonly controls?: Partial<TactileTextureControls>; readonly pressure?: number;
  readonly velocityPxPerSec?: number; readonly tiltDeg?: number; readonly strokeAngleDeg?: number;
  readonly inkLoad?: number; readonly radiusPx?: number; readonly targetRefreshHz?: TargetRefreshHz;
  readonly performanceGuardEnabled?: boolean; readonly lut?: PaperGrainTileLut;
}
export interface TactileStampMetrics {
  readonly brushId: TactileBrushPresetId; readonly paperId: PaperGrainId;
  readonly controls: TactileTextureControls; readonly pressure: number;
  readonly velocityPxPerSec: number; readonly tiltDeg: number; readonly strokeAngleDeg: number;
  readonly inkLoad: number; readonly radiusPx: number;
  readonly paperTooth: PaperToothMetrics; readonly splitBristle: SplitBristleMetrics;
  readonly wetEdge: WetEdgeMetrics; readonly impasto: ImpastoLightingMetrics;
  readonly frameBudget: FrameBudgetPlan;
  readonly flatBaselineRichness: number; readonly tactileRichnessScore: number;
}
export interface TactileBrushConfig {
  readonly brushId: TactileBrushPresetId; readonly paperId: PaperGrainId;
  readonly controls: TactileTextureControls; readonly targetRefreshHz: TargetRefreshHz;
  readonly performanceGuardEnabled: boolean; readonly pressure: number;
  readonly velocityPxPerSec: number; readonly tiltDeg: number; readonly strokeAngleDeg: number;
}
export interface TactileBrushConfigPatch {
  readonly brushId?: TactileBrushPresetId; readonly paperId?: PaperGrainId;
  readonly controls?: Partial<TactileTextureControls>; readonly targetRefreshHz?: TargetRefreshHz;
  readonly performanceGuardEnabled?: boolean; readonly pressure?: number;
  readonly velocityPxPerSec?: number; readonly tiltDeg?: number; readonly strokeAngleDeg?: number;
}
export interface TactileBrushSession {
  readonly committed: TactileBrushConfig; readonly preview: TactileBrushConfig | null;
  readonly history: readonly TactileBrushConfig[]; readonly status: TactileSessionStatus;
  readonly appliedCount: number; readonly canApply: boolean; readonly canRevert: boolean;
}

function clamp(v: number, min: number, max: number): number { return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min; }
function roundTo(v: number, digits: number): number { const f = 10 ** digits; return Math.round(v * f) / f; }
function normalizeHue(hue: number): number { const mod = Number.isFinite(hue) ? hue % 360 : 0; return mod < 0 ? mod + 360 : mod; }

/** 270~320° 보라·바이올렛 슬롭 구간 여부를 판정한다. */
export function isVioletSlopHue(hue: number): boolean {
  const h = normalizeHue(hue);
  return h >= VIOLET_SLOP_MIN_HUE && h <= VIOLET_SLOP_MAX_HUE;
}

/** 바이올렛 구간(270~320°)이 입력되면 안전 안료 휴(246° 코발트 슬레이트 / 342° 카민)로 치환한다. */
export function sanitizeNonVioletHue(hue: number): number {
  const h = normalizeHue(hue);
  return !isVioletSlopHue(h) ? roundTo(h, 1) : h < 295 ? 246 : 342;
}

/** OKLCH 색상을 CSS `oklch(...)` 문자열로 직렬화한다(바이올렛 휴 자동 차단). */
export function formatOklch(color: OklchColor, alpha?: number): string {
  const l = roundTo(clamp(color.l, 0, 1), 3);
  const c = roundTo(clamp(color.c, 0, 0.37), 3);
  const h = sanitizeNonVioletHue(color.h);
  return alpha !== undefined ? `oklch(${l} ${c} ${h} / ${roundTo(clamp(alpha, 0, 1), 3)})` : `oklch(${l} ${c} ${h})`;
}

export const PAPER_GRAIN_PRESETS: readonly PaperGrainPreset[] = [
  {
    id: "hanji", nameKo: "한지 장섬유", nameEn: "Hanji Mulberry",
    grainTagKo: "장섬유 결 · 고흡수", grainTagEn: "Long Fiber · High Absorb",
    descriptionKo: "닥나무 장섬유가 가로·사선으로 얽혀 먹 갈필과 모세관 번짐이 또렷하게 드러납니다.",
    descriptionEn: "Long directional mulberry fibers highlight dry sumi split strokes and capillary bleed.",
    absorbency: 0.9, normalReliefGain: 3.1,
    surfaceOklch: { l: 0.94, c: 0.018, h: 88 }, shadowOklch: { l: 0.81, c: 0.028, h: 80 },
  },
  {
    id: "kent", nameKo: "켄트지 미세 세목", nameEn: "Kent Smooth Fine",
    grainTagKo: "초미세 세목 · 펜선 특화", grainTagEn: "Fine Tooth · Crisp Ink",
    descriptionKo: "균일하고 촘촘한 세목 표면으로 G펜 잉크와 정밀 해칭에서 날카로운 엣지를 유지합니다.",
    descriptionEn: "Tight isotropic micro-tooth keeps G-pen ink crisp with minimal valley dropout.",
    absorbency: 0.32, normalReliefGain: 1.45,
    surfaceOklch: { l: 0.96, c: 0.008, h: 96 }, shadowOklch: { l: 0.87, c: 0.014, h: 94 },
  },
  {
    id: "cold-press", nameKo: "수채 황목 깊은 골", nameEn: "Cold-Press Rough",
    grainTagKo: "깊은 요철 골 · 안료 고임", grainTagEn: "Deep Valleys · Pooling",
    descriptionKo: "봉우리와 깊은 골이 뚜렷해 약한 필압에서는 스침 질감이, 수채에서는 가장자리 고임이 살아납니다.",
    descriptionEn: "Pronounced pillows and deep valleys drive tooth skimming and watercolor edge pooling.",
    absorbency: 0.86, normalReliefGain: 4.2,
    surfaceOklch: { l: 0.95, c: 0.016, h: 84 }, shadowOklch: { l: 0.78, c: 0.026, h: 76 },
  },
  {
    id: "linen-canvas", nameKo: "유화 리넨 직조", nameEn: "Linen Canvas Weave",
    grainTagKo: "날실·씨실 직조 · 임파스토", grainTagEn: "Warp-Weft Weave · Impasto",
    descriptionKo: "교차 직조된 날실과 씨실 능선이 유화 물감의 두터운 임파스토 릴리프를 단단하게 받쳐 줍니다.",
    descriptionEn: "Interlaced warp and weft ridges anchor thick impasto oil paint and directional highlights.",
    absorbency: 0.44, normalReliefGain: 4.6,
    surfaceOklch: { l: 0.91, c: 0.024, h: 78 }, shadowOklch: { l: 0.74, c: 0.032, h: 70 },
  },
] as const;

export const TACTILE_BRUSH_PRESETS: readonly TactileBrushPreset[] = [
  {
    id: "gpen-ink", nameKo: "G펜 만화 잉크", nameEn: "G-Pen Manga Ink",
    categoryKo: "펜선 · 세밀 잉크", categoryEn: "Lineart · Nib Ink",
    summaryKo: "미세 종이 저항만 살리고 선명한 강약과 깔끔한 잉크 밀착을 유지하는 만화 원고용 G펜.",
    summaryEn: "Crisp comic nib with subtle micro-tooth friction and high pigment cohesion.",
    recommendedPaperId: "kent", pigmentNameKo: "먹흑 인디고", pigmentNameEn: "Carbon Ink",
    pigmentOklch: { l: 0.21, c: 0.026, h: 245 },
    baseRadiusPx: 9, baseSpacingRatio: 0.09, drynessBase: 0.14, paintThicknessMm: 0.28, glossiness: 0.28,
    baseFilamentCount: 3, capillarySpread: 0.24, defaultPressure: 0.74, defaultVelocityPxPerSec: 520,
    defaultTiltDeg: 14, defaultAngleDeg: 18,
    defaultControls: { paperToothStrength: 0.28, dryBristleSplit: 0.12, wetEdgePooling: 0.14, impastoRelief: 0.1 },
  },
  {
    id: "dry-sumi", nameKo: "갈필 먹붓", nameEn: "Dry Sumi Bristle",
    categoryKo: "동양화 · 갈필 브리슬", categoryEn: "Ink Wash · Split Bristle",
    summaryKo: "획 속도와 붓 기울기에 따라 최대 16가닥으로 갈라지며 한지 봉우리를 거칠게 스치는 먹붓.",
    summaryEn: "Splits into up to 16 tapered filaments across mulberry fibers as velocity rises.",
    recommendedPaperId: "hanji", pigmentNameKo: "송연 묵색", pigmentNameEn: "Pine Soot Sumi",
    pigmentOklch: { l: 0.24, c: 0.018, h: 230 },
    baseRadiusPx: 26, baseSpacingRatio: 0.13, drynessBase: 0.68, paintThicknessMm: 0.36, glossiness: 0.18,
    baseFilamentCount: 13, capillarySpread: 0.56, defaultPressure: 0.46, defaultVelocityPxPerSec: 940,
    defaultTiltDeg: 38, defaultAngleDeg: 26,
    defaultControls: { paperToothStrength: 0.84, dryBristleSplit: 0.9, wetEdgePooling: 0.48, impastoRelief: 0.18 },
  },
  {
    id: "wet-watercolor", nameKo: "습윤 수채 둥근붓", nameEn: "Wet Watercolor Round",
    categoryKo: "수채 · 모세관 에지", categoryEn: "Watercolor · Wet Edge",
    summaryKo: "종이 골짜기 안료 침강과 가장자리 18~34% 모세관 농축 링을 자연스럽게 재현하는 수채붓.",
    summaryEn: "Models valley pigment granulation and 18-34% capillary wet-edge pooling.",
    recommendedPaperId: "cold-press", pigmentNameKo: "프러시안 청록", pigmentNameEn: "Prussian Teal",
    pigmentOklch: { l: 0.48, c: 0.125, h: 222 },
    baseRadiusPx: 32, baseSpacingRatio: 0.15, drynessBase: 0.22, paintThicknessMm: 0.16, glossiness: 0.22,
    baseFilamentCount: 6, capillarySpread: 0.92, defaultPressure: 0.58, defaultVelocityPxPerSec: 460,
    defaultTiltDeg: 22, defaultAngleDeg: 14,
    defaultControls: { paperToothStrength: 0.68, dryBristleSplit: 0.24, wetEdgePooling: 0.92, impastoRelief: 0.08 },
  },
  {
    id: "impasto-oil", nameKo: "두터운 임파스토 유화붓", nameEn: "Thick Impasto Oil",
    categoryKo: "유화 · 45° 입체 릴리프", categoryEn: "Oil · 45° Relief",
    summaryKo: "붓 진행 방향 능선과 45° 아틀리에 조명 하이라이트로 물감 두께감을 입체적으로 살린 유화붓.",
    summaryEn: "Sculpts directional oil ridges lit by a 45° atelier Lambert + Blinn light model.",
    recommendedPaperId: "linen-canvas", pigmentNameKo: "버밀리온 테라코타", pigmentNameEn: "Vermilion Ochre",
    pigmentOklch: { l: 0.54, c: 0.158, h: 36 },
    baseRadiusPx: 28, baseSpacingRatio: 0.12, drynessBase: 0.36, paintThicknessMm: 2.15, glossiness: 0.82,
    baseFilamentCount: 11, capillarySpread: 0.16, defaultPressure: 0.78, defaultVelocityPxPerSec: 580,
    defaultTiltDeg: 30, defaultAngleDeg: 32,
    defaultControls: { paperToothStrength: 0.56, dryBristleSplit: 0.62, wetEdgePooling: 0.14, impastoRelief: 0.94 },
  },
  {
    id: "charcoal-tooth", nameKo: "목탄 · 4B 연필", nameEn: "Charcoal & 4B Pencil",
    categoryKo: "소묘 · 요철 스침", categoryEn: "Sketch · Tooth Skim",
    summaryKo: "약한 필압에서는 종이 봉우리만 거칠게 긁고, 강한 필압에서 깊은 골까지 밀도 있게 채우는 소묘 도구.",
    summaryEn: "Skims raised grain peaks at light pressure and saturates deep valleys under heavy pressure.",
    recommendedPaperId: "cold-press", pigmentNameKo: "흑연 그라파이트", pigmentNameEn: "Warm Graphite",
    pigmentOklch: { l: 0.31, c: 0.014, h: 240 },
    baseRadiusPx: 18, baseSpacingRatio: 0.11, drynessBase: 0.78, paintThicknessMm: 0.42, glossiness: 0.12,
    baseFilamentCount: 9, capillarySpread: 0.1, defaultPressure: 0.38, defaultVelocityPxPerSec: 700,
    defaultTiltDeg: 52, defaultAngleDeg: 24,
    defaultControls: { paperToothStrength: 0.96, dryBristleSplit: 0.58, wetEdgePooling: 0.0, impastoRelief: 0.24 },
  },
] as const;

export function getPaperGrainPreset(paperId: PaperGrainId): PaperGrainPreset {
  return PAPER_GRAIN_PRESETS.find((item) => item.id === paperId) ?? PAPER_GRAIN_PRESETS[0];
}

export function getTactileBrushPreset(brushId: TactileBrushPresetId): TactileBrushPreset {
  return TACTILE_BRUSH_PRESETS.find((item) => item.id === brushId) ?? TACTILE_BRUSH_PRESETS[0];
}

function hashPeriodicCell(ix: number, iy: number, period: number, seed: number): number {
  const wx = ((ix % period) + period) % period;
  const wy = ((iy % period) + period) % period;
  let h = Math.imul(wx + 37, 374761393) + Math.imul(wy + 17, 668265263) + Math.imul(seed + 11, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

function smoothstep(t: number): number { return t * t * (3 - 2 * t); }

/** 주기적(Periodic) 64×64 격자 보간 노이즈: 타일 경계 이음새가 0인 결정론적 텍스처 기본파. */
function samplePeriodicValueNoise(x: number, y: number, freq: number, seed: number): number {
  const fx = (x / PAPER_GRAIN_TILE_SIZE) * freq;
  const fy = (y / PAPER_GRAIN_TILE_SIZE) * freq;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = smoothstep(fx - x0);
  const ty = smoothstep(fy - y0);
  const v00 = hashPeriodicCell(x0, y0, freq, seed);
  const v10 = hashPeriodicCell(x0 + 1, y0, freq, seed);
  const v01 = hashPeriodicCell(x0, y0 + 1, freq, seed);
  const v11 = hashPeriodicCell(x0 + 1, y0 + 1, freq, seed);
  return v00 + (v10 - v00) * tx + (v01 + (v11 - v01) * tx - (v00 + (v10 - v00) * tx)) * ty;
}

function evaluatePaperHeightTexel(paperId: PaperGrainId, x: number, y: number): number {
  const tau = Math.PI * 2;
  const u = (tau * x) / PAPER_GRAIN_TILE_SIZE;
  const v = (tau * y) / PAPER_GRAIN_TILE_SIZE;

  if (paperId === "hanji") {
    const longFiberA = 0.5 + 0.5 * Math.sin(u + 11 * v + 0.7 * Math.sin(2 * u));
    const longFiberB = 0.5 + 0.5 * Math.cos(2 * u - 15 * v + 0.55 * Math.cos(3 * u + v));
    const pulpBase = samplePeriodicValueNoise(x, y, 8, 101);
    const fineFlecks = samplePeriodicValueNoise(x, y, 32, 109);
    const fiberRidge = Math.pow(longFiberA * 0.58 + longFiberB * 0.42, 1.35);
    return clamp(0.18 + pulpBase * 0.34 + fiberRidge * 0.36 + fineFlecks * 0.14, 0.04, 0.98);
  }
  if (paperId === "kent") {
    const microA = samplePeriodicValueNoise(x, y, 16, 203);
    const microB = samplePeriodicValueNoise(x, y, 32, 211);
    const fineRipple = 0.5 + 0.5 * Math.sin(8 * u + 8 * v) * Math.cos(8 * u - 8 * v);
    return clamp(0.42 + microA * 0.19 + microB * 0.15 + fineRipple * 0.08, 0.34, 0.88);
  }
  if (paperId === "cold-press") {
    const raw =
      samplePeriodicValueNoise(x, y, 4, 307) * 0.46 +
      samplePeriodicValueNoise(x, y, 8, 313) * 0.38 +
      samplePeriodicValueNoise(x, y, 16, 317) * 0.16;
    return clamp(0.5 + (raw - 0.5) * 1.95, 0.03, 0.99);
  }
  // linen-canvas: 직교 날실(warp) + 씨실(weft) 평직 교차 능선
  const warp = 0.5 + 0.5 * Math.cos(8 * u);
  const weft = 0.5 + 0.5 * Math.cos(8 * v);
  const overUnder = 0.5 + 0.5 * Math.sin(4 * u) * Math.sin(4 * v);
  const yarnTwist = samplePeriodicValueNoise(x, y, 32, 409);
  const threadCrown = Math.max(warp * (0.68 + overUnder * 0.32), weft * (1.0 - overUnder * 0.32));
  return clamp(0.1 + threadCrown * 0.58 + warp * weft * 0.2 + yarnTwist * 0.12, 0.05, 0.98);
}

/** 4종 절차적 종이 요철 64×64 하이트맵 + 미세 법선(nx, ny) 타일 LUT를 결정론적으로 생성한다. */
export function generatePaperGrainTileLut(paperId: PaperGrainId): PaperGrainTileLut {
  const size = PAPER_GRAIN_TILE_SIZE;
  const total = size * size;
  const gain = getPaperGrainPreset(paperId).normalReliefGain;
  const height = new Float32Array(total);
  const normalX = new Float32Array(total);
  const normalY = new Float32Array(total);

  let sum = 0;
  let valleyCount = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const h = evaluatePaperHeightTexel(paperId, x, y);
      height[y * size + x] = h;
      sum += h;
      if (h < 0.35) valleyCount += 1;
    }
  }
  const peakMean = sum / total;
  let varianceAcc = 0;
  let gradXEnergy = 0;
  let gradYEnergy = 0;

  for (let y = 0; y < size; y += 1) {
    const ym = (y + size - 1) & 63;
    const yp = (y + 1) & 63;
    for (let x = 0; x < size; x += 1) {
      const idx = y * size + x;
      const diff = (height[idx] ?? 0) - peakMean;
      varianceAcc += diff * diff;
      const dx = ((height[y * size + ((x + 1) & 63)] ?? 0) - (height[y * size + ((x + size - 1) & 63)] ?? 0)) * 0.5;
      const dy = ((height[yp * size + x] ?? 0) - (height[ym * size + x] ?? 0)) * 0.5;
      gradXEnergy += dx * dx;
      gradYEnergy += dy * dy;
      const invLen = 1 / Math.hypot(-dx * gain, -dy * gain, 1);
      normalX[idx] = -dx * gain * invLen;
      normalY[idx] = -dy * gain * invLen;
    }
  }
  return {
    paperId, size, height, normalX, normalY,
    peakMean: roundTo(peakMean, 4), peakStdDev: roundTo(Math.sqrt(varianceAcc / total), 4),
    valleyRatio: roundTo(valleyCount / total, 4),
    anisotropyRatio: roundTo(Math.sqrt(Math.max(gradXEnergy, gradYEnergy) / Math.max(1e-6, Math.min(gradXEnergy, gradYEnergy))), 3),
    memoryBytes: total * Float32Array.BYTES_PER_ELEMENT * 3,
  };
}

/** 64×64 타일 LUT에서 임의의 캔버스 좌표(음수 포함)를 O(1) 비트마스크 래핑으로 조회한다. */
export function samplePaperGrainLut(lut: PaperGrainTileLut, xPx: number, yPx: number, scale = 1): PaperGrainSample {
  assertTactileLutShape(lut);
  const s = clamp(scale, 0.25, 8);
  const idx = ((((Math.floor(yPx / s) & 63) + 64) & 63) * lut.size) + (((Math.floor(xPx / s) & 63) + 64) & 63);
  const nx = finiteTactileSample(lut.normalX[idx], 0);
  const ny = finiteTactileSample(lut.normalY[idx], 0);
  return { height: finiteTactileSample(lut.height[idx], 0.5), nx, ny, nz: Math.sqrt(Math.max(0.0001, 1 - nx * nx - ny * ny)) };
}

/** 종이 요철 단면 시각화를 위해 지정 행의 높이·법선 프로파일을 샘플링한다. */
export function samplePaperCrossSection(lut: PaperGrainTileLut, rowY = 24, sampleCount = 32): readonly PaperCrossSectionPoint[] {
  assertTactileLutShape(lut);
  const count = Math.round(clamp(Number.isFinite(sampleCount) ? sampleCount : 32, 8, 64));
  const yi = ((Math.floor(rowY) & 63) + 64) & 63;
  const points: PaperCrossSectionPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    const u = i / (count - 1);
    const idx = yi * lut.size + Math.floor(u * (lut.size - 1));
    points.push({ u: roundTo(u, 4), height: roundTo(finiteTactileSample(lut.height[idx], 0.5), 4), nx: roundTo(finiteTactileSample(lut.normalX[idx], 0), 4), ny: roundTo(finiteTactileSample(lut.normalY[idx], 0), 4) });
  }
  return points;
}

function getLodLabels(tier: TactileLodTier): { readonly ko: string; readonly en: string } {
  if (tier === 0) return { ko: "LOD 0 · 초정밀 전체 가닥", en: "LOD 0 · Full Fidelity" };
  if (tier === 1) return { ko: "LOD 1 · 고속 균형", en: "LOD 1 · Balanced Fast" };
  if (tier === 2) return { ko: "LOD 2 · 쾌속 스윕 압축", en: "LOD 2 · Fast Sweep" };
  return { ko: "LOD 3 · 초고속 플릭 가드", en: "LOD 3 · Flick Guard" };
}

function computeBudgetCosts(params: {
  readonly stampsPerFrame: number; readonly filamentSubStamps: number; readonly dirtyTileCount: number;
  readonly atlasCacheHitRate: number; readonly controls: TactileTextureControls; readonly guardEnabled: boolean;
}): FrameBudgetStageBreakdownMs {
  const missPenalty = 1 + (1 - params.atlasCacheHitRate) * (params.guardEnabled ? 1.15 : 2.35);
  return {
    lutLookupMs: roundTo(0.14 + params.stampsPerFrame * 0.022 * (0.7 + params.controls.paperToothStrength * 0.55) * missPenalty, 2),
    bristleCompositeMs: roundTo(0.26 + params.stampsPerFrame * params.filamentSubStamps * 0.0175 * missPenalty, 2),
    wetEdgeShaderMs: roundTo(
      params.controls.wetEdgePooling > 0.02
        ? 0.2 + params.dirtyTileCount * 0.24 * (0.45 + params.controls.wetEdgePooling * 0.65) * (params.guardEnabled ? 1 : 1.3)
        : 0.05,
      2,
    ),
    impastoNormalMs: roundTo(
      params.controls.impastoRelief > 0.02
        ? 0.2 + params.dirtyTileCount * 0.25 * (0.4 + params.controls.impastoRelief * 0.68) * (params.guardEnabled ? 1 : 1.32)
        : 0.05,
      2,
    ),
    dirtyTileFlushMs: roundTo(0.34 + params.dirtyTileCount * (params.guardEnabled ? 0.36 : 0.56), 2),
  };
}

/** 120Hz(8.33ms)/60Hz(16.67ms) 프레임 예산 계획기(Dirty-Rect·아틀라스 캐시·LOD 결정론적 비용 모델). */
export function evaluateFrameBudgetPlan(input: FrameBudgetEvaluationInput): FrameBudgetPlan {
  const targetRefreshHz = input.targetRefreshHz === 60 ? 60 : 120;
  const controls = normalizeTactileControls(input.controls);
  const budgetMs = targetRefreshHz === 120 ? FRAME_BUDGET_120HZ_MS : FRAME_BUDGET_60HZ_MS;
  const velocity = clamp(input.velocityPxPerSec, 0, 3600);
  const diameterPx = clamp(input.radiusPx, 2, 120) * 2;
  const tiltDeg = clamp(input.tiltDeg ?? 20, 0, 75);
  const rawFilaments = Math.round(clamp(input.rawFilamentCount, MIN_BRISTLE_FILAMENTS, MAX_BRISTLE_FILAMENTS));
  const frameTravelPx = velocity / targetRefreshHz;

  let lodTier: TactileLodTier = 0;
  if (input.guardEnabled) {
    if (velocity >= 1950) lodTier = 3;
    else if (velocity >= 1200) lodTier = 2;
    else if (velocity >= 560) lodTier = 1;
  }

  const lodSpacingMult = [1.0, 1.3, 1.72, 2.25] as const;
  const lodFilamentCap = [16, 11, 7, 4] as const;

  const computeForTier = (tier: TactileLodTier) => {
    const adaptiveSpacingRatio = roundTo(clamp(input.baseSpacingRatio * (input.guardEnabled ? lodSpacingMult[tier] : 0.88), 0.06, 0.44), 3);
    const stampsPerFrame = Math.max(1, Math.min(48, Math.ceil(frameTravelPx / Math.max(1.2, diameterPx * adaptiveSpacingRatio)) + 1));
    const filamentSubStamps = input.guardEnabled
      ? Math.max(MIN_BRISTLE_FILAMENTS, Math.min(rawFilaments, lodFilamentCap[tier]))
      : rawFilaments;
    const tilesX = Math.max(1, Math.ceil((frameTravelPx + diameterPx * 1.15) / DIRTY_RECT_TILE_PX) + (frameTravelPx > 14 ? 1 : 0));
    const tilesY = Math.max(1, Math.ceil((diameterPx * (1.1 + (tiltDeg / 75) * 0.45)) / DIRTY_RECT_TILE_PX) + (diameterPx > 56 ? 1 : 0));
    const dirtyTileCount = input.guardEnabled ? Math.min(6, tilesX * tilesY) : Math.min(10, tilesX * tilesY + (velocity > 1100 ? 2 : 1));
    const atlasCacheHitRate = roundTo(
      input.guardEnabled
        ? clamp(0.95 - (tiltDeg / 75) * 0.05 - tier * 0.015, 0.84, 0.97)
        : clamp(0.68 - (velocity / 3600) * 0.16 - (tiltDeg / 75) * 0.08, 0.46, 0.72),
      3,
    );
    const stageBreakdownMs = computeBudgetCosts({
      stampsPerFrame, filamentSubStamps, dirtyTileCount, atlasCacheHitRate,
      controls, guardEnabled: input.guardEnabled,
    });
    const estimatedFrameMs = roundTo(
      stageBreakdownMs.lutLookupMs + stageBreakdownMs.bristleCompositeMs +
        stageBreakdownMs.wetEdgeShaderMs + stageBreakdownMs.impastoNormalMs + stageBreakdownMs.dirtyTileFlushMs,
      2,
    );
    return { adaptiveSpacingRatio, stampsPerFrame, filamentSubStamps, dirtyTileCount, atlasCacheHitRate, stageBreakdownMs, estimatedFrameMs };
  };

  let evaluated = computeForTier(lodTier);
  while (input.guardEnabled && evaluated.estimatedFrameMs > budgetMs * 0.94 && lodTier < 3) {
    lodTier = (lodTier + 1) as TactileLodTier;
    evaluated = computeForTier(lodTier);
  }
  const labels = getLodLabels(lodTier);
  return {
    targetRefreshHz, budgetMs, guardEnabled: input.guardEnabled, lodTier,
    lodLabelKo: labels.ko, lodLabelEn: labels.en, tileSizePx: DIRTY_RECT_TILE_PX,
    dirtyTileCount: evaluated.dirtyTileCount, atlasCacheHitRate: evaluated.atlasCacheHitRate,
    adaptiveSpacingRatio: evaluated.adaptiveSpacingRatio, stampsPerFrame: evaluated.stampsPerFrame,
    filamentSubStampsPerStamp: evaluated.filamentSubStamps, stageBreakdownMs: evaluated.stageBreakdownMs,
    estimatedFrameMs: evaluated.estimatedFrameMs, utilizationPct: roundTo((evaluated.estimatedFrameMs / budgetMs) * 100, 1),
    withinBudget: evaluated.estimatedFrameMs <= budgetMs, headroomMs: roundTo(budgetMs - evaluated.estimatedFrameMs, 2),
    costModelSource: "deterministic-analytical-model",
    modelNoteKo: "결정론적 비용 모델 산출값(256px Dirty-Rect·아틀라스 캐시·LOD 수식 기반, 실측 GPU 벤치마크 아님)",
    modelNoteEn: "Deterministic analytical cost model estimate (256px Dirty-Rect + Atlas Cache + LOD; not a live GPU benchmark)",
  };
}

function buildBristleFilaments(
  count: number, drynessFactor: number, splaySpreadRatio: number, seedBias: number,
): readonly BristleFilamentSubStamp[] {
  const filaments: BristleFilamentSubStamp[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1;
    const harmonic = Math.sin((i + 1) * 2.39996 + seedBias);
    filaments.push({
      index: i,
      lateralOffsetNorm: roundTo(clamp(t * (0.72 + splaySpreadRatio * 0.28) + harmonic * 0.08 * splaySpreadRatio, -1, 1), 3),
      widthWeight: roundTo(clamp((0.46 + (1 - drynessFactor) * 0.44) * (1 - Math.abs(t) * 0.36), 0.18, 1), 3),
      opacityWeight: roundTo(clamp((0.94 - drynessFactor * 0.48) * (0.76 + 0.24 * Math.abs(Math.cos(i * 1.7 + seedBias))), 0.24, 1), 3),
      gapPhase: roundTo(clamp(drynessFactor * (0.25 + 0.65 * (0.5 + 0.5 * harmonic)), 0, 0.92), 3),
      tipTaper: roundTo(clamp(0.32 + Math.abs(t) * 0.42 + drynessFactor * 0.22, 0.2, 0.96), 3),
    });
  }
  return filaments;
}

/** 5종 극한 질감 물리 레이어 조합기(종이 요철·갈필·습윤 에지·45° 임파스토·120Hz 예산 가드). */
export function evaluateTactileStampMetrics(input: TactileStampEvaluationInput): TactileStampMetrics {
  const brush = getTactileBrushPreset(input.brushId);
  const paper = getPaperGrainPreset(input.paperId);
  const lut = input.lut && input.lut.paperId === input.paperId ? input.lut : generatePaperGrainTileLut(input.paperId);
  assertFiniteTactileLut(lut);
  const controls: TactileTextureControls = {
    paperToothStrength: roundTo(clamp(input.controls?.paperToothStrength ?? brush.defaultControls.paperToothStrength, 0, 1), 3),
    dryBristleSplit: roundTo(clamp(input.controls?.dryBristleSplit ?? brush.defaultControls.dryBristleSplit, 0, 1), 3),
    wetEdgePooling: roundTo(clamp(input.controls?.wetEdgePooling ?? brush.defaultControls.wetEdgePooling, 0, 1), 3),
    impastoRelief: roundTo(clamp(input.controls?.impastoRelief ?? brush.defaultControls.impastoRelief, 0, 1), 3),
  };

  const pressure = roundTo(clamp(input.pressure ?? brush.defaultPressure, 0.05, 1), 3);
  const velocityPxPerSec = Math.round(clamp(input.velocityPxPerSec ?? brush.defaultVelocityPxPerSec, 0, 3200));
  const tiltDeg = Math.round(clamp(input.tiltDeg ?? brush.defaultTiltDeg, 0, 75));
  const strokeAngleDeg = Math.round(clamp(input.strokeAngleDeg ?? brush.defaultAngleDeg, -180, 180));
  const inkLoad = roundTo(clamp(input.inkLoad ?? 1 - brush.drynessBase, 0.05, 1), 3);
  const radiusPx = roundTo(clamp(input.radiusPx ?? brush.baseRadiusPx, 2, 120), 1);
  const targetRefreshHz: TargetRefreshHz = input.targetRefreshHz === 60 ? 60 : 120;
  const performanceGuardEnabled = input.performanceGuardEnabled ?? true;

  // 1. 종이 요철 투과: 약필압은 봉우리 스침, 강필압은 골짜기 침투
  const contactThreshold = roundTo(clamp(controls.paperToothStrength * (0.78 - pressure * 0.64), 0, 0.88), 3);
  let coveredCount = 0;
  let valleyTotal = 0;
  let valleyHit = 0;
  for (let i = 0; i < lut.height.length; i += 1) {
    const h = lut.height[i] ?? 0.5;
    if (h >= contactThreshold) coveredCount += 1;
    if (h < 0.35) {
      valleyTotal += 1;
      if (h >= contactThreshold) valleyHit += 1;
    }
  }
  const peakCoverageRatio = roundTo(coveredCount / lut.height.length, 3);
  const valleyPenetrationRatio = valleyTotal > 0 ? roundTo(valleyHit / valleyTotal, 3) : roundTo(pressure, 3);
  const grainContrast = roundTo(clamp(clamp(lut.peakStdDev, 0, 1) * 3.1 * controls.paperToothStrength * (1.15 - pressure * 0.45), 0, 1), 3);
  const effectiveOpacity = roundTo(clamp(0.24 + pressure * 0.52 + peakCoverageRatio * 0.24, 0.15, 1), 3);

  // 2. 멀티-필라멘트 분기 브리슬(3~16가닥) + 5. 120Hz/60Hz LOD 가드 연동
  const velocityNorm = clamp(velocityPxPerSec / 2200, 0, 1);
  const tiltNorm = clamp(tiltDeg / 75, 0, 1);
  const drynessFactor = roundTo(clamp((1 - inkLoad) * 0.46 + velocityNorm * 0.28 + tiltNorm * 0.14 + controls.dryBristleSplit * 0.42 - pressure * 0.16, 0, 1), 3);
  const rawFilamentCount = Math.round(
    clamp(
      MIN_BRISTLE_FILAMENTS +
        (brush.baseFilamentCount - MIN_BRISTLE_FILAMENTS) * (0.35 + controls.dryBristleSplit * 0.65) +
        (velocityNorm * 3.2 + tiltNorm * 2.1 + (1 - inkLoad) * 2.4) * controls.dryBristleSplit,
      MIN_BRISTLE_FILAMENTS,
      MAX_BRISTLE_FILAMENTS,
    ),
  );
  const splaySpreadRatio = roundTo(clamp(0.18 + controls.dryBristleSplit * 0.54 + tiltNorm * 0.28, 0.12, 1), 3);
  const frameBudget = evaluateFrameBudgetPlan({
    targetRefreshHz, guardEnabled: performanceGuardEnabled, velocityPxPerSec, radiusPx,
    baseSpacingRatio: brush.baseSpacingRatio, rawFilamentCount, controls, tiltDeg,
  });
  const activeFilamentCount = frameBudget.filamentSubStampsPerStamp;
  const filaments = buildBristleFilaments(activeFilamentCount, drynessFactor, splaySpreadRatio, brush.baseRadiusPx * 0.37 + clamp(lut.peakMean, 0, 1) * 5.2);

  // 3. 모세관 습윤 에지(활성 시 18~34% 농축 링)
  const wetEnabled = controls.wetEdgePooling > 0.02;
  const wetBlend = clamp(controls.wetEdgePooling * 0.62 + paper.absorbency * 0.26 + brush.capillarySpread * 0.12, 0, 1);
  const ringConcentrationPct = wetEnabled ? roundTo(WET_EDGE_MIN_PCT + (WET_EDGE_MAX_PCT - WET_EDGE_MIN_PCT) * wetBlend, 1) : 0;
  const ringWidthPx = wetEnabled ? roundTo(clamp(radiusPx * (0.1 + controls.wetEdgePooling * 0.14), 1.4, 9.5), 2) : 0;
  const centerBackrunLightening = wetEnabled ? roundTo(clamp(controls.wetEdgePooling * paper.absorbency * 0.22, 0, 0.24), 3) : 0;
  const effectiveRimDarkening = wetEnabled ? roundTo((ringConcentrationPct / 100) * (0.65 + controls.wetEdgePooling * 0.35), 3) : 0;

  // 4. 방향성 임파스토 45° 아틀리에 조명(Lambert + Blinn Specular)
  const elevRad = (IMPASTO_LIGHT_ELEVATION_DEG * Math.PI) / 180;
  const azimRad = (IMPASTO_LIGHT_AZIMUTH_DEG * Math.PI) / 180;
  const lx = Math.cos(elevRad) * Math.cos(azimRad);
  const ly = Math.cos(elevRad) * Math.sin(azimRad);
  const lz = Math.sin(elevRad);
  const perpRad = ((strokeAngleDeg - 90) * Math.PI) / 180;
  const centerSample = samplePaperGrainLut(lut, 28, 28, 1);
  const ridgeThicknessMm = roundTo(clamp(brush.paintThicknessMm * (0.2 + controls.impastoRelief * 0.95) * (0.6 + pressure * 0.5), 0, 2.4), 2);
  const slopeGain = clamp(controls.impastoRelief * 0.92 + ridgeThicknessMm * 0.16, 0, 1.35);

  const litNxR = Math.cos(perpRad) * slopeGain + centerSample.nx * 0.18;
  const litNyR = Math.sin(perpRad) * slopeGain + centerSample.ny * 0.18;
  const litInv = 1 / Math.hypot(litNxR, litNyR, 1);
  const shNxR = -Math.cos(perpRad) * slopeGain + centerSample.nx * 0.18;
  const shNyR = -Math.sin(perpRad) * slopeGain + centerSample.ny * 0.18;
  const shInv = 1 / Math.hypot(shNxR, shNyR, 1);
  const lambertLitDot = roundTo(clamp((litNxR * lx + litNyR * ly + lz) * litInv, 0, 1), 3);
  const lambertShadowDot = roundTo(clamp((shNxR * lx + shNyR * ly + lz) * shInv, 0, 1), 3);

  const hLen = Math.hypot(lx, ly, lz + 1);
  // 둥근 임파스토 물감 능선 단면에서 하프벡터(22.5° ≈ tan 0.414)와 가장 가깝게 정렬되는 광택 숄더 법선
  const lightAlign = clamp(Math.cos(perpRad - azimRad), 0, 1);
  const specSlope = Math.min(slopeGain, 0.414 * (0.55 + 0.45 * lightAlign));
  const spNxR = Math.cos(perpRad) * specSlope + centerSample.nx * 0.12;
  const spNyR = Math.sin(perpRad) * specSlope + centerSample.ny * 0.12;
  const spInv = 1 / Math.hypot(spNxR, spNyR, 1);
  const ndoth = clamp(((spNxR * lx + spNyR * ly + (lz + 1)) * spInv) / hLen, 0, 1);
  const blinnSpecular = roundTo(clamp(Math.pow(ndoth, 6 + brush.glossiness * 18) * controls.impastoRelief * (0.35 + brush.glossiness * 0.65), 0, 1), 3);
  const reliefDepthContrast = roundTo(clamp(Math.abs(lambertLitDot - lambertShadowDot) * (0.45 + controls.impastoRelief * 0.85), 0, 1), 3);
  const highlightOffsetPx = {
    x: roundTo(Math.cos(perpRad) * (1.2 + ridgeThicknessMm * 1.4), 2),
    y: roundTo(Math.sin(perpRad) * (1.2 + ridgeThicknessMm * 1.4), 2),
  };

  const flatBaselineRichness = 18;
  const tactileRichnessScore = Math.round(
    clamp(
      flatBaselineRichness + grainContrast * 24 + (activeFilamentCount / MAX_BRISTLE_FILAMENTS) * 20 +
        (ringConcentrationPct / WET_EDGE_MAX_PCT) * 18 + reliefDepthContrast * 14 + blinnSpecular * 10,
      flatBaselineRichness + 4,
      98,
    ),
  );

  return {
    brushId: brush.id, paperId: paper.id, controls, pressure, velocityPxPerSec, tiltDeg, strokeAngleDeg, inkLoad, radiusPx,
    paperTooth: { contactThreshold, peakCoverageRatio, valleyPenetrationRatio, grainContrast, effectiveOpacity },
    splitBristle: { drynessFactor, rawFilamentCount, activeFilamentCount, splaySpreadRatio, filaments },
    wetEdge: { enabled: wetEnabled, ringConcentrationPct, ringWidthPx, centerBackrunLightening, effectiveRimDarkening, absorbencyFactor: paper.absorbency },
    impasto: {
      lightElevationDeg: IMPASTO_LIGHT_ELEVATION_DEG, lightAzimuthDeg: IMPASTO_LIGHT_AZIMUTH_DEG,
      ridgeThicknessMm, lambertLitDot, lambertShadowDot, blinnSpecular, reliefDepthContrast, highlightOffsetPx,
    },
    frameBudget, flatBaselineRichness, tactileRichnessScore,
  };
}

function buildConfigFromPreset(brushId: TactileBrushPresetId, paperId?: PaperGrainId): TactileBrushConfig {
  const preset = getTactileBrushPreset(brushId);
  return {
    brushId: preset.id, paperId: paperId ?? preset.recommendedPaperId, controls: { ...preset.defaultControls },
    targetRefreshHz: 120, performanceGuardEnabled: true, pressure: preset.defaultPressure,
    velocityPxPerSec: preset.defaultVelocityPxPerSec, tiltDeg: preset.defaultTiltDeg, strokeAngleDeg: preset.defaultAngleDeg,
  };
}

function isSameConfig(a: TactileBrushConfig, b: TactileBrushConfig): boolean {
  return (
    a.brushId === b.brushId && a.paperId === b.paperId && a.targetRefreshHz === b.targetRefreshHz &&
    a.performanceGuardEnabled === b.performanceGuardEnabled && a.pressure === b.pressure &&
    a.velocityPxPerSec === b.velocityPxPerSec && a.tiltDeg === b.tiltDeg && a.strokeAngleDeg === b.strokeAngleDeg &&
    a.controls.paperToothStrength === b.controls.paperToothStrength &&
    a.controls.dryBristleSplit === b.controls.dryBristleSplit &&
    a.controls.wetEdgePooling === b.controls.wetEdgePooling && a.controls.impastoRelief === b.controls.impastoRelief
  );
}

/** 비파괴 브러시 질감 스튜디오 세션을 생성한다. */
export function createTactileBrushSession(
  initialBrushId: TactileBrushPresetId = "dry-sumi",
  initialPaperId?: PaperGrainId,
): TactileBrushSession {
  return {
    committed: buildConfigFromPreset(initialBrushId, initialPaperId),
    preview: null, history: [], status: "clean", appliedCount: 0, canApply: false, canRevert: false,
  };
}

/** 현재 미리보기(있으면) 또는 적용된 기준 브러시 설정을 반환한다. */
export function getActiveTactileConfig(session: TactileBrushSession): TactileBrushConfig {
  return session.preview ?? session.committed;
}

/** 설정 변경을 committed에 즉시 쓰지 않고 비파괴 preview 상태로 반영한다. */
export function previewTactileBrushPatch(session: TactileBrushSession, patch: TactileBrushConfigPatch): TactileBrushSession {
  const base = getActiveTactileConfig(session);
  const next: TactileBrushConfig = {
    brushId: patch.brushId ?? base.brushId,
    paperId: patch.paperId ?? base.paperId,
    controls: {
      paperToothStrength: roundTo(clamp(patch.controls?.paperToothStrength ?? base.controls.paperToothStrength, 0, 1), 3),
      dryBristleSplit: roundTo(clamp(patch.controls?.dryBristleSplit ?? base.controls.dryBristleSplit, 0, 1), 3),
      wetEdgePooling: roundTo(clamp(patch.controls?.wetEdgePooling ?? base.controls.wetEdgePooling, 0, 1), 3),
      impastoRelief: roundTo(clamp(patch.controls?.impastoRelief ?? base.controls.impastoRelief, 0, 1), 3),
    },
    targetRefreshHz: (patch.targetRefreshHz ?? base.targetRefreshHz) === 60 ? 60 : 120,
    performanceGuardEnabled: patch.performanceGuardEnabled ?? base.performanceGuardEnabled,
    pressure: roundTo(clamp(patch.pressure ?? base.pressure, 0.05, 1), 3),
    velocityPxPerSec: Math.round(clamp(patch.velocityPxPerSec ?? base.velocityPxPerSec, 0, 3200)),
    tiltDeg: Math.round(clamp(patch.tiltDeg ?? base.tiltDeg, 0, 75)),
    strokeAngleDeg: Math.round(clamp(patch.strokeAngleDeg ?? base.strokeAngleDeg, -180, 180)),
  };

  if (isSameConfig(next, session.committed)) {
    return {
      ...session, preview: null, status: session.appliedCount > 0 ? "applied" : "clean",
      canApply: false, canRevert: session.history.length > 0,
    };
  }
  return { ...session, preview: next, status: "previewing", canApply: true, canRevert: true };
}

/** 5종 아티스트 브러시 프리셋 전환 시 권장 종이·질감 계수를 비파괴 미리보기로 불러온다. */
export function selectTactileBrushPreset(session: TactileBrushSession, brushId: TactileBrushPresetId): TactileBrushSession {
  const active = getActiveTactileConfig(session);
  return previewTactileBrushPatch(session, {
    ...buildConfigFromPreset(brushId),
    targetRefreshHz: active.targetRefreshHz,
    performanceGuardEnabled: active.performanceGuardEnabled,
  });
}

/** 비파괴 미리보기 구성을 실제 브러시 설정으로 커밋하고 되돌리기 이력을 보존한다. */
export function applyTactileBrushPreview(session: TactileBrushSession): TactileBrushSession {
  if (!session.preview || isSameConfig(session.preview, session.committed)) return session;
  return {
    committed: session.preview, preview: null, history: [...session.history.slice(-11), session.committed],
    status: "applied", appliedCount: session.appliedCount + 1, canApply: false, canRevert: true,
  };
}

/** 미리보기가 있으면 기준 상태로 취소하고, 없으면 직전 적용 이력으로 원복한다. */
export function revertTactileBrushSession(session: TactileBrushSession): TactileBrushSession {
  if (session.preview !== null) {
    return { ...session, preview: null, status: "reverted", canApply: false, canRevert: session.history.length > 0 };
  }
  const previous = session.history[session.history.length - 1];
  if (!previous) return session;
  const remaining = session.history.slice(0, -1);
  return {
    committed: previous, preview: null, history: remaining, status: "reverted",
    appliedCount: session.appliedCount, canApply: false, canRevert: remaining.length > 0,
  };
}

/** 현재 구성의 엔진 수치를 직렬화하며 캐시에서 확정 수치를 그대로 신뢰하지 않는다. */
export function exportTactileBrushRecipeJson(session: TactileBrushSession, precomputedMetrics?: TactileStampMetrics): string {
  const normalize = (config: TactileBrushConfig): TactileBrushConfig => getActiveTactileConfig(
    previewTactileBrushPatch(createTactileBrushSession(config.brushId, config.paperId), config),
  );
  const active = normalize(getActiveTactileConfig(session));
  const lut = generatePaperGrainTileLut(active.paperId);
  const metrics = evaluateTactileStampMetrics({ ...active, ...matchingTactileStampOptions(precomputedMetrics, active), lut });
  const brush = getTactileBrushPreset(active.brushId);
  const paper = getPaperGrainPreset(active.paperId);
  const elevRad = (IMPASTO_LIGHT_ELEVATION_DEG * Math.PI) / 180;
  const azimRad = (IMPASTO_LIGHT_AZIMUTH_DEG * Math.PI) / 180;
  return serializeTactileBrushRecipe({
    session, active, committed: normalize(session.committed), metrics, lut, brush, paper,
    pigmentCss: formatOklch(brush.pigmentOklch), surfaceCss: formatOklch(paper.surfaceOklch), dirtyTilePx: DIRTY_RECT_TILE_PX,
    lightDirection: [roundTo(Math.cos(elevRad) * Math.cos(azimRad), 4), roundTo(Math.cos(elevRad) * Math.sin(azimRad), 4), roundTo(Math.sin(elevRad), 4)],
  });
}
