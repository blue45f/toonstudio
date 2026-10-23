import "@/shared/ai/claude/claude-assist-i18n";

import { X, type LucideIcon } from "lucide-react";
import { useId, useRef, type ClipboardEvent, type DragEvent, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { CLAUDE_QUIET_BUTTON } from "@/shared/ai/claude/claude-ui";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

import { STUDIO_Z_CLASS } from "../../studio-z-index";
import { useStudioModalSheet } from "../../useStudioModalSheet";

import { primaryModifierLabel } from "./claude-modifier-key";

export type ClaudeDialogVariant = "wide" | "sheet";

export interface ClaudeDialogFrameProps {
  /** 모달 시트 계약(포커스·Esc·배경 격리)에 쓰는 고유 키. */
  readonly activeKey: string;
  readonly title: string;
  readonly description: string;
  readonly icon: LucideIcon;
  readonly onClose: () => void;
  /** wide: 가운데 큰 창(어두운 배경). sheet: 아래에 붙는 시트(배경은 투명해 캔버스가 보인다). */
  readonly variant?: ClaudeDialogVariant;
  /** 테스트·진단용 표식(예: `data-claude-art-director-root`). */
  readonly rootAttribute: string;
  readonly children: ReactNode;
  /** 아래에 고정되는 행동 줄. 본문이 길어져도 주 행동 버튼이 항상 보인다. */
  readonly footer?: ReactNode;
  /** Ctrl/⌘+Enter. 입력 중에도 주 행동을 실행하는 단축키다. */
  readonly onPrimaryShortcut?: () => void;
  readonly onPaste?: (event: ClipboardEvent<HTMLDivElement>) => void;
  /**
   * 파일을 대화상자 아무 곳에나 끌어다 놓았을 때. 주지 않아도 파일 끌어놓기는 막아 둔다 — 놓친 파일을 브라우저가 열어 버리면 스튜디오를 떠나
   * 작업 중인 내용이 사라진다.
   */
  readonly onDropFiles?: (files: FileList) => void;
}

/**
 * Claude 보조 대화상자의 공통 틀: 머리(아이콘·제목·설명·닫기), 스크롤 본문, 아래 고정 행동 줄.
 * 포커스 가두기·Esc·배경 격리·포커스 복귀는 스튜디오 모달 시트 계약을 그대로 쓴다. 다른 스튜디오 모달처럼 격리 기준을 `document.body`로 잡아
 * 앱 나머지 부분이 키보드·보조 기술·눌러 보기에서 모두 막힌다(기준을 포털 래퍼로 잡으면 격리할 형제가 없어 아무것도 막히지 않는다).
 */
export function ClaudeDialogFrame({
  activeKey,
  title,
  description,
  icon: Icon,
  onClose,
  variant = "wide",
  rootAttribute,
  children,
  footer,
  onPrimaryShortcut,
  onPaste,
  onDropFiles,
}: ClaudeDialogFrameProps) {
  const t = useT();
  const isolationRootRef = useRef<HTMLElement | null>(typeof document === "undefined" ? null : document.body);
  const dialogRef = useRef<HTMLDivElement>(null);
  const idBase = useId();
  const headingId = `${idBase}-title`;
  const descriptionId = `${idBase}-description`;

  useStudioModalSheet({
    rootRef: isolationRootRef,
    dialogRef,
    activeKey,
    onDismiss: onClose,
    resolveInitialFocus: (dialog) => dialog.querySelector<HTMLElement>("[data-claude-initial-focus]"),
  });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onPrimaryShortcut || event.key !== "Enter" || !(event.ctrlKey || event.metaKey) || event.nativeEvent.isComposing) return;
    // 키를 누르고 있어서 반복되는 입력이 유료 요청을 거듭 보내거나, 방금 도착한 결과를 보기도 전에 실행하지 않게 한다.
    if (event.repeat) return;
    // 결과를 고치는 칸에서는 주 행동(다시 요청)을 막는다 — 고쳐 쓴 내용이 새 요청으로 지워지지 않게.
    if (event.target instanceof Element && event.target.closest("[data-claude-shortcut-off]")) return;
    event.preventDefault();
    onPrimaryShortcut();
  };

  const hasFiles = (event: DragEvent<HTMLDivElement>) => event.dataTransfer?.types.includes("Files") === true;
  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (hasFiles(event)) event.preventDefault();
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!hasFiles(event)) return;
    event.preventDefault();
    if (onDropFiles && event.dataTransfer.files.length > 0) onDropFiles(event.dataTransfer.files);
  };

  if (typeof document === "undefined") return null;

  const sheet = variant === "sheet";
  return createPortal(
    <div
      {...{ [rootAttribute]: "true" }}
      className={cn(
        "fixed flex pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]",
        STUDIO_Z_CLASS.help,
        sheet
          ? "pointer-events-none inset-x-0 bottom-0 justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-4"
          : "inset-0 items-center justify-center p-2 sm:p-4",
      )}
    >
      {sheet ? null : <div aria-hidden="true" className="absolute inset-0 bg-black/50" />}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- 모달 대화상자가 안쪽 입력칸의 Ctrl/⌘+Enter(주 행동)와 이미지 붙여넣기를 받는다. 포커스·활성화는 안쪽 컨트롤이 그대로 맡는다. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        aria-describedby={descriptionId}
        data-studio-shortcut-boundary="true"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={cn(
          "relative flex w-full flex-col overflow-hidden rounded-2xl border border-line bg-panel text-fg shadow-2xl",
          sheet ? "pointer-events-auto max-h-[min(40rem,75dvh)] max-w-xl" : "max-h-[calc(100dvh-1rem)] max-w-5xl",
        )}
      >
        <header className="flex shrink-0 items-start gap-3 border-b border-line px-4 py-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent" aria-hidden>
            <Icon size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id={headingId} className="text-lg font-bold">{title}</h2>
            <p id={descriptionId} className="mt-0.5 line-clamp-2 text-xs text-fg-2 sm:line-clamp-none sm:text-sm">{description}</p>
          </div>
          <button type="button" className={cn(CLAUDE_QUIET_BUTTON, "w-11 shrink-0 px-0")} aria-label={t("claudeAssist.common.close")} onClick={onClose}>
            <X size={18} aria-hidden />
          </button>
        </header>
        {/* 붙여 넣은 긴 주소·띄어쓰기 없는 글이 좁은 화면에서 본문을 옆으로 밀어내지 않게 어디서든 줄을 바꾼다. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 [overflow-wrap:anywhere]">{children}</div>
        {footer ? <footer className="shrink-0 border-t border-line bg-panel px-4 py-3">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

/**
 * 주 행동 단축키 안내. 키 이름은 기기에 맞춰 보여 주고 의미는 문장으로 함께 전한다. 화면 읽기 프로그램에는 문장 하나만 읽히도록 눈에 보이는
 * 키 모양은 숨기고, 키보드가 없는 터치 기기에서는 아예 보이지 않는다.
 */
export function ClaudeShortcutHint({ action }: { readonly action: string }) {
  const t = useT();
  const modifier = primaryModifierLabel();
  return (
    <span className="text-[0.6875rem] text-fg-3 pointer-coarse:hidden" data-claude-shortcut-hint="true">
      <span aria-hidden="true">
        <kbd className="rounded border border-line bg-card px-1.5 py-px font-sans">{modifier}</kbd>
        {" + "}
        <kbd className="rounded border border-line bg-card px-1.5 py-px font-sans">Enter</kbd>
        {" "}
        {action}
      </span>
      <span className="sr-only">{t("claudeAssist.common.shortcutSr", { keys: `${modifier} Enter`, action })}</span>
    </span>
  );
}
