import { describe, expect, it } from "vitest";

import { assetsSectionFromResources, buildUnifiedSearchResult } from "./unified-search";
import {
  mergeUnifiedAssetSections,
  searchUnifiedAssets,
  UNIFIED_ASSET_ENTRIES,
} from "./unified-search-assets";
import { UNIFIED_ASSETS_INDEX } from "./unified-search-assets-index";
import { searchUnifiedLocal } from "./unified-search-providers";

describe("unified-search assets local index (A6)", () => {
  it("keeps a lightweight index derived from the starter catalog (title·tags·kind only)", () => {
    expect(UNIFIED_ASSETS_INDEX.length).toBeGreaterThanOrEqual(100);
    expect(UNIFIED_ASSET_ENTRIES.length).toBe(UNIFIED_ASSETS_INDEX.length);
    const ids = new Set(UNIFIED_ASSET_ENTRIES.map((entry) => entry.id));
    expect(ids.size).toBe(UNIFIED_ASSET_ENTRIES.length);
    for (const entry of UNIFIED_ASSET_ENTRIES) {
      expect(entry.title).toBeTruthy();
      expect(entry.kind).toBeTruthy();
      expect(entry.tags.length).toBeGreaterThan(0);
    }
    const kinds = new Set(UNIFIED_ASSET_ENTRIES.map((entry) => entry.kind));
    expect(kinds.has("brush")).toBe(true);
    expect(kinds.has("3d-asset")).toBe(true);
    expect(kinds.has("template")).toBe(true);
  });

  it("answers asset queries with real items, not a link-only section", () => {
    const section = searchUnifiedAssets("배경");
    expect(section.items.length).toBeGreaterThan(0);
    expect(section.total).toBeGreaterThanOrEqual(section.items.length);
    for (const item of section.items) {
      expect(item.href).toMatch(/^\/market\/resource\//);
      expect(item.title).toBeTruthy();
    }
    expect(section.moreHref).toBe("/market/browse?q=%EB%B0%B0%EA%B2%BD");
  });

  it("matches by tag and kind as well as title", () => {
    const brushes = searchUnifiedAssets("브러시");
    expect(brushes.items.some((item) => item.description?.includes("brush"))).toBe(true);
    const palettes = searchUnifiedAssets("팔레트");
    expect(palettes.items.length).toBeGreaterThan(0);
    expect(palettes.items[0]?.title).toContain("팔레트");
  });

  it("returns an empty section for an empty query and keeps the market link for unmatched queries", () => {
    expect(searchUnifiedAssets("   ").items).toHaveLength(0);
    expect(searchUnifiedAssets("   ").moreHref).toBeUndefined();
    const unmatched = searchUnifiedAssets("존재하지않는소재xyz");
    expect(unmatched.moreHref).toBe(`/market/browse?q=${encodeURIComponent("존재하지않는소재xyz")}`);
  });

  it("surfaces asset items through the local aggregation (searchUnifiedLocal)", () => {
    const result = searchUnifiedLocal("배경");
    const assets = result.sections.find((section) => section.kind === "assets");
    expect(assets).toBeDefined();
    expect(assets!.items.length).toBeGreaterThan(0);
    expect(result.totalCount).toBeGreaterThan(0);
  });
});

describe("unified-search assets merge rules (A6)", () => {
  it("prefers server records, dedupes by id and appends local-only items", () => {
    const local = searchUnifiedAssets("커피", 4);
    expect(local.items.length).toBeGreaterThan(1);
    const overlapping = local.items[0]!;
    const server = assetsSectionFromResources(
      [
        { id: overlapping.id, name: "서버 최신 커피 소재", kind: "asset" },
        { id: "server-only-1", name: "서버 전용 소재", kind: "brush" },
      ],
      "커피",
      4,
      120,
    );
    const merged = mergeUnifiedAssetSections(server, local, 4);
    expect(merged.items[0]?.id).toBe(overlapping.id);
    expect(merged.items[0]?.title).toBe("서버 최신 커피 소재");
    expect(merged.items.map((item) => item.id).filter((id) => id === overlapping.id)).toHaveLength(1);
    expect(merged.items.some((item) => item.id === "server-only-1")).toBe(true);
    expect(merged.items.length).toBeLessThanOrEqual(4);
    // total은 중복을 더하지 않은 합집합 하한 — 서버 total보다 작아지지 않는다.
    expect(merged.total).toBeGreaterThanOrEqual(120);
    expect(merged.moreHref).toBe("/market/browse?q=%EC%BB%A4%ED%94%BC");
  });

  it("falls back to the local section alone when the server has nothing", () => {
    const local = searchUnifiedAssets("브러시");
    expect(mergeUnifiedAssetSections(null, local).items).toEqual(local.items);
    expect(mergeUnifiedAssetSections(undefined, undefined).items).toHaveLength(0);
    const assembled = buildUnifiedSearchResult("브러시", [
      mergeUnifiedAssetSections(null, searchUnifiedAssets("브러시")),
    ]);
    expect(assembled.sections.map((section) => section.kind)).toEqual(["assets"]);
    expect(assembled.totalCount).toBeGreaterThan(0);
  });
});
