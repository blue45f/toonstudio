import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Layer } from "konva/lib/Layer";
import { StudioLiveRetainedMediaOverlayRenderer } from "../live/studio-live-retained-media-overlay";
import { createStudioLiveTransformDraftStore } from "../studio-live-transform-draft-store";
import { STUDIO_KONVA_DOCUMENT_SHADOW_NAME } from "../studio-single-object-drag-layer";
import { useStudioLiveOilUnderlay } from "./use-studio-live-oil-underlay";

const mocked = vi.hoisted(() => ({
  translate: vi.fn(), constructors: vi.fn(), cleanups: [] as (() => void)[],
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useLayoutEffect: (effect: () => undefined | (() => void)) => {
    const cleanup = effect();
    if (cleanup) mocked.cleanups.push(cleanup);
  },
}));
vi.mock("konva/lib/Canvas", () => ({ SceneCanvas: class {
  readonly _canvas = { width: 320, height: 180 };
  constructor(options: unknown) { mocked.constructors(options); }
  getContext() { return { translate: mocked.translate }; }
} }));

beforeEach(() => { vi.clearAllMocks(); mocked.cleanups.length = 0; });
const surface = { left: 70, top: 90, width: 320, height: 180, documentScale: 1, documentWidth: 800, flipX: false };

function TestUnderlaySetup(ownsDocument = false, visible = true) {
  const renderer = new StudioLiveRetainedMediaOverlayRenderer();
  const provider = vi.spyOn(renderer.oilUnderlay, "setProvider");
  const drawOrder: string[] = [];
  const children = ["below-guide", STUDIO_KONVA_DOCUMENT_SHADOW_NAME, "above-guide", "selection"].map(name => ({
    hasName: (expected: string) => name === expected,
    drawScene: () => { drawOrder.push(name); },
  }));
  const gpuCanvas = { width: 640, style: { visibility: visible ? "visible" : "hidden" },
    getBoundingClientRect: () => ({ left: 12, top: 23, width: 320 }) };
  const layer = {
    getCanvas: () => ({ getPixelRatio: () => 2, _canvas: {
      getBoundingClientRect: () => ({ left: 10, top: 20, width: 320 }),
    } }),
    getChildren: () => children,
    getStage: () => ({ content: { querySelector: () => gpuCanvas } }),
  };
  useStudioLiveOilUnderlay({
    renderer, layerRef: { current: layer as unknown as Layer }, ownsDocument, left: 50, top: 60,
    transformStore: createStudioLiveTransformDraftStore(), transformScope: "page:test",
    transformRevision: null, gpuEnabled: false, elements: [],
  });
  const read = provider.mock.calls[0]?.[0];
  if (!read) throw new Error("유화 바닥 provider가 연결되지 않았습니다.");
  return { renderer, provider, read, drawOrder, gpuCanvas };
}

describe("정본 유화 바닥의 표시 순서", () => {
  it("문서 앞의 guide는 포함하고 문서 뒤의 장식은 포함하지 않는다", () => {
    const { read, drawOrder } = TestUnderlaySetup();
    expect(read(surface)).toMatchObject({ left: 70, top: 90, pixelRatio: 2 });
    expect(drawOrder).toEqual(["below-guide", STUDIO_KONVA_DOCUMENT_SHADOW_NAME]);
    expect(mocked.translate).toHaveBeenCalledWith(-20, -30);
    expect(mocked.constructors).toHaveBeenCalledWith({ width: 320, height: 180, pixelRatio: 2 });
  });
  it("GPU 문서가 표시 중이면 실제 visible canvas만 읽는다", () => {
    const { read, drawOrder, gpuCanvas } = TestUnderlaySetup(true);
    expect(read(surface)).toEqual({ canvas: gpuCanvas, left: 52, top: 63, pixelRatio: 2 });
    expect(drawOrder).toEqual([]);
  });
  it("GPU 표면이 사라지면 숨은 shadow로 대체하지 않는다", () => {
    const { read, drawOrder } = TestUnderlaySetup(true, false);
    expect(read(surface)).toBeNull();
    expect(drawOrder).toEqual([]);
  });
  it("unmount에서 provider와 보유 snapshot을 해제한다", () => {
    const { provider } = TestUnderlaySetup();
    for (const cleanup of mocked.cleanups) cleanup();
    expect(provider).toHaveBeenLastCalledWith(null);
  });
});
