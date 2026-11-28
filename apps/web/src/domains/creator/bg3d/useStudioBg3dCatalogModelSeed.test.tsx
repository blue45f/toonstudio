// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { findStudioObjectInsertItem, planStudioObjectInsertPlacement } from "../studio-object-insert-catalog";
import {
  parseStudioObjectInsertDragPayload, resolveStudioBg3dObjectSeed, resolveStudioObjectInsertOpenSeed,
  serializeStudioObjectInsertDragPayload,
} from "../studio-object-insert-drag";
import { useStudioBg3dCatalogModelSeed } from "./useStudioBg3dCatalogModelSeed";

import type { StudioBg3dModelImportActions } from "./studio-bg3d-editor-model-import-actions";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function controls() {
  return {
    importModelFiles: vi.fn<StudioBg3dModelImportActions["importModelFiles"]>(async () => true),
    placeBundledEnvironment: vi.fn(async () => true),
    consume: vi.fn(), setError: vi.fn(), sessionKey: "page-a", ready: true,
  };
}

describe("요소 패널 가구 배치", () => {
  it("클릭과 드롭의 동일한 seed를 렌더러 준비 후 장면 가져오기 경로에 한 번 전달한다", async () => {
    const item = findStudioObjectInsertItem("obj-furniture-chair_v8");
    const plan = planStudioObjectInsertPlacement({ itemId: "obj-furniture-chair_v8", canvasWidth: 800, canvasHeight: 1200 });
    if (!item || !plan) throw new Error("가구가 카탈로그에 없습니다.");
    const drag = parseStudioObjectInsertDragPayload(serializeStudioObjectInsertDragPayload({ item, plan }));
    if (!drag) throw new Error("잘못된 드롭 데이터입니다.");
    const click = resolveStudioObjectInsertOpenSeed(plan);
    expect(resolveStudioObjectInsertOpenSeed(drag)).toEqual(click);
    const seed = resolveStudioBg3dObjectSeed(click.bg3dSeedPrimitiveKind);
    expect(seed).toEqual({ seedPrimitiveKind: null, seedModelSourceId: item.sourceId });
    expect(resolveStudioBg3dObjectSeed("box")).toEqual({ seedPrimitiveKind: "box", seedModelSourceId: null });
    const options = controls();
    const fetcher = vi.fn(async () => new Response(new Uint8Array([103, 108, 84, 70])));
    vi.stubGlobal("fetch", fetcher);
    const h = renderHook(({ ready }) => useStudioBg3dCatalogModelSeed({ ...options, ready, sourceId: seed.seedModelSourceId }),
      { wrapper: StrictMode, initialProps: { ready: false } });
    expect(fetcher).not.toHaveBeenCalled();
    h.rerender({ ready: true });
    await waitFor(() => expect(options.consume).toHaveBeenCalledTimes(1));
    expect(fetcher).toHaveBeenCalledWith(item.assetUrl, { signal: expect.any(AbortSignal) });
    expect(options.importModelFiles).toHaveBeenCalledTimes(1);
    const [files, rights] = options.importModelFiles.mock.calls[0];
    expect(files[0].name).toBe(`${item.label}.glb`);
    expect(rights.licenseName).toBe("CC0-1.0");
    expect(options.setError).not.toHaveBeenCalled();
  });

  it("공식 배경은 원본 저장소 ID로 한 번 배치해 다른 기기에서도 같은 해시로 다시 연다", async () => {
    const item = findStudioObjectInsertItem("obj-environment-kr_modern_office_suite");
    if (!item?.bundledEnvironmentId) throw new Error("공식 배경에 원본 저장소 ID가 없습니다.");
    const options = controls();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    renderHook(() => useStudioBg3dCatalogModelSeed({ ...options, sourceId: item.sourceId }), { wrapper: StrictMode });
    await waitFor(() => expect(options.consume).toHaveBeenCalledTimes(1));
    expect(options.placeBundledEnvironment).toHaveBeenCalledExactlyOnceWith(item.bundledEnvironmentId, "floor", { frameEmptyScene: true, indoorLighting: item.family === "scene-interior" });
    expect(fetcher).not.toHaveBeenCalled();
    expect(options.importModelFiles).not.toHaveBeenCalled();
  });

  it("모르는 ID와 네트워크 오류는 원고 변경 없이 표시한다", async () => {
    const options = controls();
    const fetcher = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetcher);
    const h = renderHook(({ sourceId }) => useStudioBg3dCatalogModelSeed({ ...options, sourceId }),
      { initialProps: { sourceId: "https://example.invalid/model.glb" } });
    await waitFor(() => expect(options.consume).toHaveBeenCalledTimes(1));
    expect(fetcher).not.toHaveBeenCalled();
    h.rerender({ sourceId: "ce_bench" });
    await waitFor(() => expect(options.consume).toHaveBeenCalledTimes(2));
    expect(options.setError).toHaveBeenLastCalledWith(expect.stringContaining("404"));
    expect(options.importModelFiles).not.toHaveBeenCalled();
  });

  it("늦게 도착한 이전 장면의 파일은 새 장면에 배치하지 않는다", async () => {
    const options = controls();
    let resolve: (response: Response) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
    const h = renderHook(() => useStudioBg3dCatalogModelSeed({ ...options, sourceId: "chair_v8" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    h.unmount();
    await act(async () => resolve(new Response(new Uint8Array([1]))));
    expect(options.importModelFiles).not.toHaveBeenCalled();
    expect(options.consume).not.toHaveBeenCalled();
  });
});
