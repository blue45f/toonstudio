import { describe, expect, it, vi } from "vitest";

import {
  buildStudioBg3dImportedAssetMetadata,
  describeStudioBg3dImportAiUseNotice,
  hasStudioBg3dImportAiUse,
  persistStudioBg3dImportedAiUse,
  readStudioBg3dImportAiUse,
  type StudioBg3dImportMetadataStore,
  type StudioBg3dImportedRecordLike,
} from "./studio-bg3d-import-asset-metadata";
import { STUDIO_BG3D_ASSET_METADATA_VERSION, type StudioBg3dAssetMetadata } from "./studio-bg3d-asset-metadata";

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

describe("readStudioBg3dImportAiUse", () => {
  it("권리 폼 값에서 올바른 AI 표기만 골라 내고 모름·알 수 없는 값은 없음으로 본다", () => {
    expect(readStudioBg3dImportAiUse({ aiGenerated: "yes", aiTraining: "prohibited", status: "owned" }))
      .toEqual({ aiGenerated: "yes", aiTraining: "prohibited" });
    expect(readStudioBg3dImportAiUse({ aiGenerated: "unknown", aiTraining: "maybe" })).toEqual({});
    for (const bad of [null, undefined, "yes", 3, []]) expect(readStudioBg3dImportAiUse(bad)).toEqual({});
    expect(hasStudioBg3dImportAiUse({})).toBe(false);
    expect(hasStudioBg3dImportAiUse({ aiTraining: "allowed" })).toBe(true);
    expect(hasStudioBg3dImportAiUse(undefined)).toBe(false);
  });
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

describe("describeStudioBg3dImportAiUseNotice", () => {
  it("저장되지 않은 결과만 사용자에게 알리고 문구에 다음 행동이나 현재 표시를 담는다", () => {
    expect(describeStudioBg3dImportAiUseNotice("saved")).toBeNull();
    expect(describeStudioBg3dImportAiUseNotice("skipped")).toBeNull();
    expect(describeStudioBg3dImportAiUseNotice("failed")).toContain("AI 미확인");
    expect(describeStudioBg3dImportAiUseNotice("existing")).toContain("기존 기록");
    expect(describeStudioBg3dImportAiUseNotice("partial")).toContain("나머지");
  });
});
