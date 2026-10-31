/**
 * 필터 갤러리 · 색 계열.
 *
 * 기존 필터에 없는 색 변환만 모았다(디더·색 줄이기·채널 최대/최소·ASC CDL·컬러 스플래시·분할 토닝·적응형 임계값·
 * 닷지/번·명도 반전·레티넥스). 모두 공개 알고리즘을 새로 구현했다.
 *   - 오차 확산: Floyd–Steinberg 1976, Jarvis–Judice–Ninke 1976, Stucki 1981, Burkes 1988, Sierra 1989, Atkinson(맥페인트).
 *   - 색 줄이기: Heckbert 1982 중앙값 자르기(median cut).
 *   - 레티넥스: Jobson·Rahman·Woodell 1997 다중 척도 레티넥스와 색 복원(MSRCR).
 * 알파는 적응형 임계값의 "종이 투명" 선택을 빼면 그대로 둔다.
 */
import {
  booleanParam, clamp, clamp01, clamp255, colorParam, gaussianPlane, hslToRgb, luma, numberParam, rgbToHsv, stringParam,
  boxBlurPlane,
} from "./studio-filter-gallery-kernel-utils";

import type { StudioFilterGalleryEffectDef, StudioFilterGalleryImage } from "./studio-filter-gallery-types";

/** 알파가 이보다 작은 픽셀은 양자화·오차 확산에서 뺀다(보이지 않는 픽셀이 오차를 빨아들이지 않게). */
const VISIBLE_ALPHA = 8;

const DITHER_ALGORITHMS = ["floyd-steinberg", "atkinson", "jarvis", "stucki", "burkes", "sierra", "sierra-lite"] as const;
type DitherAlgorithm = (typeof DITHER_ALGORITHMS)[number];
type DiffusionTap = readonly [dx: number, dy: number, weight: number];

/** 오차 확산 커널. 가중치 합 / divisor 가 1 보다 작은 앳킨슨은 오차의 3/4 만 퍼뜨리는 것이 원래 설계다. */
const DIFFUSION_KERNELS: Readonly<Record<DitherAlgorithm, { readonly divisor: number; readonly taps: readonly DiffusionTap[] }>> = {
  "floyd-steinberg": { divisor: 16, taps: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] },
  atkinson: { divisor: 8, taps: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]] },
  jarvis: {
    divisor: 48,
    taps: [[1, 0, 7], [2, 0, 5], [-2, 1, 3], [-1, 1, 5], [0, 1, 7], [1, 1, 5], [2, 1, 3], [-2, 2, 1], [-1, 2, 3], [0, 2, 5], [1, 2, 3], [2, 2, 1]],
  },
  stucki: {
    divisor: 42,
    taps: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2], [-2, 2, 1], [-1, 2, 2], [0, 2, 4], [1, 2, 2], [2, 2, 1]],
  },
  burkes: { divisor: 32, taps: [[1, 0, 8], [2, 0, 4], [-2, 1, 2], [-1, 1, 4], [0, 1, 8], [1, 1, 4], [2, 1, 2]] },
  sierra: {
    divisor: 32,
    taps: [[1, 0, 5], [2, 0, 3], [-2, 1, 2], [-1, 1, 4], [0, 1, 5], [1, 1, 4], [2, 1, 2], [-1, 2, 2], [0, 2, 3], [1, 2, 2]],
  },
  "sierra-lite": { divisor: 4, taps: [[1, 0, 2], [-1, 1, 1], [0, 1, 1]] },
};

type Quantizer = (red: number, green: number, blue: number, out: Float32Array) => void;

/**
 * 오차 확산 공용 루프. 작업 버퍼에 원래 RGB 를 담고, 픽셀마다 quantize 로 고른 색과의 차이를 아직 처리하지 않은
 * 이웃에 커널 가중치대로 나눠 준다. serpentine 이면 홀수 줄을 오른쪽→왼쪽으로 훑어 방향성 무늬를 줄인다.
 */
function diffuseError(
  image: StudioFilterGalleryImage,
  algorithm: DitherAlgorithm,
  serpentine: boolean,
  quantize: Quantizer,
  grayscale: boolean,
): void {
  const { width, height, data } = image;
  const count = width * height;
  const work = new Float32Array(count * 3);
  for (let index = 0, offset = 0; index < count; index += 1, offset += 4) {
    if (grayscale) {
      const gray = luma(data[offset]!, data[offset + 1]!, data[offset + 2]!);
      work[index * 3] = gray; work[index * 3 + 1] = gray; work[index * 3 + 2] = gray;
    } else {
      work[index * 3] = data[offset]!; work[index * 3 + 1] = data[offset + 1]!; work[index * 3 + 2] = data[offset + 2]!;
    }
  }
  const kernel = DIFFUSION_KERNELS[algorithm];
  const chosen = new Float32Array(3);
  for (let y = 0; y < height; y += 1) {
    const reverse = serpentine && (y & 1) === 1;
    for (let step = 0; step < width; step += 1) {
      const x = reverse ? width - 1 - step : step;
      const index = y * width + x;
      const offset = index * 4;
      if (data[offset + 3]! < VISIBLE_ALPHA) continue;
      const base = index * 3;
      const red = clamp255(work[base]!), green = clamp255(work[base + 1]!), blue = clamp255(work[base + 2]!);
      quantize(red, green, blue, chosen);
      data[offset] = chosen[0]!; data[offset + 1] = chosen[1]!; data[offset + 2] = chosen[2]!;
      const errorRed = red - chosen[0]!, errorGreen = green - chosen[1]!, errorBlue = blue - chosen[2]!;
      for (const [tapX, tapY, weight] of kernel.taps) {
        const nx = x + (reverse ? -tapX : tapX), ny = y + tapY;
        if (nx < 0 || nx >= width || ny >= height) continue;
        const neighbour = ny * width + nx;
        if (data[neighbour * 4 + 3]! < VISIBLE_ALPHA) continue;
        const share = weight / kernel.divisor;
        work[neighbour * 3] += errorRed * share;
        work[neighbour * 3 + 1] += errorGreen * share;
        work[neighbour * 3 + 2] += errorBlue * share;
      }
    }
  }
}

const levelQuantizer = (levels: number): Quantizer => {
  const steps = Math.max(1, Math.round(levels) - 1);
  const snap = (value: number): number => Math.round((value / 255) * steps) * (255 / steps);
  return (red, green, blue, out) => { out[0] = snap(red); out[1] = snap(green); out[2] = snap(blue); };
};

/** 15비트 색 키 → 가장 가까운 팔레트 번호. 같은 색을 매번 전수 탐색하지 않도록 지연 채운다. */
function paletteQuantizer(palette: Float32Array): Quantizer {
  const entries = palette.length / 3;
  const cache = new Int16Array(32768).fill(-1);
  return (red, green, blue, out) => {
    const key = ((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3);
    let best = cache[key]!;
    if (best < 0) {
      let bestDistance = Infinity;
      for (let entry = 0; entry < entries; entry += 1) {
        const dr = palette[entry * 3]! - red, dg = palette[entry * 3 + 1]! - green, db = palette[entry * 3 + 2]! - blue;
        // 사람 눈의 민감도를 거칠게 반영한 가중 유클리드 거리.
        const distance = 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
        if (distance < bestDistance) { bestDistance = distance; best = entry; }
      }
      cache[key] = best;
    }
    out[0] = palette[best * 3]!; out[1] = palette[best * 3 + 1]!; out[2] = palette[best * 3 + 2]!;
  };
}

/**
 * Heckbert 중앙값 자르기. 보이는 픽셀을 약 65,536개 표본으로 모은 뒤, "범위 × 개수"가 가장 큰 상자를 가장 긴 축의
 * 중앙값에서 둘로 나누기를 원하는 색 수가 될 때까지 되풀이하고, 상자마다 평균색을 팔레트로 쓴다. 보이는 픽셀이 없으면 null.
 * 표본은 가로·세로 같은 간격의 격자에서 행마다 시작 열을 바꿔 고른다 — 평면 색인을 일정 간격으로 고르면 너비가 간격의
 * 배수일 때 같은 열만 뽑혀 그 사이의 색(세로 막대, 좁은 그림)이 팔레트에서 빠진다.
 */
export function medianCutPalette(image: StudioFilterGalleryImage, colors: number): Float32Array | null {
  const { width, height, data } = image;
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 65536)));
  const samples: number[] = [];
  for (let y = 0, row = 0; y < height; y += step, row += 1) {
    for (let x = (row * 5) % step; x < width; x += step) {
      const offset = (y * width + x) * 4;
      if (data[offset + 3]! >= VISIBLE_ALPHA) samples.push(data[offset]!, data[offset + 1]!, data[offset + 2]!);
    }
  }
  const sampleCount = samples.length / 3;
  if (sampleCount === 0) return null;
  const order = new Uint32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) order[index] = index;
  const boxes: { start: number; end: number }[] = [{ start: 0, end: sampleCount }];
  const measure = (box: { start: number; end: number }): { axis: number; range: number } => {
    let best = { axis: 0, range: -1 };
    for (let axis = 0; axis < 3; axis += 1) {
      let low = 255, high = 0;
      for (let cursor = box.start; cursor < box.end; cursor += 1) {
        const value = samples[order[cursor]! * 3 + axis]!;
        if (value < low) low = value;
        if (value > high) high = value;
      }
      if (high - low > best.range) best = { axis, range: high - low };
    }
    return best;
  };
  const target = clamp(Math.round(colors), 1, 256);
  while (boxes.length < target) {
    let pick = -1, pickScore = 0, pickAxis = 0;
    for (let boxIndex = 0; boxIndex < boxes.length; boxIndex += 1) {
      const box = boxes[boxIndex]!;
      const size = box.end - box.start;
      if (size < 2) continue;
      const { axis, range } = measure(box);
      const score = range * size;
      if (range > 0 && score > pickScore) { pick = boxIndex; pickScore = score; pickAxis = axis; }
    }
    if (pick < 0) break;
    const box = boxes[pick]!;
    order.subarray(box.start, box.end).sort((left, right) => samples[left * 3 + pickAxis]! - samples[right * 3 + pickAxis]!);
    const middle = box.start + ((box.end - box.start) >> 1);
    boxes.splice(pick, 1, { start: box.start, end: middle }, { start: middle, end: box.end });
  }
  const palette = new Float32Array(boxes.length * 3);
  boxes.forEach((box, boxIndex) => {
    let red = 0, green = 0, blue = 0;
    for (let cursor = box.start; cursor < box.end; cursor += 1) {
      const sample = order[cursor]! * 3;
      red += samples[sample]!; green += samples[sample + 1]!; blue += samples[sample + 2]!;
    }
    const size = Math.max(1, box.end - box.start);
    palette[boxIndex * 3] = Math.round(red / size);
    palette[boxIndex * 3 + 1] = Math.round(green / size);
    palette[boxIndex * 3 + 2] = Math.round(blue / size);
  });
  return palette;
}

/** 팔레트를 그대로(디더 없이) 입힌다. */
function mapToPalette(image: StudioFilterGalleryImage, quantize: Quantizer): void {
  const { data } = image;
  const chosen = new Float32Array(3);
  for (let offset = 0; offset < data.length; offset += 4) {
    if (data[offset + 3]! < VISIBLE_ALPHA) continue;
    quantize(data[offset]!, data[offset + 1]!, data[offset + 2]!, chosen);
    data[offset] = chosen[0]!; data[offset + 1] = chosen[1]!; data[offset + 2] = chosen[2]!;
  }
}

const smoothstep = (t: number): number => {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
};

/** 0~255 값 LUT 를 RGB 세 채널에 똑같이 적용한다. */
function applyLut(image: StudioFilterGalleryImage, lut: Uint8ClampedArray): void {
  const { data } = image;
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = lut[data[offset]!]!;
    data[offset + 1] = lut[data[offset + 1]!]!;
    data[offset + 2] = lut[data[offset + 2]!]!;
  }
}

const DITHER_PALETTES = ["black-white", "gray4", "rgb8", "levels"] as const;

const errorDiffusionDither: StudioFilterGalleryEffectDef = {
  id: "color.error-diffusion-dither",
  category: "color",
  label: "오차 확산 디더",
  description: "적은 색으로 줄이면서 남는 오차를 이웃 픽셀로 퍼뜨려 점묘 같은 계조를 만듭니다.",
  references: ["Paint.NET · 디더링", "GIMP · 디더", "Krita · 디더", "Photoshop · 인덱스 색상(확산 디더)"],
  params: [
    {
      key: "algorithm", label: "알고리즘", control: "select", default: "floyd-steinberg",
      options: [
        { value: "floyd-steinberg", label: "플로이드-스타인버그" }, { value: "atkinson", label: "앳킨슨" },
        { value: "jarvis", label: "자비스-주디스-닌케" }, { value: "stucki", label: "스투키" },
        { value: "burkes", label: "버크스" }, { value: "sierra", label: "시에라" }, { value: "sierra-lite", label: "시에라 라이트" },
      ],
    },
    {
      key: "palette", label: "팔레트", control: "select", default: "rgb8",
      options: [
        { value: "black-white", label: "흑백" }, { value: "gray4", label: "회색 4단계" },
        { value: "rgb8", label: "RGB 8색" }, { value: "levels", label: "채널 단계" },
      ],
    },
    { key: "levels", label: "채널 단계 수", control: "slider", min: 2, max: 16, step: 1, default: 4 },
    { key: "serpentine", label: "지그재그 훑기", control: "toggle", default: true },
  ],
  cost: 3,
  apply(image, params) {
    const algorithm = stringParam(params, "algorithm", DITHER_ALGORITHMS, "floyd-steinberg");
    const palette = stringParam(params, "palette", DITHER_PALETTES, "rgb8");
    const levels = numberParam(params, "levels", 4, 2, 16);
    const serpentine = booleanParam(params, "serpentine", true);
    const quantize: Quantizer = palette === "black-white"
      ? levelQuantizer(2)
      : palette === "gray4" ? levelQuantizer(4) : palette === "rgb8" ? levelQuantizer(2) : levelQuantizer(levels);
    diffuseError(image, algorithm, serpentine, quantize, palette === "black-white" || palette === "gray4");
  },
};

const quantize: StudioFilterGalleryEffectDef = {
  id: "color.quantize",
  category: "color",
  label: "색 줄이기",
  description: "그림에서 대표 색을 뽑아 지정한 색 수의 팔레트로 다시 칠합니다.",
  references: ["Paint.NET · 양자화", "Krita · 팔레트화", "Photoshop · 인덱스 색상", "GIMP · 인덱스 모드 변환"],
  params: [
    { key: "colors", label: "색 수", control: "slider", min: 2, max: 256, step: 1, default: 16 },
    { key: "dither", label: "오차 확산", control: "toggle", default: false },
  ],
  cost: 4,
  apply(image, params) {
    const colors = numberParam(params, "colors", 16, 2, 256);
    const palette = medianCutPalette(image, colors);
    if (!palette) return;
    const quantizer = paletteQuantizer(palette);
    if (booleanParam(params, "dither", false)) diffuseError(image, "floyd-steinberg", true, quantizer, false);
    else mapToPalette(image, quantizer);
  },
};

const channelExtreme: StudioFilterGalleryEffectDef = {
  id: "color.channel-extreme",
  category: "color",
  label: "채널 최대화 / 최소화",
  description: "픽셀마다 가장 큰(또는 가장 작은) 채널만 남기고 나머지 채널을 0으로 만듭니다.",
  references: ["Krita · 채널 최대화", "Krita · 채널 최소화", "GIMP · 최대 RGB"],
  params: [
    {
      key: "mode", label: "방식", control: "select", default: "maximize",
      options: [{ value: "maximize", label: "최대 채널만" }, { value: "minimize", label: "최소 채널만" }],
    },
  ],
  cost: 0.2,
  apply(image, params) {
    const maximize = stringParam(params, "mode", ["maximize", "minimize"] as const, "maximize") === "maximize";
    const { data } = image;
    for (let offset = 0; offset < data.length; offset += 4) {
      const red = data[offset]!, green = data[offset + 1]!, blue = data[offset + 2]!;
      const pick = maximize ? Math.max(red, green, blue) : Math.min(red, green, blue);
      // 같은 값이 둘 이상이면 모두 남긴다.
      if (red !== pick) data[offset] = 0;
      if (green !== pick) data[offset + 1] = 0;
      if (blue !== pick) data[offset + 2] = 0;
    }
  },
};

const slopeOffsetPower: StudioFilterGalleryEffectDef = {
  id: "color.slope-offset-power",
  category: "color",
  label: "기울기·오프셋·거듭제곱",
  description: "영상 색보정의 ASC CDL 식(입력×기울기+오프셋)^거듭제곱과 채도로 톤을 다듬습니다.",
  references: ["Krita · 기울기·오프셋·거듭제곱", "ASC CDL · 색 결정 목록"],
  params: [
    { key: "slope", label: "기울기", control: "slider", min: 0, max: 4, step: 0.01, default: 1.2 },
    { key: "offset", label: "오프셋", control: "slider", min: -0.5, max: 0.5, step: 0.01, default: -0.05 },
    { key: "power", label: "거듭제곱", control: "slider", min: 0.2, max: 4, step: 0.01, default: 1.1 },
    { key: "saturation", label: "채도", control: "slider", min: 0, max: 2, step: 0.01, default: 1.15 },
  ],
  cost: 0.3,
  apply(image, params) {
    const slope = numberParam(params, "slope", 1.2, 0, 4);
    const offsetValue = numberParam(params, "offset", -0.05, -0.5, 0.5);
    const power = numberParam(params, "power", 1.1, 0.2, 4);
    const saturation = numberParam(params, "saturation", 1.15, 0, 2);
    const lut = new Float32Array(256);
    for (let value = 0; value < 256; value += 1) lut[value] = Math.pow(clamp01((value / 255) * slope + offsetValue), power);
    const { data } = image;
    for (let offset = 0; offset < data.length; offset += 4) {
      const red = lut[data[offset]!]!, green = lut[data[offset + 1]!]!, blue = lut[data[offset + 2]!]!;
      // ASC CDL 의 채도 단계는 Rec.709 휘도를 축으로 쓴다.
      const gray = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      data[offset] = clamp01(gray + saturation * (red - gray)) * 255;
      data[offset + 1] = clamp01(gray + saturation * (green - gray)) * 255;
      data[offset + 2] = clamp01(gray + saturation * (blue - gray)) * 255;
    }
  },
};

const colorSplash: StudioFilterGalleryEffectDef = {
  id: "color.color-splash",
  category: "color",
  label: "컬러 스플래시",
  description: "고른 색상 범위만 원래 색으로 남기고 나머지를 흑백으로 바꿉니다.",
  references: ["사진 앱 공통 · 컬러 스플래시"],
  params: [
    { key: "hue", label: "남길 색상", control: "slider", min: 0, max: 360, step: 1, default: 0, suffix: "°" },
    { key: "range", label: "범위", control: "slider", min: 5, max: 180, step: 1, default: 40, suffix: "°" },
    { key: "feather", label: "경계 부드럽게", control: "slider", min: 0, max: 90, step: 1, default: 20, suffix: "°" },
    { key: "minSaturation", label: "최소 채도", control: "slider", min: 0, max: 100, step: 1, default: 15, suffix: "%" },
  ],
  cost: 0.6,
  apply(image, params) {
    const hue = numberParam(params, "hue", 0, 0, 360);
    const half = numberParam(params, "range", 40, 5, 180) / 2;
    const feather = numberParam(params, "feather", 20, 0, 90);
    const minSaturation = numberParam(params, "minSaturation", 15, 0, 100) / 100;
    const hsv = new Float32Array(3);
    const { data } = image;
    for (let offset = 0; offset < data.length; offset += 4) {
      const red = data[offset]!, green = data[offset + 1]!, blue = data[offset + 2]!;
      rgbToHsv(red, green, blue, hsv);
      const raw = Math.abs(hsv[0]! * 360 - hue) % 360;
      const distance = Math.min(raw, 360 - raw);
      let keep = distance <= half ? 1 : feather > 0 ? 1 - smoothstep((distance - half) / feather) : 0;
      if (minSaturation > 0) keep *= smoothstep(hsv[1]! / minSaturation);
      const gray = luma(red, green, blue);
      data[offset] = gray + (red - gray) * keep;
      data[offset + 1] = gray + (green - gray) * keep;
      data[offset + 2] = gray + (blue - gray) * keep;
    }
  },
};

const splitToning: StudioFilterGalleryEffectDef = {
  id: "color.split-toning",
  category: "color",
  label: "분할 토닝",
  description: "어두운 영역과 밝은 영역에 서로 다른 색조를 입히되 밝기는 그대로 둡니다.",
  references: ["Lightroom · 분할 토닝"],
  params: [
    { key: "highlightHue", label: "밝은 영역 색상", control: "slider", min: 0, max: 360, step: 1, default: 40, suffix: "°" },
    { key: "highlightSaturation", label: "밝은 영역 채도", control: "slider", min: 0, max: 100, step: 1, default: 40, suffix: "%" },
    { key: "shadowHue", label: "어두운 영역 색상", control: "slider", min: 0, max: 360, step: 1, default: 215, suffix: "°" },
    { key: "shadowSaturation", label: "어두운 영역 채도", control: "slider", min: 0, max: 100, step: 1, default: 45, suffix: "%" },
    // 균형 ±90 이 기준 밝기(pivot) 0.05~0.95 끝이다. 예전 ±100 범위는 pivot 을 그 끝에 붙여 ±90~±100 의 20칸이 같은 결과였다.
    // 범위만 좁혔으므로 저장된 ±90 너머 값은 ±90 으로 정규화되어 예전과 같은 그림이 된다.
    { key: "balance", label: "균형", control: "slider", min: -90, max: 90, step: 1, default: 0 },
  ],
  cost: 0.5,
  apply(image, params) {
    const tint = (hue: number, saturation: number): [number, number, number] => {
      const rgb = new Float32Array(3);
      hslToRgb(hue / 360, 1, 0.5, rgb);
      const gray = luma(rgb[0]!, rgb[1]!, rgb[2]!);
      return [(rgb[0]! - gray) * saturation, (rgb[1]! - gray) * saturation, (rgb[2]! - gray) * saturation];
    };
    const highlight = tint(numberParam(params, "highlightHue", 40, 0, 360), numberParam(params, "highlightSaturation", 40, 0, 100) / 100);
    const shadow = tint(numberParam(params, "shadowHue", 215, 0, 360), numberParam(params, "shadowSaturation", 45, 0, 100) / 100);
    // 두 색조가 늘 조금은 남도록 pivot 은 0.05~0.95 안에 있다(균형 범위 ±90 이 바로 그 끝). clamp 는 0.5 − 90/200 의
    // 부동소수 오차(0.04999…)만 끝값으로 맞춰, 예전 범위의 같은 값과 비트까지 같은 pivot 을 낸다.
    const pivot = clamp(0.5 - numberParam(params, "balance", 0, -90, 90) / 200, 0.05, 0.95);
    const { data } = image;
    for (let offset = 0; offset < data.length; offset += 4) {
      const red = data[offset]!, green = data[offset + 1]!, blue = data[offset + 2]!;
      const original = luma(red, green, blue);
      const level = original / 255;
      const shadowWeight = level < pivot ? smoothstep(1 - level / pivot) : 0;
      const highlightWeight = level > pivot ? smoothstep((level - pivot) / (1 - pivot)) : 0;
      let nextRed = red + (shadow[0] * shadowWeight + highlight[0] * highlightWeight) * 0.6;
      let nextGreen = green + (shadow[1] * shadowWeight + highlight[1] * highlightWeight) * 0.6;
      let nextBlue = blue + (shadow[2] * shadowWeight + highlight[2] * highlightWeight) * 0.6;
      // 색조만 바꾸고 밝기는 원래 휘도로 되돌린다.
      const shift = original - luma(nextRed, nextGreen, nextBlue);
      nextRed += shift; nextGreen += shift; nextBlue += shift;
      data[offset] = nextRed; data[offset + 1] = nextGreen; data[offset + 2] = nextBlue;
    }
  },
};

const adaptiveThreshold: StudioFilterGalleryEffectDef = {
  id: "color.adaptive-threshold",
  category: "color",
  label: "적응형 임계값",
  description: "주변 평균보다 어두운 픽셀만 잉크로 남겨 조명이 고르지 않은 스캔 선화도 깨끗한 흑백으로 바꿉니다(종이 투명을 켜면 알파가 바뀝니다).",
  references: ["OpenCV · 적응형 임계값", "ImageJ · 국소 자동 임계값", "Clip Studio Paint · 선화 추출(작업 흐름)"],
  params: [
    { key: "radius", label: "주변 반경", control: "slider", min: 1, max: 100, step: 1, default: 12, suffix: "px" },
    { key: "offset", label: "민감도", control: "slider", min: -50, max: 50, step: 1, default: 8 },
    {
      key: "method", label: "주변 평균", control: "select", default: "mean",
      options: [{ value: "mean", label: "평균" }, { value: "gaussian", label: "가우시안" }],
    },
    { key: "inkColor", label: "잉크 색", control: "color", default: "#000000" },
    { key: "transparentPaper", label: "종이를 투명하게", control: "toggle", default: false },
  ],
  cost: 2,
  apply(image, params) {
    const { width, height, data } = image;
    const radius = Math.min(numberParam(params, "radius", 12, 1, 100), Math.max(width, height));
    const offsetValue = numberParam(params, "offset", 8, -50, 50);
    const gaussian = stringParam(params, "method", ["mean", "gaussian"] as const, "mean") === "gaussian";
    const [inkRed, inkGreen, inkBlue] = colorParam(params, "inkColor", [0, 0, 0]);
    const transparentPaper = booleanParam(params, "transparentPaper", false);
    const count = width * height;
    const weightedLuma = new Float32Array(count), weight = new Float32Array(count), own = new Float32Array(count);
    for (let index = 0, offset = 0; index < count; index += 1, offset += 4) {
      const alpha = data[offset + 3]! / 255;
      own[index] = luma(data[offset]!, data[offset + 1]!, data[offset + 2]!);
      weightedLuma[index] = own[index]! * alpha;
      weight[index] = alpha;
    }
    // 투명 픽셀의 RGB 가 주변 평균을 끌어내리지 않도록 알파 가중 평균을 쓴다.
    for (const plane of [weightedLuma, weight]) {
      if (gaussian) gaussianPlane(plane, width, height, radius);
      else boxBlurPlane(plane, width, height, radius);
    }
    for (let index = 0, offset = 0; index < count; index += 1, offset += 4) {
      const mean = weight[index]! > 1e-6 ? weightedLuma[index]! / weight[index]! : 255;
      if (own[index]! < mean - offsetValue) {
        data[offset] = inkRed; data[offset + 1] = inkGreen; data[offset + 2] = inkBlue;
      } else {
        data[offset] = 255; data[offset + 1] = 255; data[offset + 2] = 255;
        if (transparentPaper) data[offset + 3] = 0;
      }
    }
  },
};

const dodgeBurn: StudioFilterGalleryEffectDef = {
  id: "color.dodge-burn",
  category: "color",
  label: "닷지 / 번",
  description: "어두운·중간·밝은 영역 중 고른 톤만 밝게(닷지) 하거나 어둡게(번) 합니다.",
  references: ["Krita · 닷지 필터", "Krita · 번 필터", "Photoshop · 닷지/번 범위"],
  params: [
    {
      key: "mode", label: "방식", control: "select", default: "dodge",
      options: [{ value: "dodge", label: "닷지(밝게)" }, { value: "burn", label: "번(어둡게)" }],
    },
    {
      key: "range", label: "범위", control: "select", default: "midtones",
      options: [{ value: "shadows", label: "어두운 영역" }, { value: "midtones", label: "중간 영역" }, { value: "highlights", label: "밝은 영역" }],
    },
    { key: "exposure", label: "노출", control: "slider", min: 0, max: 100, step: 1, default: 40, suffix: "%" },
  ],
  cost: 0.3,
  apply(image, params) {
    const dodge = stringParam(params, "mode", ["dodge", "burn"] as const, "dodge") === "dodge";
    const range = stringParam(params, "range", ["shadows", "midtones", "highlights"] as const, "midtones");
    const exposure = numberParam(params, "exposure", 40, 0, 100) / 100;
    const lut = new Uint8ClampedArray(256);
    for (let value = 0; value < 256; value += 1) {
      const v = value / 255;
      const weight = range === "shadows" ? (1 - v) * (1 - v) : range === "highlights" ? v * v : 4 * v * (1 - v);
      lut[value] = Math.round((dodge ? v + exposure * weight * (1 - v) : v - exposure * weight * v) * 255);
    }
    applyLut(image, lut);
  },
};

const valueInvert: StudioFilterGalleryEffectDef = {
  id: "color.value-invert",
  category: "color",
  label: "명도 반전",
  description: "색상과 채도는 그대로 두고 명도(HSV의 V)만 뒤집습니다.",
  references: ["GIMP · 명도 반전"],
  params: [],
  cost: 0.2,
  apply(image) {
    const { data } = image;
    for (let offset = 0; offset < data.length; offset += 4) {
      const red = data[offset]!, green = data[offset + 1]!, blue = data[offset + 2]!;
      const value = Math.max(red, green, blue);
      if (value === 0) { data[offset] = 255; data[offset + 1] = 255; data[offset + 2] = 255; continue; }
      // 채도 S = (max-min)/max 가 유지되도록 세 채널을 같은 비율로 바꾼다.
      const ratio = (255 - value) / value;
      data[offset] = red * ratio; data[offset + 1] = green * ratio; data[offset + 2] = blue * ratio;
    }
  },
};

const retinex: StudioFilterGalleryEffectDef = {
  id: "color.retinex",
  category: "color",
  label: "레티넥스",
  description: "여러 크기의 주변 밝기로 나눠 그늘진 곳의 디테일과 색을 살리는 다중 척도 레티넥스 보정입니다.",
  references: ["GIMP · 레티넥스"],
  params: [
    {
      key: "level", label: "척도 분포", control: "select", default: "uniform",
      options: [{ value: "uniform", label: "균일" }, { value: "low", label: "작은 척도 위주" }, { value: "high", label: "큰 척도 위주" }],
    },
    { key: "maxRadius", label: "최대 반경", control: "slider", min: 8, max: 200, step: 1, default: 80, suffix: "px" },
    { key: "scales", label: "척도 수", control: "slider", min: 1, max: 6, step: 1, default: 3 },
    { key: "dynamic", label: "동적 범위", control: "slider", min: 0.5, max: 4, step: 0.05, default: 1.4 },
  ],
  cost: 24,
  apply(image, params) {
    const { width, height, data } = image;
    const level = stringParam(params, "level", ["uniform", "low", "high"] as const, "uniform");
    const maxRadius = Math.min(numberParam(params, "maxRadius", 80, 8, 200), Math.max(width, height));
    const scales = Math.round(numberParam(params, "scales", 3, 1, 6));
    const dynamic = numberParam(params, "dynamic", 1.4, 0.5, 4);
    const count = width * height;
    const radii: number[] = [];
    for (let step = 1; step <= scales; step += 1) {
      const t = step / scales;
      radii.push(Math.max(1, maxRadius * (level === "low" ? t * t : level === "high" ? Math.sqrt(t) : t)));
    }
    const result = [new Float32Array(count), new Float32Array(count), new Float32Array(count)] as const;
    const blurred = new Float32Array(count);
    // 둘레(surround)는 알파로 가중한 평균이다 — 투명 픽셀의 숨은 색이 보이는 픽셀 근처로 새어 테두리가 밝아지지 않게 한다.
    // 완전히 불투명한 이미지는 가중치가 모두 1 이라 가중 없이 같은 결과를 낸다.
    let opaque = true;
    for (let index = 0; index < count && opaque; index += 1) opaque = data[index * 4 + 3] === 255;
    const coverage = opaque ? null : new Float32Array(count);
    for (const radius of radii) {
      if (coverage) {
        for (let index = 0; index < count; index += 1) coverage[index] = data[index * 4 + 3]! / 255;
        gaussianPlane(coverage, width, height, radius);
      }
      for (let channel = 0; channel < 3; channel += 1) {
        const output = result[channel];
        for (let index = 0; index < count; index += 1) {
          blurred[index] = coverage ? (data[index * 4 + channel]! * data[index * 4 + 3]!) / 255 : data[index * 4 + channel]!;
        }
        gaussianPlane(blurred, width, height, radius);
        for (let index = 0; index < count; index += 1) {
          const value = data[index * 4 + channel]!;
          const weight = coverage ? coverage[index]! : 1;
          const surround = !coverage ? blurred[index]! : weight > 1e-6 ? blurred[index]! / weight : value;
          output[index] = output[index]! + (Math.log1p(value) - Math.log1p(surround)) / radii.length;
        }
      }
    }
    // 색 복원(MSRCR): 채널이 세 채널 합에서 차지하는 몫의 로그를 곱해 회색으로 바래는 것을 막는다.
    let sum = 0, sumSquares = 0, samples = 0;
    for (let index = 0; index < count; index += 1) {
      const offset = index * 4;
      const total = data[offset]! + data[offset + 1]! + data[offset + 2]! + 1;
      for (let channel = 0; channel < 3; channel += 1) {
        const restored = result[channel][index]! * Math.log1p((125 * data[offset + channel]!) / total);
        result[channel][index] = restored;
        if (data[offset + 3]! >= VISIBLE_ALPHA) { sum += restored; sumSquares += restored * restored; samples += 1; }
      }
    }
    if (samples === 0) return;
    const mean = sum / samples;
    const deviation = Math.sqrt(Math.max(0, sumSquares / samples - mean * mean));
    const low = mean - dynamic * deviation, span = Math.max(1e-6, 2 * dynamic * deviation);
    for (let index = 0; index < count; index += 1) {
      for (let channel = 0; channel < 3; channel += 1) {
        data[index * 4 + channel] = clamp01((result[channel][index]! - low) / span) * 255;
      }
    }
  },
};

export const STUDIO_FILTER_GALLERY_COLOR_EFFECTS: readonly StudioFilterGalleryEffectDef[] = [
  errorDiffusionDither,
  quantize,
  channelExtreme,
  slopeOffsetPower,
  colorSplash,
  splitToning,
  adaptiveThreshold,
  dodgeBurn,
  valueInvert,
  retinex,
];
