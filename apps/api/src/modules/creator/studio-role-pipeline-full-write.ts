import { ForbiddenException, HttpException } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { assertStudioBg3dRestDocumentInTransaction } from "./studio-bg3d-bundle-rest-gate";
import { assertStudioLegacyPigmentArchiveRestDocumentInTransaction } from "./studio-legacy-pigment-archive-rest-gate";
import type { StudioScopedWriteContext } from "@toonstudio/contracts/studio-scoped-write";
import type { db } from "../../platform/database";
import type { CreatorSharedDocumentPatch } from "./creator-collaboration.persistence-contract";
import type { DrizzleStudioCrdtTransaction } from "./studio-crdt.repository";
import { loadStudioScopedCrdtAuthority } from "./studio-scoped-crdt-authority";
import { admitStudioScopedWriteEffects, projectStudioScopedAuthoringDocument, StudioScopedWriteDeniedError } from "./studio-scoped-write-effects";
import { authorizeStudioScopedWrite, loadStudioScopedPolicy, lockStudioScopedWork, persistStudioScopedCreations, recordStudioScopedReceipt,
  studioScopedDrizzle, studioScopedEffectParameters, studioScopedRequestHash } from "./studio-scoped-write-store";

/** 전체 원고 UPDATE와 같은 transaction 안에서 실제 매핑 효과·귀속·영수증을 함께 기록한다. */
export async function withStudioRolePipelineFullDocumentUpdate<T extends { readonly revision: number }>(
  executor: DrizzleStudioCrdtTransaction | typeof db,
  input: { readonly actorUserId: string; readonly workId: string; readonly baseRevision: number;
    readonly patch: CreatorSharedDocumentPatch; readonly updatedAt: Date; readonly readerCapabilities?: readonly string[];
    readonly scoped?: { readonly mutationId: string; readonly writeContext: StudioScopedWriteContext; readonly crdtServerSequence: bigint } },
  update: () => Promise<readonly T[]>,
): Promise<T | null> {
  if (!("rollback" in executor)) throw new Error("원고 저장에는 같은 transaction의 권한 검사가 필요합니다.");
  const { actorUserId, workId, baseRevision, patch, updatedAt, scoped } = input;
  if (Object.hasOwn(patch, "doc")) await assertStudioLegacyPigmentArchiveRestDocumentInTransaction(executor, workId, patch.doc, undefined, input.readerCapabilities ?? []);
  await assertStudioBg3dRestDocumentInTransaction(executor, workId, patch.doc, input.readerCapabilities ?? []);
  const mapped = Object.hasOwn(patch, "doc") ? await admitStudioRolePipelineFullDocument(executor, actorUserId, workId, patch.doc, scoped?.writeContext) : null;
  const saved = (await update())[0];
  if (saved && mapped && scoped) await recordStudioScopedReceipt(studioScopedDrizzle(executor), mapped.authorization,
    "rest", scoped.mutationId, studioScopedRequestHash({ baseRevision, crdtServerSequence: scoped.crdtServerSequence.toString(),
      patch, writeContext: scoped.writeContext }), mapped.admission.targetIds,
    { workId, revision: saved.revision, updatedAt: updatedAt.toISOString() });
  return saved ?? null;
}

/** 소유자용 레거시 오류 변환에서도 통제된 권한 실패의 상태와 안전한 문구를 유지한다. */
export function isStudioRolePipelineBoundaryError(error: unknown): error is HttpException {
  if (!(error instanceof HttpException)) return false;
  const response = error.getResponse();
  return response !== null && typeof response === "object" && "code" in response
    && typeof response.code === "string" && (response.code.startsWith("studio_scoped_") || response.code.startsWith("studio_bg3d_")
      || response.code.startsWith("studio_legacy_pigment_archive_"));
}

/** 호출자는 원고 advisory/work 잠금을 먼저 보유한다. 전체 편집의 실제 매핑 구역만 재검사한다. */
export async function admitStudioRolePipelineFullDocument(transaction: DrizzleStudioCrdtTransaction,
  actorUserId: string, workId: string, document: unknown, context?: StudioScopedWriteContext) {
  try {
    const query = studioScopedDrizzle(transaction);
    const availability = await query.query(sql`SELECT to_regclass('creator_work_scoped_write_policy') IS NOT NULL AS available`);
    if (availability.length !== 1 || typeof availability[0]?.available !== "boolean") throw new StudioScopedWriteDeniedError("policy");
    if (!availability[0].available || !(await loadStudioScopedPolicy(query, workId)).rolePipeline?.enabled) return null;
    // 정책이 꺼진 소유자 저장에는 협업방의 임시 만료 조건 등 새 협업 정책을 적용하지 않는다.
    const work = await lockStudioScopedWork(query, workId, actorUserId);
    const authorization = await authorizeStudioScopedWrite(query, work, context);
    if (!authorization.mappedFull) return null;
    const current = await loadStudioScopedCrdtAuthority(transaction, workId, work.document);
    const admission = admitStudioScopedWriteEffects({ before: projectStudioScopedAuthoringDocument(current.authoringDocument),
      after: projectStudioScopedAuthoringDocument(document), ...studioScopedEffectParameters(authorization) });
    await persistStudioScopedCreations(query, authorization, admission.created);
    return { authorization, admission };
  } catch (error) {
    if (error instanceof StudioScopedWriteDeniedError) throw new ForbiddenException({ code: `studio_scoped_${error.code}`, message: error.message });
    throw error;
  }
}
