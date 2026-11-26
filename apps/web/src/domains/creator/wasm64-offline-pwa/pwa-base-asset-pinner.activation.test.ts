import { describe, expect, it, vi } from "vitest";

import { PwaBaseAssetPinner } from "./pwa-base-asset-pinner";
import {
  PWA_BASE_CACHE_PREFIX,
  PWA_BASE_STAGING_CACHE_PREFIX,
  createInMemoryCacheStorage,
  type PwaBaseAssetPinnerOptions,
} from "./pwa-base-asset-pinner-guards";

const ASSET_URL = "/manifest.json";
const OLD_CACHE = `${PWA_BASE_CACHE_PREFIX}v1`;
const NEXT_CACHE = `${PWA_BASE_CACHE_PREFIX}v2`;

async function cachedVersions(options: Partial<PwaBaseAssetPinnerOptions> = {}) {
  const cacheStorage = createInMemoryCacheStorage();
  await (await cacheStorage.open(OLD_CACHE)).put(ASSET_URL, Response.json({ version: "v1" }));
  await (await cacheStorage.open(NEXT_CACHE)).put(ASSET_URL, Response.json({ version: "v2" }));
  let generation: string | null = "v1";
  const generationStore = { get: () => generation, set: vi.fn((value: string | null) => { generation = value; }) };
  const fetchFn = vi.fn<typeof fetch>(async () => { throw new Error("캐시된 세대에 네트워크 호출을 허용하지 않는다."); });
  const onActivate = vi.fn();
  const pinner = new PwaBaseAssetPinner({
    versionHash: "v2", cacheStorage, generationStore, fetchFn, onActivate,
    assets: [{ url: ASSET_URL, kind: "manifest", validateJson: true }],
    ...options,
  });
  return { pinner, cacheStorage, generationStore, fetchFn, onActivate };
}

describe("이미 캐시된 PWA 세대의 안전한 활성화", () => {
  it.each(["activation", "dirty", "both", "override"])("%s 게이트가 닫혀 있으면 v1을 보존하고 저장·유휴 이후 v2로 전환한다", async (guard) => {
    let allowed = guard !== "activation" && guard !== "both";
    let dirty = guard === "dirty" || guard === "both";
    const { pinner, cacheStorage, generationStore, fetchFn, onActivate } = await cachedVersions({
      canActivateNow: () => allowed,
      hasUnsavedCanvasEdits: () => dirty,
    });
    pinner.setHasUnsavedCanvasEdits(guard === "override");

    expect(await pinner.pinAll()).toMatchObject({
      ok: true, status: "staged-pending-activation", activationDeferred: true,
      activeVersionHash: "v1", pendingActivationVersion: "v2", fetchCalls: 0, cacheHits: 1,
      prunedCacheNames: [], pinnedAssets: [{ url: ASSET_URL, source: "cache" }],
    });
    expect(generationStore.get()).toBe("v1");
    expect(generationStore.set).not.toHaveBeenCalled();
    expect(onActivate).not.toHaveBeenCalled();
    expect(await cacheStorage.has(OLD_CACHE)).toBe(true);
    expect(await cacheStorage.has(NEXT_CACHE)).toBe(true);
    expect(await cacheStorage.has(`${PWA_BASE_STAGING_CACHE_PREFIX}v2`)).toBe(false);
    expect(await (await pinner.matchPinnedAsset(ASSET_URL))?.json()).toEqual({ version: "v1" });
    expect(await pinner.flushPendingActivation()).toMatchObject({
      activated: false, reason: "unsaved-canvas-edits", activeVersionHash: "v1", pendingActivationVersion: "v2",
    });

    allowed = true;
    if (guard === "both") {
      expect(await pinner.flushPendingActivation()).toMatchObject({ activated: false, pendingActivationVersion: "v2" });
    }
    dirty = false;
    pinner.setHasUnsavedCanvasEdits(false);
    expect(await pinner.flushPendingActivation()).toMatchObject({
      activated: true, reason: "activated", activeVersionHash: "v2", pendingActivationVersion: null,
      prunedCacheNames: [OLD_CACHE],
    });
    expect(generationStore.get()).toBe("v2");
    expect(generationStore.set).toHaveBeenCalledExactlyOnceWith("v2");
    expect(await cacheStorage.has(OLD_CACHE)).toBe(false);
    expect(await (await pinner.matchPinnedAsset(ASSET_URL))?.json()).toEqual({ version: "v2" });
    expect(onActivate).toHaveBeenCalledExactlyOnceWith({ versionHash: "v2", cacheName: NEXT_CACHE, previousVersionHash: "v1" });
    expect(await pinner.flushPendingActivation()).toMatchObject({ activated: false, reason: "no-pending-activation" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("다시 pinAll을 호출해도 게이트를 지키고 해제 이후 대기 세대와 콜백을 한 번만 완료한다", async () => {
    let allowed = false;
    const { pinner, generationStore, fetchFn, onActivate } = await cachedVersions({ canActivateNow: () => allowed });
    await pinner.pinAll();
    expect(await pinner.pinAll()).toMatchObject({ activeVersionHash: "v1", pendingActivationVersion: "v2", activationDeferred: true });
    expect(generationStore.set).not.toHaveBeenCalled();
    allowed = true;
    expect(await pinner.pinAll()).toMatchObject({ status: "already-pinned", activeVersionHash: "v2", pendingActivationVersion: null });
    expect(await pinner.pinAll()).toMatchObject({ status: "already-pinned", activeVersionHash: "v2", pendingActivationVersion: null });
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("같은 활성 세대의 캐시를 다시 보류했다가 해제해도 활성화 콜백을 중복 실행하지 않는다", async () => {
    const { pinner, onActivate, fetchFn } = await cachedVersions();
    await pinner.pinAll();
    expect(onActivate).toHaveBeenCalledTimes(1);
    pinner.setHasUnsavedCanvasEdits(true);
    expect(await pinner.pinAll()).toMatchObject({ activeVersionHash: "v2", pendingActivationVersion: "v2", activationDeferred: true });
    pinner.setHasUnsavedCanvasEdits(false);
    expect(await pinner.flushPendingActivation()).toMatchObject({ activated: true, activeVersionHash: "v2", pendingActivationVersion: null });
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each(["evicted", "corrupted"])("대기 중 v2가 %s 상태가 되면 v1 포인터와 에셋을 보존한다", async (failure) => {
    let allowed = false;
    const { pinner, cacheStorage, generationStore, onActivate, fetchFn } = await cachedVersions({ canActivateNow: () => allowed });
    await pinner.pinAll();
    if (failure === "evicted") await cacheStorage.delete(NEXT_CACHE);
    else await (await cacheStorage.open(NEXT_CACHE)).put(ASSET_URL, new Response("broken JSON", { headers: { "content-type": "application/json" } }));
    allowed = true;

    expect(await pinner.flushPendingActivation()).toMatchObject({ activated: false, reason: "staging-missing", activeVersionHash: "v1" });
    expect(generationStore.get()).toBe("v1");
    expect(generationStore.set).not.toHaveBeenCalled();
    expect(await (await pinner.matchPinnedAsset(ASSET_URL))?.json()).toEqual({ version: "v1" });
    expect(onActivate).not.toHaveBeenCalled();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
