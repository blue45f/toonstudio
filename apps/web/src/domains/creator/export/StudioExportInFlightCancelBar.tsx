import { AlertTriangle, ArrowLeft, Loader2, X } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  formatStudioExportInPanelAbortMessage,
  type StudioExportCancelledSummary,
} from "./studio-export-cancel-controller";

export function StudioExportInFlightCancelBar({
  activeJob,
  externalBusy = false,
  cancelledSummary,
  canReturnToWorkspace,
  onCancel,
  onCancelAndReturn,
  onReturnToWorkspace,
  onDismissCancelled,
}: {
  readonly activeJob: {
    readonly label: string;
    readonly savedFiles: number;
    readonly totalFiles: number | null;
  } | null;
  readonly externalBusy?: boolean;
  readonly cancelledSummary: StudioExportCancelledSummary | null;
  readonly canReturnToWorkspace: boolean;
  readonly onCancel: () => void;
  readonly onCancelAndReturn: () => void;
  readonly onReturnToWorkspace?: (() => void) | undefined;
  readonly onDismissCancelled: () => void;
}) {
  const bt = useBilingual("StudioExportInFlightCancelBar");
  const inFlight = activeJob !== null || externalBusy;

  if (inFlight) {
    const progressText =
      activeJob && activeJob.totalFiles !== null && activeJob.totalFiles > 0
        ? bt(
            `${activeJob.label} 진행 중 (${activeJob.savedFiles}/${activeJob.totalFiles}장 저장됨)`,
            `${activeJob.label} in progress (${activeJob.savedFiles}/${activeJob.totalFiles} saved)`,
          )
        : bt(
            `${activeJob?.label ?? "컷 묶음 내보내기"} 진행 중…`,
            `${activeJob?.label ?? "Cut bundle export"} in progress…`,
          );

    return (
      <div
        data-testid="studio-export-inflight-bar"
        role="region"
        aria-label={bt("내보내기 진행 및 취소", "Export progress and cancel")}
        className="mb-2.5 rounded-xl border border-accent/45 bg-accent-soft/40 p-2.5"
      >
        <div className="flex items-start gap-2">
          <Loader2 size={15} aria-hidden className="mt-0.5 shrink-0 animate-spin text-accent motion-reduce:animate-none" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-fg">{progressText}</p>
            <p className="mt-0.5 text-[0.65rem] leading-snug text-fg-2">
              {bt(
                "지금 취소하면 후속 다운로드를 즉시 멈추며, 편집 중인 원고는 수정되지 않아요.",
                "Cancelling stops remaining downloads immediately and leaves your manuscript untouched.",
              )}
            </p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            data-testid="studio-export-cancel-btn"
            onClick={onCancel}
            className="flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg border border-warn/50 bg-warn/15 px-2.5 text-xs font-bold text-warn transition hover:bg-warn/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X size={13} aria-hidden />
            {bt("내보내기 취소", "Cancel export")}
          </button>
          {canReturnToWorkspace ? (
            <button
              type="button"
              data-testid="studio-export-cancel-and-return-btn"
              onClick={onCancelAndReturn}
              className="flex min-h-9 flex-1 items-center justify-center gap-1 rounded-lg border border-line bg-card px-2.5 text-xs font-semibold text-fg-2 transition hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <ArrowLeft size={13} aria-hidden />
              {bt("취소하고 작업공간 복귀", "Cancel & return")}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (!cancelledSummary) return null;

  const isPartial = cancelledSummary.savedFiles > 0;
  const total = cancelledSummary.totalFiles ?? cancelledSummary.savedFiles;

  return (
    <div
      data-testid="studio-export-cancelled-banner"
      data-incomplete-output={isPartial ? "true" : "false"}
      role="status"
      aria-live="polite"
      className="mb-2.5 rounded-xl border border-warn/50 bg-warn/10 p-2.5 text-xs"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-1.5">
          <AlertTriangle size={14} aria-hidden className="mt-0.5 shrink-0 text-warn" />
          <div className="min-w-0">
            <span className="inline-block rounded-full border border-warn/45 bg-warn/15 px-2 py-0.5 text-[0.6rem] font-bold text-warn">
              {isPartial
                ? bt(
                    `미완성 산출물 (${cancelledSummary.savedFiles}/${total}장 · 완성본 아님)`,
                    `Incomplete output (${cancelledSummary.savedFiles}/${total} · not final)`,
                  )
                : bt("내보내기 취소됨 · 파일 미저장", "Cancelled · no file saved")}
            </span>
            <p className="mt-1 text-[0.68rem] leading-snug text-fg-2">
              {formatStudioExportInPanelAbortMessage(
                cancelledSummary.savedFiles,
                cancelledSummary.totalFiles,
              )}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismissCancelled}
          aria-label={bt("취소 안내 닫기", "Dismiss cancel notice")}
          className="rounded p-1 text-fg-3 hover:bg-warn/15 hover:text-fg"
        >
          <X size={13} aria-hidden />
        </button>
      </div>
      {canReturnToWorkspace && onReturnToWorkspace ? (
        <button
          type="button"
          data-testid="studio-export-after-cancel-return-btn"
          onClick={onReturnToWorkspace}
          className="mt-2 flex min-h-8 w-full items-center justify-center gap-1 rounded-lg border border-line bg-card px-2 text-[0.68rem] font-semibold text-fg-2 hover:bg-raised"
        >
          <ArrowLeft size={12} aria-hidden />
          {bt("작업공간으로 돌아가기", "Return to workspace")}
        </button>
      ) : null}
    </div>
  );
}
