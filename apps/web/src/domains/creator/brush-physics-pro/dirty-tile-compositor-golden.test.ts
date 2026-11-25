import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { DirtyTileCompositor256, type TileLayerBlendMode } from "./wet-soak-impasto-wax-resist";
import type { DualBrushDabStampParams } from "./world-paper-heightfield";

const FOUR_TILES = [[0, 0], [1, 0], [0, 1], [1, 1]] as const;
function digest(compositor: DirtyTileCompositor256, tiles: readonly (readonly [number, number])[]): string {
  const hash = createHash("sha256");
  for (const [tx, ty] of tiles) hash.update(compositor.getTileRgba(tx, ty));
  return hash.digest("hex");
}
function pixel(compositor: DirtyTileCompositor256, tx: number, ty: number, x: number, y: number): number[] {
  return [...compositor.getTileRgba(tx, ty).slice((y * 256 + x) * 4, (y * 256 + x) * 4 + 4)];
}
function dab(compositor: DirtyTileCompositor256, layer: string, x: number, y: number,
  patch: Partial<DualBrushDabStampParams> = {}, blend: TileLayerBlendMode = "normal"): void {
  compositor.paintBrushDab(layer, {
    dabX: x, dabY: y, dabRadiusPx: 13, dabIndex: 0, strokeDistancePx: 0,
    pressure: 0.71, paperPreset: "cold-press", dualMode: "fixed-world",
    pigmentRgb: [31, 83, 147], flow: 0.87, seed: 1337, ...patch,
  }, blend);
}

/** 최적화 전 전체 픽셀 순회에서 기록한 RGBA 전체의 고정값이다. */
describe("기존 256 타일 합성의 전체 RGBA 골든", () => {
  it("네 타일 경계에서 레이어 순서·multiply·소수 opacity를 보존한다", () => {
    const compositor = new DirtyTileCompositor256(512, 512, [233, 229, 217]);
    dab(compositor, "base", 255.75, 255.25, { dabRadiusPx: 17, paperPreset: "rough-cotton" });
    dab(compositor, "soft", 251, 259, { dabRadiusPx: 11, pigmentRgb: [206, 79, 118] });
    dab(compositor, "multiply", 260, 249, { dabRadiusPx: 20, pigmentRgb: [47, 112, 184] }, "multiply");
    compositor.ensureLayer("soft", "normal", 0.64);
    compositor.ensureLayer("multiply", "multiply", 0.73);
    expect(compositor.flushDirtyTiles().flushedTileCount).toBe(4);
    expect(pixel(compositor, 0, 0, 0, 0)).toEqual([233, 229, 217, 255]);
    expect(pixel(compositor, 1, 1, 0, 0)[3]).toBe(255);
    expect(digest(compositor, FOUR_TILES)).toBe("ca608f6eeea038a97f650e9b833ae548b2ddca29c59d2feac5f311afc2bea693");
  });

  it("떨어진 기존 dab을 재flush에서 지우지 않고 opacity·blend 변경도 다시 합성한다", () => {
    const compositor = new DirtyTileCompositor256(768, 512);
    const snapshots: string[] = [];
    dab(compositor, "lower", 18, 20, { dabRadiusPx: 7 });
    dab(compositor, "upper", 220, 212, { dabRadiusPx: 12, pigmentRgb: [207, 41, 78] });
    compositor.flushDirtyTiles();
    snapshots.push(digest(compositor, [[0, 0], [2, 1]]));
    const first = new Uint8ClampedArray(compositor.getTileRgba(0, 0));
    dab(compositor, "lower", 128, 114, { dabRadiusPx: 4, pigmentRgb: [15, 28, 9] });
    compositor.flushDirtyTiles();
    for (const [x, y] of [[18, 20], [220, 212]] as const) {
      const offset = (y * 256 + x) * 4;
      expect(compositor.getTileRgba(0, 0).slice(offset, offset + 4)).toEqual(first.slice(offset, offset + 4));
    }
    const accumulated = new Uint8ClampedArray(compositor.getTileRgba(0, 0));
    snapshots.push(digest(compositor, [[0, 0], [2, 1]]));
    compositor.markDirtyRect(0, 0, 256, 256);
    compositor.flushDirtyTiles();
    expect(compositor.getTileRgba(0, 0)).toEqual(accumulated);
    snapshots.push(digest(compositor, [[0, 0], [2, 1]]));
    compositor.ensureLayer("lower", "normal", 0.2);
    compositor.ensureLayer("upper", "normal", 0.85);
    compositor.markDirtyRect(0, 0, 768, 512);
    expect(compositor.flushDirtyTiles().flushedTileCount).toBe(6);
    snapshots.push(digest(compositor, [[0, 0], [2, 1]]));
    compositor.ensureLayer("lower", "multiply", 0.48);
    compositor.markDirtyRect(0, 0, 256, 256);
    compositor.flushDirtyTiles();
    snapshots.push(digest(compositor, [[0, 0], [2, 1]]));
    expect(snapshots).toEqual([
      "002e4cf147e32d6d686167ac2ea23afc1a0299dcbaafd4f2d471a28acce667a7",
      "12db8d0e8c8e71610b9c2292ca7bdcb6f90a3e41e4f3e3c3420e28e530d099ff",
      "12db8d0e8c8e71610b9c2292ca7bdcb6f90a3e41e4f3e3c3420e28e530d099ff",
      "3296fcb265256ba01cd27b3c8992a72565557a9c2ce2059779aff3483cf5646a",
      "b139bc48397efbf3a3168d37723013e22de717f3f8c88f74d21edb3b496c9c2a",
    ]);
  });

  it("alpha 0·opacity 0에서도 종이 배경을 유지하고 재표시에서 원래 잉크를 복원한다", () => {
    const compositor = new DirtyTileCompositor256(512, 512, [230, 240, 250]);
    const snapshots: string[] = [];
    dab(compositor, "transparent", 260, 260, { dabRadiusPx: 40, flow: 0 });
    dab(compositor, "visible", 24, 22, { pigmentRgb: [2, 9, 41], pressure: 1, flow: 1 });
    dab(compositor, "hidden", 24, 22, { pigmentRgb: [201, 12, 3], pressure: 0.9 }, "multiply");
    compositor.ensureLayer("hidden", "multiply", 0);
    compositor.flushDirtyTiles();
    snapshots.push(digest(compositor, FOUR_TILES));
    expect(pixel(compositor, 1, 1, 4, 4)).toEqual([230, 240, 250, 255]);
    compositor.ensureLayer("visible", "normal", 0);
    compositor.markDirtyRect(0, 0, 512, 512);
    compositor.flushDirtyTiles();
    snapshots.push(digest(compositor, FOUR_TILES));
    expect(pixel(compositor, 0, 0, 24, 22)).toEqual([230, 240, 250, 255]);
    compositor.ensureLayer("hidden", "multiply", 0.45);
    compositor.markDirtyRect(0, 0, 512, 512);
    compositor.flushDirtyTiles();
    snapshots.push(digest(compositor, FOUR_TILES));
    expect(snapshots).toEqual([
      "481b2a20cb8700be72348dc6145b6ea4cb08176e8ac4b91df3f527f22acd920a",
      "275aa6c3891a7d67776ea2b08d2c6fe25f7208c9c4928d4a3f6b78a647c4ffa7",
      "683c39c07bfa2d45b762140167bccdfcfcbe401f4748877adc3c9820c624e36d",
    ]);
  });

  it("일부만 쓰는 마지막 타일의 캔버스 밖 픽셀도 종이 배경으로 남긴다", () => {
    const compositor = new DirtyTileCompositor256(300, 270);
    dab(compositor, "edge", 298.5, 268.5, { dabRadiusPx: 19, paperPreset: "kent", pigmentRgb: [63, 139, 27] });
    compositor.flushDirtyTiles();
    expect(pixel(compositor, 1, 1, 100, 100)).toEqual([248, 244, 236, 255]);
    expect(digest(compositor, FOUR_TILES)).toBe("817ad2e6e5d462cff06751067acc5bf30f18b39acf0532b9aa682e2b22b6fcd4");
  });
});
