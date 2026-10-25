import { describe, expect, it } from "vitest";
import {
  blendPhotoshopPixelsRgba,
  buildBlackAndWhiteAdjustmentAction,
  buildFreeTransformAction,
  buildGaussianBlurAction,
  buildGroupSelectedLayersAction,
  buildRevealSelectionMaskAction,
  executePhotoshopActionDescriptors,
  importPhotoshopNgeScene,
  PHOTOSHOP_BLEND_MODE_TO_8BIM,
  PHOTOSHOP_BLEND_MODES,
  resolvePhotoshopBlendMode,
} from "./studio-photoshop-action-descriptor";

describe("studio-photoshop-action-descriptor", () => {
  it("IntentHandler.Kt 25종 블렌드 모드와 8BIM 4바이트 코드 매핑 및 픽셀 합성을 수행한다", () => {
    expect(PHOTOSHOP_BLEND_MODES).toHaveLength(25);
    expect(resolvePhotoshopBlendMode("calculation_add")).toBe("plus");
    expect(resolvePhotoshopBlendMode("calculation_subtract")).toBe("minus");
    expect(resolvePhotoshopBlendMode("vLit")).toBe("vividlight");
    expect(PHOTOSHOP_BLEND_MODE_TO_8BIM.passThrough).toBe("pass");
    expect(PHOTOSHOP_BLEND_MODE_TO_8BIM.plus).toBe("add ");
    expect(PHOTOSHOP_BLEND_MODE_TO_8BIM.minus).toBe("fsub");

    const base = new Uint8ClampedArray([120, 80, 200, 255, 40, 190, 90, 200]);
    const top = new Uint8ClampedArray([200, 100, 50, 255, 90, 60, 220, 180]);

    for (const mode of PHOTOSHOP_BLEND_MODES) {
      const out = blendPhotoshopPixelsRgba(base, top, mode, 0.85);
      expect(out.length).toBe(base.length);
      expect([...out].every((v) => Number.isFinite(v) && v >= 0 && v <= 255)).toBe(
        true,
      );
    }
  });

  it("BatchPlay Action Descriptor(make, select, set, hide, transform, gaussianBlur)를 인터프리트한다", () => {
    const initial = {
      layers: [
        {
          id: "layer-base",
          name: "Base Cut",
          kind: "pixel" as const,
          visible: true,
          blendMode: "normal" as const,
          opacity: 100,
          hasRevealSelectionMask: false,
        },
      ],
      selectedLayerIds: ["layer-base"],
    };

    const descriptors = [
      buildRevealSelectionMaskAction(),
      buildFreeTransformAction({
        offsetX: 12,
        offsetY: -8,
        widthPct: 110,
        heightPct: 95,
        angleDeg: 15,
      }),
      buildGaussianBlurAction(6.5),
      buildBlackAndWhiteAdjustmentAction({
        red: 40,
        yellow: 60,
        green: 40,
        cyan: 60,
        blue: 20,
        magenta: 80,
      }),
      ...buildGroupSelectedLayersAction(["Base Cut", "blackAndWhite 2"], "Hero Cut Group"),
    ];

    const result = executePhotoshopActionDescriptors(initial, descriptors);
    expect(result.layers).toHaveLength(3);
    expect(result.layers[0]?.hasRevealSelectionMask).toBe(true);
    expect(result.layers[0]?.gaussianBlurRadiusPx).toBe(6.5);
    expect(result.layers[0]?.transform).toEqual({
      offsetX: 12,
      offsetY: -8,
      widthPct: 110,
      heightPct: 95,
      angleDeg: 15,
    });
    expect(result.layers[1]?.kind).toBe("adjustment");
    expect(result.layers[1]?.adjustmentType).toBe("blackAndWhite");
    expect(result.layers[2]?.kind).toBe("layerSection");
    expect(result.layers[2]?.name).toBe("Hero Cut Group");
    expect(result.layers[2]?.childLayerIds).toHaveLength(2);
  });

  it("importPhotoshopNgeScene이 멀티레이어 NGE 씬(선택 마스크·조정 필터·그룹화)을 임포트한다", () => {
    const imported = importPhotoshopNgeScene([
      {
        name: "Foreground Hero",
        blendMode: "calculation_add",
        hasSelectionMask: true,
        transform: {
          offsetX: 4,
          offsetY: 8,
          widthPct: 105,
          heightPct: 105,
          angleDeg: -5,
        },
        filters: [
          { type: "gaussianBlur", params: { radius: 3 } },
          { type: "vibrance", params: { vibrance: 25, saturation: 10 } },
        ],
      },
    ]);

    expect(imported.descriptors.length).toBeGreaterThanOrEqual(5);
    const baseLayer = imported.documentState.layers[0]!;
    expect(baseLayer.blendMode).toBe("plus");
    expect(baseLayer.hasRevealSelectionMask).toBe(true);
    expect(baseLayer.gaussianBlurRadiusPx).toBe(3);

    const lastLayer =
      imported.documentState.layers[imported.documentState.layers.length - 1]!;
    expect(lastLayer.kind).toBe("layerSection");
    expect(lastLayer.name).toBe("Foreground Hero Group");
  });
});
