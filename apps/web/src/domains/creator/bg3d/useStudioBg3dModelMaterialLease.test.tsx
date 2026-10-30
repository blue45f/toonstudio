// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode, type PropsWithChildren } from "react";
import { afterEach, describe, expect, it } from "vitest";

import type { StudioBg3dMaterialBackend } from "./studio-bg3d-model-material-variant";
import { useStudioBg3dModelMaterialLease } from "./useStudioBg3dModelMaterialLease";

interface Renderer { readonly id: string; readonly isWebGLRenderer?: unknown; readonly isWebGPURenderer?: unknown }
interface Host {
  readonly modelRenderer: Renderer | null;
  readonly modelRendererRef: { current: Renderer | null };
  readonly materialBackend: StudioBg3dMaterialBackend;
}
function useLease(host: Host) {
  return useStudioBg3dModelMaterialLease({ renderer: host.modelRenderer, rendererRef: host.modelRendererRef, materialBackend: host.materialBackend });
}
function host(renderer: Renderer | null, materialBackend: StudioBg3dMaterialBackend, rendererRef = { current: renderer }): Host {
  return { modelRenderer: renderer, modelRendererRef: rendererRef, materialBackend };
}
afterEach(cleanup);

describe("BG3D 재질 renderer scope의 React 수명", () => {
  it("새 host 객체로 backend A→B→A를 렌더해도 이전 A 콜백은 부활하지 않는다", () => {
    const renderer = { id: "same-renderer", isWebGLRenderer: true }, initial = host(renderer, "webgl");
    const view = renderHook(({ value }) => useLease(value), { initialProps: { value: initial } });
    const oldA = view.result.current; expect(oldA()).toBe(true);
    view.rerender({ value: host(renderer, "webgpu", initial.modelRendererRef) });
    const b = view.result.current; expect(b()).toBe(false); expect(oldA()).toBe(false);
    view.rerender({ value: host(renderer, "webgl", initial.modelRendererRef) });
    expect(view.result.current()).toBe(true); expect(view.result.current).not.toBe(oldA);
    expect(oldA()).toBe(false); expect(b()).toBe(false);
  });

  it("새 host 객체와 같은 backend에서 renderer A→B→A여도 이전 A 작업을 차단한다", () => {
    const a = { id: "A", isWebGPURenderer: true }, b = { id: "B", isWebGPURenderer: true }, initial = host(a, "webgpu");
    const view = renderHook(({ value }) => useLease(value), { initialProps: { value: initial } });
    const oldA = view.result.current;
    act(() => { initial.modelRendererRef.current = b; });
    expect(oldA()).toBe(false);
    view.rerender({ value: host(b, "webgpu", initial.modelRendererRef) });
    const callbackB = view.result.current; expect(callbackB()).toBe(true);
    act(() => { initial.modelRendererRef.current = a; });
    view.rerender({ value: host(a, "webgpu", initial.modelRendererRef) });
    expect(view.result.current()).toBe(true); expect(oldA()).toBe(false); expect(callbackB()).toBe(false);
  });

  it("값이 같은 새 host 객체는 진행 중 작업을 취소하지 않고 unmount는 그 콜백을 폐기한다", () => {
    const renderer = { id: "A", isWebGLRenderer: true }, initial = host(renderer, "webgl");
    const view = renderHook(({ value }) => useLease(value), { initialProps: { value: initial } });
    const captured = view.result.current;
    view.rerender({ value: host(renderer, "webgl", initial.modelRendererRef) });
    expect(view.result.current).toBe(captured); expect(captured()).toBe(true);
    view.unmount(); expect(captured()).toBe(false);
  });

  it("renderer가 없으면 시작하지 않고 재렌더 전 ref 변경과 실제 GPU 준비를 구분한다", () => {
    const initial = host(null, "webgpu");
    const view = renderHook(({ value }) => useLease(value), { initialProps: { value: initial } });
    const pending = view.result.current; expect(pending()).toBe(false);
    act(() => { initial.modelRendererRef.current = { id: "ready", isWebGPURenderer: true }; });
    expect(pending()).toBe(false);
    view.rerender({ value: host(initial.modelRendererRef.current, "webgpu", initial.modelRendererRef) });
    expect(view.result.current()).toBe(true); expect(pending()).toBe(false);
  });

  it("StrictMode의 초기 setup·cleanup·setup 후 현재 콜백은 유효하고 unmount 후 무효다", () => {
    const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;
    const initial = host({ id: "strict", isWebGLRenderer: true }, "webgl");
    const view = renderHook(() => useLease(initial), { wrapper });
    const captured = view.result.current; expect(captured()).toBe(true);
    view.unmount(); expect(captured()).toBe(false);
  });

  it.each([
    { id: "unknown" }, { id: "dual", isWebGLRenderer: true, isWebGPURenderer: true },
    { id: "truthy", isWebGLRenderer: "true" },
  ])("판별할 수 없는 renderer '$id'는 두 backend 모두 차단한다", (renderer) => {
    const initial = host(renderer, "webgl");
    const view = renderHook(({ value }) => useLease(value), { initialProps: { value: initial } });
    const before = view.result.current; expect(before()).toBe(false);
    view.rerender({ value: host(renderer, "webgpu", initial.modelRendererRef) });
    expect(view.result.current()).toBe(false); expect(before()).toBe(false);
  });

  it("새 WebGPU plan이 확정돼도 이전 WebGL renderer가 남은 동안 새 lease도 무효다", () => {
    const gl = { id: "old", isWebGLRenderer: true }, gpu = { id: "new", isWebGPURenderer: true };
    const initial = host(gl, "webgl"), view = renderHook(({ value }) => useLease(value), { initialProps: { value: initial } });
    const old = view.result.current; expect(old()).toBe(true);
    view.rerender({ value: host(gl, "webgpu", initial.modelRendererRef) });
    const waiting = view.result.current; expect(waiting()).toBe(false); expect(old()).toBe(false);
    act(() => { initial.modelRendererRef.current = gpu; });
    view.rerender({ value: host(gpu, "webgpu", initial.modelRendererRef) });
    expect(view.result.current()).toBe(true); expect(waiting()).toBe(false); expect(old()).toBe(false);
  });
});
