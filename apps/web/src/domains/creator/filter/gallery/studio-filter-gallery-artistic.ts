/**
 * 필터 갤러리 · 예술 효과 계열.
 *
 * 사진 편집기 필터 갤러리의 "예술 효과" 묶음(색연필·드라이 브러시·프레스코·네온 광·페인트 바르기·팔레트 나이프·
 * 비닐 랩·거친 파스텔·문지르기 막대·스펀지·언더페인팅)과 그림판 계열 프로그램의 잉크 스케치를 공개 매뉴얼의 기능
 * 설명만 보고 공개 알고리즘으로 새로 구현했다.
 *   - 붓 자국 평탄화: 알파 가중 쿠와하라(Kuwahara 1976, 상자 가중은 Papari·Petkov·Campisi 2007).
 *   - 빗금·붓결: 방향 상자 평균한 백색 잡음(LIC, Cabral·Leedom 1993)과 구조 텐서 접선(Kyprianidis 2009).
 *   - 잉크 선: 가우시안 차(DoG, Marr·Hildreth 1980)와 소벨 기울기.
 *   - 비닐 랩 광택: 흐린 휘도를 높이맵으로 본 블린-퐁 반사(Blinn 1977).
 *   - 스펀지 구멍: 셀룰러 노이즈(Worley 1996).
 * 무작위는 모두 context.seed 를 섞은 정수 해시다. 알파는 그대로 두고, 평균·번짐은 알파 가중이다.
 */
import { clamp01, colorParam, fbm2, hash2, luma, valueNoise2 } from "./studio-filter-gallery-kernel-utils";
import {
  blurColor,
  boxBlur,
  createColorPlanes,
  gaussianBlur,
  gradientMagnitude,
  kuwahara,
  kuwaharaFractional,
  orientedStreakNoise,
  posterize,
  posterizeLuma,
  readPaintSource,
  select,
  selectValue,
  sharpenColor,
  slider,
  sliderValue,
  smearColor,
  smoothstep,
  streakNoise,
  toUniform,
  writeColorPlanes,
} from "./studio-filter-gallery-paint-helpers";
import {
  STUDIO_FILTER_GALLERY_LIGHT_OPTIONS,
  STUDIO_FILTER_GALLERY_TEXTURE_OPTIONS,
  applyRelief,
  textureHeight,
} from "./studio-filter-gallery-textures";

import type { ColorPlanes } from "./studio-filter-gallery-paint-helpers";
import type { StudioFilterGalleryEffectDef, StudioFilterGalleryParamSpec } from "./studio-filter-gallery-types";

const BRUSH_SIZE = slider("brushSize", "브러시 크기", 0, 10, 2);
const BRUSH_DETAIL = slider("brushDetail", "브러시 세부", 0, 10, 8);
const TEXTURE_AMOUNT = slider("texture", "텍스처", 1, 3, 1);
const SCALING = slider("scaling", "비율", 50, 200, 100, "%");

// ── 작은 반지름 잇기 ─────────────────────────────────────────────
// 공용 흐림·쿠와하라는 가장 작은 창보다 더 작아지지 않아, 작은 반지름 여러 칸이 같은 결과를 냈다. 그 아래는 원본과
// 가장 작은 창 결과를 반지름 비율로 섞어 반지름 0(원본)까지 이어지게 한다.

/** target 을 base 에서 target 쪽으로 share(0~1)만큼만 간 값으로 바꾼다(제자리). */
function mixFrom(base: ColorPlanes, target: ColorPlanes, share: number): ColorPlanes {
  for (let index = 0; index < target.red.length; index += 1) {
    target.red[index] = base.red[index] + (target.red[index] - base.red[index]) * share;
    target.green[index] = base.green[index] + (target.green[index] - base.green[index]) * share;
    target.blue[index] = base.blue[index] + (target.blue[index] - base.blue[index]) * share;
  }
  return target;
}

/** gaussianBlur 는 상자 반지름 r/√3 을 1 아래로 줄이지 않아 반지름 0.5~√3 이 모두 이 반지름의 흐림과 같다. */
const FINEST_BLUR = Math.sqrt(3);

/** 알파 가중 흐림. √3 아래 반지름은 원본과 √3 흐림을 반지름 비율로 섞는다(√3 이상·0 이하는 blurColor 그대로). */
function fineBlurColor(colors: ColorPlanes, weight: Float32Array, width: number, height: number, radius: number): ColorPlanes {
  if (!(radius > 0) || radius >= FINEST_BLUR) return blurColor(colors, weight, width, height, radius);
  return mixFrom(colors, blurColor(colors, weight, width, height, FINEST_BLUR), radius / FINEST_BLUR);
}

/**
 * 소수 반지름 쿠와하라(kuwaharaFractional)를 반지름 0 까지 잇는다. 반지름 0 쿠와하라는 픽셀 하나짜리 상자라 원본
 * 그대로이므로 1 아래는 원본과 반지름 1 결과를 반지름만큼 섞는다(공용 판은 1 아래를 1 로 올린다).
 */
function flattenFractional(
  colors: ColorPlanes,
  weight: Float32Array,
  width: number,
  height: number,
  radius: number,
  hardness: number,
): ColorPlanes {
  if (radius >= 1) return kuwaharaFractional(colors, weight, width, height, radius, hardness);
  return mixFrom(colors, kuwahara(colors, weight, width, height, 1, hardness), Math.max(0, radius));
}

// ── 색연필 ───────────────────────────────────────────────────────

const PENCIL_WIDTH = slider("pencilWidth", "연필 폭", 1, 24, 4);
const STROKE_PRESSURE = slider("strokePressure", "획 압력", 0, 15, 8);
const PAPER_BRIGHTNESS = slider("paperBrightness", "종이 밝기", 0, 50, 25);

/** 종이 → 첫 빗금 → 교차 빗금 → 윤곽 순서로 한 채널을 칠한다. */
function pencilChannel(ground: number, color: number, first: number, second: number, edge: number): number {
  let value = ground + (color - ground) * first;
  value += (color * 0.85 - value) * second;
  return value + (color * 0.45 - value) * edge;
}

const coloredPencil: StudioFilterGalleryEffectDef = {
  id: "artistic.colored-pencil",
  category: "artistic",
  label: "색연필",
  description: "종이 위에 원본 색의 색연필 빗금을 엇갈려 그어 다시 그리고 뚜렷한 윤곽은 남깁니다.",
  references: ["Photoshop · 색연필"],
  params: [PENCIL_WIDTH, STROKE_PRESSURE, PAPER_BRIGHTNESS],
  cost: 4,
  apply(image, params, context) {
    const pencil = sliderValue(params, PENCIL_WIDTH);
    const pressure = sliderValue(params, STROKE_PRESSURE) / 15;
    // 0 은 검은 종이, 50 은 흰 종이. 0.25 제곱 곡선으로 기본값 25 가 밝은 회색 종이가 되게 한다.
    const paper = 255 * Math.pow(sliderValue(params, PAPER_BRIGHTNESS) / 50, 0.25);
    const { width, height } = image;
    const source = readPaintSource(image);
    const seed = context.seed ^ 0x6c01;
    const along = Math.round(3 + pencil * 2), across = Math.floor((pencil - 1) / 2);
    const hatchUp = streakNoise(width, height, seed, "diagonal-up", along, across);
    const hatchDown = streakNoise(width, height, seed ^ 0x1d, "diagonal-down", along, across);
    const magnitude = gradientMagnitude(source.luma, width, height);
    const out = createColorPlanes(width * height);
    const span = Math.max(paper, 255 - paper, 1);
    const strength = 0.55 + 0.45 * pressure;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const red = source.red[index], green = source.green[index], blue = source.blue[index];
        // 종이와 색이 다르거나 세부가 많을수록 획을 촘촘히 긋고(매끈한 곳은 종이가 비친다), 아주 짙은 곳은
        // 반대 대각선으로 한 번 더 긋는다(교차 빗금).
        const dRed = Math.abs(red - paper), dGreen = Math.abs(green - paper), dBlue = Math.abs(blue - paper);
        const contrast = ((dRed + dGreen + dBlue) / 6 + Math.max(dRed, dGreen, dBlue) / 2) / span;
        const busy = smoothstep(30, 260, magnitude[index]);
        const density = clamp01(contrast * (0.9 + 0.5 * pressure) + busy * 0.3 + 0.08);
        const crossing = clamp01((density - 0.45) / 0.55);
        const grain = strength * (0.7 + 0.3 * hash2(x, y, seed ^ 0x2b));
        const first = smoothstep(0.9 - density, 1.1 - density, toUniform(hatchUp[index])) * grain;
        const second = smoothstep(0.9 - crossing, 1.1 - crossing, toUniform(hatchDown[index])) * grain;
        const edge = smoothstep(90, 360, magnitude[index]) * (0.4 + 0.4 * pressure);
        const ground = paper * (0.95 + 0.05 * hash2(x >> 1, y >> 1, seed ^ 0x3c));
        out.red[index] = pencilChannel(ground, red, first, second, edge);
        out.green[index] = pencilChannel(ground, green, first, second, edge);
        out.blue[index] = pencilChannel(ground, blue, first, second, edge);
      }
    }
    writeColorPlanes(image, out);
  },
};

// ── 드라이 브러시 · 프레스코 ─────────────────────────────────────

/**
 * 소수 단계 수 posterizeLuma(제자리). 정수면 posterizeLuma 그대로이고, 아니면 이웃한 두 정수 단계 결과를 소수 부분만큼
 * 섞는다(posterizeLuma 는 세 채널에 같은 양을 더하므로 두 결과를 섞는 것은 더할 양을 섞는 것과 같다).
 */
function posterizeLumaFractional(planes: ColorPlanes, levels: number, amount: number): void {
  const lower = Math.floor(levels), fraction = levels - lower;
  if (fraction <= 1e-6) {
    posterizeLuma(planes, lower, amount);
    return;
  }
  for (let index = 0; index < planes.red.length; index += 1) {
    const value = luma(planes.red[index], planes.green[index], planes.blue[index]);
    const low = posterize(value, lower);
    const shift = (low + (posterize(value, lower + 1) - low) * fraction - value) * amount;
    planes.red[index] += shift;
    planes.green[index] += shift;
    planes.blue[index] += shift;
  }
}

/**
 * 드라이 브러시 명도 단계 수. 예전 Math.round(3 + 세부 × 0.9) 는 세부 5 와 6 이 둘 다 8 단계라 두 칸이 같은 결과를 냈다.
 * 다른 칸의 단계 수(세부 0~4 → 3~7, 6~10 → 8~12, 기본값 8 → 10)는 그대로 두고 5 만 7 과 8 단계의 가운데(7.5)로
 * 옮긴다. 칸 사이 값(저장된 소수 세부)도 반올림 없이 이어진다.
 */
const dryBrushLevels = (detail: number): number => detail + 3 - clamp01((detail - 4) / 2);

const dryBrush: StudioFilterGalleryEffectDef = {
  id: "artistic.dry-brush",
  category: "artistic",
  label: "드라이 브러시",
  description: "경계를 지키며 붓 크기만큼 색을 평평하게 모으고 색 단계를 줄인 뒤 마른 붓결을 남깁니다.",
  references: ["Photoshop · 드라이 브러시"],
  params: [BRUSH_SIZE, BRUSH_DETAIL, TEXTURE_AMOUNT],
  cost: 5,
  apply(image, params, context) {
    const size = sliderValue(params, BRUSH_SIZE);
    const levels = dryBrushLevels(sliderValue(params, BRUSH_DETAIL));
    const grain = 6 * sliderValue(params, TEXTURE_AMOUNT);
    const { width, height } = image;
    const source = readPaintSource(image);
    const painted = kuwahara(source, source.weight, width, height, size + 1, 6);
    posterizeLumaFractional(painted, levels, 0.8);
    const bristles = orientedStreakNoise(source.luma, width, height, context.seed ^ 0x6c02, 3 + size);
    for (let index = 0; index < width * height; index += 1) {
      const streak = bristles[index] * grain;
      painted.red[index] += streak;
      painted.green[index] += streak;
      painted.blue[index] += streak;
    }
    writeColorPlanes(image, painted);
  },
};

/** 대비를 올려 어둡게 누른 뒤 얼룩·테두리 명암(tone)을 곱한다. */
const frescoChannel = (value: number, tone: number): number => ((value - 128) * 1.3 + 112) * tone;

const fresco: StudioFilterGalleryEffectDef = {
  id: "artistic.fresco",
  category: "artistic",
  label: "프레스코",
  description: "짧고 둥근 붓자국을 급히 찍어 바른 듯 어둡고 대비가 강한 얼룩과 짙은 테두리로 다시 칠합니다.",
  references: ["Photoshop · 프레스코"],
  params: [BRUSH_SIZE, BRUSH_DETAIL, TEXTURE_AMOUNT],
  cost: 5,
  apply(image, params, context) {
    const size = sliderValue(params, BRUSH_SIZE);
    const levels = Math.round(5 + sliderValue(params, BRUSH_DETAIL) * 1.2);
    const texture = sliderValue(params, TEXTURE_AMOUNT);
    const { width, height } = image;
    const source = readPaintSource(image);
    const painted = kuwahara(source, source.weight, width, height, size + 1, 4);
    posterizeLuma(painted, levels, 0.7);
    const near = source.luma.slice(), far = source.luma.slice();
    gaussianBlur(near, width, height, 1);
    gaussianBlur(far, width, height, 3 + size * 0.5);
    const dab = 2 + size * 0.6, seed = context.seed ^ 0x6c03;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        // 주변보다 어두운 쪽 경계(가우시안 차가 음수인 곳)를 짙은 테두리로 칠한다.
        const outline = smoothstep(2, 20, far[index] - near[index]);
        const blot = 0.65 * valueNoise2(x / dab, y / dab, seed)
          + 0.35 * valueNoise2(x / (dab * 0.4), y / (dab * 0.4), seed ^ 0x5) - 0.5;
        const tone = (1 + blot * 0.24 * texture) * (1 - 0.7 * outline);
        painted.red[index] = frescoChannel(painted.red[index], tone);
        painted.green[index] = frescoChannel(painted.green[index], tone);
        painted.blue[index] = frescoChannel(painted.blue[index], tone);
      }
    }
    writeColorPlanes(image, painted);
  },
};

// ── 네온 광 ──────────────────────────────────────────────────────

const GLOW_SIZE = slider("glowSize", "광 크기", -24, 24, 5);
const GLOW_BRIGHTNESS = slider("glowBrightness", "광 밝기", 0, 50, 15);
const GLOW_COLOR = {
  key: "glowColor", label: "광 색상", control: "color", default: "#4fc3ff",
} as const satisfies StudioFilterGalleryParamSpec;
const GLOW_FALLBACK: readonly [number, number, number] = [0x4f, 0xc3, 0xff];

/** 어둡게 누른 단색 바탕(빛 색으로 살짝 물든)에 빛을 스크린 합성한다. */
function neonChannel(base: number, glow: number, amount: number): number {
  const tinted = base * (0.85 + (0.15 * glow) / 255);
  return 255 - (255 - tinted) * (1 - (glow / 255) * amount);
}

const neonGlow: StudioFilterGalleryEffectDef = {
  id: "artistic.neon-glow",
  category: "artistic",
  label: "네온 광",
  description: "그림을 어두운 단색으로 누르고 밝은 곳과 윤곽(크기가 음수면 어두운 곳)에서 고른 색의 빛이 부드럽게 번지게 합니다.",
  references: ["Photoshop · 네온 광"],
  params: [GLOW_SIZE, GLOW_BRIGHTNESS, GLOW_COLOR],
  cost: 3,
  apply(image, params) {
    const size = sliderValue(params, GLOW_SIZE);
    const brightness = sliderValue(params, GLOW_BRIGHTNESS) / 50;
    const [glowRed, glowGreen, glowBlue] = colorParam(params, GLOW_COLOR.key, GLOW_FALLBACK);
    const { width, height } = image;
    const count = width * height;
    const source = readPaintSource(image);
    const magnitude = gradientMagnitude(source.luma, width, height);
    const glow = new Float32Array(count), mass = source.weight.slice();
    for (let index = 0; index < count; index += 1) {
      const tone = source.luma[index] / 255;
      const lit = size >= 0 ? tone : 1 - tone;
      glow[index] = Math.max(lit * lit, clamp01(magnitude[index] / 600) * 0.8) * source.weight[index];
    }
    gaussianBlur(glow, width, height, Math.abs(size));
    gaussianBlur(mass, width, height, Math.abs(size));
    const out = createColorPlanes(count);
    for (let index = 0; index < count; index += 1) {
      const amount = clamp01((mass[index] > 1e-5 ? glow[index] / mass[index] : 0) * brightness * 2.4);
      const base = source.luma[index] * 0.55;
      out.red[index] = neonChannel(base, glowRed, amount);
      out.green[index] = neonChannel(base, glowGreen, amount);
      out.blue[index] = neonChannel(base, glowBlue, amount);
    }
    writeColorPlanes(image, out);
  },
};

// ── 페인트 바르기 ────────────────────────────────────────────────

const DAUB_SIZE = slider("brushSize", "브러시 크기", 1, 50, 8);
const DAUB_SHARPNESS = slider("sharpness", "선명도", 0, 40, 7);
const DAUB_TYPE = select("brushType", "브러시 유형", [
  { value: "simple", label: "단순" },
  { value: "light-rough", label: "밝고 거칠게" },
  { value: "dark-rough", label: "어둡고 거칠게" },
  { value: "wide-sharp", label: "넓고 선명하게" },
  { value: "wide-blurry", label: "넓고 흐리게" },
  { value: "sparkle", label: "반짝이" },
], "simple");

type DaubKind = (typeof DAUB_TYPE.options)[number]["value"];

/**
 * 붓 유형별 작업량 상한(256² 실측, 크기·선명도 중 가장 무거운 값). 소수 반지름은 쿠와하라를 두 번 돌리고, 넓고
 * 흐리게는 흐림을, 거친 붓·반짝이는 결 따라 붓결 노이즈를 더 쓴다.
 */
const DAUB_COST: Readonly<Record<DaubKind, number>> = {
  simple: 17, "light-rough": 25, "dark-rough": 25, "wide-sharp": 17, "wide-blurry": 22, sparkle: 26,
};

/** 거친 붓(밝게·어둡게)은 결 따라 붓결로 명도를 흔들고, 반짝이는 밝은 곳에 드문드문 반짝임을 찍는다. */
function daubTexture(
  painted: ColorPlanes,
  shade: Float32Array,
  width: number,
  height: number,
  kind: DaubKind,
  length: number,
  seed: number,
): void {
  const grain = orientedStreakNoise(shade, width, height, seed, length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      let shift = Math.abs(grain[index]) * 16 + 10;
      if (kind === "dark-rough") shift = -shift;
      if (kind === "sparkle") {
        const tone = luma(painted.red[index], painted.green[index], painted.blue[index]) / 255;
        const glint = hash2(x, y, seed ^ 0x9) > 0.965 - 0.08 * tone ? smoothstep(0.35, 0.8, tone) * 150 : 0;
        shift = grain[index] * 6 + glint;
      }
      painted.red[index] += shift;
      painted.green[index] += shift;
      painted.blue[index] += shift;
    }
  }
}

const paintDaubs: StudioFilterGalleryEffectDef = {
  id: "artistic.paint-daubs",
  category: "artistic",
  label: "페인트 바르기",
  description: "고른 붓 유형과 크기로 물감을 덕지덕지 바른 듯 색 덩어리를 만들고 선명도만큼 붓자국을 세웁니다.",
  references: ["Photoshop · 페인트 바르기"],
  params: [DAUB_SIZE, DAUB_SHARPNESS, DAUB_TYPE],
  cost: 17,
  costFor: (params) => DAUB_COST[selectValue(params, DAUB_TYPE)],
  apply(image, params, context) {
    const size = sliderValue(params, DAUB_SIZE);
    const sharpness = sliderValue(params, DAUB_SHARPNESS) / 40;
    const kind = selectValue(params, DAUB_TYPE);
    const { width, height } = image;
    const source = readPaintSource(image);
    const wide = kind === "wide-sharp" || kind === "wide-blurry";
    // 반지름을 반올림(최소 1)하면 작은 붓 크기 여러 칸이 같은 결과를 냈다. 소수 반지름을 0 쪽까지 그대로 쓴다.
    const radius = size * (wide ? 0.5 : 0.3);
    let painted = flattenFractional(source, source.weight, width, height, radius, wide ? 5 : 8);
    if (kind === "wide-blurry") painted = fineBlurColor(painted, source.weight, width, height, radius * 0.6);
    const boost = kind === "wide-sharp" ? 3 : kind === "wide-blurry" ? 0.5 : 2;
    sharpenColor(painted, source.weight, width, height, 1 + size * 0.08, sharpness * boost);
    if (kind === "light-rough" || kind === "dark-rough" || kind === "sparkle") {
      daubTexture(painted, source.luma, width, height, kind, 2 + Math.round(size * 0.4), context.seed ^ 0x6c05);
    }
    writeColorPlanes(image, painted);
  },
};

// ── 팔레트 나이프 ────────────────────────────────────────────────

const KNIFE_SIZE = slider("strokeSize", "획 크기", 1, 50, 25);
const KNIFE_DETAIL = slider("strokeDetail", "획 세부", 1, 3, 3);
const KNIFE_SOFTNESS = slider("softness", "부드러움", 0, 10, 0);

const paletteKnife: StudioFilterGalleryEffectDef = {
  id: "artistic.palette-knife",
  category: "artistic",
  label: "팔레트 나이프",
  description: "세부를 덜어 내고 나이프로 얇게 펴 바른 듯 넓고 평평한 색 면으로 칠해 아래 캔버스 결이 비치게 합니다.",
  references: ["Photoshop · 팔레트 나이프"],
  params: [KNIFE_SIZE, KNIFE_DETAIL, KNIFE_SOFTNESS],
  cost: 24,
  // 소수 반지름 첫 패스는 쿠와하라를 두 번, 절반 반지름 둘째 패스는 한 번 돌리고, 부드러움이 0 보다 크면 흐림이 더
  // 든다(256² 실측 중앙값 약 22·29 단위).
  costFor: (params) => (sliderValue(params, KNIFE_SOFTNESS) > 0 ? 31 : 24),
  apply(image, params, context) {
    const size = sliderValue(params, KNIFE_SIZE);
    const detail = sliderValue(params, KNIFE_DETAIL);
    const softness = sliderValue(params, KNIFE_SOFTNESS);
    const { width, height } = image;
    const source = readPaintSource(image);
    const radius = (1 + size * 0.14) * (1.3 - detail * 0.15);
    // 쿠와하라를 큰 반지름 → 절반 반지름으로 두 번 걸면 사분면 경계가 칼로 자른 듯한 평면으로 굳는다. 반지름을
    // 반올림하면 획 크기·세부 여러 칸이 같은 결과를 내서 첫 패스는 소수 반지름(최소 1)을 쓴다. 첫 패스가 칸마다
    // 달라지므로 둘째 패스는 정수 반지름 한 번으로 충분하다(소수로 두 번 돌리면 큰 이미지가 작업량 상한을 넘었다).
    let painted = kuwaharaFractional(source, source.weight, width, height, radius, 14);
    painted = kuwahara(painted, source.weight, width, height, Math.max(1, Math.round(radius / 2)), 14);
    if (softness > 0) painted = fineBlurColor(painted, source.weight, width, height, softness * 0.35);
    writeColorPlanes(image, painted);
    applyRelief(image, textureHeight("canvas", width, height, 1, context.seed ^ 0x6c06), "top-left", 6);
  },
};

// ── 비닐 랩 ──────────────────────────────────────────────────────

const HIGHLIGHT_STRENGTH = slider("highlightStrength", "광택 강도", 0, 20, 15);
const WRAP_DETAIL = slider("detail", "세부", 1, 15, 9);
const WRAP_SMOOTHNESS = slider("smoothness", "매끄러움", 1, 15, 7);
/** 왼쪽 위 비스듬한 빛(-1, -1, 1.2)과 정면 시선의 블린-퐁 반각 벡터(정규화). */
const WRAP_HALF_VECTOR: readonly [number, number, number] = (() => {
  const light = [-1, -1, 1.2], length = Math.hypot(light[0], light[1], light[2]);
  const half = [light[0] / length, light[1] / length, light[2] / length + 1];
  const norm = Math.hypot(half[0], half[1], half[2]);
  return [half[0] / norm, half[1] / norm, half[2] / norm];
})();

const plasticWrap: StudioFilterGalleryEffectDef = {
  id: "artistic.plastic-wrap",
  category: "artistic",
  label: "비닐 랩",
  description: "그림을 반짝이는 비닐로 감싼 듯 표면 굴곡이 꺾이는 곳마다 하얀 광택 띠를 얹습니다.",
  references: ["Photoshop · 비닐 랩"],
  params: [HIGHLIGHT_STRENGTH, WRAP_DETAIL, WRAP_SMOOTHNESS],
  cost: 3,
  apply(image, params) {
    const strength = sliderValue(params, HIGHLIGHT_STRENGTH) / 20;
    const slope = 0.02 + sliderValue(params, WRAP_DETAIL) * 0.006;
    const smoothness = sliderValue(params, WRAP_SMOOTHNESS);
    const { width, height } = image;
    const source = readPaintSource(image);
    const surface = source.luma.slice();
    gaussianBlur(surface, width, height, 1 + smoothness * 0.5);
    const [hx, hy, hz] = WRAP_HALF_VECTOR;
    const dim = 1 - 0.18 * strength;
    const out = createColorPlanes(width * height);
    for (let y = 0; y < height; y += 1) {
      const up = Math.max(0, y - 1) * width, down = Math.min(height - 1, y + 1) * width, row = y * width;
      for (let x = 0; x < width; x += 1) {
        const index = row + x;
        // 휘도 높이맵의 노멀 (−∂h/∂x, −∂h/∂y, 1) 과 반각 벡터의 내적을 높은 지수로 올려 좁은 광택 띠만 남긴다.
        const gx = (surface[row + Math.min(width - 1, x + 1)] - surface[row + Math.max(0, x - 1)]) * 0.5 * slope;
        const gy = (surface[down + x] - surface[up + x]) * 0.5 * slope;
        const facing = Math.max(0, (-gx * hx - gy * hy + hz) / Math.sqrt(gx * gx + gy * gy + 1));
        const shine = clamp01(Math.pow(facing, 40) * strength * 1.4);
        out.red[index] = source.red[index] * dim + (255 - source.red[index] * dim) * shine;
        out.green[index] = source.green[index] * dim + (255 - source.green[index] * dim) * shine;
        out.blue[index] = source.blue[index] * dim + (255 - source.blue[index] * dim) * shine;
      }
    }
    writeColorPlanes(image, out);
  },
};

// ── 거친 파스텔 ──────────────────────────────────────────────────

const PASTEL_LENGTH = slider("strokeLength", "획 길이", 0, 40, 6);
const PASTEL_DETAIL = slider("strokeDetail", "획 세부", 1, 20, 4);
const PASTEL_TEXTURE = select("texture", "텍스처", STUDIO_FILTER_GALLERY_TEXTURE_OPTIONS, "canvas");
const PASTEL_RELIEF = slider("relief", "부조", 0, 50, 20);
const PASTEL_LIGHT = select("lightDirection", "조명 방향", STUDIO_FILTER_GALLERY_LIGHT_OPTIONS, "bottom");
/** 분필이 긁혀 나간 곳에 드러나는 바탕 종이 밝기. */
const PASTEL_GROUND = 226;

const roughPastels: StudioFilterGalleryEffectDef = {
  id: "artistic.rough-pastels",
  category: "artistic",
  label: "거친 파스텔",
  description: "색 분필로 대각선 획을 그은 듯 번지게 하고, 어두운 곳은 분필이 긁혀 바탕 질감이 요철로 드러나게 합니다.",
  references: ["Photoshop · 거친 파스텔"],
  params: [PASTEL_LENGTH, PASTEL_DETAIL, PASTEL_TEXTURE, SCALING, PASTEL_RELIEF, PASTEL_LIGHT],
  cost: 4,
  apply(image, params, context) {
    const length = sliderValue(params, PASTEL_LENGTH);
    const detail = sliderValue(params, PASTEL_DETAIL);
    const scaling = sliderValue(params, SCALING) / 100;
    const { width, height } = image;
    const count = width * height;
    const source = readPaintSource(image);
    const seed = context.seed ^ 0x6c08;
    const grain = streakNoise(width, height, seed, "diagonal-up", Math.max(1, length), 1);
    const chalk = createColorPlanes(count);
    const amplitude = 8 + detail * 1.2;
    for (let index = 0; index < count; index += 1) {
      const shift = grain[index] * amplitude;
      chalk.red[index] = source.red[index] + shift;
      chalk.green[index] = source.green[index] + shift;
      chalk.blue[index] = source.blue[index] + shift;
    }
    const strokes = smearColor(chalk, source.weight, width, height, "diagonal-up", Math.round(length / 2));
    const surface = textureHeight(selectValue(params, PASTEL_TEXTURE), width, height, scaling, seed ^ 0x11);
    const keep = (detail / 20) * 0.45;
    for (let index = 0; index < count; index += 1) {
      // 어두운 곳일수록 높이맵의 골(낮은 곳)에서 분필이 긁혀 나가 밝은 바탕이 드러난다.
      const scraped = smoothstep(0.55, 0.15, surface[index]) * (1 - source.luma[index] / 255) * 0.3;
      strokes.red[index] = pastelChannel(strokes.red[index], source.red[index], keep, scraped);
      strokes.green[index] = pastelChannel(strokes.green[index], source.green[index], keep, scraped);
      strokes.blue[index] = pastelChannel(strokes.blue[index], source.blue[index], keep, scraped);
    }
    writeColorPlanes(image, strokes);
    applyRelief(image, surface, selectValue(params, PASTEL_LIGHT), sliderValue(params, PASTEL_RELIEF));
  },
};

function pastelChannel(stroke: number, original: number, keep: number, scraped: number): number {
  const value = stroke + (original - stroke) * keep;
  return value + (PASTEL_GROUND - value) * scraped;
}

// ── 문지르기 막대 ────────────────────────────────────────────────

const SMUDGE_LENGTH = slider("strokeLength", "획 길이", 0, 10, 2);
const HIGHLIGHT_AREA = slider("highlightArea", "밝은 영역", 0, 20, 0);
const SMUDGE_INTENSITY = slider("intensity", "강도", 0, 10, 10);

const smudgeStick: StudioFilterGalleryEffectDef = {
  id: "artistic.smudge-stick",
  category: "artistic",
  label: "문지르기 막대",
  description: "짧은 대각선 획으로 어두운 부분을 문질러 번지게 하고 밝은 부분은 더 밝게 날려 세부를 지웁니다.",
  references: ["Photoshop · 문지르기 막대(Smudge Stick)"],
  params: [SMUDGE_LENGTH, HIGHLIGHT_AREA, SMUDGE_INTENSITY],
  cost: 4,
  apply(image, params, context) {
    const radius = Math.round(1 + sliderValue(params, SMUDGE_LENGTH) * 1.2);
    const threshold = 0.82 - sliderValue(params, HIGHLIGHT_AREA) * 0.025;
    const intensity = sliderValue(params, SMUDGE_INTENSITY) / 10;
    const { width, height } = image;
    const count = width * height;
    const source = readPaintSource(image);
    // 어두운 픽셀일수록 무겁게 평균해 어두운 색이 획 방향으로 끌려 나오게 한다.
    const heavy = new Float32Array(count);
    for (let index = 0; index < count; index += 1) {
      const darkness = 1 - source.luma[index] / 255;
      heavy[index] = source.weight[index] * (0.06 + darkness * darkness);
    }
    const smudged = smearColor(source, heavy, width, height, "diagonal-down", radius);
    const streaks = streakNoise(width, height, context.seed ^ 0x6c09, "diagonal-down", radius);
    const lifted = blurColor(source, source.weight, width, height, 2);
    for (let index = 0; index < count; index += 1) {
      const highlight = smoothstep(threshold, threshold + 0.16, source.luma[index] / 255) * intensity;
      const texture = 1 + streaks[index] * 0.04;
      smudged.red[index] = smudgeChannel(smudged.red[index] * texture, lifted.red[index], highlight);
      smudged.green[index] = smudgeChannel(smudged.green[index] * texture, lifted.green[index], highlight);
      smudged.blue[index] = smudgeChannel(smudged.blue[index] * texture, lifted.blue[index], highlight);
    }
    writeColorPlanes(image, smudged);
  },
};

const smudgeChannel = (value: number, lifted: number, highlight: number): number =>
  value + (255 - (255 - lifted) * 0.35 - value) * highlight;

// ── 스펀지 ───────────────────────────────────────────────────────

const SPONGE_DEFINITION = slider("definition", "선명도", 0, 25, 12);
const SPONGE_SMOOTHNESS = slider("smoothness", "매끄러움", 1, 15, 5);

/** 격자 칸마다 무작위 점 하나를 둔 셀룰러 노이즈의 최근접 거리(Worley 1996). 칸 크기 1 기준 0~약 1. */
function cellularDistance(x: number, y: number, seed: number): number {
  const cellX = Math.floor(x), cellY = Math.floor(y);
  let best = 4;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const gx = cellX + dx, gy = cellY + dy;
      const px = gx + hash2(gx, gy, seed) - x, py = gy + hash2(gx, gy, seed ^ 0x45d9f3b) - y;
      best = Math.min(best, px * px + py * py);
    }
  }
  return Math.sqrt(best);
}

/** 소수 반지름 상자 평균(제자리). 정수로 반올림하면 매끄러움 여러 칸이 같아서 이웃한 두 정수 반지름 결과를 섞는다. */
function boxBlurFractional(plane: Float32Array, width: number, height: number, radius: number): void {
  const lower = Math.floor(radius), fraction = radius - lower;
  const upper = fraction > 1e-3 ? plane.slice() : null;
  boxBlur(plane, width, height, lower);
  if (!upper) return;
  boxBlur(upper, width, height, lower + 1);
  for (let index = 0; index < plane.length; index += 1) plane[index] += (upper[index] - plane[index]) * fraction;
}

const sponge: StudioFilterGalleryEffectDef = {
  id: "artistic.sponge",
  category: "artistic",
  label: "스펀지",
  description: "스펀지로 찍어 바른 듯 구멍 숭숭한 얼룩 질감으로 부드럽게 모은 색의 명암을 대비 있게 흔듭니다.",
  references: ["Photoshop · 스펀지"],
  params: [BRUSH_SIZE, SPONGE_DEFINITION, SPONGE_SMOOTHNESS],
  cost: 4,
  apply(image, params, context) {
    const size = sliderValue(params, BRUSH_SIZE);
    const definition = sliderValue(params, SPONGE_DEFINITION) / 25;
    const smoothness = sliderValue(params, SPONGE_SMOOTHNESS);
    const { width, height } = image;
    const count = width * height;
    const source = readPaintSource(image);
    const soft = blurColor(source, source.weight, width, height, 0.4 + size * 0.4);
    const cell = 2.5 + size * 1.2, seed = context.seed ^ 0x6c0a;
    const pores = new Float32Array(count);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        pores[y * width + x] = 0.6 * cellularDistance(x / cell, y / cell, seed)
          + 0.4 * fbm2(x / (cell * 1.7), y / (cell * 1.7), seed ^ 0x3, 2);
      }
    }
    boxBlurFractional(pores, width, height, smoothness * 0.3);
    for (let index = 0; index < count; index += 1) {
      // 0 은 스펀지 구멍(짙게), 1 은 스펀지 면(밝게).
      const gain = 1 + (smoothstep(0.2, 0.6, pores[index]) - 0.55) * definition * 0.9;
      soft.red[index] *= gain;
      soft.green[index] *= gain;
      soft.blue[index] *= gain;
    }
    writeColorPlanes(image, soft);
  },
};

// ── 언더페인팅 ───────────────────────────────────────────────────

const UNDER_SIZE = slider("brushSize", "브러시 크기", 0, 40, 6);
const UNDER_COVERAGE = slider("textureCoverage", "텍스처 범위", 0, 40, 16);
const UNDER_TEXTURE = select("texture", "텍스처", STUDIO_FILTER_GALLERY_TEXTURE_OPTIONS, "canvas");
const UNDER_RELIEF = slider("relief", "부조", 0, 50, 4);
const UNDER_LIGHT = select("lightDirection", "조명 방향", STUDIO_FILTER_GALLERY_LIGHT_OPTIONS, "top");

const underpainting: StudioFilterGalleryEffectDef = {
  id: "artistic.underpainting",
  category: "artistic",
  label: "언더페인팅",
  description: "질감 있는 바탕에 흐릿하게 밑칠한 뒤 그 위에 다시 칠한 듯 부드러운 색 면과 캔버스 요철을 만듭니다.",
  references: ["Photoshop · 언더페인팅"],
  params: [UNDER_SIZE, UNDER_COVERAGE, UNDER_TEXTURE, SCALING, UNDER_RELIEF, UNDER_LIGHT],
  cost: 8,
  apply(image, params, context) {
    const size = sliderValue(params, UNDER_SIZE);
    const coverage = sliderValue(params, UNDER_COVERAGE) / 40;
    const { width, height } = image;
    const source = readPaintSource(image);
    let painted = fineBlurColor(source, source.weight, width, height, size * 0.6);
    painted = kuwahara(painted, source.weight, width, height, 1 + Math.round(size / 8), 3);
    const scaling = sliderValue(params, SCALING) / 100;
    const surface = textureHeight(selectValue(params, UNDER_TEXTURE), width, height, scaling, context.seed ^ 0x6c0b);
    for (let index = 0; index < width * height; index += 1) {
      // 텍스처 범위만큼 바탕 결의 높낮이가 밑칠 색의 명암으로 비친다.
      const lift = 1 + (surface[index] - 0.5) * 0.4 * coverage;
      painted.red[index] *= lift;
      painted.green[index] *= lift;
      painted.blue[index] *= lift;
    }
    writeColorPlanes(image, painted);
    applyRelief(image, surface, selectValue(params, UNDER_LIGHT), sliderValue(params, UNDER_RELIEF));
  },
};

// ── 잉크 스케치 ──────────────────────────────────────────────────

const INK_OUTLINE = slider("inkOutline", "잉크 윤곽", 0, 99, 50);
const INK_COLORING = slider("coloring", "채색", 0, 100, 50);
const INK_TONE = 18;

const inkSketch: StudioFilterGalleryEffectDef = {
  id: "artistic.ink-sketch",
  category: "artistic",
  label: "잉크 스케치",
  description: "윤곽과 어두운 주름을 잉크 선으로 긋고 그 아래 색은 옅고 부드러운 담채로 바꿉니다.",
  references: ["Paint.NET · 잉크 스케치"],
  params: [INK_OUTLINE, INK_COLORING],
  cost: 3,
  apply(image, params) {
    const outline = sliderValue(params, INK_OUTLINE) / 99;
    const coloring = sliderValue(params, INK_COLORING) / 100;
    const { width, height } = image;
    const source = readPaintSource(image);
    const soft = blurColor(source, source.weight, width, height, 1);
    const near = source.luma.slice(), far = source.luma.slice();
    gaussianBlur(near, width, height, 1);
    gaussianBlur(far, width, height, 3);
    const magnitude = gradientMagnitude(near, width, height);
    const threshold = 300 - outline * 220;
    for (let index = 0; index < width * height; index += 1) {
      const contour = smoothstep(threshold, threshold * 2 + 40, magnitude[index]);
      const crease = smoothstep(2, 14, far[index] - near[index]) * outline;
      const ink = clamp01(Math.max(contour, crease) * (0.35 + 0.65 * outline));
      const gray = 255 - (255 - near[index]) * 0.55;
      soft.red[index] = inkChannel(gray, soft.red[index], coloring, ink);
      soft.green[index] = inkChannel(gray, soft.green[index], coloring, ink);
      soft.blue[index] = inkChannel(gray, soft.blue[index], coloring, ink);
    }
    writeColorPlanes(image, soft);
  },
};

/** 회색 담채와 옅은 색 담채를 채색 비율로 섞고 잉크를 덮는다. */
function inkChannel(gray: number, color: number, coloring: number, ink: number): number {
  const wash = gray + (255 - (255 - color) * 0.8 - gray) * coloring;
  return wash + (INK_TONE - wash) * ink;
}

export const STUDIO_FILTER_GALLERY_ARTISTIC_EFFECTS: readonly StudioFilterGalleryEffectDef[] = [
  coloredPencil,
  dryBrush,
  fresco,
  neonGlow,
  paintDaubs,
  paletteKnife,
  plasticWrap,
  roughPastels,
  smudgeStick,
  sponge,
  underpainting,
  inkSketch,
];
