/* Extracted Living Ink & Hokusai specialist release handlers from studio-cuttoon-stage-pointers-release.ts. */
"use no memo";

import {
  admitStudioScopedCanonicalImage,
  scopedStudioCanonicalImageId,
  scopedStudioCanonicalMutationLocked,
  scopedStudioLivingInkReplacement,
} from "../studio-collab/studio-scoped-canonical-image";
import { studioLiveBrushEffectiveDiameter } from "../brush/studio-draw-rendering";
import { CANVAS_W } from "../studio-assets";
import type { StudioHokusaiLiveCanonicalResult } from "../render/studio-hokusai-live-brush-runtime";
import { createStudioHokusaiLiveCanonicalTransaction } from "../render/studio-hokusai-live-brush-transaction";
import { studioHokusaiSourceRevision } from "../render/studio-hokusai-natural-media-contract";
import { uid } from "../studio-id";
import {
  createStudioLivingInkCanonicalTransaction,
  studioLivingInkReceiptReplayToken,
  type StudioLivingInkCanonicalResult,
} from "../studio-living-ink-document";
import { studioLivingInkCoverageIntersectsStroke } from "../studio-living-ink-overlay";
import type { StudioLivingInkFinishedWork } from "../studio-living-ink-studio-coordinator";
import { claimStudioStrokeSurfaceLifecycle } from "../brush/studio-stroke-surface-route";
import type { DrawEl, El, ImageEl } from "../studio-element-model";
import type { PageState } from "../studio-page-state";
import type {
  StudioCuttoonStagePointersHost,
  StudioHokusaiPinnedLiveStroke,
  StudioLivingInkPinnedStroke,
} from "./studio-cuttoon-stage-pointers-types";
import type { StudioCuttoonStagePointersApi } from "./studio-cuttoon-stage-pointers-api";

export interface StudioReleaseSpecialistFallbackMessages {
  readonly physicsFrameUnverified: () => string;
  readonly textureResultUnverified: () => string;
}

export function bindStudioCuttoonStagePointersReleaseSpecialist(
  h: StudioCuttoonStagePointersHost,
  api: StudioCuttoonStagePointersApi,
  fallbackMessages: StudioReleaseSpecialistFallbackMessages,
) {
  const {
    activeSurfaceReviewLockedRef,
    announceDrawingShortcut,
    armStudioLivingInkCanonicalHandoffTimeout,
    clearStudioHokusaiRetainedDraftPixels,
    clearStudioLivingInkRetainedDraftPixels,
    collaborationAccessRef,
    commit,
    currentPageIdRef,
    hokusaiLiveFinalizingRef,
    hokusaiLiveOverlaySurfaceRef,
    hokusaiLiveOverlayVisibleRef,
    hokusaiLiveStrokeRef,
    liveDraftDirectRef,
    liveDraftLayerRef,
    liveDraftPendingRef,
    liveDraftVisualRef,
    livingInkAcceptedAuthorityRef,
    livingInkCanonicalHandoffRef,
    livingInkConfigRef,
    livingInkCoordinatorRef,
    livingInkFinalizingRef,
    livingInkOverlaySurfaceRef,
    livingInkOverlayVisibleRef,
    livingInkRejectedAuthorityRef,
    livingInkStrokeRef,
    livingInkWaterNoopStrokeIdsRef,
    onStudioLivingInkOverlayPresented,
    pagesHiRef,
    pagesHistoryRef,
    releaseLivingInkInputPointer,
    setError,
    setLivingInkBusy,
    setLivingInkScope,
    setSelectedId,
    studioStrokeSurfaceRouteRef,
    canvasH,
    pages,
  } = h;

  function studioPageElementsFromHistory(pageId: string): El[] {
    const history = pagesHistoryRef.current;
    const index = Math.max(0, Math.min(pagesHiRef.current, Math.max(0, history.length - 1)));
    return [
      ...(
        history[index]?.find((page: PageState) => page.id === pageId)?.elements
        ?? pages.find((page: PageState) => page.id === pageId)?.elements
        ?? []
      ),
    ];
  }

  function withStudioHokusaiSource(baseElements: readonly El[], source: DrawEl): El[] {
    const next = [...baseElements];
    const index = next.findIndex(({ id }) => id === source.id);
    if (index >= 0) next[index] = source;
    else next.push(source);
    return next;
  }

  function rejectStudioHokusaiFailedStroke(
    state: StudioHokusaiPinnedLiveStroke,
    reason: string,
  ): void {
    state.failed = true;
    state.abortController.abort();
    hokusaiLiveOverlaySurfaceRef.current?.renderer.clear();
    hokusaiLiveOverlayVisibleRef.current = false;
    if (hokusaiLiveStrokeRef.current === state) hokusaiLiveStrokeRef.current = null;
    hokusaiLiveFinalizingRef.current = false;
    studioStrokeSurfaceRouteRef.current = null;
    clearStudioHokusaiRetainedDraftPixels(state);
    liveDraftLayerRef.current?.drawScene();
    announceDrawingShortcut("Hokusai 자연매체 획 취소 · 문서 보존");
    setError(
      `선택한 Hokusai 엔진이 결과를 확정하지 못해 획을 저장하지 않았습니다. 다른 렌더러로 자동 전환하지 않습니다. ${reason}`,
    );
  }

  function completeStudioLivingInkRejectedNoop(strokeId: string, reason: string): void {
    livingInkWaterNoopStrokeIdsRef.current.delete(strokeId);
    const state = livingInkStrokeRef.current;
    if (state?.strokeId === strokeId) livingInkStrokeRef.current = null;
    livingInkOverlaySurfaceRef.current?.renderer.clear();
    if (state) clearStudioLivingInkRetainedDraftPixels(state);
    livingInkOverlayVisibleRef.current = false;
    livingInkFinalizingRef.current = false;
    studioStrokeSurfaceRouteRef.current = null;
    liveDraftVisualRef.current = null;
    liveDraftPendingRef.current = null;
    liveDraftDirectRef.current = false;
    setLivingInkBusy(false);
    void livingInkCoordinatorRef.current.cancelStroke(strokeId);
    liveDraftLayerRef.current?.drawScene();
    announceDrawingShortcut("Living Ink 시작 거부 · 문서 보존");
    setError(`선택한 Living Ink 작업을 시작하지 않아 문서를 변경하지 않았습니다. ${reason}`);
  }

  function rejectStudioLivingInkFailedStroke(
    state: StudioLivingInkPinnedStroke,
    reason: string,
  ): void {
    const cancelClaim = claimStudioStrokeSurfaceLifecycle(state.route, {
      phase: "cancel",
      routeKey: state.route.routeKey,
      strokeId: state.strokeId,
      kind: "living-ink",
    });
    if (cancelClaim.status !== "owned") return;
    livingInkWaterNoopStrokeIdsRef.current.delete(state.strokeId);
    livingInkOverlaySurfaceRef.current?.renderer.clear();
    clearStudioLivingInkRetainedDraftPixels(state);
    livingInkOverlayVisibleRef.current = false;
    if (livingInkStrokeRef.current === state) livingInkStrokeRef.current = null;
    releaseLivingInkInputPointer();
    livingInkFinalizingRef.current = false;
    studioStrokeSurfaceRouteRef.current = null;
    setLivingInkBusy(false);
    void livingInkCoordinatorRef.current.cancelStroke(state.strokeId);
    liveDraftLayerRef.current?.drawScene();
    announceDrawingShortcut("Living Ink 획 취소 · 문서 보존");
    setError(
      `선택한 Living Ink 엔진이 결과를 확정하지 못해 획을 저장하지 않았습니다. 다른 렌더러로 자동 전환하지 않습니다. ${reason}`,
    );
  }

  async function finishStudioLivingInkStroke(
    state: StudioLivingInkPinnedStroke,
    finished: DrawEl,
  ): Promise<void> {
    let work: StudioLivingInkFinishedWork | null = null;
    try {
      const claim = claimStudioStrokeSurfaceLifecycle(state.route, {
        phase: "finish",
        routeKey: state.route.routeKey,
        strokeId: state.strokeId,
        kind: "living-ink",
      });
      if (claim.status !== "owned") throw new Error("pointer-down 물리 route 소유권이 바뀌었습니다.");
      const surface = livingInkOverlaySurfaceRef.current;
      const config = livingInkConfigRef.current;
      if (
        !surface
        || surface.binding.surfaceKey !== state.surfaceKey
        || !config
        || livingInkStrokeRef.current !== state
      ) {
        throw new Error("Living Ink 최종 표면이 캔버스 좌표계와 일치하지 않습니다.");
      }
      const finishedWork: StudioLivingInkFinishedWork =
        await livingInkCoordinatorRef.current.finishStroke(state.strokeId, state.route.routeKey);
      work = finishedWork;
      const presentation = await surface.renderer.presentCanonical(
        finishedWork.frame,
        state.route.routeKey,
        surface.binding.projection,
        (receipt: unknown) => onStudioLivingInkOverlayPresented(state, receipt),
      );
      if (
        !studioLivingInkCoverageIntersectsStroke({
          coverage: presentation.alphaCoverage,
          outputWidth: presentation.width,
          outputHeight: presentation.height,
          documentWidth: CANVAS_W,
          documentHeight: canvasH,
          points: finished.points,
          diameter: studioLiveBrushEffectiveDiameter(finished),
        })
      ) {
        throw new Error(
          "Living Ink canonical PNG가 원본 획의 위치에 표시 가능한 안료를 만들지 못했습니다.",
        );
      }
      const result: StudioLivingInkCanonicalResult = Object.freeze({
        src: presentation.src,
        pngSha256: presentation.pngSha256,
        routeKey: state.route.routeKey,
        pageId: state.pageId,
        documentWidth: CANVAS_W,
        documentHeight: canvasH,
        config,
        journal: finishedWork.journal,
        finalExecutionReceipt: finishedWork.frame.receipt,
      });
      const baseElements = withStudioHokusaiSource(
        studioPageElementsFromHistory(state.pageId),
        finished,
      );
      const existingImage = baseElements.find(
        (element) =>
          element.type === "image"
          && element.livingInkReceipt?.pageId === state.pageId
          && element.frameClipId === finished.frameClipId,
      );
      const transaction = createStudioLivingInkCanonicalTransaction({
        elements: baseElements,
        sourceElementId: finished.id,
        canonicalImageId: scopedStudioCanonicalImageId(
          collaborationAccessRef,
          finished.id,
          collaborationAccessRef.current.locked ? uid() : existingImage?.id ?? uid(),
        ),
        replaceExistingImageId: scopedStudioLivingInkReplacement(
          collaborationAccessRef,
          baseElements,
          state.pageId,
          finished.frameClipId,
        ),
        result,
        mutationLocked: scopedStudioCanonicalMutationLocked(
          collaborationAccessRef,
          finished.id,
          activeSurfaceReviewLockedRef.current,
          h.scopedCanvasBoundaryRef,
        ),
      });
      if (!transaction.ok) throw new Error(transaction.message);
      const handoffClaim = claimStudioStrokeSurfaceLifecycle(state.route, {
        phase: "handoff",
        routeKey: state.route.routeKey,
        strokeId: state.strokeId,
        kind: "living-ink",
      });
      if (handoffClaim.status !== "owned") {
        throw new Error("canonical 이미지 인계 route가 pointer-down 영수증과 다릅니다.");
      }
      const committed = commit(
        await admitStudioScopedCanonicalImage(
          collaborationAccessRef,
          finished.id,
          transaction.transaction.canonicalImageId,
          transaction.transaction.nextElements,
        ),
        undefined,
        state.pageId,
      );
      if (!committed) throw new Error("문서가 잠겨 Living Ink 단일 트랜잭션을 확정하지 못했습니다.");
      state.canonicalImageId = transaction.transaction.canonicalImageId;
      state.canonicalPngHash = presentation.pngSha256;
      state.transactionCommitted = true;
      livingInkCanonicalHandoffRef.current = Object.freeze({
        token: `${state.route.routeKey}:canonical`,
        kind: "stroke",
        pageId: state.pageId,
        imageId: transaction.transaction.canonicalImageId,
        pngHash: presentation.pngSha256,
        strokeId: state.strokeId,
      });
      armStudioLivingInkCanonicalHandoffTimeout();
      const committedCanonicalImage = transaction.transaction.nextElements.find(
        (element): element is ImageEl =>
          element.type === "image" && element.id === transaction.transaction.canonicalImageId,
      );
      const committedAuthority = committedCanonicalImage?.livingInkReceipt
        ? Object.freeze({
            pageId: state.pageId,
            replayToken: studioLivingInkReceiptReplayToken(
              committedCanonicalImage.livingInkReceipt,
            ),
            canonicalSrc: committedCanonicalImage.src,
          })
        : null;
      if (!livingInkCoordinatorRef.current.acceptFinishedStroke(work)) {
        livingInkAcceptedAuthorityRef.current = null;
        livingInkRejectedAuthorityRef.current = committedAuthority;
        const message =
          "수채 번짐 PNG는 저장됐지만 Worker 상태 고정에 실패해, 저장 영수증 재검증 전에는 물리 편집을 비활성화합니다.";
        setError(message);
        void livingInkCoordinatorRef.current.failClosed(message);
      } else {
        livingInkRejectedAuthorityRef.current = null;
        livingInkAcceptedAuthorityRef.current = committedAuthority;
      }
      if (currentPageIdRef.current === state.pageId) {
        setSelectedId(null);
        setLivingInkScope("all");
      }
      announceDrawingShortcut("수채 번짐 · 입력·놓을 때 물리 계산, 손을 떼면 2초 고정 settle");
    } catch (cause) {
      if (state.transactionCommitted || livingInkStrokeRef.current !== state) return;
      if (work) {
        await livingInkCoordinatorRef.current.rollbackFinishedStroke(work).catch(() => undefined);
      }
      rejectStudioLivingInkFailedStroke(
        state,
        cause instanceof Error ? cause.message : fallbackMessages.physicsFrameUnverified(),
      );
    }
  }

  async function finishStudioHokusaiLiveStroke(
    state: StudioHokusaiPinnedLiveStroke,
    finished: DrawEl,
  ): Promise<void> {
    try {
      const session = state.session ?? (await state.beginPromise);
      if (!session || state.failed || hokusaiLiveStrokeRef.current !== state) {
        throw new Error("라이브 자연매체 세션이 최종화 전에 해제되었습니다.");
      }
      state.session = session;
      if (state.queuedSamples.length > 0) {
        const queued = state.queuedSamples;
        state.queuedSamples = [];
        state.lastAppendedSequence = session.append(queued);
      }
      const result: StudioHokusaiLiveCanonicalResult = await session.finish();
      if (state.failed || hokusaiLiveStrokeRef.current !== state) {
        throw new Error("최종 질감 결과가 도착하기 전에 문서 표면이 변경되었습니다.");
      }
      const expectedSourceRevision = studioHokusaiSourceRevision(finished);
      const transaction = createStudioHokusaiLiveCanonicalTransaction({
        elements: withStudioHokusaiSource(studioPageElementsFromHistory(state.pageId), finished),
        sourceElementId: finished.id,
        expectedSourceRevision,
        canonicalImageId: scopedStudioCanonicalImageId(
          collaborationAccessRef,
          finished.id,
          uid(),
        ),
        result,
        mutationLocked: scopedStudioCanonicalMutationLocked(
          collaborationAccessRef,
          finished.id,
          activeSurfaceReviewLockedRef.current,
          h.scopedCanvasBoundaryRef,
        ),
      });
      if (!transaction.ok) throw new Error(transaction.message);
      state.canonicalImageId = transaction.transaction.canonicalImageId;
      state.canonicalPngHash = result.receipt.pngHash;
      state.transactionCommitted = true;
      const committed = commit(
        await admitStudioScopedCanonicalImage(
          collaborationAccessRef,
          finished.id,
          transaction.transaction.canonicalImageId,
          transaction.transaction.nextElements,
        ),
        undefined,
        state.pageId,
      );
      if (!committed) {
        state.transactionCommitted = false;
        state.canonicalImageId = null;
        state.canonicalPngHash = null;
        throw new Error(
          "문서가 저장 중이거나 잠겨 있어 단일 Hokusai 트랜잭션을 확정하지 못했습니다.",
        );
      }
      if (currentPageIdRef.current === state.pageId) {
        setSelectedId(null);
      }
      announceDrawingShortcut("Hokusai 자연매체 획 저장 완료");
    } catch (cause) {
      if (
        (state.abortController.signal.aborted && hokusaiLiveStrokeRef.current !== state)
        || state.transactionCommitted
      ) {
        return;
      }
      rejectStudioHokusaiFailedStroke(
        state,
        cause instanceof Error ? cause.message : fallbackMessages.textureResultUnverified(),
      );
    }
  }

  api.studioPageElementsFromHistory = studioPageElementsFromHistory;
  api.withStudioHokusaiSource = withStudioHokusaiSource;
  api.rejectStudioHokusaiFailedStroke = rejectStudioHokusaiFailedStroke;
  api.completeStudioLivingInkRejectedNoop = completeStudioLivingInkRejectedNoop;
  api.rejectStudioLivingInkFailedStroke = rejectStudioLivingInkFailedStroke;
  api.finishStudioLivingInkStroke = finishStudioLivingInkStroke;
  api.finishStudioHokusaiLiveStroke = finishStudioHokusaiLiveStroke;
}
