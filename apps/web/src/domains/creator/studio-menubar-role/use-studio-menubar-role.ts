import { useEffect, useState, useSyncExternalStore } from "react";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { getAuthSessionRevision, getAuthUserId, listeners } from "@/domains/auth/public/session/auth-session-state";
import { getCreatorRoleWorkspace } from "@/platform/creator-role-workspace-client";
import type { CreatorRoleId } from "@/shared/lib/creator-role-contract";
import { GLOBAL_CREATOR_ROLE_WORKSPACE_KEY, resolveCreatorRoleProjectKey } from "@/shared/lib/creator-role-workspace-contract";
import { subscribeCreatorRoleWorkspace } from "@/shared/lib/creator-role-workspace-store";
import { parseStudioDocumentLocation } from "../studio-document-workspace";

const subscribeSession = (notify: () => void) => {
  listeners.add(notify);
  return () => { listeners.delete(notify); };
};
interface RoleSnapshot {
  readonly actor: string;
  readonly revision: number;
  readonly projectKey: string;
  readonly role: CreatorRoleId | null;
}

/** 메뉴 개인화는 서버 권한을 변경하지 않으며 다른 계정의 로컬 역할 캐시를 읽지 않는다. */
export function useStudioMenubarRole() {
  const { status } = useSession();
  const revision = useSyncExternalStore(subscribeSession, getAuthSessionRevision, getAuthSessionRevision);
  const actor = getAuthUserId();
  const location = typeof window === "undefined" ? { pathname: "/studio", search: "" }
    : { pathname: window.location.pathname, search: window.location.search };
  const route = parseStudioDocumentLocation(location);
  const projectKey = route.kind === "document" && route.scope === "project"
    ? `project:${route.projectId}` : resolveCreatorRoleProjectKey(location);
  const [snapshot, setSnapshot] = useState<RoleSnapshot | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !actor) return;
    let disposed = false, generation = 0;
    let request: AbortController | null = null;
    const current = () => !disposed && getAuthUserId() === actor && getAuthSessionRevision() === revision;
    const keys = projectKey === GLOBAL_CREATOR_ROLE_WORKSPACE_KEY
      ? [projectKey] : [GLOBAL_CREATOR_ROLE_WORKSPACE_KEY, projectKey];
    const reload = () => {
      if (!current()) return;
      request?.abort();
      const nextRequest = new AbortController();
      request = nextRequest;
      const expected = ++generation;
      // 공유 캐시 알림은 재조회 계기만 제공하며 값은 현재 인증 세션으로 확인한다.
      void Promise.all(keys.map((key) => getCreatorRoleWorkspace(key, nextRequest.signal))).then((values) => {
        if (!current() || generation !== expected) return;
        const role = values[1]?.document.activeRole ?? values[0]?.document.activeRole ?? null;
        setSnapshot({ actor, revision, projectKey, role });
      }).catch(() => { /* 같은 인증 세대에서 확인한 표시만 유지한다. */ });
    };
    const unsubscribe = keys.map((key) => subscribeCreatorRoleWorkspace(key, reload));
    reload();
    return () => { disposed = true; request?.abort(); for (const stop of unsubscribe) stop(); };
  }, [actor, revision, status, projectKey]);

  return status === "authenticated" && actor && snapshot?.actor === actor
    && snapshot.revision === revision && snapshot.projectKey === projectKey ? snapshot.role : null;
}
