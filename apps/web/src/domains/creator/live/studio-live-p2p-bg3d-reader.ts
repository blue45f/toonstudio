import { parseStudioCrdtSyncResponse, type StudioCrdtSyncResponse, type createStudioCrdtLocalWireMessage } from "./studio-crdt-protocol";
import { studioCrdtReaderMetadata } from "./studio-crdt-reader-capability";
import type { StudioLiveTransport } from "./studio-live-collaboration-transport";

/** origin 본문은 같은 기기의 primary만 사용하며 RTC로 전달하지 않는다. */
export function respondStudioP2pCrdtSync(input: {
  primary: StudioLiveTransport; response: StudioCrdtSyncResponse; targetSessionId: string;
  workId: string; sessionId: string; hasPeers: boolean;
  send: (message: Parameters<typeof createStudioCrdtLocalWireMessage>[0]) => boolean;
}): boolean {
  if (input.response.artifactScope === "origin") return input.primary.originArtifactScope === "same-origin"
    && input.primary.respondCrdtSync?.(input.response, input.targetSessionId) === true;
  const parsed = parseStudioCrdtSyncResponse(input.response, { expectedWorkId: input.workId });
  if (!parsed || !input.targetSessionId) return false;
  const message = { workId: input.workId, senderSessionId: input.sessionId, targetSessionId: input.targetSessionId,
    kind: "sync-response" as const, payload: parsed, ...studioCrdtReaderMetadata(parsed) };
  if (input.hasPeers && input.send(message)) return true;
  return input.primary.respondCrdtSync ? input.primary.respondCrdtSync(input.response, input.targetSessionId) : input.send(message);
}
