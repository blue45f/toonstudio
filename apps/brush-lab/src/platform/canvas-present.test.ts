// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { installCanvasStub } from "../app/testing/canvas-stub";

import {
  clearCanvas,
  configureWebGpuCanvas,
  displayScale,
  documentTileCount,
  fitDocumentSize,
  flattenOnWhite,
  MAX_DOCUMENT_SIDE_PX,
  MAX_DOCUMENT_TILES,
  presentLabImage,
  presentPreview,
} from "./canvas-present";

import type { CanvasStubRecorder } from "../app/testing/canvas-stub";
import type { LabImage } from "../engine/core/types";

function image(width: number, height: number, fill = 128): LabImage {
  const data = new Uint8ClampedArray(width * height * 4).fill(fill);
  return { width, height, data };
}

describe("canvas-present", () => {
  let stub: CanvasStubRecorder | null = null;
  afterEach(() => {
    stub?.restore();
    stub = null;
  });

  it("presentLabImage는 캔버스를 이미지 크기로 맞추고 putImageData 1회로 올린다", () => {
    stub = installCanvasStub();
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 4;
    presentLabImage(canvas, image(8, 6, 200));
    expect(canvas.width).toBe(8);
    expect(canvas.height).toBe(6);
    expect(stub.putImageDataCalls).toBe(1);
    expect(stub.lastImage?.width).toBe(8);
    expect(stub.lastImage?.data[0]).toBe(200);
    expect(stub.lastImage?.data.length).toBe(8 * 6 * 4);
  });

  it("2D 컨텍스트가 없으면 SumiError(canvas-2d-unavailable)로 드러낸다(무음 대체 없음)", () => {
    const canvas = document.createElement("canvas");
    expect(() => presentLabImage(canvas, image(2, 2))).toThrow(
      expect.objectContaining({ code: "canvas-2d-unavailable" }),
    );
    expect(() => clearCanvas(canvas)).toThrow(expect.objectContaining({ code: "canvas-2d-unavailable" }));
    expect(() => presentPreview(canvas, [], 4)).toThrow(expect.objectContaining({ code: "canvas-2d-unavailable" }));
  });

  it("presentPreview는 먼저 지우고 예측 점마다 arc를 그리며, 빈 목록이면 지우기만 한다", () => {
    stub = installCanvasStub();
    const canvas = document.createElement("canvas");
    presentPreview(canvas, [], 5);
    expect(stub.clearRectCalls).toBe(1);
    expect(stub.arcCalls).toBe(0);
    presentPreview(
      canvas,
      [
        { x: 1, y: 1, pressure: 0.5 },
        { x: 2, y: 2, pressure: 0 },
        { x: 3, y: 3, pressure: 1 },
      ],
      5,
    );
    expect(stub.clearRectCalls).toBe(2);
    expect(stub.arcCalls).toBe(3);
    clearCanvas(canvas);
    expect(stub.clearRectCalls).toBe(3);
  });

  it("configureWebGpuCanvas는 컨텍스트 부재·2D 컨텍스트 반환을 각각 webgpu-canvas-unavailable로 던진다", () => {
    const device = {} as GPUDevice;
    const none = document.createElement("canvas");
    expect(() => configureWebGpuCanvas(none, device, "bgra8unorm")).toThrow(
      expect.objectContaining({ code: "webgpu-canvas-unavailable" }),
    );
    stub = installCanvasStub({ webgpuAs2d: true });
    expect(() => configureWebGpuCanvas(document.createElement("canvas"), device, "bgra8unorm")).toThrow(
      /2D\/WebGL/u,
    );
  });

  it("configureWebGpuCanvas는 WebGPU 컨텍스트를 premultiplied로 구성해 돌려준다", () => {
    stub = installCanvasStub({ webgpu: true });
    const device = {} as GPUDevice;
    const ctx = configureWebGpuCanvas(document.createElement("canvas"), device, "rgba8unorm");
    expect(typeof ctx.getCurrentTexture).toBe("function");
    expect(stub.configureCalls).toEqual([{ device, format: "rgba8unorm", alphaMode: "premultiplied" }]);
  });
});

describe("그리기 화면: 문서 크기·표시 스케일", () => {
  it("fitDocumentSize는 dpr 배율로 문서 px를 정하고 한도 안이면 줄이지 않는다", () => {
    const r = fitDocumentSize(600, 400, 2);
    expect(r.css).toEqual({ width: 600, height: 400 });
    expect(r.document).toEqual({ width: 1200, height: 800 });
    expect(r.reduced).toBe(false);
    // 900×600 CSS px × dpr 2는 1800×1200 = 8475 타일이라 6000 타일 한도로 줄어든다.
    const big = fitDocumentSize(900, 600, 2);
    expect(big.css).toEqual({ width: 900, height: 600 });
    expect(big.reduced).toBe(true);
    expect(documentTileCount(big.document)).toBeLessThanOrEqual(MAX_DOCUMENT_TILES);
    const small = fitDocumentSize(800, 500, 1);
    expect(small.document).toEqual({ width: 800, height: 500 });
    expect(small.reduced).toBe(false);
  });

  it("한 변 2048 px·6000 타일 한도를 넘으면 같은 종횡비로 줄이고 reduced로 알린다", () => {
    const huge = fitDocumentSize(3000, 1000, 1);
    expect(Math.max(huge.document.width, huge.document.height)).toBeLessThanOrEqual(MAX_DOCUMENT_SIDE_PX);
    expect(documentTileCount(huge.document)).toBeLessThanOrEqual(MAX_DOCUMENT_TILES);
    expect(huge.reduced).toBe(true);
    expect(huge.document.width / huge.document.height).toBeCloseTo(3, 1);
    const squareHuge = fitDocumentSize(2048, 2048, 1);
    expect(documentTileCount(squareHuge.document)).toBeLessThanOrEqual(MAX_DOCUMENT_TILES);
  });

  it("dpr은 1..2로 클램프하고 작은 영역도 64 px 이상으로 맞춘다", () => {
    expect(fitDocumentSize(400, 300, 5).document).toEqual({ width: 800, height: 600 });
    expect(fitDocumentSize(400, 300, 0).document).toEqual({ width: 400, height: 300 });
    expect(fitDocumentSize(400, 300, Number.NaN).document).toEqual({ width: 400, height: 300 });
    expect(fitDocumentSize(10, 10, 1).document).toEqual({ width: 64, height: 64 });
  });

  it("documentTileCount는 16 px 타일을 올림으로 센다", () => {
    expect(documentTileCount({ width: 1024, height: 640 })).toBe(64 * 40);
    expect(documentTileCount({ width: 17, height: 1 })).toBe(2);
  });

  it("displayScale은 컨테이너에 맞추되 확대하지 않는다", () => {
    expect(displayScale({ width: 1024, height: 640 }, 512)).toBe(0.5);
    expect(displayScale({ width: 512, height: 512 }, 2000)).toBe(1);
    expect(displayScale({ width: 512, height: 512 }, 0)).toBe(1);
  });

  it("flattenOnWhite는 투명 readback을 흰 종이 위에 합성한 불투명 이미지로 만들고 입력을 바꾸지 않는다", () => {
    const data = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 128, 200, 100, 50, 255]);
    const src: LabImage = { width: 4, height: 1, data };
    const out = flattenOnWhite(src);
    expect(Array.from(out.data)).toEqual([0, 0, 0, 255, 255, 255, 255, 255, 127, 127, 127, 255, 200, 100, 50, 255]);
    expect(data[3]).toBe(255);
    expect(data[7]).toBe(0);
    expect(out.width).toBe(4);
  });
});
