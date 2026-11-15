import type {
  ProductionStudioRevisionLink,
  RevisionRef,
  Submission,
} from "@toonstudio/core/production";

export function buildDemoSubmissionsAndRevisionLinks(input: {
  readonly projectId: string;
  readonly workId: string;
  readonly storyRevision: RevisionRef;
  readonly visualRevision: RevisionRef;
}): {
  readonly submissions: Submission[];
  readonly studioRevisionLinks: readonly ProductionStudioRevisionLink[];
} {
  const { projectId, workId, storyRevision, visualRevision } = input;
  const submissions: Submission[] = [
    {
      id: "submission-thumbnail-12-r2",
      projectId,
      deliverableId: "deliverable-thumbnail-12",
      revisionRef: visualRevision,
      submittedByAssignmentId: "assignment-art",
      submittedAt: "2026-09-15T03:30:00.000Z",
      status: "in-review",
      inputRevisionRefs: [storyRevision],
      evidenceRefs: ["thumbnail-diff-r1-r2"],
    },
    {
      id: "submission-background-sample-r1",
      projectId,
      deliverableId: "deliverable-background-sample-12",
      revisionRef: {
        id: "background-sample-r1",
        lineage: "visual",
        revision: 1,
        digest: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        createdAt: "2026-09-18T02:00:00.000Z",
      },
      submittedByAssignmentId: "assignment-background-vendor",
      submittedAt: "2026-09-18T02:05:00.000Z",
      status: "approved",
      inputRevisionRefs: [storyRevision, visualRevision],
      evidenceRefs: ["approval-background-sample-r1"],
    },
    {
      id: "submission-thumbnail-12-r1",
      projectId,
      deliverableId: "deliverable-thumbnail-12",
      revisionRef: {
        id: "thumbnail-episode-12-r1",
        lineage: "visual",
        revision: 1,
        digest: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        createdAt: "2026-09-14T08:00:00.000Z",
      },
      submittedByAssignmentId: "assignment-art",
      submittedAt: "2026-09-14T08:15:00.000Z",
      status: "superseded",
      inputRevisionRefs: [storyRevision],
      evidenceRefs: ["thumbnail-draft-r1"],
    },
  ];

  const studioRevisionLinks: readonly ProductionStudioRevisionLink[] = [
    {
      id: "studio-link-thumbnail-12-r2",
      projectId,
      workId,
      episodeId: "episode-12",
      studioDocumentRef: "document-episode-12-thumbnail",
      documentRole: "thumbnail",
      studioRevisionRef: visualRevision,
      deliverableId: "deliverable-thumbnail-12",
      submissionId: "submission-thumbnail-12-r2",
      linkedByAssignmentId: "assignment-art",
      status: "submitted",
      linkedAt: "2026-09-15T03:35:00.000Z",
      approvedAt: null,
    },
    {
      id: "studio-link-background-sample-12-r1",
      projectId,
      workId,
      episodeId: "episode-12",
      studioDocumentRef: "document-episode-12-background-sample",
      documentRole: "background",
      studioRevisionRef: submissions[1]!.revisionRef,
      deliverableId: "deliverable-background-sample-12",
      submissionId: "submission-background-sample-r1",
      linkedByAssignmentId: "assignment-background-vendor",
      status: "approved",
      linkedAt: "2026-09-18T02:10:00.000Z",
      approvedAt: "2026-09-18T02:10:00.000Z",
    },
  ];

  return { submissions, studioRevisionLinks };
}
