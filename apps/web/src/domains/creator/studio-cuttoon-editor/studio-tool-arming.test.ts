import { describe, expect, it } from "vitest";

import {
  deriveStudioImageToolArming,
  deriveStudioPixelToolArming,
  deriveStudioSelectionMutationLocks,
  type StudioImageToolArmingInput,
  type StudioPixelToolArmingInput,
} from "./studio-tool-arming";

const pixelBase: StudioPixelToolArmingInput = {
  pixelToolActive: true,
  pixelBusy: false,
  selectedIsImage: true,
  selectedImageMutationLocked: false,
  rasterPreparationPending: false,
  activeSurfaceReviewLocked: false,
};

const imageBase: StudioImageToolArmingInput = {
  selectedIsImage: true,
  selectedImageMutationLocked: false,
  smudgeActive: false,
  smudgeBusy: false,
  dodgeBurnActive: false,
  dodgeBurnBusy: false,
  wetMixActive: false,
  wetMixBusy: false,
  liquifyActive: false,
  liquifyBusy: false,
  healCloneToolActive: false,
  layerMaskPaintActive: false,
  filterMaskPaintActive: false,
  quickMaskActive: false,
  historyBrushActive: false,
  puppetWarpActive: false,
};

describe("deriveStudioSelectionMutationLocks", () => {
  it("combines review lock and group lock into the content lock", () => {
    expect(
      deriveStudioSelectionMutationLocks({
        activeSurfaceReviewLocked: false,
        selectedContentLockedByGroup: false,
        selectedWorkAssetDestructiveEditReason: null,
      }),
    ).toEqual({
      selectedContentMutationLocked: false,
      selectedWorkAssetMutationLocked: false,
      selectedImageMutationLocked: false,
    });
    expect(
      deriveStudioSelectionMutationLocks({
        activeSurfaceReviewLocked: true,
        selectedContentLockedByGroup: false,
        selectedWorkAssetDestructiveEditReason: null,
      }).selectedImageMutationLocked,
    ).toBe(true);
    expect(
      deriveStudioSelectionMutationLocks({
        activeSurfaceReviewLocked: false,
        selectedContentLockedByGroup: true,
        selectedWorkAssetDestructiveEditReason: null,
      }).selectedContentMutationLocked,
    ).toBe(true);
  });

  it("treats any destructive-edit reason as the work-asset lock", () => {
    const locks = deriveStudioSelectionMutationLocks({
      activeSurfaceReviewLocked: false,
      selectedContentLockedByGroup: false,
      selectedWorkAssetDestructiveEditReason: "protected",
    });
    expect(locks.selectedWorkAssetMutationLocked).toBe(true);
    expect(locks.selectedImageMutationLocked).toBe(true);
    expect(locks.selectedContentMutationLocked).toBe(false);
  });
});

describe("deriveStudioPixelToolArming", () => {
  it("arms the direct tool only for an unlocked image while idle", () => {
    expect(deriveStudioPixelToolArming(pixelBase).pixelToolArmed).toBe(true);
    expect(
      deriveStudioPixelToolArming({ ...pixelBase, pixelBusy: true }).pixelToolArmed,
    ).toBe(false);
    expect(
      deriveStudioPixelToolArming({ ...pixelBase, selectedImageMutationLocked: true })
        .pixelToolArmed,
    ).toBe(false);
    expect(
      deriveStudioPixelToolArming({ ...pixelBase, pixelToolActive: false })
        .pixelToolGestureArmed,
    ).toBe(false);
  });

  it("keeps the gesture armed during raster preparation on a non-image selection", () => {
    const arming = deriveStudioPixelToolArming({
      ...pixelBase,
      pixelBusy: true,
      selectedIsImage: false,
      rasterPreparationPending: true,
    });
    expect(arming.pixelToolRasterPreparationArmed).toBe(true);
    expect(arming.pixelToolGestureArmed).toBe(true);
    expect(
      deriveStudioPixelToolArming({ ...pixelBase, pixelBusy: true, selectedIsImage: false })
        .pixelToolRasterPreparationArmed,
    ).toBe(false);
  });

  it("auto-target arms without an image but never under a review lock", () => {
    const arming = deriveStudioPixelToolArming({ ...pixelBase, selectedIsImage: false });
    expect(arming.pixelToolAutoTargetArmed).toBe(true);
    expect(arming.pixelToolArmed).toBe(false);
    expect(
      deriveStudioPixelToolArming({
        ...pixelBase,
        selectedIsImage: false,
        activeSurfaceReviewLocked: true,
      }).pixelToolGestureArmed,
    ).toBe(false);
  });
});

describe("deriveStudioImageToolArming", () => {
  it("arms a busy-gated tool only when active, idle, and the target is an unlocked image", () => {
    expect(
      deriveStudioImageToolArming({ ...imageBase, smudgeActive: true }).smudgeArmed,
    ).toBe(true);
    expect(
      deriveStudioImageToolArming({ ...imageBase, smudgeActive: true, smudgeBusy: true })
        .smudgeArmed,
    ).toBe(false);
    expect(
      deriveStudioImageToolArming({ ...imageBase, liquifyActive: true, selectedIsImage: false })
        .liquifyArmed,
    ).toBe(false);
    expect(
      deriveStudioImageToolArming({
        ...imageBase,
        wetMixActive: true,
        selectedImageMutationLocked: true,
      }).wetMixArmed,
    ).toBe(false);
  });

  it("arms the ungated tools from their active flag alone (plus the target gate)", () => {
    const arming = deriveStudioImageToolArming({
      ...imageBase,
      healCloneToolActive: true,
      layerMaskPaintActive: true,
      filterMaskPaintActive: true,
      quickMaskActive: true,
      historyBrushActive: true,
      puppetWarpActive: true,
    });
    expect(arming.healCloneArmed).toBe(true);
    expect(arming.layerMaskPaintArmed).toBe(true);
    expect(arming.filterMaskPaintArmed).toBe(true);
    expect(arming.quickMaskArmed).toBe(true);
    expect(arming.historyBrushArmed).toBe(true);
    expect(arming.puppetWarpArmed).toBe(true);
    expect(arming.dodgeBurnArmed).toBe(false);
  });
});
