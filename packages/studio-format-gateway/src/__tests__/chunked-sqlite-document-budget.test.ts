import { afterEach, describe, expect, it, vi } from "vitest";

import { buildOffscreenFixture } from "../../../../tests/corpus/formats/chunked-sqlite-block-fixtures";
import { buildClipDocument, fixtureExternalId, type FixtureDocumentSpec } from "../../../../tests/corpus/formats/chunked-sqlite-document-fixtures";
import { codes, importSpec, layerNamed, maskOf, pattern, rasterLayer, sameBytes } from "../../../../tests/corpus/formats/chunked-sqlite-document-test-kit";
import { openNodeSqlite } from "../../../../tests/corpus/formats/node-sqlite-clip-reader";
import { CLIP_DEFLATE_BLOCK_COST_BYTES, CLIP_RECORD_COST_BYTES } from "../chunked-sqlite-blocks";
import { encodeClipExternalChunkPayload } from "../chunked-sqlite-container";
import { importChunkedSqliteDocument, type ClipDocumentImportOptions, type ClipDocumentImportResult } from "../chunked-sqlite-document";
import { inflateZlib } from "../zlib-inflate";

async function importBytes(bytes: Uint8Array, options: Partial<ClipDocumentImportOptions> = {}): Promise<ClipDocumentImportResult> {
  return importChunkedSqliteDocument(bytes, { openSqlite: openNodeSqlite, ...options });
}

/** 레이어 `layerId`의 첫 데이터 블록 zlib 스트림을 손상시킨다(압축을 푸는 도중에 실패하게 한다). */
function spoilZlib(bytes: Uint8Array, layerId: number): Uint8Array {
  const spoiled = new Uint8Array(bytes);
  const marker = new TextEncoder().encode(fixtureExternalId(layerId, "render"));
  const at = spoiled.findIndex((_, index) => marker.every((byte, offset) => spoiled[index + offset] === byte));
  // 외부 ID 뒤: 데이터 길이 필드(8) 다음이 데이터 영역이고, 그 안에서 첫 레코드의 머리(4 + 4 + 38 + 20)와 구간 머리(8) 다음이 zlib 스트림이다.
  spoiled[at + marker.length + 8 + 4 + 4 + 38 + 20 + 8] ^= 0xff;
  return spoiled;
}

/** 4x4 RGBA 오프스크린(데이터 블록 1개) 하나를 푸는 데 드는 작업량: 레코드 1개 + 출력 64바이트 + 해제 후 크기 + DEFLATE 블록 수 x 8192. */
function singleBlockCharge(): number {
  const block = buildOffscreenFixture({ width: 4, height: 4, kind: "rgba", pixelAt: pattern }).blocks[0]!;
  const inflated = inflateZlib(block.compressed!, { maxOutputBytes: 327_680, expectedBytes: 327_680 });
  return CLIP_RECORD_COST_BYTES + 4 * 4 * 4 + 327_680 + inflated.blocks * CLIP_DEFLATE_BLOCK_COST_BYTES;
}

const SHARE_ALL_WITH_TOP = "UPDATE MipmapInfo SET Offscreen = 3050 WHERE MainId IN (2020, 2030, 2040)";

describe("importChunkedSqliteDocument: 같은 오프스크린을 가리키는 레이어", () => {
  const layers = [{ id: 1, children: [2, 3, 4, 5] }, rasterLayer(2, "d", 4, 4), rasterLayer(3, "c", 4, 4), rasterLayer(4, "b", 4, 4), rasterLayer(5, "a", 4, 4)];

  it("한 번만 풀고 각 레이어가 같은 값의 따로 된 버퍼를 받는다", async () => {
    const result = await importChunkedSqliteDocument(buildClipDocument({ layers, afterBuild: (run) => run(SHARE_ALL_WITH_TOP) }).bytes, { openSqlite: openNodeSqlite });

    const pixels = ["a", "b", "c", "d"].map((name) => layerNamed(result, name).pixels!);
    for (const other of pixels.slice(1)) {
      expect(sameBytes(other, pixels[0]!)).toBe(true);
      expect(other).not.toBe(pixels[0]);
      expect(other.buffer).not.toBe(pixels[0]!.buffer);
    }
    pixels[1]![0] = pixels[1]![0]! ^ 0xff;
    expect(pixels[0]![0]).toBe(pattern(0, 0)[0]);
    expect(pixels[2]![0]).toBe(pattern(0, 0)[0]);
    expect(result.unsupported).toEqual([]);
  });

  it("푸는 작업량은 한 번만 센다: 한 번 풀고 복사본 셋을 만들 만큼의 예산으로 공유하는 레이어 모두를 읽는다", async () => {
    const charge = singleBlockCharge();
    const copies = 3 * 64;
    const shared = buildClipDocument({ layers, afterBuild: (run) => run(SHARE_ALL_WITH_TOP) }).bytes;
    const separate = buildClipDocument({ layers }).bytes;

    const sharedResult = await importBytes(shared, { limits: { maxWorkBytes: charge + copies } });
    expect(sharedResult.layers.map((layer) => layer.pixels !== null)).toEqual([true, true, true, true]);
    expect(sharedResult.unsupported).toEqual([]);

    // 복사하는 비용도 작업량이라, 복사본 하나 몫이 모자라면 마지막 레이어만 읽지 못한다.
    const short = await importBytes(shared, { limits: { maxWorkBytes: charge + copies - 1 } });
    expect(short.layers.map((layer) => layer.pixels !== null)).toEqual([true, true, true, false]);
    expect(codes(short.unsupported)).toEqual(["clip-offscreen-limit"]);
    expect(short.unsupported[0]!.message).toBe(`픽셀 읽기 실패: 디코드 작업량 예산 ${charge + copies - 1}바이트를 넘는다`);

    // 오프스크린이 서로 다르면 같은 예산으로 맨 위 레이어 하나만 읽는다.
    const separateResult = await importBytes(separate, { limits: { maxWorkBytes: charge + copies } });
    expect(separateResult.layers.map((layer) => layer.pixels !== null)).toEqual([true, false, false, false]);
    expect(codes(separateResult.unsupported)).toEqual(["clip-offscreen-limit", "clip-offscreen-limit", "clip-offscreen-limit"]);
  });

  it("공유한 오프스크린을 풀지 못하면 공유하는 레이어마다 자기 경로로 알린다", async () => {
    const charge = singleBlockCharge();
    const shared = buildClipDocument({ layers, afterBuild: (run) => run(SHARE_ALL_WITH_TOP) }).bytes;
    const result = await importBytes(shared, { limits: { maxWorkBytes: charge - 1 } });

    expect(result.layers.every((layer) => layer.pixels === null)).toBe(true);
    expect(codes(result.unsupported)).toEqual(new Array(4).fill("clip-offscreen-limit"));
    expect(result.unsupported.map((issue) => issue.path)).toEqual(result.layers.map((layer, index) => expect.stringContaining(`layers[${index}] (id ${layer.id}`)));
    expect(new Set(result.unsupported.map((issue) => issue.message)).size).toBe(1);
  });

  it("복사본이 출력 예산에 정확히 맞으면 받고 1 모자라면 그 복사본만 실패한다(경계)", async () => {
    const three = buildClipDocument({
      layers: [{ id: 1, children: [2, 3, 4] }, rasterLayer(2, "c", 4, 4), rasterLayer(3, "b", 4, 4), rasterLayer(4, "a", 4, 4)],
      afterBuild: (run) => run("UPDATE MipmapInfo SET Offscreen = 3040 WHERE MainId IN (2020, 2030)"),
    }).bytes;

    const exact = await importBytes(three, { limits: { maxDecodedBytes: 64 * 3 } });
    expect(exact.layers.map((layer) => layer.pixels !== null)).toEqual([true, true, true]);
    expect(exact.unsupported).toEqual([]);

    const short = await importBytes(three, { limits: { maxDecodedBytes: 64 * 3 - 1 } });
    expect(short.layers.map((layer) => [layer.name, layer.pixels !== null])).toEqual([["a", true], ["b", true], ["c", false]]);
    expect(codes(short.unsupported)).toEqual(["clip-offscreen-limit"]);
  });

  it("마스크 복사본도 출력 예산에 정확히 맞으면 받고 1 모자라면 그 복사본만 실패한다(경계)", async () => {
    // 레이어 셋이 각자 64바이트 픽셀과 16바이트 마스크를 갖되, 아래 둘의 마스크는 맨 위 레이어(id 4)의 마스크 오프스크린을 가리킨다.
    const bytes = buildClipDocument({
      layers: [{ id: 1, children: [2, 3, 4] }, ...[2, 3, 4].map((id) => rasterLayer(id, `l${id}`, 4, 4, { mask: maskOf(4, 4) }))],
      afterBuild: (run) => run("UPDATE MipmapInfo SET Offscreen = 3041 WHERE MainId IN (2021, 2031)"),
    }).bytes;
    const total = 64 * 3 + 16 * 3;

    const exact = await importBytes(bytes, { limits: { maxDecodedBytes: total } });
    expect(exact.layers.map((layer) => [layer.name, layer.mask !== null])).toEqual([["l4", true], ["l3", true], ["l2", true]]);
    expect(exact.unsupported).toEqual([]);

    const short = await importBytes(bytes, { limits: { maxDecodedBytes: total - 1 } });
    expect(short.layers.map((layer) => [layer.name, layer.mask !== null])).toEqual([["l4", true], ["l3", true], ["l2", false]]);
    expect(codes(short.unsupported)).toEqual(["clip-offscreen-limit"]);
    expect(short.unsupported[0]!.message).toBe(`마스크 읽기 실패: 디코드 예산 ${total - 1}바이트를 넘는다`);
  });

  it("복사본도 출력 예산을 쓴다: 한도가 모자라면 아래쪽 레이어의 복사본만 실패하고 예산이 새지 않는다", async () => {
    // 위에서부터 a(원본 64바이트), b(복사 64), c(복사 64 → 192 > 191 실패). 이어 d는 자기 오프스크린(60바이트)이다.
    const withOwn: FixtureDocumentSpec = {
      layers: [{ id: 1, children: [2, 3, 4, 5] }, rasterLayer(2, "d", 3, 5), rasterLayer(3, "c", 4, 4), rasterLayer(4, "b", 4, 4), rasterLayer(5, "a", 4, 4)],
      afterBuild: (run) => run("UPDATE MipmapInfo SET Offscreen = 3050 WHERE MainId IN (2030, 2040, 2050)"),
    };
    const bytes = buildClipDocument(withOwn).bytes;

    const exact = await importBytes(bytes, { limits: { maxDecodedBytes: 64 * 3 + 60 } });
    expect(exact.layers.every((layer) => layer.pixels !== null)).toBe(true);
    expect(exact.unsupported).toEqual([]);

    const tight = await importBytes(bytes, { limits: { maxDecodedBytes: 64 * 3 + 60 - 1 } });
    expect(tight.layers.map((layer) => [layer.name, layer.pixels !== null])).toEqual([["a", true], ["b", true], ["c", true], ["d", false]]);

    const result = await importBytes(bytes, { limits: { maxDecodedBytes: 191 } });
    expect(result.layers.map((layer) => [layer.name, layer.pixels !== null])).toEqual([["a", true], ["b", true], ["c", false], ["d", true]]);
    expect(codes(result.unsupported)).toEqual(["clip-offscreen-limit"]);
    expect(result.unsupported[0]!.message).toContain("191");
    expect(result.unsupported[0]!.path).toContain("id 3");
  });
});

describe("importChunkedSqliteDocument: 실패한 해독의 출력 예산 되돌리기", () => {
  it("출력 버퍼를 잡기 전에 실패한 해독은 되돌려 줄 예산이 없다: 실패 뒤에도 한도를 1 넘는 오프스크린은 거부된다", async () => {
    // 맨 위 레이어 3의 데이터 청크는 쓰레기라 레코드를 훑다 실패한다(예산을 잡기 전). 이어 읽는 레이어 2는 64바이트가 필요한데 한도는 63이다.
    const result = await importSpec(
      {
        layers: [{ id: 1, children: [2, 3] }, rasterLayer(2, "below", 4, 4), rasterLayer(3, "top", 4, 4)],
        leadingRawExtaPayloads: [encodeClipExternalChunkPayload({ externalId: fixtureExternalId(3, "render"), data: Uint8Array.of(1, 2, 3) })],
      },
      { limits: { maxDecodedBytes: 63 } },
    );

    expect(result.layers.map((layer) => [layer.name, layer.pixels !== null])).toEqual([["top", false], ["below", false]]);
    expect(result.unsupported).toHaveLength(2);
    expect(result.unsupported[0]!.path).toContain("id 3");
    expect(result.unsupported[0]!.code).not.toBe("clip-offscreen-limit");
    expect(result.unsupported[1]).toMatchObject({ code: "clip-offscreen-limit", message: "픽셀 읽기 실패: 디코드 예산 63바이트를 넘는다" });
    expect(result.unsupported[1]!.path).toContain("id 2");
  });

  const two = (top: ReturnType<typeof rasterLayer>): FixtureDocumentSpec => ({ layers: [{ id: 1, children: [2, 3] }, rasterLayer(2, "bottom", 10, 10), top] });

  it("압축을 풀다 실패한 오프스크린이 잡았던 예산은 되돌려 준다", async () => {
    const built = buildClipDocument(two(rasterLayer(3, "top", 10, 10)));
    const spoiled = spoilZlib(built.bytes, 3);

    // 위쪽(top)이 먼저 400바이트를 잡았다가 실패한다. 되돌려 받지 못하면 아래쪽(bottom) 400바이트가 예산 400을 넘는다.
    const result = await importBytes(spoiled, { limits: { maxDecodedBytes: 400 } });

    expect(layerNamed(result, "top").pixels).toBeNull();
    expect(layerNamed(result, "bottom").pixels).not.toBeNull();
    expect(codes(result.unsupported)).toEqual(["clip-offscreen-decode"]);
  });

  it("위치가 범위를 벗어나 레이어에 붙이지 못한 원본 버퍼의 예산도 되돌려 준다", async () => {
    const result = await importBytes(buildClipDocument(two(rasterLayer(3, "top", 10, 10, { offset: [2 ** 31, 0] }))).bytes, { limits: { maxDecodedBytes: 400 } });

    expect(layerNamed(result, "top").pixels).toBeNull();
    expect(layerNamed(result, "bottom").pixels).not.toBeNull();
    expect(codes(result.unsupported)).toEqual(["clip-layer-pixels-unreachable"]);
  });

  it("공유하는 레이어가 모두 붙이지 못하면 그 원본 버퍼의 예산도 되돌려 준다", async () => {
    const spec: FixtureDocumentSpec = {
      layers: [{ id: 1, children: [2, 3, 4] }, rasterLayer(2, "bottom", 10, 10), rasterLayer(3, "far2", 10, 10, { offset: [2 ** 31, 0] }), rasterLayer(4, "far1", 10, 10, { offset: [0, 2 ** 31] })],
      afterBuild: (run) => run("UPDATE MipmapInfo SET Offscreen = 3040 WHERE MainId = 2030"),
    };
    const result = await importBytes(buildClipDocument(spec).bytes, { limits: { maxDecodedBytes: 400 } });

    expect(layerNamed(result, "far1").pixels).toBeNull();
    expect(layerNamed(result, "far2").pixels).toBeNull();
    expect(layerNamed(result, "bottom").pixels).not.toBeNull();
    expect(codes(result.unsupported)).toEqual(["clip-layer-pixels-unreachable", "clip-layer-pixels-unreachable"]);
  });

  it("복사본을 붙이지 못하면 그 복사본의 예산만 돌려주어 뒤따르는 레이어가 정확히 한도까지 읽는다", async () => {
    // 위에서부터 ok(원본 400), far(복사 400 → 위치가 범위 밖이라 붙이지 못하고 되돌린다), tail(자기 오프스크린 400). 한도 800에 정확히 맞는다.
    const spec: FixtureDocumentSpec = {
      layers: [{ id: 1, children: [2, 3, 4] }, rasterLayer(2, "tail", 10, 10), rasterLayer(3, "far", 10, 10, { offset: [2 ** 31, 0] }), rasterLayer(4, "ok", 10, 10)],
      afterBuild: (run) => run("UPDATE MipmapInfo SET Offscreen = 3040 WHERE MainId = 2030"),
    };
    const bytes = buildClipDocument(spec).bytes;

    const exact = await importBytes(bytes, { limits: { maxDecodedBytes: 800 } });
    expect(layerNamed(exact, "ok").pixels).not.toBeNull();
    expect(layerNamed(exact, "tail").pixels).not.toBeNull();
    expect(layerNamed(exact, "far").pixels).toBeNull();
    expect(codes(exact.unsupported)).toEqual(["clip-layer-pixels-unreachable"]);

    const short = await importBytes(bytes, { limits: { maxDecodedBytes: 799 } });
    expect(layerNamed(short, "ok").pixels).not.toBeNull();
    expect(layerNamed(short, "tail").pixels).toBeNull();
    // 799에서는 far의 복사본부터 만들 수 없고(400 + 400 > 799) tail도 들어가지 못한다.
    expect(codes(short.unsupported)).toEqual(["clip-offscreen-limit", "clip-offscreen-limit"]);
  });

  it("원본을 아직 쥐고 있는 동안에는 첫 레이어가 붙이지 못해도 원본의 예산을 돌려주지 않는다", async () => {
    // 위에서부터 far(원본을 받지만 붙이지 못한다), ok(같은 원본을 복사 없이 받는다), tail1(400), tail2(400). 원본 400 + tail1 400 = 한도 800이라 tail2는 읽지 못한다.
    const spec: FixtureDocumentSpec = {
      layers: [
        { id: 1, children: [2, 3, 4, 5] },
        rasterLayer(2, "tail2", 10, 10),
        rasterLayer(3, "tail1", 10, 10),
        rasterLayer(4, "ok", 10, 10),
        rasterLayer(5, "far", 10, 10, { offset: [2 ** 31, 0] }),
      ],
      afterBuild: (run) => run("UPDATE MipmapInfo SET Offscreen = 3050 WHERE MainId = 2040"),
    };
    const result = await importBytes(buildClipDocument(spec).bytes, { limits: { maxDecodedBytes: 800 } });

    expect(result.layers.map((layer) => [layer.name, layer.pixels !== null])).toEqual([["far", false], ["ok", true], ["tail1", true], ["tail2", false]]);
    expect(codes(result.unsupported)).toEqual(["clip-layer-pixels-unreachable", "clip-offscreen-limit"]);
    expect(result.unsupported[1]!.path).toContain("id 2");
  });

  it("첫 레이어가 붙이지 못해도 다음 레이어가 복사 없이 같은 원본을 받는다(예산은 한 벌분이다)", async () => {
    const spec: FixtureDocumentSpec = {
      layers: [{ id: 1, children: [2, 3] }, rasterLayer(2, "ok", 10, 10), rasterLayer(3, "far", 10, 10, { offset: [2 ** 31, 0] })],
      afterBuild: (run) => run("UPDATE MipmapInfo SET Offscreen = 3030 WHERE MainId = 2020"),
    };
    const bytes = buildClipDocument(spec).bytes;

    const exact = await importBytes(bytes, { limits: { maxDecodedBytes: 400 } });
    expect(layerNamed(exact, "ok").pixels).not.toBeNull();
    expect(codes(exact.unsupported)).toEqual(["clip-layer-pixels-unreachable"]);
    expect(exact.unsupported[0]!.path).toContain("far");

    const short = await importBytes(bytes, { limits: { maxDecodedBytes: 399 } });
    expect(layerNamed(short, "ok").pixels).toBeNull();
    expect(codes(short.unsupported)).toEqual(["clip-offscreen-limit", "clip-offscreen-limit"]);
  });
});

describe("importChunkedSqliteDocument: 복사본을 만들 메모리가 없을 때", () => {
  // 위에서부터 a(원본 64바이트), b·c(복사본), d(자기 오프스크린 64바이트). 한도 128은 원본 하나와 d만 들어간다.
  const sharedBytes = buildClipDocument({
    layers: [{ id: 1, children: [2, 3, 4, 5] }, rasterLayer(2, "d", 4, 4), rasterLayer(3, "c", 4, 4), rasterLayer(4, "b", 4, 4), rasterLayer(5, "a", 4, 4)],
    afterBuild: (run) => run("UPDATE MipmapInfo SET Offscreen = 3050 WHERE MainId IN (2030, 2040)"),
  }).bytes;

  /** 64바이트 `Uint8Array`의 `slice`(복사본 만들기)만 주어진 예외로 실패시킨다. 다른 크기와 다른 호출은 그대로 둔다. */
  const failCopies = (error: Error): void => {
    const original = Uint8Array.prototype.slice;
    vi.spyOn(Uint8Array.prototype, "slice").mockImplementation(function (this: Uint8Array, ...args: [number?, number?]) {
      if (this.byteLength === 64) throw error;
      return original.apply(this, args);
    });
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("RangeError면 그 복사본만 clip-offscreen-limit으로 실패하고 예산을 돌려주어 d는 읽는다", async () => {
    failCopies(new RangeError("Array buffer allocation failed"));
    const result = await importBytes(sharedBytes, { limits: { maxDecodedBytes: 128 } });

    expect(result.layers.map((layer) => [layer.name, layer.pixels !== null])).toEqual([["a", true], ["b", false], ["c", false], ["d", true]]);
    expect(result.unsupported.map((issue) => [issue.code, issue.message])).toEqual([
      ["clip-offscreen-limit", "픽셀 읽기 실패: 복사본을 만들 메모리가 없다"],
      ["clip-offscreen-limit", "픽셀 읽기 실패: 복사본을 만들 메모리가 없다"],
    ]);
  });

  it("RangeError가 아닌 예외는 삼키지 않고 그대로 던진다", async () => {
    failCopies(new TypeError("예상 밖 오류(복사)"));

    await expect(importBytes(sharedBytes, { limits: { maxDecodedBytes: 128 } })).rejects.toThrow(new TypeError("예상 밖 오류(복사)"));
  });
});

describe("importChunkedSqliteDocument: 디코드 작업량 예산(maxWorkBytes)", () => {
  const twoLayers: FixtureDocumentSpec = { layers: [{ id: 1, children: [2, 3] }, rasterLayer(2, "bottom", 4, 4), rasterLayer(3, "top", 4, 4)] };

  it("레코드 수 x 1,024, 출력 버퍼 크기, 데이터가 있는 블록마다 해제 후 크기와 DEFLATE 블록 수 x 8192를 센다(경계)", async () => {
    const charge = singleBlockCharge();
    const bytes = buildClipDocument(twoLayers).bytes;

    const both = await importBytes(bytes, { limits: { maxWorkBytes: charge * 2 } });
    expect(both.layers.every((layer) => layer.pixels !== null)).toBe(true);

    const one = await importBytes(bytes, { limits: { maxWorkBytes: charge * 2 - 1 } });
    expect(layerNamed(one, "top").pixels).not.toBeNull();
    expect(layerNamed(one, "bottom").pixels).toBeNull();
    expect(codes(one.unsupported)).toEqual(["clip-offscreen-limit"]);
    expect(one.unsupported[0]!.message).toBe(`픽셀 읽기 실패: 디코드 작업량 예산 ${charge * 2 - 1}바이트를 넘는다`);

    const none = await importBytes(bytes, { limits: { maxWorkBytes: charge - 1 } });
    expect(none.layers.every((layer) => layer.pixels === null)).toBe(true);
    expect(codes(none.unsupported)).toEqual(["clip-offscreen-limit", "clip-offscreen-limit"]);
  });

  it("풀다 실패한 오프스크린의 작업량도 돌려주지 않는다", async () => {
    const charge = singleBlockCharge();
    const spoiled = spoilZlib(buildClipDocument(twoLayers).bytes, 3);
    // 위쪽은 레코드(1,024)와 출력(64)과 풀기 전의 해제 후 크기(327,680)를 센 뒤 실패한다. 아래쪽은 charge가 더 필요하다.
    const failedTop = CLIP_RECORD_COST_BYTES + 64 + 327_680;

    const exact = await importBytes(spoiled, { limits: { maxWorkBytes: failedTop + charge } });
    expect(layerNamed(exact, "bottom").pixels).not.toBeNull();
    expect(codes(exact.unsupported)).toEqual(["clip-offscreen-decode"]);

    const short = await importBytes(spoiled, { limits: { maxWorkBytes: failedTop + charge - 1 } });
    expect(layerNamed(short, "bottom").pixels).toBeNull();
    expect(codes(short.unsupported)).toEqual(["clip-offscreen-decode", "clip-offscreen-limit"]);
  });

  it("데이터 없는 블록만 있는 오프스크린은 풀지 않아도 레코드와 출력 버퍼 크기만큼은 센다", async () => {
    const emptyBytes = buildClipDocument({ layers: [{ id: 1, children: [2] }, { id: 2, name: "empty", raster: { width: 600, height: 10, kind: "rgba", emptyBlocks: new Set([0, 1, 2]), pixelAt: pattern } }] }).bytes;
    const work = 3 * CLIP_RECORD_COST_BYTES + 600 * 10 * 4;

    const exact = await importBytes(emptyBytes, { limits: { maxWorkBytes: work } });
    expect(exact.unsupported).toEqual([]);
    expect(exact.layers[0]!.pixels).not.toBeNull();
    expect(exact.layers[0]!.storedBlocks).toBe(0);

    const short = await importBytes(emptyBytes, { limits: { maxWorkBytes: work - 1 } });
    expect(short.layers[0]!.pixels).toBeNull();
    expect(codes(short.unsupported)).toEqual(["clip-offscreen-limit"]);
    expect(short.unsupported[0]!.message).toBe(`픽셀 읽기 실패: 디코드 작업량 예산 ${work - 1}바이트를 넘는다`);

    const data = await importBytes(buildClipDocument(twoLayers).bytes, { limits: { maxWorkBytes: 0 } });
    expect(codes(data.unsupported)).toEqual(["clip-offscreen-limit", "clip-offscreen-limit"]);
    expect(data.unsupported[0]!.message).toBe("픽셀 읽기 실패: 디코드 작업량 예산 0바이트를 넘는다");
  });

  it("출력 버퍼를 잡았다가 버리기를 되풀이하는 입력은 버퍼 몫이 환급돼도 작업량이 쌓여 멈춘다(위치가 범위를 벗어나 버려지는 빈 오프스크린)", async () => {
    const away = (id: number, name: string) => ({ id, name, raster: { width: 4, height: 4, kind: "rgba" as const, emptyBlocks: new Set([0]), pixelAt: pattern }, offset: [2 ** 31, 0] as [number, number] });
    const spec: FixtureDocumentSpec = { layers: [{ id: 1, children: [2, 3, 4, 5, 6, 7] }, ...[2, 3, 4, 5, 6, 7].map((id) => away(id, `l${id}`))] };
    const perOffscreen = CLIP_RECORD_COST_BYTES + 4 * 4 * 4;

    const result = await importBytes(buildClipDocument(spec).bytes, { limits: { maxWorkBytes: perOffscreen * 3 } });

    // 셋은 버퍼를 만들고 위치 때문에 버렸다. 환급된 출력 예산과 상관없이 작업량이 다 찼으므로 나머지 셋은 버퍼를 만들지 않는다.
    expect(codes(result.unsupported)).toEqual([
      "clip-layer-pixels-unreachable", "clip-layer-pixels-unreachable", "clip-layer-pixels-unreachable",
      "clip-offscreen-limit", "clip-offscreen-limit", "clip-offscreen-limit",
    ]);
    expect(result.layers.every((layer) => layer.pixels === null)).toBe(true);
  });

  it("공유한 오프스크린의 복사본을 만들었다 버리기를 되풀이하는 입력도 작업량이 쌓여 멈춘다", async () => {
    // 맨 위 레이어(a)가 원본을 받고, 나머지 다섯은 위치가 범위를 벗어나 복사본을 만들었다 버린다.
    const spec: FixtureDocumentSpec = {
      layers: [
        { id: 1, children: [2, 3, 4, 5, 6, 7] },
        ...[2, 3, 4, 5, 6, 7].map((id) => ({ id, name: id === 7 ? "a" : `far${id}`, raster: { width: 4, height: 4, kind: "rgba" as const, pixelAt: pattern }, ...(id === 7 ? {} : { offset: [2 ** 31, 0] as [number, number] }) })),
      ],
      afterBuild: (run) => run("UPDATE MipmapInfo SET Offscreen = 3070 WHERE MainId IN (2020, 2030, 2040, 2050, 2060)"),
    };
    const decode = singleBlockCharge();

    const result = await importBytes(buildClipDocument(spec).bytes, { limits: { maxWorkBytes: decode + 2 * 64 } });

    expect(layerNamed(result, "a").pixels).not.toBeNull();
    // 복사본 둘은 만들었다가 위치 때문에 버렸고(작업량은 되돌려 주지 않는다), 나머지 셋은 복사본을 만들지 못했다.
    expect(codes(result.unsupported)).toEqual([
      "clip-layer-pixels-unreachable", "clip-layer-pixels-unreachable",
      "clip-offscreen-limit", "clip-offscreen-limit", "clip-offscreen-limit",
    ]);
  });

  it("마스크도 같은 예산을 쓴다", async () => {
    const maskSpec: FixtureDocumentSpec = {
      layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 4, 4, { mask: { width: 4, height: 4, kind: "mask8", pixelAt: () => [200] } })],
    };
    const bytes = buildClipDocument(maskSpec).bytes;

    const layerOnly = await importBytes(bytes, { limits: { maxWorkBytes: singleBlockCharge() } });
    expect(layerOnly.layers[0]!.pixels).not.toBeNull();
    expect(layerOnly.layers[0]!.mask).toBeNull();
    expect(codes(layerOnly.unsupported)).toEqual(["clip-offscreen-limit"]);
    expect(layerOnly.unsupported[0]!.message).toMatch(/^마스크 읽기 실패: 디코드 작업량 예산/u);
  });

  it("얇은 띠 하나가 블록 수천 개를 풀게 해도 출력이 작다고 통과하지 못한다", async () => {
    const strip: FixtureDocumentSpec = { layers: [{ id: 1, children: [2] }, { id: 2, name: "strip", raster: { width: 256 * 600, height: 1, kind: "rgba", pixelAt: () => [1, 2, 3, 4] } }] };
    const bytes = buildClipDocument(strip).bytes;

    // 출력은 600 x 256 x 4 = 614,400바이트뿐이지만 블록 600개를 푸는 작업량은 약 2억 바이트다.
    const refused = await importBytes(bytes, { limits: { maxWorkBytes: 20_000_000 } });
    expect(refused.layers[0]!.pixels).toBeNull();
    expect(codes(refused.unsupported)).toEqual(["clip-offscreen-limit"]);
    expect(refused.unsupported[0]!.message).toContain("디코드 작업량 예산 20000000바이트");

    const allowed = await importBytes(bytes);
    expect(allowed.layers[0]!.pixels?.byteLength).toBe(256 * 600 * 4);
    expect(allowed.unsupported).toEqual([]);
  }, 60_000);
});

describe("importChunkedSqliteDocument: 데이터 블록이 많은 오프스크린", () => {
  it("블록이 64개를 넘는 레이어도 정확히 읽는다(양보 지점이 여러 번 끼어든다)", async () => {
    const width = 256 * 130 + 7;
    const wide: FixtureDocumentSpec = {
      canvas: { width, height: 5 },
      layers: [{ id: 1, children: [2] }, { id: 2, name: "wide", raster: { width, height: 5, kind: "rgba", pixelAt: (x, y) => [x & 255, (x >> 8) & 255, y, 255] } }],
    };
    const result = await importBytes(buildClipDocument(wide).bytes);

    const pixels = result.layers[0]!.pixels!;
    expect(pixels.byteLength).toBe(width * 5 * 4);
    for (const [x, y] of [[0, 0], [255, 0], [256, 1], [64 * 256 - 1, 2], [64 * 256, 3], [128 * 256 + 255, 4], [width - 1, 4]] as const) {
      expect(Array.from(pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 4))).toEqual([x & 255, (x >> 8) & 255, y, 255]);
    }
    expect(result.unsupported).toEqual([]);
  });

  it("데이터 없는 블록 16,384개(블록 수 상한)로 이루어진 오프스크린은 풀지 않고 레코드와 출력 크기만큼의 작업량으로 초기 색을 채운다", async () => {
    const blocks = 16_384;
    const flood: FixtureDocumentSpec = {
      layers: [
        { id: 1, children: [2] },
        { id: 2, name: "flood", raster: { width: 256 * blocks, height: 1, kind: "rgba", hasColor: true, packedRgba: 0x0a141e28, emptyBlocks: new Set(Array.from({ length: blocks }, (_, index) => index)), pixelAt: () => [0, 0, 0, 0] } },
      ],
    };
    const work = blocks * CLIP_RECORD_COST_BYTES + 256 * blocks * 4;
    const bytes = buildClipDocument(flood).bytes;
    const short = await importBytes(bytes, { limits: { maxWorkBytes: work - 1 } });
    expect(short.layers[0]!.pixels).toBeNull();
    expect(codes(short.unsupported)).toEqual(["clip-offscreen-limit"]);

    const result = await importBytes(bytes, { limits: { maxWorkBytes: work } });

    expect(result.unsupported).toEqual([]);
    const pixels = result.layers[0]!.pixels!;
    expect(pixels.byteLength).toBe(256 * blocks * 4);
    expect(Array.from(pixels.subarray(0, 4))).toEqual([10, 20, 30, 40]);
    expect(Array.from(pixels.subarray(pixels.byteLength - 4))).toEqual([10, 20, 30, 40]);
  }, 60_000);
});
