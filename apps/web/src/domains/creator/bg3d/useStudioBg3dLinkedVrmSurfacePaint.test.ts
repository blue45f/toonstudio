// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { Group } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioVrmSurfacePaintSettings } from "../vrm/studio-vrm-scene-document";
import { useStudioBg3dLinkedVrmSurfacePaint } from "./useStudioBg3dLinkedVrmSurfacePaint";

const mocks = vi.hoisted(() => ({ create: vi.fn(), restore: vi.fn() }));
vi.mock("../vrm/studio-vrm-texture-paint-runtime", async (importOriginal) => ({
  ...await importOriginal<typeof import("../vrm/studio-vrm-texture-paint-runtime")>(),
  createStudioVrmTexturePaintRuntime: mocks.create,
}));
vi.mock("../vrm/studio-vrm-texture-paint-persistence", () => ({
  rehydrateStudioVrmTexturePaintRuntime: mocks.restore,
}));

const empty: StudioVrmSurfacePaintSettings = { version: 1, textures: [] };
const painted: StudioVrmSurfacePaintSettings = {
  version: 1,
  textures: [{
    bindingKey: "gltf-material-2-baseColor", materialLocator: "gltf-material:2", textureSlot: "baseColor",
    hash: `sha256:${"a".repeat(64)}`, mime: "image/png", byteSize: 80, width: 2, height: 2,
  }],
};

function deferred() {
  let done: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => { done = resolve; });
  return { promise, done };
}

describe("공유 컷 VRM의 표면 텍스처 준비 상태", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  afterEach(cleanup);

  it("원본에는 런타임을 만들지 않고, 저장한 재질 전체가 복원된 뒤 캡처를 허용한다", async () => {
    const scene = new Group(), runtime = { dispose: vi.fn() }, pending = deferred();
    mocks.create.mockReturnValue(runtime);
    mocks.restore.mockReturnValue(pending.promise);
    const view = renderHook(({ settings }) => useStudioBg3dLinkedVrmSurfacePaint(scene, settings), {
      initialProps: { settings: empty },
    });
    expect(view.result.current).toBe("ready");
    expect(mocks.create).not.toHaveBeenCalled();
    view.rerender({ settings: painted });
    expect(view.result.current).toBe("loading");
    await act(() => vi.dynamicImportSettled());
    expect(mocks.restore).toHaveBeenCalledOnce();
    await act(async () => { pending.done(); await pending.promise; });
    expect(view.result.current).toBe("ready");
    view.rerender({ settings: structuredClone(painted) });
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.restore).toHaveBeenCalledOnce();
    view.rerender({ settings: empty });
    expect(runtime.dispose).toHaveBeenCalledOnce();
    expect(view.result.current).toBe("ready");
  });

  it("모델 전환 도중 늦게 끝난 복원과 누락된 PNG를 현재 컷의 준비 완료로 인정하지 않는다", async () => {
    const first = new Group(), second = new Group();
    const past = deferred(), current = deferred();
    const oldRuntime = { dispose: vi.fn() }, currentRuntime = { dispose: vi.fn() };
    mocks.create.mockReturnValueOnce(oldRuntime).mockReturnValueOnce(currentRuntime);
    mocks.restore.mockReturnValueOnce(past.promise).mockImplementationOnce(async () => {
      await current.promise;
      throw new Error("missing-paint-artifact");
    });
    const view = renderHook(({ scene }) => useStudioBg3dLinkedVrmSurfacePaint(scene, painted), { initialProps: { scene: first } });
    await act(() => vi.dynamicImportSettled());
    expect(mocks.restore).toHaveBeenCalledOnce();
    view.rerender({ scene: second });
    await act(() => vi.dynamicImportSettled());
    expect(mocks.restore).toHaveBeenCalledTimes(2);
    expect(mocks.restore.mock.calls[0]?.[2].signal.aborted).toBe(true);
    expect(oldRuntime.dispose).toHaveBeenCalledOnce();
    await act(async () => { past.done(); await past.promise; });
    expect(view.result.current).toBe("loading");
    await act(async () => { current.done(); await current.promise; });
    expect(view.result.current).toBe("unavailable");
    expect(currentRuntime.dispose).toHaveBeenCalledOnce();
    view.unmount();
    expect(currentRuntime.dispose).toHaveBeenCalledOnce();
  });

  it("미리보기 전용 재질이 포함된 기존 컷도 원래 모델과 지원되는 기본색을 표시한다", async () => {
    const scene = new Group();
    const secondary: StudioVrmSurfacePaintSettings = { version: 2, textures: painted.textures.map((texture) => ({
      ...texture, bindingKey: "gltf-material-2-roughness", textureSlot: "roughness", colorSpace: "linear", channelPacking: "grayscale",
    })) };
    mocks.create.mockReturnValue({ dispose: vi.fn() });
    mocks.restore.mockResolvedValue(undefined);
    const view = renderHook(({ settings }) => useStudioBg3dLinkedVrmSurfacePaint(scene, settings), { initialProps: { settings: secondary } });
    expect(view.result.current).toBe("ready");
    expect(mocks.create).not.toHaveBeenCalled();
    view.rerender({ settings: { version: 2, textures: [...secondary.textures, ...painted.textures] } });
    await act(() => vi.dynamicImportSettled());
    expect(view.result.current).toBe("ready");
    expect(mocks.restore.mock.calls[0]?.[1].textures).toEqual(painted.textures);
  });
});
