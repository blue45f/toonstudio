/**
 * Wave 133 — 웹툰 3-심도 대기 원근·Beer-Lambert 산란 안개·5종 날씨 파티클 &
 * 주인공 얼굴·말풍선 무가림 연출 엔진 타입·프리셋·순수 ES2017 SHA-256 계약.
 *
 * - strict ES2017 호환 (`any`·`0n`·`/s` 플래그 미사용, `verbatimModuleSyntax` 준수).
 */

export const WEATHER_PRESET_IDS = [
  "cherry-blossom-gust",
  "monsoon-neon-rain",
  "silent-winter-snow",
  "sunlit-classroom-dust",
  "battlefield-embers",
] as const;

export type WeatherPresetId = (typeof WEATHER_PRESET_IDS)[number];

export const DEPTH_LAYER_IDS = ["foreground", "midground", "background"] as const;

export type DepthLayerId = (typeof DEPTH_LAYER_IDS)[number];

export type WeatherParticleShape =
  | "petal"
  | "rain-streak"
  | "snowflake"
  | "dust-mote"
  | "ember-spark";

export interface DepthLayerRangeMeters {
  readonly minMeters: number;
  readonly maxMeters: number;
}

export const DEPTH_LAYER_BOUNDS_METERS: Readonly<Record<DepthLayerId, DepthLayerRangeMeters>> = {
  foreground: { minMeters: 0.8, maxMeters: 2.2 },
  midground: { minMeters: 2.2, maxMeters: 6.0 },
  background: { minMeters: 6.0, maxMeters: 20.0 },
};

export interface OklchColorSpec {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

export interface WeatherPresetSpec {
  readonly id: WeatherPresetId;
  readonly labelKo: string;
  readonly moodSummaryKo: string;
  readonly shape: WeatherParticleShape;
  readonly shaderShapeMode: number;
  readonly defaultParticleBudget: number;
  readonly defaultExtinctionBeta: number;
  readonly defaultFocusStartMeters: number;
  readonly defaultFocalDepthMeters: number;
  readonly defaultWindX: number;
  readonly defaultWindY: number;
  readonly baseGravityPxPerSec: number;
  readonly turbulenceAmpPxPerSec: number;
  readonly baseRadiusPx: number;
  readonly baseStreakFactor: number;
  readonly reducedMotionMaxStreakPx: number;
  readonly defaultFlickerHz: number;
  readonly bokehApertureGain: number;
  readonly fogOklch: OklchColorSpec;
  readonly fogLinearRgb: readonly [number, number, number];
  readonly particlePrimaryOklch: OklchColorSpec;
  readonly particleAccentOklch: OklchColorSpec;
  readonly skyBackdropOklch: OklchColorSpec;
}

export const WEATHER_PRESETS: Readonly<Record<WeatherPresetId, WeatherPresetSpec>> = {
  "cherry-blossom-gust": {
    id: "cherry-blossom-gust",
    labelKo: "벚꽃 돌풍",
    moodSummaryKo: "봄바람에 사선으로 흩날리는 분홍 꽃잎과 부드러운 연분홍 대기 안개",
    shape: "petal",
    shaderShapeMode: 0,
    defaultParticleBudget: 90,
    defaultExtinctionBeta: 0.055,
    defaultFocusStartMeters: 2.2,
    defaultFocalDepthMeters: 3.8,
    defaultWindX: 145,
    defaultWindY: 18,
    baseGravityPxPerSec: 82,
    turbulenceAmpPxPerSec: 26,
    baseRadiusPx: 7.2,
    baseStreakFactor: 0.08,
    reducedMotionMaxStreakPx: 14,
    defaultFlickerHz: 2.4,
    bokehApertureGain: 3.4,
    fogOklch: { l: 0.935, c: 0.032, h: 12 },
    fogLinearRgb: [0.92, 0.85, 0.87],
    particlePrimaryOklch: { l: 0.845, c: 0.095, h: 356 },
    particleAccentOklch: { l: 0.942, c: 0.042, h: 8 },
    skyBackdropOklch: { l: 0.955, c: 0.018, h: 24 },
  },
  "monsoon-neon-rain": {
    id: "monsoon-neon-rain",
    labelKo: "네온 폭우",
    moodSummaryKo: "야간 도심 네온 반사가 스민 사선 폭우 빗줄기와 짙은 습기 산란층",
    shape: "rain-streak",
    shaderShapeMode: 1,
    defaultParticleBudget: 120,
    defaultExtinctionBeta: 0.115,
    defaultFocusStartMeters: 2.2,
    defaultFocalDepthMeters: 3.8,
    defaultWindX: 168,
    defaultWindY: 42,
    baseGravityPxPerSec: 520,
    turbulenceAmpPxPerSec: 18,
    baseRadiusPx: 2.2,
    baseStreakFactor: 0.125,
    reducedMotionMaxStreakPx: 20,
    defaultFlickerHz: 6.0,
    bokehApertureGain: 3.9,
    fogOklch: { l: 0.34, c: 0.068, h: 248 },
    fogLinearRgb: [0.16, 0.24, 0.38],
    particlePrimaryOklch: { l: 0.82, c: 0.115, h: 208 },
    particleAccentOklch: { l: 0.76, c: 0.165, h: 328 },
    skyBackdropOklch: { l: 0.24, c: 0.045, h: 256 },
  },
  "silent-winter-snow": {
    id: "silent-winter-snow",
    labelKo: "함박눈",
    moodSummaryKo: "차분히 내려앉는 큰 눈송이와 청백색 겨울 대기 원근층",
    shape: "snowflake",
    shaderShapeMode: 2,
    defaultParticleBudget: 96,
    defaultExtinctionBeta: 0.088,
    defaultFocusStartMeters: 2.2,
    defaultFocalDepthMeters: 3.8,
    defaultWindX: 48,
    defaultWindY: 10,
    baseGravityPxPerSec: 64,
    turbulenceAmpPxPerSec: 22,
    baseRadiusPx: 6.4,
    baseStreakFactor: 0.05,
    reducedMotionMaxStreakPx: 10,
    defaultFlickerHz: 1.5,
    bokehApertureGain: 4.1,
    fogOklch: { l: 0.905, c: 0.022, h: 232 },
    fogLinearRgb: [0.84, 0.89, 0.94],
    particlePrimaryOklch: { l: 0.985, c: 0.008, h: 230 },
    particleAccentOklch: { l: 0.885, c: 0.036, h: 225 },
    skyBackdropOklch: { l: 0.835, c: 0.026, h: 238 },
  },
  "sunlit-classroom-dust": {
    id: "sunlit-classroom-dust",
    labelKo: "교실 빛내림 먼지",
    moodSummaryKo: "오후 창가 햇살 기둥 속에서 천천히 부유하는 금빛 미세 먼지 입자",
    shape: "dust-mote",
    shaderShapeMode: 3,
    defaultParticleBudget: 84,
    defaultExtinctionBeta: 0.042,
    defaultFocusStartMeters: 2.2,
    defaultFocalDepthMeters: 3.8,
    defaultWindX: 28,
    defaultWindY: -6,
    baseGravityPxPerSec: 18,
    turbulenceAmpPxPerSec: 12,
    baseRadiusPx: 4.2,
    baseStreakFactor: 0.04,
    reducedMotionMaxStreakPx: 8,
    defaultFlickerHz: 1.8,
    bokehApertureGain: 3.6,
    fogOklch: { l: 0.925, c: 0.048, h: 82 },
    fogLinearRgb: [0.95, 0.88, 0.72],
    particlePrimaryOklch: { l: 0.93, c: 0.098, h: 86 },
    particleAccentOklch: { l: 0.975, c: 0.055, h: 92 },
    skyBackdropOklch: { l: 0.915, c: 0.032, h: 78 },
  },
  "battlefield-embers": {
    id: "battlefield-embers",
    labelKo: "전장 불티",
    moodSummaryKo: "열기 상승 기류를 타고 솟구치는 주황 불티와 짙은 전장 연기 산란층",
    shape: "ember-spark",
    shaderShapeMode: 4,
    defaultParticleBudget: 105,
    defaultExtinctionBeta: 0.145,
    defaultFocusStartMeters: 2.2,
    defaultFocalDepthMeters: 3.8,
    defaultWindX: 112,
    defaultWindY: -36,
    baseGravityPxPerSec: -165,
    turbulenceAmpPxPerSec: 34,
    baseRadiusPx: 4.6,
    baseStreakFactor: 0.095,
    reducedMotionMaxStreakPx: 16,
    defaultFlickerHz: 5.5,
    bokehApertureGain: 3.8,
    fogOklch: { l: 0.31, c: 0.055, h: 36 },
    fogLinearRgb: [0.34, 0.19, 0.13],
    particlePrimaryOklch: { l: 0.78, c: 0.185, h: 48 },
    particleAccentOklch: { l: 0.91, c: 0.142, h: 76 },
    skyBackdropOklch: { l: 0.22, c: 0.038, h: 32 },
  },
};

export interface KeepOutBoxInput {
  readonly id?: string;
  readonly labelKo?: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly marginPx?: number;
}

export interface NormalizedKeepOutBox {
  readonly id: string;
  readonly kind: "face" | "balloon";
  readonly labelKo: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly marginPx: number;
}

export interface AtmosphericTransmittanceSample {
  readonly depthMeters: number;
  readonly effectiveDistanceMeters: number;
  readonly extinctionBeta: number;
  readonly focusStartMeters: number;
  readonly transmittance: number;
  readonly fogBlend: number;
}

export interface AtmosphericFogBand {
  readonly bandIndex: number;
  readonly depthMeters: number;
  readonly transmittance: number;
  readonly fogBlend: number;
  readonly hazeOklchCss: string;
}

export interface AtmosphericWeatherParticle {
  readonly id: number;
  readonly layer: DepthLayerId;
  readonly shape: WeatherParticleShape;
  readonly depthMeters: number;
  readonly x: number;
  readonly y: number;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly vxPxPerSec: number;
  readonly vyPxPerSec: number;
  readonly speedPxPerSec: number;
  readonly tiltDeg: number;
  readonly radiusPx: number;
  readonly streakLengthPx: number;
  readonly bokehBlurPx: number;
  readonly transmittance: number;
  readonly fogBlend: number;
  readonly opacity: number;
  readonly motionJitterPx: number;
  readonly relocationStatus: "original" | "relocated";
  readonly colorOklchCss: string;
}

export interface DepthLayerSummaryMetrics {
  readonly layer: DepthLayerId;
  readonly count: number;
  readonly minDepthMeters: number;
  readonly maxDepthMeters: number;
  readonly meanDepthMeters: number;
  readonly meanRadiusPx: number;
  readonly meanSpeedPxPerSec: number;
  readonly meanBokehBlurPx: number;
  readonly meanTransmittance: number;
  readonly meanFogBlend: number;
}

export interface KeepOutOcclusionAudit {
  readonly faceOcclusionCount: number;
  readonly balloonOcclusionCount: number;
  readonly heroFaceAndBalloonOcclusionCount: number;
  readonly collidingParticleIds: readonly number[];
}

export interface AtmosphericWeatherInvariants {
  readonly transmittanceStrictlyMonotonic: boolean;
  readonly sizeHierarchyValid: boolean;
  readonly speedHierarchyValid: boolean;
  readonly midgroundSharpestBokeh: boolean;
  readonly zeroFaceAndBalloonOcclusion: boolean;
  readonly reducedMotionSafe: boolean;
}

export interface AtmosphericWeatherFieldRequest {
  readonly presetId: WeatherPresetId;
  readonly viewportWidthPx?: number;
  readonly viewportHeightPx?: number;
  readonly seed?: number;
  readonly particleBudget?: number;
  readonly windX?: number;
  readonly windY?: number;
  readonly extinctionBeta?: number;
  readonly focusStartMeters?: number;
  readonly focalDepthMeters?: number;
  readonly faceKeepOutBoxes?: readonly KeepOutBoxInput[];
  readonly balloonKeepOutBoxes?: readonly KeepOutBoxInput[];
  readonly keepOutPaddingPx?: number;
  readonly prefersReducedMotion?: boolean;
  readonly elapsedSeconds?: number;
}

export interface AtmosphericWeatherFieldResult {
  readonly schemaVersion: "wave133-weather-field-v1";
  readonly presetId: WeatherPresetId;
  readonly preset: WeatherPresetSpec;
  readonly seed: number;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly extinctionBeta: number;
  readonly focusStartMeters: number;
  readonly focalDepthMeters: number;
  readonly effectiveWindX: number;
  readonly effectiveWindY: number;
  readonly prefersReducedMotion: boolean;
  readonly animatedFlickerHz: number;
  readonly maxMotionJitterPx: number;
  readonly requestedParticleBudget: number;
  readonly particles: readonly AtmosphericWeatherParticle[];
  readonly relocatedCount: number;
  readonly culledCount: number;
  readonly faceKeepOutBoxes: readonly NormalizedKeepOutBox[];
  readonly balloonKeepOutBoxes: readonly NormalizedKeepOutBox[];
  readonly occlusionAudit: KeepOutOcclusionAudit;
  readonly heroFaceAndBalloonOcclusionCount: number;
  readonly layerMetrics: Readonly<Record<DepthLayerId, DepthLayerSummaryMetrics>>;
  readonly transmittanceCurve: readonly AtmosphericTransmittanceSample[];
  readonly fogBands: readonly AtmosphericFogBand[];
  readonly invariants: AtmosphericWeatherInvariants;
  readonly weatherFieldSha256Hex: string;
}

/** 안전한 유한 숫자 클램프(NaN·Infinity 차단). */
export function clampFinite(value: number, min: number, max: number, fallback: number): number {
  const candidate = Number.isFinite(value) ? value : fallback;
  if (candidate < min) return min;
  if (candidate > max) return max;
  return Object.is(candidate, -0) ? 0 : candidate;
}

/** 숫자를 고정 소수점 문자열로 안전하게 직렬화한다. */
export function formatSafeDecimal(value: number, digits: number, fallback: number = 0): string {
  const safe = Number.isFinite(value) ? value : fallback;
  const normalized = Object.is(safe, -0) || Math.abs(safe) < 1e-12 ? 0 : safe;
  return normalized.toFixed(digits);
}

/** OKLCH 색상 명세를 CSS `oklch(...)` 문자열로 직렬화한다. */
export function formatOklchCss(color: OklchColorSpec, alpha?: number): string {
  const l = clampFinite(color.l, 0, 1, 0.5);
  const c = clampFinite(color.c, 0, 0.4, 0.04);
  const h = ((clampFinite(color.h, -3600, 3600, 0) % 360) + 360) % 360;
  if (alpha !== undefined && Number.isFinite(alpha) && alpha < 0.999) {
    const a = clampFinite(alpha, 0, 1, 1);
    return `oklch(${formatSafeDecimal(l, 4)} ${formatSafeDecimal(c, 4)} ${formatSafeDecimal(h, 1)} / ${formatSafeDecimal(a, 3)})`;
  }
  return `oklch(${formatSafeDecimal(l, 4)} ${formatSafeDecimal(c, 4)} ${formatSafeDecimal(h, 1)})`;
}

/** 문자열이 유효한 정규 날씨 프리셋 ID인지 판별한다. */
export function isWeatherPresetId(value: string): value is WeatherPresetId {
  return (WEATHER_PRESET_IDS as readonly string[]).includes(value);
}

/** 정규 날씨 프리셋 명세를 반환한다(미등록 ID는 `cherry-blossom-gust`로 안전 폴백). */
export function getWeatherPreset(presetId: string): WeatherPresetSpec {
  if (isWeatherPresetId(presetId)) {
    return WEATHER_PRESETS[presetId];
  }
  return WEATHER_PRESETS["cherry-blossom-gust"];
}

/** 5종 정규 웹툰 날씨 프리셋 목록을 반환한다. */
export function listWeatherPresets(): readonly WeatherPresetSpec[] {
  return WEATHER_PRESET_IDS.map((id) => WEATHER_PRESETS[id]);
}

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function encodeUtf8Bytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let codePoint = text.charCodeAt(i);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePoint = 0x10000 + ((codePoint - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function uint32ToHex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

/** 외부 의존성 없는 순수 동기 ES2017 FIPS 180-4 SHA-256 16진수 해시. */
export function sha256Wave133Hex(input: string | Uint8Array): string {
  const raw = typeof input === "string" ? encodeUtf8Bytes(input) : input;
  const byteLength = raw.length;
  const paddedLength = Math.ceil((byteLength + 9) / 64) * 64;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(raw, 0);
  buffer[byteLength] = 0x80;

  const view = new DataView(buffer.buffer);
  view.setUint32(paddedLength - 8, Math.floor(byteLength / 0x20000000), false);
  view.setUint32(paddedLength - 4, (byteLength << 3) >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = (rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const s1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ ((~e >>> 0) & g)) >>> 0;
      const temp1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return (
    uint32ToHex(h0) +
    uint32ToHex(h1) +
    uint32ToHex(h2) +
    uint32ToHex(h3) +
    uint32ToHex(h4) +
    uint32ToHex(h5) +
    uint32ToHex(h6) +
    uint32ToHex(h7)
  );
}

/** 객체 키를 사전순으로 정규화해 결정론적 JSON 문자열을 만든다. */
export function canonicalizeWeatherManifestJson(value: unknown): string {
  if (value === null) return "null";
  const valueType = typeof value;
  if (valueType === "boolean") return value ? "true" : "false";
  if (valueType === "number") {
    const num = value as number;
    if (!Number.isFinite(num)) return "null";
    return Object.is(num, -0) ? "0" : JSON.stringify(num);
  }
  if (valueType === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    const items = value.map((entry) =>
      entry === undefined ? "null" : canonicalizeWeatherManifestJson(entry),
    );
    return `[${items.join(",")}]`;
  }
  if (valueType === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    const pairs = keys.map(
      (key) => `${JSON.stringify(key)}:${canonicalizeWeatherManifestJson(record[key])}`,
    );
    return `{${pairs.join(",")}}`;
  }
  return "null";
}
