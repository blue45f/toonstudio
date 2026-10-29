import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { createStudioThreeHdriLifecycle, STUDIO_THREE_HDRI_URLS, type StudioThreeHdriDependencies, type StudioThreeLightingPreset } from "./studio-virtual-space-three-hdri-controller";

function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("대기 작업이 초기화되지 않았습니다."); };
  let reject: (error: unknown) => void = () => { throw new Error("대기 작업이 초기화되지 않았습니다."); };
  const promise = new Promise<T>((complete, fail) => { resolve = complete; reject = fail; });
  return { promise, resolve: (value: T) => resolve(value), reject: (error: unknown) => reject(error) };
}
function fixture() {
  const scene = new THREE.Scene();
  const requests: { readonly url: string; readonly task: ReturnType<typeof deferred<THREE.Texture>> }[] = [];
  const newOutput = () => {
    const target = new THREE.WebGLRenderTarget(32, 16, { depthBuffer: false });
    return { target, targetDispose: vi.spyOn(target, "dispose"), dispose: vi.fn(), compile: vi.fn() };
  };
  const generators: ReturnType<typeof newOutput>[] = [];
  const load = vi.fn((url: string) => {
    const task = deferred<THREE.Texture>(); requests.push({ url, task }); return task.promise;
  });
  const createGenerator = vi.fn<StudioThreeHdriDependencies["createGenerator"]>(() => {
    const output = newOutput(); generators.push(output);
    return { compileEquirectangularShader: output.compile, fromEquirectangular: vi.fn(() => output.target), dispose: output.dispose };
  });
  const onError = vi.fn();
  let externalStopped = false;
  const controller = createStudioThreeHdriLifecycle(scene, () => externalStopped, { load, createGenerator, onError });
  const request = (preset: StudioThreeLightingPreset, occurrence = 0) => {
    const value = requests.filter((item) => item.url === STUDIO_THREE_HDRI_URLS[preset])[occurrence];
    if (!value) throw new Error(`HDRI 요청이 없습니다: ${preset}/${occurrence}`);
    return value;
  };
  const complete = (preset: StudioThreeLightingPreset, occurrence = 0) => {
    const hdr = new THREE.DataTexture(new Float32Array(8 * 4 * 4), 8, 4, THREE.RGBAFormat, THREE.FloatType);
    const dispose = vi.spyOn(hdr, "dispose");
    request(preset, occurrence).task.resolve(hdr);
    return { hdr, dispose };
  };
  return { scene, controller, load, createGenerator, generators, onError, request, complete, stop: () => { externalStopped = true; } };
}

describe("HDRI RenderTarget 소유권과 공유 준비", () => {
  it("세 preset의 기존 1K CC0 URL을 유지한다", () => {
    expect(STUDIO_THREE_HDRI_URLS).toEqual({
      day: "/assets/3d/hdri/konigsallee_1k.hdr",
      studio: "/assets/3d/hdri/combination_room_1k.hdr",
      night: "/assets/3d/hdri/cobblestone_street_night_1k.hdr",
    });
  });

  it("같은 preset의 prepare/apply는 요청·PMREM 변환을 공유하고 입력·임시 자원을 즉시 해제한다", async () => {
    const f = fixture();
    const first = f.controller.preparePreset("day"), second = f.controller.preparePreset("day");
    f.controller.applyPreset("day");
    expect(first).toBe(second); expect(f.controller.getPendingCount()).toBe(1);
    await Promise.resolve();
    expect(f.load).toHaveBeenCalledExactlyOnceWith(STUDIO_THREE_HDRI_URLS.day);
    const input = f.complete("day");
    await first; await f.controller.whenIdle();
    const generation = f.generators[0];
    if (!generation) throw new Error("실제 출력 target이 생성되지 않았습니다.");
    expect(f.createGenerator).toHaveBeenCalledTimes(1); expect(generation.compile).toHaveBeenCalledTimes(1);
    expect(generation.dispose).toHaveBeenCalledTimes(1); expect(input.dispose).toHaveBeenCalledTimes(1);
    expect(generation.targetDispose).not.toHaveBeenCalled();
    expect(f.scene.environment).toBe(generation.target.texture); expect(f.scene.environmentIntensity).toBe(0.56);
    expect(f.controller.getRenderTargets()).toEqual([generation.target]); expect(f.controller.getPendingCount()).toBe(0);
    f.controller.dispose(); f.controller.dispose();
    expect(generation.targetDispose).toHaveBeenCalledTimes(1);
  });

  it("prepare만 하면 활성 환경을 바꾸지 않고 commit 뒤 cached apply에서만 설치한다", async () => {
    const f = fixture(), original = new THREE.Texture(); f.scene.environment = original;
    const task = f.controller.preparePreset("studio"); await Promise.resolve(); f.complete("studio"); await task;
    const target = f.controller.getRenderTargets()[0];
    if (!target) throw new Error("준비한 studio target이 없습니다.");
    expect(f.scene.environment).toBe(original);
    f.controller.applyPreset("studio");
    expect(f.scene.environment).toBe(target.texture); expect(f.scene.environmentIntensity).toBe(0.64);
    expect(f.load).toHaveBeenCalledTimes(1);
    f.controller.dispose(); original.dispose();
  });

  it("오래된 preset의 늦은 결과는 캐시만 채우고 최신 활성 환경을 덮어쓰지 않는다", async () => {
    const f = fixture(); f.controller.applyPreset("day"); f.controller.applyPreset("night");
    const night = f.controller.preparePreset("night"); await Promise.resolve(); f.complete("night"); await night;
    const nightTexture = f.scene.environment;
    expect(nightTexture).not.toBeNull(); expect(f.scene.environmentIntensity).toBe(0.42);
    f.complete("day"); await f.controller.whenIdle();
    expect(f.scene.environment).toBe(nightTexture); expect(f.controller.getRenderTargets()).toHaveLength(2);
    f.controller.applyPreset("day");
    expect(f.scene.environment).not.toBe(nightTexture); expect(f.scene.environmentIntensity).toBe(0.56);
    expect(f.load).toHaveBeenCalledTimes(2); f.controller.dispose();
  });

  it("비활성 캐시를 포함한 세 RenderTarget을 관측하고 texture만 따로 이중 해제하지 않는다", async () => {
    const f = fixture();
    for (const preset of ["day", "studio", "night"] as const) {
      const task = f.controller.preparePreset(preset); await Promise.resolve(); f.complete(preset); await task;
    }
    f.controller.applyPreset("night");
    const targets = f.controller.getRenderTargets(); expect(targets).toHaveLength(3);
    const textureDisposes = targets.map((target) => vi.spyOn(target.texture, "dispose"));
    const copied = [...targets]; copied.pop(); expect(f.controller.getRenderTargets()).toHaveLength(3);
    for (const generator of f.generators) expect(generator.targetDispose).not.toHaveBeenCalled();
    f.controller.dispose(); f.controller.dispose();
    for (const generator of f.generators) expect(generator.targetDispose).toHaveBeenCalledTimes(1);
    for (const dispose of textureDisposes) expect(dispose).not.toHaveBeenCalled();
    expect(f.controller.getRenderTargets()).toHaveLength(0); expect(f.scene.environment).toBeNull();
  });

  it("dispose 뒤 도착한 HDR은 해제만 하고 generator·캐시·환경을 되살리지 않는다", async () => {
    const f = fixture(), foreign = new THREE.Texture(); f.scene.environment = foreign;
    f.controller.applyPreset("day"); await Promise.resolve();
    f.controller.dispose(); expect(f.controller.getPendingCount()).toBe(1);
    const input = f.complete("day"); await f.controller.whenIdle();
    expect(input.dispose).toHaveBeenCalledTimes(1); expect(f.createGenerator).not.toHaveBeenCalled();
    expect(f.controller.getPendingCount()).toBe(0); expect(f.controller.getRenderTargets()).toHaveLength(0);
    expect(f.scene.environment).toBe(foreign); expect(f.controller.getFailureCount()).toBe(0);
    f.controller.applyPreset("night"); expect(f.load).toHaveBeenCalledTimes(1);
    await expect(f.controller.preparePreset("night")).rejects.toMatchObject({ name: "AbortError" });
    foreign.dispose();
  });

  it("외부 stage 종료 flag도 늦은 HDR 변환을 막고 이미 선택된 환경을 새로 설치하지 않는다", async () => {
    const f = fixture(); f.controller.applyPreset("day"); await Promise.resolve(); f.stop();
    const input = f.complete("day"); await f.controller.whenIdle();
    expect(input.dispose).toHaveBeenCalledTimes(1); expect(f.createGenerator).not.toHaveBeenCalled();
    expect(f.scene.environment).toBeNull(); f.controller.dispose();
  });

  it("PMREM output 생성 도중 dispose돼도 새 target과 임시 자원을 각각 한 번 해제한다", async () => {
    const f = fixture(), target = new THREE.WebGLRenderTarget(32, 16), outputDispose = vi.spyOn(target, "dispose"), temporaryDispose = vi.fn();
    f.createGenerator.mockImplementationOnce(() => ({
      compileEquirectangularShader: vi.fn(),
      fromEquirectangular: vi.fn(() => { f.controller.dispose(); return target; }), dispose: temporaryDispose,
    }));
    f.controller.applyPreset("day"); await Promise.resolve(); const input = f.complete("day"); await f.controller.whenIdle();
    expect(temporaryDispose).toHaveBeenCalledTimes(1); expect(outputDispose).toHaveBeenCalledTimes(1);
    expect(input.dispose).toHaveBeenCalledTimes(1); expect(f.scene.environment).toBeNull();
    expect(f.controller.getRenderTargets()).toHaveLength(0); expect(f.controller.getPendingCount()).toBe(0);
  });

  it("PMREM 임시 해제가 실패하면 생성한 output도 버리고 준비 실패를 호출자에게 전달한다", async () => {
    const f = fixture(), target = new THREE.WebGLRenderTarget(32, 16), outputDispose = vi.spyOn(target, "dispose");
    const temporaryDispose = vi.fn(() => { throw new Error("temporary dispose failed"); });
    f.createGenerator.mockImplementationOnce(() => ({ compileEquirectangularShader: vi.fn(), fromEquirectangular: vi.fn(() => target), dispose: temporaryDispose }));
    const task = f.controller.preparePreset("day"), rejected = expect(task).rejects.toThrow("temporary dispose failed");
    await Promise.resolve(); const input = f.complete("day"); await rejected; await f.controller.whenIdle();
    expect(input.dispose).toHaveBeenCalledTimes(1); expect(outputDispose).toHaveBeenCalledTimes(1);
    expect(temporaryDispose).toHaveBeenCalledTimes(1); expect(f.controller.getRenderTargets()).toHaveLength(0);
    expect(f.onError).toHaveBeenCalledTimes(1); expect(f.controller.getFailureCount()).toBe(1); f.controller.dispose();
  });

  it("입력 HDR 해제 실패를 캐시 성공으로 남기지 않고 output도 해제한다", async () => {
    const f = fixture(), hdr = new THREE.Texture();
    vi.spyOn(hdr, "dispose").mockImplementation(() => { throw new Error("input release failed"); });
    const task = f.controller.preparePreset("day"), rejected = expect(task).rejects.toThrow("input release failed");
    await Promise.resolve(); f.request("day").task.resolve(hdr); await rejected; await f.controller.whenIdle();
    expect(f.generators[0]?.targetDispose).toHaveBeenCalledTimes(1);
    expect(f.controller.getRenderTargets()).toHaveLength(0); expect(f.controller.getFailureCount()).toBe(1);
    expect(f.scene.environment).toBeNull(); f.controller.dispose();
  });

  it("shader 준비 실패도 입력·generator를 해제하고 기존 환경을 보존한다", async () => {
    const f = fixture(), foreign = new THREE.Texture(); f.scene.environment = foreign;
    const generate = vi.fn(), dispose = vi.fn();
    f.createGenerator.mockImplementationOnce(() => ({
      compileEquirectangularShader: () => { throw new Error("shader preparation failed"); },
      fromEquirectangular: generate, dispose,
    }));
    const task = f.controller.preparePreset("studio"), rejected = expect(task).rejects.toThrow("shader preparation failed");
    await Promise.resolve(); const input = f.complete("studio"); await rejected; await f.controller.whenIdle();
    expect(generate).not.toHaveBeenCalled(); expect(dispose).toHaveBeenCalledTimes(1); expect(input.dispose).toHaveBeenCalledTimes(1);
    expect(f.scene.environment).toBe(foreign); expect(f.onError).toHaveBeenCalledTimes(1); f.controller.dispose(); foreign.dispose();
  });

  it("변환과 임시 자원 해제가 함께 실패해도 두 원인을 모두 보존한다", async () => {
    const f = fixture(), shaderError = new Error("shader failed"), releaseError = new Error("temporary release failed");
    const dispose = vi.fn(() => { throw releaseError; });
    f.createGenerator.mockImplementationOnce(() => ({
      compileEquirectangularShader: () => { throw shaderError; }, fromEquirectangular: vi.fn(), dispose,
    }));
    const failure = f.controller.preparePreset("day").then(
      () => { throw new Error("실패해야 하는 HDRI 준비가 성공했습니다."); }, (error: unknown) => error,
    );
    await Promise.resolve(); const input = f.complete("day"); const error = await failure;
    expect(error).toBeInstanceOf(AggregateError);
    if (!(error instanceof AggregateError)) throw error;
    expect(error.errors).toEqual([shaderError, releaseError]);
    expect(f.onError).toHaveBeenCalledWith(STUDIO_THREE_HDRI_URLS.day, error);
    expect(dispose).toHaveBeenCalledTimes(1); expect(input.dispose).toHaveBeenCalledTimes(1);
    expect(f.controller.getRenderTargets()).toHaveLength(0); f.controller.dispose();
  });

  it("fetch 실패를 관측하고 pending을 비워 명시적 retry만 새 요청으로 허용한다", async () => {
    const f = fixture(), foreign = new THREE.Texture(); f.scene.environment = foreign;
    const first = f.controller.preparePreset("day"), rejected = expect(first).rejects.toThrow("network failed");
    await Promise.resolve(); f.request("day").task.reject(new Error("network failed")); await rejected; await f.controller.whenIdle();
    expect(f.scene.environment).toBe(foreign); expect(f.controller.getPendingCount()).toBe(0); expect(f.onError).toHaveBeenCalledTimes(1);
    const retry = f.controller.preparePreset("day"); expect(retry).not.toBe(first); await Promise.resolve();
    f.complete("day", 1); await retry; f.controller.applyPreset("day");
    expect(f.load).toHaveBeenCalledTimes(2); expect(f.scene.environment).not.toBe(foreign);
    expect(f.controller.getFailureCount()).toBe(1); f.controller.dispose(); foreign.dispose();
  });
});
