import { IDBDatabase, IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";

import { readLegacyCharacterDraft } from "./legacy-character-draft";

function seedLegacyDrafts(factory: IDBFactory): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.open("toonstudio-character-lab-work", 1);
    request.onupgradeneeded = () => {
      const recipes = request.result.createObjectStore("recipes");
      recipes.put("older draft", 1);
      recipes.put("latest draft", 2);
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });
}

describe("readLegacyCharacterDraft", () => {
  it("does not create a missing legacy database", async () => {
    const factory = new IDBFactory();

    await expect(readLegacyCharacterDraft(factory)).resolves.toBeNull();
    await expect(factory.databases()).resolves.toEqual([]);
  });

  it("reads the latest existing draft using only a readonly transaction", async () => {
    const factory = new IDBFactory();
    await seedLegacyDrafts(factory);
    const transaction = vi.spyOn(IDBDatabase.prototype, "transaction");

    try {
      await expect(readLegacyCharacterDraft(factory)).resolves.toBe("latest draft");
      expect(transaction.mock.calls).toEqual([["recipes", "readonly"]]);
    } finally {
      transaction.mockRestore();
    }
  });
});
