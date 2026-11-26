import { studioCutVrmDocumentScope, studioTeamCutVrmDocumentScope } from "./studio-shared-3d-scene-runtime";
import { panelStatusText } from "./status-i18n/studio-panel-status-i18n-r3c06-core";
import { Loader2 } from "lucide-react";
import { Suspense, memo, useEffect, useMemo, useState } from "react";

import { isStudioAiConfigured } from "./ai/studio-ai-client-config";
import { subscribeStudioAiComicComposerOpenRequest } from "./ai/studio-ai-comic-composer-intent";
import {
  StudioBackground3D,
  StudioPageReviewPanel,
  StudioQuickActionsMenu,
  StudioScenarioAutoLayoutPanel,
  StudioMannequinPoserPanel,
  StudioScrollPreviewPanel,
  ReaderPreviewPanel,
  StudioStoryboardGridPanel,
  StudioTimelapsePanel,
  StudioVrmPoser,
  StudioTeamVrmCutEditorGate,
  StudioCharacterShaper,
} from "./studio-page-lazy-ui";
import { pageDisplayName } from "./studio-page-meta";
import {
  EMPTY_STUDIO_SHARED_3D_SCENE_SESSION,
  selectStudioShared3dVisibleSceneElements,
} from "./runtime-leaves/studio-shared-3d-character-identity";
import {
  loadStudioShared3dSceneSessionModules,
  StudioBg3dRetainedOwnerRouteBridge,
  type StudioShared3dSceneSessionModules,
} from "./runtime-leaves/studio-shared-3d-scene-session-loader";
import {
  findStudioShared3dStageEntryByBundleId,
  migrateStudioShared3dStageCollectionDocument,
  resolveStudioShared3dStageCollectionForBundle,
  studioShared3dStageOwnedCharacterElementIds,
  studioShared3dStageReusableHiddenCharacterElementIds,
} from "./studio-shared-3d-stage-collection";

import type { StudioBg3dSceneDocument } from "./bg3d/studio-bg3d-scene-document";
import type { ScrollPreviewPinReturn } from "./StudioScrollPreviewPanel";
import type { BgPrimitiveKind } from "./studio-background-3d-metadata";
import type {
  StudioLazyPanelStackHandlers,
  StudioLazyPanelStackProps,
} from "./StudioLazyPanelStack";

function asBgPrimitiveKindOrNull(value: string | null): BgPrimitiveKind | null {
  if (!value) return null;
  const kinds: readonly string[] = [
    "box",
    "cylinder",
    "plane",
    "sphere",
    "hemisphere",
    "cone",
    "pyramid",
    "triangularPrism",
    "hexPrism",
    "torus",
    "tube",
    "ring",
    "capsule",
  ];
  return kinds.includes(value) ? (value as BgPrimitiveKind) : null;
}

const EMPTY_STUDIO_PAGE_ELEMENTS: never[] = [];
const EMPTY_STUDIO_PAGE_GROUPS: never[] = [];

type StudioThreeDPreviewPanelStackHandlers = Pick<
  StudioLazyPanelStackHandlers,
  | "addPage"
  | "captureTimelapseStep"
  | "commitShotTag"
  | "deletePage"
  | "duplicatePage"
  | "executeQuickAction"
  | "handleTimelapseRecordingEnd"
  | "handleTimelapseRecordingStart"
  | "insertBg3dResult"
  | "insertVrmResult"
  | "insertCharacterLtLayers"
  | "insertMannequinResult"
  | "patchPageReview"
  | "setCurrentPageId"
  | "useBg3dFrameAsAiMethodReference"
>;

export type StudioThreeDPreviewPanelStackProps = Pick<
  StudioLazyPanelStackProps,
  | "activePage"
  | "bg3dInitialDataUrl"
  | "bg3dInitialScene"
  | "bg3dOperation"
  | "bg3dSixPassLtUnavailableReason"
  | "bg3dTargetBundleId"
  | "bg3dBatchRecoveryScope"
  | "validateRecoveryAccess"
  | "bg3dOpen"
  | "bg3dMarketplaceModelId"
  | "bg3dSeedTemplateId"
  | "bg3dSeedPrimitiveKind"
  | "onSeedObjectInsertConsumed"
  | "composeWorkAssetPreviewPage"
  | "currentPageId"
  | "elementById"
  | "isMobile"
  | "masterEditMode"
  | "pageDnd"
  | "pageReviewOpen"
  | "pages"
  | "pagesHi"
  | "pagesHistory"
  | "mannequinPoserOpen"
  | "poserInitialDataUrl"
  | "poserInitialElementId"
  | "poserSeedPropId"
  | "poserVrmOpen"
  | "characterShaperOpen"
  | "quickActionsAnchor"
  | "quickActionsDisabledActions"
  | "quickActionsOpen"
  | "quickActionsPreferences"
  | "setBg3dInitialDataUrl"
  | "setBg3dInitialElementId"
  | "setBg3dInitialScene"
  | "setBg3dOpen"
  | "setMannequinPoserOpen"
  | "setPageReviewOpen"
  | "setPoserInitialDataUrl"
  | "setPoserInitialElementId"
  | "setPoserVrmOpen"
  | "setCharacterShaperOpen"
  | "setQuickActionsOpen"
  | "setQuickActionsPreferences"
  | "setStoryboardGridOpen"
  | "setTimelapseOpen"
  | "storyboardGridOpen"
  | "timelapseOpen"
  | "title"
> & {
  onOpenPrecisionModeler?: (scene: StudioBg3dSceneDocument) => void;
  cutTeamDocument?: boolean;
  cutWorkScope?: import("./studio-cuttoon-editor/runtime/studio-local-vrm-cut-scope").StudioLocalVrmCutHostScope["cutWorkScope"];
  cutDocumentKey?: string;
  stableHandlers: StudioThreeDPreviewPanelStackHandlers;
};

type StudioScrollScenarioPreviewPanelStackHandlers = Pick<
  StudioLazyPanelStackHandlers,
  | "onApplyScenarioPreview"
  | "onCancelScenario"
  | "onChangeScenarioScene"
  | "onDiscardScenarioPreview"
  | "onGenerateScenario"
  | "onGenerateScenarioImages"
  | "onImportScenarioProductionPlan"
  | "onRegenerateScenarioImage"
  | "onRemoveScenarioScene"
  | "onScenarioApplyTargetChange"
  | "setCurrentPageId"
>;

export type StudioScrollScenarioPreviewPanelStackProps = Pick<
  StudioLazyPanelStackProps,
  | "aiSettings"
  | "composeWorkAssetPreviewPage"
  | "currentPageId"
  | "pages"
  | "scenarioApplyTarget"
  | "scenarioBusy"
  | "scenarioError"
  | "scenarioImageReferenceAssetOptions"
  | "scenarioImageReferenceDocument"
  | "scenarioImageReferenceMissingCount"
  | "scenarioImageReferencesLoading"
  | "scenarioOpen"
  | "scenarioProgress"
  | "scenarioRegeneratingIndex"
  | "scenarioResult"
  | "scenarioSceneCountHint"
  | "scenarioStageLabel"
  | "scenarioStoryText"
  | "scrollPreview"
  | "readerPreviewOpen"
  | "setScenarioOpen"
  | "setScenarioImageReferenceDocument"
  | "setScenarioSceneCountHint"
  | "setScenarioStoryText"
  | "setScrollPreviewOpen"
  | "setReaderPreviewOpen"
  | "textAiConfigured"
> & {
  stableHandlers: StudioScrollScenarioPreviewPanelStackHandlers;
};

function PoserLoadingOverlay() {
  return (
    <div aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.08_0.01_70/0.72)] p-4 text-fg backdrop-blur-sm">
      <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-sm font-semibold shadow-xl">
        <Loader2 className="animate-spin text-accent" size={16} aria-hidden />
        <span>{panelStatusText("studio.panelStatus.threeDPreviewStack.poserLoading", "포저를 여는 중")}</span>
      </div>
    </div>
  );
}

function MannequinLoadingOverlay() {
  return (
    <div aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.08_0.01_70/0.72)] p-4 text-fg backdrop-blur-sm">
      <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-sm font-semibold shadow-xl">
        <Loader2 className="animate-spin text-accent" size={16} aria-hidden />
        <span>{panelStatusText("studio.panelStatus.threeDPreviewStack.mannequinLoading", "3D 데생 인형을 여는 중")}</span>
      </div>
    </div>
  );
}

function TimelapseLoadingOverlay() {
  return (
    <div aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.08_0.01_70/0.72)] p-4 text-fg backdrop-blur-sm">
      <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-sm font-semibold shadow-xl">
        <Loader2 className="animate-spin text-accent" size={16} aria-hidden />
        <span>{panelStatusText("studio.panelStatus.threeDPreviewStack.timelapseLoading", "타임랩스 도구를 여는 중")}</span>
      </div>
    </div>
  );
}

function StoryboardGridLoadingOverlay() {
  return (
    <div aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.08_0.01_70/0.72)] p-4 text-fg backdrop-blur-sm">
      <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-sm font-semibold shadow-xl">
        <Loader2 className="animate-spin text-accent" size={16} aria-hidden />
        <span>{panelStatusText("studio.panelStatus.threeDPreviewStack.storyboardLoading", "스토리보드 그리드를 여는 중")}</span>
      </div>
    </div>
  );
}

function ScrollPreviewLoadingOverlay() {
  return (
    <div aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.08_0.01_70/0.72)] p-4 text-fg backdrop-blur-sm">
      <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-sm font-semibold shadow-xl">
        <Loader2 className="animate-spin text-accent" size={16} aria-hidden />
        <span>{panelStatusText("studio.panelStatus.threeDPreviewStack.scrollPreviewLoading", "스크롤 미리보기를 여는 중")}</span>
      </div>
    </div>
  );
}

function ScenarioAutoLayoutLoadingOverlay() {
  return (
    <div aria-live="polite" className="fixed inset-0 z-50 grid place-items-center bg-[oklch(0.08_0.01_70/0.72)] p-4 text-fg backdrop-blur-sm">
      <div className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-4 py-3 text-sm font-semibold shadow-xl">
        <Loader2 className="animate-spin text-accent" size={16} aria-hidden />
        <span>{panelStatusText("studio.panelStatus.threeDPreviewStack.scenarioLoading", "시나리오 자동 생성 도구를 여는 중")}</span>
      </div>
    </div>
  );
}

export const StudioThreeDPreviewPanelStack = memo(function StudioThreeDPreviewPanelStack({
  activePage,
  bg3dInitialDataUrl,
  bg3dInitialScene,
  bg3dTargetBundleId,
  bg3dOperation,
  bg3dSixPassLtUnavailableReason,
  bg3dBatchRecoveryScope, cutTeamDocument, cutDocumentKey, cutWorkScope,
  validateRecoveryAccess,
  bg3dOpen,
  bg3dMarketplaceModelId = null,
  bg3dSeedTemplateId = null,
  bg3dSeedPrimitiveKind = null,
  onSeedObjectInsertConsumed,
  onOpenPrecisionModeler,
  composeWorkAssetPreviewPage,
  currentPageId,
  elementById,
  masterEditMode,
  pageDnd,
  pageReviewOpen,
  pages,
  pagesHi,
  pagesHistory,
  mannequinPoserOpen,
  poserInitialDataUrl,
  poserInitialElementId,
  poserSeedPropId = null,
  poserVrmOpen,
  characterShaperOpen,
  quickActionsAnchor,
  quickActionsDisabledActions,
  quickActionsOpen,
  quickActionsPreferences,
  setBg3dInitialDataUrl,
  setBg3dInitialElementId,
  setBg3dInitialScene,
  setBg3dOpen,
  setMannequinPoserOpen,
  setPageReviewOpen,
  setPoserInitialDataUrl,
  setPoserInitialElementId,
  setPoserVrmOpen,
  setCharacterShaperOpen,
  setQuickActionsOpen,
  setQuickActionsPreferences,
  setStoryboardGridOpen,
  setTimelapseOpen,
  storyboardGridOpen,
  timelapseOpen,
  title,
  stableHandlers,
}: StudioThreeDPreviewPanelStackProps) {
  const {
    addPage,
    captureTimelapseStep,
    commitShotTag,
    deletePage,
    duplicatePage,
    executeQuickAction,
    handleTimelapseRecordingEnd,
    handleTimelapseRecordingStart,
    insertBg3dResult,
    insertVrmResult,
    insertCharacterLtLayers,
    insertMannequinResult,
    patchPageReview,
    setCurrentPageId,
    useBg3dFrameAsAiMethodReference,
  } = stableHandlers;
  const poserInitialElement = poserInitialElementId
    ? elementById.get(poserInitialElementId) ?? null
    : null;
  const poserInitialScene = poserInitialElement?.type === "image"
    ? poserInitialElement.vrmScene
    : undefined;
  // Recovery/tests may briefly render the lazy shell before its page snapshot is available. Keep
  // 3D panels fail-soft instead of turning that transient boundary into a whole-Studio crash.
  const activePageElements = activePage?.elements ?? EMPTY_STUDIO_PAGE_ELEMENTS;
  const activePageGroups = activePage?.groups ?? EMPTY_STUDIO_PAGE_GROUPS;
  const activePageShared3dStage = activePage?.shared3dStage;
  const activePageId = activePage?.id ?? currentPageId;
  const sharedStageCollection = useMemo(
    () => masterEditMode || activePageShared3dStage === undefined
      ? undefined
      : migrateStudioShared3dStageCollectionDocument(activePageShared3dStage),
    [activePageShared3dStage, masterEditMode],
  );
  const sharedStageCollectionInvalid = !masterEditMode
    && activePageShared3dStage !== undefined
    && !sharedStageCollection;
  const shared3dStageResolution = useMemo(
    () => !bg3dOpen || masterEditMode
      ? resolveStudioShared3dStageCollectionForBundle(undefined, [], null)
      : resolveStudioShared3dStageCollectionForBundle(
          activePageShared3dStage,
          activePageElements,
          bg3dTargetBundleId,
        ),
    [
      activePageElements,
      activePageShared3dStage,
      bg3dOpen,
      bg3dTargetBundleId,
      masterEditMode,
    ],
  );
  const targetSharedStageEntry = findStudioShared3dStageEntryByBundleId(
    sharedStageCollection,
    bg3dTargetBundleId,
  );
  const targetHasPersistentSharedStage = Boolean(targetSharedStageEntry);
  const sharedCharactersLinkedToOtherBackgroundCount = useMemo(() => {
    if (!bg3dOpen || masterEditMode || sharedStageCollectionInvalid) return 0;
    const linkedToAnotherBackground = studioShared3dStageOwnedCharacterElementIds(
      sharedStageCollection,
      bg3dTargetBundleId,
    );
    const reusableHiddenIds = studioShared3dStageReusableHiddenCharacterElementIds(
      sharedStageCollection,
      activePageElements,
    );
    const visibleIds = new Set(selectStudioShared3dVisibleSceneElements(
      activePageElements,
      activePageGroups,
    ).map(({ id }) => id));
    return activePageElements.filter((element) =>
      linkedToAnotherBackground.has(element.id)
      && (visibleIds.has(element.id) || reusableHiddenIds.has(element.id))
      && element.type === "image"
      && element.vrmScene !== undefined).length;
  }, [
    activePageElements,
    activePageGroups,
    bg3dOpen,
    bg3dTargetBundleId,
    masterEditMode,
    sharedStageCollection,
    sharedStageCollectionInvalid,
  ]);
  const [shared3dSessionModules, setShared3dSessionModules] =
    useState<StudioShared3dSceneSessionModules | null>(null);
  const [bg3dBridgeActivated, setBg3dBridgeActivated] = useState(bg3dOpen);
  useEffect(() => {
    if (!bg3dOpen) return;
    setBg3dBridgeActivated(true);
    if (shared3dSessionModules) return;
    let active = true;
    void loadStudioShared3dSceneSessionModules().then((modules) => {
      if (active) setShared3dSessionModules(modules);
    });
    return () => { active = false; };
  }, [bg3dOpen, shared3dSessionModules]);

  const shared3dSceneSession = useMemo(() => {
    if (!bg3dOpen || !shared3dSessionModules) return EMPTY_STUDIO_SHARED_3D_SCENE_SESSION;
    const sourceElements = masterEditMode ? [] : activePageElements;
    if (sharedStageCollectionInvalid) {
      return shared3dSessionModules.createStudioShared3dSceneSessionFromElements([]);
    }
    if (!targetHasPersistentSharedStage || targetSharedStageEntry?.characters.length === 0) {
      const reusableHiddenIds = studioShared3dStageReusableHiddenCharacterElementIds(
        sharedStageCollection,
        sourceElements,
      );
      const visibleIds = new Set(selectStudioShared3dVisibleSceneElements(
        sourceElements,
        activePageGroups,
      ).map(({ id }) => id));
      // Exact receipt-owned hidden sources are reusable instances. Their Stage-local placement is
      // captured independently, while the single VRM model/pose/wardrobe authority stays shared.
      return shared3dSessionModules.createStudioShared3dSceneSessionFromElements(
        sourceElements.filter((element) =>
          visibleIds.has(element.id) || reusableHiddenIds.has(element.id)),
      );
    }
    return shared3dSessionModules.createStudioShared3dSceneSessionForStage(
      sharedStageCollection,
      sourceElements,
      bg3dTargetBundleId,
    );
  }, [
    activePageElements,
    activePageGroups,
    bg3dTargetBundleId,
    bg3dOpen,
    masterEditMode,
    shared3dSessionModules,
    sharedStageCollection,
    sharedStageCollectionInvalid,
    targetHasPersistentSharedStage,
    targetSharedStageEntry?.characters.length,
  ]);
  const sharedStageSessionScopeKey = JSON.stringify({
    pageId: activePageId,
    backgroundBundleId: bg3dTargetBundleId ?? null,
    operation: bg3dOperation,
  });

  const backgroundEditor = bg3dOpen ? (
    <StudioBackground3D
      open={bg3dOpen}
      initialDataUrl={bg3dInitialDataUrl}
      initialScene={bg3dInitialScene}
      marketplaceModelId={bg3dMarketplaceModelId}
      seedSceneTemplateId={bg3dSeedTemplateId}
      seedPrimitiveKind={asBgPrimitiveKindOrNull(bg3dSeedPrimitiveKind)}
      onSeedObjectInsertConsumed={onSeedObjectInsertConsumed}
      {...(onOpenPrecisionModeler ? { onOpenPrecisionModeler } : {})}
      cutTeamDocument={cutTeamDocument} cutWorkId={cutWorkScope?.authorized ? cutWorkScope.workId : undefined} cutDocumentKey={cutWorkScope && activePageId ? studioTeamCutVrmDocumentScope(cutWorkScope.workId, activePageId) : studioCutVrmDocumentScope(cutDocumentKey, activePageId)}
      sharedSceneSession={shared3dSceneSession}
      sharedStageResolution={masterEditMode ? undefined : shared3dStageResolution}
      sharedStageSessionScopeKey={sharedStageSessionScopeKey}
      sharedCharactersLinkedToOtherBackgroundCount={
        sharedCharactersLinkedToOtherBackgroundCount
      }
      operation={bg3dOperation}
      sixPassLtUnavailableReason={bg3dSixPassLtUnavailableReason}
      recoveryScope={bg3dBatchRecoveryScope}
      validateRecoveryAccess={validateRecoveryAccess}
      onClose={() => {
        setBg3dOpen(false);
        setBg3dInitialDataUrl(undefined);
        setBg3dInitialScene(undefined);
        setBg3dInitialElementId(undefined);
        if (typeof onSeedObjectInsertConsumed === "function") {
          onSeedObjectInsertConsumed();
        }
      }}
      onInsert={insertBg3dResult}
      onUseAsAiMethodReference={useBg3dFrameAsAiMethodReference}
    />
  ) : null;
  const sourceBundle = activePage?.bg3dLtBundles?.bundles.find(bundle => bundle.bundleId === bg3dTargetBundleId);
  const sourceRevision = sourceBundle?.revisions.find(revision => revision.renderRevisionId === sourceBundle.activeRevisionId);
  const sixPassSource = sourceRevision?.version === 2 ? sourceRevision.workVrmCut : undefined;
  const workAnchor = sixPassSource?.anchorId ?? (cutWorkScope?.anchorId?.startsWith("vrmcut-") ? cutWorkScope.anchorId : undefined);
  const missingTeamSeal = Boolean(bg3dInitialScene?.output.sixPassLt && bg3dInitialScene.pinnedVersionedCut?.source.linkedVrm && bg3dTargetBundleId && !sixPassSource);
  const bg3dElement = backgroundEditor && cutWorkScope && (workAnchor || missingTeamSeal) && activePageId
    ? <StudioTeamVrmCutEditorGate key={JSON.stringify([cutWorkScope.actorId, cutWorkScope.workId, activePageId, workAnchor, sourceRevision?.renderRevisionId])}
        editor={backgroundEditor} authority={cutWorkScope.authority} actorId={cutWorkScope.actorId} authorized={cutWorkScope.authorized && !missingTeamSeal} workId={cutWorkScope.workId} pageId={activePageId} anchorId={workAnchor ?? ""} sixPassSource={sixPassSource} /> : backgroundEditor;

  return (
    <>
      <Suspense fallback={null}>
        <StudioQuickActionsMenu
          open={quickActionsOpen}
          anchor={quickActionsAnchor}
          preferences={quickActionsPreferences}
          disabledActions={[...quickActionsDisabledActions]}
          onExecute={executeQuickAction}
          onPreferencesChange={setQuickActionsPreferences}
          onClose={() => setQuickActionsOpen(false)}
        />
      </Suspense>

      <Suspense fallback={<PoserLoadingOverlay />}>
        {poserVrmOpen ? (
          <StudioVrmPoser
            open
            initialDataUrl={poserInitialDataUrl}
            initialScene={poserInitialScene}
            seedPropId={poserSeedPropId}
            onSeedObjectInsertConsumed={onSeedObjectInsertConsumed}
            onClose={() => {
              setPoserVrmOpen(false);
              setPoserInitialDataUrl(undefined);
              setPoserInitialElementId(undefined);
              if (typeof onSeedObjectInsertConsumed === "function") {
                onSeedObjectInsertConsumed();
              }
            }}
            onInsert={insertVrmResult}
          />
        ) : null}
      </Suspense>

      {/* 캐릭터 셰이퍼 — 같은 VRM 런타임·같은 삽입 경로. 컨트롤러와 대화상자가 한 커밋에
          마운트되도록 Suspense 경계는 이 바깥에만 둔다. */}
      <Suspense fallback={<PoserLoadingOverlay />}>
        {characterShaperOpen ? (
          <StudioCharacterShaper
            key={poserInitialElementId}
            onInsertLtLayers={insertCharacterLtLayers && (async (layers, signal) => {
              if (!await insertCharacterLtLayers(layers, signal) || signal.aborted) return false;
              setCharacterShaperOpen(false);
              setPoserInitialElementId(undefined);
              setPoserInitialDataUrl(undefined);
              return true;
            })}
            open
            initialDataUrl={poserInitialDataUrl}
            initialScene={poserInitialScene}
            seedPropId={poserSeedPropId}
            onSeedObjectInsertConsumed={onSeedObjectInsertConsumed}
            onClose={() => {
              setCharacterShaperOpen(false);
              setPoserInitialDataUrl(undefined);
              setPoserInitialElementId(undefined);
              if (typeof onSeedObjectInsertConsumed === "function") {
                onSeedObjectInsertConsumed();
              }
            }}
            onInsert={insertVrmResult}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={<MannequinLoadingOverlay />}>
        {mannequinPoserOpen ? (
          <StudioMannequinPoserPanel
            open
            onClose={() => setMannequinPoserOpen(false)}
            onInsert={insertMannequinResult}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={null}>
        {bg3dBridgeActivated || bg3dOpen ? (
          <StudioBg3dRetainedOwnerRouteBridge
            element={bg3dElement}
            open={bg3dOpen}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={<TimelapseLoadingOverlay />}>
        {timelapseOpen ? (
          <StudioTimelapsePanel
            open
            onClose={() => setTimelapseOpen(false)}
            pageId={activePageId}
            history={pagesHistory.slice(0, pagesHi + 1)}
            title={title}
            masterEditMode={masterEditMode}
            captureStep={captureTimelapseStep}
            onRecordingStart={handleTimelapseRecordingStart}
            onRecordingEnd={handleTimelapseRecordingEnd}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={<StoryboardGridLoadingOverlay />}>
        {storyboardGridOpen ? (
          <StudioStoryboardGridPanel
            open
            onClose={() => setStoryboardGridOpen(false)}
            pages={pages.map(composeWorkAssetPreviewPage)}
            currentPageId={currentPageId}
            dnd={pageDnd}
            onSelectPage={(id) => {
              setCurrentPageId(id);
              setStoryboardGridOpen(false);
            }}
            onAddPage={addPage}
            onDuplicatePage={duplicatePage}
            onDeletePage={deletePage}
            canDelete={pages.length > 1}
            onShotTagChange={(pageId, patch) => commitShotTag(pageId, patch)}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={null}>
        {pageReviewOpen ? (
          <StudioPageReviewPanel
            open
            onClose={() => setPageReviewOpen(false)}
            pages={pages.map((page, index) => ({
              id: page.id,
              label: pageDisplayName(page, index),
              review: page.review,
            }))}
            currentPageId={currentPageId}
            onSelectPage={setCurrentPageId}
            onPatchReview={patchPageReview}
          />
        ) : null}
      </Suspense>
    </>
  );
});

export const StudioScrollScenarioPreviewPanelStack = memo(function StudioScrollScenarioPreviewPanelStack({
  aiSettings,
  composeWorkAssetPreviewPage,
  currentPageId,
  pages,
  scenarioApplyTarget,
  scenarioBusy,
  scenarioError,
  scenarioImageReferenceAssetOptions,
  scenarioImageReferenceDocument,
  scenarioImageReferenceMissingCount,
  scenarioImageReferencesLoading,
  scenarioOpen,
  scenarioProgress,
  scenarioRegeneratingIndex,
  scenarioResult,
  scenarioSceneCountHint,
  scenarioStageLabel,
  scenarioStoryText,
  scrollPreview: { open: scrollPreviewOpen, documentEpoch: scrollPreviewDocumentEpoch, onOpenPin },
  readerPreviewOpen,
  setScenarioOpen,
  setScenarioImageReferenceDocument,
  setScenarioSceneCountHint,
  setScenarioStoryText,
  setScrollPreviewOpen,
  setReaderPreviewOpen,
  textAiConfigured,
  stableHandlers,
}: StudioScrollScenarioPreviewPanelStackProps) {
  const [pinReturn, setPinReturn] = useState<{ epoch: number; point: ScrollPreviewPinReturn }>();
  const {
    onApplyScenarioPreview,
    onCancelScenario,
    onChangeScenarioScene,
    onDiscardScenarioPreview,
    onGenerateScenario,
    onGenerateScenarioImages,
    onImportScenarioProductionPlan,
    onRegenerateScenarioImage,
    onRemoveScenarioScene,
    onScenarioApplyTargetChange,
    setCurrentPageId,
  } = stableHandlers;

  useEffect(
    () =>
      subscribeStudioAiComicComposerOpenRequest((handoff) => {
        setScenarioStoryText(handoff.storyText);
        setScenarioSceneCountHint(
          handoff.totalCuts >= 2 && handoff.totalCuts <= 10 ? handoff.totalCuts : undefined
        );
        onImportScenarioProductionPlan(handoff);
        setScenarioOpen(true);
      }),
    [
      onImportScenarioProductionPlan,
      setScenarioOpen,
      setScenarioSceneCountHint,
      setScenarioStoryText,
    ]
  );

  return (
    <>
      <Suspense fallback={<ScrollPreviewLoadingOverlay />}>
        {scrollPreviewOpen ? (
          <StudioScrollPreviewPanel
            key={scrollPreviewDocumentEpoch}
            open
            onOpenFeedbackPin={onOpenPin}
            initialPinReturn={pinReturn && pinReturn.epoch === scrollPreviewDocumentEpoch ? pinReturn.point : undefined}
            onClose={(nextReturn) => {
              setPinReturn(nextReturn && { epoch: scrollPreviewDocumentEpoch, point: nextReturn });
              setScrollPreviewOpen(false);
            }}
            pages={pages.map(composeWorkAssetPreviewPage)}
            currentPageId={currentPageId}
            onSelectPage={setCurrentPageId}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={<ScrollPreviewLoadingOverlay />}>
        {readerPreviewOpen ? (
          <ReaderPreviewPanel
            open
            onClose={() => setReaderPreviewOpen(false)}
            pages={pages.map(composeWorkAssetPreviewPage)}
            currentPageId={currentPageId}
            onSelectPage={(id) => {
              setCurrentPageId(id);
              setReaderPreviewOpen(false);
            }}
          />
        ) : null}
      </Suspense>

      <Suspense fallback={<ScenarioAutoLayoutLoadingOverlay />}>
        {scenarioOpen ? (
          <StudioScenarioAutoLayoutPanel
            open
            onClose={() => setScenarioOpen(false)}
            textConfigured={textAiConfigured}
            imageConfigured={isStudioAiConfigured(aiSettings)}
            storyText={scenarioStoryText}
            onStoryTextChange={setScenarioStoryText}
            sceneCountHint={scenarioSceneCountHint}
            onSceneCountHintChange={setScenarioSceneCountHint}
            applyTarget={scenarioApplyTarget}
            onApplyTargetChange={onScenarioApplyTargetChange}
            busy={scenarioBusy}
            stageLabel={scenarioStageLabel}
            progress={scenarioProgress}
            error={scenarioError}
            imageReferenceAssetOptions={scenarioImageReferenceAssetOptions}
            imageReferenceDocument={scenarioImageReferenceDocument}
            imageReferenceMissingCount={scenarioImageReferenceMissingCount}
            imageReferencesLoading={scenarioImageReferencesLoading}
            onImageReferenceDocumentChange={setScenarioImageReferenceDocument}
            preview={scenarioResult?.items ?? null}
            textProvenance={scenarioResult?.textAiProvenance ?? null}
            onGenerate={onGenerateScenario}
            onGenerateImages={onGenerateScenarioImages}
            onChangeScene={onChangeScenarioScene}
            onRemoveScene={onRemoveScenarioScene}
            onRegenerateScene={onRegenerateScenarioImage}
            regeneratingIndex={scenarioRegeneratingIndex}
            onCancel={onCancelScenario}
            onApply={onApplyScenarioPreview}
            onDiscard={onDiscardScenarioPreview}
          />
        ) : null}
      </Suspense>
    </>
  );
});
