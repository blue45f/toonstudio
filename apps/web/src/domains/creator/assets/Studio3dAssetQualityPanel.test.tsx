// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getStudio3dAssetQualityMode,
  getStudio3dAssetQualitySnapshot,
  resetStudio3dAssetQualityMode,
  subscribeStudio3dAssetQuality,
} from "../studio-3d-asset-quality-session";
import { Studio3dAssetQualityPanel } from "../Studio3dAssetQualityPanel";
import {
  getStudioBg3dWebglRecoverySnapshot,
  installStudioBg3dWebglContextRecovery,
  STUDIO_BG3D_WEBGL_RECOVERY_EVENT,
  type StudioBg3dWebglRecoveryController,
  type StudioBg3dWebglRecoveryNoticeDetail,
} from "../bg3d/studio-bg3d-webgl-context-recovery";

const recoveries = new Set<StudioBg3dWebglRecoveryController>();

function createRecovery(canvas: HTMLCanvasElement, resetRenderer: () => void = vi.fn()): StudioBg3dWebglRecoveryController {
  const controller: StudioBg3dWebglRecoveryController = installStudioBg3dWebglContextRecovery(canvas, {
    invalidate: vi.fn(), resetRenderer, scheduleFrame: () => 1, cancelFrame: vi.fn(),
    onStateChange(snapshot) {
      const detail: StudioBg3dWebglRecoveryNoticeDetail = { owner: canvas, snapshot, retry: () => controller.retry() };
      window.dispatchEvent(new CustomEvent(STUDIO_BG3D_WEBGL_RECOVERY_EVENT, { detail }));
    },
  });
  recoveries.add(controller);
  return controller;
}

function buttonDisabled(name: string): boolean {
  const button = screen.getByRole("button", { name });
  if (!(button instanceof HTMLButtonElement)) throw new Error("실제 button 요소가 필요합니다.");
  return button.disabled;
}

function deferredCheckpoint() {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>(accept => { resolve = accept; });
  return { promise, resolve };
}

function requestHighQuality(): void {
  fireEvent.click(screen.getByRole("button", { name: "고품질 · 현재 실행만" }));
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "장면 사본 저장 후 고품질 사용" }));
}

describe("Studio3dAssetQualityPanel", () => {
  beforeEach(() => {
    resetStudio3dAssetQualityMode();
    window.sessionStorage.clear();
  });
  afterEach(() => {
    cleanup();
    for (const recovery of recoveries) recovery.dispose();
    recoveries.clear();
    resetStudio3dAssetQualityMode();
  });

  it("keeps auto until explicit acknowledgement and a successful checkpoint", async () => {
    const checkpoint = deferredCheckpoint();
    const save = vi.fn(() => checkpoint.promise);
    render(<Studio3dAssetQualityPanel active disabled={false} emptyScene={false} onBeforeEnable={save} />);
    expect(getStudio3dAssetQualityMode()).toBe("auto");
    fireEvent.click(screen.getByRole("button", { name: "고품질 · 현재 실행만" }));
    expect(buttonDisabled("장면 사본 저장 후 고품질 사용")).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "장면 사본 저장 후 고품질 사용" }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(getStudio3dAssetQualityMode()).toBe("auto");
    await act(async () => { checkpoint.resolve(true); await checkpoint.promise; });
    expect(getStudio3dAssetQualityMode()).toBe("high");
    fireEvent.click(screen.getByRole("button", { name: "자동 · 기본" }));
    expect(getStudio3dAssetQualityMode()).toBe("auto");
  });

  it.each([false, "throw"])("does not enable high when checkpoint fails (%s)", async failure => {
    const save = vi.fn(async () => {
      if (failure === "throw") throw new Error("storage unavailable");
      return false;
    });
    render(<Studio3dAssetQualityPanel active disabled={false} emptyScene={false} onBeforeEnable={save} />);
    requestHighQuality();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("저장"));
    expect(getStudio3dAssetQualityMode()).toBe("auto");
    expect(buttonDisabled("장면 사본 저장 후 고품질 사용")).toBe(false);
  });

  it("explicitly skips a checkpoint for an empty background scene", async () => {
    const save = vi.fn(async () => true);
    render(<Studio3dAssetQualityPanel active disabled={false} emptyScene onBeforeEnable={save} />);
    fireEvent.click(screen.getByRole("button", { name: "고품질 · 현재 실행만" }));
    expect(screen.getByText(/현재 배경 장면이 비어 있어 사본 저장은 생략/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "확인 후 고품질 사용" }));
    await waitFor(() => expect(getStudio3dAssetQualityMode()).toBe("high"));
    expect(save).not.toHaveBeenCalled();
  });

  it("cancels a pending enable when the retained editor closes and permits a fresh attempt", async () => {
    const first = deferredCheckpoint();
    const save = vi.fn().mockImplementationOnce(() => first.promise).mockResolvedValue(true);
    const props = { disabled: false, emptyScene: false, onBeforeEnable: save };
    const view = render(<Studio3dAssetQualityPanel {...props} active />);
    requestHighQuality();
    view.rerender(<Studio3dAssetQualityPanel {...props} active={false} />);
    view.rerender(<Studio3dAssetQualityPanel {...props} active />);
    expect(screen.queryByRole("button", { name: "장면 사본 저장 중" })).toBeNull();
    await act(async () => { first.resolve(true); await first.promise; });
    expect(getStudio3dAssetQualityMode()).toBe("auto");
    requestHighQuality();
    await waitFor(() => expect(getStudio3dAssetQualityMode()).toBe("high"));
  });

  it("실제 owner의 WebGL 복구 권위는 늦은 checkpoint만 취소하고 선택한 모드를 보존한다", async () => {
    const checkpoint = deferredCheckpoint();
    const canvas = document.createElement("canvas");
    createRecovery(canvas);
    render(<Studio3dAssetQualityPanel active disabled={false} emptyScene={false} ownerCanvas={canvas} onBeforeEnable={() => checkpoint.promise} />);
    const before = getStudio3dAssetQualitySnapshot();
    requestHighQuality();
    fireEvent(canvas, new Event("webglcontextlost", { cancelable: true }));
    expect(screen.queryByRole("button", { name: "장면 사본 저장 중" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("GPU");
    expect(buttonDisabled("고품질 · 현재 실행만")).toBe(true);
    await act(async () => { checkpoint.resolve(true); await checkpoint.promise; });
    expect(getStudio3dAssetQualitySnapshot()).toBe(before);
    fireEvent(canvas, new Event("webglcontextrestored"));
    expect(buttonDisabled("고품질 · 현재 실행만")).toBe(false);
    requestHighQuality();
    await waitFor(() => expect(getStudio3dAssetQualityMode()).toBe("high"));
  });

  it("WebGPU 장치 실패는 선택 high를 보존하고 새 opt-in만 차단한다", async () => {
    const props = { active: true, disabled: false, emptyScene: false, onBeforeEnable: vi.fn(async () => true) };
    const view = render(<Studio3dAssetQualityPanel {...props} />);
    requestHighQuality();
    await waitFor(() => expect(getStudio3dAssetQualityMode()).toBe("high"));
    const before = getStudio3dAssetQualitySnapshot();
    view.rerender(<Studio3dAssetQualityPanel {...props} deviceLostMessage="device lost" />);
    expect(getStudio3dAssetQualitySnapshot()).toBe(before);
    expect(screen.getByRole("alert").textContent).toContain("선택한 메모리 모드는 유지");
    expect(buttonDisabled("고품질 · 현재 실행만")).toBe(true);
    view.rerender(<Studio3dAssetQualityPanel {...props} deviceLostMessage={null} />);
    expect(getStudio3dAssetQualitySnapshot()).toBe(before);
  });

  it("GPU 오류 전에 시작한 save가 늦게 끝나도 high를 켜지 않으며 복구 후 다시 시도할 수 있다", async () => {
    const checkpoint = deferredCheckpoint();
    const props = { active: true, disabled: false, emptyScene: false, onBeforeEnable: vi.fn(() => checkpoint.promise) };
    const view = render(<Studio3dAssetQualityPanel {...props} />);
    requestHighQuality();
    const before = getStudio3dAssetQualitySnapshot();
    view.rerender(<Studio3dAssetQualityPanel {...props} deviceLostMessage="GPU unavailable" />);
    await act(async () => { checkpoint.resolve(true); await checkpoint.promise; });
    expect(getStudio3dAssetQualitySnapshot()).toBe(before);
    expect(buttonDisabled("고품질 · 현재 실행만")).toBe(true);
    view.rerender(<Studio3dAssetQualityPanel {...props} deviceLostMessage={null} />);
    requestHighQuality();
    await waitFor(() => expect(getStudio3dAssetQualityMode()).toBe("high"));
    expect(props.onBeforeEnable).toHaveBeenCalledTimes(2);
  });

  it("다른 canvas의 raw·typed 복구 이벤트는 자기 checkpoint와 품질을 바꾸지 않는다", async () => {
    const checkpoint = deferredCheckpoint();
    const owner = document.createElement("canvas");
    const other = document.createElement("canvas");
    createRecovery(other);
    render(<Studio3dAssetQualityPanel active disabled={false} emptyScene={false} ownerCanvas={owner} onBeforeEnable={() => checkpoint.promise} />);
    requestHighQuality();
    const before = getStudio3dAssetQualitySnapshot();
    fireEvent(document, new Event("webglcontextlost"));
    fireEvent(other, new Event("webglcontextlost", { cancelable: true }));
    expect(screen.getByRole("button", { name: "장면 사본 저장 중" })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(getStudio3dAssetQualitySnapshot()).toBe(before);
    await act(async () => { checkpoint.resolve(true); await checkpoint.promise; });
    expect(getStudio3dAssetQualityMode()).toBe("high");
  });

  it("이미 선택한 high는 닫기·재열기·unmount·remount에서 같은 snapshot으로 유지된다", async () => {
    const props = { disabled: false, emptyScene: false, onBeforeEnable: vi.fn(async () => true) };
    const view = render(<Studio3dAssetQualityPanel {...props} active />);
    requestHighQuality();
    await waitFor(() => expect(getStudio3dAssetQualityMode()).toBe("high"));
    const before = getStudio3dAssetQualitySnapshot();
    const changed = vi.fn();
    const unsubscribe = subscribeStudio3dAssetQuality(changed);
    try {
      view.rerender(<Studio3dAssetQualityPanel {...props} active={false} />);
      expect(getStudio3dAssetQualitySnapshot()).toBe(before);
      view.rerender(<Studio3dAssetQualityPanel {...props} active />);
      view.unmount();
      expect(getStudio3dAssetQualitySnapshot()).toBe(before);
      render(<Studio3dAssetQualityPanel {...props} active />);
      expect(getStudio3dAssetQualitySnapshot()).toBe(before);
      expect(changed).not.toHaveBeenCalled();
      expect(screen.getByRole("status").textContent).toContain("3D 편집기를 닫아도 선택은 유지");
    } finally { unsubscribe(); }
  });

  it("이미 high인 실제 owner의 context loss·복구도 mode와 snapshot을 보존한다", async () => {
    const canvas = document.createElement("canvas");
    createRecovery(canvas);
    render(<Studio3dAssetQualityPanel active disabled={false} emptyScene={false} ownerCanvas={canvas} onBeforeEnable={async () => true} />);
    requestHighQuality();
    await waitFor(() => expect(getStudio3dAssetQualityMode()).toBe("high"));
    const before = getStudio3dAssetQualitySnapshot();
    fireEvent(canvas, new Event("webglcontextlost", { cancelable: true }));
    expect(getStudio3dAssetQualitySnapshot()).toBe(before);
    expect(screen.getByRole("alert").textContent).toContain("GPU");
    fireEvent(canvas, new Event("webglcontextrestored"));
    expect(getStudio3dAssetQualitySnapshot()).toBe(before);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each(["lost", "failed", "degraded"])("mount 이전의 %s 상태를 재열기에서도 읽고 실제 복구까지 차단한다", async (phase) => {
    const canvas = document.createElement("canvas");
    let fails = phase === "failed";
    createRecovery(canvas, () => { if (fails) throw new Error("실제 복구 실패"); });
    for (let index = 0; index < (phase === "degraded" ? 3 : 1); index++) {
      fireEvent(canvas, new Event("webglcontextlost", { cancelable: true }));
    }
    if (phase === "failed") fireEvent(canvas, new Event("webglcontextrestored"));
    expect(getStudioBg3dWebglRecoverySnapshot(canvas)?.phase).toBe(phase);
    const props = { active: true, disabled: false, emptyScene: false, ownerCanvas: canvas, onBeforeEnable: vi.fn(async () => true) };
    const before = getStudio3dAssetQualitySnapshot();
    const view = render(<Studio3dAssetQualityPanel {...props} />);
    expect(buttonDisabled("고품질 · 현재 실행만")).toBe(true);
    view.unmount();
    render(<Studio3dAssetQualityPanel {...props} />);
    expect(buttonDisabled("고품질 · 현재 실행만")).toBe(true);
    expect(getStudio3dAssetQualitySnapshot()).toBe(before);
    fails = false;
    fireEvent(canvas, new Event("webglcontextrestored"));
    expect(getStudioBg3dWebglRecoverySnapshot(canvas)?.phase).toBe("restored");
    expect(buttonDisabled("고품질 · 현재 실행만")).toBe(false);
    requestHighQuality();
    await waitFor(() => expect(getStudio3dAssetQualityMode()).toBe("high"));
    expect(props.onBeforeEnable).toHaveBeenCalledOnce();
  });

  it("동일 canvas 재설치와 이전 controller의 clear·가짜 restored는 실제 복구를 대신하지 않는다", () => {
    const canvas = document.createElement("canvas");
    const first = createRecovery(canvas);
    fireEvent(canvas, new Event("webglcontextlost", { cancelable: true }));
    render(<Studio3dAssetQualityPanel active disabled={false} emptyScene={false} ownerCanvas={canvas} onBeforeEnable={async () => true} />);
    expect(buttonDisabled("고품질 · 현재 실행만")).toBe(true);
    act(() => { createRecovery(canvas); });
    const current = getStudioBg3dWebglRecoverySnapshot(canvas);
    expect(current?.phase).toBe("lost");
    first.dispose();
    const stale: StudioBg3dWebglRecoveryNoticeDetail = { owner: canvas,
      snapshot: { degraded: false, lossCount: 0, phase: "restored", timestamp: 0 }, retry: () => false };
    act(() => {
      window.dispatchEvent(new CustomEvent(STUDIO_BG3D_WEBGL_RECOVERY_EVENT, { detail: { ...stale, snapshot: null } }));
      window.dispatchEvent(new CustomEvent(STUDIO_BG3D_WEBGL_RECOVERY_EVENT, { detail: stale }));
    });
    expect(getStudioBg3dWebglRecoverySnapshot(canvas)).toBe(current);
    expect(buttonDisabled("고품질 · 현재 실행만")).toBe(true);
    fireEvent(canvas, new Event("webglcontextrestored"));
    expect(buttonDisabled("고품질 · 현재 실행만")).toBe(false);
  });

  it("renderer owner 교체는 이전 checkpoint를 취소하며 새 owner에서 재시도한다", async () => {
    const checkpoint = deferredCheckpoint();
    const first = document.createElement("canvas");
    const second = document.createElement("canvas");
    const props = { active: true, disabled: false, emptyScene: false, onBeforeEnable: vi.fn(() => checkpoint.promise) };
    const view = render(<Studio3dAssetQualityPanel {...props} ownerCanvas={first} />);
    requestHighQuality();
    const before = getStudio3dAssetQualitySnapshot();
    view.rerender(<Studio3dAssetQualityPanel {...props} ownerCanvas={second} />);
    await act(async () => { checkpoint.resolve(true); await checkpoint.promise; });
    expect(getStudio3dAssetQualitySnapshot()).toBe(before);
    requestHighQuality();
    await waitFor(() => expect(getStudio3dAssetQualityMode()).toBe("high"));
    expect(props.onBeforeEnable).toHaveBeenCalledTimes(2);
  });

  it("자기 template checkpoint 동안 generic disabled가 켜져도 정상 저장 완료를 취소하지 않는다", async () => {
    const checkpoint = deferredCheckpoint();
    const save = vi.fn(() => checkpoint.promise);
    const props = { active: true, emptyScene: false, onBeforeEnable: save };
    const view = render(<Studio3dAssetQualityPanel {...props} disabled={false} />);
    requestHighQuality();
    expect(save).toHaveBeenCalledOnce();
    expect(buttonDisabled("장면 사본 저장 중")).toBe(true);
    expect(getStudio3dAssetQualityMode()).toBe("auto");
    view.rerender(<Studio3dAssetQualityPanel {...props} disabled />);
    await act(async () => { checkpoint.resolve(true); await checkpoint.promise; });
    expect(getStudio3dAssetQualityMode()).toBe("high");
  });

  it("checkpoint 중 다른 명시적 모드 선택이 발생하면 늦은 enable이 덮어쓰지 않는다", async () => {
    const checkpoint = deferredCheckpoint();
    const save = vi.fn(() => checkpoint.promise);
    render(<Studio3dAssetQualityPanel active disabled={false} emptyScene={false} onBeforeEnable={save} />);
    requestHighQuality();
    expect(save).toHaveBeenCalledOnce();
    expect(buttonDisabled("장면 사본 저장 중")).toBe(true);
    expect(getStudio3dAssetQualityMode()).toBe("auto");
    act(() => resetStudio3dAssetQualityMode("사용자가 자동 모드를 다시 선택했습니다."));
    const selected = getStudio3dAssetQualitySnapshot();
    await act(async () => { checkpoint.resolve(true); await checkpoint.promise; });
    expect(getStudio3dAssetQualitySnapshot()).toBe(selected);
    expect(getStudio3dAssetQualityMode()).toBe("auto");
  });

  it("does not opt in after unmount even if a save later succeeds", async () => {
    const checkpoint = deferredCheckpoint();
    const view = render(<Studio3dAssetQualityPanel active disabled={false} emptyScene={false} onBeforeEnable={() => checkpoint.promise} />);
    requestHighQuality();
    view.unmount();
    await act(async () => { checkpoint.resolve(true); await checkpoint.promise; });
    expect(getStudio3dAssetQualityMode()).toBe("auto");
  });
});
