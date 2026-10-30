/**
 * 필터 갤러리 · 렌더 계열 적대적 리뷰 결함 회귀 시험.
 *
 * 미로: 방이 한 열(columns === 1)이면 cell ± columns 가 cell ± 1 과 같아 connect() 가 세로 통로를 오른쪽 비트로 적었다.
 * isMazePath 는 세로 통로에서 아래 비트만 읽으므로 세로 통로가 모두 벽으로 남아, 완전 미로 대신 서로 끊긴 방이 쌓였다.
 */
import { describe, expect, it } from "vitest";

import { STUDIO_FILTER_GALLERY_RENDER_EFFECTS as EFFECTS } from "./studio-filter-gallery-render";

import type { StudioFilterGalleryEffectDef, StudioFilterGalleryImage, StudioFilterGalleryParams } from "./studio-filter-gallery-types";

function effectById(id: string): StudioFilterGalleryEffectDef {
  const found = EFFECTS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`효과 없음: ${id}`);
  return found;
}

/** 기존 렌더 시험과 같은 결이 있는 시험 이미지(왼쪽 위 3×3 은 완전 투명, 나머지 알파는 들쭉날쭉하다). */
function textured(width: number, height: number): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = (x * 37 + y * 11 + ((x * y) % 7) * 19) % 256;
      data[offset + 1] = (x * 13 + y * 41 + ((x + 2 * y) % 5) * 29) % 256;
      data[offset + 2] = (x * 7 + y * 23 + ((3 * x + y) % 9) * 17) % 256;
      data[offset + 3] = x < 3 && y < 3 ? 0 : 60 + ((x * 29 + y * 17) % 196);
    }
  }
  return { width, height, data };
}

/** 불투명 회색 바탕. 바꾸기 합성이면 미로가 모든 픽셀을 벽(검정)이나 길(흰색)로 칠한다. */
function opaqueGray(width: number, height: number): StudioFilterGalleryImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set([128, 128, 128, 255], offset);
  return { width, height, data };
}

function run(effect: StudioFilterGalleryEffectDef, image: StudioFilterGalleryImage, params: StudioFilterGalleryParams, seed: number): Uint8ClampedArray {
  const copy = { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
  effect.apply(copy, params, { seed, scale: 1 });
  return copy.data;
}

/** 흰 길 픽셀 수와, 그 픽셀들이 이루는 4-이웃 연결 성분 수. */
function pathComponents(data: Uint8ClampedArray, width: number, height: number): { pixels: number; components: number } {
  const count = width * height, seen = new Uint8Array(count), stack: number[] = [];
  const isPath = (index: number): boolean => data[index * 4] === 255 && data[index * 4 + 1] === 255 && data[index * 4 + 2] === 255;
  let pixels = 0, components = 0;
  for (let start = 0; start < count; start += 1) {
    if (!isPath(start)) continue;
    pixels += 1;
    if (seen[start] === 1) continue;
    components += 1;
    seen[start] = 1;
    stack.push(start);
    while (stack.length > 0) {
      const at = stack.pop() ?? 0, x = at % width;
      for (const next of [x > 0 ? at - 1 : -1, x < width - 1 ? at + 1 : -1, at - width, at + width]) {
        if (next < 0 || next >= count || seen[next] === 1 || !isPath(next)) continue;
        seen[next] = 1;
        stack.push(next);
      }
    }
  }
  return { pixels, components };
}

/** 출력 바이트 전체의 FNV-1a 32비트 지문. */
function fingerprint(data: Uint8ClampedArray): number {
  let hash = 0x811c9dc5;
  for (const value of data) hash = Math.imul(hash ^ value, 0x01000193) >>> 0;
  return hash;
}

const maze = effectById("render.maze");
const ALGORITHMS = ["depth-first", "prim"] as const;

/**
 * 완전 미로(방 rooms 개를 통로 rooms − 1 개가 사이클 없이 모두 잇는 신장 트리)인지 두 생성 방식·두 시드로 본다. 미로 격자가
 * 이미지 안에 다 들어가는 크기라 길 블록은 방 rooms 개 + 통로 rooms − 1 개이고, 그 픽셀이 한 덩어리여야 한다
 * (연결되어 있고 변 수가 꼭짓점 수 − 1 이면 사이클도 없다).
 */
function expectPerfectMaze(width: number, height: number, cellSize: number, rooms: number): void {
  for (const algorithm of ALGORITHMS) {
    for (const seed of [1, 7]) {
      const params = { cellSize, algorithm, wallColor: "#000000", pathColor: "#ffffff", blend: "replace" };
      const { pixels, components } = pathComponents(run(maze, opaqueGray(width, height), params, seed), width, height);
      const name = `${width}×${height} 칸 ${cellSize}px ${algorithm} 시드 ${seed}`;
      expect(components, name).toBe(1);
      expect(pixels, name).toBe((2 * rooms - 1) * cellSize * cellSize);
    }
  }
}

describe("필터 갤러리 · 렌더 계열 리뷰 회귀 · 미로", () => {
  it("방이 한 열인 세로로 긴 미로도 모든 방이 길 하나로 이어진 완전 미로다", () => {
    // [가로, 세로, 칸 크기, 방 수]: 가로에 블록이 3~4개만 들어가 방이 1열이고, 세로로는 여러 줄이다(기본·최대·작은 칸 크기).
    for (const [width, height, cellSize, rooms] of [[40, 200, 12, 7], [300, 600, 64, 4], [12, 100, 4, 12]] as const) {
      expectPerfectMaze(width, height, cellSize, rooms);
    }
  });

  it("한 줄짜리·여러 열 미로도 가로 통로가 그대로 이어진 완전 미로다", () => {
    for (const [width, height, cellSize, rooms] of [[200, 40, 12, 7], [64, 48, 4, 35], [100, 64, 12, 6]] as const) {
      expectPerfectMaze(width, height, cellSize, rooms);
    }
  });

  it("여러 열 미로는 수정 전과 같은 바이트라 저장된 필터 스택이 같은 미로를 다시 낸다", () => {
    // 수정 전 커널로 구한 지문이다. 통로 비트를 판정하는 순서만 바뀌었으므로 열이 둘 이상이면 미로가 달라지면 안 된다.
    const expected: readonly (readonly [number, number, number, (typeof ALGORITHMS)[number], number])[] = [
      [64, 48, 4, "depth-first", 0xad3d6c5d], [64, 48, 4, "prim", 0x22d22852],
      [100, 64, 12, "depth-first", 0x264bf8a8], [100, 64, 12, "prim", 0x03862483],
    ];
    for (const [width, height, cellSize, algorithm, hash] of expected) {
      const params = { cellSize, algorithm, wallColor: "#203040", pathColor: "#f0d8a0", blend: "overlay" };
      expect(fingerprint(run(maze, textured(width, height), params, 7)), `${width}×${height} ${algorithm}`).toBe(hash);
    }
  });
});
