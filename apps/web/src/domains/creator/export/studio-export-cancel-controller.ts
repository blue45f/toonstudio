import { useCallback, useEffect, useRef, useState } from "react";

import { exportMenuText } from "./studio-export-menu-i18n";
import { PresetSliceExportCancelledError } from "./studio-export-presets";

export interface StudioExportCancelledSummary {
  readonly jobLabel: string;
  readonly savedFiles: number;
  readonly totalFiles: number | null;
  readonly returnedToWorkspace: boolean;
}

interface ActiveExportJobState {
  readonly controller: AbortController;
  readonly label: string;
  savedFiles: number;
  totalFiles: number | null;
  notifiedWorkspace: boolean;
}

export function isStudioExportAbortError(error: unknown): boolean {
  return (
    error instanceof PresetSliceExportCancelledError ||
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export function formatStudioExportWorkspaceAbortNotice(
  summary: StudioExportCancelledSummary,
): string {
  if (summary.savedFiles > 0) {
    const total = summary.totalFiles ?? summary.savedFiles;
    return exportMenuText("workspaceAbortPartial", { saved: summary.savedFiles, total });
  }
  return exportMenuText("workspaceAbortZero");
}

export function formatStudioExportInPanelAbortMessage(
  savedFiles: number,
  totalFiles: number | null,
): string {
  if (savedFiles > 0) {
    const total = totalFiles ?? savedFiles;
    const remaining = Math.max(0, total - savedFiles);
    return exportMenuText("cancelledPartial", { saved: savedFiles, total, remaining });
  }
  return exportMenuText("cancelledZero");
}

export function useStudioExportCancelController(input: {
  readonly externalBusy?: boolean;
  readonly onRequestCloseAndReturn?: (() => void) | undefined;
  readonly onWorkspaceAbortNotice?: ((message: string) => void) | undefined;
}) {
  const activeJobRef = useRef<ActiveExportJobState | null>(null);
  const externalAbortRef = useRef<AbortController>(new AbortController());
  const [activeJobSnapshot, setActiveJobSnapshot] = useState<{
    readonly label: string;
    readonly savedFiles: number;
    readonly totalFiles: number | null;
  } | null>(null);
  const [cancelledSummary, setCancelledSummary] = useState<StudioExportCancelledSummary | null>(
    null,
  );
  const externalBusyRef = useRef(Boolean(input.externalBusy));
  const closeRef = useRef(input.onRequestCloseAndReturn);
  const noticeRef = useRef(input.onWorkspaceAbortNotice);

  useEffect(() => {
    externalBusyRef.current = Boolean(input.externalBusy);
    closeRef.current = input.onRequestCloseAndReturn;
    noticeRef.current = input.onWorkspaceAbortNotice;
  });

  const beginJob = useCallback((label: string, totalFiles: number | null = null): AbortController => {
    activeJobRef.current?.controller.abort();
    const controller = new AbortController();
    const job: ActiveExportJobState = {
      controller,
      label,
      savedFiles: 0,
      totalFiles,
      notifiedWorkspace: false,
    };
    activeJobRef.current = job;
    setCancelledSummary(null);
    setActiveJobSnapshot({ label, savedFiles: 0, totalFiles });
    return controller;
  }, []);

  const recordSavedFile = useCallback((savedFiles: number, totalFiles?: number | null) => {
    const current = activeJobRef.current;
    if (!current) return;
    current.savedFiles = savedFiles;
    if (totalFiles !== undefined) current.totalFiles = totalFiles;
    setActiveJobSnapshot({
      label: current.label,
      savedFiles: current.savedFiles,
      totalFiles: current.totalFiles,
    });
  }, []);

  const finishJob = useCallback((controller: AbortController) => {
    if (activeJobRef.current?.controller !== controller) return;
    activeJobRef.current = null;
    setActiveJobSnapshot(null);
  }, []);

  const cancelActiveExport = useCallback(
    (options?: { readonly returnToWorkspace?: boolean }) => {
      const returnToWorkspace = Boolean(options?.returnToWorkspace);
      const current = activeJobRef.current;
      const hasExternal = externalBusyRef.current;
      if (!current && !hasExternal) {
        if (returnToWorkspace) closeRef.current?.();
        return null;
      }
      if (current) {
        current.notifiedWorkspace = returnToWorkspace;
        current.controller.abort();
      }
      if (hasExternal) {
        externalAbortRef.current.abort();
        externalAbortRef.current = new AbortController();
      }
      const summary: StudioExportCancelledSummary = {
        jobLabel: current?.label ?? "내보내기",
        savedFiles: current?.savedFiles ?? 0,
        totalFiles: current?.totalFiles ?? null,
        returnedToWorkspace: returnToWorkspace,
      };
      activeJobRef.current = null;
      setActiveJobSnapshot(null);
      if (returnToWorkspace) {
        noticeRef.current?.(formatStudioExportWorkspaceAbortNotice(summary));
        closeRef.current?.();
      } else {
        setCancelledSummary(summary);
      }
      return summary;
    },
    [],
  );

  // 패널이 Escape·외부 클릭·닫기 버튼으로 언마운트될 때 진행 중 내보내기가 남아 있으면
  // 즉시 중단해 백그라운드 후속 다운로드를 차단하고, 작업공간 상태 레일에 미완성/취소 사실을 알린다.
  useEffect(() => {
    return () => {
      const current = activeJobRef.current;
      if (current && !current.controller.signal.aborted) {
        current.controller.abort();
        if (!current.notifiedWorkspace) {
          current.notifiedWorkspace = true;
          noticeRef.current?.(
            formatStudioExportWorkspaceAbortNotice({
              jobLabel: current.label,
              savedFiles: current.savedFiles,
              totalFiles: current.totalFiles,
              returnedToWorkspace: true,
            }),
          );
        }
      } else if (externalBusyRef.current) {
        externalAbortRef.current.abort();
        noticeRef.current?.(
          formatStudioExportWorkspaceAbortNotice({
            jobLabel: "컷 묶음 내보내기",
            savedFiles: 0,
            totalFiles: null,
            returnedToWorkspace: true,
          }),
        );
      }
      activeJobRef.current = null;
    };
  }, []);

  return {
    activeJob: activeJobSnapshot,
    hasActiveCancellableJob: activeJobSnapshot !== null || Boolean(input.externalBusy),
    externalCancelSignal: externalAbortRef.current.signal,
    cancelledSummary,
    dismissCancelledSummary: () => setCancelledSummary(null),
    beginJob,
    recordSavedFile,
    finishJob,
    cancelActiveExport,
  };
}
