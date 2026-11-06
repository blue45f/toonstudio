import { useEffect, useRef, useState } from "react";

import {
  createDurableStudioCheckpoint,
  deleteDurableStudioCheckpoint,
  listDurableStudioCheckpoints,
  type StudioCheckpoint,
} from "../studio-checkpoint-loader";
import { confirmStudioDestructiveAction } from "../studio-destructive-action-preview";
import {
  settleStudioDestructiveCommit,
  studioDeleteCheckpointRequest,
  studioRestoreCheckpointRequest,
} from "../studio-destructive-command-catalog";
import { parseStudioProjectFile, type StudioProjectFile } from "../studio-project-file";

import type { PageState } from "../studio-page-state";
import type { StudioProjectSnapshot } from "../studio-project-snapshot";

export interface UseStudioCheckpointsOptions {
  readonly checkpointKey: string;
  readonly pages: readonly PageState[];
  readonly ensureSharedDocumentAvailableForExport: () => boolean;
  readonly currentStudioProjectSnapshot: () => StudioProjectSnapshot;
  readonly applyStudioProjectSnapshot: (projectData: StudioProjectFile) => Promise<boolean>;
  readonly undo: () => void;
}

export function useStudioCheckpoints({
  checkpointKey,
  pages,
  ensureSharedDocumentAvailableForExport,
  currentStudioProjectSnapshot,
  applyStudioProjectSnapshot,
  undo,
}: UseStudioCheckpointsOptions) {
  const [checkpointPanelOpen, setCheckpointPanelOpen] = useState(false);
  const [checkpoints, setCheckpoints] = useState<StudioCheckpoint[]>([]);
  const [checkpointError, setCheckpointError] = useState<string | null>(null);

  useEffect(() => {
    if (!checkpointPanelOpen) return;
    let checkpointLoadActive = true;
    void listDurableStudioCheckpoints(undefined, checkpointKey)
      .then((storedCheckpoints) => {
        if (checkpointLoadActive) setCheckpoints(storedCheckpoints);
      })
      .catch((cause) => {
        if (checkpointLoadActive) {
          setCheckpointError(
            cause instanceof Error ? cause.message : "복구 지점을 불러오지 못했어요."
          );
        }
      });
    setCheckpointError(null);
    return () => {
      checkpointLoadActive = false;
    };
  }, [checkpointKey, checkpointPanelOpen]);

  async function saveNamedCheckpoint(name: string): Promise<boolean> {
    if (!ensureSharedDocumentAvailableForExport()) return false;
    try {
      setCheckpoints(
        await createDurableStudioCheckpoint(undefined, checkpointKey, {
          name,
          payload: currentStudioProjectSnapshot(),
          omitUndefinedObjectFields: true,
        })
      );
      setCheckpointError(null);
      return true;
    } catch (error) {
      setCheckpointError(
        error instanceof Error ? error.message : "복구 지점을 저장하지 못했어요."
      );
      return false;
    }
  }

  function createNamedCheckpoint(name: string) {
    void saveNamedCheckpoint(name);
  }

  const restoreInFlightRef = useRef(false);

  async function restoreNamedCheckpoint(checkpoint: StudioCheckpoint) {
    if (restoreInFlightRef.current) return;
    restoreInFlightRef.current = true;
    try {
      let parsedProject: StudioProjectFile;
      try {
        parsedProject = parseStudioProjectFile(checkpoint.payload);
      } catch (error) {
        setCheckpointError(
          error instanceof Error ? error.message : "복구 지점을 읽지 못했어요."
        );
        return;
      }
      const restoreRequest = studioRestoreCheckpointRequest({
        checkpointName: checkpoint.name,
        currentPageCount: pages.length,
      });
      if (!(await confirmStudioDestructiveAction(restoreRequest))) return;
      const applied = await applyStudioProjectSnapshot(parsedProject);
      if (!settleStudioDestructiveCommit(restoreRequest, applied, undo)) return;
      setCheckpointPanelOpen(false);
      setCheckpointError(null);
    } catch (error) {
      setCheckpointError(
        error instanceof Error ? error.message : "복구 지점을 읽지 못했어요."
      );
    } finally {
      restoreInFlightRef.current = false;
    }
  }

  async function removeNamedCheckpoint(checkpoint: StudioCheckpoint) {
    // 되돌릴 수 없는 유일한 파괴적 명령 — 저장소에서 스냅샷을 지우며 히스토리 커밋이 없다.
    const deleteRequest = studioDeleteCheckpointRequest({
      checkpointName: checkpoint.name,
      savedAtLabel: checkpoint.createdAt,
    });
    if (!(await confirmStudioDestructiveAction(deleteRequest))) return;
    try {
      setCheckpoints(
        await deleteDurableStudioCheckpoint(undefined, checkpointKey, checkpoint.id)
      );
      settleStudioDestructiveCommit(deleteRequest, true);
      setCheckpointError(null);
    } catch (error) {
      setCheckpointError(
        error instanceof Error ? error.message : "복구 지점을 삭제하지 못했어요."
      );
    }
  }

  return {
    checkpointPanelOpen,
    setCheckpointPanelOpen,
    checkpoints,
    setCheckpoints,
    checkpointError,
    setCheckpointError,
    saveNamedCheckpoint,
    createNamedCheckpoint,
    restoreNamedCheckpoint,
    removeNamedCheckpoint,
  };
}
