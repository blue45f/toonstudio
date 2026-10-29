import { describe, expect, it } from "vitest";

import {
  ByteWriter,
  TYPE,
  buildAsepriteFixture,
  celChunk,
  celExtraChunk,
  chunk,
  layerChunk,
  oldPaletteChunk,
  paletteChunk,
  zlibBytes,
  frameOf,
  spriteOf,
  richAsepriteSpec,
  RICH_RAW_2X2,
  RICH_PIXELS_3X2,
  type FixtureSpec,
} from "../../../../tests/corpus/formats/aseprite-fixtures";
import {
  asepriteCelToRgba8,
  asepritePaletteAtFrame,
  importAsepriteSprite,
  orderAsepriteFrameCels,
  resolveAsepriteLinkedCel,
  type AsepriteSpriteImportOptions,
  type AsepriteSpriteImportResult,
} from "../aseprite-sprite";

function codes(issues: readonly { readonly code: string }[]): string[] {
  return issues.map((entry) => entry.code);
}

async function importSpec(spec: FixtureSpec, options?: AsepriteSpriteImportOptions): Promise<AsepriteSpriteImportResult> {
  return importAsepriteSprite(buildAsepriteFixture(spec), options);
}


describe("Aseprite 셀과 픽셀", () => {
  it("원시·압축 셀의 픽셀을 원본 색 형식 그대로 돌려준다", async () => {
    const result = await importAsepriteSprite(buildAsepriteFixture(richAsepriteSpec()));

    expect(result.cels).toHaveLength(5);
    const [raw, compressed, linked, secondRaw] = result.cels;
    expect(raw).toMatchObject({ frameIndex: 0, layerIndex: 0, kind: "image", width: 2, height: 2, x: 0, y: 0, opacity: 255, zIndex: 0 });
    expect(raw!.pixels).toEqual(RICH_RAW_2X2);
    expect(compressed).toMatchObject({ frameIndex: 0, layerIndex: 2, x: -1, y: 1, opacity: 200, zIndex: 1, width: 3, height: 2 });
    expect(compressed!.pixels).toEqual(RICH_PIXELS_3X2);
    expect(linked).toMatchObject({ frameIndex: 1, layerIndex: 0, kind: "linked", linkedFrame: 0, width: null, height: null, pixels: null });
    expect(Array.from(secondRaw!.pixels!)).toEqual([9, 8, 7, 6]);
    expect(result.warnings).toEqual([]);
    expect(result.unsupported).toEqual([]);
  });

  it("decodePixels=false이면 구조만 읽고 픽셀은 해제하지 않는다", async () => {
    let inflateCalls = 0;
    const result = await importAsepriteSprite(buildAsepriteFixture(richAsepriteSpec()), {
      decodePixels: false,
      inflate: async () => {
        inflateCalls += 1;
        return new Uint8Array(0);
      },
    });

    expect(inflateCalls).toBe(0);
    expect(result.cels).toHaveLength(5);
    expect(result.cels.every((cel) => cel.pixels === null)).toBe(true);
    expect(result.cels[1]).toMatchObject({ kind: "image", width: 3, height: 2 });
  });

  it("셀 엑스트라는 직전 셀에만 붙고 16.16 고정소수점 경계를 돌려준다", async () => {
    const result = await importAsepriteSprite(buildAsepriteFixture(richAsepriteSpec()));

    expect(result.cels[1]!.preciseBounds).toEqual({ x: 0.5, y: 1.25, width: 2.5, height: 1.75 });
    expect(result.cels[0]!.preciseBounds).toBeNull();
  });

  it("셀 바로 뒤가 아닌 셀 엑스트라는 경고하고 버린다", async () => {
    const result = await importSpec(
      spriteOf([frameOf([layerChunk({ name: "L" }), celExtraChunk({ x: 1, y: 1, width: 1, height: 1 })])]),
    );

    expect(codes(result.warnings)).toEqual(["aseprite-cel-extra-orphan"]);
    expect(result.cels).toEqual([]);
  });

  it("셀 엑스트라의 플래그 0은 정밀 경계 없음으로 읽는다", async () => {
    const result = await importSpec(
      spriteOf([
        frameOf([
          layerChunk({ name: "L" }),
          celChunk({ layer: 0, body: { kind: "raw", width: 1, height: 1, pixels: Uint8Array.of(1, 2, 3, 4) } }),
          celExtraChunk(null),
        ]),
      ]),
    );

    expect(result.cels[0]!.preciseBounds).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it("링크 셀을 같은 레이어의 이전 프레임 셀로 따라간다", async () => {
    const result = await importAsepriteSprite(buildAsepriteFixture(richAsepriteSpec()));
    const chain = result.cels.find((cel) => cel.frameIndex === 2)!;

    expect(chain.linkedFrame).toBe(1);
    // 프레임 2 → 프레임 1(링크) → 프레임 0(실제 셀)
    expect(resolveAsepriteLinkedCel(result, chain)).toBe(result.cels[0]);
    expect(resolveAsepriteLinkedCel(result, result.cels[0]!)).toBe(result.cels[0]);
  });

  it("같은 자리에 셀이 둘이면 먼저 나온 셀로 해석하고 셀 배열이 바뀌어도 새 배열 기준으로 찾는다", async () => {
    const raw = (value: number) => celChunk({ layer: 0, body: { kind: "raw", width: 1, height: 1, pixels: Uint8Array.of(value, 0, 0, 0) } });
    const result = await importSpec(
      spriteOf([
        frameOf([layerChunk({ name: "L" }), raw(1), raw(2)]),
        frameOf([celChunk({ layer: 0, body: { kind: "linked", frame: 0 } })]),
      ]),
    );
    const linked = result.cels[2]!;

    expect(resolveAsepriteLinkedCel(result, linked)).toBe(result.cels[0]);
    // 순서를 바꾼 다른 배열에서는 그 배열에서 먼저 나온 셀이다.
    const reordered = { cels: [result.cels[1]!, result.cels[0]!, linked] };
    expect(resolveAsepriteLinkedCel(reordered, linked)).toBe(result.cels[1]);
  });

  it("앞으로 향하거나 없는 셀을 가리키는 링크는 unsupported로 보고하고 해석하지 않는다", async () => {
    const result = await importSpec(
      spriteOf([
        frameOf([layerChunk({ name: "L" }), celChunk({ layer: 0, body: { kind: "linked", frame: 1 } })]),
        frameOf([celChunk({ layer: 0, body: { kind: "linked", frame: 5 } })]),
        frameOf([celChunk({ layer: 0, body: { kind: "linked", frame: 2 } })]),
      ]),
    );

    // 앞 프레임을 가리키는 것만 유효하다: 뒤 프레임, 존재하지 않는 프레임, 자기 자신.
    expect(codes(result.unsupported)).toEqual(new Array(3).fill("aseprite-cel-link-invalid"));
    for (const cel of result.cels) expect(resolveAsepriteLinkedCel(result, cel)).toBeNull();
  });

  it("존재하지 않는 레이어를 가리키는 셀은 unsupported로 보고하고 셀은 남긴다", async () => {
    const result = await importSpec(
      spriteOf([frameOf([layerChunk({ name: "L" }), celChunk({ layer: 9, body: { kind: "raw", width: 1, height: 1, pixels: Uint8Array.of(1, 2, 3, 4) } })])]),
    );

    expect(codes(result.unsupported)).toEqual(["aseprite-cel-layer-missing"]);
    expect(result.cels).toHaveLength(1);
  });

  it("그룹 레이어 위의 셀과 레이어 종류가 맞지 않는 셀을 경고한다", async () => {
    const tilemapCel = celChunk({
      layer: 0,
      body: { kind: "tilemap", widthTiles: 1, heightTiles: 1, tiles: Uint8Array.of(1, 0, 0, 0) },
    });
    const imageCel = celChunk({ layer: 1, body: { kind: "raw", width: 1, height: 1, pixels: Uint8Array.of(1, 2, 3, 4) } });
    const groupCel = celChunk({ layer: 2, body: { kind: "raw", width: 1, height: 1, pixels: Uint8Array.of(1, 2, 3, 4) } });
    const result = await importSpec(
      spriteOf([
        frameOf([
          layerChunk({ name: "image" }),
          layerChunk({ name: "tiles", type: 2, tilesetIndex: 0 }),
          layerChunk({ name: "group", type: 1 }),
          tilemapCel,
          imageCel,
          groupCel,
        ]),
      ]),
    );

    expect(codes(result.warnings)).toEqual(["aseprite-cel-kind-mismatch", "aseprite-cel-kind-mismatch", "aseprite-cel-on-group-layer"]);
  });

  it("알 수 없는 셀 타입은 unsupported로 보고하고 다음 셀은 계속 읽는다", async () => {
    const result = await importSpec(
      spriteOf([
        frameOf([
          layerChunk({ name: "L" }),
          celChunk({ layer: 0, body: { kind: "unknown", type: 9, data: Uint8Array.of(1, 2, 3) } }),
          celChunk({ layer: 0, body: { kind: "raw", width: 1, height: 1, pixels: Uint8Array.of(5, 6, 7, 8) } }),
        ]),
      ]),
    );

    expect(codes(result.unsupported)).toEqual(["aseprite-cel-type-unsupported"]);
    expect(result.cels.map((cel) => cel.kind)).toEqual(["unknown", "image"]);
    expect(Array.from(result.cels[1]!.pixels!)).toEqual([5, 6, 7, 8]);
  });

  it("그리기 순서는 layerIndex+zIndex 오름차순이고 같으면 zIndex가 작은 쪽이 먼저다", async () => {
    const cel = (layer: number, z: number) => celChunk({ layer, z, body: { kind: "raw", width: 1, height: 1, pixels: Uint8Array.of(layer, z, 0, 0) } });
    const result = await importSpec(
      spriteOf([
        frameOf([
          layerChunk({ name: "l0" }),
          layerChunk({ name: "l1" }),
          layerChunk({ name: "l2" }),
          cel(0, 2), // 합 2
          cel(1, 0), // 합 1
          cel(2, -2), // 합 0
          cel(1, 1), // 합 2, z가 더 작은 (0,2)보다 늦다
        ]),
      ]),
    );

    const ordered = orderAsepriteFrameCels(result.cels).map((entry) => [entry.layerIndex, entry.zIndex]);
    expect(ordered).toEqual([[2, -2], [1, 0], [1, 1], [0, 2]]);
    // 입력 배열은 바꾸지 않는다.
    expect(result.cels.map((entry) => entry.layerIndex)).toEqual([0, 1, 2, 1]);
  });
});

describe("Aseprite 픽셀 해제 실패와 예산", () => {
  const solid = (width: number, height: number) => new Uint8Array(width * height * 4).fill(7);
  const celOf = (width: number, height: number, extra: { readonly compressedOverride?: Uint8Array } = {}) =>
    celChunk({ layer: 0, body: { kind: "compressed", width, height, pixels: solid(width, height), ...extra } });

  it("손상된 zlib 스트림은 그 셀만 unsupported로 보고하고 다른 셀은 해제한다", async () => {
    const result = await importSpec(
      spriteOf([
        frameOf([
          layerChunk({ name: "L" }),
          celOf(2, 2, { compressedOverride: Uint8Array.of(0x78, 0x9c, 1, 2, 3, 4, 5) }),
          celOf(1, 1),
        ]),
      ]),
    );

    expect(codes(result.unsupported)).toEqual(["aseprite-pixels-decode-failed"]);
    expect(result.cels[0]!.pixels).toBeNull();
    expect(result.cels[1]!.pixels).toEqual(solid(1, 1));
  });

  it("해제 결과가 선언한 크기보다 짧거나 길면 실패로 보고한다", async () => {
    const short = zlibBytes(new Uint8Array(15).fill(1));
    const long = zlibBytes(new Uint8Array(17).fill(1));
    const result = await importSpec(
      spriteOf([frameOf([layerChunk({ name: "L" }), celOf(2, 2, { compressedOverride: short }), celOf(2, 2, { compressedOverride: long })])]),
    );

    expect(codes(result.unsupported)).toEqual(["aseprite-pixels-decode-failed", "aseprite-pixels-decode-failed"]);
    expect(result.cels.every((cel) => cel.pixels === null)).toBe(true);
  });

  it("선언한 해제 크기가 항목당 한도를 넘으면 해제하지 않는다", async () => {
    // 4,000,000바이트가 0으로 채워진 스트림은 수 KB로 압축된다.
    const bomb = zlibBytes(new Uint8Array(4_000_000));
    let inflateCalls = 0;
    const result = await importSpec(
      spriteOf([frameOf([layerChunk({ name: "L" }), celOf(1000, 1000, { compressedOverride: bomb })])]),
      {
        limits: { maxCelDecodedBytes: 1_000_000 },
        inflate: async () => {
          inflateCalls += 1;
          return new Uint8Array(0);
        },
      },
    );

    expect(bomb.byteLength).toBeLessThan(10_000);
    expect(inflateCalls).toBe(0);
    expect(codes(result.unsupported)).toEqual(["aseprite-decode-budget-exceeded"]);
    expect(result.cels[0]!.pixels).toBeNull();
  });

  it("기본 한도보다 큰 선언 크기는 할당 없이 거부하고 파일은 계속 읽는다", async () => {
    const result = await importSpec(
      spriteOf([
        frameOf([
          layerChunk({ name: "L" }),
          celChunk({ layer: 0, body: { kind: "compressed", width: 65_535, height: 65_535, pixels: new Uint8Array(0), compressedOverride: Uint8Array.of(0x78, 0x9c) } }),
          celChunk({ layer: 0, body: { kind: "raw", width: 1, height: 1, pixels: Uint8Array.of(1, 2, 3, 4) } }),
        ]),
      ]),
    );

    expect(codes(result.unsupported)).toEqual(["aseprite-decode-budget-exceeded"]);
    expect(result.cels[1]!.pixels).toEqual(Uint8Array.of(1, 2, 3, 4));
  });

  it("선언 크기가 한도와 정확히 같으면 해제하고 1바이트라도 넘으면 거부한다", async () => {
    const one = spriteOf([frameOf([layerChunk({ name: "L" }), celOf(2, 2)])]);
    const two = spriteOf([frameOf([layerChunk({ name: "L" }), celOf(2, 2), celOf(2, 2)])]);

    const exactItem = await importSpec(one, { limits: { maxCelDecodedBytes: 16 } });
    const overItem = await importSpec(one, { limits: { maxCelDecodedBytes: 15 } });
    const exactTotal = await importSpec(two, { limits: { maxTotalDecodedBytes: 32 } });
    const overTotal = await importSpec(two, { limits: { maxTotalDecodedBytes: 31 } });

    expect(exactItem.cels[0]!.pixels).toHaveLength(16);
    expect(exactItem.unsupported).toEqual([]);
    expect(codes(overItem.unsupported)).toEqual(["aseprite-decode-budget-exceeded"]);
    expect(exactTotal.cels.map((cel) => cel.pixels !== null)).toEqual([true, true]);
    expect(overTotal.cels.map((cel) => cel.pixels !== null)).toEqual([true, false]);
  });

  it("모든 셀의 해제 합계 예산을 넘으면 이후 셀의 픽셀은 해제하지 않는다", async () => {
    const result = await importSpec(
      spriteOf([frameOf([layerChunk({ name: "L" }), celOf(100, 100), celOf(100, 100), celOf(10, 10)])]),
      { limits: { maxTotalDecodedBytes: 50_000 } },
    );

    // 40,000 + 40,000 > 50,000, 그 다음 400바이트는 예산이 남아 있어도 이미 소진한 예산 뒤의 순서대로 처리한다.
    expect(result.cels[0]!.pixels).toHaveLength(40_000);
    expect(result.cels[1]!.pixels).toBeNull();
    expect(result.cels[2]!.pixels).toHaveLength(400);
    expect(codes(result.unsupported)).toEqual(["aseprite-decode-budget-exceeded"]);
  });

  it("inflate 어댑터를 주입할 수 있고 잘못된 길이나 예외는 실패로 보고한다", async () => {
    const spec = spriteOf([frameOf([layerChunk({ name: "L" }), celOf(2, 2), celOf(2, 2), celOf(2, 2), celOf(2, 2)])]);
    const calls: Array<{ readonly compressedBytes: number; readonly expected: number }> = [];
    let mode = 0;
    const result = await importSpec(spec, {
      inflate: async (compressed, expected) => {
        calls.push({ compressedBytes: compressed.byteLength, expected });
        mode += 1;
        if (mode === 1) return new Uint8Array(expected).fill(3);
        if (mode === 2) return new Uint8Array(expected - 1);
        if (mode === 3) throw new Error("어댑터 실패");
        return "bad" as unknown as Uint8Array;
      },
    });

    expect(calls.map((call) => call.expected)).toEqual([16, 16, 16, 16]);
    expect(result.cels[0]!.pixels).toEqual(new Uint8Array(16).fill(3));
    expect(result.cels.slice(1).every((cel) => cel.pixels === null)).toBe(true);
    expect(codes(result.unsupported)).toEqual(new Array(3).fill("aseprite-pixels-decode-failed"));
  });
});

describe("asepriteCelToRgba8", () => {
  const palette = [
    { r: 10, g: 20, b: 30, a: 255 },
    { r: 40, g: 50, b: 60, a: 200 },
  ];

  it("RGBA는 그대로, 회색은 (값,값,값,알파)로 바꾼다", () => {
    const rgba = asepriteCelToRgba8({ pixels: Uint8Array.of(1, 2, 3, 4), width: 1, height: 1, colorDepth: 32, palette: [], transparentIndex: 0, isBackgroundLayer: false });
    const gray = asepriteCelToRgba8({ pixels: Uint8Array.of(100, 255, 7, 8), width: 2, height: 1, colorDepth: 16, palette: [], transparentIndex: 0, isBackgroundLayer: false });

    expect(Array.from(rgba.rgba)).toEqual([1, 2, 3, 4]);
    expect(Array.from(gray.rgba)).toEqual([100, 100, 100, 255, 7, 7, 7, 8]);
  });

  it("인덱스드는 팔레트를 조회하고 투명 인덱스는 배경이 아닌 레이어에서만 투명이다", () => {
    const params = { pixels: Uint8Array.of(0, 1, 2, 1), width: 4, height: 1, colorDepth: 8 as const, palette, transparentIndex: 0 };
    const layer = asepriteCelToRgba8({ ...params, isBackgroundLayer: false });
    const background = asepriteCelToRgba8({ ...params, isBackgroundLayer: true });

    expect(Array.from(layer.rgba)).toEqual([0, 0, 0, 0, 40, 50, 60, 200, 0, 0, 0, 0, 40, 50, 60, 200]);
    expect(layer.outOfRangePaletteIndexCount).toBe(1);
    expect(Array.from(background.rgba.subarray(0, 4))).toEqual([10, 20, 30, 255]);
    expect(background.outOfRangePaletteIndexCount).toBe(1);
  });

  it("픽셀 길이가 폭×높이×바이트와 다르면 RangeError를 던진다", () => {
    expect(() =>
      asepriteCelToRgba8({ pixels: new Uint8Array(3), width: 1, height: 1, colorDepth: 32, palette: [], transparentIndex: 0, isBackgroundLayer: false }),
    ).toThrow(RangeError);
  });
});

describe("Aseprite 팔레트", () => {
  const colors4 = [
    [0, 0, 0, 0],
    [255, 0, 0, 255],
    [0, 255, 0, 255, "green"],
    [0, 0, 255, 128],
  ] as const;

  it("새 팔레트 청크의 색, 알파, 이름을 읽는다", async () => {
    const result = await importSpec(spriteOf([frameOf([paletteChunk({ size: 4, first: 0, colors: colors4 })])], { depth: 8 }));

    expect(result.paletteUpdates).toHaveLength(1);
    expect(result.paletteUpdates[0]).toMatchObject({ frameIndex: 0, source: "new", declaredSize: 4 });
    expect(result.paletteUpdates[0]!.entries).toEqual([
      { index: 0, r: 0, g: 0, b: 0, a: 0, name: null },
      { index: 1, r: 255, g: 0, b: 0, a: 255, name: null },
      { index: 2, r: 0, g: 255, b: 0, a: 255, name: "green" },
      { index: 3, r: 0, g: 0, b: 255, a: 128, name: null },
    ]);
  });

  it("프레임별 팔레트 갱신을 시점별로 적용하고 선언한 전체 크기에 맞춘다", async () => {
    const result = await importSpec(
      spriteOf(
        [
          frameOf([paletteChunk({ size: 4, first: 0, colors: colors4 })]),
          frameOf([]),
          frameOf([paletteChunk({ size: 2, first: 1, colors: [[10, 20, 30, 255]] })]),
          frameOf([paletteChunk({ size: 6, first: 4, colors: [[1, 1, 1, 255]] })]),
        ],
        { depth: 8 },
      ),
    );
    const at = (frame: number) => asepritePaletteAtFrame(result, frame).map((c) => [c.r, c.g, c.b, c.a]);

    expect(at(0)).toEqual([[0, 0, 0, 0], [255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 128]]);
    expect(at(1)).toEqual(at(0));
    expect(at(2)).toEqual([[0, 0, 0, 0], [10, 20, 30, 255]]);
    // 크기를 6으로 늘리면 새 인덱스 4에 값이 들어가고 비어 있던 인덱스 2·3은 불투명 검정이다.
    expect(at(3)).toEqual([[0, 0, 0, 0], [10, 20, 30, 255], [0, 0, 0, 255], [0, 0, 0, 255], [1, 1, 1, 255], [0, 0, 0, 255]]);
  });

  it("새 팔레트 청크가 하나라도 있으면 구 팔레트 청크는 무시한다", async () => {
    const result = await importSpec(
      spriteOf(
        [
          frameOf([oldPaletteChunk(0x0004, [{ skip: 0, colors: [[250, 250, 250]] }])]),
          frameOf([paletteChunk({ size: 1, first: 0, colors: [[1, 2, 3, 255]] })]),
        ],
        { depth: 8 },
      ),
    );

    expect(asepritePaletteAtFrame(result, 0)).toEqual([]);
    expect(asepritePaletteAtFrame(result, 1)).toEqual([{ r: 1, g: 2, b: 3, a: 255 }]);
  });

  it("구 팔레트는 패킷의 건너뛰기를 누적하고 색 수 0을 256으로 읽는다", async () => {
    const result = await importSpec(
      spriteOf(
        [
          frameOf([
            oldPaletteChunk(0x0004, [
              { skip: 2, colors: [[1, 2, 3], [4, 5, 6]] },
              { skip: 1, colors: [[7, 8, 9]] },
              { skip: 0, colors: Array.from({ length: 256 }, (_, i) => [i, 0, 0] as const) },
            ]),
          ]),
        ],
        { depth: 8 },
      ),
    );
    const entries = result.paletteUpdates[0]!.entries;

    expect(result.paletteUpdates[0]).toMatchObject({ source: "old-0004", declaredSize: null });
    expect(entries.slice(0, 3).map((entry) => [entry.index, entry.r, entry.g, entry.b, entry.a])).toEqual([
      [2, 1, 2, 3, 255],
      [3, 4, 5, 6, 255],
      [5, 7, 8, 9, 255],
    ]);
    expect(entries).toHaveLength(259);
    expect(entries.at(-1)).toMatchObject({ index: 261, r: 255 });
    // 새 팔레트가 없으면 구 팔레트가 시점별 팔레트가 된다. 건너뛴 인덱스는 불투명 검정이다.
    const palette = asepritePaletteAtFrame(result, 0);
    expect(palette).toHaveLength(262);
    expect(palette.slice(0, 4)).toEqual([
      { r: 0, g: 0, b: 0, a: 255 },
      { r: 0, g: 0, b: 0, a: 255 },
      { r: 1, g: 2, b: 3, a: 255 },
      { r: 4, g: 5, b: 6, a: 255 },
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("6비트 구 팔레트는 상위 비트를 복제해 8비트로 넓히고 경고한다", async () => {
    const result = await importSpec(
      spriteOf([frameOf([oldPaletteChunk(0x0011, [{ skip: 0, colors: [[0, 63, 32], [1, 2, 3]] }])])], { depth: 8 }),
    );
    const entries = result.paletteUpdates[0]!.entries;

    expect(result.paletteUpdates[0]!.source).toBe("old-0011");
    expect(entries.map((entry) => [entry.r, entry.g, entry.b])).toEqual([
      [0, 255, 130],
      [4, 8, 12],
    ]);
    expect(codes(result.warnings)).toEqual(["aseprite-palette-6bit-expanded"]);
  });

  it("끝 인덱스가 시작보다 작거나 크기가 한도를 넘는 팔레트 청크는 그 청크만 chunk-invalid다", async () => {
    const reversed = new ByteWriter().u32(4).u32(3).u32(1).zeros(8).toBytes();
    const result = await importSpec(
      spriteOf([frameOf([chunk(TYPE.palette, reversed), paletteChunk({ size: 1, first: 0, colors: [[1, 2, 3, 255]] })])], { depth: 8 }),
    );
    const tooBig = await importSpec(
      spriteOf([frameOf([paletteChunk({ size: 4, first: 0, colors: colors4 })])], { depth: 8 }),
      { limits: { maxPaletteEntries: 3 } },
    );

    expect(codes(result.unsupported)).toEqual(["aseprite-chunk-invalid"]);
    expect(result.paletteUpdates).toHaveLength(1);
    expect(codes(tooBig.unsupported)).toEqual(["aseprite-chunk-invalid"]);
    expect(tooBig.paletteUpdates).toEqual([]);
  });
});
