// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCompositionGenerationBriefPanel } from "./StudioCompositionGenerationBriefPanel";
import type { CompositionGenerationSnapshot } from "./studio-composition-generation-brief";

const SNAPSHOT: CompositionGenerationSnapshot = Object.freeze({
  characterId: "char-hero-01",
  characterName: "주인공",
  camera: Object.freeze({
    fovDegrees: 35,
    azimuthDegrees: 30,
    elevationDegrees: 0,
    framing: "upper-body" as const,
  }),
});

afterEach(cleanup);

describe("StudioCompositionGenerationBriefPanel (E2 연결 전 + 로컬 폴백)", () => {
  it("제공자가 없으면 '연결 전'을 명시하고 생성 버튼을 만들지 않는다", () => {
    render(
      <StudioCompositionGenerationBriefPanel
        snapshot={SNAPSHOT}
        onInsertCaptureFallback={() => {}}
      />,
    );
    const panel = screen.getByTestId("composition-brief-panel");
    expect(
      panel.querySelector('[data-studio-ai-connection-status="not-connected"]'),
    ).not.toBeNull();
    expect(screen.getByTestId("composition-brief-provider-pending")).toBeTruthy();
    expect(screen.getByTestId("composition-brief-local-fallback")).toBeTruthy();
    // 없는 생성을 있는 척하지 않는다 — 생성 버튼 자체가 없다.
    expect(screen.queryByText("이 구도로 생성하기")).toBeNull();
    // 로컬 폴백(브리프)은 실제로 조립돼 보인다.
    expect(screen.getByTestId("composition-brief-text").textContent).toContain("주인공");
  });

  it("브리프는 본문 글꼴로 줄바꿈되고 내부 작업 코드를 드러내지 않는다 (B-08)", () => {
    render(
      <StudioCompositionGenerationBriefPanel
        snapshot={SNAPSHOT}
        onInsertCaptureFallback={() => {}}
      />,
    );
    const panel = screen.getByTestId("composition-brief-panel");
    expect(panel.querySelector("pre")).toBeNull();
    const brief = screen.getByTestId("composition-brief-text");
    expect(brief.className).toContain("whitespace-pre-line");
    expect(brief.className).toContain("break-words");
    expect(brief.className).not.toContain("font-mono");
    expect(panel.textContent).not.toMatch(/E3|보류|three-quarter/u);
    expect(brief.textContent).toContain("오른쪽 3/4 앞모습");
  });

  it("로컬 폴백 버튼(캡처 그대로 넣기)이 실제로 동작한다", () => {
    const onInsert = vi.fn();
    render(
      <StudioCompositionGenerationBriefPanel
        snapshot={SNAPSHOT}
        onInsertCaptureFallback={onInsert}
      />,
    );
    fireEvent.click(screen.getByText("캡처 그대로 넣기"));
    expect(onInsert).toHaveBeenCalledTimes(1);
  });

  it("제공자가 주입되면 실행 가능 배지와 생성 버튼이 나타난다", () => {
    const onGenerate = vi.fn();
    render(
      <StudioCompositionGenerationBriefPanel
        snapshot={SNAPSHOT}
        onInsertCaptureFallback={() => {}}
        onRequestGeneration={onGenerate}
      />,
    );
    const panel = screen.getByTestId("composition-brief-panel");
    expect(
      panel.querySelector('[data-studio-ai-connection-status="provider-ready"]'),
    ).not.toBeNull();
    fireEvent.click(screen.getByText("이 구도로 생성하기"));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it("스냅샷이 없으면 빈 상태에도 연결 전 배지가 붙는다", () => {
    render(
      <StudioCompositionGenerationBriefPanel
        snapshot={null}
        onInsertCaptureFallback={() => {}}
      />,
    );
    expect(screen.getByTestId("composition-brief-empty")).toBeTruthy();
    expect(
      screen
        .getByTestId("composition-brief-panel")
        .querySelector('[data-studio-ai-connection-status="not-connected"]'),
    ).not.toBeNull();
  });
});
