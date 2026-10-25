// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StudioPhotoshopFeatureSuitePanel } from "./StudioPhotoshopFeatureSuitePanel";

describe("StudioPhotoshopFeatureSuitePanel", () => {
  it("5개 포토샵 내재화 기능 탭을 전환하며 웹 필터·퀵 액션·레이어 스타일·유동화·BatchPlay를 조작한다", () => {
    const onApplyFilterPreset = vi.fn();
    const onExecuteQuickAction = vi.fn();

    render(
      <StudioPhotoshopFeatureSuitePanel
        onApplyFilterPreset={onApplyFilterPreset}
        onExecuteQuickAction={onExecuteQuickAction}
      />,
    );

    // 1. 기본 탭: 웹 필터 & 슈퍼프리셋
    expect(
      screen.getByRole("tabpanel", { name: "웹 필터 & 슈퍼프리셋 패널" }),
    ).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", { name: "롱 시프트 (Long Shift)" }),
    );
    expect(onApplyFilterPreset).toHaveBeenCalledWith("longShift", "glitch");

    // 2. 퀵 액션 & 조정 V2 탭 전환
    fireEvent.click(screen.getByRole("tab", { name: "퀵 액션 & 조정 V2" }));
    expect(
      screen.getByRole("tabpanel", { name: "퀵 액션 & 조정 V2 패널" }),
    ).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", { name: "배경 흐림 (Blur background)" }),
    );
    expect(onExecuteQuickAction).toHaveBeenCalledWith("blur_background");
    expect(
      screen.getByTestId("quick-action-session-summary").textContent,
    ).toContain("레이어 수: 2");

    fireEvent.click(
      screen.getByRole("button", { name: "마지막 퀵 액션 되돌리기" }),
    );
    expect(
      screen.getByTestId("quick-action-session-summary").textContent,
    ).toContain("레이어 수: 1");

    // 3. 레이어 스타일 & 클리핑 탭 전환
    fireEvent.click(screen.getByRole("tab", { name: "레이어 스타일 & 클리핑" }));
    expect(
      screen.getByTestId("layer-style-summary").textContent,
    ).toContain("layerPaletteClipThumbsToLayer");
    expect(
      screen.getByTestId("layer-style-summary").textContent,
    ).toContain("래스터화 필요: 예");

    // 4. 유동화 & 하모나이즈 탭 전환
    fireEvent.click(screen.getByRole("tab", { name: "유동화 & 하모나이즈" }));
    expect(
      screen.getByTestId("liquify-harmonize-summary").textContent,
    ).toContain("주인공 컷 (Harmonized)");

    // 5. 액션 디스크립터 & 25 블렌드 탭 전환
    fireEvent.click(
      screen.getByRole("tab", { name: "액션 디스크립터 & 25 블렌드" }),
    );
    expect(screen.getByTestId("batchplay-summary").textContent).toContain(
      "vLit",
    );
  });
});
