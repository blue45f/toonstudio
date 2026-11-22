// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CALM_ATELIER_SPECTRAL_TOKENS,
  computeSpectralBlendPreview,
} from "./studio-spectral-blend-preview";
import { StudioSpectralBlendPreviewChip } from "./StudioSpectralBlendPreviewChip";

afterEach(() => {
  cleanup();
});

describe("실시간 7밴드 분광 안료 혼색 프리뷰 계산 및 스와치 칩", () => {
  it("코발트 블루 + 카드뮴 옐로 50:50 혼색 시 일반 sRGB보다 선명한 자연 녹색을 계산한다", () => {
    const preview = computeSpectralBlendPreview({
      foregroundHex: CALM_ATELIER_SPECTRAL_TOKENS.cobaltDemoHex,
      canvasBaseHex: CALM_ATELIER_SPECTRAL_TOKENS.cadmiumYellowDemoHex,
      mixRatio: 0.5,
      wetness: 0.4,
      paperGloss: 0.3,
    });

    // 7밴드 KM 녹색 대역(약 110°~170°) 및 일반 sRGB 대비 확실한 채도 우위 검증
    expect(preview.spectralHueDeg).toBeGreaterThanOrEqual(110);
    expect(preview.spectralHueDeg).toBeLessThanOrEqual(170);
    expect(preview.spectralChroma).toBeGreaterThan(preview.srgbChroma);
    expect(preview.chromaDeltaPct).toBeGreaterThan(20);
    expect(preview.spectralHex).not.toBe(preview.srgbLinearHex);
    expect(preview.spectralBands).toHaveLength(7);
    expect(preview.wavelengthsNm).toEqual([420, 465, 505, 545, 585, 625, 670]);
    expect(preview.summaryKo).toContain("녹색 반사율 보존");
  });

  it("습도와 미세 종이 광택 변화에 따라 표면 프리뷰 색이 반응하며 칩 인터랙션이 44px 터치 타깃을 지킨다", () => {
    const onPickMixedColor = vi.fn();
    render(
      <StudioSpectralBlendPreviewChip
        foregroundHex="#0f47a6"
        canvasBaseHex="#f7d414"
        onPickMixedColor={onPickMixedColor}
      />,
    );

    const chip = document.querySelector<HTMLElement>("[data-studio-spectral-blend-chip]");
    expect(chip).not.toBeNull();
    const initialSpectralHex = chip?.getAttribute("data-spectral-hex");
    expect(initialSpectralHex).toMatch(/^#[0-9a-f]{6}$/u);

    // 팝오버 버튼 접근성 계약: title 속성 금지 및 min-h-11(>= 44px) 준수
    for (const button of screen.getAllByRole("button")) {
      expect(button.hasAttribute("title")).toBe(false);
      expect(button.className).toContain("min-h-11");
    }

    // 물리 혼색 스와치 클릭 시 계산된 7밴드 결과 색 전달
    const pickButton = screen.getByRole("button", { name: /7밴드 물리 혼색/u });
    fireEvent.click(pickButton);
    expect(onPickMixedColor).toHaveBeenCalledWith(initialSpectralHex);

    // 조절 패널을 열어 비율 슬라이더를 바꾸면 혼색 결과가 실시간 갱신된다
    const expandButton = screen.getByRole("button", { name: "습도와 광택 조절 열기" });
    fireEvent.click(expandButton);
    const ratioSlider = screen.getByRole("slider", { name: "바탕 혼색 비율" });
    fireEvent.change(ratioSlider, { target: { value: "80" } });
    expect(chip?.getAttribute("data-spectral-hex")).not.toBe(initialSpectralHex);

    const wetnessSlider = screen.getByRole("slider", { name: "붓 습도" });
    fireEvent.change(wetnessSlider, { target: { value: "75" } });
    const glossSlider = screen.getByRole("slider", { name: "종이 광택" });
    fireEvent.change(glossSlider, { target: { value: "65" } });
    expect(screen.getByText(/습도 75% · 광택 65%/u)).toBeTruthy();
  });
});
