import type { ChangeEvent, Dispatch, MutableRefObject, SetStateAction } from "react";
import { flushSync } from "react-dom";
import type Konva from "konva";

import { loadStudioSvgExportWorkerClientModule } from "../export/studio-document-export-loaders";
import type { MotionCutImage } from "../export/studio-motion-export";
import type { SvgExportEl, SvgExportResult } from "../export/studio-svg-export";
import type { StudioVectorPdfExportResult } from "../export/studio-vector-pdf-product";
import { resolveStudioFileImageAppend } from "../layer/studio-file-image-append";
import { readStudioAuthoritativeStageFrame } from "../render/studio-raster-handoff-authority";
import {
  chooseStudioProjectPackageSaveTarget,
  studioProjectPackageFileName,
  writeStudioProjectPackageToTarget,
  type StudioProjectPackageSaveTarget,
} from "../save-first/studio-project-package";
import {
  ensureStudioSaveProfile,
  markStudioStorageBindingSynced,
  recordStudioManualSave,
  studioSaveProfileForProject,
  studioSaveProfileNeedsDestination,
  upsertStudioStorageBinding,
} from "../save-first/studio-save-profile";
import { readStudioSubmissions } from "../save-first/studio-submission-store";
import { CANVAS_W } from "../studio-assets";
import type { StudioEditorMutationTicket } from "../studio-editor-scope";
import type { Tool } from "../studio-editor-tool-model";
import type { DrawEl, El } from "../studio-element-model";
import type { StudioEmeresLibraryItem } from "../studio-emeres-library";
import { uid } from "../studio-id";
import { createCanvasImageElement, type CanvasImagePlacement } from "../studio-image-placement";
import type { StudioInkMlExportResult } from "../studio-inkml-interchange";
import { isEffectivelyHidden, type LayerGroup } from "../studio-layers";
import type { loadStudioCanvasImageFile } from "../studio-legacy-editor-runtime-helpers";
import { EMPTY_LAYER_GROUPS } from "../studio-page-editor-ui-contracts";
import { pageDisplayName } from "../studio-page-meta";
import type { PageState } from "../studio-page-state";
import { readStudioProjectDocuments } from "../studio-project-document-reader";
import type { StudioProjectLibraryEntry } from "../studio-project-library-reader";
import type { StudioProjectSnapshot } from "../studio-project-snapshot";
import { elBounds } from "../studio-element-geometry";

type BilingualFn = (ko: string, en: string) => string;

export interface StudioLocalProjectSaveContext {
  readonly project: StudioProjectLibraryEntry;
  readonly documentId: string;
}

export function runStudioOpenLocalFormalSave({
  context, storage, setError, setFormalSaveProjectTitle,
  setFormalSaveFirstSave, setFormalSaveError, setFormalSaveOpen, bi,
}: {
  readonly context: StudioLocalProjectSaveContext | null;
  readonly storage: Storage | null;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly setFormalSaveProjectTitle: Dispatch<SetStateAction<string>>;
  readonly setFormalSaveFirstSave: Dispatch<SetStateAction<boolean>>;
  readonly setFormalSaveError: Dispatch<SetStateAction<string | null>>;
  readonly setFormalSaveOpen: Dispatch<SetStateAction<boolean>>;
  readonly bi: BilingualFn;
}): boolean {
  if (!context || !storage) {
    setError(bi(
      "이 원고가 속한 프로젝트를 찾지 못했습니다. 내 작업에서 다시 열어 주세요.",
      "The project for this document could not be found. Reopen it from My work.",
    ));
    return false;
  }
  const profile = studioSaveProfileForProject(storage, context.project.id);
  setFormalSaveProjectTitle(context.project.title);
  setFormalSaveFirstSave(studioSaveProfileNeedsDestination(profile));
  setFormalSaveError(null);
  setFormalSaveOpen(true);
  return true;
}

export async function runStudioSaveLocalProjectFile({
  context, storage, targetWindow, studioAuthUserId, formalSaveInFlightRef, formalSaveTargetRef,
  pendingStrokeCommitsRef, flushPendingStrokeCommitsRef, currentStudioProjectSnapshot,
  setFormalSaveBusy, setFormalSaveError, setFormalSaveFirstSave, setFormalSaveOpen,
  announceDrawingShortcut, bi,
}: {
  readonly context: StudioLocalProjectSaveContext | null;
  readonly storage: Storage | null;
  readonly targetWindow: Window | undefined;
  readonly studioAuthUserId: string | null;
  readonly formalSaveInFlightRef: MutableRefObject<boolean>;
  readonly formalSaveTargetRef: MutableRefObject<StudioProjectPackageSaveTarget | null>;
  readonly pendingStrokeCommitsRef: MutableRefObject<unknown>;
  readonly flushPendingStrokeCommitsRef: MutableRefObject<() => boolean>;
  readonly currentStudioProjectSnapshot: () => StudioProjectSnapshot;
  readonly setFormalSaveBusy: Dispatch<SetStateAction<boolean>>;
  readonly setFormalSaveError: Dispatch<SetStateAction<string | null>>;
  readonly setFormalSaveFirstSave: Dispatch<SetStateAction<boolean>>;
  readonly setFormalSaveOpen: Dispatch<SetStateAction<boolean>>;
  readonly announceDrawingShortcut: (message: string) => void;
  readonly bi: BilingualFn;
}): Promise<void> {
  if (formalSaveInFlightRef.current || !targetWindow || !storage) return;
  if (!context) {
    setFormalSaveError(bi(
      "프로젝트 정보를 읽지 못했습니다. 내 작업에서 다시 열어 주세요.",
      "Project information could not be read. Reopen it from My work.",
    ));
    return;
  }
  formalSaveInFlightRef.current = true;
  setFormalSaveBusy(true);
  setFormalSaveError(null);
  try {
    const target = formalSaveTargetRef.current
      ?? await chooseStudioProjectPackageSaveTarget(
        studioProjectPackageFileName(context.project.title),
        targetWindow,
      );
    formalSaveTargetRef.current = target;
    const { buildStudioProjectPackageWithWorkspace } = await import(
      "../save-first/studio-project-package-with-workspace"
    );
    if (pendingStrokeCommitsRef.current) {
      flushSync(() => flushPendingStrokeCommitsRef.current());
    }
    const documents = readStudioProjectDocuments(storage, context.project.id).documents;
    const profile = ensureStudioSaveProfile(storage, context.project.id, {
      provider: "browser", autoSave: true, createVersions: true, target: targetWindow,
    });
    const submissions = readStudioSubmissions(storage).submissions.filter(
      (submission) => submission.projectId === context.project.id,
    );
    const currentSnapshot = currentStudioProjectSnapshot();
    const { packageResult } = await buildStudioProjectPackageWithWorkspace({
      storage,
      project: context.project,
      documents,
      profile,
      submissions,
      authUserId: studioAuthUserId,
      currentSnapshots: { [context.documentId]: currentSnapshot },
    });
    const method = await writeStudioProjectPackageToTarget(packageResult, target);
    upsertStudioStorageBinding(storage, context.project.id, {
      id: "local-file:canonical", provider: "local-file", role: "canonical", syncState: "pending",
    }, { target: targetWindow });
    const saved = recordStudioManualSave(storage, context.project.id, { target: targetWindow });
    markStudioStorageBindingSynced(
      storage,
      context.project.id,
      "local-file:canonical",
      { remotePath: packageResult.fileName, byteLength: packageResult.blob.size, revision: saved.revision },
      { target: targetWindow },
    );
    setFormalSaveFirstSave(false);
    setFormalSaveOpen(false);
    announceDrawingShortcut(
      method === "file-picker"
        ? bi("편집 가능한 프로젝트 원본을 저장했습니다.", "Saved the editable project original.")
        : bi("편집 가능한 프로젝트 원본을 다운로드했습니다.", "Downloaded the editable project original."),
    );
  } catch (cause) {
    if (!(cause instanceof DOMException && cause.name === "AbortError")) {
      formalSaveTargetRef.current = null;
      setFormalSaveError(
        cause instanceof Error && cause.message.trim()
          ? cause.message.trim().slice(0, 500)
          : bi(
              "프로젝트 원본을 저장하지 못했습니다. 임시 자동저장본은 유지됩니다.",
              "The project original could not be saved. The temporary autosave remains available.",
            ),
      );
      setFormalSaveOpen(true);
    }
  } finally {
    formalSaveInFlightRef.current = false;
    setFormalSaveBusy(false);
  }
}

export async function runStudioExportCurrentPageToSvg({
  ensureSharedDocumentAvailableForExport, sharedDocRequiredError,
  elements, canvasH, bg, bgGrad, exportTransparent, groups, webtoonTheme,
}: {
  readonly ensureSharedDocumentAvailableForExport: () => boolean;
  readonly sharedDocRequiredError: string;
  readonly elements: readonly El[];
  readonly canvasH: number;
  readonly bg: string;
  readonly bgGrad: string[] | null;
  readonly exportTransparent: boolean;
  readonly groups: LayerGroup[];
  readonly webtoonTheme: "classic" | "soft" | "vivid";
}): Promise<SvgExportResult> {
  if (!ensureSharedDocumentAvailableForExport()) {
    throw new Error(sharedDocRequiredError);
  }
  const [
    { runStudioSvgExportWorker },
    { projectStudioLinked3dRasterSourcesForPortableExport },
  ] = await Promise.all([
    loadStudioSvgExportWorkerClientModule(),
    import("../studio-linked-3d-portable-raster-projection"),
  ]);
  const portableElements = await projectStudioLinked3dRasterSourcesForPortableExport(elements);
  const { result } = await runStudioSvgExportWorker({
    width: CANVAS_W,
    height: canvasH,
    bg,
    bgGrad,
    transparentBg: exportTransparent,
    elements: portableElements as unknown as readonly SvgExportEl[],
    groups,
    theme: webtoonTheme,
  });
  return result;
}

export async function runStudioExportCurrentPageToVectorPdf({
  ensureSharedDocumentAvailableForExport, sharedDocRequiredError,
  handleCapturePagesForPreset, activePage, title, captureCreateFailedMessage,
}: {
  readonly ensureSharedDocumentAvailableForExport: () => boolean;
  readonly sharedDocRequiredError: string;
  readonly handleCapturePagesForPreset: (scope: "current") => Promise<HTMLCanvasElement[]>;
  readonly activePage: PageState;
  readonly title: string;
  readonly captureCreateFailedMessage: string;
}): Promise<StudioVectorPdfExportResult> {
  if (!ensureSharedDocumentAvailableForExport()) {
    throw new Error(sharedDocRequiredError);
  }
  const captured = await handleCapturePagesForPreset("current");
  const canvas = captured[0];
  if (!canvas) throw new Error(captureCreateFailedMessage);
  const pageGroups = activePage.groups ?? EMPTY_LAYER_GROUPS;
  const drawElements = activePage.elements.filter(
    (element): element is DrawEl =>
      element.type === "draw" && !isEffectivelyHidden(element, pageGroups),
  );
  const { exportStudioCurrentPageVectorPdf } = await import("../export/studio-vector-pdf-product");
  return exportStudioCurrentPageVectorPdf({
    canvas,
    logicalWidth: CANVAS_W,
    logicalHeight: activePage.canvasH,
    title,
    drawElements,
  });
}

export async function runStudioExportCurrentPageToInkMl({
  ensureSharedDocumentAvailableForExport, sharedDocRequiredError, activePage,
}: {
  readonly ensureSharedDocumentAvailableForExport: () => boolean;
  readonly sharedDocRequiredError: string;
  readonly activePage: PageState;
}): Promise<StudioInkMlExportResult> {
  if (!ensureSharedDocumentAvailableForExport()) {
    throw new Error(sharedDocRequiredError);
  }
  const { exportStudioInkMl } = await import("../studio-inkml-interchange");
  const pageGroups = activePage.groups ?? EMPTY_LAYER_GROUPS;
  const drawElements = activePage.elements.filter(
    (element): element is DrawEl =>
      element.type === "draw" && !isEffectivelyHidden(element, pageGroups),
  );
  return exportStudioInkMl(drawElements);
}

export async function runStudioSendCurrentPageToCompareReview({
  workId, studioAuthReady, studioAuthUserId, storage, stageRef, selectedId, activePage,
  activePageIndex, revokeStudioRasterHandoffRef, getAuthUserId, readStageInDocumentView,
  setSelectedId, announceDrawingShortcut, setError, tooLargeMessage, sendFailedMessage,
}: {
  readonly workId: string | null;
  readonly studioAuthReady: boolean;
  readonly studioAuthUserId: string | null;
  readonly storage: Storage | null;
  readonly stageRef: MutableRefObject<Konva.Stage | null>;
  readonly selectedId: string | null;
  readonly activePage: PageState;
  readonly activePageIndex: number;
  readonly revokeStudioRasterHandoffRef: MutableRefObject<() => void>;
  readonly getAuthUserId: () => string | null;
  readonly readStageInDocumentView: <T>(stage: Konva.Stage, read: () => T, settleDelay?: number) => T;
  readonly setSelectedId: Dispatch<SetStateAction<string | null>>;
  readonly announceDrawingShortcut: (message: string) => void;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly tooLargeMessage: string;
  readonly sendFailedMessage: string;
}): Promise<void> {
  if (!workId || !studioAuthReady || !storage) {
    announceDrawingShortcut("작품으로 연결된 뒤에 비교 검수로 보낼 수 있어요.");
    return;
  }
  const stage = stageRef.current;
  const ownerUserId = getAuthUserId();
  if (!stage || ownerUserId !== studioAuthUserId) return;
  const previousSelection = selectedId;
  setSelectedId(null);
  await new Promise((r) => setTimeout(r, 60));
  if (getAuthUserId() !== ownerUserId) return;
  const src = readStageInDocumentView(stage, () => readStudioAuthoritativeStageFrame({
    revokeRasterHandoff: () => revokeStudioRasterHandoffRef.current(),
    drawStage: () => stage.draw(),
    read: () => stage.toDataURL({ pixelRatio: 1 }),
  }), 2);
  if (previousSelection) setSelectedId(previousSelection);
  const { writeCompareSendInbox, compareSendInboxScope } = await import(
    "../production-hub/compare-send-inbox"
  );
  if (getAuthUserId() !== ownerUserId) return;
  const result = await writeCompareSendInbox(storage, compareSendInboxScope(ownerUserId, workId), {
    id: uid(),
    pageId: activePage.id,
    pageLabel: `에디터 · ${pageDisplayName(activePage, activePageIndex)}`,
    imageUrl: src,
    sentAt: new Date().toISOString(),
  });
  if (getAuthUserId() !== ownerUserId) return;
  if (result.ok) {
    announceDrawingShortcut("비교 검수로 보냈어요. 회차 룸의 비교 탭 소스 풀에서 확인할 수 있어요.");
  } else if (result.reason === "image-too-large") {
    setError(tooLargeMessage);
  } else {
    setError(sendFailedMessage);
  }
}

export async function runStudioSaveElementAsEmeresLibraryItem({
  elId, elementById, stageRef, effScale, revokeStudioRasterHandoffRef,
  readStageInDocumentView, setSelectedId, hideContextMenu, saveEmeresItem,
  setError, groupBlockedMessage, saveFailedMessage,
}: {
  readonly elId: string;
  readonly elementById: ReadonlyMap<string, El>;
  readonly stageRef: MutableRefObject<Konva.Stage | null>;
  readonly effScale: number;
  readonly revokeStudioRasterHandoffRef: MutableRefObject<() => void>;
  readonly readStageInDocumentView: <T>(stage: Konva.Stage, read: () => T, settleDelay?: number) => T;
  readonly setSelectedId: Dispatch<SetStateAction<string | null>>;
  readonly hideContextMenu: () => void;
  readonly saveEmeresItem: (item: StudioEmeresLibraryItem) => Promise<void>;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly groupBlockedMessage: string;
  readonly saveFailedMessage: string;
}): Promise<void> {
  const el = elementById.get(elId);
  if (!el) return;
  if ("rotation" in el && el.rotation) {
    setError("회전이 0°인 요소만 이메레스로 저장할 수 있어요.");
    return;
  }
  if (el.groupId) {
    setError(groupBlockedMessage);
    return;
  }
  const stage = stageRef.current;
  if (!stage) return;
  const bounds = elBounds(el);
  setSelectedId(null);
  await new Promise((r) => setTimeout(r, 60));
  const src = readStageInDocumentView(stage, () => readStudioAuthoritativeStageFrame({
    revokeRasterHandoff: () => revokeStudioRasterHandoffRef.current(),
    drawStage: () => stage.draw(),
    read: () => stage.toDataURL({
      x: bounds.x * effScale,
      y: bounds.y * effScale,
      width: bounds.w * effScale,
      height: bounds.h * effScale,
      pixelRatio: 2 / effScale,
    }),
  }), 2);
  const name = globalThis.prompt("틀 이름을 정해주세요", "내 이메레스 틀")?.trim();
  hideContextMenu();
  if (!name) return;
  try {
    const { createEmeresLibraryItem } = await import("../studio-emeres-library");
    const created = createEmeresLibraryItem(name, {
      src, width: Math.round(bounds.w), height: Math.round(bounds.h),
    });
    await saveEmeresItem(created);
  } catch (err) {
    console.error("Failed to save emeres library item:", err);
    setError(saveFailedMessage);
  }
}

export async function runStudioPickImageFile({
  event, activePage, canvasH, masterEditMode, selected, pagesHistoryRef, pagesHiRef,
  currentPageIdRef, masterEditModeRef, activeElementsRef, activeSurfaceReviewLockedRef,
  captureStudioMutationTicket, canApplyStudioMutation, nextAssetInsertionPlacement,
  loadImageFile, commit, setError, setSelectedId, setTool, addFailedMessage,
}: {
  readonly event: ChangeEvent<HTMLInputElement>;
  readonly activePage: PageState;
  readonly canvasH: number;
  readonly masterEditMode: boolean;
  readonly selected: El | null;
  readonly pagesHistoryRef: MutableRefObject<PageState[][]>;
  readonly pagesHiRef: MutableRefObject<number>;
  readonly currentPageIdRef: MutableRefObject<string>;
  readonly masterEditModeRef: MutableRefObject<boolean>;
  readonly activeElementsRef: MutableRefObject<El[]>;
  readonly activeSurfaceReviewLockedRef: MutableRefObject<boolean>;
  readonly captureStudioMutationTicket: () => StudioEditorMutationTicket;
  readonly canApplyStudioMutation: (ticket: StudioEditorMutationTicket) => boolean;
  readonly nextAssetInsertionPlacement: () => CanvasImagePlacement;
  readonly loadImageFile: typeof loadStudioCanvasImageFile;
  readonly commit: (nextElements: El[], pagePatch?: Partial<PageState>, targetPageId?: string) => boolean;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly setSelectedId: Dispatch<SetStateAction<string | null>>;
  readonly setTool: Dispatch<SetStateAction<Tool>>;
  readonly addFailedMessage: string;
}): Promise<void> {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  const mutationTicket = captureStudioMutationTicket();
  const insertionPlacement = nextAssetInsertionPlacement();
  try {
    const { src, width, height, isAnimatedGif, frames, frameFps, frameLoop } = await loadImageFile(file);
    const latest = resolveStudioFileImageAppend({
      ticket: mutationTicket,
      currentTicket: captureStudioMutationTicket(),
      canApply: canApplyStudioMutation,
      originalPage: activePage,
      currentPage: pagesHistoryRef.current[pagesHiRef.current]?.find(
        (page) => page.id === currentPageIdRef.current,
      ),
      originalMasterMode: masterEditMode,
      currentMasterMode: masterEditModeRef.current,
      currentMasterElements: activeElementsRef.current,
      originalFrame: selected?.type === "frame" ? selected : null,
      reviewLocked: activeSurfaceReviewLockedRef.current,
    });
    if (!latest) return;
    const image = {
      ...createCanvasImageElement({
        id: uid(),
        src,
        canvasWidth: CANVAS_W,
        canvasHeight: canvasH,
        sourceWidth: width,
        sourceHeight: height,
        placement: insertionPlacement,
      }),
      ...(isAnimatedGif ? { isAnimatedGif: true } : {}),
      ...(frames && frames.length > 1
        ? { frames, frameFps, frameLoop, activeFrameId: frames[0]!.id }
        : {}),
    };
    if (commit([...latest, image], undefined, activePage.id)) {
      setError(null);
      setSelectedId(image.id);
      setTool("select");
    }
  } catch (err) {
    setError(err instanceof Error ? err.message : addFailedMessage);
  }
}

export async function runStudioCaptureTimelapseStep({
  historyIndex, targetWidth, pagesHistory, currentPageId, effScale,
  setPagesHi, setCurrentPageId, captureReadyStageForHistoryPage, pageNotFoundMessage,
}: {
  readonly historyIndex: number;
  readonly targetWidth: number;
  readonly pagesHistory: readonly (readonly PageState[])[];
  readonly currentPageId: string;
  readonly effScale: number;
  readonly setPagesHi: Dispatch<SetStateAction<number>>;
  readonly setCurrentPageId: (next: string) => boolean;
  readonly captureReadyStageForHistoryPage: (page: PageState, historyIndex: number) => Promise<Konva.Stage>;
  readonly pageNotFoundMessage: string;
}): Promise<MotionCutImage> {
  const snapshot = pagesHistory[historyIndex];
  const targetPage = snapshot?.find((page) => page.id === currentPageId) ?? snapshot?.[0];
  if (!targetPage) throw new Error(pageNotFoundMessage);
  setPagesHi(historyIndex);
  setCurrentPageId(targetPage.id);
  const stage = await captureReadyStageForHistoryPage(targetPage, historyIndex);
  const pixelRatio = targetWidth / CANVAS_W / effScale;
  const canvas = stage.toCanvas({ pixelRatio });
  return { source: canvas, width: canvas.width, height: canvas.height };
}
