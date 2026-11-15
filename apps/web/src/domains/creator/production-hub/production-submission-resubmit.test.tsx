// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import {
  addStudioReviewThread,
  createStudioReviewSession,
  recordStudioReviewDecision,
  resubmitStudioRevision,
  submitStudioReview,
} from "../studio-review-workflow";
import { createProductionDemoProject } from "./production-demo";
import { productionDemoAdapter, rebaseProductionDemoTimeline, resetProductionDemoSession } from "./production-demo-adapter";
import { deriveEpisodeApprovalGate } from "./production-episode-room-model";
import { ProductionGrandAtelierCollabHub } from "./ProductionGrandAtelierCollabHub";
import { ProductionReviewSurface } from "./ProductionReviewSurface";
import { decisionsForProductionSubmission, planProductionSubmissionReview, policyForProductionSubmission } from "./production-review-submission";
import {
  deriveSubmissionResubmissionSummary,
  planProductionSubmissionResubmission,
} from "./production-submission-resubmit-model";

afterEach(() => {
  cleanup();
  resetProductionDemoSession();
  window.localStorage.clear();
});

describe("Backlog [20] 수정요청 처리 후 재제출 · 기존 승인 미승계 검증", () => {
  it("이전 리비전(2차)의 부분 승인이 있어도 3차 재제출 시 변경 컷·해결/미해결·다음 담당자를 구분하고 승인 0건으로 초기화한다", () => {
    const now = new Date();
    let current = rebaseProductionDemoTimeline(createProductionDemoProject(), now);
    const r2 = current.submissions.find((entry) => entry.id === "submission-thumbnail-12-r2")!;
    const policy = policyForProductionSubmission(current, r2)!;
    const deliverable = current.deliverables.find((entry) => entry.id === r2.deliverableId)!;
    const t1 = new Date(now.getTime() + 1_000).toISOString();

    // 1) 서사 담당(강민서)이 2차 제출본을 먼저 승인
    for (const step of planProductionSubmissionReview(
      current,
      r2,
      policy,
      {
        id: "dec-story-r2",
        reviewRoundId: r2.id,
        lane: "narrative",
        assignmentId: "assignment-story",
        value: "approve",
        reasonCode: "reviewed-against-canonical-intent",
        evidenceScopeRefs: [deliverable.scope],
        conditions: [],
        createdAt: t1,
      },
      t1,
    )) {
      current = productionDemoAdapter.reduce(current, step.command);
    }

    // 2) 시각 연출 담당(윤하림)이 2차 제출본에 수정 요청
    const t2 = new Date(now.getTime() + 2_000).toISOString();
    const r2AfterStory = current.submissions.find((entry) => entry.id === r2.id)!;
    for (const step of planProductionSubmissionReview(
      current,
      r2AfterStory,
      policy,
      {
        id: "dec-art-r2",
        reviewRoundId: r2.id,
        lane: "visual-direction",
        assignmentId: "assignment-art",
        value: "request-changes",
        reasonCode: "revision-required",
        evidenceScopeRefs: [deliverable.scope],
        conditions: ["봉투 문양 가림 보강 필요"],
        createdAt: t2,
      },
      t2,
    )) {
      current = productionDemoAdapter.reduce(current, step.command);
    }

    const r2ChangesRequested = current.submissions.find((entry) => entry.id === r2.id)!;
    expect(r2ChangesRequested.status).toBe("changes-requested");

    // 3) 차단 인계 질문 1건을 해결 처리하고 cut-12-001만 변경해 3차 제출본으로 재제출
    const t3 = new Date(now.getTime() + 5_000).toISOString();
    const resubmitPlan = planProductionSubmissionResubmission({
      aggregate: current,
      previousSubmission: r2ChangesRequested,
      changedCutIds: ["cut-12-001"],
      resolveClarificationIds: ["clarification-envelope-angle"],
      resolutionNote: "cut-12-001 봉투 뒷면 문양 실루엣 가림 처리",
      at: t3,
    });
    for (const step of resubmitPlan.steps) {
      current = productionDemoAdapter.reduce(current, step.command);
    }

    const r2Superseded = current.submissions.find((entry) => entry.id === r2.id)!;
    const r3 = current.submissions.find((entry) => entry.id === "submission-thumbnail-12-r3")!;
    const updatedDeliverable = current.deliverables.find((entry) => entry.id === deliverable.id)!;

    expect(r2Superseded.status).toBe("superseded");
    expect(r3.status).toBe("in-review");
    expect(updatedDeliverable.currentSubmissionId).toBe(r3.id);
    expect(updatedDeliverable.approvedSubmissionId).toBeNull();

    // 4) 새 리비전(3차)의 현재 결정은 0건이며 회차 승인 게이트도 이전 라운드 승인을 승계하지 않는다
    const r3Decisions = decisionsForProductionSubmission(current, r3, policy, t3);
    expect(r3Decisions).toHaveLength(0);

    const episodeGate = deriveEpisodeApprovalGate(current, "episode-12");
    expect(episodeGate.approved).toBe(false);
    expect(episodeGate.lanes.every((lane) => lane.approved === false)).toBe(true);

    // 5) 재제출 브리핑 요약에서 변경 컷 / 해결·미해결 / 다음 담당자 / 이전 승인 미승계가 정확히 구분된다
    const cuts = current.cutPlans.filter((cut) => cut.episodeId === "episode-12");
    const summary = deriveSubmissionResubmissionSummary({
      aggregate: current,
      submission: r3,
      policy,
      currentDecisions: r3Decisions,
      cuts,
      episodeId: "episode-12",
      partyLabelForAssignment: (id) => id,
      roleLabelForAssignment: (id) => id,
    })!;
    expect(summary.isResubmitted).toBe(true);
    expect(summary.previousRevisionNumber).toBe(2);
    expect(summary.changedCutIds).toEqual(["cut-12-001"]);
    expect(summary.unchangedCutIds).toContain("cut-12-002");
    expect(summary.resolvedRequests.some((item) => item.id === "clarification-envelope-angle")).toBe(true);
    expect(summary.openRequests.some((item) => item.id === "change-ending-dialogue-12")).toBe(true);
    expect(summary.priorApprovedReviewers.map((item) => item.assignmentId)).toEqual(["assignment-story"]);
    expect(summary.nextReviewers.every((item) => item.approvedInCurrentRevision === false)).toBe(true);
    expect(summary.nextReviewers).toHaveLength(3);
  });

  it("resubmitStudioRevision: 다중 검수자 중 일부 승인 후 수정 요청되어 재제출하면 decisions가 비워지고 메타데이터로만 이전 승인이 기록된다", () => {
    let v1 = createStudioReviewSession({
      documentId: "doc-ep12",
      versionId: "v1",
      requiredReviewerIds: ["project-owner", "demo-reviewer-pd"],
      createdAt: "2026-11-15T01:00:00.000Z",
    });
    v1 = submitStudioReview(v1, "2026-11-15T01:05:00.000Z");
    v1 = recordStudioReviewDecision(v1, {
      reviewerId: "project-owner",
      decision: "approved",
      note: "1차 연출 통과",
      decidedAt: "2026-11-15T01:10:00.000Z",
    });
    v1 = addStudioReviewThread(
      v1,
      {
        id: "req-1",
        kind: "change-request",
        targetId: "cut-01 @ (40%, 50%)",
        status: "open",
        pinCoordinate: { cutId: "cut-01", xPercent: 40, yPercent: 50 },
        resolvedBy: null,
        resolvedAt: null,
        messages: [{ id: "m1", authorId: "demo-reviewer-pd", body: "조명 보강", createdAt: "2026-11-15T01:12:00.000Z" }],
      },
      "2026-11-15T01:12:00.000Z",
    );
    v1 = addStudioReviewThread(
      v1,
      {
        id: "req-2",
        kind: "change-request",
        targetId: "cut-03 @ (20%, 30%)",
        status: "open",
        pinCoordinate: { cutId: "cut-03", xPercent: 20, yPercent: 30 },
        resolvedBy: null,
        resolvedAt: null,
        messages: [{ id: "m2", authorId: "demo-reviewer-pd", body: "효과음 위치 재검토", createdAt: "2026-11-15T01:13:00.000Z" }],
      },
      "2026-11-15T01:13:00.000Z",
    );

    const transition = resubmitStudioRevision(v1, {
      nextVersionId: "v2",
      actorId: "project-owner",
      changedCutIds: ["cut-01"],
      resolveThreadIds: ["req-1"],
      note: "cut-01 조명 먼저 반영 후 재제출",
      resubmittedAt: "2026-11-15T02:00:00.000Z",
    });

    expect(transition.previous.status).toBe("superseded");
    expect(transition.previous.decisions).toHaveLength(1);
    expect(transition.next.status).toBe("in-review");
    expect(transition.next.decisions).toHaveLength(0);
    expect(transition.next.approvedAt).toBeNull();
    expect(transition.next.resubmissionMeta).toMatchObject({
      previousVersionId: "v1",
      previousApprovedReviewerIds: ["project-owner"],
      changedCutIds: ["cut-01"],
      resolvedThreadIds: ["req-1"],
      openThreadIds: ["req-2"],
      nextReviewerIds: ["project-owner", "demo-reviewer-pd"],
    });
  });

  it("ProductionReviewWorkspace 화면에서 수정 요청 후 3차 수정본 재제출 시 브리핑 배너와 승인 0건 초기화가 표시된다", async () => {
    function StatefulHarness() {
      const [agg, setAgg] = useState(() => rebaseProductionDemoTimeline(createProductionDemoProject(), new Date()));
      return (
        <ProductionReviewSurface
          aggregate={agg}
          isDemo
          canEdit
          canReview
          roleLens="story"
          execute={async (cmd) => {
            setAgg((prev) => productionDemoAdapter.reduce(prev, cmd));
          }}
        />
      );
    }

    render(
      <MemoryRouter initialEntries={["/production/projects/sample-project/review?episode=episode-12&cut=cut-12-001&submission=submission-thumbnail-12-r2&revision=thumbnail-episode-12-r2"]}>
        <Routes>
          <Route path="/production/projects/:projectId/review" element={<StatefulHarness />} />
        </Routes>
      </MemoryRouter>,
    );

    // 1) 서사(강민서) 승인 기록 후 그림(윤하림)으로 전환해 수정 요청
    const roleSelect = screen.getByLabelText("내 검수 역할") as HTMLSelectElement;
    fireEvent.change(roleSelect, { target: { value: "assignment-story" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^승인$/ })[0]!);

    await waitFor(() => {
      expect(screen.getAllByRole("status").some((el) => el.textContent?.includes("저장 완료"))).toBe(true);
    });

    fireEvent.change(roleSelect, { target: { value: "assignment-art" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^수정$/ })[0]!);

    // 2) 재제출 컴포저 노출 확인 및 3차 수정본 재제출 실행
    await waitFor(() => {
      expect(document.querySelector("[data-review-resubmit-composer='true']")).toBeTruthy();
    });
    expect(document.querySelector("[data-review-resubmit-composer='true']")!.textContent).toContain("강민서");

    fireEvent.click(document.querySelector("[data-review-resubmit-btn='true']")!);

    // 3) 3차 제출본으로 전환되고 브리핑 요약 및 승인 대기 3개 영역(기존 승인 미승계) 확인
    await waitFor(() => {
      expect(document.querySelector("[data-review-resubmission-summary='true']")).toBeTruthy();
    });
    const workspace = document.querySelector("[data-production-review-workspace]")!;
    expect(workspace.getAttribute("data-review-submission-id")).toBe("submission-thumbnail-12-r3");
    expect(workspace.getAttribute("data-review-revision-id")).toBe("thumbnail-episode-12-r3");
    expect(workspace.textContent).toContain("승인 대기 3개 영역");
    expect(document.querySelector("[data-resubmit-prior-approval-reset='true']")!.textContent).toContain("이전 2차 승인 1건 미승계");
  });

  it("ProductionGrandAtelierCollabHub에서 수정 반영 후 새 리비전 재제출 시 브리핑과 승인 0/1 집계가 표시된다", () => {
    render(
      <MemoryRouter initialEntries={["/production"]}>
        <ProductionGrandAtelierCollabHub />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("collab-hub-resubmit-composer")).toBeTruthy();
    fireEvent.click(screen.getByTestId("collab-hub-resubmit-btn"));

    expect(screen.getByTestId("collab-hub-resubmission-summary")).toBeTruthy();
    expect(screen.getByTestId("collab-hub-approval-tally").textContent).toContain("0/1");
  });
});
