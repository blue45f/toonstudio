import { describe, expect, it, vi } from "vitest";

import { buildClipDocument, type FixtureDocumentSpec } from "../../../../tests/corpus/formats/chunked-sqlite-document-fixtures";
import { createNodeSqliteOpener, type NodeSqliteCallLog } from "../../../../tests/corpus/formats/node-sqlite-clip-reader";
import { importChunkedSqliteDocument } from "../chunked-sqlite-document";

import type { stepClipOffscreenDecode as StepFunction } from "../chunked-sqlite-blocks";

/** 블록 해독기의 `next()` 호출을 세고, 호출 직전에 심은 동작을 실행한다. */
const probe = vi.hoisted(() => ({ nextCalls: 0, beforeNext: null as null | ((call: number) => void) }));

vi.mock("../chunked-sqlite-blocks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../chunked-sqlite-blocks")>();
  return {
    ...actual,
    stepClipOffscreenDecode: (request: Parameters<typeof StepFunction>[0]) => {
      const inner = actual.stepClipOffscreenDecode(request);
      const wrapped = {
        next: () => {
          probe.nextCalls += 1;
          probe.beforeNext?.(probe.nextCalls);
          return inner.next();
        },
        return: (value: never) => inner.return(value),
        throw: (error: unknown) => inner.throw(error),
        [Symbol.iterator]() {
          return wrapped;
        },
      };
      return wrapped;
    },
  };
});

/** 마스크 형식 오프스크린을 레이어 마스크로 읽는 문서: 블록 수만큼 해독 단계가 있다. */
function wideMaskDocument(blocks: number): FixtureDocumentSpec {
  const width = 256 * blocks;
  return {
    layers: [
      { id: 1, children: [2] },
      { id: 2, name: "masked", layerType: 1, visibility: 3, mask: { width, height: 1, kind: "mask8", pixelAt: (x) => [x & 255] } },
    ],
  };
}

function reset(): void {
  probe.nextCalls = 0;
  probe.beforeNext = null;
}

describe("importChunkedSqliteDocument: 해독 도중 중단", () => {
  it("중단하지 않으면 블록 130개짜리 마스크를 세 번의 next()로 끝까지 읽는다(64, 64, 2블록)", async () => {
    reset();
    const bytes = buildClipDocument(wideMaskDocument(130)).bytes;
    const result = await importChunkedSqliteDocument(bytes, { openSqlite: createNodeSqliteOpener() });

    expect(probe.nextCalls).toBe(3);
    expect(result.layers[0]!.mask!.values!.byteLength).toBe(256 * 130);
    expect(result.unsupported).toEqual([]);
  });

  it("첫 양보 직전에 중단되면 그 양보 뒤 첫 확인에서 aborted이고 더 풀지 않는다", async () => {
    reset();
    const controller = new AbortController();
    probe.beforeNext = (call) => {
      if (call === 1) controller.abort();
    };
    const log: NodeSqliteCallLog = { selects: [], tableColumnCalls: 0, closed: false };
    const bytes = buildClipDocument(wideMaskDocument(130)).bytes;

    await expect(importChunkedSqliteDocument(bytes, { openSqlite: createNodeSqliteOpener({ log }), signal: controller.signal })).rejects.toMatchObject({ code: "aborted" });
    expect(probe.nextCalls).toBe(1);
    expect(log.closed).toBe(true);
  });

  it("두 번째 양보 뒤에 중단돼도 그 지점에서 멈춘다", async () => {
    reset();
    const controller = new AbortController();
    probe.beforeNext = (call) => {
      if (call === 2) controller.abort();
    };
    const bytes = buildClipDocument(wideMaskDocument(130)).bytes;

    await expect(importChunkedSqliteDocument(bytes, { openSqlite: createNodeSqliteOpener(), signal: controller.signal })).rejects.toMatchObject({ code: "aborted" });
    expect(probe.nextCalls).toBe(2);
  });

  it("레이어 픽셀을 풀다가도 같은 방식으로 멈춘다", async () => {
    reset();
    const controller = new AbortController();
    probe.beforeNext = (call) => {
      if (call === 1) controller.abort();
    };
    const spec: FixtureDocumentSpec = {
      layers: [{ id: 1, children: [2] }, { id: 2, name: "wide", raster: { width: 256 * 70, height: 1, kind: "rgba", pixelAt: () => [1, 2, 3, 4] } }],
    };

    await expect(importChunkedSqliteDocument(buildClipDocument(spec).bytes, { openSqlite: createNodeSqliteOpener(), signal: controller.signal })).rejects.toMatchObject({ code: "aborted" });
    expect(probe.nextCalls).toBe(1);
  });

  it("블록이 64개 미만인 오프스크린은 양보 지점이 없으므로 끝까지 한 번의 next()로 읽는다", async () => {
    reset();
    const bytes = buildClipDocument(wideMaskDocument(63)).bytes;
    const result = await importChunkedSqliteDocument(bytes, { openSqlite: createNodeSqliteOpener() });

    expect(probe.nextCalls).toBe(1);
    expect(result.layers[0]!.mask!.values!.byteLength).toBe(256 * 63);
  });

  it("레이어 하나를 읽은 뒤 다음 레이어로 넘어갈 때도 중단을 확인한다", async () => {
    reset();
    const controller = new AbortController();
    probe.beforeNext = (call) => {
      if (call === 2) controller.abort();
    };
    const spec: FixtureDocumentSpec = {
      layers: [
        { id: 1, children: [2, 3, 4] },
        { id: 2, name: "a", raster: { width: 4, height: 4, kind: "rgba", pixelAt: () => [1, 2, 3, 4] } },
        { id: 3, name: "b", raster: { width: 4, height: 4, kind: "rgba", pixelAt: () => [1, 2, 3, 4] } },
        { id: 4, name: "c", raster: { width: 4, height: 4, kind: "rgba", pixelAt: () => [1, 2, 3, 4] } },
      ],
    };

    await expect(importChunkedSqliteDocument(buildClipDocument(spec).bytes, { openSqlite: createNodeSqliteOpener(), signal: controller.signal })).rejects.toMatchObject({ code: "aborted" });
    // 위쪽 레이어(c)를 풀고 나면 pace()가 중단을 확인한다. 둘째(b)의 next()까지는 가지만 그 뒤로는 가지 않는다.
    expect(probe.nextCalls).toBe(2);
  });

  it("풀지 못하고 실패하는 오프스크린이 이어져도 하나가 끝날 때마다 중단을 확인한다", async () => {
    reset();
    const controller = new AbortController();
    // 작업량 예산이 0이라 오프스크린마다 첫 next()에서 실패한다. 첫 시도 중에 중단하면 둘째 오프스크린은 시도조차 하지 않아야 한다.
    probe.beforeNext = (call) => {
      if (call === 1) controller.abort();
    };
    const spec: FixtureDocumentSpec = {
      layers: [
        { id: 1, children: [2, 3, 4] },
        { id: 2, name: "a", raster: { width: 4, height: 4, kind: "rgba", pixelAt: () => [1, 2, 3, 4] } },
        { id: 3, name: "b", raster: { width: 4, height: 4, kind: "rgba", pixelAt: () => [1, 2, 3, 4] } },
        { id: 4, name: "c", raster: { width: 4, height: 4, kind: "rgba", pixelAt: () => [1, 2, 3, 4] } },
      ],
    };

    await expect(
      importChunkedSqliteDocument(buildClipDocument(spec).bytes, { openSqlite: createNodeSqliteOpener(), signal: controller.signal, limits: { maxWorkBytes: 0 } }),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(probe.nextCalls).toBe(1);
  });

  it("중단하지 않으면 실패한 오프스크린마다 시도하고 각각 알린다", async () => {
    reset();
    const spec: FixtureDocumentSpec = {
      layers: [
        { id: 1, children: [2, 3, 4] },
        { id: 2, name: "a", raster: { width: 4, height: 4, kind: "rgba", pixelAt: () => [1, 2, 3, 4] } },
        { id: 3, name: "b", raster: { width: 4, height: 4, kind: "rgba", pixelAt: () => [1, 2, 3, 4] } },
        { id: 4, name: "c", raster: { width: 4, height: 4, kind: "rgba", pixelAt: () => [1, 2, 3, 4] } },
      ],
    };
    const result = await importChunkedSqliteDocument(buildClipDocument(spec).bytes, { openSqlite: createNodeSqliteOpener(), limits: { maxWorkBytes: 0 } });

    expect(probe.nextCalls).toBe(3);
    expect(result.diagnosticCounts.unsupported).toEqual({ "clip-offscreen-limit": 3 });
  });
});
