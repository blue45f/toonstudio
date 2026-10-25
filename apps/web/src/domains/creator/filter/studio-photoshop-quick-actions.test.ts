import { describe, expect, it } from "vitest";
import {
  applyPhotoshopAdjustmentPresetV2ToRgba,
  evaluatePhotoshopQuickActionEnablement,
  executePhotoshopQuickAction,
  getPhotoshopQuickActionById,
  PHOTOSHOP_ADJUSTMENT_PRESETS_V2,
  PHOTOSHOP_QUICK_ACTION_CATEGORIES,
  revertPhotoshopQuickAction,
  type PhotoshopQuickActionLayerContext,
  type PhotoshopQuickActionSessionState,
} from "./studio-photoshop-quick-actions";

describe("studio-photoshop-quick-actions", () => {
  it("4개 퀵 액션 카테고리(background, auto, lighting, stylize)와 13개 액션을 정의한다", () => {
    expect(PHOTOSHOP_QUICK_ACTION_CATEGORIES).toHaveLength(4);
    const allActions = PHOTOSHOP_QUICK_ACTION_CATEGORIES.flatMap(
      (cat) => cat.actions,
    );
    expect(allActions).toHaveLength(13);

    const blurBg = getPhotoshopQuickActionById("blur_background");
    expect(blurBg.prepareLayer).toEqual({ duplicate: true, applyMask: true });
    expect(blurBg.defaultOpacity).toBe(50);
    expect(blurBg.renamePreviousLayer).toBe("Background");
    expect(blurBg.hidePreviousLayer).toBe(true);
    expect(blurBg.onlyForImageLayer).toBe(true);
    expect(blurBg.needsToken).toBe(true);
  });

  it("QuickActionsManager.updateQuickActionsEnablement 결정 트리를 정확히 재현한다", () => {
    const baseContext: PhotoshopQuickActionLayerContext = {
      hasMultipleLayersSelected: false,
      viewOnly: false,
      noLayerSelected: false,
      isImageLayerSelected: true,
      isSmartObjectLayerSelected: false,
      isAdjustmentLayerSelected: false,
      isGroupLayerSelected: false,
      isLayerClipped: false,
      isLayerVisible: true,
      layerHasContent: true,
    };

    const removeBg = getPhotoshopQuickActionById("remove_background");
    expect(evaluatePhotoshopQuickActionEnablement(baseContext, removeBg)).toEqual({
      actionId: "remove_background",
      disabled: false,
    });

    expect(
      evaluatePhotoshopQuickActionEnablement(
        { ...baseContext, hasMultipleLayersSelected: true },
        removeBg,
      ).disabledReason,
    ).toBe("multiselection");

    expect(
      evaluatePhotoshopQuickActionEnablement(
        { ...baseContext, viewOnly: true },
        removeBg,
      ).disabledReason,
    ).toBe("viewonly");

    expect(
      evaluatePhotoshopQuickActionEnablement(
        { ...baseContext, isImageLayerSelected: false },
        removeBg,
      ).disabledReason,
    ).toBe("layerkind");

    expect(
      evaluatePhotoshopQuickActionEnablement(
        { ...baseContext, isLayerClipped: true },
        removeBg,
      ).disabledReason,
    ).toBe("layerkind");

    expect(
      evaluatePhotoshopQuickActionEnablement(
        { ...baseContext, isLayerVisible: false },
        removeBg,
      ).disabledReason,
    ).toBe("layervisibility");

    expect(
      evaluatePhotoshopQuickActionEnablement(
        { ...baseContext, layerHasContent: false },
        removeBg,
      ).disabledReason,
    ).toBe("layercontent");
  });

  it("blur_background 실행 시 레이어 복제·마스크 적용·이전 레이어 숨김/Background 이름 변경·가역적 복원을 수행한다", () => {
    const initial: PhotoshopQuickActionSessionState = {
      historyEntryId: "hist-1",
      selectedLayerId: "layer-1",
      layers: [
        {
          id: "layer-1",
          name: "원본 인물 컷",
          kind: "smart_object",
          visible: true,
          opacity: 100,
          hasUserMask: true,
          maskApplied: false,
        },
      ],
    };

    const executed = executePhotoshopQuickAction(initial, "blur_background");
    expect(executed.appliedOpacity).toBe(50);
    expect(executed.executedBatchPlayCommands).toContain(
      "atn:quick_actions/duplicate_and_rasterize.atn",
    );
    expect(executed.executedBatchPlayCommands).toContain(
      "atn:quick_actions/apply_layer_mask.atn",
    );
    expect(executed.state.layers).toHaveLength(2);
    expect(executed.state.layers[0]?.name).toBe("Background");
    expect(executed.state.layers[0]?.visible).toBe(false);
    expect(executed.state.layers[1]?.kind).toBe("pixel");
    expect(executed.state.layers[1]?.maskApplied).toBe(true);
    expect(executed.state.layers[1]?.opacity).toBe(50);

    const reverted = revertPhotoshopQuickAction(executed.state);
    expect(reverted.historyEntryId).toBe("hist-1");
    expect(reverted.selectedLayerId).toBe("layer-1");
    expect(reverted.layers).toHaveLength(1);
    expect(reverted.layers[0]?.name).toBe("원본 인물 컷");
  });

  it("31개 Adjustment Presets V2 전체를 RGBA 픽셀 버퍼에 무결성 있게 적용한다", () => {
    expect(PHOTOSHOP_ADJUSTMENT_PRESETS_V2.length).toBeGreaterThanOrEqual(30);
    const src = new Uint8ClampedArray([100, 140, 180, 240, 200, 90, 60, 128]);
    for (const preset of PHOTOSHOP_ADJUSTMENT_PRESETS_V2) {
      const out = applyPhotoshopAdjustmentPresetV2ToRgba(src, preset.id);
      expect(out.length).toBe(src.length);
      expect(out[3]).toBe(240);
      expect(out[7]).toBe(128);
      expect([...out].every((v) => Number.isFinite(v) && v >= 0 && v <= 255)).toBe(
        true,
      );
    }
  });
});
