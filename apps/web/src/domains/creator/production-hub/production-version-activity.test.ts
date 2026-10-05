// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { api } from "@/platform/api";

import { createProductionDemoProject } from "./production-demo";
import type {
  ServerManuscriptSnapshot,
  ServerVersionShareLink,
} from "./production-manuscript-version-share-api";
import {
  buildProductionVersionActivityEntries,
  loadProductionVersionActivity,
} from "./production-version-activity";

vi.mock("@/platform/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  isAppApiError: (error: unknown): boolean =>
    typeof error === "object" && error !== null && "__appApiError" in error,
}));

const get = vi.mocked(api.get);

const ARTIFACT = {
  id: "artifact-1",
  projectId: "sg-project-1",
  kind: "canvas-2d",
  title: "1화 원고",
  scope: { projectId: "sg-project-1" },
  headRevisionId: "rev-head",
  approvedRevisionId: null,
  ownerWorkspaceId: "ws-1",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
} as const;

const PROJECT_BODY = {
  id: "sg-project-1",
  workId: "sample-work",
  schemaVersion: 3,
  authorityVersion: "project-graph-v3",
  ownerUserId: "demo-story",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  access: {
    view: true,
    comment: true,
    edit: true,
    manageMembers: false,
    respondInvite: false,
    owner: true,
    role: "owner",
  },
  artifacts: [ARTIFACT],
};

const SNAPSHOT: ServerManuscriptSnapshot = {
  id: "snap-1",
  artifactId: "artifact-1",
  name: "검수본 v3",
  memo: "",
  revisionId: "rev-1",
  rootGraphHash: "a".repeat(64),
  revisionKind: "checkpoint",
  revisionMessage: null,
  createdBy: "demo-story",
  createdAt: "2026-10-05T09:00:00.000Z",
};

const SHARE: ServerVersionShareLink = {
  id: "share-1",
  artifactId: "artifact-1",
  snapshotId: "snap-1",
  snapshotName: "검수본 v3",
  tokenSuffix: "abcd",
  permission: "comment",
  watermark: true,
  hasPassword: false,
  createdBy: "demo-art",
  createdAt: "2026-10-05T10:00:00.000Z",
  expiresAt: null,
  revokedAt: "2026-10-05T11:00:00.000Z",
};

describe("buildProductionVersionActivityEntries", () => {
  it("스냅샷 생성·공유 생성·공유 회수를 시각 내림차순 항목으로 바꾼다", () => {
    const aggregate = createProductionDemoProject();
    const entries = buildProductionVersionActivityEntries({
      aggregate,
      source: { artifacts: [ARTIFACT], snapshots: [SNAPSHOT], shares: [SHARE] },
      viewerUserId: "demo-story",
    });

    expect(entries.map((entry) => entry.kind)).toEqual([
      "share-revoked",
      "share-created",
      "snapshot-created",
    ]);
    const snapshotEntry = entries.find((entry) => entry.kind === "snapshot-created");
    expect(snapshotEntry?.actorName).toBe("강민서 작가");
    expect(snapshotEntry?.actorIsViewer).toBe(true);
    expect(snapshotEntry?.relatedToViewer).toBe(true);
    expect(snapshotEntry?.artifactTitle).toBe("1화 원고");
    expect(snapshotEntry?.href).toBe(
      `/production/projects/${aggregate.projectId}/manuscripts?artifact=artifact-1&manuscriptView=versions`,
    );
    const shareEntry = entries.find((entry) => entry.kind === "share-created");
    expect(shareEntry?.permission).toBe("comment");
    expect(shareEntry?.relatedToViewer).toBe(false);
  });

  it("회수 항목은 회수자가 기록되지 않아 행위자를 비워 둔다", () => {
    const entries = buildProductionVersionActivityEntries({
      aggregate: createProductionDemoProject(),
      source: { artifacts: [ARTIFACT], snapshots: [], shares: [SHARE] },
      viewerUserId: "demo-art",
    });
    const revoked = entries.find((entry) => entry.kind === "share-revoked");
    expect(revoked?.actorUserId).toBeNull();
    expect(revoked?.actorName).toBeNull();
    expect(revoked?.occurredAt).toBe("2026-10-05T11:00:00.000Z");
  });

  it("회수되지 않은 공유는 회수 항목을 만들지 않고, 모르는 원고의 기록은 버린다", () => {
    const entries = buildProductionVersionActivityEntries({
      aggregate: createProductionDemoProject(),
      source: {
        artifacts: [ARTIFACT],
        snapshots: [{ ...SNAPSHOT, id: "snap-x", artifactId: "artifact-unknown" }],
        shares: [{ ...SHARE, revokedAt: null }],
      },
      viewerUserId: null,
    });
    expect(entries.map((entry) => entry.kind)).toEqual(["share-created"]);
  });
});

describe("loadProductionVersionActivity", () => {
  it("작품의 원고별 서버 기록을 모아 항목으로 돌려준다", async () => {
    get.mockImplementation(async (path: string) => {
      if (path === "/studio-project-graph/works/sample-work/project") return PROJECT_BODY;
      if (path === "/studio-project-graph/artifacts/artifact-1/manuscript-snapshots") return [SNAPSHOT];
      if (path === "/studio-project-graph/artifacts/artifact-1/version-shares") return [SHARE];
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await loadProductionVersionActivity({
      workId: "sample-work",
      aggregate: createProductionDemoProject(),
      viewerUserId: "demo-story",
    });

    expect(result.failedArtifactCount).toBe(0);
    expect(result.entries).toHaveLength(3);
  });

  it("한 원고의 조회가 실패해도 나머지는 살리고 실패 수를 센다", async () => {
    const second = { ...ARTIFACT, id: "artifact-2", title: "2화 원고" };
    get.mockImplementation(async (path: string) => {
      if (path === "/studio-project-graph/works/sample-work/project") {
        return { ...PROJECT_BODY, artifacts: [ARTIFACT, second] };
      }
      if (path.includes("artifact-2")) throw new Error("network down");
      if (path === "/studio-project-graph/artifacts/artifact-1/manuscript-snapshots") return [SNAPSHOT];
      if (path === "/studio-project-graph/artifacts/artifact-1/version-shares") return [];
      throw new Error(`unexpected path: ${path}`);
    });

    const result = await loadProductionVersionActivity({
      workId: "sample-work",
      aggregate: createProductionDemoProject(),
      viewerUserId: null,
    });

    expect(result.failedArtifactCount).toBe(1);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.kind).toBe("snapshot-created");
  });

  it("프로젝트 자체를 열 수 없으면 오류를 던진다", async () => {
    get.mockRejectedValue(new Error("not found"));
    await expect(loadProductionVersionActivity({
      workId: "sample-work",
      aggregate: createProductionDemoProject(),
      viewerUserId: null,
    })).rejects.toThrow("not found");
  });
});
