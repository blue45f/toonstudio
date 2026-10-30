/**
 * 필터 갤러리 · 예술 효과 추가분 — 카툰, 큐비즘, 슈퍼픽셀(SLIC).
 *
 *   - 카툰: 각 픽셀의 좁은 이웃 평균 휘도를 넓은(마스크 반지름) 이웃 평균과 비교해, 상대적으로 뚜렷이 어두운 곳을 검게 누른다.
 *     문턱은 "가장 어두운 쪽 pctBlack 비율이 완전히 검게 되는" 값으로 이미지마다 정한다.
 *   - 큐비즘: 칸마다 무작위로 돌린 사각형을 그 중심의 원본 색으로 칠해, 섞은 순서대로 바탕색 위에 겹친다.
 *   - 슈퍼픽셀: SLIC(Achanta·Shaji·Smith·Lucchi·Fua·Süsstrunk 2012, "SLIC Superpixels Compared to State-of-the-Art
 *     Superpixel Methods"). 격자 간격 S 로 씨앗을 놓고 CIELAB 색 + 위치 5차원 거리로 2S×2S 창 안에서만 k-평균을 반복한 뒤
 *     덩어리마다 평균색으로 칠한다(연결성 후처리는 하지 않는다).
 * 평균·흐림은 알파로 가중해 투명 픽셀의 의미 없는 RGB 가 섞이지 않게 했고, 세 효과 모두 알파는 그대로 둔다.
 */
import { clamp, clamp01, colorParam, createRandom, gaussianPlane, hash1, hash2, luma, numberParam } from "./studio-filter-gallery-kernel-utils";

import type {
  StudioFilterGalleryContext, StudioFilterGalleryEffectDef, StudioFilterGalleryParamSpec, StudioFilterGalleryParams,
} from "./studio-filter-gallery-types";

type Rgb = [number, number, number];

/** 매개변수 명세와, 같은 최소·최대·기본값으로 값을 읽는 판독기 한 쌍(명세와 판독이 어긋나지 않게 한 곳에서 만든다). */
interface Param<T> {
  readonly spec: StudioFilterGalleryParamSpec;
  readonly read: (params: StudioFilterGalleryParams) => T;
}

function slider(key: string, label: string, min: number, max: number, step: number, fallback: number, suffix?: string): Param<number> {
  const spec: StudioFilterGalleryParamSpec = suffix === undefined
    ? { key, label, control: "slider", min, max, step, default: fallback }
    : { key, label, control: "slider", min, max, step, default: fallback, suffix };
  return { spec, read: (params) => numberParam(params, key, fallback, min, max) };
}

function color(key: string, label: string, fallback: string): Param<Rgb> {
  const rgb = colorParam({ [key]: fallback }, key, [0, 0, 0]);
  return { spec: { key, label, control: "color", default: fallback }, read: (params) => colorParam(params, key, rgb) };
}

/** 스택 시드에 효과별 상수를 더한 32비트 시드. */
const effectSeed = (context: StudioFilterGalleryContext, salt: number): number => ((context.seed | 0) + salt) | 0;

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

// ── 카툰 ──────────────────────────────────────────────────────────────

/**
 * 좁은 평균은 가장 좁은 흐림(상자 반지름 1 세 번)이고 넓은 평균의 상자 반지름은 max(1, 반지름/√3) 이다. 반지름이 √3 이하면 두 평균이
 * 같아 δ 가 모든 픽셀에서 0 이 되고(효과 없음), 다음 칸 2 도 두 흐림이 거의 같아 가는 선 그림에서 δ 가 2% 문턱을 넘는 픽셀이 너무
 * 적어 검정 비율이 듣지 않는다. 그래서 가는 어두운 선이 있는 그림에서 효과와 검정 비율이 함께 듣는 첫 칸 2.5 를 최소값으로 둔다
 * (매끈한 그림에서는 더 큰 반지름부터 검정 비율이 듣는다).
 */
const CARTOON_RADIUS = slider("maskRadius", "마스크 반지름", 2.5, 50, 0.5, 7, "px");
const CARTOON_BLACK = slider("pctBlack", "검정 비율", 0, 1, 0.01, 0.2);
/** 상대 어두움 δ(−1~1) 분포를 세는 히스토그램 칸 수. */
const CARTOON_BINS = 2048;

/** 알파 가중 흐림 평균 blur(값·α)/blur(α). 투명 픽셀의 의미 없는 값이 섞이지 않는다. */
function weightedMean(values: Float32Array, weights: Float32Array, width: number, height: number, radius: number): Float32Array {
  const sum = values.slice(), weight = weights.slice();
  gaussianPlane(sum, width, height, radius);
  gaussianPlane(weight, width, height, radius);
  for (let index = 0; index < sum.length; index += 1) sum[index] = weight[index]! > 1e-6 ? sum[index]! / weight[index]! : 0;
  return sum;
}

const cartoon: StudioFilterGalleryEffectDef = {
  id: "artistic.cartoon",
  category: "artistic",
  label: "카툰",
  description: "주변보다 뚜렷이 어두운 곳을 검게 눌러 만화처럼 굵은 잉크 윤곽과 납작한 어두운 면을 만듭니다.",
  references: ["GIMP · 카툰"],
  params: [CARTOON_RADIUS.spec, CARTOON_BLACK.spec],
  cost: 2,
  apply(image, params) {
    const { width, height, data } = image;
    const count = width * height, fraction = CARTOON_BLACK.read(params);
    if (fraction <= 0) return;
    const shade = new Float32Array(count), weights = new Float32Array(count);
    for (let index = 0, offset = 0; index < count; index += 1, offset += 4) {
      const alpha = data[offset + 3]! / 255;
      weights[index] = alpha;
      shade[index] = luma(data[offset]!, data[offset + 1]!, data[offset + 2]!) * alpha;
    }
    const near = weightedMean(shade, weights, width, height, 1);
    const wide = weightedMean(shade, weights, width, height, CARTOON_RADIUS.read(params));
    // 상대 어두움 δ = (넓은 평균 − 좁은 평균) / 넓은 평균. 양수면 주변보다 어둡고, 밝기 자체가 아니라 비율이라 밝은 곳·어두운 곳에 고르게 듣는다.
    const darkness = new Float32Array(count), histogram = new Uint32Array(CARTOON_BINS);
    let total = 0;
    for (let index = 0; index < count; index += 1) {
      if (weights[index]! <= 0) continue;
      const delta = clamp((wide[index]! - near[index]!) / Math.max(wide[index]!, 16), -1, 1);
      darkness[index] = delta;
      histogram[Math.min(CARTOON_BINS - 1, Math.floor(((delta + 1) / 2) * CARTOON_BINS))]! += 1;
      total += 1;
    }
    if (total === 0) return;
    // 가장 어두운 쪽부터 pctBlack 비율이 완전히 검게 되는 문턱. 주변보다 밝거나 거의 같은 픽셀(δ < 2%)은 칠하지 않는다.
    let bin = CARTOON_BINS - 1, above = histogram[bin]!;
    while (bin > 0 && above < fraction * total) {
      bin -= 1; above += histogram[bin]!;
    }
    const threshold = Math.max(0.02, (2 * bin) / CARTOON_BINS - 1);
    for (let index = 0, offset = 0; index < count; index += 1, offset += 4) {
      if (weights[index]! <= 0) continue;
      // 문턱의 절반부터 서서히 어두워지다 문턱 이상은 완전한 검정(납작한 먹 면)이 된다.
      const keep = 1 - smoothstep(0.5 * threshold, threshold, darkness[index]!);
      if (keep >= 1) continue;
      data[offset] = data[offset]! * keep;
      data[offset + 1] = data[offset + 1]! * keep;
      data[offset + 2] = data[offset + 2]! * keep;
    }
  },
};

// ── 큐비즘 ────────────────────────────────────────────────────────────

const CUBISM_SIZE = slider("tileSize", "조각 크기", 2, 100, 1, 10, "px");
const CUBISM_SATURATION = slider("tileSaturation", "조각 채도", 0, 10, 0.1, 2.5);
const CUBISM_BACKGROUND = color("backgroundColor", "바탕 색", "#000000");

const cubism: StudioFilterGalleryEffectDef = {
  id: "artistic.cubism",
  category: "artistic",
  label: "큐비즘",
  description: "원본 색을 담은 무작위로 돌린 사각형 조각을 겹쳐 큐비즘 화풍으로 다시 짭니다.",
  references: ["GIMP · 큐비즘"],
  params: [CUBISM_SIZE.spec, CUBISM_SATURATION.spec, CUBISM_BACKGROUND.spec],
  cost: 1,
  apply(image, params, context) {
    const { width, height, data } = image;
    const size = Math.min(CUBISM_SIZE.read(params), Math.max(width, height)), saturation = CUBISM_SATURATION.read(params);
    const [backRed, backGreen, backBlue] = CUBISM_BACKGROUND.read(params), seed = effectSeed(context, 0xc0b1);
    const source = data.slice();
    for (let offset = 0; offset < data.length; offset += 4) {
      if (data[offset + 3] === 0) continue;
      data[offset] = backRed; data[offset + 1] = backGreen; data[offset + 2] = backBlue;
    }
    const columns = Math.ceil(width / size), rows = Math.ceil(height / size), count = columns * rows;
    // 칸 순서를 피셔–예이츠로 섞어 겹치는 순서를 정한다(같은 시드면 같은 순서).
    const order = new Int32Array(count), random = createRandom(Math.floor(hash1(0x2545f491, seed) * 4294967296) | 0);
    for (let k = 0; k < count; k += 1) order[k] = k;
    for (let k = count - 1; k > 0; k -= 1) {
      const pick = Math.floor(random() * (k + 1)), swap = order[k]!;
      order[k] = order[pick]!; order[pick] = swap;
    }
    for (const tile of order) {
      const column = tile % columns, row = (tile - column) / columns;
      // 칸 안 무작위 중심, 칸 크기 0.7~1.5배의 가로·세로, 무작위 회전.
      const centerX = (column + hash2(column, row, seed)) * size, centerY = (row + hash2(column, row, seed + 1)) * size;
      const sample = (clamp(Math.floor(centerY), 0, height - 1) * width + clamp(Math.floor(centerX), 0, width - 1)) * 4;
      // 투명한 곳의 색은 쓰지 않는다(의미 없는 RGB 가 조각으로 번지지 않게).
      if (source[sample + 3] === 0) continue;
      const halfW = size * (0.35 + 0.4 * hash2(column, row, seed + 2)), halfH = size * (0.35 + 0.4 * hash2(column, row, seed + 3));
      const theta = Math.PI * hash2(column, row, seed + 4), cos = Math.cos(theta), sin = Math.sin(theta);
      const red = source[sample]!, green = source[sample + 1]!, blue = source[sample + 2]!;
      const reach = Math.sqrt(halfW * halfW + halfH * halfH), inner = Math.min(halfW, halfH);
      const x0 = Math.max(0, Math.floor(centerX - reach)), x1 = Math.min(width - 1, Math.ceil(centerX + reach));
      const y0 = Math.max(0, Math.floor(centerY - reach)), y1 = Math.min(height - 1, Math.ceil(centerY + reach));
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const offset = (y * width + x) * 4;
          if (data[offset + 3] === 0) continue;
          const dx = x + 0.5 - centerX, dy = y + 0.5 - centerY;
          const edge = Math.min(halfW - Math.abs(dx * cos + dy * sin), halfH - Math.abs(dy * cos - dx * sin));
          // 채도(tileSaturation)가 클수록 조각 가장자리에서 안쪽으로 빨리 꽉 찬다. 0 이면 바탕만 남는다.
          const cover = clamp01((saturation * (edge + 0.5)) / inner);
          if (cover <= 0) continue;
          data[offset] = data[offset]! + (red - data[offset]!) * cover;
          data[offset + 1] = data[offset + 1]! + (green - data[offset + 1]!) * cover;
          data[offset + 2] = data[offset + 2]! + (blue - data[offset + 2]!) * cover;
        }
      }
    }
  },
};

// ── 슈퍼픽셀(SLIC) ────────────────────────────────────────────────────

const SLIC_SIZE = slider("clusterSize", "덩어리 크기", 4, 64, 1, 16, "px");
const SLIC_COMPACTNESS = slider("compactness", "조밀도", 1, 40, 1, 10);
const SLIC_ITERATIONS = slider("iterations", "반복 횟수", 1, 10, 1, 4);

/**
 * 슈퍼픽셀 작업량(cost 1 단위 ≈ 픽셀당 50ns). Lab 변환·첫 중심·칠하기가 픽셀당 약 115~125ns 이고, 반복마다 군집 창(한 변 최대
 * 2S + 2)이 이미지를 ((2S + 2)/S)² 번 덮어 창 픽셀마다(중심 갱신 포함) 약 15.5~16.5ns 가 든다. 계수는 256²~1024² 실측(기본값 약
 * 385~430ns/px, 반복 10·덩어리 4 약 1080~1160ns/px, 부하가 있을 때 약 1250ns/px)을 여유 있게 덮는 값이다. 이미지가 덩어리보다 충분히
 * 클 때의 상한이라, 이미지가 덩어리 몇 개 크기면(예: 129² 에 덩어리 64) 가장자리 군집이 창을 더 겹쳐 1.1~1.4배까지 넘지만 그런
 * 이미지는 수십 ms 라 예산 판단에는 영향이 없다.
 */
function superpixelCost(params: StudioFilterGalleryParams): number {
  const size = Math.round(SLIC_SIZE.read(params)), iterations = Math.round(SLIC_ITERATIONS.read(params));
  return (140 + iterations * 19 * ((2 * size + 2) / size) ** 2) / 50;
}

/** sRGB 8비트 RGBA 를 CIELAB(D65) 평면 [L, a, b] 로 바꾼다. SLIC 은 지각 색 거리를 쓰므로 Lab 에서 군집한다. */
function toLab(data: Uint8ClampedArray, count: number): Float32Array {
  const linear = new Float32Array(256);
  for (let value = 0; value < 256; value += 1) {
    const c = value / 255;
    linear[value] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }
  const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const lab = new Float32Array(count * 3);
  for (let index = 0, offset = 0; index < count; index += 1, offset += 4) {
    const r = linear[data[offset]!]!, g = linear[data[offset + 1]!]!, b = linear[data[offset + 2]!]!;
    const fx = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), fy = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const fz = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    lab[index * 3] = 116 * fy - 16; lab[index * 3 + 1] = 500 * (fx - fy); lab[index * 3 + 2] = 200 * (fy - fz);
  }
  return lab;
}

/**
 * 현재 소속(label)으로 군집 중심 [x, y, L, a, b] 를 다시 구한다. 색은 알파 가중 평균, 위치는 (알파 + 작은 값) 가중 평균이라
 * 투명한 곳에 걸친 군집도 보이는 쪽으로 끌린다. 픽셀이 하나도 없는 군집은 이전 중심을 지킨다.
 */
function updateCenters(label: Int32Array, lab: Float32Array, data: Uint8ClampedArray, width: number, centers: Float64Array, sums: Float64Array): void {
  sums.fill(0);
  for (let index = 0; index < label.length; index += 1) {
    const k = label[index]! * 7, alpha = data[index * 4 + 3]! / 255, place = alpha + 1e-3, x = index % width;
    sums[k] = sums[k]! + x * place; sums[k + 1] = sums[k + 1]! + ((index - x) / width) * place; sums[k + 2] = sums[k + 2]! + place;
    sums[k + 3] = sums[k + 3]! + lab[index * 3]! * alpha; sums[k + 4] = sums[k + 4]! + lab[index * 3 + 1]! * alpha;
    sums[k + 5] = sums[k + 5]! + lab[index * 3 + 2]! * alpha; sums[k + 6] = sums[k + 6]! + alpha;
  }
  for (let cluster = 0; cluster * 5 < centers.length; cluster += 1) {
    const k = cluster * 7, c = cluster * 5;
    if (sums[k + 2]! > 0) {
      centers[c] = sums[k]! / sums[k + 2]!; centers[c + 1] = sums[k + 1]! / sums[k + 2]!;
    }
    if (sums[k + 6]! > 0) {
      centers[c + 2] = sums[k + 3]! / sums[k + 6]!; centers[c + 3] = sums[k + 4]! / sums[k + 6]!; centers[c + 4] = sums[k + 5]! / sums[k + 6]!;
    }
  }
}

const superpixel: StudioFilterGalleryEffectDef = {
  id: "artistic.superpixel",
  category: "artistic",
  label: "슈퍼픽셀",
  description: "SLIC 군집화로 색과 위치가 가까운 픽셀을 덩어리로 묶어 덩어리마다 평균색으로 칠합니다.",
  references: ["GIMP · 단순 선형 반복 클러스터링(SLIC)"],
  params: [SLIC_SIZE.spec, SLIC_COMPACTNESS.spec, SLIC_ITERATIONS.spec],
  // 기본값(빈 매개변수는 기본값으로 읽힌다)의 작업량이다.
  cost: superpixelCost({}),
  costFor: superpixelCost,
  apply(image, params) {
    const { width, height, data } = image;
    const count = width * height, step = Math.max(1, Math.round(Math.min(SLIC_SIZE.read(params), Math.max(width, height))));
    const iterations = Math.round(SLIC_ITERATIONS.read(params)), spatial = (SLIC_COMPACTNESS.read(params) / step) ** 2;
    const lab = toLab(data, count), columns = Math.ceil(width / step), clusters = columns * Math.ceil(height / step);
    const centers = new Float64Array(clusters * 5), sums = new Float64Array(clusters * 7);
    const label = new Int32Array(count), distance = new Float32Array(count);
    // 초기 군집: 간격 S 격자 칸마다 하나. 픽셀은 처음에 자기 칸에 속하고, 중심은 칸의 (알파 가중) 평균이다.
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) label[y * width + x] = Math.floor(y / step) * columns + Math.floor(x / step);
    }
    updateCenters(label, lab, data, width, centers, sums);
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      distance.fill(Infinity);
      // 국소 k-평균: 중심마다 2S×2S 창 안 픽셀만 비교한다. D² = 색 거리² + (위치 거리 · m/S)², 투명 픽셀은 위치만 본다.
      for (let cluster = 0; cluster < clusters; cluster += 1) {
        const c = cluster * 5, cx = centers[c]!, cy = centers[c + 1]!, cl = centers[c + 2]!, ca = centers[c + 3]!, cb = centers[c + 4]!;
        const x0 = Math.max(0, Math.floor(cx - step)), x1 = Math.min(width - 1, Math.ceil(cx + step));
        const y0 = Math.max(0, Math.floor(cy - step)), y1 = Math.min(height - 1, Math.ceil(cy + step));
        for (let y = y0; y <= y1; y += 1) {
          for (let x = x0; x <= x1; x += 1) {
            const index = y * width + x, dx = x - cx, dy = y - cy;
            let total = (dx * dx + dy * dy) * spatial;
            if (data[index * 4 + 3] !== 0) {
              const dl = lab[index * 3]! - cl, da = lab[index * 3 + 1]! - ca, db = lab[index * 3 + 2]! - cb;
              total += dl * dl + da * da + db * db;
            }
            if (total < distance[index]!) {
              distance[index] = total; label[index] = cluster;
            }
          }
        }
      }
      updateCenters(label, lab, data, width, centers, sums);
    }
    // 덩어리마다 원본 RGB 의 알파 가중 평균으로 칠한다(투명 픽셀은 그대로 둔다).
    const fill = new Float64Array(clusters * 4);
    for (let index = 0, offset = 0; index < count; index += 1, offset += 4) {
      const alpha = data[offset + 3]!, k = label[index]! * 4;
      fill[k] = fill[k]! + data[offset]! * alpha; fill[k + 1] = fill[k + 1]! + data[offset + 1]! * alpha;
      fill[k + 2] = fill[k + 2]! + data[offset + 2]! * alpha; fill[k + 3] = fill[k + 3]! + alpha;
    }
    for (let index = 0, offset = 0; index < count; index += 1, offset += 4) {
      const k = label[index]! * 4, weight = fill[k + 3]!;
      if (data[offset + 3] === 0 || weight <= 0) continue;
      data[offset] = fill[k]! / weight; data[offset + 1] = fill[k + 1]! / weight; data[offset + 2] = fill[k + 2]! / weight;
    }
  },
};

/** 예술 효과 추가분(분류 artistic). */
export const STUDIO_FILTER_GALLERY_ARTISTIC_EXTRA_EFFECTS: readonly StudioFilterGalleryEffectDef[] = [cartoon, cubism, superpixel];
