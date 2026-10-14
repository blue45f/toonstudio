import { useCallback, useRef, useState } from "react";

import {
  createStudioHistoryJournal,
  readStudioHistoryJournalRedoEntry,
  readStudioHistoryJournalUndoEntry,
  recordStudioHistoryJournalPagesSteps,
} from "../../studio-history-journal";

import type { StudioCharacterBible } from "../../studio-character-bible";
import type { StudioPageHistoryJournal } from "../../studio-page-editor-types";
import type { StudioWriterRoomDocument } from "../../studio-writer-room";

/** Orders snapshot and sidecar undo entries on one timeline without duplicating page payloads. */
export function useStudioUnifiedHistoryJournal() {
  const [historyJournal, setHistoryJournalState] = useState<StudioPageHistoryJournal>(() =>
    createStudioHistoryJournal()
  );
  const historyJournalRef = useRef(historyJournal);
  historyJournalRef.current = historyJournal;

  const commitStudioHistoryJournal = useCallback((next: StudioPageHistoryJournal): void => {
    historyJournalRef.current = next;
    setHistoryJournalState(next);
  }, []);
  const recordStudioHistoryJournalPages = useCallback((
    addedSteps: number,
    nextUndoDepth: number,
    // 과정 리플레이 메타(선택) — 호출자가 아는 범위에서만 넘긴다. 없으면 종전 동작과 동일.
    replayMeta?: { readonly at?: number; readonly changedPageIds?: readonly string[] },
  ): void => {
    if (addedSteps <= 0) return;
    commitStudioHistoryJournal(
      recordStudioHistoryJournalPagesSteps(historyJournalRef.current, {
        addedSteps,
        nextUndoDepth,
        ...(replayMeta ?? {}),
      }),
    );
  }, [commitStudioHistoryJournal]);
  const resetStudioHistoryJournal = useCallback((): void => {
    commitStudioHistoryJournal(
      createStudioHistoryJournal<StudioCharacterBible, StudioWriterRoomDocument>(),
    );
  }, [commitStudioHistoryJournal]);

  return {
    commitStudioHistoryJournal,
    historyJournal,
    historyJournalRef,
    recordStudioHistoryJournalPages,
    resetStudioHistoryJournal,
    studioHistorySidecarRedoAvailable:
      readStudioHistoryJournalRedoEntry(historyJournal)?.kind === "sidecar",
    studioHistorySidecarUndoAvailable:
      readStudioHistoryJournalUndoEntry(historyJournal)?.kind === "sidecar",
  } as const;
}
