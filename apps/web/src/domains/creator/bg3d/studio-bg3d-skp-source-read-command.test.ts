import { parseSkp } from "openskp";
import { Group } from "three";
import { describe, expect, it, vi } from "vitest";

import { extractStudioBg3dSkpSceneManifest } from "./studio-bg3d-skp-scene-manifest";
import { studioBg3dModelCacheKey, studioBg3dModelRuntimeVariant } from "./studio-bg3d-model-material-variant";
import { createStudioBg3dSkpSceneSourceVffBytes } from "./studio-bg3d-skp-scene-source.test-fixture";
import { studioBg3dSkpGeometryTransform, unavailableStudioBg3dSkpSceneSource, type StudioBg3dSkpSceneSource } from "./studio-bg3d-skp-scene-source";
import {
  createStudioBg3dSkpSourceReaderFromHost, inspectStudioBg3dSkpSourceSelection,
  type StudioBg3dSkpSourceReadResult,
} from "./studio-bg3d-skp-source-read-command";

type ReaderModule = typeof import("./studio-bg3d-skp-scene-provenance");
const cacheKey = (id = "asset-a") => studioBg3dModelCacheKey(id, "webgl");
const cacheEntry = (root: Group) => ({ root, runtimeVariant: studioBg3dModelRuntimeVariant("webgl"), record: { id: "asset-a" } });

function availableSource(): Extract<StudioBg3dSkpSceneSource, { readonly status: "available" }> {
  const bytes = createStudioBg3dSkpSceneSourceVffBytes(), source = new Uint8Array(bytes.length);
  source.set(bytes);
  const extracted = extractStudioBg3dSkpSceneManifest(parseSkp(source.buffer));
  if (!extracted.ok) throw new Error(extracted.detail);
  return { version: 1, status: "available", reason: null, manifest: extracted.value, geometryTransform: studioBg3dSkpGeometryTransform() };
}

function loadedRoot(source: unknown): Group {
  const root = new Group();
  root.userData.toonstudioSkpSceneSource = source;
  return root;
}

function hostFixture() {
  const source = availableSource(), root = loadedRoot(source), other = loadedRoot(unavailableStudioBg3dSkpSceneSource("parser-unavailable"));
  const selectedIds = new Set(["instance-a"]), cache = new Map([
    [studioBg3dModelCacheKey("asset-a", "webgl"), { root, runtimeVariant: studioBg3dModelRuntimeVariant("webgl"), record: { id: "asset-a" } }],
    [studioBg3dModelCacheKey("asset-b", "webgl"), { root: other, runtimeVariant: studioBg3dModelRuntimeVariant("webgl"), record: { id: "asset-b" } }],
  ]);
  const host = {
    open: true, selectedIds, selectedIdsRef: { current: selectedIds },
    physicsRuntimeSourceRef: { current: {
      customModels: [{ id: "instance-a", modelId: "asset-a", name: "SKP 배경", locked: true }, { id: "instance-b", modelId: "asset-b", name: "다른 모델", locked: false }],
      primitives: [{ id: "primitive-a" }],
    } }, modelRootCacheRef: { current: cache },
    // 읽기에서는 문서 변경 잠금과 변경 명령을 사용하지 않는다.
    physicsInteractionLocked: true, isCapturing: true, document: { revision: 4 }, history: { undo: ["previous"] },
  };
  return { host, cache, source, root, other };
}

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve(value: T) { if (!resolve) throw new Error("uninitialized deferred"); resolve(value); } };
}

function expectFailure(result: StudioBg3dSkpSourceReadResult, code: string): void {
  if (result.ok) throw new Error(`expected ${code}, got success`);
  expect(result.code).toBe(code);
  expect(result.messageKo.length).toBeGreaterThan(0);
  expect("value" in result).toBe(false);
}

describe("실제 선택 모델의 SKP 원본 정보 조회", () => {
  it.each(["webgl", "webgpu"] as const)("%s variant만 읽고 반대 backend 캐시는 유지한다", async (backend) => {
    const f = hostFixture();
    const gpu = { ...cacheEntry(f.other), runtimeVariant: studioBg3dModelRuntimeVariant("webgpu") };
    f.cache.set(studioBg3dModelCacheKey("asset-a", "webgpu"), gpu);
    const host = { ...f.host, materialBackend: backend,
      modelRenderer: backend === "webgpu" ? { isWebGPURenderer: true } : { isWebGLRenderer: true } };
    const output = await createStudioBg3dSkpSourceReaderFromHost(host)();
    expect(output.ok && output.value.status).toBe(backend === "webgpu" ? "unavailable" : "available");
    expect(f.cache.get(studioBg3dModelCacheKey("asset-a", "webgpu"))).toBe(gpu);
  });

  it.each(["missing-stamp", "wrong-stamp", "wrong-record", "raw-alias"] as const)("%s entry는 준비된 원본으로 취급하지 않는다", async (kind) => {
    const f = hostFixture(), entry = cacheEntry(f.root); f.cache.clear();
    if (kind === "missing-stamp") Object.defineProperty(entry, "runtimeVariant", { value: undefined });
    if (kind === "wrong-stamp") entry.runtimeVariant = studioBg3dModelRuntimeVariant("webgpu");
    if (kind === "wrong-record") entry.record.id = "other-record";
    f.cache.set(kind === "raw-alias" ? "asset-a" : cacheKey(), entry);
    expectFailure(await createStudioBg3dSkpSourceReaderFromHost(f.host)(), "model-loading");
  });

  it("하나의 custom model만 검사하고 잠긴 모델도 읽을 수 있다", () => {
    const { host } = hostFixture();
    expect(inspectStudioBg3dSkpSourceSelection(host)).toEqual({ scopeKey: JSON.stringify(["instance-a", "asset-a"]), modelName: "SKP 배경", blockedReason: null });
  });

  it("최소 host에서도 instance와 storage의 경계를 구분한 scope를 만든다", async () => {
    const { host } = hostFixture();
    const minimal = { open: true, selectedIds: host.selectedIds, physicsRuntimeSourceRef: host.physicsRuntimeSourceRef, modelRootCacheRef: host.modelRootCacheRef };
    expect((await createStudioBg3dSkpSourceReaderFromHost(minimal)()).ok).toBe(true);
    const a = { open: true, selectedIds: new Set(["a:b"]), physicsRuntimeSourceRef: { current: { customModels: [{ id: "a:b", modelId: "c" }] } } };
    const b = { open: true, selectedIds: new Set(["a"]), physicsRuntimeSourceRef: { current: { customModels: [{ id: "a", modelId: "b:c" }] } } };
    expect(inspectStudioBg3dSkpSourceSelection(a).scopeKey).not.toBe(inspectStudioBg3dSkpSourceSelection(b).scopeKey);
    expectFailure(await createStudioBg3dSkpSourceReaderFromHost(a)(), "model-loading");
  });

  it("선택·런타임·캐시가 없거나 primitive/혼합/누락 ID이면 선택을 추측하지 않는다", async () => {
    const { host } = hostFixture();
    for (const ids of [new Set<string>(), new Set(["primitive-a"]), new Set(["missing"]), new Set(["instance-a", "primitive-a"]), new Set(["instance-a", "instance-b"])]) {
      host.selectedIdsRef.current = ids;
      expect(inspectStudioBg3dSkpSourceSelection(host).scopeKey).toBeNull();
      expectFailure(await createStudioBg3dSkpSourceReaderFromHost(host)(), "selection-unavailable");
    }
    expect(inspectStudioBg3dSkpSourceSelection({}).scopeKey).toBeNull();
    expectFailure(await createStudioBg3dSkpSourceReaderFromHost({})(), "selection-unavailable");
    host.selectedIdsRef.current = new Set(["instance-a"]); host.open = false;
    expectFailure(await createStudioBg3dSkpSourceReaderFromHost(host)(), "selection-unavailable");
  });

  it("중복 ID와 비어 있는 storage ID를 거부한다", async () => {
    const { host } = hostFixture(), first = host.physicsRuntimeSourceRef.current.customModels[0];
    if (!first) throw new Error("fixture missing");
    host.physicsRuntimeSourceRef.current.customModels.push({ ...first });
    expectFailure(await createStudioBg3dSkpSourceReaderFromHost(host)(), "selection-unavailable");
    host.physicsRuntimeSourceRef.current.customModels = [{ ...first, modelId: "" }];
    expectFailure(await createStudioBg3dSkpSourceReaderFromHost(host)(), "selection-unavailable");
    host.physicsRuntimeSourceRef.current.customModels = [first];
    host.physicsRuntimeSourceRef.current.primitives.push({ id: first.id });
    expectFailure(await createStudioBg3dSkpSourceReaderFromHost(host)(), "selection-unavailable");
  });

  it("실제 Three root의 해당 storage 자산을 읽으며 문서/기록/선택/원본 자료를 바꾸지 않는다", async () => {
    const { host, source, root } = hostFixture();
    const before = JSON.stringify({ document: host.document, history: host.history, root: root.userData, selection: [...host.selectedIdsRef.current] });
    const result = await createStudioBg3dSkpSourceReaderFromHost(host)();
    expect(result).toEqual({ ok: true, value: source });
    if (!result.ok || result.value.status !== "available") throw new Error("actual source unavailable");
    expect(result.value).not.toBe(source);
    expect(result.value.manifest.pages.total).toBe(2);
    expect(JSON.stringify({ document: host.document, history: host.history, root: root.userData, selection: [...host.selectedIdsRef.current] })).toBe(before);
    host.selectedIdsRef.current = new Set(["instance-b"]);
    expect(await createStudioBg3dSkpSourceReaderFromHost(host)()).toEqual({ ok: true, value: unavailableStudioBg3dSkpSceneSource("parser-unavailable") });
  });

  it("모듈은 클릭 이후에만 준비하고 로딩 중인 자산은 준비된 뒤 재시도한다", async () => {
    const { host, cache, root } = hostFixture(), actual = await import("./studio-bg3d-skp-scene-provenance"), loadReader = vi.fn(async () => actual);
    cache.delete(cacheKey());
    const command = createStudioBg3dSkpSourceReaderFromHost(host, { loadReader });
    expect(loadReader).not.toHaveBeenCalled();
    expect(inspectStudioBg3dSkpSourceSelection(host)).toMatchObject({ scopeKey: JSON.stringify(["instance-a", "asset-a"]), modelName: "SKP 배경" });
    expect(inspectStudioBg3dSkpSourceSelection(host).blockedReason).not.toBeNull();
    expectFailure(await command(), "model-loading"); expect(loadReader).not.toHaveBeenCalled();
    cache.set(cacheKey(), cacheEntry(root));
    expect((await command()).ok).toBe(true); expect(loadReader).toHaveBeenCalledTimes(1);
  });

  it("legacy와 unavailable은 실제 상태와 원인을 그대로 전달한다", async () => {
    const { host, cache } = hostFixture();
    cache.set(cacheKey(), cacheEntry(new Group()));
    expect(await createStudioBg3dSkpSourceReaderFromHost(host)()).toMatchObject({ ok: true, value: { status: "legacy", manifest: null, reason: "not-recorded", geometryTransform: { status: "unknown" } } });
    cache.set(cacheKey(), cacheEntry(loadedRoot(unavailableStudioBg3dSkpSceneSource("manifest-budget-exceeded"))));
    expect(await createStudioBg3dSkpSourceReaderFromHost(host)()).toMatchObject({ ok: true, value: { status: "unavailable", manifest: null, reason: "manifest-budget-exceeded" } });
  });

  it("손상/예산 초과 자료를 legacy나 available로 바꾸지 않는다", async () => {
    const { host, cache, source } = hostFixture();
    cache.set(cacheKey(), cacheEntry(loadedRoot({ version: 2, status: "available" })));
    expectFailure(await createStudioBg3dSkpSourceReaderFromHost(host)(), "invalid-source");
    const first = source.manifest.pages.items[0];
    if (!first) throw new Error("fixture missing");
    const pages = Array.from({ length: 257 }, (_, index) => ({ ...first, key: `page:${index}` }));
    cache.set(cacheKey(), cacheEntry(loadedRoot({ ...source, manifest: { ...source.manifest, pages: { total: 257, stored: 257, sourceTotal: null, items: pages } } })));
    expectFailure(await createStudioBg3dSkpSourceReaderFromHost(host)(), "budget-exceeded");
  });
});

describe("실제 원본 정보 조회: 비동기 선택 경계", () => {
  it("같은 renderer/backend로 돌아와도 import 전에 캡처한 폐기 guard는 거부한다", async () => {
    const f = hostFixture(), actual = await import("./studio-bg3d-skp-scene-provenance"), waiting = deferred<ReaderModule>();
    const renderer = { isWebGLRenderer: true }; let active = true, guard = () => active;
    const host = { ...f.host, modelRenderer: renderer, get isMaterialBackendCurrent() { return guard; } };
    const read = vi.fn(actual.readStudioBg3dSkpSceneSource);
    const command = createStudioBg3dSkpSourceReaderFromHost(host, { loadReader: () => waiting.promise });
    const pending = command(); active = false; guard = () => true;
    waiting.resolve({ ...actual, readStudioBg3dSkpSceneSource: read });
    expectFailure(await pending, "selection-changed"); expect(read).not.toHaveBeenCalled();
    expect((await createStudioBg3dSkpSourceReaderFromHost(host)()).ok).toBe(true);
  });

  it.each(["instance", "storage", "closed"])("지연 로딩 동안 %s가 바뀌면 이전 모델을 읽지 않는다", async (change) => {
    const { host } = hostFixture(), actual = await import("./studio-bg3d-skp-scene-provenance"), waiting = deferred<ReaderModule>();
    const read = vi.fn(actual.readStudioBg3dSkpSceneSource);
    const command = createStudioBg3dSkpSourceReaderFromHost(host, { loadReader: () => waiting.promise });
    const pending = command();
    if (change === "instance") host.selectedIdsRef.current = new Set(["instance-b"]);
    else if (change === "storage") {
      const first = host.physicsRuntimeSourceRef.current.customModels[0];
      if (!first) throw new Error("fixture missing"); first.modelId = "asset-b";
    } else host.open = false;
    waiting.resolve({ ...actual, readStudioBg3dSkpSceneSource: read });
    expectFailure(await pending, "selection-changed"); expect(read).not.toHaveBeenCalled();
  });

  it("선택이 같으면 await 뒤의 최신 캐시를 읽는다", async () => {
    const { host, cache, other } = hostFixture(), actual = await import("./studio-bg3d-skp-scene-provenance"), waiting = deferred<ReaderModule>();
    const command = createStudioBg3dSkpSourceReaderFromHost(host, { loadReader: () => waiting.promise });
    const pending = command(); cache.set(cacheKey(), cacheEntry(other)); waiting.resolve(actual);
    expect(await pending).toEqual({ ok: true, value: unavailableStudioBg3dSkpSceneSource("parser-unavailable") });
  });

  it("await 중 캐시가 사라지면 실패하고 같은 버튼으로 재시도할 수 있다", async () => {
    const { host, cache, root } = hostFixture(), actual = await import("./studio-bg3d-skp-scene-provenance"), waiting = deferred<ReaderModule>();
    const command = createStudioBg3dSkpSourceReaderFromHost(host, { loadReader: () => waiting.promise });
    const pending = command(); cache.delete(cacheKey()); waiting.resolve(actual);
    expectFailure(await pending, "model-loading");
    cache.set(cacheKey(), cacheEntry(root)); expect((await command()).ok).toBe(true);
  });

  it("모듈 로딩 실패를 메시지로 반환하며 재시도를 막는 rejected Promise를 보관하지 않는다", async () => {
    const { host } = hostFixture(), actual = await import("./studio-bg3d-skp-scene-provenance");
    let attempt = 0;
    const command = createStudioBg3dSkpSourceReaderFromHost(host, { loadReader: async () => {
      if (attempt++ === 0) throw new Error("internal module failure"); return actual;
    } });
    expectFailure(await command(), "read-failed"); expect((await command()).ok).toBe(true);
  });

  it("실제 reader가 끝나는 동안 선택이 달라져도 이전 원본 정보를 반환하지 않는다", async () => {
    const { host, cache } = hostFixture(), actual = await import("./studio-bg3d-skp-scene-provenance");
    const get = cache.get.bind(cache);
    let count = 0;
    vi.spyOn(cache, "get").mockImplementation((id) => {
      if (++count === 2) host.selectedIdsRef.current = new Set(["instance-b"]);
      return get(id);
    });
    expectFailure(await createStudioBg3dSkpSourceReaderFromHost(host, { loadReader: async () => actual })(), "selection-changed");
  });

  it("캐시 접근 오류도 rejected Promise나 내부 오류 원문을 노출하지 않는다", async () => {
    const { host, cache } = hostFixture();
    vi.spyOn(cache, "get").mockImplementation(() => { throw new Error("private cache error"); });
    expect(inspectStudioBg3dSkpSourceSelection(host).blockedReason).not.toBeNull();
    const result = await createStudioBg3dSkpSourceReaderFromHost(host)();
    expectFailure(result, "read-failed");
    if (!result.ok) expect(result.messageKo).not.toContain("private cache error");
  });

  it("현재 선택 참조가 있으면 오래된 렌더의 선택을 읽지 않는다", async () => {
    const { host } = hostFixture();
    host.selectedIdsRef.current = new Set(["instance-b"]);
    expect(inspectStudioBg3dSkpSourceSelection(host).scopeKey).toBe(JSON.stringify(["instance-b", "asset-b"]));
    expect(await createStudioBg3dSkpSourceReaderFromHost(host)()).toMatchObject({ ok: true, value: { status: "unavailable" } });
    expect([...host.selectedIds]).toEqual(["instance-a"]);
  });
});
