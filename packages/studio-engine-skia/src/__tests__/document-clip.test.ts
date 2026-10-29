import { describe, expect, it, vi } from "vitest";

import { clipSkiaDocumentItem } from "../document-clip";

import type { Canvas, CanvasKit } from "canvaskit-wasm";

describe("GPU 컷 자식 클립", () => {
  function harness() {
    const path = { delete: vi.fn() };
    const builder = { moveTo: vi.fn(), lineTo: vi.fn(), close: vi.fn(), detach: vi.fn(() => path), delete: vi.fn() };
    const canvas = { clipRect: vi.fn(), clipPath: vi.fn() };
    const ck = { ClipOp: { Intersect: 1 }, PathBuilder: class { constructor() { return builder; } } };
    return { canvas, ck, path, builder, apply: (clip: Parameters<typeof clipSkiaDocumentItem>[2]) =>
      clipSkiaDocumentItem(ck as unknown as CanvasKit, canvas as unknown as Canvas, clip) };
  }
  it("사각형 근사 없이 닫힌 실제 경로를 적용하고 native 자원을 해제한다", () => {
    const h = harness();
    h.apply({ x: 10, y: 20, width: 100, height: 80, points: [10, 20, 110, 50, 70, 100] });
    expect(h.builder.moveTo).toHaveBeenCalledWith(10, 20);
    expect(h.builder.lineTo.mock.calls).toEqual([[110, 50], [70, 100]]);
    expect(h.builder.close).toHaveBeenCalledOnce();
    expect(h.canvas.clipPath).toHaveBeenCalledWith(h.path, 1, true);
    expect(h.canvas.clipRect).not.toHaveBeenCalled();
    expect(h.path.delete).toHaveBeenCalledOnce(); expect(h.builder.delete).toHaveBeenCalledOnce();
  });
  it("클립 실패도 path와 builder를 해제한다", () => {
    const h = harness();
    h.canvas.clipPath.mockImplementationOnce(() => { throw new Error("GPU context lost"); });
    expect(() => h.apply({ x: 0, y: 0, width: 10, height: 10, points: [0, 0, 10, 0, 0, 10] })).toThrow("GPU context lost");
    expect(h.path.delete).toHaveBeenCalledOnce(); expect(h.builder.delete).toHaveBeenCalledOnce();
  });
  it("기존 사각형은 native 사각 클립을 그대로 사용한다", () => {
    const h = harness(); h.apply({ x: 10, y: 20, width: 100, height: 80 });
    expect(h.canvas.clipRect).toHaveBeenCalledWith([10, 20, 110, 100], 1, true);
    expect(h.builder.detach).not.toHaveBeenCalled();
  });
});
