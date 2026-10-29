// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { Scene } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dHdriEnvironment } from "./StudioBg3dHdriEnvironment";
import { StudioBg3dScenePanorama } from "./StudioBg3dScenePanorama";
import type { StudioBg3dEnvironmentSettings } from "./studio-bg3d-hdri-environment";
import type { StudioBg3dHdriFileTier } from "./studio-bg3d-hdri-environment-assets";
import { getStudioBg3dWebglRecoverySnapshot, installStudioBg3dWebglContextRecovery,
  STUDIO_BG3D_WEBGL_RECOVERY_EVENT, type StudioBg3dWebglRecoveryController,
  type StudioBg3dWebglRecoveryNoticeDetail } from "./studio-bg3d-webgl-context-recovery";

interface EnvironmentState {
  readonly gl: object;
  readonly scene: Scene;
  readonly invalidate: () => void;
}
const ports = vi.hoisted(() => ({
  read: vi.fn<() => EnvironmentState>(),
  mountHdri: vi.fn<typeof import("./studio-bg3d-hdri-environment-binding")["mountStudioBg3dHdriEnvironment"]>(),
  mountPanorama: vi.fn<typeof import("./studio-bg3d-procedural-panorama")["mountStudioBg3dProceduralPanorama"]>(),
}));
vi.mock("@react-three/fiber", () => ({
  useThree: <T,>(selector: (state: EnvironmentState) => T): T => selector(ports.read()),
}));
vi.mock("./studio-bg3d-hdri-environment-binding", () => ({ mountStudioBg3dHdriEnvironment: ports.mountHdri }));
vi.mock("./studio-bg3d-procedural-panorama", () => ({ mountStudioBg3dProceduralPanorama: ports.mountPanorama }));

interface AppliedValues { intensity: number; rotationDegrees: number }
const hdriBindings: { readonly values: AppliedValues; readonly dispose: () => void }[] = [];
const panoramaBindings: { readonly values: { rotationDegrees: number }; readonly dispose: () => void }[] = [];
const recoveryControllers: StudioBg3dWebglRecoveryController[] = [];
const SETTINGS: StudioBg3dEnvironmentSettings = {
  source: "hdri", assetId: "combination-room", intensity: 2.25, rotationDegrees: 137, useAsBackground: false,
};
beforeEach(() => {
  ports.read.mockReset(); ports.mountHdri.mockReset(); ports.mountPanorama.mockReset();
  hdriBindings.length = 0; panoramaBindings.length = 0;
  // 실제 PMREM 대신 초기값·setter 적용값을 기록해 component의 effect 세대를 검증한다.
  ports.mountHdri.mockImplementation((_scene, _renderer, options) => {
    const values = { intensity: options.intensity, rotationDegrees: options.rotationDegrees };
    const dispose = vi.fn<() => void>();
    hdriBindings.push({ values, dispose });
    return { ready: Promise.resolve(true), texture: null, dispose, getSnapshot: () => ({ status: "applied", diagnostics: [] }),
      setIntensity: (value) => { values.intensity = value; },
      setRotation: (value) => { values.rotationDegrees = value; } };
  });
  ports.mountPanorama.mockImplementation((_scene, _presetId, rotationDegrees) => {
    const values = { rotationDegrees }, dispose = vi.fn<() => void>();
    panoramaBindings.push({ values, dispose });
    return { texture: null, isApplied: () => true, dispose, setRotation: (value) => { values.rotationDegrees = value; } };
  });
});
afterEach(() => { cleanup(); for (const controller of recoveryControllers.splice(0)) controller.dispose(); vi.restoreAllMocks(); });

function state(): EnvironmentState {
  return { gl: {}, scene: new Scene(), invalidate: vi.fn<() => void>() };
}
function recover(canvas: HTMLCanvasElement, resetRenderer = vi.fn<() => void>()) {
  const controller = installStudioBg3dWebglContextRecovery(canvas, {
    resetRenderer, invalidate: () => undefined, scheduleFrame: () => 1, cancelFrame: () => undefined,
    onStateChange: (snapshot) => window.dispatchEvent(new CustomEvent<StudioBg3dWebglRecoveryNoticeDetail>(
      STUDIO_BG3D_WEBGL_RECOVERY_EVENT, { detail: { owner: canvas, snapshot, retry: () => controller.retry() } },
    )),
  });
  recoveryControllers.push(controller); return controller;
}

describe("HDRI와 파노라마 binding 세대의 표시값 보존", () => {
  it.each(["asset", "tier", "renderer", "scene", "background"] as const)(
    "%s만 바뀐 새 HDRI에도 같은 밝기·회전을 적용한다", (change) => {
      let current = state(), settings = SETTINGS, fileTier: StudioBg3dHdriFileTier = "2k";
      ports.read.mockImplementation(() => current);
      const view = render(<StudioBg3dHdriEnvironment settings={settings} fileTier={fileTier} />);
      expect(hdriBindings).toHaveLength(1);
      expect(hdriBindings[0].values).toEqual({ intensity: 2.25, rotationDegrees: 137 });

      if (change === "asset") settings = { ...settings, assetId: "konigsallee" };
      if (change === "tier") fileTier = "1k";
      if (change === "renderer") current = { ...current, gl: {} };
      if (change === "scene") current = { ...current, scene: new Scene() };
      if (change === "background") settings = { ...settings, useAsBackground: true };
      view.rerender(<StudioBg3dHdriEnvironment settings={settings} fileTier={fileTier} />);

      expect(ports.mountHdri).toHaveBeenCalledTimes(2);
      expect(hdriBindings[0].dispose).toHaveBeenCalledOnce();
      expect(hdriBindings[1].values).toEqual({ intensity: 2.25, rotationDegrees: 137 });
      view.unmount(); expect(hdriBindings[1].dispose).toHaveBeenCalledOnce();
    },
  );

  it("HDRI를 다시 켤 때 바뀌지 않은 밝기·회전을 적용한다", () => {
    ports.read.mockReturnValue(state());
    const view = render(<StudioBg3dHdriEnvironment settings={{ ...SETTINGS, source: "procedural", assetId: null }} />);
    expect(ports.mountHdri).not.toHaveBeenCalled();
    view.rerender(<StudioBg3dHdriEnvironment settings={SETTINGS} />);
    expect(hdriBindings).toHaveLength(1);
    expect(hdriBindings[0].values).toEqual({ intensity: 2.25, rotationDegrees: 137 });
  });

  it("HDRI 밝기·회전 변경은 기존 binding의 setter만 사용한다", () => {
    ports.read.mockReturnValue(state());
    const view = render(<StudioBg3dHdriEnvironment settings={SETTINGS} />);
    view.rerender(<StudioBg3dHdriEnvironment settings={{ ...SETTINGS, intensity: 3.5, rotationDegrees: 215 }} />);
    expect(ports.mountHdri).toHaveBeenCalledOnce();
    expect(hdriBindings[0].values).toEqual({ intensity: 3.5, rotationDegrees: 215 });
    expect(hdriBindings[0].dispose).not.toHaveBeenCalled();
  });

  it("같은 WebGL canvas의 DOM 복구 이벤트는 URL·밝기·회전을 유지해 binding을 다시 준비한다", () => {
    const canvas = document.createElement("canvas"), current = { ...state(), gl: { isWebGLRenderer: true, domElement: canvas } };
    ports.read.mockReturnValue(current);
    const view = render(<StudioBg3dHdriEnvironment settings={SETTINGS} fileTier="2k" />);
    const firstUrl = ports.mountHdri.mock.calls[0][2].url;
    act(() => { canvas.dispatchEvent(new Event("webglcontextrestored")); });
    expect(ports.mountHdri).toHaveBeenCalledTimes(2);
    expect(ports.mountHdri.mock.calls[1][2].url).toBe(firstUrl);
    expect(hdriBindings[0].dispose).toHaveBeenCalledOnce();
    expect(hdriBindings[1].values).toEqual({ intensity: 2.25, rotationDegrees: 137 });
    view.unmount(); expect(hdriBindings[1].dispose).toHaveBeenCalledOnce();
  });

  it("다른 canvas와 unmount 이후의 복구 이벤트는 HDRI를 다시 만들지 않는다", () => {
    const canvas = document.createElement("canvas"), other = document.createElement("canvas");
    ports.read.mockReturnValue({ ...state(), gl: { isWebGLRenderer: true, domElement: canvas } });
    const view = render(<StudioBg3dHdriEnvironment settings={SETTINGS} />);
    act(() => { other.dispatchEvent(new Event("webglcontextrestored")); });
    expect(ports.mountHdri).toHaveBeenCalledOnce();
    view.unmount();
    act(() => { canvas.dispatchEvent(new Event("webglcontextrestored")); });
    expect(ports.mountHdri).toHaveBeenCalledOnce();
  });

  it("WebGPU canvas에는 WebGL 복구 이벤트로 HDRI를 다시 만들지 않는다", () => {
    const canvas = document.createElement("canvas");
    ports.read.mockReturnValue({ ...state(), gl: { isWebGPURenderer: true, domElement: canvas } });
    render(<StudioBg3dHdriEnvironment settings={SETTINGS} />);
    act(() => { canvas.dispatchEvent(new Event("webglcontextrestored")); });
    expect(ports.mountHdri).toHaveBeenCalledOnce();
  });

  it("controller의 복구 알림과 native 이벤트가 함께 와도 한 번만 새 HDRI를 준비한다", () => {
    const canvas = document.createElement("canvas");
    ports.read.mockReturnValue({ ...state(), gl: { isWebGLRenderer: true, domElement: canvas } });
    const controller = recover(canvas);
    render(<StudioBg3dHdriEnvironment settings={SETTINGS} />);
    act(() => { canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })); });
    expect(controller.snapshot().phase).toBe("lost");
    act(() => { canvas.dispatchEvent(new Event("webglcontextrestored")); });
    expect(controller.snapshot().phase).toBe("restored");
    expect(ports.mountHdri).toHaveBeenCalledTimes(2);
    expect(hdriBindings[1].values).toEqual({ intensity: 2.25, rotationDegrees: 137 });
  });

  it("실패한 renderer 복구는 HDRI 성공으로 보지 않고 명시 retry 성공 뒤 다시 준비한다", () => {
    const canvas = document.createElement("canvas"), reset = vi.fn<() => void>();
    reset.mockImplementationOnce(() => { throw new Error("renderer 복구 오류"); });
    ports.read.mockReturnValue({ ...state(), gl: { isWebGLRenderer: true, domElement: canvas } });
    const controller = recover(canvas, reset);
    render(<StudioBg3dHdriEnvironment settings={SETTINGS} />);
    act(() => { canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })); });
    act(() => { canvas.dispatchEvent(new Event("webglcontextrestored")); });
    expect(getStudioBg3dWebglRecoverySnapshot(canvas)?.phase).toBe("failed");
    expect(ports.mountHdri).toHaveBeenCalledOnce();
    act(() => { expect(controller.retry()).toBe(true); });
    expect(controller.snapshot().phase).toBe("restored");
    expect(ports.mountHdri).toHaveBeenCalledTimes(2);
    expect(hdriBindings[1].values).toEqual({ intensity: 2.25, rotationDegrees: 137 });
  });

  it.each(["lost", "failed", "degraded"] as const)("이미 %s인 canvas는 props가 바뀌어도 준비를 보류하고 복구 뒤 재개한다", (phase) => {
    const canvas = document.createElement("canvas"), reset = vi.fn<() => void>();
    if (phase === "failed") reset.mockImplementationOnce(() => { throw new Error("renderer 복구 오류"); });
    const controller = recover(canvas, reset);
    act(() => {
      for (let index = 0; index < (phase === "degraded" ? 3 : 1); index += 1) {
        canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
      }
      if (phase === "failed") canvas.dispatchEvent(new Event("webglcontextrestored"));
    });
    expect(controller.snapshot().phase).toBe(phase);
    let current = { ...state(), gl: { isWebGLRenderer: true, domElement: canvas } };
    ports.read.mockImplementation(() => current);
    const view = render(<StudioBg3dHdriEnvironment settings={SETTINGS} />);
    expect(ports.mountHdri).not.toHaveBeenCalled();
    current = { ...current, scene: new Scene() };
    view.rerender(<StudioBg3dHdriEnvironment settings={{ ...SETTINGS, assetId: "konigsallee", useAsBackground: true }} fileTier="1k" />);
    expect(ports.mountHdri).not.toHaveBeenCalled();
    act(() => {
      if (phase === "failed") expect(controller.retry()).toBe(true);
      else canvas.dispatchEvent(new Event("webglcontextrestored"));
    });
    expect(controller.snapshot().phase).toBe("restored");
    expect(ports.mountHdri).toHaveBeenCalledOnce();
    expect(ports.mountHdri.mock.calls[0][2]).toMatchObject({ useAsBackground: true });
    expect(hdriBindings[0].values).toEqual({ intensity: 2.25, rotationDegrees: 137 });
  });

  it("복구 generation을 예약한 직후 다시 lost가 되면 최신 snapshot으로 준비를 보류한다", () => {
    const canvas = document.createElement("canvas"), controller = recover(canvas);
    ports.read.mockReturnValue({ ...state(), gl: { isWebGLRenderer: true, domElement: canvas } });
    render(<StudioBg3dHdriEnvironment settings={SETTINGS} />);
    act(() => {
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
      canvas.dispatchEvent(new Event("webglcontextrestored"));
      canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    });
    expect(controller.snapshot().phase).toBe("lost");
    expect(ports.mountHdri).toHaveBeenCalledOnce();
    act(() => { canvas.dispatchEvent(new Event("webglcontextrestored")); });
    expect(ports.mountHdri).toHaveBeenCalledTimes(2);
    expect(hdriBindings[1].values).toEqual({ intensity: 2.25, rotationDegrees: 137 });
  });

  it.each(["owner", "backgroundOwner", "scene"] as const)("%s만 바뀐 새 파노라마에도 같은 회전을 적용한다", (change) => {
    let current = state(), environmentOwner: "panorama" | "hdri" = "panorama";
    let backgroundOwner: "panorama" | "hdri" = "panorama";
    ports.read.mockImplementation(() => current);
    const view = render(<StudioBg3dScenePanorama presetId="clear_day" rotationDegrees={137} environmentOwner={environmentOwner} backgroundOwner={backgroundOwner} />);
    expect(panoramaBindings[0].values.rotationDegrees).toBe(137);
    if (change === "owner") environmentOwner = "hdri";
    else if (change === "backgroundOwner") backgroundOwner = "hdri";
    else current = { ...current, scene: new Scene() };
    view.rerender(<StudioBg3dScenePanorama presetId="clear_day" rotationDegrees={137} environmentOwner={environmentOwner} backgroundOwner={backgroundOwner} />);
    expect(ports.mountPanorama).toHaveBeenCalledTimes(2);
    expect(ports.mountPanorama).toHaveBeenLastCalledWith(current.scene, "clear_day", 0, {
      ownsEnvironment: environmentOwner === "panorama", ownsBackground: backgroundOwner === "panorama",
    });
    expect(panoramaBindings[0].dispose).toHaveBeenCalledOnce();
    expect(panoramaBindings[1].values.rotationDegrees).toBe(137);
    view.unmount(); expect(panoramaBindings[1].dispose).toHaveBeenCalledOnce();
  });

  it("파노라마 회전 변경은 새 texture를 만들지 않는다", () => {
    ports.read.mockReturnValue(state());
    const view = render(<StudioBg3dScenePanorama presetId="clear_day" rotationDegrees={137} />);
    view.rerender(<StudioBg3dScenePanorama presetId="clear_day" rotationDegrees={215} />);
    expect(ports.mountPanorama).toHaveBeenCalledOnce();
    expect(panoramaBindings[0].values.rotationDegrees).toBe(215);
    expect(panoramaBindings[0].dispose).not.toHaveBeenCalled();
  });
});
