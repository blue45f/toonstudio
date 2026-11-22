import { CANVAS_W } from "../studio-assets";
import type { StudioEditorMutationTicket } from "../studio-editor-scope";
import type { El } from "../studio-element-model";
import { finitePositiveGroupResizeBounds } from "../studio-group-resize-bounds";
import type { StudioGroupUniformResizeBounds } from "../studio-group-uniform-resize";
import {
  isEffectivelyHidden,
  isEffectivelyLocked,
  type LayerGroup,
} from "../studio-layers";
import {
  planStudioViewScrollToDocumentPoint,
  projectStudioViewPointToDocument,
  resolveStudioVisibleDocumentPlacement,
  type StudioViewRotation,
} from "../studio-view-controls";

export interface StudioGroupResizeSession {
  phase: "active" | "cancel-requested" | "settling";
  selectedIds: string[];
  sourceBounds: StudioGroupUniformResizeBounds;
  sourceElements: El[];
  /** O(1) persisted-project generation fence; sample payloads are never serialized at begin. */
  sourceDocumentGeneration: number;
  pageId: string;
  masterEditMode: boolean;
  mutationTicket: StudioEditorMutationTicket;
}

export function computeStudioMinimapClickScrollTarget(input: {
  readonly clientX: number;
  readonly clientY: number;
  readonly rect: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
  readonly canvasHeight: number;
  readonly canvasFlipH: boolean;
  readonly canvasRotation: StudioViewRotation;
  readonly scale: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}): { readonly scrollLeft: number; readonly scrollTop: number } {
  const mx = input.clientX - input.rect.left;
  const my = input.clientY - input.rect.top;
  return planStudioViewScrollToDocumentPoint({
    documentWidth: CANVAS_W,
    documentHeight: input.canvasHeight,
    canvasFlipH: input.canvasFlipH,
    canvasRotation: input.canvasRotation,
    scale: input.scale,
    viewportWidth: input.viewportWidth,
    viewportHeight: input.viewportHeight,
    x: (mx / input.rect.width) * CANVAS_W,
    y: (my / input.rect.height) * input.canvasHeight,
  });
}

export function resolveStudioMinimapArrowScrollDelta(
  key: string,
  viewportWidth: number,
  viewportHeight: number,
): { readonly dx: number; readonly dy: number } | null {
  const stepX = viewportWidth / 4;
  const stepY = viewportHeight / 4;
  if (key === "ArrowLeft") return { dx: -stepX, dy: 0 };
  if (key === "ArrowRight") return { dx: stepX, dy: 0 };
  if (key === "ArrowUp") return { dx: 0, dy: -stepY };
  if (key === "ArrowDown") return { dx: 0, dy: stepY };
  return null;
}

export function projectStudioHostClientPointToDocument(input: {
  readonly clientX: number;
  readonly clientY: number;
  readonly hostRect: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
  };
  readonly canvasHeight: number;
  readonly canvasFlipH: boolean;
  readonly canvasRotation: StudioViewRotation;
}): { readonly x: number; readonly y: number } | null {
  if (!(input.hostRect.width > 0) || !(input.hostRect.height > 0)) return null;
  const quarterTurn = input.canvasRotation === 90 || input.canvasRotation === 270;
  const viewWidth = quarterTurn ? input.canvasHeight : CANVAS_W;
  const viewHeight = quarterTurn ? CANVAS_W : input.canvasHeight;
  return projectStudioViewPointToDocument({
    documentWidth: CANVAS_W,
    documentHeight: input.canvasHeight,
    canvasFlipH: input.canvasFlipH,
    canvasRotation: input.canvasRotation,
    x: ((input.clientX - input.hostRect.left) / input.hostRect.width) * viewWidth,
    y: ((input.clientY - input.hostRect.top) / input.hostRect.height) * viewHeight,
  });
}

export function resolveStudioHostVisibleCanvasPlacement(input: {
  readonly canvasHeight: number;
  readonly canvasFlipH: boolean;
  readonly canvasRotation: StudioViewRotation;
  readonly hostRect: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  };
  readonly viewportRect: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  };
}) {
  return resolveStudioVisibleDocumentPlacement({
    documentWidth: CANVAS_W,
    documentHeight: input.canvasHeight,
    canvasFlipH: input.canvasFlipH,
    canvasRotation: input.canvasRotation,
    hostRect: {
      left: input.hostRect.left,
      top: input.hostRect.top,
      right: input.hostRect.right,
      bottom: input.hostRect.bottom,
    },
    viewportRect: {
      left: input.viewportRect.left,
      top: input.viewportRect.top,
      right: input.viewportRect.right,
      bottom: input.viewportRect.bottom,
    },
  });
}

export function validateStudioSelectionResizeBegin(input: {
  readonly selectedIds: readonly string[];
  readonly currentElements: readonly El[];
  readonly activeGroups: LayerGroup[];
  readonly sourceBounds: StudioGroupUniformResizeBounds;
  readonly activeSurfaceReviewLocked: boolean;
}): { readonly ok: true; readonly sourceElements: El[] } | { readonly ok: false } {
  const uniqueIds = new Set(input.selectedIds);
  const currentById = new Map(input.currentElements.map((element) => [element.id, element]));
  const singleDrawResize =
    input.selectedIds.length === 1
    && currentById.get(input.selectedIds[0]!)?.type === "draw";
  if (
    (input.selectedIds.length < 2 && !singleDrawResize) ||
    uniqueIds.size !== input.selectedIds.length ||
    !finitePositiveGroupResizeBounds(input.sourceBounds) ||
    input.activeSurfaceReviewLocked ||
    input.selectedIds.some((id) => !currentById.has(id)) ||
    input.selectedIds.some((id) => {
      const element = currentById.get(id);
      return Boolean(element && isEffectivelyLocked(element, input.activeGroups));
    }) ||
    input.selectedIds.some((id) => {
      const element = currentById.get(id);
      return Boolean(element && isEffectivelyHidden(element, input.activeGroups));
    })
  ) {
    return { ok: false };
  }
  return {
    ok: true,
    sourceElements: input.selectedIds.map((id) => currentById.get(id)!),
  };
}

export function validateStudioSelectionResizeCommit(input: {
  readonly session: StudioGroupResizeSession;
  readonly currentIds: readonly string[];
  readonly currentElements: readonly El[];
  readonly targetBounds: StudioGroupUniformResizeBounds;
  readonly rotationDeg: number;
  readonly documentGeneration: number;
  readonly currentPageId: string;
  readonly masterEditMode: boolean;
  readonly activeSurfaceReviewLocked: boolean;
  readonly canApplyMutation: boolean;
}): boolean {
  const currentIdSet = new Set(input.currentIds);
  const currentById = new Map(input.currentElements.map((element) => [element.id, element]));
  const selectionStillMatches =
    input.currentIds.length === input.session.selectedIds.length &&
    currentIdSet.size === input.currentIds.length &&
    input.session.selectedIds.every((id) => currentIdSet.has(id));
  const sourceStillMatches = input.session.sourceElements.every(
    (element) => currentById.get(element.id) === element,
  );
  return !(
    !finitePositiveGroupResizeBounds(input.targetBounds) ||
    !Number.isFinite(input.rotationDeg) ||
    !selectionStillMatches ||
    !sourceStillMatches ||
    input.documentGeneration !== input.session.sourceDocumentGeneration ||
    input.currentPageId !== input.session.pageId ||
    input.masterEditMode !== input.session.masterEditMode ||
    input.activeSurfaceReviewLocked ||
    !input.canApplyMutation
  );
}
