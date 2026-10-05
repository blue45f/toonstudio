import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import {
  getStudioProjectByWork,
  type StudioProjectArtifactRecord,
} from "../project-graph/studio-project-graph-client";
import {
  fetchServerManuscriptSnapshots,
  fetchServerVersionShares,
  type ServerManuscriptSnapshot,
  type ServerVersionShareLink,
} from "./production-manuscript-version-share-api";
import type { VersionSharePermission } from "./one-click-version-share-model";

/**
 * 버전·공유 활동 항목.
 *
 * 활동 피드의 본체인 서버 감사 이벤트(aggregate.auditEvents)는 제작 프로젝트 층의
 * 변경만 기록한다. 원고 버전 스냅샷 생성과 공유 링크 생성·회수는 작품(artifact) 층에서
 * 일어나 production_project 감사에 남지 않으므로, 서버가 실제로 기록한 스냅샷·공유
 * 레코드를 조회해 피드 항목으로 변환한다. 서버에 기록이 없는 종류(예: 리뷰 초대는
 * 감사 이벤트로 이미 기록됨)는 여기서 만들지 않는다.
 */
export type ProductionVersionActivityKind =
  | "snapshot-created"
  | "share-created"
  | "share-revoked";

export interface ProductionVersionActivityEntry {
  readonly id: string;
  readonly kind: ProductionVersionActivityKind;
  readonly occurredAt: string;
  /** 행위자의 계정 사용자 id. 회수 항목은 서버가 회수자를 기록하지 않아 null이다. */
  readonly actorUserId: string | null;
  readonly actorName: string | null;
  readonly actorIsViewer: boolean;
  readonly relatedToViewer: boolean;
  readonly artifactId: string;
  readonly artifactTitle: string;
  readonly snapshotName: string;
  readonly permission: VersionSharePermission | null;
  /** 해당 원고의 버전 표면으로 이동하는 딥링크. */
  readonly href: string;
}

export interface ProductionVersionActivitySource {
  readonly artifacts: readonly StudioProjectArtifactRecord[];
  readonly snapshots: readonly ServerManuscriptSnapshot[];
  readonly shares: readonly ServerVersionShareLink[];
}

function versionHref(projectId: string, artifactId: string): string {
  const query = new URLSearchParams({ artifact: artifactId, manuscriptView: "versions" });
  return `/production/projects/${encodeURIComponent(projectId)}/manuscripts?${query.toString()}`;
}

function actorNameFor(
  aggregate: ProductionProjectAggregate,
  actorUserId: string,
): string | null {
  const party = aggregate.parties.find((candidate) => candidate.accountUserId === actorUserId);
  return party ? party.internalDisplayName || party.publicDisplayName : null;
}

export function buildProductionVersionActivityEntries(input: {
  readonly aggregate: ProductionProjectAggregate;
  readonly source: ProductionVersionActivitySource;
  readonly viewerUserId: string | null;
}): readonly ProductionVersionActivityEntry[] {
  const { aggregate, source, viewerUserId } = input;
  const artifactTitles = new Map(source.artifacts.map((artifact) => [artifact.id, artifact.title]));
  const entries: ProductionVersionActivityEntry[] = [];

  const push = (
    kind: ProductionVersionActivityKind,
    recordId: string,
    occurredAt: string,
    actorUserId: string | null,
    artifactId: string,
    snapshotName: string,
    permission: VersionSharePermission | null,
  ): void => {
    const artifactTitle = artifactTitles.get(artifactId);
    if (!artifactTitle) return;
    const actorIsViewer = actorUserId !== null && actorUserId === viewerUserId;
    entries.push({
      id: `version:${kind}:${recordId}`,
      kind,
      occurredAt,
      actorUserId,
      actorName: actorUserId ? actorNameFor(aggregate, actorUserId) : null,
      actorIsViewer,
      // 회수 항목은 회수자가 기록되지 않아, 링크를 만든 사람이 뷰어일 때만 내 관련으로 본다.
      relatedToViewer: actorIsViewer,
      artifactId,
      artifactTitle,
      snapshotName,
      permission,
      href: versionHref(aggregate.projectId, artifactId),
    });
  };

  for (const snapshot of source.snapshots) {
    push("snapshot-created", snapshot.id, snapshot.createdAt, snapshot.createdBy, snapshot.artifactId, snapshot.name, null);
  }
  for (const share of source.shares) {
    push("share-created", share.id, share.createdAt, share.createdBy, share.artifactId, share.snapshotName, share.permission);
    if (share.revokedAt) {
      // 서버 기록에는 회수 시각만 있고 회수자는 없다. 행위자를 지어내지 않는다.
      push("share-revoked", share.id, share.revokedAt, null, share.artifactId, share.snapshotName, share.permission);
    }
  }

  return entries.toSorted((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export interface ProductionVersionActivityLoadResult {
  readonly entries: readonly ProductionVersionActivityEntry[];
  /** 스냅샷·공유 조회에 실패한 원고 수. 0보다 크면 일부만 표시된다는 뜻이다. */
  readonly failedArtifactCount: number;
}

const ARTIFACT_REQUEST_BATCH_SIZE = 6;

/**
 * 작품에 연결된 원고들의 서버 스냅샷·공유 기록을 모아 활동 항목으로 바꾼다.
 * 프로젝트 자체를 열 수 없으면 오류를 던지고, 원고 단위 실패는 건너뛰어
 * 나머지 원고의 활동은 살린다.
 */
export async function loadProductionVersionActivity(input: {
  readonly workId: string;
  readonly aggregate: ProductionProjectAggregate;
  readonly viewerUserId: string | null;
  readonly signal?: AbortSignal;
}): Promise<ProductionVersionActivityLoadResult> {
  const project = await getStudioProjectByWork(input.workId, input.signal);
  const snapshots: ServerManuscriptSnapshot[] = [];
  const shares: ServerVersionShareLink[] = [];
  let failedArtifactCount = 0;

  for (let offset = 0; offset < project.artifacts.length; offset += ARTIFACT_REQUEST_BATCH_SIZE) {
    const batch = project.artifacts.slice(offset, offset + ARTIFACT_REQUEST_BATCH_SIZE);
    const results = await Promise.allSettled(batch.map(async (artifact) => {
      const [artifactSnapshots, artifactShares] = await Promise.all([
        fetchServerManuscriptSnapshots(artifact.id),
        fetchServerVersionShares(artifact.id),
      ]);
      return { artifactSnapshots, artifactShares };
    }));
    for (const result of results) {
      if (result.status === "fulfilled") {
        snapshots.push(...result.value.artifactSnapshots);
        shares.push(...result.value.artifactShares);
      } else {
        failedArtifactCount += 1;
      }
    }
  }

  return {
    entries: buildProductionVersionActivityEntries({
      aggregate: input.aggregate,
      source: { artifacts: project.artifacts, snapshots, shares },
      viewerUserId: input.viewerUserId,
    }),
    failedArtifactCount,
  };
}
