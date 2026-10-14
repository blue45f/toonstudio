// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  COLOR_MATCH_PRESETS,
  createSyntheticReferenceRgba,
} from "./studio-color-match-presets";
import { StudioColorMatchPanel } from "./StudioColorMatchPanel";

describe("StudioColorMatchPanel", () => {
  afterEach(() => {
    cleanup();
  });

  const sampleSourceImage = createSyntheticReferenceRgba(
    [
      [100, 100, 100],
      [200, 200, 200],
    ],
    16,
  );

  it("renders atmospheric presets correctly", () => {
    render(<StudioColorMatchPanel sourceImage={sampleSourceImage} />);

    expect(screen.getByText("색감 맞추기")).toBeDefined();
    for (const preset of COLOR_MATCH_PRESETS) {
      expect(screen.getByText(preset.name)).toBeDefined();
    }
  });

  it("switches presets on click", () => {
    render(<StudioColorMatchPanel sourceImage={sampleSourceImage} />);

    const cyberpunkButton = screen.getByText("사이버펑크 네온");
    fireEvent.click(cyberpunkButton);
    expect(cyberpunkButton).toBeDefined();
  });

  it("calls onApply when applying color match", () => {
    const onApply = vi.fn();
    render(
      <StudioColorMatchPanel
        sourceImage={sampleSourceImage}
        onApply={onApply}
      />,
    );

    const applyButton = screen.getByText("색감 적용");
    expect(applyButton).toBeDefined();
    fireEvent.click(applyButton);

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 16,
        height: 16,
        data: expect.any(Uint8ClampedArray),
      }),
    );
  });

  it("applies the reference tone to the whole episode in one click", () => {
    const onApplyToEpisode = vi.fn();
    const secondPage = createSyntheticReferenceRgba(
      [
        [40, 60, 80],
        [90, 110, 130],
      ],
      16,
    );
    render(
      <StudioColorMatchPanel
        sourceImage={sampleSourceImage}
        episodePages={[
          { pageId: "cut-1", image: sampleSourceImage },
          { pageId: "cut-2", image: secondPage },
        ]}
        onApplyToEpisode={onApplyToEpisode}
      />,
    );

    fireEvent.click(screen.getByText("회차 전체에 적용"));

    expect(onApplyToEpisode).toHaveBeenCalledTimes(1);
    expect(onApplyToEpisode).toHaveBeenCalledWith(
      expect.objectContaining({
        totalCount: 2,
        appliedCount: 2,
        refusedCount: 0,
      }),
    );
    expect(screen.getByText(/2컷에 색감을 적용했습니다/)).toBeDefined();
  });

  it("disables episode apply when the episode has no pages", () => {
    const onApplyToEpisode = vi.fn();
    render(
      <StudioColorMatchPanel
        sourceImage={sampleSourceImage}
        episodePages={[]}
        onApplyToEpisode={onApplyToEpisode}
      />,
    );

    const episodeButton = screen
      .getByText("회차 전체에 적용")
      .closest("button");
    expect(episodeButton?.hasAttribute("disabled")).toBe(true);
    fireEvent.click(episodeButton as HTMLElement);
    expect(onApplyToEpisode).not.toHaveBeenCalled();
  });
});
