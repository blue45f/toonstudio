import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_STUDIO_BG3D_ASSET_RIGHTS,
  STUDIO_BG3D_ASSET_METADATA_VERSION,
  normalizeStudioBg3dAssetMetadata,
  type StudioBg3dAssetMetadata,
} from "./studio-bg3d-asset-metadata";
import {
  STUDIO_BG3D_SKP_STORED_MAX_NAMES,
  buildStudioBg3dSkpAssetMetadata,
  compactStudioBg3dSkpReportForStorage,
  persistStudioBg3dSkpAssetMetadata,
  type StudioBg3dSkpImportedAsset,
  type StudioBg3dSkpMetadataStore,
} from "./studio-bg3d-skp-asset-metadata";
import { createSkpReportFixture } from "./studio-bg3d-skp.test-fixture";

const HASH = `sha256:${"d".repeat(64)}` as const;

function asset(overrides: Partial<StudioBg3dSkpImportedAsset> = {}): StudioBg3dSkpImportedAsset {
  return {
    sourcePath: "set/room.skp",
    name: "방 모델",
    contentHash: HASH,
    byteSize: 4_096,
    triangles: 80,
    textures: 1,
    rights: { status: "owned", commercialUse: true },
    ...overrides,
  };
}

function fakeStore(existing: StudioBg3dAssetMetadata | null = null): {
  readonly store: StudioBg3dSkpMetadataStore;
  readonly get: ReturnType<typeof vi.fn>;
  readonly put: ReturnType<typeof vi.fn>;
} {
  const get = vi.fn(() => Promise.resolve(existing));
  const put = vi.fn(() => Promise.resolve([]));
  return { store: { get, put }, get, put };
}

function names(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `부품 ${index}`);
}

describe("compactStudioBg3dSkpReportForStorage", () => {
  it("shortens long name lists, keeps the true total and marks the list as truncated", () => {
    const report = createSkpReportFixture({
      names: {
        components: { available: true, items: names(40), total: 90, truncated: true },
        tags: { available: true, items: names(3), total: 3, truncated: false },
        scenes: { available: false, items: [], total: 0, truncated: false },
      },
    });
    const compact = compactStudioBg3dSkpReportForStorage(report);
    expect(compact.names.components.items).toHaveLength(STUDIO_BG3D_SKP_STORED_MAX_NAMES);
    expect(compact.names.components).toMatchObject({ total: 90, truncated: true, available: true });
    expect(compact.names.tags).toBe(report.names.tags);
    expect(compact.names.scenes).toEqual({ available: false, items: [], total: 0, truncated: false });
    expect(compact.counts).toBe(report.counts);
    expect(report.names.components.items).toHaveLength(40);
  });
});

describe("buildStudioBg3dSkpAssetMetadata", () => {
  it("builds a skp record that the metadata contract accepts, with the report attached", () => {
    const record = buildStudioBg3dSkpAssetMetadata(asset(), createSkpReportFixture(), 1_000);
    expect(record).toMatchObject({
      version: STUDIO_BG3D_ASSET_METADATA_VERSION,
      contentHash: HASH,
      name: "방 모델",
      format: "skp",
      createdAt: 1_000,
      updatedAt: 1_000,
      byteSize: 4_096,
      triangles: 80,
      textures: 1,
      favorite: false,
      collections: [],
      tags: [],
      rights: { status: "owned", commercialUse: true, teamShareAllowed: false },
    });
    expect(record?.skpImport).toEqual(createSkpReportFixture());
    expect(normalizeStudioBg3dAssetMetadata(record)).toEqual(record);
  });

  it("never stores the source path or file name of the original .skp", () => {
    const record = buildStudioBg3dSkpAssetMetadata(asset(), createSkpReportFixture(), 1_000);
    expect(JSON.stringify(record)).not.toContain("set/room.skp");
    expect(JSON.stringify(record)).not.toContain("sourcePath");
  });

  it("maps the rights gate's answer without widening it", () => {
    const licensed = buildStudioBg3dSkpAssetMetadata(
      asset({ rights: { status: "licensed", commercialUse: true, licenseName: "ACON3D 구매 라이선스" } }),
      createSkpReportFixture(),
      1,
    );
    expect(licensed?.rights).toEqual({
      status: "licensed",
      commercialUse: true,
      teamShareAllowed: false,
      license: "ACON3D 구매 라이선스",
    });
    const unknown = buildStudioBg3dSkpAssetMetadata(
      asset({ rights: { status: "unknown", commercialUse: true } }),
      createSkpReportFixture(),
      1,
    );
    expect(unknown?.rights).toEqual(DEFAULT_STUDIO_BG3D_ASSET_RIGHTS);
    // 라이선스 이름 없는 licensed 는 메타데이터 계약이 받지 않으므로 기본 권리(확인 전)로 내려간다.
    const unnamed = buildStudioBg3dSkpAssetMetadata(
      asset({ rights: { status: "licensed", commercialUse: true } }),
      createSkpReportFixture(),
      1,
    );
    expect(unnamed?.rights).toEqual(DEFAULT_STUDIO_BG3D_ASSET_RIGHTS);
  });

  it("falls back to a generic name when the file name breaks the storage text rules", () => {
    const record = buildStudioBg3dSkpAssetMetadata(asset({ name: "<b>room</b>" }), createSkpReportFixture(), 1);
    expect(record?.name).toBe("SketchUp 모델");
  });

  it("returns null for an unusable hash", () => {
    expect(buildStudioBg3dSkpAssetMetadata(asset({ contentHash: "sha256:xyz" }), createSkpReportFixture(), 1)).toBeNull();
  });
});

describe("persistStudioBg3dSkpAssetMetadata", () => {
  it("saves a new record and says so", async () => {
    const { store, get, put } = fakeStore();
    const status = await persistStudioBg3dSkpAssetMetadata(asset(), createSkpReportFixture(), {
      now: () => 5_000,
      loadStore: () => Promise.resolve(store),
    });
    expect(status).toBe("saved");
    expect(get).toHaveBeenCalledWith(HASH);
    expect(put).toHaveBeenCalledTimes(1);
    const firstArgument: unknown = put.mock.calls[0]?.[0];
    expect(firstArgument).toEqual([expect.objectContaining({ contentHash: HASH, format: "skp", createdAt: 5_000 })]);
  });

  it("leaves an existing record, and the edits on it, untouched", async () => {
    const existing = normalizeStudioBg3dAssetMetadata({
      version: STUDIO_BG3D_ASSET_METADATA_VERSION,
      contentHash: HASH,
      name: "내가 고친 이름",
      format: "skp",
      createdAt: 1,
      updatedAt: 2,
      byteSize: 4_096,
      triangles: 80,
      textures: 1,
      favorite: true,
      collections: [],
      tags: ["거실"],
      rights: DEFAULT_STUDIO_BG3D_ASSET_RIGHTS,
    });
    const { store, put } = fakeStore(existing);
    const status = await persistStudioBg3dSkpAssetMetadata(asset(), createSkpReportFixture(), {
      loadStore: () => Promise.resolve(store),
    });
    expect(status).toBe("existing");
    expect(put).not.toHaveBeenCalled();
  });

  it("reports failure instead of throwing when the store is unavailable or rejects the write", async () => {
    const unavailable = await persistStudioBg3dSkpAssetMetadata(asset(), createSkpReportFixture(), {
      loadStore: () => Promise.reject(new Error("storage-unavailable")),
    });
    expect(unavailable).toBe("failed");

    const conflict = fakeStore();
    conflict.put.mockRejectedValueOnce(new Error("metadata-conflict"));
    const rejected = await persistStudioBg3dSkpAssetMetadata(asset(), createSkpReportFixture(), {
      loadStore: () => Promise.resolve(conflict.store),
    });
    expect(rejected).toBe("failed");
  });

  it("reports failure, without touching the store, when no valid record can be built", async () => {
    const loadStore = vi.fn(() => Promise.resolve(fakeStore().store));
    const status = await persistStudioBg3dSkpAssetMetadata(asset({ contentHash: "nope" }), createSkpReportFixture(), { loadStore });
    expect(status).toBe("failed");
    expect(loadStore).not.toHaveBeenCalled();
  });
});
