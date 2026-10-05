import { useCallback, useEffect, useRef, useState } from "react";

import {
  createResearchNotebook,
  mergeResearchNotebooks,
  parseResearchNotebook,
  RESEARCH_NOTEBOOK_KEY,
  researchNotebookStorageKey,
  sanitizeResearchNotebook,
  serializeResearchNotebook,
} from "./research-notebook";

import {
  getAuthUserId,
  listeners as authListeners,
  type Session,
} from "@/domains/auth/public/session/auth-session-state";

import type { ResearchNotebook } from "./research-notebook";

export type ResearchNotebookRestoreMode = "merge" | "replace";

/**
 * 소유자 파티션의 원문을 읽는다. 스코프 키가 없으면 레거시 기록을 첫
 * 계정이 claim 한다 — 읽은 자리에서 스코프 키로 옮기고 레거시를 지워,
 * 다음 계정이 또 claim 하지 않게 한다. 게스트는 claim 하지 않는다
 * (학습 기록·마켓 찜과 같은 계약).
 */
function readNotebookRaw(ownerKey: string): string | null {
  const scopedKey = researchNotebookStorageKey(ownerKey);
  const scoped = window.localStorage.getItem(scopedKey);
  if (scoped !== null || ownerKey === "guest") return scoped;
  const legacy = window.localStorage.getItem(RESEARCH_NOTEBOOK_KEY);
  if (legacy === null) return null;
  try {
    window.localStorage.setItem(scopedKey, legacy);
    window.localStorage.removeItem(RESEARCH_NOTEBOOK_KEY);
  } catch { /* 이관 쓰기가 실패하면 다음 읽기에서 다시 시도한다. */ }
  return legacy;
}

export function useResearchNotebook() {
  const [notebook, setNotebook] = useState<ResearchNotebook>(createResearchNotebook);
  const [ready, setReady] = useState(false);
  const [writable, setWritable] = useState(true);
  const [error, setError] = useState("");
  const notebookRef = useRef(notebook);
  // 소유자 스코프: 생성 시점의 계정으로 시작하고, 세션 전환마다 저장
  // 키를 갈아끼운다. 게스트는 "guest" 파티션을 쓴다.
  const [ownerKey, setOwnerKey] = useState(() => getAuthUserId() ?? "guest");

  useEffect(() => {
    const syncOwner = (session: Session) => {
      setOwnerKey(session?.user.id ?? "guest");
    };
    authListeners.add(syncOwner);
    return () => {
      authListeners.delete(syncOwner);
    };
  }, []);

  const apply = useCallback((next: ResearchNotebook) => {
    notebookRef.current = next;
    setNotebook(next);
  }, []);

  const persist = useCallback((next: ResearchNotebook): boolean => {
    if (typeof window === "undefined") return false;
    try {
      window.localStorage.setItem(researchNotebookStorageKey(ownerKey), serializeResearchNotebook(next));
      setWritable(true);
      setError("");
      return true;
    } catch (cause) {
      setWritable(false);
      setError(cause instanceof Error ? cause.message : "판단 노트를 저장하지 못했습니다.");
      return false;
    }
  }, [ownerKey]);

  useEffect(() => {
    if (typeof window === "undefined") {
      setReady(true);
      setWritable(false);
      return;
    }

    // 소유자가 바뀌면 그 파티션을 다시 읽어 화면 상태를 갈아끼운다.
    try {
      apply(parseResearchNotebook(readNotebookRaw(ownerKey)));
      setError("");
    } catch (cause) {
      apply(createResearchNotebook());
      setError(cause instanceof Error ? cause.message : "판단 노트를 읽지 못했습니다.");
    } finally {
      setReady(true);
    }

    const receiveStorage = (event: StorageEvent) => {
      if (event.key !== researchNotebookStorageKey(ownerKey)) return;
      try {
        apply(parseResearchNotebook(event.newValue));
        setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "다른 탭의 판단 노트를 읽지 못했습니다.");
      }
    };
    window.addEventListener("storage", receiveStorage);
    return () => window.removeEventListener("storage", receiveStorage);
  }, [apply, ownerKey]);

  const update = useCallback((updater: (current: ResearchNotebook) => ResearchNotebook) => {
    const next = sanitizeResearchNotebook(updater(notebookRef.current));
    apply(next);
    persist(next);
  }, [apply, persist]);

  const restore = useCallback((raw: string, mode: ResearchNotebookRestoreMode): boolean => {
    try {
      const incoming = parseResearchNotebook(raw);
      const next = mode === "replace"
        ? incoming
        : mergeResearchNotebooks(notebookRef.current, incoming);
      apply(next);
      persist(next);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "판단 노트 백업을 읽지 못했습니다.");
      return false;
    }
  }, [apply, persist]);

  const reset = useCallback(() => {
    const next = createResearchNotebook();
    apply(next);
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(researchNotebookStorageKey(ownerKey));
      setWritable(true);
      setError("");
    } catch (cause) {
      setWritable(false);
      setError(cause instanceof Error ? cause.message : "판단 노트를 초기화하지 못했습니다.");
    }
  }, [apply, ownerKey]);

  return { notebook, update, restore, reset, ready, writable, error };
}
