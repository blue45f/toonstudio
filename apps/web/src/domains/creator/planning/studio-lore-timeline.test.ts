import { describe, expect, it } from "vitest";

import type { StudioStoryCharacter } from "../studio-story-bible";
import {
  createWorldLoreExamples,
  emptyWorldLore,
  loreTimeline,
  upsertLoreEntry,
  type StudioLoreEntry,
} from "./studio-world-lore";
import {
  LORE_TIMELINE_UNDATED_LABEL,
  buildLoreTimelineView,
  loreTimelineSummaryLine,
} from "./studio-lore-timeline";

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
    ...partial,
  };
}

const CHARACTERS: readonly StudioStoryCharacter[] = [
  { id: "char-1", name: "모아", aliases: [], defaultCostumeId: null, defaultAppearanceId: null },
];

describe("studio-lore-timeline view model", () => {
  it("shares the hub timeline order exactly (same loreTimeline source)", () => {
    let lore = emptyWorldLore("project-1");
    lore = upsertLoreEntry(lore, entry({ id: "e2", kind: "event", name: "두 번째", timelineOrder: 2 }));
    lore = upsertLoreEntry(lore, entry({ id: "e1", kind: "event", name: "첫 번째", timelineOrder: 1, eraLabel: "0년" }));
    lore = upsertLoreEntry(lore, entry({ id: "e3", kind: "event", name: "미상" }));
    lore = upsertLoreEntry(lore, entry({ id: "p1", kind: "place", name: "장소" }));
    const view = buildLoreTimelineView(lore, CHARACTERS);
    expect(view.rows.map((row) => row.entry.id)).toEqual(
      loreTimeline(lore).map((event) => event.id),
    );
    expect(view.rows.map((row) => row.position)).toEqual([1, 2, 3]);
    // 사건이 아닌 항목은 연표에 오르지 않지만 전체 개수에는 잡힌다.
    expect(view.eventCount).toBe(3);
    expect(view.totalEntryCount).toBe(4);
  });

  it("shows the era label, and falls back to the undated label only when neither era nor order exists", () => {
    let lore = emptyWorldLore("project-1");
    lore = upsertLoreEntry(lore, entry({ id: "a", kind: "event", name: "표기 있음", eraLabel: "대침수 3년 뒤" }));
    lore = upsertLoreEntry(lore, entry({ id: "b", kind: "event", name: "순서만 있음", timelineOrder: 5 }));
    lore = upsertLoreEntry(lore, entry({ id: "c", kind: "event", name: "둘 다 없음" }));
    const view = buildLoreTimelineView(lore, []);
    const byId = new Map(view.rows.map((row) => [row.entry.id, row]));
    expect(byId.get("a")?.eraDisplay).toBe("대침수 3년 뒤");
    expect(byId.get("a")?.undated).toBe(false);
    // 순서 키만 있어도 미정은 아니다 — 검증기의 lore-event-undated 조건과 같다.
    expect(byId.get("b")?.eraDisplay).toBe(LORE_TIMELINE_UNDATED_LABEL);
    expect(byId.get("b")?.undated).toBe(false);
    expect(byId.get("c")?.eraDisplay).toBe(LORE_TIMELINE_UNDATED_LABEL);
    expect(byId.get("c")?.undated).toBe(true);
    expect(view.datedCount).toBe(2);
    expect(view.undatedCount).toBe(1);
  });

  it("resolves related entry and character names, falling back to the id for unknown characters", () => {
    let lore = emptyWorldLore("project-1");
    lore = upsertLoreEntry(lore, entry({ id: "place-1", name: "침수된 옛 도서관" }));
    lore = upsertLoreEntry(lore, entry({
      id: "ev-1",
      kind: "event",
      name: "길드 결성",
      eraLabel: "12년 뒤",
      relatedEntryIds: ["place-1", "ghost"],
      characterIds: ["char-1", "ghost-char"],
    }));
    const view = buildLoreTimelineView(lore, CHARACTERS);
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]?.relatedNames).toEqual(["침수된 옛 도서관"]);
    expect(view.rows[0]?.characterNames).toEqual(["모아", "ghost-char"]);
  });

  it("renders the example world timeline in story order", () => {
    const lore = createWorldLoreExamples("project-1");
    const view = buildLoreTimelineView(lore, []);
    expect(view.rows.map((row) => row.entry.name)).toEqual(["대침수", "등불지기 길드 결성"]);
    expect(view.rows.map((row) => row.eraDisplay)).toEqual(["0년", "대침수 12년 뒤"]);
    expect(view.undatedCount).toBe(0);
  });

  it("distinguishes an empty lore from a lore without events, and summarizes counts", () => {
    const empty = buildLoreTimelineView(emptyWorldLore("project-1"), []);
    expect(empty.eventCount).toBe(0);
    expect(empty.totalEntryCount).toBe(0);
    expect(loreTimelineSummaryLine(empty)).toBe("");

    let lore = emptyWorldLore("project-1");
    lore = upsertLoreEntry(lore, entry({ id: "p1", name: "장소만 있음" }));
    const noEvents = buildLoreTimelineView(lore, []);
    expect(noEvents.eventCount).toBe(0);
    expect(noEvents.totalEntryCount).toBe(1);

    lore = upsertLoreEntry(lore, entry({ id: "e1", kind: "event", name: "사건", eraLabel: "1년" }));
    lore = upsertLoreEntry(lore, entry({ id: "e2", kind: "event", name: "미정 사건" }));
    const view = buildLoreTimelineView(lore, []);
    expect(loreTimelineSummaryLine(view)).toBe("사건 2개 · 시기 표기 있음 1개 · 시기 미정 1개");
  });
});
