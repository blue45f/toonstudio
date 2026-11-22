import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudioOilRibbonPaintInput } from "../brush/studio-oil-ribbon-carrier-types";
import type { StudioLiveInkSurface } from "./studio-live-ink-overlay";
import { paintStudioOilRibbonCarrier } from "../brush/studio-oil-ribbon-carrier";
import { StudioLiveOilUnderlayPainter } from "./studio-live-oil-underlay-paint";
import { StudioLiveRetainedMediaOverlayRenderer } from "./studio-live-retained-media-overlay";

vi.mock("../brush/studio-oil-ribbon-carrier", async (original) => ({
  ...await original<typeof import("../brush/studio-oil-ribbon-carrier")>(),
  paintStudioOilRibbonCarrier: vi.fn(),
}));

type Affine = Required<Pick<DOMMatrix2DInit, "a" | "b" | "c" | "d" | "e" | "f">>;
type Pixels = Pick<ImageData, "data" | "width" | "height">;
type Read = { x: number; y: number; width: number; height: number; revision: number };
type CanvasRecord = {
  readonly canvas: HTMLCanvasElement;
  readonly context: CanvasRenderingContext2D;
  readonly reads: Read[];
  readonly puts: { image: Pixels; x: number; y: number }[];
  readonly draws: { source: HTMLCanvasElement; coordinates: number[]; alpha: number; composite: string }[];
  readonly transforms: Affine[];
  revision: number;
};
const identity: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** 실제 painter를 실행하되 canvas 경계에서만 픽셀·행렬·호출 순서를 기록한다. */
function canvasFixture() {
  const records = new Map<HTMLCanvasElement, CanvasRecord>();
  const created: CanvasRecord[] = [];
  function create(width = 512, height = 257, initialRevision = 11): CanvasRecord {
    let revision = initialRevision;
    let transform = { ...identity };
    const reads: Read[] = [];
    const puts: { image: Pixels; x: number; y: number }[] = [];
    const draws: { source: HTMLCanvasElement; coordinates: number[]; alpha: number; composite: string }[] = [];
    const transforms: Affine[] = [];
    const stack: { transform: Affine; alpha: number; composite: string }[] = [];
    const native = { width, height, getContext: () => context };
    const canvas = native as unknown as HTMLCanvasElement;
    const context = {
      canvas,
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      getTransform: () => ({ ...transform }),
      setTransform(a: number | DOMMatrix2DInit, b = 0, c = 0, d = 1, e = 0, f = 0) {
        transform = typeof a === "number" ? { a, b, c, d, e, f }
          : { a: a.a ?? 1, b: a.b ?? 0, c: a.c ?? 0, d: a.d ?? 1, e: a.e ?? 0, f: a.f ?? 0 };
        transforms.push({ ...transform });
      },
      clearRect() {},
      drawImage(source: HTMLCanvasElement, ...coordinates: number[]) {
        const record = records.get(source);
        if (!record) throw new Error("기록하지 않은 canvas를 그렸습니다.");
        revision = record.revision;
        draws.push({ source, coordinates, alpha: context.globalAlpha, composite: context.globalCompositeOperation });
      },
      getImageData(x: number, y: number, imageWidth: number, imageHeight: number): Pixels {
        if (x < 0 || y < 0 || x + imageWidth > native.width || y + imageHeight > native.height) {
          throw new Error("스냅샷 바깥을 읽었습니다.");
        }
        reads.push({ x, y, width: imageWidth, height: imageHeight, revision });
        const data = new Uint8ClampedArray(imageWidth * imageHeight * 4);
        for (let row = 0; row < imageHeight; row += 1) {
          for (let column = 0; column < imageWidth; column += 1) {
            const i = (row * imageWidth + column) * 4;
            data.set([(x + column + revision) % 256, (y + row + revision) % 256, revision, 254], i);
          }
        }
        return { width: imageWidth, height: imageHeight, data };
      },
      putImageData(image: Pixels, x: number, y: number) {
        puts.push({ image: { ...image, data: image.data.slice() }, x, y });
      },
      save() { stack.push({ transform, alpha: context.globalAlpha, composite: context.globalCompositeOperation }); },
      restore() {
        const previous = stack.pop();
        if (!previous) throw new Error("저장하지 않은 canvas 상태를 복원했습니다.");
        transform = previous.transform;
        context.globalAlpha = previous.alpha;
        context.globalCompositeOperation = previous.composite;
      },
    };
    const record = { canvas, context: context as unknown as CanvasRenderingContext2D,
      reads, puts, draws, transforms,
      get revision() { return revision; },
      set revision(value: number) { revision = value; } };
    records.set(canvas, record);
    return record;
  }
  vi.stubGlobal("document", { createElement: (name: string) => {
    if (name !== "canvas") throw new Error("유화 painter는 canvas만 생성해야 합니다.");
    const record = create(300, 150, 0);
    created.push(record);
    return record.canvas;
  } });
  return { create, created };
}

function paintInput(x = 20, y = 20): StudioOilRibbonPaintInput & { paddingRadiusPx: number } {
  return { carrier: { version: "oil-ribbon-carrier-v1", sourceStationCount: 1, body: null,
    bodyOpacity: 1, bristleLanes: [], repeatedBodyStampCount: 0 },
  stroke: "#123456", opacity: 1, points: [{ x, y }], radiusPx: 1, paddingRadiusPx: 1 };
}

const surface: StudioLiveInkSurface = { left: 0, top: 0, width: 512, height: 257,
  documentScale: 1, documentWidth: 512, flipX: false };

function setup() {
  const canvases = canvasFixture();
  const source = canvases.create();
  const target = canvases.create();
  const painter = new StudioLiveOilUnderlayPainter();
  const provider = vi.fn(() => ({ canvas: source.canvas, left: 0, top: 0, pixelRatio: 1 }));
  painter.setProvider(provider);
  return { ...canvases, source, target, painter, provider };
}

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("유화 painter의 스냅샷 타일 수명", () => {
  it("전체 캡처는 먼저 고정하지만 첫 CPU read와 이후 after read는 필요한 영역뿐이다", () => {
    const { created, painter, source, target, provider } = setup();
    const input = paintInput();
    painter.paint(target.context, input, "stroke-1", surface, null, true);
    const [snapshot, scratch] = created;
    expect(snapshot?.canvas.width).toBe(512);
    expect(snapshot?.canvas.height).toBe(257);
    expect(snapshot?.draws.map(call => call.source)).toEqual([source.canvas]);
    expect(snapshot?.reads).toEqual([{ x: 0, y: 0, width: 128, height: 128, revision: 11 }]);
    expect(scratch?.reads).toEqual([{ x: 8, y: 8, width: 24, height: 24, revision: 11 }]);
    expect(target.puts).toHaveLength(1);
    expect(target.puts[0]).toMatchObject({ x: 8, y: 8 });
    expect(target.puts[0]?.image.data.every(value => value === 0)).toBe(true);
    expect(paintStudioOilRibbonCarrier).toHaveBeenCalledWith(expect.anything(), input);
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("문서가 도중 바뀌어도 아직 읽지 않은 새 타일은 같은 frozen canvas에서 읽는다", () => {
    const { created, painter, source, target, provider } = setup();
    painter.paint(target.context, paintInput(), "stroke-1", surface, null, true);
    source.revision = 199;
    painter.paint(target.context, paintInput(150), "stroke-1", surface, null, true);
    painter.paint(target.context, paintInput(), "stroke-1", surface, null, true);
    expect(created).toHaveLength(2);
    expect(created[0]?.reads).toEqual([
      { x: 0, y: 0, width: 128, height: 128, revision: 11 },
      { x: 128, y: 0, width: 128, height: 128, revision: 11 },
    ]);
    expect(provider).toHaveBeenCalledTimes(1);
    expect(target.puts.every(call => call.image.data.every(value => value === 0))).toBe(true);
  });

  it("provider 바닥 뒤 settled를 합성한 순서로 고정하고 다음 획에서만 갱신한다", () => {
    const { create, created, painter, source, target, provider } = setup();
    const settled = create(512, 257, 73);
    painter.paint(target.context, paintInput(), "stroke-1", surface, settled.canvas, true);
    const previous = created[0];
    expect(previous?.draws.map(call => call.source)).toEqual([source.canvas, settled.canvas]);
    settled.revision = 117;
    painter.paint(target.context, paintInput(150), "stroke-1", surface, settled.canvas, true);
    expect(previous?.reads.map(read => read.revision)).toEqual([73, 73]);
    painter.paint(target.context, paintInput(), "stroke-2", surface, settled.canvas, true);
    expect(provider).toHaveBeenCalledTimes(2);
    expect(previous?.canvas).toMatchObject({ width: 1, height: 1 });
    expect(created[2]?.reads[0]?.revision).toBe(117);
    expect(source.canvas).toMatchObject({ width: 512, height: 257 });
    expect(settled.canvas).toMatchObject({ width: 512, height: 257 });
  });

  it("resize는 새 타일 세대를 만들고 이전 스냅샷 픽셀을 반납한다", () => {
    const { created, painter, target, provider } = setup();
    painter.paint(target.context, paintInput(), "stroke-1", surface, null, true);
    const previous = created[0];
    target.canvas.width = 640;
    target.canvas.height = 300;
    painter.paint(target.context, paintInput(), "stroke-1", { ...surface, width: 640, height: 300 }, null, true);
    expect(previous?.canvas).toMatchObject({ width: 1, height: 1 });
    expect(created[2]?.canvas).toMatchObject({ width: 640, height: 300 });
    expect(created[2]?.reads).toHaveLength(1);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it("실제 renderer의 같은 크기 surface 이동도 replay에서 스냅샷 세대를 바꾼다", () => {
    const { create, created } = canvasFixture();
    const source = create();
    const renderer = new StudioLiveRetainedMediaOverlayRenderer();
    const provider = vi.fn(() => ({ canvas: source.canvas, left: 0, top: 0, pixelRatio: 1 }));
    renderer.attach({ activeCanvas: create().canvas, settledCanvas: create().canvas });
    renderer.setSurface(surface);
    renderer.oilUnderlay.setProvider(provider);
    expect(renderer.begin({ id: "surface-stroke", type: "draw", kind: "freehand", mode: "pen",
      brush: "oil", points: [20, 20, 30, 30], pressures: [0.6, 0.6], stroke: "#123456",
      strokeWidth: 4, opacity: 1 }).status).toBe("started");
    const previous = created[0];
    expect(provider).toHaveBeenCalledTimes(1);
    renderer.setSurface({ ...surface, left: 12 });
    expect(provider).toHaveBeenCalledTimes(2);
    expect(previous?.canvas).toMatchObject({ width: 1, height: 1 });
    expect(created[2]?.reads.length).toBeGreaterThan(0);
    renderer.setSurface({ ...surface, left: 12 });
    expect(provider).toHaveBeenCalledTimes(2);
    renderer.setSurface({ ...surface, left: 12, flipX: true });
    expect(provider).toHaveBeenCalledTimes(3);
    renderer.attach(null);
    expect(created.every(record => record.canvas.width === 1 && record.canvas.height === 1)).toBe(true);
  });

  it("reset과 provider 교체는 캐시·owned canvas를 반납하고 빌린 바닥은 유지한다", () => {
    const { created, painter, source, target, provider } = setup();
    painter.paint(target.context, paintInput(), "stroke-1", surface, null, true);
    painter.reset();
    expect(created.every(record => record.canvas.width === 1 && record.canvas.height === 1)).toBe(true);
    painter.paint(target.context, paintInput(), "stroke-1", surface, null, true);
    expect(provider).toHaveBeenCalledTimes(2);
    expect(created[2]?.reads).toHaveLength(1);
    painter.setProvider(null);
    expect(created.every(record => record.canvas.width === 1 && record.canvas.height === 1)).toBe(true);
    expect(painter.paint(target.context, paintInput(), "stroke-1", surface, null, true)).toBe(false);
    expect(source.canvas).toMatchObject({ width: 512, height: 257 });
  });

  it("비활성 replay는 매번 새 바닥을 쓰고 target 행렬·알파·합성 상태를 보존한다", () => {
    const { created, painter, source, target, provider } = setup();
    const transform = { a: -1, b: 0.2, c: 0.1, d: 1, e: 490, f: 10 };
    target.context.setTransform(transform);
    target.context.globalAlpha = 0.4;
    target.context.globalCompositeOperation = "multiply";
    painter.paint(target.context, paintInput(), "stroke-1", surface, null, false);
    source.revision = 87;
    painter.paint(target.context, paintInput(), "stroke-1", surface, null, false);
    expect(provider).toHaveBeenCalledTimes(2);
    expect(created[2]?.reads[0]?.revision).toBe(87);
    expect(target.context.getTransform()).toEqual(transform);
    expect(target.context.globalAlpha).toBe(0.4);
    expect(target.context.globalCompositeOperation).toBe("multiply");
    expect(target.puts).toHaveLength(0);
    expect(target.draws).toHaveLength(2);
    expect(target.draws.every(call => call.alpha === 1 && call.composite === "source-over")).toBe(true);
    expect(created[1]?.transforms).toContainEqual(transform);
  });

  it("화면 밖 첫 접촉도 캡처 시점은 유지하되 필요 없는 CPU 타일을 읽지 않는다", () => {
    const { created, painter, source, target, provider } = setup();
    painter.paint(target.context, paintInput(-100, -100), "stroke-1", surface, null, true);
    expect(created).toHaveLength(1);
    expect(created[0]?.reads).toEqual([]);
    source.revision = 217;
    painter.paint(target.context, paintInput(), "stroke-1", surface, null, true);
    expect(created[0]?.reads[0]?.revision).toBe(11);
    expect(provider).toHaveBeenCalledTimes(1);
  });
});
