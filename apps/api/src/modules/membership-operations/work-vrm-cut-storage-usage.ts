import { eq, sql } from "drizzle-orm";
import { creatorWorks, type db } from "../../platform/database";
import { studioWorkVrmCuts } from "../../platform/database/studio-raster-asset.schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function hasWorkVrmCutStorage(transaction: Pick<Transaction, "execute">): Promise<boolean> {
  const { rows } = await transaction.execute(sql`SELECT to_regclass('public.studio_work_vrm_cut') AS relation`);
  return Boolean((rows?.[0] as { relation?: string } | undefined)?.relation);
}

/** 0125 적용 전의 원고도 기존 저장량으로 열리게 한다. 모델·PNG는 기존 에셋 사용량에 포함된다. */
export async function readWorkVrmCutStorageBytes(transaction: Transaction, scope: { workId: string } | { ownerId: string }): Promise<number> {
  if (!await hasWorkVrmCutStorage(transaction)) return 0;
  const [row] = await transaction.select({ bytes: sql<string>`coalesce(sum(octet_length(${studioWorkVrmCuts.sceneText})),0)::bigint` })
    .from(studioWorkVrmCuts).innerJoin(creatorWorks, eq(creatorWorks.id, studioWorkVrmCuts.workId))
    .where("workId" in scope ? eq(studioWorkVrmCuts.workId, scope.workId) : eq(creatorWorks.userId, scope.ownerId));
  return Number(row?.bytes ?? 0);
}
