import { useId, useSyncExternalStore } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { StudioToolArtwork } from "../studio-tool-art/StudioToolArtwork";
import { useStudioScopedDraftSaveState } from "../studio-collab/studio-scoped-draft-save";
import {
  EMPTY_STUDIO_SAVE_SYNC_SIGNALS,
  resolveSaveSyncStatusFromSignals,
  type StudioSaveSyncSignalStore,
} from "../studio-save-sync-signals";

import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";
import { useStudioDrawingClarity } from "./StudioDrawingClarityContext";

export type StudioDrawingClaritySaveSession = Pick<StudioCuttoonEditorViewSession,
  "saving" | "collaborationDocumentLocked" | "collaborationLockMessage">
  & {
    readonly title?: string;
    readonly pendingSaveIntent?: StudioCuttoonEditorViewSession["pendingSaveIntent"];
    readonly saveSyncStore?: StudioSaveSyncSignalStore;
    readonly sharedDocument: Pick<NonNullable<StudioCuttoonEditorViewSession["sharedDocument"]>, "role"> | null;
    readonly studioMenubarContentHandlers: Pick<StudioCuttoonEditorViewSession["studioMenubarContentHandlers"], "handleSave">;
  };

const NOOP_SUBSCRIBE = () => () => {};

/** 제한 초안의 기존 권한과 확인 요청을 그대로 사용하는 저장 버튼이다. */
export function StudioDrawingClaritySaveButton({ session: s }: {
  readonly session: StudioDrawingClaritySaveSession;
}) {
  const bt = useBilingual("studio.drawingClarity"), scopedSave = useStudioScopedDraftSaveState();
  const clarity = useStudioDrawingClarity();
  const statusDescId = useId();
  const signals = useSyncExternalStore(
    s.saveSyncStore ? s.saveSyncStore.subscribe : NOOP_SUBSCRIBE,
    () => (s.saveSyncStore ? s.saveSyncStore.getSignals() : EMPTY_STUDIO_SAVE_SYNC_SIGNALS),
    () => EMPTY_STUDIO_SAVE_SYNC_SIGNALS,
  );
  const saveSummary = s.saveSyncStore ? resolveSaveSyncStatusFromSignals(signals).summaryText : "";
  const disabled = s.saving || (s.collaborationDocumentLocked && !scopedSave.available);
  const caption = s.saving ? bt("저장 중…", "Saving…")
    : scopedSave.pendingConfirmation ? bt("저장 상태 확인", "Check save") : bt("저장", "Save");
  const purpose = scopedSave.pendingConfirmation ? caption
    : s.sharedDocument && s.sharedDocument.role !== "owner"
      ? bt("공동 저장", "Save together") : bt("초안 저장", "Save draft");
  const name = purpose.toLocaleLowerCase().includes(caption.toLocaleLowerCase()) ? purpose : `${caption} · ${purpose}`;
  return <>
    <button type="button" data-studio-clarity-save="true"
      className="studio-drawing-clarity-button studio-drawing-clarity-save" disabled={disabled}
      aria-label={name} aria-describedby={saveSummary ? statusDescId : undefined}
      title={disabled ? s.collaborationLockMessage() : undefined}
      onClick={(event) => {
        const trigger = event.currentTarget;
        if (clarity?.active && s.pendingSaveIntent !== undefined && typeof s.title === "string" && !s.title.trim()) {
          clarity.reveal("layers", trigger);
        }
        void s.studioMenubarContentHandlers.handleSave("draft");
      }}><StudioToolArtwork tool="save" />{caption}</button>
    {saveSummary ? <span id={statusDescId} className="sr-only" data-studio-clarity-save-status="true">{saveSummary}</span> : null}
  </>;
}
