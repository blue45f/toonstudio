// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioStoryThreeViewWorkspace } from "./StudioStoryThreeViewWorkspace";
import {
  createEmptyCutReadinessSlots,
  createStoryLivingSpecState,
  createStoryNode,
  createStoryNodeId,
  enqueuePendingAiProposal,
  recordCanvasContentChange,
} from "./studio-story-living-spec-store";

afterEach(() => {
  cleanup();
});

function buildFixtureState(activeView: "graph" | "directory" | "document" = "graph") {
  const arc = createStoryNode({
    id: createStoryNodeId("ARC", "ARC-01"),
    title: "옥상 대치",
    summary: "1부 클라이맥스",
    order: 0,
  });
  const cut = createStoryNode({
    id: createStoryNodeId("CUT", "EP01-C01"),
    title: "문이 열리는 컷",
    summary: "하진이 문을 밀고 들어선다.",
    parentKey: arc.key,
    order: 1,
    cutSlots: createEmptyCutReadinessSlots({
      location: "학교 옥상",
      timeLighting: "노을 역광",
      actors: ["하진"],
      openQuestions: [
        {
          id: "q-cam",
          slot: "cameraAngleLens",
          question: "이 컷의 카메라 구도를 고르세요.",
          options: ["로우앵글 바스트샷 35mm", "아이레벨 미디엄샷 50mm"],
          aiRecommendedIndex: 0,
        },
      ],
    }),
    dialogueLines: ["드디어 찾았어."],
  });
  let state = createStoryLivingSpecState({
    projectId: "proj-ui",
    activeView,
    nodes: [arc, cut],
    edges: [{ id: "edge-1", fromKey: arc.key, toKey: cut.key, relation: "parent" }],
  });
  state = { ...state, selectedNodeKey: cut.key };
  state = recordCanvasContentChange(state, cut.key, "canvas-hash-drifted");
  state = enqueuePendingAiProposal(state, {
    targetEntityId: cut.key,
    op: "update",
    source: "studio_chat",
    title: "대사 보강",
    rationale: "긴장감 강조",
    proposedSnapshot: { summary: "숨을 고르며 문을 연다." },
  });
  return state;
}

describe("StudioStoryThreeViewWorkspace", () => {
  it("cycles views via Shift+Space and shows blue dot + drift badge", () => {
    const onChangeView = vi.fn();
    const onSelectNode = vi.fn();
    const onOpenProposalGate = vi.fn();

    render(
      <StudioStoryThreeViewWorkspace
        state={buildFixtureState("graph")}
        onChangeView={onChangeView}
        onSelectNode={onSelectNode}
        onOpenProposalGate={onOpenProposalGate}
      />,
    );

    expect(screen.getByTestId("pending-proposal-blue-dot")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("컷 수정됨 1건");

    fireEvent.keyDown(window, { shiftKey: true, code: "Space" });
    expect(onChangeView).toHaveBeenCalledWith("directory");

    fireEvent.click(screen.getByRole("tab", { name: "도큐먼트 뷰" }));
    expect(onChangeView).toHaveBeenCalledWith("document");
  });

  it("renders 9-slot readiness bar, AI-recommended open question, hide toggle, and ignores Shift+Space in input", () => {
    const onChangeView = vi.fn();
    const onSelectNode = vi.fn();
    const onToggleSlotVisibility = vi.fn();
    const onAnswerOpenQuestion = vi.fn();
    const onSyncDrift = vi.fn();

    render(
      <StudioStoryThreeViewWorkspace
        state={buildFixtureState("directory")}
        onChangeView={onChangeView}
        onSelectNode={onSelectNode}
        onToggleSlotVisibility={onToggleSlotVisibility}
        onAnswerOpenQuestion={onAnswerOpenQuestion}
        onSyncDrift={onSyncDrift}
      />,
    );

    expect(screen.getByTestId("cut-readiness-progress-label").textContent).toContain("3/9");
    expect(screen.getByText("AI 추천")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /로우앵글 바스트샷 35mm/u }));
    expect(onAnswerOpenQuestion).toHaveBeenCalledWith("CUT:EP01-C01", "q-cam", 0);

    fireEvent.click(screen.getByRole("button", { name: "장소 슬롯 숨기기" }));
    expect(onToggleSlotVisibility).toHaveBeenCalledWith("CUT:EP01-C01", "location");

    fireEvent.click(screen.getByRole("button", { name: "대본과 다시 맞추기" }));
    expect(onSyncDrift).toHaveBeenCalledWith("CUT:EP01-C01");

    const locationInput = screen.getByLabelText("장소");
    fireEvent.keyDown(locationInput, { shiftKey: true, code: "Space" });
    expect(onChangeView).not.toHaveBeenCalled();
  });

  it("renders document view with dialogue and drift badge", () => {
    render(
      <StudioStoryThreeViewWorkspace
        state={buildFixtureState("document")}
        onChangeView={vi.fn()}
        onSelectNode={vi.fn()}
      />,
    );

    expect(screen.getByText(/드디어 찾았어\./u)).toBeTruthy();
    expect(screen.getByText("준비도 3/9")).toBeTruthy();
  });
});
