import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useStudioScopedDraftSaveState } from "../studio-collab/studio-scoped-draft-save";

import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

export type StudioDrawingClaritySaveSession = Pick<StudioCuttoonEditorViewSession,
  "saving" | "collaborationDocumentLocked" | "collaborationLockMessage">
  & {
    readonly sharedDocument: Pick<NonNullable<StudioCuttoonEditorViewSession["sharedDocument"]>, "role"> | null;
    readonly studioMenubarContentHandlers: Pick<StudioCuttoonEditorViewSession["studioMenubarContentHandlers"], "handleSave">;
  };

/** 제한 초안의 기존 권한과 확인 요청을 그대로 사용하는 저장 버튼이다. */
export function StudioDrawingClaritySaveButton({ session: s }: {
  readonly session: StudioDrawingClaritySaveSession;
}) {
  const bt = useBilingual("studio.drawingClarity"), scopedSave = useStudioScopedDraftSaveState();
  const disabled = s.saving || (s.collaborationDocumentLocked && !scopedSave.available);
  const caption = s.saving ? bt("저장 중…", "Saving…")
    : scopedSave.pendingConfirmation ? bt("저장 상태 확인", "Check save") : bt("저장", "Save");
  const purpose = scopedSave.pendingConfirmation ? caption
    : s.sharedDocument && s.sharedDocument.role !== "owner"
      ? bt("공동 저장", "Save together") : bt("초안 저장", "Save draft");
  const name = purpose.toLocaleLowerCase().includes(caption.toLocaleLowerCase()) ? purpose : `${caption} · ${purpose}`;
  return <button type="button" data-studio-clarity-save="true"
    className="studio-drawing-clarity-button studio-drawing-clarity-save" disabled={disabled}
    aria-label={name} title={disabled ? s.collaborationLockMessage() : undefined}
    onClick={() => void s.studioMenubarContentHandlers.handleSave("draft")}>{caption}</button>;
}
