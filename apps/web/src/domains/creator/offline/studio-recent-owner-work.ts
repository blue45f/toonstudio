import { canParticipantEdit } from "../studio-collab/studio-scoped-write-context";
import { isValidStudioWorkspaceWorkId } from "../studio-workspace-route";
import { forgetOfflineOwnerReceipt, readOfflineOwnerReceipt } from "./studio-offline-owner-receipt";

export interface StudioRecentServerWork {
  readonly workId: string;
  readonly openedAt: number;
}

const ownerNamespace = "studio-recent-owner-work-v1";
const teamNamespace = "studio-recent-team-work-v1";

/** 팀 원고를 열어도 오프라인에서 확인할 마지막 소유 원고는 보존한다. */
export async function rememberStudioEditableWork(actorId: string, workId: string, owned: boolean, signal: AbortSignal): Promise<void> {
  const openedAt = Date.now();
  const { acquireStudioLocalDatabase } = await import("../studio-local-database-runtime");
  const database = await acquireStudioLocalDatabase();
  if (!signal.aborted) await database.kvSet(owned ? ownerNamespace : teamNamespace, actorId, JSON.stringify({ workId, openedAt }));
}

function parseRecentWork(raw: string | null): StudioRecentServerWork | null {
  if (!raw) return null;
  let record: unknown;
  try {
    record = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!record || typeof record !== "object" || !("workId" in record) || !isValidStudioWorkspaceWorkId(record.workId)
    || !("openedAt" in record) || typeof record.openedAt !== "number"
    || !Number.isSafeInteger(record.openedAt) || !Number.isFinite(new Date(record.openedAt).getTime()) || record.openedAt < 0) return null;
  return { workId: record.workId, openedAt: record.openedAt };
}

export async function readStudioRecentWork(actorId: string, signal: AbortSignal): Promise<StudioRecentServerWork | null> {
  const { acquireStudioLocalDatabase } = await import("../studio-local-database-runtime");
  const database = await acquireStudioLocalDatabase();
  const owner = parseRecentWork(await database.kvGet(ownerNamespace, actorId));
  if (signal.aborted) return null;
  if (!navigator.onLine) {
    if (!owner) return null;
    const receipt = await readOfflineOwnerReceipt(owner.workId, signal);
    return receipt?.userId === actorId && !signal.aborted ? owner : null;
  }
  const team = parseRecentWork(await database.kvGet(teamNamespace, actorId));
  const recent = team && (!owner || team.openedAt >= owner.openedAt) ? team : owner;
  if (!recent || signal.aborted) return null;
  const { getStudioTeam } = await import("../studio-team-client");
  const current = await getStudioTeam(recent.workId, signal).catch((error: unknown) => {
    if (!signal.aborted && recent.workId === owner?.workId && error instanceof Error && "status" in error
      && [401, 403, 404].some(status => error.status === status)) forgetOfflineOwnerReceipt(recent.workId);
    throw error;
  });
  if (signal.aborted || current.workId !== recent.workId || current.viewer.userId !== actorId) return null;
  const { role, status, capabilities } = current.viewer;
  if (recent.workId === owner?.workId && (role !== "owner" || status !== "active")) forgetOfflineOwnerReceipt(recent.workId);
  return status === "active" && canParticipantEdit(role) && capabilities.edit ? recent : null;
}
