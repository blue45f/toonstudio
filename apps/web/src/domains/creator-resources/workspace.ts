import { useCallback, useEffect, useRef, useState } from "react";

import type { CreatorWorkspace } from "@/shared/lib/creator-resources";
import type { StoryDraft } from "@/shared/lib/creator-workspace-persistence";

import {
  getAuthUserId,
  listeners as authListeners,
  type Session,
} from "@/domains/auth/public/session/auth-session-state";
import { emptyWorkspace } from "@/shared/lib/creator-resources";
import {
  browserWorkspaceLock, createCreatorWorkspaceStorage, CREATOR_WORKSPACE_EVENT,
  creatorWorkspaceStorageKey, workspaceWriteError,
} from "@/shared/lib/creator-workspace-persistence";

function browserStore(ownerKey: string) {
  const key = creatorWorkspaceStorageKey(ownerKey);
  return createCreatorWorkspaceStorage({
    storage: () => window.localStorage,
    ownerKey,
    withLock: browserWorkspaceLock(
      typeof navigator !== "undefined" ? navigator.locks : undefined,
      4000,
      `${key}:write`,
    ),
    notify: () => window.dispatchEvent(new Event(CREATOR_WORKSPACE_EVENT)),
  });
}
export function useCreatorWorkspace() {
  const [workspace, setWorkspace] = useState<CreatorWorkspace>(emptyWorkspace);
  const [readError, setReadError] = useState("");
  const [writeError, setWriteError] = useState("");
  const [ready, setReady] = useState(false);
  const [writable, setWritable] = useState<boolean | undefined>(undefined);
  const [pending, setPending] = useState(0);
  const mounted = useRef(false);
  // 소유자 스코프: 생성 시점의 계정으로 시작하고, 세션 전환(로그인·로그아웃·
  // 계정 교체)마다 저장 키를 갈아끼운다 — 학습 기록·마켓 찜 훅의 세션
  // 바인딩과 같은 계약. 게스트는 "guest" 파티션을 쓴다.
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
  useEffect(() => {
    mounted.current = true;
    const sync = () => {
      try { setWorkspace(browserStore(ownerKey).read()); setReadError(""); }
      catch { setReadError("저장 보드를 읽을 수 없습니다. 기존 데이터를 덮어쓰지 않으니 백업과 브라우저 저장소 설정을 확인하세요."); }
      setReady(true);
      setWritable(Boolean(navigator.locks?.request));
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === creatorWorkspaceStorageKey(ownerKey) || event.key === null) sync();
    };
    sync();
    window.addEventListener("storage", onStorage);
    window.addEventListener(CREATOR_WORKSPACE_EVENT, sync);
    return () => {
      mounted.current = false;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CREATOR_WORKSPACE_EVENT, sync);
    };
  }, [ownerKey]);
  const perform = useCallback(async (operation: () => Promise<CreatorWorkspace>): Promise<boolean> => {
    setPending((count) => count + 1);
    setWriteError("");
    try {
      const committed = await operation();
      // Do not report an already successful write as a failed commit if a later read fails.
      if (mounted.current) {
        try { setWorkspace(browserStore(ownerKey).read()); }
        catch { setWorkspace(committed); setReadError("저장은 완료했지만 최신 보드를 다시 읽지 못했습니다."); }
      }
      return true;
    } catch (cause) {
      if (mounted.current) setWriteError(workspaceWriteError(cause));
      return false;
    } finally { if (mounted.current) setPending((count) => count - 1); }
  }, [ownerKey]);
  const update = useCallback((change: (value: CreatorWorkspace) => CreatorWorkspace) => perform(() => browserStore(ownerKey).update(change)), [perform, ownerKey]);
  const restore = useCallback((raw: string, mode: "merge" | "replace" = "merge", expectedRaw?: string | null) => perform(() => browserStore(ownerKey).restore(raw, mode, expectedRaw)), [perform, ownerKey]);
  const saveStory = useCallback((draft: StoryDraft) => perform(() => browserStore(ownerKey).saveStory(draft)), [perform, ownerKey]);
  const readSnapshot = useCallback(() => browserStore(ownerKey).readRaw(), [ownerKey]);
  const clearError = useCallback(() => setWriteError(""), []);
  return { workspace, update, restore, saveStory, clearError, readSnapshot, ready, writable, saving: pending > 0, error: writeError || readError, ownerKey };
}
export function downloadText(filename: string, content: string, mime = "text/markdown;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}
