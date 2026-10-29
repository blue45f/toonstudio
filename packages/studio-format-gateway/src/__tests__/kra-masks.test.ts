import { describe, expect, it, vi } from "vitest";

import {
  buildKraFixture,
  buildKraFixtureDetailed,
  buildKraMaskTileFile,
  buildKraTileFile,
  kraNativeRgba,
  kraTilePayload,
  solidTile,
  tilePixels,
  type KraFixtureMask,
  type KraMaskTile,
} from "../../../../tests/corpus/formats/kra-fixtures";
import { buildFormatZipFixture } from "../../../../tests/corpus/formats/krita-bundle-fixtures";
import {
  applyKraTransparencyMasks,
  importKra,
  KRA_LIMITS,
  KRA_MASK_APPLY_MAX_PIXEL_OPS,
  KraError,
  type KraImportOptions,
  type KraMaskApplyOptions,
  type KraMaskedPixels,
} from "../kra-document";
import { hasKraMaskValues } from "../kra-masks";
import { assembleKraMask, KraTileError, parseKraTileFile, type KraTileFailureCode } from "../kra-tiles";

import type { KraExtent, KraLimits, KraMask } from "../kra-types";

const codes = (issues: readonly { readonly code: string }[]) => issues.map((issue) => issue.code);

/** 적용 결과가 `applied`임을 확인하고 그 값을 돌려준다. */
function applied(layer: Parameters<typeof applyKraTransparencyMasks>[0], options?: KraMaskApplyOptions): KraMaskedPixels {
  const result = applyKraTransparencyMasks(layer, options);
  if (result.status !== "applied") throw new Error(`마스크를 적용하지 못했다: ${result.status}`);
  return result;
}

function failureOf(action: () => unknown): KraTileFailureCode {
  try {
    action();
  } catch (error) {
    if (error instanceof KraTileError) return error.code;
    throw error;
  }
  throw new Error("예외가 발생하지 않았다");
}

// ---------------------------------------------------------------------------
// 독립 기준 구현(리더와 코드를 공유하지 않는다)
// ---------------------------------------------------------------------------

/** 알파 곱: `round(a * m / 255)`를 정수 올림식으로. 리더는 시프트식을 쓴다. */
const referenceMultiply = (a: number, m: number): number => Math.floor((2 * a * m + 255) / 510);

function maskValueAt(mask: KraMask, x: number, y: number): number {
  const region = mask.extent;
  if (mask.values !== null && region !== null && x >= region.x && x < region.x + region.width && y >= region.y && y < region.y + region.height) {
    return mask.values[(y - region.y) * region.width + (x - region.x)]!;
  }
  return mask.defaultValue!;
}

/** 픽셀마다 이미지 좌표로 값을 찾는 느린 기준: 보이는 투명도 마스크를 목록 끝에서부터 곱한다. */
function referenceApply(extent: KraExtent, pixels: Uint8Array, masks: readonly KraMask[]): Uint8Array {
  const out = Uint8Array.from(pixels);
  for (const mask of [...masks].reverse()) {
    if (mask.nodeType !== "transparencymask" || !mask.visible) continue;
    for (let row = 0; row < extent.height; row += 1) {
      for (let column = 0; column < extent.width; column += 1) {
        const at = (row * extent.width + column) * 4;
        const alpha = out[at + 3]!;
        const scaled = referenceMultiply(alpha, maskValueAt(mask, extent.x + column, extent.y + row));
        if (scaled === alpha) continue;
        if (scaled === 0) out.fill(0, at, at + 3);
        out[at + 3] = scaled;
      }
    }
  }
  return out;
}

function makeMask(overrides: Partial<KraMask> = {}): KraMask {
  return {
    nodeType: "transparencymask",
    name: "m",
    uuid: null,
    visible: true,
    locked: false,
    filename: "mask2",
    offsetX: 0,
    offsetY: 0,
    attributes: {},
    extent: null,
    defaultValue: 255,
    tileCount: 0,
    values: null,
    ...overrides,
  };
}

/** 값 함수로 만든 마스크: `region` 안은 `values(x, y)`(이미지 좌표), 밖은 `defaultValue`. */
function maskOver(region: KraExtent, values: (x: number, y: number) => number, defaultValue: number, overrides: Partial<KraMask> = {}): KraMask {
  const buffer = new Uint8Array(region.width * region.height);
  for (let row = 0; row < region.height; row += 1) {
    for (let column = 0; column < region.width; column += 1) buffer[row * region.width + column] = values(region.x + column, region.y + row);
  }
  return makeMask({ extent: region, values: buffer, defaultValue, tileCount: 1, ...overrides });
}

/** 픽셀마다 색과 알파가 다른 레이어. */
function patternPixels(extent: KraExtent, alpha: (x: number, y: number) => number): Uint8Array {
  const out = new Uint8Array(extent.width * extent.height * 4);
  for (let row = 0; row < extent.height; row += 1) {
    for (let column = 0; column < extent.width; column += 1) {
      const at = (row * extent.width + column) * 4;
      out[at] = (column * 7 + row * 3 + 11) & 0xff;
      out[at + 1] = (column * 5 + row * 9 + 22) & 0xff;
      out[at + 2] = (column * 13 + row * 2 + 33) & 0xff;
      out[at + 3] = alpha(extent.x + column, extent.y + row) & 0xff;
    }
  }
  return out;
}

const pixelAt = (pixels: Uint8Array, extent: KraExtent, x: number, y: number): number[] => {
  const at = ((y - extent.y) * extent.width + (x - extent.x)) * 4;
  return Array.from(pixels.subarray(at, at + 4));
};

// mulberry32: 결정적 난수
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

// ---------------------------------------------------------------------------

describe("hasKraMaskValues", () => {
  it.each(["transparencymask", "selectionmask", "filtermask"])("%s는 값 파일을 갖는다", (nodeType) => {
    expect(hasKraMaskValues(nodeType)).toBe(true);
  });

  it.each(["transformmask", "colorizemask", "", "TransparencyMask", "transparencymask ", "paintlayer", "constructor"])(
    "%j는 값 파일을 갖지 않는다",
    (nodeType) => {
      expect(hasKraMaskValues(nodeType)).toBe(false);
    },
  );
});

describe("assembleKraMask", () => {
  function assemble(
    tiles: readonly KraMaskTile[],
    options: {
      defaultValue?: number;
      offsetX?: number;
      offsetY?: number;
      limits?: KraLimits;
      mode?: "auto" | "lzf" | "raw";
      reserve?: (bytes: number) => void;
      checkpoint?: () => void;
    } = {},
  ) {
    const file = parseKraTileFile(buildKraMaskTileFile(tiles, options.mode), KRA_LIMITS);
    return assembleKraMask({
      file,
      defaultValue: options.defaultValue ?? 0,
      offsetX: options.offsetX ?? 0,
      offsetY: options.offsetY ?? 0,
      limits: options.limits ?? KRA_LIMITS,
      reserve: options.reserve,
      checkpoint: options.checkpoint,
    });
  }

  const ramp = (x: number, y: number) => (x * 3 + y * 5) & 0xff;
  const valueAt = (result: ReturnType<typeof assemble>, x: number, y: number) =>
    result.values![(y - result.extent!.y) * result.extent!.width + (x - result.extent!.x)];

  it("타일 크기가 정사각이 아니어도 가로·세로를 헷갈리지 않는다", () => {
    // 4x2 타일 두 개: (0, 0)과 (8, 4). 오프셋 (3, -2), 기본값 9
    const first = Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8);
    const second = Uint8Array.of(11, 12, 13, 14, 15, 16, 17, 18);
    const file = parseKraTileFile(
      buildKraTileFile({
        pixelBytes: 1,
        tileWidth: 4,
        tileHeight: 2,
        tiles: [
          { x: 0, y: 0, payload: kraTilePayload(first, 1, "raw") },
          { x: 8, y: 4, payload: kraTilePayload(second, 1, "raw") },
        ],
      }),
      KRA_LIMITS,
    );
    const calls: number[] = [];
    const result = assembleKraMask({ file, defaultValue: 9, offsetX: 3, offsetY: -2, limits: KRA_LIMITS, reserve: (bytes) => calls.push(bytes) });
    expect(result.extent).toEqual({ x: 3, y: -2, width: 12, height: 6 });
    expect(calls).toEqual([12 * 6]);
    expect(Array.from(result.values!)).toEqual([
      1, 2, 3, 4, 9, 9, 9, 9, 9, 9, 9, 9,
      5, 6, 7, 8, 9, 9, 9, 9, 9, 9, 9, 9,
      9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9,
      9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9,
      9, 9, 9, 9, 9, 9, 9, 9, 11, 12, 13, 14,
      9, 9, 9, 9, 9, 9, 9, 9, 15, 16, 17, 18,
    ]);
  });

  it("타일이 없으면 값 버퍼도 범위도 없고 아무것도 청구하지 않는다", () => {
    const calls: number[] = [];
    expect(assemble([], { defaultValue: 255, reserve: (bytes) => calls.push(bytes) })).toEqual({ extent: null, values: null });
    expect(calls).toEqual([]);
  });

  it("타일 하나는 그 값을 그대로 담는다", () => {
    const result = assemble([{ x: 0, y: 0, values: ramp }]);
    expect(result.extent).toEqual({ x: 0, y: 0, width: 64, height: 64 });
    expect(result.values).toHaveLength(64 * 64);
    for (let y = 0; y < 64; y += 1) for (let x = 0; x < 64; x += 1) expect(valueAt(result, x, y)).toBe(ramp(x, y));
  });

  it("마스크 오프셋을 타일 좌표에 더해 이미지 좌표로 옮긴다", () => {
    const result = assemble([{ x: 64, y: 128, values: ramp }], { offsetX: 10, offsetY: -5 });
    expect(result.extent).toEqual({ x: 74, y: 123, width: 64, height: 64 });
    expect(valueAt(result, 74, 123)).toBe(ramp(0, 0));
    expect(valueAt(result, 74 + 63, 123 + 63)).toBe(ramp(63, 63));
    expect(valueAt(result, 80, 130)).toBe(ramp(6, 7));
  });

  it("떨어진 타일 사이는 기본값으로 채우고 타일 안의 값은 덮지 않는다", () => {
    const result = assemble(
      [
        { x: 0, y: 0, values: () => 9 },
        { x: 128, y: 64, values: ramp },
      ],
      { defaultValue: 77 },
    );
    expect(result.extent).toEqual({ x: 0, y: 0, width: 192, height: 128 });
    expect(valueAt(result, 0, 0)).toBe(9);
    expect(valueAt(result, 63, 63)).toBe(9);
    expect(valueAt(result, 64, 0)).toBe(77); // 타일 없는 곳
    expect(valueAt(result, 100, 100)).toBe(77);
    expect(valueAt(result, 128, 64)).toBe(ramp(0, 0));
    expect(valueAt(result, 191, 127)).toBe(ramp(63, 63));
    expect(valueAt(result, 191, 0)).toBe(77);
    expect(valueAt(result, 0, 127)).toBe(77);
  });

  it("기본값이 0이면 타일 없는 곳이 0이다", () => {
    const result = assemble([
      { x: 0, y: 0, values: () => 200 },
      { x: 64, y: 64, values: () => 201 },
    ]);
    expect(valueAt(result, 64, 0)).toBe(0);
    expect(valueAt(result, 0, 64)).toBe(0);
    expect(valueAt(result, 64, 64)).toBe(201);
  });

  it("음수 타일 좌표도 합집합 사각형에 담는다", () => {
    const result = assemble([
      { x: -64, y: -64, values: () => 1 },
      { x: 0, y: 0, values: () => 2 },
    ]);
    expect(result.extent).toEqual({ x: -64, y: -64, width: 128, height: 128 });
    expect(valueAt(result, -64, -64)).toBe(1);
    expect(valueAt(result, 0, 0)).toBe(2);
    expect(valueAt(result, 0, -64)).toBe(0);
  });

  it("음수 타일만 있으면 합집합 사각형이 그 타일에 딱 맞는다 (양수 쪽으로 늘어나지 않는다)", () => {
    const result = assemble([{ x: -128, y: -192, values: () => 7 }]);
    expect(result.extent).toEqual({ x: -128, y: -192, width: 64, height: 64 });
    expect(new Set(result.values)).toEqual(new Set([7]));
  });

  it("타일 좌표와 마스크 오프셋의 합이 32비트 정수를 넘어도 정확하다", () => {
    const result = assemble([{ x: 2 ** 31, y: -(2 ** 31), values: () => 7 }], { offsetX: 2 ** 31, offsetY: -(2 ** 31) });
    expect(result.extent).toEqual({ x: 2 ** 32, y: -(2 ** 32), width: 64, height: 64 });
    expect(result.values).toHaveLength(64 * 64);
    expect(result.values![0]).toBe(7);
  });

  it("2^32 떨어진 타일은 RangeError가 아니라 limit 오류로 거부한다", () => {
    expect(
      failureOf(() =>
        assemble([
          { x: -(2 ** 31), y: 0, values: () => 1 },
          { x: 2 ** 31, y: 0, values: () => 1 },
        ]),
      ),
    ).toBe("limit");
  });

  it("압축하지 않은 타일(플래그 0)과 LZF 타일이 같은 값을 낸다", () => {
    const pattern = (x: number, y: number) => (x * 31 + y * 17 + 5) & 0xff;
    const tiles = [{ x: 0, y: 0, values: pattern }];
    const lzf = assemble(tiles, { mode: "lzf" });
    const raw = assemble(tiles, { mode: "raw" });
    expect(raw).toEqual(lzf);
    for (const [x, y] of [[0, 0], [59, 1], [63, 63], [17, 40]] as const) expect(valueAt(raw, x, y)).toBe(pattern(x, y));
  });

  it("픽셀 크기가 1이 아닌 타일 파일은 거부한다", () => {
    const file = parseKraTileFile(buildKraTileFile({ pixelBytes: 4, tiles: [] }), KRA_LIMITS);
    expect(failureOf(() => assembleKraMask({ file, defaultValue: 0, offsetX: 0, offsetY: 0, limits: KRA_LIMITS }))).toBe("pixel-size");
  });

  it("출력 버퍼를 만들기 전에 가로×세로 바이트를 알린다", () => {
    const calls: number[] = [];
    const one = assemble([{ x: 0, y: 0, values: ramp }], { reserve: (bytes) => calls.push(bytes) });
    expect(calls).toEqual([64 * 64]);
    expect(one.values).toHaveLength(64 * 64);
    const far: number[] = [];
    assemble(
      [
        { x: 0, y: 0, values: ramp },
        { x: 128, y: 64, values: ramp },
      ],
      { reserve: (bytes) => far.push(bytes) },
    );
    expect(far).toEqual([192 * 128]);
  });

  it("청구가 던지면 타일을 하나도 풀지 않는다", () => {
    const marker = new KraTileError("예산 초과", "limit");
    let decoded = 0;
    expect(() =>
      assemble([{ x: 0, y: 0, values: ramp }], {
        reserve: () => {
          throw marker;
        },
        checkpoint: () => (decoded += 1),
      }),
    ).toThrow(marker);
    expect(decoded).toBe(0);
  });

  it("구조가 틀린 타일이 하나라도 있으면 출력 버퍼를 청구하기 전에 거부한다", () => {
    const calls: number[] = [];
    const good = kraTilePayload(solidTile([5]), 1);
    const file = parseKraTileFile(
      buildKraTileFile({
        pixelBytes: 1,
        tiles: [
          { x: 0, y: 0, payload: good },
          { x: 64, y: 0, payload: good, compression: "ZIP" },
        ],
      }),
      KRA_LIMITS,
    );
    expect(
      failureOf(() => assembleKraMask({ file, defaultValue: 0, offsetX: 0, offsetY: 0, limits: KRA_LIMITS, reserve: (bytes) => calls.push(bytes) })),
    ).toBe("compression");
    expect(calls).toEqual([]);
  });

  it("LZF가 깨진 타일은 풀어 봐야 알므로 청구는 이미 일어났다", () => {
    const calls: number[] = [];
    const good = kraTilePayload(solidTile([5]), 1);
    const file = parseKraTileFile(
      buildKraTileFile({
        pixelBytes: 1,
        tiles: [
          { x: 0, y: 0, payload: good },
          { x: 64, y: 0, payload: Uint8Array.from([1, 0, 1]) },
        ],
      }),
      KRA_LIMITS,
    );
    expect(
      failureOf(() => assembleKraMask({ file, defaultValue: 0, offsetX: 0, offsetY: 0, limits: KRA_LIMITS, reserve: (bytes) => calls.push(bytes) })),
    ).toBe("lzf");
    expect(calls).toEqual([128 * 64]);
  });

  it("출력 픽셀이 한도를 넘으면 limit로 거부한다 (경계 포함)", () => {
    const tiles = [{ x: 0, y: 0, values: ramp }];
    expect(failureOf(() => assemble(tiles, { limits: { ...KRA_LIMITS, maxLayerPixels: 64 * 64 - 1 } }))).toBe("limit");
    expect(() => assemble(tiles, { limits: { ...KRA_LIMITS, maxLayerPixels: 64 * 64 } })).not.toThrow();
  });

  it("타일 사이가 멀면 합집합 사각형 크기로 한도를 본다", () => {
    const tiles = [
      { x: 0, y: 0, values: ramp },
      { x: 6400, y: 6400, values: ramp },
    ];
    expect(failureOf(() => assemble(tiles, { limits: { ...KRA_LIMITS, maxLayerPixels: 1_000_000 } }))).toBe("limit");
  });

  it("출력 버퍼를 만들지 못하면(메모리 부족) 정해진 오류로 바꾼다", () => {
    const tiles = [
      { x: -(2 ** 30), y: -(2 ** 30), values: ramp },
      { x: 2 ** 30, y: 2 ** 30, values: ramp },
    ];
    expect(failureOf(() => assemble(tiles, { limits: { ...KRA_LIMITS, maxLayerPixels: Number.POSITIVE_INFINITY } }))).toBe("limit");
  });

  it("타일 64개마다 중단 확인 콜백을 부른다", () => {
    const callsFor = (count: number) => {
      const tiles = Array.from({ length: count }, (_, index) => ({ x: index * 64, y: 0, values: () => 3 }));
      let calls = 0;
      assemble(tiles, { checkpoint: () => (calls += 1) });
      return calls;
    };
    expect(callsFor(63)).toBe(0);
    expect(callsFor(64)).toBe(1);
    expect(callsFor(129)).toBe(2);
  });

  it("중단 콜백이 던지면 그 오류가 그대로 올라온다", () => {
    const marker = new Error("중단");
    const tiles = Array.from({ length: 70 }, (_, index) => ({ x: index * 64, y: 0, values: () => 3 }));
    expect(() =>
      assemble(tiles, {
        checkpoint: () => {
          throw marker;
        },
      }),
    ).toThrow(marker);
  });
});

describe("applyKraTransparencyMasks", () => {
  const extent: KraExtent = { x: 0, y: 0, width: 8, height: 6 };
  const base = () => patternPixels(extent, () => 255);

  it("레이어 픽셀이 없으면 null이다", () => {
    const none = { status: "no-pixels" };
    expect(applyKraTransparencyMasks({ extent: null, pixels: null, masks: [] })).toEqual(none);
    expect(applyKraTransparencyMasks({ extent, pixels: null, masks: [] })).toEqual(none);
    expect(applyKraTransparencyMasks({ extent: null, pixels: base(), masks: [] })).toEqual(none);
  });

  it("투명도 마스크가 없으면 같은 내용의 새 버퍼를 돌려준다", () => {
    const pixels = base();
    const result = applied({ extent, pixels, masks: [] });
    expect(result.extent).toEqual(extent);
    expect(result.appliedMasks).toBe(0);
    expect(result.pixels).toEqual(pixels);
    expect(result.pixels).not.toBe(pixels);
  });

  it("입력 버퍼와 마스크를 바꾸지 않는다", () => {
    const pixels = patternPixels(extent, (x, y) => 40 + x * 20 + y);
    const before = Uint8Array.from(pixels);
    const mask = maskOver(extent, (x) => x * 30, 0);
    const maskBefore = Uint8Array.from(mask.values!);
    applyKraTransparencyMasks({ extent, pixels, masks: [mask] });
    expect(pixels).toEqual(before);
    expect(mask.values).toEqual(maskBefore);
  });

  it("(알파, 마스크) 256x256 조합 전부가 round(알파 * 마스크 / 255)다", () => {
    const grid: KraExtent = { x: 0, y: 0, width: 256, height: 256 };
    const pixels = patternPixels(grid, (x) => x);
    const mask = maskOver(grid, (_x, y) => y, 0);
    const result = applied({ extent: grid, pixels, masks: [mask] });
    let wrong = 0;
    for (let y = 0; y < 256; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        if (result.pixels[(y * 256 + x) * 4 + 3] !== referenceMultiply(x, y)) wrong += 1;
      }
    }
    expect(wrong).toBe(0);
    // 알려진 값 몇 개(Krita가 읽어 준 투영과 같은 값): (255,128)→128, (200,100)→78, (100,20)→8, (128,128)→64
    expect(result.pixels[(128 * 256 + 255) * 4 + 3]).toBe(128);
    expect(result.pixels[(100 * 256 + 200) * 4 + 3]).toBe(78);
    expect(result.pixels[(20 * 256 + 100) * 4 + 3]).toBe(8);
    expect(result.pixels[(128 * 256 + 128) * 4 + 3]).toBe(64);
  });

  it("색은 그대로 두고 알파가 0이 되면 색도 0으로 만든다", () => {
    const pixels = Uint8Array.from([10, 20, 30, 200, 11, 21, 31, 200, 12, 22, 32, 0, 13, 23, 33, 255]);
    const row: KraExtent = { x: 0, y: 0, width: 4, height: 1 };
    const mask = maskOver(row, (x) => [255, 128, 0, 0][x]!, 0);
    const result = applied({ extent: row, pixels, masks: [mask] });
    expect(Array.from(result.pixels)).toEqual([
      10, 20, 30, 200, // 마스크 255: 그대로
      11, 21, 31, 100, // 마스크 128: 알파만 줄고 색은 그대로
      12, 22, 32, 0, // 알파가 원래 0이면 색을 건드리지 않는다
      0, 0, 0, 0, // 마스크 0: 알파와 색 모두 0
    ]);
  });

  it("알파가 줄어 0이 되는 경우(작은 알파 x 작은 마스크)에도 색을 0으로 만든다", () => {
    const pixels = Uint8Array.from([50, 60, 70, 3]);
    const one: KraExtent = { x: 0, y: 0, width: 1, height: 1 };
    const result = applied({ extent: one, pixels, masks: [maskOver(one, () => 4, 0)] });
    expect(Array.from(result.pixels)).toEqual([0, 0, 0, 0]);
  });

  it("타일이 없는 마스크는 어디서나 기본값이다", () => {
    const pixels = patternPixels(extent, (x, y) => 100 + x + y);
    const keep = applied({ extent, pixels, masks: [makeMask({ defaultValue: 255 })] });
    expect(keep.pixels).toEqual(pixels);
    expect(keep.appliedMasks).toBe(1);
    const hide = applied({ extent, pixels, masks: [makeMask({ defaultValue: 0 })] });
    expect(new Set(hide.pixels)).toEqual(new Set([0]));
    const half = applied({ extent, pixels, masks: [makeMask({ defaultValue: 128 })] });
    expect(half.pixels).toEqual(referenceApply(extent, pixels, [makeMask({ defaultValue: 128 })]));
    expect(pixelAt(half.pixels, extent, 0, 0)[3]).toBe(referenceMultiply(100, 128));
  });

  it("값 버퍼와 범위 중 하나만 있는 마스크는 상수 마스크로 본다", () => {
    const pixels = patternPixels(extent, () => 200);
    const rangeOnly = makeMask({ defaultValue: 100, extent: { x: 1, y: 1, width: 2, height: 2 }, values: null });
    const valuesOnly = makeMask({ defaultValue: 100, extent: null, values: new Uint8Array(4).fill(255) });
    for (const mask of [rangeOnly, valuesOnly]) {
      const result = applied({ extent, pixels, masks: [mask] });
      expect(new Set(Array.from({ length: extent.width * extent.height }, (_, pixel) => result.pixels[pixel * 4 + 3]))).toEqual(new Set([referenceMultiply(200, 100)]));
    }
  });

  it("마스크 사각형 밖은 기본값, 안은 마스크 값을 곱한다 (이미지 좌표 정렬)", () => {
    const layerExtent: KraExtent = { x: 10, y: 20, width: 8, height: 6 };
    const pixels = patternPixels(layerExtent, () => 255);
    const region: KraExtent = { x: 12, y: 22, width: 4, height: 3 };
    const mask = maskOver(region, (x, y) => 40 + (x - region.x) * 10 + (y - region.y) * 50, 0);
    const result = applied({ extent: layerExtent, pixels, masks: [mask] });
    for (let y = layerExtent.y; y < layerExtent.y + layerExtent.height; y += 1) {
      for (let x = layerExtent.x; x < layerExtent.x + layerExtent.width; x += 1) {
        const inside = x >= 12 && x < 16 && y >= 22 && y < 25;
        const expected = inside ? 40 + (x - 12) * 10 + (y - 22) * 50 : 0;
        expect(pixelAt(result.pixels, layerExtent, x, y)[3], `(${x},${y})`).toBe(expected);
      }
    }
  });

  it("기본값이 0이 아닌 마스크는 사각형 밖에서도 그 값을 곱한다", () => {
    const pixels = patternPixels(extent, () => 200);
    const region: KraExtent = { x: 2, y: 1, width: 3, height: 2 };
    const mask = maskOver(region, () => 255, 100);
    const result = applied({ extent, pixels, masks: [mask] });
    expect(pixelAt(result.pixels, extent, 2, 1)[3]).toBe(200);
    expect(pixelAt(result.pixels, extent, 4, 2)[3]).toBe(200);
    expect(pixelAt(result.pixels, extent, 5, 2)[3]).toBe(referenceMultiply(200, 100));
    expect(pixelAt(result.pixels, extent, 0, 0)[3]).toBe(referenceMultiply(200, 100));
    expect(pixelAt(result.pixels, extent, 7, 5)[3]).toBe(referenceMultiply(200, 100));
    expect(pixelAt(result.pixels, extent, 2, 3)[3]).toBe(referenceMultiply(200, 100));
  });

  it("레이어보다 큰 마스크나 레이어와 겹치지 않는 마스크도 맞게 자른다", () => {
    const pixels = patternPixels(extent, () => 255);
    const wide: KraExtent = { x: -20, y: -20, width: 64, height: 64 };
    const outside = applied({ extent, pixels, masks: [maskOver(wide, (x, y) => (x + y + 100) & 0xff, 0)] });
    expect(outside.pixels).toEqual(referenceApply(extent, pixels, [maskOver(wide, (x, y) => (x + y + 100) & 0xff, 0)]));
    const away: KraExtent = { x: 100, y: 100, width: 4, height: 4 };
    const hidden = applied({ extent, pixels, masks: [maskOver(away, () => 255, 0)] });
    expect(new Set(hidden.pixels)).toEqual(new Set([0]));
    const kept = applied({ extent, pixels, masks: [maskOver(away, () => 0, 255)] });
    expect(kept.pixels).toEqual(pixels);
  });

  it("바깥 값이 255가 아닌 모든 분기(상수 마스크, 겹치지 않는 행, 겹치는 행의 양옆)에서 254·1 같은 값도 곱한다", () => {
    const pixels = patternPixels(extent, (x, y) => 100 + x * 7 + y * 11);
    for (const outside of [1, 77, 254]) {
      const constant = makeMask({ defaultValue: outside });
      expect(applied({ extent, pixels, masks: [constant] }).pixels, `상수 ${outside}`).toEqual(referenceApply(extent, pixels, [constant]));
      const above = maskOver({ x: 2, y: -10, width: 3, height: 4 }, () => 255, outside); // 레이어 위쪽: 겹치는 행이 없다
      const below = maskOver({ x: 2, y: 20, width: 3, height: 4 }, () => 255, outside);
      const side = maskOver({ x: 1, y: 1, width: 3, height: 2 }, (x) => 200 + x, outside); // 겹치는 행: 양옆이 바깥 값
      // 행은 겹치지만 가로로 떨어진 마스크: 열 범위가 레이어 폭을 넘거나 음수여도 바깥 값을 레이어의 모든 픽셀에 한 번씩만 곱한다
      const rightOf = maskOver({ x: 20, y: 1, width: 3, height: 2 }, () => 255, outside);
      const leftOf = maskOver({ x: -20, y: 1, width: 3, height: 2 }, () => 255, outside);
      for (const mask of [above, below, side, rightOf, leftOf]) {
        expect(applied({ extent, pixels, masks: [mask] }).pixels, `영역 ${JSON.stringify(mask.extent)} 바깥 ${outside}`).toEqual(referenceApply(extent, pixels, [mask]));
      }
    }
  });

  it("레이어에서 2^32 떨어진 마스크는 네 방향 어디서나 안쪽 값이 아니라 바깥 값만 적용한다", () => {
    const small: KraExtent = { x: 0, y: 0, width: 4, height: 4 };
    const pixels = patternPixels(small, () => 255);
    const far = (x: number, y: number): KraExtent => ({ x, y, width: 4, height: 4 });
    for (const region of [far(2 ** 32, 0), far(-(2 ** 32), 0), far(0, 2 ** 32), far(0, -(2 ** 32)), far(2 ** 32 + 2, 2 ** 32 + 2)]) {
      // 바깥 값 255, 안쪽 값 0: 레이어는 그대로
      expect(applied({ extent: small, pixels, masks: [maskOver(region, () => 0, 255)] }).pixels, JSON.stringify(region)).toEqual(pixels);
      // 바깥 값 0, 안쪽 값 255: 레이어는 전부 숨는다
      expect(new Set(applied({ extent: small, pixels, masks: [maskOver(region, () => 255, 0)] }).pixels), JSON.stringify(region)).toEqual(new Set([0]));
    }
  });

  it("가장자리를 걸치는 마스크(왼쪽·오른쪽·위·아래)가 맞게 정렬된다", () => {
    const pixels = patternPixels(extent, () => 255);
    for (const region of [
      { x: -2, y: 1, width: 5, height: 3 },
      { x: 5, y: 1, width: 6, height: 3 },
      { x: 1, y: -1, width: 3, height: 3 },
      { x: 1, y: 4, width: 3, height: 5 },
    ]) {
      const mask = maskOver(region, (x, y) => (x * 17 + y * 29 + 60) & 0xff, 30);
      expect(applied({ extent, pixels, masks: [mask] }).pixels, JSON.stringify(region)).toEqual(referenceApply(extent, pixels, [mask]));
    }
  });

  it("마스크가 여럿이면 목록 끝(가장 아래)부터 곱한다", () => {
    // 곱하는 순서에 따라 결과가 달라지는 (알파, 마스크, 마스크)를 찾는다
    let found: [number, number, number] | null = null;
    for (let a = 1; a < 256 && found === null; a += 1) {
      for (let m1 = 1; m1 < 256 && found === null; m1 += 1) {
        for (let m2 = 1; m2 < 256; m2 += 1) {
          if (referenceMultiply(referenceMultiply(a, m1), m2) !== referenceMultiply(referenceMultiply(a, m2), m1)) {
            found = [a, m1, m2];
            break;
          }
        }
      }
    }
    expect(found).not.toBeNull();
    const [alpha, first, second] = found!;
    const one: KraExtent = { x: 0, y: 0, width: 1, height: 1 };
    const pixels = Uint8Array.from([9, 8, 7, alpha]);
    const top = makeMask({ name: "top", defaultValue: second });
    const bottom = makeMask({ name: "bottom", defaultValue: first });
    // 파일의 마스크 목록은 위에서 아래다: 아래 마스크(bottom)가 먼저 곱해진다
    const result = applied({ extent: one, pixels, masks: [top, bottom] });
    expect(result.pixels[3]).toBe(referenceMultiply(referenceMultiply(alpha, first), second));
    expect(result.pixels[3]).not.toBe(referenceMultiply(referenceMultiply(alpha, second), first));
    expect(result.appliedMasks).toBe(2);
  });

  it("보이지 않는 마스크와 투명도 마스크가 아닌 마스크는 건너뛴다", () => {
    const pixels = patternPixels(extent, () => 200);
    const hide = (overrides: Partial<KraMask>) => makeMask({ defaultValue: 0, ...overrides });
    const result = applied({
      extent,
      pixels,
      masks: [hide({ visible: false }), hide({ nodeType: "selectionmask" }), hide({ nodeType: "filtermask" }), hide({ nodeType: "transformmask" }), hide({ nodeType: "" })],
    });
    expect(result.pixels).toEqual(pixels);
    expect(result.appliedMasks).toBe(0);
  });

  it("보이는 투명도 마스크의 값을 읽지 못했으면 mask-unreadable로 알린다 (건너뛰는 마스크의 읽기 실패는 상관없다)", () => {
    const pixels = patternPixels(extent, () => 200);
    const unreadable = makeMask({ defaultValue: null });
    expect(applyKraTransparencyMasks({ extent, pixels, masks: [unreadable] })).toEqual({ status: "mask-unreadable", maskIndex: 0 });
    // 목록 끝(가장 아래)부터 보므로 처음 만나는 읽지 못한 마스크를 알린다
    expect(applyKraTransparencyMasks({ extent, pixels, masks: [makeMask({ defaultValue: 128 }), unreadable] })).toEqual({ status: "mask-unreadable", maskIndex: 1 });
    expect(applyKraTransparencyMasks({ extent, pixels, masks: [unreadable, makeMask({ defaultValue: 128 }), unreadable] })).toEqual({
      status: "mask-unreadable",
      maskIndex: 2,
    });
    const skipped = applied({
      extent,
      pixels,
      masks: [makeMask({ defaultValue: null, visible: false }), makeMask({ defaultValue: null, nodeType: "selectionmask" })],
    });
    expect(skipped.pixels).toEqual(pixels);
  });

  it("작업량 상한은 2^28이다", () => {
    expect(KRA_MASK_APPLY_MAX_PIXEL_OPS).toBe(268_435_456);
  });

  it("maxPixelOps 옵션으로 상한을 낮출 수 있고 올리거나 잘못된 값은 거부한다", () => {
    const small: KraExtent = { x: 0, y: 0, width: 10, height: 10 };
    const pixels = patternPixels(small, () => 200);
    const layer = { extent: small, pixels, masks: [makeMask({ defaultValue: 128 })] };
    expect(applied(layer, { maxPixelOps: 100 }).appliedMasks).toBe(1); // 100 = 한도: 통과
    expect(() => applyKraTransparencyMasks(layer, { maxPixelOps: 99 })).toThrow(KraError);
    expect(() => applyKraTransparencyMasks(layer, { maxPixelOps: 0 })).toThrow(KraError);
    expect(applied({ ...layer, masks: [makeMask({ defaultValue: 255 })] }, { maxPixelOps: 0 }).appliedMasks).toBe(1); // 곱할 것이 없으면 0이어도 통과
    for (const maxPixelOps of [-1, 1.5, Number.NaN, KRA_MASK_APPLY_MAX_PIXEL_OPS + 1, Number.POSITIVE_INFINITY]) {
      let code: string | null = null;
      try {
        applyKraTransparencyMasks(layer, { maxPixelOps });
      } catch (error) {
        code = error instanceof KraError ? error.code : null;
      }
      expect(code, String(maxPixelOps)).toBe("limit-invalid");
    }
    expect(applied(layer, { maxPixelOps: KRA_MASK_APPLY_MAX_PIXEL_OPS }).appliedMasks).toBe(1);
    expect(applied(layer, {}).appliedMasks).toBe(1);
  });

  it("작업량(픽셀 수 x 적용할 마스크 수)이 한도를 넘으면 limit-exceeded로 던진다", () => {
    // 작업량 검사는 버퍼를 복사하기 전에 하므로 가짜 작은 버퍼로 한도 경계를 본다
    const over: KraExtent = { x: 0, y: 0, width: KRA_MASK_APPLY_MAX_PIXEL_OPS + 1, height: 1 };
    let error: unknown;
    try {
      applyKraTransparencyMasks({ extent: over, pixels: new Uint8Array(4), masks: [makeMask({ defaultValue: 0 })] });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(KraError);
    expect((error as KraError).code).toBe("limit-exceeded");
    expect((error as KraError).message).toContain(String(KRA_MASK_APPLY_MAX_PIXEL_OPS + 1));
  });

  it("작업량은 가로 x 세로 x 마스크 수로 센다", () => {
    const tall: KraExtent = { x: 0, y: 0, width: 2 ** 15, height: 2 ** 13 + 1 };
    expect(() => applyKraTransparencyMasks({ extent: tall, pixels: new Uint8Array(4), masks: [makeMask({ defaultValue: 0 })] })).toThrow(KraError);
    const square: KraExtent = { x: 0, y: 0, width: 2 ** 14, height: 2 ** 14 };
    const empty = (): KraMask => makeMask({ extent: { x: 0, y: 0, width: 0, height: 0 }, values: new Uint8Array(0), defaultValue: 255 });
    expect(applied({ extent: square, pixels: new Uint8Array(4), masks: [empty()] }).appliedMasks).toBe(1);
    expect(() => applyKraTransparencyMasks({ extent: square, pixels: new Uint8Array(4), masks: [empty(), empty()] })).toThrow(KraError);
  });

  it("작업량이 정확히 한도와 같으면 던지지 않는다", () => {
    const edge: KraExtent = { x: 0, y: 0, width: KRA_MASK_APPLY_MAX_PIXEL_OPS, height: 1 };
    // 값 버퍼는 있지만 비어 있고 바깥 값이 255인 마스크: 작업량은 세지만 실제로 곱할 픽셀은 없다
    const mask = makeMask({ extent: { x: 0, y: 0, width: 0, height: 0 }, values: new Uint8Array(0), defaultValue: 255 });
    expect(applied({ extent: edge, pixels: new Uint8Array(4), masks: [mask] }).appliedMasks).toBe(1);
  });

  it("마스크마다 작업량을 더한다", () => {
    const half: KraExtent = { x: 0, y: 0, width: KRA_MASK_APPLY_MAX_PIXEL_OPS / 2 + 1, height: 1 };
    const none = (): KraMask => makeMask({ extent: { x: 0, y: 0, width: 0, height: 0 }, values: new Uint8Array(0), defaultValue: 255 });
    expect(applied({ extent: half, pixels: new Uint8Array(4), masks: [none()] }).appliedMasks).toBe(1);
    expect(() => applyKraTransparencyMasks({ extent: half, pixels: new Uint8Array(4), masks: [none(), none()] })).toThrow(KraError);
  });

  it("타일이 없고 기본값이 255인 마스크는 작업량에 세지 않는다", () => {
    const huge: KraExtent = { x: 0, y: 0, width: KRA_MASK_APPLY_MAX_PIXEL_OPS + 1, height: 1 };
    expect(applied({ extent: huge, pixels: new Uint8Array(4), masks: [makeMask({ defaultValue: 255 })] }).appliedMasks).toBe(1);
  });

  it("무작위 레이어·마스크 구성이 느린 기준 구현과 모든 픽셀에서 같다", () => {
    const next = random(20_251_029);
    const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
    for (let round = 0; round < 200; round += 1) {
      const layerExtent: KraExtent = { x: int(-70, 70), y: int(-70, 70), width: int(1, 40), height: int(1, 40) };
      const pixels = patternPixels(layerExtent, (x, y) => (x * 31 + y * 17 + round) & 0xff);
      // 알파에 0·255·작은 값이 섞이도록
      for (let at = 3; at < pixels.length; at += 4) if (next() < 0.1) pixels[at] = next() < 0.5 ? 0 : 255;
      const masks: KraMask[] = Array.from({ length: int(0, 4) }, (_, index) => {
        const region: KraExtent = { x: int(-80, 80), y: int(-80, 80), width: int(1, 60), height: int(1, 60) };
        const seed = round * 7 + index;
        const tiled = next() < 0.85;
        const base = tiled
          ? maskOver(region, (x, y) => ((x * 13 + y * 7 + seed) & 0xff) | (next() < 0.2 ? 0xff : 0), [0, 255, 77, 254, 1][int(0, 4)]!, { name: `m${index}` })
          : makeMask({ defaultValue: [0, 255, 33, 128, 254][int(0, 4)]!, name: `m${index}` });
        return { ...base, visible: next() < 0.8, nodeType: next() < 0.85 ? "transparencymask" : "selectionmask" };
      });
      const got = applied({ extent: layerExtent, pixels, masks });
      expect(got.pixels, `round ${round}`).toEqual(referenceApply(layerExtent, pixels, masks));
    }
  });
});

// ---------------------------------------------------------------------------
// importKra: 마스크 값 읽기
// ---------------------------------------------------------------------------

function paint(x: number, y: number, rgba: [number, number, number, number]) {
  const tile = tilePixels(4, () => kraNativeRgba(...rgba));
  return buildKraTileFile({ pixelBytes: 4, tiles: [{ x, y, payload: kraTilePayload(tile, 4) }] });
}

const halfMask = buildKraMaskTileFile([{ x: 0, y: 0, values: (x) => (x < 32 ? 255 : 128) }]);

describe("importKra: 마스크 값", () => {
  it("투명도 마스크의 값·범위·기본값·타일 수를 읽고 레이어 픽셀은 그대로 둔다", async () => {
    const result = await importKra(
      buildKraFixture({
        layers: [{ name: "base", tileFile: paint(0, 0, [200, 100, 50, 255]), masks: [{ nodetype: "transparencymask", name: "tm", valuesFile: halfMask }] }],
      }),
    );
    const layer = result.layers[0]!;
    expect(layer.masks).toHaveLength(1);
    expect(layer.masks[0]).toMatchObject({
      nodeType: "transparencymask",
      name: "tm",
      uuid: "{00000000-0000-4000-8000-000000000003}",
      visible: true,
      locked: false,
      filename: "mask3",
      offsetX: 0,
      offsetY: 0,
      extent: { x: 0, y: 0, width: 64, height: 64 },
      defaultValue: 0,
      tileCount: 1,
    });
    expect(layer.masks[0]!.attributes).toMatchObject({ nodetype: "transparencymask", filename: "mask3", name: "tm", x: "0", y: "0", visible: "1" });
    expect(layer.masks[0]!.values).toHaveLength(64 * 64);
    expect(layer.masks[0]!.values![0]).toBe(255);
    expect(layer.masks[0]!.values![31]).toBe(255);
    expect(layer.masks[0]!.values![32]).toBe(128);
    expect(layer.masks[0]!.values![64 * 64 - 1]).toBe(128);
    // 마스크를 적용하지 않은 레이어 자체의 픽셀
    expect(pixelAt(layer.pixels!, layer.extent!, 40, 0)).toEqual([200, 100, 50, 255]);
    expect(codes(result.unsupported)).toEqual(["kra-mask-unsupported"]);
    expect(result.unsupported[0]!.message).toContain("레이어 픽셀에 적용하지 않는다");
    expect(result.unsupported[0]!.message).not.toContain("속성만 읽고");
    expect(result.warnings).toEqual([]);

    const masked = applied(layer);
    expect(masked.appliedMasks).toBe(1);
    expect(pixelAt(masked.pixels, masked.extent, 10, 0)).toEqual([200, 100, 50, 255]);
    expect(pixelAt(masked.pixels, masked.extent, 40, 0)).toEqual([200, 100, 50, 128]);
  });

  it("마스크 x·y 속성을 타일 좌표에 더하고, 레이어 오프셋과는 따로 다룬다", async () => {
    const result = await importKra(
      buildKraFixture({
        layers: [
          {
            name: "moved",
            attrs: { x: "30", y: "-20" },
            tileFile: paint(0, 0, [1, 2, 3, 255]),
            masks: [{ nodetype: "transparencymask", name: "tm", attrs: { x: "10", y: "7" }, valuesFile: halfMask }],
          },
        ],
      }),
    );
    const layer = result.layers[0]!;
    expect(layer.extent).toEqual({ x: 30, y: -20, width: 64, height: 64 });
    expect(layer.masks[0]).toMatchObject({ offsetX: 10, offsetY: 7, extent: { x: 10, y: 7, width: 64, height: 64 } });
    // 마스크는 부모 레이어를 따라 움직이지 않는다: 이미지 좌표 (10, 7)에서 시작한다
    const masked = applied(layer);
    expect(pixelAt(masked.pixels, masked.extent, 30, 7)[3]).toBe(255); // 마스크 열 20
    expect(pixelAt(masked.pixels, masked.extent, 41, 7)[3]).toBe(255); // 마스크 열 31
    expect(pixelAt(masked.pixels, masked.extent, 42, 7)[3]).toBe(128); // 마스크 열 32
    expect(pixelAt(masked.pixels, masked.extent, 30, 6)[3]).toBe(0); // 마스크 위쪽(행 -1)은 기본값 0
    expect(pixelAt(masked.pixels, masked.extent, 60, 43)[3]).toBe(128); // 레이어의 마지막 행 y=43 → 마스크 행 36, 열 50
  });

  it("선택을 뒤집은 마스크는 타일 없이 기본값만 255이고 레이어를 바꾸지 않는다", async () => {
    const result = await importKra(
      buildKraFixture({
        layers: [
          {
            name: "base",
            tileFile: paint(0, 0, [9, 9, 9, 200]),
            masks: [{ nodetype: "transparencymask", name: "all", valuesFile: buildKraTileFile({ pixelBytes: 1, tiles: [] }), defaultValue: Uint8Array.of(255) }],
          },
        ],
      }),
    );
    const mask = result.layers[0]!.masks[0]!;
    expect(mask).toMatchObject({ extent: null, values: null, defaultValue: 255, tileCount: 0 });
    expect(applied(result.layers[0]!).pixels).toEqual(result.layers[0]!.pixels);
  });

  it("값 파일은 있지만 타일이 없고 기본값이 0이면 레이어 전체를 숨기는 마스크다", async () => {
    const result = await importKra(
      buildKraFixture({
        layers: [
          { name: "base", tileFile: paint(0, 0, [9, 9, 9, 200]), masks: [{ nodetype: "transparencymask", name: "none", valuesFile: buildKraTileFile({ pixelBytes: 1, tiles: [] }) }] },
        ],
      }),
    );
    expect(result.layers[0]!.masks[0]).toMatchObject({ extent: null, values: null, defaultValue: 0, tileCount: 0 });
    expect(new Set(applied(result.layers[0]!).pixels)).toEqual(new Set([0]));
  });

  it("선택 마스크와 필터 마스크도 값을 읽고, 변형·색칠 마스크는 읽지 않는다", async () => {
    const result = await importKra(
      buildKraFixture({
        layers: [
          {
            name: "base",
            tileFile: paint(0, 0, [1, 2, 3, 255]),
            masks: [
              { nodetype: "selectionmask", name: "sm", valuesFile: halfMask },
              { nodetype: "filtermask", name: "fm", valuesFile: halfMask },
              { nodetype: "transformmask", name: "xm" },
              { nodetype: "colorizemask", name: "cm" },
            ],
          },
        ],
      }),
    );
    const masks = result.layers[0]!.masks;
    expect(masks.map((mask) => [mask.nodeType, mask.values !== null, mask.defaultValue])).toEqual([
      ["selectionmask", true, 0],
      ["filtermask", true, 0],
      ["transformmask", false, null],
      ["colorizemask", false, null],
    ]);
    expect(codes(result.unsupported)).toEqual(["kra-mask-unsupported", "kra-mask-unsupported", "kra-mask-unsupported", "kra-mask-unsupported"]);
    expect(result.unsupported.map((issue) => issue.message.includes("속성만 읽고"))).toEqual([false, false, true, true]);
    // 선택 마스크·필터 마스크는 투명도 마스크가 아니라 적용되지 않는다
    expect(applied(result.layers[0]!).pixels).toEqual(result.layers[0]!.pixels);
  });

  it("숨긴 마스크도 값은 읽지만 적용하지 않는다", async () => {
    const result = await importKra(
      buildKraFixture({
        layers: [{ name: "base", tileFile: paint(0, 0, [1, 2, 3, 255]), masks: [{ nodetype: "transparencymask", name: "off", attrs: { visible: "0" }, valuesFile: halfMask }] }],
      }),
    );
    expect(result.layers[0]!.masks[0]).toMatchObject({ visible: false, defaultValue: 0 });
    expect(result.layers[0]!.masks[0]!.values).not.toBeNull();
    const masked = applied(result.layers[0]!);
    expect(masked.appliedMasks).toBe(0);
    expect(masked.pixels).toEqual(result.layers[0]!.pixels);
  });

  it("마스크가 여럿이면 파일 순서를 보존하고 아래 마스크부터 곱한다", async () => {
    const top = buildKraMaskTileFile([{ x: 0, y: 0, values: () => 200 }]);
    const bottom = buildKraMaskTileFile([{ x: 0, y: 0, values: () => 100 }]);
    const result = await importKra(
      buildKraFixture({
        layers: [
          {
            name: "base",
            tileFile: paint(0, 0, [1, 2, 3, 255]),
            masks: [
              { nodetype: "transparencymask", name: "top", valuesFile: top },
              { nodetype: "transparencymask", name: "bottom", valuesFile: bottom },
            ],
          },
        ],
      }),
    );
    expect(result.layers[0]!.masks.map((mask) => mask.name)).toEqual(["top", "bottom"]);
    const masked = applied(result.layers[0]!);
    expect(masked.appliedMasks).toBe(2);
    expect(pixelAt(masked.pixels, masked.extent, 5, 5)[3]).toBe(referenceMultiply(referenceMultiply(255, 100), 200));
  });

  it("그룹 레이어와 레이어 안의 레이어의 마스크도 읽는다", async () => {
    const result = await importKra(
      buildKraFixture({
        layers: [
          {
            nodetype: "grouplayer",
            name: "G",
            masks: [{ nodetype: "transparencymask", name: "tmG", valuesFile: halfMask }],
            children: [{ name: "inner", tileFile: paint(0, 0, [1, 2, 3, 255]), masks: [{ nodetype: "transparencymask", name: "tmP", valuesFile: halfMask }] }],
          },
        ],
      }),
    );
    expect(result.layers.map((layer) => [layer.name, layer.masks.map((mask) => [mask.name, mask.tileCount])])).toEqual([
      ["G", [["tmG", 1]]],
      ["inner", [["tmP", 1]]],
    ]);
    // 그룹은 픽셀이 없어 적용할 수 없다
    expect(applyKraTransparencyMasks(result.layers[0]!)).toEqual({ status: "no-pixels" });
    expect(applyKraTransparencyMasks(result.layers[1]!).status).toBe("applied");
  });

  it("레이어의 오프셋이 올바르지 않아 픽셀을 배치하지 못해도 마스크 값은 읽는다", async () => {
    const result = await importKra(
      buildKraFixture({
        layers: [{ name: "bad", attrs: { x: "abc" }, tileFile: paint(0, 0, [1, 2, 3, 255]), masks: [{ nodetype: "transparencymask", name: "tm", valuesFile: halfMask }] }],
      }),
    );
    expect(result.layers[0]!.pixels).toBeNull();
    expect(result.layers[0]!.masks[0]!.values).not.toBeNull();
  });

  it("decodePixels=false면 마스크 값도 읽지 않는다", async () => {
    const result = await importKra(
      buildKraFixture({ layers: [{ name: "base", tileFile: paint(0, 0, [1, 2, 3, 255]), masks: [{ nodetype: "transparencymask", name: "tm" }] }] }),
      { decodePixels: false },
    );
    expect(result.layers[0]!.masks[0]).toMatchObject({ extent: null, values: null, defaultValue: null, tileCount: 0 });
    expect(codes(result.unsupported)).toEqual(["kra-mask-unsupported"]);
  });

  it("값 항목이 둘 다 없는 투명도 마스크는 Krita가 다시 열어 읽는 대로 빈 선택(어디서나 0)으로 보고 경고한다: 레이어가 전부 숨는다", async () => {
    const result = await importKra(
      buildKraFixture({ layers: [{ name: "base", tileFile: paint(0, 0, [9, 8, 7, 255]), masks: [{ nodetype: "transparencymask", name: "new" }] }] }),
    );
    expect(codes(result.unsupported)).toEqual(["kra-mask-unsupported"]);
    expect(result.warnings).toMatchObject([{ code: "kra-mask-data-missing", scope: "resource", path: "layer[0].masks[0]" }]);
    expect(result.warnings[0]!.message).toContain('"new"');
    expect(result.warnings[0]!.message).toContain("빈 선택");
    expect(result.layers[0]!.masks[0]).toMatchObject({ extent: null, values: null, defaultValue: 0, tileCount: 0 });
    const hidden = applied(result.layers[0]!);
    expect(hidden.appliedMasks).toBe(1);
    expect(new Set(hidden.pixels)).toEqual(new Set([0]));
    // 숨긴 마스크는 어떤 해석이든 적용하지 않는다
    const off = await importKra(
      buildKraFixture({
        layers: [{ name: "base", tileFile: paint(0, 0, [9, 8, 7, 255]), masks: [{ nodetype: "transparencymask", name: "new", attrs: { visible: "0" } }] }],
      }),
    );
    expect(applied(off.layers[0]!).pixels).toEqual(off.layers[0]!.pixels);
  });

  it("빈 선택으로 보는 것은 값 항목이 둘 다 없고 filename이 있는 투명도 마스크뿐이다", async () => {
    const build = (mask: KraFixtureMask, extra: { path: string; data: Uint8Array }[] = []) =>
      buildKraFixture({ layers: [{ name: "base", tileFile: paint(0, 0, [1, 2, 3, 255]), masks: [mask] }], extraEntries: extra.map((entry) => ({ ...entry, method: 8 as const })) });
    // 투명도 마스크 + .defaultpixel만 있다
    const lonely = await importKra(build({ nodetype: "transparencymask", name: "tm" }, [{ path: "doc/layers/mask3.pixelselection.defaultpixel", data: Uint8Array.of(0) }]));
    expect(codes(lonely.unsupported)).toEqual(["kra-mask-unsupported", "kra-mask-data-missing"]);
    expect(lonely.warnings).toEqual([]);
    expect(lonely.layers[0]!.masks[0]!.defaultValue).toBeNull();
    // 투명도 마스크 + .pixelselection만 있다
    const noDefault = await importKra(build({ nodetype: "transparencymask", name: "tm", valuesFile: halfMask, defaultValue: null }));
    expect(codes(noDefault.unsupported)).toEqual(["kra-mask-unsupported", "kra-mask-data-missing"]);
    expect(noDefault.layers[0]!.masks[0]!.defaultValue).toBeNull();
    // 선택·필터 마스크는 관찰한 적이 없어서 빈 선택으로 보지 않는다
    for (const nodetype of ["selectionmask", "filtermask"]) {
      const other = await importKra(build({ nodetype, name: "m" }));
      expect(codes(other.unsupported), nodetype).toEqual(["kra-mask-unsupported", "kra-mask-data-missing"]);
      expect(other.warnings, nodetype).toEqual([]);
      expect(other.layers[0]!.masks[0]!.defaultValue, nodetype).toBeNull();
    }
    // filename이 없으면 항목을 찾을 수 없다
    const nameless = await importKra(build({ nodetype: "transparencymask", name: "tm", attrs: { filename: null } }));
    expect(codes(nameless.unsupported)).toEqual(["kra-mask-unsupported", "kra-mask-data-missing"]);
    expect(nameless.warnings).toEqual([]);
  });

  describe("읽지 못하는 경우: 값을 알 수 없다고 보고한다", () => {
    const build = (mask: KraFixtureMask) => buildKraFixture({ layers: [{ name: "base", tileFile: paint(0, 0, [1, 2, 3, 255]), masks: [mask] }] });

    async function expectUnreadable(mask: KraFixtureMask, code: string, where = "layer[0].masks[0]") {
      const result = await importKra(build(mask));
      expect(codes(result.unsupported)).toEqual(["kra-mask-unsupported", code]);
      expect(result.unsupported[1]).toMatchObject({ scope: "resource", path: where });
      expect(result.layers[0]!.masks[0]).toMatchObject({ extent: null, values: null, defaultValue: null, tileCount: 0 });
      // 투명도 마스크만 적용에 쓰이므로, 읽지 못한 선택·필터 마스크는 적용 결과에 영향이 없다
      if (mask.nodetype === "transparencymask") expect(applyKraTransparencyMasks(result.layers[0]!)).toEqual({ status: "mask-unreadable", maskIndex: 0 });
      else expect(applyKraTransparencyMasks(result.layers[0]!).status).toBe("applied");
      return result;
    }

    it.each(["selectionmask", "filtermask"])("값 항목이 ZIP에 없는 %s", async (nodetype) => {
      const result = await expectUnreadable({ nodetype, name: "m" }, "kra-mask-data-missing");
      expect(result.unsupported[1]!.message).toContain("ZIP에 없다");
    });

    it(".defaultpixel 항목이 없다", async () => {
      await expectUnreadable({ nodetype: "transparencymask", name: "tm", valuesFile: halfMask, defaultValue: null }, "kra-mask-data-missing");
    });

    it("filename 속성이 없다", async () => {
      await expectUnreadable({ nodetype: "transparencymask", name: "tm", attrs: { filename: null }, valuesFile: halfMask }, "kra-mask-data-missing");
    });

    it.each(["../evil", "a/b", "a\\b", "..", ".", ""])("안전하지 않은 filename %j", async (filename) => {
      await expectUnreadable({ nodetype: "transparencymask", name: "tm", attrs: { filename } }, "kra-mask-filename-invalid");
    });

    it(".defaultpixel이 1바이트가 아니다", async () => {
      await expectUnreadable({ nodetype: "transparencymask", name: "tm", valuesFile: halfMask, defaultValue: Uint8Array.of(0, 0) }, "kra-mask-decode-failed");
      await expectUnreadable({ nodetype: "transparencymask", name: "tm", valuesFile: halfMask, defaultValue: new Uint8Array(0) }, "kra-mask-decode-failed");
    });

    it("타일 헤더의 픽셀 크기가 1이 아니다", async () => {
      await expectUnreadable({ nodetype: "transparencymask", name: "tm", valuesFile: buildKraTileFile({ pixelBytes: 4, tiles: [] }) }, "kra-mask-decode-failed");
    });

    it("타일 파일이 깨졌다", async () => {
      await expectUnreadable({ nodetype: "transparencymask", name: "tm", valuesFile: Uint8Array.from([1, 2, 3]) }, "kra-mask-decode-failed");
      await expectUnreadable(
        { nodetype: "transparencymask", name: "tm", valuesFile: buildKraTileFile({ pixelBytes: 1, tiles: [{ x: 0, y: 0, payload: Uint8Array.from([1, 0, 1]) }] }) },
        "kra-mask-decode-failed",
      );
    });

    it("x·y 속성이 올바르지 않으면 값을 배치하지 않고, 마스크 하나당 이름과 경로가 있는 진단 하나를 남긴다", async () => {
      const result = await importKra(build({ nodetype: "transparencymask", name: "tm", attrs: { x: "abc" }, valuesFile: halfMask }));
      expect(codes(result.unsupported)).toEqual(["kra-mask-unsupported", "kra-mask-offset-invalid"]);
      expect(result.unsupported[1]).toMatchObject({ scope: "semantic", path: "layer[0].masks[0]" });
      expect(result.unsupported[1]!.message).toContain("이 마스크의 값을 배치하지 않는다");
      expect(result.unsupported[1]!.message).toContain('"tm"');
      expect(result.layers[0]!.masks[0]).toMatchObject({ offsetX: 0, offsetY: 0, extent: null, values: null, defaultValue: null });
      const bigY = await importKra(build({ nodetype: "transparencymask", name: "tm", attrs: { y: String(2 ** 31 + 1) }, valuesFile: halfMask }));
      expect(codes(bigY.unsupported)).toContain("kra-mask-offset-invalid");
      expect(bigY.layers[0]!.masks[0]!.values).toBeNull();
      const both = await importKra(build({ nodetype: "transparencymask", name: "tm", attrs: { x: "1e3", y: "" }, valuesFile: halfMask }));
      expect(codes(both.unsupported)).toEqual(["kra-mask-unsupported", "kra-mask-offset-invalid"]);
      // 오프셋이 틀려 읽지 않았으므로 값 항목 진단은 없다
      expect(both.layers[0]!.masks[0]!.values).toBeNull();
    });

    it.each([".pixelselection", ".pixelselection.defaultpixel"])("값 항목(%s)의 ZIP CRC가 틀리면 그 마스크만 포기한다", async (suffix) => {
      const detailed = buildKraFixtureDetailed({
        layers: [
          {
            name: "base",
            tileFile: paint(0, 0, [1, 2, 3, 255]),
            masks: [
              { nodetype: "transparencymask", name: "bad", valuesFile: halfMask },
              { nodetype: "transparencymask", name: "good", valuesFile: halfMask },
            ],
          },
        ],
      });
      const entries = detailed.entries.map((entry) => (entry.path === `doc/layers/mask3${suffix}` ? { ...entry, declaredCrc32: 1 } : entry));
      const result = await importKra(buildFormatZipFixture(entries));
      expect(codes(result.unsupported)).toEqual(["kra-mask-unsupported", "kra-mask-unsupported", "kra-mask-read-failed"]);
      expect(result.unsupported[2]).toMatchObject({ scope: "resource", path: "layer[0].masks[0]" });
      expect(result.unsupported[2]!.message).toContain("CRC");
      expect(result.layers[0]!.masks.map((mask) => mask.values !== null)).toEqual([false, true]);
      expect(result.layers[0]!.pixels).not.toBeNull();
    });

    it("같은 값 항목을 앞선 마스크가 이미 읽었다", async () => {
      const result = await importKra(
        buildKraFixture({
          layers: [
            {
              name: "base",
              tileFile: paint(0, 0, [1, 2, 3, 255]),
              masks: [
                { nodetype: "transparencymask", name: "a", attrs: { filename: "shared" }, valuesFile: halfMask },
                { nodetype: "transparencymask", name: "b", attrs: { filename: "shared" } },
              ],
            },
          ],
        }),
      );
      expect(codes(result.unsupported)).toEqual(["kra-mask-unsupported", "kra-mask-unsupported", "kra-mask-data-shared"]);
      expect(result.unsupported[2]).toMatchObject({ scope: "resource", path: "layer[0].masks[1]" });
      expect(result.layers[0]!.masks.map((mask) => mask.values !== null)).toEqual([true, false]);
    });

    it("레이어의 데이터 항목과 마스크의 값 항목이 같은 ZIP 항목이면 한 번만 읽는다 (두 순서 모두)", async () => {
      const { inflateRawSync } = await import("node:zlib");
      const countInflates = () => {
        const counts = new Map<string, number>();
        const inflateRaw: KraImportOptions["inflateRaw"] = async (compressed, context) => {
          counts.set(context.path, (counts.get(context.path) ?? 0) + 1);
          return new Uint8Array(inflateRawSync(compressed));
        };
        return { counts, inflateRaw };
      };
      // 마스크가 먼저: 레이어 B의 데이터 파일 이름이 마스크의 값 항목(X.pixelselection)과 같다
      const first = countInflates();
      const maskFirst = await importKra(
        buildKraFixture({
          layers: [
            { name: "A", tileFile: paint(0, 0, [1, 2, 3, 255]), masks: [{ nodetype: "transparencymask", name: "m", attrs: { filename: "X" }, valuesFile: halfMask }] },
            { name: "B", attrs: { filename: "X.pixelselection" }, tileFile: null, defaultPixel: null },
          ],
        }),
        { inflateRaw: first.inflateRaw },
      );
      // 레이어가 모두 먼저 풀리므로 B(공유 항목)가 먼저 읽고 마스크가 공유로 거부된다
      expect(codes(maskFirst.unsupported)).toContain("kra-mask-data-shared");
      expect(maskFirst.unsupported.find((issue) => issue.code === "kra-mask-data-shared")).toMatchObject({ scope: "resource", path: "layer[0].masks[0]" });
      expect(first.counts.get("doc/layers/X.pixelselection") ?? 0).toBeLessThanOrEqual(1);
      // 레이어가 먼저
      const second = countInflates();
      const layerFirst = await importKra(
        buildKraFixture({
          layers: [
            { name: "B", attrs: { filename: "X.pixelselection" }, tileFile: halfMask, defaultPixel: Uint8Array.of(0, 0, 0, 0) },
            { name: "A", tileFile: paint(0, 0, [1, 2, 3, 255]), masks: [{ nodetype: "transparencymask", name: "m", attrs: { filename: "X" } }] },
          ],
        }),
        { inflateRaw: second.inflateRaw },
      );
      expect(layerFirst.unsupported.find((issue) => issue.code === "kra-mask-data-shared")).toMatchObject({ scope: "resource", path: "layer[1].masks[0]" });
      expect(second.counts.get("doc/layers/X.pixelselection")).toBe(1);
    });

    it("마지막에 해석하지 않은 바이트가 남으면 경고하고 값은 읽는다", async () => {
      const result = await importKra(
        build({
          nodetype: "transparencymask",
          name: "tm",
          valuesFile: buildKraTileFile({ pixelBytes: 1, tiles: [{ x: 0, y: 0, payload: kraTilePayload(solidTile([9]), 1) }], trailing: Uint8Array.of(1, 2, 3) }),
        }),
      );
      expect(result.warnings).toMatchObject([{ code: "kra-tile-trailing-bytes", scope: "container", path: "layer[0].masks[0]" }]);
      expect(result.warnings[0]!.message).toContain("3바이트");
      expect(result.layers[0]!.masks[0]!.values![0]).toBe(9);
    });
  });

  describe("한도", () => {
    const layers = [
      {
        name: "base",
        tileFile: paint(0, 0, [1, 2, 3, 255]),
        masks: [{ nodetype: "transparencymask", name: "tm", valuesFile: halfMask }],
      },
    ];

    it("마스크 출력도 전체 출력 예산에 청구한다 (경계 포함)", async () => {
      const layerBytes = 64 * 64 * 4;
      const maskBytes = 64 * 64;
      const ok = await importKra(buildKraFixture({ layers }), { limits: { maxDecodedBytes: layerBytes + maskBytes } });
      expect(ok.layers[0]!.masks[0]!.values).not.toBeNull();
      const over = await importKra(buildKraFixture({ layers }), { limits: { maxDecodedBytes: layerBytes + maskBytes - 1 } });
      expect(codes(over.unsupported)).toEqual(["kra-mask-unsupported", "kra-mask-limit-exceeded"]);
      expect(over.layers[0]!.masks[0]).toMatchObject({ values: null, defaultValue: null });
      expect(over.layers[0]!.pixels).not.toBeNull();
    });

    it("실패한 마스크의 청구도 환불하지 않는다", async () => {
      const bad = buildKraTileFile({ pixelBytes: 1, tiles: [{ x: 0, y: 0, payload: kraTilePayload(solidTile([1]), 1) }, { x: 64, y: 0, payload: Uint8Array.from([1, 0, 1]) }] });
      const result = await importKra(
        buildKraFixture({
          layers: [
            {
              name: "base",
              masks: [
                { nodetype: "transparencymask", name: "bad", valuesFile: bad },
                { nodetype: "transparencymask", name: "good", valuesFile: halfMask },
              ],
            },
          ],
        }),
        { limits: { maxDecodedBytes: 128 * 64 + 64 * 64 - 1 } },
      );
      // 첫 마스크는 LZF가 깨져 실패하지만 128*64바이트를 청구했다. 남은 예산으로는 두 번째 마스크(4096)가 모자란다
      expect(codes(result.unsupported)).toEqual(["kra-mask-unsupported", "kra-mask-unsupported", "kra-mask-decode-failed", "kra-mask-limit-exceeded"]);
    });

    it("레이어 픽셀을 모두 먼저 풀고 마스크 값은 그 뒤에 푼다: 앞선 노드의 마스크가 뒤쪽 레이어의 예산을 쓰지 않는다", async () => {
      const layerBytes = 64 * 64 * 4;
      const two = [
        { name: "A", tileFile: paint(0, 0, [1, 2, 3, 255]), masks: [{ nodetype: "selectionmask", name: "sm", valuesFile: halfMask }] },
        { name: "B", tileFile: paint(0, 0, [4, 5, 6, 255]) },
      ];
      // 예산이 레이어 둘뿐이면 마스크가 밀려난다. 레이어는 둘 다 풀린다
      const tight = await importKra(buildKraFixture({ layers: two }), { limits: { maxDecodedBytes: 2 * layerBytes } });
      expect(tight.layers.map((layer) => layer.pixels !== null)).toEqual([true, true]);
      expect(codes(tight.unsupported)).toEqual(["kra-mask-unsupported", "kra-mask-limit-exceeded"]);
      expect(tight.unsupported[1]).toMatchObject({ path: "layer[0].masks[0]" });
      expect(tight.layers[0]!.masks[0]).toMatchObject({ values: null, defaultValue: null });
      // 마스크 몫이 남으면 읽는다(경계 포함)
      const roomy = await importKra(buildKraFixture({ layers: two }), { limits: { maxDecodedBytes: 2 * layerBytes + 64 * 64 } });
      expect(roomy.layers[0]!.masks[0]!.values).not.toBeNull();
      expect(codes(roomy.unsupported)).toEqual(["kra-mask-unsupported"]);
      // 레이어가 예산을 넘으면 이전과 같이 뒤쪽 레이어가 밀려나고 마스크도 읽지 못한다
      const starved = await importKra(buildKraFixture({ layers: two }), { limits: { maxDecodedBytes: layerBytes } });
      expect(starved.layers.map((layer) => layer.pixels !== null)).toEqual([true, false]);
      expect(codes(starved.unsupported)).toEqual(["kra-mask-unsupported", "kra-layer-limit-exceeded", "kra-mask-limit-exceeded"]);
    });

    it("호출자가 낮춘 한도(타일 수, 타일 크기, 픽셀 바이트)가 마스크 값 파일에도 적용된다", async () => {
      const twoTiles = buildKraMaskTileFile([
        { x: 0, y: 0, values: () => 9 },
        { x: 64, y: 0, values: () => 9 },
      ]);
      const doc = buildKraFixture({
        layers: [{ name: "base", tileFile: paint(0, 0, [1, 2, 3, 255]), masks: [{ nodetype: "transparencymask", name: "tm", valuesFile: twoTiles }] }],
      });
      const tiles = await importKra(doc, { limits: { maxTilesPerLayer: 1 } });
      expect(tiles.unsupported.map((issue) => [issue.code, issue.path])).toEqual([
        ["kra-mask-unsupported", "layer[0].masks[0]"],
        ["kra-mask-limit-exceeded", "layer[0].masks[0]"],
      ]);
      expect(tiles.layers[0]!.masks[0]!.values).toBeNull();
      expect((await importKra(doc, { limits: { maxTilesPerLayer: 2 } })).layers[0]!.masks[0]!.values).not.toBeNull();
      const side = await importKra(doc, { limits: { maxTileSide: 32 } });
      expect(codes(side.unsupported)).toEqual(["kra-mask-unsupported", "kra-layer-limit-exceeded", "kra-mask-limit-exceeded"]); // 레이어 타일(64)도 한도 밖이다
      expect((await importKra(doc, { limits: { maxTileSide: 64 } })).layers[0]!.masks[0]!.values).not.toBeNull();
      // 픽셀 바이트 한도 0: 레이어 타일(4바이트)과 마스크 타일(1바이트) 둘 다 한도 밖이다
      const none = await importKra(doc, { limits: { maxPixelBytes: 0 } });
      expect(codes(none.unsupported)).toEqual(["kra-mask-unsupported", "kra-layer-decode-failed", "kra-mask-limit-exceeded"]);
      // 한도 1: 마스크 타일은 읽고 레이어 타일만 포기한다
      const one = await importKra(doc, { limits: { maxPixelBytes: 1 } });
      expect(codes(one.unsupported)).toEqual(["kra-mask-unsupported", "kra-layer-decode-failed"]);
      expect(one.layers[0]!.pixels).toBeNull();
      expect(one.layers[0]!.masks[0]!.values).not.toBeNull();
    });

    it("기본 타일 수 상한(65,536)을 넘게 선언한 마스크 값 파일은 레코드를 읽기 전에 포기한다", async () => {
      const docOf = (declaredCount: number) =>
        buildKraFixture({
          layers: [{ name: "base", masks: [{ nodetype: "transparencymask", name: "tm", valuesFile: buildKraTileFile({ pixelBytes: 1, tiles: [], declaredCount }) }] }],
        });
      const over = await importKra(docOf(65_537));
      expect(codes(over.unsupported)).toEqual(["kra-mask-unsupported", "kra-mask-limit-exceeded"]);
      expect(over.unsupported[1]!.message).toContain("65536");
      // 상한과 같으면 한도는 통과하고 레코드가 없다는 오류가 난다
      const at = await importKra(docOf(65_536));
      expect(codes(at.unsupported)).toEqual(["kra-mask-unsupported", "kra-mask-decode-failed"]);
    });

    it("마스크 출력 픽셀이 maxLayerPixels를 넘으면 그 마스크만 포기한다 (경계 포함)", async () => {
      const make = () => buildKraFixture({ layers: [{ name: "base", masks: [{ nodetype: "transparencymask", name: "tm", valuesFile: halfMask }] }] });
      const ok = await importKra(make(), { limits: { maxLayerPixels: 64 * 64 } });
      expect(ok.layers[0]!.masks[0]!.values).not.toBeNull();
      const over = await importKra(make(), { limits: { maxLayerPixels: 64 * 64 - 1 } });
      expect(codes(over.unsupported)).toEqual(["kra-mask-unsupported", "kra-mask-limit-exceeded"]);
    });
  });

  describe("중단", () => {
    it("타일 64개마다 중단 신호를 확인한다", async () => {
      const countReads = async (tiles: number): Promise<number> => {
        let reads = 0;
        const signal = {
          get aborted() {
            reads += 1;
            return false;
          },
        } as unknown as AbortSignal;
        const valuesFile = buildKraMaskTileFile(Array.from({ length: tiles }, (_, index) => ({ x: (index % 16) * 64, y: Math.floor(index / 16) * 64, values: () => 5 })));
        await importKra(buildKraFixture({ stored: true, width: 1024, height: 512, layers: [{ name: "a", masks: [{ nodetype: "transparencymask", name: "tm", valuesFile }] }] }), { signal });
        return reads;
      };
      const base = await countReads(1);
      expect(await countReads(63)).toBe(base);
      expect(await countReads(64)).toBe(base + 1);
      expect(await countReads(129)).toBe(base + 2);
    });

    it("마스크가 많은 한 레이어도 일정 시간마다 이벤트 루프에 양보해 중단 신호가 실행된다", async () => {
      const valuesFile = buildKraMaskTileFile(
        Array.from({ length: 64 }, (_, index) => ({ x: (index % 8) * 64, y: Math.floor(index / 8) * 64, values: (x: number, y: number) => (x + y) & 0xff })),
      );
      const masks = Array.from({ length: 150 }, (_, index) => ({ nodetype: "transparencymask", name: `m${index}`, valuesFile }));
      const bytes = buildKraFixture({ stored: true, width: 512, height: 512, layers: [{ name: "a", masks }] });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5);
      // WebCrypto 해시는 이벤트 루프를 한 바퀴 돌아서, 마스크 루프가 양보하지 않아도 신호가 먼저 실행된다. 순수 구현으로 해시해
      // 이 시험이 마스크 루프의 양보만 확인하게 한다.
      vi.stubGlobal("crypto", undefined);
      try {
        let code: string | null = "none";
        try {
          await importKra(bytes, { signal: controller.signal });
        } catch (error) {
          code = error instanceof KraError ? error.code : null;
        }
        expect(code).toBe("aborted");
      } finally {
        clearTimeout(timer);
        vi.unstubAllGlobals();
      }
    });

    it("마스크를 조립하는 도중의 중단 신호는 디코드 실패로 삼키지 않고 aborted로 끝난다", async () => {
      const bytesFor = (tiles: number) =>
        buildKraFixture({
          stored: true,
          width: 1024,
          height: 512,
          layers: [
            {
              name: "a",
              masks: [
                {
                  nodetype: "transparencymask",
                  name: "tm",
                  valuesFile: buildKraMaskTileFile(Array.from({ length: tiles }, (_, index) => ({ x: (index % 16) * 64, y: Math.floor(index / 16) * 64, values: () => 5 }))),
                },
              ],
            },
          ],
        });
      let reads = 0;
      await importKra(bytesFor(1), {
        signal: {
          get aborted() {
            reads += 1;
            return false;
          },
        } as unknown as AbortSignal,
      });
      const before = reads;
      // 64번째 타일 뒤의 점검 한 번에서만 신호가 중단으로 보인다(그 뒤에는 다시 false): 점검의 예외를 삼키면 가져오기가 정상 종료한다
      let seen = 0;
      const oneShot = {
        get aborted() {
          seen += 1;
          return seen === before + 1;
        },
      } as unknown as AbortSignal;
      let code: string | null = "none";
      try {
        await importKra(bytesFor(64), { signal: oneShot });
      } catch (error) {
        code = error instanceof KraError ? error.code : null;
      }
      expect(code).toBe("aborted");
    });

    it("마스크 값을 읽는 도중 중단되면 읽기 실패로 삼키지 않고 aborted로 끝난다", async () => {
      const controller = new AbortController();
      const { inflateRawSync } = await import("node:zlib");
      const inflateRaw: KraImportOptions["inflateRaw"] = async (compressed, context) => {
        if (context.path.endsWith(".pixelselection")) controller.abort();
        return new Uint8Array(inflateRawSync(compressed));
      };
      const bytes = buildKraFixture({ layers: [{ name: "a", masks: [{ nodetype: "transparencymask", name: "tm", valuesFile: halfMask }] }] });
      let code: string | null = null;
      try {
        await importKra(bytes, { signal: controller.signal, inflateRaw });
      } catch (error) {
        code = error instanceof KraError ? error.code : null;
      }
      expect(code).toBe("aborted");
    });
  });
});
