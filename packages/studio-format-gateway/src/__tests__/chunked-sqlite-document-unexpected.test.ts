import { afterEach, describe, expect, it, vi } from "vitest";

import { buildClipDocument } from "../../../../tests/corpus/formats/chunked-sqlite-document-fixtures";
import { rasterLayer } from "../../../../tests/corpus/formats/chunked-sqlite-document-test-kit";
import { openNodeSqlite } from "../../../../tests/corpus/formats/node-sqlite-clip-reader";
import { importChunkedSqliteDocument } from "../chunked-sqlite-document";

// 블록 해독기가 `ClipBlockError`가 아닌 예외(프로그램 오류)를 던지는 상황을 만들려고 이 파일에서만 모듈을 부분적으로 바꾼다.
// 기본은 원래 구현 그대로이고, 시험이 켠 결함만 끼워 넣는다. `vi.hoisted`·`vi.mock`은 vitest가 import보다 앞으로 끌어올린다.
const faults = vi.hoisted(() => ({ attribute: false, step: false }));

vi.mock("../chunked-sqlite-blocks", async (importOriginal) => {
  const original = await importOriginal<typeof import("../chunked-sqlite-blocks")>();
  return {
    ...original,
    parseClipOffscreenAttribute: (...args: Parameters<typeof original.parseClipOffscreenAttribute>) => {
      if (faults.attribute) throw new TypeError("예상 밖 오류(Attribute)");
      return original.parseClipOffscreenAttribute(...args);
    },
    stepClipOffscreenDecode: function* (...args: Parameters<typeof original.stepClipOffscreenDecode>) {
      if (faults.step) throw new TypeError("예상 밖 오류(해독)");
      return yield* original.stepClipOffscreenDecode(...args);
    },
  };
});

const bytes = buildClipDocument({ layers: [{ id: 1, children: [2] }, rasterLayer(2, "a", 4, 4)] }).bytes;

afterEach(() => {
  faults.attribute = false;
  faults.step = false;
});

describe("importChunkedSqliteDocument: 예상 밖 예외", () => {
  it("결함이 없으면 모듈을 바꾼 채로도 정상적으로 읽는다(시험 장치 점검)", async () => {
    const result = await importChunkedSqliteDocument(bytes, { openSqlite: openNodeSqlite });

    expect(result.layers[0]!.pixels).not.toBeNull();
    expect(result.unsupported).toEqual([]);
  });

  it("Attribute를 해석하다 ClipBlockError가 아닌 예외가 나면 레이어 실패로 삼키지 않고 그대로 던진다", async () => {
    faults.attribute = true;

    await expect(importChunkedSqliteDocument(bytes, { openSqlite: openNodeSqlite })).rejects.toThrow(new TypeError("예상 밖 오류(Attribute)"));
  });

  it("픽셀을 푸는 도중 ClipBlockError가 아닌 예외가 나도 삼키지 않고 그대로 던진다", async () => {
    faults.step = true;

    await expect(importChunkedSqliteDocument(bytes, { openSqlite: openNodeSqlite })).rejects.toThrow(new TypeError("예상 밖 오류(해독)"));
  });
});
