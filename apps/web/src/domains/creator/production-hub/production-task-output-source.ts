import type { ProductionTaskOutputSubject } from "@toonstudio/core/production";
import { canonicalJson, studioReviewPageMappingSchema, type StudioReviewPageMapping } from "@toonstudio/studio-project-model";
import { z } from "zod";
import { getStudioProjectByWork, getStudioReviewPreviews, listStudioArtifactRevisions, listStudioReviews } from "../project-graph/studio-project-graph-client";
import type { StudioRevisionRecord } from "../project-graph/studio-project-graph-contract";
import { parseStudioVirtualSpaceReviewSubject, sameStudioVirtualSpaceReviewSubject } from "../virtual-space/studio-virtual-space-review-subject";

export interface TaskOutputCaptureChoice {
  readonly key: string;
  readonly label: string;
  readonly subject: ProductionTaskOutputSubject;
  readonly revision: StudioRevisionRecord;
}
export interface TaskOutputCapturePage {
  readonly pageId: string;
  readonly ordinal: number;
  readonly sha256: string;
  readonly frameIds: readonly string[];
  readonly url: string;
  readonly expiresAt: number;
  readonly mapping: Extract<StudioReviewPageMapping, { readonly status: "mapped" }>;
}
export interface TaskOutputCapturePages {
  readonly choice: TaskOutputCaptureChoice;
  readonly pages: readonly TaskOutputCapturePage[];
  readonly sourceServerRevision: number;
}
const mismatch = () => new Error("저장된 검수본의 원본·페이지 연결을 확인하지 못했습니다. 다시 불러와 주세요.");
function cancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("원고 선택을 취소했습니다.", "AbortError");
}

/** 표시용 순번을 Production RevisionRef로 바꾸지 않고 실제 저장된 capture만 나열한다. */
export async function loadTaskOutputCaptureChoices(workId: string, { signal }: { readonly signal?: AbortSignal } = {}): Promise<readonly TaskOutputCaptureChoice[]> {
  cancelled(signal);
  const project = await getStudioProjectByWork(workId, signal);
  cancelled(signal);
  if (project.workId !== workId || !project.access.view) throw mismatch();
  const choices: TaskOutputCaptureChoice[] = [];
  const artifacts = project.artifacts.filter((artifact) => artifact.kind === "review-snapshot");
  for (let offset = 0; offset < artifacts.length; offset += 4) {
    const batches = await Promise.all(artifacts.slice(offset, offset + 4).map(async (artifact) => {
      if (artifact.projectId !== project.id || artifact.scope.projectId !== project.id) throw mismatch();
      const [revisions, reviews] = await Promise.all([
        listStudioArtifactRevisions(artifact.id, signal), listStudioReviews(artifact.id),
      ]);
      cancelled(signal);
      if (new Set(reviews.map((review) => review.id)).size !== reviews.length) throw mismatch();
      return reviews.map((review): TaskOutputCaptureChoice => {
        const matches = revisions.filter((entry) => entry.id === review.revisionId), revision = matches[0];
        if (matches.length !== 1 || !revision || review.artifactId !== artifact.id || revision.artifactId !== artifact.id
          || revision.kind !== "review-snapshot" || !revision.blobRefs.some((blob) => blob.role === "preview")
          || (review.sourceRevision && review.sourceRevision.rootGraphHash !== revision.rootGraphHash)) throw mismatch();
        const subject = parseStudioVirtualSpaceReviewSubject({ schemaVersion: 1, projectId: project.id, workId,
          artifactId: artifact.id, reviewId: review.id, revisionId: revision.id, rootGraphHash: revision.rootGraphHash });
        if (!subject) throw mismatch();
        return Object.freeze({ key: JSON.stringify(subject), label: `${review.title} · ${revision.createdAt}`, subject, revision });
      });
    }));
    cancelled(signal);
    choices.push(...batches.flat());
  }
  if (new Set(choices.map((choice) => choice.key)).size !== choices.length) throw mismatch();
  return Object.freeze(choices);
}

const previewSchema = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/u), ordinal: z.number().int().min(0).max(99_999),
  mediaType: z.enum(["image/png", "image/jpeg", "image/webp"]), byteLength: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  url: z.string().max(8192).url().refine((value) => { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; }),
  expiresAt: z.number().int().positive(), mapping: studioReviewPageMappingSchema,
}).strict();

/** 모든 cursor의 manifest·좌표를 확인하기 전에는 제출에 선택할 수 있는 페이지를 반환하지 않는다. */
export async function loadTaskOutputCapturePages(choice: TaskOutputCaptureChoice, { signal }: { readonly signal?: AbortSignal } = {}): Promise<TaskOutputCapturePages> {
  cancelled(signal);
  const subject = parseStudioVirtualSpaceReviewSubject(choice.subject);
  if (!subject || choice.revision.id !== subject.revisionId || choice.revision.artifactId !== subject.artifactId
    || choice.revision.kind !== "review-snapshot" || choice.revision.rootGraphHash !== subject.rootGraphHash) throw mismatch();
  const manifest = new Map<number, string>();
  for (const blob of choice.revision.blobRefs.filter((entry) => entry.role === "preview")) {
    if (!Number.isSafeInteger(blob.ordinal) || blob.ordinal < 0 || blob.ordinal > 99_999
      || !/^[a-f0-9]{64}$/u.test(blob.sha256) || manifest.has(blob.ordinal)) throw mismatch();
    manifest.set(blob.ordinal, blob.sha256);
  }
  if (!manifest.size) throw mismatch();
  const pages: TaskOutputCapturePage[] = [], cursors = new Set<string>(), pageIds = new Set<string>();
  let cursor: string | null = null, previous = -1, sourceServerRevision: number | undefined;
  do {
    cancelled(signal);
    // 이 client는 signal을 받지 않는다. 취소 뒤 응답은 폐기하며 socket 취소를 주장하지 않는다.
    const result = await getStudioReviewPreviews(subject.reviewId, subject, cursor);
    cancelled(signal);
    if (!result.ok || !sameStudioVirtualSpaceReviewSubject(subject, parseStudioVirtualSpaceReviewSubject(result.subject))
      || result.previews.length < 1 || result.previews.length > 32) throw mismatch();
    for (const raw of result.previews) {
      const parsed = previewSchema.safeParse(raw);
      if (!parsed.success) throw mismatch();
      const { ordinal, sha256, mapping } = parsed.data;
      if (ordinal <= previous || manifest.get(ordinal) !== sha256 || mapping.status !== "mapped"
        || mapping.sourceContentDigest !== subject.rootGraphHash || mapping.page.ordinal !== ordinal || pageIds.has(mapping.page.id)
        || (sourceServerRevision !== undefined && sourceServerRevision !== mapping.sourceServerRevision)) throw mismatch();
      previous = ordinal; sourceServerRevision = mapping.sourceServerRevision; pageIds.add(mapping.page.id);
      pages.push(Object.freeze({ pageId: mapping.page.id, ordinal, sha256, frameIds: Object.freeze(mapping.page.frames.map((frame) => frame.id)),
        url: parsed.data.url, expiresAt: parsed.data.expiresAt, mapping }));
    }
    const last = pages[pages.length - 1];
    if (result.nextCursor !== null && (!last || result.nextCursor !== `${last.ordinal}.${last.sha256}` || cursors.has(result.nextCursor))) throw mismatch();
    if (result.nextCursor) cursors.add(result.nextCursor);
    cursor = result.nextCursor;
  } while (cursor !== null);
  if (pages.length !== manifest.size || sourceServerRevision === undefined) throw mismatch();
  return Object.freeze({ choice, pages: Object.freeze(pages), sourceServerRevision });
}

/** 전체 검증을 끝낸 선택 원고에서 한 페이지 URL만 현재 ACL로 다시 확인한다. */
export async function refreshTaskOutputCapturePage(source: TaskOutputCapturePages, ordinal: number, { signal }: { readonly signal?: AbortSignal } = {}): Promise<TaskOutputCapturePage> {
  cancelled(signal);
  const { choice } = source, subject = parseStudioVirtualSpaceReviewSubject(choice.subject);
  const manifest = choice.revision.blobRefs.filter((blob) => blob.role === "preview").sort((left, right) => left.ordinal - right.ordinal);
  const current = source.pages.find((page) => page.ordinal === ordinal), index = manifest.findIndex((blob) => blob.ordinal === ordinal);
  if (!subject || !current || index < 0 || source.pages.length !== manifest.length
    || choice.revision.id !== subject.revisionId || choice.revision.artifactId !== subject.artifactId || choice.revision.rootGraphHash !== subject.rootGraphHash
    || manifest[index]?.sha256 !== current.sha256 || new Set(manifest.map((blob) => blob.ordinal)).size !== manifest.length) throw mismatch();
  const previous = manifest[index - 1], cursor = previous ? `${previous.ordinal}.${previous.sha256}` : null;
  const result = await getStudioReviewPreviews(subject.reviewId, subject, cursor);
  cancelled(signal);
  if (!result.ok || !sameStudioVirtualSpaceReviewSubject(subject, parseStudioVirtualSpaceReviewSubject(result.subject))
    || result.previews.length < 1 || result.previews.length > 32) throw mismatch();
  let lastOrdinal = previous?.ordinal ?? -1, lastHash = "", fresh: TaskOutputCapturePage | null = null;
  for (const raw of result.previews) {
    const parsed = previewSchema.safeParse(raw);
    if (!parsed.success) throw mismatch();
    const preview = parsed.data, baseline = source.pages.find((page) => page.ordinal === preview.ordinal);
    if (!baseline || preview.ordinal <= lastOrdinal || preview.sha256 !== baseline.sha256 || preview.mapping.status !== "mapped"
      || preview.mapping.sourceContentDigest !== subject.rootGraphHash || preview.mapping.sourceServerRevision !== source.sourceServerRevision
      || canonicalJson(preview.mapping) !== canonicalJson(baseline.mapping)) throw mismatch();
    lastOrdinal = preview.ordinal; lastHash = preview.sha256;
    if (preview.ordinal === ordinal) fresh = Object.freeze({ ...baseline, url: preview.url, expiresAt: preview.expiresAt });
  }
  if (!fresh || (result.nextCursor !== null && (result.nextCursor !== `${lastOrdinal}.${lastHash}` || result.nextCursor === cursor))) throw mismatch();
  return fresh;
}
