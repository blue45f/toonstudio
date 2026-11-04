// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { cleanup, render, waitFor } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isStudioBg3dCanvasFactoryPending } from "./studio-bg3d-canvas-renderer-admission";
import { useStudioBg3dEngineRuntime } from "./useStudioBg3dEngineRuntime";
import type { StudioBg3dEnginePreference } from "./studio-bg3d-engine-selection";
import type { StudioBg3dEngineRuntimeState, UseStudioBg3dEngineRuntimeOptions } from "./useStudioBg3dEngineRuntime";

const probe: UseStudioBg3dEngineRuntimeOptions["probe"] = async () => ({ supported: true, reason: "available",
  computeSupported: true, timestampQuerySupported: false, limits: {} });
const savePreference: UseStudioBg3dEngineRuntimeOptions["savePreference"] = async () => undefined;
interface Snapshot { readonly enabled: boolean; readonly phase: string; readonly backend: string; readonly factory: boolean; readonly mounted: boolean }
function fixture(preference: StudioBg3dEnginePreference = "webgpu") {
  const snapshots: Snapshot[] = [], webgl = vi.fn(), webgpu = vi.fn(), retire = vi.fn();
  const loadPreference: UseStudioBg3dEngineRuntimeOptions["loadPreference"] = async () => preference;
  function CanvasOwner({ runtime }: { readonly runtime: StudioBg3dEngineRuntimeState }) {
    useLayoutEffect(() => {
      // R3F는 gl factory가 없으면 기본 WebGLRenderer를 만든다. 이 경계 진입 자체를 관찰한다.
      if (runtime.glFactory) webgpu(); else webgl();
      return () => retire();
    }, [runtime.glFactory]);
    return <span data-testid="canvas-owner" />;
  }
  function Host({ enabled }: { readonly enabled: boolean }) {
    const runtime = useStudioBg3dEngineRuntime({ enabled, deviceProfile: "desktop", antialias: true, probe, loadPreference, savePreference });
    const mounted = runtime.phase === "ready" && runtime.plan.status === "available" && !isStudioBg3dCanvasFactoryPending(runtime);
    snapshots.push({ enabled, phase: runtime.phase, backend: runtime.plan.backend, factory: runtime.glFactory !== null, mounted });
    return mounted ? <CanvasOwner runtime={runtime} /> : null;
  }
  return { Host, snapshots, webgl, webgpu, retire };
}
beforeEach(() => {
  vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 Chrome/133", hardwareConcurrency: 8 });
  window.isSecureContext = true;
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("3D Canvas의 선택 renderer 입장", () => {
  it("close 첫 render의 ready/null factory 창에서 WebGL을 만들지 않고 기존 Canvas owner를 종료한다", async () => {
    const f = fixture(), view = render(<f.Host enabled />);
    await waitFor(() => expect(f.webgpu).toHaveBeenCalledOnce());
    f.snapshots.length = 0;
    view.rerender(<f.Host enabled={false} />);
    expect(f.snapshots[0]).toEqual({ enabled: false, phase: "ready", backend: "webgpu", factory: false, mounted: false });
    expect(f.webgl).not.toHaveBeenCalled(); expect(f.retire).toHaveBeenCalledOnce();
    view.rerender(<f.Host enabled />);
    await waitFor(() => expect(f.webgpu).toHaveBeenCalledTimes(2));
    expect(f.webgl).not.toHaveBeenCalled();
    view.unmount(); expect(f.retire).toHaveBeenCalledTimes(2);
  });
  it("사용자가 명시한 WebGL2의 factory 없는 정상 입장은 유지한다", async () => {
    const f = fixture("webgl2"), view = render(<f.Host enabled />);
    await waitFor(() => expect(f.webgl).toHaveBeenCalledOnce());
    expect(f.webgpu).not.toHaveBeenCalled();
    expect(f.snapshots.at(-1)).toMatchObject({ backend: "webgl2", factory: false, mounted: true });
    view.rerender(<f.Host enabled={false} />);
    expect(f.retire).toHaveBeenCalledOnce();
  });
  it("실제 viewport는 factory 입장 검사 뒤에만 Canvas와 WebGL 기본 옵션을 사용한다", () => {
    const source = readFileSync(createRequire(import.meta.url).resolve("./StudioBg3dEditorViewport.tsx"), "utf8");
    const gate = source.indexOf('engineRuntime.phase === "probing" || isStudioBg3dCanvasFactoryPending(engineRuntime)');
    expect(gate).toBeGreaterThan(0);
    expect(source.indexOf("<Canvas", gate)).toBeGreaterThan(gate);
  });
});
