import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  buildKraFixture,
  buildKraFixtureDetailed,
  buildKraTileFile,
  fakePng,
  kraNativeRgba,
  kraTilePayload,
  patternTile,
  solidTile,
  tilePixels,
} from "../../../../tests/corpus/formats/kra-fixtures";
import { buildFormatZipFixture } from "../../../../tests/corpus/formats/krita-bundle-fixtures";
import { importKra, inspectKraSignature, KRA_LIMITS, KraError, type KraErrorCode, type KraImportOptions } from "../kra-document";
import { clipForMessage } from "../kra-issues";

async function failureOf(source: Blob | Uint8Array | ArrayBuffer, options?: KraImportOptions): Promise<KraErrorCode> {
  try {
    await importKra(source, options);
  } catch (error) {
    if (error instanceof KraError) return error.code;
    throw error;
  }
  throw new Error("예외가 발생하지 않았다");
}

const codes = (issues: readonly { readonly code: string }[]) => issues.map((issue) => issue.code);
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const WHITE = Uint8Array.from(kraNativeRgba(255, 255, 255, 255));

function paint(x: number, y: number, rgba: [number, number, number, number], pixelBytes = 4) {
  const tile = tilePixels(pixelBytes, () => kraNativeRgba(...rgba));
  return buildKraTileFile({ pixelBytes, tiles: [{ x, y, payload: kraTilePayload(tile, pixelBytes) }] });
}

describe("importKra: 문서 구조", () => {
  it("레이어와 이미지 정보, 픽셀, 출처 해시를 읽는다", async () => {
    const fixture = buildKraFixtureDetailed({
      imageName: "My Doc",
      width: 100,
      height: 80,
      layers: [
        { name: "Ink", tileFile: paint(0, 0, [200, 100, 50, 255]), attrs: { opacity: "128", compositeop: "multiply", colorlabel: "2" } },
        { name: "Background", tileFile: buildKraTileFile({ pixelBytes: 4, tiles: [] }), defaultPixel: WHITE },
      ],
      mergedImage: fakePng(),
      preview: fakePng(24),
      icc: Uint8Array.from([1, 2, 3, 4]),
    });
    const result = await importKra(fixture.bytes);

    expect(result).toMatchObject({
      format: "krita-kra",
      specProfile: "krita-kra-observed",
      mimetype: "application/x-krita",
      document: { editor: "Krita", kritaVersion: "5.2.2", syntaxVersion: "2.0" },
      image: { name: "My Doc", width: 100, height: 80, colorSpace: "RGBA", profileName: "sRGB-elle-V2-srgbtrc.icc", xRes: 72, yRes: 72, description: "" },
      warnings: [],
      unsupported: [],
      source: { byteLength: fixture.bytes.byteLength, sha256: sha256(fixture.bytes) },
    });
    expect(result.layers.map((layer) => [layer.index, layer.name, layer.kind, layer.nodeType])).toEqual([
      [0, "Ink", "raster", "paintlayer"],
      [1, "Background", "raster", "paintlayer"],
    ]);

    const ink = result.layers[0]!;
    expect(ink).toMatchObject({ opacityRaw: 128, compositeOp: "multiply", compositeOpKnown: true, colorLabel: 2, tileCount: 1, defaultPixel: [0, 0, 0, 0] });
    expect(ink.extent).toEqual({ x: 0, y: 0, width: 64, height: 64 });
    expect(Array.from(ink.pixels!.subarray(0, 4))).toEqual([200, 100, 50, 255]);

    // 기본 픽셀이 불투명이면 캔버스 전체를 그 색으로 채운 레이어가 된다
    const background = result.layers[1]!;
    expect(background).toMatchObject({ tileCount: 0, defaultPixel: [255, 255, 255, 255], extent: { x: 0, y: 0, width: 100, height: 80 } });
    expect(new Set(background.pixels)).toEqual(new Set([255]));

    expect(result.mergedImagePng).toEqual(fakePng());
    expect(result.previewPng).toEqual(fakePng(24));
    expect(result.iccProfile).toEqual(Uint8Array.from([1, 2, 3, 4]));
  });

  it("Blob, ArrayBuffer, Uint8Array 입력이 같은 결과를 낸다", async () => {
    const bytes = buildKraFixture({ layers: [{ name: "a", tileFile: paint(0, 0, [1, 2, 3, 255]) }] });
    const [fromBytes, fromBuffer, fromBlob] = await Promise.all([
      importKra(bytes),
      importKra(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer),
      importKra(new Blob([new Uint8Array(bytes)])),
    ]);
    expect(fromBuffer).toEqual(fromBytes);
    expect(fromBlob).toEqual(fromBytes);
  });

  it("입력 배열을 복사해서 읽으므로 호출자가 나중에 바꿔도 결과에 영향이 없다", async () => {
    const bytes = buildKraFixture({ layers: [{ name: "a", tileFile: paint(0, 0, [1, 2, 3, 255]) }] });
    const pending = importKra(bytes);
    bytes.fill(0);
    expect((await pending).layers[0]!.name).toBe("a");
  });

  it("그룹 트리를 펼치고 보임 상태를 조상까지 합친다", async () => {
    const result = await importKra(
      buildKraFixture({
        layers: [
          { name: "top", tileFile: paint(0, 0, [1, 1, 1, 255]) },
          {
            nodetype: "grouplayer",
            name: "folder",
            attrs: { visible: "0", collapsed: "1", passthrough: "1", opacity: "200" },
            children: [{ name: "inside", tileFile: paint(0, 0, [2, 2, 2, 255]) }],
          },
        ],
      }),
    );
    expect(result.layers.map((layer) => [layer.name, layer.kind, layer.parentIndex, layer.depth, layer.effectiveVisible])).toEqual([
      ["top", "raster", null, 0, true],
      ["folder", "group", null, 0, false],
      ["inside", "raster", 1, 1, false],
    ]);
    expect(result.layers[1]).toMatchObject({ collapsed: true, passThrough: true, opacityRaw: 200, pixels: null, extent: null, tileCount: 0 });
    // 숨겨진 그룹 안의 레이어도 픽셀은 읽는다
    expect(result.layers[2]!.pixels).not.toBeNull();
  });

  it("레이어 오프셋(x, y)만큼 이미지 좌표를 옮긴다", async () => {
    const result = await importKra(
      buildKraFixture({ layers: [{ name: "moved", attrs: { x: "-10", y: "20" }, tileFile: paint(-64, 0, [9, 8, 7, 255]) }] }),
    );
    expect(result.layers[0]).toMatchObject({ offsetX: -10, offsetY: 20, extent: { x: -74, y: 20, width: 64, height: 64 } });
  });

  it("마스크와 지원하지 않는 레이어 종류는 속성만 읽고 unsupported에 남긴다", async () => {
    const result = await importKra(
      buildKraFixture({
        layers: [
          { nodetype: "clonelayer", name: "clone", attrs: { clonefrom: "base" } },
          { name: "base", tileFile: paint(0, 0, [1, 2, 3, 255]), masks: [{ nodetype: "transparencymask", name: "tm" }] },
        ],
      }),
    );
    expect(codes(result.unsupported)).toEqual(["kra-node-unsupported", "kra-mask-unsupported"]);
    expect(result.layers[0]).toMatchObject({ kind: "other", nodeType: "clonelayer", pixels: null });
    expect(result.layers[0]!.attributes["clonefrom"]).toBe("base");
    expect(result.layers[1]!.masks).toHaveLength(1);
    expect(result.layers[1]!.pixels).not.toBeNull();
  });

  it("decodePixels=false면 구조만 읽고 픽셀 항목은 읽지 않는다", async () => {
    const result = await importKra(buildKraFixture({ layers: [{ name: "a", tileFile: paint(0, 0, [1, 2, 3, 255]) }] }), { decodePixels: false });
    expect(result.layers[0]).toMatchObject({ pixels: null, extent: null, defaultPixel: null, tileCount: 0 });
    expect(result.warnings).toEqual([]);
    expect(result.unsupported).toEqual([]);
  });

  it("속성 순서가 달라도 같은 결과다", async () => {
    const detailed = buildKraFixtureDetailed({ layers: [{ name: "a", tileFile: paint(0, 0, [1, 2, 3, 255]) }] });
    const reversed = detailed.maindoc.replace(/<layer ([^>]*?)\/>/gu, (_all, attrs: string) => {
      const parts = attrs.match(/\S+="[^"]*"/gu) ?? [];
      return `<layer ${parts.reverse().join(" ")}/>`;
    });
    expect(reversed).not.toBe(detailed.maindoc);
    const entries = detailed.entries.map((entry) => (entry.path === "maindoc.xml" ? { ...entry, data: new TextEncoder().encode(reversed) } : entry));
    const a = await importKra(detailed.bytes);
    const b = await importKra(buildFormatZipFixture(entries));
    expect(b.layers.map((layer) => ({ ...layer, attributes: undefined }))).toEqual(a.layers.map((layer) => ({ ...layer, attributes: undefined })));
  });

  it("Krita처럼 UTF-8 플래그 없이 쓴 한글 이미지 이름도 읽는다", async () => {
    const detailed = buildKraFixtureDetailed({ imageName: "웹툰 1화", layers: [{ name: "레이어", tileFile: paint(0, 0, [1, 2, 3, 255]) }] });
    const result = await importKra(buildFormatZipFixture(detailed.entries.map((entry) => ({ ...entry, flags: 0 }))));
    expect(result.image.name).toBe("웹툰 1화");
    expect(result.layers[0]).toMatchObject({ name: "레이어", tileCount: 1 });
  });

  it("합성 이미지·미리보기·ICC가 없어도 읽는다 (.krz처럼)", async () => {
    const result = await importKra(buildKraFixture({ layers: [{ name: "a" }] }));
    expect(result).toMatchObject({ mergedImagePng: null, previewPng: null, iccProfile: null, warnings: [], unsupported: [] });
  });
});

describe("importKra: 색 공간과 프로파일", () => {
  it("16비트 선형 프로파일은 sRGB 전달 함수를 거쳐 8비트로 줄인다", async () => {
    // 네이티브 순서 B, G, R, A (각 16비트 리틀 엔디언): B=0, G=0xffff, R=0x0760, A=0xffff
    const tile = tilePixels(8, () => [0x00, 0x00, 0xff, 0xff, 0x60, 0x07, 0xff, 0xff]);
    const result = await importKra(
      buildKraFixture({
        colorSpace: "RGBA16",
        profile: "sRGB-elle-V2-g10.icc",
        layers: [{ name: "lin", tileFile: buildKraTileFile({ pixelBytes: 8, tiles: [{ x: 0, y: 0, payload: kraTilePayload(tile, 8) }] }), defaultPixel: new Uint8Array(8) }],
      }),
    );
    const oetf = (value: number) => Math.round(255 * (value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055));
    expect(Array.from(result.layers[0]!.pixels!.subarray(0, 4))).toEqual([oetf(0x0760 / 65_535), 255, 0, 255]);
    expect(result.warnings).toEqual([]);
  });

  it("같은 값이라도 sRGB 감마 프로파일이면 비례로 줄인다", async () => {
    const tile = tilePixels(8, () => [0x00, 0x00, 0xff, 0xff, 0x60, 0x07, 0xff, 0xff]);
    const result = await importKra(
      buildKraFixture({
        colorSpace: "RGBA16",
        profile: "sRGB-elle-V2-srgbtrc.icc",
        layers: [{ name: "gamma", tileFile: buildKraTileFile({ pixelBytes: 8, tiles: [{ x: 0, y: 0, payload: kraTilePayload(tile, 8) }] }), defaultPixel: new Uint8Array(8) }],
      }),
    );
    expect(Array.from(result.layers[0]!.pixels!.subarray(0, 4))).toEqual([Math.round(0x0760 / 257), 255, 0, 255]);
  });

  it("전달 함수를 알 수 없는 16비트 프로파일은 sRGB 감마로 가정하고 한 번만 경고한다", async () => {
    const payload = kraTilePayload(solidTile([0x80, 0x80, 0x80, 0x80, 0x80, 0x80, 0xff, 0xff]), 8);
    const layer = { tileFile: buildKraTileFile({ pixelBytes: 8, tiles: [{ x: 0, y: 0, payload }] }), defaultPixel: new Uint8Array(8) };
    const result = await importKra(
      buildKraFixture({ colorSpace: "RGBA16", profile: "Weird-Profile.icc", layers: [{ name: "a", ...layer }, { name: "b", ...layer }] }),
    );
    expect(codes(result.warnings)).toEqual(["kra-profile-transfer-assumed", "kra-profile-primaries-unconverted"]);
    expect(Array.from(result.layers[0]!.pixels!.subarray(0, 4))).toEqual([128, 128, 128, 255]);
  });

  it("sRGB로 보이지 않는 프로파일은 원색을 변환하지 않았다고 경고한다 (8비트도)", async () => {
    const result = await importKra(buildKraFixture({ profile: "Rec2020-elle-V4-g10.icc", layers: [{ name: "a", tileFile: paint(0, 0, [1, 2, 3, 255]) }] }));
    expect(codes(result.warnings)).toEqual(["kra-profile-primaries-unconverted"]);
  });

  it("프로파일 속성이 없으면 null이고 경고한다", async () => {
    const result = await importKra(buildKraFixture({ profile: null, layers: [{ name: "a", tileFile: paint(0, 0, [1, 2, 3, 255]) }] }));
    expect(result.image.profileName).toBeNull();
    expect(codes(result.warnings)).toContain("kra-profile-primaries-unconverted");
  });

  it("프로파일 속성이 빈 문자열이어도 없는 것과 같이 null이다", async () => {
    const result = await importKra(buildKraFixture({ profile: "", layers: [{ name: "a", tileFile: paint(0, 0, [1, 2, 3, 255]) }] }));
    expect(result.image.profileName).toBeNull();
  });

  it.each(["RGBAF16", "RGBAF32", "CMYKA", "LABA", "XYZA16", "YCBCRA8"])("%s 레이어는 픽셀을 읽지 않고 unsupported에 남긴다", async (colorSpace) => {
    const result = await importKra(buildKraFixture({ colorSpace, layers: [{ name: "a", tileFile: paint(0, 0, [1, 2, 3, 255]) }] }));
    expect(codes(result.unsupported)).toEqual(["kra-colorspace-unsupported"]);
    expect(result.unsupported[0]).toMatchObject({ scope: "semantic", path: "layer[0]" });
    expect(result.layers[0]).toMatchObject({ colorSpace, pixels: null, extent: null, tileCount: 0 });
  });

  it("레이어 색 공간 이름이 없으면 이미지 색 공간을 쓴다", async () => {
    const result = await importKra(buildKraFixture({ layers: [{ name: "a", attrs: { colorspacename: null }, tileFile: paint(0, 0, [9, 8, 7, 255]) }] }));
    expect(result.layers[0]!.colorSpace).toBeNull();
    expect(Array.from(result.layers[0]!.pixels!.subarray(0, 4))).toEqual([9, 8, 7, 255]);
  });

  it("레이어의 색 공간이 이미지와 다르면 레이어의 것을 따른다", async () => {
    const tile = tilePixels(2, () => [90, 180]);
    const result = await importKra(
      buildKraFixture({
        colorSpace: "RGBA",
        layers: [
          {
            name: "gray layer",
            attrs: { colorspacename: "GRAYA" },
            tileFile: buildKraTileFile({ pixelBytes: 2, tiles: [{ x: 0, y: 0, payload: kraTilePayload(tile, 2) }] }),
            defaultPixel: new Uint8Array(2),
          },
        ],
      }),
    );
    expect(result.unsupported).toEqual([]);
    expect(codes(result.warnings)).toEqual(["kra-layer-colorspace-differs"]);
    expect(Array.from(result.layers[0]!.pixels!.subarray(0, 4))).toEqual([90, 90, 90, 180]);
  });

  it("레이어 색 공간이 이미지와 다르다는 경고는 import당 한 번만 낸다", async () => {
    const gray = (name: string) => ({
      name,
      attrs: { colorspacename: "GRAYA" },
      tileFile: buildKraTileFile({ pixelBytes: 2, tiles: [{ x: 0, y: 0, payload: kraTilePayload(tilePixels(2, () => [90, 180]), 2) }] }),
      defaultPixel: new Uint8Array(2),
    });
    const result = await importKra(buildKraFixture({ colorSpace: "RGBA", layers: [gray("one"), gray("two")] }));
    expect(codes(result.warnings)).toEqual(["kra-layer-colorspace-differs"]);
    expect(result.layers.map((layer) => layer.pixels !== null)).toEqual([true, true]);
  });

  it("8비트 문서도 프로파일이 선형이면 sRGB 전달 함수를 거쳐 16비트 문서와 같은 의미의 RGBA8을 낸다", async () => {
    const oetf = (value: number) => Math.round(255 * (value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055));
    const tile = tilePixels(4, () => kraNativeRgba(10, 120, 250, 99));
    const make = (profile: string) =>
      buildKraFixture({
        profile,
        layers: [
          {
            name: "p",
            tileFile: buildKraTileFile({ pixelBytes: 4, tiles: [{ x: 0, y: 0, payload: kraTilePayload(tile, 4) }] }),
            defaultPixel: Uint8Array.from(kraNativeRgba(200, 0, 0, 255)),
          },
        ],
      });
    const linear = (await importKra(make("sRGB-elle-V2-g10.icc"))).layers[0]!;
    expect(Array.from(linear.pixels!.subarray(0, 4))).toEqual([oetf(10 / 255), oetf(120 / 255), oetf(250 / 255), 99]);
    expect(linear.defaultPixel).toEqual([oetf(200 / 255), 0, 0, 255]);
    const gamma = (await importKra(make("sRGB-elle-V2-srgbtrc.icc"))).layers[0]!;
    expect(Array.from(gamma.pixels!.subarray(0, 4))).toEqual([10, 120, 250, 99]);
    expect(gamma.defaultPixel).toEqual([200, 0, 0, 255]);
  });

  it("전달 함수를 정하는 프로파일 이름은 단어 단위로 본다 (g100은 선형이 아니다)", async () => {
    const tile = tilePixels(4, () => kraNativeRgba(10, 120, 250, 255));
    const layers = [{ name: "p", tileFile: buildKraTileFile({ pixelBytes: 4, tiles: [{ x: 0, y: 0, payload: kraTilePayload(tile, 4) }] }) }];
    const g100 = await importKra(buildKraFixture({ profile: "Canon_G100.icc", layers }));
    expect(Array.from(g100.layers[0]!.pixels!.subarray(0, 4))).toEqual([10, 120, 250, 255]);
  });

  it("srgbtrc라도 원색이 sRGB가 아닌 프로파일(Rec2020 등)은 원색을 변환하지 않았다고 경고한다", async () => {
    const result = await importKra(buildKraFixture({ profile: "Rec2020-elle-V4-srgbtrc.icc", layers: [{ name: "a", tileFile: paint(0, 0, [1, 2, 3, 255]) }] }));
    expect(codes(result.warnings)).toEqual(["kra-profile-primaries-unconverted"]);
  });

  it("GRAYA 문서를 읽는다", async () => {
    const tile = tilePixels(2, () => [77, 200]);
    const result = await importKra(
      buildKraFixture({ colorSpace: "GRAYA", profile: "Gray-D50-elle-V2-srgbtrc.icc", layers: [{ name: "g", tileFile: buildKraTileFile({ pixelBytes: 2, tiles: [{ x: 0, y: 0, payload: kraTilePayload(tile, 2) }] }), defaultPixel: new Uint8Array(2) }] }),
    );
    expect(Array.from(result.layers[0]!.pixels!.subarray(0, 4))).toEqual([77, 77, 77, 200]);
    expect(result.warnings).toEqual([]);
  });
});

describe("importKra: 레이어 데이터가 깨졌을 때", () => {
  const good = () => ({ name: "good", tileFile: paint(0, 0, [10, 20, 30, 255]) });

  it("레이어 데이터 항목이 없으면 그 레이어만 포기한다", async () => {
    const result = await importKra(buildKraFixture({ layers: [{ name: "gone", tileFile: null }, good()] }));
    expect(codes(result.unsupported)).toEqual(["kra-layer-data-missing"]);
    expect(result.layers[0]!.pixels).toBeNull();
    expect(result.layers[1]!.pixels).not.toBeNull();
  });

  it("filename 속성이 없으면 픽셀을 읽지 않는다", async () => {
    const result = await importKra(buildKraFixture({ layers: [{ name: "x", attrs: { filename: null } }, good()] }));
    // 속성을 뺀 레이어는 기본 파일명으로 항목이 만들어지지만 maindoc에 filename이 없다
    expect(codes(result.unsupported)).toEqual(["kra-layer-data-missing"]);
    expect(result.layers[1]!.pixels).not.toBeNull();
  });

  it.each(["../../evil", "a/b", "a\\b", "..", ".", ""])("안전하지 않은 filename %j은 항목을 찾지 않는다", async (filename) => {
    // 안전하지 않은 이름의 ZIP 항목은 엄격한 ZIP 읽기가 컨테이너째 거부하므로 항목은 만들지 않고 maindoc에만 적는다
    const result = await importKra(buildKraFixture({ layers: [{ name: "x", attrs: { filename }, tileFile: null, defaultPixel: null }, good()] }));
    expect(codes(result.unsupported).filter((code) => code.startsWith("kra-layer"))).toEqual(["kra-layer-filename-invalid"]);
    expect(result.layers[1]!.pixels).not.toBeNull();
  });

  it("LZF가 깨진 타일이 있으면 그 레이어의 픽셀만 포기한다", async () => {
    const broken = buildKraTileFile({ pixelBytes: 4, tiles: [{ x: 0, y: 0, payload: Uint8Array.from([1, 0, 1]) }] });
    const result = await importKra(buildKraFixture({ layers: [{ name: "bad", tileFile: broken }, good()] }));
    expect(codes(result.unsupported)).toEqual(["kra-layer-decode-failed"]);
    expect(result.unsupported[0]!.message).toContain("bad");
    expect(result.layers[0]).toMatchObject({ pixels: null, extent: null, tileCount: 0 });
    expect(result.layers[1]!.pixels).not.toBeNull();
  });

  it("타일 파일 헤더가 깨졌으면 그 레이어만 포기한다", async () => {
    const result = await importKra(buildKraFixture({ layers: [{ name: "bad", tileFile: new TextEncoder().encode("garbage") }, good()] }));
    expect(codes(result.unsupported)).toEqual(["kra-layer-decode-failed"]);
    expect(result.layers[1]!.pixels).not.toBeNull();
  });

  it("타일 헤더의 픽셀 크기가 색 공간과 다르면 그 레이어만 포기한다", async () => {
    const wrong = buildKraTileFile({ pixelBytes: 8, tiles: [] });
    const result = await importKra(buildKraFixture({ layers: [{ name: "bad", tileFile: wrong }, good()] }));
    expect(codes(result.unsupported)).toEqual(["kra-layer-decode-failed"]);
  });

  it("타일 파일 끝에 남은 바이트는 경고한다", async () => {
    const withTrailing = buildKraTileFile({ pixelBytes: 4, tiles: [], trailing: Uint8Array.from([1, 2, 3]) });
    const result = await importKra(buildKraFixture({ layers: [{ name: "t", tileFile: withTrailing }] }));
    expect(codes(result.warnings)).toEqual(["kra-tile-trailing-bytes"]);
  });

  it(".defaultpixel이 없으면 투명으로 보고 경고한다", async () => {
    const result = await importKra(buildKraFixture({ layers: [{ name: "d", tileFile: paint(0, 0, [1, 2, 3, 255]), defaultPixel: null }] }));
    expect(codes(result.warnings)).toEqual(["kra-default-pixel-missing"]);
    expect(result.layers[0]!.defaultPixel).toEqual([0, 0, 0, 0]);
  });

  it(".defaultpixel 크기가 색 공간과 다르면 그 레이어만 포기한다", async () => {
    const result = await importKra(buildKraFixture({ layers: [{ name: "d", tileFile: paint(0, 0, [1, 2, 3, 255]), defaultPixel: new Uint8Array(3) }, good()] }));
    expect(codes(result.unsupported)).toEqual(["kra-layer-decode-failed"]);
    expect(result.layers[1]!.pixels).not.toBeNull();
  });

  it(".defaultpixel이 픽셀 크기 한도와 같으면 읽고 한도를 넘으면 읽기 전에 포기한다", async () => {
    const limits = { maxPixelBytes: 4 };
    const at = await importKra(buildKraFixture({ layers: [{ name: "d", tileFile: paint(0, 0, [1, 2, 3, 255]), defaultPixel: new Uint8Array(4) }] }), { limits });
    expect(at.unsupported).toEqual([]);
    expect(at.layers[0]!.pixels).not.toBeNull();
    const over = await importKra(buildKraFixture({ layers: [{ name: "d", tileFile: paint(0, 0, [1, 2, 3, 255]), defaultPixel: new Uint8Array(5) }] }), { limits });
    expect(codes(over.unsupported)).toEqual(["kra-layer-decode-failed"]);
    expect(over.unsupported[0]!.message).toContain("한도");
    expect(over.layers[0]!.pixels).toBeNull();
  });

  it("레이어 데이터의 ZIP CRC가 틀리면 그 레이어만 포기한다", async () => {
    const detailed = buildKraFixtureDetailed({ layers: [{ name: "bad", tileFile: paint(0, 0, [1, 2, 3, 255]) }, good()] });
    const entries = detailed.entries.map((entry) => (entry.path === "doc/layers/layer2" ? { ...entry, declaredCrc32: 1 } : entry));
    const result = await importKra(buildFormatZipFixture(entries));
    expect(codes(result.unsupported)).toEqual(["kra-layer-read-failed"]);
    expect(result.layers[0]!.pixels).toBeNull();
    expect(result.layers[1]!.pixels).not.toBeNull();
  });

  it("두 레이어가 같은 데이터 항목을 가리키면 첫 레이어만 읽는다 (해제를 되풀이시키는 파일을 막는다)", async () => {
    const result = await importKra(
      buildKraFixture({
        layers: [
          { name: "owner", tileFile: paint(0, 0, [1, 2, 3, 255]), attrs: { filename: "shared" } },
          { name: "alias", attrs: { filename: "shared" }, tileFile: null, defaultPixel: null },
        ],
      }),
    );
    expect(result.layers[0]!.pixels).not.toBeNull();
    expect(result.layers[1]!.pixels).toBeNull();
    expect(codes(result.unsupported)).toEqual(["kra-layer-data-shared"]);
  });

  it("오프셋 속성이 틀린 레이어는 엉뚱한 곳에 그리지 않고 픽셀을 건너뛴다", async () => {
    const result = await importKra(buildKraFixture({ layers: [{ name: "off", attrs: { x: "1.5" }, tileFile: paint(0, 0, [1, 2, 3, 255]) }, good()] }));
    expect(codes(result.unsupported)).toEqual(["kra-layer-offset-invalid"]);
    expect(result.layers[0]!.pixels).toBeNull();
    expect(result.layers[1]!.pixels).not.toBeNull();
  });
});

describe("importKra: 컨테이너와 문서 오류", () => {
  it("ZIP이 아닌 입력을 거부한다", async () => {
    expect(await failureOf(new Uint8Array(100))).toBe("container-invalid");
    expect(await failureOf(new Uint8Array())).toBe("container-invalid");
    expect(await failureOf(new TextEncoder().encode("not a zip at all, just text"))).toBe("container-invalid");
  });

  it("지원하지 않는 입력 형식을 거부한다", async () => {
    expect(await failureOf("text" as unknown as Uint8Array)).toBe("source-invalid");
  });

  it("maindoc.xml이 없는 ZIP(예: OpenRaster)을 거부한다", async () => {
    const zip = buildFormatZipFixture([
      { path: "mimetype", data: new TextEncoder().encode("image/openraster") },
      { path: "stack.xml", data: new TextEncoder().encode("<image/>") },
    ]);
    expect(await failureOf(zip)).toBe("container-invalid");
  });

  it("maindoc.xml이 올바른 UTF-8이 아니면 거부한다", async () => {
    const detailed = buildKraFixtureDetailed({ layers: [{ name: "a" }] });
    const entries = detailed.entries.map((entry) => (entry.path === "maindoc.xml" ? { ...entry, data: Uint8Array.from([0xff, 0xfe, 0x3c, 0x44]) } : entry));
    expect(await failureOf(buildFormatZipFixture(entries))).toBe("maindoc-invalid");
  });

  it("속성 값 안의 올바르지 않은 UTF-8도 대체 문자로 읽어 넘기지 않고 거부한다", async () => {
    const detailed = buildKraFixtureDetailed({ layers: [{ name: "a" }], imageAttrs: { description: "@@" } });
    const encoded = new TextEncoder().encode(detailed.maindoc);
    const at = detailed.maindoc.indexOf("@@");
    expect(at).toBeGreaterThan(0);
    encoded[at] = 0xff;
    encoded[at + 1] = 0xfe;
    // 대체 문자(U+FFFD)로 디코딩해도 XML은 올바르다: 거부하는 쪽이 엄격한 UTF-8 해석이라는 증거다.
    expect(new TextDecoder("utf-8").decode(encoded)).toContain("\ufffd");
    const entries = detailed.entries.map((entry) => (entry.path === "maindoc.xml" ? { ...entry, data: encoded } : entry));
    expect(await failureOf(buildFormatZipFixture(entries))).toBe("maindoc-invalid");
  });

  it.each([
    ["이름 없음", { name: null }],
    ["색 공간 없음", { colorspacename: null }],
    ["색 공간이 빈 문자열", { colorspacename: "" }],
    ["너비 없음", { width: null }],
    ["너비 0", { width: "0" }],
    ["높이 음수", { height: "-4" }],
    ["너비가 숫자 아님", { width: "wide" }],
    ["높이 소수", { height: "4.5" }],
  ] as const)("IMAGE 속성이 잘못됐으면 거부한다: %s", async (_label, imageAttrs) => {
    expect(await failureOf(buildKraFixture({ layers: [{ name: "a" }], imageAttrs }))).toBe("maindoc-invalid");
  });

  it("캔버스 한 변이 한도를 넘으면 limit-exceeded다 (한도와 같으면 받아들인다)", async () => {
    expect(await failureOf(buildKraFixture({ width: 4097, layers: [{ name: "a" }] }), { limits: { maxCanvasDimension: 4096 } })).toBe("limit-exceeded");
    expect(await failureOf(buildKraFixture({ height: 4097, layers: [{ name: "a" }] }), { limits: { maxCanvasDimension: 4096 } })).toBe("limit-exceeded");
    await expect(importKra(buildKraFixture({ width: 4096, height: 4096, layers: [{ name: "a" }] }), { limits: { maxCanvasDimension: 4096 } })).resolves.toBeDefined();
  });

  it.each([
    ["상위 구간", "../evil"],
    ["중간 상위 구간", "a/../b"],
    ["현재 구간", "./x"],
    ["빈 구간", "a//b"],
    ["탭 문자", "tab\tname"],
    ["줄바꿈", "line\nbreak"],
    ["DEL 문자", "del\u007f"],
  ])("이미지 이름이 경로 구간·제어 문자 검사를 통과하지 못하면 unsafe-archive-path다: %s", async (_label, imageName) => {
    expect(await failureOf(buildKraFixture({ imageName, layers: [{ name: "a", tileFile: paint(0, 0, [1, 2, 3, 255]) }] }))).toBe("unsafe-archive-path");
  });

  // Krita는 이미지 이름을 그대로 폴더 이름으로 쓴다. 파일로 풀지 않으므로 운영체제에서 못 쓰는 이름도 읽는다.
  it.each([
    "a..b",
    "has space",
    "한글 이름",
    "x".repeat(300),
    "1화: 시작",
    "뭐?",
    "a*b|c<d>e",
    'quote"name',
    " padded ",
    "trailing.",
    "con",
    "C:foo",
    "back\\slash",
    "웹툰 1화".normalize("NFD"),
    "Ａ全角",
    "™²",
  ])("영상 편집기에서 흔한 이미지 이름도 읽는다: %j", async (imageName) => {
    const result = await importKra(buildKraFixture({ imageName, layers: [{ name: "a", tileFile: paint(0, 0, [1, 2, 3, 255]) }] }));
    expect(result.image.name).toBe(imageName);
    expect(result.layers[0]!.pixels, imageName).not.toBeNull();
    expect(result.unsupported, imageName).toEqual([]);
  });
});

describe("importKra: mimetype 진단", () => {
  const layers = [{ name: "a", tileFile: paint(0, 0, [1, 2, 3, 255]) }];

  it("mimetype이 없으면 경고하고 null이다", async () => {
    const result = await importKra(buildKraFixture({ mimetype: null, layers }));
    expect(result.mimetype).toBeNull();
    expect(codes(result.warnings)).toEqual(["kra-mimetype-missing"]);
  });

  it("mimetype이 다르면 경고하되 내용은 돌려준다", async () => {
    const result = await importKra(buildKraFixture({ mimetype: "image/openraster", layers }));
    expect(result.mimetype).toBe("image/openraster");
    expect(codes(result.warnings)).toEqual(["kra-mimetype-unexpected"]);
  });

  it("mimetype이 첫 항목이 아니면 경고한다", async () => {
    const detailed = buildKraFixtureDetailed({ layers });
    const [mimetype, ...rest] = detailed.entries;
    const result = await importKra(buildFormatZipFixture([...rest, mimetype!]));
    expect(result.mimetype).toBe("application/x-krita");
    expect(codes(result.warnings)).toEqual(["kra-mimetype-not-first"]);
  });

  it("mimetype이 압축되어 있으면 첫 항목이어도 경고한다", async () => {
    const detailed = buildKraFixtureDetailed({ layers });
    const entries = detailed.entries.map((entry) => (entry.path === "mimetype" ? { ...entry, method: 8 as const } : entry));
    const result = await importKra(buildFormatZipFixture(entries));
    expect(result.mimetype).toBe("application/x-krita");
    expect(codes(result.warnings)).toEqual(["kra-mimetype-not-first"]);
  });

  it("mimetype 항목이 비정상적으로 크면 읽지 않는다", async () => {
    const result = await importKra(buildKraFixture({ mimetype: "x".repeat(1000), layers }));
    expect(result.mimetype).toBeNull();
    expect(codes(result.warnings)).toEqual(["kra-mimetype-unexpected"]);
  });

  it("mimetype 항목은 256바이트까지 읽고 257바이트부터 읽지 않는다", async () => {
    expect((await importKra(buildKraFixture({ mimetype: "x".repeat(256), layers }))).mimetype).toBe("x".repeat(256));
    expect((await importKra(buildKraFixture({ mimetype: "x".repeat(257), layers }))).mimetype).toBeNull();
  });
});

describe("importKra: 부속 이미지", () => {
  const layers = [{ name: "a", tileFile: paint(0, 0, [1, 2, 3, 255]) }];

  it("PNG 서명이 아닌 합성 이미지·미리보기는 버리고 경고한다", async () => {
    const result = await importKra(buildKraFixture({ layers, mergedImage: Uint8Array.from([1, 2, 3]), preview: Uint8Array.from([4, 5]) }));
    expect(result.mergedImagePng).toBeNull();
    expect(result.previewPng).toBeNull();
    expect(codes(result.warnings)).toEqual(["kra-png-signature-invalid", "kra-png-signature-invalid"]);
  });

  it("서명의 첫 바이트만 맞는 부속 이미지도 PNG로 받아들이지 않는다", async () => {
    const almost = new Uint8Array(32);
    almost[0] = 0x89;
    const result = await importKra(buildKraFixture({ layers, mergedImage: almost }));
    expect(result.mergedImagePng).toBeNull();
    expect(codes(result.warnings)).toEqual(["kra-png-signature-invalid"]);
  });

  it("PNG 서명 8바이트만 있는 부속 이미지도 서명 검사는 통과한다 (내용 검사는 하지 않는다)", async () => {
    const signatureOnly = fakePng(0);
    expect(signatureOnly).toHaveLength(8);
    const result = await importKra(buildKraFixture({ layers, mergedImage: signatureOnly }));
    expect(result.mergedImagePng).toEqual(signatureOnly);
    expect(result.warnings).toEqual([]);
  });

  it("부속 이미지 CRC가 틀리면 경고하고 null이다", async () => {
    const detailed = buildKraFixtureDetailed({ layers, mergedImage: fakePng() });
    const entries = detailed.entries.map((entry) => (entry.path === "mergedimage.png" ? { ...entry, declaredCrc32: 7 } : entry));
    const result = await importKra(buildFormatZipFixture(entries));
    expect(result.mergedImagePng).toBeNull();
    expect(codes(result.warnings)).toEqual(["kra-resource-read-failed"]);
  });
});

describe("importKra: 입력과 옵션 방어", () => {
  const layers = [{ name: "a", tileFile: paint(0, 0, [1, 2, 3, 255]) }];

  it("options·limits·zipLimits가 null이어도 TypeError 없이 읽는다 (JS 호출자)", async () => {
    const bytes = buildKraFixture({ layers });
    await expect(importKra(bytes, null as never)).resolves.toBeDefined();
    await expect(importKra(bytes, { limits: null as never, zipLimits: null as never })).resolves.toBeDefined();
    expect(await failureOf(bytes, { limits: 5 as never })).toBe("limit-invalid");
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, "100" as never])("zipLimits.maxArchiveBytes=%j는 입력을 읽기 전에 limit-invalid다", async (value) => {
    expect(await failureOf(buildKraFixture({ layers }), { zipLimits: { maxArchiveBytes: value } })).toBe("limit-invalid");
  });

  it("고정 한도보다 큰 zipLimits 값도 limit-invalid다 (올릴 수 없다)", async () => {
    expect(await failureOf(buildKraFixture({ layers }), { zipLimits: { maxArchiveBytes: 1e12 } })).toBe("limit-invalid");
  });

  it.each(["name", "colorspacename", "profile"])("IMAGE의 %s 속성이 1024자를 넘으면 maindoc-invalid다 (레이어마다 되풀이해 쓰는 문자열)", async (key) => {
    const long = "x".repeat(1025);
    expect(await failureOf(buildKraFixture({ layers, imageAttrs: { [key]: long }, maindoc: undefined }))).toBe("maindoc-invalid");
  });

  it("1024자 프로파일 이름과 레이어 2000개도 빠르게 끝나고 진단 메시지는 잘린다", async () => {
    const many = Array.from({ length: 2000 }, (_, index) => ({ name: `l${index}`, tileFile: null, defaultPixel: null }));
    const started = performance.now();
    const result = await importKra(buildKraFixture({ profile: "p".repeat(1024), layers: many }));
    expect(performance.now() - started).toBeLessThan(10_000);
    expect(result.unsupported.every((issue) => issue.message.length < 400)).toBe(true);
    expect(result.image.profileName).toHaveLength(1024);
  });

  it("clipForMessage의 기본 길이는 80자다 (80자는 그대로, 81자부터 자른다)", () => {
    expect(clipForMessage("a".repeat(80))).toBe("a".repeat(80));
    expect(clipForMessage("a".repeat(81))).toBe(`${"a".repeat(80)}…`);
    expect(clipForMessage("😀".repeat(81))).toBe(`${"😀".repeat(80)}…`);
  });

  it("clipForMessage는 아무리 긴 문자열도 앞쪽 limit개만 훑는다", () => {
    const huge = "가".repeat(10_000_000);
    const started = performance.now();
    expect(clipForMessage(huge, 5)).toBe("가가가가가…");
    expect(performance.now() - started).toBeLessThan(500);
  });

  it("SHA-256은 ZIP 구조가 맞는 입력에서만 계산한다 (쓰레기 입력에 해시 비용을 쓰지 않는다)", async () => {
    const spy = vi.spyOn(globalThis.crypto.subtle, "digest");
    try {
      expect(await failureOf(new Uint8Array(4096))).toBe("container-invalid");
      expect(spy).not.toHaveBeenCalled();
      await importKra(buildKraFixture({ layers }));
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
  });

  it("WebCrypto가 없거나 실패하면 순수 구현으로 같은 해시를 낸다", async () => {
    const bytes = buildKraFixture({ layers });
    const expected = sha256(bytes);
    vi.stubGlobal("crypto", undefined);
    try {
      expect((await importKra(bytes)).source.sha256).toBe(expected);
    } finally {
      vi.unstubAllGlobals();
    }
    const spy = vi.spyOn(globalThis.crypto.subtle, "digest").mockRejectedValue(new Error("지원하지 않음"));
    try {
      expect((await importKra(bytes)).source.sha256).toBe(expected);
    } finally {
      spy.mockRestore();
    }
  });
});

describe("importKra: 출력 예산과 중단", () => {
  it("깨진 레이어도 출력 예산을 쓴다 (버퍼만 만들고 버리는 파일로 시간을 끌 수 없다)", async () => {
    const solid = kraTilePayload(solidTile([1, 2, 3, 255]), 4);
    const broken = buildKraTileFile({
      pixelBytes: 4,
      tiles: [
        { x: 0, y: 0, payload: solid },
        { x: 64, y: 0, payload: Uint8Array.from([1, 0, 1]) },
      ],
    });
    const result = await importKra(
      buildKraFixture({ layers: [{ name: "bad", tileFile: broken }, { name: "good", tileFile: paint(0, 0, [4, 5, 6, 255]) }] }),
      { limits: { maxDecodedBytes: 128 * 64 * 4 + 100 } },
    );
    expect(codes(result.unsupported)).toEqual(["kra-layer-decode-failed", "kra-layer-limit-exceeded"]);
    expect(result.layers.map((layer) => layer.pixels)).toEqual([null, null]);
  });

  it("구조가 틀린 타일이 있는 레이어는 예산을 쓰기 전에 거부한다", async () => {
    const solid = kraTilePayload(solidTile([1, 2, 3, 255]), 4);
    const bad = buildKraTileFile({
      pixelBytes: 4,
      tiles: [
        { x: 0, y: 0, payload: solid },
        { x: 64, y: 0, payload: solid, compression: "ZIP" },
      ],
    });
    // 예산이 타일 하나 분량뿐이어도 첫 레이어는 구조 오류로 거부되고(예산 0 사용), 둘째 레이어가 읽힌다
    const result = await importKra(
      buildKraFixture({ layers: [{ name: "bad", tileFile: bad }, { name: "good", tileFile: paint(0, 0, [4, 5, 6, 255]) }] }),
      { limits: { maxDecodedBytes: 64 * 64 * 4 } },
    );
    expect(codes(result.unsupported)).toEqual(["kra-layer-decode-failed"]);
    expect(result.layers[1]!.pixels).not.toBeNull();
  });

  it("압축하지 않은 항목의 메모리 입력도 일정 시간마다 이벤트 루프에 양보해 중단 신호가 실행된다", async () => {
    const heavy = buildKraTileFile({
      pixelBytes: 4,
      tiles: Array.from({ length: 64 }, (_, index) => ({ x: (index % 8) * 64, y: Math.floor(index / 8) * 64, payload: kraTilePayload(solidTile([1, 2, 3, 255]), 4) })),
    });
    const bytes = buildKraFixture({ stored: true, width: 512, height: 512, layers: Array.from({ length: 150 }, (_, index) => ({ name: `l${index}`, tileFile: heavy })) });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5);
    // WebCrypto 해시는 이벤트 루프를 한 바퀴 돌아서, 레이어 루프가 양보하지 않아도 신호가 먼저 실행된다. 순수 구현으로 해시해
    // 이 시험이 레이어 루프의 양보만 확인하게 한다.
    vi.stubGlobal("crypto", undefined);
    try {
      expect(await failureOf(bytes, { signal: controller.signal })).toBe("aborted");
    } finally {
      clearTimeout(timer);
      vi.unstubAllGlobals();
    }
  });

  it("타일 64개마다 중단 신호를 확인한다", async () => {
    const countReads = async (tiles: number): Promise<number> => {
      let reads = 0;
      const signal = {
        get aborted() {
          reads += 1;
          return false;
        },
      } as unknown as AbortSignal;
      const tileFile = buildKraTileFile({
        pixelBytes: 4,
        tiles: Array.from({ length: tiles }, (_, index) => ({ x: (index % 16) * 64, y: Math.floor(index / 16) * 64, payload: kraTilePayload(solidTile([1, 2, 3, 255]), 4) })),
      });
      // 압축하지 않은 항목이면 해제 단계가 신호를 읽지 않아 읽는 횟수가 타일 처리 횟수로만 달라진다
      await importKra(buildKraFixture({ stored: true, width: 1024, height: 512, layers: [{ name: "a", tileFile }] }), { signal });
      return reads;
    };
    const base = await countReads(1);
    // 64번째와 128번째 타일을 처리한 뒤에 한 번씩 더 읽는다
    expect((await countReads(129)) - base).toBe(2);
    expect((await countReads(63)) - base).toBe(0);
  });
});

describe("importKra: 한도", () => {
  const layers = [{ name: "a", tileFile: paint(0, 0, [1, 2, 3, 255]) }];

  it("기본 한도가 설계 문서의 표와 같다", () => {
    expect(KRA_LIMITS).toEqual({
      maxMaindocCharacters: 8_000_000,
      maxNodes: 20_000,
      maxGroupDepth: 64,
      maxCanvasDimension: 262_144,
      maxTileSide: 1_024,
      maxPixelBytes: 32,
      maxTilesPerLayer: 1_048_576,
      maxLayerPixels: 67_108_864,
      maxDecodedBytes: 1_073_741_824,
      maxIssues: 500,
    });
    expect(Object.isFrozen(KRA_LIMITS)).toBe(true);
  });

  it.each([
    ["음수", { maxNodes: -1 }],
    ["소수", { maxNodes: 1.5 }],
    ["고정 한도 초과", { maxNodes: 1e9 }],
    ["NaN", { maxLayerPixels: Number.NaN }],
  ] as const)("호출자가 넘긴 한도 값이 올바르지 않으면 거부한다: %s", async (_label, limits) => {
    expect(await failureOf(buildKraFixture({ layers }), { limits })).toBe("limit-invalid");
  });

  it("알 수 없는 한도 이름(오타)을 조용히 무시하지 않고 거부한다", async () => {
    expect(await failureOf(buildKraFixture({ layers }), { limits: { maxLayerPixel: 10 } as never })).toBe("limit-invalid");
  });

  it("노드 수 한도를 낮출 수 있다", async () => {
    const many = Array.from({ length: 5 }, (_, index) => ({ name: `l${index}` }));
    expect(await failureOf(buildKraFixture({ layers: many }), { limits: { maxNodes: 4 } })).toBe("limit-exceeded");
    await expect(importKra(buildKraFixture({ layers: many }), { limits: { maxNodes: 5 } })).resolves.toBeDefined();
  });

  it("레이어 하나의 출력 픽셀 한도를 넘으면 그 레이어의 픽셀만 포기한다", async () => {
    const result = await importKra(buildKraFixture({ layers: [{ name: "a", tileFile: paint(0, 0, [1, 2, 3, 255]) }, { name: "b", tileFile: buildKraTileFile({ pixelBytes: 4, tiles: [] }) }] }), {
      limits: { maxLayerPixels: 4095 },
    });
    expect(codes(result.unsupported)).toEqual(["kra-layer-limit-exceeded"]);
    expect(result.layers[0]!.pixels).toBeNull();
  });

  it("출력 바이트 예산이 두 레이어에 1바이트 모자라면 둘째 레이어를 포기한다", async () => {
    const result = await importKra(
      buildKraFixture({ layers: [{ name: "first", tileFile: paint(0, 0, [1, 2, 3, 255]) }, { name: "second", tileFile: paint(0, 0, [4, 5, 6, 255]) }] }),
      { limits: { maxDecodedBytes: 2 * 64 * 64 * 4 - 1 } },
    );
    expect(result.layers[0]!.pixels).not.toBeNull();
    expect(result.layers[1]!.pixels).toBeNull();
    const enough = await importKra(
      buildKraFixture({ layers: [{ name: "first", tileFile: paint(0, 0, [1, 2, 3, 255]) }, { name: "second", tileFile: paint(0, 0, [4, 5, 6, 255]) }] }),
      { limits: { maxDecodedBytes: 2 * 64 * 64 * 4 } },
    );
    expect(enough.layers.every((layer) => layer.pixels !== null)).toBe(true);
  });

  it("모든 레이어를 합친 출력 바이트 예산을 넘으면 이후 레이어의 픽셀은 포기한다", async () => {
    const budget = 64 * 64 * 4; // 레이어 하나(타일 하나)만 들어간다
    const result = await importKra(
      buildKraFixture({ layers: [{ name: "first", tileFile: paint(0, 0, [1, 2, 3, 255]) }, { name: "second", tileFile: paint(0, 0, [4, 5, 6, 255]) }] }),
      { limits: { maxDecodedBytes: budget } },
    );
    expect(result.layers[0]!.pixels).not.toBeNull();
    expect(result.layers[1]!.pixels).toBeNull();
    expect(codes(result.unsupported)).toEqual(["kra-layer-limit-exceeded"]);
  });

  it("ZIP 한도는 낮출 수만 있고 낮춘 값이 입력 크기 검사에도 쓰인다", async () => {
    const bytes = buildKraFixture({ layers });
    expect(await failureOf(bytes, { zipLimits: { maxArchiveBytes: 100 } })).toBe("source-too-large");
    expect(await failureOf(bytes, { zipLimits: { maxArchiveBytes: bytes.byteLength - 1 } })).toBe("source-too-large");
    await expect(importKra(bytes, { zipLimits: { maxArchiveBytes: bytes.byteLength } })).resolves.toBeDefined();
    expect(await failureOf(bytes, { zipLimits: { maxEntries: 1 } })).toBe("limit-exceeded");
    expect(await failureOf(bytes, { zipLimits: { maxEntries: 1e9 } })).toBe("limit-invalid");
    expect(await failureOf(bytes, { zipLimits: { maxCompressionRatio: 1 } })).toBe("limit-exceeded");
  });

  it("진단이 한도보다 많으면 잘라서 요약 한 줄을 붙인다", async () => {
    const odd = Array.from({ length: 12 }, (_, index) => ({ name: `l${index}`, attrs: { compositeop: `unknown${index}` } }));
    const result = await importKra(buildKraFixture({ layers: odd }), { limits: { maxIssues: 3 } });
    expect(codes(result.warnings)).toEqual(["kra-composite-op-unknown", "kra-composite-op-unknown", "kra-composite-op-unknown", "kra-issues-truncated"]);
  });
});

describe("importKra: 중단", () => {
  it("시작 전에 중단된 신호는 바로 거부한다", async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await failureOf(buildKraFixture({ layers: [{ name: "a" }] }), { signal: controller.signal })).toBe("aborted");
  });

  it("처리 도중 중단하면 aborted로 끝난다", async () => {
    const controller = new AbortController();
    const bytes = buildKraFixture({ layers: [{ name: "a", tileFile: paint(0, 0, [1, 2, 3, 255]) }, { name: "b", tileFile: paint(0, 0, [1, 2, 3, 255]) }] });
    // 첫 DEFLATE 해제 때 중단 신호를 건다
    let calls = 0;
    const inflateRaw: KraImportOptions["inflateRaw"] = async (compressed, context) => {
      calls += 1;
      if (calls === 2) controller.abort();
      const { inflateRawSync } = await import("node:zlib");
      void context;
      return new Uint8Array(inflateRawSync(compressed));
    };
    expect(await failureOf(bytes, { signal: controller.signal, inflateRaw })).toBe("aborted");
  });

  // 마지막으로 읽는 항목을 읽는 도중 중단돼도 "읽기 실패"로 삼키면 뒤따르는 읽기가 모두 같은 신호로 실패해 가져오기가 성공으로 끝난다.
  it.each([
    ["마지막 레이어 데이터", (path: string) => path.includes("/layers/")],
    ["합성 이미지", (path: string) => path === "mergedimage.png"],
  ])("항목을 읽는 도중 중단되면 읽기 실패로 삼키지 않고 aborted로 끝난다: %s", async (_label, abortAt) => {
    const controller = new AbortController();
    const { inflateRawSync } = await import("node:zlib");
    const inflateRaw: KraImportOptions["inflateRaw"] = async (compressed, context) => {
      if (abortAt(context.path)) controller.abort();
      return new Uint8Array(inflateRawSync(compressed));
    };
    const bytes = buildKraFixture({ layers: [{ name: "a", tileFile: paint(0, 0, [1, 2, 3, 255]) }], mergedImage: fakePng(), preview: fakePng() });
    expect(await failureOf(bytes, { signal: controller.signal, inflateRaw })).toBe("aborted");
  });

  it("ZIP 읽기 도중 신호가 중단돼도 어느 시점이든 aborted다 (container-invalid로 바뀌지 않는다)", async () => {
    const bytes = buildKraFixture({ layers: [{ name: "a", tileFile: paint(0, 0, [1, 2, 3, 255]) }] });
    // n번째로 신호를 읽을 때부터 중단된 것으로 보인다
    const abortFromRead = (n: number): AbortSignal => {
      let reads = 0;
      return {
        get aborted() {
          reads += 1;
          return reads >= n;
        },
      } as unknown as AbortSignal;
    };
    for (let n = 1; n <= 8; n += 1) {
      expect(await failureOf(bytes, { signal: abortFromRead(n) }), `n=${n}`).toBe("aborted");
    }
  });
});

describe("inspectKraSignature", () => {
  const layers = [{ name: "a" }];

  it("Krita 문서를 알아본다", () => {
    expect(inspectKraSignature(buildKraFixture({ layers }))).toBe("kra");
  });

  it.each([
    ["빈 입력", new Uint8Array()],
    ["짧은 입력", Uint8Array.from([0x50, 0x4b, 3, 4])],
    ["ZIP이 아님", new TextEncoder().encode("hello world, this is not a zip file at all!!")],
  ] as const)("Krita 문서가 아니다: %s", (_label, bytes) => {
    expect(inspectKraSignature(bytes)).toBe("unknown");
  });

  it("다른 mimetype(OpenRaster)이나 압축된 mimetype은 알아보지 않는다", () => {
    expect(inspectKraSignature(buildKraFixture({ layers, mimetype: "image/openraster" }))).toBe("unknown");
    const compressed = buildFormatZipFixture([{ path: "mimetype", data: new TextEncoder().encode("application/x-krita"), method: 8 }]);
    expect(inspectKraSignature(compressed)).toBe("unknown");
  });

  it("mimetype이 첫 항목이 아니면 알아보지 않는다", () => {
    const detailed = buildKraFixtureDetailed({ layers });
    const [mimetype, ...rest] = detailed.entries;
    expect(inspectKraSignature(buildFormatZipFixture([...rest, mimetype!]))).toBe("unknown");
  });

  it("로컬 헤더의 압축 방식 필드가 0이 아니면 알아보지 않는다", () => {
    const bytes = buildKraFixture({ layers });
    expect(inspectKraSignature(bytes)).toBe("kra");
    bytes[8] = 8;
    expect(inspectKraSignature(bytes)).toBe("unknown");
  });

  it("길이가 같은 비슷한 mimetype(application/x-krite)은 알아보지 않는다", () => {
    expect(inspectKraSignature(buildKraFixture({ layers, mimetype: "application/x-krite" }))).toBe("unknown");
  });

  it("바이트 뷰의 오프셋이 0이 아니어도 판별한다", () => {
    const bytes = buildKraFixture({ layers });
    const padded = new Uint8Array(bytes.byteLength + 10);
    padded.set(bytes, 7);
    expect(inspectKraSignature(padded.subarray(7, 7 + bytes.byteLength))).toBe("kra");
  });

  it("서명에 꼭 필요한 57바이트(로컬 헤더 30 + 이름 8 + 내용 19)만 있어도 알아본다", () => {
    const full = buildKraFixture({ layers });
    const exact = full.slice(0, 57);
    expect(inspectKraSignature(exact)).toBe("kra");
    expect(inspectKraSignature(full.slice(0, 56))).toBe("unknown");
  });

  it("패턴 타일 같은 임의 데이터가 서명으로 오인되지 않는다", () => {
    expect(inspectKraSignature(patternTile(4, 1))).toBe("unknown");
  });
});
