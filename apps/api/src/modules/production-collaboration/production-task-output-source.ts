import { BadRequestException } from "@nestjs/common";
import { canonicalJson } from "@toonstudio/studio-project-model";
import type { ProductionProjectAggregate, ProductionTaskOutputCaptureInput, ProductionTaskOutputCaptures,
  ProductionTaskOutputSources, VerifiedProductionTaskOutputCapture } from "@toonstudio/core/production";
import { sql } from "drizzle-orm";
import { z } from "zod";

import type { db } from "../../platform/database";
import { studioReviewResolutionCaptureFromRows, studioReviewResolutionCaptureQuery,
  studioReviewCaptureFromOperation } from "../studio-project-graph/studio-review-capture-attestation";
import { studioReviewMappingsFromOperation } from "../studio-project-graph/studio-review-source-map";
import { studioReviewPreviewObject, studioReviewPreviewSubjectSchema,
  type StudioReviewPreviewBlobRow } from "../studio-project-graph/studio-review-preview";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const rowSchema = z.object({ pin: studioReviewPreviewSubjectSchema,
  snapshot: z.object({ createdAt: z.iso.datetime({ offset: true }) }).passthrough(),
  capture: z.object({ operation: z.unknown() }).passthrough(), receipt: z.unknown(),
}).passthrough();
const unavailable = () => new BadRequestException("완료된 저장 원고의 식별·이미지·페이지 연결을 확인한 뒤 제출하세요.");

/** 같은 저장 transaction에서 읽은 실제 캡처 chain과 이미지 목록만 업무 근거로 투영한다. */
export function verifiedProductionTaskOutputCaptureFromRows(workId: string, input: ProductionTaskOutputCaptureInput,
  rows: readonly unknown[], blobs: readonly StudioReviewPreviewBlobRow[]): VerifiedProductionTaskOutputCapture {
  const subject = studioReviewPreviewSubjectSchema.safeParse(input.subject);
  if (!subject.success || subject.data.workId !== workId || rows.length !== 1) throw unavailable();
  const row = rowSchema.safeParse(rows[0]);
  if (!row.success || canonicalJson(row.data.pin) !== canonicalJson(subject.data)) throw unavailable();
  const proof = studioReviewResolutionCaptureFromRows(rows[0]);
  const source = studioReviewCaptureFromOperation(row.data.capture.operation, subject.data, row.data.receipt);
  if (!proof || !source || proof.sourceServerRevision !== source.intent.sourceServerRevision
    || !Number.isSafeInteger(proof.sequence) || proof.sequence < 1
    || blobs.length !== source.intent.pageCount || blobs.length === 0) throw unavailable();
  const payloadPages = z.array(z.object({ ordinal: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u) }).strict()).safeParse(source.payload.previews);
  if (!payloadPages.success || payloadPages.data.length !== blobs.length) throw unavailable();
  const mappings = studioReviewMappingsFromOperation(row.data.capture.operation, subject.data, blobs, row.data.receipt);
  const pageIds = new Set<string>(), hashes = new Set<string>();
  const pages = blobs.map((blob, index) => {
    const declared = payloadPages.data[index], mapping = mappings[blob.ordinal];
    if (blob.ordinal !== index || declared?.ordinal !== blob.ordinal || declared.sha256 !== blob.hash
      || !studioReviewPreviewObject(blob) || hashes.has(blob.hash) || !mapping || mapping.status !== "mapped"
      || mapping.sourceServerRevision !== proof.sourceServerRevision
      || mapping.sourceContentDigest !== subject.data.rootGraphHash || mapping.page.ordinal !== blob.ordinal
      || pageIds.has(mapping.page.id)) throw unavailable();
    hashes.add(blob.hash); pageIds.add(mapping.page.id);
    return { pageId: mapping.page.id, ordinal: blob.ordinal, sha256: blob.hash,
      frameIds: mapping.page.frames.map((frame) => frame.id) };
  });
  return { subject: subject.data, sourceServerRevision: proof.sourceServerRevision, captureSequence: proof.sequence,
    createdAt: new Date(row.data.snapshot.createdAt).toISOString(), pages };
}

async function readCapture(transaction: Transaction, aggregate: ProductionProjectAggregate,
  input: ProductionTaskOutputCaptureInput): Promise<VerifiedProductionTaskOutputCapture> {
  const subject = studioReviewPreviewSubjectSchema.safeParse(input.subject);
  if (!subject.success || subject.data.workId !== aggregate.workId) throw unavailable();
  const proofRows = await transaction.execute(studioReviewResolutionCaptureQuery(subject.data.artifactId, [subject.data.reviewId]));
  // 저장 영수증·원고 chain은 공유 쿼리에서 읽으며 별도 PoolClient를 열지 않는다.
  const blobs = await transaction.execute<StudioReviewPreviewBlobRow & Record<string, unknown>>(sql`
    SELECT blob.hash, ref.ordinal, blob.size, blob."mediaType" AS "mediaType",
      blob."objectKey" AS "objectKey", blob."encryptionMetadata" AS "encryptionMetadata",
      blob."malwareStatus" AS "malwareStatus", blob."formatStatus" AS "formatStatus",
      owned.identity AS "workStorageObject"
    FROM studio_revision_blob ref JOIN studio_blob blob ON blob.hash=ref."blobHash"
    LEFT JOIN LATERAL (
      SELECT jsonb_build_object('contractVersion', object."contractVersion",'providerId',object."providerId",
        'purpose',object.purpose,'digest',object.digest,'objectPath',object."objectPath",
        'byteLength',object."byteLength",'contentType',object."contentType") AS identity
      FROM creator_work_asset_storage_reference ownership
      JOIN creator_asset_storage_object object ON object.purpose=ownership.purpose AND object.digest=ownership."objectDigest"
      WHERE ownership."workId"=${aggregate.workId} AND ownership.purpose='derived'
        AND ownership."objectDigest"='sha256:' || blob.hash AND ownership.state='active' AND object.state='active'
      LIMIT 1
    ) owned ON true
    WHERE ref."revisionId"=${subject.data.revisionId} AND ref.role='preview' ORDER BY ref.ordinal,blob.hash`);
  return verifiedProductionTaskOutputCaptureFromRows(aggregate.workId, input, proofRows.rows, blobs.rows);
}

export async function getVerifiedProductionTaskOutputCaptures(transaction: Transaction, aggregate: ProductionProjectAggregate,
  sources: ProductionTaskOutputSources): Promise<ProductionTaskOutputCaptures> {
  const output = await readCapture(transaction, aggregate, sources.output);
  const initial = sources.initial
    ? canonicalJson(sources.initial) === canonicalJson(sources.output) ? output : await readCapture(transaction, aggregate, sources.initial)
    : undefined;
  return { output, ...(initial ? { initial } : {}) };
}
