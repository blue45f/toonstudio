import type { PoolClient } from "pg";
import { dbPool } from "../../platform/database";
import { resolveCreatorCollaborationAccess } from "../creator/creator-collaboration.policy";

export async function studioWorkTransaction<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await dbPool.connect();
  try {
    await client.query("BEGIN");
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function readStudioWorkMember(client: PoolClient, actor: string, workId: string, write: boolean) {
  const work = (await client.query<{ userId: string }>(
    `SELECT "userId" FROM creator_work WHERE id=$1 FOR ${write ? "UPDATE" : "SHARE"}`, [workId],
  )).rows[0];
  const user = (await client.query<{ status: string; name: string | null }>(
    'SELECT status,name FROM "user" WHERE id=$1 FOR SHARE', [actor],
  )).rows[0];
  if (!work || user?.status !== "active") return null;
  const membership = (await client.query<{ userId: string; role: string; status: string }>(
    'SELECT "userId",role,status FROM creator_work_collaborator WHERE "workId"=$1 AND "userId"=$2 FOR SHARE', [workId, actor],
  )).rows[0];
  const access = resolveCreatorCollaborationAccess({ actorUserId: actor, ownerUserId: work.userId, membership });
  return access.view ? { access, name: user.name?.trim().slice(0, 80) || "팀원" } : null;
}
