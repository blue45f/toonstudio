import { describe, expect, it } from "vitest";

import {
  CLIP_ATTRIBUTE_MAX_BYTES,
  CLIP_EXTERNAL_ID_READ_LIMIT,
  chunkClipIds,
  computeClipCanvasPixels,
  createClipOffscreenReader,
  readClipCanvas,
  readClipLayerRows,
  readClipPreviewPng,
  readClipVectorLayerIds,
  resolveClipMipmapChains,
  roundClipHalfEven,
  throwIfClipAborted,
  type ClipReaderContext,
} from "../chunked-sqlite-document-reader";
import { CLIP_DOCUMENT_LIMITS, CLIP_SQLITE_MAX_IN_VALUES, ClipDocumentError, type ClipDocumentLimits, type ClipSqliteDatabase, type ClipSqliteSelect, type ClipSqliteValue } from "../chunked-sqlite-document-types";
import { ClipIssueList } from "../chunked-sqlite-issues";
import { CLIP_TEXT_CELL_LIMIT } from "../chunked-sqlite-layer-model";

type FakeRow = Readonly<Record<string, ClipSqliteValue>>;

interface FakeTable {
  readonly columns: readonly string[];
  readonly rows: readonly FakeRow[];
}

/** 표를 메모리에 두고 `select`의 where·distinct·orderBy·limit·열 모드를 흉내 낸다. */
function fakeContext(tables: Record<string, FakeTable>, limits: Partial<ClipDocumentLimits> = {}) {
  const requests: ClipSqliteSelect[] = [];
  const db: ClipSqliteDatabase = {
    tableColumns: (name) => Promise.resolve(Object.hasOwn(tables, name) ? tables[name]!.columns : null),
    select(request) {
      requests.push(request);
      const table = tables[request.table]!;
      let rows = [...table.rows];
      if (request.where !== undefined) {
        // SQLite의 열 친화성처럼 "2"와 2를 같게 본다.
        const wanted = new Set(request.where.in.map(String));
        rows = rows.filter((row) => wanted.has(String(row[request.where!.column])));
      }
      if (request.orderBy !== undefined) rows.sort((left, right) => Number(left[request.orderBy!]) - Number(right[request.orderBy!]));
      let projected = rows.map((row) =>
        request.columns.map((column): ClipSqliteValue => {
          const cell = row[column.name] ?? null;
          if (column.mode === "present") return cell === null ? 0 : 1;
          if (column.mode === "length") return cell === null ? null : typeof cell === "string" || cell instanceof Uint8Array ? cell.length : String(cell).length;
          // `limit`은 TEXT·BLOB만 앞에서 자르고 숫자 셀은 그대로 둔다(판독기 약속).
          if (column.limit !== undefined && (typeof cell === "string" || cell instanceof Uint8Array)) return cell.slice(0, column.limit);
          return cell;
        }),
      );
      if (request.distinct === true) {
        const seen = new Set<string>();
        projected = projected.filter((row) => {
          const key = JSON.stringify(row);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
      return Promise.resolve(projected.slice(0, request.limit));
    },
    close: () => undefined,
  };
  const warnings = new ClipIssueList(100);
  const ctx: ClipReaderContext = { db, limits: { ...CLIP_DOCUMENT_LIMITS, ...limits }, warnings, signal: undefined };
  return { ctx, requests, warnings };
}

describe("roundClipHalfEven", () => {
  it.each([
    [0, 0], [0.4, 0], [0.5, 0], [0.6, 1], [1.5, 2], [2.5, 2], [3.5, 4], [4.5, 4], [4.4999, 4], [4.5001, 5], [7015.748, 7016], [4960.63, 4961],
    [-0.4, 0], [-0.5, 0], [-1.5, -2], [-2.5, -2], [-0.6, -1],
  ])("%f → %f", (value, expected) => {
    expect(roundClipHalfEven(value)).toBe(expected);
  });
});

describe("computeClipCanvasPixels", () => {
  it("단위 코드 0은 px, 1 cm, 2 mm, 3 inch, 5 pt이고 4와 그 밖은 모르는 단위다", () => {
    expect(computeClipCanvasPixels(0, 640, 480, 72)).toEqual({ unit: "px", width: 640, height: 480, source: "pixel-unit" });
    expect(computeClipCanvasPixels(1, 2.54, 5.08, 100)).toEqual({ unit: "cm", width: 100, height: 200, source: "unit-conversion" });
    expect(computeClipCanvasPixels(2, 25.4, 50.8, 100)).toEqual({ unit: "mm", width: 100, height: 200, source: "unit-conversion" });
    expect(computeClipCanvasPixels(3, 1, 2, 100)).toEqual({ unit: "inch", width: 100, height: 200, source: "unit-conversion" });
    expect(computeClipCanvasPixels(5, 72, 144, 100)).toEqual({ unit: "pt", width: 100, height: 200, source: "unit-conversion" });
    for (const code of [4, 6, -1, 100, 0.5]) expect(computeClipCanvasPixels(code, 1, 1, 72)).toBeNull();
  });

  it("S1의 예: 297 mm, 600 dpi → 7016 px (세로 4961은 S1이 적은 값이 아니라 이 구현의 반올림 가정에서 나온 값이다)", () => {
    expect(computeClipCanvasPixels(2, 297, 210, 600)).toMatchObject({ width: 7016, height: 4961 });
  });

  it("값이 유한하지 않거나 해상도가 0 이하(픽셀이 아닌 단위)이면 null이다", () => {
    expect(computeClipCanvasPixels(0, Number.NaN, 1, 72)).toBeNull();
    expect(computeClipCanvasPixels(0, 1, Number.POSITIVE_INFINITY, 72)).toBeNull();
    expect(computeClipCanvasPixels(2, 100, 100, 0)).toBeNull();
    expect(computeClipCanvasPixels(2, 100, 100, -1)).toBeNull();
    expect(computeClipCanvasPixels(2, 100, 100, Number.NaN)).toBeNull();
    // 픽셀 단위는 해상도를 쓰지 않는다.
    expect(computeClipCanvasPixels(0, 10, 10, 0)).toMatchObject({ width: 10, height: 10 });
    expect(computeClipCanvasPixels(0, 10, 10, null)).toMatchObject({ width: 10, height: 10, source: "pixel-unit" });
    expect(computeClipCanvasPixels(2, 100, 100, null)).toBeNull();
  });

  it("해상도는 0보다 크면 어떤 값이든 받는다(1, 0.5, 아주 작은 값은 통과하고 0은 거부)", () => {
    expect(computeClipCanvasPixels(2, 25.4, 25.4, 1)).toMatchObject({ width: 1, height: 1 });
    expect(computeClipCanvasPixels(3, 10, 10, 0.5)).toMatchObject({ width: 5, height: 5 });
    expect(computeClipCanvasPixels(3, 10, 10, 1e-9)).toMatchObject({ unit: "inch" });
    expect(computeClipCanvasPixels(3, 10, 10, 0)).toBeNull();
  });

  it("정확히 .5가 되는 값은 짝수 쪽으로 반올림한다", () => {
    expect(computeClipCanvasPixels(0, 2.5, 3.5, 72)).toMatchObject({ width: 2, height: 4 });
    expect(computeClipCanvasPixels(3, 0.5, 1.5, 5)).toMatchObject({ width: 2, height: 8 });
  });
});

describe("chunkClipIds", () => {
  it("순서를 지켜 size개씩 나눈다", () => {
    expect(chunkClipIds([], 3)).toEqual([]);
    expect(chunkClipIds([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
    expect(chunkClipIds([1, 2, 3, 4], 3)).toEqual([[1, 2, 3], [4]]);
    expect(chunkClipIds([1, 2, 3, 4, 5, 6, 7], 2)).toEqual([[1, 2], [3, 4], [5, 6], [7]]);
  });
});

describe("throwIfClipAborted", () => {
  it("신호가 없거나 서 있지 않으면 통과하고 서 있으면 aborted를 던진다", () => {
    expect(() => throwIfClipAborted(undefined)).not.toThrow();
    expect(() => throwIfClipAborted(new AbortController().signal)).not.toThrow();
    const controller = new AbortController();
    controller.abort();
    expect(() => throwIfClipAborted(controller.signal)).toThrow(ClipDocumentError);
    try {
      throwIfClipAborted(controller.signal);
    } catch (error) {
      expect((error as ClipDocumentError).code).toBe("aborted");
    }
  });
});

describe("resolveClipMipmapChains", () => {
  const mipmaps = (ids: readonly number[]): FakeTable => ({
    columns: ["MainId", "BaseMipmapInfo"],
    rows: ids.map((id) => ({ MainId: id, BaseMipmapInfo: id + 10_000 })),
  });
  const infos = (ids: readonly number[], withScale = true): FakeTable => ({
    columns: withScale ? ["MainId", "Offscreen", "ThisScale"] : ["MainId", "Offscreen"],
    rows: ids.map((id) => ({ MainId: id + 10_000, Offscreen: id + 20_000, ...(withScale ? { ThisScale: 100 } : {}) })),
  });

  it("id가 없으면 표를 조회하지 않는다", async () => {
    const { ctx, requests } = fakeContext({});

    expect((await resolveClipMipmapChains(ctx, [])).size).toBe(0);
    expect(requests).toEqual([]);
  });

  it("중복을 없애고 오름차순으로 500개씩 나눠 두 표를 조회한다", async () => {
    const ids = Array.from({ length: 1200 }, (_, index) => 1200 - index);
    const { ctx, requests } = fakeContext({ Mipmap: mipmaps(ids), MipmapInfo: infos(ids) });
    const result = await resolveClipMipmapChains(ctx, [...ids, ...ids.slice(0, 50)]);

    expect(result.size).toBe(1200);
    expect(result.get(1)).toEqual({ offscreenId: 20_001, scale: 100 });
    expect(result.get(1200)).toEqual({ offscreenId: 21_200, scale: 100 });
    expect(requests.map((request) => [request.table, request.where!.in.length])).toEqual([
      ["Mipmap", 500], ["Mipmap", 500], ["Mipmap", 200],
      ["MipmapInfo", 500], ["MipmapInfo", 500], ["MipmapInfo", 200],
    ]);
    const firstBatch = requests[0]!.where!.in;
    expect(firstBatch[0]).toBe(1);
    expect(firstBatch[499]).toBe(500);
    for (const request of requests) {
      expect(request.where!.column).toBe("MainId");
      expect(request.orderBy).toBe("MainId");
      expect(request.limit).toBe(request.where!.in.length);
      expect(request.where!.in.length).toBeLessThanOrEqual(CLIP_SQLITE_MAX_IN_VALUES);
    }
  });

  it("Mipmap이 가리키는 MipmapInfo id가 뒤섞여 있어도 MipmapInfo는 오름차순 id로 묶어 조회한다", async () => {
    const { ctx, requests } = fakeContext({
      Mipmap: {
        columns: ["MainId", "BaseMipmapInfo"],
        rows: [{ MainId: 1, BaseMipmapInfo: 15 }, { MainId: 2, BaseMipmapInfo: 11 }, { MainId: 3, BaseMipmapInfo: 13 }, { MainId: 4, BaseMipmapInfo: 11 }],
      },
      MipmapInfo: {
        columns: ["MainId", "Offscreen", "ThisScale"],
        rows: [11, 13, 15].map((id) => ({ MainId: id, Offscreen: id + 100, ThisScale: 100 })),
      },
    });
    const result = await resolveClipMipmapChains(ctx, [4, 3, 2, 1]);

    expect(requests.filter((request) => request.table === "MipmapInfo").map((request) => request.where!.in)).toEqual([[11, 13, 15]]);
    expect([1, 2, 3, 4].map((id) => (result.get(id) as { offscreenId: number }).offscreenId)).toEqual([115, 111, 113, 111]);
  });

  it("가장 작은 양수 id(1)로 이어진 연결도 따라간다", async () => {
    const { ctx } = fakeContext({
      Mipmap: { columns: ["MainId", "BaseMipmapInfo"], rows: [{ MainId: 1, BaseMipmapInfo: 1 }] },
      MipmapInfo: { columns: ["MainId", "Offscreen", "ThisScale"], rows: [{ MainId: 1, Offscreen: 1, ThisScale: 100 }] },
    });

    expect((await resolveClipMipmapChains(ctx, [1])).get(1)).toEqual({ offscreenId: 1, scale: 100 });
  });

  it("MipmapInfo 행이 같은 id로 둘 이상이고 Offscreen이 0인 첫 행이 앞서면 연결 끊김으로 본다(첫 행만 쓴다)", async () => {
    const { ctx } = fakeContext({
      Mipmap: { columns: ["MainId", "BaseMipmapInfo"], rows: [{ MainId: 1, BaseMipmapInfo: 5 }] },
      MipmapInfo: {
        columns: ["MainId", "Offscreen", "ThisScale"],
        rows: [{ MainId: 5, Offscreen: 0, ThisScale: 100 }, { MainId: 5, Offscreen: 9, ThisScale: 100 }],
      },
    });

    expect((await resolveClipMipmapChains(ctx, [1])).get(1)).toBe("offscreen-link-missing");
  });

  it("끊어진 연결의 이유를 id별로 돌려준다", async () => {
    const { ctx } = fakeContext({
      Mipmap: {
        columns: ["MainId", "BaseMipmapInfo"],
        rows: [
          { MainId: 2, BaseMipmapInfo: 12 }, // MipmapInfo 행이 없다
          { MainId: 3, BaseMipmapInfo: 13 }, // Offscreen 연결이 0
          { MainId: 4, BaseMipmapInfo: 0 }, // 첫 단계가 없다
          { MainId: 5, BaseMipmapInfo: null },
          { MainId: 6, BaseMipmapInfo: 16 },
        ],
      },
      MipmapInfo: {
        columns: ["MainId", "Offscreen", "ThisScale"],
        rows: [
          { MainId: 13, Offscreen: 0, ThisScale: 100 },
          { MainId: 16, Offscreen: 99, ThisScale: 50.5 },
        ],
      },
    });
    const result = await resolveClipMipmapChains(ctx, [1, 2, 3, 4, 5, 6]);

    expect(Object.fromEntries(result)).toEqual({
      1: "mipmap-missing",
      2: "mipmap-info-missing",
      3: "offscreen-link-missing",
      4: "mipmap-missing",
      5: "mipmap-missing",
      6: { offscreenId: 99, scale: 50.5 },
    });
  });

  it("ThisScale 열이 없으면 scale은 null이고 그 열을 요청하지 않는다", async () => {
    const { ctx, requests } = fakeContext({ Mipmap: mipmaps([1]), MipmapInfo: infos([1], false) });
    const result = await resolveClipMipmapChains(ctx, [1]);

    expect(result.get(1)).toEqual({ offscreenId: 20_001, scale: null });
    expect(requests[1]!.columns.map((column) => column.name)).toEqual(["MainId", "Offscreen"]);
  });

  it("같은 MainId가 두 번 나오면 처음 행을 쓴다", async () => {
    const { ctx } = fakeContext({
      Mipmap: {
        columns: ["MainId", "BaseMipmapInfo"],
        rows: [{ MainId: 1, BaseMipmapInfo: 11 }, { MainId: 1, BaseMipmapInfo: 12 }],
      },
      MipmapInfo: {
        columns: ["MainId", "Offscreen", "ThisScale"],
        rows: [{ MainId: 11, Offscreen: 101, ThisScale: 100 }, { MainId: 11, Offscreen: 102, ThisScale: 100 }, { MainId: 12, Offscreen: 103, ThisScale: 100 }],
      },
    });

    expect((await resolveClipMipmapChains(ctx, [1])).get(1)).toEqual({ offscreenId: 101, scale: 100 });
  });

  it("중복된 MipmapInfo 행은 건너뛰되 같은 묶음의 뒤쪽 행은 계속 읽는다(요청 행 수가 id 수라 중복이 끝 행을 밀어낼 수는 있다)", async () => {
    const { ctx } = fakeContext({
      Mipmap: {
        columns: ["MainId", "BaseMipmapInfo"],
        rows: [{ MainId: 1, BaseMipmapInfo: 11 }, { MainId: 2, BaseMipmapInfo: 12 }, { MainId: 3, BaseMipmapInfo: 13 }],
      },
      MipmapInfo: {
        columns: ["MainId", "Offscreen", "ThisScale"],
        rows: [
          { MainId: 11, Offscreen: 101, ThisScale: 100 },
          { MainId: 11, Offscreen: 102, ThisScale: 100 },
          { MainId: 12, Offscreen: 103, ThisScale: 100 },
          { MainId: 13, Offscreen: 104, ThisScale: 100 },
        ],
      },
    });
    const result = await resolveClipMipmapChains(ctx, [1, 2, 3]);

    expect(result.get(1)).toEqual({ offscreenId: 101, scale: 100 });
    expect(result.get(2)).toEqual({ offscreenId: 103, scale: 100 });
    // 판독기가 돌려줄 수 있는 행은 id 수(3)까지라 중복 행 하나가 마지막 id의 행을 밀어냈다.
    expect(result.get(3)).toBe("mipmap-info-missing");
  });

  it("표나 필요한 열이 없으면 모든 id가 tables-missing이고 경고를 한 번 남긴다", async () => {
    for (const tables of [
      {},
      { Mipmap: mipmaps([1]) },
      { MipmapInfo: infos([1]) },
      { Mipmap: { columns: ["MainId"], rows: [] }, MipmapInfo: infos([1]) },
      { Mipmap: mipmaps([1]), MipmapInfo: { columns: ["MainId"], rows: [] } },
      { Mipmap: { columns: ["BaseMipmapInfo"], rows: [] }, MipmapInfo: infos([1]) },
      { Mipmap: mipmaps([1]), MipmapInfo: { columns: ["Offscreen"], rows: [] } },
    ] as Array<Record<string, FakeTable>>) {
      const { ctx, warnings } = fakeContext(tables);
      const result = await resolveClipMipmapChains(ctx, [1, 2]);

      expect(Object.fromEntries(result)).toEqual({ 1: "tables-missing", 2: "tables-missing" });
      expect(warnings.toArray().map((issue) => issue.code)).toEqual(["clip-raster-tables-missing"]);
    }
  });
});

describe("createClipOffscreenReader", () => {
  const table = (rows: readonly FakeRow[]): FakeTable => ({ columns: ["MainId", "Attribute", "BlockData"], rows });

  it("표나 열이 없으면 경고하고 null을 돌려준다", async () => {
    for (const tables of [{}, { Offscreen: { columns: ["MainId", "Attribute"], rows: [] } }] as Array<Record<string, FakeTable>>) {
      const { ctx, warnings } = fakeContext(tables);

      expect(await createClipOffscreenReader(ctx)).toBeNull();
      expect(warnings.toArray().map((issue) => issue.code)).toEqual(["clip-raster-tables-missing"]);
    }
  });

  it("Attribute는 BLOB만 받고 외부 ID는 문자열·BLOB 모두 받으며 끝의 NUL과 빈 값은 정리한다", async () => {
    const attribute = Uint8Array.of(1, 2, 3);
    const { ctx, requests } = fakeContext({
      Offscreen: table([
        { MainId: 1, Attribute: attribute, BlockData: "extrnlid00" },
        { MainId: 2, Attribute: "text", BlockData: new TextEncoder().encode("extrnlid01\0\0") },
        { MainId: 3, Attribute: null, BlockData: "" },
        { MainId: 4, Attribute: attribute, BlockData: null },
        { MainId: 5, Attribute: attribute, BlockData: "\0\0" },
      ]),
    });
    const read = (await createClipOffscreenReader(ctx))!;
    const rows = await read([1, 2, 3, 4, 5]);

    expect(rows.get(1)).toEqual({ attribute, attributeOversized: false, externalId: "extrnlid00" });
    expect(rows.get(2)).toEqual({ attribute: null, attributeOversized: false, externalId: "extrnlid01" });
    expect(rows.get(3)).toEqual({ attribute: null, attributeOversized: false, externalId: null });
    expect(rows.get(4)).toEqual({ attribute, attributeOversized: false, externalId: null });
    expect(rows.get(5)).toEqual({ attribute, attributeOversized: false, externalId: null });
    expect(requests[0]).toMatchObject({ table: "Offscreen", where: { column: "MainId", in: [1, 2, 3, 4, 5] }, orderBy: "MainId", limit: 5 });
    expect(requests[0]!.columns.map((column) => column.name)).toEqual(["MainId", "Attribute", "BlockData"]);
  });

  it("MainId가 겹치면 처음 행을 쓰고, 정수가 아닌 MainId 행은 버린다", async () => {
    const first = Uint8Array.of(1);
    const { ctx } = fakeContext({
      Offscreen: table([
        { MainId: 1, Attribute: first, BlockData: "first" },
        { MainId: 1, Attribute: Uint8Array.of(9), BlockData: "dup" },
        { MainId: "2", Attribute: first, BlockData: "text-id" },
        { MainId: 2, Attribute: first, BlockData: "later" },
      ]),
    });
    const rows = await (await createClipOffscreenReader(ctx))!([1, 2, 3, 4]);

    expect(rows.get(1)).toEqual({ attribute: first, attributeOversized: false, externalId: "first" });
    expect(rows.get(2)).toEqual({ attribute: first, attributeOversized: false, externalId: "later" });
    expect([...rows.keys()]).toEqual([1, 2]);
  });

  it("한 번에 500개까지는 묻고 501개부터는 reader-failed다(where.in 한도)", async () => {
    const { ctx, requests } = fakeContext({ Offscreen: table([{ MainId: 1, Attribute: Uint8Array.of(1), BlockData: "a" }]) });
    const read = (await createClipOffscreenReader(ctx))!;
    const ids = (count: number) => Array.from({ length: count }, (_, index) => index + 1);

    await read(ids(500));
    expect(requests.at(-1)!.where!.in).toHaveLength(500);
    await expect(read(ids(501))).rejects.toMatchObject({ code: "reader-failed", message: `where.in 값이 ${CLIP_SQLITE_MAX_IN_VALUES}개를 넘는다` });
  });

  it("호출할 때마다 조회하고 열 확인은 만들 때 한 번만 한다", async () => {
    let columnCalls = 0;
    const { ctx } = fakeContext({ Offscreen: table([{ MainId: 1, Attribute: Uint8Array.of(1), BlockData: "a" }]) });
    const original = ctx.db.tableColumns.bind(ctx.db);
    ctx.db.tableColumns = (name) => {
      columnCalls += 1;
      return original(name);
    };
    const read = (await createClipOffscreenReader(ctx))!;
    await read([1]);
    await read([1]);

    expect(columnCalls).toBe(1);
  });
});

describe("readClipVectorLayerIds", () => {
  it("표가 없거나 LayerId 열이 없으면 빈 집합이고 조회하지 않는다", async () => {
    for (const tables of [{}, { VectorObjectList: { columns: ["MainId"], rows: [] } }] as Array<Record<string, FakeTable>>) {
      const { ctx, requests } = fakeContext(tables);

      expect((await readClipVectorLayerIds(ctx)).size).toBe(0);
      expect(requests).toEqual([]);
    }
  });

  it("중복 없는 양의 정수 id만 모으고, 한도에 닿으면 경고한다", async () => {
    const rows = [5, 5, 7, 0, -1, 9].map((LayerId) => ({ LayerId }));
    const { ctx, requests, warnings } = fakeContext({ VectorObjectList: { columns: ["LayerId"], rows } });
    const ids = await readClipVectorLayerIds(ctx);

    expect([...ids].sort()).toEqual([5, 7, 9]);
    expect(requests[0]).toMatchObject({ table: "VectorObjectList", distinct: true, orderBy: "LayerId", limit: CLIP_DOCUMENT_LIMITS.maxLayers + 1 });
    expect(warnings.toArray()).toEqual([]);

    // 한도는 maxLayers + 1 = 4행이다: 꽉 찬 결과는 잘렸는지 알 수 없으므로 경고하고, 그보다 적으면 경고하지 않는다.
    const over = fakeContext({ VectorObjectList: { columns: ["LayerId"], rows: [1, 2, 3, 4, 5].map((LayerId) => ({ LayerId })) } }, { maxLayers: 3 });
    expect((await readClipVectorLayerIds(over.ctx)).size).toBe(4);
    expect(over.warnings.toArray().map((issue) => issue.code)).toEqual(["clip-vector-list-truncated"]);
    const full = fakeContext({ VectorObjectList: { columns: ["LayerId"], rows: [1, 2, 3, 4].map((LayerId) => ({ LayerId })) } }, { maxLayers: 3 });
    expect((await readClipVectorLayerIds(full.ctx)).size).toBe(4);
    expect(full.warnings.toArray().map((issue) => issue.code)).toEqual(["clip-vector-list-truncated"]);
    const under = fakeContext({ VectorObjectList: { columns: ["LayerId"], rows: [1, 2, 3].map((LayerId) => ({ LayerId })) } }, { maxLayers: 3 });
    expect((await readClipVectorLayerIds(under.ctx)).size).toBe(3);
    expect(under.warnings.toArray()).toEqual([]);
  });
});

describe("readClipLayerRows: 요청의 모양", () => {
  const layerTable = (columns: readonly string[], rows: readonly FakeRow[]): FakeTable => ({ columns, rows });

  it("파일에 있는 열만, 캔버스로 거르고 MainId 순으로, 루트를 포함한 maxLayers+2행까지 요청한다", async () => {
    const { ctx, requests } = fakeContext(
      { Layer: layerTable(["MainId", "CanvasId", "LayerFirstChildIndex", "LayerNextIndex", "LayerName", "FutureColumn"], [{ MainId: 1, CanvasId: 4, LayerFirstChildIndex: 0, LayerNextIndex: 0, LayerName: "root" }]) },
      { maxLayers: 10 },
    );
    const rows = await readClipLayerRows(ctx, 4);

    expect([...rows.keys()]).toEqual([1]);
    expect(requests[0]!.columns.map((column) => column.name)).toEqual(["MainId", "LayerName", "LayerFirstChildIndex", "LayerNextIndex"]);
    expect(requests[0]).toMatchObject({ table: "Layer", where: { column: "CanvasId", in: [4] }, orderBy: "MainId", limit: 12 });
  });

  it("CanvasId 열이 없으면 거르지 않는다", async () => {
    const { ctx, requests } = fakeContext({ Layer: layerTable(["MainId", "LayerFirstChildIndex", "LayerNextIndex"], [{ MainId: 1, LayerFirstChildIndex: 0, LayerNextIndex: 0 }]) });
    await readClipLayerRows(ctx, 4);

    expect(requests[0]!.where).toBeUndefined();
  });

  it("maxLayers+1행(루트 포함)까지는 받고 하나 더 있으면 limit-exceeded다", async () => {
    const rows = (count: number): FakeRow[] => Array.from({ length: count }, (_, index) => ({ MainId: index + 1, CanvasId: 1, LayerFirstChildIndex: 0, LayerNextIndex: 0 }));
    const columns = ["MainId", "CanvasId", "LayerFirstChildIndex", "LayerNextIndex"];

    expect((await readClipLayerRows(fakeContext({ Layer: layerTable(columns, rows(4)) }, { maxLayers: 3 }).ctx, 1)).size).toBe(4);
    await expect(readClipLayerRows(fakeContext({ Layer: layerTable(columns, rows(5)) }, { maxLayers: 3 }).ctx, 1)).rejects.toMatchObject({ code: "limit-exceeded" });
  });
});

const CANVAS_COLUMNS = ["MainId", "CanvasUnit", "CanvasWidth", "CanvasHeight", "CanvasResolution", "CanvasRootFolder", "CanvasDefaultColorTypeIndex", "CanvasChannelBytes"];

function canvasTable(rows: readonly FakeRow[], columns: readonly string[] = CANVAS_COLUMNS): Record<string, FakeTable> {
  return { Canvas: { columns, rows } };
}

const goodCanvas: FakeRow = { MainId: 1, CanvasUnit: 0, CanvasWidth: 640, CanvasHeight: 480, CanvasResolution: 72, CanvasRootFolder: 2, CanvasDefaultColorTypeIndex: 0, CanvasChannelBytes: 1 };

async function canvasFailure(row: FakeRow, columns: readonly string[] = CANVAS_COLUMNS, limits: Partial<ClipDocumentLimits> = {}): Promise<ClipDocumentError> {
  const { ctx } = fakeContext(canvasTable([row], columns), limits);
  return readClipCanvas(ctx).then(
    () => {
      throw new Error("오류가 나야 한다");
    },
    (error: unknown) => error as ClipDocumentError,
  );
}

describe("readClipCanvas", () => {
  it("요청은 필수 열과 있는 선택 열을 이 순서로, MainId 순 2행까지 묻는다", async () => {
    const { ctx, requests } = fakeContext(canvasTable([goodCanvas]));
    await readClipCanvas(ctx);

    expect(requests[0]).toMatchObject({ table: "Canvas", orderBy: "MainId", limit: 2 });
    expect(requests[0]!.columns.map((column) => column.name)).toEqual(["MainId", "CanvasUnit", "CanvasWidth", "CanvasHeight", "CanvasResolution", "CanvasRootFolder", "CanvasDefaultColorTypeIndex", "CanvasChannelBytes"]);
    const bare = fakeContext(canvasTable([goodCanvas], CANVAS_COLUMNS.slice(0, 6)));
    const info = await readClipCanvas(bare.ctx);
    expect(bare.requests[0]!.columns.map((column) => column.name)).toEqual(CANVAS_COLUMNS.slice(0, 6));
    expect(info).toMatchObject({ defaultColorType: null, channelBytes: null });
  });

  it("값을 그대로 담고 정수 셀을 bigint로 받아도 같은 결과를 낸다", async () => {
    const plain = await readClipCanvas(fakeContext(canvasTable([goodCanvas])).ctx);
    const big = await readClipCanvas(
      fakeContext(canvasTable([{ MainId: 1n, CanvasUnit: 0n, CanvasWidth: 640, CanvasHeight: 480, CanvasResolution: 72n, CanvasRootFolder: 2n, CanvasDefaultColorTypeIndex: 0n, CanvasChannelBytes: 1n }])).ctx,
    );

    expect(plain).toEqual({
      id: 1, unit: "px", unitCode: 0, widthValue: 640, heightValue: 480, resolution: 72, width: 640, height: 480, sizeSource: "pixel-unit", rootFolderId: 2, defaultColorType: 0, channelBytes: 1,
    });
    expect(big).toEqual(plain);
  });

  it("Canvas 표가 없으면 database-invalid다", async () => {
    const { ctx } = fakeContext({});

    await expect(readClipCanvas(ctx)).rejects.toMatchObject({ code: "database-invalid", message: "문서 DB에 Canvas 표가 없다" });
  });

  it("필수 열이 없으면 없는 열 이름을 순서대로 알린다", async () => {
    const error = await canvasFailure(goodCanvas, ["MainId", "CanvasUnit", "CanvasRootFolder"]);

    expect(error).toMatchObject({ code: "database-invalid", message: "Canvas 표에 필수 열이 없다: CanvasWidth, CanvasHeight, CanvasResolution" });
  });

  it("행이 없으면 database-invalid다", async () => {
    await expect(readClipCanvas(fakeContext(canvasTable([])).ctx)).rejects.toMatchObject({ code: "database-invalid", message: "Canvas 표에 행이 없다" });
  });

  it("행이 둘 이상이면 MainId가 가장 작은 행만 읽고 한 번 경고한다", async () => {
    const { ctx, warnings } = fakeContext(canvasTable([{ ...goodCanvas, MainId: 9, CanvasWidth: 111 }, { ...goodCanvas, MainId: 3, CanvasWidth: 222 }, { ...goodCanvas, MainId: 5, CanvasWidth: 333 }]));
    const info = await readClipCanvas(ctx);

    expect(info).toMatchObject({ id: 3, width: 222 });
    expect(warnings.toArray()).toEqual([{ scope: "metadata", code: "clip-canvas-multiple", message: "Canvas 행이 둘 이상이다. MainId가 가장 작은 캔버스만 읽는다" }]);
    expect(fakeContext(canvasTable([goodCanvas])).warnings.toArray()).toEqual([]);
  });

  it.each([
    ["MainId가 0", { MainId: 0 }, "Canvas.MainId가 양의 정수가 아니다"],
    ["MainId가 음수", { MainId: -1 }, "Canvas.MainId가 양의 정수가 아니다"],
    ["MainId가 NULL", { MainId: null }, "Canvas.MainId가 양의 정수가 아니다"],
    ["MainId가 소수", { MainId: 1.5 }, "Canvas.MainId가 양의 정수가 아니다"],
    ["루트 폴더가 0", { CanvasRootFolder: 0 }, "Canvas.CanvasRootFolder가 양의 정수가 아니다"],
    ["루트 폴더가 NULL", { CanvasRootFolder: null }, "Canvas.CanvasRootFolder가 양의 정수가 아니다"],
    ["루트 폴더가 글자", { CanvasRootFolder: "2" }, "Canvas.CanvasRootFolder가 양의 정수가 아니다"],
    ["단위가 글자", { CanvasUnit: "mm" }, "Canvas.CanvasUnit이 정수가 아니다"],
    ["단위가 소수", { CanvasUnit: 0.5 }, "Canvas.CanvasUnit이 정수가 아니다"],
    ["폭이 NULL", { CanvasWidth: null }, "Canvas의 폭·높이 값이 올바른 수가 아니다"],
    ["높이가 글자", { CanvasHeight: "480" }, "Canvas의 폭·높이 값이 올바른 수가 아니다"],
    ["폭이 NaN", { CanvasWidth: Number.NaN }, "Canvas의 폭·높이 값이 올바른 수가 아니다"],
    ["높이가 무한", { CanvasHeight: Number.POSITIVE_INFINITY }, "Canvas의 폭·높이 값이 올바른 수가 아니다"],
    ["해상도가 글자", { CanvasResolution: "72" }, "Canvas.CanvasResolution이 올바른 수가 아니다"],
    ["해상도가 NaN", { CanvasResolution: Number.NaN }, "Canvas.CanvasResolution이 올바른 수가 아니다"],
    ["단위 코드를 모른다", { CanvasUnit: 4 }, "캔버스 크기를 픽셀로 바꿀 수 없다 (단위 코드 4, 해상도 72)"],
    ["픽셀이 아닌 단위에서 해상도가 NULL", { CanvasUnit: 2, CanvasResolution: null }, "캔버스 크기를 픽셀로 바꿀 수 없다 (단위 코드 2, 해상도 없음)"],
    ["픽셀이 아닌 단위에서 해상도가 0", { CanvasUnit: 2, CanvasResolution: 0 }, "캔버스 크기를 픽셀로 바꿀 수 없다 (단위 코드 2, 해상도 0)"],
    ["폭이 반올림하면 0", { CanvasWidth: 0.4 }, "캔버스 크기 0x480가 올바르지 않다"],
    ["높이가 음수", { CanvasHeight: -3 }, "캔버스 크기 640x-3가 올바르지 않다"],
  ])("%s이면 database-invalid다", async (_name, patch, message) => {
    const error = await canvasFailure({ ...goodCanvas, ...patch });

    expect(error).toBeInstanceOf(ClipDocumentError);
    expect(error.code).toBe("database-invalid");
    expect(error.message).toBe(message);
  });

  it("단위 셀이 NULL이면 픽셀(0)이고 해상도 셀이 NULL이어도 픽셀 단위는 받아들인다", async () => {
    const info = await readClipCanvas(fakeContext(canvasTable([{ ...goodCanvas, CanvasUnit: null, CanvasResolution: null }])).ctx);

    expect(info).toMatchObject({ unit: "px", unitCode: 0, resolution: null, width: 640, height: 480, sizeSource: "pixel-unit" });
  });

  it("1x1 캔버스는 받아들이고 한 변 한도와 같은 크기도 받아들인다(경계)", async () => {
    expect(await readClipCanvas(fakeContext(canvasTable([{ ...goodCanvas, CanvasWidth: 1, CanvasHeight: 1 }])).ctx)).toMatchObject({ width: 1, height: 1 });
    expect(await readClipCanvas(fakeContext(canvasTable([{ ...goodCanvas, CanvasWidth: 100, CanvasHeight: 100 }]), { maxCanvasDimension: 100 }).ctx)).toMatchObject({ width: 100, height: 100 });
  });

  it("한 변이 한도를 넘으면 limit-exceeded이고 메시지에 크기와 한도가 든다(폭과 높이 각각)", async () => {
    const wide = await canvasFailure({ ...goodCanvas, CanvasWidth: 101, CanvasHeight: 50 }, CANVAS_COLUMNS, { maxCanvasDimension: 100 });
    const tall = await canvasFailure({ ...goodCanvas, CanvasWidth: 50, CanvasHeight: 101 }, CANVAS_COLUMNS, { maxCanvasDimension: 100 });

    expect(wide).toMatchObject({ code: "limit-exceeded", message: "캔버스 101x50가 한 변 한도 100를 넘는다" });
    expect(tall).toMatchObject({ code: "limit-exceeded", message: "캔버스 50x101가 한 변 한도 100를 넘는다" });
  });

  it("픽셀이 아닌 단위는 환산한 크기로 한도를 본다", async () => {
    const info = await readClipCanvas(fakeContext(canvasTable([{ ...goodCanvas, CanvasUnit: 2, CanvasWidth: 297, CanvasHeight: 210, CanvasResolution: 600 }])).ctx);

    expect(info).toMatchObject({ unit: "mm", unitCode: 2, widthValue: 297, heightValue: 210, resolution: 600, width: 7016, height: 4961, sizeSource: "unit-conversion" });
  });
});

describe("readClipLayerRows: 값과 진단", () => {
  const columns = ["MainId", "CanvasId", "LayerName", "LayerUuid", "LayerFirstChildIndex", "LayerNextIndex"];
  const row = (patch: FakeRow): FakeRow => ({ MainId: 1, CanvasId: 1, LayerName: "n", LayerUuid: "u", LayerFirstChildIndex: 0, LayerNextIndex: 0, ...patch });

  it("이름과 UUID 열은 판독기에게 길이를 제한해 달라고 요청한다", async () => {
    const { ctx, requests } = fakeContext({ Layer: { columns, rows: [row({})] } });
    await readClipLayerRows(ctx, 1);

    const limited = requests[0]!.columns.filter((column) => column.limit !== undefined);
    expect(limited).toEqual([
      { name: "LayerName", limit: CLIP_TEXT_CELL_LIMIT },
      { name: "LayerUuid", limit: CLIP_TEXT_CELL_LIMIT },
    ]);
    expect(CLIP_TEXT_CELL_LIMIT).toBe(4096);
    expect(requests[0]!.columns.filter((column) => column.limit === undefined).every((column) => column.mode === undefined || column.mode === "present" || column.mode === "length")).toBe(true);
  });

  it("긴 이름은 maxTextCharacters에서 자르고 BLOB 이름도 UTF-8로 읽는다", async () => {
    const { ctx } = fakeContext(
      { Layer: { columns, rows: [row({ MainId: 1, LayerName: "가".repeat(10) }), row({ MainId: 2, LayerName: new TextEncoder().encode("한글이름"), LayerUuid: "u".repeat(50) })] } },
      { maxTextCharacters: 3 },
    );
    const rows = await readClipLayerRows(ctx, 1);

    expect(rows.get(1)!.name).toBe("가가가");
    expect(rows.get(2)!.name).toBe("한글이");
    expect(rows.get(2)!.uuid).toBe("uuu");
  });

  it("MainId가 양의 정수가 아닌 행은 개수와 함께 한 번 알리고 건너뛴다", async () => {
    const { ctx, warnings } = fakeContext({ Layer: { columns, rows: [row({ MainId: 1 }), row({ MainId: 0 }), row({ MainId: null }), row({ MainId: "3" }), row({ MainId: 2 ** 64 })] } });
    const rows = await readClipLayerRows(ctx, 1);

    expect([...rows.keys()]).toEqual([1]);
    expect(warnings.toArray()).toEqual([{ scope: "semantic", code: "clip-layer-row-invalid", message: "MainId가 양의 정수가 아닌 Layer 행 4개를 건너뛰었다" }]);
    const single = fakeContext({ Layer: { columns, rows: [row({ MainId: 1 }), row({ MainId: -5 })] } });
    await readClipLayerRows(single.ctx, 1);
    expect(single.warnings.toArray()[0]!.message).toBe("MainId가 양의 정수가 아닌 Layer 행 1개를 건너뛰었다");
    const clean = fakeContext({ Layer: { columns, rows: [row({ MainId: 1 })] } });
    await readClipLayerRows(clean.ctx, 1);
    expect(clean.warnings.toArray()).toEqual([]);
  });

  it("같은 MainId가 다시 나오면 알리고 건너뛰되 뒤따르는 행은 계속 읽는다", async () => {
    const { ctx, warnings } = fakeContext({ Layer: { columns, rows: [row({ MainId: 2, LayerName: "first" }), row({ MainId: 2, LayerName: "dup" }), row({ MainId: 3, LayerName: "after" }), row({ MainId: 2, LayerName: "dup2" })] } });
    const rows = await readClipLayerRows(ctx, 1);

    expect([...rows.keys()]).toEqual([2, 3]);
    expect(rows.get(2)!.name).toBe("first");
    expect(rows.get(3)!.name).toBe("after");
    expect(warnings.toArray().map((issue) => [issue.code, issue.message])).toEqual([
      ["clip-layer-duplicate-id", "Layer.MainId 2가 두 번 나온다. 처음 행만 쓴다"],
      ["clip-layer-duplicate-id", "Layer.MainId 2가 두 번 나온다. 처음 행만 쓴다"],
    ]);
  });

  it("정수 셀을 bigint로 받아도 같은 결과이고 안전 정수를 넘는 bigint 행은 건너뛴다", async () => {
    const { ctx, warnings } = fakeContext({
      Layer: { columns, rows: [row({ MainId: 5n, LayerFirstChildIndex: 6n }), row({ MainId: 6n, LayerNextIndex: 0n }), row({ MainId: 2n ** 64n })] },
    });
    const rows = await readClipLayerRows(ctx, 1);

    expect([...rows.keys()]).toEqual([5, 6]);
    expect(rows.get(5)!.firstChild).toBe(6);
    expect(warnings.toArray().map((issue) => issue.code)).toEqual(["clip-layer-row-invalid"]);
  });

  it("Layer 표가 없거나 필수 열이 없으면 database-invalid다", async () => {
    await expect(readClipLayerRows(fakeContext({}).ctx, 1)).rejects.toMatchObject({ code: "database-invalid", message: "문서 DB에 Layer 표가 없다" });
    await expect(readClipLayerRows(fakeContext({ Layer: { columns: ["MainId"], rows: [] } }).ctx, 1)).rejects.toMatchObject({
      code: "database-invalid",
      message: "Layer 표에 필수 열이 없다: LayerFirstChildIndex, LayerNextIndex",
    });
  });
});

describe("판독기 호출 감싸기", () => {
  const layerTable: Record<string, FakeTable> = { Layer: { columns: ["MainId", "LayerFirstChildIndex", "LayerNextIndex"], rows: [{ MainId: 1, LayerFirstChildIndex: 0, LayerNextIndex: 0 }] } };

  it("판독기 오류는 reader-failed로 바꾸고 원인을 보존하며 메시지는 200자에서 자른다", async () => {
    const { ctx } = fakeContext(layerTable);
    const failure = new Error("e".repeat(250));
    ctx.db.select = () => Promise.reject(failure);
    const error = await readClipLayerRows(ctx, 1).then(
      () => {
        throw new Error("오류가 나야 한다");
      },
      (caught: unknown) => caught as ClipDocumentError,
    );

    expect(error).toMatchObject({ code: "reader-failed", cause: failure });
    expect(error.message).toBe(`SQLite 판독기가 실패했다: ${"e".repeat(200)}…`);
  });

  it("오류 메시지는 200자까지 그대로, 201자부터 말줄임표로 자른다(경계)", async () => {
    const failWith = async (length: number): Promise<string> => {
      const { ctx } = fakeContext(layerTable);
      ctx.db.select = () => Promise.reject(new Error("m".repeat(length)));
      const error = await readClipLayerRows(ctx, 1).then(
        () => {
          throw new Error("오류가 나야 한다");
        },
        (caught: unknown) => caught as ClipDocumentError,
      );
      return error.message;
    };

    expect(await failWith(200)).toBe(`SQLite 판독기가 실패했다: ${"m".repeat(200)}`);
    expect(await failWith(201)).toBe(`SQLite 판독기가 실패했다: ${"m".repeat(200)}…`);
  });

  it("동기로 던져도, Error가 아닌 값을 던져도 reader-failed다", async () => {
    const { ctx } = fakeContext(layerTable);
    ctx.db.select = () => {
      throw "문자열";
    };

    await expect(readClipLayerRows(ctx, 1)).rejects.toMatchObject({ code: "reader-failed", message: "SQLite 판독기가 실패했다: 문자열", cause: "문자열" });
  });

  it("판독기가 ClipDocumentError를 던지면 그대로 낸다", async () => {
    const { ctx } = fakeContext(layerTable);
    const original = new ClipDocumentError("원래 오류", "limit-exceeded");
    ctx.db.select = () => Promise.reject(original);

    await expect(readClipLayerRows(ctx, 1)).rejects.toBe(original);
  });

  it("중단 신호가 서 있으면 조회하지 않고 aborted이며, 오류가 나도 서 있으면 reader-failed가 아니라 aborted다", async () => {
    const controller = new AbortController();
    const { ctx } = fakeContext(layerTable);
    let selects = 0;
    ctx.db.select = () => {
      selects += 1;
      controller.abort();
      return Promise.reject(new Error("중단하며 실패"));
    };
    const withSignal = { ...ctx, signal: controller.signal };

    await expect(readClipLayerRows(withSignal, 1)).rejects.toMatchObject({ code: "aborted" });
    expect(selects).toBe(1);
    await expect(readClipLayerRows(withSignal, 1)).rejects.toMatchObject({ code: "aborted" });
    expect(selects).toBe(1);
  });

  it("조회 계약 위반(행 수 초과·열 수 불일치·배열 아님)은 표 이름과 함께 reader-failed다", async () => {
    // maxLayers=1이면 한 번에 요청하는 행은 최대 3개(루트 + 레이어 + 넘침 확인용 1)다.
    const tooMany = fakeContext(layerTable, { maxLayers: 1 });
    tooMany.ctx.db.select = () => Promise.resolve([[1, 0, 0], [2, 0, 0], [3, 0, 0], [4, 0, 0], [5, 0, 0], [6, 0, 0]]);
    await expect(readClipLayerRows(tooMany.ctx, 1)).rejects.toThrow("SQLite 판독기가 Layer에서 한도 3행을 넘겨 6행을 돌려줬다");

    const narrow = fakeContext(layerTable);
    narrow.ctx.db.select = () => Promise.resolve([[1, 0]]);
    await expect(readClipLayerRows(narrow.ctx, 1)).rejects.toThrow("Layer 조회 행의 열 수가 요청(3)과 다르다");

    const notArray = fakeContext(layerTable);
    notArray.ctx.db.select = () => Promise.resolve(null as never);
    await expect(readClipLayerRows(notArray.ctx, 1)).rejects.toThrow("Layer 조회 결과가 배열이 아니다");

    const rowNotArray = fakeContext(layerTable);
    rowNotArray.ctx.db.select = () => Promise.resolve([5 as never]);
    await expect(readClipLayerRows(rowNotArray.ctx, 1)).rejects.toThrow("Layer 조회 행의 열 수가 요청(3)과 다르다");
  });
});

describe("선택 표를 읽지 못해도 가져오기를 멈추지 않는다", () => {
  const vectorTable: Record<string, FakeTable> = { VectorObjectList: { columns: ["LayerId"], rows: [{ LayerId: 3 }] } };

  it("VectorObjectList 조회가 실패하면 빈 집합과 경고 한 건을 남긴다", async () => {
    const { ctx, warnings } = fakeContext(vectorTable);
    ctx.db.select = () => Promise.reject(new Error("표가 깨졌다"));
    const ids = await readClipVectorLayerIds(ctx);

    expect(ids.size).toBe(0);
    expect(warnings.toArray()).toEqual([
      { scope: "semantic", code: "clip-vector-list-unreadable", message: "VectorObjectList를 읽지 못해 벡터 레이어를 가려내지 못했다: SQLite 판독기가 실패했다: 표가 깨졌다" },
    ]);
  });

  it("판독기 오류 메시지가 길면 경고에는 감싼 메시지의 앞 200 코드 포인트까지만 싣는다(경계)", async () => {
    const wrapperPrefix = "SQLite 판독기가 실패했다: ";
    const warningFor = async (length: number): Promise<string> => {
      const { ctx, warnings } = fakeContext(vectorTable);
      ctx.db.select = () => Promise.reject(new Error("e".repeat(length)));
      await readClipVectorLayerIds(ctx);
      return warnings.toArray()[0]!.message;
    };
    const head = "VectorObjectList를 읽지 못해 벡터 레이어를 가려내지 못했다: ";
    const room = 200 - [...wrapperPrefix].length;

    expect(await warningFor(room)).toBe(`${head}${wrapperPrefix}${"e".repeat(room)}`);
    expect(await warningFor(room + 1)).toBe(`${head}${wrapperPrefix}${"e".repeat(room)}…`);
    expect(await warningFor(5_000)).toBe(`${head}${wrapperPrefix}${"e".repeat(room)}…`);
  });

  it("열 목록 조회가 실패해도 마찬가지다", async () => {
    const { ctx, warnings } = fakeContext(vectorTable);
    ctx.db.tableColumns = () => Promise.reject(new Error("열 목록 실패"));

    expect((await readClipVectorLayerIds(ctx)).size).toBe(0);
    expect(warnings.toArray().map((issue) => issue.code)).toEqual(["clip-vector-list-unreadable"]);
  });

  it("중단과 reader-failed가 아닌 가져오기 오류는 그대로 올린다", async () => {
    const controller = new AbortController();
    const { ctx } = fakeContext(vectorTable);
    ctx.db.select = () => {
      controller.abort();
      return Promise.reject(new Error("중단하며 실패"));
    };
    await expect(readClipVectorLayerIds({ ...ctx, signal: controller.signal })).rejects.toMatchObject({ code: "aborted" });

    const other = fakeContext(vectorTable);
    const original = new ClipDocumentError("다른 오류", "limit-exceeded");
    other.ctx.db.select = () => Promise.reject(original);
    await expect(readClipVectorLayerIds(other.ctx)).rejects.toBe(original);
  });
});

describe("readClipPreviewPng", () => {
  const PNG = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  const previewTable = (data: ClipSqliteValue, extra: Partial<Record<string, ClipSqliteValue>> = {}): Record<string, FakeTable> => ({
    CanvasPreview: { columns: ["MainId", "CanvasId", "ImageData"], rows: [{ MainId: 1, CanvasId: 7, ImageData: data, ...extra }] },
  });

  it("먼저 길이를 limit 1로 묻고(캔버스로 거르고 MainId 순) 그 길이와 같은 BLOB만 복사해 돌려준다", async () => {
    const data = Uint8Array.of(...PNG, 1, 2, 3);
    const { ctx, requests, warnings } = fakeContext(previewTable(data));
    const result = await readClipPreviewPng(ctx, 7);

    expect(result).toEqual(data);
    expect(result).not.toBe(data);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ table: "CanvasPreview", columns: [{ name: "ImageData", mode: "length" }], where: { column: "CanvasId", in: [7] }, orderBy: "MainId", limit: 1 });
    expect(requests[1]).toMatchObject({ table: "CanvasPreview", columns: [{ name: "ImageData" }], where: { column: "CanvasId", in: [7] }, orderBy: "MainId", limit: 1 });
    expect(warnings.toArray()).toEqual([]);
  });

  it("CanvasId·MainId 열이 없으면 거르지도 정렬하지도 않는다", async () => {
    const { ctx, requests } = fakeContext({ CanvasPreview: { columns: ["ImageData"], rows: [{ ImageData: Uint8Array.of(...PNG) }] } });
    await readClipPreviewPng(ctx, 7);

    for (const request of requests) {
      expect(request.where).toBeUndefined();
      expect(request.orderBy).toBeUndefined();
    }
  });

  it("표나 ImageData 열이 없으면 조회하지 않고 null이다", async () => {
    for (const tables of [{}, { CanvasPreview: { columns: ["MainId"], rows: [] } }] as Array<Record<string, FakeTable>>) {
      const { ctx, requests, warnings } = fakeContext(tables);

      expect(await readClipPreviewPng(ctx, 1)).toBeNull();
      expect(requests).toEqual([]);
      expect(warnings.toArray()).toEqual([]);
    }
  });

  it("행이 없거나 길이가 NULL·0·음수면 조용히 null이고 두 번째 조회를 하지 않는다", async () => {
    for (const data of [null, new Uint8Array(0)]) {
      const { ctx, requests, warnings } = fakeContext(previewTable(data));

      expect(await readClipPreviewPng(ctx, 7)).toBeNull();
      expect(requests).toHaveLength(1);
      expect(warnings.toArray()).toEqual([]);
    }
    const none = fakeContext({ CanvasPreview: { columns: ["ImageData"], rows: [] } });
    expect(await readClipPreviewPng(none.ctx, 7)).toBeNull();
    expect(none.requests).toHaveLength(1);
  });

  it("한도와 같은 크기는 읽고 1바이트라도 크면 읽지 않고 경고한다(경계)", async () => {
    const data = Uint8Array.of(...PNG, 0, 0);
    const exact = fakeContext(previewTable(data), { maxPreviewBytes: data.byteLength });
    expect(await readClipPreviewPng(exact.ctx, 7)).toEqual(data);
    const over = fakeContext(previewTable(data), { maxPreviewBytes: data.byteLength - 1 });

    expect(await readClipPreviewPng(over.ctx, 7)).toBeNull();
    expect(over.requests).toHaveLength(1);
    expect(over.warnings.toArray()).toEqual([
      { scope: "resource", code: "clip-preview-too-large", message: `미리보기 PNG ${data.byteLength}바이트가 한도 ${data.byteLength - 1}를 넘어 읽지 않았다` },
    ]);
  });

  it("PNG 서명 여덟 바이트가 모두 맞아야 하고 한 바이트짜리는 PNG가 아니다", async () => {
    const one = fakeContext(previewTable(Uint8Array.of(0x89)));
    expect(await readClipPreviewPng(one.ctx, 7)).toBeNull();
    expect(one.warnings.toArray().map((issue) => issue.code)).toEqual(["clip-preview-not-png"]);
    for (let position = 0; position < 8; position += 1) {
      const broken = Uint8Array.from(PNG);
      broken[position] = broken[position]! ^ 1;
      const { ctx, warnings } = fakeContext(previewTable(broken));

      expect(await readClipPreviewPng(ctx, 7)).toBeNull();
      expect(warnings.toArray().map((issue) => issue.code)).toEqual(["clip-preview-not-png"]);
    }
    expect(await readClipPreviewPng(fakeContext(previewTable(Uint8Array.from(PNG))).ctx, 7)).toEqual(PNG);
  });

  it("BLOB가 아니거나 앞서 물은 길이와 다르면 clip-preview-unreadable이다", async () => {
    const text = fakeContext(previewTable("not a blob but long enough"));
    expect(await readClipPreviewPng(text.ctx, 7)).toBeNull();
    expect(text.warnings.toArray()).toEqual([{ scope: "resource", code: "clip-preview-unreadable", message: "미리보기 ImageData가 BLOB가 아니거나 길이가 앞서 물은 값과 다르다" }]);

    const mismatch = fakeContext(previewTable(Uint8Array.of(...PNG, 1, 2)));
    const original = mismatch.ctx.db.select.bind(mismatch.ctx.db);
    mismatch.ctx.db.select = async (request) => {
      const rows = await original(request);
      return request.columns[0]!.mode === "length" ? [[999]] : rows;
    };
    expect(await readClipPreviewPng(mismatch.ctx, 7)).toBeNull();
    expect(mismatch.warnings.toArray().map((issue) => issue.code)).toEqual(["clip-preview-unreadable"]);
  });

  it("조회가 실패하면 문서 전체를 버리지 않고 경고만 남긴다(중단은 그대로 올린다)", async () => {
    const failing = fakeContext(previewTable(Uint8Array.of(...PNG)));
    failing.ctx.db.select = () => Promise.reject(new Error("미리보기 표가 깨졌다"));

    expect(await readClipPreviewPng(failing.ctx, 7)).toBeNull();
    expect(failing.warnings.toArray()).toEqual([
      { scope: "resource", code: "clip-preview-unreadable", message: "미리보기를 읽지 못했다: SQLite 판독기가 실패했다: 미리보기 표가 깨졌다" },
    ]);

    const controller = new AbortController();
    const aborting = fakeContext(previewTable(Uint8Array.of(...PNG)));
    aborting.ctx.db.select = () => {
      controller.abort();
      return Promise.reject(new Error("중단하며 실패"));
    };
    await expect(readClipPreviewPng({ ...aborting.ctx, signal: controller.signal }, 7)).rejects.toMatchObject({ code: "aborted" });
  });

  it("판독기 오류 메시지가 길면 경고에는 감싼 메시지의 앞 200 코드 포인트까지만 싣는다(경계)", async () => {
    const wrapperPrefix = "SQLite 판독기가 실패했다: ";
    const warningFor = async (length: number): Promise<string> => {
      const { ctx, warnings } = fakeContext(previewTable(Uint8Array.of(...PNG)));
      ctx.db.select = () => Promise.reject(new Error("p".repeat(length)));
      await readClipPreviewPng(ctx, 7);
      return warnings.toArray()[0]!.message;
    };
    const room = 200 - [...wrapperPrefix].length;

    expect(await warningFor(room)).toBe(`미리보기를 읽지 못했다: ${wrapperPrefix}${"p".repeat(room)}`);
    expect(await warningFor(room + 1)).toBe(`미리보기를 읽지 못했다: ${wrapperPrefix}${"p".repeat(room)}…`);
  });

  it("돌려준 바이트를 고쳐도 판독기가 가진 원본은 그대로다", async () => {
    const data = Uint8Array.of(...PNG, 5);
    const { ctx } = fakeContext(previewTable(data));
    const result = (await readClipPreviewPng(ctx, 7))!;
    result[0] = 0;

    expect(data[0]).toBe(0x89);
  });
});

describe("createClipOffscreenReader: 크기 제한과 정리", () => {
  const table = (rows: readonly FakeRow[]): FakeTable => ({ columns: ["MainId", "Attribute", "BlockData"], rows });

  it("Attribute는 1 MiB + 1, BlockData는 4096으로 판독기에게 잘라 달라고 요청한다", async () => {
    const { ctx, requests } = fakeContext({ Offscreen: table([{ MainId: 1, Attribute: Uint8Array.of(1), BlockData: "x" }]) });
    await (await createClipOffscreenReader(ctx))!([1]);

    expect(requests[0]!.columns).toEqual([{ name: "MainId" }, { name: "Attribute", limit: CLIP_ATTRIBUTE_MAX_BYTES + 1 }, { name: "BlockData", limit: CLIP_EXTERNAL_ID_READ_LIMIT }]);
    expect(CLIP_ATTRIBUTE_MAX_BYTES).toBe(1_048_576);
    expect(CLIP_EXTERNAL_ID_READ_LIMIT).toBe(4096);
  });

  it("Attribute가 정확히 1 MiB면 읽고 1바이트라도 넘으면 읽지 않고 넘쳤다고 표시한다(경계)", async () => {
    const exact = new Uint8Array(CLIP_ATTRIBUTE_MAX_BYTES);
    const over = new Uint8Array(CLIP_ATTRIBUTE_MAX_BYTES + 1);
    const { ctx } = fakeContext({ Offscreen: table([{ MainId: 1, Attribute: exact, BlockData: null }, { MainId: 2, Attribute: over, BlockData: null }]) });
    const rows = await (await createClipOffscreenReader(ctx))!([1, 2]);

    // 1 MiB 배열 전체를 깊은 비교하면 느리므로 길이와 넘침 표시만 본다.
    expect(rows.get(1)!.attribute?.byteLength).toBe(CLIP_ATTRIBUTE_MAX_BYTES);
    expect(rows.get(1)!.attributeOversized).toBe(false);
    expect(rows.get(2)).toEqual({ attribute: null, attributeOversized: true, externalId: null });
  });

  it("외부 ID가 4096자를 넘으면 잘린 값을 그대로 돌려줘 어떤 외부 블록과도 맞지 않는다", async () => {
    const { ctx } = fakeContext({ Offscreen: table([{ MainId: 1, Attribute: Uint8Array.of(1), BlockData: "k".repeat(10_000) }]) });
    const row = (await (await createClipOffscreenReader(ctx))!([1])).get(1)!;

    expect(row.externalId).toBe("k".repeat(4096));
  });

  it("외부 ID 끝의 NUL은 모두 떼고 안쪽 NUL은 남기며 NUL만 있는 값은 없는 것으로 본다", async () => {
    const { ctx } = fakeContext({
      Offscreen: table([
        { MainId: 1, Attribute: Uint8Array.of(1), BlockData: `${"\0".repeat(4000)}a${"\0".repeat(95)}` },
        { MainId: 2, Attribute: Uint8Array.of(1), BlockData: "a\0b\0" },
        { MainId: 3, Attribute: Uint8Array.of(1), BlockData: new Uint8Array(4096) },
        { MainId: 4, Attribute: Uint8Array.of(1), BlockData: Uint8Array.of(0x65, 0x78, 0, 0, 0) },
      ]),
    });
    const rows = await (await createClipOffscreenReader(ctx))!([1, 2, 3, 4]);

    expect(rows.get(1)!.externalId).toBe(`${"\0".repeat(4000)}a`);
    expect(rows.get(2)!.externalId).toBe("a\0b");
    expect(rows.get(3)!.externalId).toBeNull();
    expect(rows.get(4)!.externalId).toBe("ex");
  });

  it("한 번에 묻는 id가 500개를 넘으면 조회하지 않고 reader-failed다(경계: 500개는 조회한다)", async () => {
    const { ctx, requests } = fakeContext({ Offscreen: table([{ MainId: 1, Attribute: Uint8Array.of(1), BlockData: "a" }]) });
    const read = (await createClipOffscreenReader(ctx))!;

    await read(Array.from({ length: CLIP_SQLITE_MAX_IN_VALUES }, (_, index) => index + 1));
    expect(requests).toHaveLength(1);
    await expect(read(Array.from({ length: CLIP_SQLITE_MAX_IN_VALUES + 1 }, (_, index) => index + 1))).rejects.toMatchObject({
      code: "reader-failed",
      message: `where.in 값이 ${CLIP_SQLITE_MAX_IN_VALUES}개를 넘는다`,
    });
    expect(requests).toHaveLength(1);
  });

  it("bigint MainId도 같은 id로 읽는다", async () => {
    const { ctx } = fakeContext({ Offscreen: table([{ MainId: 7n, Attribute: Uint8Array.of(1), BlockData: "a" }]) });

    expect([...(await (await createClipOffscreenReader(ctx))!([7])).keys()]).toEqual([7]);
  });
});
