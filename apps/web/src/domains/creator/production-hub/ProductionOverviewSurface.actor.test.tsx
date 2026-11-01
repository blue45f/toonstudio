// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProductionProjectAggregate, episodeScope, type ProductionProjectAggregate } from "@toonstudio/core/production";
import { useApp } from "@/shared/lib/store";
import { ProductionOverviewSurface } from "./ProductionOverviewSurface";
import type { ProductionSurfaceProps } from "./production-surface-props";

// 별도 원고 입력 조회 도구만 제외한다. Overview → Management → StudioRevisionWorkspace는 실제 컴포넌트다.
vi.mock("./ProductionStudioRevisionBridgePanel", () => ({ ProductionStudioRevisionBridgePanel: () => null }));

const PROJECT_ID = "actor-link-project";
const WORK_ID = "actor-link-work";
const ACTOR_ID = "linked-producer-user";
const ACTOR_PARTY_ID = "party-linked-producer";
const ACTOR_ASSIGNMENT_ID = `assignment:${ACTOR_PARTY_ID}:producer`;
const EPISODE_ID = "episode-one";
const AT = "2026-10-29T00:00:00.000Z";

afterEach(() => { cleanup(); useApp.setState({ userId: null }); });

function actorLinkFixture(): ProductionProjectAggregate {
  const base = createProductionProjectAggregate({ projectId: PROJECT_ID, workId: WORK_ID,
    title: "연결 계정 원고 귀속 회귀", collaborationModel: "studio-production", ownerPartyId: ACTOR_PARTY_ID,
    ownerUserId: ACTOR_ID, ownerDisplayName: "연결된 제작 담당자", at: AT });
  const actorParty = base.parties[0], actorAssignment = base.assignments[0];
  if (!actorParty || !actorAssignment) throw new Error("연결된 계정의 기본 역할이 없습니다.");
  const revisionRef = { id: "saved-thumbnail-revision", lineage: "visual" as const, revision: 1,
    digest: `sha256:${"a".repeat(64)}`, createdAt: AT };
  return { ...base,
    // 같은 역할의 다른 계정을 앞에 두고 연결되지 않은 party도 남겨 actor 일치 여부를 검증한다.
    parties: [{ ...actorParty, id: "party-other-producer", accountUserId: "other-linked-user", publicDisplayName: "다른 제작 담당자" },
      actorParty, { ...actorParty, id: "party-unlinked", accountUserId: null, publicDisplayName: "미연결 외부 담당자" }],
    assignments: [{ ...actorAssignment, id: "assignment-other-producer", partyId: "party-other-producer" },
      actorAssignment, { ...actorAssignment, id: "assignment-unlinked", partyId: "party-unlinked" }],
    episodes: [{ id: "episode-collaboration-one", projectId: PROJECT_ID, episodeId: EPISODE_ID, revision: 1,
      state: "thumbnailing", narrativeRevisionRef: null, visualRevisionRef: null, integratedRevisionRef: null,
      activeHandoffId: null, openBlockerCount: 0, storyLockApproved: false, thumbnailLockApproved: false,
      jointProofApproved: false, creditPreflightPassed: false, publicationPreflightPassed: false, updatedAt: AT }],
    deliverables: [{ id: "deliverable-thumbnail", projectId: PROJECT_ID, scope: episodeScope(PROJECT_ID, EPISODE_ID),
      type: "thumbnail", expectedFormat: "image/png", completionCriteria: ["고정된 콘티를 확인한다"],
      currentSubmissionId: "submission-thumbnail", approvedSubmissionId: null }],
    submissions: [{ id: "submission-thumbnail", projectId: PROJECT_ID, deliverableId: "deliverable-thumbnail", revisionRef,
      submittedByAssignmentId: ACTOR_ASSIGNMENT_ID, submittedAt: AT, status: "submitted",
      inputRevisionRefs: [{ id: "approved-story-input", lineage: "narrative", revision: 1,
        digest: `sha256:${"b".repeat(64)}`, createdAt: AT }], evidenceRefs: [] }],
  };
}

async function openActualOverview(actorId: string | null) {
  useApp.setState({ userId: actorId });
  const aggregate = actorLinkFixture();
  const execute = vi.fn<ProductionSurfaceProps["execute"]>().mockResolvedValue(undefined);
  render(<MemoryRouter initialEntries={[`/production/projects/${PROJECT_ID}/overview`]}>
    <ProductionOverviewSurface aggregate={aggregate} roleLens="producer" execute={execute} executeStrict={execute}
      isDemo={false} viewerUserId={actorId} viewerAssignmentIds={actorId === ACTOR_ID ? [ACTOR_ASSIGNMENT_ID] : []}
      access={{ view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" }} />
  </MemoryRouter>);
  const details = screen.getByText("운영 자세히 보기").closest("details");
  if (!(details instanceof HTMLDetailsElement)) throw new Error("실제 개요의 운영 상세가 없습니다.");
  await act(async () => { details.open = true; fireEvent(details, new Event("toggle")); });
  // 상세 열림을 publication한 뒤 등록된 lazy import와 그 반영을 기다린다.
  await act(async () => { await vi.dynamicImportSettled(); });
  await screen.findByRole("heading", { name: "프로젝트 상태 한눈에" });
  await screen.findByRole("heading", { name: "실제 원고 revision 연결" });
  return { aggregate, execute };
}

describe("실제 개요 경로의 Studio 원고 연결 actor 귀속", () => {
  it("연결된 계정의 정확한 assignment를 Overview에서 원고 연결 명령까지 전달한다", async () => {
    const { aggregate, execute } = await openActualOverview(ACTOR_ID);
    const connect = screen.getByRole("button", { name: "검수 revision 연결" });
    if (!(connect instanceof HTMLButtonElement)) throw new Error("원고 연결 버튼이 없습니다.");
    expect(connect.disabled).toBe(false);
    expect(execute).not.toHaveBeenCalled();
    fireEvent.click(connect);
    await waitFor(() => expect(execute).toHaveBeenCalledOnce());
    expect(execute).toHaveBeenCalledWith({ type: "upsert-studio-revision-link", link: expect.objectContaining({
      projectId: PROJECT_ID, workId: WORK_ID, episodeId: EPISODE_ID, deliverableId: "deliverable-thumbnail",
      submissionId: "submission-thumbnail", linkedByAssignmentId: ACTOR_ASSIGNMENT_ID,
      studioRevisionRef: aggregate.submissions[0]?.revisionRef, status: "submitted",
    }) }, expect.any(String));
  });

  it("actor가 없으면 미연결 null 계정 party의 역할로 원고를 연결하지 않는다", async () => {
    const { execute } = await openActualOverview(null);
    const connect = screen.getByRole("button", { name: "검수 revision 연결" });
    if (!(connect instanceof HTMLButtonElement)) throw new Error("원고 연결 버튼이 없습니다.");
    expect(connect.disabled).toBe(true);
    fireEvent.click(connect);
    expect(execute).not.toHaveBeenCalled();
  });
});
