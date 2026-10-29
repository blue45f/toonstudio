import { describe, expect, it, vi } from "vitest";

import { createStudioVrmExportProfileStore } from "./studio-vrm-export-profile-store";
import {
  createStudioVrmGenerateExportMetaDraft,
  studioVrmExportProfileFromDraft,
} from "./studio-vrm-generate-export-meta";

import type { StudioAsyncKeyValueStore } from "../studio-local-database";

function memoryStore(initial: Record<string, string> = {}): StudioAsyncKeyValueStore & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value) {
      values.set(key, value);
    },
    async delete(key) {
      values.delete(key);
    },
  };
}

const PROFILE = studioVrmExportProfileFromDraft({
  ...createStudioVrmGenerateExportMetaDraft({ avatarName: "시노" }),
  authors: "하늘",
  contactInformation: "sky@example.com",
});

describe("createStudioVrmExportProfileStore", () => {
  it("round-trips a sanitized profile through the key-value store", async () => {
    const backing = memoryStore();
    const store = createStudioVrmExportProfileStore({ acquireStore: async () => backing });
    await expect(store.load()).resolves.toBeNull();
    await expect(store.save(PROFILE)).resolves.toBe(true);
    await expect(store.load()).resolves.toEqual(PROFILE);
    await expect(store.clear()).resolves.toBe(true);
    expect(backing.values.size).toBe(0);
  });

  it("treats corrupted or oversized stored values as no profile", async () => {
    const corrupted = createStudioVrmExportProfileStore({ acquireStore: async () => memoryStore({ profile: "{nope" }) });
    await expect(corrupted.load()).resolves.toBeNull();
    const oversized = createStudioVrmExportProfileStore({
      acquireStore: async () => memoryStore({ profile: JSON.stringify({ authors: "x".repeat(70_000) }) }),
    });
    await expect(oversized.load()).resolves.toBeNull();
  });

  it("reports memory-only operation when the database cannot open and retries the next time", async () => {
    const acquireStore = vi.fn<() => Promise<StudioAsyncKeyValueStore>>()
      .mockRejectedValueOnce(new Error("OPFS unavailable"))
      .mockResolvedValue(memoryStore());
    const store = createStudioVrmExportProfileStore({ acquireStore });
    await expect(store.save(PROFILE)).resolves.toBe(false);
    await expect(store.save(PROFILE)).resolves.toBe(true);
    expect(acquireStore).toHaveBeenCalledTimes(2);
  });
});
