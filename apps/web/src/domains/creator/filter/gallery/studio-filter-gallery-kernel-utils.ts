/**
 * 필터 갤러리 커널 공용 도구. 모두 결정적이다(Math.random·시계 없음). 가장자리는 복제(clamp-to-edge)로 처리한다.
 * 이미지는 직선 알파 RGBA8 이고, 색 연산은 sRGB 값에서 직접 한다(갤러리 효과는 사진 보정이 아니라 양식화이므로
 * 원작 프로그램들과 같은 감마 공간 연산을 택했다).
 */
import type { StudioFilterGalleryImage, StudioFilterGalleryParams, StudioFilterGalleryParamValue } from "./studio-filter-gallery-types";

export const clamp = (value: number, low: number, high: number): number =>
  value < low ? low : value > high ? high : value;

export const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

export const clamp255 = (value: number): number => (value < 0 ? 0 : value > 255 ? 255 : value);

/** Rec.601 휘도(0~255). 갤러리 스케치·판화 계열이 쓰는 고전 그레이 변환과 같다. */
export const luma = (red: number, green: number, blue: number): number => 0.299 * red + 0.587 * green + 0.114 * blue;

export function numberParam(params: StudioFilterGalleryParams, key: string, fallback: number, low: number, high: number): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? clamp(value, low, high) : fallback;
}

export function stringParam<T extends string>(params: StudioFilterGalleryParams, key: string, allowed: readonly T[], fallback: T): T {
  const value = params[key];
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? value as T : fallback;
}

export function booleanParam(params: StudioFilterGalleryParams, key: string, fallback: boolean): boolean {
  const value: StudioFilterGalleryParamValue | undefined = params[key];
  return typeof value === "boolean" ? value : fallback;
}

/** #rrggbb → [r, g, b]. 형식이 틀리면 fallback. */
export function colorParam(params: StudioFilterGalleryParams, key: string, fallback: readonly [number, number, number]): [number, number, number] {
  const value = params[key];
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/iu.test(value)) return [fallback[0], fallback[1], fallback[2]];
  return [Number.parseInt(value.slice(1, 3), 16), Number.parseInt(value.slice(3, 5), 16), Number.parseInt(value.slice(5, 7), 16)];
}

/** 32비트 정수 해시(2D 좌표 + 시드) → [0, 1). */
export function hash2(x: number, y: number, seed: number): number {
  let n = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b1);
  n = Math.imul(n ^ (n >>> 15), 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** 1차원 정수 해시 → [0, 1). */
export function hash1(index: number, seed: number): number {
  return hash2(index, 0x5bd1e995, seed);
}

/** 결정적 난수열(xorshift32). 같은 시드는 같은 열을 낸다. */
export function createRandom(seed: number): () => number {
  let state = (seed | 0) || 0x6d2b79f5;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** 격자 값 노이즈(smoothstep 보간) → [0, 1). */
export function valueNoise2(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const tx = smooth(x - x0), ty = smooth(y - y0);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed);
  const c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  const top = a + (b - a) * tx, bottom = c + (d - c) * tx;
  return top + (bottom - top) * ty;
}

/** 프랙털 값 노이즈. octaves 개 층을 lacunarity 2, gain 으로 합쳐 [0, 1) 로 정규화한다. */
export function fbm2(x: number, y: number, seed: number, octaves: number, gain = 0.5): number {
  let amplitude = 1, frequency = 1, total = 0, norm = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise2(x * frequency, y * frequency, seed + octave * 1013) * amplitude;
    norm += amplitude;
    amplitude *= gain;
    frequency *= 2;
  }
  return norm > 0 ? total / norm : 0;
}

/** 이미지의 휘도 평면(Float32, 0~255). */
export function lumaPlane(image: StudioFilterGalleryImage): Float32Array {
  const { width, height, data } = image;
  const out = new Float32Array(width * height);
  for (let index = 0, offset = 0; index < out.length; index += 1, offset += 4) {
    out[index] = luma(data[offset]!, data[offset + 1]!, data[offset + 2]!);
  }
  return out;
}

/** 단일 채널 분리형 박스 블러(반지름 r, 가장자리 복제). 제자리에서 고친다. */
export function boxBlurPlane(plane: Float32Array, width: number, height: number, radius: number): void {
  const r = Math.floor(radius);
  if (r <= 0 || width <= 0 || height <= 0) return;
  const line = new Float32Array(Math.max(width, height));
  const window = 2 * r + 1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;
    for (let k = -r; k <= r; k += 1) sum += plane[row + clamp(k, 0, width - 1)]!;
    for (let x = 0; x < width; x += 1) {
      line[x] = sum / window;
      sum += plane[row + Math.min(width - 1, x + r + 1)]! - plane[row + Math.max(0, x - r)]!;
    }
    plane.set(line.subarray(0, width), row);
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let k = -r; k <= r; k += 1) sum += plane[clamp(k, 0, height - 1) * width + x]!;
    for (let y = 0; y < height; y += 1) {
      line[y] = sum / window;
      sum += plane[Math.min(height - 1, y + r + 1) * width + x]! - plane[Math.max(0, y - r) * width + x]!;
    }
    for (let y = 0; y < height; y += 1) plane[y * width + x] = line[y]!;
  }
}

/** 박스 블러 3회로 가우시안을 근사한다(시그마 ≈ radius / √3 · √3 = 반지름 기준 표준 근사). */
export function gaussianPlane(plane: Float32Array, width: number, height: number, radius: number): void {
  const r = Math.max(0, radius);
  if (r < 0.5) return;
  const box = Math.max(1, Math.round(r / Math.sqrt(3)));
  for (let pass = 0; pass < 3; pass += 1) boxBlurPlane(plane, width, height, box);
}

/** RGBA 를 채널별 평면 4개로 나눈다(Float32, 0~255). */
export function splitPlanes(image: StudioFilterGalleryImage): [Float32Array, Float32Array, Float32Array, Float32Array] {
  const count = image.width * image.height;
  const planes: [Float32Array, Float32Array, Float32Array, Float32Array] = [
    new Float32Array(count), new Float32Array(count), new Float32Array(count), new Float32Array(count),
  ];
  const { data } = image;
  for (let index = 0, offset = 0; index < count; index += 1, offset += 4) {
    planes[0][index] = data[offset]!;
    planes[1][index] = data[offset + 1]!;
    planes[2][index] = data[offset + 2]!;
    planes[3][index] = data[offset + 3]!;
  }
  return planes;
}

/** 평면을 RGBA 에 되쓴다. alpha 평면을 주지 않으면 원래 알파를 유지한다. */
export function mergePlanes(
  image: StudioFilterGalleryImage,
  red: Float32Array,
  green: Float32Array,
  blue: Float32Array,
  alpha?: Float32Array,
): void {
  const { data } = image;
  const count = image.width * image.height;
  for (let index = 0, offset = 0; index < count; index += 1, offset += 4) {
    data[offset] = red[index]!;
    data[offset + 1] = green[index]!;
    data[offset + 2] = blue[index]!;
    if (alpha) data[offset + 3] = alpha[index]!;
  }
}

/** 알파 가중 RGB 박스 블러(투명 픽셀의 색이 번지지 않게 한다). 알파 자체도 흐린다. */
export function blurRgbaPremultiplied(image: StudioFilterGalleryImage, radius: number): void {
  const [red, green, blue, alpha] = splitPlanes(image);
  const count = image.width * image.height;
  for (let index = 0; index < count; index += 1) {
    const a = alpha[index]! / 255;
    red[index]! *= a; green[index]! *= a; blue[index]! *= a;
  }
  for (const plane of [red, green, blue, alpha]) gaussianPlane(plane, image.width, image.height, radius);
  for (let index = 0; index < count; index += 1) {
    const a = alpha[index]! / 255;
    if (a > 1e-6) { red[index]! /= a; green[index]! /= a; blue[index]! /= a; }
  }
  mergePlanes(image, red, green, blue, alpha);
}

export interface Gradient {
  readonly gx: Float32Array;
  readonly gy: Float32Array;
  readonly magnitude: Float32Array;
}

/** 소벨 기울기(가장자리 복제). magnitude 는 0~약 1443 범위다(255 단계 휘도 기준). */
export function sobel(plane: Float32Array, width: number, height: number): Gradient {
  const gx = new Float32Array(width * height), gy = new Float32Array(width * height), magnitude = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const ym = Math.max(0, y - 1) * width, y0 = y * width, yp = Math.min(height - 1, y + 1) * width;
    for (let x = 0; x < width; x += 1) {
      const xm = Math.max(0, x - 1), xp = Math.min(width - 1, x + 1);
      const a = plane[ym + xm]!, b = plane[ym + x]!, c = plane[ym + xp]!;
      const d = plane[y0 + xm]!, f = plane[y0 + xp]!;
      const g = plane[yp + xm]!, h = plane[yp + x]!, i = plane[yp + xp]!;
      const sx = (c + 2 * f + i) - (a + 2 * d + g);
      const sy = (g + 2 * h + i) - (a + 2 * b + c);
      gx[y0 + x] = sx; gy[y0 + x] = sy; magnitude[y0 + x] = Math.sqrt(sx * sx + sy * sy);
    }
  }
  return { gx, gy, magnitude };
}

/** 쌍선형 샘플(가장자리 복제). out 에 [r, g, b, a] 를 쓴다. */
export function sampleBilinear(source: Uint8ClampedArray, width: number, height: number, x: number, y: number, out: Float32Array): void {
  const fx = clamp(x, 0, width - 1), fy = clamp(y, 0, height - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const o00 = (y0 * width + x0) * 4, o10 = (y0 * width + x1) * 4, o01 = (y1 * width + x0) * 4, o11 = (y1 * width + x1) * 4;
  for (let channel = 0; channel < 4; channel += 1) {
    const top = source[o00 + channel]! + (source[o10 + channel]! - source[o00 + channel]!) * tx;
    const bottom = source[o01 + channel]! + (source[o11 + channel]! - source[o01 + channel]!) * tx;
    out[channel] = top + (bottom - top) * ty;
  }
}

/**
 * 역사상(inverse map) 왜곡 도구: 각 출력 픽셀의 원본 좌표를 map 이 알려 주면 쌍선형으로 다시 샘플한다.
 * map 이 false 를 돌려주면 그 픽셀을 투명하게 둔다(그림 밖).
 */
export function remapImage(
  image: StudioFilterGalleryImage,
  map: (x: number, y: number, out: { x: number; y: number }) => boolean,
): void {
  const { width, height, data } = image;
  const source = data.slice();
  const sample = new Float32Array(4);
  const point = { x: 0, y: 0 };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (!map(x + 0.5, y + 0.5, point)) {
        data[offset] = 0; data[offset + 1] = 0; data[offset + 2] = 0; data[offset + 3] = 0;
        continue;
      }
      sampleBilinear(source, width, height, point.x - 0.5, point.y - 0.5, sample);
      data[offset] = sample[0]!; data[offset + 1] = sample[1]!; data[offset + 2] = sample[2]!; data[offset + 3] = sample[3]!;
    }
  }
}

/** RGB(0~255) → HSV(h 0~1, s 0~1, v 0~1). */
export function rgbToHsv(red: number, green: number, blue: number, out: Float32Array): void {
  const r = red / 255, g = green / 255, b = blue / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let hue = 0;
  if (delta > 1e-9) {
    if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
    else if (max === g) hue = ((b - r) / delta + 2) / 6;
    else hue = ((r - g) / delta + 4) / 6;
  }
  out[0] = hue; out[1] = max > 0 ? delta / max : 0; out[2] = max;
}

/** HSV(h 0~1 순환, s·v 0~1) → RGB(0~255). */
export function hsvToRgb(hue: number, saturation: number, value: number, out: Float32Array): void {
  const h = ((hue % 1) + 1) % 1 * 6, s = clamp01(saturation), v = clamp01(value);
  const sector = Math.floor(h), fraction = h - sector;
  const p = v * (1 - s), q = v * (1 - s * fraction), t = v * (1 - s * (1 - fraction));
  const rgb = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][sector % 6]!;
  out[0] = rgb[0]! * 255; out[1] = rgb[1]! * 255; out[2] = rgb[2]! * 255;
}

/** RGB(0~255) → HSL(h 0~1, s 0~1, l 0~1). */
export function rgbToHsl(red: number, green: number, blue: number, out: Float32Array): void {
  const r = red / 255, g = green / 255, b = blue / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), lightness = (max + min) / 2, delta = max - min;
  let hue = 0, saturation = 0;
  if (delta > 1e-9) {
    saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
    if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
    else if (max === g) hue = ((b - r) / delta + 2) / 6;
    else hue = ((r - g) / delta + 4) / 6;
  }
  out[0] = hue; out[1] = saturation; out[2] = lightness;
}

/** HSL → RGB(0~255). */
export function hslToRgb(hue: number, saturation: number, lightness: number, out: Float32Array): void {
  const h = ((hue % 1) + 1) % 1, s = clamp01(saturation), l = clamp01(lightness);
  if (s <= 1e-9) { out[0] = l * 255; out[1] = l * 255; out[2] = l * 255; return; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const channel = (t: number): number => {
    const u = ((t % 1) + 1) % 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  out[0] = channel(h + 1 / 3) * 255; out[1] = channel(h) * 255; out[2] = channel(h - 1 / 3) * 255;
}

/** 원본 위에 결과를 opacity 만큼 섞는다(알파 포함). original 은 효과 적용 전 사본이다. */
export function blendWithOriginal(image: StudioFilterGalleryImage, original: Uint8ClampedArray, opacity: number): void {
  const amount = clamp01(opacity);
  if (amount >= 1) return;
  const { data } = image;
  for (let index = 0; index < data.length; index += 1) {
    data[index] = original[index]! + (data[index]! - original[index]!) * amount;
  }
}
