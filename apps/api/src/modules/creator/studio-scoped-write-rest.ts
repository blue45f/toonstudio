import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { StudioScopedWriteContext } from "@toonstudio/contracts/studio-scoped-write";
import { assertStudioLinked3dPassAssetRows, extractStudioLinked3dPassAssetRequirements } from "@toonstudio/contracts/studio-linked-3d-pass-asset-fence";
import { creatorWorks, db } from "../../platform/database";
import { CREATOR_WORK_REVISION_MAX, createCreatorWorkRevisionSnapshot, creatorWorkRevisionRetentionCutoff } from "../../server/creator-work-revisions";
import { DrizzleCreatorCollaborationUnitOfWork } from "./creator-collaboration.drizzle-persistence";
import type { CreatorSharedDocumentPatch } from "./creator-collaboration.persistence-contract";
import { studioCrdtWorkAdvisoryLockQuery, type DrizzleStudioCrdtTransaction } from "./studio-crdt.repository";
import { loadStudioScopedCrdtAuthority } from "./studio-scoped-crdt-authority";
import { admitStudioScopedWriteEffects, projectStudioScopedAuthoringDocument, StudioScopedWriteDeniedError } from "./studio-scoped-write-effects";
import { authorizeStudioScopedWrite, loadStudioScopedReceipt, lockStudioScopedWork, persistStudioScopedCreations,
  recordStudioScopedReceipt, studioScopedDrizzle, studioScopedRequestHash } from "./studio-scoped-write-store";

export interface StudioScopedRestWriteInput {
  readonly mutationId: string;
  readonly writeContext: StudioScopedWriteContext;
}
const savedSchema = z.object({ workId: z.string(), revision: z.number().int().positive(), updatedAt: z.iso.datetime({ offset: true }) }).strict();

/** caller는 같은 작품 advisory lock을 보유한다. 압축본과 suffix를 합친 최신 권위를 사용한다. */
export async function loadStudioScopedRestAuthority(transaction: DrizzleStudioCrdtTransaction, workId: string, baseline: unknown): Promise<unknown> {
  return (await loadStudioScopedCrdtAuthority(transaction, workId, baseline)).authoringDocument;
}

/** 제한 편집만 별도 권위로 저장한다. 일반 editor는 null을 받아 기존 저장 경로를 유지한다. */
export async function saveStudioScopedRestDocument(input: {
  readonly actorUserId: string; readonly workId: string; readonly baseRevision: number;
  readonly crdtServerSequence: bigint; readonly patch: CreatorSharedDocumentPatch;
  readonly scoped: StudioScopedRestWriteInput;
}): Promise<z.infer<typeof savedSchema> | null> {
  try {
    return await db.transaction(async (transaction) => {
      await transaction.execute(studioCrdtWorkAdvisoryLockQuery(input.workId));
      const query = studioScopedDrizzle(transaction), work = await lockStudioScopedWork(query, input.workId, input.actorUserId, true);
      const requestHash = studioScopedRequestHash({ baseRevision: input.baseRevision, crdtServerSequence: input.crdtServerSequence.toString(),
        patch: input.patch, writeContext: input.scoped.writeContext });
      const receipt = await loadStudioScopedReceipt(query, work, "rest", input.scoped.mutationId, requestHash);
      if (receipt) return savedSchema.parse(receipt.response);
      // 승격 전에 성공한 동일 원문은 현재 full CAS로 재실행하지 않고 원래 영수증만 재현한다.
      if (work.access.edit) return null;
      const authorization = await authorizeStudioScopedWrite(query, work, input.scoped.writeContext);
      if (!authorization.context) throw new ForbiddenException("제한 편집 권한을 확인할 수 없습니다.");
      const unit = new DrizzleCreatorCollaborationUnitOfWork(transaction), sequence = await unit.getStudioCrdtServerSequence(input.workId);
      if (sequence !== input.crdtServerSequence) throw new ConflictException({ code: "creator_crdt_sequence_conflict",
        currentCrdtServerSequence: sequence.toString(), message: "최신 팀 편집을 동기화한 뒤 다시 저장하세요." });
      if (work.revision !== input.baseRevision) throw new ConflictException({ code: "creator_work_revision_conflict",
        currentRevision: work.revision, message: "다른 팀원이 먼저 저장했습니다. 최신 원고를 확인하세요." });
      if (work.revision >= CREATOR_WORK_REVISION_MAX) throw new ConflictException("원고 버전 한도에 도달했습니다.");
      // 전체 preview·제목·납품 설정은 독립 전역 권위다. 원고 편집은 doc-only 계약을 쓴다.
      if (!Object.hasOwn(input.patch, "doc") || Object.keys(input.patch).some((key) => key !== "doc")) {
        throw new BadRequestException({ code: "studio_scoped_document_only", message: "담당 원고는 문서 저장을 사용하세요. 표지·납품 이미지·작품 설정은 제작 관리자 권한입니다." });
      }
      const beforeDocument = await loadStudioScopedRestAuthority(transaction, input.workId, work.document);
      const admission = admitStudioScopedWriteEffects({ before: projectStudioScopedAuthoringDocument(beforeDocument),
        after: projectStudioScopedAuthoringDocument(input.patch.doc), context: authorization.context,
        targets: authorization.targets, ownership: new Map(Object.entries(authorization.policy.ownership)) });
      const current = await unit.findAccessibleDocument(input.actorUserId, input.workId);
      if (!current) throw new ForbiddenException("이 원고를 저장할 수 없습니다.");
      const requirements = extractStudioLinked3dPassAssetRequirements({ cover: current.cover, pages: current.pages, doc: input.patch.doc });
      if (requirements.length) assertStudioLinked3dPassAssetRows({ workId: input.workId, requirements,
        rows: await unit.findStudioLinked3dPassAssets(input.workId, requirements.map((requirement) => requirement.assetId)) });
      // 이 primitive는 검증한 authorization과 같은 transaction 안에만 존재한다. boolean 우회 입력은 없다.
      const updated = await transaction.execute<{ revision: number; updatedAt: Date } & Record<string, unknown>>(sql`
        UPDATE ${creatorWorks} SET doc=${JSON.stringify(input.patch.doc)}::jsonb,revision=revision+1,"updatedAt"=${work.now}::timestamptz
        WHERE id=${input.workId} AND revision=${input.baseRevision} AND revision<${CREATOR_WORK_REVISION_MAX}
          AND EXISTS (SELECT 1 FROM creator_work_collaborator member WHERE member."workId"=${input.workId}
            AND member."userId"=${input.actorUserId} AND member.status='active' AND member.role IN ('viewer','commenter'))
          AND EXISTS (SELECT 1 FROM creator_work_scoped_write_policy policy WHERE policy."workId"=${input.workId}
            AND policy."policyVersion"=${authorization.policy.policyVersion}) RETURNING revision,"updatedAt"`);
      const row = updated.rows[0];
      if (updated.rows.length !== 1 || !row) throw new ConflictException("편집 권한 또는 원고가 변경됐습니다.");
      const response = savedSchema.parse({ workId: input.workId, revision: row.revision,
        updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt });
      await unit.appendWorkRevision(input.workId, response.revision, createCreatorWorkRevisionSnapshot({ ...current, doc: input.patch.doc }), new Date(work.now));
      const cutoff = creatorWorkRevisionRetentionCutoff(response.revision);
      if (cutoff !== null) await unit.deleteWorkRevisionsThrough(input.workId, cutoff);
      await persistStudioScopedCreations(query, authorization, admission.created);
      await recordStudioScopedReceipt(query, authorization, "rest", input.scoped.mutationId, requestHash, admission.targetIds, response);
      return response;
    });
  } catch (error) {
    if (error instanceof StudioScopedWriteDeniedError) throw new ForbiddenException({ code: `studio_scoped_${error.code}`, message: error.message });
    throw error;
  }
}
