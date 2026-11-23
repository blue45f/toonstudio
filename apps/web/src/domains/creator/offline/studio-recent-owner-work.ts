import { isValidStudioWorkspaceWorkId } from "../studio-workspace-route";
import { readOfflineOwnerReceipt } from "./studio-offline-owner-receipt";

export interface StudioRecentOwnerWork {
  readonly workId: string;
  readonly openedAt: number;
}

const namespace = "studio-recent-owner-work-v1";

/** 열람 시각과 작품 식별자를 계정별로 보관한다. 소유권은 링크를 표시할 때 다시 확인한다. */
export async function rememberStudioOwnerWork(actorId: string, workId: string, signal: AbortSignal): Promise<void> {
  const openedAt = Date.now();
  const { acquireStudioLocalDatabase } = await import("../studio-local-database-runtime");
  const database = await acquireStudioLocalDatabase();
  if (!signal.aborted) await database.kvSet(namespace, actorId, JSON.stringify({ workId, openedAt }));
}

export async function readStudioRecentOwnerWork(actorId: string, signal: AbortSignal): Promise<StudioRecentOwnerWork | null> {
  const { acquireStudioLocalDatabase } = await import("../studio-local-database-runtime");
  const database = await acquireStudioLocalDatabase();
  const raw = await database.kvGet(namespace, actorId);
  if (!raw || signal.aborted) return null;
  let record: unknown;
  try {
    record = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!record || typeof record !== "object" || !("workId" in record) || !isValidStudioWorkspaceWorkId(record.workId)
    || !("openedAt" in record) || typeof record.openedAt !== "number"
    || !Number.isSafeInteger(record.openedAt) || !Number.isFinite(new Date(record.openedAt).getTime()) || record.openedAt < 0) return null;
  const recent = { workId: record.workId, openedAt: record.openedAt };
  const { workId } = recent;
  if (!navigator.onLine) {
    const receipt = await readOfflineOwnerReceipt(workId, signal);
    return receipt?.userId === actorId && !signal.aborted ? recent : null;
  }
  const { getStudioTeam } = await import("../studio-team-client");
  const team = await getStudioTeam(workId, signal);
  return !signal.aborted && team.workId === workId && team.viewer.userId === actorId
    && team.viewer.role === "owner" && team.viewer.status === "active" ? recent : null;
}
