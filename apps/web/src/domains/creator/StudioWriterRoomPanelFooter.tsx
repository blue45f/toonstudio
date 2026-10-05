/**
 * Studio Writer Room — 하단 단계 이동 푸터.
 *
 * 작가실 패널 본체(레거시 대형 파일, shrink-only 래칫 대상)에서 분리한 표시 전용 부품.
 * 이전/다음 단계 이동과 마지막 단계에서의 닫기만 담당하고 상태는 props로만 받는다.
 */

import { ArrowLeft, ArrowRight } from "lucide-react";

import {
  STUDIO_WRITER_ROOM_STAGES,
  type StudioWriterRoomStage,
} from "./studio-writer-room";

const BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-35";

export interface StudioWriterRoomPanelFooterProps {
  activeStage: StudioWriterRoomStage;
  onSelectStage: (stage: StudioWriterRoomStage) => void;
  onClose: () => void;
}

export function StudioWriterRoomPanelFooter({
  activeStage,
  onSelectStage,
  onClose,
}: StudioWriterRoomPanelFooterProps) {
  const activeIndex = STUDIO_WRITER_ROOM_STAGES.indexOf(activeStage);
  const previous = STUDIO_WRITER_ROOM_STAGES[activeIndex - 1];
  const next = STUDIO_WRITER_ROOM_STAGES[activeIndex + 1];
  return (
    <footer
      className="flex shrink-0 items-center gap-2 border-t border-line bg-panel px-3 pt-2 sm:px-5"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <span className="hidden min-w-0 flex-1 truncate text-[0.68rem] text-fg-3 sm:block">
        변경 내용은 현재 작품 문서와 함께 저장됩니다. · Esc로 닫기
      </span>
      <button
        type="button"
        onClick={() => {
          if (previous) onSelectStage(previous);
        }}
        disabled={activeIndex <= 0}
        className={`${BUTTON_CLASS} flex-1 sm:flex-none`}
      >
        <ArrowLeft size={14} aria-hidden /> 이전
      </button>
      {next ? (
        <button
          type="button"
          onClick={() => onSelectStage(next)}
          className={`${BUTTON_CLASS} flex-1 bg-accent text-on-accent hover:border-accent hover:bg-accent-hover hover:text-on-accent sm:flex-none`}
        >
          다음 <ArrowRight size={14} aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={onClose}
          className={`${BUTTON_CLASS} flex-1 bg-accent text-on-accent hover:border-accent hover:bg-accent-hover hover:text-on-accent sm:flex-none`}
        >
          Writer Room 닫기
        </button>
      )}
    </footer>
  );
}
