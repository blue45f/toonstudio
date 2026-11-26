import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { compareApprovedCuts } from "@toonstudio/studio-project-model";
import type { Pool, PoolClient } from "pg";

import { PinnedShareError, pinnedShareCapture } from "./pinned-share/pinned-share-storage";
import { loadArtifactAccess } from "./studio-project-graph.repository";
import type { StudioReviewCaptureSubject } from "./studio-review-capture-subject";

function unavailable() {
  return new ConflictException({ code: "studio_approved_cut_comparison_unavailable" });
}

async function readPinned(client: PoolClient, actor: string, subject: StudioReviewCaptureSubject) {
  const access = await loadArtifactAccess(client, actor, subject.artifactId);
  if (!access || access.row.projectId !== subject.projectId || access.row.workId !== subject.workId) {
    throw new NotFoundException({ code: "studio_review_not_found" });
  }
  if (!access.access.view) throw new ForbiddenException({ code: "studio_project_forbidden" });
  let document: unknown;
  const capture = await pinnedShareCapture(client, subject, (snapshot) => { document = snapshot; });
  return { document, capture };
}

/** 두 고정본의 권한·승인 기록·캡처 증명을 같은 DB 시점에서 읽고 변경분만 반환한다. */
export async function readApprovedCutChanges(pool: Pool, actor: string,
  approved: StudioReviewCaptureSubject, current: StudioReviewCaptureSubject) {
  if (approved.workId !== current.workId || approved.projectId !== current.projectId
    || approved.reviewId === current.reviewId) throw unavailable();
  const client = await pool.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
    const before = await readPinned(client, actor, approved);
    if (!before.capture.approvalDigest || !before.capture.decidedAt) throw unavailable();
    const after = await readPinned(client, actor, current);
    if (before.capture.sourceServerRevision > after.capture.sourceServerRevision) throw unavailable();
    let changes;
    try {
      changes = compareApprovedCuts(before.document, after.document);
    } catch {
      throw unavailable();
    }
    await client.query("COMMIT");
    return { approved, current, decidedAt: before.capture.decidedAt, changes };
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof PinnedShareError && error.code === "invalid-source") throw unavailable();
    throw error;
  } finally {
    client.release();
  }
}
