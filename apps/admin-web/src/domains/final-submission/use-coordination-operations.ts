import { projectWorkspaceScope } from "@toonstudio/contracts/admin-workspace";
import { useCallback, useEffect, useRef, useState } from "react";

import { loadAdminIdentity } from "../../platform/http/admin-identity";
import { loadAdminWorkspace } from "../../platform/http/workspace-api";

import type { WorkspaceRecord } from "@toonstudio/contracts/admin-workspace";

type Phase = "loading" | "ready" | "unavailable";
type Snapshot = { owner: string; phase: Phase; records: WorkspaceRecord[]; error: string };
const hidden: Snapshot = { owner: "", phase: "unavailable", records: [], error: "" };

/** 운영 범위만 조회하며 페이지가 숨겨지거나 계정 권한을 재확인할 때 원본을 즉시 폐기한다. */
export function useCoordinationOperations(userIdentity: string, enabled: boolean) {
  const [snapshot, setSnapshot] = useState<Snapshot>(hidden);
  const request = useRef<AbortController | null>(null);
  const clear = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setSnapshot(hidden);
  }, []);
  const reload = useCallback(async () => {
    clear();
    if (!enabled || !userIdentity || document.visibilityState !== "visible") return;
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    setSnapshot({ ...hidden, owner: userIdentity, phase: "loading" });
    try {
      const [view, actor] = await Promise.all([loadAdminWorkspace(signal, "operations"), loadAdminIdentity(signal)]);
      if (signal.aborted || document.visibilityState !== "visible") return;
      if (actor.id !== userIdentity || !["admin", "operator"].includes(actor.role) || view.scope !== "operations" || !view.access.operations.canRead) {
        throw new Error();
      }
      const records = view.state ? projectWorkspaceScope(view.state, "operations").records : [];
      setSnapshot({ owner: userIdentity, phase: "ready", records, error: "" });
    } catch {
      if (!signal.aborted) setSnapshot({ ...hidden, owner: userIdentity, error: "운영 원본과 열람 권한을 확인하지 못했습니다." });
    }
  }, [clear, enabled, userIdentity]);

  useEffect(() => {
    void reload();
    const recheck = () => { void reload(); };
    window.addEventListener("focus", recheck);
    window.addEventListener("online", recheck);
    window.addEventListener("offline", clear);
    window.addEventListener("toonstudio:auth-session-changed", recheck);
    window.addEventListener("toonstudio:final-submission-access-denied", clear);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      request.current?.abort();
      window.removeEventListener("focus", recheck);
      window.removeEventListener("online", recheck);
      window.removeEventListener("offline", clear);
      window.removeEventListener("toonstudio:auth-session-changed", recheck);
      window.removeEventListener("toonstudio:final-submission-access-denied", clear);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [clear, reload]);
  const visible = enabled && snapshot.owner === userIdentity && document.visibilityState === "visible" ? snapshot : hidden;
  return { phase: visible.phase, records: visible.records, error: visible.error, loading: visible.phase === "loading", reload };
}
