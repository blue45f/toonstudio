import { Suspense, useEffect, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { StudioPageThumbnail } from "../studio-page-lazy-ui";
import { studioAutosaveKey, studioSharedAutosaveCompatibility } from "../studio-autosave";
import { latestStudioPreviewRecord, studioProjectPreviewFromAutosave, type PreviewCandidate } from "../studio-autosave-preview-page";
import { useStudioOfflineOwnerPreviewGrant } from "./use-studio-offline-owner-preview-grant";

type OwnerPreviewGrant = Pick<NonNullable<ReturnType<typeof useStudioOfflineOwnerPreviewGrant>>, "userId" | "workId" | "revision">;

async function loadSavedPage(grant: OwnerPreviewGrant, signal: AbortSignal): Promise<PreviewCandidate | null> {
  const key = studioAutosaveKey(grant);
  const [{ createStudioAutosaveOpfsSession }, { acquireStudioAutosaveSqliteStore }] =
    await Promise.all([import("../studio-autosave-opfs-session"), import("../studio-autosave-sqlite-store")]);
  signal.throwIfAborted();
  const [opfs, sqlite] = await Promise.allSettled([
    createStudioAutosaveOpfsSession(key, undefined, { readOnly: true }),
    acquireStudioAutosaveSqliteStore(),
  ]);
  const session = opfs.status === "fulfilled" ? opfs.value : null;
  try {
    signal.throwIfAborted();
    const [journal, row] = await Promise.all([
      session?.readLatest(signal),
      sqlite.status === "fulfilled" ? sqlite.value.read(key) : null,
    ]);
    signal.throwIfAborted();
    const saved = latestStudioPreviewRecord(journal, row);
    if (saved?.state !== "snapshot" || !studioSharedAutosaveCompatibility(saved.payload, grant).compatible) return null;
    return studioProjectPreviewFromAutosave(saved.payload);
  } finally {
    await session?.dispose();
  }
}

function SavedPage({ grant }: { readonly grant: OwnerPreviewGrant }) {
  const t = useBilingual("studio-offline-owner-preview");
  const [preview, setPreview] = useState<PreviewCandidate | null>(null);
  const { userId, workId, revision } = grant;
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

  if (!preview) return null;
  const label = t("기기에 저장된 원고 · 읽기 전용", "On-device manuscript · Read-only");
  return (
    <Suspense fallback={null}>
      <figure data-studio-offline-owner-preview="" data-work-id={workId} aria-label={label}
        className="pointer-events-none mx-auto w-full max-w-3xl px-3 py-2">
        <StudioPageThumbnail page={preview.page} localImagesOnly className="h-[min(52dvh,32rem)]" />
        <figcaption className="mt-2 text-center text-xs text-fg-2">{label}</figcaption>
      </figure>
    </Suspense>
  );
}

/** 온라인 복귀는 기존 원본 조회를 다시 시작한다. 미리보기는 편집기 원고 상태를 변경하지 않는다. */
export function StudioOfflineOwnerPreview({ workId, onReconnect }: {
  readonly workId: string;
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
  return grant?.workId === workId
    ? <SavedPage key={JSON.stringify([grant.userId, workId, grant.revision])} grant={grant} />
    : null;
}
