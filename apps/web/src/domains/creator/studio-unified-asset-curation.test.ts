import { describe, expect, it } from "vitest";

import {
  applyStudioUnifiedAssetCurationPreset,
  createStudioUnifiedAssetLibraryState,
  discoverStudioUnifiedAssets,
  getStudioUnifiedAssetFlag,
  getStudioUnifiedAssetRating,
  parseStudioUnifiedAssetLibraryState,
  serializeStudioUnifiedAssetLibraryState,
  setStudioUnifiedAssetFlag,
  setStudioUnifiedAssetRating,
  toggleStudioUnifiedAssetFavorite,
  toggleStudioUnifiedAssetTray,
  STUDIO_UNIFIED_ASSET_BULK_ADJUSTMENT_PRESETS,
} from "./studio-unified-asset-intelligence";
import { projectStudioUnifiedAssetLibrary } from "./studio-unified-asset-library-projection";

import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

function backgroundItem(id: string, title: string, sortPriority: number): StudioUnifiedAssetItem {
  return {
    id,
    category: "scene",
    scope: "studio",
    title,
    description: "배경",
    categoryLabel: "2D 배경",
    keywords: ["배경"],
    badges: [],
    preview: { kind: "image", src: "/x.webp" },
    useMode: "insert",
    useLabel: "배경 삽입",
    discoverability: "standard",
    sortPriority,
    source: { kind: "background", value: { id, label: title, genre: "학원", imgSrc: "/x.webp" } },
  } as unknown as StudioUnifiedAssetItem;
}

const alpha = backgroundItem("background:alpha", "알파 배경", 100);
const beta = backgroundItem("background:beta", "베타 배경", 90);
const gamma = backgroundItem("background:gamma", "감마 배경", 80);
const items = [alpha, beta, gamma] as const;

describe("studio-unified-asset curation (별점·플래그 선별)", () => {
  it("sets, reads, and clears ratings with 0 as the unrated value", () => {
    const empty = createStudioUnifiedAssetLibraryState();
    expect(getStudioUnifiedAssetRating(empty, alpha.id)).toBe(0);

    const rated = setStudioUnifiedAssetRating(empty, alpha.id, 4);
    expect(getStudioUnifiedAssetRating(rated, alpha.id)).toBe(4);
    expect(rated.ratings).toEqual([{ id: alpha.id, rating: 4 }]);
    expect(empty.ratings).toEqual([]);

    const rerated = setStudioUnifiedAssetRating(rated, alpha.id, 2);
    expect(rerated.ratings).toEqual([{ id: alpha.id, rating: 2 }]);

    const cleared = setStudioUnifiedAssetRating(rerated, alpha.id, 0);
    expect(getStudioUnifiedAssetRating(cleared, alpha.id)).toBe(0);
    expect(cleared.ratings).toEqual([]);
  });

  it("rejects invalid ratings and ids without changing state", () => {
    const empty = createStudioUnifiedAssetLibraryState();
    expect(setStudioUnifiedAssetRating(empty, alpha.id, 6 as never)).toBe(empty);
    expect(setStudioUnifiedAssetRating(empty, alpha.id, 2.5 as never)).toBe(empty);
    expect(setStudioUnifiedAssetRating(empty, "  ", 3)).toBe(empty);
    expect(getStudioUnifiedAssetRating(empty, "")).toBe(0);
  });

  it("sets, reads, and clears flags", () => {
    const empty = createStudioUnifiedAssetLibraryState();
    const picked = setStudioUnifiedAssetFlag(empty, beta.id, "pick");
    expect(getStudioUnifiedAssetFlag(picked, beta.id)).toBe("pick");
    expect(picked.flags).toEqual([{ id: beta.id, flag: "pick" }]);

    const held = setStudioUnifiedAssetFlag(picked, beta.id, "hold");
    expect(held.flags).toEqual([{ id: beta.id, flag: "hold" }]);

    const cleared = setStudioUnifiedAssetFlag(held, beta.id, null);
    expect(getStudioUnifiedAssetFlag(cleared, beta.id)).toBeNull();
    expect(cleared.flags).toEqual([]);
    expect(setStudioUnifiedAssetFlag(empty, beta.id, "bogus" as never)).toBe(empty);
  });

  it("sanitizes persisted curation: drops invalid values, keeps the last duplicate, enforces bounds", () => {
    const parsed = parseStudioUnifiedAssetLibraryState(
      JSON.stringify({
        version: 1,
        ratings: [
          { id: alpha.id, rating: 3 },
          { id: alpha.id, rating: 5 },
          { id: beta.id, rating: 0 },
          { id: beta.id, rating: 6 },
          { id: beta.id, rating: 2.5 },
          { id: beta.id, rating: "4" },
          { id: gamma.id, rating: 1 },
          "junk",
        ],
        flags: [
          { id: alpha.id, flag: "pick" },
          { id: beta.id, flag: "maybe" },
          { id: gamma.id, flag: "reject" },
        ],
      }),
    );
    expect(parsed.ratings).toEqual([
      { id: alpha.id, rating: 5 },
      { id: gamma.id, rating: 1 },
    ]);
    expect(parsed.flags).toEqual([
      { id: alpha.id, flag: "pick" },
      { id: gamma.id, flag: "reject" },
    ]);

    const bounded = parseStudioUnifiedAssetLibraryState(
      JSON.stringify({
        ratings: Array.from({ length: 620 }, (_, index) => ({
          id: `background:r${index}`,
          rating: 3,
        })),
        flags: Array.from({ length: 620 }, (_, index) => ({
          id: `background:f${index}`,
          flag: "hold",
        })),
      }),
    );
    expect(bounded.ratings).toHaveLength(500);
    expect(bounded.flags).toHaveLength(500);
  });

  it("round-trips curation through serialize/parse and stays compatible with legacy v1 payloads", () => {
    const state = setStudioUnifiedAssetFlag(
      setStudioUnifiedAssetRating(createStudioUnifiedAssetLibraryState(), alpha.id, 5),
      alpha.id,
      "pick",
    );
    const restored = parseStudioUnifiedAssetLibraryState(
      serializeStudioUnifiedAssetLibraryState(state),
    );
    expect(restored).toEqual(state);

    const legacy = parseStudioUnifiedAssetLibraryState(
      JSON.stringify({ version: 1, favorites: [alpha.id], recents: [], tray: [] }),
    );
    expect(legacy.ratings).toEqual([]);
    expect(legacy.flags).toEqual([]);
    expect(legacy.favorites).toEqual([alpha.id]);
  });

  it("preserves curation when favorites, tray, and recents change", () => {
    const curated = setStudioUnifiedAssetFlag(
      setStudioUnifiedAssetRating(createStudioUnifiedAssetLibraryState(), alpha.id, 4),
      beta.id,
      "hold",
    );
    const withFavorite = toggleStudioUnifiedAssetFavorite(curated, gamma.id);
    const withTray = toggleStudioUnifiedAssetTray(withFavorite, gamma.id);
    expect(withTray.ratings).toEqual(curated.ratings);
    expect(withTray.flags).toEqual(curated.flags);
  });

  it("applies bulk curation presets to many assets at once", () => {
    const empty = createStudioUnifiedAssetLibraryState();
    const picked = applyStudioUnifiedAssetCurationPreset(
      empty,
      [alpha.id, beta.id],
      "pick-top",
    );
    expect(getStudioUnifiedAssetFlag(picked, alpha.id)).toBe("pick");
    expect(getStudioUnifiedAssetRating(picked, alpha.id)).toBe(4);
    expect(getStudioUnifiedAssetFlag(picked, beta.id)).toBe("pick");
    expect(getStudioUnifiedAssetRating(picked, beta.id)).toBe(4);
    expect(getStudioUnifiedAssetFlag(picked, gamma.id)).toBeNull();

    const held = applyStudioUnifiedAssetCurationPreset(picked, [alpha.id], "hold");
    expect(getStudioUnifiedAssetFlag(held, alpha.id)).toBe("hold");
    expect(getStudioUnifiedAssetRating(held, alpha.id)).toBe(4);

    const cleared = applyStudioUnifiedAssetCurationPreset(held, [alpha.id, beta.id], "clear");
    expect(cleared.ratings).toEqual([]);
    expect(cleared.flags).toEqual([]);

    expect(applyStudioUnifiedAssetCurationPreset(empty, [alpha.id], "nope" as never)).toBe(empty);
  });

  it("filters discovery by minimum rating and flag, and sorts by rating", () => {
    const state = setStudioUnifiedAssetFlag(
      setStudioUnifiedAssetRating(
        setStudioUnifiedAssetRating(createStudioUnifiedAssetLibraryState(), alpha.id, 5),
        beta.id,
        3,
      ),
      alpha.id,
      "pick",
    );

    expect(
      discoverStudioUnifiedAssets(items, { minRating: 4, libraryState: state }).map(({ id }) => id),
    ).toEqual([alpha.id]);
    expect(
      discoverStudioUnifiedAssets(items, { flagFilter: "pick", libraryState: state }).map(({ id }) => id),
    ).toEqual([alpha.id]);
    expect(
      discoverStudioUnifiedAssets(items, { flagFilter: "unflagged", libraryState: state }).map(({ id }) => id),
    ).toEqual([beta.id, gamma.id]);
    expect(
      discoverStudioUnifiedAssets(items, { sort: "rating", libraryState: state }).map(({ id }) => id),
    ).toEqual([alpha.id, beta.id, gamma.id]);
  });

  it("filters the grid projection by curation without touching other facets", () => {
    const state = setStudioUnifiedAssetFlag(
      setStudioUnifiedAssetRating(
        setStudioUnifiedAssetRating(createStudioUnifiedAssetLibraryState(), alpha.id, 5),
        beta.id,
        3,
      ),
      beta.id,
      "hold",
    );

    expect(
      projectStudioUnifiedAssetLibrary(items, { minRating: 4, libraryState: state }).map(({ id }) => id),
    ).toEqual([alpha.id]);
    expect(
      projectStudioUnifiedAssetLibrary(items, { flagFilter: "hold", libraryState: state }).map(({ id }) => id),
    ).toEqual([beta.id]);
    expect(
      projectStudioUnifiedAssetLibrary(items, { sort: "rating", libraryState: state }).map(({ id }) => id),
    ).toEqual([alpha.id, beta.id, gamma.id]);
    expect(projectStudioUnifiedAssetLibrary(items, { libraryState: state })).toHaveLength(3);
  });

  it("keeps the image-adjustment bulk application point empty until a bake pipeline exists", () => {
    expect(STUDIO_UNIFIED_ASSET_BULK_ADJUSTMENT_PRESETS).toEqual([]);
  });
});
