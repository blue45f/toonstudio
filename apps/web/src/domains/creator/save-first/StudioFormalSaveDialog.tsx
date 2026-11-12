import { translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { ChevronRight, Cloud, FileArchive, Info, LoaderCircle, X } from "lucide-react";
import { useId, useRef } from "react";
import { createPortal } from "react-dom";

import { useStudioModalSheet } from "../useStudioModalSheet";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioFormalSaveDialog", ko, en);

export interface StudioFormalSaveDialogProps {
  readonly open: boolean;
  readonly locale: string;
  readonly projectTitle: string;
  readonly firstSave: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onSaveFile: () => void;
  readonly onOpenPersonalDrive: () => void;
}

export function StudioFormalSaveDialog({
  open,
  locale: _locale,
  projectTitle,
  firstSave,
  busy,
  error,
  onClose,
  onSaveFile,
  onOpenPersonalDrive,
}: StudioFormalSaveDialogProps) {
  useBilingualI18nRevision();
  const instanceId = useId().replace(/:/gu, "");
  const dialogRef = useRef<HTMLElement>(null);
  const rootRef = useRef<HTMLElement | null>(
    typeof document === "undefined" ? null : document.body,
  );
  const dismiss = () => {
    if (!busy) onClose();
  };

  useStudioModalSheet({
    activeKey: open ? `formal-project-save:${instanceId}` : null,
    dialogRef,
    onDismiss: dismiss,
    resolveInitialFocus: (dialog) => dialog.querySelector<HTMLElement>("[data-autofocus]"),
    rootRef,
  });

  if (!open || typeof document === "undefined") return null;
  const titleId = `${instanceId}-title`;
  const descriptionId = `${instanceId}-description`;
  const scopeId = `${instanceId}-scope`;
  const errorId = `${instanceId}-error`;
  const title = firstSave
    ? bi("작업 파일을 저장하세요", "Save your work file")
    : bi("작업 파일을 다시 저장할까요?", "Save your work file again?");

  const content = (
    <div
      className="fixed inset-0 z-[170] grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${descriptionId} ${scopeId}`}
        aria-busy={busy || undefined}
        data-studio-shortcut-boundary="true"
        tabIndex={-1}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-[500px] overflow-y-auto overscroll-contain rounded-3xl border border-line bg-card p-5 shadow-2xl sm:p-6"
      >
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="break-words text-[13px] leading-5 text-fg-2">{projectTitle}</p>
            <h2 id={titleId} className="mt-1 break-words text-[22px] font-bold leading-[1.35] tracking-tight text-fg sm:text-2xl">
              {title}
            </h2>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={dismiss}
            aria-label={bi("저장 창 닫기", "Close save dialog")}
            className="-mr-2 -mt-1 grid size-12 shrink-0 place-items-center rounded-xl text-fg-2 focus-visible:outline-2 focus-visible:outline-cool disabled:opacity-50"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <button
          type="button"
          data-autofocus="true"
          disabled={busy}
          onClick={onSaveFile}
          aria-describedby={error ? `${descriptionId} ${errorId}` : descriptionId}
          className="mt-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-accent bg-accent px-3 py-3 text-base font-bold text-on-accent focus-visible:outline-2 focus-visible:outline-cool disabled:cursor-wait disabled:opacity-60"
        >
          {busy
            ? <LoaderCircle size={19} className="shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            : <FileArchive size={19} className="shrink-0" aria-hidden="true" />}
          <span>{busy ? bi("작업 파일 저장 중…", "Saving work file…") : bi("이 기기에 작업 파일 저장", "Save work file on this device")}</span>
        </button>
        <p id={descriptionId} className="mt-2 break-words text-[13px] leading-[1.65] text-fg-2">
          {bi("현재 원고·프로젝트 문서를 .toonstudio 파일로 보관해요. 원고는 그대로 유지돼요.", "Keep the current canvas and project documents in a .toonstudio file. Your manuscript stays unchanged.")}
        </p>

        {error ? (
          <p
            id={errorId}
            role="alert"
            className="mt-3 whitespace-pre-wrap break-words rounded-xl border border-danger/35 bg-danger-soft/15 px-3 py-2 text-sm leading-6 text-danger [overflow-wrap:anywhere]"
          >
            {error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={busy}
          onClick={onOpenPersonalDrive}
          aria-describedby={`${instanceId}-backup-help`}
          className="mt-4 flex min-h-12 w-full items-center gap-2.5 rounded-xl border border-line bg-card px-3 py-3 text-left text-[15px] font-semibold text-fg focus-visible:outline-2 focus-visible:outline-cool disabled:opacity-60"
        >
          <Cloud size={20} className="shrink-0 text-accent" aria-hidden="true" />
          <span className="min-w-0 flex-1 break-words">{bi("개인 드라이브에 백업", "Back up to a personal drive")}</span>
          <ChevronRight size={18} className="shrink-0 text-fg-2" aria-hidden="true" />
        </button>
        <p id={`${instanceId}-backup-help`} className="mt-1.5 text-xs leading-5 text-fg-2">
          {bi("연결 화면 열기 · 연결 후 백업 진행", "Open connections · Continue backup after connecting")}
        </p>
        <div id={scopeId} className="mt-4 flex items-start gap-2 rounded-xl bg-panel/60 p-3">
          <Info size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <p className="break-words text-xs leading-[1.75] text-fg-2">
            {bi("임시 자동저장은 이 기기·브라우저에 보관돼요. 사이트 데이터를 지우면 사라질 수 있어요.", "Temporary autosaves stay in this browser on this device. Clearing site data can remove them.")}
          </p>
        </div>
        <button type="button" disabled={busy} onClick={dismiss} className="mt-2 min-h-12 w-full rounded-xl px-3 text-sm font-semibold text-fg-2 focus-visible:outline-2 focus-visible:outline-cool disabled:opacity-50">
          {bi("그리기로 돌아가기", "Return to drawing")}
        </button>
      </section>
    </div>
  );
  return createPortal(content, document.body);
}
