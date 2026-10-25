/**
 * Magma Studio 19종 브러시 프리셋 카탈로그 · Kleki 시그니처 브러시(Sketchy/Chemy) · 2×32비트 와이어 코덱
 */

import {
  createDeterministicPrng,
  type AnisotropicSpreadConfig,
  type MagmaBrushDynamicsConfig,
  type MagmaPatternBlendMode,
} from "./studio-magma-brush-engine";

export interface StudioMagmaBrushPreset {
  readonly id: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly category: "built-in" | "signature-pro";
  readonly descriptionKo: string;
  readonly config: MagmaBrushDynamicsConfig;
}

const DEFAULT_SPREAD: AnisotropicSpreadConfig = {
  normalSpread: 0,
  tangentSpread: 0,
  separateSpread: false,
  count: 1,
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clampRange(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function createPresetConfig(
  overrides: Partial<MagmaBrushDynamicsConfig> & { readonly sizePx: number },
): MagmaBrushDynamicsConfig {
  return {
    sizePx: overrides.sizePx,
    minSizePressure: overrides.minSizePressure ?? 0.15,
    maxSizePressure: overrides.maxSizePressure ?? 1,
    sizePressure: overrides.sizePressure ?? true,
    minSizeTilt: overrides.minSizeTilt ?? 1,
    maxSizeTilt: overrides.maxSizeTilt ?? 1,
    sizeTilt: overrides.sizeTilt ?? false,
    roundness: overrides.roundness ?? 1,
    minRoundness: overrides.minRoundness ?? 0.25,
    roundnessPressure: overrides.roundnessPressure ?? false,
    roundnessTilt: overrides.roundnessTilt ?? false,
    stretch: overrides.stretch ?? 0,
    minStretch: overrides.minStretch ?? 0,
    stretchPressure: overrides.stretchPressure ?? false,
    stretchTilt: overrides.stretchTilt ?? false,
    hardness: overrides.hardness ?? 0.9,
    opacity: overrides.opacity ?? 1,
    flow: overrides.flow ?? 1,
    spacingRatio: overrides.spacingRatio ?? 0.12,
    angleDeg: overrides.angleDeg ?? 0,
    angleToDirection: overrides.angleToDirection ?? false,
    angleInitialDirection: overrides.angleInitialDirection ?? false,
    angleJitter: overrides.angleJitter ?? 0,
    pixelation: overrides.pixelation ?? false,
    spread: overrides.spread ?? DEFAULT_SPREAD,
    dualSpread: overrides.dualSpread,
    colorPressure: overrides.colorPressure ?? false,
    colorTilt: overrides.colorTilt ?? false,
    foregroundBackgroundJitter: overrides.foregroundBackgroundJitter ?? 0,
    hueJitter: overrides.hueJitter ?? 0,
    saturationJitter: overrides.saturationJitter ?? 0,
    brightnessJitter: overrides.brightnessJitter ?? 0,
    patternBlendMode: overrides.patternBlendMode ?? "multiply",
    patternEachStamp: overrides.patternEachStamp ?? false,
    patternScale: overrides.patternScale ?? 1,
    patternContrast: overrides.patternContrast ?? 0.5,
    asymmetricEdgeSoftness: overrides.asymmetricEdgeSoftness ?? 0,
  };
}

/**
 * Magma Studio 기본 14종(`chunk-f918114e.js`) + 시그니처 프로 5종 브러시 프리셋 카탈로그 (총 19종)
 */
export const STUDIO_MAGMA_BRUSH_PRESETS: readonly StudioMagmaBrushPreset[] = [
  {
    id: "magma-ink",
    nameKo: "마그마 잉크 펜",
    nameEn: "Ink",
    category: "built-in",
    descriptionKo: "선명한 경도와 필압 반응형 굵기를 가진 표준 라이너 펜",
    config: createPresetConfig({ sizePx: 12, hardness: 0.96, minSizePressure: 0.08, spacingRatio: 0.08 }),
  },
  {
    id: "magma-soft-ink",
    nameKo: "마그마 소프트 잉크",
    nameEn: "Soft Ink",
    category: "built-in",
    descriptionKo: "외곽 페더를 살짝 가미해 부드러운 선화 인상을 주는 잉크 펜",
    config: createPresetConfig({ sizePx: 14, hardness: 0.72, flow: 0.85, spacingRatio: 0.1 }),
  },
  {
    id: "magma-soft",
    nameKo: "마그마 소프트 라운드",
    nameEn: "Soft",
    category: "built-in",
    descriptionKo: "부드러운 음영과 그라데이션 채색을 위한 소프트 라운드 브러시",
    config: createPresetConfig({ sizePx: 36, hardness: 0.35, flow: 0.45, spacingRatio: 0.14 }),
  },
  {
    id: "magma-softer",
    nameKo: "마그마 에어 소프트",
    nameEn: "Softer",
    category: "built-in",
    descriptionKo: "극저경도 에어브러시 감쇠로 빛번짐과 피부 블러에 적합한 브러시",
    config: createPresetConfig({ sizePx: 64, hardness: 0.1, flow: 0.25, spacingRatio: 0.18 }),
  },
  {
    id: "magma-rough",
    nameKo: "마그마 러프 초크",
    nameEn: "Rough",
    category: "built-in",
    descriptionKo: "방향 추종 각도와 미세 법선 분산이 결합된 거친 분필 브러시",
    config: createPresetConfig({
      sizePx: 24,
      hardness: 0.78,
      angleToDirection: true,
      patternEachStamp: true,
      spread: { normalSpread: 0.18, tangentSpread: 0.06, separateSpread: true, count: 2 },
    }),
  },
  {
    id: "magma-rougher",
    nameKo: "마그마 헤비 러프",
    nameEn: "Rougher",
    category: "built-in",
    descriptionKo: "강한 양축 분리 분산과 스탬프마다 갱신되는 텍스처로 거친 질감을 표현",
    config: createPresetConfig({
      sizePx: 32,
      hardness: 0.82,
      angleToDirection: true,
      angleJitter: 0.25,
      patternEachStamp: true,
      patternBlendMode: "linear-burn",
      spread: { normalSpread: 0.34, tangentSpread: 0.15, separateSpread: true, count: 3 },
    }),
  },
  {
    id: "magma-thick-rough",
    nameKo: "마그마 두꺼운 러프",
    nameEn: "Thick Rough",
    category: "built-in",
    descriptionKo: "배경 블록인과 거친 매스 채색에 특화된 광폭 텍스처 브러시",
    config: createPresetConfig({
      sizePx: 48,
      hardness: 0.85,
      roundness: 0.65,
      angleToDirection: true,
      patternBlendMode: "height",
    }),
  },
  {
    id: "magma-thin-graphite",
    nameKo: "마그마 세필 흑연",
    nameEn: "Thin Graphite",
    category: "built-in",
    descriptionKo: "정밀 크로스해칭과 드로잉 초안을 위한 세필 흑연 샤프",
    config: createPresetConfig({
      sizePx: 6,
      hardness: 0.88,
      flow: 0.7,
      sizeTilt: true,
      minSizeTilt: 1,
      maxSizeTilt: 1.8,
      roundnessTilt: true,
    }),
  },
  {
    id: "magma-pencil",
    nameKo: "마그마 표준 연필",
    nameEn: "Pencil",
    category: "built-in",
    descriptionKo: "기울기 시 선폭 확장과 종이 결 반응이 결합된 스케치 연필",
    config: createPresetConfig({
      sizePx: 10,
      hardness: 0.8,
      flow: 0.65,
      sizeTilt: true,
      minSizeTilt: 1,
      maxSizeTilt: 2.2,
      roundnessTilt: true,
      patternBlendMode: "multiply",
    }),
  },
  {
    id: "magma-soft-pencil",
    nameKo: "마그마 6B 소프트 연필",
    nameEn: "Soft Pencil",
    category: "built-in",
    descriptionKo: "부드러운 흑연 입자와 넓은 틸트 셰이딩을 지원하는 6B 연필",
    config: createPresetConfig({
      sizePx: 18,
      hardness: 0.58,
      flow: 0.55,
      sizeTilt: true,
      minSizeTilt: 1,
      maxSizeTilt: 2.5,
      roundnessTilt: true,
      patternBlendMode: "color-burn",
      spread: { normalSpread: 0.14, tangentSpread: 0.08, separateSpread: true, count: 2 },
    }),
  },
  {
    id: "magma-splotchy",
    nameKo: "마그마 스플로치 얼룩",
    nameEn: "Splotchy",
    category: "built-in",
    descriptionKo: "듀얼 브러시 분산과 회전 지터로 불규칙한 수채·수묵 얼룩을 형성",
    config: createPresetConfig({
      sizePx: 30,
      hardness: 0.64,
      angleJitter: 0.6,
      patternEachStamp: true,
      spread: { normalSpread: 0.28, tangentSpread: 0.28, separateSpread: false, count: 2 },
      dualSpread: { normalSpread: 0.35, tangentSpread: 0.2, separateSpread: true, count: 2 },
    }),
  },
  {
    id: "magma-splatter",
    nameKo: "마그마 스플래터 물방울",
    nameEn: "Splatter",
    category: "built-in",
    descriptionKo: "넓은 법선·접선 산포로 역동적인 물방울·불꽃 입자를 흩뿌리는 브러시",
    config: createPresetConfig({
      sizePx: 22,
      hardness: 0.92,
      spacingRatio: 0.45,
      angleJitter: 1,
      spread: { normalSpread: 1.4, tangentSpread: 0.9, separateSpread: true, count: 5 },
    }),
  },
  {
    id: "magma-pawprints",
    nameKo: "마그마 발자국 스탬프",
    nameEn: "Pawprints",
    category: "built-in",
    descriptionKo: "첫 댑 방향 예약으로 스트로크 궤적을 정확히 따라 찍히는 발자국 스탬프",
    config: createPresetConfig({
      sizePx: 28,
      hardness: 0.95,
      spacingRatio: 0.85,
      angleToDirection: true,
      spread: { normalSpread: 0.22, tangentSpread: 0, separateSpread: true, count: 1 },
    }),
  },
  {
    id: "magma-hearts",
    nameKo: "마그마 하트 파티클",
    nameEn: "Hearts",
    category: "built-in",
    descriptionKo: "전경·배경색 지터와 색조 변조가 결합된 장식용 하트 스탬프",
    config: createPresetConfig({
      sizePx: 26,
      hardness: 0.94,
      spacingRatio: 0.65,
      colorPressure: true,
      foregroundBackgroundJitter: 0.35,
      hueJitter: 0.12,
      spread: { normalSpread: 0.6, tangentSpread: 0.4, separateSpread: true, count: 2 },
    }),
  },
  {
    id: "magma-vine-charcoal-tilt",
    nameKo: "마그마 바인 차콜 (비대칭 에지)",
    nameEn: "Vine Charcoal (Asymmetric Tilt)",
    category: "signature-pro",
    descriptionKo: "한쪽 에지는 칼날처럼 선명하고 반대쪽 에지는 안개처럼 풀리는 Magma 시그니처 버드나무 목탄",
    config: createPresetConfig({
      sizePx: 34,
      hardness: 0.76,
      sizeTilt: true,
      minSizeTilt: 1,
      maxSizeTilt: 2.4,
      roundnessTilt: true,
      angleToDirection: true,
      asymmetricEdgeSoftness: 0.82,
      patternBlendMode: "linear-height",
      patternEachStamp: true,
    }),
  },
  {
    id: "magma-round-bristle-thick",
    nameKo: "마그마 라운드 브리슬 임파스토",
    nameEn: "Round Bristle Thick",
    category: "signature-pro",
    descriptionKo: "필압에 따라 강모 스트레치와 캔버스 결 깊이가 변하는 두꺼운 유화 브리슬",
    config: createPresetConfig({
      sizePx: 40,
      hardness: 0.84,
      stretch: 0.78,
      minStretch: 0.2,
      stretchPressure: true,
      angleToDirection: true,
      patternBlendMode: "height",
    }),
  },
  {
    id: "magma-orb-chisel-ink",
    nameKo: "마그마 오브 치즐 캘리",
    nameEn: "Orb Chisel Ink",
    category: "signature-pro",
    descriptionKo: "초기 스트로크 방향 고정(`angleInitialDirection`)으로 일정한 펜촉 각도를 유지하는 치즐 브러시",
    config: createPresetConfig({
      sizePx: 20,
      hardness: 0.96,
      roundness: 0.32,
      angleDeg: 35,
      angleInitialDirection: true,
      spacingRatio: 0.06,
    }),
  },
  {
    id: "magma-blaze-wet-mixer",
    nameKo: "마그마 블레이즈 웻 믹서",
    nameEn: "Blaze Wet Mixer",
    category: "signature-pro",
    descriptionKo: "전경·배경 필압 색 전환과 긴 물감 끌기(`stretch`)를 결합한 블렌딩 페인터",
    config: createPresetConfig({
      sizePx: 44,
      hardness: 0.52,
      stretch: 0.85,
      minStretch: 0.35,
      stretchPressure: true,
      colorPressure: true,
      foregroundBackgroundJitter: 0.18,
      patternBlendMode: "hard-mix",
    }),
  },
  {
    id: "magma-pixel-crisp-1px",
    nameKo: "마그마 픽셀 아트 크리스프",
    nameEn: "Pixel Crisp",
    category: "signature-pro",
    descriptionKo: "안티에일리어싱을 완전히 배제하고 픽셀 중심 격자에 정확히 스냅되는 도트 전용 브러시",
    config: createPresetConfig({
      sizePx: 1,
      sizePressure: false,
      hardness: 1,
      pixelation: true,
      spacingRatio: 0.25,
    }),
  },
];

export interface KlekiSketchyStrokeInput {
  readonly points: readonly { readonly x: number; readonly y: number; readonly pressure01?: number }[];
  readonly sizePx: number;
  readonly opacity01: number;
  readonly connectRadiusMultiplier?: number;
  readonly connectionProbability01?: number;
  readonly maxHistoryPoints?: number;
  readonly seed?: number;
}

export interface KlekiSketchySegment {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly widthPx: number;
  readonly alpha01: number;
  readonly kind: "spine" | "web-link";
}

export function planKlekiSketchyStroke(
  input: KlekiSketchyStrokeInput,
): readonly KlekiSketchySegment[] {
  const pts = input.points;
  if (pts.length < 2) return [];

  const safeSize = clampRange(input.sizePx, 0.5, 256, 4);
  const baseOpacity = clampRange(input.opacity01, 0.02, 1, 0.7);
  const radiusMultiplier = clampRange(input.connectRadiusMultiplier ?? 4, 1, 16, 4);
  const connectRadiusPx = safeSize * radiusMultiplier;
  const connectRadiusSq = connectRadiusPx * connectRadiusPx;
  const probability = clampRange(input.connectionProbability01 ?? 0.35, 0.02, 1, 0.35);
  const maxHistory = Math.trunc(clampRange(input.maxHistoryPoints ?? 256, 8, 2048, 256));
  const rng = createDeterministicPrng(input.seed ?? 1337);

  const history: { x: number; y: number }[] = [];
  const segments: KlekiSketchySegment[] = [];

  for (let i = 0; i < pts.length; i += 1) {
    const pt = pts[i]!;
    if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;

    if (history.length > 0) {
      const prev = history[history.length - 1]!;
      const pressure = clampRange(pt.pressure01 ?? 0.8, 0.1, 1, 0.8);
      segments.push({
        x1: prev.x,
        y1: prev.y,
        x2: pt.x,
        y2: pt.y,
        widthPx: Math.max(0.5, safeSize * 0.5 * pressure),
        alpha01: baseOpacity * pressure,
        kind: "spine",
      });

      const startIdx = Math.max(0, history.length - 1 - maxHistory);
      for (let h = startIdx; h < history.length - 1; h += 1) {
        const oldPt = history[h]!;
        const dx = pt.x - oldPt.x;
        const dy = pt.y - oldPt.y;
        const dSq = dx * dx + dy * dy;
        if (dSq <= 1e-3 || dSq > connectRadiusSq) continue;
        if (rng() <= probability) {
          const distanceFalloff = 1 - Math.sqrt(dSq) / connectRadiusPx;
          segments.push({
            x1: oldPt.x + (rng() - 0.5) * safeSize * 0.3,
            y1: oldPt.y + (rng() - 0.5) * safeSize * 0.3,
            x2: pt.x + (rng() - 0.5) * safeSize * 0.3,
            y2: pt.y + (rng() - 0.5) * safeSize * 0.3,
            widthPx: Math.max(0.35, safeSize * 0.25),
            alpha01: clamp01(baseOpacity * 0.22 * distanceFalloff),
            kind: "web-link",
          });
        }
      }
    }

    history.push({ x: pt.x, y: pt.y });
  }

  return segments;
}

export interface KlekiChemyContourInput {
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly mode: "fill" | "stroke" | "fill-and-stroke";
  readonly distortPx: number;
  readonly symmetry: "none" | "x" | "y" | "quadrant";
  readonly symmetryCenterX: number;
  readonly symmetryCenterY: number;
  readonly gradientEnabled: boolean;
  readonly seed?: number;
}

export interface KlekiChemyContourResult {
  readonly polygons: readonly (readonly { readonly x: number; readonly y: number }[])[];
  readonly gradientStartY: number;
  readonly gradientEndY: number;
  readonly isGradientInverted: boolean;
}

export function evaluateKlekiChemyContour(
  input: KlekiChemyContourInput,
): KlekiChemyContourResult {
  const validPts = input.points.filter(
    (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
  );
  if (validPts.length === 0) {
    return {
      polygons: [],
      gradientStartY: 0,
      gradientEndY: 0,
      isGradientInverted: false,
    };
  }

  const distort = clampRange(input.distortPx, 0, 128, 0);
  const rng = createDeterministicPrng(input.seed ?? 73);
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const basePoly = validPts.map((pt) => {
    const x = pt.x + (distort > 0 ? (rng() - 0.5) * 2 * distort : 0);
    const y = pt.y + (distort > 0 ? (rng() - 0.5) * 2 * distort : 0);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    return { x, y };
  });

  const first = basePoly[0]!;
  const last = basePoly[basePoly.length - 1]!;
  const isGradientInverted = first.x > last.x;

  const cx = Number.isFinite(input.symmetryCenterX) ? input.symmetryCenterX : 0;
  const cy = Number.isFinite(input.symmetryCenterY) ? input.symmetryCenterY : 0;

  const polygons: (readonly { readonly x: number; readonly y: number }[])[] = [basePoly];
  if (input.symmetry === "x" || input.symmetry === "quadrant") {
    polygons.push(basePoly.map((p) => ({ x: 2 * cx - p.x, y: p.y })));
  }
  if (input.symmetry === "y") {
    polygons.push(basePoly.map((p) => ({ x: p.x, y: 2 * cy - p.y })));
  }
  if (input.symmetry === "quadrant") {
    polygons.push(basePoly.map((p) => ({ x: p.x, y: 2 * cy - p.y })));
    polygons.push(basePoly.map((p) => ({ x: 2 * cx - p.x, y: 2 * cy - p.y })));
  }

  return {
    polygons,
    gradientStartY: isGradientInverted ? maxY : minY,
    gradientEndY: isGradientInverted ? minY : maxY,
    isGradientInverted,
  };
}

export interface EncodedMagmaBrushWirePacket {
  readonly flagsLow: number;
  readonly flagsHigh: number;
  readonly quantizedParams: readonly number[];
  readonly byteLengthEstimate: number;
  readonly compressionRatioVsJson: number;
}

const FLAG_LOW_SIZE_PRESSURE = 1 << 0;
const FLAG_LOW_SIZE_TILT = 1 << 1;
const FLAG_LOW_ROUNDNESS_PRESSURE = 1 << 2;
const FLAG_LOW_ROUNDNESS_TILT = 1 << 3;
const FLAG_LOW_STRETCH_PRESSURE = 1 << 4;
const FLAG_LOW_STRETCH_TILT = 1 << 5;
const FLAG_LOW_ANGLE_DIRECTION = 1 << 6;
const FLAG_LOW_ANGLE_INITIAL = 1 << 7;
const FLAG_LOW_PIXELATION = 1 << 8;
const FLAG_LOW_SEPARATE_SPREAD = 1 << 9;
const FLAG_LOW_COLOR_PRESSURE = 1 << 10;
const FLAG_LOW_COLOR_TILT = 1 << 11;
const FLAG_LOW_PATTERN_EACH_STAMP = 1 << 12;
const FLAG_LOW_HAS_NORMAL_SPREAD = 1 << 13;
const FLAG_LOW_HAS_TANGENT_SPREAD = 1 << 14;
const FLAG_LOW_HAS_STRETCH = 1 << 15;
const FLAG_LOW_HAS_COLOR_JITTER = 1 << 16;
const FLAG_LOW_HAS_ASYMMETRIC_EDGE = 1 << 17;

export function encodeMagmaBrushWireHeader(
  config: MagmaBrushDynamicsConfig,
): EncodedMagmaBrushWirePacket {
  let flagsLow = 0;

  if (config.sizePressure) flagsLow |= FLAG_LOW_SIZE_PRESSURE;
  if (config.sizeTilt) flagsLow |= FLAG_LOW_SIZE_TILT;
  if (config.roundnessPressure) flagsLow |= FLAG_LOW_ROUNDNESS_PRESSURE;
  if (config.roundnessTilt) flagsLow |= FLAG_LOW_ROUNDNESS_TILT;
  if (config.stretchPressure) flagsLow |= FLAG_LOW_STRETCH_PRESSURE;
  if (config.stretchTilt) flagsLow |= FLAG_LOW_STRETCH_TILT;
  if (config.angleToDirection) flagsLow |= FLAG_LOW_ANGLE_DIRECTION;
  if (config.angleInitialDirection) flagsLow |= FLAG_LOW_ANGLE_INITIAL;
  if (config.pixelation) flagsLow |= FLAG_LOW_PIXELATION;
  if (config.spread.separateSpread) flagsLow |= FLAG_LOW_SEPARATE_SPREAD;
  if (config.colorPressure) flagsLow |= FLAG_LOW_COLOR_PRESSURE;
  if (config.colorTilt) flagsLow |= FLAG_LOW_COLOR_TILT;
  if (config.patternEachStamp) flagsLow |= FLAG_LOW_PATTERN_EACH_STAMP;
  if (config.spread.normalSpread > 0) flagsLow |= FLAG_LOW_HAS_NORMAL_SPREAD;
  if (config.spread.tangentSpread > 0) flagsLow |= FLAG_LOW_HAS_TANGENT_SPREAD;
  if (config.stretch > 0) flagsLow |= FLAG_LOW_HAS_STRETCH;

  const hasColorJitter =
    config.foregroundBackgroundJitter > 0 ||
    config.hueJitter > 0 ||
    config.saturationJitter > 0 ||
    config.brightnessJitter > 0;
  if (hasColorJitter) flagsLow |= FLAG_LOW_HAS_COLOR_JITTER;
  if ((config.asymmetricEdgeSoftness ?? 0) > 0) flagsLow |= FLAG_LOW_HAS_ASYMMETRIC_EDGE;

  const patternIndex = [
    "multiply",
    "subtract",
    "darken",
    "overlay",
    "color-dodge",
    "color-burn",
    "linear-burn",
    "hard-mix",
    "linear-height",
    "height",
  ].indexOf(config.patternBlendMode);
  const flagsHigh = Math.max(0, patternIndex) & 0x0f;

  const params: number[] = [
    Math.round(clampRange(config.sizePx, 0.5, 2048, 12) * 100),
    Math.round(clamp01(config.hardness) * 100),
    Math.round(clamp01(config.opacity) * 100),
    Math.round(clamp01(config.flow) * 100),
    Math.round(clampRange(config.spacingRatio, 0.01, 4, 0.12) * 100),
    Math.round(clampRange(config.roundness, 0.05, 1, 1) * 100),
  ];

  if (flagsLow & FLAG_LOW_SIZE_PRESSURE) {
    params.push(
      Math.round(config.minSizePressure * 100),
      Math.round(config.maxSizePressure * 100),
    );
  }
  if (flagsLow & FLAG_LOW_SIZE_TILT) {
    params.push(
      Math.round(config.minSizeTilt * 100),
      Math.round(config.maxSizeTilt * 100),
    );
  }
  if (flagsLow & FLAG_LOW_HAS_NORMAL_SPREAD) {
    params.push(Math.round(config.spread.normalSpread * 100));
  }
  if (flagsLow & FLAG_LOW_HAS_TANGENT_SPREAD) {
    params.push(Math.round(config.spread.tangentSpread * 100));
  }
  if (flagsLow & FLAG_LOW_HAS_STRETCH) {
    params.push(
      Math.round(config.minStretch * 100),
      Math.round(config.stretch * 100),
    );
  }
  if (flagsLow & FLAG_LOW_HAS_COLOR_JITTER) {
    params.push(
      Math.round(config.foregroundBackgroundJitter * 100),
      Math.round(config.hueJitter * 100),
      Math.round(config.saturationJitter * 100),
      Math.round(config.brightnessJitter * 100),
    );
  }
  if (flagsLow & FLAG_LOW_HAS_ASYMMETRIC_EDGE) {
    params.push(Math.round((config.asymmetricEdgeSoftness ?? 0) * 100));
  }

  const jsonBytes = JSON.stringify(config).length;
  const wireBytes = 8 + params.length * 2;
  return {
    flagsLow: flagsLow >>> 0,
    flagsHigh: flagsHigh >>> 0,
    quantizedParams: params,
    byteLengthEstimate: wireBytes,
    compressionRatioVsJson: Number((jsonBytes / Math.max(1, wireBytes)).toFixed(2)),
  };
}

export function decodeMagmaBrushWireHeader(
  packet: Pick<EncodedMagmaBrushWirePacket, "flagsLow" | "flagsHigh" | "quantizedParams">,
): Partial<MagmaBrushDynamicsConfig> {
  const p = packet.quantizedParams;
  let idx = 0;
  const next = (fallback: number): number => {
    const val = p[idx];
    idx += 1;
    return val !== undefined && Number.isFinite(val) ? val / 100 : fallback;
  };

  const sizePx = next(12);
  const hardness = next(0.9);
  const opacity = next(1);
  const flow = next(1);
  const spacingRatio = next(0.12);
  const roundness = next(1);

  const flagsLow = packet.flagsLow >>> 0;
  const minSizePressure = flagsLow & FLAG_LOW_SIZE_PRESSURE ? next(0.15) : 0.15;
  const maxSizePressure = flagsLow & FLAG_LOW_SIZE_PRESSURE ? next(1) : 1;
  const minSizeTilt = flagsLow & FLAG_LOW_SIZE_TILT ? next(1) : 1;
  const maxSizeTilt = flagsLow & FLAG_LOW_SIZE_TILT ? next(1) : 1;
  const normalSpread = flagsLow & FLAG_LOW_HAS_NORMAL_SPREAD ? next(0) : 0;
  const tangentSpread = flagsLow & FLAG_LOW_HAS_TANGENT_SPREAD ? next(0) : 0;
  const minStretch = flagsLow & FLAG_LOW_HAS_STRETCH ? next(0) : 0;
  const stretch = flagsLow & FLAG_LOW_HAS_STRETCH ? next(0) : 0;
  const foregroundBackgroundJitter = flagsLow & FLAG_LOW_HAS_COLOR_JITTER ? next(0) : 0;
  const hueJitter = flagsLow & FLAG_LOW_HAS_COLOR_JITTER ? next(0) : 0;
  const saturationJitter = flagsLow & FLAG_LOW_HAS_COLOR_JITTER ? next(0) : 0;
  const brightnessJitter = flagsLow & FLAG_LOW_HAS_COLOR_JITTER ? next(0) : 0;
  const asymmetricEdgeSoftness = flagsLow & FLAG_LOW_HAS_ASYMMETRIC_EDGE ? next(0) : 0;

  const patternModes: readonly MagmaPatternBlendMode[] = [
    "multiply",
    "subtract",
    "darken",
    "overlay",
    "color-dodge",
    "color-burn",
    "linear-burn",
    "hard-mix",
    "linear-height",
    "height",
  ];
  const patternBlendMode = patternModes[packet.flagsHigh & 0x0f] ?? "multiply";

  return {
    sizePx,
    hardness,
    opacity,
    flow,
    spacingRatio,
    roundness,
    sizePressure: Boolean(flagsLow & FLAG_LOW_SIZE_PRESSURE),
    minSizePressure,
    maxSizePressure,
    sizeTilt: Boolean(flagsLow & FLAG_LOW_SIZE_TILT),
    minSizeTilt,
    maxSizeTilt,
    roundnessPressure: Boolean(flagsLow & FLAG_LOW_ROUNDNESS_PRESSURE),
    roundnessTilt: Boolean(flagsLow & FLAG_LOW_ROUNDNESS_TILT),
    stretchPressure: Boolean(flagsLow & FLAG_LOW_STRETCH_PRESSURE),
    stretchTilt: Boolean(flagsLow & FLAG_LOW_STRETCH_TILT),
    angleToDirection: Boolean(flagsLow & FLAG_LOW_ANGLE_DIRECTION),
    angleInitialDirection: Boolean(flagsLow & FLAG_LOW_ANGLE_INITIAL),
    pixelation: Boolean(flagsLow & FLAG_LOW_PIXELATION),
    colorPressure: Boolean(flagsLow & FLAG_LOW_COLOR_PRESSURE),
    colorTilt: Boolean(flagsLow & FLAG_LOW_COLOR_TILT),
    patternEachStamp: Boolean(flagsLow & FLAG_LOW_PATTERN_EACH_STAMP),
    spread: {
      normalSpread,
      tangentSpread,
      separateSpread: Boolean(flagsLow & FLAG_LOW_SEPARATE_SPREAD),
      count: 1,
    },
    minStretch,
    stretch,
    foregroundBackgroundJitter,
    hueJitter,
    saturationJitter,
    brightnessJitter,
    patternBlendMode,
    asymmetricEdgeSoftness,
  };
}
