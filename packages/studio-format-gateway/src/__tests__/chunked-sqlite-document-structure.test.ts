import { describe, expect, it } from "vitest";

import { buildOffscreenFixture } from "../../../../tests/corpus/formats/chunked-sqlite-block-fixtures";
import { buildClipDocument, fixtureExternalId, type FixtureDocumentSpec, type FixtureLayer } from "../../../../tests/corpus/formats/chunked-sqlite-document-fixtures";
import { codes, importSpec, layerNamed, maskOf, pattern, rasterLayer, sameBytes } from "../../../../tests/corpus/formats/chunked-sqlite-document-test-kit";
import { createNodeSqliteOpener, type NodeSqliteCallLog } from "../../../../tests/corpus/formats/node-sqlite-clip-reader";
import { encodeClipExternalChunkPayload } from "../chunked-sqlite-container";
import { importChunkedSqliteDocument } from "../chunked-sqlite-document";

describe("importChunkedSqliteDocument: 컷 틀 폴더", () => {
  const spec = (frame: Partial<FixtureLayer> = {}): FixtureDocumentSpec => ({
    layers: [
      { id: 1, children: [2, 4] },
      { id: 2, name: "frame", folder: true, children: [3], overrides: { ComicFrameLineMipmap: 7 }, ...frame },
      rasterLayer(3, "inside", 4, 4),
      { id: 4, name: "plain", folder: true, mask: maskOf(4, 4), visibility: 3 },
    ],
  });

  it("폴더이면서 ComicFrameLineMipmap이 있으면 frame-folder이고 자식은 일반 폴더처럼 이어진다", async () => {
    const result = await importSpec(spec());

    expect(result.layers.map((layer) => [layer.name, layer.kind, layer.parentIndex, layer.depth])).toEqual([
      ["plain", "folder", null, 0],
      ["frame", "frame-folder", null, 0],
      ["inside", "raster", 1, 1],
    ]);
    expect(layerNamed(result, "inside").pixels).not.toBeNull();
  });

  it("컷 틀 폴더의 마스크 연결은 레이어 마스크로 읽지 않고 clip-layer-frame-mask-not-stored로 알린다(일반 폴더의 마스크는 읽는다)", async () => {
    const result = await importSpec(spec({ mask: maskOf(4, 4), visibility: 3 }));

    expect(layerNamed(result, "frame").mask).toBeNull();
    expect(layerNamed(result, "plain").mask).not.toBeNull();
    expect(result.unsupported).toHaveLength(1);
    expect(result.unsupported[0]).toMatchObject({ code: "clip-layer-frame-mask-not-stored", scope: "semantic" });
    expect(result.unsupported[0]!.path).toContain("id 2");
  });

  it("마스크 연결이 없는 컷 틀 폴더는 아무것도 알리지 않는다", async () => {
    const result = await importSpec(spec());

    expect(result.unsupported).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("통과(pass-through) 합성은 컷 틀 폴더에서도 인정한다", async () => {
    const result = await importSpec(spec({ composite: 30 }));

    expect(layerNamed(result, "frame")).toMatchObject({ kind: "frame-folder", passThrough: true, compositeMode: "pass-through" });
  });
});

describe("importChunkedSqliteDocument: 래스터 연결", () => {
  it("Offscreen 행이 없는 레이어가 있어도 같은 묶음의 나머지 레이어는 계속 읽는다", async () => {
    const result = await importSpec({
      layers: [{ id: 1, children: [2, 3, 4] }, rasterLayer(2, "c", 4, 4), rasterLayer(3, "b", 4, 4), rasterLayer(4, "a", 4, 4)],
      afterBuild: (run) => run("DELETE FROM Offscreen WHERE MainId = 3030"),
    });

    expect(layerNamed(result, "b").pixels).toBeNull();
    expect(layerNamed(result, "a").pixels).not.toBeNull();
    expect(layerNamed(result, "c").pixels).not.toBeNull();
    expect(codes(result.unsupported)).toEqual(["clip-layer-pixels-unreachable"]);
    expect(result.unsupported[0]!.message).toBe("픽셀 읽기 실패: Offscreen 행 3030가 없다");
  });

  /** 레이어 2의 연결 id를 모두 1로 바꾼다(경계: 가장 작은 양수 id). */
  const renumberToOne = (run: (sql: string, ...params: never[]) => void): void => {
    run("UPDATE Layer SET LayerRenderMipmap = 1 WHERE MainId = 2");
    run("UPDATE Mipmap SET MainId = 1, BaseMipmapInfo = 1 WHERE MainId = 1020");
    run("UPDATE MipmapInfo SET MainId = 1, Offscreen = 1 WHERE MainId = 2020");
    run("UPDATE Offscreen SET MainId = 1 WHERE MainId = 3020");
  };

  it("연결의 모든 id가 1이어도 읽는다(0만 없음으로 본다)", async () => {
    const result = await importSpec({ layers: [{ id: 1, children: [2] }, rasterLayer(2, "one", 4, 4)], afterBuild: renumberToOne as never });

    expect(result.unsupported).toEqual([]);
    expect(result.layers[0]!.pixels).not.toBeNull();
  });

  it("마스크 연결 id가 1이어도 읽는다", async () => {
    const result = await importSpec({
      layers: [{ id: 1, children: [2] }, rasterLayer(2, "masked", 4, 4, { mask: maskOf(4, 4) })],
      afterBuild: (run) => {
        run("UPDATE Layer SET LayerLayerMaskMipmap = 1 WHERE MainId = 2");
        run("UPDATE Mipmap SET MainId = 1, BaseMipmapInfo = 1 WHERE MainId = 1021");
        run("UPDATE MipmapInfo SET MainId = 1, Offscreen = 1 WHERE MainId = 2021");
        run("UPDATE Offscreen SET MainId = 1 WHERE MainId = 3021");
      },
    });

    expect(result.unsupported).toEqual([]);
    // `mask?.values`만 비교하면 마스크가 아예 없을 때(undefined)도 통과하므로 마스크 객체부터 확인한다.
    expect(result.layers[0]!.mask).not.toBeNull();
    expect(result.layers[0]!.mask!.values).toBeInstanceOf(Uint8Array);
    expect(result.layers[0]!.mask!.storedBlocks).toBe(1);
  });

  it("마스크 연결 id가 1인데 행이 없으면 건너뛰지 않고 읽을 수 없다고 알린다", async () => {
    const result = await importSpec({
      layers: [{ id: 1, children: [2] }, rasterLayer(2, "dangling", 4, 4)],
      afterBuild: (run) => run("UPDATE Layer SET LayerLayerMaskMipmap = 1 WHERE MainId = 2"),
    });

    expect(codes(result.unsupported)).toEqual(["clip-layer-mask-unreachable"]);
    expect(result.layers[0]!.mask).toBeNull();
  });

  it("다단계 mip 사슬은 첫 단계(BaseMipmapInfo)만 쓰고 다음 단계의 오프스크린은 쓰지 않는다", async () => {
    const result = await importSpec({
      layers: [{ id: 1, children: [2] }, rasterLayer(2, "base", 4, 4)],
      afterBuild: (run) => {
        // 둘째 단계(50%): 다른 오프스크린을 가리키는 MipmapInfo를 이어 붙인다. 그 Attribute는 읽으면 실패하는 쓰레기다.
        run("INSERT INTO Offscreen (MainId, CanvasId, LayerId, Attribute, BlockData) VALUES (9001, 1, 2, X'010203', NULL)");
        run("INSERT INTO MipmapInfo (MainId, CanvasId, LayerId, NextIndex, Offscreen, ThisScale) VALUES (9002, 1, 2, 0, 9001, 50)");
        run("UPDATE MipmapInfo SET NextIndex = 9002 WHERE MainId = 2020");
      },
    });

    expect(result.unsupported).toEqual([]);
    expect(result.layers[0]!.pixels).not.toBeNull();
  });

  it("행이 MainId 순서가 아니게 들어 있어도 같은 결과를 낸다", async () => {
    const forward = await importSpec({ layers: [{ id: 1, children: [2, 3, 4] }, rasterLayer(2, "a", 4, 4), rasterLayer(3, "b", 5, 3), rasterLayer(4, "c", 3, 5)] });
    const reversed = await importSpec({
      layers: [{ id: 1, children: [2, 3, 4] }, rasterLayer(2, "a", 4, 4), rasterLayer(3, "b", 5, 3), rasterLayer(4, "c", 3, 5)],
      afterBuild: (run) => {
        // 각 표의 행을 MainId 내림차순으로 다시 쌓는다(삭제 후 역순 삽입 대신 rowid를 뒤집는다).
        for (const table of ["Layer", "Mipmap", "MipmapInfo", "Offscreen"]) run(`UPDATE ${table} SET _PW_ID = -_PW_ID`);
      },
    });

    expect(reversed.layers.map((layer) => layer.name)).toEqual(forward.layers.map((layer) => layer.name));
    for (const name of ["a", "b", "c"]) expect(sameBytes(layerNamed(reversed, name).pixels, layerNamed(forward, name).pixels!)).toBe(true);
  });

  it("ExternalChunk 표의 행은 읽지 않는다: 엉뚱한 값이 있어도 결과가 같다", async () => {
    const base: FixtureDocumentSpec = { layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 6, 6)] };
    const plain = await importSpec(base);
    const noisy = await importSpec({
      ...base,
      afterBuild: (run) => {
        run("INSERT INTO ExternalChunk (ExternalID, Offset) VALUES ('extrnlid00000000000000000000000000000BAD', 3)");
        run("INSERT INTO ExternalChunk (ExternalID, Offset) VALUES (?, 99999)", fixtureExternalId(2, "render") as never);
      },
    });

    expect(noisy.layers).toEqual(plain.layers);
    expect(noisy.warnings).toEqual([]);
  });

  it("마스크 좌표는 x만, y만 범위를 벗어나도 그 마스크만 읽지 않는다", async () => {
    const result = await importSpec({
      layers: [
        { id: 1, children: [2, 3, 4, 5, 6] },
        rasterLayer(2, "x-far", 4, 4, { mask: maskOf(4, 4), maskOffset: [2 ** 31, 0] }),
        rasterLayer(3, "y-far", 4, 4, { mask: maskOf(4, 4), maskRenderOffset: [0, -(2 ** 31)] }),
        rasterLayer(4, "sum-far", 4, 4, { mask: maskOf(4, 4), offset: [2 ** 30, 0], maskOffset: [2 ** 30, 0] }),
        rasterLayer(5, "edge", 4, 4, { mask: maskOf(4, 4), offset: [2 ** 30, 0], maskOffset: [2 ** 30 - 1, 0] }),
        rasterLayer(6, "origin-sum", 4, 4, { mask: maskOf(4, 4), offset: [1, 2], maskOffset: [10, 20], maskRenderOffset: [100, 200] }),
      ],
    });

    for (const name of ["x-far", "y-far", "sum-far"]) {
      expect(layerNamed(result, name).mask).toBeNull();
      expect(layerNamed(result, name).pixels).not.toBeNull();
    }
    expect(layerNamed(result, "edge").mask?.extent).toMatchObject({ x: 2 ** 31 - 1, y: 0 });
    expect(layerNamed(result, "origin-sum").mask?.extent).toMatchObject({ x: 111, y: 222 });
    expect(codes(result.unsupported)).toEqual(["clip-layer-mask-unreachable", "clip-layer-mask-unreachable", "clip-layer-mask-unreachable"]);
    expect(result.unsupported[0]!.message).toBe("마스크 읽기 실패: 마스크 위치가 허용 범위를 벗어난다");
  });

  it("마스크 첫 단계 배율의 경계: 100.5와 99.5는 읽고 그 너머는 읽지 않는다", async () => {
    const withScale = async (scale: number) =>
      importSpec({ layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 4, 4, { mask: maskOf(4, 4, { scale }) })] });

    for (const scale of [100, 100.5, 99.5]) expect((await withScale(scale)).layers[0]!.mask).not.toBeNull();
    for (const scale of [100.51, 99.49, 50, 0]) {
      const result = await withScale(scale);
      expect(result.layers[0]!.mask).toBeNull();
      expect(codes(result.unsupported)).toEqual(["clip-layer-mask-scale"]);
      expect(result.unsupported[0]!.message).toBe(`마스크 읽기 실패: 첫 단계 MipmapInfo의 배율이 ${scale}이다 (원본 크기 100이 아니다)`);
    }
    const pixels = await importSpec({ layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 4, 4, { raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern, scale: 100.5 } })] });
    expect(pixels.layers[0]!.pixels).not.toBeNull();
    const pixelsOver = await importSpec({ layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 4, 4, { raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern, scale: 100.51 } })] });
    expect(pixelsOver.unsupported[0]!.message).toContain("픽셀 읽기 실패: 첫 단계 MipmapInfo의 배율이 100.51이다");
  });

  it("마스크 오프스크린 초기 값이 1이면 비어 있는 블록도 1로 채운다", async () => {
    const result = await importSpec({
      layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 4, 4, { mask: maskOf(4, 4, { hasColor: true, packedRgba: 0x00000001, emptyBlocks: new Set([0]) }) })],
    });

    expect(result.layers[0]!.mask).toMatchObject({ defaultValue: 1 });
    expect(Array.from(result.layers[0]!.mask!.values!)).toEqual(new Array(16).fill(1));
  });
});

describe("importChunkedSqliteDocument: 레이어가 많은 문서", () => {
  const count = 40;
  const manyLayers = (): FixtureDocumentSpec => {
    const layers: FixtureLayer[] = [{ id: 1, children: Array.from({ length: count }, (_, index) => index + 2) }];
    for (let index = 0; index < count; index += 1) {
      const id = index + 2;
      layers.push({ id, name: `L${id}`, raster: { width: 3, height: 3, kind: "rgba", pixelAt: (x, y) => [id & 255, x * 40, y * 40, 255] } });
    }
    return { layers };
  };

  it("서른세 개 넘는 레이어도 하나하나 정확한 픽셀을 받는다", async () => {
    const result = await importSpec(manyLayers());

    expect(result.layers).toHaveLength(count);
    expect(result.unsupported).toEqual([]);
    for (const layer of result.layers) {
      expect(layer.pixels).not.toBeNull();
      for (let y = 0; y < 3; y += 1) {
        for (let x = 0; x < 3; x += 1) {
          expect(Array.from(layer.pixels!.subarray((y * 3 + x) * 4, (y * 3 + x) * 4 + 4))).toEqual([layer.id & 255, x * 40, y * 40, 255]);
        }
      }
    }
  });

  it("오프스크린 조회는 16개씩 묶어서 한다(40개 → 16, 16, 8)", async () => {
    const log: NodeSqliteCallLog = { selects: [], tableColumnCalls: 0, closed: false };
    await importChunkedSqliteDocument(buildClipDocument(manyLayers()).bytes, { openSqlite: createNodeSqliteOpener({ log }) });

    const offscreenSelects = log.selects.filter((request) => request.table === "Offscreen");
    expect(offscreenSelects.map((request) => request.where!.in.length)).toEqual([16, 16, 8]);
    expect(new Set(offscreenSelects.flatMap((request) => request.where!.in)).size).toBe(count);
    const mipmapSelects = log.selects.filter((request) => request.table === "Mipmap" || request.table === "MipmapInfo");
    expect(mipmapSelects.map((request) => [request.table, request.where!.in.length])).toEqual([["Mipmap", count], ["MipmapInfo", count]]);
  });
});

describe("importChunkedSqliteDocument: 종류 표지 열의 값 형식", () => {
  const kindOf = async (overrides: FixtureLayer["overrides"]): Promise<string> => {
    const result = await importSpec({ layers: [{ id: 1, children: [2] }, { id: 2, name: "x", layerType: 1, overrides }] });
    return result.layers[0]!.kind;
  };

  // 출처 없는 선택: S1은 표지 열이 NULL이 아니면 그 종류라고만 적었다. 길이가 0인 BLOB을 그 종류로 보지 않는 것은 이 구현의 가정이다.
  it("BLOB 표지 열은 길이가 0보다 클 때만 있다고 본다(빈 BLOB·NULL은 없다)", async () => {
    expect(await kindOf({ TextLayerString: Uint8Array.of(1) })).toBe("text");
    expect(await kindOf({ TextLayerString: new Uint8Array(0) })).toBe("raster");
    expect(await kindOf({ TextLayerString: null })).toBe("raster");
    expect(await kindOf({ GradationFillInfo: Uint8Array.of(1, 2) })).toBe("fill");
    expect(await kindOf({ GradationFillInfo: new Uint8Array(0) })).toBe("raster");
    expect(await kindOf({ FilterLayerInfo: Uint8Array.of(9) })).toBe("adjustment");
    expect(await kindOf({ FilterLayerInfo: null })).toBe("raster");
    expect(await kindOf({ ResizableImageInfo: Uint8Array.of(5) })).toBe("image-material");
    expect(await kindOf({ ResizableImageInfo: new Uint8Array(0) })).toBe("raster");
    expect(await kindOf({ ResizableImageInfo: null })).toBe("raster");
  });

  it("정수 표지 열은 양의 정수일 때만 있다고 본다(0·NULL·음수·글자는 없다)", async () => {
    expect(await kindOf({ FirstLayerObject: 5 })).toBe("model3d");
    expect(await kindOf({ FirstLayerObject: 0 })).toBe("raster");
    expect(await kindOf({ FirstLayerObject: null })).toBe("raster");
    expect(await kindOf({ FirstLayerObject: -2 })).toBe("raster");
    expect(await kindOf({ FirstLayerObject: "abc" })).toBe("raster");
    // 정수 친화성 열에 넣은 숫자 글자는 저장될 때 정수가 된다.
    expect(await kindOf({ FirstLayerObject: "7" })).toBe("model3d");
    expect(await kindOf({ ComicFrameLineMipmap: 9 })).toBe("raster");
  });

  it("VectorNormalStrokeIndex는 NULL이 아니면(값이 무엇이든) 획이 있다고 보고 LayerType이 0일 때만 벡터로 판정한다", async () => {
    const vector = async (stroke: Uint8Array | number | null, layerType = 0) => {
      const result = await importSpec({ layers: [{ id: 1, children: [2] }, { id: 2, name: "x", layerType, overrides: { VectorNormalStrokeIndex: stroke } }] });
      return result.layers[0]!.kind;
    };

    expect(await vector(Uint8Array.of(1, 2, 3))).toBe("vector");
    expect(await vector(new Uint8Array(0))).toBe("vector");
    expect(await vector(0)).toBe("vector");
    expect(await vector(null)).toBe("other");
    expect(await vector(Uint8Array.of(1), 2)).toBe("other");
    expect(await vector(Uint8Array.of(1), 1)).toBe("raster");
  });
});

describe("importChunkedSqliteDocument: 큰 셀 값", () => {
  it("이름이 아주 길어도 maxTextCharacters에서 자르고 요청에는 길이 제한이 들어 있다", async () => {
    const log: NodeSqliteCallLog = { selects: [], tableColumnCalls: 0, closed: false };
    const result = await importChunkedSqliteDocument(buildClipDocument({ layers: [{ id: 1, children: [2] }, { id: 2, name: "긴".repeat(10_000), uuid: "u".repeat(10_000), layerType: 1 }] }).bytes, {
      openSqlite: createNodeSqliteOpener({ log }),
    });

    expect(result.layers[0]!.name).toBe("긴".repeat(1024));
    expect(result.layers[0]!.uuid).toBe("u".repeat(1024));
    const layerSelect = log.selects.find((request) => request.table === "Layer")!;
    expect(layerSelect.columns.filter((column) => column.limit !== undefined).map((column) => [column.name, column.limit])).toEqual([["LayerName", 4096], ["LayerUuid", 4096]]);
  });

  it("Attribute가 1 MiB를 넘으면 읽지 않고 넘쳤다고 알린다(정확히 1 MiB는 구조 검사까지 간다)", async () => {
    const withAttribute = (size: number) =>
      importSpec({ layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 4, 4, { raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern, attributeOverride: new Uint8Array(size) } })] });

    const over = await withAttribute(1_048_577);
    expect(codes(over.unsupported)).toEqual(["clip-offscreen-attribute-oversized"]);
    expect(over.unsupported[0]!.message).toBe("픽셀 읽기 실패: 오프스크린의 Attribute BLOB가 1048576바이트를 넘어 읽지 않는다");
    expect(over.layers[0]!.pixels).toBeNull();
    const exact = await withAttribute(1_048_576);
    expect(codes(exact.unsupported)).toEqual(["clip-offscreen-attribute"]);
  });

  it("외부 ID 셀이 4096자를 넘으면 잘린 ID가 어떤 블록과도 맞지 않아 데이터 없음으로 읽고 알린다(메시지의 ID는 줄인다)", async () => {
    const result = await importSpec({
      layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 4, 4)],
      afterBuild: (run) => run("UPDATE Offscreen SET BlockData = ? WHERE MainId = 3020", "k".repeat(6000) as never),
    });

    expect(codes(result.warnings)).toEqual(["clip-offscreen-external-absent"]);
    expect(result.warnings[0]!.message).toContain(`${"k".repeat(80)}…`);
    expect(result.warnings[0]!.message).not.toContain("k".repeat(81));
    expect(Array.from(result.layers[0]!.pixels!)).toEqual(new Array(64).fill(0));
  });

  it("외부 ID 셀 끝의 NUL은 떼고 읽는다", async () => {
    const result = await importSpec({
      layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 4, 4)],
      afterBuild: (run) => run("UPDATE Offscreen SET BlockData = ? WHERE MainId = 3020", Uint8Array.from([...new TextEncoder().encode(fixtureExternalId(2, "render")), 0, 0, 0]) as never),
    });

    expect(result.warnings).toEqual([]);
    expect(result.layers[0]!.pixels![0]).toBe(pattern(0, 0)[0]);
  });
});

describe("importChunkedSqliteDocument: 외부 ID의 대소문자와 저장 블록 수", () => {
  const withDbId = (dbId: string) =>
    importSpec({
      layers: [{ id: 1, children: [3] }, rasterLayer(3, "a", 4, 4)],
      afterBuild: (run) => run("UPDATE Offscreen SET BlockData = ? WHERE MainId = 3030", new TextEncoder().encode(dbId) as never),
    });

  it("DB의 ID와 컨테이너의 ID가 16진 글자의 대소문자만 달라도 같은 블록으로 읽는다(조용히 투명해지지 않는다)", async () => {
    // 레이어 3의 외부 ID는 16진 글자 E를 포함한다(레이어 2의 ID는 숫자뿐이라 대소문자를 구분할 수 없다).
    const upper = fixtureExternalId(3, "render");
    expect(upper).not.toBe(upper.toLowerCase());

    for (const dbId of [upper.toLowerCase(), `extrnlid${upper.slice(8).toLowerCase()}`, upper]) {
      const result = await withDbId(dbId);
      expect(result.warnings, dbId).toEqual([]);
      expect(result.unsupported, dbId).toEqual([]);
      expect(result.layers[0]!.pixels![0], dbId).toBe(pattern(0, 0)[0]);
      expect(result.layers[0]!.storedBlocks, dbId).toBe(1);
    }
  });

  it("컨테이너 쪽 ID가 소문자여도 DB의 대문자 ID와 짝이 맞고, 글자가 다르면 짝이 맞지 않는다", async () => {
    const lowerChunk = await importSpec({
      layers: [{ id: 1, children: [3] }, rasterLayer(3, "a", 4, 4, { raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern, omitExternal: true } })],
      rawExtaPayloads: [encodeClipExternalChunkPayload({ externalId: fixtureExternalId(3, "render").toLowerCase(), data: buildOffscreenFixture({ width: 4, height: 4, kind: "rgba", pixelAt: pattern }).payload })],
    });
    expect(lowerChunk.warnings).toEqual([]);
    expect(lowerChunk.layers[0]!.pixels![0]).toBe(pattern(0, 0)[0]);

    const different = await withDbId(`extrnlid${"0".repeat(32)}`);
    expect(codes(different.warnings)).toEqual(["clip-offscreen-external-absent"]);
    expect(different.layers[0]!.storedBlocks).toBe(0);
  });

  it("대소문자만 다른 ID가 둘이면 같은 ID로 보고 처음 것만 쓰며 경고한다", async () => {
    const result = await importSpec({
      layers: [{ id: 1, children: [3] }, rasterLayer(3, "a", 4, 4)],
      rawExtaPayloads: [encodeClipExternalChunkPayload({ externalId: fixtureExternalId(3, "render").toLowerCase(), data: Uint8Array.of(1, 2, 3) })],
    });

    expect(codes(result.warnings)).toEqual(["clip-external-duplicate-id"]);
    expect(result.warnings[0]!.message).toContain("대소문자만 다른 것 포함");
    expect(result.layers[0]!.pixels![0]).toBe(pattern(0, 0)[0]);
  });

  it("layer.storedBlocks와 mask.storedBlocks는 실제로 푼 블록 수이고 읽지 않았으면 null이다", async () => {
    const wide = { width: 256 * 3, height: 2, kind: "rgba" as const, emptyBlocks: new Set([1]), pixelAt: pattern };
    const result = await importSpec({
      layers: [
        { id: 1, children: [2, 3, 4] },
        { id: 2, name: "partial", raster: wide, mask: { width: 256 * 2, height: 1, kind: "mask8", emptyBlocks: new Set([0, 1]), pixelAt: () => [9] }, visibility: 3 },
        { id: 3, name: "text", layerType: 1, raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern }, overrides: { TextLayerString: Uint8Array.of(1) } },
        rasterLayer(4, "empty", 4, 4, { raster: { width: 4, height: 4, kind: "rgba", emptyBlocks: new Set([0]), pixelAt: pattern } }),
      ],
    });

    expect(layerNamed(result, "partial").storedBlocks).toBe(2);
    expect(layerNamed(result, "partial").mask!.storedBlocks).toBe(0);
    expect(layerNamed(result, "empty").storedBlocks).toBe(0);
    expect(layerNamed(result, "text").storedBlocks).toBeNull();
    const folderOnly = await importSpec({ layers: [{ id: 1, children: [2] }, { id: 2, name: "folder", folder: true }] });
    expect(folderOnly.layers[0]!.storedBlocks).toBeNull();
    const undecoded = await importSpec({ layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 4, 4)] }, { decodePixels: false });
    expect(undecoded.layers[0]!.storedBlocks).toBeNull();
  });
});

describe("importChunkedSqliteDocument: 크기가 0인 오프스크린", () => {
  it("0x0 오프스크린은 초기 색이 있어도 던지지 않고 빈 픽셀로 읽는다", async () => {
    const result = await importSpec({
      layers: [{ id: 1, children: [2] }, rasterLayer(2, "zero", 0, 0, { raster: { width: 0, height: 0, kind: "rgba", hasColor: true, packedRgba: 0x11223344, pixelAt: pattern } })],
    });

    expect(result.unsupported).toEqual([]);
    expect(result.layers[0]!.extent).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(result.layers[0]!.pixels!.byteLength).toBe(0);
    expect(result.layers[0]!.storedBlocks).toBe(0);
  });
});

describe("importChunkedSqliteDocument: 진단 코드별 총계", () => {
  it("목록은 코드당 50건에서 접히지만 diagnosticCounts는 접히기 전의 건수를 그대로 센다", async () => {
    const texts: FixtureLayer[] = Array.from({ length: 130 }, (_, index) => ({ id: index + 2, name: `t${index}`, layerType: 1, overrides: { TextLayerString: Uint8Array.of(1) } }));
    const result = await importSpec({ layers: [{ id: 1, children: texts.map((layer) => layer.id) }, ...texts] });

    expect(result.unsupported.filter((issue) => issue.code === "clip-layer-kind-not-rendered")).toHaveLength(50);
    expect(result.unsupported.at(-1)).toMatchObject({ code: "clip-issues-collapsed" });
    expect(result.diagnosticCounts.unsupported).toEqual({ "clip-layer-kind-not-rendered": 130 });
    expect(result.diagnosticCounts.warnings).toEqual({});
  });

  it("경고도 코드별로 센다", async () => {
    const result = await importSpec({
      layers: [{ id: 1, children: [2, 3] }, rasterLayer(2, "a", 4, 4, { raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern, omitExternal: true } }), rasterLayer(3, "b", 4, 4, { raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern, omitExternal: true } })],
    });

    expect(result.diagnosticCounts.warnings).toEqual({ "clip-offscreen-external-absent": 2 });
    expect(result.diagnosticCounts.unsupported).toEqual({});
  });
});

describe("importChunkedSqliteDocument: 컨테이너의 외부 블록", () => {
  it("같은 외부 ID가 둘 이상이면 처음 것만 쓰고 경고한다", async () => {
    const result = await importSpec({
      layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 4, 4)],
      rawExtaPayloads: [encodeClipExternalChunkPayload({ externalId: fixtureExternalId(2, "render"), data: Uint8Array.of(1, 2, 3) })],
    });

    expect(codes(result.warnings)).toEqual(["clip-external-duplicate-id"]);
    expect(result.warnings[0]!.scope).toBe("container");
    expect(result.warnings[0]!.message).toContain(fixtureExternalId(2, "render"));
    expect(result.unsupported).toEqual([]);
    expect(result.layers[0]!.pixels![0]).toBe(pattern(0, 0)[0]);
  });

  it("푸터가 없거나 길이가 맞지 않는 컨테이너도 외부 블록을 모두 읽었다면 없는 청크는 데이터 없음이다", async () => {
    const absent = { raster: { width: 4, height: 4, kind: "rgba" as const, pixelAt: pattern, omitExternal: true } };
    for (const extra of [{ omitFooter: true }, { trailingBytes: new Uint8Array(40).fill(0x41) }] as const) {
      const result = await importSpec({ layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 4, 4, absent)], ...extra });

      expect(codes(result.warnings)).toContain("clip-offscreen-external-absent");
      expect(codes(result.unsupported)).toEqual([]);
    }
  });

  it("해석하지 못한 외부 블록이 앞에 있어도 건너뛰고 뒤의 유효한 블록은 모두 연결한다", async () => {
    const result = await importSpec({
      layers: [{ id: 1, children: [2, 3] }, rasterLayer(2, "a", 4, 4), rasterLayer(3, "b", 4, 4)],
      leadingRawExtaPayloads: [new Uint8Array(4)],
    });

    expect(result.layers.map((layer) => layer.storedBlocks)).toEqual([1, 1]);
    expect(result.unsupported).toEqual([]);
    expect(codes(result.warnings)).not.toContain("clip-offscreen-external-absent");
  });

  it("중복 ID 블록을 건너뛴 뒤에도 뒤의 다른 ID 블록은 모두 연결한다(앞선 것이 이긴다)", async () => {
    const data = buildOffscreenFixture({ width: 4, height: 4, kind: "rgba", pixelAt: pattern }).payload;
    const result = await importSpec({
      layers: [{ id: 1, children: [2, 3] }, rasterLayer(2, "a", 4, 4), rasterLayer(3, "b", 4, 4)],
      // 소문자 사본이 먼저 오고, 뒤이은 레이어 2의 대문자 블록은 중복이라 건너뛴다. 그 뒤의 레이어 3 블록은 이어서 읽어야 한다.
      leadingRawExtaPayloads: [encodeClipExternalChunkPayload({ externalId: fixtureExternalId(2, "render").toLowerCase(), data })],
    });

    expect(codes(result.warnings)).toEqual(["clip-external-duplicate-id"]);
    expect(result.layers.map((layer) => layer.storedBlocks)).toEqual([1, 1]);
    expect(result.unsupported).toEqual([]);
  });

  it("해석하지 못한 외부 청크의 ID(clip-exta-unparsed-N)를 가리켜도 연결되지 않는다", async () => {
    const result = await importSpec({
      layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 4, 4, { raster: { width: 4, height: 4, kind: "rgba", pixelAt: pattern, omitExternal: true } })],
      rawExtaPayloads: [new Uint8Array(4)],
      afterBuild: (run) => run("UPDATE Offscreen SET BlockData = 'clip-exta-unparsed-1' WHERE MainId = 3020"),
    });

    expect(codes(result.unsupported)).toEqual(["clip-offscreen-external-missing"]);
  });
});

describe("importChunkedSqliteDocument: 형식이 맞지 않는 오프스크린의 문구", () => {
  it("마스크 자리에 색 형식이 오면 마스크 형식이 아니라고 채널 순서(16진)와 바이트 코드를 알린다", async () => {
    const result = await importSpec({
      layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 4, 4, { mask: { width: 4, height: 4, kind: "rgba", pixelAt: pattern } })],
    });

    expect(result.unsupported).toHaveLength(1);
    expect(result.unsupported[0]).toMatchObject({ code: "clip-offscreen-format", scope: "resource" });
    expect(result.unsupported[0]!.message).toBe("마스크 읽기 실패: 마스크에 맞지 않는 블록 형식이다 (채널 순서 0x21, 바이트 코드 5)");
  });

  it("레이어 자리에 마스크 형식이 오면 레이어 형식이 아니라고 알린다", async () => {
    const result = await importSpec({
      layers: [{ id: 1, children: [2] }, { id: 2, name: "a", layerType: 1, raster: { width: 4, height: 4, kind: "mask8", pixelAt: () => [3] } }],
    });

    expect(result.unsupported[0]!.message).toBe("픽셀 읽기 실패: 레이어에 맞지 않는 블록 형식이다 (채널 순서 0x1, 바이트 코드 1)");
  });

  it("회색 8비트 오프스크린은 레이어 자리에서는 받고 마스크 자리에서는 거부한다", async () => {
    const asLayer = await importSpec({ layers: [{ id: 1, children: [2] }, { id: 2, name: "g", layerType: 1, raster: { width: 4, height: 4, kind: "gray8", pixelAt: () => [10, 20] } }] });
    expect(asLayer.unsupported).toEqual([]);
    const asMask = await importSpec({ layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 4, 4, { mask: { width: 4, height: 4, kind: "gray8", pixelAt: () => [10, 20] } })] });
    expect(asMask.unsupported[0]!.message).toBe("마스크 읽기 실패: 마스크에 맞지 않는 블록 형식이다 (채널 순서 0x11, 바이트 코드 2)");
  });
});

describe("importChunkedSqliteDocument: 진단 경로의 레이어 이름", () => {
  const pathFor = async (name: string): Promise<string> => {
    const result = await importSpec({ layers: [{ id: 1, children: [2] }, { id: 2, name, layerType: 4098 }] });
    return result.unsupported[0]!.path!;
  };

  it("이름은 40 코드 포인트까지 그대로, 41부터 말줄임표로 자른다(경계)", async () => {
    expect(await pathFor("n".repeat(40))).toBe(`layers[0] (id 2 "${"n".repeat(40)}")`);
    expect(await pathFor("n".repeat(41))).toBe(`layers[0] (id 2 "${"n".repeat(40)}…")`);
  });

  it("서로게이트 쌍도 한 글자로 센다", async () => {
    expect(await pathFor("😀".repeat(40))).toBe(`layers[0] (id 2 "${"😀".repeat(40)}")`);
    expect(await pathFor("😀".repeat(41))).toBe(`layers[0] (id 2 "${"😀".repeat(40)}…")`);
  });

  it("따옴표와 줄바꿈은 JSON 문자열로 이스케이프한다", async () => {
    expect(await pathFor('a"b\nc')).toBe('layers[0] (id 2 "a\\"b\\nc")');
  });
});
