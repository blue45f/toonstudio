// @vitest-environment jsdom
// 로드/PMREM 변환 IO만 대체한다. 실제 binding·slot owner·두 컴포넌트·registry를 함께 검증한다.
import { act, cleanup, render } from "@testing-library/react";
import { StrictMode, useLayoutEffect } from "react";
import { DataTexture, Scene, Texture, WebGLRenderTarget } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioBg3dCaptureEnvironmentAuthority } from "./StudioBg3dCaptureEnvironmentAuthority";
import { StudioBg3dHdriEnvironment } from "./StudioBg3dHdriEnvironment";
import { StudioBg3dScenePanorama } from "./StudioBg3dScenePanorama";
import { createStudioBg3dCaptureEnvironmentIntent } from "./studio-bg3d-capture-environment-intent";
import { acquireStudioBg3dCaptureEnvironmentReceipt, StudioBg3dCaptureEnvironmentError } from "./studio-bg3d-capture-environment-receipt";
import { installStudioBg3dWebglContextRecovery } from "./studio-bg3d-webgl-context-recovery";
import type { StudioBg3dCaptureEnvironmentIntent, StudioBg3dCaptureEnvironmentIntentInput } from "./studio-bg3d-capture-environment-intent";

interface State { scene: Scene; gl: object; invalidate: () => void }
const io = vi.hoisted(() => ({ read: vi.fn<() => State>(), load: vi.fn<(url: string) => Promise<DataTexture>>(),
  prepare: vi.fn<typeof import("./studio-bg3d-hdri-pmrem")["createStudioBg3dHdriPmrem"]>() }));
vi.mock("@react-three/fiber", () => ({ useThree: <T,>(selector: (value: State) => T) => selector(io.read()) }));
vi.mock("three/addons/loaders/RGBELoader.js", () => ({ RGBELoader: class {
  setDataType() { return this; }
  loadAsync(url: string) { return io.load(url); }
} }));
vi.mock("./studio-bg3d-hdri-pmrem", () => ({ createStudioBg3dHdriPmrem: io.prepare }));

const BASE: StudioBg3dCaptureEnvironmentIntentInput = { settings: { source: "hdri", assetId: "combination-room", intensity: 2.25,
  rotationDegrees: 137, useAsBackground: false }, fileTier: "2k", skyPresetId: "clear_day", panoramaRotationDegrees: 75, immersiveAr: false };
const releases: (() => void)[] = [];
function pendingSource() {
  let resolve: (value: DataTexture) => void = () => {};
  let released = false;
  const promise = new Promise<DataTexture>((done) => { resolve = done; });
  const release = () => { if (!released) { released = true; resolve(new DataTexture(new Uint8Array([1, 2, 3, 255]), 1, 1)); } };
  releases.push(release); return { promise, release };
}
function Presentation({ intent, probe }: { intent: StudioBg3dCaptureEnvironmentIntent; probe?: () => void }) {
  return <StudioBg3dCaptureEnvironmentAuthority intent={intent}>
    {!intent.immersiveAr && <StudioBg3dScenePanorama presetId={intent.skyPresetId} rotationDegrees={intent.panoramaRotationDegrees}
      environmentOwner={intent.environment === "hdri" ? "hdri" : "panorama"} backgroundOwner={intent.background === "hdri" ? "hdri" : "panorama"} />}
    <StudioBg3dHdriEnvironment settings={intent.settings} fileTier={intent.fileTier} enabled={!intent.immersiveAr} />
    {probe && <LayoutProbe probe={probe} />}
  </StudioBg3dCaptureEnvironmentAuthority>;
}
function LayoutProbe({ probe }: { probe: () => void }) { useLayoutEffect(probe, [probe]); return null; }
function fixture() {
  const canvas = document.createElement("canvas");
  const value: State = { scene: new Scene(), gl: { isWebGLRenderer: true, domElement: canvas }, invalidate: vi.fn() };
  io.read.mockReturnValue(value);
  return { ...value, canvas, acquire: () => acquireStudioBg3dCaptureEnvironmentReceipt(value.scene, value.gl, { timeoutMs: 1_000 }) };
}
beforeEach(() => {
  io.read.mockReset(); io.load.mockReset(); io.prepare.mockReset();
  io.load.mockImplementation(async () => new DataTexture(new Uint8Array([1, 2, 3, 255]), 1, 1));
  io.prepare.mockImplementation(async () => ({ target: new WebGLRenderTarget(16, 8), disposeGenerator() {} }));
});
afterEach(async () => {
  cleanup(); for (const release of releases.splice(0)) release();
  await Promise.resolve(); await Promise.resolve(); vi.restoreAllMocks();
});

describe("실제 환경 생산자→registry 적용 권위", () => {
  it("실제 binding load/PMREM이 끝나기 전에는 두 paint와 무관하게 ready를 주지 않는다", async () => {
    const f = fixture(), source = pendingSource(); io.load.mockReturnValueOnce(source.promise);
    render(<Presentation intent={createStudioBg3dCaptureEnvironmentIntent(BASE)} />);
    let applied = false;
    const receipt = f.acquire().then((value) => { applied = true; return value; });
    await act(async () => { await Promise.resolve(); });
    expect(applied).toBe(false); expect(f.scene.environment).toBeNull(); expect(io.prepare).not.toHaveBeenCalled();
    await act(async () => source.release());
    (await receipt).assertCurrent(); expect(io.prepare).toHaveBeenCalledOnce();
    expect(f.scene.environmentIntensity).toBe(2.25); expect(f.scene.background).not.toBeNull();
  });
  it("새 URL의 child layout에서 시작한 acquire도 부모 layout publish 뒤 old ready로 성공하지 않는다", async () => {
    const f = fixture(), first = createStudioBg3dCaptureEnvironmentIntent(BASE);
    const view = render(<Presentation intent={first} />); const old = await f.acquire();
    const source = pendingSource(); io.load.mockReturnValueOnce(source.promise);
    let observation: Promise<string> = Promise.resolve("not-called");
    view.rerender(<Presentation intent={createStudioBg3dCaptureEnvironmentIntent({ ...BASE, settings: { ...BASE.settings, assetId: "konigsallee" } })}
      probe={() => { observation = f.acquire().then(() => "wrong-old-success", () => "rejected-old"); }} />);
    expect(() => old.assertCurrent()).toThrow(); expect(await observation).toBe("rejected-old");
    let settled = false; const next = f.acquire().then((receipt) => { settled = true; return receipt; });
    await act(async () => { await Promise.resolve(); }); expect(settled).toBe(false);
    await act(async () => source.release()); (await next).assertCurrent();
  });
  it("A 로드의 늦은 완료와 cleanup은 이미 준비된 B의 요청을 완료·폐기하지 않는다", async () => {
    const f = fixture(), a = pendingSource(), b = pendingSource();
    io.load.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    const view = render(<Presentation intent={createStudioBg3dCaptureEnvironmentIntent(BASE)} />);
    const oldWait = f.acquire().then(() => "wrong-success", (error: unknown) => {
      if (!(error instanceof StudioBg3dCaptureEnvironmentError)) throw error;
      return error.code;
    });
    view.rerender(<Presentation intent={createStudioBg3dCaptureEnvironmentIntent({ ...BASE, settings: { ...BASE.settings, assetId: "konigsallee" } })} />);
    expect(["superseded", "disposed"]).toContain(await oldWait); const newWait = f.acquire();
    await act(async () => b.release()); const receipt = await newWait, texture = f.scene.environment;
    await act(async () => a.release()); receipt.assertCurrent();
    expect(f.scene.environment).toBe(texture); expect(io.prepare).toHaveBeenCalledOnce();
  });
  it("같은 binding의 scalar 변경은 새 receipt만 만들며 PMREM을 다시 만들지 않는다", async () => {
    const f = fixture(), view = render(<Presentation intent={createStudioBg3dCaptureEnvironmentIntent(BASE)} />);
    const before = await f.acquire(), texture = f.scene.environment;
    view.rerender(<Presentation intent={createStudioBg3dCaptureEnvironmentIntent({ ...BASE, settings: { ...BASE.settings, intensity: 3.5, rotationDegrees: 215 } })} />);
    expect(() => before.assertCurrent()).toThrow(); (await f.acquire()).assertCurrent();
    expect(f.scene.environment).toBe(texture); expect(io.prepare).toHaveBeenCalledOnce(); expect(f.scene.environmentIntensity).toBe(3.5);
  });
  it("기존 binding의 setter가 슬롯 소유권 때문에 적용하지 못하면 새 요청을 허가하지 않는다", async () => {
    const f = fixture(), view = render(<Presentation intent={createStudioBg3dCaptureEnvironmentIntent(BASE)} />);
    await f.acquire(); const external = new Texture(); f.scene.environment = external;
    view.rerender(<Presentation intent={createStudioBg3dCaptureEnvironmentIntent({ ...BASE, settings: { ...BASE.settings, intensity: 3.5 } })} />);
    await expect(f.acquire()).rejects.toMatchObject({ code: "failed" });
    expect(io.prepare).toHaveBeenCalledOnce(); expect(f.scene.environment).toBe(external); external.dispose();
  });
  it("새 HDRI 준비 실패를 이전 표시 슬롯이나 정상 blank로 승격하지 않는다", async () => {
    const f = fixture(), view = render(<Presentation intent={createStudioBg3dCaptureEnvironmentIntent(BASE)} />);
    const old = await f.acquire(); io.load.mockRejectedValueOnce(new Error("실제 HDR 로드 seam 실패"));
    view.rerender(<Presentation intent={createStudioBg3dCaptureEnvironmentIntent({ ...BASE, settings: { ...BASE.settings, assetId: "konigsallee" } })} />);
    expect(() => old.assertCurrent()).toThrow();
    await expect(f.acquire()).rejects.toMatchObject({ code: "failed" }); expect(io.prepare).toHaveBeenCalledOnce();
  });
  it("무관한 재렌더와 같은 요청 객체 사본은 원래 receipt와 binding을 유지한다", async () => {
    const f = fixture(), view = render(<Presentation intent={createStudioBg3dCaptureEnvironmentIntent(BASE)} />);
    const before = await f.acquire();
    view.rerender(<Presentation intent={createStudioBg3dCaptureEnvironmentIntent({ ...BASE, settings: { ...BASE.settings } })} />);
    before.assertCurrent(); expect(io.prepare).toHaveBeenCalledOnce();
  });
  it("같은 intent에서 invalidate identity로 생산자가 재마운트되면 새 entry로 다시 보고한다", async () => {
    const f = fixture(); let current: State = { scene: f.scene, gl: f.gl, invalidate: vi.fn() };
    io.read.mockImplementation(() => current);
    const view = render(<Presentation intent={createStudioBg3dCaptureEnvironmentIntent(BASE)} />), before = await f.acquire();
    current = { ...current, invalidate: vi.fn() };
    view.rerender(<Presentation intent={createStudioBg3dCaptureEnvironmentIntent(BASE)} />);
    expect(() => before.assertCurrent()).toThrow(); (await f.acquire()).assertCurrent();
    expect(io.prepare).toHaveBeenCalledTimes(2);
  });
  it("HDRI→정상 blank→AR none은 이전 실제 슬롯 반환 후에만 허가한다", async () => {
    const f = fixture(), view = render(<Presentation intent={createStudioBg3dCaptureEnvironmentIntent({ ...BASE, settings: { ...BASE.settings, useAsBackground: true } })} />);
    const before = await f.acquire();
    const blank = createStudioBg3dCaptureEnvironmentIntent({ ...BASE, skyPresetId: "blank", settings: { ...BASE.settings, source: "procedural", assetId: null } });
    view.rerender(<Presentation intent={blank} />); expect(() => before.assertCurrent()).toThrow();
    const blankReceipt = await f.acquire(); blankReceipt.assertCurrent(); expect(f.scene.environment).toBeNull(); expect(f.scene.background).toBeNull();
    view.rerender(<Presentation intent={createStudioBg3dCaptureEnvironmentIntent({ ...BASE, immersiveAr: true })} />);
    expect(() => blankReceipt.assertCurrent()).toThrow(); (await f.acquire()).assertCurrent();
    expect(io.prepare).toHaveBeenCalledOnce();
  });
  it.each(["pointer", "intensity", "rotation", "background"] as const)("외부 %s 변경은 실제 슬롯 검사를 통과하지 못한다", async (changed) => {
    const f = fixture(); render(<Presentation intent={createStudioBg3dCaptureEnvironmentIntent({ ...BASE, settings: { ...BASE.settings, useAsBackground: true } })} />);
    const receipt = await f.acquire(), texture = new Texture();
    if (changed === "pointer") f.scene.environment = texture;
    if (changed === "intensity") f.scene.environmentIntensity += 0.1;
    if (changed === "rotation") f.scene.environmentRotation.x = 0.1;
    if (changed === "background") f.scene.background = texture;
    expect(() => receipt.assertCurrent()).toThrow(); await expect(f.acquire()).rejects.toMatchObject({ code: "not-applied" });
    texture.dispose();
  });
  it("실제 WebGL restored와 새 binding ready 사이에는 같은 URL이라도 캡처를 허가하지 않는다", async () => {
    const f = fixture(), recovery = installStudioBg3dWebglContextRecovery(f.canvas, { invalidate() {}, resetRenderer() {}, scheduleFrame: () => 1, cancelFrame() {} });
    try {
      render(<Presentation intent={createStudioBg3dCaptureEnvironmentIntent(BASE)} />); const before = await f.acquire();
      const source = pendingSource(); io.load.mockReturnValueOnce(source.promise);
      act(() => { f.canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true })); });
      expect(() => before.assertCurrent()).toThrow();
      act(() => { f.canvas.dispatchEvent(new Event("webglcontextrestored")); });
      expect(recovery.snapshot().phase).toBe("restored");
      let settled = false; const receipt = f.acquire().then((value) => { settled = true; return value; });
      await act(async () => { await Promise.resolve(); }); expect(settled).toBe(false);
      await act(async () => source.release()); (await receipt).assertCurrent(); expect(io.load).toHaveBeenCalledTimes(2);
    } finally { recovery.dispose(); }
  });
  it("StrictMode 재생과 unmount가 오래된 세대를 되살리지 않는다", async () => {
    const f = fixture(), view = render(<StrictMode><Presentation intent={createStudioBg3dCaptureEnvironmentIntent(BASE)} /></StrictMode>);
    const receipt = await f.acquire(); view.unmount(); expect(() => receipt.assertCurrent()).toThrow();
    await expect(f.acquire()).rejects.toMatchObject({ code: "disposed" });
  });
  it("unmount 뒤 늦게 끝난 실제 binding 로드는 이전 capture 대기를 성공시키지 않는다", async () => {
    const f = fixture(), source = pendingSource(); io.load.mockReturnValueOnce(source.promise);
    const view = render(<Presentation intent={createStudioBg3dCaptureEnvironmentIntent(BASE)} />);
    const pending = f.acquire(); const rejected = expect(pending).rejects.toMatchObject({ code: "disposed" });
    view.unmount(); await rejected;
    await act(async () => source.release()); expect(io.prepare).not.toHaveBeenCalled(); expect(f.scene.environment).toBeNull();
  });
});
