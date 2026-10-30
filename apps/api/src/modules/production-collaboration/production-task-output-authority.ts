import type { ProductionTaskOutputCaptures, SubmitProductionTaskOutputCommand } from "@toonstudio/core/production";
import type { StudioScopedWriteContext } from "@toonstudio/contracts/studio-scoped-write";
import { canonicalJson } from "@toonstudio/studio-project-model";
import { studioCrdtWorkAdvisoryLockQuery, type DrizzleStudioCrdtTransaction } from "../creator/studio-crdt.repository";
import { authorizeStudioScopedPurpose, assertStudioScopedTaskOutputAuthorization } from "../creator/studio-scoped-write-purpose";
import { loadStudioScopedReceipt, lockStudioScopedWork, recordStudioScopedReceipt, studioScopedDrizzle,
  type StudioScopedAuthorization, type StudioScopedWork } from "../creator/studio-scoped-write-store";
import { StudioScopedWriteDeniedError } from "../creator/studio-scoped-write-effects";
import { ForbiddenException } from "@nestjs/common";

export type ScopedProductionTaskOutputCommand = SubmitProductionTaskOutputCommand & {
  readonly writeContext?: StudioScopedWriteContext;
};

async function scopedOutputOperation<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof StudioScopedWriteDeniedError) throw new ForbiddenException({
      code: "studio_scoped_write_denied", reason: error.code, message: error.message,
    });
    throw error;
  }
}

/** 다른 원고 writer와 같은 advisory → 작품 → 제작 프로젝트 → 정책 순서를 따른다. */
export async function lockProductionTaskOutputWork(transaction: DrizzleStudioCrdtTransaction,
  workId: string, actorUserId: string): Promise<StudioScopedWork> {
  await transaction.execute(studioCrdtWorkAdvisoryLockQuery(workId));
  return lockStudioScopedWork(studioScopedDrizzle(transaction), workId, actorUserId);
}

export async function authorizeProductionTaskOutput(transaction: DrizzleStudioCrdtTransaction,
  work: StudioScopedWork, command: ScopedProductionTaskOutputCommand): Promise<StudioScopedAuthorization> {
  return scopedOutputOperation(() => authorizeStudioScopedPurpose(studioScopedDrizzle(transaction), work, {
    purpose: "submission", ...(command.writeContext ? { writeContext: command.writeContext } : {}),
  }));
}

/** 현재 목적 권한·불변 원고·담당 task를 재검증한 후에만 같은 요청의 영수증을 읽는다. */
export async function inspectScopedProductionTaskOutput(transaction: DrizzleStudioCrdtTransaction,
  authorization: StudioScopedAuthorization, command: ScopedProductionTaskOutputCommand,
  captures: ProductionTaskOutputCaptures, mutationId: string, requestDigest: string) {
  return scopedOutputOperation(async () => {
    const query = studioScopedDrizzle(transaction);
    const targetIds = await assertStudioScopedTaskOutputAuthorization(query, authorization, command, captures);
    const receipt = await loadStudioScopedReceipt(query, authorization.work, "submission", mutationId, requestDigest);
    if (receipt && (receipt.policyVersion !== authorization.policy.policyVersion
      || canonicalJson([...receipt.targetIds].sort()) !== canonicalJson([...targetIds].sort()))) {
      throw new StudioScopedWriteDeniedError("policy");
    }
    return { targetIds, receipt };
  });
}

export async function recordScopedProductionTaskOutput(transaction: DrizzleStudioCrdtTransaction,
  authorization: StudioScopedAuthorization, mutationId: string, requestDigest: string,
  targetIds: readonly string[], response: unknown): Promise<void> {
  await recordStudioScopedReceipt(studioScopedDrizzle(transaction), authorization,
    "submission", mutationId, requestDigest, targetIds, response);
}
