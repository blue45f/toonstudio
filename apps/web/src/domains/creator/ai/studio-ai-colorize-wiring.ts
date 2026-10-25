/**
 * studio-ai-colorize-wiring.ts — 채색 패널 배선용 호스트 소유 상태 묶음 타입.
 *
 * 호스트(StudioCuttoonEditorHost)가 소유하는 채색 후보·맥락 노트·참조 첨부
 * 상태를 인스펙터 체인(ViewSession → InspectorColumn → Aside → 이미지 도구
 * 섹션)으로 1개 prop으로 전달하기 위한 계약이다. 각 필드는 이미 존재하는
 * 순수 모듈의 타입을 그대로 쓴다.
 */

import type { StudioAiColorizeCandidateSession } from "./studio-ai-colorize-candidates";
import type { StudioAiContextNote } from "./studio-ai-context-note";
import type { StudioAiReferenceAttachment } from "./studio-ai-reference-attachments";

export interface StudioAiColorizeWiring {
  readonly candidateSession: StudioAiColorizeCandidateSession;
  readonly candidateTargetId: string | null;
  readonly onCollectCandidate: () => void;
  readonly onSelectCandidate: (candidateId: string) => void;
  readonly onApplyCandidate: () => void;
  readonly onClearCandidates: () => void;
  readonly contextNote: StudioAiContextNote;
  readonly onContextNoteChange: (
    patch: Partial<
      Pick<
        StudioAiContextNote,
        "characterRules" | "palette" | "backgroundRules" | "prohibitions"
      >
    >,
  ) => void;
  readonly referenceAttachments: readonly StudioAiReferenceAttachment[];
  readonly referenceWarnings: readonly string[];
  /** 첨부 추가. 실패하면 사유 문장을 돌려주고, 성공하면 null을 돌려준다. */
  readonly onAddReferenceAttachment: (input: {
    readonly kind: "image" | "text";
    readonly label: string;
    readonly ref: string;
  }) => string | null;
  readonly onRemoveReferenceAttachment: (attachmentId: string) => void;
}
