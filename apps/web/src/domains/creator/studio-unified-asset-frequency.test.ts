import { describe, expect, it } from "vitest";

import {
  createMaterialUsageLedger,
  materialUsageStats,
  recordMaterialUse,
} from "./studio-material-usage";
import {
  discoverStudioUnifiedAssets,
  type StudioUnifiedAssetUsageStat,
} from "./studio-unified-asset-intelligence";
import { projectStudioUnifiedAssetLibrary } from "./studio-unified-asset-library-projection";

import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

function item(id: string, title: string, sortPriority: number): StudioUnifiedAssetItem {
  return {
    id,
    category: "scene",
    scope: "studio",
    title,
    description: title,
    categoryLabel: "배경",
    keywords: [title],
    badges: [],
    preview: { kind: "none" },
    useMode: "insert",
    useLabel: "삽입",
    discoverability: "standard",
    sortPriority,
    source: { kind: "background", value: { id, label: title, genre: "학원", imgSrc: "" } },
  } as unknown as StudioUnifiedAssetItem;
}

const items = [
  item("asset:alpha", "알파", 10),
  item("asset:beta", "베타", 99),
  item("asset:gamma", "감마", 50),
] as const;

function stats(): ReadonlyMap<string, StudioUnifiedAssetUsageStat> {
  let ledger = createMaterialUsageLedger();
  // alpha 3회·최근 900 / beta 3회·최근 500 / gamma 1회·최근 9999
  const sequence: Array<[string, number]> = [
    ["asset:beta", 100],
    ["asset:alpha", 200],
    ["asset:beta", 300],
    ["asset:alpha", 400],
    ["asset:beta", 500],
    ["asset:alpha", 900],
    ["asset:gamma", 9999],
  ];
  for (const [id, at] of sequence) {
    ledger = recordMaterialUse(ledger, id, "image", at);
  }
  return materialUsageStats(ledger);
}

describe("unified asset library — frequency sort wiring", () => {
  it("discover sorts by count desc, then lastUsedAt desc (priority ignored)", () => {
    const result = discoverStudioUnifiedAssets(items, {
      sort: "frequency",
      usageStats: stats(),
      // Force the plain-list path (no query/curation) via a structured filter.
      format: "all",
      limit: 10,
    });
    // discover() without query/filters goes through highlight curation, which
    // may drop items; use the projection assertion below for the full order and
    // here only require that returned items respect frequency order pairwise.
    const order = result.map((entry) => entry.id);
    const expected = ["asset:alpha", "asset:beta", "asset:gamma"];
    expect(order).toEqual(expected.filter((id) => order.includes(id)));
  });

  it("projection returns the full deterministic frequency order", () => {
    const projected = projectStudioUnifiedAssetLibrary(items, {
      sort: "frequency",
      usageStats: stats(),
    });
    // 횟수 우선: gamma는 가장 최근이지만 1회라 마지막. 동률 alpha/beta는 최근순.
    expect(projected.map((entry) => entry.id)).toEqual([
      "asset:alpha",
      "asset:beta",
      "asset:gamma",
    ]);
    const reversed = projectStudioUnifiedAssetLibrary([...items].reverse(), {
      sort: "frequency",
      usageStats: stats(),
    });
    expect(reversed.map((entry) => entry.id)).toEqual(
      projected.map((entry) => entry.id),
    );
  });

  it("without stats, frequency falls back to stable id order", () => {
    const projected = projectStudioUnifiedAssetLibrary(items, { sort: "frequency" });
    expect(projected.map((entry) => entry.id)).toEqual([
      "asset:alpha",
      "asset:beta",
      "asset:gamma",
    ]);
  });
});
