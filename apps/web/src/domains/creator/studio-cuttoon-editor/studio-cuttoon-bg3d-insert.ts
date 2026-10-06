/*
 * 3D 배경 렌더 이미지를 캔버스 요소로 적용하는 삽입 어댑터.
 * StudioCuttoonEditorHost에서 추출한 어댑터 — 호스트가 상태·핸들러 가방을 넘기고,
 * 이 모듈은 그 가방에만 의존한다(추출 전 클로저와 동일 의미).
 */
import { planStudioBg3dLtDetachComposite, planStudioBg3dLtDrawingAssist, planStudioBg3dRealtimeMergedApply, planStudioBg3dSharedCharacterVisibility, planStudioBg3dSharedStageMutation, resolveStudioBg3dCapturedCharacterPlacements, resolveStudioBg3dLinkedRenderState, resolveStudioBg3dLtLinkedScene } from "../bg3d/studio-bg3d-lt-apply";
import { planStudioBg3dLtLayers } from "../bg3d/studio-bg3d-lt-layer-plan";
import { attachStudioBg3dMagicFilterMaskToLtPlan } from "../bg3d/studio-bg3d-magic-layer-attach";
import type { StudioBg3dSceneDocument } from "../bg3d/studio-bg3d-scene-document";
import { expectStudioRasterImagePresentation } from "../render/studio-raster-image-presentation";
import type { StudioBackground3DInsertResult } from "../scene-3d/studio-3d-insert-contract";
import { mapStudioBg3dPerspectiveGuidesToAnchor } from "../scene-3d/studio-3d-insert-controller";
import { CANVAS_W } from "../studio-assets";
import type { El } from "../studio-element-model";
import { uid } from "../studio-id";
import { createCanvasImageElement } from "../studio-image-placement";
import { isEffectivelyLocked } from "../studio-layers";
import { commitStudioLinked3dPreparedPass, prepareStudioLinked3dLinePass } from "../studio-linked-3d-pass-transaction";
import { detachStudioLinked3dCorrections, materializeStudioLinked3dLinePassLocator, removeStudioLinked3dRenderLinks, upsertStudioLinked3dRenderLink } from "../studio-linked-3d-render-document";
import { studioShared3dStageEntryAsDocument } from "../studio-shared-3d-stage-collection";

// The host is a mutable runtime bag by design; keep the dynamic seam isolated to this adapter.
type StudioBg3dInsertHost = Record<string, unknown>;

export function bindStudioBg3dRenderedImage(h: StudioBg3dInsertHost) {
  // This adapter intentionally preserves the host's runtime bag typing across the extraction seam.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const host = h as Record<string, any>;
  const {
    setError,
    setStatusNotice,
    elementById,
    groups,
    patchEl,
    canvasH,
    addEl,
    isRealtimeTeamSession,
    elements,
    activePage,
    bg3dDccSourceRef,
    commit,
    setSelectedId,
    setTool,
    announceDrawingShortcut,
    masterEditMode,
    pageEditLocked,
    currentStudioDrawingAssistDocument,
    bg3dDccShotMappingsRef,
    bg3dMutationTicketRef,
    canApplyStudioMutation,
    currentPageIdRef,
    authorizedWorkAssetScopeId,
    studioAuthUserId,
    studioCrdtDocumentRef,
    studioCrdtSceneRuntimeRef,
    studioCrdtOperationSyncReady,
    collaborationDocumentLocked,
    studioFilterMaskPublicationClockRef,
    studioFilterMaskPublicationGenerationRef,
    queueStudioBg3dMagicFilterMaskPublication,
    collaborationAccessRef,
    setDrawingAssistPreview,
  } = host;
  return async function applyBg3dRenderedImage(
    result: StudioBackground3DInsertResult,
    targetElementId?: string
  ): Promise<boolean> {
    setError(null);
    setStatusNotice(null);
    const anchorLayer = result.layers.at(-1);
    if (!anchorLayer) {
      setError("삽입할 3D LT 레이어가 없습니다.");
      return false;
    }
    /**
     * 문서 마스터용 자기완결 이미지 레이어. 마스터에는 분리 번들을 담을 그룹도 페이지별 Shared
     * Stage도 없으므로 래스터와 장면 원본만 남긴다. 실시간 페이지는 아래의 별도 원자 계획에서
     * 같은 병합 레이어에 안정적인 배경 앵커와 Shared Stage를 함께 결박한다.
     */
    function materializeBg3dMergedComposite(magicMaskMessage: string): boolean {
      if (result.magicFilterMask) {
        setError(magicMaskMessage);
        return false;
      }
      if (targetElementId) {
        const target = elementById.get(targetElementId);
        if (!target || target.type !== "image") {
          setError("다시 적용할 3D 배경 이미지를 찾지 못했습니다.");
          return false;
        }
        if (isEffectivelyLocked(target, groups)) {
          setError("잠긴 레이어예요. 레이어 잠금을 해제한 뒤 3D 장면을 다시 적용해 주세요.");
          return false;
        }
        if (!patchEl(targetElementId, {
          src: result.compositePngDataUrl,
          height: Math.max(1, Math.round(target.width * (result.height / result.width))),
          bg3dScene: result.bg3dScene,
          bg3dLtBundleId: undefined,
          bg3dLtRole: undefined,
          bg3dLtRenderMode: undefined,
          name: "3D LT 배경 · 병합",
        })) return false;
        // Match the other destructive raster replacements: browser verification must be able to
        // distinguish a successful document commit from the exact new PNG reaching the visible
        // Konva layer. The probe is absent in production, so this is otherwise a no-op.
        expectStudioRasterImagePresentation({
          elementId: targetElementId,
          src: result.compositePngDataUrl,
        });
        return true;
      }
      const mergedImage = createCanvasImageElement({
        id: uid(),
        src: result.compositePngDataUrl,
        canvasWidth: CANVAS_W,
        canvasHeight: canvasH,
        sourceWidth: result.width,
        sourceHeight: result.height,
      });
      if (!addEl({
        ...mergedImage,
        name: "3D LT 배경 · 병합",
        bg3dScene: result.bg3dScene,
      })) return false;
      expectStudioRasterImagePresentation({
        elementId: mergedImage.id,
        src: result.compositePngDataUrl,
      });
      return true;
    }

    // The separated LT raster bundle still stays out of a realtime room because its multiple pixel
    // bodies do not share one bounded CRDT/CAS receipt. The merged raster + embedded Scene remains
    // self-contained, while its page-local bundle identity and Shared Stage relationship are
    // committed atomically so selecting/reopening the background can resolve the character link.
    if (isRealtimeTeamSession) {
      const realtimePlan = planStudioBg3dRealtimeMergedApply({
        result,
        elements,
        groups,
        shared3dStage: activePage.shared3dStage,
        targetElementId,
        canvasHeight: canvasH,
        newElementId: uid(),
        allocatedBundleId: uid(),
        allocatedGroupId: uid(),
        dccSource: bg3dDccSourceRef.current,
      });
      if (!realtimePlan.ok) {
        setError(realtimePlan.message);
        return false;
      }
      if (!commit([...realtimePlan.nextElements], {
        groups: [...realtimePlan.nextGroups],
        shared3dStage: realtimePlan.nextShared3dStage,
      })) return false;
      setSelectedId(realtimePlan.anchorElementId);
      setTool("select");
      expectStudioRasterImagePresentation({
        elementId: realtimePlan.anchorElementId,
        src: result.compositePngDataUrl,
      });
      const sharedStageNotice = realtimePlan.sharedStageMutationKind === "unlink"
        ? " 캐릭터 공유 연결은 해제했어요."
        : realtimePlan.hiddenElementIds.length > 0
          ? ` 캐릭터 ${realtimePlan.hiddenElementIds.length}명과의 공유 연결도 함께 저장했어요.`
          : " 배경 전용 공유 장면으로 저장했어요.";
      setStatusNotice(
        `실시간 공동 편집이라 컬러·톤·선화를 한 레이어로 합쳐 추가했어요. 3D 장면 원본은 그대로 남아 다시 편집할 수 있어요.${sharedStageNotice}`,
      );
      if (realtimePlan.restoredElementIds.length > 0) {
        announceDrawingShortcut(
          `공유 캐릭터 원본 ${realtimePlan.restoredElementIds.length}명 복원`,
        );
      } else if (realtimePlan.hiddenElementIds.length > 0) {
        announceDrawingShortcut(
          `공유 캐릭터 ${realtimePlan.hiddenElementIds.length}명 합성 · 원본 레이어는 숨김 상태로 보존`,
        );
      }
      return true;
    }

    // 문서 마스터는 의도적으로 그룹을 지원하지 않는다. 이 표면에서는 분리 레이어를 거짓으로
    // 그룹화하지 않고 같은 LT 결과의 투명 합성 PNG를 사용하며, 장면 원본은 계속 재편집 가능하다.
    if (masterEditMode) {
      return materializeBg3dMergedComposite(
        "매직 레이어 마스크는 일반 페이지의 분리된 컬러·톤 레이어에서만 안전하게 만들 수 있어요. 문서 마스터를 닫고 새 3D 배경으로 추가해 주세요.",
      );
    }

    const linkedSceneResolution = resolveStudioBg3dLtLinkedScene({
      activePage,
      result,
      targetElementId,
      dccSource: bg3dDccSourceRef.current,
    });
    if (!linkedSceneResolution.ok) {
      setError(linkedSceneResolution.message);
      return false;
    }
    const { linkedScene, renderResult } = linkedSceneResolution;

    if (targetElementId && renderResult.magicFilterMask) {
      setError(
        "매직 레이어 마스크는 기존 3D 배경 업데이트에 합성하지 않아요. 새 3D 배경으로 추가해 주세요.",
      );
      return false;
    }

    const template = createCanvasImageElement({
      id: uid(),
      src: anchorLayer.pngDataUrl,
      canvasWidth: CANVAS_W,
      canvasHeight: canvasH,
      sourceWidth: renderResult.width,
      sourceHeight: renderResult.height,
    });
    const plan = planStudioBg3dLtLayers<El, StudioBg3dSceneDocument>({
      elements,
      groups,
      render: renderResult,
      targetElementId,
      pageLocked: pageEditLocked,
      allocations: {
        bundleId: uid(),
        groupId: uid(),
        elementIds: {
          color: uid(),
          tone: uid(),
          "texture-line": uid(),
          "main-line": uid(),
        },
      },
      newElementTemplate: template,
    });
    if (!plan.ok) {
      setError(plan.message);
      return false;
    }
    const detachResolution = planStudioBg3dLtDetachComposite({
      renderResult,
      plan,
      targetElementId,
      pageLocked: pageEditLocked,
    });
    if (!detachResolution.ok) {
      setError(detachResolution.message);
      return false;
    }
    const { detachEditableComposite, detachPlan } = detachResolution;
    const magicAttachment = detachPlan?.ok
      ? {
          ok: true as const,
          applied: false as const,
          targetElementId: null,
          nextElements: detachPlan.nextElements,
        }
      : attachStudioBg3dMagicFilterMaskToLtPlan({
          plan,
          insertResult: renderResult,
        });
    if (!magicAttachment.ok) {
      setError(magicAttachment.message);
      return false;
    }
    const materializedGroups = detachPlan?.ok ? detachPlan.nextGroups : plan.nextGroups;
    const capturedPlacements = resolveStudioBg3dCapturedCharacterPlacements({ renderResult });
    if (!capturedPlacements.ok) {
      setError(capturedPlacements.message);
      return false;
    }
    const { capturedCharacterElementIds, capturedCharacterPlacements } = capturedPlacements;
    const visibilityResolution = planStudioBg3dSharedCharacterVisibility({
      shared3dStage: activePage.shared3dStage,
      elements: magicAttachment.nextElements,
      capturedCharacterElementIds,
      groups,
    });
    if (!visibilityResolution.ok) {
      setError(visibilityResolution.message);
      return false;
    }
    const { currentStageCollection, sharedCharacterVisibility } = visibilityResolution;
    let nextElements = [...sharedCharacterVisibility.nextElements];
    const anchor = nextElements.find((element) => element.id === plan.anchorElementId);
    const mappedGuides = anchor?.type === "image"
      ? mapStudioBg3dPerspectiveGuidesToAnchor(renderResult.perspectiveGuides, anchor)
      : [];
    const nextDrawingAssist = planStudioBg3dLtDrawingAssist({
      mappedGuides,
      activePageId: activePage.id,
      currentStudioDrawingAssistDocument,
    });
    const stageMutationResolution = planStudioBg3dSharedStageMutation({
      currentStageCollection,
      bundleId: plan.bundleId,
      requestedMutationKind: renderResult.sharedStageMutation?.kind,
      nextElements,
      capturedCharacterElementIds,
      capturedCharacterPlacements,
      hiddenElementIds: sharedCharacterVisibility.hiddenElementIds,
      dccSource: bg3dDccSourceRef.current,
    });
    if (!stageMutationResolution.ok) {
      setError(stageMutationResolution.message);
      return false;
    }
    const { sharedStageMutationKind, stageMutation } = stageMutationResolution;
    nextElements = [...stageMutation.nextElements];
    const linkedRenderResolution = resolveStudioBg3dLinkedRenderState({
      linked3dRender: activePage.linked3dRender,
      activeShotId: linkedScene.activeShotId,
      dccShotMappings: bg3dDccShotMappingsRef.current,
    });
    if (!linkedRenderResolution.ok) {
      setError(linkedRenderResolution.message);
      return false;
    }
    const { currentLinkedRender, sourceShotId } = linkedRenderResolution;
    if (sharedStageMutationKind === "unlink") {
      const detachedElements = detachStudioLinked3dCorrections(nextElements, [plan.bundleId]);
      if (!detachedElements) {
        setError("연결 해제할 artist correction provenance가 손상되어 적용하지 않았어요.");
        return false;
      }
      nextElements = detachedElements;
      const nextLinkedRender = removeStudioLinked3dRenderLinks(
        currentLinkedRender,
        [plan.bundleId],
      );
      if (nextLinkedRender === null || !commit(nextElements, {
        groups: materializedGroups,
        shared3dStage: stageMutation.nextState,
        linked3dRender: nextLinkedRender,
        ...(nextDrawingAssist ? { drawingAssist: nextDrawingAssist } : {}),
      })) return false;
    } else if (!renderResult.layers.some(({ role }) => role === "main-line")) {
      // Tone/color-only LT output has no canonical line raster to persist. Preserve the visible
      // DrawEls, but explicitly detach their retired 3D provenance before removing the sidecar.
      const detachedElements = detachStudioLinked3dCorrections(nextElements, [plan.bundleId]);
      if (!detachedElements) {
        setError("line pass에서 분리할 artist correction provenance가 손상되어 적용하지 않았어요.");
        return false;
      }
      nextElements = detachedElements;
      const nextLinkedRender = removeStudioLinked3dRenderLinks(
        currentLinkedRender,
        [plan.bundleId],
      );
      if (nextLinkedRender === null || !commit(nextElements, {
        groups: materializedGroups,
        shared3dStage: stageMutation.nextState,
        linked3dRender: nextLinkedRender,
        ...(nextDrawingAssist ? { drawingAssist: nextDrawingAssist } : {}),
      })) return false;
    } else {
      const linkedStage = studioShared3dStageEntryAsDocument(
        stageMutation.nextState,
        plan.bundleId,
      );
      if (!linkedStage) {
        setError("canonical 3D Stage revision을 찾지 못해 line pass를 저장하지 않았어요.");
        return false;
      }
      try {
        const { acquireStudioLinked3dPassProductAuthority } = await import("../studio-linked-3d-pass-product-authority"
        );
        const authority = await acquireStudioLinked3dPassProductAuthority();
        const previousPass = currentLinkedRender?.links.find(
          ({ bundleId }) => bundleId === plan.bundleId,
        )?.passRevision;
        const prepared = await prepareStudioLinked3dLinePass({
          authority,
          sourceHash: linkedStage.background.sourceHash,
          scene: linkedScene,
          layers: renderResult.layers,
          previous: previousPass,
        });
        const durableElements = materializeStudioLinked3dLinePassLocator(
          nextElements,
          plan.bundleId,
          prepared.descriptor,
        );
        if (!durableElements) {
          setError("canonical line pass를 실제 Canvas main-line 레이어에 결박하지 못했어요.");
          return false;
        }
        const nextLinkedRender = upsertStudioLinked3dRenderLink({
          value: currentLinkedRender,
          bundleId: plan.bundleId,
          shotId: linkedScene.activeShotId!,
          ...(sourceShotId ? { sourceShotId } : {}),
          passRevision: prepared.descriptor,
          elements: durableElements,
          shared3dStage: stageMutation.nextState!,
        });
        if (!nextLinkedRender) {
          setError("Canvas line pass·3D Shot·artist correction 교차참조를 검증하지 못했어요.");
          return false;
        }
        const accepted = await commitStudioLinked3dPreparedPass({
          authority,
          ownerId: `studio-linked-3d-pass:${activePage.id}:${plan.bundleId}`,
          prepared,
          apply: () => {
            const mutationTicket = bg3dMutationTicketRef.current;
            if (
              !mutationTicket
              || !canApplyStudioMutation(mutationTicket)
              || currentPageIdRef.current !== activePage.id
            ) return false;
            // LT layers, Scene/Shot, Stage, correction reapplication/conflict projection, and CAS
            // receipt enter the existing pagesHistory/CRDT bridge as one undoable transition.
            return commit(durableElements, {
              groups: materializedGroups,
              shared3dStage: stageMutation.nextState,
              linked3dRender: nextLinkedRender,
              ...(nextDrawingAssist ? { drawingAssist: nextDrawingAssist } : {}),
            });
          },
        });
        if (!accepted) return false;
        nextElements = durableElements;
      } catch (cause) {
        setError(
          cause instanceof Error
            ? `연결형 3D line pass를 OPFS/CAS에 저장하지 못했습니다: ${cause.message}`
            : "연결형 3D line pass를 OPFS/CAS에 저장하지 못했습니다.",
        );
        return false;
      }
    }
    const magicMask = renderResult.magicFilterMask;
    const magicTarget = magicAttachment.applied
      ? nextElements.find((element) => element.id === magicAttachment.targetElementId)
      : null;
    const rasterWorkId = authorizedWorkAssetScopeId;
    const rasterActorId = studioAuthUserId;
    const rasterDocument = studioCrdtDocumentRef.current;
    const rasterRuntime = studioCrdtSceneRuntimeRef.current;
    if (
      magicAttachment.applied
      && magicMask
      && magicTarget?.type === "image"
      && rasterWorkId
      && rasterActorId
      && rasterDocument
      && rasterRuntime
      && studioCrdtOperationSyncReady
      && !collaborationDocumentLocked
    ) {
      const publicationGeneration = studioFilterMaskPublicationClockRef.current + 1;
      studioFilterMaskPublicationClockRef.current = publicationGeneration;
      studioFilterMaskPublicationGenerationRef.current.set(
        magicAttachment.targetElementId,
        publicationGeneration
      );
      queueStudioBg3dMagicFilterMaskPublication({
        pageId: activePage.id,
        layerId: magicTarget.groupId ?? "page-root",
        targetElementId: magicAttachment.targetElementId,
        mask: magicMask,
        workId: rasterWorkId,
        actorId: rasterActorId,
        document: rasterDocument,
        runtime: rasterRuntime,
        accessGeneration: collaborationAccessRef.current.accessGeneration,
        publicationGeneration,
      });
    }
    if (nextDrawingAssist) {
      setDrawingAssistPreview(null);
    }
    setSelectedId(plan.anchorElementId);
    setTool("select");
    if (detachEditableComposite) {
      announceDrawingShortcut(
        `3D 배경을 한 장으로 정리했어요 · 3D 원본 유지 · 캐릭터 원본 ${stageMutation.restoredElementIds.length}명 복원`,
      );
    } else if (sharedCharacterVisibility.hiddenElementIds.length > 0) {
      announceDrawingShortcut(
        `공유 캐릭터 ${sharedCharacterVisibility.hiddenElementIds.length}명 합성 · 원본 레이어는 숨김 상태로 보존`,
      );
    }
    return true;
  }
}
