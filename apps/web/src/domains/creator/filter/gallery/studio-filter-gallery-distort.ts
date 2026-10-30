/**
 * 필터 갤러리 · 왜곡(distort) 계열 9종.
 *
 * 모두 역사상(inverse map) 재표본화다. 출력 픽셀마다 원본 좌표를 계산해 알파 가중 쌍선형으로 다시 읽으므로 알파도
 * 표본과 함께 움직이고, 그림 밖을 가리키는 좌표는 효과마다 정한 가장자리 방식(가장자리 반복·반사·감싸기·투명)을 따른다.
 * 투명을 고르면 그 자리의 알파가 0 이 된다. 공용 sampleBilinear 는 가장자리 복제만 하고 색을 알파 없이 섞으므로,
 * 감싸기·반사 탭 접기와 투명 픽셀 색 번짐 방지를 위해 여기서 같은 픽셀 중심 규약의 표본기를 따로 둔다.
 * 유리 굴절·복소 반전·만화경 접기 같은 공개된 기하 변환과 기능 설명만으로 새로 구현했고, 무작위성은 모두
 * context.seed 에서 파생한 결정적 해시·노이즈다. 크기 매개변수는 이미지 px 단위다(context.scale 은 쓰지 않는다).
 */
import {
  clamp,
  clamp01,
  createRandom,
  fbm2,
  gaussianPlane,
  hash2,
  numberParam,
  stringParam,
  valueNoise2,
} from "./studio-filter-gallery-kernel-utils";
import { textureHeight } from "./studio-filter-gallery-textures";

import type {
  StudioFilterGalleryContext,
  StudioFilterGalleryEffectDef,
  StudioFilterGalleryImage,
  StudioFilterGalleryParamSpec,
  StudioFilterGalleryParams,
} from "./studio-filter-gallery-types";

// ── 매개변수 명세 도구 ─────────────────────────────────────────────

type SliderSpec = Extract<StudioFilterGalleryParamSpec, { control: "slider" }>;

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

/** 명세와 같은 최소·최대·기본값으로 슬라이더 값을 읽는다. */
const readSlider = (params: StudioFilterGalleryParams, spec: SliderSpec): number =>
  numberParam(params, spec.key, spec.default, spec.min, spec.max);

/** 명세의 선택지 안에서만 값을 읽는다(목록 밖이면 기본값). */
const readSelect = <T extends string>(params: StudioFilterGalleryParams, spec: SelectSpec<T>): T =>
  stringParam(params, spec.key, spec.options.map((option) => option.value), spec.default);

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

// ── 공용 재표본화 ───────────────────────────────────────────────

/** 그림 밖 좌표 처리. clamp = 가장자리 반복, reflect = 거울 반사, wrap = 감싸기, transparent = 투명(알파 0). */
export type StudioFilterGalleryEdgeMode = "clamp" | "reflect" | "wrap" | "transparent";

/** 역사상 함수. 출력(부분) 표본 중심 (x, y) 의 원본 좌표를 out 에 쓰고, false 면 그 표본을 투명으로 둔다. */
export type StudioFilterGalleryInverseMap = (x: number, y: number, out: { x: number; y: number }) => boolean;

/** 무한대·NaN 좌표가 격자 계산을 깨지 않도록 묶는 한계(어떤 그림보다도 훨씬 크다). */
const COORDINATE_LIMIT = 1e9;

const safeCoordinate = (value: number): number =>
  value > -COORDINATE_LIMIT && value < COORDINATE_LIMIT ? value : value > 0 ? COORDINATE_LIMIT : -COORDINATE_LIMIT;

/** 정수 격자 좌표를 [0, size) 로 접는다. transparent 는 가장자리 반복처럼 접는다(그림 밖 판정은 호출부가 한다). */
function foldIndex(index: number, size: number, edge: StudioFilterGalleryEdgeMode): number {
  if (index >= 0 && index < size) return index;
  if (edge === "wrap") {
    const folded = index % size;
    return folded < 0 ? folded + size : folded;
  }
  if (edge === "reflect") {
    const period = 2 * size;
    let folded = index % period;
    if (folded < 0) folded += period;
    return folded < size ? folded : period - 1 - folded;
  }
  return index < 0 ? 0 : size - 1;
}

/**
 * 연속 좌표(픽셀 중심 = i + 0.5)에서 쌍선형 표본을 읽어 out 에 [r, g, b, a] 로 쓴다. 투명한 이웃의 색이 번지지 않도록
 * 색은 알파로 가중 평균한다. 축마다 가장자리 방식이 다를 수 있고, transparent 축에서 그림 밖이면 false 를 돌려준다.
 */
export function sampleWithEdges(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  edgeX: StudioFilterGalleryEdgeMode,
  edgeY: StudioFilterGalleryEdgeMode,
  out: Float32Array,
): boolean {
  const px = safeCoordinate(x), py = safeCoordinate(y);
  if (edgeX === "transparent" && (px < 0 || px >= width)) return false;
  if (edgeY === "transparent" && (py < 0 || py >= height)) return false;
  const fx = px - 0.5, fy = py - 0.5;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = fx - x0, ty = fy - y0;
  const left = foldIndex(x0, width, edgeX), right = foldIndex(x0 + 1, width, edgeX);
  const top = foldIndex(y0, height, edgeY) * width, bottom = foldIndex(y0 + 1, height, edgeY) * width;
  const o00 = (top + left) * 4, o10 = (top + right) * 4, o01 = (bottom + left) * 4, o11 = (bottom + right) * 4;
  const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
  const a00 = source[o00 + 3] * w00, a10 = source[o10 + 3] * w10, a01 = source[o01 + 3] * w01, a11 = source[o11 + 3] * w11;
  const alpha = a00 + a10 + a01 + a11;
  for (let channel = 0; channel < 3; channel += 1) {
    out[channel] = alpha > 1e-3
      ? (source[o00 + channel] * a00 + source[o10 + channel] * a10 + source[o01 + channel] * a01 + source[o11 + channel] * a11) / alpha
      : source[o00 + channel] * w00 + source[o10 + channel] * w10 + source[o01 + channel] * w01 + source[o11 + channel] * w11;
  }
  out[3] = alpha;
  return true;
}

/**
 * 역사상 재표본화. map 이 출력 표본 중심의 원본 좌표를 알려 주면 축별 가장자리 방식에 맞춰 다시 읽는다. supersample 이
 * n 이면 픽셀마다 n×n 부분 표본을 알파 가중 평균한다(급격히 축소되는 왜곡의 계단 현상 완화). 원본 사본·표본 버퍼·좌표
 * 객체는 호출마다 한 번만 만들고 픽셀마다 할당하지 않는다.
 */
export function remapWithEdges(
  image: StudioFilterGalleryImage,
  edgeX: StudioFilterGalleryEdgeMode,
  edgeY: StudioFilterGalleryEdgeMode,
  map: StudioFilterGalleryInverseMap,
  supersample = 1,
): void {
  const { width, height, data } = image;
  const source = data.slice();
  const sample = new Float32Array(4);
  const point = { x: 0, y: 0 };
  const grid = Math.max(1, Math.floor(supersample));
  const total = grid * grid;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let red = 0, green = 0, blue = 0, alpha = 0, plainRed = 0, plainGreen = 0, plainBlue = 0, hits = 0;
      for (let sy = 0; sy < grid; sy += 1) {
        for (let sx = 0; sx < grid; sx += 1) {
          if (!map(x + (sx + 0.5) / grid, y + (sy + 0.5) / grid, point)) continue;
          if (!sampleWithEdges(source, width, height, point.x, point.y, edgeX, edgeY, sample)) continue;
          const weight = sample[3];
          red += sample[0] * weight; green += sample[1] * weight; blue += sample[2] * weight; alpha += weight;
          plainRed += sample[0]; plainGreen += sample[1]; plainBlue += sample[2]; hits += 1;
        }
      }
      const offset = (y * width + x) * 4;
      if (alpha > 1e-3) {
        data[offset] = red / alpha; data[offset + 1] = green / alpha; data[offset + 2] = blue / alpha;
      } else if (hits > 0) {
        data[offset] = plainRed / hits; data[offset + 1] = plainGreen / hits; data[offset + 2] = plainBlue / hits;
      } else {
        data[offset] = 0; data[offset + 1] = 0; data[offset + 2] = 0;
      }
      data[offset + 3] = alpha / total;
    }
  }
}

/**
 * 변위장(fieldX, fieldY)에서 평균을 빼고 RMS 가 amount/2 px 가 되게 맞춘 뒤(한 픽셀은 최대 amount px) 적용한다.
 * 질감·노이즈 종류와 관계없이 같은 세기 값이 비슷한 굴절량을 내게 하는 정규화다. 그림 밖은 가장자리 반복이다.
 */
function displaceByField(image: StudioFilterGalleryImage, fieldX: Float32Array, fieldY: Float32Array, amount: number): void {
  const count = fieldX.length;
  if (count === 0 || !(amount > 0)) return;
  let meanX = 0, meanY = 0;
  for (let index = 0; index < count; index += 1) { meanX += fieldX[index]; meanY += fieldY[index]; }
  meanX /= count; meanY /= count;
  let energy = 0;
  for (let index = 0; index < count; index += 1) {
    const dx = fieldX[index] - meanX, dy = fieldY[index] - meanY;
    energy += dx * dx + dy * dy;
  }
  const rms = Math.sqrt(energy / count);
  if (!(rms > 1e-9)) return;
  const gain = (0.5 * amount) / rms;
  const { width } = image;
  remapWithEdges(image, "clamp", "clamp", (x, y, out) => {
    const index = Math.floor(y) * width + Math.floor(x);
    let dx = (fieldX[index] - meanX) * gain, dy = (fieldY[index] - meanY) * gain;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length > amount) { dx *= amount / length; dy *= amount / length; }
    out.x = x + dx; out.y = y + dy;
    return true;
  });
}

// ── 유리 ───────────────────────────────────────────────────────

const GLASS_DISTORTION = slider("distortion", "왜곡", 0, 20, 1, 5);
const GLASS_SMOOTHNESS = slider("smoothness", "매끄러움", 1, 15, 1, 3);
const GLASS_TEXTURE = select("texture", "텍스처", [["frosted", "서리"], ["blocks", "블록"], ["canvas", "캔버스"], ["tiny-lens", "작은 렌즈"]], "frosted");
const GLASS_SCALING = slider("scaling", "비율", 50, 200, 1, 100, "%");

type GlassTexture = (typeof GLASS_TEXTURE)["default"];

/** 매끄러움 → 높이맵 가우스 흐림 반지름(px). */
const glassBlurRadius = (smoothness: number): number => (smoothness - 1) * 0.6;

/**
 * 공용 흐림이 구별하는 가장 작은 흐림(매끄러움 3 의 반지름 1.2). gaussianPlane 은 상자 반지름을 1 아래로 내리지 않아 반지름
 * 0.5~√3 이 모두 같은 흐림이고, 그래서 매끄러움 2(0.6)와 3(1.2)이 같은 그림이었다. 이보다 작은 반지름은 흐리지 않은 맵과
 * 이 흐림을 반지름 비율만큼 섞는다(매끄러움 1 은 흐리지 않고, 3 이상은 예전과 같다).
 */
const GLASS_LEAST_BLUR_RADIUS = glassBlurRadius(3);

/**
 * 높이맵을 그림 밖으로 넓힐 폭(px). gaussianPlane 의 3회 상자 흐림(상자 반지름 최대 ⌈max(1, r/√3)⌉)이 닿는 거리에
 * 중앙차분 1px 을 더해, 그림 안 기울기가 넓힌 맵 끝의 가장자리 복제에 닿지 않게 한다.
 */
const glassMargin = (radius: number): number => (radius < 0.5 ? 1 : 3 * Math.ceil(Math.max(1, radius / Math.sqrt(3))) + 1);
const GLASS_MARGIN_MAX = glassMargin(glassBlurRadius(GLASS_SMOOTHNESS.max));

/**
 * 유리 높이맵(대략 0~1)을 그림보다 사방 margin px 넓게 만든다. 넓힌 맵의 (x, y) 는 그림 좌표 (x − margin, y − margin)
 * 의 높이라 여백과 관계없이 무늬가 그림에 고정된다. 서리 = 고운 프랙털 노이즈, 블록 = 경사진 테두리와 기울기를 가진
 * 정사각 칸, 작은 렌즈 = 반구 격자. 공용 캔버스 생성기는 원점이 넓힌 맵의 (0, 0) 이라 호출부가 여백을 고정한다.
 */
function glassHeight(texture: GlassTexture, width: number, height: number, margin: number, scale: number, seed: number): Float32Array {
  const paddedWidth = width + 2 * margin, paddedHeight = height + 2 * margin;
  if (texture === "canvas") return textureHeight("canvas", paddedWidth, paddedHeight, scale, seed);
  const out = new Float32Array(paddedWidth * paddedHeight);
  const grain = 2.2 * scale, block = 18 * scale, lens = 7 * scale;
  for (let row = 0; row < paddedHeight; row += 1) {
    const y = row - margin;
    for (let column = 0; column < paddedWidth; column += 1) {
      const x = column - margin;
      let value: number;
      if (texture === "frosted") {
        value = fbm2(x / grain, y / grain, seed, 3);
      } else if (texture === "blocks") {
        const u = x / block, v = y / block, cellX = Math.floor(u), cellY = Math.floor(v);
        const lu = u - cellX, lv = v - cellY;
        // 테두리 15% 는 경사(빗면), 안쪽은 칸마다 다른 기울기로 그림 전체를 조금씩 민다.
        const bevel = clamp01(Math.min(lu, 1 - lu, lv, 1 - lv) / 0.15);
        const tilt = (hash2(cellX, cellY, seed) - 0.5) * (lu - 0.5) + (hash2(cellX, cellY, seed + 1) - 0.5) * (lv - 0.5);
        value = bevel + 3 * tilt;
      } else {
        const u = (x + 0.5) / lens, v = (y + 0.5) / lens;
        const lu = (u - Math.floor(u)) * 2 - 1, lv = (v - Math.floor(v)) * 2 - 1;
        value = Math.sqrt(Math.max(0, 1 - lu * lu - lv * lv));
      }
      out[row * paddedWidth + column] = value;
    }
  }
  return out;
}

/** 사방 margin(1 이상) px 넓힌 높이맵에서 그림 픽셀마다 중앙차분 기울기를 구해 변위장으로 돌려준다. */
function heightGradient(heightMap: Float32Array, width: number, height: number, margin: number): [Float32Array, Float32Array] {
  const stride = width + 2 * margin;
  const gradientX = new Float32Array(width * height), gradientY = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * width, center = (y + margin) * stride + margin;
    for (let x = 0; x < width; x += 1) {
      const at = center + x;
      gradientX[row + x] = (heightMap[at + 1] - heightMap[at - 1]) * 0.5;
      gradientY[row + x] = (heightMap[at + stride] - heightMap[at - stride]) * 0.5;
    }
  }
  return [gradientX, gradientY];
}

function applyGlass(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams, context: StudioFilterGalleryContext): void {
  const distortion = readSlider(params, GLASS_DISTORTION);
  const smoothness = readSlider(params, GLASS_SMOOTHNESS);
  const texture = readSelect(params, GLASS_TEXTURE);
  const scale = readSlider(params, GLASS_SCALING) / 100;
  if (distortion <= 0) return;
  const { width, height } = image;
  // 그림 크기 그대로 가장자리 복제로 흐리면 가장자리 줄과 질감 평균의 차이가 테두리에 경사로 남는다. 매끄러움이 커서
  // 안쪽 질감이 거의 지워지면 RMS 정규화가 그 경사만 키워 테두리 띠만 통째로 밀리므로, 흐림이 닿는 거리만큼 그림 밖까지
  // 실제 질감을 만들어 흐린다. 캔버스는 매끄러움을 바꿔도 무늬가 밀리지 않게 늘 가장 넓은 여백을 쓴다.
  const radius = glassBlurRadius(smoothness);
  const mix = radius > 0 && radius < GLASS_LEAST_BLUR_RADIUS ? radius / GLASS_LEAST_BLUR_RADIUS : 1;
  const blurRadius = mix < 1 ? GLASS_LEAST_BLUR_RADIUS : radius;
  const margin = texture === "canvas" ? GLASS_MARGIN_MAX : glassMargin(blurRadius);
  const heightMap = glassHeight(texture, width, height, margin, scale, context.seed + 0x6c61);
  const sharp = mix < 1 ? heightMap.slice() : null;
  gaussianPlane(heightMap, width + 2 * margin, height + 2 * margin, blurRadius);
  if (sharp) for (let index = 0; index < heightMap.length; index += 1) heightMap[index] = sharp[index] + (heightMap[index] - sharp[index]) * mix;
  const [fieldX, fieldY] = heightGradient(heightMap, width, height, margin);
  displaceByField(image, fieldX, fieldY, distortion);
}

/** 질감별 작업량 상한(256² 실측, 매끄러움·비율·왜곡 중 가장 무거운 값). 캔버스는 직조 질감 생성이 무겁고 늘 가장 넓은 여백을 쓴다. */
const GLASS_COST: Readonly<Record<GlassTexture, number>> = { frosted: 7, blocks: 6, canvas: 12, "tiny-lens": 5 };

// ── 바다 물결 ───────────────────────────────────────────────────

const RIPPLE_SIZE = slider("rippleSize", "물결 크기", 1, 15, 1, 9);
const RIPPLE_MAGNITUDE = slider("rippleMagnitude", "물결 세기", 0, 20, 1, 9);

function applyOceanRipple(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams, context: StudioFilterGalleryContext): void {
  const size = readSlider(params, RIPPLE_SIZE);
  const magnitude = readSlider(params, RIPPLE_MAGNITUDE);
  if (magnitude <= 0) return;
  const { width, height } = image;
  // 물결 크기 1 → 약 3.6px, 15 → 약 26px 주기의 매끈한 벡터장(두 성분은 서로 다른 시드의 fbm).
  const period = 2 + size * 1.6;
  const seed = context.seed + 0x0cea;
  const fieldX = new Float32Array(width * height), fieldY = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      fieldX[y * width + x] = fbm2(x / period, y / period, seed, 2);
      fieldY[y * width + x] = fbm2(x / period, y / period, seed + 7919, 2);
    }
  }
  displaceByField(image, fieldX, fieldY, magnitude * 0.6);
}

// ── 기울이기 ───────────────────────────────────────────────────

const SHEAR_AMOUNT = slider("amount", "양", -100, 100, 1, 40, "%");
const SHEAR_CURVE = select("curve", "곡선", [["arc", "호"], ["s-curve", "S자"], ["sine", "사인"]], "arc");
const SHEAR_AXIS = select("axis", "축", [["horizontal", "가로"], ["vertical", "세로"]], "horizontal");
const SHEAR_EDGE = select("edge", "가장자리", [["wrap", "감싸기"], ["repeat-edge", "가장자리 반복"], ["transparent", "투명"]], "wrap");

/** 곡선 모양(t 0~1 → -1~1). 호 = 가운데가 가장 많이 밀리는 포물선, S자 = 위아래가 반대로, 사인 = 두 번 출렁임. */
function shearCurve(curve: (typeof SHEAR_CURVE)["default"], t: number): number {
  if (curve === "arc") return 1 - (2 * t - 1) * (2 * t - 1);
  if (curve === "s-curve") return Math.sin(2 * Math.PI * t);
  return Math.sin(4 * Math.PI * t);
}

function applyShear(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams): void {
  const amount = readSlider(params, SHEAR_AMOUNT) / 100;
  const curve = readSelect(params, SHEAR_CURVE);
  const horizontal = readSelect(params, SHEAR_AXIS) === "horizontal";
  const edge = readSelect(params, SHEAR_EDGE);
  const mode: StudioFilterGalleryEdgeMode = edge === "repeat-edge" ? "clamp" : edge;
  const { width, height } = image;
  // 가로 기울이기는 줄(행)마다, 세로 기울이기는 열마다 곡선 값 × 양 × 반폭만큼 민다.
  const lines = horizontal ? height : width;
  const reach = amount * (horizontal ? width : height) / 2;
  const shifts = new Float32Array(lines);
  for (let line = 0; line < lines; line += 1) shifts[line] = shearCurve(curve, (line + 0.5) / lines) * reach;
  remapWithEdges(image, mode, mode, (x, y, out) => {
    out.x = horizontal ? x - shifts[Math.floor(y)] : x;
    out.y = horizontal ? y : y - shifts[Math.floor(x)];
    return true;
  });
}

// ── 움푹 패임 ───────────────────────────────────────────────────

const DENTS_SCALE = slider("scale", "크기", 1, 200, 1, 25, "px");
const DENTS_REFRACTION = slider("refraction", "굴절", 0, 200, 1, 50, "%");
const DENTS_ROUGHNESS = slider("roughness", "거칠기", 0, 100, 1, 10, "%");

/** 난류 노이즈: 옥타브마다 |2·노이즈 − 1| 을 더해 0 근처에서 접힌 골(구김)이 생긴다. 결과는 0~1. */
function turbulence(x: number, y: number, seed: number, octaves: number, gain: number): number {
  let amplitude = 1, frequency = 1, total = 0, norm = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += Math.abs(2 * valueNoise2(x * frequency, y * frequency, seed + octave * 131) - 1) * amplitude;
    norm += amplitude;
    amplitude *= gain;
    frequency *= 2;
  }
  return total / norm;
}

function applyDents(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams, context: StudioFilterGalleryContext): void {
  const scale = readSlider(params, DENTS_SCALE);
  const refraction = readSlider(params, DENTS_REFRACTION) / 100;
  const roughness = readSlider(params, DENTS_ROUGHNESS) / 100;
  if (refraction <= 0) return;
  const { width, height } = image;
  // 거칠수록 옥타브가 늘고 고주파 비중(gain)이 커져 잔주름이 생긴다.
  const octaves = 2 + Math.round(roughness * 3), gain = 0.3 + 0.4 * roughness;
  const seed = context.seed + 0x0de7;
  const fieldX = new Float32Array(width * height), fieldY = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      fieldX[y * width + x] = turbulence(x / scale, y / scale, seed, octaves, gain);
      fieldY[y * width + x] = turbulence(x / scale + 31.7, y / scale - 17.3, seed + 4049, octaves, gain);
    }
  }
  displaceByField(image, fieldX, fieldY, refraction * scale * 0.5);
}

// ── 타일 반사 ───────────────────────────────────────────────────

const TILE_ANGLE = slider("angle", "각도", -180, 180, 1, 30, "°");
const TILE_SIZE = slider("tileSize", "타일 크기", 2, 200, 1, 40, "px");
const TILE_CURVATURE = slider("curvature", "곡률", -100, 100, 1, 8);

function applyTileReflection(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams): void {
  const { width, height } = image;
  const angle = toRadians(readSlider(params, TILE_ANGLE));
  const size = Math.min(readSlider(params, TILE_SIZE), Math.max(2, width, height));
  // 곡률은 거듭제곱(0.6)으로 펴서 작은 값(기본 8)에서도 타일 경계의 굴절 차이가 눈에 띄게 하고, 최대 ±0.9 로 묶는다.
  const curvature = readSlider(params, TILE_CURVATURE) / 100;
  const strength = Math.sign(curvature) * Math.abs(curvature) ** 0.6 * 0.9;
  if (strength === 0) return;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const centerX = width / 2, centerY = height / 2, half = size / 2;
  remapWithEdges(image, "clamp", "clamp", (x, y, out) => {
    // 타일 격자 좌표계(그림 중심 기준으로 회전)에서 타일 중심과 그 안의 위치를 구한다.
    const dx = x - centerX, dy = y - centerY;
    const u = dx * cos + dy * sin, v = dy * cos - dx * sin;
    const tileU = (Math.floor(u / size) + 0.5) * size, tileV = (Math.floor(v / size) + 0.5) * size;
    const localU = u - tileU, localV = v - tileV;
    // 볼록 렌즈 근사: 가운데일수록 타일 중심 쪽을 읽어 확대되고(곡률 음수면 축소), 모서리에서는 거의 그대로다.
    const rho2 = Math.min(2, (localU * localU + localV * localV) / (half * half));
    const factor = 1 - strength * (1 - 0.5 * rho2);
    const sourceU = tileU + localU * factor, sourceV = tileV + localV * factor;
    out.x = centerX + sourceU * cos - sourceV * sin;
    out.y = centerY + sourceU * sin + sourceV * cos;
    return true;
  });
}

// ── 극 반전 ─────────────────────────────────────────────────────

const POLAR_AMOUNT = slider("amount", "양", -4, 4, 0.1, 1);
const POLAR_EDGE = select("edge", "가장자리", [["clamp", "가장자리 반복"], ["reflect", "반사"], ["wrap", "감싸기"], ["transparent", "투명"]], "reflect");

function applyPolarInversion(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams): void {
  const amount = readSlider(params, POLAR_AMOUNT);
  const edge = readSelect(params, POLAR_EDGE);
  const { width, height } = image;
  const centerX = width / 2, centerY = height / 2;
  // 가로·세로 반폭으로 정규화한 z 에 z' = 양 · z / |z|² (= 양 / conj(z)) 를 적용한다. 단위 타원은 제자리에 남는다.
  remapWithEdges(image, edge, edge, (x, y, out) => {
    const zx = (x - centerX) / centerX, zy = (y - centerY) / centerY;
    const inverse = amount / Math.max(zx * zx + zy * zy, 1e-9);
    out.x = centerX + zx * inverse * centerX;
    out.y = centerY + zy * inverse * centerY;
    return true;
  }, 2);
}

// ── 빗방울 ─────────────────────────────────────────────────────

const DROP_SIZE = slider("dropSize", "물방울 크기", 1, 60, 1, 15, "px");
const DROP_NUMBER = slider("number", "개수", 1, 200, 1, 40);
const DROP_FISH_EYE = slider("fishEye", "어안", 0, 100, 1, 30, "%");

/** 빛이 오는 쪽(왼쪽 위)을 가리키는 단위 벡터. */
const DROP_LIGHT_X = -0.6, DROP_LIGHT_Y = -0.8;
/** 물방울 하나가 빈자리를 찾아 보는 횟수. 끝내 못 찾으면 그 물방울은 건너뛴다. */
const DROP_TRIALS = 12;

function applyRaindrops(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams, context: StudioFilterGalleryContext): void {
  const size = readSlider(params, DROP_SIZE);
  const count = Math.round(readSlider(params, DROP_NUMBER));
  const fishEye = readSlider(params, DROP_FISH_EYE) / 100;
  const { width, height, data } = image;
  const random = createRandom(context.seed + 0x7a1d);
  // 물방울을 다른 물방울과 겹치지 않는 자리에만 놓고(1px 틈), 놓은 물방울을 래스터화해 픽셀마다 물방울 번호를 남긴다.
  // 크기는 그림 크기로 묶고, 자리가 모자라면 남은 물방울은 조용히 건너뛴다.
  const drops = new Float64Array(count * 3);
  const owner = new Int32Array(width * height).fill(-1);
  const maxRadius = Math.max(0.5, width, height);
  let placed = 0;
  for (let attempt = 0; attempt < count; attempt += 1) {
    const radius = clamp((size / 2) * (0.55 + 0.45 * random()), 0.5, maxRadius);
    let centerX = 0, centerY = 0, free = false;
    for (let trial = 0; trial < DROP_TRIALS && !free; trial += 1) {
      centerX = random() * width;
      centerY = random() * height;
      free = true;
      for (let other = 0; other < placed && free; other += 1) {
        const gapX = drops[other * 3] - centerX, gapY = drops[other * 3 + 1] - centerY, reachBoth = drops[other * 3 + 2] + radius + 1;
        free = gapX * gapX + gapY * gapY >= reachBoth * reachBoth;
      }
    }
    if (!free) continue;
    const drop = placed;
    placed += 1;
    drops[drop * 3] = centerX; drops[drop * 3 + 1] = centerY; drops[drop * 3 + 2] = radius;
    const reach = radius + 0.5;
    const left = Math.max(0, Math.floor(centerX - reach)), right = Math.min(width - 1, Math.ceil(centerX + reach));
    const top = Math.max(0, Math.floor(centerY - reach)), bottom = Math.min(height - 1, Math.ceil(centerY + reach));
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const dx = x + 0.5 - centerX, dy = y + 0.5 - centerY;
        if (dx * dx + dy * dy <= reach * reach) owner[y * width + x] = drop;
      }
    }
  }
  const source = data.slice();
  const sample = new Float32Array(4);
  for (let index = 0; index < owner.length; index += 1) {
    const drop = owner[index];
    if (drop < 0) continue;
    const centerX = drops[drop * 3], centerY = drops[drop * 3 + 1], radius = drops[drop * 3 + 2];
    const dx = (index % width) + 0.5 - centerX, dy = Math.floor(index / width) + 0.5 - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const rho = Math.min(1, distance / radius);
    // 반구 렌즈: 가운데일수록 중심 가까운 곳을 읽어 확대되고, 테두리(rho 1)에서는 제자리라 바깥과 이어진다.
    const pull = 1 - 0.85 * fishEye * Math.sqrt(1 - rho * rho);
    sampleWithEdges(source, width, height, centerX + dx * pull, centerY + dy * pull, "clamp", "clamp", sample);
    const facing = distance > 1e-6 ? (dx * DROP_LIGHT_X + dy * DROP_LIGHT_Y) / distance : 0;
    const shade = 1 - 0.32 * rho ** 4 - 0.15 * Math.max(0, -facing) * rho;
    const glint = 0.55 * 255 * Math.max(0, facing) ** 3 * Math.max(0, 1 - Math.abs(rho - 0.7) / 0.2);
    // 테두리 한 픽셀은 덮인 비율만큼만 섞어 계단을 줄인다. 색은 알파로 가중해 섞어(렌즈 색 몫 = 덮인 비율 × 표본 알파 /
    // 결과 알파) 투명한 원본이나 투명한 굴절 표본의 숨은 RGB 가 보이는 테두리로 번지지 않게 한다. 두 알파가 같으면(불투명
    // 그림) 몫이 덮인 비율 그대로라 덮인 비율로 바로 섞는 것과 바이트까지 같다.
    const coverage = clamp01(radius + 0.5 - distance);
    const offset = index * 4;
    const alpha = source[offset + 3] + (sample[3] - source[offset + 3]) * coverage;
    const share = alpha > 1e-3 ? coverage * (sample[3] / alpha) : coverage;
    for (let channel = 0; channel < 3; channel += 1) {
      data[offset + channel] = source[offset + channel] + (sample[channel] * shade + glint - source[offset + channel]) * share;
    }
    data[offset + 3] = alpha;
  }
}

// ── 만화경 ─────────────────────────────────────────────────────

const KALEIDOSCOPE_SEGMENTS = slider("segments", "조각 수", 2, 24, 1, 6);
const KALEIDOSCOPE_ANGLE = slider("angle", "각도", 0, 360, 1, 0, "°");
const KALEIDOSCOPE_CENTER_X = slider("centerX", "중심 X", 0, 100, 1, 50, "%");
const KALEIDOSCOPE_CENTER_Y = slider("centerY", "중심 Y", 0, 100, 1, 50, "%");

function applyKaleidoscope(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams): void {
  const segments = Math.round(readSlider(params, KALEIDOSCOPE_SEGMENTS));
  const angle = toRadians(readSlider(params, KALEIDOSCOPE_ANGLE));
  const { width, height } = image;
  const centerX = (readSlider(params, KALEIDOSCOPE_CENTER_X) / 100) * width;
  const centerY = (readSlider(params, KALEIDOSCOPE_CENTER_Y) / 100) * height;
  // 한 주기(360°/조각 수)를 거울 반사한 반쪽 쐐기 둘로 나눈다. 접기가 연속이라 쐐기 경계에 이음매가 없다.
  const period = (2 * Math.PI) / segments, half = period / 2;
  remapWithEdges(image, "clamp", "clamp", (x, y, out) => {
    const dx = x - centerX, dy = y - centerY;
    const radius = Math.sqrt(dx * dx + dy * dy);
    let theta = Math.atan2(dy, dx) - angle;
    theta -= Math.floor(theta / period) * period;
    if (theta > half) theta = period - theta;
    out.x = centerX + radius * Math.cos(theta + angle);
    out.y = centerY + radius * Math.sin(theta + angle);
    return true;
  });
}

// ── 미러 ───────────────────────────────────────────────────────

const MIRROR_AXIS = select("axis", "방향", [
  ["left-to-right", "왼쪽→오른쪽"],
  ["right-to-left", "오른쪽→왼쪽"],
  ["top-to-bottom", "위→아래"],
  ["bottom-to-top", "아래→위"],
  ["quad", "사분면"],
], "left-to-right");

function applyMirror(image: StudioFilterGalleryImage, params: StudioFilterGalleryParams): void {
  const axis = readSelect(params, MIRROR_AXIS);
  const { width, height, data } = image;
  const source = data.slice();
  // 픽셀 단위 거울 복사라 다시 표본화하지 않는다(홀수 크기의 가운데 줄은 제자리).
  for (let y = 0; y < height; y += 1) {
    let sourceY = y;
    if (axis === "top-to-bottom" || axis === "quad") sourceY = y < height / 2 ? y : height - 1 - y;
    else if (axis === "bottom-to-top") sourceY = y >= height / 2 ? y : height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      let sourceX = x;
      if (axis === "left-to-right" || axis === "quad") sourceX = x < width / 2 ? x : width - 1 - x;
      else if (axis === "right-to-left") sourceX = x >= width / 2 ? x : width - 1 - x;
      const from = (sourceY * width + sourceX) * 4, to = (y * width + x) * 4;
      data[to] = source[from]; data[to + 1] = source[from + 1]; data[to + 2] = source[from + 2]; data[to + 3] = source[from + 3];
    }
  }
}

export const STUDIO_FILTER_GALLERY_DISTORT_EFFECTS: readonly StudioFilterGalleryEffectDef[] = [
  {
    id: "distort.glass",
    category: "distort",
    label: "유리",
    description: "서리·블록·캔버스·작은 렌즈 질감 높이맵의 기울기만큼 픽셀을 밀어 울퉁불퉁한 유리 너머로 보는 듯한 굴절을 만듭니다(그림 밖은 가장자리 반복).",
    references: ["Photoshop · 유리", "Paint.NET · 서리 낀 유리"],
    params: [GLASS_DISTORTION, GLASS_SMOOTHNESS, GLASS_TEXTURE, GLASS_SCALING],
    cost: 5,
    costFor: (params) => GLASS_COST[readSelect(params, GLASS_TEXTURE)],
    apply: applyGlass,
  },
  {
    id: "distort.ocean-ripple",
    category: "distort",
    label: "바다 물결",
    description: "물결 크기로 부드럽게 만든 무작위 벡터장만큼 픽셀을 밀어 물속을 들여다보는 듯한 일렁임을 만듭니다(그림 밖은 가장자리 반복).",
    references: ["Photoshop · 바다 물결"],
    params: [RIPPLE_SIZE, RIPPLE_MAGNITUDE],
    cost: 4.5,
    apply: applyOceanRipple,
  },
  {
    id: "distort.shear",
    category: "distort",
    label: "기울이기",
    description: "가로 또는 세로 줄을 호·S자·사인 곡선을 따라 밀어 기울이고, 밀려난 자리는 감싸기·가장자리 반복·투명(알파 0) 중 고른 방식으로 채웁니다.",
    references: ["Photoshop · 기울이기(Shear)"],
    params: [SHEAR_AMOUNT, SHEAR_CURVE, SHEAR_AXIS, SHEAR_EDGE],
    cost: 2.5,
    apply: applyShear,
  },
  {
    id: "distort.dents",
    category: "distort",
    label: "움푹 패임",
    description: "난류 노이즈로 만든 변위장만큼 픽셀을 비틀어 움푹 팬 금속판에 비친 듯한 구김을 만듭니다(그림 밖은 가장자리 반복).",
    references: ["Paint.NET · 움푹 패임"],
    params: [DENTS_SCALE, DENTS_REFRACTION, DENTS_ROUGHNESS],
    cost: 4.5,
    apply: applyDents,
  },
  {
    id: "distort.tile-reflection",
    category: "distort",
    label: "타일 반사",
    description: "기울인 정사각 유리 타일 격자를 얹어 타일마다 렌즈처럼 아래 그림을 확대·축소해 굴절시킵니다(그림 밖은 가장자리 반복).",
    references: ["Paint.NET · 타일 반사"],
    params: [TILE_ANGLE, TILE_SIZE, TILE_CURVATURE],
    cost: 2,
    apply: applyTileReflection,
  },
  {
    id: "distort.polar-inversion",
    category: "distort",
    label: "극 반전",
    description: "중심 기준 복소 반전(z → 양 × r² / conj(z))으로 안팎을 뒤집고, 그림 밖 좌표는 가장자리 반복·반사·감싸기·투명(알파 0) 중 고른 방식으로 채웁니다.",
    references: ["Paint.NET · 극 반전"],
    params: [POLAR_AMOUNT, POLAR_EDGE],
    cost: 8,
    apply: applyPolarInversion,
  },
  {
    id: "distort.raindrops",
    category: "distort",
    label: "빗방울",
    description: "서로 겹치지 않게 무작위로 놓은(자리가 없으면 건너뛰는) 둥근 물방울이 렌즈처럼 아래 그림을 굴절시키고 빛 쪽 하이라이트와 어두운 테두리를 더합니다.",
    references: ["Krita · 빗방울"],
    params: [DROP_SIZE, DROP_NUMBER, DROP_FISH_EYE],
    cost: 1.2,
    apply: applyRaindrops,
  },
  {
    id: "distort.kaleidoscope",
    category: "distort",
    label: "만화경",
    description: "중심 둘레의 각도를 거울 반사한 쐐기 하나로 접어 조각 수만큼 회전 대칭인 만화경 무늬를 만듭니다(그림 밖은 가장자리 반복).",
    references: ["GIMP · 만화경"],
    params: [KALEIDOSCOPE_SEGMENTS, KALEIDOSCOPE_ANGLE, KALEIDOSCOPE_CENTER_X, KALEIDOSCOPE_CENTER_Y],
    cost: 2.5,
    apply: applyKaleidoscope,
  },
  {
    id: "distort.mirror",
    category: "distort",
    label: "미러",
    description: "그림의 절반(사분면이면 왼쪽 위 4분의 1)을 반대쪽에 거울처럼 복사해 좌우·상하·사분면 대칭으로 만듭니다.",
    references: ["사진·그림 앱 공통 · 미러 효과"],
    params: [MIRROR_AXIS],
    cost: 0.2,
    apply: applyMirror,
  },
];
