import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  enableStudio3dHighAssetQuality,
  getStudio3dAssetQualityMode,
  getStudio3dAssetQualitySnapshot,
  resetStudio3dAssetQualityMode,
  subscribeStudio3dAssetQuality,
} from "../studio-3d-asset-quality-session";

import { resolveStudioBg3dDeviceQuality } from "./studio-bg3d-device-quality";
import { StudioBg3dStaleModalOperationError } from "./studio-bg3d-modal-operation-coordinator";
import {
  admitAndCacheStudioBg3dModel,
  type StudioBg3dModelRootCacheEntry,
} from "./studio-bg3d-model-runtime-admission";
import { createDefaultStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { deriveStudioBg3dSessionGlbValidationPolicy } from "./studio-bg3d-session-glb-policy";
import { deleteStudioBg3dModelCacheVariants, deleteStudioBg3dOwnedModelCacheEntry, isStudioBg3dOwnedModelCacheEntry, readStudioBg3dModelCacheEntry, studioBg3dModelCacheKey, studioBg3dModelRuntimeVariant } from "./studio-bg3d-model-material-variant";

import type { Bg3dVerifiedStoredRecord } from "./bg3d-model-library";

const mocks = vi.hoisted(() => ({ admit: vi.fn(), load: vi.fn() }));
vi.mock("./studio-bg3d-model-library-loader", () => ({ admitStoredBg3dModelForRenderingV12: mocks.admit }));
vi.mock("../studio-background-3d-model", async (importOriginal) => ({
  ...await importOriginal<typeof import("../studio-background-3d-model")>(),
  loadVerifiedStudioBg3dGlbWithThree: mocks.load,
}));

function loadedModel() {
  return {
    ok: true as const,
    root: new Group(),
    animations: [],
    dispose: vi.fn(),
    metrics: { nodes: 1, triangles: 1, drawCalls: 1, materials: 1, lights: 0, animations: 0, animationChannels: 0, animationKeyframes: 0, animationValues: 0, skins: 0, joints: 0, morphTargets: 0, accessorElements: 3, estimatedDecodedGeometryBytes: 36, textures: 0, textureBytes: 0, maxTextureDimension: 0 },
  };
}

function context(): Parameters<typeof admitAndCacheStudioBg3dModel>[0] {
  const document = createDefaultStudioBg3dSceneDocument();
  // Persistence and binary validation are mocked; these are the immutable fields used by this boundary.
  const record = {
    id: "session-quality-model",
    contentHash: `sha256:${"a".repeat(64)}`,
    byteSize: 100,
    mime: "model/gltf-binary",
    rights: { status: "owned", commercialUse: true, attributionRequired: false },
  } as Bg3dVerifiedStoredRecord;
  return {
    record,
    document,
    quality: resolveStudioBg3dDeviceQuality({ document, mode: "capture", preference: "mobile", signals: { cssWidth: 375, cssHeight: 812, devicePixelRatio: 2, pointer: "coarse", saveData: false, deviceMemoryGb: 6, hardwareConcurrency: 8 } }),
    cumulativeUsedBytes: 0,
    renderer: null,
    cache: new Map<string, StudioBg3dModelRootCacheEntry>(),
    pending: new Map<string, Promise<StudioBg3dModelRootCacheEntry>>(),
    isActive: () => true,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

beforeEach(() => {
  resetStudio3dAssetQualityMode();
  mocks.admit.mockReset().mockResolvedValue({ admitted: true });
  mocks.load.mockReset().mockImplementation(async () => loadedModel());
});
afterEach(() => resetStudio3dAssetQualityMode());

describe("session model admission and cache authorization", () => {
  it("일반 업로드의 2m 정규화를 유지하고 역배율에 사용할 실제 캐시 배율을 기록한다", async () => {
    const loaded = loadedModel();
    loaded.root.add(new Mesh(new BoxGeometry(20, 12, 8), new MeshBasicMaterial()));
    mocks.load.mockResolvedValue(loaded);
    const entry = await admitAndCacheStudioBg3dModel(context());
    expect(entry.normalizationScale).toBe(0.1);
    expect(entry.root.scale.toArray()).toEqual([0.1, 0.1, 0.1]);
  });

  it("이전 scope의 같은 backend pending이 취소되면 유효한 새 요청은 한 번만 이어서 준비한다", async () => {
    const args = context(), oldLoaded = loadedModel(), gate = Promise.withResolvers<ReturnType<typeof loadedModel>>(); let oldCurrent = true;
    mocks.load.mockReturnValueOnce(gate.promise);
    const old = admitAndCacheStudioBg3dModel({ ...args, isActive: () => oldCurrent });
    const oldRejection = expect(old).rejects.toBeInstanceOf(StudioBg3dStaleModalOperationError);
    await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledOnce()); oldCurrent = false;
    const fresh = admitAndCacheStudioBg3dModel(args); gate.resolve(oldLoaded);
    await oldRejection; const entry = await fresh;
    expect(mocks.load).toHaveBeenCalledTimes(2); expect(oldLoaded.dispose).toHaveBeenCalledOnce();
    expect(entry.root).not.toBe(oldLoaded.root); expect(args.cache.size).toBe(1); expect(args.pending.size).toBe(0);
  });

  it.each(["parse", "permission"] as const)("이전 scope가 끝났어도 실제 %s 실패는 새 요청에서 재실행하지 않는다", async (stage) => {
    const args = context(), gate = Promise.withResolvers<unknown>(); let oldCurrent = true;
    if (stage === "parse") mocks.load.mockReturnValueOnce(gate.promise); else mocks.admit.mockReturnValueOnce(gate.promise);
    const old = admitAndCacheStudioBg3dModel({ ...args, isActive: () => oldCurrent });
    const oldRejection = expect(old).rejects.toThrow();
    await vi.waitFor(() => expect(stage === "parse" ? mocks.load : mocks.admit).toHaveBeenCalledOnce()); oldCurrent = false;
    const fresh = admitAndCacheStudioBg3dModel(args), rejection = expect(fresh).rejects.toThrow();
    if (stage === "parse") gate.resolve({ ok: false, code: "parse-failed", message: "parse failed" }); else gate.reject(new Error("not authorized"));
    await Promise.all([oldRejection, rejection]);
    expect(mocks.admit).toHaveBeenCalledOnce(); expect(mocks.load).toHaveBeenCalledTimes(stage === "parse" ? 1 : 0); expect(args.cache.size).toBe(0);
  });

  it("늦게 끝난 이전 scope의 finally는 새 pending을 삭제하지 않는다", async () => {
    const args = context(), first = Promise.withResolvers<ReturnType<typeof loadedModel>>(), second = Promise.withResolvers<ReturnType<typeof loadedModel>>(); let oldCurrent = true;
    mocks.load.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const old = admitAndCacheStudioBg3dModel({ ...args, isActive: () => oldCurrent }), rejection = expect(old).rejects.toBeInstanceOf(StudioBg3dStaleModalOperationError);
    await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledOnce()); oldCurrent = false;
    const key = studioBg3dModelCacheKey(args.record.id, "webgl"); args.pending.delete(key);
    const fresh = admitAndCacheStudioBg3dModel(args), freshPending = args.pending.get(key);
    first.resolve(loadedModel()); await rejection;
    expect(freshPending).toBeDefined(); expect(args.pending.get(key)).toBe(freshPending);
    second.resolve(loadedModel()); await fresh; expect(args.pending.size).toBe(0); expect(mocks.load).toHaveBeenCalledTimes(2);
  });

  it("새 요청도 취소됐다면 이전 scope의 취소를 승계해 decode하지 않는다", async () => {
    const args = context(), controller = new AbortController(), gate = Promise.withResolvers<ReturnType<typeof loadedModel>>(); let oldCurrent = true;
    mocks.load.mockReturnValueOnce(gate.promise);
    const old = admitAndCacheStudioBg3dModel({ ...args, isActive: () => oldCurrent }), oldRejection = expect(old).rejects.toBeInstanceOf(StudioBg3dStaleModalOperationError);
    await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledOnce()); oldCurrent = false;
    const fresh = admitAndCacheStudioBg3dModel({ ...args, signal: controller.signal }), rejection = expect(fresh).rejects.toBeInstanceOf(StudioBg3dStaleModalOperationError);
    controller.abort(); gate.resolve(loadedModel()); await Promise.all([oldRejection, rejection]);
    expect(mocks.load).toHaveBeenCalledOnce(); expect(args.cache.size).toBe(0); expect(args.pending.size).toBe(0);
  });

  it("같은 storage ID도 WebGL·WebGPU root와 정책 stamp를 분리하고 callback ID는 유지한다", async () => {
    const args = context(), created = vi.fn();
    const webgl = await admitAndCacheStudioBg3dModel({ ...args, materialBackend: "webgl", onCacheEntryCreated: created });
    const webgpu = await admitAndCacheStudioBg3dModel({ ...args, materialBackend: "webgpu", onCacheEntryCreated: created });
    expect(webgpu).not.toBe(webgl); expect(webgpu.root).not.toBe(webgl.root);
    expect(webgl.runtimeVariant).toBe(studioBg3dModelRuntimeVariant("webgl"));
    expect(webgpu.runtimeVariant).toBe(studioBg3dModelRuntimeVariant("webgpu"));
    expect(args.cache.get(studioBg3dModelCacheKey(args.record.id, "webgl"))).toBe(webgl);
    expect(args.cache.get(studioBg3dModelCacheKey(args.record.id, "webgpu"))).toBe(webgpu);
    expect(await admitAndCacheStudioBg3dModel({ ...args, materialBackend: "webgl" })).toBe(webgl);
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(mocks.load.mock.calls.map((call) => call[2].materialBackend)).toEqual(["webgl", "webgpu"]);
    expect(created.mock.calls.map(([id]) => id)).toEqual([args.record.id, args.record.id]);
  });

  it("서로 다른 backend의 동시 pending을 합치지 않고 각각 한 번만 decode한다", async () => {
    const args = context(), validation = deferred<{ admitted: boolean }>();
    mocks.admit.mockReturnValue(validation.promise);
    const first = admitAndCacheStudioBg3dModel({ ...args, materialBackend: "webgl" });
    const second = admitAndCacheStudioBg3dModel({ ...args, materialBackend: "webgpu" });
    await vi.waitFor(() => expect(args.pending.size).toBe(2));
    validation.resolve({ admitted: true });
    const [webgl, webgpu] = await Promise.all([first, second]);
    expect(webgl).not.toBe(webgpu); expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(args.pending.size).toBe(0); expect(args.cache.size).toBe(2);
  });

  it("variant key에 다른 backend의 entry가 들어 있으면 재사용하거나 재파싱하지 않는다", async () => {
    const args = context(), webgpu = await admitAndCacheStudioBg3dModel({ ...args, materialBackend: "webgpu" });
    args.cache.set(studioBg3dModelCacheKey(args.record.id, "webgl"), webgpu);
    await expect(admitAndCacheStudioBg3dModel({ ...args, materialBackend: "webgl" })).rejects.toThrow(/캐시의 재질 backend/u);
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });

  it("UI 조회와 rollback은 backend·소유 identity를 확인하고 전체 삭제는 unique 소유 목록을 반환한다", async () => {
    const args = context(), id = args.record.id;
    const webgl = await admitAndCacheStudioBg3dModel({ ...args, materialBackend: "webgl" });
    const webgpu = await admitAndCacheStudioBg3dModel({ ...args, materialBackend: "webgpu" });
    expect(readStudioBg3dModelCacheEntry(args.cache, id, "webgl2")).toBe(webgl);
    expect(readStudioBg3dModelCacheEntry(args.cache, id, "webgpu")).toBe(webgpu);
    expect(isStudioBg3dOwnedModelCacheEntry(args.cache, id, webgl)).toBe(true);
    expect(isStudioBg3dOwnedModelCacheEntry(args.cache, "different-model", webgl)).toBe(false);
    expect(deleteStudioBg3dOwnedModelCacheEntry(args.cache, id, { ...webgl })).toBe(false);
    expect(deleteStudioBg3dOwnedModelCacheEntry(args.cache, id, webgl)).toBe(true);
    args.cache.set(id, webgl);
    expect(readStudioBg3dModelCacheEntry(args.cache, id, "webgl")).toBeUndefined();
    args.cache.set("legacy-alias", webgpu);
    expect(new Set(deleteStudioBg3dModelCacheVariants(args.cache, id))).toEqual(new Set([webgl, webgpu]));
    expect(args.cache.size).toBe(0); expect(webgl.dispose).not.toHaveBeenCalled(); expect(webgpu.dispose).not.toHaveBeenCalled();
  });

  it("reuses only an identical policy fingerprint", async () => {
    const args = context();
    enableStudio3dHighAssetQuality();
    const first = await admitAndCacheStudioBg3dModel(args);
    expect(await admitAndCacheStudioBg3dModel(args)).toBe(first);
    expect(mocks.admit).toHaveBeenCalledTimes(1);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(first.admissionPolicyKeys?.size).toBe(1);
  });

  it("does not let a cached high-profile approval bypass automatic admission", async () => {
    const args = context();
    mocks.admit.mockImplementation(async (_id, options) => {
      if (options.budgets.mobile.textures.maxTotalBytes < 144 * 1024 * 1024) throw new Error("texture-byte-budget-exceeded");
      return { admitted: true };
    });
    enableStudio3dHighAssetQuality();
    const entry = await admitAndCacheStudioBg3dModel(args);
    expect(entry.admittedProfiles.has("mobile")).toBe(true);
    resetStudio3dAssetQualityMode();
    await expect(admitAndCacheStudioBg3dModel(args)).rejects.toThrow("texture-byte-budget-exceeded");
    expect(mocks.admit).toHaveBeenCalledTimes(2);
    expect(mocks.admit.mock.calls[1][1].budgets.mobile.textures.maxTotalBytes).toBe(128 * 1024 * 1024);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(getStudio3dAssetQualitySnapshot()).toEqual({ mode: "auto", notice: null });
  });

  it("revalidates legacy profile-only cache entries instead of treating them as authorized", async () => {
    const args = context();
    const entry = await admitAndCacheStudioBg3dModel(args);
    delete entry.admissionPolicyKeys;
    expect(entry.admittedProfiles.has("mobile")).toBe(true);
    const readmitted = await admitAndCacheStudioBg3dModel(args);
    expect(mocks.admit).toHaveBeenCalledTimes(2);
    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(readmitted).toBe(entry);
    expect(readmitted.admissionPolicyKeys?.size).toBe(1);
  });

  it("does not decode if policy changes during binary validation", async () => {
    const args = context();
    const validation = deferred<{ admitted: boolean }>();
    mocks.admit.mockReturnValue(validation.promise);
    enableStudio3dHighAssetQuality();
    const loading = admitAndCacheStudioBg3dModel(args);
    const rejection = expect(loading).rejects.toBeInstanceOf(StudioBg3dStaleModalOperationError);
    await vi.waitFor(() => expect(mocks.admit).toHaveBeenCalledOnce());
    resetStudio3dAssetQualityMode();
    validation.resolve({ admitted: true });
    await rejection;
    expect(mocks.load).not.toHaveBeenCalled();
    expect(args.cache.size).toBe(0);
    expect(args.pending.size).toBe(0);
  });

  it("disposes a decoded high-quality root when the mode changes before installation", async () => {
    const args = context();
    const decode = deferred<ReturnType<typeof loadedModel>>();
    const loaded = loadedModel();
    mocks.load.mockReturnValue(decode.promise);
    enableStudio3dHighAssetQuality();
    const loading = admitAndCacheStudioBg3dModel(args);
    const rejection = expect(loading).rejects.toBeInstanceOf(StudioBg3dStaleModalOperationError);
    await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
    resetStudio3dAssetQualityMode();
    decode.resolve(loaded);
    await rejection;
    expect(loaded.dispose).toHaveBeenCalledOnce();
    expect(args.cache.size).toBe(0);
    expect(args.pending.size).toBe(0);
    expect(getStudio3dAssetQualitySnapshot()).toEqual({ mode: "auto", notice: null });
  });

  it.each(["검증", "디코딩"].flatMap((stage) => [undefined, true, false].map((preserve) => ({ stage, preserve }))))(
    "$stage 실패 시 이전 옵션 $preserve와 무관하게 원래 오류·전역 품질·기존 원본과 캐시를 보존한다",
    async ({ stage, preserve }) => {
      const args = context();
      const existing = await admitAndCacheStudioBg3dModel({ ...args, record: { ...args.record, id: "unrelated-model" } });
      mocks.admit.mockClear();
      mocks.load.mockClear();
      const original = structuredClone({ record: args.record, document: args.document, quality: args.quality });
      const error = new Error("GPU allocation failed");
      if (stage === "검증") mocks.admit.mockRejectedValue(error);
      else mocks.load.mockRejectedValue(error);
      enableStudio3dHighAssetQuality();
      const before = getStudio3dAssetQualitySnapshot();
      const onQualityChange = vi.fn();
      const unsubscribe = subscribeStudio3dAssetQuality(onQualityChange);
      try {
        await expect(admitAndCacheStudioBg3dModel({ ...args,
          ...(preserve === undefined ? {} : { preserveQualityModeOnFailure: preserve }),
        })).rejects.toBe(error);
        expect(getStudio3dAssetQualitySnapshot()).toBe(before);
        expect(onQualityChange).not.toHaveBeenCalled();
        expect({ record: args.record, document: args.document, quality: args.quality }).toEqual(original);
        expect(args.cache).toEqual(new Map([[studioBg3dModelCacheKey("unrelated-model", "webgl"), existing]]));
        expect(existing.dispose).not.toHaveBeenCalled();
        expect(args.pending.size).toBe(0);
        expect(mocks.admit).toHaveBeenCalledOnce();
        expect(mocks.load).toHaveBeenCalledTimes(stage === "검증" ? 0 : 1);
      } finally { unsubscribe(); }
    },
  );

  it.each([
    { name: "AbortError", errorFactory: () => new DOMException("cancelled", "AbortError") },
    { name: "Worker 취소", errorFactory: () => Object.assign(new Error("cancelled"), { code: "aborted" }) },
    { name: "stale 작업", errorFactory: () => new StudioBg3dStaleModalOperationError() },
  ].flatMap((failure) => [undefined, true, false].map((preserve) => ({ ...failure, preserve }))))(
    "$name 취소는 이전 옵션 $preserve와 무관하게 오류와 품질 snapshot을 보존한다",
    async ({ errorFactory, preserve }) => {
      const args = context();
      const error = errorFactory();
      mocks.admit.mockRejectedValue(error);
      enableStudio3dHighAssetQuality();
      const snapshot = getStudio3dAssetQualitySnapshot();
      await expect(admitAndCacheStudioBg3dModel({ ...args,
        ...(preserve === undefined ? {} : { preserveQualityModeOnFailure: preserve }),
      })).rejects.toBe(error);
      expect(getStudio3dAssetQualitySnapshot()).toBe(snapshot);
      expect(args.cache.size).toBe(0);
      expect(args.pending.size).toBe(0);
      expect(mocks.load).not.toHaveBeenCalled();
    },
  );

  it("고품질 캐시의 실제 삼각형 cap 초과는 품질·원본·권리를 바꾸지 않고 거부한다", async () => {
    const args = context();
    const entry = await admitAndCacheStudioBg3dModel(args);
    enableStudio3dHighAssetQuality();
    const policy = deriveStudioBg3dSessionGlbValidationPolicy(args.document, args.quality);
    const cap = policy.budgets[policy.profile].complexity.maxTriangles;
    const oversized = { ...entry, metrics: { ...entry.metrics, triangles: cap + 1 } };
    args.cache.set(studioBg3dModelCacheKey(args.record.id, "webgl"), oversized);
    mocks.admit.mockClear();
    mocks.load.mockClear();
    const before = getStudio3dAssetQualitySnapshot();
    const original = structuredClone({ record: args.record, document: args.document, quality: args.quality });
    await expect(admitAndCacheStudioBg3dModel(args)).rejects.toMatchObject({ code: "triangle-budget-exceeded" });
    expect(getStudio3dAssetQualitySnapshot()).toBe(before);
    expect(deriveStudioBg3dSessionGlbValidationPolicy(args.document, args.quality)).toEqual(policy);
    expect({ record: args.record, document: args.document, quality: args.quality }).toEqual(original);
    expect(readStudioBg3dModelCacheEntry(args.cache, args.record.id, "webgl")).toBe(oversized);
    expect(entry.dispose).not.toHaveBeenCalled();
    expect(args.pending.size).toBe(0);
    expect(mocks.admit).not.toHaveBeenCalled();
    expect(mocks.load).not.toHaveBeenCalled();
  });

  it("디코딩 중 선택 세션이 stale이면 개인 root만 정리하고 고품질 선택을 유지한다", async () => {
    const args = context();
    const decode = deferred<ReturnType<typeof loadedModel>>();
    const loaded = loadedModel();
    let active = true;
    mocks.load.mockReturnValue(decode.promise);
    enableStudio3dHighAssetQuality();
    const before = getStudio3dAssetQualitySnapshot();
    const loading = admitAndCacheStudioBg3dModel({ ...args, isActive: () => active });
    const rejection = expect(loading).rejects.toBeInstanceOf(StudioBg3dStaleModalOperationError);
    await vi.waitFor(() => expect(mocks.load).toHaveBeenCalledOnce());
    active = false;
    decode.resolve(loaded);
    await rejection;
    expect(loaded.dispose).toHaveBeenCalledOnce();
    expect(getStudio3dAssetQualitySnapshot()).toBe(before);
    expect(args.cache.size).toBe(0);
    expect(args.pending.size).toBe(0);
  });

  it("does not reset a high-quality session for an already-aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    enableStudio3dHighAssetQuality();
    await expect(admitAndCacheStudioBg3dModel({ ...context(), signal: controller.signal })).rejects.toBeInstanceOf(StudioBg3dStaleModalOperationError);
    expect(getStudio3dAssetQualityMode()).toBe("high");
    expect(mocks.admit).not.toHaveBeenCalled();
  });
});
