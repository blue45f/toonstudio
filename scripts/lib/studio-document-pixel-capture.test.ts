import { afterEach, describe, expect, it, vi } from "vitest";

import { captureStudioDocumentBeforeDeadline, captureStudioDocumentRoi } from "./studio-document-pixel-capture.mjs";

const corners = [{ x: 130, y: 245 }, { x: 590, y: 635 }];
type CaptureConfig = { x: number; y: number; width: number; height: number; pixelRatio: number };

function fixture(renderer = "compatibility") {
  const drawImage = vi.fn();
  const setTransform = vi.fn();
  const output = {
    width: 460, height: 390,
    getContext: vi.fn(() => ({ drawImage, setTransform })),
    toDataURL: vi.fn(() => "data:image/png;base64,Q0FQVFVSRQ=="),
  };
  const skia = {
    width: 2_000, height: 1_600,
    dataset: { studioSkiaPhase: "presented" },
    getBoundingClientRect: () => ({ left: 110, top: 215, width: 1_000, height: 800 }),
  };
  const documentPixels = { pixels: "원본 문서" };
  const documentNode = { isVisible: vi.fn(() => true), toCanvas: vi.fn((_config: CaptureConfig) => documentPixels) };
  const background = { toCanvas: vi.fn((_config: CaptureConfig) => output) };
  const owner = { getAttribute: vi.fn(() => renderer) };
  const content = {
    isConnected: true,
    getBoundingClientRect: () => ({ left: 100, top: 200, width: 1_000, height: 800 }),
    closest: () => owner,
    querySelector: () => skia,
  };
  const stage = {
    container: () => ({ querySelector: () => content }),
    getAbsoluteTransform: () => ({ point: ({ x, y }: { x: number; y: number }) => ({ x: 20 + x * 0.75, y: 30 + y * 0.75 }) }),
    getLayers: () => [background], findOne: vi.fn(() => documentNode),
    toCanvas: vi.fn(() => { throw new Error("전체 Stage에는 선택 핸들이 포함됩니다."); }),
  };
  const clock = vi.fn((resolve: () => void) => { skia.dataset.studioSkiaPhase = "presented"; resolve(); });
  vi.stubGlobal("window", { Konva: { stages: [stage] }, setTimeout: clock });
  vi.stubGlobal("getComputedStyle", () => ({ display: "block", visibility: "visible", opacity: "1" }));
  return { stage, skia, content, background, documentNode, documentPixels, output, drawImage, setTransform, clock };
}

afterEach(() => vi.unstubAllGlobals());

describe("게시된 원고 픽셀 캡처", () => {
  it("호환 렌더러는 배경과 문서 그룹만 합성하고 선택 핸들이 있는 Stage를 읽지 않는다", async () => {
    const f = fixture();
    expect(await captureStudioDocumentRoi(corners)).toBe("Q0FQVFVSRQ==");
    expect(f.background.toCanvas).toHaveBeenCalledWith({ x: 117.5, y: 213.75, width: 345, height: 292.5, pixelRatio: 4 / 3 });
    expect(f.stage.findOne).toHaveBeenCalledWith(".studio-konva-document-shadow");
    expect(f.documentNode.toCanvas).toHaveBeenCalledWith(f.background.toCanvas.mock.calls[0]?.[0]);
    expect(f.drawImage).toHaveBeenCalledWith(f.documentPixels, 0, 0);
    expect(f.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
    expect(f.setTransform.mock.invocationCallOrder[0]).toBeLessThan(f.drawImage.mock.invocationCallOrder[0]!);
    expect(f.stage.toCanvas).not.toHaveBeenCalled();
  });

  it("Skia 소유 문서는 현재 보이는 GPU 비트맵을 카메라·DPR에 맞춰 같은 문서 ROI로 합성한다", async () => {
    const f = fixture("skia-canvaskit-document-webgl2");
    await captureStudioDocumentRoi(corners);
    expect(f.drawImage).toHaveBeenCalledWith(f.skia, 215, 397.5, 690, 585, 0, 0, 460, 390);
    expect(f.documentNode.toCanvas).not.toHaveBeenCalled();
    expect(f.stage.toCanvas).not.toHaveBeenCalled();
  });

  it("게시 중인 Skia 프레임을 이전 호환 문서로 대체하지 않고 게시 완료를 기다린다", async () => {
    const f = fixture("skia-canvaskit-document-webgl2");
    f.skia.dataset.studioSkiaPhase = "rendering";
    await captureStudioDocumentRoi(corners);
    expect(f.clock).toHaveBeenCalledOnce();
    expect(f.drawImage).toHaveBeenCalledWith(f.skia, 215, 397.5, 690, 585, 0, 0, 460, 390);
    expect(f.documentNode.toCanvas).not.toHaveBeenCalled();
  });

  it("두 문서 렌더러가 모두 게시되지 않았으면 빈 Stage를 정상 증거로 받아들이지 않는다", async () => {
    const f = fixture();
    f.documentNode.isVisible.mockReturnValue(false);
    await expect(captureStudioDocumentRoi(corners)).rejects.toThrow("현재 문서 렌더러");
    expect(f.stage.toCanvas).not.toHaveBeenCalled();
  });
});

describe("원래 원고 게시 성공 기한", () => {
  it.each([4_000, 4_001, 7_999])("내부 게시가 %sms 뒤 성공해도 4초 fixture 성공으로 받아들이지 않는다", async (publishedAt) => {
    let clock = 100;
    const capture = vi.fn(async () => { await Promise.resolve(); clock = publishedAt; return "게시된 픽셀"; });
    expect(await captureStudioDocumentBeforeDeadline(capture, 4_000, () => clock)).toBeNull();
    expect(capture).toHaveBeenCalledOnce();
  });

  it("4초 안에 끝난 게시 결과는 기존 픽셀 검사로 그대로 전달한다", async () => {
    let clock = 100;
    const capture = async () => { await Promise.resolve(); clock = 3_999; return "게시된 픽셀"; };
    expect(await captureStudioDocumentBeforeDeadline(capture, 4_000, () => clock)).toBe("게시된 픽셀");
  });

  it("이미 지난 기한으로 새 캡처를 시작하지 않는다", async () => {
    const capture = vi.fn(async () => "게시된 픽셀");
    expect(await captureStudioDocumentBeforeDeadline(capture, 4_000, () => 4_000)).toBeNull();
    expect(capture).not.toHaveBeenCalled();
  });
});
