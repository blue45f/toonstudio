import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  buildClipDocument,
  fixtureExternalId,
  FIXTURE_CANVAS_ID,
  type FixtureDocumentSpec,
  type FixtureLayer,
} from "../../../../tests/corpus/formats/chunked-sqlite-document-fixtures";
import { codeOf, codes, importSpec, layerNamed, maskOf, pattern, rasterLayer, sameBytes } from "../../../../tests/corpus/formats/chunked-sqlite-document-test-kit";
import { createNodeSqliteOpener, openNodeSqlite, type NodeSqliteCallLog } from "../../../../tests/corpus/formats/node-sqlite-clip-reader";
import { encodeClipContainer, encodeClipHeadPayload } from "../chunked-sqlite-container";
import { CLIP_BY_DESIGN_UNSUPPORTED_CODES, CLIP_DOCUMENT_LIMITS, importChunkedSqliteDocument, type ClipDocumentImportOptions, type ClipLayer } from "../chunked-sqlite-document";

describe("importChunkedSqliteDocument: 기본 문서", () => {
  it("캔버스와 래스터 레이어 하나를 픽셀 단위로 정확히 읽는다(블록 경계를 넘는 300x200)", async () => {
    const result = await importSpec({
      canvas: { width: 300, height: 200 },
      layers: [{ id: 1, children: [2] }, rasterLayer(2, "배경", 300, 200)],
    });

    expect(result.format).toBe("clip-document");
    expect(result.specProfile).toBe("clip-secondary-spec");
    expect(result.canvas).toMatchObject({ id: FIXTURE_CANVAS_ID, width: 300, height: 200, unit: "px", unitCode: 0, sizeSource: "pixel-unit", rootFolderId: 1, defaultColorType: 0, channelBytes: 1 });
    expect(result.layers).toHaveLength(1);
    const layer = result.layers[0]!;
    expect(layer).toMatchObject({ index: 0, id: 2, parentIndex: null, depth: 0, kind: "raster", name: "배경", colorMode: "color", extent: { x: 0, y: 0, width: 300, height: 200 } });
    expect(layer.pixels?.byteLength).toBe(300 * 200 * 4);
    const expected = new Uint8Array(300 * 200 * 4);
    for (let y = 0; y < 200; y += 1) {
      for (let x = 0; x < 300; x += 1) expected.set(pattern(x, y), (y * 300 + x) * 4);
    }
    expect(sameBytes(layer.pixels, expected)).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.unsupported).toEqual([]);
    expect(result.previewPng).toBeNull();
  });

  it("원본 길이와 SHA-256을 담고 입력 바이트를 바꾸지 않는다", async () => {
    const built = buildClipDocument({ layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 8, 8)] });
    const before = new Uint8Array(built.bytes);
    const result = await importChunkedSqliteDocument(built.bytes, { openSqlite: openNodeSqlite });

    expect(result.source).toEqual({ byteLength: built.bytes.byteLength, sha256: createHash("sha256").update(built.bytes).digest("hex") });
    expect(sameBytes(built.bytes, before)).toBe(true);
  });

  it("Blob·ArrayBuffer·Uint8Array 입력이 같은 결과를 낸다", async () => {
    const built = buildClipDocument({ layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 8, 8)] });
    const fromBytes = await importChunkedSqliteDocument(built.bytes, { openSqlite: openNodeSqlite });
    const fromBuffer = await importChunkedSqliteDocument(built.bytes.buffer.slice(built.bytes.byteOffset, built.bytes.byteOffset + built.bytes.byteLength) as ArrayBuffer, { openSqlite: openNodeSqlite });
    const fromBlob = await importChunkedSqliteDocument(new Blob([built.bytes as Uint8Array<ArrayBuffer>]), { openSqlite: openNodeSqlite });

    for (const other of [fromBuffer, fromBlob]) {
      expect(other.source).toEqual(fromBytes.source);
      expect(other.layers[0]!.name).toBe("a");
      expect(sameBytes(other.layers[0]!.pixels, fromBytes.layers[0]!.pixels!)).toBe(true);
    }
  });

  it("같은 입력은 같은 결과를 낸다", async () => {
    const built = buildClipDocument({ layers: [{ id: 1, children: [2, 3] }, rasterLayer(2, "a", 20, 20), rasterLayer(3, "b", 5, 5, { opacity: 99 })] });
    const first = await importChunkedSqliteDocument(built.bytes, { openSqlite: openNodeSqlite });
    const second = await importChunkedSqliteDocument(built.bytes, { openSqlite: openNodeSqlite });

    expect(second).toEqual(first);
  });
});

describe("importChunkedSqliteDocument: 레이어 트리", () => {
  const treeSpec: FixtureDocumentSpec = {
    layers: [
      { id: 1, children: [2, 3, 4] },
      rasterLayer(2, "bottom", 4, 4),
      { id: 3, name: "group", folder: true, children: [5, 6] },
      rasterLayer(5, "g-bottom", 4, 4),
      rasterLayer(6, "g-top", 4, 4),
      rasterLayer(4, "top", 4, 4),
    ],
  };

  it("위쪽 레이어가 먼저 오는 깊이 우선 순서로 평탄화하고 부모·깊이를 채운다", async () => {
    const result = await importSpec(treeSpec);

    expect(result.layers.map((layer) => [layer.index, layer.name, layer.depth, layer.parentIndex])).toEqual([
      [0, "top", 0, null],
      [1, "group", 0, null],
      [2, "g-top", 1, 1],
      [3, "g-bottom", 1, 1],
      [4, "bottom", 0, null],
    ]);
    expect(result.layers.map((layer) => layer.kind)).toEqual(["raster", "folder", "raster", "raster", "raster"]);
    expect(result.layers.map((layer) => layer.id)).toEqual([4, 3, 6, 5, 2]);
  });

  it("폴더가 숨겨지면 자식의 effectiveVisible이 꺼지고 자신의 visible은 그대로다", async () => {
    const result = await importSpec({
      layers: [
        { id: 1, children: [2, 3] },
        { id: 2, name: "hidden-group", folder: true, visibility: 0, children: [4] },
        { id: 3, name: "shown-group", folder: true, visibility: 1, children: [5] },
        rasterLayer(4, "in-hidden", 4, 4),
        rasterLayer(5, "in-shown", 4, 4, { visibility: 0 }),
      ],
    });

    const flags = Object.fromEntries(result.layers.map((layer) => [layer.name, [layer.visible, layer.effectiveVisible]]));
    expect(flags).toEqual({
      "hidden-group": [false, false],
      "in-hidden": [true, false],
      "shown-group": [true, true],
      "in-shown": [false, false],
    });
  });

  it("LayerVisibility 비트: 0 = 표시, 1 = 마스크 사용, 원본 값은 그대로 남긴다", async () => {
    const result = await importSpec({
      layers: [{ id: 1, children: [2, 3, 4] }, rasterLayer(2, "v0", 4, 4, { visibility: 0 }), rasterLayer(3, "v1", 4, 4, { visibility: 1 }), rasterLayer(4, "v5", 4, 4, { visibility: 5 })],
    });

    expect(result.layers.map((layer) => [layer.name, layer.visible, layer.visibilityRaw])).toEqual([
      ["v5", true, 5],
      ["v1", true, 1],
      ["v0", false, 0],
    ]);
  });

  it("루트에서 닿지 않는 행은 읽지 않고 개수를 경고한다", async () => {
    const result = await importSpec({ layers: [{ id: 1, children: [2] }, rasterLayer(2, "linked", 4, 4), rasterLayer(7, "orphan-a", 4, 4), rasterLayer(8, "orphan-b", 4, 4)] });

    expect(result.layers.map((layer) => layer.name)).toEqual(["linked"]);
    expect(result.warnings.filter((issue) => issue.code === "clip-layer-unreachable")).toHaveLength(1);
    expect(result.warnings.find((issue) => issue.code === "clip-layer-unreachable")!.message).toContain("2개");
  });

  it("연결 순환은 그 연결을 끊고 경고한다", async () => {
    const result = await importSpec({
      layers: [{ id: 1, children: [2, 3] }, rasterLayer(2, "first", 4, 4), rasterLayer(3, "second", 4, 4, { overrides: { LayerNextIndex: 2 } })],
    });

    expect(result.layers.map((layer) => layer.name)).toEqual(["second", "first"]);
    expect(codes(result.warnings)).toContain("clip-layer-link-cycle");
  });

  it("없는 행을 가리키는 연결은 거기서 끊고 경고한다", async () => {
    const result = await importSpec({ layers: [{ id: 1, children: [2] }, rasterLayer(2, "only", 4, 4, { overrides: { LayerNextIndex: 99 } })] });

    expect(result.layers.map((layer) => layer.name)).toEqual(["only"]);
    expect(codes(result.warnings)).toContain("clip-layer-link-missing");
  });

  it("폴더가 아닌 레이어의 자식 연결은 따라가지 않는다", async () => {
    const result = await importSpec({
      layers: [{ id: 1, children: [2] }, rasterLayer(2, "leaf", 4, 4, { overrides: { LayerFirstChildIndex: 3 } }), rasterLayer(3, "child", 4, 4)],
    });

    expect(result.layers.map((layer) => layer.name)).toEqual(["leaf"]);
    expect(codes(result.warnings)).toContain("clip-layer-children-ignored");
  });

  it("한 레이어가 두 폴더에서 연결되면 처음 닿은 곳에만 나온다", async () => {
    const result = await importSpec({
      layers: [
        { id: 1, children: [2, 3] },
        { id: 2, name: "a", folder: true, children: [4] },
        { id: 3, name: "b", folder: true, overrides: { LayerFirstChildIndex: 4 } },
        rasterLayer(4, "shared", 4, 4),
      ],
    });

    expect(result.layers.filter((layer) => layer.name === "shared")).toHaveLength(1);
    expect(codes(result.warnings)).toContain("clip-layer-link-cycle");
  });

  it("다른 캔버스의 Layer 행은 섞이지 않는다", async () => {
    const result = await importSpec({ layers: [{ id: 1, children: [2] }, rasterLayer(2, "mine", 4, 4)], extraLayers: [{ canvasId: 9, id: 50, name: "other-canvas" }] });

    expect(result.layers.map((layer) => layer.name)).toEqual(["mine"]);
    expect(result.warnings).toEqual([]);
  });
});

describe("importChunkedSqliteDocument: 레이어 속성", () => {
  it.each([
    [0, 0],
    [64, 0.25],
    [128, 0.5],
    [256, 1],
    [300, 1],
    [-5, 0],
  ])("불투명도 원본 %i는 %f로 환산한다(0~256, 범위 밖은 잘라낸다)", async (raw, expected) => {
    const result = await importSpec({ layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 4, 4, { opacity: raw })] });

    expect(result.layers[0]).toMatchObject({ opacity: expected, opacityRaw: raw });
  });

  it("합성 모드: 알려진 값은 ID로, 모르는 값은 null로 두되 원본 값을 남긴다", async () => {
    const known: Array<[number, string]> = [
      [0, "normal"], [1, "darken"], [2, "multiply"], [3, "color-burn"], [4, "linear-burn"], [5, "subtract"], [6, "darker-color"], [7, "lighten"],
      [8, "screen"], [9, "color-dodge"], [10, "glow-dodge"], [11, "add"], [12, "glow-add"], [13, "lighter-color"], [14, "overlay"], [15, "soft-light"],
      [16, "hard-light"], [17, "vivid-light"], [18, "linear-light"], [19, "pin-light"], [20, "hard-mix"], [21, "difference"], [22, "exclusion"], [23, "hue"],
      [24, "saturation"], [25, "color"], [26, "luminosity"], [30, "pass-through"], [36, "divide"],
    ];
    const unknown = [27, 28, 29, 31, 35, 37, 99, -1];
    const all = [...known.map(([raw]) => raw), ...unknown];
    const result = await importSpec({
      layers: [{ id: 1, children: all.map((_, index) => 10 + index) }, ...all.map((raw, index) => rasterLayer(10 + index, `m${raw}`, 2, 2, { composite: raw }))],
    });

    for (const [raw, id] of known) expect(layerNamed(result, `m${raw}`)).toMatchObject({ compositeRaw: raw, compositeMode: id });
    for (const raw of unknown) expect(layerNamed(result, `m${raw}`)).toMatchObject({ compositeRaw: raw, compositeMode: null });
  });

  it("통과(pass-through)는 폴더에서만 인정한다", async () => {
    const result = await importSpec({
      layers: [
        { id: 1, children: [2, 3, 4] },
        { id: 2, name: "pass-folder", folder: true, composite: 30 },
        { id: 3, name: "normal-folder", folder: true, composite: 0 },
        rasterLayer(4, "pass-raster", 2, 2, { composite: 30 }),
      ],
    });

    expect(layerNamed(result, "pass-folder").passThrough).toBe(true);
    expect(layerNamed(result, "normal-folder").passThrough).toBe(false);
    expect(layerNamed(result, "pass-raster").passThrough).toBe(false);
  });

  it("클리핑·잠금·UUID·폴더 플래그를 그대로 노출한다", async () => {
    const result = await importSpec({
      layers: [
        { id: 1, children: [2, 3] },
        rasterLayer(2, "plain", 2, 2),
        { id: 3, name: "g", folder: true, lock: 17, clip: 1, uuid: "11111111-2222-4333-8444-555555555555", overrides: { LayerFolder: 17 } },
      ],
    });

    expect(layerNamed(result, "plain")).toMatchObject({ clipToBelow: false, editLocked: false, transparencyLocked: false, lockRaw: 0, uuid: "00000000-0000-4000-8000-000000000002" });
    expect(layerNamed(result, "g")).toMatchObject({ kind: "folder", clipToBelow: true, editLocked: true, transparencyLocked: true, lockRaw: 17, folderFlags: 17, uuid: "11111111-2222-4333-8444-555555555555" });
  });

  it("잠금은 비트 0(편집)과 비트 4(투명 픽셀)만 풀어 읽고 나머지 비트는 원본 값으로만 남긴다", async () => {
    const lockOf = async (lock: number) => {
      const result = await importSpec({ layers: [{ id: 1, children: [2] }, { id: 2, name: "x", folder: true, lock }] });
      const layer = result.layers[0]!;
      return [layer.editLocked, layer.transparencyLocked, layer.lockRaw];
    };

    expect(await lockOf(1)).toEqual([true, false, 1]);
    expect(await lockOf(16)).toEqual([false, true, 16]);
    expect(await lockOf(17)).toEqual([true, true, 17]);
    expect(await lockOf(2)).toEqual([false, false, 2]);
    expect(await lockOf(4)).toEqual([false, false, 4]);
    expect(await lockOf(8)).toEqual([false, false, 8]);
    expect(await lockOf(32)).toEqual([false, false, 32]);
    expect(await lockOf(0)).toEqual([false, false, 0]);
  });

  it("레이어 색은 32비트 값의 상위 8비트이고 켜짐 여부를 따로 알린다", async () => {
    const result = await importSpec({
      layers: [
        { id: 1, children: [2, 3, 4] },
        { id: 2, name: "paper", layerType: 1584, drawColor: { r: 255, g: 128, b: 0 } },
        { id: 3, name: "off", folder: true, drawColor: { r: 1, g: 2, b: 3, enabled: false } },
        { id: 4, name: "none", folder: true, overrides: { DrawColorMainRed: null } },
      ],
    });

    expect(layerNamed(result, "paper")).toMatchObject({ kind: "paper", drawColor: { r: 255, g: 128, b: 0 }, drawColorEnabled: true });
    expect(layerNamed(result, "off")).toMatchObject({ drawColor: { r: 1, g: 2, b: 3 }, drawColorEnabled: false });
    expect(layerNamed(result, "none").drawColor).toBeNull();
  });

  it("긴 이름은 maxTextCharacters에서 자른다", async () => {
    const result = await importSpec(
      { layers: [{ id: 1, children: [2] }, { id: 2, name: "가".repeat(50), folder: true }] },
      { limits: { maxTextCharacters: 10 } },
    );

    expect(result.layers[0]!.name).toBe("가".repeat(10));
  });
});

describe("importChunkedSqliteDocument: 픽셀 위치", () => {
  it.each([
    [[0, 0], [0, 0], 0, 0],
    [[5, 6], [-5, -6], 0, 0],
    [[10, 20], [3, -4], 13, 16],
    [[-8, -9], [0, 0], -8, -9],
  ] as const)("레이어 오프셋 %j + 렌더 오프셋 %j = 왼쪽 위 (%i, %i)", async (offset, renderOffset, x, y) => {
    const result = await importSpec({ layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 6, 5, { offset, renderOffset })] });

    expect(result.layers[0]!.extent).toEqual({ x, y, width: 6, height: 5 });
    expect(result.layers[0]!.placement).toMatchObject({ layerOffsetX: offset[0], layerOffsetY: offset[1], renderOffsetX: renderOffset[0], renderOffsetY: renderOffset[1], drawToRenderOffscreenType: null });
  });

  it("DrawToRenderOffscreenType 원본 값을 placement로 노출하고 위치 계산에는 쓰지 않는다", async () => {
    const result = await importSpec({
      layers: [{ id: 1, children: [2, 3] }, rasterLayer(2, "typed", 4, 4, { offset: [3, 4], renderOffset: [-3, -4], drawToRenderType: 61 }), rasterLayer(3, "untyped", 4, 4, { offset: [3, 4], renderOffset: [-3, -4] })],
    });

    expect(layerNamed(result, "typed").placement.drawToRenderOffscreenType).toBe(61);
    expect(layerNamed(result, "untyped").placement.drawToRenderOffscreenType).toBeNull();
    expect(layerNamed(result, "typed").extent).toEqual({ x: 0, y: 0, width: 4, height: 4 });
    const noColumn = await importSpec({ layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 4, 4)], omitColumns: { Layer: ["DrawToRenderOffscreenType"] } });
    expect(noColumn.layers[0]!.placement.drawToRenderOffscreenType).toBeNull();
  });

  it("±(2^31−1)을 넘는 좌표는 그 레이어만 읽지 않고 unsupported로 남긴다(경계 포함)", async () => {
    const result = await importSpec({
      layers: [
        { id: 1, children: [2, 3, 4, 5, 6, 7] },
        rasterLayer(2, "far", 4, 4, { offset: [2 ** 31, 0] }),
        rasterLayer(3, "far-sum", 4, 4, { offset: [2 ** 31 - 5, 0], renderOffset: [10, 0] }),
        rasterLayer(4, "far-negative", 4, 4, { offset: [0, -(2 ** 31)] }),
        rasterLayer(5, "edge", 4, 4, { offset: [2 ** 31 - 1, 0] }),
        rasterLayer(6, "edge-negative", 4, 4, { offset: [0, -(2 ** 31 - 1)] }),
        rasterLayer(7, "edge-sum", 4, 4, { offset: [2 ** 31 - 11, 0], renderOffset: [10, 0] }),
      ],
    });

    for (const name of ["far", "far-sum", "far-negative"]) expect(layerNamed(result, name).pixels).toBeNull();
    for (const name of ["edge", "edge-negative", "edge-sum"]) expect(layerNamed(result, name).pixels).not.toBeNull();
    expect(result.unsupported.map((issue) => issue.code)).toEqual(["clip-layer-pixels-unreachable", "clip-layer-pixels-unreachable", "clip-layer-pixels-unreachable"]);
    expect(result.unsupported[0]!.path).toContain("far");
  });
});

describe("importChunkedSqliteDocument: 색 형식과 초기 색", () => {
  it("회색 8비트 레이어는 R=G=B=회색이고 colorMode가 gray다", async () => {
    const result = await importSpec({
      layers: [{ id: 1, children: [2] }, { id: 2, name: "gray", raster: { width: 5, height: 4, kind: "gray8", pixelAt: (x, y) => [x * 40 + y, 255 - x] } }],
    });

    const layer = result.layers[0]!;
    expect(layer.colorMode).toBe("gray");
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 5; x += 1) {
        const gray = x * 40 + y;
        expect(Array.from(layer.pixels!.subarray((y * 5 + x) * 4, (y * 5 + x) * 4 + 4))).toEqual([gray, gray, gray, 255 - x]);
      }
    }
  });

  it("데이터 없는 블록은 초기 색을 따르고 initialPixel로도 알린다", async () => {
    const result = await importSpec({
      layers: [
        { id: 1, children: [2, 3] },
        { id: 2, name: "red", raster: { width: 300, height: 10, kind: "rgba", hasColor: true, packedRgba: 0xff0000ff, emptyBlocks: new Set([0, 1]), pixelAt: () => [9, 9, 9, 9] } },
        { id: 3, name: "clear", raster: { width: 4, height: 4, kind: "rgba", emptyBlocks: new Set([0]), pixelAt: () => [9, 9, 9, 9] } },
      ],
    });

    const red = layerNamed(result, "red");
    expect(red.initialPixel).toEqual([255, 0, 0, 255]);
    expect(Array.from(red.pixels!.subarray(0, 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(red.pixels!.subarray(red.pixels!.byteLength - 4))).toEqual([255, 0, 0, 255]);
    expect(layerNamed(result, "clear").initialPixel).toEqual([0, 0, 0, 0]);
  });
});

describe("importChunkedSqliteDocument: 마스크", () => {
  it("마스크 값과 위치를 읽고 LayerVisibility 비트 1을 enabled로 노출한다", async () => {
    const result = await importSpec({
      layers: [
        { id: 1, children: [2, 3] },
        rasterLayer(2, "masked", 8, 8, { mask: maskOf(8, 6), offset: [3, 4], maskOffset: [1, 2], maskRenderOffset: [10, 20] }),
        rasterLayer(3, "mask-off", 8, 8, { mask: maskOf(2, 2), visibility: 1 }),
      ],
    });

    const masked = layerNamed(result, "masked");
    expect(masked.mask).toMatchObject({ enabled: true, extent: { x: 3 + 1 + 10, y: 4 + 2 + 20, width: 8, height: 6 } });
    const values = new Uint8Array(8 * 6);
    for (let y = 0; y < 6; y += 1) for (let x = 0; x < 8; x += 1) values[y * 8 + x] = (x * 11 + y * 5) & 255;
    expect(sameBytes(masked.mask!.values, values)).toBe(true);
    expect(masked.pixels).not.toBeNull();
    expect(layerNamed(result, "mask-off").mask).toMatchObject({ enabled: false });
  });

  it("마스크의 바깥 값은 InitColor에서 온다: 색이 있으면 알파 바이트, 없으면 0", async () => {
    const result = await importSpec({
      layers: [
        { id: 1, children: [2, 3, 4] },
        rasterLayer(2, "visible-outside", 4, 4, { mask: maskOf(4, 4, { hasColor: true, packedRgba: 0xffffffff, emptyBlocks: new Set([0]) }) }),
        rasterLayer(3, "half-outside", 4, 4, { mask: maskOf(4, 4, { hasColor: true, packedRgba: 0x00000080, emptyBlocks: new Set([0]) }) }),
        rasterLayer(4, "hidden-outside", 4, 4, { mask: maskOf(4, 4, { emptyBlocks: new Set([0]) }) }),
      ],
    });

    expect(layerNamed(result, "visible-outside").mask).toMatchObject({ defaultValue: 255 });
    expect(Array.from(layerNamed(result, "visible-outside").mask!.values!)).toEqual(new Array(16).fill(255));
    expect(layerNamed(result, "half-outside").mask).toMatchObject({ defaultValue: 128 });
    expect(layerNamed(result, "hidden-outside").mask).toMatchObject({ defaultValue: 0 });
    expect(Array.from(layerNamed(result, "hidden-outside").mask!.values!)).toEqual(new Array(16).fill(0));
  });

  it("폴더의 마스크도 읽는다", async () => {
    const result = await importSpec({ layers: [{ id: 1, children: [2] }, { id: 2, name: "folder", folder: true, mask: maskOf(4, 4), visibility: 3 }] });

    expect(result.layers[0]!.mask).not.toBeNull();
    expect(result.layers[0]!.pixels).toBeNull();
  });

  it("마스크를 읽지 못해도 레이어 픽셀은 남고 unsupported에 이유를 적는다", async () => {
    const result = await importSpec({
      layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 4, 4, { mask: { ...maskOf(4, 4), scale: 50 } })],
    });

    expect(result.layers[0]!.pixels).not.toBeNull();
    expect(result.layers[0]!.mask).toBeNull();
    expect(codes(result.unsupported)).toEqual(["clip-layer-mask-scale"]);
  });

  it("마스크 오프스크린이 색 형식이면 읽지 않는다", async () => {
    const result = await importSpec({
      layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 4, 4, { mask: { width: 4, height: 4, kind: "rgba", pixelAt: pattern } })],
    });

    expect(result.layers[0]!.mask).toBeNull();
    expect(codes(result.unsupported)).toEqual(["clip-offscreen-format"]);
  });

  it("레이어 오프스크린이 마스크 형식이면 레이어 픽셀로 읽지 않는다", async () => {
    const result = await importSpec({ layers: [{ id: 1, children: [2] }, { id: 2, name: "a", layerType: 1, raster: { width: 4, height: 4, kind: "mask8", pixelAt: () => [200] } }] });

    expect(result.layers[0]!.pixels).toBeNull();
    expect(codes(result.unsupported)).toEqual(["clip-offscreen-format"]);
  });
});

describe("importChunkedSqliteDocument: 레이어 종류", () => {
  const blob = Uint8Array.of(1, 2, 3);
  const kindOf = async (layer: Partial<FixtureLayer>, extra: Partial<FixtureDocumentSpec> = {}): Promise<ClipLayer> => {
    const result = await importSpec({ layers: [{ id: 1, children: [2] }, { id: 2, name: "x", ...layer }], ...extra });
    return result.layers[0]!;
  };

  it.each([
    ["paper", { layerType: 1584 }],
    ["story-info", { layerType: 800 }],
    ["folder", { folder: true }],
    ["text", { layerType: 1, overrides: { TextLayerString: blob } }],
    ["fill", { layerType: 1, overrides: { GradationFillInfo: blob } }],
    ["adjustment", { layerType: 1, overrides: { FilterLayerInfo: blob } }],
    ["adjustment", { layerType: 4098 }],
    ["model3d", { layerType: 1, overrides: { FirstLayerObject: 5 } }],
    ["image-material", { layerType: 1, overrides: { ResizableImageInfo: Uint8Array.of(1, 2, 3) } }],
    ["raster", { layerType: 1 }],
    ["raster", { layerType: 3 }],
    ["vector", { layerType: 0, overrides: { VectorNormalStrokeIndex: blob } }],
    ["other", { layerType: 0 }],
    ["other", { layerType: 512 }],
  ] as const)("%s 레이어를 판정한다", async (kind, layer) => {
    expect((await kindOf(layer)).kind).toBe(kind);
  });

  it("VectorObjectList에 든 레이어는 LayerType이 래스터여도 벡터다", async () => {
    expect((await kindOf({ layerType: 1 }, { vectorLayerIds: [2] })).kind).toBe("vector");
    expect((await kindOf({ layerType: 1 })).kind).toBe("raster");
  });

  it("VectorObjectList 표가 없으면 그 표로는 벡터를 가리지 못하고 오류도 아니다", async () => {
    const result = await importSpec({ layers: [{ id: 1, children: [2] }, { id: 2, name: "x", layerType: 1 }], omitTables: ["VectorObjectList"] });

    expect(result.layers[0]!.kind).toBe("raster");
    expect(result.warnings).toEqual([]);
  });

  it("3D·화상 소재는 저장된 렌더 캐시 픽셀을 읽고 unsupported에 그 사실을 남긴다", async () => {
    const result = await importSpec({
      layers: [
        { id: 1, children: [2, 3] },
        { id: 2, name: "3d", raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern }, overrides: { FirstLayerObject: 2 } },
        { id: 3, name: "material", raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern }, overrides: { ResizableImageInfo: blob } },
      ],
    });

    expect(result.layers.map((layer) => layer.kind)).toEqual(["image-material", "model3d"]);
    expect(result.layers.every((layer) => layer.pixels !== null)).toBe(true);
    expect(codes(result.unsupported)).toEqual(["clip-layer-cache-only", "clip-layer-cache-only"]);
    expect(result.unsupported[0]!.path).toContain("id 3");
    expect(result.unsupported[1]!.path).toContain("id 2");
  });

  it("텍스트·벡터·채움 레이어는 저장된 픽셀이 있어도 읽지 않고 clip-layer-kind-not-rendered로 알린다", async () => {
    const result = await importSpec({
      layers: [
        { id: 1, children: [2, 3, 4] },
        { id: 2, name: "text", raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern }, overrides: { TextLayerString: blob } },
        { id: 3, name: "fill", raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern }, overrides: { GradationFillInfo: blob } },
        { id: 4, name: "vector", raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern } },
      ],
      vectorLayerIds: [4],
    });

    expect(result.layers.map((layer) => [layer.kind, layer.pixels])).toEqual([
      ["vector", null],
      ["fill", null],
      ["text", null],
    ]);
    expect(codes(result.unsupported)).toEqual(["clip-layer-kind-not-rendered", "clip-layer-kind-not-rendered", "clip-layer-kind-not-rendered"]);
    expect(result.unsupported.map((issue) => issue.scope)).toEqual(["semantic", "semantic", "semantic"]);
    expect(result.unsupported[0]!.message).toContain("벡터");
    expect(result.unsupported[1]!.message).toContain("채움");
    expect(result.unsupported[2]!.message).toContain("텍스트");
  });

  it("색조 보정·작품 정보·그 밖의 종류는 픽셀을 읽지 않는다", async () => {
    const result = await importSpec({
      layers: [
        { id: 1, children: [2, 3, 4] },
        { id: 2, name: "adj", raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern }, overrides: { FilterLayerInfo: blob } },
        { id: 3, name: "story", layerType: 800, raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern } },
        { id: 4, name: "other", layerType: 0, raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern } },
      ],
    });

    expect(result.layers.every((layer) => layer.pixels === null)).toBe(true);
    expect(codes(result.unsupported).sort()).toEqual(["clip-layer-adjustment-not-applied", "clip-layer-kind-unsupported", "clip-layer-kind-unsupported"]);
  });

  it("용지와 폴더는 픽셀을 읽지 않고 오류도 남기지 않는다", async () => {
    const result = await importSpec({ layers: [{ id: 1, children: [2, 3] }, { id: 2, name: "paper", layerType: 1584, drawColor: { r: 255, g: 255, b: 255 } }, { id: 3, name: "g", folder: true }] });

    expect(result.unsupported).toEqual([]);
  });

  it("래스터 연결이 없는 래스터 레이어는 빈 레이어로 두고 오류를 내지 않는다", async () => {
    const result = await importSpec({ layers: [{ id: 1, children: [2] }, { id: 2, name: "empty", layerType: 1 }] });

    expect(result.layers[0]).toMatchObject({ kind: "raster", pixels: null, extent: null });
    expect(result.unsupported).toEqual([]);
  });
});

describe("importChunkedSqliteDocument: 캔버스 크기", () => {
  const sizeOf = async (canvas: NonNullable<FixtureDocumentSpec["canvas"]>) => (await importSpec({ canvas, layers: [{ id: 1 }] })).canvas;

  it("픽셀 단위는 값 그대로다", async () => {
    expect(await sizeOf({ unit: 0, width: 640, height: 480 })).toMatchObject({ width: 640, height: 480, unit: "px", sizeSource: "pixel-unit" });
  });

  // 출처가 적은 기대값은 297 mm @ 600 dpi → 7016 하나뿐이다(S1). 나머지는 이 구현의 반올림 가정(가장 가까운 정수, 정확히 .5면 짝수)으로 계산한 값이다.
  it.each([
    ["mm", 2, 297, 210, 600, 7016, 4961],
    ["mm", 2, 210, 297, 350, 2894, 4093],
    ["cm", 1, 29.7, 21, 600, 7016, 4961],
    ["inch", 3, 8.5, 11, 300, 2550, 3300],
    ["pt", 5, 612, 792, 144, 1224, 1584],
  ] as const)("%s 단위를 dpi로 환산한다 (%f x %f @ %i dpi → %i x %i)", async (unit, code, width, height, dpi, widthPx, heightPx) => {
    expect(await sizeOf({ unit: code, width, height, resolution: dpi })).toMatchObject({ unit, unitCode: code, widthValue: width, heightValue: height, resolution: dpi, width: widthPx, height: heightPx, sizeSource: "unit-conversion" });
  });

  it("알 수 없는 단위 코드는 database-invalid다", async () => {
    expect(await codeOf(() => sizeOf({ unit: 4, width: 10, height: 10 }))).toBe("database-invalid");
  });

  it("해상도가 0 이하이면 픽셀이 아닌 단위는 환산할 수 없다", async () => {
    expect(await codeOf(() => sizeOf({ unit: 2, width: 100, height: 100, resolution: 0 }))).toBe("database-invalid");
    expect(await codeOf(() => sizeOf({ unit: 2, width: 100, height: 100, resolution: -5 }))).toBe("database-invalid");
  });

  it("크기가 1 미만이면 database-invalid, 한 변 한도를 넘으면 limit-exceeded다", async () => {
    expect(await codeOf(() => sizeOf({ width: 0, height: 10 }))).toBe("database-invalid");
    expect(await codeOf(() => sizeOf({ width: 10, height: 0.4 }))).toBe("database-invalid");
    expect(await codeOf(() => sizeOf({ width: 262_144, height: 1 }))).toBe("none");
    expect(await codeOf(() => sizeOf({ width: 262_145, height: 1 }))).toBe("limit-exceeded");
    expect(await codeOf(() => importSpec({ canvas: { width: 100, height: 100 }, layers: [{ id: 1 }] }, { limits: { maxCanvasDimension: 99 } }))).toBe("limit-exceeded");
  });

  it("기본 색 종류와 채널 바이트를 읽고, 그 열이 없으면 null이다", async () => {
    const withColumns = await sizeOf({ colorType: 1, channelBytes: 2 });
    expect(withColumns).toMatchObject({ defaultColorType: 1, channelBytes: 2 });
    const result = await importSpec({ layers: [{ id: 1 }], omitColumns: { Canvas: ["CanvasDefaultColorTypeIndex", "CanvasChannelBytes"] } });
    expect(result.canvas).toMatchObject({ defaultColorType: null, channelBytes: null });
  });

  it("Canvas 행이 여럿이면 첫 행만 읽고 경고한다", async () => {
    const result = await importSpec({ layers: [{ id: 1 }], canvasRows: 3 });

    expect(result.canvas.id).toBe(FIXTURE_CANVAS_ID);
    expect(codes(result.warnings)).toEqual(["clip-canvas-multiple"]);
  });
});

describe("importChunkedSqliteDocument: 미리보기", () => {
  const png = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5);

  it("PNG 서명이 있는 미리보기 바이트를 복사해 돌려준다", async () => {
    const result = await importSpec({ layers: [{ id: 1 }], preview: png });

    expect(sameBytes(result.previewPng, png)).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("PNG가 아니면 읽지 않고 경고한다", async () => {
    const result = await importSpec({ layers: [{ id: 1 }], preview: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8, 9) });

    expect(result.previewPng).toBeNull();
    expect(codes(result.warnings)).toEqual(["clip-preview-not-png"]);
  });

  it("서명이 일곱 바이트만 맞아도 PNG로 보지 않는다", async () => {
    const almost = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b, 1, 2);
    const result = await importSpec({ layers: [{ id: 1 }], preview: almost });

    expect(result.previewPng).toBeNull();
  });

  it("한도를 넘으면 읽지 않고 경고한다(경계 포함)", async () => {
    const atLimit = await importSpec({ layers: [{ id: 1 }], preview: png }, { limits: { maxPreviewBytes: png.byteLength } });
    const over = await importSpec({ layers: [{ id: 1 }], preview: png }, { limits: { maxPreviewBytes: png.byteLength - 1 } });

    expect(atLimit.previewPng).not.toBeNull();
    expect(over.previewPng).toBeNull();
    expect(codes(over.warnings)).toEqual(["clip-preview-too-large"]);
  });

  it("미리보기 표나 열이 없으면 null이고 경고도 없다", async () => {
    expect((await importSpec({ layers: [{ id: 1 }], omitTables: ["CanvasPreview"] })).previewPng).toBeNull();
    const noColumn = await importSpec({ layers: [{ id: 1 }], preview: png, omitColumns: { CanvasPreview: ["ImageData"] } });
    expect(noColumn.previewPng).toBeNull();
    expect(noColumn.warnings).toEqual([]);
    expect((await importSpec({ layers: [{ id: 1 }] })).previewPng).toBeNull();
  });

  it("decodePixels가 false여도 미리보기는 읽는다", async () => {
    const result = await importSpec({ layers: [{ id: 1 }], preview: png }, { decodePixels: false });

    expect(sameBytes(result.previewPng, png)).toBe(true);
  });
});

describe("importChunkedSqliteDocument: 입력과 컨테이너 오류", () => {
  const goodSpec: FixtureDocumentSpec = { layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 4, 4)] };

  it("openSqlite가 함수가 아니면 options-invalid다", async () => {
    const bytes = buildClipDocument(goodSpec).bytes;

    expect(await codeOf(() => importChunkedSqliteDocument(bytes, {} as ClipDocumentImportOptions))).toBe("options-invalid");
    expect(await codeOf(() => importChunkedSqliteDocument(bytes, { openSqlite: "x" as never }))).toBe("options-invalid");
    expect(await codeOf(() => importChunkedSqliteDocument(bytes, undefined as never))).toBe("options-invalid");
  });

  it("지원하지 않는 입력 형식은 source-invalid다", async () => {
    expect(await codeOf(() => importChunkedSqliteDocument("text" as never, { openSqlite: openNodeSqlite }))).toBe("source-invalid");
    expect(await codeOf(() => importChunkedSqliteDocument(null as never, { openSqlite: openNodeSqlite }))).toBe("source-invalid");
  });

  it("입력이 maxSourceBytes를 넘으면 source-too-large다(경계 포함)", async () => {
    const bytes = buildClipDocument(goodSpec).bytes;

    expect(await codeOf(() => importChunkedSqliteDocument(bytes, { openSqlite: openNodeSqlite, limits: { maxSourceBytes: bytes.byteLength } }))).toBe("none");
    expect(await codeOf(() => importChunkedSqliteDocument(bytes, { openSqlite: openNodeSqlite, limits: { maxSourceBytes: bytes.byteLength - 1 } }))).toBe("source-too-large");
    expect(await codeOf(() => importChunkedSqliteDocument(new Blob([bytes as Uint8Array<ArrayBuffer>]), { openSqlite: openNodeSqlite, limits: { maxSourceBytes: bytes.byteLength - 1 } }))).toBe("source-too-large");
  });

  it("CSFCHUNK가 아니면 container-invalid다", async () => {
    expect(await codeOf(() => importChunkedSqliteDocument(new Uint8Array(100), { openSqlite: openNodeSqlite }))).toBe("container-invalid");
    expect(await codeOf(() => importChunkedSqliteDocument(new Uint8Array(0), { openSqlite: openNodeSqlite }))).toBe("container-invalid");
  });

  it(".lip(SQLite 단독) 파일은 문서가 아니므로 container-invalid다", async () => {
    const database = buildClipDocument(goodSpec).databaseBytes;

    await expect(importChunkedSqliteDocument(database, { openSqlite: openNodeSqlite })).rejects.toMatchObject({ code: "container-invalid", message: expect.stringContaining(".lip") });
  });

  it("SQLite 구역이 없는 컨테이너는 container-invalid다", async () => {
    const bytes = encodeClipContainer({
      chunks: [
        { label: "Head", payload: encodeClipHeadPayload({ sqliteChunkOffset: 0 }) },
        { label: "Foot", payload: new Uint8Array(0) },
      ],
    });

    expect(await codeOf(() => importChunkedSqliteDocument(bytes, { openSqlite: openNodeSqlite }))).toBe("container-invalid");
  });

  it("SQLite 구역이 SQLite가 아니면 container-invalid다", async () => {
    const bytes = encodeClipContainer({
      chunks: [
        { label: "Head", payload: encodeClipHeadPayload({ sqliteChunkOffset: 0 }) },
        { label: "SQLi", payload: new Uint8Array(100) },
        { label: "Foot", payload: new Uint8Array(0) },
      ],
    });

    expect(await codeOf(() => importChunkedSqliteDocument(bytes, { openSqlite: openNodeSqlite }))).toBe("container-invalid");
  });

  it("푸터를 잘라 낸 컨테이너도 SQLite 구역이 온전하면 읽고, 컨테이너 진단을 경고로 옮긴다", async () => {
    const built = buildClipDocument(goodSpec);
    // 푸터 청크(머리 16바이트, 본문 없음)를 떼어 낸다. 선언 파일 길이는 그대로라 길이 불일치로 끊긴 것으로 보고된다.
    const result = await importChunkedSqliteDocument(built.bytes.subarray(0, built.bytes.byteLength - 16), { openSqlite: openNodeSqlite });

    expect(result.layers).toHaveLength(1);
    expect(codes(result.warnings)).toEqual(["clip-declared-length-mismatch", "clip-container-truncated"]);
  });

  it("푸터 청크가 없지만 선언 길이는 맞는 컨테이너는 clip-footer-missing만 경고한다", async () => {
    const bytes = buildClipDocument({ ...goodSpec, omitFooter: true }).bytes;
    const result = await importChunkedSqliteDocument(bytes, { openSqlite: openNodeSqlite });

    expect(codes(result.warnings)).toEqual(["clip-footer-missing"]);
    expect(result.layers[0]!.pixels).not.toBeNull();
  });
});

describe("importChunkedSqliteDocument: 문서 DB 오류", () => {
  const spec: FixtureDocumentSpec = { layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 4, 4)] };

  it.each([
    ["Canvas 표가 없다", { omitTables: ["Canvas"] }],
    ["Layer 표가 없다", { omitTables: ["Layer"] }],
    ["Canvas 필수 열이 없다(CanvasWidth)", { omitColumns: { Canvas: ["CanvasWidth"] } }],
    ["Canvas 필수 열이 없다(CanvasRootFolder)", { omitColumns: { Canvas: ["CanvasRootFolder"] } }],
    ["Canvas 필수 열이 없다(CanvasUnit)", { omitColumns: { Canvas: ["CanvasUnit"] } }],
    ["Layer 필수 열이 없다(LayerNextIndex)", { omitColumns: { Layer: ["LayerNextIndex"] } }],
    ["Layer 필수 열이 없다(LayerFirstChildIndex)", { omitColumns: { Layer: ["LayerFirstChildIndex"] } }],
    ["Layer 필수 열이 없다(MainId)", { omitColumns: { Layer: ["MainId"] } }],
  ] as const)("%s → database-invalid", async (_name, extra) => {
    expect(await codeOf(() => importSpec({ ...spec, ...extra } as FixtureDocumentSpec))).toBe("database-invalid");
  });

  it("Canvas 행이 없으면 database-invalid다", async () => {
    expect(await codeOf(() => importSpec({ ...spec, canvasRows: 0 }))).toBe("database-invalid");
  });

  it("루트 폴더 행이 없으면 database-invalid다", async () => {
    expect(await codeOf(() => importSpec({ ...spec, canvas: { rootFolder: 77 } }))).toBe("database-invalid");
  });

  it("Canvas의 루트 폴더·MainId가 양의 정수가 아니면 database-invalid다", async () => {
    expect(await codeOf(() => importSpec({ ...spec, afterBuild: (run) => run("UPDATE Canvas SET CanvasRootFolder = 0") }))).toBe("database-invalid");
    expect(await codeOf(() => importSpec({ ...spec, afterBuild: (run) => run("UPDATE Canvas SET CanvasRootFolder = 'x'") }))).toBe("database-invalid");
    expect(await codeOf(() => importSpec({ ...spec, afterBuild: (run) => run("UPDATE Canvas SET MainId = 0") }))).toBe("database-invalid");
    expect(await codeOf(() => importSpec({ ...spec, afterBuild: (run) => run("UPDATE Canvas SET CanvasWidth = 'wide'") }))).toBe("database-invalid");
  });

  it("MainId가 양의 정수가 아닌 Layer 행은 건너뛰고 알린다", async () => {
    const result = await importSpec({ ...spec, afterBuild: (run) => run("INSERT INTO Layer (MainId, CanvasId, LayerName) VALUES (0, 1, 'zero'), (NULL, 1, 'null')") });

    expect(result.layers.map((layer) => layer.name)).toEqual(["a"]);
    expect(codes(result.warnings)).toEqual(["clip-layer-row-invalid"]);
  });

  it("같은 MainId가 두 번 나오면 처음 행만 쓴다", async () => {
    const result = await importSpec({ ...spec, afterBuild: (run) => run("INSERT INTO Layer (MainId, CanvasId, LayerName, LayerType, LayerFolder, LayerFirstChildIndex, LayerNextIndex) VALUES (2, 1, 'dup', 1, 0, 0, 0)") });

    expect(result.layers.map((layer) => layer.name)).toEqual(["a"]);
    expect(codes(result.warnings)).toEqual(["clip-layer-duplicate-id"]);
  });

  it("값 열이 없거나 형식이 다르면 기본값을 쓴다(표시, 불투명도 256, 나머지 0)", async () => {
    const result = await importSpec({
      layers: [{ id: 1, children: [2] }, { id: 2, name: "bare", folder: true }],
      omitColumns: { Layer: ["LayerVisibility", "LayerOpacity", "LayerComposite", "LayerLock", "LayerClip", "LayerOffsetX", "LayerUuid"] },
    });

    expect(result.layers[0]).toMatchObject({ visible: true, opacityRaw: 256, compositeRaw: 0, editLocked: false, transparencyLocked: false, clipToBelow: false, uuid: null });
    const text = await importSpec({
      layers: [{ id: 1, children: [2] }, { id: 2, name: "typed", folder: true, overrides: { LayerOpacity: "full", LayerVisibility: 1.5, LayerLock: null } }],
    });
    expect(text.layers[0]).toMatchObject({ opacityRaw: 256, visibilityRaw: 1, lockRaw: 0 });
  });
});

describe("importChunkedSqliteDocument: SQLite 판독기 약속과 실패", () => {
  const spec: FixtureDocumentSpec = { layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 4, 4, { mask: { width: 4, height: 4, kind: "mask8", pixelAt: () => [255] } })] };

  it("열기에 실패하면 reader-failed이고 원인을 cause로 보존한다", async () => {
    const failure = new Error("disk is angry");

    await expect(importSpec(spec, { openSqlite: createNodeSqliteOpener({ failOpen: failure }) })).rejects.toMatchObject({ code: "reader-failed", cause: failure });
  });

  it("조회가 실패하면 reader-failed이고 원인을 보존하며 DB를 닫는다", async () => {
    const log: NodeSqliteCallLog = { selects: [], tableColumnCalls: 0, closed: false };
    const failure = new Error("query exploded");

    await expect(importSpec(spec, { openSqlite: createNodeSqliteOpener({ log, failSelectAt: { call: 1, error: failure } }) })).rejects.toMatchObject({ code: "reader-failed", cause: failure });
    expect(log.closed).toBe(true);
  });

  it("정상 종료에서도 DB를 닫는다", async () => {
    const log: NodeSqliteCallLog = { selects: [], tableColumnCalls: 0, closed: false };
    await importSpec(spec, { openSqlite: createNodeSqliteOpener({ log }) });

    expect(log.closed).toBe(true);
  });

  it("닫기가 던져도 결과에는 영향이 없다", async () => {
    const result = await importSpec(spec, {
      openSqlite: async (bytes, context) => {
        const database = await openNodeSqlite(bytes, context);
        return {
          tableColumns: (table) => database.tableColumns(table),
          select: (request) => database.select(request),
          close: async () => {
            await database.close();
            throw new Error("close failed");
          },
        };
      },
    });

    expect(result.layers).toHaveLength(1);
  });

  it("판독기가 한도보다 많은 행을 돌려주면 reader-failed다", async () => {
    const opener = createNodeSqliteOpener({ transformRows: (request, rows) => (request.table === "Canvas" ? [...rows, ...rows, ...rows] : rows) });

    expect(await codeOf(() => importSpec(spec, { openSqlite: opener }))).toBe("reader-failed");
  });

  it("행마다 열 수가 요청과 다르면 reader-failed다", async () => {
    const opener = createNodeSqliteOpener({ transformRows: (request, rows) => (request.table === "Layer" ? rows.map((row) => row.slice(1)) : rows) });

    expect(await codeOf(() => importSpec(spec, { openSqlite: opener }))).toBe("reader-failed");
  });

  it("조회가 배열이 아닌 것을 돌려주면 reader-failed다", async () => {
    const opener = createNodeSqliteOpener({ transformRows: (request, rows) => (request.table === "Layer" ? (null as never) : rows) });

    expect(await codeOf(() => importSpec(spec, { openSqlite: opener }))).toBe("reader-failed");
  });

  it("열 목록이 배열이 아니면 reader-failed다", async () => {
    const result = importSpec(spec, {
      openSqlite: async (bytes, context) => {
        const database = await openNodeSqlite(bytes, context);
        return { tableColumns: () => Promise.resolve("MainId" as never), select: (request) => database.select(request), close: () => database.close() };
      },
    });

    expect(await codeOf(() => result)).toBe("reader-failed");
  });

  it("조회는 알려진 표·열·모드만 요청한다(큰 BLOB 열은 길이/존재만 묻는다)", async () => {
    const log: NodeSqliteCallLog = { selects: [], tableColumnCalls: 0, closed: false };
    await importSpec(spec, { openSqlite: createNodeSqliteOpener({ log }) });

    const layerSelect = log.selects.find((request) => request.table === "Layer")!;
    const modes = Object.fromEntries(layerSelect.columns.map((column) => [column.name, column.mode ?? "value"]));
    expect(modes.TextLayerString).toBe("length");
    expect(modes.GradationFillInfo).toBe("length");
    expect(modes.FilterLayerInfo).toBe("length");
    expect(modes.VectorNormalStrokeIndex).toBe("present");
    expect(modes.LayerName).toBe("value");
    expect(Object.keys(modes)).not.toContain("LayerEffectInfo");
    expect(Object.keys(modes)).not.toContain("FutureColumn");
    expect(layerSelect.where).toEqual({ column: "CanvasId", in: [FIXTURE_CANVAS_ID] });
    for (const request of log.selects) {
      expect(request.limit).toBeGreaterThan(0);
      if (request.where !== undefined) expect(request.where.in.length).toBeLessThanOrEqual(500);
    }
  });

  it("중단 신호가 서 있으면 DB를 열기 전에 aborted다", async () => {
    const controller = new AbortController();
    controller.abort();

    expect(await codeOf(() => importSpec(spec, { signal: controller.signal }))).toBe("aborted");
  });

  it("조회 중에 중단되면 aborted이고 DB를 닫는다", async () => {
    const controller = new AbortController();
    const log: NodeSqliteCallLog = { selects: [], tableColumnCalls: 0, closed: false };
    const opener = createNodeSqliteOpener({
      log,
      transformRows: (_request, rows) => {
        controller.abort();
        return rows;
      },
    });

    await expect(importSpec(spec, { openSqlite: opener, signal: controller.signal })).rejects.toMatchObject({ code: "aborted" });
    expect(log.closed).toBe(true);
  });

  it("열기 중에 중단되며 실패하면 reader-failed가 아니라 aborted다", async () => {
    const controller = new AbortController();
    const opener = () => {
      controller.abort();
      throw new Error("열다가 실패");
    };

    expect(await codeOf(() => importSpec(spec, { openSqlite: opener, signal: controller.signal }))).toBe("aborted");
  });

  it("열기를 마친 직후 중단돼도 DB를 닫는다", async () => {
    const controller = new AbortController();
    const log: NodeSqliteCallLog = { selects: [], tableColumnCalls: 0, closed: false };
    const inner = createNodeSqliteOpener({ log });

    await expect(
      importSpec(spec, {
        signal: controller.signal,
        openSqlite: async (bytes, context) => {
          const database = await inner(bytes, context);
          controller.abort();
          return database;
        },
      }),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(log.closed).toBe(true);
    expect(log.selects).toEqual([]);
  });

  it("판독기에 중단 신호를 넘기고, 신호가 없으면 빈 컨텍스트를 넘긴다", async () => {
    const seen: unknown[] = [];
    const controller = new AbortController();
    const record: ClipDocumentImportOptions["openSqlite"] = (bytes, context) => {
      seen.push(context);
      return openNodeSqlite(bytes, context);
    };
    await importSpec(spec, { openSqlite: record, signal: controller.signal });
    await importSpec(spec, { openSqlite: record });

    expect(seen).toEqual([{ signal: controller.signal }, {}]);
  });

  it("판독기 오류가 중단 신호와 겹치면 reader-failed가 아니라 aborted다", async () => {
    const controller = new AbortController();
    const opener = createNodeSqliteOpener({ failSelectAt: { call: 0, error: new Error("boom") } });
    const wrapped: typeof opener = async (bytes, context) => {
      const database = await opener(bytes, context);
      return {
        tableColumns: (table) => database.tableColumns(table),
        select: (request) => {
          controller.abort();
          return database.select(request);
        },
        close: () => database.close(),
      };
    };

    expect(await codeOf(() => importSpec(spec, { openSqlite: wrapped, signal: controller.signal }))).toBe("aborted");
  });
});

describe("importChunkedSqliteDocument: 한 레이어의 픽셀 실패", () => {
  const twoLayers = (broken: Partial<FixtureLayer>): FixtureDocumentSpec => ({
    layers: [{ id: 1, children: [2, 3] }, rasterLayer(2, "ok", 4, 4), { ...rasterLayer(3, "broken", 4, 4), ...broken }],
  });

  it("외부 블록이 컨테이너에 없으면(컨테이너를 끝까지 읽은 경우) 저장된 데이터가 없는 것으로 보고 초기 색으로 채우며 경고한다", async () => {
    const result = await importSpec(twoLayers({ raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern, omitExternal: true } }));

    expect(layerNamed(result, "ok").pixels).not.toBeNull();
    expect(Array.from(layerNamed(result, "broken").pixels!)).toEqual(new Array(64).fill(0));
    expect(result.unsupported).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({ code: "clip-offscreen-external-absent", scope: "resource" });
    expect(result.warnings[0]!.path).toContain("broken");
    expect(result.warnings[0]!.path).toContain("id 3");
    expect(result.warnings[0]!.message).toContain(fixtureExternalId(3, "render"));
  });

  it("컨테이너가 끊겨 있으면 없는 외부 블록을 데이터 없음으로 단정하지 않고 그 레이어만 unsupported다", async () => {
    const result = await importSpec({
      ...twoLayers({ raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern, omitExternal: true } }),
      omitFooter: true,
      trailingBytes: new Uint8Array(16).fill(7),
    });

    expect(layerNamed(result, "ok").pixels).not.toBeNull();
    expect(layerNamed(result, "broken").pixels).toBeNull();
    expect(result.warnings.map((issue) => issue.code)).toContain("clip-container-truncated");
    expect(result.unsupported).toHaveLength(1);
    expect(result.unsupported[0]).toMatchObject({ code: "clip-offscreen-external-missing", scope: "resource" });
    expect(result.unsupported[0]!.path).toContain("broken");
    expect(result.unsupported[0]!.path).toContain("id 3");
    expect(result.unsupported[0]!.message).toContain("단정할 수 없다");
  });

  it("해석하지 못한 외부 블록이 있으면 없는 외부 블록을 데이터 없음으로 단정하지 않는다", async () => {
    const result = await importSpec({
      ...twoLayers({ raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern, omitExternal: true } }),
      rawExtaPayloads: [new Uint8Array(10)],
    });

    expect(result.warnings.map((issue) => issue.code)).toContain("clip-exta-payload-too-short");
    expect(codes(result.unsupported)).toEqual(["clip-offscreen-external-missing"]);
    expect(layerNamed(result, "broken").pixels).toBeNull();
  });

  it("오프스크린에 외부 ID가 없으면 데이터가 있다고 적혀 있어도 초기 색으로 읽고 아무것도 알리지 않는다(블록 크기는 데이터 유무를 알려 주지 않는다)", async () => {
    const result = await importSpec(twoLayers({ raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern, omitBlockData: true } }));

    expect(result.unsupported).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(Array.from(layerNamed(result, "broken").pixels!)).toEqual(new Array(64).fill(0));
  });

  it("모든 블록이 비어 있으면 외부 ID가 없어도 초기 색으로 읽는다", async () => {
    const result = await importSpec(
      twoLayers({ raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern, emptyBlocks: new Set([0]), omitBlockData: true, omitExternal: true } }),
    );

    expect(result.unsupported).toEqual([]);
    expect(Array.from(layerNamed(result, "broken").pixels!)).toEqual(new Array(64).fill(0));
  });

  it("Attribute BLOB가 손상됐으면 unsupported다", async () => {
    const result = await importSpec(twoLayers({ raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern, attributeOverride: Uint8Array.of(1, 2, 3) } }));

    expect(codes(result.unsupported)).toEqual(["clip-offscreen-attribute"]);
    expect(layerNamed(result, "ok").pixels).not.toBeNull();
  });

  it("Attribute BLOB가 NULL이거나 BLOB가 아니면 unsupported다", async () => {
    const nullAttribute = await importSpec({ ...twoLayers({}), afterBuild: (run) => run("UPDATE Offscreen SET Attribute = NULL WHERE MainId = 3030") });
    expect(codes(nullAttribute.unsupported)).toEqual(["clip-offscreen-attribute-missing"]);
    const textAttribute = await importSpec({ ...twoLayers({}), afterBuild: (run) => run("UPDATE Offscreen SET Attribute = 'text' WHERE MainId = 3030") });
    expect(codes(textAttribute.unsupported)).toEqual(["clip-offscreen-attribute-missing"]);
  });

  it("블록 스트림이 어긋나면 stream 오류로 알린다", async () => {
    const built = buildClipDocument(twoLayers({}));
    const spoiled = new Uint8Array(built.bytes);
    // 두 번째 외부 청크(레이어 3)의 데이터 영역 첫 바이트(레코드 길이 필드)를 바꾼다.
    const marker = new TextEncoder().encode(fixtureExternalId(3, "render"));
    const at = spoiled.findIndex((_, index) => marker.every((byte, offset) => spoiled[index + offset] === byte));
    spoiled[at + marker.length + 8] ^= 0xff;
    const result = await importChunkedSqliteDocument(spoiled, { openSqlite: openNodeSqlite });

    expect(codes(result.unsupported)).toEqual(["clip-offscreen-stream"]);
    expect(layerNamed(result, "ok").pixels).not.toBeNull();
  });

  it("zlib 스트림이 손상됐으면 decode 오류로 알린다", async () => {
    const built = buildClipDocument(twoLayers({}));
    const spoiled = new Uint8Array(built.bytes);
    const marker = new TextEncoder().encode(fixtureExternalId(3, "render"));
    const at = spoiled.findIndex((_, index) => marker.every((byte, offset) => spoiled[index + offset] === byte));
    // 데이터 영역 + 첫 레코드의 머리(4 + 4 + 38 + 20) + 구간 머리(8) 다음이 zlib 스트림이다.
    spoiled[at + marker.length + 8 + 4 + 4 + 38 + 20 + 8] ^= 0xff;
    const result = await importChunkedSqliteDocument(spoiled, { openSqlite: openNodeSqlite });

    expect(codes(result.unsupported)).toEqual(["clip-offscreen-decode"]);
    expect(result.unsupported[0]!.message).toContain("블록 0");
  });

  it("1비트 단색 오프스크린은 읽지 않는다고 알린다", async () => {
    const mono = buildClipDocument(twoLayers({}));
    const result = await importChunkedSqliteDocument(mono.bytes, {
      openSqlite: async (bytes, context) => {
        const database = await openNodeSqlite(bytes, context);
        return {
          tableColumns: (table) => database.tableColumns(table),
          select: async (request) => {
            const rows = await database.select(request);
            if (request.table !== "Offscreen") return rows;
            return rows.map((row) => {
              if (Number(row[0]) !== 3030) return row;
              const attribute = new Uint8Array(row[1] as Uint8Array);
              const view = new DataView(attribute.buffer);
              // Parameter 절: 16(머리) + 4 + 18 = 38바이트 뒤 값 열에서 채널 순서(5번째)와 바이트 코드(8번째)를 1비트 회색(0x11, 1)으로 바꾼다.
              view.setUint32(38 + 4 * 4, 0x11, false);
              view.setUint32(38 + 4 * 6, 1, false);
              view.setUint32(38 + 4 * 7, 1, false);
              return [row[0]!, attribute, row[2]!];
            });
          },
          close: () => database.close(),
        };
      },
    });

    // 1비트 단색은 "읽지 않기로 한" 형식이라 의도된 미지원 코드를 쓴다(그 밖의 형식 불일치와 구분한다).
    expect(codes(result.unsupported)).toEqual(["clip-offscreen-mono-unsupported"]);
    expect(result.unsupported[0]!.message).toContain("1비트");
    expect(CLIP_BY_DESIGN_UNSUPPORTED_CODES.has("clip-offscreen-mono-unsupported")).toBe(true);
    expect(CLIP_BY_DESIGN_UNSUPPORTED_CODES.has("clip-offscreen-format")).toBe(false);
  });

  it("첫 단계 배율이 100이 아니면 읽지 않는다(0.5 이내는 인정)", async () => {
    const off = await importSpec(twoLayers({ raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern, scale: 50 } }));
    expect(codes(off.unsupported)).toEqual(["clip-layer-pixels-scale"]);
    expect(layerNamed(off, "broken").pixels).toBeNull();

    const near = await importSpec(twoLayers({ raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern, scale: 100.4 } }));
    expect(near.unsupported).toEqual([]);
    const justOver = await importSpec(twoLayers({ raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern, scale: 100.6 } }));
    expect(codes(justOver.unsupported)).toEqual(["clip-layer-pixels-scale"]);
    const under = await importSpec(twoLayers({ raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern, scale: 99.6 } }));
    expect(under.unsupported).toEqual([]);
    const tooSmall = await importSpec(twoLayers({ raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern, scale: 99.4 } }));
    expect(codes(tooSmall.unsupported)).toEqual(["clip-layer-pixels-scale"]);
  });

  it("ThisScale 열이 없으면 배율을 따지지 않고 읽는다", async () => {
    const result = await importSpec({ ...twoLayers({ raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern, scale: 50 } }), omitColumns: { MipmapInfo: ["ThisScale"] } });

    expect(result.unsupported).toEqual([]);
  });

  it.each([
    ["Mipmap 행이 없다", "DELETE FROM Mipmap WHERE MainId = 1030", "mipmap-missing"],
    ["MipmapInfo 행이 없다", "DELETE FROM MipmapInfo WHERE MainId = 2030", "mipmap-info-missing"],
    ["Offscreen 연결이 0이다", "UPDATE MipmapInfo SET Offscreen = 0 WHERE MainId = 2030", "offscreen-link-missing"],
    ["BaseMipmapInfo가 0이다", "UPDATE Mipmap SET BaseMipmapInfo = 0 WHERE MainId = 1030", "mipmap-missing"],
  ])("%s → 그 레이어만 unsupported다", async (_name, sql, reason) => {
    const result = await importSpec({ ...twoLayers({}), afterBuild: (run) => run(sql) });

    expect(codes(result.unsupported)).toEqual(["clip-layer-pixels-unreachable"]);
    expect(result.unsupported[0]!.message).toContain(reason === "mipmap-missing" ? "Mipmap 행이 없다" : reason === "mipmap-info-missing" ? "MipmapInfo 행이 없다" : "Offscreen이 없다");
    expect(layerNamed(result, "ok").pixels).not.toBeNull();
  });

  it("Offscreen 행이 없으면 그 레이어만 unsupported다", async () => {
    const result = await importSpec({ ...twoLayers({}), afterBuild: (run) => run("DELETE FROM Offscreen WHERE MainId = 3030") });

    expect(codes(result.unsupported)).toEqual(["clip-layer-pixels-unreachable"]);
    expect(result.unsupported[0]!.message).toContain("Offscreen 행 3030");
  });

  it("래스터 표가 없으면 경고 한 건과 레이어별 unsupported를 남긴다", async () => {
    for (const table of ["Mipmap", "MipmapInfo", "Offscreen"]) {
      const result = await importSpec({ ...twoLayers({}), omitTables: [table] });
      expect(result.layers.every((layer) => layer.pixels === null)).toBe(true);
      expect(codes(result.warnings)).toEqual(["clip-raster-tables-missing"]);
      expect(result.unsupported).toHaveLength(2);
    }
  });

  it("래스터 표의 필요한 열이 없어도 같은 방식으로 알린다", async () => {
    for (const [table, column] of [["Mipmap", "BaseMipmapInfo"], ["MipmapInfo", "Offscreen"], ["Offscreen", "BlockData"], ["Offscreen", "Attribute"]] as const) {
      const result = await importSpec({ ...twoLayers({}), omitColumns: { [table]: [column] } });
      expect(result.layers.every((layer) => layer.pixels === null)).toBe(true);
      expect(codes(result.warnings)).toEqual(["clip-raster-tables-missing"]);
    }
  });

  it("두 레이어가 같은 오프스크린을 가리키면 각자 읽는다", async () => {
    const result = await importSpec({ ...twoLayers({}), afterBuild: (run) => run("UPDATE MipmapInfo SET Offscreen = 3020 WHERE MainId = 2030") });

    const ok = layerNamed(result, "ok");
    const sharing = layerNamed(result, "broken");
    expect(sameBytes(sharing.pixels, ok.pixels!)).toBe(true);
    expect(sharing.pixels).not.toBe(ok.pixels);
  });
});

describe("importChunkedSqliteDocument: 자원 한도", () => {
  const big = (id: number, name: string, width: number, height: number) => rasterLayer(id, name, width, height);

  it("레이어 오프스크린이 maxLayerPixels를 넘으면 그 레이어만 limit 오류다(경계 포함)", async () => {
    const spec: FixtureDocumentSpec = { layers: [{ id: 1, children: [2, 3] }, big(2, "small", 10, 10), big(3, "large", 20, 10)] };
    const exact = await importSpec(spec, { limits: { maxLayerPixels: 200 } });
    expect(exact.unsupported).toEqual([]);

    const result = await importSpec(spec, { limits: { maxLayerPixels: 199 } });
    expect(codes(result.unsupported)).toEqual(["clip-offscreen-limit"]);
    expect(layerNamed(result, "large").pixels).toBeNull();
    expect(layerNamed(result, "small").pixels).not.toBeNull();
  });

  it("전체 디코드 예산은 레이어 RGBA 바이트를 합산하고, 넘으면 이후 오프스크린은 읽지 않는다(경계 포함)", async () => {
    // 위쪽 레이어(top)가 먼저 디코드된다.
    const spec: FixtureDocumentSpec = { layers: [{ id: 1, children: [2, 3] }, big(2, "bottom", 10, 10), big(3, "top", 10, 10)] };
    const exact = await importSpec(spec, { limits: { maxDecodedBytes: 800 } });
    expect(exact.unsupported).toEqual([]);

    const result = await importSpec(spec, { limits: { maxDecodedBytes: 799 } });
    expect(codes(result.unsupported)).toEqual(["clip-offscreen-limit"]);
    expect(layerNamed(result, "bottom").pixels).toBeNull();
    expect(layerNamed(result, "top").pixels).not.toBeNull();
    expect(result.unsupported[0]!.message).toContain("799");
  });

  it("마스크 값은 레이어 픽셀을 모두 푼 뒤에 풀어 마스크가 레이어의 몫을 줄이지 않는다", async () => {
    const maskSpec = { width: 10, height: 10, kind: "mask8" as const, pixelAt: () => [255] };
    const spec: FixtureDocumentSpec = { layers: [{ id: 1, children: [2, 3] }, big(2, "first", 10, 10), { ...big(3, "second", 10, 10), mask: maskSpec }] };
    // 레이어 둘 = 800바이트. 마스크 = 100바이트. 예산 850이면 레이어는 모두 읽고 마스크만 못 읽는다.
    const result = await importSpec(spec, { limits: { maxDecodedBytes: 850 } });

    expect(layerNamed(result, "first").pixels).not.toBeNull();
    expect(layerNamed(result, "second").pixels).not.toBeNull();
    expect(layerNamed(result, "second").mask).toBeNull();
    expect(codes(result.unsupported)).toEqual(["clip-offscreen-limit"]);
    const enough = await importSpec(spec, { limits: { maxDecodedBytes: 900 } });
    expect(layerNamed(enough, "second").mask).not.toBeNull();
    expect(enough.unsupported).toEqual([]);
  });

  it("maxLayers를 넘는 행은 limit-exceeded다(루트는 세지 않는다, 경계 포함)", async () => {
    const spec: FixtureDocumentSpec = { layers: [{ id: 1, children: [2, 3, 4] }, big(2, "a", 2, 2), big(3, "b", 2, 2), big(4, "c", 2, 2)] };

    expect((await importSpec(spec, { limits: { maxLayers: 3 } })).layers).toHaveLength(3);
    expect(await codeOf(() => importSpec(spec, { limits: { maxLayers: 2 } }))).toBe("limit-exceeded");
  });

  it("maxGroupDepth를 넘는 중첩은 그 아래를 읽지 않고 경고한다(경계 포함)", async () => {
    const spec: FixtureDocumentSpec = {
      layers: [
        { id: 1, children: [2] },
        { id: 2, name: "d0", folder: true, children: [3] },
        { id: 3, name: "d1", folder: true, children: [4] },
        { id: 4, name: "d2", folder: true, children: [5] },
        big(5, "d3-leaf", 2, 2),
      ],
    };

    expect((await importSpec(spec, { limits: { maxGroupDepth: 3 } })).layers.map((layer) => layer.depth)).toEqual([0, 1, 2, 3]);
    const shallow = await importSpec(spec, { limits: { maxGroupDepth: 2 } });
    expect(shallow.layers.map((layer) => layer.name)).toEqual(["d0", "d1", "d2"]);
    expect(codes(shallow.warnings)).toEqual(["clip-group-depth-exceeded", "clip-layer-unreachable"]);
    const flat = await importSpec(spec, { limits: { maxGroupDepth: 0 } });
    expect(flat.layers.map((layer) => layer.name)).toEqual(["d0"]);
  });

  it("진단 목록은 maxIssues에서 자르고 생략한 건수를 한 건으로 요약한다", async () => {
    const adjustments = Array.from({ length: 10 }, (_, index): FixtureLayer => ({ id: 10 + index, name: `adj${index}`, layerType: 4098 }));
    const result = await importSpec({ layers: [{ id: 1, children: adjustments.map((layer) => layer.id) }, ...adjustments] }, { limits: { maxIssues: 4 } });

    expect(result.unsupported).toHaveLength(5);
    expect(result.unsupported.slice(0, 4).every((issue) => issue.code === "clip-layer-adjustment-not-applied")).toBe(true);
    expect(result.unsupported[4]).toMatchObject({ code: "clip-issues-truncated", scope: "container" });
    expect(result.unsupported[4]!.message).toContain("6건");
    expect(result.warnings).toEqual([]);
  });

  it("진단 경로에 든 레이어 이름은 길이를 자른다", async () => {
    const result = await importSpec({ layers: [{ id: 1, children: [2] }, { id: 2, name: "이름".repeat(500), layerType: 4098 }] });

    expect(result.unsupported[0]!.path!.length).toBeLessThan(120);
  });
});

describe("importChunkedSqliteDocument: 한도 옵션 검증", () => {
  const bytes = buildClipDocument({ layers: [{ id: 1 }] }).bytes;
  const withLimits = (limits: unknown) => codeOf(() => importChunkedSqliteDocument(bytes, { openSqlite: openNodeSqlite, limits: limits as never }));

  it("알 수 없는 이름·음수·소수·최대 초과·비객체는 limit-invalid다", async () => {
    expect(await withLimits({ nope: 1 })).toBe("limit-invalid");
    expect(await withLimits({ maxLayers: -1 })).toBe("limit-invalid");
    expect(await withLimits({ maxLayers: 1.5 })).toBe("limit-invalid");
    expect(await withLimits({ maxLayers: Number.NaN })).toBe("limit-invalid");
    expect(await withLimits({ maxLayers: CLIP_DOCUMENT_LIMITS.maxLayers + 1 })).toBe("limit-invalid");
    expect(await withLimits("many")).toBe("limit-invalid");
    expect(await withLimits({ constructor: 1 })).toBe("limit-invalid");
  });

  it("고정 한도와 같거나 낮은 값, 0, 비어 있는 객체, null은 받아들인다", async () => {
    expect(await withLimits({ maxLayers: CLIP_DOCUMENT_LIMITS.maxLayers })).toBe("none");
    expect(await withLimits({ maxIssues: 0 })).toBe("none");
    expect(await withLimits({})).toBe("none");
    expect(await withLimits(null)).toBe("none");
    expect(await withLimits(undefined)).toBe("none");
  });

  it("기본 한도가 설계 문서의 표와 같다", () => {
    expect(CLIP_DOCUMENT_LIMITS).toEqual({
      maxSourceBytes: 1_073_741_824,
      maxLayers: 20_000,
      maxGroupDepth: 64,
      maxCanvasDimension: 262_144,
      maxLayerPixels: 134_217_728,
      maxDecodedBytes: 1_073_741_824,
      maxWorkBytes: 4_294_967_296,
      maxPreviewBytes: 33_554_432,
      maxTextCharacters: 1_024,
      maxIssues: 500,
    });
    expect(Object.isFrozen(CLIP_DOCUMENT_LIMITS)).toBe(true);
  });
});

describe("importChunkedSqliteDocument: decodePixels=false", () => {
  it("구조만 읽고 픽셀·마스크 값은 읽지 않으며 종류별 진단은 그대로 남긴다", async () => {
    const result = await importSpec(
      {
        layers: [
          { id: 1, children: [2, 3] },
          rasterLayer(2, "a", 8, 8, { mask: { width: 8, height: 8, kind: "mask8", pixelAt: () => [255] } }),
          { id: 3, name: "adj", layerType: 4098 },
        ],
      },
      { decodePixels: false },
    );

    expect(result.layers.map((layer) => [layer.name, layer.pixels, layer.extent, layer.mask])).toEqual([
      ["adj", null, null, null],
      ["a", null, null, null],
    ]);
    expect(codes(result.unsupported)).toEqual(["clip-layer-adjustment-not-applied"]);
  });

  it("decodePixels=false면 Offscreen·Mipmap 표를 조회하지 않는다(외부 청크 쪽 문제도 드러나지 않는다)", async () => {
    const log: NodeSqliteCallLog = { selects: [], tableColumnCalls: 0, closed: false };
    await importSpec({ layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 8, 8)] }, { decodePixels: false, openSqlite: createNodeSqliteOpener({ log }) });

    expect(log.selects.map((request) => request.table)).not.toContain("Offscreen");
    expect(log.selects.map((request) => request.table)).not.toContain("Mipmap");
  });
});
