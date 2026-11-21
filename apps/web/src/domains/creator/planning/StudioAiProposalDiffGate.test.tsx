// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioAiProposalDiffGate } from "./StudioAiProposalDiffGate";
import {
  createStoryLivingSpecState,
  createStoryNode,
  createStoryNodeId,
  editAndApproveAiProposal,
  enqueuePendingAiProposal,
} from "./studio-story-living-spec-store";

afterEach(() => {
  cleanup();
});

function buildProposalState() {
  const cut = createStoryNode({
    id: createStoryNodeId("CUT", "EP01-C01"),
    title: "원래 컷 제목",
    summary: "원래 요약",
    order: 0,
  });
  let state = createStoryLivingSpecState({ projectId: "proj-gate", nodes: [cut] });
  state = enqueuePendingAiProposal(state, {
    id: "prop-a",
    targetEntityId: cut.key,
    op: "update",
    source: "studio_chat",
    title: "컷 제목과 요약 다듬기",
    rationale: "시선 집중을 높이는 제안",
    proposedSnapshot: { title: "AI 제안 컷 제목", summary: "AI 제안 요약" },
    evidenceCitations: [{ sourceDocId: "note-1", quote: "PD: 첫 컷 인상을 더 강하게" }],
  });
  return state;
}

describe("StudioAiProposalDiffGate", () => {
  it("renders diff rows, citations, and invokes approve / edit-then-approve / reject", () => {
    const onApprove = vi.fn();
    const onEditAndApprove = vi.fn();
    const onReject = vi.fn();

    render(
      <StudioAiProposalDiffGate
        state={buildProposalState()}
        onApprove={onApprove}
        onEditAndApprove={onEditAndApprove}
        onReject={onReject}
      />,
    );

    expect(screen.getByTestId("diff-gate-pending-dot")).toBeTruthy();
    expect(screen.getByText("원래 컷 제목")).toBeTruthy();
    expect(screen.getByText("AI 제안 컷 제목")).toBeTruthy();
    expect(screen.getByText(/PD: 첫 컷 인상을 더 강하게/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    expect(onApprove).toHaveBeenCalledWith("prop-a");

    fireEvent.click(screen.getByRole("button", { name: "거절" }));
    expect(onReject).toHaveBeenCalledWith("prop-a");

    fireEvent.click(screen.getByRole("button", { name: "직접 고쳐서 승인" }));
    fireEvent.change(screen.getByLabelText("수정할 제목"), {
      target: { value: "작가가 손본 제목" },
    });
    fireEvent.click(screen.getByRole("button", { name: "수정한 내용으로 승인" }));
    expect(onEditAndApprove).toHaveBeenCalledWith(
      "prop-a",
      expect.objectContaining({ title: "작가가 손본 제목" }),
    );
  });

  it("shows '내가 고친 내용' badge for edited approvals and extracts meeting decisions", () => {
    let state = buildProposalState();
    state = editAndApproveAiProposal(state, "prop-a", { title: "작가가 고친 제목" });
    const onConvert = vi.fn();

    render(
      <StudioAiProposalDiffGate
        state={state}
        onApprove={vi.fn()}
        onEditAndApprove={vi.fn()}
        onReject={vi.fn()}
        onConvertMeetingDecisions={onConvert}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "승인됨" }));
    expect(screen.getByTestId("proposal-user-edited-prop-a").textContent).toBe("내가 고친 내용");

    fireEvent.change(screen.getByLabelText(/회의 메모를 붙여 넣으면/u), {
      target: { value: "[확정] PD: EP01-C01 역광 강화\n[미정] 어시: 소품 보류" },
    });
    fireEvent.click(screen.getByRole("button", { name: "결정 추출하기" }));
    fireEvent.click(screen.getByRole("button", { name: "확정 항목을 제안 큐로 보내기" }));
    expect(onConvert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ status: "confirmed" })]),
    );
  });
});
