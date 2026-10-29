import { ConflictException, ForbiddenException } from "@nestjs/common";
import { canonicalJson } from "@toonstudio/studio-project-model";
import type { CreateStudioArtifact, CreateStudioProjectGraph } from "./studio-project-graph.dto";
import type { PoolClient } from "pg";
import type { StudioScopedWriteContext } from "@toonstudio/contracts/studio-scoped-write";
import { studioCrdtWorkAdvisoryLockQuery } from "../creator/studio-crdt.repository";
import { authorizeStudioScopedPurpose } from "../creator/studio-scoped-write-purpose";
import { lockStudioScopedWork, studioScopedPg } from "../creator/studio-scoped-write-store";
import { StudioScopedWriteDeniedError } from "../creator/studio-scoped-write-effects";
import { studioReviewPreviewDigest, type StudioReviewPreviewCapture } from "./studio-review-preview-producer.contract";

/** 공개 Graph DTO로 받지 않는 내부 목적이다. 현재 저장 원고의 파생 검수본만 만들 수 있다. */
export async function loadStudioReviewCaptureSource(client: PoolClient, actor: string, workId: string,
  writeContext?: StudioScopedWriteContext) {
  const query = studioScopedPg(client);
  await query.query(studioCrdtWorkAdvisoryLockQuery(workId));
  const work = await lockStudioScopedWork(query, workId, actor, true);
  try { await authorizeStudioScopedPurpose(query, work, { purpose: "capture", writeContext }); }
  catch (error) { if (error instanceof StudioScopedWriteDeniedError) throw new ForbiddenException(error.message); throw error; }
  return { projectId: "", workId, ownerUserId: String(work.work.userId), membershipRole: null,
    membershipStatus: "active", revision: work.revision, doc: work.document };
}

export async function authorizeStudioReviewCaptureBootstrap(client: PoolClient, actor: string,
  capture: StudioReviewPreviewCapture, projectId: string, input: CreateStudioArtifact | CreateStudioProjectGraph): Promise<void> {
  const source = await loadStudioReviewCaptureSource(client, actor, capture.workId, capture.writeContext);
  if (source.revision !== capture.sourceServerRevision || studioReviewPreviewDigest(source.doc) !== capture.sourceContentDigest) {
    throw new ConflictException("저장 원고가 변경됐습니다. 최신 원고를 다시 캡처하세요.");
  }
  assertStudioReviewCaptureBootstrapShape(capture, projectId, input);
}

export function assertStudioReviewCaptureBootstrapShape(capture: StudioReviewPreviewCapture, projectId: string,
  input: CreateStudioArtifact | CreateStudioProjectGraph): void {
  const digest = studioReviewPreviewDigest(capture.workId);
  if (("workId" in input && (input.workId !== capture.workId || projectId !== `review-project-${digest}`))
    || input.workspaceId !== `review-workspace-${digest}` || input.artifact.id !== `review-manuscript-${digest}`
    || input.artifact.kind !== "review-snapshot" || canonicalJson(input.artifact.scope) !== canonicalJson({ projectId })
    || input.initialRevision.id !== `review-initial-${digest}` || input.initialRevision.rootGraphHash !== capture.sourceContentDigest
    || input.initialRevision.blobRefs.length !== 0) {
    throw new ForbiddenException("검수 캡처 목적의 원고만 만들 수 있습니다.");
  }
}
