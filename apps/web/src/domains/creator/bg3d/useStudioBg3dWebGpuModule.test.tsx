// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { STUDIO_BG3D_ENGINE_MODULE_TIMEOUT_MS, useStudioBg3dWebGpuModule } from "./useStudioBg3dWebGpuModule";
import type { createStudioBg3dThreeWebGpuRenderer } from "./studio-bg3d-three-webgpu-renderer";

type Factory = typeof createStudioBg3dThreeWebGpuRenderer;
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("WebGPU 엔진 파일 수신", () => {
  it("장치 제한 시간보다 늦게 내려받아도 같은 화면에 팩토리를 전달한다", async () => {
    vi.useFakeTimers();
    const missing = vi.fn(), factory = vi.fn<Factory>();
    const entry = Promise.withResolvers<Factory>();
    const load = vi.fn(() => entry.promise);
    const { result } = renderHook(() => useStudioBg3dWebGpuModule(true, undefined, missing, load));
    act(() => vi.advanceTimersByTime(19_000));
    expect(result.current).toBeNull();
    await act(async () => entry.resolve(factory));
    expect(result.current).toBe(factory);
    act(() => vi.advanceTimersByTime(STUDIO_BG3D_ENGINE_MODULE_TIMEOUT_MS));
    expect(missing).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();
  });

  it("전송 시간 초과 후 늦은 응답을 무시하고 재시도에서 받은 파일을 사용한다", async () => {
    vi.useFakeTimers();
    const failed = vi.fn(), first = Promise.withResolvers<Factory>(), retry = vi.fn<Factory>();
    const load = vi.fn<() => Promise<Factory>>().mockReturnValueOnce(first.promise).mockResolvedValueOnce(retry);
    const view = renderHook(({ enabled }) => useStudioBg3dWebGpuModule(enabled, undefined, failed, load), { initialProps: { enabled: true } });
    act(() => vi.advanceTimersByTime(STUDIO_BG3D_ENGINE_MODULE_TIMEOUT_MS));
    expect(failed).toHaveBeenCalledWith(expect.stringContaining("엔진 파일"));
    await act(async () => first.resolve(vi.fn<Factory>()));
    expect(view.result.current).toBeNull();
    view.rerender({ enabled: false });
    await act(async () => view.rerender({ enabled: true }));
    expect(view.result.current).toBe(retry);
  });

  it("편집기가 닫힌 뒤 도착한 네트워크 오류는 다음 장면에 전파하지 않는다", async () => {
    const failed = vi.fn(), entry = Promise.withResolvers<Factory>(), load = () => entry.promise;
    const view = renderHook(() => useStudioBg3dWebGpuModule(true, undefined, failed, load));
    view.unmount();
    await act(async () => entry.reject(new Error("offline")));
    expect(failed).not.toHaveBeenCalled();
  });
});
