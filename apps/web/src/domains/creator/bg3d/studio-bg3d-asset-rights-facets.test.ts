import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_BG3D_ASSET_RIGHTS,
  STUDIO_BG3D_ASSET_METADATA_VERSION,
  normalizeStudioBg3dAssetMetadata,
  queryStudioBg3dAssetMetadata,
  type StudioBg3dAssetMetadata,
} from "./studio-bg3d-asset-metadata";
import {
  UNKNOWN_STUDIO_BG3D_ASSET_RIGHTS_STATE,
  hasActiveStudioBg3dAssetRightsFacets,
  matchesStudioBg3dAssetRightsFacets,
  normalizeStudioBg3dAssetRightsFacets,
  queryStudioBg3dAssetRights,
  readStudioBg3dAssetRightsState,
  studioBg3dAssetRightsFacetsAdmitUnknown,
  type StudioBg3dAssetRightsFacets,
} from "./studio-bg3d-asset-rights-facets";

const hash = (letter: string) => `sha256:${letter.repeat(64)}` as const;

function record(letter: string, rights: unknown, overrides: Record<string, unknown> = {}): StudioBg3dAssetMetadata {
  const value = normalizeStudioBg3dAssetMetadata({
    version: STUDIO_BG3D_ASSET_METADATA_VERSION,
    contentHash: hash(letter),
    name: `소재 ${letter}`,
    format: "glb",
    createdAt: 10,
    updatedAt: 10 + letter.charCodeAt(0),
    byteSize: 1_000,
    triangles: 10,
    textures: 1,
    favorite: false,
    collections: [],
    tags: [],
    rights,
    ...overrides,
  });
  if (!value) throw new Error("invalid fixture");
  return value;
}

const bought = record("a", { status: "licensed", commercialUse: true, teamShareAllowed: false, license: "상업용 표준", aiGenerated: "no" });
const ownedAi = record("b", { status: "owned", commercialUse: true, teamShareAllowed: false, aiGenerated: "yes", aiTraining: "prohibited" });
const publicDomain = record("c", { status: "public-domain", commercialUse: true, teamShareAllowed: false, aiTraining: "allowed" });
const nonCommercial = record("d", { status: "licensed", commercialUse: false, teamShareAllowed: false, license: "비상업 라이선스" });
const unconfirmed = record("e", DEFAULT_STUDIO_BG3D_ASSET_RIGHTS);
const unconfirmedButAi = record("f", { status: "unknown", aiGenerated: "yes" });
const assets = [bought, ownedAi, publicDomain, nonCommercial, unconfirmed, unconfirmedButAi];

const hashesOf = (items: readonly StudioBg3dAssetMetadata[]) => items.map(({ contentHash }) => contentHash.slice(7, 8)).sort();

describe("readStudioBg3dAssetRightsState", () => {
  it("never reads an unconfirmed license as a commercial prohibition or permission", () => {
    expect(readStudioBg3dAssetRightsState(unconfirmed.rights)).toEqual(UNKNOWN_STUDIO_BG3D_ASSET_RIGHTS_STATE);
    expect(readStudioBg3dAssetRightsState(unconfirmed.rights).commercial).toBe("unknown");
    expect(readStudioBg3dAssetRightsState(nonCommercial.rights).commercial).toBe("prohibited");
    expect(readStudioBg3dAssetRightsState(bought.rights).commercial).toBe("allowed");
  });

  it("reports absent AI answers as unknown and keeps explicit ones", () => {
    expect(readStudioBg3dAssetRightsState(publicDomain.rights)).toEqual({
      license: "public-domain", commercial: "allowed", aiGenerated: "unknown", aiTraining: "allowed",
    });
    expect(readStudioBg3dAssetRightsState(unconfirmedButAi.rights)).toEqual({
      license: "unknown", commercial: "unknown", aiGenerated: "yes", aiTraining: "unknown",
    });
  });
});

describe("normalizeStudioBg3dAssetRightsFacets", () => {
  it("de-duplicates, orders canonically, and drops empty facets", () => {
    expect(normalizeStudioBg3dAssetRightsFacets({
      license: ["unknown", "owned", "owned"],
      commercial: [],
      aiGenerated: ["no", "yes"],
    })).toEqual({ license: ["owned", "unknown"], aiGenerated: ["yes", "no"] });
    expect(normalizeStudioBg3dAssetRightsFacets(undefined)).toEqual({});
  });

  it("closes on unknown keys, unknown values, and non-array facets instead of applying part of them", () => {
    for (const bad of [
      { license: ["gpl"] },
      { aiGenerated: ["maybe"] },
      { commercial: "allowed" },
      { origin: ["bundled"] },
      { license: [1] },
      null,
      [],
      "owned",
    ]) {
      expect(normalizeStudioBg3dAssetRightsFacets(bad)).toBeNull();
    }
  });

  it("reports whether any facet would filter anything", () => {
    expect(hasActiveStudioBg3dAssetRightsFacets(undefined)).toBe(false);
    expect(hasActiveStudioBg3dAssetRightsFacets({})).toBe(false);
    expect(hasActiveStudioBg3dAssetRightsFacets({ license: [] })).toBe(false);
    expect(hasActiveStudioBg3dAssetRightsFacets({ aiTraining: ["allowed"] })).toBe(true);
  });
});

describe("queryStudioBg3dAssetRights", () => {
  it("returns everything the base query returns when no rights facet is on", () => {
    for (const rights of [undefined, {}, { license: [], commercial: [], aiGenerated: [], aiTraining: [] }]) {
      expect(queryStudioBg3dAssetRights(assets, { rights })).toEqual(queryStudioBg3dAssetMetadata(assets, {}));
    }
    expect(queryStudioBg3dAssetRights(assets)).toHaveLength(assets.length);
  });

  it("uses OR inside one facet and AND between facets", () => {
    expect(hashesOf(queryStudioBg3dAssetRights(assets, { rights: { license: ["owned", "public-domain"] } })))
      .toEqual(["b", "c"]);
    expect(hashesOf(queryStudioBg3dAssetRights(assets, {
      rights: { license: ["owned", "licensed", "public-domain"], commercial: ["allowed"], aiGenerated: ["yes"] },
    }))).toEqual(["b"]);
    expect(hashesOf(queryStudioBg3dAssetRights(assets, { rights: { aiTraining: ["allowed", "prohibited"] } })))
      .toEqual(["b", "c"]);
  });

  it("treats unconfirmed as its own selectable value and never matches it to a known one", () => {
    expect(hashesOf(queryStudioBg3dAssetRights(assets, { rights: { license: ["unknown"] } }))).toEqual(["e", "f"]);
    expect(hashesOf(queryStudioBg3dAssetRights(assets, { rights: { commercial: ["unknown"] } }))).toEqual(["e", "f"]);
    expect(hashesOf(queryStudioBg3dAssetRights(assets, { rights: { aiGenerated: ["unknown"] } })))
      .toEqual(["c", "d", "e"]);
    expect(hashesOf(queryStudioBg3dAssetRights(assets, { rights: { commercial: ["allowed"] } })))
      .not.toContain("e");
  });

  it("returns an empty result for a combination nobody satisfies, without throwing", () => {
    expect(queryStudioBg3dAssetRights(assets, { rights: { license: ["owned"], aiGenerated: ["no"] } })).toEqual([]);
  });

  it("composes with the base metadata query (search, format facets, sort)", () => {
    const formatted = [...assets, record("9", { status: "owned", commercialUse: true, teamShareAllowed: false }, { format: "obj", name: "책상 소품" })];
    expect(hashesOf(queryStudioBg3dAssetRights(formatted, {
      facets: { format: ["obj"] },
      rights: { license: ["owned"] },
    }))).toEqual(["9"]);
    expect(hashesOf(queryStudioBg3dAssetRights(formatted, { search: "책상", rights: { commercial: ["allowed"] } })))
      .toEqual(["9"]);
    expect(queryStudioBg3dAssetRights(formatted, { sort: "name", rights: { license: ["owned"] } }).map(({ name }) => name))
      .toEqual(["소재 b", "책상 소품"]);
  });

  it("fails closed on invalid rights facets and invalid queries", () => {
    expect(queryStudioBg3dAssetRights(assets, { rights: { license: ["gpl"] } } as never)).toEqual([]);
    expect(queryStudioBg3dAssetRights(assets, "owned" as never)).toEqual([]);
    expect(queryStudioBg3dAssetRights(assets, { sort: "random" } as never)).toEqual([]);
  });

  it("does not mutate its input and returns an immutable list", () => {
    const source = Object.freeze([...assets]);
    const result = queryStudioBg3dAssetRights(source, { rights: { license: ["owned"] } });
    expect(Object.isFrozen(result)).toBe(true);
    expect(source).toHaveLength(assets.length);
  });
});

describe("studioBg3dAssetRightsFacetsAdmitUnknown", () => {
  const values = {
    license: ["owned", "unknown"],
    commercial: ["allowed", "unknown"],
    aiGenerated: ["yes", "unknown"],
    aiTraining: ["allowed", "unknown"],
  } as const;

  it("admits an all-unknown asset exactly when every active facet includes the unconfirmed value", () => {
    expect(studioBg3dAssetRightsFacetsAdmitUnknown(undefined)).toBe(true);
    expect(studioBg3dAssetRightsFacetsAdmitUnknown({})).toBe(true);
    expect(studioBg3dAssetRightsFacetsAdmitUnknown({ license: ["owned"] })).toBe(false);
    expect(studioBg3dAssetRightsFacetsAdmitUnknown({ license: ["owned", "unknown"] })).toBe(true);
    expect(studioBg3dAssetRightsFacetsAdmitUnknown({ license: ["unknown"], aiGenerated: ["no"] })).toBe(false);
  });

  it("agrees with the real query for every combination of chosen facets", () => {
    const keys = Object.keys(values) as (keyof typeof values)[];
    for (let mask = 0; mask < 3 ** keys.length; mask += 1) {
      const facets: Record<string, string[]> = {};
      let rest = mask;
      for (const key of keys) {
        const choice = rest % 3; // 0: 끔, 1: 확인된 값만, 2: 확인된 값 + 미확인
        rest = Math.floor(rest / 3);
        if (choice === 1) facets[key] = [values[key][0]];
        if (choice === 2) facets[key] = [...values[key]];
      }
      const typed = facets as StudioBg3dAssetRightsFacets;
      const viaQuery = queryStudioBg3dAssetRights([unconfirmed], { rights: typed }).length === 1;
      expect(studioBg3dAssetRightsFacetsAdmitUnknown(typed)).toBe(viaQuery);
      expect(matchesStudioBg3dAssetRightsFacets(UNKNOWN_STUDIO_BG3D_ASSET_RIGHTS_STATE, typed)).toBe(viaQuery);
    }
  });
});
