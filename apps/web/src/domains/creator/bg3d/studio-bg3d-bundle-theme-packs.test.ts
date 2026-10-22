import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_BUNDLE_DEPLOY_INDEX_URL,
  STUDIO_BG3D_BUNDLE_THEME_PACKS_URL,
  countStudioBg3dBundlePackDeferred,
  findStudioBg3dBundleAsset,
  findStudioBg3dBundleAssetByHash,
  isStudioBg3dBundleAssetId,
  loadStudioBg3dBundleDeployAvailability,
  loadStudioBg3dBundleThemePacks,
  parseStudioBg3dBundleThemePacks,
  resetStudioBg3dBundleThemePacksCache,
  studioBg3dBundleAssetUrl,
} from "./studio-bg3d-bundle-theme-packs";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

function validRawThemePacks(): Record<string, unknown> {
  return {
    schema: "toonstudio.bg3d-bundle-theme-packs.v1",
    version: 1,
    inServiceOnly: true,
    downloadable: false,
    rights: { holder: "Test Holder", inServiceOnly: true, downloadable: false },
    assetRoot: "/assets/studio/bundle-v2/",
    themes: [{ id: "city", label: "도시" }],
    packs: [{
      catalogIds: ["cbv1-001-test"],
      title: "Test Pack",
      creator: "Tester",
      theme: "city",
      category: "environment",
      ingestPackIds: ["test-pack"],
      placeable: 1,
      twinCovered: 0,
      deferred: { fbx: 1, gltf: 0, blend: 0, overBudget: {} },
      rights: {
        serve: "allow",
        status: "licensed",
        licenseName: "Creator Bundle: Volume 1 — Test License",
        commercialUse: true,
        attributionRequired: false,
      },
      note: null,
    }],
    assets: [{
      id: "cbv1-ingest-test-001",
      pack: 0,
      path: "test-pack/scene.glb",
      bytes: 128,
      sha256: SHA_A,
      tris: 12,
    }],
    presets: [{ id: "bundle-preset-test", label: "Test — 완성 장면", theme: "city", pack: 0, asset: 0 }],
    crowdPacks: [],
    pendingPacks: [],
    totals: { packs: 1, placeableAssets: 1, presets: 1, crowdGlbAssets: 0, deferredAssets: 1 },
  };
}

function mutate(fn: (raw: Record<string, unknown>) => void): Record<string, unknown> {
  const raw = validRawThemePacks();
  fn(raw);
  return raw;
}

describe("parseStudioBg3dBundleThemePacks", () => {
  it("accepts a well-formed in-service-only document and freezes it", () => {
    const data = parseStudioBg3dBundleThemePacks(validRawThemePacks());
    expect(data.inServiceOnly).toBe(true);
    expect(data.downloadable).toBe(false);
    expect(data.assets[0]?.sha256).toBe(`sha256:${SHA_A}`);
    expect(data.presets[0]?.packIndex).toBe(0);
    expect(data.presets[0]?.assetIndex).toBe(0);
    expect(Object.isFrozen(data)).toBe(true);
    expect(Object.isFrozen(data.assets)).toBe(true);
    expect(data.packs[0]?.rights).toEqual({
      serve: "allow",
      status: "licensed",
      licenseName: "Creator Bundle: Volume 1 — Test License",
      commercialUse: true,
      attributionRequired: false,
    });
    expect(Object.isFrozen(data.packs[0]?.rights)).toBe(true);
  });

  it("treats a pack without a rights block as a pre-ledger snapshot (rights: null)", () => {
    const data = parseStudioBg3dBundleThemePacks(mutate((raw) => {
      delete (raw.packs as Record<string, unknown>[])[0]?.rights;
    }));
    expect(data.packs[0]?.rights).toBeNull();
  });

  it("keeps restrictive pack rights exactly as written instead of normalizing them to the defaults", () => {
    // 기본값(상업 이용 가능·출처 표기 불필요)과 다른 값이 그대로 전달돼야 한다 — 권리를 넓히는 정규화가 없다.
    const data = parseStudioBg3dBundleThemePacks(mutate((raw) => {
      const rights = ((raw.packs as Record<string, unknown>[])[0] as Record<string, unknown>).rights as Record<string, unknown>;
      rights.status = "public-domain";
      rights.licenseName = "CC0 1.0";
      rights.commercialUse = false;
      rights.attributionRequired = true;
    }));
    expect(data.packs[0]?.rights).toEqual({
      serve: "allow",
      status: "public-domain",
      licenseName: "CC0 1.0",
      commercialUse: false,
      attributionRequired: true,
    });
  });

  it("rejects pack rights that are not an allowed, well-formed grant", () => {
    const rightsOf = (raw: Record<string, unknown>) => ((raw.packs as Record<string, unknown>[])[0] as Record<string, unknown>).rights as Record<string, unknown>;
    // 서빙이 허용되지 않은 팩은 데이터에 있을 수 없다 (생성기는 hold 팩을 pendingPacks로만 보낸다).
    expect(() => parseStudioBg3dBundleThemePacks(mutate((raw) => { rightsOf(raw).serve = "hold"; }))).toThrow(TypeError);
    expect(() => parseStudioBg3dBundleThemePacks(mutate((raw) => { delete rightsOf(raw).serve; }))).toThrow(TypeError);
    expect(() => parseStudioBg3dBundleThemePacks(mutate((raw) => { rightsOf(raw).status = "owned"; }))).toThrow(TypeError);
    expect(() => parseStudioBg3dBundleThemePacks(mutate((raw) => { rightsOf(raw).status = "unknown"; }))).toThrow(TypeError);
    expect(() => parseStudioBg3dBundleThemePacks(mutate((raw) => { rightsOf(raw).licenseName = ""; }))).toThrow(TypeError);
    expect(() => parseStudioBg3dBundleThemePacks(mutate((raw) => { rightsOf(raw).commercialUse = "yes"; }))).toThrow(TypeError);
    expect(() => parseStudioBg3dBundleThemePacks(mutate((raw) => { rightsOf(raw).downloadUrl = "https://example.invalid/x.glb"; }))).toThrow(TypeError);
    expect(() => parseStudioBg3dBundleThemePacks(mutate((raw) => {
      (raw.packs as Record<string, unknown>[])[0]!.rights = "allow";
    }))).toThrow(TypeError);
  });

  it("rejects a document that is not declared in-service-only", () => {
    expect(() => parseStudioBg3dBundleThemePacks(mutate((raw) => { raw.downloadable = true; }))).toThrow(TypeError);
    expect(() => parseStudioBg3dBundleThemePacks(mutate((raw) => {
      (raw.rights as Record<string, unknown>).inServiceOnly = false;
    }))).toThrow(TypeError);
  });

  it("rejects download route fields anywhere in the document", () => {
    expect(() => parseStudioBg3dBundleThemePacks(mutate((raw) => {
      ((raw.assets as Record<string, unknown>[])[0] as Record<string, unknown>).downloadUrl = "https://example.invalid/x.glb";
    }))).toThrow(TypeError);
    expect(() => parseStudioBg3dBundleThemePacks(mutate((raw) => {
      ((raw.assets as Record<string, unknown>[])[0] as Record<string, unknown>).downloadable = true;
    }))).toThrow(TypeError);
    expect(() => parseStudioBg3dBundleThemePacks(mutate((raw) => {
      ((raw.packs as Record<string, unknown>[])[0] as Record<string, unknown>).original = "pack.zip";
    }))).toThrow(TypeError);
  });

  it("rejects asset paths outside the owning pack prefix and path escapes", () => {
    expect(() => parseStudioBg3dBundleThemePacks(mutate((raw) => {
      ((raw.assets as Record<string, unknown>[])[0] as Record<string, unknown>).path = "other-pack/scene.glb";
    }))).toThrow(TypeError);
    expect(() => parseStudioBg3dBundleThemePacks(mutate((raw) => {
      ((raw.assets as Record<string, unknown>[])[0] as Record<string, unknown>).path = "test-pack/../secret.glb";
    }))).toThrow(TypeError);
    expect(() => parseStudioBg3dBundleThemePacks(mutate((raw) => {
      ((raw.assets as Record<string, unknown>[])[0] as Record<string, unknown>).path = "/test-pack/scene.glb";
    }))).toThrow(TypeError);
  });

  it("rejects duplicate asset ids, malformed hashes and dangling preset references", () => {
    expect(() => parseStudioBg3dBundleThemePacks(mutate((raw) => {
      (raw.assets as unknown[]).push({ ...(raw.assets as Record<string, unknown>[])[0] });
    }))).toThrow(TypeError);
    expect(() => parseStudioBg3dBundleThemePacks(mutate((raw) => {
      ((raw.assets as Record<string, unknown>[])[0] as Record<string, unknown>).sha256 = "zz";
    }))).toThrow(TypeError);
    expect(() => parseStudioBg3dBundleThemePacks(mutate((raw) => {
      const packs = raw.packs as Record<string, unknown>[];
      packs.push({ ...packs[0], title: "Second", ingestPackIds: ["second-pack"] });
      (raw.assets as Record<string, unknown>[]).push({
        id: "cbv1-ingest-test-002", pack: 1, path: "second-pack/a.glb", bytes: 64, sha256: SHA_B, tris: 1,
      });
      ((raw.presets as Record<string, unknown>[])[0] as Record<string, unknown>).asset = 1;
    }))).toThrow(TypeError);
  });
});

describe("loadStudioBg3dBundleThemePacks + lookups", () => {
  beforeEach(() => {
    resetStudioBg3dBundleThemePacksCache();
  });

  it("resolves assets by id and hash only after a load, with prefix fallback before it", async () => {
    expect(isStudioBg3dBundleAssetId("cbv1-ingest-test-001")).toBe(true);
    expect(isStudioBg3dBundleAssetId("local-model-1")).toBe(false);
    expect(findStudioBg3dBundleAsset("cbv1-ingest-test-001")).toBeNull();

    const fetcher = async () => ({
      ok: true,
      status: 200,
      json: async () => validRawThemePacks(),
    });
    const data = await loadStudioBg3dBundleThemePacks({ fetcher });
    expect(data.packs).toHaveLength(1);
    const asset = findStudioBg3dBundleAsset("cbv1-ingest-test-001");
    expect(asset?.path).toBe("test-pack/scene.glb");
    expect(findStudioBg3dBundleAssetByHash(`sha256:${SHA_A}`)?.id).toBe("cbv1-ingest-test-001");
    expect(isStudioBg3dBundleAssetId("cbv1-ingest-unknown-999")).toBe(false);
    if (!asset) return;
    expect(studioBg3dBundleAssetUrl(asset, data)).toBe(`/assets/studio/bundle-v2/${SHA_A}.glb`);
  });

  it("builds serving URLs from the sha256 key, never from the original folder or file name", async () => {
    const raw = validRawThemePacks();
    ((raw.assets as Record<string, unknown>[])[0] as Record<string, unknown>).path = "test-pack/My Scene #1.glb";
    const fetcher = async () => ({ ok: true, status: 200, json: async () => raw });
    const data = await loadStudioBg3dBundleThemePacks({ fetcher });
    const asset = findStudioBg3dBundleAsset("cbv1-ingest-test-001");
    if (!asset) throw new Error("fixture asset missing");
    const url = studioBg3dBundleAssetUrl(asset, data);
    expect(url).toBe(`/assets/studio/bundle-v2/${SHA_A}.glb`);
    expect(url).not.toContain("My");
    expect(url).not.toContain("test-pack");
    expect(studioBg3dBundleAssetUrl(asset, { assetRoot: "/assets/studio/bundle-v2" })).toBe(url);
  });
});

describe("loadStudioBg3dBundleDeployAvailability", () => {
  const data = parseStudioBg3dBundleThemePacks(validRawThemePacks());
  const indexFetcher = (body: unknown, ok = true) => async (input: RequestInfo | URL) => {
    expect(String(input)).toBe(STUDIO_BG3D_BUNDLE_DEPLOY_INDEX_URL);
    return { ok, status: ok ? 200 : 404, json: async () => body };
  };

  it("is available only when the deploy index matches the theme-pack totals", async () => {
    const matching = {
      schema: "toonstudio.bundle-v2-deploy-index.v1", version: 1, files: 1, bytes: 128, packs: 1,
      keyScheme: "sha256",
    };
    await expect(loadStudioBg3dBundleDeployAvailability(data, { fetcher: indexFetcher(matching) }))
      .resolves.toBe("available");
    await expect(loadStudioBg3dBundleDeployAvailability(data, {
      fetcher: indexFetcher({ ...matching, files: 2 }),
    })).resolves.toBe("unavailable");
    await expect(loadStudioBg3dBundleDeployAvailability(data, {
      fetcher: indexFetcher({ ...matching, bytes: 129 }),
    })).resolves.toBe("unavailable");
    await expect(loadStudioBg3dBundleDeployAvailability(data, {
      fetcher: indexFetcher({ ...matching, schema: "other" }),
    })).resolves.toBe("unavailable");
  });

  it("is unavailable when the index was uploaded with another key scheme, even if the totals match", async () => {
    // 옛 경로형 키로 올라간 인덱스(keyScheme 없음)는 합계가 같아도 로더가 요청하는 sha256 URL의 객체를 가리키지 못한다.
    const legacy = { schema: "toonstudio.bundle-v2-deploy-index.v1", version: 1, files: 1, bytes: 128, packs: 1 };
    await expect(loadStudioBg3dBundleDeployAvailability(data, { fetcher: indexFetcher(legacy) }))
      .resolves.toBe("unavailable");
    for (const keyScheme of ["path", "SHA256", "", null, 256]) {
      await expect(loadStudioBg3dBundleDeployAvailability(data, {
        fetcher: indexFetcher({ ...legacy, keyScheme }),
      })).resolves.toBe("unavailable");
    }
  });

  it("treats a missing index and fetch failures as unavailable, never available", async () => {
    await expect(loadStudioBg3dBundleDeployAvailability(data, { fetcher: indexFetcher(null, false) }))
      .resolves.toBe("unavailable");
    const throwing = async () => { throw new Error("network down"); };
    await expect(loadStudioBg3dBundleDeployAvailability(data, { fetcher: throwing }))
      .resolves.toBe("unavailable");
  });
});

describe("shipped theme-packs.json invariants", () => {
  const raw = JSON.parse(readFileSync(
    new URL("../../../../public/assets/3d/environments/bundle-v1/theme-packs.json", import.meta.url),
    "utf8",
  )) as unknown;

  it("parses with the production parser and keeps totals consistent", () => {
    const data = parseStudioBg3dBundleThemePacks(raw);
    expect(data.totals.packs).toBe(data.packs.length);
    expect(data.totals.placeableAssets).toBe(data.assets.length);
    expect(data.totals.presets).toBe(data.presets.length);
    expect(data.totals.crowdGlbAssets).toBe(
      data.crowdPacks.reduce((sum, pack) => sum + pack.glbAssets, 0),
    );
    expect(data.totals.deferredAssets).toBe(
      data.packs.reduce((sum, pack) => sum + countStudioBg3dBundlePackDeferred(pack), 0),
    );
    expect(data.packs.reduce((sum, pack) => sum + pack.placeable, 0)).toBe(data.assets.length);
  });

  it("is either entirely pre-ledger (no pack rights) or entirely ledger-gated (every pack allowed)", () => {
    const data = parseStudioBg3dBundleThemePacks(raw);
    const withRights = data.packs.filter((pack) => pack.rights !== null);
    expect([0, data.packs.length]).toContain(withRights.length);
    expect(withRights.every((pack) => pack.rights?.serve === "allow")).toBe(true);
  });

  it("keeps every preset pointing at an asset of the same pack", () => {
    const data = parseStudioBg3dBundleThemePacks(raw);
    for (const preset of data.presets) {
      expect(data.assets[preset.assetIndex]?.packIndex).toBe(preset.packIndex);
    }
  });

  it("separates crowd packs from placeable packs and covers the nine themes", () => {
    const data = parseStudioBg3dBundleThemePacks(raw);
    expect(data.crowdPacks.every((pack) => pack.category === "crowd-render-only")).toBe(true);
    expect(data.packs.every((pack) => pack.category === "environment" || pack.category === "prop")).toBe(true);
    expect(data.themes.map((theme) => theme.id)).toEqual([
      "city", "medieval-fantasy", "nature", "interior", "sci-fi", "horror",
      "desert-tropical", "swamp", "other",
    ]);
    expect(STUDIO_BG3D_BUNDLE_THEME_PACKS_URL).toBe("/assets/3d/environments/bundle-v1/theme-packs.json");
  });
});
