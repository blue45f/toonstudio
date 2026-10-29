import { canonicalJson } from "@toonstudio/studio-project-model";
import { productionStudioDocumentRoleLineage, sameProductionRevision, type ProductionProjectAggregate,
  type RevisionRef, type Submission } from "@toonstudio/core/production";
import { getStudioProjectByWork, listStudioArtifactRevisions, listStudioReviews,
} from "../project-graph/studio-project-graph-client";
import type { StudioProjectRecord, StudioRevisionRecord, StudioReviewSummary } from "../project-graph/studio-project-graph-contract";
import { studioVirtualSpaceReviewHref } from "../virtual-space/studio-virtual-space-review-invitation";
import { createStudioRevisionCandidates } from "./production-studio-revision-bridge";
import { resolveSubmissionVisualReview, type PinnedSubmissionVisualSource,
  type SubmissionVisualReviewData } from "./production-submission-visual-review";

const mismatch = () => new Error("이 작업에 고정한 원고 사용 범위와 저장된 검수 원고가 다릅니다.");
type Revisions = Readonly<Record<string, readonly StudioRevisionRecord[]>>;
type Reviews = Readonly<Record<string, readonly StudioReviewSummary[]>>;

/** 새로운 업무 범위 근거에만 적용한다. 원본 Graph scope나 레거시 판정을 완화하지 않는다. */
export function resolveTaskOutputVisualSource(aggregate: ProductionProjectAggregate, submission: Submission,
  project: StudioProjectRecord, revisions: Revisions, reviews: Reviews, label: string): PinnedSubmissionVisualSource {
  const evidence = submission.sourceEvidence;
  const deliverable = aggregate.deliverables.find((entry) => entry.id === submission.deliverableId);
  if (!evidence || evidence.version !== 1 || evidence.kind !== "studio-review-capture" || !deliverable
    || deliverable.projectId !== aggregate.projectId || submission.projectId !== aggregate.projectId
    || !project.access.view || project.workId !== aggregate.workId || evidence.subject.workId !== aggregate.workId
    || evidence.subject.projectId !== project.id || evidence.subject.schemaVersion !== 1
    || canonicalJson(evidence.scope) !== canonicalJson(deliverable.scope)
    || !Array.isArray(evidence.pages) || !evidence.pages.length
    || !["document", "pages", "frames"].includes(evidence.selectionMode)
    || productionStudioDocumentRoleLineage(evidence.documentRole) !== submission.revisionRef.lineage
    || submission.revisionRef.id !== evidence.subject.revisionId
    || submission.revisionRef.productionSubmissionId !== submission.id
    || submission.revisionRef.digest !== `sha256:${evidence.subject.rootGraphHash}`
    || submission.revisionRef.revision !== evidence.sourceServerRevision) throw mismatch();
  const artifact = project.artifacts.find((entry) => entry.id === evidence.subject.artifactId
    && entry.projectId === project.id && entry.scope.projectId === project.id && entry.kind === "review-snapshot");
  const matchingRevisions = (revisions[evidence.subject.artifactId] ?? []).filter((entry) => entry.id === evidence.subject.revisionId
    && entry.artifactId === evidence.subject.artifactId && entry.kind === "review-snapshot"
    && entry.rootGraphHash === evidence.subject.rootGraphHash);
  const matchingReviews = (reviews[evidence.subject.artifactId] ?? []).filter((entry) => entry.id === evidence.subject.reviewId
    && entry.artifactId === evidence.subject.artifactId && entry.revisionId === evidence.subject.revisionId);
  const revision = matchingRevisions[0], review = matchingReviews[0];
  if (!artifact || !revision || !review || matchingRevisions.length !== 1 || matchingReviews.length !== 1
    || Date.parse(revision.createdAt) !== Date.parse(submission.revisionRef.createdAt)) throw mismatch();
  const manifest = new Map(revision.blobRefs.filter((entry) => entry.role === "preview").map((entry) => [entry.ordinal, entry.sha256]));
  if (!manifest.size || new Set(evidence.pages.map((entry) => entry.ordinal)).size !== evidence.pages.length
    || new Set(evidence.pages.map((entry) => entry.pageId)).size !== evidence.pages.length
    || evidence.pages.some((entry) => manifest.get(entry.ordinal) !== entry.sha256
      || !Array.isArray(entry.frameIds) || new Set(entry.frameIds).size !== entry.frameIds.length
      || (evidence.selectionMode === "frames" ? entry.frameIds.length === 0 : entry.frameIds.length !== 0))
    || (evidence.selectionMode === "document" && evidence.pages.length !== manifest.size)) throw mismatch();
  return { artifact, revision, review, label, projectId: project.id, workId: project.workId,
    sourceRevisionRef: submission.revisionRef, mapping: "exact", captureHref: null,
    reviewHref: studioVirtualSpaceReviewHref(evidence.subject), outputEvidence: evidence, comparisonKey: submission.id };
}

function rawInputSource(ref: RevisionRef, project: StudioProjectRecord, revisions: Revisions, reviews: Reviews): PinnedSubmissionVisualSource | null {
  if (ref.productionSubmissionId) return null;
  const candidate = createStudioRevisionCandidates(project, revisions).find((entry) => entry.revision.id === ref.id
    && entry.revision.artifactId === entry.artifactId && entry.scope.projectId === project.id
    && entry.revisionRef.digest === ref.digest && entry.revisionRef.lineage === ref.lineage);
  if (!candidate) return null;
  const artifact = project.artifacts.find((entry) => entry.id === candidate.artifactId && entry.projectId === project.id);
  const direct = candidate.revision.kind === "review-snapshot"
    ? (reviews[candidate.artifactId] ?? []).find((entry) => entry.artifactId === candidate.artifactId && entry.revisionId === ref.id) : undefined;
  if (artifact && direct) return { artifact, revision: candidate.revision, review: direct, projectId: project.id,
    workId: project.workId, label: "고정 입력 원고", sourceRevisionRef: ref, mapping: "exact", captureHref: null,
    reviewHref: studioVirtualSpaceReviewHref({ schemaVersion: 1, projectId: project.id, workId: project.workId,
      artifactId: artifact.id, reviewId: direct.id, revisionId: candidate.revision.id, rootGraphHash: candidate.revision.rootGraphHash }) };
  for (const target of project.artifacts.filter((entry) => entry.kind === "review-snapshot" && entry.projectId === project.id)) {
    for (const review of reviews[target.id] ?? []) {
      const original = review.sourceRevision;
      const revision = (revisions[target.id] ?? []).find((entry) => entry.id === review.revisionId && entry.artifactId === target.id && entry.kind === "review-snapshot");
      if (!artifact || !original || !revision || review.artifactId !== target.id || original.artifactId !== artifact.id
        || original.revisionId !== ref.id || original.rootGraphHash !== candidate.revision.rootGraphHash
        || revision.rootGraphHash !== original.rootGraphHash || canonicalJson(original.scope) !== canonicalJson(artifact.scope)) continue;
      return { artifact: target, revision, review, projectId: project.id, workId: project.workId,
        label: "고정 입력 원고", sourceRevisionRef: ref, mapping: "captured-source", captureHref: null,
        reviewHref: studioVirtualSpaceReviewHref({ schemaVersion: 1, projectId: project.id, workId: project.workId,
          artifactId: target.id, reviewId: review.id, revisionId: revision.id, rootGraphHash: revision.rootGraphHash }) };
    }
  }
  return null;
}

export async function loadTaskOutputVisualReview(aggregate: ProductionProjectAggregate, submission: Submission): Promise<SubmissionVisualReviewData> {
  const project = await getStudioProjectByWork(aggregate.workId);
  const evidence = submission.sourceEvidence;
  if (!evidence || project.workId !== aggregate.workId || !project.access.view) throw mismatch();
  const previous = aggregate.submissions.filter((entry) => entry.deliverableId === submission.deliverableId
    && entry.id !== submission.id && entry.submittedAt < submission.submittedAt)
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
  const references = [...submission.inputRevisionRefs, ...previous.map((entry) => entry.revisionRef)];
  const known = aggregate.submissions.filter((entry) => entry.id !== submission.id && entry.sourceEvidence
    && references.some((ref) => sameProductionRevision(ref, entry.revisionRef)));
  const priority = new Set([evidence.subject.artifactId, ...known.flatMap((entry) => entry.sourceEvidence ? [entry.sourceEvidence.subject.artifactId] : [])]);
  const artifacts = [...project.artifacts].sort((left, right) => Number(priority.has(right.id)) - Number(priority.has(left.id)));
  const revisions: Record<string, readonly StudioRevisionRecord[]> = {}, reviews: Record<string, readonly StudioReviewSummary[]> = {};
  const wanted = new Set([submission.revisionRef.id, ...references.map((ref) => ref.id)]);
  // 원고를 찾은 뒤에도 캡처 artifact는 읽어 기존 원본의 고정 검수 이미지를 보존한다.
  for (let offset = 0; offset < artifacts.length; offset += 4) {
    const batch = artifacts.slice(offset, offset + 4).filter((entry) => wanted.size || priority.has(entry.id) || entry.kind === "review-snapshot");
    const results = await Promise.allSettled(batch.map(async (artifact) => {
      const [versions, summaries] = await Promise.all([listStudioArtifactRevisions(artifact.id), listStudioReviews(artifact.id)]);
      return { artifact, versions, summaries };
    }));
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const { artifact, versions, summaries } = result.value;
      revisions[artifact.id] = versions; reviews[artifact.id] = summaries;
      for (const version of versions) wanted.delete(version.id);
    }
  }
  const pinned = resolveTaskOutputVisualSource(aggregate, submission, project, revisions, reviews, "제출한 고정 원고");
  const baselines: PinnedSubmissionVisualSource[] = [];
  const add = (source: PinnedSubmissionVisualSource | null) => {
    if (source && !baselines.some((entry) => (entry.comparisonKey ?? entry.sourceRevisionRef.id)
      === (source.comparisonKey ?? source.sourceRevisionRef.id))) baselines.push(source);
  };
  for (const prior of previous) {
    try { add(prior.sourceEvidence ? resolveTaskOutputVisualSource(aggregate, prior, project, revisions, reviews, "이전 제출 원고")
      : resolveSubmissionVisualReview(aggregate, prior, project, revisions, reviews).submission); } catch { /* 조회할 수 없는 이전 이미지를 현재 원고로 대체하지 않는다. */ }
  }
  for (const ref of submission.inputRevisionRefs) {
    const stored = known.find((entry) => sameProductionRevision(ref, entry.revisionRef));
    try { add(stored ? resolveTaskOutputVisualSource(aggregate, stored, project, revisions, reviews, "고정 입력 원고")
      : rawInputSource(ref, project, revisions, reviews)); } catch { /* 입력 참조는 유지하되 검증되지 않은 이미지는 표시하지 않는다. */ }
  }
  return { submission: pinned, baselines };
}
