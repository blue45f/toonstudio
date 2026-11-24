import { Suspense, type ReactNode, useCallback, useContext, useEffect, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { StudioPageThumbnail } from "../studio-page-lazy-ui";
import { StudioAutosaveUnsupportedVersionError, studioAutosaveKey, studioSharedAutosaveCompatibility } from "../studio-autosave";
import { latestStudioPreviewRecord, studioProjectPreviewFromAutosave, type PreviewCandidate } from "./studio-autosave-preview-page";
import { StudioOfflineOwnerPreviewVisibility, type StudioOfflinePreviewPhase } from "./studio-offline-owner-preview-visibility";
import { useStudioOfflineOwnerPreviewGrant } from "./use-studio-offline-owner-preview-grant";

type OwnerPreviewGrant = Pick<NonNullable<ReturnType<typeof useStudioOfflineOwnerPreviewGrant>>, "userId" | "workId" | "revision">;

async function readJournal(key: string, signal: AbortSignal) {
  const { createStudioAutosaveOpfsSession } = await import("../studio-autosave-opfs-session");
  signal.throwIfAborted();
  const session = await createStudioAutosaveOpfsSession(key, undefined, { readOnly: true });
  try {
    signal.throwIfAborted();
    return await session?.readLatest(signal);
  } finally {
    await session?.dispose();
  }
}

async function readSqlite(key: string, signal: AbortSignal) {
  const { acquireStudioAutosaveSqliteStore } = await import("../studio-autosave-sqlite-store");
  signal.throwIfAborted();
  const store = await acquireStudioAutosaveSqliteStore();
  signal.throwIfAborted();
  return store.read(key);
}

async function loadSavedPage(grant: OwnerPreviewGrant, signal: AbortSignal): Promise<PreviewCandidate | null> {
  const key = studioAutosaveKey(grant);
  const [journal, row] = await Promise.allSettled([readJournal(key, signal), readSqlite(key, signal)]);
  signal.throwIfAborted();
  for (const result of [journal, row]) {
    if (result.status === "rejected" && result.reason instanceof StudioAutosaveUnsupportedVersionError) return null;
  }
  const saved = latestStudioPreviewRecord(
    journal.status === "fulfilled" ? journal.value : null,
    row.status === "fulfilled" ? row.value : null,
  );
  if (saved?.state !== "snapshot" || !studioSharedAutosaveCompatibility(saved.payload, grant).compatible) return null;
  return studioProjectPreviewFromAutosave(saved.payload);
}

function usePreviewDisplayRef(workId: string, phase: StudioOfflinePreviewPhase) {
  const report = useContext(StudioOfflineOwnerPreviewVisibility);
  return useCallback((node: HTMLElement | null) => {
    report?.(node ? { workId, phase } : null);
  }, [report, workId, phase]);
}

function CheckingPreview({ workId, noticeId }: { readonly workId: string; readonly noticeId?: string }) {
  const t = useBilingual("studio-offline-owner-preview");
  const attach = usePreviewDisplayRef(workId, "checking");
  return (
    <p ref={attach} id={noticeId} role="status" className="py-8 text-center text-sm text-fg-2">
      {t("기기 사본 확인 중", "Checking the on-device copy")}
    </p>
  );
}

function SavedPage({ grant, noticeId, children }: {
  readonly grant: OwnerPreviewGrant;
  readonly noticeId?: string;
  readonly children?: ReactNode;
}) {
  const t = useBilingual("studio-offline-owner-preview");
  const [preview, setPreview] = useState<PreviewCandidate | null>();
  const { userId, workId, revision } = grant;
  const attachPreview = usePreviewDisplayRef(workId, "visible");
  useEffect(() => {
    const controller = new AbortController();
    void loadSavedPage({ userId, workId, revision }, controller.signal).then((page) => {
      if (!controller.signal.aborted) setPreview(page);
    }, () => {
      // 원본을 확인할 수 없으면 기존 원고 잠금 안내를 유지한다.
      if (!controller.signal.aborted) setPreview(null);
    });
    return () => controller.abort();
  }, [userId, workId, revision]);

  if (preview === null) return children;
  const checking = <CheckingPreview workId={workId} noticeId={noticeId} />;
  if (preview === undefined) return checking;
  const label = t("기기에 저장된 원고 · 읽기 전용", "On-device manuscript · Read-only");
  return (
    <Suspense fallback={checking}>
      <figure ref={attachPreview} id={noticeId} data-studio-offline-owner-preview="" data-work-id={workId} aria-label={label}
        className="pointer-events-none mx-auto w-full max-w-3xl px-3 py-2">
        <StudioPageThumbnail page={preview.page} localImagesOnly className="h-[min(52dvh,32rem)]" />
        <figcaption className="mt-2 text-center text-xs text-fg-2">{label}</figcaption>
      </figure>
    </Suspense>
  );
}

/** 온라인 복귀는 기존 원본 조회를 다시 시작한다. 미리보기는 편집기 원고 상태를 변경하지 않는다. */
export function StudioOfflineOwnerPreview({ workId, onReconnect, noticeId, children }: {
  readonly workId: string;
  readonly noticeId?: string;
  readonly children?: ReactNode;
  readonly onReconnect?: () => void;
}) {
  const grant = useStudioOfflineOwnerPreviewGrant(workId);
  useEffect(() => {
    if (!onReconnect) return;
    let wasOffline = !navigator.onLine;
    const offline = () => { wasOffline = true; };
    const online = () => {
      if (wasOffline) onReconnect();
      wasOffline = false;
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, [onReconnect]);
  if (grant === undefined) return <CheckingPreview workId={workId} noticeId={noticeId} />;
  return grant?.workId === workId
    ? <SavedPage key={JSON.stringify([grant.userId, workId, grant.revision])} grant={grant} noticeId={noticeId}>{children}</SavedPage>
    : children;
}
