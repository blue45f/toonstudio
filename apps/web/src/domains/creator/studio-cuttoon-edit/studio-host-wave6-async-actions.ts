import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { StudioReadonlyRef, StudioStageLike } from "../canvas/studio-stage-handle-types";

import type {
  generateScenarioScenes,
  StudioTextAiProvenance,
  translateDialogueBatch,
} from "../ai/studio-ai-client-lazy";
import type {
  StudioAiObservableResult,
  StudioAiPendingOperationInput,
} from "../ai/studio-ai-provenance-recorder";
import { collectDialogueItems } from "../lettering/studio-dialogue-batch";
import {
  chunkDialogueItemsForTranslation,
  localeLabel,
  type DialogueTranslationCardContextMap,
} from "../lettering/studio-dialogue-translate";
import type { StudioAutoActionPlan, StudioAutoActionSet } from "../studio-auto-actions";
import { CANVAS_W } from "../studio-assets";
import {
  buildStudioCharacterBiblePromptContext,
  type StudioCharacterBible,
} from "../studio-character-bible";
import { containingPanel } from "../studio-element-geometry";
import type { El, FrameEl } from "../studio-element-model";
import { coverFitInFrame } from "../studio-fit";
import { isEffectivelyLocked, type LayerGroup } from "../studio-layers";
import {
  createStudioMacroSession,
  stopStudioMacroRecording,
  type StudioMacroSession,
} from "../studio-macro-recorder";
import type { DocumentMaster } from "../studio-master-page";
import type { ProductBrushLibraryRepository } from "../studio-page-editor-runtime-loaders";
import type { PendingBrushDelete } from "../studio-page-editor-ui-contracts";
import { loadStudioCaptureReadinessRuntime } from "../studio-page-lazy-ui";
import type { PageState } from "../studio-page-state";
import { layoutScenarioPanels, type ScenarioPreviewItem } from "../studio-scenario-layout";
import type { StudioWorkAssetHydratorRuntime } from "../studio-work-asset-hydrator";

export async function runStudioCaptureReadyStageForHistoryPage<
  TStage extends StudioStageLike = StudioStageLike,
>({
  page, historyIndex, studioRevisionProjectGenerationRef, ensureSharedDocumentAvailableForExport,
  studioWorkAssetHydrator, captureCommitRef, stageRef, sharedDocRequiredMessage,
}: {
  readonly page: PageState;
  readonly historyIndex: number;
  readonly studioRevisionProjectGenerationRef: MutableRefObject<number>;
  readonly ensureSharedDocumentAvailableForExport: () => boolean;
  readonly studioWorkAssetHydrator: StudioWorkAssetHydratorRuntime;
  readonly captureCommitRef: MutableRefObject<{
    pageId: string;
    historyIndex: number;
    page: PageState;
    master: DocumentMaster<El>;
    exporting: boolean;
    timelapse: boolean;
    masterEditMode: boolean;
  }>;
  readonly stageRef: StudioReadonlyRef<TStage | null>;
  readonly sharedDocRequiredMessage: () => string;
}): Promise<TStage> {
  const captureGeneration = studioRevisionProjectGenerationRef.current;
  if (!ensureSharedDocumentAvailableForExport()) {
    throw new Error(sharedDocRequiredMessage());
  }
  const {
    collectStudioCaptureAssetSources,
    waitForStudioCaptureReady,
  } = await loadStudioCaptureReadinessRuntime();
  const renderKey = `${page.id}:${historyIndex}`;
  return waitForStudioCaptureReady({
    pageId: renderKey,
    sourcePage: page,
    workAssetHydrator: studioWorkAssetHydrator,
    getMaster: () => captureCommitRef.current.master,
    getDocumentGeneration: () => studioRevisionProjectGenerationRef.current,
    expectedDocumentGeneration: captureGeneration,
    getRenderedPageId: () => {
      const committed = captureCommitRef.current;
      return committed.timelapse && !committed.masterEditMode
        ? `${committed.pageId}:${committed.historyIndex}`
        : null;
    },
    getStage: () => stageRef.current,
    assetSources: collectStudioCaptureAssetSources(page, captureCommitRef.current.master),
  });
}

export async function runStudioExecuteGenerateScenario<Ticket>({
  collaborationAccessRef, scenarioAbortControllerRef, captureStudioMutationTicket,
  masterEditMode, scenarioStoryText, scenarioBusy, scenarioCancelRef, beginScenarioRequest,
  finishScenarioRequest, setScenarioBusy, setScenarioError, setScenarioProgress,
  setScenarioStageLabel, characterBible, pendingTextAiProviderContext,
  beginTrackedStudioAiOperation, settleTrackedTextAiOperation, scenarioSceneCountHint,
  activePageId, requestScenarioScenes, canApplyStudioMutation, scenarioApplyTarget,
  elements, canvasH, setScenarioResult, messages,
}: {
  readonly collaborationAccessRef: MutableRefObject<{ locked: boolean }>;
  readonly scenarioAbortControllerRef: MutableRefObject<AbortController | null>;
  readonly captureStudioMutationTicket: () => Ticket;
  readonly masterEditMode: boolean;
  readonly scenarioStoryText: string;
  readonly scenarioBusy: boolean;
  readonly scenarioCancelRef: MutableRefObject<boolean>;
  readonly beginScenarioRequest: () => AbortController;
  readonly finishScenarioRequest: (controller: AbortController) => void;
  readonly setScenarioBusy: Dispatch<SetStateAction<boolean>>;
  readonly setScenarioError: Dispatch<SetStateAction<string | null>>;
  readonly setScenarioProgress: Dispatch<SetStateAction<{ done: number; total: number } | null>>;
  readonly setScenarioStageLabel: Dispatch<SetStateAction<string | null>>;
  readonly characterBible: StudioCharacterBible;
  readonly pendingTextAiProviderContext: () => {
    provider: StudioAiPendingOperationInput["provider"];
    model: StudioAiPendingOperationInput["model"];
    transport: StudioAiPendingOperationInput["transport"];
  };
  readonly beginTrackedStudioAiOperation: (scope: string, input: Omit<StudioAiPendingOperationInput, "id">) => string;
  readonly settleTrackedTextAiOperation: (
    operationId: string,
    result: StudioAiObservableResult,
    textProvenance?: StudioTextAiProvenance,
    aborted?: boolean,
  ) => void;
  readonly scenarioSceneCountHint: number | undefined;
  readonly activePageId: string;
  readonly requestScenarioScenes: (
    storyText: string,
    characterContext: string,
    signal: AbortSignal,
    operationId: string,
  ) => ReturnType<typeof generateScenarioScenes>;
  readonly canApplyStudioMutation: (ticket: Ticket) => boolean;
  readonly scenarioApplyTarget: "current-page" | "new-page";
  readonly elements: readonly El[];
  readonly canvasH: number;
  readonly setScenarioResult: Dispatch<SetStateAction<{
    items: ScenarioPreviewItem[];
    nextCanvasH: number;
    characterDescription: string;
    textAiProvenance: StudioTextAiProvenance | null;
  } | null>>;
  readonly messages: {
    readonly generating: string;
    readonly empty: string;
  };
}): Promise<void> {
  if (collaborationAccessRef.current.locked) return;
  if (scenarioAbortControllerRef.current) return;
  const mutationTicket = captureStudioMutationTicket();
  if (masterEditMode) return;
  const storyText = scenarioStoryText.trim();
  if (!storyText || scenarioBusy) return;

  scenarioCancelRef.current = false;
  const controller = beginScenarioRequest();
  setScenarioBusy(true);
  setScenarioError(null);
  setScenarioProgress(null);
  setScenarioStageLabel(messages.generating);
  const characterContext = buildStudioCharacterBiblePromptContext(characterBible);
  const pendingProvider = pendingTextAiProviderContext();
  const operationId = beginTrackedStudioAiOperation("scenario-text", {
    kind: "text",
    task: "scenario",
    provider: pendingProvider.provider,
    model: pendingProvider.model,
    transport: pendingProvider.transport,
    promptVersion: 1,
    prompt: JSON.stringify({
      storyText,
      sceneCountHint: scenarioSceneCountHint,
      characterContext,
    }),
    target: { pageId: activePageId },
    references: [],
  });

  try {
    const scenesResult = await requestScenarioScenes(
      storyText,
      characterContext,
      controller.signal,
      operationId,
    );
    if (!canApplyStudioMutation(mutationTicket)) return;
    if (!scenesResult.ok) {
      settleTrackedTextAiOperation(operationId, scenesResult, undefined, controller.signal.aborted);
      if (!controller.signal.aborted) setScenarioError(scenesResult.error);
      return;
    }
    settleTrackedTextAiOperation(operationId, scenesResult, scenesResult.data.textProvenance);
    if (scenarioCancelRef.current || controller.signal.aborted) return;

    const existingFrames =
      scenarioApplyTarget === "current-page"
        ? elements.filter((e): e is FrameEl => e.type === "frame")
        : [];
    const baseCanvasH = scenarioApplyTarget === "current-page" ? canvasH : 1080;
    const { panels, nextCanvasH } = layoutScenarioPanels(
      existingFrames,
      CANVAS_W,
      baseCanvasH,
      scenesResult.data.scenes,
    );
    if (panels.length === 0) {
      setScenarioError(messages.empty);
      return;
    }

    setScenarioResult({
      items: panels.map((panel) => ({ ...panel })),
      nextCanvasH,
      characterDescription: scenesResult.data.characterDescription.trim(),
      textAiProvenance: scenesResult.data.textProvenance,
    });
  } finally {
    setScenarioBusy(false);
    setScenarioStageLabel(null);
    finishScenarioRequest(controller);
  }
}

export async function runStudioExecuteGenerateTranslations<Ticket>({
  cardContexts, collaborationAccessRef, captureStudioMutationTicket, canApplyStudioMutation,
  editorMountedRef, translateBusy, pages, setTranslateError, nothingToTranslateMessage,
  setTranslateBusy, setTranslateProgress, pendingTextAiProviderContext,
  beginTrackedStudioAiOperation, settleTrackedTextAiOperation, translateTargetLocale,
  translateGlossary, requestTranslateBatch, setTranslateDraft,
}: {
  readonly cardContexts?: DialogueTranslationCardContextMap;
  readonly collaborationAccessRef: MutableRefObject<{ locked: boolean }>;
  readonly captureStudioMutationTicket: () => Ticket;
  readonly canApplyStudioMutation: (ticket: Ticket) => boolean;
  readonly editorMountedRef: MutableRefObject<boolean>;
  readonly translateBusy: boolean;
  readonly pages: PageState[];
  readonly setTranslateError: Dispatch<SetStateAction<string | null>>;
  readonly nothingToTranslateMessage: string;
  readonly setTranslateBusy: Dispatch<SetStateAction<boolean>>;
  readonly setTranslateProgress: Dispatch<SetStateAction<{ done: number; total: number } | null>>;
  readonly pendingTextAiProviderContext: () => {
    provider: StudioAiPendingOperationInput["provider"];
    model: StudioAiPendingOperationInput["model"];
    transport: StudioAiPendingOperationInput["transport"];
  };
  readonly beginTrackedStudioAiOperation: (scope: string, input: Omit<StudioAiPendingOperationInput, "id">) => string;
  readonly settleTrackedTextAiOperation: (
    operationId: string,
    result: StudioAiObservableResult,
    textProvenance?: StudioTextAiProvenance,
  ) => void;
  readonly translateTargetLocale: string;
  readonly translateGlossary: string;
  readonly requestTranslateBatch: (
    items: Array<{ id: string; text: string; context?: DialogueTranslationCardContextMap[string] }>,
    targetLanguage: string,
    operationId: string,
  ) => ReturnType<typeof translateDialogueBatch>;
  readonly setTranslateDraft: Dispatch<SetStateAction<Map<string, string> | null>>;
}): Promise<void> {
  if (collaborationAccessRef.current.locked) return;
  const mutationTicket = captureStudioMutationTicket();
  if (translateBusy) return;
  const items = collectDialogueItems(pages);
  if (items.length === 0) {
    setTranslateError(nothingToTranslateMessage);
    return;
  }
  const chunks = chunkDialogueItemsForTranslation(items, cardContexts ? { contexts: cardContexts } : {});
  setTranslateBusy(true);
  setTranslateError(null);
  setTranslateProgress({ done: 0, total: chunks.length });
  const collected = new Map<string, string>();
  for (const chunk of chunks) {
    const translationItems = chunk.map((it) => ({
      id: it.id,
      text: it.text,
      context: cardContexts && Object.hasOwn(cardContexts, it.id) ? cardContexts[it.id] : undefined,
    }));
    const pendingProvider = pendingTextAiProviderContext();
    const operationId = beginTrackedStudioAiOperation("translation", {
      kind: "text",
      task: "translation",
      provider: pendingProvider.provider,
      model: pendingProvider.model,
      transport: pendingProvider.transport,
      promptVersion: 1,
      prompt: JSON.stringify({
        items: translationItems,
        targetLocale: translateTargetLocale,
        glossary: translateGlossary,
      }),
      references: chunk.slice(0, 24).map((item) => ({ assetId: item.id })),
    });
    const result = await requestTranslateBatch(
      translationItems,
      localeLabel(translateTargetLocale),
      operationId,
    );
    if (!canApplyStudioMutation(mutationTicket)) {
      if (editorMountedRef.current) {
        setTranslateBusy(false);
        setTranslateProgress(null);
      }
      return;
    }
    settleTrackedTextAiOperation(
      operationId,
      result,
      result.ok ? result.data.textProvenance : undefined,
    );
    if (!result.ok) {
      setTranslateError(result.error);
      setTranslateBusy(false);
      setTranslateProgress(null);
      return;
    }
    for (const entry of result.data.translations) collected.set(entry.id, entry.text);
    setTranslateProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
  }
  setTranslateDraft(collected);
  setTranslateBusy(false);
  setTranslateProgress(null);
}

export async function runStudioStopMacroRecord({
  macroSession, setMacroSession, setAutoActionSet, setAutoActionPlan, setAutoActionStatus,
}: {
  readonly macroSession: StudioMacroSession;
  readonly setMacroSession: Dispatch<SetStateAction<StudioMacroSession>>;
  readonly setAutoActionSet: (next: StudioAutoActionSet) => void;
  readonly setAutoActionPlan: Dispatch<SetStateAction<StudioAutoActionPlan | null>>;
  readonly setAutoActionStatus: Dispatch<SetStateAction<string | null>>;
}): Promise<void> {
  const stopped = stopStudioMacroRecording(macroSession);
  const { studioMacroSessionToAutoActionSet } = await import("../studio-macro-to-auto-actions");
  const actionSet = studioMacroSessionToAutoActionSet(stopped);
  setMacroSession(createStudioMacroSession(stopped.name));
  setAutoActionSet(actionSet);
  setAutoActionPlan(null);
  setAutoActionStatus(
    stopped.commands.length > 0
      ? `매크로 ${stopped.commands.length}단계를 Action Set으로 저장했어요.`
      : "녹음된 단계가 없어 빈 Action Set을 만들었어요.",
  );
}

export async function runStudioUndoBrushDelete({
  pending, productBrushRepository, refreshSavedBrushesFromRepository,
  setPendingBrushDeletes, setPausedBrushDeleteId, announceDrawingShortcut, failureMessage,
}: {
  readonly pending: PendingBrushDelete;
  readonly productBrushRepository: () => Promise<ProductBrushLibraryRepository>;
  readonly refreshSavedBrushesFromRepository: (product: ProductBrushLibraryRepository) => Promise<unknown>;
  readonly setPendingBrushDeletes: Dispatch<SetStateAction<PendingBrushDelete[]>>;
  readonly setPausedBrushDeleteId: Dispatch<SetStateAction<string | null>>;
  readonly announceDrawingShortcut: (message: string) => void;
  readonly failureMessage: string;
}): Promise<void> {
  try {
    const product = await productBrushRepository();
    await product.repository.restore(pending.deleted);
    await refreshSavedBrushesFromRepository(product);
    setPendingBrushDeletes((current) => current.filter((candidate) => candidate.id !== pending.id));
    setPausedBrushDeleteId((current) => (current === pending.id ? null : current));
    announceDrawingShortcut(`“${pending.deleted.brush.name}” 브러시를 복구했어요.`);
  } catch {
    announceDrawingShortcut(failureMessage);
  }
}

export function runStudioFitSelectedToFrame<Ticket>({
  selected, groups, elements, canvasH, captureStudioMutationTicket, canApplyStudioMutation, patchEl,
}: {
  readonly selected: El | null | undefined;
  readonly groups: LayerGroup[];
  readonly elements: readonly El[];
  readonly canvasH: number;
  readonly captureStudioMutationTicket: () => Ticket;
  readonly canApplyStudioMutation: (ticket: Ticket) => boolean;
  readonly patchEl: (id: string, patch: Partial<El>) => boolean;
}): void {
  if (!selected || selected.type !== "image" || isEffectivelyLocked(selected, groups)) return;
  const mutationTicket = captureStudioMutationTicket();
  const frame = containingPanel(selected, elements);
  const target = frame
    ? { x: frame.x, y: frame.y, width: frame.width, height: frame.height }
    : { x: 0, y: 0, width: CANVAS_W, height: canvasH };
  if (!canApplyStudioMutation(mutationTicket)) return;
  patchEl(selected.id, coverFitInFrame({ width: selected.width, height: selected.height }, target));
}

export async function runStudioDownloadAiPublicSummary({
  summary, title, ensureSharedDocumentAvailableForExport,
}: {
  readonly summary: unknown;
  readonly title: string;
  readonly ensureSharedDocumentAvailableForExport: () => boolean;
}): Promise<void> {
  if (!ensureSharedDocumentAvailableForExport()) return;
  const { downloadBlob } = await import("../export/studio-export");
  downloadBlob(
    new Blob([JSON.stringify(summary, null, 2)], { type: "application/json;charset=utf-8" }),
    `${(title || "toonstudio").replaceAll(/[^a-zA-Z0-9가-힣_-]+/g, "-")}-ai-summary.json`,
  );
}
