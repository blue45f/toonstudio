import { Check, Download, Trash2, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { signOut } from "@/domains/auth/public/session/auth-session-store";
import { deleteMyAccount } from "@/platform/me-client";
import { useT } from "@/shared/lib/i18n";
import { translateBilingualValueForActiveLocale } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import {
  ACCOUNT_BULK_EXPORT_MARKER_KEY,
  parseAccountProjectInventory,
  parseBulkExportMarker,
  resolveAccountDeletionReadiness,
  STUDIO_PROJECT_LIBRARY_STORAGE_KEY_FOR_PORTABILITY,
  type DeletionChecklistItem,
} from "./account-data-portability";
import { DeleteAccountDialog } from "./AccountPage";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("DeleteAccountSection", ko, en);

function itemText(item: DeletionChecklistItem): string {
  const count = item.count ?? 0;
  switch (item.id) {
    case "works-export":
      if (item.status === "pass") {
        return bi(
          `작품 ${count}개가 최신 일괄 다운로드에 포함돼 있어요.`,
          `All ${count} works are in the latest bulk download.`,
        );
      }
      return bi(
        `아직 최신 파일로 받지 못한 작품이 ${count}개 있어요. 탈퇴하면 이 기기의 작품을 다시 받을 수 없어요.`,
        `${count} works are not in an up-to-date download yet. After deletion you cannot download this device's works again.`,
      );
    case "trashed-works":
      return bi(
        `휴지통 작품 ${count}개는 일괄 다운로드에서 제외돼요. 필요한 작품은 먼저 복원해 주세요.`,
        `${count} trashed works are excluded from bulk download. Restore anything you need first.`,
      );
    case "unreadable-works":
      return bi(
        `읽지 못한 작품 기록 ${count}개가 있어 일괄 다운로드에 포함되지 않을 수 있어요.`,
        `${count} unreadable work records may be missing from the bulk download.`,
      );
    case "retained-posts":
      return bi(
        "작성한 글과 댓글은 삭제되지 않고 '탈퇴한 사용자'로 남아요.",
        "Your posts and comments stay behind, attributed to a deleted user.",
      );
    case "library-data":
      return bi(
        "서재 데이터(별점·컬렉션)는 설정의 '내 데이터'에서 따로 내보낼 수 있어요. 탈퇴하면 함께 사라져요.",
        "Library data (ratings, collections) exports separately from Settings > My data, and is removed on deletion.",
      );
  }
}

type BulkState =
  | { readonly kind: "idle" }
  | { readonly kind: "running"; readonly done: number; readonly total: number }
  | { readonly kind: "done"; readonly complete: boolean }
  | { readonly kind: "error" };

/**
 * 계정 탈퇴 섹션 — 위험·저빈도 작업이라 일상적인 프로필 편집(/me)과 분리해
 * 설정의 계정 탭에서만 제공한다. 게스트(userId 없음)에게는 그리지 않는다.
 *
 * 탈퇴 전 점검(G4): 이 기기에 내보낼 작품이 남았으면, 최신 일괄 다운로드가
 * 끝나 있거나 사용자가 "내보내지 않고 탈퇴"를 명시 확인하기 전에는 탈퇴
 * 버튼을 열지 않는다. 걸리는 작품이 없으면 기존 동선 그대로다.
 */
export function DeleteAccountSection({ userId }: { userId: string | null }) {
  const t = useT();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skipExportAck, setSkipExportAck] = useState(false);
  const [bulkState, setBulkState] = useState<BulkState>({ kind: "idle" });
  const [refreshKey, setRefreshKey] = useState(0);

  const readiness = useMemo(() => {
    void refreshKey;
    if (typeof window === "undefined") return null;
    const inventory = parseAccountProjectInventory(
      window.localStorage.getItem(STUDIO_PROJECT_LIBRARY_STORAGE_KEY_FOR_PORTABILITY),
    );
    const marker = parseBulkExportMarker(
      window.localStorage.getItem(ACCOUNT_BULK_EXPORT_MARKER_KEY),
    );
    return resolveAccountDeletionReadiness({
      inventory,
      marker,
      skipExportAcknowledged: skipExportAck,
    });
  }, [refreshKey, skipExportAck]);

  if (!userId) return null;

  const worksBlock = readiness?.items.find((item) => item.id === "works-export");
  const worksBlocked = worksBlock?.status === "block";
  const canDelete = readiness?.canDelete ?? true;
  // 걸리는 작품(내보낼 작품·휴지통·읽지 못한 기록)이 있을 때만 점검표를 보인다.
  const showChecklist = readiness != null && readiness.items.some(
    (item) => item.id !== "retained-posts" && item.id !== "library-data" && (item.count ?? 0) > 0,
  );

  const onBulkDownload = async () => {
    if (bulkState.kind === "running") return;
    setBulkState({ kind: "running", done: 0, total: readiness?.exportableCount ?? 0 });
    try {
      const { downloadAllStudioProjects } = await import("./account-bulk-export");
      const result = await downloadAllStudioProjects({
        storage: window.localStorage,
        authUserId: userId,
        onProgress: (done, total) => setBulkState({ kind: "running", done, total }),
      });
      setBulkState({ kind: "done", complete: result.summary.complete });
    } catch {
      setBulkState({ kind: "error" });
    } finally {
      setRefreshKey((key) => key + 1);
    }
  };

  const onDeleteAccount = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteMyAccount();
      const logout = await signOut();
      if (!logout.ok) throw new Error(logout.error);
      globalThis.location.assign("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("account.profile.errorDelete"));
      setDeleting(false);
    }
  };

  return (
    <>
      <section className="rounded-2xl border border-bad/30 bg-bad/5 p-5">
        <h2 className="text-sm font-semibold text-fg">{t("account.profile.deleteTitle")}</h2>
        <p className="mt-1.5 text-[0.78rem] leading-relaxed text-fg-3">
          {t("account.profile.deleteDesc")}
        </p>

        {showChecklist && readiness ? (
          <div className="mt-4 rounded-xl border border-line bg-panel/60 p-4">
            <p className="text-xs font-bold text-fg">
              {bi("탈퇴 전에 확인해 주세요", "Before you delete, check these")}
            </p>
            <ul className="mt-2.5 space-y-2">
              {readiness.items.map((item) => (
                <li key={item.id} className="flex items-start gap-2 text-xs leading-5 text-fg-2">
                  {item.status === "pass" ? (
                    <Check size={14} className="mt-0.5 shrink-0 text-good" aria-hidden />
                  ) : item.status === "block" || item.status === "warn" ? (
                    <TriangleAlert size={14} className="mt-0.5 shrink-0 text-bad" aria-hidden />
                  ) : (
                    <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-fg-3" aria-hidden />
                  )}
                  <span>{itemText(item)}</span>
                </li>
              ))}
            </ul>

            {worksBlocked ? (
              <div className="mt-3.5 flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { void onBulkDownload(); }}
                    disabled={bulkState.kind === "running"}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-xs font-semibold text-fg transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Download size={14} aria-hidden />
                    {bulkState.kind === "running"
                      ? bi(`작품 받는 중 ${bulkState.done}/${bulkState.total}`, `Downloading ${bulkState.done}/${bulkState.total}`)
                      : bi(
                          `작품 ${readiness.exportableCount}개 일괄 다운로드`,
                          `Download all ${readiness.exportableCount} works`,
                        )}
                  </button>
                  <Link
                    href="/settings?view=data#settings-data"
                    className="inline-flex min-h-11 items-center px-2 text-xs font-medium text-fg-2 underline-offset-2 hover:underline"
                  >
                    {bi("설정 '내 데이터'에서 열기", "Open in Settings > My data")}
                  </Link>
                </div>
                {bulkState.kind === "done" && !bulkState.complete ? (
                  <p className="text-xs font-medium text-bad" role="alert">
                    {bi("일부 작품을 받지 못했어요. 다시 시도하거나, 아래 확인 후 탈퇴할 수 있어요.", "Some works failed to download. Retry, or confirm below to delete anyway.")}
                  </p>
                ) : null}
                {bulkState.kind === "error" ? (
                  <p className="text-xs font-medium text-bad" role="alert">
                    {bi("일괄 다운로드를 시작하지 못했어요.", "Could not start the bulk download.")}
                  </p>
                ) : null}
                <label className="flex min-h-11 cursor-pointer items-start gap-2 text-xs leading-5 text-fg-2">
                  <input
                    type="checkbox"
                    checked={skipExportAck}
                    onChange={(event) => setSkipExportAck(event.target.checked)}
                    className="mt-0.5 size-4 shrink-0 accent-current"
                  />
                  <span>
                    {bi(
                      "작품을 내보내지 않고 탈퇴할게요. 이 기기의 작품은 탈퇴 후 다시 받을 수 없다는 것을 이해했어요.",
                      "Delete without downloading my works. I understand this device's works cannot be downloaded after deletion.",
                    )}
                  </span>
                </label>
              </div>
            ) : null}
          </div>
        ) : null}

        {error && (
          <p className="mt-3 rounded-xl border border-bad/40 bg-bad/10 px-3.5 py-2.5 text-sm text-bad" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          disabled={deleting || !canDelete}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-bad/45 px-3 py-2 text-xs font-semibold text-bad transition-colors hover:bg-bad/10 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Trash2 size={14} />
          {t("account.profile.deleteTitle")}
        </button>
        {!canDelete ? (
          <p className="mt-2 text-[0.72rem] leading-relaxed text-fg-3">
            {bi(
              "위에서 작품을 일괄 다운로드하거나 '내보내지 않고 탈퇴'를 확인하면 탈퇴 버튼이 열려요.",
              "Download your works above, or confirm deleting without a download, to enable deletion.",
            )}
          </p>
        ) : null}
      </section>

      <DeleteAccountDialog
        open={deleteOpen}
        deleting={deleting}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          void onDeleteAccount();
        }}
      />
    </>
  );
}
