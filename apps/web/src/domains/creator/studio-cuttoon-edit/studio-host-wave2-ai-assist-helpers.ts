import type { MutableRefObject } from "react";

import type { StudioAiAssistToolId } from "../ai/studio-ai-assist-ux";
import { resolveColorizeCandidateApply } from "../ai/studio-ai-candidate-apply";
import {
  generateStudioWriterRoomDraft,
  studioTextAiTransportForOperation,
  suggestColorPalette,
  suggestDialogueLines,
  type StudioAiSettings,
  type StudioTextAiProvenance,
  type StudioTextAiTransport,
} from "../ai/studio-ai-client-lazy";
import type { StudioAiColorizeCandidateSession } from "../ai/studio-ai-colorize-candidates";
import type { StudioAiComicComposerHandoff } from "../ai/studio-ai-comic-composer-handoff";
import type { StudioAiGeneratedAssetProvenance } from "../ai/studio-ai-generated-asset-model";
import {
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
  recommendLocalDialogueCandidates,
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
  readonly originalText: string;
  readonly lastAppliedText?: string;
}

export function cancelStudioAiRequest(
  abortRef: MutableRefObject<AbortController | null>, setBusy: (busy: boolean) => void,
): void {
  const controller = abortRef.current;
  if (!controller) return;
  controller.abort();
  if (abortRef.current !== controller) return;
  abortRef.current = null;
  setBusy(false);
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

export function runStudioApplyDialogueSuggestion(input: {
  readonly pages: readonly Pick<PageState, "id" | "elements">[];
  readonly activePageId: string;
  readonly selected: El | null | undefined;
  readonly lockedTarget: StudioAiDialogueLockedTarget | null;
  readonly text: string;
  readonly patchDialogueText: (pageId: string, elementId: string, text: string) => boolean;
  readonly setError: (message: string) => void;
}): boolean {
  const lockedTarget = input.lockedTarget;
  if (!lockedTarget) {
    const selected = input.selected;
    return Boolean(selected && (selected.type === "bubble" || selected.type === "text")
      && input.patchDialogueText(input.activePageId, selected.id, input.text));
  }
  const page = input.pages.find((item) => item.id === lockedTarget.pageId);
  const element = page?.elements.find((item) => item.id === lockedTarget.elementId);
  if (!element || (element.type !== "bubble" && element.type !== "text")) {
    input.setError("원래 선택한 말풍선을 찾지 못했어요.");
    return false;
  }
  if (element.text !== (lockedTarget.lastAppliedText ?? lockedTarget.originalText)) {
    input.setError("제안 뒤에 바뀐 대사를 그대로 뒀어요. 현재 대사를 기준으로 다시 제안받아 주세요.");
    return false;
  }
  return input.patchDialogueText(lockedTarget.pageId, lockedTarget.elementId, input.text);
}

export async function runStudioExecuteSuggestDialogueLines<TTicket = unknown>(input: {
  readonly localOnly?: boolean;
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
  const situation = input.situationText.trim();
  if (!situation || input.busy) return;
  if (input.localOnly) {
    input.setLockedTarget?.(input.lockedTarget ?? null);
    input.setCandidates([...recommendLocalDialogueCandidates(situation)]);
    input.setError(null);
    return;
  }
  if (input.collaborationLocked) return;
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
    if (!input.abortRef || input.abortRef.current === controller) {
      if (input.abortRef) input.abortRef.current = null;
      input.setBusy(false);
    }
  }
}

export async function runStudioExecuteSuggestColorPalette(input: {
  readonly collaborationLocked: boolean;
  readonly moodText: string;
  readonly busy: boolean;
  readonly activePageId: string;
  readonly aiSettings: StudioAiSettings;
  readonly textAiTransport: StudioTextAiTransport;
  readonly abortRef: MutableRefObject<AbortController | null>;
  readonly isRequestScopeCurrent: () => boolean;
  readonly pendingProvider: () => StudioAiOperationProviderContext;
  readonly beginTrackedOperation: (
    feature: "palette",
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
  readonly setSuggestion: (suggestion: PaletteSuggestion | null) => void;
  readonly clearSavedMessage: () => void;
}): Promise<void> {
  const { abortRef, isRequestScopeCurrent } = input;
  if (input.collaborationLocked || !isRequestScopeCurrent()) return;
  const mood = input.moodText.trim();
  if (!mood || input.busy || abortRef.current) return;
  const controller = new AbortController();
  abortRef.current = controller;
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
  const ownsRequest = () => abortRef.current === controller;
  let settled = false;
  function settle(result: StudioAiObservableResult, provenance?: StudioTextAiProvenance, aborted?: boolean): boolean {
    if (settled || !ownsRequest() || !isRequestScopeCurrent()) return false;
    settled = true;
    input.settleTextOperation(operationId, result, provenance, aborted);
    return true;
  }
  const settleCancelled = () => {
    settle({ ok: false }, undefined, true);
  };
  controller.signal.addEventListener("abort", settleCancelled, { once: true });
  try {
    const transport = studioTextAiTransportForOperation(input.textAiTransport, operationId);
    const result = await suggestColorPalette(input.aiSettings, mood, { ...transport, signal: controller.signal });
    if (controller.signal.aborted || !settle(result, result.ok ? result.data.textProvenance : undefined)) return;
    if (result.ok) input.setSuggestion(result.data);
    else input.setError(result.error);
  } catch {
    if (!controller.signal.aborted && settle({ ok: false, code: "network_error" })) {
      input.setError("팔레트 추천을 완료하지 못했어요. 다시 시도해 주세요.");
    }
  } finally {
    controller.signal.removeEventListener("abort", settleCancelled);
    if (ownsRequest()) {
      abortRef.current = null;
      input.setBusy(false);
    }
  }
}
