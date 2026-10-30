// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioFilterGalleryPreview } from "./StudioFilterGalleryPreview";
import { StudioFilterGalleryWorkerRequiredError } from "./studio-filter-gallery-engine";

import type { StudioFilterGalleryPreviewProps } from "./StudioFilterGalleryPreview";
import type { StudioImageFilterWorkerClientResult } from "../../studio-image-filter-worker-client";
import type { StudioImageFilterWorkerRunRequest } from "../../studio-image-filter-worker-protocol";

import { FALLBACK_CHAIN, resolveTranslationForDisplay } from "@/shared/lib/i18n";

const client = vi.hoisted(() => ({
  create: vi.fn(),
  run: vi.fn<(request: StudioImageFilterWorkerRunRequest) => Promise<StudioImageFilterWorkerClientResult>>(),
  dispose: vi.fn(),
}));
vi.mock("../../studio-image-filter-worker-client", () => ({ createStudioImageFilterResidentWorkerSession: client.create }));

const SOURCE = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]);
const SOURCE_URL = "data:image/png;base64,source";
const MASK_URL = "data:image/png;base64,mask";
const SURFACE_ID = "filter-mask:v1:11111111-1111-4111-8111-111111111111";
const images: ControlledImage[] = [];
let painted = new WeakMap<HTMLCanvasElement, Uint8ClampedArray>();
const writes: HTMLCanvasElement[] = [];

class ControlledImage {
  onload: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  src = "";
  width = 0;
  height = 0;
  naturalWidth = 0;
  naturalHeight = 0;
  pixels: Uint8ClampedArray = new Uint8ClampedArray();

  constructor() { images.push(this); }

  complete(data: Uint8ClampedArray, width: number, height: number): void {
    this.pixels = data;
    this.width = this.naturalWidth = width;
    this.height = this.naturalHeight = height;
    this.onload?.(new Event("load"));
  }
}

function contextFor(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  let pixels: Uint8ClampedArray = new Uint8ClampedArray();
  let sx = 1, sy = 1;
  const context = {
    canvas,
    save: vi.fn(), restore: vi.fn(() => { sx = 1; sy = 1; }), translate: vi.fn(),
    scale: vi.fn((x: number, y: number) => { sx *= x; sy *= y; }),
    drawImage: vi.fn((image: CanvasImageSource) => {
      if (!(image instanceof ControlledImage)) throw new Error("시험용 이미지가 필요합니다.");
      pixels = new Uint8ClampedArray(canvas.width * canvas.height * 4);
      for (let y = 0; y < canvas.height; y += 1) {
        for (let x = 0; x < canvas.width; x += 1) {
          const px = Math.floor((x / canvas.width) * image.width), py = Math.floor((y / canvas.height) * image.height);
          const from = ((sy < 0 ? image.height - 1 - py : py) * image.width + (sx < 0 ? image.width - 1 - px : px)) * 4;
          pixels.set(image.pixels.subarray(from, from + 4), (y * canvas.width + x) * 4);
        }
      }
    }),
    getImageData: vi.fn(() => new ImageData(pixels.slice(), canvas.width, canvas.height)),
    putImageData: vi.fn((image: ImageData) => { painted.set(canvas, image.data.slice()); writes.push(canvas); }),
  };
  // jsdom의 픽셀 API 경계만 대체한다. 제품 마스크 커널과 scheduler는 실제 구현을 쓴다.
  return context as unknown as CanvasRenderingContext2D;
}

function props(overrides: Partial<StudioFilterGalleryPreviewProps> = {}): StudioFilterGalleryPreviewProps {
  return {
    src: SOURCE_URL, plan: { kind: "ready", width: 2, height: 2, stackSkipped: false },
    flipped: false, flippedY: false, fields: { invert: true }, ...overrides,
  };
}

function complete(url: string, pixels: Uint8ClampedArray, width: number, height: number): void {
  const image = [...images].reverse().find((candidate) => candidate.src === url);
  if (!image) throw new Error(`불러오는 이미지가 없습니다: ${url}`);
  act(() => image.complete(pixels, width, height));
}

function maskPixels(gray: number): Uint8ClampedArray { return new Uint8ClampedArray([gray, gray, gray, 255]); }

function resultPixels(width = 2, height = 2): StudioImageFilterWorkerClientResult {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set([200, 180, 160, 255], offset);
  return { execution: "worker", imageData: { width, height, data } };
}

function visibleResult(): Uint8ClampedArray {
  const canvas = screen.getByRole("img", { name: "효과를 적용한 결과" });
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error("결과 canvas가 필요합니다.");
  const pixels = painted.get(canvas);
  if (!pixels) throw new Error("결과 픽셀이 없습니다.");
  return pixels;
}

async function calculate(): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(121); });
}

function pendingResult() {
  let resolve: (result: StudioImageFilterWorkerClientResult) => void = () => { throw new Error("미초기화 요청"); };
  const promise = new Promise<StudioImageFilterWorkerClientResult>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(async () => {
  vi.useFakeTimers();
  images.length = writes.length = 0;
  painted = new WeakMap();
  client.create.mockReset(); client.run.mockReset(); client.dispose.mockReset();
  client.create.mockReturnValue({ run: client.run, dispose: client.dispose });
  client.run.mockImplementation(async ({ imageData }) => resultPixels(imageData.width, imageData.height));
  vi.stubGlobal("Image", ControlledImage);
  vi.stubGlobal("ImageData", class {
    readonly colorSpace = "srgb";
    constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
  });
  vi.stubGlobal("Worker", class {});
  const contexts = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();
  const canvas2dPrototype: { getContext(contextId: "2d"): CanvasRenderingContext2D | null } = HTMLCanvasElement.prototype;
  vi.spyOn(canvas2dPrototype, "getContext").mockImplementation(function (this: HTMLCanvasElement, contextId: string) {
    if (contextId !== "2d") return null;
    let context = contexts.get(this);
    if (!context) { context = contextFor(this); contexts.set(this, context); }
    return context;
  });
  await import("../../studio-image-filter-worker-client");
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("내부 미리보기의 실제 마스크 합성", () => {
  it.each([0, 128, 255])("1px 마스크 %i를 문서 크기로 샘플해 원본과 Worker 결과를 합성한다", async (gray) => {
    render(<StudioFilterGalleryPreview {...props({ filterMask: { type: "image", filterMaskSrc: MASK_URL } })} />);
    complete(SOURCE_URL, SOURCE, 2, 2);
    await calculate();
    expect(client.run).not.toHaveBeenCalled();
    expect(screen.queryByRole("img", { name: "효과를 적용한 결과" })).toBeNull();
    complete(MASK_URL, maskPixels(gray), 1, 1);
    await calculate();
    const expected = gray === 0 ? SOURCE : gray === 255 ? resultPixels().imageData.data : new Uint8ClampedArray([
      105, 100, 95, 255, 120, 115, 110, 255, 135, 130, 125, 255, 150, 145, 140, 255,
    ]);
    expect(visibleResult()).toEqual(expected);
    expect(client.run.mock.calls[0]?.[0].imageData.data).toEqual(SOURCE);
  });

  it("원본의 양방향 flip과 서로 다른 해상도의 마스크를 같은 콘텐츠 좌표로 뒤집는다", async () => {
    render(<StudioFilterGalleryPreview {...props({ flipped: true, flippedY: true, filterMask: { type: "image", filterMaskSrc: MASK_URL } })} />);
    complete(SOURCE_URL, SOURCE, 2, 2);
    complete(MASK_URL, new Uint8ClampedArray([...maskPixels(255), ...maskPixels(0)]), 1, 2);
    await calculate();
    expect(visibleResult()).toEqual(new Uint8ClampedArray([
      100, 110, 120, 255, 70, 80, 90, 255, 200, 180, 160, 255, 200, 180, 160, 255,
    ]));
  });

  it("알파를 바꾼 Worker 결과도 기존 premultiplied 마스크 합성으로 표시한다", async () => {
    const original = new Uint8ClampedArray(16), filtered = new Uint8ClampedArray(16), expected = new Uint8ClampedArray(16);
    for (let offset = 0; offset < 16; offset += 4) {
      original.set([128, 128, 128, 255], offset);
      filtered.set([0, 0, 0, 127], offset);
      expected.set([85, 85, 85, 191], offset);
    }
    client.run.mockResolvedValueOnce({ execution: "worker", imageData: { width: 2, height: 2, data: filtered } });
    render(<StudioFilterGalleryPreview {...props({ filterMask: { type: "image", filterMaskSrc: MASK_URL } })} />);
    complete(SOURCE_URL, original, 2, 2); complete(MASK_URL, maskPixels(128), 1, 1);
    await calculate();
    expect(visibleResult()).toEqual(expected);
    expect(client.run.mock.calls[0]?.[0].imageData.data).toEqual(original);
  });

  it("좌우 flip은 마스크의 좌우도 뒤집는다", async () => {
    render(<StudioFilterGalleryPreview {...props({ flipped: true, filterMask: { type: "image", filterMaskSrc: MASK_URL } })} />);
    complete(SOURCE_URL, SOURCE, 2, 2);
    complete(MASK_URL, new Uint8ClampedArray([...maskPixels(255), ...maskPixels(0)]), 2, 1);
    await calculate();
    expect(visibleResult()).toEqual(new Uint8ClampedArray([
      40, 50, 60, 255, 200, 180, 160, 255, 100, 110, 120, 255, 200, 180, 160, 255,
    ]));
  });

  it("surface src가 준비될 때까지 무마스크 결과를 막고 비활성 마스크는 기존 전체 결과를 보인다", async () => {
    const image = props({ filterMask: { type: "image", filterMaskSurfaceId: SURFACE_ID } });
    const view = render(<StudioFilterGalleryPreview {...image} />);
    complete(SOURCE_URL, SOURCE, 2, 2);
    await calculate();
    expect(client.create).not.toHaveBeenCalled();
    expect(screen.queryByRole("img", { name: "효과를 적용한 결과" })).toBeNull();
    expect(screen.getByText("필터 마스크를 불러오는 중…")).toBeTruthy();
    view.rerender(<StudioFilterGalleryPreview {...image} filterMask={{ type: "image", filterMaskSurfaceId: SURFACE_ID, filterMaskSrc: MASK_URL }} />);
    complete(MASK_URL, maskPixels(0), 1, 1);
    await calculate();
    expect(visibleResult()).toEqual(SOURCE);
    view.rerender(<StudioFilterGalleryPreview {...image} filterMask={{ type: "image", filterMaskSurfaceId: SURFACE_ID, filterMaskEnabled: false }} />);
    await calculate();
    expect(visibleResult()).toEqual(resultPixels().imageData.data);
  });

  it("활성 필터가 없으면 캔버스처럼 아직 준비되지 않은 마스크도 요청하지 않는다", async () => {
    render(<StudioFilterGalleryPreview {...props({ fields: {}, filterMask: { type: "image", filterMaskSurfaceId: SURFACE_ID } })} />);
    complete(SOURCE_URL, SOURCE, 2, 2); await calculate();
    expect(client.run).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("필터 마스크를 불러오는 중…")).toBeNull();
  });

  it("마스크 decode 실패는 숨기지 않고 이전 무마스크 결과도 표시하지 않는다", async () => {
    render(<StudioFilterGalleryPreview {...props({ filterMask: { type: "image", filterMaskSrc: MASK_URL } })} />);
    complete(SOURCE_URL, SOURCE, 2, 2);
    const mask = images.find((image) => image.src === MASK_URL);
    if (!mask) throw new Error("마스크 요청이 필요합니다.");
    act(() => mask.onerror?.(new Event("error")));
    await calculate();
    expect(client.run).not.toHaveBeenCalled();
    expect(screen.queryByRole("img", { name: "효과를 적용한 결과" })).toBeNull();
    expect(screen.getByText(/필터 마스크를 읽지 못했어요/u)).toBeTruthy();
    expect(resolveTranslationForDisplay("en", "studio.filterGallery.preview.maskError", FALLBACK_CHAIN, "missing")).toBe("Could not read the filter mask. Check the canvas preview.");
  });

  it("마스크 교체 중 끝난 이전 Worker 결과를 버리고 새 마스크로만 확정한다", async () => {
    const pending = pendingResult();
    client.run.mockReturnValueOnce(pending.promise);
    const image = props({ filterMask: { type: "image", filterMaskSrc: MASK_URL } });
    const view = render(<StudioFilterGalleryPreview {...image} />);
    complete(SOURCE_URL, SOURCE, 2, 2); complete(MASK_URL, maskPixels(255), 1, 1);
    await calculate();
    expect(client.run).toHaveBeenCalledTimes(1);
    const previousWrites = writes.length;
    const nextMask = `${MASK_URL}-next`;
    view.rerender(<StudioFilterGalleryPreview {...image} filterMask={{ type: "image", filterMaskSrc: nextMask }} />);
    await act(async () => pending.resolve(resultPixels()));
    expect(writes).toHaveLength(previousWrites);
    expect(screen.queryByRole("img", { name: "효과를 적용한 결과" })).toBeNull();
    complete(nextMask, maskPixels(0), 1, 1);
    await calculate();
    expect(visibleResult()).toEqual(SOURCE);
  });

  it("교체 전 마스크의 늦은 decode가 새 마스크 준비 상태를 덮어쓰지 않는다", async () => {
    const image = props({ filterMask: { type: "image", filterMaskSrc: MASK_URL } });
    const view = render(<StudioFilterGalleryPreview {...image} />);
    complete(SOURCE_URL, SOURCE, 2, 2);
    const previousMask = images.find((candidate) => candidate.src === MASK_URL);
    if (!previousMask) throw new Error("이전 마스크 요청이 필요합니다.");
    const queuedOnLoad = previousMask.onload;
    const nextMask = `${MASK_URL}-next`;
    view.rerender(<StudioFilterGalleryPreview {...image} filterMask={{ type: "image", filterMaskSrc: nextMask }} />);
    act(() => { previousMask.complete(maskPixels(255), 1, 1); queuedOnLoad?.(new Event("load")); });
    await calculate();
    expect(client.run).not.toHaveBeenCalled();
    complete(nextMask, maskPixels(0), 1, 1);
    await calculate();
    expect(visibleResult()).toEqual(SOURCE);
  });

  it("원본 교체와 unmount 뒤의 오래된 완료도 결과를 쓰지 않는다", async () => {
    const pending = pendingResult();
    client.run.mockReturnValueOnce(pending.promise);
    const image = props();
    const view = render(<StudioFilterGalleryPreview {...image} />);
    complete(SOURCE_URL, SOURCE, 2, 2); await calculate();
    const previousWrites = writes.length;
    view.rerender(<StudioFilterGalleryPreview {...image} src={`${SOURCE_URL}-next`} />);
    await act(async () => pending.resolve(resultPixels()));
    expect(writes).toHaveLength(previousWrites);
    const queuedImage = images.at(-1);
    const queuedOnLoad = queuedImage?.onload;
    view.unmount();
    act(() => queuedOnLoad?.(new Event("load")));
    await calculate();
    expect(writes).toHaveLength(previousWrites);
    expect(client.dispose).toHaveBeenCalled();
  });

  it("Worker가 없을 때 같은 direct 오류 안내를 보이고 경량 direct 선택도 유지한다", async () => {
    vi.stubGlobal("Worker", undefined);
    client.run.mockRejectedValueOnce(new StudioFilterGalleryWorkerRequiredError());
    render(<StudioFilterGalleryPreview {...props()} />);
    complete(SOURCE_URL, SOURCE, 2, 2); await calculate();
    expect(client.create).toHaveBeenCalledWith({ executionMode: "direct" });
    expect(screen.getByText(/이 브라우저에서는 이 작업량을 대화상자 안에서 계산할 수 없어요/u)).toBeTruthy();
  });
});
