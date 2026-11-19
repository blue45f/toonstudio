import { describe, expect, it } from "vitest";

import {
  applyPinchMergeLayers,
  applySlideLayerOpacity,
  applySwipeLayerRow,
  toggleLayerTrioFlag,
  type LayerTrioState,
} from "./studio-layer-trio-gestures";

function sampleLayers(): LayerTrioState[] {
  return [
    { id: "bg", name: "배경", visible: true, locked: false, selected: false, opacity: 1, clippingMask: false, alphaLock: false, reference: false },
    { id: "line", name: "선화", visible: true, locked: false, selected: true, opacity: 1, clippingMask: false, alphaLock: false, reference: true },
    { id: "color", name: "밑색", visible: true, locked: false, selected: false, opacity: 0.8, clippingMask: false, alphaLock: false, reference: false },
  ];
}

describe("studio-layer-trio-gestures (AC-016 T9)", () => {
  it("Reference는 단일 소유를 유지하고 최하단 레이어에는 Clipping Mask를 금지한다", () => {
    const initial = sampleLayers();
    expect(toggleLayerTrioFlag(initial, "bg", "clippingMask")[0]?.clippingMask).toBe(false);

    const clipped = toggleLayerTrioFlag(initial, "color", "clippingMask");
    expect(clipped[2]?.clippingMask).toBe(true);

    const refMoved = toggleLayerTrioFlag(clipped, "color", "reference");
    expect(refMoved[1]?.reference).toBe(false);
    expect(refMoved[2]?.reference).toBe(true);
  });

  it("핀치 병합, 2핑거 슬라이드 불투명도, 좌/우 스와이프 잠금·선택이 정확히 동작한다", () => {
    const initial = sampleLayers();

    const opacityRes = applySlideLayerOpacity(initial, "color", -60, 200);
    expect(opacityRes.kind).toBe("opacity-changed");
    if (opacityRes.kind === "opacity-changed") {
      expect(opacityRes.opacity).toBe(0.5);
    }

    const lockedRes = applySwipeLayerRow(initial, "line", "left-lock");
    expect(lockedRes.kind).toBe("toggled-lock");
    // 잠긴 레이어가 포함된 범위는 핀치 병합을 안전하게 거부한다
    expect(applyPinchMergeLayers(lockedRes.layers, 0, 2).kind).toBe("noop");

    const mergedRes = applyPinchMergeLayers(initial, 1, 2);
    expect(mergedRes.kind).toBe("merged");
    if (mergedRes.kind === "merged") {
      expect(mergedRes.targetLayerId).toBe("line");
      expect(mergedRes.mergedIds).toEqual(["color"]);
      expect(mergedRes.layers.map((l) => l.id)).toEqual(["bg", "line"]);
    }
  });
});
