import type { MutableRefObject } from "react";

import type { StudioAiAssistToolId } from "../ai/studio-ai-assist-ux";
import { resolveColorizeCandidateApply } from "../ai/studio-ai-candidate-apply";
import {
  colorizeLineArt,
  generateStudioWriterRoomDraft,
  studioTextAiTransportForOperation,
  suggestColorPalette,
  suggestDialogueLines,
  type StudioAiSettings,
  type StudioTextAiProvenance,
  type StudioTextAiTransport,
} from "../ai/studio-ai-client-lazy";
import {
  addColorizeCandidate,
  type StudioAiColorizeCandidateSession,
} from "../ai/studio-ai-colorize-candidates";
import type { StudioAiComicComposerHandoff } from "../ai/studio-ai-comic-composer-handoff";
import {
  captureStudioAiGeneratedAssetProvenance,
  type StudioAiGeneratedAssetProvenance,
} from "../ai/studio-ai-generated-asset-model";
import {
  studioImageAiProviderContext,
  type SettleStudioAiOperationOptions,
  type StudioAiObservableResult,
  type StudioAiOperationProviderContext,
  type StudioAiPendingOperationInput,
} from "../ai/studio-ai-provenance-recorder";
import {
  addReferenceAttachment,
  type StudioAiReferenceAttachment,
} from "../ai/studio-ai-reference-attachments";
import { collectDialogueItems } from "../lettering/studio-dialogue-batch";
import {
  joinDialogueContextLines,
  type DialogueSuggestionCandidate,
} from "../lettering/studio-dialogue-suggest";
import { CANVAS_W } from "../studio-assets";
import {
  buildStudioCharacterBiblePromptContext,
  type StudioCharacterBible,
} from "../studio-character-bible";
import type { El, FrameEl } from "../studio-element-model";
import type { PageState } from "../studio-page-state";
import type { PaletteSuggestion } from "../studio-palette-suggest";
import {
  layoutScenarioPanels,
  scenarioGenerationPreferencesFromHandoff,
  scenarioReviewedArtwork,
  type ScenarioPreviewItem,
} from "../studio-scenario-layout";
import type {
  StudioWriterRoomDocument,
  StudioWriterRoomStage,
} from "../studio-writer-room";

type StudioTrackedAiOperationPayload = Omit<StudioAiPendingOperationInput, "id">;
type StudioWriterRoomDraftData = Extract<
  Awaited<ReturnType<typeof generateStudioWriterRoomDraft>>,
  { ok: true }
>["data"];

export function buildStudioTextAiSettlementOptions(
  textProvenance?: StudioTextAiProvenance,
  aborted = false,
): SettleStudioAiOperationOptions {
  return {
    aborted,
    ...(textProvenance
      ? {
          provider: textProvenance.provider,
          model: textProvenance.model,
          usage: textProvenance.usage,
          requestId: textProvenance.requestId,
        }
      : {}),
  };
}

export async function runStudioWriterRoomAiDraft<TTicket>(input: {
  readonly stage: StudioWriterRoomStage;
  readonly collaborationLocked: boolean;
  readonly collaborationLockMessage: () => string;
  readonly busy: boolean;
  readonly textAiConfigured: boolean;
  readonly aiSettings: StudioAiSettings;
  readonly textAiTransport: StudioTextAiTransport;
  readonly writerRoom: StudioWriterRoomDocument;
  readonly characterBible: StudioCharacterBible;
  readonly direction: string;
  readonly abortRef: MutableRefObject<AbortController | null>;
  readonly captureMutationTicket: () => TTicket;
  readonly canApplyMutation: (ticket: TTicket) => boolean;
  readonly pendingProvider: () => StudioAiOperationProviderContext;
  readonly beginTrackedOperation: (
    feature: "writer-room",
    operation: StudioTrackedAiOperationPayload,
  ) => string;
  readonly settleTextOperation: (
    operationId: string,
    result: StudioAiObservableResult,
    textProvenance?: StudioTextAiProvenance,
    aborted?: boolean,
  ) => void;
  readonly setBusy: (busy: boolean) => void;
  readonly setError: (error: string | null) => void;
  readonly setReview: (review: StudioWriterRoomDraftData | null) => void;
}): Promise<void> {
  if (input.collaborationLocked) {
    input.setError(input.collaborationLockMessage());
    return;
  }
  if (input.busy || !input.textAiConfigured) return;
  const mutationTicket = input.captureMutationTicket();
  input.abortRef.current?.abort();
  const controller = new AbortController();
  input.abortRef.current = controller;
  const characterContext = buildStudioCharacterBiblePromptContext(input.characterBible);
  const auditPrompt = JSON.stringify({
    stage: input.stage,
    current: input.writerRoom.stages[input.stage],
    characterContext,
    direction: input.direction.trim(),
  });
  const pendingProvider = input.pendingProvider();
  const operationId = input.beginTrackedOperation("writer-room", {
    kind: "text",
    task: "scenario",
    provider: pendingProvider.provider,
    model: pendingProvider.model,
    transport: pendingProvider.transport,
    promptVersion: 1,
    prompt: auditPrompt,
    references: [],
  });
  input.setBusy(true);
  input.setError(null);
  input.setReview(null);
  try {
    const result = await generateStudioWriterRoomDraft(
      input.aiSettings,
      {
        stage: input.stage,
        document: input.writerRoom,
        characterContext,
        direction: input.direction,
        signal: controller.signal,
      },
      studioTextAiTransportForOperation(input.textAiTransport, operationId),
    );
    if (!input.canApplyMutation(mutationTicket)) return;
    if (!result.ok) {
      if (controller.signal.aborted) {
        input.settleTextOperation(operationId, result, undefined, true);
        return;
      }
      input.setError(result.error);
      input.settleTextOperation(operationId, result);
      return;
    }
    input.setReview(result.data);
    input.settleTextOperation(operationId, result, result.data.textProvenance);
  } finally {
    if (input.abortRef.current === controller) input.abortRef.current = null;
    input.setBusy(false);
  }
}

export function runStudioApplyAiAssistPresetPrompt(input: {
  readonly tool: StudioAiAssistToolId;
  readonly prompt: string;
  readonly activeTool: StudioAiAssistToolId;
  readonly setActiveTool: (tool: StudioAiAssistToolId) => void;
  readonly setBgPrompt: (prompt: string) => void;
  readonly setCharacterPrompt: (prompt: string) => void;
  readonly setDialogueSituation: (prompt: string) => void;
  readonly setPaletteMood: (prompt: string) => void;
  readonly setCompositionDraft: (prompt: string) => void;
}): void {
  if (input.tool !== input.activeTool) input.setActiveTool(input.tool);
  switch (input.tool) {
    case "background":
      input.setBgPrompt(input.prompt);
      break;
    case "character":
      input.setCharacterPrompt(input.prompt);
      break;
    case "dialogue":
      input.setDialogueSituation(input.prompt);
      break;
    case "palette":
      input.setPaletteMood(input.prompt);
      break;
    case "composition":
      input.setCompositionDraft(input.prompt);
      break;
    default:
      break;
  }
}

export interface StudioAiDialogueLockedTarget {
  readonly pageId: string;
  readonly elementId: string;
  readonly pageLabel?: string;
  readonly originalText?: string;
}

export async function runStudioExecuteAiColorizeCandidate<TTicket>(input: {
  readonly elId: string;
  readonly srcAtRequestTime: string;
  readonly prompt: string;
  readonly collaborationLocked: boolean;
  readonly activePageId: string;
  readonly aiSettings: StudioAiSettings;
  readonly candidateSession: StudioAiColorizeCandidateSession;
  readonly candidateProvenanceRef: MutableRefObject<Map<string, StudioAiGeneratedAssetProvenance>>;
  readonly editorMountedRef: MutableRefObject<boolean>;
  readonly abortRef?: MutableRefObject<AbortController | null>;
  readonly captureMutationTicket: () => TTicket;
  readonly canApplyMutation: (ticket: TTicket) => boolean;
  readonly beginTrackedOperation: (
    feature: "colorize",
    operation: StudioTrackedAiOperationPayload,
  ) => string;
  readonly settleOperation: (operationId: string, result: StudioAiObservableResult) => void;
  readonly setBusy: (busy: boolean) => void;
  readonly setError: (error: string | null) => void;
  readonly setSession: (session: StudioAiColorizeCandidateSession) => void;
  readonly setTargetId: (targetId: string | null) => void;
  readonly setTargetPageId?: (pageId: string | null) => void;
}): Promise<void> {
  if (input.collaborationLocked) return;
  const mutationTicket = input.captureMutationTicket();
  input.abortRef?.current?.abort();
  const controller = new AbortController();
  if (input.abortRef) input.abortRef.current = controller;
  input.setBusy(true);
  input.setError(null);
  const provider = studioImageAiProviderContext(input.aiSettings);
  const requestProvenance = captureStudioAiGeneratedAssetProvenance(provider, "edited");
  const operationId = input.beginTrackedOperation("colorize", {
    kind: "image",
    task: "colorize",
    provider: provider.provider,
    model: provider.model,
    transport: provider.transport,
    promptVersion: 1,
    prompt: input.prompt,
    target: { pageId: input.activePageId, elementId: input.elId },
    references: [{ assetId: input.elId }],
  });
  const result = await colorizeLineArt(
    input.aiSettings,
    input.srcAtRequestTime,
    input.prompt,
    { signal: controller.signal },
  );
  if (input.abortRef?.current === controller) input.abortRef.current = null;
  if (controller.signal.aborted || !input.canApplyMutation(mutationTicket)) {
    if (input.editorMountedRef.current) input.setBusy(false);
    return;
  }
  input.settleOperation(operationId, result);
  if (!result.ok) {
    input.setError(result.error);
    input.setBusy(false);
    return;
  }
  const candidateId = `candidate-${Date.now()}-${input.candidateSession.candidates.length}`;
  const added = addColorizeCandidate(input.candidateSession, {
    id: candidateId,
    dataUrl: result.data.dataUrl,
    prompt: input.prompt,
    createdAt: Date.now(),
  });
  if (!added.ok) {
    input.setError("채색 후보 상한(3장)에 닿았어요. 후보를 비운 뒤 다시 모아 주세요.");
    input.setBusy(false);
    return;
  }
  input.candidateProvenanceRef.current.set(candidateId, requestProvenance);
  input.setSession(added.session);
  input.setTargetId(input.elId);
  input.setTargetPageId?.(input.activePageId);
  input.setBusy(false);
}

export function runStudioApplyColorizeCandidate(input: {
  readonly targetId: string | null;
  readonly targetPageId?: string | null;
  readonly candidateSession: StudioAiColorizeCandidateSession;
  readonly targetElement: El | undefined;
  readonly candidateProvenanceRef: MutableRefObject<Map<string, StudioAiGeneratedAssetProvenance>>;
  readonly patchEl: (
    id: string,
    patch: { src: string; aiProvenance?: StudioAiGeneratedAssetProvenance },
  ) => boolean;
  readonly patchElOnPage?: (
    pageId: string,
    id: string,
    patch: { src: string; aiProvenance?: StudioAiGeneratedAssetProvenance },
  ) => boolean;
  readonly setError: (error: string) => void;
}): void {
  if (!input.targetId) return;
  const resolved = resolveColorizeCandidateApply(input.candidateSession);
  if (!resolved.ok) {
    input.setError("적용할 후보를 먼저 선택해 주세요.");
    return;
  }
  if (!input.targetElement || input.targetElement.type !== "image") {
    input.setError("채색 후보를 적용할 원본 이미지 레이어를 찾지 못했어요.");
    return;
  }
  const provenance = input.candidateProvenanceRef.current.get(resolved.plan.candidateId);
  const patch = provenance
    ? { src: resolved.plan.dataUrl, aiProvenance: provenance }
    : { src: resolved.plan.dataUrl };
  const applied =
    input.targetPageId && input.patchElOnPage
      ? input.patchElOnPage(input.targetPageId, input.targetId, patch)
      : input.patchEl(input.targetId, patch);
  if (!applied) {
    input.setError("채색 후보는 생성됐지만 이미지 레이어에 적용하지 못했어요.");
  }
}

export function resolveStudioAddReferenceAttachment(
  current: readonly StudioAiReferenceAttachment[],
  input: { readonly kind: "image" | "text"; readonly label: string; readonly ref: string },
): { readonly ok: true; readonly attachments: StudioAiReferenceAttachment[] } | { readonly ok: false; readonly error: string } {
  const result = addReferenceAttachment(current, input);
  if (!result.ok) {
    if (result.reason === "cap_reached") return { ok: false, error: "참조 첨부는 최대 6개까지예요." };
    if (result.reason === "empty_label") return { ok: false, error: "참조 이름을 입력해 주세요." };
    if (result.reason === "empty_ref") return { ok: false, error: "참조 내용을 입력해 주세요." };
    return { ok: false, error: "이미지 참조는 data:image/ 형식이어야 해요." };
  }
  return { ok: true, attachments: [...result.attachments] };
}

export function planStudioScenarioProductionImport(input: {
  readonly handoff: StudioAiComicComposerHandoff;
  readonly target: "current-page" | "new-page";
  readonly elements: readonly El[];
  readonly canvasH: number;
}): {
  readonly storyText: string;
  readonly sceneCountHint: number | undefined;
  readonly items: ScenarioPreviewItem[];
  readonly nextCanvasH: number;
  readonly characterDescription: string;
} {
  const existingFrames =
    input.target === "current-page"
      ? input.elements.filter((element): element is FrameEl => element.type === "frame")
      : [];
  const { panels, nextCanvasH } = layoutScenarioPanels(
    existingFrames,
    CANVAS_W,
    input.target === "current-page" ? input.canvasH : 1080,
    input.handoff.scenes,
  );
  return {
    storyText: input.handoff.storyText,
    sceneCountHint:
      input.handoff.totalCuts >= 2 && input.handoff.totalCuts <= 10
        ? input.handoff.totalCuts
        : undefined,
    items: panels.map((panel, index) => ({
      ...panel,
      ...scenarioReviewedArtwork(input.handoff.scenes[index]),
      ...scenarioGenerationPreferencesFromHandoff(input.handoff),
    })),
    nextCanvasH,
    characterDescription: input.handoff.characterDescription ?? "",
  };
}

export async function runStudioExecuteSuggestDialogueLines<TTicket = unknown>(input: {
  readonly collaborationLocked: boolean;
  readonly situationText: string;
  readonly busy: boolean;
  readonly includeContext: boolean;
  readonly pages: PageState[];
  readonly activePageId: string;
  readonly aiSettings: StudioAiSettings;
  readonly textAiTransport: StudioTextAiTransport;
  readonly abortRef?: MutableRefObject<AbortController | null>;
  readonly captureMutationTicket?: () => TTicket;
  readonly canApplyMutation?: (ticket: TTicket) => boolean;
  readonly lockedTarget?: StudioAiDialogueLockedTarget | null;
  readonly setLockedTarget?: (target: StudioAiDialogueLockedTarget | null) => void;
  readonly pendingProvider: () => StudioAiOperationProviderContext;
  readonly beginTrackedOperation: (
    feature: "dialogue",
    operation: StudioTrackedAiOperationPayload,
  ) => string;
  readonly settleTextOperation: (
    operationId: string,
    result: StudioAiObservableResult,
    textProvenance?: StudioTextAiProvenance,
    aborted?: boolean,
  ) => void;
  readonly setBusy: (busy: boolean) => void;
  readonly setError: (error: string | null) => void;
  readonly setCandidates: (candidates: DialogueSuggestionCandidate[] | null) => void;
}): Promise<void> {
  if (input.collaborationLocked) return;
  const situation = input.situationText.trim();
  if (!situation || input.busy) return;
  const mutationTicket = input.captureMutationTicket?.();
  input.abortRef?.current?.abort();
  const controller = new AbortController();
  if (input.abortRef) input.abortRef.current = controller;
  input.setLockedTarget?.(input.lockedTarget ?? null);
  input.setBusy(true);
  input.setError(null);
  input.setCandidates(null);
  const existingContext = input.includeContext
    ? joinDialogueContextLines(
        collectDialogueItems(input.pages)
          .filter((item) => item.pageId === input.activePageId)
          .map((item) => item.text),
      )
    : "";
  const pendingProvider = input.pendingProvider();
  const operationId = input.beginTrackedOperation("dialogue", {
    kind: "text",
    task: "dialogue",
    provider: pendingProvider.provider,
    model: pendingProvider.model,
    transport: pendingProvider.transport,
    promptVersion: 1,
    prompt: JSON.stringify({ situation, existingContext }),
    target: {
      pageId: input.activePageId,
      ...(input.lockedTarget ? { elementId: input.lockedTarget.elementId } : {}),
    },
    references: [],
  });
  try {
    const result = await suggestDialogueLines(
      input.aiSettings,
      situation,
      { existingContext, signal: controller.signal },
      studioTextAiTransportForOperation(input.textAiTransport, operationId),
    );
    if (controller.signal.aborted) {
      input.settleTextOperation(operationId, result, undefined, true);
      return;
    }
    if (
      mutationTicket !== undefined &&
      input.canApplyMutation &&
      !input.canApplyMutation(mutationTicket)
    ) {
      input.settleTextOperation(operationId, result, undefined, true);
      return;
    }
    input.settleTextOperation(
      operationId,
      result,
      result.ok ? result.data.textProvenance : undefined,
    );
    if (result.ok) input.setCandidates(result.data.candidates);
    else input.setError(result.error);
  } finally {
    if (input.abortRef?.current === controller) input.abortRef.current = null;
    input.setBusy(false);
  }
}

export async function runStudioExecuteSuggestColorPalette(input: {
  readonly collaborationLocked: boolean;
  readonly moodText: string;
  readonly busy: boolean;
  readonly activePageId: string;
  readonly aiSettings: StudioAiSettings;
  readonly textAiTransport: StudioTextAiTransport;
  readonly pendingProvider: () => StudioAiOperationProviderContext;
  readonly beginTrackedOperation: (
    feature: "palette",
    operation: StudioTrackedAiOperationPayload,
  ) => string;
  readonly settleTextOperation: (
    operationId: string,
    result: StudioAiObservableResult,
    textProvenance?: StudioTextAiProvenance,
  ) => void;
  readonly setBusy: (busy: boolean) => void;
  readonly setError: (error: string | null) => void;
  readonly setSuggestion: (suggestion: PaletteSuggestion | null) => void;
  readonly clearSavedMessage: () => void;
}): Promise<void> {
  if (input.collaborationLocked) return;
  const mood = input.moodText.trim();
  if (!mood || input.busy) return;
  input.setBusy(true);
  input.setError(null);
  input.setSuggestion(null);
  input.clearSavedMessage();
  const pendingProvider = input.pendingProvider();
  const operationId = input.beginTrackedOperation("palette", {
    kind: "text",
    task: "palette",
    provider: pendingProvider.provider,
    model: pendingProvider.model,
    transport: pendingProvider.transport,
    promptVersion: 1,
    prompt: mood,
    target: { pageId: input.activePageId },
    references: [],
  });
  const result = await suggestColorPalette(
    input.aiSettings,
    mood,
    studioTextAiTransportForOperation(input.textAiTransport, operationId),
  );
  input.settleTextOperation(operationId, result, result.ok ? result.data.textProvenance : undefined);
  if (result.ok) input.setSuggestion(result.data);
  else input.setError(result.error);
  input.setBusy(false);
}
