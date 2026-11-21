import { Suspense, useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { getAuthUserId, useSession } from "@/domains/auth/public/session/auth-session-store";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import { resetFailedStudioLocalDatabaseOwnership } from "../studio-local-database-runtime";
import { readStudioLiveRoomQuery } from "../live/studio-live-jam-session";
import { StudioVirtualSpaceAppHost } from "./StudioVirtualSpaceAppHost";
import { StudioVirtualSpaceAppStore } from "./StudioVirtualSpaceAppStore";
import { listStoreApps } from "./studio-virtual-space-app-store";
import { accessStudioSpaceRecord, observeStudioSpaceRecords } from "./studio-space-device-record";

const appIds = listStoreApps().map(app => app.id);
const LazyStudioIpCreativeEnginesPanel = lazyRetry(
  () =>
    import("../ip-creative-engines/StudioIpCreativeEnginesPanel").then((module) => ({
      default: module.StudioIpCreativeEnginesPanel,
    })),
  "StudioIpCreativeEnginesPanel",
);

export function StudioWorkspaceMiniApps({ projectId }: { readonly projectId?: string }) {
  const actor = useSession().data?.user.id ?? null;
  const { workId } = useParams();
  const room = readStudioLiveRoomQuery(useLocation().search);
  const prefix = "toonstudio:workspace-apps:v1:" + JSON.stringify([actor, workId ?? projectId ?? room]) + ":";
  return (
    <>
      <ScopedMiniApps key={prefix} prefix={prefix} actor={actor} />
      <IpCreativeEnginesDisclosure projectId={workId ?? projectId} />
    </>
  );
}

function IpCreativeEnginesDisclosure({ projectId }: { readonly projectId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <details
      data-testid="studio-ip-creative-engines-disclosure"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="mt-4 rounded-2xl border border-line bg-card/90 p-3"
    >
      <summary
        data-testid="studio-ip-creative-engines-summary"
        className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-xl px-1 text-sm font-bold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [word-break:keep-all]"
      >
        <span>IP 창작·가독성·컷재활용·텐션·오디오/트레일러·현지화·클린룸 스위트</span>
        <span className="shrink-0 rounded-full border border-line bg-panel px-2.5 py-0.5 text-xs font-semibold text-fg-2">
          과금 ₩0 · 펼쳐서 열기
        </span>
      </summary>
      {open ? (
        <div className="mt-3">
          <Suspense fallback={<p role="status">IP 창작 스위트를 불러오는 중입니다.</p>}>
            <LazyStudioIpCreativeEnginesPanel projectId={projectId} />
          </Suspense>
        </div>
      ) : null}
    </details>
  );
}

function ScopedMiniApps({ prefix, actor }: { readonly prefix: string; readonly actor: string | null }) {
  const bt = useBilingual("StudioVirtualSpaceAppStore");
  const [writeFailed, setWriteFailed] = useState(false);
  const [snapshot, setSnapshot] = useState<readonly string[] | null>();
  const [retry, setRetry] = useState(0);
  const active = useRef(true);
  const refresh = () => setRetry(count => count + 1);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => {
    let cancelled = false;
    const current = () => !cancelled && getAuthUserId() === actor;
    void Promise.all(appIds.map(async id => await accessStudioSpaceRecord(prefix + id, undefined, current) === "1" ? id : null))
      .then(ids => { if (current()) setSnapshot(ids.filter(id => id !== null)); },
        () => { if (current()) setSnapshot(null); });
    const stop = observeStudioSpaceRecords(key => { if (key.startsWith(prefix)) refresh(); });
    return () => { cancelled = true; stop(); };
  }, [actor, prefix, retry]);
  const retryRead = async () => {
    await resetFailedStudioLocalDatabaseOwnership();
    if (active.current && getAuthUserId() === actor) refresh();
  };
  const installed = snapshot ?? [];
  const change = async (next: readonly string[]) => {
    if (!snapshot || !active.current || getAuthUserId() !== actor) return;
    const id = appIds.find(id => next.includes(id) !== installed.includes(id));
    if (!id) return;
    const current = () => active.current && getAuthUserId() === actor;
    try {
      if (writeFailed) await resetFailedStudioLocalDatabaseOwnership();
      await accessStudioSpaceRecord(prefix + id, () => ({ value: next.includes(id) ? "1" : null }), () => getAuthUserId() === actor);
      if (current()) { setWriteFailed(false); refresh(); }
    } catch {
      if (current()) setWriteFailed(true);
    }
  };
  return <>
    {Array.isArray(snapshot) && <StudioVirtualSpaceAppStore installedAppIds={installed} onInstalledChange={change} />}
    {snapshot === undefined && <p role="status">{bt("설치 목록을 불러오는 중이에요.", "Loading installed apps.")}</p>}
    {snapshot === null || writeFailed ? <p role="alert">
      {snapshot === null
        ? bt("이 기기의 설치 목록을 열지 못했습니다.", "Could not read the apps installed on this device.")
        : bt("설치 목록을 저장하지 못했습니다. 기기 저장 공간을 확인한 뒤 다시 시도해 주세요.", "Could not save the installed apps. Check device storage and try again.")}
      {snapshot === null ? <button type="button" onClick={retryRead}>{bt("다시 읽기", "Retry")}</button> : null}
    </p> : null}
    <StudioVirtualSpaceAppHost installedAppIds={installed} />
  </>;
}
