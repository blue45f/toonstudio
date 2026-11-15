// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBrushTextureSpacingComparisonCard } from "./StudioBrushTextureSpacingComparisonCard";
import {
  evaluateBrushTextureLongStrokeComparison,
  resolveZoomInvariantBrushTextureSpacing,
  STUDIO_MAX_CONTINUOUS_GRAIN_SPACING_RATIO,
} from "./studio-brush-texture-spacing-parity";

afterEach(cleanup);

describe("P1-09 브러시 텍스처·간격 확대 불변성 및 긴 획 비교 샘플", () => {
  it("확대 배율(100%·250%·400%)이 달라도 문서 공간 스탬프 간격과 질감 알파가 0.0px 오차로 일치한다", () => {
    const s100 = resolveZoomInvariantBrushTextureSpacing({
      spacingRatio: 0.18,
      brushSizeDocumentPx: 16,
      grainAmount: 0.4,
      zoomScale: 1,
    });
    const s250 = resolveZoomInvariantBrushTextureSpacing({
      spacingRatio: 0.18,
      brushSizeDocumentPx: 16,
      grainAmount: 0.4,
      zoomScale: 2.5,
    });
    const s400 = resolveZoomInvariantBrushTextureSpacing({
      spacingRatio: 0.18,
      brushSizeDocumentPx: 16,
      grainAmount: 0.4,
      zoomScale: 4,
    });

    expect(s100.spacingDocumentPx).toBeCloseTo(s250.spacingDocumentPx, 8);
    expect(s100.spacingDocumentPx).toBeCloseTo(s400.spacingDocumentPx, 8);
    expect(s250.projectedViewportPx).toBeCloseTo(s100.spacingDocumentPx * 2.5, 8);

    const comparison = evaluateBrushTextureLongStrokeComparison({
      kind: "charcoal",
      brushSizeDocumentPx: 16,
      spacingRatio: 0.18,
      grainAmount: 0.45,
    });
    expect(comparison.zoomDriftMaxDocPx).toBe(0);
    expect(comparison.zoomAlphaDeltaMax).toBe(0);
    expect(comparison.longStrokeDensityCv).toBeLessThan(0.25);
  });

  it("질감이 켜진 브러시에서 과도한 간격(>28%)은 구슬 끊김 방지 상한으로 자동 클램프한다", () => {
    const clamped = resolveZoomInvariantBrushTextureSpacing({
      spacingRatio: 0.65,
      brushSizeDocumentPx: 20,
      grainAmount: 0.5,
      zoomScale: 1,
    });
    expect(clamped.clampedForTextureContinuity).toBe(true);
    expect(clamped.effectiveSpacingRatio).toBe(STUDIO_MAX_CONTINUOUS_GRAIN_SPACING_RATIO);
  });

  it("비교 샘플 카드에서 100% 기준 · 250% 확대 · 긴 획 끝단 탭 전환과 간격 프리셋 변경이 동작한다", () => {
    const onSpacingRatioChange = vi.fn();
    render(
      <StudioBrushTextureSpacingComparisonCard
        brushId="charcoal--mypaint-stamp"
        strokeWidth={14}
        color="#1e293b"
        spacingRatio={0.42}
        grainAmount={0.4}
        onSpacingRatioChange={onSpacingRatioChange}
      />,
    );

    const card = screen.getByRole("region", { name: "브러시 텍스처·간격 비교 샘플" });
    expect(card.textContent).toContain("확대 오차 0.0px");
    expect(card.textContent).toContain("28% 상한으로 자동 보정");

    const tablist = within(card).getByRole("tablist", { name: "텍스처·간격 비교 샘플 배율" });
    fireEvent.click(within(tablist).getByRole("tab", { name: "250% 확대" }));
    expect(within(card).getByRole("img", { name: "250% 확대 브러시 질감 비교 샘플" })).toBeTruthy();

    fireEvent.click(within(tablist).getByRole("tab", { name: "긴 획 끝단" }));
    expect(within(card).getByRole("img", { name: "긴 획 끝단 브러시 질감 비교 샘플" })).toBeTruthy();

    fireEvent.click(within(card).getByRole("button", { name: "촘촘 10%" }));
    expect(onSpacingRatioChange).toHaveBeenCalledWith(0.1);
  });
});
