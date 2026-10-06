// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSpaceBuildPlacement } from "./use-space-build-placement";
import type { StudioBuildPlacementEvent } from "../studio-virtual-space-build-placement";
import type { StudioBuildPlacementRequest } from "../studio-virtual-space-build-mode";
import { StudioVirtualSpaceEngineBridge } from "../studio-virtual-space-engine-bridge";

const LAMP = "furniture:floor-lamp";
const REQUEST: StudioBuildPlacementRequest = {
  entryId: LAMP, category: "furniture", refId: "floor-lamp", point: { x: 784, y: 960 }, rotation: 0,
};

function setup(initial: readonly StudioBuildPlacementRequest[] = []) {
  const bridge = new StudioVirtualSpaceEngineBridge();
  let requests = initial;
  const onRequestsChange = vi.fn((next: readonly StudioBuildPlacementRequest[]) => { requests = next; });
  const view = renderHook(
    (props: { requests: readonly StudioBuildPlacementRequest[] }) =>
      useSpaceBuildPlacement({ bridge, requests: props.requests, onRequestsChange }),
    { initialProps: { requests } },
  );
  return {
    bridge, view, onRequestsChange,
    getRequests: () => requests,
    rerender: () => view.rerender({ requests }),
    emit: (event: StudioBuildPlacementEvent) => act(() => { view.result.current.handleCanvasEvent(event); }),
  };
}

describe("useSpaceBuildPlacement", () => {
  it("세션을 시작하면 브리지 채널이 열리고 취소하면 닫힌다", () => {
    const { bridge, view } = setup();
    act(() => { view.result.current.panel.onStart(LAMP); });
    expect(view.result.current.panel.sessionEntryId).toBe(LAMP);
    expect(bridge.getBuildPlacementEntryId()).toBe(LAMP);
    act(() => { view.result.current.panel.onCancel(); });
    expect(view.result.current.panel.sessionEntryId).toBeNull();
    expect(bridge.getBuildPlacementEntryId()).toBeNull();
  });

  it("확정 이벤트는 기존 목록에 배치 요청을 붙여 저장 경로로 보낸다", () => {
    const { view, emit, onRequestsChange, getRequests, rerender } = setup();
    act(() => { view.result.current.panel.onStart(LAMP); });
    emit({ type: "confirm", request: REQUEST });
    expect(onRequestsChange).toHaveBeenCalledTimes(1);
    expect(getRequests()).toEqual([REQUEST]);
    rerender();
    // 연속 배치: 다른 지점 확정도 이어서 붙는다.
    emit({ type: "confirm", request: { ...REQUEST, point: { x: 832, y: 960 } } });
    expect(getRequests()).toHaveLength(2);
  });

  it("같은 지점 중복 확정은 저장하지 않고 안내를 남긴다", () => {
    const { view, emit, onRequestsChange } = setup([REQUEST]);
    emit({ type: "confirm", request: REQUEST });
    expect(onRequestsChange).not.toHaveBeenCalled();
    expect(view.result.current.panel.noticeText?.ko).toContain("가까워요");
  });

  it("거부 이벤트는 이유 안내로, 판정 이벤트는 상태 문구로 이어진다", () => {
    const { view, emit } = setup();
    emit({ type: "rejected", reason: "bounds" });
    expect(view.result.current.panel.noticeText?.ko).toContain("가장자리");
    emit({ type: "verdict", verdict: { ok: true, reason: null, point: REQUEST.point } });
    expect(view.result.current.panel.statusText?.ko).toContain("놓을 수 있는");
    emit({ type: "verdict", verdict: { ok: false, reason: "access", point: REQUEST.point } });
    expect(view.result.current.panel.statusText?.ko).toContain("놓을 수 없어요");
  });

  it("캔버스 취소 이벤트가 오면 세션과 브리지가 함께 닫힌다", () => {
    const { bridge, view, emit } = setup();
    act(() => { view.result.current.panel.onStart(LAMP); });
    emit({ type: "cancelled" });
    expect(view.result.current.panel.sessionEntryId).toBeNull();
    expect(bridge.getBuildPlacementEntryId()).toBeNull();
  });
});
