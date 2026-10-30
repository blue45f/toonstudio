/**
 * 필터 갤러리 · 텍스처·스타일화 적대적 리뷰 결함 회귀 시험(둘 다 돌출).
 *   - 그리기 순서: 정렬 키가 높이를 먼저 봐서 낮은 블록부터 그렸다. 시점이 화면 중심 위라 시선은 중심에 가까운 칸을 먼저
 *     지나므로 높이와 상관없이 가까운 칸이 먼 칸을 가려야 하는데, 더 멀고 높은 블록의 벽이 더 가깝고 낮은 블록의 꼭대기를
 *     덮었다(아래 48×40 시선 추적 비교에서 블록 픽셀의 36~46%, 피라미드의 2~11% 가 틀렸다).
 *   - 작업량: cost 3 고정이라 작은 크기·큰 깊이를 열 배 넘게 낮게 신고했다. 흰 이미지 2048² 실측으로 크기 2·깊이 255 는
 *     픽셀당 약 2.4µs(cost 단위로 약 48)라, 메인 스레드 경로와 하드 예산이 그만큼 큰 일을 받아들였다.
 */
import { describe, expect, it } from "vitest";

import { luma } from "./studio-filter-gallery-kernel-utils";
import { STUDIO_FILTER_GALLERY_STYLIZE_EFFECTS } from "./studio-filter-gallery-stylize";
import { STUDIO_FILTER_GALLERY_WORK_BUDGET } from "./studio-filter-gallery-types";

import type { StudioFilterGalleryEffectDef, StudioFilterGalleryImage, StudioFilterGalleryParams } from "./studio-filter-gallery-types";

function find(id: string): StudioFilterGalleryEffectDef {
  const effect = STUDIO_FILTER_GALLERY_STYLIZE_EFFECTS.find((candidate) => candidate.id === id);
  if (!effect) throw new Error(`효과 없음: ${id}`);
  return effect;
}

const extrude = find("stylize.extrude");

function image(width: number, height: number, pixel: (x: number, y: number) => readonly number[]): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data.set(pixel(x, y), (y * width + x) * 4);
  }
  return { width, height, data };
}

function run(source: StudioFilterGalleryImage, params: StudioFilterGalleryParams): StudioFilterGalleryImage {
  const out = { width: source.width, height: source.height, data: source.data.slice() };
  extrude.apply(out, params, { seed: 1234, scale: 1 });
  return out;
}

function rgbAt(target: StudioFilterGalleryImage, x: number, y: number): number[] {
  const offset = (y * target.width + x) * 4;
  return [target.data[offset], target.data[offset + 1], target.data[offset + 2]];
}

// ── 시선 추적 기준 ──

/** 48×40 이미지를 8px 칸 6×5 개로 나눈다(나머지 없이 나뉘어 칸마다 반폭이 4px 다). */
const GRID = { width: 48, height: 40, size: 8, columns: 6, rows: 5 } as const;
const CELLS = GRID.columns * GRID.rows;
/** 칸 → 색 부호. 7 과 30 이 서로소라 순열이고, 밝기 기반 높이가 칸 위치와 상관없이 오르내린다. */
const codeOf = (cell: number): number => (cell * 7) % CELLS;
const cellOfCode = new Map(Array.from({ length: CELLS }, (_, cell) => [codeOf(cell), cell] as const));

/** 칸마다 다른 단색. 음영은 세 채널에 같은 배율(0.4~1.26)로 곱해지므로 파랑 180 에 대한 비율로 부호를 되찾는다. */
function cellColor(cell: number): [number, number, number] {
  const code = codeOf(cell);
  return [40 + 25 * (code % GRID.columns), 40 + 25 * Math.floor(code / GRID.columns), 180];
}

/** 출력 픽셀이 어느 칸의 면(꼭대기·벽·피라미드 면)인지. 알 수 없는 색이면 -1. */
function decodeCell(target: StudioFilterGalleryImage, x: number, y: number): number {
  const [red, green, blue] = rgbAt(target, x, y);
  const shade = blue / 180;
  const code = Math.round((green / shade - 40) / 25) * GRID.columns + Math.round((red / shade - 40) / 25);
  return cellOfCode.get(code) ?? -1;
}

/**
 * 화면 픽셀 중심 (px, py) 로 내려가는 시선이 처음 닿는 칸. 시점은 화면 중심 c 위에 있고, 깊이 u(1 = 바닥, 작을수록 시점 쪽)의
 * 시선은 바닥의 c + (p − c)·u 위를 지난다. 커널과 같이 꼭대기 배율 s = min(2.5, 1 + 높이 / (0.9 × 긴 변)) 인 칸은 u ≥ 1/s 인
 * 상자(블록) 또는 1 − u ≤ (1 − 1/s)(1 − 칸 중심에서의 상대 거리 최댓값) 인 사각뿔(피라미드)이다. 면이 평면이라 화면에서는
 * 커널이 그리는 곧은 삼각형·사각형과 같다.
 */
function visibleCell(type: string, depth: number, px: number, py: number): number {
  const centerX = GRID.width / 2, centerY = GRID.height / 2, focal = Math.max(GRID.width, GRID.height) * 0.9;
  const tops = Array.from({ length: CELLS }, (_, cell) => {
    const lift = Math.round((depth * luma(...cellColor(cell))) / 255);
    return 1 / Math.min(2.5, 1 + lift / focal);
  });
  const nearest = Math.min(...tops);
  const steps = 2000;
  for (let step = 0; step <= steps; step += 1) {
    const u = nearest + ((1 - nearest) * step) / steps;
    const qx = centerX + (px - centerX) * u, qy = centerY + (py - centerY) * u;
    const column = Math.floor(qx / GRID.size), row = Math.floor(qy / GRID.size);
    const cell = row * GRID.columns + column;
    const half = GRID.size / 2;
    const offCenter = Math.max(Math.abs(qx - (column + 0.5) * GRID.size), Math.abs(qy - (row + 0.5) * GRID.size)) / half;
    const inside = type === "blocks" ? u >= tops[cell] : 1 - u <= (1 - tops[cell]) * (1 - offCenter);
    if (inside) return cell;
  }
  return Math.floor(py / GRID.size) * GRID.columns + Math.floor(px / GRID.size);
}

describe("필터 갤러리 · 스타일화 리뷰 결함 회귀 — 돌출 그리기 순서", () => {
  it("가깝고 낮은 블록의 꼭대기가 멀고 높은 블록의 중심 쪽 벽에 덮이지 않는다(40×8, 중심 x = 20)", () => {
    // x 24~31 은 낮은 빨강 칸(밝기 기반 높이 9, 배율 1.25 → 꼭대기 x 25~35), x 32~39 는 높은 흰 칸(높이 18, 배율 1.5 → 중심 쪽
    // 벽 x 32~38, 꼭대기 x 38~). 시선은 중심에 가까운 빨강 칸을 먼저 지나므로 x 32~34 에 빨강 꼭대기가 보여야 한다(전엔 흰 벽 204).
    const source = image(40, 8, (x) => (x >= 32 ? [255, 255, 255, 255] : x >= 24 ? [200, 100, 100, 255] : [0, 0, 0, 255]));
    const out = run(source, { type: "blocks", size: 8, depth: 18, depthMode: "level-based", solidFront: true });
    for (let y = 0; y < 8; y += 1) {
      for (let x = 25; x < 35; x += 1) expect(rgbAt(out, x, y), `빨강 꼭대기 (${x}, ${y})`).toEqual([200, 100, 100]);
      for (let x = 35; x < 38; x += 1) expect(rgbAt(out, x, y), `흰 칸 왼쪽 벽 (${x}, ${y})`).toEqual([204, 204, 204]);
      for (let x = 38; x < 40; x += 1) expect(rgbAt(out, x, y), `흰 꼭대기 (${x}, ${y})`).toEqual([255, 255, 255]);
    }
  });

  it.each(["blocks", "pyramids"])("%s: 칸 높이를 뒤섞어도 픽셀마다 시선이 처음 닿는 칸이 보인다", (type) => {
    const source = image(GRID.width, GRID.height, (x, y) => [
      ...cellColor(Math.floor(y / GRID.size) * GRID.columns + Math.floor(x / GRID.size)), 255,
    ]);
    for (const depth of [60, 120]) {
      const out = run(source, { type, size: GRID.size, depth, depthMode: "level-based", solidFront: true });
      let wrong = 0;
      for (let y = 0; y < GRID.height; y += 1) {
        for (let x = 0; x < GRID.width; x += 1) {
          const shown = decodeCell(out, x, y);
          expect(shown, `해독할 수 없는 색 (${x}, ${y})`).toBeGreaterThanOrEqual(0);
          if (shown !== visibleCell(type, depth, x + 0.5, y + 0.5)) wrong += 1;
        }
      }
      // 면 경계에 픽셀 중심이 정확히 놓이는 동률만 허용한다(고친 뒤 0, 전엔 블록 36~46%, 피라미드 2~11%).
      expect(wrong / (GRID.width * GRID.height), `깊이 ${depth}`).toBeLessThan(0.01);
    }
  });
});

describe("필터 갤러리 · 스타일화 리뷰 결함 회귀 — 돌출 작업량", () => {
  const costFor = (params: StudioFilterGalleryParams): number => extrude.costFor?.(params) ?? extrude.cost;
  const worst = { type: "blocks", size: 2, depth: 255, depthMode: "level-based" } as const;

  it("매개변수에 따른 작업량을 costFor 로 내고, 기본값(크기 30·깊이 30)에서는 cost 와 같다", () => {
    expect(extrude.costFor).toBeTypeOf("function");
    expect(costFor({})).toBe(extrude.cost);
    expect(costFor(Object.fromEntries(extrude.params.map((spec) => [spec.key, spec.default])))).toBe(extrude.cost);
    // 잘못된 형식은 커널처럼 기본값으로 읽는다.
    expect(costFor({ size: Number.NaN, depth: "깊이", depthMode: 7, type: true })).toBe(extrude.cost);
  });

  it("칸이 작을수록·깊이가 클수록 무겁고, 밝기 기반은 무작위 이상, 블록은 피라미드 이상이다", () => {
    for (const depth of [64, 255]) {
      const bySize = [2, 3, 4, 8].map((size) => costFor({ ...worst, size, depth }));
      for (let index = 1; index < bySize.length; index += 1) expect(bySize[index], `깊이 ${depth}`).toBeLessThan(bySize[index - 1]);
    }
    // 깊이 1 은 칸마다 드는 고정 비용만 남아 크기 4 부터 하한(cost)에 닿는다.
    const shallow = [2, 3, 4, 8].map((size) => costFor({ ...worst, size, depth: 1 }));
    for (let index = 1; index < shallow.length; index += 1) expect(shallow[index]).toBeLessThanOrEqual(shallow[index - 1]);
    expect(shallow[0]).toBeGreaterThan(shallow[3]);
    const byDepth = [1, 64, 128, 255].map((depth) => costFor({ ...worst, depth }));
    for (let index = 1; index < byDepth.length; index += 1) expect(byDepth[index]).toBeGreaterThan(byDepth[index - 1]);
    expect(costFor(worst)).toBeGreaterThan(costFor({ ...worst, depthMode: "random" }));
    expect(costFor(worst)).toBeGreaterThan(costFor({ ...worst, type: "pyramids" }));
    for (const params of [worst, { ...worst, depthMode: "random" }, { ...worst, type: "pyramids", size: 30 }]) {
      expect(costFor(params)).toBeGreaterThanOrEqual(extrude.cost);
    }
  });

  it("최악 매개변수는 실측 작업량(2048² 흰 이미지, 픽셀당 2387ns)을 덮어 2048² 이미지를 하드 예산 밖으로 낸다(전엔 cost 3)", () => {
    // cost 1 단위 ≈ 픽셀당 50ns. 크기 3·4 와 깊이 64 의 같은 실측값도 덮는다.
    expect(costFor(worst) * 50).toBeGreaterThanOrEqual(2387);
    expect(costFor({ ...worst, size: 3 }) * 50).toBeGreaterThanOrEqual(1216);
    expect(costFor({ ...worst, size: 4 }) * 50).toBeGreaterThanOrEqual(755);
    expect(costFor({ ...worst, depth: 64 }) * 50).toBeGreaterThanOrEqual(943);
    expect(costFor(worst) * 2048 * 2048).toBeGreaterThan(STUDIO_FILTER_GALLERY_WORK_BUDGET);
  });
});
