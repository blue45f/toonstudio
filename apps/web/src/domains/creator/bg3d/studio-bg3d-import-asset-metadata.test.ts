import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_BG3D_IMPORT_AI_USE_SAVE_TIMEOUT_MS,
  buildStudioBg3dImportedAssetMetadata,
  persistStudioBg3dImportedAiUse,
  type StudioBg3dImportMetadataStore,
  type StudioBg3dImportedRecordLike,
} from "./studio-bg3d-import-asset-metadata";
import { STUDIO_BG3D_ASSET_METADATA_VERSION, type StudioBg3dAssetMetadata } from "./studio-bg3d-asset-metadata";
import { subscribeStudioBg3dAssetRightsChanged } from "./studio-bg3d-asset-rights-refresh";

const hash = (digit: string) => `sha256:${digit.repeat(64)}` as const;

function record(digit: string, patch: Partial<StudioBg3dImportedRecordLike> = {}): StudioBg3dImportedRecordLike {
  return {
    name: `모델 ${digit}`,
    contentHash: hash(digit),
    byteSize: 2_048,
    validatorMetrics: { triangles: 120, textures: 3 },
    rights: { status: "licensed", commercialUse: true, attributionRequired: false, licenseName: "ACON3D 구매 라이선스" },
    ...patch,
  };
}

function fakeStore(existing: readonly string[] = [], failPut = false) {
  const put = vi.fn(async (values: readonly StudioBg3dAssetMetadata[]) => {
    if (failPut) throw new Error("storage-unavailable");
    return values;
  });
  const store: StudioBg3dImportMetadataStore = {
    get: vi.fn(async (contentHash: string) => (existing.includes(contentHash) ? ({ contentHash } as StudioBg3dAssetMetadata) : null)),
    put,
  };
  return { store, put, deps: { now: () => 7_000, loadStore: async () => store } };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("buildStudioBg3dImportedAssetMetadata", () => {
  it("라이브러리 레코드의 권리에 AI 표기를 더한 현재 버전 기록을 만들고 팀 공유는 막는다", () => {
    const metadata = buildStudioBg3dImportedAssetMetadata(record("a"), { aiGenerated: "yes" }, 7_000);
    expect(metadata).toMatchObject({
      version: STUDIO_BG3D_ASSET_METADATA_VERSION,
      contentHash: hash("a"),
      format: "glb",
      createdAt: 7_000,
      byteSize: 2_048,
      triangles: 120,
      textures: 3,
      rights: {
        status: "licensed",
        commercialUse: true,
        teamShareAllowed: false,
        license: "ACON3D 구매 라이선스",
        aiGenerated: "yes",
      },
    });
    expect(metadata?.rights.aiTraining).toBeUndefined();
  });

  it("권리가 확인 전이어도 AI 표기는 남기되 상업 사용은 허용하지 않는다", () => {
    const metadata = buildStudioBg3dImportedAssetMetadata(
      record("b", { rights: { status: "unknown", commercialUse: true, attributionRequired: false } }),
      { aiGenerated: "yes", aiTraining: "prohibited" },
      7_000,
    );
    expect(metadata?.rights).toEqual({
      status: "unknown",
      commercialUse: false,
      teamShareAllowed: false,
      aiGenerated: "yes",
      aiTraining: "prohibited",
    });
  });

  it("범위를 벗어난 삼각형·텍스처 수는 기록을 버리지 않고 모름(null)으로 둔다", () => {
    const metadata = buildStudioBg3dImportedAssetMetadata(
      record("c", { validatorMetrics: { triangles: 9_999_999, textures: Number.NaN } }),
      { aiTraining: "allowed" },
      7_000,
    );
    expect(metadata).toMatchObject({ triangles: null, textures: null });
  });

  it("저장 규칙에 걸리는 이름은 일반 이름으로 바꿔 기록한다", () => {
    expect(buildStudioBg3dImportedAssetMetadata(record("d", { name: "<img src=x>" }), { aiGenerated: "no" }, 7_000)?.name)
      .toBe("3D 모델");
  });
});

describe("persistStudioBg3dImportedAiUse", () => {
  it("AI 표기를 하나도 고르지 않았으면 저장소를 열지도 않는다", async () => {
    const loadStore = vi.fn();
    await expect(persistStudioBg3dImportedAiUse([record("a")], {}, { loadStore })).resolves.toBe("skipped");
    await expect(persistStudioBg3dImportedAiUse([record("a")], undefined, { loadStore })).resolves.toBe("skipped");
    await expect(persistStudioBg3dImportedAiUse([], { aiGenerated: "yes" }, { loadStore })).resolves.toBe("skipped");
    expect(loadStore).not.toHaveBeenCalled();
  });

  it("새 소재는 한 번에 기록한다", async () => {
    const { put, deps } = fakeStore();
    await expect(persistStudioBg3dImportedAiUse([record("a"), record("b")], { aiGenerated: "no" }, deps)).resolves.toBe("saved");
    expect(put).toHaveBeenCalledOnce();
    expect(put.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it("이미 기록이 있는 소재는 덮어쓰지 않고, 모두 그렇다면 existing, 일부면 partial 이다", async () => {
    const all = fakeStore([hash("a")]);
    await expect(persistStudioBg3dImportedAiUse([record("a")], { aiGenerated: "yes" }, all.deps)).resolves.toBe("existing");
    expect(all.put).not.toHaveBeenCalled();

    const some = fakeStore([hash("a")]);
    await expect(persistStudioBg3dImportedAiUse([record("a"), record("b")], { aiGenerated: "yes" }, some.deps)).resolves.toBe("partial");
    expect(some.put.mock.calls[0]?.[0]).toHaveLength(1);
    expect(some.put.mock.calls[0]?.[0][0]?.contentHash).toBe(hash("b"));
  });

  it("같은 해시가 한 번에 두 번 와도 한 번만 기록한다", async () => {
    const { put, deps } = fakeStore();
    await persistStudioBg3dImportedAiUse([record("a"), record("a")], { aiGenerated: "yes" }, deps);
    expect(put.mock.calls[0]?.[0]).toHaveLength(1);
  });

  it("저장소가 실패해도 던지지 않고 failed 로 알린다", async () => {
    const down = fakeStore([], true);
    await expect(persistStudioBg3dImportedAiUse([record("a")], { aiGenerated: "yes" }, down.deps)).resolves.toBe("failed");
    await expect(persistStudioBg3dImportedAiUse([record("a")], { aiGenerated: "yes" }, {
      loadStore: async () => {
        throw new Error("module-load-failed");
      },
    })).resolves.toBe("failed");
  });
});

describe("라이선스 이름이 저장 규칙에 걸려도 권리 상태를 지킨다", () => {
  const AI = { aiGenerated: "no", aiTraining: "prohibited" } as const;

  it("<상업> 같은 글자가 든 구매·허가 이름이어도 구매·허가·상업 가능·AI 표기가 그대로 남는다", () => {
    const metadata = buildStudioBg3dImportedAssetMetadata(
      record("a", { rights: { status: "licensed", commercialUse: true, attributionRequired: false, licenseName: "표준 <상업> 라이선스" } }),
      AI,
      7_000,
    );
    expect(metadata?.rights).toMatchObject({
      status: "licensed",
      commercialUse: true,
      teamShareAllowed: false,
      aiGenerated: "no",
      aiTraining: "prohibited",
    });
    // 저장 규칙에 맞지 않는 글자는 기록에 들어가지 않는다(자리표시 이름).
    expect(JSON.stringify(metadata)).not.toContain("<");
    expect(metadata?.rights.license).toBeTruthy();
  });

  it("주소가 든 이름도 마찬가지이고, 직접 제작·공개 이용은 이름 없이 기록한다", () => {
    const url = buildStudioBg3dImportedAssetMetadata(
      record("b", { rights: { status: "licensed", commercialUse: true, attributionRequired: false, licenseName: "CC BY 4.0 https://creativecommons.org/licenses/by/4.0/" } }),
      AI,
      7_000,
    );
    expect(url?.rights.status).toBe("licensed");
    expect(JSON.stringify(url)).not.toContain("https://");

    const owned = buildStudioBg3dImportedAssetMetadata(
      record("c", { rights: { status: "owned", commercialUse: true, attributionRequired: false, licenseName: "내 작업 <원본>" } }),
      AI,
      7_000,
    );
    expect(owned?.rights).toMatchObject({ status: "owned", commercialUse: true, aiGenerated: "no" });
    expect(owned?.rights.license).toBeUndefined();
  });
});

describe("취소·시간 한도·알림", () => {
  const AI = { aiGenerated: "yes" } as const;

  it("가져오기 취소 신호가 이미 섰으면 저장소를 열지 않고 cancelled 로 돌려준다", async () => {
    const loadStore = vi.fn();
    const controller = new AbortController();
    controller.abort();
    await expect(persistStudioBg3dImportedAiUse([record("a")], AI, { loadStore, signal: controller.signal })).resolves.toBe("cancelled");
    expect(loadStore).not.toHaveBeenCalled();
  });

  it("저장소를 기다리는 도중 취소하면 멈추고, 아무것도 쓰지 않는다", async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const put = vi.fn();
    const store: StudioBg3dImportMetadataStore = {
      get: (_hash, signal) => {
        receivedSignal = signal;
        return new Promise<StudioBg3dAssetMetadata | null>(() => undefined);
      },
      put,
    };
    const pending = persistStudioBg3dImportedAiUse([record("a")], AI, { loadStore: async () => store, signal: controller.signal });
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    await expect(pending).resolves.toBe("cancelled");
    expect(receivedSignal?.aborted).toBe(true);
    expect(put).not.toHaveBeenCalled();
  });

  it("저장소가 응답하지 않으면 시간 한도 뒤에 failed 로 멈춘다(실제 시간을 기다리지 않는다)", async () => {
    vi.useFakeTimers();
    const store: StudioBg3dImportMetadataStore = {
      get: () => new Promise<StudioBg3dAssetMetadata | null>(() => undefined),
      put: vi.fn(),
    };
    const pending = persistStudioBg3dImportedAiUse([record("a")], AI, { loadStore: async () => store });
    await vi.advanceTimersByTimeAsync(STUDIO_BG3D_IMPORT_AI_USE_SAVE_TIMEOUT_MS - 1);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe("failed");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("끝난 저장은 시간 한도 타이머를 남기지 않는다", async () => {
    vi.useFakeTimers();
    const { deps } = fakeStore();
    await expect(persistStudioBg3dImportedAiUse([record("a")], AI, deps)).resolves.toBe("saved");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("새 기록을 썼을 때만(saved·partial) 권리 읽기에 알린다", async () => {
    const listener = vi.fn();
    const stop = subscribeStudioBg3dAssetRightsChanged(listener);
    await persistStudioBg3dImportedAiUse([record("a")], AI, fakeStore().deps);
    expect(listener).toHaveBeenCalledTimes(1);
    await persistStudioBg3dImportedAiUse([record("a"), record("b")], AI, fakeStore([hash("a")]).deps);
    expect(listener).toHaveBeenCalledTimes(2);
    await persistStudioBg3dImportedAiUse([record("a")], AI, fakeStore([hash("a")]).deps);
    await persistStudioBg3dImportedAiUse([record("a")], AI, fakeStore([], true).deps);
    await persistStudioBg3dImportedAiUse([record("a")], {}, fakeStore().deps);
    expect(listener).toHaveBeenCalledTimes(2);
    stop();
  });
});
