import { describe, expect, it } from "vitest";

import { PAPER_GRAIN_KINDS, PAPER_GRAIN_RECIPES, createPaperGrain, paperGrainFactor, paperGrainTexelsPerPixel, samplePaperGrain } from "./paper-grain";

function maxAdjacentDifference(bytes: Uint8Array, size: number): number {
  let max = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x + 1 < size; x += 1) max = Math.max(max, Math.abs((bytes[y * size + x] ?? 0) - (bytes[y * size + x + 1] ?? 0)));
  }
  for (let y = 0; y + 1 < size; y += 1) {
    for (let x = 0; x < size; x += 1) max = Math.max(max, Math.abs((bytes[y * size + x] ?? 0) - (bytes[(y + 1) * size + x] ?? 0)));
  }
  return max;
}

describe("shared/paper-grain", () => {
  it("같은 종류·시드·크기는 바이트까지 같고(결정적), 시드·종류가 다르면 다르다", () => {
    for (const kind of PAPER_GRAIN_KINDS) {
      const a = createPaperGrain({ kind, seed: 7, size: 64 });
      const b = createPaperGrain({ kind, seed: 7, size: 64 });
      expect(a.bytes).toEqual(b.bytes);
      expect(createPaperGrain({ kind, seed: 8, size: 64 }).bytes).not.toEqual(a.bytes);
    }
    expect(createPaperGrain({ kind: "print", seed: 7, size: 64 }).bytes).not.toEqual(createPaperGrain({ kind: "watercolor", seed: 7, size: 64 }).bytes);
  });

  it("값은 255(흰 종이) 이하이고 결 깊이 아래로 내려가지 않으며 결이 실제로 있다", () => {
    for (const kind of PAPER_GRAIN_KINDS) {
      const tile = createPaperGrain({ kind, seed: 3 });
      expect(tile.size).toBe(256);
      expect(tile.bytes).toHaveLength(256 * 256);
      const floor = Math.floor(255 * (1 - PAPER_GRAIN_RECIPES[kind].depth)) - 1;
      let min = 255;
      let max = 0;
      for (const byte of tile.bytes) {
        min = Math.min(min, byte);
        max = Math.max(max, byte);
      }
      expect(min).toBeGreaterThanOrEqual(floor);
      expect(max).toBeLessThanOrEqual(255);
      expect(max - min).toBeGreaterThan(5);
    }
  });

  it("타일 가장자리가 이어진다: 감싸는 이웃(마지막 열↔첫 열, 마지막 행↔첫 행) 차이가 타일 안 이웃 차이의 최댓값을 넘지 않는다", () => {
    for (const kind of PAPER_GRAIN_KINDS) {
      const size = 128;
      const { bytes } = createPaperGrain({ kind, seed: 11, size });
      const interior = maxAdjacentDifference(bytes, size);
      let wrap = 0;
      for (let i = 0; i < size; i += 1) {
        wrap = Math.max(wrap, Math.abs((bytes[i * size + size - 1] ?? 0) - (bytes[i * size] ?? 0)));
        wrap = Math.max(wrap, Math.abs((bytes[(size - 1) * size + i] ?? 0) - (bytes[i] ?? 0)));
      }
      expect(wrap).toBeLessThanOrEqual(interior);
    }
  });

  it("크기·시드·종류가 규약 밖이면 한글 사유로 throw한다", () => {
    expect(() => createPaperGrain({ kind: "print", seed: 1, size: 100 })).toThrowError(/2의 거듭제곱/u);
    expect(() => createPaperGrain({ kind: "print", seed: 1, size: 8 })).toThrowError(/2의 거듭제곱/u);
    expect(() => createPaperGrain({ kind: "print", seed: -1 })).toThrowError(/시드/u);
    expect(() => createPaperGrain({ kind: "print", seed: 1.5 })).toThrowError(/시드/u);
    expect(() => createPaperGrain({ kind: "parchment" as never, seed: 1 })).toThrowError(/종류/u);
  });

  it("표본은 타일 반복으로 감싸고 텍셀 사이를 쌍선형 보간한다", () => {
    const tile = createPaperGrain({ kind: "watercolor", seed: 5, size: 16 });
    expect(samplePaperGrain(tile, 0, 0)).toBe(tile.bytes[0]);
    expect(samplePaperGrain(tile, 16, 32)).toBe(tile.bytes[0]);
    expect(samplePaperGrain(tile, -16, 0)).toBe(tile.bytes[0]);
    const mid = samplePaperGrain(tile, 0.5, 0);
    expect(mid).toBeCloseTo(((tile.bytes[0] ?? 0) + (tile.bytes[1] ?? 0)) / 2, 9);
  });

  it("곱 배율은 세기 0이면 1, 세기 1이면 byte/255이고 범위를 자른다", () => {
    expect(paperGrainFactor(128, 0)).toBe(1);
    expect(paperGrainFactor(255, 1)).toBe(1);
    expect(paperGrainFactor(204, 1)).toBeCloseTo(0.8, 9);
    expect(paperGrainFactor(204, 0.5)).toBeCloseTo(0.9, 9);
    expect(paperGrainFactor(-10, 2)).toBe(0);
    expect(paperGrainTexelsPerPixel(2, 1080)).toBeCloseTo(0.5, 12);
    expect(paperGrainTexelsPerPixel(1, 2160)).toBeCloseTo(0.5, 12);
    expect(() => paperGrainTexelsPerPixel(0, 1080)).toThrowError(/양수/u);
  });
});
