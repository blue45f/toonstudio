import { AlertTriangle, CopyPlus, DownloadCloud, HardDrive, X } from "lucide-react";
import { useEffect } from "react";

import { cn } from "@/shared/lib/utils";

export type SaveConflictResolutionChoice = "keep-local" | "use-remote" | "keep-both-copy";

export interface SaveConflictSummary {
  readonly documentTitle: string;
  readonly localSavedAtLabel: string;
  readonly remoteSavedAtLabel: string;
  readonly localChangedCount: number;
  readonly remoteChangedCount: number;
}

export interface StudioSaveConflictResolutionDialogProps {
  readonly open: boolean;
  readonly summary: SaveConflictSummary;
  readonly resolvingChoice?: SaveConflictResolutionChoice | null;
  readonly errorMessage?: string | null;
  readonly onResolve: (choice: SaveConflictResolutionChoice) => void;
  readonly onClose: () => void;
  readonly className?: string;
}

/**
 * 저장 충돌 3선택 복구 대화상자(AC-007).
 * 기본 사용자 UI에 내부 구현 용어(SQLite/OPFS/CRDT/lease/revision)를 절대 노출하지 않으며,
 * 원고 유실을 막기 위해 '두 버전 모두 사본으로 보존'을 안전한 추천 선택지로 제공한다.
 */
export function StudioSaveConflictResolutionDialog({
  open,
  summary,
  resolvingChoice = null,
  errorMessage = null,
  onResolve,
  onClose,
  className,
}: StudioSaveConflictResolutionDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !resolvingChoice) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, resolvingChoice, onClose]);

  if (!open) return null;

  const busy = resolvingChoice !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas/75 p-4 backdrop-blur-xs"
      data-testid="studio-save-conflict-dialog-backdrop"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-conflict-dialog-title"
        aria-describedby="save-conflict-dialog-desc"
        data-testid="studio-save-conflict-dialog"
        className={cn(
          "w-full max-w-lg rounded-2xl border border-line bg-panel p-5 text-fg shadow-xl",
          className,
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line/60 pb-3">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-raised text-warn">
              <AlertTriangle size={16} aria-hidden="true" />
            </span>
            <div className="space-y-1">
              <h2
                id="save-conflict-dialog-title"
                className="text-base font-semibold tracking-tight text-fg [word-break:keep-all]"
              >
                서로 다른 저장본이 발견되었습니다
              </h2>
              <p
                id="save-conflict-dialog-desc"
                className="text-xs leading-relaxed text-fg-2 [word-break:keep-all]"
              >
                <strong className="font-semibold text-fg">{summary.documentTitle}</strong>에 이 기기에서 작업한 내용과 다른 곳에서 저장된 최신 내용이 함께 있습니다. 원하는 복구 방법을 선택하세요.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="대화상자 닫기"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl text-fg-3 transition-colors hover:bg-raised hover:text-fg disabled:opacity-50"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div className="rounded-xl bg-card/75 p-3 text-xs">
            <p className="font-semibold text-fg">이 기기의 작업본</p>
            <p className="mt-1 text-fg-3">마지막 저장: {summary.localSavedAtLabel}</p>
            <p className="mt-0.5 text-fg-2">
              변경된 요소 <span className="font-display font-semibold text-fg tnum">{summary.localChangedCount}</span>건
            </p>
          </div>
          <div className="rounded-xl bg-card/75 p-3 text-xs">
            <p className="font-semibold text-fg">다른 곳의 최신본</p>
            <p className="mt-1 text-fg-3">마지막 저장: {summary.remoteSavedAtLabel}</p>
            <p className="mt-0.5 text-fg-2">
              변경된 요소 <span className="font-display font-semibold text-fg tnum">{summary.remoteChangedCount}</span>건
            </p>
          </div>
        </div>

        {errorMessage && (
          <p role="alert" className="mt-3 rounded-xl bg-raised px-3 py-2 text-xs text-bad [word-break:keep-all]">
            {errorMessage}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve("keep-both-copy")}
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-accent px-4 py-2.5 text-left text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <span className="flex items-center gap-2.5">
              <CopyPlus size={16} className="shrink-0" aria-hidden="true" />
              <span>
                <span className="block text-xs font-semibold [word-break:keep-all]">
                  두 버전 모두 보존하기 (추천)
                </span>
                <span className="block text-[0.7rem] opacity-85 [word-break:keep-all]">
                  이 기기 작업은 유지하고, 다른 곳의 최신본은 별도 사본으로 저장합니다.
                </span>
              </span>
            </span>
            {resolvingChoice === "keep-both-copy" && <span className="text-xs font-medium">처리 중…</span>}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve("keep-local")}
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-card px-4 py-2.5 text-left text-fg transition-colors hover:bg-raised disabled:opacity-60"
          >
            <span className="flex items-center gap-2.5">
              <HardDrive size={16} className="shrink-0 text-fg-2" aria-hidden="true" />
              <span>
                <span className="block text-xs font-semibold [word-break:keep-all]">
                  이 기기 작업본으로 계속하기
                </span>
                <span className="block text-[0.7rem] text-fg-3 [word-break:keep-all]">
                  현재 화면에 보이는 작업을 기준으로 이어서 저장합니다.
                </span>
              </span>
            </span>
            {resolvingChoice === "keep-local" && <span className="text-xs text-fg-2">처리 중…</span>}
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve("use-remote")}
            className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-card px-4 py-2.5 text-left text-fg transition-colors hover:bg-raised disabled:opacity-60"
          >
            <span className="flex items-center gap-2.5">
              <DownloadCloud size={16} className="shrink-0 text-fg-2" aria-hidden="true" />
              <span>
                <span className="block text-xs font-semibold [word-break:keep-all]">
                  다른 곳의 최신본 불러오기
                </span>
                <span className="block text-[0.7rem] text-fg-3 [word-break:keep-all]">
                  이 기기의 미반영 변경을 내려놓고 최신본으로 교체합니다.
                </span>
              </span>
            </span>
            {resolvingChoice === "use-remote" && <span className="text-xs text-fg-2">처리 중…</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
