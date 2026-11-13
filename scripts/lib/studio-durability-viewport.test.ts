import { afterEach, describe, expect, it, vi } from "vitest";

import { planStudioCanvasStageLayout } from "../../apps/web/src/domains/creator/studio-view-controls";

import {
  createStudioDurabilityViewportAudit,
  projectStudioDurabilityRoi,
  readStudioDurabilityViewport,
  studioDurabilityDocumentRoi,
  type StudioDurabilityViewport,
} from "./studio-durability-viewport";

import type { Page } from "playwright";

const rect = { x: 300, y: 250, width: 264, height: 70 };
function view(matrix: StudioDurabilityViewport["documentToScreen"]): StudioDurabilityViewport {
  return { documentToScreen: matrix, stageBox: { x: 0, y: 0, width: 1440, height: 1000 },
    stageSize: { width: 1440, height: 1000 }, visibleBox: { x: 0, y: 0, width: 1440, height: 1000 },
    viewport: { width: 1440, height: 1000, devicePixelRatio: 1 }, renderer: "skia-canvaskit-document-webgl2" };
}
function point(matrix: StudioDurabilityViewport["documentToScreen"], x: number, y: number) {
  return { x: matrix[0] * x + matrix[2] * y + matrix[4], y: matrix[1] * x + matrix[3] * y + matrix[5] };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("같은 문서 ROI의 실제 화면 재투영", () => {
  it("101.8%의 화면 ROI를 184%·다른 원점에서도 같은 264×70 문서 픽셀로 대응시킨다", () => {
    const initial = view([1.018, 0, 0, 1.018, 88, 172]);
    const roi = studioDurabilityDocumentRoi(initial, rect);
    const restored = view([1.84, 0, 0, 1.84, 60, 120]);
    const projected = projectStudioDurabilityRoi(restored, roi);
    expect({ width: roi.width, height: roi.height }).toEqual({ width: 264, height: 70 });
    expect(projected.clip.width).toBeGreaterThan(470);
    for (const [x, y] of [[12, 12], [92, 27], [172, 42], [252, 58]]) {
      const doc = point(roi.documentFromPixel, x!, y!);
      const screen = point(restored.documentToScreen, doc.x, doc.y);
      const pixel = point(projected.screenshotToPixel, screen.x - projected.clip.x, screen.y - projected.clip.y);
      expect(pixel.x).toBeCloseTo(x!, 8); expect(pixel.y).toBeCloseTo(y!, 8);
    }
  });

  it.each([0, 90, 180, 270])("실제 앱의 %s도 Stage clip·반전 배치에도 같은 문서점을 대응시킨다", (rotation) => {
    const layout = planStudioCanvasStageLayout({ documentWidth: 720, documentHeight: 1080, scale: 3,
      canvasRotation: rotation, canvasFlipH: true, captureDocumentView: false,
      viewportClip: { viewportWidth: 900, viewportHeight: 700, scrollLeft: 200, scrollTop: 300 } });
    const theta = layout.rotation * Math.PI / 180;
    const matrix: StudioDurabilityViewport["documentToScreen"] = [Math.cos(theta) * layout.scaleX,
      Math.sin(theta) * layout.scaleX, -Math.sin(theta) * layout.scaleY, Math.cos(theta) * layout.scaleY,
      layout.x + 30, layout.y + 40];
    const initial = view(matrix), roi = studioDurabilityDocumentRoi(initial, rect);
    const projected = projectStudioDurabilityRoi(initial, roi);
    expect(projected.clip.x).toBeCloseTo(rect.x, 0);
    expect(projected.clip.y).toBeCloseTo(rect.y, 0);
    const p = point(projected.screenshotToPixel, rect.x - projected.clip.x + 100, rect.y - projected.clip.y + 30);
    expect(p.x).toBeCloseTo(100, 8); expect(p.y).toBeCloseTo(30, 8);
  });

  it("화면 밖 문서 ROI를 잘라내거나 다른 보이는 영역으로 대체하지 않는다", () => {
    const roi = studioDurabilityDocumentRoi(view([1, 0, 0, 1, 0, 0]), rect);
    expect(() => projectStudioDurabilityRoi(view([5, 0, 0, 5, 0, 0]), roi)).toThrow("화면 밖");
  });

  it.each([[0, 0, 0, 0, 0, 0], [1, 0, 0, Number.NaN, 0, 0]])("특이·비정상 변환을 거절한다", (...values) => {
    expect(() => studioDurabilityDocumentRoi(view(values as StudioDurabilityViewport["documentToScreen"]), rect)).toThrow("유효하지");
  });

  it.each([{ ...rect, width: 0 }, { ...rect, x: Infinity }])("유효하지 않은 최초 비교 영역을 거절한다", (input) => {
    expect(() => studioDurabilityDocumentRoi(view([1, 0, 0, 1, 0, 0]), input)).toThrow("위치와 크기");
  });
});

function browserFixture() {
  let originX = 80;
  const style = { transform: "none", overflowX: "hidden", overflowY: "hidden" };
  const content = { isConnected: true, parentElement: null, offsetWidth: 600, offsetHeight: 400,
    clientLeft: 0, clientTop: 0, clientWidth: 600, clientHeight: 400,
    getBoundingClientRect: () => ({ left: originX, top: 100, right: originX + 900, bottom: 700, width: 900, height: 600 }),
    closest: () => ({ getAttribute: () => "skia-canvaskit-document-webgl2" }) };
  const stage = { width: () => 600, height: () => 400,
    container: () => ({ querySelector: () => content }),
    getAbsoluteTransform: () => ({ point: ({ x, y }: { x: number; y: number }) => ({ x: 2 * x - 120, y: 2 * y - 80 }) }),
    draw: vi.fn(() => { throw new Error("관측은 재게시하지 않습니다."); }) };
  const setTransform = vi.fn(), drawImage = vi.fn(), close = vi.fn();
  const canvas = { width: 0, height: 0, getContext: () => ({ setTransform, drawImage, imageSmoothingEnabled: true }),
    toDataURL: () => "data:image/png;base64,UElYRUw=" };
  let clip = { width: 0, height: 0 };
  vi.stubGlobal("window", { Konva: { stages: [stage] } });
  vi.stubGlobal("document", { querySelector: () => content, createElement: () => canvas });
  vi.stubGlobal("innerWidth", 1440); vi.stubGlobal("innerHeight", 1000); vi.stubGlobal("devicePixelRatio", 2);
  vi.stubGlobal("getComputedStyle", () => style);
  vi.stubGlobal("DOMMatrixReadOnly", class { is2D = true; a = 1; b = 0; c = 0; d = 1; });
  vi.stubGlobal("fetch", vi.fn(async () => ({ blob: async () => ({}) })));
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: clip.width, height: clip.height, close })));
  const screenshot = vi.fn(async (options: { clip: { width: number; height: number } }) => {
    clip = options.clip; return Buffer.from("원본 compositor screenshot");
  });
  const evaluate = vi.fn(async (fn: (arg: unknown) => unknown, arg: unknown) => fn(arg));
  const page = { screenshot, evaluate } as unknown as Page;
  return { page, content, stage, canvas, style, screenshot, setTransform, drawImage, close,
    move: () => { originX += 1; } };
}

describe("뷰포트 관측과 compositor 픽셀 캡처", () => {
  it("현재 Stage 절대 변환에 실제 CSS 배율을 합성하며 DPR을 문서 배율에 중복 적용하지 않는다", async () => {
    const f = browserFixture();
    const measured = await readStudioDurabilityViewport(f.page);
    expect(measured.documentToScreen).toEqual([3, 0, 0, 3, -100, -20]);
    expect(measured.visibleBox).toEqual({ x: 80, y: 100, width: 900, height: 600 });
    expect(measured.viewport.devicePixelRatio).toBe(2);
    expect(f.stage.draw).not.toHaveBeenCalled();
  });

  it("실제 compositor screenshot만 같은 ROI 해상도로 정규화하고 전후 배치를 기록한다", async () => {
    const f = browserFixture(), audit = createStudioDurabilityViewportAudit(f.page);
    const roi = studioDurabilityDocumentRoi(await audit.measure(), rect);
    expect(await audit.capture(roi, "baseline")).toEqual(Buffer.from("PIXEL"));
    expect(f.screenshot).toHaveBeenCalledWith({ clip: { x: 300, y: 250, width: 264, height: 70 }, animations: "disabled", scale: "css" });
    expect(f.canvas).toMatchObject({ width: 264, height: 70 });
    expect(f.drawImage).toHaveBeenCalledOnce(); expect(f.close).toHaveBeenCalledOnce();
    expect(audit.evidence.baseline).toMatchObject({ before: { documentToScreen: [3, 0, 0, 3, -100, -20] },
      after: { documentToScreen: [3, 0, 0, 3, -100, -20] }, accepted: true });
    expect(f.stage.draw).not.toHaveBeenCalled();
  });

  it("촬영 중 뷰포트가 바뀐 픽셀은 복원 성공으로 받아들이지 않는다", async () => {
    const f = browserFixture(), audit = createStudioDurabilityViewportAudit(f.page);
    const roi = studioDurabilityDocumentRoi(await audit.measure(), rect);
    f.screenshot.mockImplementationOnce(async () => { f.move(); return Buffer.from("불일치 frame"); });
    expect(await audit.capture(roi, "recovered", performance.now() + 8_000)).toBeNull();
    expect(audit.evidence.recovered).toMatchObject({ unstable: true, accepted: false });
    expect(f.drawImage).not.toHaveBeenCalled();
  });

  it("원래 기한 뒤 끝난 캡처는 실제 이미지가 있어도 성공으로 받아들이지 않는다", async () => {
    const f = browserFixture(), audit = createStudioDurabilityViewportAudit(f.page);
    const roi = studioDurabilityDocumentRoi(await audit.measure(), rect);
    let now = 100;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const screenshot = f.screenshot.getMockImplementation()!;
    f.screenshot.mockImplementationOnce(async (options) => { const pixels = await screenshot(options); now = 8_100; return pixels; });
    expect(await audit.capture(roi, "recovered", 8_100)).toBeNull();
    expect(audit.evidence.recovered).toMatchObject({ accepted: false, completedAt: 8_100 });
  });

  it("이미 지난 기한에는 새 screenshot을 시작하지 않는다", async () => {
    const f = browserFixture(), audit = createStudioDurabilityViewportAudit(f.page);
    const roi = studioDurabilityDocumentRoi(await audit.measure(), rect);
    expect(await audit.capture(roi, "recovered", performance.now() - 1)).toBeNull();
    expect(f.screenshot).not.toHaveBeenCalled();
  });
});
