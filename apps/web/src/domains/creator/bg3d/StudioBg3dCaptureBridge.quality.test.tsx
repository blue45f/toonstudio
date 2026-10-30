// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { PerspectiveCamera, Scene, type Camera } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CaptureBridge } from "./StudioBg3dCaptureBridge";
import { acquireStudioBg3dCaptureAdapterAfterViewTransition, captureStudioBg3dRaster, getStudioBg3dCaptureSourceSize,
  STUDIO_BG3D_CAPTURE_PROFILE_RGBA8_DEPTH_V1, type StudioBg3dCaptureAdapter } from "./studio-bg3d-capture-adapter";
import { assertStudioBg3dCaptureEnvironmentCurrent, publishStudioBg3dCaptureEnvironment } from "./studio-bg3d-capture-environment-receipt";
import { getStudioBg3dWebglRecoverySnapshot, STUDIO_BG3D_WEBGL_RECOVERY_EVENT,
  type StudioBg3dWebglRecoveryNoticeDetail } from "./studio-bg3d-webgl-context-recovery";
import type { CaptureState } from "./StudioBackground3DTypes";

interface BridgeRenderer {
  readonly domElement: HTMLCanvasElement;
  readonly getPixelRatio: () => number;
  readonly renderLists: { readonly dispose: () => void };
  readonly info: { readonly reset: () => void };
  readonly resetState: () => void;
}
interface BridgeScene {
  readonly camera: Camera;
  readonly gl: BridgeRenderer;
  readonly scene: Scene;
  readonly invalidate: () => void;
  readonly setDpr: (value: number) => void;
}
const ports = vi.hoisted(() => ({
  read: vi.fn<() => BridgeScene>(),
  load: vi.fn<typeof import("./studio-bg3d-editor-derivations")["loadStudioBg3dThreeWebglCaptureRuntime"]>(),
  createAdapter: vi.fn<typeof import("./studio-bg3d-three-webgl-capture")["createStudioBg3dThreeWebglCaptureAdapter"]>(),
}));
vi.mock("@react-three/fiber", () => ({ useThree: ports.read }));
vi.mock("./studio-bg3d-editor-derivations", () => ({ loadStudioBg3dThreeWebglCaptureRuntime: ports.load }));

const listenerCleanups: (() => void)[] = [];
beforeEach(() => { ports.read.mockReset(); ports.load.mockReset(); ports.createAdapter.mockReset(); });
afterEach(() => {
  cleanup();
  for (const dispose of listenerCleanups.splice(0).reverse()) dispose();
  vi.restoreAllMocks();
});

function isNotice(value: unknown): value is StudioBg3dWebglRecoveryNoticeDetail {
  if (!value || typeof value !== "object" || !("owner" in value) || !(value.owner instanceof HTMLCanvasElement)
    || !("retry" in value) || typeof value.retry !== "function" || !("snapshot" in value)) return false;
  if (value.snapshot === null) return true;
  const snapshot: unknown = value.snapshot;
  return snapshot !== null && typeof snapshot === "object" && "degraded" in snapshot && typeof snapshot.degraded === "boolean"
    && "lossCount" in snapshot && typeof snapshot.lossCount === "number" && "timestamp" in snapshot && typeof snapshot.timestamp === "number"
    && "phase" in snapshot && typeof snapshot.phase === "string" && ["healthy", "lost", "restored", "failed", "degraded"].includes(snapshot.phase);
}
function lastNotice(notices: readonly StudioBg3dWebglRecoveryNoticeDetail[]): StudioBg3dWebglRecoveryNoticeDetail {
  const notice = notices[notices.length - 1];
  if (!notice) throw Error("실제 controller의 복구 알림 필요"); return notice;
}

/** R3F hook과 캡처 adapter만 대체한다. 실제 component·controller·canvas EventTarget을 사용한다. */
function fixture(canvas = document.createElement("canvas")) {
  const camera = new PerspectiveCamera(), scene = new Scene();
  let selectedDpr = 2.5;
  const setDpr = vi.fn<(value: number) => void>((value) => { selectedDpr = value; });
  const renderListsDispose = vi.fn<() => void>(), infoReset = vi.fn<() => void>(), resetState = vi.fn<() => void>();
  const invalidate = vi.fn<() => void>();
  const renderer: BridgeRenderer = { domElement: canvas, getPixelRatio: () => selectedDpr,
    renderLists: { dispose: renderListsDispose }, info: { reset: infoReset }, resetState };
  const adapterDispose = vi.fn<() => void>();
  const adapter: StudioBg3dCaptureAdapter = { backend: "three-webgl", engineId: "three", engineVersion: "test-boundary",
    implementationRevision: "test-capture-boundary", graphicsApi: "webgl2", profileId: STUDIO_BG3D_CAPTURE_PROFILE_RGBA8_DEPTH_V1,
    getSourceSize: () => ({ width: 64, height: 32 }),
    capture: vi.fn<StudioBg3dCaptureAdapter["capture"]>().mockImplementation(async (request) => ({ width: request.width,
      height: request.height, rgba: new Uint8Array(request.width * request.height * 4) })), dispose: adapterDispose };
  ports.read.mockReturnValue({ camera, gl: renderer, scene, invalidate, setDpr });
  ports.createAdapter.mockReturnValue(adapter);
  ports.load.mockResolvedValue({ acquireStudioBg3dCaptureAdapterAfterViewTransition, captureStudioBg3dRaster,
    getStudioBg3dCaptureSourceSize, createStudioBg3dThreeWebglCaptureAdapter: ports.createAdapter });
  const notices: StudioBg3dWebglRecoveryNoticeDetail[] = [];
  const listener = (event: Event) => {
    if (!(event instanceof CustomEvent)) throw Error("실제 CustomEvent 필요");
    const detail: unknown = event.detail;
    if (!isNotice(detail)) throw Error("복구 알림 계약 필요");
    notices.push(detail);
  };
  window.addEventListener(STUDIO_BG3D_WEBGL_RECOVERY_EVENT, listener);
  listenerCleanups.push(() => window.removeEventListener(STUDIO_BG3D_WEBGL_RECOVERY_EVENT, listener));
  const update = vi.fn<(state: CaptureState, cleanupAdapter?: StudioBg3dCaptureAdapter | null) => void>();
  const view = render(<CaptureBridge onCaptureUpdate={update} />);
  return { canvas, camera, scene, renderer, adapter, adapterDispose, setDpr, renderListsDispose, infoReset, resetState, invalidate, notices, update, view };
}
function lose(canvas: HTMLCanvasElement): Event {
  const event = new Event("webglcontextlost", { cancelable: true });
  act(() => { canvas.dispatchEvent(event); }); return event;
}
function restore(canvas: HTMLCanvasElement): void {
  act(() => { canvas.dispatchEvent(new Event("webglcontextrestored")); });
}

describe("CaptureBridge의 해상도 보존형 WebGL 복구", () => {
  it("실제 adapter identity에 환경 권위를 필수 결박하고 bridge 해제 뒤 stale 캡처를 막는다", async () => {
    const f = fixture();
    await waitFor(() => expect(f.update).toHaveBeenCalledWith({ adapter: f.adapter, camera: f.camera }));
    const request = { width: 2, height: 2, background: { color: "#000000", alpha: 0 }, includeDepth: false };
    await expect(captureStudioBg3dRaster(f.adapter, request)).rejects.toThrow();
    expect(f.adapter.capture).not.toHaveBeenCalled();
    const owner = publishStudioBg3dCaptureEnvironment(f.scene, f.renderer,
      { fingerprint: "explicit-none", ready: Promise.resolve(true), isApplied: () => true });
    try {
      const owned = await captureStudioBg3dRaster(f.adapter, request, { expectedEnvironmentFingerprint: "explicit-none" });
      expect(f.adapter.capture).toHaveBeenCalledOnce();
      expect(() => assertStudioBg3dCaptureEnvironmentCurrent(owned, "explicit-none")).not.toThrow();
      f.view.unmount();
      await expect(captureStudioBg3dRaster(f.adapter, request)).rejects.toThrow();
      expect(f.adapter.capture).toHaveBeenCalledOnce(); expect(f.adapterDispose).toHaveBeenCalledOnce();
    } finally { owner.dispose(); }
  });

  it("3회 loss에서도 DPR을 바꾸지 않고 진단·renderer reset·두 복구 frame을 유지한다", async () => {
    const f = fixture();
    await waitFor(() => expect(f.update).toHaveBeenCalledWith({ adapter: f.adapter, camera: f.camera }));
    for (let lossCount = 1; lossCount <= 3; lossCount += 1) {
      expect(lose(f.canvas).defaultPrevented).toBe(true);
      expect(lastNotice(f.notices)).toMatchObject({ owner: f.canvas, snapshot: {
        lossCount, degraded: lossCount === 3, phase: lossCount === 3 ? "degraded" : "lost" } });
      restore(f.canvas);
      await waitFor(() => expect(f.invalidate).toHaveBeenCalledTimes(lossCount * 2));
      expect(f.renderListsDispose).toHaveBeenCalledTimes(lossCount);
      expect(f.infoReset).toHaveBeenCalledTimes(lossCount); expect(f.resetState).toHaveBeenCalledTimes(lossCount);
      expect(lastNotice(f.notices).snapshot?.phase).toBe("restored");
      expect(f.setDpr).not.toHaveBeenCalled(); expect(f.renderer.getPixelRatio()).toBe(2.5);
    }
    const previous = lastNotice(f.notices);
    f.view.unmount();
    expect(lastNotice(f.notices)).toMatchObject({ owner: f.canvas, snapshot: null });
    expect(f.adapterDispose).toHaveBeenCalledOnce();
    expect(f.update).toHaveBeenLastCalledWith({ adapter: null, camera: null }, f.adapter);
    const noticeCount = f.notices.length;
    expect(lose(f.canvas).defaultPrevented).toBe(false); restore(f.canvas);
    expect(previous.retry()).toBe(false);
    await act(async () => { await Promise.resolve(); });
    expect(f.notices).toHaveLength(noticeCount); expect(f.invalidate).toHaveBeenCalledTimes(6);
    expect(f.renderListsDispose).toHaveBeenCalledTimes(3); expect(f.infoReset).toHaveBeenCalledTimes(3); expect(f.resetState).toHaveBeenCalledTimes(3);
    expect(f.setDpr).not.toHaveBeenCalled(); expect(f.renderer.getPixelRatio()).toBe(2.5);
  });

  it("실패한 복구의 명시 retry도 선택 DPR을 보존하고 성공 frame과 owner 정리를 유지한다", async () => {
    const f = fixture();
    await waitFor(() => expect(f.update).toHaveBeenCalledWith({ adapter: f.adapter, camera: f.camera }));
    f.renderListsDispose.mockImplementationOnce(() => { throw Error("renderer 캐시 복구 실패"); });
    lose(f.canvas); restore(f.canvas);
    const failed = lastNotice(f.notices);
    expect(failed).toMatchObject({ owner: f.canvas, snapshot: { phase: "failed", lossCount: 1 } });
    expect(f.invalidate).not.toHaveBeenCalled(); expect(f.infoReset).not.toHaveBeenCalled(); expect(f.resetState).not.toHaveBeenCalled();
    act(() => { expect(failed.retry()).toBe(true); });
    await waitFor(() => expect(f.invalidate).toHaveBeenCalledTimes(2));
    expect(lastNotice(f.notices)).toMatchObject({ owner: f.canvas, snapshot: { phase: "restored", lossCount: 1 } });
    expect(f.renderListsDispose).toHaveBeenCalledTimes(2); expect(f.infoReset).toHaveBeenCalledOnce(); expect(f.resetState).toHaveBeenCalledOnce();
    expect(f.setDpr).not.toHaveBeenCalled(); expect(f.renderer.getPixelRatio()).toBe(2.5);
    f.view.unmount();
    expect(failed.retry()).toBe(false); expect(f.adapterDispose).toHaveBeenCalledOnce();
    expect(lastNotice(f.notices)).toMatchObject({ owner: f.canvas, snapshot: null });
  });

  it("같은 canvas의 이전 bridge cleanup이 새 owner의 lost 알림과 retry 권위를 지우지 않는다", async () => {
    const first = fixture();
    await waitFor(() => expect(first.update).toHaveBeenCalledWith({ adapter: first.adapter, camera: first.camera }));
    expect(lose(first.canvas).defaultPrevented).toBe(true);
    const second = fixture(first.canvas);
    await waitFor(() => expect(second.update).toHaveBeenCalledWith({ adapter: second.adapter, camera: second.camera }));
    const lost = lastNotice(second.notices), noticeCount = second.notices.length;
    expect(lost).toMatchObject({ owner: second.canvas, snapshot: { phase: "lost", lossCount: 1 } });
    expect(getStudioBg3dWebglRecoverySnapshot(second.canvas)).toBe(lost.snapshot);
    first.view.unmount();
    expect(second.notices).toHaveLength(noticeCount); expect(lastNotice(second.notices)).toBe(lost);
    expect(getStudioBg3dWebglRecoverySnapshot(second.canvas)).toBe(lost.snapshot);
    second.renderListsDispose.mockImplementationOnce(() => { throw Error("새 owner renderer 복구 실패"); });
    restore(second.canvas);
    const failed = lastNotice(second.notices);
    expect(failed.snapshot?.phase).toBe("failed");
    act(() => { expect(failed.retry()).toBe(true); });
    await waitFor(() => expect(second.invalidate).toHaveBeenCalledTimes(2));
    expect(lastNotice(second.notices).snapshot?.phase).toBe("restored");
    expect(second.renderListsDispose).toHaveBeenCalledTimes(2); expect(second.infoReset).toHaveBeenCalledOnce(); expect(second.resetState).toHaveBeenCalledOnce();
    expect(first.renderListsDispose).not.toHaveBeenCalled(); expect(first.infoReset).not.toHaveBeenCalled();
    expect(first.resetState).not.toHaveBeenCalled(); expect(first.invalidate).not.toHaveBeenCalled();
    expect(first.adapterDispose).toHaveBeenCalledOnce(); expect(first.setDpr).not.toHaveBeenCalled(); expect(second.setDpr).not.toHaveBeenCalled();
    second.view.unmount();
    expect(lastNotice(second.notices)).toMatchObject({ owner: second.canvas, snapshot: null });
    expect(getStudioBg3dWebglRecoverySnapshot(second.canvas)).toBeNull(); expect(failed.retry()).toBe(false);
  });

  it("새 owner가 없어도 미복구 tombstone이 남으면 cleanup clear 알림을 발행하지 않는다", async () => {
    const f = fixture();
    await waitFor(() => expect(f.update).toHaveBeenCalledWith({ adapter: f.adapter, camera: f.camera }));
    lose(f.canvas);
    const lost = lastNotice(f.notices), noticeCount = f.notices.length;
    f.view.unmount();
    expect(f.notices).toHaveLength(noticeCount); expect(lastNotice(f.notices)).toBe(lost);
    expect(getStudioBg3dWebglRecoverySnapshot(f.canvas)).toBe(lost.snapshot);
    expect(lose(f.canvas).defaultPrevented).toBe(false); restore(f.canvas);
    await act(async () => { await Promise.resolve(); });
    expect(f.notices).toHaveLength(noticeCount); expect(f.resetState).not.toHaveBeenCalled(); expect(f.invalidate).not.toHaveBeenCalled();
    expect(f.adapterDispose).toHaveBeenCalledOnce(); expect(f.setDpr).not.toHaveBeenCalled();
  });
});
