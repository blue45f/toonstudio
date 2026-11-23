import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import {
  areStudioDrawingAssistDocumentsEqual,
  normalizeStudioDrawingAssistDocument,
  type StudioDrawingAssistDocument,
} from "../brush/studio-drawing-assist-document";
import { remapStudioBg3dLtCopiedBundles } from "../contracts/studio-bg3d-lt-copy-remap";
import { CANVAS_W } from "../studio-assets";
import type { StudioClip } from "../studio-clips";
import { studioBg3dSixPassCopyUnavailableReason } from "../studio-cuttoon-editor/runtime/bg3d-six-pass/studio-bg3d-six-pass-copy-guard";
import type { StudioMenu } from "../studio-editor-tool-model";
import { elBounds } from "../studio-element-geometry";
import type { El, FrameEl } from "../studio-element-model";
import { createFrameFolderGroupForNewFrame } from "../studio-frame-folder";
import { uid } from "../studio-id";
import {
  createLayerGroup,
  missingLayerGroupIds,
  type LayerGroup,
} from "../studio-layers";
import type { PageState } from "../studio-page-state";
import { unionBounds } from "../studio-selection";
import { copyStudioSmartShapeSnapshot } from "../studio-smart-shape-copy";

export function runStudioAddFrame({
  elements, groups, canvasH, updateActivePage, setSelectedId, setTool,
}: {
  readonly elements: readonly El[];
  readonly groups: readonly LayerGroup[];
  readonly canvasH: number;
  readonly updateActivePage: (patch: Partial<PageState>) => void;
  readonly setSelectedId: Dispatch<SetStateAction<string | null>>;
  readonly setTool: (tool: "select" | "draw") => void;
}): void {
  const margin = 24;
  const frames = elements.filter((e): e is FrameEl => e.type === "frame");
  const bottomFrame = frames.reduce<FrameEl | null>(
    (best, frame) => (!best || frame.y + frame.height > best.y + best.height ? frame : best),
    null,
  );
  const height = Math.min(480, Math.max(220, Math.round(bottomFrame?.height ?? 360)));
  const y = bottomFrame ? bottomFrame.y + bottomFrame.height + margin : margin;
  const frame: FrameEl = {
    id: uid(),
    type: "frame",
    x: margin,
    y,
    width: CANVAS_W - margin * 2,
    height,
  };
  const folder = createFrameFolderGroupForNewFrame({ frameLabel: "컷", groupId: uid() });
  updateActivePage({
    elements: [...elements, frame],
    groups: folder ? [...groups, folder] : [...groups],
    canvasH: Math.max(canvasH, y + height + margin),
  });
  setSelectedId(frame.id);
  setTool("select");
}

export function runStudioEcosystemSampleImportEffect({
  params, ecosystemSampleImportRef, workId, remixId, workHydrated, autosaveChecked,
  hasAutosave, sourceHydrationPending, pagesLength, elementsLength, commitPages,
  setCurrentPageId, setTitle, setQuickStartOpen, setTutorialInitialId,
  setTutorialHubOpen, setError, loadFailedMessage,
}: {
  readonly params: URLSearchParams;
  readonly ecosystemSampleImportRef: MutableRefObject<string | null>;
  readonly workId: string | null;
  readonly remixId: string | null;
  readonly workHydrated: boolean;
  readonly autosaveChecked: boolean;
  readonly hasAutosave: boolean;
  readonly sourceHydrationPending: boolean;
  readonly pagesLength: number;
  readonly elementsLength: number;
  readonly commitPages: (next: PageState[]) => boolean;
  readonly setCurrentPageId: (next: string) => void;
  readonly setTitle: Dispatch<SetStateAction<string>>;
  readonly setQuickStartOpen: Dispatch<SetStateAction<boolean>>;
  readonly setTutorialInitialId: Dispatch<SetStateAction<string | null>>;
  readonly setTutorialHubOpen: Dispatch<SetStateAction<boolean>>;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly loadFailedMessage?: string;
}): (() => void) | undefined {
  const sampleId = params.get("sample");
  if (!sampleId || ecosystemSampleImportRef.current === sampleId) return undefined;
  if (workId || remixId || !workHydrated || !autosaveChecked || hasAutosave || sourceHydrationPending) return undefined;
  if (pagesLength !== 1 || elementsLength > 0) return undefined;
  let cancelled = false;
  void import("../ecosystem/ecosystem-content")
    .then(({ createOriginalSample }) => {
      if (cancelled || ecosystemSampleImportRef.current === sampleId) return;
      const sample = createOriginalSample(sampleId, CANVAS_W, "final", uid);
      if (!commitPages([sample])) return;
      ecosystemSampleImportRef.current = sampleId;
      setCurrentPageId(sample.id);
      setTitle(sample.name ?? "예제 작품");
      setQuickStartOpen(false);
      const tutorialId = params.get("tutorial");
      if (tutorialId) {
        setTutorialInitialId(tutorialId);
        setTutorialHubOpen(true);
      }
      setError(null);
    })
    .catch((cause) => {
      if (cancelled) return;
      ecosystemSampleImportRef.current = sampleId;
      setError(
        cause instanceof Error
          ? cause.message
          : loadFailedMessage ?? "예제 작품을 불러오지 못했습니다.",
      );
    });
  return () => {
    cancelled = true;
  };
}

export function runStudioInsertClip({
  clip, setError, spawnCenter, shiftEl, masterEditMode, groups, elements,
  commit, setMenu, setTool,
}: {
  readonly clip: StudioClip;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly spawnCenter: (options: { width: number; height: number; margin?: number }) => [number, number];
  readonly shiftEl: (el: El, dx: number, dy: number) => El;
  readonly masterEditMode: boolean;
  readonly groups: readonly LayerGroup[];
  readonly elements: readonly El[];
  readonly commit: (next: El[], extra?: Partial<PageState>) => boolean;
  readonly setMenu: (update: SetStateAction<StudioMenu | null>) => void;
  readonly setTool: (tool: "select" | "draw") => void;
}): void {
  const clipElements = clip.els as El[];
  if (clipElements.length === 0) return;
  const unavailable = studioBg3dSixPassCopyUnavailableReason(clipElements);
  if (unavailable) {
    setError(unavailable);
    return;
  }
  const clipBounds = unionBounds(clipElements.map((element) => elBounds(element)));
  const [cx, cy] = spawnCenter({
    width: clipBounds.w,
    height: clipBounds.h,
    margin: 8,
  });
  const dx = cx - (clipBounds.x + clipBounds.w / 2);
  const dy = cy - (clipBounds.y + clipBounds.h / 2);
  const groupMap = new Map<string, string>();
  const newEls = clipElements.map((e) => {
    let groupId = e.groupId;
    if (groupId) {
      if (!groupMap.has(groupId)) groupMap.set(groupId, uid());
      groupId = groupMap.get(groupId);
    }
    const shifted = shiftEl(e, dx, dy);
    return copyStudioSmartShapeSnapshot(shifted, { ...shifted, id: uid(), groupId, hidden: false, locked: false });
  });
  const insertedElements = remapStudioBg3dLtCopiedBundles(newEls, masterEditMode);
  const clipGroups = masterEditMode
    ? []
    : missingLayerGroupIds(insertedElements, groups).map((groupId, index) =>
        createLayerGroup(
          groupId,
          groupMap.size > 1 ? `${clip.name} ${index + 1}` : clip.name,
        ),
      );
  commit(
    [...elements, ...insertedElements],
    clipGroups.length > 0 ? { groups: [...groups, ...clipGroups] } : undefined,
  );
  setMenu(null);
  setTool("select");
}

export function runStudioCommitDrawingAssistDocument({
  update, masterEditMode, currentStudioDrawingAssistDocument, setDrawingAssistPreview, commitPages,
}: {
  readonly update: (current: StudioDrawingAssistDocument) => StudioDrawingAssistDocument;
  readonly masterEditMode: boolean;
  readonly currentStudioDrawingAssistDocument: () => {
    pages: PageState[];
    page: PageState;
    document: StudioDrawingAssistDocument;
    persistedDocument: StudioDrawingAssistDocument;
  } | null;
  readonly setDrawingAssistPreview: (next: null) => void;
  readonly commitPages: (next: PageState[]) => boolean;
}): boolean {
  if (masterEditMode) return false;
  const current = currentStudioDrawingAssistDocument();
  if (!current) return false;
  const next = normalizeStudioDrawingAssistDocument(update(current.document), {
    canvasWidth: CANVAS_W,
    canvasHeight: current.page.canvasH,
  });
  if (areStudioDrawingAssistDocumentsEqual(current.persistedDocument, next)) {
    setDrawingAssistPreview(null);
    return true;
  }
  const committed = commitPages(
    current.pages.map((page) => (page.id === current.page.id ? { ...page, drawingAssist: next } : page)),
  );
  setDrawingAssistPreview(null);
  return committed;
}
