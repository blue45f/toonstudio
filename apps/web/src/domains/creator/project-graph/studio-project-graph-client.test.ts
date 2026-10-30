import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getStudioProjectByWork,
  listStudioArtifactRevisions,
  newStudioMutationKey,
  newStudioProjectGraphId,
  restoreStudioRevision,
  createStudioReviewComment,
  getStudioReview,
} from "./studio-project-graph-client";

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/platform/api", () => ({ api: http }));

const HASH = "a".repeat(64);
const NOW = "2026-09-17T05:30:00.000Z";

function projectRecord() {
  return {
    id: "project-1",
    workId: "work-1",
    schemaVersion: 3,
    authorityVersion: "project-graph-v3",
    ownerUserId: "owner-1",
    createdAt: NOW,
    updatedAt: NOW,
    access: {
      view: true,
      comment: true,
      edit: true,
      manageMembers: true,
      respondInvite: false,
      owner: true,
      role: "owner",
    },
    artifacts: [{
      id: "artifact-1",
      projectId: "project-1",
      kind: "canvas-2d",
      title: "1화 원고",
      scope: {
        projectId: "project-1",
      },
      headRevisionId: "revision-head",
      approvedRevisionId: null,
      ownerWorkspaceId: "workspace-1",
      createdAt: NOW,
      updatedAt: NOW,
    }],
  };
}

function revisionRecord() {
  return {
    id: "revision-head",
    artifactId: "artifact-1",
    kind: "checkpoint",
    parentIds: [],
    rootGraphHash: HASH,
    operationFirst: null,
    operationLast: null,
    createdBy: "owner-1",
    deviceId: "device-1",
    createdAt: NOW,
    message: "첫 체크포인트",
    compatibilityReportId: null,
    provenanceManifestId: null,
    blobRefs: [],
  };
}

describe("Studio ProjectGraph browser client", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads a project through the work identity and validates the complete authority record", async () => {
    http.get.mockResolvedValueOnce(projectRecord());

    await expect(getStudioProjectByWork("work / 1")).resolves.toMatchObject({
      id: "project-1",
      artifacts: [{ id: "artifact-1", kind: "canvas-2d" }],
    });
    expect(http.get).toHaveBeenCalledWith(
      "/studio-project-graph/works/work%20%2F%201/project",
    );
  });

  it("rejects incomplete server records instead of silently treating them as synced", async () => {
    const invalid = projectRecord();
    delete (invalid.access as Partial<typeof invalid.access>).edit;
    http.get.mockResolvedValueOnce(invalid);

    await expect(getStudioProjectByWork("work-1")).rejects.toThrow();
  });

  it("lists immutable revisions with strict blob and timestamp contracts", async () => {
    http.get.mockResolvedValueOnce([revisionRecord()]);
    await expect(listStudioArtifactRevisions("artifact-1")).resolves.toEqual([
      revisionRecord(),
    ]);
    expect(http.get).toHaveBeenCalledWith(
      "/studio-project-graph/artifacts/artifact-1/revisions",
    );
  });

  it("restores as a new checkpoint with strong concurrency and retry headers", async () => {
    http.post.mockResolvedValueOnce({
      artifactId: "artifact-1",
      revisionId: "revision-restored",
      headRevisionId: "revision-restored",
      approvedRevisionId: null,
      sequence: 7,
      replayed: false,
    });
    const input = {
      revisionId: "revision-restored",
      commandId: "command-restore-1",
      deviceId: "device-1",
      createdAt: NOW,
      message: "검수 전 상태 복원",
    };

    await expect(restoreStudioRevision(
      "artifact-1",
      "revision-old",
      "revision-head",
      input,
      "restore-request-1234",
    )).resolves.toMatchObject({ headRevisionId: "revision-restored" });

    expect(http.post).toHaveBeenCalledWith(
      "/studio-project-graph/artifacts/artifact-1/revisions/revision-old/restore",
      input,
      {
        headers: {
          "Idempotency-Key": "restore-request-1234",
          "If-Match": '"revision-head"',
        },
      },
    );
    const options = http.post.mock.calls[0]?.[2] as { headers: Record<string, string> };
    expect(options.headers).not.toHaveProperty("x-user-id");
  });

  it("generates bounded identifiers that satisfy the shared entity grammar", () => {
    const id = newStudioProjectGraphId("Revision Restore");
    const key = newStudioMutationKey("Revision Restore");
    expect(id).toMatch(/^revision-restore-[a-z0-9-]+$/u);
    expect(id.length).toBeLessThanOrEqual(160);
    expect(key).toMatch(/^revision-restore:/u);
    expect(key.length).toBeGreaterThanOrEqual(8);
    expect(key.length).toBeLessThanOrEqual(240);
  });
});

describe("펜 첨삭 서버 계약", () => {
  const anchor = { kind: "region" as const, artifactId: "artifact-1", revisionId: "snapshot-1", scope: { projectId: "project-1" },
    x: 10, y: 20, width: 30, height: 40, source: { version: 1 as const, sourceServerRevision: 3,
      sourceContentDigest: HASH, pageOrdinal: 0, pageId: "page-one" } };
  const stroke = { id: "pen-one", points: [{ x: 10, y: 20 }, { x: 40, y: 60 }], color: "#e5484d", width: 4 };
  const strokes = [stroke];
  const input = { id: "pen-note", anchor, body: "이 획을 확인해 주세요.", severity: "note" as const, strokes };
  beforeEach(() => vi.clearAllMocks());
  it("전송한 원본 좌표의 획을 생성 응답과 이후 검수 조회에서 유지한다", async () => {
    http.post.mockResolvedValueOnce({ id: input.id, reviewId: "review-1", status: "open", anchor, createdAt: NOW, strokes });
    expect((await createStudioReviewComment("review-1", input)).strokes).toEqual(strokes);
    expect(http.post).toHaveBeenCalledWith("/studio-project-graph/reviews/review-1/comments", input);
    http.get.mockResolvedValueOnce({ id: "review-1", artifactId: "artifact-1", revisionId: "snapshot-1", requestedBy: "owner-1",
      title: "고정 검수본", status: "open", decidedAt: null, decidedBy: null, createdAt: NOW, updatedAt: NOW,
      reviewerIds: ["owner-1"], openRequiredCommentCount: 0, comments: [{ ...input, reviewId: "review-1", authorUserId: "editor-1", status: "open",
        dueAt: null, resolutionRevisionId: null, resolvedBy: null, createdAt: NOW, updatedAt: NOW, assigneeIds: [] }] });
    expect((await getStudioReview("review-1")).comments[0]?.strokes).toEqual(strokes);
  });
  it.each([undefined, [], [{ ...stroke, width: 5 }]])("서버 영수증에서 누락되거나 바뀐 획을 성공으로 받지 않는다 %#", async (returned) => {
    http.post.mockResolvedValueOnce({ id: input.id, reviewId: "review-1", status: "open", anchor, createdAt: NOW, strokes: returned });
    await expect(createStudioReviewComment("review-1", input)).rejects.toThrow("review_pen_receipt_mismatch");
  });
  it("같은 획이어도 다른 검수 버전에 연결한 영수증을 거절한다", async () => {
    http.post.mockResolvedValueOnce({ id: input.id, reviewId: "review-1", status: "open", anchor: { ...anchor, revisionId: "other-snapshot" }, createdAt: NOW, strokes });
    await expect(createStudioReviewComment("review-1", input)).rejects.toThrow("review_pen_receipt_mismatch");
  });
  it("획 없는 기존 의견의 생성 응답을 계속 읽는다", async () => {
    http.post.mockResolvedValueOnce({ id: input.id, reviewId: "review-1", status: "open", anchor, createdAt: NOW });
    await expect(createStudioReviewComment("review-1", { ...input, strokes: undefined })).resolves.toMatchObject({ id: input.id });
  });
});
