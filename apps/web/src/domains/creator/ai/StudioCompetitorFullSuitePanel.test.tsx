// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioCompetitorFullSuitePanel } from "./StudioCompetitorFullSuitePanel";

describe("StudioCompetitorFullSuitePanel", () => {
  const sampleAssistInput = {
    genre: "판타지 액션",
    coreConflict: "봉인된 마검의 각성",
    protagonistName: "서진",
    partnerName: "하윤",
    scriptText: "서진: 지금부터 시작이다!",
  };

  it("5대 경쟁사 벤치마크 신기능 탭 전환 및 지시문 원고 추가가 동작한다", () => {
    const onAppend = vi.fn();
    render(
      <StudioCompetitorFullSuitePanel
        assistInput={sampleAssistInput}
        onAppendDirectionLine={onAppend}
      />,
    );

    expect(screen.getByTestId("studio-competitor-full-suite-panel")).toBeTruthy();
    expect(screen.getByTestId("suite-panel-aid-lineart-splitter")).toBeTruthy();

    fireEvent.click(screen.getByTestId("append-competitor-suite-line-btn"));
    expect(onAppend).toHaveBeenCalledWith(expect.stringContaining("[AiD 선화·4레이어 분리]"));

    fireEvent.click(screen.getByTestId("competitor-suite-tab-komiko-style-relighting"));
    expect(screen.getByTestId("suite-panel-komiko-style-relighting")).toBeTruthy();

    fireEvent.click(screen.getByTestId("competitor-suite-tab-skyreels-sakuga-motion"));
    expect(screen.getByTestId("suite-panel-skyreels-sakuga-motion")).toBeTruthy();

    fireEvent.click(screen.getByTestId("competitor-suite-tab-csp5-3d-hand-head-lt"));
    expect(screen.getByTestId("suite-panel-csp5-3d-hand-head-lt")).toBeTruthy();

    fireEvent.click(screen.getByTestId("competitor-suite-tab-katalist-anifusion-lora"));
    expect(screen.getByTestId("suite-panel-katalist-anifusion-lora")).toBeTruthy();
  });
});
