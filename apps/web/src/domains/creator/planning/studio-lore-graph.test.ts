import { describe, expect, it } from "vitest";

import type { StudioStoryCharacter } from "../studio-story-bible";
import {
  LORE_GRAPH_MAX_EDGES,
  LORE_GRAPH_MAX_NODES,
  buildLoreGraph,
  loreGraphNodeId,
} from "./studio-lore-graph";
import {
  createWorldLoreExamples,
  emptyWorldLore,
  upsertLoreEntry,
  type StudioLoreEntry,
  type StudioWorldLore,
} from "./studio-world-lore";

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
    status: partial.status ?? "confirmed",
    version: partial.version ?? 1,
    appliesToWorkIds: partial.appliesToWorkIds ?? [],
    appliesToSeasonLabels: partial.appliesToSeasonLabels ?? [],
  };
}

function character(id: string, name: string): StudioStoryCharacter {
  return { id, name, aliases: [], defaultCostumeId: null, defaultAppearanceId: null };
}

function loreWith(entries: readonly StudioLoreEntry[]): StudioWorldLore {
  let lore = emptyWorldLore("project-1");
  for (const item of entries) lore = upsertLoreEntry(lore, item);
  return lore;
}

describe("studio-lore-graph model", () => {
  it("builds a graph from the example world with deduped related edges", () => {
    const graph = buildLoreGraph(createWorldLoreExamples("project-1"), []);
    expect(graph.mode).toBe("graph");
    expect(graph.omission).toBeNull();
    // 예시 세계는 항목 8개다. 일부러 비워 둔 "도서관 아래 잠긴 층"(의도된 공백)도 도서관과 이어진다.
    expect(graph.totalNodeCount).toBe(8);
    // 양방향 선언(도서관↔길드 등)은 무방향 간선 1개로 합쳐진다.
    expect(graph.totalEdgeCount).toBe(9);
    expect(graph.edges).toHaveLength(9);
    const library = graph.nodes.find((node) => node.sourceId === "example-place-library");
    // 대침수·길드 결성·등불지기 길드·물에 닿은 기억 규칙·잠긴 층.
    expect(library?.degree).toBe(5);
    expect(graph.isolatedCount).toBe(0);
  });

  it("adds character nodes only for linked characters, with character edges", () => {
    const lore = loreWith([
      entry({ id: "a", name: "서고", characterIds: ["char-1", "ghost"] }),
      entry({ id: "b", name: "길드" }),
    ]);
    const graph = buildLoreGraph(lore, [character("char-1", "모아"), character("char-2", "단오")]);
    expect(graph.totalNodeCount).toBe(3); // 항목 2 + 연결된 캐릭터 1 (단오·ghost 제외)
    const charNode = graph.nodes.find((node) => node.kind === "character");
    expect(charNode?.label).toBe("모아");
    expect(graph.edges).toEqual([
      expect.objectContaining({
        kind: "character",
        fromNodeId: loreGraphNodeId("place", "a"),
        toNodeId: loreGraphNodeId("character", "char-1"),
      }),
    ]);
  });

  it("dedupes mutual related declarations into one undirected edge", () => {
    const lore = loreWith([
      entry({ id: "a", relatedEntryIds: ["b"] }),
      entry({ id: "b", relatedEntryIds: ["a"] }),
    ]);
    const graph = buildLoreGraph(lore, []);
    expect(graph.totalEdgeCount).toBe(1);
    expect(graph.edges[0]?.kind).toBe("related");
  });

  it("ignores dangling related ids instead of inventing nodes", () => {
    const lore = loreWith([entry({ id: "a", relatedEntryIds: ["missing"] })]);
    const graph = buildLoreGraph(lore, []);
    expect(graph.totalNodeCount).toBe(1);
    expect(graph.totalEdgeCount).toBe(0);
    expect(graph.omission).toBe("no-relations");
    expect(graph.mode).toBe("list");
    expect(graph.listRows[0]?.connectedLabels).toEqual([]);
  });

  it("reports empty lore as empty, not as a graph", () => {
    const graph = buildLoreGraph(emptyWorldLore("project-1"), []);
    expect(graph.omission).toBe("empty");
    expect(graph.mode).toBe("list");
    expect(graph.listRows).toEqual([]);
  });

  it("shrinks to the list when the node cap is exceeded, keeping totals and rows", () => {
    const lore = loreWith([
      entry({ id: "a", name: "가", relatedEntryIds: ["b"] }),
      entry({ id: "b", name: "나", relatedEntryIds: ["c"] }),
      entry({ id: "c", name: "다" }),
    ]);
    const graph = buildLoreGraph(lore, [], { maxNodes: 2 });
    expect(graph.mode).toBe("list");
    expect(graph.omission).toBe("too-large");
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
    expect(graph.totalNodeCount).toBe(3);
    expect(graph.totalEdgeCount).toBe(2);
    expect(graph.listRows).toHaveLength(3);
    // 차수 높은 항목이 목록 앞에 온다.
    expect(graph.listRows[0]?.sourceId).toBe("b");
    expect(graph.listRows[0]?.connectedLabels).toEqual(["가", "다"]);
  });

  it("shrinks to the list when the edge cap is exceeded", () => {
    const lore = loreWith([
      entry({ id: "a", relatedEntryIds: ["b", "c"] }),
      entry({ id: "b", relatedEntryIds: ["c"] }),
      entry({ id: "c" }),
    ]);
    const graph = buildLoreGraph(lore, [], { maxEdges: 2 });
    expect(graph.omission).toBe("too-large");
    expect(graph.totalEdgeCount).toBe(3);
  });

  it("lays out deterministically: same kind shares a column, rows sorted by label", () => {
    const lore = loreWith([
      entry({ id: "b", kind: "place", name: "나장소", relatedEntryIds: ["a"] }),
      entry({ id: "a", kind: "place", name: "가장소" }),
      entry({ id: "r", kind: "rule", name: "규칙", relatedEntryIds: ["a"] }),
    ]);
    const first = buildLoreGraph(lore, []);
    const second = buildLoreGraph(lore, []);
    expect(first.nodes).toEqual(second.nodes);
    const places = first.nodes.filter((node) => node.kind === "place");
    expect(new Set(places.map((node) => node.x)).size).toBe(1);
    expect(places.map((node) => node.label)).toEqual(["가장소", "나장소"]);
    expect(places[0]?.y).toBeLessThan(places[1]?.y ?? 0);
    const rule = first.nodes.find((node) => node.kind === "rule");
    expect(rule?.x).toBeGreaterThan(places[0]?.x ?? 0);
    expect(first.width).toBeGreaterThan(0);
    expect(first.height).toBeGreaterThan(0);
    for (const edge of first.edges) expect(edge.path).toMatch(/^M /);
  });

  it("uses the exported caps as defaults", () => {
    expect(LORE_GRAPH_MAX_NODES).toBe(40);
    expect(LORE_GRAPH_MAX_EDGES).toBe(120);
    const entries: StudioLoreEntry[] = [];
    for (let i = 0; i <= LORE_GRAPH_MAX_NODES; i += 1) {
      entries.push(
        entry({
          id: `e-${i}`,
          name: `항목 ${i}`,
          relatedEntryIds: i === 0 ? [] : [`e-${i - 1}`],
        }),
      );
    }
    const graph = buildLoreGraph(loreWith(entries), []);
    expect(graph.totalNodeCount).toBe(LORE_GRAPH_MAX_NODES + 1);
    expect(graph.omission).toBe("too-large");
  });
});
