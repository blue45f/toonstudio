/**
 * 대사 일괄 패널 상단에서 회차 전체 스토리 에디터(StudioStoryEditorSurface)를 여는 런처 바.
 */
import { BookOpenText } from "lucide-react";
import { useRef, type ReactElement } from "react";

import { StudioStoryEditorSurface } from "./StudioStoryEditorSurface";
import { applyStoryEditorDrafts, type StoryEditorApplyResult, type StoryEditorDraft } from "./studio-story-editor";

import type { DialoguePageLike } from "./studio-dialogue-batch";

export interface StudioStoryEditorLauncherBarProps {
  readonly pages: readonly DialoguePageLike[];
  readonly currentPageId: string;
  readonly selectedId: string | null;
  readonly onSelectElement: (pageId: string, elId: string) => void;
  readonly onPatchText: (pageId: string, elId: string, text: string) => void;
  readonly onSplitText?: (pageId: string, elId: string, text: string, offset: number) => void;
  readonly onMergeWithNext?: (pageId: string, elId: string, text: string) => void;
  readonly onTransferElement?: (
    pageId: string,
    elId: string,
    targetPageId: string,
    mode: "move" | "copy",
    text: string,
  ) => void;
}

export function StudioStoryEditorLauncherBar({
  pages,
  currentPageId,
  selectedId,
  onSelectElement,
  onPatchText,
  onSplitText,
  onMergeWithNext,
  onTransferElement,
}: StudioStoryEditorLauncherBarProps): ReactElement {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  const handleSaveDrafts = (drafts: readonly StoryEditorDraft[]): StoryEditorApplyResult => {
    const result = applyStoryEditorDrafts(pages, drafts);
    for (const draft of result.applied) {
      onPatchText(draft.pageId, draft.elementId, draft.text);
    }
    return result;
  };

  return (
    <div className="border-b border-line/60 px-3 py-2 [word-break:keep-all]">
      <details ref={detailsRef} className="group">
        <summary className="flex min-h-11 w-full cursor-pointer list-none items-center justify-between gap-2 rounded-lg border border-accent/35 bg-accent-soft/35 px-2.5 text-xs font-semibold text-fg transition-[background-color,border-color,color,transform] duration-150 hover:bg-accent-soft/60 active:scale-[0.99] motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          <span className="inline-flex items-center gap-1.5">
            <BookOpenText size={14} className="text-accent" aria-hidden />
            <span>회차 전체 스토리 에디터 (초안 일괄 저장 · 맞춤법 검수)</span>
          </span>
          <span className="tabular-nums text-xs text-fg-3">{pages.length}페이지</span>
        </summary>
        <div className="mt-2 max-h-96 overflow-y-auto overscroll-contain rounded-xl border border-line bg-canvas p-2 shadow-sm">
          <StudioStoryEditorSurface
            pages={pages}
            currentPageId={currentPageId}
            selectedId={selectedId}
            onClose={() => {
              if (detailsRef.current) {
                detailsRef.current.open = false;
              }
            }}
            onSelectElement={onSelectElement}
            onSaveDrafts={handleSaveDrafts}
            onSplitText={onSplitText}
            onMergeWithNext={onMergeWithNext}
            onTransferElement={onTransferElement}
          />
        </div>
      </details>
    </div>
  );
}
