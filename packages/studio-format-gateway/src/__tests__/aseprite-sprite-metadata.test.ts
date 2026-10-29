import { describe, expect, it } from "vitest";

import {
  ByteWriter,
  TYPE,
  buildAsepriteFixture,
  celChunk,
  chunk,
  colorProfileChunk,
  externalFilesChunk,
  frameOf,
  layerChunk,
  paletteChunk,
  richAsepriteSpec,
  sliceChunk,
  spriteOf,
  tagsChunk,
  tilesetChunk,
  userDataChunk,
  zlibBytes,
  type FixtureProp,
  type FixtureSpec,
} from "../../../../tests/corpus/formats/aseprite-fixtures";
import {
  asepriteTileFields,
  asepriteTilemapValues,
  importAsepriteSprite,
  type AsepriteSpriteImportOptions,
  type AsepriteSpriteImportResult,
} from "../aseprite-sprite";

function codes(issues: readonly { readonly code: string }[]): string[] {
  return issues.map((entry) => entry.code);
}

async function importSpec(spec: FixtureSpec, options?: AsepriteSpriteImportOptions): Promise<AsepriteSpriteImportResult> {
  return importAsepriteSprite(buildAsepriteFixture(spec), options);
}

const ONE_PIXEL = Uint8Array.of(1, 2, 3, 4);

describe("Aseprite 태그", () => {
  it("범위·방향·반복·폐기된 색·이름을 읽고 사용자 데이터를 태그 순서대로 붙인다", async () => {
    const result = await importAsepriteSprite(buildAsepriteFixture(richAsepriteSpec()));

    expect(result.tags).toEqual([
      {
        from: 0,
        to: 1,
        direction: "ping-pong",
        directionValue: 2,
        repeat: 3,
        deprecatedColor: { r: 1, g: 2, b: 3 },
        name: "walk",
        userData: { flags: 3, text: "walk", color: { r: 255, g: 0, b: 0, a: 255 }, propertyMaps: null, propertiesError: null },
      },
      {
        from: 2,
        to: 2,
        direction: "forward",
        directionValue: 0,
        repeat: 0,
        deprecatedColor: { r: 0, g: 0, b: 0 },
        name: "idle",
        userData: { flags: 1, text: "idle", color: null, propertyMaps: null, propertiesError: null },
      },
    ]);
  });

  it("방향 값 4종을 이름으로 바꾸고 모르는 값은 unknown으로 두되 원래 값을 남긴다", async () => {
    const result = await importSpec(
      spriteOf([
        frameOf([
          tagsChunk([0, 1, 2, 3, 9].map((direction, index) => ({ from: index, to: index, direction, name: `t${direction}` }))),
        ]),
      ]),
    );

    expect(result.tags.map((tag) => [tag.direction, tag.directionValue])).toEqual([
      ["forward", 0],
      ["reverse", 1],
      ["ping-pong", 2],
      ["ping-pong-reverse", 3],
      ["unknown", 9],
    ]);
  });

  it("태그 수보다 많은 사용자 데이터는 orphan 경고로 남긴다", async () => {
    const result = await importSpec(
      spriteOf([
        frameOf([
          tagsChunk([{ from: 0, to: 0, name: "only" }]),
          userDataChunk({ text: "one" }),
          userDataChunk({ text: "extra" }),
        ]),
      ]),
    );

    expect(result.tags[0]!.userData?.text).toBe("one");
    expect(codes(result.warnings)).toEqual(["aseprite-user-data-orphan"]);
  });

  it("선언한 태그 수가 남은 바이트에 비해 크거나 한도를 넘으면 그 청크만 거부한다", async () => {
    const hostile = new ByteWriter().u16(60_000).zeros(8).toBytes();
    const hostileResult = await importSpec(spriteOf([frameOf([chunk(TYPE.tags, hostile), layerChunk({ name: "L" })])]));
    const limited = await importSpec(
      spriteOf([frameOf([tagsChunk([{ from: 0, to: 0, name: "a" }, { from: 1, to: 1, name: "b" }])])]),
      { limits: { maxTags: 1 } },
    );

    expect(codes(hostileResult.unsupported)).toEqual(["aseprite-chunk-invalid"]);
    expect(hostileResult.layers).toHaveLength(1);
    expect(codes(limited.unsupported)).toEqual(["aseprite-chunk-invalid"]);
    expect(limited.tags).toEqual([]);
  });
});

describe("Aseprite 최소 크기 항목", () => {
  it("이름이 빈 태그·외부 파일 항목과 최소 크기의 슬라이스 키도 선언한 개수만큼 읽는다", async () => {
    const result = await importSpec(
      spriteOf([
        frameOf([
          tagsChunk([{ from: 0, to: 0, name: "" }, { from: 1, to: 1, name: "" }]),
          externalFilesChunk([{ id: 1, type: 0, name: "" }, { id: 2, type: 1, name: "" }]),
          sliceChunk({ name: "", keys: [{ frame: 0, x: 0, y: 0, w: 1, h: 1 }, { frame: 1, x: 0, y: 0, w: 1, h: 1 }] }),
        ]),
      ]),
    );

    expect(result.unsupported).toEqual([]);
    expect(result.tags.map((tag) => tag.name)).toEqual(["", ""]);
    expect(result.externalFiles.map((entry) => entry.id)).toEqual([1, 2]);
    expect(result.slices[0]!.keys).toHaveLength(2);
  });
});

describe("Aseprite 슬라이스", () => {
  it("9패치와 피벗을 포함한 키를 읽고 사용자 데이터를 붙인다", async () => {
    const result = await importAsepriteSprite(buildAsepriteFixture(richAsepriteSpec()));

    expect(result.slices).toHaveLength(1);
    expect(result.slices[0]).toMatchObject({
      name: "hit",
      hasNinePatch: true,
      hasPivot: true,
      frameIndex: 0,
      keys: [{ frame: 0, x: 1, y: 1, width: 2, height: 2, center: { x: 0, y: 0, width: 1, height: 1 }, pivot: { x: 1, y: 1 } }],
      userData: { text: "slice note" },
    });
  });

  it("플래그가 없으면 center와 pivot은 null이고 음수 좌표와 여러 키를 읽는다", async () => {
    const result = await importSpec(
      spriteOf([
        frameOf([
          sliceChunk({
            name: "plain",
            keys: [
              { frame: 0, x: -5, y: -6, w: 7, h: 8 },
              { frame: 3, x: 1, y: 2, w: 3, h: 4 },
            ],
          }),
        ]),
      ]),
    );

    expect(result.slices[0]!.keys).toEqual([
      { frame: 0, x: -5, y: -6, width: 7, height: 8, center: null, pivot: null },
      { frame: 3, x: 1, y: 2, width: 3, height: 4, center: null, pivot: null },
    ]);
  });

  it("9패치 플래그와 피벗 플래그는 서로 독립이다", async () => {
    const keys = [{ frame: 0, x: 1, y: 2, w: 3, h: 4, center: [5, 6, 7, 8] as const, pivot: [9, 10] as const }];
    const result = await importSpec(
      spriteOf([frameOf([sliceChunk({ name: "nine", ninePatch: true, keys }), sliceChunk({ name: "pivot", pivot: true, keys })])]),
    );

    expect(result.slices[0]).toMatchObject({ hasNinePatch: true, hasPivot: false });
    expect(result.slices[0]!.keys[0]).toMatchObject({ center: { x: 5, y: 6, width: 7, height: 8 }, pivot: null });
    expect(result.slices[1]).toMatchObject({ hasNinePatch: false, hasPivot: true });
    expect(result.slices[1]!.keys[0]).toMatchObject({ center: null, pivot: { x: 9, y: 10 } });
  });

  it("키 수가 남은 바이트에 비해 지나치게 크면 메모리를 잡지 않고 그 청크만 거부한다", async () => {
    const hostile = new ByteWriter().u32(0xffff_ffff).u32(0).u32(0).string("s").toBytes();
    const result = await importSpec(spriteOf([frameOf([chunk(TYPE.slice, hostile), layerChunk({ name: "L" })])]));

    expect(codes(result.unsupported)).toEqual(["aseprite-chunk-invalid"]);
    expect(result.slices).toEqual([]);
    expect(result.layers).toHaveLength(1);
  });
});

describe("Aseprite 타일셋과 타일맵", () => {
  it("파일 안의 타일 이미지를 원본 색 형식으로 해제한다", async () => {
    const pixels = Uint8Array.from({ length: 2 * 2 * 2 * 4 }, (_, index) => (index * 5) & 0xff);
    const result = await importSpec(
      spriteOf([frameOf([tilesetChunk({ id: 3, tileCount: 2, tileWidth: 2, tileHeight: 2, name: "tiles", baseIndex: 0, pixels })])]),
    );

    expect(result.tilesets).toHaveLength(1);
    expect(result.tilesets[0]).toMatchObject({
      id: 3,
      flags: 2,
      tileCount: 2,
      tileWidth: 2,
      tileHeight: 2,
      baseIndex: 0,
      name: "tiles",
      externalLink: null,
      frameIndex: 0,
    });
    expect(result.tilesets[0]!.tilePixels).toEqual(pixels);
  });

  it("타일 번호의 기준 값은 음수도 부호 있는 값으로 읽는다", async () => {
    const result = await importSpec(
      spriteOf([frameOf([tilesetChunk({ id: 0, tileCount: 1, tileWidth: 1, tileHeight: 1, name: "t", flags: 0, baseIndex: -3 })])]),
    );

    expect(result.tilesets[0]!.baseIndex).toBe(-3);
  });

  it("외부 파일만 가리키는 타일셋은 링크를 남기고 이미지는 null이다", async () => {
    const result = await importSpec(
      spriteOf([frameOf([tilesetChunk({ id: 1, tileCount: 4, tileWidth: 8, tileHeight: 8, name: "ext", external: [7, 9] })])]),
    );

    expect(result.tilesets[0]).toMatchObject({ externalLink: { fileId: 7, tilesetId: 9 }, tilePixels: null, flags: 1 });
  });

  it("타일셋 사용자 데이터 뒤의 데이터는 타일 번호 순으로 붙고 타일 수를 넘으면 경고한다", async () => {
    const result = await importSpec(
      spriteOf([
        frameOf([
          tilesetChunk({ id: 0, tileCount: 2, tileWidth: 1, tileHeight: 1, name: "set", flags: 0 }),
          userDataChunk({ text: "set" }),
          userDataChunk({ text: "tile0" }),
          userDataChunk({ text: "tile1" }),
          userDataChunk({ text: "too many" }),
        ]),
      ]),
    );

    expect(result.tilesets[0]!.userData?.text).toBe("set");
    expect(result.tilesets[0]!.tileUserData.map((entry) => entry.text)).toEqual(["tile0", "tile1"]);
    expect(codes(result.warnings)).toEqual(["aseprite-user-data-orphan"]);
  });

  it("타일 수가 한도를 넘으면 그 청크만 거부하고 이미지 크기가 선언과 다르면 해제 실패로 보고한다", async () => {
    const limited = await importSpec(
      spriteOf([frameOf([tilesetChunk({ id: 0, tileCount: 3, tileWidth: 1, tileHeight: 1, name: "t", flags: 0 })])]),
      { limits: { maxTilesetTiles: 2 } },
    );
    const mismatch = await importSpec(
      spriteOf([frameOf([tilesetChunk({ id: 0, tileCount: 3, tileWidth: 1, tileHeight: 1, name: "t", pixels: new Uint8Array(8) })])]),
    );

    expect(codes(limited.unsupported)).toEqual(["aseprite-chunk-invalid"]);
    expect(limited.tilesets).toEqual([]);
    expect(codes(mismatch.unsupported)).toEqual(["aseprite-pixels-decode-failed"]);
    expect(mismatch.tilesets[0]!.tilePixels).toBeNull();
  });

  it("32비트 타일맵 셀의 마스크와 값을 읽고 뒤집기 비트를 풀어 준다", async () => {
    const tiles = Uint8Array.of(5, 0, 0, 0, 7, 0, 0, 0xa0);
    const result = await importSpec(
      spriteOf([
        frameOf([
          layerChunk({ name: "map", type: 2, tilesetIndex: 0 }),
          celChunk({ layer: 0, body: { kind: "tilemap", widthTiles: 2, heightTiles: 1, tiles } }),
        ]),
      ]),
    );
    const cel = result.cels[0]!;

    expect(result.warnings).toEqual([]);
    expect(cel).toMatchObject({ kind: "tilemap", width: 2, height: 1, pixels: null });
    expect(cel.tilemap).toMatchObject({
      bitsPerTile: 32,
      tileIdMask: 0x1fffffff,
      xFlipMask: 0x20000000,
      yFlipMask: 0x40000000,
      diagonalFlipMask: 0x80000000,
    });
    expect(cel.tilemap!.bytes).toEqual(tiles);
    const values = asepriteTilemapValues(cel.tilemap!.bytes!, 32);
    expect(Array.from(values)).toEqual([5, 0xa0000007]);
    expect(asepriteTileFields(values[0]!, cel.tilemap!)).toEqual({ tileId: 5, flipX: false, flipY: false, flipDiagonal: false });
    expect(asepriteTileFields(values[1]!, cel.tilemap!)).toEqual({ tileId: 7, flipX: true, flipY: false, flipDiagonal: true });
  });

  it("8비트와 16비트 타일 값은 리틀 엔디언으로 읽고 지원하지 않는 비트 수는 거부한다", async () => {
    expect(Array.from(asepriteTilemapValues(Uint8Array.of(1, 2, 3, 4), 8))).toEqual([1, 2, 3, 4]);
    expect(Array.from(asepriteTilemapValues(Uint8Array.of(1, 2, 3, 4), 16))).toEqual([0x0201, 0x0403]);
    expect(Array.from(asepriteTilemapValues(Uint8Array.of(1, 2, 3, 4), 32))).toEqual([0x04030201]);
    expect(() => asepriteTilemapValues(new Uint8Array(4), 12)).toThrow(RangeError);

    const sixteen = await importSpec(
      spriteOf([
        frameOf([
          layerChunk({ name: "map", type: 2, tilesetIndex: 0 }),
          celChunk({ layer: 0, body: { kind: "tilemap", widthTiles: 2, heightTiles: 1, bits: 16, tiles: Uint8Array.of(1, 2, 3, 4), masks: [0x1fff, 0x2000, 0x4000, 0x8000] } }),
        ]),
      ]),
    );
    const twelve = await importSpec(
      spriteOf([
        frameOf([
          layerChunk({ name: "map", type: 2, tilesetIndex: 0 }),
          celChunk({ layer: 0, body: { kind: "tilemap", widthTiles: 1, heightTiles: 1, bits: 12, tiles: Uint8Array.of(1, 2) } }),
        ]),
      ]),
    );

    expect(sixteen.cels[0]!.tilemap).toMatchObject({ bitsPerTile: 16, tileIdMask: 0x1fff, xFlipMask: 0x2000 });
    expect(sixteen.cels[0]!.tilemap!.bytes).toEqual(Uint8Array.of(1, 2, 3, 4));
    expect(codes(twelve.unsupported)).toEqual(["aseprite-pixels-decode-failed"]);
    expect(twelve.cels[0]!.tilemap!.bytes).toBeNull();
  });
});

describe("Aseprite 외부 파일과 색 프로파일", () => {
  it("외부 파일 항목의 종류를 이름으로 바꾸고 모르는 종류는 unknown으로 남긴다", async () => {
    const result = await importSpec(
      spriteOf([
        frameOf([
          externalFilesChunk([
            { id: 1, type: 0, name: "colors.gpl" },
            { id: 2, type: 1, name: "tiles.aseprite" },
            { id: 3, type: 2, name: "ext.props" },
            { id: 4, type: 3, name: "ext.tiles" },
            { id: 5, type: 9, name: "?" },
          ]),
        ]),
      ]),
    );

    expect(result.externalFiles.map((entry) => [entry.id, entry.typeValue, entry.kind, entry.name])).toEqual([
      [1, 0, "palette", "colors.gpl"],
      [2, 1, "tileset", "tiles.aseprite"],
      [3, 2, "extension-properties", "ext.props"],
      [4, 3, "extension-tile-management", "ext.tiles"],
      [5, 9, "unknown", "?"],
    ]);
  });

  it("색 프로파일의 종류, 고정 감마, ICC 바이트를 읽는다", async () => {
    const icc = Uint8Array.from({ length: 12 }, (_, index) => index + 1);
    const read = async (profile: Parameters<typeof colorProfileChunk>[0]) =>
      (await importSpec(spriteOf([frameOf([colorProfileChunk(profile)])]))).colorProfile;

    expect(await read({ type: 0 })).toMatchObject({ kind: "none", typeValue: 0, iccProfile: null });
    expect(await read({ type: 1, fixedGamma: true, gamma: 1.5 })).toMatchObject({ kind: "srgb", fixedGamma: true, gamma: 1.5 });
    const withIcc = await read({ type: 2, icc });
    expect(withIcc).toMatchObject({ kind: "icc", typeValue: 2, fixedGamma: false });
    expect(withIcc!.iccProfile).toEqual(icc);
    expect((await importSpec(spriteOf([frameOf([])]))).colorProfile).toBeNull();
  });

  it("ICC 길이가 청크를 넘으면 그 청크만 거부하고 프로파일은 비워 둔다", async () => {
    const truncated = new ByteWriter().u16(2).u16(0).u32(0).zeros(8).u32(500).bytes([1, 2, 3]).toBytes();
    const result = await importSpec(spriteOf([frameOf([chunk(TYPE.colorProfile, truncated)])]));

    expect(codes(result.unsupported)).toEqual(["aseprite-chunk-invalid"]);
    expect(result.colorProfile).toBeNull();
  });
});

describe("Aseprite 사용자 데이터", () => {
  it("첫 프레임의 팔레트 바로 뒤이면서 다른 객체 청크보다 앞선 사용자 데이터는 스프라이트에 붙는다", async () => {
    const result = await importAsepriteSprite(buildAsepriteFixture(richAsepriteSpec()));

    expect(result.spriteUserData).toMatchObject({ text: "sprite", color: { r: 9, g: 8, b: 7, a: 6 } });
    expect(result.layers[0]!.userData?.text).toBe("bg layer");
    expect(result.cels[0]!.userData).toMatchObject({ text: "cel note", color: { r: 1, g: 2, b: 3, a: 4 } });
    expect(result.warnings).toEqual([]);
  });

  it.each([
    ["팔레트 앞에 아무 청크도 없는", () => [userDataChunk({ text: "x" })]],
    ["레이어 뒤의 팔레트에 이어지는", () => [layerChunk({ name: "L" }), paletteChunk({ size: 1, first: 0, colors: [[0, 0, 0, 255]] }), userDataChunk({ text: "x" })]],
    ["색 프로파일 뒤의", () => [colorProfileChunk({ type: 1 }), userDataChunk({ text: "x" })]],
    ["외부 파일 목록 뒤의", () => [externalFilesChunk([{ id: 1, type: 0, name: "p" }]), userDataChunk({ text: "x" })]],
  ])("%s 사용자 데이터는 붙을 곳이 없어 경고하고 버린다", async (_label, chunks) => {
    const result = await importSpec(spriteOf([frameOf(chunks())], { depth: 8 }));

    expect(codes(result.warnings)).toEqual(["aseprite-user-data-orphan"]);
    expect(result.spriteUserData).toBeNull();
  });

  it("첫 프레임이 아닌 프레임의 팔레트 뒤 사용자 데이터는 스프라이트에 붙지 않는다", async () => {
    const result = await importSpec(
      spriteOf(
        [frameOf([]), frameOf([paletteChunk({ size: 1, first: 0, colors: [[0, 0, 0, 255]] }), userDataChunk({ text: "late" })])],
        { depth: 8 },
      ),
    );

    expect(result.spriteUserData).toBeNull();
    expect(codes(result.warnings)).toEqual(["aseprite-user-data-orphan"]);
  });

  it("같은 레이어에 사용자 데이터가 두 번 오면 첫 값을 지키고 경고한다", async () => {
    const result = await importSpec(spriteOf([frameOf([layerChunk({ name: "L" }), userDataChunk({ text: "first" }), userDataChunk({ text: "second" })])]));

    expect(result.layers[0]!.userData?.text).toBe("first");
    expect(codes(result.warnings)).toEqual(["aseprite-user-data-orphan"]);
  });

  it("텍스트와 색 플래그를 따로 읽고 둘 다 없으면 null이다", async () => {
    const read = async (chunkFn: ReturnType<typeof userDataChunk>) =>
      (await importSpec(spriteOf([frameOf([layerChunk({ name: "L" }), chunkFn])]))).layers[0]!.userData;

    expect(await read(userDataChunk({ text: "only text" }))).toMatchObject({ text: "only text", color: null });
    expect(await read(userDataChunk({ color: [10, 20, 30, 40] }))).toMatchObject({ text: null, color: { r: 10, g: 20, b: 30, a: 40 } });
    expect(await read(userDataChunk({}))).toMatchObject({ flags: 0, text: null, color: null, propertyMaps: null });
  });

  const everyPropertyType: ReadonlyArray<readonly [string, FixtureProp]> = [
    ["bool", { t: "bool", v: true }],
    ["int8", { t: "int8", v: -5 }],
    ["int8min", { t: "int8", v: -128 }],
    ["int8max", { t: "int8", v: 127 }],
    ["uint8", { t: "uint8", v: 200 }],
    ["int16", { t: "int16", v: -300 }],
    ["uint16", { t: "uint16", v: 65_000 }],
    ["int32", { t: "int32", v: -70_000 }],
    ["uint32", { t: "uint32", v: 4_000_000_000 }],
    ["int64", { t: "int64", v: -9_007_199_254_740_993n }],
    ["uint64", { t: "uint64", v: 18_446_744_073_709_551_615n }],
    ["fixed", { t: "fixed", v: 1.5 }],
    ["float", { t: "float", v: 0.25 }],
    ["double", { t: "double", v: Math.PI }],
    ["string", { t: "string", v: "한글 🎨" }],
    ["point", { t: "point", x: -1, y: 2 }],
    ["size", { t: "size", w: 3, h: 4 }],
    ["rect", { t: "rect", x: 1, y: 2, w: 3, h: 4 }],
    ["mixed", { t: "vector", elementType: 0, items: [{ t: "uint8", v: 1 }, { t: "string", v: "x" }] }],
    ["typed", { t: "vector", elementType: 5, items: [{ t: "uint16", v: 7 }, { t: "uint16", v: 8 }] }],
    ["nested", { t: "map", props: [["inner", { t: "bool", v: false }]] }],
    ["uuid", { t: "uuid", v: Array.from({ length: 16 }, (_, index) => index) }],
  ];

  it("모든 속성 타입과 여러 맵을 읽고 64비트 정수는 10진 문자열로 보존한다", async () => {
    const result = await importSpec(
      spriteOf([
        frameOf([
          layerChunk({ name: "L" }),
          userDataChunk({ text: "props", maps: [{ key: 0, props: everyPropertyType }, { key: 0x1234, props: [["ext", { t: "uint8", v: 1 }]] }] }),
        ]),
      ]),
    );
    const userData = result.layers[0]!.userData!;
    const first = userData.propertyMaps![0]!;

    expect(userData.propertiesError).toBeNull();
    expect(result.unsupported).toEqual([]);
    expect(userData.propertyMaps!.map((map) => map.key)).toEqual([0, 0x1234]);
    expect(first.properties.map((property) => property.name)).toEqual(everyPropertyType.map(([name]) => name));
    expect(first.properties.map((property) => property.value)).toEqual([
      { type: "bool", value: true },
      { type: "int8", value: -5 },
      { type: "int8", value: -128 },
      { type: "int8", value: 127 },
      { type: "uint8", value: 200 },
      { type: "int16", value: -300 },
      { type: "uint16", value: 65_000 },
      { type: "int32", value: -70_000 },
      { type: "uint32", value: 4_000_000_000 },
      { type: "int64", value: "-9007199254740993" },
      { type: "uint64", value: "18446744073709551615" },
      { type: "fixed", value: 1.5 },
      { type: "float", value: 0.25 },
      { type: "double", value: Math.PI },
      { type: "string", value: "한글 🎨" },
      { type: "point", x: -1, y: 2 },
      { type: "size", width: 3, height: 4 },
      { type: "rect", x: 1, y: 2, width: 3, height: 4 },
      { type: "vector", elementType: 0, items: [{ type: "uint8", value: 1 }, { type: "string", value: "x" }] },
      { type: "vector", elementType: 5, items: [{ type: "uint16", value: 7 }, { type: "uint16", value: 8 }] },
      { type: "map", properties: [{ name: "inner", value: { type: "bool", value: false } }] },
      { type: "uuid", value: "00010203-0405-0607-0809-0a0b0c0d0e0f" },
    ]);
    expect(() => JSON.stringify(userData)).not.toThrow();
  });

  const nested = (depth: number): FixtureProp =>
    depth === 0 ? { t: "uint8", v: 1 } : { t: "map", props: [["n", nested(depth - 1)]] };

  it("속성이 깨져도 텍스트와 색은 유지하고 이유를 남긴다", async () => {
    const unknownType = await importSpec(
      spriteOf([frameOf([layerChunk({ name: "L" }), userDataChunk({ text: "keep", color: [1, 2, 3, 4], maps: [{ key: 0, props: [["bad", { t: "raw", type: 0xff, bytes: [1, 2] }]] }] })])]),
    );
    const smallBlock = await importSpec(
      spriteOf([frameOf([layerChunk({ name: "L" }), chunk(TYPE.userData, new ByteWriter().u32(1 | 4).string("t").u32(4).u32(0).toBytes())])]),
    );

    for (const result of [unknownType, smallBlock]) {
      const userData = result.layers[0]!.userData!;
      expect(userData.propertyMaps).toBeNull();
      expect(userData.propertiesError).toEqual(expect.any(String));
      expect(codes(result.unsupported)).toEqual(["aseprite-user-data-properties-invalid"]);
    }
    expect(unknownType.layers[0]!.userData).toMatchObject({ text: "keep", color: { r: 1, g: 2, b: 3, a: 4 } });
    expect(smallBlock.layers[0]!.userData!.text).toBe("t");
  });

  it("중첩 깊이와 속성 개수 한도를 넘으면 속성 오류로 보고하고 한도 안에서는 읽는다", async () => {
    const deep = spriteOf([frameOf([layerChunk({ name: "L" }), userDataChunk({ maps: [{ key: 0, props: [["a", nested(2)]] }] })])]);
    const many = spriteOf([
      frameOf([
        layerChunk({ name: "L" }),
        userDataChunk({ maps: [{ key: 0, props: Array.from({ length: 5 }, (_, index) => [`p${index}`, { t: "uint8", v: index }] as const) }] }),
      ]),
    ]);

    const tooDeep = await importSpec(deep, { limits: { maxUserDataDepth: 2 } });
    const deepOk = await importSpec(deep, { limits: { maxUserDataDepth: 3 } });
    const tooMany = await importSpec(many, { limits: { maxUserDataValues: 3 } });
    const manyOk = await importSpec(many, { limits: { maxUserDataValues: 5 } });

    expect(codes(tooDeep.unsupported)).toEqual(["aseprite-user-data-properties-invalid"]);
    expect(deepOk.unsupported).toEqual([]);
    expect(codes(tooMany.unsupported)).toEqual(["aseprite-user-data-properties-invalid"]);
    expect(manyOk.unsupported).toEqual([]);
    expect(manyOk.layers[0]!.userData!.propertyMaps![0]!.properties).toHaveLength(5);
  });

  it("적힌 속성 개수가 남은 바이트에 비해 지나치게 크면 메모리를 잡지 않고 속성 오류로 보고한다", async () => {
    const hostile = new ByteWriter().u32(4).u32(12).u32(0xffff_ffff).toBytes();
    const result = await importSpec(spriteOf([frameOf([layerChunk({ name: "L" }), chunk(TYPE.userData, hostile)])]));

    expect(codes(result.unsupported)).toEqual(["aseprite-user-data-properties-invalid"]);
    expect(result.layers[0]!.userData!.propertyMaps).toBeNull();
  });

  it("압축 데이터가 필요한 셀 청크도 사용자 데이터 귀속은 셀 단위로 유지한다", async () => {
    const result = await importSpec(
      spriteOf([
        frameOf([
          layerChunk({ name: "L" }),
          celChunk({ layer: 0, body: { kind: "compressed", width: 1, height: 1, pixels: ONE_PIXEL } }),
          userDataChunk({ text: "cel" }),
          celChunk({ layer: 0, body: { kind: "raw", width: 1, height: 1, pixels: ONE_PIXEL } }),
        ]),
      ]),
    );

    expect(result.cels.map((cel) => cel.userData?.text ?? null)).toEqual(["cel", null]);
    expect(zlibBytes(ONE_PIXEL).byteLength).toBeGreaterThan(0);
  });
});
