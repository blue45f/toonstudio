// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { Group } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioVrmSurfacePaintSettings } from "../vrm/studio-vrm-scene-document";
import { STUDIO_VRM_TEXTURE_PAINT_CHANNELS, studioVrmTexturePaintChannelEncoding } from "../vrm/studio-vrm-texture-paint-channel";
import { useStudioBg3dLinkedVrmSurfacePaint } from "./useStudioBg3dLinkedVrmSurfacePaint";

const mocks = vi.hoisted(() => ({ restore: vi.fn() }));
vi.mock("../vrm/studio-vrm-texture-paint-presentation", () => ({
  restoreStudioVrmPaintPresentation: mocks.restore,
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
    mocks.restore.mockResolvedValue(pending.promise.then(() => runtime));
    const view = renderHook(({ settings }) => useStudioBg3dLinkedVrmSurfacePaint(scene, settings), {
      initialProps: { settings: empty },
    });
    expect(view.result.current).toBe("ready");
    expect(mocks.restore).not.toHaveBeenCalled();
    view.rerender({ settings: painted });
    expect(view.result.current).toBe("loading");
    await act(() => vi.dynamicImportSettled());
    expect(mocks.restore).toHaveBeenCalledOnce();
    await act(async () => { pending.done(); await pending.promise; });
    expect(view.result.current).toBe("ready");
    view.rerender({ settings: structuredClone(painted) });
    expect(mocks.restore).toHaveBeenCalledOnce();
    view.rerender({ settings: empty });
    expect(runtime.dispose).toHaveBeenCalledOnce();
    expect(view.result.current).toBe("ready");
  });

  it("모델 전환 도중 늦게 끝난 복원과 누락된 PNG를 현재 컷의 준비 완료로 인정하지 않는다", async () => {
    const first = new Group(), second = new Group();
    const past = deferred(), current = deferred();
    const oldRuntime = { dispose: vi.fn() };
    mocks.restore.mockReturnValueOnce(past.promise.then(() => oldRuntime)).mockImplementationOnce(async () => {
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
    expect(oldRuntime.dispose).not.toHaveBeenCalled();
    await act(async () => { past.done(); await past.promise; });
    expect(oldRuntime.dispose).toHaveBeenCalledOnce();
    expect(view.result.current).toBe("loading");
    await act(async () => { current.done(); await current.promise; });
    expect(view.result.current).toBe("unavailable");
    view.unmount();
  });

  it("개인 원고와 팀 원고에서 다섯 채널의 바인딩과 인코딩을 같은 읽기 전용 복원기에 전달한다", async () => {
    const scene = new Group();
    const settings: StudioVrmSurfacePaintSettings = { version: 2, textures: STUDIO_VRM_TEXTURE_PAINT_CHANNELS.map(textureSlot => ({
      ...painted.textures[0]!, bindingKey: `gltf-material-2-${textureSlot}`, textureSlot, ...studioVrmTexturePaintChannelEncoding(textureSlot),
    })) };
    mocks.restore.mockResolvedValue({ dispose: vi.fn() });
    const team = { paints: new Map(), blobs: new Map() };
    const view = renderHook(({ remote }) => useStudioBg3dLinkedVrmSurfacePaint(scene, settings, remote ? team : undefined), { initialProps: { remote: false } });
    expect(view.result.current).toBe("loading");
    await act(() => vi.dynamicImportSettled());
    expect(view.result.current).toBe("ready");
    expect(mocks.restore.mock.calls[0]?.[1]).toEqual(settings);
    expect(mocks.restore.mock.calls[0]?.[2].dependencies).toBeUndefined();
    mocks.restore.mockImplementationOnce(async (_runtime, paint, options) => options.dependencies.getArtifact(paint.textures[0].hash));
    view.rerender({ remote: true });
    expect(view.result.current).toBe("loading");
    await act(() => vi.dynamicImportSettled());
    expect(mocks.restore.mock.calls[1]?.[1]).toEqual(settings);
    expect(view.result.current).toBe("unavailable");
  });
});
