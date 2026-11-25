import type { MutableRefObject } from "react";

import {
  colorizeLineArt,
  generateBackgroundImage,
  generateConsistentCharacterImage,
  studioTextAiTransportForOperation,
  suggestColorPalette,
  suggestDialogueLines,
  type StudioAiImageSize,
  type StudioAiSettings,
  type StudioTextAiProvenance,
  type StudioTextAiTransport,
} from "../ai/studio-ai-client-lazy";
import {
  addColorizeCandidate,
  type StudioAiColorizeCandidateSession,
} from "../ai/studio-ai-colorize-candidates";
import {
  captureStudioAiGeneratedAssetProvenance,
  type StudioAiGeneratedAssetProvenance,
} from "../ai/studio-ai-generated-asset-model";
import {
  parseStudioAiRequestedSize,
  studioImageAiProviderContext,
  type StudioAiObservableResult,
  type StudioAiOperationProviderContext,
  type StudioAiPendingOperationInput,
} from "../ai/studio-ai-provenance-recorder";
import { collectDialogueItems } from "../lettering/studio-dialogue-batch";
import {
  joinDialogueContextLines,
  type DialogueSuggestionCandidate,
} from "../lettering/studio-dialogue-suggest";
import { CANVAS_W } from "../studio-assets";
import { createCanvasImageElement } from "../studio-image-placement";
import type { El } from "../studio-element-model";
import { uid } from "../studio-id";
import type { PageState } from "../studio-page-state";
import type { PaletteSuggestion } from "../studio-palette-suggest";
import type { StudioPublishAiProvenance } from "../studio-publish-preflight";
import type { StudioAiDialogueLockedTarget } from "./studio-host-wave2-ai-assist-helpers";

type TrackedOpPayload = Omit<StudioAiPendingOperationInput, "id">;

export function applyStudioCrossPageAiBackground(input: {
  readonly pages: PageState[];
  readonly requestTarget: { readonly pageId: string; readonly selectedFrameId: string | null };
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly aiProvenance: StudioPublishAiProvenance;
  readonly commitPages: (pages: PageState[]) => boolean;
}): boolean {
  const targetPage = input.pages.find((page) => page.id === input.requestTarget.pageId);
  if (!targetPage) return false;
  const targetFrames = targetPage.elements.filter((el) => el.type === "frame");
  let nextElements: El[];
  if (
    input.requestTarget.selectedFrameId &&
    targetPage.elements.some((el) => el.id === input.requestTarget.selectedFrameId && el.type === "frame")
  ) {
    nextElements = targetPage.elements.map((el) =>
      el.id === input.requestTarget.selectedFrameId
        ? ({ ...el, bg: input.dataUrl, aiProvenance: input.aiProvenance, bundleSourceCredit: undefined } as El)
        : el,
    );
  } else if (targetFrames.length > 0) {
    nextElements = targetPage.elements.map((el) =>
      el.type === "frame"
        ? ({ ...el, bg: input.dataUrl, aiProvenance: input.aiProvenance, bundleSourceCredit: undefined } as El)
        : el,
    );
  } else {
    const el = createCanvasImageElement({
      id: uid(),
      src: input.dataUrl,
      canvasWidth: CANVAS_W,
      canvasHeight: targetPage.canvasH,
      sourceWidth: input.width,
      sourceHeight: input.height,
      horizontalInset: 0,
      minY: 0,
    });
    nextElements = [{ ...el, aiProvenance: input.aiProvenance }, ...targetPage.elements];
  }
  return input.commitPages(
    input.pages.map((page) =>
      page.id === input.requestTarget.pageId ? { ...page, elements: nextElements } : page,
    ),
  );
}

export function applyStudioCrossPageAiCharacter(input: {
  readonly pages: PageState[];
  readonly requestPageId: string;
  readonly dataUrl: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly aiProvenance: StudioPublishAiProvenance;
  readonly commitPages: (pages: PageState[]) => boolean;
}): boolean {
  const targetPage = input.pages.find((page) => page.id === input.requestPageId);
  if (!targetPage) return false;
  const element = createCanvasImageElement({
    id: uid(),
    src: input.dataUrl,
    canvasWidth: CANVAS_W,
    canvasHeight: targetPage.canvasH,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
  });
  return input.commitPages(
    input.pages.map((page) =>
      page.id === input.requestPageId
        ? { ...page, elements: [...page.elements, { ...element, aiProvenance: input.aiProvenance }] }
        : page,
    ),
  );
}

export async function runStudioAbortableAiBackgroundGenerate<TTicket>(input: {
  readonly prompt: string;
  readonly size: StudioAiImageSize;
  readonly collaborationLocked: boolean;
  readonly activePageId: string;
  readonly selectedFrameId: string | null;
  readonly aiSettings: StudioAiSettings;
  readonly abortRef: MutableRefObject<AbortController | null>;
  readonly editorMountedRef: MutableRefObject<boolean>;
  readonly captureMutationTicket: () => TTicket;
  readonly canApplyMutation: (ticket: TTicket) => boolean;
  readonly beginTrackedOperation: (feature: "background-image", op: TrackedOpPayload) => string;
  readonly settleOperation: (operationId: string, result: StudioAiObservableResult) => void;
  readonly setBusy: (busy: boolean) => void;
  readonly setError: (error: string | null) => void;
  readonly insertBackground: (
    dataUrl: string, width: number, height: number, provenance: StudioPublishAiProvenance,
    target: { readonly pageId: string; readonly selectedFrameId: string | null },
  ) => boolean;
  readonly applyFailedMessage: string;
  readonly onApplied: () => void;
}): Promise<void> {
  if (input.collaborationLocked) return;
  const mutationTicket = input.captureMutationTicket();
  input.abortRef.current?.abort();
  const controller = new AbortController();
  input.abortRef.current = controller;
  input.setBusy(true);
  input.setError(null);
  const provider = studioImageAiProviderContext(input.aiSettings);
  const provenance = captureStudioAiGeneratedAssetProvenance(provider, "generated");
  const operationId = input.beginTrackedOperation("background-image", {
    kind: "image", task: "background-image", provider: provider.provider, model: provider.model,
    transport: provider.transport, promptVersion: 1, prompt: input.prompt,
    target: { pageId: input.activePageId, ...(input.selectedFrameId ? { elementId: input.selectedFrameId } : {}) },
    requestedSize: parseStudioAiRequestedSize(input.size), references: [],
  });
  const result = await generateBackgroundImage(input.aiSettings, input.prompt, { size: input.size, signal: controller.signal });
  if (input.abortRef.current === controller) input.abortRef.current = null;
  if (controller.signal.aborted || !input.canApplyMutation(mutationTicket)) {
    if (input.editorMountedRef.current) input.setBusy(false);
    return;
  }
  input.settleOperation(operationId, result);
  if (!result.ok) { input.setError(result.error); input.setBusy(false); return; }
  const ok = input.insertBackground(result.data.dataUrl, result.data.width, result.data.height, provenance, {
    pageId: input.activePageId, selectedFrameId: input.selectedFrameId,
  });
  if (!ok) { input.setError(input.applyFailedMessage); input.setBusy(false); return; }
  input.setBusy(false);
  input.onApplied();
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
  readonly beginTrackedOperation: (feature: "colorize", operation: TrackedOpPayload) => string;
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
    kind: "image", task: "colorize", provider: provider.provider, model: provider.model,
    transport: provider.transport, promptVersion: 1, prompt: input.prompt,
    target: { pageId: input.activePageId, elementId: input.elId }, references: [{ assetId: input.elId }],
  });
  const result = await colorizeLineArt(input.aiSettings, input.srcAtRequestTime, input.prompt, { signal: controller.signal });
  if (input.abortRef?.current === controller) input.abortRef.current = null;
  if (controller.signal.aborted || !input.canApplyMutation(mutationTicket)) {
    if (input.editorMountedRef.current) input.setBusy(false);
    return;
  }
  input.settleOperation(operationId, result);
  if (!result.ok) { input.setError(result.error); input.setBusy(false); return; }
  const candidateId = `candidate-${Date.now()}-${input.candidateSession.candidates.length}`;
  const added = addColorizeCandidate(input.candidateSession, {
    id: candidateId, dataUrl: result.data.dataUrl, prompt: input.prompt, createdAt: Date.now(),
  });
  if (!added.ok) { input.setError("채색 후보 상한(3장)에 닿았어요. 후보를 비운 뒤 다시 모아 주세요."); input.setBusy(false); return; }
  input.candidateProvenanceRef.current.set(candidateId, requestProvenance);
  input.setSession(added.session);
  input.setTargetId(input.elId);
  input.setTargetPageId?.(input.activePageId);
  input.setBusy(false);
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
  readonly beginTrackedOperation: (feature: "dialogue", operation: TrackedOpPayload) => string;
  readonly settleTextOperation: (operationId: string, result: StudioAiObservableResult, textProvenance?: StudioTextAiProvenance, aborted?: boolean) => void;
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
        collectDialogueItems(input.pages).filter((item) => item.pageId === input.activePageId).map((item) => item.text),
      )
    : "";
  const pendingProvider = input.pendingProvider();
  const operationId = input.beginTrackedOperation("dialogue", {
    kind: "text", task: "dialogue", provider: pendingProvider.provider, model: pendingProvider.model,
    transport: pendingProvider.transport, promptVersion: 1, prompt: JSON.stringify({ situation, existingContext }),
    target: { pageId: input.activePageId, ...(input.lockedTarget ? { elementId: input.lockedTarget.elementId } : {}) },
    references: [],
  });
  try {
    const result = await suggestDialogueLines(
      input.aiSettings, situation, { existingContext, signal: controller.signal },
      studioTextAiTransportForOperation(input.textAiTransport, operationId),
    );
    if (controller.signal.aborted || (mutationTicket !== undefined && input.canApplyMutation && !input.canApplyMutation(mutationTicket))) {
      input.settleTextOperation(operationId, result, undefined, true);
      return;
    }
    input.settleTextOperation(operationId, result, result.ok ? result.data.textProvenance : undefined);
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
  readonly abortRef?: MutableRefObject<AbortController | null>;
  readonly pendingProvider: () => StudioAiOperationProviderContext;
  readonly beginTrackedOperation: (feature: "palette", operation: TrackedOpPayload) => string;
  readonly settleTextOperation: (operationId: string, result: StudioAiObservableResult, textProvenance?: StudioTextAiProvenance, aborted?: boolean) => void;
  readonly setBusy: (busy: boolean) => void;
  readonly setError: (error: string | null) => void;
  readonly setSuggestion: (suggestion: PaletteSuggestion | null) => void;
  readonly clearSavedMessage: () => void;
}): Promise<void> {
  if (input.collaborationLocked) return;
  const mood = input.moodText.trim();
  if (!mood || input.busy) return;
  input.abortRef?.current?.abort();
  const controller = new AbortController();
  if (input.abortRef) input.abortRef.current = controller;
  input.setBusy(true);
  input.setError(null);
  input.setSuggestion(null);
  input.clearSavedMessage();
  const pendingProvider = input.pendingProvider();
  const operationId = input.beginTrackedOperation("palette", {
    kind: "text", task: "palette", provider: pendingProvider.provider, model: pendingProvider.model,
    transport: pendingProvider.transport, promptVersion: 1, prompt: mood,
    target: { pageId: input.activePageId }, references: [],
  });
  try {
    const baseTransport = studioTextAiTransportForOperation(input.textAiTransport, operationId);
    const result = await suggestColorPalette(input.aiSettings, mood, { ...baseTransport, signal: controller.signal });
    if (controller.signal.aborted) { input.settleTextOperation(operationId, result, undefined, true); return; }
    input.settleTextOperation(operationId, result, result.ok ? result.data.textProvenance : undefined);
    if (result.ok) input.setSuggestion(result.data);
    else input.setError(result.error);
  } finally {
    if (input.abortRef?.current === controller) input.abortRef.current = null;
    input.setBusy(false);
  }
}

export async function runStudioAbortableAiColorize<TTicket>(input: {
  readonly elId: string;
  readonly srcAtRequestTime: string;
  readonly prompt: string;
  readonly collaborationLocked: boolean;
  readonly activePageId: string;
  readonly aiSettings: StudioAiSettings;
  readonly abortRef: MutableRefObject<AbortController | null>;
  readonly editorMountedRef: MutableRefObject<boolean>;
  readonly captureMutationTicket: () => TTicket;
  readonly canApplyMutation: (ticket: TTicket) => boolean;
  readonly beginTrackedOperation: (feature: "colorize", op: TrackedOpPayload) => string;
  readonly settleOperation: (operationId: string, result: StudioAiObservableResult) => void;
  readonly setBusy: (busy: boolean) => void;
  readonly setError: (error: string | null) => void;
  readonly findTargetImage: (pageId: string, elId: string) => El | undefined;
  readonly patchImageOnPage: (pageId: string, elId: string, patch: { src: string; aiProvenance?: StudioPublishAiProvenance }) => boolean;
  readonly notFoundMessage: string;
  readonly applyFailedMessage: string;
}): Promise<void> {
  if (input.collaborationLocked) return;
  const mutationTicket = input.captureMutationTicket();
  input.abortRef.current?.abort();
  const controller = new AbortController();
  input.abortRef.current = controller;
  input.setBusy(true);
  input.setError(null);
  const provider = studioImageAiProviderContext(input.aiSettings);
  const provenance = captureStudioAiGeneratedAssetProvenance(provider, "edited");
  const operationId = input.beginTrackedOperation("colorize", {
    kind: "image", task: "colorize", provider: provider.provider, model: provider.model,
    transport: provider.transport, promptVersion: 1, prompt: input.prompt,
    target: { pageId: input.activePageId, elementId: input.elId }, references: [{ assetId: input.elId }],
  });
  const result = await colorizeLineArt(input.aiSettings, input.srcAtRequestTime, input.prompt, { signal: controller.signal });
  if (input.abortRef.current === controller) input.abortRef.current = null;
  if (controller.signal.aborted || !input.canApplyMutation(mutationTicket)) {
    if (input.editorMountedRef.current) input.setBusy(false);
    return;
  }
  input.settleOperation(operationId, result);
  if (!result.ok) { input.setError(result.error); input.setBusy(false); return; }
  const target = input.findTargetImage(input.activePageId, input.elId);
  if (!target || target.type !== "image") { input.setError(input.notFoundMessage); input.setBusy(false); return; }
  if (!input.patchImageOnPage(input.activePageId, input.elId, { src: result.data.dataUrl, aiProvenance: provenance })) {
    input.setError(input.applyFailedMessage); input.setBusy(false); return;
  }
  input.setBusy(false);
}

export async function runStudioAbortableAiCharacter<TTicket>(input: {
  readonly reference: { readonly elementId: string; readonly src: string; readonly width: number; readonly height: number };
  readonly prompt: string;
  readonly collaborationLocked: boolean;
  readonly activePageId: string;
  readonly aiSettings: StudioAiSettings;
  readonly abortRef: MutableRefObject<AbortController | null>;
  readonly editorMountedRef: MutableRefObject<boolean>;
  readonly captureMutationTicket: () => TTicket;
  readonly canApplyMutation: (ticket: TTicket) => boolean;
  readonly beginTrackedOperation: (feature: "character-image", op: TrackedOpPayload) => string;
  readonly settleOperation: (operationId: string, result: StudioAiObservableResult) => void;
  readonly setBusy: (busy: boolean) => void;
  readonly setError: (error: string | null) => void;
  readonly insertCharacter: (
    pageId: string, dataUrl: string, width: number, height: number, provenance: StudioPublishAiProvenance,
  ) => boolean;
  readonly applyFailedMessage: string;
  readonly onApplied: () => void;
}): Promise<void> {
  if (input.collaborationLocked) return;
  const mutationTicket = input.captureMutationTicket();
  input.abortRef.current?.abort();
  const controller = new AbortController();
  input.abortRef.current = controller;
  input.setBusy(true);
  input.setError(null);
  const provider = studioImageAiProviderContext(input.aiSettings);
  const provenance = captureStudioAiGeneratedAssetProvenance(provider, "generated");
  const operationId = input.beginTrackedOperation("character-image", {
    kind: "image", task: "character-image", provider: provider.provider, model: provider.model,
    transport: provider.transport, promptVersion: 1, prompt: input.prompt,
    target: { pageId: input.activePageId }, references: [{ assetId: input.reference.elementId }],
  });
  const result = await generateConsistentCharacterImage(input.aiSettings, input.reference.src, input.prompt, { signal: controller.signal });
  if (input.abortRef.current === controller) input.abortRef.current = null;
  if (controller.signal.aborted || !input.canApplyMutation(mutationTicket)) {
    if (input.editorMountedRef.current) input.setBusy(false);
    return;
  }
  input.settleOperation(operationId, result);
  if (!result.ok) { input.setError(result.error); input.setBusy(false); return; }
  const ok = input.insertCharacter(input.activePageId, result.data.dataUrl, input.reference.width, input.reference.height, provenance);
  if (!ok) { input.setError(input.applyFailedMessage); input.setBusy(false); return; }
  input.setBusy(false);
  input.onApplied();
}
