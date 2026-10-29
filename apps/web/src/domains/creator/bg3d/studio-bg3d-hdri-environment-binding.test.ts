import { DataTexture, EquirectangularReflectionMapping, Euler, HalfFloatType, RGBAFormat, Scene, Texture, UVMapping, WebGLRenderer, WebGLRenderTarget } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { claimStudioBg3dEnvironmentSlots } from "./studio-bg3d-environment-slot-owner";
import { mountStudioBg3dHdriEnvironment } from "./studio-bg3d-hdri-environment-binding";
import type { StudioBg3dHdriEnvironmentBinding, StudioBg3dHdriEnvironmentMountOptions } from "./studio-bg3d-hdri-environment-binding";

const io = vi.hoisted(() => ({
  load: vi.fn<(url: string) => Promise<import("three").DataTexture>>(),
  pmrem: vi.fn<typeof import("./studio-bg3d-hdri-pmrem")["createStudioBg3dHdriPmrem"]>(),
}));
// GPU를 만들지 않는 renderer 전달 경계다. scene·texture·target·slot owner는 실제 구현을 쓴다.
vi.mock("three", async (importOriginal) => {
  const actual = await importOriginal<typeof import("three")>();
  return { ...actual, WebGLRenderer: class {} };
});
vi.mock("three/addons/loaders/RGBELoader.js", () => ({
  RGBELoader: class {
    setDataType() { return this; }
    loadAsync(url: string) { return io.load(url); }
  },
}));
vi.mock("./studio-bg3d-hdri-pmrem", () => ({ createStudioBg3dHdriPmrem: io.pmrem }));

function deferred<T>() {
  let resolveValue: ((value: T) => void) | undefined;
  let rejectValue: ((error: unknown) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => { resolveValue = resolve; rejectValue = reject; });
  return {
    promise,
    resolve(value: T) { if (!resolveValue) throw Error("대기 결과 필요"); resolveValue(value); },
    reject(error: unknown) { if (!rejectValue) throw Error("대기 오류 필요"); rejectValue(error); },
  };
}
function hdr() {
  return new DataTexture(new Uint16Array([0x3c00, 0x3800, 0x3400, 0x3c00]), 1, 1, RGBAFormat, HalfFloatType);
}
function prepared() {
  const target = new WebGLRenderTarget(4, 4);
  return { value: { target, disposeGenerator: vi.fn<() => void>() }, disposeTarget: vi.spyOn(target, "dispose") };
}
type Prepared = ReturnType<typeof prepared>["value"];
const bindings: StudioBg3dHdriEnvironmentBinding[] = [];
function mount(scene: Scene, options: Partial<StudioBg3dHdriEnvironmentMountOptions> = {}) {
  const binding = mountStudioBg3dHdriEnvironment(scene, new WebGLRenderer(), {
    url: "/owned.hdr", intensity: 1, rotationDegrees: 0, useAsBackground: false, ...options,
  });
  bindings.push(binding);
  return binding;
}
async function ticks() { await Promise.resolve(); await Promise.resolve(); }
beforeEach(() => { io.load.mockReset(); io.pmrem.mockReset(); bindings.length = 0; });
afterEach(() => { for (const binding of bindings) binding.dispose(); vi.restoreAllMocks(); });

describe("HDRI binding의 현재 세대와 개인 자원 수명", () => {
  it("외부 표시값 변경 뒤 해제해도 폐기한 HDRI pointer가 scene에 남지 않는다", async () => {
    const scene = new Scene(), baselineEnvironment = new Texture(), baselineBackground = new Texture();
    scene.environment = baselineEnvironment; scene.background = baselineBackground;
    const source = hdr(), resource = prepared(), sourceDispose = vi.spyOn(source, "dispose");
    io.load.mockResolvedValue(source); io.pmrem.mockResolvedValue(resource.value);
    const binding = mount(scene, { useAsBackground: true });
    await expect(binding.ready).resolves.toBe(true);
    const externalEnvironmentRotation = scene.environmentRotation, externalBackgroundRotation = scene.backgroundRotation;
    scene.environmentIntensity = 3.25; scene.backgroundIntensity = 2.75;
    scene.environmentRotation.set(0.1, 0.7, 0.3); scene.backgroundRotation.set(0.2, 0.8, 0.4);
    binding.dispose();
    expect(scene.environment).toBe(baselineEnvironment); expect(scene.background).toBe(baselineBackground);
    expect(scene.environmentIntensity).toBe(3.25); expect(scene.backgroundIntensity).toBe(2.75);
    expect(scene.environmentRotation).toBe(externalEnvironmentRotation); expect(scene.backgroundRotation).toBe(externalBackgroundRotation);
    expect(scene.environmentRotation.y).toBe(0.7); expect(scene.backgroundRotation.y).toBe(0.8);
    expect(resource.disposeTarget).toHaveBeenCalledOnce(); expect(sourceDispose).toHaveBeenCalledOnce();
  });

  it("로드 중 setter 값을 commit하고 원래 환경·배경·세기·각도를 해제 때 복원한다", async () => {
    const scene = new Scene(), environment = new Texture(), background = new Texture();
    scene.environment = environment; scene.background = background;
    scene.environmentIntensity = 0.4; scene.backgroundIntensity = 0.7;
    scene.environmentRotation.set(0.1, 0.2, 0.3); scene.backgroundRotation.set(0.3, 0.2, 0.1);
    const originalEnvironmentRotation = scene.environmentRotation.clone(), originalBackgroundRotation = scene.backgroundRotation.clone();
    const loading = deferred<DataTexture>(), source = hdr(), resource = prepared(), notify = vi.fn<(applied: boolean) => void>();
    expect(source.mapping).toBe(UVMapping);
    const disposeSource = vi.spyOn(source, "dispose");
    io.load.mockReturnValue(loading.promise); io.pmrem.mockResolvedValue(resource.value);
    const binding = mount(scene, { useAsBackground: true, onSettled: notify });
    expect(binding.getSnapshot().status).toBe("loading");
    binding.setIntensity(2.3); binding.setRotation(407);
    loading.resolve(source); await expect(binding.ready).resolves.toBe(true);
    expect(scene.environment).toBe(resource.value.target.texture); expect(scene.background).toBe(source);
    expect(source.mapping).toBe(EquirectangularReflectionMapping);
    expect(scene.environmentIntensity).toBe(2.3); expect(scene.backgroundIntensity).toBe(2.3);
    expect(scene.environmentRotation.y).toBeCloseTo(47 * Math.PI / 180);
    expect(scene.backgroundRotation.equals(scene.environmentRotation)).toBe(true);
    expect(binding.texture).toBe(resource.value.target.texture); expect(notify).toHaveBeenCalledExactlyOnceWith(true);
    expect(disposeSource).not.toHaveBeenCalled(); expect(resource.value.disposeGenerator).toHaveBeenCalledOnce();
    binding.setRotation(-90); binding.setIntensity(3);
    expect(scene.environmentRotation.y).toBeCloseTo(1.5 * Math.PI); expect(scene.backgroundIntensity).toBe(3);
    binding.dispose(); binding.dispose();
    expect(scene.environment).toBe(environment); expect(scene.background).toBe(background);
    expect(scene.environmentIntensity).toBe(0.4); expect(scene.backgroundIntensity).toBe(0.7);
    expect(scene.environmentRotation.equals(originalEnvironmentRotation)).toBe(true);
    expect(scene.backgroundRotation.equals(originalBackgroundRotation)).toBe(true);
    expect(resource.disposeTarget).toHaveBeenCalledOnce(); expect(disposeSource).toHaveBeenCalledOnce();
    expect(binding.getSnapshot().status).toBe("disposed");
  });

  it("늦은 A load는 먼저 적용된 B를 덮거나 성공을 게시하지 않는다", async () => {
    const scene = new Scene(), a = deferred<DataTexture>(), b = deferred<DataTexture>();
    const sourceA = hdr(), sourceB = hdr(), disposeA = vi.spyOn(sourceA, "dispose"), resourceB = prepared();
    const notifyA = vi.fn<(applied: boolean) => void>(), notifyB = vi.fn<(applied: boolean) => void>();
    io.load.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise); io.pmrem.mockResolvedValue(resourceB.value);
    const bindingA = mount(scene, { onSettled: notifyA }), bindingB = mount(scene, { onSettled: notifyB });
    b.resolve(sourceB); await expect(bindingB.ready).resolves.toBe(true);
    a.resolve(sourceA); await expect(bindingA.ready).resolves.toBe(false);
    expect(scene.environment).toBe(resourceB.value.target.texture); expect(io.pmrem).toHaveBeenCalledOnce();
    expect(disposeA).toHaveBeenCalledOnce(); expect(notifyA).not.toHaveBeenCalled();
    expect(notifyB).toHaveBeenCalledExactlyOnceWith(true); expect(bindingA.getSnapshot().status).toBe("superseded");
  });

  it("변환 대기 중 새 B가 생기면 늦은 target·generator만 정리한다", async () => {
    const scene = new Scene(), sourceA = hdr(), sourceB = hdr(), sourceDispose = vi.spyOn(sourceA, "dispose");
    const pendingA = deferred<Prepared>(), resourceA = prepared(), resourceB = prepared(), notifyA = vi.fn();
    io.load.mockResolvedValueOnce(sourceA).mockResolvedValueOnce(sourceB);
    io.pmrem.mockReturnValueOnce(pendingA.promise).mockResolvedValueOnce(resourceB.value);
    const bindingA = mount(scene, { onSettled: notifyA }); await ticks();
    expect(bindingA.getSnapshot().status).toBe("preparing");
    const bindingB = mount(scene); await expect(bindingB.ready).resolves.toBe(true);
    expect(sourceDispose).not.toHaveBeenCalled();
    const options = io.pmrem.mock.calls[0]?.[2]; expect(options?.isCurrent?.()).toBe(false);
    pendingA.resolve(resourceA.value); await expect(bindingA.ready).resolves.toBe(false);
    expect(resourceA.disposeTarget).toHaveBeenCalledOnce(); expect(resourceA.value.disposeGenerator).toHaveBeenCalledOnce();
    expect(sourceDispose).toHaveBeenCalledOnce(); expect(notifyA).not.toHaveBeenCalled();
    expect(scene.environment).toBe(resourceB.value.target.texture);
  });

  it("load 전 해제한 요청은 도착한 HDR만 정리하고 PMREM을 시작하지 않는다", async () => {
    const scene = new Scene(), loading = deferred<DataTexture>(), source = hdr(), disposeSource = vi.spyOn(source, "dispose"), notify = vi.fn();
    io.load.mockReturnValue(loading.promise);
    const binding = mount(scene, { onSettled: notify }); binding.dispose(); loading.resolve(source);
    await expect(binding.ready).resolves.toBe(false);
    expect(io.pmrem).not.toHaveBeenCalled(); expect(disposeSource).toHaveBeenCalledOnce(); expect(notify).not.toHaveBeenCalled();
    expect(scene.environment).toBeNull(); expect(binding.getSnapshot().status).toBe("disposed");
  });

  it("prepare 중 해제해도 factory settle 전에 입력 HDR을 dispose하지 않는다", async () => {
    const scene = new Scene(), source = hdr(), disposeSource = vi.spyOn(source, "dispose"), pending = deferred<Prepared>(), resource = prepared();
    io.load.mockResolvedValue(source); io.pmrem.mockReturnValue(pending.promise);
    const binding = mount(scene); await ticks(); binding.dispose();
    expect(disposeSource).not.toHaveBeenCalled(); expect(scene.environment).toBeNull();
    pending.resolve(resource.value); await expect(binding.ready).resolves.toBe(false);
    expect(disposeSource).toHaveBeenCalledOnce(); expect(resource.disposeTarget).toHaveBeenCalledOnce();
    expect(resource.value.disposeGenerator).toHaveBeenCalledOnce();
  });

  it("A 해제 뒤 B cleanup은 폐기된 A 대신 살아 있는 원래 baseline을 복원한다", async () => {
    const scene = new Scene(), baseline = new Texture(), background = new Texture();
    scene.environment = baseline; scene.background = background;
    const sourceA = hdr(), sourceB = hdr(), resourceA = prepared(), resourceB = prepared(), loadingB = deferred<DataTexture>();
    io.load.mockResolvedValueOnce(sourceA).mockReturnValueOnce(loadingB.promise);
    io.pmrem.mockResolvedValueOnce(resourceA.value).mockResolvedValueOnce(resourceB.value);
    const bindingA = mount(scene, { useAsBackground: true }); await bindingA.ready;
    const bindingB = mount(scene, { useAsBackground: true }); bindingA.dispose();
    loadingB.resolve(sourceB); await expect(bindingB.ready).resolves.toBe(true); bindingB.dispose();
    expect(scene.environment).toBe(baseline); expect(scene.background).toBe(background);
    expect(scene.environment).not.toBe(resourceA.value.target.texture); expect(scene.background).not.toBe(sourceA);
  });

  it("이전 panorama owner가 해제돼도 그 texture를 HDRI cleanup에서 부활시키지 않는다", async () => {
    const scene = new Scene(), baseline = new Texture(), oldPanorama = new Texture(), newPanorama = new Texture(); scene.background = baseline;
    const panoramaA = claimStudioBg3dEnvironmentSlots(scene, { environment: false, background: true });
    expect(panoramaA.install({ background: { value: oldPanorama, intensity: 1, rotation: new Euler() } })).toBe(true);
    const source = hdr(), resource = prepared(), loading = deferred<DataTexture>();
    io.load.mockReturnValue(loading.promise); io.pmrem.mockResolvedValue(resource.value);
    const binding = mount(scene, { useAsBackground: true }); panoramaA.dispose(); oldPanorama.dispose();
    const panoramaB = claimStudioBg3dEnvironmentSlots(scene, { environment: false, background: true });
    expect(panoramaB.install({ background: { value: newPanorama, intensity: 1, rotation: new Euler() } })).toBe(true);
    loading.resolve(source); await expect(binding.ready).resolves.toBe(false); binding.dispose();
    expect(scene.background).toBe(newPanorama); panoramaB.dispose(); expect(scene.background).toBe(baseline);
  });

  it("성공 observer 예외는 현재 target을 폐기하거나 false를 다시 통지하지 않는다", async () => {
    const scene = new Scene(), source = hdr(), resource = prepared(), observerError = Error("observer");
    const notify = vi.fn(() => { throw observerError; }); io.load.mockResolvedValue(source); io.pmrem.mockResolvedValue(resource.value);
    const binding = mount(scene, { onSettled: notify }); await expect(binding.ready).resolves.toBe(true);
    expect(notify).toHaveBeenCalledExactlyOnceWith(true); expect(scene.environment).toBe(resource.value.target.texture);
    expect(resource.disposeTarget).not.toHaveBeenCalled();
    expect(binding.getSnapshot()).toMatchObject({ status: "applied", diagnostics: [{ phase: "observer", code: "observer-failed", error: observerError }] });
    binding.dispose(); expect(scene.environment).toBeNull(); expect(resource.disposeTarget).toHaveBeenCalledOnce();
  });

  it.each(["sync", "async"])("%s load 오류와 실패 observer 오류를 별도로 보존하고 ready는 false로 끝난다", async (mode) => {
    const scene = new Scene(), original = Error("load"), observer = Error("observer");
    const notify = vi.fn(() => { throw observer; });
    if (mode === "sync") io.load.mockImplementation(() => { throw original; });
    else io.load.mockRejectedValue(original);
    const binding = mount(scene, { onSettled: notify }); await expect(binding.ready).resolves.toBe(false);
    expect(notify).toHaveBeenCalledExactlyOnceWith(false); expect(scene.environment).toBeNull();
    expect(binding.getSnapshot()).toMatchObject({ status: "failed", diagnostics: [
      { phase: "load", code: "load-failed", error: original }, { phase: "observer", code: "observer-failed", error: observer },
    ] });
  });

  it.each(["sync", "async"])("%s factory의 원오류와 cleanup 원인을 보존하고 자기 HDR을 한 번 정리한다", async (mode) => {
    const scene = new Scene(), source = hdr(), disposeSource = vi.spyOn(source, "dispose"), original = Error("compile");
    const combined = new AggregateError([original, Error("factory cleanup")], "prepare", { cause: original });
    io.load.mockResolvedValue(source);
    if (mode === "sync") io.pmrem.mockImplementation(() => { throw combined; });
    else io.pmrem.mockRejectedValue(combined);
    const notify = vi.fn(), binding = mount(scene, { onSettled: notify }); await expect(binding.ready).resolves.toBe(false);
    expect(disposeSource).toHaveBeenCalledOnce(); expect(scene.environment).toBeNull();
    expect(notify).toHaveBeenCalledExactlyOnceWith(false);
    expect(binding.getSnapshot().diagnostics).toEqual([{ phase: "prepare", code: "pmrem-failed", error: combined }]);
  });

  it("source 정리 예외가 commit 성공을 뒤집거나 generator 정리를 막지 않는다", async () => {
    const scene = new Scene(), source = hdr(), resource = prepared(), error = Error("source dispose");
    source.addEventListener("dispose", () => { throw error; }); io.load.mockResolvedValue(source); io.pmrem.mockResolvedValue(resource.value);
    const binding = mount(scene); await expect(binding.ready).resolves.toBe(true);
    expect(scene.environment).toBe(resource.value.target.texture); expect(resource.disposeTarget).not.toHaveBeenCalled();
    expect(resource.value.disposeGenerator).toHaveBeenCalledOnce();
    expect(binding.getSnapshot().diagnostics).toEqual([{ phase: "cleanup", code: "source-dispose-failed", error }]);
  });

  it("generator 정리 예외를 별도 기록하고 이미 적용된 target과 true 통지를 보존한다", async () => {
    const scene = new Scene(), source = hdr(), resource = prepared(), error = Error("generator dispose"), notify = vi.fn();
    resource.value.disposeGenerator.mockImplementation(() => { throw error; });
    io.load.mockResolvedValue(source); io.pmrem.mockResolvedValue(resource.value);
    const binding = mount(scene, { onSettled: notify }); await expect(binding.ready).resolves.toBe(true);
    expect(scene.environment).toBe(resource.value.target.texture); expect(notify).toHaveBeenCalledExactlyOnceWith(true);
    expect(binding.getSnapshot().diagnostics).toEqual([{ phase: "cleanup", code: "generator-dispose-failed", error }]);
    binding.dispose(); expect(resource.value.disposeGenerator).toHaveBeenCalledOnce(); expect(resource.disposeTarget).toHaveBeenCalledOnce();
  });

  it("해제 시 target·source가 모두 throw해도 두 정리를 각각 시도하고 진단을 남긴다", async () => {
    const scene = new Scene(), baseline = new Texture(), source = hdr(), resource = prepared(); scene.environment = baseline;
    const targetError = Error("target dispose"), sourceError = Error("source dispose");
    resource.value.target.addEventListener("dispose", () => { throw targetError; }); source.addEventListener("dispose", () => { throw sourceError; });
    const disposeSource = vi.spyOn(source, "dispose"); io.load.mockResolvedValue(source); io.pmrem.mockResolvedValue(resource.value);
    const binding = mount(scene, { useAsBackground: true }); await binding.ready; binding.dispose(); binding.dispose();
    expect(scene.environment).toBe(baseline); expect(scene.background).toBeNull();
    expect(resource.disposeTarget).toHaveBeenCalledOnce(); expect(disposeSource).toHaveBeenCalledOnce();
    expect(binding.getSnapshot().diagnostics).toEqual([
      { phase: "cleanup", code: "target-dispose-failed", error: targetError },
      { phase: "cleanup", code: "source-dispose-failed", error: sourceError },
    ]);
  });

  it("cleanup 재진입으로 새 owner가 생겨도 오래된 성공 callback은 게시하지 않는다", async () => {
    const scene = new Scene(), source = hdr(), resource = prepared(), other = new Texture(), notify = vi.fn();
    const nextOwner: { current: ReturnType<typeof claimStudioBg3dEnvironmentSlots> | undefined } = { current: undefined };
    source.addEventListener("dispose", () => {
      nextOwner.current = claimStudioBg3dEnvironmentSlots(scene, { environment: true, background: false });
      nextOwner.current.install({ environment: { value: other, intensity: 4, rotation: new Euler() } });
    });
    io.load.mockResolvedValue(source); io.pmrem.mockResolvedValue(resource.value);
    const binding = mount(scene, { onSettled: notify }); await expect(binding.ready).resolves.toBe(false);
    expect(scene.environment).toBe(other); expect(notify).not.toHaveBeenCalled(); expect(resource.disposeTarget).toHaveBeenCalledOnce();
    nextOwner.current?.dispose(); expect(scene.environment).toBeNull();
  });

  it("실패 cleanup이 B를 시작하기 전에 현재 A 실패를 한 번만 통지한다", async () => {
    const scene = new Scene(), sourceA = hdr(), sourceB = hdr(), resourceB = prepared(), original = Error("A 변환 실패");
    const order: string[] = [], next: { binding?: StudioBg3dHdriEnvironmentBinding } = {};
    const notify = vi.fn((result: boolean) => { order.push(`notify:${result}`); });
    sourceA.addEventListener("dispose", () => { order.push("cleanup"); next.binding = mount(scene); });
    io.load.mockResolvedValueOnce(sourceA).mockResolvedValueOnce(sourceB);
    io.pmrem.mockRejectedValueOnce(original).mockResolvedValueOnce(resourceB.value);
    const bindingA = mount(scene, { onSettled: notify }); await expect(bindingA.ready).resolves.toBe(false);
    const bindingB = next.binding; if (!bindingB) throw Error("cleanup에서 새 B가 시작되어야 합니다.");
    await expect(bindingB.ready).resolves.toBe(true);
    expect(order).toEqual(["notify:false", "cleanup"]); expect(notify).toHaveBeenCalledExactlyOnceWith(false);
    expect(scene.environment).toBe(resourceB.value.target.texture);
    expect(bindingA.getSnapshot().diagnostics).toEqual([{ phase: "prepare", code: "pmrem-failed", error: original }]);
  });

  it("성공 observer가 B를 시작하면 A ready는 false이며 B를 보존한다", async () => {
    const scene = new Scene(), sourceA = hdr(), sourceB = hdr(), resourceA = prepared(), resourceB = prepared();
    const next: { binding?: StudioBg3dHdriEnvironmentBinding } = {};
    io.load.mockResolvedValueOnce(sourceA).mockResolvedValueOnce(sourceB);
    io.pmrem.mockResolvedValueOnce(resourceA.value).mockResolvedValueOnce(resourceB.value);
    const notify = vi.fn(() => { next.binding = mount(scene); });
    const bindingA = mount(scene, { onSettled: notify }); await expect(bindingA.ready).resolves.toBe(false);
    const bindingB = next.binding; if (!bindingB) throw Error("observer에서 새 B가 시작되어야 합니다.");
    await expect(bindingB.ready).resolves.toBe(true);
    expect(notify).toHaveBeenCalledExactlyOnceWith(true); expect(bindingA.getSnapshot().status).toBe("superseded");
    expect(resourceA.disposeTarget).toHaveBeenCalledOnce(); expect(scene.environment).toBe(resourceB.value.target.texture);
  });

  it("성공 observer가 자신을 해제하면 ready는 false이며 false 재통지는 없다", async () => {
    const scene = new Scene(), source = hdr(), resource = prepared();
    const current: { binding?: StudioBg3dHdriEnvironmentBinding } = {};
    const notify = vi.fn(() => current.binding?.dispose()); io.load.mockResolvedValue(source); io.pmrem.mockResolvedValue(resource.value);
    current.binding = mount(scene, { onSettled: notify });
    await expect(current.binding.ready).resolves.toBe(false);
    expect(notify).toHaveBeenCalledExactlyOnceWith(true); expect(current.binding.getSnapshot().status).toBe("disposed");
    expect(scene.environment).toBeNull(); expect(resource.disposeTarget).toHaveBeenCalledOnce();
  });
});
