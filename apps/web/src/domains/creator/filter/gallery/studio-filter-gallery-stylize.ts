/**
 * 필터 갤러리 "스타일화" 분류 커널 6종(확산·돌출·타일·윤곽선 추적·바람·판화).
 *
 * 공개 매뉴얼의 기능 설명과 일반적인 래스터 기법(무작위 픽셀 교환, 화가 알고리즘과 원근 투영, 삼각형 래스터화,
 * 채널별 등고선, 행 단위 줄무늬 전파)만으로 새로 구현했다. 난수는 context.seed 에 효과별 상수를 더한 해시에서만
 * 나오고 크기 매개변수는 이미지 px 단위다. 알파는 그대로 두되 두 가지 예외가 있다.
 * - 돌출: 그려진 블록·피라미드 면에 칸 평균 알파(이미지 전면은 원본 알파)를 쓴다. 완전 투명 칸은 그리지 않는다.
 * - 타일의 "투명" 채우기: 타일이 원본 알파를 함께 옮기고 빈 틈은 알파 0 이 된다.
 */
import { clamp, hash2, luma, lumaPlane, sobel } from "./studio-filter-gallery-kernel-utils";
import {
  alphaWeightedLuma,
  paramChoices,
  paramColor,
  paramSelect,
  paramSlider,
  paramToggle,
  readColor,
  readSelect,
  readSlider,
  readToggle,
} from "./studio-filter-gallery-sketch";

import type { StudioFilterGalleryEffectDef } from "./studio-filter-gallery-types";

// ── 18. 확산 ──

const DF_MODE = paramSelect(
  "mode",
  "모드",
  paramChoices(["normal", "보통"], ["darken-only", "어둡게만"], ["lighten-only", "밝게만"], ["anisotropic", "이방성"]),
  "normal",
);
const DF_AMOUNT = paramSlider("amount", "양", 1, 20, 3);

const diffuse: StudioFilterGalleryEffectDef = {
  id: "stylize.diffuse",
  category: "stylize",
  label: "확산",
  description: "픽셀을 정한 거리 안에서 무작위로 뒤섞어 초점이 흐트러진 듯 만들며, 어둡게·밝게만 바꾸거나 색 변화가 적은 쪽으로만 섞을 수 있습니다.",
  references: ["Photoshop · 확산", "GIMP · 흩뿌리기(Spread)"],
  params: [DF_MODE, DF_AMOUNT],
  cost: 3,
  apply(image, params, context) {
    const mode = readSelect(params, DF_MODE);
    const reach = Math.max(1, Math.round(readSlider(params, DF_AMOUNT)));
    const seed = context.seed + 2111;
    const { width, height, data } = image;
    const source = data.slice();
    const brightness = lumaPlane(image);
    // 이방성: 흐린 휘도의 기울기에 수직인 방향(등휘도선)이 색 변화가 가장 적은 쪽이다.
    const gradient = mode === "anisotropic" ? sobel(alphaWeightedLuma(image, 1), width, height) : null;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const jitter = hash2(x, y, seed) * 2 - 1;
        let dx = Math.round(jitter * reach);
        let dy = Math.round((hash2(x, y, seed + 1) * 2 - 1) * reach);
        if (gradient) {
          const gx = gradient.gx[index];
          const gy = gradient.gy[index];
          const magnitude = Math.hypot(gx, gy);
          if (magnitude > 1) {
            dx = Math.round((-gy / magnitude) * jitter * reach);
            dy = Math.round((gx / magnitude) * jitter * reach);
          }
        }
        const from = clamp(y + dy, 0, height - 1) * width + clamp(x + dx, 0, width - 1);
        // 투명 픽셀의 RGB 는 가져오지 않는다. 어둡게·밝게 모드는 조건에 맞는 후보만 받는다.
        if (source[from * 4 + 3] === 0) continue;
        if (mode === "darken-only" && !(brightness[from] < brightness[index])) continue;
        if (mode === "lighten-only" && !(brightness[from] > brightness[index])) continue;
        data[index * 4] = source[from * 4];
        data[index * 4 + 1] = source[from * 4 + 1];
        data[index * 4 + 2] = source[from * 4 + 2];
      }
    }
  },
};

// ── 19. 돌출 ──

const EX_TYPE = paramSelect("type", "유형", paramChoices(["blocks", "블록"], ["pyramids", "피라미드"]), "blocks");
const EX_SIZE = paramSlider("size", "크기", 2, 255, 30);
const EX_DEPTH = paramSlider("depth", "깊이", 1, 255, 30);
const EX_DEPTH_MODE = paramSelect("depthMode", "깊이 방식", paramChoices(["random", "무작위"], ["level-based", "밝기 기반"]), "random");
const EX_SOLID = paramToggle("solidFront", "단색 전면", false);

/** 블록 측면 밝기(위·오른쪽·아래·왼쪽을 향한 면 순서). 빛은 왼쪽 위에서 온다. */
const BLOCK_SIDE_SHADE = [0.92, 0.58, 0.46, 0.8] as const;
/** 피라미드 면 음영용 빛 벡터(왼쪽 위 + 앞쪽, 정규화). */
const PYRAMID_LIGHT = [-1 / Math.hypot(1, 1, 1.4), -1 / Math.hypot(1, 1, 1.4), 1.4 / Math.hypot(1, 1, 1.4)] as const;

/** 선분 (ax, ay)–(bx, by) 가 수평선 y 와 만나는 x. 만나지 않으면(수평 선분 포함) NaN. */
function crossX(ax: number, ay: number, bx: number, by: number, y: number): number {
  if ((ay > y) === (by > y)) return Number.NaN;
  return ax + ((y - ay) * (bx - ax)) / (by - ay);
}

/**
 * 삼각형을 단색으로 채운다. 행마다 세 변과의 교점으로 구간을 구하는 주사선 방식이라 길고 가는 측면도
 * 경계 상자 전체를 훑지 않는다. 픽셀 중심이 [왼쪽, 오른쪽) 반열린 구간에 들 때 칠하므로 이웃 삼각형과
 * 틈이나 겹침이 없다. 넓이가 0 이하(화면에서 뒤를 향한 면)면 그리지 않는다.
 */
function fillTriangle(
  data: Uint8ClampedArray, width: number, height: number,
  ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
  rgba: Float32Array,
): void {
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (!(area > 1e-9)) return;
  const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(ay, by, cy)));
  for (let y = minY; y <= maxY; y += 1) {
    const py = y + 0.5;
    const first = crossX(ax, ay, bx, by, py);
    const second = crossX(bx, by, cx, cy, py);
    const third = crossX(cx, cy, ax, ay, py);
    const left = Math.min(Number.isNaN(first) ? Infinity : first, Number.isNaN(second) ? Infinity : second, Number.isNaN(third) ? Infinity : third);
    const right = Math.max(Number.isNaN(first) ? -Infinity : first, Number.isNaN(second) ? -Infinity : second, Number.isNaN(third) ? -Infinity : third);
    const end = Math.min(width, Math.ceil(right - 0.5));
    for (let x = Math.max(0, Math.ceil(left - 0.5)); x < end; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = rgba[0];
      data[offset + 1] = rgba[1];
      data[offset + 2] = rgba[2];
      data[offset + 3] = rgba[3];
    }
  }
}

const extrude: StudioFilterGalleryEffectDef = {
  id: "stylize.extrude",
  category: "stylize",
  label: "돌출",
  description: "이미지를 격자 칸으로 나눠 화면 중심에서 튀어나온 입체 블록이나 피라미드로 그리며, 그려진 면은 칸 평균 알파를 쓰고 완전 투명 칸은 그리지 않습니다.",
  references: ["Photoshop · 돌출"],
  params: [EX_TYPE, EX_SIZE, EX_DEPTH, EX_DEPTH_MODE, EX_SOLID],
  cost: 3,
  apply(image, params, context) {
    const { width, height, data } = image;
    const size = Math.max(2, Math.min(Math.round(readSlider(params, EX_SIZE)), Math.max(width, height)));
    const depth = readSlider(params, EX_DEPTH);
    const pyramids = readSelect(params, EX_TYPE) === "pyramids";
    const levelBased = readSelect(params, EX_DEPTH_MODE) === "level-based";
    const solid = readToggle(params, EX_SOLID);
    const seed = context.seed + 3109;
    const source = data.slice();
    const columns = Math.ceil(width / size);
    const rows = Math.ceil(height / size);
    const count = columns * rows;
    const colors = new Float32Array(count * 4);
    const lifts = new Uint8Array(count);
    const keys = new Float64Array(count);
    const centerX = width / 2;
    const centerY = height / 2;
    const maxDistance = Math.hypot(centerX, centerY) + 1;
    for (let cell = 0; cell < count; cell += 1) {
      const column = cell % columns;
      const row = (cell - column) / columns;
      const x0 = column * size, y0 = row * size, x1 = Math.min(width, x0 + size), y1 = Math.min(height, y0 + size);
      let red = 0, green = 0, blue = 0, alpha = 0;
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          const offset = (y * width + x) * 4;
          const a = source[offset + 3];
          red += source[offset] * a;
          green += source[offset + 1] * a;
          blue += source[offset + 2] * a;
          alpha += a;
        }
      }
      if (alpha > 0) {
        colors[cell * 4] = red / alpha;
        colors[cell * 4 + 1] = green / alpha;
        colors[cell * 4 + 2] = blue / alpha;
      }
      colors[cell * 4 + 3] = alpha / ((x1 - x0) * (y1 - y0));
      const level = alpha > 0 ? luma(red / alpha, green / alpha, blue / alpha) / 255 : 0;
      const lift = Math.round(depth * (levelBased ? level : hash2(column, row, seed)));
      lifts[cell] = lift;
      // 화가 알고리즘: 낮은 블록부터, 같은 높이면 중심에서 먼 블록부터 그린다(정렬 키에 칸 번호를 실어 둔다).
      const distance = Math.hypot((x0 + x1) / 2 - centerX, (y0 + y1) / 2 - centerY) / maxDistance;
      keys[cell] = (lift * 4096 + 4095 - Math.round(distance * 4095)) * count + cell;
    }
    keys.sort();
    // 화면 중심 위의 시점에서 본 원근: 높이 z 인 점은 중심에서 (1 + z / focal) 배 멀어진다.
    const focal = Math.max(width, height) * 0.9;
    const corners = new Float32Array(8);
    const front = new Float32Array(8);
    const rgba = new Float32Array(4);
    for (let k = 0; k < count; k += 1) {
      const cell = keys[k] % count;
      if (colors[cell * 4 + 3] < 0.5) continue;
      const column = cell % columns;
      const row = (cell - column) / columns;
      const x0 = column * size, y0 = row * size, x1 = Math.min(width, x0 + size), y1 = Math.min(height, y0 + size);
      const scale = Math.min(2.5, 1 + lifts[cell] / focal);
      // 바닥 사각형(시계 방향: 왼쪽 위 → 오른쪽 위 → 오른쪽 아래 → 왼쪽 아래)과 그 투영.
      corners[0] = x0; corners[1] = y0; corners[2] = x1; corners[3] = y0;
      corners[4] = x1; corners[5] = y1; corners[6] = x0; corners[7] = y1;
      for (let i = 0; i < 8; i += 2) {
        front[i] = centerX + (corners[i] - centerX) * scale;
        front[i + 1] = centerY + (corners[i + 1] - centerY) * scale;
      }
      const apexX = centerX + ((x0 + x1) / 2 - centerX) * scale;
      const apexY = centerY + ((y0 + y1) / 2 - centerY) * scale;
      const halfX = (x1 - x0) / 2, halfY = (y1 - y0) / 2;
      for (let side = 0; side < 4; side += 1) {
        const a = side * 2, b = ((side + 1) % 4) * 2;
        let shade = BLOCK_SIDE_SHADE[side];
        if (pyramids) {
          // 피라미드 면의 바깥 법선 (±z, 0, 반폭) 또는 (0, ±z, 반폭) 과 빛의 램버트 음영(평면일 때 1).
          const nx = side === 1 ? lifts[cell] : side === 3 ? -lifts[cell] : 0;
          const ny = side === 2 ? lifts[cell] : side === 0 ? -lifts[cell] : 0;
          const nz = side % 2 === 0 ? halfY : halfX;
          const lambert = (nx * PYRAMID_LIGHT[0] + ny * PYRAMID_LIGHT[1] + nz * PYRAMID_LIGHT[2]) / Math.hypot(nx, ny, nz);
          shade = 0.4 + (0.6 * Math.max(0, lambert)) / PYRAMID_LIGHT[2];
        }
        for (let channel = 0; channel < 3; channel += 1) rgba[channel] = colors[cell * 4 + channel] * shade;
        rgba[3] = colors[cell * 4 + 3];
        if (pyramids) {
          fillTriangle(data, width, height, corners[a], corners[a + 1], corners[b], corners[b + 1], apexX, apexY, rgba);
        } else {
          // 측면 사각형을 삼각형 두 개로. 뒷면(중심 반대쪽을 향한 면)은 넓이가 음수라 그려지지 않는다.
          fillTriangle(data, width, height, corners[a], corners[a + 1], corners[b], corners[b + 1], front[b], front[b + 1], rgba);
          fillTriangle(data, width, height, corners[a], corners[a + 1], front[b], front[b + 1], front[a], front[a + 1], rgba);
        }
      }
      if (pyramids) continue;
      // 전면: 단색이면 칸 평균색, 아니면 칸의 원본 그림을 전면 크기로 늘려 보여 준다.
      const startX = Math.max(0, Math.ceil(front[0] - 0.5)), endX = Math.min(width, Math.ceil(front[2] - 0.5));
      const startY = Math.max(0, Math.ceil(front[1] - 0.5)), endY = Math.min(height, Math.ceil(front[5] - 0.5));
      for (let y = startY; y < endY; y += 1) {
        const sourceY = Math.min(y1 - 1, y0 + Math.floor((y + 0.5 - front[1]) / scale));
        for (let x = startX; x < endX; x += 1) {
          const offset = (y * width + x) * 4;
          if (solid) {
            data[offset] = colors[cell * 4];
            data[offset + 1] = colors[cell * 4 + 1];
            data[offset + 2] = colors[cell * 4 + 2];
            data[offset + 3] = colors[cell * 4 + 3];
            continue;
          }
          const sourceX = Math.min(x1 - 1, x0 + Math.floor((x + 0.5 - front[0]) / scale));
          const sourceOffset = (Math.max(y0, sourceY) * width + Math.max(x0, sourceX)) * 4;
          data[offset] = source[sourceOffset];
          data[offset + 1] = source[sourceOffset + 1];
          data[offset + 2] = source[sourceOffset + 2];
          data[offset + 3] = source[sourceOffset + 3];
        }
      }
    }
  },
};

// ── 20. 타일 ──

const TL_COUNT = paramSlider("numberOfTiles", "타일 수", 1, 99, 10);
const TL_OFFSET = paramSlider("maxOffset", "최대 오프셋", 1, 99, 10, "%");
const TL_FILL = paramSelect(
  "fill",
  "빈 곳 채우기",
  paramChoices(["background", "배경색"], ["inverse", "반전"], ["unaltered", "원본"], ["transparent", "투명"]),
  "background",
);
const TL_COLOR = paramColor("fillColor", "채우기 색", "#ffffff");

const tiles: StudioFilterGalleryEffectDef = {
  id: "stylize.tiles",
  category: "stylize",
  label: "타일",
  description: "이미지를 정사각형 타일로 쪼개 무작위로 어긋나게 놓고 빈 틈을 배경색·반전·원본·투명 중 하나로 채우며, 투명 채우기는 타일이 알파를 함께 옮기고 틈을 알파 0 으로 만듭니다.",
  references: ["Photoshop · 타일"],
  params: [TL_COUNT, TL_OFFSET, TL_FILL, TL_COLOR],
  cost: 1,
  apply(image, params, context) {
    const { width, height, data } = image;
    // 타일 수는 짧은 변을 따라 센다. 최대 오프셋은 타일 크기의 %(최소 1px 이라 작은 이미지에서도 보인다).
    const tile = Math.max(1, Math.min(width, height) / readSlider(params, TL_COUNT));
    const reach = Math.max(1, (tile * readSlider(params, TL_OFFSET)) / 100);
    const fill = readSelect(params, TL_FILL);
    const [fillRed, fillGreen, fillBlue] = readColor(params, TL_COLOR);
    const transparent = fill === "transparent";
    const seed = context.seed + 3301;
    const source = data.slice();
    for (let offset = 0; offset < width * height * 4; offset += 4) {
      if (fill === "background") {
        data[offset] = fillRed;
        data[offset + 1] = fillGreen;
        data[offset + 2] = fillBlue;
      } else if (fill === "inverse") {
        data[offset] = 255 - source[offset];
        data[offset + 1] = 255 - source[offset + 1];
        data[offset + 2] = 255 - source[offset + 2];
      } else if (transparent) {
        data[offset + 3] = 0;
      }
    }
    const columns = Math.ceil(width / tile);
    const rows = Math.ceil(height / tile);
    for (let row = 0; row < rows; row += 1) {
      const y0 = Math.round(row * tile), y1 = Math.min(height, Math.round((row + 1) * tile));
      for (let column = 0; column < columns; column += 1) {
        const x0 = Math.round(column * tile), x1 = Math.min(width, Math.round((column + 1) * tile));
        const shiftX = Math.round((hash2(column, row, seed) * 2 - 1) * reach);
        const shiftY = Math.round((hash2(column, row, seed + 1) * 2 - 1) * reach);
        for (let y = Math.max(y0, -shiftY); y < Math.min(y1, height - shiftY); y += 1) {
          for (let x = Math.max(x0, -shiftX); x < Math.min(x1, width - shiftX); x += 1) {
            const from = (y * width + x) * 4;
            const to = ((y + shiftY) * width + x + shiftX) * 4;
            // 투명 채우기가 아니면 자리별 알파를 지키고, 투명 픽셀의 RGB 는 옮기지 않는다.
            if (!transparent && source[from + 3] === 0) continue;
            data[to] = source[from];
            data[to + 1] = source[from + 1];
            data[to + 2] = source[from + 2];
            if (transparent) data[to + 3] = source[from + 3];
          }
        }
      }
    }
  },
};

// ── 21. 윤곽선 추적 ──

const TC_LEVEL = paramSlider("level", "레벨", 0, 255, 128);
const TC_EDGE = paramSelect("edge", "가장자리", paramChoices(["lower", "아래"], ["upper", "위"]), "lower");

const traceContour: StudioFilterGalleryEffectDef = {
  id: "stylize.trace-contour",
  category: "stylize",
  label: "윤곽선 추적",
  description: "채널마다 값이 레벨을 넘나드는 경계를 찾아 흰 바탕 위에 등고선 같은 가는 색 윤곽선으로 그립니다.",
  references: ["Photoshop · 윤곽선 추적"],
  params: [TC_LEVEL, TC_EDGE],
  cost: 1,
  apply(image, params) {
    const level = readSlider(params, TC_LEVEL);
    const upper = readSelect(params, TC_EDGE) === "upper";
    const { width, height, data } = image;
    // 비트 0~2: 채널이 레벨보다 낮음, 비트 3: 불투명(투명 이웃의 RGB 는 비교하지 않는다).
    const flags = new Uint8Array(width * height);
    for (let index = 0, offset = 0; index < flags.length; index += 1, offset += 4) {
      let flag = data[offset + 3] > 0 ? 8 : 0;
      for (let channel = 0; channel < 3; channel += 1) if (data[offset + channel] < level) flag |= 1 << channel;
      flags[index] = flag;
    }
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x;
        const flag = flags[index];
        let crossing = 0;
        if (x > 0 && (flags[index - 1] & 8) !== 0) crossing |= flag ^ flags[index - 1];
        if (x < width - 1 && (flags[index + 1] & 8) !== 0) crossing |= flag ^ flags[index + 1];
        if (y > 0 && (flags[index - width] & 8) !== 0) crossing |= flag ^ flags[index - width];
        if (y < height - 1 && (flags[index + width] & 8) !== 0) crossing |= flag ^ flags[index + width];
        for (let channel = 0; channel < 3; channel += 1) {
          // 아래: 레벨보다 낮은 쪽 픽셀, 위: 레벨 이상인 쪽 픽셀에 그 채널만 0 인 선을 긋는다.
          const below = ((flag >> channel) & 1) === 1;
          const marked = ((crossing >> channel) & 1) === 1 && below !== upper;
          data[index * 4 + channel] = marked ? 0 : 255;
        }
      }
    }
  },
};

// ── 22. 바람 ──

const WD_METHOD = paramSelect("method", "방식", paramChoices(["wind", "바람"], ["blast", "강풍"], ["stagger", "엇갈림"]), "wind");
const WD_DIRECTION = paramSelect("direction", "방향", paramChoices(["from-right", "오른쪽에서"], ["from-left", "왼쪽에서"]), "from-right");
const WD_STRENGTH = paramSlider("strength", "세기", 1, 100, 30);

const wind: StudioFilterGalleryEffectDef = {
  id: "stylize.wind",
  category: "stylize",
  label: "바람",
  description: "밝고 대비가 큰 가장자리에서 바람이 부는 쪽으로 가는 가로 줄을 끌어 바람에 날린 듯 만듭니다.",
  references: ["Photoshop · 바람", "GIMP · 바람"],
  params: [WD_METHOD, WD_DIRECTION, WD_STRENGTH],
  cost: 1,
  apply(image, params, context) {
    const method = readSelect(params, WD_METHOD);
    // 바람이 진행하는 x 방향. "오른쪽에서" 불면 줄이 왼쪽으로 뻗는다.
    const step = readSelect(params, WD_DIRECTION) === "from-right" ? -1 : 1;
    const blast = method === "blast";
    const reach = readSlider(params, WD_STRENGTH) * (blast ? 1.6 : 1);
    const threshold = blast ? 10 : 18;
    const chance = blast ? 0.95 : 0.7;
    const opacity = blast ? 0.95 : 0.8;
    const seed = context.seed + 3407;
    const { width, height, data } = image;
    const source = data.slice();
    const brightness = lumaPlane(image);
    for (let y = 0; y < height; y += 1) {
      let red = 0, green = 0, blue = 0, strength = 0, length = 1, travelled = 0, delay = 0;
      for (let k = 0; k < width; k += 1) {
        const x = step > 0 ? k : width - 1 - k;
        const index = y * width + x;
        const upwind = x - step;
        if (upwind >= 0 && upwind < width && source[(index - step) * 4 + 3] > 0) {
          // 바람 부는 쪽 이웃이 충분히 밝으면(강풍은 어두워도) 그 색이 바람을 타고 흐르는 줄이 시작된다.
          const rise = brightness[index - step] - (source[index * 4 + 3] > 0 ? brightness[index] : 0);
          const contrast = blast ? Math.abs(rise) : rise;
          const remaining = strength * Math.max(0, 1 - Math.max(0, travelled - delay) / length);
          const start = opacity * Math.min(1, contrast / 96);
          if (contrast > threshold && start > remaining && hash2(x, y, seed) < chance) {
            red = source[(index - step) * 4];
            green = source[(index - step) * 4 + 1];
            blue = source[(index - step) * 4 + 2];
            strength = start;
            length = Math.max(2, reach * (0.3 + 0.7 * hash2(x, y, seed + 1)));
            travelled = 0;
            // 엇갈림: 줄마다 시작을 무작위로 늦춰 줄이 서로 어긋나 보이게 한다.
            delay = method === "stagger" ? Math.floor(hash2(y, x, seed + 2) * length * 0.6) : 0;
          }
        }
        if (strength <= 0) continue;
        const position = travelled - delay;
        travelled += 1;
        if (position < 0) continue;
        const fade = 1 - position / length;
        if (fade <= 0) {
          strength = 0;
          continue;
        }
        const offset = index * 4;
        if (source[offset + 3] === 0) continue;
        const weight = strength * fade;
        data[offset] = source[offset] + (red - source[offset]) * weight;
        data[offset + 1] = source[offset + 1] + (green - source[offset + 1]) * weight;
        data[offset + 2] = source[offset + 2] + (blue - source[offset + 2]) * weight;
      }
    }
  },
};

// ── 23. 판화 ──

const EN_HEIGHT = paramSlider("height", "높이", 2, 16, 10);
const EN_LIMIT = paramToggle("limitLineWidth", "선 굵기 제한", false);

const engrave: StudioFilterGalleryEffectDef = {
  id: "stylize.engrave",
  category: "stylize",
  label: "판화",
  description: "높이만큼의 가로 띠마다 띠의 어두운 정도에 비례하는 굵기의 검은 가로선을 새겨 동판화처럼 만듭니다.",
  references: ["GIMP · 판화(Engrave)"],
  params: [EN_HEIGHT, EN_LIMIT],
  cost: 1,
  apply(image, params) {
    const band = Math.round(readSlider(params, EN_HEIGHT));
    const limit = readToggle(params, EN_LIMIT);
    const { width, height, data } = image;
    for (let top = 0; top < height; top += band) {
      const bottom = Math.min(height, top + band);
      const rows = bottom - top;
      for (let x = 0; x < width; x += 1) {
        // 띠 안의 알파 가중 평균 밝기 → 선 굵기. 굵기 제한을 켜면 선 사이에 1px 흰 틈을 남긴다.
        let sum = 0, weight = 0;
        for (let y = top; y < bottom; y += 1) {
          const offset = (y * width + x) * 4;
          sum += luma(data[offset], data[offset + 1], data[offset + 2]) * data[offset + 3];
          weight += data[offset + 3];
        }
        const darkness = weight > 0 ? 1 - sum / weight / 255 : 0;
        const thickness = Math.min(Math.round(darkness * rows), limit ? rows - 1 : rows);
        const lineTop = top + Math.floor((rows - thickness) / 2);
        for (let y = top; y < bottom; y += 1) {
          const offset = (y * width + x) * 4;
          const value = y >= lineTop && y < lineTop + thickness ? 0 : 255;
          data[offset] = value;
          data[offset + 1] = value;
          data[offset + 2] = value;
        }
      }
    }
  },
};

/** 스타일화 분류 효과 목록(id 는 문서에 저장되므로 바꾸지 않는다). */
export const STUDIO_FILTER_GALLERY_STYLIZE_EFFECTS: readonly StudioFilterGalleryEffectDef[] = [
  diffuse,
  extrude,
  tiles,
  traceContour,
  wind,
  engrave,
];
