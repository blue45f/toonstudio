// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useVoiceCompareBridge } from "./use-voice-compare-bridge";
import type { VoiceCompareController } from "./voice-compare-view";
import type { VoiceViewSnapshot } from "./review-voice-commentary-model";

const view: VoiceViewSnapshot = { surface: "compare", poolItemId: "pool-2", pageId: null, mode: "overlay", scale: 8, tx: -0.75, ty: 1 };
afterEach(cleanup);
describe("음성 비교 탭 등록 브리지", () => {
  it("탭 렌더 전에 도착한 마지막 위치만 실제 controller가 등록될 때 적용한다", () => {
    const { result } = renderHook(() => useVoiceCompareBridge());
    const apply = vi.fn(() => true), controller: VoiceCompareController = { apply, capture: () => ({ view, pinThreadIds: ["pin-2"] }) };
    act(() => { result.current.apply({ ...view, tx: 0 }, ["pin-old"]); result.current.apply(view, ["pin-2"]); });
    expect(apply).not.toHaveBeenCalled();
    act(() => result.current.register(controller));
    expect(apply).toHaveBeenCalledExactlyOnceWith(view, ["pin-2"]);
    expect(result.current.capture()).toEqual({ view, pinThreadIds: ["pin-2"] });
    act(() => { result.current.register(null); result.current.register(controller); });
    expect(apply).toHaveBeenCalledTimes(1);
  });
  it("소스가 아직 없으면 대기를 유지하고 풀 재등록 뒤 성공할 때만 지운다", () => {
    const { result } = renderHook(() => useVoiceCompareBridge());
    const apply = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    const controller: VoiceCompareController = { apply, capture: () => null };
    act(() => { result.current.register(controller); result.current.apply(view, []); });
    act(() => result.current.register(controller));
    expect(apply).toHaveBeenCalledTimes(2);
    act(() => result.current.register(controller));
    expect(apply).toHaveBeenCalledTimes(2);
  });
  it("원고로 이동한 큐는 이전 비교 대기를 취소하고 새 회차의 브리지에는 이전 위치가 없다", () => {
    const first = renderHook(() => useVoiceCompareBridge());
    act(() => { first.result.current.apply(view, []); first.result.current.apply({ ...view, surface: "manuscript", pageId: "page-1" }, []); });
    const apply = vi.fn(() => true), controller: VoiceCompareController = { apply, capture: () => null };
    act(() => first.result.current.register(controller));
    expect(apply).not.toHaveBeenCalled();
    first.unmount();
    const next = renderHook(() => useVoiceCompareBridge());
    act(() => next.result.current.register(controller));
    expect(apply).not.toHaveBeenCalled();
  });
});
