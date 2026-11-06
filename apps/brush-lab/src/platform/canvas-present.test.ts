// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { installCanvasStub } from "../app/testing/canvas-stub";
import { SumiError } from "../engine/core/errors";

import {
  clearCanvas,
  configureWebGpuCanvas,
  displayScale,
  documentTileCount,
  fitDocumentSize,
  flattenOnWhite,
  getPresentRollbackDiagnostics,
  MAX_DOCUMENT_SIDE_PX,
  MAX_DOCUMENT_TILES,
  MAX_LAB_IMAGE_BYTES,
  MAX_LAB_IMAGE_PIXELS,
  MAX_LAB_IMAGE_SIDE_PX,
  presentLabImage,
  presentLabImageWithReceipt,
  presentPreview,
  validateLabImage,
} from "./canvas-present";

import type { LabImageInvalidReason } from "./canvas-present";
import type { CanvasStubRecorder } from "../app/testing/canvas-stub";
import type { LabImage } from "../engine/core/types";

function image(width: number, height: number, fill = 128): LabImage {
  const data = new Uint8ClampedArray(width * height * 4).fill(fill);
  return { width, height, data };
}

function expectLabImageInvalid(fn: () => unknown, reason: LabImageInvalidReason): void {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(SumiError);
  expect(caught).toMatchObject({
    code: "lab-image-invalid",
    details: expect.objectContaining({ reason }),
  });
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

  it("presentLabImageWithReceipt는 동일 크기·교차 크기 메모리 예산과 원자성 영수증을 정확히 기록한다", () => {
    stub = installCanvasStub();
    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 6;
    const sameReceipt = presentLabImageWithReceipt(canvas, image(8, 6, 150));
    expect(sameReceipt).toEqual({
      committed: true,
      crossSize: false,
      prevWidth: 8,
      prevHeight: 6,
      width: 8,
      height: 6,
      snapshotCaptured: false,
      snapshotBytes: 0,
      stagedBytes: 192,
      peakStagingBytes: 192,
      atomicityStatus: "committed-same-size",
    });
    expect(stub.putImageDataCalls).toBe(1);
    stub.restore();
    stub = null;

    let putCalls = 0;
    const origGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext");
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      writable: true,
      value: () => ({
        createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
        getImageData: (x: number, y: number, w: number, h: number) => ({
          width: w - x,
          height: h - y,
          data: new Uint8ClampedArray(w * h * 4).fill(77),
        }),
        putImageData: (): void => {
          putCalls += 1;
        },
      }),
    });
    try {
      const crossCanvas = document.createElement("canvas");
      crossCanvas.width = 4;
      crossCanvas.height = 4;
      const crossReceipt = presentLabImageWithReceipt(crossCanvas, image(8, 6, 200));
      expect(crossReceipt).toEqual({
        committed: true,
        crossSize: true,
        prevWidth: 4,
        prevHeight: 4,
        width: 8,
        height: 6,
        snapshotCaptured: true,
        snapshotBytes: 64,
        stagedBytes: 192,
        peakStagingBytes: 256,
        atomicityStatus: "committed-cross-size",
      });
      expect(putCalls).toBe(1);
    } finally {
      if (origGetContext) Object.defineProperty(HTMLCanvasElement.prototype, "getContext", origGetContext);
    }
  });

  it("2D 컨텍스트가 없으면 SumiError(canvas-2d-unavailable)로 드러낸다(무음 대체 없음)", () => {
    const canvas = document.createElement("canvas");
    expect(() => presentLabImage(canvas, image(2, 2))).toThrow(
      expect.objectContaining({ code: "canvas-2d-unavailable" }),
    );
    expect(() => clearCanvas(canvas)).toThrow(expect.objectContaining({ code: "canvas-2d-unavailable" }));
    expect(() => presentPreview(canvas, [], 4)).toThrow(expect.objectContaining({ code: "canvas-2d-unavailable" }));
  });

  it("presentPreview는 먼저 지우고 정본·예측 점마다 arc를 그리며, 둘 다 빈 목록이면 지우기만 한다", () => {
    stub = installCanvasStub();
    const canvas = document.createElement("canvas");
    presentPreview(canvas, [], 5, []);
    expect(stub.clearRectCalls).toBe(1);
    expect(stub.arcCalls).toBe(0);
    presentPreview(
      canvas,
      [
        { x: 1, y: 1, pressure: 0.5 },
        { x: 2, y: 2, pressure: 0 },
      ],
      5,
      [{ x: 3, y: 3, pressure: 1 }],
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

describe("LabImage 도메인 예산 및 입력 검증 계약", () => {
  let stub: CanvasStubRecorder | null = null;
  afterEach(() => {
    stub?.restore();
    stub = null;
  });

  it("도메인 상수가 MAX_DOCUMENT_SIDE_PX(2048)와 정렬되고 유효한 이미지를 통과시킨다", () => {
    expect(MAX_LAB_IMAGE_SIDE_PX).toBe(2048);
    expect(MAX_LAB_IMAGE_PIXELS).toBe(4_194_304);
    expect(MAX_LAB_IMAGE_BYTES).toBe(16_777_216);
    const valid = image(4, 3, 90);
    const spec = validateLabImage(valid);
    expect(spec).toEqual({
      width: 4,
      height: 3,
      pixels: 12,
      expectedByteLength: 48,
      data: valid.data,
    });
  });

  it("validateLabImage·presentLabImage·flattenOnWhite는 비정상 객체·치수·예산 초과·버퍼 타입·길이 불일치를 모두 거부한다", () => {
    stub = installCanvasStub();
    const canvas = document.createElement("canvas");
    const cases: ReadonlyArray<{ readonly raw: unknown; readonly reason: LabImageInvalidReason }> = [
      { raw: null, reason: "invalid-image-object" },
      { raw: undefined, reason: "invalid-image-object" },
      { raw: { width: 3.5, height: 2, data: new Uint8ClampedArray(28) }, reason: "non-integer-dimensions" },
      { raw: { width: Number.NaN, height: 2, data: new Uint8ClampedArray(8) }, reason: "non-integer-dimensions" },
      {
        raw: { width: Number.POSITIVE_INFINITY, height: 2, data: new Uint8ClampedArray(8) },
        reason: "non-integer-dimensions",
      },
      {
        raw: { width: 2, height: Number.NEGATIVE_INFINITY, data: new Uint8ClampedArray(8) },
        reason: "non-integer-dimensions",
      },
      { raw: { width: 0, height: 4, data: new Uint8ClampedArray(0) }, reason: "non-positive-dimensions" },
      { raw: { width: 4, height: 0, data: new Uint8ClampedArray(0) }, reason: "non-positive-dimensions" },
      { raw: { width: -4, height: 4, data: new Uint8ClampedArray(64) }, reason: "non-positive-dimensions" },
      // 음수×음수 부호 상쇄(-2 × -2 = +4) 차단
      { raw: { width: -2, height: -2, data: new Uint8ClampedArray(16) }, reason: "non-positive-dimensions" },
      // 도메인 예산 초과(버퍼 할당 전 사전 차단)
      { raw: { width: 2049, height: 64, data: new Uint8ClampedArray(4) }, reason: "dimensions-exceed-budget" },
      { raw: { width: 4096, height: 4096, data: new Uint8ClampedArray(4) }, reason: "dimensions-exceed-budget" },
      { raw: { width: 100_000, height: 100_000, data: new Uint8ClampedArray(4) }, reason: "dimensions-exceed-budget" },
      // 잘못된 버퍼 타입
      { raw: { width: 2, height: 2, data: new Uint8Array(16) }, reason: "invalid-buffer-type" },
      { raw: { width: 2, height: 2, data: new Float32Array(16) }, reason: "invalid-buffer-type" },
      { raw: { width: 2, height: 2, data: new Array<number>(16).fill(0) }, reason: "invalid-buffer-type" },
      // 짧은/잘린 버퍼 및 초과 길이 버퍼
      { raw: { width: 2, height: 2, data: new Uint8ClampedArray(0) }, reason: "buffer-length-mismatch" },
      { raw: { width: 2, height: 2, data: new Uint8ClampedArray(15) }, reason: "buffer-length-mismatch" },
      { raw: { width: 2, height: 2, data: new Uint8ClampedArray(8) }, reason: "buffer-length-mismatch" },
      { raw: { width: 2, height: 2, data: new Uint8ClampedArray(20) }, reason: "buffer-length-mismatch" },
    ];

    for (const { raw, reason } of cases) {
      expectLabImageInvalid(() => validateLabImage(raw), reason);
      expectLabImageInvalid(() => presentLabImage(canvas, raw as LabImage), reason);
      expectLabImageInvalid(() => flattenOnWhite(raw as LabImage), reason);
    }
    expect(stub.putImageDataCalls).toBe(0);
  });

  it("presentLabImage 실패(잘못된 입력·2D 컨텍스트 부재·createImageData 예외) 시 기존 캔버스 크기와 픽셀을 보존하고 다음 유효 호출에서 즉시 복구한다", () => {
    stub = installCanvasStub();
    const canvas = document.createElement("canvas");
    const initial = image(8, 6, 177);
    const initialSnap = new Uint8ClampedArray(initial.data);
    presentLabImage(canvas, initial);
    expect(canvas.width).toBe(8);
    expect(canvas.height).toBe(6);
    expect(stub.putImageDataCalls).toBe(1);
    const preservedRendered = new Uint8ClampedArray(stub.lastImage?.data ?? []);

    // 1) 잘못된 LabImage 입력 실패 시 캔버스 크기(8×6) 및 마지막 픽셀 보존
    const badShort: LabImage = { width: 12, height: 10, data: new Uint8ClampedArray(10) };
    expectLabImageInvalid(() => presentLabImage(canvas, badShort), "buffer-length-mismatch");
    expect(canvas.width).toBe(8);
    expect(canvas.height).toBe(6);
    expect(stub.putImageDataCalls).toBe(1);
    expect(stub.lastImage?.data).toEqual(preservedRendered);
    expect(getPresentRollbackDiagnostics(null)).toBeNull();

    // 2) getContext("2d") -> null 실패 시(다른 크기의 유효 이미지 16×14를 넘겨도) 캔버스 크기 8×6 보존
    stub.restore();
    stub = null;
    const validNextSize = image(16, 14, 99);
    const validNextSnap = new Uint8ClampedArray(validNextSize.data);
    expect(() => presentLabImage(canvas, validNextSize)).toThrow(
      expect.objectContaining({ code: "canvas-2d-unavailable" }),
    );
    expect(canvas.width).toBe(8);
    expect(canvas.height).toBe(6);
    expect(validNextSize.data).toEqual(validNextSnap);

    // 3) createImageData가 예외를 던져도 canvas.width/height 변경 전이므로 8×6 보존 + preserved-pre-resize 진단
    const origGetContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext");
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      writable: true,
      value: () => ({
        createImageData: (): never => {
          throw new Error("createImageData allocation failure");
        },
        putImageData: (): void => {},
      }),
    });
    try {
      let caughtStaging: unknown;
      try {
        presentLabImage(canvas, validNextSize);
      } catch (err) {
        caughtStaging = err;
      }
      expect(caughtStaging).toBeInstanceOf(Error);
      expect((caughtStaging as Error).message).toMatch(/createImageData allocation failure/u);
      expect(getPresentRollbackDiagnostics(caughtStaging)).toEqual({
        committed: false,
        crossSize: true,
        prevWidth: 8,
        prevHeight: 6,
        targetWidth: 16,
        targetHeight: 14,
        snapshotCaptured: false,
        snapshotBytes: 0,
        stagedBytes: 0,
        peakStagingBytes: 0,
        dimensionsRestored: true,
        pixelsRestored: true,
        atomicityStatus: "preserved-pre-resize",
      });
      expect(canvas.width).toBe(8);
      expect(canvas.height).toBe(6);
      expect(initial.data).toEqual(initialSnap);
    } finally {
      if (origGetContext) Object.defineProperty(HTMLCanvasElement.prototype, "getContext", origGetContext);
    }

    // 4) 스텁 복원 후 다음 유효 호출(8×6 -> 12×10 크기 변경 포함)에서 즉시 정상 복구
    stub = installCanvasStub();
    const recovered = image(12, 10, 231);
    presentLabImage(canvas, recovered);
    expect(canvas.width).toBe(12);
    expect(canvas.height).toBe(10);
    expect(stub.putImageDataCalls).toBe(1);
    expect(stub.lastImage?.width).toBe(12);
    expect(stub.lastImage?.height).toBe(10);
    expect(stub.lastImage?.data[0]).toBe(231);
  });

  it("putImageData 일시 실패 시 교차 크기에서도 스냅샷 롤백(restored-from-snapshot)으로 이전 크기·픽셀을 복원하고 재시도 시 복구한다", () => {
    const state: {
      throwNextTargetPut: boolean;
      throwAllPut: boolean;
      disableSnapshot: boolean;
      lastCommitted: LabImage | null;
    } = {
      throwNextTargetPut: false,
      throwAllPut: false,
      disableSnapshot: false,
      lastCommitted: null,
    };
    const original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext");
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      writable: true,
      value: () => ({
        createImageData: (w: number, h: number) => ({
          width: w,
          height: h,
          data: new Uint8ClampedArray(w * h * 4),
        }),
        getImageData: (x: number, y: number, w: number, h: number) => {
          if (state.disableSnapshot) throw new Error("SecurityError: tainted canvas");
          const src = state.lastCommitted;
          if (!src || src.width !== w - x || src.height !== h - y) {
            return { width: w - x, height: h - y, data: new Uint8ClampedArray((w - x) * (h - y) * 4) };
          }
          return { width: src.width, height: src.height, data: new Uint8ClampedArray(src.data) };
        },
        putImageData: (img: LabImage): void => {
          if (state.throwAllPut) throw new Error("persistent putImageData failure");
          if (state.throwNextTargetPut) {
            state.throwNextTargetPut = false;
            throw new Error("transient putImageData failure");
          }
          state.lastCommitted = { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
        },
      }),
    });
    try {
      const canvas = document.createElement("canvas");
      presentLabImage(canvas, image(6, 4, 111));
      expect(canvas.width).toBe(6);
      expect(canvas.height).toBe(4);
      expect(state.lastCommitted?.data[0]).toBe(111);

      // 1) 동일 크기(6×4)에서 putImageData 예외 -> preserved-same-size
      state.throwNextTargetPut = true;
      let sameErr: unknown;
      try {
        presentLabImage(canvas, image(6, 4, 222));
      } catch (err) {
        sameErr = err;
      }
      expect(getPresentRollbackDiagnostics(sameErr)).toEqual({
        committed: false,
        crossSize: false,
        prevWidth: 6,
        prevHeight: 4,
        targetWidth: 6,
        targetHeight: 4,
        snapshotCaptured: false,
        snapshotBytes: 0,
        stagedBytes: 96,
        peakStagingBytes: 96,
        dimensionsRestored: true,
        pixelsRestored: true,
        atomicityStatus: "preserved-same-size",
      });
      expect(canvas.width).toBe(6);
      expect(canvas.height).toBe(4);
      expect(state.lastCommitted?.data[0]).toBe(111);

      // 2) 교차 크기(6×4 -> 10×8) 일시적 putImageData 실패 -> 스냅샷으로 6×4 및 픽셀(111) 완전 복원
      state.throwNextTargetPut = true;
      let crossTransientErr: unknown;
      try {
        presentLabImage(canvas, image(10, 8, 222));
      } catch (err) {
        crossTransientErr = err;
      }
      expect((crossTransientErr as Error).message).toMatch(/transient putImageData failure/u);
      expect(canvas.width).toBe(6);
      expect(canvas.height).toBe(4);
      expect(state.lastCommitted?.width).toBe(6);
      expect(state.lastCommitted?.height).toBe(4);
      expect(state.lastCommitted?.data[0]).toBe(111);
      expect(getPresentRollbackDiagnostics(crossTransientErr)).toEqual({
        committed: false,
        crossSize: true,
        prevWidth: 6,
        prevHeight: 4,
        targetWidth: 10,
        targetHeight: 8,
        snapshotCaptured: true,
        snapshotBytes: 96,
        stagedBytes: 320,
        peakStagingBytes: 416,
        dimensionsRestored: true,
        pixelsRestored: true,
        atomicityStatus: "restored-from-snapshot",
      });

      // 3) 일시 장애 해소 후 재호출(10×8) 시 즉시 복구 후 6×4로 재설정하여 잔여 경계 검증
      presentLabImage(canvas, image(10, 8, 222));
      expect(canvas.width).toBe(10);
      expect(canvas.height).toBe(8);
      expect(state.lastCommitted?.data[0]).toBe(222);
      presentLabImage(canvas, image(6, 4, 111));

      // 4) 잔여 비원자 경계 A: 커밋과 롤백 putImageData가 모두 영구 실패 -> dimensions-only-rollback-put-failed
      state.throwAllPut = true;
      let rollbackFailErr: unknown;
      try {
        presentLabImage(canvas, image(10, 8, 222));
      } catch (err) {
        rollbackFailErr = err;
      }
      expect(canvas.width).toBe(6);
      expect(canvas.height).toBe(4);
      expect(getPresentRollbackDiagnostics(rollbackFailErr)).toMatchObject({
        committed: false,
        crossSize: true,
        prevWidth: 6,
        prevHeight: 4,
        targetWidth: 10,
        targetHeight: 8,
        snapshotCaptured: true,
        dimensionsRestored: true,
        pixelsRestored: false,
        atomicityStatus: "dimensions-only-rollback-put-failed",
      });

      // 5) 잔여 비원자 경계 B: getImageData 스냅샷 불가(SecurityError 등) + 교차 크기 putImageData 실패 -> dimensions-only-snapshot-unavailable
      state.disableSnapshot = true;
      let noSnapErr: unknown;
      try {
        presentLabImage(canvas, image(10, 8, 222));
      } catch (err) {
        noSnapErr = err;
      }
      expect(canvas.width).toBe(6);
      expect(canvas.height).toBe(4);
      expect(getPresentRollbackDiagnostics(noSnapErr)).toMatchObject({
        committed: false,
        crossSize: true,
        prevWidth: 6,
        prevHeight: 4,
        targetWidth: 10,
        targetHeight: 8,
        snapshotCaptured: false,
        snapshotBytes: 0,
        dimensionsRestored: true,
        pixelsRestored: false,
        atomicityStatus: "dimensions-only-snapshot-unavailable",
      });
    } finally {
      if (original) Object.defineProperty(HTMLCanvasElement.prototype, "getContext", original);
    }
  });

  it("음성 대조군: 검증 전 리사이즈는 실패 시 캔버스 크기를 오염시키고, 무검증 ?? 0 루프는 잘린 버퍼를 불투명 흰색으로 위장한다", () => {
    const legacyResizeBeforeValidate = (canvas: HTMLCanvasElement, img: LabImage): void => {
      if (canvas.width !== img.width) canvas.width = img.width;
      if (canvas.height !== img.height) canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new SumiError("canvas-2d-unavailable", "2D 없음");
    };
    const legacyUnvalidatedFlatten = (img: LabImage): LabImage => {
      const data = new Uint8ClampedArray(img.width * img.height * 4);
      const src = img.data;
      for (let i = 0; i < data.length; i += 4) {
        const a = (src[i + 3] ?? 0) / 255;
        data[i] = Math.round((src[i] ?? 0) * a + 255 * (1 - a));
        data[i + 1] = Math.round((src[i + 1] ?? 0) * a + 255 * (1 - a));
        data[i + 2] = Math.round((src[i + 2] ?? 0) * a + 255 * (1 - a));
        data[i + 3] = 255;
      }
      return { width: img.width, height: img.height, data };
    };

    const canvas = document.createElement("canvas");
    canvas.width = 8;
    canvas.height = 6;
    expect(() => legacyResizeBeforeValidate(canvas, image(20, 14))).toThrow();
    // 레거시 순서는 실패했는데도 캔버스 크기가 20×14로 변조됨
    expect(canvas.width).toBe(20);
    expect(canvas.height).toBe(14);

    // 레거시 무검증 루프는 길이 0인 손상 버퍼를 불투명 흰색 [255,255,255,255]로 위장함
    const truncated: LabImage = { width: 1, height: 1, data: new Uint8ClampedArray(0) };
    expect(Array.from(legacyUnvalidatedFlatten(truncated).data)).toEqual([255, 255, 255, 255]);
    // 수정된 flattenOnWhite는 즉시 SumiError(lab-image-invalid)로 차단함
    expectLabImageInvalid(() => flattenOnWhite(truncated), "buffer-length-mismatch");
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

  it("fitDocumentSize와 displayScale은 NaN·±Infinity·음수·0·초거대(1e20) 입력에서도 항상 유한한 안전 범위 값을 돌려준다", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -500, 0, 1e20]) {
      const r = fitDocumentSize(bad, bad, bad);
      expect(Number.isInteger(r.document.width)).toBe(true);
      expect(Number.isInteger(r.document.height)).toBe(true);
      expect(r.document.width).toBeGreaterThanOrEqual(64);
      expect(r.document.height).toBeGreaterThanOrEqual(64);
      expect(r.document.width).toBeLessThanOrEqual(MAX_DOCUMENT_SIDE_PX);
      expect(r.document.height).toBeLessThanOrEqual(MAX_DOCUMENT_SIDE_PX);
      expect(documentTileCount(r.document)).toBeLessThanOrEqual(MAX_DOCUMENT_TILES);
      expect(Number.isFinite(r.css.width)).toBe(true);
      expect(Number.isFinite(r.css.height)).toBe(true);
    }
    expect(displayScale({ width: Number.NaN, height: 640 }, 512)).toBe(1);
    expect(displayScale({ width: Number.POSITIVE_INFINITY, height: 640 }, 512)).toBe(1);
    expect(displayScale({ width: -100, height: 640 }, 512)).toBe(1);
    expect(displayScale({ width: 1024, height: 640 }, Number.NaN)).toBe(1);
    expect(displayScale({ width: 1024, height: 640 }, Number.POSITIVE_INFINITY)).toBe(1);
    expect(displayScale({ width: 1024, height: 640 }, -200)).toBe(1);
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

  it("flattenOnWhite는 비백색 RGB(40,120,200)의 알파 경계(0,1,127,254,255) 및 3×2 다중 픽셀 배치를 정확히 합성하고 원본을 보존한다", () => {
    const alphaRow = new Uint8ClampedArray([
      40, 120, 200, 0,
      40, 120, 200, 1,
      40, 120, 200, 127,
      40, 120, 200, 254,
      40, 120, 200, 255,
      10, 20, 30, 0,
    ]);
    const snapshot = new Uint8ClampedArray(alphaRow);
    const src: LabImage = { width: 3, height: 2, data: alphaRow };
    const out = flattenOnWhite(src);
    expect(out.width).toBe(3);
    expect(out.height).toBe(2);
    expect(out.data).not.toBe(src.data);
    expect(Array.from(out.data)).toEqual([
      255, 255, 255, 255,
      254, 254, 255, 255,
      148, 188, 228, 255,
      41, 121, 200, 255,
      40, 120, 200, 255,
      255, 255, 255, 255,
    ]);
    expect(src.data).toEqual(snapshot);
  });
});

