import "@/shared/ai/claude/claude-assist-i18n";

import { ClipboardPaste, Image as ImageIcon, LoaderCircle } from "lucide-react";
import { useState, type DragEvent } from "react";

import { CLAUDE_BUTTON, CLAUDE_PRIMARY_BUTTON } from "@/shared/ai/claude/claude-ui";
import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

export interface ClaudeArtDirectorDropzoneProps {
  readonly preparing: boolean;
  readonly onPick: () => void;
  readonly onPasteFromClipboard: () => void;
  readonly onDropFiles: (files: FileList | null | undefined) => void;
}

/**
 * 이미지를 올리는 큰 표적. 세 가지 길을 한곳에서 알려 준다: 파일 선택, 끌어다 놓기, 붙여 넣기(Ctrl/⌘+V 또는 버튼).
 * 스튜디오의 "이미지를 클립보드로" 명령과 이어지는 길도 한 줄로 안내한다(현재 페이지를 바로 가져오는 가장 짧은 경로).
 */
export function ClaudeArtDirectorDropzone({ preparing, onPick, onPasteFromClipboard, onDropFiles }: ClaudeArtDirectorDropzoneProps) {
  const t = useT();
  const [dragging, setDragging] = useState(false);

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    // 대화상자 전체가 받는 끌어놓기와 겹쳐 두 번 처리되지 않게 여기서 끝낸다.
    event.stopPropagation();
    setDragging(false);
    onDropFiles(event.dataTransfer?.files);
  };

  return (
    <div
      data-claude-dropzone="true"
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "grid min-h-64 place-items-center rounded-2xl border-2 border-dashed p-6 text-center transition-colors motion-reduce:transition-none",
        dragging ? "border-accent bg-accent/10" : "border-line bg-raised/50",
      )}
    >
      <div className="max-w-xs space-y-3">
        <ImageIcon size={32} className="mx-auto text-fg-3" aria-hidden />
        <p className="text-sm font-bold">{dragging ? t("claudeAssist.art.dropActive") : t("claudeAssist.art.dropTitle")}</p>
        <p className="text-xs text-fg-3">{t("claudeAssist.art.dropHint")}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" data-claude-initial-focus="true" className={CLAUDE_PRIMARY_BUTTON} disabled={preparing} onClick={onPick}>
            {preparing ? <LoaderCircle size={16} className="animate-spin" aria-hidden /> : null}
            {t("claudeAssist.art.pick")}
          </button>
          <button type="button" className={CLAUDE_BUTTON} disabled={preparing} onClick={onPasteFromClipboard}>
            <ClipboardPaste size={16} aria-hidden />
            {t("claudeAssist.art.pasteFromClipboard")}
          </button>
        </div>
        <p className="text-xs text-fg-3">{t("claudeAssist.art.studioCopyTip")}</p>
      </div>
    </div>
  );
}
