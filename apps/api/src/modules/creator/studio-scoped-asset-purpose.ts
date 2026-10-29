import { ForbiddenException } from "@nestjs/common";
import type { StudioScopedWriteContext } from "@toonstudio/contracts/studio-scoped-write";
import { studioCrdtWorkAdvisoryLockQuery, type DrizzleStudioCrdtTransaction } from "./studio-crdt.repository";
import { authorizeStudioScopedPurpose } from "./studio-scoped-write-purpose";
import { lockStudioScopedWork, studioScopedDrizzle } from "./studio-scoped-write-store";
import { StudioScopedWriteDeniedError } from "./studio-scoped-write-effects";

/** 업로드와 사전 검사만 허용한다. 원고 연결·교체·삭제 권한을 추가하지 않는다. */
export async function authorizeStudioScopedAssetPurpose(transaction: DrizzleStudioCrdtTransaction, actor: string,
  workId: string, writeContext?: StudioScopedWriteContext) {
  await transaction.execute(studioCrdtWorkAdvisoryLockQuery(workId));
  const query = studioScopedDrizzle(transaction), work = await lockStudioScopedWork(query, workId, actor, true);
  try { return await authorizeStudioScopedPurpose(query, work, { purpose: "asset", writeContext }); }
  catch (error) { if (error instanceof StudioScopedWriteDeniedError) throw new ForbiddenException(error.message); throw error; }
}
