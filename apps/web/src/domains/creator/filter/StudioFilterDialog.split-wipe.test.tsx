// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioFilterDialog } from "./StudioFilterDialog";
import { createStudioFilterDraft } from "./studio-filter-menu";
import {
  applyStudioFilterDraftToRgba,
  createStudioFilterPreviewSwatchRgba,
} from "./studio-filter-split-preview";

describe("StudioFilterDialog Split-Wipe & CSP Quick Filters (AC-003)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders draggable Split-Wipe real pixel canvases alongside binary compare and switches to Lens Blur / Line Extraction", () => {
    const rootRef = createRef<HTMLDivElement>();
    render(
      <div ref={rootRef}>
        <StudioFilterDialog
          activeKey="filter:gaussian-blur"
          kind="gaussian-blur"
          image={{}}
          rootRef={rootRef}
          targetKind="image"
          imageSrc="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
          onPreview={vi.fn()}
          onApply={vi.fn()}
          onClose={vi.fn()}
        />
      </div>,
    );

    // Binary 원본 비교 button stays intact
    expect(screen.getByRole("button", { name: "원본 비교" })).toBeTruthy();

    // Open Split-Wipe Before/After preview
    const splitToggle = document.querySelector('[data-studio-filter-split-compare-toggle="true"]') as HTMLButtonElement;
    expect(splitToggle).not.toBeNull();
    fireEvent.click(splitToggle);

    const stage = document.querySelector('[data-studio-filter-split-compare-stage="true"]');
    expect(stage?.getAttribute("data-studio-filter-real-kernel")).toBe("true");
    const beforeCanvas = document.querySelector('[data-studio-filter-pixel-canvas="before"]');
    const afterCanvas = document.querySelector('[data-studio-filter-pixel-canvas="after"]');
    expect(beforeCanvas?.tagName).toBe("CANVAS");
    expect(afterCanvas?.tagName).toBe("CANVAS");
    // Ensure zero CSS filter approximation is used on afterCanvas
    expect((afterCanvas as HTMLElement).style.filter).toBe("");

    const slider = document.querySelector('[data-studio-split-wipe-handle="true"]') as HTMLElement;
    expect(slider).not.toBeNull();
    expect(slider.getAttribute("aria-valuenow")).toBe("50");

    // Keyboard slide shifts wipe ratio smoothly
    fireEvent.keyDown(slider, { key: "ArrowRight", shiftKey: true });
    expect(slider.getAttribute("aria-valuenow")).toBe("60");

    // Switch immediately to Lens Blur via quick shortcut
    const lensBlurBtn = document.querySelector('[data-studio-filter-quick-kind="lens-blur"]') as HTMLButtonElement;
    fireEvent.click(lensBlurBtn);
    expect(lensBlurBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: "렌즈 블러" })).toBeTruthy();

    // Switch immediately to Image->Line Extraction (Difference of Gaussians)
    const lineExtractBtn = document.querySelector(
      '[data-studio-filter-quick-kind="difference-of-gaussians"]',
    ) as HTMLButtonElement;
    fireEvent.click(lineExtractBtn);
    expect(lineExtractBtn.getAttribute("aria-pressed")).toBe("true");
  });

  it("executes real ToonStudio pixel filter kernels (Lens Blur & Line Extraction) on RGBA buffers without CSS approximation", async () => {
    const swatch = createStudioFilterPreviewSwatchRgba(64, 48);

    const lensResult = await applyStudioFilterDraftToRgba(
      swatch,
      createStudioFilterDraft("lens-blur", {}),
    );
    expect(lensResult.filterCount).toBeGreaterThanOrEqual(1);
    let lensDiffPixels = 0;
    for (let i = 0; i < swatch.data.length; i += 4) {
      if (
        lensResult.data[i] !== swatch.data[i] ||
        lensResult.data[i + 1] !== swatch.data[i + 1] ||
        lensResult.data[i + 2] !== swatch.data[i + 2]
      ) {
        lensDiffPixels += 1;
      }
    }
    expect(lensDiffPixels).toBeGreaterThan(20);

    const lineResult = await applyStudioFilterDraftToRgba(
      swatch,
      createStudioFilterDraft("difference-of-gaussians", {}),
    );
    expect(lineResult.filterCount).toBeGreaterThanOrEqual(1);
    let lineDiffPixels = 0;
    for (let i = 0; i < swatch.data.length; i += 4) {
      if (lineResult.data[i] !== swatch.data[i]) {
        lineDiffPixels += 1;
      }
    }
    expect(lineDiffPixels).toBeGreaterThan(20);
  });
});
