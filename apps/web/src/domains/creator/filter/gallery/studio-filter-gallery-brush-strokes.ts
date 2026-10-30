/**
 * 필터 갤러리 · 붓 터치 계열.
 *
 * 사진 편집기 필터 갤러리의 "붓 터치" 묶음(가장자리 강조·각진 획·어두운 획·잉크 윤곽선·뿌리기·스프레이 획·수묵화)을
 * 공개 매뉴얼의 기능 설명만 보고 공개 알고리즘으로 새로 구현했다.
 *   - 획: 백색 잡음을 실은 색을 알파 가중 방향 상자 평균으로 번져 붓결을 만든다(LIC 고정 방향형, Cabral·Leedom 1993).
 *   - 가장자리: 소벨 기울기, 분리형 최댓값 팽창(형태학 팽창), 가우시안 차(DoG, Marr·Hildreth 1980).
 *   - 뿌리기: 값 노이즈 변위장으로 반경 안 이웃 픽셀 하나를 보간 없이 그대로 가져온다.
 * 무작위는 모두 context.seed 를 섞은 정수 해시다. 알파는 그대로 두고, 평균·번짐은 알파 가중이다.
 */
import { clamp, hash2, luma, valueNoise2 } from "./studio-filter-gallery-kernel-utils";
import {
  blurColor,
  boxBlur,
  createColorPlanes,
  gaussianBlur,
  gradientMagnitude,
  kuwahara,
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

import type { ColorPlanes, PaintSource, StrokeDirection } from "./studio-filter-gallery-paint-helpers";
import type { StudioFilterGalleryEffectDef, StudioFilterGalleryImage } from "./studio-filter-gallery-types";

/** 색에 픽셀마다 같은 명도 잡음을 더한 사본. 방향으로 번지면 잡음이 붓결이 된다. */
function withStrokeNoise(source: PaintSource, width: number, height: number, seed: number, amplitude: number): ColorPlanes {
  const out = createColorPlanes(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const shift = (hash2(x, y, seed) - 0.5) * 2 * amplitude;
      out.red[index] = source.red[index] + shift;
      out.green[index] = source.green[index] + shift;
      out.blue[index] = source.blue[index] + shift;
    }
  }
  return out;
}

// ── 가장자리 강조 ────────────────────────────────────────────────

const EDGE_WIDTH = slider("edgeWidth", "가장자리 폭", 1, 14, 2);
const EDGE_BRIGHTNESS = slider("edgeBrightness", "가장자리 밝기", 0, 50, 38);
const EDGE_SMOOTHNESS = slider("smoothness", "매끄러움", 1, 15, 5);

/**
 * 공용 가우시안 흐림(상자 반지름 max(1, r/√3))을 상자 1 아래로 잇는다(제자리). 공용 흐림은 r < √3 이면 모두 상자
 * 1(σ≈1.41)로 같아 매끄러움 1~4 칸이 같은 결과를 냈다. 그 아래에서는 흐리지 않은 평면(상자 0)과 상자 1 결과를
 * r/√3 만큼 섞어, 이웃한 두 정수 상자를 섞는 공용 규약을 상자 0 까지 늘린다. r ≥ √3 이면 공용 흐림 그대로다.
 */
function gaussianBlurBelowOneBox(plane: Float32Array, width: number, height: number, radius: number): void {
  const box = radius / Math.sqrt(3);
  if (box >= 1) {
    gaussianBlur(plane, width, height, radius);
    return;
  }
  if (!(box > 0)) return;
  const blurred = plane.slice();
  gaussianBlur(blurred, width, height, Math.sqrt(3));
  for (let index = 0; index < plane.length; index += 1) plane[index] += (blurred[index] - plane[index]) * box;
}

/**
 * 분리형 최댓값 필터(정사각 팽창, 제자리). 창은 가로·세로 모두 정확히 size 픽셀 [x − before, x + after] 이고, 짝수
 * 폭은 뒤(오른쪽·아래)를 한 칸 더 본다. 대칭 반지름 floor((size − 1) / 2) 로 줄이면 짝수 폭이 바로 아래 홀수 폭과
 * 같은 결과를 내 슬라이더 칸 절반이 아무 일도 하지 않는다. 세로도 행 순서로 읽는다.
 */
function dilatePlane(plane: Float32Array, width: number, height: number, size: number): void {
  const span = Math.min(Math.floor(size), 2 * Math.max(width, height) + 1);
  if (span <= 1) return;
  const before = Math.floor((span - 1) / 2), after = span - 1 - before;
  const line = new Float32Array(width);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      let best = plane[row + x];
      const end = Math.min(width - 1, x + after);
      for (let k = Math.max(0, x - before); k <= end; k += 1) if (plane[row + k] > best) best = plane[row + k];
      line[x] = best;
    }
    plane.set(line, row);
  }
  const source = plane.slice();
  for (let y = 0; y < height; y += 1) {
    const end = Math.min(height - 1, y + after);
    line.set(source.subarray(y * width, y * width + width));
    for (let k = Math.max(0, y - before); k <= end; k += 1) {
      const other = k * width;
      for (let x = 0; x < width; x += 1) if (source[other + x] > line[x]) line[x] = source[other + x];
    }
    plane.set(line, y * width);
  }
}

const accentedEdges: StudioFilterGalleryEffectDef = {
  id: "brush-strokes.accented-edges",
  category: "brush-strokes",
  label: "가장자리 강조",
  description: "그림을 부드럽게 다듬고 가장자리를 밝기 값에 따라 흰 분필(높을 때) 또는 검은 잉크(낮을 때)로 강조합니다.",
  references: ["Photoshop · 가장자리 강조"],
  params: [EDGE_WIDTH, EDGE_BRIGHTNESS, EDGE_SMOOTHNESS],
  cost: 5,
  apply(image, params) {
    const edgeWidth = sliderValue(params, EDGE_WIDTH);
    const brightness = sliderValue(params, EDGE_BRIGHTNESS);
    const smoothness = sliderValue(params, EDGE_SMOOTHNESS);
    const { width, height } = image;
    const source = readPaintSource(image);
    // 매끄러움만큼 경계를 지키며 면을 다듬고(쿠와하라), 같은 만큼 흐린 휘도에서 가장자리를 찾는다. 매끄러움 1~4 의
    // 흐림 반지름 0.75~1.5 는 상자 1 아래라 상자 0 과 섞는다(기본값 5 의 1.75 부터는 공용 흐림 그대로).
    const base = kuwahara(source, source.weight, width, height, 1 + Math.floor(smoothness / 5), 6);
    const shade = source.luma.slice();
    gaussianBlurBelowOneBox(shade, width, height, 0.5 + smoothness * 0.25);
    const magnitude = gradientMagnitude(shade, width, height);
    dilatePlane(magnitude, width, height, edgeWidth);
    boxBlur(magnitude, width, height, 1);
    // 25 를 기준으로 위는 흰 분필, 아래는 검은 잉크. 기준에서 멀수록 강하게 칠한다.
    const chalk = brightness >= 25;
    const amount = 0.35 + (0.65 * Math.abs(brightness - 25)) / 25;
    for (let index = 0; index < width * height; index += 1) {
      const edge = smoothstep(50, 200, magnitude[index]) * amount;
      base.red[index] = accentChannel(base.red[index], chalk, edge);
      base.green[index] = accentChannel(base.green[index], chalk, edge);
      base.blue[index] = accentChannel(base.blue[index], chalk, edge);
    }
    writeColorPlanes(image, base);
  },
};

function accentChannel(value: number, chalk: boolean, edge: number): number {
  const target = chalk ? 255 - (255 - value) * 0.25 : value * 0.12;
  return value + (target - value) * edge;
}

// ── 각진 획 ──────────────────────────────────────────────────────

/**
 * 반지름이 소수인 알파 가중 방향 번짐. 상자 창은 정수 반지름이라 이웃한 두 정수 반지름 결과를 소수 부분만큼
 * 섞는다(공용 kuwaharaFractional 과 같은 방식). 반지름을 반올림하면 이웃한 획 길이 칸이 같은 결과를 냈다. 두 결과
 * 모두 보이는 픽셀 색의 알파 가중 평균이라 섞어도 투명 픽셀의 숨은 색이 들어오지 않는다. 작업량은 소수 부분이 있을
 * 때 두 배다.
 */
function smearColorFractional(
  colors: ColorPlanes,
  weight: Float32Array,
  width: number,
  height: number,
  direction: StrokeDirection,
  radius: number,
): ColorPlanes {
  const r = Math.max(0, radius), lower = Math.floor(r), fraction = r - lower;
  const low = smearColor(colors, weight, width, height, direction, lower);
  if (fraction <= 1e-3) return low;
  const high = smearColor(colors, weight, width, height, direction, lower + 1);
  for (let index = 0; index < weight.length; index += 1) {
    low.red[index] += (high.red[index] - low.red[index]) * fraction;
    low.green[index] += (high.green[index] - low.green[index]) * fraction;
    low.blue[index] += (high.blue[index] - low.blue[index]) * fraction;
  }
  return low;
}

/**
 * 결 길이가 소수인 결 노이즈(평균 0·표준편차 1). 같은 백색 잡음에서 만든 두 정수 길이 결을 소수 부분만큼 섞고, 두
 * 결이 완전히 같지는 않아 섞으면 표준편차가 1 아래로 내려가므로(반씩 섞을 때 반지름 0·1 은 약 0.89, 1·2 는 약
 * 0.94) 다시 1 로 맞춘다. 정수 길이면 공용 결 노이즈 그대로다.
 */
function streakNoiseFractional(width: number, height: number, seed: number, along: StrokeDirection, alongRadius: number): Float32Array {
  const r = Math.max(0, alongRadius), lower = Math.floor(r), fraction = r - lower;
  const low = streakNoise(width, height, seed, along, lower);
  if (fraction <= 1e-3) return low;
  const high = streakNoise(width, height, seed, along, lower + 1);
  let sum = 0, square = 0;
  for (let index = 0; index < low.length; index += 1) {
    const value = low[index] + (high[index] - low[index]) * fraction;
    low[index] = value;
    sum += value;
    square += value * value;
  }
  const mean = sum / Math.max(1, low.length);
  const variance = square / Math.max(1, low.length) - mean * mean;
  const scale = variance > 1e-12 ? 1 / Math.sqrt(variance) : 0;
  for (let index = 0; index < low.length; index += 1) low[index] = (low[index] - mean) * scale;
  return low;
}

/**
 * 한 방향 획 층: 색은 smearRadius 만큼만 번져 형태를 지키고, grainRadius 만큼 늘인 결 노이즈로 붓자국을 새긴다.
 * 두 반지름 모두 소수를 그대로 받는다(이웃한 두 정수 반지름 결과를 섞는다).
 */
function strokeLayer(
  source: PaintSource,
  width: number,
  height: number,
  direction: StrokeDirection,
  smearRadius: number,
  grainRadius: number,
  seed: number,
): ColorPlanes {
  const layer = smearColorFractional(source, source.weight, width, height, direction, smearRadius);
  const grain = streakNoiseFractional(width, height, seed, direction, grainRadius);
  for (let index = 0; index < width * height; index += 1) {
    const shift = grain[index] * 9;
    layer.red[index] += shift;
    layer.green[index] += shift;
    layer.blue[index] += shift;
  }
  return layer;
}

const DIRECTION_BALANCE = slider("directionBalance", "방향 균형", 0, 100, 50);
const ANGLED_LENGTH = slider("strokeLength", "획 길이", 3, 50, 15);
const ANGLED_SHARPNESS = slider("sharpness", "선명도", 0, 10, 3);

const angledStrokes: StudioFilterGalleryEffectDef = {
  id: "brush-strokes.angled-strokes",
  category: "brush-strokes",
  label: "각진 획",
  description: "밝은 곳과 어두운 곳을 방향 균형에 따라 서로 반대 방향의 대각선 획으로 다시 칠합니다.",
  references: ["Photoshop · 각진 획"],
  params: [DIRECTION_BALANCE, ANGLED_LENGTH, ANGLED_SHARPNESS],
  cost: 5,
  apply(image, params, context) {
    const balance = sliderValue(params, DIRECTION_BALANCE) / 100;
    const length = sliderValue(params, ANGLED_LENGTH);
    const sharpness = sliderValue(params, ANGLED_SHARPNESS) / 10;
    const { width, height } = image;
    const source = readPaintSource(image);
    const seed = context.seed ^ 0x6d01;
    // 색은 획 길이 L 의 약 1/4((L + 1) / 4)만 번지고 결은 약 1/2((L + 1) / 2)로 늘인다. 예전 Math.round(L / 4)·
    // Math.round(L / 2) 는 4k − 1 과 4k 를 같은 정수 반지름으로 묶어 슬라이더 칸 넷 중 하나가 아무 일도 하지 않았다.
    // 연속 반지름은 L ≡ 3 (mod 4)(기본값 15 의 4·8 포함)에서 예전과 같은 정수라 그 칸들의 출력은 그대로다.
    const smear = (length + 1) / 4, grain = (length + 1) / 2;
    const falling = strokeLayer(source, width, height, "diagonal-down", smear, grain, seed);
    const rising = strokeLayer(source, width, height, "diagonal-up", smear, grain, seed ^ 0x3);
    // 균형 0 이면 모두 "\" 획, 100 이면 모두 "/" 획. 그 사이에서는 휘도가 기준보다 밝은 곳이 "\" 획이다.
    const pivot = -0.12 + balance * 1.24;
    for (let index = 0; index < width * height; index += 1) {
      const choice = smoothstep(pivot - 0.12, pivot + 0.12, source.luma[index] / 255);
      falling.red[index] = rising.red[index] + (falling.red[index] - rising.red[index]) * choice;
      falling.green[index] = rising.green[index] + (falling.green[index] - rising.green[index]) * choice;
      falling.blue[index] = rising.blue[index] + (falling.blue[index] - rising.blue[index]) * choice;
    }
    sharpenColor(falling, source.weight, width, height, 1, sharpness * 1.8);
    writeColorPlanes(image, falling);
  },
};

// ── 어두운 획 ────────────────────────────────────────────────────

const DARK_BALANCE = slider("balance", "균형", 0, 10, 5);
const BLACK_INTENSITY = slider("blackIntensity", "검정 강도", 0, 10, 6);
const WHITE_INTENSITY = slider("whiteIntensity", "흰색 강도", 0, 10, 2);

const darkStrokes: StudioFilterGalleryEffectDef = {
  id: "brush-strokes.dark-strokes",
  category: "brush-strokes",
  label: "어두운 획",
  description: "어두운 곳은 짧고 촘촘한 획으로 검정에 가깝게, 밝은 곳은 반대 대각선의 긴 획으로 희게 칠합니다.",
  references: ["Photoshop · 어두운 획"],
  params: [DARK_BALANCE, BLACK_INTENSITY, WHITE_INTENSITY],
  cost: 3,
  apply(image, params, context) {
    const pivot = 0.25 + sliderValue(params, DARK_BALANCE) * 0.05;
    const black = 1 - 0.85 * (sliderValue(params, BLACK_INTENSITY) / 10);
    const white = 1 - 0.85 * (sliderValue(params, WHITE_INTENSITY) / 10);
    const { width, height } = image;
    const source = readPaintSource(image);
    const noisy = withStrokeNoise(source, width, height, context.seed ^ 0x6d02, 14);
    const short = smearColor(noisy, source.weight, width, height, "diagonal-down", 2);
    const long = smearColor(noisy, source.weight, width, height, "diagonal-up", 7);
    for (let index = 0; index < width * height; index += 1) {
      const light = smoothstep(pivot - 0.1, pivot + 0.1, source.luma[index] / 255);
      short.red[index] = darkStrokeChannel(short.red[index], long.red[index], black, white, light);
      short.green[index] = darkStrokeChannel(short.green[index], long.green[index], black, white, light);
      short.blue[index] = darkStrokeChannel(short.blue[index], long.blue[index], black, white, light);
    }
    writeColorPlanes(image, short);
  },
};

function darkStrokeChannel(short: number, long: number, black: number, white: number, light: number): number {
  const dark = short * black;
  return dark + (255 - (255 - long) * white - dark) * light;
}

// ── 잉크 윤곽선 ──────────────────────────────────────────────────

const INK_LENGTH = slider("strokeLength", "획 길이", 1, 50, 4);
const DARK_INTENSITY = slider("darkIntensity", "어두운 강도", 0, 50, 20);
const LIGHT_INTENSITY = slider("lightIntensity", "밝은 강도", 0, 50, 10);

/**
 * 윤곽선 가우시안 차의 먼 흐림 반지름. 공용 흐림은 반지름 r 을 상자 반지름 max(1, r/√3) 으로 3회 흐리므로 가까운
 * 흐림(반지름 1)은 상자 1(σ≈1.41)이고, 이 값은 상자가 정확히 2(σ≈2.45)라 섞기 없이 한 번만 흐린다. 반지름 2.5
 * (상자 1.44)처럼 상자 2 결과를 일부만 섞으면 차가 완전한 가우시안 차의 44% 로 줄어 중간 대비 경계에 윤곽선이 거의
 * 생기지 않는다. 대신 높은 대비 경계의 짙은 띠는 예전보다 약 두 배 두껍고 결이 있는 면에도 선이 더 생긴다.
 */
const INK_FAR_RADIUS = 2 * Math.sqrt(3);

const inkOutlines: StudioFilterGalleryEffectDef = {
  id: "brush-strokes.ink-outlines",
  category: "brush-strokes",
  label: "잉크 윤곽선",
  description: "펜과 잉크로 그린 듯 원래 세부 위에 가는 잉크 선과 빗금을 긋고 밝은 곳은 더 밝힙니다.",
  references: ["Photoshop · 잉크 윤곽선"],
  params: [INK_LENGTH, DARK_INTENSITY, LIGHT_INTENSITY],
  cost: 3,
  apply(image, params, context) {
    const length = sliderValue(params, INK_LENGTH);
    const dark = sliderValue(params, DARK_INTENSITY) / 50;
    const light = sliderValue(params, LIGHT_INTENSITY) / 50;
    const { width, height } = image;
    const source = readPaintSource(image);
    const near = source.luma.slice(), far = source.luma.slice();
    gaussianBlur(near, width, height, 1);
    gaussianBlur(far, width, height, INK_FAR_RADIUS);
    // 빗금 결 반지름은 획 길이의 절반을 반올림 없이 쓴다. 예전 Math.max(1, Math.round(L / 2)) 는 홀수 칸을 바로 위
    // 짝수 칸과 같게 만들어 슬라이더 칸 절반이 아무 일도 하지 않았다. 짝수 칸(기본값 4 포함)은 예전과 같은 정수 반지름이고,
    // 길이 1 은 반지름 0(점)과 1 사이를 섞어 길이 2 보다 짧은 빗금이 된다.
    const hatch = streakNoiseFractional(width, height, context.seed ^ 0x6d03, "diagonal-down", length / 2);
    const out = createColorPlanes(width * height);
    for (let index = 0; index < width * height; index += 1) {
      const tone = source.luma[index] / 255;
      // 주변보다 어두운 쪽 경계(가우시안 차)는 윤곽선, 어두운 면은 획 길이만큼 긴 가는 빗금으로 메운다.
      const line = smoothstep(1.5, 10, far[index] - near[index]);
      const density = Math.pow(1 - tone, 1.4) * 0.8;
      const stroke = smoothstep(0.94 - density, 1 - density, toUniform(hatch[index]));
      const ink = Math.max(line * 0.9, stroke) * (0.25 + 0.75 * dark);
      const lift = light * smoothstep(0.45, 0.95, tone) * 0.7;
      out.red[index] = inkOutlineChannel(source.red[index], ink, lift);
      out.green[index] = inkOutlineChannel(source.green[index], ink, lift);
      out.blue[index] = inkOutlineChannel(source.blue[index], ink, lift);
    }
    writeColorPlanes(image, out);
  },
};

function inkOutlineChannel(value: number, ink: number, lift: number): number {
  const inked = value * (1 - ink * 0.92);
  return inked + (255 - inked) * lift;
}

// ── 뿌리기 · 스프레이 획 ─────────────────────────────────────────

const SPATTER_RADIUS = slider("sprayRadius", "스프레이 반경", 0, 25, 10);
const SPATTER_SMOOTHNESS = slider("smoothness", "매끄러움", 1, 15, 5);

/** −1~1 변위. 매끈한 값 노이즈(칸 크기 cell)와 픽셀마다 다른 해시(speckle 비율)를 섞는다. */
function jitter(x: number, y: number, cell: number, speckle: number, seed: number): number {
  return ((1 - speckle) * valueNoise2(x / cell, y / cell, seed) + speckle * hash2(x, y, seed ^ 0x71) - 0.5) * 2;
}

/**
 * 픽셀마다 반경 radius 안의 이웃 하나를 골라 그 색을 그대로 가져온다(보간 없음, 알파는 그대로).
 * 투명한 이웃의 색은 보이지 않는 값이므로 가져오지 않는다. 반경은 소수를 그대로 받는다: 변위 jitter × 반경 × 1.6 을
 * 반올림해 정수 픽셀로 옮기고 ±round(반경) 안으로 자르므로, 반경이 조금만 바뀌어도 일부 픽셀의 옮김이 달라진다.
 * 반올림 뒤에 잘라 반경이 x.5 여도 양쪽 최대 옮김이 같다(Math.round(−x.5) 는 0 쪽으로 간다). 정수 반경에서는
 * 예전(반경을 먼저 반올림하고 자른 뒤 반올림)과 같은 결과다.
 */
function spray(image: StudioFilterGalleryImage, radius: number, smoothness: number, seed: number): void {
  const { width, height, data } = image;
  const reach = Math.min(radius, Math.max(width, height));
  if (!(reach > 0)) return;
  const limit = Math.round(reach);
  const source = data.slice();
  const cell = 0.6 + smoothness * 0.45;
  const speckle = 0.4 * (1 - ((smoothness - 1) / 14) * 0.75);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offsetX = clamp(Math.round(jitter(x, y, cell, speckle, seed) * reach * 1.6), -limit, limit);
      const offsetY = clamp(Math.round(jitter(x, y, cell, speckle, seed ^ 0x2f) * reach * 1.6), -limit, limit);
      const from = (clamp(y + offsetY, 0, height - 1) * width + clamp(x + offsetX, 0, width - 1)) * 4;
      const to = (y * width + x) * 4;
      if (source[from + 3] === 0 && source[to + 3] !== 0) continue;
      data[to] = source[from];
      data[to + 1] = source[from + 1];
      data[to + 2] = source[from + 2];
    }
  }
}

const spatter: StudioFilterGalleryEffectDef = {
  id: "brush-strokes.spatter",
  category: "brush-strokes",
  label: "뿌리기",
  description: "에어브러시로 흩뿌린 듯 픽셀마다 반경 안의 이웃 색을 가져와 얼룩지게 하며, 매끄러울수록 얼룩 덩어리가 커집니다.",
  references: ["Photoshop · 뿌리기"],
  params: [SPATTER_RADIUS, SPATTER_SMOOTHNESS],
  cost: 2,
  apply(image, params, context) {
    spray(image, sliderValue(params, SPATTER_RADIUS), sliderValue(params, SPATTER_SMOOTHNESS), context.seed ^ 0x6d04);
  },
};

const SPRAYED_LENGTH = slider("strokeLength", "획 길이", 0, 20, 12);
const SPRAYED_RADIUS = slider("sprayRadius", "스프레이 반경", 0, 25, 7);
const SPRAYED_DIRECTION = select("direction", "획 방향", [
  { value: "right-diagonal", label: "오른쪽 대각선" },
  { value: "horizontal", label: "가로" },
  { value: "left-diagonal", label: "왼쪽 대각선" },
  { value: "vertical", label: "세로" },
], "right-diagonal");
const SPRAYED_AXIS: Readonly<Record<(typeof SPRAYED_DIRECTION.options)[number]["value"], StrokeDirection>> = {
  "right-diagonal": "diagonal-up",
  horizontal: "horizontal",
  "left-diagonal": "diagonal-down",
  vertical: "vertical",
};

const sprayedStrokes: StudioFilterGalleryEffectDef = {
  id: "brush-strokes.sprayed-strokes",
  category: "brush-strokes",
  label: "스프레이 획",
  description: "주된 색을 흩뿌린 뒤 고른 방향으로 길게 끌어 스프레이로 비스듬히 뿜은 획처럼 다시 칠합니다.",
  references: ["Photoshop · 스프레이 획"],
  params: [SPRAYED_LENGTH, SPRAYED_RADIUS, SPRAYED_DIRECTION],
  cost: 4,
  apply(image, params, context) {
    const length = sliderValue(params, SPRAYED_LENGTH);
    const axis = SPRAYED_AXIS[selectValue(params, SPRAYED_DIRECTION)];
    // 흩뿌림은 반경의 5/7(약 70%)까지만 옮겨 주된 색 덩어리를 남기고, 그 위를 고른 방향 획으로 끈다. 옮김 반경을
    // 반올림하지 않아 반경 칸마다 옮김 분포가 달라진다(예전 Math.round(반경 × 0.7) 은 1·2, 5·6, 8·9 … 칸을 같게
    // 만들었다). 기본값 7 은 예전 반올림값과 같은 정수 5 다.
    spray(image, (sliderValue(params, SPRAYED_RADIUS) * 5) / 7, 2, context.seed ^ 0x6d05);
    const { width, height } = image;
    // 번짐 반지름 길이/3, 결 반지름 max(1, 길이 × 7/12): 예전 반올림(1.2배 길이의 1/4·1/2)은 0·1, 3·4, 6·7, 13·14,
    // 16·17 칸을 같은 정수 반지름으로 묶었다. 이 연속 반지름은 예전 반올림이 기본값 12 에서 낸 4·7 과 길이 0 의 0·1 을
    // 그대로 지나 두 칸의 출력은 같다.
    const smear = length / 3, grain = Math.max(1, (length * 7) / 12);
    writeColorPlanes(image, strokeLayer(readPaintSource(image), width, height, axis, smear, grain, context.seed ^ 0x6d06));
  },
};

// ── 수묵화 ───────────────────────────────────────────────────────

const SUMI_WIDTH = slider("strokeWidth", "획 너비", 3, 15, 10);
const SUMI_PRESSURE = slider("strokePressure", "획 압력", 0, 15, 2);
const SUMI_CONTRAST = slider("contrast", "대비", 0, 40, 16);

const sigmoid = (value: number): number => 1 / (1 + Math.exp(-value));

const sumiE: StudioFilterGalleryEffectDef = {
  id: "brush-strokes.sumi-e",
  category: "brush-strokes",
  label: "수묵화",
  description: "먹을 듬뿍 머금은 젖은 붓으로 화선지에 그린 듯 짙고 부드러운 먹색이 밝은 쪽으로 번지게 합니다.",
  references: ["Photoshop · 수묵화(Sumi-e)"],
  params: [SUMI_WIDTH, SUMI_PRESSURE, SUMI_CONTRAST],
  cost: 3,
  apply(image, params) {
    const strokeWidth = sliderValue(params, SUMI_WIDTH);
    const pressure = sliderValue(params, SUMI_PRESSURE) / 15;
    const steep = 1 + sliderValue(params, SUMI_CONTRAST) * 0.18;
    const { width, height } = image;
    const count = width * height;
    const source = readPaintSource(image);
    // 어두움을 알파 가중으로 넓게 흐려 젖은 먹이 종이로 스며드는 범위를 만든다.
    const wet = new Float32Array(count), mass = source.weight.slice();
    for (let index = 0; index < count; index += 1) wet[index] = (1 - source.luma[index] / 255) * source.weight[index];
    gaussianBlur(wet, width, height, strokeWidth * 0.6);
    gaussianBlur(mass, width, height, strokeWidth * 0.6);
    const soft = blurColor(source, source.weight, width, height, 0.8 + strokeWidth * 0.1);
    const low = sigmoid(-0.5 * steep), high = sigmoid(0.5 * steep);
    for (let index = 0; index < count; index += 1) {
      const darkness = 1 - source.luma[index] / 255;
      const bleed = mass[index] > 1e-5 ? wet[index] / mass[index] : darkness;
      const soaked = Math.min(1, Math.max(darkness, bleed * (1.15 + 0.35 * pressure)) * (0.9 + 0.5 * pressure));
      const ink = (sigmoid((soaked - 0.5) * steep) - low) / (high - low);
      const gray = luma(soft.red[index], soft.green[index], soft.blue[index]);
      soft.red[index] = sumiChannel(soft.red[index], gray, ink);
      soft.green[index] = sumiChannel(soft.green[index], gray, ink);
      soft.blue[index] = sumiChannel(soft.blue[index], gray, ink);
    }
    writeColorPlanes(image, soft);
  },
};

/** 색을 화선지처럼 조금 빼고 먹 농도만큼 검게 누른다. */
const sumiChannel = (value: number, gray: number, ink: number): number => (value + (gray - value) * 0.4) * (1 - ink * 0.94);

export const STUDIO_FILTER_GALLERY_BRUSH_STROKES_EFFECTS: readonly StudioFilterGalleryEffectDef[] = [
  accentedEdges,
  angledStrokes,
  darkStrokes,
  inkOutlines,
  spatter,
  sprayedStrokes,
  sumiE,
];
