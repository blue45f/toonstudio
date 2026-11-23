import { useEffect, useState } from "react";

import { readStudioRecentWork, type StudioRecentServerWork } from "../offline/studio-recent-owner-work";

/** 계정 전환이나 재연결 때마다 현재 편집 권한을 다시 확인한 링크만 반환한다. */
export function useStudioRecentOwnerWork(actorId: string | null): StudioRecentServerWork | null {
  const [confirmed, setConfirmed] = useState<{ actorId: string; recent: StudioRecentServerWork } | null>(null);
  useEffect(() => {
    if (!actorId) {
      setConfirmed(null);
      return;
    }
    let request: AbortController | undefined;
    const refresh = () => {
      request?.abort();
      request = new AbortController();
      const { signal } = request;
      setConfirmed(null);
      void readStudioRecentWork(actorId, signal).then(recent => {
        if (recent && !signal.aborted) setConfirmed({ actorId, recent });
      }).catch(() => { /* 기기 이력이나 현재 편집 권한을 확인할 수 없으면 링크를 숨긴다. */ });
    };
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      request?.abort();
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [actorId]);
  return confirmed && confirmed.actorId === actorId ? confirmed.recent : null;
}
