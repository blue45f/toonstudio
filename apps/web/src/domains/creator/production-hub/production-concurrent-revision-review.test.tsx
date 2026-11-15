// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import {
  archiveStudioReviewSession,
  findLatestActiveStudioReviewSession,
  reconcileConcurrentStudioReviewMutation,
} from "../studio-review-history-store";
import {
  addStudioReviewThread,
  createStudioReviewSession,
  recordStudioReviewDecision,
  resubmitStudioRevision,
  submitStudioReview,
} from "../studio-review-workflow";
import { createProductionDemoProject } from "./production-demo";
import {
  peekProductionDemoSession,
  productionDemoAdapter,
  rebaseProductionDemoTimeline,
  resetProductionDemoSession,
} from "./production-demo-adapter";
import { ProductionGrandAtelierCollabHub } from "./ProductionGrandAtelierCollabHub";
import { ProductionReviewSurface } from "./ProductionReviewSurface";
import {
  decisionsForProductionSubmission,
  policyForProductionSubmission,
} from "./production-review-submission";
import { planProductionSubmissionResubmission } from "./production-submission-resubmit-model";
import type { ProductionClientCommand } from "./production-api";

afterEach(() => {
  cleanup();
  resetProductionDemoSession();
  window.localStorage.clear();
});

describe("Backlog [21] 서로 다른 리비전에서 동시에 검수 상태 변경 · 구버전 승인 분리 및 덮어쓰기 차단", () => {
  it("새 리비전(v18) 재제출 직후 구버전(v14)에서 뒤늦은 승인이 도착해도 v14는 superseded로 남고 최신 v18의 승인(0건)을 덮지 않는다", () => {
    const projectId = "demo-concurrent-review";
    const v14TabASnapshot = submitStudioReview(
      createStudioReviewSession({
        documentId: projectId,
        versionId: "v14-color-fix",
        requiredReviewerIds: ["pd-seojin"],
        createdAt: "2026-11-15T01:00:00.000Z",
      }),
      "2026-11-15T01:01:00.000Z",
    );
    archiveStudioReviewSession(window.localStorage, projectId, v14TabASnapshot);

    // Tab B에서 수정 요청이 등록된 뒤 수정본 v18-resubmit 재제출 (v14-color-fix -> superseded)
    const v14WithChangeReq = addStudioReviewThread(
      v14TabASnapshot,
      {
        id: "req-v14-1",
        kind: "change-request",
        targetId: "cut-01 @ (40%, 50%)",
        status: "open",
        pinCoordinate: { cutId: "cut-01", xPercent: 40, yPercent: 50 },
        resolvedBy: null,
        resolvedAt: null,
        messages: [
          {
            id: "msg-1",
            authorId: "pd-seojin",
            body: "말풍선 간격 조정 필요",
            createdAt: "2026-11-15T01:03:00.000Z",
          },
        ],
      },
      "2026-11-15T01:03:00.000Z",
    );
    const transition = resubmitStudioRevision(v14WithChangeReq, {
      nextVersionId: "v18-resubmit",
      actorId: "lead-writer",
      changedCutIds: ["cut-01"],
      resolveThreadIds: ["req-v14-1"],
      note: "말풍선 간격 수정 반영",
      resubmittedAt: "2026-11-15T01:05:00.000Z",
    });
    archiveStudioReviewSession(window.localStorage, projectId, transition.previous);
    archiveStudioReviewSession(window.localStorage, projectId, transition.next);

    // Tab A(아직 메모리에 구버전 v14TabASnapshot 보유)가 뒤늦게 승인 결정을 기록
    const lateApprovedV14 = recordStudioReviewDecision(v14TabASnapshot, {
      reviewerId: "pd-seojin",
      decision: "approved",
      note: "14차 기준 승인",
      decidedAt: "2026-11-15T01:06:00.000Z",
    });
    expect(lateApprovedV14.status).toBe("approved");

    const reconciled = reconcileConcurrentStudioReviewMutation(
      window.localStorage,
      projectId,
      lateApprovedV14,
    );

    expect(reconciled.outcome).toBe("stale-superseded");
    expect(reconciled.latestHead.versionId).toBe("v18-resubmit");
    expect(reconciled.latestHead.status).toBe("in-review");
    expect(reconciled.latestHead.decisions).toHaveLength(0);

    const v14Stored = reconciled.history.sessions.find((entry) => entry.versionId === "v14-color-fix")!;
    expect(v14Stored.status).toBe("superseded");
    expect(v14Stored.decisions).toHaveLength(1);
    expect(reconciled.history.sessions.at(-1)?.versionId).toBe("v18-resubmit");
    expect(findLatestActiveStudioReviewSession(reconciled.history)?.versionId).toBe("v18-resubmit");
  });

  it("협업 관제실(/production)에서 다른 참여자가 새 리비전을 올린 뒤 구버전 승인을 누르면 구버전 승인 경고 배너와 타임라인 배지를 표시하고 최신본 승인은 0/1로 유지한다", () => {
    const firstHub = render(
      <MemoryRouter initialEntries={["/production"]}>
        <ProductionGrandAtelierCollabHub />
      </MemoryRouter>,
    );
    const secondHub = render(
      <MemoryRouter initialEntries={["/production"]}>
        <ProductionGrandAtelierCollabHub />
      </MemoryRouter>,
    );

    // 두 번째 인스턴스에서 새 수정본(v18-resubmit) 재제출
    const resubmitButtons = screen.getAllByTestId("collab-hub-resubmit-btn");
    fireEvent.click(resubmitButtons[1]!);

    // 첫 번째 인스턴스(여전히 구버전 v14-color-fix를 보고 있음)에서 검수 최종 승인 클릭
    const approveButtons = screen.getAllByTestId("collab-hub-approve-btn");
    fireEvent.click(approveButtons[0]!);

    const staleBannerText = screen.getByTestId("collab-hub-stale-revision-banner").textContent ?? "";
    expect(staleBannerText).toContain("구버전(v14-color-fix) 승인 기록됨");
    expect(staleBannerText).toContain("최신본(v18-resubmit) 승인으로 반영되지 않음");

    // 최신 리비전 승인 집계는 0/1로 보호되고 구버전 타임라인에는 '구버전 승인 · 최신본 승인 아님' 배지가 표시됨
    expect(firstHub.container.textContent).toContain("현재 리비전 승인 0/1");
    expect(
      firstHub.container.querySelector("[data-stale-approval-badge='v14-color-fix']")?.textContent,
    ).toContain("구버전 승인 · 최신본 승인 아님");

    secondHub.unmount();
    firstHub.unmount();
  });

  it("productionDemoAdapter.reduce가 구버전 탭 스냅샷으로 호출되어도 이미 생성된 최신 제출본(r3)을 덮어쓰지 않는다", () => {
    const now = new Date();
    const staleTabSnapshot = rebaseProductionDemoTimeline(createProductionDemoProject(), now);
    let tab2Current = staleTabSnapshot;

    const r2 = tab2Current.submissions.find((entry) => entry.id === "submission-thumbnail-12-r2")!;
    const policy = policyForProductionSubmission(tab2Current, r2)!;
    const deliverable = tab2Current.deliverables.find((entry) => entry.id === r2.deliverableId)!;
    const tResubmit = new Date(now.getTime() + 3_000).toISOString();

    // Tab 2가 r2 수정요청 -> r3 재제출까지 먼저 진행해 demoSession을 전진시킴
    tab2Current = productionDemoAdapter.reduce(tab2Current, {
      type: "upsert-submission",
      submission: { ...r2, status: "changes-requested" },
    });
    const r2Changed = tab2Current.submissions.find((entry) => entry.id === r2.id)!;
    const resubmitPlan = planProductionSubmissionResubmission({
      aggregate: tab2Current,
      previousSubmission: r2Changed,
      changedCutIds: ["cut-12-001"],
      resolveClarificationIds: [],
      resolutionNote: "3차 재제출",
      at: tResubmit,
    });
    for (const step of resubmitPlan.steps) {
      tab2Current = productionDemoAdapter.reduce(tab2Current, step.command);
    }
    expect(peekProductionDemoSession()?.deliverables.find((d) => d.id === deliverable.id)?.currentSubmissionId).toBe(
      "submission-thumbnail-12-r3",
    );

    // Tab 1(구버전 staleTabSnapshot 보유)이 뒤늦게 r2에 대한 승인 결정을 기록
    const tLate = new Date(now.getTime() + 4_000).toISOString();
    const afterLateTab1Decision = productionDemoAdapter.reduce(staleTabSnapshot, {
      type: "record-review-decision",
      policyId: policy.id,
      decision: {
        id: "late-r2-approve",
        reviewRoundId: r2.id,
        lane: "narrative",
        assignmentId: "assignment-story",
        value: "approve",
        reasonCode: "reviewed-against-canonical-intent",
        evidenceScopeRefs: [deliverable.scope],
        conditions: [],
        createdAt: tLate,
      },
    });

    const updatedDeliverable = afterLateTab1Decision.deliverables.find((d) => d.id === deliverable.id)!;
    const r3 = afterLateTab1Decision.submissions.find((s) => s.id === "submission-thumbnail-12-r3")!;
    const r2After = afterLateTab1Decision.submissions.find((s) => s.id === "submission-thumbnail-12-r2")!;

    expect(updatedDeliverable.currentSubmissionId).toBe("submission-thumbnail-12-r3");
    expect(r3.status).toBe("in-review");
    expect(r2After.status).toBe("superseded");
    expect(decisionsForProductionSubmission(afterLateTab1Decision, r3, policy, tLate)).toHaveLength(0);
    expect(decisionsForProductionSubmission(afterLateTab1Decision, r2After, policy, tLate)).toHaveLength(1);
  });

  it("ProductionReviewSurface에서 2차 승인 비동기 요청 중 3차 제출본이 올라오면 녹색 완료 대신 구버전(2차) 승인 배너를 띄우고 3차 상태를 보호한다", async () => {
    const now = new Date();
    const initial = rebaseProductionDemoTimeline(createProductionDemoProject(), now);

    let resolveInFlightStep: (() => void) | null = null;

    function RaceHarness() {
      const [aggregate, setAggregate] = useState(initial);

      const handleConcurrentResubmit = () => {
        setAggregate((prev) => {
          const r2 = prev.submissions.find((entry) => entry.id === "submission-thumbnail-12-r2")!;
          let next = productionDemoAdapter.reduce(prev, {
            type: "upsert-submission",
            submission: { ...r2, status: "changes-requested" },
          });
          const r2Changed = next.submissions.find((entry) => entry.id === r2.id)!;
          const plan = planProductionSubmissionResubmission({
            aggregate: next,
            previousSubmission: r2Changed,
            changedCutIds: ["cut-12-001"],
            resolveClarificationIds: [],
            resolutionNote: "동시 3차 재제출",
            at: new Date(now.getTime() + 5_000).toISOString(),
          });
          for (const step of plan.steps) {
            next = productionDemoAdapter.reduce(next, step.command);
          }
          return next;
        });
      };

      const execute = async (command: ProductionClientCommand) => {
        if (command.type === "record-review-decision") {
          await new Promise<void>((resolve) => {
            resolveInFlightStep = resolve;
          });
        }
        setAggregate((prev) => productionDemoAdapter.reduce(prev, command));
      };

      return (
        <>
          <button
            type="button"
            data-testid="test-trigger-concurrent-resubmit"
            onClick={handleConcurrentResubmit}
          >
            동시 재제출 트리거
          </button>
          <ProductionReviewSurface
            aggregate={aggregate}
            isDemo
            canEdit
            canReview
            roleLens="story"
            execute={execute}
          />
        </>
      );
    }

    render(
      <MemoryRouter
        initialEntries={[
          "/production/projects/sample-project/review?episode=episode-12&cut=cut-12-001&submission=submission-thumbnail-12-r2&revision=thumbnail-episode-12-r2",
        ]}
      >
        <Routes>
          <Route path="/production/projects/:projectId/review" element={<RaceHarness />} />
        </Routes>
      </MemoryRouter>,
    );

    const roleSelect = screen.getByLabelText("내 검수 역할") as HTMLSelectElement;
    fireEvent.change(roleSelect, { target: { value: "assignment-story" } });

    // 1) 서사 담당이 2차 제출본에서 '승인' 클릭 -> record-review-decision 비동기 대기 진입
    fireEvent.click(screen.getAllByRole("button", { name: /^승인$/ })[0]!);
    expect(resolveInFlightStep).not.toBeNull();

    // 2) 응답이 도착하기 전 다른 참여자가 3차 제출본을 재제출 (2차 -> superseded, 현재 제출본 -> 3차)
    fireEvent.click(screen.getByTestId("test-trigger-concurrent-resubmit"));

    // 3) 뒤늦게 2차 승인 요청 완료
    await act(async () => {
      resolveInFlightStep?.();
    });

    await waitFor(() => {
      expect(document.querySelector("[data-review-stale-decision-notice='true']")).not.toBeNull();
    });

    const staleBanner = document.querySelector("[data-review-stale-decision-notice='true']")!;
    expect(staleBanner.textContent).toContain("구버전(2차 제출본) 승인으로 기록됨");
    expect(staleBanner.textContent).toContain("최신본(3차) 승인으로 반영되지 않음");
    expect(document.body.textContent).not.toContain("검수 결정 기록 저장 완료");

    // 4) '최신본(3차) 열기' 클릭 시 최신 3차 제출본은 승인 0건(승인 대기 3개 영역)으로 깨끗하게 유지됨
    fireEvent.click(screen.getAllByRole("button", { name: /최신본\(3차\) 열기/u })[0]!);
    await waitFor(() => {
      expect(
        document.querySelector("[data-production-review-workspace]")?.getAttribute("data-review-submission-id"),
      ).toBe("submission-thumbnail-12-r3");
    });
    expect(document.body.textContent).toContain("승인 대기 3개 영역");
  });
});
