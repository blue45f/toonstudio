import type { ProductionProjectAggregate, RevisionRef, ScopeRef, Submission } from "@toonstudio/core/production";
import type { StudioArtifactRecord, StudioProjectRecord, StudioReviewSummary, StudioRevisionRecord } from "../project-graph/studio-project-graph-contract";
import { getStudioProjectByWork, getStudioReviewPreviews, listStudioArtifactRevisions, listStudioReviews, type StudioReviewPreviewRead } from "../project-graph/studio-project-graph-client";
import { studioVirtualSpaceReviewHref } from "../virtual-space/studio-virtual-space-review-invitation";
import { createStudioRevisionCandidates } from "./production-studio-revision-bridge";
import { canonicalJson } from "@toonstudio/studio-project-model";
import { studioReviewCaptureSourceHref } from "../review-capture/studio-review-capture-source";

export interface PinnedSubmissionVisualSource {
  readonly artifact: StudioArtifactRecord;
  readonly revision: StudioRevisionRecord;
  readonly review: StudioReviewSummary;
  readonly label: string;
  readonly reviewHref: string | null;
  readonly projectId: string;
  readonly workId: string;
  readonly sourceRevisionRef: RevisionRef;
  readonly mapping: "exact" | "captured-source";
  readonly captureHref: string | null;
}

export class SubmissionVisualReviewCaptureRequired extends Error {
  constructor(readonly captureHref: string | null) {
    super(captureHref ? "이 제출 정본의 고정 검수 이미지가 없습니다. 저장된 원본과 정확히 일치할 때만 이미지를 만들 수 있습니다."
      : "이 제출 정본의 고정 검수 이미지가 없습니다. 편집 담당자가 같은 원본 버전에서 검수 이미지를 만들어야 합니다.");
  }
}

export interface SubmissionVisualReviewData {
  readonly submission: PinnedSubmissionVisualSource;
  readonly baselines: readonly PinnedSubmissionVisualSource[];
}

function artifactWithinScope(studioScope: StudioArtifactRecord["scope"], scope: ScopeRef): boolean {
  const parts: Partial<Record<ScopeRef["kind"], string | undefined>> = {
    season: studioScope.seasonId, episode: studioScope.episodeId,
    scene: studioScope.sceneId, "scroll-segment": studioScope.sequenceId,
    cut: studioScope.panelId, "layer-group": studioScope.elementId, asset: studioScope.elementId,
  };
  if (scope.kind !== "project" && scope.kind !== "deliverable" && parts[scope.kind] !== scope.id) return false;
  return scope.ancestors.every((ancestor) => ancestor.kind === "project" || parts[ancestor.kind] === ancestor.id);
}

/** 제출 ID·digest·범위를 모두 확인한다. 저장된 참조가 없으면 head로 대체하지 않는다. */
export function resolveSubmissionVisualReview(
  aggregate: ProductionProjectAggregate,
  submission: Submission,
  project: StudioProjectRecord,
  revisionsByArtifact: Readonly<Record<string, readonly StudioRevisionRecord[]>>,
  reviewsByArtifact: Readonly<Record<string, readonly StudioReviewSummary[]>>,
): SubmissionVisualReviewData {
  const deliverable = aggregate.deliverables.find((entry) => entry.id === submission.deliverableId && entry.projectId === aggregate.projectId);
  if (submission.projectId !== aggregate.projectId || !deliverable || project.workId !== aggregate.workId || !project.access.view) {
    throw new Error("선택한 제출본과 Studio 프로젝트의 작품·접근 범위를 확인하세요.");
  }
  const candidates = createStudioRevisionCandidates(project, revisionsByArtifact);
  const task = aggregate.tasks.find((entry) => entry.projectId === aggregate.projectId && entry.outputDeliverableIds.includes(submission.deliverableId));
  const captureHrefFor = (artifactId: string, ref: RevisionRef) => project.access.edit
    ? studioReviewCaptureSourceHref(project.workId, { artifactId, revisionId: ref.id, rootGraphHash: ref.digest.slice("sha256:".length) },
      task ? { projectId: aggregate.projectId, taskId: task.id } : null) : null;
  const resolve = (ref: RevisionRef, label: string, requireOutputScope: boolean): PinnedSubmissionVisualSource | null => {
    const matches = candidates.filter((entry) => entry.artifactId === entry.revision.artifactId
      && entry.scope.projectId === project.id && entry.revisionRef.id === ref.id
      && entry.revisionRef.digest === ref.digest && entry.revisionRef.lineage === ref.lineage
      && (!requireOutputScope || artifactWithinScope(entry.scope, deliverable.scope)));
    if (matches.length !== 1) return null;
    const candidate = matches[0];
    if (!candidate) return null;
    const artifact = project.artifacts.find((entry) => entry.id === candidate.artifactId && entry.projectId === project.id);
    if (!artifact) return null;
    const directReview = candidate.revision.kind === "review-snapshot" && candidate.revision.blobRefs.some((entry) => entry.role === "preview")
      ? [...(reviewsByArtifact[candidate.artifactId] ?? [])]
      .filter((entry) => entry.artifactId === candidate.artifactId && entry.revisionId === ref.id)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0] : undefined;
    const captures = project.artifacts.filter((entry) => entry.kind === "review-snapshot" && entry.projectId === project.id)
      .flatMap((target) => (reviewsByArtifact[target.id] ?? []).flatMap((review) => {
        const source = review.sourceRevision;
        const revision = (revisionsByArtifact[target.id] ?? []).find((entry) => entry.id === review.revisionId && entry.artifactId === target.id && entry.kind === "review-snapshot");
        if (!source || !revision || review.artifactId !== target.id || source.artifactId !== artifact.id
          || source.revisionId !== ref.id || source.rootGraphHash !== candidate.revision.rootGraphHash
          || revision.rootGraphHash !== source.rootGraphHash || canonicalJson(source.scope) !== canonicalJson(artifact.scope)
          || (requireOutputScope && !artifactWithinScope(source.scope, deliverable.scope))) return [];
        return [{ artifact: target, revision, review }];
      })).sort((left, right) => right.review.updatedAt.localeCompare(left.review.updatedAt));
    const display = directReview ? { artifact, revision: candidate.revision, review: directReview } : captures[0];
    if (!display) return null;
    const subject = { schemaVersion: 1 as const, projectId: project.id, workId: project.workId,
      artifactId: display.artifact.id, reviewId: display.review.id, revisionId: display.revision.id, rootGraphHash: display.revision.rootGraphHash };
    return { ...display, label, projectId: project.id, workId: project.workId, sourceRevisionRef: ref,
      mapping: directReview ? "exact" : "captured-source", reviewHref: studioVirtualSpaceReviewHref(subject), captureHref: captureHrefFor(artifact.id, ref) };
  };
  const pinned = resolve(submission.revisionRef, `${submission.revisionRef.revision}차 제출본`, true);
  if (!pinned) {
    const original = candidates.find((entry) => entry.revision.id === submission.revisionRef.id && entry.revision.artifactId === entry.artifactId
      && entry.revisionRef.digest === submission.revisionRef.digest && entry.revisionRef.lineage === submission.revisionRef.lineage
      && entry.scope.projectId === project.id && artifactWithinScope(entry.scope, deliverable.scope));
    if (!original) throw new Error("제출본과 일치하는 고정 원고가 없습니다. 원고의 revision과 digest를 확인해 주세요.");
    throw new SubmissionVisualReviewCaptureRequired(captureHrefFor(original.artifactId, submission.revisionRef));
  }
  const activeLinks = (aggregate.studioRevisionLinks ?? []).filter((link) => link.submissionId === submission.id && link.status !== "superseded");
  if (activeLinks.some((link) => link.projectId !== aggregate.projectId || link.workId !== project.workId
    || link.deliverableId !== submission.deliverableId || link.studioRevisionRef.id !== pinned.sourceRevisionRef.id
    || link.studioRevisionRef.digest !== submission.revisionRef.digest)) {
    throw new Error("제출본의 Studio 연결과 고정 원고가 다릅니다. 연결을 확인한 뒤 다시 열어 주세요.");
  }
  const refs = [
    ...aggregate.submissions.filter((entry) => entry.projectId === aggregate.projectId && entry.deliverableId === submission.deliverableId
      && entry.id !== submission.id && entry.submittedAt < submission.submittedAt)
      .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))
      .map((entry) => ({ ref: entry.revisionRef, label: `${entry.revisionRef.revision}차 이전 제출본`, requireOutputScope: true })),
    ...submission.inputRevisionRefs.map((ref) => ({ ref, label: `${ref.revision}차 고정 입력본`, requireOutputScope: false })),
  ];
  const baselines: PinnedSubmissionVisualSource[] = [];
  for (const entry of refs) {
    if (entry.ref.id === pinned.sourceRevisionRef.id || baselines.some((source) => source.sourceRevisionRef.id === entry.ref.id)) continue;
    const source = resolve(entry.ref, entry.label, entry.requireOutputScope);
    if (source) baselines.push(source);
  }
  return { submission: pinned, baselines };
}

export async function loadSubmissionVisualReview(aggregate: ProductionProjectAggregate, submission: Submission): Promise<SubmissionVisualReviewData> {
  const project = await getStudioProjectByWork(aggregate.workId);
  const deliverable = aggregate.deliverables.find((entry) => entry.id === submission.deliverableId && entry.projectId === aggregate.projectId);
  if (!deliverable || submission.projectId !== aggregate.projectId || project.workId !== aggregate.workId || !project.access.view) {
    throw new Error("선택한 제출본과 Studio 프로젝트의 작품·접근 범위를 확인하세요.");
  }
  const requestedRefs = [submission.revisionRef, ...submission.inputRevisionRefs,
    ...aggregate.submissions.filter((entry) => entry.projectId === aggregate.projectId && entry.deliverableId === submission.deliverableId
      && entry.id !== submission.id && entry.submittedAt < submission.submittedAt).map((entry) => entry.revisionRef)];
  const refsById = new Map(requestedRefs.map((ref) => [ref.id, ref]));
  const remaining = new Set(refsById.keys());
  const revisionsByArtifact: Record<string, readonly StudioRevisionRecord[]> = {};
  const reviewArtifactIds = new Set<string>();
  const artifacts = project.artifacts.filter((artifact) => artifact.projectId === project.id && artifact.scope.projectId === project.id)
    .sort((left, right) => {
      const priority = (artifact: StudioArtifactRecord) => Number(refsById.has(artifact.headRevisionId)
        || (artifact.approvedRevisionId != null && refsById.has(artifact.approvedRevisionId))) * 2 + Number(artifactWithinScope(artifact.scope, deliverable.scope));
      return priority(right) - priority(left);
    });
  // scope·head·승인본 힌트부터 찾고 필요한 참조가 모두 확인되면 나머지 산출물은 읽지 않는다.
  // 다른 회차의 고정 입력본도 찾되 무관한 산출물 실패는 선택 원고를 막지 않는다.
  for (let offset = 0; offset < artifacts.length && remaining.size; offset += 4) {
    const batch = artifacts.slice(offset, offset + 4);
    const results = await Promise.allSettled(batch.map((artifact) => listStudioArtifactRevisions(artifact.id)));
    results.forEach((result, index) => {
      const artifact = batch[index];
      if (!artifact || result.status !== "fulfilled") return;
      revisionsByArtifact[artifact.id] = result.value;
      for (const candidate of createStudioRevisionCandidates({ ...project, artifacts: [artifact] }, { [artifact.id]: result.value })) {
        const ref = refsById.get(candidate.revision.id);
        if (!ref || candidate.revision.artifactId !== artifact.id || candidate.revisionRef.digest !== ref.digest || candidate.revisionRef.lineage !== ref.lineage
          || (ref.id === submission.revisionRef.id && !artifactWithinScope(artifact.scope, deliverable.scope))) continue;
        remaining.delete(ref.id);
        reviewArtifactIds.add(artifact.id);
      }
    });
  }
  const reviewsByArtifact: Record<string, readonly StudioReviewSummary[]> = {};
  const reviewIds = [...new Set([...reviewArtifactIds,
    ...project.artifacts.filter((entry) => entry.projectId === project.id && entry.kind === "review-snapshot").map((entry) => entry.id)])];
  for (let offset = 0; offset < reviewIds.length; offset += 4) {
    const batch = reviewIds.slice(offset, offset + 4);
    const results = await Promise.allSettled(batch.map((id) => listStudioReviews(id)));
    results.forEach((result, index) => {
      const id = batch[index];
      if (id && result.status === "fulfilled") reviewsByArtifact[id] = result.value;
    });
  }
  const mappedArtifactIds = reviewIds.filter((id) => !revisionsByArtifact[id] && (reviewsByArtifact[id] ?? []).some((review) => {
    const source = review.sourceRevision, ref = source ? refsById.get(source.revisionId) : null;
    return source && ref && ref.digest === `sha256:${source.rootGraphHash}`;
  }));
  for (let offset = 0; offset < mappedArtifactIds.length; offset += 4) {
    const batch = mappedArtifactIds.slice(offset, offset + 4);
    const results = await Promise.allSettled(batch.map((id) => listStudioArtifactRevisions(id)));
    results.forEach((result, index) => { const id = batch[index]; if (id && result.status === "fulfilled") revisionsByArtifact[id] = result.value; });
  }
  return resolveSubmissionVisualReview(aggregate, submission, project, revisionsByArtifact, reviewsByArtifact);
}

/** 모든 프리뷰 페이지를 읽고 순번을 보존한다. 순환 커서나 버전 불일치는 부분 성공으로 숨기지 않는다. */
export async function loadPinnedSubmissionPreviews(source: PinnedSubmissionVisualSource): Promise<readonly StudioReviewPreviewRead[]> {
  const pages: StudioReviewPreviewRead[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const result = await getStudioReviewPreviews(source.review.id, {
      projectId: source.projectId, workId: source.workId, artifactId: source.artifact.id,
      revisionId: source.revision.id, rootGraphHash: source.revision.rootGraphHash,
    }, cursor);
    if (!result.ok) {
      if (result.reason === "preview-unavailable") throw new SubmissionVisualReviewCaptureRequired(source.captureHref);
      throw new Error(result.reason === "version-mismatch" ? "고정 원고 버전이 일치하지 않습니다. 제출본 연결을 다시 확인하세요." : "이 원고의 Studio 검수가 닫혔습니다.");
    }
    pages.push(...result.previews);
    cursor = result.nextCursor;
    if (cursor && cursors.has(cursor)) throw new Error("원고 이미지 목록을 끝까지 확인하지 못했습니다. 다시 불러와 주세요.");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  if (!pages.length) throw new Error("이 고정 원고에는 표시 가능한 이미지가 없습니다.");
  if (new Set(pages.map((page) => page.ordinal)).size !== pages.length) throw new Error("원고 이미지 순번이 중복되었습니다. 다시 확인해 주세요.");
  return pages.sort((left, right) => left.ordinal - right.ordinal);
}
