/**
 * 수공예 아날로그 지터 · 모세관 잉크 번짐 · 종이결 페더링 엔진 (Wave 40A).
 *
 * 기계적으로 균일한 디지털 벡터 스트로크에 결정론적 value-noise 미세 손떨림,
 * 펜 멈춤/감속 구간 모세관 잉크 번짐(capillary ink bloom), 종이결 미세 페더링(fiber feathering),
 * 빠른 획의 비백(dry-brush skip)을 순수 온디바이스 연산으로 적용한다.
 */

export type AnalogArtisanPresetId =
  | "fountain-watercolor"
  | "gpen-manuscript"
  | "graphite-croquis"
  | "sumi-brush"
  | "woodblock-print";

export interface AnalogStrokePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
  readonly timestampMs?: number;
  readonly tiltDeg?: number;
}

export interface AnalogArtisanPreset {
  readonly id: AnalogArtisanPresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly mediumKo: string;
  readonly mediumEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly jitterAmplitudePx: number;
  readonly jitterFrequency: number;
  readonly tremorHarmonics: number;
  readonly grainDirectionBiasRad: number | null;
  readonly inkBloomIntensity: number;
  readonly inkBloomDwellThresholdMs: number;
  readonly inkBloomSpeedThresholdPxPerSec: number;
  readonly paperGrainTooth: number;
  readonly featherEdgeSpreadPx: number;
  readonly widthOrganicVariance: number;
  readonly dryBrushSkipThreshold: number;
  readonly baseStrokeWidthPx: number;
}

export interface AnalogJitteredPoint {
  readonly sourceIndex: number;
  readonly x: number;
  readonly y: number;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly jitterOffsetX: number;
  readonly jitterOffsetY: number;
  readonly jitterMagnitudePx: number;
  readonly arcLengthPx: number;
  readonly speedPxPerSec: number;
  readonly dwellMs: number;
  readonly pressure: number;
  readonly effectiveWidthPx: number;
  readonly capillaryBloomRadiusPx: number;
  readonly capillaryBloomOpacity: number;
  readonly paperFeatherSpreadPx: number;
  readonly fiberDensity: number;
  readonly drySkipGap: number;
}

export type CapillaryBloomReason = "pause-dwell" | "deceleration" | "terminal-lift";

export interface CapillaryBloomSpot {
  readonly pointIndex: number;
  readonly x: number;
  readonly y: number;
  readonly radiusPx: number;
  readonly intensity: number;
  readonly dwellMs: number;
  readonly reason: CapillaryBloomReason;
}

export interface PaperFeatherWhisker {
  readonly pointIndex: number;
  readonly originX: number;
  readonly originY: number;
  readonly tipX: number;
  readonly tipY: number;
  readonly lengthPx: number;
  readonly opacity: number;
}

export interface AnalogJitterMetrics {
  readonly pointCount: number;
  readonly totalArcLengthPx: number;
  readonly meanJitterPx: number;
  readonly maxJitterPx: number;
  readonly bloomSpotCount: number;
  readonly maxBloomRadiusPx: number;
  readonly meanFeatherSpreadPx: number;
  readonly meanDrySkipRatio: number;
  readonly organicHumanizationScore: number;
  readonly mechanicalUniformityResidual: number;
}

export interface AnalogJitterResult {
  readonly presetId: AnalogArtisanPresetId;
  readonly preset: AnalogArtisanPreset;
  readonly seed: number;
  readonly points: readonly AnalogJitteredPoint[];
  readonly bloomSpots: readonly CapillaryBloomSpot[];
  readonly featherWhiskers: readonly PaperFeatherWhisker[];
  readonly metrics: AnalogJitterMetrics;
  readonly svgPathData: string;
  readonly sourceSvgPathData: string;
}

export interface SampleAnalogStrokeSpec {
  readonly id: "slow-ink-pause" | "fast-croquis-arc" | "diagonal-hatching";
  readonly labelKo: string;
  readonly labelEn: string;
  readonly points: readonly AnalogStrokePoint[];
}

export const ANALOG_ARTISAN_PRESET_IDS: readonly AnalogArtisanPresetId[] = [
  "fountain-watercolor",
  "gpen-manuscript",
  "graphite-croquis",
  "sumi-brush",
  "woodblock-print",
] as const;

export const ANALOG_ARTISAN_PRESETS: Readonly<Record<AnalogArtisanPresetId, AnalogArtisanPreset>> = {
  "fountain-watercolor": {
    id: "fountain-watercolor",
    labelKo: "만년필 수채",
    labelEn: "Fountain Watercolor",
    mediumKo: "황동 닙 만년필 · 코튼 300g 수채지",
    mediumEn: "Brass Nib Fountain Pen · 300gsm Cotton Paper",
    descriptionKo: "펜이 멈추거나 감속하는 모서리마다 수성 잉크가 종이 섬유로 부드럽게 스며드는 수채 드로잉 질감.",
    descriptionEn: "Aqueous fountain ink blooms softly into cotton fibers wherever the nib pauses or slows.",
    jitterAmplitudePx: 1.45,
    jitterFrequency: 0.065,
    tremorHarmonics: 3,
    grainDirectionBiasRad: null,
    inkBloomIntensity: 0.92,
    inkBloomDwellThresholdMs: 42,
    inkBloomSpeedThresholdPxPerSec: 175,
    paperGrainTooth: 0.68,
    featherEdgeSpreadPx: 2.85,
    widthOrganicVariance: 0.24,
    dryBrushSkipThreshold: 0.08,
    baseStrokeWidthPx: 2.8,
  },
  "gpen-manuscript": {
    id: "gpen-manuscript",
    labelKo: "지펜 원고",
    labelEn: "G-Pen Manuscript",
    mediumKo: "스틸 지펜 닙 · 135kg 켄트 만화원고지",
    mediumEn: "Steel G-Pen Nib · Smooth Kent Manuscript Paper",
    descriptionKo: "탄탄한 필압 강약과 미세한 손끝 떨림만 살리고 번짐을 절제한 출판 만화 선화 질감.",
    descriptionEn: "Crisp publishing ink linework with expressive pressure taper and disciplined micro-tremor.",
    jitterAmplitudePx: 0.68,
    jitterFrequency: 0.085,
    tremorHarmonics: 2,
    grainDirectionBiasRad: null,
    inkBloomIntensity: 0.34,
    inkBloomDwellThresholdMs: 65,
    inkBloomSpeedThresholdPxPerSec: 110,
    paperGrainTooth: 0.22,
    featherEdgeSpreadPx: 0.85,
    widthOrganicVariance: 0.36,
    dryBrushSkipThreshold: 0.14,
    baseStrokeWidthPx: 2.2,
  },
  "graphite-croquis": {
    id: "graphite-croquis",
    labelKo: "연필 크로키",
    labelEn: "Graphite Croquis",
    mediumKo: "4B 흑연 목탄 연필 · 중목 스케치북",
    mediumEn: "4B Graphite Pencil · Cold-Press Sketchbook",
    descriptionKo: "종이 요철을 타고 흑연 입자가 뜯겨 나가는 건식 결감과 빠른 획의 자연스러운 끊김.",
    descriptionEn: "Dry graphite grain catching paper valleys with gritty tooth edges and brisk dry skips.",
    jitterAmplitudePx: 1.85,
    jitterFrequency: 0.14,
    tremorHarmonics: 3,
    grainDirectionBiasRad: null,
    inkBloomIntensity: 0.09,
    inkBloomDwellThresholdMs: 90,
    inkBloomSpeedThresholdPxPerSec: 75,
    paperGrainTooth: 0.91,
    featherEdgeSpreadPx: 2.4,
    widthOrganicVariance: 0.28,
    dryBrushSkipThreshold: 0.62,
    baseStrokeWidthPx: 2.5,
  },
  "sumi-brush": {
    id: "sumi-brush",
    labelKo: "동양 먹선",
    labelEn: "Sumi Ink Brush",
    mediumKo: "양모 세필 붓 · 닥나무 한지",
    mediumEn: "Goat-Hair Calligraphic Brush · Mulberry Hanji",
    descriptionKo: "붓을 누르면 먹이 한지 섬유를 따라 퍼지고, 빠르게 휘두르면 거친 비백(갈필)이 살아나는 필치.",
    descriptionEn: "Sumi ink wicks along mulberry fibers on slow strokes and opens flying-white dry streaks at speed.",
    jitterAmplitudePx: 2.15,
    jitterFrequency: 0.055,
    tremorHarmonics: 3,
    grainDirectionBiasRad: null,
    inkBloomIntensity: 0.88,
    inkBloomDwellThresholdMs: 38,
    inkBloomSpeedThresholdPxPerSec: 190,
    paperGrainTooth: 0.78,
    featherEdgeSpreadPx: 3.4,
    widthOrganicVariance: 0.48,
    dryBrushSkipThreshold: 0.74,
    baseStrokeWidthPx: 4.1,
  },
  "woodblock-print": {
    id: "woodblock-print",
    labelKo: "목판화",
    labelEn: "Woodblock Print",
    mediumKo: "산벚나무 목판 조각칼 · 유성 판화 잉크",
    mediumEn: "Cherry Woodblock Chisel · Oil Relief Ink",
    descriptionKo: "나뭇결 방향을 따라 미세하게 꺾이는 칼맛과 판면 압착 잉크의 묵직한 모서리 뭉침.",
    descriptionEn: "Chiseled wood-grain directional bite with bold relief ink press pooling along cut borders.",
    jitterAmplitudePx: 2.05,
    jitterFrequency: 0.11,
    tremorHarmonics: 3,
    grainDirectionBiasRad: 0.18,
    inkBloomIntensity: 0.56,
    inkBloomDwellThresholdMs: 52,
    inkBloomSpeedThresholdPxPerSec: 145,
    paperGrainTooth: 0.84,
    featherEdgeSpreadPx: 2.95,
    widthOrganicVariance: 0.31,
    dryBrushSkipThreshold: 0.45,
    baseStrokeWidthPx: 3.6,
  },
};

export const DEFAULT_SAMPLE_STROKES: readonly SampleAnalogStrokeSpec[] = [
  {
    id: "slow-ink-pause",
    labelKo: "느린 멈춤 선 (잉크 번짐 관찰)",
    labelEn: "Paused Ink Line (Bloom Focus)",
    points: [
      { x: 24, y: 112, pressure: 0.38, timestampMs: 0 },
      { x: 52, y: 98, pressure: 0.54, timestampMs: 36 },
      { x: 84, y: 86, pressure: 0.68, timestampMs: 74 },
      { x: 116, y: 78, pressure: 0.76, timestampMs: 112 },
      { x: 132, y: 76, pressure: 0.88, timestampMs: 240 }, // 중간 멈춤 구간
      { x: 142, y: 77, pressure: 0.92, timestampMs: 375 }, // 감속 정체 구간
      { x: 176, y: 84, pressure: 0.72, timestampMs: 425 },
      { x: 214, y: 92, pressure: 0.64, timestampMs: 465 },
      { x: 252, y: 82, pressure: 0.58, timestampMs: 505 },
      { x: 286, y: 66, pressure: 0.71, timestampMs: 575 },
      { x: 300, y: 60, pressure: 0.84, timestampMs: 710 }, // 종단 닙 정지
    ],
  },
  {
    id: "fast-croquis-arc",
    labelKo: "빠른 크로키 호 (비백·결감)",
    labelEn: "Fast Croquis Arc (Tooth & Skip)",
    points: [
      { x: 26, y: 126, pressure: 0.42, timestampMs: 0 },
      { x: 66, y: 86, pressure: 0.66, timestampMs: 18 },
      { x: 112, y: 54, pressure: 0.79, timestampMs: 34 },
      { x: 164, y: 38, pressure: 0.74, timestampMs: 49 },
      { x: 218, y: 44, pressure: 0.61, timestampMs: 65 },
      { x: 268, y: 68, pressure: 0.48, timestampMs: 83 },
      { x: 302, y: 102, pressure: 0.34, timestampMs: 108 },
    ],
  },
  {
    id: "diagonal-hatching",
    labelKo: "대각 해칭 꺾임 (모서리 페더링)",
    labelEn: "Diagonal Hatch Turn (Feathering)",
    points: [
      { x: 34, y: 40, pressure: 0.52, timestampMs: 0 },
      { x: 76, y: 66, pressure: 0.64, timestampMs: 44 },
      { x: 118, y: 96, pressure: 0.72, timestampMs: 90 },
      { x: 146, y: 114, pressure: 0.85, timestampMs: 210 },
      { x: 184, y: 94, pressure: 0.67, timestampMs: 268 },
      { x: 226, y: 70, pressure: 0.59, timestampMs: 316 },
      { x: 270, y: 46, pressure: 0.44, timestampMs: 372 },
      { x: 294, y: 42, pressure: 0.68, timestampMs: 486 },
    ],
  },
];

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** 32비트 정수 곱셈 기반 결정론적 해시(0..1 반환, BigInt 미사용). */
export function deterministicHash01(seed: number, channel: number, latticeIndex: number): number {
  let h = (Math.trunc(seed) ^ Math.imul(Math.trunc(channel) + 1, 374761393)) >>> 0;
  h = (h ^ Math.imul(Math.trunc(latticeIndex) + 17, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}

function quinticFade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** 연속 미분 가능한 1D Value Noise(-1..1 범위). */
export function valueNoise1D(position: number, seed: number, channel: number): number {
  const safePos = Number.isFinite(position) ? position : 0;
  const i0 = Math.floor(safePos);
  const frac = safePos - i0;
  const u = quinticFade(frac);
  const v0 = deterministicHash01(seed, channel, i0) * 2 - 1;
  const v1 = deterministicHash01(seed, channel, i0 + 1) * 2 - 1;
  return v0 + (v1 - v0) * u;
}

/** 손목·손가락·종이결 3대역 합성을 위한 결정론적 다중 옥타브 fBm 노이즈(-1..1 정규화). */
export function fbmNoise1D(position: number, seed: number, channel: number, octaves: number): number {
  const safeOctaves = Math.max(1, Math.min(5, Math.trunc(octaves)));
  let total = 0;
  let amplitude = 1;
  let frequency = 1;
  let norm = 0;

  for (let octave = 0; octave < safeOctaves; octave += 1) {
    total += valueNoise1D(position * frequency, seed, channel + octave * 31) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.07;
  }

  return norm > 0 ? total / norm : 0;
}

function buildSvgPolylinePath(points: readonly { readonly x: number; readonly y: number }[]): string {
  if (points.length === 0) return "";
  const first = points[0];
  if (!first) return "";
  if (points.length === 1) {
    return `M ${round3(first.x)} ${round3(first.y)} L ${round3(first.x)} ${round3(first.y)}`;
  }

  const segments: string[] = [`M ${round3(first.x)} ${round3(first.y)}`];
  for (let i = 1; i < points.length - 1; i += 1) {
    const cur = points[i];
    const next = points[i + 1];
    if (!cur || !next) continue;
    const midX = (cur.x + next.x) * 0.5;
    const midY = (cur.y + next.y) * 0.5;
    segments.push(`Q ${round3(cur.x)} ${round3(cur.y)} ${round3(midX)} ${round3(midY)}`);
  }
  const last = points[points.length - 1];
  if (last) {
    segments.push(`L ${round3(last.x)} ${round3(last.y)}`);
  }
  return segments.join(" ");
}

/**
 * 벡터 스트로크 점열에 장인 프리셋별 아날로그 지터·모세관 잉크 번짐·종이결 페더링을 적용한다.
 */
export function applyAnalogJitterProfile(
  strokePoints: readonly AnalogStrokePoint[],
  presetId: AnalogArtisanPresetId,
  seed = 20261124,
): AnalogJitterResult {
  const preset = ANALOG_ARTISAN_PRESETS[presetId];
  const normalizedSeed = Number.isFinite(seed) ? Math.trunc(seed) : 20261124;

  if (strokePoints.length === 0) {
    return {
      presetId,
      preset,
      seed: normalizedSeed,
      points: [],
      bloomSpots: [],
      featherWhiskers: [],
      metrics: {
        pointCount: 0,
        totalArcLengthPx: 0,
        meanJitterPx: 0,
        maxJitterPx: 0,
        bloomSpotCount: 0,
        maxBloomRadiusPx: 0,
        meanFeatherSpreadPx: 0,
        meanDrySkipRatio: 0,
        organicHumanizationScore: 0,
        mechanicalUniformityResidual: 100,
      },
      svgPathData: "",
      sourceSvgPathData: "",
    };
  }

  const sanitized = strokePoints.map((pt, idx) => ({
    x: Number.isFinite(pt.x) ? pt.x : 0,
    y: Number.isFinite(pt.y) ? pt.y : 0,
    pressure: clamp(pt.pressure ?? 0.65, 0.05, 1),
    timestampMs:
      typeof pt.timestampMs === "number" && Number.isFinite(pt.timestampMs)
        ? pt.timestampMs
        : idx * 32,
  }));

  const points: AnalogJitteredPoint[] = [];
  const bloomSpots: CapillaryBloomSpot[] = [];
  const featherWhiskers: PaperFeatherWhisker[] = [];

  let cumulativeArc = 0;
  let prevSpeed = 0;
  let jitterSum = 0;
  let maxJitterPx = 0;
  let maxBloomRadiusPx = 0;
  let featherSum = 0;
  let drySkipSum = 0;

  for (let i = 0; i < sanitized.length; i += 1) {
    const cur = sanitized[i];
    if (!cur) continue;
    const prev = i > 0 ? sanitized[i - 1] : undefined;
    const next = i < sanitized.length - 1 ? sanitized[i + 1] : undefined;

    const segDx = prev ? cur.x - prev.x : 0;
    const segDy = prev ? cur.y - prev.y : 0;
    const segLen = Math.hypot(segDx, segDy);
    cumulativeArc += segLen;

    const dwellMs = prev ? Math.max(4, cur.timestampMs - prev.timestampMs) : 24;
    const speedPxPerSec = prev ? (segLen / dwellMs) * 1000 : 120;
    const decelerationRatio =
      prev && prevSpeed > 1 ? clamp((prevSpeed - speedPxPerSec) / prevSpeed, 0, 1) : 0;
    prevSpeed = speedPxPerSec;

    // 진행 방향 접선 및 법선 벡터 계산
    const tanDx = (next ? next.x : cur.x) - (prev ? prev.x : cur.x);
    const tanDy = (next ? next.y : cur.y) - (prev ? prev.y : cur.y);
    const tanLen = Math.hypot(tanDx, tanDy);
    const ux = tanLen > 1e-4 ? tanDx / tanLen : 1;
    const uy = tanLen > 1e-4 ? tanDy / tanLen : 0;
    const nx = -uy;
    const ny = ux;

    // 결정론적 다중 옥타브 손떨림 + 종이결 저항
    const spatialPhase = cumulativeArc * preset.jitterFrequency + i * 0.37;
    const lateralNoise = fbmNoise1D(spatialPhase, normalizedSeed, 11, preset.tremorHarmonics);
    const longitudinalNoise = fbmNoise1D(spatialPhase * 1.13, normalizedSeed, 29, 2);
    const toothNoise = valueNoise1D(cumulativeArc * 0.27 + i * 0.83, normalizedSeed, 53);

    // 필압이 약할수록 손끝 미세 흔들림이 조금 더 살아나고, 목판화는 나뭇결 축 편향을 반영
    const pressureStability = 1.18 - cur.pressure * 0.35;
    const rawLateral = lateralNoise * preset.jitterAmplitudePx * pressureStability;
    const rawLongitudinal = longitudinalNoise * preset.jitterAmplitudePx * 0.32;

    let jitterOffsetX = nx * rawLateral + ux * rawLongitudinal;
    let jitterOffsetY = ny * rawLateral + uy * rawLongitudinal;

    if (preset.grainDirectionBiasRad !== null) {
      const gx = Math.cos(preset.grainDirectionBiasRad);
      const gy = Math.sin(preset.grainDirectionBiasRad);
      const woodChisel = toothNoise * preset.jitterAmplitudePx * 0.45;
      jitterOffsetX += gx * woodChisel;
      jitterOffsetY += gy * woodChisel;
    }

    const jitterMagnitudePx = Math.hypot(jitterOffsetX, jitterOffsetY);
    const jitteredX = cur.x + jitterOffsetX;
    const jitteredY = cur.y + jitterOffsetY;

    // 모세관 잉크 번짐 계산: 펜 멈춤(dwell) + 감속(speed < threshold) + 필압의 함수
    const speedFactor = clamp(
      1 - speedPxPerSec / Math.max(1, preset.inkBloomSpeedThresholdPxPerSec),
      0,
      1,
    );
    const dwellFactor = clamp(
      (dwellMs - preset.inkBloomDwellThresholdMs * 0.65) /
        Math.max(1, preset.inkBloomDwellThresholdMs * 2.2),
      0,
      1,
    );
    const isTerminal = i === sanitized.length - 1 && sanitized.length > 1;
    const terminalBoost = isTerminal && dwellMs >= preset.inkBloomDwellThresholdMs ? 0.25 : 0;

    const rawBloomEnergy = clamp(
      (speedFactor * 0.52 + dwellFactor * 0.58 + decelerationRatio * 0.26 + terminalBoost) *
        preset.inkBloomIntensity *
        (0.65 + cur.pressure * 0.55),
      0,
      1.35,
    );
    const capillaryBloomRadiusPx =
      rawBloomEnergy > 0.08
        ? round3(preset.baseStrokeWidthPx * (0.45 + rawBloomEnergy * 2.15))
        : 0;
    const capillaryBloomOpacity = round3(clamp(rawBloomEnergy * 0.48, 0, 0.68));

    if (capillaryBloomRadiusPx >= preset.baseStrokeWidthPx * 0.72) {
      const reason: CapillaryBloomReason = isTerminal
        ? "terminal-lift"
        : dwellFactor >= speedFactor
          ? "pause-dwell"
          : "deceleration";
      bloomSpots.push({
        pointIndex: i,
        x: round3(jitteredX),
        y: round3(jitteredY),
        radiusPx: capillaryBloomRadiusPx,
        intensity: round3(clamp(rawBloomEnergy, 0, 1)),
        dwellMs: Math.round(dwellMs),
        reason,
      });
    }

    // 종이결 모서리 미세 페더링(fiber feathering)
    const fiberDensity = round3(
      clamp(preset.paperGrainTooth * (0.62 + (toothNoise + 1) * 0.24), 0, 1),
    );
    const paperFeatherSpreadPx = round3(
      preset.featherEdgeSpreadPx *
        fiberDensity *
        (0.55 + cur.pressure * 0.35 + capillaryBloomOpacity * 0.6),
    );

    if (paperFeatherSpreadPx >= 0.65) {
      const whiskerSign = toothNoise >= 0 ? 1 : -1;
      const whiskerAngleJitter = valueNoise1D(i * 1.91, normalizedSeed, 79) * 0.42;
      const cosA = Math.cos(whiskerAngleJitter);
      const sinA = Math.sin(whiskerAngleJitter);
      const wx = (nx * cosA - ny * sinA) * whiskerSign;
      const wy = (nx * sinA + ny * cosA) * whiskerSign;
      featherWhiskers.push({
        pointIndex: i,
        originX: round3(jitteredX),
        originY: round3(jitteredY),
        tipX: round3(jitteredX + wx * paperFeatherSpreadPx * 1.65),
        tipY: round3(jitteredY + wy * paperFeatherSpreadPx * 1.65),
        lengthPx: round3(paperFeatherSpreadPx * 1.65),
        opacity: round3(clamp(0.18 + fiberDensity * 0.42, 0.15, 0.65)),
      });
    }

    // 빠른 획에서의 비백(dry-brush skip) 계산
    const speedExcess = clamp((speedPxPerSec - 280) / 720, 0, 1);
    const drySkipNoise = (valueNoise1D(cumulativeArc * 0.19, normalizedSeed, 97) + 1) * 0.5;
    const drySkipGap = round3(
      clamp(
        speedExcess * preset.dryBrushSkipThreshold * (1.15 - cur.pressure * 0.55) * (0.55 + drySkipNoise * 0.7),
        0,
        0.92,
      ),
    );

    const widthNoise = valueNoise1D(spatialPhase * 0.85, normalizedSeed, 41);
    const effectiveWidthPx = round3(
      Math.max(
        0.55,
        preset.baseStrokeWidthPx *
          (0.45 + cur.pressure * 0.85) *
          (1 + widthNoise * preset.widthOrganicVariance) +
          capillaryBloomRadiusPx * 0.18,
      ),
    );

    jitterSum += jitterMagnitudePx;
    if (jitterMagnitudePx > maxJitterPx) maxJitterPx = jitterMagnitudePx;
    if (capillaryBloomRadiusPx > maxBloomRadiusPx) maxBloomRadiusPx = capillaryBloomRadiusPx;
    featherSum += paperFeatherSpreadPx;
    drySkipSum += drySkipGap;

    points.push({
      sourceIndex: i,
      x: round3(jitteredX),
      y: round3(jitteredY),
      sourceX: round3(cur.x),
      sourceY: round3(cur.y),
      jitterOffsetX: round3(jitterOffsetX),
      jitterOffsetY: round3(jitterOffsetY),
      jitterMagnitudePx: round3(jitterMagnitudePx),
      arcLengthPx: round3(cumulativeArc),
      speedPxPerSec: round3(speedPxPerSec),
      dwellMs: Math.round(dwellMs),
      pressure: round3(cur.pressure),
      effectiveWidthPx,
      capillaryBloomRadiusPx,
      capillaryBloomOpacity,
      paperFeatherSpreadPx,
      fiberDensity,
      drySkipGap,
    });
  }

  const count = points.length;
  const meanJitterPx = round3(jitterSum / count);
  const meanFeatherSpreadPx = round3(featherSum / count);
  const meanDrySkipRatio = round3(drySkipSum / count);

  const jitterScore = clamp((meanJitterPx / 1.4) * 34, 0, 38);
  const bloomScore = clamp((bloomSpots.length / Math.max(1, count * 0.35)) * 28, 0, 30);
  const featherScore = clamp((meanFeatherSpreadPx / 2.2) * 24, 0, 24);
  const skipScore = clamp(meanDrySkipRatio * 18, 0, 8);
  const organicHumanizationScore = Math.round(clamp(jitterScore + bloomScore + featherScore + skipScore + 14, 0, 100));
  const mechanicalUniformityResidual = Math.max(0, 100 - organicHumanizationScore);

  return {
    presetId,
    preset,
    seed: normalizedSeed,
    points,
    bloomSpots,
    featherWhiskers,
    metrics: {
      pointCount: count,
      totalArcLengthPx: round3(cumulativeArc),
      meanJitterPx,
      maxJitterPx: round3(maxJitterPx),
      bloomSpotCount: bloomSpots.length,
      maxBloomRadiusPx: round3(maxBloomRadiusPx),
      meanFeatherSpreadPx,
      meanDrySkipRatio,
      organicHumanizationScore,
      mechanicalUniformityResidual,
    },
    svgPathData: buildSvgPolylinePath(points),
    sourceSvgPathData: buildSvgPolylinePath(sanitized),
  };
}
