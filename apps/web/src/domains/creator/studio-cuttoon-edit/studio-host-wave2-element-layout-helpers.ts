import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type Konva from "konva";

import { isStudioLegacyPigmentArchivedElement } from "@toonstudio/contracts/studio-legacy-pigment-archive";

import {
  bubbleMergeUnavailableReason,
  mergeStudioBubbles,
} from "../lettering/studio-bubble-merge";
import {
  bubbleLetterSpacing,
  resolveBubbleFontFamily,
  resolveBubbleFontSize,
  resolveBubbleFontStyle,
  resolveBubbleLineHeight,
} from "../lettering/studio-bubble-text-fit";
import type {
  StudioDialogueImportApplyResult,
  StudioDialogueImportMatchMode,
  StudioDialogueInterchangeDocument,
} from "../lettering/studio-dialogue-interchange";
import { readStudioAuthoritativeStageFrame } from "../render/studio-raster-handoff-authority";
import { setKeyframe, type AnimationTimelineDoc } from "../studio-anim-tracks";
import { CANVAS_W } from "../studio-assets";
import { svgToDataUrl } from "../studio-characters";
import type {
  StudioElementLike,
  StudioPageInsertState,
  StudioPageSelectedFrame,
} from "../studio-comipo-shipped";
import type { BubbleEl, El, FrameEl, ImageEl } from "../studio-element-model";
import { elBounds } from "../studio-element-geometry";
import { planStudioEmeresUnderlayElement } from "../studio-emeres-underlay-placement";
import { estimateBubbleHeight } from "../studio-fit";
import {
  applySharedGutterDragPlan,
  applyVerticalGapDragPlan,
  planSharedGutterDrag,
  planVerticalGapDrag,
  sharedGutterSegmentKey,
  verticalGapDragKey,
  type SharedGutterSegment,
} from "../studio-frame-folder";
import {
  createCanvasImageElement,
  type CanvasImagePlacement,
} from "../studio-image-placement";
import { isEffectivelyLocked, type LayerGroup } from "../studio-layers";
import type { PageState } from "../studio-page-state";
import { planStudioAnimFrameCaptureElements } from "./studio-host-canvas-element-helpers";

export type StudioWebtoonTheme = "classic" | "soft" | "vivid";

export interface StudioGutterDragSession {
  readonly elements: El[];
  readonly segment: SharedGutterSegment;
}

export async function runStudioCaptureAnimFrame<TTicket>(input: {
  readonly elId: string;
  readonly element: El | undefined;
  readonly elements: El[];
  readonly stage: Konva.Stage | null;
  readonly effScale: number;
  readonly capturedElementIdsRef: MutableRefObject<Set<string>>;
  readonly captureMutationTicket: () => TTicket;
  readonly canApplyMutation: (ticket: TTicket) => boolean;
  readonly setError: (message: string) => void;
  readonly clearSelection: () => void;
  readonly readStageInDocumentView: <T>(stage: Konva.Stage, reader: () => T, scale: number) => T;
  readonly revokeRasterHandoff: () => void;
  readonly allocateId: () => string;
  readonly markDocumentChanged: () => boolean;
  readonly commit: (next: El[]) => boolean;
}): Promise<void> {
  const mutationTicket = input.captureMutationTicket();
  const el = input.element;
  if (!el || el.type !== "image") return;
  if (el.rotation) {
    input.setError("회전이 0°인 셀만 프레임을 캡처할 수 있어요.");
    return;
  }
  const stage = input.stage;
  if (!stage) return;
  input.clearSelection();
  await new Promise((resolve) => setTimeout(resolve, 60));
  if (!input.canApplyMutation(mutationTicket)) return;
  const src = input.readStageInDocumentView(stage, () => readStudioAuthoritativeStageFrame({
    revokeRasterHandoff: input.revokeRasterHandoff,
    drawStage: () => stage.draw(),
    read: () => stage.toDataURL({
      x: el.x * input.effScale,
      y: el.y * input.effScale,
      width: el.width * input.effScale,
      height: el.height * input.effScale,
      pixelRatio: 2 / input.effScale,
    }),
  }), 2);
  const next = planStudioAnimFrameCaptureElements({
    elements: input.elements,
    target: el,
    capturedElementIds: input.capturedElementIdsRef.current,
    newFrameId: input.allocateId(),
    src,
  });
  if (!input.markDocumentChanged()) return;
  input.commit(next);
  input.capturedElementIdsRef.current = new Set(next.map((item) => item.id));
}

export async function runStudioCaptureTimelineKeyframe<TTicket>(input: {
  readonly trackId: string;
  readonly frameIndex: number;
  readonly element: El | undefined;
  readonly stage: Konva.Stage | null;
  readonly effScale: number;
  readonly animTimeline: AnimationTimelineDoc;
  readonly captureMutationTicket: () => TTicket;
  readonly canApplyMutation: (ticket: TTicket) => boolean;
  readonly setError: (message: string) => void;
  readonly clearSelection: () => void;
  readonly readStageInDocumentView: <T>(stage: Konva.Stage, reader: () => T, scale: number) => T;
  readonly revokeRasterHandoff: () => void;
  readonly allocateId: () => string;
  readonly markDocumentChanged: () => boolean;
  readonly updateActivePage: (patch: { animTimeline: AnimationTimelineDoc }) => void;
}): Promise<void> {
  const mutationTicket = input.captureMutationTicket();
  const el = input.element;
  if (!el || el.type !== "image") return;
  if (el.rotation) {
    input.setError("회전이 0°인 레이어만 키프레임을 캡처할 수 있어요.");
    return;
  }
  const stage = input.stage;
  if (!stage) return;
  input.clearSelection();
  await new Promise((resolve) => setTimeout(resolve, 60));
  if (!input.canApplyMutation(mutationTicket)) return;
  const b = elBounds(el);
  const src = input.readStageInDocumentView(stage, () => readStudioAuthoritativeStageFrame({
    revokeRasterHandoff: input.revokeRasterHandoff,
    drawStage: () => stage.draw(),
    read: () => stage.toDataURL({
      x: b.x * input.effScale,
      y: b.y * input.effScale,
      width: b.w * input.effScale,
      height: b.h * input.effScale,
      pixelRatio: 2 / input.effScale,
    }),
  }), 2);
  if (!input.markDocumentChanged()) return;
  input.updateActivePage({
    animTimeline: setKeyframe(input.animTimeline, input.trackId, input.frameIndex, {
      id: input.allocateId(),
      src,
    }),
  });
}

export function planStudioLayerItemsPatch(
  elements: readonly El[],
  ids: readonly string[],
  resolvePatch: (element: El) => Partial<El>,
): El[] | null {
  const idSet = new Set(ids);
  if (idSet.size === 0) return null;
  let changed = false;
  const next = elements.map((element) => {
    if (!idSet.has(element.id) || isStudioLegacyPigmentArchivedElement(element)) return element;
    const patch = resolvePatch(element);
    if (Object.keys(patch).every((key) => Object.is(element[key as keyof El], patch[key as keyof El]))) {
      return element;
    }
    changed = true;
    return { ...element, ...patch } as El;
  });
  return changed ? next : null;
}

export async function runStudioMergeSelectedBubbles<TTicket>(input: {
  readonly activeSurfaceReviewLocked: boolean;
  readonly marqueeIds: readonly string[];
  readonly elements: readonly El[];
  readonly webtoonTheme: StudioWebtoonTheme;
  readonly captureMutationTicket: () => TTicket;
  readonly canApplyMutation: (ticket: TTicket) => boolean;
  readonly commit: (next: El[]) => boolean;
  readonly setMarqueeIds: (ids: string[]) => void;
  readonly setSelectedId: (id: string | null) => void;
  readonly setError: (message: string | null) => void;
}): Promise<void> {
  if (input.activeSurfaceReviewLocked) {
    input.setError("이 페이지는 검토 잠금 상태예요. 잠금을 해제한 뒤 말풍선을 병합해 주세요.");
    return;
  }
  const idSet = new Set(input.marqueeIds);
  const bubbles = input.elements.filter(
    (el): el is BubbleEl => idSet.has(el.id) && el.type === "bubble",
  );
  const gate = bubbleMergeUnavailableReason(bubbles);
  if (gate) {
    input.setError(gate);
    return;
  }
  const mutationTicket = input.captureMutationTicket();
  const result = await mergeStudioBubbles(bubbles, input.webtoonTheme);
  if (!input.canApplyMutation(mutationTicket)) return;
  if (!result.ok) {
    input.setError(result.reason);
    return;
  }
  const removedSet = new Set(result.removedIds);
  const nextElements = input.elements
    .filter((el) => !removedSet.has(el.id))
    .map((el) => (el.id === result.survivorId ? ({ ...el, ...result.patch } as El) : el));
  if (!input.commit(nextElements)) return;
  input.setMarqueeIds([]);
  input.setSelectedId(result.survivorId);
  input.setError(null);
}

export function runStudioPreviewSharedGutterDrag(
  session: StudioGutterDragSession | null,
  delta: number,
  commitCoalesced: (next: El[], key: string) => void,
): void {
  if (!session) return;
  const baseFrames = session.elements.filter(
    (el): el is FrameEl => el.type === "frame" && !el.hidden,
  );
  const framesById = new Map(baseFrames.map((frame) => [frame.id, frame]));
  const plan = planSharedGutterDrag({
    segment: session.segment,
    framesById,
    delta,
    elements: session.elements,
  });
  if (!plan) return;
  const next = applySharedGutterDragPlan(session.elements, plan) as El[];
  commitCoalesced(next, `shared-gutter:${sharedGutterSegmentKey(session.segment)}`);
}

export function runStudioPreviewVerticalGapDrag(
  session: StudioGutterDragSession | null,
  delta: number,
  commitCoalesced: (next: El[], key: string) => void,
): void {
  if (!session) return;
  const baseFrames = session.elements.filter(
    (el): el is FrameEl => el.type === "frame" && !el.hidden,
  );
  const plan = planVerticalGapDrag({
    segment: session.segment,
    frames: baseFrames,
    delta,
    elements: session.elements,
  });
  if (!plan) return;
  const next = applyVerticalGapDragPlan(session.elements, plan) as El[];
  commitCoalesced(next, verticalGapDragKey(session.segment));
}

export function runStudioCommitVerticalGapDrag(input: {
  readonly sessionRef: MutableRefObject<StudioGutterDragSession | null>;
  readonly delta: number;
  readonly preview: () => void;
  readonly setCanvasH: Dispatch<SetStateAction<number>>;
  readonly announceDrawingShortcut: (message: string) => void;
}): void {
  input.preview();
  const session = input.sessionRef.current;
  input.sessionRef.current = null;
  if (!session || input.delta === 0) return;
  const baseFrames = session.elements.filter(
    (el): el is FrameEl => el.type === "frame" && !el.hidden,
  );
  const plan = planVerticalGapDrag({
    segment: session.segment,
    frames: baseFrames,
    delta: input.delta,
    elements: session.elements,
  });
  if (plan && plan.appliedDelta > 0) {
    const movedBottom = plan.framePatches.reduce(
      (max, patch) => Math.max(max, patch.y + patch.height),
      0,
    );
    if (movedBottom > 0) input.setCanvasH((h) => Math.max(h, movedBottom + 24));
  }
  input.announceDrawingShortcut("세로 공백 조정 · 아래 컷 이동");
}

export function buildStudioInsertState(input: {
  readonly elements: El[];
  readonly canvasH: number;
  readonly selected: El | null;
  readonly viewCenter: { x: number; y: number };
}): StudioPageInsertState {
  const selectedFrame: StudioPageSelectedFrame | null =
    input.selected?.type === "frame"
      ? {
          type: "frame",
          x: input.selected.x,
          y: input.selected.y,
          width: input.selected.width,
          height: input.selected.height,
        }
      : null;
  return {
    elements: input.elements as StudioElementLike[],
    canvasH: input.canvasH,
    canvasW: CANVAS_W,
    selected: selectedFrame,
    viewCenter: input.viewCenter,
  };
}

export function computeStudioBubbleFitHeight(input: {
  readonly selected: El | null;
  readonly groups: LayerGroup[];
  readonly webtoonTheme: StudioWebtoonTheme;
}): { readonly id: string; readonly height: number } | null {
  if (!input.selected || input.selected.type !== "bubble" || isEffectivelyLocked(input.selected, input.groups)) {
    return null;
  }
  const height = estimateBubbleHeight(
    input.selected.text,
    input.selected.width,
    resolveBubbleFontSize(input.selected.fontSize),
    resolveBubbleLineHeight({
      lineHeight: input.selected.lineHeight,
      vertical: input.selected.vertical,
      theme: input.webtoonTheme,
    }),
    {
      fontFamily: resolveBubbleFontFamily(input.selected.font),
      fontStyle: resolveBubbleFontStyle(input.selected.fontStyle),
      letterSpacing: bubbleLetterSpacing(input.webtoonTheme),
      vertical: input.selected.vertical,
    },
  );
  return { id: input.selected.id, height };
}

export function buildStudioFxOverlayImageElement(input: {
  readonly id: string;
  readonly svgMarkup: string;
  readonly width: number;
  readonly height: number;
  readonly canvasH: number;
  readonly placement: CanvasImagePlacement;
}): ImageEl {
  return createCanvasImageElement({
    id: input.id,
    src: svgToDataUrl(input.svgMarkup),
    canvasWidth: CANVAS_W,
    canvasHeight: input.canvasH,
    sourceWidth: input.width,
    sourceHeight: input.height,
    horizontalInset: 100,
    placement: input.placement,
  });
}

export async function runStudioAddToneElement<TTicket>(input: {
  readonly svg: string;
  readonly selected: El | null;
  readonly canvasH: number;
  readonly closeMenu: () => void;
  readonly captureMutationTicket: () => TTicket;
  readonly canApplyMutation: (ticket: TTicket) => boolean;
  readonly allocateId: () => string;
  readonly nextPlacement: () => CanvasImagePlacement;
  readonly addEl: (el: El) => boolean;
}): Promise<void> {
  input.closeMenu();
  const mutationTicket = input.captureMutationTicket();
  const { TONE_DEFAULT_SIZE, toneDataUrl } = await import("../studio-tones");
  if (!input.canApplyMutation(mutationTicket)) return;
  const src = toneDataUrl(input.svg);
  if (input.selected?.type === "frame") {
    input.addEl({
      id: input.allocateId(),
      type: "image",
      src,
      x: input.selected.x,
      y: input.selected.y,
      width: input.selected.width,
      height: input.selected.height,
      rotation: 0,
      opacity: 0.9,
    });
    return;
  }
  input.addEl({
    ...createCanvasImageElement({
      id: input.allocateId(),
      src,
      canvasWidth: CANVAS_W,
      canvasHeight: input.canvasH,
      sourceWidth: TONE_DEFAULT_SIZE.width,
      sourceHeight: TONE_DEFAULT_SIZE.height,
      placement: input.nextPlacement(),
    }),
    opacity: 0.9,
  });
}

export function runStudioInsertEmeresUnderlay(input: {
  readonly src: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly emeresSourceId: string;
  readonly opacity: number;
  readonly selected: El | null;
  readonly elements: El[];
  readonly canvasH: number;
  readonly closeMenu: () => void;
  readonly allocateId: () => string;
  readonly nextPlacement: () => CanvasImagePlacement;
  readonly commit: (next: El[]) => boolean;
  readonly clearSelection: () => void;
  readonly activatePenTool: () => void;
}): void {
  input.closeMenu();
  const frame = input.selected?.type === "frame" ? input.selected : null;
  const el = planStudioEmeresUnderlayElement({
    id: input.allocateId(),
    src: input.src,
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    opacity: input.opacity,
    emeresSourceId: input.emeresSourceId,
    frame,
    canvasWidth: CANVAS_W,
    canvasHeight: input.canvasH,
    placement: frame ? undefined : input.nextPlacement(),
  });
  input.commit([...input.elements, el]);
  input.clearSelection();
  input.activatePenTool();
}

export async function runStudioImportDialogueInterchange<TTicket>(input: {
  readonly document: StudioDialogueInterchangeDocument;
  readonly mode: StudioDialogueImportMatchMode;
  readonly pages: PageState[];
  readonly locked: boolean;
  readonly captureMutationTicket: () => TTicket;
  readonly canApplyMutation: (ticket: TTicket) => boolean;
  readonly commitPages: (pages: PageState[]) => void;
}): Promise<StudioDialogueImportApplyResult> {
  const sourcePages = input.pages;
  if (input.locked) {
    return {
      pages: sourcePages,
      matched: 0,
      changed: 0,
      locked: input.document.cues.length,
      missing: 0,
      droppedMetadata: 0,
    };
  }
  const mutationTicket = input.captureMutationTicket();
  const { applyStudioDialogueInterchangeToPages } = await import("../lettering/studio-dialogue-interchange");
  if (!input.canApplyMutation(mutationTicket)) {
    return {
      pages: sourcePages,
      matched: 0,
      changed: 0,
      locked: 0,
      missing: input.document.cues.length,
      droppedMetadata: 0,
    };
  }
  const result = applyStudioDialogueInterchangeToPages(sourcePages, input.document, input.mode);
  if (result.pages !== sourcePages) input.commitPages(result.pages as PageState[]);
  return result;
}
