import { describe, expect, it } from "vitest";

import {
  STUDIO_LORE_STARTER_PACK_IDS,
  STUDIO_LORE_STARTER_PACKS,
  appliedLoreStarterPackIds,
  applyLoreStarterPack,
  createLoreStarterPackEntries,
  getLoreStarterPack,
  isLoreStarterPackApplied,
  loreStarterPackKindCounts,
  removeLoreStarterPack,
} from "./studio-world-lore-starter-packs";
import {
  emptyWorldLore,
  removeLoreExamples,
  upsertLoreEntry,
  validateWorldLore,
  withLoreEntryDefaults,
  type StudioLoreEntry,
} from "./studio-world-lore";
import {
  readStudioWorldLore,
  saveStudioWorldLoreEntries,
} from "./studio-world-lore-store";

function authoredEntry(id: string, name: string): StudioLoreEntry {
  return withLoreEntryDefaults({
    id,
    kind: "place",
    name,
    aliases: [],
    summary: "",
    details: "",
    eraLabel: "",
    timelineOrder: null,
    relatedEntryIds: [],
    characterIds: [],
    origin: "authored",
  });
}

describe("genre worldbuilding starter packs — catalog", () => {
  it("offers at least three genre packs with bilingual genre labels", () => {
    expect(STUDIO_LORE_STARTER_PACKS.length).toBeGreaterThanOrEqual(3);
    expect(STUDIO_LORE_STARTER_PACK_IDS).toEqual(["murim", "fantasy", "sf", "academy"]);
    for (const pack of STUDIO_LORE_STARTER_PACKS) {
      expect(pack.genre.ko.length).toBeGreaterThan(0);
      expect(pack.genre.en.length).toBeGreaterThan(0);
      expect(pack.entryCount).toBe(createLoreStarterPackEntries(pack.id).length);
      expect(getLoreStarterPack(pack.id)).toBe(pack);
    }
    expect(getLoreStarterPack("romance")).toBeNull();
  });

  it("every pack is a linked mini-world covering event, place, faction and rule", () => {
    for (const packId of STUDIO_LORE_STARTER_PACK_IDS) {
      const counts = loreStarterPackKindCounts(packId);
      expect(counts.event ?? 0).toBeGreaterThanOrEqual(2);
      expect(counts.place ?? 0).toBeGreaterThanOrEqual(1);
      expect(counts.faction ?? 0).toBeGreaterThanOrEqual(1);
      expect(counts.rule ?? 0).toBeGreaterThanOrEqual(1);
      const entries = createLoreStarterPackEntries(packId);
      expect(entries.length).toBeGreaterThanOrEqual(7);
      expect(entries.every((entry) => entry.origin === "example")).toBe(true);
      expect(entries.every((entry) => entry.id.startsWith(`pack-${packId}-`))).toBe(true);
      // 팩 내부 연결이 전부 팩 안에서 닫힌다(dangling 없음).
      const ids = new Set(entries.map((entry) => entry.id));
      for (const entry of entries) {
        for (const linked of entry.relatedEntryIds) expect(ids.has(linked)).toBe(true);
      }
      // 상태 3분류 시연: 추측 1 + 의도적 빈칸 1.
      expect(entries.filter((e) => e.status === "speculative")).toHaveLength(1);
      expect(entries.filter((e) => e.status === "intentional-gap")).toHaveLength(1);
    }
  });

  it("validates clean and pack names never collide across packs", () => {
    const seen = new Set<string>();
    for (const packId of STUDIO_LORE_STARTER_PACK_IDS) {
      const lore = applyLoreStarterPack(emptyWorldLore("project-1"), packId);
      const errors = validateWorldLore(null, lore).filter((i) => i.severity === "error");
      expect(errors).toEqual([]);
      for (const entry of lore.entries) {
        expect(seen.has(entry.name)).toBe(false);
        seen.add(entry.name);
      }
    }
  });
});

describe("genre worldbuilding starter packs — apply and clean up", () => {
  it("applies a selected pack idempotently and preserves authored entries", () => {
    let lore = upsertLoreEntry(emptyWorldLore("project-1"), authoredEntry("mine", "내 장소"));
    lore = applyLoreStarterPack(lore, "murim");
    const once = lore.entries.length;
    lore = applyLoreStarterPack(lore, "murim");
    expect(lore.entries.length).toBe(once);
    expect(lore.entries.find((e) => e.id === "mine")?.origin).toBe("authored");
    expect(isLoreStarterPackApplied(lore, "murim")).toBe(true);
    expect(appliedLoreStarterPackIds(lore)).toEqual(["murim"]);
  });

  it("applies only the chosen entries when entryIds are given", () => {
    const entries = createLoreStarterPackEntries("sf");
    const picked = entries.slice(0, 2).map((entry) => entry.id);
    const lore = applyLoreStarterPack(emptyWorldLore("project-1"), "sf", {
      entryIds: [...picked, "pack-sf-not-real"],
    });
    expect(lore.entries.map((e) => e.id)).toEqual(picked);
    expect(isLoreStarterPackApplied(lore, "sf")).toBe(false);
  });

  it("returns the lore unchanged for an unknown pack id", () => {
    const lore = emptyWorldLore("project-1");
    expect(applyLoreStarterPack(lore, "romance")).toBe(lore);
    expect(removeLoreStarterPack(lore, "romance")).toBe(lore);
    expect(createLoreStarterPackEntries("romance")).toEqual([]);
  });

  it("stacks multiple packs and removes one pack without touching the others", () => {
    let lore = upsertLoreEntry(emptyWorldLore("project-1"), authoredEntry("mine", "내 장소"));
    lore = applyLoreStarterPack(lore, "fantasy");
    lore = applyLoreStarterPack(lore, "academy");
    expect(appliedLoreStarterPackIds(lore)).toEqual(["fantasy", "academy"]);
    lore = removeLoreStarterPack(lore, "fantasy");
    expect(appliedLoreStarterPackIds(lore)).toEqual(["academy"]);
    expect(lore.entries.some((e) => e.id === "mine")).toBe(true);
    // 팩을 걷어낸 항목을 가리키던 연결도 함께 정리된다.
    for (const entry of lore.entries) {
      for (const linked of entry.relatedEntryIds) {
        expect(lore.entries.some((e) => e.id === linked)).toBe(true);
      }
    }
  });

  it("keeps the existing bulk example cleanup: removeLoreExamples clears every pack", () => {
    let lore = upsertLoreEntry(emptyWorldLore("project-1"), authoredEntry("mine", "내 장소"));
    for (const packId of STUDIO_LORE_STARTER_PACK_IDS) {
      lore = applyLoreStarterPack(lore, packId);
    }
    const cleaned = removeLoreExamples(lore);
    expect(cleaned.entries.map((e) => e.id)).toEqual(["mine"]);
  });

  it("round-trips pack entries through the existing lore store parser", () => {
    const map = new Map<string, string>();
    const storage = {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
    };
    const lore = applyLoreStarterPack(emptyWorldLore("project-1"), "academy");
    saveStudioWorldLoreEntries(storage, "project-1", lore.entries);
    const read = readStudioWorldLore(storage, "project-1");
    expect(read?.entries).toHaveLength(lore.entries.length);
    expect(read?.entries.every((e) => e.origin === "example")).toBe(true);
  });
});
