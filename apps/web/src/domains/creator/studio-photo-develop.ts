/**
 * Studio Photo Develop — 사진 전처리(현상) 엔진.
 *
 * 사진 LT(선 추출)·배경 가져오기에 사진을 넣기 "전에" 거치는 비파괴
 * 전처리 단계다. 원본 버퍼는 절대 건드리지 않고 새 버퍼를 반환하므로,
 * 전처리를 껐다 켜도 원본 사진은 그대로 남는다(되돌리기 = 설정만 해제).
 *
 * 다루는 결함 보정은 세 가지뿐이다:
 * - 대비(contrast): 중간점을 기준으로 명암 간격을 넓히거나 좁힌다.
 * - 안개 제거(dehaze): 휘도 5~95 백분위 구간을 전 구간으로 펴는
 *   블랙/화이트 포인트 스트레치 + 채도 소폭 상승. 뿌연 사진의 윤곽을
 *   선 추출기가 잡을 수 있게 되살리는 것이 목적이다.
 * - 화이트밸런스(whiteBalance): 광원 프리셋 게인 또는 자동(그레이 월드)
 *   으로 색온도 캐스트를 걷어낸다.
 *
 * ── '색감 맞추기'(StudioColorMatchPanel)와 역할 경계 ──
 * - 이 모듈(전처리 현상): "입력" 단계. 사진 자체의 결함(뿌염·노란빛·
 *   낮은 대비)을 고쳐 선 추출 품질을 올리는 것이 목적이며, 결과는
 *   선 추출 입력으로만 쓰인다. 완성 컷의 색을 바꾸지 않는다.
 * - 색감 맞추기: "출력/연출" 단계. 참조 이미지의 톤을 완성된 컷·회차
 *   전체에 입혀 작품의 색감을 통일한다. 사진 결함 보정이 아니다.
 * 경계 전문은 docs/studio-photo-preprocess-develop.md 를 본다.
 *
 * Konva/DOM 의존 없음(입력은 StudioImageDataLike) — LT 변환 엔진
 * (`convertStudioLtImage`의 StudioLtConvertPixelSource)과 ONNX TEED
 * 입력(512×512 RGBA)이 모두 같은 {width, height, data} 형태라 그대로
 * 연결된다. 전부 순수·결정적(랜덤 없음).
 */

import type { StudioImageDataLike } from "./studio-filters";

// ---------------------------------------------------------------------------
// 파라미터 타입·기본값·범위
// ---------------------------------------------------------------------------

export type StudioPhotoDevelopWhiteBalance =
  | "off"
  | "auto"
  | "daylight"
  | "cloudy"
  | "tungsten"
  | "fluorescent";

export interface StudioPhotoDevelopSettings {
  /** 대비 -100..100 (0이면 항등). */
  readonly contrast: number;
  /** 안개 제거 0..100 (0이면 항등). */
  readonly dehaze: number;
  /** 화이트밸런스 모드 ("off"면 항등). */
  readonly whiteBalance: StudioPhotoDevelopWhiteBalance;
}

/** 항등(보정 없음) 기본값 — 전처리를 끈 상태와 같다. */
export const STUDIO_PHOTO_DEVELOP_DEFAULT_SETTINGS: StudioPhotoDevelopSettings =
  Object.freeze({
    contrast: 0,
    dehaze: 0,
    whiteBalance: "off",
  });

export const STUDIO_PHOTO_DEVELOP_CONTRAST_RANGE = Object.freeze({
  min: -100,
  max: 100,
} as const);

export const STUDIO_PHOTO_DEVELOP_DEHAZE_RANGE = Object.freeze({
  min: 0,
  max: 100,
} as const);

/** 자동 화이트밸런스 게인 클램프 — 과보정으로 색이 뒤집히는 것을 막는다. */
export const STUDIO_PHOTO_DEVELOP_AUTO_WB_GAIN_RANGE = Object.freeze({
  min: 0.75,
  max: 1.33,
} as const);

const WHITE_BALANCE_MODES: readonly StudioPhotoDevelopWhiteBalance[] = [
  "off",
  "auto",
  "daylight",
  "cloudy",
  "tungsten",
  "fluorescent",
];

/** 광원 프리셋 게인 (r, g, b 배율). 장면의 캐스트를 걷어내는 방향이다. */
const WHITE_BALANCE_PRESET_GAINS: Readonly<
  Record<
    Exclude<StudioPhotoDevelopWhiteBalance, "off" | "auto">,
    readonly [number, number, number]
  >
> = Object.freeze({
  // 맑은 낮빛: 거의 중립, 미세 조정만.
  daylight: [1.02, 1, 0.98],
  // 흐린 날(푸른 캐스트): 파랑을 누르고 빨강을 올린다.
  cloudy: [1.07, 1, 0.94],
  // 백열등(강한 노란 캐스트): 빨강을 크게 누르고 파랑을 올린다.
  tungsten: [0.82, 0.96, 1.24],
  // 형광등(녹색 캐스트): 초록을 누르고 빨강·파랑을 올린다.
  fluorescent: [1.06, 0.93, 1.05],
});

// 휘도 가중치 — 다른 필터 모듈과 같은 Rec.601 계수.
const LUMA_R = 0.299;
const LUMA_G = 0.587;
const LUMA_B = 0.114;

// ---------------------------------------------------------------------------
// 정규화·항등 판정
// ---------------------------------------------------------------------------

function clampFinite(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}

/**
 * 과거 저장본/외부 입력 안전장치 — 범위 밖은 클램프, 무효 모드는 "off",
 * 누락 필드는 항등 기본값으로 채운다.
 */
export function normalizeStudioPhotoDevelopSettings(
  settings?: Partial<StudioPhotoDevelopSettings> | null,
): StudioPhotoDevelopSettings {
  const src =
    settings && typeof settings === "object" ? settings : {};
  return Object.freeze({
    contrast: clampFinite(
      src.contrast,
      STUDIO_PHOTO_DEVELOP_CONTRAST_RANGE.min,
      STUDIO_PHOTO_DEVELOP_CONTRAST_RANGE.max,
      STUDIO_PHOTO_DEVELOP_DEFAULT_SETTINGS.contrast,
    ),
    dehaze: clampFinite(
      src.dehaze,
      STUDIO_PHOTO_DEVELOP_DEHAZE_RANGE.min,
      STUDIO_PHOTO_DEVELOP_DEHAZE_RANGE.max,
      STUDIO_PHOTO_DEVELOP_DEFAULT_SETTINGS.dehaze,
    ),
    whiteBalance: WHITE_BALANCE_MODES.includes(
      src.whiteBalance as StudioPhotoDevelopWhiteBalance,
    )
      ? (src.whiteBalance as StudioPhotoDevelopWhiteBalance)
      : STUDIO_PHOTO_DEVELOP_DEFAULT_SETTINGS.whiteBalance,
  });
}

/** 픽셀을 전혀 건드리지 않는 항등 설정인지. */
export function isIdentityStudioPhotoDevelop(
  settings: StudioPhotoDevelopSettings,
): boolean {
  const safe = normalizeStudioPhotoDevelopSettings(settings);
  return (
    safe.contrast === 0 && safe.dehaze === 0 && safe.whiteBalance === "off"
  );
}

// ---------------------------------------------------------------------------
// 프리셋 — 사진 LT·배경 가져오기 입력 단계에서 고르는 현상 프리셋.
// ---------------------------------------------------------------------------

export interface StudioPhotoDevelopPreset {
  readonly id: string;
  readonly label: string;
  readonly tip: string;
  readonly settings: StudioPhotoDevelopSettings;
}

export const STUDIO_PHOTO_DEVELOP_PRESETS: readonly StudioPhotoDevelopPreset[] =
  Object.freeze([
    {
      id: "none",
      label: "원본 그대로",
      tip: "전처리 없이 원본 사진을 그대로 선 추출에 넣습니다.",
      settings: STUDIO_PHOTO_DEVELOP_DEFAULT_SETTINGS,
    },
    {
      id: "vivid-lines",
      label: "선명하게",
      tip: "대비와 안개 제거를 가볍게 걸고 색온도를 자동으로 맞춰 윤곽을 또렷하게 합니다.",
      settings: normalizeStudioPhotoDevelopSettings({
        contrast: 35,
        dehaze: 30,
        whiteBalance: "auto",
      }),
    },
    {
      id: "dehaze",
      label: "뿌연 사진",
      tip: "안개·빛 번짐으로 뿌연 사진의 명암 구간을 펴서 묻힌 윤곽을 되살립니다.",
      settings: normalizeStudioPhotoDevelopSettings({
        contrast: 20,
        dehaze: 70,
        whiteBalance: "auto",
      }),
    },
    {
      id: "indoor-warm",
      label: "실내 노란빛",
      tip: "백열등 아래 노랗게 뜬 사진의 색온도를 낮춰 선이 뭉개지지 않게 합니다.",
      settings: normalizeStudioPhotoDevelopSettings({
        contrast: 15,
        dehaze: 15,
        whiteBalance: "tungsten",
      }),
    },
    {
      id: "cloudy-day",
      label: "흐린 날",
      tip: "흐린 날 푸르고 밋밋한 사진에 대비를 더하고 푸른 캐스트를 걷어냅니다.",
      settings: normalizeStudioPhotoDevelopSettings({
        contrast: 30,
        dehaze: 45,
        whiteBalance: "cloudy",
      }),
    },
  ]);

/** id로 프리셋을 찾는다. 알 수 없는 id는 "원본 그대로"로 fail-soft. */
export function resolveStudioPhotoDevelopPreset(
  presetId: string | null | undefined,
): StudioPhotoDevelopPreset {
  return (
    STUDIO_PHOTO_DEVELOP_PRESETS.find((preset) => preset.id === presetId) ??
    STUDIO_PHOTO_DEVELOP_PRESETS[0]!
  );
}

// ---------------------------------------------------------------------------
// 화이트밸런스 게인 추정
// ---------------------------------------------------------------------------

export interface StudioPhotoDevelopWhiteBalanceGains {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * 설정에 대한 채널 게인을 구한다.
 * - "auto": 그레이 월드 — 채널 평균을 전체 평균에 맞추는 게인을 추정하고
 *   과보정 방지를 위해 0.75..1.33으로 클램프한다. 빈/무효 입력은 중립.
 * - 프리셋: 고정 게인. "off": 중립(1, 1, 1).
 */
export function estimateStudioPhotoDevelopWhiteBalanceGains(
  source: StudioImageDataLike,
  mode: StudioPhotoDevelopWhiteBalance,
): StudioPhotoDevelopWhiteBalanceGains {
  if (mode === "off") return { r: 1, g: 1, b: 1 };
  if (mode !== "auto") {
    const [r, g, b] = WHITE_BALANCE_PRESET_GAINS[mode];
    return { r, g, b };
  }
  const { data } = source;
  const pixelCount = Math.floor(data.length / 4);
  if (pixelCount < 1) return { r: 1, g: 1, b: 1 };
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  for (let i = 0; i < data.length; i += 4) {
    sumR += data[i]!;
    sumG += data[i + 1]!;
    sumB += data[i + 2]!;
  }
  const meanR = sumR / pixelCount;
  const meanG = sumG / pixelCount;
  const meanB = sumB / pixelCount;
  const meanAll = (meanR + meanG + meanB) / 3;
  if (!(meanAll > 0)) return { r: 1, g: 1, b: 1 };
  const { min, max } = STUDIO_PHOTO_DEVELOP_AUTO_WB_GAIN_RANGE;
  const gain = (mean: number): number =>
    mean > 0 ? Math.min(max, Math.max(min, meanAll / mean)) : 1;
  return { r: gain(meanR), g: gain(meanG), b: gain(meanB) };
}

// ---------------------------------------------------------------------------
// 안개 제거용 블랙/화이트 포인트 (휘도 백분위)
// ---------------------------------------------------------------------------

function estimateLumaPercentilePoints(
  source: StudioImageDataLike,
): { black: number; white: number } {
  const { data } = source;
  const pixelCount = Math.floor(data.length / 4);
  if (pixelCount < 1) return { black: 0, white: 255 };
  const histogram = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const luma = Math.round(
      LUMA_R * data[i]! + LUMA_G * data[i + 1]! + LUMA_B * data[i + 2]!,
    );
    histogram[Math.min(255, Math.max(0, luma))]! += 1;
  }
  const atPercentile = (ratio: number): number => {
    const target = pixelCount * ratio;
    let cumulative = 0;
    for (let value = 0; value < 256; value += 1) {
      cumulative += histogram[value]!;
      if (cumulative >= target) return value;
    }
    return 255;
  };
  return { black: atPercentile(0.05), white: atPercentile(0.95) };
}

// ---------------------------------------------------------------------------
// 적용 — 비파괴. 입력은 건드리지 않고 새 버퍼를 반환한다.
// ---------------------------------------------------------------------------

/**
 * 전처리를 적용한 새 이미지를 반환한다. 입력 버퍼는 변하지 않는다
 * (항등 설정이어도 복사본을 반환해 호출 측이 항상 같은 계약을 쓴다).
 *
 * 적용 순서: 화이트밸런스 → 안개 제거(포인트 스트레치+채도) → 대비.
 * 알파는 보존한다. 채널 클램프·반올림은 Uint8ClampedArray가 처리한다.
 */
export function applyStudioPhotoDevelop(
  source: StudioImageDataLike,
  settings: StudioPhotoDevelopSettings,
): StudioImageDataLike {
  const safe = normalizeStudioPhotoDevelopSettings(settings);
  const data = new Uint8ClampedArray(source.data);
  const output: StudioImageDataLike = {
    data,
    width: source.width,
    height: source.height,
  };
  if (isIdentityStudioPhotoDevelop(safe)) return output;

  // 1) 화이트밸런스 — 채널 게인.
  if (safe.whiteBalance !== "off") {
    const gains = estimateStudioPhotoDevelopWhiteBalanceGains(
      source,
      safe.whiteBalance,
    );
    for (let i = 0; i < data.length; i += 4) {
      data[i] = data[i]! * gains.r;
      data[i + 1] = data[i + 1]! * gains.g;
      data[i + 2] = data[i + 2]! * gains.b;
    }
  }

  // 2) 안개 제거 — 휘도 백분위 스트레치를 강도만큼 섞고 채도를 조금 올린다.
  if (safe.dehaze > 0) {
    const amount = safe.dehaze / 100;
    const { black, white } = estimateLumaPercentilePoints({
      data,
      width: source.width,
      height: source.height,
    });
    const span = white - black;
    if (span > 0) {
      const saturationScale = 1 + 0.25 * amount;
      for (let i = 0; i < data.length; i += 4) {
        const stretchedR = ((data[i]! - black) * 255) / span;
        const stretchedG = ((data[i + 1]! - black) * 255) / span;
        const stretchedB = ((data[i + 2]! - black) * 255) / span;
        const r = data[i]! * (1 - amount) + stretchedR * amount;
        const g = data[i + 1]! * (1 - amount) + stretchedG * amount;
        const b = data[i + 2]! * (1 - amount) + stretchedB * amount;
        const luma = LUMA_R * r + LUMA_G * g + LUMA_B * b;
        data[i] = luma + (r - luma) * saturationScale;
        data[i + 1] = luma + (g - luma) * saturationScale;
        data[i + 2] = luma + (b - luma) * saturationScale;
      }
    }
  }

  // 3) 대비 — 중간점(128) 기준 선형 스케일.
  if (safe.contrast !== 0) {
    const factor = 1 + safe.contrast / 100;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = (data[i]! - 128) * factor + 128;
      data[i + 1] = (data[i + 1]! - 128) * factor + 128;
      data[i + 2] = (data[i + 2]! - 128) * factor + 128;
    }
  }

  return output;
}
