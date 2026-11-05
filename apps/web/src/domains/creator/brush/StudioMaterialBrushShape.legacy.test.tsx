// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioMaterialBrushShape } from "./StudioMaterialBrushShape";
import { createBrushStudioV6Program } from "../brush-lab/brush-studio-v6-engine";
import { normalizeBrushStudioV6MaterialConfig } from "../brush-lab/brush-studio-v6-material-engine";
import type { DrawEl } from "../studio-element-model";

const record = vi.hoisted(() => vi.fn<(scene: (context: { _context: CanvasRenderingContext2D }) => void) => void>());
vi.mock("react-konva/lib/ReactKonvaCore", () => ({ Shape: (props: { sceneFunc: (context: { _context: CanvasRenderingContext2D }) => void }) => {
  record(props.sceneFunc); return null;
} }));
afterEach(() => { cleanup(); record.mockClear(); });

describe("이전 혼색 획의 화면 상태", () => {
  it("임의 색으로 재생하지 않고 긴 획에도 명시적인 확인 필요 영역을 표시한다", async () => {
    const material = normalizeBrushStudioV6MaterialConfig(createBrushStudioV6Program("mixbox-pigment-spray"));
    if (!material) throw new Error("재료가 없습니다.");
    const points = Array.from({ length: 300_000 }, (_, index) => index % 1000);
    const element: DrawEl = { id: "old", type: "draw", points, stroke: "#ffff00", strokeWidth: 10 };
    const programs = { version: 1 as const, material };
    render(<StudioMaterialBrushShape element={element} points={points} enginePrograms={programs} />);
    await waitFor(() => expect(record).toHaveBeenCalled());
    const paint = record.mock.lastCall?.[0];
    const context = { save: vi.fn(), restore: vi.fn(), setLineDash: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(), fill: vi.fn() };
    if (!paint) throw new Error("화면 함수가 없습니다.");
    expect(() => paint({ _context: context as unknown as CanvasRenderingContext2D })).not.toThrow();
    expect(context.strokeRect).toHaveBeenCalledTimes(1);
    expect(context.fillText).toHaveBeenCalledWith("이전 혼색 획 · 확인 필요", expect.any(Number), expect.any(Number));
    expect(context.fill).not.toHaveBeenCalled();
    expect(context.restore).toHaveBeenCalledTimes(1);
    expect(element.brushEnginePrograms).toBeUndefined();
  });
});
