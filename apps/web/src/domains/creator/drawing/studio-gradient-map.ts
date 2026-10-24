/**
 * studio-gradient-map.ts
 *
 * CSP식 그라데이션 맵 색보정 모델.
 * 명도(밝기) → 컬러 그라데이션 매핑: 픽셀의 밝기를 그라데이션 상의 위치로 보고
 * 해당 색으로 치환한다. 명암 구조는 유지하고 색감만 바꾸는 방식.
 *
 * 설계:
 * - 프리셋 5종 (석양/심해/세피아/사이버펑크/모노크롬) + 커스텀 편집 모델
 * - 적용은 룩업테이블(LUT, 기본 256) 기반 → ImageData 한 번 순회로 O(N)
 * - 전부 순수 함수 (Uint8ClampedArray), Canvas ImageData와 직접 호환
 */

/** 그라데이션 정지점. position 0..1, color 0..255 RGB. */
export interface StudioGradientStop {
  readonly position: number;
  readonly color: readonly [number, number, number];
}

export type StudioGradientMapPresetId =
  | "sunset"
  | "deep-sea"
  | "sepia"
  | "cyberpunk"
  | "monochrome"
  | "webtoon-dawn"
  | "cel-anime-shadow"
  | "noir-crimson";

export interface StudioGradientMapPreset {
  readonly id: StudioGradientMapPresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  /** 어두움(0) → 밝음(1) 순서. */
  readonly stops: ReadonlyArray<StudioGradientStop>;
}

/** 기본 프리셋 5종. */
export const STUDIO_GRADIENT_MAP_PRESETS: ReadonlyArray<StudioGradientMapPreset> =
  Object.freeze([
    {
      id: "sunset",
      labelKo: "석양",
      labelEn: "Sunset",
      descriptionKo: "짙은 남색 그림자에서 주황빛 하이라이트로. 노을 장면에.",
      descriptionEn: "Deep navy shadows to orange highlights. For sunset scenes.",
      stops: [
        { position: 0, color: [25, 16, 66] },
        { position: 0.35, color: [122, 44, 96] },
        { position: 0.65, color: [232, 110, 68] },
        { position: 1, color: [255, 224, 178] },
      ],
    },
    {
      id: "deep-sea",
      labelKo: "심해",
      labelEn: "Deep sea",
      descriptionKo: "먹빛 심연에서 청록빛 수면으로. 밤·수중 장면에.",
      descriptionEn: "Inky abyss to teal surface. For night and underwater scenes.",
      stops: [
        { position: 0, color: [4, 12, 24] },
        { position: 0.4, color: [12, 52, 84] },
        { position: 0.7, color: [24, 128, 148] },
        { position: 1, color: [178, 236, 224] },
      ],
    },
    {
      id: "sepia",
      labelKo: "세피아",
      labelEn: "Sepia",
      descriptionKo: "갈색 톤의 회상 장면. 오래된 사진 느낌.",
      descriptionEn: "Brownish flashback tone. Aged-photo feel.",
      stops: [
        { position: 0, color: [42, 28, 16] },
        { position: 0.5, color: [128, 92, 52] },
        { position: 1, color: [244, 224, 188] },
      ],
    },
    {
      id: "cyberpunk",
      labelKo: "사이버펑크",
      labelEn: "Cyberpunk",
      descriptionKo: "마젠타 그림자 + 시안 하이라이트. 네온 도시의 밤.",
      descriptionEn: "Magenta shadows, cyan highlights. Neon city nights.",
      stops: [
        { position: 0, color: [24, 8, 44] },
        { position: 0.35, color: [128, 24, 148] },
        { position: 0.65, color: [32, 196, 220] },
        { position: 1, color: [255, 244, 214] },
      ],
    },
    {
      id: "monochrome",
      labelKo: "모노크롬",
      labelEn: "Monochrome",
      descriptionKo: "순수 흑백. 잉크 만화·명암 교정에.",
      descriptionEn: "Pure black and white. For ink manga and value checks.",
      stops: [
        { position: 0, color: [0, 0, 0] },
        { position: 1, color: [255, 255, 255] },
      ],
    },
  ]);

/** 웹툰·셀 애니메이션 특화 확장 프리셋 3종. */
export const STUDIO_WEBTOON_GRADIENT_MAP_PRESETS: ReadonlyArray<StudioGradientMapPreset> =
  Object.freeze([
    {
      id: "webtoon-dawn",
      labelKo: "웹툰 새벽녘",
      labelEn: "Webtoon Dawn",
      descriptionKo: "자주빛 새벽 공기에서 살구빛 아침 햇살로 이어지는 감성 톤.",
      descriptionEn: "Violet dawn air transitioning into warm apricot morning light.",
      stops: [
        { position: 0, color: [22, 18, 52] },
        { position: 0.38, color: [88, 64, 136] },
        { position: 0.72, color: [226, 142, 148] },
        { position: 1, color: [255, 241, 218] },
      ],
    },
    {
      id: "cel-anime-shadow",
      labelKo: "셀 애니 그림자",
      labelEn: "Cel Anime Shadow",
      descriptionKo: "쿨톤 코발트 암부와 맑은 아이보리 명부의 셀 채색 그레이딩.",
      descriptionEn: "Cool cobalt shadows and crisp ivory highlights for cel shading.",
      stops: [
        { position: 0, color: [18, 24, 58] },
        { position: 0.45, color: [76, 98, 164] },
        { position: 0.78, color: [232, 198, 184] },
        { position: 1, color: [255, 250, 242] },
      ],
    },
    {
      id: "noir-crimson",
      labelKo: "느와르 크림슨",
      labelEn: "Noir Crimson",
      descriptionKo: "칠흑 같은 암부 위에 핏빛 중간톤과 창백한 하이라이트를 얹는 스릴러 톤.",
      descriptionEn: "Pitch-black shadows with crimson midtones and pale highlights.",
      stops: [
        { position: 0, color: [8, 6, 12] },
        { position: 0.42, color: [132, 18, 36] },
        { position: 0.8, color: [218, 92, 78] },
        { position: 1, color: [248, 236, 232] },
      ],
    },
  ]);

export const STUDIO_ALL_GRADIENT_MAP_PRESETS: ReadonlyArray<StudioGradientMapPreset> =
  Object.freeze([...STUDIO_GRADIENT_MAP_PRESETS, ...STUDIO_WEBTOON_GRADIENT_MAP_PRESETS]);

export function getGradientMapPreset(
  id: StudioGradientMapPresetId,
): StudioGradientMapPreset | undefined {
  return STUDIO_ALL_GRADIENT_MAP_PRESETS.find((p) => p.id === id);
}

/* ------------------------------------------------------------------ */
/* 검증·편집 모델                                                         */
/* ------------------------------------------------------------------ */

export function validateGradientStops(
  stops: ReadonlyArray<StudioGradientStop>,
): { readonly ok: boolean; readonly errors: ReadonlyArray<string> } {
  const errors: string[] = [];
  if (stops.length < 2) errors.push("정지점은 2개 이상이어야 합니다.");
  if (stops.length > 16) errors.push("정지점은 16개 이하여야 합니다.");
  for (const stop of stops) {
    if (!Number.isFinite(stop.position) || stop.position < 0 || stop.position > 1) {
      errors.push("정지점 위치는 0..1 범위여야 합니다.");
      break;
    }
    for (const c of stop.color) {
      if (!Number.isFinite(c) || c < 0 || c > 255) {
        errors.push("색상 채널은 0..255 범위여야 합니다.");
        break;
      }
    }
  }
  const positions = stops.map((s) => s.position);
  const sorted = [...positions].sort((a, b) => a - b);
  for (let i = 0; i < positions.length; i += 1) {
    if (positions[i] !== sorted[i]) {
      errors.push("정지점은 위치 오름차순이어야 합니다.");
      break;
    }
  }
  if (new Set(positions.map((p) => p.toFixed(6))).size !== positions.length) {
    errors.push("정지점 위치가 중복됩니다.");
  }
  return { ok: errors.length === 0, errors: Object.freeze(errors) };
}

/** 정지점 정렬 (위치 오름차순). */
export function sortGradientStops(
  stops: ReadonlyArray<StudioGradientStop>,
): StudioGradientStop[] {
  return [...stops].sort((a, b) => a.position - b.position);
}

/**
 * 커스텀 그라데이션 편집 모델.
 * 불변 스냅샷 + 순수 연산 (add/move/remove/recolor).
 */
export interface StudioCustomGradientModel {
  readonly stops: ReadonlyArray<StudioGradientStop>;
  readonly addStop: (stop: StudioGradientStop) => StudioCustomGradientModel;
  readonly moveStop: (index: number, position: number) => StudioCustomGradientModel;
  readonly recolorStop: (
    index: number,
    color: readonly [number, number, number],
  ) => StudioCustomGradientModel;
  readonly removeStop: (index: number) => StudioCustomGradientModel;
}

function makeCustomGradientModel(
  stops: ReadonlyArray<StudioGradientStop>,
): StudioCustomGradientModel {
  const normalized = sortGradientStops(stops);
  return {
    stops: Object.freeze(normalized),
    addStop: (stop) => makeCustomGradientModel([...normalized, stop]),
    moveStop: (index, position) =>
      makeCustomGradientModel(
        normalized.map((s, i) => (i === index ? { ...s, position } : s)),
      ),
    recolorStop: (index, color) =>
      makeCustomGradientModel(
        normalized.map((s, i) => (i === index ? { ...s, color } : s)),
      ),
    removeStop: (index) =>
      makeCustomGradientModel(normalized.filter((_, i) => i !== index)),
  };
}

/** 프리셋에서 시작하는 커스텀 모델 생성. */
export function createCustomGradientModel(
  initial: ReadonlyArray<StudioGradientStop>,
): StudioCustomGradientModel {
  return makeCustomGradientModel(initial);
}

/* ------------------------------------------------------------------ */
/* LUT 빌드 + 적용 (성능: 룩업테이블 & 지각적 OKLab 색공간 보간)             */
/* ------------------------------------------------------------------ */

export const STUDIO_GRADIENT_MAP_LUT_SIZE = 256;

export type StudioGradientInterpolationSpace = "srgb" | "oklab";

export interface BuildGradientMapLutOptions {
  readonly interpolationSpace?: StudioGradientInterpolationSpace;
}

function srgbByteToLinear(byte: number): number {
  const u = Math.max(0, Math.min(255, byte)) / 255;
  return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
}

function linearToSrgbByte(linear: number): number {
  const clamped = Math.max(0, Math.min(1, linear));
  const u = clamped <= 0.0031308
    ? 12.92 * clamped
    : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(u * 255)));
}

function rgbBytesToOklab(rgb: readonly [number, number, number]): readonly [number, number, number] {
  const r = srgbByteToLinear(rgb[0]);
  const g = srgbByteToLinear(rgb[1]);
  const b = srgbByteToLinear(rgb[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToRgbBytes(L: number, a: number, b: number): readonly [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [linearToSrgbByte(rLin), linearToSrgbByte(gLin), linearToSrgbByte(bLin)];
}

/**
 * 정지점 → RGB LUT 빌드. size*3 길이 Uint8Array (R,G,B 연속).
 * 기본은 sRGB 선형 보간이며, `options.interpolationSpace = "oklab"` 지정 시
 * 지각적 균일 색공간(OKLab)에서 보간해 보색 구간의 회색 탁 현상을 방지한다.
 */
export function buildGradientMapLut(
  stops: ReadonlyArray<StudioGradientStop>,
  size: number = STUDIO_GRADIENT_MAP_LUT_SIZE,
  options: BuildGradientMapLutOptions = {},
): Uint8Array {
  const sorted = sortGradientStops(stops);
  const lut = new Uint8Array(Math.max(2, Math.floor(size)) * 3);
  const n = lut.length / 3;
  const useOklab = options.interpolationSpace === "oklab";
  for (let i = 0; i < n; i += 1) {
    const t = n === 1 ? 0 : i / (n - 1);
    let left = sorted[0]!;
    let right = sorted[sorted.length - 1]!;
    for (let s = 0; s < sorted.length - 1; s += 1) {
      if (t >= sorted[s]!.position && t <= sorted[s + 1]!.position) {
        left = sorted[s]!;
        right = sorted[s + 1]!;
        break;
      }
    }
    const span = right.position - left.position;
    const f = span <= 0 ? 0 : (t - left.position) / span;
    if (useOklab) {
      const labL = rgbBytesToOklab(left.color);
      const labR = rgbBytesToOklab(right.color);
      const L = labL[0] + (labR[0] - labL[0]) * f;
      const cL = Math.hypot(labL[1], labL[2]);
      const cR = Math.hypot(labR[1], labR[2]);
      let a: number;
      let b: number;
      if (cL > 0.02 && cR > 0.02) {
        const hL = Math.atan2(labL[2], labL[1]);
        const hR = Math.atan2(labR[2], labR[1]);
        let dh = hR - hL;
        if (dh > Math.PI) dh -= Math.PI * 2;
        else if (dh < -Math.PI) dh += Math.PI * 2;
        const h = hL + dh * f;
        const C = cL + (cR - cL) * f;
        a = C * Math.cos(h);
        b = C * Math.sin(h);
      } else {
        a = labL[1] + (labR[1] - labL[1]) * f;
        b = labL[2] + (labR[2] - labL[2]) * f;
      }
      const rgb = oklabToRgbBytes(L, a, b);
      lut[i * 3] = rgb[0];
      lut[i * 3 + 1] = rgb[1];
      lut[i * 3 + 2] = rgb[2];
    } else {
      for (let c = 0; c < 3; c += 1) {
        lut[i * 3 + c] = Math.round(left.color[c]! + (right.color[c]! - left.color[c]!) * f);
      }
    }
  }
  return lut;
}

/**
 * OKLab 보간 LUT와 sRGB 보간 LUT의 중간톤 평균 채도(Chroma) 유지율을 비교 계측한다.
 */
export function evaluateGradientMapOklabChromaRetention(
  stops: ReadonlyArray<StudioGradientStop>,
): {
  readonly srgbMeanChroma: number;
  readonly oklabMeanChroma: number;
  readonly retentionRatio: number;
  readonly chromaGainRatio: number;
} {
  const srgbLut = buildGradientMapLut(stops, 64, { interpolationSpace: "srgb" });
  const oklabLut = buildGradientMapLut(stops, 64, { interpolationSpace: "oklab" });
  let srgbSum = 0;
  let oklabSum = 0;
  for (let i = 0; i < 64; i += 1) {
    const labS = rgbBytesToOklab([srgbLut[i * 3]!, srgbLut[i * 3 + 1]!, srgbLut[i * 3 + 2]!]);
    const labO = rgbBytesToOklab([oklabLut[i * 3]!, oklabLut[i * 3 + 1]!, oklabLut[i * 3 + 2]!]);
    srgbSum += Math.hypot(labS[1], labS[2]);
    oklabSum += Math.hypot(labO[1], labO[2]);
  }
  const srgbMeanChroma = srgbSum / 64;
  const oklabMeanChroma = oklabSum / 64;
  const ratio = srgbMeanChroma > 1e-6 ? oklabMeanChroma / srgbMeanChroma : 1;
  return {
    srgbMeanChroma,
    oklabMeanChroma,
    retentionRatio: ratio,
    chromaGainRatio: ratio,
  };
}

/** Rec.601 명도 → 0..1. */
export function luminanceOf(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

const BAYER_4X4 = [
  -0.4375, 0.0625, -0.3125, 0.1875,
  0.3125, -0.1875, 0.4375, -0.0625,
  -0.25, 0.25, -0.375, 0.125,
  0.5, 0.0, 0.375, -0.125,
] as const;

export interface ApplyGradientMapOptions {
  /** true면 알파를 유지한다 (기본 true). */
  readonly preserveAlpha?: boolean;
  /** 원본 픽셀과의 혼합 비율 0..1 (기본 1 = 100% 그라데이션 맵 적용). */
  readonly blendAmount?: number;
  /** true면 8비트 계조 밴딩 억제를 위한 결정론적 Bayer 4×4 디더링을 적용한다. */
  readonly dither?: boolean;
  /** `dither = true` 일 때 2D 격자 인덱싱용 픽셀 너비. */
  readonly width?: number;
}

/**
 * RGBA 버퍼에 그라데이션 맵 적용. 새 Uint8ClampedArray 반환 (원본 불변).
 * 명도 → LUT 인덱스로 매핑. 알파는 기본 유지.
 */
export function applyGradientMapToRgba(
  rgba: Uint8ClampedArray,
  lut: Uint8Array,
  options: ApplyGradientMapOptions = {},
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  const entries = Math.floor(lut.length / 3);
  const preserveAlpha = options.preserveAlpha ?? true;
  const blend = options.blendAmount !== undefined && Number.isFinite(options.blendAmount)
    ? Math.max(0, Math.min(1, options.blendAmount))
    : 1;
  const useDither = options.dither === true;
  const rowWidth = options.width && options.width > 0 ? Math.floor(options.width) : 0;

  for (let i = 0; i + 3 < rgba.length + 1; i += 4) {
    const r0 = rgba[i]!;
    const g0 = rgba[i + 1]!;
    const b0 = rgba[i + 2]!;
    const lum = luminanceOf(r0, g0, b0);
    let scaled = lum * (entries - 1);
    if (useDither) {
      const pixelIndex = i >> 2;
      const x = rowWidth > 0 ? pixelIndex % rowWidth : pixelIndex;
      const y = rowWidth > 0 ? Math.floor(pixelIndex / rowWidth) : 0;
      scaled += BAYER_4X4[((y & 3) << 2) | (x & 3)]!;
    }
    const idx = Math.max(0, Math.min(entries - 1, Math.round(scaled)));
    const mr = lut[idx * 3]!;
    const mg = lut[idx * 3 + 1]!;
    const mb = lut[idx * 3 + 2]!;
    out[i] = blend >= 1 ? mr : Math.round(r0 + (mr - r0) * blend);
    out[i + 1] = blend >= 1 ? mg : Math.round(g0 + (mg - g0) * blend);
    out[i + 2] = blend >= 1 ? mb : Math.round(b0 + (mb - b0) * blend);
    out[i + 3] = preserveAlpha ? rgba[i + 3]! : 255;
  }
  return out;
}

/**
 * hex(#rrggbb) 정지점 목록 → LUT. UI 컬러피커 연동용.
 */
export function buildLutFromHexStops(
  stops: ReadonlyArray<{ readonly position: number; readonly hex: string }>,
  options: BuildGradientMapLutOptions = {},
): Uint8Array {
  const parsed: StudioGradientStop[] = stops.map((s) => {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(s.hex.trim());
    const v = m ? parseInt(m[1]!, 16) : 0;
    return {
      position: s.position,
      color: [(v >> 16) & 255, (v >> 8) & 255, v & 255] as const,
    };
  });
  return buildGradientMapLut(parsed, STUDIO_GRADIENT_MAP_LUT_SIZE, options);
}

/** RGB → "#rrggbb". */
export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number): string =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

