// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { analyzeStudioScrollRhythm } from "../studio-scroll-rhythm";

import { StudioWebtoonViewAreaOverlay } from "./StudioWebtoonViewAreaOverlay";

afterEach(() => cleanup());

describe("StudioWebtoonViewAreaOverlay", () => {
  it("9:16 / 9:19.5 / 9:20 스마트폰 시야 비율에 맞춰 실시간 반투명 마스크와 창 높이를 갱신한다", () => {
    render(
      <StudioWebtoonViewAreaOverlay
        canvasWidth={720}
        canvasHeight={4_000}
        scrollTop={500}
        panels={[
          { id: "cut-normal", y: 100, height: 900 },
          { id: "cut-tall", y: 1_200, height: 2_300 },
        ]}
      />,
    );

    const overlay = document.querySelector('[data-webtoon-view-area-overlay="true"]')!;
    const windowEl = () => document.querySelector('[data-view-area-window="true"]')!;

    // 기본 9:19.5 -> round(720 * 19.5 / 9) = 1560px
    expect(overlay.getAttribute("data-aspect-ratio")).toBe("9:19.5");
    expect(windowEl().getAttribute("data-window-top")).toBe("500");
    expect(windowEl().getAttribute("data-window-height")).toBe("1560");
    // 2300 / 1560 = 1.47 > 1.4 -> 긴 컷 1건 경고 표시
    expect(screen.getByText("긴 컷 1건")).toBeTruthy();

    // 9:16 전환 -> round(720 * 16 / 9) = 1280px
    fireEvent.click(screen.getByRole("button", { name: "9:16" }));
    expect(overlay.getAttribute("data-aspect-ratio")).toBe("9:16");
    expect(windowEl().getAttribute("data-window-height")).toBe("1280");

    // 9:20 전환 -> round(720 * 20 / 9) = 1600px
    fireEvent.click(screen.getByRole("button", { name: "9:20" }));
    expect(overlay.getAttribute("data-aspect-ratio")).toBe("9:20");
    expect(windowEl().getAttribute("data-window-height")).toBe("1600");

    // 마스크 토글 끄기
    fireEvent.click(screen.getByRole("button", { name: "시야 마스크 켜짐" }));
    expect(overlay.getAttribute("data-mask-visible")).toBe("false");
    expect(document.querySelector('[data-view-area-mask-layer="true"]')).toBeNull();
  });
});

describe("analyzeStudioScrollRhythm — OVERSIZED_PANEL 감지", () => {
  it("panel.height / viewportHeight <= 1.4 컷에는 경고를 내지 않고, > 1.4 초과 컷에는 OVERSIZED_PANEL을 감지한다", () => {
    const safeResult = analyzeStudioScrollRhythm(
      [
        {
          id: "safe-page",
          canvasH: 3_000,
          elements: [{ id: "p-ok", type: "frame", y: 100, height: 1_792 }], // 1792 / 1280 = 1.40
        },
      ],
      { viewportHeightPx: 1_280 },
    );
    expect(safeResult.pages[0]?.oversizedPanelCount).toBe(0);
    expect(safeResult.insights.some((i) => i.code === "OVERSIZED_PANEL")).toBe(false);

    const warnResult = analyzeStudioScrollRhythm(
      [
        {
          id: "warn-page",
          canvasH: 3_200,
          elements: [{ id: "p-tall", type: "panel", y: 100, height: 2_048 }], // 2048 / 1280 = 1.60
        },
      ],
      { viewportHeightPx: 1_280 },
    );
    expect(warnResult.pages[0]?.oversizedPanelCount).toBe(1);
    expect(warnResult.pages[0]?.tallestPanelScreens).toBe(1.6);
    expect(warnResult.insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "OVERSIZED_PANEL",
          severity: "warning",
          pageId: "warn-page",
          params: { panelScreens: "1.6", count: "1" },
        }),
      ]),
    );

    const criticalResult = analyzeStudioScrollRhythm(
      [
        {
          id: "crit-page",
          canvasH: 4_000,
          elements: [{ id: "p-huge", type: "frame", y: 50, height: 3_200 }], // 3200 / 1280 = 2.50
        },
      ],
      { viewportHeightPx: 1_280 },
    );
    expect(criticalResult.insights).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "OVERSIZED_PANEL",
          severity: "critical",
          pageId: "crit-page",
        }),
      ]),
    );
  });
});
