import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { loadStudioRigWork, loadStudioRigWeightUndo, saveStudioRigWork } from "./studio-asset3d-rig-storage";

const memory = vi.hoisted(() => ({
  pointers: new Map<string, string>(),
  blobs: new Map<string, Uint8Array>(),
  fail: false,
}));
vi.mock("../studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: async () => ({
    kvGet: async (_: string, key: string) => memory.pointers.get(key) ?? null,
    kvSet: async (_: string, key: string, value: string) => {
      if (memory.fail) throw new Error("용량 부족");
      memory.pointers.set(key, value);
    },
  }),
}));
vi.mock("../studio-opfs-filesystem", () => ({ createStudioOpfsNativeFileSystem: () => ({}) }));
vi.mock("../studio-opfs-asset-store", () => ({
  createStudioOpfsAssetStore: () => ({
    put: async (bytes: Uint8Array) => {
      const hash = "sha256:" + createHash("sha256").update(bytes).digest("hex");
      memory.blobs.set(hash, bytes);
      return { ref: { hash } };
    },
    get: async (hash: string) => memory.blobs.get(hash) ?? null,
    setOwnerRefs: vi.fn(),
    sweep: vi.fn(),
  }),
}));
afterEach(() => {
  memory.pointers.clear();
  memory.blobs.clear();
  memory.fail = false;
  vi.unstubAllGlobals();
});
it("늦은 탭·저장 실패 시 기존 GLB를 보존하고 기기 사용자마다 다른 작업을 읽는다", async () => {
  vi.stubGlobal("navigator", {
    storage: { getDirectory: vi.fn() },
    locks: { request: (_name: string, ...args: unknown[]) => (args.at(-1) as () => unknown)() },
  });
  const a = new Uint8Array([1, 2]),
    b = new Uint8Array([3, 4]);
  const first = await saveStudioRigWork("actor:a", null, "첫 작업.glb", a);
  await expect(saveStudioRigWork("actor:a", null, "오래된 작업.glb", b)).rejects.toThrow("다른 창");
  memory.fail = true;
  await expect(saveStudioRigWork("actor:a", first, "수정본.glb", b)).rejects.toThrow("용량");
  expect(await loadStudioRigWork("actor:a")).toEqual({ saved: first, bytes: a });
  expect(await loadStudioRigWork("actor:b")).toBeNull();
  memory.fail = false;
  const next = await saveStudioRigWork("actor:a", first, "수정본.glb", b);
  expect(await loadStudioRigWork("actor:a")).toEqual({ saved: next, bytes: b });
  memory.blobs.delete(next.hash);
  await expect(loadStudioRigWork("actor:a")).rejects.toThrow("찾지 못했어요");
});

it("직전 웨이트 사본은 같은 사용자의 현재 작업에만 열리고 다음 저장이 실패해도 유지된다", async () => {
  vi.stubGlobal("navigator", {
    storage: { getDirectory: vi.fn() },
    locks: { request: (_name: string, ...args: unknown[]) => (args.at(-1) as () => unknown)() },
  });
  const a = new Uint8Array([1]),
    b = new Uint8Array([2]),
    c = new Uint8Array([3]);
  const weighted = await saveStudioRigWork("A", null, "손.glb", b, a);
  expect((await loadStudioRigWork("A"))?.saved).toEqual(weighted);
  expect(await loadStudioRigWeightUndo("A", weighted)).toEqual(a);
  await expect(loadStudioRigWeightUndo("B", weighted)).rejects.toThrow("다른 창");
  memory.fail = true;
  await expect(saveStudioRigWork("A", weighted, "손.glb", c, b)).rejects.toThrow("용량");
  expect(await loadStudioRigWeightUndo("A", weighted)).toEqual(a);
  memory.fail = false;
  const next = await saveStudioRigWork("A", weighted, "손.glb", c, b);
  await expect(loadStudioRigWeightUndo("A", weighted)).rejects.toThrow("다른 창");
  expect(await loadStudioRigWeightUndo("A", next)).toEqual(b);
  const restored = await saveStudioRigWork("A", next, "손.glb", b);
  expect(restored.weightUndo).toBeUndefined();
  await expect(loadStudioRigWeightUndo("A", restored)).rejects.toThrow("되돌릴");
});
