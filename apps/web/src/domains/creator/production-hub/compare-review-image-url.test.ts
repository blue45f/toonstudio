import { describe, expect, it } from "vitest";

import type {
  StudioArtifactRecord,
  StudioProjectRecord,
  StudioReviewSummary,
  StudioRevisionRecord,
} from "../project-graph/studio-project-graph-contract";
import { buildProductionManuscriptProcesses } from "./production-manuscript-model";
import {
  buildCompareImageUrlMap,
  buildComparePreviewRequests,
  compareImageUrlKey,
  resolveCompareImageUrlFromMap,
} from "./compare-review-image-url";

const at = (minute: number) => `2026-09-23T00:${String(minute).padStart(2, "0")}:00.000Z`;
const HASH = "a".repeat(64);

function artifact(id: string, headRevisionId: string): StudioArtifactRecord {
  return {
    id, projectId: "graph-project", kind: "canvas-2d", title: id,
    scope: { projectId: "graph-project", seasonId: "season-1", episodeId: "episode-2" },
    headRevisionId, approvedRevisionId: null, ownerWorkspaceId: "workspace-1",
    createdAt: at(1), updatedAt: at(9),
  };
}

function revision(id: string, artifactId: string, minute: number): StudioRevisionRecord {
  return {
    id, artifactId, kind: "checkpoint", parentIds: [], rootGraphHash: HASH,
    operationFirst: null, operationLast: null, createdBy: "user-1", deviceId: "device-1",
    createdAt: at(minute), message: null, compatibilityReportId: null,
    provenanceManifestId: null, blobRefs: [],
  };
}

function review(id: string, artifactId: string, revisionId: string, minute: number): StudioReviewSummary {
  return {
    id, artifactId, revisionId, requestedBy: "user-1", title: "검수", status: "open",
    decidedAt: null, decidedBy: null, createdAt: at(minute), updatedAt: at(minute),
    reviewerIds: [], openRequiredCommentCount: 0,
  };
}

function processes() {
  const project: StudioProjectRecord = {
    id: "graph-project", workId: "work-1", schemaVersion: 3,
    authorityVersion: "project-graph-v3", ownerUserId: "user-1",
    createdAt: at(0), updatedAt: at(9),
    access: { view: true, comment: true, edit: true, manageMembers: true, respondInvite: false, owner: true, role: "owner" },
    artifacts: [artifact("artifact-a", "rev-a2"), artifact("artifact-b", "rev-b1")],
  };
  return buildProductionManuscriptProcesses({
    project,
    revisionsByArtifact: {
      "artifact-a": [revision("rev-a1", "artifact-a", 2), revision("rev-a2", "artifact-a", 8)],
      "artifact-b": [revision("rev-b1", "artifact-b", 3)],
    },
    reviewsByArtifact: {
      // rev-a1에는 검수가 없고, rev-a2에는 검수 2건(최신 것 우선), rev-b1에는 검수가 없다.
      "artifact-a": [review("review-old", "artifact-a", "rev-a2", 5), review("review-new", "artifact-a", "rev-a2", 9)],
      "artifact-b": [],
    },
    episodeId: null,
  });
}

describe("compare review image url (잔여 배선 ②)", () => {
  it("검수가 고정된 리비전만, head 우선으로 계획한다", () => {
    const requests = buildComparePreviewRequests(processes(), { projectId: "graph-project", workId: "work-1" });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      artifactId: "artifact-a", revisionId: "rev-a2", reviewId: "review-new", rootGraphHash: HASH,
    });
  });

  it("상한을 지키고 중복을 만들지 않는다", () => {
    const requests = buildComparePreviewRequests(processes(), { projectId: "p", workId: "w" }, 0);
    expect(requests).toHaveLength(0);
  });

  it("가장 작은 ordinal의 URL을 대표 이미지로 고르고, 빈 결과는 넣지 않는다", () => {
    const map = buildCompareImageUrlMap([
      { artifactId: "artifact-a", revisionId: "rev-a2", previews: [{ ordinal: 2, url: "https://x/2" }, { ordinal: 0, url: "https://x/0" }] },
      { artifactId: "artifact-b", revisionId: "rev-b1", previews: [] },
    ]);
    const resolve = resolveCompareImageUrlFromMap(map);
    expect(resolve("artifact-a", "rev-a2")).toBe("https://x/0");
    expect(resolve("artifact-b", "rev-b1")).toBeNull();
    expect(compareImageUrlKey("a", "r")).toBe("a::r");
  });
});
