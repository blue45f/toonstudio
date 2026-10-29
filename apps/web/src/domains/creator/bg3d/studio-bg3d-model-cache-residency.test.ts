import { describe, expect, it } from "vitest";

import {
  buildStudioBg3dModelCacheResidencyCandidates,
  planStudioBg3dModelCacheResidency,
} from "./studio-bg3d-model-cache-residency";

import type { StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import { createStudioBg3dCacheTestEntry, createStudioBg3dCacheTestRecord } from "./studio-bg3d-model-cache.test-fixture";
import { studioBg3dModelCacheKey, type StudioBg3dMaterialBackend } from "./studio-bg3d-model-material-variant";

function cacheEntry(
  id: string,
  geometryBytes: number,
  textureBytes: number,
  backend: StudioBg3dMaterialBackend = "webgl",
): StudioBg3dModelRootCacheEntry {
  const entry = createStudioBg3dCacheTestEntry(createStudioBg3dCacheTestRecord(id), backend);
  return {
    ...entry,
    metrics: {
      ...entry.metrics,
      estimatedDecodedGeometryBytes: geometryBytes,
      textures: textureBytes > 0 ? 1 : 0,
      textureBytes,
      maxTextureDimension: textureBytes > 0 ? 1024 : 0,
    },
  };
}

function instance(
  id: string,
  modelId: string,
  visible = true,
): BgCustomModelInstance {
  return {
    id,
    modelId,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    visible,
  };
}

describe("Studio BG3D model cache residency adapter", () => {
  it("projects decoded geometry and texture bytes with live reference counts", () => {
    const cache = new Map<string, StudioBg3dModelRootCacheEntry>([
      [studioBg3dModelCacheKey("model:a", "webgl"), cacheEntry("model:a", 40, 20)],
      [studioBg3dModelCacheKey("model:b", "webgl"), cacheEntry("model:b", 30, 10)],
    ]);
    const candidates = buildStudioBg3dModelCacheResidencyCandidates({
      cache,
      instances: [
        instance("instance:a1", "model:a"),
        instance("instance:a2", "model:a", false),
        instance("instance:b1", "model:b", false),
      ],
      selectedInstanceIds: new Set(["instance:b1"]),
      pinnedModelIds: new Set(["model:a"]),
      lastUsedOrdinalByModelId: new Map([
        ["model:a", 4],
        ["model:b", 9],
      ]),
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        assetId: studioBg3dModelCacheKey("model:a", "webgl"),
        estimatedGpuBytes: 60,
        visibleRefCount: 1,
        selectedRefCount: 0,
        pinCount: 1,
        lastUsedOrdinal: 4,
      }),
      expect.objectContaining({
        assetId: studioBg3dModelCacheKey("model:b", "webgl"),
        estimatedGpuBytes: 40,
        visibleRefCount: 0,
        selectedRefCount: 1,
        pinCount: 0,
        lastUsedOrdinal: 9,
      }),
    ]);
  });

  it("only offers completely unused cache entries for eviction", () => {
    const cache = new Map<string, StudioBg3dModelRootCacheEntry>([
      [studioBg3dModelCacheKey("model:visible", "webgl"), cacheEntry("model:visible", 60, 20)],
      [studioBg3dModelCacheKey("model:warm", "webgl"), cacheEntry("model:warm", 30, 10)],
      [studioBg3dModelCacheKey("model:cold", "webgl"), cacheEntry("model:cold", 30, 10)],
    ]);
    const plan = planStudioBg3dModelCacheResidency({
      budgetBytes: 120,
      cache,
      instances: [instance("instance:visible", "model:visible")],
      lastUsedOrdinalByModelId: new Map([
        ["model:warm", 10],
        ["model:cold", 1],
      ]),
    });

    expect(plan.residentAssetIds).toEqual([studioBg3dModelCacheKey("model:visible", "webgl"), studioBg3dModelCacheKey("model:warm", "webgl")]);
    expect(plan.evictAssetIds).toEqual([studioBg3dModelCacheKey("model:cold", "webgl")]);
    expect(plan.overBudgetBytes).toBe(0);
  });

  it("동일 storage ID의 각 GPU root를 별도 계상하고 두 variant 모두 저장 ID의 참조·고정·최근사용 정보를 받는다", () => {
    const cache = new Map(( ["webgl", "webgpu"] as const).map((backend) => [studioBg3dModelCacheKey("model:a", backend), cacheEntry("model:a", 40, 20, backend)]));
    const candidates = buildStudioBg3dModelCacheResidencyCandidates({ cache, instances: [instance("selected", "model:a")],
      selectedInstanceIds: new Set(["selected"]), pinnedModelIds: new Set(["model:a"]),
      lastUsedOrdinalByModelId: new Map([["model:a", 9]]), prefetchPriorityByModelId: new Map([["model:a", 2]]) });
    expect(candidates).toHaveLength(2);
    candidates.forEach((candidate) => expect(candidate).toMatchObject({ estimatedGpuBytes: 60, visibleRefCount: 1, selectedRefCount: 1, pinCount: 1, lastUsedOrdinal: 9, prefetchPriority: 2 }));
    const plan = planStudioBg3dModelCacheResidency({ budgetBytes: 60, cache, instances: [instance("selected", "model:a")] });
    expect(plan.evictAssetIds).toEqual([]); expect(plan.overBudgetBytes).toBe(60);
    cache.forEach((entry) => expect(entry.dispose).not.toHaveBeenCalled());
  });

  it("퇴거 ID는 cache key여서 차가운 variant만 제거하고 다른 살아 있는 root의 소유권을 보존한다", () => {
    const glKey = studioBg3dModelCacheKey("model:live", "webgl"), gpuKey = studioBg3dModelCacheKey("model:live", "webgpu"), coldKey = studioBg3dModelCacheKey("model:cold", "webgpu");
    const cache = new Map([[glKey, cacheEntry("model:live", 30, 10)], [gpuKey, cacheEntry("model:live", 30, 10, "webgpu")], [coldKey, cacheEntry("model:cold", 30, 10, "webgpu")]]);
    const before = new Map(cache), plan = planStudioBg3dModelCacheResidency({ budgetBytes: 80, cache, instances: [instance("visible", "model:live")] });
    expect(plan.evictAssetIds).toEqual([coldKey]);
    for (const key of plan.evictAssetIds) { cache.get(key)?.dispose(); cache.delete(key); }
    expect(cache.get(glKey)).toBe(before.get(glKey)); expect(cache.get(gpuKey)).toBe(before.get(gpuKey));
    expect(before.get(coldKey)?.dispose).toHaveBeenCalledOnce(); expect(before.get(glKey)?.dispose).not.toHaveBeenCalled(); expect(before.get(gpuKey)?.dispose).not.toHaveBeenCalled();
  });
});
