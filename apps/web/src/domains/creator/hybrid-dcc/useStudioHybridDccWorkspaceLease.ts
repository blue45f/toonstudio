import { useLayoutEffect, useRef, useSyncExternalStore } from "react";

import { getAuthSessionRevision, getAuthUserId, listeners } from "@/domains/auth/public/session/auth-session-state";

import type { StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

function subscribeAuth(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

/** 전달 결과를 읽기 시작한 계정·문서·재질을 포함한 정확한 workspace에 묶는다. */
export function useStudioHybridDccWorkspaceLease(workspace: StudioHybridDccWorkspace, workspaceDocumentId?: string, enabled = true) {
  const revision = useSyncExternalStore(subscribeAuth, getAuthSessionRevision, getAuthSessionRevision);
  const actor = getAuthUserId();
  const owner = JSON.stringify([actor, revision, workspaceDocumentId, workspace.session.state.documentId, enabled]);
  const latest = useRef({ owner, workspace }); latest.current = { owner, workspace };
  const epoch = useRef(0), live = useRef(false), controller = useRef<AbortController | null>(null);
  useLayoutEffect(() => {
    epoch.current += 1; controller.current?.abort(); controller.current = null; live.current = true;
    return () => { epoch.current += 1; live.current = false; controller.current?.abort(); controller.current = null; };
  }, [owner, workspace]);
  return (abort?: AbortController) => {
    epoch.current += 1; controller.current?.abort(); controller.current = abort ?? null;
    const captured = epoch.current;
    return () => enabled && live.current && captured === epoch.current && latest.current.owner === owner && latest.current.workspace === workspace
      && getAuthSessionRevision() === revision && getAuthUserId() === actor && !abort?.signal.aborted;
  };
}
