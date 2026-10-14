/**
 * Tool-arming derivations extracted from StudioCuttoonEditorHost
 * (29k줄 호스트 단계적 분해 — 카탈로그(S3-12) 외 영역, BLUEPRINT §9의
 * "밖으로 빼는" 방식). Every function here is a verbatim transcription of
 * the boolean expressions the host used to inline: same operands, same
 * order, same short-circuit shape. The host passes render-time primitives
 * (including the raster-preparation ref read, resolved to a boolean at the
 * call site) and keeps every effect, ref write, and event handler.
 *
 * "Armed" means the canvas stage must intercept drags for that tool and
 * element drag / click-select transitions stay locked (crop·pixel-select와
 * 동일한 정책). Do not add policy here — this module only names the
 * existing policy so it can be unit-tested without mounting the host.
 */

export interface StudioSelectionMutationLockInput {
  readonly activeSurfaceReviewLocked: boolean;
  readonly selectedContentLockedByGroup: boolean;
  /** Non-null when the selected element is protected from destructive edits. */
  readonly selectedWorkAssetDestructiveEditReason: string | null;
}

export interface StudioSelectionMutationLocks {
  readonly selectedContentMutationLocked: boolean;
  readonly selectedWorkAssetMutationLocked: boolean;
  readonly selectedImageMutationLocked: boolean;
}

export function deriveStudioSelectionMutationLocks(
  input: StudioSelectionMutationLockInput,
): StudioSelectionMutationLocks {
  const selectedContentMutationLocked =
    input.activeSurfaceReviewLocked || input.selectedContentLockedByGroup;
  const selectedWorkAssetMutationLocked =
    input.selectedWorkAssetDestructiveEditReason !== null;
  return {
    selectedContentMutationLocked,
    selectedWorkAssetMutationLocked,
    selectedImageMutationLocked:
      selectedContentMutationLocked || selectedWorkAssetMutationLocked,
  };
}

export interface StudioPixelToolArmingInput {
  /** `pixelTool !== null` at the call site. */
  readonly pixelToolActive: boolean;
  readonly pixelBusy: boolean;
  /** `selected?.type === "image"` at the call site. */
  readonly selectedIsImage: boolean;
  readonly selectedImageMutationLocked: boolean;
  /** `pixelMarqueeRasterPreparationAbortRef.current !== null` at the call site. */
  readonly rasterPreparationPending: boolean;
  readonly activeSurfaceReviewLocked: boolean;
}

export interface StudioPixelToolArming {
  readonly pixelToolArmed: boolean;
  readonly pixelToolRasterPreparationArmed: boolean;
  readonly pixelToolAutoTargetArmed: boolean;
  readonly pixelToolGestureArmed: boolean;
}

export function deriveStudioPixelToolArming(
  input: StudioPixelToolArmingInput,
): StudioPixelToolArming {
  // 픽셀 선택 도구가 실제로 무장된 상태(이미지 요소 선택 + 도구 on).
  const pixelToolArmed =
    input.pixelToolActive &&
    !input.pixelBusy &&
    input.selectedIsImage &&
    !input.selectedImageMutationLocked;
  // A vector-only page can be rasterizing immediately after the user chooses
  // a pixel-selection tool. Keep that tool gesture-armed while the Worker
  // prepares the hidden-originals copy.
  const pixelToolRasterPreparationArmed =
    input.pixelToolActive &&
    input.pixelBusy &&
    input.rasterPreparationPending &&
    !input.selectedIsImage &&
    !input.activeSurfaceReviewLocked;
  // arm-anytime — 대상 이미지 없이 무장된 픽셀 선택 도구. 검토 잠금은 표면
  // 전체 잠금이라 여기서도 무장 불가.
  const pixelToolAutoTargetArmed =
    input.pixelToolActive &&
    !input.pixelBusy &&
    !input.selectedIsImage &&
    !input.activeSurfaceReviewLocked;
  // 캔버스 자식에는 세 무장 상태를 합쳐 넘긴다.
  return {
    pixelToolArmed,
    pixelToolRasterPreparationArmed,
    pixelToolAutoTargetArmed,
    pixelToolGestureArmed:
      pixelToolArmed || pixelToolAutoTargetArmed || pixelToolRasterPreparationArmed,
  };
}

export interface StudioImageToolArmingInput {
  /** `selected?.type === "image"` at the call site. */
  readonly selectedIsImage: boolean;
  readonly selectedImageMutationLocked: boolean;
  readonly smudgeActive: boolean;
  readonly smudgeBusy: boolean;
  readonly dodgeBurnActive: boolean;
  readonly dodgeBurnBusy: boolean;
  readonly wetMixActive: boolean;
  readonly wetMixBusy: boolean;
  readonly liquifyActive: boolean;
  readonly liquifyBusy: boolean;
  /** `healCloneTool !== null` at the call site. */
  readonly healCloneToolActive: boolean;
  readonly layerMaskPaintActive: boolean;
  readonly filterMaskPaintActive: boolean;
  readonly quickMaskActive: boolean;
  readonly historyBrushActive: boolean;
  readonly puppetWarpActive: boolean;
}

export interface StudioImageToolArming {
  readonly smudgeArmed: boolean;
  readonly dodgeBurnArmed: boolean;
  readonly wetMixArmed: boolean;
  readonly liquifyArmed: boolean;
  readonly healCloneArmed: boolean;
  readonly layerMaskPaintArmed: boolean;
  readonly filterMaskPaintArmed: boolean;
  readonly quickMaskArmed: boolean;
  readonly historyBrushArmed: boolean;
  readonly puppetWarpArmed: boolean;
}

export function deriveStudioImageToolArming(
  input: StudioImageToolArmingInput,
): StudioImageToolArming {
  const targetArmed = input.selectedIsImage && !input.selectedImageMutationLocked;
  return {
    smudgeArmed: input.smudgeActive && !input.smudgeBusy && targetArmed,
    dodgeBurnArmed: input.dodgeBurnActive && !input.dodgeBurnBusy && targetArmed,
    wetMixArmed: input.wetMixActive && !input.wetMixBusy && targetArmed,
    liquifyArmed: input.liquifyActive && !input.liquifyBusy && targetArmed,
    healCloneArmed: input.healCloneToolActive && targetArmed,
    layerMaskPaintArmed: input.layerMaskPaintActive && targetArmed,
    filterMaskPaintArmed: input.filterMaskPaintActive && targetArmed,
    quickMaskArmed: input.quickMaskActive && targetArmed,
    historyBrushArmed: input.historyBrushActive && targetArmed,
    // 퍼펫 워프 무장 — crop과 동일한 정책(무장 중 다른 스테이지 제스처·요소
    // 드래그/선택 전환을 막는다).
    puppetWarpArmed: input.puppetWarpActive && targetArmed,
  };
}
