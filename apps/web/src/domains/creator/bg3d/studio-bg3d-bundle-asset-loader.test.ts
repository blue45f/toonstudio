import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Bg3dVerifiedStoredRecord } from "./bg3d-model-library";
import {
  STUDIO_BG3D_BUNDLE_LICENSE_NAME,
  loadStudioBg3dBundleAssetBytes,
  loadStudioBg3dBundleThemePackRecord,
  loadStudioBg3dBundleThemePackRecordByHash,
  releaseStudioBg3dBundleAssetBytes,
  resolveStudioBg3dBundleRecordSource,
  resolveStudioBg3dBundleRecordSourceByHash,
  type StudioBg3dBundleRecordPreparer,
} from "./studio-bg3d-bundle-asset-loader";
import {
  findStudioBg3dBundleAsset,
  loadStudioBg3dBundleThemePacks,
  resetStudioBg3dBundleThemePacksCache,
  type StudioBg3dBundleThemePacks,
} from "./studio-bg3d-bundle-theme-packs";

const SHA_1 = "c".repeat(64);
const SHA_2 = "d".repeat(64);
const JSON_CHUNK = 0x4e4f534a;

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint32(offset, value, true);
}

function validGlb(): Uint8Array {
  const encodedJson = new TextEncoder().encode(JSON.stringify({
    asset: { version: "2.0" },
    scenes: [{}],
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
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("theme-packs.json")) {
      return { ok: true, status: 200, headers: new Headers(), json: async () => rawThemePacks() };
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

afterEach(() => {
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
      licenseName: STUDIO_BG3D_BUNDLE_LICENSE_NAME,
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
    const loaded = await loadStudioBg3dBundleAssetBytes(asset, "/assets/studio/bundle-v2/test-pack/one.glb");
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
      loadStudioBg3dBundleAssetBytes(asset, "/assets/studio/bundle-v2/test-pack/one.glb"),
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
    expect(input?.rights?.licenseName).toBe(STUDIO_BG3D_BUNDLE_LICENSE_NAME);
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
