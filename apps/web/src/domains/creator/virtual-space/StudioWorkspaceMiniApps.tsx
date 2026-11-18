import { useCallback, useState, useSyncExternalStore } from "react";
import { useLocation, useParams } from "react-router-dom";
import { getAuthUserId, useSession } from "@/domains/auth/public/session/auth-session-store";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { readStudioLiveRoomQuery } from "../live/studio-live-jam-session";
import { StudioVirtualSpaceAppHost } from "./StudioVirtualSpaceAppHost";
import { StudioVirtualSpaceAppStore } from "./StudioVirtualSpaceAppStore";
import { listStoreApps } from "./studio-virtual-space-app-store";

const localChange = "studio-workspace-mini-apps-changed";
const appIds = listStoreApps().map(app => app.id);
const serverSnapshot = () => "";

export function StudioWorkspaceMiniApps({ projectId }: { readonly projectId?: string }) {
  const actor = useSession().data?.user.id ?? null;
  const { workId } = useParams();
  const room = readStudioLiveRoomQuery(useLocation().search);
  const prefix = "toonstudio:workspace-apps:v1:" + JSON.stringify([actor, workId ?? projectId ?? room]) + ":";
  return <ScopedMiniApps key={prefix} prefix={prefix} actor={actor} />;
}

function ScopedMiniApps({ prefix, actor }: { readonly prefix: string; readonly actor: string | null }) {
  const bt = useBilingual("StudioVirtualSpaceAppStore");
  const [writeFailed, setWriteFailed] = useState(false);
  const subscribe = useCallback((notify: () => void) => {
    const storageChanged = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(prefix)) notify();
    };
    const changedHere = (event: Event) => {
      if ((event as CustomEvent<string>).detail === prefix) notify();
    };
    window.addEventListener("storage", storageChanged);
    window.addEventListener(localChange, changedHere);
    return () => {
      window.removeEventListener("storage", storageChanged);
      window.removeEventListener(localChange, changedHere);
    };
  }, [prefix]);
  const read = useCallback(() => {
    try {
      return appIds.filter(id => window.localStorage.getItem(prefix + id) === "1").join(",");
    } catch {
      return null;
    }
  }, [prefix]);
  const snapshot = useSyncExternalStore(subscribe, read, serverSnapshot);
  const installed = snapshot ? snapshot.split(",") : [];
  const refresh = () => window.dispatchEvent(new CustomEvent(localChange, { detail: prefix }));
  const change = (next: readonly string[]) => {
    if (getAuthUserId() !== actor) return;
    const id = appIds.find(id => next.includes(id) !== installed.includes(id));
    if (!id) return;
    try {
      // 앱마다 별도 키에 기록해 두 탭이 서로 다른 앱을 동시에 설치해도 보존한다.
      if (next.includes(id)) window.localStorage.setItem(prefix + id, "1");
      else window.localStorage.removeItem(prefix + id);
      setWriteFailed(false);
      refresh();
    } catch {
      setWriteFailed(true);
    }
  };
  return <>
    <StudioVirtualSpaceAppStore installedAppIds={installed} onInstalledChange={change} />
    {snapshot === null || writeFailed ? <p role="alert">
      {snapshot === null
        ? bt("이 기기의 설치 목록을 열지 못했습니다.", "Could not read the apps installed on this device.")
        : bt("설치 목록을 저장하지 못했습니다. 기기 저장 공간을 확인한 뒤 다시 시도해 주세요.", "Could not save the installed apps. Check device storage and try again.")}
      {snapshot === null ? <button type="button" onClick={refresh}>{bt("다시 읽기", "Retry")}</button> : null}
    </p> : null}
    <StudioVirtualSpaceAppHost installedAppIds={installed} />
  </>;
}
