import { describe, expect, it } from "vitest";

import { createProductionProjectAggregate } from "./aggregate";
import { episodeScope, projectScope } from "./scope";
import {
  applyProductionStudioRevisionLink,
  evaluateProductionStudioRevisionCoverage,
  inferProductionStudioDocumentRole,
  validateProductionStudioRevisionLink,
} from "./studio-revision";
import { applySubmissionToDeliverable, validateDeliverable, validateSubmission } from "./versioning";
import { applyProductionSubmissionReviewToTasks } from "./workflow";

import type {
  Deliverable,
  Submission,
  EpisodeCollaboration,
  ProductionProjectAggregate,
  ProductionStudioRevisionLink,
  ProductionTask,
  RevisionRef,
} from "./types";

const STORY_REVISION: RevisionRef = {
  id: "studio-story-r2",
  lineage: "narrative",
  revision: 2,
  digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  createdAt: "2026-09-17T00:00:00.000Z",
};

const FINAL_REVISION: RevisionRef = {
  id: "studio-final-r4",
  lineage: "integrated",
  revision: 4,
  digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  createdAt: "2026-09-17T01:00:00.000Z",
};
function fixture(): ProductionProjectAggregate {
  const base = createProductionProjectAggregate({
    projectId: "project-1",
    workId: "work-1",
    title: "Revision bridge",
    collaborationModel: "studio-production",
    ownerPartyId: "party-owner",
    ownerUserId: "user-owner",
    ownerDisplayName: "Owner",
    at: "2026-09-17T00:00:00.000Z",
  });
  const scope = episodeScope(base.projectId, "episode-1");
  const episode: EpisodeCollaboration = {
    id: "episode-collaboration-1",
    projectId: base.projectId,
    episodeId: "episode-1",
    revision: 0,
    state: "story-review",
    narrativeRevisionRef: null,
    visualRevisionRef: null,
    integratedRevisionRef: null,
    activeHandoffId: null,
    openBlockerCount: 0,
    storyLockApproved: false,
    thumbnailLockApproved: false,
    jointProofApproved: false,
    creditPreflightPassed: false,
    publicationPreflightPassed: false,
    updatedAt: "2026-09-17T00:00:00.000Z",
  };
  return {
    ...base,
    episodes: [episode],
    deliverables: [
      {
        id: "deliverable-story",
        projectId: base.projectId,
        scope,
        type: "story-script",
        expectedFormat: "studio-document",
        completionCriteria: ["approved story"],
        currentSubmissionId: "submission-story",
        approvedSubmissionId: "submission-story",
      },
      {
        id: "deliverable-final",
        projectId: base.projectId,
        scope,
        type: "publication-package",
        expectedFormat: "platform-upload-package",
        completionCriteria: ["approved final"],
        currentSubmissionId: "submission-final",
        approvedSubmissionId: "submission-final",
      },
    ],
    submissions: [
      {
        id: "submission-story",
        projectId: base.projectId,
        deliverableId: "deliverable-story",
        revisionRef: STORY_REVISION,
        submittedByAssignmentId: "assignment:party-owner:producer",
        submittedAt: "2026-09-17T00:05:00.000Z",
        status: "approved",
        inputRevisionRefs: [],
        evidenceRefs: ["review-story-r2"],
      },
      {
        id: "submission-final",
        projectId: base.projectId,
        deliverableId: "deliverable-final",
        revisionRef: FINAL_REVISION,
        submittedByAssignmentId: "assignment:party-owner:producer",
        submittedAt: "2026-09-17T01:05:00.000Z",
        status: "approved",
        inputRevisionRefs: [STORY_REVISION],
        evidenceRefs: ["review-final-r4"],
      },
    ],
    studioRevisionLinks: [],
  };
}

function link(
  role: ProductionStudioRevisionLink["documentRole"],
  revision: RevisionRef,
  deliverableId: string,
  submissionId: string,
): ProductionStudioRevisionLink {
  return {
    id: `studio-link-${role}`,
    projectId: "project-1",
    workId: "work-1",
    episodeId: "episode-1",
    studioDocumentRef: `document-${role}`,
    documentRole: role,
    studioRevisionRef: revision,
    deliverableId,
    submissionId,
    linkedByAssignmentId: "assignment:party-owner:producer",
    status: "approved",
    linkedAt: "2026-09-17T02:00:00.000Z",
    approvedAt: "2026-09-17T02:00:00.000Z",
  };
}
describe("production Studio revision bridge", () => {
  it("maps production deliverables to Studio document roles", () => {
    expect(inferProductionStudioDocumentRole("story-script")).toBe("story");
    expect(inferProductionStudioDocumentRole("line-art")).toBe("lineart");
    expect(inferProductionStudioDocumentRole("background-final")).toBe("background");
    expect(inferProductionStudioDocumentRole("color-and-effects")).toBe("color");
    expect(inferProductionStudioDocumentRole("lettering")).toBe("lettering");
    expect(inferProductionStudioDocumentRole("publication-package")).toBe("final");
    expect(inferProductionStudioDocumentRole("rights-preflight")).toBeNull();
  });

  it("requires an approved submission before an approved revision can be linked", () => {
    const aggregate = fixture();
    const invalid = {
      ...link("story", STORY_REVISION, "deliverable-story", "submission-story"),
      studioRevisionRef: FINAL_REVISION,
    };

    expect(validateProductionStudioRevisionLink({ aggregate, link: invalid }))
      .toContain("studio-link-lineage-mismatch");
    expect(validateProductionStudioRevisionLink({ aggregate, link: invalid }))
      .toContain("studio-link-submission-revision-mismatch");
  });

  it("projects approved Studio revisions onto the episode authority", () => {
    const aggregate = fixture();
    const withStory = applyProductionStudioRevisionLink(
      aggregate,
      link("story", STORY_REVISION, "deliverable-story", "submission-story"),
    );
    const withFinal = applyProductionStudioRevisionLink(
      withStory,
      link("final", FINAL_REVISION, "deliverable-final", "submission-final"),
    );

    expect(withFinal.episodes[0]?.narrativeRevisionRef).toEqual(STORY_REVISION);
    expect(withFinal.episodes[0]?.integratedRevisionRef).toEqual(FINAL_REVISION);
    expect(withFinal.episodes[0]?.revision).toBe(2);
  });
  it("reports pending and missing production roles before integrated review", () => {
    const aggregate = fixture();
    const submittedStory: ProductionStudioRevisionLink = {
      ...link("story", STORY_REVISION, "deliverable-story", "submission-story"),
      status: "submitted",
      approvedAt: null,
    };
    const withStory = applyProductionStudioRevisionLink(aggregate, submittedStory);
    const coverage = evaluateProductionStudioRevisionCoverage(withStory, "episode-1");

    expect(coverage.expectedRoles).toEqual(["story", "final"]);
    expect(coverage.pendingRoles).toEqual(["story"]);
    expect(coverage.missingRoles).toEqual(["final"]);
    expect(coverage.readyForIntegratedReview).toBe(false);
  });

  it("becomes review-ready only after every expected revision is approved", () => {
    const aggregate = fixture();
    const withStory = applyProductionStudioRevisionLink(
      aggregate,
      link("story", STORY_REVISION, "deliverable-story", "submission-story"),
    );
    const withFinal = applyProductionStudioRevisionLink(
      withStory,
      link("final", FINAL_REVISION, "deliverable-final", "submission-final"),
    );
    const coverage = evaluateProductionStudioRevisionCoverage(withFinal, "episode-1");

    expect(coverage.approvedRoles).toEqual(["story", "final"]);
    expect(coverage.pendingRoles).toEqual([]);
    expect(coverage.missingRoles).toEqual([]);
    expect(coverage.readyForIntegratedReview).toBe(true);
  });
});

describe("제출본 버전과 승인 포인터", () => {
const at = "2026-10-28T09:00:00.000Z";
const revision = { id: "r1", lineage: "visual" as const, revision: 1, digest: `sha256:${"a".repeat(64)}`, createdAt: at };
const deliverable: Deliverable = { id: "d", projectId: "p", scope: projectScope("p"), type: "원고", expectedFormat: "PNG",
  completionCriteria: ["교정 완료"], currentSubmissionId: "s1", approvedSubmissionId: "s1" };
const submission: Submission = { id: "s1", projectId: "p", deliverableId: "d", revisionRef: revision,
  submittedByAssignmentId: "artist", submittedAt: at, status: "approved", inputRevisionRefs: [revision], evidenceRefs: ["review"] };

  it("제출본 승인과 수정 요청이 연결 작업에 원자적으로 반영된다", () => {
    const task: ProductionTask = { id: "task", projectId: "p", scope: projectScope("p"), processKey: "line-art", title: "선화",
      status: "internal-review", assignmentIds: [], reviewerAssignmentIds: [], inputRevisionRefs: [revision],
      outputDeliverableIds: [deliverable.id], dependencyTaskIds: [], dueAt: null, estimateHours: null,
      completionCriteria: [], sourceAgreementMilestoneId: null };
    const base: ProductionProjectAggregate = { ...fixture(), projectId: "p", tasks: [task, { ...task, id: "unrelated", outputDeliverableIds: ["other"] }],
      submissions: [submission], deliverables: [deliverable] };
    const approved = applyProductionSubmissionReviewToTasks(base, submission, at);
    expect(approved.tasks[0]).toMatchObject({ status: "approved", statusChangedAt: at, completedAt: at });
    expect(approved.tasks[1]?.status).toBe("internal-review");
    expect(base.tasks[0]?.status).toBe("internal-review");
    const changes = { ...submission, status: "changes-requested" as const };
    const revised = applyProductionSubmissionReviewToTasks({ ...approved, submissions: [changes],
      deliverables: [applySubmissionToDeliverable(deliverable, changes)] }, changes, at);
    expect(revised.tasks[0]).toMatchObject({ status: "changes-requested", completedAt: null });
  });


  it("일반 산출물 편집으로 이전 승인 포인터를 복구하거나 조작하지 못한다", () => {
    const current = { ...deliverable, currentSubmissionId: "s2", approvedSubmissionId: null };
    expect(validateDeliverable(deliverable, "p", current)).toContain("deliverable-submission-pointers-managed-by-submission");
    expect(validateDeliverable(deliverable, "p", null)).toContain("deliverable-submission-pointers-managed-by-submission");
    expect(validateDeliverable({ ...current, expectedFormat: "PSD" }, "p", current)).toEqual([]);
  });
  it("재제출은 이전 승인 이력을 보존하면서 현재 산출물의 승인을 초기화한다", () => {
    const next = { ...submission, id: "s2", status: "submitted" as const, revisionRef: { ...revision, id: "r2", revision: 2 } };
    expect(applySubmissionToDeliverable(deliverable, next)).toMatchObject({ currentSubmissionId: "s2", approvedSubmissionId: null });
    expect(submission.status).toBe("approved");
    expect(deliverable.approvedSubmissionId).toBe("s1");
  });
  it("이전 제출본 폐기는 새 제출본의 포인터를 되돌리지 않는다", () => {
    const current = { ...deliverable, currentSubmissionId: "s2", approvedSubmissionId: "s2" };
    expect(applySubmissionToDeliverable(current, { ...submission, status: "superseded" })).toEqual(current);
    expect(applySubmissionToDeliverable(deliverable, { ...submission, status: "superseded" })).toMatchObject({ currentSubmissionId: null, approvedSubmissionId: null });
  });
  it("이전 제출본 상태 저장으로 최신 버전을 되돌릴 수 없다", () => {
    expect(validateSubmission({ submission, current: submission,
      deliverable: { ...deliverable, currentSubmissionId: "s2", approvedSubmissionId: null }, activeAssignmentIds: ["artist"] })).toContain("submission-not-current");
  });
  it("동일 ID의 revision 번호·계보·시각과 고정 입력을 바꾸지 못한다", () => {
    for (const revisionRef of [{ ...revision, revision: 2 }, { ...revision, lineage: "integrated" as const }, { ...revision, createdAt: "2026-10-29T09:00:00Z" }]) {
      expect(validateSubmission({ submission: { ...submission, revisionRef }, current: submission, deliverable, activeAssignmentIds: ["artist"] })).toContain("submission-content-mutated");
    }
    expect(validateSubmission({ submission: { ...submission, inputRevisionRefs: [] }, current: submission, deliverable, activeAssignmentIds: ["artist"] })).toContain("submission-content-mutated");
    expect(validateSubmission({ submission: { ...submission, submittedByAssignmentId: "reviewer" }, current: submission, deliverable, activeAssignmentIds: ["reviewer"] })).toContain("submission-identity-changed");
    expect(validateSubmission({ submission: { ...submission, evidenceRefs: ["replaced-proof"] }, current: submission, deliverable, activeAssignmentIds: ["artist"] })).toContain("submission-approval-evidence-mutated");
  });
});
