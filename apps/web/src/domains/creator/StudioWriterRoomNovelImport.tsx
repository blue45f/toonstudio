/**
 * Studio Writer Room — 소설 가져오기 연결 부품.
 *
 * 작가실 패널(레거시 대형 파일, shrink-only 래칫 대상)에 소설 변환 기능을 붙이는
 * 접합부만 이 파일이 담당한다: 토글 버튼과, 변환 화면을 감싸는 스크롤 컨테이너,
 * 그리고 반영 시 전체 문서 수용 검증을 거치는 적용 로직.
 */

import { FileText } from "lucide-react";

import { StudioNovelConvertPanel } from "./StudioNovelConvertPanel";
import {
  admitStudioWriterRoomDocument,
  type StudioWriterRoomDocument,
} from "./studio-writer-room";

import type { StudioCharacterBibleEntry } from "./studio-character-bible";

const BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-35";

export function StudioWriterRoomNovelImportButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={open}
      className={`${BUTTON_CLASS} ${open ? "border-accent bg-accent-soft text-accent hover:text-accent" : ""}`}
    >
      <FileText size={14} aria-hidden />
      소설에서 가져오기
    </button>
  );
}

export interface StudioWriterRoomNovelImportScreenProps {
  document: StudioWriterRoomDocument;
  characters: readonly StudioCharacterBibleEntry[];
  onChange: (document: StudioWriterRoomDocument) => void;
  onError: (message: string) => void;
  /** 반영이 끝나 작가실 장면 단계로 돌아가야 할 때 호출된다. */
  onApplied: () => void;
  onCancel: () => void;
}

export function StudioWriterRoomNovelImportScreen({
  document,
  characters,
  onChange,
  onError,
  onApplied,
  onCancel,
}: StudioWriterRoomNovelImportScreenProps) {
  /** 변환 초안을 작가실 문서로 반영한다. 전체 문서 수용 검증을 통과한 것만 onChange로 나간다. */
  const applyNovelConvert = (nextDocument: StudioWriterRoomDocument) => {
    try {
      const receipt = admitStudioWriterRoomDocument(nextDocument, document);
      if (receipt.kind === "rejected") {
        onError(
          receipt.reason === "byte-budget-exceeded"
            ? "Writer Room 문서가 2,000,000바이트 저장 예산을 초과해 소설 변환 결과를 반영하지 않았어요."
            : "소설 변환 결과를 안전하게 읽을 수 없어 기존 문서를 유지했어요."
        );
        return;
      }
      onChange(receipt.document);
      onApplied();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "소설 변환 결과를 반영하지 못했어요.");
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-canvas">
      <StudioNovelConvertPanel
        baseDocument={document}
        characters={characters}
        onApply={applyNovelConvert}
        onCancel={onCancel}
      />
    </div>
  );
}
