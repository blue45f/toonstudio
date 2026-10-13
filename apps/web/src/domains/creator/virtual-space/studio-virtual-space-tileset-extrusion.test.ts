import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import {
  drawStudioExtrudedTileset,
  extrudeStudioTilesetTexture,
  studioExtrudedTilesetLayout,
  type StudioExtrusionContext,
  type StudioTilesetTexturePort,
} from "./studio-virtual-space-tileset-extrusion";

// 레이아웃이 Phaser가 실제로 칸을 찾는 계산과 맞는지 설치된 Phaser의 Tileset으로 확인한다.
interface PhaserTilesetLike {
  updateTileData(width: number, height: number): unknown;
  getTileTextureCoordinates(index: number): { x: number; y: number } | null;
  readonly columns: number;
  readonly rows: number;
}
const PhaserTileset = createRequire(import.meta.url)("phaser/src/tilemaps/Tileset.js") as
  new (name: string, firstGid: number, tileWidth: number, tileHeight: number, margin: number, spacing: number) => PhaserTilesetLike;

/** 픽셀 값을 정수로 들고 있는 가짜 캔버스. drawImage는 보간 없는 복제로 흉내 낸다. */
class PixelCanvas {
  readonly pixels: number[];
  readonly context: StudioExtrusionContext;
  constructor(readonly width: number, readonly height: number, fill = 0) {
    this.pixels = Array.from({ length: width * height }, () => fill);
    this.context = {
      imageSmoothingEnabled: true,
      drawImage: (image, sx, sy, sw, sh, dx, dy, dw, dh) => {
        const source = image as PixelCanvas;
        const snapshot = [...source.pixels];
        for (let y = 0; y < dh; y += 1) {
          for (let x = 0; x < dw; x += 1) {
            const px = sx + Math.floor(x * sw / dw);
            const py = sy + Math.floor(y * sh / dh);
            const ox = dx + x;
            const oy = dy + y;
            if (ox < 0 || oy < 0 || ox >= this.width || oy >= this.height) continue;
            if (px < 0 || py < 0 || px >= source.width || py >= source.height) continue;
            this.pixels[oy * this.width + ox] = snapshot[py * source.width + px] ?? 0;
          }
        }
      },
    };
  }
  at(x: number, y: number): number { return this.pixels[y * this.width + x] ?? Number.NaN; }
  getContext(): StudioExtrusionContext { return this.context; }
}

/** 칸 사이 간격·여백이 있는 원본을 만든다. 모든 픽셀 값이 서로 달라 어디서 복제됐는지 추적할 수 있다. */
function sourceSheet(tileWidth: number, tileHeight: number, columns: number, rows: number, margin = 0, spacing = 0): PixelCanvas {
  const width = margin * 2 + columns * tileWidth + (columns - 1) * spacing;
  const height = margin * 2 + rows * tileHeight + (rows - 1) * spacing;
  const sheet = new PixelCanvas(width, height, -1);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) sheet.pixels[y * width + x] = 1 + y * width + x;
  return sheet;
}

const geometry = (overrides: Partial<{ tileWidth: number; tileHeight: number; columns: number; tileCount: number; margin: number; spacing: number }> = {}) =>
  ({ tileWidth: 4, tileHeight: 3, columns: 2, tileCount: 4, margin: 0, spacing: 0, ...overrides });

describe("studioExtrudedTilesetLayout", () => {
  it("칸마다 1px씩 바깥을 두고 칸 사이는 2px 간격으로 잡는다", () => {
    expect(studioExtrudedTilesetLayout(geometry({ tileWidth: 128, tileHeight: 128, columns: 4, tileCount: 16 })))
      .toEqual({ margin: 1, spacing: 2, width: 520, height: 520 });
    expect(studioExtrudedTilesetLayout(geometry())).toEqual({ margin: 1, spacing: 2, width: 12, height: 10 });
  });

  it("마지막 줄이 덜 찬 타일셋도 필요한 줄 수만큼만 만든다", () => {
    expect(studioExtrudedTilesetLayout(geometry({ columns: 4, tileCount: 10 }))).toEqual({ margin: 1, spacing: 2, width: 2 + 16 + 6, height: 2 + 9 + 4 });
  });

  it("Phaser가 칸을 찾는 계산과 같은 위치로 떨어진다", () => {
    const tileset = geometry({ tileWidth: 128, tileHeight: 128, columns: 4, tileCount: 16 });
    const layout = studioExtrudedTilesetLayout(tileset);
    if (!layout) throw new Error("레이아웃이 있어야 한다");
    const phaser = new PhaserTileset("floor", 1, 128, 128, layout.margin, layout.spacing);
    phaser.updateTileData(layout.width, layout.height);
    expect([phaser.columns, phaser.rows]).toEqual([4, 4]);
    for (let index = 0; index < 16; index += 1) {
      expect(phaser.getTileTextureCoordinates(1 + index)).toEqual({
        x: layout.margin + (index % 4) * (128 + layout.spacing),
        y: layout.margin + Math.floor(index / 4) * (128 + layout.spacing),
      });
    }
  });

  it("소수 타일 크기·잘못된 값·너무 큰 타일셋은 건드리지 않는다", () => {
    expect(studioExtrudedTilesetLayout(geometry({ tileWidth: 313.5, tileHeight: 313.5 }))).toBeNull();
    expect(studioExtrudedTilesetLayout(geometry({ columns: 0 }))).toBeNull();
    expect(studioExtrudedTilesetLayout(geometry({ tileCount: 0 }))).toBeNull();
    expect(studioExtrudedTilesetLayout(geometry({ tileWidth: 0 }))).toBeNull();
    expect(studioExtrudedTilesetLayout(geometry({ tileWidth: 512, tileHeight: 512, columns: 8, tileCount: 64 }))).toBeNull();
    expect(studioExtrudedTilesetLayout(geometry(), 0)).toBeNull();
  });
});

describe("drawStudioExtrudedTileset", () => {
  function extruded(tileset: ReturnType<typeof geometry>) {
    const rows = Math.ceil(tileset.tileCount / tileset.columns);
    const source = sourceSheet(tileset.tileWidth, tileset.tileHeight, tileset.columns, rows, tileset.margin, tileset.spacing);
    const layout = studioExtrudedTilesetLayout(tileset);
    if (!layout) throw new Error("레이아웃이 있어야 한다");
    const canvas = new PixelCanvas(layout.width, layout.height, -1);
    drawStudioExtrudedTileset(canvas.context, canvas, source, tileset, layout);
    return { source, canvas, layout };
  }

  it("칸 안쪽은 원본 칸과 같다", () => {
    const tileset = geometry();
    const { source, canvas, layout } = extruded(tileset);
    for (let index = 0; index < tileset.tileCount; index += 1) {
      const column = index % tileset.columns, row = Math.floor(index / tileset.columns);
      for (let y = 0; y < tileset.tileHeight; y += 1) for (let x = 0; x < tileset.tileWidth; x += 1) {
        expect(canvas.at(layout.margin + column * (tileset.tileWidth + layout.spacing) + x, layout.margin + row * (tileset.tileHeight + layout.spacing) + y))
          .toBe(source.at(column * tileset.tileWidth + x, row * tileset.tileHeight + y));
      }
    }
  });

  it("칸 바깥 한 줄은 그 칸의 가장자리 줄을 복제하고 이웃 칸의 색은 섞이지 않는다", () => {
    const tileset = geometry();
    const { source, canvas, layout } = extruded(tileset);
    for (let index = 0; index < tileset.tileCount; index += 1) {
      const column = index % tileset.columns, row = Math.floor(index / tileset.columns);
      const sx = column * tileset.tileWidth, sy = row * tileset.tileHeight;
      const dx = layout.margin + column * (tileset.tileWidth + layout.spacing), dy = layout.margin + row * (tileset.tileHeight + layout.spacing);
      const lastX = tileset.tileWidth - 1, lastY = tileset.tileHeight - 1;
      for (let y = 0; y < tileset.tileHeight; y += 1) {
        expect(canvas.at(dx - 1, dy + y)).toBe(source.at(sx, sy + y));
        expect(canvas.at(dx + tileset.tileWidth, dy + y)).toBe(source.at(sx + lastX, sy + y));
      }
      for (let x = -1; x <= tileset.tileWidth; x += 1) {
        const clamped = Math.min(lastX, Math.max(0, x));
        expect(canvas.at(dx + x, dy - 1)).toBe(source.at(sx + clamped, sy));
        expect(canvas.at(dx + x, dy + tileset.tileHeight)).toBe(source.at(sx + clamped, sy + lastY));
      }
    }
  });

  it("원본에 여백과 간격이 있어도 칸을 제 위치에서 읽는다", () => {
    const tileset = geometry({ margin: 1, spacing: 1, tileCount: 3 });
    const { source, canvas, layout } = extruded(tileset);
    const origin = (column: number, row: number) => ({
      sx: tileset.margin + column * (tileset.tileWidth + tileset.spacing),
      sy: tileset.margin + row * (tileset.tileHeight + tileset.spacing),
      dx: layout.margin + column * (tileset.tileWidth + layout.spacing),
      dy: layout.margin + row * (tileset.tileHeight + layout.spacing),
    });
    for (const [column, row] of [[0, 0], [1, 0], [0, 1]] as const) {
      const { sx, sy, dx, dy } = origin(column, row);
      expect(canvas.at(dx, dy)).toBe(source.at(sx, sy));
      expect(canvas.at(dx + 3, dy + 2)).toBe(source.at(sx + 3, sy + 2));
      expect(canvas.at(dx - 1, dy - 1)).toBe(source.at(sx, sy));
      expect(canvas.at(dx + 4, dy + 3)).toBe(source.at(sx + 3, sy + 2));
    }
  });

  it("보간을 꺼서 픽셀을 그대로 복제한다", () => {
    const { canvas } = extruded(geometry());
    expect(canvas.context.imageSmoothingEnabled).toBe(false);
  });
});

describe("extrudeStudioTilesetTexture", () => {
  const tileset = geometry();
  function fakeTextures(options: { addCanvas?: boolean; addResult?: unknown } = {}) {
    const store = new Map<string, unknown>([["tiles", sourceSheet(4, 3, 2, 2)]]);
    const addCanvas = vi.fn((key: string, canvas: HTMLCanvasElement) => {
      if (options.addResult === null) return null;
      store.set(key, canvas); return {};
    });
    const textures: StudioTilesetTexturePort = {
      exists: (key) => store.has(key),
      get: (key) => ({ getSourceImage: () => store.get(key) }),
      remove: vi.fn((key: string) => { store.delete(key); }),
      ...(options.addCanvas === false ? {} : { addCanvas }),
    };
    return { store, textures, addCanvas };
  }
  const canvasFactory = (width: number, height: number) => new PixelCanvas(width, height, -1) as unknown as HTMLCanvasElement;

  it("확장한 캔버스를 새 키로 등록하고 원본 텍스처를 지운다", () => {
    const { store, textures, addCanvas } = fakeTextures();
    const result = extrudeStudioTilesetTexture(textures, "tiles", tileset, canvasFactory);
    expect(result).toEqual({ key: "tiles:extruded", margin: 1, spacing: 2, width: 12, height: 10 });
    expect(addCanvas).toHaveBeenCalledTimes(1);
    expect(store.has("tiles")).toBe(false);
    expect(store.has("tiles:extruded")).toBe(true);
  });

  it("같은 키의 이전 확장 텍스처가 남아 있으면 먼저 치운다", () => {
    const { store, textures } = fakeTextures();
    store.set("tiles:extruded", { stale: true });
    expect(extrudeStudioTilesetTexture(textures, "tiles", tileset, canvasFactory)?.key).toBe("tiles:extruded");
    expect(store.get("tiles:extruded")).not.toEqual({ stale: true });
  });

  it("addCanvas·캔버스 팩토리가 없거나 원본이 없으면 아무것도 하지 않는다", () => {
    const without = fakeTextures({ addCanvas: false });
    expect(extrudeStudioTilesetTexture(without.textures, "tiles", tileset, canvasFactory)).toBeNull();
    expect(without.store.has("tiles")).toBe(true);
    const base = fakeTextures();
    expect(extrudeStudioTilesetTexture(base.textures, "tiles", tileset, undefined)).toBeNull();
    expect(extrudeStudioTilesetTexture(base.textures, "missing", tileset, canvasFactory)).toBeNull();
    expect(base.addCanvas).not.toHaveBeenCalled();
    expect(base.store.has("tiles")).toBe(true);
  });

  it("다룰 수 없는 타일셋은 원본을 그대로 둔다", () => {
    const { store, textures, addCanvas } = fakeTextures();
    expect(extrudeStudioTilesetTexture(textures, "tiles", geometry({ tileWidth: 313.5 }), canvasFactory)).toBeNull();
    expect(addCanvas).not.toHaveBeenCalled();
    expect(store.has("tiles")).toBe(true);
  });

  it("2D 컨텍스트를 못 얻거나 등록에 실패하거나 그리다 예외가 나면 원본을 지우지 않는다", () => {
    const noContext = fakeTextures();
    const brokenCanvas = (() => ({ getContext: () => null })) as unknown as (width: number, height: number) => HTMLCanvasElement;
    expect(extrudeStudioTilesetTexture(noContext.textures, "tiles", tileset, brokenCanvas)).toBeNull();
    expect(noContext.store.has("tiles")).toBe(true);

    const rejected = fakeTextures({ addResult: null });
    expect(extrudeStudioTilesetTexture(rejected.textures, "tiles", tileset, canvasFactory)).toBeNull();
    expect(rejected.store.has("tiles")).toBe(true);

    const throwing = fakeTextures();
    const throwingCanvas = ((width: number, height: number) => {
      const canvas = new PixelCanvas(width, height, -1);
      canvas.context.drawImage = () => { throw new Error("drawImage 실패"); };
      return canvas;
    }) as unknown as (width: number, height: number) => HTMLCanvasElement;
    expect(extrudeStudioTilesetTexture(throwing.textures, "tiles", tileset, throwingCanvas)).toBeNull();
    expect(throwing.store.has("tiles")).toBe(true);
  });
});
