// @vitest-environment jsdom

import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createStudioBg3dInferenceService } from "./studio-bg3d-inference-service";
import {
  useStudioBg3dInference,
  useStudioBg3dInferenceSnapshot,
} from "./useStudioBg3dInference";

afterEach(() => {
  cleanup();
});

describe("useStudioBg3dInference (공개 훅)", () => {
  it("렌더가 바뀌어도 같은 서비스를 돌려주고 스냅샷은 상태 변화에 맞춰 갱신된다", () => {
    const { result, rerender } = renderHook(() => useStudioBg3dInference());
    const first = result.current.service;
    rerender();
    expect(result.current.service).toBe(first);
    expect(result.current.snapshot.session.active).toBe(false);
    act(() => first.begin("wall", { referencePoint: [0, 0, 0] }));
    expect(result.current.snapshot.session.active).toBe(true);
    expect(result.current.snapshot.session.tool).toBe("wall");
  });

  it("넘겨 받은 서비스를 재사용한다", () => {
    const service = createStudioBg3dInferenceService();
    const { result } = renderHook(() => useStudioBg3dInference({ service }));
    expect(result.current.service).toBe(service);
  });

  it("창 수준 키보드가 붙고 언마운트하면 떨어진다", () => {
    const { result, unmount } = renderHook(() => useStudioBg3dInference());
    act(() => result.current.service.begin("wall", { referencePoint: [0, 0, 0] }));
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(result.current.snapshot.session.lock).toEqual({ kind: "axis", axis: "x" });
    const service = result.current.service;
    unmount();
    fireEvent.keyDown(document.body, { key: "ArrowUp" });
    expect(service.getSnapshot().session.lock).toEqual({ kind: "axis", axis: "x" });
  });

  it("keyboard:false 면 키보드를 붙이지 않는다", () => {
    const { result } = renderHook(() => useStudioBg3dInference({ keyboard: false }));
    act(() => result.current.service.begin("wall", { referencePoint: [0, 0, 0] }));
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(result.current.snapshot.session.lock).toEqual({ kind: "none" });
  });

  it("스냅샷 구독 훅만 따로 쓸 수 있다", () => {
    const service = createStudioBg3dInferenceService();
    const { result } = renderHook(() => useStudioBg3dInferenceSnapshot(service));
    act(() => service.begin("measure", {}));
    expect(result.current.session.tool).toBe("measure");
  });
});
