import { describe, expect, it } from "vitest";

import { filterAndSortAssets } from "./studio-asset-catalog-enhancements";
import {
  createMaterialUsageLedger,
  forgetMaterial,
  frequentMaterials,
  loadMaterialUsageLedger,
  materialUsageStats,
  materialUsageStorageKey,
  parseMaterialUsageLedger,
  recentMaterialIds,
  recentMaterials,
  recordMaterialUse,
  recordMaterialUseInStorage,
  sanitizeMaterialUsageLedger,
  saveMaterialUsageLedger,
  serializeMaterialUsageLedger,
  sortMaterialsByFrequency,
  sortMaterialsByRecent,
  usageRecordsFromMaterialUsage,
  type MaterialUsageStorage,
} from "./studio-material-usage";

function memoryStorage(): MaterialUsageStorage & { dump: Map<string, string> } {
  const dump = new Map<string, string>();
  return {
    dump,
    getItem: (key: string) => dump.get(key) ?? null,
    setItem: (key: string, value: string) => {
      dump.set(key, value);
    },
  };
}

describe("studio-material-usage", () => {
  describe("record + MRU (판정: 쓰면 최근 사용에 즉시 뜬다)", () => {
    it("records a use and surfaces it first in recents immediately", () => {
      let ledger = createMaterialUsageLedger();
      ledger = recordMaterialUse(ledger, "brush:gpen", "brush", 1_000);
      ledger = recordMaterialUse(ledger, "tone:dot", "tone", 2_000);
      ledger = recordMaterialUse(ledger, "brush:gpen", "brush", 3_000);

      expect(recentMaterials(ledger).map((entry) => entry.materialId)).toEqual([
        "brush:gpen",
        "tone:dot",
      ]);
      expect(recentMaterials(ledger)[0]).toEqual({
        materialId: "brush:gpen",
        kind: "brush",
        lastUsedAt: 3_000,
      });
    });

    it("does not inflate frequency for consecutive duplicate uses", () => {
      let ledger = createMaterialUsageLedger();
      ledger = recordMaterialUse(ledger, "brush:gpen", "brush", 1_000);
      ledger = recordMaterialUse(ledger, "brush:gpen", "brush", 1_500);
      ledger = recordMaterialUse(ledger, "brush:gpen", "brush", 2_000);
      expect(ledger.events).toHaveLength(1);
      expect(materialUsageStats(ledger).get("brush:gpen")).toEqual({
        useCount: 1,
        lastUsedAt: 2_000,
      });
      // Non-consecutive reuse still counts.
      ledger = recordMaterialUse(ledger, "tone:dot", "tone", 2_500);
      ledger = recordMaterialUse(ledger, "brush:gpen", "brush", 3_000);
      expect(materialUsageStats(ledger).get("brush:gpen")?.useCount).toBe(2);
    });

    it("filters recents by kind and drops ids that no longer exist", () => {
      let ledger = createMaterialUsageLedger();
      ledger = recordMaterialUse(ledger, "brush:gpen", "brush", 1_000);
      ledger = recordMaterialUse(ledger, "3d:desk", "3d", 2_000);
      expect(recentMaterials(ledger, 40, "brush").map((entry) => entry.materialId)).toEqual([
        "brush:gpen",
      ]);
      expect(recentMaterialIds(ledger, new Set(["3d:desk"]))).toEqual(["3d:desk"]);
    });

    it("rejects invalid input without changing the ledger reference", () => {
      const ledger = createMaterialUsageLedger();
      expect(recordMaterialUse(ledger, "  ", "brush", 1_000)).toBe(ledger);
      expect(recordMaterialUse(ledger, "brush:gpen", "brush", Number.NaN)).toBe(ledger);
    });
  });

  describe("frequency (판정: 동일 입력에서 항상 같은 순서)", () => {
    function buildLedger() {
      // alpha: 3 uses, last 900 / beta: 3 uses, last 500 / gamma: 3 uses, last 500 (id tie)
      let ledger = createMaterialUsageLedger();
      const interleaved: Array<[string, number]> = [
        ["mat:beta", 100],
        ["mat:alpha", 200],
        ["mat:gamma", 300],
        ["mat:beta", 400],
        ["mat:gamma", 450],
        ["mat:alpha", 500],
        ["mat:beta", 500],
        ["mat:gamma", 500],
        ["mat:alpha", 900],
      ];
      for (const [id, at] of interleaved) {
        ledger = recordMaterialUse(ledger, id, "image", at);
      }
      return ledger;
    }

    it("orders by count desc, then lastUsedAt desc, then id asc", () => {
      const ledger = buildLedger();
      // alpha 3회·900, beta 3회·500, gamma 3회·500 → alpha, beta, gamma(id)
      expect(frequentMaterials(ledger, 10).map((entry) => entry.materialId)).toEqual([
        "mat:alpha",
        "mat:beta",
        "mat:gamma",
      ]);
    });

    it("is deterministic across repeated calls and reversed input order", () => {
      const ledger = buildLedger();
      const items = [{ id: "mat:gamma" }, { id: "mat:beta" }, { id: "mat:alpha" }];
      const first = sortMaterialsByFrequency(items, ledger, (item) => item.id).map((i) => i.id);
      const second = sortMaterialsByFrequency(
        [...items].reverse(),
        ledger,
        (item) => item.id,
      ).map((i) => i.id);
      expect(first).toEqual(["mat:alpha", "mat:beta", "mat:gamma"]);
      expect(second).toEqual(first);
      expect(frequentMaterials(ledger, 10)).toEqual(frequentMaterials(ledger, 10));
    });

    it("sorts by recent with frequency as the tie-break", () => {
      const ledger = buildLedger();
      const items = [{ id: "mat:gamma" }, { id: "mat:beta" }, { id: "mat:alpha" }];
      expect(sortMaterialsByRecent(items, ledger, (item) => item.id).map((i) => i.id)).toEqual([
        "mat:alpha",
        "mat:beta",
        "mat:gamma",
      ]);
    });

    it("honours sinceMs windows", () => {
      const ledger = buildLedger();
      const recentOnly = frequentMaterials(ledger, 10, { sinceMs: 600 });
      expect(recentOnly).toEqual([
        { materialId: "mat:alpha", kind: "image", useCount: 1, lastUsedAt: 900 },
      ]);
    });
  });

  describe("persistence (개인 에셋 패턴)", () => {
    it("round-trips through storage and survives re-read", () => {
      const storage = memoryStorage();
      recordMaterialUseInStorage(storage, "user-1", "brush:gpen", "brush", 1_000);
      const ledger = recordMaterialUseInStorage(storage, "user-1", "tone:dot", "tone", 2_000);
      expect(recentMaterials(ledger)[0]?.materialId).toBe("tone:dot");

      const reloaded = loadMaterialUsageLedger(storage, "user-1");
      expect(serializeMaterialUsageLedger(reloaded)).toBe(serializeMaterialUsageLedger(ledger));
      // Another owner sees an empty ledger.
      expect(loadMaterialUsageLedger(storage, "user-2").events).toHaveLength(0);
      expect(materialUsageStorageKey("user-1")).not.toBe(materialUsageStorageKey("user-2"));
      expect(materialUsageStorageKey(null)).toContain("guest");
    });

    it("sanitizes corrupt payloads entry-by-entry instead of trusting them", () => {
      const parsed = parseMaterialUsageLedger(
        JSON.stringify({
          version: 1,
          events: [
            { materialId: "brush:gpen", kind: "brush", usedAt: 100 },
            { materialId: "", kind: "brush", usedAt: 200 },
            { materialId: "tone:dot", kind: "nope", usedAt: 300 },
            { materialId: "tone:dot", kind: "tone", usedAt: "later" },
            { materialId: "tone:dot", kind: "tone", usedAt: 400 },
          ],
        }),
      );
      expect(parsed.events).toEqual([
        { materialId: "brush:gpen", kind: "brush", usedAt: 100 },
        { materialId: "tone:dot", kind: "tone", usedAt: 400 },
      ]);
      expect(parseMaterialUsageLedger("{broken").events).toHaveLength(0);
      expect(sanitizeMaterialUsageLedger(null).events).toHaveLength(0);
    });

    it("save failures never throw (quota/private storage)", () => {
      const failing: MaterialUsageStorage = {
        getItem: () => null,
        setItem: () => {
          throw new Error("quota");
        },
      };
      const ledger = recordMaterialUse(createMaterialUsageLedger(), "brush:gpen", "brush", 1);
      expect(() => saveMaterialUsageLedger(failing, null, ledger)).not.toThrow();
    });
  });

  describe("forget + catalog adapter", () => {
    it("removes a deleted material from the ledger", () => {
      let ledger = createMaterialUsageLedger();
      ledger = recordMaterialUse(ledger, "brush:gpen", "brush", 1_000);
      ledger = recordMaterialUse(ledger, "tone:dot", "tone", 2_000);
      const forgotten = forgetMaterial(ledger, "brush:gpen");
      expect(recentMaterials(forgotten).map((entry) => entry.materialId)).toEqual(["tone:dot"]);
      expect(forgetMaterial(ledger, "missing:id")).toBe(ledger);
    });

    it("feeds the catalog sort module: recent folder + frequency order", () => {
      let ledger = createMaterialUsageLedger();
      ledger = recordMaterialUse(ledger, "brush:gpen", "brush", 1_000);
      ledger = recordMaterialUse(ledger, "brush:water", "brush", 2_000);
      ledger = recordMaterialUse(ledger, "brush:gpen", "brush", 3_000);

      const assets = [
        {
          id: "brush:water",
          name: "수채",
          category: "brush",
          tags: [],
          storageLocation: "로컬",
          createdAt: 10,
        },
        {
          id: "brush:gpen",
          name: "G펜",
          category: "brush",
          tags: [],
          storageLocation: "로컬",
          createdAt: 20,
        },
        {
          id: "brush:unused",
          name: "미사용",
          category: "brush",
          tags: [],
          storageLocation: "로컬",
          createdAt: 30,
        },
      ];
      const state = {
        usageRecords: usageRecordsFromMaterialUsage(ledger),
        pinnedAssetIds: [],
      };
      const folder = filterAndSortAssets(assets, state, { recentOnly: true }, "recent");
      expect(folder.map((asset) => asset.id)).toEqual(["brush:gpen", "brush:water"]);
      const byFrequency = filterAndSortAssets(assets, state, {}, "frequency");
      expect(byFrequency.map((asset) => asset.id)).toEqual([
        "brush:gpen",
        "brush:water",
        "brush:unused",
      ]);
    });
  });
});
