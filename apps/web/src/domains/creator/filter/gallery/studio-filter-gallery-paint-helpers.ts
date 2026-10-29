/**
 * 필터 갤러리 · 회화 계열(예술 효과·붓 터치) 공용 도구.
 *
 * 붓·나이프·연필·잉크 효과가 함께 쓰는 순수 픽셀 연산만 둔다. 모두 결정적이고(무작위는 정수 해시뿐), 색 평균은
 * 알파 가중이라 투명 픽셀의 색이 번져 들어오지 않는다. 알파 채널은 읽기만 하고 쓰지 않는다.
 *   - 쿠와하라: 픽셀을 둘러싼 상자 여덟 개(꼭짓점 사분면 넷 + 변 가운데 넷)의 평균·분산을 상자 합 슬라이딩 창으로
 *     구해 반지름과 무관하게 O(N) 이다(Kuwahara 1976). 상자 하나만 고르는 대신 표준편차가 작을수록 무거운 가중
 *     평균으로 섞어 네모 얼룩과 계단 무늬를 줄인다(Papari·Petkov·Campisi 2007 일반화 쿠와하라의 가중 방식).
 *   - 방향 번짐: 가로·세로·두 대각선 픽셀 줄을 따라 미끄러지는 상자 창 평균이다. 백색 잡음에 걸면 붓결이 된다
 *     (선 적분 합성곱 LIC, Cabral·Leedom 1993 의 고정 방향 특수형).
 *   - 결 따라 붓결: 매끈하게 한 구조 텐서(Kyprianidis·Kang·Döllner 2009)의 접선 방향으로 네 방향 결을 각도 보간한다.
 * 상자 창은 모두 행 순서로 계산해(세로·대각선은 열·대각선 누적 합) 큰 이미지에서도 메모리를 건너뛰며 읽지 않는다.
 */
import { clamp, clamp01, hash2, luma, numberParam, stringParam } from "./studio-filter-gallery-kernel-utils";

import type { StudioFilterGalleryImage, StudioFilterGalleryParamSpec, StudioFilterGalleryParams } from "./studio-filter-gallery-types";

// ── 매개변수 스펙 ────────────────────────────────────────────────

export type SliderSpec = Extract<StudioFilterGalleryParamSpec, { readonly control: "slider" }>;

/** 선택값을 문자열 리터럴 유니온으로 좁힌 선택 스펙. 공용 스펙 유니온에 그대로 들어간다. */
export interface SelectSpec<T extends string> {
  readonly key: string;
  readonly label: string;
  readonly control: "select";
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly default: T;
}

/** 정수 단계 슬라이더 스펙. */
export function slider(key: string, label: string, min: number, max: number, fallback: number, suffix?: string): SliderSpec {
  return suffix === undefined
    ? { key, label, control: "slider", min, max, step: 1, default: fallback }
    : { key, label, control: "slider", min, max, step: 1, default: fallback, suffix };
}

export function select<T extends string>(
  key: string,
  label: string,
  options: readonly { readonly value: T; readonly label: string }[],
  fallback: T,
): SelectSpec<T> {
  return { key, label, control: "select", options, default: fallback };
}

/** 스펙과 같은 기본값·범위로 슬라이더 값을 읽는다. */
export function sliderValue(params: StudioFilterGalleryParams, spec: SliderSpec): number {
  return numberParam(params, spec.key, spec.default, spec.min, spec.max);
}

/** 스펙의 선택지 안에서만 값을 읽는다. 목록에 없으면 기본값이다. */
export function selectValue<T extends string>(params: StudioFilterGalleryParams, spec: SelectSpec<T>): T {
  return stringParam(params, spec.key, spec.options.map((option) => option.value), spec.default);
}

// ── 작은 수학 ────────────────────────────────────────────────────

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** 표준정규 근사값을 0~1 균등 분포 근사로 바꾼다(Φ(z) ≈ 1 / (1 + e^(−1.702z)) 로지스틱 근사). */
export const toUniform = (value: number): number => 1 / (1 + Math.exp(-1.702 * value));

/** 채널 하나를 levels 단계로 줄인다(0~255). */
export function posterize(value: number, levels: number): number {
  const steps = Math.max(1, levels - 1);
  return (Math.round((clamp(value, 0, 255) / 255) * steps) / steps) * 255;
}

/**
 * 색 평면의 명도만 levels 단계로 줄인다(제자리). 세 채널에 같은 양을 더해 색상은 그대로 두므로 채널별
 * 단계화에서 생기는 엉뚱한 색 띠가 없다. amount 는 단계화를 얼마나 따를지(0~1)다.
 */
export function posterizeLuma(planes: ColorPlanes, levels: number, amount: number): void {
  for (let index = 0; index < planes.red.length; index += 1) {
    const value = luma(planes.red[index], planes.green[index], planes.blue[index]);
    const shift = (posterize(value, levels) - value) * amount;
    planes.red[index] += shift;
    planes.green[index] += shift;
    planes.blue[index] += shift;
  }
}

// ── 행 순서 상자 창 ──────────────────────────────────────────────
// kernel-utils 의 boxBlurPlane·gaussianPlane 과 같은 결과(끝 복제)를 내지만, 세로 창을 열 누적 합으로 행 순서대로
// 계산해 메모리를 건너뛰며 읽지 않는다. 회화 효과는 평면 여러 장을 여러 번 흐리므로 이 차이가 실행 시간을 좌우한다.

/** 가로 창 [x − before, x + after](끝 복제)의 합 × scale 로 각 행을 바꾼다(제자리). */
function boxRows(plane: Float32Array, width: number, height: number, before: number, after: number, scale: number): void {
  const line = new Float32Array(width);
  const last = width - 1, inside = Math.min(after, last);
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = plane[row] * (before + 1) + plane[row + last] * (after - inside);
    for (let k = 1; k <= inside; k += 1) sum += plane[row + k];
    for (let x = 0; x < width; x += 1) {
      line[x] = sum * scale;
      const add = x + after + 1, drop = x - before;
      sum += plane[row + (add > last ? last : add)] - plane[row + (drop < 0 ? 0 : drop)];
    }
    plane.set(line, row);
  }
}

/** 세로 창 [y − before, y + after](끝 복제)의 합 × scale 로 각 열을 바꾼다(제자리, 열 누적 합을 행 순서로 민다). */
function boxColumns(
  plane: Float32Array,
  width: number,
  height: number,
  before: number,
  after: number,
  scale: number,
  scratch: Float32Array,
): void {
  const source = scratch;
  source.set(plane);
  const sums = new Float64Array(width);
  const last = height - 1, inside = Math.min(after, last), tail = last * width;
  for (let x = 0; x < width; x += 1) sums[x] = source[x] * (before + 1) + source[tail + x] * (after - inside);
  for (let k = 1; k <= inside; k += 1) {
    const row = k * width;
    for (let x = 0; x < width; x += 1) sums[x] += source[row + x];
  }
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    const addRow = Math.min(last, y + after + 1) * width, dropRow = Math.max(0, y - before) * width;
    for (let x = 0; x < width; x += 1) {
      plane[row + x] = sums[x] * scale;
      sums[x] += source[addRow + x] - source[dropRow + x];
    }
  }
}

/** 가운데 기준 반지름 radius 상자 평균(가로·세로, 제자리). kernel-utils 의 boxBlurPlane 과 같은 결과다. */
export function boxBlur(
  plane: Float32Array,
  width: number,
  height: number,
  radius: number,
  scratch: Float32Array = new Float32Array(plane.length),
): void {
  const r = Math.floor(radius);
  if (r <= 0 || width <= 0 || height <= 0) return;
  boxRows(plane, width, height, r, r, 1 / (2 * r + 1));
  boxColumns(plane, width, height, r, r, 1 / (2 * r + 1), scratch);
}

/**
 * 박스 3회 가우시안 근사(제자리). kernel-utils 의 gaussianPlane 과 같은 반지름 규약(상자 반지름 round(r/√3),
 * 최소 1)이다. 상자 필터는 가로·세로가 서로 바뀌어도 같으므로 가로 3회 → 세로 3회로 묶어 돈다.
 */
export function gaussianBlur(plane: Float32Array, width: number, height: number, radius: number, scratch?: Float32Array): void {
  if (!(radius >= 0.5) || width <= 0 || height <= 0) return;
  const r = Math.max(1, Math.round(radius / Math.sqrt(3)));
  const buffer = scratch ?? new Float32Array(plane.length);
  for (let pass = 0; pass < 3; pass += 1) boxRows(plane, width, height, r, r, 1 / (2 * r + 1));
  for (let pass = 0; pass < 3; pass += 1) boxColumns(plane, width, height, r, r, 1 / (2 * r + 1), buffer);
}

/** 소벨 기울기 크기(가장자리 복제). kernel-utils 의 sobel 크기와 같은 값이다(Math.hypot 대신 제곱근). */
export function gradientMagnitude(plane: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const up = Math.max(0, y - 1) * width, row = y * width, down = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - 1), right = Math.min(width - 1, x + 1);
      const a = plane[up + left], b = plane[up + x], c = plane[up + right];
      const d = plane[row + left], f = plane[row + right];
      const g = plane[down + left], h = plane[down + x], i = plane[down + right];
      const sx = c + 2 * f + i - (a + 2 * d + g), sy = g + 2 * h + i - (a + 2 * b + c);
      out[row + x] = Math.sqrt(sx * sx + sy * sy);
    }
  }
  return out;
}

// ── 색 평면 ──────────────────────────────────────────────────────

/** 직선(비곱셈) RGB 평면, 0~255. */
export interface ColorPlanes {
  readonly red: Float32Array;
  readonly green: Float32Array;
  readonly blue: Float32Array;
}

/** 원본에서 읽은 색 평면과 알파 가중치(0~1), 그리고 투명 픽셀을 이웃 휘도로 메운 휘도(기울기 계산용). */
export interface PaintSource extends ColorPlanes {
  readonly weight: Float32Array;
  readonly luma: Float32Array;
}

export function createColorPlanes(count: number): ColorPlanes {
  return { red: new Float32Array(count), green: new Float32Array(count), blue: new Float32Array(count) };
}

export function readPaintSource(image: StudioFilterGalleryImage): PaintSource {
  const { width, height, data } = image;
  const count = width * height;
  const { red, green, blue } = createColorPlanes(count);
  const weight = new Float32Array(count), shade = new Float32Array(count);
  for (let index = 0, offset = 0; index < count; index += 1, offset += 4) {
    red[index] = data[offset];
    green[index] = data[offset + 1];
    blue[index] = data[offset + 2];
    weight[index] = data[offset + 3] / 255;
    shade[index] = luma(data[offset], data[offset + 1], data[offset + 2]);
  }
  fillTransparentLuma(shade, weight, width, height);
  return { red, green, blue, weight, luma: shade };
}

/**
 * 투명한 곳의 휘도는 보이지 않는 쓰레기 값일 수 있으므로 불투명 이웃의 알파 가중 평균 휘도로 메운다(제자리).
 * 그래야 휘도를 흐리거나 미분할 때 투명 픽셀의 색이 가짜 가장자리·번짐으로 새어 들지 않는다. 반지름 2 로 못 메운
 * 곳은 반지름 12 로, 그래도 남은 곳은 그림 전체의 가중 평균으로 메운다. 반투명 픽셀은 제 휘도와 알파 비율로 섞는다.
 */
function fillTransparentLuma(shade: Float32Array, weight: Float32Array, width: number, height: number): void {
  const count = shade.length;
  let pending = 0, total = 0, mass = 0;
  for (let index = 0; index < count; index += 1) {
    if (weight[index] < 1) pending += 1;
    total += shade[index] * weight[index];
    mass += weight[index];
  }
  if (pending === 0 || mass <= 0) return;
  const original = shade.slice(), done = new Uint8Array(count), scratch = new Float32Array(count);
  for (const radius of [2, 12]) {
    const sum = new Float32Array(count), near = weight.slice();
    for (let index = 0; index < count; index += 1) sum[index] = original[index] * weight[index];
    boxBlur(sum, width, height, radius, scratch);
    boxBlur(near, width, height, radius, scratch);
    for (let index = 0; index < count; index += 1) {
      if (done[index] === 1 || weight[index] >= 1 || near[index] <= 1e-4) continue;
      shade[index] = weight[index] * original[index] + (1 - weight[index]) * (sum[index] / near[index]);
      done[index] = 1;
      pending -= 1;
    }
    if (pending === 0) return;
  }
  const mean = total / mass;
  for (let index = 0; index < count; index += 1) {
    if (done[index] === 1 || weight[index] >= 1) continue;
    shade[index] = weight[index] * original[index] + (1 - weight[index]) * mean;
  }
}

/** RGB 만 되쓴다(알파는 그대로). Uint8ClampedArray 가 반올림·0~255 자르기를 맡는다. */
export function writeColorPlanes(image: StudioFilterGalleryImage, planes: ColorPlanes): void {
  const { data } = image;
  const count = image.width * image.height;
  for (let index = 0, offset = 0; index < count; index += 1, offset += 4) {
    data[offset] = planes.red[index];
    data[offset + 1] = planes.green[index];
    data[offset + 2] = planes.blue[index];
  }
}

export function lumaOf(planes: ColorPlanes): Float32Array {
  const out = new Float32Array(planes.red.length);
  for (let index = 0; index < out.length; index += 1) out[index] = luma(planes.red[index], planes.green[index], planes.blue[index]);
  return out;
}

// ── 줄 방향 상자 창 ──────────────────────────────────────────────

/** 번짐 방향. 화면 좌표(y 는 아래가 +)에서 "diagonal-down" 은 "\", "diagonal-up" 은 "/" 다. */
export type StrokeDirection = "horizontal" | "vertical" | "diagonal-down" | "diagonal-up";

export const PERPENDICULAR: Readonly<Record<StrokeDirection, StrokeDirection>> = {
  horizontal: "vertical",
  vertical: "horizontal",
  "diagonal-down": "diagonal-up",
  "diagonal-up": "diagonal-down",
};

/**
 * 대각선 줄을 따라 반지름 radius 상자 평균(줄 끝 복제, 제자리)을 행 순서로 계산한다. 대각선마다 창 합을 하나씩
 * 들고 한 행씩 내려가며 r+1 칸 앞을 더하고 r 칸 뒤를 뺀다. flip 이면 아래 행부터 올라가 "/" 대각선을 다룬다.
 */
function boxDiagonal(plane: Float32Array, width: number, height: number, radius: number, flip: boolean, scratch: Float32Array): void {
  const source = scratch;
  source.set(plane);
  const sums = new Float64Array(width + height - 1);
  const scale = 1 / (2 * radius + 1);
  const base = (row: number): number => (flip ? height - 1 - row : row) * width;
  for (let row = 0; row < height; row += 1) {
    const here = base(row);
    const aheadBase = row + radius + 1 < height ? base(row + radius + 1) : 0;
    const behindBase = row >= radius ? base(row - radius) : 0;
    for (let x = 0; x < width; x += 1) {
      const step = x < row ? x : row;
      const line = x - row + height - 1;
      const startX = x - step, startRow = row - step;
      const length = Math.min(width - startX, height - startRow);
      if (step === 0) {
        // 줄 첫 칸: 뒤쪽 r 칸은 첫 칸 복제, 앞쪽은 줄 끝을 넘으면 끝 칸 복제로 창 합을 만든다.
        const inside = Math.min(radius, length - 1);
        let sum = source[here + x] * (radius + 1) + source[base(row + length - 1) + x + length - 1] * (radius - inside);
        for (let k = 1; k <= inside; k += 1) sum += source[base(row + k) + x + k];
        sums[line] = sum;
      }
      plane[here + x] = sums[line] * scale;
      const ahead = step + radius + 1 < length
        ? aheadBase + x + radius + 1
        : base(startRow + length - 1) + startX + length - 1;
      const behind = step >= radius ? behindBase + x - radius : base(startRow) + startX;
      sums[line] += source[ahead] - source[behind];
    }
  }
}

/** planes 각각을 direction 픽셀 줄을 따라 반지름 radius 로 평균한다(제자리, 줄 끝 복제). 반지름과 무관하게 O(N) 이다. */
export function boxAlongLines(
  planes: readonly Float32Array[],
  width: number,
  height: number,
  direction: StrokeDirection,
  radius: number,
): void {
  const r = Math.floor(radius);
  if (r <= 0 || planes.length === 0 || width <= 0 || height <= 0) return;
  const scale = 1 / (2 * r + 1);
  if (direction === "horizontal") {
    for (const plane of planes) boxRows(plane, width, height, r, r, scale);
    return;
  }
  const scratch = new Float32Array(width * height);
  for (const plane of planes) {
    if (direction === "vertical") boxColumns(plane, width, height, r, r, scale, scratch);
    else boxDiagonal(plane, width, height, r, direction === "diagonal-up", scratch);
  }
}

// ── 알파 가중 색 필터 ────────────────────────────────────────────

/** 색×알파 평면과 알파 평면에 같은 선형 필터를 건 뒤 다시 나눈다. 주변이 모두 투명하면 원래 색을 둔다. */
function weightedFilter(colors: ColorPlanes, weight: Float32Array, filter: (planes: readonly Float32Array[]) => void): ColorPlanes {
  const count = weight.length;
  const out = createColorPlanes(count);
  const mass = weight.slice();
  for (let index = 0; index < count; index += 1) {
    out.red[index] = colors.red[index] * mass[index];
    out.green[index] = colors.green[index] * mass[index];
    out.blue[index] = colors.blue[index] * mass[index];
  }
  filter([out.red, out.green, out.blue, mass]);
  for (let index = 0; index < count; index += 1) {
    const total = mass[index];
    if (total > 1e-5) {
      out.red[index] /= total;
      out.green[index] /= total;
      out.blue[index] /= total;
    } else {
      out.red[index] = colors.red[index];
      out.green[index] = colors.green[index];
      out.blue[index] = colors.blue[index];
    }
  }
  return out;
}

/** 알파 가중 가우시안 근사 흐림(박스 3회). 새 평면을 돌려준다. */
export function blurColor(colors: ColorPlanes, weight: Float32Array, width: number, height: number, radius: number): ColorPlanes {
  return weightedFilter(colors, weight, (planes) => {
    const scratch = new Float32Array(weight.length);
    for (const plane of planes) gaussianBlur(plane, width, height, radius, scratch);
  });
}

/** 알파 가중 방향 번짐(한 방향 줄을 따라 반지름 radius). 새 평면을 돌려준다. */
export function smearColor(
  colors: ColorPlanes,
  weight: Float32Array,
  width: number,
  height: number,
  direction: StrokeDirection,
  radius: number,
): ColorPlanes {
  return weightedFilter(colors, weight, (planes) => boxAlongLines(planes, width, height, direction, radius));
}

/** 알파 가중 흐림과의 차이를 amount 배 더하는 언샤프 마스크(제자리). */
export function sharpenColor(
  colors: ColorPlanes,
  weight: Float32Array,
  width: number,
  height: number,
  radius: number,
  amount: number,
): void {
  if (!(amount > 0)) return;
  const soft = blurColor(colors, weight, width, height, radius);
  for (let index = 0; index < weight.length; index += 1) {
    colors.red[index] += (colors.red[index] - soft.red[index]) * amount;
    colors.green[index] += (colors.green[index] - soft.green[index]) * amount;
    colors.blue[index] += (colors.blue[index] - soft.blue[index]) * amount;
  }
}

// ── 쿠와하라 ─────────────────────────────────────────────────────

/** 각 칸에 오른쪽·아래로 radius 칸까지의 (r+1)² 상자 합을 둔다(끝 복제, 제자리). */
function forwardBoxSums(plane: Float32Array, width: number, height: number, radius: number, scratch: Float32Array): void {
  boxRows(plane, width, height, 0, radius, 1);
  boxColumns(plane, width, height, 0, radius, 1, scratch);
}

/** 0 이상 정수 지수 거듭제곱(제곱 반복). 쿠와하라 가중치에서 Math.pow 보다 훨씬 빠르다. */
function integerPower(value: number, exponent: number): number {
  let result = 1, base = value;
  for (let rest = exponent; rest > 0; rest >>= 1) {
    if (rest & 1) result *= base;
    base *= base;
  }
  return result;
}

/**
 * 상자 통계표: 각 칸을 왼쪽 위 꼭짓점으로 하는 (r+1)² 상자의 [1/(1 + σ/6), 평균 R, 평균 G, 평균 B](알파 가중).
 * 상자 하나는 픽셀 여덟 개가 함께 쓰므로 한 번만 구해 둔다. 거의 투명한 상자는 0 으로 남아 가중치가 0 이 된다.
 * 합 평면은 채널마다 하나를 돌려 써서 메모리를 아낀다.
 */
function kuwaharaBoxes(colors: ColorPlanes, weight: Float32Array, width: number, height: number, radius: number): Float32Array {
  const count = width * height;
  const scratch = new Float32Array(count), mass = weight.slice();
  const sum = new Float32Array(count), square = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const value = luma(colors.red[index], colors.green[index], colors.blue[index]);
    sum[index] = value * weight[index];
    square[index] = value * value * weight[index];
  }
  for (const plane of [mass, sum, square]) forwardBoxSums(plane, width, height, radius, scratch);
  const boxes = new Float32Array(count * 4);
  for (let index = 0, offset = 0; index < count; index += 1, offset += 4) {
    const total = mass[index];
    if (total < 1e-4) continue;
    const mean = sum[index] / total, variance = square[index] / total - mean * mean;
    boxes[offset] = 1 / (1 + (variance > 0 ? Math.sqrt(variance) : 0) / 6);
  }
  [colors.red, colors.green, colors.blue].forEach((channel, slot) => {
    for (let index = 0; index < count; index += 1) sum[index] = channel[index] * weight[index];
    forwardBoxSums(sum, width, height, radius, scratch);
    for (let index = 0, offset = slot + 1; index < count; index += 1, offset += 4) {
      if (mass[index] >= 1e-4) boxes[offset] = sum[index] / mass[index];
    }
  });
  return boxes;
}

/**
 * 알파 가중 쿠와하라. 픽셀을 둘러싼 (r+1)² 상자 여덟 개(꼭짓점 사분면 넷 + 변 가운데 상자 넷)의 평균색을
 * 휘도 표준편차 σ 에 대한 가중치 (1 + σ/6)^−hardness 로 섞는다. 변 가운데 상자를 더하면 고전 사분면의 계단
 * 무늬가 줄어 8부채꼴 일반화 쿠와하라에 가까워지는데, 같은 상자 통계를 다시 읽기만 하므로 추가 전처리가 없다.
 * hardness 가 클수록 최소 분산 상자 하나를 고르는 고전 쿠와하라에 가깝다. 가장자리에서는 상자를 이미지 안으로 민다.
 */
export function kuwahara(
  colors: ColorPlanes,
  weight: Float32Array,
  width: number,
  height: number,
  radius: number,
  hardness: number,
): ColorPlanes {
  const count = width * height;
  const r = clamp(Math.round(radius), 1, Math.max(width, height));
  const half = r >> 1, power = Math.max(1, Math.round(hardness));
  const boxes = kuwaharaBoxes(colors, weight, width, height, r);
  const out = createColorPlanes(count);
  const corners = new Int32Array(8);
  for (let y = 0; y < height; y += 1) {
    const upper = Math.max(0, y - r) * width, middle = Math.max(0, y - half) * width, lower = y * width;
    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - r), center = Math.max(0, x - half);
      corners[0] = (upper + left) * 4;
      corners[1] = (upper + x) * 4;
      corners[2] = (lower + left) * 4;
      corners[3] = (lower + x) * 4;
      corners[4] = (middle + left) * 4;
      corners[5] = (middle + x) * 4;
      corners[6] = (upper + center) * 4;
      corners[7] = (lower + center) * 4;
      let best = 0;
      for (let quadrant = 0; quadrant < 8; quadrant += 1) {
        const calm = boxes[corners[quadrant]];
        if (calm > best) best = calm;
      }
      const index = lower + x;
      if (best <= 0) {
        out.red[index] = colors.red[index];
        out.green[index] = colors.green[index];
        out.blue[index] = colors.blue[index];
        continue;
      }
      // 가중치 ((1 + σ_min/6) / (1 + σ/6))^hardness: 가장 고른 상자가 1, 나머지는 거듭제곱으로 빠르게 줄어든다.
      const scale = 1 / best;
      let red = 0, green = 0, blue = 0, norm = 0;
      for (let quadrant = 0; quadrant < 8; quadrant += 1) {
        const at = corners[quadrant];
        const share = integerPower(boxes[at] * scale, power);
        red += boxes[at + 1] * share;
        green += boxes[at + 2] * share;
        blue += boxes[at + 3] * share;
        norm += share;
      }
      out.red[index] = red / norm;
      out.green[index] = green / norm;
      out.blue[index] = blue / norm;
    }
  }
  return out;
}

// ── 붓결 노이즈 ──────────────────────────────────────────────────

/** 노이즈 평면을 평균 0·표준편차 1 로 맞춘다(작은 이미지에서도 같은 세기가 되도록 실측으로 정규화). */
function normalizeNoise(plane: Float32Array): void {
  let sum = 0, square = 0;
  for (let index = 0; index < plane.length; index += 1) {
    sum += plane[index];
    square += plane[index] * plane[index];
  }
  const mean = sum / Math.max(1, plane.length);
  const variance = square / Math.max(1, plane.length) - mean * mean;
  const scale = variance > 1e-12 ? 1 / Math.sqrt(variance) : 0;
  for (let index = 0; index < plane.length; index += 1) plane[index] = (plane[index] - mean) * scale;
}

function whiteNoise(plane: Float32Array, width: number, height: number, seed: number): void {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) plane[y * width + x] = hash2(x, y, seed) - 0.5;
  }
}

/**
 * 고정 방향 결 노이즈: 백색 잡음을 along 방향으로 alongRadius, 수직 방향으로 acrossRadius 만큼 평균해 가늘고 긴
 * 결을 만든다. 평균 0·표준편차 1.
 */
export function streakNoise(
  width: number,
  height: number,
  seed: number,
  along: StrokeDirection,
  alongRadius: number,
  acrossRadius = 0,
): Float32Array {
  const plane = new Float32Array(width * height);
  whiteNoise(plane, width, height, seed);
  boxAlongLines([plane], width, height, along, alongRadius);
  boxAlongLines([plane], width, height, PERPENDICULAR[along], acrossRadius);
  normalizeNoise(plane);
  return plane;
}

const ORIENTED_DIRECTIONS: readonly StrokeDirection[] = ["horizontal", "diagonal-down", "vertical", "diagonal-up"];

/**
 * 그림 결을 따르는 붓결 노이즈(평균 0·표준편차 1). 휘도 기울기의 구조 텐서를 매끈하게 해 접선 각도와 일관도를 구하고,
 * 0°·45°·90°·135° 네 방향 결을 접선 각도에 따라 선형 보간한다. 구조가 약한 곳은 "/" 대각선 결로 채운다.
 */
export function orientedStreakNoise(shade: Float32Array, width: number, height: number, seed: number, length: number): Float32Array {
  const count = width * height;
  const angle = new Float32Array(count), coherence = new Float32Array(count), cross = new Float32Array(count);
  for (let y = 0; y < height; y += 1) {
    const up = Math.max(0, y - 1) * width, down = Math.min(height - 1, y + 1) * width, row = y * width;
    for (let x = 0; x < width; x += 1) {
      const gx = (shade[row + Math.min(width - 1, x + 1)] - shade[row + Math.max(0, x - 1)]) * 0.5;
      const gy = (shade[down + x] - shade[up + x]) * 0.5;
      angle[row + x] = gx * gx;
      coherence[row + x] = gy * gy;
      cross[row + x] = gx * gy;
    }
  }
  const scratch = new Float32Array(count);
  for (const plane of [angle, coherence, cross]) gaussianBlur(plane, width, height, 3, scratch);
  for (let index = 0; index < count; index += 1) {
    const xx = angle[index], yy = coherence[index], xy = cross[index];
    const spread = Math.sqrt((xx - yy) * (xx - yy) + 4 * xy * xy);
    // 주 고유벡터(기울기 방향)에 직각인 접선 각도를 0~π 로 둔다.
    let tangent = 0.5 * Math.atan2(2 * xy, xx - yy) + Math.PI / 2;
    if (tangent >= Math.PI) tangent -= Math.PI;
    if (tangent < 0) tangent += Math.PI;
    angle[index] = tangent;
    coherence[index] = clamp01(spread / (xx + yy + 25));
  }
  const out = new Float32Array(count), work = cross;
  ORIENTED_DIRECTIONS.forEach((direction, slot) => {
    whiteNoise(work, width, height, seed);
    boxAlongLines([work], width, height, direction, length);
    normalizeNoise(work);
    const center = (slot * Math.PI) / 4;
    for (let index = 0; index < count; index += 1) {
      let distance = Math.abs(angle[index] - center);
      if (distance > Math.PI / 2) distance = Math.PI - distance;
      const share = Math.max(0, 1 - distance / (Math.PI / 4));
      const fallback = slot === 3 ? 1 : 0;
      out[index] += (coherence[index] * share + (1 - coherence[index]) * fallback) * work[index];
    }
  });
  normalizeNoise(out);
  return out;
}
