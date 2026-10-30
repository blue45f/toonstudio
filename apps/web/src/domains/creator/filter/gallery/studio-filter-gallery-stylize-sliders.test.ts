/**
 * 필터 갤러리 · 스타일화 그룹(타일·모자이크 타일) 슬라이더 무효 칸과 돌출 공유 모서리 틈 회귀 시험.
 * 슬라이더를 한 칸 옮겼는데 보이는 그림(알파, 알파가 0 이 아닌 픽셀의 RGB)이 같으면 사용자에게는 아무 일도 없는 칸이다.
 *   - 타일 최대 오프셋: 최대 이동(타일 × 오프셋 %)이 1px 아래면 1px 로 올려 잡아, 타일 × 오프셋 < 100 인 칸이 모두 같았다
 *     (256×192 에서 타일 수 10 은 1~5%, 30 은 1~15%, 99 는 1~51%). 이제 1px 아래에서는 최대 이동 / 2 비율의 타일만 1px 민다.
 *   - 모자이크 타일 줄눈 폭: 줄눈을 타일의 45% 에서 잘라 기본 타일 12px 에서 줄눈 폭 6~15 가, 타일 31px 이하에서는 늘 끝쪽 칸이
 *     같았다(2px 타일은 15칸 모두). 45% 위는 남은 칸을 나눠 타일 면이 타일의 10%(최소 0.7px) 남을 때까지 올린다.
 *   - 돌출 틈: 측면을 삼각형 둘로 나눠 그리며 공유 모서리를 서로 다른 끝점(Float32 로 반올림한 전면 꼭짓점 포함)에서 재서, 두 칸의
 *     벽이나 한 피라미드의 두 면이 맞닿은 모서리 위 픽셀 중심이 양쪽에서 다 빠지고 먼 칸·바탕이 1px 점선으로 비쳤다.
 * 고치지 않은 범위(최대 이동 1px 이상, 줄눈이 타일의 45% 이하, 공유 모서리 위에 픽셀 중심이 없는 돌출)는 고치기 전 커널로 잰
 * 지문과 바이트까지 같아야 한다.
 */
import { describe, expect, it } from "vitest";

import { luma } from "./studio-filter-gallery-kernel-utils";
import { STUDIO_FILTER_GALLERY_STYLIZE_EFFECTS } from "./studio-filter-gallery-stylize";
import { STUDIO_FILTER_GALLERY_TEXTURE_EFFECTS } from "./studio-filter-gallery-texture-stylize";

import type {
  StudioFilterGalleryEffectDef, StudioFilterGalleryImage, StudioFilterGalleryParamSpec, StudioFilterGalleryParams,
} from "./studio-filter-gallery-types";

type SliderSpec = Extract<StudioFilterGalleryParamSpec, { control: "slider" }>;
type Point = readonly [number, number];

const EFFECTS = [...STUDIO_FILTER_GALLERY_STYLIZE_EFFECTS, ...STUDIO_FILTER_GALLERY_TEXTURE_EFFECTS];
const SEED = 11;

function effectById(id: string): StudioFilterGalleryEffectDef {
  const found = EFFECTS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`효과 없음: ${id}`);
  return found;
}

/** 슬라이더가 고를 수 있는 모든 값(최소부터 간격마다). 이 그룹의 슬라이더는 모두 정수 간격이다. */
function sliderValues(effect: StudioFilterGalleryEffectDef, key: string): number[] {
  const spec = effect.params.find((candidate): candidate is SliderSpec => candidate.key === key && candidate.control === "slider");
  if (!spec) throw new Error(`슬라이더 없음: ${effect.id}.${key}`);
  const values: number[] = [];
  for (let value = spec.min; value <= spec.max; value += spec.step) values.push(value);
  return values;
}

function defaultsOf(effect: StudioFilterGalleryEffectDef): StudioFilterGalleryParams {
  return Object.fromEntries(effect.params.map((spec) => [spec.key, spec.default]));
}

function render(effect: StudioFilterGalleryEffectDef, image: StudioFilterGalleryImage, params: StudioFilterGalleryParams): Uint8ClampedArray {
  const copy = { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
  effect.apply(copy, params, { seed: SEED, scale: 1 });
  return copy.data;
}

/** 보이는 그림이 같은가: 알파가 모두 같고, 알파가 0 이 아닌 픽셀은 RGB 도 같다(완전 투명 픽셀의 숨은 RGB 는 보지 않는다). */
function sameVisible(left: Uint8ClampedArray, right: Uint8ClampedArray): boolean {
  for (let offset = 0; offset < left.length; offset += 4) {
    if (left[offset + 3] !== right[offset + 3]) return false;
    if (left[offset + 3] === 0) continue;
    if (left[offset] !== right[offset] || left[offset + 1] !== right[offset + 1] || left[offset + 2] !== right[offset + 2]) return false;
  }
  return true;
}

/** 슬라이더 전 칸을 훑어 바로 다음 칸과 보이는 그림이 같은 값들을 돌려준다(빈 배열이면 무효 칸이 없다). */
function identicalNeighbours(
  effect: StudioFilterGalleryEffectDef, key: string, image: StudioFilterGalleryImage, overrides: StudioFilterGalleryParams = {},
): number[] {
  const values = sliderValues(effect, key);
  const base = { ...defaultsOf(effect), ...overrides };
  const dead: number[] = [];
  let previous = render(effect, image, { ...base, [key]: values[0] ?? 0 });
  for (let index = 1; index < values.length; index += 1) {
    const current = render(effect, image, { ...base, [key]: values[index] ?? 0 });
    if (sameVisible(previous, current)) dead.push(values[index - 1] ?? 0);
    previous = current;
  }
  return dead;
}

/** FNV-1a 32비트 바이트 지문. */
function fingerprint(data: Uint8ClampedArray): string {
  let hash = 0x811c9dc5;
  for (const byte of data) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** 정수 좌표 해시 → [0, 1). */
function noise(x: number, y: number): number {
  const h = Math.imul((x * 374761393 + y * 668265263) | 0, 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 사진형 그림: 대각 그라데이션, 결정적 잡음(±20), 밝은 원판(하이라이트), 어두운 사선(가장자리). 불투명이다. */
function photo(width: number, height: number): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const grain = (noise(x, y) - 0.5) * 40, t = (x / width + y / height) / 2;
      let rgb = [30 + 200 * t + grain, 60 + 150 * (1 - t) + grain, 90 + 120 * t - grain];
      if ((x - width * 0.35) ** 2 + (y - height * 0.5) ** 2 < (height * 0.25) ** 2) rgb = [245, 232, 120 + grain];
      if (Math.abs(x - y * 1.3 - width * 0.2) < 2) rgb = [20, 18, 30];
      data.set([rgb[0] ?? 0, rgb[1] ?? 0, rgb[2] ?? 0, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

/** 점 (px, py) 와 선분 (ax, ay)–(bx, by) 의 거리. */
function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/**
 * 투명 바탕 선화: 안티에일리어스 고리와 사선 둘(가장자리 알파가 0~255 를 지난다), 가장자리로 옅어지는 반투명 볼 터치.
 * 완전 투명 픽셀의 숨은 RGB 는 hidden 이다.
 */
function lineArt(width: number, height: number, hidden: readonly [number, number, number] = [0, 0, 0]): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const px = x + 0.5, py = y + 0.5;
      const ring = Math.abs(Math.hypot(px - width * 0.5, py - height * 0.42) - height * 0.28);
      const strokes = Math.min(
        segmentDistance(px, py, width * 0.1, height * 0.9, width * 0.85, height * 0.6),
        segmentDistance(px, py, width * 0.2, height * 0.15, width * 0.3, height * 0.95),
      );
      const line = Math.max(0, Math.min(1, 2.2 - ring), Math.min(1, 1.6 - strokes));
      const cheek = Math.max(0, 1 - Math.hypot(px - width * 0.62, py - height * 0.5) / (height * 0.16)) * 0.7;
      const alpha = line + cheek * (1 - line);
      const offset = (y * width + x) * 4;
      if (alpha <= 0) {
        data.set([hidden[0], hidden[1], hidden[2], 0], offset);
        continue;
      }
      const share = line / alpha;
      data.set([30 * share + 240 * (1 - share), 25 * share + 120 * (1 - share), 45 * share + 130 * (1 - share), Math.round(alpha * 255)], offset);
    }
  }
  return { width, height, data };
}

/** 숨은 RGB 만 다른 두 결과에서 알파나 보이는 픽셀의 RGB 가 다른 픽셀 수. */
function hiddenRgbLeaks(black: Uint8ClampedArray, green: Uint8ClampedArray): number {
  let leaks = 0;
  for (let offset = 0; offset < black.length; offset += 4) {
    if (black[offset + 3] !== green[offset + 3]) leaks += 1;
    else if ((black[offset + 3] ?? 0) > 0 && [0, 1, 2].some((channel) => black[offset + channel] !== green[offset + channel])) leaks += 1;
  }
  return leaks;
}

describe("타일 · 최대 오프셋 슬라이더", () => {
  const tiles = effectById("stylize.tiles");
  const image = photo(256, 192), art = lineArt(256, 192);

  it("타일 수 10(기본값)·30·99 에서 최대 오프셋 1~99% 의 이웃 칸이 모두 다른 그림을 낸다(1px 아래 최대 이동을 1px 로 올리지 않는다)", () => {
    for (const numberOfTiles of [10, 30, 99]) {
      expect(identicalNeighbours(tiles, "maxOffset", image, { numberOfTiles }), `사진 타일 수 ${numberOfTiles}`).toEqual([]);
      expect(identicalNeighbours(tiles, "maxOffset", art, { numberOfTiles, fill: "transparent" }), `선화 타일 수 ${numberOfTiles}`).toEqual([]);
    }
  });

  it("최대 이동이 1px 이상이면 채우기마다 고치기 전과 바이트까지 같다(256×192 기본값은 1.92px)", () => {
    const expected = { background: "0679f3bc", inverse: "1178cace", unaltered: "8a254a77", transparent: "93fec1cd" };
    for (const [fill, print] of Object.entries(expected)) {
      expect(fingerprint(render(tiles, fill === "transparent" ? art : image, { ...defaultsOf(tiles), fill })), fill).toBe(print);
    }
    // 타일 1.94px × 60% = 1.16px: 1px 바로 위도 예전 반올림 그대로다.
    expect(fingerprint(render(tiles, image, { ...defaultsOf(tiles), numberOfTiles: 99, maxOffset: 60 }))).toBe("7b228d4f");
  });

  it("1px 아래 이동도 투명 픽셀의 숨은 RGB 를 보이는 픽셀로 옮기지 않고, 투명 채우기가 아니면 알파를 그대로 둔다", () => {
    const black = lineArt(256, 192, [0, 0, 0]), green = lineArt(256, 192, [0, 255, 0]);
    for (const fill of ["background", "inverse", "unaltered", "transparent"]) {
      const params = { ...defaultsOf(tiles), numberOfTiles: 99, maxOffset: 30, fill };
      const fromBlack = render(tiles, black, params);
      expect(hiddenRgbLeaks(fromBlack, render(tiles, green, params)), fill).toBe(0);
      if (fill === "transparent") continue;
      expect(fromBlack.every((value, index) => index % 4 !== 3 || value === black.data[index]), fill).toBe(true);
    }
  });
});

describe("모자이크 타일 · 줄눈 폭 슬라이더", () => {
  const mosaic = effectById("texture.mosaic-tiles");
  const image = photo(256, 192), art = lineArt(256, 192);

  it("타일 크기 2~31(기본값 12 포함)에서 줄눈 폭 1~15 의 이웃 칸이 모두 다른 그림을 낸다(타일의 45% 에서 자르지 않는다)", () => {
    for (const tileSize of [2, 3, 4, 6, 8, 12, 20, 31]) {
      expect(identicalNeighbours(mosaic, "groutWidth", image, { tileSize }), `사진 타일 ${tileSize}`).toEqual([]);
      expect(identicalNeighbours(mosaic, "groutWidth", art, { tileSize }), `선화 타일 ${tileSize}`).toEqual([]);
    }
  });

  it("줄눈 폭을 올릴수록 줄눈 픽셀이 늘고, 끝(15)에서도 타일 면이 남는다", () => {
    // 고른 어두운 회색(40)에서 줄눈 밝기 10 의 줄눈은 40 × 0.35 + 150 = 164, 타일 면은 40 × 0.58~1.37 이라 100 으로 가른다.
    const gray = { width: 128, height: 96, data: new Uint8ClampedArray(128 * 96 * 4).fill(40) };
    for (let offset = 3; offset < gray.data.length; offset += 4) gray.data[offset] = 255;
    for (const tileSize of [2, 4, 12, 20]) {
      const counts = sliderValues(mosaic, "groutWidth").map((groutWidth) => {
        const out = render(mosaic, gray, { ...defaultsOf(mosaic), tileSize, groutWidth, lightenGrout: 10 });
        let grout = 0;
        for (let offset = 0; offset < out.length; offset += 4) if ((out[offset] ?? 0) > 100) grout += 1;
        return grout;
      });
      for (let index = 1; index < counts.length; index += 1) expect(counts[index], `타일 ${tileSize}`).toBeGreaterThanOrEqual(counts[index - 1] ?? 0);
      expect(counts[counts.length - 1], `타일 ${tileSize}`).toBeLessThan(128 * 96);
      expect(counts[counts.length - 1], `타일 ${tileSize}`).toBeGreaterThan(counts[0] ?? 0);
    }
  });

  it("줄눈이 타일의 45% 이하인 칸은 고치기 전과 바이트까지 같다", () => {
    const cases: readonly (readonly [StudioFilterGalleryParams, string])[] = [
      [{}, "324d915b"],
      [{ groutWidth: 5 }, "cfb8fc05"],
      [{ tileSize: 3, groutWidth: 1 }, "0a5cadbb"],
      [{ tileSize: 40, groutWidth: 15 }, "1ecff16a"],
    ];
    for (const [params, expected] of cases) {
      expect(fingerprint(render(mosaic, image, { ...defaultsOf(mosaic), ...params })), JSON.stringify(params)).toBe(expected);
    }
  });
});

/** 단조 사슬 볼록 껍질(화면 좌표에서 시계 방향, 꼭짓점이 일직선이면 뺀다). */
function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const cross = (o: Point, a: Point, b: Point): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: readonly Point[]): Point[] => {
    const chain: Point[] = [];
    for (const point of list) {
      while (chain.length >= 2 && cross(chain[chain.length - 2] ?? point, chain[chain.length - 1] ?? point, point) <= 0) chain.pop();
      chain.push(point);
    }
    chain.pop();
    return chain;
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

/** (px, py) 가 볼록 껍질 안쪽(경계 제외)에 있는가. */
function strictlyInside(hull: readonly Point[], px: number, py: number): boolean {
  if (hull.length < 3) return false;
  return hull.every((a, index) => {
    const b = hull[(index + 1) % hull.length] ?? a;
    return (b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]) > 0;
  });
}

interface SolidCell { readonly column: number; readonly row: number; readonly gray: number }

/**
 * 투명 바탕 위 불투명 단색 칸들만 밝기 기반 돌출로 그리고 틈 픽셀 수를 센다. 틈은 알파 0 으로 남았는데 픽셀 중심 둘레(반지름
 * 0.001, 8방향)가 그린 칸들의 투영(바닥 사각형과 전면 사각형 또는 꼭짓점의 볼록 껍질) 합집합에 모두 드는 픽셀이다. 두 칸의 투영이
 * 맞닿은 모서리 위 픽셀도 둘레가 양쪽 껍질에 나눠 들어 틈으로 센다.
 */
function crackPixels(width: number, height: number, size: number, depth: number, pyramids: boolean, cells: readonly SolidCell[]): number {
  const extrude = effectById("stylize.extrude");
  const data = new Uint8ClampedArray(width * height * 4);
  for (const { column, row, gray } of cells) {
    for (let y = row * size; y < Math.min(height, (row + 1) * size); y += 1) {
      for (let x = column * size; x < Math.min(width, (column + 1) * size); x += 1) data.set([gray, gray, gray, 255], (y * width + x) * 4);
    }
  }
  const out = render(extrude, { width, height, data }, { type: pyramids ? "pyramids" : "blocks", size, depth, depthMode: "level-based", solidFront: true });
  const focal = Math.max(width, height) * 0.9, centerX = width / 2, centerY = height / 2;
  const hulls = cells.map(({ column, row, gray }) => {
    const scale = Math.min(2.5, 1 + Math.round(depth * (luma(gray, gray, gray) / 255)) / focal);
    const x0 = column * size, y0 = row * size, x1 = Math.min(width, x0 + size), y1 = Math.min(height, y0 + size);
    const base: Point[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const lifted: Point[] = pyramids
      ? [[centerX + ((x0 + x1) / 2 - centerX) * scale, centerY + ((y0 + y1) / 2 - centerY) * scale]]
      : base.map(([x, y]): Point => [centerX + (x - centerX) * scale, centerY + (y - centerY) * scale]);
    return convexHull([...base, ...lifted]);
  });
  const ring = Array.from({ length: 8 }, (_, k): Point => [Math.cos((k * Math.PI) / 4 + 0.1) * 1e-3, Math.sin((k * Math.PI) / 4 + 0.1) * 1e-3]);
  let cracks = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (out[(y * width + x) * 4 + 3] !== 0) continue;
      if (ring.every(([dx, dy]) => hulls.some((hull) => strictlyInside(hull, x + 0.5 + dx, y + 0.5 + dy)))) cracks += 1;
    }
  }
  return cracks;
}

describe("돌출 · 공유 투영 모서리 틈", () => {
  const extrude = effectById("stylize.extrude");
  const depths = Array.from({ length: 255 }, (_, index) => index + 1);

  it("높이가 다른 두 칸의 벽이 화면 중심에서 나온 45° 광선을 함께 경계로 쓰는 장면에서 깊이 1~255 모두 틈 픽셀이 없다", () => {
    // 80×64, 칸 8: 흰 칸 P(x 24~32, y 8~16)의 아래 벽과 회색 200 칸 Q(x 16~24, y 16~24)의 오른쪽 벽이 중심 (40, 32) 에서 맞닿은
    // 꼭짓점 (24, 16) 을 지나는 45° 광선을 경계로 나눠 갖는다. 너비·높이가 짝수라 이 광선은 행마다 픽셀 중심을 정확히 지난다.
    // 고치기 전에는 깊이 255칸 중 24칸에서 이 광선 위 픽셀 239개가 두 벽 모두에서 빠져 투명 바탕이 비쳤다.
    const cells: readonly SolidCell[] = [{ column: 3, row: 1, gray: 255 }, { column: 2, row: 2, gray: 200 }];
    const cracks = depths.map((depth) => crackPixels(80, 64, 8, depth, false, cells));
    expect(cracks.reduce((sum, value) => sum + value, 0)).toBe(0);
  });

  it("피라미드 한 칸의 두 면이 함께 쓰는 꼭대기 모서리 위 픽셀이 두 면에서 다 빠지지 않는다(깊이 1~255)", () => {
    // 고치기 전에는 두 면이 이 모서리를 바닥 꼭짓점·꼭대기에서 따로 재서, 72×72 장면은 깊이 27칸에서 36px, 96×72 장면은 21칸에서
    // 57px 이 두 면 모두에서 빠졌다.
    for (const [width, height, size, column, row] of [[72, 72, 8, 1, 1], [96, 72, 6, 4, 9]] as const) {
      const cracks = depths.map((depth) => crackPixels(width, height, size, depth, true, [{ column, row, gray: 255 }]));
      expect(cracks.reduce((sum, value) => sum + value, 0), `${width}×${height} 칸 ${size} (${column}, ${row})`).toBe(0);
    }
  });

  it("공유 모서리 위에 픽셀 중심이 정확히 놓이지 않으면 고치기 전과 바이트까지 같다(전면 꼭짓점·늘린 그림 표본은 예전처럼 Float32)", () => {
    // 256×192 사진의 기본값(블록·크기 30)은 꼭짓점 (150, 30) 을 지나는 광선 위에 픽셀 (151, 25) 의 중심이 정확히 놓여, 반열린 구간
    // 규칙대로 같은 칸의 왼쪽 벽 대신 아래 벽이 칠한다(틈이 아니라 동률 픽셀 하나가 이웃 면으로 바뀐다). 그런 픽셀이 없는 경우만 고정한다.
    const image = photo(256, 192), art = lineArt(256, 192);
    const cases: readonly (readonly [StudioFilterGalleryImage, StudioFilterGalleryParams, string])[] = [
      [image, { type: "pyramids" }, "59616a1a"],
      [image, { depthMode: "level-based", depth: 120 }, "f9c7b4f5"],
      [art, {}, "e1a061ef"],
      [art, { solidFront: true }, "71a805d6"],
    ];
    for (const [source, params, expected] of cases) {
      expect(fingerprint(render(extrude, source, { ...defaultsOf(extrude), ...params })), JSON.stringify(params)).toBe(expected);
    }
  });
});
