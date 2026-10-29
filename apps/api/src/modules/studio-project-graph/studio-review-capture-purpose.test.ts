import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { CreateStudioArtifactSchema, CommitStudioRevisionSchema, RestoreStudioRevisionSchema } from "./studio-project-graph.dto";
import { authorizeStudioReviewCaptureBootstrap, loadStudioReviewCaptureSource } from "./studio-review-capture-purpose";
import { studioReviewPreviewDigest, type StudioReviewPreviewCapture } from "./studio-review-preview-producer.contract";
import { scopedFixture } from "../creator/studio-scoped-write.test-fixture";
import { StudioScopedWriteDeniedError } from "../creator/studio-scoped-write-effects";

const mocks = vi.hoisted(() => ({ query: vi.fn(), work: vi.fn(), purpose: vi.fn() }));
vi.mock("../creator/studio-crdt.repository", () => ({ studioCrdtWorkAdvisoryLockQuery: () => ({ lock: "work" }) }));
vi.mock("../creator/studio-scoped-write-store", () => ({ studioScopedPg: () => ({ query: mocks.query }), lockStudioScopedWork: mocks.work }));
vi.mock("../creator/studio-scoped-write-purpose", () => ({ authorizeStudioScopedPurpose: mocks.purpose }));
const client = {} as PoolClient;
function capture(): StudioReviewPreviewCapture {
  const fixture = scopedFixture();
  return { workId: "work", intentId: "intent", sourceServerRevision: 3, sourceContentDigest: studioReviewPreviewDigest(fixture.authorization.work.document),
    pageCount: 1, title: "검수본", deviceId: "device", createdAt: "2026-10-29T06:00:00.000Z", writeContext: fixture.context };
}
function bootstrap(input = capture()) {
  const digest = studioReviewPreviewDigest(input.workId), projectId = `review-project-${digest}`;
  return { projectId, workId: input.workId, workspaceId: `review-workspace-${digest}`,
    artifact: { id: `review-manuscript-${digest}`, kind: "review-snapshot" as const, title: "검수 원고", scope: { projectId } },
    initialRevision: { id: `review-initial-${digest}`, rootGraphHash: input.sourceContentDigest, deviceId: input.deviceId, createdAt: input.createdAt, blobRefs: [] } };
}
describe("현재 배정에 한정한 파생 검수 Graph 목적", () => {
  beforeEach(() => {
    mocks.query.mockReset().mockResolvedValue([]); mocks.work.mockReset().mockResolvedValue(scopedFixture().authorization.work);
    mocks.purpose.mockReset().mockResolvedValue(scopedFixture().authorization);
  });
  it("현재 work·grant를 읽되 generic edit capability를 만들지 않는다", async () => {
    const input = capture(); await loadStudioReviewCaptureSource(client, "actor", "work", input.writeContext);
    expect(mocks.work).toHaveBeenCalledWith(expect.anything(), "work", "actor", true);
    expect(mocks.purpose).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ access: expect.objectContaining({ edit: false }) }),
      { purpose: "capture", writeContext: input.writeContext });
    expect(mocks.query.mock.invocationCallOrder[0]).toBeLessThan(mocks.work.mock.invocationCallOrder[0] ?? Infinity);
  });
  it("정확한 저장 revision·digest와 결정적 검수 artifact 초기본만 bootstrap한다", async () => {
    const input = capture(), value = bootstrap(input);
    await expect(authorizeStudioReviewCaptureBootstrap(client, "actor", input, value.projectId, value)).resolves.toBeUndefined();
    await expect(authorizeStudioReviewCaptureBootstrap(client, "actor", { ...input, sourceServerRevision: 4 }, value.projectId, value)).rejects.toBeInstanceOf(ConflictException);
    await expect(authorizeStudioReviewCaptureBootstrap(client, "actor", { ...input, sourceContentDigest: "b".repeat(64) }, value.projectId, value)).rejects.toBeInstanceOf(ConflictException);
  });
  it("다른 artifact·work·임의 blob을 capture 목적에 끼워 넣지 못한다", async () => {
    const input = capture(), value = bootstrap(input);
    for (const invalid of [{ ...value, workId: "other" }, { ...value, artifact: { ...value.artifact, id: "arbitrary" } },
      { ...value, initialRevision: { ...value.initialRevision, blobRefs: [{ sha256: "c".repeat(64), role: "source", ordinal: 0 }] } }]) {
      await expect(authorizeStudioReviewCaptureBootstrap(client, "actor", input, value.projectId, invalid)).rejects.toBeInstanceOf(ForbiddenException);
    }
  });
  it("권한이 회수된 이전 intent도 현재 목적 검사에서 거절한다", async () => {
    mocks.purpose.mockRejectedValueOnce(new StudioScopedWriteDeniedError("policy"));
    await expect(loadStudioReviewCaptureSource(client, "actor", "work", capture().writeContext)).rejects.toBeInstanceOf(ForbiddenException);
  });
  it("공개 generic create/commit/restore DTO는 제한 context를 Graph 전체 편집 허가로 받지 않는다", () => {
    const input = capture(), value = bootstrap(input);
    expect(CreateStudioArtifactSchema.safeParse({ workspaceId: value.workspaceId, artifact: value.artifact, initialRevision: value.initialRevision }).success).toBe(true);
    expect(CreateStudioArtifactSchema.safeParse({ workspaceId: value.workspaceId, artifact: value.artifact, initialRevision: value.initialRevision, writeContext: input.writeContext }).success).toBe(false);
    expect(CommitStudioRevisionSchema.safeParse({ writeContext: input.writeContext }).success).toBe(false);
    expect(RestoreStudioRevisionSchema.safeParse({ writeContext: input.writeContext }).success).toBe(false);
  });
});
