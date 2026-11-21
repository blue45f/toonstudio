import { Download, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { createStudioRecoveryNewDrawingHref } from "./studio-recovery-notice-model";

import { translateNow, useT } from "@/shared/lib/i18n";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import "../status-i18n/studio-brush-canvas-status-i18n-core";

export type StudioRecoveryBlockedReason = "legacy-unversioned" | "work-mismatch" | "revision-mismatch" | null;

export interface StudioRecoveryNoticeProps {
  readonly blockedReason: StudioRecoveryBlockedReason;
  /** Auto-resume only after this tab is known to own the durable document lease. */
  readonly autoRestore: boolean;
  readonly onRestore: () => void | Promise<void>;
  readonly onBackup: () => void;
  readonly onDelete: () => void | Promise<void>;
}

const actionClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50";

export function StudioRecoveryNotice({ blockedReason, autoRestore, onRestore, onBackup, onDelete }: StudioRecoveryNoticeProps) {
  const t = useT();
  const bt = useBilingual("studio.recoveryNotice");
  const titleId = useId();
  const detailsId = useId();
  const [expanded, setExpanded] = useState(false);
  const [compact, setCompact] = useState(false);
  const [busy, setBusy] = useState<"restore" | "delete" | "backup" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [automaticRestoreSettled, setAutomaticRestoreSettled] = useState(false);
  const [newDrawingHref, setNewDrawingHref] = useState(createStudioRecoveryNewDrawingHref);
  const automaticRestoreAttemptedRef = useRef(false);
  const busyRef = useRef(false);
  const safeActionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (blockedReason !== null || !autoRestore || automaticRestoreAttemptedRef.current) return;
    automaticRestoreAttemptedRef.current = true;
    busyRef.current = true;
    setBusy("restore");
    setError(null);

    void (async () => {
      try {
        await onRestore();
      } catch {
        setError(translateNow("studio.brushCanvasStatus.canvas.recoveryAutoRestoreFailed", "자동으로 이어 열지 못했어요. 현재 그림은 그대로 유지했어요."));
      } finally {
        // A successful restore clears `hasAutosave` in the parent and unmounts this notice.
        // If the notice is still mounted on the next task, the restore guard stopped the
        // replacement (storage, collaboration, a newly-started stroke, etc.). Only then do
        // we ask for an explicit recovery decision.
        globalThis.setTimeout(() => {
          busyRef.current = false;
          setBusy(null);
          setAutomaticRestoreSettled(true);
        }, 0);
      }
    })();
  }, [autoRestore, blockedReason, onRestore]);

  async function run(action: "restore" | "delete" | "backup") {
    // A ref also excludes a second click before React has committed the disabled state.
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(action);
    setError(null);
    try {
      if (action === "restore") await onRestore();
      else if (action === "delete") await onDelete();
      else onBackup();
    } catch {
      setError(t("studio.brushCanvasStatus.canvas.recoveryRequestFailed", "요청을 마치지 못했어요. 다시 시도하거나 백업 파일을 받아 주세요."));
    } finally {
      busyRef.current = false;
      setBusy(null);
      // Re-enable before restoring focus; focusing a disabled button has no effect.
      requestAnimationFrame(() => safeActionRef.current?.focus());
    }
  }

  const automaticRestoreActive = blockedReason === null && autoRestore && !automaticRestoreSettled;
  if (automaticRestoreActive) {
    return (
      <section
        data-studio-recovery-notice
        data-studio-auto-resume="true"
        aria-labelledby={titleId}
        aria-busy="true"
        className="mb-3 min-w-0 rounded-xl border border-accent/20 bg-panel p-3 text-xs text-fg"
      >
        <div className="flex min-w-0 items-center gap-3" role="status" aria-live="polite">
          <Loader2 size={17} className="shrink-0 animate-spin text-accent motion-reduce:animate-none" aria-hidden />
          <div className="min-w-0">
            <h2 id={titleId} className="font-bold">{t("studio.brushCanvasStatus.canvas.recoveryLoadingHeading", "마지막 작업을 이어 여는 중이에요")}</h2>
            <p className="mt-1 leading-relaxed text-fg-2">
              {bt("안전하게 저장된 같은 그림이면 묻지 않고 자동으로 이어서 엽니다.", "The same drawing reopens automatically once its saved copy is verified.")}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const blockedDescription = blockedReason === "revision-mismatch"
    ? bt("저장된 작품과 내용이 달라요. 덮어쓰지 않고 백업 파일로 보관해 주세요.", "This copy differs from the saved work. Download a backup to keep both versions.")
    : blockedReason === "work-mismatch"
      ? bt("다른 작품의 그림이에요. 덮어쓰지 않고 백업 파일로 보관해 주세요.", "This drawing belongs to another work. Download a backup to keep it.")
      : blockedReason
        ? t("studio.brushCanvasStatus.canvas.recoveryBlockedUnverified", "안전하게 열 수 있는지 확인하지 못했어요. 먼저 백업 파일을 받아 주세요.")
        : null;
  const manualRestoreRequired = blockedReason === null && !autoRestore;
  const fallbackDescription = error
    ?? (manualRestoreRequired
      ? bt("이 탭이 저장을 맡는지 확인하지 못해 자동으로 열지 않았어요. 현재 그림은 그대로 유지됩니다.", "The drawing is unchanged. This tab could not confirm it can save, so recovery needs your confirmation.")
      : bt("자동 복원이 끝나지 않았어요. 현재 그림은 바꾸지 않았습니다. 다시 이어 열거나 새 그림을 시작할 수 있어요.", "Your current drawing is unchanged. Retry recovery or start a new drawing."));
  const description = blockedDescription ?? fallbackDescription;
  const canCompact = blockedReason === "revision-mismatch";
  const isCompact = canCompact && compact;
  const explanationId = `${detailsId}-explanation`;

  return (
    <section
      data-studio-recovery-notice
      data-studio-auto-resume-fallback={blockedReason === null ? "true" : undefined}
      aria-labelledby={titleId}
      aria-busy={busy !== null}
      className={cn("mb-3 min-w-0 rounded-xl border bg-panel text-xs text-fg", isCompact ? "w-fit max-w-full px-2 py-0.5" : "p-3", blockedReason ? "border-warning/35" : "border-accent/25")}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className={cn("min-w-0", !isCompact && "flex-1 basis-48")} role="status" aria-live="polite">
          <h2 id={titleId} className="font-bold">{blockedReason ? bt("남겨 둔 그림을 보관해 주세요", "Keep a backup of the earlier drawing") : manualRestoreRequired ? bt("저장 상태를 확인해 주세요", "Check the save status") : t("studio.brushCanvasStatus.canvas.recoveryAutoRestoreFailedTitle", "자동으로 이어 열지 못했어요")}</h2>
          <p id={explanationId} hidden={isCompact} className="mt-1 leading-relaxed text-fg-2">{description}</p>
          {isCompact && <p className="leading-relaxed text-fg-2">{bt("저장본과 다른 그림이 있어요.", "An earlier drawing differs from the saved work.")}</p>}
        </div>
        <div className="flex max-w-full flex-wrap gap-2">
          <button
            ref={safeActionRef}
            type="button"
            disabled={busy !== null}
            onClick={() => void run(blockedReason ? "backup" : "restore")}
            className={cn(actionClass, "bg-accent text-on-accent hover:bg-accent-2")}
          >
            {busy === "restore" ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden /> : blockedReason ? <Download size={15} aria-hidden /> : <RotateCcw size={15} aria-hidden />}
            {busy === "restore" ? t("studio.brushCanvasStatus.canvas.recoveryOpening", "그림 여는 중…") : blockedReason ? bt("백업 파일 받기", "Download backup") : manualRestoreRequired ? bt("이어서 그리기", "Continue drawing") : bt("다시 이어 열기", "Retry recovery")}
          </button>
          {canCompact && (
            <button type="button" aria-expanded={!isCompact} aria-controls={explanationId}
              disabled={busy !== null} onClick={() => setCompact(!isCompact)}
              className={cn(actionClass, "border border-line hover:bg-raised")}>
              {isCompact ? bt("복구 안내 펼치기", "Expand recovery notice") : bt("복구 안내 접기", "Collapse recovery notice")}
            </button>
          )}
          {!isCompact && <a
            href={newDrawingHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={busy !== null}
            tabIndex={busy ? -1 : undefined}
            onClick={(event) => {
              if (busyRef.current) { event.preventDefault(); return; }
              // Native navigation avoids popup APIs and preserves this tab and its recovery.
              const href = createStudioRecoveryNewDrawingHref();
              event.currentTarget.href = href;
              setNewDrawingHref(href);
            }}
            className={cn(actionClass, "border border-line bg-card text-fg-2 hover:bg-raised", busy && "pointer-events-none opacity-50")}
          >
            {bt("새 그림 그리기", "Start a new drawing")} <span className="text-[0.65rem]">{bt("새 탭", "New tab")}</span>
          </a>}
        </div>
      </div>
      {!isCompact && <>
        <p className="mt-2 text-[0.7rem] leading-relaxed text-fg-3">
          {bt("새 탭에서 시작합니다. 현재 그림과 남겨 둔 작업은 유지돼요.", "The new tab opens a blank drawing. Both existing drawings stay here.")}
        </p>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={detailsId}
          disabled={busy !== null}
          onClick={() => setExpanded(!expanded)}
          className={cn(actionClass, "mt-1 text-fg-2 hover:bg-raised")}
        >
          {bt("다른 방법", "More options")} <span aria-hidden>{expanded ? "▴" : "▾"}</span>
        </button>
        {expanded && (
          <div id={detailsId} className="mt-1 border-t border-line pt-2">
            <p className="leading-relaxed text-fg-2">
              {bt("현재 그림은 ‘파일 → 저장 기록’에 먼저 보관합니다. 실패하면 이어 열지 않아요.", "A copy of the current drawing is saved in File → Save history before recovery starts.")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {!blockedReason && (
                <button type="button" disabled={busy !== null} onClick={() => void run("backup")} className={cn(actionClass, "border border-line hover:bg-raised")}>
                  <Download size={14} aria-hidden /> {bt("백업 파일 받기", "Download backup")}
                </button>
              )}
              <button type="button" disabled={busy !== null} onClick={() => void run("delete")} className={cn(actionClass, "text-bad hover:bg-bad/10")}>
                <Trash2 size={14} aria-hidden /> {busy === "delete" ? t("studio.brushCanvasStatus.canvas.recoveryDeletingCheck", "삭제 확인 중…") : bt("이전 그림 삭제…", "Delete earlier drawing…")}
              </button>
            </div>
            <p className="mt-2 text-[0.7rem] leading-relaxed text-fg-3">{bt("백업에는 이전 그림이 담겨요. 삭제는 현재 캔버스가 아닌 이전 그림에 적용되며, 확인 후 되돌릴 수 없어요.", "The backup contains the earlier drawing. Deleting it is permanent once confirmed. Your current canvas stays here.")}</p>
          </div>
        )}
      </>}
      {error && <p role="alert" className="mt-2 leading-relaxed text-bad">{error}</p>}
    </section>
  );
}
