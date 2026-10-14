import { Archive, Check, Download, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { translateBilingualValueForActiveLocale } from "@/shared/lib/i18n-bilingual-copy";
import { formatCount } from "@/shared/lib/utils";

import {
  ACCOUNT_BULK_EXPORT_MARKER_KEY,
  parseAccountProjectInventory,
  parseBulkExportMarker,
  bulkExportMarkerCovers,
  STUDIO_PROJECT_LIBRARY_STORAGE_KEY_FOR_PORTABILITY,
  type BulkExportSummary,
} from "./account-data-portability";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("AccountDataPortabilityPanel", ko, en);

type PanelState =
  | { readonly kind: "idle" }
  | { readonly kind: "running"; readonly done: number; readonly total: number }
  | { readonly kind: "done"; readonly summary: BulkExportSummary }
  | { readonly kind: "error"; readonly message: string };

/**
 * 작품 일괄 다운로드 패널 (G4) — 설정 "내 데이터" 표면.
 *
 * 서재 백업(별점·컬렉션 JSON)과 별개로, 이 기기에 있는 작품 전체를 작품별
 * .toonstudio 패키지(원고 포함)로 한 번에 내려받는다. 실행 모듈은 클릭
 * 시점에만 동적 로드해 설정 첫 화면 번들에 싣지 않는다.
 */
export function AccountDataPortabilityPanel({
  userId,
  locale,
}: {
  userId: string | null;
  locale: "ko" | "en";
}) {
  const [state, setState] = useState<PanelState>({ kind: "idle" });
  const [failedIds, setFailedIds] = useState<readonly string[]>([]);
  // 다운로드가 끝나면 표식이 바뀌므로 인벤토리를 다시 읽는다.
  const [refreshKey, setRefreshKey] = useState(0);

  const snapshot = useMemo(() => {
    void refreshKey;
    if (typeof window === "undefined") return null;
    const inventory = parseAccountProjectInventory(
      window.localStorage.getItem(STUDIO_PROJECT_LIBRARY_STORAGE_KEY_FOR_PORTABILITY),
    );
    const marker = parseBulkExportMarker(
      window.localStorage.getItem(ACCOUNT_BULK_EXPORT_MARKER_KEY),
    );
    return { inventory, marker, covered: bulkExportMarkerCovers(inventory, marker) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refreshKey가 재읽기 트리거다.
  }, [refreshKey]);

  if (!snapshot) return null;
  const { inventory, marker, covered } = snapshot;
  const exportableCount = inventory.exportable.length;
  const running = state.kind === "running";

  const startDownload = async (onlyIds?: readonly string[]) => {
    if (running || exportableCount === 0) return;
    setState({ kind: "running", done: 0, total: onlyIds?.length ?? exportableCount });
    try {
      const { downloadAllStudioProjects } = await import("./account-bulk-export");
      const result = await downloadAllStudioProjects({
        storage: window.localStorage,
        authUserId: userId,
        onlyIds,
        onProgress: (done, total) => setState({ kind: "running", done, total }),
      });
      setFailedIds(result.summary.failedIds);
      setState({ kind: "done", summary: result.summary });
    } catch (err) {
      setState({
        kind: "error",
        message: err instanceof Error ? err.message : bi("내려받기를 시작하지 못했어요.", "Could not start the download."),
      });
    } finally {
      setRefreshKey((key) => key + 1);
    }
  };

  return (
    <div className="border-t border-line/60 px-1 py-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-raised text-fg-2">
          <Archive size={16} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">
            {bi("작품 일괄 다운로드", "Download all my works")}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-fg-3">
            {exportableCount > 0
              ? bi(
                  `이 기기의 작품 ${formatCount(exportableCount, locale)}개를 작품별 파일(.toonstudio, 원고 포함)로 한 번에 내려받아요. 서재 백업과는 별개예요.`,
                  `Download all ${formatCount(exportableCount, locale)} works on this device as per-work files (.toonstudio, manuscripts included). Separate from the library backup.`,
                )
              : bi(
                  "이 기기에 내려받을 작품이 없어요. 작품은 이 브라우저에 저장되니, 다른 기기의 작품은 그 기기에서 내려받아 주세요.",
                  "No works to download on this device. Works are stored in this browser — download them from the device you created them on.",
                )}
            {inventory.trashed.length > 0
              ? bi(
                  ` 휴지통 작품 ${formatCount(inventory.trashed.length, locale)}개는 제외돼요.`,
                  ` ${formatCount(inventory.trashed.length, locale)} trashed works are excluded.`,
                )
              : ""}
            {inventory.unreadableCount > 0
              ? bi(
                  ` 읽지 못한 기록 ${formatCount(inventory.unreadableCount, locale)}개는 포함되지 않을 수 있어요.`,
                  ` ${formatCount(inventory.unreadableCount, locale)} unreadable records may be missing.`,
                )
              : ""}
          </p>
          {marker && exportableCount > 0 ? (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-fg-2">
              {covered ? <Check size={13} className="text-good" aria-hidden /> : <TriangleAlert size={13} className="text-bad" aria-hidden />}
              {covered
                ? bi("최근 일괄 다운로드로 전 작품이 백업돼 있어요.", "All works are covered by the latest bulk download.")
                : bi("마지막 일괄 다운로드 이후 바뀌거나 받지 못한 작품이 있어요.", "Some works changed or failed since the last bulk download.")}
            </p>
          ) : null}
          {state.kind === "done" ? (
            <p className="mt-1.5 text-xs font-medium text-fg-2" role="status">
              {state.summary.complete
                ? bi(
                    `작품 ${formatCount(state.summary.succeeded, locale)}개를 모두 내려받았어요.`,
                    `All ${formatCount(state.summary.succeeded, locale)} works downloaded.`,
                  )
                : bi(
                    `${formatCount(state.summary.succeeded, locale)}개 성공 · ${formatCount(state.summary.failed, locale)}개 실패 — 실패한 작품만 다시 받을 수 있어요.`,
                    `${formatCount(state.summary.succeeded, locale)} downloaded · ${formatCount(state.summary.failed, locale)} failed — you can retry just the failed ones.`,
                  )}
            </p>
          ) : null}
          {state.kind === "error" ? (
            <p className="mt-1.5 text-xs font-medium text-bad" role="alert">{state.message}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <button
            type="button"
            disabled={running || exportableCount === 0}
            onClick={() => { void startDownload(); }}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:bg-raised disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Download size={14} aria-hidden />
            {running && state.kind === "running"
              ? bi(`받는 중 ${state.done}/${state.total}`, `Downloading ${state.done}/${state.total}`)
              : bi("전부 내려받기", "Download all")}
          </button>
          {state.kind === "done" && !state.summary.complete && failedIds.length > 0 ? (
            <button
              type="button"
              disabled={running}
              onClick={() => { void startDownload(failedIds); }}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-bad/50 px-3 py-1.5 text-sm font-medium text-bad transition-colors hover:bg-bad/10 disabled:opacity-40"
            >
              {bi("실패한 것만 다시 받기", "Retry failed only")}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
