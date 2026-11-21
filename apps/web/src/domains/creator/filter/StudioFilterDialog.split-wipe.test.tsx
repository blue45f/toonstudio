// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioFilterDialog } from "./StudioFilterDialog";

describe("StudioFilterDialog AC-003 Split-Wipe & CSP Quick Filters", () => {
  afterEach(cleanup);

  it("toggles live draggable Split-Wipe Before/After slider and switches directly to Lens Blur and Line Extraction", () => {
    const rootRef = createRef<HTMLDivElement>();
    const onPreview = vi.fn();
    const onApply = vi.fn();
    const onClose = vi.fn();

    render(
      <div ref={rootRef}>
        <StudioFilterDialog
          activeKey="filter-ac003"
          kind="gaussian-blur"
          image={{ blur: 4 }}
          imageSrc="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII="
          rootRef={rootRef}
          onPreview={onPreview}
          onApply={onApply}
          onClose={onClose}
        />
      </div>,
    );

    // 1. Open live Split-Wipe comparison
    const splitToggle = screen.getByRole("button", { name: "분할 비교" });
    fireEvent.click(splitToggle);
    expect(splitToggle.getAttribute("aria-pressed")).toBe("true");

    const wipeSlider = screen.getByRole("slider", { name: /분할 비교 슬라이더/ });
    expect(wipeSlider.getAttribute("aria-valuenow")).toBe("50");

    // Keyboard slide shifts ratio cleanly
    fireEvent.keyDown(wipeSlider, { key: "ArrowRight", shiftKey: true });
    expect(wipeSlider.getAttribute("aria-valuenow")).toBe("60");
    fireEvent.keyDown(wipeSlider, { key: "Home" });
    expect(wipeSlider.getAttribute("aria-valuenow")).toBe("0");

    // 2. Quick-switch directly to Lens Blur (렌즈 블러)
    const lensBlurBtn = document.querySelector<HTMLButtonElement>(
      '[data-studio-filter-quick-kind="lens-blur"]',
    )!;
    fireEvent.click(lensBlurBtn);
    expect(screen.getByRole("heading", { name: "렌즈 블러" })).toBeTruthy();

    // 3. Quick-switch directly to Image -> Line Extraction (가우시안 차분 선화)
    const lineExtractBtn = document.querySelector<HTMLButtonElement>(
      '[data-studio-filter-quick-kind="difference-of-gaussians"]',
    )!;
    fireEvent.click(lineExtractBtn);
    expect(screen.getByRole("heading", { name: "가우시안 차분 선화" })).toBeTruthy();
  });
});
