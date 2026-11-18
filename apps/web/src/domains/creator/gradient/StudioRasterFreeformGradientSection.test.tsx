// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioRasterFreeformGradientSection } from "./StudioRasterFreeformGradientSection";
import { DEFAULT_STUDIO_RASTER_FREEFORM_UI_STATE } from "./studio-raster-gradient";

afterEach(cleanup);

describe("StudioRasterFreeformGradientSection", () => {
  it("일반·그라데이션 지우개·만화 망점 모드를 전환하고 실시간 48×20 픽셀 미리보기와 한국어 라벨을 표시한다", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <StudioRasterFreeformGradientSection
        value={DEFAULT_STUDIO_RASTER_FREEFORM_UI_STATE}
        onChange={onChange}
      />,
    );

    // 기본적으로 details는 닫혀 있으며 열었을 때 컨트롤과 실시간 픽셀 미리보기가 동작한다.
    const rootDetails = container.querySelector("details")!;
    rootDetails.open = true;

    expect(screen.getByText("계단 현상 완화 (미세 분산)")).toBeTruthy();
    expect(screen.getByRole("img", { name: "래스터 그라데이션 픽셀 미리보기" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "자유형 및 등고선 채우기 픽셀 미리보기" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "그라데이션 지우개" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_STUDIO_RASTER_FREEFORM_UI_STATE,
      outputMode: "erase",
    });

    fireEvent.click(screen.getByRole("button", { name: "만화 망점" }));
    const halftoneState = {
      ...DEFAULT_STUDIO_RASTER_FREEFORM_UI_STATE,
      outputMode: "manga-halftone" as const,
    };
    expect(onChange).toHaveBeenLastCalledWith(halftoneState);

    rerender(
      <StudioRasterFreeformGradientSection
        value={halftoneState}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("60선")).toBeTruthy();
    expect(screen.getByText("45°")).toBeTruthy();
  });

  it("자유형 그라데이션 보간법과 등고선 채우기 전이 곡선 변경을 정확히 전달한다", () => {
    const onChange = vi.fn();
    const { container } = render(
      <StudioRasterFreeformGradientSection
        value={DEFAULT_STUDIO_RASTER_FREEFORM_UI_STATE}
        onChange={onChange}
      />,
    );

    for (const d of container.querySelectorAll("details")) {
      d.open = true;
    }

    fireEvent.click(screen.getByRole("button", { name: "조화 보간" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_STUDIO_RASTER_FREEFORM_UI_STATE,
      freeformMethod: "harmonic",
    });

    fireEvent.click(screen.getByRole("button", { name: "완만한 끝" }));
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_STUDIO_RASTER_FREEFORM_UI_STATE,
      contourCurve: "ease-out",
    });
  });
});
