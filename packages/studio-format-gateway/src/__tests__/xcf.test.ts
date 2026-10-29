import { deflateSync, inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  buildXcfFixture,
  fixtureF32,
  fixtureI32,
  fixtureI32Pair,
  fixtureProp,
  fixtureString,
  fixtureU32,
  type XcfFixtureLayer,
  type XcfFixtureSpec,
} from "../../../../tests/corpus/formats/xcf-fixtures";
import { importXcf, inspectXcfHeader, XCF_LIMITS, XcfError, type XcfImportResult } from "../xcf";

const PROP_COLORMAP = 1;
const PROP_OPACITY = 6;
const PROP_MODE = 7;
const PROP_VISIBLE = 8;
const PROP_OFFSETS = 15;
const PROP_RESOLUTION = 19;
const PROP_PARASITES = 21;
const PROP_USER_UNIT = 24;
const PROP_GROUP_ITEM = 29;
const PROP_ITEM_PATH = 30;
const PROP_FLOAT_OPACITY = 33;
const PROP_COMPOSITE_MODE = 35;
const PROP_COMPOSITE_SPACE = 36;
const PROP_BLEND_SPACE = 37;

/** 처음 세 행은 같은 값으로 채워 반복 연산을, 나머지는 변하는 값으로 리터럴 연산을 쓰게 한다. */
function patterned(width: number, height: number, bytesPerPixel: number, seed: number): Uint8Array {
  const raw = new Uint8Array(width * height * bytesPerPixel);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let channel = 0; channel < bytesPerPixel; channel += 1) {
        raw[(y * width + x) * bytesPerPixel + channel] =
          y < 3 ? (seed + channel * 40) & 0xff : (x * 7 + y * 13 + channel * 29 + seed) & 0xff;
      }
    }
  }
  return raw;
}

function toRgba(raw: Uint8Array, components: number, mode: "rgb" | "gray"): Uint8Array {
  const pixels = raw.length / components;
  const out = new Uint8Array(pixels * 4);
  for (let pixel = 0; pixel < pixels; pixel += 1) {
    const base = pixel * components;
    const colors = mode === "rgb" ? 3 : 1;
    for (let channel = 0; channel < 3; channel += 1) {
      out[pixel * 4 + channel] = raw[base + (mode === "rgb" ? channel : 0)] ?? 0;
    }
    out[pixel * 4 + 3] = components > colors ? (raw[base + colors] ?? 0) : 255;
  }
  return out;
}

function layer(partial: Partial<XcfFixtureLayer> & Pick<XcfFixtureLayer, "name">): XcfFixtureLayer {
  return { width: 4, height: 3, type: 1, bytesPerPixel: 4, ...partial };
}

function fixture(partial: Partial<XcfFixtureSpec> & Pick<XcfFixtureSpec, "layers">): Uint8Array {
  return buildXcfFixture({
    tag: "v003",
    width: 130,
    height: 70,
    baseType: 0,
    pointerBytes: 4,
    compression: 1,
    ...partial,
  });
}

function codes(issues: readonly { readonly code: string }[]): string[] {
  return issues.map((entry) => entry.code);
}

function xcfErrorCode(run: () => Promise<unknown>): Promise<string> {
  return run().then(
    () => "no-error",
    (error: unknown) => {
      if (error instanceof XcfError) return error.code;
      throw error;
    },
  );
}

describe("XCF 가져오기: 구조와 픽셀", () => {
  it("v003 RGBA·RGB 두 레이어(다중 타일)의 헤더·속성·픽셀을 복원한다", async () => {
    const top = patterned(130, 70, 4, 1);
    const background = patterned(130, 70, 3, 2);
    const bytes = fixture({
      layers: [
        layer({
          name: "Top",
          width: 130,
          height: 70,
          raw: top,
          dummyLevels: true,
          props: [
            fixtureProp(PROP_OPACITY, fixtureU32(195)),
            fixtureProp(PROP_FLOAT_OPACITY, fixtureF32(0.762)),
            fixtureProp(PROP_MODE, fixtureU32(3)),
            fixtureProp(PROP_VISIBLE, fixtureU32(1)),
            fixtureProp(PROP_OFFSETS, fixtureI32Pair(-5, 10)),
          ],
        }),
        layer({ name: "Background", width: 130, height: 70, type: 0, bytesPerPixel: 3, raw: background }),
      ],
    });

    const result = await importXcf(bytes);

    expect(result.format).toBe("xcf");
    expect(result.image).toMatchObject({
      versionTag: "v003",
      version: 3,
      width: 130,
      height: 70,
      baseType: "rgb",
      precision: 150,
      precisionDeclared: false,
      compression: 1,
      layerCount: 2,
      channelCount: 0,
    });
    expect(result.warnings).toEqual([]);
    expect(result.unsupported).toEqual([]);
    expect(result.source.byteLength).toBe(bytes.byteLength);
    expect(result.source.sha256).toMatch(/^[0-9a-f]{64}$/);

    const [first, second] = result.layers;
    expect(first).toMatchObject({
      index: 0,
      name: "Top",
      kind: "raster",
      width: 130,
      height: 70,
      offsetX: -5,
      offsetY: 10,
      hasAlpha: true,
      visible: true,
      effectiveVisible: true,
      mode: { id: 3, name: "Multiply", legacy: true },
      hasLayerMask: false,
      parentIndex: null,
      groupPath: null,
    });
    // 부동소수 불투명도 속성(0.762)이 8비트 속성(195/255)보다 우선한다.
    expect(first?.opacity).toBeCloseTo(0.762, 5);
    expect(first?.pixels).toEqual(top);
    expect(second).toMatchObject({ index: 1, name: "Background", hasAlpha: false, opacity: 1 });
    expect(second?.pixels).toEqual(toRgba(background, 3, "rgb"));
  });

  it("v011(8바이트 포인터)에서 압축 없는 타일도 같은 픽셀을 복원한다", async () => {
    const raw = patterned(70, 66, 4, 9);
    const bytes = buildXcfFixture({
      tag: "v011",
      width: 70,
      height: 66,
      baseType: 0,
      precision: 150,
      pointerBytes: 8,
      compression: 0,
      layers: [layer({ name: "Raw", width: 70, height: 66, raw })],
    });

    const result = await importXcf(bytes);

    expect(result.image).toMatchObject({ version: 11, precision: 150, precisionDeclared: true, compression: 0 });
    expect(result.layers[0]?.pixels).toEqual(raw);
    expect(result.warnings).toEqual([]);
  });

  it("회색·회색+알파 이미지를 R=G=B로 펼친다", async () => {
    const gray = patterned(5, 4, 1, 3);
    const grayAlpha = patterned(5, 4, 2, 4);
    const bytes = fixture({
      width: 5,
      height: 4,
      baseType: 1,
      layers: [
        layer({ name: "GA", width: 5, height: 4, type: 3, bytesPerPixel: 2, raw: grayAlpha }),
        layer({ name: "G", width: 5, height: 4, type: 2, bytesPerPixel: 1, raw: gray }),
      ],
    });

    const result = await importXcf(bytes);

    expect(result.image.baseType).toBe("grayscale");
    expect(result.layers[0]?.pixels).toEqual(toRgba(grayAlpha, 2, "gray"));
    expect(result.layers[1]?.pixels).toEqual(toRgba(gray, 1, "gray"));
  });

  it("인덱스드 이미지는 색지도로 색을 복원하고 알파 열을 따른다", async () => {
    const palette = Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255]);
    const colormap = Uint8Array.from([...fixtureU32(3), ...palette]);
    const indices = Uint8Array.from([0, 1, 2, 1, 0, 2]);
    const withAlpha = Uint8Array.from([0, 10, 1, 20, 2, 30, 1, 40, 0, 50, 2, 60]);
    const bytes = fixture({
      width: 3,
      height: 2,
      baseType: 2,
      imageProps: [fixtureProp(PROP_COLORMAP, colormap)],
      layers: [
        layer({ name: "IA", width: 3, height: 2, type: 5, bytesPerPixel: 2, raw: withAlpha }),
        layer({ name: "I", width: 3, height: 2, type: 4, bytesPerPixel: 1, raw: indices }),
      ],
    });

    const result = await importXcf(bytes);

    expect(result.image).toMatchObject({ baseType: "indexed", paletteSize: 3 });
    expect([...(result.layers[1]?.pixels ?? [])]).toEqual([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 0, 255, 0, 255, 255, 0, 0, 255, 0, 0, 255, 255,
    ]);
    expect(result.layers[0]?.pixels?.[3]).toBe(10);
    expect(result.layers[0]?.pixels?.[7]).toBe(20);
  });

  it("v012의 32비트 감마 정수와 32비트 선형 실수를 RGBA8로 환원한다", async () => {
    const integer = new DataView(new ArrayBuffer(16));
    integer.setUint32(0, 0xffffffff, false);
    integer.setUint32(4, 0x40000000, false);
    integer.setUint32(8, 0, false);
    integer.setUint32(12, 0x80000000, false);
    const intBytes = buildXcfFixture({
      tag: "v012",
      width: 1,
      height: 1,
      baseType: 0,
      precision: 350,
      pointerBytes: 8,
      compression: 1,
      layers: [layer({ name: "I32", width: 1, height: 1, bytesPerPixel: 16, raw: new Uint8Array(integer.buffer) })],
    });
    const float = new DataView(new ArrayBuffer(32));
    [0.5, 0, 1, 0.5, 0.0031308, 0.25, 0, 1].forEach((value, index) => float.setFloat32(index * 4, value, false));
    const floatBytes = buildXcfFixture({
      tag: "v012",
      width: 2,
      height: 1,
      baseType: 0,
      precision: 600,
      pointerBytes: 8,
      compression: 1,
      layers: [layer({ name: "F32", width: 2, height: 1, bytesPerPixel: 16, raw: new Uint8Array(float.buffer) })],
    });

    const fromInteger = await importXcf(intBytes);
    const fromFloat = await importXcf(floatBytes);

    expect(fromInteger.image.precision).toBe(350);
    expect([...(fromInteger.layers[0]?.pixels ?? [])]).toEqual([255, 64, 0, 128]);
    // 독립 계산한 sRGB OETF: 선형 0.5 -> 187.52 -> 188, 0.0031308 -> 10.31 -> 10, 0.25 -> 136.96 -> 137.
    // 알파는 OETF 없이 0.5 -> 128.
    expect([...(fromFloat.layers[0]?.pixels ?? [])]).toEqual([188, 0, 255, 128, 10, 137, 0, 255]);
  });

  it("압축 2(zlib)는 어댑터가 있을 때만 풀고 없으면 픽셀 없이 진단한다", async () => {
    const raw = patterned(70, 66, 4, 5);
    const bytes = buildXcfFixture({
      tag: "v011",
      width: 70,
      height: 66,
      baseType: 0,
      precision: 150,
      pointerBytes: 8,
      compression: 2,
      deflate: (tile) => new Uint8Array(deflateSync(tile)),
      layers: [layer({ name: "Z", width: 70, height: 66, raw })],
    });

    const withAdapter = await importXcf(bytes, {
      inflate: (compressed) => Promise.resolve(new Uint8Array(inflateSync(compressed))),
    });
    const without = await importXcf(bytes);

    expect(withAdapter.layers[0]?.pixels).toEqual(raw);
    expect(withAdapter.unsupported).toEqual([]);
    expect(without.layers[0]?.pixels).toBeNull();
    expect(codes(without.unsupported)).toContain("xcf-compression-unsupported");
  });

  it("decodePixels: false는 구조만 읽고 픽셀을 만들지 않는다", async () => {
    const result = await importXcf(fixture({ layers: [layer({ name: "L", raw: patterned(4, 3, 4, 1) })] }), {
      decodePixels: false,
    });

    expect(result.layers[0]?.pixels).toBeNull();
    expect(result.unsupported).toEqual([]);
    expect(result.layers[0]?.name).toBe("L");
  });

  it("같은 입력은 Blob·ArrayBuffer·Buffer·Uint8Array 어느 쪽이든 같은 결과를 낸다", async () => {
    const bytes = fixture({ layers: [layer({ name: "L", raw: patterned(4, 3, 4, 7) })] });

    const results = await Promise.all([
      importXcf(bytes),
      importXcf(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer),
      importXcf(Buffer.from(bytes)),
      importXcf(new Blob([new Uint8Array(bytes)])),
    ]);

    for (const result of results.slice(1)) expect(result).toEqual(results[0]);
  });
});

describe("XCF 가져오기: 속성과 호환 동작", () => {
  it("불투명도는 부동소수 속성이 우선하고, 없으면 8비트 값, 둘 다 없으면 1이다", async () => {
    const bytes = fixture({
      layers: [
        layer({ name: "both", props: [fixtureProp(PROP_OPACITY, fixtureU32(195)), fixtureProp(PROP_FLOAT_OPACITY, fixtureF32(0.25))] }),
        layer({ name: "int", props: [fixtureProp(PROP_OPACITY, fixtureU32(128))] }),
        layer({ name: "none" }),
      ],
    });

    const result = await importXcf(bytes);

    expect(result.layers[0]?.opacity).toBeCloseTo(0.25, 6);
    expect(result.layers[1]?.opacity).toBeCloseTo(128 / 255, 6);
    expect(result.layers[2]?.opacity).toBe(1);
  });

  it("합성 속성은 음수(자동)를 절댓값으로 바꾸고, 알 수 없는 모드는 숫자를 보존하며 경고한다", async () => {
    const bytes = fixture({
      layers: [
        layer({
          name: "composite",
          props: [
            fixtureProp(PROP_MODE, fixtureU32(99)),
            fixtureProp(PROP_COMPOSITE_MODE, fixtureI32(-1)),
            fixtureProp(PROP_COMPOSITE_SPACE, fixtureI32(-2)),
            fixtureProp(PROP_BLEND_SPACE, fixtureU32(0)),
          ],
        }),
      ],
    });

    const result = await importXcf(bytes);

    expect(result.layers[0]).toMatchObject({
      mode: { id: 99, name: null, legacy: false },
      compositeMode: 1,
      compositeSpace: 2,
      blendSpace: 0,
    });
    expect(codes(result.warnings)).toEqual(["xcf-unknown-layer-mode"]);
  });

  it("구버전 색지도의 잘못된 기록 길이와 사용자 단위의 잘못된 길이를 건너뛰고 뒤 속성을 읽는다", async () => {
    const colormap = Uint8Array.from([...fixtureU32(2), 1, 2, 3, 4, 5, 6]);
    const userUnit = Uint8Array.from([
      ...fixtureF32(1),
      ...fixtureU32(2),
      ...fixtureString("in"),
      ...fixtureString("inch"),
      ...fixtureString("inches"),
      ...fixtureString("a"),
      ...fixtureString("b"),
    ]);
    const bytes = fixture({
      baseType: 2,
      imageProps: [
        // 3n+4 = 10바이트인데 n+4 = 6으로 기록된 구버전 색지도
        fixtureProp(PROP_COLORMAP, colormap, 6),
        // 모든 릴리스가 잘못된 길이를 기록한다는 사용자 단위
        fixtureProp(PROP_USER_UNIT, userUnit, 0),
        fixtureProp(PROP_RESOLUTION, Uint8Array.from([...fixtureF32(300), ...fixtureF32(150)])),
      ],
      layers: [layer({ name: "I", type: 4, bytesPerPixel: 1, raw: Uint8Array.from({ length: 12 }, (_, index) => index % 2) })],
    });

    const result = await importXcf(bytes);

    expect(result.image.paletteSize).toBe(2);
    // 해상도는 big-endian이 맞고, 뒤 속성이 올바른 자리에서 읽혔다는 증거다.
    expect(result.image.resolutionPpi).toEqual({ x: 300, y: 150 });
    expect(codes(result.warnings)).toEqual(["xcf-colormap-length-mismatch"]);
    expect([...(result.layers[0]?.pixels?.subarray(0, 8) ?? [])]).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
  });

  it("파라사이트 이름과 ICC 프로파일 유무를 읽고, 손상된 목록은 경고로 남긴다", async () => {
    const parasite = (name: string, data: number[]) =>
      Uint8Array.from([...fixtureString(name), ...fixtureU32(1), ...fixtureU32(data.length), ...data]);
    const good = Uint8Array.from([...parasite("gimp-comment", [1, 2]), ...parasite("icc-profile", [9])]);
    const bad = Uint8Array.from([...fixtureString("broken"), ...fixtureU32(0), ...fixtureU32(1000)]);

    const ok = await importXcf(fixture({ imageProps: [fixtureProp(PROP_PARASITES, good)], layers: [layer({ name: "L" })] }));
    const broken = await importXcf(fixture({ imageProps: [fixtureProp(PROP_PARASITES, bad)], layers: [layer({ name: "L" })] }));

    expect(ok.image.parasiteNames).toEqual(["gimp-comment", "icc-profile"]);
    expect(ok.image.hasIccProfile).toBe(true);
    expect(ok.warnings).toEqual([]);
    expect(codes(broken.warnings)).toEqual(["xcf-parasites-invalid"]);
  });

  it("v10 이하에 정밀도 필드가 있으면 미검증 경고를 남긴다", async () => {
    const make = (tag: string, pointerBytes: 4 | 8) =>
      buildXcfFixture({
        tag,
        width: 4,
        height: 3,
        baseType: 0,
        precision: 150,
        pointerBytes,
        compression: 1,
        layers: [layer({ name: "L", raw: patterned(4, 3, 4, 1) })],
      });

    const old = await importXcf(make("v010", 4));
    const current = await importXcf(make("v011", 8));

    expect(codes(old.warnings)).toEqual(["xcf-precision-field-unverified"]);
    expect(old.layers[0]?.pixels).not.toBeNull();
    expect(current.warnings).toEqual([]);
  });

  it("이미지 채널과 레이어 마스크는 읽지 않고 진단한다", async () => {
    const result = await importXcf(
      fixture({ channelCount: 2, layers: [layer({ name: "Masked", hasMaskPointer: true })] }),
    );

    expect(result.image.channelCount).toBe(2);
    expect(result.layers[0]?.hasLayerMask).toBe(true);
    expect(codes(result.warnings)).toEqual(["xcf-channels-not-decoded"]);
    expect(codes(result.unsupported)).toEqual(["xcf-layer-mask-not-decoded"]);
  });

  it("압축 속성이 없거나 지원하지 않는 값이면 픽셀을 만들지 않고 진단한다", async () => {
    const missing = await importXcf(fixture({ omitCompression: true, layers: [layer({ name: "L" })] }));
    const fractal = await importXcf(fixture({ compression: 3, layers: [layer({ name: "L" })] }));

    for (const result of [missing, fractal]) {
      expect(result.layers[0]?.pixels).toBeNull();
      expect(codes(result.unsupported)).toEqual(["xcf-compression-unsupported"]);
    }
    expect(missing.image.compression).toBeNull();
    expect(fractal.image.compression).toBe(3);
  });
});

describe("XCF 가져오기: 레이어 그룹", () => {
  it("항목 경로로 부모를 복원하고 숨긴 그룹의 하위를 실효 불가시로 계산한다", async () => {
    const path = (...indices: number[]) => fixtureProp(PROP_ITEM_PATH, Uint8Array.from(indices.flatMap((index) => [...fixtureU32(index)])));
    const bytes = fixture({
      layers: [
        layer({ name: "G", props: [fixtureProp(PROP_GROUP_ITEM, new Uint8Array(0)), fixtureProp(PROP_VISIBLE, fixtureU32(0))] }),
        layer({ name: "child1", props: [path(0, 0)] }),
        layer({ name: "child2", props: [path(0, 1)] }),
        layer({ name: "inner", props: [fixtureProp(PROP_GROUP_ITEM, new Uint8Array(0)), path(0, 2)] }),
        layer({ name: "grandchild", props: [path(0, 2, 0)] }),
        layer({ name: "bg" }),
      ],
    });

    const result = await importXcf(bytes);

    expect(result.layers.map((entry) => entry.kind)).toEqual(["group", "raster", "raster", "group", "raster", "raster"]);
    expect(result.layers.map((entry) => entry.parentIndex)).toEqual([null, 0, 0, 0, 3, null]);
    expect(result.layers.map((entry) => entry.effectiveVisible)).toEqual([false, false, false, false, false, true]);
    expect(result.layers[4]?.groupPath).toEqual([0, 2, 0]);
    expect(result.layers[0]?.pixels).toBeNull();
    expect(result.layers[1]?.pixels).not.toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it("부모를 찾을 수 없는 경로는 최상위로 두고 경고한다", async () => {
    const orphan = fixtureProp(PROP_ITEM_PATH, Uint8Array.from([...fixtureU32(7), ...fixtureU32(0)]));

    const result = await importXcf(fixture({ layers: [layer({ name: "orphan", props: [orphan] })] }));

    expect(result.layers[0]?.parentIndex).toBeNull();
    expect(codes(result.warnings)).toEqual(["xcf-group-path-unresolved"]);
  });
});

describe("XCF 가져오기: 거부와 한도", () => {
  const valid = () => fixture({ layers: [layer({ name: "L", raw: patterned(4, 3, 4, 1) })] });

  it("XCF가 아니거나 지원하지 않는 버전은 전용 오류로 거부한다", async () => {
    const withTag = (tag: string) => {
      const bytes = valid();
      bytes.set(new TextEncoder().encode(tag), 9);
      return bytes;
    };

    expect(await xcfErrorCode(() => importXcf(new TextEncoder().encode("not an xcf file at all")))).toBe("magic-invalid");
    expect(await xcfErrorCode(() => importXcf(new Uint8Array(3)))).toBe("magic-invalid");
    expect(await xcfErrorCode(() => importXcf(withTag("vxyz")))).toBe("magic-invalid");
    expect(await xcfErrorCode(() => importXcf(withTag("v100")))).toBe("version-unsupported");
    expect(await xcfErrorCode(() => importXcf(withTag("v005")))).toBe("version-unsupported");
    expect(await xcfErrorCode(() => importXcf(withTag("v027")))).toBe("version-unsupported");
  });

  it("알 수 없는 정밀도와 0 크기 캔버스와 알 수 없는 색 모드는 거부한다", async () => {
    const unknownPrecision = buildXcfFixture({
      tag: "v011",
      width: 4,
      height: 3,
      baseType: 0,
      precision: 123,
      pointerBytes: 8,
      compression: 1,
      layers: [],
    });
    const zero = buildXcfFixture({ tag: "v003", width: 0, height: 3, baseType: 0, pointerBytes: 4, compression: 1, layers: [] });
    const badBase = buildXcfFixture({ tag: "v003", width: 4, height: 3, baseType: 7, pointerBytes: 4, compression: 1, layers: [] });

    expect(await xcfErrorCode(() => importXcf(unknownPrecision))).toBe("precision-unsupported");
    expect(await xcfErrorCode(() => importXcf(zero))).toBe("structure-invalid");
    expect(await xcfErrorCode(() => importXcf(badBase))).toBe("structure-invalid");
  });

  it("inspectXcfHeader는 포인터 폭과 정밀도를 돌려준다", () => {
    const v003 = inspectXcfHeader(valid());
    const v011 = inspectXcfHeader(
      buildXcfFixture({ tag: "v011", width: 9, height: 8, baseType: 1, precision: 250, pointerBytes: 8, compression: 1, layers: [] }),
    );

    expect(v003).toMatchObject({ versionTag: "v003", version: 3, width: 130, height: 70, baseType: "rgb", precision: 150, pointerBytes: 4 });
    expect(v011).toMatchObject({ version: 11, width: 9, height: 8, baseType: "grayscale", precision: 250, pointerBytes: 8 });
  });

  it("낮춘 한도는 적용되고, 올리거나 잘못된 한도는 거부한다", async () => {
    const two = fixture({ layers: [layer({ name: "A" }), layer({ name: "B" })] });

    expect(await xcfErrorCode(() => importXcf(two, { limits: { maxLayers: 1 } }))).toBe("limit-exceeded");
    expect(await xcfErrorCode(() => importXcf(two, { limits: { maxBytes: 10 } }))).toBe("source-too-large");
    expect(await xcfErrorCode(() => importXcf(two, { limits: { maxCanvasDimension: 100 } }))).toBe("limit-exceeded");
    expect(await xcfErrorCode(() => importXcf(two, { limits: { maxLayers: -1 } }))).toBe("source-too-large");
    expect(await xcfErrorCode(() => importXcf(two, { limits: { maxLayers: XCF_LIMITS.maxLayers + 1 } }))).toBe("source-too-large");
  });

  it("디코드 예산을 넘는 레이어는 픽셀 없이 진단한다", async () => {
    const bytes = fixture({ layers: [layer({ name: "A", raw: patterned(4, 3, 4, 1) }), layer({ name: "B", raw: patterned(4, 3, 4, 2) })] });

    // 한 레이어는 4x3x4 = 48바이트이므로 예산 60이면 첫 레이어만 디코드된다.
    const result = await importXcf(bytes, { limits: { maxDecodedBytes: 60 } });

    expect(result.layers[0]?.pixels).not.toBeNull();
    expect(result.layers[1]?.pixels).toBeNull();
    expect(codes(result.unsupported)).toEqual(["xcf-decode-budget-exceeded"]);
  });

  it("이미 중단된 신호는 aborted로 거부한다", async () => {
    const controller = new AbortController();
    controller.abort();

    expect(await xcfErrorCode(() => importXcf(valid(), { signal: controller.signal }))).toBe("aborted");
  });

  it("레이어 하나의 구조가 손상돼도 나머지 레이어는 가져온다", async () => {
    const bytes = fixture({
      layers: [layer({ name: "bad", type: 9 }), layer({ name: "good", raw: patterned(4, 3, 4, 3) })],
    });

    const result = await importXcf(bytes);

    expect(result.image.layerCount).toBe(2);
    expect(result.layers.map((entry) => entry.name)).toEqual(["good"]);
    expect(codes(result.unsupported)).toEqual(["xcf-layer-structure-invalid"]);
  });

  it("타일 데이터가 손상된 레이어는 픽셀 없이 진단하고 다른 레이어는 영향받지 않는다", async () => {
    // 평면 12픽셀보다 큰 긴 반복(127, 횟수 0xffff)으로 타일 본문을 대체한다.
    const corrupt = Uint8Array.of(127, 0xff, 0xff, 0x00);
    const bytes = fixture({
      layers: [
        layer({ name: "first", raw: patterned(4, 3, 4, 1) }),
        layer({ name: "second", tileBytesOverride: corrupt }),
      ],
    });

    const result = await importXcf(bytes);

    expect(result.layers[0]?.pixels).not.toBeNull();
    expect(result.layers[1]?.pixels).toBeNull();
    expect(codes(result.unsupported)).toEqual(["xcf-tile-decode-failed"]);
  });
});

describe("XCF 가져오기: 결정성과 견고성", () => {
  const base = () =>
    fixture({
      width: 70,
      height: 66,
      layers: [
        layer({ name: "A", width: 70, height: 66, raw: patterned(70, 66, 4, 1), props: [fixtureProp(PROP_OPACITY, fixtureU32(200))] }),
        layer({ name: "B", width: 70, height: 66, type: 0, bytesPerPixel: 3, raw: patterned(70, 66, 3, 2) }),
      ],
    });

  it("같은 입력은 같은 결과를 낸다", async () => {
    expect(await importXcf(base())).toEqual(await importXcf(base()));
  });

  it("한 바이트를 바꿔도 XcfError 또는 진단이 있는 결과일 뿐 다른 예외는 없다", async () => {
    const original = base();
    let checked = 0;
    for (let position = 0; position < original.length; position += 29) {
      const mutated = new Uint8Array(original);
      mutated[position] = (mutated[position] ?? 0) ^ 0xff;
      try {
        const result: XcfImportResult = await importXcf(mutated);
        expect(result.format).toBe("xcf");
      } catch (error) {
        expect(error).toBeInstanceOf(XcfError);
      }
      checked += 1;
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("어느 지점에서 잘려도 XcfError 또는 진단이 있는 결과일 뿐 다른 예외는 없다", async () => {
    const original = base();
    let checked = 0;
    for (let length = 0; length < original.length; length += 53) {
      try {
        const result = await importXcf(original.subarray(0, length));
        expect(result.format).toBe("xcf");
      } catch (error) {
        expect(error).toBeInstanceOf(XcfError);
      }
      checked += 1;
    }
    expect(checked).toBeGreaterThan(50);
  });
});
