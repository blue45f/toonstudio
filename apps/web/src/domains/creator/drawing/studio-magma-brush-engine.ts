/**
 * Magma Studio & Kleki 경쟁사 역공학 기반 고급 브러시 엔진
 *
 * REA 정적·라이브 번들 분석(Magma `chunk-88e51f61.js`, `chunk-925e93ca.js`, `chunk-f918114e.js` 및
 * Kleki `kleki.39d85813.js`)에서 확인된 핵심 브러시 수학 모델을 클린룸으로 내재화한다:
 * 1. 이방성 법선·접선 분리 분산 (Anisotropic Normal/Tangent Spread — 주 브러시 & 듀얼 브러시)
 * 2. 첫 댑 방향 예약 버퍼 (Reserved First-Dab Direction Resolver)
 * 3. 필압·기울기 배율 확장(minSizeTilt..maxSizeTilt 2.0+), 진원도(Roundness), 스트레치(Stretch),
 *    FG↔BG 색 혼합 및 패턴 블렌드 모드별 깊이 자동 반전(Pattern Depth Auto-Inversion), 픽셀 아트(Pixelation)
 */

export type MagmaPatternBlendMode =
  | "multiply"
  | "subtract"
  | "darken"
  | "overlay"
  | "color-dodge"
  | "color-burn"
  | "linear-burn"
  | "hard-mix"
  | "linear-height"
  | "height";

export interface AnisotropicSpreadConfig {
  /** 진행 방향에 수직인 법선 방향 분산 강도 (0..5, 크기 배율) */
  readonly normalSpread: number;
  /** 진행 방향과 나란한 접선 방향 분산 강도 (0..5, 크기 배율) */
  readonly tangentSpread: number;
  /** true이면 법선과 접선 분산을 독립 적용, false이면 normalSpread를 양축에 동일 적용 */
  readonly separateSpread: boolean;
  /** 스텝당 방출할 분산 입자 수 (1..16) */
  readonly count?: number;
}

export interface AnisotropicSpreadSample {
  readonly dx: number;
  readonly dy: number;
  readonly normalOffsetPx: number;
  readonly tangentOffsetPx: number;
}

export interface MagmaBrushDynamicsConfig {
  readonly sizePx: number;
  readonly minSizePressure: number;
  readonly maxSizePressure: number;
  readonly sizePressure: boolean;
  readonly minSizeTilt: number;
  readonly maxSizeTilt: number;
  readonly sizeTilt: boolean;
  readonly roundness: number;
  readonly minRoundness: number;
  readonly roundnessPressure: boolean;
  readonly roundnessTilt: boolean;
  readonly stretch: number;
  readonly minStretch: number;
  readonly stretchPressure: boolean;
  readonly stretchTilt: boolean;
  readonly hardness: number;
  readonly opacity: number;
  readonly flow: number;
  readonly spacingRatio: number;
  readonly angleDeg: number;
  readonly angleToDirection: boolean;
  readonly angleInitialDirection: boolean;
  readonly angleJitter: number;
  readonly pixelation: boolean;
  readonly spread: AnisotropicSpreadConfig;
  readonly dualSpread?: AnisotropicSpreadConfig;
  readonly colorPressure: boolean;
  readonly colorTilt: boolean;
  readonly foregroundBackgroundJitter: number;
  readonly hueJitter: number;
  readonly saturationJitter: number;
  readonly brightnessJitter: number;
  readonly patternBlendMode: MagmaPatternBlendMode;
  readonly patternEachStamp: boolean;
  readonly patternScale: number;
  readonly patternContrast: number;
  /** Magma 시그니처 Vine 브러시용: 한쪽 에지는 선명하고 반대쪽 에지는 부드러운 비대칭 경도 차 (0..1) */
  readonly asymmetricEdgeSoftness?: number;
}

export interface RgbColor01 {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface MagmaDabInputSample {
  readonly x: number;
  readonly y: number;
  readonly pressure01: number;
  /** 0 = 수직 세움, 1 = 완전히 눕힘 (Magma tilt 규격) */
  readonly tilt01: number;
  /** 스트로크 진행 방향 라디안 */
  readonly directionRad: number;
  /** 스트로크 시작 시 확정된 초기 진행 방향 라디안 */
  readonly initialDirectionRad: number;
  readonly foregroundColor: RgbColor01;
  readonly backgroundColor: RgbColor01;
  readonly seed: number;
}

export interface EvaluatedMagmaDab {
  readonly x: number;
  readonly y: number;
  readonly diameterPx: number;
  readonly roundness01: number;
  readonly stretch01: number;
  readonly hardness01: number;
  readonly antiAliased: boolean;
  readonly rotationRad: number;
  readonly primaryOffset: AnisotropicSpreadSample;
  readonly dualOffset: AnisotropicSpreadSample;
  readonly color: RgbColor01;
  readonly fgBgMix01: number;
  readonly patternInvertDepthOnPressure: boolean;
  readonly patternInvertDepthOnTilt: boolean;
  readonly effectivePatternDepth01: number;
  readonly asymmetricHardEdgeSide: "left" | "right" | "uniform";
}

/** Magma `FC` 배열과 동일한 압력 깊이 반전 대상 블렌드 모드 */
const PRESSURE_INVERT_PATTERN_MODES: ReadonlySet<MagmaPatternBlendMode> = new Set([
  "multiply",
  "color-burn",
  "color-dodge",
  "hard-mix",
]);

/** Magma `IC` 배열과 동일한 틸트 깊이 반전 대상 블렌드 모드 */
const TILT_INVERT_PATTERN_MODES: ReadonlySet<MagmaPatternBlendMode> = new Set([
  "height",
  "linear-height",
]);

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clampRange(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

/** 결정론적 SplitMix32 난수 생성기 (0..1 반환) */
export function createDeterministicPrng(seed: number): () => number {
  let state = (Math.trunc(seed) | 0) >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    z = (z ^ (z >>> 16)) >>> 0;
    return z / 0x100000000;
  };
}

/**
 * Magma Studio의 이방성(Anisotropic) 법선·접선 분리 분산을 계산한다.
 */
export function evaluateAnisotropicScatterOffset(
  config: AnisotropicSpreadConfig,
  sizePx: number,
  directionRad: number,
  uNormal01: number,
  uTangent01: number,
): AnisotropicSpreadSample {
  const safeSize = clampRange(sizePx, 0.5, 4096, 10);
  const safeDir = Number.isFinite(directionRad) ? directionRad : 0;
  const normalSpread = clampRange(config.normalSpread, 0, 5, 0);
  const rawTangentSpread = clampRange(config.tangentSpread, 0, 5, 0);
  const effectiveTangentSpread = config.separateSpread ? rawTangentSpread : normalSpread;

  const uN = clamp01(uNormal01) - 0.5;
  const uT = clamp01(uTangent01) - 0.5;

  const normalOffsetPx = normalSpread * safeSize * uN;
  const tangentOffsetPx = effectiveTangentSpread * safeSize * uT;

  const cosT = Math.cos(safeDir);
  const sinT = Math.sin(safeDir);
  const normalX = -sinT;
  const normalY = cosT;

  return {
    dx: normalX * normalOffsetPx + cosT * tangentOffsetPx,
    dy: normalY * normalOffsetPx + sinT * tangentOffsetPx,
    normalOffsetPx,
    tangentOffsetPx,
  };
}

export interface ReservedStartSample {
  readonly x: number;
  readonly y: number;
  readonly pressure01: number;
  readonly tilt01: number;
}

export interface ReservedStartResolution {
  readonly ready: boolean;
  readonly initialDirectionRad: number;
  readonly emittedSamples: readonly (ReservedStartSample & { readonly directionRad: number })[];
}

/**
 * Magma Studio의 `this.reserved` / `drawReserved()` 메커니즘을 구현한 첫 댑 방향 예약 버퍼.
 */
export class MagmaReservedStartBuffer {
  private reservedSample: ReservedStartSample | null = null;
  private initialDirectionRad: number | null = null;
  private readonly requiresReservation: boolean;
  private readonly minConfirmDistancePx: number;

  public constructor(config: {
    readonly sizePx: number;
    readonly spacingRatio: number;
    readonly angleToDirection: boolean;
    readonly angleInitialDirection: boolean;
    readonly normalSpread: number;
    readonly tangentSpread: number;
  }) {
    this.requiresReservation =
      config.angleToDirection ||
      config.angleInitialDirection ||
      config.normalSpread > 0 ||
      config.tangentSpread > 0;
    const spacingPx =
      clampRange(config.sizePx, 1, 2048, 12) * clampRange(config.spacingRatio, 0.02, 4, 0.15);
    this.minConfirmDistancePx = Math.max(0.5, spacingPx * 0.5);
  }

  public isWaitingForDirection(): boolean {
    return this.reservedSample !== null;
  }

  public getInitialDirectionRad(): number {
    return this.initialDirectionRad ?? 0;
  }

  public start(sample: ReservedStartSample): ReservedStartResolution {
    this.initialDirectionRad = null;
    if (this.requiresReservation) {
      this.reservedSample = sample;
      return {
        ready: false,
        initialDirectionRad: 0,
        emittedSamples: [],
      };
    }
    this.reservedSample = null;
    this.initialDirectionRad = 0;
    return {
      ready: true,
      initialDirectionRad: 0,
      emittedSamples: [{ ...sample, directionRad: 0 }],
    };
  }

  public move(sample: ReservedStartSample): ReservedStartResolution {
    if (!this.reservedSample) {
      const dir = this.initialDirectionRad ?? 0;
      return {
        ready: true,
        initialDirectionRad: dir,
        emittedSamples: [{ ...sample, directionRad: dir }],
      };
    }

    const dx = sample.x - this.reservedSample.x;
    const dy = sample.y - this.reservedSample.y;
    const dist = Math.hypot(dx, dy);
    if (dist < this.minConfirmDistancePx) {
      return {
        ready: false,
        initialDirectionRad: 0,
        emittedSamples: [],
      };
    }

    const confirmedDir = Math.atan2(dy, dx);
    this.initialDirectionRad = confirmedDir;
    const first = this.reservedSample;
    this.reservedSample = null;
    return {
      ready: true,
      initialDirectionRad: confirmedDir,
      emittedSamples: [
        { ...first, directionRad: confirmedDir },
        { ...sample, directionRad: confirmedDir },
      ],
    };
  }

  public flushOnPointerUp(fallbackDirectionRad = 0): ReservedStartResolution {
    if (!this.reservedSample) {
      return {
        ready: true,
        initialDirectionRad: this.initialDirectionRad ?? fallbackDirectionRad,
        emittedSamples: [],
      };
    }
    const first = this.reservedSample;
    this.reservedSample = null;
    this.initialDirectionRad = fallbackDirectionRad;
    return {
      ready: true,
      initialDirectionRad: fallbackDirectionRad,
      emittedSamples: [{ ...first, directionRad: fallbackDirectionRad }],
    };
  }
}

function rgbToHsv(rgb: RgbColor01): { h: number; s: number; v: number } {
  const r = clamp01(rgb.r);
  const g = clamp01(rgb.g);
  const b = clamp01(rgb.b);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) {
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
      h = ((b - r) / d + 2) / 6;
    } else {
      h = ((r - g) / d + 4) / 6;
    }
  }
  const s = max <= 1e-6 ? 0 : d / max;
  return { h, s, v: max };
}

function hsvToRgb(h: number, s: number, v: number): RgbColor01 {
  const wrappedH = ((h % 1) + 1) % 1;
  const safeS = clamp01(s);
  const safeV = clamp01(v);
  const i = Math.floor(wrappedH * 6);
  const f = wrappedH * 6 - i;
  const p = safeV * (1 - safeS);
  const q = safeV * (1 - f * safeS);
  const t = safeV * (1 - (1 - f) * safeS);
  switch (i % 6) {
    case 0:
      return { r: safeV, g: t, b: p };
    case 1:
      return { r: q, g: safeV, b: p };
    case 2:
      return { r: p, g: safeV, b: t };
    case 3:
      return { r: p, g: q, b: safeV };
    case 4:
      return { r: t, g: p, b: safeV };
    default:
      return { r: safeV, g: p, b: q };
  }
}

/**
 * Magma Studio의 단일 댑 다이내믹스(크기·기울기 배율·진원도·스트레치·색상 혼합·패턴 깊이 자동 반전·픽셀 모드)를 계산한다.
 */
export function evaluateMagmaDabDynamics(
  config: MagmaBrushDynamicsConfig,
  sample: MagmaDabInputSample,
): EvaluatedMagmaDab {
  const rng = createDeterministicPrng(sample.seed);
  const pressure = clamp01(sample.pressure01);
  const tilt = clamp01(sample.tilt01);

  let scale = 1;
  if (config.sizePressure) {
    scale *= lerp(
      clampRange(config.minSizePressure, 0, 2, 0),
      clampRange(config.maxSizePressure, 0.05, 3, 1),
      pressure,
    );
  }
  if (config.sizeTilt) {
    scale *= lerp(
      clampRange(config.minSizeTilt, 0.1, 3, 1),
      clampRange(config.maxSizeTilt, 0.1, 4, 1.8),
      tilt,
    );
  }

  let diameterPx = Math.max(0.5, clampRange(config.sizePx, 0.5, 2048, 12) * scale);

  let roundness01 = clampRange(config.roundness, 0.05, 1, 1);
  const minRound = clampRange(config.minRoundness, 0.05, 1, 0.2);
  if (config.roundnessPressure) {
    roundness01 *= Math.max(minRound, pressure);
  }
  if (config.roundnessTilt) {
    roundness01 *= lerp(Math.max(minRound, 0.3), 1, 1 - tilt);
  }
  roundness01 = clampRange(roundness01, 0.05, 1, 1);

  const stretchT = config.stretchPressure ? pressure : config.stretchTilt ? 1 - tilt : 1;
  const stretch01 = clamp01(
    lerp(clamp01(config.minStretch), clamp01(config.stretch), stretchT),
  );

  const baseAngleRad = (clampRange(config.angleDeg, -360, 360, 0) * Math.PI) / 180;
  const dirRad = config.angleToDirection
    ? sample.directionRad
    : config.angleInitialDirection
      ? sample.initialDirectionRad
      : 0;
  const jitterRad = clamp01(config.angleJitter) * (rng() * 2 - 1) * Math.PI;
  const rotationRad = baseAngleRad + dirRad + jitterRad;

  const primaryOffset = evaluateAnisotropicScatterOffset(
    config.spread,
    diameterPx,
    sample.directionRad,
    rng(),
    rng(),
  );
  const dualOffset = config.dualSpread
    ? evaluateAnisotropicScatterOffset(
        config.dualSpread,
        diameterPx,
        sample.directionRad,
        rng(),
        rng(),
      )
    : { dx: 0, dy: 0, normalOffsetPx: 0, tangentOffsetPx: 0 };

  let x = sample.x + primaryOffset.dx;
  let y = sample.y + primaryOffset.dy;
  let hardness01 = clamp01(config.hardness);
  let antiAliased = true;
  if (config.pixelation) {
    diameterPx = Math.max(1, Math.round(diameterPx));
    x = Math.floor(x) + 0.5;
    y = Math.floor(y) + 0.5;
    hardness01 = 1;
    antiAliased = false;
  }

  const baseMix = config.colorPressure ? 1 - pressure : config.colorTilt ? tilt : 0;
  const fgBgJitter = clamp01(config.foregroundBackgroundJitter);
  const minMix = Math.max(0, baseMix - fgBgJitter);
  const maxMix = Math.min(1, baseMix + fgBgJitter);
  const fgBgMix01 = clamp01(lerp(minMix, maxMix, rng()));

  const mixedRgb: RgbColor01 = {
    r: lerp(sample.foregroundColor.r, sample.backgroundColor.r, fgBgMix01),
    g: lerp(sample.foregroundColor.g, sample.backgroundColor.g, fgBgMix01),
    b: lerp(sample.foregroundColor.b, sample.backgroundColor.b, fgBgMix01),
  };

  const hsv = rgbToHsv(mixedRgb);
  const hOut = hsv.h + clamp01(config.hueJitter) * (rng() - 0.5);
  const sOut = clamp01(hsv.s + clamp01(config.saturationJitter) * (rng() - 0.5));
  const vOut = clamp01(hsv.v + clamp01(config.brightnessJitter) * (rng() - 0.5));
  const color = hsvToRgb(hOut, sOut, vOut);

  const patternInvertDepthOnPressure = PRESSURE_INVERT_PATTERN_MODES.has(
    config.patternBlendMode,
  );
  const patternInvertDepthOnTilt = TILT_INVERT_PATTERN_MODES.has(config.patternBlendMode);
  const pressureDepth = patternInvertDepthOnPressure ? 1 - pressure : pressure;
  const tiltDepth = patternInvertDepthOnTilt ? 1 - tilt : tilt;
  const effectivePatternDepth01 = clamp01(
    0.65 * pressureDepth + 0.35 * (config.sizeTilt ? tiltDepth : pressureDepth),
  );

  const asymmetricEdge = clamp01(config.asymmetricEdgeSoftness ?? 0);
  const asymmetricHardEdgeSide: "left" | "right" | "uniform" =
    asymmetricEdge <= 0.01
      ? "uniform"
      : Math.cos(sample.directionRad) >= 0
        ? "left"
        : "right";

  return {
    x,
    y,
    diameterPx,
    roundness01,
    stretch01,
    hardness01,
    antiAliased,
    rotationRad,
    primaryOffset,
    dualOffset,
    color,
    fgBgMix01,
    patternInvertDepthOnPressure,
    patternInvertDepthOnTilt,
    effectivePatternDepth01,
    asymmetricHardEdgeSide,
  };
}

export {
  decodeMagmaBrushWireHeader,
  encodeMagmaBrushWireHeader,
  evaluateKlekiChemyContour,
  planKlekiSketchyStroke,
  STUDIO_MAGMA_BRUSH_PRESETS,
  type EncodedMagmaBrushWirePacket,
  type KlekiChemyContourInput,
  type KlekiChemyContourResult,
  type KlekiSketchySegment,
  type KlekiSketchyStrokeInput,
  type StudioMagmaBrushPreset,
} from "./studio-magma-brush-presets";
