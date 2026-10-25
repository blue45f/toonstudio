import { studioCanvasPathname } from "../studio-workspace-route";

import {
  parseReviewEditorSubject,
  parseStudioReviewEditorRequest,
  type StudioReviewEditorRequest,
} from "./studio-review-editor-handoff";

/** Stable identities only. No anchor, document body, private preview URL or auth material travels. */
export function studioReviewEditorHref(raw: StudioReviewEditorRequest): string {
  const request = parseStudioReviewEditorRequest(raw);
  if (!request) throw new Error("Invalid review editor request");
  const query = new URLSearchParams({
    sharedReview: request.subject.reviewId,
    artifact: request.subject.artifactId,
    revision: request.subject.revisionId,
    digest: request.subject.rootGraphHash,
    graphProject: request.subject.projectId,
    reviewComment: request.commentId,
  });
  return `${studioCanvasPathname(request.subject.workId)}?${query.toString()}`;
}
export function studioReviewEditorRequestFromLocation(workId: string | null, search: string): StudioReviewEditorRequest | null {
  if (!workId) return null;
  const query = new URLSearchParams(search);
  const keys = ["sharedReview", "artifact", "revision", "digest", "graphProject", "reviewComment"];
  if (keys.some((key) => query.getAll(key).length !== 1)) return null;
  const subject = parseReviewEditorSubject({
    schemaVersion: 1,
    workId,
    projectId: query.get("graphProject"),
    reviewId: query.get("sharedReview"),
    artifactId: query.get("artifact"),
    revisionId: query.get("revision"),
    rootGraphHash: query.get("digest"),
  });
  if (!subject) return null;
  return parseStudioReviewEditorRequest({ subject, commentId: query.get("reviewComment") ?? "" });
}
