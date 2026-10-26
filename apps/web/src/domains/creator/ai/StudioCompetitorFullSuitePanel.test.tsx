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

    fireEvent.click(screen.getByTestId("competitor-suite-tab-turnaround-orthographic-sheet"));
    expect(screen.getByTestId("suite-panel-turnaround-orthographic-sheet")).toBeTruthy();
    fireEvent.click(screen.getByTestId("append-competitor-suite-line-btn"));
    expect(onAppend).toHaveBeenCalledWith(expect.stringContaining("[360° 5뷰 정투영 턴어라운드]"));

    fireEvent.click(screen.getByTestId("competitor-suite-tab-background-perspective-scale"));
    expect(screen.getByTestId("suite-panel-background-perspective-scale")).toBeTruthy();
    fireEvent.click(screen.getByTestId("append-competitor-suite-line-btn"));
    expect(onAppend).toHaveBeenCalledWith(expect.stringContaining("[3D 배경 투시·발 접지 락]"));

    // Phase 6 20대 웹툰 AI 생태계 확장 워크벤치 6개 탭 확인
    expect(screen.getByTestId("studio-phase6-ecosystem-suite-panel")).toBeTruthy();
    fireEvent.click(screen.getByTestId("phase6-ecosystem-tab-mangaflow-identity-audit"));
    fireEvent.click(screen.getByTestId("phase6-ecosystem-tab-glimnavi-color-hint"));
    fireEvent.click(screen.getByTestId("phase6-ecosystem-tab-snaptoon-acon3d-shader"));
    fireEvent.click(screen.getByTestId("phase6-ecosystem-tab-culturetoon-osmu-adaptation"));
    fireEvent.click(screen.getByTestId("phase6-ecosystem-tab-tooncrafter-krita-stitch"));
  });
});
