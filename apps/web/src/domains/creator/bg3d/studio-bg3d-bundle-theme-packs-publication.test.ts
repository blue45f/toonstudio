import { beforeEach, describe, expect, it } from "vitest";

import {
  getLoadedStudioBg3dBundleThemePacks,
  getStudioBg3dBundleThemePacksPublicationRevision,
  loadStudioBg3dBundleThemePacks,
  resetStudioBg3dBundleThemePacksCache,
} from "./studio-bg3d-bundle-theme-packs";

function rawCatalog(commercialUse = true) {
  return {
    schema: "toonstudio.bg3d-bundle-theme-packs.v1", version: 1, inServiceOnly: true, downloadable: false,
    rights: { holder: "합성 테스트", inServiceOnly: true, downloadable: false },
    assetRoot: "/assets/studio/bundle-v2/", themes: [],
    packs: [{ catalogIds: ["cbv1-008-unit-publication"], title: "합성 팩", creator: "테스트", theme: null, category: "prop",
      ingestPackIds: ["unit-pack"], placeable: 1, twinCovered: 0,
      deferred: { fbx: 0, gltf: 0, blend: 0, overBudget: {} },
      rights: { serve: "allow", status: "public-domain", licenseName: "합성 테스트 CC0", commercialUse, attributionRequired: false }, note: null }],
    assets: [{ id: "cbv1-ingest-unit-publication", pack: 0, path: "unit-pack/model.glb", bytes: 64, sha256: "a".repeat(64), tris: 0 }],
    presets: [], crowdPacks: [], pendingPacks: [],
    totals: { packs: 1, placeableAssets: 1, presets: 0, crowdGlbAssets: 0, deferredAssets: 0 },
  };
}
function response(value = rawCatalog()): Response {
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
}
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("준비하지 않은 gate입니다."); };
  const promise = new Promise<T>(finish => { resolve = finish; });
  return { promise, resolve };
}

const PUBLICATION_CATALOG_URL = "/unit-publication-theme-packs.json";

beforeEach(() => { resetStudioBg3dBundleThemePacksCache(); });

describe("명시 mutable catalog의 공개 publication revision", () => {
  it("값이 같은 새 frozen snapshot 재조회는 발행 세대를 바꾸지 않는다", async () => {
    const first = await loadStudioBg3dBundleThemePacks({ url: PUBLICATION_CATALOG_URL, fetcher: async () => response() });
    const revision = getStudioBg3dBundleThemePacksPublicationRevision();
    const second = await loadStudioBg3dBundleThemePacks({ url: PUBLICATION_CATALOG_URL, fetcher: async () => response() });
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
    expect(getLoadedStudioBg3dBundleThemePacks()).toBe(second);
    expect(getStudioBg3dBundleThemePacksPublicationRevision()).toBe(revision);
  });

  it("권리 A→B→동일내용 새 A의 ABA 재발행은 이전 세대로 돌아가지 않는다", async () => {
    const first = await loadStudioBg3dBundleThemePacks({ url: PUBLICATION_CATALOG_URL, fetcher: async () => response(rawCatalog(true)) });
    const a = getStudioBg3dBundleThemePacksPublicationRevision();
    await loadStudioBg3dBundleThemePacks({ url: PUBLICATION_CATALOG_URL, fetcher: async () => response(rawCatalog(false)) });
    const b = getStudioBg3dBundleThemePacksPublicationRevision();
    const restored = await loadStudioBg3dBundleThemePacks({ url: PUBLICATION_CATALOG_URL, fetcher: async () => response(rawCatalog(true)) });
    const nextA = getStudioBg3dBundleThemePacksPublicationRevision();
    expect(b).toBeGreaterThan(a);
    expect(nextA).toBeGreaterThan(b);
    expect(restored).toEqual(first);
    expect(restored).not.toBe(first);
  });

  it("reset은 기존 발행을 무효화하고 다음 같은 값의 로드도 새 세대로 시작한다", async () => {
    await loadStudioBg3dBundleThemePacks({ url: PUBLICATION_CATALOG_URL, fetcher: async () => response() });
    const previous = getStudioBg3dBundleThemePacksPublicationRevision();
    resetStudioBg3dBundleThemePacksCache();
    const reset = getStudioBg3dBundleThemePacksPublicationRevision();
    expect(reset).toBeGreaterThan(previous);
    expect(getLoadedStudioBg3dBundleThemePacks()).toBeNull();
    await loadStudioBg3dBundleThemePacks({ url: PUBLICATION_CATALOG_URL, fetcher: async () => response() });
    expect(getStudioBg3dBundleThemePacksPublicationRevision()).toBeGreaterThan(reset);
  });

  it("검증에 실패한 최신 응답은 기존 catalog를 사용할 수 있는 발행으로 남기지 않는다", async () => {
    await loadStudioBg3dBundleThemePacks({ url: PUBLICATION_CATALOG_URL, fetcher: async () => response() });
    const previous = getStudioBg3dBundleThemePacksPublicationRevision();
    await expect(loadStudioBg3dBundleThemePacks({ url: PUBLICATION_CATALOG_URL, fetcher: async () => response({ ...rawCatalog(), downloadable: true }) })).rejects.toThrow();
    expect(getLoadedStudioBg3dBundleThemePacks()).toBeNull();
    expect(getStudioBg3dBundleThemePacksPublicationRevision()).toBeGreaterThan(previous);
  });

  it("늦게 끝난 이전 요청은 최신 발행과 publication revision을 덮지 않는다", async () => {
    const older = deferred<Response>(); const newer = deferred<Response>();
    const oldTask = loadStudioBg3dBundleThemePacks({ url: PUBLICATION_CATALOG_URL, fetcher: () => older.promise });
    const newTask = loadStudioBg3dBundleThemePacks({ url: PUBLICATION_CATALOG_URL, fetcher: () => newer.promise });
    newer.resolve(response(rawCatalog(false)));
    const accepted = await newTask;
    const revision = getStudioBg3dBundleThemePacksPublicationRevision();
    older.resolve(response(rawCatalog(true)));
    await oldTask;
    expect(getLoadedStudioBg3dBundleThemePacks()).toBe(accepted);
    expect(getStudioBg3dBundleThemePacksPublicationRevision()).toBe(revision);
  });
});
