import { parseStudioWorkflowPack, type StudioWorkflowPack } from "./studio-workflow-pack";

export const WORKFLOW_PACK_BROADCAST_CHANNEL = "toonstudio:workflow-pack-sync:v1";

export interface WorkflowPackSyncMessage {
  readonly type: "toonstudio:workflow-pack:apply";
  readonly senderId: string;
  readonly sentAtMs: number;
  readonly pack: StudioWorkflowPack;
}

export function createWorkflowPackSyncMessage(
  pack: StudioWorkflowPack,
  senderId: string,
  sentAtMs = Date.now(),
): WorkflowPackSyncMessage {
  return {
    type: "toonstudio:workflow-pack:apply",
    senderId,
    sentAtMs,
    pack,
  };
}

export function parseWorkflowPackSyncMessage(raw: unknown): WorkflowPackSyncMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;
  if (candidate.type !== "toonstudio:workflow-pack:apply") return null;
  if (typeof candidate.senderId !== "string" || candidate.senderId.trim().length === 0) return null;
  if (typeof candidate.sentAtMs !== "number" || !Number.isFinite(candidate.sentAtMs)) return null;
  const pack = parseStudioWorkflowPack(JSON.stringify(candidate.pack));
  if (!pack) return null;
  return {
    type: "toonstudio:workflow-pack:apply",
    senderId: candidate.senderId.trim(),
    sentAtMs: candidate.sentAtMs,
    pack,
  };
}

/**
 * 동일 오리진의 다른 스튜디오 탭/협업 창으로 워크플로우 팩 변경을 브로드캐스트한다.
 */
export function broadcastWorkflowPackUpdate(
  pack: StudioWorkflowPack,
  senderId: string,
): boolean {
  if (typeof BroadcastChannel === "undefined") return false;
  try {
    const channel = new BroadcastChannel(WORKFLOW_PACK_BROADCAST_CHANNEL);
    channel.postMessage(createWorkflowPackSyncMessage(pack, senderId));
    channel.close();
    return true;
  } catch {
    return false;
  }
}
