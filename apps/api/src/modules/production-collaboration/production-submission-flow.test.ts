import { BadRequestException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProductionProjectAggregate, episodeScope, type ProductionProjectAggregate, type ProductionTask } from "@toonstudio/core/production";
import type { ProductionCollaborationRepository } from "./production-collaboration.repository";
import { ProductionCollaborationService } from "./production-collaboration.service";

const at = "2026-09-15T12:00:00.000Z";
function aggregate(): ProductionProjectAggregate {
  return createProductionProjectAggregate({ projectId: "project-1", workId: "work-1", title: "검수 인계",
    collaborationModel: "co-creator", ownerPartyId: "party-owner", ownerUserId: "owner-1", ownerDisplayName: "제작자", at });
}
const repository = { mutateProject: vi.fn() };
function service(): ProductionCollaborationService {
  return new ProductionCollaborationService(repository as unknown as ProductionCollaborationRepository);
}

describe("제작 협업 서버의 승인 제출본 경계", () => {
  beforeEach(() => { repository.mutateProject.mockReset(); });
  it("독립 브랜치와 고정 제출본은 실제 검수 승인 후 저장한다", async () => {
    const revision = {
      id: "story-r1",
      lineage: "narrative" as const,
      revision: 1,
      digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      createdAt: at,
    };
    const visualRevision = {
      id: "visual-r1",
      lineage: "visual" as const,
      revision: 1,
      digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      createdAt: at,
    };
    const ownerAssignmentId = "assignment:party-owner:producer";
    let current: ProductionProjectAggregate = {
      ...aggregate(),
      episodes: [{
        id: "episode-collaboration-12",
        projectId: "project-1",
        episodeId: "episode-12",
        revision: 0,
        state: "story-drafting",
        narrativeRevisionRef: revision,
        visualRevisionRef: null,
        integratedRevisionRef: null,
        activeHandoffId: null,
        openBlockerCount: 0,
        storyLockApproved: false,
        thumbnailLockApproved: false,
        jointProofApproved: false,
        creditPreflightPassed: false,
        publicationPreflightPassed: false,
        updatedAt: at,
      }],
    };
    repository.mutateProject.mockImplementation(async (input) => {
      const result = input.mutate(current, {
        view: true,
        comment: true,
        edit: true,
        manage: true,
        owner: true,
        role: "owner",
      });
      current = result.aggregate;
      return result;
    });

    const branchResult = await service().executeCommand("owner-1", "project-1", {
      expectedRevision: 0,
      mutationId: "66666666-6666-4666-8666-666666666666",
      command: {
        type: "upsert-branch",
        branch: {
          id: "branch-thumbnail-12",
          projectId: "project-1",
          episodeId: "episode-12",
          type: "thumbnail",
          lineage: "visual",
          baseRevisionRef: visualRevision,
          headRevisionRef: visualRevision,
          ownerAssignmentId,
          purpose: "12화 콘티 탐색",
          mergeTarget: "visual",
          visibility: "team",
          allowedScopes: [episodeScope("project-1", "episode-12")],
          expiresAt: null,
          status: "active",
        },
      },
    });
    expect(branchResult.aggregate.branches).toHaveLength(1);
    expect(branchResult.aggregate.episodes[0]?.narrativeRevisionRef).toEqual(revision);

    const deliverableResult = await service().executeCommand("owner-1", "project-1", {
      expectedRevision: 1,
      mutationId: "77777777-7777-4777-8777-777777777777",
      command: {
        type: "upsert-deliverable",
        deliverable: {
          id: "deliverable-thumbnail-12",
          projectId: "project-1",
          scope: episodeScope("project-1", "episode-12"),
          type: "thumbnail",
          expectedFormat: "studio-document",
          completionCriteria: ["전체 컷 배치", "대사 안전영역"],
          currentSubmissionId: null,
          approvedSubmissionId: null,
        },
      },
    });
    expect(deliverableResult.aggregate.deliverables).toHaveLength(1);

    const submission = {
      id: "submission-thumbnail-12-r1", projectId: "project-1", deliverableId: "deliverable-thumbnail-12",
      revisionRef: visualRevision, submittedByAssignmentId: ownerAssignmentId, submittedAt: at,
      status: "submitted" as const, inputRevisionRefs: [revision], evidenceRefs: ["approval-thumbnail-12-r1"],
    };
    await expect(service().executeCommand("owner-1", "project-1", {
      expectedRevision: 2,
      mutationId: "88888888-8888-4888-8888-888888888880",
      command: { type: "upsert-submission", submission: { ...submission, status: "approved" } },
    })).rejects.toBeInstanceOf(BadRequestException);
    const persist = async (command: Parameters<ProductionCollaborationService["executeCommand"]>[2]["command"], suffix: number) =>
      service().executeCommand("owner-1", "project-1", { expectedRevision: current.revision,
        mutationId: `88888888-8888-4888-8888-88888888888${suffix}`, command });
    await persist({ type: "upsert-submission", submission }, 1);
    await persist({ type: "upsert-submission", submission: { ...submission, status: "in-review" } }, 2);
    await persist({ type: "upsert-review-policy", policy: {
      id: "thumbnail-policy", projectId: "project-1", scope: episodeScope("project-1", "episode-12"),
      responseDueHours: 24, expiredReviewAction: "escalate",
      lanes: [{ lane: "visual-direction", eligibleAssignmentIds: [ownerAssignmentId], requiredAssignmentIds: [ownerAssignmentId],
        quorum: 1, vetoAssignmentIds: [], blocksPublication: true }],
    } }, 3);
    expect(repository.mutateProject).toHaveBeenLastCalledWith(expect.objectContaining({ requiredCapability: "manage" }));
    await persist({ type: "record-review-decision", policyId: "thumbnail-policy", decision: {
      id: "thumbnail-review", reviewRoundId: submission.id, lane: "visual-direction", assignmentId: ownerAssignmentId,
      value: "approve", reasonCode: null, evidenceScopeRefs: [episodeScope("project-1", "episode-12")], conditions: [], createdAt: at,
    } }, 4);
    const linkedTask: ProductionTask = { id: "thumbnail-task", projectId: current.projectId, scope: episodeScope(current.projectId, "episode-12"),
      processKey: "storyboard", title: "콘티", status: "internal-review", assignmentIds: [ownerAssignmentId], reviewerAssignmentIds: [ownerAssignmentId],
      inputRevisionRefs: [revision], outputDeliverableIds: [submission.deliverableId], dependencyTaskIds: [], dueAt: null, estimateHours: null,
      completionCriteria: ["콘티 검수"], sourceAgreementMilestoneId: null };
    current = { ...current, tasks: [linkedTask] };
    const beforeApprovalRevision = current.revision;
    const submissionResult = await service().executeCommand("owner-1", "project-1", {
      expectedRevision: current.revision,
      mutationId: "88888888-8888-4888-8888-888888888888",
      command: {
        type: "upsert-submission",
        submission: { ...submission, status: "approved" },
      },
    });
    expect(submissionResult.aggregate.submissions).toHaveLength(1);
    expect(submissionResult.aggregate.deliverables[0]).toMatchObject({
      currentSubmissionId: "submission-thumbnail-12-r1",
      approvedSubmissionId: "submission-thumbnail-12-r1",
    });
    expect(submissionResult.aggregate.auditEvents.at(-1)?.action).toBe("upsert-submission");
    expect(submissionResult.aggregate.tasks[0]?.status).toBe("approved");
    expect(submissionResult.aggregate.revision).toBe(beforeApprovalRevision + 1);
    expect(repository.mutateProject).toHaveBeenLastCalledWith(expect.objectContaining({ requiredCapability: "comment" }));
  });

  it.each(["upsert-task", "upsert-task-batch"] as const)("%s 저장으로 검수 승인과 완료를 우회할 수 없다", async (type) => {
    const current = aggregate();
    const task: ProductionTask = { id: "task", projectId: current.projectId, scope: episodeScope(current.projectId, "episode"),
      processKey: "line-art", title: "선화", status: "internal-review", assignmentIds: [], reviewerAssignmentIds: [],
      inputRevisionRefs: [], outputDeliverableIds: ["missing-deliverable"], dependencyTaskIds: [], dueAt: null, estimateHours: null,
      completionCriteria: [], sourceAgreementMilestoneId: null };
    const before = { ...current, tasks: [task] };
    repository.mutateProject.mockImplementation(async (input) => input.mutate(before));
    const changed = { ...task, status: "approved" as const };
    await expect(service().executeCommand("owner-1", current.projectId, {
      expectedRevision: before.revision, mutationId: "11111111-1111-4111-8111-111111111111",
      command: type === "upsert-task" ? { type, task: changed } : { type, tasks: [changed], expectedTasks: [task] },
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(before.tasks[0]?.status).toBe("internal-review");
    expect(before.revision).toBe(current.revision);
  });
});
