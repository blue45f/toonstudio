/* Extracted render tree from StudioCuttoonEditor.
 * Session props are an `any` bag matching the original editor closure. */
"use no memo";
// React Compiler 옵트아웃: 가변 호스트 백(h) 을 렌더마다 재대입해 공유하는 추출 패턴이라,
// 컴파일러가 h 참조 동일성만 보고 JSX/계산을 캐시하면 첫 렌더에서 UI 가 영구 동결된다
// (탭 전환 등 커밋된 상태 변경이 화면에 반영되지 않음).
import { useStudioAppliedFilterIntent } from "../filter/studio-applied-filter-context";
import { Suspense } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { isEffectivelyLocked } from "../studio-layers";
import { hasActiveImageFilters } from "../render/studio-konva-filter-fields";
import { createStudioPixelEditCanvas, encodeStudioPixelEditResultPng, loadStudioPixelEditImage } from "../studio-legacy-editor-runtime-helpers";
import { StudioFilterDialog as StudioSingleFilterDialog, StudioLayerLiftDialog } from "../studio-page-lazy-ui";
import { StudioFilterGalleryDialog } from "../filter/gallery/studio-filter-gallery-lazy";
import type { El, ImageEl } from "../studio-element-model";
import { editorShellStatusText } from "../status-i18n/studio-editor-shell-status-i18n-r3c11";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

export function StudioCuttoonEditorSessionDialogs(s: StudioCuttoonEditorViewSession) {
  const watchAppliedFilter = useStudioAppliedFilterIntent();
  const bt = useBilingual("studio.drawingClarity");
  const {
    activeSurfaceReviewLocked,
    announceDrawingShortcut,
    applyStudioLayerLift,
    canApplyStudioMutation,
    captureStudioMutationTicket,
    closeStudioFilterDialog,
    closeStudioLayerLift,
    commit,
    correctStudioLayerLift,
    currentPageIdRef,
    currentStudioFilterPageRasterContext,
    elementById,
    error,
    groups,
    isLatestLayerContentMutationLocked,
    pagesHiRef,
    patchEl,
    runStudioLayerLiftAnalysis,
    setError,
    setLastStudioFilterDraft,
    setMarqueeIds,
    setSelectedId,
    setStudioFilterApplying,
    setStudioFilterPreview,
    setStudioFilterSession,
    setStudioLayerLiftOptions,
    setTool,
    studioFilterApplyBusyRef,
    studioFilterApplying,
    studioFilterDialogImage,
    studioFilterDialogMutationLockReason,
    studioFilterDialogMutationLocked,
    studioFilterSession,
    studioFilterSessionIdRef,
    studioLayerLiftDisabledReason,
    studioLayerLiftGeneralSubjectAvailable,
    studioLayerLiftOptions,
    studioLayerLiftUi,
    studioLayerLiftUiRef,
    studioRootRef,
  } = s;
  // 필터 갤러리는 단일 필터와 같은 세션 계약을 받는 별도 대화상자다(효과 스택 편집).
  const StudioFilterDialog = studioFilterSession?.kind === "filter-gallery" ? StudioFilterGalleryDialog : StudioSingleFilterDialog;
  const replacementSourceId = studioFilterSession?.target === "page-composite"
    ? studioFilterSession.plan.sourceDispositionIds[0]
    : undefined;
  const progress = <div data-studio-filter-preparing="true" className="studio-drawing-filter-progress">
    <span role="status">{bt("필터 미리보기를 준비하는 중…", "Preparing filter preview…")}</span>
    <button type="button" onClick={closeStudioFilterDialog}>{bt("취소", "Cancel")}</button>
  </div>;
  return (
    <>
      {s.studioFilterPreparationBusy && !studioFilterSession ? progress : null}
      {studioFilterSession && studioFilterDialogImage?.type === "image" ? (
        <Suspense fallback={progress}>
          <StudioFilterDialog
            key={studioFilterSession.id}
            activeKey={`filter:${studioFilterSession.id}`}
            kind={studioFilterSession.kind}
            image={studioFilterDialogImage}
            imageSrc={studioFilterDialogImage.src}
            targetKind={replacementSourceId ? "layer-composite" : studioFilterSession.target}
            {...(studioFilterSession.initialDraft
              ? { initialDraft: studioFilterSession.initialDraft }
              : {})}
            rootRef={studioRootRef}
            mutationLocked={studioFilterDialogMutationLocked}
            {...(studioFilterDialogMutationLockReason
              ? { mutationLockReason: studioFilterDialogMutationLockReason }
              : {})}
            applying={studioFilterApplying}
            applicationError={error}
            selectionAvailable={
              studioFilterSession.target === "image" && !!studioFilterSession.selection
            }
            selectionFeatherPx={
              studioFilterSession.target === "image"
                ? studioFilterSession.selection?.featherPx
                : undefined
            }
            selectionInverted={
              studioFilterSession.target === "image"
                ? studioFilterSession.selection?.invert
                : undefined
            }
            onPreview={(patch) => {
              setStudioFilterPreview(
                patch && (studioFilterSession.target === "image" || hasActiveImageFilters(patch))
                  ? { elementId: studioFilterSession.elementId, patch, ...(replacementSourceId ? { replacementSourceId } : {}) }
                  : null,
              );
            }}
            onApply={async (patch, draft, applicationScope) => {
              if (studioFilterApplyBusyRef.current) return;
              setError(null);
              if (studioFilterSession.target === "image") {
                if (applicationScope === "whole") {
                  if (!patchEl(studioFilterSession.elementId, patch as Partial<El>)) return;
                  const target = elementById.get(studioFilterSession.elementId);
                  if (target?.type === "image") watchAppliedFilter?.({ ...target, ...patch });
                  setStudioFilterPreview(null);
                  setLastStudioFilterDraft(draft);
                  setStudioFilterApplying(false);
                  setStudioFilterSession(null);
                  return;
                }
                const selection = studioFilterSession.selection;
                if (!selection) {
                  setError(editorShellStatusText("studio.editorShellStatus.session.filterSelectAreaFirst", "필터를 적용할 픽셀 영역을 먼저 선택하세요."));
                  return;
                }
                const target = elementById.get(studioFilterSession.elementId);
                if (!target || target.type !== "image") {
                  setError(editorShellStatusText("studio.editorShellStatus.session.filterTargetMissing", "필터 대상 이미지가 현재 페이지에 없습니다. 다시 선택해 주세요."));
                  return;
                }
                const applySessionId = studioFilterSession.id;
                const mutationTicket = captureStudioMutationTicket();
                studioFilterApplyBusyRef.current = true;
                setStudioFilterApplying(true);
                try {
                  const source = await loadStudioPixelEditImage(target.src);
                  if (
                    applySessionId !== studioFilterSessionIdRef.current
                    || !canApplyStudioMutation(mutationTicket)
                    || isLatestLayerContentMutationLocked(target.id)
                  ) return;
                  const {
                    createStudioSelectionFilterMaskTransactionAsync,
                    commitStudioSelectionFilterMaskTransaction,
                  } = await import("../studio-selection-filter-mask-transaction");
                  const result = await createStudioSelectionFilterMaskTransactionAsync({
                    target,
                    selection,
                    scope: applicationScope,
                    imageWidth: source.naturalWidth || source.width,
                    imageHeight: source.naturalHeight || source.height,
                    filterPatch: patch,
                    createCanvas: createStudioPixelEditCanvas,
                    serializeMask: async (mask) =>
                      encodeStudioPixelEditResultPng(mask as HTMLCanvasElement),
                    mutationLocked:
                      activeSurfaceReviewLocked || isEffectivelyLocked(target, groups),
                  });
                  if (!result.ok) {
                    setError(result.message);
                    return;
                  }
                  const committed = commitStudioSelectionFilterMaskTransaction(
                    result.transaction,
                    (transaction) => patchEl(
                      transaction.targetId,
                      transaction.patch as Partial<El>,
                    ),
                  );
                  if (!committed) return;
                  watchAppliedFilter?.({ ...target, ...result.transaction.patch });
                  setStudioFilterPreview(null);
                  setLastStudioFilterDraft(draft);
                  setError(null);
                  setStudioFilterSession(null);
                  announceDrawingShortcut(
                    applicationScope === "inside"
                      ? "필터를 선택 안에 적용하고 마스크로 저장했어요"
                      : "필터를 선택 밖에 적용하고 마스크로 저장했어요",
                  );
                } catch (selectionFilterError) {
                  setError(
                    selectionFilterError instanceof Error
                      ? selectionFilterError.message
                      : editorShellStatusText("studio.editorShellStatus.session.filterMaskCreateFailed", "선택 영역 필터 마스크를 만들지 못했습니다."),
                  );
                } finally {
                  if (applySessionId === studioFilterSessionIdRef.current) {
                    studioFilterApplyBusyRef.current = false;
                    setStudioFilterApplying(false);
                  }
                }
                return;
              }
              studioFilterApplyBusyRef.current = true;
              setStudioFilterApplying(true);
              const applySessionId = studioFilterSession.id;
              let resolveRasterError: ((cause: unknown) => string | null) | undefined;
              try {
                if (
                  applySessionId !== studioFilterSessionIdRef.current ||
                  studioFilterSession.pageId !== currentPageIdRef.current ||
                  studioFilterSession.historyIndex !== pagesHiRef.current ||
                  !canApplyStudioMutation(studioFilterSession.mutationTicket)
                ) {
                  closeStudioFilterDialog();
                  return;
                }
                if (!hasActiveImageFilters(patch)) {
                  closeStudioFilterDialog();
                  announceDrawingShortcut(bt("보정값이 중립이라 원고를 그대로 두었어요.", "The settings are neutral. Your artwork is unchanged."));
                  return;
                }
                const rasterRuntime = await import("../render/studio-raster-edit-preparation");
                const { resolveStudioRasterEditReason, resolveStudioRasterEditErrorFromCause } = await import("../status-i18n/studio-producer-error-i18n-exports-raster");
                resolveRasterError = resolveStudioRasterEditErrorFromCause;
                if (applySessionId !== studioFilterSessionIdRef.current) return;
                const currentContext = currentStudioFilterPageRasterContext(
                  studioFilterSession.plan.name,
                  rasterRuntime,
                  replacementSourceId,
                );
                const composite = {
                  ...studioFilterSession.image,
                  ...patch,
                  locked: false,
                  noClip: true,
                } as ImageEl & El;
                const applied = rasterRuntime.applyStudioEditableRasterCopy({
                  plan: studioFilterSession.plan,
                  current: currentContext.input,
                  composite,
                  destinationElements: currentContext.destinationElements,
                });
                if (!applied.ok) {
                  setError(resolveStudioRasterEditReason(applied.reason));
                  closeStudioFilterDialog();
                  return;
                }
                if (
                  applySessionId !== studioFilterSessionIdRef.current ||
                  studioFilterSession.pageId !== currentPageIdRef.current ||
                  studioFilterSession.historyIndex !== pagesHiRef.current ||
                  !canApplyStudioMutation(studioFilterSession.mutationTicket)
                ) {
                  closeStudioFilterDialog();
                  return;
                }
                if (!commit(applied.elements, undefined, studioFilterSession.pageId)) return;
                setMarqueeIds([]);
                setSelectedId(composite.id);
                watchAppliedFilter?.(composite);
                setTool("select");
                setStudioFilterPreview(null);
                setLastStudioFilterDraft(draft);
                setStudioFilterSession(null);
                setError(null);
                announceDrawingShortcut(replacementSourceId
                  ? bt("선택한 레이어에 필터를 적용했어요. 원본 레이어는 숨겨 두었어요.", "Filter applied to the selected layer. The original layer is hidden.")
                  : "원본을 보존한 페이지 필터 레이어를 추가했어요");
              } catch (filterApplyError) {
                setError(
                  filterApplyError instanceof Error
                    ? (resolveRasterError?.(filterApplyError) ?? filterApplyError.message)
                    : editorShellStatusText("studio.editorShellStatus.session.filterLayerApplyFailed", "페이지 필터 레이어를 적용하지 못했습니다.")
                );
              } finally {
                if (applySessionId === studioFilterSessionIdRef.current) {
                  studioFilterApplyBusyRef.current = false;
                  setStudioFilterApplying(false);
                }
              }
            }}
            onClose={closeStudioFilterDialog}
          />
        </Suspense>
      ) : null}

      {studioLayerLiftUi.open ? (
        <Suspense fallback={null}>
          <StudioLayerLiftDialog
            open
            activeKey={studioLayerLiftUi.activeKey}
            sourceName={studioLayerLiftUi.sourceName}
            sourceSrc={studioLayerLiftUi.sourceSrc}
            phase={studioLayerLiftUi.phase}
            progressLabel={studioLayerLiftUi.progressLabel}
            error={studioLayerLiftUi.error}
            preview={studioLayerLiftUi.preview}
            options={studioLayerLiftOptions}
            generalSubjectAvailable={studioLayerLiftGeneralSubjectAvailable}
            mutationLocked={studioLayerLiftDisabledReason !== null}
            mutationLockReason={studioLayerLiftDisabledReason}
            onOptionsChange={setStudioLayerLiftOptions}
            onAnalyze={() => {
              const sourceId = studioLayerLiftUiRef.current.sourceId;
              if (sourceId) {
                void runStudioLayerLiftAnalysis(
                  sourceId,
                  studioLayerLiftOptions,
                );
              }
            }}
            onCorrectionCommit={correctStudioLayerLift}
            onApply={() => void applyStudioLayerLift()}
            onCancel={closeStudioLayerLift}
          />
        </Suspense>
      ) : null}
    </>
  );
}
