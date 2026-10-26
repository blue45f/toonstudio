// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioAiCharacterConsistencyPanel } from "./StudioAiCharacterConsistencyPanel";

afterEach(cleanup);

// 패널 제목 옆의 AI 연결 상태 배지도 role="status" 라서, 패널 자신의 안내(배지가 아닌 쪽)만 가려 읽는다.
function panelStatus(): HTMLElement {
  const found = screen
    .getAllByRole("status")
    .filter((node) => !node.hasAttribute("data-studio-ai-connection-status"));
  expect(found).toHaveLength(1);
  return found[0]!;
}

describe("StudioAiCharacterConsistencyPanel", () => {
  it("offers a 44px reference-selection CTA and delegates selection-mode entry", () => {
    const onRequestSelectReference = vi.fn();
    render(
      <StudioAiCharacterConsistencyPanel
        configured
        hasReference={false}
        referenceThumbnail={null}
        prompt=""
        onPromptChange={vi.fn()}
        busy={false}
        error={null}
        onGenerate={vi.fn()}
        onRequestSelectReference={onRequestSelectReference}
      />,
    );

    const recovery = screen.getByRole("button", { name: "기준 이미지 선택하기" });
    expect(recovery.className).toContain("min-h-11");
    expect(panelStatus().textContent).toContain(
      "캐릭터 이미지를 먼저 선택하세요",
    );
    expect(screen.getByText(/Esc를 누르면 선택을 취소/)).toBeTruthy();

    fireEvent.click(recovery);
    expect(onRequestSelectReference).toHaveBeenCalledOnce();
  });

  it("removes the recovery CTA after a reference becomes available", () => {
    render(
      <StudioAiCharacterConsistencyPanel
        configured
        hasReference
        referenceThumbnail="data:image/png;base64,AA=="
        prompt="장면"
        onPromptChange={vi.fn()}
        busy={false}
        error={null}
        onGenerate={vi.fn()}
        onRequestSelectReference={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "기준 이미지 선택하기" })).toBeNull();
    expect(screen.getByAltText("기준 캐릭터 미리보기")).toBeTruthy();
    expect(screen.getByRole("button", { name: "같은 캐릭터로 생성" })).toBeTruthy();
  });

  it("synthesizes and injects 7-layer Webtoon Consistency DNA lock tags and multi-angle presets into prompt", () => {
    const onPromptChange = vi.fn();
    render(
      <StudioAiCharacterConsistencyPanel
        configured
        hasReference
        referenceThumbnail="data:image/png;base64,AA=="
        prompt="빗속에서 검을 뽑는 서진"
        onPromptChange={onPromptChange}
        busy={false}
        error={null}
        onGenerate={vi.fn()}
        onRequestSelectReference={vi.fn()}
      />,
    );

    expect(screen.getByTestId("webtoon-consistency-7layer-guard")).toBeTruthy();
    expect(screen.getByTestId("consistency-guardrail-score-badge").textContent).toContain("62점");

    // 부상 누적 락 추가 활성화 + 로우앵글 선택
    fireEvent.click(screen.getByTestId("consistency-lock-toggle-cumulative-wound-state"));
    expect(screen.getByTestId("consistency-guardrail-score-badge").textContent).toContain("74점");

    fireEvent.click(screen.getByTestId("consistency-angle-low-angle-hero"));
    fireEvent.click(screen.getByTestId("inject-consistency-dna-prompt-btn"));

    expect(onPromptChange).toHaveBeenCalledOnce();
    const injectedPrompt = onPromptChange.mock.calls[0]?.[0] as string;
    expect(injectedPrompt).toContain("빗속에서 검을 뽑는 서진");
    expect(injectedPrompt).toContain("지면 로우앵글(24mm 광각) 각성 구도");
    expect(injectedPrompt).toContain("비대칭 흉터·장신구·검집 미러링 절대 금지");
    expect(injectedPrompt).toContain("의상 찢김·혈흔·땀방울 상태 초기화 금지");
  });
});
