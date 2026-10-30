/**
 * 필터 갤러리 · 픽셀화(pixelate) 계열 5종.
 *
 * 단면화(구조 보존 사분면 평균), 조각(다중 사본 평균), 메조틴트(무작위 문턱 이진화), 비디오 열화(형광체 마스크),
 * 픽셀 아트(축소·팔레트·디더링·외곽선)를 공개 알고리즘과 기능 설명만으로 새로 구현했다.
 *   - 단면화: 최소 분산 사분면 평균(Kuwahara·Hachimura·Eiho·Kinoshita 1976).
 *   - 픽셀 아트: 중앙값 분할 팔레트(Heckbert 1982), 오차 확산(Floyd·Steinberg 1976), 순서 디더(Bayer 1973 행렬).
 * 평균을 내는 효과는 알파로 가중해 투명 픽셀의 색이 번지지 않게 한다. 단면화·메조틴트·비디오 열화는 알파를 그대로 두고,
 * 조각은 사본 알파의 평균을 쓰며, 픽셀 아트는 칸마다 평균 알파를 0 또는 255 로 고정한다. 크기 매개변수는 이미지 px
 * 단위이고(context.scale 은 쓰지 않는다), 무작위성은 context.seed 에서 파생한 결정적 해시·노이즈다.
 */
import {
  booleanParam,
  clamp,
  clamp01,
  hash2,
  luma,
  numberParam,
  stringParam,
  valueNoise2,
} from "./studio-filter-gallery-kernel-utils";

import type {
  StudioFilterGalleryContext,
  StudioFilterGalleryEffectDef,
  StudioFilterGalleryImage,
  StudioFilterGalleryParamSpec,
  StudioFilterGalleryParams,
} from "./studio-filter-gallery-types";

// ── 매개변수 명세 도구 ─────────────────────────────────────────────

type SliderSpec = Extract<StudioFilterGalleryParamSpec, { control: "slider" }>;
type ToggleSpec = Extract<StudioFilterGalleryParamSpec, { control: "toggle" }>;

interface SelectSpec<T extends string> {
  readonly key: string;
  readonly label: string;
  readonly control: "select";
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly default: T;
}

function slider(key: string, label: string, min: number, max: number, step: number, value: number, suffix?: string): SliderSpec {
  const spec: SliderSpec = { key, label, control: "slider", min, max, step, default: value };
  return suffix ? { ...spec, suffix } : spec;
}

function select<T extends string>(key: string, label: string, options: readonly (readonly [T, string])[], value: NoInfer<T>): SelectSpec<T> {
  return { key, label, control: "select", options: options.map(([option, text]) => ({ value: option, label: text })), default: value };
}

const toggle = (key: string, label: string, value: boolean): ToggleSpec => ({ key, label, control: "toggle", default: value });

/** 명세와 같은 최소·최대·기본값으로 슬라이더 값을 읽는다. */
const readSlider = (params: StudioFilterGalleryParams, spec: SliderSpec): number =>
  numberParam(params, spec.key, spec.default, spec.min, spec.max);

/** 명세의 선택지 안에서만 값을 읽는다(목록 밖이면 기본값). */
const readSelect = <T extends string>(params: StudioFilterGalleryParams, spec: SelectSpec<T>): T =>
  stringParam(params, spec.key, spec.options.map((option) => option.value), spec.default);

const readToggle = (params: StudioFilterGalleryParams, spec: ToggleSpec): boolean => booleanParam(params, spec.key, spec.default);

const clampIndex = (index: number, size: number): number => (index < 0 ? 0 : index >= size ? size - 1 : index);

// ── 단면화 ─────────────────────────────────────────────────────

const FACET_STRENGTH = slider("strength", "강도", 1, 8, 1, 2);

/**
 * 왼쪽 위 모서리가 (x, y) 인 (r+1)×(r+1) 상자 합을 x ∈ [-r, width), y ∈ [-r, height) 전부에 대해 구한다(가장자리 복제).
 * out 은 (width + r) × (height + r) 평면, temp 는 (width + r) × height 이상이다. 누적 합을 밀어 가므로 r 과 무관한 O(N) 이다.
 */
function cornerBoxSums(source: Float32Array, width: number, height: number, r: number, temp: Float32Array, out: Float32Array): void {
  const paddedWidth = width + r;
  for (let y = 0; y < height; y += 1) {
    const row = y * width, tempRow = y * paddedWidth;
    let sum = 0;
    for (let i = 0; i <= r; i += 1) sum += source[row + clampIndex(i - r, width)];
    for (let x = -r; x < width; x += 1) {
      temp[tempRow + x + r] = sum;
      sum += source[row + clampIndex(x + r + 1, width)] - source[row + clampIndex(x, width)];
    }
  }
  const running = new Float64Array(paddedWidth);
  for (let j = 0; j <= r; j += 1) {
    const row = clampIndex(j - r, height) * paddedWidth;
    for (let column = 0; column < paddedWidth; column += 1) running[column] += temp[row + column];
  }
  for (let y = -r; y < height; y += 1) {
    const outRow = (y + r) * paddedWidth;
    const addRow = clampIndex(y + r + 1, height) * paddedWidth, removeRow = clampIndex(y, height) * paddedWidth;
    for (let column = 0; column < paddedWidth; column += 1) {
      out[outRow + column] = running[column];
      running[column] += temp[addRow + column] - temp[removeRow + column];
    }
  }
}

/** 사분면(0 왼쪽 위, 1 오른쪽 위, 2 왼쪽 아래, 3 오른쪽 아래)의 왼쪽 위 모서리 → 덧댄 평면 번호. 가운데 픽셀을 함께 포함한다. */
const quadrantBox = (x: number, y: number, quadrant: number, radius: number, paddedWidth: number): number =>
  (y + (quadrant < 2 ? 0 : radius)) * paddedWidth + x + ((quadrant & 1) === 0 ? 0 : radius);

function applyFacet(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams): void {
  const { width, height, data } = image;
  const radius = Math.round(readSlider(params, FACET_STRENGTH));
  const count = width * height, paddedWidth = width + radius, paddedSize = paddedWidth * (height + radius);
  const values = new Float32Array(count), temp = new Float32Array(paddedWidth * height);
  const alphaSums = new Float32Array(paddedSize), firstSums = new Float32Array(paddedSize), secondSums = new Float32Array(paddedSize);
  // 알파 가중 휘도의 0·1·2차 상자 합 → 사분면마다 가중 평균과 분산을 O(1) 로 읽는다.
  for (let index = 0; index < count; index += 1) values[index] = data[index * 4 + 3] / 255;
  cornerBoxSums(values, width, height, radius, temp, alphaSums);
  for (let index = 0, offset = 0; index < count; index += 1, offset += 4) {
    values[index] = (data[offset + 3] / 255) * (luma(data[offset], data[offset + 1], data[offset + 2]) / 255);
  }
  cornerBoxSums(values, width, height, radius, temp, firstSums);
  for (let index = 0, offset = 0; index < count; index += 1, offset += 4) {
    const level = luma(data[offset], data[offset + 1], data[offset + 2]) / 255;
    values[index] = (data[offset + 3] / 255) * level * level;
  }
  cornerBoxSums(values, width, height, radius, temp, secondSums);
  // 픽셀마다 휘도 분산이 가장 작은 사분면을 고른다(255 = 네 사분면이 모두 투명해 원래 색을 둔다).
  const chosen = new Uint8Array(count);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let best = 255, bestVariance = Infinity;
      for (let quadrant = 0; quadrant < 4; quadrant += 1) {
        const box = quadrantBox(x, y, quadrant, radius, paddedWidth);
        const weight = alphaSums[box];
        if (!(weight > 1e-4)) continue;
        const mean = firstSums[box] / weight;
        const variance = secondSums[box] / weight - mean * mean;
        if (variance < bestVariance) { bestVariance = variance; best = quadrant; }
      }
      chosen[y * width + x] = best;
    }
  }
  // 고른 사분면의 알파 가중 평균색을 채널마다 쓴다(채널 c 를 다 읽은 뒤에만 c 를 덮어쓴다). 알파는 그대로다.
  for (let channel = 0; channel < 3; channel += 1) {
    for (let index = 0, offset = 0; index < count; index += 1, offset += 4) values[index] = (data[offset + 3] / 255) * data[offset + channel];
    cornerBoxSums(values, width, height, radius, temp, firstSums);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x, quadrant = chosen[index];
        if (quadrant === 255) continue;
        const box = quadrantBox(x, y, quadrant, radius, paddedWidth);
        data[index * 4 + channel] = firstSums[box] / alphaSums[box];
      }
    }
  }
}

// ── 조각 ───────────────────────────────────────────────────────

const FRAGMENT_COUNT = slider("count", "사본 수", 2, 16, 1, 4);
const FRAGMENT_DISTANCE = slider("distance", "거리", 1, 100, 1, 4, "px");
const FRAGMENT_ROTATION = slider("rotation", "회전", 0, 360, 1, 45, "°");

/** 정수에 아주 가까운 이동(cos·sin 의 부동소수 찌꺼기)을 정수로 붙인다. 그래야 축 방향 사본이 이웃 픽셀을 섞지 않는다. */
const snapShift = (value: number): number => {
  const nearest = Math.round(value);
  return Math.abs(value - nearest) < 1e-9 ? nearest : value;
};

function applyFragment(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams): void {
  const copies = Math.round(readSlider(params, FRAGMENT_COUNT));
  const distance = readSlider(params, FRAGMENT_DISTANCE);
  const rotation = (readSlider(params, FRAGMENT_ROTATION) * Math.PI) / 180;
  const { width, height, data } = image;
  const source = data.slice();
  // 사본은 고른 각도로 같은 거리만큼 민다. 민 거리를 정수 픽셀로 반올림하면 거리·회전 여러 칸이 같은 그림이 되므로(기본값의
  // 회전 360칸 중 328칸), 소수 위치는 이웃 네 픽셀을 쌍선형 가중치로 읽는다. 정수 이동(회전 0·90·180·270°)은 한 픽셀만 읽어
  // 예전처럼 또렷하다. 탭마다 가중치 × 알파로 색을 섞어 투명 픽셀의 숨은 RGB 가 새지 않는다. 그림 밖은 가장자리 반복이다.
  const tapX = new Int32Array(copies * 4), tapY = new Int32Array(copies * 4), tapWeight = new Float64Array(copies * 4);
  let taps = 0, lowX = 0, highX = 0, lowY = 0, highY = 0;
  for (let copy = 0; copy < copies; copy += 1) {
    const angle = rotation + (copy * 2 * Math.PI) / copies;
    const shiftX = snapShift(Math.cos(angle) * distance), shiftY = snapShift(Math.sin(angle) * distance);
    const baseX = Math.floor(shiftX), baseY = Math.floor(shiftY), fractionX = shiftX - baseX, fractionY = shiftY - baseY;
    for (let corner = 0; corner < 4; corner += 1) {
      const weight = ((corner & 1) === 0 ? 1 - fractionX : fractionX) * (corner < 2 ? 1 - fractionY : fractionY);
      if (weight === 0) continue;
      tapX[taps] = baseX + (corner & 1); tapY[taps] = baseY + (corner >> 1); tapWeight[taps] = weight;
      lowX = Math.min(lowX, tapX[taps]); highX = Math.max(highX, tapX[taps]); lowY = Math.min(lowY, tapY[taps]); highY = Math.max(highY, tapY[taps]);
      taps += 1;
    }
  }
  // 알파를 곱한 색(정수라 Float32 로 정확하다)을 미리 펴 둔다. 모든 탭이 그림 안인 픽셀은 고정 오프셋으로 읽고, 나머지는
  // 행마다 한 번 접어 둔 탭 행에 열만 접어 읽는다.
  const premultiplied = new Float32Array(source.length);
  for (let offset = 0; offset < source.length; offset += 4) {
    const opacity = source[offset + 3];
    premultiplied[offset] = source[offset] * opacity; premultiplied[offset + 1] = source[offset + 1] * opacity;
    premultiplied[offset + 2] = source[offset + 2] * opacity; premultiplied[offset + 3] = opacity;
  }
  const tapOffset = new Int32Array(taps), tapRow = new Int32Array(taps);
  for (let tap = 0; tap < taps; tap += 1) tapOffset[tap] = (tapY[tap] * width + tapX[tap]) * 4;
  const insideStart = -lowX, insideEnd = width - highX;
  for (let y = 0; y < height; y += 1) {
    const insideY = y + lowY >= 0 && y + highY < height;
    for (let tap = 0; tap < taps; tap += 1) tapRow[tap] = clampIndex(y + tapY[tap], height) * width;
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      let red = 0, green = 0, blue = 0, alpha = 0;
      if (insideY && x >= insideStart && x < insideEnd) {
        for (let tap = 0; tap < taps; tap += 1) {
          const from = offset + tapOffset[tap], share = tapWeight[tap];
          red += premultiplied[from] * share; green += premultiplied[from + 1] * share; blue += premultiplied[from + 2] * share;
          alpha += premultiplied[from + 3] * share;
        }
      } else {
        for (let tap = 0; tap < taps; tap += 1) {
          const from = (tapRow[tap] + clampIndex(x + tapX[tap], width)) * 4, share = tapWeight[tap];
          red += premultiplied[from] * share; green += premultiplied[from + 1] * share; blue += premultiplied[from + 2] * share;
          alpha += premultiplied[from + 3] * share;
        }
      }
      if (alpha > 0) {
        data[offset] = red / alpha; data[offset + 1] = green / alpha; data[offset + 2] = blue / alpha;
      } else {
        // 탭이 모두 투명하면(결과 알파 0) 숨은 색의 단순 평균을 남긴다.
        let plainRed = 0, plainGreen = 0, plainBlue = 0;
        for (let tap = 0; tap < taps; tap += 1) {
          const from = (tapRow[tap] + clampIndex(x + tapX[tap], width)) * 4, share = tapWeight[tap];
          plainRed += source[from] * share; plainGreen += source[from + 1] * share; plainBlue += source[from + 2] * share;
        }
        data[offset] = plainRed / copies; data[offset + 1] = plainGreen / copies; data[offset + 2] = plainBlue / copies;
      }
      data[offset + 3] = alpha / copies;
    }
  }
}

// ── 메조틴트 ───────────────────────────────────────────────────

const MEZZOTINT_TYPE = select("type", "유형", [
  ["fine-dots", "미세 점"],
  ["medium-dots", "중간 점"],
  ["grainy-dots", "거친 점"],
  ["coarse-dots", "굵은 점"],
  ["short-lines", "짧은 선"],
  ["medium-lines", "중간 선"],
  ["long-lines", "긴 선"],
  ["short-strokes", "짧은 획"],
  ["medium-strokes", "중간 획"],
  ["long-strokes", "긴 획"],
], "medium-dots");

type MezzotintType = (typeof MEZZOTINT_TYPE)["default"];

const MEZZOTINT_BINS = 1024;
/** 획은 약 35° 로 기울이고, 넓은 영역마다 +/- 방향을 바꿔 손으로 그은 해칭처럼 보이게 한다. */
const STROKE_COS = Math.cos(0.61), STROKE_SIN = Math.sin(0.61);

/** 문턱값 무늬(0~1). 점 = 크기가 다른 덩어리 노이즈, 선 = 가로로 길게 늘인 노이즈, 획 = 기울여 늘인 노이즈. */
function mezzotintPattern(type: MezzotintType, x: number, y: number, seed: number): number {
  const grain = hash2(x, y, seed + 1);
  switch (type) {
    case "fine-dots": return grain;
    case "medium-dots": return 0.65 * valueNoise2(x / 1.6, y / 1.6, seed) + 0.35 * grain;
    case "grainy-dots": return 0.5 * valueNoise2(x / 2.6, y / 2.6, seed) + 0.5 * grain;
    case "coarse-dots": return 0.8 * valueNoise2(x / 3.4, y / 3.4, seed) + 0.2 * grain;
    case "short-lines": return 0.85 * valueNoise2(x / 4, y / 0.9, seed) + 0.15 * grain;
    case "medium-lines": return 0.85 * valueNoise2(x / 9, y / 0.9, seed) + 0.15 * grain;
    case "long-lines": return 0.85 * valueNoise2(x / 20, y / 0.9, seed) + 0.15 * grain;
    default: {
      const length = type === "short-strokes" ? 3.5 : type === "medium-strokes" ? 7 : 14;
      const sign = valueNoise2(x / 24, y / 24, seed + 2) > 0.5 ? 1 : -1;
      const u = x * STROKE_COS + sign * y * STROKE_SIN, v = y * STROKE_COS - sign * x * STROKE_SIN;
      return 0.85 * valueNoise2(u / length, v / 1.1, seed) + 0.15 * grain;
    }
  }
}

function applyMezzotint(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams, context: StudioFilterGalleryContext): void {
  const type = readSelect(params, MEZZOTINT_TYPE);
  const { width, height, data } = image;
  const count = width * height;
  const pattern = new Float32Array(count);
  const histogram = new Uint32Array(MEZZOTINT_BINS), ranks = new Float32Array(MEZZOTINT_BINS);
  for (let channel = 0; channel < 3; channel += 1) {
    const seed = context.seed + 0x4d5a + channel * 7919;
    histogram.fill(0);
    for (let y = 0, index = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1, index += 1) {
        const value = clamp01(mezzotintPattern(type, x, y, seed));
        pattern[index] = value;
        histogram[Math.min(MEZZOTINT_BINS - 1, Math.floor(value * MEZZOTINT_BINS))] += 1;
      }
    }
    // 무늬 분포를 히스토그램 평활화로 고르게 펴서 문턱값이 0~1 에 고르게 퍼지게 한다(평균 밝기 보존).
    let below = 0;
    for (let bin = 0; bin < MEZZOTINT_BINS; bin += 1) {
      ranks[bin] = (below + histogram[bin] / 2) / count;
      below += histogram[bin];
    }
    for (let index = 0; index < count; index += 1) {
      const threshold = ranks[Math.min(MEZZOTINT_BINS - 1, Math.floor(pattern[index] * MEZZOTINT_BINS))];
      const offset = index * 4 + channel;
      data[offset] = data[offset] / 255 > threshold ? 255 : 0;
    }
  }
}

// ── 비디오 열화 ─────────────────────────────────────────────────

const VIDEO_PATTERN = select("pattern", "무늬", [
  ["staggered", "엇갈림"],
  ["large-staggered", "큰 엇갈림"],
  ["striped", "줄무늬"],
  ["wide-striped", "넓은 줄무늬"],
  ["long-staggered", "긴 엇갈림"],
  ["3x3", "3×3"],
  ["large-3x3", "큰 3×3"],
  ["hex", "육각"],
  ["dots", "점"],
], "staggered");
const VIDEO_ADDITIVE = toggle("additive", "더하기", false);
const VIDEO_ROTATED = toggle("rotated", "90° 회전", false);

type VideoPattern = (typeof VIDEO_PATTERN)["default"];

/**
 * 형광체 무늬 타일. 글자 하나가 픽셀 하나이고 r·g·b 는 그 채널만 켜진 형광체, k 는 꺼진 틈이다. scale 은 글자 하나가 덮는
 * 픽셀 수다. 엇갈림 = 슬롯 마스크, 줄무늬 = 애퍼처 그릴, 3×3 = 대각 배열, 육각·점 = 삼각(델타) 배열 섀도 마스크를 본떴다.
 */
const VIDEO_MASKS: Readonly<Record<VideoPattern, { readonly rows: readonly string[]; readonly scale: number }>> = {
  staggered: { rows: ["rgbrgb", "rgbkkk", "rgbrgb", "kkkrgb"], scale: 1 },
  "large-staggered": { rows: ["rgbrgb", "rgbkkk", "rgbrgb", "kkkrgb"], scale: 2 },
  striped: { rows: ["rgb"], scale: 1 },
  "wide-striped": { rows: ["rgb"], scale: 2 },
  "long-staggered": { rows: ["rgbrgb", "rgbrgb", "rgbkkk", "rgbrgb", "rgbrgb", "kkkrgb"], scale: 1 },
  "3x3": { rows: ["rgb", "brg", "gbr"], scale: 1 },
  "large-3x3": { rows: ["rgb", "brg", "gbr"], scale: 2 },
  hex: { rows: ["rrggbb", "rrggbb", "gbbrrg", "gbbrrg"], scale: 1 },
  dots: { rows: ["rkgkbk", "kkkkkk", "gkbkrk", "kkkkkk"], scale: 1 },
};

/** 곱하기에서 꺼진 형광체가 남기는 밝기(완전한 검정 대신 아주 어두운 잔상). */
const VIDEO_FLOOR = 0.12;

function applyVideoDegradation(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams): void {
  const mask = VIDEO_MASKS[readSelect(params, VIDEO_PATTERN)];
  const additive = readToggle(params, VIDEO_ADDITIVE);
  const rotated = readToggle(params, VIDEO_ROTATED);
  const tileHeight = mask.rows.length, tileWidth = mask.rows[0].length;
  const factors = new Float32Array(tileWidth * tileHeight * 3);
  let sum = 0;
  for (let row = 0; row < tileHeight; row += 1) {
    for (let column = 0; column < tileWidth; column += 1) {
      const code = mask.rows[row].charAt(column);
      for (let channel = 0; channel < 3; channel += 1) {
        const lit = code === "rgb".charAt(channel) ? 1 : 0;
        // 더하기: 켜진 채널만 원래 값의 80% 를 더한다. 곱하기: 켜진 채널은 그대로, 꺼진 채널은 바닥 밝기로 줄인다.
        const factor = additive ? 1 + 0.8 * lit : VIDEO_FLOOR + (1 - VIDEO_FLOOR) * lit;
        factors[(row * tileWidth + column) * 3 + channel] = factor;
        sum += factor;
      }
    }
  }
  if (!additive) {
    // 곱하기는 평균 밝기가 크게 떨어지므로 그 손실의 일부(제곱근만큼)를 되돌린다. 밝은 형광체는 포화될 수 있다.
    const gain = clamp(1 / Math.sqrt(sum / factors.length), 1, 2);
    for (let index = 0; index < factors.length; index += 1) factors[index] *= gain;
  }
  const { width, height, data } = image;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = Math.floor((rotated ? y : x) / mask.scale) % tileWidth;
      const v = Math.floor((rotated ? x : y) / mask.scale) % tileHeight;
      const factor = (v * tileWidth + u) * 3, offset = (y * width + x) * 4;
      data[offset] *= factors[factor];
      data[offset + 1] *= factors[factor + 1];
      data[offset + 2] *= factors[factor + 2];
    }
  }
}

// ── 픽셀 아트 ───────────────────────────────────────────────────

const PIXEL_SIZE = slider("pixelSize", "픽셀 크기", 2, 32, 1, 6, "px");
const PIXEL_COLORS = slider("colors", "색 수", 2, 64, 1, 16);
const PIXEL_DITHERING = select("dithering", "디더링", [["none", "없음"], ["bayer", "베이어"], ["floyd", "플로이드-스타인버그"]], "none");
const PIXEL_OUTLINE = toggle("outline", "외곽선", true);

/** 4×4 Bayer 순서 디더 행렬(0~15, 행 우선). */
const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

const bin5 = (value: number): number => clamp(Math.floor(value / 8), 0, 31);

/**
 * 중앙값 분할 팔레트(Heckbert 1982). 불투명 칸 색을 채널당 5비트 히스토그램에 모은 뒤, "범위 × 칸 수"가 가장 큰 상자를
 * 가장 긴 축의 칸 수 가중 중앙값에서 나누기를 maxColors 개가 될 때까지 되풀이한다. 상자마다 칸 평균색(정수)을 돌려준다.
 */
function medianCutPalette(colors: Float32Array, opaque: Uint8Array, maxColors: number): Float32Array {
  const counts = new Uint32Array(32768), sums = new Float64Array(32768 * 3);
  for (let cell = 0; cell < opaque.length; cell += 1) {
    if (opaque[cell] === 0) continue;
    const red = colors[cell * 3], green = colors[cell * 3 + 1], blue = colors[cell * 3 + 2];
    const key = (bin5(red) << 10) | (bin5(green) << 5) | bin5(blue);
    counts[key] += 1;
    sums[key * 3] += red; sums[key * 3 + 1] += green; sums[key * 3 + 2] += blue;
  }
  let used = 0;
  for (let key = 0; key < counts.length; key += 1) if (counts[key] > 0) used += 1;
  const keys = new Int32Array(used);
  for (let key = 0, cursor = 0; key < counts.length; key += 1) {
    if (counts[key] > 0) { keys[cursor] = key; cursor += 1; }
  }
  // boxes 는 [시작, 끝) 쌍을 이어 붙인 목록이다.
  const boxes: number[] = used > 0 ? [0, used] : [];
  while (boxes.length / 2 < maxColors) {
    let pick = -1, pickScore = 0, pickShift = 0;
    for (let box = 0; box < boxes.length; box += 2) {
      const start = boxes[box], end = boxes[box + 1];
      if (end - start < 2) continue;
      let population = 0, lowR = 31, highR = 0, lowG = 31, highG = 0, lowB = 31, highB = 0;
      for (let cursor = start; cursor < end; cursor += 1) {
        const key = keys[cursor], red = key >> 10, green = (key >> 5) & 31, blue = key & 31;
        population += counts[key];
        lowR = Math.min(lowR, red); highR = Math.max(highR, red);
        lowG = Math.min(lowG, green); highG = Math.max(highG, green);
        lowB = Math.min(lowB, blue); highB = Math.max(highB, blue);
      }
      const rangeR = highR - lowR, rangeG = highG - lowG, rangeB = highB - lowB;
      const range = Math.max(rangeR, rangeG, rangeB);
      if (range > 0 && range * population > pickScore) {
        pick = box; pickScore = range * population;
        pickShift = range === rangeG ? 5 : range === rangeR ? 10 : 0;
      }
    }
    if (pick < 0) break;
    const start = boxes[pick], end = boxes[pick + 1], shift = pickShift;
    // 축 값이 같으면 키로 순서를 정해 엔진과 무관하게 같은 분할을 얻는다.
    keys.subarray(start, end).sort((left, right) => ((left >> shift) & 31) - ((right >> shift) & 31) || left - right);
    let total = 0;
    for (let cursor = start; cursor < end; cursor += 1) total += counts[keys[cursor]];
    let running = 0, split = start + 1;
    for (let cursor = start; cursor < end - 1; cursor += 1) {
      running += counts[keys[cursor]];
      split = cursor + 1;
      if (running * 2 >= total) break;
    }
    boxes.splice(pick, 2, start, split, split, end);
  }
  const palette = new Float32Array((boxes.length / 2) * 3);
  for (let box = 0; box < boxes.length; box += 2) {
    let population = 0, red = 0, green = 0, blue = 0;
    for (let cursor = boxes[box]; cursor < boxes[box + 1]; cursor += 1) {
      const key = keys[cursor];
      population += counts[key];
      red += sums[key * 3]; green += sums[key * 3 + 1]; blue += sums[key * 3 + 2];
    }
    const entry = (box / 2) * 3;
    palette[entry] = Math.round(red / population);
    palette[entry + 1] = Math.round(green / population);
    palette[entry + 2] = Math.round(blue / population);
  }
  return palette;
}

/** 팔레트에서 가장 가까운 색 번호(가중 유클리드). 채널당 6비트로 묶은 색마다 한 번만 전수 탐색한다(cache 255 = 미계산). */
function nearestPaletteIndex(palette: Float32Array, cache: Uint8Array, red: number, green: number, blue: number): number {
  const r = clamp(Math.round(red), 0, 255) >> 2, g = clamp(Math.round(green), 0, 255) >> 2, b = clamp(Math.round(blue), 0, 255) >> 2;
  const key = (r << 12) | (g << 6) | b;
  const cached = cache[key];
  if (cached !== 255) return cached;
  const centerR = r * 4 + 2, centerG = g * 4 + 2, centerB = b * 4 + 2;
  let best = 0, bestDistance = Infinity;
  for (let entry = 0; entry * 3 < palette.length; entry += 1) {
    const dr = palette[entry * 3] - centerR, dg = palette[entry * 3 + 1] - centerG, db = palette[entry * 3 + 2] - centerB;
    const distance = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
    if (distance < bestDistance) { bestDistance = distance; best = entry; }
  }
  cache[key] = best;
  return best;
}

/** 불투명 칸마다 팔레트 번호를 고른다. bayer 는 칸 좌표 순서 디더, floyd 는 칸 단위 오차 확산(투명 칸은 건너뛴다). */
function assignPalette(
  colors: Float32Array,
  opaque: Uint8Array,
  columns: number,
  rows: number,
  palette: Float32Array,
  dithering: (typeof PIXEL_DITHERING)["default"],
): Uint8Array {
  const assigned = new Uint8Array(columns * rows);
  const cache = new Uint8Array(1 << 18).fill(255);
  // 순서 디더 진폭은 팔레트 색 간격(대략 255 / ∛색 수)의 절반 남짓으로 잡는다.
  const spread = 96 / Math.cbrt(Math.max(1, palette.length / 3));
  let current = new Float32Array((columns + 2) * 3), next = new Float32Array((columns + 2) * 3);
  const value = new Float32Array(3);
  for (let row = 0; row < rows; row += 1) {
    next.fill(0);
    for (let column = 0; column < columns; column += 1) {
      const cell = row * columns + column, slot = (column + 1) * 3;
      if (opaque[cell] === 0) continue;
      const dither = dithering === "bayer" ? ((BAYER_4[(row & 3) * 4 + (column & 3)] + 0.5) / 16 - 0.5) * spread : 0;
      for (let channel = 0; channel < 3; channel += 1) {
        const diffused = dithering === "floyd" ? current[slot + channel] : 0;
        value[channel] = clamp(colors[cell * 3 + channel] + dither + diffused, 0, 255);
      }
      const index = nearestPaletteIndex(palette, cache, value[0], value[1], value[2]);
      assigned[cell] = index;
      if (dithering !== "floyd") continue;
      // Floyd–Steinberg(1976): 오차를 오른쪽 7/16, 왼쪽 아래 3/16, 아래 5/16, 오른쪽 아래 1/16 로 나눈다.
      for (let channel = 0; channel < 3; channel += 1) {
        const error = value[channel] - palette[index * 3 + channel];
        current[slot + 3 + channel] += (error * 7) / 16;
        next[slot - 3 + channel] += (error * 3) / 16;
        next[slot + channel] += (error * 5) / 16;
        next[slot + 3 + channel] += error / 16;
      }
    }
    const swap = current;
    current = next;
    next = swap;
  }
  return assigned;
}

function applyPixelArt(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams): void {
  const { width, height, data } = image;
  const size = Math.max(1, Math.min(Math.round(readSlider(params, PIXEL_SIZE)), Math.max(width, height)));
  const maxColors = Math.round(readSlider(params, PIXEL_COLORS));
  const dithering = readSelect(params, PIXEL_DITHERING);
  const outline = readToggle(params, PIXEL_OUTLINE);
  const columns = Math.ceil(width / size), rows = Math.ceil(height / size), cells = columns * rows;
  // 1) 칸마다 알파 가중 평균색과 평균 알파. 평균 알파가 절반 이상이면 불투명(255), 아니면 투명(0) 칸이다.
  const sums = new Float64Array(cells * 4), counts = new Uint32Array(cells);
  for (let y = 0; y < height; y += 1) {
    const rowCell = Math.floor(y / size) * columns;
    for (let x = 0; x < width; x += 1) {
      const cell = rowCell + Math.floor(x / size), offset = (y * width + x) * 4, alpha = data[offset + 3];
      sums[cell * 4] += data[offset] * alpha;
      sums[cell * 4 + 1] += data[offset + 1] * alpha;
      sums[cell * 4 + 2] += data[offset + 2] * alpha;
      sums[cell * 4 + 3] += alpha;
      counts[cell] += 1;
    }
  }
  const colors = new Float32Array(cells * 3), opaque = new Uint8Array(cells);
  for (let cell = 0; cell < cells; cell += 1) {
    const alphaSum = sums[cell * 4 + 3];
    opaque[cell] = alphaSum >= 127.5 * counts[cell] ? 1 : 0;
    if (alphaSum <= 0) continue;
    for (let channel = 0; channel < 3; channel += 1) colors[cell * 3 + channel] = sums[cell * 4 + channel] / alphaSum;
  }
  // 2) 팔레트 → 3) 디더링 대응 → 4) 불투명 실루엣 테두리 칸을 팔레트의 가장 어두운 색으로 칠한다.
  const palette = medianCutPalette(colors, opaque, maxColors);
  const assigned = assignPalette(colors, opaque, columns, rows, palette, dithering);
  if (outline && palette.length > 0) {
    let darkest = 0;
    for (let entry = 1; entry * 3 < palette.length; entry += 1) {
      if (luma(palette[entry * 3], palette[entry * 3 + 1], palette[entry * 3 + 2])
        < luma(palette[darkest * 3], palette[darkest * 3 + 1], palette[darkest * 3 + 2])) darkest = entry;
    }
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const cell = row * columns + column;
        if (opaque[cell] === 0) continue;
        const border = (column > 0 && opaque[cell - 1] === 0) || (column < columns - 1 && opaque[cell + 1] === 0)
          || (row > 0 && opaque[cell - columns] === 0) || (row < rows - 1 && opaque[cell + columns] === 0);
        if (border) assigned[cell] = darkest;
      }
    }
  }
  // 5) 최근접 확대. 투명 칸은 평균색을 남기되 알파 0 이다.
  for (let y = 0; y < height; y += 1) {
    const rowCell = Math.floor(y / size) * columns;
    for (let x = 0; x < width; x += 1) {
      const cell = rowCell + Math.floor(x / size), offset = (y * width + x) * 4;
      if (opaque[cell] === 1) {
        const entry = assigned[cell] * 3;
        data[offset] = palette[entry]; data[offset + 1] = palette[entry + 1]; data[offset + 2] = palette[entry + 2]; data[offset + 3] = 255;
      } else {
        data[offset] = colors[cell * 3]; data[offset + 1] = colors[cell * 3 + 1]; data[offset + 2] = colors[cell * 3 + 2]; data[offset + 3] = 0;
      }
    }
  }
}

export const STUDIO_FILTER_GALLERY_PIXELATE_EFFECTS: readonly StudioFilterGalleryEffectDef[] = [
  {
    id: "pixelate.facet",
    category: "pixelate",
    label: "단면화",
    description: "가운데 픽셀을 품은 네 사분면 중 휘도 분산이 가장 작은 쪽의 알파 가중 평균색을 골라 비슷한 색을 평평한 면으로 뭉칩니다(알파 유지).",
    references: ["Photoshop · 단면화"],
    params: [FACET_STRENGTH],
    cost: 2.5,
    apply: applyFacet,
  },
  {
    id: "pixelate.fragment",
    category: "pixelate",
    label: "조각",
    description: "고른 각도로 같은 거리만큼 밀린 사본 여러 장을 알파 가중으로 평균해 흔들린 다중 노출처럼 만듭니다(알파도 사본 평균).",
    references: ["Photoshop · 조각", "Paint.NET · 조각"],
    params: [FRAGMENT_COUNT, FRAGMENT_DISTANCE, FRAGMENT_ROTATION],
    cost: 1.6,
    apply: applyFragment,
  },
  {
    id: "pixelate.mezzotint",
    category: "pixelate",
    label: "메조틴트 패턴",
    description: "채널마다 고른 모양(점·선·획)의 무작위 문턱값으로 이진화해 0과 255만 남긴 동판화 메조틴트 무늬를 만듭니다(알파 유지).",
    references: ["Photoshop · 메조틴트"],
    params: [MEZZOTINT_TYPE],
    cost: 3,
    apply: applyMezzotint,
  },
  {
    id: "pixelate.video-degradation",
    category: "pixelate",
    label: "비디오 열화",
    description: "브라운관 형광체·섀도 마스크 같은 RGB 무늬를 색에 곱하거나 더해 오래된 화면처럼 만듭니다(알파 유지).",
    references: ["GIMP · 비디오 열화"],
    params: [VIDEO_PATTERN, VIDEO_ADDITIVE, VIDEO_ROTATED],
    cost: 0.5,
    apply: applyVideoDegradation,
  },
  {
    id: "pixelate.pixel-art",
    category: "pixelate",
    label: "픽셀 아트",
    description: "칸마다 알파 가중 평균으로 줄이고 중앙값 분할 팔레트·디더링·외곽선을 거쳐 최근접 확대해 픽셀 아트로 만듭니다(칸 알파는 평균에 따라 0 또는 255).",
    references: ["Aseprite · 픽셀 아트 작업 흐름", "Photoshop · 모자이크+인덱스 색상"],
    params: [PIXEL_SIZE, PIXEL_COLORS, PIXEL_DITHERING, PIXEL_OUTLINE],
    cost: 0.7,
    apply: applyPixelArt,
  },
];
