import type { ProductionProjectAggregate, ProductionTaskOutputEvidence, RevisionRef, ScopeRef, Submission } from "@toonstudio/core/production";
import { selectTaskOutputPreviewPages } from "./production-task-output-preview";
import type { StudioArtifactRecord, StudioProjectRecord, StudioReviewSummary, StudioRevisionRecord } from "../project-graph/studio-project-graph-contract";
import { getStudioProjectByWork, getStudioReviewPreviews, listStudioArtifactRevisions, listStudioReviews, type StudioReviewPreviewRead } from "../project-graph/studio-project-graph-client";
import { studioVirtualSpaceReviewHref } from "../virtual-space/studio-virtual-space-review-invitation";
import { createStudioRevisionCandidates } from "./production-studio-revision-bridge";
import { canonicalJson, studioReviewPageMappingSchema } from "@toonstudio/studio-project-model";
import { z } from "zod";
import { studioReviewCaptureSourceHref } from "../review-capture/studio-review-capture-source";
import { parseStudioVirtualSpaceReviewSubject, sameStudioVirtualSpaceReviewSubject } from "../virtual-space/studio-virtual-space-review-subject";

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
  readonly outputEvidence?: ProductionTaskOutputEvidence;
  readonly comparisonKey?: string;
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
  if (submission.sourceEvidence) return (await import("./production-task-output-visual-review")).loadTaskOutputVisualReview(aggregate, submission);
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

const previewCursor = z.string().regex(/^(0|[1-9][0-9]{0,6})\.[a-f0-9]{64}$/u)
  .refine((value) => Number(value.split(".")[0]) <= 1_000_000);
const pinnedPreview = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/u), ordinal: z.number().int().min(0).max(1_000_000),
  mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]), byteLength: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  url: z.string().max(8_192).url().refine((value) => {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  }),
  expiresAt: z.number().int().positive(), mapping: studioReviewPageMappingSchema,
}).strict();

export type PinnedSubmissionPreview = z.infer<typeof pinnedPreview>;

export interface PinnedSubmissionPreviewOptions {
  /** 읽기용으로 검증한 중간 목록이다. 검수 완료나 작업 권한을 뜻하지 않는다. */
  readonly onValidatedPrefix?: (pages: readonly PinnedSubmissionPreview[]) => void;
  readonly signal?: AbortSignal;
}

const previewMismatch = () => new Error("고정 원고 버전이 일치하지 않습니다. 제출본 연결을 다시 확인하세요.");
function checkPreviewCancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("원고 이미지 조회를 취소했습니다.", "AbortError");
}
function pinnedPreviewSource(source: PinnedSubmissionVisualSource) {
  const subject = parseStudioVirtualSpaceReviewSubject({ schemaVersion: 1, projectId: source.projectId, workId: source.workId,
    artifactId: source.artifact.id, reviewId: source.review.id, revisionId: source.revision.id, rootGraphHash: source.revision.rootGraphHash });
  if (!subject || source.artifact.projectId !== subject.projectId || source.revision.artifactId !== subject.artifactId
    || source.review.artifactId !== subject.artifactId || source.review.revisionId !== subject.revisionId
    || source.sourceRevisionRef.digest !== `sha256:${subject.rootGraphHash}`) throw previewMismatch();
  const manifest = new Map<number, string>();
  for (const blob of source.revision.blobRefs.filter((entry) => entry.role === "preview")) {
    if (!Number.isSafeInteger(blob.ordinal) || blob.ordinal < 0 || blob.ordinal > 1_000_000
      || !/^[a-f0-9]{64}$/u.test(blob.sha256) || manifest.has(blob.ordinal)) throw previewMismatch();
    manifest.set(blob.ordinal, blob.sha256);
  }
  if (!manifest.size) throw new Error("이 고정 원고에는 표시 가능한 이미지가 없습니다.");
  return { subject, manifest };
}
function previewSequence(previousOrdinal = -1, sourceServerRevision: number | undefined = undefined) {
  return { previousOrdinal, sourceServerRevision, cursors: new Set<string>(), ordinals: new Set<number>(), pageIds: new Set<string>() };
}

/** 목록과 주소 갱신이 같은 정본·manifest·좌표 검사를 거치도록 한다. */
async function readPinnedPreviewBatch(source: PinnedSubmissionVisualSource, context: ReturnType<typeof pinnedPreviewSource>,
  sequence: ReturnType<typeof previewSequence>, cursor: string | null, signal?: AbortSignal) {
  checkPreviewCancelled(signal);
  const { subject, manifest } = context;
  const result = await getStudioReviewPreviews(subject.reviewId, {
    projectId: subject.projectId, workId: subject.workId, artifactId: subject.artifactId,
    revisionId: subject.revisionId, rootGraphHash: subject.rootGraphHash,
  }, cursor);
  checkPreviewCancelled(signal);
  if (!result.ok) {
    if (result.reason === "preview-unavailable") throw new SubmissionVisualReviewCaptureRequired(source.captureHref);
    throw new Error(result.reason === "version-mismatch" ? "고정 원고 버전이 일치하지 않습니다. 제출본 연결을 다시 확인하세요." : "이 원고의 Studio 검수가 닫혔습니다.");
  }
  if (!sameStudioVirtualSpaceReviewSubject(subject, parseStudioVirtualSpaceReviewSubject(result.subject))
    || result.previews.length < 1 || result.previews.length > 32) throw previewMismatch();
  const batch: PinnedSubmissionPreview[] = [];
  for (const candidate of result.previews) {
    const parsed = pinnedPreview.safeParse(candidate);
    if (!parsed.success) throw previewMismatch();
    const preview = parsed.data;
    if (preview.ordinal <= sequence.previousOrdinal || sequence.ordinals.has(preview.ordinal)
      || manifest.get(preview.ordinal) !== preview.sha256) throw previewMismatch();
    if (preview.mapping.status === "mapped") {
      const mapping = preview.mapping;
      if (mapping.sourceContentDigest !== subject.rootGraphHash || mapping.page.ordinal !== preview.ordinal
        || sequence.pageIds.has(mapping.page.id)
        || (sequence.sourceServerRevision !== undefined && mapping.sourceServerRevision !== sequence.sourceServerRevision)) throw previewMismatch();
      sequence.sourceServerRevision = mapping.sourceServerRevision; sequence.pageIds.add(mapping.page.id);
    }
    sequence.previousOrdinal = preview.ordinal; sequence.ordinals.add(preview.ordinal); batch.push(Object.freeze(preview));
  }
  if (result.nextCursor !== null) {
    const last = batch[batch.length - 1];
    if (sequence.cursors.has(result.nextCursor)) throw new Error("원고 이미지 목록을 끝까지 확인하지 못했습니다. 다시 불러와 주세요.");
    if (!previewCursor.safeParse(result.nextCursor).success || !last
      || result.nextCursor !== `${last.ordinal}.${last.sha256}`) throw previewMismatch();
    sequence.cursors.add(result.nextCursor);
  }
  return { batch: Object.freeze(batch), nextCursor: result.nextCursor };
}

/** 전체 조회의 성공·실패는 유지하며, 검증된 중간 목록만 선택적으로 먼저 전달한다. */
export async function loadPinnedSubmissionPreviews(source: PinnedSubmissionVisualSource,
  options: PinnedSubmissionPreviewOptions = {}): Promise<readonly PinnedSubmissionPreview[]> {
  checkPreviewCancelled(options.signal);
  const context = pinnedPreviewSource(source), sequence = previewSequence();
  const pages: PinnedSubmissionPreview[] = [];
  let cursor: string | null = null;
  do {
    const result = await readPinnedPreviewBatch(source, context, sequence, cursor, options.signal);
    cursor = result.nextCursor;
    pages.push(...result.batch);
    checkPreviewCancelled(options.signal);
    if (cursor !== null) options.onValidatedPrefix?.(selectTaskOutputPreviewPages(source, Object.freeze([...pages]), false));
  } while (cursor !== null);
  if (pages.length !== context.manifest.size) throw previewMismatch();
  return selectTaskOutputPreviewPages(source, Object.freeze(pages), true);
}

/** 고정 목록의 한 이미지 주소만 갱신한다. 서버가 돌려준 다음 구간은 이어 읽지 않는다. */
export async function refreshPinnedSubmissionPreview(source: PinnedSubmissionVisualSource, current: StudioReviewPreviewRead,
  options: Pick<PinnedSubmissionPreviewOptions, "signal"> = {}): Promise<PinnedSubmissionPreview> {
  checkPreviewCancelled(options.signal);
  const context = pinnedPreviewSource(source), parsed = pinnedPreview.safeParse(current);
  if (!parsed.success || context.manifest.get(parsed.data.ordinal) !== parsed.data.sha256) throw previewMismatch();
  const pinned = parsed.data;
  if (source.outputEvidence && selectTaskOutputPreviewPages(source, [pinned], false).length !== 1) throw previewMismatch();
  if (pinned.mapping.status === "mapped" && (pinned.mapping.sourceContentDigest !== context.subject.rootGraphHash
    || pinned.mapping.page.ordinal !== pinned.ordinal)) throw previewMismatch();
  const refs = [...context.manifest.entries()].sort(([left], [right]) => left - right);
  const index = refs.findIndex(([ordinal]) => ordinal === pinned.ordinal);
  const previous = refs[index - 1];
  const cursor = previous ? `${previous[0]}.${previous[1]}` : null;
  const sequence = previewSequence(previous?.[0] ?? -1,
    pinned.mapping.status === "mapped" ? pinned.mapping.sourceServerRevision : undefined);
  const { batch } = await readPinnedPreviewBatch(source, context, sequence, cursor, options.signal);
  const renewed = batch[0];
  if (!renewed || renewed.ordinal !== pinned.ordinal || renewed.sha256 !== pinned.sha256
    || renewed.mediaType !== pinned.mediaType || renewed.byteLength !== pinned.byteLength
    || canonicalJson(renewed.mapping) !== canonicalJson(pinned.mapping)) throw previewMismatch();
  checkPreviewCancelled(options.signal);
  return Object.freeze({ ...pinned, url: renewed.url, expiresAt: renewed.expiresAt });
}
