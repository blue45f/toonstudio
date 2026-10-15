import { describe, expect, it } from "vitest";

import {
  MANUSCRIPT_STORE_CHUNK_CHARS,
  MANUSCRIPT_STORE_MAX_COPIES,
  createManuscriptStore,
  splitManuscriptChunks,
  type ManuscriptKeyValueStore,
} from "./studio-story-manuscript-store";
import { MANUSCRIPT_MAX_CHARS } from "./studio-story-manuscript-extractor";
import { manuscriptFingerprint } from "./studio-story-manuscript-project";

function memoryKv() {
  const map = new Map<string, string>();
  const kv: ManuscriptKeyValueStore = {
    load: async (key) => map.get(key) ?? null,
    save: async (key, payload) => { map.set(key, payload); },
  };
  return { map, kv };
}

const SAVED = "2026-10-15T09:30:00.000Z";
const text = (seed: string, length: number) => seed.repeat(Math.ceil(length / seed.length)).slice(0, length);

describe("조각 나누기", () => {
  it("조각을 이어 붙이면 원문과 같고 각 조각은 상한 이하다", () => {
    const source = text("하은이 걸었다.\n", MANUSCRIPT_STORE_CHUNK_CHARS * 2 + 1234);
    const chunks = splitManuscriptChunks(source);
    expect(chunks).toHaveLength(3);
    expect(chunks.join("")).toBe(source);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(MANUSCRIPT_STORE_CHUNK_CHARS);
  });

  it("이모지 같은 대리쌍의 한가운데에서는 자르지 않는다", () => {
    const source = `${"가".repeat(9)}😀${"나".repeat(20)}`;
    const chunks = splitManuscriptChunks(source, 10);
    expect(chunks.join("")).toBe(source);
    for (const chunk of chunks) {
      expect(chunk).not.toMatch(/[\ud800-\udbff]$/u);
      expect(chunk).not.toMatch(/^[\udc00-\udfff]/u);
    }
  });

  it("빈 글은 조각이 없다", () => {
    expect(splitManuscriptChunks("")).toEqual([]);
  });
});

describe("저장과 불러오기", () => {
  it("저장한 원고를 그대로 돌려주고, 사본 id는 내용 지문이다", async () => {
    const { kv } = memoryKv();
    const store = createManuscriptStore(kv);
    const source = "1화 시작\n\n장면 1\n하은이 걸었다.";
    const info = await store.save("작품", source, SAVED);
    expect(info).toEqual({ copyId: manuscriptFingerprint(source), length: source.length, chunks: 1, savedAtIso: SAVED });
    const loaded = await store.load("작품", info.copyId);
    expect(loaded).toEqual({ status: "ok", text: source, info });
    expect(await store.list("작품")).toEqual([info]);
    expect(await store.list("다른 작품")).toEqual([]);
  });

  it("40만 글자 원고를 여러 조각으로 나눠 저장하고 한 글자도 틀리지 않게 돌려준다", async () => {
    const { kv, map } = memoryKv();
    const store = createManuscriptStore(kv);
    const source = text("하은이 시장을 걸었다. 😀 비가 내렸다.\n", 400_000);
    const info = await store.save("작품", source, SAVED);
    expect(info.chunks).toBe(3);
    const loaded = await store.load("작품", info.copyId);
    expect(loaded.status).toBe("ok");
    if (loaded.status === "ok") expect(loaded.text === source).toBe(true);
    // 조각 한 개가 보조 저장소 한도(1.1MB)를 넘지 않는다.
    for (const [key, value] of map) {
      if (key.includes(":0") || key.includes(":1") || key.includes(":2")) {
        expect(new TextEncoder().encode(JSON.stringify({ payload: value })).byteLength).toBeLessThan(1_100_000);
      }
    }
  });

  it("같은 원고를 다시 저장해도 사본은 하나다", async () => {
    const { kv } = memoryKv();
    const store = createManuscriptStore(kv);
    await store.save("작품", "같은 글", SAVED);
    const second = await store.save("작품", "같은 글", "2026-10-16T00:00:00.000Z");
    expect(await store.list("작품")).toEqual([second]);
    expect(second.savedAtIso).toBe("2026-10-16T00:00:00.000Z");
  });

  it("사본은 작품당 6개까지이고, 넘치면 가장 오래된 것부터 비운다", async () => {
    const { kv } = memoryKv();
    const store = createManuscriptStore(kv);
    const infos = [];
    for (let i = 0; i < MANUSCRIPT_STORE_MAX_COPIES + 2; i += 1) infos.push(await store.save("작품", `원고 ${i}`, SAVED));
    const list = await store.list("작품");
    expect(list).toHaveLength(MANUSCRIPT_STORE_MAX_COPIES);
    expect(list[0]?.copyId).toBe(infos.at(-1)?.copyId);
    expect(await store.load("작품", infos[0]?.copyId ?? "")).toEqual({ status: "missing" });
    expect((await store.load("작품", infos.at(-1)?.copyId ?? "")).status).toBe("ok");
  });

  it("사본은 작품마다 따로 보관한다", async () => {
    const { kv } = memoryKv();
    const store = createManuscriptStore(kv);
    const a = await store.save("작품 A", "A의 원고", SAVED);
    await store.save("작품 B", "B의 원고", SAVED);
    expect(await store.load("작품 B", a.copyId)).toEqual({ status: "missing" });
  });

  it("여러 저장이 겹쳐도 서로의 색인을 덮어쓰지 않는다", async () => {
    const { kv } = memoryKv();
    const store = createManuscriptStore(kv);
    const infos = await Promise.all(["첫째", "둘째", "셋째"].map((body) => store.save("작품", body, SAVED)));
    const ids = new Set((await store.list("작품")).map((item) => item.copyId));
    for (const info of infos) expect(ids.has(info.copyId)).toBe(true);
  });

  it("지우면 색인에서 빠지고 조각은 비운다", async () => {
    const { kv, map } = memoryKv();
    const store = createManuscriptStore(kv);
    const info = await store.save("작품", "지울 원고", SAVED);
    await store.remove("작품", info.copyId);
    expect(await store.list("작품")).toEqual([]);
    expect(await store.load("작품", info.copyId)).toEqual({ status: "missing" });
    expect([...map.entries()].filter(([key]) => key.endsWith(":0")).every(([, value]) => value === "")).toBe(true);
    await expect(store.remove("작품", "없는 사본")).resolves.toBeUndefined();
  });
});

describe("손상과 한도", () => {
  it("조각이 사라지거나 바뀌면 손상됨으로 알리고 엉뚱한 원문을 돌려주지 않는다", async () => {
    const { kv, map } = memoryKv();
    const store = createManuscriptStore(kv);
    const source = text("한 줄입니다.\n", MANUSCRIPT_STORE_CHUNK_CHARS + 50);
    const info = await store.save("작품", source, SAVED);
    const chunkKeys = [...map.keys()].filter((key) => key.includes(`:${info.copyId}:`));
    expect(chunkKeys).toHaveLength(2);

    const original = map.get(chunkKeys[1] ?? "") ?? "";
    map.set(chunkKeys[1] ?? "", `${original}덧붙임`);
    expect((await store.load("작품", info.copyId)).status).toBe("corrupted");

    map.set(chunkKeys[1] ?? "", `${original.slice(0, -1)}X`);
    expect((await store.load("작품", info.copyId)).status).toBe("corrupted");

    map.delete(chunkKeys[1] ?? "");
    expect((await store.load("작품", info.copyId)).status).toBe("corrupted");

    map.set(chunkKeys[1] ?? "", original);
    expect((await store.load("작품", info.copyId)).status).toBe("ok");
  });

  it("색인이 깨졌으면 사본이 없는 것으로 본다", async () => {
    const { kv, map } = memoryKv();
    const store = createManuscriptStore(kv);
    const info = await store.save("작품", "원고", SAVED);
    const indexKey = [...map.keys()].find((key) => !key.includes(`:${info.copyId}:`)) ?? "";
    map.set(indexKey, "{깨짐");
    expect(await store.list("작품")).toEqual([]);
    map.set(indexKey, JSON.stringify({ version: 2, copies: [info] }));
    expect(await store.list("작품")).toEqual([]);
    map.set(indexKey, JSON.stringify({ version: 1, copies: [{ copyId: "", length: 1, chunks: 1, savedAtIso: SAVED }, { ...info, length: -3 }] }));
    expect(await store.list("작품")).toEqual([]);
  });

  it("빈 원고와 한도를 넘는 원고는 거절한다", async () => {
    const store = createManuscriptStore(memoryKv().kv);
    await expect(store.save("작품", "", SAVED)).rejects.toThrow(/비어/u);
    await expect(store.save("작품", "가".repeat(MANUSCRIPT_MAX_CHARS + 1), SAVED)).rejects.toThrow(/너무 길어요/u);
  });

  it("저장소가 쓰기에 실패하면 오류를 올리고 색인은 바꾸지 않는다", async () => {
    const { kv, map } = memoryKv();
    const store = createManuscriptStore(kv);
    const first = await store.save("작품", "첫 원고", SAVED);
    const failing = createManuscriptStore({ load: kv.load, save: async () => { throw new Error("저장소가 가득 찼어요"); } });
    await expect(failing.save("작품", "둘째 원고", SAVED)).rejects.toThrow("가득");
    expect(await store.list("작품")).toEqual([first]);
    expect(map.size).toBeGreaterThan(0);
  });
});
