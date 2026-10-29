import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { canonicalJson } from "@toonstudio/studio-project-model";
import { STUDIO_WRITER_ROOM_LIMITS, StudioWriterRoomCaptureRequestSchema, StudioWriterRoomCaptureResponseSchema,
  StudioWriterRoomDocumentSchema, type StudioWriterRoomCaptureRequest, type StudioWriterRoomCaptureResponse } from "@toonstudio/contracts/studio-writer-room";
import { db } from "../../platform/database";
import { studioReviewCaptureFromOperation, studioReviewResolutionCaptureFromRows, studioReviewResolutionCaptureQuery } from "../studio-project-graph/studio-review-capture-attestation";
import { studioCrdtWorkAdvisoryLockQuery } from "./studio-crdt.repository";
import { scopedRecord, StudioScopedWriteDeniedError } from "./studio-scoped-write-effects";
import { loadStudioScopedProduction, lockStudioScopedWork, studioScopedDrizzle, type StudioScopedSql, type StudioScopedWork } from "./studio-scoped-write-store";

const unavailable = () => new NotFoundException({ code: "studio_writer_room_capture_unavailable", message: "이 제출본의 고정 대본 원고를 확인할 수 없습니다." });

/** 현재 view ACL을 잠근 같은 transaction에서 불변 capture와 실제 Production 제출 귀속을 읽는다. */
export async function readStudioWriterRoomCapture(query: StudioScopedSql, work: StudioScopedWork,
  raw: StudioWriterRoomCaptureRequest): Promise<StudioWriterRoomCaptureResponse> {
  const input = StudioWriterRoomCaptureRequestSchema.parse(raw), pin = input.subject;
  if (!work.access.view) throw new ForbiddenException("이 고정 대본을 열람할 수 없습니다.");
  if (pin.workId !== work.workId) throw unavailable();
  const aggregate = await loadStudioScopedProduction(query, work.workId, input.productionProjectId).catch((error: unknown) => {
    if (error instanceof StudioScopedWriteDeniedError) throw unavailable();
    throw error;
  });
  const submissions = aggregate.submissions.filter((submission) => submission.id === input.submissionId), submission = submissions[0];
  if (submissions.length !== 1 || !submission || submission.projectId !== aggregate.projectId) throw unavailable();
  const rows = await query.query(studioReviewResolutionCaptureQuery(pin.artifactId, [pin.reviewId]));
  const row = rows.length === 1 ? scopedRecord(rows[0]) : null;
  const capture = row && studioReviewResolutionCaptureFromRows(row), operation = scopedRecord(row?.capture)?.operation;
  const proof = row && studioReviewCaptureFromOperation(operation, pin, row.receipt);
  if (!capture || !proof || canonicalJson(capture.subject) !== canonicalJson(pin) || capture.sourceServerRevision > work.revision) throw unavailable();
  const reviews = await query.query(sql`SELECT status FROM studio_review WHERE id=${pin.reviewId} AND "artifactId"=${pin.artifactId}
    AND "revisionId"=${pin.revisionId}`);
  if (reviews.length !== 1) throw unavailable();
  const base = { contract: "studio-writer-room-capture-v1" as const, productionProjectId: aggregate.projectId,
    submissionId: submission.id, subject: pin, sourceServerRevision: capture.sourceServerRevision,
    captureSequence: capture.sequence, reviewStatus: reviews[0]?.status };
  const evidence = submission.sourceEvidence;
  if (!evidence) return StudioWriterRoomCaptureResponseSchema.parse({ ...base, status: "unbound" });
  const deliverables = aggregate.deliverables.filter((deliverable) => deliverable.id === submission.deliverableId), deliverable = deliverables[0];
  if (evidence.documentRole !== "story" || evidence.kind !== "studio-review-capture" || evidence.version !== 1
    || evidence.taskId === "" || evidence.sourceServerRevision !== capture.sourceServerRevision || evidence.captureSequence !== capture.sequence
    || canonicalJson(evidence.subject) !== canonicalJson(pin) || submission.revisionRef.id !== pin.revisionId
    || submission.revisionRef.digest !== `sha256:${pin.rootGraphHash}` || submission.revisionRef.lineage !== "narrative"
    || submission.revisionRef.revision !== capture.sourceServerRevision || deliverables.length !== 1 || !deliverable
    || deliverable.projectId !== aggregate.projectId || canonicalJson(evidence.scope) !== canonicalJson(deliverable.scope)
    || !aggregate.tasks.some((task) => task.id === evidence.taskId && task.projectId === aggregate.projectId && task.outputDeliverableIds.includes(deliverable.id))) {
    throw new ConflictException({ code: "studio_writer_room_submission_mismatch", message: "선택한 제출본과 고정 대본의 버전·업무 범위가 다릅니다." });
  }
  const document = scopedRecord(proof.payload.sourceSnapshot);
  if (!document || !Object.hasOwn(document, "writerRoom") || document.writerRoom === null) return StudioWriterRoomCaptureResponseSchema.parse({ ...base, status: "missing" });
  if (new TextEncoder().encode(JSON.stringify(document.writerRoom)).byteLength > STUDIO_WRITER_ROOM_LIMITS.maxSerializedBytes) {
    return StudioWriterRoomCaptureResponseSchema.parse({ ...base, status: "invalid", reason: "byte-budget-exceeded" });
  }
  const writerRoom = StudioWriterRoomDocumentSchema.safeParse(document.writerRoom);
  if (!writerRoom.success) return StudioWriterRoomCaptureResponseSchema.parse({ ...base, status: "invalid", reason: "invalid-document" });
  const stages = writerRoom.data.stages;
  if ([stages.beats.items, stages.scenes.items, stages["panel-plan"].items, stages["dialogue-sfx"].dialogue, stages["dialogue-sfx"].sfx,
    writerRoom.data.suggestions].some((items) => new Set(items.map((item) => item.id)).size !== items.length)) {
    return StudioWriterRoomCaptureResponseSchema.parse({ ...base, status: "invalid", reason: "invalid-document" });
  }
  return StudioWriterRoomCaptureResponseSchema.parse({ ...base, status: "available", writerRoom: writerRoom.data });
}

export class StudioWriterRoomCaptureRepository {
  read(actorUserId: string, raw: StudioWriterRoomCaptureRequest): Promise<StudioWriterRoomCaptureResponse> {
    const input = StudioWriterRoomCaptureRequestSchema.parse(raw);
    return db.transaction(async (transaction) => {
      await transaction.execute(studioCrdtWorkAdvisoryLockQuery(input.subject.workId));
      const query = studioScopedDrizzle(transaction), work = await lockStudioScopedWork(query, input.subject.workId, actorUserId);
      return readStudioWriterRoomCapture(query, work, input);
    });
  }
}
