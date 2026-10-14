import { describe, expect, it } from "vitest";

import type { StudioStoryBible } from "../studio-story-bible";
import {
  activeLoreEntries,
  createWorldLoreExamples,
  emptyWorldLore,
  formatLoreEntryStatusLine,
  loreEntriesByKind,
  loreEntriesByStatus,
  loreEntryAppliesTo,
  loreEntryScopesOverlap,
  loreKindCounts,
  loreRelatedEntries,
  loreStatusCounts,
  loreTimeline,
  nextLoreEntryId,
  removeLoreEntry,
  removeLoreExamples,
  retiredLoreEntries,
  reviseLoreEntryVersion,
  searchLoreEntries,
  transitionLoreEntryStatus,
  upsertLoreEntry,
  validateWorldLore,
  withLoreEntryDefaults,
  type StudioLoreEntry,
} from "./studio-world-lore";
import {
  ensureStudioWorldLore,
  parseStudioWorldLore,
  readStudioWorldLore,
  saveStudioWorldLoreEntries,
  studioWorldLoreStorageKey,
} from "./studio-world-lore-store";

function entry(partial: Partial<StudioLoreEntry> & { id: string }): StudioLoreEntry {
  return {
    kind: "place",
    name: partial.id,
    aliases: [],
    summary: "",
    details: "",
    eraLabel: "",
    timelineOrder: null,
    relatedEntryIds: [],
    characterIds: [],
    origin: "authored",
    status: "confirmed",
    version: 1,
    appliesToWorkIds: [],
    appliesToSeasonLabels: [],
    ...partial,
  };
}

const BIBLE: StudioStoryBible = {
  projectId: "project-1",
  characters: [
    { id: "char-1", name: "모아", aliases: ["물지킴이"], defaultCostumeId: null, defaultAppearanceId: null },
  ],
  locations: [{ id: "loc-1", name: "항구" }],
  facts: [],
};

describe("studio-world-lore model", () => {
  it("upserts by id and cleans alias duplicates and self-links", () => {
    let lore = emptyWorldLore("project-1");
    lore = upsertLoreEntry(lore, entry({ id: "lore-place-1", name: "서고", aliases: ["서고", " 옛 서고 "] }));
    lore = upsertLoreEntry(lore, entry({ id: "lore-place-1", name: "옛 서고", relatedEntryIds: ["lore-place-1"] }));
    expect(lore.entries).toHaveLength(1);
    expect(lore.entries[0]?.name).toBe("옛 서고");
    expect(lore.entries[0]?.relatedEntryIds).toEqual([]);
  });

  it("generates sequential ids per kind", () => {
    let lore = emptyWorldLore("project-1");
    expect(nextLoreEntryId(lore, "place")).toBe("lore-place-1");
    lore = upsertLoreEntry(lore, entry({ id: "lore-place-1" }));
    lore = upsertLoreEntry(lore, entry({ id: "lore-place-3" }));
    expect(nextLoreEntryId(lore, "place")).toBe("lore-place-4");
    expect(nextLoreEntryId(lore, "rule")).toBe("lore-rule-1");
  });

  it("removing an entry scrubs inbound links", () => {
    let lore = emptyWorldLore("project-1");
    lore = upsertLoreEntry(lore, entry({ id: "a", relatedEntryIds: ["b"] }));
    lore = upsertLoreEntry(lore, entry({ id: "b" }));
    lore = removeLoreEntry(lore, "b");
    expect(lore.entries).toHaveLength(1);
    expect(lore.entries[0]?.relatedEntryIds).toEqual([]);
  });

  it("orders the timeline by order key, undated events last by name", () => {
    let lore = emptyWorldLore("project-1");
    lore = upsertLoreEntry(lore, entry({ id: "e2", kind: "event", name: "두 번째", timelineOrder: 2 }));
    lore = upsertLoreEntry(lore, entry({ id: "e1", kind: "event", name: "첫 번째", timelineOrder: 1 }));
    lore = upsertLoreEntry(lore, entry({ id: "e3", kind: "event", name: "미상", timelineOrder: null }));
    lore = upsertLoreEntry(lore, entry({ id: "p1", kind: "place", name: "장소" }));
    expect(loreTimeline(lore).map((e) => e.id)).toEqual(["e1", "e2", "e3"]);
  });

  it("counts by kind and searches name, aliases and summary", () => {
    const lore = createWorldLoreExamples("project-1");
    const counts = loreKindCounts(lore);
    expect(counts.place).toBe(2);
    expect(counts.event).toBe(2);
    expect(counts.rule).toBe(1);
    expect(searchLoreEntries(lore, "물밑 서고").map((e) => e.kind)).toEqual(["place"]);
    expect(searchLoreEntries(lore, "등불").length).toBeGreaterThanOrEqual(2);
    expect(searchLoreEntries(lore, "").length).toBe(lore.entries.length);
  });

  it("examples are internally linked and removable as a group", () => {
    const lore = createWorldLoreExamples("project-1");
    const place = loreEntriesByKind(lore, "place")[0];
    expect(place).toBeDefined();
    expect(loreRelatedEntries(lore, place!).map((e) => e.id)).toContain("example-faction-guild");
    const cleaned = removeLoreExamples(lore);
    expect(cleaned.entries).toHaveLength(0);
    // 작가가 쓴 항목은 예시 정리에서 남는다.
    const mixed = upsertLoreEntry(lore, entry({ id: "mine", name: "내 장소" }));
    expect(removeLoreExamples(mixed).entries.map((e) => e.id)).toEqual(["mine"]);
  });

  it("validates dangling links, name collisions and undated events", () => {
    let lore = emptyWorldLore("project-1");
    lore = upsertLoreEntry(lore, entry({
      id: "x",
      kind: "faction",
      name: "모아", // 캐릭터 이름과 충돌
      relatedEntryIds: ["ghost"],
      characterIds: ["char-1", "ghost-char"],
    }));
    lore = upsertLoreEntry(lore, entry({ id: "ev", kind: "event", name: "언젠가" }));
    const issues = validateWorldLore(BIBLE, lore);
    const codes = issues.map((issue) => issue.code);
    expect(codes).toContain("lore-name-collision");
    expect(codes).toContain("lore-relation-reference");
    expect(codes).toContain("lore-character-reference");
    expect(codes).toContain("lore-event-undated");
  });

  it("validates example lore clean against an empty bible", () => {
    const issues = validateWorldLore(null, createWorldLoreExamples("project-1"));
    expect(issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });
});

describe("lore entry status, version and scope", () => {
  it("defaults drafts to confirmed, v1 and all-scope", () => {
    const filled = withLoreEntryDefaults({
      id: "d1",
      kind: "rule",
      name: "규칙",
      aliases: [],
      summary: "",
      details: "",
      eraLabel: "",
      timelineOrder: null,
      relatedEntryIds: [],
      characterIds: [],
      origin: "authored",
    });
    expect(filled.status).toBe("confirmed");
    expect(filled.version).toBe(1);
    expect(filled.appliesToWorkIds).toEqual([]);
    expect(filled.appliesToSeasonLabels).toEqual([]);
    expect(formatLoreEntryStatusLine(filled)).toBe("확정 v1 · 전 작품 · 전 시즌");
  });

  it("transitions status and bumps the version, including legends restore", () => {
    let lore = emptyWorldLore("project-1");
    lore = upsertLoreEntry(lore, entry({ id: "a", name: "옛 설정" }));
    lore = transitionLoreEntryStatus(lore, "a", "quarantined");
    expect(lore.entries[0]?.status).toBe("quarantined");
    expect(lore.entries[0]?.version).toBe(2);
    expect(retiredLoreEntries(lore).map((e) => e.id)).toEqual(["a"]);
    expect(activeLoreEntries(lore)).toHaveLength(0);
    lore = transitionLoreEntryStatus(lore, "a", "confirmed");
    expect(lore.entries[0]?.status).toBe("confirmed");
    expect(lore.entries[0]?.version).toBe(3);
    // 같은 상태로의 전이는 버전도 그대로 둔다.
    expect(transitionLoreEntryStatus(lore, "a", "confirmed")).toBe(lore);
    expect(reviseLoreEntryVersion(lore, "a", 2).entries[0]?.version).toBe(3);
    expect(reviseLoreEntryVersion(lore, "a", 5).entries[0]?.version).toBe(5);
  });

  it("counts by status and keeps quarantined events off the timeline", () => {
    let lore = emptyWorldLore("project-1");
    lore = upsertLoreEntry(lore, entry({ id: "e1", kind: "event", name: "사건", timelineOrder: 1 }));
    lore = upsertLoreEntry(lore, entry({ id: "g1", kind: "place", name: "빈칸", status: "intentional-gap" }));
    lore = transitionLoreEntryStatus(lore, "e1", "deprecated");
    const counts = loreStatusCounts(lore);
    expect(counts.deprecated).toBe(1);
    expect(counts["intentional-gap"]).toBe(1);
    expect(loreEntriesByStatus(lore, "intentional-gap").map((e) => e.id)).toEqual(["g1"]);
    expect(loreTimeline(lore)).toHaveLength(0);
  });

  it("judges scope by work and season, empty scope meaning all", () => {
    const scoped = entry({
      id: "s1",
      appliesToWorkIds: ["work-2"],
      appliesToSeasonLabels: ["시즌 2"],
    });
    expect(loreEntryAppliesTo(scoped, { workId: "work-2", seasonLabel: "시즌 2" })).toBe(true);
    expect(loreEntryAppliesTo(scoped, { workId: "work-1" })).toBe(false);
    expect(loreEntryAppliesTo(scoped, { seasonLabel: "시즌 1" })).toBe(false);
    expect(loreEntryAppliesTo(scoped, {})).toBe(true);
    expect(loreEntryAppliesTo(entry({ id: "s2" }), { workId: "any" })).toBe(true);
    expect(loreEntryScopesOverlap(scoped, entry({ id: "s3", appliesToSeasonLabels: ["시즌 1"] }))).toBe(false);
    expect(loreEntryScopesOverlap(scoped, entry({ id: "s4" }))).toBe(true);
  });

  it("lets a quarantined name be reused and only warns about retired links", () => {
    let lore = emptyWorldLore("project-1");
    lore = upsertLoreEntry(lore, entry({ id: "old", name: "옛 도서관", status: "quarantined" }));
    lore = upsertLoreEntry(lore, entry({ id: "new", name: "옛 도서관", relatedEntryIds: ["old"] }));
    const issues = validateWorldLore(null, lore);
    expect(issues.map((i) => i.code)).not.toContain("lore-name-collision");
    expect(issues.map((i) => i.code)).toContain("lore-retired-link");
  });

  it("rejects an invalid version", () => {
    const lore = upsertLoreEntry(
      emptyWorldLore("project-1"),
      entry({ id: "v", name: "버전", version: 0 }),
    );
    // upsert가 버전을 1로 정규화하므로, 검증 오류는 정규화를 거치지 않은 조립본에서 확인한다.
    const raw = { projectId: "project-1", entries: [{ ...lore.entries[0]!, version: 0 }] };
    expect(validateWorldLore(null, raw).map((i) => i.code)).toContain("lore-version-invalid");
  });

  it("examples demonstrate the tristate: a speculative rule and an intentional gap", () => {
    const lore = createWorldLoreExamples("project-1");
    const gap = loreEntriesByStatus(lore, "intentional-gap");
    expect(gap.map((e) => e.id)).toEqual(["example-place-sunken-floor"]);
    expect(loreEntriesByStatus(lore, "speculative").map((e) => e.id)).toEqual(["example-rule-memory"]);
    expect(loreStatusCounts(lore).confirmed).toBeGreaterThanOrEqual(5);
  });
});

describe("studio-world-lore store", () => {
  function memoryStorage() {
    const map = new Map<string, string>();
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => {
        map.set(key, value);
      },
      removeItem: (key: string) => {
        map.delete(key);
      },
    };
  }

  it("ensures an empty state without seeding examples", () => {
    const storage = memoryStorage();
    const state = ensureStudioWorldLore(storage, "project-1");
    expect(state.entries).toEqual([]);
    expect(readStudioWorldLore(storage, "project-1")?.projectId).toBe("project-1");
  });

  it("round-trips entries and rejects other projects' snapshots", () => {
    const storage = memoryStorage();
    const examples = createWorldLoreExamples("project-1");
    saveStudioWorldLoreEntries(storage, "project-1", examples.entries);
    const read = readStudioWorldLore(storage, "project-1");
    expect(read?.entries).toHaveLength(examples.entries.length);
    expect(readStudioWorldLore(storage, "project-2")).toBeNull();
    expect(parseStudioWorldLore({ schemaVersion: 1, projectId: "p", entries: [{ id: 1 }] })).toBeNull();
    expect(studioWorldLoreStorageKey("project-1")).toContain("project-1");
  });

  it("reads legacy entries without status, version or scope as confirmed v1 all-scope", () => {
    const legacy = {
      schemaVersion: 1,
      projectId: "project-1",
      entries: [
        {
          id: "legacy-1",
          kind: "place",
          name: "옛 장소",
          aliases: [],
          summary: "",
          details: "",
          eraLabel: "",
          timelineOrder: null,
          relatedEntryIds: [],
          characterIds: [],
          origin: "authored",
        },
      ],
    };
    const parsed = parseStudioWorldLore(legacy, "project-1");
    expect(parsed?.entries[0]?.status).toBe("confirmed");
    expect(parsed?.entries[0]?.version).toBe(1);
    expect(parsed?.entries[0]?.appliesToWorkIds).toEqual([]);
    expect(parsed?.entries[0]?.appliesToSeasonLabels).toEqual([]);
  });

  it("round-trips status, version and scope, and rejects an unknown status", () => {
    const storage = memoryStorage();
    const base = createWorldLoreExamples("project-1");
    const quarantined = transitionLoreEntryStatus(base, "example-artifact-lamp", "quarantined");
    saveStudioWorldLoreEntries(storage, "project-1", quarantined.entries);
    const read = readStudioWorldLore(storage, "project-1");
    const lamp = read?.entries.find((e) => e.id === "example-artifact-lamp");
    expect(lamp?.status).toBe("quarantined");
    expect(lamp?.version).toBe(2);
    expect(
      parseStudioWorldLore({
        schemaVersion: 1,
        projectId: "p",
        entries: [{ ...quarantined.entries[0], status: "maybe" }],
      }),
    ).toBeNull();
  });
});
