// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStudioUnloadGuard } from "./useStudioUnloadGuard";
import type { StudioUnloadGuardOptions } from "../../studio-unsaved-work-guard";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function leaveEvent(): Event {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event;
}

function countBeforeUnloadCalls(calls: readonly (readonly unknown[])[]): number {
  return calls.filter(([kind]) => kind === "beforeunload").length;
}

describe("편집기 이탈 가드의 입력 task 수명", () => {
  it("첫 획을 받아들이면 React 재렌더 없이 같은 task의 이탈부터 막는다", () => {
    let dirty = false;
    const hasUnsavedWork = () => dirty;
    const rendered = vi.fn();
    const add = vi.spyOn(window, "addEventListener");
    const { result } = renderHook(() => {
      rendered();
      return useStudioUnloadGuard({ target: window, hasUnsavedWork });
    });
    const initialRenders = rendered.mock.calls.length;
    expect(countBeforeUnloadCalls(add.mock.calls)).toBe(0);
    expect(leaveEvent().defaultPrevented).toBe(false);

    act(() => {
      dirty = true;
      result.current(true);
      // act 종료나 effect 실행을 기다리지 않고, 바로 다음 native 이탈부터 보호한다.
      expect(leaveEvent().defaultPrevented).toBe(true);
      result.current(true);
    });
    expect(rendered).toHaveBeenCalledTimes(initialRenders);
    expect(countBeforeUnloadCalls(add.mock.calls)).toBe(1);
    dirty = false;
    expect(leaveEvent().defaultPrevented).toBe(false);
  });

  it("StrictMode 재연결은 한 리스너를 유지하고 unmount 뒤의 늦은 무장을 차단한다", () => {
    const hasUnsavedWork = () => true;
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const liveListeners = () => countBeforeUnloadCalls(add.mock.calls)
      - countBeforeUnloadCalls(remove.mock.calls);
    const { result, unmount } = renderHook(() => useStudioUnloadGuard({
      target: window, hasUnsavedWork,
    }), { wrapper: StrictMode });
    const arm = result.current;
    expect(liveListeners()).toBe(1);
    expect(leaveEvent().defaultPrevented).toBe(true);
    unmount();
    expect(liveListeners()).toBe(0);
    expect(leaveEvent().defaultPrevented).toBe(false);
    arm(true);
    expect(liveListeners()).toBe(0);
  });

  it("새 저장 판정과 외부 대상에 연결할 때 이전 대상의 리스너를 정리한다", () => {
    const second = new EventTarget();
    const initial: StudioUnloadGuardOptions = { target: window, hasUnsavedWork: () => true };
    const { result, rerender, unmount } = renderHook((options) => useStudioUnloadGuard(options), {
      initialProps: initial,
    });
    expect(leaveEvent().defaultPrevented).toBe(true);
    rerender({ target: second, hasUnsavedWork: () => false });
    expect(leaveEvent().defaultPrevented).toBe(false);
    const saved = new Event("beforeunload", { cancelable: true });
    second.dispatchEvent(saved);
    expect(saved.defaultPrevented).toBe(false);
    rerender({ target: second, hasUnsavedWork: () => true });
    const dirty = new Event("beforeunload", { cancelable: true });
    second.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
    act(() => result.current(false));
    const disarmed = new Event("beforeunload", { cancelable: true });
    second.dispatchEvent(disarmed);
    expect(disarmed.defaultPrevented).toBe(false);
    unmount();
  });
});
