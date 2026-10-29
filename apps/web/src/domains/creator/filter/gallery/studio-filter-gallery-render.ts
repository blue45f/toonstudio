/**
 * 필터 갤러리 · 렌더 계열 — 원본과 상관없는 새 무늬를 만들어 이미지에 합성한다.
 *
 * 섬유·플라스마·보로노이·프랙털·체커보드·나선·미로·사인 무늬는 `blend` 선택값(바꾸기·곱하기·스크린·오버레이·
 * 소프트 라이트)으로 원본 RGB 위에 합성하고 알파는 그대로 둔다. 그래서 무늬는 원래 그림이 있는 곳(알파 > 0)에만 보인다.
 * 격자는 선 픽셀만 불투명한 색으로 덮고, 차이 구름은 사진 편집기처럼 차이(|원본 − 구름|) 합성만 쓴다.
 * 공개 알고리즘 출처:
 *   - 플라스마: 중점 변위(Fournier·Fussell·Carpenter 1982, "Computer rendering of stochastic models").
 *   - 보로노이: 지터 격자 씨앗점의 셀 노이즈(Worley 1996, "A cellular texture basis function").
 *   - 프랙털: 탈출 시간 알고리즘과 연속(매끈한) 반복 횟수 색칠 ν = n + 1 − log₂(log₂|z|).
 *   - 미로: 깊이 우선 재귀 역추적과 무작위 프림 알고리즘으로 만든 완전 미로(모든 방이 길 하나로 이어진다).
 * 무작위성은 모두 context.seed + 효과별 상수로 시드한 해시·난수열에서만 나오므로 같은 입력·매개변수·시드는 같은 픽셀이 된다.
 */
import {
  booleanParam, clamp, clamp01, colorParam, createRandom, fbm2, hash1, hash2, hsvToRgb, numberParam, stringParam,
} from "./studio-filter-gallery-kernel-utils";

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

function choice<T extends string>(key: string, label: string, options: readonly (readonly [T, string])[], fallback: T): Param<T> {
  const values = options.map(([value]) => value);
  const spec: StudioFilterGalleryParamSpec = {
    key, label, control: "select", options: options.map(([value, text]) => ({ value, label: text })), default: fallback,
  };
  return { spec, read: (params) => stringParam(params, key, values, fallback) };
}

function color(key: string, label: string, fallback: string): Param<Rgb> {
  const rgb = colorParam({ [key]: fallback }, key, [0, 0, 0]);
  return { spec: { key, label, control: "color", default: fallback }, read: (params) => colorParam(params, key, rgb) };
}

function toggle(key: string, label: string, fallback: boolean): Param<boolean> {
  return { spec: { key, label, control: "toggle", default: fallback }, read: (params) => booleanParam(params, key, fallback) };
}

/** 스택 시드에 효과별 상수를 더한 32비트 시드. */
const effectSeed = (context: StudioFilterGalleryContext, salt: number): number => ((context.seed | 0) + salt) | 0;

/** 시드를 해시로 한 번 섞은 난수열(작은 정수 시드여도 xorshift 첫 값들이 고르게 퍼진다). */
const seededRandom = (seed: number): (() => number) => createRandom(Math.floor(hash1(0x2545f491, seed) * 4294967296) | 0);

const mix = (from: number, to: number, t: number): number => from + (to - from) * t;

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

const BLEND_OPTIONS = [
  ["replace", "바꾸기"], ["multiply", "곱하기"], ["screen", "스크린"], ["overlay", "오버레이"], ["soft-light", "소프트 라이트"],
] as const;
type BlendMode = (typeof BLEND_OPTIONS)[number][0];
const BLEND = choice<BlendMode>("blend", "합성 방식", BLEND_OPTIONS, "replace");

/** 한 채널 합성(0~255). base 는 원본, top 은 만든 무늬다. 오버레이·소프트 라이트는 W3C Compositing Level 1 식을 따른다. */
function blendChannel(mode: BlendMode, base: number, top: number): number {
  switch (mode) {
    case "replace":
      return top;
    case "multiply":
      return (base * top) / 255;
    case "screen":
      return 255 - ((255 - base) * (255 - top)) / 255;
    case "overlay":
      return base <= 127.5 ? (2 * base * top) / 255 : 255 - (2 * (255 - base) * (255 - top)) / 255;
    case "soft-light": {
      const b = base / 255, s = top / 255;
      if (s <= 0.5) return 255 * (b - (1 - 2 * s) * b * (1 - b));
      const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
      return 255 * (b + (2 * s - 1) * (d - b));
    }
  }
}

/** 만든 색을 offset 픽셀 RGB 에 합성한다. 알파는 건드리지 않고, 알파 0(그림이 없는 곳)은 그대로 둔다. */
function blendPixel(data: Uint8ClampedArray, offset: number, mode: BlendMode, red: number, green: number, blue: number): void {
  if (data[offset + 3] === 0) return;
  data[offset] = blendChannel(mode, data[offset]!, red);
  data[offset + 1] = blendChannel(mode, data[offset + 1]!, green);
  data[offset + 2] = blendChannel(mode, data[offset + 2]!, blue);
}

// ── 섬유 ──────────────────────────────────────────────────────────────

const FIBERS_VARIANCE = slider("variance", "색 변화", 1, 64, 1, 16);
const FIBERS_STRENGTH = slider("strength", "섬유 길이", 1, 64, 1, 4);
const FIBERS_COLOR1 = color("color1", "섬유 색", "#3d2b1f");
const FIBERS_COLOR2 = color("color2", "바탕 색", "#d9c4a1");

/** 세로 방향 상자 흐림(반지름 radius, 위아래를 이어 붙인 순환 경계라 가장자리에 얼룩이 없다). 열마다 누적합을 굴려 O(N) 이다. */
function verticalBox(plane: Float32Array, width: number, height: number, radius: number, line: Float32Array): void {
  const span = 2 * radius + 1, wrap = (y: number): number => (((y % height) + height) % height) * width;
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let k = -radius; k <= radius; k += 1) sum += plane[wrap(k) + x]!;
    for (let y = 0; y < height; y += 1) {
      line[y] = sum / span;
      sum += plane[wrap(y + radius + 1) + x]! - plane[wrap(y - radius) + x]!;
    }
    for (let y = 0; y < height; y += 1) plane[y * width + x] = line[y]!;
  }
}

const fibers: StudioFilterGalleryEffectDef = {
  id: "render.fibers",
  category: "render",
  label: "섬유",
  description: "세로로 결이 진 섬유 무늬를 두 색 사이에서 만들어 이미지에 합성합니다.",
  references: ["Photoshop · 섬유"],
  params: [FIBERS_VARIANCE.spec, FIBERS_STRENGTH.spec, FIBERS_COLOR1.spec, FIBERS_COLOR2.spec, BLEND.spec],
  cost: 1,
  apply(image, params, context) {
    const { width, height, data } = image;
    const count = width * height, variance = FIBERS_VARIANCE.read(params);
    // 결 반지름은 strength 의 2.5배(px)다. 이미지보다 길 필요는 없다.
    const radius = Math.min(Math.round(2.5 * FIBERS_STRENGTH.read(params)), height);
    const [r1, g1, b1] = FIBERS_COLOR1.read(params), [r2, g2, b2] = FIBERS_COLOR2.read(params);
    const mode = BLEND.read(params), seed = effectSeed(context, 0x0f1b);
    // 열마다 독립인 1차원 백색 잡음을 가로 1:2:1 로 살짝 묶어 섬유 굵기를 주고, 세로 상자 흐림 두 번(삼각 커널)으로 결을 늘인다.
    const plane = new Float32Array(count), line = new Float32Array(Math.max(width, height));
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) line[x] = hash2(x, y, seed);
      for (let x = 0; x < width; x += 1) {
        plane[y * width + x] = (line[Math.max(0, x - 1)]! + 2 * line[x]! + line[Math.min(width - 1, x + 1)]!) / 4;
      }
    }
    verticalBox(plane, width, height, radius, line);
    verticalBox(plane, width, height, radius, line);
    // 흐림으로 줄어든 대비를 표준편차로 되돌린 뒤, variance 가 두 색 사이를 오가는 폭(표준편차)을 정한다.
    let mean = 0, spread = 0;
    for (let index = 0; index < count; index += 1) mean += plane[index]!;
    mean /= count;
    for (let index = 0; index < count; index += 1) spread += (plane[index]! - mean) ** 2;
    const deviation = Math.sqrt(spread / count);
    const gain = deviation > 1e-6 ? (0.06 + (0.44 * (variance - 1)) / 63) / deviation : 0;
    for (let index = 0, offset = 0; index < count; index += 1, offset += 4) {
      const t = clamp01(0.5 + (plane[index]! - mean) * gain);
      blendPixel(data, offset, mode, mix(r2, r1, t), mix(g2, g1, t), mix(b2, b1, t));
    }
  },
};

// ── 플라스마 ──────────────────────────────────────────────────────────

const PLASMA_TURBULENCE = slider("turbulence", "난류", 0.1, 7, 0.1, 1);

/**
 * 중점 변위로 채널 하나의 플라스마(0~255)를 만든다. 직사각형을 넷으로 나누며 변의 중점은 양 끝 평균, 가운데는 네 모서리
 * 평균에 (길이/긴 변)^(1/난류) 에 비례하는 변위를 더한다. 난류가 크면 작은 규모 변위가 덜 줄어 거칠고, 작으면 부드럽다.
 * 변위는 좌표 해시라 순회 순서와 무관하고, 이미 정한 점은 다시 쓰지 않아 이웃 사각형이 공유하는 변이 끊기지 않는다.
 */
function plasmaPlane(plane: Float32Array, done: Uint8Array, width: number, height: number, seed: number, turbulence: number): void {
  done.fill(0);
  // 변 길이(0.5px 단위)별 변위 폭을 미리 구해 둔다(점마다 거듭제곱을 다시 하지 않게).
  const span = Math.max(width, height), roughness = clamp(1 / turbulence, 0.15, 3), amplitude = new Float32Array(2 * span + 1);
  for (let half = 0; half < amplitude.length; half += 1) amplitude[half] = 255 * (half / (2 * span)) ** roughness;
  const at = (x: number, y: number): number => plane[y * width + x]!;
  const put = (x: number, y: number, base: number, length: number): void => {
    const index = y * width + x;
    if (done[index] === 1) return;
    done[index] = 1;
    plane[index] = clamp(base + (hash2(x, y, seed) - 0.5) * amplitude[Math.round(2 * length)]!, 0, 255);
  };
  const right = width - 1, bottom = height - 1;
  put(0, 0, 127.5, span); put(right, 0, 127.5, span); put(0, bottom, 127.5, span); put(right, bottom, 127.5, span);
  // 재귀 대신 명시적 스택. 한 단계 깊어질 때 최대 3칸씩 늘어나므로 256칸이면 2^80 px 변까지 넉넉하다.
  const stack = new Int32Array(1024);
  let top = 0;
  const push = (x0: number, y0: number, x1: number, y1: number): void => {
    stack[top] = x0; stack[top + 1] = y0; stack[top + 2] = x1; stack[top + 3] = y1; top += 4;
  };
  push(0, 0, right, bottom);
  while (top > 0) {
    top -= 4;
    const x0 = stack[top]!, y0 = stack[top + 1]!, x1 = stack[top + 2]!, y1 = stack[top + 3]!;
    const splitX = x1 - x0 >= 2, splitY = y1 - y0 >= 2, mx = (x0 + x1) >> 1, my = (y0 + y1) >> 1;
    if (splitX) {
      put(mx, y0, (at(x0, y0) + at(x1, y0)) / 2, x1 - x0);
      put(mx, y1, (at(x0, y1) + at(x1, y1)) / 2, x1 - x0);
    }
    if (splitY) {
      put(x0, my, (at(x0, y0) + at(x0, y1)) / 2, y1 - y0);
      put(x1, my, (at(x1, y0) + at(x1, y1)) / 2, y1 - y0);
    }
    if (splitX && splitY) {
      put(mx, my, (at(x0, y0) + at(x1, y0) + at(x0, y1) + at(x1, y1)) / 4, (x1 - x0 + y1 - y0) / 2);
      push(x0, y0, mx, my); push(mx, y0, x1, my); push(x0, my, mx, y1); push(mx, my, x1, y1);
    } else if (splitX) {
      push(x0, y0, mx, y1); push(mx, y0, x1, y1);
    } else if (splitY) {
      push(x0, y0, x1, my); push(x0, my, x1, y1);
    }
  }
}

const plasma: StudioFilterGalleryEffectDef = {
  id: "render.plasma",
  category: "render",
  label: "플라스마",
  description: "중점 변위로 만든 채널별 색 플라스마 구름을 이미지에 합성합니다.",
  references: ["GIMP · 플라스마"],
  params: [PLASMA_TURBULENCE.spec, BLEND.spec],
  cost: 2,
  apply(image, params, context) {
    const { width, height, data } = image;
    const turbulence = PLASMA_TURBULENCE.read(params), mode = BLEND.read(params), seed = effectSeed(context, 0x09a5);
    const plane = new Float32Array(width * height), done = new Uint8Array(width * height);
    // 합성 방식이 모두 채널별이라 채널 하나씩 만들어 바로 합성한다(평면 하나만 다시 쓴다).
    for (let channel = 0; channel < 3; channel += 1) {
      plasmaPlane(plane, done, width, height, seed + channel * 7919, turbulence);
      for (let index = 0, offset = 0; index < plane.length; index += 1, offset += 4) {
        if (data[offset + 3] !== 0) data[offset + channel] = blendChannel(mode, data[offset + channel]!, plane[index]!);
      }
    }
  },
};

// ── 보로노이 ──────────────────────────────────────────────────────────

const VORONOI_SIZE = slider("cellSize", "칸 크기", 4, 200, 1, 32, "px");
const VORONOI_COLOR = choice("colorMode", "색 방식", [["source", "원본 색"], ["random", "무작위 색"], ["distance", "거리 그라데이션"]], "source");
const VORONOI_BORDER = slider("borderWidth", "경계선 두께", 0, 10, 0.5, 0, "px");
const VORONOI_METRIC = choice("metric", "거리 척도", [["euclidean", "유클리드"], ["manhattan", "맨해튼"], ["chebyshev", "체비쇼프"]], "euclidean");

/** 씨앗점 주변 3×3 의 알파 가중 평균색을 out[at..at+2] 에 쓴다. 모두 투명하면 false(그 칸은 원래 색을 지킨다). */
function seedColor(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, out: Float32Array, at: number): boolean {
  const cx = clamp(Math.floor(x), 0, width - 1), cy = clamp(Math.floor(y), 0, height - 1);
  let red = 0, green = 0, blue = 0, weight = 0;
  for (let sy = Math.max(0, cy - 1); sy <= Math.min(height - 1, cy + 1); sy += 1) {
    for (let sx = Math.max(0, cx - 1); sx <= Math.min(width - 1, cx + 1); sx += 1) {
      const offset = (sy * width + sx) * 4, alpha = data[offset + 3]!;
      red += data[offset]! * alpha; green += data[offset + 1]! * alpha; blue += data[offset + 2]! * alpha; weight += alpha;
    }
  }
  if (weight <= 0) return false;
  out[at] = red / weight; out[at + 1] = green / weight; out[at + 2] = blue / weight;
  return true;
}

const voronoi: StudioFilterGalleryEffectDef = {
  id: "render.voronoi",
  category: "render",
  label: "보로노이",
  description: "흩뿌린 씨앗점마다 가장 가까운 영역을 원본 색·무작위 색·거리 그라데이션으로 칠해 합성합니다.",
  references: ["Paint.NET · 보로노이 다이어그램", "GIMP · 셀 노이즈"],
  params: [VORONOI_SIZE.spec, VORONOI_COLOR.spec, VORONOI_BORDER.spec, VORONOI_METRIC.spec, BLEND.spec],
  cost: 2,
  apply(image, params, context) {
    const { width, height, data } = image;
    const size = Math.max(1, Math.min(VORONOI_SIZE.read(params), Math.max(width, height)));
    const colorMode = VORONOI_COLOR.read(params), metric = VORONOI_METRIC.read(params);
    const border = VORONOI_BORDER.read(params) / 2, mode = BLEND.read(params), seed = effectSeed(context, 0x7031);
    const columns = Math.ceil(width / size), rows = Math.ceil(height / size), cells = columns * rows;
    const seedX = new Float32Array(cells), seedY = new Float32Array(cells), tint = new Float32Array(cells * 3), valid = new Uint8Array(cells);
    // 지터 격자: 칸마다 씨앗점 하나를 칸 안쪽 80% 범위에 둔다. 5×5 이웃 칸만 보면 세 척도 모두 가장 가까운 점이 빠지지 않는다.
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const cell = row * columns + column;
        const sx = (column + 0.1 + 0.8 * hash2(column, row, seed)) * size, sy = (row + 0.1 + 0.8 * hash2(column, row, seed + 1)) * size;
        seedX[cell] = sx; seedY[cell] = sy;
        if (colorMode === "random") {
          for (let channel = 0; channel < 3; channel += 1) tint[cell * 3 + channel] = 255 * hash2(column, row, seed + 2 + channel);
          valid[cell] = 1;
        } else if (colorMode === "source") {
          valid[cell] = seedColor(data, width, height, sx, sy, tint, cell * 3) ? 1 : 0;
        }
      }
    }
    const euclidean = metric === "euclidean", manhattan = metric === "manhattan";
    for (let y = 0, offset = 0; y < height; y += 1) {
      const py = y + 0.5, row = Math.min(rows - 1, Math.floor(py / size));
      for (let x = 0; x < width; x += 1, offset += 4) {
        if (data[offset + 3] === 0) continue;
        const px = x + 0.5, column = Math.min(columns - 1, Math.floor(px / size));
        let best = Infinity, second = Infinity, bestCell = 0, secondCell = -1;
        for (let gy = Math.max(0, row - 2); gy <= Math.min(rows - 1, row + 2); gy += 1) {
          for (let gx = Math.max(0, column - 2); gx <= Math.min(columns - 1, column + 2); gx += 1) {
            const cell = gy * columns + gx, dx = Math.abs(px - seedX[cell]!), dy = Math.abs(py - seedY[cell]!);
            // 유클리드는 제곱 거리로 비교한다(제곱근은 마지막에 한 번).
            const distance = euclidean ? dx * dx + dy * dy : manhattan ? dx + dy : Math.max(dx, dy);
            if (distance < best) {
              second = best; secondCell = best < Infinity ? bestCell : -1; best = distance; bestCell = cell;
            } else if (distance < second) {
              second = distance; secondCell = cell;
            }
          }
        }
        let red: number, green: number, blue: number;
        if (colorMode === "distance") {
          red = green = blue = 255 * clamp01((euclidean ? Math.sqrt(best) : best) / (0.7 * size));
        } else if (valid[bestCell] === 1) {
          red = tint[bestCell * 3]!; green = tint[bestCell * 3 + 1]!; blue = tint[bestCell * 3 + 2]!;
        } else {
          red = data[offset]!; green = data[offset + 1]!; blue = data[offset + 2]!;
        }
        if (border > 0 && secondCell >= 0) {
          // 유클리드는 두 씨앗점의 수직이등분선까지 정확한 거리, 나머지 척도는 (F2 − F1)/2 근사를 경계까지 거리로 쓴다.
          const ax = seedX[secondCell]! - seedX[bestCell]!, ay = seedY[secondCell]! - seedY[bestCell]!, apart = Math.sqrt(ax * ax + ay * ay);
          const gap = euclidean ? (apart > 1e-6 ? (second - best) / (2 * apart) : 0) : (second - best) / 2;
          const keep = 1 - clamp01(border + 0.5 - gap);
          red *= keep; green *= keep; blue *= keep;
        }
        blendPixel(data, offset, mode, red, green, blue);
      }
    }
  },
};

// ── 프랙털 ────────────────────────────────────────────────────────────

type FractalPalette = "fire" | "ocean" | "mono" | "rainbow";
const FRACTAL_TYPE = choice("type", "종류", [["mandelbrot", "만델브로"], ["julia", "줄리아"]], "mandelbrot");
const FRACTAL_ZOOM = slider("zoom", "확대", 0.5, 100, 0.5, 1, "×");
const FRACTAL_ITERATIONS = slider("iterations", "반복 횟수", 16, 512, 1, 96);
const FRACTAL_REAL = slider("juliaReal", "줄리아 상수 실수부", -1, 1, 0.001, -0.8);
const FRACTAL_IMAG = slider("juliaImag", "줄리아 상수 허수부", -1, 1, 0.001, 0.156);
const FRACTAL_PALETTE = choice<FractalPalette>("palette", "팔레트", [["fire", "불꽃"], ["ocean", "바다"], ["mono", "흑백"], ["rainbow", "무지개"]], "fire");
/** 팔레트 색 정지점 [위치, r, g, b]. 무지개는 HSV 색상환으로 따로 만든다. */
const PALETTE_STOPS: Readonly<Record<Exclude<FractalPalette, "rainbow">, readonly (readonly [number, number, number, number])[]>> = {
  fire: [[0, 0, 0, 0], [0.3, 150, 20, 0], [0.6, 255, 120, 0], [0.85, 255, 220, 70], [1, 255, 255, 235]],
  ocean: [[0, 0, 8, 28], [0.3, 0, 45, 115], [0.6, 0, 135, 200], [0.85, 100, 215, 240], [1, 235, 255, 255]],
  mono: [[0, 0, 0, 0], [1, 255, 255, 255]],
};
/** 탈출 반지름의 제곱. 크게 잡을수록 매끈한 반복 횟수의 오차가 줄어든다. */
const ESCAPE_RADIUS_SQ = 65536;

/** 256단계 팔레트 표(RGB 연속). */
function paletteTable(palette: FractalPalette): Uint8ClampedArray {
  const table = new Uint8ClampedArray(256 * 3), rgb = new Float32Array(3);
  for (let index = 0; index < 256; index += 1) {
    const t = index / 255;
    if (palette === "rainbow") hsvToRgb(0.8 * t, 0.85, 1, rgb);
    else {
      const stops = PALETTE_STOPS[palette];
      let k = 1;
      while (k < stops.length - 1 && stops[k]![0] < t) k += 1;
      const from = stops[k - 1]!, to = stops[k]!, u = clamp01((t - from[0]) / Math.max(1e-6, to[0] - from[0]));
      rgb[0] = mix(from[1], to[1], u); rgb[1] = mix(from[2], to[2], u); rgb[2] = mix(from[3], to[3], u);
    }
    table[index * 3] = rgb[0]!; table[index * 3 + 1] = rgb[1]!; table[index * 3 + 2] = rgb[2]!;
  }
  return table;
}

/** 만델브로 주 카디오이드·주기 2 원판 안이면 반복 없이 내부로 판정한다. */
function insideMainBulbs(re: number, im: number): boolean {
  const shifted = re - 0.25, q = shifted * shifted + im * im;
  return q * (q + shifted) <= 0.25 * im * im || (re + 1) * (re + 1) + im * im <= 0.0625;
}

/**
 * z ← z² + c 의 매끈한 탈출 횟수 ν. 갇힌 점은 −1 이다. 궤도가 저장해 둔 점으로 되돌아오면(주기 검사, 저장 간격을
 * 두 배씩 늘린다) 끌개 주기에 빠진 내부 점이므로 반복 한도까지 돌지 않고 끝낸다.
 */
function escapeTime(startRe: number, startIm: number, cRe: number, cIm: number, iterations: number): number {
  let zr = startRe, zi = startIm, checkRe = zr, checkIm = zi, nextCheck = 8;
  for (let n = 0; n < iterations; n += 1) {
    const zr2 = zr * zr, zi2 = zi * zi;
    if (zr2 + zi2 > ESCAPE_RADIUS_SQ) return Math.max(0, n + 1 - Math.log2(0.5 * Math.log2(zr2 + zi2)));
    zi = 2 * zr * zi + cIm;
    zr = zr2 - zi2 + cRe;
    if (Math.abs(zr - checkRe) + Math.abs(zi - checkIm) < 1e-13) return -1;
    if (n === nextCheck) { checkRe = zr; checkIm = zi; nextCheck *= 2; }
  }
  return -1;
}

const fractal: StudioFilterGalleryEffectDef = {
  id: "render.fractal",
  category: "render",
  label: "프랙털",
  description: "만델브로·줄리아 집합을 매끈한 반복 횟수 색칠로 그려 이미지에 합성합니다.",
  references: ["Paint.NET · 만델브로 프랙털", "Paint.NET · 줄리아 프랙털"],
  params: [FRACTAL_TYPE.spec, FRACTAL_ZOOM.spec, FRACTAL_ITERATIONS.spec, FRACTAL_REAL.spec, FRACTAL_IMAG.spec, FRACTAL_PALETTE.spec, BLEND.spec],
  cost: 3,
  apply(image, params) {
    const { width, height, data } = image;
    const julia = FRACTAL_TYPE.read(params) === "julia", zoom = FRACTAL_ZOOM.read(params);
    const iterations = Math.round(FRACTAL_ITERATIONS.read(params)), cRe = FRACTAL_REAL.read(params), cIm = FRACTAL_IMAG.read(params);
    const table = paletteTable(FRACTAL_PALETTE.read(params)), mode = BLEND.read(params);
    // 짧은 변이 복소평면 폭 3/zoom 에 맞는다. 만델브로는 확대할수록 중심을 해마 골짜기(−0.7436, 0.1318)로 옮겨(1 − 1/zoom²,
    // 보이는 폭보다 빨리 다가간다) 카디오이드 내부만 보이지 않고 경계 무늬가 화면에 남게 한다.
    const step = 3 / (zoom * Math.min(width, height)), pull = clamp01(1 - 1 / (zoom * zoom));
    const centerRe = julia ? 0 : -0.5 + (-0.743643887 + 0.5) * pull, centerIm = julia ? 0 : 0.131825904 * pull;
    const escape = new Float32Array(width * height);
    let low = Infinity, high = -Infinity;
    for (let y = 0, index = 0; y < height; y += 1) {
      const im = centerIm + (y + 0.5 - height / 2) * step;
      for (let x = 0; x < width; x += 1, index += 1) {
        const re = centerRe + (x + 0.5 - width / 2) * step;
        const value = julia ? escapeTime(re, im, cRe, cIm, iterations) : insideMainBulbs(re, im) ? -1 : escapeTime(0, 0, re, im, iterations);
        escape[index] = value;
        if (value >= 0) { low = Math.min(low, value); high = Math.max(high, value); }
      }
    }
    // 화면에 보이는 탈출 횟수 범위를 로그로 펴서 팔레트 전체를 쓴다(확대·반복 한도가 달라도 대비가 유지된다).
    const range = high > low ? Math.log1p(high - low) : 1;
    for (let index = 0, offset = 0; index < escape.length; index += 1, offset += 4) {
      const value = escape[index]!;
      if (value < 0) { blendPixel(data, offset, mode, 0, 0, 0); continue; }
      const slot = Math.round(255 * clamp01(Math.log1p(value - low) / range)) * 3;
      blendPixel(data, offset, mode, table[slot]!, table[slot + 1]!, table[slot + 2]!);
    }
  },
};

// ── 체커보드·격자 ─────────────────────────────────────────────────────

const CHECKER_SIZE = slider("size", "칸 크기", 2, 200, 1, 16, "px");
const CHECKER_COLOR1 = color("color1", "색 1", "#ffffff");
const CHECKER_COLOR2 = color("color2", "색 2", "#c8c8c8");

const checkerboard: StudioFilterGalleryEffectDef = {
  id: "render.checkerboard",
  category: "render",
  label: "체커보드",
  description: "두 색이 번갈아 놓인 체커보드 무늬를 이미지에 합성합니다.",
  references: ["GIMP · 체커보드"],
  params: [CHECKER_SIZE.spec, CHECKER_COLOR1.spec, CHECKER_COLOR2.spec, BLEND.spec],
  cost: 0.25,
  apply(image, params) {
    const { width, height, data } = image;
    const size = Math.round(CHECKER_SIZE.read(params)), mode = BLEND.read(params);
    const [r1, g1, b1] = CHECKER_COLOR1.read(params), [r2, g2, b2] = CHECKER_COLOR2.read(params);
    for (let y = 0, offset = 0; y < height; y += 1) {
      const band = Math.floor(y / size);
      for (let x = 0; x < width; x += 1, offset += 4) {
        if (((Math.floor(x / size) + band) & 1) === 0) blendPixel(data, offset, mode, r1, g1, b1);
        else blendPixel(data, offset, mode, r2, g2, b2);
      }
    }
  },
};

const GRID_SPACING = slider("spacing", "간격", 4, 200, 1, 32, "px");
const GRID_WIDTH = slider("lineWidth", "선 두께", 1, 20, 1, 1, "px");
const GRID_COLOR = color("color", "선 색", "#000000");
const GRID_OFFSET_X = slider("offsetX", "가로 오프셋", 0, 200, 1, 0, "px");
const GRID_OFFSET_Y = slider("offsetY", "세로 오프셋", 0, 200, 1, 0, "px");

const grid: StudioFilterGalleryEffectDef = {
  id: "render.grid",
  category: "render",
  label: "격자",
  description: "일정한 간격의 격자선을 그림이 있는 곳 위에 불투명한 색으로 그립니다.",
  references: ["GIMP · 격자"],
  params: [GRID_SPACING.spec, GRID_WIDTH.spec, GRID_COLOR.spec, GRID_OFFSET_X.spec, GRID_OFFSET_Y.spec],
  cost: 0.25,
  apply(image, params) {
    const { width, height, data } = image;
    const spacing = Math.round(GRID_SPACING.read(params)), lineWidth = Math.min(spacing, Math.round(GRID_WIDTH.read(params)));
    const offsetX = Math.round(GRID_OFFSET_X.read(params)), offsetY = Math.round(GRID_OFFSET_Y.read(params));
    const [red, green, blue] = GRID_COLOR.read(params);
    // 선은 오프셋에서 시작해 간격마다 lineWidth px 폭이다. 알파는 그대로 두므로 투명한 곳에는 선이 생기지 않는다.
    const onLine = (value: number, offset: number): boolean => (((value - offset) % spacing) + spacing) % spacing < lineWidth;
    const columns = new Uint8Array(width);
    for (let x = 0; x < width; x += 1) columns[x] = onLine(x, offsetX) ? 1 : 0;
    for (let y = 0, offset = 0; y < height; y += 1) {
      const row = onLine(y, offsetY);
      for (let x = 0; x < width; x += 1, offset += 4) {
        if ((row || columns[x] === 1) && data[offset + 3] !== 0) {
          data[offset] = red; data[offset + 1] = green; data[offset + 2] = blue;
        }
      }
    }
  },
};

// ── 나선 ──────────────────────────────────────────────────────────────

const SPIRAL_TYPE = choice("type", "종류", [["linear", "선형"], ["logarithmic", "로그"]], "linear");
const SPIRAL_FREQUENCY = slider("frequency", "감김 수", 1, 20, 0.5, 4);
const SPIRAL_ANGLE = slider("angle", "회전", 0, 360, 1, 0, "°");
const SPIRAL_COLOR1 = color("color1", "색 1", "#000000");
const SPIRAL_COLOR2 = color("color2", "색 2", "#ffffff");
const SPIRAL_CLOCKWISE = toggle("clockwise", "시계 방향", true);

const spiral: StudioFilterGalleryEffectDef = {
  id: "render.spiral",
  category: "render",
  label: "나선",
  description: "이미지 중심을 감아 도는 두 색 나선 무늬를 합성합니다.",
  references: ["GIMP · 나선"],
  params: [SPIRAL_TYPE.spec, SPIRAL_FREQUENCY.spec, SPIRAL_ANGLE.spec, SPIRAL_COLOR1.spec, SPIRAL_COLOR2.spec, SPIRAL_CLOCKWISE.spec, BLEND.spec],
  cost: 0.75,
  apply(image, params) {
    const { width, height, data } = image;
    const logarithmic = SPIRAL_TYPE.read(params) === "logarithmic", frequency = SPIRAL_FREQUENCY.read(params);
    const turn = SPIRAL_CLOCKWISE.read(params) ? 1 : -1, phase = SPIRAL_ANGLE.read(params) / 360;
    const [r1, g1, b1] = SPIRAL_COLOR1.read(params), [r2, g2, b2] = SPIRAL_COLOR2.read(params), mode = BLEND.read(params);
    const centerX = width / 2, centerY = height / 2, reach = Math.max(1, Math.hypot(width, height) / 2);
    for (let y = 0, offset = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1, offset += 4) {
        const dx = x + 0.5 - centerX, dy = y + 0.5 - centerY, radius = Math.max(1e-3, Math.sqrt(dx * dx + dy * dy));
        // 선형(아르키메데스) 나선은 반지름에, 로그 나선은 반지름의 로그에 비례해 감긴다. 화면 좌표(y 아래)에서 각이 커지면 시계 방향이다.
        const radial = logarithmic ? frequency * 0.25 * Math.log2(Math.max(radius, 0.5)) : (frequency * radius) / reach;
        const slope = logarithmic ? (frequency * 0.25) / (radius * Math.LN2) : frequency / reach;
        const v = radial - turn * (Math.atan2(dy, dx) / (2 * Math.PI) - phase);
        const wave = Math.abs(2 * (v - Math.floor(v)) - 1);
        // 한 픽셀만큼의 위상 변화(삼각파 기울기 2 × |∇v|)를 경계 폭으로 써서 계단 없이 두 색을 잇는다.
        const turnRate = 1 / (2 * Math.PI * radius), edge = clamp(Math.sqrt(slope * slope + turnRate * turnRate), 0.02, 0.5);
        const t = smoothstep(0.5 - edge, 0.5 + edge, wave);
        blendPixel(data, offset, mode, mix(r1, r2, t), mix(g1, g2, t), mix(b1, b2, t));
      }
    }
  },
};

// ── 미로 ──────────────────────────────────────────────────────────────

const MAZE_SIZE = slider("cellSize", "칸 크기", 2, 64, 1, 12, "px");
const MAZE_ALGORITHM = choice("algorithm", "생성 방식", [["depth-first", "깊이 우선"], ["prim", "프림"]], "depth-first");
const MAZE_WALL = color("wallColor", "벽 색", "#000000");
const MAZE_PATH = color("pathColor", "길 색", "#ffffff");
const OPEN_RIGHT = 1, OPEN_DOWN = 2;

/** cell 과 이웃 next 사이 벽을 튼다. 방마다 오른쪽·아래 통로 비트만 저장한다. */
function connect(open: Uint8Array, cell: number, next: number, columns: number): void {
  if (next === cell + 1) open[cell]! |= OPEN_RIGHT;
  else if (next === cell - 1) open[next]! |= OPEN_RIGHT;
  else if (next === cell + columns) open[cell]! |= OPEN_DOWN;
  else open[next]! |= OPEN_DOWN;
}

/** state 값이 wanted 인 상하좌우 이웃을 out 에 모으고 개수를 돌려준다. */
function gather(cell: number, columns: number, rows: number, state: Uint8Array, wanted: number, out: Int32Array): number {
  const x = cell % columns, y = (cell - x) / columns;
  let count = 0;
  if (x > 0 && state[cell - 1] === wanted) { out[count] = cell - 1; count += 1; }
  if (x < columns - 1 && state[cell + 1] === wanted) { out[count] = cell + 1; count += 1; }
  if (y > 0 && state[cell - columns] === wanted) { out[count] = cell - columns; count += 1; }
  if (y < rows - 1 && state[cell + columns] === wanted) { out[count] = cell + columns; count += 1; }
  return count;
}

/**
 * 완전 미로(사이클 없이 모든 방이 이어진 신장 트리)를 판다. 깊이 우선은 막다른 곳까지 무작위로 파고 막히면 스택을 되돌아가
 * 긴 복도가 생기고, 무작위 프림은 미로 경계 칸을 하나씩 무작위로 붙여 짧은 가지가 많다. 둘 다 방 수에 선형이다.
 */
function carveMaze(columns: number, rows: number, prim: boolean, random: () => number): Uint8Array {
  const cells = columns * rows, open = new Uint8Array(cells), state = new Uint8Array(cells);
  const list = new Int32Array(cells), around = new Int32Array(4);
  const start = Math.min(cells - 1, Math.floor(random() * cells));
  let size = 0;
  if (!prim) {
    state[start] = 1; list[0] = start; size = 1;
    while (size > 0) {
      const cell = list[size - 1]!, count = gather(cell, columns, rows, state, 0, around);
      if (count === 0) { size -= 1; continue; }
      const next = around[Math.floor(random() * count)]!;
      connect(open, cell, next, columns);
      state[next] = 1; list[size] = next; size += 1;
    }
    return open;
  }
  // state: 0 = 아직 밖, 1 = 경계(frontier), 2 = 미로 안.
  const join = (cell: number): void => {
    state[cell] = 2;
    const count = gather(cell, columns, rows, state, 0, around);
    for (let k = 0; k < count; k += 1) {
      state[around[k]!] = 1; list[size] = around[k]!; size += 1;
    }
  };
  join(start);
  while (size > 0) {
    const pick = Math.floor(random() * size), cell = list[pick]!;
    size -= 1; list[pick] = list[size]!;
    const count = gather(cell, columns, rows, state, 2, around);
    connect(open, cell, around[Math.floor(random() * count)]!, columns);
    join(cell);
  }
  return open;
}

/** 블록 좌표가 길인지. 홀수·홀수 블록은 방, 짝수·짝수 블록은 기둥(벽), 나머지는 두 방 사이 벽(통로가 뚫렸으면 길)이다. */
function isMazePath(open: Uint8Array, columns: number, rows: number, bx: number, by: number): boolean {
  if (bx < 1 || by < 1 || bx > 2 * columns - 1 || by > 2 * rows - 1) return false;
  const oddX = (bx & 1) === 1, oddY = (by & 1) === 1;
  if (oddX && oddY) return true;
  if (!oddX && !oddY) return false;
  if (!oddX) return (open[((by - 1) / 2) * columns + bx / 2 - 1]! & OPEN_RIGHT) !== 0;
  return (open[(by / 2 - 1) * columns + (bx - 1) / 2]! & OPEN_DOWN) !== 0;
}

const maze: StudioFilterGalleryEffectDef = {
  id: "render.maze",
  category: "render",
  label: "미로",
  description: "시드로 정해지는 완전 미로를 벽 색과 길 색으로 그려 이미지에 합성합니다.",
  references: ["GIMP · 미로"],
  params: [MAZE_SIZE.spec, MAZE_ALGORITHM.spec, MAZE_WALL.spec, MAZE_PATH.spec, BLEND.spec],
  cost: 0.5,
  apply(image, params, context) {
    const { width, height, data } = image;
    const block = Math.round(MAZE_SIZE.read(params)), mode = BLEND.read(params);
    const [wallRed, wallGreen, wallBlue] = MAZE_WALL.read(params), [pathRed, pathGreen, pathBlue] = MAZE_PATH.read(params);
    // 방 하나가 블록 하나, 방 사이 벽도 블록 하나다. 방 수는 이미지에 들어가는 만큼이고(작아도 1×1), 미로를 가운데 두고
    // 남는 가장자리는 벽으로 칠한다.
    const columns = Math.max(1, Math.floor((Math.floor(width / block) - 1) / 2));
    const rows = Math.max(1, Math.floor((Math.floor(height / block) - 1) / 2));
    const open = carveMaze(columns, rows, MAZE_ALGORITHM.read(params) === "prim", seededRandom(effectSeed(context, 0x3a2e)));
    const originX = Math.floor((width - (2 * columns + 1) * block) / 2), originY = Math.floor((height - (2 * rows + 1) * block) / 2);
    for (let y = 0, offset = 0; y < height; y += 1) {
      const by = Math.floor((y - originY) / block);
      for (let x = 0; x < width; x += 1, offset += 4) {
        if (isMazePath(open, columns, rows, Math.floor((x - originX) / block), by)) blendPixel(data, offset, mode, pathRed, pathGreen, pathBlue);
        else blendPixel(data, offset, mode, wallRed, wallGreen, wallBlue);
      }
    }
  },
};

// ── 사인 무늬·차이 구름 ───────────────────────────────────────────────

const SINUS_X = slider("xScale", "가로 배율", 0.1, 100, 0.1, 15);
const SINUS_Y = slider("yScale", "세로 배율", 0.1, 100, 0.1, 15);
const SINUS_COMPLEXITY = slider("complexity", "복잡도", 0, 15, 0.1, 1);
const SINUS_COLOR1 = color("color1", "색 1", "#ffff00");
const SINUS_COLOR2 = color("color2", "색 2", "#0000ff");

const sinus: StudioFilterGalleryEffectDef = {
  id: "render.sinus",
  category: "render",
  label: "사인 패턴",
  description: "서로의 위상을 흔드는 두 사인파로 두 색 물결 무늬를 만들어 합성합니다.",
  references: ["GIMP · 사인(Sinus)"],
  params: [SINUS_X.spec, SINUS_Y.spec, SINUS_COMPLEXITY.spec, SINUS_COLOR1.spec, SINUS_COLOR2.spec, BLEND.spec],
  cost: 1,
  apply(image, params, context) {
    const { width, height, data } = image;
    // 배율 1 은 긴 변을 따라 반 주기다(같은 배율이면 가로·세로 무늬 크기가 같다).
    const reference = Math.max(width, height);
    const fx = (Math.PI * SINUS_X.read(params)) / reference, fy = (Math.PI * SINUS_Y.read(params)) / reference;
    const complexity = 0.5 * SINUS_COMPLEXITY.read(params), mode = BLEND.read(params);
    const [r1, g1, b1] = SINUS_COLOR1.read(params), [r2, g2, b2] = SINUS_COLOR2.read(params);
    const random = seededRandom(effectSeed(context, 0x5155));
    const phase1 = 2 * Math.PI * random(), phase2 = 2 * Math.PI * random(), phase3 = 2 * Math.PI * random(), phase4 = 2 * Math.PI * random();
    for (let y = 0, offset = 0; y < height; y += 1) {
      const b = (y + 0.5) * fy;
      for (let x = 0; x < width; x += 1, offset += 4) {
        const a = (x + 0.5) * fx;
        // complexity 만큼 서로의 위상을 흔들어(영역 뒤틀기) 0 이면 단순한 격자 물결, 클수록 소용돌이 간섭 무늬가 된다.
        const u = a + complexity * Math.sin(0.7 * b + phase1), v = b + complexity * Math.sin(0.7 * a + phase2);
        const t = 0.5 + 0.25 * (Math.sin(u + phase3) + Math.sin(v + phase4));
        blendPixel(data, offset, mode, mix(r1, r2, t), mix(g1, g2, t), mix(b1, b2, t));
      }
    }
  },
};

const CLOUDS_SCALE = slider("scale", "구름 크기", 4, 512, 1, 128, "px");
const CLOUDS_DETAIL = slider("detail", "세부 단계", 1, 8, 1, 6);

const differenceClouds: StudioFilterGalleryEffectDef = {
  id: "render.difference-clouds",
  category: "render",
  label: "차이 구름",
  description: "프랙털 구름을 만들어 이미지와 차이(|원본 − 구름|)로 섞습니다.",
  references: ["Photoshop · 차이 구름"],
  params: [CLOUDS_SCALE.spec, CLOUDS_DETAIL.spec],
  cost: 1.5,
  apply(image, params, context) {
    const { width, height, data } = image;
    const scale = CLOUDS_SCALE.read(params), octaves = Math.round(CLOUDS_DETAIL.read(params)), seed = effectSeed(context, 0xd1ff);
    for (let y = 0, offset = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1, offset += 4) {
        if (data[offset + 3] === 0) continue;
        // 프랙털 값 노이즈는 0.5 근처에 몰리므로 대비를 넓혀 흑백 구름(0~255)으로 쓴다.
        const cloud = 255 * clamp01(0.5 + 2.2 * (fbm2((x + 0.5) / scale, (y + 0.5) / scale, seed, octaves) - 0.5));
        data[offset] = Math.abs(data[offset]! - cloud);
        data[offset + 1] = Math.abs(data[offset + 1]! - cloud);
        data[offset + 2] = Math.abs(data[offset + 2]! - cloud);
      }
    }
  },
};

/** 렌더 계열 효과(분류 render). 갤러리 목록에 이 순서로 나온다. */
export const STUDIO_FILTER_GALLERY_RENDER_EFFECTS: readonly StudioFilterGalleryEffectDef[] = [
  fibers, plasma, voronoi, fractal, checkerboard, grid, spiral, maze, sinus, differenceClouds,
];
