import { describe, expect, it, vi } from "vitest";

import * as filesystem from "../../studio-opfs-filesystem";
import { createStudioOpfsMemoryFileSystem } from "../../studio-opfs-filesystem";
import { decodeLegacyOriginal, legacyOriginalShelf, openLegacyOriginalShelf } from "./legacy-character-originals";
import { openLegacyPaintImage, readLegacyPaintImages } from "./legacy-character-paint";

const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEElEQVR4AQEFAPr/AMwaZ4AE0QHOOepvawAAAABJRU5ErkJggg==";
const pixels = Uint8Array.from(atob(pngBase64), (char) => char.charCodeAt(0));
const master = { part: "hair", width: 1, height: 1, pngBase64 };
const slots = Array.from({ length: 6 }, (_, index) => ({
  index, visible: index !== 4, opacity: index === 4 ? 0.25 : 1,
  ...(index === 4 || index === 1 ? { pngBase64 } : {}),
}));
const paint = { layers: [master], sublayers: [{ part: "hair", width: 1, height: 1, order: [5, 4, 3, 2, 1, 0], slots }] };

describe("Studio original recipe recovery", () => {
  it("reopens every UTF-8 source byte, including its BOM, unknown fields and paint, after restart", async () => {
    const fs = createStudioOpfsMemoryFileSystem();
    const raw = "\uFEFF" + JSON.stringify({ pose: { jaw: 0.7 }, physics: { wind: 4 }, paint, extra: "원문" }, null, 2) + "\r\n";
    await legacyOriginalShelf(fs).save(raw, "눈썹과 머리.json");
    await legacyOriginalShelf(fs).save(raw, "눈썹과 머리.json");
    fs.restart();
    const reopened = legacyOriginalShelf(fs);
    const entries = await reopened.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe("눈썹과 머리.json");
    const stored = await reopened.read(entries[0]!.path);
    expect(stored).toBe(raw);
    expect(decodeLegacyOriginal(new TextEncoder().encode(stored))).toBe(raw);
    const images = readLegacyPaintImages(JSON.parse(stored.slice(1)).paint);
    expect(images.map(({ slot, visible, opacity }) => [slot, visible, opacity])).toEqual([
      [null, true, 1], [4, false, 0.25], [1, true, 1],
    ]);
    for (const image of images) {
      const blob = await openLegacyPaintImage(image);
      expect(blob.type).toBe("image/png");
      expect(new Uint8Array(await blob.arrayBuffer())).toEqual(pixels);
    }
  });

  it("keeps same-name revisions separate and rejects changed bytes or unrelated file paths", async () => {
    const fs = createStudioOpfsMemoryFileSystem();
    const shelf = legacyOriginalShelf(fs);
    await shelf.save('{"v":1}', "이름.json");
    await shelf.save('{"v":2}', "이름.json");
    const entries = await shelf.list();
    expect(entries).toHaveLength(2);
    expect((await Promise.all(entries.map((entry) => shelf.read(entry.path)))).sort()).toEqual(['{"v":1}', '{"v":2}']);
    await fs.write(entries[0]!.path, new TextEncoder().encode('{"v":0}'));
    await expect(shelf.read(entries[0]!.path)).rejects.toThrow("invalid-original-content");
    await expect(shelf.read("../another-user.json")).rejects.toThrow("invalid-original-path");
  });

  it("isolates retained sources by account and never labels a memory fallback as saved", async () => {
    const roots = new Map<string, ReturnType<typeof createStudioOpfsMemoryFileSystem>>();
    const select = vi.spyOn(filesystem, "selectStudioOpfsFileSystem");
    try {
      select.mockImplementation(async (_, options) => {
        const key = options?.rootName ?? "";
        const fs = roots.get(key) ?? createStudioOpfsMemoryFileSystem();
        roots.set(key, fs);
        return { fs, kind: "opfs", durability: "durable", reason: "test", cause: null };
      });
      await (await openLegacyOriginalShelf('["user","alpha"]')).save("{}", "old.json");
      expect(await (await openLegacyOriginalShelf('["guest"]')).list()).toEqual([]);
      expect(await (await openLegacyOriginalShelf('["user","beta"]')).list()).toEqual([]);
      expect(await (await openLegacyOriginalShelf('["user","alpha"]')).list()).toHaveLength(1);
      select.mockResolvedValue({ fs: createStudioOpfsMemoryFileSystem(), kind: "memory", durability: "memory-only", reason: "test", cause: null });
      await expect(openLegacyOriginalShelf('["guest"]')).rejects.toThrow("durable-storage-unavailable");
    } finally {
      select.mockRestore();
    }
  });

  it("rejects malformed paint, mislabeled images, wrong sizes and excessive dimensions", async () => {
    expect(() => readLegacyPaintImages({ ...paint, layers: [master, master] })).toThrow();
    expect(() => readLegacyPaintImages({ layers: [], sublayers: Array(128).fill({}) })).toThrow();
    const [image] = readLegacyPaintImages(paint);
    await expect(openLegacyPaintImage({ ...image!, pngBase64: btoa("<svg/>") })).rejects.toThrow();
    await expect(openLegacyPaintImage({ ...image!, width: 2 })).rejects.toThrow();
    await expect(openLegacyPaintImage({ ...image!, width: 65_536 })).rejects.toThrow("paint-too-large");
    const abort = new AbortController();
    abort.abort();
    await expect(openLegacyPaintImage(image!, abort.signal)).rejects.toThrow();
  });
});
