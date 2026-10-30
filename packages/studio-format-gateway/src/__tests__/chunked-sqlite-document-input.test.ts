import { createHash } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildClipDocument } from "../../../../tests/corpus/formats/chunked-sqlite-document-fixtures";
import { codeOf, failureOf, rasterLayer } from "../../../../tests/corpus/formats/chunked-sqlite-document-test-kit";
import { openNodeSqlite } from "../../../../tests/corpus/formats/node-sqlite-clip-reader";
import { CLIP_DOCUMENT_LIMITS, importChunkedSqliteDocument } from "../chunked-sqlite-document";

const spec = { layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 6, 6)] };

class FailingBlob extends Blob {
  constructor(private readonly failure: unknown) {
    super([new Uint8Array(16)]);
  }

  override arrayBuffer(): Promise<ArrayBuffer> {
    return Promise.reject(this.failure);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("importChunkedSqliteDocument: 입력 읽기", () => {
  it("Blob을 읽다 실패하면 source-invalid이고 원인을 보존한다", async () => {
    const failure = new Error("디스크 오류");
    const error = await failureOf(() => importChunkedSqliteDocument(new FailingBlob(failure), { openSqlite: openNodeSqlite }));

    expect(error).toMatchObject({ code: "source-invalid", cause: failure });
    expect(error.message).toBe("입력을 읽지 못했다: 디스크 오류");
  });

  it("Error가 아닌 값으로 실패해도 문자열로 알린다", async () => {
    await expect(importChunkedSqliteDocument(new FailingBlob("그냥 문자열"), { openSqlite: openNodeSqlite })).rejects.toMatchObject({
      code: "source-invalid",
      message: "입력을 읽지 못했다: 그냥 문자열",
    });
  });

  it("읽기 오류 문구는 200자에서 잘라 생략 부호를 붙인다(200자는 그대로, 넘으면 잘라낸다)", async () => {
    const exact = await failureOf(() => importChunkedSqliteDocument(new FailingBlob(new Error("가".repeat(200))), { openSqlite: openNodeSqlite }));
    const over = await failureOf(() => importChunkedSqliteDocument(new FailingBlob(new Error("가".repeat(201))), { openSqlite: openNodeSqlite }));
    const way = await failureOf(() => importChunkedSqliteDocument(new FailingBlob(new Error("나".repeat(5000))), { openSqlite: openNodeSqlite }));

    expect(exact.message).toBe(`입력을 읽지 못했다: ${"가".repeat(200)}`);
    expect(over.message).toBe(`입력을 읽지 못했다: ${"가".repeat(200)}…`);
    expect(way.message).toBe(`입력을 읽지 못했다: ${"나".repeat(200)}…`);
  });

  it("읽다 메모리가 모자라(RangeError) 실패하면 source-too-large다", async () => {
    const failure = new RangeError("Array buffer allocation failed");
    const error = await failureOf(() => importChunkedSqliteDocument(new FailingBlob(failure), { openSqlite: openNodeSqlite }));

    expect(error).toMatchObject({ code: "source-too-large", cause: failure });
    expect(error.message).toBe("입력 16바이트를 메모리에 올릴 수 없다");
  });

  it("읽는 도중 중단되면 읽기 오류가 아니라 aborted다", async () => {
    const controller = new AbortController();
    class AbortingBlob extends Blob {
      constructor() {
        super([new Uint8Array(16)]);
      }

      override arrayBuffer(): Promise<ArrayBuffer> {
        controller.abort();
        return Promise.reject(new Error("읽다가 실패"));
      }
    }

    await expect(importChunkedSqliteDocument(new AbortingBlob(), { openSqlite: openNodeSqlite, signal: controller.signal })).rejects.toMatchObject({ code: "aborted" });
  });

  it("읽기를 마친 직후 중단돼도 aborted이고 DB를 열지 않는다", async () => {
    const controller = new AbortController();
    let opened = false;
    class AbortAfterBlob extends Blob {
      constructor(parts: Uint8Array[]) {
        super(parts as unknown as BlobPart[]);
      }

      override async arrayBuffer(): Promise<ArrayBuffer> {
        const buffer = await super.arrayBuffer();
        controller.abort();
        return buffer;
      }
    }
    const bytes = buildClipDocument(spec).bytes;

    await expect(
      importChunkedSqliteDocument(new AbortAfterBlob([bytes]), {
        openSqlite: (database, context) => {
          opened = true;
          return openNodeSqlite(database, context);
        },
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(opened).toBe(false);
  });

  it("입력은 호출 시점에 복사해 두므로 가져오는 동안 호출자가 입력을 지워도 결과가 같다", async () => {
    const built = buildClipDocument(spec);
    const baseline = await importChunkedSqliteDocument(built.bytes, { openSqlite: openNodeSqlite });
    const expectedHash = createHash("sha256").update(built.bytes).digest("hex");

    for (const make of [(bytes: Uint8Array) => new Uint8Array(bytes), (bytes: Uint8Array) => new Uint8Array(bytes).buffer as ArrayBuffer]) {
      const input = make(built.bytes);
      const view = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
      const result = await importChunkedSqliteDocument(input, {
        openSqlite: (database, context) => {
          // 열기 직전에 호출자가 원본 버퍼를 지운다. 비공개 사본을 읽는다면 문서 DB는 멀쩡하다.
          view.fill(0);
          return openNodeSqlite(database, context);
        },
      });

      expect(result.source.sha256).toBe(expectedHash);
      expect(result.layers[0]!.pixels).toEqual(baseline.layers[0]!.pixels);
    }
  });
});

describe("importChunkedSqliteDocument: 판독기에 넘기는 DB 바이트", () => {
  it("DB 구간은 복사하지 않고 비공개 사본의 보기로 넘기며 내용은 SQLite 구역과 같다", async () => {
    const built = buildClipDocument(spec);
    let received: Uint8Array | undefined;
    await importChunkedSqliteDocument(built.bytes, {
      openSqlite: (database, context) => {
        received = database;
        return openNodeSqlite(database, context);
      },
    });

    expect(received).toBeDefined();
    expect(received!.byteLength).toBe(built.databaseBytes.byteLength);
    expect(Buffer.compare(received!, built.databaseBytes)).toBe(0);
    // 보기이므로 바탕 버퍼는 DB 구간보다 크고(파일 전체), 호출자의 원본 버퍼와는 다른 버퍼다.
    expect(received!.buffer.byteLength).toBeGreaterThanOrEqual(built.bytes.byteLength);
    expect(received!.byteOffset).toBeGreaterThan(0);
    expect(received!.buffer).not.toBe(built.bytes.buffer);
  });

  it("판독기가 받은 보기를 고쳐도 호출자의 입력은 그대로다", async () => {
    const built = buildClipDocument(spec);
    const before = new Uint8Array(built.bytes);
    await importChunkedSqliteDocument(built.bytes, {
      openSqlite: async (database, context) => {
        const adapter = await openNodeSqlite(database, context);
        database.fill(0xee);
        return adapter;
      },
    });

    expect(Buffer.compare(built.bytes, before)).toBe(0);
  });
});

describe("importChunkedSqliteDocument: 열기 실패 보고", () => {
  it("메시지는 200자에서 자르고 말줄임표를 붙인다(경계 포함)", async () => {
    const bytes = buildClipDocument(spec).bytes;
    const fail = (message: string) =>
      failureOf(() =>
        importChunkedSqliteDocument(bytes, {
          openSqlite: () => {
            throw new Error(message);
          },
        }),
      );

    const exact = await fail("x".repeat(200));
    expect(exact.code).toBe("reader-failed");
    expect(exact.message).toBe(`문서 DB를 열지 못했다: ${"x".repeat(200)}`);
    const over = await fail("x".repeat(201));
    expect(over.message).toBe(`문서 DB를 열지 못했다: ${"x".repeat(200)}…`);
  });

  it("Error가 아닌 값을 던져도 문자열로 알리고 cause에 그 값을 둔다", async () => {
    const bytes = buildClipDocument(spec).bytes;
    const error = await failureOf(() =>
      importChunkedSqliteDocument(bytes, {
        openSqlite: () => {
          throw "문자열 오류";
        },
      }),
    );

    expect(error.message).toBe("문서 DB를 열지 못했다: 문자열 오류");
    expect(error.cause).toBe("문자열 오류");
  });
});

describe("importChunkedSqliteDocument: SHA-256 계산", () => {
  const expected = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

  it("플랫폼 암호 기능이 없으면 순수 구현으로 같은 값을 낸다", async () => {
    const built = buildClipDocument(spec);
    vi.stubGlobal("crypto", undefined);
    const result = await importChunkedSqliteDocument(built.bytes, { openSqlite: openNodeSqlite });

    expect(result.source.sha256).toBe(expected(built.bytes));
  });

  it("subtle이 없거나 digest가 실패해도 순수 구현으로 같은 값을 낸다", async () => {
    const built = buildClipDocument(spec);
    vi.stubGlobal("crypto", {});
    expect((await importChunkedSqliteDocument(built.bytes, { openSqlite: openNodeSqlite })).source.sha256).toBe(expected(built.bytes));
    vi.stubGlobal("crypto", { subtle: { digest: () => Promise.reject(new Error("지원 안 함")) } });
    expect((await importChunkedSqliteDocument(built.bytes, { openSqlite: openNodeSqlite })).source.sha256).toBe(expected(built.bytes));
  });

  it("플랫폼 digest가 있으면 그 결과를 소문자 16진 64자로 쓴다", async () => {
    const built = buildClipDocument(spec);
    const digest = vi.fn(async () => Uint8Array.from({ length: 32 }, (_, index) => index * 8).buffer);
    vi.stubGlobal("crypto", { subtle: { digest } });
    const result = await importChunkedSqliteDocument(built.bytes, { openSqlite: openNodeSqlite });

    expect(digest).toHaveBeenCalledTimes(1);
    expect(digest.mock.calls[0]!.at(0)).toBe("SHA-256");
    expect(result.source.sha256).toBe(Array.from({ length: 32 }, (_, index) => (index * 8).toString(16).padStart(2, "0")).join(""));
    expect(result.source.sha256).toHaveLength(64);
  });
});

describe("importChunkedSqliteDocument: 한도 옵션의 경계", () => {
  const built = buildClipDocument(spec);
  const withLimits = (limits: unknown) => codeOf(() => importChunkedSqliteDocument(built.bytes, { openSqlite: openNodeSqlite, limits: limits as never }));

  it("새 한도 이름과 고정 최대값", async () => {
    expect(CLIP_DOCUMENT_LIMITS.maxWorkBytes).toBe(4_294_967_296);
    expect(await withLimits({ maxWorkBytes: 4_294_967_296 })).toBe("none");
    expect(await withLimits({ maxWorkBytes: 4_294_967_297 })).toBe("limit-invalid");
    expect(await withLimits({ maxWorkBytes: 0 })).toBe("none");
    expect(await withLimits({ maxWorkBytes: -1 })).toBe("limit-invalid");
    expect(await withLimits({ maxSourceBytes: 1_073_741_824 })).toBe("none");
    expect(await withLimits({ maxSourceBytes: 1_073_741_825 })).toBe("limit-invalid");
    expect(await withLimits({ maxLayerPixels: 134_217_728 })).toBe("none");
    expect(await withLimits({ maxLayerPixels: 134_217_729 })).toBe("limit-invalid");
  });

  it("객체가 아닌 limits는 limit-invalid이고 메시지가 그렇게 알린다", async () => {
    for (const limits of [5, "x", true, 0]) expect(await withLimits(limits)).toBe("limit-invalid");
    await expect(importChunkedSqliteDocument(built.bytes, { openSqlite: openNodeSqlite, limits: 5 as never })).rejects.toThrow("limits는 객체여야 한다");
    expect(await withLimits(null)).toBe("none");
    expect(await withLimits(undefined)).toBe("none");
  });

  it("알 수 없는 한도 이름은 이름을 메시지에 담아 알린다(긴 이름은 자른다)", async () => {
    await expect(importChunkedSqliteDocument(built.bytes, { openSqlite: openNodeSqlite, limits: { nope: 1 } as never })).rejects.toThrow("알 수 없는 한도 이름 nope");
    const long = "n".repeat(300);
    const error = await failureOf(() => importChunkedSqliteDocument(built.bytes, { openSqlite: openNodeSqlite, limits: { [long]: 1 } as never }));
    expect(error.message.length).toBeLessThan(150);
  });

  it("범위 오류 메시지에 한도 이름과 최대값이 든다", async () => {
    await expect(importChunkedSqliteDocument(built.bytes, { openSqlite: openNodeSqlite, limits: { maxLayers: 20_001 } })).rejects.toThrow("maxLayers는 0 이상 20000 이하의 정수여야 한다");
  });
});
