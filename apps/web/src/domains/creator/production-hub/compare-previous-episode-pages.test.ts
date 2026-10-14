import { describe, expect, it } from "vitest";

import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import type {
  StudioArtifactRecord,
  StudioProjectRecord,
  StudioRevisionRecord,
} from "../project-graph/studio-project-graph-contract";
import { buildProductionManuscriptProcesses } from "./production-manuscript-model";
import {
  buildPreviousEpisodePoolItems,
  findPreviousEpisode,
} from "./compare-previous-episode-pages";

type AggregatePick = Pick<ProductionProjectAggregate, "episodePlans" | "episodes">;

function aggregateWithPlans(plans: ReadonlyArray<readonly [string, number]>, episodeIds: readonly string[]): AggregatePick {
  return {
    episodes: episodeIds.map((episodeId, index) => ({
      id: `collaboration-${index}`,
      projectId: "project-1",
      episodeId,
      revision: 1,
      state: "episode-planning" as const,
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
      updatedAt: at(0),
    })),
    episodePlans: plans.map(([episodeId, episodeNumber], index) => ({
      id: `plan-${index}`,
      projectId: "project-1",
      seasonId: null,
      episodeId,
      episodeNumber,
      revision: 1,
      status: "draft" as const,
      title: `에피소드 ${episodeNumber}`,
      logline: "",
      openingHook: "",
      coreConflict: "",
      turningPoints: [],
      cliffhanger: "",
      characterRefs: [],
      locationRefs: [],
      targetCutCount: 1,
      targetScrollHeightPx: 1000,
      dialogueDensity: "medium" as const,
      difficulty: 1 as const,
      riskIds: [],
      narrativeRevisionRef: null,
      approvedByAssignmentIds: [],
      createdAt: at(0),
    })),
  };
}

const at = (minute: number) => `2026-09-23T00:${String(minute).padStart(2, "0")}:00.000Z`;

function previousProcesses() {
  const artifact = (id: string, kind: StudioArtifactRecord["kind"], head: string): StudioArtifactRecord => ({
    id, projectId: "graph-project", kind, title: id,
    scope: { projectId: "graph-project", seasonId: "season-1", episodeId: "episode-1" },
    headRevisionId: head, approvedRevisionId: null, ownerWorkspaceId: "workspace-1",
    createdAt: at(1), updatedAt: at(9),
  });
  const revision = (id: string, artifactId: string, minute: number): StudioRevisionRecord => ({
    id, artifactId, kind: "approved", parentIds: [], rootGraphHash: "b".repeat(64),
    operationFirst: null, operationLast: null, createdBy: "user-1", deviceId: "device-1",
    createdAt: at(minute), message: null, compatibilityReportId: null,
    provenanceManifestId: null, blobRefs: [],
  });
  const project: StudioProjectRecord = {
    id: "graph-project", workId: "work-1", schemaVersion: 3,
    authorityVersion: "project-graph-v3", ownerUserId: "user-1",
    createdAt: at(0), updatedAt: at(9),
    access: { view: true, comment: true, edit: true, manageMembers: true, respondInvite: false, owner: true, role: "owner" },
    artifacts: [artifact("artifact-img", "canvas-2d", "rev-img-2"), artifact("artifact-txt", "story", "rev-txt-1")],
  };
  return buildProductionManuscriptProcesses({
    project,
    revisionsByArtifact: {
      "artifact-img": [revision("rev-img-1", "artifact-img", 2), revision("rev-img-2", "artifact-img", 8)],
      "artifact-txt": [revision("rev-txt-1", "artifact-txt", 3)],
    },
    reviewsByArtifact: {},
    episodeId: null,
  });
}

describe("previous episode pages (잔여 배선 ③)", () => {
  it("회차 번호로 바로 앞 회차를 찾는다", () => {
    const aggregate = aggregateWithPlans(
      [["episode-1", 1], ["episode-2", 2], ["episode-3", 3]],
      ["episode-1", "episode-2", "episode-3"],
    );
    expect(findPreviousEpisode(aggregate, "episode-3")).toMatchObject({ episodeId: "episode-2", episodeNumber: 2, episodeLabel: "2화" });
    expect(findPreviousEpisode(aggregate, "episode-1")).toBeNull();
  });

  it("기획이 없으면 회차 목록 순서를 폴백으로 쓴다", () => {
    const aggregate = aggregateWithPlans([], ["episode-1", "episode-2"]);
    expect(findPreviousEpisode(aggregate, "episode-2")).toMatchObject({ episodeId: "episode-1", episodeNumber: null });
  });

  it("이미지 공정의 head 리비전만 page 풀 항목으로 만든다", () => {
    const items = buildPreviousEpisodePoolItems({
      processes: previousProcesses(),
      projectId: "prod-project",
      episodeId: "episode-1",
      episodeLabel: "1화",
      resolveImageUrl: (processId, revisionId) => (revisionId === "rev-img-2" ? "https://img/prev" : null),
      addedBy: "me",
      addedAt: at(10),
    });
    expect(items).toHaveLength(1);
    expect(items[0].source).toEqual({ kind: "page", projectId: "prod-project", episodeId: "episode-1", pageId: "rev-img-2" });
    expect(items[0].imageUrl).toBe("https://img/prev");
    expect(items[0].label).toContain("1화");
  });
});
