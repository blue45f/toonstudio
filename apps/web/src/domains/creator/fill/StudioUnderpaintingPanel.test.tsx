// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioUnderpaintingPanel } from "./StudioUnderpaintingPanel";

afterEach(() => cleanup());

describe("StudioUnderpaintingPanel", () => {
  it("H/W > 2.0 장편 컷을 자동 감지해 256px 오버랩 타일링 안내를 표시하고 3층 작업을 제출한다", () => {
    const onRunUnderpainting = vi.fn();
    render(
      <StudioUnderpaintingPanel
        cutId="cut-long"
        lineartLayerId="ink-layer-1"
        lineartLayerName="주선화"
        canvasWidth={720}
        canvasHeight={2_200}
        markingStrokes={[
          { cutId: "cut-long", label: "A", normalizedXY: [0.3, 0.2] },
          { cutId: "cut-long", label: "B", normalizedXY: [0.7, 0.5] },
        ]}
        onRunUnderpainting={onRunUnderpainting}
      />,
    );

    const panel = screen.getByLabelText("디지털 언더페인팅 3층 자동채색");
    expect(panel.getAttribute("data-underpainting-tiling")).toBe("active");
    expect(screen.getByText(/256px 오버랩 페더링/)).toBeTruthy();
    expect(screen.getByText("Multiply · 비파괴 잠금")).toBeTruthy();
    expect(screen.getByText("↳ 하이라이트 (클리핑)")).toBeTruthy();
    expect(screen.getByText("↳ 음영 (클리핑)")).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: /D 마킹 펜/ }));
    fireEvent.change(screen.getByLabelText("한 줄 색 지시"), {
      target: { value: "저녁 노을빛 역광" },
    });
    fireEvent.click(screen.getByRole("button", { name: "3층 언더페인팅 적용" }));

    expect(onRunUnderpainting).toHaveBeenCalledWith(
      expect.objectContaining({
        cutId: "cut-long",
        lineartLayerId: "ink-layer-1",
        instructionText: "저녁 노을빛 역광",
        outputMode: "base_shadow_highlight",
        shadingLevel: "cel_highlight",
        propagateFromFirstCut: true,
        tileOverlapPx: 256,
      }),
    );
  });
});
