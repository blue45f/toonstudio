import { describe, expect, it } from "vitest";

import {
  addCompareSendInboxEntry,
  compareSendInboxKey,
  compareSendInboxToPoolItems,
  consumeCompareSendInbox,
  parseCompareSendInbox,
  writeCompareSendInbox,
  type CompareSendInboxEntry,
  type CompareSendStorage,
} from "./compare-send-inbox";

const entry = (pageId: string, sentAt = "2026-10-14T00:00:00.000Z"): CompareSendInboxEntry => ({
  id: `send-${pageId}`,
  pageId,
  pageLabel: `에디터 · ${pageId}`,
  imageUrl: "data:image/png;base64,AAAA",
  sentAt,
});

function memoryStorage(): CompareSendStorage & { dump(): ReadonlyMap<string, string> } {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
    removeItem: (key) => { map.delete(key); },
    dump: () => map,
  };
}

describe("compare send inbox (잔여 배선 ④)", () => {
  it("같은 페이지를 다시 보내면 교체되고, 풀 항목은 reference 소스가 된다", () => {
    const first = addCompareSendInboxEntry([], entry("page-1"));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = addCompareSendInboxEntry(first.entries, entry("page-1", "2026-10-14T01:00:00.000Z"));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.entries).toHaveLength(1);
    const items = compareSendInboxToPoolItems(second.entries, "work-1");
    expect(items[0].source).toEqual({ kind: "reference", boardId: "editor-send:work-1", itemId: "send-page-1" });
    expect(items[0].imageUrl).toBe("data:image/png;base64,AAAA");
  });

  it("이미지가 아닌 값과 깨진 저장값은 거부·탈락한다", () => {
    expect(addCompareSendInboxEntry([], { ...entry("p"), imageUrl: "https://x/y.png" }).ok).toBe(false);
    expect(parseCompareSendInbox("not-json")).toEqual([]);
    expect(parseCompareSendInbox(JSON.stringify([{ id: 1 }]))).toEqual([]);
  });

  it("쓰고 소비하면 비워져 두 번 들어가지 않는다", () => {
    const storage = memoryStorage();
    const written = writeCompareSendInbox(storage, "work-1", entry("page-9"));
    expect(written.ok).toBe(true);
    expect(storage.dump().has(compareSendInboxKey("work-1"))).toBe(true);
    expect(consumeCompareSendInbox(storage, "work-1")).toHaveLength(1);
    expect(consumeCompareSendInbox(storage, "work-1")).toHaveLength(0);
  });
});
