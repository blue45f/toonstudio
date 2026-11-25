import type { MutableRefObject } from "react";

import type { StudioAiAssistToolId } from "../ai/studio-ai-assist-ux";
import { resolveColorizeCandidateApply } from "../ai/studio-ai-candidate-apply";
import {
  generateStudioWriterRoomDraft,
  studioTextAiTransportForOperation,
  type StudioAiSettings,
  type StudioTextAiProvenance,
  type StudioTextAiTransport,
} from "../ai/studio-ai-client-lazy";
import type { StudioAiColorizeCandidateSession } from "../ai/studio-ai-colorize-candidates";
import type { StudioAiComicComposerHandoff } from "../ai/studio-ai-comic-composer-handoff";
import type { StudioAiGeneratedAssetProvenance } from "../ai/studio-ai-generated-asset-model";
import type {
  SettleStudioAiOperationOptions,
  StudioAiObservableResult,
  StudioAiOperationProviderContext,
  StudioAiPendingOperationInput,
} from "../ai/studio-ai-provenance-recorder";
import {
  addReferenceAttachment,
  type StudioAiReferenceAttachment,
} from "../ai/studio-ai-reference-attachments";
import type { DialogueSuggestionCandidate } from "../lettering/studio-dialogue-suggest";
import { CANVAS_W } from "../studio-assets";
import {
  buildStudioCharacterBiblePromptContext,
  type StudioCharacterBible,
} from "../studio-character-bible";
import type { El, FrameEl, ImageEl } from "../studio-element-model";
import { isEffectivelyLocked } from "../studio-layers";
import { uid } from "../studio-id";
import type { PageState } from "../studio-page-state";
import type { StudioPublishAiProvenance } from "../studio-publish-preflight";
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

export function patchStudioImageElOnPage(input: {
  readonly pageId: string;
  readonly currentPageId: string;
  readonly elId: string;
  readonly patch: { src: string; aiProvenance?: StudioPublishAiProvenance };
  readonly pages: PageState[];
  readonly patchEl: (id: string, patch: { src: string; aiProvenance?: StudioPublishAiProvenance }) => boolean;
  readonly commitPages: (pages: PageState[]) => boolean;
  readonly workAssetReplacementReason: (target: ImageEl, patch: Record<string, unknown>) => string | null;
  readonly linked3dPassReplacementReason: (target: ImageEl, patch: Record<string, unknown>) => string | null;
  readonly setError: (message: string) => void;
}): boolean {
  if (input.pageId === input.currentPageId) return input.patchEl(input.elId, input.patch);
  const targetPage = input.pages.find((page) => page.id === input.pageId);
  const target = targetPage?.elements.find((el) => el.id === input.elId);
  if (!targetPage || !target || target.type !== "image") return false;
  if (isEffectivelyLocked(target, targetPage.groups ?? [])) return false;
  const workReason = input.workAssetReplacementReason(target, input.patch as Record<string, unknown>);
  if (workReason) { input.setError(workReason); return false; }
  const passReason = input.linked3dPassReplacementReason(target, input.patch as Record<string, unknown>);
  if (passReason) { input.setError(passReason); return false; }
  return input.commitPages(
    input.pages.map((page) =>
      page.id === input.pageId
        ? { ...page, elements: page.elements.map((el) => (el.id === input.elId ? ({ ...el, ...input.patch } as El) : el)) }
        : page,
    ),
  );
}

export function insertStudioCrossPageCompositionNote(input: {
  readonly pages: PageState[];
  readonly targetPageId: string;
  readonly text: string;
  readonly color: string;
  readonly commitPages: (pages: PageState[]) => boolean;
}): void {
  const targetPage = input.pages.find((page) => page.id === input.targetPageId);
  if (!targetPage) return;
  const noteEl: El = {
    id: uid(), type: "text", text: input.text,
    x: Math.round(CANVAS_W / 2) - 130, y: Math.round(targetPage.canvasH / 2) - 70,
    width: 260, fontSize: 16, fill: input.color, rotation: 0,
  };
  input.commitPages(
    input.pages.map((page) =>
      page.id === input.targetPageId ? { ...page, elements: [...page.elements, noteEl] } : page,
    ),
  );
}

export function resolveStudioDialogueLockedTarget(
  pages: readonly PageState[],
  activePage: PageState,
  selected: El | null | undefined,
): StudioAiDialogueLockedTarget | null {
  if (!selected || (selected.type !== "bubble" && selected.type !== "text")) return null;
  const pageIndex = Math.max(0, pages.findIndex((page) => page.id === activePage.id));
  return {
    pageId: activePage.id,
    elementId: selected.id,
    pageLabel: activePage.name?.trim() || `${pageIndex + 1}컷`,
    originalText: selected.text,
  };
}

export function applyStudioLockedDialogueSuggestion(input: {
  readonly pages: readonly PageState[];
  readonly activePageId: string;
  readonly selected: El | null | undefined;
  readonly lockedTarget: StudioAiDialogueLockedTarget | null;
  readonly candidate: DialogueSuggestionCandidate;
  readonly patchDialogueText: (pageId: string, elementId: string, text: string) => void;
  readonly setError: (message: string) => void;
}): void {
  if (input.lockedTarget) {
    const targetPage = input.pages.find((page) => page.id === input.lockedTarget?.pageId);
    const targetEl = targetPage?.elements.find((el) => el.id === input.lockedTarget?.elementId);
    if (targetEl && (targetEl.type === "bubble" || targetEl.type === "text")) {
      input.patchDialogueText(input.lockedTarget.pageId, input.lockedTarget.elementId, input.candidate.text);
      return;
    }
    input.setError("원래 선택한 말풍선을 찾을 수 없어 현재 컷에 덮어쓰지 않았어요.");
    return;
  }
  if (!input.selected || (input.selected.type !== "bubble" && input.selected.type !== "text")) return;
  input.patchDialogueText(input.activePageId, input.selected.id, input.candidate.text);
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
