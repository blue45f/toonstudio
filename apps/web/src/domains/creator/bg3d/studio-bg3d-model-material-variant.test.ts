import { describe, expect, expectTypeOf, it } from "vitest";

import { deleteStudioBg3dModelCacheVariants, deleteStudioBg3dOwnedModelCacheEntry, isStudioBg3dOwnedModelCacheEntry,
  readStudioBg3dModelCacheEntry, resolveStudioBg3dMaterialBackend, studioBg3dModelCacheKey, studioBg3dModelRuntimeVariant } from "./studio-bg3d-model-material-variant";
import type { bindStudioBg3dEditorSceneGraph } from "./StudioBg3dEditorSceneGraph";
import type { StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";

/** 실제 동적 호스트의 매개변수 타입을 재사용한다. 새 우회 타입이나 실제 SceneGraph 실행은 추가하지 않는다. */
function readLegacySceneGraphCache(host: Parameters<typeof bindStudioBg3dEditorSceneGraph>[0]) {
  return { entry: readStudioBg3dModelCacheEntry(host.modelRootCacheRef.current, "source", "webgl"),
    removed: deleteStudioBg3dModelCacheVariants(host.modelRootCacheRef.current, "source") };
}

describe("실제 renderer와 명시적 재질 backend", () => {
  it("CPU 기본 호출은 WebGL이며 초기 canvas 요청은 renderer 없이도 WebGPU를 명시한다", () => {
    expect(resolveStudioBg3dMaterialBackend()).toBe("webgl");
    expect(resolveStudioBg3dMaterialBackend({ renderer: null, materialBackend: "webgpu" })).toBe("webgpu");
  });
  it("장치 품질 대신 실제 renderer 브랜드로 재질을 선택한다", () => {
    expect(resolveStudioBg3dMaterialBackend({ renderer: { isWebGPURenderer: true } })).toBe("webgpu");
    expect(resolveStudioBg3dMaterialBackend({ renderer: { isWebGLRenderer: true } })).toBe("webgl");
    expect(() => resolveStudioBg3dMaterialBackend({ renderer: { isWebGLRenderer: true }, materialBackend: "webgpu" })).toThrow(/실제 renderer/u);
  });
  it("브랜드가 없거나 동시에 두 renderer를 주장하면 파싱을 시작하지 않는다", () => {
    expect(() => resolveStudioBg3dMaterialBackend({ renderer: {} })).toThrow(/명확/u);
    expect(() => resolveStudioBg3dMaterialBackend({ renderer: { isWebGLRenderer: true, isWebGPURenderer: true } })).toThrow(/명확/u);
  });
  it("unknown host의 실제 GPU 브랜드를 읽고 명시 backend와 다르면 거부한다", () => {
    const renderer: unknown = { isWebGPURenderer: true };
    expect(resolveStudioBg3dMaterialBackend({ renderer })).toBe("webgpu");
    expect(resolveStudioBg3dMaterialBackend({ renderer, materialBackend: "webgpu" })).toBe("webgpu");
    expect(() => resolveStudioBg3dMaterialBackend({ renderer, materialBackend: "webgl" })).toThrow(/실제 renderer/u);
    expect(resolveStudioBg3dMaterialBackend({ renderer: undefined, materialBackend: "webgpu" })).toBe("webgpu");
    expect(resolveStudioBg3dMaterialBackend({ renderer: null })).toBe("webgl");
  });
  it.each([
    { label: "문자열", renderer: "webgpu" }, { label: "숫자", renderer: 1 }, { label: "불리언", renderer: false },
    { label: "함수", renderer: () => undefined }, { label: "배열", renderer: [] }, { label: "빈 객체", renderer: {} },
    { label: "문자열 브랜드", renderer: { isWebGLRenderer: "true" } },
    { label: "모두 false", renderer: { isWebGLRenderer: false, isWebGPURenderer: false } },
  ])("값이 있는 잘못된 unknown renderer $label 은 WebGL 기본값으로 처리하지 않는다", ({ renderer }) => {
    expect(() => resolveStudioBg3dMaterialBackend({ renderer, materialBackend: "webgpu" })).toThrow(/명확/u);
  });
  it("storage ID 문자열과 재질 backend를 구분하며 서로 다른 variant key를 만든다", () => {
    const id = 'model:["webgpu"]';
    expect(studioBg3dModelCacheKey(id, "webgl")).not.toBe(studioBg3dModelCacheKey(id, "webgpu"));
    expect(JSON.parse(studioBg3dModelCacheKey(id, "webgl"))).toEqual([id, studioBg3dModelRuntimeVariant("webgl")]);
  });
  it("얇은 source host도 실제 두 variant key로 등록한 서로 다른 root를 정확히 읽는다", () => {
    const id = 'model:["webgpu"]';
    const webgl = { record: { id }, runtimeVariant: studioBg3dModelRuntimeVariant("webgl"), root: { userData: { hint: "WebGL 원본" } } };
    const webgpu = { record: { id }, runtimeVariant: studioBg3dModelRuntimeVariant("webgpu"), root: { userData: { hint: "WebGPU 원본" } } };
    const cache = new Map([[studioBg3dModelCacheKey(id, "webgl"), webgl], [studioBg3dModelCacheKey(id, "webgpu"), webgpu]]);
    expectTypeOf(readStudioBg3dModelCacheEntry(cache, id, "webgpu")).toEqualTypeOf<typeof webgpu | undefined>();
    expect(readStudioBg3dModelCacheEntry(cache, id, "webgl2")).toBe(webgl);
    expect(readStudioBg3dModelCacheEntry(cache, id, "webgpu")?.root.userData.hint).toBe("WebGPU 원본");
    expect(isStudioBg3dOwnedModelCacheEntry(cache, id, { ...webgl })).toBe(false);
    expect(deleteStudioBg3dOwnedModelCacheEntry(cache, id, webgl)).toBe(true);
    expect(readStudioBg3dModelCacheEntry(cache, id, "webgpu")).toBe(webgpu);
    expect(readStudioBg3dModelCacheEntry(cache, id, "webgl")).toBeUndefined();
    const removed = deleteStudioBg3dModelCacheVariants(cache, id);
    expectTypeOf(removed).toEqualTypeOf<readonly (typeof webgpu)[]>();
    expect(removed).toEqual([webgpu]);
  });
  it("실제 레거시 동적 호스트는 root·animations·metrics를 가진 기존 full 반환 타입을 유지한다", () => {
    const result = readLegacySceneGraphCache({ modelRootCacheRef: { current: new Map<string, StudioBg3dModelRootCacheEntry>() } });
    expectTypeOf(result.entry).toEqualTypeOf<StudioBg3dModelRootCacheEntry | undefined>();
    expectTypeOf(result.entry?.root).toEqualTypeOf<StudioBg3dModelRootCacheEntry["root"] | undefined>();
    expectTypeOf(result.entry?.animations).toEqualTypeOf<StudioBg3dModelRootCacheEntry["animations"] | undefined>();
    expectTypeOf(result.entry?.metrics).toEqualTypeOf<StudioBg3dModelRootCacheEntry["metrics"] | undefined>();
    expectTypeOf(result.removed).toEqualTypeOf<readonly StudioBg3dModelRootCacheEntry[]>();
    expect(result.entry).toBeUndefined(); expect(result.removed).toEqual([]);
  });
  it("stamp 부재·반대 stamp·다른 record ID와 raw alias를 허가하지 않는다", () => {
    const id = "thin-source", key = studioBg3dModelCacheKey(id, "webgl");
    const unstamped = { record: { id }, root: { userData: {} } };
    expect(readStudioBg3dModelCacheEntry(new Map([[key, unstamped]]), id, "webgl")).toBeUndefined();
    const wrongBackend = { ...unstamped, runtimeVariant: studioBg3dModelRuntimeVariant("webgpu") };
    const cache = new Map([[key, wrongBackend], [id, { ...unstamped, runtimeVariant: studioBg3dModelRuntimeVariant("webgl") }]]);
    expect(readStudioBg3dModelCacheEntry(cache, id, "webgl")).toBeUndefined();
    expect(readStudioBg3dModelCacheEntry(cache, id, "webgpu")).toBeUndefined();
    const wrongRecord = { ...wrongBackend, record: { id: "different-source" }, runtimeVariant: studioBg3dModelRuntimeVariant("webgl") };
    expect(readStudioBg3dModelCacheEntry(new Map([[key, wrongRecord]]), id, "webgl")).toBeUndefined();
  });
});
