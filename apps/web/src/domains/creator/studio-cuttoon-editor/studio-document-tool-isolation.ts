import { useEffect, useEffectEvent, useRef, type MutableRefObject } from "react";

import type { DrawMode, Tool } from "../studio-editor-tool-model";
import {
  readStudioExactResumeContext,
  type StudioExactResumeContextV1,
  type StudioExactResumeStorage,
} from "../studio-exact-resume-context";
import type { StudioRememberedPrimaryTool } from "../studio-initial-primary-tool";

export interface StudioDocumentScopedInitialToolInput {
  readonly projectId: string | null;
  readonly documentId: string | null;
  readonly focus: string | null;
  readonly hasAutosave: boolean;
  readonly hasElements: boolean;
  readonly rememberedPrimaryTool: StudioRememberedPrimaryTool | null;
  readonly requestedPrimaryTool: StudioRememberedPrimaryTool | null;
  readonly storage: StudioExactResumeStorage | null;
}

export interface StudioDocumentScopedInitialToolDecision {
  readonly savedDocumentContext: StudioExactResumeContextV1 | null;
  readonly rememberedPrimaryTool: StudioRememberedPrimaryTool | null;
  readonly requestedPrimaryTool: StudioRememberedPrimaryTool | null;
  readonly hasExistingContent: boolean;
}

function defaultBrowserStorage(): StudioExactResumeStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Distinguishes returning to an existing canonical document from starting a brand-new document:
 * - Existing document with saved exact-resume context (and no focus override): preserves its own
 *   per-document tool/drawMode instead of letting another project's global `rememberedPrimaryTool`
 *   or initial creation `?startTool=` query clobber it during boot.
 * - Brand-new canonical document (no saved exact-resume context and no autosave): isolates it from
 *   any previous project's global `rememberedPrimaryTool` so new documents never inherit stale tools.
 */
export function resolveStudioDocumentScopedInitialToolDecision(
  input: StudioDocumentScopedInitialToolInput,
): StudioDocumentScopedInitialToolDecision {
  const {
    projectId,
    documentId,
    focus,
    hasAutosave,
    hasElements,
    rememberedPrimaryTool,
    requestedPrimaryTool,
    storage,
  } = input;

  if (projectId && documentId) {
    const saved = storage
      ? readStudioExactResumeContext(storage, projectId, documentId)
      : null;
    if (saved && !focus) {
      return {
        savedDocumentContext: saved,
        rememberedPrimaryTool: null,
        requestedPrimaryTool: null,
        hasExistingContent: true,
      };
    }
    if (!saved && !hasAutosave) {
      return {
        savedDocumentContext: null,
        rememberedPrimaryTool: null,
        requestedPrimaryTool,
        hasExistingContent: false,
      };
    }
  }

  return {
    savedDocumentContext: null,
    rememberedPrimaryTool,
    requestedPrimaryTool,
    hasExistingContent: hasAutosave || hasElements,
  };
}

function markPrimaryToolActivated(ref: MutableRefObject<boolean>): void {
  ref.current = true;
}

export function useStudioDocumentScopedInitialToolSync(input: {
  readonly projectId: string | null;
  readonly documentId: string | null;
  readonly focus: string | null;
  readonly autosaveChecked: boolean;
  readonly hasAutosave: boolean;
  readonly hasElements: boolean;
  readonly workHydrated: boolean;
  readonly rememberedPrimaryTool: StudioRememberedPrimaryTool | null;
  readonly requestedPrimaryTool: StudioRememberedPrimaryTool | null;
  readonly primaryToolActivatedRef: MutableRefObject<boolean>;
  readonly activateRequestedTool: (tool: StudioRememberedPrimaryTool) => void;
  readonly setTool: (tool: Tool) => void;
  readonly setDrawMode: (mode: DrawMode) => void;
}): StudioDocumentScopedInitialToolDecision {
  const {
    projectId,
    documentId,
    focus,
    hasAutosave,
    autosaveChecked,
    hasElements,
    workHydrated,
    rememberedPrimaryTool,
    requestedPrimaryTool,
    primaryToolActivatedRef,
    setTool,
    setDrawMode,
  } = input;

  const decision = resolveStudioDocumentScopedInitialToolDecision({
    projectId,
    documentId,
    focus,
    hasAutosave,
    hasElements,
    rememberedPrimaryTool,
    requestedPrimaryTool,
    storage: defaultBrowserStorage(),
  });

  useEffect(() => {
    if (!autosaveChecked || !workHydrated) return;
    if (primaryToolActivatedRef.current) return;
    const saved = decision.savedDocumentContext;
    if (!saved) return;
    markPrimaryToolActivated(primaryToolActivatedRef);
    setTool(saved.tool);
    setDrawMode(saved.drawMode);
  }, [
    autosaveChecked,
    decision.savedDocumentContext,
    primaryToolActivatedRef,
    setDrawMode,
    setTool,
    workHydrated,
  ]);

  // 같은 원고의 모드 전환은 새 도구 명령이다. 최초 복원이나 room 갱신은 수동 선택을 덮지 않는다.
  const lastRequested = useRef(requestedPrimaryTool);
  const activate = useEffectEvent((tool: StudioRememberedPrimaryTool) => input.activateRequestedTool(tool));
  useEffect(() => {
    if (requestedPrimaryTool === lastRequested.current) return;
    lastRequested.current = requestedPrimaryTool;
    if (requestedPrimaryTool) activate(requestedPrimaryTool);
  }, [requestedPrimaryTool]);
  return decision;
}
