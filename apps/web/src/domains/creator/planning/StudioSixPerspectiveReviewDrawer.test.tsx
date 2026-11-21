// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioSixPerspectiveReviewDrawer } from "./StudioSixPerspectiveReviewDrawer";
import {
  createEmptyCutReadinessSlots,
  createStoryLivingSpecState,
  createStoryNode,
  createStoryNodeId,
  runIncrementalSixPerspectiveReview,
  updateCutReadinessSlot,
} from "./studio-story-living-spec-store";

afterEach(() => {
  cleanup();
});

function buildReviewedState() {
  const char = createStoryNode({
    id: createStoryNodeId("CHAR", "CHAR-01"),
    title: "하진",
    summary: "주인공",
    order: 0,
  });
  const cut = createStoryNode({
    id: createStoryNodeId("CUT", "EP01-C01"),
    title: "검수 테스트 컷",
    summary: "복합 검수 항목 보유",
    order: 1,
    cutSlots: createEmptyCutReadinessSlots({
      actors: ["미등록 인물"],
    }),
    rightsAssets: [{ id: "a1", name: "참고 사진", license: "reference-only" }],
    dialogueLines: ["아주 긴 대사입니다. ".repeat(6)],
  });
  let state = createStoryLivingSpecState({
    projectId: "proj-review",
    targetRating: "12+",
    nodes: [char, cut],
  });
  state = runIncrementalSixPerspectiveReview(state);
  return state;
}

describe("StudioSixPerspectiveReviewDrawer", () => {
  it("filters by 6 perspectives and severities, and triages findings", () => {
    const onRun = vi.fn();
    const onTriage = vi.fn();
    const onQuickFix = vi.fn();
    const onJump = vi.fn();

    render(
      <StudioSixPerspectiveReviewDrawer
        state={buildReviewedState()}
        onRunIncrementalReview={onRun}
        onTriageFinding={onTriage}
        onProposeQuickFix={onQuickFix}
        onJumpToNode={onJump}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "증분 재검수" }));
    expect(onRun).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("tab", { name: /권리·Rights BOM/u }));
    expect(screen.getByText(/참고 전용 소재/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "해결 완료" }));
    expect(onTriage).toHaveBeenCalledWith(expect.stringContaining("rights_bom:"), "resolved");

    fireEvent.click(screen.getByRole("tab", { name: /전체 관점/u }));
    fireEvent.click(screen.getByRole("button", { name: /남은 의견 하나씩 보기/u }));
    expect(screen.getByText(/미해결 트리아지 1 \//u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /원문으로 이동/u }));
    expect(onJump).toHaveBeenCalledWith("CUT:EP01-C01");
  });

  it("displays stale warning banner when reviewed node changes", () => {
    let state = buildReviewedState();
    state = updateCutReadinessSlot(state, "CUT:EP01-C01", "keyAction", "고개를 돌림");

    render(
      <StudioSixPerspectiveReviewDrawer
        state={state}
        onRunIncrementalReview={vi.fn()}
        onTriageFinding={vi.fn()}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain("이전 검수 이후 내용이 바뀐 항목");
  });
});
