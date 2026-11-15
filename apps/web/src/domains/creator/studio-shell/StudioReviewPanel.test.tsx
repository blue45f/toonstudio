// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createInitialStudioProjectDiagnosticSource } from "../studio-project-diagnostic-source-defaults";
import { SYNTHETIC_STUDIO_REVIEW_PERSONAS } from "../studio-review-workflow";
import type { StudioProjectWorkspaceState } from "../studio-project-workspace-store";
import { StudioReviewPanel } from "./StudioReviewPanel";
import { useStudioProjectWorkspace } from "./useStudioProjectWorkspace";

vi.mock("./useStudioProjectWorkspace", () => ({
  useStudioProjectWorkspace: vi.fn(),
}));

const workspaceHookMock = vi.mocked(useStudioProjectWorkspace);

function workspaceState(openChangeRequest: boolean): StudioProjectWorkspaceState {
  const initial = createInitialStudioProjectDiagnosticSource(
    "project-12",
    "2026-09-11T03:00:00.000Z",
  );
  return {
    ...initial,
    reviewSession: {
      ...initial.reviewSession,
      documentId: "document-1",
      versionId: "version-1",
      status: openChangeRequest ? "changes-requested" : "in-review",
      requiredReviewerIds: ["project-owner"],
      threads: openChangeRequest ? [{
        id: "thread-1",
        kind: "change-request",
        targetId: "cut-34",
        status: "open",
        messages: [{
          id: "message-1",
          authorId: "reviewer-1",
          body: "표정을 다시 확인해 주세요.",
          createdAt: "2026-09-11T03:00:00.000Z",
        }],
        resolvedBy: null,
        resolvedAt: null,
      }] : [],
      decisions: [],
      updatedAt: "2026-09-11T03:00:00.000Z",
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
  workspaceHookMock.mockReset();
});

afterEach(cleanup);

describe("StudioReviewPanel approval eligibility", () => {
  it("allows the current reviewer to approve before the final readiness state exists", () => {
    workspaceHookMock.mockReturnValue({
      state: workspaceState(false),
      error: null,
      update: vi.fn(),
      reload: vi.fn(),
    });

    render(<StudioReviewPanel projectId="project-12" locale="ko" />);

    expect((screen.getByRole("button", { name: "승인" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("blocks approval while a change request remains open", () => {
    workspaceHookMock.mockReturnValue({
      state: workspaceState(true),
      error: null,
      update: vi.fn(),
      reload: vi.fn(),
    });

    render(<StudioReviewPanel projectId="project-12" locale="ko" />);

    expect((screen.getByRole("button", { name: "승인" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/열린 수정 요청 1개/u)).toBeTruthy();
  });

  it("supports cut + coordinate pinned comments, resolve/reopen, role guards, and history snapshot restore with synthetic personas only", () => {
    for (const persona of SYNTHETIC_STUDIO_REVIEW_PERSONAS) {
      expect(persona.actorId).not.toContain("@");
      expect(persona.labelKo).toContain("데모");
    }

    function StatefulReviewHarness() {
      const [state, setState] = useState<StudioProjectWorkspaceState>(() => workspaceState(false));
      workspaceHookMock.mockReturnValue({
        state,
        error: null,
        update: (updater) => {
          let nextState: StudioProjectWorkspaceState | null = null;
          setState((prev) => {
            nextState = updater(prev, {
              projectId: "project-12",
              updatedAt: "2026-11-14T10:00:00.000Z",
            });
            return nextState;
          });
          return nextState;
        },
        reload: vi.fn(),
      });
      return <StudioReviewPanel projectId="project-12" locale="ko" />;
    }

    render(<StatefulReviewHarness />);

    // 1. 컷 02 선택 및 정확한 (35%, 72%) 좌표 지정 후 댓글 추가
    fireEvent.click(screen.getByTestId("review-cut-tab-cut-02"));
    fireEvent.change(screen.getByLabelText("핀 가로 좌표 X 퍼센트"), { target: { value: "35" } });
    fireEvent.change(screen.getByLabelText("핀 세로 좌표 Y 퍼센트"), { target: { value: "72" } });
    expect(screen.getByTestId("review-active-pin-readout").textContent).toBe("cut-02 @ (35%, 72%)");

    fireEvent.change(screen.getByLabelText("검토 내용"), {
      target: { value: "주인공 말풍선 꼬리가 눈동자를 가리지 않게 내려 주세요." },
    });
    fireEvent.click(screen.getByTestId("review-add-thread-btn"));
    expect(screen.getByText("주인공 말풍선 꼬리가 눈동자를 가리지 않게 내려 주세요.")).toBeTruthy();

    // 2. 현재 상태(댓글 1건 열림)를 스냅샷 보관함에 저장
    fireEvent.click(screen.getByTestId("review-save-checkpoint-btn"));
    expect(screen.getByTestId("review-history-item-version-1-ckpt-1")).toBeTruthy();

    // 3. 댓글 해결 완료 -> 해결됨 필터 확인 -> 다시 열기
    const resolveBtn = screen.getByRole("button", { name: "해결 완료" });
    fireEvent.click(resolveBtn);
    fireEvent.click(screen.getByTestId("review-filter-open"));
    expect(screen.getByText("조건에 맞는 검토 내용이 없습니다.")).toBeTruthy();

    fireEvent.click(screen.getByTestId("review-filter-resolved"));
    const reopenBtn = screen.getByRole("button", { name: "다시 열기" });
    fireEvent.click(reopenBtn);
    fireEvent.click(screen.getByTestId("review-filter-all"));

    // 4. 다시 해결 완료한 뒤, 스냅샷 복구(이 시점으로 복구)로 원래 열림 상태를 되돌림
    fireEvent.click(screen.getByRole("button", { name: "해결 완료" }));
    fireEvent.click(screen.getByTestId("review-restore-btn-version-1-ckpt-1"));
    expect(screen.getByRole("button", { name: "해결 완료" })).toBeTruthy();

    // 5. 역할별 보기/편집 가드 확인 (검수자는 스냅샷 복구 잠김, 열람자는 댓글 추가까지 잠김)
    fireEvent.click(screen.getByTestId("review-role-reviewer"));
    expect((screen.getByTestId("review-add-thread-btn") as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByTestId("review-save-checkpoint-btn") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByTestId("review-restore-btn-version-1-ckpt-1") as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId("review-role-viewer"));
    expect((screen.getByTestId("review-add-thread-btn") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "승인" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
