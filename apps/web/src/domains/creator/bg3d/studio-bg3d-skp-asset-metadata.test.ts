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
import { subscribeStudioBg3dAssetRightsChanged } from "./studio-bg3d-asset-rights-refresh";
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

describe("buildStudioBg3dSkpAssetMetadata — AI 사용 표기", () => {
  it("권리 폼에서 고른 AI 표기를 변환 보고서와 같은 기록의 권리에 담는다", () => {
    const record = buildStudioBg3dSkpAssetMetadata(
      asset({ aiUse: { aiGenerated: "yes", aiTraining: "prohibited" } }),
      createSkpReportFixture(),
      1_000,
    );
    expect(record?.rights).toMatchObject({ aiGenerated: "yes", aiTraining: "prohibited" });
    expect(record?.skpImport).toBeDefined();
  });

  it("고르지 않았다면 필드를 만들지 않아 기존 기록과 같은 모양(미확인)이다", () => {
    const record = buildStudioBg3dSkpAssetMetadata(asset(), createSkpReportFixture(), 1_000);
    expect("aiGenerated" in (record?.rights ?? {})).toBe(false);
    expect("aiTraining" in (record?.rights ?? {})).toBe(false);
  });
});

describe("buildStudioBg3dSkpAssetMetadata — 라이선스 이름이 저장 규칙에 걸릴 때", () => {
  it("<상업> 이름이어도 구매·허가·상업 가능·AI 표기를 지키고, 걸린 글자는 기록에 넣지 않는다", () => {
    const record = buildStudioBg3dSkpAssetMetadata(
      asset({
        rights: { status: "licensed", commercialUse: true, licenseName: "3D Warehouse <표준> 약관" },
        aiUse: { aiGenerated: "no", aiTraining: "allowed" },
      }),
      createSkpReportFixture(),
      9_000,
    );
    expect(record?.rights).toMatchObject({ status: "licensed", commercialUse: true, aiGenerated: "no", aiTraining: "allowed" });
    expect(JSON.stringify(record?.rights)).not.toContain("<");
    expect(record?.skpImport).toBeDefined();
  });

  it("직접 제작은 걸린 이름을 빼고 기록한다", () => {
    const record = buildStudioBg3dSkpAssetMetadata(
      asset({ rights: { status: "owned", commercialUse: true, licenseName: "내 모델 https://example.invalid/own" } }),
      createSkpReportFixture(),
      9_000,
    );
    expect(record?.rights).toMatchObject({ status: "owned", commercialUse: true });
    expect(record?.rights.license).toBeUndefined();
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
    // 저장소에는 취소·시간 한도를 알리는 신호가 함께 넘어간다.
    expect(get).toHaveBeenCalledWith(HASH, expect.any(AbortSignal));
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

  it("새 기록을 쓴 때만 권리 읽기에 알린다(기존 기록 유지·실패는 알리지 않는다)", async () => {
    const listener = vi.fn();
    const stop = subscribeStudioBg3dAssetRightsChanged(listener);
    await persistStudioBg3dSkpAssetMetadata(asset(), createSkpReportFixture(), { loadStore: () => Promise.resolve(fakeStore().store) });
    expect(listener).toHaveBeenCalledTimes(1);

    const existing = normalizeStudioBg3dAssetMetadata({
      version: STUDIO_BG3D_ASSET_METADATA_VERSION,
      contentHash: HASH,
      name: "이미 있음",
      format: "skp",
      createdAt: 1,
      updatedAt: 1,
      byteSize: 4_096,
      triangles: 80,
      textures: 1,
      favorite: true,
      collections: [],
      tags: [],
      rights: DEFAULT_STUDIO_BG3D_ASSET_RIGHTS,
    });
    await persistStudioBg3dSkpAssetMetadata(asset(), createSkpReportFixture(), { loadStore: () => Promise.resolve(fakeStore(existing).store) });
    const rejecting = fakeStore();
    rejecting.put.mockRejectedValueOnce(new Error("boom"));
    await persistStudioBg3dSkpAssetMetadata(asset(), createSkpReportFixture(), { loadStore: () => Promise.resolve(rejecting.store) });
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
  });

  describe("취소 신호와 시간 한도", () => {
    it("가져오기 취소 신호가 이미 서 있으면 저장소를 건드리지 않고 failed 로 돌려준다", async () => {
      const controller = new AbortController();
      controller.abort();
      const loadStore = vi.fn(() => Promise.resolve(fakeStore().store));
      const status = await persistStudioBg3dSkpAssetMetadata(asset(), createSkpReportFixture(), {
        loadStore,
        signal: controller.signal,
      });
      expect(status).toBe("failed");
      expect(loadStore).not.toHaveBeenCalled();
    });

    it("저장소가 응답하지 않는 동안 취소 신호가 서면 기다림을 멈추고, 저장소에는 선 신호를 넘기며, 새 기록 알림은 보내지 않는다", async () => {
      const controller = new AbortController();
      const listener = vi.fn();
      const stop = subscribeStudioBg3dAssetRightsChanged(listener);
      let received: AbortSignal | undefined;
      const put = vi.fn(() => Promise.resolve([]));
      const store: StudioBg3dSkpMetadataStore = {
        get: (_hash, signal) => {
          received = signal;
          return new Promise(() => undefined);
        },
        put,
      };
      const pending = persistStudioBg3dSkpAssetMetadata(asset(), createSkpReportFixture(), {
        loadStore: () => Promise.resolve(store),
        signal: controller.signal,
      });
      await vi.waitFor(() => expect(received).toBeDefined());
      expect(received?.aborted).toBe(false);
      controller.abort();
      await expect(pending).resolves.toBe("failed");
      expect(received?.aborted).toBe(true);
      expect(put).not.toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();
      stop();
    });

    it("저장소가 한도 안에 답하지 않으면 한도에서 멈추고 failed 로 돌려준다(그 전에는 기다린다)", async () => {
      vi.useFakeTimers();
      try {
        const store: StudioBg3dSkpMetadataStore = {
          get: () => new Promise(() => undefined),
          put: vi.fn(() => Promise.resolve([])),
        };
        let settled: string | null = null;
        const pending = persistStudioBg3dSkpAssetMetadata(asset(), createSkpReportFixture(), {
          loadStore: () => Promise.resolve(store),
          timeoutMs: 1_000,
        }).then((status) => {
          settled = status;
          return status;
        });
        await vi.advanceTimersByTimeAsync(999);
        expect(settled).toBeNull();
        await vi.advanceTimersByTimeAsync(1);
        await expect(pending).resolves.toBe("failed");
        expect(store.put).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it("정상으로 끝나면 타이머를 남기지 않는다", async () => {
      vi.useFakeTimers();
      try {
        const { store } = fakeStore();
        await persistStudioBg3dSkpAssetMetadata(asset(), createSkpReportFixture(), { loadStore: () => Promise.resolve(store) });
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
