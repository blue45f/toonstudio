import { bindConsumerReleaseFixture, consumerReleaseFixture, isConsumerCatalogUrl } from "./studio-bg3d-bundle-release-consumer.test-fixture";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Bg3dVerifiedStoredRecord } from "./bg3d-model-library";
import {
  loadStudioBg3dBundleAssetBytes,
  loadStudioBg3dBundleThemePackRecord,
  loadStudioBg3dBundleThemePackRecordByHash,
  releaseStudioBg3dBundleAssetBytes,
  resolveStudioBg3dBundleRecordSource,
  resolveStudioBg3dBundleRecordSourceByHash,
  studioBg3dBundleAssetRights,
  type StudioBg3dBundleRecordPreparer,
} from "./studio-bg3d-bundle-asset-loader";
import {
  findStudioBg3dBundleAsset,
  loadStudioBg3dBundleThemePacks,
  parseStudioBg3dBundleThemePacks,
  resetStudioBg3dBundleThemePacksCache,
  type StudioBg3dBundleThemePacks,
} from "./studio-bg3d-bundle-theme-packs";

const SHA_1 = "c".repeat(64);
const SHA_2 = "d".repeat(64);
const TEST_PACK_LICENSE_NAME = "Creator Bundle: Volume 1 — Test Pack License";
const TEST_PACK_RIGHTS = {
  serve: "allow",
  status: "licensed",
  licenseName: TEST_PACK_LICENSE_NAME,
  commercialUse: true,
  attributionRequired: false,
} as const;
const JSON_CHUNK = 0x4e4f534a;

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, true);
}

function validGlb(sceneName?: string): Uint8Array {
  const encodedJson = new TextEncoder().encode(JSON.stringify({
    asset: { version: "2.0" },
    scenes: [sceneName ? { name: sceneName } : {}],
  }));
  const json = new Uint8Array(Math.ceil(encodedJson.byteLength / 4) * 4);
  json.fill(0x20);
  json.set(encodedJson);
  const bytes = new Uint8Array(12 + 8 + json.byteLength);
  writeUint32(bytes, 0, 0x46546c67);
  writeUint32(bytes, 4, 2);
  writeUint32(bytes, 8, bytes.byteLength);
  writeUint32(bytes, 12, json.byteLength);
  writeUint32(bytes, 16, JSON_CHUNK);
  bytes.set(json, 20);
  return bytes;
}

const GLB = validGlb();

function rawThemePacks(): Record<string, unknown> {
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
      placeable: 2,
      twinCovered: 0,
      deferred: { fbx: 0, gltf: 0, blend: 0, overBudget: {} },
      rights: TEST_PACK_RIGHTS,
      note: null,
    }],
    assets: [
      { id: "cbv1-ingest-test-001", pack: 0, path: "test-pack/one.glb", bytes: GLB.byteLength, sha256: SHA_1, tris: 3 },
      { id: "cbv1-ingest-test-002", pack: 0, path: "test-pack/two.glb", bytes: GLB.byteLength, sha256: SHA_2, tris: 5 },
    ],
    presets: [],
    crowdPacks: [],
    pendingPacks: [],
    totals: { packs: 1, placeableAssets: 2, presets: 0, crowdGlbAssets: 0, deferredAssets: 0 },
  };
}

function loadFixtureData(): Promise<StudioBg3dBundleThemePacks> {
  return loadStudioBg3dBundleThemePacks({
    release: null,
    fetcher: async () => ({ ok: true, status: 200, json: async () => rawThemePacks() }),
  });
}

function stubGlbFetch(bytes: Uint8Array): void {
  vi.stubGlobal("fetch", vi.fn(async () => ({
    ok: true,
    status: 200,
    headers: new Headers(),
    arrayBuffer: async () => Uint8Array.from(bytes).buffer as ArrayBuffer,
  })));
}

/** 테마 팩 데이터와 GLB 바이트를 URL로 구분해 돌려주는 프로덕션형 라우터. */
function stubFetchRouter(glbBytes: Uint8Array): void {
  bindConsumerReleaseFixture(rawThemePacks);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (isConsumerCatalogUrl(String(input))) {
      return consumerReleaseFixture(rawThemePacks()).catalogResponse();
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      arrayBuffer: async () => Uint8Array.from(glbBytes).buffer as ArrayBuffer,
    };
  }));
}

beforeEach(() => {
  resetStudioBg3dBundleThemePacksCache();
});

function changingFixture(suffix: string) {
  const raw = rawThemePacks();
  const id = `cbv1-ingest-cache-${suffix}`;
  const original = (raw.assets as Record<string, unknown>[])[0];
  raw.assets = [{ ...original, id }];
  (raw.packs as Record<string, unknown>[])[0] = { ...(raw.packs as Record<string, unknown>[])[0], placeable: 1 };
  raw.totals = { packs: 1, placeableAssets: 1, presets: 0, crowdGlbAssets: 0, deferredAssets: 0 };
  bindConsumerReleaseFixture(() => raw);
  let bytes = GLB;
  const fetcher = vi.fn(async (url: RequestInfo | URL) => isConsumerCatalogUrl(String(url))
    ? consumerReleaseFixture(raw).catalogResponse() : new Response(Uint8Array.from(bytes)));
  vi.stubGlobal("fetch", fetcher);
  return { raw, id, fetcher, setBytes: (next: Uint8Array) => { bytes = next; } };
}

function fixtureRecord(...[input, options]: Parameters<StudioBg3dBundleRecordPreparer>): Bg3dVerifiedStoredRecord {
  return { id: options.idFactory?.(), contentHash: input.expectedSha256, rights: input.rights } as unknown as Bg3dVerifiedStoredRecord;
}

function deferred<T>() {
  let finish: ((value: T) => void) | undefined;
  const pending = new Promise<T>((resolve) => { finish = resolve; });
  return { pending, resolve: (value: T) => { if (!finish) throw new Error("지연 fixture가 없습니다."); finish(value); } };
}

describe("같은 ID의 현재 출처·본문·권리와 캐시 정합", () => {
  it("다른 응답이 전역 색인을 바꿔도 반환된 같은 스냅샷의 에셋·팩 권리를 해석한다", async () => {
    const fixture = changingFixture("snapshot");
    const newerRaw = structuredClone(fixture.raw);
    const pack = (newerRaw.packs as Record<string, unknown>[])[0];
    newerRaw.packs = [{ ...pack, catalogIds: ["cbv1-998-other"], ingestPackIds: ["other-pack"], placeable: 0 }, {
      ...pack, title: "다음 스냅샷 팩", rights: { ...TEST_PACK_RIGHTS, licenseName: "다음 라이선스", commercialUse: false },
    }];
    newerRaw.assets = (newerRaw.assets as Record<string, unknown>[]).map((asset) => ({ ...asset, pack: 1, sha256: SHA_2, path: "test-pack/changed.glb" }));
    newerRaw.totals = { packs: 2, placeableAssets: 1, presets: 0, crowdGlbAssets: 0, deferredAssets: 0 };
    const loadData = async () => {
      const first = await loadStudioBg3dBundleThemePacks({ release: null, fetcher: async () => new Response(JSON.stringify(fixture.raw)) });
      await loadStudioBg3dBundleThemePacks({ release: null, fetcher: async () => new Response(JSON.stringify(newerRaw)) });
      return first;
    };
    const byId = await resolveStudioBg3dBundleRecordSource(fixture.id, { loadData });
    const byHash = await resolveStudioBg3dBundleRecordSourceByHash(`sha256:${SHA_1}`, { loadData });
    for (const source of [byId, byHash]) {
      expect(source).toMatchObject({ id: fixture.id, fileName: "one.glb", sha256: `sha256:${SHA_1}`,
        rights: { licenseName: TEST_PACK_LICENSE_NAME, commercialUse: true } });
    }
    expect(findStudioBg3dBundleAsset(fixture.id)?.sha256).toBe(`sha256:${SHA_2}`);
  });

  it("직전 목록에서 철회됐던 ID도 현재 목록을 다시 읽어 재허용을 반영한다", async () => {
    const fixture = changingFixture("renew");
    const originalAssets = fixture.raw.assets;
    const originalPacks = fixture.raw.packs;
    const originalTotals = fixture.raw.totals;
    await loadStudioBg3dBundleThemePacks();
    fixture.raw.assets = [];
    fixture.raw.packs = (originalPacks as Record<string, unknown>[]).map((pack) => ({ ...pack, placeable: 0 }));
    fixture.raw.totals = { packs: 1, placeableAssets: 0, presets: 0, crowdGlbAssets: 0, deferredAssets: 0 };
    await loadStudioBg3dBundleThemePacks();
    expect(findStudioBg3dBundleAsset(fixture.id)).toBeNull();
    fixture.raw.assets = originalAssets;
    fixture.raw.packs = originalPacks;
    fixture.raw.totals = originalTotals;
    expect((await resolveStudioBg3dBundleRecordSource(fixture.id))?.id).toBe(fixture.id);
    expect(fixture.fetcher).toHaveBeenCalledTimes(3);
  });

  it("메타데이터가 갱신되면 같은 바이트의 이전 권리 레코드를 재사용하지 않는다", async () => {
    const fixture = changingFixture("rights");
    const prepare = vi.fn<StudioBg3dBundleRecordPreparer>(async (...args) => fixtureRecord(...args));
    const first = await loadStudioBg3dBundleThemePackRecord(fixture.id, undefined, "worker", prepare);
    const restrictive = { serve: "allow", status: "licensed", licenseName: "갱신된 팩 라이선스", commercialUse: false, attributionRequired: true, attribution: "Test Pack by Tester" };
    (fixture.raw.packs as Record<string, unknown>[])[0] = { ...(fixture.raw.packs as Record<string, unknown>[])[0], rights: restrictive };
    const second = await loadStudioBg3dBundleThemePackRecord(fixture.id, undefined, "worker", prepare);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
    expect(second?.rights).toMatchObject({ commercialUse: false, attributionRequired: true, licenseName: restrictive.licenseName, attribution: restrictive.attribution });
  });

  it.each(["hash", "bytes", "path", "owner"] as const)("%s만 달라져도 이전 검증 레코드를 현재 소스로 반환하지 않는다", async (field) => {
    const fixture = changingFixture(`single-${field}`);
    const prepare = vi.fn<StudioBg3dBundleRecordPreparer>(async (...args) => fixtureRecord(...args));
    const first = await loadStudioBg3dBundleThemePackRecord(fixture.id, undefined, "worker", prepare);
    const assets = fixture.raw.assets as Record<string, unknown>[];
    if (field === "hash") assets[0] = { ...assets[0], sha256: SHA_2 };
    if (field === "bytes") {
      const replacement = validGlb("different byte declaration");
      fixture.setBytes(replacement); assets[0] = { ...assets[0], bytes: replacement.byteLength };
    }
    if (field === "path") assets[0] = { ...assets[0], path: "test-pack/renamed.glb" };
    if (field === "owner") {
      const packs = fixture.raw.packs as Record<string, unknown>[];
      packs[0] = { ...packs[0], catalogIds: ["cbv1-999-changed-owner"] };
    }
    const second = await loadStudioBg3dBundleThemePackRecord(fixture.id, undefined, "worker", prepare);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
  });

  it("출처 문구만 바뀌어도 같은 본문의 검증 레코드를 다시 준비한다", async () => {
    const fixture = changingFixture("attribution-only");
    const packs = fixture.raw.packs;
    if (!Array.isArray(packs)) throw new Error("팩 fixture가 없습니다.");
    packs[0].rights = { ...TEST_PACK_RIGHTS, attributionRequired: true, attribution: "Original Creator" };
    const prepare = vi.fn<StudioBg3dBundleRecordPreparer>(async (...args) => fixtureRecord(...args));
    const first = await loadStudioBg3dBundleThemePackRecord(fixture.id, undefined, "worker", prepare);
    packs[0].rights = { ...packs[0].rights, attribution: "Updated Creator" };
    const second = await loadStudioBg3dBundleThemePackRecord(fixture.id, undefined, "worker", prepare);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(first?.rights.attribution).toBe("Original Creator");
    expect(second?.rights.attribution).toBe("Updated Creator");
    expect(second).not.toBe(first);
  });

  it("바이트 응답도 같은 ID의 다른 요청 URL에서 재사용하지 않는다", async () => {
    const fixture = changingFixture("url");
    await loadStudioBg3dBundleThemePacks();
    const asset = findStudioBg3dBundleAsset(fixture.id);
    if (!asset) throw new Error("해석할 에셋이 없습니다.");
    const fetcher = vi.fn(async () => ({ bytes: GLB, mimeType: "model/gltf-binary" as const }));
    await loadStudioBg3dBundleAssetBytes(asset, "/first.glb", { fetcher });
    await loadStudioBg3dBundleAssetBytes(asset, "/second.glb", { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
    releaseStudioBg3dBundleAssetBytes(asset.id);
  });

  it("같은 ID의 본문 SHA·크기와 경로 교체는 이전 바이트·레코드를 재사용하지 않는다", async () => {
    const fixture = changingFixture("body");
    const prepare = vi.fn<StudioBg3dBundleRecordPreparer>(async (...args) => fixtureRecord(...args));
    const first = await loadStudioBg3dBundleThemePackRecord(fixture.id, undefined, "worker", prepare);
    const replacement = validGlb("replacement");
    fixture.setBytes(replacement);
    (fixture.raw.assets as Record<string, unknown>[])[0] = {
      ...(fixture.raw.assets as Record<string, unknown>[])[0], sha256: SHA_2, bytes: replacement.byteLength, path: "test-pack/replacement.glb",
    };
    const second = await loadStudioBg3dBundleThemePackRecordByHash(`sha256:${SHA_2}`, undefined, "worker", prepare);
    expect(second).not.toBe(first);
    expect(second?.contentHash).toBe(`sha256:${SHA_2}`);
    expect(prepare).toHaveBeenCalledTimes(2);
    const input = prepare.mock.calls[1]?.[0];
    expect(input?.file.name).toBe("replacement.glb");
    expect(input && new Uint8Array(await input.file.arrayBuffer())).toEqual(replacement);
  });

  it("이전 준비가 늦게 끝나도 새 바이트 캐시를 지우거나 낡은 레코드를 반환하지 않는다", async () => {
    const fixture = changingFixture("race");
    const older = deferred<Bg3dVerifiedStoredRecord>();
    const newer = deferred<Bg3dVerifiedStoredRecord>();
    const prepare = vi.fn<StudioBg3dBundleRecordPreparer>()
      .mockImplementationOnce(() => older.pending).mockImplementationOnce(() => newer.pending);
    const first = loadStudioBg3dBundleThemePackRecord(fixture.id, undefined, "worker", prepare);
    const firstOutcome = first.catch((error: unknown) => error);
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    const replacement = validGlb("new race source");
    fixture.setBytes(replacement);
    (fixture.raw.assets as Record<string, unknown>[])[0] = { ...(fixture.raw.assets as Record<string, unknown>[])[0], sha256: SHA_2, bytes: replacement.byteLength };
    const second = loadStudioBg3dBundleThemePackRecord(fixture.id, undefined, "worker", prepare);
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(2));
    const oldArgs = prepare.mock.calls[0]; const newArgs = prepare.mock.calls[1];
    if (!oldArgs || !newArgs) throw new Error("준비 호출이 없습니다.");
    older.resolve(fixtureRecord(...oldArgs));
    expect(await firstOutcome).toBeInstanceOf(TypeError);
    const asset = findStudioBg3dBundleAsset(fixture.id);
    if (!asset) throw new Error("교체한 에셋이 없습니다.");
    const unexpectedFetch = vi.fn(async () => ({ bytes: replacement, mimeType: "model/gltf-binary" as const }));
    await loadStudioBg3dBundleAssetBytes(asset, `/assets/studio/bundle-v2/${SHA_2}.glb`, { fetcher: unexpectedFetch });
    expect(unexpectedFetch).not.toHaveBeenCalled();
    const currentRecord = fixtureRecord(...newArgs);
    newer.resolve(currentRecord);
    expect(await second).toBe(currentRecord);
    expect(await loadStudioBg3dBundleThemePackRecord(fixture.id, undefined, "worker", prepare)).toBe(currentRecord);
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it("목록에서 철회되거나 재설정된 동안 완료된 준비는 레코드로 반환하지 않는다", async () => {
    for (const mode of ["withdraw", "reset"] as const) {
      resetStudioBg3dBundleThemePacksCache();
      const fixture = changingFixture(mode);
      const result = deferred<Bg3dVerifiedStoredRecord>();
      const prepare = vi.fn<StudioBg3dBundleRecordPreparer>(() => result.pending);
      const pending = loadStudioBg3dBundleThemePackRecord(fixture.id, undefined, "worker", prepare);
      const outcome = pending.catch((error: unknown) => error);
      await vi.waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
      if (mode === "withdraw") {
        fixture.raw.assets = [];
        (fixture.raw.packs as Record<string, unknown>[])[0] = { ...(fixture.raw.packs as Record<string, unknown>[])[0], placeable: 0 };
        fixture.raw.totals = { packs: 1, placeableAssets: 0, presets: 0, crowdGlbAssets: 0, deferredAssets: 0 };
        await loadStudioBg3dBundleThemePacks();
      } else resetStudioBg3dBundleThemePacksCache();
      const args = prepare.mock.calls[0];
      if (!args) throw new Error("준비 호출이 없습니다.");
      result.resolve(fixtureRecord(...args));
      expect(await outcome).toBeInstanceOf(TypeError);
    }
  });

  it("공개 release 후 같은 본문을 새로 요청하면 이전 소스 release가 새 세대를 지우지 않는다", async () => {
    const fixture = changingFixture("release");
    const source = await resolveStudioBg3dBundleRecordSource(fixture.id);
    if (!source) throw new Error("해석할 소스가 없습니다.");
    await source.loadSource();
    releaseStudioBg3dBundleAssetBytes(fixture.id);
    const asset = findStudioBg3dBundleAsset(fixture.id);
    if (!asset) throw new Error("해석할 에셋이 없습니다.");
    const url = `/assets/studio/bundle-v2/${SHA_1}.glb`;
    await loadStudioBg3dBundleAssetBytes(asset, url);
    source.releaseSource();
    const unexpectedFetch = vi.fn(async () => ({ bytes: GLB, mimeType: "model/gltf-binary" as const }));
    await loadStudioBg3dBundleAssetBytes(asset, url, { fetcher: unexpectedFetch });
    expect(unexpectedFetch).not.toHaveBeenCalled();
    releaseStudioBg3dBundleAssetBytes(fixture.id);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("resolveStudioBg3dBundleRecordSource", () => {
  it("returns null for non-bundle ids without loading theme-pack data", async () => {
    const loadData = vi.fn(async () => { throw new Error("must not load"); });
    await expect(resolveStudioBg3dBundleRecordSource("local-model-1", { loadData })).resolves.toBeNull();
    expect(loadData).not.toHaveBeenCalled();
  });

  it("builds a licensed record source for a bundle asset id", async () => {
    const source = await resolveStudioBg3dBundleRecordSource("cbv1-ingest-test-001", { loadData: loadFixtureData });
    expect(source).not.toBeNull();
    if (!source) return;
    expect(source.id).toBe("cbv1-ingest-test-001");
    expect(source.fileName).toBe("one.glb");
    expect(source.byteSize).toBe(GLB.byteLength);
    expect(source.sha256).toBe(`sha256:${SHA_1}`);
    expect(source.rights).toEqual({
      status: "licensed",
      commercialUse: true,
      attributionRequired: false,
      licenseName: TEST_PACK_LICENSE_NAME,
    });
  });

  it("returns null for an unknown bundle-prefixed id after loading data", async () => {
    await expect(
      resolveStudioBg3dBundleRecordSource("cbv1-ingest-test-999", { loadData: loadFixtureData }),
    ).resolves.toBeNull();
  });

  it("resolves by content hash and misses unknown hashes", async () => {
    const byHash = await resolveStudioBg3dBundleRecordSourceByHash(`sha256:${SHA_2}`, { loadData: loadFixtureData });
    expect(byHash?.id).toBe("cbv1-ingest-test-002");
    await expect(
      resolveStudioBg3dBundleRecordSourceByHash(`sha256:${"e".repeat(64)}`, { loadData: loadFixtureData }),
    ).resolves.toBeNull();
  });

  it("falls back to null when theme-pack data cannot load, so local hash resolution is never blocked", async () => {
    const loadData = vi.fn(async (): Promise<StudioBg3dBundleThemePacks> => {
      throw new TypeError("Failed to parse URL from /assets/3d/environments/bundle-v1/theme-packs.json");
    });
    await expect(
      resolveStudioBg3dBundleRecordSourceByHash(`sha256:${SHA_1}`, { loadData }),
    ).resolves.toBeNull();
    await expect(
      resolveStudioBg3dBundleRecordSource("cbv1-ingest-test-001", { loadData }),
    ).resolves.toBeNull();
  });
});

describe("loadStudioBg3dBundleAssetBytes", () => {
  it("returns GLB bytes for a well-formed response", async () => {
    await loadFixtureData();
    const asset = findStudioBg3dBundleAsset("cbv1-ingest-test-001");
    if (!asset) throw new Error("fixture asset missing");
    stubGlbFetch(GLB);
    const loaded = await loadStudioBg3dBundleAssetBytes(asset, `/assets/studio/bundle-v2/${SHA_1}.glb`);
    expect(loaded.mimeType).toBe("model/gltf-binary");
    expect(loaded.bytes.byteLength).toBe(GLB.byteLength);
  });

  it("rejects a response whose size differs from the metadata", async () => {
    await loadFixtureData();
    const asset = findStudioBg3dBundleAsset("cbv1-ingest-test-002");
    if (!asset) throw new Error("fixture asset missing");
    const fetcher = async () => ({ bytes: new Uint8Array(4), mimeType: "model/gltf-binary" as const });
    await expect(
      loadStudioBg3dBundleAssetBytes(asset, "/x", { fetcher }),
    ).rejects.toThrow();
  });

  it("rejects a response without the GLB magic through the default fetcher checks", async () => {
    await loadFixtureData();
    const asset = findStudioBg3dBundleAsset("cbv1-ingest-test-001");
    if (!asset) throw new Error("fixture asset missing");
    releaseStudioBg3dBundleAssetBytes(asset.id);
    const notGlb = new Uint8Array(GLB.byteLength);
    stubGlbFetch(notGlb);
    await expect(
      loadStudioBg3dBundleAssetBytes(asset, `/assets/studio/bundle-v2/${SHA_1}.glb`),
    ).rejects.toThrow();
  });
});

describe("loadStudioBg3dBundleThemePackRecord", () => {
  it("hands the injected preparer the bundle identity, rights and expected hash, coalesced", async () => {
    const fakeRecord = { id: "cbv1-ingest-test-002" } as unknown as Bg3dVerifiedStoredRecord;
    const prepare = vi.fn<StudioBg3dBundleRecordPreparer>(async () => fakeRecord);
    stubFetchRouter(GLB);

    const first = await loadStudioBg3dBundleThemePackRecord("cbv1-ingest-test-002", undefined, "direct", prepare);
    const second = await loadStudioBg3dBundleThemePackRecord("cbv1-ingest-test-002", undefined, "direct", prepare);
    expect(first).toBe(fakeRecord);
    expect(second).toBe(fakeRecord);
    expect(prepare).toHaveBeenCalledTimes(1);
    const [input, options] = prepare.mock.calls[0] ?? [];
    expect(input?.expectedSha256).toBe(`sha256:${SHA_2}`);
    expect(input?.rights?.licenseName).toBe(TEST_PACK_LICENSE_NAME);
    expect(input?.file.name).toBe("two.glb");
    expect(options?.profile).toBe("mobile");
    expect(options?.idFactory?.()).toBe("cbv1-ingest-test-002");
  });

  it("returns null for ids that are not bundle assets", async () => {
    const prepare = vi.fn<StudioBg3dBundleRecordPreparer>();
    await expect(
      loadStudioBg3dBundleThemePackRecord("some-local-id", undefined, "direct", prepare),
    ).resolves.toBeNull();
    expect(prepare).not.toHaveBeenCalled();
  });

  it("returns null by hash when the serving fetch itself is unavailable", async () => {
    const prepare = vi.fn<StudioBg3dBundleRecordPreparer>();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Invalid URL"); }));
    await expect(
      loadStudioBg3dBundleThemePackRecordByHash(`sha256:${SHA_1}`, undefined, "direct", prepare),
    ).resolves.toBeNull();
    expect(prepare).not.toHaveBeenCalled();
  });
});

describe("studioBg3dBundleAssetRights (팩별 권리 조회)", () => {
  function multiPackRaw(): Record<string, unknown> {
    const raw = rawThemePacks();
    const [first] = raw.packs as Record<string, unknown>[];
    const { rights: _rights, ...legacyPack } = first ?? {};
    raw.packs = [
      first,
      {
        ...first,
        title: "Public Domain Pack",
        ingestPackIds: ["pd-pack"],
        rights: {
          serve: "allow",
          status: "public-domain",
          licenseName: "CC0 1.0 — Test Pack",
          commercialUse: true,
          attributionRequired: false,
        },
      },
      { ...legacyPack, title: "Pre-ledger Pack", ingestPackIds: ["legacy-pack"] },
    ];
    raw.assets = [
      { id: "cbv1-ingest-test-001", pack: 0, path: "test-pack/one.glb", bytes: GLB.byteLength, sha256: SHA_1, tris: 3 },
      { id: "cbv1-ingest-test-002", pack: 1, path: "pd-pack/two.glb", bytes: GLB.byteLength, sha256: SHA_2, tris: 5 },
      { id: "cbv1-ingest-test-003", pack: 2, path: "legacy-pack/three.glb", bytes: GLB.byteLength, sha256: "e".repeat(64), tris: 7 },
    ];
    raw.totals = { packs: 3, placeableAssets: 3, presets: 0, crowdGlbAssets: 0, deferredAssets: 0 };
    return raw;
  }

  it("gives every asset its own pack's rights instead of one bundle-wide constant", () => {
    const data = parseStudioBg3dBundleThemePacks(multiPackRaw());
    const [licensed, publicDomain] = data.assets;
    expect(licensed && studioBg3dBundleAssetRights(licensed, data)).toEqual({
      status: "licensed",
      commercialUse: true,
      attributionRequired: false,
      licenseName: TEST_PACK_LICENSE_NAME,
    });
    expect(publicDomain && studioBg3dBundleAssetRights(publicDomain, data)).toEqual({
      status: "public-domain",
      commercialUse: true,
      attributionRequired: false,
      licenseName: "CC0 1.0 — Test Pack",
    });
  });

  it.each([
    { commercialUse: false, attributionRequired: false },
    { commercialUse: true, attributionRequired: true, attribution: "Test Pack by Tester" },
    { commercialUse: false, attributionRequired: true, attribution: "Test Pack by Tester" },
    { commercialUse: true, attributionRequired: false, attribution: "Optional credit by Tester" },
  ])("passes a restrictive pack grant through unchanged (commercialUse=$commercialUse, attributionRequired=$attributionRequired)", async (grant) => {
    // 기본값(상업 이용 가능·출처 표기 불필요)과 다른 값이 레코드 권리까지 그대로 가야 한다 — 권리를 넓히는 정규화가 없다.
    const raw = multiPackRaw();
    const packs = raw.packs as Record<string, unknown>[];
    packs[1] = {
      ...packs[1],
      rights: { serve: "allow", status: "licensed", licenseName: "Restrictive Test License", ...grant },
    };
    const data = parseStudioBg3dBundleThemePacks(raw);
    const restrictive = data.assets[1];
    if (!restrictive) throw new Error("fixture asset missing");
    const expected = { status: "licensed", licenseName: "Restrictive Test License", ...grant };
    expect(studioBg3dBundleAssetRights(restrictive, data)).toEqual(expected);
    // 같은 값이 레코드 소스의 권리로도 전달된다 (다른 팩의 권리와 섞이지 않는다).
    const source = await resolveStudioBg3dBundleRecordSource("cbv1-ingest-test-002", {
      loadData: () => loadStudioBg3dBundleThemePacks({
    release: null,
        fetcher: async () => ({ ok: true, status: 200, json: async () => raw }),
      }),
    });
    expect(source?.rights).toEqual(expected);
    const sibling = data.assets[0];
    if (!sibling) throw new Error("fixture asset missing");
    expect(studioBg3dBundleAssetRights(sibling, data).commercialUse).toBe(true);
    expect(studioBg3dBundleAssetRights(sibling, data).attributionRequired).toBe(false);
  });

  it("closes the rights as unknown and non-commercial when the pack carries no rights block", async () => {
    const data = parseStudioBg3dBundleThemePacks(multiPackRaw());
    const legacy = data.assets[2];
    if (!legacy) throw new Error("fixture asset missing");
    expect(studioBg3dBundleAssetRights(legacy, data)).toEqual({
      status: "unknown",
      commercialUse: false,
      attributionRequired: false,
    });
    // 에셋 조회 색인은 로더(loadStudioBg3dBundleThemePacks)가 채우므로 같은 경로로 불러온다.
    const source = await resolveStudioBg3dBundleRecordSource("cbv1-ingest-test-003", {
      loadData: () => loadStudioBg3dBundleThemePacks({
    release: null,
        fetcher: async () => ({ ok: true, status: 200, json: async () => multiPackRaw() }),
      }),
    });
    expect(source?.rights).toEqual({ status: "unknown", commercialUse: false, attributionRequired: false });
  });

  it("falls back to unknown for an asset whose pack index does not exist", () => {
    const data = parseStudioBg3dBundleThemePacks(rawThemePacks());
    const [asset] = data.assets;
    if (!asset) throw new Error("fixture asset missing");
    expect(studioBg3dBundleAssetRights({ ...asset, packIndex: 99 }, data).status).toBe("unknown");
  });
});

describe("bundle serving URL", () => {
  it("requests the asset by its sha256 key and never puts the original path in the URL", async () => {
    stubFetchRouter(GLB);
    releaseStudioBg3dBundleAssetBytes("cbv1-ingest-test-001");
    const source = await resolveStudioBg3dBundleRecordSource("cbv1-ingest-test-001", { loadData: loadFixtureData });
    if (!source) throw new Error("source missing");
    await source.loadSource();
    const requested = vi.mocked(fetch).mock.calls
      .map(([input]) => String(input))
      .filter((url) => !isConsumerCatalogUrl(url));
    expect(requested).toEqual([`/assets/studio/bundle-v2/${SHA_1}.glb`]);
    expect(requested[0]).not.toContain("test-pack");
    expect(requested[0]).not.toContain("one.glb");
    source.releaseSource();
  });
});

